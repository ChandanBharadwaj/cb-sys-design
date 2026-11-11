/* CI fitness-function runner: real cycle detection, layer rule, radar Hold list and p95 budget over a sample service. */
SD.widget('architecture-governance', function (root, ctx) {
  const { el, svg } = ctx;
  const RINGS = ['adopt', 'trial', 'assess', 'hold'];
  const PK = { web: [80, 40], app: [80, 120], domain: [80, 200], infra: [280, 200] };
  const LIBS = {
    'spring-web': { at: [280, 40], ring: 'adopt', a: 20 }, resilience4j: { at: [280, 120], ring: 'adopt', a: 330 },
    jackson: { at: [280, 280], ring: 'adopt', a: 275 }, 'joda-time': { at: [80, 280], ring: 'hold', a: 200 },
    opentelemetry: { ring: 'trial', a: 235 }, 'graphql-java': { ring: 'assess', a: 170 }, 'log4j-1.x': { ring: 'hold', a: 140 }
  };
  const BASE = [['web', 'app'], ['app', 'domain'], ['infra', 'domain'], ['app', 'resilience4j'], ['infra', 'resilience4j'], ['web', 'spring-web'], ['infra', 'jackson']];
  const BAD = {
    leak: { l: 'domain → web DTO', e: [['domain', 'web']] },
    cycle: { l: 'app ⇄ infra callback', e: [['app', 'infra'], ['infra', 'app']] },
    joda: { l: 'add Joda-Time', e: [['domain', 'joda-time']] },
    nplus1: { l: 'N+1 query in /orders', e: [] }
  };
  const RULES = [
    { id: 'cycles', t: 'No package cycles' }, { id: 'layer', t: 'domain must not depend on web' },
    { id: 'hold', t: 'No library on Hold in the radar' }, { id: 'p95', t: 'p95 latency ≤ 200 ms' }
  ];
  const DAY = 864e5;
  const st = { bad: {}, waivers: {}, offset: 0 };
  const today = () => { const d = new Date(Date.now() + st.offset * DAY); d.setHours(0, 0, 0, 0); return d; };
  const iso = (d) => d.toISOString().slice(0, 10);

  function edges() { let e = BASE.slice(); Object.keys(st.bad).forEach((k) => { if (st.bad[k]) e = e.concat(BAD[k].e); }); return e; }
  // Tarjan's strongly connected components over package nodes only
  function cycles(E) {
    const adj = {}; Object.keys(PK).forEach((n) => (adj[n] = []));
    E.forEach(([a, b]) => { if (PK[a] && PK[b]) adj[a].push(b); });
    let idx = 0; const I = {}, L = {}, on = {}, S = [], out = [];
    function sc(v) {
      I[v] = L[v] = idx++; S.push(v); on[v] = true;
      adj[v].forEach((w) => { if (I[w] === undefined) { sc(w); L[v] = Math.min(L[v], L[w]); } else if (on[w]) L[v] = Math.min(L[v], I[w]); });
      if (L[v] === I[v]) { const c = []; let w; do { w = S.pop(); on[w] = false; c.push(w); } while (w !== v); if (c.length > 1) out.push(c); }
    }
    Object.keys(adj).forEach((v) => { if (I[v] === undefined) sc(v); });
    return out;
  }
  function p95() {
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const xs = [];
    for (let i = 0; i < 400; i++) {
      let ms = 40 + (-Math.log(1 - r())) * 35;           // service time ~ exponential tail
      if (st.bad.nplus1) ms += Math.floor(r() * 12) * 18;  // 0–11 extra queries × 18 ms
      xs.push(ms);
    }
    xs.sort((a, b) => a - b);
    return xs[Math.ceil(0.95 * xs.length) - 1];
  }
  function evaluate() {
    const E = edges(), res = {};
    const cyc = cycles(E);
    res.cycles = { fail: cyc.length > 0, msg: cyc.length ? 'Cycle: ' + cyc.map((c) => c.reverse().concat(c[0]).join(' → ')).join('; ') : 'slices are free of cycles', bad: E.filter(([a, b]) => cyc.some((c) => c.includes(a) && c.includes(b))) };
    const leak = E.filter(([a, b]) => a === 'domain' && b === 'web');
    res.layer = { fail: leak.length > 0, msg: leak.length ? 'Layer "Domain" may not access "Web": OrderPolicy → web.OrderDto' : 'layers respected', bad: leak };
    const hold = E.filter(([, b]) => LIBS[b] && LIBS[b].ring === 'hold');
    res.hold = { fail: hold.length > 0, msg: hold.length ? [...new Set(hold.map((e) => e[1]))].join(', ') + ' is on Hold: migrate or file a waiver' : 'no Hold-ring dependency', bad: hold };
    const p = p95();
    res.p95 = { fail: p > 200, msg: 'p95 = ' + Math.round(p) + ' ms over 400 sampled requests (budget 200)', bad: [], val: p };
    RULES.forEach((R) => {
      const w = st.waivers[R.id], r = res[R.id];
      r.status = !r.fail ? 'pass' : w && new Date(w) >= today() ? 'waived' : 'fail';
      if (r.fail && w) r.msg += r.status === 'waived' ? ` · waiver until ${w} (${Math.round((new Date(w) - today()) / DAY)} d left)` : ` · waiver EXPIRED ${w}`;
    });
    return res;
  }

  function build(narrow) {
    root.innerHTML = '';
    const F = 14, F2 = 13;
    const badBtns = Object.keys(BAD).map((k) => {
      const b = el('button', { class: 'btn', text: '＋ ' + BAD[k].l });
      b.onclick = () => { st.bad[k] = !st.bad[k]; paint(); };
      b._k = k; return b;
    });
    const reset = el('button', { class: 'btn', text: '⟲ Revert all' });
    reset.onclick = () => { st.bad = {}; paint(); };
    root.append(el('div', { class: 'w-controls' }, ...badBtns, reset));

    const ruleSel = el('select', { 'aria-label': 'Rule to waive' });
    RULES.forEach((R) => ruleSel.append(el('option', { value: R.id, text: R.t })));
    const date = el('input', { type: 'date', 'aria-label': 'Waiver expiry' });
    date.value = iso(new Date(today().getTime() + 30 * DAY));
    const grant = el('button', { class: 'btn primary', text: 'Grant waiver' });
    grant.onclick = () => { if (date.value) st.waivers[ruleSel.value] = date.value; paint(); };
    const revoke = el('button', { class: 'btn', text: 'Revoke' });
    revoke.onclick = () => { delete st.waivers[ruleSel.value]; paint(); };
    const clock = el('button', { class: 'btn', text: '⏩ +30 days' });
    clock.onclick = () => { st.offset += 30; paint(); };
    const dayLbl = el('span', { class: 'muted', style: { fontSize: '13px' } });
    root.append(el('div', { class: 'w-controls' }, el('label', null, 'Waive ', ruleSel), el('label', null, 'until ', date), grant, revoke, clock, dayLbl));

    const wrap = el('div', { style: { display: 'flex', flexDirection: narrow ? 'column' : 'row', gap: '12px' } });
    const G = svg('svg', { viewBox: '0 0 360 320', role: 'img', 'aria-label': 'Dependency graph of the sample service', style: narrow ? 'width:100%' : 'flex:1 1 0;min-width:0' });
    const R = svg('svg', { viewBox: '0 0 360 360', role: 'img', 'aria-label': 'Tech radar', style: narrow ? 'width:100%;max-width:360px;align-self:center' : 'flex:1 1 0;min-width:0;max-width:420px' });
    wrap.append(G, R); root.append(wrap);
    const legend = el('p', { class: 'muted', style: { margin: '6px 0', fontSize: '13px' } });
    const list = el('div', { class: 'w-log' });
    const stats = el('div', { class: 'w-stats' });
    root.append(legend, stats, list);

    G.append(svg('defs', null, svg('marker', { id: 'agArr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'context-stroke' }))));
    const gE = svg('g'), gN = svg('g'); G.append(gE, gN);
    const pos = (n) => PK[n] || LIBS[n].at;

    function paint() {
      const res = evaluate(), E = edges();
      badBtns.forEach((b) => b.classList.toggle('primary', !!st.bad[b._k]));
      dayLbl.textContent = 'today: ' + iso(today());
      const badSet = new Map();
      RULES.forEach((Rl) => res[Rl.id].bad.forEach(([a, b]) => badSet.set(a + '>' + b, res[Rl.id].status)));
      gE.innerHTML = ''; gN.innerHTML = '';
      E.forEach(([a, b]) => {
        const [x0, y0] = pos(a), [x1, y1] = pos(b);
        let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        if (a === 'domain' && b === 'web') cx = -60;
        else if ((a === 'app' && b === 'infra') || (a === 'infra' && b === 'app')) { const s = a === 'app' ? 1 : -1; cx += 22 * s; cy -= 30 * s; }
        // shorten to box edge
        const dx = x1 - cx, dy = y1 - cy, k = Math.min(Math.abs(dx) > 0.1 ? 50 / Math.abs(dx) : 9, Math.abs(dy) > 0.1 ? 19 / Math.abs(dy) : 9, 1);
        const ex = x1 - dx * k, ey = y1 - dy * k;
        const s = badSet.get(a + '>' + b), col = s === 'fail' ? 'var(--err)' : s === 'waived' ? 'var(--warn)' : 'var(--text-3)';
        gE.append(svg('path', { d: `M${x0},${y0} Q${cx},${cy} ${ex},${ey}`, fill: 'none', stroke: col, 'stroke-width': s ? 2.6 : 1.5, 'stroke-dasharray': s === 'waived' ? '5 4' : null, 'marker-end': 'url(#agArr)' }));
      });
      const used = new Set(E.map((e) => e[1]).filter((n) => LIBS[n]));
      const nodes = Object.keys(PK).concat([...used]);
      nodes.forEach((n) => {
        const [x, y] = pos(n), lib = !PK[n];
        let tone = null;
        E.forEach(([a, b]) => { const s = badSet.get(a + '>' + b); if (s && (a === n || b === n)) tone = tone === 'fail' ? 'fail' : s; });
        const stroke = tone === 'fail' ? 'var(--err)' : tone === 'waived' ? 'var(--warn)' : lib ? 'var(--border)' : 'var(--accent)';
        gN.append(svg('rect', { x: x - 50, y: y - 18, width: 100, height: 36, rx: lib ? 18 : 6, fill: 'var(--surface-2)', stroke, 'stroke-width': tone ? 2.5 : 1.5 }));
        gN.append(svg('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': lib ? F2 : F, 'font-weight': lib ? 500 : 700, fill: 'var(--text)', text: n.length > 12 ? n.slice(0, 11) + '…' : n }));
      });
      if (st.bad.nplus1) gN.append(svg('text', { x: 180, y: 314, 'text-anchor': 'middle', 'font-size': F2, fill: res.p95.status === 'pass' ? 'var(--text-3)' : 'var(--err)', text: 'N+1: up to 11 extra queries' }));
      legend.innerHTML = 'Boxes = packages, pills = libraries. <b style="color:var(--err)">Red</b> = failing rule, <b style="color:var(--warn)">amber dashed</b> = allowed by a valid waiver.';
      paintRadar(used);
      const fails = RULES.filter((Rl) => res[Rl.id].status === 'fail').length, waived = RULES.filter((Rl) => res[Rl.id].status === 'waived').length;
      stats.innerHTML = '';
      [['Build', fails ? '✗ FAILED' : waived ? '⚠ passed with waivers' : '✓ green'], ['Rules passing', (RULES.length - fails - waived) + ' / ' + RULES.length], ['Open waivers', String(Object.keys(st.waivers).length)], ['p95', Math.round(res.p95.val) + ' ms']]
        .forEach(([k, v]) => stats.append(el('div', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
      list.innerHTML = RULES.map((Rl) => { const r = res[Rl.id]; const ic = r.status === 'pass' ? '✓' : r.status === 'waived' ? '⚠' : '✗'; const c = r.status === 'pass' ? 'var(--ok)' : r.status === 'waived' ? 'var(--warn)' : 'var(--err)'; return `<div><b style="color:${c}">${ic} ${Rl.t}</b>: ${r.msg}</div>`; }).join('');
    }

    function paintRadar(used) {
      R.innerHTML = '';
      const C = 180, RR = [68, 108, 142, 174];
      for (let i = 3; i >= 0; i--) R.append(svg('circle', { cx: C, cy: C, r: RR[i], fill: i === 3 ? 'var(--surface-2)' : 'none', stroke: 'var(--border)', 'stroke-width': 1.2 }));
      R.append(svg('line', { x1: 8, y1: C, x2: 352, y2: C, stroke: 'var(--border)' }), svg('line', { x1: C, y1: 8, x2: C, y2: 352, stroke: 'var(--border)' }));
      RINGS.forEach((rn, i) => R.append(svg('text', { x: C - 6, 'text-anchor': 'end', y: C - (i ? RR[i - 1] : 0) - 8, 'font-size': F2, fill: 'var(--text-3)', 'font-weight': 600, text: rn[0].toUpperCase() + rn.slice(1) })));
      Object.keys(LIBS).forEach((n, idx) => {
        const L = LIBS[n], i = RINGS.indexOf(L.ring), r = ((i ? RR[i - 1] : 20) + RR[i]) / 2, a = L.a * Math.PI / 180;
        const x = C + r * Math.cos(a), y = C - r * Math.sin(a);
        const g = svg('g', { style: 'cursor:pointer', onclick: () => { L.ring = RINGS[(i + 1) % 4]; paint(); } });
        const hot = used.has(n) && L.ring === 'hold';
        g.append(svg('circle', { cx: x, cy: y, r: 13, fill: hot ? 'var(--err)' : used.has(n) ? 'var(--accent)' : 'var(--surface)', stroke: L.ring === 'hold' ? 'var(--err)' : 'var(--accent)', 'stroke-width': 2 }));
        g.append(svg('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': F, 'font-weight': 700, fill: used.has(n) ? '#fff' : 'var(--text)', text: String(idx + 1) }));
        g.append(svg('title', { text: `${n}: ${L.ring} (tap to move)` }));
        R.append(g);
      });
      legend.innerHTML += '<br>Radar (tap a blip to move it outward): ' + Object.keys(LIBS).map((n, i) => `<b>${i + 1}</b> ${n} <i>(${LIBS[n].ring}${used.has(n) ? ', used' : ''})</i>`).join(' · ');
    }
    paint();
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
