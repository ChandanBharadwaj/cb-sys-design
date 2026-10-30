/* Consistent hash ring with virtual nodes (FNV-1a hashing) vs hash % N.
   Add / remove nodes and measure the share of keys that change owner. */
SD.widget('distributed-cache', function (root, ctx) {
  const { el, svg } = ctx;
  const KEYS = 300;
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#84cc16', '#ec4899'];
  const VOPTS = [1, 4, 16, 64, 160];
  let mode = 'ring', vIdx = 2, nodes = ['A', 'B', 'C', 'D'], nextName = 4;
  let owner = [], moved = new Set(), lastMove = null;

  // 32-bit FNV-1a with a final avalanche mix, so short similar strings spread well
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  const keyH = Array.from({ length: KEYS }, (_, i) => hash('user:' + i));

  // ---- controls
  const addBtn = el('button', { class: 'btn primary', text: '+ Add node' });
  const rmBtn = el('button', { class: 'btn', text: '− Remove node' });
  const modeBtn = el('button', { class: 'btn', text: 'Scheme: consistent hash' });
  const vOut = el('b', { text: VOPTS[vIdx] });
  const vIn = el('input', { type: 'range', min: 0, max: VOPTS.length - 1, value: vIdx, 'aria-label': 'Virtual nodes per server' });
  root.append(el('div', { class: 'w-controls' }, addBtn, rmBtn, modeBtn, el('label', null, 'vnodes/server ', vOut, ' ', vIn)));

  const VW = (root.clientWidth || window.innerWidth) < 560 ? 360 : 760;
  const phone = VW < 400;
  const R = phone ? 128 : 150, CX = phone ? VW / 2 : 210, CY = R + 24;
  const BX = phone ? 20 : 440, BY = phone ? 2 * R + 60 : 50, BW = phone ? VW - 40 : 290;
  const H = phone ? BY + 8 * 24 + 10 : 2 * R + 50;
  const S = svg('svg', { viewBox: `0 0 ${VW} ${H}`, role: 'img', 'aria-label': 'Hash ring' });
  const gRing = svg('g'), gV = svg('g'), gK = svg('g'), gBars = svg('g');
  S.append(gRing, gV, gK, gBars);
  root.append(el('div', { class: 'w-stage' }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (h) => { log.prepend(el('div', { html: h })); while (log.children.length > 30) log.lastChild.remove(); };
  gRing.append(svg('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: 'var(--border)', 'stroke-width': 3 }));
  const centre = svg('text', { x: CX, y: CY + 5, 'text-anchor': 'middle', style: 'font:700 15px var(--sans)', fill: 'var(--text)' });
  const centre2 = svg('text', { x: CX, y: CY + 24, 'text-anchor': 'middle', style: 'font:500 12px var(--sans)', fill: 'var(--text-3)' });
  gRing.append(centre, centre2);

  const ang = (h) => (h / 4294967296) * Math.PI * 2 - Math.PI / 2;
  const colorOf = (name) => COLORS[(name.charCodeAt(0) - 65) % COLORS.length];

  function computeOwners() {
    if (mode === 'mod') return keyH.map((h) => nodes[h % nodes.length]);
    const V = VOPTS[vIdx];
    const ring = [];
    nodes.forEach((n) => { for (let j = 0; j < V; j++) ring.push({ h: hash(n + '#vn' + j), n }); });
    ring.sort((a, b) => a.h - b.h);
    return keyH.map((h) => {                     // first vnode clockwise (binary search)
      let lo = 0, hi = ring.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (ring[m].h < h) lo = m + 1; else hi = m; }
      return ring[lo % ring.length].n;
    });
  }

  function draw() {
    gV.innerHTML = ''; gK.innerHTML = ''; gBars.innerHTML = '';
    if (mode === 'ring') {
      const V = VOPTS[vIdx];
      nodes.forEach((n) => {
        for (let j = 0; j < V; j++) {
          const a = ang(hash(n + '#vn' + j));
          const x1 = CX + Math.cos(a) * (R - 9), y1 = CY + Math.sin(a) * (R - 9), x2 = CX + Math.cos(a) * (R + 9), y2 = CY + Math.sin(a) * (R + 9);
          gV.append(svg('line', { x1, y1, x2, y2, stroke: colorOf(n), 'stroke-width': V > 60 ? 1.5 : 3, 'stroke-linecap': 'round' }));
          if (V <= 4) gV.append(svg('text', { x: CX + Math.cos(a) * (R + 20), y: CY + Math.sin(a) * (R + 20) + 4, 'text-anchor': 'middle', style: 'font:700 12px var(--sans)', fill: colorOf(n), text: n }));
        }
      });
    }
    keyH.forEach((h, i) => {
      const a = ang(h), rr = R - 22 - (i % 5) * 9;
      const isMoved = moved.has(i);
      gK.append(svg('circle', { cx: CX + Math.cos(a) * rr, cy: CY + Math.sin(a) * rr, r: isMoved ? 4.2 : 2.6, fill: colorOf(owner[i]), stroke: isMoved ? 'var(--text)' : 'none', 'stroke-width': 1.2 }));
    });
    const counts = {}; nodes.forEach((n) => { counts[n] = 0; }); owner.forEach((n) => { counts[n]++; });
    const avg = KEYS / nodes.length, max = Math.max(...Object.values(counts));
    const scale = (BW - 64) / Math.max(max, avg * 1.6);
    gBars.append(svg('text', { x: BX, y: BY - 10, style: 'font:700 12px var(--sans)', fill: 'var(--text-2)', text: 'Keys per node (avg ' + Math.round(avg) + ')' }));
    nodes.forEach((n, i) => {
      const y = BY + i * 24;
      gBars.append(svg('text', { x: BX, y: y + 13, style: 'font:700 13px var(--sans)', fill: colorOf(n), text: n }),
        svg('rect', { x: BX + 18, y: y + 2, width: Math.max(2, counts[n] * scale), height: 14, rx: 3, fill: colorOf(n), opacity: 0.8 }),
        svg('text', { x: BX + 24 + counts[n] * scale, y: y + 13, style: 'font:600 12px var(--mono)', fill: 'var(--text-2)', text: counts[n] }));
    });
    const ax = BX + 18 + avg * scale;
    gBars.append(svg('line', { x1: ax, x2: ax, y1: BY - 2, y2: BY + nodes.length * 24, stroke: 'var(--text-3)', 'stroke-dasharray': '3 3' }));
    if (phone) S.setAttribute('viewBox', `0 0 ${VW} ${BY + nodes.length * 24 + 8}`);
    centre.textContent = lastMove == null ? nodes.length + ' nodes' : Math.round(lastMove * 100) + '% moved';
    centre2.textContent = mode === 'ring' ? VOPTS[vIdx] + ' vnodes each' : 'hash % ' + nodes.length;
    stats.innerHTML = '';
    [['nodes', nodes.length], ['scheme', mode === 'ring' ? 'ring' : 'mod N'], ['last change moved', lastMove == null ? '–' : (lastMove * 100).toFixed(1) + '%'],
      ['ideal (ring)', lastMove == null ? '–' : (100 / Math.max(nodes.length, prevN)).toFixed(1) + '%'], ['max / avg load', (max / avg).toFixed(2) + '×']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  let prevN = nodes.length, fade = 0;
  function change(desc, fn) {
    const before = owner.slice(); prevN = nodes.length;
    fn();
    owner = computeOwners();
    moved = new Set(); owner.forEach((n, i) => { if (n !== before[i]) moved.add(i); });
    lastMove = moved.size / KEYS;
    say(`${desc}: <b>${moved.size}/${KEYS}</b> keys changed owner (${(lastMove * 100).toFixed(1)}%). ` +
      (mode === 'mod' ? 'With hash % N almost every key moves.' : `Ideal for consistent hashing ≈ 1/${Math.max(nodes.length, prevN)} = ${(100 / Math.max(nodes.length, prevN)).toFixed(1)}%.`));
    fade = 2500; draw();
  }
  addBtn.onclick = () => {
    if (nodes.length >= 8) { say('Max 8 nodes in this demo.'); return; }
    const free = 'ABCDEFGH'.split('').find((c) => !nodes.includes(c)) || String.fromCharCode(65 + (nextName++ % 8));
    change('Added node ' + free, () => nodes.push(free));
  };
  rmBtn.onclick = () => {
    if (nodes.length <= 2) { say('Keep at least 2 nodes.'); return; }
    const gone = nodes[Math.floor(Math.random() * nodes.length)];
    change('Removed node ' + gone, () => { nodes = nodes.filter((n) => n !== gone); });
  };
  modeBtn.onclick = () => {
    mode = mode === 'ring' ? 'mod' : 'ring';
    modeBtn.textContent = 'Scheme: ' + (mode === 'ring' ? 'consistent hash' : 'hash % N');
    owner = computeOwners(); moved = new Set(); lastMove = null; draw();
    say(mode === 'mod' ? 'Now using <code>hash(key) % N</code>. Add a node and compare.' : 'Back to the consistent hash ring.');
  };
  vIn.oninput = () => {
    vIdx = +vIn.value; vOut.textContent = VOPTS[vIdx];
    owner = computeOwners(); moved = new Set(); lastMove = null; draw();
  };

  owner = computeOwners(); draw();
  say('Each tick on the ring is a virtual node; each dot is a key. A key belongs to the first tick clockwise from it.');
  ctx.loop((dt) => {                     // un-highlight moved keys after a moment
    if (fade > 0 && !ctx.reduced) { fade -= dt; if (fade <= 0) { moved = new Set(); draw(); } }
  });
});
