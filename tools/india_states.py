"""India's states as small SVG paths for the admin's analytics map.

    python tools/india_states.py <datameet states.geojson> src/lib/india-states.json

Source: DataMeet's community maps (github.com/datameet/maps), drawn to India's
official boundaries. Each state is simplified (about 2 km), projected
equirectangularly with longitude scaled for India's middle latitude, and
written as one SVG path in a 1000-wide box. State names follow
src/lib/invoice.ts (STATE_CODES); the two DataMeet units that became one UT
are merged.
"""
import json
import math
import sys

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

NAMES = {
    "NCT of Delhi": "Delhi",
    "Arunanchal Pradesh": "Arunachal Pradesh",
    "Andaman & Nicobar Island": "Andaman and Nicobar Islands",
    "Dadara & Nagar Havelli": "Dadra and Nagar Haveli and Daman and Diu",
    "Daman & Diu": "Dadra and Nagar Haveli and Daman and Diu",
    "Jammu & Kashmir": "Jammu, Kashmir and Ladakh",  # the outline predates the 2019 split; one shape for both UTs
}

src, out = sys.argv[1], sys.argv[2]
feats = json.load(open(src, encoding="utf-8"))["features"]
groups = {}
for f in feats:
    name = NAMES.get(f["properties"]["ST_NM"], f["properties"]["ST_NM"])
    groups.setdefault(name, []).append(shape(f["geometry"]).buffer(0))

geoms = {n: unary_union(g).simplify(0.02, preserve_topology=True) for n, g in groups.items()}
minx = min(g.bounds[0] for g in geoms.values())
miny = min(g.bounds[1] for g in geoms.values())
maxx = max(g.bounds[2] for g in geoms.values())
maxy = max(g.bounds[3] for g in geoms.values())
k = math.cos(math.radians((miny + maxy) / 2))
W = 1000.0
scale = W / ((maxx - minx) * k)
H = (maxy - miny) * scale


def pt(x, y):
    return f"{(x - minx) * k * scale:.1f},{(maxy - y) * scale:.1f}"


def path(geom):
    parts = []
    polys = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
    for p in polys:
        if p.area < 0.002:  # specks of islands too small to see
            continue
        for ring in [p.exterior, *p.interiors]:
            cs = list(ring.coords)
            parts.append("M" + "L".join(pt(x, y) for x, y in cs) + "Z")
    return "".join(parts)


res = {
    "w": W,
    "h": round(H, 1),
    # projection for placing cities: x = (lng - lng0) * kx, y = (lat0 - lat) * ky
    "proj": {"lng0": round(minx, 5), "lat0": round(maxy, 5), "kx": round(k * scale, 5), "ky": round(scale, 5)},
    "states": [{"name": n, "d": path(g)} for n, g in sorted(geoms.items())],
}
json.dump(res, open(out, "w", encoding="utf-8"), separators=(",", ":"))
print(len(res["states"]), round(H), sum(len(s["d"]) for s in res["states"]))
