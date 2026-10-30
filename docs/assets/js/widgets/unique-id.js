/* Real 64-bit Snowflake packing with BigInt: generate, burst, clock rollback, decode. */
SD.widget('unique-id', function (root, ctx) {
  const { el, svg } = ctx;
  const EX_EPOCH = 1704067200000; // example custom epoch: 2024-01-01 UTC
  const PRESETS = {
    twitter: { name: 'Twitter', epoch: 1288834974657, unit: 1, seqMode: 'tick', fields: [
      { k: 'sign', b: 1, c: 'var(--text-3)' }, { k: 'timestamp', b: 41, c: 'var(--accent)' }, { k: 'worker', b: 10, c: 'var(--k-store)' }, { k: 'sequence', b: 12, c: 'var(--warn)' }] },
    discord: { name: 'Discord', epoch: 1420070400000, unit: 1, seqMode: 'tick', fields: [
      { k: 'timestamp', b: 42, c: 'var(--accent)' }, { k: 'worker', b: 5, c: 'var(--k-store)' }, { k: 'process', b: 5, c: 'var(--k-cache)' }, { k: 'increment', b: 12, c: 'var(--warn)' }] },
    insta: { name: 'Instagram', epoch: EX_EPOCH, unit: 1, seqMode: 'mod', fields: [
      { k: 'timestamp', b: 41, c: 'var(--accent)' }, { k: 'shard', b: 13, c: 'var(--k-store)' }, { k: 'sequence', b: 10, c: 'var(--warn)' }] },
    sony: { name: 'Sonyflake', epoch: EX_EPOCH, unit: 10, seqMode: 'tick', fields: [
      { k: 'sign', b: 1, c: 'var(--text-3)' }, { k: 'time (10 ms)', b: 39, c: 'var(--accent)' }, { k: 'sequence', b: 8, c: 'var(--warn)' }, { k: 'machine', b: 16, c: 'var(--k-store)' }] }
  };
  let P = PRESETS.twitter, node = 1, skew = 0;
  let lastTick = -1, seq = 0, counter = 0, lastId = null;

  // controls
  const presetBtns = Object.keys(PRESETS).map((key) => {
    const b = el('button', { class: 'btn' + (key === 'twitter' ? ' primary' : ''), text: PRESETS[key].name });
    b.addEventListener('click', () => { P = PRESETS[key]; presetBtns.forEach((x) => x.classList.toggle('primary', x === b)); lastTick = -1; seq = 0; drawLayout(); say(`Layout → <b>${P.name}</b>: ${P.fields.map((f) => f.k + ' ' + f.b).join(' · ')}`); generate(); });
    return b;
  });
  const genBtn = el('button', { class: 'btn primary', text: '▶ Generate' });
  const burstBtn = el('button', { class: 'btn', text: '⚡ Burst 5,000 in one tick' });
  const skewBtn = el('button', { class: 'btn', text: '⏪ Clock −2 s' });
  const nodeOut = el('b', { text: node });
  const nodeIn = el('input', { type: 'range', min: 0, max: 1023, value: node, 'aria-label': 'Worker id' });
  nodeIn.addEventListener('input', () => { node = +nodeIn.value; nodeOut.textContent = node; });
  const decIn = el('input', { type: 'text', placeholder: 'paste an ID to decode', 'aria-label': 'ID to decode', style: { flex: '1 1 160px', minWidth: '0', font: '12px var(--mono)', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)' } });
  decIn.addEventListener('input', () => { const v = decIn.value.trim(); if (/^\d{1,20}$/.test(v)) { const id = BigInt(v); if (id < (1n << 64n)) { show(id, 'decoded'); return; } } if (v) setStats({ decode: 'not a 64-bit integer' }); });
  root.append(el('div', { class: 'w-controls' }, ...presetBtns));
  root.append(el('div', { class: 'w-controls' }, genBtn, burstBtn, skewBtn, el('label', null, 'node id ', nodeOut, ' ', nodeIn)));
  root.append(el('div', { class: 'w-controls' }, decIn));

  // stage: 4 rows × 16 bits
  const CW = 28, CH = 24, X0 = 34, Y0 = 8, RG = 34;
  const S_ = svg('svg', { viewBox: `0 0 ${X0 + 16 * CW + 8} ${Y0 + 4 * RG + 30}`, role: 'img', 'aria-label': '64-bit ID layout' });
  const gCells = svg('g'), gBands = svg('g'), gLegend = svg('g');
  S_.append(gBands, gCells, gLegend);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);

  const cells = [];
  for (let i = 0; i < 64; i++) {
    const bit = 63 - i, r = Math.floor(i / 16), c = i % 16;
    const x = X0 + c * CW, y = Y0 + r * RG;
    const rect = svg('rect', { x: x + 1, y, width: CW - 2, height: CH, rx: 4, style: 'transition:fill .25s' });
    const t = svg('text', { x: x + CW / 2, y: y + 16, 'text-anchor': 'middle', style: 'font:600 13px var(--mono)', fill: 'var(--text)' });
    gCells.append(rect, t);
    if (c === 0) gCells.append(svg('text', { x: X0 - 6, y: y + 16, 'text-anchor': 'end', style: 'font:10px var(--mono)', fill: 'var(--text-3)', text: bit }));
    cells.push({ bit, rect, t, x, y });
  }
  function fieldOfBit() { // map bit → field index
    const m = []; let pos = 63;
    P.fields.forEach((f, fi) => { for (let j = 0; j < f.b; j++) m[pos--] = fi; });
    return m;
  }
  function drawLayout() {
    gBands.innerHTML = ''; gLegend.innerHTML = '';
    const m = fieldOfBit();
    cells.forEach((cl) => { const f = P.fields[m[cl.bit]]; cl.f = f; gBands.append(svg('rect', { x: cl.x, y: cl.y + CH + 2, width: CW, height: 4, fill: f.c })); });
    let lx = X0; const ly = Y0 + 4 * RG + 14;
    P.fields.forEach((f) => {
      const label = f.k + ' ' + f.b;
      gLegend.append(svg('rect', { x: lx, y: ly - 9, width: 10, height: 10, rx: 2, fill: f.c }), svg('text', { x: lx + 14, y: ly, style: 'font:11px var(--sans)', fill: 'var(--text-2)', text: label }));
      lx += 26 + label.length * 6.2;
    });
    paint(lastId);
  }
  function paint(id) {
    cells.forEach((cl) => {
      const on = id != null && ((id >> BigInt(cl.bit)) & 1n) === 1n;
      cl.t.textContent = id == null ? '·' : on ? '1' : '0';
      cl.rect.style.fill = `color-mix(in srgb, ${cl.f.c} ${on ? 55 : 12}%, var(--surface))`;
      cl.rect.style.stroke = 'var(--border)';
    });
  }
  function decode(id) {
    const out = {}; let shift = 64;
    P.fields.forEach((f) => { shift -= f.b; out[f.k] = (id >> BigInt(shift)) & ((1n << BigInt(f.b)) - 1n); });
    const tsKey = P.fields.find((f) => f.k.startsWith('time')).k;
    out.ms = Number(out[tsKey]) * P.unit + P.epoch;
    return out;
  }
  function setStats(o) { stats.innerHTML = ''; Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  function show(id, how) {
    lastId = id; paint(id);
    const d = decode(id);
    const o = { id: id.toString(), hex: '0x' + id.toString(16) };
    P.fields.forEach((f) => { if (f.k !== 'sign') o[f.k] = d[f.k].toString(); });
    o.created = isFinite(d.ms) ? new Date(d.ms).toISOString().replace('T', ' ').replace('Z', ' UTC') : '?';
    setStats(o);
    if (how) say(`${how}: <b>${id}</b> → ${o.created}`);
  }

  // generator (real logic: refuse on rollback, wait on sequence exhaustion)
  const fieldBits = (name) => (P.fields.find((f) => f.k === name) || { b: 0 }).b;
  function nowTick() { return Math.floor((Date.now() + skew - P.epoch) / P.unit); }
  function pack(tick, s) {
    let id = 0n, shift = 64;
    P.fields.forEach((f) => {
      shift -= f.b;
      let v = 0n;
      if (f.k.startsWith('time')) v = BigInt(tick);
      else if (f.k === 'sequence' || f.k === 'increment') v = BigInt(s);
      else if (f.k === 'worker' || f.k === 'shard' || f.k === 'machine') v = BigInt(node & ((1 << f.b) - 1));
      else if (f.k === 'process') v = BigInt((node >> 5) & 31);
      id |= (v & ((1n << BigInt(f.b)) - 1n)) << BigInt(shift);
    });
    return id;
  }
  const seqBits = () => fieldBits('sequence') || fieldBits('increment');
  function next(tick) { // returns {id} or {refuse} or {wait}
    const mask = (1 << seqBits()) - 1;
    if (P.seqMode === 'mod') { const s = counter++ % (mask + 1); lastTick = tick; return { id: pack(tick, s), s }; } // nextval % 1024
    if (tick < lastTick) return { refuse: lastTick - tick };
    if (tick === lastTick) { seq = (seq + 1) & mask; if (seq === 0) return { wait: true }; } else seq = 0;
    lastTick = tick;
    return { id: pack(tick, seq), s: seq };
  }
  function generate() {
    const r = next(nowTick());
    if (r.refuse) { say(`<span style="color:var(--err)">✖ Clock is ${r.refuse * P.unit} ms behind last_ts. Refusing to mint (would risk duplicates).</span>`); setStats({ status: 'refusing', 'behind by': r.refuse * P.unit + ' ms' }); return; }
    if (r.wait) { say('Sequence exhausted in this tick → wait for next tick.'); setTimeout(generate, P.unit); return; }
    show(r.id, 'New ID');
  }
  genBtn.addEventListener('click', generate);
  skewBtn.addEventListener('click', () => { skew -= 2000; say(`⏪ Clock stepped back 2 s (total skew ${skew} ms). Press Generate.`); });

  burstBtn.addEventListener('click', () => {
    // freeze a virtual clock: every request arrives in the same tick; on exhaustion the tick advances (= waiting)
    let tick = Math.max(nowTick(), lastTick);
    const startTick = tick, seen = new Set();
    let dups = 0, waits = 0, last = null;
    for (let i = 0; i < 5000; i++) {
      let r = next(tick);
      while (r.wait || r.refuse) { tick++; waits++; r = next(tick); }
      const key = r.id.toString();
      if (seen.has(key)) dups++; else seen.add(key);
      last = r.id;
    }
    show(last, null);
    lastTick = -1; seq = 0; // the burst ran on a simulated clock; reset so real-time generation continues
    const spent = (tick - startTick) * P.unit;
    if (P.seqMode === 'mod') say(`<span style="color:var(--err)">Instagram-style <code>nextval % 1024</code> in one ms: ${dups} duplicate IDs among 5,000.</span> Per-shard write rate must stay under 1,024/ms.`);
    else say(`5,000 requests in one tick: sequence (${seqBits()} bits = ${1 << seqBits()}/tick) wrapped ${waits}×. Waited ${spent} ms. Duplicates: <b>${dups}</b>.`);
    setStats({ requests: '5,000', 'ids/tick': 1 << seqBits(), 'ticks waited': waits, 'time spent': spent + ' ms', duplicates: dups });
  });

  drawLayout();
  say('Tip: switch to Sonyflake and press Burst. 256 IDs per 10 ms means 5,000 IDs take about 200 ms.');
  generate();
});
