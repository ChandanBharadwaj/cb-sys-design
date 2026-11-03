/* Three-region replication simulator: async links with lag and partitions; LWW vs PN-counter CRDT vs home-region
   routing on one counter; region failure with RPO (unreplicated writes lost) and survivor utilisation vs headroom. */
SD.widget('multi-region', function (root, ctx) {
  const { el, svg } = ctx;
  const NAMES = ['us-east', 'eu-west', 'ap-south'], SH = ['US', 'EU', 'AP'];
  const SHARE = [0.45, 0.35, 0.20];                      // share of global peak traffic (illustrative)
  const RTT = { '0-1': 75, '1-2': 120, '0-2': 190 };     // illustrative round trips, ms
  const LINKS = [[0, 1], [1, 2], [0, 2]];
  const lk = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  let mode = 'lww', lagS = 2, util = 0.6, cut = false, now = 0, loopH = null, gen = 0;
  let reg, msgs, writes, acked, lostRPO, home, epoch, rehomeAt, lastLat;
  function reset() {
    reg = NAMES.map(() => ({ up: true, lww: { v: 0, ts: 0, o: -1 }, crdt: [0, 0, 0], hv: { v: 0, ver: 0, ep: 1 } }));
    msgs = []; writes = []; acked = 0; lostRPO = 0; home = 0; epoch = 1; rehomeAt = null; lastLat = '–';
  }
  reset();
  const val = (r) => mode === 'lww' ? reg[r].lww.v : mode === 'crdt' ? reg[r].crdt.reduce((a, b) => a + b, 0) : reg[r].hv.v;
  const blocked = (a, b) => cut && lk(a, b) === '0-1';
  const live = () => [0, 1, 2].filter((r) => reg[r].up);

  function build(narrow) {
    const my = ++gen;
    if (loopH) loopH.stop();
    root.innerHTML = '';
    const W = narrow ? 360 : 600, H = narrow ? 470 : 250;
    const F = narrow ? { name: 15, big: 24, small: 14 } : { name: 14, big: 22, small: 13 };
    const BW = narrow ? 236 : 150, BH = narrow ? 132 : 150;
    const box = narrow ? [0, 1, 2].map((i) => ({ x: 12, y: 8 + i * 160 })) : [0, 1, 2].map((i) => ({ x: 15 + i * 215, y: 82 }));
    // link paths (centre points of box edges)
    function linkPath(a, b) {
      if (narrow) {
        const ya = box[a].y + BH / 2, yb = box[b].y + BH / 2, x = 12 + BW, bulge = (a === 0 && b === 2) ? 104 : 48;
        return `M${x} ${ya} C${x + bulge} ${ya}, ${x + bulge} ${yb}, ${x} ${yb}`;
      }
      if (a === 0 && b === 2) { const xa = box[0].x + BW / 2, xb = box[2].x + BW / 2; return `M${xa} ${box[0].y} C${xa} 8, ${xb} 8, ${xb} ${box[2].y}`; }
      const y = box[a].y + BH / 2; return `M${box[a].x + BW} ${y} L${box[b].x} ${y}`;
    }
    // ---- controls ----
    const mBtns = [['lww', 'LWW'], ['crdt', 'CRDT counter'], ['home', 'Home region (US)']].map(([m, t]) => {
      const b = el('button', { class: 'btn' + (mode === m ? ' primary' : ''), text: t });
      b.onclick = () => { mode = m; reset(); mBtns.forEach((x) => x.classList.toggle('primary', x === b)); say(`Mode → <b>${t}</b>. Counter reset to 0 everywhere.`); paint(); };
      return b;
    });
    const wBtn = (r) => { const b = el('button', { class: 'btn', text: '+1 ' + SH[r] }); b.onclick = () => write(r); return b; };
    const both = el('button', { class: 'btn primary', text: '▶ US + EU at once' });
    both.onclick = () => { write(0); write(1); };
    const cutBtn = el('button', { class: 'btn', text: '✂ Cut US↔EU' });
    cutBtn.onclick = () => { cut = !cut; cutBtn.textContent = cut ? '🔗 Heal US↔EU' : '✂ Cut US↔EU'; say(cut ? 'Partition: US↔EU messages are held until the link heals.' : 'Link healed: held messages continue.'); paint(); };
    const failBtn = el('button', { class: 'btn', text: '💥 Fail US' });
    failBtn.onclick = () => toggleFail(0);
    const resetBtn = el('button', { class: 'btn', text: 'Reset' });
    resetBtn.onclick = () => { reset(); cut = false; cutBtn.textContent = '✂ Cut US↔EU'; say('Reset.'); paint(); };
    const lagOut = el('b', { text: lagS + ' s' });
    const lagIn = el('input', { type: 'range', min: 0.5, max: 5, step: 0.5, value: lagS, 'aria-label': 'Replication lag' });
    lagIn.addEventListener('input', () => { lagS = +lagIn.value; lagOut.textContent = lagS + ' s'; });
    const uOut = el('b', { text: Math.round(util * 100) + ' %' });
    const uIn = el('input', { type: 'range', min: 40, max: 90, step: 5, value: util * 100, 'aria-label': 'Normal utilisation' });
    uIn.addEventListener('input', () => { util = +uIn.value / 100; uOut.textContent = uIn.value + ' %'; paint(); });
    root.append(el('div', { class: 'w-controls' }, ...mBtns),
      el('div', { class: 'w-controls' }, both, wBtn(0), wBtn(1), wBtn(2), cutBtn, failBtn, resetBtn),
      el('div', { class: 'w-controls' }, el('label', null, 'Replication lag ', lagOut, ' ', lagIn), el('label', null, 'Normal utilisation ', uOut, ' ', uIn)));
    // ---- svg ----
    const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Three regions replicating one counter' });
    const gL = svg('g'), gB = svg('g'), gM = svg('g');
    S_.append(gL, gB, gM);
    const paths = {};
    LINKS.forEach(([a, b]) => {
      const p = svg('path', { d: linkPath(a, b), fill: 'none', stroke: 'var(--border)', 'stroke-width': 3 });
      gL.append(p); paths[lk(a, b)] = p;
    });
    const mid = paths['0-1'].getPointAtLength(paths['0-1'].getTotalLength() / 2);
    const cutMark = svg('text', { x: mid.x + (narrow ? 8 : 0), y: mid.y + (narrow ? 5 : -10), 'text-anchor': 'middle', fill: 'var(--err)', style: `font:700 ${F.small + 2}px var(--sans)`, text: '✂' });
    gL.append(cutMark);
    const T = (x, y, o) => svg('text', Object.assign({ x, y, fill: 'var(--text)' }, o));
    const ui = box.map((b, r) => {
      const g = svg('g', { style: 'cursor:pointer' });
      const rect = svg('rect', { x: b.x, y: b.y, width: BW, height: BH, rx: 10, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 2 });
      const name = T(b.x + 10, b.y + 22, { style: `font:700 ${F.name}px var(--sans)` });
      const big = T(b.x + 10, b.y + (narrow ? 54 : 58), { style: `font:800 ${F.big}px var(--mono)` });
      const det = T(b.x + 10, b.y + (narrow ? 78 : 84), { fill: 'var(--text-2)', style: `font:600 ${F.small}px var(--mono)` });
      const bw = BW - 20, by = b.y + (narrow ? 90 : 98);
      const barBg = svg('rect', { x: b.x + 10, y: by, width: bw, height: 10, rx: 4, fill: 'var(--border)' });
      const bar = svg('rect', { x: b.x + 10, y: by, width: 0, height: 10, rx: 4 });
      const mark = svg('line', { x1: b.x + 10 + bw * 0.85 / 1.5, x2: b.x + 10 + bw * 0.85 / 1.5, y1: by - 3, y2: by + 13, stroke: 'var(--text-3)', 'stroke-width': 2 });
      const ut = T(b.x + 10, by + (narrow ? 30 : 34), { fill: 'var(--text-2)', style: `font:600 ${F.small}px var(--sans)` });
      g.append(rect, name, big, det, barBg, bar, mark, ut);
      g.addEventListener('click', () => toggleFail(r));
      gB.append(g);
      return { rect, name, big, det, bar, ut, bw };
    });
    const stage = el('div', { class: 'w-stage', style: { maxWidth: narrow ? '420px' : '760px' } }, S_);
    root.append(stage, el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Dots on links: <b style="color:var(--accent)">●</b> replication · <b style="color:var(--warn)">●</b> write forwarded to home · <b style="color:var(--err)">●</b> held by partition. Load bar scale: 0–150 %; the tick is 85 %. <b>Tap a region</b> to fail or heal it.' }));
    const stats = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
    build.say = say;

    // ---- mechanics ----
    function send(from, to, kind, payload, dur, w) { msgs.push({ from, to, kind, payload, t0: now, t1: now + dur, w, dot: null }); }
    function replicate(from, payload, w) {
      [0, 1, 2].forEach((to) => { if (to !== from && reg[to].up) send(from, to, 'rep', payload, lagS * (0.8 + Math.random() * 0.4), w); });
    }
    function write(r0) {
      let r = r0;
      if (!reg[r].up) { const alt = live().sort((a, b) => RTT[lk(r0, a)] - RTT[lk(r0, b)])[0]; if (alt === undefined) return say('All regions are down.'); r = alt; say(`${SH[r0]} is down: steering sends this user to ${SH[r]}.`); }
      const w = { id: writes.length, origin: r, seen: new Set([r]) };
      if (mode === 'lww') {
        const cur = reg[r].lww, nv = { v: cur.v + 1, ts: now + r * 1e-6, o: r };
        reg[r].lww = nv; writes.push(w); acked++; lastLat = '≈ 5 ms (local)';
        say(`${SH[r]} read ${cur.v}, wrote <b>${nv.v}</b> @ t=${now.toFixed(2)} s`); replicate(r, nv, w);
      } else if (mode === 'crdt') {
        reg[r].crdt[r]++; writes.push(w); acked++; lastLat = '≈ 5 ms (local)';
        say(`${SH[r]} slot +1 → [${reg[r].crdt.join(', ')}]`); replicate(r, reg[r].crdt.slice(), w);
      } else if (r === home) {
        applyHome(r, w); lastLat = '≈ 5 ms (at home)';
      } else if (!reg[home].up || blocked(r, home)) {
        lastLat = 'refused'; say(`❌ ${SH[r]}: home ${SH[home]} unreachable. Write <b>refused</b>: consistent, not available.`);
      } else {
        const ms = RTT[lk(r, home)]; send(r, home, 'fwd', { ms }, ms / 1000 * 8, w);
        say(`${SH[r]} is not home → forward to ${SH[home]} (RTT ${ms} ms, shown 8× slower)`);
      }
      paint();
    }
    function applyHome(h, w) {
      const cur = reg[h].hv, nv = { v: cur.v + 1, ver: cur.ver + 1, ep: epoch };
      reg[h].hv = nv; writes.push(w); w.origin = h; w.seen = new Set([h]); acked++;
      say(`Home ${SH[h]} applied → <b>${nv.v}</b> (v${nv.ver}, epoch ${nv.ep})`); replicate(h, nv, w);
    }
    function deliver(m) {
      const R = reg[m.to];
      if (!R.up) return;
      if (m.kind === 'fwd') {
        if (m.to !== home) { lastLat = 'refused'; return say(`❌ Forwarded write reached ${SH[m.to]}, which is no longer home. Client retries at ${SH[home]}.`); }
        applyHome(m.to, { id: writes.length, origin: m.to, seen: new Set() }); lastLat = `≈ ${m.payload.ms + 5} ms (forwarded)`; return;
      }
      m.w.seen.add(m.to);
      if (mode === 'lww') {
        const a = m.payload, c = R.lww;
        if (a.ts > c.ts || (a.ts === c.ts && a.o > c.o)) {
          if (c.o !== -1 && c.o !== m.from && c.v >= a.v) say(`⚠ LWW at ${SH[m.to]}: ${SH[m.from]}'s ${a.v} (newer ts) overwrote ${SH[c.o]}'s ${c.v}. <b>An increment is lost.</b>`);
          R.lww = a;
        } else if (a.v <= c.v && a.o !== c.o) say(`⚠ LWW at ${SH[m.to]}: kept own ${c.v} (newer ts), dropped ${SH[m.from]}'s ${a.v}.`);
      } else if (mode === 'crdt') {
        R.crdt = R.crdt.map((x, i) => Math.max(x, m.payload[i]));
      } else {
        const a = m.payload, c = R.hv;
        if (a.ep > c.ep || (a.ep === c.ep && a.ver > c.ver)) R.hv = a;
        else if (a.ep < c.ep) say(`🛡 ${SH[m.to]} rejected a stale write from epoch ${a.ep} (fenced).`);
      }
    }
    function toggleFail(r) {
      const R = reg[r];
      if (R.up) {
        if (live().length === 1) return say('Keep at least one region alive.');
        R.up = false;
        const lost = writes.filter((w) => w.origin === r && ![...w.seen].some((x) => x !== r && reg[x].up));
        lostRPO += lost.length;
        const fwdLost = msgs.filter((m) => m.kind === 'fwd' && m.to === r).length;
        msgs = msgs.filter((m) => { const drop = m.from === r || m.to === r; if (drop && m.dot) m.dot.remove(); return !drop; });
        if (fwdLost) say(`${fwdLost} forwarded write(s) were in flight to ${SH[r]}: never acknowledged, so the client must retry (idempotency key).`);
        say(`💥 ${NAMES[r]} down. ${lost.length ? `<b>${lost.length} acknowledged write(s) never left it: lost (RPO).</b>` : 'All its writes had already replicated: RPO 0 this time.'}`);
        if (mode === 'home' && r === home) { rehomeAt = now + 1.2; say('Health checks failing… control plane will re-home the key.'); }
      } else {
        R.up = true;
        const src = live().filter((x) => x !== r);
        src.forEach((s) => { const o = reg[s]; R.crdt = R.crdt.map((x, i) => (s === src[0] ? o.crdt[i] : Math.max(x, o.crdt[i]))); });
        const best = (k, cmp) => src.map((s) => reg[s][k]).sort(cmp)[0];
        R.lww = best('lww', (a, b) => b.ts - a.ts); R.hv = best('hv', (a, b) => b.ep - a.ep || b.ver - a.ver);
        say(`↺ ${NAMES[r]} back. It re-syncs from the survivors; its unreplicated writes stay lost (or go to manual reconciliation).`);
      }
      failBtn.textContent = reg[0].up ? '💥 Fail US' : '↺ Heal US';
      paint();
    }
    // ---- paint ----
    function loadOf(r) {
      const L = live(); if (!reg[r].up) return null;
      const cap = (i) => SHARE[i] / util;
      const moved = [0, 1, 2].filter((i) => !reg[i].up).reduce((a, i) => a + SHARE[i], 0);
      const capLive = L.reduce((a, i) => a + cap(i), 0);
      return (SHARE[r] + moved * cap(r) / capLive) / cap(r);
    }
    function paint() {
      if (my !== gen) return;
      cutMark.style.display = cut ? '' : 'none';
      paths['0-1'].setAttribute('stroke', cut ? 'var(--err)' : 'var(--border)');
      paths['0-1'].setAttribute('stroke-dasharray', cut ? '6 6' : '');
      [0, 1, 2].forEach((r) => {
        const u = ui[r], R = reg[r], ld = loadOf(r);
        u.rect.setAttribute('stroke', !R.up ? 'var(--err)' : mode === 'home' && r === home ? 'var(--accent)' : 'var(--border)');
        u.rect.setAttribute('opacity', R.up ? 1 : 0.55);
        u.name.textContent = NAMES[r] + (!R.up ? ' · DOWN' : mode === 'home' && r === home ? ' · HOME' : '');
        u.big.textContent = R.up ? 'likes = ' + val(r) : '—';
        u.det.textContent = !R.up ? 'no traffic' : mode === 'lww' ? (R.lww.o < 0 ? 'no writes yet' : `ts ${R.lww.ts.toFixed(2)} · by ${SH[R.lww.o]}`) : mode === 'crdt' ? `slots [${R.crdt.join(', ')}]` : `v${R.hv.ver} · epoch ${R.hv.ep}`;
        const w = ld === null ? 0 : Math.min(1, ld / 1.5) * u.bw;
        u.bar.setAttribute('width', w);
        u.bar.setAttribute('fill', ld === null ? 'var(--border)' : ld > 1 ? 'var(--err)' : ld > 0.85 ? 'var(--warn)' : 'var(--ok)');
        u.ut.textContent = ld === null ? 'load 0 %' : `load ${Math.round(ld * 100)} %` + (ld > 1 ? ` · shed ${Math.round((1 - 1 / ld) * 100)} %` : '');
      });
      const L = live(), vals = L.map(val), conv = msgs.length === 0 && vals.every((v) => v === vals[0]);
      const v0 = conv ? vals[0] : null;
      const lostLww = conv ? Math.max(0, acked - v0 - lostRPO) : null;
      const st = {
        'acked writes': acked,
        'converged': conv ? 'yes, ' + v0 : 'not yet (' + msgs.length + ' in flight)',
        'lost to conflicts': lostLww === null ? '…' : lostLww,
        'lost in failover (RPO)': lostRPO,
        'last write latency': lastLat,
        'safe utilisation (lose biggest region)': Math.round((1 - Math.max(...SHARE)) * 100) + ' %'
      };
      stats.innerHTML = '';
      Object.entries(st).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
    // ---- loop ----
    loopH = ctx.loop((dt) => {
      const d = Math.min(dt, 100) / 1000; now += d;
      if (rehomeAt !== null && now >= rehomeAt) {
        rehomeAt = null;
        const nh = reg[1].up ? 1 : live()[0];
        home = nh; epoch++;
        say(`🔁 Control plane: majority write moves home → <b>${NAMES[nh]}</b>, epoch ${epoch}. Old-epoch writes will be rejected.`);
        paint();
      }
      let changed = false;
      msgs.forEach((m) => {
        if (blocked(m.from, m.to)) { m.t0 += d; m.t1 += d; }
        const p = Math.min(1, (now - m.t0) / (m.t1 - m.t0));
        if (!m.dot) { m.dot = svg('circle', { r: narrow ? 7 : 6, stroke: 'var(--surface)', 'stroke-width': 1.5 }); gM.append(m.dot); }
        const path = paths[lk(m.from, m.to)], len = path.getTotalLength();
        const q = blocked(m.from, m.to) ? Math.min(p, 0.42) : p;
        const pt = path.getPointAtLength((m.from < m.to ? q : 1 - q) * len);
        m.dot.setAttribute('cx', pt.x); m.dot.setAttribute('cy', pt.y);
        m.dot.setAttribute('fill', blocked(m.from, m.to) ? 'var(--err)' : m.kind === 'fwd' ? 'var(--warn)' : 'var(--accent)');
        m.dot.style.display = ctx.reduced ? 'none' : '';
        if (p >= 1 && !blocked(m.from, m.to)) { m.done = true; deliver(m); m.dot.remove(); changed = true; }
      });
      if (changed) { msgs = msgs.filter((m) => !m.done); paint(); }
    });
    paint();
    if (!writes.length) say('Try: LWW → <b>US + EU at once</b>. Then the same in CRDT and Home mode.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
