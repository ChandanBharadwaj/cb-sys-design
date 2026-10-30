/* Event-time tumbling windows with a bounded-out-of-orderness watermark, allowed lateness and click_id dedup,
   compared with a naive processing-time counter and the ground truth. */
SD.widget('ad-click-aggregation', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 360, H = 232, WIN = 10, LX = 60, CW = 59, SPEED = 2;
  let delay = 5, late = 10, dedup = true, auto = true, st;

  function reset() {
    st = { now: 0, seq: 0, seen: new Set(), maxTs: -Infinity, wins: new Map(), pending: [], recent: [], acc: 0,
      recv: 0, dups: 0, refire: 0, dropped: 0 };
  }
  reset();
  const wm = () => st.maxTs - delay;
  function win(k) {
    if (!st.wins.has(k)) st.wins.set(k, { k, truth: new Set(), count: 0, naive: 0, fired: false, dots: [] });
    return st.wins.get(k);
  }

  // controls
  const dupBtn = el('button', { class: 'btn', text: '+ Duplicate' });
  const lateBtn = el('button', { class: 'btn', text: '+ Late click (−25 s)' });
  const autoBtn = el('button', { class: 'btn primary', text: '⏸ Pause stream' });
  const dedupBtn = el('button', { class: 'btn', text: 'Dedup: on' });
  const dOut = el('b', { text: delay + ' s' }), lOut = el('b', { text: late + ' s' });
  const dIn = el('input', { type: 'range', min: 0, max: 15, value: delay, 'aria-label': 'Watermark delay' });
  const lIn = el('input', { type: 'range', min: 0, max: 30, step: 5, value: late, 'aria-label': 'Allowed lateness' });
  dIn.addEventListener('input', () => { delay = +dIn.value; dOut.textContent = delay + ' s'; });
  lIn.addEventListener('input', () => { late = +lIn.value; lOut.textContent = late + ' s'; });
  dupBtn.addEventListener('click', () => { const r = st.recent[Math.floor(Math.random() * st.recent.length)]; if (r) { arrive(r.id, r.t, 'manual dup'); paint(); } });
  lateBtn.addEventListener('click', () => { arrive('c' + (++st.seq), st.now - 25, 'manual late'); paint(); });
  autoBtn.addEventListener('click', () => { auto = !auto; autoBtn.textContent = auto ? '⏸ Pause stream' : '▶ Resume stream'; });
  dedupBtn.addEventListener('click', () => { dedup = !dedup; dedupBtn.textContent = 'Dedup: ' + (dedup ? 'on' : 'off'); say('Dedup by click_id is now <b>' + (dedup ? 'on' : 'off') + '</b>.'); });
  root.append(el('div', { class: 'w-controls' }, autoBtn, dupBtn, lateBtn, dedupBtn));
  root.append(el('div', { class: 'w-controls' }, el('label', null, 'Watermark delay ', dOut, dIn), el('label', null, 'Allowed lateness ', lOut, lIn)));

  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Event-time windows' });
  const g = svg('g');
  S_.append(g);
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '600px' } }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); }
  say('Each column is a 10 s event-time window. Filled green = counted, hollow orange = duplicate dropped, blue = late but re-fired, red ring = too late (side output).');

  // the pipeline: one arriving event
  function arrive(id, t, why) {
    st.recv++;
    win(Math.floor(st.now / WIN)).naive++;                // naive: processing-time bucket, no dedup
    const w = win(Math.floor(t / WIN));
    w.truth.add(id);                                       // ground truth: unique clicks by event time
    if (st.seen.has(id) && dedup) { st.dups++; w.dots.push('dup'); if (why) say(`Duplicate <b>${id}</b> dropped by keyed state.`); return; }
    const isDup = st.seen.has(id);
    st.seen.add(id);
    if ((w.k + 1) * WIN + late <= wm()) {                  // later than allowed lateness → side output
      st.dropped++; w.dots.push('drop');
      say(`<b>${id}</b> (event t=${t.toFixed(0)} s) is past window end + lateness → <span style="color:var(--err)">side output</span>, counted only by reconciliation.`);
    } else {
      w.count++;
      if (w.fired) { st.refire++; w.dots.push('late'); say(`Late <b>${id}</b> → window [${w.k * WIN}, ${(w.k + 1) * WIN}) <b>re-fires</b>: ${w.count} (upsert overwrites).`); }
      else w.dots.push(isDup ? 'dupcount' : 'ok');
      if (isDup && why) say(`Duplicate <b>${id}</b> counted twice (dedup off).`);
    }
    st.maxTs = Math.max(st.maxTs, t);
    st.recent.push({ id, t }); if (st.recent.length > 12) st.recent.shift();
    fire();
  }
  function fire() {
    st.wins.forEach((w) => {
      if (!w.fired && (w.k + 1) * WIN <= wm()) {
        w.fired = true;
        const ok = w.count === w.truth.size;
        say(`WM ${wm().toFixed(1)} s passed ${(w.k + 1) * WIN} s → window [${w.k * WIN}, ${(w.k + 1) * WIN}) <b>fires</b>: ${w.count} <span style="color:var(--${ok ? 'ok' : 'warn'})">(truth so far ${w.truth.size})</span>`);
      }
    });
  }

  function paint() {
    g.innerHTML = '';
    const cur = Math.floor(st.now / WIN), k0 = cur - 4;
    const shut = (k) => (k + 1) * WIN <= wm();
    const tx = (t) => LX + (t - k0 * WIN) / (5 * WIN) * (5 * CW);
    // legend column
    [['truth', 182], ['stream', 202], ['naive', 222]].forEach(([l, y]) => g.append(svg('text', { x: 4, y, style: 'font:600 14px var(--sans)', fill: 'var(--text-2)', text: l })));
    g.append(svg('text', { x: 4, y: 162, style: 'font:600 13px var(--sans)', fill: 'var(--text-3)', text: 'start' }));
    for (let i = 0; i < 5; i++) {
      const k = k0 + i, w = st.wins.get(k) || { truth: new Set(), count: 0, naive: 0, fired: false, dots: [] };
      const x = LX + i * CW, fired = w.fired || shut(k);
      g.append(svg('rect', { x: x + 1, y: 34, width: CW - 3, height: 112, rx: 6, fill: fired ? 'color-mix(in srgb, var(--ok) 9%, var(--surface))' : 'var(--surface-2)', stroke: fired ? 'var(--ok)' : 'var(--border)' }));
      w.dots.slice(-28).forEach((d, j) => {
        const cx = x + 9 + (j % 4) * 13.5, cy = 46 + Math.floor(j / 4) * 14;
        const fill = d === 'ok' ? 'var(--ok)' : d === 'late' ? 'var(--accent)' : d === 'dupcount' ? 'var(--warn)' : 'none';
        const stroke = d === 'dup' ? 'var(--warn)' : d === 'drop' ? 'var(--err)' : 'none';
        g.append(svg('circle', { cx, cy, r: 5, fill, stroke, 'stroke-width': 2 }));
      });
      g.append(svg('text', { x: x + CW / 2, y: 162, 'text-anchor': 'middle', style: 'font:600 14px var(--mono)', fill: 'var(--text-2)', text: k * WIN + 's' }));
      const right = w.count === w.truth.size;
      g.append(svg('text', { x: x + CW / 2, y: 182, 'text-anchor': 'middle', style: 'font:700 14px var(--mono)', fill: 'var(--text)', text: w.truth.size }));
      g.append(svg('text', { x: x + CW / 2, y: 202, 'text-anchor': 'middle', style: 'font:700 14px var(--mono)', fill: !fired ? 'var(--text-3)' : right ? 'var(--ok)' : 'var(--err)', text: fired ? w.count : w.count + '…' }));
      g.append(svg('text', { x: x + CW / 2, y: 222, 'text-anchor': 'middle', style: 'font:700 14px var(--mono)', fill: w.naive === w.truth.size ? 'var(--text-2)' : 'var(--err)', text: w.naive }));
    }
    // event-time axis with watermark and now
    const wmx = Math.max(LX, Math.min(LX + 5 * CW, tx(wm()))), nx = Math.min(LX + 5 * CW, tx(st.now));
    g.append(svg('line', { x1: LX, y1: 28, x2: LX + 5 * CW, y2: 28, stroke: 'var(--border)', 'stroke-width': 2 }));
    g.append(svg('line', { x1: wmx, y1: 20, x2: wmx, y2: 146, stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
    g.append(svg('line', { x1: nx, y1: 20, x2: nx, y2: 146, stroke: 'var(--text-3)', 'stroke-width': 1.5 }));
    g.append(svg('text', { x: Math.max(LX + 24, Math.min(wmx - 3, nx - 38)), y: 16, 'text-anchor': 'end', style: 'font:700 14px var(--sans)', fill: 'var(--accent)', text: 'WM' }));
    g.append(svg('text', { x: nx - 3, y: 16, 'text-anchor': 'end', style: 'font:600 14px var(--sans)', fill: 'var(--text-3)', text: 'now' }));
    g.append(svg('text', { x: 4, y: 32, style: 'font:600 12px var(--sans)', fill: 'var(--text-3)', text: 'event t →' }));
    stats.innerHTML = '';
    [['received', st.recv], ['unique', st.seen.size], ['dups dropped', st.dups], ['late re-fires', st.refire], ['too late → recon', st.dropped], ['watermark lag', (st.now - wm()).toFixed(1) + ' s']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  function step(dt) {
    st.now += dt;
    if (auto) {
      st.acc += dt * 1.4;
      while (st.acc >= 1) {
        st.acc -= 1;
        const r = Math.random();
        const lag = r < 0.7 ? Math.random() * 2 : r < 0.95 ? 2 + Math.random() * 6 : 12 + Math.random() * 8;
        const id = 'c' + (++st.seq), t = st.now - lag;
        st.pending.push({ at: st.now, id, t });
        if (Math.random() < 0.1) st.pending.push({ at: st.now + 0.5 + Math.random() * 3, id, t }); // client retry
      }
    }
    st.pending.sort((a, b) => a.at - b.at);
    while (st.pending.length && st.pending[0].at <= st.now) { const p = st.pending.shift(); arrive(p.id, p.t); }
    // processing-time idle: watermark still only advances with data (as in Flink)
    const cut = Math.floor(st.now / WIN) - 8;
    st.wins.forEach((w, k) => { if (k < cut) st.wins.delete(k); });
  }
  function warm() { for (let i = 0; i < 400; i++) step(0.1); }   // 40 s of history so the view starts populated
  warm();
  let lastPaint = 0;
  ctx.loop((dt) => {
    dt = Math.min(dt, 100) / 1000 * SPEED;
    step(dt);
    lastPaint += dt;
    if (lastPaint > 0.25) { lastPaint = 0; paint(); }
  });
  paint();
});
