/* Event Storming board: 14 domain events with causal links. The reader groups them into contexts
   (presets or tap-to-move). We count cross-context links, language conflicts (a context holding
   events whose word belongs to different business meanings) and draw the resulting context map. */
SD.widget('ddd', function (root, ctx) {
  const { el, svg } = ctx;
  // [id, label, true meaning (where the language lives), entity noun]
  const EV = [
    ['pl', 'Product Listed', 'Catalog', 'Product'],
    ['pc', 'Price Changed', 'Catalog', 'Product'],
    ['cr', 'Customer Registered', 'Sales', 'Customer'],
    ['ia', 'Item Added to Cart', 'Sales', 'Order'],
    ['op', 'Order Placed', 'Sales', 'Order'],
    ['sr', 'Stock Reserved', 'Inventory', 'Product'],
    ['sd', 'Stock Depleted', 'Inventory', 'Product'],
    ['pa', 'Payment Authorized', 'Billing', 'Payment'],
    ['pf', 'Payment Failed', 'Billing', 'Payment'],
    ['ii', 'Invoice Issued', 'Billing', 'Order'],
    ['ri', 'Refund Issued', 'Billing', 'Payment'],
    ['as', 'Ship Address Set', 'Shipping', 'Customer'],
    ['os', 'Order Shipped', 'Shipping', 'Order'],
    ['pd', 'Parcel Delivered', 'Shipping', 'Order']
  ];
  // "this leads to / needs data from that"
  const LINKS = [['pl', 'pc'], ['pc', 'ia'], ['cr', 'ia'], ['ia', 'op'], ['op', 'sr'], ['pl', 'sr'], ['sr', 'sd'],
    ['op', 'pa'], ['op', 'pf'], ['pa', 'ii'], ['pa', 'ri'], ['cr', 'as'], ['as', 'os'], ['pa', 'os'], ['os', 'pd']];
  const PRESETS = {
    entity: { name: 'By entity', groups: ['Product', 'Order', 'Customer', 'Payment'], of: (e) => e[3] },
    bc: { name: 'By bounded context', groups: ['Catalog', 'Sales', 'Inventory', 'Billing', 'Shipping'], of: (e) => e[2] },
    one: { name: 'One big model', groups: ['Shop', 'Spare A', 'Spare B'], of: () => 'Shop' }
  };
  const COL = ['var(--k-service)', 'var(--k-store)', 'var(--k-compute)', 'var(--k-queue)', 'var(--k-client)'];
  const byId = Object.fromEntries(EV.map((e) => [e[0], e]));
  let preset = 'bc', groups = [], asg = {}, narrow = ctx.narrow;

  function load(k) {
    preset = k; groups = PRESETS[k].groups.slice();
    asg = {}; EV.forEach((e) => { asg[e[0]] = groups.indexOf(PRESETS[k].of(e)); });
    draw();
  }
  function analyse() {
    let cross = 0; const pairs = {};
    LINKS.forEach(([a, b]) => {
      const ga = asg[a], gb = asg[b];
      if (ga !== gb) { cross++; const k = Math.min(ga, gb) + '|' + Math.max(ga, gb); pairs[k] = (pairs[k] || 0) + 1; }
    });
    let conflicts = 0; const mixed = [];
    groups.forEach((g, i) => {
      const meanings = [...new Set(EV.filter((e) => asg[e[0]] === i).map((e) => e[2]))];
      if (meanings.length > 1) { conflicts += meanings.length - 1; mixed.push(g + ' mixes ' + meanings.join(' + ')); }
    });
    const used = groups.map((_, i) => EV.some((e) => asg[e[0]] === i));
    const biggest = Math.max(...groups.map((_, i) => EV.filter((e) => asg[e[0]] === i).length));
    const score = Math.round(100 * (cross + 2 * conflicts) / (LINKS.length + 2 * 4));
    return { cross, internal: LINKS.length - cross, conflicts, mixed, pairs, used, biggest, score };
  }
  function pattern(a, b, n) {
    const names = [groups[a], groups[b]];
    if (n >= 3) return ['Chatty: partnership, or merge these', 'warn'];
    if (names.includes('Billing')) return ['Events in, ACL to the ERP', 'ok'];
    if (names.includes('Catalog')) return ['Open host service (query API)', 'ok'];
    if (n === 2) return ['Customer–supplier + published events', 'info'];
    return ['Domain event (published language)', 'ok'];
  }

  const presetBtns = Object.keys(PRESETS).map((k) => {
    const b = el('button', { class: 'btn', text: PRESETS[k].name });
    b.addEventListener('click', () => load(k));
    return b;
  });
  root.append(el('div', { class: 'w-controls' }, ...presetBtns));
  const hint = el('p', { class: 'muted', style: { margin: '4px 0 6px', fontSize: '13px' }, html: 'Tap a sticky to move it to the next context. Red dashed arrows cross a boundary.' });
  const board = el('div', { class: 'w-stage' });
  const stats = el('div', { class: 'w-stats' });
  const mapTitle = el('p', { style: { margin: '10px 0 2px', fontWeight: '700', fontSize: '14px' }, text: 'Resulting context map' });
  const mapStage = el('div', { class: 'w-stage' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(hint, board, stats, mapTitle, mapStage, log);

  function draw() {
    presetBtns.forEach((b, i) => b.classList.toggle('primary', Object.keys(PRESETS)[i] === preset));
    const W = narrow ? 360 : 760, COLS = narrow ? 2 : 4, PAD = 8, LH = 26;
    const SW = (W - PAD * 2 - (COLS - 1) * 8) / COLS, SH = narrow ? 40 : 38, FS = narrow ? 14 : 13.5;
    const pos = {}; let y = PAD;
    const gL = svg('g'), gLines = svg('g'), gS = svg('g');
    groups.forEach((g, gi) => {
      const items = EV.filter((e) => asg[e[0]] === gi);
      const rows = Math.max(1, Math.ceil(items.length / COLS));
      const h = LH + rows * (SH + 8) + 4;
      gL.append(svg('rect', { x: 2, y, width: W - 4, height: h, rx: 10, fill: 'var(--surface-2)', stroke: COL[gi % 5], 'stroke-width': 2, 'stroke-dasharray': items.length ? '' : '4 4' }));
      gL.append(svg('text', { x: 12, y: y + 18, fill: COL[gi % 5], style: `font:700 ${FS}px var(--sans)`, text: g + ' (' + items.length + ')' + (items.length ? '' : ' · empty') }));
      items.forEach((e, i) => {
        const x = PAD + (i % COLS) * (SW + 8), sy = y + LH + Math.floor(i / COLS) * (SH + 8);
        pos[e[0]] = { x: x + SW / 2, y: sy + SH / 2 };
        const grp = svg('g', { style: 'cursor:pointer', role: 'button', tabindex: 0, 'aria-label': e[1] + ', in ' + g + '. Activate to move.' });
        grp.append(svg('rect', { x, y: sy, width: SW, height: SH, rx: 4, fill: '#f6a04d', stroke: '#c46a17', 'stroke-width': 1 }));
        grp.append(svg('text', { x: x + SW / 2, y: sy + SH / 2 + FS * 0.35, 'text-anchor': 'middle', fill: '#2b1a07', style: `font:600 ${FS}px var(--sans)`, text: e[1] }));
        const move = () => { asg[e[0]] = (asg[e[0]] + 1) % groups.length; say(`Moved <b>${e[1]}</b> to <b>${groups[asg[e[0]]]}</b>.`); draw(); };
        grp.addEventListener('click', move);
        grp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); move(); } });
        gS.append(grp);
      });
      y += h + 8;
    });
    LINKS.forEach(([a, b]) => {
      const A = pos[a], B = pos[b], cross = asg[a] !== asg[b];
      gLines.append(svg('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: cross ? 'var(--err)' : 'var(--text-3)', 'stroke-width': cross ? 2.5 : 1.5, 'stroke-dasharray': cross ? '6 4' : '', opacity: cross ? 0.9 : 0.5 }));
    });
    const S = svg('svg', { viewBox: `0 0 ${W} ${y}`, role: 'img', 'aria-label': 'Event Storming board grouped into contexts' });
    S.append(gL, gLines, gS);
    board.innerHTML = ''; board.append(S);
    const r = analyse();
    stats.innerHTML = '';
    [['cross-context links', r.cross + ' / ' + LINKS.length, r.cross > 8 ? 'err' : r.cross > 0 ? 'warn' : 'ok'],
      ['language conflicts', r.conflicts, r.conflicts ? 'err' : 'ok'],
      ['largest context', r.biggest + ' events', r.biggest > 7 ? 'warn' : 'ok'],
      ['coupling score', r.score + ' / 100', r.score > 45 ? 'err' : r.score > 30 ? 'warn' : 'ok']
    ].forEach(([k, v, t]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b style="color:var(--${t})">${v}</b>` })));
    drawMap(r);
    let msg;
    if (r.conflicts === 0 && r.biggest <= 4) msg = '✅ Each context speaks one language. The remaining cross links are real business hand-offs: integrate them with events and explicit patterns.';
    else if (r.cross === 0) msg = '⚠ Zero cross links, but ' + r.conflicts + ' language conflicts: one model for everything is a big ball of mud waiting to happen.';
    else msg = '⚠ ' + r.mixed.join('; ') + '. One word now carries several meanings and every team edits the same context.';
    say(`<b>${PRESETS[preset].name}</b>${Object.keys(asg).some((k) => groups[asg[k]] !== PRESETS[preset].of(byId[k])) ? ' (edited)' : ''}: ${msg}`);
  }

  function drawMap(r) {
    const W = narrow ? 360 : 640, H = narrow ? 300 : 280, cx = W / 2, cy = H / 2 + 4;
    const R = narrow ? 105 : 105, FS = 14;
    const idx = groups.map((_, i) => i).filter((i) => r.used[i]);
    const p = {};
    idx.forEach((gi, k) => {
      const a = -Math.PI / 2 + 2 * Math.PI * k / Math.max(1, idx.length);
      p[gi] = idx.length === 1 ? { x: cx, y: cy } : { x: cx + (narrow ? 1.2 : 2) * R * Math.cos(a), y: cy + R * Math.sin(a) };
    });
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Context map' });
    const lines = [];
    Object.entries(r.pairs).forEach(([k, n]) => {
      const [a, b] = k.split('|').map(Number);
      const tone = pattern(a, b, n)[1];
      S.append(svg('line', { x1: p[a].x, y1: p[a].y, x2: p[b].x, y2: p[b].y, stroke: `var(--${tone === 'info' ? 'accent' : tone})`, 'stroke-width': 1.5 + n * 1.5, opacity: 0.8 }));
      const mx = (p[a].x + p[b].x) / 2, my = (p[a].y + p[b].y) / 2;
      S.append(svg('circle', { cx: mx, cy: my, r: 11, fill: 'var(--surface)', stroke: 'var(--border)' }));
      S.append(svg('text', { x: mx, y: my + 5, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${FS}px var(--sans)`, text: String(n) }));
      lines.push(`<b>${groups[a]} ↔ ${groups[b]}</b> · ${n} link${n > 1 ? 's' : ''}: ${pattern(a, b, n)[0]}`);
    });
    idx.forEach((gi) => {
      const w = narrow ? 104 : 112;
      S.append(svg('rect', { x: p[gi].x - w / 2, y: p[gi].y - 18, width: w, height: 36, rx: 18, fill: 'var(--surface-2)', stroke: COL[gi % 5], 'stroke-width': 2.5 }));
      S.append(svg('text', { x: p[gi].x, y: p[gi].y + 5, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${FS}px var(--sans)`, text: groups[gi] }));
    });
    mapStage.innerHTML = ''; mapStage.append(S);
    mapStage.append(el('div', { style: { fontSize: '13px', marginTop: '4px', lineHeight: '1.5' }, html: lines.length ? lines.join('<br>') : 'No cross-context links: nothing to map (and nothing separated).' }));
  }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 20) log.lastChild.remove(); }
  load('bc');
  ctx.onResize((nw) => { narrow = nw; draw(); });
});
