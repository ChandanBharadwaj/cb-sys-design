/* Recommendation funnel on a 5,000-item catalog: exact top-K retrieval (what ANN approximates) + trending source →
   watched filter → ranking (relevance + popularity + freshness) → MMR diversity re-rank. Latencies are illustrative. */
SD.widget('recommendation', function (root, ctx) {
  const { el, svg } = ctx;
  const N = 5000, D = 8, BUDGET = 150;
  let seed = 11;
  const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  const norm = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const CATS = [['gaming', '#8b5cf6'], ['tech', '#0ea5e9'], ['music', '#ec4899'], ['sports', '#f59e0b'], ['cooking', '#22c55e'], ['travel', '#14b8a6']];
  const centers = CATS.map(() => norm(Array.from({ length: D }, gauss)));
  const items = Array.from({ length: N }, (_, i) => {
    const c = Math.floor(rand() * CATS.length);
    return { id: i, c, e: norm(centers[c].map((x) => x + 0.55 * gauss())), pop: 1 / Math.pow(1 + Math.floor(rand() * N), 0.8), age: Math.floor(rand() * 365) };
  });
  let u, watched;
  function resetUser() {
    u = norm(centers[0].map((x, i) => 0.55 * x + 0.3 * centers[1][i] + 0.15 * centers[2][i]));
    const byRel = items.slice().sort((a, b) => dot(u, b.e) - dot(u, a.e));
    watched = new Set(byRel.slice(0, 400).filter(() => rand() < 0.6).map((x) => x.id));
  }
  resetUser();

  let K = 500, div = 0.3;
  const kOut = el('b', { text: K }), kIn = el('input', { type: 'range', min: 50, max: 2000, step: 50, value: K, 'aria-label': 'Candidates' });
  kIn.addEventListener('input', () => { K = +kIn.value; kOut.textContent = K; run(); });
  const dOut = el('b', { text: Math.round(div * 100) + '%' }), dIn = el('input', { type: 'range', min: 0, max: 100, step: 5, value: div * 100, 'aria-label': 'Diversity' });
  dIn.addEventListener('input', () => { div = dIn.value / 100; dOut.textContent = Math.round(div * 100) + '%'; run(); });
  const cookBtn = el('button', { class: 'btn primary', text: '▶ Watch a cooking video' });
  cookBtn.onclick = () => {
    const before = dot(u, centers[4]);
    const v = items.filter((x) => x.c === 4 && !watched.has(x.id)).sort((a, b) => b.pop - a.pop)[0];
    if (v) watched.add(v.id);
    u = norm(u.map((x, i) => 0.6 * x + 0.4 * (v ? v.e[i] : centers[4][i])));
    say(`Watched cooking #${v ? v.id : '?'}. Stream update moved the user vector: cos(user, cooking) ${before.toFixed(2)} → ${dot(u, centers[4]).toFixed(2)}.`);
    run();
  };
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset user' });
  resetBtn.onclick = () => { resetUser(); say('User reset: mostly gaming, some tech and music.'); run(); };
  root.append(el('div', { class: 'w-controls' }, cookBtn, resetBtn),
    el('div', { class: 'w-controls' }, el('label', null, 'Candidates ', kOut, kIn), el('label', null, 'Diversity ', dOut, dIn)));

  const S_ = svg('svg', { role: 'img', 'aria-label': 'Recommendation funnel' });
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const T = (x, y, t, st, a, f) => svg('text', { x, y, 'text-anchor': a || 'middle', style: st || 'font:700 14px var(--sans)', fill: f || 'var(--text)', text: t });
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }

  const STAGES = ['catalog', 'retrieved', 'eligible', 'ranked', 'shown'];
  const LAT_COL = ['#0ea5e9', '#94a3b8', '#f59e0b', '#8b5cf6', '#22c55e'];
  // two layouts: phones get a 360-wide viewBox with 13–15-unit text; desktop keeps the 440-wide one
  const LAY = {
    wide: { W: 440, barH: 26, barGap: 32, bF: 14, lF: 13, latY: 186, chipY: 234, chipH: 46, chipGap: 52, cF: 13, iF: 12 },
    narrow: { W: 360, barH: 28, barGap: 34, bF: 15, lF: 14, latY: 200, chipY: 254, chipH: 50, chipGap: 56, cF: 13, iF: 13 }
  };
  let L, bars, latSegs, latTxt, chips;
  function build(n) {
    L = n ? LAY.narrow : LAY.wide;
    const W = L.W, IW = W - 12;
    S_.innerHTML = '';
    S_.setAttribute('viewBox', `0 0 ${W} ${L.chipY + 8 + 2 * L.chipGap}`);
    bars = STAGES.map((name, i) => {
      const y = 6 + i * L.barGap;
      const r = svg('rect', { x: W / 2, y, width: 0, height: L.barH, rx: 6, fill: `color-mix(in srgb, var(--accent) ${70 - i * 10}%, var(--surface))` });
      const t = T(W / 2, y + L.barH / 2 + L.bF * 0.36, '', `font:700 ${L.bF}px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:3px`);
      S_.append(r, t); return { r, t, w: 0, target: 0 };
    });
    S_.append(T(6, L.latY, 'latency vs ' + BUDGET + ' ms budget', `font:700 ${L.lF}px var(--sans)`, 'start', 'var(--text-3)'));
    S_.append(svg('rect', { x: 6, y: L.latY + 6, width: IW, height: 22, rx: 5, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
    latSegs = LAT_COL.map((c) => { const r = svg('rect', { x: 6, y: L.latY + 6, width: 0, height: 22, fill: c }); S_.append(r); return r; });
    latTxt = T(W - 12, L.latY, '', `font:700 ${L.lF}px var(--mono)`, 'end');
    S_.append(latTxt);
    S_.append(T(6, L.chipY, 'final 10 (MMR re-ranked)', `font:700 ${L.lF}px var(--sans)`, 'start', 'var(--text-3)'));
    const cw = (IW - 4 * 4.4) / 5;
    chips = Array.from({ length: 10 }, (_, i) => {
      const x = 6 + (i % 5) * (cw + 4.4), y = L.chipY + 8 + Math.floor(i / 5) * L.chipGap;
      const r = svg('rect', { x, y, width: cw, height: L.chipH, rx: 8 });
      const a = T(x + cw / 2, y + L.chipH * 0.43, '', `font:700 ${L.cF}px var(--sans)`, 'middle', '#fff');
      const b = T(x + cw / 2, y + L.chipH * 0.8, '', `font:600 ${L.iF}px var(--mono)`, 'middle', '#fff');
      S_.append(r, a, b); return { r, a, b };
    });
  }
  build(ctx.narrow);
  ctx.onResize((n) => { build(n); run(); });

  function run() {
    // 1. candidate generation: exact top-K by dot product (ANN approximates this) + 20 trending
    const rel = items.map((it) => ({ it, s: dot(u, it.e) }));
    const ann = rel.slice().sort((a, b) => b.s - a.s).slice(0, K);
    const seen = new Set(ann.map((x) => x.it.id));
    const trending = rel.filter((x) => !seen.has(x.it.id)).sort((a, b) => b.it.pop - a.it.pop).slice(0, 20);
    const cands = ann.concat(trending);
    // 2. filter: already watched
    const elig = cands.filter((x) => !watched.has(x.it.id));
    // 3. ranking: relevance + popularity + freshness (stands in for a heavier cross-feature model)
    const ranked = elig.map((x) => ({ it: x.it, r: x.s + 0.12 * Math.log(1 + x.it.pop * 1000) / Math.log(1001) + (x.it.age < 7 ? 0.08 : 0) }))
      .sort((a, b) => b.r - a.r).slice(0, 50);
    // 4. MMR: maximise λ·relevance − (1−λ)·max similarity to already chosen items
    const lam = 1 - div, pick = [];
    if (ranked.length) {
      const lo = ranked[ranked.length - 1].r, hi = ranked[0].r, nr = (x) => (hi > lo ? (x - lo) / (hi - lo) : 1);
      const pool = ranked.slice();
      while (pick.length < 10 && pool.length) {
        let best = 0, bs = -Infinity;
        pool.forEach((x, i) => { const sim = pick.length ? Math.max(...pick.map((p) => dot(p.it.e, x.it.e))) : 0; const s = lam * nr(x.r) - (1 - lam) * sim; if (s > bs) { bs = s; best = i; } });
        pick.push(pool.splice(best, 1)[0]);
      }
    }
    const counts = [N, cands.length, elig.length, ranked.length, pick.length];
    counts.forEach((n, i) => { bars[i].target = 40 + (L.W - 52) * Math.log10(n + 1) / Math.log10(N + 1); bars[i].t.textContent = STAGES[i] + ' · ' + n.toLocaleString(); });
    const lat = [6 + K * 0.004, 1 + cands.length * 0.001, 3 + elig.length * 0.012, 5 + elig.length * 0.07, 2 + 50 * 0.04];
    const total = lat.reduce((a, b) => a + b, 0), scale = (L.W - 12) / Math.max(BUDGET, total);
    let x = 6;
    latSegs.forEach((r, i) => { const w = lat[i] * scale; r.setAttribute('x', x); r.setAttribute('width', Math.max(0, w)); x += w; });
    latTxt.textContent = total.toFixed(0) + ' ms';
    latTxt.setAttribute('fill', total > BUDGET ? 'var(--err)' : 'var(--ok)');
    chips.forEach((ch, i) => {
      const p = pick[i];
      ch.r.setAttribute('fill', p ? CATS[p.it.c][1] : 'var(--surface-2)');
      ch.a.textContent = p ? CATS[p.it.c][0] : '';
      ch.b.textContent = p ? '#' + p.it.id : '';
    });
    const cats = new Set(pick.map((p) => p.it.c));
    const affin = CATS.map((c, i) => [c[0], dot(u, centers[i])]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, v]) => n + ' ' + v.toFixed(2)).join(', ');
    stats.innerHTML = '';
    Object.entries({ 'user leans': affin, 'topics in top 10': cats.size + ' of 6', 'watched (filtered)': watched.size, 'latency': total.toFixed(0) + ' ms' + (total > BUDGET ? ' ✗' : ' ✓') })
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    if (ctx.reduced) bars.forEach((b) => { b.w = b.target; paintBar(b); });
  }
  function paintBar(b) { b.r.setAttribute('x', (L.W - b.w) / 2); b.r.setAttribute('width', b.w); }
  ctx.loop((dt) => { bars.forEach((b) => { if (Math.abs(b.target - b.w) > 0.5) { b.w += (b.target - b.w) * Math.min(1, dt / 120); paintBar(b); } }); });
  run();
  say('Drag Diversity from 0% to 60% and watch the topic colours in the final 10. Then watch a few cooking videos.');
});
