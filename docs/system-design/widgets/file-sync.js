/* Fixed-size blocks vs content-defined chunking (Gear rolling hash) after an insertion. */
SD.widget('file-sync', function (root, ctx) {
  const { el, svg } = ctx;
  // two layouts: desktop (420-wide viewBox) and phone (360-wide, bigger text, legend in HTML)
  const LAYOUT = {
    wide: { W: 420, H: 236, X0: 8, X1: 412, barH: 34, y1: 26, y2: 120, title: -8, msg: 52, fTitle: 12, fHash: 9.5, fMsg: 11.5, minHashW: 26,
      t1: 'Fixed-size blocks (512 B each, like 4 MB in prod)', t2: 'Content-defined chunks (Gear hash, avg ≈ 600 B)' },
    narrow: { W: 360, H: 214, X0: 6, X1: 354, barH: 40, y1: 30, y2: 136, title: -9, msg: 62, fTitle: 14.5, fHash: 13, fMsg: 14, minHashW: 40,
      t1: 'Fixed 512 B blocks', t2: 'Content-defined (Gear, avg ≈ 600 B)' }
  };
  let L = ctx.narrow ? LAYOUT.narrow : LAYOUT.wide;
  const FIX = 512, MIN = 128, MAX = 1536, MASK = 0xFF800000; // top 9 bits: P(cut) = 1/512 per byte after MIN, so average ≈ 128 + 512 ≈ 600 B
  const LEN0 = 6144;

  function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const tabRnd = mulberry32(7);
  const GEAR = Array.from({ length: 256 }, () => Math.floor(tabRnd() * 4294967296) >>> 0);
  let dataRnd = mulberry32(42);
  const randBytes = (n) => Array.from({ length: n }, () => Math.floor(dataRnd() * 256));

  // FNV-1a 32-bit as a stand-in for SHA-256 (same role: name a block by its content)
  function fnv(bytes) { let h = 0x811c9dc5; for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  function fixedChunks(d) { const out = []; for (let s = 0; s < d.length; s += FIX) out.push([s, Math.min(d.length, s + FIX)]); return out; }
  function cdcChunks(d) {
    const out = []; let s = 0, h = 0;
    for (let i = 0; i < d.length; i++) {
      h = ((h << 1) + GEAR[d[i]]) >>> 0;                  // Gear: old bytes shift out after 32 steps
      const len = i - s + 1;
      if ((len >= MIN && ((h & MASK) >>> 0) === 0) || len >= MAX) { out.push([s, i + 1]); s = i + 1; h = 0; }
    }
    if (s < d.length) out.push([s, d.length]);
    return out;
  }
  const withHash = (d, cs) => cs.map(([a, b]) => ({ a, b, h: fnv(d.slice(a, b)) }));

  let data, prev, cur, mark = null, edits = 0;
  function build() {
    cur = { fixed: withHash(data, fixedChunks(data)), cdc: withHash(data, cdcChunks(data)) };
  }
  function resetFile() { dataRnd = mulberry32(42); data = randBytes(LEN0); build(); prev = null; mark = null; edits = 0; }
  resetFile();

  let pos = 12, size = 40;
  const posOut = el('b', { text: pos + '%' }), sizeOut = el('b', { text: size + ' B' });
  const posIn = el('input', { type: 'range', min: 0, max: 99, value: pos, 'aria-label': 'Edit position' });
  const sizeIn = el('input', { type: 'range', min: 1, max: 300, value: size, 'aria-label': 'Bytes to insert or delete' });
  posIn.addEventListener('input', () => { pos = +posIn.value; posOut.textContent = pos + '%'; mark = Math.floor(data.length * pos / 100); draw(); });
  sizeIn.addEventListener('input', () => { size = +sizeIn.value; sizeOut.textContent = size + ' B'; });
  const insBtn = el('button', { class: 'btn primary', text: '＋ Insert bytes' });
  const delBtn = el('button', { class: 'btn', text: '－ Delete bytes' });
  const ovrBtn = el('button', { class: 'btn', text: '✎ Overwrite in place' });
  const rstBtn = el('button', { class: 'btn', text: 'Reset file' });
  root.append(el('div', { class: 'w-controls' }, insBtn, delBtn, ovrBtn, rstBtn,
    el('label', null, 'At ', posOut, posIn), el('label', null, 'Size ', sizeOut, sizeIn)));

  const S = svg('svg', { role: 'img', 'aria-label': 'File split into fixed blocks and content-defined chunks', style: 'max-width:680px;margin:0 auto' });
  const g = svg('g'); S.append(g);
  const legend = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' } });
  root.append(el('div', { class: 'w-stage' }, S, legend));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); };
  const T = (x, y, text, o) => svg('text', Object.assign({ x, y, text, fill: 'var(--text)', style: `font:600 ${L.fTitle}px var(--sans)` }, o || {}));

  function summary(kind) {
    const known = prev ? new Set(prev[kind].map((c) => c.h)) : null;
    const blocks = cur[kind].map((c) => ({ ...c, isNew: known ? !known.has(c.h) : false }));
    const nNew = blocks.filter((c) => c.isNew).length;
    const bytes = blocks.filter((c) => c.isNew).reduce((s, c) => s + c.b - c.a, 0);
    return { blocks, nNew, bytes };
  }
  function drawBar(kind, y, title) {
    const sm = summary(kind);
    const { X0, X1, barH } = L;
    const span = Math.max(data.length, LEN0 + 600), sx = (X1 - X0) / span;
    g.append(T(X0, y + L.title, title));
    sm.blocks.forEach((c) => {
      const x = X0 + c.a * sx, w = Math.max(1, (c.b - c.a) * sx - 1.5);
      const col = c.isNew ? 'var(--err)' : prev ? 'var(--ok)' : 'var(--accent)';
      g.append(svg('rect', { x, y, width: w, height: barH, rx: 3, fill: `color-mix(in srgb, ${col} ${c.isNew ? 55 : 22}%, var(--surface))`, stroke: col, 'stroke-width': 1 }));
      if (w >= L.minHashW) g.append(T(x + w / 2, y + barH / 2 + L.fHash * 0.36, c.h.slice(0, 4), { 'text-anchor': 'middle', style: `font:500 ${L.fHash}px var(--mono)`, fill: 'var(--text-2)' }));
    });
    if (mark != null) {
      const mx = X0 + mark * sx;
      g.append(svg('line', { x1: mx, x2: mx, y1: y - 3, y2: y + barH + 3, stroke: 'var(--warn)', 'stroke-width': 2 }));
    }
    const msg = prev ? `${sm.nNew} of ${sm.blocks.length} chunks new → upload ${SD.fmt.bytes(sm.bytes)}` : `${sm.blocks.length} chunks · ${SD.fmt.bytes(data.length)} file`;
    g.append(T(X0, y + L.msg, msg, { style: `font:600 ${L.fMsg}px var(--mono)`, fill: prev && sm.nNew ? 'var(--err)' : 'var(--text-2)' }));
    return sm;
  }
  function draw() {
    g.innerHTML = '';
    S.setAttribute('viewBox', `0 0 ${L.W} ${L.H}`);
    const f = drawBar('fixed', L.y1, L.t1);
    const c = drawBar('cdc', L.y2, L.t2);
    const key = prev ? 'green = hash already on server · red = must upload · line = edit' : 'blue = current chunks · line = edit position';
    if (L === LAYOUT.narrow) { legend.textContent = key + ' · 4-hex-digit labels are each chunk\'s hash (FNV stand-in for SHA-256)'; legend.style.display = ''; }
    else { legend.style.display = 'none'; g.append(T(L.X0, L.H - 8, key, { fill: 'var(--text-3)', style: 'font:500 10.5px var(--sans)' })); }
    stats.innerHTML = '';
    [['edits', edits], ['file', SD.fmt.bytes(data.length)], ['fixed upload', prev ? SD.fmt.bytes(f.bytes) : '–'], ['CDC upload', prev ? SD.fmt.bytes(c.bytes) : '–']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    return { f, c };
  }

  function edit(kind) {
    const at = Math.floor(data.length * pos / 100);
    prev = cur;
    if (kind === 'ins') data.splice(at, 0, ...randBytes(size));
    else if (kind === 'del') data.splice(at, Math.min(size, data.length - at - 1));
    else { const nb = randBytes(size); for (let i = 0; i < nb.length && at + i < data.length; i++) data[at + i] = nb[i]; }
    mark = at; edits++;
    build();
    const r = draw();
    const verb = { ins: 'Inserted', del: 'Deleted', ovr: 'Overwrote' }[kind];
    say(`${verb} ${size} B at ${pos}%: fixed blocks re-upload <b>${r.f.nNew}/${r.f.blocks.length}</b> (${SD.fmt.bytes(r.f.bytes)}), CDC re-uploads <b>${r.c.nNew}/${r.c.blocks.length}</b> (${SD.fmt.bytes(r.c.bytes)}).`);
    if (kind !== 'ovr' && r.f.nNew > r.c.nNew + 2) say('Every fixed block after the edit shifted, so its hash changed. CDC boundaries re-synced a few bytes after the edit.');
    if (kind === 'ovr') say('In-place overwrite: no bytes shift, so fixed blocks only lose the 1–2 blocks the edit touched.');
  }
  insBtn.addEventListener('click', () => edit('ins'));
  delBtn.addEventListener('click', () => edit('del'));
  ovrBtn.addEventListener('click', () => edit('ovr'));
  rstBtn.addEventListener('click', () => { resetFile(); log.innerHTML = ''; draw(); say('Reset to the original 6 KB file.'); });

  ctx.onResize((n) => { L = n ? LAYOUT.narrow : LAYOUT.wide; draw(); });
  draw();
  say('Pick a position near the start and press <b>Insert bytes</b>. Then try <b>Overwrite in place</b>.');
});
