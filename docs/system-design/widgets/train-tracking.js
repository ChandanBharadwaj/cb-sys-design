/* Offline train locator: a crowdsourced tower→segment table plus an HMM forward filter over 0.5 km track segments.
   Modes: GPS fix, serving cell ID only (offline), or no signal (predict-only along the timetable, so the band grows). */
SD.widget('train-tracking', function (root, ctx) {
  const { el, svg } = ctx;
  const L = 120, SEG = 0.5, NS = L / SEG, OBS = 30, SIM = 60;   // one observation per 30 sim-seconds; 1 s real = 60 s sim
  const STA = [{ c: 'ARK', k: 0 }, { c: 'BVM', k: 28 }, { c: 'CHR', k: 55 }, { c: 'DPL', k: 92 }, { c: 'ESN', k: 120 }];
  const SCHED = [72, 60, 84, 66], DWELL = 120, DEAD = [66, 76], A = 0.1, HIST = 0.92; // timetable km/h per section; HIST: historical speed ÷ timetable (illustrative)
  const secOf = (k) => { for (let i = 1; i < STA.length; i++) if (k < STA[i].k) return i - 1; return STA.length - 2; };
  const dead = (x) => x >= DEAD[0] && x <= DEAD[1];
  const rng = (seed) => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // towers: macro cells every 4–8 km (3.5–6 km reach along the track) plus a small cell at each station
  const R0 = rng(7), T = [];
  for (let x = -1; x < L + 3; x += 4 + R0() * 4) if (!dead(x)) T.push({ x, r: 3.5 + R0() * 2.5, small: false });
  STA.forEach((s) => T.push({ x: s.k, r: 1.3, small: true }));
  T.sort((a, b) => a.x - b.x).forEach((t, i) => { t.id = 'C' + (11 + i); });
  const NT = T.length;
  function serving(x, prev, rnd) {            // strongest covering cell with hysteresis (phones do not hand over on every flicker)
    if (dead(x)) return -1;
    let best = -1, bs = -1, ps = -1;
    T.forEach((t, i) => { const d = Math.abs(x - t.x); if (d > t.r) return; const s = 1 - d / t.r + (t.small ? 0.35 : 0) + rnd() * 0.25; if (s > bs) { bs = s; best = i; } if (i === prev) ps = s; });
    return ps >= 0 && ps > bs - 0.15 ? prev : best;
  }

  // crowdsourcing: opt-in trips log (GPS fix → snapped segment, serving cell); aggregate counts per (cell, segment)
  let trips = 20, C, tot, ttot, span;
  function buildMap() {
    const r = rng(trips * 31 + 5);
    C = T.map(() => new Float32Array(NS)); tot = new Float32Array(NS); ttot = new Float32Array(NT);
    for (let k = 0; k < trips; k++) {                 // each contributor rides a random sub-journey; GPS gets a fix only ~35% of the time in a coach
      const a = Math.floor(r() * 4), z = a + 1 + Math.floor(r() * (4 - a));
      let prev = -1;
      for (let x = STA[a].k; x < STA[z].k; x += 0.4 + r() * 0.3) {
        const cell = serving(x, prev, r); prev = cell;
        if (r() > 0.35) continue;
        const s = Math.min(NS - 1, Math.max(0, Math.floor((x + (r() - 0.5) * 0.06) / SEG)));
        if (cell >= 0) { C[cell][s]++; tot[s]++; ttot[cell]++; }
      }
    }
    span = C.map((row) => { let a = -1, z = -1; row.forEach((v, j) => { if (v > 0) { if (a < 0) a = j; z = j; } }); return a < 0 ? null : [a * SEG, (z + 1) * SEG]; });
  }
  // transition kernel per segment: expected advance from the timetable speed; slower and stop-prone near stations
  const K = [];
  for (let i = 0; i < NS; i++) {
    const k = (i + 0.5) * SEG, nearSt = STA.some((s) => Math.abs(s.k - k) < 1);
    const mu = nearSt ? 0.5 : SCHED[secOf(k)] * OBS / 3600 / SEG;
    const w = [0, 1, 2, 3, 4].map((d) => Math.exp(-((d - mu) ** 2) / 1.28) + (d === 0 ? (nearSt ? 0.3 : 0.06) : 0));
    const sum = w.reduce((p, q) => p + q, 0); K.push(w.map((v) => v / sum));
  }

  // the true run: accelerate, brake for stops, scheduled dwells, one unscheduled signal halt, sections slower than timetable
  let TX, SchedT, tEnd;
  function newRun(seed) {
    const r = rng(seed), f = SCHED.map(() => 0.82 + r() * 0.23);
    let haltK = 31 + r() * 55; if (Math.abs(haltK - 55) < 4) haltK += 8;
    const stops = STA.slice(1).map((s) => ({ k: s.k, d: s.k < L ? DWELL : 0 })).concat([{ k: haltK, d: 240 }]).sort((p, q) => p.k - q.k);
    TX = []; let x = 0, v = 0, t = 0, si = 0;
    const acc = 0.35, dt = 5;
    while (si < stops.length) {
      const st = stops[si], sx = st.k * 1000, sec = secOf(x / 1000);
      v = Math.min(v + acc * dt, SCHED[sec] * f[sec] / 3.6, Math.sqrt(2 * acc * Math.max(0, sx - x)) + 0.3);
      TX.push(x / 1000);
      if (x + v * dt >= sx) { x = sx; v = 0; for (let w = 0; w < st.d; w += dt) { t += dt; TX.push(x / 1000); } si++; } else x += v * dt;
      t += dt;
    }
    tEnd = (TX.length - 1) * 5;
    SchedT = [0]; for (let i = 1; i < STA.length; i++) SchedT.push(SchedT[i - 1] + (i > 1 ? DWELL : 0) + (STA[i].k - STA[i - 1].k) / SCHED[i - 1] * 3600);
  }
  const trueX = (t) => TX[Math.min(TX.length - 1, Math.floor(t / 5))];
  const trueArr = (k) => { const i = TX.findIndex((x) => x >= k - 0.01); return i < 0 ? tEnd : i * 5; };
  const schedAt = (k) => { const i = secOf(Math.min(k, L - 0.01)) + 1; return SchedT[i - 1] + (i > 1 ? DWELL : 0) + (k - STA[i - 1].k) / SCHED[i - 1] * 3600; };

  // filter state
  let mode = 'cell', b, simT, accT, prevCell, obs, est, lo, hi, seed = 1, idle = 0, gpsX = 0;
  function reset() {
    newRun(seed++); buildMap();
    b = new Float64Array(NS); b[0] = 0.6; b[1] = 0.3; b[2] = 0.1;          // the user boarded at ARK
    simT = 0; accT = 0; prevCell = -1; obs = []; idle = 0; summarize();
  }
  const cellR = rng(99);
  function step() {
    simT = Math.min(tEnd, simT + OBS);
    const x = trueX(simT), nb = new Float64Array(NS);
    for (let i = 0; i < NS; i++) if (b[i] > 1e-12) K[i].forEach((p, d) => { nb[Math.min(NS - 1, i + d)] += b[i] * p; });   // predict
    b = nb;
    let note = null, changed = false;
    if (mode === 'gps') {
      gpsX = x + (cellR() - 0.5) * 0.06;
      for (let j = 0; j < NS; j++) b[j] *= Math.exp(-(((j + 0.5) * SEG - gpsX) ** 2) / 0.18) + 1e-9;
    } else if (mode === 'cell') {
      const c = serving(x, prevCell, cellR);
      if (c !== prevCell) { changed = true; prevCell = c; if (c >= 0) { obs.push(T[c].id); if (obs.length > 4) obs.shift(); } else note = 'No service in the cutting. Predicting along the timetable only.'; }
      if (c >= 0 && ttot[c] > 0) for (let j = 0; j < NS; j++) b[j] *= (C[c][j] + A) / (tot[j] + A * NT);      // emission P(cell | segment)
      else if (c >= 0 && changed) note = `Cell <b>${T[c].id}</b> is not in the map yet (too few crowd trips). Ignored, so predict only.`;
    }
    let s = 0; for (let j = 0; j < NS; j++) s += b[j];
    if (!(s > 0)) { b.fill(0); b[Math.min(NS - 1, Math.floor(x / SEG))] = 1; s = 1; }
    for (let j = 0; j < NS; j++) b[j] /= s;
    summarize();
    if (changed && prevCell >= 0 && ttot[prevCell] > 0) {
      const sp = span[prevCell];
      note = `Cell <b>${T[prevCell].id}</b>${obs.length > 1 ? ' after ' + obs.slice(0, -1).join(' › ') : ''}: map says km ${sp[0].toFixed(0)}–${sp[1].toFixed(0)}. Filter → <b>${est.toFixed(1)} km</b>, band ${(hi - lo).toFixed(1)} km.`;
    }
    return note;
  }
  function summarize() {
    let c = 0; lo = hi = est = null;
    for (let j = 0; j < NS; j++) { c += b[j]; if (lo === null && c >= 0.05) lo = j * SEG; if (est === null && c >= 0.5) est = (j + 0.5) * SEG; if (hi === null && c >= 0.95) hi = (j + 1) * SEG; }
    if (hi === null) hi = L; if (est === null) est = hi; if (lo === null) lo = 0;
    if (mode === 'gps' && simT > 0) { est = gpsX; lo = gpsX - 0.05; hi = gpsX + 0.05; }
  }

  // controls
  const modeBtns = [['gps', '🛰 GPS'], ['cell', '📶 Cell towers (offline)'], ['none', '✕ No signal']].map(([m, l]) => {
    const btn = el('button', { class: 'btn', text: l });
    btn.addEventListener('click', () => { mode = m; paintBtns(); summarize(); render(); say({ gps: 'GPS fix every 30 s: a tight band, but it costs battery and is slow to get inside a steel coach.', cell: 'Offline: the phone reads only the serving cell ID. The filter combines it with the earlier cells and the timetable.', none: 'No signal: dead reckoning along the timetable. Watch the band widen every minute.' }[m]); });
    btn.dataset.m = m; return btn;
  });
  const mapBtn = el('button', { class: 'btn' });
  mapBtn.addEventListener('click', () => { trips = trips === 2 ? 20 : trips === 20 ? 200 : 2; buildMap(); paintBtns(); render(); say(`Tower map rebuilt from <b>${trips}</b> crowd trips (${SD.fmt.num(tot.reduce((p, v) => p + v, 0))} GPS-tagged cell samples).${trips === 2 ? ' Cold start: some cells are unknown and the band stays wide.' : ''}`); });
  const newBtn = el('button', { class: 'btn', text: '↺ New trip' });
  newBtn.addEventListener('click', () => { reset(); log.innerHTML = ''; say('New run. The train leaves ARK, and its real speeds differ from the timetable.'); render(); });
  const skipBtn = el('button', { class: 'btn', text: '⏭ +5 min' });
  skipBtn.addEventListener('click', () => { for (let i = 0; i < 10 && simT < tEnd; i++) { const n = step(); if (n) say(n); } render(); });
  function paintBtns() { modeBtns.forEach((x) => x.classList.toggle('primary', x.dataset.m === mode)); mapBtn.textContent = '🗺 Map: ' + trips + ' crowd trips'; }
  root.append(el('div', { class: 'w-controls' }, ...modeBtns), el('div', { class: 'w-controls' }, mapBtn, newBtn, skipBtn));
  const stage = el('div', { class: 'w-stage' });
  const S = svg('svg', { role: 'img', 'aria-label': 'Rail line with cell towers, the true train and the estimated position band' });
  stage.append(S, el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b style="color:var(--text)">■</b> true train · <b style="color:var(--accent)">◆</b> app estimate inside its <b style="color:var(--accent)">90% band</b> · curve = belief over 0.5 km segments · <b style="color:var(--warn)">▲</b> serving cell and the stretch the map links to it · <b style="color:var(--accent)">▲</b> earlier cells. A fictional 120 km line.' }));
  const stats = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stage, stats, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 24) log.lastChild.remove(); }

  // drawing: desktop 600 wide; phone 360 wide with 14-unit text and no km labels
  let G = {};
  function draw(narrow) {
    S.innerHTML = '';
    const W = narrow ? 360 : 600, H = narrow ? 200 : 214, x0 = narrow ? 16 : 24, x1 = W - x0, F = narrow ? 14 : 13;
    const sx = (k) => x0 + (k / L) * (x1 - x0), yT = 142, yB = 80, hB = 56;
    S.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const txt = (x, y, t, st, fill, anchor) => { const n = svg('text', { x, y, 'text-anchor': anchor || 'middle', style: st, fill: fill || 'var(--text-2)', text: t }); S.append(n); return n; };
    S.append(svg('rect', { x: sx(DEAD[0]), y: 22, width: sx(DEAD[1]) - sx(DEAD[0]), height: yT - 12, fill: 'color-mix(in srgb, var(--err) 9%, transparent)' }));
    txt((sx(DEAD[0]) + sx(DEAD[1])) / 2, 16, narrow ? 'no service' : 'no coverage (cutting)', `font:600 ${F}px var(--sans)`, 'var(--err)');
    txt(x0, 16, 'belief', `font:600 ${F}px var(--sans)`, 'var(--text-3)', 'start');
    S.append(svg('line', { x1: x0, y1: yB, x2: x1, y2: yB, stroke: 'var(--border)' }));
    G.post = svg('path', { fill: 'color-mix(in srgb, var(--accent) 28%, transparent)', stroke: 'var(--accent)', 'stroke-width': 1.2 }); S.append(G.post);
    G.cov = svg('rect', { y: yT - 8, height: 16, rx: 3, fill: 'color-mix(in srgb, var(--warn) 32%, transparent)' }); S.append(G.cov);
    G.masts = T.map((t) => { const w = t.small ? 3.5 : 5; const m = svg('path', { d: `M${sx(t.x) - w} ${yB + 36} L${sx(t.x)} ${yB + (t.small ? 26 : 22)} L${sx(t.x) + w} ${yB + 36} Z` }); S.append(m); return m; });
    S.append(svg('line', { x1: x0, y1: yT, x2: x1, y2: yT, stroke: 'var(--text-3)', 'stroke-width': 4, 'stroke-linecap': 'round' }));
    G.band = svg('rect', { y: yT - 11, height: 22, rx: 5, fill: 'color-mix(in srgb, var(--accent) 20%, transparent)', stroke: 'var(--accent)', 'stroke-dasharray': '4 3' }); S.append(G.band);
    STA.forEach((s) => {
      const an = s.k === 0 ? 'start' : s.k === L ? 'end' : 'middle';
      S.append(svg('rect', { x: sx(s.k) - 3, y: yT - 9, width: 6, height: 18, rx: 2, fill: 'var(--surface)', stroke: 'var(--text-2)', 'stroke-width': 1.5 }));
      txt(sx(s.k) + (s.k === 0 ? -3 : s.k === L ? 3 : 0), yT + 30, s.c, `font:700 ${F}px var(--mono)`, 'var(--text)', an);
      if (!narrow) txt(sx(s.k) + (s.k === 0 ? -3 : s.k === L ? 3 : 0), yT + 47, s.k + ' km', 'font:500 12px var(--mono)', 'var(--text-3)', an);
    });
    G.tru = svg('rect', { y: yT - 6, width: 16, height: 12, rx: 3, fill: 'var(--text)' }); S.append(G.tru);
    G.est = svg('path', { fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 1.5 }); S.append(G.est);
    G.id = txt(0, yB + 18, '', `font:700 ${F}px var(--mono);paint-order:stroke;stroke:var(--surface);stroke-width:3px`, 'var(--warn)');
    G.eta = txt(W / 2, H - 6, '', `font:600 ${F}px var(--sans)`, 'var(--text-2)');
    Object.assign(G, { sx, yB, hB, yT, x0, x1 });
    render();
  }

  const fm = (s) => Math.round(s / 60) + ' min';
  function render() {
    if (!G.sx || !b) return;
    const { sx, yB, hB, yT } = G, x = trueX(simT);
    let d = `M${sx(0)} ${yB}`;
    for (let j = 0; j < NS; j++) d += ` L${sx((j + 0.5) * SEG).toFixed(1)} ${(yB - Math.sqrt(b[j]) * hB).toFixed(1)}`;
    G.post.setAttribute('d', d + ` L${sx(L)} ${yB} Z`);
    const c = mode === 'cell' ? prevCell : -1, sp = c >= 0 ? span[c] : null;
    if (sp) { G.cov.setAttribute('x', sx(sp[0])); G.cov.setAttribute('width', sx(sp[1]) - sx(sp[0])); G.cov.style.display = ''; } else G.cov.style.display = 'none';
    G.masts.forEach((m, i) => { const k = mode === 'cell' ? obs.lastIndexOf(T[i].id) : -1; m.setAttribute('fill', i === c ? 'var(--warn)' : k >= 0 ? 'var(--accent)' : 'var(--text-3)'); m.setAttribute('opacity', i === c ? 1 : k >= 0 ? 0.4 + 0.15 * (k + 4 - obs.length) : 0.4); });
    G.id.textContent = c >= 0 ? T[c].id : ''; G.id.setAttribute('x', c >= 0 ? Math.min(G.x1 - 14, Math.max(G.x0 + 14, sx(T[c].x))) : 0);
    G.band.setAttribute('x', sx(lo)); G.band.setAttribute('width', Math.max(4, sx(hi) - sx(lo)));
    G.tru.setAttribute('x', sx(x) - 8);
    const ex = sx(est); G.est.setAttribute('d', `M${ex} ${yT - 23} l7 8 l-7 8 l-7 -8 Z`);
    const nxt = STA.find((s) => s.k > est + 0.2) || STA[STA.length - 1];
    const etaE = Math.max(0, (nxt.k - est) / (SCHED[secOf(Math.min(est, L - 0.01))] * HIST) * 3600), etaT = Math.max(0, trueArr(nxt.k) - simT);
    G.eta.textContent = `${nxt.c} in ≈ ${fm(etaE)} (true ${fm(etaT)})`;
    const err = Math.abs(est - x), delay = simT - schedAt(est);
    stats.innerHTML = '';
    Object.entries({
      clock: 'T+' + fm(simT), source: { gps: 'GPS', cell: 'cell IDs only', none: 'no signal' }[mode],
      'true km': x.toFixed(1), estimate: est.toFixed(1) + ' km', error: err < 1 ? Math.round(err * 1000) + ' m' : err.toFixed(1) + ' km',
      '90% band': (hi - lo).toFixed(1) + ' km', 'last cells': mode === 'cell' && obs.length ? obs.join(' › ') : '–',
      ['ETA ' + nxt.c]: fm(etaE) + ' (true ' + fm(etaT) + ')', 'vs timetable': Math.abs(delay) < 30 ? 'on time' : (delay > 0 ? '+' : '−') + fm(Math.abs(delay))
    }).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  reset(); paintBtns(); draw(ctx.narrow); ctx.onResize(draw);
  say('The phone reads only the <b>serving cell ID</b> (C11, C12… stand for full MCC-MNC-LAC-CID keys). No GPS, no internet.');
  if (ctx.reduced) say('Reduced motion: use <b>⏭ +5 min</b> to advance the train.');
  ctx.loop((dt) => {
    if (ctx.reduced) return;
    if (simT >= tEnd) { idle += dt; if (idle > 3000) { reset(); say('Arrived at ESN. Starting a new run.'); render(); } return; }
    accT += Math.min(dt, 120) * SIM / 1000;
    let moved = false;
    while (accT >= OBS) { accT -= OBS; const n = step(); moved = true; if (n) say(n); }
    if (moved) render();
  });
});
