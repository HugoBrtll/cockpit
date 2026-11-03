"""Script du soir du cockpit : aucune donnée Strava, aucune IA.

Source : Garmin via intervals.icu. Résultat : data.json et garmin.json dans le dossier Drive Cockpit,
puis envoi des séances de plan.json sur la montre (intervals.icu -> Garmin).

    python run.py                  avec Drive (variables IV_KEY, IV_ATHLETE, DRIVE_FOLDER_ID, GOOGLE_SA_JSON)
    python run.py --local DOSSIER  avec un dossier local, pour les essais

Fichiers lus : base_garmin_export.json, config.json, etat_iv.json, etat_traces.json, plan.json, historique.json (facultatif).
Fichiers écrits : data.json, garmin.json, etat_iv.json, etat_traces.json.
"""
import contextlib
import io
import json
import math
import os
import sys
import tempfile
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import garmin_est
import plan_tools
from plan_tools import iv_req
from stores import open_store

PARIS = ZoneInfo("Europe/Paris")
BASE = "https://intervals.icu/api/v1"
DIST = [("400 m", 400), ("1 km", 1000), ("Mile", 1609.34), ("3 km", 3000), ("5 km", 5000), ("10 km", 10000),
        ("15 km", 15000), ("Semi", 21097.5)]
RECENT = ("1 km", "Mile", "5 km", "10 km")


def load_json(store, name, default=None):
    raw = store.get(name)
    return json.loads(raw.decode("utf-8")) if raw else default


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


# ---------- traces et meilleurs efforts ----------
def simplify(pts, tol=0.00006, maxpts=260):
    """Douglas-Peucker itératif ; tol en degrés (≈ 6 m), élargi si la trace reste trop longue."""
    if len(pts) < 3:
        return pts
    while True:
        keep = [False] * len(pts)
        keep[0] = keep[-1] = True
        stack = [(0, len(pts) - 1)]
        k = math.cos(math.radians(pts[0][0]))
        while stack:
            a, b = stack.pop()
            ax, ay = pts[a][1] * k, pts[a][0]
            bx, by = pts[b][1] * k, pts[b][0]
            dx, dy = bx - ax, by - ay
            n = math.hypot(dx, dy) or 1e-12
            best, idx = -1.0, None
            for i in range(a + 1, b):
                d = abs((pts[i][1] * k - ax) * dy - (pts[i][0] - ay) * dx) / n
                if d > best:
                    best, idx = d, i
            if idx is not None and best > tol:
                keep[idx] = True
                stack += [(a, idx), (idx, b)]
        out = [p for p, ok in zip(pts, keep) if ok]
        if len(out) <= maxpts:
            return out
        tol *= 1.5


def encode(pts):
    """Polyline Google (précision 5), le format attendu par la page."""
    def one(v):
        v = ~(v << 1) if v < 0 else v << 1
        s = ""
        while v >= 0x20:
            s += chr((0x20 | (v & 0x1f)) + 63)
            v >>= 5
        return s + chr(v + 63)
    out, la0, lo0 = "", 0, 0
    for la, lo in pts:
        a, b = round(la * 1e5), round(lo * 1e5)
        out += one(a - la0) + one(b - lo0)
        la0, lo0 = a, b
    return out


def best_efforts(t, d):
    """Temps le plus court sur chaque distance, par fenêtre glissante sur la distance de la montre."""
    pts = [(x, y) for x, y in zip(t, d) if x is not None and y is not None]
    if len(pts) < 10:
        return {}
    res = {}
    for label, m in DIST:
        if pts[-1][1] - pts[0][1] < m:
            continue
        best, i = None, 0
        for j in range(len(pts)):
            while pts[j][1] - pts[i + 1][1] >= m:
                i += 1
            span = pts[j][1] - pts[i][1]
            if span < m or span <= 0:
                continue
            sec = (pts[j][0] - pts[i][0]) * m / span
            if sec / m * 1000 < 165:  # plus rapide que 2:45/km : saut de GPS
                continue
            if best is None or sec < best:
                best = sec
        if best:
            res[label] = round(best)
    return res


def nearest(lat, lon, lieux):
    best, name = 40.0, ""
    k = math.cos(math.radians(lat))
    for p in lieux:
        km = math.hypot((p["lat"] - lat) * 111.3, (p["lon"] - lon) * 111.3 * k)
        if km < best:
            best, name = km, p["n"]
    return name


def trace_of(aid, typ, key, lieux):
    s = iv_req("GET", f"{BASE}/activity/{aid}/streams?types=latlng,time,distance", key) or []
    by = {x["type"]: x for x in s}
    ll = by.get("latlng") or {}
    lat, lon = ll.get("data") or [], ll.get("data2") or []
    pts = [(a, b) for a, b in zip(lat, lon) if a is not None and b is not None and (a or b)]
    out = {"poly": encode(simplify(pts)) if len(pts) > 1 else "", "loc": nearest(*pts[0], lieux) if pts else "", "be": {}}
    if typ in ("Run", "TrailRun") and by.get("time") and by.get("distance"):
        out["be"] = best_efforts(by["time"].get("data") or [], by["distance"].get("data") or [])
    return out


# ---------- construction de data.json ----------
def row(a, tr):
    typ = a.get("type") or "Workout"
    run = typ in ("Run", "TrailRun")
    cad = a.get("average_cadence")
    return [a["id"], (a.get("start_date_local") or "")[:16], typ, (a.get("name") or typ).strip(), (a.get("description") or "").strip(),
            round((a.get("distance") or 0) / 1000, 2), a.get("moving_time") or 0, a.get("elapsed_time") or 0,
            round(a.get("total_elevation_gain") or 0), a.get("icu_training_load"), a.get("calories"),
            (round(cad * 2) if run else round(cad)) if cad else None, 0, 0, None, tr.get("loc") or "", tr.get("poly") or "",
            round(a["average_temp"]) if a.get("average_temp") is not None else None, None, 1 if a.get("race") else 0,
            round((a.get("max_speed") or 0) * 3.6, 1)]


def streak(days, today):
    weeks = {date.fromisoformat(d) - timedelta(days=date.fromisoformat(d).weekday()) for d in days}
    w = today - timedelta(days=today.weekday())
    if w not in weeks:
        w -= timedelta(days=7)
    n = 0
    while w in weeks:
        n += 1
        w -= timedelta(days=7)
    return n


def build_data(acts, traces, hist, wellness, garmin, cfg, today):
    # l'historique garde ce qu'intervals.icu n'a pas (avant son début, sorties Zwift) ; à la minute près, intervals.icu prime
    iv_min = set()
    for a in acts:
        t = datetime.fromisoformat((a.get("start_date_local") or "2000-01-01T00:00:00")[:16])
        iv_min |= {(t + timedelta(minutes=k)).strftime("%Y-%m-%dT%H:%M") for k in (-1, 0, 1)}
    rows = [r for r in hist.get("rows", []) if r[1] not in iv_min]
    rows += [row(a, traces.get(a["id"], {})) for a in acts]
    rows.sort(key=lambda r: r[1])
    eff = list(hist.get("efforts", []))  # [libellé, secondes, date, id]
    for a in acts:
        for k, s in (traces.get(a["id"], {}).get("be") or {}).items():
            eff.append([k, s, (a.get("start_date_local") or "")[:10], a["id"]])
    meters = dict(DIST)
    best, recent, pr_year = [], [], {"5 km": {}, "10 km": {}}
    lim = (today - timedelta(days=60)).isoformat()
    for label, m in DIST:
        cur = [e for e in eff if e[0] == label and e[1] / m * 1000 >= 167]  # en dessous de 2:47/km : saut de GPS
        if cur:
            b = min(cur, key=lambda e: e[1])
            best.append({"k": label, "m": m, "s": b[1], "d": b[2], "id": b[3], "hot": 1 if label in ("5 km", "10 km") else 0})
        rec = [e for e in cur if e[2] >= lim]
        if rec and label in RECENT:
            b = min(rec, key=lambda e: e[1])
            recent.append({"k": label, "m": meters[label], "s": b[1], "d": b[2], "id": b[3]})
        if label in pr_year:
            for e in cur:
                y = e[2][:4]
                if y not in pr_year[label] or e[1] < pr_year[label][y]:
                    pr_year[label][y] = e[1]
    well = []
    for r in sorted(wellness, key=lambda r: r.get("id") or ""):
        if r.get("id") and (r.get("hrv") or r.get("restingHR") or r.get("sleepSecs") or r.get("steps")):
            well.append([r["id"], round(r["hrv"], 1) if r.get("hrv") else None, r.get("restingHR"), r.get("sleepSecs"),
                         r.get("sleepScore"), r.get("avgSleepingHR"), r.get("steps"), r.get("weight"), r.get("spO2"),
                         r.get("respiration"), r.get("readiness")])
    p = garmin["pred"][-1]  # [date, 5 km, 10 km, semi, marathon]
    s5 = p[1]
    v5 = 5000 / s5
    run_zones = [[0, round(v5 * .71, 3)]] + [[round(v5 * a, 3), round(v5 * b, 3)] for a, b in ((.71, .83), (.83, .92), (.92, .99), (.99, 1.05))] + [[round(v5 * 1.05, 3), None]]
    hrm = cfg.get("hrmax", 207)
    z = [round(hrm * x) for x in (.64, .80, .88, .96)]
    hr_zones = [[0, z[0]], [z[0] + 1, z[1]], [z[1] + 1, z[2]], [z[2] + 1, z[3]], [z[3] + 1, None]]
    ph, last = [], None
    for q in garmin["pred"]:
        if q[0] < (today - timedelta(days=400)).isoformat():
            continue
        if last is None or (date.fromisoformat(q[0]) - last).days >= 7:
            ph.append([q[0], q[1]])
            last = date.fromisoformat(q[0])
    if ph[-1][0] != p[0]:
        ph.append([p[0], p[1]])
    snap = datetime.now(PARIS).strftime("%Y-%m-%dT%H:%M")
    meta = {"snap": snap, "streak": streak([r[1][:10] for r in rows] + cfg.get("jours_actifs_en_plus", []), today), "best": best, "pr_year": pr_year,
            "run_zones": run_zones, "hr_zones": hr_zones, "shoes": cfg.get("chaussures", []), "bikes": cfg.get("velos", []),
            "bike_pr": cfg.get("records_velo", []), "climb": None, "est5k": s5, "pred_hist": ph,
            "pred_cal": {"pts": [[5000, 1], [10000, p[2] / s5], [21097.5, p[3] / s5], [42195, p[4] / s5]]},
            "recent": recent, "well": well, "owner": cfg.get("owner", ""), "ville": cfg.get("ville", ""),
            "lieux_alternance": cfg.get("lieux_alternance", {})}
    return {"acts": rows, "meta": meta}


def quiet(local):
    """Les journaux GitHub d'un dépôt public sont lisibles par tous : on n'y met aucun chiffre personnel."""
    return contextlib.nullcontext() if local else contextlib.redirect_stdout(io.StringIO())


def main():
    local = sys.argv[sys.argv.index("--local") + 1] if "--local" in sys.argv else None
    key, athlete = os.environ["IV_KEY"], os.environ["IV_ATHLETE"]
    store = open_store(local)
    today = datetime.now(PARIS).date()
    cfg = load_json(store, "config.json", {})
    lieux = cfg.get("lieux", [])
    export = store.get("base_garmin_export.json")
    if not export:
        raise SystemExit("base_garmin_export.json manque dans Drive.")
    iv_cache = load_json(store, "etat_iv.json", {})
    traces = load_json(store, "etat_traces.json", {})
    hist = load_json(store, "historique.json", {})
    plan = load_json(store, "plan.json")
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(f"{tmp}/in/pages")
        open(f"{tmp}/garmin_export.json", "wb").write(export)
        json.dump(iv_cache, open(f"{tmp}/etat_iv.json", "w"))
        json.dump({"_export_until": json.loads(export)["until"]}, open(f"{tmp}/laps.json", "w"))
        keyfile = f"{tmp}/key"
        open(keyfile, "w").write(key)
        acts = iv_req("GET", f"{BASE}/athlete/{athlete}/activities?oldest=2025-01-01&newest={(today + timedelta(1)).isoformat()}", key) or []
        new = [a for a in acts if a["id"] not in traces]
        for i, a in enumerate(new, 1):
            traces[a["id"]] = trace_of(a["id"], a.get("type"), key, lieux)
            if i % 25 == 0:
                print(f"{i}/{len(new)} traces", flush=True)
        with quiet(local):
            garmin_est.ivsync(f"{tmp}/etat_iv.json", keyfile, athlete)
        lo = (today - timedelta(days=365)).isoformat()
        wellness = iv_req("GET", f"{BASE}/athlete/{athlete}/wellness?oldest={lo}&newest={today.isoformat()}", key) or []
        json.dump(wellness, open(f"{tmp}/in/wellness.json", "w"))
        # garmin_est lit le format de ses pages d'activités : on le lui donne à partir d'intervals.icu
        pages = [{"id": a["id"], "start_local": a.get("start_date_local") or "", "sport_type": a.get("type") or "Workout",
                  "summary": {"moving_time": a.get("moving_time") or 0, "total_calories": a.get("calories") or 0,
                              "relative_effort": None}} for a in acts]
        json.dump({"activities": pages}, open(f"{tmp}/in/pages/p1.json", "w"))
        with quiet(local):
            garmin_est.build(f"{tmp}/in", f"{tmp}/laps.json", f"{tmp}/garmin_export.json", f"{tmp}/g.js", f"{tmp}/etat_iv.json")
        raw = open(f"{tmp}/g.js", encoding="utf-8").read()
        garmin = json.loads(raw[len("window.GARMIN="):].rstrip().rstrip(";"))
        iv_cache = json.load(open(f"{tmp}/etat_iv.json"))
    data = build_data(acts, traces, hist, wellness, garmin, cfg, today)
    if len(data["acts"]) < 10:
        raise SystemExit("Trop peu d'activités : rien n'est écrit.")
    store.put("garmin.json", dump(garmin))
    store.put("data.json", dump(data))
    store.put("etat_iv.json", dump(iv_cache))
    store.put("etat_traces.json", dump(traces))
    print("OK : données écrites dans Drive")
    if plan and "--no-sync" not in sys.argv:
        errs = plan_tools.check(plan)
        if errs:
            raise SystemExit("plan.json invalide :\n" + "\n".join(errs))
        with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as f:
            json.dump(plan, f, ensure_ascii=False)
        with quiet(local):
            plan_tools.sync(f.name, athlete, key)
        print("OK : plan envoyé")


if __name__ == "__main__":
    main()
