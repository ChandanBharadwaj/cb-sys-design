/* Event-time tumbling windows with a bounded-out-of-orderness watermark, allowed lateness and a late side output. */
SD.widget('stream-analytics', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 500, H = 236, X0 = 22, X1 = 478, SPAN = 60, WIN = 10, NW = SPAN / WIN;
  const TOP = 62, BASE = 204, MS_PER_S = 420; // 1 s of processing time = 420 ms real time
  const xOf = (e) => X0 + (X1 - X0) * (e / SPAN);
  const eOf = (x) => ((x - X0) / (X1 - X0)) * SPAN;

  let lag = 3, lateness = 10, playing = !ctx.reduced;
  let p, maxSeen, wm, events, wins, bins, nextEmit, done, stats;

  // ---------- controls ----------
  const playBtn = el('button', { class: 'btn primary', text: playing ? '❚❚ Pause' : '▶ Play' });
  playBtn.addEventListener('click', () => { playing = !playing; playBtn.textContent = playing ? '❚❚ Pause' : '▶ Play'; if (done) reset(); });
  const stepBtn = el('button', { class: 'btn', text: '+2 s' });
  stepBtn.addEventListener('click', () => advance(2));
  const lateBtn = el('button', { class: 'btn', text: '⤺ Inject late event' });
  lateBtn.addEventListener('click', () => inject(Math.max(0, wm - 2 - Math.random() * 14), true));
  const resetBtn = el('button', { class: 'btn', text: '↺ Restart' });
  resetBtn.addEventListener('click', reset);
  const lagOut = el('b', { text: lag + ' s' });
  const lagIn = el('input', { type: 'range', min: 0, max: 8, value: lag, 'aria-label': 'Watermark lag' });
  lagIn.addEventListener('input', () => { lag = +lagIn.value; lagOut.textContent = lag + ' s'; });
  const latOut = el('b', { text: lateness + ' s' });
  const latIn = el('input', { type: 'range', min: 0, max: 20, step: 1, value: lateness, 'aria-label': 'Allowed lateness' });
  latIn.addEventListener('input', () => { lateness = +latIn.value; latOut.textContent = lateness + ' s'; });
  root.append(el('div', { class: 'w-controls' }, playBtn, stepBtn, lateBtn, resetBtn,
    el('label', null, 'Watermark lag ', lagOut, lagIn), el('label', null, 'Allowed lateness ', latOut, latIn)));

  // ---------- stage ----------
  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Event-time windows with watermark', style: 'touch-action:none;cursor:crosshair' });
  const gBands = svg('g'), gAxis = svg('g'), gDots = svg('g'), gLines = svg('g'), gGhost = svg('g');
  S_.append(gBands, gAxis, gDots, gLines, gGhost);
  root.append(el('div', { class: 'w-stage' }, S_));
  const statsEl = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(statsEl, log);

  const T = (x, y, txt, st, anchor) => svg('text', { x, y, 'text-anchor': anchor || 'middle', style: st || 'font:600 12px var(--sans)', fill: 'var(--text-3)', text: txt });
  // axis
  gAxis.append(svg('line', { x1: X0, x2: X1, y1: BASE + 4, y2: BASE + 4, stroke: 'var(--border)' }));
  for (let s = 0; s <= SPAN; s += WIN) gAxis.append(T(xOf(s), BASE + 20, s === 60 ? '1:00' : ':' + String(s).padStart(2, '0'), 'font:600 14px var(--mono)'));
  const legend = [['var(--accent)', 'on time'], ['var(--warn)', 'late, accepted (re-fire)'], ['var(--err)', 'dropped → side output'], ['var(--text-3)', '┆ processing time now']];
  root.insertBefore(el('div', { class: 'w-stats', style: { marginTop: '0', marginBottom: '6px' } }, legend.map(([c, l]) => el('span', { class: 'w-stat', html: `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:5px"></i>${l}` }))), statsEl);

  const bandEls = [];
  for (let k = 0; k < NW; k++) {
    const x = xOf(k * WIN) + 1, w = xOf(WIN) - X0 - 2;
    const rect = svg('rect', { x, y: TOP - 30, width: w, height: BASE - TOP + 32, rx: 6, style: 'transition:fill .3s' });
    const t1 = T(x + w / 2, TOP - 15, '', 'font:700 16px var(--mono)');
    const t2 = T(x + w / 2, TOP + 3, '', 'font:600 13.5px var(--sans)');
    gBands.append(rect, t1, t2);
    bandEls.push({ rect, t1, t2 });
  }
  const wmLine = svg('line', { y1: TOP - 34, y2: BASE + 4, stroke: 'var(--accent)', 'stroke-width': 2.5 });
  const wmText = T(0, TOP - 38, 'watermark', 'font:700 14px var(--sans)');
  wmText.setAttribute('fill', 'var(--accent)');
  const nowLine = svg('line', { y1: TOP - 30, y2: BASE + 4, stroke: 'var(--text-3)', 'stroke-dasharray': '3 3' });
  gLines.append(nowLine, wmLine, wmText);

  function reset() {
    p = 0; maxSeen = 0; wm = -lag; events = []; bins = {}; nextEmit = 0; done = false;
    wins = Array.from({ length: NW }, () => ({ count: 0, fires: 0, firedAt: null, purged: false }));
    stats = { ontime: 0, late: 0, dropped: 0, refires: 0 };
    gDots.innerHTML = ''; log.innerHTML = '';
    say('Stream started. Each event is placed at its <b>event time</b>, which can be well behind processing time.');
    if (!playing && !ctx.reduced) { playing = true; playBtn.textContent = '❚❚ Pause'; }
    paint();
  }

  function delay() { return Math.random() < 0.85 ? -Math.log(1 - Math.random()) * 0.8 : 3 + Math.random() * 9; }

  function inject(e, manual) {
    if (e > p) e = p; // nothing can come from the future
    if (e < 0 || e >= SPAN) return;
    const k = Math.floor(e / WIN), w = wins[k];
    const b = Math.floor(e * 2);
    bins[b] = (bins[b] || 0) + 1;
    let kind;
    if (w.purged) { kind = 'drop'; stats.dropped++; }
    else {
      w.count++;
      if (w.fires > 0) { kind = 'late'; stats.late++; stats.refires++; w.fires++; say(`Late event @${e.toFixed(1)} s → window [${k * WIN},${k * WIN + WIN}) <b>re-fires</b> with count ${w.count}.`); }
      else { kind = 'ok'; stats.ontime++; }
    }
    if (kind === 'drop') say(`Event @${e.toFixed(1)} s is behind watermark − lateness (${(wm - lateness).toFixed(1)} s). Window purged → <b>side output</b>.`);
    else if (manual && kind === 'ok') say(`Event @${e.toFixed(1)} s arrived before its window fired, so it counts as on time.`);
    const y = Math.max(TOP + 10, BASE - 5 - (bins[b] - 1) * 9.5);
    const fill = kind === 'ok' ? 'var(--accent)' : kind === 'late' ? 'var(--warn)' : 'var(--err)';
    const dot = svg('circle', { cx: xOf(e), cy: y, r: manual ? 5.6 : 4.4, fill, stroke: manual ? 'var(--text)' : 'none', 'stroke-width': 1.2 });
    gDots.append(dot);
    events.push({ e, kind });
  }

  function advance(ds) {
    if (done) return;
    const target = p + ds;
    while (p < target) {
      p = Math.min(target, p + 0.05);
      while (nextEmit <= p) { // ~3 events per second of processing time
        const e = nextEmit - delay();
        if (e >= 0 && e < SPAN) { maxSeen = Math.max(maxSeen, e); inject(e, false); }
        nextEmit += 1 / 3;
      }
      if (p > SPAN + 14) maxSeen = Math.max(maxSeen, p - 14); // source idles out at the end
      wm = Math.max(wm, maxSeen - lag); // watermarks never go backwards
      wins.forEach((w, k) => {
        const end = (k + 1) * WIN;
        if (!w.fires && wm >= end) { w.fires = 1; w.firedAt = wm; say(`WM ${wm.toFixed(1)} s ≥ ${end} s → window [${k * WIN},${end}) <b>fires</b>: count ${w.count}.`); }
        if (!w.purged && wm >= end + lateness) { w.purged = true; say(`Window [${k * WIN},${end}) state <b>purged</b> (WM ≥ end + ${lateness} s).`); }
      });
    }
    if (wins.every((w) => w.purged)) { done = true; playing = false; playBtn.textContent = '▶ Replay'; say('All windows closed. Press Replay.'); }
    paint();
  }

  function paint() {
    wins.forEach((w, k) => {
      const b = bandEls[k];
      b.rect.style.fill = w.purged ? 'color-mix(in srgb, var(--text-3) 14%, var(--surface))' : w.fires ? 'color-mix(in srgb, var(--ok) 16%, var(--surface))' : 'var(--surface-2)';
      b.rect.style.stroke = w.fires && !w.purged ? 'var(--ok)' : 'var(--border)';
      b.t1.textContent = 'n=' + w.count;
      b.t2.textContent = w.purged ? 'closed' : w.fires > 1 ? 'fired ×' + w.fires : w.fires ? 'fired' : 'open';
    });
    const xw = xOf(Math.max(0, Math.min(SPAN, wm)));
    wmLine.setAttribute('x1', xw); wmLine.setAttribute('x2', xw);
    wmText.setAttribute('x', Math.max(X0 + 32, Math.min(X1 - 32, xw)));
    const xn = xOf(Math.min(SPAN, p));
    nowLine.setAttribute('x1', xn); nowLine.setAttribute('x2', xn);
    statsEl.innerHTML = '';
    const st = { 'processing time': p.toFixed(1) + ' s', watermark: Math.max(0, wm).toFixed(1) + ' s', 'on time': stats.ontime, 'late accepted': stats.late, dropped: stats.dropped, 're-fires': stats.refires };
    Object.entries(st).forEach(([k, v]) => statsEl.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); }

  // ---------- tap / drag to inject an event at an event time ----------
  let ghost = null;
  function evtTime(ev) {
    const r = S_.getBoundingClientRect();
    return Math.max(0, Math.min(SPAN - 0.01, eOf((ev.clientX - r.left) * (W / r.width))));
  }
  function drawGhost(e) {
    gGhost.innerHTML = '';
    const x = xOf(Math.min(e, p));
    gGhost.append(svg('line', { x1: x, x2: x, y1: TOP - 30, y2: BASE + 4, stroke: 'var(--warn)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }),
      T(Math.max(X0 + 30, Math.min(X1 - 30, x)), BASE - (BASE - TOP) / 2, 'ts ' + Math.min(e, p).toFixed(1) + ' s', 'font:700 13px var(--mono);paint-order:stroke;stroke:var(--surface);stroke-width:3px'));
  }
  S_.addEventListener('pointerdown', (ev) => { ghost = evtTime(ev); drawGhost(ghost); S_.setPointerCapture(ev.pointerId); });
  S_.addEventListener('pointermove', (ev) => { if (ghost != null) { ghost = evtTime(ev); drawGhost(ghost); } });
  S_.addEventListener('pointerup', () => { if (ghost != null) { inject(ghost, true); paint(); } ghost = null; gGhost.innerHTML = ''; });
  S_.addEventListener('pointercancel', () => { ghost = null; gGhost.innerHTML = ''; });

  reset();
  if (ctx.reduced) { playing = false; playBtn.textContent = '▶ Play'; advance(12); }
  ctx.loop((dt) => { if (playing && !done) advance(Math.min(dt, 100) / MS_PER_S); });
});
