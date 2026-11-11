/* Schema-change checker: apply changes to an Order schema (OpenAPI or Protobuf view), diff against the
   original with standard compatibility rules, then run each consumer's contract against the new schema. */
SD.widget('api-design', function (root, ctx) {
  const { el, svg } = ctx;
  const BASE = () => ({
    fields: [
      { n: 'id', t: 'string', num: 1, req: true },
      { n: 'amount', t: 'integer', num: 2, req: true },
      { n: 'currency', t: 'string', num: 3, req: false },
      { n: 'customer_name', t: 'string', num: 4, req: false },
      { n: 'status', t: 'enum', num: 5, req: false },
      { n: 'note', t: 'string', num: 6, req: false }
    ],
    enumVals: ['PENDING', 'PAID', 'REFUNDED'],
    paths: ['GET /orders', 'POST /orders']
  });
  // Consumer contracts (Pact-style): what each one reads, sends, and which enum values it uses.
  const CONSUMERS = [
    { id: 'mobile', name: 'Mobile 4.2', reads: ['id', 'amount', 'status'], sends: ['amount', 'currency'], usesEnum: ['PENDING', 'PAID', 'REFUNDED'], strictEnum: true, paths: ['GET /orders', 'POST /orders'] },
    { id: 'partner', name: 'Partner ERP', reads: ['id', 'customer_name', 'amount'], sends: ['amount', 'currency', 'customer_name'], usesEnum: ['REFUNDED'], strictEnum: false, paths: ['GET /orders', 'POST /orders'] },
    { id: 'bi', name: 'Analytics', reads: ['id', 'amount', 'currency', 'note'], sends: [], usesEnum: [], strictEnum: false, paths: ['GET /orders'] }
  ];
  const CHANGES = [
    { id: 'add', l: '+ optional field discount', apply: (s) => { if (!s.fields.find((f) => f.n === 'discount')) s.fields.push({ n: 'discount', t: 'integer', num: 7, req: false }); } },
    { id: 'rename', l: 'Rename customer_name → customerName', apply: (s) => { const f = s.fields.find((x) => x.n === 'customer_name'); if (f) { f.n = 'customerName'; f.renamed = 'customer_name'; } } },
    { id: 'type', l: 'amount: integer → string', apply: (s) => { const f = s.fields.find((x) => x.n === 'amount'); if (f) f.t = 'string'; } },
    { id: 'enumrm', l: 'Remove enum REFUNDED', apply: (s) => { s.enumVals = s.enumVals.filter((v) => v !== 'REFUNDED'); } },
    { id: 'enumadd', l: 'Add enum DISPUTED', apply: (s) => { if (!s.enumVals.includes('DISPUTED')) s.enumVals.push('DISPUTED'); } },
    { id: 'req', l: 'Make currency required', apply: (s) => { const f = s.fields.find((x) => x.n === 'currency'); if (f) f.req = true; } },
    { id: 'remove', l: 'Remove field note', apply: (s) => { s.fields = s.fields.filter((x) => x.n !== 'note'); } },
    { id: 'path', l: '+ endpoint GET /orders/{id}/refunds', apply: (s) => { if (!s.paths.includes('GET /refunds')) s.paths.push('GET /refunds'); } }
  ];
  let fmt = 'openapi', applied = [];
  const build = () => { const s = BASE(); applied.forEach((id) => CHANGES.find((c) => c.id === id).apply(s)); return s; };

  // Diff old vs new with the standard rules (oasdiff / buf breaking / AIP-180 style).
  function diff(o, n) {
    const out = [], proto = fmt === 'proto';
    o.fields.forEach((f) => {
      const byName = n.fields.find((x) => x.n === f.n), byNum = n.fields.find((x) => x.num === f.num);
      const m = proto ? byNum : byName;
      if (!m) out.push(['breaking', proto ? `field ${f.n} = ${f.num} removed: add reserved ${f.num}; reserved "${f.n}"` : `response property ${f.n} removed`]);
      else {
        if (m.n !== f.n) out.push(proto ? ['safe', `field ${f.num} renamed ${f.n} → ${m.n}: wire-safe (number unchanged), breaks JSON mapping and generated code`] : ['breaking', `${f.n} renamed: old name gone, same as remove + add`]);
        if (m.t !== f.t) out.push(['breaking', `${f.n} type ${f.t} → ${m.t}: old ${proto ? 'readers mis-decode the wire bytes' : 'clients fail to parse'}`]);
        if (m.req && !f.req) out.push(['breaking', proto ? `${m.n} now validated as required: proto3 has no required, so it is a semantic break` : `request property ${m.n} became required`]);
      }
    });
    n.fields.forEach((f) => { if (!o.fields.find((x) => x.num === f.num)) out.push(['safe', `new optional field ${f.n}${proto ? ' = ' + f.num : ''}: old clients ignore it`]); });
    o.enumVals.forEach((v) => { if (!n.enumVals.includes(v)) out.push(['breaking', `enum value ${v} removed: clients that send or filter by it get errors`]); });
    n.enumVals.forEach((v) => { if (!o.enumVals.includes(v)) out.push(['risky', `enum value ${v} added: safe only for clients that treat enums as open`]); });
    n.paths.forEach((p) => { if (!o.paths.includes(p)) out.push(['safe', `new endpoint ${p === 'GET /refunds' ? 'GET /orders/{id}/refunds' : p}: purely additive`]); });
    return out;
  }
  // Run each consumer's contract against the new schema.
  function verify(c, n) {
    const fails = [], proto = fmt === 'proto', base = BASE();
    c.reads.forEach((r) => {
      const orig = base.fields.find((f) => f.n === r);
      const m = proto ? n.fields.find((f) => f.num === orig.num) : n.fields.find((f) => f.n === r);
      if (!m) fails.push(`reads ${r}: missing`);
      else if (m.t !== orig.t) fails.push(`reads ${r}: expected ${orig.t}, got ${m.t}`);
    });
    n.fields.filter((f) => f.req && f.n !== 'id' && f.n !== 'amount').forEach((f) => {
      if (c.sends.length && !c.sends.includes(f.n) && !(proto && c.sends.includes(f.renamed))) fails.push(`POST without ${f.n}: 400`);
    });
    c.sends.forEach((s) => { if (!proto && !n.fields.find((f) => f.n === s) && base.fields.find((f) => f.n === s)) fails.push(`sends ${s}: ignored, data lost`); });
    c.usesEnum.forEach((v) => { if (!n.enumVals.includes(v)) fails.push(`uses ${v}: rejected`); });
    if (c.strictEnum && c.reads.includes('status')) n.enumVals.forEach((v) => { if (!base.enumVals.includes(v)) fails.push(`strict enum: cannot parse ${v}`); });
    return fails;
  }

  const fmtSeg = el('div', { class: 'seg', role: 'tablist' });
  const btns = el('div', { class: 'w-controls' });
  const stage = el('div', { class: 'w-stage' });
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite', style: { maxHeight: 'none', fontFamily: 'var(--sans)', fontSize: '14px', lineHeight: '1.5' } });
  root.append(el('div', { class: 'w-controls' }, fmtSeg, el('button', { class: 'btn', text: '↺ Reset', onclick: () => { applied = []; render(); } })), btns, stage, stats, log);

  function controls() {
    fmtSeg.innerHTML = '';
    [['openapi', 'OpenAPI / JSON'], ['proto', 'Protobuf']].forEach(([v, l]) => fmtSeg.append(el('button', { class: fmt === v ? 'on' : '', text: l, onclick: () => { fmt = v; render(); } })));
    btns.innerHTML = '';
    CHANGES.forEach((c) => {
      const on = applied.includes(c.id);
      btns.append(el('button', { class: on ? 'btn primary' : 'btn', text: (on ? '✓ ' : '') + c.l, 'aria-pressed': String(on), onclick: () => { applied = on ? applied.filter((x) => x !== c.id) : [...applied, c.id]; render(); } }));
    });
  }

  function draw(n, results) {
    const narrow = ctx.narrow, W = narrow ? 360 : 640, F = narrow ? 14 : 14, RH = 30;
    const rows = n.fields.length + 1;
    const schemaH = 40 + rows * RH;
    const cx = narrow ? 20 : 20, cw = narrow ? 320 : 290;
    const consX = narrow ? [20, 130, 240] : [400, 400, 400], consW = narrow ? 100 : 220;
    const consY = narrow ? CONSUMERS.map(() => schemaH + 28) : CONSUMERS.map((_, i) => 40 + i * 92);
    const H = narrow ? schemaH + 28 + 58 : Math.max(schemaH + 10, 40 + 3 * 92);
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Schema fields and consumer contracts' });
    S.append(svg('text', { x: cx, y: 22, fill: 'var(--text)', style: `font:700 ${F + 1}px var(--sans)`, text: fmt === 'proto' ? 'message Order' : 'Order (schema)' }));
    const pos = {};
    n.fields.forEach((f, i) => {
      const y = 34 + i * RH;
      const orig = BASE().fields.find((o) => o.num === f.num);
      const changed = !orig || orig.n !== f.n || orig.t !== f.t || orig.req !== f.req;
      S.append(svg('rect', { x: cx, y, width: cw, height: RH - 4, rx: 6, fill: changed ? 'color-mix(in srgb, var(--warn) 18%, var(--surface-2))' : 'var(--surface-2)', stroke: 'var(--border)' }));
      const label = fmt === 'proto' ? `${f.t === 'integer' ? 'int64' : f.t === 'enum' ? 'Status' : 'string'} ${f.n} = ${f.num}` : `${f.n}: ${f.t}${f.req ? ' *' : ''}`;
      S.append(svg('text', { x: cx + 8, y: y + 18, fill: 'var(--text)', style: `font:500 ${F}px var(--mono)`, text: label }));
      pos[f.num] = y + (RH - 4) / 2;
    });
    const ey = 34 + n.fields.length * RH;
    S.append(svg('text', { x: cx + 8, y: ey + 18, fill: 'var(--text-3)', style: `font:500 ${F - 1}px var(--mono)`, text: 'enum: ' + n.enumVals.join(' ') }));
    const removed = BASE().fields.filter((o) => !n.fields.find((f) => f.num === o.num));
    CONSUMERS.forEach((c, i) => {
      const x = consX[i], y = consY[i], fails = results[c.id];
      const tone = fails.length ? 'var(--err)' : 'var(--ok)';
      // edges from read fields to the consumer
      c.reads.forEach((r) => {
        const orig = BASE().fields.find((f) => f.n === r);
        const m = n.fields.find((f) => f.num === orig.num);
        const bad = fails.some((t) => t.startsWith('reads ' + r));
        const fy = m ? pos[m.num] : ey + 10;
        if (narrow) { if (m) S.append(svg('text', { x: cx + cw - 66 + i * 24, y: fy + 5, 'text-anchor': 'middle', fill: bad ? 'var(--err)' : 'var(--accent)', style: `font:700 13px var(--sans)`, text: c.name[0] })); return; }
        const sx = cx + cw, sy = fy, tx = x, ty = y + 26;
        S.append(svg('path', { d: `M${sx} ${sy} C${sx + 50} ${sy} ${tx - 50} ${ty} ${tx} ${ty}`, fill: 'none', stroke: bad ? 'var(--err)' : 'var(--border)', 'stroke-width': bad ? 2.5 : 1.5, 'stroke-dasharray': m ? '' : '4 3', opacity: 0.9 }));
      });
      S.append(svg('rect', { x, y, width: consW, height: 52, rx: 10, fill: 'var(--surface)', stroke: tone, 'stroke-width': 2 }));
      S.append(svg('text', { x: x + consW / 2, y: y + 22, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${F}px var(--sans)`, text: narrow ? c.name.split(' ')[0] : c.name }));
      S.append(svg('text', { x: x + consW / 2, y: y + 42, 'text-anchor': 'middle', fill: tone, style: `font:700 ${F}px var(--sans)`, text: fails.length ? `✗ ${fails.length} fail` : '✓ pass' }));
    });
    if (narrow) S.append(svg('text', { x: cx, y: schemaH + 12, fill: 'var(--text-3)', style: `font:500 13px var(--sans)`, text: 'Letters = which consumer reads the field' }));
    if (removed.length && !narrow) S.append(svg('text', { x: cx, y: H - 4, fill: 'var(--err)', style: `font:600 ${F - 1}px var(--sans)`, text: 'removed: ' + removed.map((r) => r.n).join(', ') }));
    stage.innerHTML = ''; stage.append(S);
  }

  function render() {
    controls();
    const n = build(), d = diff(BASE(), n);
    const results = {}; CONSUMERS.forEach((c) => { results[c.id] = verify(c, n); });
    draw(n, results);
    const nb = d.filter((x) => x[0] === 'breaking').length, nr = d.filter((x) => x[0] === 'risky').length, broken = CONSUMERS.filter((c) => results[c.id].length).length;
    stats.innerHTML = '';
    [['Changes', applied.length], ['Breaking (diff)', nb], ['Risky', nr], ['Consumers failing', broken + ' / 3'], ['Release', nb || broken ? 'needs v2 or rework' : 'minor, ship it']].forEach(([l, v]) =>
      stats.append(el('span', { class: 'w-stat', html: `${l}: <b style="color:${l === 'Release' ? (nb || broken ? 'var(--err)' : 'var(--ok)') : 'var(--text)'}">${v}</b>` })));
    const tag = { safe: ['SAFE', 'var(--ok)'], breaking: ['BREAKING', 'var(--err)'], risky: ['RISKY', 'var(--warn)'] };
    let h = '<b>Schema diff</b> (' + (fmt === 'proto' ? 'buf breaking rules: identity is the field number' : 'oasdiff rules: identity is the JSON name') + ')<br>';
    h += d.length ? d.map(([k, t]) => `<span style="color:${tag[k][1]};font-weight:700">${tag[k][0]}</span> ${t}`).join('<br>') : '<span class="muted">No changes yet. Click a change above.</span>';
    h += '<br><br><b>Consumer contract tests</b><br>' + CONSUMERS.map((c) => `<b>${c.name}</b>: ` + (results[c.id].length ? `<span style="color:var(--err)">${results[c.id].join('; ')}</span>` : '<span style="color:var(--ok)">all interactions pass</span>')).join('<br>');
    if (applied.includes('enumadd') && !applied.includes('enumrm')) h += '<br><br><span class="muted">Note: the diff calls a new enum value risky, but only the contract test shows <i>who</i> it breaks: the mobile app parses status strictly.</span>';
    if (applied.includes('rename') && fmt === 'openapi') h += '<br><br><span class="muted">Safe alternative: add <code>customerName</code>, keep <code>customer_name</code> marked deprecated, remove it in the next major.</span>';
    log.innerHTML = h;
  }
  render();
  ctx.onResize(() => render());
});
