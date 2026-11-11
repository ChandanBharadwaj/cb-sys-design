/* CDC pipeline: table rows -> WAL (slot) -> connector -> Kafka partition -> cache + search sinks.
   Real mechanics: LSN-ordered WAL, slot confirmed position, per-sink committed offsets, replay on crash,
   idempotent (version-guarded upsert) vs non-idempotent (append / increment) apply. */
SD.widget('cdc-pipelines', function (root, ctx) {
  const { el, svg } = ctx;
  const KEYS = [1, 2, 3, 4, 5];
  const WAL_BYTES = 8192; // illustrative bytes of WAL per change (whole-cluster WAL, not just this table)
  let gen = 0, loopH = null;

  function build(narrow) {
    const my = ++gen;
    if (loopH) loopH.stop();
    root.innerHTML = '';
    const st = {
      rows: Object.fromEntries(KEYS.map((k) => [k, 1])), wal: [], lsn: 0, slot: 0,
      kafka: [], conn: true, idem: true, rate: 1, acc: 0,
      sinks: [mkSink('Cache'), mkSink('Search')]
    };
    function mkSink(name) { return { name, paused: false, pos: 0, committed: 0, store: {}, seen: new Set(), applied: 0, dups: 0, skipped: 0 }; }
    // initial snapshot: op=r events for existing rows
    KEYS.forEach((k) => { st.kafka.push({ key: k, ver: 1, op: 'r' }); });

    const W = narrow ? 360 : 640, F = 14, F2 = 13;
    const NW = narrow ? 6 : 11, NK = narrow ? 6 : 11;
    const H = narrow ? 470 : 400;

    // controls
    const bConn = el('button', { class: 'btn', text: '⏸ Stop connector' });
    const bP = st.sinks.map((s, i) => el('button', { class: 'btn', text: `⏸ Pause ${s.name.toLowerCase()}` }));
    const bCrash = el('button', { class: 'btn', text: '💥 Crash search sink' });
    const bIdem = el('button', { class: 'btn primary', text: 'Idempotent: on' });
    const rate = el('input', { type: 'range', min: 1, max: 4, value: 1, 'aria-label': 'Writes per tick' });
    rate.addEventListener('input', () => { st.rate = +rate.value; });
    bConn.onclick = () => { st.conn = !st.conn; bConn.textContent = st.conn ? '⏸ Stop connector' : '▶ Start connector';
      say(st.conn ? 'Connector resumed from the slot\'s confirmed LSN. Nothing was lost; it drains the retained WAL.' : '⏸ Connector stopped. The <b>slot</b> keeps every new WAL record: watch retained WAL grow on the database.'); };
    st.sinks.forEach((s, i) => { bP[i].onclick = () => { s.paused = !s.paused; bP[i].textContent = (s.paused ? '▶ Resume ' : '⏸ Pause ') + s.name.toLowerCase();
      say(s.paused ? `${s.name} sink paused. Lag builds in <b>Kafka</b> (retention covers it); the slot keeps advancing because the connector still confirms.` : `${s.name} sink resumed from offset ${s.pos}; catching up.`); }; });
    bCrash.onclick = () => { const s = st.sinks[1]; const n = s.pos - s.committed; s.pos = s.committed;
      say(`💥 Search sink crashed with ${n} uncommitted message(s). It restarts at committed offset ${s.committed} and <b>replays</b> them.`); };
    bIdem.onclick = () => { st.idem = !st.idem; bIdem.textContent = 'Idempotent: ' + (st.idem ? 'on' : 'off'); bIdem.className = st.idem ? 'btn primary' : 'btn';
      say(st.idem ? 'Sinks now <b>upsert by key and version</b>: replays are no-ops.' : 'Sinks now <b>append</b> (search adds a doc per event, cache increments an edit counter). Crash the search sink to see duplicates.'); };
    root.append(el('div', { class: 'w-controls' }, bConn, bP[0], bP[1], bCrash, bIdem, el('label', null, 'Write rate ', rate)));

    const stage = el('div', { class: 'w-stage' });
    const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'CDC pipeline simulation' });
    stage.append(S_); root.append(stage);
    stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Cells read <b>id·version</b>. WAL: <b style="color:var(--warn)">■</b> retained by the slot (not yet confirmed). Kafka: ▲C / ▲S mark where each sink has read up to; red cells in sinks are wrong (duplicate or mis-counted).' }));
    const stats = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 25) log.lastChild.remove(); }

    const T = (x, y, txt, o = {}) => svg('text', { x, y, 'text-anchor': o.a || 'start', fill: o.fill || 'var(--text)', style: `font:${o.w || 600} ${o.f || F}px var(${o.mono ? '--mono' : '--sans'})`, text: txt });
    const R = (x, y, w, h, fill, stroke) => svg('rect', { x, y, width: w, height: h, rx: 5, fill, stroke: stroke || 'var(--border)' });
    const soft = (c, p) => `color-mix(in srgb, ${c} ${p}%, var(--surface-2))`;

    function strip(y, label, items, cw, mark) {
      S_.append(T(6, y - 8, label, { f: F2, fill: 'var(--text-3)' }));
      items.forEach((it, i) => {
        const x = 6 + i * (cw + 4);
        S_.append(R(x, y, cw, 30, it.fill, it.stroke), T(x + cw / 2, y + 20, it.t, { a: 'middle', mono: true, f: F2 }));
        if (mark) mark(it, x);
      });
    }

    function draw() {
      S_.innerHTML = '';
      // 1) table
      const cw = (W - 12 - 4 * 4) / 5;
      S_.append(T(6, 18, 'Postgres: orders table', { f: F2, fill: 'var(--text-3)' }));
      KEYS.forEach((k, i) => { const x = 6 + i * (cw + 4); S_.append(R(x, 26, cw, 32, soft('var(--accent)', 18)), T(x + cw / 2, 47, `${k}·v${st.rows[k]}`, { a: 'middle', mono: true, w: 700 })); });
      // 2) WAL strip (last NW records), retained = lsn > slot
      const held = st.lsn - st.slot;
      const wcw = (W - 12 - (NW - 1) * 4) / NW;
      const wal = st.wal.slice(-NW).map((e) => ({ t: `${e.key}·${e.ver}`, fill: e.lsn > st.slot ? soft('var(--warn)', 45) : 'var(--surface-2)', stroke: e.lsn > st.slot ? 'var(--warn)' : 'var(--border)' }));
      strip(96, `WAL via slot · retained ${held} rec ≈ ${ctx.fmt.bytes(held * WAL_BYTES)}`, wal, wcw);
      // 3) connector
      const cy = narrow ? 150 : 146;
      S_.append(R(6, cy, W - 12, 30, st.conn ? soft('var(--ok)', 25) : soft('var(--err)', 30), st.conn ? 'var(--ok)' : 'var(--err)'),
        T(W / 2, cy + 20, st.conn ? 'Debezium: reading slot → Kafka' : 'Debezium stopped: slot holds WAL', { a: 'middle', f: F2, w: 700 }));
      // 4) Kafka partition (last NK offsets)
      const ky = cy + 70, kcw = (W - 12 - (NK - 1) * 4) / NK;
      const start = Math.max(0, st.kafka.length - NK);
      const items = st.kafka.slice(start).map((e, i) => ({ off: start + i, t: `${e.key}·${e.ver}`, fill: e.op === 'r' ? soft('var(--accent)', 10) : 'var(--surface-2)' }));
      strip(ky, `Kafka partition 0 · head offset ${st.kafka.length}`, items, kcw, (it, x) => {
        st.sinks.forEach((s, j) => { if (s.pos === it.off) S_.append(T(x + (j ? kcw - 4 : 4), ky + 48, j ? '▲S' : '▲C', { a: j ? 'end' : 'start', f: F2, w: 800, fill: j ? 'var(--accent)' : 'var(--ok)' })); });
      });
      st.sinks.forEach((s, j) => { if (s.pos < start) S_.append(T(j ? W - 6 : 6, ky + 48, `${j ? 'S' : 'C'} ◀ ${start - s.pos} behind`, { a: j ? 'end' : 'start', f: F2, w: 700, fill: 'var(--warn)' })); });
      // 5) sinks: stacked on phones, side by side on desktop
      const sy = ky + 66, pw = narrow ? W - 12 : (W - 16) / 2, ph = narrow ? 92 : 128;
      st.sinks.forEach((s, j) => {
        const x = narrow ? 6 : 6 + j * (pw + 4), y = narrow ? sy + j * (ph + 6) : sy;
        const lag = st.kafka.length - s.pos;
        S_.append(R(x, y, pw, ph, 'var(--surface)', s.paused ? 'var(--warn)' : 'var(--border)'),
          T(x + 8, y + 18, `${s.name}${s.paused ? ' (paused)' : ''} · lag ${lag}`, { f: F2, w: 700, fill: s.paused ? 'var(--warn)' : 'var(--text)' }));
        KEYS.forEach((k, i) => {
          const v = s.store[k];
          let txt = '—', bad = false;
          if (v) {
            if (j === 0) { txt = `${k}: v${v.ver} ·${v.edits}e`; bad = v.edits !== v.ver; }
            else { txt = `${k}: ${v.docs} doc`; bad = v.docs > 1; }
          }
          const col = narrow ? i % 3 : i % 2, row = narrow ? Math.floor(i / 3) : Math.floor(i / 2);
          const cx = x + 8 + col * (narrow ? (pw - 16) / 3 : (pw - 16) / 2), yy = y + 42 + row * (narrow ? 26 : 26);
          S_.append(T(cx, yy, txt, { mono: true, f: F2, fill: bad ? 'var(--err)' : 'var(--text)' }));
        });
      });
      // stats
      const s0 = st.sinks[0], s1 = st.sinks[1];
      stats.innerHTML = '';
      [['WAL held by slot', ctx.fmt.bytes(held * WAL_BYTES)], ['cache lag', st.kafka.length - s0.pos], ['search lag', st.kafka.length - s1.pos],
        ['duplicates applied', s0.dups + s1.dups], ['stale/dup skipped', s0.skipped + s1.skipped]]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }

    function apply(s, j, e) {
      const id = e.key + ':' + e.ver;
      const dup = s.seen.has(id); s.seen.add(id);
      const cur = s.store[e.key];
      if (st.idem) {
        if (cur && cur.ver >= e.ver) { s.skipped++; return; }
        s.store[e.key] = j === 0 ? { ver: e.ver, edits: e.ver } : { ver: e.ver, docs: 1 };
      } else {
        if (dup) s.dups++;
        if (j === 0) s.store[e.key] = { ver: Math.max(e.ver, cur ? cur.ver : 0), edits: (cur ? cur.edits : 0) + 1 };
        else s.store[e.key] = { ver: e.ver, docs: (cur ? cur.docs : 0) + 1 };
        if (j === 0 && !cur && e.ver > 1) s.store[e.key].edits = e.ver; // first sight after snapshot
      }
      s.applied++;
    }

    function step() {
      for (let n = 0; n < st.rate; n++) { // app writes: UPDATE orders SET ... version = version + 1
        const k = KEYS[Math.floor(Math.random() * KEYS.length)];
        st.rows[k]++; st.wal.push({ lsn: ++st.lsn, key: k, ver: st.rows[k] });
        if (st.wal.length > 400) st.wal.shift();
      }
      if (st.conn) { // connector reads up to 6 records from the slot, produces, then confirms the LSN
        const batch = st.wal.filter((e) => e.lsn > st.slot).slice(0, 6);
        batch.forEach((e) => { st.kafka.push({ key: e.key, ver: e.ver, op: 'u' }); st.slot = e.lsn; });
      }
      st.sinks.forEach((s, j) => {
        if (s.paused) return;
        for (let n = 0; n < 4 && s.pos < st.kafka.length; n++) { apply(s, j, st.kafka[s.pos]); s.pos++; }
        if (s.pos - s.committed >= 6) s.committed = s.pos; // offsets committed every 6 messages
      });
      if (st.lsn - st.slot === 12) say('⚠ Retained WAL rising. In production this is the whole cluster\'s WAL, and the cap is <code>max_slot_wal_keep_size</code>.');
      draw();
    }

    let acc = 0, visible = true;
    ctx.onVisible((v) => { visible = v; });
    loopH = ctx.loop((dt) => { acc += dt; if (acc >= 900) { acc = 0; if (my === gen && visible) step(); } });
    draw();
    say('Rows change every tick. Try: ⏸ stop the connector (slot WAL grows), then pause the cache (Kafka lag grows instead). Turn idempotent off and 💥 crash the search sink.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
