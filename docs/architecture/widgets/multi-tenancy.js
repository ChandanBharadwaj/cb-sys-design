/* Noisy-neighbour lab: 12 tenants on 8 shared workers (pool / bridge / silo), per-tenant token-bucket limits,
   shuffle sharding (2 of 8 workers per tenant, client picks the less loaded one), queueing latency 1/(1-ρ).
   Plus a row-level-security demo that filters the same SELECT by the session's app.tenant_id. */
SD.widget('multi-tenancy', function (root, ctx) {
  const { el, svg } = ctx;
  const N = 12, W = 8, CAP = 3, BASE = 1, NOISY = 10, LIMIT = 2.5, SVC = 20;   // load units; SVC = ms at idle
  const st = { model: 'pool', limits: false, shuffle: false, noisy: new Set() };
  // deterministic shuffle shards: distinct pairs of workers (28 possible, we use 12)
  const PAIRS = [[0, 5], [1, 6], [2, 7], [3, 4], [0, 2], [1, 3], [4, 6], [5, 7], [0, 7], [1, 4], [2, 5], [3, 6]];
  const disp = { lat: new Array(N).fill(SVC / (1 - 0.5)), util: new Array(W).fill(0.5) };
  let gen = 0, loopH = null;

  function sim() {
    const offered = Array.from({ length: N }, (_, i) => st.noisy.has(i) ? NOISY : BASE);
    const served = offered.map((o) => st.limits ? Math.min(o, LIMIT) : o);
    const shed = offered.map((o, i) => o - served[i]);
    const silo = (i) => st.model === 'silo' || (st.model === 'bridge' && i < 2);
    const wl = new Array(W).fill(0);
    const shared = [...Array(N).keys()].filter((i) => !silo(i));
    const workersOf = (i) => st.shuffle ? PAIRS[i] : [...Array(W).keys()];
    shared.forEach((i) => workersOf(i).forEach((w) => { wl[w] += served[i] / workersOf(i).length; }));
    const capW = st.model === 'bridge' ? CAP * 10 / 12 : CAP;                 // bridge: shared fleet sized for 10 tenants
    const util = wl.map((l) => l / capW);
    const q = (rho) => SVC / (1 - Math.min(rho, 0.96));
    const lat = [...Array(N).keys()].map((i) => {
      if (silo(i)) return q(served[i] / (CAP * 2 / 3) * 0.5);                // own small stack sized ~2 units at 50%
      const ws = workersOf(i).map((w) => q(util[w]));
      return st.shuffle ? Math.min(...ws) * 0.7 + Math.max(...ws) * 0.3 : ws.reduce((a, b) => a + b, 0) / ws.length;
    });
    const cost = st.model === 'pool' ? W : st.model === 'bridge' ? W * 10 / 12 + 2 * 2 : N * 2;   // workers paid for
    const quiet = [...Array(N).keys()].filter((i) => !st.noisy.has(i));
    const base = q(0.5);
    const harm = quiet.length ? quiet.reduce((a, i) => a + Math.max(0, lat[i] / base - 1), 0) / quiet.length : 0;
    const hurt = quiet.filter((i) => lat[i] > base * 1.5).length;
    return { lat, util, shed, silo, cost, harm, hurt, quiet: quiet.length };
  }

  function build(narrow) {
    const my = ++gen;
    if (loopH) loopH.stop();
    root.innerHTML = '';
    const VW = narrow ? 360 : 600, COLS = narrow ? 3 : 6, TW = narrow ? 108 : 90, TH = narrow ? 52 : 50, GX = narrow ? 10 : 8;
    const rowsT = N / COLS, top = 26;
    const wCols = narrow ? 4 : 8, WW = narrow ? 78 : 66, WH = 40, wTop = top + rowsT * (TH + 10) + 34;
    const VH = wTop + (W / wCols) * (WH + 26) + 4;
    const FS = narrow ? 14 : 13;

    const ctl = el('div', { class: 'w-controls' });
    const seg = (key, opts) => {
      const btns = opts.map(([v, l]) => {
        const b = el('button', { class: 'btn' + (st[key] === v ? ' primary' : ''), text: l });
        b.addEventListener('click', () => { st[key] = v; btns.forEach((x) => x.classList.toggle('primary', x === b)); update(); });
        return b;
      });
      return btns;
    };
    const tog = (key, l) => {
      const b = el('button', { class: 'btn' + (st[key] ? ' primary' : ''), text: (st[key] ? '✓ ' : '+ ') + l });
      b.addEventListener('click', () => { st[key] = !st[key]; b.textContent = (st[key] ? '✓ ' : '+ ') + l; b.classList.toggle('primary', st[key]); update(); });
      return b;
    };
    ctl.append(el('b', { text: 'Model:' }), ...seg('model', [['pool', 'Pool'], ['bridge', 'Bridge (T1–T2 silo)'], ['silo', 'Silo all']]));
    const ctl2 = el('div', { class: 'w-controls' });
    ctl2.append(tog('limits', 'Per-tenant limits'), tog('shuffle', 'Shuffle sharding'));
    const reset = el('button', { class: 'btn', text: 'Calm all' });
    reset.addEventListener('click', () => { st.noisy.clear(); update(); });
    ctl2.append(reset);
    root.append(ctl, ctl2);

    const S = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': 'Tenants and shared workers with latency', style: narrow ? '' : 'max-width:760px;display:block;margin:0 auto' });
    S.append(svg('text', { x: 4, y: 16, fill: 'var(--text-3)', style: `font:700 ${FS}px var(--sans)`, text: 'Tenants (tap = noisy 10×)' }));
    S.append(svg('text', { x: 4, y: wTop - 12, fill: 'var(--text-3)', style: `font:700 ${FS}px var(--sans)`, text: 'Shared workers (utilisation)' }));
    const tiles = [];
    for (let i = 0; i < N; i++) {
      const c = i % COLS, r = Math.floor(i / COLS);
      const x = 4 + c * (TW + GX), y = top + r * (TH + 10);
      const g = svg('g', { style: 'cursor:pointer', role: 'button', 'aria-label': 'Toggle noisy tenant T' + (i + 1) });
      const rect = svg('rect', { x, y, width: TW, height: TH, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 2 });
      const t1 = svg('text', { x: x + 8, y: y + 20, fill: 'var(--text)', style: `font:700 ${FS + 1}px var(--sans)`, text: 'T' + (i + 1) });
      const t2 = svg('text', { x: x + 8, y: y + TH - 10, fill: 'var(--text)', style: `font:600 ${FS}px var(--mono)` });
      const t3 = svg('text', { x: x + TW - 6, y: y + 20, 'text-anchor': 'end', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)` });
      g.append(rect, t1, t2, t3);
      g.addEventListener('click', () => { st.noisy.has(i) ? st.noisy.delete(i) : st.noisy.add(i); update(); });
      S.append(g); tiles.push({ rect, t2, t3 });
    }
    const wks = [];
    for (let w = 0; w < W; w++) {
      const c = w % wCols, r = Math.floor(w / wCols), gap = (VW - 8 - wCols * WW) / (wCols - 1);
      const x = 4 + c * (WW + gap), y = wTop + r * (WH + 26);
      const bg = svg('rect', { x, y, width: WW, height: WH, rx: 6, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 2 });
      const fill = svg('rect', { x, y: y + WH, width: WW, height: 0, rx: 6, fill: 'var(--accent)', opacity: 0.55 });
      const tx = svg('text', { x: x + WW / 2, y: y + WH / 2 + 5, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${FS}px var(--mono)` });
      const lb = svg('text', { x: x + WW / 2, y: y + WH + 17, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: 'w' + (w + 1) });
      S.append(bg, fill, tx, lb); wks.push({ bg, fill, tx, y });
    }
    const silonote = svg('text', { x: VW / 2, y: wTop + WH, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${FS + 1}px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:5px`, text: 'Every tenant has its own stack' });
    S.append(silonote);
    root.append(el('div', { class: 'w-stage' }, S));

    const meters = el('div', { style: { display: 'grid', gap: '6px', margin: '8px 0' } });
    const mk = (label) => {
      const fill = el('div', { style: { height: '100%', width: '0%', borderRadius: '4px', transition: ctx.reduced ? 'none' : 'width .4s' } });
      const val = el('span', { style: { fontFamily: 'var(--mono)', fontSize: '13px', minWidth: '92px', textAlign: 'right' } });
      meters.append(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        el('span', { text: label, style: { flex: '0 0 92px', fontSize: '14px' } }),
        el('div', { style: { flex: '1', height: '14px', background: 'var(--surface-2)', borderRadius: '4px', overflow: 'hidden' } }, fill), val));
      return { fill, val };
    };
    const mCost = mk('Infra cost'), mIso = mk('Isolation');
    const stats = el('div', { class: 'w-stats' });
    root.append(meters, stats);

    // ---- RLS demo ----
    const ROWS = [['acme', 'INV-101', 1200], ['bigco', 'INV-102', 98000], ['acme', 'INV-103', 450], ['tiny', 'INV-104', 49], ['bigco', 'INV-105', 15500], ['acme', 'INV-106', 3100], ['tiny', 'INV-107', 49], ['bigco', 'INV-108', 7200]];
    const rls = { tenant: 'acme', bypass: false };
    const box = el('div', { style: { marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '10px' } });
    const rc = el('div', { class: 'w-controls' }, el('b', { text: 'RLS demo · current tenant:' }));
    const tb = ['acme', 'bigco', 'tiny', '(unset)'].map((t) => {
      const b = el('button', { class: 'btn' + (rls.tenant === t ? ' primary' : ''), text: t });
      b.addEventListener('click', () => { rls.tenant = t; tb.forEach((x) => x.classList.toggle('primary', x === b)); drawRls(); });
      rc.append(b); return b;
    });
    const byp = el('button', { class: 'btn', text: '+ Connect as owner, no FORCE' });
    byp.addEventListener('click', () => { rls.bypass = !rls.bypass; byp.textContent = (rls.bypass ? '✓ ' : '+ ') + 'Connect as owner, no FORCE'; byp.classList.toggle('primary', rls.bypass); drawRls(); });
    rc.append(byp);
    const sql = el('pre', { style: { fontSize: '13px', whiteSpace: 'pre-wrap', margin: '6px 0', background: 'var(--surface-2)', padding: '8px', borderRadius: '6px' } });
    const tbl = el('div', { style: { display: 'grid', gap: '3px', fontFamily: 'var(--mono)', fontSize: '13px' } });
    const rmsg = el('p', { style: { margin: '6px 0 0', fontSize: '14px' } });
    box.append(rc, sql, tbl, rmsg);
    root.append(box);
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(log);
    const say = (t) => { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 12) log.lastChild.remove(); };

    function drawRls() {
      const set = rls.tenant === '(unset)' ? '-- app.tenant_id not set' : `SELECT set_config('app.tenant_id', '${rls.tenant}', true);`;
      sql.textContent = `BEGIN;\n${set}\nSELECT tenant_id, invoice, amount FROM invoice;   -- no WHERE clause\n-- policy: USING (tenant_id = current_setting('app.tenant_id', true))`;
      tbl.innerHTML = '';
      let shown = 0, leaked = 0;
      ROWS.forEach(([t, id, amt]) => {
        const visible = rls.bypass || (rls.tenant !== '(unset)' && t === rls.tenant);
        if (!visible) return;
        shown++;
        const leak = rls.bypass && t !== rls.tenant;
        if (leak) leaked++;
        tbl.append(el('div', { style: { display: 'flex', gap: '12px', padding: '3px 8px', borderRadius: '4px', background: leak ? 'color-mix(in srgb, var(--err) 18%, transparent)' : 'color-mix(in srgb, var(--ok) 14%, transparent)' } },
          el('span', { text: t, style: { width: '56px' } }), el('span', { text: id, style: { width: '76px' } }), el('span', { text: '$' + amt.toLocaleString('en-US') })));
      });
      rmsg.innerHTML = rls.bypass
        ? `❌ <b>${shown} rows, ${leaked} belong to other tenants.</b> The table owner bypasses RLS unless the table has <code>FORCE ROW LEVEL SECURITY</code>.`
        : rls.tenant === '(unset)' ? '✅ <b>0 rows.</b> With no tenant set, <code>current_setting(..., true)</code> is NULL and the policy matches nothing: fail closed.'
          : `✅ <b>${shown} rows, all ${rls.tenant}.</b> Same SQL, filtered by the database, not by the developer.`;
    }

    let prevHurt = -1;
    function update() {
      if (my !== gen) return;
      const r = sim();
      const silo = st.model === 'silo';
      silonote.style.display = silo ? '' : 'none';
      wks.forEach((w) => { [w.bg, w.fill, w.tx].forEach((n) => { n.style.opacity = silo ? 0.15 : ''; }); });
      update.r = r;
      if (ctx.reduced) { disp.lat = r.lat.slice(); disp.util = r.util.slice(); paint(); }
      const costN = r.cost / (N * 2);
      mCost.fill.style.width = (costN * 100).toFixed(0) + '%'; mCost.fill.style.background = costN > 0.7 ? 'var(--err)' : costN > 0.45 ? 'var(--warn)' : 'var(--ok)';
      mCost.val.textContent = r.cost.toFixed(1) + ' workers';
      const iso = Math.max(0.03, 1 - Math.min(1, r.harm / 3));
      mIso.fill.style.width = (iso * 100).toFixed(0) + '%'; mIso.fill.style.background = iso > 0.8 ? 'var(--ok)' : iso > 0.5 ? 'var(--warn)' : 'var(--err)';
      mIso.val.textContent = (iso * 100).toFixed(0) + '%';
      stats.innerHTML = '';
      const add = (k, v) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }));
      add('Noisy tenants', st.noisy.size);
      add('Quiet tenants hurt (> 1.5× latency)', r.hurt + ' / ' + r.quiet);
      add('Cost per tenant', (r.cost / N).toFixed(2) + ' workers');
      add('Throttled (429)', r.shed.reduce((a, b) => a + b, 0).toFixed(1) + ' units');
      if (r.hurt !== prevHurt && prevHurt !== -1) {
        if (r.hurt === 0 && st.noisy.size) say('✅ Noisy tenant contained: no quiet tenant is above 1.5× its normal latency.');
        else if (r.hurt > 0) say(`⚠ <b>${r.hurt}</b> quiet tenant${r.hurt > 1 ? 's' : ''} slowed down. ${st.limits ? '' : 'Try <b>per-tenant limits</b>. '}${st.shuffle ? '' : 'Try <b>shuffle sharding</b>.'}`);
      }
      prevHurt = r.hurt;
    }
    function paint() {
      const r = update.r;
      tiles.forEach((t, i) => {
        const l = disp.lat[i], noisy = st.noisy.has(i);
        const tone = l > 150 ? 'var(--err)' : l > 60 ? 'var(--warn)' : 'var(--ok)';
        t.rect.setAttribute('stroke', noisy ? 'var(--err)' : tone);
        t.rect.setAttribute('stroke-width', noisy ? 4 : 2);
        t.t2.textContent = (l > 480 ? '>480' : Math.round(l)) + ' ms';
        t.t2.setAttribute('fill', tone);
        t.t3.textContent = r.silo(i) ? 'silo' : noisy ? (st.limits ? '429' : '10×') : st.shuffle ? 'w' + (PAIRS[i][0] + 1) + '+' + (PAIRS[i][1] + 1) : '';
      });
      wks.forEach((w, k) => {
        const u = Math.min(1, disp.util[k]);
        w.fill.setAttribute('height', (u * WH).toFixed(1)); w.fill.setAttribute('y', (w.y + WH - u * WH).toFixed(1));
        w.fill.setAttribute('fill', u > 0.9 ? 'var(--err)' : u > 0.7 ? 'var(--warn)' : 'var(--accent)');
        w.tx.textContent = Math.round(disp.util[k] * 100) + '%';
      });
    }
    loopH = ctx.loop((dt) => {
      const r = update.r; if (!r) return;
      const k = Math.min(1, dt / 250);
      for (let i = 0; i < N; i++) disp.lat[i] += (r.lat[i] - disp.lat[i]) * k;
      for (let w = 0; w < W; w++) disp.util[w] += (r.util[w] - disp.util[w]) * k;
      paint();
    });
    update(); paint(); drawRls();
    say('Tap <b>T5</b> to make it noisy, then add per-tenant limits and shuffle sharding.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
