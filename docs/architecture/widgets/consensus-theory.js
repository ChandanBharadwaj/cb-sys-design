/* Raft on 5 nodes: randomised election timeouts, RequestVote (up-to-date check), AppendEntries
   (prev-entry consistency check, conflict truncation), commit = majority match on a current-term entry.
   Tap a node to kill/revive it; Partition isolates the leader with one follower. Plus a quorum-overlap checker. */
SD.widget('consensus-theory', function (root, ctx) {
  const { el, svg } = ctx;
  const N = 5, MAJ = 3, HB = 60, LAT = [28, 50], ET = [200, 380], SPEED = 0.3;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const S = { nodes: [], msgs: [], now: 0, groupA: null, paused: false, cmd: 0 };
  function reset() {
    S.now = 0; S.msgs = []; S.groupA = null; S.cmd = 0;
    S.nodes = Array.from({ length: N }, (_, i) => ({ id: i, alive: true, role: 'F', term: 1, voted: null, log: [], commit: 0,
      deadline: i === 0 ? 120 : rnd(...ET) + 150, votes: new Set(), next: [], match: [], hbAt: 0 }));
  }
  reset();
  const lastIdx = (n) => n.log.length, lastTerm = (n) => (n.log.length ? n.log[n.log.length - 1].term : 0);
  const conn = (a, b) => !S.groupA || S.groupA.has(a) === S.groupA.has(b);
  const name = (i) => 'n' + (i + 1);
  let say = () => {};
  function send(from, to, m) { if (S.nodes[from].alive) S.msgs.push({ from, to, m, t0: S.now, t1: S.now + rnd(...LAT) }); }
  function stepDown(n, term) { n.term = term; n.role = 'F'; n.voted = null; }
  function becomeLeader(n) {
    n.role = 'L'; n.next = Array(N).fill(lastIdx(n) + 1); n.match = Array(N).fill(0);
    n.log.push({ term: n.term, v: 'noop' }); n.match[n.id] = lastIdx(n); n.hbAt = 0;
    say(`👑 <b>${name(n.id)}</b> wins term <b>${n.term}</b> with ${n.votes.size} of 5 votes and appends a no-op to commit earlier entries.`);
  }
  function startElection(n) {
    n.term++; n.role = 'C'; n.voted = n.id; n.votes = new Set([n.id]); n.deadline = S.now + rnd(...ET);
    say(`⏱ ${name(n.id)} timed out → candidate for term <b>${n.term}</b>.`);
    for (let p = 0; p < N; p++) if (p !== n.id) send(n.id, p, { t: 'RV', term: n.term, li: lastIdx(n), lt: lastTerm(n) });
  }
  function sendAE(n, p) {
    const prev = n.next[p] - 1;
    send(n.id, p, { t: 'AE', term: n.term, prev, pt: prev > 0 ? n.log[prev - 1].term : 0, ents: n.log.slice(prev, prev + 4).map((e) => ({ ...e })), commit: n.commit });
  }
  function advance(n) {
    for (let i = lastIdx(n); i > n.commit; i--) {
      if (n.log[i - 1].term !== n.term) break;
      if (n.match.filter((x, k) => k === n.id ? lastIdx(n) >= i : x >= i).length >= MAJ) { say(`✅ ${name(n.id)} commits up to entry <b>${i}</b> (stored on a majority).`); n.commit = i; break; }
    }
  }
  function handle(n, from, m) {
    if (m.term > n.term) stepDown(n, m.term);
    if (m.t === 'RV') {
      const upToDate = m.lt > lastTerm(n) || (m.lt === lastTerm(n) && m.li >= lastIdx(n));
      const ok = m.term === n.term && (n.voted === null || n.voted === from) && upToDate;
      if (ok) { n.voted = from; n.deadline = S.now + rnd(...ET); }
      send(n.id, from, { t: 'RVR', term: n.term, ok });
    } else if (m.t === 'RVR') {
      if (n.role === 'C' && m.term === n.term && m.ok) { n.votes.add(from); if (n.votes.size >= MAJ) becomeLeader(n); }
    } else if (m.t === 'AE') {
      if (m.term < n.term) { send(n.id, from, { t: 'AER', term: n.term, ok: false, match: 0 }); return; }
      if (n.role !== 'F') n.role = 'F';
      n.deadline = S.now + rnd(...ET);
      if (m.prev > lastIdx(n) || (m.prev > 0 && n.log[m.prev - 1].term !== m.pt)) { send(n.id, from, { t: 'AER', term: n.term, ok: false, match: 0 }); return; }
      m.ents.forEach((e, k) => {
        const i = m.prev + 1 + k;
        if (n.log[i - 1] && n.log[i - 1].term !== e.term) n.log.length = i - 1;   // conflict: truncate
        if (!n.log[i - 1]) n.log.push(e);
      });
      const mi = m.prev + m.ents.length;
      n.commit = Math.max(n.commit, Math.min(m.commit, mi));
      send(n.id, from, { t: 'AER', term: n.term, ok: true, match: mi });
    } else if (m.t === 'AER') {
      if (n.role !== 'L' || m.term !== n.term) return;
      if (m.ok) { n.match[from] = Math.max(n.match[from], m.match); n.next[from] = n.match[from] + 1; advance(n); }
      else n.next[from] = Math.max(1, n.next[from] - 1);
    }
  }
  function tick(dt) {
    S.now += dt;
    for (let i = S.msgs.length - 1; i >= 0; i--) {
      const x = S.msgs[i];
      if (S.now < x.t1) continue;
      S.msgs.splice(i, 1);
      const r = S.nodes[x.to];
      if (r.alive && conn(x.from, x.to)) handle(r, x.from, x.m);
    }
    S.nodes.forEach((n) => {
      if (!n.alive) return;
      if (n.role === 'L') { if (S.now >= n.hbAt) { for (let p = 0; p < N; p++) if (p !== n.id) sendAE(n, p); n.hbAt = S.now + HB; } }
      else if (S.now >= n.deadline) startElection(n);
    });
  }
  // ---- actions ----
  function write() {
    const ls = S.nodes.filter((n) => n.alive && n.role === 'L');
    if (!ls.length) { say('❌ No node believes it is leader right now: the write is refused (election in progress).'); return; }
    const v = 'c' + (++S.cmd);
    ls.forEach((n) => { n.log.push({ term: n.term, v }); say(`✍ ${name(n.id)} (term ${n.term}) appends <b>${v}</b> at index ${lastIdx(n)}` + (ls.length > 1 ? ' (one of ' + ls.length + ' would-be leaders)' : '') + '.'); });
  }
  function toggle(i) {
    const n = S.nodes[i];
    n.alive = !n.alive;
    if (n.alive) { n.role = 'F'; n.deadline = S.now + rnd(...ET); say(`🔌 ${name(i)} restarts with its saved term ${n.term} and log.`); }
    else { S.msgs = S.msgs.filter((x) => x.from !== i); say(`💥 ${name(i)} crashed` + (n.role === 'L' ? ' (it was leader)' : '') + '.'); }
  }
  function partition() {
    if (S.groupA) { S.groupA = null; say('🔗 Partition healed.'); return; }
    const L = S.nodes.find((n) => n.alive && n.role === 'L') || S.nodes[0];
    S.groupA = new Set([L.id, (L.id + 1) % N]);
    say(`✂ Partition: {${[...S.groupA].map(name).join(', ')}} cut off from the other three. Write now and watch which side commits.`);
  }

  // ---- layout ----
  let gen = 0, loopH = null;
  function build(narrow) {
    const my = ++gen;
    if (loopH) loopH.stop();
    root.innerHTML = '';
    const W = narrow ? 360 : 620, H = narrow ? 500 : 330;
    const C = narrow ? { x: 180, y: 150, r: 108 } : { x: 160, y: 168, r: 118 };
    const R = narrow ? 36 : 38, F = narrow ? { a: 15, b: 13.5 } : { a: 15, b: 13 };
    const LG = narrow ? { x0: 46, y0: 310, row: 36, cell: 26, gap: 3, max: 10 } : { x0: 360, y0: 70, row: 50, cell: 22, gap: 3, max: 10 };
    const pos = Array.from({ length: N }, (_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [C.x + C.r * Math.cos(a), C.y + C.r * Math.sin(a)]; });
    const btn = (t, fn, cls) => { const b = el('button', { class: 'btn' + (cls ? ' ' + cls : ''), text: t }); b.addEventListener('click', fn); return b; };
    const pB = btn('✂ Partition', () => { partition(); });
    const zB = btn('⏸ Pause', () => { S.paused = !S.paused; zB.textContent = S.paused ? '▶ Run' : '⏸ Pause'; });
    root.append(el('div', { class: 'w-controls' },
      btn('✍ Client write', write, 'primary'), pB, zB,
      btn('↺ Reset', () => { reset(); log.innerHTML = ''; say('Reset: all followers in term 1, empty logs.'); })));
    const stage = el('div', { class: 'w-stage' });
    const Sv = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Five Raft nodes and their logs' });
    const gL = svg('g'), gM = svg('g'), gN = svg('g'), gLog = svg('g');
    Sv.append(gL, gM, gN, gLog); stage.append(Sv); root.append(stage);
    stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Tap a node to <b>kill / revive</b> it. Dots: <span style="color:var(--warn)">●</span> vote request, <span style="color:var(--accent)">●</span> append / heartbeat, <span style="color:var(--ok)">●</span> reply. Log cells show the <b>term</b>; faded with dashed border = not yet committed on that node.' }));
    const stats = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);
    say = (t) => { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); };
    // links
    const links = [];
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) { const l = svg('line', { x1: pos[a][0], y1: pos[a][1], x2: pos[b][0], y2: pos[b][1], 'stroke-width': 2 }); gL.append(l); links.push([a, b, l]); }
    // nodes
    const nv = pos.map(([x, y], i) => {
      const g = svg('g', { style: 'cursor:pointer' });
      const c = svg('circle', { cx: x, cy: y, r: R, 'stroke-width': 3 });
      const t1 = svg('text', { x, y: y - 4, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${F.a}px var(--sans)` });
      const t2 = svg('text', { x, y: y + 15, 'text-anchor': 'middle', fill: 'var(--text-2)', style: `font:600 ${F.b}px var(--mono)` });
      g.append(c, t1, t2); g.addEventListener('click', () => toggle(i)); gN.append(g);
      return { c, t1, t2 };
    });
    gLog.append(svg('text', { x: narrow ? 8 : LG.x0 - 40, y: LG.y0 - 14, fill: 'var(--text-3)', style: `font:700 ${F.b}px var(--sans)`, text: 'LOGS (index →, cell = term)' }));
    const rows = S.nodes.map((_, i) => {
      const y = LG.y0 + i * LG.row;
      gLog.append(svg('text', { x: LG.x0 - 8, y: y + LG.cell * 0.7, 'text-anchor': 'end', fill: 'var(--text-2)', style: `font:700 ${F.b}px var(--sans)`, text: name(i) }));
      const cells = Array.from({ length: LG.max }, (_, k) => {
        const x = LG.x0 + k * (LG.cell + LG.gap);
        const r = svg('rect', { x, y, width: LG.cell, height: LG.cell, rx: 4 });
        const t = svg('text', { x: x + LG.cell / 2, y: y + LG.cell * 0.7, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${narrow ? 13 : 12.5}px var(--mono)` });
        gLog.append(r, t); return { r, t };
      });
      return cells;
    });
    const hue = (t) => `hsl(${(t * 67 + 190) % 360} 60% 55%)`;
    function paint() {
      const L = S.nodes.filter((n) => n.alive && n.role === 'L').sort((a, b) => b.term - a.term)[0];
      links.forEach(([a, b, l]) => { const cut = !conn(a, b); l.setAttribute('stroke', cut ? 'var(--err)' : 'var(--border)'); l.setAttribute('stroke-dasharray', cut ? '4 6' : ''); l.style.opacity = (S.nodes[a].alive && S.nodes[b].alive) ? 1 : 0.25; });
      S.nodes.forEach((n, i) => {
        const v = nv[i];
        const tone = !n.alive ? 'var(--err)' : n.role === 'L' ? 'var(--accent)' : n.role === 'C' ? 'var(--warn)' : 'var(--text-3)';
        v.c.setAttribute('fill', `color-mix(in srgb, ${tone} ${n.role === 'L' && n.alive ? 26 : 12}%, var(--surface))`);
        v.c.setAttribute('stroke', tone);
        v.t1.textContent = name(i) + ' ' + (!n.alive ? '✗' : n.role === 'L' ? '👑' : n.role === 'C' ? '?' : '');
        v.t2.textContent = 'T' + n.term + (n.alive && n.role === 'F' && n.voted !== null ? '→' + name(n.voted) : '');
      });
      const maxLen = Math.max(...S.nodes.map(lastIdx));
      const off = Math.max(0, maxLen - LG.max);
      S.nodes.forEach((n, i) => rows[i].forEach((c, k) => {
        const e = n.log[off + k];
        if (!e) { c.r.setAttribute('fill', 'none'); c.r.setAttribute('stroke', 'var(--border)'); c.r.setAttribute('stroke-dasharray', '2 3'); c.r.style.opacity = 0.6; c.t.textContent = ''; return; }
        const done = off + k + 1 <= n.commit;
        c.r.setAttribute('fill', hue(e.term)); c.r.setAttribute('stroke', done ? 'var(--text)' : hue(e.term));
        c.r.setAttribute('stroke-dasharray', done ? '' : '3 2'); c.r.style.opacity = done ? 1 : 0.45; c.t.textContent = e.term;
      }));
      gM.innerHTML = '';
      if (!ctx.reduced) S.msgs.forEach((x) => {
        const k = Math.min(1, (S.now - x.t0) / (x.t1 - x.t0));
        const a = pos[x.from], b = pos[x.to];
        const col = x.m.t === 'RV' ? 'var(--warn)' : x.m.t === 'AE' ? 'var(--accent)' : 'var(--ok)';
        const cut = !conn(x.from, x.to) && k > 0.5;
        gM.append(svg('circle', { cx: a[0] + (b[0] - a[0]) * k, cy: a[1] + (b[1] - a[1]) * k, r: 5, fill: cut ? 'var(--err)' : col, opacity: cut ? 0.4 : 1 }));
      });
      stats.innerHTML = '';
      const alive = S.nodes.filter((n) => n.alive).length;
      [['leader', L ? name(L.id) + ' (term ' + L.term + ')' : 'none'], ['commit index', L ? L.commit : '–'], ['alive', alive + ' of 5'], ['majority', '3 of 5'], ['partition', S.groupA ? 'yes' : 'no'], ['offset', off ? 'showing from ' + (off + 1) : '1']]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
    let acc = 0;
    loopH = ctx.loop((dt) => {
      if (my !== gen) return;
      if (!S.paused) { const d = Math.min(dt, 100) * SPEED; tick(d); }
      acc += dt; if (acc > 40 || ctx.reduced) { acc = 0; paint(); }
    });
    paint();
    if (!log.children.length) say('Watch n1 win the first election, then: <b>Client write</b> a few times → tap the leader to kill it → see a new term → <b>Partition</b> and write again.');

    // ---- quorum overlap checker ----
    root.append(el('p', { style: { margin: '16px 0 6px', fontWeight: '700' }, text: 'Quorum overlap check (N replicas, write quorum W, read quorum R)' }));
    const qs = { n: 5, w: 3, r: 3 };
    const outs = {};
    const ctl = el('div', { class: 'w-controls' });
    ['n', 'w', 'r'].forEach((k) => {
      outs[k] = el('b');
      const inp = el('input', { type: 'range', min: 1, max: 9, value: qs[k], 'aria-label': k.toUpperCase() });
      inp.addEventListener('input', () => { qs[k] = +inp.value; qPaint(); });
      ctl.append(el('label', null, k.toUpperCase() + ' ', outs[k], inp));
    });
    const qStats = el('div', { class: 'w-stats' });
    const qMsg = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '14px' } });
    root.append(ctl, qStats, qMsg);
    function qPaint() {
      const n = qs.n, w = Math.min(qs.w, n), r = Math.min(qs.r, n);
      Object.keys(outs).forEach((k) => { outs[k].textContent = { n, w, r }[k]; });
      const rw = r + w - n, ww = 2 * w - n;
      qStats.innerHTML = '';
      [['read ∩ write ≥', Math.max(0, rw) + (rw > 0 ? ' ✓' : ' ✗')], ['write ∩ write ≥', Math.max(0, ww) + (ww > 0 ? ' ✓' : ' ✗')], ['writes survive', (n - w) + ' down'], ['reads survive', (n - r) + ' down']]
        .forEach(([k, v]) => qStats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
      qMsg.innerHTML = rw > 0 && ww > 0 ? `✅ Any read set meets any write set (R + W = ${r + w} &gt; ${n}) and two writes cannot both succeed on disjoint sets (2W &gt; N). Raft uses W = R = majority = ${Math.floor(n / 2) + 1}.`
        : rw > 0 ? `⚠ Reads see the latest write, but <b>2W ≤ N</b>: two concurrent writes can be acknowledged by disjoint sets, so you need versions or consensus to order them.`
        : `❌ <b>R + W ≤ N</b>: a read set can miss every replica that holds the last write. Stale reads are possible even with no failures.`;
    }
    qPaint();
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
