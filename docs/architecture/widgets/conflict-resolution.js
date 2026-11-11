/* Kafka vs RabbitMQ dispute: positions → interests → weights locked first → time-boxed spike fills scores →
   weighted matrix decides → sensitivity (weight change per criterion that flips the winner) → ADR snippet. */
SD.widget('conflict-resolution', function (root, ctx) {
  const { el, svg } = ctx;
  const OPT = ['Kafka', 'RabbitMQ'];
  const OC = ['var(--accent)', 'var(--warn)'];
  // criteria come from the uncovered interests; scores are what the spike measures (illustrative)
  const C = [
    { id: 'thr', l: 'Throughput headroom', who: 0, w: 20, s: [5, 3], ev: 'Benchmark: both hit today\'s 20k msg/s; at 60k Kafka p99 stayed flat, RabbitMQ needed extra nodes.' },
    { id: 'rep', l: 'Replay / retention', who: 0, w: 20, s: [5, 3], ev: 'Replay by offset is native in Kafka; RabbitMQ Streams can replay, quorum queues cannot.' },
    { id: 'rt', l: 'Per-message routing', who: 1, w: 20, s: [2, 5], ev: 'Exchanges and bindings route per message in RabbitMQ; Kafka needs topic design or consumer filtering.' },
    { id: 'ops', l: 'On-call burden', who: 1, w: 20, s: [2, 4], ev: 'Failure drill: broker loss recovered faster on RabbitMQ; Kafka rebalancing paged twice.' },
    { id: 'sk', l: 'Team familiarity', who: 1, w: 20, s: [2, 5], ev: 'Four engineers have run RabbitMQ in production; one has run Kafka.' }
  ];
  const P = [
    { n: 'Priya (staff)', pos: '"Kafka. It is the industry standard, end of story."', why: 'Analytics wants to <b>replay 30 days</b> of order events, and volume should grow <b>3×</b> next year.' },
    { n: 'Marco (senior, on-call)', pos: '"RabbitMQ. We already know it and it just works."', why: 'He carries the pager: worried about <b>on-call load</b>, the team\'s <b>skills</b>, and <b>routing</b> rules per message.' }
  ];
  let stage = 0, asked = [false, false], scored = 0, busy = false;

  const bar = el('div', { class: 'w-controls' });
  const askBtns = P.map((p, i) => el('button', { class: 'btn', text: '1 · Ask ' + p.n.split(' ')[0] + ' why', onclick: () => ask(i) }));
  const lockBtn = el('button', { class: 'btn', text: '2 · Lock weights', onclick: () => lock() });
  const spikeBtn = el('button', { class: 'btn', text: '3 · Run 5-day spike', onclick: () => spike() });
  const resetBtn = el('button', { class: 'btn', text: 'Reset', onclick: () => reset() });
  bar.append(...askBtns, lockBtn, spikeBtn, resetBtn);
  root.append(bar);

  const people = el('div', { style: { display: 'grid', gap: '10px', gridTemplateColumns: ctx.narrow ? '1fr' : '1fr 1fr', margin: '8px 0' } });
  const cards = P.map((p, i) => {
    const why = el('div', { style: { marginTop: '6px', fontSize: '14px' } });
    const card = el('div', { style: { border: '2px solid ' + OC[i], borderRadius: '10px', padding: '8px 10px', background: 'var(--surface-2)' } },
      el('div', { style: { fontWeight: '700', fontSize: '14px' }, text: p.n }), el('div', { style: { fontSize: '14px', fontStyle: 'italic' }, text: 'Position: ' + p.pos }), why);
    people.append(card); return why;
  });
  root.append(people);

  // weights + score table in HTML (readable on phones)
  const table = el('div', { style: { display: 'grid', gap: '6px', margin: '6px 0' } });
  const rows = C.map((c) => {
    const range = el('input', { type: 'range', min: '0', max: '50', step: '5', value: String(c.w), style: { width: '100%' }, 'aria-label': 'Weight of ' + c.l });
    const wv = el('b', { text: c.w });
    const sc = el('span', { style: { fontFamily: 'var(--mono)', fontSize: '14px', whiteSpace: 'nowrap' } });
    range.addEventListener('input', () => { c.w = +range.value; wv.textContent = c.w; render(); });
    const row = el('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(120px,1.3fr) 1fr auto', gap: '8px', alignItems: 'center', fontSize: '14px', padding: '4px 6px', borderRadius: '8px', border: '1px solid var(--border)' } },
      el('span', null, el('span', { text: c.l + ' ' }), el('span', { class: 'muted', text: '(' + (c.who ? 'Marco' : 'Priya') + ')', style: { fontSize: '13px' } })),
      el('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, range, wv), sc);
    table.append(row); return { c, range, sc, row };
  });
  root.append(table);

  const S = svg('svg', { role: 'img', 'aria-label': 'Weighted totals and sensitivity' });
  root.append(el('div', { class: 'w-stage', style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px' } }, S));
  const stats = el('div', { class: 'w-stats' });
  const adr = el('pre', { style: { fontSize: '13px', whiteSpace: 'pre-wrap', margin: '8px 0 0', padding: '8px', border: '1px solid var(--border)', borderRadius: '8px', display: 'none' } });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, adr, log);

  const W = () => C.reduce((a, c) => a + c.w, 0) || 1;
  const total = (o) => C.reduce((a, c) => a + c.w * c.s[o], 0) / W();
  function sens(win) {   // weight change on each criterion that makes the two options tie (others fixed)
    const oth = 1 - win, margin = C.reduce((a, c) => a + c.w * (c.s[win] - c.s[oth]), 0);
    return C.map((c) => { const d = c.s[win] - c.s[oth]; if (!d) return null; const dl = -margin / d; return c.w + dl >= 0 && c.w + dl <= 100 ? dl : null; });
  }

  function render() {
    const narrow = ctx.narrow, VW = narrow ? 360 : 560, lx = narrow ? 8 : 10, bx = narrow ? 150 : 210, bw = VW - bx - 46;
    const done = scored === C.length, t = [total(0), total(1)], win = t[0] >= t[1] ? 0 : 1;
    const H = 40 + 2 * 34 + 34 + C.length * 32 + 10;
    S.setAttribute('viewBox', `0 0 ${VW} ${H}`); S.innerHTML = '';
    const tx = (x, y, s, o) => S.append(svg('text', Object.assign({ x, y, fill: 'var(--text)', style: 'font:600 14px var(--sans)', text: s }, o || {})));
    tx(lx, 22, done ? 'Weighted total (1–5)' : 'Weighted total: waiting for spike', { style: 'font:700 15px var(--sans)' });
    OPT.forEach((o, i) => {
      const y = 40 + i * 34, v = done ? t[i] : 0;
      tx(lx, y + 18, o);
      S.append(svg('rect', { x: bx, y, width: bw, height: 24, rx: 5, fill: 'var(--surface)', stroke: 'var(--border)' }));
      S.append(svg('rect', { x: bx, y, width: bw * v / 5, height: 24, rx: 5, fill: OC[i], opacity: done && i === win ? 1 : 0.55 }));
      if (done) tx(bx + bw * v / 5 + 5, y + 18, v.toFixed(2) + (i === win ? ' ✓' : ''), { style: 'font:700 14px var(--mono)' });
    });
    const y0 = 40 + 2 * 34 + 24;
    tx(lx, y0, done ? 'Weight change that flips the winner' : 'Sensitivity: after scoring', { style: 'font:700 15px var(--sans)' });
    const sv = done ? sens(win) : C.map(() => null), max = 50;
    C.forEach((c, i) => {
      const y = y0 + 12 + i * 32, d = sv[i];
      tx(lx, y + 17, narrow ? c.l.split(' ')[0] : c.l, { style: 'font:500 14px var(--sans)' });
      S.append(svg('rect', { x: bx, y, width: bw, height: 22, rx: 4, fill: 'var(--surface)', stroke: 'var(--border)' }));
      if (!done) return;
      if (d === null) { tx(bx + 6, y + 16, 'cannot flip', { fill: 'var(--text-3)', style: 'font:500 13px var(--sans)' }); return; }
      const a = Math.abs(d), col = a < 10 ? 'var(--err)' : a < 20 ? 'var(--warn)' : 'var(--ok)';
      S.append(svg('rect', { x: bx, y, width: Math.max(4, bw * Math.min(a, max) / max), height: 22, rx: 4, fill: col, opacity: 0.8 }));
      tx(bx + Math.min(bw * Math.min(a, max) / max, bw - 60) + 6, y + 16, (d > 0 ? '+' : '−') + Math.round(a), { style: 'font:700 14px var(--mono)' });
    });
    rows.forEach((r, i) => {
      r.range.disabled = stage >= 2; r.row.style.background = stage >= 2 ? 'var(--surface-2)' : '';
      r.sc.innerHTML = i < scored ? OPT.map((o, k) => `<span style="color:${OC[k]}">${o[0]}:${r.c.s[k]}</span>`).join(' ') : (stage >= 2 ? 'K:? R:?' : '');
    });
    askBtns.forEach((b, i) => { b.disabled = asked[i] || busy; });
    lockBtn.disabled = stage !== 1 || busy; spikeBtn.disabled = stage !== 2 || busy;
    lockBtn.classList.toggle('primary', stage === 1); spikeBtn.classList.toggle('primary', stage === 2);
    const fl = done ? Math.min(...sens(win).filter((x) => x !== null).map(Math.abs)) : null;
    stats.innerHTML = '';
    [['Stage', ['Positions', 'Interests found', 'Weights locked', 'Decided'][stage]], ['Weights sum', W()],
      ['Winner', done ? OPT[win] + ' by ' + Math.abs(t[0] - t[1]).toFixed(2) : '–'],
      ['Robustness', fl === null ? '–' : fl === Infinity ? 'cannot flip' : Math.round(fl) + ' pts' + (fl < 10 ? ' ⚠ fragile' : fl < 20 ? ' moderate' : ' ✓ robust')]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    if (done) writeAdr(t, win, fl);
  }

  function writeAdr(t, win, fl) {
    const los = 1 - win, top = C.slice().sort((a, b) => b.w - a.w).slice(0, 2).map((c) => c.l.toLowerCase());
    const dissent = los === 0 ? 'Priya' : 'Marco';
    const trig = los === 0 ? 'replay requests or volume exceed the plan by 2x' : 'broker pages > 2/week for a quarter';
    adr.style.display = '';
    adr.textContent = `ADR-0042: Message broker for order events\nStatus: Accepted · Approver: VP Platform · Door: one-way\nDecision: use ${OPT[win]} (${t[win].toFixed(2)} vs ${t[los].toFixed(2)}); weights locked before scoring.\nDeciding criteria: ${top.join(', ')}. Robust to ${fl === Infinity ? 'any' : '±' + Math.floor(fl)}-pt weight change.\nDissent: ${dissent} prefers ${OPT[los]}; commits, and owns the ${los === 0 ? 'replay archive' : 'alerting + runbooks'}.\nRevisit if: ${trig}.`;
  }

  function ask(i) {
    asked[i] = true; cards[i].innerHTML = '<b>Interest:</b> ' + P[i].why;
    say(`Asked ${P[i].n.split(' ')[0]} "what would that give us?" → ${P[i].why}`);
    if (asked[0] && asked[1]) { stage = 1; say('Both interests are now <b>criteria</b>. Set the weights <b>before</b> anyone sees a score, then lock them.'); }
    render();
  }
  function lock() {
    if (W() === 0) return say('⚠ All weights are zero.');
    stage = 2; say(`🔒 Weights locked (sum ${W()}). Changing them after scores appear would be tuning the answer.`); render();
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));
  async function spike() {
    busy = true; render();
    say('▶ Spike starts: 5-day time box, one engineer from each camp, same benchmark and failure drill.');
    for (let d = 0; d < C.length; d++) { await sleep(700); scored = d + 1; say(`Day ${d + 1}/5 · <b>${C[d].l}</b>: ${C[d].ev}`); render(); }
    stage = 3; busy = false;
    const t = [total(0), total(1)], win = t[0] >= t[1] ? 0 : 1;
    say(`✅ Time box over. The matrix picks <b>${OPT[win]}</b>; the approver decides and the ADR records the dissent. Reset and try other weights to see the winner flip.`);
    render();
  }
  function reset() {
    if (busy) return; stage = 0; asked = [false, false]; scored = 0; adr.style.display = 'none';
    C.forEach((c, i) => { c.w = 20; rows[i].range.value = '20'; });
    rows.forEach((r) => { r.range.nextSibling.textContent = r.c.w; });
    cards.forEach((c) => { c.innerHTML = ''; }); log.innerHTML = ''; start();
  }
  function say(h) { log.prepend(el('div', { html: h })); while (log.children.length > 20) log.lastChild.remove(); }
  function start() { say('Two positions, no criteria. Start by asking each engineer <b>why</b>.'); render(); }
  ctx.onResize((n) => { people.style.gridTemplateColumns = n ? '1fr' : '1fr 1fr'; render(); });
  start();
});
