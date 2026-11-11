/* Wave scheduler: tenants backfilled in parallel waves with keyset batches, per-tenant checkpoints,
   replica-lag throttling, a failing tenant retried from its checkpoint, and a naive ALTER that causes a lock queue. */
SD.widget('zero-downtime-migrations', function (root, ctx) {
  const { el, svg } = ctx;
  const REPLAY = 60000;            // rows/s the replica can replay (model)
  const LAG_HI = 2, LAG_LO = 0.5;  // throttle hysteresis, seconds
  const opt = { mode: 'waves', batch: 5000, par: 4, throttle: true };
  let gen = 0, loopH = null;

  function build(narrow) {
    const my = ++gen;
    if (loopH) loopH.stop();
    root.innerHTML = '';
    const N = narrow ? 12 : 24, COLS = narrow ? 4 : 8;
    const W = narrow ? 360 : 720, F = narrow ? 14 : 14, F2 = 13;
    const CW = (W - 12) / COLS, CH = narrow ? 46 : 40, GY = 8;
    const gridH = Math.ceil(N / COLS) * CH;
    const CY = GY + gridH + 34, CHH = narrow ? 130 : 120, H = CY + CHH + 26;

    // ---------- state ----------
    let S;
    function reset() {
      S = {
        t: 0, running: false, paused: false, lag: 0, throttled: false, wave: 0, done: false,
        tenants: Array.from({ length: N }, (_, i) => ({ id: 1201 + i, rows: Math.round((i % 5 === 2 ? 260 : 60 + ((i * 37) % 90)) * 1000), last: 0, state: 'PENDING', attempts: 0, inBatch: 0, retryAt: 0, flaky: i === 5 })),
        p99: [], queue: 0, alter: null, sample: 0
      };
    }
    reset();
    const bms = () => 20 + opt.batch * 0.045;           // ms per batch (estimate; grows with size)

    // ---------- controls ----------
    const seg = (label, items, get, set) => {
      const wrap = el('div', { class: 'seg', role: 'group', 'aria-label': label });
      const bs = items.map(([v, l]) => { const b = el('button', { class: 'btn', text: l }); b.onclick = () => { set(v); sync(); }; wrap.append(b); return [v, b]; });
      const sync = () => bs.forEach(([v, b]) => b.classList.toggle('primary', get() === v));
      sync(); return wrap;
    };
    const mk = (lab, vals, key, f) => { const s = el('select', { 'aria-label': lab }); vals.forEach((v) => s.append(el('option', { value: v, text: f(v) }))); s.value = opt[key]; s.addEventListener('change', () => { opt[key] = +s.value; }); return el('label', null, lab + ' ', s); };
    const bStart = el('button', { class: 'btn primary', text: '▶ Start' });
    const bPause = el('button', { class: 'btn', text: '⏸ Pause' });
    const bFail = el('button', { class: 'btn', text: '💥 Fail a tenant' });
    const bReset = el('button', { class: 'btn', text: '↺ Reset' });
    const bThr = el('button', { class: 'btn', text: '' });
    const syncThr = () => { bThr.textContent = 'Throttle on lag: ' + (opt.throttle ? 'on' : 'off'); bThr.classList.toggle('primary', opt.throttle); };
    bThr.onclick = () => { opt.throttle = !opt.throttle; syncThr(); }; syncThr();
    root.append(el('div', { class: 'w-controls' },
      seg('Approach', [['waves', 'Batched waves'], ['alter', 'Naive ALTER']], () => opt.mode, (v) => { opt.mode = v; reset(); paint(); say(v === 'alter' ? 'Naive mode: one <code>ALTER TABLE … ADD COLUMN … DEFAULT now()</code> (volatile default → full rewrite) plus an <code>UPDATE</code> of all rows, no <code>lock_timeout</code>.' : 'Batched mode: expand was metadata-only; now backfill tenants in waves.'); }),
      mk('Batch', [1000, 5000, 20000, 50000], 'batch', (v) => (v / 1000) + 'k rows'),
      mk('Parallel', [1, 2, 4, 8], 'par', (v) => v + ' workers'),
      bThr, bStart, bPause, bFail, bReset));

    const stage = el('div', { class: 'w-stage' });
    const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Tenant migration waves and live latency' });
    stage.append(S_); root.append(stage);
    stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Tile fill = committed checkpoint. <b style="color:var(--accent)">■</b> running · <b style="color:var(--ok)">■</b> done · <b style="color:var(--err)">■</b> failed (retrying) · <b style="color:var(--warn)">■</b> throttled. Chart: live p99 (ms); dashed line = 100 ms SLO.' }));
    const stats = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }

    const T = (x, y, txt, o = {}) => svg('text', { x, y, 'text-anchor': o.a || 'start', fill: o.fill || 'var(--text)', style: `font:${o.w || 600} ${o.f || F}px var(${o.mono ? '--mono' : '--sans'})`, text: txt });
    const tiles = S_tenantsInit();
    function S_tenantsInit() {
      return S.tenants.map((tn, i) => {
        const x = 6 + (i % COLS) * CW, y = GY + Math.floor(i / COLS) * CH;
        const bg = svg('rect', { x: x + 2, y: y + 2, width: CW - 4, height: CH - 4, rx: 5, fill: 'var(--surface-2)', stroke: 'var(--border)' });
        const fill = svg('rect', { x: x + 2, y: y + 2, width: 0, height: CH - 4, rx: 5, fill: 'var(--accent)', opacity: 0.35 });
        const name = T(x + CW / 2, y + (narrow ? 20 : 18), 't' + tn.id, { a: 'middle', f: F2, mono: true, w: 700 });
        const pct = T(x + CW / 2, y + (narrow ? 37 : 33), '', { a: 'middle', f: F2, fill: 'var(--text-3)' });
        S_.append(bg, fill, name, pct);
        return { bg, fill, pct, x };
      });
    }
    const chTitle = T(6, CY - 10, 'live p99 latency', { f: F2, fill: 'var(--text-3)' });
    const lagT = T(W - 6, CY - 10, '', { f: F2, a: 'end', w: 700 });
    const axis = svg('rect', { x: 6, y: CY, width: W - 12, height: CHH, rx: 4, fill: 'var(--surface-2)', stroke: 'var(--border)' });
    const ymax = 400, yOf = (v) => CY + CHH - Math.min(v, ymax) / ymax * CHH;
    const slo = svg('line', { x1: 6, x2: W - 6, y1: yOf(100), y2: yOf(100), stroke: 'var(--warn)', 'stroke-dasharray': '5 4' });
    const sloT = T(10, yOf(100) - 4, '100 ms', { f: F2, fill: 'var(--warn)' });
    const line = svg('polyline', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5, points: '' });
    const capT = T(W / 2, CY + 20, '', { f: F, a: 'middle', w: 700, fill: 'var(--err)' });
    const foot = T(6, CY + CHH + 18, 'last 60 s · capped at 400 ms', { f: F2, fill: 'var(--text-3)' });
    S_.append(chTitle, lagT, axis, slo, sloT, line, capT, foot);

    // ---------- simulation ----------
    const active = () => S.tenants.filter((t) => t.state === 'RUNNING' || t.state === 'RETRY');
    function startWave() {
      const next = S.tenants.filter((t) => t.state === 'PENDING').slice(0, S.wave === 0 ? Math.min(2, opt.par) : opt.par);
      if (!next.length) { S.done = true; S.running = false; say('✅ All tenants migrated. Next: verify counts, switch reads behind a flag, contract in a later release.'); return; }
      S.wave++; next.forEach((t) => { t.state = 'RUNNING'; t.wave = S.wave; });
      say(`Wave ${S.wave}${S.wave === 1 ? ' (pilot)' : ''}: ${next.map((t) => 't' + t.id).join(', ')}`);
    }
    function failTenant(t, why) {
      t.state = 'RETRY'; t.attempts++; t.inBatch = 0; t.retryAt = S.t + 1.5 * Math.pow(2, t.attempts - 1);
      say(`💥 t${t.id}: ${why}. Batch rolled back; checkpoint still at id <b>${t.last.toLocaleString('en-US')}</b>. Retry #${t.attempts} in ${(1.5 * Math.pow(2, t.attempts - 1)).toFixed(1)} s.`);
    }
    function stepWaves(dt) {
      const act = active();
      if (!act.length) { startWave(); return 0; }
      // throttle with hysteresis on replica lag
      if (opt.throttle) {
        if (!S.throttled && S.lag > LAG_HI) { S.throttled = true; say(`⏳ Replica lag ${S.lag.toFixed(1)} s > ${LAG_HI} s: workers sleep between batches.`); }
        else if (S.throttled && S.lag < LAG_LO) { S.throttled = false; say('▶ Lag back under 0.5 s: workers resume.'); }
      } else S.throttled = false;
      if (S.throttled) return 0;
      const perW = opt.batch / (bms() / 1000) * dt;   // rows each worker writes this tick
      let w = 0;
      act.forEach((t) => {
        if (t.state === 'RETRY') { if (S.t >= t.retryAt) { t.state = 'RUNNING'; say(`↻ t${t.id} resumes from checkpoint id ${t.last.toLocaleString('en-US')}.`); } return; }
        t.inBatch += perW; w += perW;
        while (t.inBatch >= opt.batch && t.last < t.rows) {
          if (t.flaky && t.attempts === 0 && t.last >= opt.batch * 2) { failTenant(t, 'check constraint violated on legacy row'); return; }
          t.inBatch -= opt.batch; t.last = Math.min(t.rows, t.last + opt.batch);   // COMMIT batch + checkpoint
        }
        if (t.last >= t.rows) { t.state = 'DONE'; t.inBatch = 0; }
      });
      return w;
    }
    function stepAlter(dt) {
      if (!S.alter) { S.alter = { phase: 'wait', until: S.t + 5 }; say('🔒 ALTER requests ACCESS EXCLUSIVE but a 3-minute report transaction holds ACCESS SHARE. ALTER waits…'); }
      const a = S.alter;
      if (a.phase === 'wait') {
        S.queue += 180 * dt;
        if (Math.floor(S.queue / 250) > Math.floor((S.queue - 180 * dt) / 250)) say(`⛔ Lock wait: ${Math.round(S.queue)} queries queued behind the ALTER (even plain SELECTs).`);
        if (S.t >= a.until) { a.phase = 'rewrite'; a.until = S.t + 7; say('Report finished. ALTER gets the lock and <b>rewrites the whole table</b> while holding it.'); }
      } else if (a.phase === 'rewrite') {
        S.queue += 180 * dt;
        const k = 1 - (a.until - S.t) / 7; S.tenants.forEach((t) => { t.last = Math.round(t.rows * Math.min(1, k)); t.state = 'RUNNING'; });
        if (S.t >= a.until) { a.phase = 'done'; S.tenants.forEach((t) => { t.state = 'DONE'; t.last = t.rows; }); say(`ALTER committed. ${Math.round(S.queue)} queued requests flood in; many already timed out. Total blocked ≈ 12 s.`); S.queue = 0; S.running = false; S.done = true; }
      }
      return a.phase === 'rewrite' ? REPLAY * 3 * dt : 0;
    }
    function tick(dt) {
      if (!S.running || S.paused) return;
      S.t += dt;
      const w = opt.mode === 'alter' ? stepAlter(dt) : stepWaves(dt);
      S.lag = Math.max(0, S.lag + (w / REPLAY - dt));      // lag grows by excess write time, drains in real time
      const run = active().filter((t) => t.state === 'RUNNING').length;
      let p = 18 + (S.throttled ? 0 : run * 3.2 * Math.pow(opt.batch / 5000, 0.6)) + Math.random() * 6;
      if (opt.mode === 'alter' && S.alter && S.alter.phase !== 'done') p = 1000 + S.queue;   // requests stuck in the lock queue
      S.cur = p;
      S.sample += dt; if (S.sample >= 0.5) { S.sample = 0; S.p99.push(p); if (S.p99.length > 120) S.p99.shift(); }
    }

    function paint() {
      S.tenants.forEach((t, i) => {
        const R = tiles[i], frac = t.rows ? t.last / t.rows : 0;
        R.fill.setAttribute('width', Math.max(0, (CW - 4) * frac));
        const col = t.state === 'DONE' ? 'var(--ok)' : t.state === 'RETRY' ? 'var(--err)' : (S.throttled && t.state === 'RUNNING') ? 'var(--warn)' : 'var(--accent)';
        R.fill.setAttribute('fill', col);
        R.bg.setAttribute('stroke', t.state === 'RUNNING' ? col : t.state === 'RETRY' ? 'var(--err)' : 'var(--border)');
        R.bg.setAttribute('stroke-width', t.state === 'RUNNING' || t.state === 'RETRY' ? 2 : 1);
        R.pct.textContent = t.state === 'PENDING' ? '—' : t.state === 'RETRY' ? 'retry' : Math.round(frac * 100) + '%';
      });
      const n = S.p99.length, step = (W - 12) / 119;
      line.setAttribute('points', S.p99.map((v, i) => `${(6 + (120 - n + i) * step).toFixed(1)},${yOf(v).toFixed(1)}`).join(' '));
      line.setAttribute('stroke', (S.cur || 0) > 100 ? 'var(--err)' : 'var(--accent)');
      capT.textContent = (S.cur || 0) > ymax ? `p99 ≈ ${(S.cur / 1000).toFixed(1)} s · lock queue` : '';
      lagT.textContent = 'replica lag ' + S.lag.toFixed(1) + ' s';
      lagT.setAttribute('fill', S.lag > LAG_HI ? 'var(--err)' : S.lag > LAG_LO ? 'var(--warn)' : 'var(--ok)');
      const rowsDone = S.tenants.reduce((a, t) => a + t.last, 0), rowsAll = S.tenants.reduce((a, t) => a + t.rows, 0);
      const bt = S.tenants.reduce((a, t) => a + Math.floor(t.last / opt.batch), 0);
      stats.innerHTML = '';
      [['wave', opt.mode === 'alter' ? 'n/a' : S.wave], ['rows done', Math.round(100 * rowsDone / rowsAll) + '%'], ['batches (checkpoints)', bt.toLocaleString('en-US')],
        ['live p99', Math.round(S.cur || 18) + ' ms'], ['replica lag', S.lag.toFixed(1) + ' s'], ['state', S.done ? 'done' : S.paused ? 'paused' : S.throttled ? 'throttled' : S.running ? 'running' : 'idle']]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
      bStart.disabled = S.running || S.done; bPause.disabled = !S.running || opt.mode === 'alter';
      bPause.textContent = S.paused ? '▶ Resume' : '⏸ Pause';
      bFail.disabled = opt.mode === 'alter' || !S.running;
    }

    bStart.onclick = () => { S.running = true; say(opt.mode === 'alter' ? 'Running the naive migration…' : `Start: batch ${opt.batch.toLocaleString('en-US')} rows (~${Math.round(bms())} ms each), ${opt.par} workers per wave.`); paint(); };
    bPause.onclick = () => {
      S.paused = !S.paused;
      if (S.paused) { active().forEach((t) => { t.inBatch = 0; }); say('⏸ Paused. Uncommitted work dropped; every tenant keeps its committed <code>last_id</code>.'); }
      else say('▶ Resumed: ' + active().map((t) => `t${t.id} from id ${t.last.toLocaleString('en-US')}`).join(', '));
      paint();
    };
    bFail.onclick = () => { const run = active().filter((t) => t.state === 'RUNNING'); if (!run.length) return; failTenant(run[Math.floor(Math.random() * run.length)], 'deadlock detected'); paint(); };
    bReset.onclick = () => { reset(); paint(); say('Reset. Checkpoints cleared.'); };

    let acc = 0;
    loopH = ctx.loop((dt) => {
      if (my !== gen) return;
      const d = Math.min(0.1, dt / 1000);
      tick(d); acc += d;
      if (acc > 0.12 || ctx.reduced) { acc = 0; paint(); }
    });
    paint();
    say('Press ▶ Start. Try 50k batches with 8 workers and throttle off, then turn throttle on. Tenant t1206 has a bad row and will fail once.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
