/* Real Gorilla (VLDB'15) encoder: delta-of-delta timestamps + XOR'd float64 values, plus a label-cardinality multiplier. */
SD.widget('observability', function (root, ctx) {
  const { el, svg } = ctx;
  const N = 48;
  // two layouts: desktop viewBox 500 wide; phone viewBox 360 wide with bigger text (on-screen ≥ 12px)
  const LAY = {
    wide:   { W: 500, H: 196, PX: 30, PY: 22, BASE: 160, f: 15, fs: 13, legGap: 150 },
    narrow: { W: 360, H: 214, PX: 30, PY: 26, BASE: 170, f: 15, fs: 14, legGap: 140 }
  };
  let L = ctx.narrow ? LAY.narrow : LAY.wide;
  let W = L.W, H = L.H, PX = L.PX, PY = L.PY, BASE = L.BASE;
  let kind = 'gauge', jitter = false, shown = 0, enc = [], sel = -1;

  // ---------- data ----------
  function makeSeries() {
    const ts = [], vs = [];
    let t = 1700000000, v = 1000;
    for (let i = 0; i < N; i++) {
      t += 15 + (jitter && i > 0 ? Math.round((Math.random() - 0.5) * 4) : 0);
      if (kind === 'gauge') v = Math.round(42 + 6 * Math.sin(i / 5) + (Math.random() < 0.3 ? 1 : 0));
      else if (kind === 'counter') v += 80 + Math.floor(Math.random() * 40);
      else if (kind === 'const') v = 1;
      else v = Math.random() * 100;
      ts.push(t); vs.push(v);
    }
    return { ts, vs };
  }

  // ---------- encoder ----------
  const dv = new DataView(new ArrayBuffer(8));
  const bitsOf = (x) => { dv.setFloat64(0, x); return dv.getBigUint64(0); };
  function clz64(b) { if (b === 0n) return 64; let n = 0; for (let i = 63n; i >= 0n && !((b >> i) & 1n); i--) n++; return n; }
  function ctz64(b) { if (b === 0n) return 64; let n = 0; while (!((b >> BigInt(n)) & 1n)) n++; return n; }
  function encode({ ts, vs }) {
    const out = [];
    let prevDelta = 0, prevLead = -1, prevTrail = 0, prevBits = bitsOf(vs[0]);
    out.push({ tb: 14, vb: 64, tdesc: 'first ts: 14-bit delta from block start', vdesc: 'first value: raw 64 bits', v: vs[0] });
    prevDelta = 15;
    for (let i = 1; i < N; i++) {
      const delta = ts[i] - ts[i - 1], dod = delta - prevDelta; prevDelta = delta;
      let tb, tdesc;
      if (dod === 0) { tb = 1; tdesc = "dod=0 → '0'"; }
      else if (dod >= -63 && dod <= 64) { tb = 2 + 7; tdesc = `dod=${dod} → '10' + 7 bits`; }
      else if (dod >= -255 && dod <= 256) { tb = 3 + 9; tdesc = `dod=${dod} → '110' + 9 bits`; }
      else if (dod >= -2047 && dod <= 2048) { tb = 4 + 12; tdesc = `dod=${dod} → '1110' + 12 bits`; }
      else { tb = 4 + 32; tdesc = `dod=${dod} → '1111' + 32 bits`; }
      const cur = bitsOf(vs[i]), x = cur ^ prevBits; prevBits = cur;
      let vb, vdesc;
      if (x === 0n) { vb = 1; vdesc = "xor=0 → '0'"; }
      else {
        const lead = Math.min(31, clz64(x)), trail = ctz64(x);
        if (prevLead >= 0 && lead >= prevLead && trail >= prevTrail) {
          vb = 2 + (64 - prevLead - prevTrail);
          vdesc = `xor fits previous window → '10' + ${64 - prevLead - prevTrail} bits`;
        } else {
          const len = 64 - lead - trail;
          vb = 2 + 5 + 6 + len; prevLead = lead; prevTrail = trail;
          vdesc = `new window: '11' + 5b lead(${lead}) + 6b len(${len}) + ${len} bits`;
        }
      }
      out.push({ tb, vb, tdesc, vdesc, v: vs[i], x });
    }
    return out;
  }

  // ---------- UI: gorilla ----------
  const kinds = [['gauge', 'CPU % gauge'], ['counter', 'Request counter'], ['const', 'Constant (up=1)'], ['random', 'Random floats']];
  const kBtns = kinds.map(([k, l]) => { const b = el('button', { class: 'btn' + (k === kind ? ' primary' : ''), text: l }); b.addEventListener('click', () => { kind = k; kBtns.forEach((x, i) => x.classList.toggle('primary', kinds[i][0] === k)); restart(); }); return b; });
  const jBtn = el('button', { class: 'btn', text: '⏱ Jitter: off' });
  jBtn.addEventListener('click', () => { jitter = !jitter; jBtn.textContent = '⏱ Jitter: ' + (jitter ? 'on' : 'off'); restart(); });
  root.append(el('div', { class: 'w-controls' }, ...kBtns, jBtn));
  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Bits per point', style: 'max-width:680px;margin:0 auto' });
  const gGrid = svg('g'), gBars = svg('g');
  S_.append(gGrid, gBars);
  root.append(el('div', { class: 'w-stage' }, S_));
  const bitY = (b) => BASE - (b / 128) * (BASE - PY);
  const txt = (x, y, t, st, a, fill) => svg('text', { x, y, 'text-anchor': a || 'start', style: st || `font:600 ${L.f}px var(--sans)`, fill: fill || 'var(--text-3)', text: t });
  function grid() {
    W = L.W; H = L.H; PX = L.PX; PY = L.PY; BASE = L.BASE;
    S_.setAttribute('viewBox', `0 0 ${W} ${H}`);
    gGrid.innerHTML = '';
    const mono = `font:600 ${L.fs}px var(--mono)`;
    gGrid.append(svg('line', { x1: PX, x2: W - 6, y1: bitY(128), y2: bitY(128), stroke: 'var(--err)', 'stroke-dasharray': '5 4' }),
      txt(W - 8, bitY(128) - 6, 'raw: 16 B = 128 bits / point', `font:700 ${L.f}px var(--sans)`, 'end', 'var(--err)'),
      svg('line', { x1: PX, x2: W - 6, y1: bitY(64), y2: bitY(64), stroke: 'var(--border)', 'stroke-dasharray': '2 4' }),
      txt(PX - 4, bitY(64) + 4, '64', mono, 'end'), txt(PX - 4, BASE + 4, '0', mono, 'end'),
      svg('line', { x1: PX, x2: W - 6, y1: BASE, y2: BASE, stroke: 'var(--border)' }),
      svg('rect', { x: PX, y: BASE + 13, width: 13, height: 13, rx: 2, fill: 'var(--accent-2)' }), txt(PX + 18, BASE + 25, ctx.narrow ? 'timestamp' : 'timestamp bits'),
      svg('rect', { x: PX + (ctx.narrow ? 100 : 150), y: BASE + 13, width: 13, height: 13, rx: 2, fill: 'var(--accent)' }), txt(PX + (ctx.narrow ? 118 : 168), BASE + 25, ctx.narrow ? 'value' : 'value bits'),
      txt(W - 8, BASE + 25, 'tap a bar', `font:600 ${L.f}px var(--sans)`, 'end'));
  }
  grid();
  ctx.onResize((n) => { L = n ? LAY.narrow : LAY.wide; grid(); draw(); });
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);

  function restart() { enc = encode(makeSeries()); shown = ctx.reduced ? N : 0; sel = -1; log.innerHTML = ''; draw(); }
  function draw() {
    gBars.innerHTML = '';
    const bw = (W - 6 - PX) / N;
    for (let i = 0; i < shown; i++) {
      const e = enc[i], x = PX + i * bw + 1, w = Math.max(2, bw - 2);
      const tTop = bitY(Math.min(128, e.tb)), vTop = bitY(Math.min(128, e.tb + e.vb));
      const g = svg('g', { style: 'cursor:pointer' });
      g.append(svg('rect', { x, y: tTop, width: w, height: Math.max(1.5, BASE - tTop), fill: 'var(--accent-2)', opacity: sel < 0 || sel === i ? 1 : 0.45 }),
        svg('rect', { x, y: vTop, width: w, height: Math.max(1.5, tTop - vTop), fill: 'var(--accent)', opacity: sel < 0 || sel === i ? 1 : 0.45 }),
        svg('rect', { x: x - 1, y: PY, width: w + 2, height: BASE - PY, fill: 'transparent' }));
      g.addEventListener('click', () => { sel = i; draw(); explain(i); });
      gBars.append(g);
    }
    const done = enc.slice(0, shown);
    const bits = done.reduce((a, e) => a + e.tb + e.vb, 0);
    const tb = done.reduce((a, e) => a + e.tb, 0), vbits = bits - tb;
    stats.innerHTML = '';
    const B = shown ? bits / shown / 8 : 0;
    const st = { points: shown + '/' + N, 'bytes / point': B.toFixed(2), 'vs 16 B raw': shown ? (16 / B).toFixed(1) + '× smaller' : '—', 'ts bits': tb, 'value bits': vbits };
    Object.entries(st).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function explain(i) {
    const e = enc[i];
    const val = typeof e.v === 'number' && !Number.isInteger(e.v) ? e.v.toFixed(4) : e.v;
    say(`#${i} value ${val}: <b>${e.tb + e.vb} bits</b> · ts: ${e.tdesc} · value: ${e.vdesc}` + (e.x != null && e.x !== 0n ? ` · xor=0x${e.x.toString(16).padStart(16, '0')}` : ''));
  }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }

  let acc = 0;
  ctx.loop((dt) => {
    if (shown >= N) return;
    acc += dt;
    if (acc > 110) { acc = 0; shown++; draw(); if (shown === N) explain(N - 1); }
  });

  // ---------- UI: cardinality ----------
  const labels = [['method', 5], ['status', 6], ['endpoint', 50], ['pod', 200], ['region', 4], ['user_id', 1000000]];
  const on = { method: true, status: true, endpoint: true, pod: false, region: false, user_id: false };
  const cardTitle = el('div', { style: { margin: '16px 0 6px', fontWeight: 700, fontSize: '14px' }, text: 'Cardinality: one histogram metric (12 buckets + sum + count = 14 series per label set)' });
  const lBtns = labels.map(([n, c]) => {
    const b = el('button', { class: 'btn' + (on[n] ? ' primary' : ''), text: `${n} ×${SD.fmt.num(c)}` });
    b.addEventListener('click', () => { on[n] = !on[n]; b.classList.toggle('primary', on[n]); card(); });
    return b;
  });
  const big = el('div', { style: { fontFamily: 'var(--mono)', fontSize: '22px', fontWeight: 700, margin: '8px 0 4px' } });
  const barWrap = el('div', { style: { height: '10px', background: 'var(--surface-2)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' } });
  const bar = el('div', { style: { height: '100%', width: '0%', transition: 'width .4s, background .4s' } });
  barWrap.append(bar);
  const cardNote = el('div', { style: { fontSize: '12.5px', color: 'var(--text-2)', marginTop: '6px' } });
  root.append(cardTitle, el('div', { class: 'w-controls' }, ...lBtns), big, barWrap, cardNote);
  function card() {
    let combos = 1; const parts = [];
    labels.forEach(([n, c]) => { if (on[n]) { combos *= c; parts.push(SD.fmt.num(c)); } });
    const series = combos * 14, mem = series * 4e3;
    big.textContent = SD.fmt.num(series) + ' series ≈ ' + SD.fmt.bytes(mem);
    const frac = Math.min(1, Math.log10(series) / 10);
    bar.style.width = (frac * 100) + '%';
    bar.style.background = series < 1e5 ? 'var(--ok)' : series < 1e7 ? 'var(--warn)' : 'var(--err)';
    cardNote.innerHTML = (parts.length ? parts.join(' × ') + ' × 14' : '14') + ' = ' + SD.fmt.num(series) + ' series. Memory at ~4 KB per active series is an <em>estimate</em>. ' +
      (on.user_id ? '<b>user_id</b> turns one metric into a database of users. Move it to traces/logs.' : series > 1e6 ? 'Already in the millions: consider dropping <b>pod</b> and aggregating at query time.' : 'Fine for a TSDB.');
  }
  restart(); card();
});
