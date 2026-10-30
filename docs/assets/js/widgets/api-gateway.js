/* Gateway filter chain: JWT check, real token bucket, TTL cache, circuit breaker state machine, weighted router. */
SD.widget('api-gateway', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 420, ROW = 40, TOP = 30;
  const F = [
    { id: 'log', name: 'Access log + trace', cost: 0.05 },
    { id: 'auth', name: 'JWT auth (cached JWKS)', cost: 0.15 },
    { id: 'rl', name: 'Rate limit 10/s, burst 20', cost: 0.6 },
    { id: 'cache', name: 'Response cache (TTL 5 s)', cost: 0.1 },
    { id: 'cb', name: 'Circuit breaker', cost: 0.02 },
    { id: 'route', name: 'Weighted route 95 / 5', cost: 0.05 }
  ];
  F.forEach((f) => { f.on = true; f.pass = 0; f.rej = 0; });
  const BY = TOP + F.length * ROW + 6, H = BY + 50;
  const TIMEOUT = 1000, CAP = 20;           // backend timeout (ms) and comfortable capacity (req/s)
  let rate = 8, mode = 'healthy', st;

  function reset() {
    st = { bucket: 20, last: 0, cache: {}, cb: 'CLOSED', win: [], openUntil: 0, probes: 0, probeOk: 0,
      sent: 0, ok: 0, e401: 0, e429: 0, e503: 0, e5xx: 0, hits: 0, calls: 0, latSum: 0, latN: 0, ovSum: 0,
      inflight: [], recent: [], acc: 0, now: 0, v2: 0, v2err: 0 };
    F.forEach((f) => { f.pass = 0; f.rej = 0; });
  }
  reset();

  // controls
  const rateOut = el('b', { text: rate });
  const rateIn = el('input', { type: 'range', min: 1, max: 40, value: rate, 'aria-label': 'Request rate' });
  rateIn.addEventListener('input', () => { rate = +rateIn.value; rateOut.textContent = rate; });
  const modeBtn = el('button', { class: 'btn', text: 'Backend: healthy' });
  modeBtn.addEventListener('click', () => {
    mode = { healthy: 'slow', slow: 'failing', failing: 'healthy' }[mode];
    modeBtn.textContent = 'Backend: ' + mode;
    say('Backend is now <b>' + mode + '</b>' + (mode === 'slow' ? ' (1.5 s, past the 1 s timeout)' : mode === 'failing' ? ' (60% 5xx)' : '') + '.');
  });
  const burstBtn = el('button', { class: 'btn primary', text: '⚡ Burst of 40' });
  burstBtn.addEventListener('click', () => { const b = { ok: 0, rl: 0 }; for (let i = 0; i < 40; i++) { const r = handle(); if (r === 200) b.ok++; if (r === 429) b.rl++; } say(`Burst of 40: ${b.rl} got <b>429</b>, ${b.ok} answered 200.` + (F[2].on ? '' : ' Limiter off, so the backend took the whole burst.')); });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  resetBtn.addEventListener('click', () => { reset(); say('Counters reset.'); });
  root.append(el('div', { class: 'w-controls' }, burstBtn, modeBtn, resetBtn, el('label', null, 'Rate ', rateOut, ' req/s ', rateIn)));

  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Gateway filter chain' });
  const gRows = svg('g'), gDots = svg('g');
  S_.append(gRows, gDots);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  say('Tap a filter row to bypass it. Try: backend slow with the breaker off, then on.');

  // static rows
  S_.insertBefore(svg('text', { x: 20, y: 18, style: 'font:700 13px var(--sans)', fill: 'var(--text-2)', text: 'Client requests ↓' }), gRows);
  const rows = F.map((f, i) => {
    const y = TOP + i * ROW;
    const rect = svg('rect', { x: 38, y, width: W - 46, height: ROW - 6, rx: 7, style: 'cursor:pointer' });
    const name = svg('text', { x: 48, y: y + 22, style: 'font:600 13px var(--sans);pointer-events:none' });
    const cnt = svg('text', { x: W - 16, y: y + 22, 'text-anchor': 'end', style: 'font:600 12px var(--mono);pointer-events:none' });
    rect.addEventListener('click', () => { f.on = !f.on; say(`${f.name}: <b>${f.on ? 'on' : 'bypassed'}</b>`); paint(); });
    gRows.append(rect, name, cnt);
    return { rect, name, cnt, y };
  });
  const bRect = svg('rect', { x: 38, y: BY, width: W - 46, height: 42, rx: 7, fill: 'color-mix(in srgb, var(--accent) 10%, var(--surface))', stroke: 'var(--accent)' });
  const bName = svg('text', { x: 48, y: BY + 18, style: 'font:700 13px var(--sans)', fill: 'var(--text)' });
  const bSub = svg('text', { x: 48, y: BY + 35, style: 'font:12px var(--mono)', fill: 'var(--text-2)' });
  gRows.append(svg('line', { x1: 20, y1: TOP, x2: 20, y2: BY + 20, stroke: 'var(--border)', 'stroke-width': 2, 'stroke-dasharray': '3 4' }), bRect, bName, bSub);

  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  function record(fail) {
    if (st.cb === 'HALF_OPEN') {
      if (fail) { st.cb = 'OPEN'; st.openUntil = st.now + 4000; say('Probe failed → breaker <b style="color:var(--err)">OPEN</b> again.'); }
      else if (++st.probeOk >= 3) { st.cb = 'CLOSED'; st.win = []; say('3 probes OK → breaker <b style="color:var(--ok)">CLOSED</b>.'); }
      return;
    }
    st.win.push(fail ? 1 : 0); if (st.win.length > 20) st.win.shift();
    const fails = st.win.reduce((a, b) => a + b, 0);
    if (F[4].on && st.cb === 'CLOSED' && st.win.length >= 10 && fails / st.win.length >= 0.5) {
      st.cb = 'OPEN'; st.openUntil = st.now + 4000;
      say(`Failure rate ${Math.round(100 * fails / st.win.length)}% of last ${st.win.length} → breaker <b style="color:var(--err)">OPEN</b> for 4 s. Calls fail fast.`);
    }
  }
  // one request through the chain; returns status code
  function handle() {
    st.sent++;
    const user = 1 + Math.floor(Math.random() * 50), valid = Math.random() > 0.05;
    const pid = Math.min(19, Math.floor(-Math.log(1 - Math.random()) * 4)); // skewed product popularity
    let ov = 0, stop = -1, code = 200, lat = 0;
    for (let i = 0; i < F.length && stop < 0; i++) {
      const f = F[i];
      if (!f.on) continue;
      ov += f.cost;
      if (f.id === 'auth' && !valid) { code = 401; stop = i; }
      else if (f.id === 'rl') {
        st.bucket = Math.min(20, st.bucket + (st.now - st.last) / 1000 * 10); st.last = st.now;
        if (st.bucket >= 1) st.bucket -= 1; else { code = 429; stop = i; }
      } else if (f.id === 'cache' && (st.cache[pid] || 0) > st.now) { code = 200; stop = i; st.hits++; lat = ov; }
      else if (f.id === 'cb') {
        if (st.cb === 'OPEN' && st.now >= st.openUntil) { st.cb = 'HALF_OPEN'; st.probes = 0; st.probeOk = 0; say('Wait over → <b style="color:var(--warn)">HALF_OPEN</b>: letting 3 probes through.'); }
        if (st.cb === 'OPEN' || (st.cb === 'HALF_OPEN' && st.probes >= 3)) { code = 503; stop = i; }
        else if (st.cb === 'HALF_OPEN') st.probes++;
      }
      if (stop < 0) f.pass++; else if (code !== 200) f.rej++; else f.pass++;
    }
    if (stop < 0) { // proxy to backend
      const v2 = F[5].on && hash(user) % 100 < 5;
      st.calls++; st.recent.push(st.now);
      const load = st.recent.length;            // backend calls in the last second
      let ms = (mode === 'slow' ? 1500 : 40) * (1 + Math.max(0, load - CAP) / 6) * (0.7 + Math.random() * 0.6);
      let err = (mode === 'failing' && Math.random() < 0.6) || (v2 && Math.random() < 0.2) || (load > CAP * 2 && Math.random() < 0.3);
      if (ms > TIMEOUT) { ms = TIMEOUT; err = true; }
      st.inflight.push(st.now + ms);
      if (v2) { st.v2++; if (err) st.v2err++; }
      if (!valid) say('⚠ Unauthenticated request reached the backend (auth bypassed).');
      record(err);
      if (err) code = ms >= TIMEOUT ? 504 : 502; else if (F[3].on) st.cache[pid] = st.now + 5000;
      lat = ov + ms;
    }
    if (code === 200) { st.ok++; st.latSum += lat; st.latN++; }
    else if (code === 401) st.e401++; else if (code === 429) st.e429++; else if (code === 503) st.e503++; else st.e5xx++;
    st.ovSum += ov;
    dot(stop, code);
    return code;
  }

  const dots = [];
  function dot(stop, code) {
    if (ctx.reduced || dots.length > 36) return;
    const c = svg('circle', { r: 4.5, cx: 14 + Math.random() * 12, cy: TOP - 6 });
    gDots.append(c);
    const ty = stop < 0 ? BY + 20 : TOP + stop * ROW + 17;
    const col = code === 200 ? (stop >= 0 ? 'var(--accent)' : 'var(--ok)') : code === 429 || code === 503 ? 'var(--warn)' : 'var(--err)';
    dots.push({ c, y: TOP - 6, ty, t: 0, col });
  }

  function paint() {
    F.forEach((f, i) => {
      const r = rows[i];
      const extra = f.id === 'cb' ? ' · ' + st.cb.replace('_', '-') : f.id === 'rl' ? ' · ' + Math.floor(st.bucket) + ' tok' : '';
      r.rect.setAttribute('fill', f.on ? 'var(--surface-2)' : 'var(--surface)');
      r.rect.setAttribute('stroke', !f.on ? 'var(--border)' : f.id === 'cb' && st.cb !== 'CLOSED' ? (st.cb === 'OPEN' ? 'var(--err)' : 'var(--warn)') : 'var(--border)');
      r.rect.setAttribute('stroke-dasharray', f.on ? '' : '5 4');
      r.rect.setAttribute('stroke-width', f.id === 'cb' && st.cb !== 'CLOSED' && f.on ? 2 : 1);
      r.name.textContent = f.on ? f.name + extra : f.name + ' · off';
      r.name.setAttribute('fill', f.on ? 'var(--text)' : 'var(--text-3)');
      r.cnt.textContent = f.on ? `${f.cost.toFixed(2)}ms ✓${f.pass} ✗${f.rej}` : 'bypassed';
      r.cnt.setAttribute('fill', f.rej ? 'var(--text-2)' : 'var(--text-3)');
    });
    const inflight = st.inflight.length;
    bName.textContent = `Backend: catalog (${mode})`;
    bSub.textContent = `${st.recent.length} calls/s · in flight ${inflight} · v2 err ${st.v2 ? Math.round(100 * st.v2err / st.v2) : 0}%`;
    bRect.setAttribute('stroke', mode === 'healthy' && st.recent.length <= CAP ? 'var(--accent)' : 'var(--err)');
    stats.innerHTML = '';
    const pct = (n) => st.sent ? Math.round(100 * n / st.sent) + '%' : '0%';
    [['sent', st.sent], ['200', pct(st.ok)], ['401', st.e401], ['429', st.e429], ['503 fast-fail', st.e503], ['5xx/504', st.e5xx],
      ['cache hits', pct(st.hits)], ['gateway overhead', (st.sent ? st.ovSum / st.sent : 0).toFixed(2) + ' ms'], ['avg 200 latency', st.latN ? Math.round(st.latSum / st.latN) + ' ms' : '–']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  let last = performance.now();
  ctx.loop((dt) => {
    dt = Math.min(dt, 100);
    st.now += dt;
    st.acc += dt * rate / 1000;
    while (st.acc >= 1) { st.acc -= 1; handle(); }
    st.inflight = st.inflight.filter((t) => t > st.now);
    st.recent = st.recent.filter((t) => t > st.now - 1000);
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      d.t += dt;
      d.y = Math.min(d.ty, d.y + dt * 0.45);
      d.c.setAttribute('cy', d.y);
      d.c.setAttribute('fill', d.y >= d.ty ? d.col : 'var(--text-3)');
      if (d.y >= d.ty) { const k = Math.min(1, (d.t - (d.ty - TOP) / 0.45) / 500); d.c.setAttribute('cx', 26 + k * 10); d.c.setAttribute('opacity', 1 - k); if (k >= 1) { d.c.remove(); dots.splice(i, 1); } }
    }
    if (performance.now() - last > 200) { last = performance.now(); paint(); }
  });
  paint();
});
