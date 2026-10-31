/* Base62 encoding by repeated division, with an optional bijective scramble (multiply by P mod 62^L). */
SD.widget('url-shortener', function (root, ctx) {
  const { el, svg } = ctx;
  const A = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const P = 1580030173n;                       // odd, not divisible by 31 → coprime with 62^L
  let id = 125000000123n, L = 7, scramble = false, run = 0;

  function inv(a, m) {                          // modular inverse by extended Euclid
    let [r0, r1, s0, s1] = [m, a % m, 0n, 1n];
    while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
    return ((s0 % m) + m) % m;
  }
  const M = () => 62n ** BigInt(L);
  function encode(n) {
    const m = M();
    let x = scramble ? (n * P) % m : n;
    const start = x, rows = [];
    do {
      const q = x / 62n, r = Number(x % 62n);
      rows.push({ x, q, r, ch: A[r] });
      x = q;
    } while (scramble ? rows.length < L : x > 0n);
    return { start, rows, code: rows.map((r) => r.ch).reverse().join('') };
  }
  function decode(code) {
    let x = 0n;
    for (const c of code) x = x * 62n + BigInt(A.indexOf(c));
    return scramble ? (x * inv(P, M())) % M() : x;
  }
  const fmtBig = (b) => b.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // controls
  const prev = el('button', { class: 'btn', text: '◀ id − 1' });
  const next = el('button', { class: 'btn primary', text: 'id + 1 ▶' });
  const rnd = el('button', { class: 'btn', text: '🎲 Random id' });
  const scr = el('button', { class: 'btn', text: '' });
  const lOut = el('b', { text: L });
  const lIn = el('input', { type: 'range', min: 5, max: 9, value: L, 'aria-label': 'Code length' });
  const setScr = () => { scr.textContent = scramble ? '⇄ Scramble: on' : '⇄ Scramble: off'; };
  prev.addEventListener('click', () => { if (id > 0n) id -= 1n; draw(true); });
  next.addEventListener('click', () => { id += 1n; draw(true); });
  rnd.addEventListener('click', () => { id = BigInt(Math.floor(Math.random() * Number(M()))); draw(true); });
  scr.addEventListener('click', () => { scramble = !scramble; setScr(); draw(true); });
  lIn.addEventListener('input', () => { L = +lIn.value; lOut.textContent = L; draw(true); });
  setScr();
  root.append(el('div', { class: 'w-controls' }, prev, next, rnd, scr, el('label', null, 'Length ', lOut, ' ', lIn)));

  // desktop 400-wide; phone 360-wide with 14-unit rows (≈13px on screen) and the scramble line split in two
  let narrow = ctx.narrow, W = narrow ? 360 : 400;
  const S = svg('svg', { viewBox: `0 0 ${W} 330`, role: 'img', 'aria-label': 'Base62 division steps' });
  const g = svg('g');
  S.append(g);
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '520px', margin: '0 auto' } }, S));
  const st = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(st, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); };
  const T = (x, y, t, style, fill, anchor) => { const n = svg('text', { x, y, 'text-anchor': anchor || 'start', style, fill, text: t }); g.append(n); return n; };

  function draw(animate) {
    const my = ++run;
    g.innerHTML = '';
    const m = M();
    const tooBig = id >= m;
    const e = encode(id);
    T(4, 22, 'id = ' + fmtBig(id), 'font:700 15px var(--mono)', 'var(--text)');
    const fs = narrow ? 14 : 13, RH = narrow ? 24 : 22, sub = `font:500 ${narrow ? 14 : 12}px var(--mono)`, subFill = scramble ? 'var(--accent)' : 'var(--text-3)';
    let y0 = 70;
    if (!scramble) T(4, 42, 'no scramble: encode the id itself', sub, subFill);
    else if (!narrow) T(4, 42, '× ' + fmtBig(P) + ' mod 62^' + L + ' = ' + fmtBig(e.start), sub, subFill);
    else { T(4, 44, '× ' + fmtBig(P) + ' mod 62^' + L, sub, subFill); T(4, 64, '= ' + fmtBig(e.start), sub, subFill); y0 = 92; }
    const rows = e.rows.slice(0, 9);
    const rowEls = rows.map((r, i) => {
      const y = y0 + i * RH;
      const t = svg('text', { x: 4, y, style: `font:500 ${fs}px var(--mono);opacity:0;transition:opacity .25s`, fill: 'var(--text-2)' });
      t.append(svg('tspan', { text: fmtBig(r.x) + ' ÷ 62 → r ' }), svg('tspan', { style: 'font-weight:800', fill: 'var(--accent)', text: String(r.r).padStart(2, ' ') + ' = ' + r.ch }));
      g.append(t);
      return t;
    });
    // code boxes, least significant digit on the right
    const n = e.code.length, bw = Math.min(40, (W - 8) / n), x0 = (W - n * bw) / 2;
    const by = y0 + rows.length * RH;
    S.setAttribute('viewBox', `0 0 ${W} ${by + 62}`);
    const boxes = [];
    for (let i = 0; i < n; i++) {
      g.append(svg('rect', { x: x0 + i * bw + 2, y: by, width: bw - 4, height: 34, rx: 6, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      boxes.push(T(x0 + i * bw + bw / 2, by + 23, '', 'font:800 18px var(--mono)', 'var(--text)', 'middle'));
    }
    const used = Number(id) / Number(m);
    T(W / 2, by + 56, '62^' + L + ' = ' + SD.fmt.num(Number(m)) + ' codes' + (tooBig ? ' · id too large!' : ' · id is ' + (used * 100).toPrecision(2) + '% in'), `font:600 ${narrow ? 14 : 12}px var(--mono)`, tooBig ? 'var(--err)' : 'var(--text-3)', 'middle');
    const show = (i) => {
      if (my !== run) return;
      if (rowEls[i]) rowEls[i].style.opacity = 1;
      const b = boxes[n - 1 - i]; if (b) b.textContent = e.rows[i].ch;
    };
    if (animate && !ctx.reduced) e.rows.forEach((_, i) => setTimeout(() => show(i), 120 * i)); else e.rows.forEach((_, i) => show(i));
    // stats: neighbours show predictability; decoding proves the scramble is a bijection
    const back = decode(e.code);
    const nb = [1n, 2n, 3n].map((d) => encode(id + d).code);
    st.innerHTML = '';
    const o = { code: e.code, length: n, 'decode → id': back === id ? '✓' : '✗ (id ≥ 62^' + L + ')', 'next ids →': nb.join(' · ') };
    Object.entries(o).forEach(([k, v]) => st.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    if (tooBig && scramble) say(`id ${fmtBig(id)} ≥ 62^${L}: the scramble wraps around and is no longer unique. Use a longer code.`);
    else if (!scramble && n > L) say(`Without scrambling, id ${fmtBig(id)} needs ${n} characters, more than ${L}.`);
    else say(`${fmtBig(id)} → <b>${e.code}</b>. Next codes: ${nb.join(', ')}` + (scramble ? ' (unrelated: hard to enumerate)' : ' (sequential: easy to enumerate)'));
  }
  ctx.onResize((nw) => { narrow = nw; W = nw ? 360 : 400; draw(false); });
  draw(true);
});
