/* Bloom-filter seen set (real double hashing, real FP formula) feeding per-host polite back queues. */
SD.widget('web-crawler', function (root, ctx) {
  const { el, svg } = ctx;
  const HOSTS = ['news.example', 'shop.example', 'blog.example', 'wiki.example'];
  const WORDS = ['about', 'cart', 'item', 'post', 'tag', 'page', 'help', 'sale', 'faq', 'team', 'jobs', 'docs', 'api', 'feed', 'world', 'tech'];
  let m = 128, k = 3, delay = 1.5, auto = !ctx.reduced;
  let bits, n, truth, lanes, now, fp, dupOk, newTested, fetched, lastPos = [];

  // controls
  const autoBtn = el('button', { class: 'btn primary', text: auto ? '⏸ Pause crawl' : '▶ Auto crawl' });
  autoBtn.addEventListener('click', () => { auto = !auto; autoBtn.textContent = auto ? '⏸ Pause crawl' : '▶ Auto crawl'; });
  const stepBtn = el('button', { class: 'btn', text: '⏭ Step 0.5 s' });
  stepBtn.addEventListener('click', () => { tick(0.5); draw(); });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  resetBtn.addEventListener('click', reset);
  const mBtns = [64, 128, 256].map((v) => { const b = el('button', { class: 'btn' + (v === m ? ' primary' : ''), text: 'm = ' + v }); b.addEventListener('click', () => { m = v; mBtns.forEach((x) => x.classList.toggle('primary', x === b)); reset(); }); return b; });
  const kOut = el('b', { text: k }), kIn = el('input', { type: 'range', min: 1, max: 8, value: k, 'aria-label': 'hash functions k' });
  kIn.addEventListener('input', () => { k = +kIn.value; kOut.textContent = k; reset(); });
  const dOut = el('b', { text: delay + ' s' }), dIn = el('input', { type: 'range', min: 0.5, max: 4, step: 0.5, value: delay, 'aria-label': 'politeness delay' });
  dIn.addEventListener('input', () => { delay = +dIn.value; dOut.textContent = delay + ' s'; });
  root.append(el('div', { class: 'w-controls' }, autoBtn, stepBtn, resetBtn));
  root.append(el('div', { class: 'w-controls' }, ...mBtns, el('label', null, 'k ', kOut, ' ', kIn), el('label', null, 'host delay ', dOut, ' ', dIn)));

  // desktop: 500-wide, 32 bit columns, one-line lanes. phone: 360-wide, 16 columns, two-line lanes, bigger text
  let G;
  const layout = (narrow) => { G = narrow ? { W: 360, COLS: 16, CS: 21, BX: 6, BY: 26, fT: 15, fU: 14, uMax: 38, LH: 52 } : { W: 500, COLS: 32, CS: 15, BX: 10, BY: 22, fT: 13, fU: 13, uMax: 48, LH: 38 }; };
  layout(ctx.narrow);
  const S_ = svg('svg', { viewBox: '0 0 500 330', role: 'img', 'aria-label': 'Bloom filter bits and host queues' });
  const gBits = svg('g'), gLanes = svg('g'), title = svg('text', { y: 16, fill: 'var(--text-2)' });
  const urlTxt = svg('text', { y: 0, fill: 'var(--text)' });
  S_.append(title, gBits, urlTxt, gLanes);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); }

  // hashing: FNV-1a + a murmur-style mix, combined as h1 + i*h2 (Kirsch–Mitzenmacher)
  function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  function mix(s) { let h = 0x9747b28c ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995); h ^= h >>> 15; } h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) | 1; }
  function positions(url) { const h1 = fnv(url), h2 = mix(url); const out = []; for (let i = 0; i < k; i++) out.push((h1 + i * h2) % m); return out; }

  function reset() {
    bits = new Uint8Array(m); n = 0; truth = new Set(); now = 0; fp = 0; dupOk = 0; newTested = 0; fetched = 0; lastPos = []; log.innerHTML = '';
    lanes = HOSTS.map((h) => ({ host: h, q: [], next: 0, done: 0, flash: 0 }));
    HOSTS.forEach((h) => discover(`https://${h}/`, true));
    say(`Bloom filter: m = ${m} bits, k = ${k} hashes. Seeds added for ${HOSTS.length} hosts.`);
    draw();
  }
  function randomUrl() {
    const known = [...truth];
    if (known.length && Math.random() < 0.3) return known[Math.floor(Math.random() * known.length)]; // genuinely seen before
    const h = HOSTS[Math.floor(Math.random() * HOSTS.length)];
    const w = () => WORDS[Math.floor(Math.random() * WORDS.length)];
    return `https://${h}/${w()}/${w()}-${Math.floor(Math.random() * 90 + 10)}`;
  }
  function discover(url, quiet) {
    const pos = positions(url); lastPos = pos;
    urlTxt.textContent = url.replace('https://', '').slice(0, G.uMax);
    const allSet = pos.every((p) => bits[p]);
    if (allSet) {
      if (truth.has(url)) { dupOk++; if (!quiet) say(`<span style="color:var(--text-3)">seen ✓ ${url.replace('https://', '')}</span>`); }
      else { fp++; newTested++; say(`<span style="color:var(--err)">✖ FALSE POSITIVE: new URL ${url.replace('https://', '')} skipped. Bits [${pos.join(', ')}] were set by other URLs.</span>`); }
      return;
    }
    newTested++;
    pos.forEach((p) => { bits[p] = 1; });
    truth.add(url); n++;
    const lane = lanes.find((l) => url.includes('//' + l.host + '/'));
    lane.q.push(url.replace('https://' + lane.host, '') || '/');
    if (!quiet) say(`new → ${lane.host} queue: ${url.replace('https://', '')}`);
  }
  function tick(dt) {
    now += dt;
    lanes.forEach((l) => {
      l.flash = Math.max(0, l.flash - dt);
      if (l.q.length && now >= l.next) {
        l.q.shift(); l.done++; fetched++; l.next = now + delay; l.flash = 0.4; // one fetch per host per delay
        const links = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < links; i++) discover(randomUrl());
      }
    });
  }
  function fpTheory() { return Math.pow(1 - Math.exp(-k * n / m), k); }

  function draw() {
    const { W, COLS, CS, BX, BY, LH } = G, narrow = W < 400;
    const rows = m / COLS;
    title.setAttribute('x', BX); title.setAttribute('style', `font:700 ${G.fT}px var(--sans)`);
    urlTxt.setAttribute('x', BX); urlTxt.setAttribute('style', `font:${G.fU}px var(--mono)`);
    title.textContent = `Bloom filter: ${m} bits · k = ${k}`;
    gBits.innerHTML = '';
    for (let i = 0; i < m; i++) {
      const x = BX + (i % COLS) * CS, y = BY + Math.floor(i / COLS) * CS;
      const hit = lastPos.includes(i);
      gBits.append(svg('rect', { x, y, width: CS - 2, height: CS - 2, rx: 2, fill: bits[i] ? 'color-mix(in srgb, var(--accent) 65%, var(--surface))' : 'var(--surface-2)', stroke: hit ? 'var(--warn)' : 'var(--border)', 'stroke-width': hit ? 2 : 1 }));
    }
    const uy = BY + rows * CS + 18;
    urlTxt.setAttribute('y', uy);
    gLanes.innerHTML = '';
    const ly0 = uy + 22, LW = W - 2 * BX;
    S_.setAttribute('viewBox', `0 0 ${W} ${Math.ceil(ly0 + 12 + lanes.length * LH + 2)}`);
    gLanes.append(svg('text', { x: BX, y: ly0 + 2, style: `font:700 ${G.fT}px var(--sans)`, fill: 'var(--text-2)', text: (narrow ? 'Host queues: 1 fetch / ' : 'Back queues: one per host, ≤ 1 fetch / ') + delay + ' s' }));
    lanes.forEach((l, i) => {
      const y = ly0 + 12 + i * LH;
      const wait = Math.max(0, l.next - now);
      gLanes.append(svg('rect', { x: BX, y, width: LW, height: LH - 6, rx: 6, fill: l.flash ? 'color-mix(in srgb, var(--ok) 20%, var(--surface))' : 'var(--surface)', stroke: 'var(--border)' }));
      if (narrow) {
        gLanes.append(svg('text', { x: BX + 8, y: y + 19, style: 'font:600 15px var(--mono)', fill: 'var(--text)', text: l.host }),
          svg('text', { x: BX + LW - 8, y: y + 19, 'text-anchor': 'end', style: 'font:14px var(--mono)', fill: 'var(--text-3)', text: (l.q[0] || '').slice(0, 14) }),
          svg('text', { x: BX + 8, y: y + 37, style: 'font:14px var(--mono)', fill: 'var(--text-2)', text: `${l.q.length} queued · ${l.done} fetched` }));
      } else {
        gLanes.append(svg('text', { x: BX + 8, y: y + LH / 2 + 1, style: 'font:600 14px var(--mono)', fill: 'var(--text)', text: l.host }),
          svg('text', { x: BX + 128, y: y + LH / 2 + 1, style: 'font:13px var(--mono)', fill: 'var(--text-2)', text: `${l.q.length} queued · ${l.done} fetched` }),
          svg('text', { x: BX + 330, y: y + LH / 2 + 1, style: 'font:12px var(--mono)', fill: 'var(--text-3)', text: (l.q[0] || '').slice(0, 18) }));
      }
      gLanes.append(svg('rect', { x: BX + 4, y: y + LH - 10, width: Math.max(0, (LW - 8) * (wait / delay)), height: 3, rx: 1.5, fill: 'var(--warn)' }));
    });
    const setPct = bits.reduce((a, b) => a + b, 0) / m;
    stats.innerHTML = '';
    [['URLs inserted (n)', n], ['bits set', Math.round(setPct * 100) + '%'], ['FP theory (1−e^(−kn/m))^k', (fpTheory() * 100).toFixed(1) + '%'], ['FP observed', newTested ? (fp / newTested * 100).toFixed(1) + '% (' + fp + '/' + newTested + ')' : '-'], ['true dups skipped', dupOk], ['pages fetched', fetched], ['optimal k for n', n ? Math.max(1, Math.round(m / n * Math.LN2)) : '-']]
      .forEach(([a, b]) => stats.append(el('span', { class: 'w-stat', html: `${a}: <b>${b}</b>` })));
  }

  ctx.onResize((n) => { layout(n); draw(); });
  reset();
  if (!ctx.reduced) ctx.loop((dt) => { if (!auto) return; tick(Math.min(dt, 100) / 1000); draw(); });
  say('Watch the filter fill up: once about half the bits are set, false positives start dropping genuinely new URLs.');
});
