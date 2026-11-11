/* 5-year cumulative TCO curves (Build / Rent SaaS / self-hosted OSS) + a weighted decision matrix
   whose TCO and time-to-value scores come from the curves. */
SD.widget('build-vs-buy', function (root, ctx) {
  const { el, svg } = ctx;
  const ENG = 15000, TEAM = 4, INFRA = 1;               // $/engineer-month (loaded, estimate), build team, $/user/month self-run infra
  const st = { users: 1000, price: 10, growth: 40, effort: 24, run: 1.5, hike: false, relicense: false, cap: 'generic' };
  const OPTS = [
    { id: 'build', name: 'Build', col: 'var(--accent)' },
    { id: 'saas', name: 'Rent (SaaS)', col: 'var(--warn)' },
    { id: 'oss', name: 'OSS self-host', col: 'var(--ok)' }
  ];
  const CRIT = [
    { id: 'ttv', l: 'Time to value', w: 3 },
    { id: 'tco', l: '5-yr TCO (from curves)', w: 4 },
    { id: 'ctl', l: 'Control & flexibility', w: 2 },
    { id: 'lock', l: 'Low lock-in risk', w: 2 },
    { id: 'ops', l: 'Low ops burden', w: 3 },
    { id: 'fit', l: 'Strategic fit', w: 4 }
  ];
  const FIT = { core: { build: 5, saas: 1, oss: 3 }, generic: { build: 2, saas: 4, oss: 4 }, commodity: { build: 1, saas: 5, oss: 3 } };
  let loopH = null, gen = 0, shown = 60, lastWin = null;
  const money = (n) => '$' + ctx.fmt.num(n);

  function model() {
    const c = { build: [0], saas: [0], oss: [0] };
    const buildM = Math.max(1, Math.round(st.effort / TEAM)), ossM = Math.max(1, Math.round(st.effort * 0.3 / TEAM));
    let b = 0, s = 0, o = 0;
    for (let m = 1; m <= 60; m++) {
      const u = st.users * Math.pow(1 + st.growth / 100, (m - 1) / 12);
      b += m <= buildM ? TEAM * ENG : st.run * ENG + u * INFRA;
      s += st.price * (st.hike && m > 24 ? 1.3 : 1) * u + 0.25 * ENG + (m === 1 ? 4 * ENG : 0);
      o += m <= ossM ? st.effort * 0.3 * ENG / ossM : Math.max(0.5, st.run * 0.8) * ENG + u * INFRA;
      if (st.relicense && m === 30) o += 6 * ENG;          // migrate to a fork / legal review
      c.build.push(b); c.saas.push(s); c.oss.push(o);
    }
    return { c, buildM, ossM };
  }
  function crossing(a, b) {               // month after which a stays <= b (a = build, b = saas)
    if (a[60] > b[60]) return null;
    let last = -1;
    for (let m = 1; m <= 60; m++) if (a[m] > b[m]) last = m;
    if (last < 0) return 0;
    const t = (a[last] - b[last]) / ((a[last] - b[last]) - (a[last + 1] - b[last + 1]));
    return last + t;
  }

  function build(narrow) {
    const my = ++gen;
    if (loopH) loopH.stop();
    root.innerHTML = '';
    const VW = narrow ? 360 : 600, VH = narrow ? 250 : 260, FS = narrow ? 14 : 13;
    const L = narrow ? 62 : 66, R = narrow ? 12 : 16, T = 14, B = 28;
    const PW = VW - L - R, PH = VH - T - B;

    // controls
    const sliders = [
      ['users', 'Users today', 100, 100000, 100, (v) => ctx.fmt.num(v)],
      ['growth', 'Growth / yr', 0, 150, 5, (v) => v + '%'],
      ['price', 'SaaS $/user/mo', 1, 60, 1, (v) => '$' + v],
      ['effort', 'Build effort', 6, 120, 6, (v) => v + ' eng-mo'],
      ['run', 'Run team', 0.5, 5, 0.25, (v) => v + ' FTE']
    ];
    const ctl = el('div', { class: 'w-controls' });
    sliders.forEach(([k, label, mn, mx, step, f]) => {
      const out = el('b', { text: f(st[k]) });
      const inp = el('input', { type: 'range', min: mn, max: mx, step, value: st[k], 'aria-label': label });
      inp.addEventListener('input', () => { st[k] = +inp.value; out.textContent = f(st[k]); update(true); });
      ctl.append(el('label', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: narrow ? '140px' : '150px', flex: '1 1 140px' } }, el('span', null, label + ': ', out), inp));
    });
    const tog = (k, on, off) => { const b = el('button', { class: 'btn', text: st[k] ? on : off }); b.addEventListener('click', () => { st[k] = !st[k]; b.textContent = st[k] ? on : off; b.classList.toggle('primary', st[k]); update(true); }); if (st[k]) b.classList.add('primary'); return b; };
    ctl.append(tog('hike', '✓ SaaS +30% at renewal (yr 3)', '+ SaaS price hike at renewal'), tog('relicense', '✓ OSS relicensed in yr 3', '+ OSS licence change'));
    root.append(ctl);

    const stage = el('div', { class: 'w-stage' });
    const S = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': 'Cumulative 5-year cost curves', style: narrow ? '' : 'max-width:760px;display:block;margin:0 auto' });
    const gGrid = svg('g'), gLines = svg('g'), gMark = svg('g');
    S.append(gGrid, gLines, gMark);
    stage.append(S);
    stage.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: OPTS.map((o) => `<b style="color:${o.col}">━</b> ${o.name}`).join(' · ') + ' · <b>●</b> build overtakes SaaS. Model: $15K per engineer-month, $1/user/month infra when self-run (<em>estimates</em>).' }));
    root.append(stage);
    const stats = el('div', { class: 'w-stats' });
    root.append(stats);

    // decision matrix (HTML, so text never shrinks on phones)
    const mx = el('div', { style: { marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '10px' } });
    const capRow = el('div', { class: 'w-controls' }, el('b', { text: 'Decision matrix · capability is:' }));
    const capBtns = ['core', 'generic', 'commodity'].map((c) => {
      const b = el('button', { class: 'btn' + (st.cap === c ? ' primary' : ''), text: { core: 'Core', generic: 'Generic', commodity: 'Commodity' }[c] });
      b.addEventListener('click', () => { st.cap = c; capBtns.forEach((x) => x.classList.toggle('primary', x === b)); update(false); });
      capRow.append(b); return b;
    });
    mx.append(capRow);
    const scoreEls = {};
    CRIT.forEach((cr) => {
      const wOut = el('b', { text: cr.w });
      const inp = el('input', { type: 'range', min: 0, max: 5, step: 1, value: cr.w, 'aria-label': 'Weight: ' + cr.l, style: { flex: '1 1 110px', minWidth: '100px' } });
      inp.addEventListener('input', () => { cr.w = +inp.value; wOut.textContent = cr.w; update(false); });
      scoreEls[cr.id] = el('span', { style: { fontFamily: 'var(--mono)', fontSize: '13px', whiteSpace: 'nowrap' } });
      mx.append(el('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', padding: '5px 0', borderBottom: '1px dashed var(--border)' } },
        el('span', { style: { flex: '1 1 150px', fontSize: '14px' } }, cr.l + ' · w=', wOut), inp, scoreEls[cr.id]));
    });
    const bars = el('div', { style: { marginTop: '10px', display: 'grid', gap: '6px' } });
    const barEls = OPTS.map((o) => {
      const fill = el('div', { style: { height: '100%', width: '0%', background: o.col, borderRadius: '4px', transition: ctx.reduced ? 'none' : 'width .4s' } });
      const val = el('span', { style: { fontFamily: 'var(--mono)', fontSize: '13px', minWidth: '96px', textAlign: 'right' } });
      bars.append(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        el('span', { text: o.name, style: { width: '96px', fontSize: '14px', flex: '0 0 96px' } }),
        el('div', { style: { flex: '1', height: '14px', background: 'var(--surface-2)', borderRadius: '4px', overflow: 'hidden' } }, fill), val));
      return { fill, val };
    });
    mx.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, text: 'Scores 1–5 per option, shown as B · R · O (Build, Rent, OSS). Weighted total = Σ(weight × score) ÷ Σ(weight × 5).' }), bars);
    root.append(mx);
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(log);
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 20) log.lastChild.remove(); }

    const X = (m) => L + (m / 60) * PW;
    let cur = null, yMax = 1;
    const Y = (v) => T + PH - (v / yMax) * PH;

    function drawGrid() {
      gGrid.innerHTML = '';
      for (let i = 0; i <= 2; i++) {
        const v = yMax * i / 2, y = Y(v);
        gGrid.append(svg('line', { x1: L, x2: VW - R, y1: y, y2: y, stroke: 'var(--border)', 'stroke-dasharray': i ? '3 4' : '' }));
        gGrid.append(svg('text', { x: L - 5, y: y + FS * 0.35, 'text-anchor': 'end', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--mono)`, text: i ? money(v) : '$0' }));
      }
      for (let yr = 1; yr <= 5; yr++) {
        const x = X(yr * 12);
        gGrid.append(svg('line', { x1: x, x2: x, y1: T, y2: T + PH, stroke: 'var(--border)', 'stroke-dasharray': '2 5' }));
        gGrid.append(svg('text', { x: x - (yr === 5 ? 4 : 0), y: VH - 8, 'text-anchor': yr === 5 ? 'end' : 'middle', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: 'Y' + yr }));
      }
    }
    function drawLines() {
      gLines.innerHTML = ''; gMark.innerHTML = '';
      const upto = Math.max(1, Math.min(60, Math.floor(shown)));
      OPTS.forEach((o) => {
        const pts = cur.c[o.id].slice(0, upto + 1).map((v, m) => X(m).toFixed(1) + ',' + Y(v).toFixed(1));
        gLines.append(svg('polyline', { points: pts.join(' '), fill: 'none', stroke: o.col, 'stroke-width': narrow ? 3 : 2.5, 'stroke-linejoin': 'round' }));
      });
      const cm = crossing(cur.c.build, cur.c.saas);
      if (cm != null && cm > 0 && cm <= upto) {
        const i = Math.floor(cm), f = cm - i, v = cur.c.build[i] + (cur.c.build[Math.min(60, i + 1)] - cur.c.build[i]) * f;
        const cx = X(cm), cy = Y(v), right = cx < L + PW * 0.55;
        gMark.append(svg('circle', { cx, cy, r: 6, fill: 'var(--text)', stroke: 'var(--surface)', 'stroke-width': 2 }));
        gMark.append(svg('text', { x: cx + (right ? 9 : -9), y: Math.max(T + FS, cy - 9), 'text-anchor': right ? 'start' : 'end', fill: 'var(--text)', style: `font:700 ${FS}px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:4px`, text: 'break-even ≈ yr ' + (cm / 12).toFixed(1) }));
      }
    }

    function scores() {
      const tot = OPTS.map((o) => cur.c[o.id][60]);
      const mn = Math.min(...tot), mxv = Math.max(...tot);
      const tcoS = {}; OPTS.forEach((o, i) => { tcoS[o.id] = mxv - mn < mn * 0.05 ? 4 : Math.round((1 + 4 * (mxv - tot[i]) / (mxv - mn)) * 2) / 2; });
      const ttv = { build: Math.max(1, Math.round(5 - cur.buildM / 3)), saas: 5, oss: Math.max(1, Math.round(5 - cur.ossM / 1.5)) };
      return {
        ttv, tco: tcoS,
        ctl: { build: 5, saas: 2, oss: 4 },
        lock: { build: 4, saas: 2, oss: st.relicense ? 2 : 3 },
        ops: { build: 1, saas: 5, oss: 2 },
        fit: FIT[st.cap]
      };
    }

    function update(animate) {
      if (my !== gen) return;
      cur = model();
      yMax = Math.max(...OPTS.map((o) => cur.c[o.id][60])) * 1.08;
      drawGrid();
      if (animate && !ctx.reduced) shown = 0; else { shown = 60; }
      drawLines();
      const cm = crossing(cur.c.build, cur.c.saas);
      stats.innerHTML = '';
      const add = (k, v) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }));
      OPTS.forEach((o) => add('5-yr ' + o.name, money(cur.c[o.id][60])));
      add('build beats SaaS', cm == null ? 'not in 5 yrs' : cm === 0 ? 'from day 1' : 'yr ' + (cm / 12).toFixed(1));
      // matrix
      const sc = scores();
      const sumW = CRIT.reduce((a, c) => a + c.w, 0) || 1;
      CRIT.forEach((cr) => { scoreEls[cr.id].textContent = OPTS.map((o) => o.name[0] + ' ' + sc[cr.id][o.id]).join(' · '); });
      const totals = OPTS.map((o) => CRIT.reduce((a, cr) => a + cr.w * sc[cr.id][o.id], 0) / (sumW * 5));
      const best = totals.indexOf(Math.max(...totals));
      barEls.forEach((b, i) => { b.fill.style.width = (totals[i] * 100).toFixed(0) + '%'; b.val.innerHTML = (totals[i] * 100).toFixed(0) + '%' + (i === best ? ' <b>✓ wins</b>' : ''); });
      if (lastWin !== null && lastWin !== best) say(`Winner changed: <b>${OPTS[lastWin].name}</b> → <b>${OPTS[best].name}</b>. A small weight change flipped it, so treat this as a close call in the ADR.`);
      lastWin = best;
    }

    loopH = ctx.loop((dt) => { if (shown < 60) { shown = Math.min(60, shown + dt / 22); drawLines(); } });
    lastWin = null;
    update(true);
    say('Try: raise <b>Users</b> or <b>Growth</b> until the build curve crosses SaaS. Then switch capability to <b>Core</b> and drag the weights.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
