/* Real BM25 + toy concept embeddings → reciprocal rank fusion (k = 60) → toy cross-encoder rerank, on a 10-chunk corpus. */
SD.widget('rag-agent-platform', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 440, H = 410, K1 = 1.2, B = 0.75, RRF_K = 60;
  const DOCS = [
    { t: 'Leave · Germany', x: 'Employees in Germany get 30 vacation days per year. Unused days carry over until March 31.' },
    { t: 'Leave · US', x: 'US employees accrue 15 days of paid time off (PTO) per year, prorated by start date.' },
    { t: 'Parental leave', x: 'Parental leave: mothers and fathers receive 16 weeks of paid leave after a birth or adoption.' },
    { t: 'VPN setup', x: 'Install the VPN client, sign in with SSO and pick the nearest gateway.' },
    { t: 'VPN error codes', x: 'Error E-4012 means the device certificate expired. Re-enroll the laptop in the device portal.' },
    { t: 'Network outages', x: 'VPN or network failures: if the VPN fails with an error for everyone, check the status page.' },
    { t: 'Travel expenses', x: 'Submit travel expenses with receipts within 30 days. Approval is needed above 500 EUR.' },
    { t: 'Laptop refresh', x: 'Laptops are replaced every 3 years. Request a new device in the IT portal.' },
    { t: 'Password policy', x: 'Passwords need 14 characters and MFA is mandatory for all accounts.' },
    { t: 'Holidays · DE', x: 'Public holidays in Germany follow the federal state where you work, for example Bavaria.' }
  ];
  const QUERIES = [
    { q: 'How many vacation days in Germany?', gold: 0, why: 'both retrievers agree' },
    { q: 'time off for new parents', gold: 2, why: 'no shared words: BM25 misses, dense wins' },
    { q: 'VPN error E-4012', gold: 4, why: 'rare exact code: BM25 wins, dense blurs it' }
  ];
  const STOP = new Set('the a an of in on for to and or is are be with by my our we you your how many what do does at if all per it its this that after where'.split(' '));
  const CONCEPT = {};
  [['leave', 'vacation leave pto off holiday holidays'], ['parent', 'parental parents parent mothers fathers birth adoption child baby maternity paternity'],
   ['germany', 'germany german bavaria berlin'], ['us', 'us usa'], ['vpn', 'vpn network gateway'], ['error', 'error errors fails failures failure outage outages broken'],
   ['device', 'device laptop laptops computer'], ['security', 'password passwords mfa certificate sso'], ['money', 'expenses expense receipts eur travel salary pay']]
    .forEach(([c, ws]) => ws.split(' ').forEach((w) => { CONCEPT[w] = c; }));
  const CONCEPTS = [...new Set(Object.values(CONCEPT))];
  const tok = (s) => (s.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || []).filter((w) => !STOP.has(w));
  const vec = (toks) => CONCEPTS.map((c) => toks.filter((w) => CONCEPT[w] === c).length);
  const cos = (a, b) => { let d = 0, na = 0, nb = 0; a.forEach((x, i) => { d += x * b[i]; na += x * x; nb += b[i] * b[i]; }); return na && nb ? d / Math.sqrt(na * nb) : 0; };
  const D = DOCS.map((d, i) => { const tk = tok(d.t + ' ' + d.x); return Object.assign({ i, tk, v: vec(tk) }, d); });
  const avgdl = D.reduce((s, d) => s + d.tk.length, 0) / D.length;
  const df = {}; D.forEach((d) => new Set(d.tk).forEach((w) => { df[w] = (df[w] || 0) + 1; }));
  const idf = (w) => Math.log((D.length - (df[w] || 0) + 0.5) / ((df[w] || 0) + 0.5) + 1);
  function bm25(qt, d) {
    return [...new Set(qt)].reduce((s, w) => {
      const f = d.tk.filter((x) => x === w).length; if (!f) return s;
      return s + idf(w) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.tk.length / avgdl));
    }, 0);
  }

  // controls
  let busy = false, qIdx = 1;
  const qBtns = QUERIES.map((Q, i) => { const b = el('button', { class: 'btn' + (i === qIdx ? ' primary' : ''), text: Q.q }); b.onclick = () => { qIdx = i; qBtns.forEach((x, j) => x.classList.toggle('primary', j === i)); input.value = Q.q; run(Q.q, Q.gold); }; return b; });
  const input = el('input', { type: 'text', value: QUERIES[qIdx].q, 'aria-label': 'Question', style: { flex: '1 1 160px', minWidth: '0', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', font: '500 14px var(--sans)' } });
  const go = el('button', { class: 'btn primary', text: '▶ Search' });
  go.onclick = () => { qBtns.forEach((x) => x.classList.remove('primary')); const g = QUERIES.findIndex((Q) => Q.q.toLowerCase() === input.value.trim().toLowerCase()); run(input.value, g >= 0 ? QUERIES[g].gold : -1); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
  root.append(el('div', { class: 'w-controls' }, ...qBtns), el('div', { class: 'w-controls' }, input, go));

  const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Hybrid retrieval pipeline' });
  const gPipe = svg('g'), gCols = svg('g'), gFused = svg('g');
  S_.append(gPipe, gCols, gFused);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const T = (x, y, t, st, a, f) => svg('text', { x, y, 'text-anchor': a || 'start', style: st || 'font:600 14px var(--sans)', fill: f || 'var(--text)', text: t });
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  function setStats(o) { stats.innerHTML = ''; Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }))); }

  const STEPS = ['plan', 'search ∥', 'fuse', 'rerank', 'answer'];
  const pills = STEPS.map((s, i) => {
    const w = 82, x = 4 + i * 87;
    const r = svg('rect', { x, y: 4, width: w, height: 28, rx: 14, fill: 'var(--surface-2)', stroke: 'var(--border)' });
    const t = T(x + w / 2, 23, s, 'font:700 13px var(--sans)', 'middle', 'var(--text-3)');
    gPipe.append(r, t); return { r, t };
  });
  function pill(k) { pills.forEach((p, i) => { const on = i === k, done = i < k; p.r.setAttribute('fill', on ? 'var(--accent)' : done ? 'color-mix(in srgb, var(--accent) 18%, var(--surface))' : 'var(--surface-2)'); p.t.setAttribute('fill', on ? '#fff' : done ? 'var(--accent)' : 'var(--text-3)'); }); }

  function column(x, title, list, gold, fmtScore) {
    gCols.append(T(x, 56, title, 'font:700 14px var(--sans)', 'start', 'var(--text-2)'));
    for (let i = 0; i < 5; i++) {
      const y = 64 + i * 30, it = list[i];
      const isGold = it && it.d.i === gold;
      gCols.append(svg('rect', { x, y, width: 210, height: 26, rx: 6, fill: it ? (isGold ? 'color-mix(in srgb, var(--ok) 18%, var(--surface))' : 'var(--surface-2)') : 'transparent', stroke: isGold ? 'var(--ok)' : 'var(--border)', 'stroke-dasharray': it ? '' : '3 3' }));
      if (it) gCols.append(T(x + 7, y + 18, (i + 1) + '. ' + it.d.t, 'font:600 13px var(--sans)'), T(x + 203, y + 18, fmtScore(it.s), 'font:600 12px var(--mono)', 'end', 'var(--text-3)'));
      else if (i === 0) gCols.append(T(x + 105, y + 18, 'no match', 'font:600 13px var(--sans)', 'middle', 'var(--text-3)'));
    }
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));
  const rankOf = (list, i) => { const k = list.findIndex((x) => x.d.i === i); return k < 0 ? '—' : k + 1; };

  async function run(q, gold) {
    if (busy) return; busy = true;
    const qt = tok(q), qv = vec(qt);
    gCols.innerHTML = ''; gFused.innerHTML = ''; pill(0);
    say(`<b>Q:</b> ${q.replace(/</g, '&lt;')} → tokens [${qt.join(', ')}], concepts [${CONCEPTS.filter((c, i) => qv[i]).join(', ') || 'none'}]`);
    await sleep(500); pill(1);
    const bl = D.map((d) => ({ d, s: bm25(qt, d) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const dl = D.map((d) => ({ d, s: cos(qv, d.v) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    column(4, 'BM25 (real)', bl, gold, (s) => s.toFixed(2));
    column(226, 'Dense (toy vectors)', dl, gold, (s) => s.toFixed(2));
    await sleep(900); pill(2);
    const fused = D.map((d) => {
      const rb = bl.findIndex((x) => x.d === d), rd = dl.findIndex((x) => x.d === d);
      return { d, rrf: (rb >= 0 ? 1 / (RRF_K + rb + 1) : 0) + (rd >= 0 ? 1 / (RRF_K + rd + 1) : 0) };
    }).filter((x) => x.rrf > 0).sort((a, b) => b.rrf - a.rrf).slice(0, 5);
    gFused.append(T(4, 238, 'Fused (RRF, k = 60)', 'font:700 14px var(--sans)', 'start', 'var(--text-2)'));
    const rerankHdr = T(436, 238, '', 'font:700 14px var(--sans)', 'end', 'var(--accent)');
    gFused.append(rerankHdr);
    const maxB = bl.length ? bl[0].s : 1;
    const codes = qt.filter((w) => /\d/.test(w));
    fused.forEach((f, i) => {
      const covered = CONCEPTS.filter((c, k) => qv[k] && f.d.v[k]).length, need = qv.filter(Boolean).length || 1;
      f.ce = 0.6 * covered / need + 0.3 * cos(qv, f.d.v) + 0.1 * bm25(qt, f.d) / maxB + (codes.some((c) => f.d.tk.includes(c)) ? 0.5 : 0);
      const isGold = f.d.i === gold;
      f.g = svg('g', { style: `transform: translate(0px, ${248 + i * 32}px); transition: transform .7s ease` });
      f.g.append(svg('rect', { x: 4, y: 0, width: 432, height: 28, rx: 6, fill: isGold ? 'color-mix(in srgb, var(--ok) 18%, var(--surface))' : 'var(--surface-2)', stroke: isGold ? 'var(--ok)' : 'var(--border)' }),
        T(12, 19, f.d.t + (isGold ? '  ★' : ''), 'font:700 13px var(--sans)', 'start', isGold ? 'var(--ok)' : 'var(--text)'),
        T(330, 19, 'rrf ' + f.rrf.toFixed(4), 'font:600 12px var(--mono)', 'end', 'var(--text-3)'));
      f.ceT = T(428, 19, '', 'font:700 12px var(--mono)', 'end', 'var(--accent)');
      f.g.append(f.ceT); gFused.append(f.g);
    });
    if (!fused.length) say('Neither retriever matched anything. A real system would answer "not found" instead of guessing.');
    await sleep(1100); pill(3);
    rerankHdr.textContent = 'cross-encoder (toy)';
    fused.forEach((f) => { f.ceT.textContent = f.ce.toFixed(2); });
    await sleep(500);
    const rr = fused.slice().sort((a, b) => b.ce - a.ce);
    rr.forEach((f, i) => { f.g.style.transform = `translate(0px, ${248 + i * 32}px)`; });
    await sleep(900); pill(4);
    if (rr.length) say(`<b>Answer</b> drafted from the top chunks, citing [${rr.slice(0, 2).map((f) => f.d.t).join('], [')}].`);
    if (gold >= 0) {
      const fr = fused.findIndex((f) => f.d.i === gold), rk = rr.findIndex((f) => f.d.i === gold);
      say(`Right chunk "<b>${DOCS[gold].t}</b>": BM25 #${rankOf(bl, gold)}, dense #${rankOf(dl, gold)}, fused #${fr < 0 ? '—' : fr + 1}, reranked #${rk < 0 ? '—' : rk + 1}. (${QUERIES.find((Q) => Q.gold === gold).why})`);
      setStats({ 'BM25 rank': rankOf(bl, gold), 'dense rank': rankOf(dl, gold), 'fused rank': fr < 0 ? '—' : fr + 1, 'after rerank': rk < 0 ? '—' : rk + 1 });
    } else setStats({ 'BM25 hits': bl.length, 'dense hits': dl.length, 'fused': fused.length, 'avg doc length': avgdl.toFixed(1) + ' tokens' });
    busy = false;
  }
  pill(-1);
  setStats({ chunks: D.length, 'avg length': avgdl.toFixed(1) + ' tokens', k1: K1, b: B, 'RRF k': RRF_K });
  say('Pick a question. The ★ chunk is the one that actually answers it.');
  let started = false;
  ctx.onVisible((v) => { if (v && !started) { started = true; run(QUERIES[qIdx].q, QUERIES[qIdx].gold); } });
});
