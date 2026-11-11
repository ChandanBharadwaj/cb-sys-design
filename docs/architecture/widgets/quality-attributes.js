/* Utility tree builder: attributes -> refinements -> scenarios rated (importance, difficulty).
   A 3x3 grid places each scenario; (H,H) is analysed first. Selecting a design decision classifies it
   as a sensitivity point (one attribute) or a trade-off point (helps one attribute, hurts another). */
SD.widget('quality-attributes', function (root, ctx) {
  const { el, svg } = ctx;
  const LV = ['L', 'M', 'H'], W = { H: 3, M: 2, L: 1 };
  const ATTR = {
    performance: { short: 'P', col: 'var(--accent)' },
    availability: { short: 'A', col: 'var(--ok)' },
    security: { short: 'S', col: 'var(--err)' },
    modifiability: { short: 'M', col: 'var(--warn)' },
    cost: { short: 'C', col: 'var(--text-3)' }
  };
  const SC = [
    { id: 'P1', attr: 'performance', ref: 'latency', text: 'Checkout at 2,000 req/s: p99 ≤ 300 ms', imp: 'H', dif: 'H' },
    { id: 'P2', attr: 'performance', ref: 'throughput', text: 'Nightly export of 50 M rows finishes in ≤ 1 h', imp: 'M', dif: 'M' },
    { id: 'A1', attr: 'availability', ref: 'failover', text: 'Primary DB dies at peak: recover ≤ 30 s, 0 orders lost', imp: 'H', dif: 'H' },
    { id: 'A2', attr: 'availability', ref: 'dependency', text: 'Fraud service down: checkout still accepts orders', imp: 'H', dif: 'M' },
    { id: 'S1', attr: 'security', ref: 'revocation', text: 'Revoked credential rejected within 60 s', imp: 'H', dif: 'M' },
    { id: 'S2', attr: 'security', ref: 'confidentiality', text: 'Card data never readable on internal network hops', imp: 'H', dif: 'L' },
    { id: 'M1', attr: 'modifiability', ref: 'new provider', text: 'Add a payment provider in ≤ 2 weeks, 1 team', imp: 'M', dif: 'L' },
    { id: 'C1', attr: 'cost', ref: 'unit cost', text: 'Infra cost ≤ $0.40 per 1,000 orders at 2× load', imp: 'M', dif: 'H' }
  ];
  const POOL = [
    { id: 'P3', attr: 'performance', ref: 'search', text: 'Product search p95 ≤ 150 ms during a sale', imp: 'M', dif: 'H' },
    { id: 'A3', attr: 'availability', ref: 'region', text: 'Region outage: serve reads in ≤ 5 min', imp: 'L', dif: 'H' },
    { id: 'M2', attr: 'modifiability', ref: 'deploy', text: 'One team deploys without others in ≤ 1 h', imp: 'H', dif: 'M' }
  ];
  const DEC = [
    { id: 'jwt', name: 'Local JWT validation (5-min TTL)', eff: { P1: '+', A2: '+', S1: '-' } },
    { id: 'mtls', name: 'mTLS on every internal hop', eff: { S2: '+', P1: '-', C1: '-' } },
    { id: 'sync', name: 'Synchronous DB replication', eff: { A1: '+', P1: '-', C1: '-' } },
    { id: 'cache', name: 'Cache-aside for catalogue (TTL 60 s)', eff: { P1: '+', C1: '+' } },
    { id: 'port', name: 'Payment provider behind a port/adapter', eff: { M1: '+' } }
  ];
  let sel = null, gen = 0;

  function classify(d) {
    const by = {};
    Object.entries(d.eff).forEach(([sid, sign]) => {
      const s = SC.find((x) => x.id === sid); if (!s) return;
      (by[s.attr] = by[s.attr] || new Set()).add(sign);
    });
    const attrs = Object.keys(by);
    const signs = new Set(attrs.flatMap((a) => [...by[a]]));
    const kind = attrs.length > 1 && signs.has('+') && signs.has('-') ? 'trade-off point' : 'sensitivity point';
    return { kind, attrs, by };
  }

  function build(narrow) {
    const my = ++gen;
    root.innerHTML = '';
    const VW = narrow ? 360 : 460, VH = narrow ? 340 : 360, FS = narrow ? 14 : 14;
    const L = narrow ? 64 : 76, T = 14, B = 46, R = 8;
    const CW = (VW - L - R) / 3, CH = (VH - T - B) / 3;

    const ctl = el('div', { class: 'w-controls' }, el('b', { text: 'Design decision:' }));
    const dBtns = DEC.map((d) => {
      const b = el('button', { class: 'btn' + (sel === d.id ? ' primary' : ''), text: d.name });
      b.addEventListener('click', () => { sel = sel === d.id ? null : d.id; dBtns.forEach((x, i) => x.classList.toggle('primary', DEC[i].id === sel)); render(); if (sel) explain(d); });
      return b;
    });
    ctl.append(...dBtns);
    const add = el('button', { class: 'btn', text: '+ Add a scenario' });
    add.addEventListener('click', () => {
      const n = POOL.shift(); if (!n) { say('No more sample scenarios. Re-rate the existing ones.'); return; }
      SC.push(n); say(`Added <b>${n.id}</b>: ${n.text} <b>(${n.imp},${n.dif})</b>.`); render();
      if (!POOL.length) add.disabled = true;
    });
    if (!POOL.length) add.disabled = true;
    ctl.append(add);
    root.append(ctl);

    const S = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': 'Importance by difficulty grid', style: narrow ? '' : 'max-width:560px;display:block;margin:0 auto' });
    const gGrid = svg('g'), gDots = svg('g');
    S.append(gGrid, gDots);
    root.append(el('div', { class: 'w-stage' }, S));
    const stats = el('div', { class: 'w-stats' });
    const tree = el('div', { style: { marginTop: '10px', display: 'grid', gap: '8px' } });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, tree, log);
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 12) log.lastChild.remove(); }

    const cx = (d) => L + LV.indexOf(d) * CW, cy = (i) => T + (2 - LV.indexOf(i)) * CH;
    const txt = (x, y, t, o = {}) => svg('text', Object.assign({ x, y, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: t }, o));
    // grid
    LV.forEach((imp) => LV.forEach((dif) => {
      const hh = imp === 'H' && dif === 'H';
      gGrid.append(svg('rect', { x: cx(dif) + 2, y: cy(imp) + 2, width: CW - 4, height: CH - 4, rx: 8,
        fill: hh ? 'color-mix(in srgb, var(--err) 14%, transparent)' : 'var(--surface-2)', stroke: hh ? 'var(--err)' : 'var(--border)', 'stroke-width': hh ? 2 : 1 }));
    }));
    gGrid.append(txt(cx('H') + CW / 2, cy('H') + 18, 'analyse first', { fill: 'var(--err)', style: `font:700 ${FS - 1}px var(--sans)` }));
    LV.forEach((v) => {
      gGrid.append(txt(cx(v) + CW / 2, VH - B + 20, v));
      gGrid.append(txt(L - 14, cy(v) + CH / 2 + 5, v));
    });
    gGrid.append(txt(L + (VW - L - R) / 2, VH - 6, 'Difficulty (architect) →'));
    gGrid.append(txt(18, T + (VH - T - B) / 2, 'Importance →', { transform: `rotate(-90 18 ${T + (VH - T - B) / 2})` }));

    function render() {
      if (my !== gen) return;
      const d = sel ? DEC.find((x) => x.id === sel) : null;
      const cls = d ? classify(d) : null;
      gDots.innerHTML = '';
      const cells = {};
      SC.forEach((s) => { const k = s.imp + s.dif; (cells[k] = cells[k] || []).push(s); });
      Object.values(cells).forEach((list) => list.forEach((s, i) => {
        const per = 3, r = narrow ? 16 : 17, gap = r * 2 + 6;
        const col = i % per, row = Math.floor(i / per);
        const n = Math.min(per, list.length);
        const x = cx(s.dif) + CW / 2 + (col - (n - 1) / 2) * gap;
        const y = cy(s.imp) + CH / 2 + (s.imp === 'H' && s.dif === 'H' ? 10 : 0) + (row - (Math.ceil(list.length / per) - 1) / 2) * gap;
        const e = d && d.eff[s.id];
        const g = svg('g', { style: { cursor: 'pointer' } });
        g.append(svg('circle', { cx: x, cy: y, r, fill: ATTR[s.attr].col, opacity: d && !e ? 0.25 : 1,
          stroke: e ? (e === '+' ? 'var(--ok)' : 'var(--err)') : 'var(--surface)', 'stroke-width': e ? 4 : 2 }));
        g.append(svg('text', { x, y: y + 5, 'text-anchor': 'middle', fill: '#fff', style: `font:700 ${FS}px var(--sans)`, text: s.id, opacity: d && !e ? 0.5 : 1 }));
        if (e) g.append(svg('text', { x: x + r - 1, y: y - r + 4, 'text-anchor': 'middle', fill: e === '+' ? 'var(--ok)' : 'var(--err)', style: `font:800 ${FS + 2}px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:4px`, text: e === '+' ? '+' : '−' }));
        g.addEventListener('click', () => cycle(s, 'imp'));
        gDots.append(g);
      }));

      // ranked tree in HTML
      tree.innerHTML = '';
      const ranked = SC.slice().sort((a, b) => (W[b.imp] * 10 + W[b.dif]) - (W[a.imp] * 10 + W[a.dif]));
      const byAttr = {};
      ranked.forEach((s) => (byAttr[s.attr] = byAttr[s.attr] || []).push(s));
      Object.keys(ATTR).filter((a) => byAttr[a]).forEach((a) => {
        const box = el('div', { style: { borderLeft: `4px solid ${ATTR[a].col}`, paddingLeft: '8px' } },
          el('div', { style: { fontWeight: '700', fontSize: '14px', textTransform: 'capitalize' }, text: 'Utility → ' + a + (cls && cls.attrs.includes(a) ? '  ·  affected ' + [...cls.by[a]].join('/') : '') }));
        byAttr[a].forEach((s) => {
          const e = d && d.eff[s.id];
          const chip = (k, lab) => { const b = el('button', { class: 'btn' + (s[k] === 'H' ? ' primary' : ''), style: { padding: '2px 8px', fontSize: '13px' }, text: lab + ':' + s[k] }); b.addEventListener('click', () => cycle(s, k)); return b; };
          box.append(el('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', padding: '4px 0', fontSize: '14px', borderBottom: '1px dashed var(--border)', background: e ? (e === '+' ? 'color-mix(in srgb, var(--ok) 12%, transparent)' : 'color-mix(in srgb, var(--err) 12%, transparent)') : '' } },
            el('b', { text: s.id, style: { minWidth: '26px' } }),
            el('span', { style: { flex: '1 1 180px' }, html: `<i>${s.ref}</i>: ${s.text}` + (s.imp === 'H' && s.dif === 'H' ? ' <b style="color:var(--err)">(H,H)</b>' : '') }),
            chip('imp', 'Imp'), chip('dif', 'Diff')));
        });
        tree.append(box);
      });

      const hh = SC.filter((s) => s.imp === 'H' && s.dif === 'H').length;
      const hm = SC.filter((s) => (s.imp === 'H') !== (s.dif === 'H') && (s.imp !== 'L' && s.dif !== 'L')).length;
      stats.innerHTML = '';
      const st = (k, v) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }));
      st('Scenarios', SC.length); st('(H,H) analyse first', hh); st('(H,M)/(M,H) next', hm);
      st('Ranking', hh / SC.length > 0.34 ? '⚠ too many (H,H)' : '✓ discriminating');
      if (cls) st('Decision is a', cls.kind === 'trade-off point' ? '⚖ trade-off point' : '◎ sensitivity point');
    }

    function cycle(s, k) {
      s[k] = LV[(LV.indexOf(s[k]) + 1) % 3];
      say(`<b>${s.id}</b> ${k === 'imp' ? 'importance' : 'difficulty'} → <b>${s[k]}</b>. Now (${s.imp},${s.dif})` + (s.imp === 'H' && s.dif === 'H' ? ': joins the analyse-first cell.' : '.'));
      render();
    }
    function explain(d) {
      const c = classify(d);
      const parts = c.attrs.map((a) => `${a} ${[...c.by[a]].map((x) => x === '+' ? '↑' : '↓').join('')}`).join(', ');
      say(c.kind === 'trade-off point'
        ? `<b>${d.name}</b> is a <b>trade-off point</b>: ${parts}. Record it in an ADR and say what you gave up.`
        : `<b>${d.name}</b> is a <b>sensitivity point</b> for ${parts}: the response depends on it, but it does not trade one attribute against another.`);
    }

    render();
    say('Tap a dot to raise its importance, or use the <b>Imp</b>/<b>Diff</b> chips. Then pick a design decision to see which scenarios it helps (+) and hurts (−).');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
