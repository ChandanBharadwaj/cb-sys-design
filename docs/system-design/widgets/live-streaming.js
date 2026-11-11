/* Match night: one illustrative concurrency curve, two capacity strategies (reactive autoscale vs pre-warmed ladder). */
SD.widget('live-streaming', function (root, ctx) {
  const { el, svg } = ctx;
  const T = 240, W = 380, H = 300, X0 = 44, X1 = 372, Y0 = 16, Y1 = 222, MAXV = 36e6, RUNG = 2e6, SPEED = 7;
  // illustrative demand: pre-match build-up, toss wave, innings, break, chase to the finish
  const PTS = [[0, 1.5e6], [25, 5e6], [30, 9.5e6], [60, 12e6], [95, 13.5e6], [125, 16e6], [128, 12e6], [145, 11e6], [150, 14e6], [200, 18e6], [225, 23e6], [235, 25e6], [240, 9e6]];
  const BUILT = [[58, 3e6, 2, 6], [96, 4e6, 2, 12], [228, 2.5e6, 1, 4]]; // [minute, size, rise, decay]
  const EVENTS = [[30, 'toss'], [96, 'wicket'], [136, 'break'], [229, 'last over']];
  let delay = 5, head = 30, user = [], sim, acc = 0, lastNote = {};
  const f = (n) => SD.fmt.num(n);
  const xs = (m) => X0 + (m / T) * (X1 - X0);
  const ys = (v) => Y1 - (Math.min(v, MAXV) / MAXV) * (Y1 - Y0);

  // controls
  const playBtn = el('button', { class: 'btn', text: '↺ Replay match' });
  const spikeBtn = el('button', { class: 'btn primary', text: '⚡ Star batter walks out' });
  const dOut = el('b', { text: delay + ' min' });
  const dIn = el('input', { type: 'range', min: 2, max: 10, value: delay, 'aria-label': 'Provisioning delay' });
  const hOut = el('b', { text: head + '%' });
  const hIn = el('input', { type: 'range', min: 10, max: 60, step: 5, value: head, 'aria-label': 'Ladder headroom' });
  root.append(el('div', { class: 'w-controls' }, spikeBtn, playBtn,
    el('label', null, 'Provisioning ', dOut, ' ', dIn), el('label', null, 'Headroom ', hOut, ' ', hIn)));

  // chart
  const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Concurrent viewers and capacity over a match' });
  const txt = (x, y, t, st, fill) => svg('text', { x, y, style: st || 'font:500 14px var(--mono)', fill: fill || 'var(--text-3)', text: t });
  [0, 10e6, 20e6, 30e6].forEach((v) => {
    S.append(svg('line', { x1: X0, x2: X1, y1: ys(v), y2: ys(v), stroke: 'var(--border)', 'stroke-dasharray': v ? '3 4' : '' }));
    S.append(txt(X0 - 6, ys(v) + 4, v ? f(v) : '0', 'font:500 14px var(--mono);text-anchor:end'));
  });
  EVENTS.forEach(([m, t], i) => {
    S.append(svg('line', { x1: xs(m), x2: xs(m), y1: Y0 + 14, y2: Y1, stroke: 'var(--border)', 'stroke-dasharray': '2 3' }));
    S.append(txt(xs(m), Y0 + 10, t, 'font:600 14px var(--sans);text-anchor:' + (i === EVENTS.length - 1 ? 'end' : 'middle')));
  });
  [0, 60, 120, 180, 240].forEach((m) => S.append(txt(xs(m), Y1 + 17, m + 'm', 'font:500 14px var(--mono);text-anchor:' + (m === 240 ? 'end' : 'middle'))));
  const dropR = svg('path', { stroke: 'var(--err)', 'stroke-width': 1.6, opacity: 0.45 });
  const dropL = svg('path', { stroke: 'var(--err)', 'stroke-width': 1.6, opacity: 0.9 });
  const lineD = svg('polyline', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.6, 'stroke-linejoin': 'round' });
  const lineR = svg('polyline', { fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2, 'stroke-dasharray': '5 3' });
  const lineL = svg('polyline', { fill: 'none', stroke: 'var(--ok)', 'stroke-width': 2 });
  const now = svg('line', { y1: Y0, y2: Y1, stroke: 'var(--text-3)', 'stroke-width': 1 });
  S.append(dropR, dropL, lineR, lineL, lineD, now);
  [['var(--accent)', 'viewers', 0], ['var(--warn)', 'reactive', 80], ['var(--ok)', 'ladder', 170]].forEach(([c, t, x]) => {
    S.append(svg('rect', { x: X0 + x, y: H - 22, width: 14, height: 4, rx: 2, fill: c }));
    S.append(txt(X0 + x + 20, H - 16, t, 'font:500 14px var(--sans)', 'var(--text-2)'));
  });
  S.append(svg('rect', { x: X0 + 250, y: H - 26, width: 3, height: 12, fill: 'var(--err)' }));
  S.append(txt(X0 + 258, H - 16, 'dropped', 'font:500 14px var(--sans)', 'var(--text-2)'));
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '500px' } }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); }
  function note(k, m, t) { if (m - (lastNote[k] ?? -99) < 8) return; lastNote[k] = m; say(t); }

  // model
  function lerp(m) {
    for (let i = 1; i < PTS.length; i++) if (m <= PTS[i][0]) { const [a, va] = PTS[i - 1], [b, vb] = PTS[i]; return va + ((vb - va) * (m - a)) / (b - a); }
    return PTS[PTS.length - 1][1];
  }
  function bump(m, s) { const [at, amp, rise, decay] = s; if (m < at) return 0; if (m < at + rise) return (amp * (m - at)) / rise; return amp * Math.exp(-(m - at - rise) / decay); }
  function demand(m) { let v = lerp(m) + 2.5e5 * Math.sin(m * 0.7) + 1.5e5 * Math.sin(m * 2.3); BUILT.concat(user).forEach((s) => { v += bump(m, s); }); return Math.max(2e5, v); }
  function plan(m) { return m < 10 ? 4e6 : m < 136 ? 14e6 : m < 237 ? 22e6 : 4e6; } // forecast, booked in advance
  function fresh() { lastNote = {}; return { m: 0, dem: [], rc: [], lc: [], r: { cap: 3e6, pend: [], short: false }, l: { cap: 4e6, pend: [], up: 0, short: false }, rLost: 0, lLost: 0, rCost: 0, lCost: 0 }; }
  const arrive = (X, m) => { X.pend = X.pend.filter((p) => { if (p.at <= m) { X.cap += p.n; return false; } return true; }); return X.pend.reduce((a, p) => a + p.n, 0); };
  function step(s, quiet) {
    const m = s.m, d = demand(m);
    s.dem.push(d);
    const obs = s.dem[Math.max(0, m - 2)];                    // metrics arrive ~2 min late
    const R = s.r, rIn = arrive(R, m), want = obs * 1.15;
    if (want > R.cap + rIn) {
      const n = Math.min(want - R.cap - rIn, Math.max(1e6, R.cap * 0.3)); // step-size limit
      R.pend.push({ at: m + delay, n });
      if (!quiet) note('r', m, `<b>min ${m}</b> reactive: CPU alarm → +${f(n)} ordered, ready at min ${m + delay}`);
    } else if (want < R.cap * 0.7) R.cap = Math.max(want, R.cap * 0.97, 3e6);
    const L = s.l, lIn = arrive(L, m), need = Math.max(plan(m + delay), obs * (1 + head / 100));
    if (need > L.cap + lIn) {
      const n = Math.ceil((need - L.cap - lIn) / RUNG) * RUNG;
      L.pend.push({ at: m + delay, n }); L.up = m;
      if (!quiet) note('l', m, `<b>min ${m}</b> ladder: headroom low → step to ${f(L.cap + lIn + n)} by min ${m + delay}`);
    } else if (obs * (1 + (2 * head) / 100) < L.cap - RUNG && m - L.up > 15 && L.cap - RUNG >= plan(m)) L.cap -= RUNG;
    [[R, 'rLost', 'reactive'], [L, 'lLost', 'ladder']].forEach(([X, k, nm]) => {
      const gap = d - X.cap;
      if (gap > 0) { s[k] += gap; if (!X.short && !quiet) say(`<b>min ${m}</b> ${nm}: short by ${f(gap)} viewers → timeouts and retries`); X.short = true; } else X.short = false;
    });
    s.rCost += R.cap; s.lCost += L.cap;
    s.rc.push(R.cap); s.lc.push(L.cap);
    s.m++;
  }
  function draw() {
    const pts = (a) => a.map((v, i) => xs(i).toFixed(1) + ',' + ys(v).toFixed(1)).join(' ');
    lineD.setAttribute('points', pts(sim.dem)); lineR.setAttribute('points', pts(sim.rc)); lineL.setAttribute('points', pts(sim.lc));
    const drops = (cap, dx) => sim.dem.map((d, i) => (d > cap[i] ? `M${(xs(i) + dx).toFixed(1)} ${ys(cap[i]).toFixed(1)}V${ys(d).toFixed(1)}` : '')).join('');
    dropR.setAttribute('d', drops(sim.rc, -0.6)); dropL.setAttribute('d', drops(sim.lc, 0.6));
    now.setAttribute('x1', xs(sim.m)); now.setAttribute('x2', xs(sim.m));
    const i = Math.max(0, sim.m - 1);
    stats.innerHTML = '';
    const lostR = sim.rLost / 1e6, lostL = sim.lLost / 1e6;
    Object.entries({
      minute: sim.m + ' / ' + T, viewers: f(sim.dem[i] || 0),
      'reactive cap': f(sim.rc[i] || 0), 'ladder cap': f(sim.lc[i] || 0),
      'lost (reactive)': lostR.toFixed(1) + 'M user-min', 'lost (ladder)': lostL.toFixed(1) + 'M user-min',
      'ladder cost': sim.rCost ? '+' + Math.round((sim.lCost / sim.rCost - 1) * 100) + '% vs reactive' : '–'
    }).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function rerun(upTo, quiet) { sim = fresh(); while (sim.m < upTo) step(sim, quiet); draw(); }
  function restart() {
    log.innerHTML = ''; acc = 0;
    if (ctx.reduced) { rerun(T, true); say('Reduced motion: whole match computed at once. Press ⚡ to add a surprise wave.'); }
    else { sim = fresh(); draw(); say('Match starts. Reactive scaling waits for a CPU alarm; the ladder pre-warms from the forecast and keeps ' + head + '% headroom.'); }
  }

  playBtn.addEventListener('click', () => { user = []; restart(); });
  spikeBtn.addEventListener('click', () => {
    const live = !ctx.reduced && sim.m < T;
    const at = live ? sim.m : 40 + Math.floor(Math.random() * 180);
    user.push([at, 6e6, 2, 15]);
    say(`⚡ <b>min ${at}</b>: a star batter walks out. +6M viewers in about 2 minutes.`);
    if (!live) rerun(T, true);
  });
  dIn.addEventListener('input', () => { delay = +dIn.value; dOut.textContent = delay + ' min'; rerun(sim.m, true); });
  hIn.addEventListener('input', () => { head = +hIn.value; hOut.textContent = head + '%'; rerun(sim.m, true); });

  restart();
  ctx.loop((dt) => {
    if (ctx.reduced || sim.m >= T) return;
    acc += (dt / 1000) * SPEED;
    let moved = false;
    while (acc >= 1 && sim.m < T) { step(sim, false); acc -= 1; moved = true; }
    if (moved) draw();
    if (sim.m >= T) say(`Full time. Reactive lost <b>${(sim.rLost / 1e6).toFixed(1)}M</b> user-minutes; the ladder lost <b>${(sim.lLost / 1e6).toFixed(1)}M</b> and cost ${Math.round((sim.lCost / sim.rCost - 1) * 100)}% more capacity.`);
  });
});
