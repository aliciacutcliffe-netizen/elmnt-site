(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const SYD = 'Australia/Sydney';
  const userTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || SYD; } catch (e) { return SYD; } })();
  const sameTz = (a, b) => new Date().toLocaleString('en-US', { timeZone: a }) === new Date().toLocaleString('en-US', { timeZone: b });
  const inSydney = sameTz(userTz, SYD);
  const fmt = (d, opts, tz = userTz) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, ...opts }).format(d);
  const dayKey = d => fmt(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeOf = (d, tz) => fmt(d, { hour: 'numeric', minute: '2-digit' }, tz).replace(' ', ' ');
  const cityOf = tz => (tz.split('/').pop() || tz).replace(/_/g, ' ');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  $$tz();
  function $$tz() { const f = $('[data-tz-field]'); if (f) f.value = userTz; }

  /* ---------- booking calendar (Reconnect page) ---------- */
  const box = $('[data-booker]');
  if (box) {
    let slots = [], day = null, pick = null;
    const days = $('[data-days]', box), times = $('[data-times]', box), btn = $('[data-book]', box), err = $('[data-book-err]', box);
    const showErr = m => { err.textContent = m; err.hidden = !m; };

    function render() {
      const byDay = new Map();
      slots.forEach(s => { const k = dayKey(s); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(s); });
      if (!byDay.size) {
        $('[data-tzline]', box).textContent = 'No times are open right now. Please request a different time below.';
        days.innerHTML = ''; times.innerHTML = ''; btn.disabled = true; return;
      }
      if (!day || !byDay.has(day)) day = null;
      days.innerHTML = [...byDay.entries()].map(([k, list]) => {
        const d = list[0];
        return `<button type="button" class="dchip" data-day="${k}" aria-pressed="${k === day}"><span>${fmt(d, { weekday: 'short' })}</span><strong>${fmt(d, { day: 'numeric' })}</strong><span>${fmt(d, { month: 'short' })}</span></button>`;
      }).join('');
      $('[data-times-head]', box).hidden = !day;
      times.innerHTML = day ? byDay.get(day).map(s => {
        const iso = s.toISOString();
        const syd = inSydney ? '' : `<small>${timeOf(s, SYD)} Sydney</small>`;
        return `<button type="button" class="tchip" data-slot="${iso}" aria-pressed="${pick === iso}">${timeOf(s)}${syd}</button>`;
      }).join('') : '';
      const chosen = pick && slots.find(s => s.toISOString() === pick);
      btn.disabled = !chosen;
      btn.textContent = chosen ? `Book ${fmt(chosen, { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeOf(chosen)} · $120` : (day ? 'Choose a time' : 'Choose a day and time');
    }

    async function load() {
      try {
        const r = await fetch('/api/book', { cache: 'no-store' });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Booking is unavailable right now.');
        slots = d.slots.map(s => new Date(s));
        $('[data-tzline]', box).textContent = inSydney
          ? 'Times are shown in Sydney time.'
          : `Times are shown in your time zone (${cityOf(userTz)}), with Sydney time underneath.`;
        if (pick && !d.slots.includes(pick)) pick = null;
        render();
      } catch (e) {
        $('[data-tzline]', box).textContent = '';
        showErr((e.message || 'Booking is unavailable right now.') + ' You can also request a time below.');
      }
    }

    box.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.day) { day = b.dataset.day; pick = null; showErr(''); return render(); }
      if (b.dataset.slot) { pick = b.dataset.slot; showErr(''); return render(); }
      if (b.matches('[data-book]') && pick) {
        b.disabled = true; b.textContent = 'Opening secure checkout…'; showErr('');
        try {
          const r = await fetch('/api/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: pick, tz: userTz }) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.url) throw Object.assign(new Error(d.error || 'Booking is unavailable right now.'), { status: r.status });
          location.href = d.url;
        } catch (er) {
          showErr(er.message);
          if (er.status === 409) { pick = null; await load(); } else render();
        }
      }
    });
    load();
  }

  /* ---------- booking confirmed ---------- */
  const conf = $('[data-confirm]');
  if (conf) {
    const sid = new URLSearchParams(location.search).get('session_id');
    const head = $('[data-c-head]', conf);
    (async () => {
      try {
        if (!sid) throw new Error();
        const r = await fetch('/api/book?session=' + encodeURIComponent(sid), { cache: 'no-store' });
        const d = await r.json();
        if (!r.ok || !d.paid) throw new Error();
        const start = new Date(d.start), end = new Date(start.getTime() + d.minutes * 60000);
        head.textContent = 'Your session is booked.';
        const facts = $('[data-c-facts]', conf);
        facts.innerHTML = `<li>${esc(fmt(start, { weekday: 'long', day: 'numeric', month: 'long' }))}</li><li>${esc(timeOf(start))}${inSydney ? '' : ' your time'}</li>` +
          (inSydney ? '' : `<li>${esc(timeOf(start, SYD))} Sydney</li>`) + `<li>${d.minutes} minutes · online</li>`;
        facts.hidden = false;
        const st = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const title = 'Return to Self · ELMNT Earth';
        const details = 'Online Reiki & Intuitive Meditation. Your link to join will be emailed to you before the session.';
        $('[data-c-gcal]', conf).href = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) +
          '&dates=' + st(start) + '/' + st(end) + '&details=' + encodeURIComponent(details);
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ELMNT Earth//EN', 'BEGIN:VEVENT', `UID:${sid}@elmntearth.com`, `DTSTAMP:${st(new Date())}`,
          `DTSTART:${st(start)}`, `DTEND:${st(end)}`, `SUMMARY:${title}`, `DESCRIPTION:${details.replace(/[,;]/g, '\\$&')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        $('[data-c-ics]', conf).href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
        $('[data-c-body]', conf).hidden = false;
      } catch (e) {
        head.innerHTML = 'Thank you. If you completed payment, your receipt is on its way and I’ll be in touch by email. Any questions, email <a href="mailto:info@elmntearth.com">info@elmntearth.com</a>.';
      }
    })();
  }

  /* ---------- private bookings page ---------- */
  const adm = $('[data-admin]');
  if (adm) {
    const K = 'elmnt-admin';
    let key = ''; try { key = localStorage.getItem(K) || ''; } catch (e) {}
    const main = $('[data-a-main]', adm), login = $('[data-a-login]', adm), list = $('[data-a-list]', adm), out = $('[data-a-result]', adm);
    const api = (q, opts = {}) => fetch('/api/book' + q, { cache: 'no-store', ...opts, headers: { 'x-admin-key': key, 'Content-Type': 'application/json', ...(opts.headers || {}) } });

    async function open() {
      const r = await api('?admin=1');
      if (r.status === 403) { try { localStorage.removeItem(K); } catch (e) {} login.hidden = false; main.hidden = true; return alert0('That passcode didn’t work.'); }
      const d = await r.json();
      alert0(""); login.hidden = true; main.hidden = false;
      list.innerHTML = d.bookings && d.bookings.length ? d.bookings.map(b => `<div class="bk${b.paid ? '' : ' pending'}">
        <strong>${esc(b.label)}</strong>
        <span>${b.paid ? 'Paid' : (b.custom ? 'Approved time · waiting for payment' : 'Someone is paying now')}</span>
        ${b.name ? `<span>${esc(b.name)}</span>` : ''}${b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}
        ${b.tz ? `<span class="note">Client time zone: ${esc(cityOf(b.tz))} (${esc(timeOf(new Date(b.start), b.tz))} their time)</span>` : ''}
        ${b.notes ? `<span class="note">“${esc(b.notes)}”</span>` : ''}
        ${b.link ? `<button class="rm" type="button" data-share="${esc(b.link)}">Share payment link again</button>` : ''}</div>`).join('')
        : '<p class="note">No upcoming sessions yet.</p>';
    }
    function alert0(m) {
      let el = $('[data-a-err]', adm);
      if (!el) { el = document.createElement('p'); el.className = 'err'; el.dataset.aErr = ''; login.after(el); }
      el.textContent = m;
    }
    async function share(url, text) {
      try { if (navigator.share) { await navigator.share({ title: 'Return to Self booking', text, url }); return; } } catch (e) { return; }
      try { await navigator.clipboard.writeText(url); out.insertAdjacentHTML('beforeend', '<p class="note">Link copied.</p>'); } catch (e) {}
    }

    login.addEventListener('submit', e => { e.preventDefault(); key = login.key.value.trim(); try { localStorage.setItem(K, key); } catch (er) {} open(); });
    $('[data-a-approve]', adm).addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, b = $('button', f);
      b.disabled = true; out.innerHTML = '';
      try {
        const r = await api('', { method: 'POST', body: JSON.stringify({ approve: true, sydney: `${f.date.value}T${f.time.value.slice(0, 5)}`, email: f.email.value }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Could not create the link.');
        out.innerHTML = `<div class="bk"><strong>${esc(d.label)}</strong><span>Send this link to your client. It works for 23 hours.</span>
          <a href="${esc(d.url)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(d.url)}</a>
          <button class="btn" type="button" data-share="${esc(d.url)}">Share link</button></div>`;
        f.reset(); open();
      } catch (er) { out.innerHTML = `<p class="err">${esc(er.message)}</p>`; }
      b.disabled = false;
    });
    adm.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.share) share(b.dataset.share, 'Here is your link to pay for and confirm your Return to Self session:');
      if (b.matches('[data-a-feed]')) {
        const url = `${location.origin}/api/book?feed=1&key=${encodeURIComponent(key)}`;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => { b.textContent = 'Copied'; }, () => prompt('Copy this link', url));
      }
      if (b.matches('[data-a-logout]')) { try { localStorage.removeItem(K); } catch (er) {} location.reload(); }
    });
    if (key) open(); else login.hidden = false;
  }
})();
