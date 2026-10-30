/* ABR player simulation: throughput-based vs buffer-based (BBA-0) rate selection. */
SD.widget('video-streaming', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 420, H = 262;
  const LADDER = [235, 560, 1050, 1750, 3000, 4300, 5800]; // kbps, an illustrative fixed ladder
  const SEG = 4, MAXBUF = 30, RES = 5, CUSH = 15, SPEED = 4, LAT = 0.08; // seconds (simulated)
  const X0 = 44, X1 = 412, CT = 18, CB = 150, NBAR = 32, BW = (X1 - X0) / NBAR, YMAX = 8000;

  let algo = 'tput', bwSet = 5000, playing = false;
  let st;
  function fresh() {
    st = { t: 0, buf: 0, phase: 'startup', dl: null, segs: [], samples: [], rebuf: 0, stallT: 0, dropUntil: -1, switches: 0, prev: LADDER[0] };
  }
  fresh();

  const playBtn = el('button', { class: 'btn primary', text: '▶ Play' });
  const algoBtn = el('button', { class: 'btn', text: 'ABR: throughput' });
  const dropBtn = el('button', { class: 'btn', text: '📉 Network drop' });
  const resetBtn = el('button', { class: 'btn', text: 'Reset' });
  const bwOut = el('b', { text: (bwSet / 1000).toFixed(1) + ' Mbps' });
  const bwIn = el('input', { type: 'range', min: 300, max: 8000, step: 100, value: bwSet, 'aria-label': 'Bandwidth' });
  bwIn.addEventListener('input', () => { bwSet = +bwIn.value; bwOut.textContent = (bwSet / 1000).toFixed(1) + ' Mbps'; });
  root.append(el('div', { class: 'w-controls' }, playBtn, algoBtn, dropBtn, resetBtn, el('label', null, 'Bandwidth ', bwOut, bwIn)));

  const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Segments by bitrate, bandwidth and buffer level', style: 'max-width:560px;margin:0 auto' });
  const gGrid = svg('g'), gBars = svg('g'), gLine = svg('g'), gBuf = svg('g');
  S.append(gGrid, gBars, gLine, gBuf);
  root.append(el('div', { class: 'w-stage' }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); };
  const T = (x, y, text, o) => svg('text', Object.assign({ x, y, text, fill: 'var(--text-3)', style: 'font:500 11.5px var(--mono)' }, o || {}));
  const yOf = (kbps) => CB - (Math.min(kbps, YMAX) / YMAX) * (CB - CT);
  const rungColor = (r) => `color-mix(in srgb, var(--accent) ${25 + 75 * LADDER.indexOf(r) / (LADDER.length - 1)}%, var(--surface))`;

  // static grid: ladder rungs
  LADDER.forEach((r) => {
    gGrid.append(svg('line', { x1: X0, x2: X1, y1: yOf(r), y2: yOf(r), stroke: 'var(--border)', 'stroke-dasharray': '2 4' }));
    if (r >= 1050) gGrid.append(T(X0 - 4, yOf(r) + 3.5, String(r), { 'text-anchor': 'end' }));
  });
  gGrid.append(T(4, CT - 6, 'kbps', { 'text-anchor': 'start' }));
  gGrid.append(svg('line', { x1: X0, x2: X1, y1: CB, y2: CB, stroke: 'var(--text-3)' }));
  gGrid.append(T(X1, CB + 13, 'segments →', { 'text-anchor': 'end' }));

  /* ---------- ABR logic ---------- */
  function harmonic(xs) { return xs.length / xs.reduce((s, x) => s + 1 / x, 0); }
  function pickTput() {
    const last = st.samples.slice(-3);
    const est = last.length ? harmonic(last) : 1000;      // no history yet: assume ~1 Mbps
    const ok = LADDER.filter((r) => r <= 0.8 * est);
    return ok.length ? ok[ok.length - 1] : LADDER[0];
  }
  function pickBBA() {                                      // BBA-0 (Huang et al., SIGCOMM 2014)
    const b = st.buf, rmin = LADDER[0], rmax = LADDER[LADDER.length - 1], prev = st.prev;
    if (b <= RES) return rmin;
    if (b >= RES + CUSH) return rmax;
    const f = rmin + (rmax - rmin) * (b - RES) / CUSH;
    const up = LADDER.find((r) => r > prev) || rmax;
    const down = [...LADDER].reverse().find((r) => r < prev) || rmin;
    if (f >= up) return [...LADDER].reverse().find((r) => r < f) || rmin;
    if (f <= down) return LADDER.find((r) => r > f) || rmax;
    return prev;
  }
  function bandwidth(t) {
    const noise = 1 + 0.18 * Math.sin(t * 0.37) + 0.09 * Math.sin(t * 1.7);
    return Math.max(150, bwSet * noise * (t < st.dropUntil ? 0.2 : 1));
  }
  function startDownload() {
    const r = algo === 'tput' ? pickTput() : pickBBA();
    if (r !== st.prev && st.segs.length) st.switches++;
    st.prev = r;
    st.dl = { r, size: r * SEG, got: 0, t0: st.t };        // size in kbit
  }

  function step(dt) {
    st.t += dt;
    // download
    if (!st.dl && st.buf <= MAXBUF - SEG) startDownload();
    if (st.dl) {
      if (st.t - st.dl.t0 > LAT) st.dl.got += bandwidth(st.t) * dt;
      if (st.dl.got >= st.dl.size) {
        const took = st.t - st.dl.t0;
        st.samples.push(st.dl.size / took);
        st.buf += SEG;
        st.segs.push({ r: st.dl.r, tp: st.dl.size / took, stall: false });
        st.dl = null;
        if (st.phase === 'startup' || st.phase === 'stalled') {
          if (st.phase === 'stalled') say(`Resumed after ${st.stallNow.toFixed(1)} s stall.`);
          st.phase = 'playing';
        }
      }
    }
    // playback
    if (st.phase === 'playing') {
      st.buf -= dt;
      if (st.buf <= 0) {
        st.buf = 0; st.phase = 'stalled'; st.rebuf++; st.stallNow = 0;
        if (st.segs.length) st.segs[st.segs.length - 1].stall = true;
        say(`<b style="color:var(--err)">Rebuffer #${st.rebuf}</b>: buffer empty while fetching ${st.dl ? st.dl.r : '?'} kbps.`);
      }
    } else if (st.phase === 'stalled') { st.stallT += dt; st.stallNow += dt; }
  }

  function draw() {
    gBars.innerHTML = ''; gLine.innerHTML = ''; gBuf.innerHTML = '';
    const shown = st.segs.slice(-NBAR);
    const pts = [];
    shown.forEach((s, i) => {
      const x = X0 + i * BW;
      gBars.append(svg('rect', { x: x + 1, y: yOf(s.r), width: BW - 2, height: CB - yOf(s.r), rx: 2, fill: rungColor(s.r) }));
      if (s.stall) gBars.append(svg('rect', { x: x + 1, y: CB + 3, width: BW - 2, height: 5, fill: 'var(--err)' }));
      pts.push((x + BW / 2).toFixed(1) + ',' + yOf(s.tp).toFixed(1));
    });
    if (pts.length > 1) gLine.append(svg('polyline', { points: pts.join(' '), fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2 }));
    gLine.append(T(X1, CT - 6, '— measured throughput', { 'text-anchor': 'end', fill: 'var(--warn)' }));
    // buffer bar
    const by = 186, bx = X0, bw = X1 - X0;
    const fx = (s) => bx + bw * Math.min(s, MAXBUF) / MAXBUF;
    gBuf.append(T(4, by + 12, 'buffer', { 'text-anchor': 'start' }));
    gBuf.append(svg('rect', { x: bx, y: by, width: bw, height: 16, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
    const col = st.buf < RES ? 'var(--err)' : st.buf < RES + CUSH ? 'var(--warn)' : 'var(--ok)';
    gBuf.append(svg('rect', { x: bx, y: by, width: Math.max(0, fx(st.buf) - bx), height: 16, rx: 8, fill: col }));
    if (algo === 'bba') [RES, RES + CUSH].forEach((m, i) => {
      gBuf.append(svg('line', { x1: fx(m), x2: fx(m), y1: by - 4, y2: by + 20, stroke: 'var(--text-2)', 'stroke-dasharray': '3 2' }));
      gBuf.append(T(fx(m), by - 7, i ? 'cushion end' : 'reservoir', { 'text-anchor': 'middle' }));
    });
    gBuf.append(T(X1, by + 32, `${st.buf.toFixed(1)} s / ${MAXBUF} s`, { 'text-anchor': 'end', fill: 'var(--text-2)' }));
    const label = st.phase === 'stalled' ? '⏸ REBUFFERING' : st.phase === 'startup' ? (playing ? '… starting' : 'press Play') : '▶ playing';
    gBuf.append(T(4, H - 14, label, { 'text-anchor': 'start', fill: st.phase === 'stalled' ? 'var(--err)' : 'var(--text)', style: 'font:700 12.5px var(--sans)' }));
    gBuf.append(T(X1, H - 14, `next: ${st.dl ? st.dl.r : st.prev} kbps · net ≈ ${(bandwidth(st.t) / 1000).toFixed(1)} Mbps`, { 'text-anchor': 'end', fill: 'var(--text-2)', style: 'font:600 11px var(--mono)' }));
    const avg = st.segs.length ? Math.round(st.segs.reduce((a, s) => a + s.r, 0) / st.segs.length) : 0;
    stats.innerHTML = '';
    [['ABR', algo === 'tput' ? 'throughput' : 'BBA-0'], ['avg bitrate', avg + ' kbps'], ['rebuffers', st.rebuf], ['stalled', st.stallT.toFixed(1) + ' s'], ['switches', st.switches]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  ctx.loop((dt) => {
    if (!playing) return;
    let sim = Math.min(dt, 100) / 1000 * SPEED;
    while (sim > 0) { const d = Math.min(sim, 0.05); step(d); sim -= d; }
    draw();
  });

  playBtn.addEventListener('click', () => {
    playing = !playing; playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
    if (playing && ctx.reduced) { for (let i = 0; i < 1200; i++) step(0.05); playing = false; playBtn.textContent = '▶ Play 60 s more'; say('Reduced motion: simulated 60 s at once.'); }
    draw();
  });
  algoBtn.addEventListener('click', () => {
    algo = algo === 'tput' ? 'bba' : 'tput';
    algoBtn.textContent = 'ABR: ' + (algo === 'tput' ? 'throughput' : 'buffer-based');
    say(algo === 'tput' ? 'Throughput rule: highest rung ≤ 80% of the harmonic mean of the last 3 downloads.' : 'BBA-0: lowest rung below the reservoir, highest above the cushion, linear map in between, with hysteresis.');
    draw();
  });
  dropBtn.addEventListener('click', () => { st.dropUntil = st.t + 16; say('📉 Bandwidth falls to 20% for 16 s (tunnel, congested Wi-Fi).'); });
  resetBtn.addEventListener('click', () => { fresh(); log.innerHTML = ''; draw(); say('Reset. Try the same drop with each ABR algorithm.'); });

  draw();
  say('Each 4 s segment is fetched at the rung the ABR picks. Simulated time runs at 4×.');
});
