# ELMNT Earth website

Custom shopfront for elmntearth.com, hosted on Netlify, with a multi-product cart that pays through Stripe Checkout.

- `data/products.json`: every product (price `p`, was-price `c`, `stock`, images, description). Edit this to change prices or mark something sold out (`"stock": 0`).
- `content/*.html`: the info pages (Palo Santo, Meditations, Shipping, Returns, FAQ, Contact).
- `build.py`: turns the above into the website in `site/`. Netlify runs it on every deploy.
- `netlify/functions/checkout.mjs`: sends the cart to Stripe. Needs the `STRIPE_SECRET_KEY` environment variable in Netlify.
- `.github/workflows/fetch-images.yml`: copies all images off Shopify into `static/images/`. Run it before closing Shopify.
- `netlify/functions/book.mjs`: Return to Self session bookings, paid upfront through Stripe. Times, price, notice and blocked dates are in `data/site.json` → `booking` (add dates as "YYYY-MM-DD" to `blocked` for days off). Stripe holds the booking records; a full refund frees the time. Set `BOOKING_ADMIN_KEY` in Netlify to use the private page at `/pages/bookings/`.
