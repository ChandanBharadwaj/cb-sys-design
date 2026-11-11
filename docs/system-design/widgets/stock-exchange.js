/* Live limit order book: price-time priority matching (sorted price levels, FIFO queues), trades at the resting price. */
SD.widget('stock-exchange', function (root, ctx) {
  const { el, svg } = ctx;
  const TICK = 5;
  // Two layouts: desktop ladder (440 wide, 12 levels) and phone ladder (340 wide, 10 levels, bigger text).
  const GEO = {
    wide: { W: 440, LEVELS: 12, RH: 26, Y0: 28, PX: 220, BW: 72, BID_R: 180, ASK_L: 260, AREA: 152, wMin: 30, wMax: 110, wK: 0.32, fs: 13.5, fq: 12.5, head: ['← bids (oldest inside)', 'asks →'] },
    narrow: { W: 340, LEVELS: 10, RH: 30, Y0: 30, PX: 170, BW: 72, BID_R: 132, ASK_L: 208, AREA: 108, wMin: 36, wMax: 84, wK: 0.24, fs: 15, fq: 14, head: ['← bids', 'asks →'] }
  };
  let G = ctx.narrow ? GEO.narrow : GEO.wide;
  let side = 'buy', type = 'limit', price = 10000, qty = 100, auto = false;
  let bids, asks, seq, nextId, last, flash, trades, tAcc = 0;
  const money = (c) => (c / 100).toFixed(2);

  // ---------- controls ----------
  const seg = (opts, get, set) => {
    const bs = opts.map(([v, l]) => { const b = el('button', { class: 'btn' + (get() === v ? ' primary' : ''), text: l }); b.addEventListener('click', () => { set(v); bs.forEach((x) => x.classList.toggle('primary', x === b)); paintPrice(); }); return b; });
    return bs;
  };
  const sideBtns = seg([['buy', 'Buy'], ['sell', 'Sell']], () => side, (v) => { side = v; });
  const typeBtns = seg([['limit', 'Limit'], ['market', 'Market']], () => type, (v) => { type = v; });
  const priceOut = el('b', { style: { fontFamily: 'var(--mono)', minWidth: '56px', display: 'inline-block', textAlign: 'center' } });
  const dn = el('button', { class: 'btn', text: '−', 'aria-label': 'Lower price' }), up = el('button', { class: 'btn', text: '+', 'aria-label': 'Raise price' });
  dn.addEventListener('click', () => { price -= TICK; paintPrice(); }); up.addEventListener('click', () => { price += TICK; paintPrice(); });
  const qtyOut = el('b', { text: qty });
  const qtyIn = el('input', { type: 'range', min: 10, max: 400, step: 10, value: qty, 'aria-label': 'Quantity' });
  qtyIn.addEventListener('input', () => { qty = +qtyIn.value; qtyOut.textContent = qty; });
  const go = el('button', { class: 'btn primary', text: '▶ Submit' });
  go.addEventListener('click', () => { submit(side, type === 'market' ? null : price, qty, 'you'); draw(); });
  const autoBtn = el('button', { class: 'btn', text: ctx.reduced ? '🎲 One random order' : '🎲 Random flow: off' });
  autoBtn.addEventListener('click', () => { if (ctx.reduced) { randomEvent(); draw(); return; } auto = !auto; autoBtn.textContent = '🎲 Random flow: ' + (auto ? 'on' : 'off'); });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  resetBtn.addEventListener('click', () => { reset(); draw(); });
  root.append(el('div', { class: 'w-controls' }, ...sideBtns, ...typeBtns),
    el('div', { class: 'w-controls' }, el('label', null, 'price'), dn, priceOut, up, el('label', null, 'qty ', qtyOut, ' ', qtyIn), go),
    el('div', { class: 'w-controls' }, autoBtn, resetBtn));
  function paintPrice() { priceOut.textContent = type === 'market' ? 'MKT' : money(price); dn.disabled = up.disabled = type === 'market'; }

  const S_ = svg('svg', { role: 'img', 'aria-label': 'Order book ladder' });
  const gHead = svg('g'), gRows = svg('g'), gOrd = svg('g');
  S_.append(gHead, gRows, gOrd);
  function layout() {
    S_.setAttribute('viewBox', `0 0 ${G.W} ${G.Y0 + G.LEVELS * G.RH + 6}`);
    const f = `font:700 ${G.fs}px var(--sans)`;
    gHead.innerHTML = '';
    gHead.append(svg('text', { x: G.BID_R, y: 19, 'text-anchor': 'end', style: f, fill: 'var(--ok)', text: G.head[0] }),
      svg('text', { x: G.PX, y: 19, 'text-anchor': 'middle', style: f, fill: 'var(--text-2)', text: 'price' }),
      svg('text', { x: G.ASK_L, y: 19, style: f, fill: 'var(--err)', text: G.head[1] }));
  }
  layout();
  ctx.onResize((n) => { G = n ? GEO.narrow : GEO.wide; layout(); draw(); });
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '560px' } }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (m) => { log.prepend(el('div', { html: m })); while (log.children.length > 40) log.lastChild.remove(); };

  // ---------- book: price → FIFO array; sorted on demand (a TreeMap in Java) ----------
  const sortedKeys = (book, desc) => [...book.keys()].sort((a, b) => desc ? b - a : a - b);
  const best = (book, desc) => { const k = sortedKeys(book, desc); return k.length ? k[0] : null; };
  function rest(o) { const book = o.side === 'buy' ? bids : asks; if (!book.has(o.price)) book.set(o.price, []); book.get(o.price).push(o); }
  function submit(sd, px, q, who) {
    const s = ++seq, id = nextId++;
    const other = sd === 'buy' ? asks : bids, desc = sd === 'sell';
    let left = q; const fills = [];
    while (left > 0 && other.size) {
      const bp = best(other, desc);
      if (px !== null && (sd === 'buy' ? bp > px : bp < px)) break;      // no longer crosses
      const level = other.get(bp), maker = level[0];                      // oldest at best price
      const f = Math.min(left, maker.qty);
      left -= f; maker.qty -= f; fills.push([f, bp, maker.id]);
      flash.set(maker.id, 1); last = { px: bp, side: sd };
      trades++;
      if (!maker.qty) level.shift();
      if (!level.length) other.delete(bp);
    }
    const tag = `<span style="color:var(--text-3)">seq ${s}</span> ${who === 'you' ? '<b>you</b> ' : ''}${sd.toUpperCase()} ${q} ${px === null ? 'MKT' : '@ ' + money(px)}`;
    if (fills.length) say(`${tag} → ` + fills.map(([f, p, m]) => `<b style="color:var(--accent)">${f} @ ${money(p)}</b> vs #${m}`).join(', ') + (left && px === null ? ` · ${left} unfilled, cancelled` : ''));
    if (left > 0 && px !== null) { const o = { id, side: sd, price: px, qty: left }; rest(o); flash.set(id, 1); if (!fills.length || who === 'you') say(`${tag} → rests as #${id}${fills.length ? ` (${left} left)` : ''}, back of the ${money(px)} queue`); }
    else if (!fills.length) say(`${tag} → nothing to match, cancelled`);
  }
  function cancelRandom() {
    const all = [...bids.values(), ...asks.values()].flat().filter((o) => o.id > 0);
    if (!all.length) return;
    const o = all[Math.floor(Math.random() * all.length)];
    const book = o.side === 'buy' ? bids : asks, level = book.get(o.price);
    level.splice(level.indexOf(o), 1); if (!level.length) book.delete(o.price);
    seq++; say(`<span style="color:var(--text-3)">seq ${seq}</span> cancel #${o.id}`);
  }
  function randomEvent() {
    const r = Math.random(), size = bids.size + asks.size;
    if (r < 0.2 || size > 16) { cancelRandom(); return; }
    const sd = Math.random() < 0.5 ? 'buy' : 'sell';
    const bb = best(bids, true) ?? 9990, ba = best(asks, false) ?? 10010;
    if (r < 0.28) { submit(sd, null, 10 * (2 + Math.floor(Math.random() * 10)), 'flow'); return; }
    const ref = sd === 'buy' ? bb : ba, off = Math.floor(Math.random() * 5) - 1;
    const px = sd === 'buy' ? ref - off * TICK : ref + off * TICK;
    submit(sd, px, 10 * (1 + Math.floor(Math.random() * 15)), 'flow');
  }
  function reset() {
    bids = new Map(); asks = new Map(); seq = 1000000; nextId = 1; last = null; flash = new Map(); trades = 0;
    const seed = [[9995, [120, 60]], [9990, [200]], [9985, [80, 150]], [9980, [300]], [9970, [100]]];
    const seedA = [[10005, [90, 140]], [10010, [60]], [10015, [250]], [10020, [100, 70]], [10030, [180]]];
    seed.forEach(([p, qs]) => qs.forEach((q) => rest({ id: nextId++, side: 'buy', price: p, qty: q })));
    seedA.forEach(([p, qs]) => qs.forEach((q) => rest({ id: nextId++, side: 'sell', price: p, qty: q })));
    price = 10000; log.innerHTML = ''; paintPrice();
    say('Book seeded. Try: <b>Sell</b>, <b>Market</b>, qty 250, Submit. It fills the oldest 99.95 bid first, then the next one, then moves down a level.');
  }

  // ---------- drawing ----------
  function draw() {
    gRows.innerHTML = ''; gOrd.innerHTML = '';
    const bb = best(bids, true), ba = best(asks, false);
    const mid = bb !== null && ba !== null ? Math.round((bb + ba) / 2 / TICK) * TICK : bb ?? ba ?? 10000;
    const { LEVELS, RH, Y0, W, PX, BW, fs } = G;
    const top = mid + Math.floor(LEVELS / 2) * TICK;
    for (let i = 0; i < LEVELS; i++) {
      const p = top - i * TICK, y = Y0 + i * RH;
      const isLast = last && last.px === p;
      const row = svg('g', { style: 'cursor:pointer' });
      row.append(svg('rect', { x: 2, y, width: W - 4, height: RH - 3, rx: 5, fill: p === price && type === 'limit' ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent' }),
        svg('rect', { x: PX - BW / 2, y, width: BW, height: RH - 3, rx: 5, fill: isLast ? 'color-mix(in srgb, var(--accent) 35%, var(--surface))' : 'var(--surface-2)', stroke: 'var(--border)' }),
        svg('text', { x: PX, y: y + RH / 2 + fs * 0.35, 'text-anchor': 'middle', style: `font:600 ${fs}px var(--mono)`, fill: p === bb ? 'var(--ok)' : p === ba ? 'var(--err)' : 'var(--text)', text: money(p) }));
      row.addEventListener('click', () => { price = p; if (type === 'market') typeBtns[0].click(); paintPrice(); draw(); });
      gRows.append(row);
      drawLevel(bids.get(p) || [], y, -1); drawLevel(asks.get(p) || [], y, 1);
    }
    stats.innerHTML = '';
    [['best bid', bb === null ? '—' : money(bb)], ['best ask', ba === null ? '—' : money(ba)], ['spread', bb !== null && ba !== null ? money(ba - bb) : '—'], ['last', last ? money(last.px) : '—'], ['trades', trades], ['next seq', seq + 1]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function drawLevel(level, y, dir) {
    const { BID_R, ASK_L, AREA, RH, W, fq } = G;
    let x = dir < 0 ? BID_R : ASK_L, used = 0, hidden = 0;
    level.forEach((o) => {
      const w = Math.max(G.wMin, Math.min(G.wMax, 18 + o.qty * G.wK));
      if (used + w > AREA) { hidden++; return; }
      const f = flash.get(o.id) || 0;
      const c = dir < 0 ? 'var(--ok)' : 'var(--err)';
      const bx = dir < 0 ? x - w : x;
      gOrd.append(svg('rect', { x: bx, y: y + 1, width: w - 3, height: RH - 5, rx: 4, fill: `color-mix(in srgb, ${c} ${22 + Math.round(f * 50)}%, var(--surface))`, stroke: f > 0.05 ? 'var(--accent)' : c, 'stroke-width': f > 0.05 ? 2 : 1 }),
        svg('text', { x: bx + (w - 3) / 2, y: y + RH / 2 + fq * 0.3, 'text-anchor': 'middle', style: `font:600 ${fq}px var(--mono)`, fill: 'var(--text)', text: o.qty }));
      x += dir * w; used += w;
    });
    if (hidden) gOrd.append(svg('text', { x: dir < 0 ? 2 : W - 2, y: y + RH / 2 + fq * 0.3, 'text-anchor': dir < 0 ? 'start' : 'end', style: `font:700 ${fq}px var(--mono)`, fill: 'var(--text-3)', text: '+' + hidden }));
  }

  reset(); draw();
  if (!ctx.reduced) ctx.loop((dt) => {
    let dirty = false;
    flash.forEach((v, k) => { const n = v - dt / 900; if (n <= 0) flash.delete(k); else flash.set(k, n); dirty = true; });
    if (auto) { tAcc += dt; if (tAcc > 700) { tAcc = 0; randomEvent(); dirty = true; } }
    if (dirty) draw();
  });
});
