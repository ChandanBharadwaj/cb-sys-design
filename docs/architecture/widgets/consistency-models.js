/* Two transactions on a timeline, executed by a small Postgres-like MVCC engine:
   per-statement (RC) or per-transaction (RR/SER) snapshots, row locks with waits,
   first-updater-wins 40001, and simplified SSI (abort a pivot whose out-neighbour committed). */
SD.widget('consistency-models', function (root, ctx) {
  const { el, svg } = ctx;
  const R = (k) => ({ t: 'r', k }), C = (pfx, val) => ({ t: 'cnt', pfx, val });
  const PRESETS = {
    lost: {
      name: 'Lost update', init: { stock: 1 },
      goal: 'One item in stock. Both buyers read it, decide in code, and write back stock − 1.',
      ops: [['A', R('stock')], ['B', R('stock')], ['A', { t: 'w', k: 'stock', calc: 'dec' }], ['B', { t: 'w', k: 'stock', calc: 'dec' }], ['A', { t: 'c' }], ['B', { t: 'c' }]],
      fix: 'SELECT … FOR UPDATE', fixOps: [['A', R('stock'), 1], ['B', R('stock'), 1], ['A', { t: 'w', k: 'stock', calc: 'dec' }], ['B', { t: 'w', k: 'stock', calc: 'dec' }], ['A', { t: 'c' }], ['B', { t: 'c' }]],
      bad: (d, ok) => ok.A && ok.B && d.sold === 2 ? 'Two orders for one item: lost update' : null,
      matrix: [['Read uncommitted / committed', 1], ['Repeatable read (ANSI, locking)', 0], ['Snapshot isolation', 0], ['Serializable', 0]]
    },
    skew: {
      name: 'Write skew', init: { 'doc:alice': 'on', 'doc:bob': 'on' },
      goal: 'Rule: at least one doctor on call. Each nurse counts, and if 2 are on call sends one home.',
      ops: [['A', C('doc:', 'on')], ['B', C('doc:', 'on')], ['A', { t: 'w', k: 'doc:alice', v: 'off', guard: 2 }], ['B', { t: 'w', k: 'doc:bob', v: 'off', guard: 2 }], ['A', { t: 'c' }], ['B', { t: 'c' }]],
      fix: 'lock shift row FOR UPDATE', fixOps: [['A', R('shift'), 1], ['A', C('doc:', 'on')], ['B', R('shift'), 1], ['B', C('doc:', 'on')], ['A', { t: 'w', k: 'doc:alice', v: 'off', guard: 2 }], ['B', { t: 'w', k: 'doc:bob', v: 'off', guard: 2 }], ['A', { t: 'c' }], ['B', { t: 'c' }]],
      bad: (d) => d['doc:alice'] === 'off' && d['doc:bob'] === 'off' ? 'Nobody on call: write skew' : null,
      matrix: [['Read committed', 1], ['Repeatable read (ANSI, locking)', 0], ['Snapshot isolation (Postgres RR)', 1], ['Serializable', 0]]
    },
    phantom: {
      name: 'Phantom', init: {},
      goal: 'Book room 1 at 9:00 only if no booking overlaps. Each client counts overlapping bookings, sees 0, and inserts a new row.',
      ops: [['A', C('bk:')], ['B', C('bk:')], ['A', { t: 'w', k: 'bk:A', v: 'A', guard0: 1 }], ['B', { t: 'w', k: 'bk:B', v: 'B', guard0: 1 }], ['A', { t: 'c' }], ['B', { t: 'c' }]],
      fix: 'EXCLUDE constraint', fixOps: null,
      bad: (d) => d['bk:A'] && d['bk:B'] ? 'Room booked twice: phantom / predicate write skew' : null,
      matrix: [['Read committed', 1], ['Repeatable read (ANSI: phantoms allowed)', 1], ['Snapshot isolation (Postgres RR)', 1], ['Serializable', 0]]
    },
    stale: {
      name: 'Stale replica read', init: { name: 'Ann' },
      goal: 'A renames the profile, commits, then reloads the page. Reads go through the read router.',
      ops: [['A', { t: 'w', k: 'name', v: 'Anna' }], ['A', { t: 'c' }], ['A', { t: 'r', k: 'name', rep: 1 }], ['B', { t: 'r', k: 'name', rep: 1 }], ['B', { t: 'replay' }], ['A', { t: 'r', k: 'name', rep: 1 }]],
      fix: 'read-your-writes routing', fixOps: null,
      bad: (d, ok, staleA) => staleA ? 'A did not see its own write: read-your-writes violated' : null,
      matrix: [['Eventual consistency', 1], ['Monotonic reads', 1], ['Read-your-writes', 0], ['Causal / sequential / linearizable', 0]]
    }
  };
  const LV = { rc: 'READ COMMITTED', rr: 'REPEATABLE READ', ser: 'SERIALIZABLE' };
  const S = { p: 'lost', lv: 'rc', fix: false, step: 0, timer: null };

  // ---------- engine ----------
  function simulate(p, lv, fix) {
    const P = PRESETS[p];
    const ops = ((fix && P.fixOps) || P.ops).map(([c, op, l]) => [c, l ? Object.assign({}, op, { lock: 1 }) : op]);
    const useFixRoute = fix && p === 'stale', useExcl = fix && p === 'phantom';
    const rows = {}; let seq = 0, repSeq = 0;
    Object.entries(Object.assign({ shift: 1 }, P.init)).forEach(([k, v]) => { rows[k] = [{ v, cts: 0 }]; });
    const tx = { A: null, B: null }, locks = {}, res = ops.map(() => null), queue = { A: [], B: [] };
    const out = { log: [], sold: 0, ok: { A: false, B: false }, staleA: false };
    const T = (c) => tx[c] || (tx[c] = { c, snap: null, st: 'run', w: {}, vars: {}, rd: new Set(), inE: new Set(), outE: new Set(), cts: Infinity, wait: null });
    const other = (c) => (c === 'A' ? 'B' : 'A');
    const snapOf = (t) => (lv === 'rc' ? seq : (t.snap === null ? (t.snap = seq) : t.snap));
    const visible = (t, k, at) => { if (k in t.w) return t.w[k]; const vs = rows[k] || []; let r; vs.forEach((x) => { if (x.cts <= at) r = x.v; }); return r; };
    const concurrent = (t, u) => u && u !== t && u.st !== 'abort' && !(u.cts <= (t.snap === null ? seq : t.snap));
    const keysOf = (pfx) => Object.keys(rows).concat(Object.keys(tx.A ? tx.A.w : {}), Object.keys(tx.B ? tx.B.w : {})).filter((k, i, a) => k.startsWith(pfx) && a.indexOf(k) === i);
    function rwRead(t, keyOrPfx) {          // t read something a concurrent u wrote → t →rw u
      const u = tx[other(t.c)];
      if (lv !== 'ser' || !concurrent(t, u)) return;
      const hit = Object.keys(u.w).concat(u.wrote || []).some((k) => k.startsWith(keyOrPfx));
      if (hit) { t.outE.add(u.c); u.inE.add(t.c); }
    }
    function rwWrite(t, k) {                // a concurrent u read k (or its predicate) → u →rw t
      const u = tx[other(t.c)];
      if (lv !== 'ser' || !concurrent(t, u)) return;
      if ([...u.rd].some((r) => k.startsWith(r))) { u.outE.add(t.c); t.inE.add(u.c); }
    }
    function abort(t, why) { t.st = 'abort'; Object.keys(locks).forEach((k) => { if (locks[k] === t.c) delete locks[k]; }); return { s: 'err', n: why }; }
    function lockRow(t, k) {                // returns null if acquired, 'wait', or an error result
      const h = locks[k];
      if (h && h !== t.c) return 'wait';
      if (lv !== 'rc') { const last = (rows[k] || []).slice(-1)[0]; if (last && last.cts > snapOf(t)) return abort(t, '40001 could not serialize access due to concurrent update'); }
      locks[k] = t.c; return null;
    }
    function exec(c, op) {
      const t = T(c);
      if (t.st === 'abort') return { s: 'skip', n: 'transaction already aborted' };
      if (op.t !== 'replay' && op.t !== 'c' && !op.rep) snapOf(t);   // Postgres takes the snapshot when the statement starts, even if it then waits
      if (op.t === 'replay') { repSeq = seq; return { s: 'ok', n: 'replica replays the WAL (caught up)' }; }
      if (op.t === 'r') {
        if (op.rep && !useFixRoute) { const v = visible({ w: {} }, op.k, repSeq); if (c === 'A' && v !== visible(t, op.k, seq) ) out.staleA = true; t.vars[op.k] = v; return { s: v === visible({ w: {} }, op.k, seq) ? 'ok' : 'warn', n: 'replica → ' + op.k + ' = ' + v + (v !== visible({ w: {} }, op.k, seq) ? ' (stale)' : '') }; }
        if (op.lock) { const l = lockRow(t, op.k); if (l === 'wait') return { s: 'wait', n: 'FOR UPDATE waits for ' + other(c) + '\'s row lock' }; if (l) return l; }
        const at = op.lock && lv === 'rc' ? seq : snapOf(t);
        const v = visible(t, op.k, at); t.vars[op.k] = v; t.rd.add(op.k); rwRead(t, op.k);
        return { s: 'ok', n: (op.rep ? 'primary → ' : 'read ') + op.k + ' = ' + v + (op.lock ? ' (locked)' : '') };
      }
      if (op.t === 'cnt') {
        const at = snapOf(t);
        const n = keysOf(op.pfx).filter((k) => { const v = visible(t, k, at); return v !== undefined && (!op.val || v === op.val); }).length;
        t.vars.count = n; t.rd.add(op.pfx); rwRead(t, op.pfx);
        return { s: 'ok', n: 'count ' + op.pfx.replace(':', '') + (op.val ? ' ' + op.val : '') + ' = ' + n };
      }
      if (op.t === 'w') {
        if (op.guard && t.vars.count < op.guard) return { s: 'ok', n: 'count is ' + t.vars.count + ': rule says stop, no write' };
        if (op.guard0 && t.vars.count > 0) return { s: 'ok', n: 'slot taken: no booking' };
        if (useExcl && op.k.startsWith('bk:')) {
          if (keysOf('bk:').some((k) => k !== op.k && rows[k])) return abort(t, '23P01 exclusion constraint: overlaps an existing booking');
          const u = tx[other(c)];
          if (u && u.st === 'run' && Object.keys(u.w).some((k) => k.startsWith('bk:'))) return { s: 'wait', n: 'INSERT waits: may conflict with ' + u.c + '\'s uncommitted booking' };
        }
        const l = lockRow(t, op.k); if (l === 'wait') return { s: 'wait', n: 'UPDATE waits for ' + other(c) + '\'s row lock' }; if (l) return l;
        if (op.calc === 'dec' && !(t.vars[op.k] > 0)) return { s: 'ok', n: 'stock is ' + t.vars[op.k] + ': out of stock, no write' };
        const v = op.calc === 'dec' ? t.vars[op.k] - 1 : op.v; snapOf(t);
        t.w[op.k] = v; rwWrite(t, op.k);
        return { s: 'ok', n: 'write ' + op.k + ' = ' + v };
      }
      if (op.t === 'c') {
        if (lv === 'ser' && t.inE.size && [...t.outE].some((u) => tx[u] && tx[u].st === 'commit')) return abort(t, '40001 could not serialize access due to read/write dependencies');
        seq++; t.cts = seq; t.st = 'commit'; t.wrote = Object.keys(t.w);
        Object.entries(t.w).forEach(([k, v]) => { (rows[k] = rows[k] || []).push({ v, cts: seq }); if (k === 'stock') out.sold++; });
        if (!useFixRoute && !P.ops.some((o) => o[1].t === 'replay')) repSeq = seq;
        Object.keys(locks).forEach((k) => { if (locks[k] === c) delete locks[k]; });
        out.ok[c] = true; return { s: 'ok', n: 'COMMIT' };
      }
    }
    const order = [];
    function run(i) {
      const [c, op] = ops[i]; const t = T(c);
      if (t.wait !== null || queue[c].length) { queue[c].push(i); res[i] = { s: 'wait', n: 'queued behind a waiting statement' }; return; }
      const r = exec(c, op); res[i] = r; order.push({ i, r });
      if (r.s === 'wait') { t.wait = i; return; }
      if (op.t === 'c' || r.s === 'err') wake(other(c));
    }
    function wake(c) {
      const t = tx[c]; if (!t || t.wait === null) return;
      const i = t.wait; t.wait = null;
      const r = exec(c, ops[i][1]); r.n = '(after ' + other(c) + ' ends) ' + r.n; res[i] = r; order.push({ i, r });
      if (r.s === 'wait') { t.wait = i; return; }
      const q = queue[c].splice(0); q.forEach((j) => { if (t.wait === null) { const r2 = exec(c, ops[j][1]); r2.n = '(resumed) ' + r2.n; res[j] = r2; order.push({ i: j, r: r2 }); if (r2.s === 'wait') t.wait = j; } });
    }
    for (let i = 0; i < ops.length; i++) run(i);
    const fin = {}; Object.keys(rows).forEach((k) => { if (k !== 'shift') fin[k] = rows[k].slice(-1)[0].v; });
    fin.sold = out.sold;
    out.ops = ops; out.res = res; out.order = order; out.final = fin;
    out.anomaly = P.bad(fin, out.ok, out.staleA);
    return out;
  }

  // ---------- UI ----------
  const segRow = (label, opts, key, after) => {
    const row = el('div', { class: 'w-controls' }, el('label', null, label));
    const bs = opts.map(([v, l]) => { const b = el('button', { class: 'btn', text: l }); b.addEventListener('click', () => { S[key] = v; S.step = 0; after(); }); row.append(b); return [v, b]; });
    return { row, sync: () => bs.forEach(([v, b]) => b.classList.toggle('primary', S[key] === v)) };
  };
  const pre = segRow('History', Object.entries(PRESETS).map(([k, p]) => [k, p.name]), 'p', paint);
  const lev = segRow('Level', Object.entries(LV).map(([k, l]) => [k, l]), 'lv', paint);
  const fixB = el('button', { class: 'btn' }); fixB.addEventListener('click', () => { S.fix = !S.fix; S.step = 0; paint(); });
  const stepB = el('button', { class: 'btn primary', text: 'Step ▶' }); stepB.addEventListener('click', () => { S.step++; paint(); });
  const allB = el('button', { class: 'btn', text: 'Run all' }); allB.addEventListener('click', () => { S.step = 99; paint(); });
  const rstB = el('button', { class: 'btn', text: '↺' }); rstB.addEventListener('click', () => { S.step = 0; paint(); });
  const goal = el('p', { class: 'muted', style: { margin: '6px 0', fontSize: '14px' } });
  const stage = el('div', { class: 'w-stage' });
  const stats = el('div', { class: 'w-stats' }), cmp = el('div', { class: 'w-log' }), mtx = el('div', { style: { marginTop: '8px', fontSize: '14px' } });
  root.append(pre.row, lev.row, el('div', { class: 'w-controls' }, stepB, allB, rstB, fixB), goal, stage, stats, cmp, mtx);

  let narrow = ctx.narrow;
  function paint() {
    pre.sync(); lev.sync();
    const P = PRESETS[S.p];
    fixB.textContent = 'Fix: ' + (S.fix ? 'on' : 'off') + ' (' + P.fix + ')';
    fixB.classList.toggle('primary', S.fix);
    goal.innerHTML = '<b>' + P.name + '.</b> ' + P.goal;
    const r = simulate(S.p, S.lv, S.fix);
    const evs = r.order.slice(0, S.step), cur = {};
    evs.forEach((e, j) => { cur[e.i] = { r: e.r, j }; });
    const n = r.ops.length;
    const W = narrow ? 360 : 560, RH = narrow ? 50 : 40, top = 34, H = top + n * RH + 8;
    const lane = narrow ? { A: 6, B: 184, w: 170 } : { A: 40, B: 300, w: 220 };
    const fs = narrow ? 14 : 14, fs2 = narrow ? 13 : 13;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Timeline of two transactions' });
    ['A', 'B'].forEach((c) => s.append(svg('text', { x: lane[c] + lane.w / 2, y: 20, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${fs + 1}px var(--sans)`, text: 'Client ' + c })));
    r.ops.forEach(([c, op], i) => {
      const y = top + i * RH, x = lane[c], on = !!cur[i], res = on ? cur[i].r : null;
      if (!narrow) s.append(svg('text', { x: 18, y: y + RH / 2 + 5, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:600 ${fs2}px var(--mono)`, text: 't' + (i + 1) }));
      const col = !on ? 'var(--border)' : { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)', wait: 'var(--warn)', skip: 'var(--text-3)' }[res.s];
      s.append(svg('rect', { x, y: y + 3, width: lane.w, height: RH - 8, rx: 7, fill: on ? 'var(--surface-2)' : 'none', stroke: col, 'stroke-width': on ? 2.5 : 1.2, 'stroke-dasharray': on ? '' : '4 3' }));
      const label = op.t === 'r' ? (op.lock ? 'FOR UPDATE ' : op.rep ? 'GET ' : 'SELECT ') + op.k : op.t === 'cnt' ? 'count(' + op.pfx.replace(':', '') + ')' : op.t === 'w' ? (op.k.startsWith('bk:') ? 'INSERT ' : 'UPDATE ') + op.k.replace('doc:', '') : op.t === 'c' ? 'COMMIT' : 'replica catches up';
            s.append(svg('text', { x: x + 8, y: y + RH / 2 + 4, fill: on ? 'var(--text)' : 'var(--text-3)', style: `font:600 ${fs}px var(--mono)`, text: (on && res.s === 'err' ? '✗ ' : on && res.s === 'wait' ? '⏳ ' : '') + label.slice(0, narrow ? 18 : 24) }));
      if (on && !narrow) s.append(svg('text', { x: x + lane.w - 6, y: y + RH / 2 + 4, 'text-anchor': 'end', fill: 'var(--text-3)', style: `font:600 ${fs2}px var(--mono)`, text: '#' + (cur[i].j + 1) }));
    });
    stage.innerHTML = ''; stage.append(s);
    // log of executed steps, in execution order
    const done = evs, last = done.length ? done[done.length - 1] : null;
    stats.innerHTML = '';
    const fin = done.length === r.order.length;
    [['level', LV[S.lv]], ['step', done.length + ' / ' + r.order.length], ['outcome', fin ? (r.anomaly ? '❌ ' + r.anomaly : '✅ invariant holds') : last ? r.ops[last.i][0] + ': ' + last.r.n : 'press Step']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    // compare all three levels at once
    cmp.innerHTML = '<b>Same history at each level</b>' + (S.fix ? ' (with fix)' : '') + ':';
    Object.keys(LV).forEach((l) => {
      const x = simulate(S.p, l, S.fix);
      const errs = x.res.filter((q) => q.s === 'err').map((q) => (q.n.match(/\d{2}[0-9P]\d{2}/) || ['error'])[0]);
      cmp.append(el('div', { html: `${l === S.lv ? '▶ ' : ''}<b>${LV[l]}</b>: ${x.anomaly ? '❌ ' + x.anomaly : '✅ safe'}${errs.length ? ' · aborts: <code>' + errs.join(', ') + '</code>' : ''}` }));
    });
    mtx.innerHTML = '<b>Which models allow this history?</b> ' + '<ul style="margin:4px 0;padding-left:18px">' + P.matrix.map(([m, a]) => `<li>${a ? '✓ <b>allows</b>' : '✗ <b>forbids</b>'}: ${m}</li>`).join('') + '</ul>' + (S.p === 'lost' ? '<br><span class="muted">Postgres READ UNCOMMITTED behaves as READ COMMITTED.</span>' : S.p === 'skew' && S.fix ? '<br><span class="muted">Under REPEATABLE READ, locking an unchanged parent row does not refresh the snapshot, so B still counts 2. Lock-the-parent works at READ COMMITTED; at RR, update the parent row instead.</span>' : S.p === 'stale' ? '<br><span class="muted">Isolation level is irrelevant here: the fix is routing, not a stronger level.</span>' : '');
    stepB.disabled = fin;
  }
  paint();
  ctx.onResize((nw) => { narrow = nw; paint(); });
});
