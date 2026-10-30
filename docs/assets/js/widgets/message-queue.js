/* One Kafka partition with RF = 3: leader append, follower fetch, ISR, high
   watermark, acks=1 vs acks=all, leader failover with log truncation. */
SD.widget('message-queue', function (root, ctx) {
  const { el, svg } = ctx;
  const MIN_ISR = 2, LAG_MAX = 3.0, FETCH_EVERY = 0.6, FETCH_MAX = 2;
  let acks = 'all', t = 0, fetchAcc = 0, nextVal = 1;
  let reps, leader, consumer, acked, lostAcked, failedSends, dead = null;

  // ---- controls
  const prodBtn = el('button', { class: 'btn primary', text: '▶ Produce ×3' });
  const ackBtn = el('button', { class: 'btn', text: 'acks = all' });
  const slowBtn = el('button', { class: 'btn', text: '🐢 Slow follower: off' });
  const killBtn = el('button', { class: 'btn', text: '✖ Kill leader' });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  root.append(el('div', { class: 'w-controls' }, prodBtn, ackBtn, killBtn, slowBtn, resetBtn));
  ackBtn.onclick = () => { acks = acks === 'all' ? '1' : 'all'; ackBtn.textContent = 'acks = ' + acks; say(`Producer switched to <b>acks=${acks}</b>.`); };

  const VW = (root.clientWidth || window.innerWidth) < 560 ? 360 : 820;
  const N = VW < 400 ? 10 : 24;                        // cells visible per row
  const LX = VW < 400 ? 92 : 112, CW = (VW - LX - 14) / N, RH = 62, TOP = 26;
  const H = TOP + 3 * RH + 52;
  const S = svg('svg', { viewBox: `0 0 ${VW} ${H}`, role: 'img', 'aria-label': 'Replicated partition log' });
  const g = svg('g'); S.append(g);
  root.append(el('div', { class: 'w-stage' }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (h) => { log.prepend(el('div', { html: h })); while (log.children.length > 30) log.lastChild.remove(); };
  const txt = (x, y, s, o) => svg('text', Object.assign({ x, y, text: s, style: `font:${(o && o.w) || 600} ${(o && o.px) || 12}px var(--sans)`, fill: (o && o.fill) || 'var(--text)' }, o && o.a ? { 'text-anchor': o.a } : {}));

  function reset() {
    reps = [1, 2, 3].map((id) => ({ id, log: [], alive: true, slow: false, inIsr: true, caught: 0 }));
    leader = 0; dead = null; consumer = 0; acked = 0; lostAcked = 0; failedSends = 0; t = 0; nextVal = 1;
    slowBtn.textContent = '🐢 Slow follower: off';
    log.innerHTML = '';
    say('Partition P0, replication factor 3, <code>min.insync.replicas=2</code>. Produce a few records to start.');
    draw();
  }
  const L = () => reps[leader];
  const isr = () => reps.filter((r) => r.alive && r.inIsr);
  const hw = () => Math.min(...isr().map((r) => r.log.length));

  prodBtn.onclick = () => {
    const ld = L();
    if (!ld.alive) { say('No leader yet. Wait for the controller to elect one.'); return; }
    if (acks === 'all' && isr().length < MIN_ISR) { failedSends += 3; say(`❌ NotEnoughReplicas: ISR is ${isr().length} &lt; min.insync.replicas ${MIN_ISR}. Write refused (no data at risk).`); draw(); return; }
    for (let i = 0; i < 3; i++) ld.log.push({ v: nextVal++, acked: false, lost: false, mode: acks });
    if (acks === '1') { ld.log.forEach((r) => { if (r.mode === '1' && !r.acked) { r.acked = true; acked++; } }); say(`acks=1: leader appended offsets ${ld.log.length - 3}–${ld.log.length - 1} and acked at once.`); }
    else say(`acks=all: offsets ${ld.log.length - 3}–${ld.log.length - 1} appended; ack waits until every ISR replica has them.`);
    draw();
  };
  slowBtn.onclick = () => {
    const f = reps.find((r, i) => i !== leader && r.alive);
    if (!f) return;
    const on = !reps.some((r) => r.slow);
    reps.forEach((r) => { r.slow = false; });
    if (on) f.slow = true;
    slowBtn.textContent = '🐢 Slow follower: ' + (on ? 'broker ' + f.id : 'off');
    say(on ? `Broker ${f.id} stops fetching (GC pause / bad disk). After ${LAG_MAX}s it leaves the ISR.` : 'Follower healthy again; it catches up and rejoins the ISR.');
  };
  killBtn.onclick = () => {
    if (dead) {                                    // restart the dead broker
      const r = dead; dead = null; r.alive = true; r.slow = false;
      killBtn.textContent = '✖ Kill leader';
      if (r === L()) { say(`Broker ${r.id} is back. It was the last in-sync replica, so it leads again.`); draw(); return; }
      rejoin(r); return;
    }
    const old = L();
    old.alive = false; dead = old;
    killBtn.textContent = '↻ Restart broker ' + old.id;
    const cands = reps.filter((r) => r.alive && r.inIsr);
    say(`💥 Broker ${old.id} (leader) died with LEO ${old.log.length}.`);
    if (!cands.length) { say('No in-sync replica left: partition offline (unclean election disabled).'); draw(); return; }
    const nl = cands.sort((a, b) => b.log.length - a.log.length)[0];
    leader = reps.indexOf(nl);
    const end = nl.log.length;
    let lost = 0;
    old.log.slice(end).forEach((r) => { r.lost = true; if (r.acked) lost++; });
    lostAcked += lost;
    reps.forEach((r) => { if (r !== nl && r.alive && r.log.length > end) r.log.length = end; });
    say(`Controller elects broker ${nl.id} from the ISR (LEO ${end}). ` + (lost ? `<b style="color:var(--err)">${lost} acked record(s) lost</b>: they were only on the dead leader (acks=1).` : 'No acked record lost.'));
    draw();
  };
  function rejoin(r) {
    const end = L().log.length;
    const extra = r.log.length - end;
    r.log = L().log.slice(0, Math.min(r.log.length, end)).map((x) => x); // truncate to new leader's log
    r.inIsr = false; r.caught = t;
    say(`Broker ${r.id} restarts as a follower` + (extra > 0 ? `, <b>truncates ${extra}</b> uncommitted record(s)` : '') + ', then fetches to catch up.');
    draw();
  }
  resetBtn.onclick = () => { acks = 'all'; ackBtn.textContent = 'acks = all'; killBtn.textContent = '✖ Kill leader'; reset(); };

  function tick(dt) {
    t += dt; fetchAcc += dt;
    const ld = L();
    if (fetchAcc >= FETCH_EVERY && ld.alive) {
      fetchAcc = 0;
      reps.forEach((r, i) => {
        if (i === leader || !r.alive) return;
        if (!r.slow) { const n = Math.min(FETCH_MAX, ld.log.length - r.log.length); for (let k = 0; k < n; k++) r.log.push(ld.log[r.log.length]); }
        if (r.log.length >= ld.log.length) { r.caught = t; if (!r.inIsr) { r.inIsr = true; say(`Broker ${r.id} caught up: rejoins the ISR.`); } }
        else if (r.inIsr && t - r.caught > LAG_MAX) { r.inIsr = false; say(`Broker ${r.id} lagged &gt; ${LAG_MAX}s: removed from ISR. HW now follows the remaining ISR.`); }
      });
      const h = hw();
      ld.log.forEach((r, o) => { if (o < h && !r.acked) { r.acked = true; acked++; } });
      if (consumer < h) consumer++;
    }
  }

  function draw() {
    g.innerHTML = '';
    const ld = L(), h = ld.alive ? hw() : 0, leo = ld.log.length;
    const first = Math.max(0, Math.max(leo, ...reps.map((r) => r.log.length)) - N + 1);
    const cx = (o) => LX + (o - first) * CW;
    g.append(txt(VW - 6, 16, `offsets ${first}…${first + N - 1}`, { px: 11, w: 500, a: 'end', fill: 'var(--text-3)' }));
    reps.forEach((r, i) => {
      const y = TOP + i * RH;
      const role = !r.alive ? 'dead' : i === leader ? 'leader' : r.inIsr ? 'follower · ISR' : 'out of ISR';
      g.append(txt(6, y + 20, 'Broker ' + r.id, { px: 13, w: 700, fill: r.alive ? 'var(--text)' : 'var(--text-3)' }),
        txt(6, y + 37, role, { px: 11, w: 600, fill: !r.alive ? 'var(--err)' : i === leader ? 'var(--accent)' : r.inIsr ? 'var(--ok)' : 'var(--warn)' }));
      for (let o = first; o < first + N; o++) {
        const rec = r.log[o];
        const fill = !rec ? 'var(--surface)' : rec.lost ? 'color-mix(in srgb, var(--err) 40%, var(--surface))' : o < h ? 'color-mix(in srgb, var(--accent) 45%, var(--surface))' : 'color-mix(in srgb, var(--warn) 30%, var(--surface))';
        g.append(svg('rect', { x: cx(o) + 1, y: y + 6, width: CW - 2, height: 36, rx: 4, fill, stroke: 'var(--border)', opacity: r.alive ? 1 : 0.55 }));
        if (rec) g.append(txt(cx(o) + CW / 2, y + 28, String(o), { px: CW < 24 ? 9 : 10, w: 600, a: 'middle', fill: 'var(--text)' }));
      }
      const L2 = r.log.length;
      if (L2 >= first && L2 <= first + N) g.append(svg('path', { d: `M${cx(L2)},${y + 44} l-5,9 h10 z`, fill: 'var(--text-2)' }), txt(cx(L2), y + 60, 'LEO', { px: 10, a: 'middle', fill: 'var(--text-2)' }));
    });
    if (ld.alive && h >= first && h <= first + N) {
      g.append(svg('line', { x1: cx(h), x2: cx(h), y1: TOP, y2: TOP + 3 * RH - 4, stroke: 'var(--ok)', 'stroke-width': 2.5, 'stroke-dasharray': '5 3' }),
        txt(cx(h), TOP - 2, 'HW ' + h, { px: 11, w: 700, a: 'middle', fill: 'var(--ok)' }));
    }
    const cy = TOP + 3 * RH + 14;
    g.append(txt(6, cy + 14, 'Consumer', { px: 12, w: 700 }));
    if (consumer >= first && consumer <= first + N) g.append(svg('path', { d: `M${cx(consumer)},${cy} l-6,12 h12 z`, fill: 'var(--accent)' }), txt(cx(consumer), cy + 26, 'next ' + consumer, { px: 10, a: 'middle', fill: 'var(--accent)' }));
    stats.innerHTML = '';
    [['acks', acks], ['ISR', isr().map((r) => r.id).join(',') || '–'], ['leader LEO', leo], ['HW', ld.alive ? h : '–'], ['acked', acked], ['acked but lost', lostAcked], ['refused', failedSends]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b style="${k === 'acked but lost' && v ? 'color:var(--err)' : ''}">${v}</b>` })));
  }

  reset();
  if (ctx.reduced) say('Reduced motion: followers still fetch, without animation.');
  let acc = 0;
  ctx.loop((dt) => { tick(Math.min(dt, 100) / 1000); acc += dt; if (acc > 200) { acc = 0; draw(); } });
});
