/* Batched order→rider assignment: greedy nearest vs Hungarian on cost = max(first mile, prep left) + last mile (+ rider-wait penalty). */
SD.widget('food-delivery', function (root, ctx) {
  const { el, svg } = ctx;
  // Two layouts: desktop 9×7 grid (439 wide) and phone 7×7 grid (366 wide, bigger labels).
  const GEO = {
    wide: { COLS: 9, ROWS: 7, C: 47, f: { rest: 13, pin: 14, rider: 13, wait: 12.5 }, rw: 30, rr: 12 },
    narrow: { COLS: 7, ROWS: 7, C: 50, f: { rest: 15, pin: 15, rider: 15, wait: 14 }, rw: 34, rr: 14 }
  };
  const OX = 8, OY = 8;
  let G, COLS, ROWS, C, W, H;
  const MIN_PER_CELL = 2, N_ORD = 5, N_RID = 7, LET = 'ABCDE';
  const HUE = ['var(--accent)', 'var(--ok)', 'var(--warn)', 'var(--err)', '#a855f7'];
  let mode = 'hung', waitW = 0, rests, riders, orders, plan = { greedy: null, hung: null }, phase = 0;

  // ---------- controls ----------
  const modeBtns = [['greedy', 'Greedy: nearest rider'], ['hung', 'Batched: Hungarian']].map(([v, l]) => {
    const b = el('button', { class: 'btn' + (v === mode ? ' primary' : ''), text: l });
    b.addEventListener('click', () => { mode = v; modeBtns.forEach((x) => x.classList.toggle('primary', x === b)); render(); });
    return b;
  });
  const waitBtn = el('button', { class: 'btn', text: 'Rider-wait penalty: off' });
  waitBtn.addEventListener('click', () => { waitW = waitW ? 0 : 1; waitBtn.textContent = 'Rider-wait penalty: ' + (waitW ? 'on' : 'off'); solve(); render(); });
  const newBtn = el('button', { class: 'btn', text: '🎲 New batch' });
  newBtn.addEventListener('click', () => { generate(); solve(); render(); });
  root.append(el('div', { class: 'w-controls' }, ...modeBtns), el('div', { class: 'w-controls' }, waitBtn, newBtn));

  const S_ = svg('svg', { role: 'img', 'aria-label': 'City grid with restaurants, riders and orders' });
  const gGrid = svg('g'), gPath = svg('g'), gPts = svg('g'), gMov = svg('g');
  S_.append(gGrid, gPath, gPts, gMov);
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '620px' } }, S_));
  const table = el('div', { style: { overflowX: 'auto', marginTop: '10px' } });
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(table, stats, log);
  const say = (m) => { log.prepend(el('div', { html: m })); while (log.children.length > 20) log.lastChild.remove(); };

  function setGeo(narrow) {
    G = narrow ? GEO.narrow : GEO.wide; ({ COLS, ROWS, C } = G);
    W = OX * 2 + COLS * C; H = OY * 2 + ROWS * C;
    S_.setAttribute('viewBox', `0 0 ${W} ${H}`);
    gGrid.innerHTML = '';
    for (let c = 0; c <= COLS; c++) gGrid.append(svg('line', { x1: OX + c * C, y1: OY, x2: OX + c * C, y2: OY + ROWS * C, stroke: 'var(--border)', 'stroke-width': 0.8 }));
    for (let r = 0; r <= ROWS; r++) gGrid.append(svg('line', { x1: OX, y1: OY + r * C, x2: OX + COLS * C, y2: OY + r * C, stroke: 'var(--border)', 'stroke-width': 0.8 }));
  }
  setGeo(ctx.narrow);
  const px = (p) => [OX + p.c * C + C / 2, OY + p.r * C + C / 2];

  // ---------- model ----------
  const ri = (n) => Math.floor(Math.random() * n);
  const travel = (a, b) => (Math.abs(a.c - b.c) + Math.abs(a.r - b.r)) * MIN_PER_CELL;
  function generate() {
    const taken = new Set();
    const cell = () => { let p; do { p = { c: ri(COLS), r: ri(ROWS) }; } while (taken.has(p.c + ',' + p.r)); taken.add(p.c + ',' + p.r); return p; };
    rests = Array.from({ length: 4 }, (_, i) => Object.assign(cell(), { n: 'R' + (i + 1) }));
    riders = Array.from({ length: N_RID }, (_, i) => Object.assign(cell(), { n: i + 1 }));
    orders = Array.from({ length: N_ORD }, (_, i) => {
      const rest = rests[ri(rests.length)];
      let drop, d;
      do { drop = cell(); d = Math.abs(drop.c - rest.c) + Math.abs(drop.r - rest.r); if (d < 2 || d > 5) taken.delete(drop.c + ',' + drop.r); } while (d < 2 || d > 5);
      return { n: LET[i], rest, drop, prep: ri(13) };   // prep minutes left
    });
    say('New batch: 5 orders, 7 riders. Travel = 2 min per block. Each matrix row shows order·restaurant and prep minutes left; cells are the cost in minutes.');
  }
  function legs(o, rd) {
    const fm = travel(rd, o.rest), lm = travel(o.rest, o.drop);
    return { fm, lm, wait: Math.max(0, o.prep - fm), door: Math.max(fm, o.prep) + lm };
  }
  const cost = (o, rd) => { const L = legs(o, rd); return L.door + waitW * L.wait; };

  // Hungarian algorithm (potentials, O(n²m)); a is n×m with n ≤ m; returns column for each row
  function hungarian(a) {
    const n = a.length, m = a[0].length, INF = 1e18;
    const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i; let j0 = 0;
      const minv = new Array(m + 1).fill(INF), used = new Array(m + 1).fill(false);
      do {
        used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
        for (let j = 1; j <= m; j++) if (!used[j]) {
          const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const res = new Array(n);
    for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
    return res;
  }
  function solve() {
    const free = new Set(riders.map((_, j) => j));
    plan.greedy = orders.map((o) => {   // arrival order A, B, C…; each grabs the nearest free rider
      let best = -1;
      free.forEach((j) => { if (best < 0 || travel(riders[j], o.rest) < travel(riders[best], o.rest)) best = j; });
      free.delete(best); return best;
    });
    plan.hung = hungarian(orders.map((o) => riders.map((rd) => cost(o, rd))));
  }
  function totals(asg) {
    let door = 0, wait = 0, worst = 0, obj = 0;
    asg.forEach((j, i) => { const L = legs(orders[i], riders[j]); door += L.door; wait += L.wait; worst = Math.max(worst, L.door); obj += cost(orders[i], riders[j]); });
    return { door, wait, worst, obj };
  }

  // ---------- drawing ----------
  function render() {
    gPath.innerHTML = ''; gPts.innerHTML = '';
    const asg = plan[mode];
    asg.forEach((j, i) => {
      const o = orders[i], rd = riders[j], L = legs(o, rd);
      const [x0, y0] = px(rd), [x1, y1] = px(o.rest), [x2, y2] = px(o.drop);
      gPath.append(svg('path', { d: `M${x0},${y0} L${x1},${y0} L${x1},${y1}`, fill: 'none', stroke: HUE[i], 'stroke-width': 2.2, 'stroke-dasharray': '5 4', opacity: 0.85 }),
        svg('path', { d: `M${x1},${y1} L${x2},${y1} L${x2},${y2}`, fill: 'none', stroke: HUE[i], 'stroke-width': 3, opacity: 0.9 }));
      if (L.wait > 0) gPath.append(svg('text', { x: x1, y: y1 - 15, 'text-anchor': 'middle', style: `font:700 ${G.f.wait}px var(--mono);paint-order:stroke;stroke:var(--bg);stroke-width:3px`, fill: HUE[i], text: 'wait ' + L.wait + '′' }));
    });
    rests.forEach((r) => { const [x, y] = px(r); gPts.append(svg('rect', { x: x - G.rw / 2, y: y - 14, width: G.rw, height: 28, rx: 5, fill: 'var(--text)', stroke: 'var(--surface)' }), svg('text', { x, y: y + 5, 'text-anchor': 'middle', style: `font:700 ${G.f.rest}px var(--sans)`, fill: 'var(--surface)', text: r.n })); });
    orders.forEach((o, i) => { const [x, y] = px(o.drop); gPts.append(svg('path', { d: `M${x},${y + 17} l-11,-15 a13,13 0 1,1 22,0 z`, fill: HUE[i], stroke: 'var(--surface)', 'stroke-width': 1.5 }), svg('text', { x, y: y + 2, 'text-anchor': 'middle', style: `font:700 ${G.f.pin}px var(--sans)`, fill: '#fff', text: o.n })); });
    riders.forEach((rd, j) => {
      const [x, y] = px(rd); const used = asg.includes(j);
      gPts.append(svg('circle', { cx: x, cy: y, r: G.rr, fill: used ? 'var(--surface)' : 'var(--surface-2)', stroke: used ? 'var(--text)' : 'var(--text-3)', 'stroke-width': 2 }),
        svg('text', { x, y: y + 5, 'text-anchor': 'middle', style: `font:700 ${G.f.rider}px var(--mono)`, fill: used ? 'var(--text)' : 'var(--text-3)', text: rd.n }));
    });
    // cost matrix
    const head = '<tr><th style="text-align:left;padding:3px 6px">order</th>' + riders.map((rd) => `<th style="padding:3px 6px">🛵${rd.n}</th>`).join('') + '</tr>';
    const rows = orders.map((o, i) => `<tr><td style="padding:3px 6px;color:${HUE[i]};font-weight:700">${o.n}·${o.rest.n} ${o.prep}′</td>` + riders.map((rd, j) => {
      const on = asg[i] === j, g = plan.greedy[i] === j && mode === 'hung';
      return `<td style="padding:3px 6px;text-align:center;${on ? `background:color-mix(in srgb, ${HUE[i]} 28%, transparent);font-weight:700;border-radius:5px` : ''}${g ? ';outline:1px dashed var(--text-3)' : ''}">${Math.round(cost(o, rd))}</td>`;
    }).join('') + '</tr>').join('');
    table.innerHTML = `<table style="border-collapse:separate;border-spacing:2px;font:12.5px var(--mono);color:var(--text-2);margin:0 auto">${head}${rows}</table>`;
    const g = totals(plan.greedy), h = totals(plan.hung), cur = mode === 'hung' ? h : g;
    stats.innerHTML = '';
    [['total order-to-door', cur.door + ' min'], ['avg', (cur.door / N_ORD).toFixed(1) + ' min'], ['worst', cur.worst + ' min'], ['rider wait', cur.wait + ' min']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    const save = g.obj - h.obj;
    say(mode === 'hung'
      ? `Hungarian objective ${Math.round(h.obj)} vs greedy ${Math.round(g.obj)}: <b>${save > 0 ? 'saves ' + Math.round(save) + ' min' : 'same result this time'}</b>${waitW ? ' (objective includes rider wait)' : ''}. Dashed cells = greedy's picks.`
      : `Greedy: each order, in arrival order, takes the <b>nearest</b> free rider. It never looks at prep time or at later orders.`);
  }

  // moving dots: each assigned rider rides rider → restaurant → drop
  function animate(t) {
    gMov.innerHTML = '';
    plan[mode].forEach((j, i) => {
      const o = orders[i], rd = riders[j];
      const pts = [px(rd), [px(o.rest)[0], px(rd)[1]], px(o.rest), [px(o.drop)[0], px(o.rest)[1]], px(o.drop)];
      const segs = []; let tot = 0;
      for (let k = 1; k < pts.length; k++) { const l = Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]); segs.push(l); tot += l; }
      let d = ((t / 4000) % 1) * tot, k = 0;
      while (k < segs.length - 1 && d > segs[k]) { d -= segs[k]; k++; }
      const f = segs[k] ? d / segs[k] : 0, a = pts[k], b = pts[k + 1];
      gMov.append(svg('circle', { cx: a[0] + (b[0] - a[0]) * f, cy: a[1] + (b[1] - a[1]) * f, r: 5, fill: HUE[i], stroke: 'var(--surface)', 'stroke-width': 1.5 }));
    });
  }

  generate(); solve(); render();
  // a different grid size means a new batch; the matching algorithm is unchanged
  ctx.onResize((n) => { setGeo(n); generate(); solve(); render(); });
  if (!ctx.reduced) ctx.loop((dt) => { phase += dt; animate(phase); });
});
