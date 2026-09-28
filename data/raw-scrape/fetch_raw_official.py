"""
Exact product photos + descriptions for RAW-branded stock items, scraped
from RAW's own official site (rawthentic.com) — used instead of generic
Wikimedia Commons stand-ins per the client's request 2026-09-16, since this
retailer is reselling RAW's real products and wants the real product shot.

Only scrapes the products matched with full name-token coverage against the
official product-sitemap.xml (see tools/match_raw_official.py output,
work/raw_scrape/raw_url_matches_accepted.json) — every RAW SKU whose name
was ambiguous against the official catalog (e.g. a bare "Raw Connoisseur"
that could be the Classic or the Black Connoisseur line) is skipped rather
than guessed, same "no photo beats a wrong photo" rule as the Commons pass.

Respects rawthentic.com's robots.txt Crawl-delay: 10.

  python tools/fetch_raw_official.py
"""
import html
import json
import os
import re
import time
import urllib.request

PROJ = r"C:\Work\babajee"
MATCHES = os.path.join(PROJ, "work", "raw_scrape", "raw_url_matches_accepted.json")
OUT_IMG = os.path.join(PROJ, "site", "public", "images", "raw-official")
OUT_JSON = os.path.join(PROJ, "site", "src", "lib", "raw-official.json")
HTML_CACHE = os.path.join(PROJ, "work", "raw_scrape", "pages")

UA = "Mozilla/5.0 (compatible; babajee-site/0.1; +https://github.com/Neferchipss)"
CRAWL_DELAY = 10.0


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


def extract(page_html):
    m = re.search(r'<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*>', page_html)
    image = None
    if m:
        src_m = re.search(r'src="([^"]+)"', m.group(0))
        image = src_m.group(1) if src_m else None
    m = re.search(r'<meta name="description" content="([^"]+)"', page_html)
    desc = html.unescape(m.group(1)) if m else None
    m = re.search(r"<title>(.*?)&#8226;\s*RAWthentic", page_html)
    title = html.unescape(m.group(1)).strip() if m else None
    return image, desc, title


def main():
    os.makedirs(OUT_IMG, exist_ok=True)
    os.makedirs(HTML_CACHE, exist_ok=True)
    matches = json.load(open(MATCHES, encoding="utf-8"))

    out = {}
    for i, m in enumerate(matches):
        key = f"{m['category']}/{m['slug']}"
        cache_path = os.path.join(HTML_CACHE, m["slug"] + ".html")
        if os.path.exists(cache_path):
            page_html = open(cache_path, encoding="utf-8").read()
        else:
            print(f"[{i+1}/{len(matches)}] fetching {m['url']}")
            try:
                page_html = fetch(m["url"]).decode("utf-8", "replace")
            except Exception as e:
                print(f"  FAILED: {e}")
                time.sleep(CRAWL_DELAY)
                continue
            open(cache_path, "w", encoding="utf-8").write(page_html)
            time.sleep(CRAWL_DELAY)

        image_url, desc, title = extract(page_html)
        if not image_url:
            print(f"  no product image found for {m['name']!r}, skipping")
            continue

        ext = os.path.splitext(image_url.split("?")[0])[1] or ".jpg"
        fn = f"{m['slug']}{ext}"
        img_path = os.path.join(OUT_IMG, fn)
        if not os.path.exists(img_path):
            try:
                data = fetch(image_url)
                open(img_path, "wb").write(data)
                time.sleep(CRAWL_DELAY)
            except Exception as e:
                print(f"  image download FAILED: {e}")
                continue

        out[key] = {
            "image": f"/images/raw-official/{fn}",
            "description": desc,
            "officialTitle": title,
            "sourceUrl": m["url"],
        }
        print(f"  ok: {title!r}")

    json.dump(out, open(OUT_JSON, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"\n{len(out)}/{len(matches)} official RAW products fetched")


if __name__ == "__main__":
    main()
