/* Two editors + server over a slow network. OT: Jupiter/ot.js-style client & server transforms. CRDT: RGA with Lamport ids + tombstones. */
SD.widget('collab-editing', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 380, H = 304, BW = 22, X0 = 14, MAXC = 15, INIT = 'HELLO';
  const WORD = ['RED', 'BLUE'], NAME = ['A', 'B'], COL = ['var(--accent)', 'var(--warn)'];
  const ROWY = { A: 26, S: 138, B: 250 };
  let mode = 'ot', delay = 1200, t = 0, msgs = [], lastDue = {}, dirty = true, C, srv;

  // controls
  const modeBtn = el('button', { class: 'btn', text: '' });
  const conflictBtn = el('button', { class: 'btn primary', text: '⚡ Conflict' });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  const dOut = el('b', { text: '' });
  const dIn = el('input', { type: 'range', min: 0, max: 3000, step: 100, value: delay, 'aria-label': 'Network delay' });
  const userBtns = [0, 1].map((i) => [
    el('button', { class: 'btn', text: NAME[i] + ' ✎ type', onclick: () => { typeChar(C[i]); } }),
    el('button', { class: 'btn', text: NAME[i] + ' ⌫', onclick: () => { del(C[i]); } })
  ]).flat();
  root.append(el('div', { class: 'w-controls' }, conflictBtn, modeBtn, resetBtn, el('label', null, 'Delay ', dOut, ' ', dIn)));
  root.append(el('div', { class: 'w-controls' }, ...userBtns));

  const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Two editors and a server exchanging operations' });
  const gRows = svg('g'), gNet = svg('g');
  // lanes: down (A→S, S→B) at x=300, up (B→S, S→A) at x=370
  [[290, 64, 124], [350, 64, 124], [290, 176, 236], [350, 176, 236]].forEach(([x, y1, y2]) => S.append(svg('line', { x1: x, x2: x, y1, y2, stroke: 'var(--border)', 'stroke-dasharray': '3 4' })));
  const status = svg('text', { x: W / 2, y: H - 4, 'text-anchor': 'middle', style: 'font:700 14px var(--sans)' });
  S.append(gRows, gNet, status);
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '540px' } }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (h) => { log.prepend(el('div', { html: h })); while (log.children.length > 40) log.lastChild.remove(); };

  // ---------- OT ----------
  function T(a, b) {
    if (a.t === 'nop' || b.t === 'nop') return a;
    if (a.t === 'ins' && b.t === 'ins') return a.p < b.p || (a.p === b.p && a.s < b.s) ? a : { ...a, p: a.p + 1 };
    if (a.t === 'ins') return a.p <= b.p ? a : { ...a, p: a.p - 1 };
    if (b.t === 'ins') return a.p < b.p ? a : { ...a, p: a.p + 1 };
    return a.p < b.p ? a : a.p > b.p ? { ...a, p: a.p - 1 } : { t: 'nop' };
  }
  function xform(as, bs) { // returns [as', bs']: as' applies after bs, bs' after as
    as = as.slice(); bs = bs.slice();
    for (let j = 0; j < bs.length; j++) { let b = bs[j]; for (let i = 0; i < as.length; i++) { const a2 = T(as[i], b); b = T(b, as[i]); as[i] = a2; } bs[j] = b; }
    return [as, bs];
  }
  const applyOT = (doc, o) => { if (o.t === 'ins') doc.splice(o.p, 0, { c: o.c, s: o.s }); else if (o.t === 'del') doc.splice(o.p, 1); };
  const lbl = (o) => (o.t === 'ins' ? `+${o.c}@${o.p}` : o.t === 'del' ? `−${o.c}@${o.p}` : 'no-op');

  // ---------- CRDT (RGA) ----------
  const gt = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  const vis = (R) => R.items.filter((x) => !x.del);
  const idl = (id) => id[0] + (NAME[id[1]] || '·');
  function integrate(R, op) {
    if (op.t === 'del') {
      const it = R.items.find((x) => same(x.id, op.id));
      if (!it || it.del) return { vi: -1 };
      const vi = vis(R).indexOf(it); it.del = true; return { vi, del: true };
    }
    R.clock = Math.max(R.clock, op.id[0]);
    let i = op.origin ? R.items.findIndex((x) => same(x.id, op.origin)) + 1 : 0;
    const start = i;
    while (i < R.items.length && gt(R.items[i].id, op.id)) i++;      // skip concurrent inserts with higher ids
    const it = { id: op.id, c: op.c, s: op.id[1], del: false };
    R.items.splice(i, 0, it);
    return { vi: vis(R).indexOf(it), skipped: i - start, over: R.items[start] };
  }

  // ---------- shared ----------
  const textOf = (X) => (mode === 'ot' ? X.doc.map((x) => x.c).join('') : vis(X).map((x) => x.c).join(''));
  const len = (X) => (mode === 'ot' ? X.doc.length : vis(X).length);
  function reset() {
    msgs = []; lastDue = {}; t = 0;
    const init = () => (mode === 'ot'
      ? { doc: INIT.split('').map((c) => ({ c, s: -1 })), rev: 0, out: null, buf: [], hist: [] }
      : { items: INIT.split('').map((c, i) => ({ id: [0, -1 - i], c, s: -1, del: false })), clock: 0 });
    srv = init();
    C = [0, 1].map((site) => Object.assign(init(), { site, caret: 2 + site * 3, typed: 0 }));
    modeBtn.textContent = mode === 'ot' ? 'Mode: OT (server transforms)' : 'Mode: CRDT (ids + tombstones)';
    dirty = true;
  }
  function send(from, to, p) {
    const k = from + to, due = Math.max(t + delay, (lastDue[k] || 0) + 1);
    lastDue[k] = due; msgs.push({ from, to, start: t, due, p });
  }
  function typeChar(X) {
    if (len(X) >= MAXC || (mode === 'crdt' && X.items.length >= MAXC)) { say('Document is full for this demo. Press ↺ Reset.'); return; }
    const c = WORD[X.site][X.typed++ % WORD[X.site].length];
    if (mode === 'ot') local(X, { t: 'ins', p: X.caret, c, s: X.site });
    else {
      const v = vis(X), origin = X.caret > 0 ? v[X.caret - 1].id : null;
      const op = { t: 'ins', id: [X.clock + 1, X.site], c, origin };
      integrate(X, op); send(NAME[X.site], 'S', op);
    }
    X.caret++; dirty = true;
  }
  function del(X) {
    if (X.caret === 0) return;
    if (mode === 'ot') local(X, { t: 'del', p: X.caret - 1, c: X.doc[X.caret - 1].c });
    else { const it = vis(X)[X.caret - 1]; it.del = true; send(NAME[X.site], 'S', { t: 'del', id: it.id, c: it.c }); }
    X.caret--; dirty = true;
  }
  function local(X, op) { // OT client: apply now, send if nothing outstanding, else buffer
    applyOT(X.doc, op);
    if (!X.out) { X.out = [op]; send(NAME[X.site], 'S', { rev: X.rev, ops: X.out }); } else X.buf.push(op);
  }
  function deliver(m) {
    if (m.to === 'S') {
      const from = NAME.indexOf(m.from), other = NAME[1 - from];
      if (mode === 'ot') {
        let ops = m.p.ops; const before = ops.map(lbl).join(' ');
        const n = srv.hist.length - m.p.rev;
        for (let i = m.p.rev; i < srv.hist.length; i++) ops = xform(ops, srv.hist[i])[0];
        ops.forEach((o) => applyOT(srv.doc, o)); srv.hist.push(ops);
        const after = ops.map(lbl).join(' ');
        say(n ? `Server: ${m.from}'s <code>${before}</code> was based on rev ${m.p.rev}; transformed past ${n} op(s) → <code>${after}</code> = rev ${srv.hist.length}` : `Server: ${m.from}'s <code>${before}</code> → rev ${srv.hist.length} (no concurrent ops)`);
        send('S', m.from, { ack: true }); send('S', other, { ops });
      } else {
        const r = integrate(srv, m.p);
        if (m.p.t === 'ins' && r.skipped) say(`Relay: '${m.p.c}' (id ${idl(m.p.id)}) shares its origin with '${r.over.c}' (id ${idl(r.over.id)}). Higher id goes first, on every replica.`);
        send('S', other, m.p);
      }
    } else {
      const X = C[NAME.indexOf(m.to)];
      if (mode === 'ot') {
        if (m.p.ack) { X.rev++; if (X.buf.length) { X.out = X.buf; X.buf = []; send(m.to, 'S', { rev: X.rev, ops: X.out }); } else X.out = null; }
        else {
          let r = m.p.ops; const before = r.map(lbl).join(' ');
          if (X.out) [X.out, r] = xform(X.out, r);
          if (X.buf.length) [X.buf, r] = xform(X.buf, r);
          r.forEach((o) => { applyOT(X.doc, o); if (o.t !== 'nop' && o.p < X.caret) X.caret += o.t === 'ins' ? 1 : -1; });
          X.rev++;
          const after = r.map(lbl).join(' ');
          if (after !== before) say(`${m.to}: incoming <code>${before}</code> transformed past its own unacked op → <code>${after}</code>`);
        }
      } else {
        const r = integrate(X, m.p);
        if (r.vi >= 0 && r.vi < X.caret) X.caret += m.p.t === 'ins' ? 1 : -1;
      }
      X.caret = Math.max(0, Math.min(X.caret, len(X)));
    }
    dirty = true;
  }

  // ---------- drawing ----------
  function row(key, X, title) {
    const y = ROWY[key];
    gRows.append(svg('text', { x: X0, y: y - 8, style: 'font:700 14px var(--sans)', fill: 'var(--text-2)', text: title }));
    const items = mode === 'ot' ? X.doc : X.items;
    const isClient = key !== 'S';
    if (isClient) {
      const bg = svg('rect', { x: X0, y, width: W - X0 - 10, height: 28, fill: 'transparent', style: 'cursor:text' });
      bg.addEventListener('click', () => { X.caret = len(X); dirty = true; });
      gRows.append(bg);
    }
    let v = 0, caretX = X0;
    items.forEach((it, i) => {
      const x = X0 + i * BW, dead = !!it.del, vi = v;
      const g = svg('g', { style: isClient ? 'cursor:pointer' : '' });
      g.append(svg('rect', { x: x + 1, y, width: BW - 2, height: 28, rx: 4, fill: it.s >= 0 ? `color-mix(in srgb, ${COL[it.s]} 22%, var(--surface))` : 'var(--surface-2)', stroke: it.s >= 0 ? COL[it.s] : 'var(--border)', opacity: dead ? 0.35 : 1 }));
      g.append(svg('text', { x: x + BW / 2, y: y + 20, 'text-anchor': 'middle', style: 'font:700 16px var(--mono)', fill: 'var(--text)', opacity: dead ? 0.4 : 1, text: it.c }));
      if (dead) g.append(svg('line', { x1: x + 3, x2: x + BW - 3, y1: y + 14, y2: y + 14, stroke: 'var(--err)', 'stroke-width': 1.5 }));
      if (isClient) g.addEventListener('click', () => { X.caret = vi; dirty = true; });
      gRows.append(g);
      if (!dead) { v++; if (isClient && v === X.caret) caretX = x + BW; }
    });
    if (isClient) gRows.append(svg('line', { x1: caretX, x2: caretX, y1: y - 3, y2: y + 31, stroke: COL[X.site], 'stroke-width': 2.5 }));
  }
  function drawRows() {
    gRows.innerHTML = '';
    row('A', C[0], 'A  (types "RED")');
    row('S', srv, mode === 'ot' ? `SERVER · rev ${srv.hist.length}` : 'RELAY · merges, no transforms');
    row('B', C[1], 'B  (types "BLUE")');
    const ta = textOf(C[0]), tb = textOf(C[1]), ts = textOf(srv);
    const ok = !msgs.length && ta === tb && tb === ts;
    status.textContent = ok ? '✓ converged: all three copies match' : msgs.length ? msgs.length + ' message(s) in flight…' : '✗ diverged';
    status.setAttribute('fill', ok ? 'var(--ok)' : msgs.length ? 'var(--text-3)' : 'var(--err)');
    stats.innerHTML = '';
    const tomb = mode === 'crdt' ? srv.items.filter((x) => x.del).length : null;
    Object.entries(Object.assign({ A: ta, B: tb, server: ts }, mode === 'ot' ? { 'A pending': C[0].out ? C[0].out.length + C[0].buf.length : 0, 'B pending': C[1].out ? C[1].out.length + C[1].buf.length : 0 } : { tombstones: tomb }))
      .forEach(([k, val]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${val}</b>` })));
    dirty = false;
  }
  function drawNet() {
    gNet.innerHTML = '';
    msgs.forEach((m) => {
      const down = m.from === 'A' || m.to === 'B', x = down ? 290 : 350;
      const [y1, y2] = m.from === 'A' ? [64, 124] : m.to === 'A' ? [124, 64] : m.to === 'B' ? [176, 236] : [236, 176];
      const k = ctx.reduced ? 0.5 : Math.min(1, (t - m.start) / Math.max(1, m.due - m.start));
      const y = y1 + (y2 - y1) * k, who = m.from === 'S' ? m.to : m.from;
      const label = m.p.ack ? 'ack' : m.p.ops ? m.p.ops.map(lbl).join(' ') : (m.p.t === 'ins' ? '+' + m.p.c + ' ' + idl(m.p.id) : '−' + m.p.c);
      gNet.append(svg('circle', { cx: x, cy: y, r: 6, fill: m.p.ack ? 'var(--ok)' : COL[NAME.indexOf(who)] }));
      gNet.append(svg('text', { x: x - 10, y: y + 5, 'text-anchor': 'end', style: 'font:700 14px var(--mono);paint-order:stroke;stroke:var(--bg);stroke-width:3px', fill: 'var(--text)', text: label }));
    });
  }

  // ---------- wiring ----------
  modeBtn.addEventListener('click', () => { mode = mode === 'ot' ? 'crdt' : 'ot'; reset(); say(mode === 'ot' ? 'OT: the server orders ops and rewrites positions; clients transform incoming ops against their unacked ones.' : 'CRDT: every character gets a unique id (counter + site). Inserts name the char to their left; deletes only mark a tombstone.'); });
  resetBtn.addEventListener('click', () => { reset(); say('Reset to "HELLO".'); });
  conflictBtn.addEventListener('click', () => {
    C.forEach((X) => { X.caret = Math.min(2, len(X)); });
    typeChar(C[0]); typeChar(C[1]);
    say('⚡ A and B both type at position 2 at the same moment.');
  });
  const paintDelay = () => { dOut.textContent = delay ? (delay / 1000).toFixed(1) + ' s' : '0'; };
  dIn.addEventListener('input', () => { delay = +dIn.value; paintDelay(); });
  paintDelay(); reset();
  say('Tip: set a long delay, type with A and B quickly, then watch the ops cross and converge.');
  drawRows(); drawNet();
  ctx.loop((dt) => {
    t += dt;
    msgs.sort((a, b) => a.due - b.due);
    while (msgs.length && msgs[0].due <= t) deliver(msgs.shift());
    if (dirty) drawRows();
    drawNet();
  });
});
