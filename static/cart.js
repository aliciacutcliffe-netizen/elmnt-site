(() => {
  const KEY = 'elmnt-cart', RKEY = 'elmnt-region';
  const SHIP = { au: { label: 'Standard $9.95 · Express $15', from: 9.95 }, intl: { label: 'International $20', from: 20 } };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const money = v => '$' + v.toFixed(2);
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let mem = {}, catalog = {}, region = 'au';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return mem; } };
  const save = c => { mem = c; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} };
  try { region = localStorage.getItem(RKEY) || 'au'; } catch (e) {}

  const clamp = (h, q) => {
    const item = catalog[h];
    const max = item ? Math.min(item.s, 20) : 20;
    return Math.max(0, Math.min(q, max));
  };

  function add(h, q = 1) {
    const c = load();
    const item = catalog[h];
    if (item && item.s <= 0) return toast('Sorry, that one has sold out');
    const before = c[h] || 0;
    c[h] = clamp(h, before + q);
    save(c);
    render();
    if (c[h] === before) toast(item && item.s === 1 ? 'That one-of-one piece is already in your cart' : 'That’s all we have in stock');
    else toast('Added to cart');
  }
  function setQty(h, q) {
    const c = load();
    q = clamp(h, q);
    if (q <= 0) delete c[h]; else c[h] = q;
    save(c); render();
  }

  let toastTimer;
  function toast(msg) {
    const t = $('[data-toast]'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function lines() {
    const c = load();
    return Object.entries(c).filter(([h, q]) => catalog[h] && q > 0).map(([h, q]) => ({ h, q: Math.min(q, catalog[h].s), ...catalog[h] }));
  }

  function render() {
    const ls = lines();
    const count = ls.reduce((n, l) => n + l.q, 0);
    $$('[data-cart-count]').forEach(el => el.textContent = count ? count : '');
    const box = $('[data-cart-lines]'), sum = $('[data-cart-summary]');
    if (!box) return;
    if (!ls.length) {
      box.innerHTML = '<p class="empty">Your cart is empty.</p>';
      sum.innerHTML = '<a class="btn full" href="/shop/">Browse the shop</a>';
      return;
    }
    box.innerHTML = ls.map(l => `<div class="line">
      <img src="${escH(l.i)}" alt="">
      <div><div class="t"><a href="/products/${l.h}/">${escH(l.t)}</a></div>
        <div class="qty"><button type="button" data-line="${l.h}" data-d="-1" aria-label="Decrease">−</button><output>${l.q}</output><button type="button" data-line="${l.h}" data-d="1" aria-label="Increase"${l.q >= l.s ? ' disabled' : ''}>+</button></div>
        <button class="rm" type="button" data-rm="${l.h}">Remove</button></div>
      <div class="lp">${money(l.p * l.q)}</div></div>`).join('');
    const sub = ls.reduce((n, l) => n + l.p * l.q, 0);
    sum.innerHTML = `
      <div class="seg" role="group" aria-label="Shipping to">
        <button type="button" data-region="au" aria-pressed="${region === 'au'}">Australia</button>
        <button type="button" data-region="intl" aria-pressed="${region === 'intl'}">International</button>
      </div>
      <div class="sumrow"><span>Subtotal</span><span>${money(sub)}</span></div>
      <div class="sumrow"><span>Shipping</span><span>${SHIP[region].label}</span></div>
      <p class="note" style="margin:0">Choose your shipping speed and enter discount codes at checkout.</p>
      <p class="err" data-err hidden></p>
      <button class="btn full" type="button" data-checkout>Checkout · ${money(sub)} + shipping</button>`;
  }

  async function checkout(btn) {
    const err = $('[data-err]');
    err.hidden = true;
    btn.disabled = true; btn.textContent = 'Opening secure checkout…';
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, items: lines().map(l => ({ h: l.h, q: l.q })) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error((data.error || `Checkout is unavailable right now (error ${res.status}).`) + (data.detail ? ' ' + data.detail : ''));
      location.href = data.url;
    } catch (e) {
      const msg = e.message || 'Checkout could not open. Please try again.';
      render();
      const el = $('[data-err]');
      if (el) { el.textContent = msg; el.hidden = false; }
      toast(msg);
    }
  }

  const open = () => { document.body.classList.add('cart-open'); $('.drawer').setAttribute('aria-hidden', 'false'); };
  const close = () => { document.body.classList.remove('cart-open'); $('.drawer').setAttribute('aria-hidden', 'true'); };

  document.addEventListener('click', e => {
    const t = e.target.closest('button,[data-close-cart]'); if (!t) return;
    if (t.matches('[data-open-cart]')) return open();
    if (t.matches('[data-close-cart]')) return close();
    if (t.dataset.add) {
      let q = 1;
      if (t.hasAttribute('data-with-qty')) q = parseInt($('[data-qty] output').textContent, 10) || 1;
      return add(t.dataset.add, q);
    }
    if (t.dataset.line) return setQty(t.dataset.line, (load()[t.dataset.line] || 0) + Number(t.dataset.d));
    if (t.dataset.rm) return setQty(t.dataset.rm, 0);
    if (t.dataset.region) { region = t.dataset.region; try { localStorage.setItem(RKEY, region); } catch (e) {} return render(); }
    if (t.matches('[data-checkout]')) return checkout(t);
    if (t.dataset.step) {
      const box = t.closest('[data-qty]'), out = $('output', box);
      const max = Math.max(1, Number(box.dataset.max) || 1);
      out.textContent = Math.max(1, Math.min(max, (parseInt(out.textContent, 10) || 1) + Number(t.dataset.step)));
      return;
    }
    if (t.dataset.thumb) {
      const main = $('[data-main]'); main.src = t.dataset.thumb; main.alt = t.dataset.alt;
      $$('[data-thumb]').forEach(b => b.setAttribute('aria-current', b === t ? 'true' : 'false'));
      return;
    }
    if (t.dataset.filter !== undefined) {
      const f = t.dataset.filter;
      history.replaceState(null, '', f ? '#' + f : location.pathname);
      return filter(f);
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  function filter(f) {
    $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b.dataset.filter === f ? 'true' : 'false'));
    $$('[data-grid] .card').forEach(c => c.classList.toggle('hidden', !!f && c.dataset.cat !== f));
  }
  if ($('[data-grid]')) {
    const apply = () => filter(location.hash.slice(1));
    window.addEventListener('hashchange', apply); apply();
  }

  fetch('/catalog.json').then(r => r.json()).then(c => { catalog = c; render(); }).catch(render);
  if (/[?&]cart=open/.test(location.search)) open();
})();
