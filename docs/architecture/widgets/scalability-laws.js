/* Amdahl vs Gustafson vs USL speed-up curves, the M/M/1 (Kingman-scaled) latency knee,
   and a Monte Carlo fan-out simulation with and without hedged requests. */
SD.widget('scalability-laws', function (root, ctx) {
  const { el, svg } = ctx;
  const st = { p: 95, a: 3, b: 5, rho: 70, k: 1, M: 100, hedge: true };
  const NMAX = 64, YMAX = 64;
  const amdahl = (n) => { const s = 1 - st.p / 100; return 1 / (s + (1 - s) / n); };
  const gust = (n) => { const s = 1 - st.p / 100; return n - s * (n - 1); };
  const usl = (n) => { const a = st.a / 100, b = st.b / 10000; return n / (1 + a * (n - 1) + b * n * (n - 1)); };

  // ---------- fan-out Monte Carlo ----------
  function leaf() {                                       // 99%: ~10 ms; 1%: a 200-1000 ms hiccup
    return Math.random() < 0.01 ? 200 + Math.random() * 800 : 4 + -Math.log(1 - Math.random()) * 6;
  }
  function quant(a, q) { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }
  function simulate() {
    const probe = []; for (let i = 0; i < 20000; i++) probe.push(leaf());
    const d = quant(probe, 0.95);                         // hedge delay = leaf p95
    const R = 2000, plain = [], hedged = []; let extra = 0;
    for (let r = 0; r < R; r++) {
      let m1 = 0, m2 = 0;
      for (let i = 0; i < st.M; i++) {
        const l = leaf(); m1 = Math.max(m1, l);
        let h = l; if (l > d) { extra++; h = Math.min(l, d + leaf()); }
        m2 = Math.max(m2, h);
      }
      plain.push(m1); hedged.push(m2);
    }
    return { d, extra: extra / (R * st.M), plain, hedged };
  }

  function build(narrow) {
    root.innerHTML = '';
    const F = narrow ? 14 : 13, W = narrow ? 360 : 520;
    const txt = (x, y, s, o) => svg('text', Object.assign({ x, y, fill: (o && o.c) || 'var(--text-2)', style: `font:600 ${(o && o.f) || F}px var(--sans)`, text: s }, o && o.a ? { 'text-anchor': o.a } : {}));
    const slider = (label, key, min, max, step, show) => {
      const out = el('b', { text: show(st[key]) });
      const inp = el('input', { type: 'range', min, max, step, value: st[key], 'aria-label': label });
      inp.addEventListener('input', () => { st[key] = +inp.value; out.textContent = show(st[key]); draw(); });
      return el('label', null, label + ' ', out, ' ', inp);
    };
    const note = (h) => el('p', { class: 'muted', style: { margin: '6px 0 10px', fontSize: '13px' }, html: h });

    // ===== 1. speed-up curves =====
    root.append(el('div', { class: 'w-controls' },
      slider('Parallel p', 'p', 50, 100, 0.5, (v) => v + '%'),
      slider('α', 'a', 0, 20, 0.5, (v) => v + '%'),
      slider('β', 'b', 0, 50, 0.5, (v) => (v / 10000).toFixed(5).replace(/0+$/, '').replace(/\.$/, ''))));
    const H1 = narrow ? 250 : 240, L = narrow ? 44 : 46, T = 14, PW = W - L - 14, PH = H1 - T - 42;
    const S1 = svg('svg', { viewBox: `0 0 ${W} ${H1}`, role: 'img', 'aria-label': 'Speed-up versus number of nodes' });
    const X = (n) => L + PW * (n - 1) / (NMAX - 1), Y = (v) => T + PH * (1 - Math.min(v, YMAX) / YMAX);
    [0, 16, 32, 48, 64].forEach((v) => { S1.append(svg('line', { x1: L, x2: L + PW, y1: Y(v), y2: Y(v), stroke: 'var(--border)', 'stroke-dasharray': v ? '3 4' : '' }), txt(L - 6, Y(v) + 5, String(v), { a: 'end' })); });
    [1, 16, 32, 48, 64].forEach((n) => S1.append(txt(X(n), T + PH + 20, String(n), { a: 'middle' })));
    S1.append(txt(L + PW / 2, H1 - 4, 'nodes N', { a: 'middle' }));
    S1.append(svg('line', { x1: X(1), y1: Y(1), x2: X(64), y2: Y(64), stroke: 'var(--text-3)', 'stroke-dasharray': '2 5' }));
    const mk = (c, w) => { const p = svg('path', { fill: 'none', stroke: c, 'stroke-width': w }); S1.append(p); return p; };
    const pG = mk('var(--ok)', 2.5), pA = mk('var(--warn)', 2.5), pU = mk('var(--accent)', 3);
    const dot = svg('circle', { r: 5, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 }); S1.append(dot);
    const lA = txt(0, 0, 'Amdahl', { c: 'var(--warn)', a: 'end' }), lU = txt(0, 0, 'USL', { c: 'var(--accent)', a: 'end' }), lG = txt(0, 0, 'Gustafson', { c: 'var(--ok)', a: 'start' });
    S1.append(lA, lU, lG);
    root.append(el('div', { class: 'w-stage' }, S1));
    const stats1 = el('div', { class: 'w-stats' }); root.append(stats1);

    // ===== 2. queueing knee =====
    root.append(el('div', { class: 'w-controls', style: { marginTop: '14px' } },
      slider('Utilisation ρ', 'rho', 10, 98, 1, (v) => v + '%'),
      slider('Variability (c²ₐ+c²ₛ)/2', 'k', 0.5, 3, 0.5, (v) => v + (v === 1 ? ' (M/M/1)' : ''))));
    const H2 = narrow ? 230 : 220, P2H = H2 - T - 42, YM2 = 20;
    const S2 = svg('svg', { viewBox: `0 0 ${W} ${H2}`, role: 'img', 'aria-label': 'Response time versus utilisation' });
    const X2 = (r) => L + PW * r, Y2 = (v) => T + P2H * (1 - Math.min(v, YM2) / YM2);
    [0, 5, 10, 15, 20].forEach((v) => S2.append(svg('line', { x1: L, x2: L + PW, y1: Y2(v), y2: Y2(v), stroke: 'var(--border)', 'stroke-dasharray': v ? '3 4' : '' }), txt(L - 6, Y2(v) + 5, v + '×', { a: 'end' })));
    (narrow ? [0, 0.5, 0.7, 1] : [0, 0.5, 0.7, 0.9, 1]).forEach((r) => S2.append(txt(X2(r), T + P2H + 20, Math.round(r * 100) + '%', { a: r === 1 ? 'end' : r === 0 ? 'start' : 'middle' })));
    S2.append(svg('rect', { x: X2(0.7), y: T, width: X2(1) - X2(0.7), height: P2H, fill: 'color-mix(in srgb, var(--err) 9%, transparent)' }));
    S2.append(txt(X2(0.72), T + 16, 'knee', { c: 'var(--err)' }));
    S2.append(txt(L + PW / 2, H2 - 4, 'utilisation ρ  →  response time ÷ service time', { a: 'middle', f: narrow ? 13 : F }));
    const qBase = svg('path', { fill: 'none', stroke: 'var(--text-3)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' });
    const qCur = svg('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3 });
    const qDot = svg('circle', { r: 6, fill: 'var(--warn)', stroke: 'var(--surface)', 'stroke-width': 2 });
    S2.append(qBase, qCur, qDot);
    root.append(el('div', { class: 'w-stage' }, S2));
    root.append(note('Dashed: M/M/1, R = S/(1−ρ). Solid: Kingman-style, R ≈ S·(1 + v·ρ/(1−ρ)) with variability v. Bursty traffic (v &gt; 1) reaches the same latency at lower utilisation.'));
    const stats2 = el('div', { class: 'w-stats' }); root.append(stats2);

    // ===== 3. fan-out =====
    const runBtn = el('button', { class: 'btn primary', text: '▶ Simulate 2,000 requests' });
    const hBtn = el('button', { class: 'btn', text: 'Hedging: on' });
    hBtn.addEventListener('click', () => { st.hedge = !st.hedge; hBtn.textContent = 'Hedging: ' + (st.hedge ? 'on' : 'off'); fan(); });
    runBtn.addEventListener('click', fan);
    const mOut = el('b', { text: st.M });
    const mIn = el('input', { type: 'range', min: 1, max: 200, step: 1, value: st.M, 'aria-label': 'Fan-out width' });
    mIn.addEventListener('input', () => { st.M = +mIn.value; mOut.textContent = st.M; });
    mIn.addEventListener('change', fan);
    root.append(el('div', { class: 'w-controls', style: { marginTop: '14px' } }, runBtn, hBtn, el('label', null, 'Fan-out M ', mOut, ' ', mIn)));
    const rows = ['p50 plain', 'p99 plain', 'p50 hedged', 'p99 hedged'];
    const LB = narrow ? 104 : 110, BW = W - LB - 70, RH = 34, H3 = rows.length * RH + 12;
    const S3 = svg('svg', { viewBox: `0 0 ${W} ${H3}`, role: 'img', 'aria-label': 'Fan-out latency percentiles' });
    const bars = rows.map((r, i) => {
      const y = 6 + i * RH;
      S3.append(txt(LB - 8, y + 19, r, { a: 'end' }));
      const b = svg('rect', { x: LB, y: y + 4, width: 0, height: 22, rx: 4, fill: i % 2 ? 'var(--err)' : 'var(--accent)', opacity: i < 2 ? 0.85 : 0.6 });
      const v = txt(LB + 6, y + 20, '', {});
      S3.append(b, v); return { b, v };
    });
    root.append(el('div', { class: 'w-stage' }, S3));
    const stats3 = el('div', { class: 'w-stats' }); root.append(stats3);
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' }); root.append(log);

    const setStats = (box, o) => { box.innerHTML = ''; Object.entries(o).forEach(([k, v]) => box.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); };
    const line = (f, x0, x1, X, Y, steps) => { let d = ''; for (let i = 0; i <= steps; i++) { const x = x0 + (x1 - x0) * i / steps; d += (i ? 'L' : 'M') + X(x).toFixed(1) + ',' + Y(f(x)).toFixed(1); } return d; };

    function draw() {
      pA.setAttribute('d', line(amdahl, 1, NMAX, X, Y, 80));
      pG.setAttribute('d', line(gust, 1, NMAX, X, Y, 20));
      pU.setAttribute('d', line(usl, 1, NMAX, X, Y, 120));
      const a = st.a / 100, b = st.b / 10000, nStar = b > 0 ? Math.sqrt((1 - a) / b) : Infinity;
      const nd = Math.min(NMAX, nStar); dot.setAttribute('cx', X(nd)); dot.setAttribute('cy', Y(usl(nd)));
      const place = (t, n, v, dy) => { t.setAttribute('x', X(n)); t.setAttribute('y', Math.max(T + 12, Math.min(T + PH - 4, Y(v) + dy))); };
      place(lA, NMAX, amdahl(NMAX), -8); place(lU, NMAX, usl(NMAX), usl(NMAX) > amdahl(NMAX) - 4 && usl(NMAX) <= amdahl(NMAX) ? 18 : (usl(NMAX) < amdahl(NMAX) ? 18 : -8));
      lG.setAttribute('x', X(narrow ? 6 : 8)); lG.setAttribute('y', Math.max(T + 12, Y(gust(narrow ? 6 : 8)) - 30));
      const s = 1 - st.p / 100;
      setStats(stats1, {
        'Amdahl @64': amdahl(64).toFixed(1) + '× (cap ' + (s > 0 ? (1 / s).toFixed(0) + '×' : '∞') + ')',
        'Gustafson @64': gust(64).toFixed(1) + '×',
        'USL @64': usl(64).toFixed(1) + '×',
        'USL peak N*': isFinite(nStar) ? Math.round(nStar) + ' → ' + usl(nStar).toFixed(1) + '×' : 'none (β = 0)'
      });
      const r = st.rho / 100, k = st.k;
      qBase.setAttribute('d', line((x) => 1 / (1 - x), 0, 0.985, X2, Y2, 120));
      qCur.setAttribute('d', line((x) => 1 + k * x / (1 - x), 0, 0.985, X2, Y2, 120));
      const R = 1 + k * r / (1 - r);
      qDot.setAttribute('cx', X2(r)); qDot.setAttribute('cy', Y2(R));
      const r2 = Math.min(0.99, r * 1.1), R2 = 1 + k * r2 / (1 - r2);
      setStats(stats2, {
        'response time': R.toFixed(1) + '× S',
        'waiting': (k * r / (1 - r)).toFixed(1) + '× S',
        '+10% traffic': '→ ' + R2.toFixed(1) + '× S (' + (R2 / R >= 1.995 ? '≥ 2×' : '+' + Math.round((R2 / R - 1) * 100) + '%') + ')',
        "Little: L per node": (r * k * r / (1 - r) + r).toFixed(1)
      });
    }

    function fan() {
      const res = simulate();
      const v = [quant(res.plain, 0.5), quant(res.plain, 0.99), quant(res.hedged, 0.5), quant(res.hedged, 0.99)];
      const show = st.hedge ? v : [v[0], v[1], NaN, NaN];
      const mx = Math.max(...show.filter((x) => !isNaN(x)), 50);
      bars.forEach((o, i) => {
        const val = show[i], w = isNaN(val) ? 0 : BW * val / mx;
        o.b.setAttribute('width', Math.max(0, w)); o.v.setAttribute('x', LB + w + 6);
        o.v.textContent = isNaN(val) ? 'off' : Math.round(val) + ' ms';
      });
      const slowFrac = res.plain.filter((x) => x > 100).length / res.plain.length;
      setStats(stats3, {
        'slow (> 100 ms), plain': Math.round(slowFrac * 100) + '%',
        'formula 1 − 0.99^M': Math.round((1 - Math.pow(0.99, st.M)) * 100) + '%',
        'hedge delay (leaf p95)': res.d.toFixed(0) + ' ms',
        'extra requests': st.hedge ? (res.extra * 100).toFixed(1) + '%' : '0%'
      });
      log.prepend(el('div', { html: `M = <b>${st.M}</b>: plain p99 <b>${Math.round(v[1])} ms</b>` + (st.hedge ? `, hedged p99 <b>${Math.round(v[3])} ms</b> for ${(res.extra * 100).toFixed(1)}% extra leaf calls.` : '. Turn hedging on to compare.') }));
      while (log.children.length > 12) log.lastChild.remove();
    }
    draw(); fan();
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
