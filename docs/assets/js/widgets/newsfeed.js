/* Hybrid fan-out on a real power-law follow graph: push below the threshold, pull (merge at read) above it. */
SD.widget('newsfeed', function (root, ctx) {
  const { el, svg } = ctx;
  const N = 240, COLS = 16, K = 12, LEN = 20;
  const W = 500, H = 372, X0 = 26, DX = 30, Y0 = 66, DY = 21;

  // seeded RNG so the graph is the same on every load
  let seed = 7;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // preferential popularity: weight ~ 1 / rank^1.1  → power-law follower counts
  const weight = Array.from({ length: N }, (_, i) => 1 / Math.pow(i + 1, 1.1));
  const total = weight.reduce((a, b) => a + b, 0);
  const following = Array.from({ length: N }, () => new Set());
  const followers = Array.from({ length: N }, () => []);
  for (let u = 0; u < N; u++) {
    while (following[u].size < K) {
      let r = rnd() * total, a = 0;
      while (r > weight[a]) { r -= weight[a]; a++; }
      if (a !== u && a < N) following[u].add(a);
    }
    following[u].forEach((a) => followers[a].push(u));
  }
  const tl = Array.from({ length: N }, () => []);   // pushed home timelines (ids)
  const ut = Array.from({ length: N }, () => []);   // author timelines (ids)
  const authorOf = {};
  let T = 40, nextId = 1000, writes = 0, posts = 0, reads = 0, lookups = 0, lastLookups = 0, busy = false;

  // controls
  const tOut = el('b', { text: T });
  const tIn = el('input', { type: 'range', min: 2, max: 120, value: T, 'aria-label': 'Celebrity threshold' });
  tIn.addEventListener('input', () => { T = +tIn.value; tOut.textContent = T; paint(); stats(); });
  const postBtn = el('button', { class: 'btn primary', text: '✎ Random user posts' });
  postBtn.addEventListener('click', () => post(Math.floor(rnd() * N)));
  const celebBtn = el('button', { class: 'btn', text: '★ Top account posts' });
  celebBtn.addEventListener('click', () => post(0));
  const readBtn = el('button', { class: 'btn', text: '⟳ Read a timeline' });
  readBtn.addEventListener('click', () => read(Math.floor(rnd() * N)));
  root.append(el('div', { class: 'w-controls' }, postBtn, celebBtn, readBtn, el('label', null, 'Pull above ', tOut, ' followers ', tIn)));

  const stage = el('div', { class: 'w-stage', style: { maxWidth: '720px', margin: '0 auto' } });
  const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Follow graph with 240 users' });
  const gLines = svg('g'), gDots = svg('g'), gTop = svg('g');
  const title = svg('text', { x: 12, y: 22, style: 'font:700 18px var(--sans)', fill: 'var(--text)', text: 'Tap any dot to post as that user' });
  const sub = svg('text', { x: 12, y: 44, style: 'font:500 13px var(--mono)', fill: 'var(--text-3)', text: 'dot size = followers · ringed = pulled at read time' });
  S.append(title, sub, gLines, gDots, gTop);
  stage.append(S); root.append(stage);
  const st = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(st, log);

  const pos = (u) => [X0 + (u % COLS) * DX, Y0 + Math.floor(u / COLS) * DY];
  const dots = [];
  for (let u = 0; u < N; u++) {
    const [x, y] = pos(u);
    const r = Math.min(10.5, 4.2 + Math.log2(1 + followers[u].length) * 0.85);
    const c = svg('circle', { cx: x, cy: y, r, style: 'cursor:pointer;transition:fill .25s, stroke .25s' });
    c.addEventListener('click', () => post(u));
    c.append(svg('title', { text: `user #${u} · ${followers[u].length} followers` }));
    gDots.append(c); dots.push(c);
  }
  const isCeleb = (u) => followers[u].length > T;
  function paint(hi) {
    dots.forEach((c, u) => {
      const h = hi && hi.get(u);
      c.setAttribute('fill', h || (isCeleb(u) ? 'var(--warn)' : 'var(--surface-2)'));
      c.setAttribute('stroke', isCeleb(u) ? 'var(--warn)' : 'var(--border)');
      c.setAttribute('stroke-width', isCeleb(u) ? 2 : 1);
    });
  }
  paint();
  function stats() {
    const celebs = followers.filter((f) => f.length > T).length;
    st.innerHTML = '';
    const o = { 'pulled accounts': celebs, posts, 'fan-out writes': writes, 'writes/post': posts ? (writes / posts).toFixed(1) : '–', 'lookups last read': lastLookups || '–', 'avg lookups/read': reads ? (lookups / reads).toFixed(1) : '–' };
    Object.entries(o).forEach(([k, v]) => st.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));
  function line(a, b, color, dash) {
    const [x1, y1] = pos(a), [x2, y2] = pos(b);
    const l = svg('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 1.2, 'stroke-dasharray': dash || '', style: 'opacity:.75;transition:opacity .8s' });
    gLines.append(l);
    return l;
  }
  function clear(ms) { setTimeout(() => { [...gLines.children].forEach((l) => (l.style.opacity = 0)); setTimeout(() => { gLines.innerHTML = ''; paint(); }, ctx.reduced ? 0 : 800); }, ctx.reduced ? 0 : ms); }

  async function post(a) {
    if (busy) return; busy = true;
    const id = nextId++; posts++; authorOf[id] = a;
    ut[a].unshift(id); if (ut[a].length > LEN) ut[a].pop();
    const hi = new Map([[a, 'var(--accent)']]);
    if (isCeleb(a)) {
      writes += 1; paint(hi);
      say(`#${a} (${followers[a].length} followers > ${T}) posted id ${id}: <b>stored once</b> in ut:${a}. Followers merge it at read time.`);
    } else {
      say(`#${a} (${followers[a].length} followers) posted id ${id}: <b>push</b> to ${followers[a].length} timelines (LPUSH + LTRIM ${LEN}).`);
      const fs = followers[a];
      for (let i = 0; i < fs.length; i++) {
        const f = fs[i];
        tl[f].unshift(id); if (tl[f].length > LEN) tl[f].pop();
        writes++;
        if (!ctx.reduced) line(a, f, 'var(--accent)');
        hi.set(f, 'color-mix(in srgb, var(--accent) 45%, var(--surface))');
        if (i % 8 === 7) { paint(hi); await sleep(40); }
      }
      paint(hi);
    }
    stats(); clear(900); await sleep(300); busy = false;
  }

  async function read(r) {
    if (busy) return; busy = true;
    const pulled = [...following[r]].filter(isCeleb);
    lastLookups = 1 + pulled.length; lookups += lastLookups; reads++;
    const hi = new Map([[r, 'var(--ok)']]);
    pulled.forEach((c) => { hi.set(c, 'var(--warn)'); if (!ctx.reduced) line(r, c, 'var(--warn)', '4 3'); });
    paint(hi);
    // k-way merge by id (ids are time-ordered); a Set removes duplicates
    const merged = [...new Set([].concat(tl[r], ...pulled.map((c) => ut[c])))].sort((x, y) => y - x).slice(0, 5);
    say(`Read timeline of #${r}: 1 list + ${pulled.length} celebrity list(s) = <b>${lastLookups} lookups</b>. Top: ` +
      (merged.length ? merged.map((id) => `${id}<span style="opacity:.6">@${authorOf[id]}</span>`).join(', ') : '(empty, post something first)'));
    stats(); clear(1400); await sleep(400); busy = false;
  }

  stats();
  say('Ringed dots are accounts above the threshold. Try ★ with the slider low, then high, and compare writes/post.');
});
