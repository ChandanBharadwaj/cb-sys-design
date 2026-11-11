/* Brooks's Law simulator: a late project, add N people at week W.
   Burn-down of remaining work (ramp-up + mentoring + n(n−1)/2 overhead) vs baseline, plus the communication graph. */
SD.widget('socio-technical-laws', function (root, ctx) {
  const { el, svg } = ctx;
  const TEAM = 6, WORK = 45, DEADLINE = 7, C = 0.02, MENTOR = 0.5, DT = 0.1, TMAX = 16;
  let hires = 4, start = 3, ramp = 8, t = 0, playing = false, lastMsg = '';

  function sim(k) {
    const pts = []; let left = WORK, time = 0, done = null;
    while (time <= TMAX + 1e-9) {
      pts.push([time, Math.max(0, left)]);
      if (left <= 0 && done === null) done = time;
      const on = k > 0 && time >= start, N = TEAM + (on ? k : 0);
      const eff = Math.max(0, 1 - C * (N - 1));
      const r = on ? Math.min(1, (time - start) / ramp) : 0;
      const thr = TEAM * eff + (on ? k * r * eff - k * MENTOR * (1 - r) : 0);
      left -= Math.max(0, thr) * DT; time = Math.round((time + DT) * 10) / 10;
    }
    return { pts, done, rateAt: (x) => { const on = k > 0 && x >= start, N = TEAM + (on ? k : 0), eff = 1 - C * (N - 1), r = on ? Math.min(1, (x - start) / ramp) : 0; return TEAM * eff + (on ? k * r * eff - k * MENTOR * (1 - r) : 0); } };
  }

  // ---- controls
  const mk = (label, min, max, val, set, unit) => {
    const out = el('b', { text: val + unit });
    const inp = el('input', { type: 'range', min, max, step: 1, value: val, style: { width: '120px' } });
    inp.addEventListener('input', () => { set(+inp.value); out.textContent = inp.value + unit; t = ctx.reduced ? TMAX : 0; render(); });
    return el('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px' } }, label, inp, out);
  };
  const playBtn = el('button', { class: 'btn primary', text: '▶ Play', onclick: () => { t = 0; playing = true; if (ctx.reduced) { t = TMAX; playing = false; } render(); } });
  root.append(el('div', { class: 'w-controls' },
    mk('Add people', 0, 8, hires, (v) => { hires = v; }, ''),
    mk('at week', 0, 10, start, (v) => { start = v; }, ''),
    mk('Ramp-up', 2, 16, ramp, (v) => { ramp = v; }, ' wk'),
    playBtn));

  const chart = svg('svg', { viewBox: '0 0 360 250', role: 'img', 'aria-label': 'Remaining work over time' });
  const graph = svg('svg', { viewBox: '0 0 360 250', role: 'img', 'aria-label': 'Communication paths graph' });
  const box = (s) => el('div', { style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px' } }, s);
  const head = (txt) => el('p', { style: { margin: '0 0 4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-2)' }, text: txt });
  const grid = el('div', { style: { display: 'grid', gap: '14px', gridTemplateColumns: ctx.narrow ? '1fr' : '3fr 2fr' } });
  grid.append(el('div', null, head('Remaining work (person-weeks)'), box(chart)), el('div', null, head('Who must talk to whom'), box(graph)));
  root.append(el('div', { class: 'w-stage' }, grid));
  root.append(el('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '13px' }, html: `Team of ${TEAM}, ${WORK} person-weeks left, deadline week ${DEADLINE}. Dashed = no hires; solid = with hires. New people ramp linearly to full speed and each costs <b>half a mentor</b> while ramping; everyone loses 2% of their week per colleague. <em>Illustrative model.</em>` }));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  ctx.onResize((n) => { grid.style.gridTemplateColumns = n ? '1fr' : '3fr 2fr'; });

  const X0 = 44, X1 = 348, Y0 = 18, Y1 = 206;
  const sx = (x) => X0 + (x / TMAX) * (X1 - X0), sy = (y) => Y1 - (y / WORK) * (Y1 - Y0);
  const txt = (x, y, s, o) => svg('text', Object.assign({ x, y, fill: 'var(--text-2)', style: 'font:500 14.5px var(--sans)', text: s }, o || {}));
  const pathOf = (pts, upto) => pts.filter((p) => p[0] <= upto + 1e-9).map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join(' ');

  function drawChart(B, H) {
    chart.innerHTML = '';
    [0, 15, 30, 45].forEach((v) => { chart.append(svg('line', { x1: X0, x2: X1, y1: sy(v), y2: sy(v), stroke: 'var(--border)' }), txt(X0 - 6, sy(v) + 5, v, { 'text-anchor': 'end' })); });
    [0, 4, 8, 12, 16].forEach((w) => chart.append(txt(sx(w), Y1 + 20, w, { 'text-anchor': 'middle' })));
    chart.append(txt(X1, Y1 + 38, 'week', { 'text-anchor': 'end' }));
    chart.append(svg('line', { x1: sx(DEADLINE), x2: sx(DEADLINE), y1: Y0, y2: Y1, stroke: 'var(--err)', 'stroke-dasharray': '4 4', 'stroke-width': 2 }));
    chart.append(txt(sx(DEADLINE) + 4, Y0 + 12, 'deadline', { fill: 'var(--err)', style: 'font:700 14.5px var(--sans)' }));
    if (hires > 0) {
      chart.append(svg('rect', { x: sx(start), y: Y0, width: Math.max(0, sx(Math.min(TMAX, start + ramp)) - sx(start)), height: Y1 - Y0, fill: 'var(--warn)', opacity: 0.12 }));
      chart.append(txt(sx(start) + 4, Y1 - 8, 'ramp-up', { fill: 'var(--warn)', style: 'font:700 14.5px var(--sans)' }));
    }
    chart.append(svg('path', { d: pathOf(B.pts, t), fill: 'none', stroke: 'var(--text-3)', 'stroke-width': 2.5, 'stroke-dasharray': '6 4' }));
    if (hires > 0) chart.append(svg('path', { d: pathOf(H.pts, t), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3 }));
    chart.append(svg('line', { x1: sx(t), x2: sx(t), y1: Y0, y2: Y1, stroke: 'var(--text-3)', 'stroke-width': 1 }));
  }

  function drawGraph(H) {
    graph.innerHTML = '';
    const joined = hires > 0 && t >= start, N = TEAM + (joined ? hires : 0);
    const cx = 180, cy = 118, R = 92, P = [];
    for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + (2 * Math.PI * i) / N; P.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const isNew = i >= TEAM || j >= TEAM;
      graph.append(svg('line', { x1: P[i][0], y1: P[i][1], x2: P[j][0], y2: P[j][1], stroke: isNew ? 'var(--warn)' : 'var(--text-3)', 'stroke-opacity': isNew ? 0.7 : 0.45, 'stroke-width': 1.4 }));
    }
    const r = joined ? Math.min(1, (t - start) / ramp) : 0;
    P.forEach(([x, y], i) => {
      const hire = i >= TEAM;
      graph.append(svg('circle', { cx: x, cy: y, r: 13, fill: hire ? `color-mix(in srgb, var(--warn) ${Math.round(25 + 60 * r)}%, var(--surface))` : 'color-mix(in srgb, var(--accent) 70%, var(--surface))', stroke: hire ? 'var(--warn)' : 'var(--accent)', 'stroke-width': 2 }));
    });
    graph.append(svg('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', fill: 'var(--text)', style: 'font:800 18px var(--sans)', text: N * (N - 1) / 2 }));
    graph.append(svg('text', { x: cx, y: cy + 24, 'text-anchor': 'middle', fill: 'var(--text-2)', style: 'font:500 14.5px var(--sans)', text: 'paths' }));
    graph.append(svg('text', { x: 8, y: 244, fill: 'var(--text-2)', style: 'font:500 14.5px var(--sans)', text: N + ' people' + (joined ? ' · hires ' + Math.round(r * 100) + '% ramped' : '') }));
  }

  function say(m) { if (m === lastMsg) return; lastMsg = m; log.prepend(el('div', { html: m })); while (log.children.length > 20) log.lastChild.remove(); }

  function render() {
    const B = sim(0), H = sim(hires);
    drawChart(B, H); drawGraph(H);
    const f = (d) => (d === null ? '> ' + TMAX : d.toFixed(1)) + ' wk';
    const diff = (H.done ?? TMAX) - (B.done ?? TMAX);
    const S = hires > 0 ? H : B, N = TEAM + (hires > 0 && t >= start ? hires : 0);
    stats.innerHTML = '';
    [['Week', t.toFixed(1)], ['Baseline finish', f(B.done)], ['With +' + hires, hires ? f(H.done) : '–'],
      ['Effect', hires ? (diff > 0.05 ? '+' + diff.toFixed(1) + ' wk later ❌' : diff < -0.05 ? diff.toFixed(1) + ' wk earlier ✅' : 'no change') : '–'],
      ['Team output now', S.rateAt(t).toFixed(1) + ' pw/wk'], ['Paths', N * (N - 1) / 2]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    if (!playing || t >= TMAX) {
      if (!hires) say('No one added: the team finishes at week <b>' + f(B.done) + '</b>, past the week-' + DEADLINE + ' deadline.');
      else if (diff > 0.05) say(`<b>Brooks wins.</b> Adding ${hires} at week ${start} with a ${ramp}-week ramp finishes <b>${diff.toFixed(1)} weeks later</b>: mentoring and ${(TEAM + hires) * (TEAM + hires - 1) / 2} paths cost more than the hires deliver before the end.`);
      else if (diff < -0.05) say(`Adding ${hires} at week ${start} helps by <b>${(-diff).toFixed(1)} weeks</b>: early enough, and ramp-up short enough, to repay the mentoring. Try a later week or a longer ramp.`);
      else say('Roughly a wash: the help arrives just as the work runs out.');
    }
  }

  ctx.loop((dt) => {
    if (!playing) return;
    t = Math.min(TMAX, t + (dt / 1000) * 2.2);
    if (t >= TMAX) { playing = false; }
    render();
  });
  t = ctx.reduced ? TMAX : TMAX;
  render();
  say('Tip: add 4 people at week 3 (late) and compare with week 0. Then shorten the ramp-up to 3 weeks.');
});
