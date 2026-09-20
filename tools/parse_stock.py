"""
Parse data/Stock_1.xlsx into src/lib/catalog-data.json.

The sheet has no price, SKU, or image data — only Product Name, Category,
and No of units in Box. Re-run this whenever the client sends an updated
stock sheet.

Category/variant rules (confirmed with the client 2026-09-16):
- Category labels are normalized (trimmed, typo'd duplicates merged,
  "Glass Pipe" folded into "Pipe").
- ~41 rows had no category at all; those are inferred from the product name
  (pipe/chillum/one-hitter -> Pipe, tray -> Rolling Tray, ashtray ->
  Ashtray, lighter -> Lighter, tobacco -> Rolling Tobacco, else -> Accessory).
- A row with no catalog number is treated as a color/flavor VARIANT of the
  immediately preceding numbered row only when the text before its
  " - Color" / "(Color)" suffix is an exact match for that row's name.
  Every other unnumbered row is its own standalone product — sharing a
  number in the sheet does not by itself imply the items are the same
  product (e.g. "Glass Bong 6", "Mushroom Glass Bong 6", "Thick Glass
  Bong 6" are three different designs, not color options of one bong).
"""

import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "Stock_1.xlsx"
OUTPUT = ROOT / "src" / "lib" / "catalog-data.json"

CAT_FIXES = {
    "cigar's": "cigars",
    "accesory": "accessory",
    "cleaning accesssory": "cleaning accessory",
    "glass pipe": "pipe",
}

CATEGORY_DISPLAY = {
    "rolling paper": "Rolling Paper",
    "accessory": "Accessory",
    "rolling tray": "Rolling Tray",
    "storage": "Storage",
    "bong": "Bong",
    "bong accessory": "Bong Accessory",
    "ashtray": "Ashtray",
    "pipe": "Pipe",
    "grinder": "Grinder",
    "filter": "Filter",
    "rolling tobacco": "Rolling Tobacco",
    "roach": "Roach",
    "cigars": "Cigars",
    "lighter": "Lighter",
    "blunt wraps": "Blunt Wraps",
    "cleaning accessory": "Cleaning Accessory",
    "blunt pre-rolled cone": "Blunt Pre-Rolled Cone",
    "keychain": "Keychain",
    "lighter refills": "Lighter Refills",
}

VARIANT_RE = re.compile(r"^(.*?)\s*[-–]\s*([A-Za-z0-9 /]+)$")
PAREN_RE = re.compile(r"^(.*?)\s*\(([A-Za-z0-9 /]+)\)$")


def norm_cat(cat):
    if not cat:
        return None
    c = re.sub(r"\s+", " ", cat.strip().lower())
    return CAT_FIXES.get(c, c)


def infer_cat(name):
    n = name.lower()
    if "pipe" in n or "chillu" in n or "chillim" in n or "one hitter" in n or "shooter" in n:
        return "pipe"
    if "tray" in n:
        return "rolling tray"
    if "ashtray" in n:
        return "ashtray"
    if "lighter" in n:
        return "lighter"
    if "tobacco" in n:
        return "rolling tobacco"
    return "accessory"


def split_variant(name):
    m = VARIANT_RE.match(name) or PAREN_RE.match(name)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return name.strip(), None


def norm_base(s):
    return re.sub(r"\s+", " ", s.strip().lower())


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s


def parse():
    wb = openpyxl.load_workbook(SOURCE, data_only=True)
    ws = wb["Sheet1"]

    products = []
    prev_numbered = None

    for row in ws.iter_rows(min_row=2, values_only=True):
        rid, name, cat, units = row[0], row[1], row[2], row[3]
        if not name:
            continue
        name = name.strip()
        cat_n = norm_cat(cat)

        if rid is not None:
            base, _ = split_variant(name)
            p = {
                "sourceId": rid,
                "name": name,
                "base": base,
                "category": cat_n or infer_cat(name),
                "unitsPerBox": units,
                "variants": [],
            }
            products.append(p)
            prev_numbered = p
            continue

        base, variant_label = split_variant(name)
        merged = False
        if prev_numbered and variant_label and norm_base(base) == norm_base(prev_numbered["base"]):
            prev_numbered["variants"].append({"label": variant_label, "unitsPerBox": units})
            merged = True
        if not merged:
            base2, _ = split_variant(name)
            p = {
                "sourceId": None,
                "name": name,
                "base": base2,
                "category": cat_n or infer_cat(name),
                "unitsPerBox": units,
                "variants": [],
            }
            products.append(p)
            prev_numbered = p

    # group into categories, assign slugs
    by_category = {}
    for p in products:
        by_category.setdefault(p["category"], []).append(p)

    categories = []
    for cat_key in sorted(by_category, key=lambda k: -len(by_category[k])):
        cat_slug = slugify(CATEGORY_DISPLAY.get(cat_key, cat_key))
        seen_slugs = set()
        cat_products = []
        for p in by_category[cat_key]:
            base_slug = slugify(p["name"])
            slug = base_slug
            n = 2
            while slug in seen_slugs:
                slug = f"{base_slug}-{n}"
                n += 1
            seen_slugs.add(slug)
            cat_products.append({
                "slug": slug,
                "name": p["name"],
                "unitsPerBox": p["unitsPerBox"],
                "variants": p["variants"],
            })
        categories.append({
            "slug": cat_slug,
            "name": CATEGORY_DISPLAY.get(cat_key, cat_key.title()),
            "products": cat_products,
        })

    return categories


if __name__ == "__main__":
    categories = parse()
    OUTPUT.write_text(json.dumps(categories, indent=2, ensure_ascii=False), encoding="utf-8")
    total = sum(len(c["products"]) for c in categories)
    print(f"Wrote {OUTPUT} — {len(categories)} categories, {total} products")
