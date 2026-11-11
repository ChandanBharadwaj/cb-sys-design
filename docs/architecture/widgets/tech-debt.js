/* Hotspot map: treemap of modules (area = LOC, colour = churn x complexity), a paydown plan,
   and a 12-sprint simulation of interest (time lost) and feature throughput with vs without the plan. */
SD.widget('tech-debt', function (root, ctx) {
  const { el, svg } = ctx;
  const TEAM = 8, COST = 0.05, K = 0.045, FLOOR_CX = 2, SPR = 12;
  // name, kLOC, commits in last 90 days, complexity 1-10 (illustrative codebase)
  const BASE = [
    ['checkout', 38, 140, 8.5], ['pricing', 22, 120, 9], ['orders', 30, 80, 6.5], ['legacy-reports', 64, 4, 9.5],
    ['auth', 12, 25, 4], ['search', 26, 45, 5.5], ['inventory', 20, 60, 7], ['payments', 18, 55, 6],
    ['notifications', 9, 30, 3.5], ['admin-ui', 34, 20, 7.5], ['shipping', 16, 40, 5], ['tax', 14, 70, 8],
    ['catalog', 24, 35, 4.5], ['user-profile', 8, 15, 3], ['import-jobs', 28, 6, 8]
  ];
  const plan = new Set();
  let gen = 0, loopH = null, res = null, shown = SPR;
  const sumC = BASE.reduce((a, m) => a + m[2], 0);
  const score = (m) => (m[2] / 140) * (m[3] / 10);

  function simulate(paid) {
    let mods = BASE.map((m) => ({ n: m[0], share: m[2] / sumC, cx: m[3] }));
    const out = [];
    for (let s = 1; s <= SPR; s++) {
      const interest = Math.min(0.75, K * mods.reduce((a, m) => a + m.share * m.cx, 0));
      const active = mods.filter((m) => paid.has(m.n) && m.cx > FLOOR_CX + 0.01);
      const alloc = active.length * COST;
      out.push({ interest, alloc, feat: TEAM * Math.max(0, 1 - interest - alloc) });
      mods = mods.map((m) => paid.has(m.n) && m.cx > FLOOR_CX ? { ...m, cx: Math.max(FLOOR_CX, m.cx - 1.5) }
        : { ...m, cx: Math.min(10, m.cx + 0.05 + m.share * 2) });   // untouched code decays faster where it changes most
    }
    return out;
  }

  // Simple slice-and-dice treemap: split the sorted list into two halves by weight, alternate direction.
  function layout(items, x, y, w, h, out) {
    if (!items.length) return out;
    if (items.length === 1) { out.push({ m: items[0], x, y, w, h }); return out; }
    const tot = items.reduce((a, m) => a + m[1], 0);
    let acc = 0, i = 0;
    while (i < items.length - 1 && acc + items[i][1] <= tot / 2) acc += items[i++][1];
    if (i === 0) acc = items[i++][1];
    const f = acc / tot, A = items.slice(0, i), B = items.slice(i);
    if (w >= h) { layout(A, x, y, w * f, h, out); layout(B, x + w * f, y, w * (1 - f), h, out); }
    else { layout(A, x, y, w, h * f, out); layout(B, x, y + h * f, w, h * (1 - f), out); }
    return out;
  }
  const heat = (v) => { const t = Math.min(1, v / 0.75); return `hsl(${Math.round(130 - 130 * t)} 65% ${Math.round(52 - 8 * t)}%)`; };

  function build(narrow) {
    const my = ++gen;
    if (loopH) loopH.stop();
    root.innerHTML = '';
    const VW = narrow ? 360 : 600, TH = narrow ? 300 : 280, FS = narrow ? 13 : 13;

    const ctl = el('div', { class: 'w-controls' });
    const bTop = el('button', { class: 'btn', text: 'Top 3 hotspots' });
    const bBig = el('button', { class: 'btn', text: '3 biggest modules' });
    const bClear = el('button', { class: 'btn', text: 'Clear plan' });
    const bRun = el('button', { class: 'btn primary', text: '▶ Run 12 sprints' });
    ctl.append(bTop, bBig, bClear, bRun);
    root.append(ctl);

    const stage = el('div', { class: 'w-stage' });
    const S = svg('svg', { viewBox: `0 0 ${VW} ${TH}`, role: 'img', 'aria-label': 'Treemap of modules by size and hotspot score', style: narrow ? '' : 'max-width:760px;display:block;margin:0 auto' });
    stage.append(S);
    stage.append(el('p', { class: 'muted', style: { margin: '6px 0 8px', fontSize: '13px' }, html: 'Area = lines of code · colour = hotspot score (<b style="color:hsl(130 65% 45%)">■</b> cold → <b style="color:hsl(0 65% 45%)">■</b> hot) · ✚ = in paydown plan. Tap a box to add or remove it.' }));
    const CH = narrow ? 210 : 200;
    const C = svg('svg', { viewBox: `0 0 ${VW} ${CH}`, role: 'img', 'aria-label': 'Feature throughput per sprint', style: narrow ? '' : 'max-width:760px;display:block;margin:0 auto' });
    stage.append(C);
    stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b style="color:var(--accent)">━</b> with plan · <b style="color:var(--err)">┅</b> no paydown. Engineers\' worth of feature work per sprint (team of 8). Illustrative model.' }));
    root.append(stage);
    const stats = el('div', { class: 'w-stats' });
    root.append(stats);
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(log);
    const say = (t) => { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 12) log.lastChild.remove(); };

    function drawMap() {
      S.innerHTML = '';
      const items = BASE.slice().sort((a, b) => b[1] - a[1]);
      const cells = layout(items, 2, 2, VW - 4, TH - 4, []);
      cells.forEach((c) => {
        const m = c.m, sc = score(m), on = plan.has(m[0]);
        const g = svg('g', { style: 'cursor:pointer' });
        g.append(svg('rect', { x: c.x + 1, y: c.y + 1, width: Math.max(0, c.w - 2), height: Math.max(0, c.h - 2), rx: 4, fill: heat(sc), stroke: on ? 'var(--text)' : 'var(--surface)', 'stroke-width': on ? 3 : 1.5 }));
        const fits = c.w > (narrow ? 70 : 76) && c.h > 34;
        if (fits) {
          const name = m[0].length * FS * 0.58 > c.w - 10 ? m[0].slice(0, Math.max(3, Math.floor((c.w - 10) / (FS * 0.58)) - 1)) + '…' : m[0];
          g.append(svg('text', { x: c.x + 6, y: c.y + FS + 5, fill: '#fff', style: `font:700 ${FS}px var(--sans);paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:3px`, text: (on ? '✚ ' : '') + name }));
          if (c.h > 56) g.append(svg('text', { x: c.x + 6, y: c.y + 2 * FS + 10, fill: '#fff', style: `font:600 ${FS}px var(--mono);paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:3px`, text: m[2] + ' commits' }));
        } else if (c.w > 22 && c.h > 22) {
          g.append(svg('text', { x: c.x + c.w / 2, y: c.y + c.h / 2 + FS * 0.35, 'text-anchor': 'middle', fill: '#fff', style: `font:700 ${FS}px var(--sans)`, text: on ? '✚' : m[0][0].toUpperCase() }));
        }
        g.append(svg('title', { text: `${m[0]}: ${m[1]}K LOC, ${m[2]} commits/90d, complexity ${m[3]}, hotspot ${sc.toFixed(2)}` }));
        g.addEventListener('click', () => {
          if (plan.has(m[0])) plan.delete(m[0]); else plan.add(m[0]);
          say((plan.has(m[0]) ? 'Added <b>' : 'Removed <b>') + m[0] + '</b> (' + m[1] + 'K LOC, ' + m[2] + ' commits, hotspot ' + sc.toFixed(2) + ').');
          update(false);
        });
        S.append(g);
      });
    }

    function drawChart() {
      C.innerHTML = '';
      const L = narrow ? 34 : 38, R = 10, T = 12, B = 26, PW = VW - L - R, PH = CH - T - B;
      const X = (i) => L + (i / (SPR - 1)) * PW, Y = (v) => T + PH - (v / TEAM) * PH;
      [0, 4, 8].forEach((v) => {
        C.append(svg('line', { x1: L, x2: VW - R, y1: Y(v), y2: Y(v), stroke: 'var(--border)', 'stroke-dasharray': v ? '3 4' : '' }));
        C.append(svg('text', { x: L - 5, y: Y(v) + 5, 'text-anchor': 'end', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--mono)`, text: v }));
      });
      [1, 4, 8, 12].forEach((s) => C.append(svg('text', { x: X(s - 1), y: CH - 7, 'text-anchor': s === 12 ? 'end' : s === 1 ? 'start' : 'middle', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: 'S' + s })));
      const n = Math.max(1, Math.min(SPR, Math.floor(shown)));
      const line = (arr, col, dash) => C.append(svg('polyline', { points: arr.slice(0, n).map((r, i) => X(i).toFixed(1) + ',' + Y(r.feat).toFixed(1)).join(' '), fill: 'none', stroke: col, 'stroke-width': 3, 'stroke-dasharray': dash || '', 'stroke-linejoin': 'round' }));
      line(res.none, 'var(--err)', '6 5');
      line(res.plan, 'var(--accent)');
    }

    function update(animate) {
      if (my !== gen) return;
      res = { none: simulate(new Set()), plan: simulate(plan) };
      drawMap();
      shown = animate && !ctx.reduced ? 1 : SPR;
      drawChart();
      const tot = (a) => a.reduce((x, r) => x + r.feat, 0);
      const tn = tot(res.none), tp = tot(res.plan);
      let be = null, cn = 0, cp = 0;
      for (let i = 0; i < SPR; i++) { cn += res.none[i].feat; cp += res.plan[i].feat; if (be === null && i > 0 && cp >= cn && plan.size) be = i + 1; }
      stats.innerHTML = '';
      const add = (k, v) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }));
      add('Plan', plan.size ? plan.size + ' modules · ' + Math.round(res.plan[0].alloc * 100) + '% capacity' : 'none');
      add('Interest S1 → S12', Math.round(res.plan[0].interest * 100) + '% → ' + Math.round(res.plan[SPR - 1].interest * 100) + '% (no paydown: ' + Math.round(res.none[SPR - 1].interest * 100) + '%)');
      add('Features over 12 sprints', tp.toFixed(1) + ' vs ' + tn.toFixed(1) + ' (' + (tp >= tn ? '+' : '') + ((tp - tn) / tn * 100).toFixed(0) + '%)');
      add('Break-even', !plan.size ? '—' : be ? 'sprint ' + be : 'not in 12 sprints');
    }

    bTop.addEventListener('click', () => { plan.clear(); BASE.slice().sort((a, b) => score(b) - score(a)).slice(0, 3).forEach((m) => plan.add(m[0])); say('Plan = top 3 by <b>churn × complexity</b>: ' + [...plan].join(', ') + '. Small modules, big effect.'); update(true); });
    bBig.addEventListener('click', () => { plan.clear(); BASE.slice().sort((a, b) => b[1] - a[1]).slice(0, 3).forEach((m) => plan.add(m[0])); say('Plan = 3 <b>largest</b> modules: ' + [...plan].join(', ') + '. Note legacy-reports and import-jobs barely change: low interest to remove.'); update(true); });
    bClear.addEventListener('click', () => { plan.clear(); say('Plan cleared: interest keeps compounding in the busy modules.'); update(false); });
    bRun.addEventListener('click', () => update(true));

    loopH = ctx.loop((dt) => { if (my === gen && shown < SPR) { shown = Math.min(SPR, shown + dt / 180); drawChart(); } });
    update(false);
    say('Each module in the plan costs 5% of capacity until it is fixed. Compare <b>Top 3 hotspots</b> with <b>3 biggest modules</b>.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
