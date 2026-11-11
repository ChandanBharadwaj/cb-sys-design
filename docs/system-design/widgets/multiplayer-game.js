/* Server truth vs A's screen: client prediction, entity interpolation (2 ticks) and server-side rewind for hits. */
SD.widget('multiplayer-game', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 380, H = 300, HB = 12, COVER = 300, LX = 40, RX = 372;
  const SY = { b: 40, a: 66 }, CY = { b: 188, a: 216 };
  let rtt = 80, hz = 64, lagComp = true, predict = true, dir = 0, t = 0, aPred = 120, hits = 0, misses = 0;
  let aHist = [[0, 120]], shots = [], statT = 0;
  const tickMs = () => 1000 / hz;

  // B strafes out, ducks into cover, comes back (period 3.2 s)
  function bx(ms) {
    const u = ((ms / 1000) % 3.2) / 3.2;
    if (u < 0.4) return 110 + (u / 0.4) * 235;
    if (u < 0.5) return 345;
    if (u < 0.9) return 345 - ((u - 0.5) / 0.4) * 235;
    return 110;
  }
  const bTick = (n) => bx(n * tickMs());
  const bInterp = (time) => { const k = time / tickMs(), n = Math.floor(k); return bTick(n) + (bTick(n + 1) - bTick(n)) * (k - n); };
  const bServer = () => bTick(Math.floor(t / tickMs()));
  const lag = () => rtt / 2 + 2 * tickMs();                    // how far in the past A sees B
  const aAt = (time) => { for (let i = aHist.length - 1; i >= 0; i--) if (aHist[i][0] <= time) return aHist[i][1]; return aHist[0][1]; };
  const aServer = () => aAt(Math.floor((t - rtt / 2) / tickMs()) * tickMs());

  // controls
  const hold = (txt, d) => {
    const b = el('button', { class: 'btn', text: txt, 'aria-label': d < 0 ? 'Move left' : 'Move right' });
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); dir = d; });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => { if (dir === d) dir = 0; }));
    return b;
  };
  const fireBtn = el('button', { class: 'btn primary', text: '🎯 Fire' });
  const lcBtn = el('button', { class: 'btn', text: '' });
  const prBtn = el('button', { class: 'btn', text: '' });
  const tkBtn = el('button', { class: 'btn', text: '' });
  const pOut = el('b', { text: '' });
  const pIn = el('input', { type: 'range', min: 0, max: 250, step: 10, value: rtt, 'aria-label': 'Round-trip ping' });
  function paint() {
    lcBtn.textContent = 'Lag comp: ' + (lagComp ? 'on' : 'off');
    prBtn.textContent = 'Prediction: ' + (predict ? 'on' : 'off');
    tkBtn.textContent = 'Tick: ' + hz + ' Hz';
    pOut.textContent = rtt + ' ms';
  }
  lcBtn.addEventListener('click', () => { lagComp = !lagComp; paint(); say(lagComp ? 'Lag comp on: the server rewinds B to what A saw.' : 'Lag comp off: the server tests the shot against B <i>now</i>.'); });
  prBtn.addEventListener('click', () => { predict = !predict; paint(); say(predict ? 'Prediction on: A moves the instant you press.' : 'Prediction off: A only moves when the server\'s answer comes back, a full RTT later. Hold ◀ ▶ to feel it.'); });
  tkBtn.addEventListener('click', () => { hz = hz === 20 ? 64 : hz === 64 ? 128 : 20; paint(); say(`Tick ${hz} Hz: one tick = ${tickMs().toFixed(1)} ms; the 2-tick interpolation buffer is ${(2 * tickMs()).toFixed(0)} ms.`); });
  pIn.addEventListener('input', () => { rtt = +pIn.value; paint(); });
  fireBtn.addEventListener('click', fire);
  root.append(el('div', { class: 'w-controls' }, hold('◀', -1), hold('▶', 1), fireBtn, lcBtn, prBtn, tkBtn, el('label', null, 'Ping (RTT) ', pOut, ' ', pIn)));

  // drawing
  const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Server state and player A screen over time' });
  // Phone readability: same geometry, but every label gets a larger size when the widget is narrow
  // (the 380-wide viewBox is drawn at ~0.9× on a phone). sz = [desktop px, phone px].
  const sized = [];
  const tx = (x, y, s, st, fill, sz) => {
    const n = svg('text', { x, y, style: st || 'font:700 14px var(--sans)', fill: fill || 'var(--text-2)', text: s }); S.append(n);
    if (sz) { n._st = st || 'font:700 14px var(--sans)'; n._sz = sz; sized.push(n); }
    return n;
  };
  const applySizes = (narrow) => sized.forEach((n) => n.setAttribute('style', n._st.replace(/\d+(\.\d+)?px/, (narrow ? n._sz[1] : n._sz[0]) + 'px')));
  [[22, 'SERVER'], [170, 'SCREEN']].forEach(([y]) => {
    S.append(svg('rect', { x: LX, y, width: RX - LX, height: 58, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
    S.append(svg('rect', { x: COVER, y: y + 2, width: RX - COVER - 2, height: 54, rx: 6, fill: 'color-mix(in srgb, var(--text-3) 30%, var(--surface-2))' }));
  });
  tx(COVER + 6, 76, 'cover', 'font:600 12px var(--sans)', 'var(--text-3)', [12, 13.5]); tx(COVER + 6, 224, 'cover', 'font:600 12px var(--sans)', 'var(--text-3)', [12, 13.5]);
  const sTitle = tx(LX, 15, '', null, null, [14, 14.5]), cTitle = tx(LX, 163, '', null, null, [14, 14.5]);
  const mid = tx(W / 2 + 14, 125, '', 'font:500 13px var(--mono);text-anchor:middle', 'var(--text-3)', [13, 14]);
  // wires: inputs up (x=14), snapshots down (x=28)
  S.append(svg('line', { x1: 14, x2: 14, y1: 66, y2: 216, stroke: 'var(--border)' }), svg('line', { x1: 28, x2: 28, y1: 40, y2: 188, stroke: 'var(--border)' }));
  const gDots = svg('g'), gShots = svg('g');
  const box = (fill, dash) => svg('rect', { y: 0, width: 2 * HB, height: 20, rx: 5, fill, stroke: dash ? 'var(--text-2)' : 'none', 'stroke-dasharray': dash ? '3 2' : '', 'fill-opacity': dash ? 0 : 1 });
  const sB = box('var(--accent)'), cB = box('color-mix(in srgb, var(--accent) 60%, var(--surface))');
  const sA = svg('circle', { r: 8, fill: 'var(--ok)' }), cA = svg('circle', { r: 8, fill: 'var(--ok)' });
  const cAghost = svg('circle', { r: 8, fill: 'none', stroke: 'var(--ok)', 'stroke-dasharray': '3 2' });
  S.append(sB, sA, cB, cAghost, cA, gDots, gShots);
  [['B', SY.b], ['A', SY.a], ['B', CY.b], ['A', CY.a]].forEach(([s, y]) => tx(LX + 6, y + 5, s, 'font:700 14px var(--mono)', 'var(--text-3)'));
  // timeline bars
  const bar1 = svg('rect', { y: 246, height: 10, rx: 3, fill: 'var(--accent)', opacity: 0.55 });
  const bar2 = svg('rect', { y: 274, height: 10, rx: 3, fill: 'var(--ok)', opacity: 0.55 });
  const gTicks = svg('g');
  S.append(bar1, bar2, gTicks);
  const l1 = tx(LX, 256, '', 'font:600 13px var(--sans)', null, [13, 14]), l2 = tx(LX, 284, '', 'font:600 13px var(--sans)', null, [13, 14]);
  tx(RX, 241, 'now', 'font:600 12px var(--mono);text-anchor:end', 'var(--text-3)', [12, 13.5]);
  applySizes(ctx.narrow);
  ctx.onResize(applySizes);
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '500px' } }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function say(h) { log.prepend(el('div', { html: h })); while (log.children.length > 30) log.lastChild.remove(); }
  const place = (n, x, y) => { if (n.tagName === 'circle') { n.setAttribute('cx', x); n.setAttribute('cy', y); } else { n.setAttribute('x', x - HB); n.setAttribute('y', y - 10); } };

  function fire() {
    const aim = bInterp(t - lag()), ax = predict ? aPred : aAt(t - rtt);
    shots.push({ tf: t, aim, ax, rt: t - lag(), arrive: t + rtt / 2, res: null });
  }
  function resolve(s) {
    const target = lagComp ? bInterp(s.rt) : bServer(), now = bServer();
    const hit = Math.abs(s.aim - target) <= HB;
    s.res = { target, now, hit, at: t }; hit ? hits++ : misses++;
    const m = ((s.aim - target) / 50).toFixed(2);   // 50 units ≈ 1 m
    if (lagComp) say(`${hit ? '✅ HIT' : '✖ miss'}: server rewound B by <b>${Math.round(lag())} ms</b> (RTT/2 + 2 ticks) to where A saw it.${hit && now > COVER + HB ? ' On the server B is already <b>behind cover</b>: "shot around the corner".' : ''}`);
    else say(`${hit ? '✅ HIT (lucky)' : '✖ MISS'}: aimed at B as drawn, but B has moved <b>${Math.abs(m)} m</b> since then. Without rewind you must lead your target by your ping.`);
  }

  function frame(dt) {
    t += dt;
    if (dir) aPred = Math.max(LX + 20, Math.min(COVER - 30, aPred + dir * 0.18 * dt));
    aHist.push([t, aPred]);
    while (aHist.length > 2 && aHist[1][0] < t - 2000) aHist.shift();
    shots.forEach((s) => { if (!s.res && t >= s.arrive) resolve(s); });
    shots = shots.filter((s) => !s.res || t - s.res.at < 1600);
    const n = Math.floor(t / tickMs());
    place(sB, bServer(), SY.b); place(sA, aServer(), SY.a);
    place(cB, bInterp(t - lag()), CY.b);
    const aSeen = aAt(Math.floor((t - rtt) / tickMs()) * tickMs());
    place(cA, predict ? aPred : aSeen, CY.a); place(cAghost, aSeen, CY.a);
    cAghost.setAttribute('opacity', predict && Math.abs(aPred - aSeen) > 2 ? 1 : 0);
    sTitle.textContent = `SERVER (truth) · tick ${n} · ${hz} Hz`;
    cTitle.textContent = `A's SCREEN · B drawn ${Math.round(lag())} ms in the past`;
    mid.textContent = `one-way ${Math.round(rtt / 2)} ms · tick ${tickMs().toFixed(1)} ms`;
    // dots on the wires: inputs every tick up, snapshots every tick down (thinned for drawing)
    gDots.innerHTML = '';
    const one = Math.max(1, rtt / 2), every = Math.max(1, Math.ceil(hz / 32));
    for (let k = n; k > n - 64; k--) {
      if (k % every) continue;
      const age = t - k * tickMs(); if (age > one) break;
      const f = age / one;
      gDots.append(svg('circle', { cx: 14, cy: 216 - f * 150, r: 3, fill: 'var(--ok)' }), svg('circle', { cx: 28, cy: 40 + f * 148, r: 3, fill: 'var(--accent)' }));
    }
    // shots
    gShots.innerHTML = '';
    shots.forEach((s) => {
      if (!s.res) {
        const f = Math.min(1, (t - s.tf) / Math.max(1, s.arrive - s.tf));
        gShots.append(svg('line', { x1: s.ax, y1: CY.a, x2: s.aim, y2: CY.b, stroke: 'var(--warn)', 'stroke-width': 2 }));
        gShots.append(svg('circle', { cx: s.ax, cy: CY.a - 14 - f * (CY.a - 14 - SY.a - 12), r: 6, fill: 'var(--warn)' }));
      } else {
        const c = s.res.hit ? 'var(--ok)' : 'var(--err)';
        if (lagComp) { const g = box('none', true); place(g, s.res.target, SY.b); gShots.append(g); }
        gShots.append(svg('line', { x1: aServer(), y1: SY.a, x2: s.aim, y2: SY.b, stroke: c, 'stroke-width': 2.5 }));
        gShots.append(svg('text', { x: Math.min(RX - 4, Math.max(LX + 30, s.aim)), y: SY.b - 13, 'text-anchor': 'middle', style: 'font:800 14px var(--sans);paint-order:stroke;stroke:var(--bg);stroke-width:3px', fill: c, text: s.res.hit ? 'HIT' : 'MISS' }));
      }
    });
    // timeline: bars end at "now"; 270 units = 400 ms
    const sc = 180 / 400, w1 = Math.min(180, lag() * sc), w2 = Math.min(180, (rtt / 2) * sc);
    bar1.setAttribute('x', RX - w1); bar1.setAttribute('width', w1);
    bar2.setAttribute('x', RX - w2); bar2.setAttribute('width', Math.max(1, w2));
    l1.textContent = `B shown ${Math.round(lag())} ms late`; l2.textContent = `A's input lands +${Math.round(rtt / 2)} ms`;
    gTicks.innerHTML = '';
    for (let k = n; (t - k * tickMs()) * sc < 180; k--) { const x = RX - (t - k * tickMs()) * sc; gTicks.append(svg('line', { x1: x, x2: x, y1: 258, y2: 264, stroke: 'var(--text-3)' })); }
    if (t - statT > 250) {
      statT = t;
      stats.innerHTML = '';
      Object.entries({ hits, misses, 'unacked inputs': predict ? Math.ceil(rtt / tickMs()) : 0, 'interp buffer': Math.round(2 * tickMs()) + ' ms' })
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
  }
  paint();
  say('Press Fire when B is in the open. Then raise the ping and turn lag compensation off.');
  let acc = 0;
  ctx.loop((dt) => {
    if (ctx.reduced) { acc += dt; if (acc < 200) return; dt = acc; acc = 0; }   // reduced motion: step 5×/s
    frame(dt);
  });
});
