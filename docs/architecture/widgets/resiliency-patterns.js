/* Live circuit breaker (count-based sliding window) + retry storm: capped exponential backoff vs full jitter. */
SD.widget('resiliency-patterns', function (root, ctx) {
  const { el, svg } = ctx;
  const T = 10, T0 = 1;                                   // sim seconds; the outage starts at T0
  const WIN = 20, MINC = 10, THR = 0.5, WAIT = 2, PROBES = 4, TIMEOUT = 0.3, RATE = 20;
  const CL = 200, BKT = 0.2, NB = T / BKT, CAPB = 50, BASE = 0.1, CAPS = 3.2, MAXATT = 8;
  let breakerOn = true, outage = 2, loopH = null, gen = 0;

  // ---------- retry storm: 200 clients fail together at T0 ----------
  function retrySim(jitter) {
    const calls = new Array(NB).fill(0), oks = new Array(NB).fill(0);
    let q = []; for (let i = 0; i < CL; i++) q.push({ t: T0, att: 0 });
    let total = 0, done = 0, gave = 0, doneAt = null, peak = 0;
    for (let b = 0; b < 400 && q.length; b++) {
      const lo = b * BKT, hi = lo + BKT, now = q.filter((a) => a.t < hi), up = lo >= T0 + outage - 1e-9;
      q = q.filter((a) => a.t >= hi);
      now.sort(() => Math.random() - 0.5);
      let served = 0;
      now.forEach((a) => {
        total++;
        if (up && served < CAPB) { served++; done++; doneAt = hi; return; }
        if (a.att + 1 >= MAXATT) { gave++; return; }
        const c = Math.min(CAPS, BASE * Math.pow(2, a.att));          // attempt = a.att (0 for the first retry)
        q.push({ t: a.t + (jitter ? Math.random() * c : c), att: a.att + 1 });
      });
      if (b < NB) { calls[b] = now.length; oks[b] = served; }
      if (b !== Math.round(T0 / BKT)) peak = Math.max(peak, now.length);   // skip the original requests
    }
    return { calls, oks, total, done, gave, doneAt, peak };
  }

  // ---------- circuit breaker on a steady stream ----------
  function newBreaker() {
    return { t: 0, state: 'CLOSED', win: [], openedAt: 0, probes: 0, probeRes: [], pending: [], sent: 0, failed: 0, rejected: 0, waitedMs: 0, users: 0, hist: [], log: [] };
  }
  function depUp(t) { return !(t >= T0 && t < T0 + outage); }
  function record(B, ok) {
    if (B.state === 'HALF-OPEN') {
      B.probeRes.push(ok);
      if (B.probeRes.length >= PROBES) {
        const fr = B.probeRes.filter((x) => !x).length / B.probeRes.length;
        if (fr >= THR) { B.state = 'OPEN'; B.openedAt = B.t; B.log.push(`${B.t.toFixed(1)} s · probes ${Math.round(fr * 100)}% failed → <b>OPEN</b> again`); }
        else { B.state = 'CLOSED'; B.win = []; B.log.push(`${B.t.toFixed(1)} s · ${PROBES} probes OK → <b>CLOSED</b>`); }
      }
      return;
    }
    if (B.state !== 'CLOSED') return;                    // late results while OPEN are ignored
    B.win.push(ok); if (B.win.length > WIN) B.win.shift();
    const fr = B.win.filter((x) => !x).length / B.win.length;
    if (breakerOn && B.win.length >= MINC && fr >= THR) { B.state = 'OPEN'; B.openedAt = B.t; B.log.push(`${B.t.toFixed(1)} s · failure rate ${Math.round(fr * 100)}% of ${B.win.length} calls → <b>OPEN</b>`); }
  }
  function step(B, dt) {
    B.t += dt;
    B.pending = B.pending.filter((p) => { if (p.at <= B.t) { record(B, p.ok); return false; } return true; });
    if (B.state === 'OPEN' && B.t - B.openedAt >= WAIT) { B.state = 'HALF-OPEN'; B.probes = 0; B.probeRes = []; B.log.push(`${B.t.toFixed(1)} s · waited ${WAIT} s → <b>HALF-OPEN</b>, ${PROBES} probes`); }
    if (Math.random() < RATE * dt) {
      B.users++;
      const pass = !breakerOn || B.state === 'CLOSED' || (B.state === 'HALF-OPEN' && B.probes < PROBES);
      if (!pass) { B.rejected++; }
      else {
        if (B.state === 'HALF-OPEN') B.probes++;
        const ok = depUp(B.t); B.sent++;
        if (!ok) { B.failed++; B.waitedMs += TIMEOUT * 1000; }
        B.pending.push({ at: B.t + (ok ? 0.05 : TIMEOUT), ok });
      }
    }
    const k = Math.floor(B.t / 0.1);
    if (!B.hist[k]) B.hist[k] = { st: B.state, up: depUp(B.t) };
  }

  function build(narrow) {
    const my = ++gen;
    if (loopH) { loopH.stop(); loopH = null; }
    root.innerHTML = '';
    const F = narrow ? 14 : 13, FS = narrow ? 13 : 12;
    const W = narrow ? 360 : 730, H = narrow ? 560 : 300;
    const AX = narrow ? 10 : 5, AY = 0, BX = narrow ? 10 : 385, BY = narrow ? 300 : 22;
    const txt = (x, y, s, o) => svg('text', Object.assign({ x, y, fill: 'var(--text-2)', style: `font:600 ${o && o.f || F}px var(--sans)`, text: s }, o && o.a ? { 'text-anchor': o.a } : {}, o && o.c ? { fill: o.c } : {}));

    // controls
    const runBtn = el('button', { class: 'btn primary', text: '▶ Run outage' });
    const cbBtn = el('button', { class: 'btn', text: 'Breaker: on' });
    const outV = el('b', { text: outage + ' s' });
    const outIn = el('input', { type: 'range', min: 1, max: 4, step: 0.5, value: outage, 'aria-label': 'Outage length' });
    outIn.addEventListener('input', () => { outage = +outIn.value; outV.textContent = outage + ' s'; });
    cbBtn.addEventListener('click', () => { breakerOn = !breakerOn; cbBtn.textContent = 'Breaker: ' + (breakerOn ? 'on' : 'off'); run(); });
    runBtn.addEventListener('click', run);
    root.append(el('div', { class: 'w-controls' }, runBtn, cbBtn, el('label', null, 'Outage ', outV, ' ', outIn)));

    const stage = el('div', { class: 'w-stage' });
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Circuit breaker state machine and retry storm charts' });
    stage.append(S); root.append(stage);
    stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b>trip</b> = ≥ 50% of the last 20 calls failed (min 10) · <b>wait</b> = 2 s open · <b>ok / fail</b> = result of 4 probe calls. Squares: the sliding window (<b style="color:var(--ok)">■</b> ok, <b style="color:var(--err)">■</b> failed). Charts: calls per 200 ms; the dashed line is what the dependency can serve.' }));
    const stats = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);

    // ----- panel A: state machine -----
    const A = svg('g', { transform: `translate(${AX},${AY})` });
    S.append(A);
    A.append(svg('defs', null, svg('marker', { id: 'rp-arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--text-3)' }))));
    const RW = 108, RH = 40;
    const pos = { CLOSED: [62, 42], OPEN: [278, 42], 'HALF-OPEN': [170, 128] };
    const colr = { CLOSED: 'var(--ok)', OPEN: 'var(--err)', 'HALF-OPEN': 'var(--warn)' };
    const arrow = (d) => A.append(svg('path', { d, fill: 'none', stroke: 'var(--text-3)', 'stroke-width': 1.6, 'marker-end': 'url(#rp-arr)' }));
    arrow('M118,36 L222,36'); A.append(txt(170, 28, 'trip', { a: 'middle' }));
    arrow('M262,64 L214,106'); A.append(txt(250, 100, 'wait', { a: 'start' }));
    arrow('M124,106 L84,64'); A.append(txt(92, 100, 'ok', { a: 'end' }));
    arrow('M226,140 Q318,140 306,66'); A.append(txt(302, 146, 'fail', { a: 'start' }));
    const boxes = {};
    Object.keys(pos).forEach((k) => {
      const [x, y] = pos[k];
      const r = svg('rect', { x: x - RW / 2, y: y - RH / 2, width: RW, height: RH, rx: 9, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 2 });
      const t = txt(x, y + F * 0.36, k, { a: 'middle', f: F });
      A.append(r, t); boxes[k] = { r, t };
    });
    A.append(txt(10, 178, 'Sliding window: last 20 calls', { f: FS }));
    const sq = [];
    for (let i = 0; i < WIN; i++) { const r = svg('rect', { x: 10 + i * 16.5, y: 186, width: 14, height: 14, rx: 2, fill: 'var(--surface-2)', stroke: 'var(--border)' }); A.append(r); sq.push(r); }
    const SX = 92, SW = 248;
    A.append(txt(10, 228, 'dependency', { f: FS }), txt(10, 248, 'breaker', { f: FS }));
    const gStrip = svg('g'); A.append(gStrip);
    A.append(svg('rect', { x: SX, y: 217, width: SW, height: 14, fill: 'none', stroke: 'var(--border)' }), svg('rect', { x: SX, y: 237, width: SW, height: 14, fill: 'none', stroke: 'var(--border)' }));
    [0, 5, 10].forEach((s) => A.append(txt(SX + SW * s / T, 270, s + ' s', { a: s === 0 ? 'start' : s === 10 ? 'end' : 'middle', f: FS })));
    const headA = svg('line', { x1: SX, x2: SX, y1: 212, y2: 256, stroke: 'var(--accent)', 'stroke-width': 2 }); A.append(headA);

    // ----- panel B: retry charts -----
    const Bg = svg('g', { transform: `translate(${BX},${BY})` });
    S.append(Bg);
    const CX = 40, CW = 300, CH = 78;
    function chartFrame(y0, title, color) {
      Bg.append(txt(0, y0 - 10, title, { f: F }));
      const out = svg('rect', { x: CX, y: y0, width: 0, height: CH, fill: 'color-mix(in srgb, var(--err) 12%, transparent)' }); Bg.append(out);
      Bg.append(svg('line', { x1: CX, x2: CX + CW, y1: y0 + CH, y2: y0 + CH, stroke: 'var(--border)' }));
      const capY = y0 + CH - CH * CAPB / CL;
      Bg.append(svg('line', { x1: CX, x2: CX + CW, y1: capY, y2: capY, stroke: 'var(--text-3)', 'stroke-dasharray': '4 4' }));
      Bg.append(txt(CX - 4, y0 + F * 0.7, String(CL), { a: 'end', f: FS }), txt(CX - 4, capY + FS * 0.35, String(CAPB), { a: 'end', f: FS }));
      const g = svg('g'); Bg.append(g);
      const bars = [];
      for (let b = 0; b < NB; b++) { const r = svg('rect', { x: CX + b * CW / NB + 0.5, y: y0 + CH, width: CW / NB - 1, height: 0, fill: color }); g.append(r); bars.push(r); }
      return { bars, out, y0 };
    }
    const c1 = chartFrame(22, 'Exponential backoff, no jitter', 'var(--warn)');
    const c2 = chartFrame(150, 'Full jitter', 'var(--accent)');
    [0, 5, 10].forEach((s) => Bg.append(txt(CX + CW * s / T, 250, s + ' s', { a: s === 0 ? 'start' : s === 10 ? 'end' : 'middle', f: FS })));
    const headB = svg('line', { x1: CX, x2: CX, y1: 18, y2: 232, stroke: 'var(--accent)', 'stroke-width': 1.5, opacity: 0.7 }); Bg.append(headB);

    function setStats(o) { stats.innerHTML = ''; Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); }
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }

    let B, R1, R2, shown = 0;
    function paint() {
      Object.keys(boxes).forEach((k) => {
        const on = k === B.state && (breakerOn || k === 'CLOSED');
        boxes[k].r.setAttribute('fill', on ? `color-mix(in srgb, ${colr[k]} 30%, var(--surface))` : 'var(--surface-2)');
        boxes[k].r.setAttribute('stroke', on ? colr[k] : 'var(--border)');
        boxes[k].t.setAttribute('fill', on ? 'var(--text)' : 'var(--text-3)');
      });
      for (let i = 0; i < WIN; i++) { const v = B.win[B.win.length - WIN + i]; sq[i].setAttribute('fill', v === undefined ? 'var(--surface-2)' : v ? 'var(--ok)' : 'var(--err)'); }
      for (; shown < B.hist.length; shown++) {
        const h = B.hist[shown]; if (!h) continue;
        const x = SX + SW * shown * 0.1 / T, w = SW * 0.1 / T + 0.3;
        gStrip.append(svg('rect', { x, y: 217, width: w, height: 14, fill: h.up ? 'var(--ok)' : 'var(--err)', opacity: 0.75 }));
        gStrip.append(svg('rect', { x, y: 237, width: w, height: 14, fill: breakerOn ? colr[h.st] : 'var(--text-3)', opacity: 0.75 }));
      }
      const hx = SX + SW * Math.min(B.t, T) / T; headA.setAttribute('x1', hx); headA.setAttribute('x2', hx);
      const bx = CX + CW * Math.min(B.t, T) / T; headB.setAttribute('x1', bx); headB.setAttribute('x2', bx);
      [[c1, R1], [c2, R2]].forEach(([c, R]) => {
        for (let b = 0; b < NB; b++) {
          const vis = b * BKT < B.t, n = vis ? Math.min(R.calls[b], CL) : 0, h = CH * n / CL;
          c.bars[b].setAttribute('y', c.y0 + CH - h); c.bars[b].setAttribute('height', h);
        }
      });
      const fr = B.win.length ? Math.round(100 * B.win.filter((x) => !x).length / B.win.length) : 0;
      setStats({ state: breakerOn ? B.state : 'no breaker', 'window failures': fr + '%', 'calls to dep': B.sent, 'fast-failed': B.rejected, 'time stuck waiting': (B.waitedMs / 1000).toFixed(1) + ' s' });
    }
    function finish() {
      const fmt = (R) => `${R.total} calls, ${R.done}/${CL} served` + (R.doneAt ? ` by ${R.doneAt.toFixed(1)} s` : '') + (R.gave ? `, ${R.gave} gave up` : '');
      say(`<b>Full jitter:</b> ${fmt(R2)}; busiest retry bucket ${R2.peak}.`);
      say(`<b>No jitter:</b> ${fmt(R1)}; busiest retry bucket ${R1.peak}. Clients that failed together retry together, so each wave overshoots capacity (${CAPB}).`);
      say(breakerOn ? `Breaker: ${B.rejected} calls failed fast instead of waiting ${TIMEOUT * 1000} ms on a dead dependency; ${B.sent} reached it.` : `No breaker: all ${B.sent} calls reached the dependency and ${B.failed} of them waited ${TIMEOUT * 1000} ms for a timeout.`);
    }
    function run() {
      if (my !== gen) return;
      if (loopH) { loopH.stop(); loopH = null; }
      B = newBreaker(); R1 = retrySim(false); R2 = retrySim(true); shown = 0; gStrip.innerHTML = ''; log.innerHTML = '';
      [c1, c2].forEach((c) => { c.out.setAttribute('x', CX + CW * T0 / T); c.out.setAttribute('width', CW * outage / T); });
      say(`Dependency down from ${T0} s to ${T0 + outage} s. ${breakerOn ? 'Breaker on.' : 'Breaker off.'}`);
      let logged = 0;
      const flush = () => { while (logged < B.log.length) say(B.log[logged++]); };
      if (ctx.reduced) { while (B.t < T) step(B, 0.01); flush(); paint(); finish(); return; }
      runBtn.disabled = true;
      loopH = ctx.loop((dt) => {
        const target = Math.min(T, B.t + Math.min(dt, 100) / 1000);
        while (B.t < target) step(B, 0.01);
        flush(); paint();
        if (B.t >= T) { loopH.stop(); loopH = null; runBtn.disabled = false; finish(); }
      });
    }
    B = newBreaker(); R1 = { calls: new Array(NB).fill(0) }; R2 = R1; paint();
    say('Press <b>Run outage</b>. Then turn the breaker off and run again: every call waits for the timeout instead of failing fast.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
