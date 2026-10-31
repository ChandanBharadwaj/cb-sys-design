/* Live workload through a gateway: per-team token buckets (or request buckets), a shared provider TPM bucket,
   exact / semantic cache with real cosine similarity on 16-d prompt vectors, and fixed / cascade / classifier routing. */
SD.widget('llm-gateway', function (root, ctx) {
  const { el, svg } = ctx;
  const H = 300, DIM = 16;
  let seed = 7;
  const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const INTENTS = ['refund status', 'refund policy', 'cancel my order', 'cancel subscription', 'Pro plan price', 'Team plan price', 'reset password', 'export to CSV', 'API rate limits'];
  const centers = [];
  for (let i = 0; i < INTENTS.length; i++) {
    if (i % 2 === 1 && i < 6) centers.push(norm(centers[i - 1].map((x) => x + 0.12 * gauss())));   // near-duplicate intent, different answer
    else centers.push(norm(Array.from({ length: DIM }, gauss)));
  }
  const variants = centers.map((c) => Array.from({ length: 5 }, () => norm(c.map((x) => x + 0.05 * gauss()))));
  const PRICE = { large: [3e-6, 15e-6], small: [0.25e-6, 1.25e-6] };   // $ per token in/out, illustrative

  // config
  const ROUTES = [['fixed', 'Fixed: large'], ['cascade', 'Cascade small→large'], ['cls', 'Classifier']];
  const CACHES = [['none', 'Cache: off'], ['exact', 'Cache: exact'], ['semantic', 'Cache: semantic']];
  let route = 0, cacheMode = 2, th = 0.95, unitTokens = false, batchOn = true;
  const rBtn = el('button', { class: 'btn primary', text: 'Route: ' + ROUTES[route][1] });
  rBtn.onclick = () => { route = (route + 1) % ROUTES.length; rBtn.textContent = 'Route: ' + ROUTES[route][1]; reset(); };
  const cBtn = el('button', { class: 'btn', text: CACHES[cacheMode][1] });
  cBtn.onclick = () => { cacheMode = (cacheMode + 1) % CACHES.length; cBtn.textContent = CACHES[cacheMode][1]; reset(); };
  const uBtn = el('button', { class: 'btn', text: 'Limit: requests/s' });
  uBtn.onclick = () => { unitTokens = !unitTokens; uBtn.textContent = 'Limit: ' + (unitTokens ? 'tokens/s' : 'requests/s'); reset(); };
  const bBtn = el('button', { class: 'btn', text: 'Batch job: on' });
  bBtn.onclick = () => { batchOn = !batchOn; bBtn.textContent = 'Batch job: ' + (batchOn ? 'on' : 'off'); reset(); };
  const thOut = el('b', { text: th.toFixed(2) });
  const thIn = el('input', { type: 'range', min: 80, max: 99, value: th * 100, 'aria-label': 'Similarity threshold' });
  thIn.addEventListener('input', () => { th = thIn.value / 100; thOut.textContent = th.toFixed(2); });
  thIn.addEventListener('change', reset);
  root.append(el('div', { class: 'w-controls' }, rBtn, cBtn, uBtn, bBtn), el('div', { class: 'w-controls' }, el('label', null, 'Semantic threshold ', thOut, thIn)));

  const S_ = svg('svg', { role: 'img', 'aria-label': 'Gateway workload simulation' });
  const gBase = svg('g'), gDots = svg('g');
  S_.append(gBase, gDots);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);
  const T = (x, y, t, st, a, f) => svg('text', { x, y, 'text-anchor': a || 'start', style: st || 'font:600 14px var(--sans)', fill: f || 'var(--text)', text: t });
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }

  const LANES = [['cache hit', 'var(--ok)'], ['small model', 'var(--accent)'], ['large model', '#a855f7'], ['gateway 429', 'var(--warn)'], ['provider 429', 'var(--err)']];
  // phones: 360-wide viewBox with 14–15-unit text; desktop keeps the 440-wide layout
  const LY = (i) => 46 + i * 56;
  let W, AX, GX, LX0, LX1, laneTxt;
  function buildBase(n) {
    W = n ? 360 : 440; AX = n ? 34 : 30; GX = n ? 100 : 118; LX0 = n ? 128 : 150; LX1 = W - 8;
    const aF = n ? 14 : 13, lF = n ? 15 : 14;
    S_.setAttribute('viewBox', `0 0 ${W} ${H}`);
    gBase.innerHTML = ''; gDots.innerHTML = ''; if (dots) dots = [];
    gBase.append(T(AX, 16, 'apps', `font:700 ${aF}px var(--sans)`, 'middle', 'var(--text-3)'),
      svg('rect', { x: GX - 22, y: 24, width: 44, height: 266, rx: 10, fill: 'var(--surface-2)', stroke: 'var(--border)' }),
      T(GX, 16, 'gateway', `font:700 ${aF}px var(--sans)`, 'middle', 'var(--text-3)'),
      T(AX, 110, 'support', `font:700 ${aF}px var(--sans)`, 'middle', 'var(--accent)'),
      T(AX, 210, 'batch', `font:700 ${aF}px var(--sans)`, 'middle', 'var(--warn)'));
    laneTxt = LANES.map(([name, c], i) => {
      gBase.append(svg('line', { x1: LX0, x2: LX1, y1: LY(i) + 8, y2: LY(i) + 8, stroke: c, 'stroke-width': 2, opacity: 0.35 }));
      const t = T(LX0, LY(i) - 2, name, `font:700 ${lF}px var(--sans)`, 'start', c); gBase.append(t); return t;
    });
  }
  let dots;
  buildBase(ctx.narrow);
  ctx.onResize((n) => { buildBase(n); paintStats(); });

  let st, cache, buckets, provider, simT, nextA, nextB, inflight;
  function bucket(rate, burst) { return { rate, burst, tokens: burst }; }
  function reset() {
    st = { n: 0, cost: 0, latSum: 0, served: 0, hits: 0, wrong: 0, lanes: [0, 0, 0, 0, 0], supp429: 0, batch429: 0, weak: 0 };
    cache = { exact: new Set(), sem: [] };
    buckets = unitTokens ? { support: bucket(9000, 30000), batch: bucket(9000, 30000) } : { support: bucket(4, 8), batch: bucket(4, 8) };
    provider = bucket(16000, 20000);               // shared org-wide tokens/s at the large-model provider
    simT = 0; nextA = 0; nextB = 0.2; inflight = []; dots = []; gDots.innerHTML = '';
    paintStats();
  }
  function refill(b, dt) { b.tokens = Math.min(b.burst, b.tokens + b.rate * dt); }
  const between = (a, b) => a + rand() * (b - a);

  function arrive(team) {
    const faq = team === 'support' && rand() < 0.45;               // repeated FAQ-style prompt, else a one-off
    const intent = faq ? Math.floor(rand() * INTENTS.length) : -1, variant = faq ? Math.floor(rand() * 5) : -1;
    const r = { team, intent, variant, v: faq ? variants[intent][variant] : norm(Array.from({ length: DIM }, gauss)), tin: Math.round(team === 'batch' ? between(8000, 12000) : between(600, 2000)), tout: Math.round(between(150, 550)), hard: rand() < 0.3 };
    st.n++;
    const b = buckets[team], reserve = r.tin + 600;            // reserve input + max_tokens
    const need = unitTokens ? reserve : 1;
    if (b.tokens < need) { lane(r, 3, 0); if (team === 'batch') st.batch429++; else st.supp429++; return; }
    b.tokens -= need;
    // cache
    if (cacheMode === 1 && faq && cache.exact.has(intent + ':' + variant)) return hit(r, intent, 1);
    if (cacheMode === 2) {
      let best = null, bs = -1;
      cache.sem.forEach((e) => { const s = dot(e.v, r.v); if (s > bs) { bs = s; best = e; } });
      if (best && bs >= th) return hit(r, best.intent, bs);
    }
    // routing
    let lat = 0, cost = 0, laneI;
    const callLarge = () => {
      const t = r.tin + r.tout;
      if (provider.tokens < t) return false;
      provider.tokens -= t; lat += 0.3 + r.tout * 0.006; cost += r.tin * PRICE.large[0] + r.tout * PRICE.large[1]; return true;
    };
    const callSmall = () => { lat += 0.12 + r.tout * 0.003; cost += r.tin * PRICE.small[0] + r.tout * PRICE.small[1]; };
    const mode = ROUTES[route][0];
    let large = mode === 'fixed' || (mode === 'cls' && (r.hard ? rand() < 0.85 : rand() < 0.15));
    if (mode === 'cascade') { callSmall(); large = r.hard; }        // escalate when the check fails
    if (large) {
      if (!callLarge()) { lane(r, 4, 0); if (r.team === 'batch') st.batch429++; else st.supp429++; if (r.team === 'support' && st.supp429 % 5 === 1) say('✖ <b>support</b> got a provider 429: the shared quota was drained by large batch prompts.'); return; }
      laneI = 2;
    } else { if (mode !== 'cascade') callSmall(); laneI = 1; if (r.hard) st.weak++; }
    st.cost += cost; st.latSum += lat; st.served++;
    if (unitTokens) inflight.push({ b, refund: 600 - r.tout, at: simT + lat });
    if (faq) cache.exact.add(intent + ':' + variant);
    cache.sem.push({ v: r.v, intent }); if (cache.sem.length > 500) cache.sem.shift();
    lane(r, laneI, lat);
  }
  function hit(r, cachedIntent, sim) {
    st.hits++; st.served++; st.latSum += 0.04; st.cost += 0.00002;
    if (unitTokens) buckets[r.team].tokens += r.tin + 600;      // nothing was spent upstream
    const wrong = cachedIntent !== r.intent;
    if (wrong) { st.wrong++; if (st.wrong % 4 === 1) say(`✖ "<b>${r.intent < 0 ? 'one-off prompt' : INTENTS[r.intent]}</b>" got the cached answer for "${cachedIntent < 0 ? 'another prompt' : INTENTS[cachedIntent]}" (cosine ${sim.toFixed(2)} ≥ ${th.toFixed(2)}).`); }
    lane(r, 0, 0.04, wrong);
  }
  function lane(r, i, lat, wrong) {
    st.lanes[i]++;
    if (ctx.reduced || dots.length > 60) return;
    const y0 = r.team === 'batch' ? 205 : 105;
    const c = svg('circle', { r: r.team === 'batch' ? 6 : 4.5, fill: r.team === 'batch' ? 'var(--warn)' : 'var(--accent)', stroke: wrong ? 'var(--err)' : 'none', 'stroke-width': 3 });
    gDots.append(c); dots.push({ c, y0, y1: LY(i) + 8, t: 0 });
  }
  function paintStats() {
    const avg = st.served ? st.latSum / st.served : 0;
    laneTxt.forEach((t, i) => { t.textContent = LANES[i][0] + ' · ' + st.lanes[i] + (i === 0 && st.wrong ? ' (' + st.wrong + ' wrong)' : ''); });
    stats.innerHTML = '';
    const o = { requests: st.n, 'cost / 1K served': '$' + (st.served ? st.cost / st.served * 1000 : 0).toFixed(2), 'avg latency': avg.toFixed(2) + ' s', 'cache hits': st.n ? Math.round(st.hits / st.n * 100) + '%' : '0%', 'wrong hits': st.wrong, 'support 429s': st.supp429, 'batch 429s': st.batch429, 'weak answers': st.weak };
    Object.entries(o).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  reset();
  say('Start: requests/s limits with the batch job on. Then switch to tokens/s and watch support\'s 429s stop. Lower the semantic threshold to see wrong hits.');
  let acc = 0;
  ctx.loop((dtMs) => {
    const dt = Math.min(dtMs, 100) / 1000;
    simT += dt;
    Object.values(buckets).forEach((b) => refill(b, dt)); refill(provider, dt);
    inflight = inflight.filter((f) => { if (simT >= f.at) { f.b.tokens = Math.min(f.b.burst, f.b.tokens + f.refund); return false; } return true; });
    while (simT >= nextA) { arrive('support'); nextA += -Math.log(1 - rand()) / 3; }
    if (batchOn) while (simT >= nextB) { arrive('batch'); nextB += -Math.log(1 - rand()) / 2.4; }
    else nextB = simT;
    dots = dots.filter((d) => {
      d.t += dt / 1.3;
      if (d.t >= 1) { d.c.remove(); return false; }
      const x = d.t < 0.3 ? AX + (GX - AX) * (d.t / 0.3) : GX + (LX1 - GX) * ((d.t - 0.3) / 0.7);
      const y = d.t < 0.3 ? d.y0 : d.y0 + (d.y1 - d.y0) * Math.min(1, (d.t - 0.3) / 0.15);
      d.c.setAttribute('cx', x.toFixed(1)); d.c.setAttribute('cy', y.toFixed(1));
      return true;
    });
    acc += dt; if (acc > 0.25) { acc = 0; paintStats(); }
  });
});
