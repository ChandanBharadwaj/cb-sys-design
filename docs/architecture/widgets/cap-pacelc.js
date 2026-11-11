/* CAP: 3 replicas (A, B West · C East). Cut the link, write on both sides, CP refuses / AP diverges,
   heal with last-write-wins or vector-clock siblings. PACELC: latency vs freshness with no partition. */
SD.widget('cap-pacelc', function (root, ctx) {
  const { el, svg } = ctx;
  const POOL = { W: ['milk', 'eggs', 'bread', 'rice', 'salt', 'figs'], E: ['tea', 'jam', 'oats', 'soap', 'kale', 'nuts'] };
  // ---- model (survives layout rebuilds) ----
  const M = { mode: 'cp', merge: 'sib', cut: false, clock: 0, acc: 0, ref: 0, lost: 0, reps: null, hints: 0 };
  function reset() {
    M.clock = 0; M.acc = 0; M.ref = 0; M.lost = 0; M.hints = 0; M.cut = false;
    const v0 = { items: [], vc: {}, ts: 0 };
    M.reps = { A: [v0], B: [v0], C: [v0] };
  }
  reset();
  const geq = (a, b) => Object.keys(b).every((k) => (a[k] || 0) >= b[k]);
  const same = (a, b) => geq(a, b) && geq(b, a);
  function put(r, v) {               // keep only versions not dominated by another (vector-clock siblings)
    const vs = M.reps[r];
    if (vs.some((x) => geq(x.vc, v.vc))) return;
    M.reps[r] = vs.filter((x) => !geq(v.vc, x.vc)).concat([v]);
  }
  function frontier(list) {
    const out = [];
    list.forEach((v) => { if (!out.some((x) => same(x.vc, v.vc))) out.push(v); });
    return out.filter((v) => !out.some((x) => x !== v && geq(x.vc, v.vc) && !same(x.vc, v.vc)));
  }
  const union = (vs) => [...new Set(vs.flatMap((v) => v.items))];
  const reach = (coord) => (!M.cut ? ['A', 'B', 'C'] : coord === 'C' ? ['C'] : ['A', 'B']);
  const vcText = (vc) => '{' + Object.keys(vc).sort().map((k) => k + ':' + vc[k]).join(',') + '}';
  const cartText = (items) => '[' + (items.length ? items.join(', ') : 'empty') + ']';

  let gen = 0, loopH = null;
  function build(narrow) {
    const my = ++gen;
    if (loopH) loopH.stop();
    root.innerHTML = '';
    const F = narrow ? { t: 16, b: 14.5, s: 13.5, r: 14 } : { t: 15, b: 14, s: 12.5, r: 13 };
    const W = narrow ? 360 : 560, H = narrow ? 330 : 290;
    const BW = narrow ? 158 : 190, BH = 86;
    const P = narrow
      ? { A: [91, 115], B: [91, 255], C: [269, 185], cutX: 180, west: [4, 34, 172, 292], east: [188, 34, 168, 292] }
      : { A: [125, 105], B: [125, 225], C: [445, 165], cutX: 285, west: [8, 34, 236, 248], east: [334, 34, 218, 248] };

    // ---- controls ----
    const segBtn = (txt, on, fn) => { const b = el('button', { class: 'btn' + (on ? ' primary' : ''), text: txt }); b.addEventListener('click', fn); return b; };
    const cpB = segBtn('CP: refuse', M.mode === 'cp', () => setMode('cp'));
    const apB = segBtn('AP: accept', M.mode === 'ap', () => setMode('ap'));
    const lwwB = segBtn('LWW', M.merge === 'lww', () => setMerge('lww'));
    const sibB = segBtn('Siblings', M.merge === 'sib', () => setMerge('sib'));
    const cutB = el('button', { class: 'btn primary' });
    cutB.addEventListener('click', () => (M.cut ? heal() : cut()));
    const wW = el('button', { class: 'btn', text: '+ item West' }); wW.addEventListener('click', () => write('A'));
    const wE = el('button', { class: 'btn', text: '+ item East' }); wE.addEventListener('click', () => write('C'));
    const rW = el('button', { class: 'btn', text: 'Read West' }); rW.addEventListener('click', () => read('A'));
    const rE = el('button', { class: 'btn', text: 'Read East' }); rE.addEventListener('click', () => read('C'));
    const rst = el('button', { class: 'btn', text: '↺ Reset' }); rst.addEventListener('click', () => { reset(); log.innerHTML = ''; paint(); say('Reset: all replicas hold an empty cart.'); });
    root.append(
      el('div', { class: 'w-controls' }, el('label', null, 'Partition mode'), cpB, apB, el('label', null, 'Heal with'), lwwB, sibB),
      el('div', { class: 'w-controls' }, cutB, wW, wE, rW, rE, rst));

    // ---- svg ----
    const stage = el('div', { class: 'w-stage' });
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Three replicas across two regions' });
    const gReg = svg('g'), gLinks = svg('g'), gBox = svg('g'), gPk = svg('g');
    S.append(gReg, gLinks, gBox, gPk);
    stage.append(S); root.append(stage);
    const regionT = (r, label) => {
      gReg.append(svg('rect', { x: r[0], y: r[1], width: r[2], height: r[3], rx: 12, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-dasharray': '4 4' }));
      gReg.append(svg('text', { x: r[0] + r[2] / 2, y: r[1] - 10, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:700 ${F.s}px var(--sans);letter-spacing:.05em`, text: label }));
    };
    regionT(P.west, narrow ? 'WEST · client W' : 'WEST REGION · client W');
    regionT(P.east, narrow ? 'EAST · client E' : 'EAST REGION · client E');
    const link = (a, b) => svg('line', { x1: P[a][0], y1: P[a][1], x2: P[b][0], y2: P[b][1], 'stroke-width': 3 });
    const L = { AB: link('A', 'B'), AC: link('A', 'C'), BC: link('B', 'C') };
    Object.values(L).forEach((l) => gLinks.append(l));
    const cutMark = svg('text', { x: P.cutX, y: H - 8, 'text-anchor': 'middle', fill: 'var(--err)', style: `font:700 ${F.b}px var(--sans)`, text: '✂ partition' });
    const cutLine = svg('line', { x1: P.cutX, y1: 30, x2: P.cutX, y2: H - 26, stroke: 'var(--err)', 'stroke-width': 3, 'stroke-dasharray': '8 6' });
    gLinks.append(cutLine, cutMark);
    const box = {};
    ['A', 'B', 'C'].forEach((r) => {
      const [cx, cy] = P[r];
      const g = svg('g');
      const rect = svg('rect', { x: cx - BW / 2, y: cy - BH / 2, width: BW, height: BH, rx: 10, 'stroke-width': 2 });
      const t1 = svg('text', { x: cx, y: cy - BH / 2 + 22, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${F.t}px var(--sans)` });
      const t2 = svg('text', { x: cx, y: cy + 5, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:600 ${F.b}px var(--mono)` });
      const t3 = svg('text', { x: cx, y: cy + BH / 2 - 12, 'text-anchor': 'middle', style: `font:500 ${F.s}px var(--mono)` });
      g.append(rect, t1, t2, t3); gBox.append(g);
      box[r] = { rect, t1, t2, t3 };
    });
    const legend = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Each box shows the replica\'s cart and its <b>vector clock</b> <code>{A:n,C:m}</code> (writes counted per coordinator). Writes from West are coordinated by A, from East by C. CP needs <b>2 of 3</b> replicas; AP accepts on whatever it can reach.' });
    stage.append(legend);
    const stats = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);

    // ---- PACELC panel ----
    const pTitle = el('p', { style: { margin: '16px 0 6px', fontWeight: '700' }, html: 'PACELC "Else": no partition, East client reads' });
    let pr = 1, prtt = 70, prate = 5;
    const rOut = el('b'), tOut = el('b'), qOut = el('b');
    const rIn = el('input', { type: 'range', min: 1, max: 3, value: pr, 'aria-label': 'Read replicas R' });
    const tIn = el('input', { type: 'range', min: 10, max: 200, step: 5, value: prtt, 'aria-label': 'Cross-region RTT' });
    const qIn = el('input', { type: 'range', min: 1, max: 40, value: prate, 'aria-label': 'Writes per second on the key' });
    rIn.addEventListener('input', () => { pr = +rIn.value; pPaint(); });
    tIn.addEventListener('input', () => { prtt = +tIn.value; pPaint(); });
    qIn.addEventListener('input', () => { prate = +qIn.value; pPaint(); });
    root.append(pTitle, el('div', { class: 'w-controls' },
      el('label', null, 'Read level ', rOut, rIn), el('label', null, 'RTT ', tOut, tIn), el('label', null, 'Writes/s ', qOut, qIn)));
    const PW = narrow ? 360 : 560, PH = 128;
    const PS = svg('svg', { viewBox: `0 0 ${PW} ${PH}`, role: 'img', 'aria-label': 'Latency versus staleness bars' });
    const barX = narrow ? 8 : 150, barW = PW - barX - 8;
    function bar(y, label) {
      const lab = svg('text', { x: narrow ? 8 : 140, y: narrow ? y - 6 : y + 17, 'text-anchor': narrow ? 'start' : 'end', fill: 'var(--text-2)', style: `font:600 ${F.r}px var(--sans)`, text: label });
      const bg = svg('rect', { x: barX, y, width: barW, height: 24, rx: 6, fill: 'var(--surface-2)', stroke: 'var(--border)' });
      const fg = svg('rect', { x: barX, y, width: 0, height: 24, rx: 6, style: 'transition:width .3s' });
      const val = svg('text', { x: barX + 8, y: y + 17, fill: 'var(--text)', style: `font:700 ${F.r}px var(--mono)` });
      PS.append(lab, bg, fg, val);
      return { fg, val };
    }
    const bLat = bar(narrow ? 22 : 14, 'Read latency');
    const bSt = bar(narrow ? 82 : 60, 'Stale-read chance');
    const pNote = svg('text', { x: PW / 2, y: narrow ? PH - 2 : PH - 16, 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:600 ${F.s}px var(--sans)` });
    if (!narrow) PS.append(pNote);
    const pStats = el('div', { class: 'w-stats' });
    root.append(el('div', { class: 'w-stage' }, PS), pStats);
    function pPaint() {
      const lvl = ['ONE', 'QUORUM', 'ALL'][pr - 1];
      rOut.textContent = lvl; tOut.textContent = prtt + ' ms'; qOut.textContent = prate;
      const lat = pr === 1 ? 1 : prtt + 1;                       // C is alone in the East: R ≥ 2 must cross the WAN
      const lagMs = prtt / 2 + 2;                                  // West write (W = 2) reaches C one-way later
      const stale = pr === 1 ? 1 - Math.exp(-prate * lagMs / 1000) : 0;   // P(a write landed in the last lag window)
      bLat.fg.setAttribute('width', Math.max(4, barW * Math.min(1, lat / 200)));
      bLat.fg.setAttribute('fill', lat < 10 ? 'var(--ok)' : lat < 80 ? 'var(--warn)' : 'var(--err)');
      bLat.val.textContent = '≈ ' + lat + ' ms';
      bSt.fg.setAttribute('width', Math.max(4, barW * stale));
      bSt.fg.setAttribute('fill', stale < 0.01 ? 'var(--ok)' : stale < 0.2 ? 'var(--warn)' : 'var(--err)');
      bSt.val.textContent = (stale * 100).toFixed(stale < 0.1 && stale > 0 ? 1 : 0) + '%';
      pNote.textContent = pr === 1 ? 'EL: answer from C now, maybe missing the last West write' : 'EC: wait one RTT for a West replica; R + W > N';
      pStats.innerHTML = '';
      [['choice', pr === 1 ? 'EL (latency)' : 'EC (consistency)'], ['R + W vs N', (pr + 2) + (pr + 2 > 3 ? ' > 3 overlap' : ' = 3 no overlap')], ['replication lag', '≈ ' + lagMs + ' ms']]
        .forEach(([k, v]) => pStats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
    pPaint();

    // ---- packets (animated messages) ----
    const pk = [];
    loopH = ctx.loop((dt) => {
      for (let i = pk.length - 1; i >= 0; i--) {
        const p = pk[i];
        p.t = Math.min(1, p.t + dt / p.dur);
        const k = p.blocked ? Math.min(p.t, 0.5) : p.t;
        const x = p.a[0] + (p.b[0] - p.a[0]) * k, y = p.a[1] + (p.b[1] - p.a[1]) * k;
        p.c.setAttribute('cx', x); p.c.setAttribute('cy', y);
        if (p.blocked && p.t >= 0.5 && !p.x) { p.x = svg('text', { x, y: y + 6, 'text-anchor': 'middle', fill: 'var(--err)', style: `font:800 ${F.t + 4}px var(--sans)`, text: '✗' }); gPk.append(p.x); p.c.remove(); }
        if (p.t >= 1) { pk.splice(i, 1); p.c.remove(); if (p.x) p.x.remove(); p.done(); }
      }
    });
    function send(a, b, color, blocked) {
      if (ctx.reduced || my !== gen) return Promise.resolve();
      return new Promise((done) => {
        const c = svg('circle', { r: 7, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 });
        gPk.append(c);
        pk.push({ a: P[a], b: P[b], t: 0, dur: 650, c, blocked, done });
      });
    }

    // ---- paint ----
    function paint() {
      cpB.className = 'btn' + (M.mode === 'cp' ? ' primary' : '');
      apB.className = 'btn' + (M.mode === 'ap' ? ' primary' : '');
      lwwB.className = 'btn' + (M.merge === 'lww' ? ' primary' : '');
      sibB.className = 'btn' + (M.merge === 'sib' ? ' primary' : '');
      cutB.textContent = M.cut ? '🔗 Heal network' : '✂ Cut network';
      cutLine.style.display = cutMark.style.display = M.cut ? '' : 'none';
      L.AB.setAttribute('stroke', 'var(--ok)');
      [L.AC, L.BC].forEach((l) => { l.setAttribute('stroke', M.cut ? 'var(--err)' : 'var(--ok)'); l.setAttribute('stroke-dasharray', M.cut ? '3 7' : ''); l.style.opacity = M.cut ? 0.5 : 1; });
      const front = frontier([].concat(M.reps.A, M.reps.B, M.reps.C));
      const max = Math.max(...front.map((v) => v.ts));
      ['A', 'B', 'C'].forEach((r) => {
        const vs = M.reps[r], b = box[r];
        const sib = vs.length > 1;
        const behind = !sib && front.length === 1 && vs[0].ts < max;
        const diverged = front.length > 1;
        const tone = sib ? 'var(--warn)' : diverged ? 'var(--warn)' : behind ? 'var(--text-3)' : 'var(--ok)';
        b.rect.setAttribute('fill', `color-mix(in srgb, ${tone} 12%, var(--surface))`);
        b.rect.setAttribute('stroke', tone);
        b.t1.textContent = 'Replica ' + r + (behind ? ' (behind)' : '');
        let line = sib ? vs.map((v) => v.items.join(',') || '∅').join(' | ') : (vs[0].items.join(', ') || 'empty cart');
        const maxc = narrow ? 18 : 22;
        if (line.length > maxc) line = line.slice(0, maxc - 1) + '…';
        b.t2.textContent = line;
        b.t3.textContent = sib ? '⚠ ' + vs.length + ' siblings' : vcText(vs[0].vc);
        b.t3.setAttribute('fill', sib ? 'var(--warn)' : 'var(--text-3)');
      });
      stats.innerHTML = '';
      const div = front.length > 1 ? 'yes (' + front.length + ' versions)' : 'no';
      [['mode', M.mode === 'cp' ? 'CP' : 'AP'], ['network', M.cut ? 'cut' : 'ok'], ['accepted', M.acc], ['refused', M.ref], ['diverged', div], ['hints', M.hints], ['lost by LWW', M.lost]]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); }

    // ---- actions ----
    function setMode(m) { M.mode = m; paint(); say(m === 'cp' ? 'Mode <b>CP</b>: an operation needs 2 of 3 replicas or it fails.' : 'Mode <b>AP</b>: an operation succeeds on any reachable replica (sloppy quorum + hints).'); }
    function setMerge(m) { M.merge = m; paint(); say('On heal, conflicts resolve by <b>' + (m === 'lww' ? 'last-write-wins (highest timestamp)' : 'keeping siblings and merging them (union)') + '</b>.'); }
    function cut() { M.cut = true; paint(); say('✂ <b>Partition.</b> West {A, B} and East {C} time out on each other. Each side only sees timeouts.'); }
    let busy = false;
    async function write(coord) {
      if (busy) return; busy = true;
      const side = coord === 'A' ? 'W' : 'E', name = side === 'W' ? 'West' : 'East';
      const rs = reach(coord);
      const others = ['A', 'B', 'C'].filter((r) => r !== coord);
      if (M.mode === 'cp' && rs.length < 2) {
        await Promise.all(others.map((o) => send(coord, o, 'var(--err)', true)));
        M.ref++; paint();
        say(`❌ ${name} write <b>refused</b>: ${coord} reaches ${rs.length} of 3 replicas, CP needs 2. Client gets an error.`);
        busy = false; return;
      }
      const base = M.reps[coord];
      const items = union(base);
      const next = POOL[side].find((x) => !items.includes(x)) || POOL[side][M.clock % POOL[side].length];
      const vc = {}; base.forEach((v) => Object.keys(v.vc).forEach((k) => { vc[k] = Math.max(vc[k] || 0, v.vc[k]); }));
      vc[coord] = (vc[coord] || 0) + 1;
      const v = { items: items.includes(next) ? items : items.concat([next]), vc, ts: ++M.clock };
      put(coord, v); paint();
      await Promise.all(others.map((o) => send(coord, o, rs.includes(o) ? 'var(--accent)' : 'var(--err)', !rs.includes(o))));
      rs.forEach((r) => put(r, v));
      const missed = others.filter((o) => !rs.includes(o));
      if (missed.length && M.mode === 'ap') M.hints += missed.length;
      M.acc++; paint();
      say(`✅ ${name} adds <b>${next}</b> → ${cartText(v.items)} ts=${v.ts}, acked by ${rs.join(', ')}` + (missed.length ? (rs.length < 2 ? ' (<b>sloppy quorum</b>: alone)' : '') + `; ${missed.join(', ')} unreachable` + (M.mode === 'cp' ? ', repaired on heal' : ', hint kept') : '') + '.');
      busy = false;
    }
    async function read(coord) {
      if (busy) return;
      const name = coord === 'A' ? 'West' : 'East';
      const rs = reach(coord);
      if (M.mode === 'cp' && rs.length < 2) { M.ref++; paint(); say(`❌ ${name} read <b>refused</b>: cannot reach a read quorum (R = 2).`); return; }
      const from = M.mode === 'cp' ? [coord, rs.find((r) => r !== coord)] : [coord];
      const vs = frontier([].concat(...from.map((r) => M.reps[r])));
      const all = frontier([].concat(M.reps.A, M.reps.B, M.reps.C));
      const fresh = vs.length === all.length && vs.every((v) => all.some((x) => same(x.vc, v.vc)));
      say(`📖 ${name} reads from ${from.join(' + ')}: ` + vs.map((v) => cartText(v.items)).join(' and ') + (vs.length > 1 ? ' (<b>siblings</b>, app must merge)' : '') + (fresh ? '' : ' ⚠ <b>stale</b>: the other side has newer data.'));
    }
    async function heal() {
      if (busy) return; busy = true;
      M.cut = false; paint();
      say('🔗 <b>Network healed.</b> Hints replay; anti-entropy compares replicas.');
      await Promise.all([send('B', 'C', 'var(--accent)'), send('C', 'A', 'var(--accent)')]);
      const all = [].concat(M.reps.A, M.reps.B, M.reps.C);
      let front = frontier(all);
      M.hints = 0;
      if (front.length > 1 && M.merge === 'lww') {
        const win = front.reduce((a, b) => (b.ts > a.ts ? b : a));
        const lost = union(front).filter((x) => !win.items.includes(x));
        M.lost += lost.length;
        const vc = {}; front.forEach((v) => Object.keys(v.vc).forEach((k) => { vc[k] = Math.max(vc[k] || 0, v.vc[k]); }));
        const v = { items: win.items, vc, ts: win.ts };
        ['A', 'B', 'C'].forEach((r) => { M.reps[r] = [v]; });
        say(`⚖ <b>LWW</b> keeps ts=${win.ts} ${cartText(win.items)}. Silently <b>lost</b>: ${lost.length ? lost.join(', ') : 'nothing'}.`);
      } else if (front.length > 1) {
        ['A', 'B', 'C'].forEach((r) => { M.reps[r] = front.slice(); });
        paint();
        say(`🌿 <b>Siblings kept</b> on every replica: ${front.map((v) => cartText(v.items) + ' ' + vcText(v.vc)).join(' ‖ ')}. Neither clock dominates, so they are concurrent.`);
        await new Promise((r) => setTimeout(r, ctx.reduced ? 0 : 1100));
        if (my !== gen) { busy = false; return; }
        const vc = {}; front.forEach((v) => Object.keys(v.vc).forEach((k) => { vc[k] = Math.max(vc[k] || 0, v.vc[k]); }));
        vc.A = (vc.A || 0) + 1;
        const v = { items: union(front), vc, ts: ++M.clock };
        ['A', 'B', 'C'].forEach((r) => put(r, v));
        say(`🤝 Client reads both siblings, merges by union → ${cartText(v.items)} ${vcText(v.vc)}, writes it back. Nothing lost (a removed item could come back, though).`);
      } else {
        ['A', 'B', 'C'].forEach((r) => { M.reps[r] = front.slice(); });
        say('✅ No conflict: one side never wrote, so the lagging replica just catches up.');
      }
      paint(); busy = false;
    }

    paint();
    if (my === gen && !log.children.length) say('Try: <b>Cut</b> → <b>+ item East</b> in CP (refused) → switch to <b>AP</b> → add on both sides → <b>Heal</b>.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
