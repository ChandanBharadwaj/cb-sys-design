/* A real span-augmented skip list (the structure inside a Redis sorted set), ordered high → low.
   Insert, delete and rank follow Redis's zslInsert / zslDelete / zslGetRank logic. */
SD.widget('leaderboard', function (root, ctx) {
  const { el, svg } = ctx;
  const MAXL = 4, KEEP = 9, LH = 32, Y0 = 172;
  // Desktop: players left → right, levels stacked upwards (500-wide viewBox).
  // Phone: the same list turned 90°: players top → bottom, levels as columns (360 wide, 14–16-unit text).
  const VR = 31, VY0 = 52, VCOL = [104, 174, 244, 314], VBOX = 50;
  let V, W, H, BOX, F;
  function dims(narrow) {
    V = !!narrow;
    if (V) { W = 360; H = VY0 + KEEP * VR + 22; BOX = VBOX; F = { span: 15, score: 15, name: 15, head: 14, sum: 16 }; }
    else { W = 500; H = Y0 + 42; BOX = 38; F = { span: 14, score: 13, name: 14, head: 13, sum: 15 }; }
  }
  dims(ctx.narrow);
  const NAMES = ['ana', 'ben', 'cai', 'dev', 'eli', 'fay', 'gus', 'hal', 'ivy', 'jo', 'kai', 'lea', 'max', 'nia', 'oli', 'pia', 'raj', 'sam', 'tia', 'uma', 'vic', 'wen', 'xia', 'yuki', 'zoe'];
  let P = 0.5, busy = false;
  let head, level, length;

  // ---- skip list in ZREVRANGE order: score desc, then member desc (Redis stores (score, member) ascending) ----
  const before = (a, b) => a.score > b.score || (a.score === b.score && a.name > b.name);
  function reset() { head = { name: 'HEAD', fw: Array(MAXL).fill(null), span: Array(MAXL).fill(0) }; level = 1; length = 0; }
  function randomLevel() { let l = 1; while (Math.random() < P && l < MAXL) l++; return l; }
  function searchPath(t) {            // same walk zslInsert does, recorded for the animation
    const path = []; let x = head;
    for (let i = level - 1; i >= 0; i--) {
      while (x.fw[i] && before(x.fw[i], t)) { x = x.fw[i]; path.push({ n: x, l: i }); }
      path.push({ n: x, l: i, down: true });
    }
    return path;
  }
  function insert(name, score, forcedLvl) {
    const update = [], rank = [];
    let x = head;
    for (let i = level - 1; i >= 0; i--) {
      rank[i] = i === level - 1 ? 0 : rank[i + 1];
      while (x.fw[i] && before(x.fw[i], { name, score })) { rank[i] += x.span[i]; x = x.fw[i]; }
      update[i] = x;
    }
    const lvl = forcedLvl || randomLevel();
    if (lvl > level) { for (let i = level; i < lvl; i++) { rank[i] = 0; update[i] = head; head.span[i] = length; } level = lvl; }
    const n = { name, score, fw: Array(lvl).fill(null), span: Array(lvl).fill(0) };
    for (let i = 0; i < lvl; i++) {
      n.fw[i] = update[i].fw[i]; update[i].fw[i] = n;
      n.span[i] = update[i].span[i] - (rank[0] - rank[i]);
      update[i].span[i] = rank[0] - rank[i] + 1;
    }
    for (let i = lvl; i < level; i++) update[i].span[i]++;
    length++;
    return { n, lvl, rank: rank[0] + 1 };
  }
  function remove(t) {
    const update = []; let x = head;
    for (let i = level - 1; i >= 0; i--) { while (x.fw[i] && before(x.fw[i], t)) x = x.fw[i]; update[i] = x; }
    for (let i = 0; i < level; i++) {
      if (update[i].fw[i] === t) { update[i].span[i] += t.span[i] - 1; update[i].fw[i] = t.fw[i]; } else update[i].span[i] -= 1;
    }
    while (level > 1 && !head.fw[level - 1]) level--;
    length--;
  }
  function rankOf(t, path) {          // zslGetRank: sum spans while next is before-or-equal target
    let x = head, r = 0;
    for (let i = level - 1; i >= 0; i--) {
      while (x.fw[i] && (before(x.fw[i], t) || x.fw[i] === t)) { r += x.span[i]; x = x.fw[i]; path.push({ n: x, l: i, sum: r }); }
      if (x === t) return r;
      path.push({ n: x, l: i, down: true, sum: r });
    }
    return r;
  }
  const list = () => { const out = []; for (let x = head.fw[0]; x; x = x.fw[0]) out.push(x); return out; };

  // ---- UI ----
  const insBtn = el('button', { class: 'btn primary', text: '+ Insert player', onclick: () => op(doInsert) });
  const bumpBtn = el('button', { class: 'btn', text: '⬆ ZINCRBY a player', onclick: () => op(doBump) });
  const pBtns = [[0.5, 'p = ½'], [0.25, 'p = ¼ (Redis)']].map(([v, l]) => el('button', { class: 'btn' + (v === P ? ' primary' : ''), text: l, onclick: () => { if (busy) return; P = v; pBtns.forEach((b, i) => b.className = 'btn' + ([0.5, 0.25][i] === P ? ' primary' : '')); seed(); } }));
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset', onclick: () => { if (!busy) seed(); } });
  root.append(el('div', { class: 'w-controls' }, insBtn, bumpBtn, pBtns, resetBtn));
  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, style: 'max-width:720px;margin:0 auto;', role: 'img', 'aria-label': 'Skip list with spans' });
  const gE = svg('g'), gN = svg('g'), gT = svg('g');
  S_.append(gE, gN, gT);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));
  function setStats(o) { stats.innerHTML = ''; Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); }

  let pos = new Map(), lastHl = null;
  function layout() {
    const xs = list();
    const gap = (W - 76 - 26) / Math.max(1, KEEP - 1);
    pos = new Map([[head, V ? 0 : 26]]);
    xs.forEach((n, i) => pos.set(n, V ? i + 1 : 76 + i * gap));
    return xs;
  }
  const yL = (l) => Y0 - l * LH;
  // centre of node n's box at level l
  const at = (n, l) => (V ? [VCOL[l], VY0 + pos.get(n) * VR] : [pos.get(n), yL(l)]);
  function draw(hl) {
    hl = hl || {}; lastHl = hl;
    const xs = layout();
    gE.innerHTML = ''; gN.innerHTML = ''; gT.innerHTML = '';
    const nodes = [head].concat(xs);
    const bh = V ? 24 : 22;
    nodes.forEach((n) => {
      const L = n === head ? level : n.fw.length;
      for (let l = 0; l < L; l++) {
        const [x, y] = at(n, l);
        const on = hl.cur && hl.cur.n === n && hl.cur.l === l;
        const vis = hl.visited && hl.visited.has(n);
        const tgt = hl.target === n;
        gN.append(svg('rect', { x: x - BOX / 2, y: y - bh / 2, width: BOX, height: bh, rx: 5,
          fill: on ? 'var(--accent)' : tgt ? 'color-mix(in srgb, var(--ok) 35%, var(--surface))' : vis ? 'color-mix(in srgb, var(--accent) 22%, var(--surface))' : 'var(--surface)',
          stroke: tgt ? 'var(--ok)' : n === head ? 'var(--text-3)' : 'var(--accent)', 'stroke-width': on || tgt ? 2 : 1 }));
        const nx = n.fw[l];
        if (nx || n === head) {
          const line = { stroke: nx ? 'var(--edge, var(--text-3))' : 'var(--border)', 'stroke-width': 1.2, 'marker-end': nx ? 'url(#lbArrow)' : null, 'stroke-dasharray': nx ? null : '3 3' };
          if (V) {
            const y2 = nx ? at(nx, l)[1] - bh / 2 - 2 : H - 6;
            gE.append(svg('line', Object.assign({ x1: x, y1: y + bh / 2, x2: x, y2 }, line)));
          } else {
            const x2 = nx ? pos.get(nx) - BOX / 2 - 2 : W - 8;
            gE.append(svg('line', Object.assign({ x1: x + BOX / 2, y1: y, x2, y2: y }, line)));
          }
          if (nx && l > 0) {
            const lab = { 'text-anchor': V ? 'start' : 'middle', fill: 'var(--text-2)', style: `font:700 ${F.span}px var(--mono);paint-order:stroke;stroke:var(--surface);stroke-width:3px`, text: n.span[l] };
            if (V) gT.append(svg('text', Object.assign({ x: x + BOX / 2 + 3, y: (y + at(nx, l)[1]) / 2 + 5 }, lab)));
            else gT.append(svg('text', Object.assign({ x: (x + pos.get(nx)) / 2, y: y - 4 }, lab)));
          }
        }
      }
      const [x0, y0] = at(n, 0);
      const lx = V ? 36 : x0, ly = V ? y0 + 5 : Y0 + 32;
      if (n === head) { gT.append(svg('text', { x: lx, y: ly, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:700 ${F.head}px var(--sans)`, text: 'head' })); return; }
      gT.append(svg('text', { x: x0, y: y0 + 5, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${F.score}px var(--mono)`, text: n.score }));
      gT.append(svg('text', { x: lx, y: ly, 'text-anchor': 'middle', fill: hl.target === n ? 'var(--ok)' : 'var(--text-2)', style: `font:700 ${F.name}px var(--sans)`, text: n.name }));
      const top = at(n, n.fw.length - 1);
      const hit = V
        ? svg('rect', { x: 4, y: y0 - VR / 2, width: top[0] + BOX / 2 - 2, height: VR, fill: 'transparent', style: 'cursor:pointer' })
        : svg('rect', { x: x0 - BOX / 2 - 2, y: top[1] - 12, width: BOX + 4, height: Y0 + 40 - top[1], fill: 'transparent', style: 'cursor:pointer' });
      hit.addEventListener('click', () => op(() => doRank(n)));
      gT.append(hit);
    });
    if (V) gT.append(svg('text', { x: 36, y: 22, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:600 ${F.head}px var(--sans)`, text: 'level →' }));
    if (V) [0, 1, 2, 3].forEach((l) => gT.append(svg('text', { x: VCOL[l], y: 22, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:600 ${F.head}px var(--mono)`, text: 'L' + (l + 1) })));
    if (hl.sum != null && hl.cur) {
      const c = at(hl.cur.n, hl.cur.l);
      gT.append(V
        ? svg('text', { x: W - 6, y: Math.min(H - 8, c[1] + 22), 'text-anchor': 'end', fill: 'var(--accent)', style: `font:700 ${F.sum}px var(--mono);paint-order:stroke;stroke:var(--surface);stroke-width:4px`, text: 'Σ ' + hl.sum })
        : svg('text', { x: Math.max(70, Math.min(W - 70, c[0] + 4)), y: 22, 'text-anchor': 'middle', fill: 'var(--accent)', style: `font:700 ${F.sum}px var(--mono)`, text: 'Σspan = ' + hl.sum }));
    }
  }
  S_.append(svg('defs', null, svg('marker', { id: 'lbArrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--text-3)' }))));

  async function play(path, target) {
    const visited = new Set([head]);
    for (const st of path) { visited.add(st.n); draw({ cur: st, visited, sum: st.sum, target: null }); await sleep(st.down ? 260 : 420); }
    draw({ visited, target });
    return visited.size;
  }
  async function op(fn) { if (busy) return; busy = true; insBtn.disabled = bumpBtn.disabled = true; try { await fn(); } finally { busy = false; insBtn.disabled = bumpBtn.disabled = false; } }

  async function doRank(t) {
    const path = [];
    const r = rankOf(t, path);
    say(`<b>ZREVRANK ${t.name}</b>: start at the top level of head, move right while the next node is not past ${t.name}, add each span, drop a level otherwise.`);
    const touched = await play(path, t);
    say(`Rank of ${t.name} = sum of spans = <b>#${r}</b>. Touched ${touched - 1} node(s); a linear scan would read ${r}.`);
    setStats({ players: length, levels: level, ['rank of ' + t.name]: '#' + r, 'nodes touched': touched - 1 });
  }
  function freshName() { const used = new Set(list().map((n) => n.name)); const free = NAMES.filter((n) => !used.has(n)); return free[Math.floor(Math.random() * free.length)] || 'p' + Math.floor(Math.random() * 999); }
  async function doInsert(name, score) {
    name = name || freshName(); score = score || 100 + Math.floor(Math.random() * 900);
    await play(searchPath({ name, score }), null);
    const lvl = randomLevel();
    const n2 = insert(name, score, lvl);
    draw({ target: n2.n });
    say(`<b>ZADD ${score} ${name}</b>: search path above (O(log n)), then a tower of height <b>${lvl}</b> (coin flips with p = ${P === 0.5 ? '½' : '¼'}). Spans on the left neighbours were updated. New rank: #${n2.rank}.`);
    if (length > KEEP) { const last = list()[length - 1]; remove(last); say(`Board keeps the top ${KEEP}: <code>ZREMRANGEBYRANK</code> trimmed ${last.name}.`); await sleep(500); draw({ target: n2.n }); }
    setStats({ players: length, levels: level, 'inserted at': '#' + n2.rank, 'tower height': lvl });
  }
  async function doBump() {
    const xs = list(); const t = xs[Math.floor(xs.length / 2 + Math.random() * xs.length / 2)] || xs[0];
    const delta = 150 + Math.floor(Math.random() * 400);
    say(`<b>ZINCRBY ${delta} ${t.name}</b>: the hash gives the old score in O(1); the node moves, so Redis deletes and re-inserts it.`);
    draw({ target: t }); await sleep(600);
    remove(t); draw(); await sleep(400);
    await doInsert(t.name, t.score + delta);
  }
  function seed() {
    reset();
    const used = new Set();
    while (length < 7) { const nm = NAMES[Math.floor(Math.random() * NAMES.length)]; if (used.has(nm)) continue; used.add(nm); insert(nm, 100 + Math.floor(Math.random() * 900)); }
    draw();
    setStats({ players: length, levels: level, 'tap a player': 'for their rank' });
    say(`Seeded 7 players with p = ${P === 0.5 ? '½' : '¼'}. Numbers above arrows are spans: how many players that arrow skips.`);
  }
  seed();
  ctx.onResize((n) => { dims(n); S_.setAttribute('viewBox', `0 0 ${W} ${H}`); draw(lastHl); });
  let shown = false;
  ctx.onVisible((v) => { if (v && !shown) { shown = true; const xs = list(); if (xs.length) setTimeout(() => op(() => doRank(xs[xs.length - 2] || xs[0])), 400); } });
});
