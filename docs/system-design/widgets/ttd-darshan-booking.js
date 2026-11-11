/* Release-day simulator. 600 sessions (60 of them bots run by 12 identities) chase 270 tickets in 6 slots.
   A token bucket admits R users/s from the virtual queue. Queue order is FIFO by click time, or a seeded shuffle of
   everyone waiting at T0 followed by FIFO. Admitted users hold k tickets with a conditional decrement on a slot
   counter; holds expire after the TTL, bank failures release at once, and late payers are refunded. */
SD.widget('ttd-darshan-booking', function (root, ctx) {
  const { el, svg } = ctx;
  const SLOTS = [['Sat 7 AM', 3], ['Sat 10 AM', 3], ['Sat 1 PM', 2], ['Mon 7 AM', 1], ['Mon 10 AM', 1], ['Mon 1 PM', 1]];
  const PER_SLOT = 45, QUOTA = SLOTS.length * PER_SLOT, N_BOT = 60, N_HUM = 540, BOT_IDS = 12, STEP = 0.1, T_END = 240;
  const BY_POP = SLOTS.map((_, i) => i).sort((a, b) => SLOTS[b][1] - SLOTS[a][1] || a - b);
  const opt = { order: 'random', limit: true, R: 3, ttl: 40, pf: 15 };
  let seed = 20261001, sim = null, speed = ctx.reduced ? 0 : 8;

  function mulberry(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---- build the crowd (same seed => same crowd, so FIFO vs random is a fair comparison) ----
  function build() {
    const r = mulberry(seed), users = [];
    for (let i = 0; i < N_BOT; i++) users.push({ bot: true, ident: 'B' + (i % BOT_IDS), k: 4, pre: true, lat: r() * 0.25, think: 0.5 + r(), payT: 2 + r() * 4, fate: r() < 0.03 ? 'fail' : 'pay', pref: r() });
    for (let i = 0; i < N_HUM; i++) {
      const pre = r() < 0.45, x = r();
      const fate = (y => y < opt.pf / 100 ? 'fail' : y < opt.pf / 100 + 0.06 ? 'abandon' : 'pay')(r());
      users.push({ bot: false, ident: 'H' + i, k: x < 0.15 ? 1 : x < 0.35 ? 2 : x < 0.55 ? 3 : 4, pre, arrive: pre ? -120 + r() * 119 : -Math.log(1 - r() * 0.98) * 35,
        lat: 0.4 + r() * 5 + (r() < 0.25 ? r() * 4 : 0), think: 4 + r() * 8, payT: 6 + r() * 40, failT: 4 + r() * 18, fate, pref: r() });
    }
    const you = users[N_BOT + 7]; Object.assign(you, { you: true, pre: true, arrive: -30, lat: 2.2, k: 3, fate: 'pay', payT: 20, pref: 0.1 });
    const sh = mulberry(seed ^ 0x9e3779b9);
    users.forEach((u) => {
      if (opt.order === 'fifo') u.key = u.pre ? u.lat : u.arrive;        // everyone fires at T0; fastest click first
      else u.key = u.pre ? sh() * 1e-3 : u.arrive;                       // shuffled pre-queue, then FIFO
      u.join = u.pre ? (opt.order === 'fifo' ? u.lat : 0) : u.arrive;
      u.st = 'queued';
    });
    const queue = users.slice().sort((a, b) => a.key - b.key);
    queue.forEach((u, i) => { u.pos = i; });
    return { users, queue, head: 0, t: 0, tokens: 0, free: SLOTS.map(() => PER_SLOT), held: SLOTS.map(() => 0), sold: SLOTS.map(() => 0),
      holds: [], tries: [], idUsed: {}, hist: [[0, QUOTA, 0]], soldOut: null, bounce: 0, refunds: 0, idRej: 0, unavail: 0,
      botT: 0, humT: 0, humServed: 0, done: false, you, closed: 0 };
  }

  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  const totalFree = () => sim.free.reduce((a, b) => a + b, 0);
  const totalHeld = () => sim.held.reduce((a, b) => a + b, 0);
  function release(h, why) {
    sim.free[h.slot] += h.k; sim.held[h.slot] -= h.k;
    if (opt.limit) delete sim.idUsed[h.u.ident];
    if (sim.soldOut !== null) sim.bounce += h.k;
    h.u.st = why;
  }

  function step() {
    const S = sim, t = (S.t += STEP);
    // token bucket: R tokens/s, burst 2R
    S.tokens = Math.min(S.tokens + opt.R * STEP, Math.max(2, opt.R * 2));
    while (S.tokens >= 1 && S.head < S.queue.length && S.queue[S.head].join <= t) {
      const u = S.queue[S.head++]; S.tokens -= 1; u.st = 'admitted'; S.tries.push([t + u.think, u]);
      if (u.you) say(`🙋 <b>You</b> are admitted at T0+${t.toFixed(0)} s with a signed token. Verifying OTP, picking a slot…`);
    }
    // admitted users try to hold k tickets: conditional decrement on one slot counter
    S.tries = S.tries.filter(([at, u]) => {
      if (at > t) return true;
      if (opt.limit && S.idUsed[u.ident]) { u.st = 'idlimit'; S.idRej++; return false; }
      const first = Math.min(SLOTS.length - 1, Math.floor(Math.pow(u.pref, 1.6) * SLOTS.length));   // weekend slots are wanted most
      const pick = [first].concat(BY_POP.filter((i) => i !== first)).find((i) => S.free[i] >= u.k);
      if (pick === undefined) { u.st = 'unavail'; S.unavail++; if (u.you) say('🙋 <b>You</b> got <b>"Slot Unavailable"</b>: every slot with room for your group is gone.'); return false; }
      S.free[pick] -= u.k; S.held[pick] += u.k; if (opt.limit) S.idUsed[u.ident] = 1;
      const h = { u, slot: pick, k: u.k, exp: t + opt.ttl, payAt: t + u.payT, failAt: t + (u.failT || 3) };
      S.holds.push(h); u.st = 'holding';
      if (S.soldOut === null && totalFree() === 0) { S.soldOut = t; say(`⛔ <b>Quota full</b> at T0+${t.toFixed(0)} s. ${totalHeld()} tickets are still in unpaid holds and may come back.`); }
      return false;
    });
    // settle holds: payment success, bank failure, abandonment, expiry, late payment
    S.holds = S.holds.filter((h) => {
      const u = h.u;
      if (u.fate === 'fail' && t >= h.failAt) { release(h, 'failed'); return false; }
      if (u.fate === 'pay' && t >= h.payAt && h.payAt <= h.exp) {
        S.held[h.slot] -= h.k; S.sold[h.slot] += h.k; u.st = 'booked';
        if (u.bot) S.botT += h.k; else { S.humT += h.k; S.humServed++; }
        if (u.you) say(`🙋 <b>You</b> booked ${h.k} tickets for ${SLOTS[h.slot][0]}. ✅`);
        return false;
      }
      if (t >= h.exp) { release(h, 'expired'); if (u.fate === 'pay') S.refunds++; if (u.you) say('🙋 Your hold expired while the bank was still paying: refund.'); return false; }
      return true;
    });
    if (Math.abs(t - Math.round(t)) < STEP / 2) S.hist.push([t, totalFree(), totalHeld()]);
    const waiting = S.queue.length - S.head;
    if ((S.soldOut !== null && totalFree() === 0 && S.holds.length === 0 && S.tries.length === 0) || t >= T_END || (S.head >= S.queue.length && !S.holds.length && !S.tries.length && t > 200)) {
      S.done = true; S.closed = waiting;
      S.queue.slice(S.head).forEach((u) => { u.st = 'closed'; });
      say(`🔚 T0+${t.toFixed(0)} s: queue closed. ${waiting} sessions still waiting get one clear "quota full" notice. ` +
        `Bots took <b>${pct(S.botT)}</b> of tickets; ${S.humServed} of ${N_HUM} human devotees booked. ${S.bounce} tickets bounced back after the first "quota full"; ${S.refunds} late payers refunded.`);
    }
  }
  const pct = (x) => (S_sold() ? Math.round(x / S_sold() * 100) : 0) + '%';
  const S_sold = () => sim.sold.reduce((a, b) => a + b, 0);

  // ---- controls ----
  const seg = (items, get, set) => { const bs = items.map(([v, l]) => el('button', { class: 'btn' + (get() === v ? ' primary' : ''), text: l, onclick: () => { set(v); bs.forEach((b, i) => { b.className = 'btn' + (items[i][0] === get() ? ' primary' : ''); }); restart(); } })); return bs; };
  const range = (label, key, min, max, stepv, unit) => {
    const out = el('b', { text: opt[key] + unit });
    const inp = el('input', { type: 'range', min, max, step: stepv, value: opt[key], 'aria-label': label });
    inp.addEventListener('change', () => restart());
    inp.addEventListener('input', () => { opt[key] = +inp.value; out.textContent = opt[key] + unit; });
    return el('label', null, label + ' ', out, ' ', inp);
  };
  root.append(
    el('div', { class: 'w-controls' }, seg([['fifo', 'FIFO by click time'], ['random', 'Random at T0']], () => opt.order, (v) => { opt.order = v; }),
      seg([[true, 'Per-ID limit on'], [false, 'Per-ID limit off']], () => opt.limit, (v) => { opt.limit = v; })),
    el('div', { class: 'w-controls' }, range('Admit R', 'R', 1, 10, 1, '/s'), range('Hold TTL', 'ttl', 10, 90, 5, ' s'), range('Bank failures', 'pf', 0, 40, 5, '%')),
    el('div', { class: 'w-controls' },
      el('button', { class: 'btn primary', text: '↺ Replay same crowd', onclick: () => restart() }),
      el('button', { class: 'btn', text: '🎲 New crowd', onclick: () => { seed = (seed * 1103515245 + 12345) >>> 0; restart(); } }),
      el('button', { class: 'btn', text: '⏩ Skip to end', onclick: () => { while (!sim.done) step(); render(); } })));

  const S_ = svg('svg', { style: 'width:100%;max-width:760px;margin:0 auto;display:block', role: 'img', 'aria-label': 'Queue front, slot inventory and free-ticket timeline' });
  const legend = el('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 14px', fontSize: '12.5px', color: 'var(--text-2)', margin: '6px 0 2px' } },
    [['var(--accent)', 'devotee'], ['var(--err)', 'bot session'], ['var(--warn)', 'you'], ['var(--ok)', 'booked'], ['color-mix(in srgb, var(--warn) 55%, var(--surface))', 'held (unpaid)']]
      .map(([c, l]) => el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, el('i', { style: { width: '11px', height: '11px', borderRadius: '50%', background: c, display: 'inline-block' } }), l)));
  const statEl = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(el('div', { class: 'w-stage' }, S_), legend, statEl, log);

  // ---- geometry: phone layout stacks everything in a 360-wide viewBox with 13–14 unit text ----
  const GEO = {
    narrow: { W: 360, H: 452, f: 13.5, q: { x0: 18, y: [44, 70], n: 12, dx: 29, r: 10 }, s: { y0: 104, h: 32, lx: 2, bx: 82, bw: 200, cx: 358 }, c: { x0: 34, x1: 352, y0: 330, y1: 430 } },
    wide: { W: 560, H: 300, f: 13, q: { x0: 128, y: [26], n: 24, dx: 18, r: 7 }, s: { y0: 64, h: 36, lx: 0, bx: 76, bw: 136, cx: 272 }, c: { x0: 318, x1: 552, y0: 74, y1: 268 } }
  };
  let G = ctx.narrow ? GEO.narrow : GEO.wide;
  ctx.onResize((n) => { G = n ? GEO.narrow : GEO.wide; render(); });
  const T = (x, y, text, o) => svg('text', Object.assign({ x, y, fill: 'var(--text)', style: `font:${(o && o.w) || 500} ${(o && o.f) || G.f}px var(--sans)`, text }, o && o.a ? { 'text-anchor': o.a } : {}, o && o.fill ? { fill: o.fill } : {}));

  function render() {
    const S = sim, f = G.f;
    S_.setAttribute('viewBox', `0 0 ${G.W} ${G.H}`);
    S_.innerHTML = '';
    // queue front
    S_.append(T(0, G.q.y.length > 1 ? 18 : G.q.y[0] + 5, ctx.narrow ? 'Queue front (next 24) →' : 'Queue front →', { w: 600 }));
    const front = S.queue.slice(S.head, S.head + 24);
    front.forEach((u, i) => {
      const row = Math.floor(i / G.q.n), col = i % G.q.n;
      if (row >= G.q.y.length) return;
      const cy = G.q.y[row], cx = G.q.x0 + col * G.q.dx;
      const live = u.join <= S.t;
      S_.append(svg('circle', { cx, cy, r: G.q.r, fill: u.you ? 'var(--warn)' : u.bot ? 'var(--err)' : 'var(--accent)', opacity: live ? 1 : 0.35, stroke: u.you ? 'var(--text)' : 'none', 'stroke-width': 2 }));
    });
    if (!front.length) S_.append(T(G.q.x0 - G.q.r, G.q.y[0] + 5, S.done ? 'queue closed' : 'queue empty', { fill: 'var(--text-3)' }));
    // slot inventory bars
    SLOTS.forEach(([name], i) => {
      const y = G.s.y0 + i * G.s.h, bw = G.s.bw, x = G.s.bx, u = bw / PER_SLOT;
      S_.append(T(G.s.lx, y + 15, name, { w: 600 }));
      S_.append(svg('rect', { x, y: y + 1, width: bw, height: 20, rx: 4, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      S_.append(svg('rect', { x, y: y + 1, width: S.sold[i] * u, height: 20, rx: 4, fill: 'var(--ok)' }));
      S_.append(svg('rect', { x: x + S.sold[i] * u, y: y + 1, width: S.held[i] * u, height: 20, fill: 'color-mix(in srgb, var(--warn) 55%, var(--surface))' }));
      S_.append(T(G.s.cx, y + 15, S.free[i] ? S.free[i] + ' left' : 'full', { a: 'end', w: 700, fill: S.free[i] ? 'var(--text)' : 'var(--err)' }));
    });
    // free-ticket timeline
    const c = G.c, tMax = Math.max(60, Math.ceil(S.t / 30) * 30), X = (t) => c.x0 + (t / tMax) * (c.x1 - c.x0), Y = (v) => c.y1 - (v / QUOTA) * (c.y1 - c.y0);
    S_.append(T(c.x0, c.y0 - 10, 'Free tickets vs time', { w: 600 }));
    S_.append(svg('line', { x1: c.x0, y1: c.y1, x2: c.x1, y2: c.y1, stroke: 'var(--border)' }), svg('line', { x1: c.x0, y1: c.y0, x2: c.x0, y2: c.y1, stroke: 'var(--border)' }));
    S_.append(T(c.x0 - 4, c.y0 + 10, String(QUOTA), { a: 'end', f: f - 0.5, fill: 'var(--text-3)' }), T(c.x0 - 4, c.y1, '0', { a: 'end', f: f - 0.5, fill: 'var(--text-3)' }));
    S_.append(T(c.x0, c.y1 + 17, 'T0', { f: f - 0.5, fill: 'var(--text-3)' }), T(c.x1, c.y1 + 17, '+' + tMax + ' s', { a: 'end', f: f - 0.5, fill: 'var(--text-3)' }));
    const pts = (k) => S.hist.map((h) => X(h[0]).toFixed(1) + ',' + Y(h[k]).toFixed(1)).join(' ');
    S_.append(svg('polyline', { points: pts(2), fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
    S_.append(svg('polyline', { points: pts(1), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5 }));
    if (S.soldOut !== null) {
      const sx = X(S.soldOut);
      S_.append(svg('line', { x1: sx, y1: c.y0, x2: sx, y2: c.y1, stroke: 'var(--err)', 'stroke-dasharray': '3 3' }));
      S_.append(T(Math.min(sx + 4, c.x1), c.y0 + 14, 'full +' + Math.round(S.soldOut) + 's', { a: sx > (c.x0 + c.x1) / 2 ? 'end' : 'start', w: 700, fill: 'var(--err)' }));
      if (S.bounce) S_.append(T(c.x1, c.y0 + 32, 'bounce +' + S.bounce, { a: 'end', w: 700, fill: 'var(--warn)' }));
    }
    // HTML stats (never scaled down)
    const you = S.you, waitAhead = Math.max(0, you.pos - S.head);
    const youTxt = { queued: you.join > S.t ? 'clicking…' : '#' + (waitAhead + 1) + ' in line, ETA ~' + Math.ceil(waitAhead / opt.R) + ' s', admitted: 'admitted: OTP + slot', holding: 'holding, paying…', booked: 'booked ✓', unavail: 'Slot Unavailable', expired: 'hold expired', closed: 'quota full notice', idlimit: 'ID limit' }[you.st] || you.st;
    statEl.innerHTML = '';
    Object.entries({ clock: 'T0+' + Math.floor(S.t) + ' s', waiting: S.queue.length - S.head, 'quota full at': S.soldOut === null ? '—' : '+' + Math.round(S.soldOut) + ' s',
      'bots\' share': pct(S.botT), 'humans booked': S.humServed + ' / ' + N_HUM, bounce: S.bounce + ' tickets', 'ID-limit blocks': S.idRej, 'late-pay refunds': S.refunds, you: youTxt })
      .forEach(([k, v]) => statEl.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  function restart() {
    sim = build(); log.innerHTML = '';
    say(`▶ ${opt.order === 'fifo' ? '<b>FIFO</b>: everyone waiting fires at T0, the fastest click goes first' : '<b>Random at T0</b>: everyone waiting at T0 gets a shuffled place, later arrivals queue in order'}. ` +
      `Per-ID limit <b>${opt.limit ? 'on' : 'off'}</b>, R = ${opt.R}/s, TTL ${opt.ttl} s, bank failures ${opt.pf}%.`);
    if (ctx.reduced || speed === 0) while (!sim.done) step();
    render();
  }
  let acc = 0;
  ctx.loop((dt) => {
    if (!sim || sim.done || ctx.reduced) return;
    acc += Math.min(dt, 100) / 1000 * speed;
    while (acc >= STEP && !sim.done) { step(); acc -= STEP; }
    render();
  });
  restart();
});
