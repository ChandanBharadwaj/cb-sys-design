/* Iceberg-style table: a catalog pointer, immutable snapshots (each a set of live files) and data/delete files in
   three hourly partitions. Two writers prepare commits from a base snapshot and CAS the pointer. On a failed CAS the
   writer validates every snapshot committed since its base: appends always rebase; a compaction aborts if a concurrent
   snapshot removed one of its inputs or added a (position) delete pointing into one. Time travel, rollback, expire + GC. */
SD.widget('data-lake', function (root, ctx) {
  const { el, svg } = ctx;
  const PARTS = ['hour 10', 'hour 11', 'hour 12'], SMALL = 64, KEEP = 3;
  const GEO = {
    narrow: { W: 360, F: 14, FS: 13, TS: 22, LW: 76, N: 6, RH: 40, R: 17, Y0: 190 },
    wide: { W: 560, F: 13, FS: 12, TS: 20, LW: 80, N: 9, RH: 38, R: 16, Y0: 184 }
  };
  let G = ctx.narrow ? GEO.narrow : GEO.wide;
  let files, storage, snaps, cur, ver, view, ingest, compact, stat, nextId, nextSnap, tAuto, lastPaint = 0;
  let auto = !ctx.reduced, merge = false;
  const rand = (n) => Math.floor(Math.random() * n);

  // ---------- model ----------
  function mk(part, mb, kind, target, del) {
    const f = { id: nextId++, part, mb, kind, target, del: del || 0, rows: kind === 'data' ? Math.round(mb * 100) : 0 };
    files[f.id] = f; storage.add(f.id); return f.id;
  }
  function reset() {
    files = {}; storage = new Set(); snaps = {}; nextId = 1; ver = 1; view = null; tAuto = 0;
    stat = { commits: 0, retries: 0, aborts: 0 };
    const init = [mk(0, 310, 'data')];
    [9, 14, 11].forEach((m) => init.push(mk(0, m, 'data')));
    [12, 8, 16, 10, 13].forEach((m) => init.push(mk(1, m, 'data')));
    [15, 9].forEach((m) => init.push(mk(2, m, 'data')));
    snaps[1] = { id: 1, parent: null, files: new Set(init), op: 'append' }; cur = 1; nextSnap = 2;
    ingest = { busy: false }; compact = { busy: false };
  }
  function since(head, base) {             // snapshots committed after base, newest first; null if base is not an ancestor
    const out = []; let s = head;
    while (s !== base) { if (s == null || !snaps[s]) return null; out.push(snaps[s]); s = snaps[s].parent; }
    return out;
  }
  const removedIn = (s) => { const p = snaps[s.parent]; return p ? [...p.files].filter((id) => !s.files.has(id)) : []; };
  const addedDels = (s) => { const p = snaps[s.parent]; return [...s.files].filter((id) => files[id].kind === 'del' && !(p && p.files.has(id))); };
  function commitSnap(set, op) { const s = { id: nextSnap++, parent: cur, files: set, op }; snaps[s.id] = s; cur = s.id; ver++; stat.commits++; return s; }

  function startIngest() {
    if (ingest.busy) { say('The ingest writer is still preparing its last commit.'); return; }
    const r = Math.random(), part = r < 0.6 ? 2 : r < 0.9 ? 1 : 0;          // some late data lands in older hours
    const add = [mk(part, 6 + rand(15), 'data')];                            // uploaded now, invisible until the CAS
    let target = null;
    if (merge) {
      const data = [...snaps[cur].files].filter((id) => files[id].kind === 'data');
      target = data[rand(data.length)];
      add.push(mk(files[target].part, 1, 'del', target, 5 + rand(16)));
    }
    ingest = { busy: true, base: cur, t: 0, dur: 900, add, target };
  }
  function finishIngest() {
    const w = ingest; ingest = { busy: false };
    let msg = '';
    if (cur !== w.base) {
      stat.retries++;
      msg = `CAS expected S${w.base}, found S${cur} → refresh. `;
      if (w.target && !snaps[cur].files.has(w.target)) {                     // our delete names a file that is gone
        const old = w.add.pop();
        const out = [...snaps[cur].files].find((id) => (files[id].from || []).includes(w.target));
        if (out) { w.add.push(mk(files[out].part, 1, 'del', out, files[old].del)); msg += `File #${w.target} was compacted into #${out}, so the MERGE is re-planned against it. `; }
        else msg += `File #${w.target} is no longer in the table, so there is nothing to delete. `;
      } else msg += 'Nothing we touch changed: re-apply on the new head. ';
    }
    const set = new Set(snaps[cur].files); w.add.forEach((id) => set.add(id));
    const s = commitSnap(set, w.add.some((id) => files[id].kind === 'del') ? 'overwrite' : 'append');
    say(`${msg}✅ <b>S${s.id}</b> ${s.op}: +${w.add.map((id) => '#' + id + (files[id].kind === 'del' ? ' (delete → #' + files[id].target + ')' : '')).join(', ')}`);
  }
  function startCompact() {
    if (compact.busy) { say('Compaction is already running.'); return; }
    const base = snaps[cur];
    const small = (p) => [...base.files].filter((id) => files[id].kind === 'data' && files[id].part === p && files[id].mb < SMALL);
    let part = [0, 1].sort((a, b) => small(b).length - small(a).length)[0];   // closed hours first
    if (small(part).length < 2) part = 2;
    const inputs = small(part).slice(0, 8);
    if (inputs.length < 2) { say('Not enough small files to compact yet.'); return; }
    const dels = [...base.files].filter((id) => files[id].kind === 'del' && inputs.includes(files[id].target));
    const rows = inputs.reduce((a, id) => a + files[id].rows, 0) - dels.reduce((a, id) => a + files[id].del, 0);
    compact = { busy: true, base: cur, t: 0, dur: 5200, part, inputs, dels, rows, mb: inputs.reduce((a, id) => a + files[id].mb, 0) };
    say(`⚙ Compaction starts from <b>S${cur}</b>: rewrite ${inputs.length} small files of ${PARTS[part]}` + (dels.length ? ` and apply ${dels.length} delete file(s)` : '') + '.');
  }
  function finishCompact() {
    const w = compact; compact = { busy: false };
    const out = mk(w.part, w.mb, 'data'); files[out].rows = w.rows; files[out].from = w.inputs;   // output is uploaded either way
    const remove = new Set(w.inputs.concat(w.dels));
    const abort = (why) => { stat.aborts++; say(`❌ Compaction <b>aborts</b>: ${why} Output #${out} is now an orphan file.`); };
    if (cur !== w.base) {
      stat.retries++;
      const chain = since(cur, w.base);
      if (!chain) return abort(`S${w.base} is no longer an ancestor of S${cur} (rollback or expiry), so it cannot validate.`);
      for (const s of chain.slice().reverse()) {
        const gone = removedIn(s).filter((id) => remove.has(id));
        if (gone.length) return abort(`S${s.id} already removed #${gone.join(', #')}.`);
        const hit = addedDels(s).filter((id) => w.inputs.includes(files[id].target));
        if (hit.length) return abort(`S${s.id} deleted rows inside input #${files[hit[0]].target}. The new file still holds them, so committing would bring deleted rows back.`);
      }
      say(`CAS expected S${w.base}, found S${cur}. Checked ${chain.map((s) => 'S' + s.id + ' (' + s.op + ')').join(', ')}: none touched our inputs, so rebase.`);
    }
    const set = new Set([...snaps[cur].files].filter((id) => !remove.has(id))); set.add(out);
    const s = commitSnap(set, 'replace');
    say(`✅ <b>S${s.id}</b> replace: ${w.inputs.length} small files → #${out} (${w.mb} MB) in ${PARTS[w.part]}.`);
  }
  function rollback() {
    if (view == null || !since(cur, view)) return;
    cur = view; ver++; view = null;
    say(`↩ Rolled back: the pointer now says <b>S${cur}</b> (metadata v${ver}). Nothing was copied or deleted; later snapshots stay until expired.`);
  }
  function expire() {
    const keep = new Set(); let s = cur;
    while (s != null && snaps[s] && keep.size < KEEP) { keep.add(s); s = snaps[s].parent; }
    const dropped = Object.keys(snaps).map(Number).filter((id) => !keep.has(id));
    dropped.forEach((id) => delete snaps[id]);
    const live = new Set(); Object.values(snaps).forEach((sn) => sn.files.forEach((id) => live.add(id)));
    (ingest.add || []).forEach((id) => live.add(id));                        // in-flight uploads are newer than older_than
    let gc = 0; [...storage].forEach((id) => { if (!live.has(id)) { storage.delete(id); gc++; } });
    if (view != null && !snaps[view]) view = null;
    say(`🧹 Expired ${dropped.length} snapshot(s), kept the last ${keep.size}. Deleted ${gc} file(s) that no kept snapshot references. Time travel now reaches back to S${Math.min(...keep)}.`);
  }

  // ---------- controls ----------
  const autoBtn = el('button', { class: 'btn', onclick: () => { auto = !auto; paintBtns(); } });
  const mergeBtn = el('button', { class: 'btn', onclick: () => { merge = !merge; paintBtns(); say(merge ? 'MERGE deletes on: each ingest commit also writes a <b>position delete</b> into a random existing file.' : 'MERGE deletes off: the ingest writer only appends.'); } });
  const rbBtn = el('button', { class: 'btn', onclick: () => { rollback(); render(); } });
  const mainBtn = el('button', { class: 'btn', text: '● Back to main', onclick: () => { view = null; render(); } });
  root.append(
    el('div', { class: 'w-controls' }, autoBtn,
      el('button', { class: 'btn', text: '+ Ingest commit', onclick: () => { startIngest(); render(); } }),
      el('button', { class: 'btn primary', text: '⚙ Start compaction', onclick: () => { startCompact(); render(); } }), mergeBtn),
    el('div', { class: 'w-controls' },
      el('button', { class: 'btn', text: '🧹 Expire + GC', onclick: () => { expire(); render(); } }), rbBtn, mainBtn,
      el('button', { class: 'btn', text: '↺ Reset', onclick: () => { reset(); log.innerHTML = ''; say('Reset: snapshot S1 with 10 data files.'); render(); } })));
  function paintBtns() {
    autoBtn.textContent = auto ? '⏸ Auto-ingest on' : '▶ Auto-ingest off';
    mergeBtn.textContent = 'MERGE deletes: ' + (merge ? 'on' : 'off');
    mergeBtn.className = 'btn' + (merge ? ' primary' : '');
    const canRb = view != null && view !== cur && since(cur, view);
    rbBtn.textContent = '↩ Roll back to S' + (view != null ? view : '…'); rbBtn.disabled = !canRb;
    mainBtn.disabled = view == null;
  }
  const S_ = svg('svg', { role: 'img', 'aria-label': 'Table snapshots and files', style: 'max-width:680px;margin:0 auto;display:block' });
  const legend = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b style="color:var(--accent)">■</b> small data file · <b style="color:var(--ok)">■</b> large file (≥ 64 MB) · <b style="color:var(--err)">▮</b> delete file · dashed = uploaded but not committed · orange outline = being compacted. Tap a snapshot circle to time travel.' });
  const stats = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(el('div', { class: 'w-stage' }, S_), legend, stats, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); }
  const T = (x, y, text, o = {}) => svg('text', { x, y, 'text-anchor': o.a || 'start', fill: o.c || 'var(--text)', style: `font:${o.w || 600} ${o.s || G.F}px var(${o.m ? '--mono' : '--sans'})`, text });

  // ---------- drawing ----------
  function render() {
    const { W, F, FS, TS, LW, N, RH, R, Y0 } = G, H = Y0 + 3 * RH + 2;
    S_.setAttribute('viewBox', `0 0 ${W} ${H}`); S_.innerHTML = '';
    const vid = view != null ? view : cur, vs = snaps[vid];
    S_.append(svg('rect', { x: 2, y: 4, width: W - 4, height: 34, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--accent)', 'stroke-width': 1.5 }),
      T(12, 26, `pointer: v${ver}.metadata.json → S${cur}`, { m: 1, s: F }));
    [['Ingest', ingest, 'var(--accent)'], ['Compact', compact, 'var(--warn)']].forEach(([name, w, c], k) => {
      const y = 50 + k * 30, bw = W - LW - 84;
      S_.append(T(2, y + 13, name, { s: F }), svg('rect', { x: LW, y: y + 1, width: bw, height: 14, rx: 7, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      if (w.busy) S_.append(svg('rect', { x: LW, y: y + 1, width: Math.max(4, bw * Math.min(1, w.t / w.dur)), height: 14, rx: 7, fill: c }));
      S_.append(T(W - 2, y + 13, w.busy ? 'base S' + w.base : 'idle', { a: 'end', s: FS, c: w.busy ? 'var(--text)' : 'var(--text-3)', m: 1 }));
    });
    const ids = Object.keys(snaps).map(Number).sort((a, b) => a - b).slice(-N), sp = (W - 4) / N, cy = 132;
    const anc = new Set(); let a = cur; while (a != null && snaps[a]) { anc.add(a); a = snaps[a].parent; }
    ids.forEach((id, k) => {
      const cx = 2 + sp * (k + 0.5), on = id === vid;
      if (k) S_.append(svg('line', { x1: cx - sp + R, y1: cy, x2: cx - R, y2: cy, stroke: 'var(--border)', 'stroke-width': 2 }));
      const g = svg('g', { style: `cursor:pointer;opacity:${anc.has(id) ? 1 : 0.4}` },
        svg('circle', { cx, cy, r: R, fill: on ? 'var(--accent)' : 'var(--surface-2)', stroke: id === cur ? 'var(--ok)' : 'var(--border)', 'stroke-width': id === cur ? 3 : 1.5 }),
        T(cx, cy + FS * 0.36, 'S' + id, { a: 'middle', s: FS, c: on ? '#fff' : 'var(--text)' }));
      g.addEventListener('click', () => { view = id === cur ? null : id; render(); });
      S_.append(g);
      if (id === cur || on) S_.append(T(cx, cy + R + 16, id === cur ? 'main' : 'view', { a: 'middle', s: FS, c: id === cur ? 'var(--ok)' : 'var(--accent)' }));
    });
    PARTS.forEach((pl, p) => {
      const y = Y0 + p * RH;
      S_.append(T(2, y + TS * 0.72, pl, { s: F }));
      const list = [...vs.files].filter((id) => files[id].part === p).sort((x, y2) => (files[x].kind === 'del') - (files[y2].kind === 'del') || x - y2);
      const pending = view == null ? (ingest.busy ? ingest.add.filter((id) => files[id].part === p) : []).concat(compact.busy && compact.part === p ? ['out'] : []) : [];
      let x = LW, shown = 0; const all = list.concat(pending);
      for (const id of all) {
        const f = id === 'out' ? { kind: 'data', mb: compact.mb } : files[id], big = f.kind === 'data' && f.mb >= SMALL;
        const w = f.kind === 'del' ? TS * 0.55 : big ? TS * 2 + 3 : TS;
        if (x + w > W - 30) break;
        const isPend = !list.includes(id), inp = compact.busy && view == null && compact.inputs.concat(compact.dels).includes(id);
        S_.append(svg('rect', { x, y, width: w, height: TS, rx: 4,
          fill: isPend ? 'none' : f.kind === 'del' ? 'color-mix(in srgb, var(--err) 55%, var(--surface))' : big ? 'color-mix(in srgb, var(--ok) 45%, var(--surface))' : 'color-mix(in srgb, var(--accent) 35%, var(--surface))',
          stroke: inp ? 'var(--warn)' : isPend ? 'var(--text-3)' : 'var(--border)', 'stroke-width': inp ? 2.5 : 1.2, 'stroke-dasharray': isPend ? '4 3' : '' }));
        x += w + 4; shown++;
      }
      if (shown < all.length) S_.append(T(W - 2, y + TS * 0.72, '+' + (all.length - shown), { a: 'end', s: FS, c: 'var(--text-3)', m: 1 }));
    });
    // stats for the snapshot being viewed
    const fl = [...vs.files].map((id) => files[id]), data = fl.filter((f) => f.kind === 'data'), dels = fl.filter((f) => f.kind === 'del');
    const rows = data.reduce((s2, f) => s2 + f.rows, 0) - dels.filter((d) => vs.files.has(d.target)).reduce((s2, d) => s2 + d.del, 0);
    const refd = new Set(); Object.values(snaps).forEach((sn) => sn.files.forEach((id) => refd.add(id)));
    stats.innerHTML = '';
    Object.entries({ viewing: 'S' + vid + (view != null ? ' (time travel)' : ' (main)'), 'data files': data.length, 'small files': data.filter((f) => f.mb < SMALL).length, 'delete files': dels.length, rows: rows.toLocaleString('en-US'),
      'objects in S3': storage.size, orphans: [...storage].filter((id) => !refd.has(id) && !(ingest.add || []).includes(id)).length, commits: stat.commits, 'CAS retries': stat.retries, aborts: stat.aborts })
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    paintBtns();
  }

  // ---------- run ----------
  ctx.loop((dt) => {
    let changed = false;
    if (auto) { tAuto += dt; if (tAuto >= 2200 && !ingest.busy) { tAuto = 0; startIngest(); changed = true; } }
    if (ingest.busy) { ingest.t += dt; if (ingest.t >= ingest.dur) { finishIngest(); changed = true; } }
    if (compact.busy) { compact.t += dt; if (compact.t >= compact.dur) { finishCompact(); changed = true; } }
    lastPaint += dt;
    if (changed || ((ingest.busy || compact.busy) && lastPaint > 90)) { lastPaint = 0; render(); }
  });
  ctx.onResize((n) => { G = n ? GEO.narrow : GEO.wide; render(); });
  reset();
  say('Try it: press <b>⚙ Start compaction</b> with MERGE deletes off (appends rebase and it commits), then turn MERGE deletes on and compact again.');
  render();
});
