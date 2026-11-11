/* Real Reed-Solomon over GF(2^8) (systematic, Cauchy parity rows): encode a sentence into k+m fragments spread over
   3 AZs, fail disks or a whole AZ, decode from any k survivors, repair, and a live durability model. */
SD.widget('object-storage', function (root, ctx) {
  const { el, svg } = ctx;
  // GF(256) with primitive polynomial x^8+x^4+x^3+x^2+1 (0x11d)
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  const inv = (a) => EXP[255 - LOG[a]];
  const SCHEMES = { rep3: { k: 1, m: 2, name: '3× replication' }, rs63: { k: 6, m: 3, name: 'RS(6,3)' }, rs104: { k: 10, m: 4, name: 'RS(10,4)' } };
  const TEXT = 'Erasure codes rebuild lost data from parity!';
  let sc, k, m, n, G, frags, status, azDown, azLost = [], reads, scheme = 'rs63', afr = 2, rep = 24;

  function generator() { // systematic: identity rows, then Cauchy rows 1/(x_i ^ y_j) with x_i = k+i, y_j = j
    if (scheme === 'rep3') return Array.from({ length: n }, () => [1]);
    const g = [];
    for (let i = 0; i < k; i++) g.push(Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
    for (let i = 0; i < m; i++) g.push(Array.from({ length: k }, (_, j) => inv((k + i) ^ j)));
    return g;
  }
  function encode(data) {
    const L = Math.ceil(data.length / k), d = [];
    for (let j = 0; j < k; j++) { const f = new Uint8Array(L).fill(32); f.set(data.slice(j * L, (j + 1) * L)); d.push(f); }
    return G.map((row) => { const out = new Uint8Array(L); row.forEach((c, j) => { if (c) for (let b = 0; b < L; b++) out[b] ^= mul(c, d[j][b]); }); return out; });
  }
  function invert(M) { // Gauss-Jordan in GF(256)
    const A = M.map((r, i) => r.concat(Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))));
    for (let c = 0; c < k; c++) {
      let p = c; while (p < k && !A[p][c]) p++;
      if (p === k) return null;
      [A[c], A[p]] = [A[p], A[c]];
      const s = inv(A[c][c]); A[c] = A[c].map((v) => mul(v, s));
      for (let r = 0; r < k; r++) if (r !== c && A[r][c]) { const f = A[r][c]; A[r] = A[r].map((v, j) => v ^ mul(f, A[c][j])); }
    }
    return A.map((r) => r.slice(k));
  }
  function decode(avail) { // any k surviving fragment indices → original k data fragments
    const S = avail.slice(0, k), Mi = invert(S.map((i) => G[i]));
    const L = frags[0].length;
    return Array.from({ length: k }, (_, j) => { const out = new Uint8Array(L); S.forEach((idx, t) => { const c = Mi[j][t]; if (c) for (let b = 0; b < L; b++) out[b] ^= mul(c, frags[idx][b]); }); return out; });
  }
  const label = (i) => (i < k ? (scheme === 'rep3' ? 'Copy 1' : 'D' + (i + 1)) : scheme === 'rep3' ? 'Copy ' + (i + 1) : 'P' + (i - k + 1));
  const alive = () => status.map((s, i) => (s !== 'lost' ? i : -1)).filter((i) => i >= 0);

  function reset() {
    sc = SCHEMES[scheme]; k = sc.k; m = sc.m; n = k + m; G = generator();
    frags = encode(new TextEncoder().encode(TEXT));
    status = frags.map(() => 'ok'); azDown = [false, false, false]; azLost = []; reads = 0;
    if (typeof azBtn !== 'undefined') azBtn.textContent = '⚡ AZ-a outage';
    result.innerHTML = `Stored "<b>${TEXT}</b>" as ${n} fragments (${sc.name}, ${(n / k).toFixed(1)}× bytes). Any ${k} of them can rebuild it.`;
    paint();
  }

  // controls
  const schemeBtns = Object.keys(SCHEMES).map((id) => { const b = el('button', { class: 'btn', text: SCHEMES[id].name }); b.addEventListener('click', () => { scheme = id; reset(); say(`Switched to <b>${SCHEMES[id].name}</b>.`); }); return [id, b]; });
  const readBtn = el('button', { class: 'btn primary', text: '👁 Read object' });
  const repBtn = el('button', { class: 'btn primary', text: '🛠 Repair' });
  const rndBtn = el('button', { class: 'btn', text: '💥 Fail random disk' });
  const azBtn = el('button', { class: 'btn', text: '⚡ AZ-a outage' });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  root.append(el('div', { class: 'w-controls' }, ...schemeBtns.map((x) => x[1])));
  root.append(el('div', { class: 'w-controls' }, readBtn, repBtn, rndBtn, azBtn, resetBtn));
  const S_ = svg('svg', { role: 'img', 'aria-label': 'Fragments across availability zones' });
  const g = svg('g'); S_.append(g);
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '600px' } }, S_));
  const result = el('div', { class: 'w-log', style: { maxHeight: 'none', fontSize: '13px' } });
  const stats = el('div', { class: 'w-stats' });
  const aIn = el('input', { type: 'range', min: 0.5, max: 8, step: 0.5, value: afr, 'aria-label': 'Annual failure rate' });
  const tIn = el('input', { type: 'range', min: 1, max: 168, step: 1, value: rep, 'aria-label': 'Repair time' });
  const aOut = el('b', { text: afr + '%' }), tOut = el('b', { text: rep + ' h' });
  aIn.addEventListener('input', () => { afr = +aIn.value; aOut.textContent = afr + '%'; paint(); });
  tIn.addEventListener('input', () => { rep = +tIn.value; tOut.textContent = rep + ' h'; paint(); });
  const model = el('div', { class: 'w-log', style: { maxHeight: 'none' } });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(result, stats, el('div', { class: 'w-controls', style: { marginTop: '12px' } }, el('label', null, 'Disk AFR ', aOut, aIn), el('label', null, 'Rebuild time ', tOut, tIn)), model, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }

  function fail(i, why) { if (status[i] === 'lost') return; status[i] = 'lost'; say(`💥 ${why || 'Disk holding'} <b>${label(i)}</b> (AZ-${'abc'[i % 3]}) lost.`); }
  readBtn.addEventListener('click', () => {
    const av = alive();
    if (av.length < k) { result.innerHTML = `<span style="color:var(--err)">✖ Unreadable:</span> ${av.length} of ${n} fragments left, need ${k}.` + (azDown.some(Boolean) ? ' The data comes back when the AZ does. If those disks were really destroyed, it is <b>lost</b>.' : ' <b>Data lost.</b>'); return; }
    const dataOk = av.filter((i) => i < k).length === k;
    const use = dataOk ? av.filter((i) => i < k) : av;
    const d = decode(scheme === 'rep3' ? av : use);
    const txt = new TextDecoder().decode(Uint8Array.from(d.flatMap((f) => Array.from(f)))).trimEnd();
    reads += k;
    result.innerHTML = `✅ "<b>${txt}</b>"<br>${scheme === 'rep3' ? `Read <b>${label(av[0])}</b>: one disk, no decoding.` : dataOk ? `Fast path: read D1–D${k} directly (systematic code), no decoding.` : `Decoded from <b>${use.slice(0, k).map(label).join(', ')}</b>: inverted a ${k}×${k} matrix over GF(256).`}`;
  });
  repBtn.addEventListener('click', () => {
    const lost = status.map((s, i) => (s === 'lost' ? i : -1)).filter((i) => i >= 0);
    if (!lost.length) { say('Nothing to repair.'); return; }
    const av = alive();
    if (av.length < k) { say(`<span style="color:var(--err)">Cannot repair</span>: only ${av.length} fragments survive, need ${k}.`); return; }
    const d = decode(av), fixed = [], waiting = [];
    lost.forEach((i) => {
      if (azDown[i % 3]) { waiting.push(label(i)); return; }
      const out = new Uint8Array(d[0].length); G[i].forEach((c, j) => { if (c) for (let b = 0; b < out.length; b++) out[b] ^= mul(c, d[j][b]); });
      frags[i] = out; status[i] = 'rebuilt'; fixed.push(label(i)); reads += scheme === 'rep3' ? 1 : k;
    });
    if (fixed.length) say(`🛠 Rebuilt ${fixed.join(', ')} on spare disks: read ${scheme === 'rep3' ? '1 copy' : k + ' fragments'} for each.`);
    if (waiting.length) say(`⏳ ${waiting.join(', ')} wait: AZ-a is down. (Re-placing them in other AZs would put more than m fragments in one zone.)`);
    paint();
  });
  rndBtn.addEventListener('click', () => { const c = alive().filter((i) => !azDown[i % 3]); if (c.length) fail(c[Math.floor(Math.random() * c.length)]); paint(); });
  azBtn.addEventListener('click', () => {
    azDown[0] = !azDown[0];
    if (azDown[0]) { azLost = []; for (let i = 0; i < n; i += 3) if (status[i] !== 'lost') { azLost.push(i); fail(i, 'AZ-a outage:'); } }
    else { azLost.forEach((i) => { status[i] = 'ok'; }); azLost = []; say('⚡ AZ-a is back. Its disks were intact, so its fragments return.'); }
    azBtn.textContent = azDown[0] ? '⚡ Restore AZ-a' : '⚡ AZ-a outage';
    paint();
  });
  resetBtn.addEventListener('click', () => { reset(); say('Reset.'); });

  function nines(kk, mm) {
    const nn = kk + mm, lam = afr / 100 / 8766; let ff = 1; for (let i = nn - mm; i <= nn; i++) ff *= i;
    return -Math.log10(ff * Math.pow(lam, mm + 1) * Math.pow(rep, mm) * 8766);
  }
  function paint() {
    schemeBtns.forEach(([id, b]) => b.classList.toggle('primary', id === scheme));
    const rows = Math.ceil(n / 3), H = 34 + rows * 50;
    S_.setAttribute('viewBox', `0 0 360 ${H}`);
    g.innerHTML = '';
    for (let c = 0; c < 3; c++) {
      const x = 4 + c * 119;
      const cnt = Array.from({ length: n }, (_, i) => i).filter((i) => i % 3 === c).length;
      g.append(svg('rect', { x, y: 2, width: 113, height: H - 4, rx: 9, fill: azDown[c] ? 'color-mix(in srgb, var(--err) 8%, var(--surface))' : 'var(--surface-2)', stroke: azDown[c] ? 'var(--err)' : 'var(--border)', 'stroke-dasharray': azDown[c] ? '5 4' : '' }));
      g.append(svg('text', { x: x + 8, y: 22, style: 'font:700 14px var(--sans)', fill: azDown[c] ? 'var(--err)' : 'var(--text-2)', text: 'AZ-' + 'abc'[c] + (azDown[c] ? ' down' : ' · ' + cnt) }));
    }
    for (let i = 0; i < n; i++) {
      const c = i % 3, r = Math.floor(i / 3), x = 9 + c * 119, y = 32 + r * 50, st = status[i];
      const box = svg('rect', { x, y, width: 103, height: 44, rx: 7, style: 'cursor:pointer', 'stroke-width': st === 'ok' ? 1 : 2,
        fill: st === 'lost' ? 'var(--surface)' : i < k ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'color-mix(in srgb, var(--warn) 12%, var(--surface))',
        stroke: st === 'lost' ? 'var(--err)' : st === 'rebuilt' ? 'var(--ok)' : 'var(--border)', 'stroke-dasharray': st === 'lost' ? '4 3' : '' });
      box.addEventListener('click', () => { if (!azDown[c]) { fail(i); paint(); } });
      g.append(box);
      g.append(svg('text', { x: x + 7, y: y + 18, style: 'font:700 14px var(--sans);pointer-events:none', fill: st === 'lost' ? 'var(--err)' : 'var(--text)', text: label(i) + (st === 'lost' ? ' ✖' : st === 'rebuilt' ? ' ✓' : '') }));
      const f = frags[i];
      const preview = st === 'lost' ? 'lost' : i < k ? '"' + new TextDecoder().decode(f.slice(0, 8)).replace(/ /g, '·') + (f.length > 8 ? '…' : '') + '"' : Array.from(f.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join(' ');
      g.append(svg('text', { x: x + 7, y: y + 36, style: 'font:500 14px var(--mono);pointer-events:none', fill: st === 'lost' ? 'var(--err)' : 'var(--text-2)', text: preview }));
    }
    const lost = status.filter((s) => s === 'lost').length;
    stats.innerHTML = '';
    [['scheme', sc.name], ['overhead', (n / k).toFixed(1) + '×'], ['survives any', m + ' lost'], ['lost now', lost + ' / ' + n], ['repair + read I/O', reads + ' fragment reads']]
      .forEach(([a, b]) => stats.append(el('span', { class: 'w-stat', html: `${a}: <b>${b}</b>`, style: a === 'lost now' && lost ? { color: lost > m ? 'var(--err)' : 'var(--warn)' } : {} })));
    model.innerHTML = '<b>Durability model</b> (independent failures, per stripe-year): P ≈ 8766 h × n(n−1)…(n−m) · λ<sup>m+1</sup> · T<sup>m</sup><br>' +
      Object.values(SCHEMES).map((s) => `${s.name}: ${((s.k + s.m) / s.k).toFixed(1)}× · survives ${s.m} · <b>${nines(s.k, s.m).toFixed(1)} nines</b>${s === sc ? ' ◀' : ''}`).join('<br>');
  }
  reset();
  say('Tap disks to fail them. With more than m lost, Read fails. Try the AZ outage with RS(6,3) and then with RS(10,4).');
});
