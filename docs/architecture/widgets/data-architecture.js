/* Event-sourced bank account: append events, rehydrate with/without snapshots, replay into projections, upcast v1 events. */
SD.widget('data-architecture', function (root, ctx) {
  const { el, svg } = ctx;
  const SNAP_EVERY = 10;
  const st = { events: [], day: 0, snapOn: true, upcast: true, gen: 0, anim: null };
  const money = (c) => (c < 0 ? '-' : '') + '€' + (Math.abs(c) / 100).toFixed(2);

  // ---- domain: decide (command → events) and fold (event → state) ----
  function upcastEv(e) {
    if (e.type === 'Deposited' && e.v === 1) {
      if (!st.upcast) throw new Error('Deposited v1 has no amountCents (stored as "' + e.data.amount + '")');
      return { ...e, v: 2, data: { amountCents: Math.round(parseFloat(e.data.amount) * 100), currency: 'EUR' } };
    }
    return e;
  }
  function fold(s, e) {
    e = upcastEv(e);
    const d = e.data.amountCents || 0;
    if (e.type === 'Deposited') s.balance += d;
    if (e.type === 'Withdrawn') s.balance -= d;
    if (e.type === 'Closed') s.closed = true;
    s.version = e.version;
    return s;
  }
  // latest snapshot (computed with upcasting so it stays valid)
  function snapshotFor(n) {
    if (!st.snapOn) return null;
    const at = Math.floor(n / SNAP_EVERY) * SNAP_EVERY;
    if (!at) return null;
    const s = { balance: 0, closed: false, version: 0 };
    const saved = st.upcast; st.upcast = true;
    try { st.events.slice(0, at).forEach((e) => fold(s, e)); } finally { st.upcast = saved; }
    return s;
  }
  function load() {
    const snap = snapshotFor(st.events.length);
    const s = snap ? { ...snap } : { balance: 0, closed: false, version: 0 };
    const from = snap ? snap.version : 0;
    st.events.slice(from).forEach((e) => fold(s, e));
    return { s, read: st.events.length - from, from };
  }
  function append(type, data, v) {
    st.day += 1 + Math.floor(Math.random() * 4);
    st.events.push({ type, data, v: v || 2, version: st.events.length + 1, day: st.day });
  }
  function command(kind, cents) {
    let cur;
    try { cur = load(); } catch (err) { say('❌ Cannot load the account: ' + err.message + '. Turn the upcaster on.'); return false; }
    if (kind !== 'open' && cur.s.closed) { say('Rejected: account is <b>closed</b>. No event appended.'); return false; }
    if (kind === 'dep') append('Deposited', { amountCents: cents, currency: 'EUR' });
    if (kind === 'wd') {
      if (cents > cur.s.balance) { say(`Rejected <b>Withdraw ${money(cents)}</b>: balance is ${money(cur.s.balance)} (state rebuilt from ${cur.read} events).`); return false; }
      append('Withdrawn', { amountCents: cents, currency: 'EUR' });
    }
    if (kind === 'close') append('Closed', {});
    return true;
  }

  // ---- projections: all three fold the full log from event 0 ----
  function project(upto) {
    const bal = { v: 0 }, months = {}, fraud = { score: 0 }, perDay = {};
    for (let i = 0; i < upto; i++) {
      const e = upcastEv(st.events[i]);
      const d = e.data.amountCents || 0, m = 'M' + (1 + Math.floor(e.day / 30));
      months[m] = months[m] || { in: 0, out: 0 };
      if (e.type === 'Deposited') { months[m].in += d; fraud.score = Math.max(0, fraud.score - 5); bal.v += d; }
      if (e.type === 'Withdrawn') {
        if (d > bal.v * 0.5) fraud.score += 25;              // drains more than half the balance
        perDay[e.day] = (perDay[e.day] || 0) + 1;
        if (perDay[e.day] >= 2) fraud.score += 15;            // several withdrawals the same day
        months[m].out += d; bal.v -= d;
      }
      if (e.type === 'Closed' && fraud.score > 40) fraud.score += 10;
      fraud.score = Math.min(100, fraud.score);
    }
    return { bal: bal.v, months, fraud: fraud.score };
  }

  let parts = null;
  function build(narrow) {
    const my = ++st.gen;
    if (st.anim) { st.anim.stop(); st.anim = null; }
    root.innerHTML = '';
    const COLS = narrow ? 6 : 10, ROWS = narrow ? 5 : 4, CW = narrow ? 56 : 60, CH = narrow ? 48 : 46, G = 4;
    const W = narrow ? 360 : 680, TOP = 26, F = 14;
    const H = TOP + ROWS * (CH + G) + 6;
    const btn = (t, cls, fn) => { const b = el('button', { class: 'btn' + (cls ? ' ' + cls : ''), text: t }); b.onclick = fn; return b; };
    const amt = el('input', { type: 'number', min: 1, max: 5000, value: 120, step: 10, 'aria-label': 'Amount in euros', style: { width: '80px' } });
    const cents = () => Math.max(1, Math.round(+amt.value * 100) || 100);
    const bSnap = btn('', '', () => { st.snapOn = !st.snapOn; paint(); say('Snapshots ' + (st.snapOn ? '<b>on</b>: one every ' + SNAP_EVERY + ' events.' : '<b>off</b>: every load folds the whole stream.')); });
    const bUp = btn('', '', () => { st.upcast = !st.upcast; paint(); say('Upcaster ' + (st.upcast ? '<b>on</b>: v1 deposits are converted to v2 on read.' : '<b>off</b>: handlers only understand v2.')); });
    root.append(el('div', { class: 'w-controls' },
      el('label', null, '€ ', amt),
      btn('+ Deposit', 'primary', () => { if (command('dep', cents())) after('Deposited ' + money(cents())); }),
      btn('− Withdraw', '', () => { if (command('wd', cents())) after('Withdrawn ' + money(cents())); }),
      btn('Close', '', () => { if (command('close')) after('Closed'); }),
      btn('+ v1 legacy deposit', '', () => { if (!st.events.length || load().s.closed) { say('Open account first.'); return; } append('Deposited', { amount: (Math.random() * 90 + 10).toFixed(2) }, 1); after('Appended a <b>Deposited v1</b> event (amount stored as a string, as in an old release)'); }),
      btn('+20 random', '', () => { for (let i = 0; i < 20; i++) { const r = Math.random(); try { command(r < 0.6 ? 'dep' : 'wd', Math.round((Math.random() * 150 + 5)) * 100); } catch (e) { break; } } after('Appended a batch'); })));
    root.append(el('div', { class: 'w-controls' },
      btn('⟳ Rehydrate account', 'primary', rehydrate), btn('▶ Rebuild projections', 'primary', rebuild), bSnap, bUp,
      btn('Reset', '', () => { st.events = []; st.day = 0; seed(); paint(); say('New stream with 6 events.'); })));

    const stage = el('div', { class: 'w-stage' });
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Event stream' });
    stage.append(S); root.append(stage);
    stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b>D</b> deposit · <b>W</b> withdraw · <b>C</b> close · number = stream version. Dashed cell = <b>v1</b> schema. Accent bar after a cell = <b>snapshot</b>. Older events scroll off the top; the counts below include them.' }));
    const head = svg('text', { x: 4, y: 17, style: `font:600 ${F - 1}px var(--sans)`, fill: 'var(--text-3)' });
    S.append(head);
    const cells = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      const x = 2 + (i % COLS) * (CW + G), y = TOP + Math.floor(i / COLS) * (CH + G);
      const g = svg('g', null);
      const r = svg('rect', { x, y, width: CW, height: CH, rx: 6 });
      const t1 = svg('text', { x: x + CW / 2, y: y + 20, 'text-anchor': 'middle', style: `font:700 ${F + 1}px var(--mono)` });
      const t2 = svg('text', { x: x + CW / 2, y: y + 39, 'text-anchor': 'middle', style: `font:600 ${F - 1}px var(--mono)`, fill: 'var(--text-3)' });
      const sb = svg('rect', { x: x + CW + 0.5, y: y - 1, width: 3, height: CH + 2, fill: 'var(--accent)', opacity: 0 });
      g.append(r, t1, t2, sb); S.append(g);
      cells.push({ r, t1, t2, sb });
    }
    const stats = el('div', { class: 'w-stats' }), proj = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, proj, log);
    parts = { my, cells, head, stats, proj, log, COLS, ROWS, bSnap, bUp, cursor: -1, err: -1, flash: {} };
    paint();
  }

  function visibleStart() { const n = parts.COLS * parts.ROWS; return Math.max(0, Math.ceil((st.events.length - n) / parts.COLS) * parts.COLS); }
  function paint() {
    if (!parts) return;
    const start = visibleStart();
    parts.head.textContent = `stream acct-7 · ${st.events.length} events` + (start ? ` (showing from v${start + 1})` : '');
    parts.cells.forEach((c, i) => {
      const e = st.events[start + i];
      const idx = start + i;
      if (!e) { c.r.setAttribute('fill', 'var(--surface-2)'); c.r.setAttribute('stroke', 'var(--border)'); c.r.setAttribute('stroke-dasharray', ''); c.t1.textContent = ''; c.t2.textContent = ''; c.sb.setAttribute('opacity', 0); return; }
      const col = e.type === 'Deposited' ? 'var(--ok)' : e.type === 'Withdrawn' ? 'var(--warn)' : 'var(--err)';
      const hit = idx === parts.cursor, bad = idx === parts.err, fl = parts.flash[idx];
      c.r.setAttribute('fill', bad ? 'color-mix(in srgb, var(--err) 35%, var(--surface))' : hit || fl ? 'color-mix(in srgb, var(--accent) 40%, var(--surface))' : `color-mix(in srgb, ${col} 18%, var(--surface))`);
      c.r.setAttribute('stroke', bad ? 'var(--err)' : hit ? 'var(--accent)' : col);
      c.r.setAttribute('stroke-width', hit || bad ? 3 : 1.5);
      c.r.setAttribute('stroke-dasharray', e.v === 1 ? '5 3' : '');
      c.t1.textContent = e.type[0] + (e.v === 1 ? '¹' : '');
      c.t1.setAttribute('fill', col);
      c.t2.textContent = 'v' + e.version;
      c.sb.setAttribute('opacity', st.snapOn && e.version % 10 === 0 ? 1 : 0);
    });
    parts.bSnap.textContent = '📸 Snapshots: ' + (st.snapOn ? 'on' : 'off');
    parts.bUp.textContent = '⇪ Upcaster: ' + (st.upcast ? 'on' : 'off');
    let L = null; try { L = load(); } catch (e) { /* shown in log */ }
    const nAll = st.events.length;
    parts.stats.innerHTML = '';
    [['events in stream', nAll], ['load reads (no snapshot)', nAll], ['load reads (with snapshot)', L ? L.read + (L.from ? ' + 1 snap' : '') : '—'],
      ['aggregate balance', L ? money(L.s.balance) : '⚠ load fails'], ['state', L ? (L.s.closed ? 'closed' : 'open') : '—']]
      .forEach(([k, v]) => parts.stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function paintProj(p, upto) {
    parts.proj.innerHTML = '';
    const ms = Object.keys(p.months).slice(-3).map((m) => `${m} +${money(p.months[m].in)} −${money(p.months[m].out)}`).join(' · ') || '—';
    [['balance view', money(p.bal)], ['monthly statement', ms], ['fraud score', p.fraud + ' / 100' + (p.fraud >= 50 ? ' ⚠' : '')], ['replayed', upto + ' / ' + st.events.length]]
      .forEach(([k, v]) => parts.proj.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function say(t) { if (!parts) return; parts.log.prepend(el('div', { html: t })); while (parts.log.children.length > 30) parts.log.lastChild.remove(); }
  function after(msg) {
    const n = st.events.length;
    parts.flash = { [n - 1]: 1 }; parts.err = -1; paint();
    setTimeout(() => { if (parts) { parts.flash = {}; paint(); } }, 500);
    say(`${msg} → appended as <b>v${n}</b> with expected version ${n - 1}.` + (st.snapOn && n % SNAP_EVERY === 0 ? ' 📸 Snapshot taken.' : ''));
  }

  // replay animation: walk a cursor over events from index a to b
  function animate(a, b, onStep, onDone) {
    if (st.anim) st.anim.stop();
    if (ctx.reduced || b - a <= 0) { for (let i = a; i < b; i++) if (onStep(i) === false) return; onDone(); return; }
    const per = Math.max(25, Math.min(160, 2400 / (b - a)));
    let i = a, acc = 0;
    st.anim = ctx.loop((dt) => {
      acc += dt;
      while (acc >= per && i < b) {
        acc -= per; parts.cursor = i;
        if (onStep(i) === false) { st.anim.stop(); st.anim = null; parts.cursor = -1; paint(); return; }
        i++;
      }
      paint();
      if (i >= b) { st.anim.stop(); st.anim = null; parts.cursor = -1; paint(); onDone(); }
    });
  }
  function stepCheck(i) {
    try { upcastEv(st.events[i]); return true; } catch (err) { parts.err = i; paint(); say(`❌ Replay stopped at <b>v${i + 1}</b>: ${err.message}. Stored events are immutable, so fix the reader: turn the upcaster on.`); return false; }
  }
  function rehydrate() {
    parts.err = -1;
    const snap = snapshotFor(st.events.length), from = snap ? snap.version : 0;
    say(snap ? `Loading: snapshot at <b>v${from}</b>, then fold ${st.events.length - from} newer events.` : `Loading: no snapshot, fold all <b>${st.events.length}</b> events.`);
    animate(from, st.events.length, stepCheck, () => { const L = load(); say(`✓ Account rehydrated: ${money(L.s.balance)}, ${L.s.closed ? 'closed' : 'open'}, version ${L.s.version}. Read <b>${L.read}</b> events${from ? ' + 1 snapshot' : ''}.`); });
  }
  function rebuild() {
    parts.err = -1;
    say(`Rebuilding 3 projections from position 0. Snapshots do <b>not</b> help: read models need every event.`);
    animate(0, st.events.length, (i) => { if (!stepCheck(i)) return false; paintProj(project(i + 1), i + 1); return true; },
      () => { const p = project(st.events.length); paintProj(p, st.events.length); say(`✓ Projections rebuilt from ${st.events.length} events. Fraud score ${p.fraud}.`); });
  }
  function seed() {
    append('Deposited', { amount: '250.00' }, 1);
    [['Deposited', 120000], ['Withdrawn', 30000], ['Deposited', 45000], ['Withdrawn', 9000], ['Withdrawn', 120000]]
      .forEach(([t, c]) => append(t, { amountCents: c, currency: 'EUR' }));
  }

  seed();
  build(ctx.narrow);
  paintProj(project(st.events.length), st.events.length);
  say('Stream seeded with 6 events; the first is an old <b>v1</b> deposit. Try: <b>+20 random</b>, toggle snapshots, ⟳ rehydrate, then turn the upcaster off and ▶ rebuild.');
  ctx.onResize((n) => { build(n); paintProj(project(st.events.length), st.events.length); });
});
