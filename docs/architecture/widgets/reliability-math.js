/* Reliability block diagram: stages in series, replicas in parallel (k-of-n binomial),
   optional common-cause beta factor. Plus a shuffle-sharding lab: one noisy tenant kills its workers. */
SD.widget('reliability-math', function (root, ctx) {
  const { el, svg } = ctx;
  const comb = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
  // k-of-n with common-cause fraction beta: U = beta*u + U_indep(u' = (1-beta)u)
  const kofn = (a, k, n, beta) => {
    const u = 1 - a, ui = (1 - beta) * u, ai = 1 - ui;
    let A = 0;
    for (let i = k; i <= n; i++) A += comb(n, i) * Math.pow(ai, i) * Math.pow(ui, n - i);
    return n > 1 || k < n ? Math.max(0, A - beta * u) : a;
  };
  const PRESETS = {
    chain: { name: 'Single chain', st: [['LB', 99.99, 1, 1], ['App', 99.9, 1, 1], ['DB', 99.9, 1, 1], ['Auth', 99.9, 1, 1]] },
    redundant: { name: 'Redundant tiers', st: [['LB', 99.99, 2, 1], ['App', 99.5, 3, 1], ['DB', 99.9, 2, 1], ['Auth', 99.9, 1, 1]] },
    quorum: { name: 'Quorum DB', st: [['LB', 99.99, 2, 1], ['App', 99.5, 3, 1], ['DB', 99.5, 3, 2], ['Auth', 99.99, 2, 1]] },
    multiaz: { name: '3 AZ, static', st: [['LB', 99.9, 3, 2], ['App', 99.9, 3, 2], ['DB', 99.9, 3, 2], ['Auth', 99.95, 3, 2]] }
  };
  const AV = [99, 99.5, 99.9, 99.95, 99.99];
  let stages = [], beta = 0;
  const pct = (x) => x > 0.9999999 ? '> 99.99999%' : (x * 100).toFixed(x > 0.99999 ? 5 : x > 0.999 ? 4 : 3) + '%';
  const down = (A) => { const m = (1 - A) * 730 * 60; return m < 1 ? (m * 60).toFixed(1) + ' s' : m < 120 ? m.toFixed(1) + ' min' : (m / 60).toFixed(1) + ' h'; };

  // ---------- panel 1: block diagram ----------
  root.append(el('h4', { text: '1 · Block diagram: series × parallel', style: { margin: '4px 0 6px' } }));
  const pre = el('div', { class: 'w-controls' });
  const preBtns = {};
  Object.keys(PRESETS).forEach((k) => { const b = el('button', { class: 'btn', text: PRESETS[k].name }); b.addEventListener('click', () => load(k)); preBtns[k] = b; pre.append(b); });
  const bsel = el('select', { 'aria-label': 'Common-cause fraction' });
  [[0, 'β 0: independent'], [0.05, 'β 5% common cause'], [0.1, 'β 10%'], [0.2, 'β 20%']].forEach(([v, l]) => bsel.append(el('option', { value: v, text: l })));
  bsel.addEventListener('change', () => { beta = +bsel.value; render(); });
  pre.append(bsel);
  root.append(pre);
  const stage1 = el('div', { class: 'w-stage' });
  const editor = el('div', { style: { display: 'grid', gap: '6px', margin: '8px 0' } });
  const stats1 = el('div', { class: 'w-stats' });
  root.append(stage1, editor, stats1);

  function load(k) {
    stages = PRESETS[k].st.map(([n, a, r, kk]) => ({ n, a, r, k: kk }));
    Object.keys(preBtns).forEach((p) => preBtns[p].classList.toggle('primary', p === k));
    buildEditor(); render();
  }
  function buildEditor() {
    editor.innerHTML = '';
    stages.forEach((s) => {
      const sel = el('select', { 'aria-label': s.n + ' availability' });
      AV.forEach((v) => { const o = el('option', { value: v, text: v + '%' }); if (v === s.a) o.selected = true; sel.append(o); });
      sel.addEventListener('change', () => { s.a = +sel.value; render(); });
      const kSel = el('select', { 'aria-label': s.n + ' replicas needed' });
      const fillK = () => { kSel.innerHTML = ''; for (let i = 1; i <= s.r; i++) { const o = el('option', { value: i, text: 'need ' + i + ' of ' + s.r }); if (i === s.k) o.selected = true; kSel.append(o); } };
      kSel.addEventListener('change', () => { s.k = +kSel.value; render(); });
      const mk = (t, d) => { const b = el('button', { class: 'btn', text: t, 'aria-label': (d > 0 ? 'add' : 'remove') + ' ' + s.n + ' replica' }); b.addEventListener('click', () => { s.r = Math.max(1, Math.min(5, s.r + d)); s.k = Math.min(s.k, s.r); fillK(); render(); }); return b; };
      fillK();
      editor.append(el('div', { class: 'w-controls', style: { alignItems: 'center', margin: 0 } }, el('b', { text: s.n, style: { minWidth: '42px' } }), sel, mk('−', -1), mk('+', 1), kSel));
    });
  }
  function render() {
    const narrow = ctx.narrow, W = narrow ? 360 : 640, F = narrow ? 14 : 14, RH = narrow ? 58 : 50, LX = narrow ? 58 : 70;
    const H = stages.length * RH + 34;
    stage1.innerHTML = '';
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Reliability block diagram' });
    stage1.append(S);
    let total = 1;
    const RW = narrow ? 112 : 150, BW = Math.min(46, (W - LX - RW - 10) / 5 - 6);
    stages.forEach((s, i) => {
      const A = kofn(s.a / 100, s.k, s.r, s.r > 1 ? beta : 0);
      total *= A;
      const y = 8 + i * RH, cy = y + RH / 2 - 6;
      S.append(svg('text', { x: 4, y: cy + 5, fill: 'var(--text)', style: `font:700 ${F}px var(--sans)`, text: s.n }));
      if (i < stages.length - 1) S.append(svg('line', { x1: LX - 8, y1: cy + RH / 2 - 8, x2: LX - 8, y2: cy + RH / 2 + 8, stroke: 'var(--text-3)', 'stroke-width': 2 }));
      for (let j = 0; j < s.r; j++) {
        const x = LX + j * (BW + 6);
        S.append(svg('rect', { x, y: cy - 16, width: BW, height: 32, rx: 6, fill: 'color-mix(in srgb, var(--accent) 16%, var(--surface-2))', stroke: 'var(--accent)' }));
        S.append(svg('text', { x: x + BW / 2, y: cy + 5, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:600 13px var(--sans)`, text: String(s.a).replace('99.', '.') }));
      }
      const good = -Math.log10(1 - A);
      S.append(svg('text', { x: W - 4, y: cy - 2, 'text-anchor': 'end', fill: good >= 4 ? 'var(--ok)' : good >= 3 ? 'var(--accent)' : 'var(--warn)', style: `font:700 ${F}px var(--sans)`, text: pct(A) }));
      S.append(svg('text', { x: W - 4, y: cy + 15, 'text-anchor': 'end', fill: 'var(--text-3)', style: `font:600 13px var(--sans)`, text: s.r > 1 ? s.k + '-of-' + s.r : 'single' }));
    });
    S.append(svg('text', { x: 4, y: H - 8, fill: 'var(--text)', style: `font:700 ${F}px var(--sans)`, text: 'Composite (series): ' + pct(total) }));
    stats1.innerHTML = '';
    let indep = 1; stages.forEach((s) => { indep *= kofn(s.a / 100, s.k, s.r, 0); });
    [['composite', pct(total)], ['downtime / month', down(total)], ['nines', (-Math.log10(1 - total)).toFixed(2)], ['weakest stage', stages.reduce((m, s) => { const A = kofn(s.a / 100, s.k, s.r, s.r > 1 ? beta : 0); return A < m[1] ? [s.n, A] : m; }, ['', 2])[0]],
      ['if independent', pct(indep)]].forEach(([k, v]) => stats1.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  // ---------- panel 2: shuffle sharding ----------
  root.append(el('h4', { text: '2 · One noisy tenant kills its workers', style: { margin: '18px 0 6px' } }));
  let N = 8, K = 2, mode = 'shuffle', noisy = 0;
  const T = 24;
  const ctl2 = el('div', { class: 'w-controls' });
  const mBtns = {};
  [['simple', 'Simple sharding'], ['shuffle', 'Shuffle sharding']].forEach(([m, l]) => { const b = el('button', { class: 'btn', text: l }); b.addEventListener('click', () => { mode = m; paint2(); }); mBtns[m] = b; ctl2.append(b); });
  const nSel = el('select', { 'aria-label': 'Workers' });
  [[8, 2], [8, 4], [12, 3], [16, 4]].forEach(([n, k]) => nSel.append(el('option', { value: n + ',' + k, text: n + ' workers, ' + k + ' per tenant' })));
  nSel.addEventListener('change', () => { [N, K] = nSel.value.split(',').map(Number); paint2(); });
  const nextBtn = el('button', { class: 'btn primary', text: '🎯 Next noisy tenant' });
  nextBtn.addEventListener('click', () => { noisy = (noisy + 1) % T; paint2(); });
  ctl2.append(nSel, nextBtn);
  root.append(ctl2);
  const stage2 = el('div', { class: 'w-stage' });
  const stats2 = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stage2, stats2, log);

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function assign(t) {
    if (mode === 'simple') { const shards = N / K, s = hash('t' + t) % shards; return Array.from({ length: K }, (_, i) => s * K + i); }
    let seed = hash('tenant-' + t + ':' + N + ':' + K);                 // deterministic partial Fisher-Yates
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const pool = Array.from({ length: N }, (_, i) => i);
    for (let i = 0; i < K; i++) { const j = i + Math.floor(rnd() * (N - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, K).sort((a, b) => a - b);
  }
  function paint2() {
    Object.keys(mBtns).forEach((m) => mBtns[m].classList.toggle('primary', m === mode));
    const narrow = ctx.narrow, W = narrow ? 360 : 640;
    const shards = T, cols = narrow ? 6 : 12, rows = Math.ceil(shards / cols);
    const wCols = narrow ? Math.min(N, 8) : N, wRows = Math.ceil(N / wCols);
    const ww = (W - 8) / wCols, cw = (W - 8) / cols;
    const H = 26 + wRows * 40 + 30 + rows * 44 + 6;
    const as = Array.from({ length: T }, (_, t) => assign(t));
    const dead = new Set(as[noisy]);
    let full = 0, part = 0;
    stage2.innerHTML = '';
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Shuffle sharding: workers and tenants' });
    stage2.append(S);
    S.append(svg('text', { x: 4, y: 16, fill: 'var(--text)', style: 'font:700 14px var(--sans)', text: 'Workers (✕ = killed)' }));
    for (let w = 0; w < N; w++) {
      const x = 4 + (w % wCols) * ww, y = 24 + Math.floor(w / wCols) * 40, d = dead.has(w);
      S.append(svg('rect', { x: x + 2, y, width: ww - 4, height: 32, rx: 6, fill: d ? 'color-mix(in srgb, var(--err) 30%, var(--surface-2))' : 'var(--surface-2)', stroke: d ? 'var(--err)' : 'var(--border)' }));
      S.append(svg('text', { x: x + ww / 2, y: y + 21, 'text-anchor': 'middle', fill: d ? 'var(--err)' : 'var(--text)', style: 'font:700 14px var(--sans)', text: d ? '✕' + w : 'W' + w }));
    }
    const ty = 24 + wRows * 40 + 8;
    S.append(svg('text', { x: 4, y: ty + 14, fill: 'var(--text)', style: 'font:700 14px var(--sans)', text: 'Tenants' }));
    as.forEach((ws, t) => {
      const hit = ws.filter((w) => dead.has(w)).length;
      const st = t === noisy ? 'noisy' : hit === K ? 'down' : hit > 0 ? 'degraded' : 'ok';
      if (t !== noisy) { if (st === 'down') full++; else if (st === 'degraded') part++; }
      const x = 4 + (t % cols) * cw, y = ty + 22 + Math.floor(t / cols) * 44;
      const c = { noisy: 'var(--err)', down: 'var(--err)', degraded: 'var(--warn)', ok: 'var(--ok)' }[st];
      const g = svg('g', { style: { cursor: 'pointer' } });
      g.append(svg('rect', { x: x + 2, y, width: cw - 4, height: 36, rx: 8, fill: st === 'ok' ? 'var(--surface-2)' : `color-mix(in srgb, ${c} 25%, var(--surface-2))`, stroke: c, 'stroke-width': t === noisy ? 3 : 1.2 }));
      g.append(svg('text', { x: x + cw / 2, y: y + 23, 'text-anchor': 'middle', fill: 'var(--text)', style: 'font:700 13px var(--sans)', text: t === noisy ? '☠' : 'T' + t }));
      g.addEventListener('click', () => { noisy = t; paint2(); });
      S.append(g);
    });
    const others = T - 1;
    stats2.innerHTML = '';
    [['noisy tenant', 'T' + noisy + ' → workers ' + as[noisy].join(',')], ['fully down', full + ' of ' + others + ' (' + (full / others * 100).toFixed(0) + '%)'], ['degraded (retry ok)', part], ['combinations', mode === 'shuffle' ? 'C(' + N + ',' + K + ') = ' + comb(N, K) : (N / K) + ' fixed shards']]
      .forEach(([k, v]) => stats2.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    const exp = mode === 'shuffle' ? (others / comb(N, K)).toFixed(2) : (others / (N / K)).toFixed(1);
    log.innerHTML = '';
    log.append(el('div', { html: mode === 'shuffle'
      ? `<b>Shuffle:</b> a tenant is fully down only if all ${K} of its workers are among the ${K} killed, i.e. it drew the <b>same combination</b>: expected ≈ ${others} ÷ ${comb(N, K)} = ${exp} tenants. Amber tenants lost some workers but survive if their client retries on the rest. Click any tenant to make it the noisy one.`
      : `<b>Simple:</b> the noisy tenant takes its whole shard. Every tenant hashed to that shard is down: expected ≈ ${others} ÷ ${N / K} = ${exp} tenants. Switch to shuffle sharding with the same ${N} workers.` }));
  }

  load('redundant');
  paint2();
  ctx.onResize(() => { render(); paint2(); });
});
