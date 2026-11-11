/* Package metrics on a live class graph: 8 classes in 3 modules. Move classes between modules or invert a
   cross-module dependency through an interface owned by the caller's module. Ca/Ce/I/A/D are recomputed per
   module (Martin 1994), module cycles are found with Tarjan's SCC, and modules are plotted on the A–I chart. */
SD.widget('design-principles', function (root, ctx) {
  const { el, svg } = ctx;
  const MODS = [['web', 'web'], ['orders', 'orders'], ['billing', 'billing']];
  const MCOL = { web: 'var(--k-client)', orders: 'var(--k-service)', billing: 'var(--k-compute)' };
  const INIT_C = [
    ['OrderCtl', 'web', 0], ['InvoiceView', 'web', 0],
    ['OrderService', 'orders', 0], ['Order', 'orders', 0], ['OrderRepo', 'orders', 1],
    ['BillingSvc', 'billing', 0], ['Invoice', 'billing', 0], ['TaxRules', 'billing', 0]
  ];
  const INIT_E = [
    ['OrderCtl', 'OrderService'], ['InvoiceView', 'Invoice'], ['InvoiceView', 'BillingSvc'],
    ['OrderService', 'Order'], ['OrderService', 'OrderRepo'], ['OrderService', 'BillingSvc'],
    ['BillingSvc', 'Invoice'], ['BillingSvc', 'Order'], ['Invoice', 'Order'], ['BillingSvc', 'TaxRules']
  ];
  let classes, edges, sel = null, narrow = ctx.narrow;
  function reset() {
    classes = INIT_C.map(([n, m, a]) => ({ n, m, a: !!a }));
    edges = INIT_E.map(([f, t]) => ({ f, t, impl: false }));
    sel = null;
  }
  reset();
  const cls = (n) => classes.find((c) => c.n === n);

  // ---- metrics ----
  function metrics() {
    const out = {};
    MODS.forEach(([m]) => {
      const inside = classes.filter((c) => c.m === m);
      const caSet = new Set(), ceSet = new Set();
      edges.forEach((e) => {
        const a = cls(e.f), b = cls(e.t);
        if (a.m !== m && b.m === m) caSet.add(a.n);
        if (a.m === m && b.m !== m) ceSet.add(a.n);
      });
      const Ca = caSet.size, Ce = ceSet.size, N = inside.length, Na = inside.filter((c) => c.a).length;
      const I = Ca + Ce ? Ce / (Ca + Ce) : null, A = N ? Na / N : 0;
      out[m] = { Ca, Ce, N, Na, I, A, D: I === null ? null : Math.abs(A + I - 1) };
    });
    return out;
  }
  function cycles() { // Tarjan SCC on the module graph
    const adj = {}; MODS.forEach(([m]) => (adj[m] = new Set()));
    edges.forEach((e) => { const a = cls(e.f).m, b = cls(e.t).m; if (a !== b) adj[a].add(b); });
    let idx = 0; const st = [], on = {}, ix = {}, low = {}, comps = [];
    function sc(v) {
      ix[v] = low[v] = idx++; st.push(v); on[v] = true;
      adj[v].forEach((w) => { if (ix[w] === undefined) { sc(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], ix[w]); });
      if (low[v] === ix[v]) { const c = []; let w; do { w = st.pop(); on[w] = false; c.push(w); } while (w !== v); if (c.length > 1) comps.push(c); }
    }
    MODS.forEach(([m]) => { if (ix[m] === undefined) sc(m); });
    return comps;
  }

  // ---- controls ----
  const moveRow = el('div', { class: 'w-controls' });
  const invRow = el('div', { class: 'w-controls' });
  const pick = el('select', { 'aria-label': 'Cross-module dependency to invert', style: { maxWidth: '100%', fontSize: '14px', padding: '6px' } });
  const invBtn = el('button', { class: 'btn primary', text: '⇄ Invert via interface' });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  const moveBtns = MODS.map(([m]) => { const b = el('button', { class: 'btn', text: '→ ' + m }); b.onclick = () => { if (!sel) return say('Tap a class first.'); const c = cls(sel); if (c.m === m) return; say(`Moved <b>${sel}</b> from ${c.m} to <b>${m}</b>.`); c.m = m; render(); }; return b; });
  moveRow.append(el('span', { class: 'muted', style: { fontSize: '14px' }, text: 'Move selected:' }), ...moveBtns);
  invRow.append(pick, invBtn, resetBtn);
  const stage = el('div', { class: 'w-stage' });
  const chart = el('div', { class: 'w-stage', style: { marginTop: '8px' } });
  const table = el('div', { style: { overflowX: 'auto', marginTop: '8px' } });
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(moveRow, invRow, stage, stats, table, chart, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 20) log.lastChild.remove(); }

  invBtn.onclick = () => {
    const i = +pick.value; const e = edges[i]; if (!e) return;
    const a = cls(e.f), b = cls(e.t);
    const name = 'I' + b.n.replace(/Svc|Service/, '') + 'Port';
    let port = cls(name);
    if (!port) { port = { n: name, m: a.m, a: true }; classes.push(port); }
    edges.splice(i, 1);
    if (!edges.some((x) => x.f === a.n && x.t === name)) edges.push({ f: a.n, t: name, impl: false });
    if (!edges.some((x) => x.f === b.n && x.t === name)) edges.push({ f: b.n, t: name, impl: true });
    say(`Inverted <b>${a.n} → ${b.n}</b>: ${a.n} now uses interface <b>${name}</b> owned by <b>${a.m}</b>; ${b.n} implements it, so the arrow now runs ${b.m} → ${a.m}.`);
    render();
  };
  resetBtn.onclick = () => { reset(); log.innerHTML = ''; say('Reset. Note the <b>orders ⇄ billing</b> cycle: OrderService → BillingSvc and BillingSvc → Order.'); render(); };

  // ---- drawing ----
  function render() {
    const M = metrics(), cyc = cycles(), inCyc = new Set(cyc.flat());
    const W = narrow ? 360 : 760, FS = narrow ? 14 : 14, BH = 30, PAD = 8;
    const box = {}, pos = {};
    let H;
    if (narrow) { // stacked modules, 2 columns of classes
      let y = 6;
      MODS.forEach(([m]) => {
        const cs = classes.filter((c) => c.m === m), rows = Math.max(1, Math.ceil(cs.length / 2));
        const h = 30 + rows * (BH + 8) + 4; box[m] = { x: 4, y, w: W - 8, h };
        cs.forEach((c, i) => { const cw = (W - 8 - PAD * 3) / 2; pos[c.n] = { x: 4 + PAD + (i % 2) * (cw + PAD), y: y + 28 + Math.floor(i / 2) * (BH + 8), w: cw }; });
        y += h + 34;
      });
      H = y - 28;
    } else {
      const bw = (W - 40) / 3; let maxH = 0;
      MODS.forEach(([m], k) => {
        const cs = classes.filter((c) => c.m === m), h = 34 + Math.max(1, cs.length) * (BH + 10);
        box[m] = { x: 10 + k * (bw + 10), y: 6, w: bw, h }; maxH = Math.max(maxH, h);
        cs.forEach((c, i) => { pos[c.n] = { x: box[m].x + 14, y: 6 + 30 + i * (BH + 10), w: bw - 28 }; });
      });
      MODS.forEach(([m]) => (box[m].h = maxH)); H = maxH + 12;
    }
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Class dependency graph across three modules' });
    const defs = svg('defs');
    ['a', 'x', 'e'].forEach((k) => defs.append(svg('marker', { id: 'dp-ar-' + k, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
      svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: k === 'e' ? 'var(--err)' : k === 'x' ? 'var(--accent)' : 'var(--text-3)' }))));
    S.append(defs);
    MODS.forEach(([m]) => {
      const b = box[m], bad = inCyc.has(m);
      S.append(svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 10, fill: 'var(--surface-2)', stroke: bad ? 'var(--err)' : 'var(--border)', 'stroke-width': bad ? 2.5 : 1.5 }),
        svg('text', { x: b.x + 10, y: b.y + 19, fill: MCOL[m], style: `font:700 ${FS}px var(--sans)`, text: '▣ ' + m + (bad ? '  ⟲ cycle' : '') }));
    });
    const gE = svg('g');
    edges.forEach((e) => {
      const a = pos[e.f], b = pos[e.t], ma = cls(e.f).m, mb = cls(e.t).m, cross = ma !== mb;
      const bad = cross && inCyc.has(ma) && inCyc.has(mb);
      const x1 = a.x + a.w / 2, y1 = a.y + BH / 2, x2 = b.x + b.w / 2, y2 = b.y + BH / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const clip = (w) => Math.min(w / 2 / (Math.abs(dx) || 1e-6), BH / 2 / (Math.abs(dy) || 1e-6), 0.5);
      const ta = clip(a.w), tb = clip(b.w), L = Math.hypot(dx, dy) || 1;
      const sx = x1 + dx * ta, sy = y1 + dy * ta, ex = x2 - dx * tb, ey = y2 - dy * tb;
      const mx = (sx + ex) / 2 + (dy / L) * 18, my = (sy + ey) / 2 - (dx / L) * 18;
      gE.append(svg('path', { d: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`, fill: 'none', stroke: bad ? 'var(--err)' : cross ? 'var(--accent)' : 'var(--text-3)', 'stroke-width': cross ? 2.2 : 1.4, 'stroke-dasharray': e.impl ? '6 4' : '', opacity: cross ? 0.95 : 0.55, 'marker-end': `url(#dp-ar-${bad ? 'e' : cross ? 'x' : 'a'})` }));
    });
    S.append(gE);
    classes.forEach((c) => {
      const p = pos[c.n], on = sel === c.n;
      const g = svg('g', { style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-label': 'Select ' + c.n });
      g.append(svg('rect', { x: p.x, y: p.y, width: p.w, height: BH, rx: 7, fill: on ? 'color-mix(in srgb, var(--accent) 22%, var(--surface))' : 'var(--surface)', stroke: on ? 'var(--accent)' : c.a ? 'var(--ok)' : 'var(--border)', 'stroke-width': on ? 2.5 : 1.5, 'stroke-dasharray': c.a ? '4 3' : '' }),
        svg('text', { x: p.x + p.w / 2, y: p.y + BH / 2 + FS * 0.36, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:${c.a ? 'italic 600' : '600'} ${FS - (c.n.length > 13 ? 1 : 0)}px var(--sans)`, text: (c.a ? '«i» ' : '') + c.n }));
      const choose = () => { sel = on ? null : c.n; render(); };
      g.addEventListener('click', choose);
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(); } });
      S.append(g);
    });
    stage.innerHTML = ''; stage.append(S);

    // invertible edges
    pick.innerHTML = '';
    edges.forEach((e, i) => { if (!e.impl && cls(e.f).m !== cls(e.t).m && !cls(e.t).a) pick.append(el('option', { value: i, text: `${e.f} → ${e.t} (${cls(e.f).m} → ${cls(e.t).m})` })); });
    invBtn.disabled = !pick.options.length;

    // table
    const f2 = (x) => (x === null ? 'n/a' : x.toFixed(2));
    table.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:14px;text-align:left"><thead><tr style="color:var(--text-3)"><th>Module</th><th>Ca</th><th>Ce</th><th>I</th><th>A</th><th>D</th></tr></thead><tbody>` +
      MODS.map(([m]) => { const r = M[m]; const z = r.D === null ? '' : r.D > 0.5 ? (r.A + r.I < 1 ? ' · pain' : ' · useless') : ''; return `<tr><td style="color:${MCOL[m]};font-weight:700">${m}${inCyc.has(m) ? ' ⟲' : ''}</td><td>${r.Ca}</td><td>${r.Ce}</td><td>${f2(r.I)}</td><td>${r.A.toFixed(2)}</td><td style="${r.D !== null && r.D > 0.5 ? 'color:var(--err);font-weight:700' : ''}">${f2(r.D)}${z}</td></tr>`; }).join('') + '</tbody></table>';
    table.querySelectorAll('td,th').forEach((c) => { c.style.padding = '4px 6px'; c.style.borderBottom = '1px solid var(--border)'; });
    stats.innerHTML = '';
    const avgD = MODS.map(([m]) => M[m].D).filter((d) => d !== null);
    [['module cycles', cyc.length ? cyc.map((c) => c.join(' ⇄ ')).join(', ') : '0 ✓'], ['interfaces', classes.filter((c) => c.a).length], ['mean D', avgD.length ? (avgD.reduce((s, d) => s + d, 0) / avgD.length).toFixed(2) : 'n/a'], ['selected', sel || 'none']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b${k === 'module cycles' && cyc.length ? ' style="color:var(--err)"' : ''}>${v}</b>` })));
    drawChart(M);
  }

  function drawChart(M) {
    const W = narrow ? 360 : 520, H = narrow ? 330 : 340, L = narrow ? 52 : 60, T = 14, P = W - L - 18, Q = H - T - 52;
    const X = (i) => L + i * P, Y = (a) => T + (1 - a) * Q;
    const C = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Abstractness versus instability chart with the main sequence' });
    C.append(svg('rect', { x: X(0), y: Y(1), width: P, height: Q, fill: 'var(--surface-2)', stroke: 'var(--border)' }),
      svg('path', { d: `M${X(0)},${Y(0)} L${X(0.5)},${Y(0)} L${X(0)},${Y(0.5)} z`, fill: 'color-mix(in srgb, var(--err) 16%, transparent)' }),
      svg('path', { d: `M${X(1)},${Y(1)} L${X(0.5)},${Y(1)} L${X(1)},${Y(0.5)} z`, fill: 'color-mix(in srgb, var(--warn) 18%, transparent)' }),
      svg('line', { x1: X(0), y1: Y(1), x2: X(1), y2: Y(0), stroke: 'var(--ok)', 'stroke-width': 2.5, 'stroke-dasharray': '8 5' }),
      svg('text', { x: X(0.03), y: Y(0.05), fill: 'var(--err)', style: 'font:700 14px var(--sans)', text: 'pain' }),
      svg('text', { x: X(0.97), y: Y(0.92), 'text-anchor': 'end', fill: 'var(--warn)', style: 'font:700 14px var(--sans)', text: 'useless' }),
      svg('text', { x: X(0.55), y: Y(0.52), fill: 'var(--ok)', style: 'font:600 13px var(--sans)', text: 'A + I = 1' }),
      svg('text', { x: X(0.5), y: H - 10, 'text-anchor': 'middle', fill: 'var(--text-2)', style: 'font:600 14px var(--sans)', text: 'Instability I →' }),
      svg('text', { x: 16, y: Y(0.5), 'text-anchor': 'middle', fill: 'var(--text-2)', transform: `rotate(-90 16 ${Y(0.5)})`, style: 'font:600 14px var(--sans)', text: 'Abstractness A →' }));
    [0, 0.5, 1].forEach((t) => C.append(svg('text', { x: X(t), y: Y(0) + 18, 'text-anchor': 'middle', fill: 'var(--text-3)', style: 'font:13px var(--sans)', text: t }), svg('text', { x: X(0) - 6, y: Y(t) + 5, 'text-anchor': 'end', fill: 'var(--text-3)', style: 'font:13px var(--sans)', text: t })));
    const DY = { web: -16, orders: -16, billing: -36 };
    MODS.forEach(([m], k) => {
      const r = M[m]; if (r.I === null) return;
      const cx = X(r.I), cy = Y(r.A), right = r.I > 0.6;
      const near = MODS.some(([o]) => o !== m && M[o].I !== null && Math.abs(M[o].I - r.I) < 0.3 && Math.abs(M[o].A - r.A) < 0.15);
      const dy = near ? DY[m] : -14;
      C.append(svg('circle', { cx, cy, r: 8, fill: MCOL[m], stroke: 'var(--surface)', 'stroke-width': 2 }),
        svg('text', { x: cx + (right ? -6 : 6), y: cy + dy, 'text-anchor': right ? 'end' : 'start', fill: MCOL[m], style: 'font:700 14px var(--sans)', text: m }));
    });
    chart.innerHTML = ''; chart.append(C);
  }

  say('Start: <b>orders ⇄ billing</b> form a cycle (OrderService → BillingSvc, BillingSvc → Order). Try inverting <b>OrderService → BillingSvc</b>.');
  render();
  ctx.onResize((nw) => { narrow = nw; render(); });
});
