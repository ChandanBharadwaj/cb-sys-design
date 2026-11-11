/* 200 checkout requests fan out gateway → orders → inventory (+ DB) → payments. Each has a random W3C trace id.
   Head sampling: keep if the trace id hashes below 10% (decided before the outcome).
   Tail sampling: keep if status=ERROR, or duration > 500 ms, or the hash is below 5% (decided after completion).
   Metrics (latency histogram) are always unsampled; each bucket stores one exemplar trace id. */
SD.widget('observability-pillars', function (root, ctx) {
  const { el, svg } = ctx;
  const N = 200, SLOW_MS = 500;
  let seed = 11;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hex = (n) => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(rnd() * 16).toString(16); return s; };
  const BUCKETS = [200, 300, 500, 1000, 2500];

  function makeReq(i) {
    const tid = hex(32);
    const slow = rnd() < 0.06, err = rnd() < 0.04;
    const db = slow ? 600 + rnd() * 1200 : 15 + rnd() * 45;
    const inv = db + 8 + rnd() * 10;
    const pay = err ? 40 + rnd() * 30 : 60 + rnd() * 80;
    const t0 = 4, oStart = 8, iStart = oStart + 6, pStart = iStart + inv + 4;
    const oEnd = pStart + pay + 5, total = oEnd + t0 + 3;
    const sid = () => hex(16);
    const spans = [
      { svc: 'gateway', name: 'POST /checkout', s: 0, d: total, id: sid(), err },
      { svc: 'orders', name: 'createOrder', s: t0, d: oEnd - t0, id: sid(), err },
      { svc: 'inventory', name: 'reserve', s: iStart, d: inv, id: sid() },
      { svc: 'postgres', name: 'SELECT stock', s: iStart + 3, d: db, id: sid(), slow },
      { svc: 'payments', name: 'charge_card', s: pStart, d: pay, id: sid(), err }
    ];
    const h = parseInt(tid.slice(0, 8), 16) / 4294967296;
    return { i, tid, spans, total, err, slow, h };
  }
  function logsFor(r, sp) {
    const L = [];
    const line = (lvl, svc, msg, span) => L.push({ lvl, svc, msg, span });
    line('INFO', 'gateway', 'request received POST /checkout', r.spans[0]);
    line('INFO', 'orders', 'order created status=PENDING', r.spans[1]);
    if (r.slow) line('WARN', 'inventory', `slow query SELECT stock took ${Math.round(r.spans[3].d)} ms (seq scan)`, r.spans[3]);
    line('INFO', 'inventory', 'stock reserved items=3', r.spans[2]);
    if (r.err) line('ERROR', 'payments', 'provider timeout after 3 retries: PaymentDeclined', r.spans[4]);
    else line('INFO', 'payments', 'card charged', r.spans[4]);
    line(r.err ? 'ERROR' : 'INFO', 'gateway', `response ${r.err ? 502 : 201} in ${Math.round(r.total)} ms`, r.spans[0]);
    return L.filter((l) => !sp || l.span === sp || sp.svc === 'gateway');
  }

  let reqs = [], mode = 'tail', shown = 0, running = false, acc = 0, sel = null, selSpan = null;
  const kept = (r) => mode === 'head' ? r.h < 0.10 : (r.err || r.total > SLOW_MS || r.h < 0.05);
  function generate() { seed = 11 + Math.floor(Math.random() * 1e6); reqs = []; for (let i = 0; i < N; i++) reqs.push(makeReq(i)); }

  // ---------- DOM ----------
  const modeBtns = {};
  const ctr = el('div', { class: 'w-controls' });
  [['head', 'Head 10%'], ['tail', 'Tail: errors + slow + 5%']].forEach(([m, l]) => {
    const b = el('button', { class: 'btn' + (m === mode ? ' primary' : ''), text: l });
    b.addEventListener('click', () => { mode = m; Object.keys(modeBtns).forEach((k) => modeBtns[k].className = 'btn' + (k === mode ? ' primary' : '')); sel = null; selSpan = null; paintAll(); });
    modeBtns[m] = b; ctr.append(b);
  });
  const runBtn = el('button', { class: 'btn primary', text: '▶ Run 200 requests' });
  runBtn.addEventListener('click', () => { generate(); sel = null; selSpan = null; shown = ctx.reduced ? N : 0; running = !ctx.reduced; paintAll(); });
  ctr.append(runBtn);
  const stats = el('div', { class: 'w-stats' });
  const gridBox = el('div'), histBox = el('div'), wfBox = el('div');
  const hint = el('div', { class: 'w-log', style: { minHeight: '0' } });
  const log = el('div', { class: 'w-log', style: { fontFamily: 'var(--mono)', fontSize: '12.5px' } });
  root.append(ctr, stats, gridBox, histBox, hint, wfBox, log);

  let narrow = ctx.narrow;
  const T = (x, y, t, o) => svg('text', Object.assign({ x, y, fill: 'var(--text-2, var(--text))', style: `font:600 ${narrow ? 14 : 13}px var(--sans)`, text: t }, o || {}));
  const sel_ = (r) => { sel = r; selSpan = null; paintAll(); };

  function paintGrid() {
    gridBox.innerHTML = '';
    const W = narrow ? 360 : 640, cols = 20, cell = (W - 20) / cols, rows = N / cols, H = 26 + rows * cell + 6;
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Requests and which traces were kept' });
    S.append(T(4, 17, `Requests (${mode === 'head' ? 'head 10%' : 'tail'}): solid = trace kept`, { fill: 'var(--text)', style: `font:700 ${narrow ? 14 : 13}px var(--sans)` }));
    reqs.slice(0, shown).forEach((r) => {
      const k = kept(r), x = 10 + (r.i % cols) * cell + cell / 2, y = 26 + Math.floor(r.i / cols) * cell + cell / 2;
      const c = r.err ? 'var(--err)' : r.total > SLOW_MS ? 'var(--warn)' : 'var(--accent)';
      const dot = svg('circle', { cx: x, cy: y, r: cell * 0.36, fill: k ? c : 'transparent', stroke: c, 'stroke-width': 1.4, opacity: k ? 1 : 0.45, style: { cursor: k ? 'pointer' : 'default' } });
      if (sel === r) S.append(svg('circle', { cx: x, cy: y, r: cell * 0.5, fill: 'none', stroke: 'var(--text)', 'stroke-width': 2 }));
      if (k) dot.addEventListener('click', () => sel_(r));
      S.append(dot);
    });
    gridBox.append(S);
  }

  function paintHist() {
    histBox.innerHTML = '';
    if (shown < N) return;
    const W = narrow ? 360 : 640, L = 8, top = 44, h = 86, H = top + h + 26;
    const counts = BUCKETS.map(() => 0), ex = BUCKETS.map(() => null);
    reqs.forEach((r) => { const b = BUCKETS.findIndex((le) => r.total <= le); const k = b < 0 ? BUCKETS.length - 1 : b; counts[k]++; if (!ex[k] || r.err) ex[k] = r; });
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Latency histogram with exemplars' });
    S.append(T(4, 18, 'Latency histogram (all 200: metrics are not sampled)', { fill: 'var(--text)', style: `font:700 ${narrow ? 14 : 13}px var(--sans)` }));
    const bw = (W - 2 * L) / BUCKETS.length, max = Math.max(...counts);
    const sq = (c) => Math.sqrt(c / max);
    BUCKETS.forEach((le, k) => {
      const x = L + k * bw, bh = Math.max(2, h * sq(counts[k]));
      S.append(svg('rect', { x: x + 4, y: top + h - bh, width: bw - 8, height: bh, fill: 'color-mix(in srgb, var(--accent) 35%, transparent)', rx: 3 }));
      S.append(T(x + bw / 2, top + h + 18, '≤' + (le >= 1000 ? le / 1000 + 's' : le), { 'text-anchor': 'middle' }));
      S.append(T(x + bw / 2, top + h - bh - 4, String(counts[k]), { 'text-anchor': 'middle' }));
      if (ex[k] && counts[k]) {
        const r = ex[k], cy = top + h - bh / 2;
        const d = svg('circle', { cx: x + bw / 2, cy, r: 8, fill: 'var(--err)', stroke: 'var(--surface)', 'stroke-width': 2, style: { cursor: 'pointer' } });
        d.addEventListener('click', () => {
          if (kept(r)) sel_(r);
          else { sel = null; paintAll(); hint.innerHTML = `Exemplar <code>${r.tid.slice(0, 12)}…</code> (${Math.round(r.total)} ms${r.err ? ', ERROR' : ''}): <b>trace not found</b>, it was dropped by ${mode} sampling. The metric saw it; the trace store did not.`; }
        });
        S.append(d);
      }
    });
    histBox.append(S);
  }

  function paintWaterfall() {
    wfBox.innerHTML = ''; log.innerHTML = '';
    if (!sel) return;
    const r = sel, W = narrow ? 360 : 640, LW = narrow ? 112 : 150, RW = W - LW - 10, rowH = narrow ? 34 : 30, top = 28;
    const H = top + r.spans.length * rowH + 8;
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Trace waterfall' });
    S.append(T(4, 18, `trace ${r.tid.slice(0, 8)}… · ${Math.round(r.total)} ms`, { fill: 'var(--text)', style: `font:700 ${narrow ? 14 : 13}px var(--mono)` }));
    const X = (ms) => LW + RW * ms / r.total;
    r.spans.forEach((sp, j) => {
      const y = top + j * rowH, indent = [0, 1, 2, 3, 2][j] * (narrow ? 6 : 10);
      const c = sp.err ? 'var(--err)' : sp.slow ? 'var(--warn)' : 'var(--accent)';
      if (selSpan === sp) S.append(svg('rect', { x: 0, y: y + 1, width: W, height: rowH - 2, fill: 'var(--surface-2)', rx: 4 }));
      S.append(T(4 + indent, y + rowH / 2 + 5, sp.svc));
      const bar = svg('rect', { x: X(sp.s), y: y + 6, width: Math.max(3, X(sp.s + sp.d) - X(sp.s)), height: rowH - 12, fill: c, rx: 3, style: { cursor: 'pointer' } });
      const ms = T(0, y + rowH / 2 + 5, Math.round(sp.d) + ' ms');
      const xe = X(sp.s + sp.d);
      if (xe + 62 < W) { ms.setAttribute('x', xe + 4); } else { ms.setAttribute('x', xe - 5); ms.setAttribute('text-anchor', 'end'); ms.setAttribute('fill', '#fff'); }
      const hit = svg('rect', { x: 0, y, width: W, height: rowH, fill: 'transparent', style: { cursor: 'pointer' } });
      hit.addEventListener('click', () => { selSpan = sp; paintWaterfall(); });
      S.append(bar, ms, hit);
    });
    wfBox.append(S);
    const sp = selSpan;
    log.append(el('div', { html: sp ? `<b>Logs where trace_id=${r.tid.slice(0, 12)}… span ${sp.svc}/${sp.name}</b> (span_id ${sp.id.slice(0, 8)}…)` : '<b>Tap a span</b> to filter its log lines. All lines for this trace:' }));
    logsFor(r, sp).forEach((l) => log.append(el('div', { html: `<span style="color:${l.lvl === 'ERROR' ? 'var(--err)' : l.lvl === 'WARN' ? 'var(--warn)' : 'var(--text-3)'}">${l.lvl}</span> {"svc":"${l.svc}","trace_id":"${r.tid.slice(0, 8)}…","span_id":"${l.span.id.slice(0, 6)}…","msg":"${l.msg}"}` })));
  }

  function paintStats() {
    stats.innerHTML = '';
    const done = reqs.slice(0, shown), k = done.filter(kept);
    const errs = done.filter((r) => r.err), slows = done.filter((r) => !r.err && r.total > SLOW_MS);
    [['requests', done.length], ['traces stored', `${k.length} (${done.length ? Math.round(k.length / done.length * 100) : 0}%)`],
      ['errors kept', `${errs.filter(kept).length} / ${errs.length}`], ['slow kept', `${slows.filter(kept).length} / ${slows.length}`]]
      .forEach(([a, b]) => stats.append(el('span', { class: 'w-stat', html: `${a}: <b>${b}</b>` })));
  }
  function paintHint() {
    if (!reqs.length) { hint.innerHTML = 'Press <b>Run</b>. Red = error, amber = slow (&gt; 500 ms), blue = normal. Solid dots are traces the sampler kept; tap one.'; return; }
    if (shown < N) { hint.innerHTML = 'Running…'; return; }
    const missed = reqs.filter((r) => (r.err || r.total > SLOW_MS) && !kept(r)).length;
    hint.innerHTML = mode === 'head'
      ? `Head sampling decided <b>before</b> each request finished: <b>${missed}</b> problematic traces were lost. Tap a red exemplar dot: it may point to a trace that no longer exists.`
      : `Tail sampling buffered each trace and decided <b>after</b> it completed: every error and slow trace was kept (${missed} lost). Tap a solid red or amber dot, or an exemplar.`;
  }
  function paintAll() { paintStats(); paintGrid(); paintHist(); paintHint(); paintWaterfall(); }

  ctx.loop((dt) => {
    if (!running) return;
    acc += dt;
    const n = Math.floor(acc / 15);
    if (n > 0) { acc -= n * 15; shown = Math.min(N, shown + n); if (shown >= N) { running = false; sel = reqs.find((r) => r.slow && kept(r)) || reqs.find(kept); } paintAll(); }
  });
  ctx.onResize((nw) => { narrow = nw; paintAll(); });
  generate(); shown = N; sel = reqs.find((r) => r.slow && kept(r)) || reqs.find(kept);
  paintAll();
});
