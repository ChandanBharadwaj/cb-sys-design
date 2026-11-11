/* Strangler facade routing table: build → shadow (diff) → ramp → rollback, with a simulated request stream. */
SD.widget('strangler-fig', function (root, ctx) {
  const { el, svg } = ctx;
  const ALL = [
    { path: '/catalog', w: 30, bug: 0.012 }, { path: '/search', w: 20, bug: 0.02 }, { path: '/cart', w: 15, bug: 0.008 },
    { path: '/orders', w: 12, bug: 0.03 }, { path: '/payments', w: 8, bug: 0.05 }, { path: '/reviews', w: 6, bug: 0.015 },
    { path: '/accounts', w: 6, bug: 0.01 }, { path: '/admin', w: 3, bug: 0.04 }
  ];
  const DIFFS = {
    '/catalog': 'price "19.9" vs 19.90 (string vs number)', '/search': 'result order differs on ties',
    '/cart': 'empty cart: [] vs null', '/orders': 'tax rounded per line vs per order',
    '/payments': 'legacy retries declined cards once', '/reviews': 'HTML entities escaped twice',
    '/accounts': 'phone stored without country code', '/admin': 'timezone: server local vs UTC'
  };
  const RAMP = [0, 1, 5, 25, 50, 100];
  let loopH = null, gen = 0, tickT = null;
  const st = { routes: [], sel: 3, guard: true, served: { legacy: 0, nu: 0 }, window: [], errs: 0, diffs: 0 };

  function build(narrow) {
    const my = ++gen;
    if (loopH) loopH.stop();
    clearInterval(tickT);
    root.innerHTML = '';
    const N = narrow ? 6 : 8;
    st.routes = ALL.slice(0, N).map((r) => ({ ...r, state: 'legacy', pct: 0, shadow: false, mism: 0, shadowN: 0, err: 0, newN: 0, recent: [] }));
    st.sel = Math.min(st.sel, N - 1); st.window = []; st.errs = 0; st.diffs = 0;
    const totalW = st.routes.reduce((a, r) => a + r.w, 0);

    // geometry: phone 360-wide viewBox with 14/13-unit text; desktop 640-wide
    const W = narrow ? 360 : 700, F = 14, F2 = 13, RH = narrow ? 50 : 40, TOP = 34;
    const BX = narrow ? 112 : 150, BW = narrow ? 168 : 300, CX = W - 8;
    const H = TOP + RH * N + 8;

    const sel = el('select', { 'aria-label': 'Route' });
    st.routes.forEach((r, i) => sel.append(el('option', { value: i, text: r.path })));
    sel.value = st.sel;
    sel.addEventListener('change', () => { st.sel = +sel.value; paint(); });
    const bBuild = el('button', { class: 'btn primary', text: '① Build service' });
    const bShadow = el('button', { class: 'btn', text: '② Shadow: off' });
    const bFix = el('button', { class: 'btn', text: '🔧 Fix diffs' });
    const bRamp = el('button', { class: 'btn primary', text: '③ Ramp ▲' });
    const bBack = el('button', { class: 'btn', text: '⟲ Rollback' });
    const bGuard = el('button', { class: 'btn', text: '🛡 Guard: on' });
    const cur = () => st.routes[st.sel];
    bBuild.onclick = () => { const r = cur(); if (r.state !== 'legacy') return; r.state = 'built'; say(`Built the new <b>${r.path}</b> service. Facade still sends 0% to it.`); paint(); };
    bShadow.onclick = () => { const r = cur(); if (r.state === 'legacy') return; r.shadow = !r.shadow; say(`${r.path}: shadow ${r.shadow ? '<b>on</b>: every legacy request is copied to the new service and the responses are compared' : 'off'}.`); paint(); };
    bFix.onclick = () => {
      const r = cur(); if (r.state === 'legacy') return;
      if (!r.shadowN && !r.newN) { say('Nothing measured yet. Turn on shadow first to find the differences.'); return; }
      r.bug = r.bug > 0.002 ? r.bug * 0.08 : 0; r.mism = 0; r.shadowN = 0; r.err = 0; r.newN = 0; r.recent = [];
      say(`Fixed the cause of ${r.path} diffs (${DIFFS[r.path]}). Counters reset; watch the rate again.`); paint();
    };
    bRamp.onclick = () => {
      const r = cur(); if (r.state === 'legacy') { say('Build the service first.'); return; }
      const i = RAMP.indexOf(r.pct); if (i >= RAMP.length - 1) return;
      const rate = r.shadowN ? r.mism / r.shadowN : null;
      if (r.pct === 0 && (rate === null || r.shadowN < 150)) say(`⚠ Ramping <b>${r.path}</b> without enough shadow data. Users may hit differences you never saw.`);
      else if (r.pct === 0 && rate > 0.005) say(`⚠ ${r.path} mismatch rate is ${(rate * 100).toFixed(1)}%. Ramping anyway: users will see it.`);
      r.pct = RAMP[i + 1]; r.state = r.pct === 100 ? 'new' : 'canary'; r.recent = [];
      say(`${r.path} → <b>${r.pct}%</b> on the new service.`); paint();
    };
    bBack.onclick = () => { const r = cur(); if (!r.pct) return; rollback(r, 'manual'); };
    bGuard.onclick = () => { st.guard = !st.guard; bGuard.textContent = '🛡 Guard: ' + (st.guard ? 'on' : 'off'); };
    root.append(el('div', { class: 'w-controls' }, el('label', null, 'Route ', sel), bBuild, bShadow, bFix, bRamp, bBack, bGuard));

    const stage = el('div', { class: 'w-stage' });
    const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Facade routing table' });
    stage.append(S_); root.append(stage);
    stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Bar: <b style="color:var(--text-3)">■</b> legacy share · <b style="color:var(--accent)">■</b> new share. A dashed amber outline means <b>shadow on</b>. Right column: <b>Δ</b> shadow mismatches, <b>✖</b> user-facing errors on new code.' }));
    const stats = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);

    const T = (x, y, txt, o) => svg('text', Object.assign({ x, y, style: `font:${(o && o.w) || 600} ${(o && o.f) || F}px var(${(o && o.mono) ? '--mono' : '--sans'})`, fill: (o && o.fill) || 'var(--text)', 'text-anchor': (o && o.a) || 'start', text: txt }, o && o.extra));
    S_.append(T(6, 20, 'route', { f: F2, fill: 'var(--text-3)' }), T(BX, 20, 'legacy ◀  split  ▶ new', { f: F2, fill: 'var(--text-3)' }), T(CX, 20, 'Δ · ✖', { f: F2, fill: 'var(--text-3)', a: 'end' }));
    const rows = st.routes.map((r, i) => {
      const y = TOP + i * RH;
      const g = svg('g', { style: 'cursor:pointer' });
      const bg = svg('rect', { x: 2, y: y + 2, width: W - 4, height: RH - 4, rx: 6, fill: 'transparent' });
      const name = T(6, narrow ? y + 20 : y + RH / 2 + 5, r.path, { mono: true, w: 700 });
      const status = T(narrow ? 6 : BX + BW + 10, narrow ? y + 40 : y + RH / 2 + 5, '', { f: F2, fill: 'var(--text-3)' });
      const bh = narrow ? 18 : 16, by = narrow ? y + 8 : y + (RH - bh) / 2;
      const legacyR = svg('rect', { x: BX, y: by, width: BW, height: bh, rx: 4, fill: 'color-mix(in srgb, var(--text-3) 40%, var(--surface-2))' });
      const newR = svg('rect', { x: BX + BW, y: by, width: 0, height: bh, rx: 4, fill: 'var(--accent)', style: 'transition:all .35s' });
      const shadowR = svg('rect', { x: BX - 3, y: by - 3, width: BW + 6, height: bh + 6, rx: 6, fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2, 'stroke-dasharray': '5 4', opacity: 0 });
      const pctT = T(BX + BW / 2, by + bh / 2 + 5, '', { f: F2, w: 700, a: 'middle', extra: { style: `font:700 ${F2}px var(--mono);paint-order:stroke;stroke:var(--surface);stroke-width:3px` } });
      const cnt = T(CX, narrow ? y + 40 : y + RH / 2 + 5, '', { f: F2, a: 'end', mono: true });
      const pulse = svg('circle', { cx: BX, cy: by + bh / 2, r: 4, fill: 'var(--text)', opacity: 0 });
      g.append(bg, legacyR, newR, shadowR, name, status, pctT, cnt, pulse);
      g.addEventListener('click', () => { st.sel = i; sel.value = i; paint(); });
      S_.append(g);
      return { bg, newR, shadowR, status, pctT, cnt, pulse, by, bh, flash: 0, flashNew: false };
    });

    function paint() {
      st.routes.forEach((r, i) => {
        const R = rows[i];
        R.bg.setAttribute('fill', i === st.sel ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent');
        R.bg.setAttribute('stroke', i === st.sel ? 'var(--accent)' : 'none');
        const nw = BW * r.pct / 100;
        R.newR.setAttribute('x', BX + BW - nw); R.newR.setAttribute('width', nw);
        R.shadowR.setAttribute('opacity', r.shadow ? 1 : 0);
        R.pctT.textContent = r.state === 'legacy' ? 'legacy only' : `${100 - r.pct}% | ${r.pct}%`;
        const lbl = { legacy: 'LEGACY', built: 'BUILT · 0%', canary: 'CANARY ' + r.pct + '%', new: 'NEW 100%', rolled: 'ROLLED BACK' }[r.state];
        R.status.textContent = lbl + (r.shadow ? ' · SHADOW' : '');
        R.status.setAttribute('fill', r.state === 'rolled' ? 'var(--err)' : r.state === 'new' ? 'var(--ok)' : r.state === 'canary' ? 'var(--accent)' : 'var(--text-3)');
        R.cnt.textContent = `Δ${r.mism} ✖${r.err}`;
        R.cnt.setAttribute('fill', r.err ? 'var(--err)' : r.mism ? 'var(--warn)' : 'var(--text-3)');
      });
      const r = cur();
      bBuild.disabled = r.state !== 'legacy';
      bShadow.disabled = r.state === 'legacy'; bShadow.textContent = '② Shadow: ' + (r.shadow ? 'on' : 'off');
      bFix.disabled = r.state === 'legacy'; bRamp.disabled = r.state === 'legacy' || r.pct === 100; bBack.disabled = !r.pct;
      const tot = st.window.length || 1, nu = st.window.filter((x) => x).length;
      const moved = st.routes.filter((x) => x.pct === 100).length;
      stats.innerHTML = '';
      [['traffic → legacy', Math.round(100 * (tot - nu) / tot) + '%'], ['traffic → new', Math.round(100 * nu / tot) + '%'],
        ['routes fully on new', moved + ' / ' + N], ['shadow mismatches', st.diffs], ['user-facing errors (new)', st.errs]]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }

    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
    function rollback(r, why) {
      r.pct = 0; r.state = 'rolled'; r.recent = [];
      say(why === 'guard' ? `🛡 <b>Auto-rollback</b>: ${r.path} error rate on new code crossed 2%. Facade set to 0% (a config change, no deploy).`
        : `⟲ ${r.path} rolled back to 0%. Legacy still owns the data, so nothing is lost.`);
      paint();
    }

    // simulated request stream: pick a route by traffic weight, then old or new by its %
    function pick() { let x = Math.random() * totalW; for (const r of st.routes) { x -= r.w; if (x <= 0) return r; } return st.routes[0]; }
    let lastDiffSay = 0;
    function tick() {
      for (let k = 0; k < 60; k++) {
        const r = pick(), i = st.routes.indexOf(r);
        const toNew = Math.random() * 100 < r.pct;
        st.window.push(toNew); if (st.window.length > 2000) st.window.shift();
        if (toNew) {
          r.newN++; const bad = Math.random() < r.bug * 0.7; // a fraction of diffs are visible errors
          r.recent.push(bad); if (r.recent.length > 150) r.recent.shift();
          if (bad) { r.err++; st.errs++; }
          if (st.guard && r.state === 'canary' && r.recent.length >= 30 && r.recent.filter(Boolean).length >= 2 && r.recent.filter(Boolean).length / r.recent.length > 0.02) rollback(r, 'guard');
        } else if (r.shadow) {
          r.shadowN++;
          if (Math.random() < r.bug) {
            r.mism++; st.diffs++;
            if (r.mism === 1 || Date.now() - lastDiffSay > 6000) { lastDiffSay = Date.now(); say(`Δ ${r.path}: ${DIFFS[r.path]} (user got the legacy answer)`); }
          }
        }
        if (k % 8 === 0) { rows[i].flash = 1; rows[i].flashNew = toNew; }
      }
      paint();
    }
    tickT = setInterval(() => { if (my === gen && root.isConnected && visible) tick(); }, 400);
    let visible = true;
    ctx.onVisible((v) => { visible = v; });

    loopH = ctx.loop((dt) => {
      if (ctx.reduced) return;
      rows.forEach((R) => {
        if (R.flash <= 0) { R.pulse.setAttribute('opacity', 0); return; }
        R.flash = Math.max(0, R.flash - dt / 500);
        const p = 1 - R.flash;
        R.pulse.setAttribute('cx', R.flashNew ? BX + BW * (1 - p * 0.5) : BX + BW * p * 0.5);
        R.pulse.setAttribute('fill', R.flashNew ? 'var(--accent)' : 'var(--text)');
        R.pulse.setAttribute('opacity', R.flash);
      });
    });

    paint();
    say('Start with <b>/orders</b>: ① build, ② shadow and watch Δ climb, 🔧 fix, then ③ ramp. Try ramping <b>/payments</b> without shadow to meet the guard.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
