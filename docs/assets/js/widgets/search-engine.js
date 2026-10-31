/* Live inverted index: buffer → refresh → immutable segments → merge, with real BM25 (Lucene idf, k1=1.2, b=0.75). */
SD.widget('search-engine', function (root, ctx) {
  const { el, svg } = ctx;
  const K1 = 1.2, B = 0.75;
  const STOP = new Set('a an and are as at be by for from has in is it its of on or that the this to with uses'.split(' '));
  const tok = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w));
  const SEED = [
    'Kafka is a distributed log for streaming events',
    'Elasticsearch builds an inverted index on Lucene segments',
    'Lucene segments are immutable and merges drop deleted docs',
    'A distributed search engine shards the inverted index across nodes',
    'Postgres full text search uses tsvector and a GIN index'
  ];
  let docs, buffer, segments, nextId, nextSeg;

  // controls
  const docIn = el('input', { type: 'text', value: 'BM25 ranks the inverted index results by relevance', 'aria-label': 'Document text', style: inputStyle() });
  const addBtn = el('button', { class: 'btn primary', text: '+ Index doc' });
  const refBtn = el('button', { class: 'btn', text: '⟳ Refresh' });
  const mergeBtn = el('button', { class: 'btn', text: '⇊ Merge segments' });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  const qIn = el('input', { type: 'text', value: 'distributed inverted index', 'aria-label': 'Search query', style: inputStyle() });
  root.append(el('div', { class: 'w-controls' }, docIn, addBtn));
  root.append(el('div', { class: 'w-controls' }, refBtn, mergeBtn, resetBtn));
  root.append(el('div', { class: 'w-controls' }, el('label', null, '🔎'), qIn));
  function inputStyle() { return { flex: '1 1 220px', minWidth: '0', font: '13px var(--mono)', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)' }; }

  const S_ = svg('svg', { viewBox: '0 0 500 150', role: 'img', 'aria-label': 'Indexing buffer and segments' });
  const gSeg = svg('g');
  S_.append(gSeg);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const post = el('div', { class: 'w-log', style: { maxHeight: 'none' } });
  const res = el('div', { class: 'w-log', style: { maxHeight: 'none' } });
  root.append(stats, el('div', { class: 'tiny', style: { marginTop: '10px', fontWeight: '600' }, text: 'Postings for the query terms (searchable segments only)' }), post,
    el('div', { class: 'tiny', style: { marginTop: '10px', fontWeight: '600' }, text: 'Ranked results: BM25 per term = idf × tf·(k1+1) / (tf + k1·(1−b+b·dl/avgdl))' }), res);

  function reset() {
    docs = {}; buffer = []; segments = []; nextId = 1; nextSeg = 0;
    SEED.forEach((t, i) => { add(t); if (i === 1 || i === 2) refresh(); }); // s0 = d1,d2 · s1 = d3 · d4,d5 stay in the buffer
    render();
  }
  function add(text) {
    const id = 'd' + nextId++;
    const terms = tok(text);
    const tf = {}; terms.forEach((w) => { tf[w] = (tf[w] || 0) + 1; });
    docs[id] = { id, text, len: terms.length, tf };
    buffer.push(id);
    return id;
  }
  function refresh() { // buffer → new immutable segment (searchable)
    if (!buffer.length) return false;
    const post = {};
    buffer.forEach((id) => Object.keys(docs[id].tf).forEach((w) => { (post[w] = post[w] || []).push(id); }));
    segments.push({ name: 's' + nextSeg++, ids: buffer.slice(), post });
    buffer = [];
    return true;
  }
  function merge() { // tiered-ish: merge all segments into one new segment
    if (segments.length < 2) return false;
    const ids = segments.flatMap((s) => s.ids), post = {};
    segments.forEach((s) => Object.entries(s.post).forEach(([w, l]) => { post[w] = (post[w] || []).concat(l); }));
    segments = [{ name: 's' + nextSeg++, ids, post }];
    return true;
  }

  function search(q) {
    const searchable = segments.flatMap((s) => s.ids);
    const N = searchable.length;
    const avgdl = N ? searchable.reduce((a, id) => a + docs[id].len, 0) / N : 1;
    const terms = [...new Set(tok(q))];
    const termInfo = terms.map((t) => {
      const plist = segments.flatMap((s) => (s.post[t] || []).map((id) => ({ id, seg: s.name })));
      const df = plist.length;
      return { t, plist, df, idf: Math.log(1 + (N - df + 0.5) / (df + 0.5)) };
    });
    const scores = {};
    termInfo.forEach(({ t, plist, idf }) => plist.forEach(({ id }) => {
      const d = docs[id], f = d.tf[t];
      const part = idf * f * (K1 + 1) / (f + K1 * (1 - B + B * d.len / avgdl));
      (scores[id] = scores[id] || { id, total: 0, parts: [] }).total += part;
      scores[id].parts.push({ t, f, idf, part });
    }));
    return { N, avgdl, termInfo, ranked: Object.values(scores).sort((a, b) => b.total - a.total) };
  }

  // phone: 360-wide viewBox, buffer panel stacked above the segment row, 14–15-unit text
  function drawNarrow() {
    S_.setAttribute('viewBox', '0 0 360 262');
    const T = (x, y, t, st, fill, a) => svg('text', { x, y, 'text-anchor': a || 'start', style: st, fill: fill || 'var(--text)', text: t });
    gSeg.append(T(6, 18, 'Indexing buffer (RAM, hidden)', 'font:700 15px var(--sans)', 'var(--text-2)'),
      svg('rect', { x: 6, y: 28, width: 348, height: 44, rx: 8, fill: 'color-mix(in srgb, var(--warn) 12%, var(--surface))', stroke: 'var(--warn)', 'stroke-dasharray': '5 4' }));
    buffer.slice(0, 5).forEach((id, i) => gSeg.append(T(22 + i * 58, 56, id, 'font:600 15px var(--mono)')));
    if (!buffer.length) gSeg.append(T(180, 56, 'empty', 'font:15px var(--sans)', 'var(--text-3)', 'middle'));
    if (buffer.length > 5) gSeg.append(T(340, 56, '+' + (buffer.length - 5), 'font:15px var(--mono)', 'var(--text-3)', 'end'));
    gSeg.append(svg('path', { d: 'M180,76 L180,92', stroke: 'var(--text-3)', 'stroke-width': 2 }), svg('path', { d: 'M175,88 L180,95 L185,88 z', fill: 'var(--text-3)' }),
      T(192, 90, 'refresh', 'font:600 14px var(--sans)', 'var(--text-3)'),
      T(6, 114, 'Immutable segments (searchable)', 'font:700 15px var(--sans)', 'var(--text-2)'));
    const n = Math.max(1, segments.length), gap = 6, w = Math.min(110, (348 - gap * (n - 1)) / n);
    segments.forEach((sg, i) => {
      const x = 6 + i * (w + gap);
      gSeg.append(svg('rect', { x, y: 124, width: w, height: 132, rx: 8, fill: 'color-mix(in srgb, var(--ok) 14%, var(--surface))', stroke: 'var(--ok)' }),
        T(x + w / 2, 146, sg.name, 'font:700 15px var(--mono)', 'var(--text)', 'middle'));
      sg.ids.slice(0, 4).forEach((id, j) => gSeg.append(T(x + w / 2, 172 + j * 20, id, 'font:15px var(--mono)', 'var(--text-2)', 'middle')));
      if (sg.ids.length > 4) gSeg.append(T(x + w / 2, 250, '+' + (sg.ids.length - 4), 'font:14px var(--mono)', 'var(--text-3)', 'middle'));
    });
  }
  ctx.onResize(() => render());

  function render() {
    // segments diagram
    gSeg.innerHTML = '';
    if (ctx.narrow) drawNarrow(); else drawWide();
    renderSearch();
  }
  function drawWide() {
    S_.setAttribute('viewBox', '0 0 500 150');
    gSeg.append(svg('text', { x: 8, y: 16, style: 'font:700 13px var(--sans)', fill: 'var(--text-2)', text: 'Indexing buffer (RAM)' }),
      svg('text', { x: 180, y: 16, style: 'font:700 13px var(--sans)', fill: 'var(--text-2)', text: 'Immutable segments (searchable)' }));
    gSeg.append(svg('rect', { x: 8, y: 26, width: 150, height: 112, rx: 8, fill: 'color-mix(in srgb, var(--warn) 12%, var(--surface))', stroke: 'var(--warn)', 'stroke-dasharray': '5 4' }));
    buffer.slice(0, 5).forEach((id, i) => gSeg.append(svg('text', { x: 18, y: 48 + i * 19, style: 'font:600 14px var(--mono)', fill: 'var(--text)', text: id + ' (hidden)' })));
    if (!buffer.length) gSeg.append(svg('text', { x: 83, y: 86, 'text-anchor': 'middle', style: 'font:13px var(--sans)', fill: 'var(--text-3)', text: 'empty' }));
    if (buffer.length > 5) gSeg.append(svg('text', { x: 18, y: 134, style: 'font:12px var(--mono)', fill: 'var(--text-3)', text: '+' + (buffer.length - 5) + ' more' }));
    gSeg.append(svg('path', { d: 'M160,82 L176,82', stroke: 'var(--text-3)', 'stroke-width': 2 }), svg('path', { d: 'M172,77 L178,82 L172,87 z', fill: 'var(--text-3)' }));
    const n = Math.max(1, segments.length), gap = 6, w = Math.min(100, (310 - gap * (n - 1)) / n);
    segments.forEach((s, i) => {
      const x = 182 + i * (w + gap);
      gSeg.append(svg('rect', { x, y: 26, width: w, height: 112, rx: 8, fill: 'color-mix(in srgb, var(--ok) 14%, var(--surface))', stroke: 'var(--ok)' }),
        svg('text', { x: x + w / 2, y: 44, 'text-anchor': 'middle', style: 'font:700 14px var(--mono)', fill: 'var(--text)', text: s.name }));
      s.ids.slice(0, 5).forEach((id, j) => gSeg.append(svg('text', { x: x + w / 2, y: 66 + j * 16, 'text-anchor': 'middle', style: 'font:14px var(--mono)', fill: 'var(--text-2)', text: id })));
      if (s.ids.length > 5) gSeg.append(svg('text', { x: x + w / 2, y: 134, 'text-anchor': 'middle', style: 'font:11px var(--mono)', fill: 'var(--text-3)', text: '+' + (s.ids.length - 5) }));
    });
  }
  function renderSearch() {
    const r = search(qIn.value);
    stats.innerHTML = '';
    [['searchable docs N', r.N], ['in buffer', buffer.length], ['segments', segments.length], ['avgdl', r.avgdl.toFixed(1) + ' terms'], ['segments visited per query', segments.length]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    post.innerHTML = r.termInfo.length ? r.termInfo.map((ti) => `<div><b>${ti.t}</b> → ${ti.plist.length ? ti.plist.map((p) => `${p.id}<span style="color:var(--text-3)">@${p.seg}</span>:${docs[p.id].tf[ti.t]}`).join(' ') : '<i>no postings</i>'} <span style="color:var(--text-3)">· df=${ti.df} · idf=${ti.idf.toFixed(2)}</span></div>`).join('') : '<div>type a query</div>';
    const hidden = buffer.filter((id) => tok(qIn.value).some((t) => docs[id].tf[t]));
    res.innerHTML = (r.ranked.length ? r.ranked.map((x, i) => `<div><b>#${i + 1} ${x.id} = ${x.total.toFixed(3)}</b> <span style="color:var(--text-3)">(dl=${docs[x.id].len})</span><br>${x.parts.map((p) => `&nbsp;&nbsp;${p.t}: idf ${p.idf.toFixed(2)} × tf ${p.f} → ${p.part.toFixed(3)}`).join('<br>')}<br><span style="color:var(--text-3)">&nbsp;&nbsp;"${docs[x.id].text}"</span></div>`).join('') : '<div>No matches in searchable segments.</div>')
      + (hidden.length ? `<div style="color:var(--warn)">⚠ ${hidden.join(', ')} also match${hidden.length === 1 ? 'es' : ''} but ${hidden.length === 1 ? 'is' : 'are'} still in the buffer. Press Refresh.</div>` : '');
  }

  addBtn.addEventListener('click', () => { const t = docIn.value.trim(); if (!t) return; add(t); docIn.value = ''; render(); });
  docIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBtn.click(); });
  refBtn.addEventListener('click', () => { refresh(); render(); });
  mergeBtn.addEventListener('click', () => { merge(); render(); });
  resetBtn.addEventListener('click', reset);
  qIn.addEventListener('input', render);
  reset();
});
