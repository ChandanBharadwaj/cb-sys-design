/* Two real mechanisms:
   (1) Auction: rank by eCPM = bid × pCTR, then price 1–3 slots under quality-weighted GSP, VCG and first price, with a reserve.
   (2) Pacing: a 24 h day in 10-min steps against a second-price market; no pacing vs PI-controlled throttling vs PI-controlled bid modifier. */
SD.widget('ads-serving', function (root, ctx) {
  const { el, svg } = ctx;
  const ALPHA = [1, 0.6, 0.35];                       // position CTR multipliers for slots 1..3 (illustrative)
  const COL = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7'];
  const BASE = [['A', 2.0, 3.0], ['B', 4.0, 1.2], ['C', 1.5, 3.5], ['D', 3.0, 1.0], ['E', 0.8, 2.5], ['F', 5.0, 0.5]];
  let mode = 'auction', bidders = BASE.map(([id, bid, ctr], i) => ({ id, bid, ctr, c: COL[i] })), slots = 2, reserve = 10, sel = 1;
  let strat = 'throttle', spike = false, lag = false, seed = 3, loopH = null, gen = 0;
  const money = (x) => '$' + x.toFixed(2);
  const T = (x, y, t, size, fill, anchor, w) => svg('text', { x, y, 'text-anchor': anchor || 'start', fill: fill || 'var(--text)', style: `font:${w || 600} ${size}px var(--sans)`, text: t });

  /* ---------- auction maths ---------- */
  function auction() {
    const R = reserve / 1000;                                           // reserve as eCPM → $ per impression
    const ranked = bidders.map((b) => ({ ...b, s: b.bid * b.ctr / 100 })).sort((a, b) => b.s - a.s);
    const elig = ranked.filter((b) => b.s >= R);
    const K = Math.min(slots, elig.length);
    const sc = (j) => (j < elig.length ? elig[j].s : R);                 // score of rank j (0-based), reserve phantom below
    const a = (j) => (j < slots ? ALPHA[j] : 0);
    const rows = [];
    for (let k = 0; k < K; k++) {
      const w = elig[k], q = w.ctr / 100;
      const gsp = Math.min(w.bid, sc(k + 1) / q + 0.01);
      let vcgImp = 0;
      for (let j = k; j < slots; j++) vcgImp += (a(j) - a(j + 1)) * sc(j + 1);
      const vcg = vcgImp / (ALPHA[k] * q);
      rows.push({ k, w, gsp, vcg, fp: w.bid, clicks: ALPHA[k] * q });
    }
    const rev = (f) => rows.reduce((s, r) => s + r.clicks * r[f] * 1000, 0);
    return { ranked, elig, rows, rev: { gsp: rev('gsp'), vcg: rev('vcg'), fp: rev('fp') } };
  }

  /* ---------- pacing simulation ---------- */
  const STEPS = 144, BUDGET = 3500, BID = 5;
  const traffic = (h) => 0.22 + 0.95 * Math.exp(-(((h - 10) / 3) ** 2)) + 1.05 * Math.exp(-(((h - 20.5) / 2.4) ** 2));
  function simulate() {
    let s0 = seed;
    const rnd = () => { s0 = (s0 + 0x6D2B79F5) | 0; let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const fc = [], F = [0]; let tot = 0;
    for (let s = 0; s < STEPS; s++) { fc.push(traffic((s + 0.5) / 6)); tot += fc[s]; }
    for (let s = 0; s < STEPS; s++) F.push(F[s] + fc[s] / tot);       // forecast cumulative share = target curve
    const delay = lag ? 3 : 0, Kp = 0.2, Ki = 0.05;
    let spent = 0, imps = 0, ctrl = strat === 'none' ? 1 : 0.5, eprev = 0, stopAt = null;
    const hist = [0], ctl = [], tr = [];
    for (let s = 0; s < STEPS; s++) {
      const h = (s + 0.5) / 6, mult = spike && h >= 17 && h < 19 ? 2.2 : 1;
      tr.push(fc[s] * mult);
      const n = Math.round(42 * fc[s] * mult * (0.85 + 0.3 * rnd()));   // eligible auctions this step (each = 1,000 impressions)
      const reported = hist[Math.max(0, s - delay)];
      if (stopAt !== null || reported >= BUDGET) { if (stopAt === null) stopAt = s; hist.push(spent); ctl.push(0); continue; }
      if (strat !== 'none' && s > 0) {                                   // velocity-form PI on log(control)
        const e = (BUDGET * F[s] - reported) / (BUDGET / STEPS);
        const u = Math.log(ctrl) + Kp * (e - eprev) + Ki * e; eprev = e;
        ctrl = Math.min(1, Math.max(strat === 'bid' ? 0.15 : 0.01, Math.exp(u)));
      }
      ctl.push(ctrl);
      for (let i = 0; i < n; i++) {
        if (!delay && spent >= BUDGET) { stopAt = s; break; }            // live counter: stop on the very next auction
        if (strat === 'throttle' && rnd() > ctrl) continue;             // probabilistic participation
        const comp = 3 * Math.exp(0.5 * gauss());                        // best competing eCPM ($), log-normal
        const myBid = strat === 'bid' ? BID * ctrl : BID;
        if (myBid > comp) { spent += comp; imps++; }                    // second price: pay the runner-up
      }
      hist.push(spent);
    }
    return { hist, ctl, tr, F, stopAt, spent, imps };
  }
  const hhmm = (s) => String(Math.floor(s / 6)).padStart(2, '0') + ':' + (s % 6) + '0';

  /* ---------- UI ---------- */
  function build(narrow) {
    const my = ++gen;
    if (loopH) { loopH.stop(); loopH = null; }
    root.innerHTML = '';
    const tabA = el('button', { class: 'btn' + (mode === 'auction' ? ' primary' : ''), text: '① Auction' });
    const tabP = el('button', { class: 'btn' + (mode === 'pacing' ? ' primary' : ''), text: '② Budget pacing' });
    tabA.onclick = () => { mode = 'auction'; build(narrow); };
    tabP.onclick = () => { mode = 'pacing'; build(narrow); };
    root.append(el('div', { class: 'w-controls' }, tabA, tabP));
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    const say = (t) => { if (my === gen) { log.prepend(el('div', { html: t })); while (log.children.length > 12) log.lastChild.remove(); } };
    if (mode === 'auction') buildAuction(narrow, say, log); else buildPacing(narrow, say, log, my);
  }

  function buildAuction(narrow, say, log) {
    const W = narrow ? 360 : 560, RH = narrow ? 42 : 38, TOP = 30, H = TOP + RH * 6 + 8;
    const F1 = narrow ? 15 : 14, F2 = narrow ? 14 : 13;
    const slotBtn = el('button', { class: 'btn', text: 'Slots: ' + slots });
    slotBtn.onclick = () => { slots = slots % 3 + 1; slotBtn.textContent = 'Slots: ' + slots; draw(); };
    const rOut = el('b', { text: '$' + reserve });
    const rIn = el('input', { type: 'range', min: 0, max: 50, step: 1, value: reserve, 'aria-label': 'Reserve eCPM' });
    rIn.addEventListener('input', () => { reserve = +rIn.value; rOut.textContent = '$' + reserve; draw(); });
    const shuf = el('button', { class: 'btn', text: '🎲 Shuffle bids' });
    shuf.onclick = () => { bidders.forEach((b) => { b.bid = Math.round((0.5 + Math.random() * 4.5) * 4) / 4; b.ctr = Math.round((0.4 + Math.random() * 3.6) * 4) / 4; }); draw(true); };
    const selOut = el('b');
    const step = (f, d, lo, hi) => el('button', { class: 'btn', text: (d > 0 ? '+' : '−') + (f === 'bid' ? '$' : '') + Math.abs(d) + (f === 'ctr' ? '%' : ''),
      onclick: () => { const b = bidders[sel]; b[f] = Math.min(hi, Math.max(lo, Math.round((b[f] + d) * 100) / 100)); draw(true); } });
    const ctl = el('div', { class: 'w-controls' }, slotBtn, el('label', null, 'Reserve eCPM ', rOut, ' ', rIn), shuf);
    const ctl2 = el('div', { class: 'w-controls' }, el('span', null, 'Edit ', selOut, ': '), step('bid', -0.25, 0.25, 9), step('bid', 0.25, 0.25, 9), step('ctr', -0.25, 0.25, 6), step('ctr', 0.25, 0.25, 6));
    const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Bidders ranked by eCPM' , style: narrow ? '' : 'max-width:680px;display:block;margin:0 auto' });
    const tbl = el('div', { style: { overflowX: 'auto', marginTop: '8px' } });
    const stats = el('div', { class: 'w-stats' });
    root.append(ctl, ctl2, el('div', { class: 'w-stage' }, S_), tbl, stats, log);

    function draw(explain) {
      const A = auction();
      selOut.textContent = bidders[sel].id;
      selOut.style.color = bidders[sel].c;
      S_.innerHTML = '';
      const LX = narrow ? 150 : 190, RX = W - (narrow ? 52 : 70);
      const max = Math.max(reserve, ...A.ranked.map((b) => b.s * 1000)) * 1.05 || 1;
      const xOf = (v) => LX + (RX - LX) * v / max;
      S_.append(T(4, 18, narrow ? 'bid × pCTR' : 'bidder · bid/click × pCTR', F2, 'var(--text-3)', 'start', 700), T(W - 4, 18, 'eCPM', F2, 'var(--text-3)', 'end', 700));
      if (reserve > 0) {
        const x = xOf(reserve);
        S_.append(svg('line', { x1: x, x2: x, y1: TOP - 4, y2: H - 4, stroke: 'var(--err)', 'stroke-width': 2, 'stroke-dasharray': '5 4' }),
          T(Math.min(x, RX - 30), TOP - 12 + 4, 'reserve', F2, 'var(--err)', 'middle', 700));
      }
      A.ranked.forEach((b, i) => {
        const y = TOP + i * RH, idx = bidders.findIndex((x) => x.id === b.id);
        const won = A.rows.find((r) => r.w.id === b.id), ok = b.s * 1000 >= reserve;
        const g = svg('g', { style: 'cursor:pointer' });
        g.addEventListener('click', () => { sel = idx; draw(); });
        g.append(svg('rect', { x: 0, y: y + 2, width: W, height: RH - 4, rx: 8, fill: idx === sel ? 'color-mix(in srgb, var(--surface-2) 70%, transparent)' : 'transparent', stroke: idx === sel ? 'var(--border)' : 'none' }));
        g.append(svg('circle', { cx: 18, cy: y + RH / 2, r: 12, fill: b.c }), T(18, y + RH / 2 + 5, b.id, F2, '#fff', 'middle', 800));
        g.append(T(36, y + RH / 2 + 5, money(b.bid) + ' × ' + b.ctr.toFixed(narrow ? 1 : 2) + '%', F1, ok ? 'var(--text)' : 'var(--text-3)', 'start', 600));
        g.append(svg('rect', { x: LX, y: y + 9, width: Math.max(2, xOf(b.s * 1000) - LX), height: RH - 18, rx: 4, fill: won ? b.c : 'var(--border)', opacity: won ? 0.9 : 0.7 }));
        if (won) g.append(T(LX + 6, y + RH / 2 + 5, 'slot ' + (won.k + 1), F2, '#fff', 'start', 800));
        g.append(T(W - 4, y + RH / 2 + 5, '$' + (b.s * 1000).toFixed(1), F1, ok ? 'var(--text)' : 'var(--err)', 'end', 700));
        S_.append(g);
      });
      // price table (HTML, never scaled)
      const td = (t, st) => el('td', { html: t, style: Object.assign({ padding: '4px 6px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }, st || {}) });
      const th = (t) => el('th', { text: t, style: { padding: '4px 6px', textAlign: 'right', fontSize: '13px', color: 'var(--text-3)' } });
      const table = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' } },
        el('tr', null, th('slot'), th('ad'), th('GSP'), th('VCG'), th('1st price')),
        A.rows.map((r) => el('tr', null, td(String(r.k + 1)), td(`<b style="color:${r.w.c}">${r.w.id}</b>`), td(money(r.gsp)), td(money(r.vcg)), td(money(r.fp)))),
        el('tr', null, td('<b>per 1k views</b>', { textAlign: 'left' }), td(''), td('<b>' + money(A.rev.gsp) + '</b>'), td('<b>' + money(A.rev.vcg) + '</b>'), td('<b>' + money(A.rev.fp) + '</b>')));
      tbl.innerHTML = '';
      tbl.append(el('p', { class: 'muted', style: { margin: '0 0 4px', fontSize: '13px' }, text: 'Price per click paid by each winner, same bids under each rule:' }), table);
      stats.innerHTML = '';
      const top = A.ranked[0], hb = A.ranked.slice().sort((a, b) => b.bid - a.bid)[0];
      [['eligible', A.elig.length + ' of 6'], ['filled', A.rows.length + ' / ' + slots], ['GSP ≥ VCG', A.rev.gsp + 1e-9 >= A.rev.vcg ? 'yes' : 'no']].forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
      if (explain !== false && A.rows.length) {
        const r = A.rows[0], nxt = A.elig[1];
        const nTxt = nxt ? `${nxt.id}'s eCPM $${(nxt.s * 1000).toFixed(1)}` : `the reserve $${reserve}`;
        say(`<b>${r.w.id}</b> wins slot 1 with eCPM $${(r.w.s * 1000).toFixed(1)}. GSP price = ${nTxt} ÷ (1000 × ${r.w.ctr}%) + $0.01 = <b>${money(r.gsp)}</b>/click, below its ${money(r.w.bid)} bid.`);
        if (hb.id !== top.id) say(`${hb.id} has the highest bid (${money(hb.bid)}) but a low pCTR, so it ranks lower. Ranking by bid alone would show a worse ad and earn less per view.`);
        if (slots > 1 && A.rows.length > 1) say(`With ${slots} slots, VCG charges each winner only the <i>harm</i> it does to the ads below it, so its revenue (${money(A.rev.vcg)}) is ≤ GSP (${money(A.rev.gsp)}) for the same bids.`);
      }
      if (!A.rows.length) say('No ad clears the reserve, so the slot stays empty (or goes to a house ad).');
    }
    draw();
    say('First price looks most lucrative here only because the bids are held fixed. Real bidders <b>shade</b> their bids in a first-price auction, which is why Google added pricing tools when it switched Ad Manager in 2019.');
  }

  function buildPacing(narrow, say, log, my) {
    const W = narrow ? 360 : 560, H = narrow ? 270 : 260;
    const L = narrow ? 44 : 50, Rr = W - 10, TOPY = 14, BOT = H - 76, STRIP = [H - 52, H - 26];
    const FS = narrow ? 14 : 13;
    const btns = [['none', 'No pacing'], ['throttle', 'Throttle (PI)'], ['bid', 'Bid modifier (PI)']].map(([v, l]) => {
      const b = el('button', { class: 'btn' + (strat === v ? ' primary' : ''), text: l });
      b.onclick = () => { strat = v; build(narrow); };
      return b;
    });
    const spikeB = el('button', { class: 'btn', text: 'Evening spike: ' + (spike ? 'on' : 'off') });
    spikeB.onclick = () => { spike = !spike; build(narrow); };
    const lagB = el('button', { class: 'btn', text: 'Spend counter: ' + (lag ? '30 min lag' : 'live') });
    lagB.onclick = () => { lag = !lag; build(narrow); };
    const runB = el('button', { class: 'btn', text: '▶ New day' });
    runB.onclick = () => { seed++; build(narrow); };
    root.append(el('div', { class: 'w-controls' }, ...btns), el('div', { class: 'w-controls' }, spikeB, lagB, runB));
    const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Cumulative spend over 24 hours' , style: narrow ? '' : 'max-width:680px;display:block;margin:0 auto' });
    const stats = el('div', { class: 'w-stats' });
    root.append(el('div', { class: 'w-stage' }, S_),
      el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b style="color:var(--accent)">━</b> actual spend · <b style="color:var(--text-3)">┅</b> target (follows forecast traffic) · <b style="color:var(--err)">┅</b> daily budget · grey area = traffic · bottom strip = participation p or bid multiplier' }),
      stats, log);
    const r = simulate();
    const ymax = BUDGET * 1.25;
    const X = (s) => L + (Rr - L) * s / STEPS, Y = (v) => BOT - (BOT - TOPY) * v / ymax;
    const trMax = Math.max(...r.tr) * 1.05;
    let area = `M${X(0)},${BOT}`;
    r.tr.forEach((v, s) => { area += ` L${X(s + 0.5).toFixed(1)},${(BOT - (BOT - TOPY) * 0.4 * v / trMax).toFixed(1)}`; });
    S_.append(svg('path', { d: area + ` L${X(STEPS)},${BOT} Z`, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
    [0, 6, 12, 18, 24].forEach((h) => { S_.append(svg('line', { x1: X(h * 6), x2: X(h * 6), y1: TOPY, y2: BOT, stroke: 'var(--border)', 'stroke-dasharray': '2 4' }), T(X(h * 6), BOT + 18, h + 'h', FS, 'var(--text-3)', h === 24 ? 'end' : 'middle', 600)); });
    S_.append(svg('line', { x1: L, x2: Rr, y1: BOT, y2: BOT, stroke: 'var(--border)' }));
    S_.append(svg('line', { x1: L, x2: Rr, y1: Y(BUDGET), y2: Y(BUDGET), stroke: 'var(--err)', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }), T(L - 4, Y(BUDGET) + 5, '$3.5k', FS, 'var(--err)', 'end', 700), T(L - 4, BOT, '$0', FS, 'var(--text-3)', 'end', 600));
    S_.append(svg('path', { d: r.F.map((f, s) => (s ? 'L' : 'M') + X(s).toFixed(1) + ',' + Y(BUDGET * f).toFixed(1)).join(' '), fill: 'none', stroke: 'var(--text-3)', 'stroke-width': 2, 'stroke-dasharray': '5 4' }));
    S_.append(svg('rect', { x: L, y: STRIP[0], width: Rr - L, height: STRIP[1] - STRIP[0], rx: 4, fill: 'var(--surface-2)', stroke: 'var(--border)' }), T(L - 4, STRIP[1] - 6, strat === 'bid' ? 'bid×' : 'p', FS, 'var(--warn)', 'end', 700));
    const line = svg('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3, 'stroke-linejoin': 'round' });
    const cline = svg('path', { fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2 });
    const dot = svg('circle', { r: 5, fill: 'var(--accent)' });
    S_.append(line, cline, dot);
    const cy = (v) => STRIP[1] - 3 - (STRIP[1] - STRIP[0] - 6) * v;
    function paint(upto) {
      line.setAttribute('d', r.hist.slice(0, upto + 1).map((v, s) => (s ? 'L' : 'M') + X(s).toFixed(1) + ',' + Y(v).toFixed(1)).join(' '));
      cline.setAttribute('d', r.ctl.slice(0, upto).map((v, s) => (s ? 'L' : 'M') + X(s + 0.5).toFixed(1) + ',' + cy(v).toFixed(1)).join(' '));
      dot.setAttribute('cx', X(upto)); dot.setAttribute('cy', Y(r.hist[upto]));
    }
    function finish() {
      paint(STEPS);
      const over = r.spent - BUDGET, gap = Math.max(...r.hist.map((v, s) => Math.abs(v - BUDGET * r.F[s]))) / BUDGET;
      stats.innerHTML = '';
      [['budget gone at', r.stopAt === null ? 'never ✓' : hhmm(r.stopAt) + (r.stopAt >= 138 ? ' ✓' : '')], ['spent', '$' + Math.round(r.spent)], ['overspend', over > 0.5 ? '$' + Math.round(over) : 'none'],
        ['impressions', (r.imps / 1000).toFixed(2) + 'M'], ['avg CPM paid', money(r.spent / Math.max(1, r.imps))], ['max gap vs target', Math.round(gap * 100) + '%']]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
      if (strat === 'none') say(`No pacing: the campaign enters every auction it qualifies for and runs dry at <b>${r.stopAt === null ? '—' : hhmm(r.stopAt)}</b>, missing the whole evening peak.` + (lag ? ` The lagging counter let it keep buying for 30 more minutes: <b>$${Math.round(over)}</b> overspend.` : ''));
      if (strat === 'throttle') say(`Throttling: every 10 min a PI controller compares spend with the target curve and sets the chance <i>p</i> that this campaign joins an auction. When it wins it still pays the market price, so the average CPM stays at ${money(r.spent / r.imps)}.`);
      if (strat === 'bid') say(`Bid modifier: the campaign joins every auction but bids ${'×'}m. A lower bid drops the most expensive auctions first, so the same budget buys more impressions at ${money(r.spent / r.imps)} average CPM.`);
      if (lag && strat !== 'none') say('With a 30-minute lag the controller reacts to old data, so the control signal overshoots and oscillates. Shorten the feedback loop (Twitter recomputes pacing every 10 s) or damp the gains.');
      if (spike && strat !== 'none') say('The 17:00–19:00 spike was not in the forecast. The controller sees spend running ahead of target and cuts back, so the extra traffic does not drain the budget.');
    }
    const DUR = 2600;
    if (ctx.reduced) { finish(); return; }
    paint(0);
    let t0 = null;
    loopH = ctx.loop((dt, t) => {
      if (my !== gen) return;
      if (t0 === null) t0 = t;
      const k = Math.min(STEPS, Math.floor((t - t0) / DUR * STEPS));
      paint(k);
      if (k >= STEPS) { loopH.stop(); loopH = null; finish(); }
    });
  }

  build(ctx.narrow);
  ctx.onResize(build);
});
