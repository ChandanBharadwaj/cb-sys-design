/* KV block pool with per-sequence block tables: paged vs contiguous allocation, continuous vs static batching, preemption. */
SD.widget('llm-inference', function (root, ctx) {
  const { el, svg } = ctx;
  const COLS = 10, ROWS = 6, NB = COLS * ROWS, BT = 4, MAXSEQ = 8, MAXLEN = 32, HIST = 50;
  const CW = 47, CH = 30, GAP = 2.5, GX = (500 - COLS * (CW + GAP)) / 2, GY = 8;
  const W = 500, TY = GY + ROWS * (CH + GAP) + 26, TH = 62, H = TY + TH + 22;
  let paged = true, cont = true, playing = !ctx.reduced, sel = null;
  let blocks, queue, running, nextId, stepN, hist, stat;

  const kvBtn = el('button', { class: 'btn primary', text: 'KV: Paged' });
  kvBtn.addEventListener('click', () => { paged = !paged; kvBtn.textContent = 'KV: ' + (paged ? 'Paged' : 'Contiguous (reserve 32)'); kvBtn.classList.toggle('primary', paged); reset(); });
  const bBtn = el('button', { class: 'btn primary', text: 'Batching: Continuous' });
  bBtn.addEventListener('click', () => { cont = !cont; bBtn.textContent = 'Batching: ' + (cont ? 'Continuous' : 'Static'); bBtn.classList.toggle('primary', cont); reset(); });
  const playBtn = el('button', { class: 'btn', text: playing ? '❚❚ Pause' : '▶ Play' });
  playBtn.addEventListener('click', () => { playing = !playing; playBtn.textContent = playing ? '❚❚ Pause' : '▶ Play'; });
  const stepBtn = el('button', { class: 'btn', text: 'Step' });
  stepBtn.addEventListener('click', () => { step(); paint(); });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  resetBtn.addEventListener('click', reset);
  root.append(el('div', { class: 'w-controls' }, kvBtn, bBtn, playBtn, stepBtn, resetBtn));

  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'GPU KV block pool' });
  const defs = svg('defs', null, svg('pattern', { id: 'llmHatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, svg('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--text-3)', 'stroke-width': 1.6, opacity: 0.5 })));
  const gGrid = svg('g'), gTl = svg('g');
  S_.append(defs, gGrid, gTl);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const T = (x, y, t, st, a, f) => svg('text', { x, y, 'text-anchor': a || 'middle', style: st || 'font:700 14px var(--mono)', fill: f || 'var(--text)', text: t });

  const cells = [];
  for (let i = 0; i < NB; i++) {
    const x = GX + (i % COLS) * (CW + GAP), y = GY + Math.floor(i / COLS) * (CH + GAP);
    const bg = svg('rect', { x, y, width: CW, height: CH, rx: 5, fill: 'var(--surface-2)', stroke: 'var(--border)' });
    const fillR = svg('rect', { x, y, width: 0, height: CH, rx: 5 });
    const hatch = svg('rect', { x, y, width: CW, height: CH, rx: 5, fill: 'url(#llmHatch)', opacity: 0 });
    const lab = T(x + CW / 2, y + CH / 2 + 5, '', 'font:700 14px var(--mono);paint-order:stroke;stroke:var(--surface);stroke-width:3px');
    const g = svg('g', { style: 'cursor:pointer' }, bg, fillR, hatch, lab);
    g.addEventListener('click', () => { const s = blocks[i].seq; sel = s; if (s) showTable(s); paint(); });
    gGrid.append(g); cells.push({ bg, fillR, hatch, lab, x });
  }
  gTl.append(T(GX, TY - 8, 'running sequences per step (max ' + MAXSEQ + ')', 'font:600 15px var(--sans)', 'start', 'var(--text-3)'),
    svg('line', { x1: GX, x2: W - GX, y1: TY + TH, y2: TY + TH, stroke: 'var(--border)' }));
  const gBars = svg('g'); gTl.append(gBars);

  const hue = (id) => (id * 67) % 360;
  const color = (id, a) => `hsl(${hue(id)} 65% 55% / ${a == null ? 1 : a})`;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  function reset() {
    blocks = Array.from({ length: NB }, () => ({ seq: null, filled: 0 }));
    queue = []; running = []; nextId = 1; stepN = 0; hist = []; sel = null;
    stat = { gen: 0, preempt: 0, done: 0 };
    log.innerHTML = '';
    say(paged ? 'Paged: blocks are allocated <b>on demand</b>, anywhere in the pool.' : 'Contiguous: each request reserves <b>32 tokens (8 blocks) in one run</b> up front.');
    paint();
  }
  function freeIdx() { const f = []; blocks.forEach((b, i) => { if (!b.seq) f.push(i); }); return f; }
  function contiguousRun(n) { let run = 0; for (let i = 0; i < NB; i++) { run = blocks[i].seq ? 0 : run + 1; if (run === n) return i - n + 1; } return -1; }
  function release(s) { s.table.forEach((i) => { blocks[i].seq = null; blocks[i].filled = 0; }); s.table = []; }
  function writeTokens(s) { // place s.len tokens into its table
    s.table.forEach((bi, k) => { blocks[bi].filled = Math.max(0, Math.min(BT, s.len - k * BT)); });
  }
  function admit(s) {
    if (running.length >= MAXSEQ) return false;
    if (paged) {
      const need = Math.ceil(s.len / BT), f = freeIdx();
      if (f.length < need + 1) return false; // keep one spare block as a watermark
      s.table = f.slice(0, need);
    } else {
      const start = contiguousRun(MAXLEN / BT);
      if (start < 0) return false;
      s.table = Array.from({ length: MAXLEN / BT }, (_, k) => start + k);
    }
    s.table.forEach((i) => { blocks[i].seq = s; });
    writeTokens(s); s.admitted = stepN; running.push(s);
    return true;
  }

  function step() {
    stepN++;
    if (Math.random() < 0.5) { const p = rnd(3, 10); queue.push({ id: nextId++, len: p, prompt: p, left: rnd(2, Math.min(22, MAXLEN - p)), table: [], done: false }); }
    const active = running.filter((s) => !s.done);
    // static batching: only form a new batch when the whole previous batch has finished
    if (!cont && running.length && !active.length) { running.forEach(release); running = []; }
    if (cont || !running.length) {
      while (queue.length && admit(queue[0])) { const s = queue.shift(); say(`#${s.id} admitted: prefill ${s.len} tokens → ${s.table.length} block${s.table.length > 1 ? 's' : ''}.`); }
    }
    // one decode step for every running (unfinished) sequence
    for (const s of running.filter((x) => !x.done && x.admitted < stepN)) {
      if (!running.includes(s)) continue; // preempted earlier in this step
      if (paged && s.len % BT === 0) {
        let f = freeIdx();
        if (!f.length) { // preempt the newest other sequence (recompute later)
          const victim = running.filter((x) => !x.done && x !== s).sort((a, b) => b.admitted - a.admitted)[0];
          if (victim) {
            release(victim); running = running.filter((x) => x !== victim); victim.done = false; queue.unshift(victim); stat.preempt++;
            say(`<b>KV full</b> → preempt #${victim.id} (blocks freed, will recompute ${victim.len} tokens).`);
            f = freeIdx();
          }
        }
        if (!f.length) continue;
        blocks[f[0]].seq = s; s.table.push(f[0]);
      }
      s.len++; s.left--; stat.gen++; writeTokens(s);
      if (s.left <= 0) {
        s.done = true; stat.done++;
        if (cont) { release(s); say(`#${s.id} finished (${s.len} tokens): blocks returned to the pool.`); }
        else say(`#${s.id} finished, but its slot and memory stay held until the static batch ends.`);
      }
    }
    if (cont) running = running.filter((s) => !s.done);
    hist.push(running.filter((s) => !s.done).length);
    if (hist.length > HIST) hist.shift();
  }

  function showTable(s) {
    say(`#${s.id} block table (logical → physical): ` + s.table.map((b, k) => `${k}→${b}`).join(', ') + ` · ${s.len} tokens`);
  }

  function paint() {
    let filledTok = 0, reservedEmpty = 0, used = 0;
    blocks.forEach((b, i) => {
      const c = cells[i];
      if (!b.seq) { c.fillR.setAttribute('width', 0); c.hatch.setAttribute('opacity', 0); c.lab.textContent = ''; c.bg.setAttribute('stroke', 'var(--border)'); c.bg.setAttribute('fill', 'var(--surface-2)'); return; }
      used++; filledTok += b.filled; reservedEmpty += BT - b.filled;
      const s = b.seq, dim = s.done ? 0.35 : 1;
      c.bg.setAttribute('fill', color(s.id, 0.16 * dim));
      c.bg.setAttribute('stroke', sel === s ? 'var(--text)' : color(s.id, 0.8 * dim));
      c.bg.setAttribute('stroke-width', sel === s ? 2.5 : 1);
      c.fillR.setAttribute('width', (CW * b.filled) / BT);
      c.fillR.setAttribute('fill', s.done ? 'var(--text-3)' : color(s.id, 0.85));
      c.hatch.setAttribute('opacity', b.filled === 0 ? 1 : 0);
      c.lab.textContent = '#' + s.id;
    });
    gBars.innerHTML = '';
    const bw = (W - 2 * GX) / HIST;
    hist.forEach((r, i) => {
      const h = (r / MAXSEQ) * TH;
      gBars.append(svg('rect', { x: GX + i * bw + 0.5, y: TY + TH - h, width: Math.max(1, bw - 1), height: h, fill: r >= MAXSEQ * 0.75 ? 'var(--ok)' : r >= MAXSEQ * 0.4 ? 'var(--warn)' : 'var(--err)' }));
    });
    const recent = hist.slice(-20);
    const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    stats.innerHTML = '';
    const st = {
      step: stepN, 'tokens generated': stat.gen, 'avg batch (last 20)': avg.toFixed(1),
      'blocks used': used + '/' + NB, 'reserved but empty': used ? Math.round((reservedEmpty / (used * BT)) * 100) + '%' : '0%',
      waiting: queue.length, preemptions: stat.preempt
    };
    Object.entries(st).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); }

  reset();
  if (ctx.reduced) { for (let i = 0; i < 25; i++) step(); paint(); }
  let acc = 0;
  ctx.loop((dt) => { if (!playing) return; acc += dt; if (acc > 380) { acc = 0; step(); paint(); } });
});
