"""
Placeholder photography for the 151 RAW-branded products in the real stock
catalog (site/src/lib/catalog-data.json), sourced from Wikimedia Commons and
ranked with CLIP — same approach and same reasoning as the pitch prototype's
tools/fetch_products.py: real photography without putting a copyrighted
brand/retailer shot into the client's site, even as a placeholder. Confirmed
with the client 2026-09-16.

Run with the CLIP-capable interpreter (per the site README):
  C:\\Users\\Taha\\Desktop\\AutoRig\\notes\\sam31_env\\Scripts\\python.exe tools/fetch_raw_images.py

Many of these are one-off novelty items (a specific mug, a specific frisbee)
that Commons has no dedicated photography for — those are left with no image
rather than a wrong one. Re-run with --refetch to repull the candidate pool.
"""
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

import torch
from PIL import Image, ImageFilter
from transformers import CLIPModel, CLIPProcessor

PROJ = r"C:\Work\babajee"
CATALOG_JSON = os.path.join(PROJ, "site", "src", "lib", "catalog-data.json")
OUT_IMG = os.path.join(PROJ, "site", "public", "images", "raw")
OUT_CREDITS = os.path.join(PROJ, "site", "src", "lib", "raw-images.json")
POOL_DIR = os.path.join(PROJ, "work", "raw_pool")
POOL_META = os.path.join(PROJ, "work", "raw_pool_meta.json")

API = "https://commons.wikimedia.org/w/api.php"
UA = ("babajee-site/0.1 (https://github.com/Neferchipss; tahaadil89@gmail.com)")
TILE = 900
MIN_W = MIN_H = 400
THROTTLE = 1.6
POOL_PER_CAT = 300
MIN_SCORE = 0.55

# kind -> (Commons categories to pool from, CLIP prompt)
KINDS = {
    "paper":    (["Cigarette rolling papers", "Rizla (rolling paper)"], "a pack of cigarette rolling papers"),
    "pipe":     (["Tobacco pipes"], "a wooden or glass smoking pipe"),
    "grinder":  (["Herb grinders"], "a metal herb grinder"),
    "filter":   (["Cigarettes"], "new unused cigarette filter tips"),
    "ashtray":  (["Ashtrays"], "a clean empty ashtray on a plain background"),
    "cap":      (["Baseball caps"], "a baseball cap"),
    "mug":      (["Mugs"], "a ceramic mug"),
    "bag":      (["Pouches", "Tote bags"], "a small fabric pouch or bag"),
    "tin":      (["Tins", "Wooden boxes"], "a small metal or wooden storage tin box"),
    "jar":      (["Glass jars"], "a glass jar with a lid"),
    "keychain": (["Keychains"], "a keychain"),
    "spray":    (["Spray bottles"], "a plastic spray bottle of cleaning fluid"),
    "ring":     (["Finger rings"], "a plain metal ring"),
    "lanyard":  (["Lanyards"], "a fabric lanyard strap"),
    "bandana":  (["Bandanas"], "a folded bandana"),
    "cards":    (["Playing cards"], "a deck of playing cards"),
    "frisbee":  (["Flying discs"], "a flying disc frisbee"),
    "candle":   (["Candles"], "a small candle"),
}

# category-slug -> default kind
CATEGORY_KIND = {
    "rolling-paper": "paper",
    # rolling-tray: deliberately no bucket — Commons' "Trays" category is
    # antique serving plates/dishware, not smoking accessories. CLIP had
    # nothing real to rank, so it confidently (falsely) picked the same
    # wrong plate photo for every tray. No photo beats a wrong one.
    "pipe": "pipe",
    "grinder": "grinder",
    "filter": "filter",
    "roach": "filter",
    "ashtray": "ashtray",
    "cleaning-accessory": "spray",
    "keychain": "keychain",
}

# keyword -> kind override, checked before the category default (order matters)
KEYWORD_KIND = [
    (r"\bmug\b", "mug"),
    (r"\bcap\b", "cap"),
    (r"\bring\b", "ring"),
    (r"\blanyard\b", "lanyard"),
    (r"\bbandana\b", "bandana"),
    (r"\bplaying cards\b", "cards"),
    (r"\bfrisbee\b|\bflying disc\b", "frisbee"),
    (r"\bcandle\b", "candle"),
    (r"\bjar\b", "jar"),
    (r"\btin\b|\bbox\b|\bcase\b", "tin"),
    (r"\bbag\b|\bpouch\b|\bwallet\b", "bag"),
]


def classify(category_slug, name):
    n = name.lower()
    for pattern, kind in KEYWORD_KIND:
        if re.search(pattern, n):
            return kind
    return CATEGORY_KIND.get(category_slug)  # None -> no good bucket, skip


_last = [0.0]


def api(params, tries=4):
    for attempt in range(tries):
        wait = THROTTLE - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(
                API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception as e:
            print(f"    retry ({e})")
            time.sleep(6 * (attempt + 1))
    return {}


def _text(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()[:80]


def candidates(category):
    d = api({"action": "query", "format": "json",
             "generator": "categorymembers",
             "gcmtitle": f"Category:{category}", "gcmtype": "file",
             "gcmlimit": POOL_PER_CAT,
             "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
             "iiurlwidth": TILE})
    out = []
    for page in (d.get("query", {}).get("pages") or {}).values():
        ii = (page.get("imageinfo") or [{}])[0]
        if not ii.get("thumburl"):
            continue
        if ii.get("mime") not in ("image/jpeg", "image/png"):
            continue
        if ii.get("width", 0) < MIN_W or ii.get("height", 0) < MIN_H:
            continue
        meta = ii.get("extmetadata", {})
        out.append({"title": page["title"], "thumb": ii["thumburl"],
                    "page": ii.get("descriptionurl", ""),
                    "licence": (meta.get("LicenseShortName", {}) or {}).get("value", "").strip(),
                    "author": _text((meta.get("Artist", {}) or {}).get("value", ""))})
    return out


def grab(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def square(im, size=TILE):
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    return im.resize((size, size), Image.LANCZOS).filter(
        ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=3))


def safe(s):
    return s.encode("ascii", "replace").decode("ascii")


def build_pool(kinds_needed, refetch):
    os.makedirs(POOL_DIR, exist_ok=True)
    meta = {} if refetch or not os.path.exists(POOL_META) else json.load(open(POOL_META))
    for kind in kinds_needed:
        cats, _ = KINDS[kind]
        have = [k for k in meta if meta[k]["kind"] == kind]
        if have and not refetch:
            print(f"  [{kind}] {len(have)} cached")
            continue
        n = 0
        for category in cats:
            for c in candidates(category):
                fid = f"{kind}__{abs(hash(c['title'])) % 10**10}"
                path = os.path.join(POOL_DIR, fid + ".jpg")
                if not os.path.exists(path):
                    try:
                        grab(c["thumb"]).save(path, quality=88)
                    except Exception as e:
                        print(f"    skip ({e})")
                        continue
                meta[fid] = {**c, "kind": kind, "file": fid + ".jpg"}
                n += 1
        json.dump(meta, open(POOL_META, "w"), indent=1)
        print(f"  [{kind}] {n} downloaded")
    return meta


def rank(meta, kinds_needed):
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(dev).eval()
    proc = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

    scores = {}
    for kind in kinds_needed:
        _, prompt = KINDS[kind]
        ids = [k for k in meta if meta[k]["kind"] == kind]
        if not ids:
            continue
        imgs, keep = [], []
        for fid in ids:
            try:
                imgs.append(Image.open(os.path.join(POOL_DIR, meta[fid]["file"])).convert("RGB"))
                keep.append(fid)
            except Exception:
                pass
        if not imgs:
            continue
        texts = [f"a product photo of {prompt}",
                 "a photo of a car", "a photo of a building",
                 "a photo of a person", "a drawing or diagram",
                 "a photo of food",
                 "cigarette butts and ash, litter, rubbish",
                 "a dirty used object covered in ash"]
        with torch.no_grad():
            inp = proc(text=texts, images=imgs, return_tensors="pt",
                       padding=True, truncation=True).to(dev)
            logits = model(**inp).logits_per_image.softmax(dim=1)[:, 0]
        for fid, s in zip(keep, logits.tolist()):
            scores[fid] = s
        top = sorted(keep, key=lambda k: -scores[k])[:3]
        print(f"  [{kind}] best {['%.2f' % scores[t] for t in top]} "
              f"{safe(meta[top[0]]['title'][:48])}")
    return scores


def main():
    refetch = "--refetch" in sys.argv
    os.makedirs(OUT_IMG, exist_ok=True)

    categories = json.load(open(CATALOG_JSON, encoding="utf-8"))
    raw_items = []  # (category_slug, product_slug, name, kind)
    for cat in categories:
        for p in cat["products"]:
            if re.search(r"\braw\b", p["name"], re.I):
                kind = classify(cat["slug"], p["name"])
                raw_items.append((cat["slug"], p["slug"], p["name"], kind))

    print(f"{len(raw_items)} RAW-branded products found")
    kinds_needed = sorted({k for *_, k in raw_items if k})
    print("kinds needed:", kinds_needed)

    print("\npooling candidates ...")
    meta = build_pool(kinds_needed, refetch)
    print("\nranking with CLIP ...")
    scores = rank(meta, kinds_needed)

    by_kind = {}
    for fid, m in meta.items():
        by_kind.setdefault(m["kind"], []).append(fid)
    for k in by_kind:
        by_kind[k].sort(key=lambda f: -scores.get(f, 0))

    print("\nassigning ...")
    taken, credits = set(), {}
    got = 0
    for cat_slug, prod_slug, name, kind in raw_items:
        key = f"{cat_slug}/{prod_slug}"
        if not kind:
            print(f"  MISS (no bucket) {safe(name)}")
            continue
        pool_k = [f for f in by_kind.get(kind, []) if scores.get(f, 0) >= MIN_SCORE]
        pick = next((f for f in pool_k if f not in taken), None) or (pool_k[0] if pool_k else None)
        if not pick:
            print(f"  MISS ({kind}) {safe(name)}")
            continue
        taken.add(pick)
        m = meta[pick]
        fn = f"{prod_slug}.jpg"
        square(Image.open(os.path.join(POOL_DIR, m["file"])).convert("RGB")) \
            .save(os.path.join(OUT_IMG, fn), quality=90)
        credits[key] = {
            "image": f"/images/raw/{fn}",
            "title": m["title"].replace("File:", ""),
            "author": m["author"], "licence": m["licence"], "page": m["page"],
        }
        got += 1
        print(f"  {scores.get(pick, 0):.2f} [{kind}] {safe(name):<40} <- {safe(m['title'][:48])}")

    json.dump(credits, open(OUT_CREDITS, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"\n{got}/{len(raw_items)} RAW products have placeholder photography")


if __name__ == "__main__":
    main()
