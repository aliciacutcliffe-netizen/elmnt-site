// Creates a Stripe Checkout session for the whole cart.
// Prices always come from data/products.json on the server, never from the browser,
// so nobody can change a price before paying.
// Needs one environment variable in Netlify: STRIPE_SECRET_KEY (sk_live_... or sk_test_...).
import products from "../catalog.mjs";

const CDN = "https://cdn.shopify.com/s/files/1/0798/6790/4231/";

const INTERNATIONAL = ["AE","AT","BE","BG","CA","CH","CY","CZ","DE","DK","EE","ES","FI","FR","GB","GR","HK","HR","HU","IE","IL","IT","JP","KR","LT","LU","LV","MT","MY","NL","NO","NZ","PL","PT","RO","SE","SG","SI","SK","US"];

const SHIPPING = {
  au: [
    { name: "Standard shipping", cents: 995, min: 5, max: 8 },
    { name: "Express shipping", cents: 1500, min: 1, max: 2 },
  ],
  intl: [{ name: "International shipping", cents: 2000, min: 7, max: 21 }],
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

export default async (req) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (req.method === "GET") {
    // Status check: open /api/checkout in a browser to see if checkout is set up.
    let stripe = "not checked";
    if (key) {
      const r = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${key}` } });
      const b = await r.json().catch(() => ({}));
      stripe = r.ok ? "connected" : `Stripe said: ${b.error?.message || r.status}`;
    }
    return json({ checkout: "running", stripeKeySet: !!key, keyType: key ? key.slice(0, 8) + "…" : null, stripe, products: products.length });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!key) return json({ error: "Checkout isn't switched on yet. Please check back soon." }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Something went wrong. Please refresh and try again." }, 400); }
  const region = body.region === "intl" ? "intl" : "au";
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  const origin = process.env.URL || new URL(req.url).origin;

  const form = new URLSearchParams();
  let n = 0;
  const soldOut = [];
  for (const it of items) {
    const p = products.find((x) => x.h === it.h);
    if (!p) continue;
    const stock = p.stock ?? 0;
    if (stock <= 0) { soldOut.push(p.t); continue; }
    const qty = Math.max(1, Math.min(parseInt(it.q, 10) || 1, stock, 20));
    const image = p.img?.[0]?.[0];
    const imageUrl = image ? (image.startsWith("/") ? origin + image : CDN + image) : null;
    const k = `line_items[${n}]`;
    form.append(`${k}[quantity]`, String(qty));
    form.append(`${k}[price_data][currency]`, "aud");
    form.append(`${k}[price_data][unit_amount]`, String(Math.round(p.p * 100)));
    form.append(`${k}[price_data][product_data][name]`, p.t);
    form.append(`${k}[price_data][product_data][metadata][handle]`, p.h);
    if (imageUrl) form.append(`${k}[price_data][product_data][images][0]`, imageUrl);
    n++;
  }
  if (!n) {
    return json({ error: soldOut.length ? `Sorry, ${soldOut.join(", ")} has just sold out.` : "Your cart is empty." }, 400);
  }

  form.append("mode", "payment");
  form.append("currency", "aud");
  form.append("success_url", `${origin}/thank-you/?session_id={CHECKOUT_SESSION_ID}`);
  form.append("cancel_url", `${origin}/shop/?cart=open`);
  form.append("allow_promotion_codes", "true");
  form.append("billing_address_collection", "auto");
  form.append("phone_number_collection[enabled]", "true");
  form.append("metadata[region]", region);
  (region === "au" ? ["AU"] : INTERNATIONAL).forEach((c, i) =>
    form.append(`shipping_address_collection[allowed_countries][${i}]`, c));
  SHIPPING[region].forEach((s, i) => {
    const k = `shipping_options[${i}][shipping_rate_data]`;
    form.append(`${k}[type]`, "fixed_amount");
    form.append(`${k}[display_name]`, s.name);
    form.append(`${k}[fixed_amount][amount]`, String(s.cents));
    form.append(`${k}[fixed_amount][currency]`, "aud");
    form.append(`${k}[delivery_estimate][minimum][unit]`, "business_day");
    form.append(`${k}[delivery_estimate][minimum][value]`, String(s.min));
    form.append(`${k}[delivery_estimate][maximum][unit]`, "business_day");
    form.append(`${k}[delivery_estimate][maximum][value]`, String(s.max));
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const session = await res.json();
  if (!res.ok) {
    console.error("Stripe error", session.error);
    return json({ error: "Checkout is unavailable right now. Please try again shortly.", detail: session.error?.message }, 502);
  }
  return json({ url: session.url });
};

export const config = { path: "/api/checkout" };
