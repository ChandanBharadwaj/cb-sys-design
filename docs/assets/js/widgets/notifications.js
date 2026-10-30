/* Priority lanes + token-bucket provider + full-jitter retries, simulated in real time. */
SD.widget('notifications', function (root, ctx) {
  const { el, svg } = ctx;
  const RATE = 40, BURST = 40, WORKER = 60, SLOTS = 28, SW = 9;
  let promoRate = 20, lanes = true, limiter = true;
  let now = 0, tokens = BURST, otpAcc = 0, promoAcc = 0, workAcc = 0;
  let txn = [], promo = [], retry = [], lat = [], hist = [], c429 = 0, sentWin = 0, sentRate = 0, rejected = 0, secT = 0;

  // controls
  const pOut = el('b', { text: promoRate + '/s' });
  const pIn = el('input', { type: 'range', min: 0, max: 100, value: promoRate, 'aria-label': 'Promo rate' });
  pIn.addEventListener('input', () => { promoRate = +pIn.value; pOut.textContent = promoRate + '/s'; });
  const laneBtn = el('button', { class: 'btn', text: '' });
  const limBtn = el('button', { class: 'btn', text: '' });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  function labels() {
    laneBtn.textContent = lanes ? '⇶ Priority lanes: on' : '⇶ Priority lanes: off (FIFO)';
    limBtn.textContent = limiter ? '⏱ Client limiter: on' : '⏱ Client limiter: off';
  }
  laneBtn.addEventListener('click', () => {
    lanes = !lanes; labels();
    if (lanes) { txn = promo.filter((m) => m.otp); promo = promo.filter((m) => !m.otp); }
    else { promo = txn.concat(promo).sort((a, b) => a.t0 - b.t0); txn = []; }
    say(lanes ? 'Lanes on: OTPs get their own queue and are served first.' : 'Shared FIFO: OTPs now wait behind every queued promo.');
  });
  limBtn.addEventListener('click', () => { limiter = !limiter; labels(); say(limiter ? 'Limiter on: workers only send when the bucket has a token. No 429s.' : 'Limiter off: workers send at 60/s into a 40/s provider. Expect 429s and retries.'); });
  resetBtn.addEventListener('click', () => { txn = []; promo = []; retry = []; lat = []; hist = []; c429 = 0; rejected = 0; tokens = BURST; say('Reset.'); });
  labels();
  root.append(el('div', { class: 'w-controls' }, laneBtn, limBtn, resetBtn, el('label', null, 'Promo rate ', pOut, ' ', pIn)));

  // drawing
  const W = 500, H = 262;
  const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Queue lanes and provider token bucket' });
  const T = (x, y, t, st, fill) => { const n = svg('text', { x, y, style: st || 'font:600 11px var(--mono)', fill: fill || 'var(--text-2)', text: t }); S.append(n); return n; };
  const laneY = [38, 88, 138];
  const laneName = [T(8, laneY[0] + 15, 'TXN'), T(8, laneY[1] + 15, 'PROMO'), T(8, laneY[2] + 15, 'RETRY')];
  const laneCnt = laneY.map((y) => T(62, y - 5, '', 'font:500 10px var(--mono)', 'var(--text-3)'));
  const rects = laneY.map((y) => {
    S.append(svg('rect', { x: 60, y, width: SLOTS * SW + 6, height: 22, rx: 5, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
    return Array.from({ length: SLOTS }, (_, i) => { const r = svg('rect', { x: 63 + (SLOTS - 1 - i) * SW, y: y + 4, width: SW - 2, height: 14, rx: 2 }); S.append(r); return r; });
  });
  // arrows into the provider
  laneY.slice(0, 2).forEach((y) => S.append(svg('line', { x1: 324, y1: y + 11, x2: 380, y2: 100, stroke: 'var(--border)', 'stroke-width': 1.5 })));
  // provider token bucket
  S.append(svg('rect', { x: 384, y: 30, width: 100, height: 140, rx: 10, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
  T(394, 48, 'PROVIDER', 'font:700 11px var(--mono)', 'var(--text)');
  T(394, 62, RATE + '/s limit', 'font:500 10px var(--mono)', 'var(--text-3)');
  S.append(svg('rect', { x: 420, y: 72, width: 28, height: 90, rx: 4, fill: 'var(--surface)', stroke: 'var(--border)' }));
  const fill = svg('rect', { x: 422, y: 74, width: 24, height: 86, rx: 3, fill: 'var(--ok)' });
  S.append(fill);
  const tokTxt = T(452, 120, '', 'font:600 10px var(--mono)', 'var(--text-2)');
  const flash = T(392, 160, '', 'font:700 11px var(--mono)', 'var(--err)');
  // sparkline of OTP latency
  T(8, 192, 'OTP p95 latency, last 60 s', 'font:600 10px var(--mono)', 'var(--text-3)');
  S.append(svg('rect', { x: 8, y: 198, width: 484, height: 58, rx: 6, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
  const spark = svg('polyline', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, points: '' });
  const maxTxt = T(486, 210, '', 'font:500 10px var(--mono);text-anchor:end', 'var(--text-3)');
  S.append(spark);
  root.append(el('div', { class: 'w-stage' }, S));
  const st = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(st, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }

  // simulation
  const pick = () => (lanes ? (txn.length ? txn : promo) : promo);
  function step(dt) {
    now += dt;
    tokens = Math.min(BURST, tokens + RATE * dt);
    if (Math.random() < dt * 1.0) (lanes ? txn : promo).push({ otp: true, t0: now, n: 0 });
    promoAcc += promoRate * dt;
    while (promoAcc >= 1) { promoAcc--; if (promo.length < 20000) promo.push({ otp: false, t0: now, n: 0 }); else rejected++; }
    for (let i = retry.length - 1; i >= 0; i--) if (retry[i].due <= now) { const m = retry[i].m; retry.splice(i, 1); (lanes && m.otp ? txn : promo).unshift(m); }
    workAcc = Math.min(workAcc + WORKER * dt, 3);
    while (workAcc >= 1) {
      const q = pick();
      if (!q.length) { workAcc = 0; break; }
      if (limiter && tokens < 1) break;              // wait for a token: no 429
      const m = q.shift(); workAcc--;
      if (tokens >= 1) {
        tokens--; sentWin++;
        if (m.otp) { lat.push(now - m.t0); if (lat.length > 30) lat.shift(); }
      } else {                                       // provider says 429
        c429++; m.n++;
        const delay = Math.random() * Math.min(8, 0.25 * Math.pow(2, m.n)); // full jitter
        retry.push({ m, due: now + delay });
        flash.textContent = '429!';
      }
    }
    secT += dt;
    if (secT >= 1) {
      secT -= 1; sentRate = sentWin; sentWin = 0;
      hist.push(p95()); if (hist.length > 60) hist.shift();
      flash.textContent = '';
    }
  }
  function p95() { if (!lat.length) return 0; const s = lat.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; }
  function p50() { if (!lat.length) return 0; const s = lat.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
  function drawLane(i, q, otpCol) {
    laneCnt[i].textContent = q.length ? q.length + ' queued' : 'empty';
    rects[i].forEach((r, k) => {
      const m = q[k];
      r.style.display = m ? '' : 'none';
      if (m) r.setAttribute('fill', m.otp ? otpCol : 'var(--text-3)');
    });
  }
  function draw() {
    laneName[0].textContent = lanes ? 'TXN' : 'FIFO';
    laneName[1].style.opacity = lanes ? 1 : 0.35;
    drawLane(0, lanes ? txn : promo, 'var(--accent)');
    drawLane(1, lanes ? promo : [], 'var(--accent)');
    drawLane(2, retry.map((r) => r.m), 'var(--warn)');
    const h = 86 * (tokens / BURST);
    fill.setAttribute('y', 74 + 86 - h); fill.setAttribute('height', Math.max(0, h));
    fill.setAttribute('fill', tokens < 1 ? 'var(--err)' : tokens < 10 ? 'var(--warn)' : 'var(--ok)');
    tokTxt.textContent = Math.floor(tokens) + ' tok';
    const mx = Math.max(3, ...hist);
    spark.setAttribute('points', hist.map((v, i) => `${(12 + i * (476 / 59)).toFixed(1)},${(252 - (v / mx) * 46).toFixed(1)}`).join(' '));
    maxTxt.textContent = 'max ' + mx.toFixed(1) + ' s';
    const p = p95();
    st.innerHTML = '';
    const o = { 'OTP p50': p50().toFixed(2) + ' s', 'OTP p95': p.toFixed(2) + ' s', 'promo backlog': (lanes ? promo.length : promo.filter((m) => !m.otp).length), 'sent/s': sentRate, '429s': c429, 'retry pending': retry.length };
    Object.entries(o).forEach(([k, v]) => st.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  let drawT = 0;
  ctx.loop((dt) => {
    let left = Math.min(dt, 250) / 1000;
    while (left > 0) { const d = Math.min(0.02, left); step(d); left -= d; }
    drawT += dt;
    if (drawT > (ctx.reduced ? 500 : 100)) { drawT = 0; draw(); }
  });
  draw();
  say('Promos above ~39/s outrun the provider. Watch OTP p95 with lanes on, then switch to FIFO.');
});
