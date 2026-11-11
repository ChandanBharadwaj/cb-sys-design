/* Three buyers race for one seat under four concurrency strategies, simulated against a single
   Postgres-style row lock (READ COMMITTED: a blocked UPDATE re-checks its WHERE after the winner commits).
   Held seats count down and either sell or expire back to the pool. */
SD.widget('ticket-booking', function (root, ctx) {
  const { el, svg } = ctx;
  // Two layouts: desktop (viewBox 500 wide) and phone (360 wide, bigger text). Seat state survives a rebuild.
  const COLS = 8, ROWS = 4;
  const GEO = {
    wide: { W: 500, SW: 48, SH: 28, GX: 56, GY: 35, SX: 54, SY: 42, LY: 196, LH: 40, TX0: 66, TX1: 490, f: { seat: 14, stage: 12, name: 14, res: 12, ms: 12, hint: 14 } },
    narrow: { W: 360, SW: 38, SH: 30, GX: 42, GY: 38, SX: 33, SY: 48, LY: 210, LH: 46, TX0: 62, TX1: 352, f: { seat: 14, stage: 14, name: 15, res: 14, ms: 13, hint: 14 } }
  };
  let G = ctx.narrow ? GEO.narrow : GEO.wide;
  const BUYERS = [['Ann', 'var(--k-client)'], ['Ben', 'var(--k-queue)'], ['Cy', 'var(--k-compute)']];
  const SEG = { read: ['var(--text-3)', 'read'], think: ['var(--border)', 'app logic'], wait: ['var(--warn)', 'lock wait'], write: ['var(--accent)', 'UPDATE'], commit: ['var(--ok)', 'commit'], fail: ['var(--err)', '0 rows / abort'] };
  const STRATS = [['none', 'No locking (broken)'], ['pess', 'SELECT … FOR UPDATE'], ['opt', '@Version'], ['cond', 'Conditional UPDATE']];
  let strat = 'cond', ttl = 10, busy = false, race = null;
  let stats = { sold: 0, double: 0, wait: 0, conflicts: 0, expired: 0 };

  const seats = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) seats.push({ id: 'ABCD'[r] + (c + 1), r, c, st: 'free', owner: null, t: 0, payAt: 0 });
  const sx = (s) => G.SX + s.c * G.GX, sy = (s) => G.SY + s.r * G.GY;

  // controls
  const sBtns = STRATS.map(([v, l]) => el('button', { class: 'btn' + (v === strat ? ' primary' : ''), text: l, onclick: () => { if (busy) return; strat = v; sBtns.forEach((b, i) => b.className = 'btn' + (STRATS[i][0] === strat ? ' primary' : '')); } }));
  const raceBtn = el('button', { class: 'btn primary', text: '▶ Race on a free seat', onclick: () => { const f = seats.filter((s) => s.st === 'free'); if (f.length) start(f[Math.floor(Math.random() * f.length)]); } });
  const tOut = el('b', { text: ttl + ' s' });
  const tIn = el('input', { type: 'range', min: 4, max: 20, value: ttl, 'aria-label': 'Hold TTL' });
  tIn.addEventListener('input', () => { ttl = +tIn.value; tOut.textContent = ttl + ' s'; });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset', onclick: () => { if (busy) return; seats.forEach((s) => { s.st = 'free'; s.owner = null; }); stats = { sold: 0, double: 0, wait: 0, conflicts: 0, expired: 0 }; race = null; say('Reset.'); } });
  root.append(el('div', { class: 'w-controls' }, sBtns), el('div', { class: 'w-controls' }, raceBtn, el('label', null, 'Hold TTL (demo) ', tOut, ' ', tIn), resetBtn));

  const S_ = svg('svg', { style: 'max-width:680px;margin:0 auto;', role: 'img', 'aria-label': 'Seat map and transaction lanes' });
  const gSeats = svg('g'), gLanes = svg('g'), gStatic = svg('g');
  S_.append(gStatic, gSeats, gLanes);
  // lane legend lives in HTML so it never shrinks on a phone
  const legend = el('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 14px', fontSize: '12.5px', color: 'var(--text-2)', margin: '6px 0 2px' } },
    Object.values(SEG).map(([c, l]) => el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, el('i', { style: { width: '11px', height: '11px', borderRadius: '2px', background: c, display: 'inline-block' } }), l)));
  root.append(el('div', { class: 'w-stage' }, S_), legend);
  const statEl = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(statEl, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); };
  const T = (x, y, text, w, size, fill, fam) => svg('text', { x, y, 'text-anchor': 'middle', fill: fill || 'var(--text)', style: `font:${w} ${size}px var(${fam || '--sans'})`, text });

  // static: stage, lane labels
  function drawStatic() {
    const H = G.LY + 3 * G.LH + 6;
    S_.setAttribute('viewBox', `0 0 ${G.W} ${H}`);
    gStatic.innerHTML = '';
    gStatic.append(svg('rect', { x: G.SX - G.SW / 2, y: 4, width: (COLS - 1) * G.GX + G.SW, height: G.f.stage + 8, rx: 9, fill: 'var(--surface-2)', stroke: 'var(--border)' }), T(G.SX + (COLS - 1) * G.GX / 2, 8 + G.f.stage * 0.8, 'STAGE', 700, G.f.stage, 'var(--text-3)'));
    BUYERS.forEach(([n, c], i) => {
      const y = G.LY + i * G.LH + 14;
      gStatic.append(svg('circle', { cx: 10, cy: y, r: 6, fill: c }), svg('text', { x: 21, y: y + 5, fill: 'var(--text)', style: `font:700 ${G.f.name}px var(--sans)`, text: n }));
      gStatic.append(svg('line', { x1: G.TX0, x2: G.TX1, y1: y, y2: y, stroke: 'var(--border)', 'stroke-dasharray': '2 4' }));
    });
  }
  drawStatic();
  ctx.onResize((n) => { G = n ? GEO.narrow : GEO.wide; drawStatic(); render(); });

  // ---- simulate one race on one row lock (times in ms of DB time) ----
  function simulate(kind) {
    const st0 = [0, 1 + Math.random() * 3, 2 + Math.random() * 4].sort(() => Math.random() - 0.5);
    const lanes = BUYERS.map(() => []);
    const res = BUYERS.map(() => ({ ok: false, waited: 0 }));
    const order = [0, 1, 2].sort((a, b) => st0[a] - st0[b]);
    let lockFree = 0, taken = false;
    const seg = (i, k, a, b) => { if (b > a) lanes[i].push({ k, a, b }); if (k === 'wait') res[i].waited += b - a; };
    if (kind === 'none') {
      order.forEach((i) => { const s = st0[i]; seg(i, 'read', s, s + 6); seg(i, 'think', s + 6, s + 16); seg(i, 'write', s + 16, s + 20); seg(i, 'commit', s + 20, s + 23); res[i].ok = true; });
    } else if (kind === 'pess') {
      order.forEach((i) => {
        const s = st0[i], got = Math.max(s, lockFree); seg(i, 'wait', s, got);
        if (!taken) { seg(i, 'read', got, got + 6); seg(i, 'think', got + 6, got + 16); seg(i, 'write', got + 16, got + 20); seg(i, 'commit', got + 20, got + 23); lockFree = got + 23; taken = true; res[i].ok = true; }
        else { seg(i, 'read', got, got + 6); seg(i, 'fail', got + 6, got + 9); lockFree = got + 9; }
      });
    } else if (kind === 'opt') {
      const w = order.map((i) => st0[i] + 16);
      order.forEach((i, j) => {
        const s = st0[i]; seg(i, 'read', s, s + 6); seg(i, 'think', s + 6, s + 16);
        const at = Math.max(w[j], lockFree); seg(i, 'wait', w[j], at);
        if (!taken) { seg(i, 'write', at, at + 4); seg(i, 'commit', at + 4, at + 7); lockFree = at + 7; taken = true; res[i].ok = true; }
        else { seg(i, 'fail', at, at + 3); }
      });
    } else {
      order.forEach((i) => {
        const s = st0[i] + 2, at = Math.max(s, lockFree); seg(i, 'wait', s, at);
        if (!taken) { seg(i, 'write', at, at + 4); seg(i, 'commit', at + 4, at + 6); lockFree = at + 6; taken = true; res[i].ok = true; }
        else seg(i, 'fail', at, at + 2);
      });
    }
    const end = Math.max(...lanes.flat().map((x) => x.b));
    return { lanes, res, end, order };
  }

  function start(seat) {
    if (busy) return;
    if (seat.st !== 'free') { say(`${seat.id} is ${seat.st === 'held' ? 'on hold' : 'sold'}. Pick a green seat.`); return; }
    busy = true; raceBtn.disabled = true;
    const sim = simulate(strat);
    race = { seat, sim, cursor: ctx.reduced ? sim.end : 0, done: false };
    say(`<b>${STRATS.find((s) => s[0] === strat)[1]}</b>: Ann, Ben and Cy all try to hold <b>${seat.id}</b> within a few ms.`);
  }
  function finish() {
    const { seat, sim } = race;
    const winners = sim.res.map((r, i) => (r.ok ? i : -1)).filter((i) => i >= 0);
    const waited = sim.res.reduce((a, r) => a + r.waited, 0);
    stats.wait += waited; stats.conflicts += sim.res.filter((r) => !r.ok).length;
    if (winners.length > 1) {
      seat.st = 'double'; seat.owner = winners.map((i) => BUYERS[i][0][0]).join('');
      stats.double++;
      say(`<b style="color:var(--err)">❌ Double sale.</b> All three read AVAILABLE, all wrote HELD, all got a confirmation. The last write silently overwrote the others (lost update).`);
    } else {
      const w = winners[0];
      seat.st = 'held'; seat.owner = w; seat.t = 0;
      seat.payAt = Math.random() < 0.55 ? ttl * (0.3 + Math.random() * 0.6) : Infinity;
      const why = { pess: 'Losers waited for the row lock, then read HELD and rolled back.', opt: 'Losers did all their work, then their UPDATE … WHERE version = 1 matched 0 rows (OptimisticLockException).', cond: 'Losers\' UPDATE waited a moment for the winner\'s commit, re-checked status = \'AVAILABLE\', matched 0 rows: instant "seat taken".' }[strat];
      say(`✅ <b>${BUYERS[w][0]}</b> holds ${seat.id} for ${ttl} s. ${why} Total lock wait: ${waited.toFixed(1)} ms.`);
    }
    race.done = true; busy = false; raceBtn.disabled = false;
  }

  // ---- loop: advance race cursor, hold timers; render ----
  ctx.loop((dt) => {
    if (race && !race.done) { race.cursor += dt / 28; if (race.cursor >= race.sim.end) { race.cursor = race.sim.end; finish(); } }
    seats.forEach((s) => {
      if (s.st !== 'held') return;
      s.t += dt / 1000;
      if (s.t >= s.payAt) { s.st = 'sold'; stats.sold++; say(`💳 ${BUYERS[s.owner][0]} paid. ${s.id}: <code>UPDATE … SET status='SOLD' WHERE hold_id=? AND hold_until &gt; now()</code> → SOLD.`); }
      else if (s.t >= ttl) { s.st = 'free'; stats.expired++; say(`⌛ ${BUYERS[s.owner][0]}'s hold on ${s.id} expired unpaid. The seat is available again.`); s.owner = null; }
    });
    render();
  });

  function render() {
    gSeats.innerHTML = ''; gLanes.innerHTML = '';
    const f = G.f;
    seats.forEach((s) => {
      const target = race && !race.done && race.seat === s, x = sx(s), y = sy(s);
      const fill = { free: 'color-mix(in srgb, var(--ok) 18%, var(--surface))', held: 'color-mix(in srgb, var(--warn) 30%, var(--surface))', sold: 'var(--surface-2)', double: 'color-mix(in srgb, var(--err) 35%, var(--surface))' }[s.st];
      const g = svg('g', { style: 'cursor:pointer' });
      g.append(svg('rect', { x: x - G.SW / 2, y: y - G.SH / 2, width: G.SW, height: G.SH, rx: 6, fill, stroke: target ? 'var(--accent)' : s.st === 'double' ? 'var(--err)' : 'var(--border)', 'stroke-width': target ? 2.5 : 1 }));
      const label = s.st === 'held' ? BUYERS[s.owner][0] : s.st === 'sold' ? '✓' : s.st === 'double' ? '×' + s.owner.length : s.id;
      g.append(T(x, y + 5, label, 700, f.seat, s.st === 'sold' ? 'var(--text-3)' : 'var(--text)'));
      if (s.st === 'held') g.append(svg('rect', { x: x - G.SW / 2 + 3, y: y + G.SH / 2 - 4, width: Math.max(0, (G.SW - 6) * (1 - s.t / ttl)), height: 3, rx: 1, fill: 'var(--warn)' }));
      g.addEventListener('click', () => start(s));
      gSeats.append(g);
    });
    if (!race) { gLanes.append(T((G.TX0 + G.TX1) / 2, G.LY + G.LH * 1.5 + 4, 'Tap a green seat to start a race', 500, f.hint, 'var(--text-3)')); }
    else {
      const sc = (G.TX1 - G.TX0) / Math.max(30, race.sim.end);
      race.sim.lanes.forEach((segs, i) => {
        const y = G.LY + i * G.LH + 3;
        segs.forEach((g) => {
          if (g.a > race.cursor) return;
          const b = Math.min(g.b, race.cursor);
          gLanes.append(svg('rect', { x: G.TX0 + g.a * sc, y, width: Math.max(1, (b - g.a) * sc), height: 22, rx: 4, fill: SEG[g.k][0], stroke: g.k === 'think' ? 'var(--text-3)' : 'none', 'stroke-width': 0.6 }));
        });
        if (race.done) {
          const r = race.sim.res[i], dbl = race.seat.st === 'double';
          gLanes.append(T(G.TX1 - 40, y + 22 + f.res + 1, dbl ? 'confirmed?!' : r.ok ? 'got it' : 'taken', 700, f.res, dbl ? 'var(--err)' : r.ok ? 'var(--ok)' : 'var(--text-3)'));
        }
      });
      gLanes.append(T(G.TX1 - 70, G.LY - 8, Math.round(race.cursor) + ' ms (DB time)', 600, f.ms, 'var(--text-3)', '--mono'));
    }
    statEl.innerHTML = '';
    const held = seats.filter((s) => s.st === 'held').length;
    Object.entries({ held, sold: stats.sold, expired: stats.expired, 'double-sold': stats.double, 'lock wait': stats.wait.toFixed(1) + ' ms', 'lost races': stats.conflicts })
      .forEach(([k, v]) => statEl.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  render();
  let shown = false;
  ctx.onVisible((v) => { if (v && !shown) { shown = true; setTimeout(() => start(seats[3]), 300); } });
  say('Tip: switch to <b>No locking</b> and race. Then compare lock waits between FOR UPDATE and Conditional UPDATE.');
});
