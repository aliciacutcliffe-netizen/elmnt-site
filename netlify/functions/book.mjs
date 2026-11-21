// Return to Self session bookings.
// Stripe is the booking record: every booking is a Stripe Checkout session with
// metadata.kind = "booking", so there is no separate database to keep in sync.
//   - A time is taken while someone is paying (30-minute hold) and once it's paid.
//   - If a booking is fully refunded in Stripe, its time opens up again.
// Times, price and notice come from data/site.json → "booking" (built into ../booking.mjs).
// Optional Netlify environment variable BOOKING_ADMIN_KEY switches on the private
// bookings page (/bookings/) and the calendar feed.
import B from "../booking.mjs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const HOLD_MIN = 30;
const DAY = 86400000;

// ---- time zone helpers (Sydney ⇄ UTC, daylight saving handled by Intl) ----
function tzOffsetMs(date, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}
export function zonedToUtc(y, m, d, hh, mm, tz) {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) guess = Date.UTC(y, m - 1, d, hh, mm) - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}
function zonedParts(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(date).map((x) => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, wd, hh: +p.hour, mm: +p.minute };
}
export function label(date, tz = B.tz) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date) + (tz === B.tz ? " (Sydney time)" : "");
}

// Every regular start time in the booking window, as UTC Dates.
export function regularSlots(now = new Date()) {
  const out = [];
  const earliest = now.getTime() + B.minDays * DAY;
  const latest = now.getTime() + B.maxDays * DAY;
  const blocked = new Set(B.blocked || []);
  const start = zonedParts(now, B.tz);
  for (let i = 0; i <= B.maxDays + 1; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!B.days.includes(day.getUTCDay()) || blocked.has(iso)) continue;
    for (const t of B.times) {
      const [hh, mm] = t.split(":").map(Number);
      const at = zonedToUtc(y, m, d, hh, mm, B.tz);
      if (at.getTime() >= earliest && at.getTime() <= latest) out.push(at);
    }
  }
  return out;
}

// ---- Stripe ----
async function stripe(key, path, { method = "GET", form } = {}) {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error?.message || `Stripe error ${res.status}`), { stripe: true });
  return body;
}

// All booking sessions created recently that still hold or own a time.
export async function takenBookings(key, now = new Date()) {
  const since = Math.floor((now.getTime() - (B.maxDays + 5) * DAY) / 1000);
  const out = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ limit: "100", "created[gte]": String(since) });
    q.append("expand[]", "data.payment_intent.latest_charge");
    if (after) q.set("starting_after", after);
    const res = await stripe(key, "checkout/sessions?" + q);
    for (const s of res.data) {
      const md = s.metadata || {};
      if (md.kind !== "booking" || !md.start) continue;
      const charge = s.payment_intent?.latest_charge;
      const refunded = charge && typeof charge === "object" && charge.refunded;
      const paid = s.status === "complete" && s.payment_status === "paid" && !refunded;
      const holding = s.status === "open" && s.expires_at * 1000 > now.getTime();
      if (paid || holding) out.push({ session: s, start: new Date(md.start), paid });
    }
    if (!res.has_more || !res.data.length) break;
    after = res.data[res.data.length - 1].id;
  }
  return out;
}
const overlaps = (a, b) => Math.abs(a.getTime() - b.getTime()) < B.minutes * 60000;

function adminOk(req, url) {
  const k = process.env.BOOKING_ADMIN_KEY;
  if (!k || k.length < 8) return false;
  return req.headers.get("x-admin-key") === k || url.searchParams.get("key") === k;
}

async function createSession(key, origin, start, { tz, custom = false, email } = {}) {
  const form = new URLSearchParams();
  const name = `${B.name} · ${label(start)}`;
  form.append("mode", "payment");
  form.append("currency", "aud");
  form.append("line_items[0][quantity]", "1");
  form.append("line_items[0][price_data][currency]", "aud");
  form.append("line_items[0][price_data][unit_amount]", String(Math.round(B.price * 100)));
  form.append("line_items[0][price_data][product_data][name]", name);
  form.append("line_items[0][price_data][product_data][description]", `${B.subtitle} · ${B.minutes} minutes · online`);
  form.append("metadata[kind]", "booking");
  form.append("metadata[start]", start.toISOString());
  form.append("metadata[client_tz]", String(tz || "").slice(0, 60));
  form.append("metadata[custom]", custom ? "yes" : "no");
  form.append("payment_intent_data[description]", name);
  form.append("payment_intent_data[metadata][kind]", "booking");
  form.append("payment_intent_data[metadata][start]", start.toISOString());
  form.append("custom_fields[0][key]", "name");
  form.append("custom_fields[0][label][type]", "custom");
  form.append("custom_fields[0][label][custom]", "Your name");
  form.append("custom_fields[0][type]", "text");
  form.append("custom_fields[1][key]", "notes");
  form.append("custom_fields[1][label][type]", "custom");
  form.append("custom_fields[1][label][custom]", "Anything you'd like me to know?");
  form.append("custom_fields[1][type]", "text");
  form.append("custom_fields[1][optional]", "true");
  form.append("custom_text[submit][message]", `Your session: ${label(start)}. I'll email you the link to join before we meet.`);
  form.append("allow_promotion_codes", "false");
  form.append("expires_at", String(Math.floor(Date.now() / 1000) + (custom ? 23 * 3600 : HOLD_MIN * 60 + 60)));
  form.append("success_url", `${origin}/pages/booking-confirmed/?session_id={CHECKOUT_SESSION_ID}`);
  form.append("cancel_url", `${origin}/pages/reconnect/#book`);
  if (email) form.append("customer_email", email);
  return stripe(key, "checkout/sessions", { method: "POST", form });
}

function ics(bookings, host) {
  const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s) => String(s || "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const ev = bookings.filter((b) => b.paid).map(({ session: s, start }) => {
    const name = s.custom_fields?.find((f) => f.key === "name")?.text?.value || "";
    const notes = s.custom_fields?.find((f) => f.key === "notes")?.text?.value || "";
    const email = s.customer_details?.email || "";
    return ["BEGIN:VEVENT", `UID:${s.id}@${host}`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(new Date(start.getTime() + B.minutes * 60000))}`, `SUMMARY:${esc(B.name + (name ? " · " + name : ""))}`,
      `DESCRIPTION:${esc(`${email}\nClient time zone: ${s.metadata?.client_tz || "?"}\n${notes}`)}`, "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ELMNT Earth//Bookings//EN", "X-WR-CALNAME:ELMNT bookings", ...ev, "END:VCALENDAR", ""].join("\r\n");
}

export default async (req) => {
  const key = process.env.STRIPE_SECRET_KEY;
  const url = new URL(req.url);
  const origin = process.env.URL || url.origin;
  if (!key) return json({ error: "Booking isn't switched on yet. Please enquire by email." }, 503);
  try {
    if (req.method === "GET") {
      // Confirmation page: is this booking paid?
      const sid = url.searchParams.get("session");
      if (sid) {
        if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return json({ error: "Not found" }, 404);
        const s = await stripe(key, "checkout/sessions/" + sid);
        if (s?.metadata?.kind !== "booking") return json({ error: "Not found" }, 404);
        return json({ paid: s.payment_status === "paid", start: s.metadata.start, minutes: B.minutes, name: B.name });
      }
      // Private calendar feed and bookings list
      if (url.searchParams.has("feed") || url.searchParams.has("admin")) {
        if (!adminOk(req, url)) return json({ error: "Not allowed" }, 403);
        const taken = await takenBookings(key);
        if (url.searchParams.has("feed")) {
          return new Response(ics(taken, url.host), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
        }
        const list = taken.filter((b) => b.start.getTime() > Date.now() - DAY).sort((a, b) => a.start - b.start).map(({ session: s, start, paid }) => ({
          start: start.toISOString(), label: label(start), paid, custom: s.metadata?.custom === "yes",
          name: s.custom_fields?.find((f) => f.key === "name")?.text?.value || "",
          notes: s.custom_fields?.find((f) => f.key === "notes")?.text?.value || "",
          email: s.customer_details?.email || s.customer_email || "", tz: s.metadata?.client_tz || "",
          link: !paid && s.metadata?.custom === "yes" ? s.url : null,
        }));
        return json({ bookings: list });
      }
      // Public: open times
      const taken = await takenBookings(key);
      const slots = regularSlots().filter((t) => !taken.some((b) => overlaps(b.start, t)));
      return json({ tz: B.tz, price: B.price, minutes: B.minutes, slots: slots.map((d) => d.toISOString()) });
    }
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: "Something went wrong. Please refresh and try again." }, 400); }
    let start = new Date(body.start);
    // The private page sends an approved time as Sydney wall-clock time, e.g. "2026-12-03T14:30"
    const syd = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(body.sydney || "");
    if (body.approve && syd) start = zonedToUtc(+syd[1], +syd[2], +syd[3], +syd[4], +syd[5], B.tz);
    if (isNaN(start)) return json({ error: "Please choose a time." }, 400);

    // Private: payment link for a time you've approved
    if (body.approve) {
      if (!adminOk(req, url)) return json({ error: "Not allowed" }, 403);
      if (start.getTime() < Date.now()) return json({ error: "That time has already passed." }, 400);
      const taken = await takenBookings(key);
      if (taken.some((b) => overlaps(b.start, start))) return json({ error: "That time overlaps another booking." }, 409);
      const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email || "") ? body.email : undefined;
      const s = await createSession(key, origin, start, { custom: true, email, tz: body.tz });
      return json({ url: s.url, label: label(start) });
    }

    // Public: book a regular time
    if (!regularSlots().some((t) => t.getTime() === start.getTime())) {
      return json({ error: "That time isn't available any more. Please choose another." }, 409);
    }
    const taken = await takenBookings(key);
    if (taken.some((b) => overlaps(b.start, start))) {
      return json({ error: "Sorry, someone has just booked that time. Please choose another." }, 409);
    }
    const s = await createSession(key, origin, start, { tz: body.tz });
    return json({ url: s.url });
  } catch (e) {
    console.error("Booking error", e);
    return json({ error: "Booking is unavailable right now. Please try again shortly, or enquire by email.", detail: e.stripe ? e.message : undefined }, 502);
  }
};

export const config = { path: "/api/book" };
