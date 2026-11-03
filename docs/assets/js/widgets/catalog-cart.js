/* Two replicas of one cart (phone, laptop). Connected: every edit is copied across.
   Partitioned: edits diverge, and three real merge policies preview the healed cart:
   whole-cart last-writer-wins, Dynamo-style union (max qty), and an OR-Set where every add or
   quantity change carries a unique tag and a remove deletes only the tags it has seen.
   Each result is checked against what the shopper did during the split (lost add, revived remove, qty reverted). */
SD.widget('catalog-cart', function (root, ctx) {
  const { el, svg } = ctx;
  const SKUS = ['Charger', 'Phone case', 'Cable', 'Earbuds', 'Screen guard'];
  const NAMES = ['Phone', 'Laptop'];
  const POL = [['lww', 'Last writer wins'], ['union', 'Union (Dynamo)'], ['orset', 'OR-Set tags']];
  let policy = 'orset', parted = false, clk = 0, tagN = 0, R, intents, pulses = [], busy = false;

  // ---------- mechanism ----------
  const fresh = (i) => ({ i, adds: new Map(), removed: new Set(), last: 0 });
  const clone = (r, i) => ({ i, adds: new Map(r.adds), removed: new Set(r.removed), last: r.last });
  function view(r) {                                  // live tags; newest write per SKU gives the qty
    const best = new Map();
    r.adds.forEach((a, tag) => { if (r.removed.has(tag)) return; const b = best.get(a.sku); if (!b || a.ts > b.ts) best.set(a.sku, a); });
    const out = new Map(); SKUS.forEach((s) => { if (best.has(s)) out.set(s, best.get(s).q); }); return out;
  }
  function put(r, sku, q) { r.adds.set((r.i ? 'L' : 'P') + (++tagN), { sku, q, ts: ++clk }); r.last = clk; }
  function remove(r, sku) { r.adds.forEach((a, tag) => { if (a.sku === sku) r.removed.add(tag); }); r.last = ++clk; }
  function fromView(v, i) { const r = fresh(i); v.forEach((q, s) => put(r, s, q)); return r; }
  function mergeAll(a, b) {
    const w = b.last > a.last ? b : a;                 // whole cart with the later write wins
    const va = view(a), vb = view(b), u = new Map();
    SKUS.forEach((s) => { if (va.has(s) || vb.has(s)) u.set(s, Math.max(va.get(s) || 0, vb.get(s) || 0)); });
    const o = fresh(0); a.adds.forEach((v, t) => o.adds.set(t, v)); b.adds.forEach((v, t) => o.adds.set(t, v));
    a.removed.forEach((t) => o.removed.add(t)); b.removed.forEach((t) => o.removed.add(t)); o.last = Math.max(a.last, b.last);
    return { lww: { v: view(w), st: w, note: NAMES[w.i] + '\'s cart wins' }, union: { v: u, st: null }, orset: { v: view(o), st: o } };
  }
  function flags(res) {                               // compare a merged cart with the shopper's intents
    const f = {};
    Object.keys(intents).forEach((s) => {
      const ops = intents[s].filter(Boolean), ups = ops.filter((o) => o.op === 'up'), rms = ops.filter((o) => o.op === 'rm');
      const has = res.has(s);
      if (ups.length && !rms.length) {
        if (!has) f[s] = 'lost';
        else { const l = ups.reduce((x, y) => (y.ts > x.ts ? y : x)); if (res.get(s) !== l.q) f[s] = 'qty'; }
      } else if (rms.length && !ups.length && has) f[s] = 'back';
      else if (rms.length && ups.length) f[s] = has ? 'addwins' : 'rmwins';
    });
    return f;
  }
  function op(side, sku, kind) {
    if (busy && !op.demo) return;
    const r = R[side], cur = view(r).get(sku) || 0;
    let what, kept = true;
    if (kind === 'inc') { put(r, sku, cur + 1); what = (cur ? sku + ' → ×' + (cur + 1) : 'added ' + sku); }
    else if (!cur) { say(NAMES[side] + ': ' + sku + ' is not in this copy of the cart.'); return; }
    else if (kind === 'dec' && cur > 1) { put(r, sku, cur - 1); what = sku + ' → ×' + (cur - 1); }
    else { remove(r, sku); kept = false; what = 'removed ' + sku; }
    if (parted) {
      (intents[sku] = intents[sku] || [])[side] = { op: kept ? 'up' : 'rm', ts: clk, q: kept ? view(r).get(sku) : 0 };
      say(`<b>${NAMES[side]}</b> ${what}. Partitioned: the other copy does not see it.`);
    } else {
      R[1 - side] = clone(r, 1 - side);
      pulses.push({ from: side, t: 0 });
      say(`<b>${NAMES[side]}</b> ${what}. Connected: copied to the ${NAMES[1 - side].toLowerCase()} at once, so there is nothing to merge.`);
    }
    render();
  }
  function reset() {
    R = [fresh(0), fresh(1)]; clk = 0; tagN = 0; intents = {}; parted = false; pulses = [];
    put(R[0], 'Charger', 1); put(R[0], 'Phone case', 1); R[1] = clone(R[0], 1);
  }
  function toggle() {
    if (busy && !op.demo) return;
    if (!parted) { parted = true; intents = {}; say('⚡ <b>Partition.</b> Both copies still accept writes (always-writeable cart). Edit each side, then compare the three previews.'); render(); return; }
    const m = mergeAll(R[0], R[1])[policy], f = flags(m.v), bad = Object.values(f);
    const st = m.st ? m.st : fromView(m.v, 0);
    R = [clone(st, 0), clone(st, 1)]; parted = false; intents = {};
    const nl = bad.filter((x) => x === 'lost').length, nb = bad.filter((x) => x === 'back').length, nq = bad.filter((x) => x === 'qty').length;
    say(`🔗 <b>Healed with ${POL.find((p) => p[0] === policy)[1]}.</b> ` + (nl + nb + nq ? [nl && nl + ' add(s) lost', nb && nb + ' removed item(s) came back', nq && nq + ' quantity change(s) reverted'].filter(Boolean).join(', ') + '.' : 'Every edit from both sides survived.'));
    render();
  }
  async function demo() {
    if (busy) return; busy = true; op.demo = true;
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ctx.reduced ? 0 : ms));
    reset(); log.innerHTML = ''; say('▶ Demo: both devices start with Charger and Phone case.'); render(); await wait(700);
    toggle(); await wait(900);
    op(0, 'Cable', 'inc'); await wait(900);
    op(1, 'Charger', 'rm'); await wait(500);
    say('Compare the previews: <b>LWW</b> keeps only the laptop\'s cart (the cable is lost), <b>union</b> revives the charger, <b>OR-Set</b> keeps the cable and respects the remove. Pick a policy and press <b>Heal</b>.');
    busy = false; op.demo = false; render();
  }

  // ---------- view ----------
  let stats, log, svgEl, gMain, gPulse, linkGeo, partBtn, polBtns;
  const say = (t) => { if (!log) return; log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); };
  function build(narrow) {
    root.innerHTML = '';
    const G = narrow
      ? { W: 360, P: 6, CW: 166, LH: 24, f: 14, fh: 14.5, rw: 348, rcols: 2, hdr: 28 }
      : { W: 560, P: 8, CW: 262, LH: 24, f: 13.5, fh: 14, rw: 176, rcols: 1, hdr: 44 };
    build.G = G;
    const sideCtl = (side) => {
      const sel = el('select', { 'aria-label': NAMES[side] + ' item' });
      SKUS.forEach((s) => sel.append(el('option', { value: s, text: s })));
      sel.value = SKUS[side ? 0 : 2];
      const b = (t, k, title) => el('button', { class: 'btn', text: t, title, onclick: () => op(side, sel.value, k) });
      build['sel' + side] = sel;
      return el('div', { class: 'w-controls' }, el('b', { text: (side ? '💻 ' : '📱 ') + NAMES[side] }), sel, b('+1', 'inc', 'Add one'), b('−1', 'dec', 'One fewer'), b('Remove', 'rm', 'Remove the line'));
    };
    partBtn = el('button', { class: 'btn primary', onclick: toggle });
    polBtns = POL.map(([v, l]) => el('button', { class: 'btn', text: l, onclick: () => { policy = v; render(); } }));
    root.append(sideCtl(0), sideCtl(1),
      el('div', { class: 'w-controls' }, partBtn, el('span', { class: 'muted', text: 'Merge:' }), ...polBtns),
      el('div', { class: 'w-controls' }, el('button', { class: 'btn', text: '▶ Demo', onclick: demo }), el('button', { class: 'btn', text: '↺ Reset', onclick: () => { if (busy) return; reset(); say('Reset: both copies hold Charger ×1 and Phone case ×1.'); render(); } })));
    svgEl = svg('svg', { role: 'img', 'aria-label': 'Two cart replicas and three merge results', style: narrow ? '' : 'max-width:720px;margin:0 auto;display:block' });
    gMain = svg('g'); gPulse = svg('g'); svgEl.append(gMain, gPulse);
    root.append(el('div', { class: 'w-stage' }, svgEl),
      el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b style="color:var(--accent)">•</b> edited during the split · <b style="color:var(--err)">✗</b> an add that was lost · <b style="color:var(--warn)">↺</b> a removed item that came back · <b style="color:var(--warn)">≠</b> quantity change reverted · <b style="color:var(--accent)">+</b> add and remove clashed; the add won. Tap a preview to choose its policy.' }));
    stats = el('div', { class: 'w-stats' }); log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);
    render();
  }
  const T = (x, y, text, o = {}) => svg('text', { x, y, 'text-anchor': o.a || 'start', fill: o.c || 'var(--text)', 'text-decoration': o.strike ? 'line-through' : null, style: `font:${o.w || 600} ${o.s || build.G.f}px var(--sans)`, text });
  function render() {
    const G = build.G;
    const shown = (side) => SKUS.filter((s) => view(R[side]).has(s) || (parted && intents[s] && intents[s][side] && intents[s][side].op === 'rm')).length;
    const cardH = 30 + Math.max(2, shown(0), shown(1)) * G.LH + 6;
    gMain.innerHTML = '';
    // replica cards
    R.forEach((r, side) => {
      const x = G.P + side * (G.W - 2 * G.P - G.CW), y = 4, v = view(r);
      gMain.append(svg('rect', { x, y, width: G.CW, height: cardH, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      gMain.append(T(x + 10, y + 21, (G.W < 400 ? '' : (side ? '💻 ' : '📱 ')) + NAMES[side] + ' copy', { s: G.fh, w: 700 }));
      let row = 0;
      SKUS.forEach((s) => {
        const it = parted && intents[s] && intents[s][side];
        if (!v.has(s) && !(it && it.op === 'rm')) return;
        const ly = y + 30 + row * G.LH + 16, g = svg('g', { style: 'cursor:pointer' });
        g.addEventListener('click', () => { if (build['sel' + side]) build['sel' + side].value = s; });
        if (it) g.append(svg('circle', { cx: x + 12, cy: ly - 5, r: 3.5, fill: 'var(--accent)' }));
        g.append(T(x + 20, ly, v.has(s) ? s + ' ×' + v.get(s) : s + ' (removed)', { strike: !v.has(s), c: v.has(s) ? 'var(--text)' : 'var(--text-3)', w: v.has(s) ? 600 : 500 }));
        gMain.append(g); row++;
      });
      if (!row) gMain.append(T(x + 20, y + 46, '(empty cart)', { c: 'var(--text-3)', w: 500 }));
    });
    // link between the copies
    const ly = 4 + cardH + 16, ax = G.P + G.CW / 2, bx = G.W - G.P - G.CW / 2;
    linkGeo = { ax, bx, y: ly };
    const lc = parted ? 'var(--err)' : 'var(--ok)';
    gMain.append(svg('path', { d: `M${ax} ${4 + cardH} V${ly} H${bx} V${4 + cardH}`, fill: 'none', stroke: lc, 'stroke-width': 2.5, 'stroke-dasharray': parted ? '6 6' : '' }));
    const lbl = parted ? '✕ partitioned' : '⇄ in sync';
    gMain.append(svg('rect', { x: G.W / 2 - 58, y: ly - 12, width: 116, height: 24, rx: 12, fill: 'var(--surface)', stroke: lc }));
    gMain.append(T(G.W / 2, ly + 5, lbl, { a: 'middle', c: lc, w: 700 }));
    // merge previews
    const ry = ly + 26;
    const m = mergeAll(R[0], R[1]);
    gMain.append(T(G.P, ry + 12, parted ? 'If the partition heals now:' : 'Connected: all three policies agree', { s: G.fh, w: 700, c: 'var(--text-2)' }));
    const maxItems = Math.max(...POL.map(([k]) => { const f = parted ? flags(m[k].v) : {}; return SKUS.filter((s) => m[k].v.has(s) || f[s] === 'lost').length; }));
    const ch = G.hdr + Math.max(1, Math.ceil(maxItems / G.rcols)) * 22 + 6;
    POL.forEach(([k, name], i) => {
      const res = m[k], f = parted ? flags(res.v) : {};
      const x = narrow() ? G.P : G.P + i * (G.rw + 8), y = narrow() ? ry + 22 + i * (ch + 8) : ry + 22;
      const sel = k === policy, g = svg('g', { style: 'cursor:pointer' });
      g.addEventListener('click', () => { policy = k; render(); });
      g.append(svg('rect', { x, y, width: G.rw, height: ch, rx: 8, fill: sel ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : 'var(--surface)', stroke: sel ? 'var(--accent)' : 'var(--border)', 'stroke-width': sel ? 2 : 1 }));
      const vals = Object.values(f), nl = vals.filter((z) => z === 'lost').length, nb = vals.filter((z) => z === 'back').length, nq = vals.filter((z) => z === 'qty').length;
      const verdict = !parted ? 'same cart' : nl ? nl + ' add lost' : nb ? nb + ' item revived' : nq ? 'qty reverted' : '✓ intents kept';
      const vc = !parted ? 'var(--text-3)' : nl ? 'var(--err)' : nb || nq ? 'var(--warn)' : 'var(--ok)';
      g.append(T(x + 10, y + 19, (sel ? '● ' : '') + name, { s: G.fh, w: 700, c: sel ? 'var(--accent)' : 'var(--text)' }));
      g.append(narrow() ? T(x + G.rw - 10, y + 19, verdict, { a: 'end', c: vc, w: 700 }) : T(x + 10, y + 37, verdict, { c: vc, w: 700 }));
      const items = SKUS.filter((s) => res.v.has(s) || f[s] === 'lost');
      items.forEach((s, j) => {
        const col = j % G.rcols, rw = Math.floor(j / G.rcols);
        const tx = x + 10 + col * (G.rw / G.rcols), ty = y + G.hdr + rw * 22 + 15, fl = f[s];
        const mark = { lost: ' ✗', back: ' ↺', qty: ' ≠', addwins: ' +' }[fl] || '';
        const c = fl === 'lost' ? 'var(--err)' : fl === 'back' || fl === 'qty' ? 'var(--warn)' : fl === 'addwins' ? 'var(--accent)' : 'var(--text)';
        g.append(T(tx, ty, (fl === 'lost' ? s : s + ' ×' + res.v.get(s)) + mark, { c, strike: fl === 'lost', w: fl ? 700 : 500 }));
      });
      if (!items.length) g.append(T(x + 10, y + G.hdr + 15, '(empty cart)', { c: 'var(--text-3)', w: 500 }));
      gMain.append(g);
    });
    const H = narrow() ? ry + 22 + 3 * (ch + 8) : ry + 22 + ch + 6;
    svgEl.setAttribute('viewBox', `0 0 ${G.W} ${H}`);
    // controls + stats
    partBtn.textContent = parted ? '🔗 Heal & merge' : '⚡ Partition';
    polBtns.forEach((b, i) => { b.className = 'btn' + (POL[i][0] === policy ? ' primary' : ''); });
    const live = (r) => [...r.adds.keys()].filter((t) => !r.removed.has(t)).length;
    stats.innerHTML = '';
    [['link', parted ? 'partitioned' : 'connected'], ['edits while split', Object.values(intents).reduce((n, a) => n + a.filter(Boolean).length, 0)],
     ['phone tags live / removed', live(R[0]) + ' / ' + R[0].removed.size], ['laptop tags live / removed', live(R[1]) + ' / ' + R[1].removed.size],
     ['policy', POL.find((p) => p[0] === policy)[1]]].forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  const narrow = () => build.G.W < 400;

  ctx.loop((dt) => {
    if (!pulses.length || !linkGeo) return;
    gPulse.innerHTML = '';
    pulses.forEach((p) => { p.t += dt / 600; });
    pulses = pulses.filter((p) => p.t < 1);
    if (ctx.reduced) { pulses = []; return; }
    pulses.forEach((p) => {
      const k = p.from ? 1 - p.t : p.t, x = linkGeo.ax + (linkGeo.bx - linkGeo.ax) * k;
      gPulse.append(svg('circle', { cx: x, cy: linkGeo.y, r: 6, fill: 'var(--ok)', stroke: 'var(--surface)', 'stroke-width': 2 }));
    });
    if (!pulses.length) gPulse.innerHTML = '';
  });

  reset();
  build(ctx.narrow);
  say('Both copies hold Charger ×1 and Phone case ×1. Press <b>⚡ Partition</b>, then edit each side; or press <b>▶ Demo</b>.');
  ctx.onResize(build);
});
