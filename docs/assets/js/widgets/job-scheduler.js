/* Row-lock simulation: N workers run "SELECT … ORDER BY id LIMIT 1 FOR UPDATE [SKIP LOCKED | NOWAIT]" on a job table. */
SD.widget('job-scheduler', function (root, ctx) {
  const { el, svg } = ctx;
  const ROWS = 10;
  // desktop: 500-wide, wide columns. phone: 360-wide, narrower columns, same 14-unit text (≈13px on screen)
  let W, RH, Y0, LX, LW, WX, WW, narrow;
  function geom(n) {
    narrow = n;
    if (n) { W = 360; RH = 30; Y0 = 28; LX = 4; LW = 148; WX = 178; WW = 178; }
    else { W = 500; RH = 28; Y0 = 26; LX = 8; LW = 220; WX = 250; WW = 242; }
  }
  geom(ctx.narrow);
  let mode = 'naive', nWorkers = 4, jobs, workers, t = 0, blockedTime = 0, busyTime = 0, finished = false, running = true;

  // controls
  const modes = [['naive', 'FOR UPDATE'], ['skip', 'SKIP LOCKED'], ['nowait', 'NOWAIT']];
  const modeBtns = modes.map(([v, l]) => {
    const b = el('button', { class: 'btn' + (v === mode ? ' primary' : ''), text: l });
    b.addEventListener('click', () => { mode = v; modeBtns.forEach((x) => x.classList.toggle('primary', x === b)); reset(); });
    return b;
  });
  const runBtn = el('button', { class: 'btn', text: ctx.reduced ? '⏭ Step 0.5 s' : '⏸ Pause' });
  runBtn.addEventListener('click', () => { if (ctx.reduced) { step(0.5); draw(); return; } running = !running; runBtn.textContent = running ? '⏸ Pause' : '▶ Resume'; });
  const killBtn = el('button', { class: 'btn', text: '💥 Kill a busy worker' });
  killBtn.addEventListener('click', kill);
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  resetBtn.addEventListener('click', reset);
  const wOut = el('b', { text: nWorkers });
  const wIn = el('input', { type: 'range', min: 2, max: 6, value: nWorkers, 'aria-label': 'Workers' });
  wIn.addEventListener('input', () => { nWorkers = +wIn.value; wOut.textContent = nWorkers; reset(); });
  root.append(el('div', { class: 'w-controls' }, ...modeBtns));
  root.append(el('div', { class: 'w-controls' }, runBtn, killBtn, resetBtn, el('label', null, 'workers ', wOut, ' ', wIn)));
  const sql = el('div', { class: 'w-log', style: { maxHeight: 'none', marginTop: '0', marginBottom: '10px' } });
  root.append(sql);

  const S_ = svg('svg', { role: 'img', 'aria-label': 'Job table rows and workers' });
  const gRows = svg('g'), gW = svg('g'), gLinks = svg('g');
  const hJobs = svg('text', { y: 17, fill: 'var(--text-2)' }), hW = svg('text', { y: 17, fill: 'var(--text-2)' });
  function frame() {
    S_.setAttribute('viewBox', `0 0 ${W} ${Y0 + ROWS * RH + 6}`);
    const f = `font:700 ${narrow ? 14 : 13}px var(--sans)`;
    hJobs.setAttribute('x', LX); hJobs.setAttribute('style', f); hJobs.textContent = narrow ? 'jobs by id' : 'jobs (ORDER BY id)';
    hW.setAttribute('x', WX); hW.setAttribute('style', f); hW.textContent = narrow ? 'workers' : 'workers (1 txn each)';
  }
  frame();
  S_.append(hJobs, hW, gLinks, gRows, gW);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function say(m) { log.prepend(el('div', { html: `<span style="color:var(--text-3)">t=${t.toFixed(1)}s</span> ${m}` })); while (log.children.length > 40) log.lastChild.remove(); }

  function reset() {
    t = 0; blockedTime = 0; busyTime = 0; finished = false; log.innerHTML = '';
    jobs = Array.from({ length: ROWS }, (_, i) => ({ id: i + 1, status: 'queued', lock: null, dur: 1 + ((i * 7) % 5) * 0.4 }));
    const wh = Math.min(48, (ROWS * RH) / nWorkers);
    workers = Array.from({ length: nWorkers }, (_, i) => ({ n: i + 1, st: 'idle', job: null, wait: null, left: 0, cool: i * 0.05, y: Y0 + i * wh, h: wh - 6 }));
    const q = { naive: 'FOR UPDATE', skip: 'FOR UPDATE SKIP LOCKED', nowait: 'FOR UPDATE NOWAIT' }[mode];
    sql.innerHTML = `BEGIN;<br>SELECT id FROM jobs WHERE status = 'queued'<br>&nbsp; ORDER BY id LIMIT 1 <b style="color:var(--accent)">${q}</b>;<br>-- do the work while holding the row lock<br>UPDATE jobs SET status = 'done' WHERE id = $1; COMMIT;`;
    say(`Mode <b>${q}</b> with ${nWorkers} workers.`);
    draw();
  }

  function firstQueued(skipLocked) { return jobs.find((j) => j.status === 'queued' && (!skipLocked || !j.lock)); }
  function claim(w) {
    if (mode === 'skip') {
      const j = firstQueued(true);
      if (!j) { w.st = 'idle'; w.cool = 0.4; return; }
      lockAndRun(w, j); return;
    }
    const j = firstQueued(false);
    if (!j) { w.st = 'idle'; w.cool = 0.4; return; }
    if (!j.lock) { lockAndRun(w, j); return; }
    if (mode === 'nowait') { w.st = 'error'; w.cool = 0.35; say(`W${w.n}: <span style="color:var(--err)">ERROR could not obtain lock on row ${j.id}</span> → retry`); return; }
    w.st = 'blocked'; w.wait = j; // plain FOR UPDATE: wait for the holder to commit
  }
  function lockAndRun(w, j) { j.lock = w; w.st = 'run'; w.job = j; w.left = j.dur; }
  function release(j, committed) {
    j.lock = null;
    const waiting = workers.filter((o) => o.st === 'blocked' && o.wait === j);
    if (!committed) { // row unchanged: the first waiter gets the lock, the rest keep waiting on it
      const o = waiting.shift();
      if (o) { o.wait = null; lockAndRun(o, j); say(`W${o.n}: holder aborted → got row ${j.id}`); }
      return;
    }
    waiting.forEach((o) => { // re-check sees status='done' → the LIMIT 1 query returns nothing
      o.wait = null; o.st = 'idle'; o.cool = 0.15;
      say(`W${o.n}: lock granted, but row ${j.id} no longer matches <code>status='queued'</code> → <b>0 rows</b>, retry`);
    });
  }
  function kill() {
    const busy = workers.filter((w) => w.st === 'run');
    if (!busy.length) { say('No busy worker to kill.'); return; }
    const w = busy[Math.floor(Math.random() * busy.length)];
    const j = w.job;
    say(`💥 W${w.n} killed: its transaction <b>rolls back</b>, so the lock is released and row ${j.id} is still 'queued'.`);
    w.st = 'dead'; w.job = null; w.cool = 2;
    release(j, false);
    draw();
  }
  function step(dt) {
    if (finished) return;
    t += dt;
    workers.forEach((w) => {
      if (w.st === 'run') {
        busyTime += dt; w.left -= dt;
        if (w.left <= 0) { const j = w.job; j.status = 'done'; w.job = null; w.st = 'idle'; w.cool = 0.1; say(`W${w.n}: done row ${j.id}, COMMIT`); release(j, true); }
      } else if (w.st === 'blocked') blockedTime += dt;
      else { w.cool -= dt; if (w.cool <= 0) claim(w); }
    });
    if (jobs.every((j) => j.status === 'done')) {
      finished = true;
      say(`<b>All ${ROWS} jobs done in ${t.toFixed(1)} s.</b> ${mode === 'skip' ? 'Workers ran in parallel.' : 'Workers were mostly serialised on one row.'}`);
    }
  }

  function draw() {
    gRows.innerHTML = ''; gW.innerHTML = ''; gLinks.innerHTML = '';
    jobs.forEach((j, i) => {
      const y = Y0 + i * RH;
      const fill = j.status === 'done' ? 'color-mix(in srgb, var(--ok) 22%, var(--surface))' : j.lock ? 'color-mix(in srgb, var(--warn) 30%, var(--surface))' : 'var(--surface-2)';
      const ty = y + (RH - 5) / 2 + 5;
      gRows.append(svg('rect', { x: LX, y, width: LW, height: RH - 5, rx: 5, fill, stroke: 'var(--border)' }),
        svg('text', { x: LX + 7, y: ty, style: 'font:600 14px var(--mono)', fill: 'var(--text)', text: `#${j.id}` }),
        svg('text', { x: LX + (narrow ? 42 : 46), y: ty, style: 'font:14px var(--mono)', fill: 'var(--text-2)', text: j.status === 'done' ? 'done' : j.lock ? `🔒 W${j.lock.n}` : 'queued' }));
      const waiters = workers.filter((w) => w.wait === j).length;
      if (waiters) gRows.append(svg('text', { x: LX + LW - 7, y: ty, 'text-anchor': 'end', style: `font:700 ${narrow ? 14 : 13}px var(--mono)`, fill: 'var(--err)', text: narrow ? `+${waiters}` : `${waiters} waiting` }));
    });
    workers.forEach((w) => {
      const color = { run: 'var(--ok)', blocked: 'var(--err)', error: 'var(--warn)', dead: 'var(--text-3)', idle: 'var(--border)' }[w.st];
      gW.append(svg('rect', { x: WX, y: w.y, width: WW, height: w.h, rx: 7, fill: `color-mix(in srgb, ${color} 18%, var(--surface))`, stroke: color }));
      const label = { run: `running #${w.job && w.job.id}`, blocked: `BLOCKED on #${w.wait && w.wait.id}`, error: narrow ? 'lock error' : 'lock error, retry', dead: 'killed', idle: 'polling' }[w.st];
      gW.append(svg('text', { x: WX + (narrow ? 8 : 10), y: w.y + w.h / 2 + 4, style: 'font:700 14px var(--sans)', fill: 'var(--text)', text: `W${w.n}` }),
        svg('text', { x: WX + 40, y: w.y + w.h / 2 + 4, style: 'font:14px var(--mono)', fill: 'var(--text-2)', text: label }));
      if (w.st === 'run' && w.job) gW.append(svg('rect', { x: WX + 4, y: w.y + w.h - 5, width: Math.max(0, (WW - 8) * (1 - w.left / w.job.dur)), height: 3, rx: 1.5, fill: 'var(--ok)' }));
      const target = w.st === 'run' ? w.job : w.st === 'blocked' ? w.wait : null;
      if (target) {
        const ty = Y0 + (target.id - 1) * RH + (RH - 5) / 2;
        gLinks.append(svg('path', { d: `M${LX + LW},${ty} C${LX + LW + 14},${ty} ${WX - 14},${w.y + w.h / 2} ${WX},${w.y + w.h / 2}`, fill: 'none', stroke: w.st === 'run' ? 'var(--ok)' : 'var(--err)', 'stroke-width': 1.6, 'stroke-dasharray': w.st === 'blocked' ? '4 3' : '' }));
      }
    });
    const done = jobs.filter((j) => j.status === 'done').length;
    const wt = Math.max(t * nWorkers, 0.001);
    stats.innerHTML = '';
    [['done', `${done}/${ROWS}`], ['elapsed', t.toFixed(1) + ' s'], ['throughput', (done / Math.max(t, 0.1)).toFixed(2) + ' jobs/s'], ['worker time blocked', Math.round((blockedTime / wt) * 100) + '%'], ['worker time busy', Math.round((busyTime / wt) * 100) + '%']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  ctx.onResize((n) => { geom(n); frame(); reset(); });
  reset();
  if (!ctx.reduced) ctx.loop((dt) => { if (!running || finished) return; step(Math.min(dt, 100) / 1000 * 1.2); draw(); });
});
