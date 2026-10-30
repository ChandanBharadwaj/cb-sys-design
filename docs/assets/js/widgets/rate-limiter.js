/* Four real rate-limit algorithms fed the same request stream: token bucket,
   fixed window, sliding log and Cloudflare-style sliding-window counter. */
SD.widget('rate-limiter', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 2;            // window length (s); token bucket refills L tokens per W
  const SPAN = 8;         // seconds of history shown
  let L = 6;              // limit per window
  let now = 0, paused = !!ctx.reduced, steady = false, nextSteady = 0;
  const pending = [];     // scheduled request times

  // ---- controls
  const send1 = el('button', { class: 'btn', text: '+1 request' });
  const burst = el('button', { class: 'btn', text: 'Burst ×8' });
  const edge = el('button', { class: 'btn primary', text: '⚡ Boundary attack' });
  const steadyBtn = el('button', { class: 'btn', text: '≋ Steady 1.5× rate: off' });
  const pauseBtn = el('button', { class: 'btn', text: paused ? '▶ Run clock' : '⏸ Pause' });
  const stepBtn = el('button', { class: 'btn', text: '+0.25 s' });
  const limOut = el('b', { text: L });
  const limIn = el('input', { type: 'range', min: 3, max: 12, value: L, 'aria-label': 'Limit per 2 s window' });
  root.append(el('div', { class: 'w-controls' }, edge, burst, send1, steadyBtn, pauseBtn, stepBtn,
    el('label', null, 'Limit ', limOut, ' / 2 s ', limIn)));

  send1.onclick = () => pending.push(now);
  burst.onclick = () => { for (let i = 0; i < 8; i++) pending.push(now + i * 0.04); };
  edge.onclick = () => {
    const b = (Math.floor(now / W) + 1) * W;          // next fixed-window boundary
    const start = b - now < 0.4 ? b + W : b;          // leave time to see it coming
    for (let i = 0; i < L; i++) { pending.push(start - 0.25 + i * 0.02); pending.push(start + 0.05 + i * 0.02); }
    say(`Attack scheduled: ${L} requests just before t = ${start.toFixed(0)} s and ${L} just after. Limit is ${L} per ${W} s.`);
    attackAt = start + 0.5;
  };
  steadyBtn.onclick = () => { steady = !steady; steadyBtn.textContent = '≋ Steady 1.5× rate: ' + (steady ? 'on' : 'off'); nextSteady = now; };
  pauseBtn.onclick = () => { paused = !paused; pauseBtn.textContent = paused ? '▶ Run clock' : '⏸ Pause'; };
  stepBtn.onclick = () => { advance(0.25); draw(); setStats(); };
  limIn.oninput = () => { L = +limIn.value; limOut.textContent = L; reset(); };
  let attackAt = null;

  // ---- algorithms (each keeps its own state; all see the same requests)
  const algos = [
    { name: 'Token bucket', short: 'Bucket', note: 'cap L, refill L per 2 s',
      init() { this.tokens = L; this.ts = 0; },
      refill(t) { this.tokens = Math.min(L, this.tokens + (t - this.ts) * (L / W)); this.ts = t; },
      try(t) { this.refill(t); if (this.tokens >= 1) { this.tokens -= 1; return true; } return false; },
      gauge(t) { this.refill(t); return [this.tokens / L, this.tokens.toFixed(1) + ' tok']; } },
    { name: 'Fixed window', short: 'Fixed', note: 'count per [k·2s, (k+1)·2s)',
      init() { this.win = 0; this.count = 0; },
      roll(t) { const w = Math.floor(t / W); if (w !== this.win) { this.win = w; this.count = 0; } },
      try(t) { this.roll(t); if (this.count < L) { this.count++; return true; } return false; },
      gauge(t) { this.roll(t); return [this.count / L, this.count + ' / ' + L]; } },
    { name: 'Sliding log', short: 'Log', note: 'exact: timestamps in last 2 s',
      init() { this.log = []; },
      prune(t) { while (this.log.length && this.log[0] <= t - W) this.log.shift(); },
      try(t) { this.prune(t); if (this.log.length < L) { this.log.push(t); return true; } return false; },
      gauge(t) { this.prune(t); return [this.log.length / L, this.log.length + ' / ' + L]; } },
    { name: 'Sliding-window counter', short: 'Counter', note: 'prev × (1 − elapsed/2s) + curr',
      init() { this.win = 0; this.curr = 0; this.prev = 0; },
      roll(t) { const w = Math.floor(t / W); if (w !== this.win) { this.prev = w === this.win + 1 ? this.curr : 0; this.curr = 0; this.win = w; } },
      est(t) { this.roll(t); const el_ = (t - this.win * W) / W; return this.prev * (1 - el_) + this.curr; },
      try(t) { if (this.est(t) + 1 <= L) { this.curr++; return true; } return false; },
      gauge(t) { const e = this.est(t); return [e / L, e.toFixed(1) + ' / ' + L]; } }
  ];

  // ---- drawing
  const VW = (root.clientWidth || window.innerWidth) < 560 ? 360 : 500;   // narrower viewBox on phones keeps text legible
  const LH = 74, X0 = 10, X1 = VW - 98, GX = VW - 74;
  const H = algos.length * LH + 22;
  const S = svg('svg', { viewBox: `0 0 ${VW} ${H}`, role: 'img', 'aria-label': 'Four rate limiter lanes' });
  const gGrid = svg('g'), gTicks = svg('g'), gTop = svg('g');
  S.append(gGrid, gTicks, gTop);
  root.append(el('div', { class: 'w-stage' }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const font = (w, px) => `font:${w} ${px}px var(--sans)`;

  const lanes = algos.map((a, i) => {
    const y = 6 + i * LH;
    gGrid.append(
      svg('rect', { x: 2, y: y, width: VW - 4, height: LH - 6, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--border)' }),
      svg('text', { x: X0, y: y + 17, fill: 'var(--text)', style: font(700, 13), text: a.name }),
      svg('line', { x1: X0, x2: X1, y1: y + 44, y2: y + 44, stroke: 'var(--border)' }),
      svg('rect', { x: GX, y: y + 10, width: 66, height: LH - 26, rx: 5, fill: 'var(--surface)', stroke: 'var(--border)' })
    );
    const peak = svg('text', { x: X1, y: y + 17, 'text-anchor': 'end', style: font(600, 11), fill: 'var(--text-3)' });
    const fill = svg('rect', { x: GX + 2, width: 62, rx: 4 });
    const gtxt = svg('text', { x: GX + 33, y: y + LH - 21, 'text-anchor': 'middle', style: font(700, 12), fill: 'var(--text)' });
    gTop.append(peak, fill, gtxt);
    return { a, y, peak, fill, gtxt, events: [] };
  });
  gGrid.append(svg('text', { x: X1, y: H - 4, 'text-anchor': 'end', style: font(500, 11), fill: 'var(--text-3)', text: 'now →' }),
    svg('text', { x: X0, y: H - 4, style: font(500, 11), fill: 'var(--text-3)', text: '← ' + SPAN + ' s ago · ▲ pass · ▼ 429' }));

  const xOf = (t) => X1 - ((now - t) / SPAN) * (X1 - X0);
  function peakIn(events) {           // most passed requests in any 2 s span (true sliding count)
    const ok = events.filter((e) => e.ok).map((e) => e.t);
    let best = 0, j = 0;
    for (let i = 0; i < ok.length; i++) { while (ok[i] - ok[j] >= W) j++; best = Math.max(best, i - j + 1); }
    return best;
  }
  function draw() {
    gTicks.innerHTML = '';
    // fixed-window boundaries on lane 2, sliding window shading on lanes 3/4
    for (let b = Math.ceil((now - SPAN) / W) * W; b <= now; b += W) {
      const x = xOf(b), y = lanes[1].y;
      gTicks.append(svg('line', { x1: x, x2: x, y1: y + 22, y2: y + LH - 10, stroke: 'var(--accent)', 'stroke-dasharray': '3 3', opacity: 0.6 }));
    }
    [2, 3].forEach((i) => gTicks.append(svg('rect', { x: xOf(now - W), y: lanes[i].y + 22, width: X1 - xOf(now - W), height: LH - 32, fill: 'var(--accent)', opacity: 0.08 })));
    const res = {};
    lanes.forEach((ln) => {
      ln.events = ln.events.filter((e) => now - e.t <= SPAN);
      ln.events.forEach((e) => {
        const x = xOf(e.t);
        gTicks.append(svg('line', { x1: x, x2: x, y1: ln.y + 44, y2: ln.y + (e.ok ? 24 : 62), stroke: e.ok ? 'var(--ok)' : 'var(--err)', 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
      });
      const p = peakIn(ln.events);
      ln.peak.textContent = 'peak ' + p + '/2s';
      ln.peak.setAttribute('fill', p > L ? 'var(--err)' : 'var(--text-3)');
      const [frac, label] = ln.a.gauge(now);
      const h = (LH - 30) * Math.max(0, Math.min(1, frac));
      ln.fill.setAttribute('y', ln.y + LH - 18 - h); ln.fill.setAttribute('height', h);
      ln.fill.setAttribute('fill', ln.a.name === 'Token bucket' ? 'color-mix(in srgb, var(--ok) 55%, transparent)' : frac >= 1 ? 'color-mix(in srgb, var(--err) 50%, transparent)' : 'color-mix(in srgb, var(--accent) 45%, transparent)');
      ln.gtxt.textContent = label;
      res[ln.a.name] = p;
    });
    return res;
  }
  function setStats() {
    stats.innerHTML = '';
    stats.append(el('span', { class: 'w-stat', html: `t: <b>${now.toFixed(1)} s</b>` }), el('span', { class: 'w-stat', html: `limit: <b>${L} / ${W} s</b>` }));
    lanes.forEach((ln) => {
      const ok = ln.events.filter((e) => e.ok).length, no = ln.events.length - ok;
      stats.append(el('span', { class: 'w-stat', html: `${ln.a.short}: <b>${ok}✓ ${no}✗</b>` }));
    });
  }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }

  function advance(dt) {
    const target = now + dt;
    if (steady) while (nextSteady <= target) { pending.push(nextSteady); nextSteady += -Math.log(1 - Math.random()) / (1.5 * L / W); }
    pending.sort((a, b) => a - b);
    while (pending.length && pending[0] <= target) {
      const t = Math.max(now, pending.shift());
      lanes.forEach((ln) => ln.events.push({ t, ok: ln.a.try(t) }));
    }
    now = target;
    if (attackAt != null && now >= attackAt) {
      attackAt = null;
      const r = draw();
      say(`Result: fixed window passed <b>${r['Fixed window']}</b> in one 2 s span (limit ${L}). Token bucket ${r['Token bucket']}, sliding log ${r['Sliding log']}, window counter ${r['Sliding-window counter']}.`);
    }
  }
  function reset() {
    algos.forEach((a) => a.init.call(a));
    algos.forEach((a) => { if (a.ts !== undefined) a.ts = now; if (a.win !== undefined) a.win = Math.floor(now / W); });
    lanes.forEach((ln) => { ln.events = []; });
    pending.length = 0; attackAt = null;
    draw(); setStats();
  }
  reset();
  say('Tip: press ⚡ Boundary attack. Watch the dashed window edge on the fixed-window lane.');
  if (ctx.reduced) say('Reduced motion: the clock is paused. Use +0.25 s or ▶ Run clock.');

  let acc = 0;
  ctx.loop((dt) => {
    if (paused) return;
    advance(Math.min(dt, 100) / 1000);
    draw();
    acc += dt; if (acc > 250) { acc = 0; setStats(); }
  });
});
