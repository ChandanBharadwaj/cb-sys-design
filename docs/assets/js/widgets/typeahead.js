/* Real trie with top-k lists at every node; incremental top-k update on "search"; scan cost without top-k. */
SD.widget('typeahead', function (root, ctx) {
  const { el, svg } = ctx;
  const K = 5;
  const DATA = {
    'system design': 9800, 'system design interview': 7200, 'systemd': 3100, 'sysctl': 900, 'sys.argv python': 1500,
    'syscall': 1200, 'sysadmin jobs': 2100, 'symbolic link': 2600, 'symfony': 1800, 'sync vs async': 2400,
    'synonym': 6400, 'syntax error': 3300, 'spring boot': 8800, 'spring boot tutorial': 4100, 'spring security': 3900,
    'sql join': 5200, 'sql server': 6100, 'sqlite': 4700, 'ssh keygen': 2900, 'ssl certificate': 3700,
    'stack overflow': 9100, 'stream api java': 2000, 'string to int java': 2500, 'redis cache': 2700, 'redis cluster': 1600,
    'react hooks': 5600, 'react router': 4900, 'regex': 7000, 'rest api': 5300, 'rate limiter': 1400,
    'kafka consumer': 2200, 'kafka streams': 1700, 'kubernetes': 8100, 'kubectl': 3400, 'python list': 6800,
    'python dict': 4300, 'postgres jsonb': 1300, 'postgresql': 5900, 'pandas': 7600, 'spring kafka': 1900
  };
  const counts = Object.assign({}, DATA);
  // ----- trie -----
  const mk = (ch) => ({ ch, kids: new Map(), end: false, top: [] });
  const trie = mk('');
  let nodes = 1;
  function offer(n, q) {
    const i = n.top.indexOf(q);
    if (i < 0) n.top.push(q);
    n.top.sort((a, b) => counts[b] - counts[a]);
    if (n.top.length > K) n.top.length = K;
  }
  function pathOf(q) { const p = [trie]; let n = trie; for (const c of q) { n = n.kids.get(c); if (!n) break; p.push(n); } return p; }
  Object.keys(counts).forEach((q) => {
    let n = trie; offer(n, q);
    for (const c of q) { if (!n.kids.has(c)) { n.kids.set(c, mk(c)); nodes++; } n = n.kids.get(c); offer(n, q); }
    n.end = true;
  });
  function scan(n, prefix) { // what a request costs without top-k: visit the whole subtree, then sort
    let visited = 0; const found = [];
    (function dfs(m, s) { visited++; if (m.end) found.push(s); m.kids.forEach((k, c) => dfs(k, s + c)); })(n, prefix);
    found.sort((a, b) => counts[b] - counts[a]);
    return { visited, found };
  }

  // ----- controls -----
  let topk = true, prefix = 'sy', anim = 0;
  const input = el('input', { type: 'text', value: prefix, 'aria-label': 'Prefix', placeholder: 'type a prefix', style: { width: '130px', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', font: '600 14px var(--mono)' } });
  input.addEventListener('input', () => { prefix = input.value.toLowerCase(); render(true); });
  const kBtn = el('button', { class: 'btn', text: '' });
  const setK = () => { kBtn.textContent = topk ? '★ Top-k cache: on' : '☆ Top-k cache: off'; };
  kBtn.addEventListener('click', () => { topk = !topk; setK(); render(true); }); setK();
  const quick = ['s', 'sy', 'spring', 'k', 're'].map((p) => { const b = el('button', { class: 'btn', text: '"' + p + '"' }); b.addEventListener('click', () => { input.value = p; prefix = p; render(true); }); return b; });
  root.append(el('div', { class: 'w-controls' }, input, kBtn, ...quick));

  const W = 400, H = 312;
  const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Trie path and top-5 completions' });
  const gLines = svg('g'), gPath = svg('g'), gKids = svg('g'), gList = svg('g');
  S.append(gLines, gPath, gKids, gList);
  root.append(el('div', { class: 'w-stage', style: { maxWidth: '560px', margin: '0 auto' } }, S));
  const st = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(st, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); };
  const txt = (x, y, t, style, fill, anchor) => svg('text', { x, y, 'text-anchor': anchor || 'middle', style, fill, text: t });
  const shown = (c) => (c === ' ' ? '␣' : c);

  function render(animate) {
    const my = ++anim;
    gLines.innerHTML = ''; gPath.innerHTML = ''; gKids.innerHTML = ''; gList.innerHTML = '';
    const path = pathOf(prefix);
    const ok = path.length === prefix.length + 1;
    const last = path[path.length - 1];
    // path row (root + last 7 characters)
    const vis = path.length > 8 ? [path[0]].concat(path.slice(-7)) : path;
    const circles = vis.map((n, i) => {
      const x = 24 + i * 50, y = 40;
      if (i) gPath.append(svg('line', { x1: x - 35, y1: y, x2: x - 15, y2: y, stroke: 'var(--border)', 'stroke-width': 2 }));
      if (i === 1 && path.length > 8) gPath.append(txt(x - 25, y - 20, '…', 'font:700 14px var(--mono)', 'var(--text-3)'));
      const c = svg('circle', { cx: x, cy: y, r: 16, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 2 });
      gPath.append(c, txt(x, y + 5, i ? shown(n.ch) : '∅', 'font:700 15px var(--mono)', 'var(--text)'));
      return c;
    });
    if (!ok) gPath.append(txt(4, 96, 'no node for "' + prefix + '"', 'font:600 13px var(--mono)', 'var(--err)', 'start'));
    const lit = (i) => { const c = circles[i]; if (!c || my !== anim) return; c.setAttribute('fill', 'color-mix(in srgb, var(--accent) 28%, var(--surface))'); c.setAttribute('stroke', 'var(--accent)'); };
    if (animate && !ctx.reduced) circles.forEach((_, i) => setTimeout(() => lit(i), i * 70)); else circles.forEach((_, i) => lit(i));
    if (!ok) { stats({ prefix: '"' + prefix + '"', result: 'no match' }); return; }
    // children of the last node
    const lx = 24 + (vis.length - 1) * 50;
    const kids = [...last.kids.values()].slice(0, 8);
    const sc = scan(last, prefix);
    kids.forEach((k, i) => {
      const x = 24 + i * 47, y = 116;
      gLines.append(svg('line', { x1: lx, y1: 56, x2: x, y2: y - 14, stroke: topk ? 'var(--border)' : 'var(--warn)', 'stroke-width': 1.2, 'stroke-dasharray': topk ? '3 3' : '' }));
      gKids.append(svg('circle', { cx: x, cy: y, r: 14, fill: topk ? 'var(--surface-2)' : 'color-mix(in srgb, var(--warn) 30%, var(--surface))', stroke: 'var(--border)' }));
      gKids.append(txt(x, y + 5, shown(k.ch), 'font:700 13px var(--mono)', 'var(--text-2)'));
      gKids.append(txt(x, y + 30, scan(k, '').found.length + 'q', 'font:600 12px var(--mono)', 'var(--text-3)'));
    });
    if (last.kids.size > 8) gKids.append(txt(390, 121, '+' + (last.kids.size - 8), 'font:600 12px var(--mono)', 'var(--text-3)', 'end'));
    // top-k list
    const list = topk ? last.top : sc.found.slice(0, K);
    const max = counts[list[0]] || 1;
    gList.append(txt(4, 166, topk ? 'walk ' + prefix.length + ' edges → read top-' + K + ' stored at "' + prefix + '"' : 'walk, then scan ' + sc.visited + ' nodes and sort ' + sc.found.length, 'font:600 13px var(--mono)', topk ? 'var(--ok)' : 'var(--warn)', 'start'));
    list.forEach((q, i) => {
      const y = 178 + i * 26;
      const row = svg('g', { style: 'cursor:pointer' });
      row.append(svg('rect', { x: 4, y, width: 392, height: 22, rx: 5, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      row.append(svg('rect', { x: 4, y, width: Math.max(4, 392 * counts[q] / max), height: 22, rx: 5, fill: 'color-mix(in srgb, var(--accent) 16%, transparent)' }));
      const t = svg('text', { x: 12, y: y + 16, style: 'font:500 13px var(--mono)', fill: 'var(--text-2)' });
      t.append(svg('tspan', { style: 'font-weight:800', fill: 'var(--text)', text: q.slice(0, prefix.length) }), svg('tspan', { text: q.slice(prefix.length) }));
      row.append(t, txt(390, y + 16, SD.fmt.num(counts[q]), 'font:600 12px var(--mono)', 'var(--text-3)', 'end'));
      row.addEventListener('click', () => boost(q));
      gList.append(row);
    });
    stats({
      prefix: '"' + prefix + '"',
      'nodes visited': topk ? prefix.length + 1 : prefix.length + sc.visited,
      'queries sorted': topk ? 0 : sc.found.length,
      'trie nodes': nodes,
      'top-k slots stored': nodes * K
    });
  }
  function stats(o) { st.innerHTML = ''; Object.entries(o).forEach(([k, v]) => st.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); }
  function boost(q) {
    const before = pathOf(q).map((n) => n.top.indexOf(q) >= 0);
    counts[q] += 3000;
    const p = pathOf(q);
    p.forEach((n) => offer(n, q));                 // counts only grow, so this keeps every top-k exact
    const entered = p.filter((n, i) => !before[i] && n.top.indexOf(q) >= 0).length;
    say(`Searched "<b>${q}</b>" 3,000× → ${SD.fmt.num(counts[q])}. Updated top-k on ${p.length} nodes of its path` + (entered ? `; it <b>entered</b> the top-${K} at ${entered} node(s).` : '.'));
    render(false);
  }
  render(true);
  say('Try "s" with the top-k cache off: a one-letter prefix scans most of the trie.');
});
