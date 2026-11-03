/* Démarrage de l'appli : tes données restent dans Google Drive, ici il n'y a qu'une copie locale pour le hors-ligne. */
(function () {
  const CFG = window.COCKPIT;
  const SCOPE = "https://www.googleapis.com/auth/drive";
  const API = "https://www.googleapis.com/drive/v3/files";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  const NEEDED = ["data.json", "garmin.json", "plan.json", "races.json"];
  const DBFILE = { sante_poids: "poids.json", sante_tension: "tension.json" };
  let token = null, tokenUntil = 0, pendingToken = null, tc = null;

  /* ---------- copie locale (IndexedDB) ---------- */
  const idb = new Promise((ok, ko) => {
    const r = indexedDB.open("cockpit", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("files"); r.result.createObjectStore("queue", { autoIncrement: true }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
  async function tx(store, mode, fn) {
    const db = await idb;
    return new Promise((ok, ko) => {
      const t = db.transaction(store, mode), q = fn(t.objectStore(store));
      t.oncomplete = () => ok(q && q.result); t.onerror = () => ko(t.error);
    });
  }
  const cacheGet = (n) => tx("files", "readonly", (s) => s.get(n));
  const cachePut = (n, v) => tx("files", "readwrite", (s) => s.put(v, n));
  const queueAdd = (v) => tx("queue", "readwrite", (s) => s.add(v));
  const queueAll = async () => {
    const db = await idb;
    return new Promise((ok, ko) => {
      const out = [], r = db.transaction("queue").objectStore("queue").openCursor();
      r.onsuccess = () => { const c = r.result; if (c) { out.push({ k: c.key, v: c.value }); c.continue(); } else ok(out); };
      r.onerror = () => ko(r.error);
    });
  };
  const queueDel = (k) => tx("queue", "readwrite", (s) => s.delete(k));

  /* ---------- connexion Google ---------- */
  function hasToken() { return token && Date.now() < tokenUntil - 60000; }
  function client() {
    if (tc) return tc;
    if (!window.google || !google.accounts) throw new Error("gsi");
    tc = google.accounts.oauth2.initTokenClient({
      client_id: CFG.clientId, scope: SCOPE, prompt: "",
      callback: (r) => {
        const p = pendingToken; pendingToken = null;
        if (r.error) { p && p.ko(new Error(r.error)); return; }
        token = r.access_token; tokenUntil = Date.now() + (r.expires_in || 3600) * 1000;
        p && p.ok(token);
      },
      error_callback: (e) => { const p = pendingToken; pendingToken = null; p && p.ko(new Error(e.type || "auth")); },
    });
    return tc;
  }
  function getToken() {
    if (hasToken()) return Promise.resolve(token);
    return new Promise((ok, ko) => { pendingToken = { ok, ko }; try { client().requestAccessToken(); } catch (e) { pendingToken = null; ko(e); } });
  }
  async function drive(url, opt = {}) {
    const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: "Bearer " + token }, opt.headers || {}) }));
    if (r.status === 401) { token = null; throw new Error("auth"); }
    if (!r.ok) throw new Error("drive " + r.status);
    return r;
  }
  async function listFolder() {
    const q = encodeURIComponent(`'${CFG.folderId}' in parents and trashed = false`);
    const r = await drive(`${API}?q=${q}&orderBy=modifiedTime%20desc&pageSize=100&fields=files(id,name,modifiedTime)`);
    const seen = {};
    (await r.json()).files.forEach((f) => { if (!seen[f.name]) seen[f.name] = f; });
    return seen;
  }
  const download = async (id) => (await drive(`${API}/${id}?alt=media`)).text();

  /* ---------- synchronisation ---------- */
  async function refresh() {
    const files = await listFolder();
    let changed = false;
    for (const n of NEEDED.concat(Object.values(DBFILE))) {
      const f = files[n];
      if (!f) continue;
      const c = await cacheGet(n);
      if (c && c.modifiedTime === f.modifiedTime) continue;
      await cachePut(n, { modifiedTime: f.modifiedTime, text: await download(f.id) });
      if (NEEDED.includes(n)) changed = true;
    }
    await flushQueue(files);
    await emitAll();
    return changed;
  }
  async function loadWindow() {
    const c = {};
    for (const n of NEEDED) { c[n] = await cacheGet(n); if (!c[n]) return false; }
    window.CK = JSON.parse(c["data.json"].text);
    window.GARMIN = JSON.parse(c["garmin.json"].text);
    window.PLAN_DATA = JSON.parse(c["plan.json"].text);
    window.RACES = JSON.parse(c["races.json"].text);
    return !!(window.CK.acts && window.CK.acts.length);
  }
  function launch() {
    const s = document.createElement("script"); s.src = "app.js";
    s.onload = () => { const b = document.createElement("button"); b.className = "btn"; b.style.marginTop = "6px"; b.textContent = "↻ Actualiser depuis Drive"; b.onclick = manual; document.getElementById("sync").after(b); };
    document.body.appendChild(s);
  }

  /* ---------- poids et tension : mêmes appels que la base de l'artefact, stockés dans Drive ---------- */
  const listeners = {};
  async function docsOf(col) {
    const c = await cacheGet(DBFILE[col]);
    const docs = c ? (JSON.parse(c.text).docs || {}) : {};
    for (const { v } of await queueAll()) {
      if (v.col !== col) continue;
      if (v.data === null) delete docs[v.id]; else docs[v.id] = v.data;
    }
    return docs;
  }
  async function emit(col) {
    const docs = await docsOf(col);
    const snap = { metadata: { fromCache: false }, docs: Object.entries(docs).map(([id, d]) => ({ id, data: () => d })) };
    (listeners[col] || []).forEach((f) => f(snap));
  }
  async function emitAll() { for (const c in DBFILE) await emit(c); }
  async function push(item, files) {
    const f = files[DBFILE[item.col]];
    if (!f) throw new Error("absent");
    // relire avant d'écrire : une saisie faite sur l'autre appareil n'est jamais écrasée
    const cur = JSON.parse((await download(f.id)) || '{"docs":{}}');
    cur.docs = cur.docs || {};
    if (item.data === null) delete cur.docs[item.id]; else cur.docs[item.id] = item.data;
    const body = JSON.stringify(cur);
    const r = await drive(`${UPLOAD}/${f.id}?uploadType=media&fields=modifiedTime`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
    await cachePut(DBFILE[item.col], { modifiedTime: (await r.json()).modifiedTime, text: body });
  }
  async function flushQueue(files) {
    for (const { k, v } of await queueAll()) { await push(v, files); await queueDel(k); }
  }
  async function write(col, id, data) {
    await queueAdd({ col, id, data });
    await emit(col);
    try { await getToken(); await flushQueue(await listFolder()); toastBar(false); }
    catch (e) { toastBar(true, "Saisie gardée sur cet appareil : touche pour l'envoyer"); }
    setTimeout(() => emit(col), 0); // après le retour : la page affiche alors son message de confirmation
  }
  window.claude = {
    use: async (n) => n !== "db" ? null : {
      collection: (col) => ({
        onSnapshot(cb) { (listeners[col] = listeners[col] || []).push(cb); emit(col); return () => {}; },
        doc: (id) => ({ set: (d) => write(col, id, d), delete: () => write(col, id, null) }),
      }),
    },
  };

  /* ---------- interface de démarrage ---------- */
  const box = document.getElementById("boot");
  function bootScreen(msg, btn, fn) {
    box.className = "boot on";
    box.innerHTML = `<div><h1>Cockpit running</h1><p class="sub">${msg}</p>${btn ? `<button class="btn primary" id="bootBtn">${btn}</button>` : ""}</div>`;
    if (btn) document.getElementById("bootBtn").onclick = fn;
  }
  let bar = null;
  function toastBar(show, text) {
    if (!show) { if (bar) { bar.remove(); bar = null; } return; }
    if (!bar) { bar = document.createElement("button"); bar.className = "bootbar"; bar.onclick = manual; document.body.appendChild(bar); }
    bar.textContent = text;
  }
  async function manual() {
    try {
      toastBar(true, "Mise à jour…");
      await getToken();
      const changed = await refresh();
      toastBar(false);
      if (changed) location.reload();
    } catch (e) { toastBar(true, navigator.onLine ? "Mise à jour impossible : réessayer" : "Hors ligne : réessayer"); }
  }
  async function first() {
    try {
      bootScreen("Chargement de tes données depuis Google Drive…");
      await getToken();
      await refresh();
      if (await loadWindow()) { box.className = "boot"; launch(); }
      else bootScreen("Le dossier Cockpit ne contient pas encore toutes les données.", "Réessayer", first);
    } catch (e) { bootScreen("Connexion à Google impossible pour l'instant.", "Réessayer", first); }
  }
  async function start() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (await loadWindow()) {
      launch();
      const snap = window.CK.meta.snap || "";
      const age = (Date.now() - new Date(snap).getTime()) / 36e5;
      if (age > 20) toastBar(true, "Actualiser depuis Drive");
      if ((await queueAll()).length) toastBar(true, "Saisie gardée sur cet appareil : touche pour l'envoyer");
    } else bootScreen("Connecte-toi avec ton compte Google pour lire ton dossier Cockpit.", "Se connecter", first);
  }
  start();
  window.addEventListener("online", () => { queueAll().then((q) => { if (q.length) toastBar(true, "Saisie gardée sur cet appareil : touche pour l'envoyer"); }); });
})();
