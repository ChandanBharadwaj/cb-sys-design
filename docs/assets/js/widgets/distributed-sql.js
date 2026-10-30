/* Two mini-sims: TrueTime commit wait (interval clocks, real 2ε wait math) and Raft leader election (randomized timeouts, terms, majority votes). */
SD.widget('distributed-sql', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 440, H = 312;
  let mode = 'tt';
  const T = (x, y, t, o) => svg('text', Object.assign({ x, y, 'text-anchor': 'middle', fill: 'var(--text)', style: 'font:600 13px var(--sans)', text: t }, o || {}));

  const ttBtn = el('button', { class: 'btn primary', text: 'TrueTime' });
  const rfBtn = el('button', { class: 'btn', text: 'Raft election' });
  const modeBar = el('div', { class: 'w-controls' }, ttBtn, rfBtn);
  const ctlTT = el('div', { class: 'w-controls' });
  const ctlRF = el('div', { class: 'w-controls', style: { display: 'none' } });
  root.append(modeBar, ctlTT, ctlRF);
  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Distributed SQL simulation' });
  const gTT = svg('g'), gRF = svg('g', { style: 'display:none' });
  S_.append(gTT, gRF);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function setStats(o) { stats.innerHTML = ''; Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  function setMode(m) {
    mode = m;
    ttBtn.classList.toggle('primary', m === 'tt'); rfBtn.classList.toggle('primary', m === 'rf');
    ctlTT.style.display = m === 'tt' ? '' : 'none'; ctlRF.style.display = m === 'rf' ? '' : 'none';
    gTT.style.display = m === 'tt' ? '' : 'none'; gRF.style.display = m === 'rf' ? '' : 'none';
    if (m === 'tt') ttStats(); else rfStats();
  }
  ttBtn.onclick = () => setMode('tt'); rfBtn.onclick = () => setMode('rf');

  /* ---------------- TrueTime ---------------- */
  let eps = 4, wait = true, worst = true, tt = null;
  const epsOut = el('b', { text: eps + ' ms' });
  const epsIn = el('input', { type: 'range', min: 1, max: 10, value: eps, 'aria-label': 'epsilon' });
  epsIn.addEventListener('input', () => { eps = +epsIn.value; epsOut.textContent = eps + ' ms'; });
  const waitBtn = el('button', { class: 'btn', text: 'Commit wait: on' });
  waitBtn.onclick = () => { wait = !wait; waitBtn.textContent = 'Commit wait: ' + (wait ? 'on' : 'off'); };
  const skewBtn = el('button', { class: 'btn', text: 'Skew: worst case' });
  skewBtn.onclick = () => { worst = !worst; skewBtn.textContent = 'Skew: ' + (worst ? 'worst case' : 'random'); };
  const runBtn = el('button', { class: 'btn primary', text: '▶ Run T1 then T2' });
  runBtn.onclick = () => runTT();
  ctlTT.append(runBtn, waitBtn, skewBtn, el('label', null, 'ε ', epsOut, epsIn));

  const X0 = 24, X1 = 420, ROW_A = 78, ROW_B = 196;
  function runTT() {
    const offA = worst ? 0.9 * eps : (Math.random() * 2 - 1) * eps;
    const offB = worst ? -0.9 * eps : (Math.random() * 2 - 1) * eps;
    const t0 = 2 * eps + 1;                       // true time T1 asks for its commit timestamp
    const s1 = t0 + offA + eps;                   // s = TT.now().latest on node A
    const ack = wait ? t0 + 2 * eps : t0;         // wait until TT.now().earliest > s  <=>  t > t0 + 2ε
    const t1 = ack + 0.5;                         // T2 starts on node B after the client saw T1's ack
    const s2 = t1 + offB + eps;
    const tmax = t1 + 2 * eps + 2;
    tt = { offA, offB, t0, s1, ack, t1, s2, tmax, t: ctx.reduced ? tmax : 0, eps, wait };
    say(`T1 on node A (clock ${fmtS(offA)} ms), T2 on node B (clock ${fmtS(offB)} ms), ε = ${eps} ms, commit wait ${wait ? 'on' : 'off'}.`);
    tt.done = false; drawTT();
  }
  const fmtS = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
  const xs = (t) => X0 + (t / tt.tmax) * (X1 - X0);
  function drawTT() {
    gTT.innerHTML = '';
    if (!tt) {
      gTT.append(T(W / 2, 120, 'Each node knows time only as [earliest, latest].', { style: 'font:700 15px var(--sans)' }),
        T(W / 2, 150, 'Press ▶ Run to commit T1 on node A,', { fill: 'var(--text-3)', style: 'font:600 15px var(--sans)' }),
        T(W / 2, 174, 'then start T2 on node B after the ack.', { fill: 'var(--text-3)', style: 'font:600 15px var(--sans)' }));
      return;
    }
    const t = tt.t;
    gTT.append(svg('line', { x1: X0, x2: X1, y1: 262, y2: 262, stroke: 'var(--border)', 'stroke-width': 1.5 }));
    for (let k = 0; k <= tt.tmax; k += tt.tmax > 40 ? 10 : 5) {
      gTT.append(svg('line', { x1: xs(k), x2: xs(k), y1: 258, y2: 266, stroke: 'var(--text-3)' }), T(xs(k), 284, k + '', { style: 'font:600 14px var(--mono)', fill: 'var(--text-3)' }));
    }
    gTT.append(T(X1, 306, 'true time (ms)', { 'text-anchor': 'end', style: 'font:600 14px var(--sans)', fill: 'var(--text-3)' }));
    gTT.append(T(X0, ROW_A - 44, 'Node A · T1', { 'text-anchor': 'start', style: 'font:700 15px var(--sans)' }), T(X0, ROW_B - 44, 'Node B · T2', { 'text-anchor': 'start', style: 'font:700 15px var(--sans)' }));
    function interval(row, tc, off, sVal, label, color) {
      const a = tc + off - tt.eps, b = tc + off + tt.eps;
      gTT.append(svg('rect', { x: xs(a), y: row - 12, width: Math.max(2, xs(b) - xs(a)), height: 24, rx: 5, fill: `color-mix(in srgb, ${color} 25%, var(--surface))`, stroke: color }));
      gTT.append(svg('circle', { cx: xs(tc), cy: row, r: 4, fill: 'var(--text)' }));
      gTT.append(svg('line', { x1: xs(sVal), x2: xs(sVal), y1: row - 22, y2: 258, stroke: color, 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
      gTT.append(T(Math.min(X1 - 40, Math.max(X0 + 40, xs(sVal))), row - 26, label + ' = ' + sVal.toFixed(1), { style: 'font:700 15px var(--mono)', fill: color }));
    }
    if (t >= tt.t0) interval(ROW_A, tt.t0, tt.offA, tt.s1, 's1', 'var(--accent)');
    if (tt.wait && t >= tt.t0) {
      const e = Math.min(t, tt.ack);
      gTT.append(svg('rect', { x: xs(tt.t0), y: ROW_A + 18, width: Math.max(1, xs(e) - xs(tt.t0)), height: 12, rx: 3, fill: 'var(--warn)' }));
    }
    if (t >= tt.t0) gTT.append(T(xs(tt.t0), ROW_A + 50, tt.wait ? (t >= tt.ack ? 'waited 2ε → ack ✓' : 'commit wait…') : 'ack at once (no wait)', { 'text-anchor': 'start', style: 'font:700 14px var(--sans)', fill: tt.wait ? 'var(--warn)' : 'var(--text-3)' }));
    if (t >= tt.t1) interval(ROW_B, tt.t1, tt.offB, tt.s2, 's2', tt.s2 > tt.s1 ? 'var(--ok)' : 'var(--err)');
    gTT.append(svg('line', { x1: xs(Math.min(t, tt.tmax)), x2: xs(Math.min(t, tt.tmax)), y1: 40, y2: 262, stroke: 'var(--text-3)', 'stroke-width': 1 }));
    if (t >= tt.tmax && !tt.done) {
      tt.done = true;
      const ok = tt.s2 > tt.s1;
      say(ok ? `✅ s2 (${tt.s2.toFixed(1)}) &gt; s1 (${tt.s1.toFixed(1)}). T2 started after T1 committed and is ordered after it: <b>external consistency holds</b>.`
        : `❌ s2 (${tt.s2.toFixed(1)}) &lt; s1 (${tt.s1.toFixed(1)}). T2 started <i>after</i> T1\'s ack but got an earlier timestamp. A snapshot read at s2 would miss T1.`);
      ttStats();
    }
  }
  function ttStats() {
    if (!tt) { setStats({ 'ε': eps + ' ms', 'commit wait': wait ? '2ε = ' + 2 * eps + ' ms' : 'off' }); return; }
    setStats({ 'ε': tt.eps + ' ms', 'wait': tt.wait ? (2 * tt.eps) + ' ms' : '0 ms', 's1': tt.s1.toFixed(1), 's2': tt.s2.toFixed(1), 'order': tt.done ? (tt.s2 > tt.s1 ? 'correct ✓' : 'violated ✗') : '…' });
  }

  /* ---------------- Raft ---------------- */
  const N = 5, CX = 220, CY = 150, R = 104, HB = 50;
  let nodes, msgs, now, noQuorum = false;
  const killBtn = el('button', { class: 'btn primary', text: '✖ Kill leader' });
  const revBtn = el('button', { class: 'btn', text: '↺ Revive all' });
  ctlRF.append(killBtn, revBtn, el('label', null, 'Tap a node to kill or revive it'));
  const gEdges = svg('g'), gMsg = svg('g'), gNodes = svg('g');
  gRF.append(gEdges, gMsg, gNodes, T(W / 2, H - 4, 'timeouts 150–300 ms · heartbeats 50 ms · slow motion', { style: 'font:600 13px var(--sans)', fill: 'var(--text-3)' }));
  const rnd = () => 150 + Math.random() * 150;
  function resetRaft() {
    now = 0; msgs = [];
    nodes = Array.from({ length: N }, (_, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / N;
      return { id: i + 1, x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) * 0.95, alive: true, state: 'follower', term: 1, voted: null, votes: 0, deadline: rnd(), timeout: 0, lastHb: 0 };
    });
    nodes.forEach((n) => { n.timeout = n.deadline; });
    nodes[0].state = 'leader'; nodes[0].voted = 1;
    nodes.forEach((n) => { n.voted = 1; });
    buildNodes();
  }
  function buildNodes() {
    gNodes.innerHTML = ''; gEdges.innerHTML = '';
    nodes.forEach((a, i) => nodes.forEach((b, j) => { if (j > i) gEdges.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: 'var(--border)', 'stroke-dasharray': '3 4' })); }));
    nodes.forEach((n) => {
      n.ring = svg('circle', { cx: n.x, cy: n.y, r: 34, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 4, transform: `rotate(-90 ${n.x} ${n.y})` });
      n.body = svg('circle', { cx: n.x, cy: n.y, r: 28, 'stroke-width': 2 });
      n.t1 = T(n.x, n.y - 2, 'N' + n.id, { style: 'font:700 16px var(--sans)' });
      n.t2 = T(n.x, n.y + 16, '', { style: 'font:600 13px var(--mono)' });
      n.t3 = T(n.x, n.y + (n.y > CY ? 56 : -42), '', { style: 'font:700 14px var(--sans)' });
      const g = svg('g', { style: 'cursor:pointer' }, n.ring, n.body, n.t1, n.t2, n.t3);
      g.addEventListener('click', () => toggle(n));
      gNodes.append(g);
    });
  }
  function toggle(n) {
    n.alive = !n.alive;
    if (n.alive) { n.state = 'follower'; n.deadline = now + rnd(); n.timeout = n.deadline - now; say(`N${n.id} restarts as a follower (term ${n.term}).`); }
    else say(`N${n.id} ${n.state === 'leader' ? '(the leader) ' : ''}crashes.`);
    rfStats();
  }
  killBtn.onclick = () => { const l = nodes.find((n) => n.alive && n.state === 'leader'); if (l) toggle(l); else say('No leader to kill right now.'); };
  revBtn.onclick = () => { nodes.forEach((n) => { if (!n.alive) toggle(n); }); };
  function send(from, to, type, extra) {
    msgs.push(Object.assign({ from, to, type, term: from.term, t0: now, dur: 18 + Math.random() * 10 }, extra || {}));
  }
  function becomeCandidate(n) {
    n.term++; n.state = 'candidate'; n.voted = n.id; n.votes = 1;
    n.deadline = now + rnd(); n.timeout = n.deadline - now;
    say(`N${n.id} timed out → <b>candidate</b> for term ${n.term}, asks for votes.`);
    nodes.forEach((m) => { if (m !== n) send(n, m, 'vote?'); });
  }
  function deliver(m) {
    const n = m.to; if (!n.alive) return;
    if (m.term > n.term) { n.term = m.term; n.state = 'follower'; n.voted = null; }
    if (m.type === 'hb') {
      if (m.term >= n.term) { n.state = 'follower'; n.deadline = now + rnd(); }
    } else if (m.type === 'vote?') {
      const grant = m.term === n.term && (n.voted === null || n.voted === m.from.id);
      if (grant) { n.voted = m.from.id; n.deadline = now + rnd(); }
      send(n, m.from, grant ? 'yes' : 'no');
    } else if (m.type === 'yes' && n.state === 'candidate' && m.term === n.term) {
      n.votes++;
      if (n.votes > N / 2) { n.state = 'leader'; n.lastHb = -1e9; say(`✅ N${n.id} wins ${n.votes} of ${N} votes → <b>leader</b> of term ${n.term}.`); }
    }
  }
  function stepRaft(dt) {
    now += dt;
    const due = msgs.filter((m) => now - m.t0 >= m.dur);
    msgs = msgs.filter((m) => now - m.t0 < m.dur);
    due.forEach((m) => { if (m.from.alive || m.type !== 'hb') deliver(m); });
    const alive = nodes.filter((x) => x.alive).length;
    if (alive > N / 2) noQuorum = false;
    else if (!noQuorum) { noQuorum = true; say(`⚠ Only ${alive} of ${N} replicas alive: no candidate can collect 3 votes, so the range is <b>unavailable</b>.`); }
    nodes.forEach((n) => {
      if (!n.alive) return;
      if (n.state === 'leader') { if (now - n.lastHb >= HB) { n.lastHb = now; nodes.forEach((m) => { if (m !== n) send(n, m, 'hb'); }); } }
      else if (now >= n.deadline) becomeCandidate(n);
      n.timeout = Math.max(0, n.deadline - now);
    });
  }
  function paintRaft() {
    gMsg.innerHTML = '';
    msgs.forEach((m) => {
      const k = Math.min(1, (now - m.t0) / m.dur);
      const x = m.from.x + (m.to.x - m.from.x) * k, y = m.from.y + (m.to.y - m.from.y) * k;
      const c = m.type === 'hb' ? 'var(--accent)' : m.type === 'vote?' ? 'var(--warn)' : m.type === 'yes' ? 'var(--ok)' : 'var(--err)';
      gMsg.append(svg('circle', { cx: x, cy: y, r: m.type === 'hb' ? 3.5 : 5, fill: c }));
    });
    nodes.forEach((n) => {
      const col = !n.alive ? 'var(--text-3)' : n.state === 'leader' ? 'var(--accent)' : n.state === 'candidate' ? 'var(--warn)' : 'var(--ok)';
      n.body.setAttribute('fill', n.alive ? `color-mix(in srgb, ${col} 22%, var(--surface))` : 'var(--surface-2)');
      n.body.setAttribute('stroke', col);
      const C = 2 * Math.PI * 34, frac = n.alive && n.state !== 'leader' ? Math.min(1, n.timeout / 300) : 0;
      n.ring.setAttribute('stroke-dasharray', `${C * frac} ${C}`);
      n.ring.setAttribute('stroke', n.state === 'candidate' ? 'var(--warn)' : 'var(--ok)');
      n.t2.textContent = n.alive ? 't' + n.term : 'down';
      n.t3.textContent = !n.alive ? '✖' : n.state === 'leader' ? 'LEADER' : n.state === 'candidate' ? 'votes ' + n.votes : '';
      n.t3.setAttribute('fill', col);
    });
  }
  let lastStats = 0;
  function rfStats() {
    if (!nodes) return;
    const l = nodes.find((n) => n.alive && n.state === 'leader');
    const alive = nodes.filter((n) => n.alive).length;
    setStats({ leader: l ? 'N' + l.id : 'none', term: Math.max(...nodes.map((n) => n.term)), alive: alive + ' / ' + N, 'majority': '3', writes: l && alive > N / 2 ? 'accepted' : 'blocked' });
  }
  resetRaft();

  ctx.loop((dt) => {
    if (mode === 'tt' && tt && tt.t < tt.tmax) { tt.t = Math.min(tt.tmax, tt.t + dt / 160); drawTT(); }
    if (mode === 'rf') {
      stepRaft(Math.min(dt, 50) * 0.25);
      paintRaft();
      if (now - lastStats > 20) { lastStats = now; rfStats(); }
    }
  });
  drawTT(); paintRaft();
  setMode('tt');
  say('TrueTime: run once with commit wait on, then turn it off and run again.');
});
