/* H3-style k-ring search on a hex grid, ranked by ETA (with optional river). */
SD.widget('ride-sharing', function (root, ctx) {
  const { el, svg } = ctx;
  let loopH = null, gen = 0;
  // Desktop: 11×8 hexes, 22 drivers. Phone: 7×10 hexes, 16 drivers, so the viewBox is ~320 wide and labels stay ≥ 13 px.
  function build(narrow) {
  const my = ++gen;
  if (loopH) loopH.stop();
  root.innerHTML = '';
  const COLS = narrow ? 7 : 11, ROWS = narrow ? 10 : 8, S = 24, SQ3 = Math.sqrt(3), NDRV = narrow ? 16 : 22;
  const W = Math.ceil(S * SQ3 * (COLS + 0.5)) + 8, H = Math.ceil(S * 1.5 * (ROWS - 1) + 2 * S) + 8;
  const RIVER_COL = narrow ? 3 : 6;
  const DOT = narrow ? 6.5 : 5.5, FLBL = narrow ? 13.5 : 10, FPIN = narrow ? 12 : 10, PIN = narrow ? 10.5 : 9;

  // controls
  let need = 3, river = false, busy = false;
  const needOut = el('b', { text: need });
  const needIn = el('input', { type: 'range', min: 1, max: 6, value: need, 'aria-label': 'Drivers needed' });
  needIn.addEventListener('input', () => { need = +needIn.value; needOut.textContent = need; });
  const riverBtn = el('button', { class: 'btn', text: '≈ River: off' });
  riverBtn.addEventListener('click', () => { river = !river; riverBtn.textContent = '≈ River: ' + (river ? 'on' : 'off'); paintCells(); });
  const randBtn = el('button', { class: 'btn primary', text: '▶ Request at random spot' });
  randBtn.addEventListener('click', () => { const c = cells[Math.floor(Math.random() * cells.length)]; request(c); });
  root.append(el('div', { class: 'w-controls' }, randBtn, riverBtn, el('label', null, 'Need ', needOut, ' drivers ', needIn)));

  const stage = el('div', { class: 'w-stage' });
  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Hex grid with drivers' });
  const gCells = svg('g'), gLines = svg('g'), gDrivers = svg('g'), gTop = svg('g');
  S_.append(gCells, gLines, gDrivers, gTop);
  stage.append(S_);
  root.append(stage);
  stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Dots: <b style="color:var(--ok)">●</b> free · <b style="color:var(--warn)">●</b> candidate · <b style="color:var(--accent)">●</b> offered · <b style="color:var(--text-3)">●</b> on a trip. <b>R</b> = rider; labels on the lines are ETAs in minutes.' }));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);

  // grid (pointy-top, odd-r offset → axial)
  const cells = [];
  const byKey = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const q = c - (r - (r & 1)) / 2;
    const x = S * SQ3 * (c + 0.5 * (r & 1)) + S * SQ3 / 2 + 4;
    const y = S * 1.5 * r + S + 4;
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); pts.push((x + (S - 1) * Math.cos(a)).toFixed(1) + ',' + (y + (S - 1) * Math.sin(a)).toFixed(1)); }
    const poly = svg('polygon', { points: pts.join(' '), style: 'cursor:pointer;transition:fill .3s' });
    const cell = { c, r, q, ar: r, x, y, poly };
    poly.addEventListener('click', () => request(cell));
    cells.push(cell); byKey[q + ',' + r] = cell;
    gCells.append(poly);
  }
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.ar - b.ar) + Math.abs(a.q + a.ar - b.q - b.ar)) / 2;
  const isRiver = (cell) => river && cell.c === RIVER_COL;
  function paintCells(ringOf) {
    cells.forEach((cell) => {
      let fill = 'var(--surface-2)';
      if (isRiver(cell)) fill = 'color-mix(in srgb, #38bdf8 35%, var(--surface))';
      if (ringOf && ringOf.has(cell)) fill = `color-mix(in srgb, var(--accent) ${30 - ringOf.get(cell) * 5}%, var(--surface))`;
      cell.poly.style.fill = fill;
      cell.poly.style.stroke = 'var(--border)';
    });
  }
  paintCells();

  // drivers
  const drivers = [];
  for (let i = 0; i < NDRV; i++) {
    const cell = cells[Math.floor(Math.random() * cells.length)];
    const dot = svg('circle', { r: DOT, fill: 'var(--ok)', stroke: 'var(--surface)', 'stroke-width': 1.5 });
    gDrivers.append(dot);
    drivers.push({ id: i + 1, cell, from: cell, to: cell, t: 1, dot, state: 'free', x: cell.x, y: cell.y });
  }
  function neighbours(cell) {
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    return dirs.map(([dq, dr]) => byKey[(cell.q + dq) + ',' + (cell.ar + dr)]).filter(Boolean);
  }
  function placeDriver(d) {
    const k = d.t < 1 ? d.t * d.t * (3 - 2 * d.t) : 1;
    d.x = d.from.x + (d.to.x - d.from.x) * k; d.y = d.from.y + (d.to.y - d.from.y) * k;
    d.dot.setAttribute('cx', d.x); d.dot.setAttribute('cy', d.y);
    d.dot.setAttribute('fill', d.state === 'free' ? 'var(--ok)' : d.state === 'cand' ? 'var(--warn)' : d.state === 'busy' ? 'var(--text-3)' : 'var(--accent)');
    d.dot.setAttribute('r', d.state === 'match' ? DOT + 2.5 : DOT);
  }
  drivers.forEach(placeDriver);
  loopH = ctx.loop((dt) => {
    drivers.forEach((d) => {
      if (busy && d.state !== 'free') { placeDriver(d); return; }
      if (d.t >= 1) {
        d.cell = d.to; d.from = d.to;
        if (!busy && Math.random() < 0.02) { const n = neighbours(d.cell); d.to = n[Math.floor(Math.random() * n.length)]; d.t = 0; }
      } else d.t = Math.min(1, d.t + dt / 1400);
      placeDriver(d);
    });
  });

  function setStats(o) {
    stats.innerHTML = '';
    Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  setStats({ 'free drivers': drivers.length, 'tap a hex': 'to request' });
  say('Tip: turn the river on and request near it. The closest dot is not always the fastest pickup.');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));
  function crossesRiver(a, b) { return river && ((a.c < RIVER_COL && b.c > RIVER_COL) || (a.c > RIVER_COL && b.c < RIVER_COL)); }
  function eta(d, rider) { return Math.round(dist(d.cell, rider) * 1.2 + 1 + (crossesRiver(d.cell, rider) ? 7 : 0)); }

  async function request(rider) {
    if (busy) return;
    busy = true; randBtn.disabled = true;
    gLines.innerHTML = ''; gTop.innerHTML = '';
    drivers.forEach((d) => { if (d.t < 1) { d.t = 1; d.cell = d.to; d.from = d.to; } if (d.state !== 'busy') d.state = 'free'; placeDriver(d); });
    const pin = svg('g', null, svg('circle', { cx: rider.x, cy: rider.y, r: PIN, fill: 'var(--accent)' }), svg('text', { x: rider.x, y: rider.y + FPIN * 0.36, 'text-anchor': 'middle', fill: '#fff', style: `font:700 ${FPIN}px var(--sans)`, text: 'R' }));
    gTop.append(pin);
    say(`Rider at hex (${rider.c},${rider.r}). Searching ring k = 0…`);
    const ringOf = new Map();
    let cand = [];
    let k = 0;
    for (k = 0; k <= 5; k++) {
      cells.forEach((cell) => { if (dist(cell, rider) === k) ringOf.set(cell, k); });
      paintCells(ringOf);
      cand = drivers.filter((d) => d.state === 'free' && ringOf.has(d.cell));
      cand.forEach((d) => { d.state = 'cand'; placeDriver(d); });
      setStats({ 'ring k': k, 'cells scanned': 1 + 3 * k * (k + 1), candidates: cand.length });
      say(`k = ${k}: ${ringOf.size} cells → ${cand.length} free driver(s)`);
      await sleep(650);
      if (cand.length >= need) break;
    }
    if (!cand.length) { say('No drivers nearby. Expand radius or show "no cars available".'); busy = false; randBtn.disabled = false; return; }
    // rank by ETA
    const ranked = cand.map((d) => ({ d, eta: eta(d, rider), straight: dist(d.cell, rider) })).sort((a, b) => a.eta - b.eta || a.straight - b.straight);
    const nearest = cand.map((d) => ({ d, straight: dist(d.cell, rider) })).sort((a, b) => a.straight - b.straight)[0];
    ranked.forEach((x, i) => {
      gLines.append(svg('line', { x1: rider.x, y1: rider.y, x2: x.d.x, y2: x.d.y, stroke: i === 0 ? 'var(--accent)' : 'var(--border)', 'stroke-width': i === 0 ? 2.5 : 1.5, 'stroke-dasharray': i === 0 ? '' : '4 4' }));
      const tx = (rider.x + x.d.x) / 2, ty = (rider.y + x.d.y) / 2;
      gLines.append(svg('text', { x: tx, y: ty - 3, 'text-anchor': 'middle', style: `font:700 ${FLBL}px var(--mono);paint-order:stroke;stroke:var(--bg);stroke-width:3px`, fill: i === 0 ? 'var(--accent)' : 'var(--text-3)', text: x.eta + 'm' }));
    });
    say('Ranked by ETA: ' + ranked.map((x) => `#${x.d.id} ${x.eta}m`).join(' · '));
    if (nearest && nearest.d !== ranked[0].d) say(`<b>Note:</b> driver #${nearest.d.id} is closest in a straight line but has an ETA of ${eta(nearest.d, rider)}m (river). ETA ranking picks #${ranked[0].d.id}.`);
    await sleep(900);
    // offer loop
    for (let i = 0; i < ranked.length; i++) {
      const x = ranked[i];
      x.d.state = 'match'; placeDriver(x.d);
      say(`Offer → driver #${x.d.id} (ETA ${x.eta}m) …`);
      await sleep(800);
      const accept = Math.random() < 0.75 || i === ranked.length - 1;
      if (accept) {
        say(`✅ Driver #${x.d.id} accepted. Trip committed with a conditional update.`);
        setStats({ 'ring k': k, candidates: cand.length, 'picked ETA': x.eta + ' min', offers: i + 1 });
        x.d.state = 'busy';
        break;
      }
      say(`✖ Driver #${x.d.id} declined. Next candidate (no new search needed).`);
      x.d.state = 'free'; placeDriver(x.d);
    }
    cand.forEach((d) => { if (d.state === 'cand') d.state = 'free'; placeDriver(d); });
    await sleep(1600);
    paintCells(); gLines.innerHTML = '';
    busy = false; randBtn.disabled = false;
    // free the busy driver after a while (trip ends)
    drivers.filter((d) => d.state === 'busy').forEach((d) => setTimeout(() => { d.state = 'free'; placeDriver(d); }, 8000));
  }
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
