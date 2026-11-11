/* Canary simulator: traffic weights step 5→25→50→100%. Each simulated minute the canary and the
   baseline serve requests (binomial-ish errors, latency with noise); an analysis compares them with
   thresholds (errors < max(1%, 2× baseline), p99 < baseline + 100 ms). Two consecutive failures abort:
   weight → 0. Blue-green mode switches 100% after a smoke test and rolls back with the same analysis. */
SD.widget('deployment-strategies', function (root, ctx) {
  const { el, svg } = ctx;
  const RPM = 60000;                       // 1,000 req/s
  const BASE_ERR = 0.003, BASE_P99 = 180;  // v1 baseline
  const STEP_MIN = 4;
  const PLANS = {
    canary: [5, 25, 50, 100],
    bluegreen: [0, 100, 100, 100]          // step 1 = green smoke-tested with no users, then switch
  };
  const T = STEP_MIN * 4 + 2;              // total simulated minutes
  let mode = 'canary', inj = 0, lat = 0, t = 0, acc = 0, playing = !ctx.reduced;
  let hist, fails, aborted, failed, canaryReq, done, injAt;
  let seed = 11;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.sqrt(0.5); };
  const plan = () => PLANS[mode];
  const weightAt = (m) => aborted !== null && m >= aborted ? 0 : (m >= T - 2 ? 100 : plan()[Math.min(3, Math.floor(m / STEP_MIN))]);

  function reset() {
    hist = []; fails = 0; aborted = null; failed = 0; canaryReq = 0; done = false; t = 0; acc = 0; seed = 11; injAt = inj || lat ? 0 : null;
    log.innerHTML = '';
    say(mode === 'canary' ? 'Canary plan: 5% → 25% → 50% → 100%, ' + STEP_MIN + ' min per step. Inject a fault while it runs.' : 'Blue-green: green is smoke-tested with no users for ' + STEP_MIN + ' min, then the router switches 100%.');
  }

  function tick() {                         // one simulated minute
    const w = weightAt(t) / 100;
    const nC = Math.round(RPM * w), nS = RPM - nC;
    const errC = Math.min(1, BASE_ERR + inj);
    const meas = (n, p) => n ? Math.max(0, p + gauss() * Math.sqrt(p * (1 - p) / n)) : NaN;
    const eS = meas(Math.max(nS, 600), BASE_ERR), eC = meas(nC, errC);
    const pS = BASE_P99 + gauss() * 6, pC = nC ? BASE_P99 + lat + gauss() * (nC < 3000 ? 14 : 6) : NaN;
    failed += nC * errC; canaryReq += nC;
    let verdict = 'idle';
    if (nC > 0 && aborted === null) {
      const errThr = Math.max(0.01, 2 * eS), latThr = pS + 100;
      const bad = eC > errThr || pC > latThr;
      fails = bad ? fails + 1 : 0;
      verdict = bad ? 'fail' : 'pass';
      say(`<b>min ${t + 1}</b> weight ${Math.round(w * 100)}% · v2 errors ${(eC * 100).toFixed(2)}% (limit ${(errThr * 100).toFixed(2)}%) · p99 ${Math.round(pC)} ms (limit ${Math.round(latThr)}) → ${bad ? '❌ fail ' + fails + '/2' : '✅ pass'}`);
      if (fails >= 2) {
        aborted = t + 1;
        say(`<b>⛔ Abort at min ${t + 1}:</b> weight → 0%. v1 serves everything. Failed requests on v2: <b>${Math.round(failed).toLocaleString()}</b>.`);
      }
    }
    hist.push({ eS, eC, w: Math.round(w * 100), verdict });
    t++;
    if (t >= T) {
      done = true; playing = false;
      if (aborted === null) say(`<b>✅ Promoted.</b> v2 is the new stable. Failed v2 requests during rollout: ${Math.round(failed).toLocaleString()}.`);
    }
    paint(); setPlay();
  }

  // ---------- controls ----------
  const playBtn = el('button', { class: 'btn primary', text: '' });
  const setPlay = () => { playBtn.textContent = ctx.reduced ? '▶ Next minute' : done ? '↻ Replay' : playing ? '❚❚ Pause' : '▶ Play'; };
  playBtn.addEventListener('click', () => {
    if (done) { reset(); playing = !ctx.reduced; paint(); }
    else if (ctx.reduced) tick();
    else playing = !playing;
    setPlay();
  });
  const mk = (label, opts, val, on) => {
    const s = el('select', { 'aria-label': label });
    opts.forEach(([v, l]) => { const o = el('option', { value: v, text: l }); if (v === val) o.selected = true; s.append(o); });
    s.addEventListener('change', () => on(s.value));
    return s;
  };
  const errSel = mk('Inject error rate into v2', [['0', 'v2 errors: +0%'], ['0.005', 'v2 errors: +0.5%'], ['0.02', 'v2 errors: +2%'], ['0.05', 'v2 errors: +5%'], ['0.2', 'v2 errors: +20%']], '0', (v) => {
    inj = +v; if (injAt === null && (inj || lat)) injAt = t; say(`<b>min ${t}</b> 💉 v2 error rate now baseline + ${(inj * 100).toFixed(1)}%.`);
  });
  const latSel = mk('Inject latency into v2', [['0', 'v2 latency: +0 ms'], ['60', 'v2 latency: +60 ms'], ['250', 'v2 latency: +250 ms']], '0', (v) => {
    lat = +v; if (injAt === null && (inj || lat)) injAt = t; say(`<b>min ${t}</b> 🐢 v2 p99 now baseline + ${lat} ms.`);
  });
  const modeSel = mk('Strategy', [['canary', 'Canary 5→25→50→100'], ['bluegreen', 'Blue-green switch']], 'canary', (v) => { mode = v; reset(); playing = !ctx.reduced; paint(); setPlay(); });
  const resetBtn = el('button', { class: 'btn', text: '↺ Restart' });
  resetBtn.addEventListener('click', () => { reset(); playing = !ctx.reduced; paint(); setPlay(); });
  root.append(el('div', { class: 'w-controls' }, playBtn, modeSel, errSel, latSel, resetBtn));

  const stage = el('div', { class: 'w-stage' });
  const stats = el('div', { class: 'w-stats' });
  const legend = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b style="color:var(--accent)">v2 error rate</b> vs <b style="color:var(--ok)">v1 baseline</b>; dashed <b style="color:var(--err)">limit</b> = max(1%, 2× baseline). Bars on top show the traffic weight on v2 each minute; red ticks are failed checks.' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stage, legend, stats, log);
  function say(txt) { log.prepend(el('div', { html: txt })); while (log.children.length > 30) log.lastChild.remove(); }

  // ---------- drawing ----------
  let G = null;
  function build(narrow) {
    stage.innerHTML = '';
    const W = narrow ? 360 : 720, L = narrow ? 48 : 56, R = 10, FS = narrow ? 13 : 13, FT = narrow ? 14 : 14;
    const PW = W - L - R;
    const WB = { t: 26, h: narrow ? 56 : 50 };
    const C = { t: WB.t + WB.h + 34, h: narrow ? 150 : 140 };
    const H = C.t + C.h + 30;
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Canary traffic weight and error rate over time' });
    stage.append(S);
    const txt = (x, y, s, o) => svg('text', Object.assign({ x, y, fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: s }, o || {}));
    S.append(txt(4, 17, 'Traffic on v2', { fill: 'var(--text)', style: `font:700 ${FT}px var(--sans)` }));
    S.append(svg('rect', { x: L, y: WB.t, width: PW, height: WB.h, fill: 'var(--surface-2)', rx: 4 }));
    S.append(txt(L - 6, WB.t + FS, '100%', { 'text-anchor': 'end' }), txt(L - 6, WB.t + WB.h, '0%', { 'text-anchor': 'end' }));
    S.append(txt(4, C.t - 10, 'Error rate per minute', { fill: 'var(--text)', style: `font:700 ${FT}px var(--sans)` }));
    S.append(svg('rect', { x: L, y: C.t, width: PW, height: C.h, fill: 'var(--surface-2)', rx: 4 }));
    const bars = svg('g'), ticks = svg('g'), steps = svg('g');
    const thr = svg('path', { fill: 'none', stroke: 'var(--err)', 'stroke-width': 1.6, 'stroke-dasharray': '5 4' });
    const pS = svg('path', { fill: 'none', stroke: 'var(--ok)', 'stroke-width': 2.2 });
    const pC = svg('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.6 });
    const yl = svg('g'), xl = svg('g');
    const abortLine = svg('line', { stroke: 'var(--err)', 'stroke-width': 2, visibility: 'hidden' });
    const abortTxt = txt(0, 0, 'abort', { fill: 'var(--err)', 'text-anchor': 'middle', visibility: 'hidden' });
    S.append(steps, bars, yl, xl, thr, pS, pC, ticks, abortLine, abortTxt);
    for (let k = 1; k < 4; k++) {
      const x = L + PW * (k * STEP_MIN) / T;
      steps.append(svg('line', { x1: x, y1: WB.t, x2: x, y2: C.t + C.h, stroke: 'var(--border)', 'stroke-dasharray': '3 4' }));
    }
    for (let m = 0; m <= T; m += narrow ? 6 : 3) xl.append(txt(L + PW * m / T, C.t + C.h + 18, m + 'm', { 'text-anchor': m === T ? 'end' : m === 0 ? 'start' : 'middle' }));
    G = { S, L, PW, WB, C, bars, ticks, thr, pS, pC, yl, abortLine, abortTxt, FS, txt, narrow };
    paint();
  }

  function paint() {
    if (!G) return;
    const { L, PW, WB, C } = G;
    const X = (m) => L + PW * (m + 0.5) / T;
    const top = Math.max(0.02, ...hist.map((h) => isNaN(h.eC) ? 0 : h.eC)) * 1.15;
    const maxE = Math.ceil(top * 100 / (top > 0.1 ? 10 : 2)) * (top > 0.1 ? 10 : 2) / 100;
    const Y = (e) => C.t + C.h * (1 - Math.min(1, e / maxE));
    G.yl.innerHTML = '';
    [0, maxE / 2, maxE].forEach((v) => G.yl.append(G.txt(L - 6, Y(v) + G.FS * 0.35, Math.round(v * 100) + '%', { 'text-anchor': 'end' })));
    G.bars.innerHTML = ''; G.ticks.innerHTML = '';
    const bw = PW / T * 0.8;
    hist.forEach((h, m) => {
      const bh = WB.h * h.w / 100;
      G.bars.append(svg('rect', { x: X(m) - bw / 2, y: WB.t + WB.h - bh, width: bw, height: Math.max(bh, 0.5), rx: 2, fill: h.verdict === 'fail' ? 'var(--err)' : 'var(--accent)', opacity: 0.75 }));
      if (h.verdict === 'fail') G.ticks.append(svg('circle', { cx: X(m), cy: Y(h.eC), r: 5, fill: 'var(--err)' }));
    });
    const path = (f) => hist.map((h, m) => [m, f(h)]).filter(([, v]) => !isNaN(v)).map(([m, v], i) => (i ? 'L' : 'M') + X(m).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    G.pS.setAttribute('d', path((h) => h.eS));
    G.pC.setAttribute('d', path((h) => h.eC));
    G.thr.setAttribute('d', path((h) => Math.max(0.01, 2 * h.eS)));
    if (aborted !== null) {
      const x = L + PW * aborted / T;
      ['x1', 'x2'].forEach((a) => G.abortLine.setAttribute(a, x));
      G.abortLine.setAttribute('y1', WB.t); G.abortLine.setAttribute('y2', C.t + C.h);
      G.abortLine.setAttribute('visibility', 'visible');
      G.abortTxt.setAttribute('x', Math.min(x, L + PW - 24)); G.abortTxt.setAttribute('y', WB.t - 6); G.abortTxt.setAttribute('visibility', 'visible');
    } else { G.abortLine.setAttribute('visibility', 'hidden'); G.abortTxt.setAttribute('visibility', 'hidden'); }

    // what the same fault would cost at 100% for the same detection time
    const exposedMin = injAt === null ? 0 : (aborted !== null ? aborted : t) - injAt;
    const bg = Math.max(0, exposedMin) * RPM * inj;
    stats.innerHTML = '';
    [['time', 'min ' + t + ' / ' + T],
     ['v2 weight', weightAt(Math.max(0, t - 1)) + '%' + (aborted !== null ? ' (aborted)' : '')],
     ['requests to v2', Math.round(canaryReq).toLocaleString()],
     ['failed on v2', Math.round(failed).toLocaleString()],
     ['same fault at 100%', inj ? '≈ ' + Math.round(bg).toLocaleString() : '—'],
     ['checks failed in a row', fails + ' / 2']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  ctx.loop((dt) => {
    if (!playing || done) return;
    acc += Math.min(dt, 100);
    if (acc >= 700) { acc = 0; tick(); }
  });

  reset();
  setPlay();
  build(ctx.narrow);
  ctx.onResize(build);
});
