/* Two clients, one lease-based lock, a GC pause and a storage that may or may
   not check fencing tokens. The schedule is computed from real lease rules:
   KeepAlive every TTL/3 while running; the lease expires TTL after the last
   successful renewal; the next waiter is granted the lock with token + 1. */
SD.widget('lock-manager', function (root, ctx) {
  const { el, svg } = ctx;
  const SPAN = 30, PAUSE_AT = 4, WORK_AFTER = 1, B_WORK = 1.5;
  let pause = 12, ttl = 9, fence = true, head = SPAN, running = false, plan;

  // ---- controls
  const runBtn = el('button', { class: 'btn primary', text: '▶ Run' });
  const fenceBtn = el('button', { class: 'btn', text: 'Fencing: on' });
  const pOut = el('b', { text: pause + ' s' }), tOut = el('b', { text: ttl + ' s' });
  const pIn = el('input', { type: 'range', min: 0, max: 20, value: pause, 'aria-label': 'GC pause seconds' });
  const tIn = el('input', { type: 'range', min: 3, max: 15, value: ttl, 'aria-label': 'Lease TTL seconds' });
  root.append(el('div', { class: 'w-controls' }, runBtn, fenceBtn,
    el('label', null, 'GC pause ', pOut, pIn), el('label', null, 'Lease TTL ', tOut, tIn)));

  // phone: 360-wide viewBox with 13–14-unit text; desktop: 820 wide with 10–12-unit text
  const rows = ['Lease', 'Client A', 'Client B', 'Storage'];
  let VW, LX, X1, RH, TOP, H, FS;
  function dims(narrow) {
    VW = narrow ? 360 : 820; LX = narrow ? 70 : 84; X1 = VW - (narrow ? 14 : 10); RH = narrow ? 56 : 46; TOP = 20;
    FS = narrow ? { row: 14, axis: 13, bar: 13, mark: 13, write: 13 } : { row: 12, axis: 10, bar: 11, mark: 10, write: 10 };
    H = TOP + rows.length * RH + (narrow ? 30 : 26);
  }
  dims(ctx.narrow);
  const S = svg('svg', { role: 'img', 'aria-label': 'Lock timeline' });
  const gBase = svg('g'), gPlan = svg('g'), gHead = svg('g');
  S.append(gBase, gPlan, gHead);
  root.append(el('div', { class: 'w-stage' }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (h) => { log.prepend(el('div', { html: h })); while (log.children.length > 30) log.lastChild.remove(); };
  const X = (t) => LX + (t / SPAN) * (X1 - LX);
  const T = (x, y, s, o) => svg('text', Object.assign({ x, y, text: s, style: `font:${(o && o.w) || 600} ${(o && o.px) || 11}px var(--sans)`, fill: (o && o.fill) || 'var(--text)' }, o && o.a ? { 'text-anchor': o.a } : {}));

  function base() {
    S.setAttribute('viewBox', `0 0 ${VW} ${H}`);
    gBase.innerHTML = '';
    rows.forEach((r, i) => {
      const y = TOP + i * RH;
      gBase.append(svg('rect', { x: 2, y: y + 2, width: VW - 4, height: RH - 6, rx: 7, fill: i % 2 ? 'var(--surface-2)' : 'var(--surface)', stroke: 'var(--border)' }),
        T(8, y + RH / 2 + 3, VW < 400 ? r.replace('Client ', '') : r, { px: FS.row, w: 700 }));
    });
    for (let s = 0; s <= SPAN; s += 5) gBase.append(T(Math.min(X(s), VW - 14), H - 6, s + 's', { px: FS.axis, w: 500, a: 'middle', fill: 'var(--text-3)' }), svg('line', { x1: X(s), x2: X(s), y1: TOP, y2: TOP + rows.length * RH - 4, stroke: 'var(--border)', 'stroke-dasharray': '2 4' }));
  }
  base();
  ctx.onResize((n) => { dims(n); base(); draw(); });

  function compute() {
    const ev = [];                                   // {t, row, kind, ...}
    const renew = ttl / 3;
    const pEnd = PAUSE_AT + pause;
    // last successful KeepAlive at or before the pause starts (A is frozen during it)
    let last = 0;
    for (let k = renew; k <= PAUSE_AT + 1e-9; k += renew) last = k;
    const expiry = last + ttl;
    const aWrite = pEnd + WORK_AFTER;                // A writes when its work finishes
    const expiredDuringPause = pause > 0 && expiry < pEnd;
    const aEnd = expiredDuringPause ? expiry : aWrite + 0.3;
    const bGrant = aEnd;                             // B is waiting from t = 1
    const bWrite = bGrant + B_WORK, bEnd = bWrite + 0.3;
    ev.push({ row: 0, kind: 'bar', a: 0, b: aEnd, who: 'A', label: 'A holds · token 33' });
    ev.push({ row: 0, kind: 'bar', a: bGrant, b: bEnd, who: 'B', label: 'B · 34' });
    if (expiredDuringPause) ev.push({ row: 0, kind: 'mark', t: expiry, label: 'lease expired', tone: 'warn' });
    for (let k = renew; k <= Math.min(PAUSE_AT, aEnd) + 1e-9; k += renew) ev.push({ row: 1, kind: 'tick', t: k });
    if (!expiredDuringPause) for (let k = Math.ceil(pEnd / renew) * renew; k < aWrite; k += renew) ev.push({ row: 1, kind: 'tick', t: k });
    ev.push({ row: 1, kind: 'bar', a: 0, b: PAUSE_AT, who: 'A', label: 'work' });
    if (pause > 0) ev.push({ row: 1, kind: 'pause', a: PAUSE_AT, b: pEnd, label: 'GC pause ' + pause + 's' });
    ev.push({ row: 1, kind: 'bar', a: pEnd, b: aWrite, who: 'A', label: '' });
    ev.push({ row: 2, kind: 'wait', a: 1, b: bGrant, label: 'waiting' });
    ev.push({ row: 2, kind: 'bar', a: bGrant, b: bEnd, who: 'B', label: 'work' });
    // storage: apply writes in time order with or without fencing
    const writes = [{ t: aWrite, who: 'A', tok: 33 }, { t: bWrite, who: 'B', tok: 34 }].sort((p, q) => p.t - q.t);
    let max = 0, val = null, corrupted = false;
    writes.forEach((w) => {
      const ok = !fence || w.tok >= max;
      if (ok) { if (val === 'B' && w.who === 'A') corrupted = true; max = Math.max(max, w.tok); val = w.who; }
      ev.push({ row: 3, kind: 'write', t: w.t, who: w.who, ok, label: (ok ? '✓ ' : '✗ ') + w.who + ' #' + w.tok });
      ev.push({ row: w.who === 'A' ? 1 : 2, kind: 'dot', t: w.t, who: w.who });
    });
    const overlap = expiredDuringPause && aWrite > bGrant;
    return { ev, expiry, expiredDuringPause, overlap, corrupted, aWrite, bWrite, last, final: val };
  }

  const col = (who) => (who === 'A' ? 'var(--accent)' : 'var(--ok)');
  function draw() {
    gPlan.innerHTML = '';
    plan.ev.forEach((e) => {
      const y = TOP + e.row * RH, cy = y + RH / 2 - 1;
      const show = (t) => t <= head + 1e-6;
      if (e.kind === 'bar' || e.kind === 'pause' || e.kind === 'wait') {
        if (!show(e.a)) return;
        const b = Math.min(e.b, head);
        const w = Math.max(1, X(b) - X(e.a));
        const fill = e.kind === 'pause' ? 'color-mix(in srgb, var(--warn) 45%, var(--surface))' : e.kind === 'wait' ? 'none' : `color-mix(in srgb, ${col(e.who)} 55%, var(--surface))`;
        gPlan.append(svg('rect', { x: X(e.a), y: cy - 9, width: w, height: 18, rx: 4, fill, stroke: e.kind === 'wait' ? 'var(--text-3)' : 'none', 'stroke-dasharray': e.kind === 'wait' ? '4 3' : '' }));
        if (e.label && w > e.label.length * FS.bar * 0.56) gPlan.append(T(X(e.a) + 4, cy + 4, e.label, { px: FS.bar, w: 700, fill: e.kind === 'wait' ? 'var(--text-3)' : 'var(--text)' }));
      } else if (e.kind === 'tick' && show(e.t)) {
        gPlan.append(svg('line', { x1: X(e.t), x2: X(e.t), y1: cy - 15, y2: cy - 9, stroke: 'var(--accent)', 'stroke-width': 2 }));
      } else if (e.kind === 'mark' && show(e.t)) {
        gPlan.append(svg('line', { x1: X(e.t), x2: X(e.t), y1: TOP, y2: TOP + 4 * RH - 4, stroke: 'var(--warn)', 'stroke-width': 2, 'stroke-dasharray': '5 3' }),
          T(X(e.t) > VW - 110 ? X(e.t) - 3 : X(e.t) + 3, y + FS.mark + 1, e.label, { px: FS.mark, w: 700, fill: 'var(--warn)', a: X(e.t) > VW - 110 ? 'end' : 'start' }));
      } else if (e.kind === 'dot' && show(e.t)) {
        gPlan.append(svg('path', { d: `M${X(e.t)},${cy - 8} l7,8 l-7,8 l-7,-8 z`, fill: col(e.who), stroke: 'var(--surface)' }));
      } else if (e.kind === 'write' && show(e.t)) {
        const up = e.who === 'A';
        gPlan.append(svg('circle', { cx: X(e.t), cy, r: 6, fill: e.ok ? 'var(--ok)' : 'var(--err)' }),
          T(Math.max(LX + 24, Math.min(VW - 30, X(e.t))), up ? cy - 10 : cy + 9 + FS.write, e.label, { px: FS.write, w: 700, a: 'middle', fill: e.ok ? 'var(--text)' : 'var(--err)' }));
      }
    });
    gHead.innerHTML = '';
    if (head < SPAN) gHead.append(svg('line', { x1: X(head), x2: X(head), y1: TOP - 4, y2: TOP + 4 * RH - 2, stroke: 'var(--text)', 'stroke-width': 1.5 }));
  }
  function summary() {
    const p = plan;
    stats.innerHTML = '';
    [['last KeepAlive', p.last.toFixed(1) + ' s'], ['lease expires', p.expiry.toFixed(1) + ' s'], ['A writes at', p.aWrite.toFixed(1) + ' s'],
      ['two holders?', p.overlap ? 'yes' : 'no'], ['final value', p.final ? 'from ' + p.final : '–']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b style="${(k === 'two holders?' && v === 'yes') ? 'color:var(--err)' : ''}">${v}</b>` })));
    let msg;
    if (!p.expiredDuringPause) msg = `✅ The ${pause}s pause fits inside the lease (expires at ${p.expiry.toFixed(1)}s). A finishes, then B gets the lock. No conflict.`;
    else if (p.corrupted) msg = `❌ <b>Lost update.</b> A's lease expired at ${p.expiry.toFixed(1)}s mid-pause, B took the lock and wrote, then A woke and overwrote B with stale token 33. Storage had no way to tell.`;
    else if (fence && p.overlap) msg = `🛡 A's lease expired during its pause and B took over. A's late write with token 33 was <b>rejected</b> because storage had already seen 34.`;
    else msg = `⚠ Two clients believed they held the lock at the same time (A's lease expired at ${p.expiry.toFixed(1)}s). This time A wrote first, so no visible damage. Increase the pause to see the overwrite.`;
    say(msg);
  }
  function rebuild(animate) {
    plan = compute();
    head = animate && !ctx.reduced ? 0 : SPAN;
    running = head < SPAN;
    runBtn.disabled = running;
    draw();
    if (!running) summary();
  }
  runBtn.onclick = () => rebuild(true);
  fenceBtn.onclick = () => { fence = !fence; fenceBtn.textContent = 'Fencing: ' + (fence ? 'on' : 'off'); rebuild(false); };
  pIn.oninput = () => { pause = +pIn.value; pOut.textContent = pause + ' s'; rebuild(false); };
  tIn.oninput = () => { ttl = +tIn.value; tOut.textContent = ttl + ' s'; rebuild(false); };

  say('KeepAlives (small ticks above A) renew the lease every TTL/3 while A runs. During a GC pause A sends nothing.');
  rebuild(false);
  ctx.loop((dt) => {
    if (!running) return;
    head = Math.min(SPAN, head + dt / 1000 * 4);    // 4× speed
    draw();
    if (head >= SPAN) { running = false; runBtn.disabled = false; summary(); }
  });
});
