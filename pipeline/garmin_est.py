"""Prolonge chaque soir les données Garmin du cockpit (garmin.js) après le dernier export Garmin,
en recalculant ce que la montre ne transmet pas à intervals.icu, avec des formules recalées sur l'historique
Garmin (export du 31/10/2026, 4 ans de données).

  python3 garmin_est.py ivsync <act_iv.json> <fichier_cle> <athlete_id>
        -> analyse les courbes de FC complètes des activités Garmin reçues par intervals.icu (méthode principale)
  python3 garmin_est.py need  <dossier_entrees> <act_laps.json> [act_iv.json]
        -> liste les activités Strava postérieures à l'export absentes d'intervals.icu et sans tours (secours)
  python3 garmin_est.py add   <act_laps.json> <dossier_entrees> <fichier_tours.json> [...]
        -> ajoute au cache les tours d'activités (format compact ci-dessous)
  python3 garmin_est.py build <dossier_entrees> <act_laps.json> <garmin_export.json> <sortie garmin.js> [act_iv.json]

<dossier_entrees> : le même que build.py (pages/*.json de list_activities, wellness.json d'intervals.icu).
Format d'un fichier de tours (une réponse get_activity_performance résumée) :
  {"id":"123","has_hr":true,"avg_hr":148.2,"max_hr":182,"cal":581,
   "laps":[[moving_time, elapsed_time, distance, avg_hr, max_hr, avg_speed, avg_grade, elevation_gain], ...]}

Méthode principale (01/11/2026) : courbe de FC complète de chaque activité via intervals.icu, voir iv_features
(charge : erreur médiane ≈ 10 %, fractionnés courts compris grâce à l'allure sur 30 s). Secours si l'activité manque dans
intervals.icu : tours Strava (ci-dessous), puis effort relatif Strava.
Méthodes de secours et agrégats (calibrés le 01/11/2026 sur 36 séances appariées Strava / Garmin et 3 ans de charges Garmin) :
- charge d'une séance (≈ EPOC Garmin) = 0,1848 × F^0,8063, F = Σ tours durée(min) × x × e^(6x),
  x = réserve cardiaque (FC_eff − 55) / (207 − 55), FC_eff = FCmoy + 0,4 × (FCmax − FCmoy) du tour.
  Erreur médiane 10,6 % (validation croisée). Sans fréquence cardiaque : 4,47 × effort relatif^0,786.
- charge aiguë = somme décroissante (τ 4,3 j) × 1,432 ; chronique = moyenne exponentielle (τ 13 j) de l'aiguë × 1,026.
  Erreurs médianes 8 % et 7 %. Ratio : < 0,8 faible, 0,8–1,5 optimal, 1,5–2 élevé, > 2 très élevé.
- focus : course, FC_eff ≥ 192 ou tour ≤ 600 m à ≥ 4,4 m/s -> anaérobie, ≥ 166 -> aérobie élevé ;
  vélo : < 152 aérobie faible, sinon élevé, part anaérobie selon le pic de FC au-delà de 178.
- VO2max : par tour stable (≥ 150 s, pente < 4 %, 60–95 % de réserve), VO2 de course ACSM / % de réserve (Swain),
  médiane pondérée par séance, moyenne exponentielle (τ 45 j), variation amortie (× 0,45) depuis la dernière valeur Garmin
  (export, ou VO2max réel reçu par intervals.icu, qui prime dès qu'il arrive).
- prédictions : dernières prédictions Garmin déplacées selon le VO2max et la charge chronique (tables de Daniels).
- statut : règles déduites de 3 ans de statuts Garmin (67 % de jours identiques).
- dépense du jour = 1928 + 138 + 0,033 × pas + 0,302 × kcal des activités ; Body Battery max (matin) =
  168 + 1,745 × sommeil(h) + 0,695 × score − 2,756 × FC repos − 0,028 × charge de la veille (±6 points).
- non estimés (pas assez fiables ou pas de source) : stress, Body Battery min, phases de sommeil, coucher / réveil.
"""
import glob
import json
import math
import os
import sys
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

REST, HRMAX = 55, 207
TODAY = datetime.now(ZoneInfo("Europe/Paris")).date()


def load(path):
    d = json.load(open(path, encoding="utf-8"))
    if isinstance(d, list) and d and isinstance(d[0], dict) and "text" in d[0]:
        d = json.loads(d[0]["text"])
    return d


def strava_acts(src):
    acts = {}
    for f in glob.glob(os.path.join(src, "pages", "*.json")):
        for a in load(f)["activities"]:
            acts[str(a["id"])] = a
    return acts


def kind(sport):
    if sport in ("Run", "TrailRun", "VirtualRun"):
        return "run"
    if "Ride" in sport:
        return "ride"
    return "other"


GSPORT = {"Run": "running", "TrailRun": "trail_running", "VirtualRun": "treadmill_running", "Ride": "road_biking",
          "VirtualRide": "virtual_ride", "MountainBikeRide": "mountain_biking", "GravelRide": "cycling",
          "EMountainBikeRide": "e_bike_mountain", "Hike": "hiking", "Walk": "walking", "WeightTraining": "strength_training",
          "Swim": "lap_swimming", "AlpineSki": "resort_skiing"}


def x_of(hr):
    return max(0.0, (hr - REST) / (HRMAX - REST))


def eff(l):
    hr, mx = l[3], l[4] or l[3]
    return hr + 0.4 * (mx - hr)


def act_load(laps, re_):
    F = 0.0
    for l in laps or []:
        if l[3] and l[0]:
            x = x_of(eff(l))
            F += l[0] / 60 * x * math.exp(6 * x)
    if F > 0:
        return 0.1848 * F ** 0.8063
    return 4.466 * re_ ** 0.786 if re_ else 0.0


def act_split(laps, k):
    s = [0.0, 0.0, 0.0]
    for l in laps or []:
        t, dist, hr, mx = l[0], l[2], l[3], l[4] or l[3]
        if not hr or not t:
            continue
        h = eff(l)
        x = x_of(h)
        w = t * x * math.exp(6 * x)
        if k == "ride":
            an = min(1.0, max(0.0, (mx - 178) / 30))
            lo = 1 if hr < 152 else 0
            s[0] += w * lo * (1 - an); s[1] += w * (1 - lo) * (1 - an); s[2] += w * an
        else:
            v = dist / t if t else 0
            if h >= 192 or (dist and dist <= 600 and v >= 4.4):
                s[2] += w
            elif h >= 166:
                s[1] += w
            else:
                s[0] += w
    T = sum(s)
    return [x / T for x in s] if T else [1.0, 0.0, 0.0]


def vo2_run(laps):
    est, w = [], []
    for l in laps or []:
        t, el, dist, hr = l[0], l[1], l[2], l[3]
        if not hr or not t or t < 150 or dist < 300:
            continue
        v = dist / t * 60
        g = (l[6] or 0) / 100
        if abs(g) > 0.04 or v < 150:
            continue
        x = (hr - REST) / (HRMAX - REST)
        if x < 0.6 or x > 0.95:
            continue
        vo2 = 3.5 + 0.2 * v + 0.9 * v * g
        e = 3.5 + (vo2 - 3.5) / x
        if 40 <= e <= 75:
            est.append(e); w.append(t * x)
    if not est:
        return None
    o = sorted(range(len(est)), key=lambda i: est[i])
    tot, c = sum(w), 0
    for i in o:
        c += w[i]
        if c >= tot / 2:
            return est[i]


# ---- Daniels : VDOT <-> temps ----
def vo2_of_speed(v):  # v en m/min
    return -4.60 + 0.182258 * v + 0.000104 * v * v


def pct_max(tmin):
    return 0.8 + 0.1894393 * math.exp(-0.012778 * tmin) + 0.2989558 * math.exp(-0.1932605 * tmin)


def vdot(dist, sec):
    t = sec / 60
    return vo2_of_speed(dist / t) / pct_max(t)


def time_for(dist, vd):
    lo, hi = 60.0, 40000.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if vdot(dist, mid) > vd:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def iso(d):
    return d.isoformat()


# ---- courbes de fréquence cardiaque complètes (Garmin -> intervals.icu) ----
# Calibré le 01/11/2026 sur 33 séances appariées intervals.icu / export Garmin (nov. 2025 – oct. 2026) :
# intensité x = max(réserve cardiaque, VO2 de l'allure moyenne sur 30 s / VO2max 57) en course (l'allure capte les
# fractionnés courts où le cœur n'a pas le temps de monter ; la moyenne sur 30 s évite de surcompter les sprints
# du 30/30), réserve cardiaque seule ailleurs ;
# charge = 0,2627 × (Σ dt(min) × x × e^(7x))^0,7077 ; erreur médiane 9,7 % (validation croisée), R² 0,93 ;
# rejoué sur 103 séances (nov. 2025 – oct. 2026) : erreur médiane 10–11 % de nov. à fév. et d'août à oct.,
# mais biais de +17 % au printemps-été 2026 (pas lié à la température : piste à creuser) ; vélo × 1,33.
LOAD_A, LOAD_B = 0.2627, 0.7077


def iv_features(s, typ):
    t = s.get("time") or []
    hr = s.get("heartrate") or []
    if len(t) < 30 or not any(hr):
        return None
    v = s.get("velocity_smooth") or [0] * len(t)
    dist = s.get("distance") or [0] * len(t)
    alt = s.get("fixed_altitude") or s.get("altitude") or [None] * len(t)
    run = kind(typ) == "run"
    F, w3, prev, j = 0.0, [0.0, 0.0, 0.0], t[0], 0
    for i in range(len(t)):
        dt = min(max(t[i] - prev, 0), 10)
        prev = t[i]
        xh = min(max(((hr[i] or 0) - REST) / (HRMAX - REST), 0), 1.1)
        x = xh
        if run:
            while j < i and t[j] < t[i] - 30:
                j += 1
            if t[i] - t[j] >= 24 and dist[i] is not None and dist[j] is not None:
                sp = (dist[i] - dist[j]) / (t[i] - t[j]) * 60
            else:
                sp = (v[i] or 0) * 60
            if sp > 80:
                xs = min(max((-4.60 + 0.182258 * sp + 0.000104 * sp * sp - 3.5) / (57 - 3.5), 0), 1.3)
                x = max(xh, xs)
        w = dt / 60 * x * math.exp(7 * x)
        F += w
        lo, hi = (0.75, 0.92) if run else (0.64, 0.81)
        w3[0 if x < lo else 1 if x < hi else 2] += w
    T = sum(w3) or 1
    out = {"F": round(F, 2), "split": [round(x / T, 3) for x in w3], "vo2": None}
    if run:  # VO2max : fenêtres de 4 min stables (FC ± 6, allure stable, pente < 4 %, 60–92 % de réserve)
        est, n = [], len(t)
        for i in range(0, n, max(1, n // 200)):
            j = i
            while j < n - 1 and t[j] < t[i] + 240:
                j += 1
            if t[j] - t[i] < 240:
                break
            dd = (dist[j] or 0) - (dist[i] or 0)
            T_ = t[j] - t[i]
            if dd < 200:
                continue
            vv = dd / T_ * 60
            seg = [h for h in hr[i:j + 1] if h]
            vs = [(x or 0) * 60 for x in v[i:j + 1]]
            if vv < 150 or len(seg) < 5:
                continue
            m = sum(seg) / len(seg)
            mv = sum(vs) / len(vs)
            if (sum((h - m) ** 2 for h in seg) / len(seg)) ** .5 > 6 or (sum((x - mv) ** 2 for x in vs) / len(vs)) ** .5 > 25:
                continue
            g = ((alt[j] - alt[i]) / dd) if alt[i] is not None and alt[j] is not None else 0
            if abs(g) > 0.04:
                continue
            x = (m - REST) / (HRMAX - REST)
            if x < 0.6 or x > 0.92:
                continue
            est.append(3.5 + (0.2 * vv + 0.9 * vv * g) / x)
        if len(est) >= 3:
            est.sort()
            out["vo2"] = round(est[len(est) // 2], 2)
    return out


def ivsync(cache_path, keyfile, athlete, since="2025-01-01"):
    """Ajoute au cache les caractéristiques (charge, focus, VO2max) des activités intervals.icu pas encore vues."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from plan_tools import iv_req
    key = os.environ.get("IV_KEY") or open(keyfile).read().strip()
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    base = f"https://intervals.icu/api/v1/athlete/{athlete}"
    acts = iv_req("GET", f"{base}/activities?oldest={since}&newest={iso(TODAY + timedelta(1))}", key) or []
    n = 0
    for a in acts:
        i = str(a["id"])
        if i in cache or not a.get("has_heartrate"):
            continue
        s = iv_req("GET", f"https://intervals.icu/api/v1/activity/{i}/streams?types=time,heartrate,velocity_smooth,distance,fixed_altitude,altitude", key) or []
        f = iv_features({x["type"]: x.get("data") for x in s}, a.get("type") or "")
        if f:
            f.update({"start": (a.get("start_date_local") or "")[:16], "type": a.get("type")})
            cache[i] = f
            n += 1
    json.dump(cache, open(cache_path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"OK intervals.icu : {len(acts)} activités, {n} nouvelle(s) analysée(s), {len(cache)} en cache")


def iv_index(iv_path):
    iv = json.load(open(iv_path)) if iv_path and os.path.exists(iv_path) else {}
    return {f["start"]: f for f in iv.values() if f.get("start")}


def need(src, cache_path, iv_path=None):
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    ivx = iv_index(iv_path)
    G_until = cache.get("_export_until", "2026-10-31")
    acts = strava_acts(src)
    todo = [a for a in acts.values() if a["start_local"][:10] > G_until and str(a["id"]) not in cache
            and a["start_local"][:16] not in ivx and (a["summary"].get("moving_time") or 0) >= 600]
    todo.sort(key=lambda a: a["start_local"])
    for a in todo:
        print(f"{a['id']}  {a['start_local'][:16]}  {a['sport_type']}  {a['name'][:40]}")
    print(f"{len(todo)} activité(s) sans tours" if todo else "Aucune activité à compléter")


def add(cache_path, src, files):
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    acts = strava_acts(src)
    n = 0
    for f in files:
        d = json.load(open(f))
        i = str(d["id"])
        a = acts.get(i)
        if not a or d.get("error"):
            print(f"ignoré {i} ({d.get('error') or 'activité inconnue'})")
            continue
        cache[i] = {"d": a["start_local"][:10], "sport": a["sport_type"], "re": a["summary"].get("relative_effort"),
                    "kcal": a["summary"].get("total_calories"), "avg_hr": d.get("avg_hr"), "max_hr": d.get("max_hr"),
                    "laps": d.get("laps") or []}
        n += 1
    json.dump(cache, open(cache_path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"OK : {n} activité(s) ajoutée(s), {sum(1 for k in cache if not k.startswith('_'))} en cache")


def build(src, cache_path, export_path, out, iv_path=None):
    G = json.load(open(export_path))
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    ivx = iv_index(iv_path)
    exp_until = G.get("export_until") or G["until"]
    U = date.fromisoformat(exp_until)
    acts = strava_acts(src)
    ix = {c: i for i, c in enumerate(G["cols"])}

    # --- séances après l'export ---
    new_acts, daily = [], {}
    missing = []
    for a in sorted(acts.values(), key=lambda a: a["start_local"]):
        d = a["start_local"][:10]
        if d <= exp_until:
            continue
        c = cache.get(str(a["id"]))
        f = ivx.get(a["start_local"][:16])
        if not c and not f and (a["summary"].get("moving_time") or 0) >= 600:
            missing.append(str(a["id"]))
        k = kind(a["sport_type"])
        laps = c["laps"] if c else None
        if f:  # courbe de FC complète (intervals.icu) : méthode la plus précise
            ld = LOAD_A * f["F"] ** LOAD_B if f["F"] > 0 else 0.0
            if k == "ride":  # vélo : sous-estimé de 25 % sans correction (10 sorties appariées)
                ld *= 1.33
            sp = f["split"]
        else:
            ld = act_load(laps, a["summary"].get("relative_effort"))
            sp = act_split(laps, k) if laps and any(l[3] for l in laps) else [1.0, 0.0, 0.0]
        lab = "ANAEROBIC_CAPACITY" if sp[2] > 0.45 else "VO2MAX" if sp[2] > 0.3 else \
              "LACTATE_THRESHOLD" if sp[1] > 0.6 else "TEMPO" if sp[1] > 0.3 else "AEROBIC_BASE"
        new_acts.append([d, GSPORT.get(a["sport_type"], "other"), round(ld, 1), None, None, lab,
                         round(a["summary"].get("total_calories") or 0), round(ld * sp[0], 1), round(ld * sp[1], 1),
                         round(ld * sp[2], 1)])
        daily[d] = daily.get(d, 0) + ld

    # --- charge aiguë / chronique ---
    atl = list(G["atl"])
    last = [r for r in atl if r[0] <= exp_until][-1]
    A, E = float(last[1]), float(last[2]) / 1.026
    rows_atl = [r for r in atl if r[0] <= exp_until]
    d = U + timedelta(1)
    while d <= TODAY:
        L = daily.get(iso(d), 0)
        A = A * math.exp(-1 / 4.3) + 1.4316 * L
        E = E + (A - E) / 13
        C = 1.026 * E
        r = A / C if C else 0
        st = "LOW" if r < 0.8 else "OPTIMAL" if r <= 1.5 else "HIGH" if r <= 2.0 else "VERY_HIGH"
        rows_atl.append([iso(d), round(A), round(C), st])
        d += timedelta(1)

    # --- VO2max ---
    # une estimation par sortie : courbe complète intervals.icu si elle existe, sinon tours Strava
    runs = [(f["start"][:10], f["vo2"]) for f in ivx.values() if f.get("vo2") and kind(f.get("type") or "") == "run"]
    iv_starts = set(ivx)
    for i, c in cache.items():
        if i.startswith("_") or kind(c["sport"]) != "run":
            continue
        a = acts.get(i)
        if a and a["start_local"][:16] in iv_starts:
            continue
        v = vo2_run(c["laps"])
        if v:
            runs.append((c["d"], v))
    runs.sort()

    def smooth(day):
        num = den = 0.0
        for dd, v in runs:
            age = (date.fromisoformat(day) - date.fromisoformat(dd)).days
            if 0 <= age <= 135:
                w = math.exp(-age / 45)
                num += w * v; den += w
        return num / den if den else None

    g_vo2 = [r for r in G["vo2"] if r[0] <= exp_until]
    anchor_day, anchor_val = g_vo2[-1]
    raw_anchor = smooth(anchor_day)
    vo2_rows = list(g_vo2)
    vo2_day = {}
    cur = anchor_val
    d = U + timedelta(1)
    run_days = {dd for dd, _ in runs}
    # VO2max réel envoyé par Garmin à intervals.icu (champ vo2max du wellness) : il prime sur l'estimation,
    # et l'estimation repart de cette valeur (nouveau point d'ancrage).
    wp = os.path.join(src, "wellness.json")
    real_vo2 = {r["id"]: r["vo2max"] for r in (load(wp) if os.path.exists(wp) else []) if r.get("id") and r.get("vo2max")}
    base_val, base_raw = anchor_val, raw_anchor
    while d <= TODAY:
        if iso(d) in real_vo2:
            cur = float(real_vo2[iso(d)])
            base_val, base_raw = cur, smooth(iso(d)) or base_raw
            if cur != vo2_rows[-1][1]:
                vo2_rows.append([iso(d), cur])
        elif iso(d) in run_days and smooth(iso(d)) and base_raw:
            # Garmin amortit fortement : gain 0,45 sur la variation de la moyenne lissée (calé sur sept.–oct. 2026)
            cur = round(base_val + 0.45 * (smooth(iso(d)) - base_raw), 1)
            if cur != vo2_rows[-1][1]:
                vo2_rows.append([iso(d), cur])
        vo2_day[iso(d)] = cur
        d += timedelta(1)

    # --- prédictions ---
    gp = [r for r in G["pred"] if r[0] <= exp_until][-1]
    dists = [5000, 10000, 21097.5, 42195]
    vd0 = [vdot(m, t) for m, t in zip(dists, gp[1:])]
    pred_rows = [r for r in G["pred"] if r[0] <= exp_until]
    chron = {r[0]: r[2] for r in rows_atl}
    c0 = chron[exp_until] or 1
    d = U + timedelta(1)
    while d <= TODAY:
        # VDOT Garmin ≈ 1,395 × VO2max + 2,37 × ln(charge chronique) (régression sur 3,5 ans de prédictions Garmin)
        dv = 1.395 * (vo2_day[iso(d)] - anchor_val) + 2.37 * math.log(max(chron[iso(d)], 1) / c0)
        f = (vd0[1] + dv) / vd0[1]
        pred_rows.append([iso(d)] + [round(time_for(m, v * f)) for m, v in zip(dists, vd0)])
        d += timedelta(1)

    # --- statut d'entraînement ---
    vd_all = {}
    v = None
    gv = dict(g_vo2)
    d = date(2022, 1, 1)
    while d <= TODAY:
        v = vo2_day.get(iso(d), gv.get(iso(d), v))
        vd_all[iso(d)] = v
        d += timedelta(1)
    ratio = {r[0]: (r[1] / r[2] if r[2] else 0) for r in rows_atl}
    status = [r for r in G["status"] if r[0] <= exp_until]
    st_last = None
    d = U + timedelta(1)
    while d <= TODAY:
        r = ratio.get(iso(d), 0)
        r7 = max(ratio.get(iso(d - timedelta(k)), 0) for k in range(7))
        dv = (vd_all[iso(d)] or 0) - (vd_all.get(iso(d - timedelta(21))) or 0)
        C = next(x[2] for x in rows_atl if x[0] == iso(d))
        if r >= 2.0:
            s = "OVERREACHING"
        elif r7 < 0.4:
            s = "DETRAINING"
        elif r < 0.7:
            s = "PEAKING" if dv >= 0.5 and r >= 0.5 and C >= 600 else "RECOVERY"
        elif dv <= -0.5:
            s = "UNPRODUCTIVE"
        elif r >= 1.2 or dv >= 0.5:
            s = "PRODUCTIVE"
        else:
            s = "MAINTAINING"
        if s != status[-1][1]:
            status.append([iso(d), s])
        st_last = [iso(d), s]
        d += timedelta(1)

    # --- jours : récupération intervals.icu + dépense + Body Battery estimés ---
    well = {r["id"]: r for r in (load(os.path.join(src, "wellness.json")) if os.path.exists(os.path.join(src, "wellness.json")) else []) if r.get("id")}
    akcal = {}
    for a in acts.values():
        dd = a["start_local"][:10]
        akcal[dd] = akcal.get(dd, 0) + (a["summary"].get("total_calories") or 0)
    gdaily = {}
    for r in G["acts"]:
        if r[0] <= exp_until:
            gdaily[r[0]] = gdaily.get(r[0], 0) + r[2]
    gdaily.update(daily)
    days = [list(r) for r in G["days"] if r[0] <= exp_until]
    byd = {r[0]: r for r in days}
    d = U
    while d <= TODAY:
        k = iso(d)
        w = well.get(k, {})
        r = byd.get(k)
        if r is None:
            r = [k] + [None] * (len(G["cols"]) - 1)
            days.append(r); byd[k] = r
        fill = (lambda c, v: r.__setitem__(ix[c], v) if r[ix[c]] is None and v is not None else None)
        fill("rhr", w.get("restingHR")); fill("sleep", w.get("sleepSecs"))
        fill("score", round(w["sleepScore"]) if w.get("sleepScore") else None)
        fill("resp", w.get("respiration")); fill("steps", w.get("steps"))
        if d < TODAY and r[ix["steps"]] and r[ix["kcal"]] is None:
            act = 138 + 0.033 * r[ix["steps"]] + 0.302 * akcal.get(k, 0)
            r[ix["kcalAct"]] = round(act); r[ix["kcal"]] = round(1928 + act)
        if r[ix["bbmax"]] is None and r[ix["sleep"]] and r[ix["score"]] and r[ix["rhr"]]:
            prev = gdaily.get(iso(d - timedelta(1)), 0)
            bb = 168.04 + 1.745 * r[ix["sleep"]] / 3600 + 0.695 * r[ix["score"]] - 2.756 * r[ix["rhr"]] - 0.028 * prev
            r[ix["bbmax"]] = max(5, min(100, round(bb)))
        d += timedelta(1)
    days.sort(key=lambda r: r[0])

    res = dict(G)
    res.update({"source": "export Garmin Connect, puis estimations du coach", "export_until": exp_until,
                "until": iso(TODAY), "est_from": iso(U + timedelta(1)), "days": days, "atl": rows_atl,
                "vo2": vo2_rows, "pred": pred_rows, "status": status,
                "status_last": st_last or G.get("status_last"),
                "acts": [r for r in G["acts"] if r[0] <= exp_until] + new_acts})
    open(out, "w", encoding="utf-8").write("window.GARMIN=" + json.dumps(res, ensure_ascii=False, separators=(",", ":")) + ";\n")
    a_ = rows_atl[-1]
    print(f"OK garmin.js : estimé du {res['est_from']} au {res['until']} | charge aiguë {a_[1]} chronique {a_[2]} ({a_[3]}) | "
          f"statut {res['status_last'][1]} | VO2max {vo2_rows[-1][1]} | 10 km {pred_rows[-1][2] // 60}:{pred_rows[-1][2] % 60:02d} | "
          f"{len(new_acts)} séance(s) depuis l'export")
    if missing:
        print("TOURS MANQUANTS (charge estimée sans FC) : " + ", ".join(missing))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "ivsync":
        ivsync(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "need":
        need(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    elif cmd == "add":
        add(sys.argv[2], sys.argv[3], sys.argv[4:])
    elif cmd == "build":
        build(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6] if len(sys.argv) > 6 else None)
    else:
        sys.exit(__doc__)
