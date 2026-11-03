/* A real sharded table with a real secondary index. Rows live on fnv(order_id) % N.
   Global index entries live on fnv(value) % N (or fnv(value#suffix) % N), carry the LSN that wrote them,
   and deletes leave tombstones. Async mode replays a change queue with version guards.
   Query latency = sum over rounds of the max of k per-partition samples; p99 from 2,000 simulated queries. */
SD.widget('global-secondary-index', function (root, ctx) {
  const { el, svg } = ctx;
  const ST = ['PENDING', 'PAID', 'SHIPPED', 'DONE'], AB = { PENDING: 'PEND', PAID: 'PAID', SHIPPED: 'SHIP', DONE: 'DONE' };
  const SALT = 4, MODES = { none: 'None', local: 'Local', gsync: 'Global sync', gasync: 'Global async' };
  const fnv = (x) => { let h = 0x811c9dc5; const s = String(x); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const sample = () => (Math.random() < 0.002 ? 40 * Math.exp(0.3 * gauss()) : 2 * Math.exp(0.5 * gauss())); // ms, illustrative
  const runOnce = (rounds) => rounds.reduce((t, r) => { let m = 0; for (let j = 0; j < r.k; j++) m = Math.max(m, sample() * (r.scale || 1)); return t + m; }, 0);
  const p99 = (rounds) => { const xs = []; for (let i = 0; i < 2000; i++) xs.push(runOnce(rounds)); xs.sort((a, b) => a - b); return xs[1980]; };
  const ms = (x) => (x < 10 ? x.toFixed(1) : Math.round(x)) + ' ms';
  let N = 8, mode = 'gasync', attr = 'status', salt = false, narrow = ctx.narrow;
  let rows, lsn, nextId, gi, queue, load, lastOld = null, lit = new Map(), acc = 0;

  const shardOf = (id) => fnv('o' + id) % N;
  const keyOf = (a, v, id) => (a === 'status' && salt ? v + '#' + (fnv('s' + id) % SALT) : String(v));
  const partOf = (a, v, id) => fnv(a + ':' + keyOf(a, v, id)) % N;
  function put(a, v, id, l, del) {              // versioned upsert of one index entry (tombstone if del)
    const p = partOf(a, v, id), m = gi[a][p], k = v + '|' + id, e = m.get(k);
    load[a][p]++;
    if (!e || e.lsn < l) m.set(k, { v, id, lsn: l, del });
    return p;
  }
  function applyChange(c) { const ps = []; if (c.old != null) ps.push(put(c.a, c.old, c.id, c.lsn, true)); if (c.nw != null) ps.push(put(c.a, c.nw, c.id, c.lsn, false)); return ps; }
  function rebuild() {                          // backfill the global index from the base rows
    gi = { customer: [], status: [] }; load = { base: Array(N).fill(0), customer: Array(N).fill(0), status: Array(N).fill(0) };
    for (let p = 0; p < N; p++) { gi.customer.push(new Map()); gi.status.push(new Map()); }
    rows.forEach((r) => { put('status', r.status, r.id, r.lsn, false); put('customer', r.cust, r.id, r.lsn, false); });
    load.customer.fill(0); load.status.fill(0);
    queue = [];
  }
  function reset() {
    rows = new Map(); lsn = 0;
    for (let id = 1; id <= 40; id++) { const u = fnv('st' + id) % 100; rows.set(id, { id, cust: 1 + (fnv('c' + id) % 10), status: u < 30 ? 'PENDING' : u < 60 ? 'PAID' : u < 80 ? 'SHIPPED' : 'DONE', lsn: ++lsn }); }
    nextId = 41; lastOld = null; rebuild();
  }

  // ---------- controls ----------
  const mk = (t, on) => { const b = el('button', { class: 'btn', text: t }); b.addEventListener('click', on); return b; };
  const modeBtns = Object.keys(MODES).map((m) => mk(MODES[m], () => { if (m !== mode) { mode = m; rebuild(); say(`Index → <b>${MODES[m]}</b>. ${m === 'none' ? 'Queries will scan every shard.' : m === 'local' ? 'Each shard indexes its own rows.' : 'Global index backfilled from the rows.'}`); paint(); } }));
  const attrBtns = ['customer', 'status'].map((a) => mk(a === 'customer' ? 'customer_id' : 'status', () => { attr = a; paint(); }));
  const nBtns = [4, 8].map((n) => mk(n + ' shards', () => { if (n !== N) { N = n; reset(); say(`Resharded to ${N}. Rows and index entries moved.`); paint(); } }));
  const saltBtn = mk('Suffix: off', () => { salt = !salt; rebuild(); say(salt ? `Status index keyed by <code>status#(hash(id) % ${SALT})</code>: writes spread, reads ask ${SALT} keys. Rebuilt by backfill.` : 'Plain status key again (rebuilt).'); paint(); });
  const qBtn = el('button', { class: 'btn primary', text: '▶ Query' }); qBtn.addEventListener('click', query);
  root.append(
    el('div', { class: 'w-controls' }, ...modeBtns),
    el('div', { class: 'w-controls' }, ...attrBtns, ...nBtns, saltBtn),
    el('div', { class: 'w-controls' }, qBtn, mk('✎ Update 1 order', update), mk('⚡ Add 24 orders', burst), mk('↺ Reset', () => { reset(); say('Reset: 40 orders.'); paint(); }))
  );
  const S_ = svg('svg', { role: 'img', 'aria-label': 'Shards and index partitions' });
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function setStats(o) { stats.innerHTML = ''; Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  const light = (keys, tone) => { const until = performance.now() + 1600; keys.forEach((k) => lit.set(k, { until, tone })); };

  // ---------- operations ----------
  function write(id, changes, what) {
    const s = shardOf(id); load.base[s]++;
    const touched = new Set(['b' + s]);
    let lat;
    if (mode === 'gsync') { changes.forEach((c) => applyChange(c).forEach((p) => touched.add(c.a[0] + p))); lat = runOnce([{ k: touched.size }, { k: touched.size }]); }
    else if (mode === 'gasync') { changes.forEach((c) => queue.push(c)); lat = runOnce([{ k: 1 }]); }
    else lat = runOnce([{ k: 1 }]);
    light([...touched], 'acc');
    return { lat, parts: touched.size, what };
  }
  function update() {
    const cand = [...rows.values()].filter((r) => r.status !== 'DONE');
    if (!cand.length) { say('Every order is DONE. Add orders or reset.'); return; }
    const r = cand[Math.floor(Math.random() * cand.length)], old = r.status;
    r.status = ST[ST.indexOf(old) + 1]; r.lsn = ++lsn; lastOld = old;
    const w = write(r.id, [{ a: 'status', id: r.id, old, nw: r.status, lsn: r.lsn }]);
    say(`Order #${r.id}: ${old} → ${r.status} (LSN ${r.lsn}) on shard S${shardOf(r.id)}. ` + (mode === 'gsync' ? `<b>2PC over ${w.parts} partitions</b>: row + remove old entry + add new.` : mode === 'gasync' ? `Acked after <b>1 partition</b>; 2 index ops queued. Query status = ${old} now to catch the stale entry.` : 'One partition (the local index is on the same shard).'));
    setStats({ op: 'update', 'partitions written': mode === 'gasync' ? '1 (+2 later)' : w.parts, 'write latency': ms(w.lat), 'write p99': ms(p99(mode === 'gsync' ? [{ k: w.parts }, { k: w.parts }] : [{ k: 1 }])), 'index lag': queue.length + ' ops' });
    paint();
  }
  function burst() {
    const tgt = Array(N).fill(0);                 // where this burst's status-index entries land
    for (let i = 0; i < 24; i++) {
      const id = nextId++, cust = 1 + Math.floor(Math.random() * 10);
      rows.set(id, { id, cust, status: 'PENDING', lsn: ++lsn });
      tgt[partOf('status', 'PENDING', id)]++;
      write(id, [{ a: 'status', id, old: null, nw: 'PENDING', lsn }, { a: 'customer', id, old: null, nw: cust, lsn }]);
    }
    const top = Math.max(...tgt), used = tgt.filter((x) => x).length;
    say(`24 new PENDING orders. Base writes spread over ${N} shards by order_id. ` + (mode.startsWith('g') ? `Status index: <b>${top}/24</b> entries go to one partition, ${used} partition${used > 1 ? 's' : ''} used${salt ? ' (suffix)' : ' (one value → one partition)'}` + (mode === 'gasync' ? '; the applier delivers them over the next seconds.' : '.') : 'Local indexes follow the rows, so there is no index hot spot.'));
    setStats({ op: '24 inserts', rows: rows.size, 'busiest status partition': mode.startsWith('g') ? Math.round(100 * top / 24) + '%' : '—', 'fair share': Math.round(100 / N) + '%', 'index lag': queue.length + ' ops' });
    paint();
  }
  function query() {
    let value;
    if (attr === 'status') value = queue.some((c) => c.a === 'status') && lastOld ? lastOld : 'PAID';
    else { const all = [...rows.values()]; value = all[Math.floor(Math.random() * all.length)].cust; }
    const truth = [...rows.values()].filter((r) => (attr === 'status' ? r.status : r.cust) === value).map((r) => r.id);
    const label = attr === 'status' ? 'status = ' + value : 'customer_id = ' + value;
    if (mode === 'none' || mode === 'local') {
      const rounds = [{ k: N, scale: mode === 'none' ? 15 : 1 }];
      light([...Array(N).keys()].map((s) => 'b' + s), 'acc');
      say(`<b>${label}</b>: asked all ${N} shards (${mode === 'none' ? 'full scans' : 'local indexes'}), ${truth.length} rows.`);
      setStats({ query: label, 'partitions read': N, 'this query': ms(runOnce(rounds)), 'p99 (2k sims)': ms(p99(rounds)), stale: 0 });
      paint(); return;
    }
    const keys = attr === 'status' && salt ? [...Array(SALT).keys()].map((k) => value + '#' + k) : [String(value)];
    const parts = [...new Set(keys.map((k) => fnv(attr + ':' + k) % N))];
    const hits = [];
    parts.forEach((p) => gi[attr][p].forEach((e) => { if (e.v === value && !e.del) hits.push(e.id); }));
    const fetch = [...new Set(hits.map(shardOf))];
    const stale = hits.filter((id) => !truth.includes(id)), missed = truth.filter((id) => !hits.includes(id));
    const rounds = [{ k: parts.length }, { k: Math.max(1, fetch.length) }];
    light(parts.map((p) => attr[0] + p), stale.length ? 'warn' : 'acc');
    setTimeout(() => { light(fetch.map((s) => 'b' + s), 'ok'); paint(); }, ctx.reduced ? 0 : 450);
    say(`<b>${label}</b>: ${parts.length} index partition${parts.length > 1 ? 's' : ''} → ${hits.length} keys → re-check on ${fetch.length} shard(s).` +
      (stale.length ? ` <b style="color:var(--warn)">Stale: #${stale.join(', #')}</b> failed the row re-check and ${stale.length > 1 ? 'were' : 'was'} dropped.` : '') +
      (missed.length ? ` <b style="color:var(--warn)">Not yet indexed: #${missed.join(', #')}</b> (lag).` : ''));
    setStats({ query: label, 'partitions read': parts.length + ' + ' + fetch.length, 'this query': ms(runOnce(rounds)), 'p99 (2k sims)': ms(p99(rounds)), 'stale dropped': stale.length, 'missed (lag)': missed.length });
    paint();
  }

  // ---------- drawing ----------
  function paint() {
    modeBtns.forEach((b, i) => b.classList.toggle('primary', Object.keys(MODES)[i] === mode));
    attrBtns.forEach((b, i) => b.classList.toggle('primary', ['customer', 'status'][i] === attr));
    nBtns.forEach((b, i) => b.classList.toggle('primary', [4, 8][i] === N));
    saltBtn.textContent = 'Suffix: ' + (salt ? 'on ×' + SALT : 'off'); saltBtn.classList.toggle('primary', salt);
    const W = narrow ? 360 : 600, cols = Math.min(N, narrow ? 4 : 8), pad = 8, gap = 8;
    const F = narrow ? 14 : 13, F2 = narrow ? 13 : 12, bh = narrow ? 58 : 52;
    const bw = (W - 2 * pad - (cols - 1) * gap) / cols, nRows = Math.ceil(N / cols);
    const now = performance.now(), global = mode === 'gsync' || mode === 'gasync';
    S_.innerHTML = '';
    const T = (x, y, t, o) => svg('text', Object.assign({ x, y, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:600 ${F2}px var(--sans)`, text: t }, o || {}));
    const gLines = svg('g'); S_.append(gLines);
    S_.append(svg('rect', { x: W / 2 - 60, y: 4, width: 120, height: 30, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--accent)' }), T(W / 2, 24, 'Router', { style: `font:700 ${F}px var(--sans)` }));
    function grid(y0, prefix, title, cell) {
      S_.append(T(pad, y0 - 8, title, { 'text-anchor': 'start', fill: 'var(--text-3)', style: `font:700 ${F2}px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:5px` }));
      const L = prefix === 'b' ? load.base : load[attr], max = Math.max(1, ...L), tot = L.reduce((a, b) => a + b, 0);
      for (let i = 0; i < N; i++) {
        const x = pad + (i % cols) * (bw + gap), y = y0 + Math.floor(i / cols) * (bh + gap), f = lit.get(prefix + i), on = f && f.until > now;
        const tone = on ? (f.tone === 'warn' ? 'var(--warn)' : f.tone === 'ok' ? 'var(--ok)' : 'var(--accent)') : 'var(--border)';
        if (on) gLines.append(svg('line', { x1: W / 2, y1: 34, x2: x + bw / 2, y2: y, stroke: tone, 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
        S_.append(svg('rect', { x, y, width: bw, height: bh, rx: 7, fill: on ? `color-mix(in srgb, ${tone} 18%, var(--surface))` : 'var(--surface-2)', stroke: tone, 'stroke-width': on ? 2.5 : 1 }));
        const [a, b] = cell(i);
        S_.append(T(x + bw / 2, y + (narrow ? 20 : 18), a, { style: `font:700 ${F}px var(--mono)` }), T(x + bw / 2, y + (narrow ? 38 : 34), b, { fill: 'var(--text-2)' }));
        const hotP = tot >= 8 && L[i] / tot > 2 / N;
        S_.append(svg('rect', { x: x + 6, y: y + bh - 11, width: bw - 12, height: 5, rx: 2, fill: 'var(--border)' }), svg('rect', { x: x + 6, y: y + bh - 11, width: (bw - 12) * L[i] / max, height: 5, rx: 2, fill: hotP ? 'var(--err)' : 'var(--accent)' }));
      }
      return y0 + nRows * (bh + gap) - gap;
    }
    let y = grid(62, 'b', `Shards · hash(order_id) % ${N}`, (i) => {
      const n = [...rows.values()].filter((r) => shardOf(r.id) === i).length;
      return ['S' + i, n + (mode === 'local' ? ' rows+idx' : ' rows')];
    });
    // middle band: how the index is maintained
    y += 26;
    const band = { none: 'No index: every query scans every shard', local: 'Local index: entry written in the row\'s shard', gsync: 'Sync: row + index entries in one 2PC', gasync: `Async applier: ${queue.length} op${queue.length === 1 ? '' : 's'} behind` }[mode];
    S_.append(T(W / 2, y, band, { style: `font:600 ${F2}px var(--sans)`, fill: mode === 'gasync' && queue.length ? 'var(--warn)' : 'var(--text-3)' }));
    if (mode === 'gasync') { for (let i = 0; i < Math.min(queue.length, 20); i++) S_.append(svg('rect', { x: W / 2 - 100 + i * 10, y: y + 8, width: 8, height: 8, rx: 2, fill: 'var(--warn)' })); y += 14; }
    if (global) {
      y = grid(y + 34, attr[0], `Index on ${attr} · hash(${attr === 'status' && salt ? 'status#k' : attr}) % ${N}`, (i) => {
        const live = [...gi[attr][i].values()].filter((e) => !e.del);
        if (attr === 'customer') return ['I' + i, live.length + ' keys'];
        const vals = ST.filter((v) => live.some((e) => e.v === v));
        return ['I' + i, vals.length ? vals.map((v) => AB[v]).join(' ').slice(0, narrow ? 9 : 14) : '—'];
      });
    }
    const H = y + 10;
    S_.setAttribute('viewBox', `0 0 ${W} ${H}`);
    S_.style.maxWidth = narrow ? '' : '760px';
  }

  // the async applier drains a small batch every 300 ms, each change guarded by its LSN
  ctx.loop((dt) => {
    acc += dt;
    let dirty = false;
    if (mode === 'gasync' && queue.length && acc > 300) {
      acc = 0;
      for (let n = Math.max(1, Math.ceil(queue.length / 8)); n > 0 && queue.length; n--) { const c = queue.shift(); light(applyChange(c).map((p) => c.a[0] + p), 'acc'); }
      dirty = true;
      if (!queue.length) say('Applier caught up: index matches the rows again.');
    }
    const now = performance.now();
    lit.forEach((v, k) => { if (v.until < now) { lit.delete(k); dirty = true; } });
    if (dirty) paint();
  });
  ctx.onResize((n) => { narrow = n; paint(); });
  reset();
  say('Try: <b>Global async</b> → <b>Update 1 order</b> → quickly <b>Query</b> by status. Then switch to <b>Local</b> and query again: every shard lights up.');
  setStats({ rows: 40, index: MODES[mode], 'query by': attr });
  paint();
});
