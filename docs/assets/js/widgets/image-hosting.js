/* One Zipf request stream through three derivative strategies (eager variants, lazy allow-listed resize-on-miss,
   arbitrary sizes). Each has a real LRU edge cache, a derivative store and an in-flight map for request collapsing. */
SD.widget('image-hosting', function (root, ctx) {
  const { el, svg } = ctx;
  const WIDTHS = [160, 320, 640, 1080, 1440, 2048];
  const BPP = { jpeg: 0.2, webp: 0.14, avif: 0.1 }, CPU = { jpeg: 1, webp: 2, avif: 8 };   // estimates
  const SLOTS = [110, 160, 180, 236, 300, 343, 360, 375, 390, 414, 600, 736], DPR = [1, 2, 2, 3, 3];
  const NR = 2000, RATE = 600, UP_MS = 50, DECODE = 60, WARM = 120000;   // 2000 live images, 20 uploads/s
  const bytes = (w, f) => 0.75 * w * w * BPP[f];
  const enc = (w, f) => 25 * (w / 1080) * (w / 1080) * CPU[f];          // ms to resize+encode, estimate
  let EAGER_CPU = DECODE, EAGER_BYTES = 0;
  WIDTHS.forEach((w) => ['avif', 'webp', 'jpeg'].forEach((f) => { EAGER_CPU += enc(w, f); EAGER_BYTES += bytes(w, f); }));
  const snap = (w) => WIDTHS.find((x) => x >= w) || 2048;

  // Zipf(1.0) over popularity slots; each upload replaces a random slot, so most photos land in the cold tail
  const cdf = []; let tot = 0;
  for (let i = 0; i < NR; i++) { tot += 1 / (i + 1); cdf.push(tot); }
  const zipf = () => { const r = Math.random() * tot; let lo = 0, hi = NR - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; } return lo; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  class LRU {
    constructor(n) { this.n = n; this.m = new Map(); }
    get(k) { if (!this.m.has(k)) return false; this.m.delete(k); this.m.set(k, 1); return true; }
    set(k) { this.m.delete(k); this.m.set(k, 1); while (this.m.size > this.n) this.m.delete(this.m.keys().next().value); }
  }
  let edgeCap = 1500, collapse = true, attack = false, burst = null;
  const NAMES = { eager: 'Eager', lazy: 'Lazy', any: 'Any size' };
  const COLORS = { eager: 'var(--k-store)', lazy: 'var(--k-compute)', any: 'var(--k-cache)' };
  let S, slot, now, newest, uploadAcc, lastReq;
  function reset() {
    S = ['eager', 'lazy', 'any'].map((kind) => ({ kind, edge: new LRU(edgeCap), store: new Set(), inflight: new Map(),
      bytes: kind === 'eager' ? NR * EAGER_BYTES : 0, cpuAcc: 0, cpu: 0, hit: 0.5, lat: [], li: 0, p99: 0, vres: 0, vcoll: 0 }));
    slot = Array.from({ length: NR }, (_, i) => i); now = 0; newest = NR; uploadAcc = 0;
  }
  function finalize(s, key, w, f) { s.inflight.delete(key); s.store.add(key); s.bytes += bytes(w, f); s.edge.set(key); }
  function serve(s, img, want, f) {
    const w = s.kind === 'any' ? want : snap(want);
    const key = img + '/' + w + '/' + f;
    let lat;
    if (s.edge.get(key)) { s.hit += (1 - s.hit) * 0.004; lat = 10; }
    else {
      s.hit *= 0.996;
      const fl = s.inflight.get(key);
      if (fl !== undefined && fl <= now) finalize(s, key, w, f);
      if (s.kind === 'eager' || s.store.has(key)) { s.edge.set(key); lat = 70; }          // stored variant
      else if (fl !== undefined && fl > now && collapse) { lat = fl - now + 10; if (img === burst?.img) s.vcoll++; }  // wait for leader
      else {                                                                               // resize from original
        const d = DECODE + enc(w, f);
        s.cpuAcc += d; if (img === burst?.img) s.vres++;
        s.inflight.set(key, Math.max(fl || 0, now + d + 40));
        lat = d + 60;
      }
    }
    s.lat[s.li] = lat; s.li = (s.li + 1) % 1000;
    return w;
  }
  function tick(ms) {
    const n = Math.round(ms * RATE / 1000);
    for (let i = 0; i < n; i++) {
      now += 1000 / RATE;
      uploadAcc += 1000 / RATE;
      while (uploadAcc >= UP_MS) { uploadAcc -= UP_MS; newest++; slot[Math.floor(Math.random() * NR)] = newest; S[0].cpuAcc += EAGER_CPU; S[0].bytes += EAGER_BYTES; }
      const r = Math.random(), f = r < 0.7 ? 'avif' : r < 0.93 ? 'webp' : 'jpeg';    // Accept mix, illustrative
      let img = slot[zipf()], css = pick(SLOTS), dpr = pick(DPR), want = Math.min(2048, css * dpr);
      if (burst && now < burst.until && Math.random() < 0.5) img = burst.img;
      else if (attack && Math.random() < 0.25) { img = slot[Math.floor(Math.random() * 50)]; want = 1 + Math.floor(Math.random() * 3000); css = 0; }
      S.forEach((s) => { for (const [k, t] of s.inflight) if (t <= now) { const p = k.split('/'); finalize(s, k, +p[1], p[2]); } });
      const ws = S.map((s) => serve(s, img, want, f));
      lastReq = { img, css, dpr, want, f, snapped: ws[1] };
    }
  }
  function startBurst() {
    newest++; slot[0] = newest; S[0].cpuAcc += EAGER_CPU; S[0].bytes += EAGER_BYTES;
    S.forEach((s) => { s.vres = 0; s.vcoll = 0; });
    burst = { img: newest, until: now + 2000, logged: false };
    say(`📈 Photo #${newest} just posted and went viral: half of all requests for 2 s, in every width and format.`);
  }

  // controls
  const burstBtn = el('button', { class: 'btn primary', text: '▶ Viral post' });
  const collBtn = el('button', { class: 'btn', text: '' });
  const atkBtn = el('button', { class: 'btn', text: '' });
  const capOut = el('b', { text: '' });
  const capIn = el('input', { type: 'range', min: 300, max: 6000, step: 100, value: edgeCap, 'aria-label': 'Edge cache size in objects' });
  const paintBtns = () => { collBtn.textContent = 'Collapsing: ' + (collapse ? 'on' : 'off'); atkBtn.textContent = 'Attack ?w=: ' + (attack ? 'on' : 'off'); capOut.textContent = edgeCap; };
  burstBtn.addEventListener('click', () => { if (ready) startBurst(); });
  collBtn.addEventListener('click', () => { collapse = !collapse; paintBtns(); say(collapse ? 'Collapsing on: concurrent misses for one key wait for the first resize.' : 'Collapsing off: every concurrent miss starts its own resize of the same key.'); });
  atkBtn.addEventListener('click', () => { attack = !attack; paintBtns(); say(attack ? '⚠ 25% of requests now ask for random widths 1–3000 on popular photos. Eager and Lazy snap them to the allow-list; Any size resizes each one.' : 'Attack stopped.'); });
  capIn.addEventListener('input', () => { edgeCap = +capIn.value; S.forEach((s) => { s.edge.n = edgeCap; }); paintBtns(); });
  paintBtns();
  root.append(el('div', { class: 'w-controls' }, burstBtn, collBtn, atkBtn, el('label', null, 'Edge cache ', capOut, ' objects ', capIn)));

  const stage = el('div', { class: 'w-stage' });
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stage, stats, log);
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 20) log.lastChild.remove(); }

  // drawing: 4 panels × 3 bars. Phone: one column, viewBox 360, text ≥ 13.5 units. Desktop: 2×2, viewBox 640.
  const PANELS = [
    { t: 'Edge cache hit ratio', v: (s) => s.hit, scale: () => 1, f: (x) => Math.round(x * 100) + '%' },
    { t: 'Resize CPU (cores busy)', v: (s) => s.cpu, scale: (m) => Math.max(m, 10), f: (x) => x.toFixed(1) },
    { t: 'Derivatives stored', v: (s) => s.bytes, scale: (m) => m, f: (x) => (x / 1e9).toFixed(1) + ' GB' },
    { t: 'p99 latency, last 1000 req', v: (s) => s.p99, scale: (m) => Math.max(m, 200), f: (x) => Math.round(x) + ' ms' }
  ];
  let bars = [], svgEl = null;
  function draw(narrow) {
    stage.innerHTML = ''; bars = [];
    const W = narrow ? 360 : 640, PW = narrow ? 350 : 308, PH = narrow ? 104 : 96;
    const FT = narrow ? 14.5 : 13, FL = narrow ? 13.5 : 12, ROW = narrow ? 24 : 21, BX = narrow ? 82 : 72, BW = narrow ? 186 : 160;
    const H = narrow ? PH * 4 + 6 : PH * 2 + 6;
    svgEl = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Three derivative strategies compared on four metrics' });
    PANELS.forEach((P, pi) => {
      const x0 = narrow ? 5 : 5 + (pi % 2) * (PW + 14), y0 = narrow ? 3 + pi * PH : 3 + Math.floor(pi / 2) * PH;
      svgEl.append(svg('rect', { x: x0, y: y0, width: PW, height: PH - 6, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      svgEl.append(svg('text', { x: x0 + 10, y: y0 + FT + 5, fill: 'var(--text)', style: `font:700 ${FT}px var(--sans)`, text: P.t }));
      const row = [];
      ['eager', 'lazy', 'any'].forEach((k, i) => {
        const y = y0 + FT + 14 + i * ROW;
        svgEl.append(svg('text', { x: x0 + 10, y: y + ROW * 0.62, fill: 'var(--text-2)', style: `font:600 ${FL}px var(--sans)`, text: NAMES[k] }));
        svgEl.append(svg('rect', { x: x0 + BX, y: y + 3, width: BW, height: ROW - 8, rx: 4, fill: 'var(--surface)', stroke: 'var(--border)' }));
        const bar = svg('rect', { x: x0 + BX, y: y + 3, width: 2, height: ROW - 8, rx: 4, fill: COLORS[k] });
        const val = svg('text', { x: x0 + PW - 8, y: y + ROW * 0.62, 'text-anchor': 'end', fill: 'var(--text)', style: `font:700 ${FL}px var(--mono)`, text: '…' });
        svgEl.append(bar, val);
        row.push({ bar, val, bw: BW });
      });
      bars.push(row);
    });
    stage.append(svgEl);
    paint();
  }
  function paint() {
    if (!S) return;
    PANELS.forEach((P, pi) => {
      const vals = S.map(P.v), sc = P.scale(Math.max(...vals)) || 1;
      vals.forEach((v, i) => { const b = bars[pi][i]; b.bar.setAttribute('width', Math.max(2, Math.min(1, v / sc) * b.bw)); b.val.textContent = ready ? P.f(v) : '…'; });
    });
  }
  function setStats() {
    stats.innerHTML = '';
    const lr = lastReq;
    const req = lr ? (lr.css ? `#${lr.img} · ${lr.css}px × ${lr.dpr} = ${lr.want}` : `#${lr.img} · ?w=${lr.want} (attack)`) + ` → lazy snaps to ${lr.snapped} · ${lr.f}` : '…';
    [['sim time', (now / 1000).toFixed(0) + ' s'], ['traffic', RATE + ' req/s · 20 uploads/s'], ['eager per upload', Math.round(EAGER_CPU) + ' ms CPU · ' + (EAGER_BYTES / 1e6).toFixed(1) + ' MB'], ['last request', req]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  // warm the caches in chunks (one popularity lifetime ≈ 100 s of traffic) before showing numbers
  let ready = false, warmed = 0, statT = 0;
  reset();
  draw(ctx.narrow);
  ctx.onResize(draw);
  say('Warming caches with 2 minutes of traffic…');
  ctx.loop((dt) => {
    if (!ready) {
      tick(12000); warmed += 12000;
      if (warmed >= WARM) { ready = true; S.forEach((s) => { s.cpuAcc = 0; }); say('Ready. Steady state: Lazy stores and computes less than Eager; Any size gets fewer cache hits. Now try <b>Viral post</b>.'); }
      return;
    }
    const sim = Math.min(dt, 100);
    tick(sim);
    S.forEach((s) => {
      s.cpu += ((s.cpuAcc / sim) - s.cpu) * 0.04; s.cpuAcc = 0;
      const a = s.lat.slice().sort((x, y) => x - y); s.p99 = a[Math.floor(0.99 * (a.length - 1))] || 0;
    });
    if (burst && !burst.logged && now >= burst.until + 1500) {
      burst.logged = true;
      say(`Photo #${burst.img} in 2 s: Lazy resized it <b>${S[1].vres}×</b> (${S[1].vcoll} waited), Any size <b>${S[2].vres}×</b> (${S[2].vcoll} waited), Eager 0× (it paid ${Math.round(EAGER_CPU)} ms at upload). Collapsing ${collapse ? 'on' : 'off'}.`);
    }
    paint();
    statT += dt; if (statT > 400) { statT = 0; setStats(); }
  });
});
