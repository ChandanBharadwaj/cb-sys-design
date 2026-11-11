/* Two regions with a Postgres primary in A and a DR copy in B. "Fail region A" runs the RTO clock through
   the phases of the chosen strategy (detect, decide, scale/restore, promote, DNS) and computes the RPO from
   how data reaches B: async lag × write rate, 0 for sync, or the backup interval. Failback reconciles orphans. */
SD.widget('disaster-recovery', function (root, ctx) {
  const { el, svg } = ctx;
  const RATE = 200;                 // committed tx/s on the primary
  const LAG = 2;                    // async replication lag, seconds (estimate)
  const BACKUP_MIN = 15;            // WAL push / snapshot interval for backup & restore (estimate)
  const STRATS = {
    backup: { name: 'Backup & restore', cost: 1.1, phases: [['Detect', 5], ['Declare DR', 15], ['Provision infra', 30], ['Restore + replay', 90], ['DNS switch', 1]] },
    pilot: { name: 'Pilot light', cost: 1.3, phases: [['Detect', 5], ['Declare DR', 15], ['Start app servers', 20], ['Promote standby', 1], ['DNS switch', 1]] },
    warm: { name: 'Warm standby', cost: 1.6, phases: [['Detect', 2], ['Declare DR', 10], ['Scale 25→100%', 5], ['Promote standby', 1], ['DNS switch', 1]] },
    active: { name: 'Active/active', cost: 2.1, phases: [['Detect (health checks)', 1], ['Drain region A', 0.5], ['DNS / GLB removes A', 1]] }
  };
  let strat = 'warm', repl = 'async', state = 'normal', phaseIdx = 0, phaseT = 0, simMin = 0, lost = 0, dots = [], spawn = 0, fbStep = 0;
  const PHASE_WALL = ctx.reduced ? 0 : 1600;

  // ---------- controls ----------
  const stratBtns = Object.keys(STRATS).map((k) => { const b = el('button', { class: 'btn', text: STRATS[k].name }); b.addEventListener('click', () => { strat = k; reset(); }); return b; });
  const replSel = el('select', { 'aria-label': 'Replication mode' });
  [['async', 'Async replication (lag 2 s)'], ['sync', 'Sync replication (RPO 0)']].forEach(([v, l]) => replSel.append(el('option', { value: v, text: l })));
  replSel.addEventListener('change', () => { repl = replSel.value; reset(); });
  const failBtn = el('button', { class: 'btn primary', text: '💥 Fail region A' });
  failBtn.addEventListener('click', fail);
  const backBtn = el('button', { class: 'btn', text: '↩ Fail back' });
  backBtn.addEventListener('click', failback);
  root.append(el('div', { class: 'w-controls' }, ...stratBtns), el('div', { class: 'w-controls' }, replSel, failBtn, backBtn));
  const stage = el('div', { class: 'w-stage' });
  const stats = el('div', { class: 'w-stats' });
  const costBox = el('div', { style: { margin: '8px 0', display: 'grid', gap: '4px', fontSize: '13px' } });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stage, stats, costBox, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); };

  const rpoText = () => strat === 'backup' ? `up to ${BACKUP_MIN} min of writes (≈ ${(RATE * BACKUP_MIN * 60).toLocaleString('en-US')} tx)` : repl === 'sync' ? '0 tx (every commit waited for region B)' : `≈ ${LAG} s × ${RATE} tx/s = ${RATE * LAG} tx`;
  const totalMin = () => STRATS[strat].phases.reduce((a, p) => a + p[1], 0);
  const clock = (m) => { const s = Math.round(m * 60); return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  // ---------- drawing ----------
  let G = null;
  function build(narrow) {
    stage.innerHTML = '';
    const W = narrow ? 360 : 600, H = narrow ? 506 : 366, F = narrow ? 14 : 13, FB = narrow ? 22 : 20;
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Two-region disaster recovery simulation' });
    stage.append(S);
    const T = (x, y, t, o) => { const n = svg('text', Object.assign({ x, y, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:600 ${F}px var(--sans)`, text: t }, o || {})); S.append(n); return n; };
    const box = (x, y, w, h, fill, stroke) => { const r = svg('rect', { x, y, width: w, height: h, rx: 8, fill, stroke: stroke || 'var(--border)', 'stroke-width': 1.5 }); S.append(r); return r; };
    // geometry
    const L = narrow
      ? { dns: [100, 8, 160, 40], rA: [10, 70, 340, 120], rB: [10, 250, 340, 120], appA: [25, 105, 140, 50], dbA: [195, 105, 140, 50], appB: [25, 285, 140, 50], dbB: [195, 285, 140, 50], pipe: [[265, 155], [265, 285]], clk: 400 }
      : { dns: [220, 8, 160, 40], rA: [15, 70, 265, 170], rB: [320, 70, 265, 170], appA: [40, 105, 215, 50], dbA: [40, 175, 215, 50], appB: [345, 105, 215, 50], dbB: [345, 175, 215, 50], pipe: [[255, 200], [345, 200]], clk: 280 };
    box(...L.dns, 'var(--surface-2)'); T(L.dns[0] + 80, L.dns[1] + 26, 'DNS / global LB');
    const rA = box(...L.rA, 'transparent'), rB = box(...L.rB, 'transparent');
    T(L.rA[0] + 12, L.rA[1] + 22, 'Region A', { 'text-anchor': 'start', style: `font:700 ${F}px var(--sans)` });
    T(L.rB[0] + 12, L.rB[1] + 22, 'Region B', { 'text-anchor': 'start', style: `font:700 ${F}px var(--sans)` });
    const mk = (r, label) => { const b = box(...r, 'var(--surface-2)'); const t = T(r[0] + r[2] / 2, r[1] + 22, label); const s2 = T(r[0] + r[2] / 2, r[1] + 41, '', { fill: 'var(--text-3)', style: `font:500 ${F - 1}px var(--sans)` }); return { b, t, s: s2 }; };
    const appA = mk(L.appA, 'App'), dbA = mk(L.dbA, 'Postgres'), appB = mk(L.appB, 'App'), dbB = mk(L.dbB, 'Postgres');
    // DNS arrow
    const dnsArrow = svg('line', { stroke: 'var(--accent)', 'stroke-width': 3, 'marker-end': '' });
    S.append(dnsArrow);
    const pipe = svg('line', { x1: L.pipe[0][0], y1: L.pipe[0][1], x2: L.pipe[1][0], y2: L.pipe[1][1], stroke: 'var(--border)', 'stroke-width': 8, 'stroke-linecap': 'round' });
    S.append(pipe);
    const gDots = svg('g'); S.append(gDots);
    // clocks
    const cy = L.clk, cw = narrow ? 165 : 270;
    box(10, cy, cw, narrow ? 60 : 44, 'var(--surface-2)'); box(W - 10 - cw, cy, cw, narrow ? 60 : 44, 'var(--surface-2)');
    const rtoT = narrow ? T(10 + cw / 2, cy + 22, 'RTO clock', { fill: 'var(--text-3)' }) : null;
    const rpoL = narrow ? T(W - 10 - cw / 2, cy + 22, 'RPO (lost)', { fill: 'var(--text-3)' }) : null;
    const rtoV = T(10 + cw / 2, cy + (narrow ? 50 : 29), '', { style: `font:700 ${FB}px var(--mono, monospace)` });
    const rpoV = T(W - 10 - cw / 2, cy + (narrow ? 50 : 29), '', { style: `font:700 ${FB}px var(--mono, monospace)` });
    // phase bar
    const py = cy + (narrow ? 72 : 52), pw = W - 20;
    const gPh = svg('g'); S.append(gPh);
    G = { L, S, narrow, rA, rB, appA, dbA, appB, dbB, dnsArrow, pipe, gDots, rtoV, rpoV, gPh, py, pw, F, rtoT, rpoL };
    paint();
  }

  function setBox(o, tone, sub) { o.b.setAttribute('stroke', tone ? `var(--${tone})` : 'var(--border)'); o.b.setAttribute('stroke-width', tone ? 2.5 : 1.5); o.s.textContent = sub; }

  function paint() {
    if (!G) return;
    const { L } = G, down = state !== 'normal' && state !== 'back', onB = state === 'over';
    const bSize = { backup: 'not deployed', pilot: 'off (0 servers)', warm: 'warm, 25% size', active: 'active, 100%' }[strat];
    setBox(G.appA, down ? 'err' : 'ok', down ? 'region down' : 'serving');
    setBox(G.dbA, down ? 'err' : 'ok', down ? 'unreachable' : 'primary');
    setBox(G.appB, onB ? 'ok' : null, onB ? 'serving 100%' : bSize);
    setBox(G.dbB, onB ? 'ok' : null, onB ? (strat === 'backup' ? 'restored primary' : 'promoted primary') : strat === 'backup' ? 'backups only' : repl === 'sync' ? 'sync standby' : 'async standby');
    G.rA.setAttribute('fill', down ? 'color-mix(in srgb, var(--err) 12%, transparent)' : 'transparent');
    const tgt = onB ? L.appB : L.appA;
    const d = L.dns;
    G.dnsArrow.setAttribute('x1', d[0] + d[2] / 2); G.dnsArrow.setAttribute('y1', d[1] + d[3]);
    G.dnsArrow.setAttribute('x2', tgt[0] + tgt[2] / 2); G.dnsArrow.setAttribute('y2', G.narrow && tgt === L.appB ? L.rB[1] : tgt[1]);
    G.dnsArrow.setAttribute('stroke', state === 'failing' ? 'var(--err)' : 'var(--accent)');
    G.pipe.setAttribute('stroke-dasharray', strat === 'backup' ? '4 8' : '');
    // dots
    G.gDots.innerHTML = '';
    const [[x1, y1], [x2, y2]] = L.pipe;
    dots.forEach((p) => G.gDots.append(svg('circle', { cx: x1 + (x2 - x1) * p.p, cy: y1 + (y2 - y1) * p.p, r: 5, fill: p.lost ? 'var(--err)' : 'var(--accent)' })));
    // clocks
    G.rtoV.textContent = (G.narrow ? '' : 'RTO ') + clock(simMin);
    G.rtoV.setAttribute('fill', state === 'failing' ? 'var(--warn)' : state === 'over' ? 'var(--ok)' : 'var(--text)');
    const lostTx = state === 'normal' ? 0 : lost;
    G.rpoV.textContent = (G.narrow ? '' : 'RPO ') + lostTx.toLocaleString('en-US') + ' tx';
    G.rpoV.setAttribute('fill', lostTx ? 'var(--err)' : 'var(--ok)');
    // phase bar: width ∝ sqrt(duration) so short phases stay visible
    G.gPh.innerHTML = '';
    const ph = STRATS[strat].phases, ws = ph.map((p) => Math.sqrt(p[1])), sw = ws.reduce((a, b) => a + b, 0);
    let x = 10;
    ph.forEach((p, i) => {
      const w = G.pw * ws[i] / sw, done = state === 'over' || state === 'back' || (state === 'failing' && i < phaseIdx), cur = state === 'failing' && i === phaseIdx;
      G.gPh.append(svg('rect', { x: x + 1, y: G.py, width: w - 2, height: 22, rx: 4, fill: done ? 'var(--ok)' : cur ? 'var(--warn)' : 'var(--surface-2)', stroke: 'var(--border)' }));
      if (cur) G.gPh.append(svg('rect', { x: x + 1, y: G.py, width: Math.max(0, (w - 2) * phaseT), height: 22, rx: 4, fill: 'var(--accent)', opacity: 0.5 }));
      G.gPh.append(svg('text', { x: x + w / 2, y: G.py + 16, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:600 ${G.F - 1}px var(--sans)`, text: w > 34 ? String(i + 1) : '' }));
      x += w;
    });
    // stats
    stats.innerHTML = '';
    const phaseName = state === 'failing' ? `${phaseIdx + 1}. ${ph[phaseIdx][0]}` : state === 'over' ? 'serving from B' : state === 'back' ? 'failing back' : 'normal';
    [['strategy', STRATS[strat].name], ['phase', phaseName], ['RTO estimate', clock(totalMin())], ['RPO', rpoText()], ['commit latency', strat !== 'backup' && repl === 'sync' ? '+ cross-region RTT' : 'local only']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    failBtn.disabled = state !== 'normal'; backBtn.disabled = state !== 'over';
    stratBtns.forEach((b, i) => b.classList.toggle('primary', Object.keys(STRATS)[i] === strat));
  }

  function costBars() {
    costBox.innerHTML = '';
    costBox.append(el('div', { class: 'muted', html: 'Running cost vs a single region (<em>rule of thumb</em>) · phases: ' + STRATS[strat].phases.map((p, i) => `<b>${i + 1}</b> ${p[0]} ${p[1]} min`).join(' · ') }));
    Object.keys(STRATS).forEach((k) => {
      const c = STRATS[k].cost + (k !== 'backup' && repl === 'sync' ? 0.1 : 0);
      costBox.append(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        el('span', { text: STRATS[k].name, style: { width: '130px', flex: 'none', fontWeight: k === strat ? '700' : '400' } }),
        el('span', { style: { height: '14px', borderRadius: '4px', width: `${Math.round((c / 2.3) * 60)}%`, background: k === strat ? 'var(--accent)' : 'var(--border)' } }),
        el('span', { text: c.toFixed(1) + '×' })));
    });
  }

  // ---------- simulation ----------
  function reset() {
    state = 'normal'; phaseIdx = 0; phaseT = 0; simMin = 0; lost = 0; dots = []; fbStep = 0;
    replSel.disabled = strat === 'backup';
    costBars(); paint();
    say(`<b>${STRATS[strat].name}</b>${strat === 'backup' ? '' : ', ' + repl + ' replication'}. RPO if region A dies now: ${rpoText()}.`);
  }
  function fail() {
    if (state !== 'normal') return;
    state = 'failing'; phaseIdx = 0; phaseT = 0; simMin = 0;
    lost = strat === 'backup' ? RATE * BACKUP_MIN * 60 : repl === 'sync' ? 0 : RATE * LAG;
    dots.forEach((d) => { d.lost = repl !== 'sync'; });
    say(`💥 <b>Region A fails.</b> ${lost ? `<span style="color:var(--err)">${lost.toLocaleString('en-US')} committed transactions</span> had not reached region B: they are lost (RPO).` : 'Sync replication: every acknowledged commit is already in region B. RPO = 0.'}`);
    if (ctx.reduced) { while (state === 'failing') nextPhase(); }
    paint();
  }
  function nextPhase() {
    const ph = STRATS[strat].phases;
    simMin = ph.slice(0, phaseIdx + 1).reduce((a, p) => a + p[1], 0);
    say(`✓ ${ph[phaseIdx][0]} done at <b>${clock(simMin)}</b>.`);
    phaseIdx++; phaseT = 0;
    if (phaseIdx >= ph.length) { state = 'over'; dots = []; say(`✅ <b>Serving from region B.</b> Measured RTO <b>${clock(simMin)}</b>; data lost: ${lost.toLocaleString('en-US')} tx.`); }
  }
  const FB = () => [
    'Region A is back. Its old primary still holds the ' + (lost && strat !== 'backup' ? lost.toLocaleString('en-US') + ' orphaned writes' : 'pre-failure state') + '; do <b>not</b> restart it as a writer.',
    (lost ? 'Orphaned rows exported to a <b>reconciliation table</b>; the business owner replays, merges or refunds each one. ' : '') + 'Old primary rebuilt as a standby of B with <code>pg_rewind</code>.',
    '<b>Planned switchover</b>: drain writes, wait for lag 0, promote A, flip DNS. A planned switchover loses nothing (RPO 0).'
  ];
  function failback() {
    if (state !== 'over') return;
    state = 'back'; fbStep = 0; phaseT = 0; say('↩ ' + FB()[0]); paint();
    if (ctx.reduced) { FB().slice(1).forEach((t) => say('↩ ' + t)); reset(); }
  }

  ctx.loop((dt) => {
    dt = Math.min(dt, 100);
    if (state === 'normal' && strat !== 'backup') {
      spawn += dt;
      if (spawn > 180) { spawn = 0; dots.push({ p: 0, lost: false }); }
      dots.forEach((d) => { d.p += dt / 1200; });
      dots = dots.filter((d) => d.p < 1);
    }
    if (state === 'failing') {
      phaseT += dt / PHASE_WALL;
      const ph = STRATS[strat].phases, before = ph.slice(0, phaseIdx).reduce((a, p) => a + p[1], 0);
      simMin = before + ph[phaseIdx][1] * Math.min(1, phaseT);
      if (phaseT >= 1) nextPhase();
    }
    if (state === 'back') {
      phaseT += dt / 1800;
      if (phaseT >= 1) { fbStep++; phaseT = 0; if (fbStep < FB().length) say('↩ ' + FB()[fbStep]); else { reset(); return; } }
    }
    paint();
  });

  build(ctx.narrow);
  ctx.onResize(build);
  reset();
});
