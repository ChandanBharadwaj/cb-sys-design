/* Lead-time simulator: a feature team needs DB + service + pipeline, then codes and deploys.
   Ticket-ops: each step waits in a queue; mean wait from M/M/1, Wq = rho/(1-rho) * service time, sampled exponentially.
   Golden path: one scaffolder run provisions everything. Shows lead time, DORA lead time (commit -> prod) and hand-offs. */
SD.widget('platform-engineering', function (root, ctx) {
  const { el, svg } = ctx;
  const SVC = 0.5;          // days of hands-on ops work per ticket
  const CODE = 2;           // days of coding
  let rho = 0.85, seed = 7, busy = false, prog = 1, plan = null;

  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  const expo = (mean) => -Math.log(1 - rnd() * 0.999) * mean;

  function build() {
    const wq = rho / (1 - rho) * SVC;
    // ticket-ops: DB -> service infra -> pipeline -> code -> release ticket -> prod
    const steps = [
      { lane: 'DBA queue', name: 'DB ticket', wait: expo(wq), work: SVC },
      { lane: 'Infra queue', name: 'Namespace ticket', wait: expo(wq), work: SVC },
      { lane: 'CI/CD queue', name: 'Pipeline ticket', wait: expo(wq), work: SVC },
      { lane: 'Feature team', name: 'Code', wait: 0, work: CODE, team: true },
      { lane: 'Release queue', name: 'Deploy ticket', wait: expo(wq), work: SVC }
    ];
    let t = 0; steps.forEach((s) => { s.start = t; t += s.wait + s.work; s.end = t; });
    const tickTotal = t, tickDora = steps[4].end - steps[3].end;
    const gp = [
      { lane: 'Golden path', name: 'Template: repo+DB+pipeline', wait: 0, work: 0.04 },
      { lane: 'Feature team', name: 'Code', wait: 0, work: CODE, team: true },
      { lane: 'Golden path', name: 'Pipeline deploy', wait: 0, work: 0.03 }
    ];
    t = 0; gp.forEach((s) => { s.start = t; t += s.work; s.end = t; });
    return { wq, steps, gp, tickTotal, tickDora, gpTotal: t, gpDora: gp[2].work };
  }

  // ---- controls
  const rhoLbl = el('b', { text: '' });
  const slider = el('input', { type: 'range', min: 50, max: 97, step: 1, value: 85, 'aria-label': 'Ops team utilisation' });
  slider.addEventListener('input', () => { rho = slider.value / 100; plan = build(); prog = 1; render(); });
  const runBtn = el('button', { class: 'btn primary', text: '▶ Run', onclick: () => run() });
  const againBtn = el('button', { class: 'btn', text: '🎲 New sample', onclick: () => { if (busy) return; plan = build(); prog = 1; render(); } });
  root.append(el('div', { class: 'w-controls' }, el('span', { class: 'muted', style: { fontSize: '13px' } }, 'Ops utilisation ', rhoLbl), slider, runBtn, againBtn));

  const box = el('div', { class: 'w-stage', style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px' } });
  root.append(box);
  root.append(el('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '13px' }, html: 'Grey = waiting in a queue, coloured = someone working. Both panels share one time axis in days. Each ticket wait is drawn from an exponential distribution with the M/M/1 mean; press <b>New sample</b> to see the spread.' }));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  let S = null, W = 360, FS = 15;

  function draw(narrow) {
    W = narrow ? 340 : 640; FS = narrow ? 15 : 13;
    box.innerHTML = '';
    S = svg('svg', { viewBox: `0 0 ${W} 400`, role: 'img', 'aria-label': 'Lead time timelines for ticket-ops and golden path' });
    box.append(S);
  }

  function lanesOf(steps) { const L = []; steps.forEach((s) => { if (!L.includes(s.lane)) L.push(s.lane); }); return L; }

  function panel(y0, title, steps, scale, now, col, total) {
    const L = lanesOf(steps), x0 = 10, rowH = FS > 13 ? 40 : 36;
    S.append(svg('text', { x: x0, y: y0, fill: 'var(--text)', style: `font:700 ${FS+1}px var(--sans)`, text: title }));
    L.forEach((lane, i) => {
      const y = y0 + 12 + i * rowH;
      S.append(svg('text', { x: x0, y: y + FS - 1, fill: 'var(--text-2)', style: `font:500 ${FS}px var(--sans)`, text: lane }));
      S.append(svg('line', { x1: x0, x2: W - 10, y1: y + rowH - 4, y2: y + rowH - 4, stroke: 'var(--border)' }));
    });
    steps.forEach((s) => {
      const y = y0 + 12 + L.indexOf(s.lane) * rowH + (FS > 13 ? 20 : 16);
      const xs = (d) => x0 + Math.min(d, now) * scale;
      if (now <= s.start) return;
      if (s.wait > 0) S.append(svg('rect', { x: xs(s.start), y, width: Math.max(1, xs(s.start + s.wait) - xs(s.start)), height: 12, rx: 3, fill: 'var(--text-3)', opacity: 0.45 }));
      const ws = s.start + s.wait;
      if (now > ws) S.append(svg('rect', { x: xs(ws), y, width: Math.max(3, xs(s.end) - xs(ws)), height: 12, rx: 3, fill: s.team ? 'var(--accent)' : col }));
    });
    const done = now >= total;
    const cx = x0 + Math.min(now, total) * scale;
    S.append(svg('line', { x1: cx, x2: cx, y1: y0 + 8, y2: y0 + 12 + L.length * rowH, stroke: done ? 'var(--ok)' : 'var(--err)', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
    return y0 + 12 + L.length * rowH;
  }

  function render() {
    rhoLbl.textContent = Math.round(rho * 100) + '%';
    const P = plan, maxT = Math.max(P.tickTotal, 3);
    const scale = (W - 24) / maxT, now = prog * maxT;
    S.innerHTML = '';
    const yEnd = panel(18, 'Ticket-ops: 4 tickets in sequence', P.steps, scale, now, 'var(--warn)', P.tickTotal);
    const y2 = yEnd + 26;
    const yEnd2 = panel(y2, 'Golden path: self-service', P.gp, scale, now, 'var(--ok)', P.gpTotal);
    // day axis
    const ay = yEnd2 + 22, step = maxT > 30 ? 10 : maxT > 12 ? 5 : maxT > 6 ? 2 : 1;
    for (let d = 0; d <= maxT; d += step) S.append(svg('text', { x: 10 + d * scale, y: ay, 'text-anchor': d ? 'middle' : 'start', fill: 'var(--text-3)', style: `font:500 ${FS}px var(--mono)`, text: d + 'd' }));
    S.setAttribute('viewBox', `0 0 ${W} ${ay + 8}`);
    stats.innerHTML = '';
    const f = (d) => d < 1 ? Math.round(d * 24) + ' h' : d.toFixed(1) + ' d';
    [['Mean queue wait (M/M/1)', f(P.wq) + ' per ticket'], ['Ticket-ops lead time', f(P.tickTotal)], ['Golden path lead time', f(P.gpTotal)],
      ['DORA lead time (commit → prod)', f(P.tickDora) + ' vs ' + f(P.gpDora)], ['Hand-offs', '4 vs 0'], ['Flow efficiency', Math.round((CODE + 4 * SVC) / P.tickTotal * 100) + '% vs ' + Math.round(CODE / P.gpTotal * 100) + '%']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  const say = (h) => { log.insertBefore(el('div', { html: h }), log.firstChild); while (log.childNodes.length > 6) log.removeChild(log.lastChild); };

  function run() {
    if (busy) return;
    busy = true; runBtn.disabled = true; prog = 0;
    const P = plan;
    say(`▶ Request at ${Math.round(rho * 100)}% ops utilisation: DB, service and pipeline needed.`);
    if (ctx.reduced) { prog = 1; finish(P); return; }
    const dur = 4.5; let elapsed = 0, said = new Set();
    const h = ctx.loop((dt) => {
      elapsed += dt / 1000; prog = Math.min(1, elapsed / dur);
      const now = prog * Math.max(P.tickTotal, 3);
      P.steps.forEach((s, i) => { if (now >= s.start + s.wait && !said.has(i)) { said.add(i); if (s.wait > 0) say(`↪ <b>${s.name}</b> picked up after waiting ${s.wait.toFixed(1)} d in the ${s.lane}.`); } });
      render();
      if (prog >= 1) { h.stop(); finish(P); }
    });
  }
  function finish(P) {
    render(); busy = false; runBtn.disabled = false;
    say(`✅ Golden path in production after <b>${P.gpTotal.toFixed(1)} d</b>; ticket-ops after <b>${P.tickTotal.toFixed(1)} d</b> (${(P.tickTotal / P.gpTotal).toFixed(1)}× longer). The code took 2 days in both.`);
  }

  draw(ctx.narrow);
  ctx.onResize((n) => { draw(n); render(); });
  plan = build(); render();
  say('Tip: drag utilisation from 50% to 95%. The mean wait goes from 0.5 d to 9.5 d per ticket: ρ/(1−ρ) explodes near 100%.');
});
