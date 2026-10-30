/* Order state machine + inventory holds: conditional reserve, TTL expiry, and oversell when deducting at payment. */
SD.widget('ecommerce-orders', function (root, ctx) {
  const { el, svg } = ctx;
  const UNITS = 12, W = 440, H = 236;
  let mode = 'checkout', ttl = 6, rate = 3, running = true;
  let units, shoppers, now, spawnAcc, nextId, fx, counts, st, done;

  // ---------- controls ----------
  const modes = [['cart', 'Hold at add-to-cart'], ['checkout', 'Hold at checkout'], ['payment', 'Deduct at payment']];
  const modeBtns = modes.map(([v, l]) => {
    const b = el('button', { class: 'btn' + (v === mode ? ' primary' : ''), text: l });
    b.addEventListener('click', () => { mode = v; modeBtns.forEach((x) => x.classList.toggle('primary', x === b)); reset(); });
    return b;
  });
  const ttlOut = el('b', { text: ttl + ' min' });
  const ttlIn = el('input', { type: 'range', min: 1, max: 15, value: ttl, 'aria-label': 'Hold TTL' });
  ttlIn.addEventListener('input', () => { ttl = +ttlIn.value; ttlOut.textContent = ttl + ' min'; });
  const rateOut = el('b', { text: rate.toFixed(1) });
  const rateIn = el('input', { type: 'range', min: 5, max: 60, value: rate * 10, 'aria-label': 'Shoppers per minute' });
  rateIn.addEventListener('input', () => { rate = +rateIn.value / 10; rateOut.textContent = rate.toFixed(1); });
  const runBtn = el('button', { class: 'btn', text: ctx.reduced ? '⏭ +1 min' : '⏸ Pause' });
  runBtn.addEventListener('click', () => { if (ctx.reduced) { for (let i = 0; i < 10; i++) step(0.1); draw(); return; } running = !running; runBtn.textContent = running ? '⏸ Pause' : '▶ Resume'; });
  const resetBtn = el('button', { class: 'btn', text: '↺ Restock' });
  resetBtn.addEventListener('click', reset);
  root.append(el('div', { class: 'w-controls' }, ...modeBtns));
  root.append(el('div', { class: 'w-controls' }, runBtn, resetBtn, el('label', null, 'hold TTL ', ttlOut, ' ', ttlIn), el('label', null, 'shoppers/min ', rateOut, ' ', rateIn)));
  const sql = el('div', { class: 'w-log', style: { maxHeight: 'none', marginTop: '0', marginBottom: '10px' } });
  root.append(sql);

  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Stock bar and order state machine' });
  const gUnits = svg('g'), gEdges = svg('g'), gNodes = svg('g'), gFx = svg('g');
  S_.append(gUnits, gEdges, gNodes, gFx);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (m) => { log.prepend(el('div', { html: `<span style="color:var(--text-3)">${Math.floor(now)} min</span> ${m}` })); while (log.children.length > 40) log.lastChild.remove(); };

  // ---------- state-machine layout ----------
  const NODES = {
    cart: { x: 60, y: 120, l: 'CART' }, pending: { x: 170, y: 120, l: 'PENDING' }, paid: { x: 280, y: 120, l: 'PAID' }, packed: { x: 390, y: 120, l: 'PACKED' },
    abandoned: { x: 115, y: 206, l: 'ABANDONED' }, expired: { x: 225, y: 206, l: 'EXPIRED' }, refunded: { x: 335, y: 206, l: 'REFUNDED' }
  };
  const EDGES = [['cart', 'pending'], ['pending', 'paid'], ['paid', 'packed'], ['cart', 'abandoned'], ['pending', 'abandoned'], ['pending', 'expired'], ['paid', 'refunded']];
  const NW = 98, NH = 40;
  const nodeEls = {};
  EDGES.forEach(([a, b]) => {
    const A = NODES[a], B = NODES[b];
    const horiz = A.y === B.y;
    const x1 = horiz ? A.x + NW / 2 : A.x + (B.x - A.x) * 0.25, y1 = horiz ? A.y : A.y + NH / 2;
    const x2 = horiz ? B.x - NW / 2 : B.x - (B.x - A.x) * 0.25, y2 = horiz ? B.y : B.y - NH / 2;
    gEdges.append(svg('line', { x1, y1, x2, y2, stroke: 'var(--border)', 'stroke-width': 1.6 }));
    const ang = Math.atan2(y2 - y1, x2 - x1);
    gEdges.append(svg('path', { d: `M${x2},${y2} l${-7 * Math.cos(ang - 0.45)},${-7 * Math.sin(ang - 0.45)} M${x2},${y2} l${-7 * Math.cos(ang + 0.45)},${-7 * Math.sin(ang + 0.45)}`, stroke: 'var(--text-3)', 'stroke-width': 1.6, fill: 'none' }));
  });
  for (const k in NODES) {
    const n = NODES[k];
    const r = svg('rect', { x: n.x - NW / 2, y: n.y - NH / 2, width: NW, height: NH, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--border)' });
    const t1 = svg('text', { x: n.x, y: n.y - 3, 'text-anchor': 'middle', style: 'font:700 14px var(--sans)', fill: 'var(--text)', text: n.l });
    const t2 = svg('text', { x: n.x, y: n.y + 14, 'text-anchor': 'middle', style: 'font:14px var(--mono)', fill: 'var(--text-2)', text: '0' });
    gNodes.append(r, t1, t2);
    nodeEls[k] = { r, t2 };
  }
  const TONE = { packed: 'var(--ok)', abandoned: 'var(--text-3)', expired: 'var(--warn)', refunded: 'var(--err)' };

  // ---------- simulation ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const freeUnits = () => units.filter((u) => u.st === 'free');
  const heldCount = () => units.filter((u) => u.st === 'held').length;
  function move(sh, to) { counts[sh.st]--; counts[to]++; fx.push({ from: sh.st, to, t: 0 }); sh.st = to; }
  function hold(sh) {   // UPDATE inventory SET reserved = reserved + 1 WHERE on_hand - reserved >= 1
    const u = freeUnits()[0];
    if (!u) return false;
    u.st = 'held'; u.owner = sh; u.exp = now + ttl; sh.unit = u; return true;
  }
  function soldOut(where) {
    st.away++;
    const h = heldCount();
    if (h) { st.awayHeld++; say(`Sold out at ${where}, but <b>${h} unit(s) are only held</b> by others.`); }
  }
  function spawn() {
    const sh = { id: nextId++, st: 'cart', t: rnd(2, 5), unit: null };
    if (mode === 'cart' && !hold(sh)) { soldOut('add-to-cart'); return; }
    counts.cart++; shoppers.push(sh);
  }
  function finishCart(sh) {
    if (Math.random() > 0.55) { move(sh, 'abandoned'); if (sh.unit) say(`#${sh.id} left; their hold stays until the TTL.`); return; }
    if (mode === 'checkout' && !hold(sh)) { soldOut('checkout'); move(sh, 'abandoned'); return; }
    if (mode === 'payment' && !freeUnits().length) { soldOut('checkout'); move(sh, 'abandoned'); return; }
    move(sh, 'pending'); sh.t = 1 + -Math.log(1 - Math.random()) * 2.5; sh.pays = Math.random() < 0.7;
  }
  function finishPending(sh) {
    if (!sh.pays) { move(sh, 'abandoned'); return; }
    const mine = sh.unit && sh.unit.st === 'held' && sh.unit.owner === sh;
    if (mode === 'payment') {   // decrement only now; the stock may already be gone
      const u = freeUnits()[0];
      move(sh, 'paid');
      if (u) { u.st = 'sold'; sh.t = 0.8; } else { st.refunds++; sh.refund = true; sh.t = 0.6; say(`<span style="color:var(--err)">#${sh.id} paid, but the last unit was taken → refund</span>`); }
      return;
    }
    if (mine || hold(sh)) { sh.unit.st = 'sold'; move(sh, 'paid'); sh.t = 0.8; if (!mine) say(`#${sh.id}: hold had expired, re-reserved a free unit.`); return; }
    st.expired++; move(sh, 'expired'); say(`<span style="color:var(--warn)">#${sh.id}: hold expired while paying, now sold out → not charged</span>`);
  }
  function step(dt) {
    if (done) return;
    now += dt;
    units.forEach((u) => { if (u.st === 'held' && u.exp <= now) { u.st = 'free'; u.owner.unit = null; u.owner = null; st.released++; } });
    if (units.every((u) => u.st === 'sold')) spawnAcc = 0;   // product page now says "sold out"
    spawnAcc += dt * rate;
    while (spawnAcc >= 1) { spawnAcc -= 1; spawn(); }
    shoppers.forEach((sh) => {
      sh.t -= dt;
      if (sh.t > 0) return;
      if (sh.st === 'cart') finishCart(sh);
      else if (sh.st === 'pending') finishPending(sh);
      else if (sh.st === 'paid') move(sh, sh.refund ? 'refunded' : 'packed');
    });
    shoppers = shoppers.filter((s) => ['cart', 'pending', 'paid'].includes(s.st));
    fx.forEach((f) => { f.t += dt * 2.2; });
    fx = fx.filter((f) => f.t < 1);
    const sold = units.filter((u) => u.st === 'sold').length;
    if (sold === UNITS && !shoppers.length) { done = true; say(`<b>All ${UNITS} units sold after ${Math.round(now)} min.</b> Refunds: ${st.refunds}. Turned away while stock was only held: ${st.awayHeld}.`); }
  }

  function reset() {
    units = Array.from({ length: UNITS }, () => ({ st: 'free', exp: 0, owner: null }));
    shoppers = []; now = 0; spawnAcc = 0.6; nextId = 1; fx = []; done = false;
    counts = { cart: 0, pending: 0, paid: 0, packed: 0, abandoned: 0, expired: 0, refunded: 0 };
    st = { away: 0, awayHeld: 0, refunds: 0, expired: 0, released: 0 };
    log.innerHTML = '';
    sql.innerHTML = {
      cart: '-- on add-to-cart:<br>UPDATE inventory SET reserved = reserved + 1<br>&nbsp;WHERE sku = $1 AND on_hand - reserved &gt;= 1; <b style="color:var(--accent)">-- hold, expires in TTL</b>',
      checkout: '-- on checkout:<br>UPDATE inventory SET reserved = reserved + 1<br>&nbsp;WHERE sku = $1 AND on_hand - reserved &gt;= 1; <b style="color:var(--accent)">-- hold, expires in TTL</b>',
      payment: '-- at checkout only a read: SELECT on_hand &gt; 0 …<br>-- after the card is charged:<br>UPDATE inventory SET on_hand = on_hand - 1 WHERE sku = $1 AND on_hand &gt;= 1; <b style="color:var(--err)">-- may hit 0 rows</b>'
    }[mode];
    say({ cart: 'Stock is held as soon as an item enters a cart.', checkout: 'Stock is held when checkout starts and released if the TTL passes.', payment: 'No holds: stock is checked at checkout and decremented after payment.' }[mode] + ' The clock runs at about 2.5 sim-minutes per second.');
    draw();
  }

  function draw() {
    gUnits.innerHTML = '';
    gUnits.append(svg('text', { x: 6, y: 16, style: 'font:700 14px var(--sans)', fill: 'var(--text-2)', text: `Stock: ${UNITS} units` }));
    const cw = (W - 12 - (UNITS - 1) * 4) / UNITS;
    units.forEach((u, i) => {
      const x = 6 + i * (cw + 4);
      const fill = u.st === 'sold' ? 'color-mix(in srgb, var(--ok) 45%, var(--surface))' : u.st === 'held' ? 'color-mix(in srgb, var(--warn) 40%, var(--surface))' : 'var(--surface-2)';
      gUnits.append(svg('rect', { x, y: 26, width: cw, height: 30, rx: 5, fill, stroke: 'var(--border)' }));
      const lab = u.st === 'held' ? Math.max(0, Math.ceil(u.exp - now)) + '′' : u.st === 'sold' ? '✓' : '';
      if (lab) gUnits.append(svg('text', { x: x + cw / 2, y: 46, 'text-anchor': 'middle', style: 'font:600 13.5px var(--mono)', fill: 'var(--text)', text: lab }));
    });
    const lg = [['var(--surface-2)', 'free'], ['color-mix(in srgb, var(--warn) 40%, var(--surface))', 'held (min left)'], ['color-mix(in srgb, var(--ok) 45%, var(--surface))', 'sold']];
    let lx = 6;
    lg.forEach(([c, t]) => { gUnits.append(svg('rect', { x: lx, y: 66, width: 12, height: 12, rx: 3, fill: c, stroke: 'var(--border)' }), svg('text', { x: lx + 17, y: 77, style: 'font:13px var(--sans)', fill: 'var(--text-2)', text: t })); lx += 30 + t.length * 7.2; });
    for (const k in nodeEls) {
      nodeEls[k].t2.textContent = counts[k];
      const c = TONE[k] && counts[k] ? TONE[k] : counts[k] ? 'var(--accent)' : 'var(--border)';
      nodeEls[k].r.setAttribute('stroke', c);
      nodeEls[k].r.setAttribute('stroke-width', counts[k] ? 2 : 1);
    }
    gFx.innerHTML = '';
    fx.forEach((f) => {
      const A = NODES[f.from], B = NODES[f.to];
      gFx.append(svg('circle', { cx: A.x + (B.x - A.x) * f.t, cy: A.y + (B.y - A.y) * f.t, r: 5, fill: TONE[f.to] || 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 1.5 }));
    });
    const sold = units.filter((u) => u.st === 'sold').length;
    stats.innerHTML = '';
    [['sold', `${sold}/${UNITS}`], ['held now', heldCount()], ['refunds (oversell)', st.refunds], ['holds expired', st.released], ['sold-out while held', st.awayHeld]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  reset();
  if (!ctx.reduced) ctx.loop((dt) => { if (!running) return; step(Math.min(dt, 100) / 1000 * 2.5); draw(); });
});
