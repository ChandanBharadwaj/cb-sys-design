/* Order saga lab: choreography vs orchestration, compensations in reverse, dual write vs outbox, duplicate delivery vs inbox. */
SD.widget('event-driven-sagas', function (root, ctx) {
  const { el, svg } = ctx;
  const SVC = [
    { id: 'order', name: 'Order', doS: 'PENDING', undoS: 'CANCELLED', okS: 'APPROVED', ev: 'OrderCreated', cmd: 'CreateOrder', undoCmd: 'CancelOrder', undoEv: 'OrderCancelled' },
    { id: 'pay', name: 'Payment', doS: 'charged $40', undoS: 'refunded $40', ev: 'PaymentCaptured', cmd: 'CapturePayment', undoCmd: 'RefundPayment', undoEv: 'PaymentRefunded', rej: 'CardDeclined' },
    { id: 'inv', name: 'Inventory', doS: 'reserved 1', undoS: 'released', ev: 'StockReserved', cmd: 'ReserveStock', undoCmd: 'ReleaseStock', undoEv: 'StockReleased', rej: 'OutOfStock' },
    { id: 'ship', name: 'Shipping', doS: 'courier booked', undoS: 'booking cancelled', ev: 'ShipmentBooked', cmd: 'BookShipment', undoCmd: 'CancelShipment', undoEv: 'ShipmentCancelled', rej: 'NoCourier' }
  ];
  const opt = { view: 'choreo', fail: -1, pub: 'outbox', crash: false, dupe: false, idem: true };
  let gen = 0, tween = null, loopH = null, busy = false;
  const st = { charges: 0, msgs: 0, comps: 0, outcome: '—' };

  function seg(label, key, options, after) {
    const wrap = el('div', { class: 'w-seg', role: 'group', 'aria-label': label });
    const btns = options.map(([v, l]) => {
      const b = el('button', { class: 'btn', text: l });
      b.onclick = () => { if (busy) return; opt[key] = v; sync(); if (after) after(); };
      b._v = v; wrap.append(b); return b;
    });
    const sync = () => btns.forEach((b) => b.classList.toggle('primary', opt[key] === b._v));
    sync(); return el('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, label + ' ', wrap);
  }
  function toggle(label, key, after) {
    const b = el('button', { class: 'btn' });
    const sync = () => { b.textContent = label + ': ' + (opt[key] ? 'on' : 'off'); b.classList.toggle('primary', !!opt[key]); };
    b.onclick = () => { if (busy) return; opt[key] = !opt[key]; sync(); if (after) after(); };
    sync(); return b;
  }

  function build(narrow) {
    const my = ++gen; busy = false; tween = null;
    if (loopH) loopH.stop();
    root.innerHTML = '';
    const failSel = el('select', { 'aria-label': 'Inject failure' });
    [['-1', 'no failure'], ['1', 'at Payment'], ['2', 'at Inventory'], ['3', 'at Shipping']].forEach(([v, t]) => failSel.append(el('option', { value: v, text: t })));
    failSel.value = String(opt.fail);
    failSel.addEventListener('change', () => { opt.fail = +failSel.value; });
    const run = el('button', { class: 'btn primary', text: '▶ Run saga' });
    run.onclick = () => go();
    root.append(el('div', { class: 'w-controls' },
      seg('View', 'view', [['choreo', 'Choreography'], ['orch', 'Orchestration']], () => drawHub()),
      el('label', null, 'Fail ', failSel),
      seg('Publish', 'pub', [['outbox', 'Outbox'], ['dual', 'Dual write']]),
      toggle('💥 Crash after DB commit', 'crash'),
      toggle('⧉ Deliver twice', 'dupe'),
      toggle('🛡 Idempotent', 'idem'),
      run));

    // geometry: phone = 360-wide, services stacked, hub bar on the right; desktop = 700-wide, hub bar on top
    const W = narrow ? 360 : 700, H = narrow ? 330 : 250;
    const box = (i) => narrow ? { x: 8, y: 10 + i * 80, w: 242, h: 68 } : { x: 20 + i * 168, y: 140, w: 152, h: 92 };
    const hub = narrow ? { x: 266, y: 10, w: 86, h: 308 } : { x: 20, y: 18, w: 656, h: 52 };
    const port = (i) => { const b = box(i); return narrow ? [b.x + b.w, b.y + b.h / 2] : [b.x + b.w / 2, b.y]; };
    const hubPt = (i) => { const p = port(i); return narrow ? [hub.x + hub.w / 2, p[1]] : [p[0], hub.y + hub.h / 2]; };

    const stage = el('div', { class: 'w-stage' });
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Order saga across four services' });
    stage.append(S); root.append(stage);
    const legend = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' } });
    stage.append(legend);
    const stats = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);

    const T = (x, y, t, f, w, fill, a, extra) => svg('text', Object.assign({ x, y, text: t, 'text-anchor': a || 'start', fill: fill || 'var(--text)', style: `font:${w || 600} ${f}px var(--sans)` }, extra));
    const hubR = svg('rect', { x: hub.x, y: hub.y, width: hub.w, height: hub.h, rx: 10, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 2 });
    const hubT = narrow
      ? T(0, 0, '', 14, 700, 'var(--text)', 'middle', { transform: `translate(${hub.x + hub.w / 2 - 8},${hub.y + hub.h / 2}) rotate(-90)` })
      : T(hub.x + 14, hub.y + 22, '', 15, 700);
    const hubS = narrow
      ? T(0, 0, '', 13, 500, 'var(--text-3)', 'middle', { transform: `translate(${hub.x + hub.w / 2 + 12},${hub.y + hub.h / 2}) rotate(-90)` })
      : T(hub.x + 14, hub.y + 42, '', 13, 500, 'var(--text-3)');
    S.append(hubR, hubT, hubS);
    SVC.forEach((s, i) => { const a = port(i), b = hubPt(i); S.append(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'var(--border)', 'stroke-width': 2, 'stroke-dasharray': '4 4' })); });
    const R = SVC.map((s, i) => {
      const b = box(i);
      const r = svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 10, fill: 'var(--surface)', stroke: 'var(--border)', 'stroke-width': 2 });
      const n = T(b.x + 12, b.y + 24, (i + 1) + '. ' + s.name, 15, 700);
      const v = T(b.x + 12, b.y + (narrow ? 48 : 50), 'idle', 14, 600, 'var(--text-3)');
      const x = T(narrow ? b.x + b.w - 10 : b.x + 12, narrow ? b.y + 24 : b.y + 76, '', 13, 600, 'var(--text-3)', narrow ? 'end' : 'start');
      S.append(r, n, v, x);
      return { r, v, x };
    });
    const dot = svg('circle', { r: 7, fill: 'var(--accent)', opacity: 0 });
    const dotT = T(0, 0, '', 13, 700, 'var(--accent)', 'middle', { style: 'font:700 13px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:4px' });
    S.append(dot, dotT);

    function drawHub() {
      const o = opt.view === 'orch';
      hubT.textContent = o ? 'Orchestrator' : 'Kafka';
      hubS.textContent = o ? 'Temporal · state' : 'events · at-least-once';
      hubR.setAttribute('stroke', o ? 'var(--accent)' : 'var(--border)');
      legend.innerHTML = o
        ? '<b>Orchestration</b>: the workflow sends a <b>command</b> to each service, waits for the reply, and on failure sends compensating commands in reverse.'
        : '<b>Choreography</b>: each service reacts to the previous service\'s <b>event</b>. On failure, a rejection event travels back and each service compensates itself.';
    }
    function setBox(i, text, tone, extra) {
      R[i].v.textContent = text;
      const c = { ok: 'var(--ok)', err: 'var(--err)', warn: 'var(--warn)', info: 'var(--accent)', idle: 'var(--text-3)' }[tone || 'idle'];
      R[i].v.setAttribute('fill', c); R[i].r.setAttribute('stroke', tone && tone !== 'idle' ? c : 'var(--border)');
      if (extra !== undefined) R[i].x.textContent = extra;
    }
    function paintStats() {
      stats.innerHTML = '';
      [['saga', st.outcome], ['messages', st.msgs], ['compensations', st.comps], ['customer charged', '$' + st.charges * 40]]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); }

    // animate a message: service → hub → (along hub) → service. Path = polyline points.
    function send(fromI, toI, label, tone) {
      st.msgs++; paintStats();
      const pts = [];
      if (fromI >= 0) pts.push(port(fromI), hubPt(fromI)); else pts.push(hubPt(toI < 0 ? 0 : toI));
      if (toI >= 0) pts.push(hubPt(toI), port(toI));
      dot.setAttribute('fill', tone === 'undo' ? 'var(--warn)' : tone === 'err' ? 'var(--err)' : 'var(--accent)');
      dotT.setAttribute('fill', dot.getAttribute('fill'));
      dotT.textContent = label;
      if (ctx.reduced) return Promise.resolve();
      return new Promise((res) => { tween = { pts, t: 0, dur: 450 + 250 * (pts.length - 1), res }; });
    }
    const wait = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));
    loopH = ctx.loop((dt) => {
      if (!tween) { dot.setAttribute('opacity', 0); dotT.setAttribute('opacity', 0); return; }
      tween.t += dt; const p = Math.min(1, tween.t / tween.dur), P = tween.pts;
      const lens = []; let tot = 0;
      for (let k = 1; k < P.length; k++) { const l = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); lens.push(l); tot += l; }
      let d = p * tot, k = 0; while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
      const f = lens[k] ? d / lens[k] : 1, x = P[k][0] + (P[k + 1] ? (P[k + 1][0] - P[k][0]) * f : 0), y = P[k][1] + (P[k + 1] ? (P[k + 1][1] - P[k][1]) * f : 0);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('opacity', 1);
      const lx = narrow ? Math.min(Math.max(x - 60, 70), 190) : Math.min(Math.max(x, 70), W - 70);
      dotT.setAttribute('x', lx); dotT.setAttribute('y', narrow ? y - 12 : y - 12); dotT.setAttribute('opacity', 1);
      if (p >= 1) { const r = tween.res; tween = null; r(); }
    });

    function reset() {
      st.charges = 0; st.msgs = 0; st.comps = 0; st.outcome = 'running';
      SVC.forEach((s, i) => setBox(i, 'idle', 'idle', ''));
      paintStats();
    }

    async function go() {
      if (busy) return; busy = true; run.disabled = true;
      const g = gen, alive = () => g === gen;
      reset(); log.innerHTML = '';
      const orch = opt.view === 'orch', fail = opt.fail;
      say(`▶ New order, ${orch ? 'orchestrated' : 'choreographed'}, publish via <b>${opt.pub === 'outbox' ? 'outbox' : 'dual write'}</b>${fail > 0 ? `, failure injected at <b>${SVC[fail].name}</b>` : ''}.`);
      // Step 0: Order commits PENDING and must publish OrderCreated
      setBox(0, 'PENDING', 'info', opt.pub === 'outbox' ? '+ outbox row' : 'DB only');
      if (opt.crash) {
        await wait(400); if (!alive()) return;
        if (opt.pub === 'dual') {
          setBox(0, 'PENDING forever', 'err', 'event lost');
          say('💥 Pod killed after <code>COMMIT</code>, before <code>kafka.send()</code>. The order exists, the event never will. Nobody downstream hears of it: <b>stuck PENDING</b>.');
          st.outcome = 'STUCK (lost event)'; paintStats(); return done();
        }
        say('💥 Pod killed after <code>COMMIT</code>. The event is safe in the <b>outbox</b>; the relay publishes it once it is back.');
        await wait(500); if (!alive()) return;
      }
      const done_ = [0];
      for (let i = 1; i < SVC.length; i++) {
        const s = SVC[i];
        if (orch) { await send(-1, i, s.cmd); }
        else { await send(i - 1, i, SVC[i - 1].ev); }
        if (!alive()) return;
        if (i === fail) {
          setBox(i, s.rej + ' ✖', 'err');
          say(`✖ <b>${s.name}</b> rejects: <code>${s.rej}</code>. A business "no": retrying will not help. Its local transaction committed nothing.`);
          if (orch) { await send(i, -1, s.rej, 'err'); if (!alive()) return; }
          return compensate(done_, orch, i, alive);
        }
        let times = 1;
        if (i === 1 && opt.dupe) times = 2;
        for (let k = 0; k < times; k++) {
          if (k === 1) {
            say(`⧉ Consumer crashed before committing its offset, so the broker <b>redelivers</b> the same ${orch ? 'command' : 'event'} (same message id).`);
            await send(orch ? -1 : 0, 1, (orch ? s.cmd : SVC[0].ev) + ' again'); if (!alive()) return;
            if (opt.idem) { say('🛡 Inbox insert hits <code>ON CONFLICT DO NOTHING</code>: message id already processed, <b>skipped</b>.'); setBox(1, 'charged $40', 'ok', 'dupe skipped'); continue; }
            say('⚠ No idempotency: the handler runs again and <b>charges the card a second time</b>.');
          }
          if (i === 1) st.charges++;
          setBox(i, i === 1 && st.charges > 1 ? 'charged $80 ⚠' : s.doS, i === 1 && st.charges > 1 ? 'warn' : 'ok', i === 1 && st.charges > 1 ? 'double charge' : undefined);
          paintStats();
        }
        done_.push(i);
        if (orch) { await send(i, -1, s.ev); if (!alive()) return; }
      }
      if (!orch) { await send(3, 0, SVC[3].ev); if (!alive()) return; }
      else { await send(-1, 0, 'Approve'); if (!alive()) return; }
      setBox(0, 'APPROVED', 'ok');
      st.outcome = st.charges > 1 ? 'DONE, but charged twice' : 'APPROVED'; paintStats();
      say(st.charges > 1 ? '⚠ Saga finished, but the customer paid $80. Turn idempotency on and run again.' : '✅ Every step committed locally; order <b>APPROVED</b>.');
      done();
    }
    async function compensate(done_, orch, failedAt, alive) {
      st.outcome = 'COMPENSATING'; paintStats();
      say(`↩ Running compensations for the ${done_.length} completed step(s) <b>in reverse</b>: ${done_.slice().reverse().map((i) => SVC[i].undoCmd).join(' → ')}.`);
      let from = failedAt;
      for (const i of done_.slice().reverse()) {
        const s = SVC[i];
        if (orch) await send(-1, i, s.undoCmd, 'undo');
        else await send(from, i, from === failedAt ? SVC[from].rej : SVC[from].undoEv, 'undo');
        if (!alive()) return;
        st.comps++;
        if (i === 1) st.charges = 0;
        setBox(i, s.undoS, 'warn'); paintStats();
        if (orch && i) { await send(i, -1, s.undoEv, 'undo'); if (!alive()) return; }
        from = i;
      }
      st.outcome = 'REJECTED (compensated)'; paintStats();
      say(`✔ Consistent again: order <b>CANCELLED</b>, ${failedAt > 1 ? 'payment refunded (a new transaction, visible on the statement)' : 'nothing was charged'}. The customer saw <code>PENDING</code> for a moment: no isolation.`);
      done();
    }
    function done() { busy = false; run.disabled = false; }

    drawHub(); reset(); st.outcome = '—'; paintStats();
    say('Pick a view, inject a failure (try <b>Inventory</b>), then ▶ Run. Then try <b>Dual write</b> + 💥 crash, or ⧉ deliver twice with 🛡 idempotency off.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
