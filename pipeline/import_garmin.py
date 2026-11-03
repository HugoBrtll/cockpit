"""Crée historique.json à partir d'un export complet de compte Garmin.

    python import_garmin.py <dossier_export_extrait> <sortie historique.json> <config.json>

Le dossier contient *summarizedActivities.json et UploadedFiles_*.zip (fichiers FIT).
Résultat : {"rows": [...], "efforts": [[libellé, secondes, date, id], ...]}, lu par run.py.
Les villes rencontrées complètent "lieux" dans config.json.
"""
import glob
import io
import json
import os
import struct
import sys
import zipfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import best_efforts, encode, simplify

FIT_EPOCH = 631065600
# la charge Garmin vaut environ 2,7 fois la charge intervals.icu (médiane sur 146 courses communes) : on aligne les deux échelles
SPORT = {"running": "Run", "treadmill_running": "Run", "trail_running": "TrailRun", "road_biking": "Ride", "cycling": "Ride",
         "gravel_cycling": "Ride", "virtual_ride": "VirtualRide", "indoor_cycling": "VirtualRide", "mountain_biking": "MountainBikeRide",
         "e_bike_mountain": "EMountainBikeRide", "hiking": "Hike", "walking": "Walk", "strength_training": "WeightTraining",
         "hiit": "HighIntensityIntervalTraining", "resort_skiing": "AlpineSki", "resort_skiing_snowboarding_ws": "AlpineSki",
         "lap_swimming": "Swim", "open_water_swimming": "Swim", "paddelball": "Padel", "kayaking_v2": "Kayaking", "other": "Workout"}
FMT = {0: "B", 1: "b", 2: "B", 3: "h", 4: "H", 5: "i", 6: "I", 10: "B", 11: "H", 12: "I"}
BAD = {"B": 0xFF, "H": 0xFFFF, "I": 0xFFFFFFFF, "i": 0x7FFFFFFF, "h": 0x7FFF, "b": 0x7F}
WANT = {0: {0}, 18: {2}, 20: {253, 0, 1, 5}}  # file_id.type, session.start_time, record


def fit_activity(b):
    """Renvoie (début en secondes unix, [(t, lat, lon, distance)]) pour un fichier d'activité, sinon None."""
    if len(b) < 14 or b[8:12] != b".FIT":
        return None
    pos, end = b[0], b[0] + struct.unpack("<I", b[4:8])[0]
    end = min(end, len(b))
    defs, start, recs, last = {}, None, [], None
    while pos < end:
        h = b[pos]
        pos += 1
        comp = h & 0x80
        if comp:
            loc, off = (h >> 5) & 3, h & 0x1f
        elif h & 0x40:
            dev, loc = h & 0x20, h & 0xf
            order = ">" if b[pos + 1] else "<"
            gmn = struct.unpack(order + "H", b[pos + 2:pos + 4])[0]
            n = b[pos + 4]
            pos += 5
            fields, size = [], 0
            for i in range(n):
                num, s, base = b[pos], b[pos + 1], b[pos + 2]
                pos += 3
                fields.append((num, s, base & 0x1f, size))
                size += s
            if dev:
                nd = b[pos]
                pos += 1
                for i in range(nd):
                    size += b[pos + 1]
                    pos += 3
            want = WANT.get(gmn, ())
            defs[loc] = (gmn, order, size, [f for f in fields if f[0] in want])
            continue
        else:
            loc = h & 0xf
        if loc not in defs:
            return None
        gmn, order, size, fields = defs[loc]
        v = {}
        for num, s, base, at in fields:
            f = FMT.get(base)
            if f and struct.calcsize(f) == s:
                x = struct.unpack_from(order + f, b, pos + at)[0]
                v[num] = None if x == BAD[f] else x
        pos += size
        if gmn == 0:
            if v.get(0) != 4:
                return None
        elif gmn == 18:
            if start is None and v.get(2):
                start = v[2] + FIT_EPOCH
        elif gmn == 20:
            t = v.get(253)
            if t is None and comp and last is not None:
                t = (last & ~0x1f) + off + (0x20 if off < (last & 0x1f) else 0)
            if t is not None:
                last = t
            la, lo = v.get(0), v.get(1)
            recs.append((t, la * 180 / 2 ** 31 if la is not None else None, lo * 180 / 2 ** 31 if lo is not None else None,
                         v[5] / 100 if v.get(5) is not None else None))
    if start is None and recs and recs[0][0]:
        start = recs[0][0] + FIT_EPOCH
    return (start, recs) if start else None


def main():
    src, out, cfg_path = sys.argv[1:4]
    acts = []
    for p in glob.glob(os.path.join(src, "**", "*summarizedActivities.json"), recursive=True):
        acts += json.load(open(p, encoding="utf-8"))[0]["summarizedActivitiesExport"]
    by_gmt = {round(a["startTimeGmt"] / 1000): a for a in acts if a.get("startTimeGmt")}
    keys = sorted(by_gmt)
    fits, seen = {}, 0
    for p in sorted(glob.glob(os.path.join(src, "**", "UploadedFiles*.zip"), recursive=True)):
        z = zipfile.ZipFile(p)
        for n in z.namelist():
            if not n.lower().endswith(".fit"):
                continue
            seen += 1
            try:
                r = fit_activity(z.read(n))
            except (struct.error, IndexError):
                r = None
            if not r:
                continue
            s = r[0]
            for d in range(0, 181):
                k = s + d if s + d in by_gmt else s - d if s - d in by_gmt else None
                if k is not None:
                    if len(r[1]) > len(fits.get(k, [])):
                        fits[k] = r[1]
                    break
    rows, efforts, places = [], [], {}
    for k, a in sorted(by_gmt.items()):
        typ = SPORT.get(a.get("activityType"), "Workout")
        run = typ in ("Run", "TrailRun")
        dt = datetime.fromtimestamp(a["startTimeLocal"] / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%M")
        aid = str(a["activityId"])
        recs = fits.get(k, [])
        pts = [(r[1], r[2]) for r in recs if r[1] is not None and r[2] is not None and (r[1] or r[2])]
        lo, hi = a.get("minTemperature"), a.get("maxTemperature")
        cad = a.get("avgDoubleCadence") if run else a.get("avgBikeCadence")
        place = (a.get("locationName") or "").strip()
        if place and a.get("startLatitude"):
            p = places.setdefault(place, [0, 0.0, 0.0])
            p[0] += 1
            p[1] += a["startLatitude"]
            p[2] += a["startLongitude"]
        rows.append([aid, dt, typ, (a.get("name") or typ).strip(), (a.get("description") or "").strip(),
                     round((a.get("distance") or 0) / 100000, 2), round((a.get("movingDuration") or a.get("duration") or 0) / 1000),
                     round((a.get("elapsedDuration") or a.get("duration") or 0) / 1000), round((a.get("elevationGain") or 0) / 100),
                     round(a["activityTrainingLoad"] * 0.37) if a.get("activityTrainingLoad") else None,
                     round((a.get("calories") or 0) / 4.184) or None, round(cad) if cad else None, 0, 0, None, place,
                     encode(simplify(pts)) if len(pts) > 1 else "", round((lo + hi) / 2) if lo is not None and hi is not None else None,
                     None, 0, round((a.get("maxSpeed") or 0) * 36, 1)])
        if run and recs:
            ts = [r[0] for r in recs]
            for label, s in best_efforts(ts, [r[3] for r in recs]).items():
                efforts.append([label, s, dt[:10], aid])
    json.dump({"rows": rows, "efforts": efforts}, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    known = {p["n"] for p in cfg.get("lieux", [])}
    for n, (c, la, lo) in sorted(places.items(), key=lambda x: -x[1][0]):
        if n not in known:
            cfg.setdefault("lieux", []).append({"n": n, "lat": round(la / c, 3), "lon": round(lo / c, 3)})
    json.dump(cfg, open(cfg_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"OK : {len(rows)} activités, {len(fits)} avec fichier FIT sur {seen} lus, {sum(1 for r in rows if r[16])} tracés, {len(efforts)} efforts, {os.path.getsize(out) // 1024} Ko, {len(places)} lieux")


if __name__ == "__main__":
    main()
