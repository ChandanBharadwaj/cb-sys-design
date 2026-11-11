/* Chaos experiment runner: control vs experiment group, real per-request simulation against a 6-node
   hashed cache, hypothesis check on a sliding window, and SLO-based auto-abort. */
SD.widget('chaos-engineering', function (root, ctx) {
  const { el, svg } = ctx;
  const NODES = 6, T = 30, T_IN = 5, T_OUT = 25, TICK = 0.25, N_REQ = 120, WIN = 2;   // seconds; WIN = SLI window
  const P99_MAX = 300, ERR_MAX = 1, ABORT_AFTER = 3, RPS = 2000;
  const FAULTS = {
    kill: { l: 'Kill 1 node', d: 'node refuses → client waits for its timeout' },
    latency: { l: '+400 ms latency', d: 'node answers, but 400 ms late' },
    loss: { l: '30% packet loss', d: 'TCP retransmits (≥ 200 ms RTO), some resets' }
  };
  let fault = 'kill', radius = 5, fixed = false, autoAbort = true, loopH = null, gen = 0;

  // one request's latency (ms) and success, for a group
  function request(inFault) {
    let ms = 20 + 25 * Math.exp(0.45 * gauss());                 // healthy: lognormal around ~45 ms
    const node = (Math.random() * NODES) | 0;
    if (!inFault || node !== 0) return { ms, ok: Math.random() > 0.001 };
    const CT = fixed ? 50 : 2000;                                // client timeout: 50 ms with the fix, 2 s default
    const fallback = () => ({ ms: ms + CT + 35 + 15 * Math.random(), ok: true });   // DB read after timeout
    if (fault === 'kill') return fixed ? fallback() : { ms: ms + CT, ok: false };
    if (fault === 'latency') return fixed ? fallback() : { ms: ms + 400 + 30 * Math.random(), ok: true };
    // packet loss: 30% of requests need a retransmit; 10% of those are reset
    if (Math.random() < 0.3) {
      if (fixed) return fallback();
      if (Math.random() < 0.1) return { ms: ms + CT, ok: false };
      return { ms: ms + 200 + 200 * Math.random(), ok: true };
    }
    return { ms, ok: true };
  }
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function p99(arr) { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(0.99 * s.length))]; }

  function build(narrow) {
    const my = ++gen;
    if (loopH) { loopH.stop(); loopH = null; }
    root.innerHTML = '';
    const F = narrow ? 14 : 13, W = narrow ? 360 : 640, H = narrow ? 345 : 295;
    const CX = narrow ? 46 : 52, CW = W - CX - 10, LAT_Y = 40, LAT_H = narrow ? 150 : 130, ERR_Y = LAT_Y + LAT_H + (narrow ? 46 : 40), ERR_H = narrow ? 70 : 54;
    const YMAX = 1000, EMAX = 20;
    const txt = (x, y, s, o) => svg('text', Object.assign({ x, y, fill: (o && o.c) || 'var(--text-2)', style: `font:600 ${(o && o.f) || F}px var(--sans)`, text: s }, o && o.a ? { 'text-anchor': o.a } : {}));

    // ----- controls -----
    const hyp = el('div', { class: 'muted', style: { fontSize: '14px', margin: '0 0 8px' }, html: '<b>Hypothesis:</b> in the experiment group, <b>p99 &lt; 300 ms</b> and <b>errors &lt; 1%</b> while one of 6 cache nodes is faulty. <b>Abort</b> if either is breached for 3 s.' });
    const runBtn = el('button', { class: 'btn primary', text: '▶ Run experiment' });
    const faultBtns = Object.keys(FAULTS).map((k) => { const b = el('button', { class: 'btn', text: FAULTS[k].l }); b.addEventListener('click', () => { fault = k; sync(); }); return [k, b]; });
    const radBtns = [1, 5, 25, 100].map((r) => { const b = el('button', { class: 'btn', text: r + '%' }); b.addEventListener('click', () => { radius = r; sync(); }); return [r, b]; });
    const fixBtn = el('button', { class: 'btn' });
    const abBtn = el('button', { class: 'btn' });
    fixBtn.addEventListener('click', () => { fixed = !fixed; sync(); });
    abBtn.addEventListener('click', () => { autoAbort = !autoAbort; sync(); });
    runBtn.addEventListener('click', run);
    function sync() {
      faultBtns.forEach(([k, b]) => b.classList.toggle('primary', k === fault));
      radBtns.forEach(([r, b]) => b.classList.toggle('primary', r === radius));
      fixBtn.textContent = 'Fix: timeout + fallback ' + (fixed ? 'ON' : 'OFF'); fixBtn.classList.toggle('primary', fixed);
      abBtn.textContent = 'SLO auto-abort ' + (autoAbort ? 'ON' : 'OFF'); abBtn.classList.toggle('primary', autoAbort);
    }
    root.append(hyp,
      el('div', { class: 'w-controls' }, el('span', { class: 'muted', text: 'Fault:' }), ...faultBtns.map((x) => x[1])),
      el('div', { class: 'w-controls' }, el('span', { class: 'muted', text: 'Blast radius:' }), ...radBtns.map((x) => x[1])),
      el('div', { class: 'w-controls' }, fixBtn, abBtn, runBtn));
    sync();

    // ----- chart -----
    const stage = el('div', { class: 'w-stage' });
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'p99 latency and error rate over time for control and experiment groups' });
    stage.append(S); root.append(stage);
    stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b style="color:var(--text-3)">━</b> control group · <b style="color:var(--accent)">━</b> experiment group · dashed = hypothesis threshold · shaded = fault active. p99 and error rate over a sliding 2 s window.' }));
    const stats = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);

    const xOf = (t) => CX + CW * t / T;
    const yLat = (v) => LAT_Y + LAT_H - LAT_H * Math.min(v, YMAX) / YMAX;
    const yErr = (v) => ERR_Y + ERR_H - ERR_H * Math.min(v, EMAX) / EMAX;
    const shade = svg('rect', { x: xOf(T_IN), y: LAT_Y, width: 0, height: ERR_Y + ERR_H - LAT_Y, fill: 'color-mix(in srgb, var(--warn) 14%, transparent)' });
    S.append(shade);
    S.append(txt(0, LAT_Y - 20, "p99 latency (ms)"), txt(0, ERR_Y - 16, "errors (%)"));
    [[LAT_Y, LAT_H], [ERR_Y, ERR_H]].forEach(([y, h]) => S.append(svg('line', { x1: CX, x2: CX + CW, y1: y + h, y2: y + h, stroke: 'var(--border)' })));
    [0, 500, 1000].forEach((v) => S.append(txt(CX - 4, yLat(v) + 5, String(v), { a: 'end', f: 13 })));
    [0, 20].forEach((v) => S.append(txt(CX - 4, yErr(v) + 5, String(v), { a: 'end', f: 13 })));
    S.append(svg('line', { x1: CX, x2: CX + CW, y1: yLat(P99_MAX), y2: yLat(P99_MAX), stroke: 'var(--err)', 'stroke-dasharray': '5 4' }));
    S.append(svg('line', { x1: CX, x2: CX + CW, y1: yErr(ERR_MAX), y2: yErr(ERR_MAX), stroke: 'var(--err)', 'stroke-dasharray': '5 4' }));
    S.append(txt(CX + CW - 2, yLat(P99_MAX) - 5, '300 ms', { a: 'end', f: 13, c: 'var(--err)' }));
    [0, 10, 20, 30].forEach((s) => S.append(txt(xOf(s), H - 4, s + ' s', { a: s === 0 ? 'start' : s === 30 ? 'end' : 'middle', f: 13 })));
    const mk = (c, w) => { const p = svg('polyline', { fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linejoin': 'round' }); S.append(p); return p; };
    const lc = mk('var(--text-3)', 2), le = mk('var(--accent)', 2.5), ec = mk('var(--text-3)', 2), ee = mk('var(--accent)', 2.5);
    const abortMark = svg('line', { x1: 0, x2: 0, y1: LAT_Y, y2: ERR_Y + ERR_H, stroke: 'var(--err)', 'stroke-width': 2.5, opacity: 0 });
    const abortTxt = txt(0, LAT_Y + 16, 'ABORT', { f: 14, c: 'var(--err)' });
    abortTxt.setAttribute('opacity', 0);
    S.append(abortMark, abortTxt);

    function setStats(o) { stats.innerHTML = ''; Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); }
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 20) log.lastChild.remove(); }

    let R;
    function fresh() { return { t: 0, buf: { c: [], e: [] }, pts: { c: [], e: [], ec: [], ee: [] }, breach: 0, aborted: null, faultOn: false, badExp: 0, totalExp: 0, worstP99: 0, worstErr: 0 }; }
    function tick() {
      R.t += TICK;
      const faultOn = R.t > T_IN && R.t <= T_OUT && !R.aborted;
      if (faultOn && !R.faultOn) say(`${R.t.toFixed(1)} s · fault injected: <b>${FAULTS[fault].l}</b> on cache node 0 (${FAULTS[fault].d}) for ${radius}% of users.`);
      if (!faultOn && R.faultOn && !R.aborted) say(`${R.t.toFixed(1)} s · planned end: fault removed.`);
      R.faultOn = faultOn;
      ['c', 'e'].forEach((g) => {
        for (let i = 0; i < N_REQ * TICK * 4; i++) R.buf[g].push(Object.assign({ t: R.t }, request(g === 'e' && faultOn)));
        R.buf[g] = R.buf[g].filter((r) => r.t > R.t - WIN);
      });
      const m = (g) => ({ p: p99(R.buf[g].map((r) => r.ms)), e: 100 * R.buf[g].filter((r) => !r.ok).length / R.buf[g].length });
      const C = m('c'), E = m('e');
      R.pts.c.push([R.t, C.p]); R.pts.e.push([R.t, E.p]); R.pts.ec.push([R.t, C.e]); R.pts.ee.push([R.t, E.e]);
      if (faultOn) {
        R.worstP99 = Math.max(R.worstP99, E.p); R.worstErr = Math.max(R.worstErr, E.e);
        const fr = R.buf.e.filter((r) => r.t > R.t - TICK);
        const bad = fr.filter((r) => !r.ok || r.ms > P99_MAX).length / fr.length;   // share of requests that hurt a user
        R.badExp += bad * RPS * radius / 100 * TICK; R.totalExp += RPS * radius / 100 * TICK;
      }
      const breached = E.p > P99_MAX || E.e > ERR_MAX;
      R.breach = breached && faultOn ? R.breach + TICK : 0;
      if (R.breach >= ABORT_AFTER && autoAbort && !R.aborted) {
        R.aborted = R.t;
        say(`<b style="color:var(--err)">${R.t.toFixed(1)} s · ABORT</b>: ${E.p > P99_MAX ? 'p99 ' + Math.round(E.p) + ' ms' : 'errors ' + E.e.toFixed(1) + '%'} breached for ${ABORT_AFTER} s. Fault removed, experiment group returned to normal routing.`);
      }
    }
    function line(p, pts, f) { p.setAttribute('points', pts.map(([t, v]) => xOf(t).toFixed(1) + ',' + f(v).toFixed(1)).join(' ')); }
    function paint() {
      line(lc, R.pts.c, yLat); line(le, R.pts.e, yLat); line(ec, R.pts.ec, yErr); line(ee, R.pts.ee, yErr);
      const end = R.aborted || Math.min(R.t, T_OUT);
      shade.setAttribute('width', Math.max(0, xOf(Math.max(end, T_IN)) - xOf(T_IN)));
      if (R.aborted) {
        const x = xOf(R.aborted);
        abortMark.setAttribute('x1', x); abortMark.setAttribute('x2', x); abortMark.setAttribute('opacity', 1);
        abortTxt.setAttribute('x', x + 5); abortTxt.setAttribute('opacity', 1);
      } else { abortMark.setAttribute('opacity', 0); abortTxt.setAttribute('opacity', 0); }
      const last = R.pts.e[R.pts.e.length - 1], lastE = R.pts.ee[R.pts.ee.length - 1];
      setStats({
        'exp p99': last ? Math.round(last[1]) + ' ms' : '—',
        'exp errors': lastE ? lastE[1].toFixed(1) + '%' : '—',
        'users exposed': radius + '%',
        'bad requests': ctx.fmt.num(Math.round(R.badExp)),
        'budget used': (100 * R.badExp / (RPS * 2592000 * 0.001)).toFixed(3) + '%'
      });
    }
    function finish() {
      const held = R.worstP99 < P99_MAX && R.worstErr < ERR_MAX;
      if (held) say(`<b style="color:var(--ok)">Hypothesis held.</b> Worst p99 ${Math.round(R.worstP99)} ms, worst errors ${R.worstErr.toFixed(1)}%. ${radius < 25 ? 'Next step: widen the blast radius.' : 'Schedule it to run continuously.'}`);
      else say(`<b style="color:var(--err)">Hypothesis failed</b>: worst p99 ${Math.round(R.worstP99)} ms, errors ${R.worstErr.toFixed(1)}%. ${Math.round(R.badExp)} bad requests at ${radius}% radius${R.aborted ? ', cut short by the abort' : ', with no abort the fault ran the full 20 s'}. ${fixed ? '' : 'File a finding, turn on the fix and rerun.'}`);
    }
    function run() {
      if (my !== gen) return;
      if (loopH) { loopH.stop(); loopH = null; }
      R = fresh(); log.innerHTML = '';
      say(`Run: ${FAULTS[fault].l}, ${radius}% radius, fix ${fixed ? 'on' : 'off'}, auto-abort ${autoAbort ? 'on' : 'off'}. Steady state first (0–5 s).`);
      if (ctx.reduced) { while (R.t < T) tick(); paint(); finish(); return; }
      runBtn.disabled = true; let acc = 0;
      loopH = ctx.loop((dt) => {
        acc += Math.min(dt, 100) / 1000 * 4;                     // 4× real time
        while (acc >= TICK && R.t < T) { tick(); acc -= TICK; }
        paint();
        if (R.t >= T) { loopH.stop(); loopH = null; runBtn.disabled = false; finish(); }
      });
    }
    R = fresh(); paint();
    say('Press <b>Run experiment</b> with the fix OFF: the hypothesis fails and the abort fires. Then turn the fix ON and run again.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
