/* A month of traffic in 5-minute buckets. Error ratios over 5m/30m/1h/6h/3d come from prefix sums;
   burn rate = ratio ÷ (1 − SLO); page/ticket use the SRE Workbook multi-window, multi-burn-rate rule. */
SD.widget('slo-error-budgets', function (root, ctx) {
  const { el, svg } = ctx;
  const DAYS = 30, BPD = 288, N = DAYS * BPD;               // 5-minute buckets
  const W5 = 1, W30 = 6, W1H = 12, W6H = 72, W3D = 864;      // window sizes in buckets
  const TIERS = [                                            // long, short, burn threshold, severity
    { L: W1H, S: W5, thr: 14.4, sev: 'page', name: '1 h & 5 m ≥ 14.4×' },
    { L: W6H, S: W30, thr: 6, sev: 'page', name: '6 h & 30 m ≥ 6×' },
    { L: W3D, S: W6H, thr: 1, sev: 'ticket', name: '3 d & 6 h ≥ 1×' }
  ];
  const KINDS = {
    spike: { rate: 0.20, dur: 9, txt: '⚡ Spike: 20% errors for 45 min' },
    medium: { rate: 0.008, dur: 96, txt: '🔥 Medium burn: 0.8% errors for 8 h' },
    slow: { rate: 0.003, dur: 432, txt: '🐢 Slow leak: 0.3% errors for 36 h' }
  };

  // deterministic traffic + background noise
  let seed = 7;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const traffic = new Float64Array(N), base = new Float64Array(N);
  for (let b = 0; b < N; b++) {
    const h = (b % BPD) / 12;
    traffic[b] = 1000 * (1 + 0.55 * Math.sin((h - 9) / 24 * 2 * Math.PI)) * (0.9 + 0.2 * rnd());
    base[b] = 0.0001 + 0.00012 * rnd();
  }
  for (let i = 0; i < 6; i++) { const s = Math.floor(rnd() * (N - 3)); base[s] = base[s + 1] = 0.015; } // short blips: should NOT page
  const TOTAL = traffic.reduce((a, x) => a + x, 0);

  let slo = 0.999, cur = 0, acc = 0, playing = !ctx.reduced, incidents = [];
  const Pt = new Float64Array(N + 1), Pb = new Float64Array(N + 1);
  const burn1h = new Float64Array(N), remain = new Float64Array(N), page = new Uint8Array(N), ticket = new Uint8Array(N);
  let ev = null;

  function demo() {
    incidents = [{ start: 4 * BPD + 120, end: 4 * BPD + 120 + 9, rate: 0.2 }, { start: 15 * BPD + 100, end: 15 * BPD + 100 + 432, rate: 0.003 }];
  }
  demo();
  function errRate(b) { let r = base[b]; incidents.forEach((x) => { if (b >= x.start && b < x.end) r += x.rate; }); return Math.min(1, r); }
  const ratio = (b, w) => { const a = Math.max(0, b + 1 - w); const t = Pt[b + 1] - Pt[a]; return t > 0 ? (Pb[b + 1] - Pb[a]) / t : 0; };
  const when = (b) => { const d = Math.floor(b / BPD), m = (b % BPD) * 5; return 'Day ' + (d + 1) + ' ' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const pct = (x) => (x * 100).toFixed(x < 0.01 && x > -0.01 ? 2 : 1) + '%';
  const bx = (x) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + '×';

  function step(b, quiet) {                       // compute bucket b (all earlier buckets are known)
    Pt[b + 1] = Pt[b] + traffic[b];
    Pb[b + 1] = Pb[b] + traffic[b] * errRate(b);
    const e = 1 - slo;
    burn1h[b] = ratio(b, W1H) / e;
    remain[b] = 1 - Pb[b + 1] / (e * TOTAL);
    let p = null, t = false;
    TIERS.forEach((T) => {
      const bl = ratio(b, T.L) / e, bs = ratio(b, T.S) / e;
      if (bl >= T.thr && bs >= T.thr) { if (T.sev === 'page') { if (!p) p = { T, bl, bs }; } else t = { T, bl, bs }; }
    });
    page[b] = p ? 1 : 0; ticket[b] = t ? 1 : 0;
    const prevP = b ? page[b - 1] : 0, prevT = b ? ticket[b - 1] : 0;
    if (p && !prevP) { ev.page = b; say(`<b>${when(b)}</b> 🔴 <b>PAGE</b> (${p.T.name}): long ${bx(p.bl)}, short ${bx(p.bs)}. Budget left ${pct(remain[b])}.`, quiet); }
    if (!p && prevP) say(`<b>${when(b)}</b> ✅ Page resolved after ${dur(b - ev.page)} (the short window cleared).`, quiet);
    if (t && !prevT) { ev.ticket = b; say(`<b>${when(b)}</b> 🟡 <b>TICKET</b> (${t.T.name}): 3 d burn ${bx(t.bl)}. Budget left ${pct(remain[b])}.`, quiet); }
    if (!t && prevT) say(`<b>${when(b)}</b> Ticket condition cleared after ${dur(b - ev.ticket)}.`, quiet);
    if (remain[b] <= 0 && (b === 0 || remain[b - 1] > 0)) say(`<b>${when(b)}</b> ⛔ <b>Budget exhausted.</b> The error budget policy now applies: freeze feature releases.`, quiet);
  }
  const dur = (n) => n * 5 < 120 ? n * 5 + ' min' : (n * 5 / 60).toFixed(1) + ' h';
  function recompute() { ev = {}; log.innerHTML = ''; for (let b = 0; b < cur; b++) step(b, false); paint(); }

  // ---------- controls ----------
  const playBtn = el('button', { class: 'btn primary', text: '' });
  const setPlay = () => { playBtn.textContent = ctx.reduced ? '▶ Next day' : playing ? '❚❚ Pause' : (cur >= N ? '↻ Replay' : '▶ Play'); };
  playBtn.addEventListener('click', () => {
    if (cur >= N) { cur = 0; acc = 0; recompute(); }
    if (ctx.reduced) { advance(BPD); } else playing = !playing;
    setPlay();
  });
  const inject = (k) => {
    if (cur >= N) return;
    const K = KINDS[k];
    incidents.push({ start: cur, end: Math.min(N, cur + K.dur), rate: K.rate });
    say(`<b>${when(cur)}</b> ${K.txt} (burn ${bx(K.rate / (1 - slo))} at ${(slo * 100).toFixed(2).replace(/0$/, '')}%).`);
  };
  const btns = Object.keys(KINDS).map((k) => { const b = el('button', { class: 'btn', text: KINDS[k].txt.split(':')[0] }); b.addEventListener('click', () => inject(k)); return b; });
  const sel = el('select', { 'aria-label': 'SLO target' });
  [['0.995', '99.5%'], ['0.999', '99.9%'], ['0.9995', '99.95%'], ['0.9999', '99.99%']].forEach(([v, l]) => { const o = el('option', { value: v, text: 'SLO ' + l }); if (+v === slo) o.selected = true; sel.append(o); });
  sel.addEventListener('change', () => { slo = +sel.value; recompute(); });
  const resetBtn = el('button', { class: 'btn', text: '↺ Clean month' });
  resetBtn.addEventListener('click', () => { incidents = []; cur = 0; acc = 0; playing = !ctx.reduced; recompute(); say('Clean month: only background noise. Inject incidents while it plays.'); setPlay(); });
  root.append(el('div', { class: 'w-controls' }, playBtn, ...btns, sel, resetBtn));

  const stage = el('div', { class: 'w-stage' });
  root.append(stage);
  stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Lines: <b style="color:var(--err)">page 14.4×</b> and <b style="color:var(--warn)">6×</b> (6 h tier) · <b style="color:var(--text-3)">ticket 1×</b> (3 d tier). Each alert also needs its short window above the same line. Short blips (1.5% for 10 min) cross 14.4× on the 5 m window but not on 1 h, so they never page.' }));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function say(t, quiet) { if (quiet) return; log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); }

  // ---------- chart ----------
  let G = null;
  function build(narrow) {
    stage.querySelector('svg') && stage.querySelector('svg').remove();
    const W = narrow ? 360 : 720, L = narrow ? 60 : 70, R = 10, F = narrow ? 14 : 13, FS = narrow ? 13 : 12.5;
    const PW = W - L - R;
    const A = { t: 28, h: narrow ? 120 : 110 }, B = { t: A.t + (narrow ? 120 : 110) + 38 }; B.h = A.h;
    const S1 = B.t + B.h + 16, S2 = S1 + 26, H = S2 + 46;
    const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Error budget and burn rate over 30 days' });
    stage.prepend(S_);
    const X = (b) => L + PW * b / N;
    const YA = (r) => A.t + A.h * (1 - (Math.max(-0.5, Math.min(1, r)) + 0.5) / 1.5);
    const LMIN = -1, LMAX = Math.log10(300);
    const YB = (v) => B.t + B.h * (1 - (Math.log10(Math.max(0.1, Math.min(300, v))) - LMIN) / (LMAX - LMIN));
    const txt = (x, y, t, o) => svg('text', Object.assign({ x, y, fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: t }, o || {}));
    const line = (x1, y1, x2, y2, st, dash) => svg('line', { x1, y1, x2, y2, stroke: st, 'stroke-width': 1.2, 'stroke-dasharray': dash || '' });
    // panel A
    S_.append(txt(4, 18, 'Error budget left', { fill: 'var(--text)', style: `font:700 ${F}px var(--sans)` }));
    S_.append(svg('rect', { x: L, y: A.t, width: PW, height: A.h, fill: 'var(--surface-2)', rx: 4 }));
    [[1, '100%'], [0.5, '50%'], [0, '0%']].forEach(([r, l]) => { S_.append(line(L, YA(r), L + PW, YA(r), 'var(--border)', r === 0 ? '' : '3 4'), txt(L - 6, YA(r) + FS * 0.35, l, { 'text-anchor': 'end' })); });
    const areaA = svg('path', { fill: 'color-mix(in srgb, var(--accent) 18%, transparent)' });
    const pathA = svg('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.2 });
    S_.append(areaA, pathA);
    // panel B
    S_.append(txt(4, B.t - 10, 'Burn rate, 1 h window (log)', { fill: 'var(--text)', style: `font:700 ${F}px var(--sans)` }));
    S_.append(svg('rect', { x: L, y: B.t, width: PW, height: B.h, fill: 'var(--surface-2)', rx: 4 }));
    [[0.1, '0.1×'], [10, '10×'], [100, '100×']].forEach(([v, l]) => S_.append(txt(L - 6, YB(v) + FS * 0.35, l, { 'text-anchor': 'end' })));
    [[14.4, 'var(--err)', 'page 14.4×', -5, 4], [6, 'var(--warn)', 'page 6×', FS + 2, narrow ? 104 : 120], [1, 'var(--text-3)', 'ticket 1×', -5, 4]].forEach(([v, c, l, dy, dx]) => {
      S_.append(line(L, YB(v), L + PW, YB(v), c, '5 4'), txt(L + PW - dx, YB(v) + dy, l, { 'text-anchor': 'end', fill: c }));
    });
    const pathB = svg('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.8 });
    S_.append(pathB);
    // alert strip
    S_.append(txt(L - 6, S1 + 14, 'PAGE', { 'text-anchor': 'end', fill: 'var(--err)' }), txt(L - 6, S2 + 14, 'TICKET', { 'text-anchor': 'end', fill: 'var(--warn)' }));
    S_.append(svg('rect', { x: L, y: S1, width: PW, height: 20, fill: 'var(--surface-2)', rx: 3 }), svg('rect', { x: L, y: S2, width: PW, height: 20, fill: 'var(--surface-2)', rx: 3 }));
    const gStrip = svg('g');
    S_.append(gStrip);
    [0, 10, 20, 30].forEach((d) => S_.append(txt(X(d * BPD), S2 + 40, d === 0 ? 'day 0' : String(d), { 'text-anchor': d === 0 ? 'start' : d === 30 ? 'end' : 'middle' })));
    const cursor = line(L, A.t, L, S2 + 20, 'var(--text-3)', '2 3');
    S_.append(cursor);
    G = { X, YA, YB, pathA, areaA, pathB, gStrip, cursor, S1, S2, A };
    paint();
  }

  function paint() {
    if (!G) return;
    const { X, YA, YB } = G;
    let a = '', bb = '';
    const hours = Math.floor(cur / 12);
    for (let h = 0; h <= hours; h++) {
      const s = h * 12, e = Math.min(cur, s + 12);
      if (e <= s) break;
      let mn = 2, mx = 0;
      for (let b = s; b < e; b++) { mn = Math.min(mn, remain[b]); mx = Math.max(mx, burn1h[b]); }
      a += (h ? 'L' : 'M') + X(e).toFixed(1) + ',' + YA(mn).toFixed(1);
      bb += (h ? 'L' : 'M') + X(e).toFixed(1) + ',' + YB(mx).toFixed(1);
    }
    G.pathA.setAttribute('d', a);
    G.areaA.setAttribute('d', a ? a + `L${X(cur).toFixed(1)},${YA(0)}L${X(0)},${YA(0)}Z` : '');
    G.pathB.setAttribute('d', bb);
    G.gStrip.innerHTML = '';
    [[page, G.S1, 'var(--err)'], [ticket, G.S2, 'var(--warn)']].forEach(([arr, y, c]) => {
      let s = -1;
      for (let b = 0; b <= cur; b++) {
        const on = b < cur && arr[b];
        if (on && s < 0) s = b;
        if (!on && s >= 0) { G.gStrip.append(svg('rect', { x: X(s), y, width: Math.max(3, X(b) - X(s)), height: 20, fill: c, rx: 2 })); s = -1; }
      }
    });
    G.cursor.setAttribute('x1', X(cur)); G.cursor.setAttribute('x2', X(cur));
    const b = Math.max(0, cur - 1);
    const st = cur === 0 ? '—' : page[b] ? '🔴 PAGE' : ticket[b] ? '🟡 TICKET' : '🟢 OK';
    stats.innerHTML = '';
    const e = 1 - slo;
    [['time', cur ? when(b) : 'Day 1 00:00'], ['budget left', cur ? pct(remain[b]) : '100%'], ['burn 1 h', cur ? bx(burn1h[b]) : '—'], ['burn 6 h', cur ? bx(ratio(b, W6H) / e) : '—'], ['alerts', st]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  function advance(n) {
    const to = Math.min(N, cur + n);
    for (let b = cur; b < to; b++) step(b, false);
    cur = to;
    if (cur >= N) { playing = false; say(`<b>End of month.</b> SLI ${pct(1 - Pb[N] / Pt[N])} vs SLO ${(slo * 100).toFixed(2).replace(/0$/, '')}%; budget left ${pct(remain[N - 1])}.`); setPlay(); }
    paint();
  }

  ctx.loop((dt) => {
    if (!playing || cur >= N) return;
    acc += Math.min(dt, 100) * (N / 40000);      // whole month in ~40 s
    const n = Math.floor(acc);
    if (n > 0) { acc -= n; advance(n); }
  });

  ev = {};
  setPlay();
  say('Demo month: a spike on day 5 and a slow leak from day 16. Inject your own incidents at any time, or change the SLO to see the same traffic judged differently.');
  if (ctx.reduced) advance(BPD * 6);
  build(ctx.narrow);
  ctx.onResize(build);
});
