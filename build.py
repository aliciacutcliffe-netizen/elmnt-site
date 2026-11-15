#!/usr/bin/env python3
"""Builds the ELMNT Earth site into ./site from data/ and content/.

Run:  python3 build.py
Netlify runs this automatically on every deploy (see netlify.toml).
To change a price, stock level or description, edit data/products.json.
"""
import html, json, re, shutil
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "site"
CDN = "https://cdn.shopify.com/s/files/1/0798/6790/4231/"

# Google Analytics (GA4) — counts visitors on every page.
GA_ID = "G-VZL94YFLF2"
GA = f"""<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','{GA_ID}');</script>"""

SITE = json.loads((ROOT / "data/site.json").read_text())
PRODUCTS = json.loads((ROOT / "data/products.json").read_text())
CATS = dict(SITE["categories"])
esc = html.escape


def img(path, width=None):
    """Local /images/... paths are used as-is; Shopify paths point at the CDN."""
    if path.startswith("/"):
        # Netlify's image CDN shrinks and converts photos (to WebP/AVIF) on the fly,
        # so phones download ~50-150 KB instead of 2-3 MB PNGs.
        return f"/.netlify/images?url={path}&w={width or 1600}&q=75"
    url = CDN + path
    if width:
        url += ("&" if "?" in url else "?") + f"width={width}"
    return url


def money(v):
    return f"${v:,.2f}"


def price_html(p):
    s = f'<span class="price">{money(p["p"])}'
    if p.get("c") and p["c"] > p["p"]:
        s += f'<s>{money(p["c"])}</s>'
    return s + "</span>"


def stock_label(p):
    n = p.get("stock", 0)
    if n <= 0:
        return '<span class="tag out">Sold out</span>'
    if p.get("x") in ("holder", "shell") or p["cat"] == "inti" and n == 1:
        return '<span class="tag">One of one</span>'
    if n <= 3:
        return f'<span class="tag">Only {n} left</span>'
    return ""


def page(title, body, desc="", path="/", noindex=False, current=""):
    full_title = title if title.startswith(SITE["name"]) else f"{title} | {SITE['name']}"
    nav = [("/shop/", "Shop"), ("/pages/palo-santo/", "Palo Santo"), ("/pages/meditations/", "Meditations")]
    nav_html = "".join(
        f'<a href="{h}"{" aria-current=page" if current == h else ""}>{t}</a>' for h, t in nav
    )
    foot_links = [("/pages/shipping/", "Shipping"), ("/pages/returns/", "Returns"),
                  ("/pages/faq/", "FAQ"), ("/pages/contact/", "Contact")]
    foot_links += [(u, n) for n, u in SITE["socials"]]
    foot_html = "".join(f'<a href="{h}">{t}</a>' for h, t in foot_links)
    robots = '<meta name="robots" content="noindex">' if noindex else ""
    return f"""<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(full_title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{SITE['url']}{path}">
<meta property="og:title" content="{esc(full_title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{SITE['url']}{path}">
<meta property="og:site_name" content="{SITE['name']}">
<meta name="theme-color" content="#1c1511">
{robots}
<link rel="icon" href="{img(SITE['logo'], 64)}">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&family=Figtree:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/style.css">
{GA}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
<a class="brand" href="/"><img src="{img(SITE['logo'], 96)}" alt=""><span>ELMNT EARTH</span></a>
<nav class="nav" aria-label="Main">{nav_html}</nav>
<button class="cartbtn" type="button" data-open-cart aria-label="Open cart">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
<span class="count" data-cart-count></span></button>
</div></header>
<main id="main">
{body}
</main>
<footer class="foot"><div class="wrap">
<p class="motto">Grounded in Peru · Rooted in ritual</p>
<div class="cols">{foot_html}</div>
<p>© ELMNT Earth · Sydney, Australia · <a href="mailto:{SITE['email']}">{SITE['email']}</a></p>
</div></footer>
<div class="scrim" data-close-cart></div>
<aside class="drawer" aria-label="Your cart" aria-hidden="true">
<header><h2>Your cart</h2><button class="x" type="button" data-close-cart aria-label="Close cart">×</button></header>
<div class="lines" data-cart-lines></div>
<div class="summary" data-cart-summary></div>
</aside>
<div class="toast" role="status" aria-live="polite" data-toast></div>
<script src="/cart.js" defer></script>
</body>
</html>"""


def card(p):
    url = f"/products/{p['h']}/"
    first = p["img"][0]
    sold = p.get("stock", 0) <= 0
    return f"""<article class="card" data-cat="{p['cat']}">
<a class="img" href="{url}"><img src="{img(first[0], 600)}" alt="{esc(first[1])}" loading="lazy" width="600" height="600"></a>
<div class="info">{stock_label(p)}<h3><a href="{url}">{esc(p['t'])}</a></h3>
<div class="row">{price_html(p)}<button class="add-mini" type="button" data-add="{p['h']}" aria-label="Add {esc(p['t'])} to cart"{" disabled" if sold else ""}>+</button></div>
</div></article>"""


INTI_HOLDER = ("<p>Made by a local artist born in Lima, Peru, who now calls Sydney home, each INTI piece carries the bold, "
               "fluorescent spirit of Peruvian chicha art into a form you can live with every day.</p>"
               "<p>Designed to hold incense while standing as an object in its own right.</p>"
               "<p><strong>Size:</strong> {size}<br><strong>Edition:</strong> One of one<br><strong>Made in:</strong> Sydney, Australia</p>"
               "<p>Made by hand. Made to be used. Never made twice.</p>")
INTI_SHELL = ("<p>Painted by a local artist born in Lima, Peru, who now calls Sydney home, each INTI shell carries the bold, "
              "fluorescent spirit of Peruvian chicha art into the natural forms of the ocean.</p>"
              "<p>Each shell is painted individually, so no two share the same markings or character.</p>"
              "<ul><li>Hand-painted decorative shell</li><li>Dimensions: {size}</li>"
              "<li>One of a kind: the piece pictured is the piece you'll receive</li>"
              "<li>For decorative use only. Not suitable for burning incense or holding hot ash</li></ul>")


def product_page(p):
    d = p["d"]
    if p.get("x") == "holder":
        d += INTI_HOLDER.format(size=esc(p["size"]))
    elif p.get("x") == "shell":
        d = "<p>A little piece of art, inspired by the sea.</p>" + d + INTI_SHELL.format(size=esc(p["size"]))
    if p["cat"] in ("incense", "mist"):
        d += '<p><strong>New to Palo Santo?</strong> <a href="/pages/palo-santo/">Read where ours comes from and how to burn it.</a></p>'
    imgs = p["img"]
    thumbs = ""
    if len(imgs) > 1:
        thumbs = '<div class="thumbs">' + "".join(
            f'<button type="button" data-thumb="{img(u, 1200)}" data-alt="{esc(a)}" aria-current="{"true" if i == 0 else "false"}" aria-label="View image {i + 1}">'
            f'<img src="{img(u, 160)}" alt="" loading="lazy"></button>' for i, (u, a) in enumerate(imgs)) + "</div>"
    n = p.get("stock", 0)
    sold = n <= 0
    max_q = min(n, 20)
    if sold:
        stock_note = "Sold out"
    elif p["cat"] == "inti" and n == 1:
        stock_note = "One of one. Once it's gone, it's gone."
    elif n <= 3:
        stock_note = f"Only {n} left"
    else:
        stock_note = "In stock · ships from Sydney in 1–3 business days"
    related = [q for q in PRODUCTS if q["cat"] == p["cat"] and q["h"] != p["h"] and q.get("stock", 0) > 0][:4]
    rel = ""
    if related:
        rel = f'<section class="section"><h2>More {esc(CATS[p["cat"]])}</h2><div class="grid">{"".join(card(q) for q in related)}</div></section>'
    ld = {
        "@context": "https://schema.org", "@type": "Product", "name": p["t"],
        "image": [img(u) for u, _ in imgs], "brand": {"@type": "Brand", "name": SITE["name"]},
        "description": re.sub(r"<[^>]+>", " ", p["d"]).strip()[:500],
        "offers": {"@type": "Offer", "priceCurrency": "AUD", "price": f'{p["p"]:.2f}',
                   "availability": "https://schema.org/" + ("OutOfStock" if sold else "InStock"),
                   "url": f'{SITE["url"]}/products/{p["h"]}/'},
    }
    body = f"""<div class="wrap">
<p class="crumb"><a href="/shop/">Shop</a> / <a href="/shop/#{p['cat']}">{esc(CATS[p['cat']])}</a></p>
<div class="pd">
<div class="gallery"><div class="main"><img data-main src="{img(imgs[0][0], 1200)}" alt="{esc(imgs[0][1])}" width="1200" height="1200"></div>{thumbs}</div>
<div>
<h1>{esc(p['t'])}</h1>
{price_html(p)}
<p class="stock">{stock_note}</p>
<div class="buy">
<div class="qty" data-qty data-max="{max_q}"><button type="button" data-step="-1" aria-label="Decrease quantity">−</button><output>1</output><button type="button" data-step="1" aria-label="Increase quantity">+</button></div>
<button class="btn" type="button" data-add="{p['h']}" data-with-qty{" disabled" if sold else ""}>{"Sold out" if sold else "Add to cart"}</button>
</div>
<p class="note">Secure checkout with Stripe · Cards, Apple Pay &amp; Google Pay</p>
<div class="desc">{d}</div>
</div></div>
{rel}
</div>
<script type="application/ld+json">{json.dumps(ld)}</script>"""
    desc = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", p["d"])).strip()[:155]
    return page(p["t"], body, desc, f"/products/{p['h']}/", current="/shop/")


def shop_page():
    chips = '<button class="chip" type="button" data-filter="" aria-pressed="true">All</button>' + "".join(
        f'<button class="chip" type="button" data-filter="{k}" aria-pressed="false">{esc(v)}</button>' for k, v in SITE["categories"])
    in_stock = sorted(PRODUCTS, key=lambda p: p.get("stock", 0) <= 0)
    body = f"""<div class="wrap section">
<h1>Shop</h1>
<div class="chips" role="group" aria-label="Filter by category">{chips}</div>
<div class="grid" data-grid>{"".join(card(p) for p in in_stock)}</div>
</div>"""
    return page("Shop Palo Santo, Incense & INTI Art", body,
                "Shop ethically sourced Palo Santo incense from Peru, Aura Mist, Palo Santo jewellery and one-of-one INTI art.", "/shop/", current="/shop/")


def home_page():
    by_cat = lambda c: [p for p in PRODUCTS if p["cat"] == c and p.get("stock", 0) > 0]
    cat_img = {c: next((p["img"][0][0] for p in PRODUCTS if p["cat"] == c), "") for c in CATS}
    cats = "".join(
        f'<a class="cat" href="/shop/#{k}" style="background-image:url(\'{img(cat_img[k], 500)}\')"><span>{esc(v)}</span></a>'
        for k, v in SITE["categories"])
    incense = by_cat("incense") + by_cat("mist")
    inti = by_cat("inti")[:4]
    body = f"""<section class="hero"><div class="wrap">
<img class="logo" src="{img(SITE['logo'], 200)}" alt="ELMNT Earth">
<p class="eyebrow">ELMNT EARTH</p>
<h1>Ground your day, one sacred stick at a time</h1>
<p>Ethically sourced Palo Santo, hand pressed in Huanchaco, Peru. Shipped from Sydney.</p>
<a class="btn" href="/shop/">Shop now</a>
</div></section>
<section class="section"><div class="wrap"><div class="cats">{cats}</div></div></section>
<section class="section"><div class="wrap">
<div class="section-head"><h2>Palo Santo incense &amp; mist</h2><a href="/shop/#incense">View all</a></div>
<div class="grid">{"".join(card(p) for p in incense)}</div>
</div></section>
<section class="section"><div class="wrap">
<div class="section-head"><h2>INTI · one-of-one art</h2><a href="/shop/#inti">View all</a></div>
<div class="grid">{"".join(card(p) for p in inti)}</div>
</div></section>
<section class="section"><div class="wrap story">
<img src="{img(PRODUCTS[0]['img'][-1][0], 900)}" alt="Palo Santo incense burning in a handmade holder" loading="lazy">
<div class="panel"><p class="eyebrow">From forest to ritual</p><h2 style="margin-top:0">Naturally fallen. Hand pressed.</h2>
<p>Our Palo Santo is gathered only from naturally fallen wood in the dry forests of Piura, then milled and pressed by hand in Huanchaco, on Peru's northern coast.</p>
<a class="btn ghost" href="/pages/palo-santo/">Read the story</a></div>
</div></section>
<section class="section"><div class="wrap narrow" style="text-align:center">
<p class="eyebrow">Free guided meditations</p><h2 style="margin-top:0">Light a stick. Press play. Breathe.</h2>
<p style="color:var(--muted)">Gentle 10-minute breathing meditations, a new one every week.</p>
<a class="btn ghost" href="/pages/meditations/">Listen now</a>
</div></section>"""
    return page(f"{SITE['name']} | Ethically Sourced Palo Santo from Peru", body,
                "Ethically sourced Palo Santo incense hand pressed in Huanchaco, Peru. Aura Mist, Palo Santo jewellery and one-of-one INTI art. Shipped from Sydney.", "/")


def content_page(f):
    raw = f.read_text()
    m = re.match(r"<!--(.*?)-->\s*", raw, re.S)
    meta = {}
    for part in m.group(1).split("|"):
        if ":" in part:
            k, v = part.split(":", 1)
            meta[k.strip()] = v.strip()
        elif part.strip():
            meta[part.strip()] = True
    body_html = raw[m.end():]
    handle = f.stem
    path = f"/pages/{handle}/"
    body = f'<div class="wrap narrow prose"><h1>{esc(meta["title"])}</h1>{body_html}</div>'
    return path, page(meta["title"], body, meta.get("desc", ""), path, noindex="noindex" in meta, current=path)


def thank_you():
    body = """<div class="wrap narrow prose" style="text-align:center">
<img src="%s" alt="" style="width:80px;margin:24px auto 0">
<h1>Thank you</h1>
<p class="lead">Your order is confirmed. A receipt is on its way to your inbox, and we'll email tracking once it's dispatched from Sydney.</p>
<p><a class="btn" href="/shop/">Keep browsing</a></p>
</div>
<script>try{localStorage.removeItem('elmnt-cart')}catch(e){}</script>""" % img(SITE["logo"], 200)
    return page("Thank you", body, "Order confirmed.", "/thank-you/", noindex=True)


def not_found():
    body = '<div class="wrap narrow prose" style="text-align:center"><h1>Page not found</h1><p>That page has moved or no longer exists.</p><p><a class="btn" href="/shop/">Go to the shop</a></p></div>'
    return page("Page not found", body, "", "/404", noindex=True)


def write(rel, text):
    path = OUT / rel.strip("/")
    if rel.endswith("/"):
        path = path / "index.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(ROOT / "static", OUT)
    write("/", home_page())
    write("/shop/", shop_page())
    for p in PRODUCTS:
        write(f"/products/{p['h']}/", product_page(p))
    pages = []
    for f in sorted((ROOT / "content").glob("*.html")):
        path, text = content_page(f)
        write(path, text)
        pages.append(path)
    write("/thank-you/", thank_you())
    (OUT / "404.html").write_text(not_found())

    catalog = {p["h"]: {"t": p["t"], "p": p["p"], "s": p.get("stock", 0), "i": img(p["img"][0][0], 200)} for p in PRODUCTS}
    (OUT / "catalog.json").write_text(json.dumps(catalog, separators=(",", ":")))

    urls = ["/", "/shop/"] + [f"/products/{p['h']}/" for p in PRODUCTS] + [u for u in pages if "thanks" not in u]
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + "".join(f"<url><loc>{SITE['url']}{u}</loc></url>" for u in urls) + "</urlset>\n")
    (OUT / "robots.txt").write_text(f"User-agent: *\nDisallow: /thank-you/\nSitemap: {SITE['url']}/sitemap.xml\n")
    # The checkout function reads prices from this generated module (never from the browser)
    (ROOT / "netlify/catalog.mjs").write_text("export default " + json.dumps(PRODUCTS, ensure_ascii=False) + ";\n")
    print(f"Built {len(PRODUCTS)} products and {len(pages)} pages into {OUT}")


if __name__ == "__main__":
    main()
