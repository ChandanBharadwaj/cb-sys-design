/* Consistent-hash ring with vnodes, preference lists, W/R quorums, async replication, sloppy quorum with hinted
   handoff, read repair and anti-entropy. Tap a node to kill / revive it. */
SD.widget('kv-store', function (root, ctx) {
  const { el, svg } = ctx;
  const W_ = 360, H_ = 342, CX = 180, CY = 168, RR = 98, NR = 138;
  const IDS = ['A', 'B', 'C', 'D', 'E', 'F'], VN = 4, KEYS = ['cart:alice', 'user:42', 'session:9f', 'item:7781'];
  const h32 = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return h >>> 0; };
  const nodes = IDS.map((id, i) => ({ id, i, up: true, store: {}, hints: [], col: `hsl(${i * 60 + 200}, 60%, 52%)` }));
  const tokens = [];
  nodes.forEach((n) => { for (let j = 0; j < VN; j++) tokens.push({ pos: h32(n.id + '#' + j) / 4294967296, node: n }); });
  tokens.sort((a, b) => a.pos - b.pos);
  let N = 3, W = 2, R = 2, sloppy = false, rrepair = true, ki = 0, now = 0;
  const ver = {}, acked = {}, pending = [];
  let lastRead = null;

  function ring(key) { // all nodes in clockwise order from hash(key), vnodes of the same host skipped
    const p = h32(key) / 4294967296, out = [];
    let i = tokens.findIndex((t) => t.pos >= p); if (i < 0) i = 0;
    for (let k = 0; k < tokens.length && out.length < nodes.length; k++) { const n = tokens[(i + k) % tokens.length].node; if (!out.includes(n)) out.push(n); }
    return out;
  }
  const key = () => KEYS[ki];
  const vOf = (n, k) => n.store[k] || 0;

  // controls
  const wBtn = el('button', { class: 'btn primary', text: '✎ Write' });
  const rBtn = el('button', { class: 'btn primary', text: '👁 Read' });
  const kBtn = el('button', { class: 'btn', text: 'Next key' });
  const aeBtn = el('button', { class: 'btn', text: '⟳ Anti-entropy' });
  const slBtn = el('button', { class: 'btn', text: 'Sloppy quorum: off' });
  const rrBtn = el('button', { class: 'btn', text: 'Read repair: on' });
  const mk = (lab, get, set) => {
    const o = el('b', { text: get() }), i = el('input', { type: 'range', min: 1, max: 5, value: get(), 'aria-label': lab, style: { width: '80px' } });
    i.addEventListener('input', () => { set(+i.value); sync(); });
    return { o, i, lab: el('label', null, lab + ' ', o, i) };
  };
  const cN = mk('N', () => N, (v) => { N = v; }), cW = mk('W', () => W, (v) => { W = v; }), cR = mk('R', () => R, (v) => { R = v; });
  function sync() { W = Math.min(W, N); R = Math.min(R, N); [[cN, N], [cW, W], [cR, R]].forEach(([c, v]) => { c.o.textContent = v; c.i.value = v; }); paint(); }
  root.append(el('div', { class: 'w-controls' }, wBtn, rBtn, kBtn, aeBtn));
  root.append(el('div', { class: 'w-controls' }, cN.lab, cW.lab, cR.lab));
  root.append(el('div', { class: 'w-controls' }, slBtn, rrBtn));
  const S_ = svg('svg', { viewBox: `0 0 ${W_} ${H_}`, role: 'img', 'aria-label': 'Consistent hash ring' });
  const g = svg('g');
  S_.append(g);
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '600px' } }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); }
  say('Write a few versions, kill one replica, write again, then read with different R. Try R + W ≤ N to catch a stale read.');

  const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  function write() {
    const k = key(), all = ring(k), pl = all.slice(0, N);
    const live = pl.filter((n) => n.up), down = pl.filter((n) => !n.up);
    let targets = live.map((n) => ({ n, hint: null }));
    if (sloppy) { const fb = all.slice(N).filter((n) => n.up); down.forEach((d, i) => { if (fb[i]) targets.push({ n: fb[i], hint: d }); }); }
    if (targets.length < W) { say(`<span style="color:var(--err)">✖ UNAVAILABLE</span>: ${targets.length} reachable, W = ${W}. Nothing written.`); return; }
    const v = (ver[k] = (ver[k] || 0) + 1);
    const order = shuffle(targets);
    order.forEach((t, i) => {
      const apply = () => { if (!t.n.up) return; t.n.store[k] = Math.max(vOf(t.n, k), v); if (t.hint) t.n.hints.push({ target: t.hint, k, v }); };
      if (i < W) apply(); else pending.push({ at: now + 2000, apply, n: t.n });
    });
    acked[k] = v;
    const fast = order.slice(0, W).map((t) => t.n.id + (t.hint ? '(hint→' + t.hint.id + ')' : '')).join(', ');
    const slow = order.slice(W).map((t) => t.n.id).join(', ');
    say(`✎ ${k} = <b>v${v}</b> acked by ${fast} (W = ${W})${slow ? `; ${slow} get it in ~2 s` : ''}${down.length && !sloppy ? `; ${down.map((d) => d.id).join(', ')} down, will miss it` : ''}.`);
  }
  function read() {
    const k = key(), all = ring(k);
    const cand = sloppy ? all.filter((n) => n.up).slice(0, N) : all.slice(0, N).filter((n) => n.up);
    if (cand.length < R) { say(`<span style="color:var(--err)">✖ UNAVAILABLE</span>: only ${cand.length} replica(s) up, R = ${R}.`); lastRead = null; return; }
    const asked = shuffle(cand).slice(0, R), vals = asked.map((n) => vOf(n, k)), best = Math.max(...vals);
    const fresh = best >= (acked[k] || 0);
    lastRead = { ids: asked.map((n) => n.id), at: now };
    say(`👁 R = ${R} asked ${asked.map((n, i) => n.id + ':v' + vals[i]).join(', ')} → <b>v${best}</b> ` + (fresh ? '<span style="color:var(--ok)">fresh ✓</span>' : `<span style="color:var(--warn)">STALE: latest acked is v${acked[k]}</span>${R + W > N ? ' (sloppy quorum missed the overlap)' : ' (R + W ≤ N)'}`));
    if (rrepair && vals.some((x) => x < best)) { asked.forEach((n) => { if (vOf(n, k) < best) n.store[k] = best; }); say(`↺ Read repair pushed v${best} to ${asked.filter((n, i) => vals[i] < best).map((n) => n.id).join(', ')}.`); }
  }
  function toggle(n) {
    n.up = !n.up;
    if (!n.up) { say(`💥 Node ${n.id} is <b>down</b>. Writes in flight to it are lost.`); return; }
    say(`Node ${n.id} is back up.`);
    nodes.forEach((h) => { const mine = h.hints.filter((x) => x.target === n); if (!mine.length) return; mine.forEach((x) => { n.store[x.k] = Math.max(vOf(n, x.k), x.v); }); h.hints = h.hints.filter((x) => x.target !== n); say(`↪ ${h.id} replays ${mine.length} hint(s) to ${n.id} (hinted handoff).`); });
  }
  function antiEntropy() {
    let moved = 0;
    KEYS.forEach((k) => { const pl = ring(k).slice(0, N).filter((n) => n.up); const best = Math.max(0, ...pl.map((n) => vOf(n, k))); pl.forEach((n) => { if (vOf(n, k) < best) { n.store[k] = best; moved++; } }); });
    say(`⟳ Merkle-tree repair: compared range hashes, streamed ${moved} out-of-date key cop${moved === 1 ? 'y' : 'ies'}.`);
  }
  wBtn.addEventListener('click', () => { write(); paint(); });
  rBtn.addEventListener('click', () => { read(); paint(); });
  kBtn.addEventListener('click', () => { ki = (ki + 1) % KEYS.length; lastRead = null; say(`Key is now <b>${key()}</b>. Preference list: ${ring(key()).slice(0, N).map((n) => n.id).join(' → ')}`); paint(); });
  aeBtn.addEventListener('click', () => { antiEntropy(); paint(); });
  slBtn.addEventListener('click', () => { sloppy = !sloppy; slBtn.textContent = 'Sloppy quorum: ' + (sloppy ? 'on' : 'off'); paint(); });
  rrBtn.addEventListener('click', () => { rrepair = !rrepair; rrBtn.textContent = 'Read repair: ' + (rrepair ? 'on' : 'off'); });

  const ang = (p) => p * 2 * Math.PI - Math.PI / 2;
  function paint() {
    g.innerHTML = '';
    const k = key(), all = ring(k), pl = all.slice(0, N);
    g.append(svg('circle', { cx: CX, cy: CY, r: RR, fill: 'none', stroke: 'var(--border)', 'stroke-width': 6 }));
    tokens.forEach((t) => { const a = ang(t.pos); g.append(svg('line', { x1: CX + (RR - 8) * Math.cos(a), y1: CY + (RR - 8) * Math.sin(a), x2: CX + (RR + 8) * Math.cos(a), y2: CY + (RR + 8) * Math.sin(a), stroke: t.node.col, 'stroke-width': 3.5, opacity: t.node.up ? 1 : 0.3 })); });
    const ka = ang(h32(k) / 4294967296), kx = CX + RR * Math.cos(ka), ky = CY + RR * Math.sin(ka);
    g.append(svg('path', { d: `M${kx},${ky - 8} L${kx + 8},${ky} L${kx},${ky + 8} L${kx - 8},${ky} Z`, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 }));
    // centre text
    const ok = R + W > N;
    [[k, 'font:700 15px var(--mono)', 'var(--text)', -26], ['pref: ' + pl.map((n) => n.id).join(' → '), 'font:600 14px var(--sans)', 'var(--text-2)', -4],
      ['latest acked v' + (acked[k] || 0), 'font:600 14px var(--sans)', 'var(--text-2)', 18], [`R+W=${R + W} ${ok ? '>' : '≤'} N=${N}`, 'font:700 14px var(--mono)', ok ? 'var(--ok)' : 'var(--warn)', 40]]
      .forEach(([t, st, f, dy]) => g.append(svg('text', { x: CX, y: CY + dy, 'text-anchor': 'middle', style: st, fill: f, text: t })));
    const hintHolders = new Set(); nodes.forEach((n) => { if (n.hints.some((h) => h.k === k)) hintHolders.add(n); });
    nodes.forEach((n, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 3, x = CX + NR * Math.cos(a), y = CY + NR * Math.sin(a);
      const rank = pl.indexOf(n), read = lastRead && lastRead.ids.includes(n.id) && now - lastRead.at < 3000;
      const c = svg('circle', { cx: x, cy: y, r: 24, fill: n.up ? `color-mix(in srgb, ${n.col} 22%, var(--surface))` : 'var(--surface-2)', stroke: !n.up ? 'var(--err)' : rank >= 0 ? 'var(--accent)' : hintHolders.has(n) ? 'var(--warn)' : n.col,
        'stroke-width': rank >= 0 || hintHolders.has(n) ? 3.5 : 1.5, 'stroke-dasharray': n.up ? (hintHolders.has(n) && rank < 0 ? '5 3' : '') : '4 3', style: 'cursor:pointer' });
      c.addEventListener('click', () => { toggle(n); paint(); });
      g.append(c);
      g.append(svg('text', { x, y: y - 3, 'text-anchor': 'middle', style: 'font:800 15px var(--sans);pointer-events:none', fill: n.up ? 'var(--text)' : 'var(--err)', text: n.up ? n.id : n.id + '✖' }));
      g.append(svg('text', { x, y: y + 14, 'text-anchor': 'middle', style: 'font:600 14px var(--mono);pointer-events:none', fill: 'var(--text-2)', text: vOf(n, k) ? 'v' + vOf(n, k) : '–' }));
      if (rank >= 0) g.append(svg('text', { x: x + (x < CX ? -30 : 30), y: y - 16, 'text-anchor': 'middle', style: 'font:700 14px var(--sans)', fill: 'var(--accent)', text: '#' + (rank + 1) }));
      if (hintHolders.has(n)) g.append(svg('text', { x: x + (x < CX ? -30 : 30), y: y + 30, 'text-anchor': 'middle', style: 'font:700 14px var(--sans)', fill: 'var(--warn)', text: 'hint' }));
      if (read) g.append(svg('circle', { cx: x, cy: y, r: 29, fill: 'none', stroke: 'var(--ok)', 'stroke-width': 2, 'stroke-dasharray': '3 3' }));
    });
    stats.innerHTML = '';
    const up = pl.filter((n) => n.up).length;
    [['replicas up', up + ' / ' + N], ['writes need', W], ['reads need', R], ['in flight', pending.length], ['hints held', nodes.reduce((s, n) => s + n.hints.length, 0)]]
      .forEach(([a, b]) => stats.append(el('span', { class: 'w-stat', html: `${a}: <b>${b}</b>` })));
  }
  let acc = 0;
  ctx.loop((dt) => {
    now += Math.min(dt, 100);
    let changed = false;
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= now) { pending[i].apply(); pending.splice(i, 1); changed = true; }
    acc += dt;
    if (changed || acc > 500) { acc = 0; paint(); }
  });
  // seed: two acknowledged versions everywhere
  write(); write(); pending.forEach((p) => p.apply()); pending.length = 0;
  paint();
});
