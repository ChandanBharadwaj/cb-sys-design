/* Group chat: server-assigned sequence numbers, per-recipient in-order display, ✓/✓✓/read ticks,
   offline sync from cursor, and dedup of retried sends by client_msg_id. */
SD.widget('chat', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 500, ROWS = 7, RH = 34, TOP = 52, H = TOP + ROWS * RH + 6;
  const XA = 50, XS = 165, RX = { Bob: 290, Carol: 372, Dan: 454 };
  const NAMES = Object.keys(RX);
  const D = (ms) => (ctx.reduced ? 0 : ms);

  let clock = 0, seq = 0, nMsg = 0, jitter = true, loseAck = false, dups = 0, held = 0;
  let msgs = [], dedup = new Map();
  const mem = {};
  function resetState() {
    clock = 0; seq = 0; nMsg = 0; dups = 0; held = 0; msgs = []; dedup = new Map();
    NAMES.forEach((n) => { mem[n] = { online: true, next: 1, pending: new Map(), read: 0 }; });
  }
  resetState();

  // controls
  const sendBtn = el('button', { class: 'btn primary', text: '▶ Send', onclick: () => send(1) });
  const burstBtn = el('button', { class: 'btn', text: 'Send 3 fast', onclick: () => send(3) });
  const jitBtn = el('button', { class: 'btn', onclick: () => { jitter = !jitter; paintBtns(); } });
  const ackBtn = el('button', { class: 'btn', onclick: () => { loseAck = !loseAck; paintBtns(); } });
  const readBtn = el('button', { class: 'btn', text: '👁 Online members read', onclick: readAll });
  const memBtns = NAMES.map((n) => el('button', { class: 'btn', onclick: () => toggle(n) }));
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset', onclick: () => { resetState(); paintBtns(); log.innerHTML = ''; say('Reset.'); } });
  function paintBtns() {
    jitBtn.textContent = '≈ Network jitter: ' + (jitter ? 'on' : 'off');
    ackBtn.textContent = '✂ Lose next ack: ' + (loseAck ? 'on' : 'off');
    memBtns.forEach((b, i) => { const m = mem[NAMES[i]]; b.textContent = NAMES[i] + ': ' + (m.online ? 'online' : 'offline'); b.style.opacity = m.online ? 1 : 0.6; });
  }
  root.append(el('div', { class: 'w-controls' }, sendBtn, burstBtn, jitBtn, ackBtn), el('div', { class: 'w-controls' }, memBtns, readBtn, resetBtn));
  paintBtns();

  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, style: 'max-width:720px;margin:0 auto;', role: 'img', 'aria-label': 'Message sequence with per-recipient delivery state' });
  const gHead = svg('g'), gRows = svg('g'), gPk = svg('g');
  S_.append(gHead, gRows, gPk);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); };
  const T = (x, y, text, o) => svg('text', Object.assign({ x, y, 'text-anchor': 'middle', fill: 'var(--text)', style: 'font:600 13px var(--sans)', text }, o || {}));

  // header
  [['Alice', XA], ['Server', XS]].concat(NAMES.map((n) => [n, RX[n]])).forEach(([n, x]) => {
    gHead.append(T(x, 18, n, { style: 'font:700 14px var(--sans)' }));
    gHead.append(svg('line', { x1: x, x2: x, y1: 26, y2: H - 4, stroke: 'var(--border)', 'stroke-dasharray': '3 4' }));
  });
  const dots = {};
  NAMES.forEach((n) => { dots[n] = svg('circle', { cx: RX[n] - 26, cy: 14, r: 4 }); gHead.append(dots[n]); });
  gHead.append(T(XS, 36, 'assigns seq', { fill: 'var(--text-3)', style: 'font:500 11px var(--sans)' }));

  // ---- protocol ----
  function send(k) {
    for (let i = 0; i < k; i++) {
      nMsg++;
      const m = { n: nMsg, cid: 'c' + (100 + nMsg), t0: clock + i * D(120), up: D(380), seq: 0, srvAt: 0, ackAt: null, ack: false, retry: null, r: {} };
      m.lostFirst = loseAck; if (loseAck) { loseAck = false; paintBtns(); }
      msgs.push(m);
    }
    say(`Alice sends ${k > 1 ? k + ' messages' : 'm' + nMsg} with client ids generated on her phone.`);
  }
  function arriveServer(m, isRetry) {
    if (dedup.has(m.cid)) {                       // duplicate send: return original seq, no new row, no fan-out
      dups++; m.ackAt = clock + D(300);
      say(`Server: <b>${m.cid}</b> already stored as #${dedup.get(m.cid)} → re-ack, no duplicate.`); return;
    }
    m.seq = ++seq; m.srvAt = clock; dedup.set(m.cid, m.seq);
    say(`Server stores ${m.cid} as <b>#${m.seq}</b> (durable), then fans out.`);
    if (!m.lostFirst) m.ackAt = clock + D(300);
    else { m.retry = { at: clock + D(1500), sent: false }; say(`✂ The ✓ ack for ${m.cid} is lost on the way back. Alice will retry.`); }
    NAMES.forEach((n) => {
      const on = mem[n].online;
      m.r[n] = { arriveAt: on ? clock + D(260 + (jitter ? Math.random() * 1500 : 60)) : Infinity, state: on ? 'fly' : 'queued' };
    });
  }
  function deliver(n, m) {
    const st = mem[n];
    st.pending.set(m.seq, m);
    if (m.seq !== st.next) { m.r[n].state = 'held'; held++; say(`${n} got #${m.seq} early (expects #${st.next}) → <b>held</b>.`); }
    while (st.pending.has(st.next)) { const x = st.pending.get(st.next); st.pending.delete(st.next); x.r[n].state = 'shown'; st.next++; }
  }
  function toggle(n) {
    const st = mem[n]; st.online = !st.online; paintBtns();
    if (!st.online) { say(`${n} goes offline. New messages are stored and a push is queued.`); return; }
    const missed = msgs.filter((m) => m.seq && m.r[n] && m.r[n].state === 'queued').sort((a, b) => a.seq - b.seq);
    say(`${n} reconnects: <b>sync after #${st.next - 1}</b> → ${missed.length} message(s) in order.`);
    missed.forEach((m, i) => { m.r[n].state = 'fly'; m.r[n].arriveAt = clock + D(300 + i * 140); });
  }
  function readAll() {
    NAMES.forEach((n) => { if (mem[n].online) mem[n].read = mem[n].next - 1; });
    say('Online members send a cumulative read receipt: "read up to #' + Math.max(...NAMES.map((n) => mem[n].read)) + '".');
  }
  function ticks(m) {
    if (!m.ack) return m.retry && m.retry.sent ? 'retrying…' : '…';
    const all = NAMES.every((n) => mem[n].next > m.seq);
    if (!all) return '✓';
    return NAMES.every((n) => mem[n].read >= m.seq) ? '✓✓ read' : '✓✓';
  }

  // ---- render loop ----
  function lerp(a, b, k) { return a + (b - a) * Math.max(0, Math.min(1, k)); }
  function frame(dt) {
    clock += Math.min(dt, 100);
    msgs.forEach((m) => {
      if (!m.seq && !m.srvDone && clock >= m.t0 + m.up) { m.srvDone = true; arriveServer(m); }
      if (m.retry && !m.retry.sent && clock >= m.retry.at) { m.retry.sent = true; m.retry.t0 = clock; say(`Alice retries <b>${m.cid}</b> (same id).`); }
      if (m.retry && m.retry.sent && !m.retry.done && clock >= m.retry.t0 + D(380)) { m.retry.done = true; arriveServer(m, true); }
      if (m.ackAt != null && !m.ack && clock >= m.ackAt) m.ack = true;
      if (m.seq) NAMES.forEach((n) => { const r = m.r[n]; if (r.state === 'fly' && clock >= r.arriveAt) deliver(n, m); });
    });
    render();
  }
  function render() {
    gRows.innerHTML = ''; gPk.innerHTML = '';
    NAMES.forEach((n) => dots[n].setAttribute('fill', mem[n].online ? 'var(--ok)' : 'var(--text-3)'));
    const view = msgs.slice(-ROWS);
    view.forEach((m, i) => {
      const y = TOP + i * RH + RH / 2;
      const tk = ticks(m);
      const blue = tk === '✓✓ read';
      gRows.append(svg('rect', { x: 6, y: y - 12, width: 88, height: 24, rx: 8, fill: 'color-mix(in srgb, var(--accent) 16%, var(--surface))', stroke: 'var(--border)' }));
      gRows.append(T(28, y + 5, 'm' + m.n, { style: 'font:700 13px var(--mono)' }));
      gRows.append(T(66, y + 5, tk === '✓✓ read' ? '✓✓' : tk, { fill: blue ? 'var(--accent)' : tk === '…' || tk === 'retrying…' ? 'var(--text-3)' : 'var(--ok)', style: `font:700 ${tk.length > 3 ? 10 : 14}px var(--sans)` }));
      if (m.seq) {
        gRows.append(svg('rect', { x: XS - 26, y: y - 11, width: 52, height: 22, rx: 6, fill: 'var(--surface)', stroke: 'var(--accent)' }));
        gRows.append(T(XS, y + 5, '#' + m.seq, { style: 'font:700 13px var(--mono)' }));
      }
      if (m.retry && m.retry.done) gRows.append(T(XS + 46, y + 5, 'dup', { fill: 'var(--warn)', style: 'font:700 12px var(--sans)' }));
      // uplinks
      if (!m.srvDone && clock >= m.t0) gPk.append(svg('circle', { cx: lerp(XA + 44, XS - 26, (clock - m.t0) / Math.max(1, m.up)), cy: y, r: 5, fill: 'var(--accent)' }));
      if (m.retry && m.retry.sent && !m.retry.done) gPk.append(svg('circle', { cx: lerp(XA + 44, XS - 26, (clock - m.retry.t0) / Math.max(1, D(380))), cy: y, r: 5, fill: 'var(--warn)' }));
      if (m.ackAt != null && !m.ack) gPk.append(svg('circle', { cx: lerp(XS - 26, XA + 44, 1 - (m.ackAt - clock) / 300), cy: y, r: 4, fill: 'var(--ok)' }));
      if (!m.seq) return;
      NAMES.forEach((n) => {
        const r = m.r[n], x = RX[n];
        if (r.state === 'fly') {
          const start = Math.max(m.srvAt, r.arriveAt - D(1800));
          gPk.append(svg('circle', { cx: lerp(XS + 26, x - 18, (clock - start) / Math.max(1, r.arriveAt - start)), cy: y, r: 4.5, fill: 'var(--accent)', opacity: 0.85 }));
          return;
        }
        const style = { shown: ['var(--ok)', '#' + m.seq], held: ['var(--warn)', 'held'], queued: ['var(--text-3)', '🔔'] }[r.state];
        gRows.append(svg('rect', { x: x - 18, y: y - 11, width: 36, height: 22, rx: 6, fill: `color-mix(in srgb, ${style[0]} 22%, var(--surface))`, stroke: style[0] }));
        gRows.append(T(x, y + 5, style[1], { style: 'font:700 12px var(--mono)' }));
      });
    });
    stats.innerHTML = '';
    const queued = msgs.reduce((a, m) => a + NAMES.filter((n) => m.r[n] && m.r[n].state === 'queued').length, 0);
    Object.entries({ 'server seq': seq, 'held (early)': held, 'dups dropped': dups, 'queued for push': queued })
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  ctx.loop((dt) => frame(dt));
  let started = false;
  ctx.onVisible((v) => { if (v && !started) { started = true; send(3); } });
  render();
  say('Tip: press <b>Send 3 fast</b> with jitter on. Some messages arrive early and are held until the gap fills.');
});
