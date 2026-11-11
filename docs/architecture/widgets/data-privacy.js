/* Erasure fan-out: one request, six stores. Orchestrated deletes finish per store schedule; crypto-shredding destroys the subject key. */
SD.widget('data-privacy', function (root, ctx) {
  const { el, svg } = ctx;
  // lag = days until that store's delete lands (orchestrated). enc = holds ciphertext under the subject key.
  const STORES = [
    { id: 'db', name: 'Service DBs', lag: 0, enc: true, how: 'DELETE by subject_id' },
    { id: 'cache', name: 'Cache', lag: 0, enc: false, how: 'evict keys (plaintext)' },
    { id: 'search', name: 'Search index', lag: 1, enc: false, how: 'delete docs by id (plaintext)' },
    { id: 'wh', name: 'Warehouse', lag: 2, enc: true, how: 'nightly batch delete' },
    { id: 'logs', name: 'Logs (raw)', lag: 30, enc: false, how: 'append-only: expires at 30 d' },
    { id: 'bk', name: 'Backups', lag: 35, enc: true, how: 'immutable: expires at 35 d' }
  ];
  const SLA = 30, MAXD = 40;
  let gen = 0, loopH = null;
  const st = { mode: 'orch', maskLogs: false, failWh: false, day: -1, running: false, keyAlive: true, resurrected: false, items: [] };

  function build(narrow) {
    const my = ++gen;
    if (loopH) loopH.stop();
    root.innerHTML = '';
    const W = narrow ? 360 : 680, F = narrow ? 14 : 14, F2 = 13, RH = narrow ? 52 : 40, TOP = 38;
    const LX = 6, BX = narrow ? 128 : 170, BW = narrow ? 222 : 360;
    const H = TOP + RH * STORES.length + 34;

    const mk = (t, cls) => el('button', { class: 'btn' + (cls ? ' ' + cls : ''), text: t });
    const bOrch = mk('Orchestrated deletes'), bShred = mk('Crypto-shredding');
    const bGo = mk('▶ Submit erasure', 'primary'), bWeek = mk('+7 days'), bRestore = mk('⟲ Restore backup');
    const bFail = mk('Warehouse job: ok'), bMask = mk('Logs: raw PII');
    root.append(el('div', { class: 'w-controls' }, bOrch, bShred, bGo, bWeek, bRestore, bFail, bMask));

    const stage = el('div', { class: 'w-stage' });
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Erasure progress per store' });
    stage.append(S, el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Each bar is the time the subject\'s data is still <b>readable</b> in that store. Red = readable, green = gone or unreadable. Dashed line = GDPR one-month deadline.' }));
    const stats = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stage, stats, log);

    const T = (x, y, txt, o = {}) => svg('text', { x, y, 'text-anchor': o.a || 'start', fill: o.fill || 'var(--text)', style: `font:${o.w || 600} ${o.f || F}px var(${o.mono ? '--mono' : '--sans'})`, text: txt });
    const xOf = (d) => BX + BW * Math.min(d, MAXD) / MAXD;
    S.append(T(LX, 22, 'store', { f: F2, fill: 'var(--text-3)' }), T(BX, 22, 'day 0', { f: F2, fill: 'var(--text-3)' }), T(BX + BW, 22, MAXD + ' d', { f: F2, fill: 'var(--text-3)', a: 'end' }));
    const yEnd = TOP + RH * STORES.length;
    S.append(svg('line', { x1: xOf(SLA), x2: xOf(SLA), y1: TOP - 6, y2: yEnd, stroke: 'var(--warn)', 'stroke-dasharray': '4 4', 'stroke-width': 1.5 }));
    S.append(T(xOf(SLA), yEnd + 18, '30 d deadline', { f: F2, fill: 'var(--warn)', a: 'middle' }));
    const now = svg('line', { x1: BX, x2: BX, y1: TOP - 6, y2: yEnd, stroke: 'var(--accent)', 'stroke-width': 2, opacity: 0 });
    const rows = STORES.map((s, i) => {
      const y = TOP + i * RH, bh = narrow ? 16 : 16, by = narrow ? y + 26 : y + (RH - bh) / 2;
      const name = T(LX, narrow ? y + 18 : y + RH / 2 + 5, s.name, { w: 700 });
      const sub = T(narrow ? BX : LX, narrow ? y + 18 : y + RH / 2 + 5, '', { f: F2, fill: 'var(--text-3)' });
      if (!narrow) sub.setAttribute('visibility', 'hidden');
      const track = svg('rect', { x: BX, y: by, width: BW, height: bh, rx: 4, fill: 'var(--surface-2)', stroke: 'var(--border)' });
      const red = svg('rect', { x: BX, y: by, width: 0, height: bh, rx: 4, fill: 'var(--err)', opacity: 0.75 });
      const mark = T(narrow ? LX : BX + 6, narrow ? by + 13 : by + 13, '', { f: F2, w: 700 });
      S.append(track, red, name, sub, mark);
      return { red, sub, mark, by, bh };
    });
    S.append(now);

    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: `<b>d${Math.max(0, Math.floor(st.day))}</b> · ${t}` })); while (log.children.length > 40) log.lastChild.remove(); }
    // Day at which each store stops being readable, for the current configuration.
    function goneAt(s) {
      if (st.mode === 'shred' && s.enc) return 0;
      if (s.id === 'logs' && st.maskLogs) return 0;
      if (s.id === 'wh' && st.failWh) return 6;          // job fails, retried with backoff, fixed on day 6
      return s.lag;
    }
    function reset() {
      st.day = -1; st.running = false; st.keyAlive = true; st.resurrected = false;
      st.items = STORES.map((s) => ({ s, done: false }));
      log.innerHTML = ''; paint();
    }
    function startReq() {
      reset(); st.day = 0; st.running = true;
      say('Erasure request <code>REQ-7f3</code> accepted. Due in <b>30 days</b> (Art. 12(3)). Fan-out to 6 stores.');
      if (st.mode === 'shred') { st.keyAlive = false; say('🔑 Subject key <b>DEK-42 destroyed</b> in the key vault. Encrypted copies (DB, warehouse, backups) are unreadable now.'); }
      step(0);
    }
    function step(d) {
      st.items.forEach((it) => {
        if (it.done) return;
        const g = goneAt(it.s);
        if (st.failWh && it.s.id === 'wh' && st.mode === 'orch' && d >= 2 && d < 6 && Math.floor(d) !== it.lastFail) { it.lastFail = Math.floor(d); say(`⚠ warehouse step <b>RETRY</b> (attempt ${Math.floor(d) - 1}): batch job failed.`); }
        if (d >= g) {
          it.done = true;
          const why = st.mode === 'shred' && it.s.enc ? 'key gone, ciphertext unreadable' : it.s.id === 'logs' && st.maskLogs ? 'masked at source: nothing to delete' : it.s.how;
          say(`${g <= SLA ? '✓' : '✗'} <b>${it.s.name}</b>: ${why} → <b>${g <= SLA ? 'DONE' : 'DONE after deadline'}</b>`);
        }
      });
      if (st.items.every((it) => it.done) && st.running) {
        st.running = false;
        const worst = Math.max(...st.items.map((it) => goneAt(it.s)));
        say(worst <= SLA ? `🧾 Request closed in <b>${worst} d</b>. Audit: 6 steps, timestamps, row counts, no PII.` : `🧾 Live stores done, but data stayed readable for <b>${worst} d</b> (logs/backups expiry). Document it and keep copies beyond use.`);
      }
    }
    function paint() {
      bOrch.classList.toggle('primary', st.mode === 'orch'); bShred.classList.toggle('primary', st.mode === 'shred');
      bFail.textContent = 'Warehouse job: ' + (st.failWh ? 'failing' : 'ok');
      bMask.textContent = 'Logs: ' + (st.maskLogs ? 'masked' : 'raw PII');
      const d = Math.max(0, st.day);
      STORES.forEach((s, i) => {
        const R = rows[i], it = st.items[i], g = goneAt(s);
        const active = st.day >= 0;
        const redTo = !active ? 0 : Math.min(d, g);
        R.red.setAttribute('width', Math.max(0, xOf(redTo) - BX));
        let readable = active ? !(it && it.done) : true;
        if (st.resurrected && s.id === 'db') readable = st.mode !== 'shred';
        R.red.setAttribute('fill', readable ? 'var(--err)' : 'var(--ok)');
        R.sub.textContent = st.mode === 'shred' && s.enc ? 'encrypted · DEK-42' : (s.id === 'logs' && st.maskLogs ? 'masked' : 'plaintext');
        R.mark.textContent = narrow ? '' : (!active ? '' : readable ? 'readable' : (st.mode === 'shred' && s.enc ? 'unreadable' : 'erased'));
        R.mark.setAttribute('x', Math.min(BX + BW - 70, xOf(redTo) + 6));
        R.mark.setAttribute('fill', readable ? 'var(--err)' : 'var(--ok)');
      });
      now.setAttribute('x1', xOf(d)); now.setAttribute('x2', xOf(d)); now.setAttribute('opacity', st.day >= 0 ? 1 : 0);
      const left = st.items.filter((it) => !it.done).length + (st.resurrected && st.mode !== 'shred' ? 1 : 0);
      const worst = Math.max(...STORES.map(goneAt));
      stats.innerHTML = '';
      [['day', st.day < 0 ? '–' : Math.floor(d)], ['stores still readable', st.day < 0 ? '–' : left + ' / 6'], ['subject key', st.keyAlive ? 'alive' : 'destroyed'],
        ['worst case', worst + ' d'], ['GDPR one month', worst <= SLA ? '✓ met' : '✗ copies past 30 d']]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
    function advance(n) {
      if (st.day < 0) return;
      const from = st.day; st.day = Math.min(MAXD, st.day + n);
      for (let d = Math.floor(from) + 1; d <= Math.floor(st.day); d++) step(d);
      step(st.day); paint();
    }

    bOrch.onclick = () => { st.mode = 'orch'; reset(); say('Mode: <b>orchestrated deletes</b>. Each store deletes on its own schedule.'); };
    bShred.onclick = () => { st.mode = 'shred'; reset(); say('Mode: <b>crypto-shredding</b>. DB, warehouse and backups hold ciphertext under the subject\'s key; search and cache still hold plaintext.'); };
    bGo.onclick = startReq;
    bWeek.onclick = () => advance(7);
    bFail.onclick = () => { st.failWh = !st.failWh; reset(); };
    bMask.onclick = () => { st.maskLogs = !st.maskLogs; reset(); };
    bRestore.onclick = () => {
      if (st.day < 0) { say('Submit an erasure first, then restore a backup taken before it.'); return; }
      st.resurrected = true;
      if (st.mode === 'shred') say('⟲ Restored a backup from before the request. Her rows are back but <b>unreadable</b>: DEK-42 is gone. Tombstone replay removes the orphans.');
      else say('⟲ Restored a backup from before the request: her row is <b>back and readable</b>! Replaying the tombstone ledger re-deletes it before traffic resumes.');
      paint();
      setTimeout(() => { if (my !== gen) return; st.resurrected = false; say('🪦 Tombstones replayed: <code>REQ-7f3</code> re-applied to the restored DB.'); paint(); }, 2200);
    };

    let acc = 0;
    loopH = ctx.loop((dt) => {
      if (ctx.reduced || !st.running) return;
      acc += dt; if (acc < 120) return;
      advance(acc / 300); acc = 0;          // ~3.3 simulated days per second
    });

    reset();
    say(ctx.reduced ? 'Press <b>Submit erasure</b>, then <b>+7 days</b> to step time.' : 'Press <b>Submit erasure</b>. Then switch to <b>Crypto-shredding</b> and compare. Try <b>Restore backup</b> in both modes.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
