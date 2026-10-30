/* Real geohash cells (+8 neighbours) vs an adaptive point quadtree, on a San Francisco bounding box. */
SD.widget('proximity-service', function (root, ctx) {
  const { el, svg } = ctx;
  const L0 = -122.52, L1 = -122.36, A0 = 37.73, A1 = 37.81;          // lng / lat box
  const W = 500, H = Math.round(W * (A1 - A0) / ((L1 - L0) * Math.cos(37.77 * Math.PI / 180)));
  const KM_PX = ((L1 - L0) * 111.32 * Math.cos(37.77 * Math.PI / 180)) / W;
  const X = (lng) => (lng - L0) / (L1 - L0) * W, Y = (lat) => (A1 - lat) / (A1 - A0) * H;
  const LNG = (x) => L0 + x / W * (L1 - L0), LAT = (y) => A1 - y / H * (A1 - A0);
  const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';

  // ---- real geohash ----
  function encode(lat, lng, len) {
    let la = [-90, 90], lo = [-180, 180], even = true, bit = 0, ch = 0, out = '';
    while (out.length < len) {
      const r = even ? lo : la, v = even ? lng : lat, mid = (r[0] + r[1]) / 2;
      if (v >= mid) { ch = (ch << 1) | 1; r[0] = mid; } else { ch <<= 1; r[1] = mid; }
      even = !even;
      if (++bit === 5) { out += B32[ch]; bit = 0; ch = 0; }
    }
    return out;
  }
  function bounds(h) {
    let la = [-90, 90], lo = [-180, 180], even = true;
    for (const c of h) { const n = B32.indexOf(c); for (let b = 4; b >= 0; b--) { const r = even ? lo : la, mid = (r[0] + r[1]) / 2; if ((n >> b) & 1) r[0] = mid; else r[1] = mid; even = !even; } }
    return { la, lo };
  }
  const cellSize = (len) => { const n = 5 * len; return [360 / Math.pow(2, Math.ceil(n / 2)), 180 / Math.pow(2, Math.floor(n / 2))]; };
  function hav(a, b) {
    const R = 6371, t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLo = (b.lng - a.lng) * t;
    const s = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // ---- places ----
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  function randPlace() {
    for (;;) {
      const dense = Math.random() < 0.6;
      const lng = dense ? -122.405 + gauss() * 0.014 : L0 + Math.random() * (L1 - L0);
      const lat = dense ? 37.787 + gauss() * 0.009 : A0 + Math.random() * (A1 - A0);
      if (lng > L0 && lng < L1 && lat > A0 && lat < A1) return { lng, lat, x: X(lng), y: Y(lat) };
    }
  }
  let places = Array.from({ length: 320 }, randPlace);

  // ---- controls ----
  let mode = 'geo', prec = 5, radius = 1.5, last = null;
  const modeBtns = ['geo', 'quad'].map((m) => el('button', { class: 'btn' + (m === mode ? ' primary' : ''), text: m === 'geo' ? 'Geohash' : 'Quadtree', onclick: () => { mode = m; modeBtns.forEach((b, i) => b.className = 'btn' + (['geo', 'quad'][i] === mode ? ' primary' : '')); syncControls(); last = null; draw(); } }));
  const precBtns = [4, 5, 6].map((p) => el('button', { class: 'btn' + (p === prec ? ' primary' : ''), text: 'len ' + p, onclick: () => { prec = p; precBtns.forEach((b, i) => b.className = 'btn' + ([4, 5, 6][i] === prec ? ' primary' : '')); rehash(); if (last) search(last); else draw(); } }));
  const rOut = el('b', { text: radius + ' km' });
  const rIn = el('input', { type: 'range', min: 0.3, max: 3, step: 0.1, value: radius, 'aria-label': 'Radius' });
  rIn.addEventListener('input', () => { radius = +rIn.value; rOut.textContent = radius.toFixed(1) + ' km'; if (last) search(last); });
  const addBtn = el('button', { class: 'btn', text: '+40 places', onclick: () => addPlaces(40) });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset', onclick: () => { places = Array.from({ length: 320 }, randPlace); rehash(); buildTree(); last = null; draw(); say('Reset to 320 places.'); } });
  const precGroup = el('span', { style: { display: 'inline-flex', gap: '6px' } }, precBtns);
  root.append(el('div', { class: 'w-controls' }, modeBtns, precGroup, addBtn, el('label', null, 'Radius ', rOut, ' ', rIn), resetBtn));
  function syncControls() { precGroup.style.display = mode === 'geo' ? 'inline-flex' : 'none'; addBtn.style.display = mode === 'quad' ? '' : 'none'; }

  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, style: 'max-width:820px;margin:0 auto;cursor:crosshair;touch-action:manipulation', role: 'img', 'aria-label': 'Map with places, geohash cells or quadtree' });
  const gBg = svg('g'), gGrid = svg('g'), gHi = svg('g'), gPts = svg('g'), gTop = svg('g');
  S_.append(svg('rect', { x: 0, y: 0, width: W, height: H, fill: 'var(--surface-2)' }), gBg, gHi, gGrid, gPts, gTop);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); };
  function setStats(o) { stats.innerHTML = ''; Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); }

  S_.addEventListener('click', (e) => {
    const pt = S_.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(S_.getScreenCTM().inverse());
    search({ x: p.x, y: p.y, lng: LNG(p.x), lat: LAT(p.y) });
  });

  function rehash() { places.forEach((p) => { p.h = encode(p.lat, p.lng, prec); }); }

  // ---- quadtree (capacity 4, in screen units) ----
  const CAP = 4, MAXD = 9;
  let tree;
  function node(x, y, w, h, d) { return { x, y, w, h, d, pts: [], kids: null }; }
  function insert(n, p) {
    if (n.kids) { insert(n.kids[(p.x >= n.x + n.w / 2 ? 1 : 0) + (p.y >= n.y + n.h / 2 ? 2 : 0)], p); return; }
    n.pts.push(p);
    if (n.pts.length > CAP && n.d < MAXD) {
      const hw = n.w / 2, hh = n.h / 2;
      n.kids = [node(n.x, n.y, hw, hh, n.d + 1), node(n.x + hw, n.y, hw, hh, n.d + 1), node(n.x, n.y + hh, hw, hh, n.d + 1), node(n.x + hw, n.y + hh, hw, hh, n.d + 1)];
      const old = n.pts; n.pts = []; old.forEach((q) => insert(n, q));
    }
  }
  function buildTree() { tree = node(0, 0, W, H, 0); places.forEach((p) => insert(tree, p)); }
  function leaves(n, out) { if (n.kids) n.kids.forEach((k) => leaves(k, out)); else out.push(n); return out; }
  function rangeQuery(n, c, r, acc) {
    const dx = Math.max(n.x - c.x, 0, c.x - (n.x + n.w)), dy = Math.max(n.y - c.y, 0, c.y - (n.y + n.h));
    if (dx * dx + dy * dy > r * r) return;            // node box outside circle: prune
    acc.nodes++;
    if (n.kids) { n.kids.forEach((k) => rangeQuery(k, c, r, acc)); return; }
    acc.leaves.push(n);
    n.pts.forEach((p) => { acc.checked.push(p); if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 <= r * r) acc.hits.push(p); });
  }
  async function addPlaces(k) {
    addBtn.disabled = true;
    for (let i = 0; i < k; i++) {
      const p = randPlace(); p.h = encode(p.lat, p.lng, prec); places.push(p); insert(tree, p);
      if (!ctx.reduced && i % 4 === 3) { draw(); await new Promise((r) => setTimeout(r, 40)); }
    }
    addBtn.disabled = false; if (last) search(last); else draw();
    say(`Added ${k} places (mostly downtown). Leaves split when they exceed ${CAP} points, so the tree is deep downtown and shallow at the edges.`);
  }

  // ---- drawing ----
  const pt = (p, fill, r) => svg('circle', { cx: p.x, cy: p.y, r: r || 2.4, fill, opacity: 0.9 });
  function drawGrid() {
    gGrid.innerHTML = '';
    if (mode === 'geo') {
      const [dl, da] = cellSize(prec);
      for (let g = Math.ceil(L0 / dl) * dl; g < L1; g += dl) gGrid.append(svg('line', { x1: X(g), x2: X(g), y1: 0, y2: H, stroke: 'var(--border)', 'stroke-width': 1 }));
      for (let g = Math.ceil(A0 / da) * da; g < A1; g += da) gGrid.append(svg('line', { x1: 0, x2: W, y1: Y(g), y2: Y(g), stroke: 'var(--border)', 'stroke-width': 1 }));
    } else {
      leaves(tree, []).forEach((n) => gGrid.append(svg('rect', { x: n.x, y: n.y, width: n.w, height: n.h, fill: 'none', stroke: 'var(--border)', 'stroke-width': n.d > 5 ? 0.6 : 1 })));
    }
  }
  function draw(hl) {
    gHi.innerHTML = ''; gPts.innerHTML = ''; gTop.innerHTML = '';
    drawGrid();
    hl = hl || {};
    (hl.rects || []).forEach((r) => gHi.append(svg('rect', r)));
    places.forEach((p) => gPts.append(pt(p, hl.color ? hl.color(p) : 'var(--text-3)', hl.size ? hl.size(p) : 2.4)));
    (hl.top || []).forEach((n) => gTop.append(n));
    if (!hl.rects) setStats(mode === 'geo'
      ? { places: places.length, 'geohash length': prec, cell: cellText(), 'tap the map': 'to search' }
      : { places: places.length, leaves: leaves(tree, []).length, 'tap the map': 'to search' });
  }
  function cellText() { const [dl, da] = cellSize(prec); return (dl * 111.32 * Math.cos(37.77 * Math.PI / 180)).toFixed(1) + ' × ' + (da * 111.32).toFixed(1) + ' km'; }

  function search(q) {
    last = q;
    const rpx = radius / KM_PX;
    const circle = svg('circle', { cx: q.x, cy: q.y, r: rpx, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '5 4' });
    const pin = svg('circle', { cx: q.x, cy: q.y, r: 5, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 });
    const hits = new Set(places.filter((p) => hav(q, p) <= radius));
    if (mode === 'geo') {
      const [dl, da] = cellSize(prec);
      const me = encode(q.lat, q.lng, prec);
      const cells = new Set();
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) cells.add(encode(q.lat + i * da, q.lng + j * dl, prec));
      const rects = [], labels = [];
      cells.forEach((h) => {
        const b = bounds(h), x = X(b.lo[0]), y = Y(b.la[1]), w = X(b.lo[1]) - x, hh = Y(b.la[0]) - y;
        rects.push({ x, y, width: w, height: hh, fill: h === me ? 'color-mix(in srgb, var(--accent) 26%, transparent)' : 'color-mix(in srgb, var(--accent) 11%, transparent)', stroke: 'var(--accent)', 'stroke-width': h === me ? 2 : 0.8 });
        const cx = Math.min(W - 24, Math.max(24, x + w / 2)), cy = Math.min(H - 6, Math.max(12, y + 12));
        if (h === me || prec < 6) labels.push(svg('text', { x: cx, y: cy, 'text-anchor': 'middle', style: `font:${h === me ? 700 : 500} ${prec === 6 ? 8 : 10}px var(--mono);paint-order:stroke;stroke:var(--surface);stroke-width:3px`, fill: 'var(--text)', text: h }));
      });
      const cand = places.filter((p) => cells.has(p.h));
      const candSet = new Set(cand);
      const missed = [...hits].filter((p) => !candSet.has(p));
      draw({
        rects,
        color: (p) => hits.has(p) ? (candSet.has(p) ? 'var(--ok)' : 'var(--err)') : candSet.has(p) ? 'var(--warn)' : 'var(--text-3)',
        size: (p) => hits.has(p) && !candSet.has(p) ? 4.5 : candSet.has(p) || hits.has(p) ? 3 : 2,
        top: [circle, pin].concat(labels)
      });
      const useful = cand.length ? Math.round(100 * (hits.size - missed.length) / cand.length) : 0;
      setStats({ geohash: me, cell: cellText(), scanned: cand.length, 'in radius': hits.size, missed: missed.length, useful: useful + '%' });
      say(`Search <b>${me}</b> + 8 neighbours → ${cand.length} candidates, ${hits.size - missed.length} within ${radius.toFixed(1)} km (${useful}% of the scan was useful).`);
      if (missed.length) say(`<b style="color:var(--err)">⚠ ${missed.length} place(s) missed.</b> Cells (${cellText()}) are smaller than the ${radius.toFixed(1)} km radius, so 9 cells do not cover the circle. Use a shorter geohash.`);
      const near = [...hits].sort((a, b) => hav(q, a) - hav(q, b))[0];
      if (near && near.h !== me) say(`Nearest place (${(hav(q, near) * 1000).toFixed(0)} m away) is in cell <b>${near.h}</b>, not <b>${me}</b>. A prefix-only lookup would have missed it: that is why you read the neighbours.`);
    } else {
      const acc = { nodes: 0, leaves: [], checked: [], hits: [] };
      rangeQuery(tree, q, rpx, acc);
      const chk = new Set(acc.checked), hit = new Set(acc.hits);
      draw({
        rects: acc.leaves.map((n) => ({ x: n.x, y: n.y, width: n.w, height: n.h, fill: 'color-mix(in srgb, var(--accent) 14%, transparent)', stroke: 'var(--accent)', 'stroke-width': 0.8 })),
        color: (p) => hit.has(p) ? 'var(--ok)' : chk.has(p) ? 'var(--warn)' : 'var(--text-3)',
        size: (p) => chk.has(p) ? 3 : 2,
        top: [circle, pin]
      });
      setStats({ places: places.length, 'nodes visited': acc.nodes, 'leaves read': acc.leaves.length, 'points checked': acc.checked.length, 'in radius': acc.hits.length });
      say(`Quadtree: visited ${acc.nodes} nodes, read ${acc.leaves.length} leaves, checked ${acc.checked.length} points → ${acc.hits.length} within ${radius.toFixed(1)} km. Boxes outside the circle were pruned without reading their points.`);
    }
  }

  rehash(); buildTree(); syncControls(); draw();
  search({ x: X(-122.412), y: Y(37.784), lng: -122.412, lat: 37.784 });
  say('Tip: in Geohash mode pick <b>len 6</b> and a 2 km radius, then tap downtown. Some places inside the circle are missed (red).');
});
