/* Count-Min Sketch (d rows, pairwise-independent hashes) + top-5 heap over a Zipf hashtag stream. */
SD.widget('top-k', function (root, ctx) {
  const { el, svg } = ctx;
  const D = 4, K = 5, P = 2147483647; // Mersenne prime 2^31 - 1
  const TAGS = ['#ai', '#news', '#music', '#cricket', '#memes', '#travel', '#food', '#tech', '#gaming', '#art', '#fitness', '#movies', '#crypto', '#books', '#nba', '#f1', '#science', '#fashion', '#pets', '#weather', '#coding', '#anime', '#space', '#yoga', '#cars', '#jobs', '#health', '#diy', '#photo', '#history', '#worldcup'];
  // desktop: sketch and heap side by side (420 wide). Phone: 360 wide, stacked, bigger text.
  const LAYOUT = {
    wide: { W0: 420, H0: 260, GX: 8, GY: 46, GW: 262, GH: 150, hx: 282, hy: 46, hw: 130, rowH: 26, f: 12, fSm: 11, fCell: (cw) => (cw >= 15 ? (cw >= 20 ? 12 : 10.5) : 0) },
    narrow: { W0: 360, H0: 416, GX: 6, GY: 70, GW: 348, GH: 124, hx: 6, hy: 236, hw: 348, rowH: 28, f: 14, fSm: 13.5, fCell: (cw) => (cw >= 26 ? 13.5 : 0) }
  };
  let L = ctx.narrow ? LAYOUT.narrow : LAYOUT.wide;
  // Zipf(s = 1.1) weights; #worldcup (last) starts rare
  const baseW = TAGS.map((_, i) => 1 / Math.pow(i + 1, 1.1));

  // h_i(x) = ((a_i * x + b_i) mod p) mod w : Carter-Wegman pairwise-independent family
  const A = [], B = [];
  for (let i = 0; i < D; i++) { A.push(1 + Math.floor(Math.random() * (P - 2))); B.push(Math.floor(Math.random() * (P - 1))); }
  function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  function mulmod(a, x) { return ((a * (x >>> 16)) % P * 65536 + a * (x & 0xffff)) % P; } // stays < 2^53
  const cellsOf = (tag) => { const x = fnv1a(tag) % P; return A.map((a, i) => ((mulmod(a, x) + B[i]) % P) % w); };

  let w = 12, rows, truth, top, n, burst, running = false, last = null;
  function reset() {
    rows = Array.from({ length: D }, () => new Array(w).fill(0));
    truth = new Map(); top = new Map(); n = 0; burst = 0; last = null;
  }
  reset();

  const runBtn = el('button', { class: 'btn primary', text: '▶ Stream' });
  const stepBtn = el('button', { class: 'btn', text: '+1 event' });
  const burstBtn = el('button', { class: 'btn', text: '⚽ Burst #worldcup' });
  const resetBtn = el('button', { class: 'btn', text: 'Reset' });
  const wOut = el('b', { text: w });
  const wIn = el('input', { type: 'range', min: 6, max: 24, value: w, 'aria-label': 'Sketch width' });
  wIn.addEventListener('input', () => { w = +wIn.value; wOut.textContent = w; reset(); draw(); say(`Width w = ${w}: new empty sketch (ε = e/w = ${(Math.E / w).toFixed(2)}).`); });
  root.append(el('div', { class: 'w-controls' }, runBtn, stepBtn, burstBtn, resetBtn, el('label', null, 'Width w ', wOut, wIn)));

  const S = svg('svg', { role: 'img', 'aria-label': 'Count-Min sketch grid and top-5 heap', style: 'max-width:680px;margin:0 auto' });
  const gHead = svg('g'), gGrid = svg('g'), gHeap = svg('g');
  S.append(gHead, gGrid, gHeap);
  root.append(el('div', { class: 'w-stage' }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); };
  const T = (x, y, text, o) => svg('text', Object.assign({ x, y, text, fill: 'var(--text)', style: `font:600 ${L.f}px var(--sans)` }, o || {}));

  function pick() {
    if (burst > 0) { burst--; if (Math.random() < 0.7) return TAGS[TAGS.length - 1]; }
    const tot = baseW.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (let i = 0; i < TAGS.length; i++) { r -= baseW[i]; if (r <= 0) return TAGS[i]; }
    return TAGS[0];
  }
  const estimate = (tag) => Math.min(...cellsOf(tag).map((c, i) => rows[i][c]));

  function add(tag) {
    const cs = cellsOf(tag);
    cs.forEach((c, i) => { rows[i][c]++; });
    n++;
    truth.set(tag, (truth.get(tag) || 0) + 1);
    const est = estimate(tag);
    // top-K maintenance: update if present, else replace the minimum if larger
    if (top.has(tag) || top.size < K) top.set(tag, est);
    else {
      let minTag = null; top.forEach((v, t) => { if (minTag === null || v < top.get(minTag)) minTag = t; });
      if (est > top.get(minTag)) { top.delete(minTag); top.set(tag, est); say(`${tag} (est ${est}) evicts ${minTag} from the heap.`); }
    }
    top.forEach((_, t) => top.set(t, estimate(t)));       // refresh estimates of candidates
    last = { tag, cs, est };
  }

  function draw() {
    gHead.innerHTML = ''; gGrid.innerHTML = ''; gHeap.innerHTML = '';
    const { W0, H0, GX, GY, GW, GH } = L, narrow = L === LAYOUT.narrow;
    S.setAttribute('viewBox', `0 0 ${W0} ${H0}`);
    if (last) {
      gHead.append(T(GX, 18, 'event: ', { fill: 'var(--text-2)' }), T(GX + (narrow ? 52 : 46), 18, last.tag, { fill: 'var(--accent)', style: `font:700 ${narrow ? 15 : 13}px var(--mono)` }));
      const mono = { fill: 'var(--text-2)', style: `font:500 ${L.fSm}px var(--mono)` };
      if (narrow) gHead.append(T(GX, 40, `cells [${last.cs.join(', ')}]`, mono), T(GX, 58, `est = min = ${last.est} · true = ${truth.get(last.tag)}`, mono));
      else gHead.append(T(GX, 36, `cells [${last.cs.join(', ')}] → est = min = ${last.est}, true = ${truth.get(last.tag)}`, mono));
    } else gHead.append(T(GX, 18, 'press ▶ Stream', { fill: 'var(--text-3)' }));
    const cw = GW / w, ch = GH / D;
    let max = 1; rows.forEach((r) => r.forEach((v) => { if (v > max) max = v; }));
    rows.forEach((r, i) => r.forEach((v, j) => {
      const hit = last && last.cs[i] === j;
      const isMin = hit && v === last.est;
      gGrid.append(svg('rect', { x: GX + j * cw + 1, y: GY + i * ch + 1, width: cw - 2, height: ch - 2, rx: 3,
        fill: `color-mix(in srgb, var(--accent) ${Math.round(8 + 60 * v / max)}%, var(--surface))`,
        stroke: hit ? (isMin ? 'var(--ok)' : 'var(--warn)') : 'var(--border)', 'stroke-width': hit ? 2.5 : 1 }));
      const fc = L.fCell(cw);
      if (fc) gGrid.append(T(GX + j * cw + cw / 2, GY + i * ch + ch / 2 + fc * 0.35, String(v), { 'text-anchor': 'middle', style: `font:500 ${fc}px var(--mono)`, fill: 'var(--text)' }));
    }));
    gGrid.append(T(GX, GY + GH + 16, `d = ${D} rows × w = ${w} · green = the min cell`, { fill: 'var(--text-3)', style: `font:500 ${narrow ? 13.5 : 11}px var(--sans)` }));
    // heap
    const { hx, hy, hw, rowH } = L, fRow = narrow ? 14 : 12, bh = rowH - 4;
    gHeap.append(T(hx, hy + 8, 'top-5 heap', { fill: 'var(--text-2)' }));
    gHeap.append(T(hx + hw - 2, hy + 8, 'est / true', { 'text-anchor': 'end', fill: 'var(--text-3)', style: `font:500 ${narrow ? 13.5 : 10.5}px var(--sans)` }));
    [...top.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, e], i) => {
      const tr = truth.get(t) || 0, over = e - tr, y = hy + 18 + i * rowH;
      gHeap.append(svg('rect', { x: hx, y, width: hw, height: bh, rx: 6, fill: 'var(--surface-2)', stroke: over > 0 ? 'var(--warn)' : 'var(--border)' }));
      gHeap.append(T(hx + 6, y + bh / 2 + fRow * 0.35, t, { style: `font:600 ${fRow}px var(--mono)` }));
      gHeap.append(T(hx + hw - 6, y + bh / 2 + fRow * 0.35, `${e}/${tr}`, { 'text-anchor': 'end', style: `font:600 ${fRow}px var(--mono)`, fill: over > 0 ? 'var(--warn)' : 'var(--text-2)' }));
    });
    gHeap.append(T(hx, hy + 18 + 5 * rowH + 14, 'amber = over-count', { fill: 'var(--text-3)', style: `font:500 ${narrow ? 13.5 : 10.5}px var(--sans)` }));
    // stats
    const eps = Math.E / w, delta = Math.exp(-D);
    let worst = 0; truth.forEach((tr, t) => { worst = Math.max(worst, estimate(t) - tr); });
    stats.innerHTML = '';
    [['N', n], ['ε = e/w', eps.toFixed(3)], ['δ = e^−d', delta.toFixed(3)], ['bound εN', Math.round(eps * n)], ['worst over-count seen', worst], ['distinct tags', truth.size]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  let acc = 0;
  ctx.loop((dt) => {
    if (!running) return;
    acc += dt;
    if (acc > 220) { acc = 0; add(pick()); draw(); }
  });
  runBtn.addEventListener('click', () => {
    if (ctx.reduced) { for (let i = 0; i < 40; i++) add(pick()); draw(); say('Reduced motion: added 40 events at once.'); return; }
    running = !running; runBtn.textContent = running ? '⏸ Pause' : '▶ Stream';
  });
  stepBtn.addEventListener('click', () => { add(pick()); draw(); });
  burstBtn.addEventListener('click', () => { burst += 60; say('⚽ Goal! The next ~60 events are mostly <b>#worldcup</b>. Watch it climb into the heap.'); if (!running && !ctx.reduced) runBtn.click(); });
  resetBtn.addEventListener('click', () => { reset(); log.innerHTML = ''; draw(); say('Reset: empty sketch and heap.'); });

  ctx.onResize((nw) => { L = nw ? LAYOUT.narrow : LAYOUT.wide; draw(); });
  draw();
  say('Each event increments one cell per row. Estimates never go below the true count.');
});
