/* Deterministic percentage rollout with real MurmurHash3 (x86, 32-bit, seed 0):
   bucket = murmur3(flagKey + "." + salt + "." + userKey) mod 100000, on iff bucket < pct*1000.
   Compared with random() per check (flapping) and userId % 100 (sticky but correlated across flags).
   Optional targeting rules show the evaluation order: off → prerequisite → targets → rules → fallthrough. */
SD.widget('feature-flags', function (root, ctx) {
  const { el, svg } = ctx;

  function murmur3(str) {
    const d = new TextEncoder().encode(str), n = d.length, nb = n & ~3;
    let h = 0, k;
    for (let i = 0; i < nb; i += 4) {
      k = d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24);
      k = Math.imul(k, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593);
      h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
    }
    k = 0;
    switch (n & 3) { // fall-through is intended
      case 3: k ^= d[nb + 2] << 16; // eslint-disable-line no-fallthrough
      case 2: k ^= d[nb + 1] << 8; // eslint-disable-line no-fallthrough
      case 1: k ^= d[nb]; k = Math.imul(k, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593); h ^= k;
    }
    h ^= n; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }

  // ---- state (survives layout rebuilds)
  const B_PCT = 30, B_SALT = 'b7';
  let mode = 'hash', pct = 10, salt = 'a1f3', showB = false, rules = false, flagOn = true, live = !ctx.reduced;
  let sel = 6, kept = '—', flips = 0, changed = '—';
  let users = [];

  function makeUsers(N) {
    const C = ['US', 'IN', 'DE', 'BR', 'GB'], P = ['free', 'free', 'pro', 'enterprise'];
    return Array.from({ length: N }, (_, i) => {
      const key = 'user-' + (i + 1), h = murmur3('attrs:' + key);
      return { id: i + 1, uid: 100000 + 100 * (murmur3('uid:' + key) % 9000) + (i * 7) % 100, key, country: C[h % 5], plan: P[(h >>> 4) % 4], a: null, b: null, bucket: 0, why: '' };
    });
  }
  function bucketOf(u, flag, s) {
    if (mode === 'random') return Math.floor(Math.random() * 100000);
    if (mode === 'idmod') return (u.uid % 100) * 1000;              // numeric id % 100 < pct
    return murmur3(flag + '.' + s + '.' + u.key) % 100000;
  }
  // flag A: new-checkout, with optional targeting; returns {on, why, bucket}
  function evalA(u) {
    if (!flagOn) return { on: false, why: 'OFF' };
    if (rules) {
      if (u.country === 'BR') return { on: false, why: 'PREREQ' };    // payments-v2 is off in BR
      if (u.key === 'user-7') return { on: true, why: 'TARGET' };
      if (u.country === 'DE') return { on: false, why: 'RULE1' };
      if (u.plan === 'enterprise' || u.key === 'user-3') return { on: true, why: 'RULE2' };
    }
    const b = bucketOf(u, 'new-checkout', salt);
    return { on: b < pct * 1000, why: 'FALL', bucket: b };
  }
  function evaluateAll() {
    let f = 0;
    users.forEach((u) => {
      const r = evalA(u);
      if (u.a !== null && u.a !== r.on) f++;
      u.a = r.on; u.why = r.why; if (r.bucket !== undefined) u.bucket = r.bucket;
      u.b = bucketOf(u, 'dark-mode', B_SALT) < B_PCT * 1000;
    });
    return f;
  }

  // ---- controls
  const modeBtns = {};
  const modeRow = el('div', { class: 'w-controls' });
  [['hash', 'hash(flag.salt.user)'], ['random', 'random() per check'], ['idmod', 'userId % 100']].forEach(([v, l]) => {
    const b = el('button', { class: 'btn', text: l });
    b.addEventListener('click', () => { mode = v; kept = '—'; changed = '—'; refreshBtns(); evaluateAll(); flips = 0; paint(); say(modeMsg()); });
    modeBtns[v] = b; modeRow.append(b);
  });
  const pctOut = el('b', { text: pct + '%' });
  const pctIn = el('input', { type: 'range', min: 0, max: 100, value: pct, 'aria-label': 'Rollout percentage' });
  pctIn.addEventListener('input', () => {
    const before = users.filter((u) => u.a && u.why === 'FALL');
    const up = +pctIn.value > pct;
    pct = +pctIn.value; pctOut.textContent = pct + '%';
    evaluateAll(); flips = 0;
    if (up && before.length) kept = before.filter((u) => u.a).length + ' / ' + before.length;
    paint();
  });
  const saltBtn = el('button', { class: 'btn', text: '🎲 New salt' });
  saltBtn.addEventListener('click', () => {
    const was = users.map((u) => u.a);
    salt = (Math.random() * 0xffff | 0).toString(16).padStart(4, '0');
    evaluateAll(); flips = 0;
    changed = users.filter((u, i) => u.a !== was[i]).length + ' users';
    paint();
    say(mode === 'hash' ? `Salt → <code>${salt}</code>: a different ${pct}% is chosen (${changed} switched). Same size, new people: useful to rerun an experiment, dangerous mid-rollout.` : 'This bucketing ignores the salt.');
  });
  const bBtn = el('button', { class: 'btn' }), rBtn = el('button', { class: 'btn' }), kBtn = el('button', { class: 'btn' }), lBtn = el('button', { class: 'btn' });
  bBtn.addEventListener('click', () => { showB = !showB; refreshBtns(); paint(); if (showB) say(`Flag B <b>dark-mode</b> is at ${B_PCT}%. Compare the overlap with the expected value for independent flags.`); });
  rBtn.addEventListener('click', () => { rules = !rules; refreshBtns(); evaluateAll(); flips = 0; paint(); say(rules ? 'Rules on. Dots mark users decided by a rule or target, not by the rollout. Tap one.' : 'Rules off: pure percentage rollout.'); });
  kBtn.addEventListener('click', () => { flagOn = !flagOn; refreshBtns(); evaluateAll(); flips = 0; paint(); say(flagOn ? 'Flag back on: the same users as before get it (nothing was stored, the hash recomputes it).' : '🛑 Kill switch: every SDK returns the <b>off variation</b> without reading rules.'); });
  lBtn.addEventListener('click', () => { live = !live; refreshBtns(); });
  function refreshBtns() {
    Object.entries(modeBtns).forEach(([v, b]) => b.classList.toggle('primary', v === mode));
    bBtn.textContent = 'Flag B: ' + (showB ? 'on' : 'off');
    rBtn.textContent = 'Rules: ' + (rules ? 'on' : 'off');
    kBtn.textContent = flagOn ? '🛑 Kill switch' : '▶ Flag on';
    lBtn.textContent = live ? '⏸ Live requests' : '▶ Live requests';
  }
  root.append(modeRow, el('div', { class: 'w-controls' }, el('label', null, 'Rollout ', pctOut, ' ', pctIn), saltBtn, bBtn, rBtn, kBtn, lBtn));
  const stage = el('div', { class: 'w-stage' });
  const legend = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' } });
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stage, legend, stats, log);
  function say(h) { log.prepend(el('div', { html: h })); while (log.children.length > 30) log.lastChild.remove(); }
  function modeMsg() {
    return { hash: 'MurmurHash3 of <code>new-checkout.' + salt + '.user-N</code> mod 100,000. Same input, same bucket, on every server.',
      random: '<code>random() &lt; p</code> per check: watch users flip on every request while live requests run.',
      idmod: '<code>id % 100 &lt; p</code>: sticky, but turn on flag B: every flag picks the same low ids.' }[mode];
  }

  // ---- drawing
  let G = {};
  function build(narrow) {
    const COLS = narrow ? 8 : 15, ROWS = narrow ? 10 : 8, CELL = 40, GAP = 4;
    const VW = narrow ? 360 : 640, PAD = (VW - COLS * CELL) / 2, FS = narrow ? 14 : 13;
    const LY = 34, GY = 84, VH = GY + ROWS * CELL + 8;
    users = makeUsers(COLS * ROWS);
    evaluateAll(); flips = 0;
    if (sel > users.length - 1) sel = 6;
    stage.innerHTML = '';
    const S = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': 'Users bucketed by hash', style: narrow ? '' : 'max-width:700px' });
    stage.append(S);
    const X0 = PAD, X1 = VW - PAD, bx = (b) => X0 + (b / 100000) * (X1 - X0);
    S.append(svg('line', { x1: X0, x2: X1, y1: LY, y2: LY, stroke: 'var(--border)', 'stroke-width': 2 }));
    const gTicks = svg('g'); S.append(gTicks);
    const thr = svg('line', { y1: LY - 20, y2: LY + 12, stroke: 'var(--accent)', 'stroke-width': 2.5 });
    const thrT = svg('text', { y: LY - 22, 'text-anchor': 'middle', fill: 'var(--accent)', style: `font:700 ${FS}px var(--mono)` });
    S.append(thr, thrT,
      svg('text', { x: X0, y: LY + 28, fill: 'var(--text-3)', style: `font:600 ${FS}px var(--mono)`, text: '0' }),
      svg('text', { x: X1, y: LY + 28, 'text-anchor': 'end', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--mono)`, text: '99,999' }),
      svg('text', { x: VW / 2, y: LY + 28, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: 'bucket of each user' }));
    const cells = users.map((u, i) => {
      const x = PAD + (i % COLS) * CELL, y = GY + Math.floor(i / COLS) * CELL;
      const r = svg('rect', { x: x + GAP / 2, y: y + GAP / 2, width: CELL - GAP, height: CELL - GAP, rx: 6, style: 'cursor:pointer;transition:fill .25s' });
      const dot = svg('circle', { cx: x + CELL / 2, cy: y + CELL / 2, r: 5, fill: 'var(--text)', opacity: 0.6, 'pointer-events': 'none' });
      r.addEventListener('click', () => { sel = i; paint(); trace(u); });
      S.append(r, dot);
      return { r, dot };
    });
    G = { gTicks, thr, thrT, cells, bx, LY, narrow };
    paint();
  }

  function paint() {
    if (!G.cells) return;
    const { gTicks, thr, thrT, cells, bx, LY } = G;
    gTicks.innerHTML = '';
    users.forEach((u, i) => {
      if (u.why === 'FALL') gTicks.append(svg('line', { x1: bx(u.bucket), x2: bx(u.bucket), y1: LY - 9, y2: LY + 9, stroke: u.a ? 'var(--ok)' : 'var(--text-3)', 'stroke-width': i === sel ? 3 : 1.5, opacity: u.a ? 1 : 0.55 }));
      let fill = 'var(--surface-2)';
      if (showB) fill = u.a && u.b ? 'var(--ok)' : u.a ? 'var(--accent)' : u.b ? 'var(--warn)' : 'var(--surface-2)';
      else if (u.a) fill = 'var(--ok)';
      const c = cells[i];
      c.r.style.fill = fill;
      c.r.style.stroke = i === sel ? 'var(--text)' : 'var(--border)';
      c.r.style.strokeWidth = i === sel ? 3 : 1;
      c.dot.style.display = u.why !== 'FALL' && u.why !== 'OFF' ? '' : 'none';
    });
    const tx = bx(pct * 1000);
    thr.setAttribute('x1', tx); thr.setAttribute('x2', tx);
    thrT.setAttribute('x', Math.max(bx(0) + 34, Math.min(bx(100000) - 34, tx)));
    thrT.textContent = '< ' + (pct * 1000).toLocaleString('en-US');
    legend.innerHTML = showB
      ? '<b style="color:var(--accent)">■</b> only A (new-checkout) · <b style="color:var(--warn)">■</b> only B (dark-mode) · <b style="color:var(--ok)">■</b> both · ● decided by a rule. Ticks on the line: each user\'s bucket for A.'
      : '<b style="color:var(--ok)">■</b> new-checkout on · <b style="color:var(--text-3)">■</b> off · ● decided by a rule or target. Ticks on the line: each user\'s bucket; users left of the threshold are in.';
    const fall = users.filter((u) => u.why === 'FALL');
    const on = users.filter((u) => u.a).length;
    const st = {
      'A on': on + ' / ' + users.length,
      'rollout hits': fall.filter((u) => u.a).length + ' of ' + fall.length + ' (target ' + pct + '%)',
      'kept on after raising %': kept,
      'flipped on last check': flips
    };
    if (changed !== '—') st['changed by new salt'] = changed;
    if (showB) {
      const both = users.filter((u) => u.a && u.b).length;
      st['A ∧ B overlap'] = both + ' (independent ≈ ' + Math.round((on * B_PCT) / 100) + ')';
    }
    stats.innerHTML = '';
    Object.entries(st).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  function trace(u) {
    const steps = ['<b>' + u.key + '</b> (id ' + u.uid + ', country ' + u.country + ', plan ' + u.plan + ')'];
    const r = evalA(u);
    if (!flagOn) steps.push('flag is <b>off</b> → off variation');
    else {
      steps.push('flag on ✓');
      if (rules) {
        steps.push('prereq payments-v2 ' + (u.country === 'BR' ? '✗ (off in BR) → <b>off</b>' : '✓'));
        if (r.why !== 'PREREQ') steps.push('target list [user-7] ' + (r.why === 'TARGET' ? '✓ → <b>on</b>' : '✗'));
        if (!['PREREQ', 'TARGET'].includes(r.why)) steps.push('rule 1 country = DE ' + (r.why === 'RULE1' ? '✓ → <b>off</b>' : '✗'));
        if (['RULE2', 'FALL'].includes(r.why)) steps.push('rule 2 segment beta (enterprise or user-3) ' + (r.why === 'RULE2' ? '✓ → <b>on</b>' : '✗'));
      }
      if (r.why === 'FALL') steps.push('fallthrough: bucket <b>' + r.bucket.toLocaleString('en-US') + '</b> ' + (r.on ? '&lt;' : '≥') + ' ' + (pct * 1000).toLocaleString('en-US') + ' → <b>' + (r.on ? 'on' : 'off') + '</b>' + (mode === 'random' ? ' (random: may differ next time)' : ''));
    }
    say(steps.join(' → '));
  }

  // ---- live requests: re-evaluate everyone; only random() changes anything
  let acc = 0;
  ctx.loop((dt) => {
    if (!live) return;
    acc += dt;
    if (acc < 900) return;
    acc = 0;
    flips = evaluateAll();
    paint();
  });

  refreshBtns();
  build(ctx.narrow);
  say(modeMsg());
  say('Drag the rollout from 10% to 20%: "kept on" stays at 100%. Then try random() and userId % 100.');
  ctx.onResize(build);
});
