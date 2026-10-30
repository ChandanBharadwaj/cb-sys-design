/* Real HNSW (layered graph, greedy descent + ef beam search) and real k-means IVF over 2-D points, vs brute force. */
SD.widget('vector-db', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 500, H = 320, N = 170, K = 5, M = 5, M0 = 2 * M, EFC = 24, ML = 1 / Math.log(M), NLIST = 8;
  const LAYER_COL = ['var(--text-3)', 'var(--accent-2)', 'var(--accent)', 'var(--warn)'];
  let mode = 'hnsw', ef = 6, nprobe = 2, busy = false;
  let pts, levels, links, entry, maxL, cent, assign, cnt = 0;

  // ---------- controls ----------
  const hBtn = el('button', { class: 'btn primary', text: 'HNSW' });
  const iBtn = el('button', { class: 'btn', text: 'IVF (k-means, 8 lists)' });
  const setMode = (m) => { if (busy) return; mode = m; hBtn.classList.toggle('primary', m === 'hnsw'); iBtn.classList.toggle('primary', m === 'ivf'); syncSlider(); drawBase(); fx.innerHTML = ''; };
  hBtn.addEventListener('click', () => setMode('hnsw'));
  iBtn.addEventListener('click', () => setMode('ivf'));
  const qBtn = el('button', { class: 'btn primary', text: '🎯 Random query' });
  qBtn.addEventListener('click', () => search({ x: 30 + Math.random() * 440, y: 30 + Math.random() * 260 }));
  const nBtn = el('button', { class: 'btn', text: '↻ New data' });
  nBtn.addEventListener('click', () => { if (!busy) build(); });
  const sOut = el('b'); const sLab = el('span');
  const sIn = el('input', { type: 'range', min: 1, max: 32, value: ef, 'aria-label': 'Search effort' });
  sIn.addEventListener('input', () => { if (mode === 'hnsw') ef = +sIn.value; else nprobe = +sIn.value; sOut.textContent = sIn.value; });
  function syncSlider() {
    sLab.textContent = mode === 'hnsw' ? 'ef ' : 'nprobe ';
    sIn.max = mode === 'hnsw' ? 32 : NLIST; sIn.value = mode === 'hnsw' ? ef : nprobe; sOut.textContent = sIn.value;
  }
  root.append(el('div', { class: 'w-controls' }, hBtn, iBtn, qBtn, nBtn, el('label', null, sLab, sOut, sIn)));

  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Vector index in 2-D', style: 'cursor:crosshair' });
  const gE = svg('g'), gP = svg('g'), fx = svg('g');
  S_.append(svg('rect', { x: 0, y: 0, width: W, height: H, rx: 10, fill: 'var(--surface-2)' }), gE, gP, fx);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  S_.addEventListener('click', (ev) => {
    const r = S_.getBoundingClientRect();
    search({ x: (ev.clientX - r.left) * (W / r.width), y: (ev.clientY - r.top) * (H / r.height) });
  });

  const d2 = (a, b) => { cnt++; return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; };
  const raw = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));

  // ---------- HNSW ----------
  function searchLayer(q, eps, efs, l) {
    const visited = new Set(eps);
    const cand = eps.map((i) => [d2(q, pts[i]), i]);
    const res = cand.slice();
    while (cand.length) {
      cand.sort((a, b) => a[0] - b[0]);
      const [dc, c] = cand.shift();
      res.sort((a, b) => a[0] - b[0]);
      if (res.length >= efs && dc > res[res.length - 1][0]) break;
      for (const n of links[l][c] || []) {
        if (visited.has(n)) continue;
        visited.add(n);
        const dn = d2(q, pts[n]);
        if (res.length < efs || dn < res[res.length - 1][0]) {
          cand.push([dn, n]); res.push([dn, n]); res.sort((a, b) => a[0] - b[0]);
          if (res.length > efs) res.pop();
        }
      }
    }
    return { res, visited };
  }
  function greedy(q, ep, l, path) {
    let best = ep, bd = d2(q, pts[ep]), moved = true;
    while (moved) {
      moved = false;
      for (const n of links[l][best] || []) { const dn = d2(q, pts[n]); if (dn < bd) { if (path) path.push([best, n, l]); bd = dn; best = n; moved = true; } }
    }
    return best;
  }
  function insert(i) {
    const lvl = Math.min(3, Math.floor(-Math.log(1 - Math.random()) * ML));
    levels[i] = lvl;
    for (let l = 0; l <= lvl; l++) links[l][i] = [];
    if (entry < 0) { entry = i; maxL = lvl; return; }
    let ep = entry;
    for (let l = maxL; l > lvl; l--) ep = greedy(pts[i], ep, l);
    for (let l = Math.min(lvl, maxL); l >= 0; l--) {
      const { res } = searchLayer(pts[i], [ep], EFC, l);
      const cap = l === 0 ? M0 : M;
      const nb = res.filter((x) => x[1] !== i).slice(0, M).map((x) => x[1]);
      links[l][i] = nb;
      nb.forEach((n) => {
        links[l][n].push(i);
        if (links[l][n].length > cap) { links[l][n].sort((a, b) => raw(pts[n], pts[a]) - raw(pts[n], pts[b])); links[l][n].length = cap; }
      });
      ep = res[0][1];
    }
    if (lvl > maxL) { maxL = lvl; entry = i; }
  }

  // ---------- IVF (k-means) ----------
  function kmeans() {
    cent = []; const used = new Set();
    while (cent.length < NLIST) { const i = Math.floor(Math.random() * N); if (!used.has(i)) { used.add(i); cent.push({ x: pts[i].x, y: pts[i].y }); } }
    for (let it = 0; it < 12; it++) {
      assign = pts.map((p) => { let b = 0; cent.forEach((c, j) => { if (raw(p, c) < raw(p, cent[b])) b = j; }); return b; });
      cent = cent.map((c, j) => { const mem = pts.filter((_, i) => assign[i] === j); return mem.length ? { x: mem.reduce((a, p) => a + p.x, 0) / mem.length, y: mem.reduce((a, p) => a + p.y, 0) / mem.length } : c; });
    }
  }

  function build() {
    const blobs = Array.from({ length: 6 }, () => ({ x: 60 + Math.random() * 380, y: 50 + Math.random() * 220 }));
    pts = Array.from({ length: N }, () => {
      if (Math.random() < 0.82) { const b = blobs[Math.floor(Math.random() * blobs.length)]; const r = 34 * Math.sqrt(-2 * Math.log(1 - Math.random())), a = Math.random() * 2 * Math.PI; return { x: Math.max(8, Math.min(W - 8, b.x + r * Math.cos(a))), y: Math.max(8, Math.min(H - 8, b.y + r * Math.sin(a))) }; }
      return { x: 10 + Math.random() * (W - 20), y: 10 + Math.random() * (H - 20) };
    });
    levels = []; links = [{}, {}, {}, {}]; entry = -1; maxL = 0;
    pts.forEach((_, i) => insert(i));
    kmeans();
    log.innerHTML = '';
    const perL = [0, 1, 2, 3].map((l) => levels.filter((x) => x >= l).length);
    say(`Built HNSW (M=${M}, layer 0 keeps ${M0}): nodes per layer ${perL.filter((x) => x).join(' → ')}. Built IVF with ${NLIST} k-means lists.`);
    drawBase(); fx.innerHTML = '';
    setStats({ vectors: N, 'tap the map': 'to search' });
  }

  function drawBase() {
    gE.innerHTML = ''; gP.innerHTML = '';
    if (mode === 'hnsw') {
      for (let l = 0; l <= maxL; l++) {
        const seen = new Set();
        Object.keys(links[l]).forEach((k) => links[l][k].forEach((n) => {
          const a = +k, key = a < n ? a + '-' + n : n + '-' + a; if (seen.has(key)) return; seen.add(key);
          gE.append(svg('line', { x1: pts[a].x, y1: pts[a].y, x2: pts[n].x, y2: pts[n].y, stroke: LAYER_COL[l], 'stroke-width': l ? 1.2 + l * 0.6 : 0.7, opacity: l ? 0.55 : 0.35 }));
        }));
      }
      pts.forEach((p, i) => gP.append(svg('circle', { cx: p.x, cy: p.y, r: 3 + levels[i] * 2.2, fill: LAYER_COL[levels[i]], stroke: 'var(--surface)', 'stroke-width': 1 })));
    } else {
      pts.forEach((p, i) => gP.append(svg('circle', { cx: p.x, cy: p.y, r: 3.6, fill: `hsl(${assign[i] * 45} 60% 52%)`, opacity: 0.85 })));
      cent.forEach((c, j) => gP.append(svg('rect', { x: c.x - 6, y: c.y - 6, width: 12, height: 12, rx: 2, fill: `hsl(${j * 45} 60% 42%)`, stroke: 'var(--surface)', 'stroke-width': 2 })));
    }
  }

  function ring(i, color, dash, r) { fx.append(svg('circle', { cx: pts[i].x, cy: pts[i].y, r: r || 8, fill: 'none', stroke: color, 'stroke-width': 2.2, 'stroke-dasharray': dash || '' })); }
  function exactTopK(q) { return pts.map((p, i) => [raw(q, p), i]).sort((a, b) => a[0] - b[0]).slice(0, K).map((x) => x[1]); }

  async function search(q) {
    if (busy) return;
    busy = true; fx.innerHTML = ''; drawBase();
    fx.append(svg('path', { d: `M${q.x - 8},${q.y} h16 M${q.x},${q.y - 8} v16`, stroke: 'var(--err)', 'stroke-width': 3 }), svg('circle', { cx: q.x, cy: q.y, r: 4, fill: 'var(--err)' }));
    const exact = exactTopK(q);
    let found, extra;
    cnt = 0;
    if (mode === 'hnsw') {
      const path = []; let ep = entry;
      ring(entry, 'var(--warn)', '', 11);
      for (let l = maxL; l >= 1; l--) ep = greedy(q, ep, l, path);
      say(`Start at entry point (layer ${maxL}). Greedy descent: ${path.length} hop(s) through upper layers.`);
      for (const [a, b, l] of path) {
        fx.append(svg('line', { x1: pts[a].x, y1: pts[a].y, x2: pts[b].x, y2: pts[b].y, stroke: LAYER_COL[l], 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
        await sleep(260);
      }
      const efs = Math.max(ef, K);
      const { res, visited } = searchLayer(q, [ep], efs, 0);
      visited.forEach((i) => fx.append(svg('circle', { cx: pts[i].x, cy: pts[i].y, r: 4.5, fill: 'var(--warn)', opacity: 0.8 })));
      await sleep(400);
      found = res.slice(0, K).map((x) => x[1]);
      extra = { 'upper-layer hops': path.length, 'layer-0 visited': visited.size };
      say(`Layer 0 beam search with ef=${efs}: visited ${visited.size} nodes.`);
    } else {
      const order = cent.map((c, j) => [d2(q, c), j]).sort((a, b) => a[0] - b[0]).slice(0, nprobe).map((x) => x[1]);
      const probe = new Set(order);
      const candidates = pts.map((p, i) => i).filter((i) => probe.has(assign[i]));
      order.forEach((j) => fx.append(svg('line', { x1: q.x, y1: q.y, x2: cent[j].x, y2: cent[j].y, stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '5 4' })));
      await sleep(300);
      gP.querySelectorAll('circle').forEach((c, i) => { if (!probe.has(assign[i])) c.setAttribute('opacity', 0.15); });
      found = candidates.map((i) => [d2(q, pts[i]), i]).sort((a, b) => a[0] - b[0]).slice(0, K).map((x) => x[1]);
      extra = { 'lists probed': nprobe + '/' + NLIST, 'vectors scanned': candidates.length };
      say(`Compared to ${NLIST} centroids, then scanned the ${nprobe} nearest list(s): ${candidates.length} vectors.`);
    }
    exact.forEach((i) => ring(i, 'var(--text)', '3 3', 11));
    found.forEach((i) => ring(i, 'var(--ok)', '', 7));
    const hits = found.filter((i) => exact.includes(i)).length;
    setStats(Object.assign({ 'distance computations': cnt, 'brute force': N, ['recall@' + K]: hits + '/' + K }, extra));
    say(`Result: <b>${hits}/${K}</b> of the true nearest (dashed) found (green) with ${cnt} distance computations vs ${N} for brute force.` + (hits < K ? ' Raise ' + (mode === 'hnsw' ? 'ef' : 'nprobe') + ' to trade speed for recall.' : ''));
    busy = false;
  }

  function setStats(o) { stats.innerHTML = ''; Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }

  syncSlider();
  build();
  search({ x: 250, y: 160 });
});
