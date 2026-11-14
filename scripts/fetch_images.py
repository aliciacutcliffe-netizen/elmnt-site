#!/usr/bin/env python3
"""Copies every product image (and the logo) off Shopify's servers into static/images/,
shrinks them for fast loading, and points the data files at the local copies.

Run this BEFORE closing the Shopify store: once the store is gone, its image links stop working.
It runs automatically through the "Save images from Shopify" GitHub Action.
"""
import json, re, urllib.request
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None

ROOT = Path(__file__).resolve().parent.parent
CDN = "https://cdn.shopify.com/s/files/1/0798/6790/4231/"
DEST = ROOT / "static/images"
DEST.mkdir(parents=True, exist_ok=True)
MAX = 1400


def localise(path):
    if path.startswith("/"):
        return path
    name = re.sub(r"\?.*$", "", path.split("/")[-1])
    out = DEST / name
    if not out.exists():
        print("Downloading", name)
        req = urllib.request.Request(CDN + path, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=60).read()
        if Image:
            im = Image.open(BytesIO(data))
            im.thumbnail((MAX, MAX))
            if name.lower().endswith((".jpg", ".jpeg")):
                im.convert("RGB").save(out, quality=85, optimize=True, progressive=True)
            else:
                im.save(out, optimize=True)
        else:
            out.write_bytes(data)
    return "/images/" + name


products_file = ROOT / "data/products.json"
products = json.loads(products_file.read_text())
for p in products:
    p["img"] = [[localise(u), alt] for u, alt in p["img"]]
products_file.write_text(json.dumps(products, ensure_ascii=False, indent=1) + "\n")

site_file = ROOT / "data/site.json"
site = json.loads(site_file.read_text())
site["logo"] = localise(site["logo"])
site_file.write_text(json.dumps(site, ensure_ascii=False, indent=2) + "\n")
print("Done. Images saved in static/images/")
