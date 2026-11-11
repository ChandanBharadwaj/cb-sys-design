/* Part 1: an OKR traced link by link (objective → KR → journey → NFR → tactic → SLO).
   Part 2: a latency budget waterfall. 2,000 requests are sampled through the tiers with lognormal
   jitter (or served from the edge on a cache hit); the empirical p95 is compared with the target. */
SD.widget('okrs-to-nfrs', function (root, ctx) {
  const { el, svg } = ctx;
  const STEPS = ['Objective', 'Key result', 'User journey', 'NFR scenario', 'Tactic', 'SLO / check'];
  const OKRS = {
    retention: { name: 'Retention', chain: [
      ['Grow retention', 'Customers come back more often. Qualitative, set by leadership.'],
      ['Return 38→42%', 'Seven-day return rate. An outcome with baseline, target and data source, not "ship X".'],
      ['Open app → feed', 'Hypothesis: users who wait for the feed come back less often.'],
      ['p95 load < 200 ms', 'On 4G at peak, 95% of feed loads (RUM LCP) finish within 200 ms.'],
      ['Edge cache + CDN', 'Serve the shell and assets near the user; only misses cross every tier.'],
      ['95% < 200 ms · 28 d', 'Journey SLO from real users, plus a CI load test as a fitness function.']] },
    conversion: { name: 'Conversion', chain: [
      ['Grow revenue', 'More online sales from the same traffic.'],
      ['Conversion 3.1→3.4%', 'Funnel shows failures and timeouts at the payment step.'],
      ['Pay for basket', 'The checkout journey, including the payment provider call.'],
      ['Checkout 99.95%', 'Availability over 28 days, and zero double charges on retry.'],
      ['Multi-AZ + idem. key', 'Survive a zone loss; Idempotency-Key per order makes retries safe.'],
      ['SLO 99.95% · 28 d', 'Burn-rate alerts on the checkout SLO; lost conversion shown in the KR review.']] },
    cost: { name: 'Cost', chain: [
      ['Profitable growth', 'Grow orders without the bill growing as fast.'],
      ['$/order 0.12→0.09', 'Unit economics: allocated cloud cost ÷ orders. The total bill may rise.'],
      ['Browse + order', 'The journeys that drive most of the compute and storage cost.'],
      ['Cost/order ≤ $0.09', 'With p95 latency unchanged as a guard metric.'],
      ['Cache + rightsize', 'Edge cache absorbs reads; rightsize and autoscale the origin.'],
      ['Daily unit-cost check', 'Cost per order from tagged billing data, alert on regression.']] },
    compliance: { name: 'Compliance', chain: [
      ['Pass the audit', 'Win enterprise deals that require a clean security audit.'],
      ['0 major findings', 'And evidence for any control produced within 1 day.'],
      ['Admin changes data', 'Every privileged action on customer data.'],
      ['100% actions audited', 'Tamper-evident log, encrypted at rest, retained 1 year.'],
      ['Audit log + KMS', 'Append-only audit events; keys in a managed KMS with rotation.'],
      ['CI policy check', 'Fitness function: build fails if a service lacks audit or encryption config.']] }
  };
  let okr = 'retention', lit = 0, acc = 0;

  // ---------- part 1: chain ----------
  const okrBtns = Object.keys(OKRS).map((k) => {
    const b = el('button', { class: 'btn', text: OKRS[k].name });
    b.addEventListener('click', () => { okr = k; lit = 0; acc = 0; drawChain(); paintChain(); });
    return b;
  });
  root.append(el('div', { class: 'w-controls' }, ...okrBtns));
  const chainStage = el('div', { class: 'w-stage' });
  const chainNote = el('div', { class: 'w-log', 'aria-live': 'polite', style: { minHeight: '3.2em' } });
  root.append(chainStage, chainNote);
  let C = null;
  function drawChain() {
    chainStage.innerHTML = '';
    const narrow = ctx.narrow, cols = narrow ? 2 : 3;
    const W = narrow ? 360 : 720, bw = narrow ? 160 : 210, bh = narrow ? 62 : 60, gx = (W - cols * bw) / (cols + 1), gy = 34;
    const rows = Math.ceil(STEPS.length / cols), H = rows * bh + (rows - 1) * gy + 12;
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'OKR traceability chain' });
    const pos = STEPS.map((_, i) => {
      const r = Math.floor(i / cols); let c = i % cols; if (r % 2) c = cols - 1 - c; // snake order
      return { x: gx + c * (bw + gx), y: 6 + r * (bh + gy) };
    });
    const arrows = [], boxes = [];
    for (let i = 1; i < pos.length; i++) {
      const a = pos[i - 1], b = pos[i];
      const sameRow = a.y === b.y;
      const x1 = sameRow ? (b.x > a.x ? a.x + bw : a.x) : a.x + bw / 2, y1 = sameRow ? a.y + bh / 2 : a.y + bh;
      const x2 = sameRow ? (b.x > a.x ? b.x : b.x + bw) : b.x + bw / 2, y2 = sameRow ? b.y + bh / 2 : b.y;
      const ln = svg('line', { x1, y1, x2, y2, stroke: 'var(--border)', 'stroke-width': 3 });
      arrows.push(ln); S.append(ln);
    }
    STEPS.forEach((st, i) => {
      const p = pos[i], g = svg('g');
      const r = svg('rect', { x: p.x, y: p.y, width: bw, height: bh, rx: 10, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 2 });
      const t1 = svg('text', { x: p.x + bw / 2, y: p.y + 24, 'text-anchor': 'middle', fill: 'var(--text-3)', style: 'font:600 13px var(--sans)', text: (i + 1) + '. ' + st });
      const t2 = svg('text', { x: p.x + bw / 2, y: p.y + 46, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${narrow ? 14 : 14}px var(--sans)`, text: OKRS[okr].chain[i][0] });
      g.append(r, t1, t2); S.append(g); boxes.push(r);
    });
    chainStage.append(S);
    C = { arrows, boxes };
    okrBtns.forEach((b, i) => b.classList.toggle('primary', Object.keys(OKRS)[i] === okr));
  }
  function paintChain() {
    if (!C) return;
    C.boxes.forEach((r, i) => {
      r.setAttribute('stroke', i < lit ? 'var(--ok)' : i === lit ? 'var(--accent)' : 'var(--border)');
      r.setAttribute('stroke-width', i === lit ? 3.5 : 2);
    });
    C.arrows.forEach((a, i) => a.setAttribute('stroke', i < lit ? 'var(--ok)' : 'var(--border)'));
    const i = Math.min(lit, STEPS.length - 1), c = OKRS[okr].chain[i];
    chainNote.innerHTML = `<b>${i + 1}. ${STEPS[i]}: ${c[0]}</b><br>${c[1]}`;
  }

  // ---------- part 2: latency budget waterfall ----------
  const POOL = [['Edge / CDN', 20, 5], ['Gateway', 5, 10], ['App', 5, 110], ['Database', 2, 25], ['Recs svc', 3, 40], ['Search', 3, 35]];
  let nT = 4, target = 200, hit = 0.8, srvScale = 1;
  const EDGE_HIT = 40, N = 2000;
  root.append(el('h4', { text: 'Latency budget waterfall', style: { margin: '18px 0 4px' } }));
  const tSel = el('select', { 'aria-label': 'Target p95' });
  [100, 200, 300, 500].forEach((v) => { const o = el('option', { value: v, text: 'Target p95 ' + v + ' ms' }); if (v === target) o.selected = true; tSel.append(o); });
  tSel.addEventListener('change', () => { target = +tSel.value; wf(); });
  const add = el('button', { class: 'btn', text: '+ tier' }), rem = el('button', { class: 'btn', text: '− tier' });
  add.addEventListener('click', () => { nT = Math.min(POOL.length, nT + 1); wf(); });
  rem.addEventListener('click', () => { nT = Math.max(1, nT - 1); wf(); });
  const mkRange = (lab, min, max, step, val, on) => {
    const out = el('b'), inp = el('input', { type: 'range', min, max, step, value: val, 'aria-label': lab });
    inp.addEventListener('input', () => on(+inp.value, out)); on(val, out, true);
    return el('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '14px' } }, lab + ' ', inp, out);
  };
  const hitCtl = mkRange('Cache hit', 0, 99, 1, 80, (v, o, init) => { hit = v / 100; o.textContent = v + '%'; if (!init) wf(); });
  const srvCtl = mkRange('Server time ×', 0.5, 2, 0.1, 1, (v, o, init) => { srvScale = v; o.textContent = v.toFixed(1); if (!init) wf(); });
  root.append(el('div', { class: 'w-controls' }, tSel, add, rem, hitCtl, srvCtl));
  const wfStage = el('div', { class: 'w-stage' });
  const stats = el('div', { class: 'w-stats' });
  const verdict = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(wfStage, stats, verdict);

  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function lognorm(r, sigma) { const u = Math.max(1e-9, r()), v = r(); return Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) - sigma * sigma / 2); }
  function simulate(tiers) {
    const r = rng(42), lat = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      if (r() < hit) { lat[i] = EDGE_HIT * lognorm(r, 0.2); continue; }
      let s = 0; tiers.forEach((t) => { s += (t.rtt + t.srv) * lognorm(r, 0.3); }); lat[i] = s;
    }
    const sorted = Array.from(lat).sort((a, b) => a - b);
    return { p50: sorted[Math.floor(0.5 * N)], p95: sorted[Math.floor(0.95 * N)], mean: sorted.reduce((a, x) => a + x, 0) / N };
  }

  function wf() {
    const narrow = ctx.narrow;
    const tiers = POOL.slice(0, nT).map(([name, rtt, srv]) => ({ name, rtt, srv: srv * srvScale }));
    const miss = tiers.reduce((a, t) => a + t.rtt + t.srv, 0);
    const sim = simulate(tiers);
    const W = narrow ? 360 : 720, L = narrow ? 92 : 130, R = 12, rowH = narrow ? 30 : 28, F = narrow ? 14 : 13;
    const rows = tiers.length + 3, top = 26, H = top + rows * rowH + 30;
    const maxV = Math.max(target * 1.25, miss * 1.1, sim.p95 * 1.05);
    const X = (v) => L + (W - L - R) * v / maxV;
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Latency budget waterfall' });
    const txt = (x, y, t, o) => svg('text', Object.assign({ x, y, fill: 'var(--text-3)', style: `font:600 ${F}px var(--sans)`, text: t }, o || {}));
    S.append(txt(4, 16, 'Miss path, per tier (ms)', { fill: 'var(--text)', style: `font:700 ${F}px var(--sans)` }));
    let cum = 0;
    tiers.forEach((t, i) => {
      const y = top + i * rowH;
      S.append(txt(L - 6, y + rowH * 0.62, t.name, { 'text-anchor': 'end' }));
      S.append(svg('rect', { x: X(cum), y: y + 5, width: Math.max(1, X(cum + t.rtt) - X(cum)), height: rowH - 10, fill: 'color-mix(in srgb, var(--accent) 35%, transparent)', rx: 2 }));
      S.append(svg('rect', { x: X(cum + t.rtt), y: y + 5, width: Math.max(1, X(cum + t.rtt + t.srv) - X(cum + t.rtt)), height: rowH - 10, fill: 'var(--accent)', rx: 2 }));
      cum += t.rtt + t.srv;
    });
    const sumRows = [['Hit (edge)', EDGE_HIT, 'var(--ok)'], ['Mean', sim.mean, 'var(--text-3)'], ['p95', sim.p95, sim.p95 <= target ? 'var(--ok)' : 'var(--err)']];
    sumRows.forEach(([l, v, c], j) => {
      const y = top + (tiers.length + j) * rowH + 6;
      S.append(txt(L - 6, y + rowH * 0.62, l, { 'text-anchor': 'end' }));
      S.append(svg('rect', { x: L, y: y + 5, width: Math.max(1, X(v) - L), height: rowH - 10, fill: c, rx: 2 }));
      S.append(txt(Math.min(X(v) + 4, W - R - 40), y + rowH * 0.62, Math.round(v) + '', { fill: 'var(--text)' }));
    });
    const tx = X(target);
    S.append(svg('line', { x1: tx, y1: top - 4, x2: tx, y2: H - 22, stroke: 'var(--err)', 'stroke-width': 2, 'stroke-dasharray': '5 4' }));
    S.append(txt(tx, H - 6, 'target ' + target + ' ms', { 'text-anchor': tx > W - 70 ? 'end' : 'middle', fill: 'var(--err)' }));
    wfStage.innerHTML = ''; wfStage.append(S);

    const need = miss <= target ? '0% (misses fit)' : EDGE_HIT > target ? 'impossible' : '≥ 95%';
    stats.innerHTML = '';
    [['miss path', Math.round(miss) + ' ms'], ['budget/tier', Math.round(target / nT) + ' ms'], ['mean', Math.round(sim.mean) + ' ms'], ['p95', Math.round(sim.p95) + ' ms'], ['hit ratio needed', need]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    const ok = sim.p95 <= target;
    verdict.innerHTML = ok
      ? `✅ <b>p95 ${Math.round(sim.p95)} ms fits under ${target} ms</b> with ${Math.round(target - sim.p95)} ms of slack. ${miss > target ? 'Only because misses are under 5% of requests: watch the hit ratio.' : 'Even a miss fits, so a cache outage will not break the NFR.'}`
      : `❌ <b>p95 ${Math.round(sim.p95)} ms misses ${target} ms</b>${sim.mean <= target ? ` although the mean (${Math.round(sim.mean)} ms) looks fine` : ''}. ${miss > target && hit < 0.95 ? 'More than 5% of requests take the slow path; raise the hit ratio past 95%,' : 'Jitter pushes the tail over;'} or remove a tier, parallelise calls, or cut server time.`;
  }

  ctx.loop((dt) => {
    if (ctx.reduced) return;
    acc += dt;
    if (acc > 900) { acc = 0; lit = lit >= STEPS.length ? 0 : lit + 1; paintChain(); }
  });
  function build() { drawChain(); paintChain(); wf(); }
  if (ctx.reduced) lit = STEPS.length;
  build();
  ctx.onResize(build);
});
