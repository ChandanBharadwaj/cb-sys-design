/* 5×5 risk heat map: 8 sample risks placed by likelihood bucket (rows) and impact bucket (columns).
   Responses change the risk's numbers (likelihood %, impact $), and the risk moves to the cell its numbers imply.
   Totals compare expected loss (Σ p × impact) before and after, minus what the responses cost. */
SD.widget('risk-management', function (root, ctx) {
  const { el, svg } = ctx;
  const CATS = { technical: 'Technical', security: 'Security', vendor: 'Vendor lock-in', people: 'Key person', delivery: 'Delivery', compliance: 'Compliance' };
  // p = likelihood per year (%), imp = impact ($K). mit = mitigation: multiplies p and impact, costs $K/yr.
  const BASE = [
    { id: 'R1', t: 'Vendor agent update crashes all hosts', cat: 'vendor', p: 10, imp: 6000, mit: { a: 'staged rollout + canary group', p: 0.5, i: 0.15, c: 60 } },
    { id: 'R2', t: 'Critical CVE in a ubiquitous library', cat: 'security', p: 60, imp: 400, mit: { a: 'SBOM + auto-patch pipeline', p: 1, i: 0.25, c: 40 } },
    { id: 'R3', t: 'Only one engineer understands billing', cat: 'people', p: 35, imp: 700, mit: { a: 'pairing, runbooks, 2nd owner', p: 0.4, i: 0.5, c: 50 } },
    { id: 'R4', t: 'Payment provider has no token export', cat: 'vendor', p: 15, imp: 3000, mit: { a: 'export clause + port/adapter', p: 1, i: 0.15, c: 45 } },
    { id: 'R5', t: 'Single cloud region outage', cat: 'technical', p: 25, imp: 1200, mit: { a: 'warm standby in 2nd region', p: 1, i: 0.2, c: 180 } },
    { id: 'R6', t: 'Launch date slips past contract deadline', cat: 'delivery', p: 55, imp: 220, mit: { a: 'cut scope, feature flags', p: 0.4, i: 1, c: 30 } },
    { id: 'R7', t: 'Personal data stored outside the EU', cat: 'compliance', p: 12, imp: 4000, mit: { a: 'residency controls + DPA', p: 0.2, i: 1, c: 70 } },
    { id: 'R8', t: 'Unpinned transitive npm package removed', cat: 'technical', p: 30, imp: 60, mit: { a: 'lockfile + internal mirror', p: 0.1, i: 1, c: 5 } }
  ];
  const LB = [5, 20, 50, 80], IB = [50, 250, 1000, 5000];
  const bucket = (v, arr) => arr.filter((x) => v >= x).length;     // 0..4
  const money = (k) => k >= 1000 ? '$' + (k / 1000).toFixed(1) + 'M' : '$' + Math.round(k) + 'K';
  let risks, sel = 'R1', filter = 'all', gen = 0;
  function reset() { risks = BASE.map((r) => Object.assign({}, r, { p0: r.p, i0: r.imp, resp: null, cost: 0, x: null, y: null })); }
  reset();

  function build(narrow) {
    const my = ++gen;
    root.innerHTML = '';
    const VW = narrow ? 360 : 520, LM = narrow ? 34 : 70, TM = 8, BM = narrow ? 40 : 46;
    const CW = (VW - LM - 8) / 5, CH = narrow ? 58 : 62, VH = TM + CH * 5 + BM, FS = narrow ? 14 : 13, DOT = narrow ? 17 : 16;

    // filter + response controls
    const fRow = el('div', { class: 'w-controls' }, el('b', { text: 'Category:' }));
    const fBtns = ['all'].concat(Object.keys(CATS)).map((c) => {
      const b = el('button', { class: 'btn' + (filter === c ? ' primary' : ''), text: c === 'all' ? 'All' : CATS[c] });
      b.addEventListener('click', () => { filter = c; fBtns.forEach((x) => x.classList.toggle('primary', x === b)); draw(); });
      fRow.append(b); return b;
    });
    root.append(fRow);
    const aRow = el('div', { class: 'w-controls' });
    const act = (label, fn, primary) => { const b = el('button', { class: 'btn' + (primary ? ' primary' : ''), text: label }); b.addEventListener('click', fn); aRow.append(b); return b; };
    act('Mitigate', () => respond('mitigate'), true);
    act('Transfer', () => respond('transfer'));
    act('Avoid', () => respond('avoid'));
    act('Accept', () => respond('accept'));
    act('Mitigate all ≥ $100K', () => { risks.forEach((r) => { if (!r.resp && r.p0 * r.i0 / 100 >= 100) apply(r, 'mitigate', true); }); draw(); });
    act('Reset', () => { reset(); say('Reset to the unmitigated register.'); draw(); });
    root.append(aRow);

    const S = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': 'Five by five risk heat map', style: narrow ? '' : 'max-width:640px;display:block;margin:0 auto' });
    const gCells = svg('g'), gDots = svg('g');
    S.append(gCells, gDots);
    root.append(el('div', { class: 'w-stage' }, S));
    const detail = el('div', { style: { fontSize: '14px', margin: '6px 0' } });
    const stats = el('div', { class: 'w-stats' });
    const list = el('div', { style: { display: 'grid', gap: '4px', marginTop: '8px' } });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(detail, stats, list, log);
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 14) log.lastChild.remove(); }

    const cellX = (c) => LM + c * CW, cellY = (r) => TM + (4 - r) * CH;   // r = likelihood bucket, 4 at top
    // grid
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const score = (r + 1) * (c + 1);
      const col = score >= 15 ? 'var(--err)' : score >= 8 ? 'var(--warn)' : 'var(--ok)';
      gCells.append(svg('rect', { x: cellX(c) + 1, y: cellY(r) + 1, width: CW - 2, height: CH - 2, rx: 4, fill: col, 'fill-opacity': 0.16, stroke: 'var(--border)' }));
    }
    const lLab = narrow ? ['1', '2', '3', '4', '5'] : ['<5%', '5–20%', '20–50%', '50–80%', '>80%'];
    const iLab = narrow ? ['1', '2', '3', '4', '5'] : ['<$50K', '<$250K', '<$1M', '<$5M', '≥$5M'];
    for (let i = 0; i < 5; i++) {
      gCells.append(svg('text', { x: LM - 5, y: cellY(i) + CH / 2 + FS * 0.35, 'text-anchor': 'end', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: lLab[i] }));
      gCells.append(svg('text', { x: cellX(i) + CW / 2, y: TM + CH * 5 + FS + 4, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: iLab[i] }));
    }
    gCells.append(svg('text', { x: LM + CW * 2.5, y: VH - 4, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:700 ${FS}px var(--sans)`, text: 'Impact →  (likelihood ↑ on the left)' }));
    if (narrow) detail.before(el('p', { class: 'muted', style: { margin: '4px 0 0', fontSize: '13px' }, text: 'Rows: likelihood <5 / 5–20 / 20–50 / 50–80 / >80% per year. Columns: impact <$50K / $250K / $1M / $5M / more.' }));

    function apply(r, kind, quiet) {
      r.p = r.p0; r.imp = r.i0; r.cost = 0; r.resp = kind;
      if (kind === 'mitigate') { r.p = r.p0 * r.mit.p; r.imp = r.i0 * r.mit.i; r.cost = r.mit.c; }
      if (kind === 'transfer') { r.imp = r.i0 * 0.4; r.cost = r.p0 * r.i0 / 100 * 0.35 + 5; }   // insurer takes 60% of the loss; premium ≈ 35% of expected loss + fees (estimate)
      if (kind === 'avoid') { r.p = 0; r.cost = 0.15 * r.i0 / 10; }                         // alternative design, illustrative
      if (!quiet) {
        const b = r.p0 * r.i0 / 100, a = r.p * r.imp / 100;
        say(`<b>${r.id}</b> ${kind}: ${kind === 'mitigate' ? r.mit.a + '. ' : ''}expected loss ${money(b)} → <b>${money(a)}</b>/yr for ${money(r.cost)}/yr. ` +
          (kind === 'transfer' ? 'Likelihood unchanged; users still feel it.' : kind === 'accept' ? 'Recorded with an owner and a trigger.' : (b - a > r.cost ? 'Pays for itself.' : '<b>Costs more than it saves.</b>')));
      }
    }
    function respond(kind) { const r = risks.find((x) => x.id === sel); if (!r) return; apply(r, kind); draw(); }

    function draw() {
      if (my !== gen) return;
      gDots.innerHTML = ''; list.innerHTML = '';
      const vis = risks.filter((r) => filter === 'all' || r.cat === filter);
      const slots = {};
      vis.forEach((r) => {
        if (r.p <= 0) return;
        const c = bucket(r.imp, IB), row = bucket(r.p, LB), key = c + ':' + row, n = (slots[key] = (slots[key] || 0) + 1) - 1;
        const OFF = [[0, 0], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1]][n % 6];
        const x = cellX(c) + CW / 2 + OFF[0] * Math.min(CW * 0.3, DOT * 2 + 2), y = cellY(row) + CH / 2 + OFF[1] * (CH * 0.3) - (n >= 3 ? CH * 0.12 : 0);
        const from = r.x == null ? [x, y] : [r.x, r.y];
        const isSel = r.id === sel;
        const g = svg('g', { style: 'cursor:pointer' });
        const circ = svg('circle', { r: DOT, fill: r.resp === 'accept' ? 'var(--surface-2)' : 'var(--accent)', stroke: isSel ? 'var(--text)' : 'var(--surface)', 'stroke-width': isSel ? 3 : 2 });
        const txt = svg('text', { 'text-anchor': 'middle', y: FS * 0.35, fill: r.resp === 'accept' ? 'var(--text)' : '#fff', style: `font:700 ${FS}px var(--sans)`, text: r.id.slice(1) });
        g.append(circ, txt);
        g.addEventListener('click', () => { sel = r.id; draw(); });
        gDots.append(g);
        const place = (px, py) => g.setAttribute('transform', `translate(${px.toFixed(1)},${py.toFixed(1)})`);
        if (ctx.reduced || (from[0] === x && from[1] === y)) place(x, y);
        else { let t = 0; place(from[0], from[1]); const h = ctx.loop((dt) => { t = Math.min(1, t + dt / 600); const e = 1 - Math.pow(1 - t, 3); place(from[0] + (x - from[0]) * e, from[1] + (y - from[1]) * e); if (t >= 1) h.stop(); }); }
        r.x = x; r.y = y;
      });
      // list (HTML, readable on phones)
      vis.forEach((r) => {
        const b = r.p0 * r.i0 / 100, a = r.p * r.imp / 100;
        const row = el('button', { class: 'btn' + (r.id === sel ? ' primary' : ''), style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', fontSize: '14px' } },
          el('span', { html: `<b>${r.id.slice(1)}</b> ${r.t} <span class="muted">· ${CATS[r.cat]}</span>` }),
          el('span', { style: { fontFamily: 'var(--mono)', fontSize: '13px' }, text: (r.resp ? money(b) + ' → ' + money(a) + ' · ' + r.resp : money(b) + '/yr') }));
        row.addEventListener('click', () => { sel = r.id; draw(); });
        list.append(row);
      });
      const s = risks.find((x) => x.id === sel);
      detail.innerHTML = s ? `Selected <b>${s.id}</b>: ${s.t}. Likelihood <b>${s.p.toFixed(0)}%</b>/yr × impact <b>${money(s.imp)}</b> = <b>${money(s.p * s.imp / 100)}</b>/yr. Mitigation option: ${s.mit.a} (${money(s.mit.c)}/yr).` : '';
      const before = vis.reduce((x, r) => x + r.p0 * r.i0 / 100, 0), after = vis.reduce((x, r) => x + r.p * r.imp / 100, 0), spend = vis.reduce((x, r) => x + r.cost, 0);
      stats.innerHTML = '';
      const add = (k, v) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }));
      add('Expected loss before', money(before) + '/yr');
      add('After responses', money(after) + '/yr');
      add('Response cost', money(spend) + '/yr');
      add('Net benefit', (before - after - spend >= 0 ? '' : '−') + money(Math.abs(before - after - spend)) + '/yr');
      add('Above $100K appetite', vis.filter((r) => r.p * r.imp / 100 > 100).length + ' of ' + vis.length);
    }
    draw();
    say('Tip: <b>4</b> (no token export, 15% × $3M = $450K) and <b>3</b> (bus factor, 35% × $700K = $245K) differ by nearly 2× in expected loss but both land in amber cells (score 8–9). Rank by dollars, not colour.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
