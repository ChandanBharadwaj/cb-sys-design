/* Conway alignment: team communication graph vs service dependency graph.
   Reassign services to teams (presets or tap), count cross-team edges and hand-offs for a sample feature. */
SD.widget('conways-law', function (root, ctx) {
  const { el, svg } = ctx;
  const COL = ['var(--accent)', 'var(--ok)', 'var(--warn)', '#a855f7'];
  const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, var(--surface))`;
  // Services: 3 streams (Browse, Checkout, Account) × 3 layers (UI, API, DB) + Payments. viewBox 360 wide → ≥ 13-unit text.
  const SV = [
    { id: 'bui', l: 'Browse UI', x: 62, y: 36 }, { id: 'cui', l: 'Cart UI', x: 180, y: 36 }, { id: 'aui', l: 'Account UI', x: 298, y: 36 },
    { id: 'cat', l: 'Catalog', x: 62, y: 108 }, { id: 'chk', l: 'Checkout', x: 180, y: 108 }, { id: 'acc', l: 'Account', x: 298, y: 108 },
    { id: 'cdb', l: 'Catalog DB', x: 62, y: 180 }, { id: 'odb', l: 'Orders DB', x: 180, y: 180 }, { id: 'udb', l: 'Users DB', x: 298, y: 180 },
    { id: 'pay', l: 'Payments', x: 298, y: 252 }
  ];
  const byId = Object.fromEntries(SV.map((s) => [s.id, s]));
  // w = how often the two ends change together (3 = same feature usually touches both; 1 = stable API call)
  const DEPS = [
    ['bui', 'cat', 3], ['cui', 'chk', 3], ['aui', 'acc', 3], ['cat', 'cdb', 3], ['chk', 'odb', 3], ['acc', 'udb', 3],
    ['chk', 'cat', 1], ['chk', 'acc', 1], ['chk', 'pay', 1], ['cui', 'cat', 1]
  ];
  const PRESETS = {
    layer: { name: 'By layer', teams: ['Frontend', 'Backend', 'Data / DBA', 'Team D'], own: { bui: 0, cui: 0, aui: 0, cat: 1, chk: 1, acc: 1, pay: 1, cdb: 2, odb: 2, udb: 2 } },
    stream: { name: 'By stream', teams: ['Browse', 'Checkout', 'Account', 'Payments'], own: { bui: 0, cat: 0, cdb: 0, cui: 1, chk: 1, odb: 1, aui: 2, acc: 2, udb: 2, pay: 3 } },
    one: { name: 'One big team', teams: ['Everyone', 'Team B', 'Team C', 'Team D'], own: { bui: 0, cui: 0, aui: 0, cat: 0, chk: 0, acc: 0, pay: 0, cdb: 0, odb: 0, udb: 0 } }
  };
  const FEATURES = [
    { id: 'save', l: 'Save for later', path: ['cui', 'chk', 'odb'] },
    { id: 'filter', l: 'New search filter', path: ['bui', 'cat', 'cdb'] },
    { id: 'wallet', l: 'Pay by wallet', path: ['cui', 'chk', 'pay'] },
    { id: 'stock', l: 'Stock in cart', path: ['cui', 'chk', 'cat', 'cdb'] }
  ];
  let preset = 'layer', teams = PRESETS.layer.teams.slice(), own = Object.assign({}, PRESETS.layer.own), feature = FEATURES[0], busy = false, active = new Set();

  // ---- controls
  const presetBtns = {};
  const ctlA = el('div', { class: 'w-controls' }, el('span', { class: 'muted', style: { fontSize: '13px' }, text: 'Reorganise:' }));
  Object.entries(PRESETS).forEach(([k, p]) => { const b = el('button', { class: 'btn', text: p.name, onclick: () => applyPreset(k) }); presetBtns[k] = b; ctlA.append(b); });
  const featBtns = {};
  const ctlB = el('div', { class: 'w-controls' }, el('span', { class: 'muted', style: { fontSize: '13px' }, text: 'Feature:' }));
  FEATURES.forEach((f) => { const b = el('button', { class: 'btn', text: f.l, onclick: () => { if (busy) return; feature = f; render(); } }); featBtns[f.id] = b; ctlB.append(b); });
  const shipBtn = el('button', { class: 'btn primary', text: '▶ Ship feature', onclick: () => ship() });
  ctlB.append(shipBtn);
  root.append(ctlA, ctlB);

  // ---- two panels (side by side on desktop, stacked on phones)
  const grid = el('div', { style: { display: 'grid', gap: '14px', gridTemplateColumns: ctx.narrow ? '1fr' : '1fr 1fr' } });
  const head = (t) => el('p', { style: { margin: '0 0 4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-2)' }, text: t });
  const T = svg('svg', { viewBox: '0 0 360 270', role: 'img', 'aria-label': 'Team communication graph' });
  const S = svg('svg', { viewBox: '0 0 360 282', role: 'img', 'aria-label': 'Service dependency graph' });
  const wrap = (s) => el('div', { style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px' } }, s);
  grid.append(el('div', null, head('Teams: who must talk to whom'), wrap(T)), el('div', null, head('Services: who depends on whom (tap to move)'), wrap(S)));
  root.append(el('div', { class: 'w-stage' }, grid));
  root.append(el('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '13px' }, html: 'Box colour = owning team. <b style="color:var(--err)">Red dashed</b> = dependency crossing a team boundary; thick edges change together often (same feature), thin ones are stable API calls. The number on a team link = dependencies between those teams.' }));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  ctx.onResize((n) => { grid.style.gridTemplateColumns = n ? '1fr' : '1fr 1fr'; });

  const TP = [[90, 68], [270, 68], [90, 202], [270, 202]];
  const BW = 100, BH = 36;
  let crossEls = [];

  function analyse() {
    let wTot = 0, wIn = 0; const cross = []; const pairs = {};
    DEPS.forEach(([a, b, w]) => {
      wTot += w;
      if (own[a] === own[b]) wIn += w;
      else { cross.push([a, b, w]); const k = Math.min(own[a], own[b]) + '-' + Math.max(own[a], own[b]); pairs[k] = (pairs[k] || 0) + 1; }
    });
    const load = [0, 0, 0, 0]; SV.forEach((s) => load[own[s.id]]++);
    const penalty = load.reduce((p, n) => p + Math.max(0, n - 4) * 0.1, 0);   // > 4 services per team: cognitive overload
    const score = Math.max(0, wIn / wTot - penalty);
    let hand = 0; const touched = new Set();
    feature.path.forEach((id, i) => { touched.add(own[id]); if (i && own[id] !== own[feature.path[i - 1]]) hand++; });
    return { cross, pairs, load, score, penalty, hand, touched, wIn, wTot };
  }

  function clip(from, to) {   // point where the segment from→to enters the box around `to`
    const dx = from.x - to.x, dy = from.y - to.y;
    const k = Math.min(Math.abs((BW / 2 + 3) / (dx || 1e-6)), Math.abs((BH / 2 + 3) / (dy || 1e-6)));
    return { x: to.x + dx * k, y: to.y + dy * k };
  }
  function arrow(p, from) {
    const a = Math.atan2(p.y - from.y, p.x - from.x), L = 8;
    return [p, { x: p.x - L * Math.cos(a - 0.45), y: p.y - L * Math.sin(a - 0.45) }, { x: p.x - L * Math.cos(a + 0.45), y: p.y - L * Math.sin(a + 0.45) }].map((q) => q.x.toFixed(1) + ',' + q.y.toFixed(1)).join(' ');
  }

  function drawServices(A) {
    S.innerHTML = ''; crossEls = [];
    DEPS.forEach(([a, b, w]) => {
      const f = byId[a], t = byId[b], isX = own[a] !== own[b];
      const col = isX ? 'var(--err)' : 'var(--text-3)';
      let d, tip, prev;
      if (a === 'chk' && b === 'pay') {          // route through the gap between Orders DB and Users DB
        prev = { x: 239, y: 252 }; tip = { x: t.x - BW / 2 - 3, y: t.y };
        d = `M${f.x + 20},${f.y + BH / 2 + 2} L239,${f.y + BH / 2 + 18} L239,252 L${tip.x},${tip.y}`;
      } else {
        const s0 = clip(t, f); tip = clip(f, t); prev = f;
        d = `M${s0.x.toFixed(1)},${s0.y.toFixed(1)} L${tip.x.toFixed(1)},${tip.y.toFixed(1)}`;
      }
      const p = svg('path', { d, fill: 'none', stroke: col, 'stroke-width': w === 3 ? 3 : 1.6, 'stroke-dasharray': isX ? '6 4' : '' });
      S.append(p, svg('polygon', { points: arrow(tip, prev), fill: col }));
      if (isX) crossEls.push(p);
    });
    SV.forEach((s) => {
      const c = COL[own[s.id]], on = active.has(s.id), inF = feature.path.includes(s.id);
      const g = svg('g', { style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-label': s.l + ': move to next team' });
      g.append(svg('rect', { x: s.x - BW / 2, y: s.y - BH / 2, width: BW, height: BH, rx: 8, fill: tint(c, on ? 45 : 20), stroke: c, 'stroke-width': on ? 4 : inF ? 2.6 : 1.4, 'stroke-dasharray': inF && !on ? '' : '' }));
      g.append(svg('text', { x: s.x, y: s.y + 5, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:${inF ? 700 : 500} 14.5px var(--sans)`, text: s.l }));
      if (inF) g.append(svg('circle', { cx: s.x + BW / 2 - 4, cy: s.y - BH / 2 + 4, r: 5, fill: 'var(--text)' }));
      const move = () => { if (busy) return; own[s.id] = (own[s.id] + 1) % 4; preset = 'custom'; say(`Moved <b>${s.l}</b> to <b style="color:${COL[own[s.id]]}">${teams[own[s.id]]}</b>.`); render(); };
      g.addEventListener('click', move);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); move(); } });
      S.append(g);
    });
  }

  function drawTeams(A, hot) {
    T.innerHTML = '';
    Object.entries(A.pairs).forEach(([k, n]) => {
      const [i, j] = k.split('-').map(Number), a = TP[i], b = TP[j];
      const isHot = hot && hot === k;
      T.append(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: isHot ? 'var(--accent)' : 'var(--err)', 'stroke-width': isHot ? 7 : 2 + n * 1.5, 'stroke-opacity': 0.75 }));
      const lx = a[0] + (b[0] - a[0]) * 0.36, ly = a[1] + (b[1] - a[1]) * 0.36;
      T.append(svg('circle', { cx: lx, cy: ly, r: 12, fill: 'var(--surface)', stroke: 'var(--err)', 'stroke-width': 1.5 }));
      T.append(svg('text', { x: lx, y: ly + 4.5, 'text-anchor': 'middle', fill: 'var(--err)', style: 'font:700 14px var(--mono)', text: n }));
    });
    TP.forEach(([x, y], i) => {
      const used = A.load[i] > 0, c = COL[i], over = A.load[i] > 4, inF = A.touched.has(i);
      T.append(svg('circle', { cx: x, cy: y, r: 46, fill: used ? tint(c, inF ? 35 : 18) : 'none', stroke: used ? c : 'var(--border)', 'stroke-width': inF ? 3.5 : 2, 'stroke-dasharray': used ? '' : '5 5' }));
      T.append(svg('text', { x, y: y - 2, 'text-anchor': 'middle', fill: used ? 'var(--text)' : 'var(--text-3)', style: 'font:700 15px var(--sans)', text: used ? teams[i] : 'unused' }));
      if (used) T.append(svg('text', { x, y: y + 17, 'text-anchor': 'middle', fill: over ? 'var(--err)' : 'var(--text-2)', style: `font:${over ? 700 : 500} 14px var(--sans)`, text: A.load[i] + ' svc' + (A.load[i] > 1 ? 's' : '') + (over ? ' ⚠' : '') }));
    });
  }

  function render(hot) {
    const A = analyse();
    Object.entries(presetBtns).forEach(([k, b]) => b.classList.toggle('primary', k === preset));
    Object.entries(featBtns).forEach(([k, b]) => b.classList.toggle('primary', k === feature.id));
    drawServices(A); drawTeams(A, hot);
    const pct = Math.round(A.score * 100);
    stats.innerHTML = '';
    [['Org', preset === 'custom' ? 'custom' : PRESETS[preset].name], ['Cross-team edges', A.cross.length + ' / ' + DEPS.length], ['Conway alignment', pct + '%' + (pct >= 70 ? ' ✅' : pct >= 40 ? ' ⚠' : ' ❌')],
      ['"' + feature.l + '"', A.touched.size + ' team' + (A.touched.size > 1 ? 's' : '') + ', ' + A.hand + ' hand-off' + (A.hand === 1 ? '' : 's')], ['Max services / team', Math.max(...A.load)]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    return A;
  }

  function applyPreset(k) {
    if (busy) return;
    preset = k; teams = PRESETS[k].teams.slice(); own = Object.assign({}, PRESETS[k].own);
    const A = render();
    const msg = {
      layer: 'Teams cut <b>by layer</b>: every UI→API→DB edge crosses a team. Conway predicts three layers that must release together.',
      stream: 'Teams cut <b>by stream</b>: the edges that change together stay inside a team; only stable API calls cross.',
      one: '<b>One team</b> owns all 10 services: zero cross-team edges, but far too much cognitive load (and ~30 people in one team).'
    }[k];
    say(msg + ` Alignment ${Math.round(A.score * 100)}%${A.penalty ? ' (overload penalty −' + Math.round(A.penalty * 100) + ' pts)' : ''}.`);
  }

  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));

  async function ship() {
    if (busy) return;
    busy = true; shipBtn.disabled = true;
    const p = feature.path;
    say(`▶ Shipping <b>${feature.l}</b>: touches ${p.map((id) => byId[id].l).join(' → ')}.`);
    let waits = 0;
    for (let i = 0; i < p.length; i++) {
      const id = p[i], t = own[id];
      active = new Set([id]);
      let hot = null;
      if (i && own[p[i - 1]] !== t) {
        const a = own[p[i - 1]];
        hot = Math.min(a, t) + '-' + Math.max(a, t); waits++;
        say(`↪ <b>Hand-off</b>: ${teams[a]} → ${teams[t]}. Work waits in ${teams[t]}'s backlog.`);
      } else say(`✓ ${teams[t]} changes <b>${byId[id].l}</b>.`);
      render(hot);
      await sleep(hot ? 1100 : 650);
    }
    active = new Set();
    const A = render();
    say(waits ? `⚠ Done after <b>${waits} hand-off${waits > 1 ? 's' : ''}</b> across ${A.touched.size} teams. At ~4 days of waiting each (<em>estimate</em>) that is +${waits * 4} days of lead time.`
      : `✅ Done inside <b>one team</b>, no hand-offs. This is what stream-aligned ownership buys.`);
    busy = false; shipBtn.disabled = false;
  }

  if (!ctx.reduced) ctx.loop((dt, t) => { const off = -(t / 60) % 20; crossEls.forEach((e) => { e.style.strokeDashoffset = off; }); });
  applyPreset('layer');
  say('Tip: compare "By layer" and "By stream", then ship "Stock in cart": even a good split has some cross-team features.');
});
