/* One coach on route A..F (5 segments). Six berths and two side-lower RAC berths (two slots each).
   Each berth is a bitmask of sold segments; a journey f->t fits when (occupied & mask(f,t)) === 0.
   First-fit or best-fit (fullest berth that fits), then RAC, then WL; cancellation promotes in order. */
SD.widget('irctc-booking', function (root, ctx) {
  const { el, svg } = ctx;
  const ST = ['A', 'B', 'C', 'D', 'E', 'F'], NS = 5, NB = 6, NR = 4;
  const RLAB = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'SL7·1', 'SL7·2', 'SL8·1', 'SL8·2'];
  const mask = (f, t) => ((1 << (t - f)) - 1) << f;
  const bits = (m) => [0, 1, 2, 3, 4].map((k) => (m >> k) & 1).join('');   // left = segment A–B
  const pc = (m) => bits(m).split('').filter((c) => c === '1').length;
  const leg = (b) => ST[b.f] + '→' + ST[b.t];
  const GEO = {
    wide: { W: 560, X0: 74, SW: 76, MX: 506, RH: 30, TOP: 36, GAP: 14, f: 13, hd: 14 },
    narrow: { W: 360, X0: 50, SW: 49, MX: 326, RH: 32, TOP: 36, GAP: 14, f: 13.5, hd: 15 }
  };
  let G = ctx.narrow ? GEO.narrow : GEO.wide;
  let strat = 'best', cnf, rac, racq, wl, seq, refunds, charted, scan, queue;
  const rowY = (r) => G.TOP + r * G.RH + (r >= NB ? G.GAP : 0);

  // ---------- controls ----------
  const sel = (from, to, v) => { const s = el('select', { 'aria-label': 'station' }); for (let i = from; i <= to; i++) s.append(el('option', { value: String(i), text: ST[i] })); s.value = String(v); return s; };
  const fromS = sel(0, 4, 2), toS = sel(1, 5, 5);
  fromS.addEventListener('change', () => { if (+toS.value <= +fromS.value) toS.value = String(+fromS.value + 1); });
  toS.addEventListener('change', () => { if (+toS.value <= +fromS.value) fromS.value = String(+toS.value - 1); });
  const bookBtn = el('button', { class: 'btn primary', text: 'Book', onclick: () => request(+fromS.value, +toS.value) });
  const SB = [['first', 'First-fit'], ['best', 'Best-fit']].map(([v, l]) => el('button', { class: 'btn' + (v === strat ? ' primary' : ''), text: l, onclick: () => { strat = v; SB.forEach((b, i) => { b.className = 'btn' + (i === (v === 'first' ? 0 : 1) ? ' primary' : ''); }); say(v === 'best' ? 'Best-fit: take the <b>fullest</b> berth that still fits, so clean berths stay free for long journeys.' : 'First-fit: take the <b>first</b> berth (B1, B2, …) that fits.'); } }));
  const rnd = () => { const f = Math.floor(Math.random() * NS); return [f, f + 1 + Math.floor(Math.random() * (NS - f))]; };
  root.append(
    el('div', { class: 'w-controls' }, el('label', null, 'From ', fromS), el('label', null, 'To ', toS), bookBtn),
    el('div', { class: 'w-controls' }, el('span', { class: 'muted', text: 'Allocation:' }), ...SB),
    el('div', { class: 'w-controls' },
      el('button', { class: 'btn', text: '🎲 Random trip', onclick: () => request(...rnd()) }),
      el('button', { class: 'btn', text: '⚡ Tatkal burst ×8', onclick: () => { for (let i = 0; i < 8; i++) request(...rnd()); } }),
      el('button', { class: 'btn', text: '✖ Cancel a CNF', onclick: () => { const c = Object.values(book).filter((b) => b.st === 'CNF'); if (c.length) cancel(c[Math.floor(Math.random() * c.length)]); } }),
      el('button', { class: 'btn', text: '📋 Prepare chart', onclick: chart }),
      el('button', { class: 'btn', text: '↺ Reset', onclick: () => { reset(); say('Reset: an empty coach. Every mask is 00000.'); render(); } })));

  const S_ = svg('svg', { role: 'img', 'aria-label': 'Berths by route segment', style: 'max-width:640px;margin:0 auto;display:block' });
  const gS = svg('g'), gD = svg('g'); S_.append(gS, gD);
  const wlBox = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', margin: '8px 0 2px', fontSize: '13px' } });
  const legend = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b style="color:var(--ok)">■</b> confirmed (CNF) · <b style="color:var(--warn)">■</b> RAC: two passengers share each side-lower berth · <b>mask</b>: 1 = segment sold, left bit = A–B · bottom row: berths still free on each segment. Tap a bar to cancel.' });
  const statEl = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(el('div', { class: 'w-stage' }, S_), legend, wlBox, statEl, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); };
  const T = (x, y, text, o) => svg('text', { x, y, 'text-anchor': (o && o.a) || 'middle', fill: (o && o.c) || 'var(--text)', style: `font:${(o && o.w) || 600} ${(o && o.s) || G.f}px var(${(o && o.m) ? '--mono' : '--sans'})`, text });

  // ---------- mechanism ----------
  let book = {};
  function reset() { cnf = Array(NB).fill(0); rac = Array(NR).fill(0); racq = []; wl = []; book = {}; seq = 0; refunds = 0; charted = false; scan = null; queue = []; }
  function pick(slots, m, how) {           // index of the berth to use, or -1
    let best = -1;
    slots.forEach((o, i) => { if (o & m) return; if (best < 0 || (how === 'best' && pc(o) > pc(slots[best]))) best = i; });
    return best;
  }
  function place(b) {                       // CNF, else RAC, else nothing
    const i = pick(cnf, b.m, strat);
    if (i >= 0) { cnf[i] |= b.m; b.st = 'CNF'; b.slot = i; return 'CNF ' + RLAB[i]; }
    const j = pick(rac, b.m, 'first');
    if (j >= 0) { rac[j] |= b.m; b.st = 'RAC'; b.slot = j; racq.push(b); return 'RAC ' + racq.length + ' (' + RLAB[NB + j] + ')'; }
    return null;
  }
  const status = (b) => b.st === 'CNF' ? 'CNF ' + RLAB[b.slot] : b.st === 'RAC' ? 'RAC ' + (racq.indexOf(b) + 1) : 'WL ' + (wl.indexOf(b) + 1);

  function request(f, t) {
    if (charted) { say('The chart is prepared, so this train is closed. Press <b>Reset</b> for a new one.'); return; }
    queue.push({ f, t }); if (!scan) next();
  }
  function next() {
    const r = queue.shift(); if (!r) { render(); return; }
    const b = { id: ++seq, f: r.f, t: r.t, m: mask(r.f, r.t) };
    const steps = [], ci = pick(cnf, b.m, strat);
    for (let i = 0; i < NB; i++) { const ok = !(cnf[i] & b.m); steps.push({ row: i, ok }); if (strat === 'first' && ok) break; }
    if (ci < 0) for (let i = 0; i < NR; i++) { const ok = !(rac[i] & b.m); steps.push({ row: NB + i, ok }); if (ok) break; }
    scan = { b, steps, k: 0, t: 0, fast: queue.length > 0 };
    if (ctx.reduced) finish();
  }
  function finish() {
    const { b, steps } = scan;
    const tests = steps.map((s) => RLAB[s.row] + (s.ok ? ' ✓' : ' ✗')).join(', ');
    const got = place(b);
    if (got) { book[b.id] = b; say(`<b>#${b.id} ${leg(b)}</b> needs <code>${bits(b.m)}</code>. Tested ${tests} → <b style="color:var(--${b.st === 'CNF' ? 'ok' : 'warn'})">${got}</b>${b.st === 'CNF' && pc(cnf[b.slot]) > pc(b.m) ? ' (berth shared with another leg)' : ''}.`); }
    else { b.st = 'WL'; wl.push(b); book[b.id] = b; say(`<b>#${b.id} ${leg(b)}</b> needs <code>${bits(b.m)}</code>. No berth or RAC slot is free on all of those segments → <b style="color:var(--err)">WL ${wl.length}</b>.`); }
    scan = null; next(); render();
  }
  function cancel(b) {
    if (scan) { say('Still allocating the queued bookings. Cancel again in a moment.'); return; }
    if (charted || !book[b.id]) return;
    const was = status(b);
    if (b.st === 'CNF') cnf[b.slot] &= ~b.m;
    else if (b.st === 'RAC') { rac[b.slot] &= ~b.m; racq.splice(racq.indexOf(b), 1); }
    else wl.splice(wl.indexOf(b), 1);
    delete book[b.id];
    say(`✖ <b>#${b.id} ${leg(b)}</b> (${was}) cancelled. Segments <code>${bits(b.m)}</code> are free again.`);
    promote(); render();
  }
  function promote() {
    const moved = []; let again = true;
    while (again) {
      again = false;
      for (const r of racq.slice()) {          // RAC queue, in order: first who fits gets the berth
        const i = pick(cnf, r.m, strat); if (i < 0) continue;
        const pos = racq.indexOf(r) + 1;
        rac[r.slot] &= ~r.m; racq.splice(pos - 1, 1); cnf[i] |= r.m; r.st = 'CNF'; r.slot = i;
        moved.push(`#${r.id} ${leg(r)} RAC ${pos} → CNF ${RLAB[i]}`); again = true;
      }
      const skipped = [];
      for (const w of wl.slice()) {            // then the waitlist, in order
        const pos = wl.indexOf(w) + 1, got = place(w);
        if (!got) { skipped.push(pos); continue; }
        wl.splice(pos - 1, 1);
        moved.push(`#${w.id} ${leg(w)} WL ${pos} → ${got}` + (skipped.length ? ` (ahead of WL ${skipped.join(', ')}: their legs do not fit)` : ''));
        again = true; break;                   // positions shifted: rescan from the top
      }
    }
    say(moved.length ? '⬆ Promotion in order: ' + moved.join(' · ') : 'Nobody on RAC or WL fits exactly those free segments, so nothing moves.');
  }
  function chart() {
    if (scan || charted) return;
    charted = true; refunds += wl.length;
    wl.forEach((w) => delete book[w.id]);
    say(`📋 <b>Chart prepared.</b> ${wl.length} still-waitlisted e-ticket(s) cancelled and refunded automatically. ${racq.length} RAC passenger(s) may board, two per side-lower berth.`);
    wl = []; render();
  }

  // ---------- drawing ----------
  function drawStatic() {
    const H = rowY(NB + NR) + G.GAP / 2 + G.RH + 4;
    S_.setAttribute('viewBox', `0 0 ${G.W} ${H}`);
    gS.innerHTML = '';
    for (let k = 0; k <= NS; k++) {
      const x = G.X0 + k * G.SW;
      gS.append(svg('line', { x1: x, x2: x, y1: G.TOP - 6, y2: H - 4, stroke: 'var(--border)', 'stroke-dasharray': '2 4' }), T(x, G.TOP - 12, ST[k], { w: 700, s: G.hd }));
    }
    gS.append(T(G.MX, G.TOP - 12, 'mask', { s: G.f, c: 'var(--text-3)' }));
    for (let r = 0; r < NB + NR; r++) {
      gS.append(svg('rect', { x: G.X0, y: rowY(r) + 2, width: NS * G.SW, height: G.RH - 4, rx: 5, fill: r < NB ? 'var(--surface-2)' : 'color-mix(in srgb, var(--warn) 9%, var(--surface))' }));
      gS.append(T(G.X0 - 6, rowY(r) + G.RH / 2 + 5, RLAB[r], { a: 'end', w: 700, c: r < NB ? 'var(--text)' : 'var(--warn)' }));
    }
    gS.append(T(G.X0 - 6, rowY(NB + NR) + G.GAP / 2 + G.RH / 2 + 5, 'free', { a: 'end', c: 'var(--text-3)' }));
  }
  function render() {
    gD.innerHTML = '';
    const tested = scan ? scan.steps.slice(0, scan.k + 1) : [];
    for (let r = 0; r < NB + NR; r++) {
      const occ = r < NB ? cnf[r] : rac[r - NB], y = rowY(r) + G.RH / 2 + 5;
      const tst = tested.find((s) => s.row === r);
      gD.append(T(G.MX, y, bits(occ), { m: 1, w: 700, c: tst ? (tst.ok ? 'var(--ok)' : 'var(--err)') : 'var(--text-2)' }));
    }
    Object.values(book).forEach((b) => {
      if (b.st === 'WL') return;
      const r = b.st === 'CNF' ? b.slot : NB + b.slot, x = G.X0 + b.f * G.SW + 2, w = (b.t - b.f) * G.SW - 4;
      const g = svg('g', { style: 'cursor:pointer' });
      const c = b.st === 'CNF' ? 'var(--ok)' : 'var(--warn)';
      g.append(svg('rect', { x, y: rowY(r) + 4, width: w, height: G.RH - 8, rx: 5, fill: `color-mix(in srgb, ${c} 32%, var(--surface))`, stroke: c }));
      g.append(T(x + w / 2, rowY(r) + G.RH / 2 + 5, '#' + b.id, { w: 700 }));
      g.addEventListener('click', () => cancel(b));
      gD.append(g);
    });
    if (scan) {                                  // the request being tested, drawn over each tested row
      const { b } = scan;
      tested.forEach((s, i) => {
        const cur = i === tested.length - 1;
        gD.append(svg('rect', { x: G.X0 + b.f * G.SW + 1, y: rowY(s.row) + 2, width: (b.t - b.f) * G.SW - 2, height: G.RH - 4, rx: 6, fill: 'none', stroke: s.ok ? 'var(--ok)' : 'var(--err)', 'stroke-width': cur ? 3 : 1.5, 'stroke-dasharray': cur ? 'none' : '5 3' }));
      });
    }
    const fy = rowY(NB + NR) + G.GAP / 2 + G.RH / 2 + 5;
    for (let k = 0; k < NS; k++) {
      const n = cnf.filter((o) => !((o >> k) & 1)).length;
      gD.append(T(G.X0 + (k + 0.5) * G.SW, fy, String(n), { w: 700, s: G.hd, c: n ? 'var(--ok)' : 'var(--err)' }));
    }
    if (scan) gD.append(T(G.MX, fy, bits(scan.b.m), { m: 1, w: 700, c: 'var(--accent)' }));

    wlBox.innerHTML = '';
    wlBox.append(el('b', { text: 'Waitlist:' }));
    if (!wl.length) wlBox.append(el('span', { class: 'muted', text: charted ? 'cleared at charting' : 'empty' }));
    wl.forEach((w, i) => wlBox.append(el('button', { class: 'btn', style: { padding: '2px 8px', fontSize: '13px' }, text: `WL ${i + 1} · #${w.id} ${leg(w)}`, onclick: () => cancel(w) })));
    const sold = cnf.reduce((a, o) => a + pc(o), 0), clean = cnf.filter((o) => !o).length;
    statEl.innerHTML = '';
    Object.entries({ CNF: Object.values(book).filter((b) => b.st === 'CNF').length, RAC: racq.length, WL: wl.length, 'berth-km sold': `${sold}/${NB * NS} (${Math.round(sold / (NB * NS) * 100)}%)`, 'clean berths': clean, 'A→F bookable': pick(cnf, 31, 'first') >= 0 ? 'yes' : 'no (WL/RAC)', 'refunded at chart': refunds })
      .forEach(([k, v]) => statEl.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  ctx.loop((dt) => {
    if (!scan || ctx.reduced) return;
    scan.t += dt;
    if (scan.t >= (scan.fast ? 140 : 420)) { scan.t = 0; scan.k++; if (scan.k >= scan.steps.length) { scan.k = scan.steps.length - 1; finish(); return; } }
    render();
  });
  ctx.onResize((n) => { G = n ? GEO.narrow : GEO.wide; drawStatic(); render(); });

  // seed: three end-to-end trips, a berth shared A→C + C→F, then RAC
  reset();
  [[0, 5], [0, 5], [0, 5], [0, 2], [2, 5], [0, 3], [1, 5], [0, 5], [0, 4]].forEach(([f, t]) => { const b = { id: ++seq, f, t, m: mask(f, t) }; if (!place(b)) { b.st = 'WL'; wl.push(b); } book[b.id] = b; });
  drawStatic(); render();
  say('Seeded: B4 carries <b>#4 A→C</b> and <b>#5 C→F</b> on one berth (mask 11111). A→F is now RAC/WL, yet short legs are still free. Watch the bottom row.');
  let shown = false;
  ctx.onVisible((v) => { if (v && !shown) { shown = true; setTimeout(() => request(3, 5), 500); } });
});
