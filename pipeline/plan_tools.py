"""Outils du plan d'entraînement du cockpit.

  python3 plan_tools.py review <dossier_entrees> <plan.json>   -> bilan prévu / réalisé (texte compact)
  python3 plan_tools.py js <plan.json> <plan.js>               -> fichier chargé par la page (window.PLAN_DATA)
  python3 plan_tools.py check <plan.json>                      -> vérifie la structure du plan
  python3 plan_tools.py sync <plan.json> <athlete_id> <fichier_cle>
                                                               -> envoie les séances à venir (champ iv) vers
                                                                  intervals.icu, qui les pousse sur Garmin
  python3 plan_tools.py wellness <athlete_id> <fichier_cle> <sortie.json>
                                                               -> récupération Garmin (HRV, FC repos, sommeil) via intervals.icu

<dossier_entrees> est le même que pour build.py (pages/*.json de list_activities).
"""
import glob
import json
import os
import sys
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

TYPES = {"ef", "sl", "vma", "seuil", "allure", "test", "renfo", "repos"}


def load(path):
    d = json.load(open(path, encoding="utf-8"))
    if isinstance(d, list) and d and isinstance(d[0], dict) and "text" in d[0]:
        d = json.loads(d[0]["text"])
    return d


def fmt_pace(sec):
    if not sec:
        return "-"
    sec = round(sec)
    return f"{sec // 60}:{sec % 60:02d}"


def check(plan):
    errs = []
    seen = set()
    for wi, w in enumerate(plan.get("weeks", [])):
        for k in ("name", "goal", "items"):
            if k not in w:
                errs.append(f"semaine {wi}: champ {k} manquant")
        for s in w.get("items", []):
            for k in ("d", "t", "title", "km", "pace", "steps", "why"):
                if k not in s:
                    errs.append(f"{s.get('d')}: champ {k} manquant")
            if s.get("t") not in TYPES:
                errs.append(f"{s.get('d')}: type inconnu {s.get('t')}")
            if s.get("d") in seen:
                errs.append(f"{s.get('d')}: deux séances le même jour")
            seen.add(s.get("d"))
            try:
                date.fromisoformat(s.get("d", ""))
            except ValueError:
                errs.append(f"date invalide {s.get('d')}")
    days = sorted(seen)
    if days != [s["d"] for w in plan.get("weeks", []) for s in w.get("items", [])]:
        errs.append("les séances ne sont pas dans l'ordre chronologique")
    return errs


def review(src, plan_path):
    plan = json.load(open(plan_path, encoding="utf-8"))
    acts = {}
    for f in glob.glob(os.path.join(src, "pages", "*.json")):
        for a in load(f)["activities"]:
            acts[a["id"]] = a
    acts = sorted(acts.values(), key=lambda a: a["start_local"])
    today = datetime.now(ZoneInfo("Europe/Paris")).date()
    runs = [a for a in acts if a["sport_type"] in ("Run", "TrailRun")]

    def day(a):
        return a["start_local"][:10]

    # charge (même calcul que la page)
    by = {}
    for a in acts:
        re_ = a["summary"].get("relative_effort")
        if re_:
            by[day(a)] = by.get(day(a), 0) + re_
    d = date.fromisoformat(day(acts[0]))
    ctl = atl = 0.0
    while d <= today:
        v = by.get(d.isoformat(), 0)
        ctl += (v - ctl) / 42
        atl += (v - atl) / 7
        d += timedelta(days=1)
    print(f"AUJOURD'HUI {today.isoformat()} | condition {ctl:.0f} | fatigue {atl:.0f} | fraîcheur {ctl - atl:+.0f}")

    mon = today - timedelta(days=today.weekday())
    wk = []
    for i in range(4, -1, -1):
        a0 = mon - timedelta(days=7 * i)
        a1 = a0 + timedelta(days=6)
        km = sum(r["summary"]["distance"] for r in runs if a0.isoformat() <= day(r) <= a1.isoformat())
        wk.append(f"{a0.strftime('%d/%m')}:{km:.0f}km{'(en cours)' if i == 0 else ''}")
    print("KM COURSE PAR SEMAINE (lundi) : " + "  ".join(wk))
    ws = wellness_summary(src)
    if ws:
        print(ws)

    items = [s for w in plan["weeks"] for s in w["items"]]
    planned_days = {s["d"] for s in items}
    lo = (today - timedelta(days=10)).isoformat()

    def act_line(r):
        s = r["summary"]
        km = s["distance"]
        pace = s.get("avg_pace") or (s["moving_time"] / km if km else None)
        desc = (r.get("description") or "").replace("\n", " / ")[:90]
        return (f"    -> id {r['id']} | {r['name'][:40]} | {km:.1f} km | {fmt_pace(pace)}/km | "
                f"D+ {s.get('elevation_gain') or 0:.0f} | effort {s.get('relative_effort')} | « {desc} »")

    print("\nSÉANCES PRÉVUES DES 10 DERNIERS JOURS (prévu -> réalisé) :")
    for s in items:
        if lo <= s["d"] <= today.isoformat():
            print(f"  {s['d']} [{s['t']}] {s['title']} | prévu {s['km']} km @ {s['pace'] or '-'}"
                  + (f" | déjà ajustée : {s['adj']}" if s.get("adj") else ""))
            done = [r for r in runs if day(r) == s["d"]]
            if done:
                for r in done:
                    print(act_line(r))
            elif s["t"] not in ("repos", "renfo"):
                print("    -> AUCUNE sortie Strava" + (" (la journée n'est peut-être pas finie)" if s["d"] == today.isoformat() else ""))
    extra = [r for r in runs if lo <= day(r) <= today.isoformat() and day(r) not in planned_days]
    if extra:
        print("\nSORTIES HORS PLAN (10 derniers jours) :")
        for r in extra:
            print(f"  {day(r)}")
            print(act_line(r))

    print("\nSÉANCES À VENIR (14 jours) :")
    hi = (today + timedelta(days=14)).isoformat()
    for s in items:
        if today.isoformat() < s["d"] <= hi:
            print(f"  {s['d']} [{s['t']}] {s['title']} | {s['km']} km @ {s['pace'] or '-'}"
                  + (" | ajustée" if s.get("adj") else ""))
    last = items[-1]["d"] if items else today.isoformat()
    left = (date.fromisoformat(last) - today).days
    print(f"\nDERNIÈRE SÉANCE DU PLAN : {last} (dans {left} jours)")
    if left < 15:
        print("-> Moins de 15 jours de plan restants : ajoute la semaine suivante (voir coach.md), "
              "pour que le cockpit montre toujours la semaine en cours et les 2 suivantes.")


def to_js(plan_path, out):
    plan = json.load(open(plan_path, encoding="utf-8"))
    errs = check(plan)
    if errs:
        sys.exit("Plan invalide :\n" + "\n".join(errs))
    payload = json.dumps(plan, ensure_ascii=False, separators=(",", ":"))
    open(out, "w", encoding="utf-8").write("window.PLAN_DATA=" + payload + ";\n")
    n = sum(len(w["items"]) for w in plan["weeks"])
    print(f"OK plan.js : {len(plan['weeks'])} semaines, {n} séances, {len(plan.get('changes', []))} ajustements")


IV_URL = "https://intervals.icu/api/v1/athlete/{a}"


def iv_req(method, url, key, body=None):
    import base64
    import urllib.error
    import urllib.request
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", "cockpit-running-hugo/1.0")
    req.add_header("Accept", "application/json")
    req.add_header("Authorization", "Basic " + base64.b64encode(f"API_KEY:{key}".encode()).decode())
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf-8")
    except urllib.error.HTTPError as ex:
        sys.exit(f"intervals.icu {method} {url.split('/api/')[-1]} : HTTP {ex.code} {ex.read()[:300]!r}")
    return json.loads(raw) if raw.strip() else None


def sync(plan_path, athlete, key):
    """Envoie les séances à venir (champ iv) dans le calendrier intervals.icu, qui les pousse vers Garmin.
    Identifiant stable cockpit-AAAA-MM-JJ : une séance modifiée est mise à jour, une séance retirée est supprimée."""
    plan = json.load(open(plan_path, encoding="utf-8"))
    today = datetime.now(ZoneInfo("Europe/Paris")).date().isoformat()
    items = [s for w in plan["weeks"] for s in w["items"] if s["d"] >= today and s.get("iv")]
    events = [{"category": "WORKOUT", "type": "Run", "start_date_local": s["d"] + "T00:00:00",
               "name": f"{s['d'][8:10]}/{s['d'][5:7]} {s['title']}", "description": s["iv"], "external_id": "cockpit-" + s["d"]} for s in items]
    base = IV_URL.format(a=athlete)
    hi = (date.fromisoformat(today) + timedelta(days=120)).isoformat()
    old = iv_req("GET", f"{base}/events?oldest={today}&newest={hi}&category=WORKOUT", key) or []
    have = {e.get("external_id"): e for e in old if (e.get("external_id") or "").startswith("cockpit-")}
    # n'envoie que les séances nouvelles ou modifiées : pas de renvoi inutile vers Garmin
    todo = [e for e in events if not (e["external_id"] in have
            and have[e["external_id"]].get("name") == e["name"]
            and (have[e["external_id"]].get("description") or "").strip() == e["description"].strip()
            and (have[e["external_id"]].get("start_date_local") or "")[:10] == e["start_date_local"][:10])]
    res = iv_req("POST", base + "/events/bulk?upsert=true", key, todo) if todo else []
    bad = [e.get("name") for e in res or [] if not ((e.get("workout_doc") or {}).get("steps"))]
    keep = {e["external_id"] for e in events}
    gone = [e for xid, e in have.items() if xid not in keep]
    for e in gone:
        iv_req("DELETE", f"{base}/events/{e['id']}", key)
    print(f"OK sync intervals.icu : {len(todo)} séances nouvelles ou modifiées envoyées, "
          f"{len(events) - len(todo)} déjà à jour, {len(gone)} supprimées"
          + (f" ; ÉTAPES NON RECONNUES pour : {', '.join(bad)}" if bad else ""))


def wellness(athlete, key, out, days=365):
    """Télécharge les données de récupération (Garmin -> intervals.icu) des derniers jours, réponse brute."""
    today = datetime.now(ZoneInfo("Europe/Paris")).date()
    lo = (today - timedelta(days=days)).isoformat()
    d = iv_req("GET", IV_URL.format(a=athlete) + f"/wellness?oldest={lo}&newest={today.isoformat()}", key) or []
    json.dump(d, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    n = sum(1 for r in d if r.get("hrv") or r.get("restingHR") or r.get("sleepSecs"))
    print(f"OK wellness : {len(d)} jours, {n} avec HRV / FC repos / sommeil")


def wellness_summary(src):
    p = os.path.join(src, "wellness.json")
    if not os.path.exists(p):
        return None
    rows = sorted([r for r in json.load(open(p, encoding="utf-8")) if r.get("id")], key=lambda r: r["id"])
    def stat(key, n):
        v = [r[key] for r in rows[-n:] if r.get(key)]
        if not v:
            return None, None
        m = sum(v) / len(v)
        sd = (sum((x - m) ** 2 for x in v) / len(v)) ** .5
        return m, sd
    last = {k: next((r for r in reversed(rows) if r.get(k)), None) for k in ("hrv", "restingHR", "sleepSecs")}
    if not any(last.values()):
        return "RÉCUPÉRATION : pas encore de données Garmin (HRV, FC repos, sommeil)."
    parts = []
    if last["hrv"]:
        m7, _ = stat("hrv", 7)
        m60, sd60 = stat("hrv", 60)
        parts.append(f"HRV {last['hrv']['hrv']:.0f} ms le {last['hrv']['id']} (moy 7 j {m7:.0f}, base 60 j {m60:.0f} ± {sd60:.0f})")
    if last["restingHR"]:
        m60, _ = stat("restingHR", 60)
        parts.append(f"FC repos {last['restingHR']['restingHR']} bpm le {last['restingHR']['id']} (base 60 j {m60:.0f})")
    if last["sleepSecs"]:
        r = last["sleepSecs"]
        sc = f", score {r['sleepScore']}" if r.get("sleepScore") else ""
        parts.append(f"sommeil {r['sleepSecs'] // 3600} h {r['sleepSecs'] % 3600 // 60:02d} la nuit du {r['id']}{sc}")
    return "RÉCUPÉRATION : " + " | ".join(parts)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "review":
        review(sys.argv[2], sys.argv[3])
    elif cmd == "js":
        to_js(sys.argv[2], sys.argv[3])
    elif cmd == "sync":
        sync(sys.argv[2], sys.argv[3], os.environ.get("IV_KEY") or open(sys.argv[4]).read().strip())
    elif cmd == "wellness":
        wellness(sys.argv[2], os.environ.get("IV_KEY") or open(sys.argv[3]).read().strip(), sys.argv[4])
    elif cmd == "check":
        e = check(json.load(open(sys.argv[2], encoding="utf-8")))
        print("\n".join(e) if e else "OK")
    else:
        sys.exit(__doc__)
