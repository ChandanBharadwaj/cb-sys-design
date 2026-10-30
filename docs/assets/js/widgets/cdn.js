/* Ten PoPs with real LRU+TTL caches, Zipf-distributed requests, optional upper tier with request coalescing. */
SD.widget('cdn', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 380, H = 330, N = 2000, RATE = 300, LAT = { tier: 60, origin: 150 };
  // approximate map positions (x, y), traffic weight
  const POPS = [['SJC', 30, 74, 1.2], ['IAD', 128, 70, 1.2], ['GRU', 138, 168, 0.8], ['LHR', 182, 40, 1], ['FRA', 222, 70, 1], ['JNB', 222, 170, 0.4], ['BOM', 266, 110, 1.4], ['SIN', 304, 150, 0.9], ['NRT', 350, 66, 1], ['SYD', 346, 186, 0.5]];
  const TIER = [80, 28], ORIGIN = [72, 128];
  let tiered = true, utm = false, ttl = 60, cap = 300, t = 0, acc = 0, events = [], flashes = [];
  let ema = { req: 0, hit: 0, tierHit: 0, miss: 0, origin: 0, coal: 0 }, spark = [], sparkT = 0;

  // Zipf(1.0) popularity
  const cdf = []; let tot = 0;
  for (let i = 0; i < N; i++) { tot += 1 / (i + 1); cdf.push(tot); }
  const pickObj = () => { const r = Math.random() * tot; let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; } return lo; };
  const wsum = POPS.reduce((a, p) => a + p[3], 0);
  const pickPop = () => { let r = Math.random() * wsum; for (const p of pops) { r -= p.w; if (r <= 0) return p; } return pops[0]; };

  // LRU with TTL: Map keeps insertion order; re-insert on hit to mark most recent
  const lru = (size) => ({ m: new Map(), size, inflight: new Map(), stat: { req: 0, hit: 0 } });
  function lookup(c, k) { const e = c.m.get(k); if (e === undefined) return false; if (e < t) { c.m.delete(k); return false; } c.m.delete(k); c.m.set(k, e); return true; }
  function store(c, k) { c.m.delete(k); c.m.set(k, t + ttl * 1000); while (c.m.size > c.size) c.m.delete(c.m.keys().next().value); }
  const pops = POPS.map(([id, x, y, w]) => ({ id, x, y, w, c: lru(cap), hitEma: 0.5 }));
  const tier = lru(cap * 5);

  function request() {
    const p = pickPop(), o = pickObj();
    const key = 'o' + o + (utm && Math.random() < 0.6 ? '?utm=' + Math.random().toString(36).slice(2, 8) : '');
    ema.req++; p.c.stat.req++;
    if (lookup(p.c, key)) { ema.hit++; p.hitEma = p.hitEma * 0.98 + 0.02; return; }
    p.hitEma *= 0.98; ema.miss++;
    if (p.c.inflight.has(key)) { ema.coal++; return; }          // coalesced at the edge
    p.c.inflight.set(key, 1);
    const done = (delay) => events.push({ at: t + delay, fn: () => { p.c.inflight.delete(key); store(p.c, key); } });
    if (tiered) {
      flash(p, TIER, 'var(--accent)');
      if (lookup(tier, key)) { ema.tierHit++; done(LAT.tier); return; }
      if (tier.inflight.has(key)) { ema.coal++; done(LAT.tier + LAT.origin); return; } // coalesced at the tier
      tier.inflight.set(key, 1); ema.origin++; flash({ x: TIER[0], y: TIER[1] }, ORIGIN, 'var(--err)');
      events.push({ at: t + LAT.origin, fn: () => { tier.inflight.delete(key); store(tier, key); } });
      done(LAT.tier + LAT.origin);
    } else {
      ema.origin++; flash(p, ORIGIN, 'var(--err)');
      done(LAT.origin);
    }
  }
  function flash(a, b, color) { if (!ctx.reduced && flashes.length < 40) flashes.push({ x1: a.x, y1: a.y, x2: b[0], y2: b[1], color, t0: t }); }

  // controls
  const tierBtn = el('button', { class: 'btn', text: '' });
  const utmBtn = el('button', { class: 'btn', text: '' });
  const purgeBtn = el('button', { class: 'btn primary', text: '🧹 Purge all' });
  const tOut = el('b', { text: '' }), cOut = el('b', { text: '' });
  const tIn = el('input', { type: 'range', min: 2, max: 120, value: ttl, 'aria-label': 'TTL seconds' });
  const cIn = el('input', { type: 'range', min: 20, max: 800, step: 10, value: cap, 'aria-label': 'Cache size per PoP' });
  const paint = () => {
    tierBtn.textContent = 'Upper tier: ' + (tiered ? 'on' : 'off');
    utmBtn.textContent = utm ? 'Cache key: includes ?utm=' : 'Cache key: normalised';
    tOut.textContent = ttl + ' s'; cOut.textContent = cap + ' objects';
  };
  tierBtn.addEventListener('click', () => { tiered = !tiered; paint(); say(tiered ? 'Upper tier on: edge misses go to one tier near the origin, which coalesces them.' : 'Upper tier off: every PoP fetches its own misses from the origin.'); });
  utmBtn.addEventListener('click', () => { utm = !utm; paint(); say(utm ? '60% of requests now carry a unique <code>?utm=</code> value that is part of the cache key. Each one is a new object.' : 'Tracking params stripped from the key again.'); });
  purgeBtn.addEventListener('click', () => { pops.forEach((p) => p.c.m.clear()); tier.m.clear(); say('Purged every PoP and the tier. Watch the origin spike while caches refill.'); });
  tIn.addEventListener('input', () => { ttl = +tIn.value; paint(); });
  cIn.addEventListener('input', () => { cap = +cIn.value; pops.forEach((p) => { p.c.size = cap; }); tier.size = cap * 5; paint(); });
  root.append(el('div', { class: 'w-controls' }, purgeBtn, tierBtn, utmBtn, el('label', null, 'TTL ', tOut, ' ', tIn), el('label', null, 'Cache/PoP ', cOut, ' ', cIn)));

  // drawing
  const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'CDN points of presence, upper tier and origin' });
  S.append(svg('rect', { x: 2, y: 2, width: W - 4, height: 214, rx: 10, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
  for (let x = 38; x < W; x += 38) S.append(svg('line', { x1: x, x2: x, y1: 4, y2: 214, stroke: 'var(--border)', 'stroke-dasharray': '2 5' }));
  for (let y = 46; y < 214; y += 46) S.append(svg('line', { x1: 4, x2: W - 4, y1: y, y2: y, stroke: 'var(--border)', 'stroke-dasharray': '2 5' }));
  const gFx = svg('g');
  S.append(gFx);
  const tierG = svg('g');
  tierG.append(svg('rect', { x: TIER[0] - 38, y: TIER[1] - 13, width: 76, height: 24, rx: 6, fill: 'var(--k-cache)', opacity: 0.9 }),
    svg('text', { x: TIER[0], y: TIER[1] + 5, 'text-anchor': 'middle', style: 'font:700 13px var(--sans)', fill: '#fff', text: 'upper tier' }));
  const origG = svg('g');
  origG.append(svg('rect', { x: ORIGIN[0] - 32, y: ORIGIN[1] - 13, width: 64, height: 24, rx: 6, fill: 'var(--k-external)' }),
    svg('text', { x: ORIGIN[0], y: ORIGIN[1] + 5, 'text-anchor': 'middle', style: 'font:700 13px var(--sans)', fill: '#fff', text: 'origin' }));
  S.append(tierG, origG);
  pops.forEach((p) => {
    p.dot = svg('circle', { cx: p.x, cy: p.y, r: 6 + p.w * 3, stroke: 'var(--surface)', 'stroke-width': 2 });
    S.append(p.dot, svg('text', { x: p.x, y: p.y + 25, 'text-anchor': 'middle', style: 'font:700 13px var(--mono)', fill: 'var(--text-2)', text: p.id }));
  });
  // meters
  const meter = (y, label) => {
    S.append(svg('text', { x: 4, y, style: 'font:600 14px var(--sans)', fill: 'var(--text-2)', text: label }));
    S.append(svg('rect', { x: 118, y: y - 12, width: 150, height: 14, rx: 4, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
    const bar = svg('rect', { x: 118, y: y - 12, width: 0, height: 14, rx: 4 });
    const val = svg('text', { x: W - 4, y, 'text-anchor': 'end', style: 'font:700 14px var(--mono)', fill: 'var(--text)' });
    S.append(bar, val); return { bar, val };
  };
  const mHit = meter(240, 'Edge hit ratio'), mOrig = meter(264, 'Origin req/s');
  S.append(svg('text', { x: 4, y: 290, style: 'font:600 13px var(--sans)', fill: 'var(--text-3)', text: 'Origin load, last 60 s' }));
  S.append(svg('rect', { x: 4, y: 296, width: W - 8, height: 30, rx: 5, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
  const sparkL = svg('polyline', { fill: 'none', stroke: 'var(--err)', 'stroke-width': 2 });
  S.append(sparkL);
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '500px' } }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function say(h) { log.prepend(el('div', { html: h })); while (log.children.length > 30) log.lastChild.remove(); }

  let statT = 0;
  function draw() {
    // per-second rates from decayed counters (time constant ~3 s)
    const k = ema, hitR = k.req ? k.hit / k.req : 0, orps = k.origin / 3;
    mHit.bar.setAttribute('width', 150 * hitR); mHit.bar.setAttribute('fill', hitR > 0.8 ? 'var(--ok)' : hitR > 0.5 ? 'var(--warn)' : 'var(--err)');
    mHit.val.textContent = (hitR * 100).toFixed(1) + '%';
    mOrig.bar.setAttribute('width', Math.min(150, (150 * orps) / RATE)); mOrig.bar.setAttribute('fill', orps < RATE * 0.15 ? 'var(--ok)' : orps < RATE * 0.4 ? 'var(--warn)' : 'var(--err)');
    mOrig.val.textContent = Math.round(orps) + ' / ' + RATE;
    pops.forEach((p) => p.dot.setAttribute('fill', `color-mix(in srgb, var(--ok) ${Math.round(p.hitEma * 100)}%, var(--err))`));
    tierG.setAttribute('opacity', tiered ? 1 : 0.25);
    gFx.innerHTML = '';
    flashes = flashes.filter((f) => t - f.t0 < 450);
    flashes.forEach((f) => gFx.append(svg('line', { x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, stroke: f.color, 'stroke-width': 1.5, opacity: 1 - (t - f.t0) / 450 })));
    if (t - sparkT > 1000) { sparkT = t; spark.push(orps); if (spark.length > 60) spark.shift(); }
    const mx = Math.max(RATE * 0.5, ...spark);
    sparkL.setAttribute('points', spark.map((v, i) => (6 + i * ((W - 12) / 59)).toFixed(1) + ',' + (323 - (v / mx) * 24).toFixed(1)).join(' '));
    if (t - statT > 500) {
      statT = t; stats.innerHTML = '';
      Object.entries({ 'req/s': Math.round(k.req / 3), 'edge hit': (hitR * 100).toFixed(1) + '%', 'tier hit (of misses)': tiered && k.miss ? Math.round((k.tierHit / k.miss) * 100) + '%' : '–', 'coalesced/s': (k.coal / 3).toFixed(1), 'origin/s': Math.round(orps) })
        .forEach(([a, b]) => stats.append(el('span', { class: 'w-stat', html: `${a}: <b>${b}</b>` })));
    }
  }
  function tick(dt) {
    t += dt;
    const decay = Math.exp(-dt / 3000);                          // ~3 s window
    Object.keys(ema).forEach((x) => { ema[x] *= decay; });
    acc += (RATE * dt) / 1000;
    while (acc >= 1) { request(); acc--; }
    events = events.filter((e) => { if (e.at <= t) { e.fn(); return false; } return true; });
  }
  paint();
  say('Caches start cold. Watch the hit ratio climb as popular objects settle in, then try turning the upper tier off.');
  // warm the simulation for a moment so the first frame is not empty
  for (let i = 0; i < 20; i++) tick(50);
  draw();
  ctx.loop((dt) => { tick(dt); draw(); });
});
