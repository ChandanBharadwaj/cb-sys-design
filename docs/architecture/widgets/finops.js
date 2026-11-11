/* Workload cost model: hourly demand curve (24 h or 7 d), provisioned capacity under different policies,
   waste shaded, and a bill broken down by purchase type. Prices are illustrative. */
SD.widget('finops', function (root, ctx) {
  const { el, svg } = ctx;
  const PRICE = 0.20, CAP = 100, RI_OFF = 0.4, SPOT_OFF = 0.7, HEAD = 1.25; // $/instance-h, rps per instance, headroom
  const st = { days: 1, scale: true, cache: false, ri: 60, spot: 0 };
  let gen = 0;

  function demand(h) {                          // requests/s at hour h: daily peak ~20:00, trough ~04:00, weekend 80%
    const hd = h % 24, day = Math.floor(h / 24);
    const shape = 0.5 - 0.5 * Math.cos(((hd - 8) / 24) * 2 * Math.PI);
    const wk = day % 7 >= 5 ? 0.8 : 1;
    const noise = 1 + 0.06 * Math.sin(h * 2.3) * Math.cos(h * 0.7);
    return (1500 + 3300 * shape * shape) * wk * noise;
  }
  function model() {
    const N = st.days * 24, hit = st.cache ? 0.4 : 0;
    const used = [], prov = [];
    let peakNeed = 0;
    for (let h = 0; h < 168; h++) peakNeed = Math.max(peakNeed, demand(h) * (1 - hit) / CAP);
    for (let h = 0; h < N; h++) {
      const u = demand(h) * (1 - hit) / CAP;
      used.push(u);
      if (!st.scale) prov.push(Math.ceil(peakNeed * HEAD));
      else {                                   // target tracking with a one-hour lag: use last hour's demand, scale up fast
        const prev = h ? demand(h - 1) * (1 - hit) / CAP : u;
        prov.push(Math.ceil(Math.max(prev, u * 0.95) * HEAD));
      }
    }
    const floor = Math.min(...prov);
    const R = Math.round(floor * st.ri / 100);  // committed instances, paid every hour
    let riCost = 0, odCost = 0, spotCost = 0, unusedRi = 0, idle = 0, odAll = 0, interrupts = 0;
    for (let h = 0; h < N; h++) {
      const p = prov[h], above = Math.max(0, p - R);
      const sp = above * st.spot / 100, od = above - sp;
      riCost += R * PRICE * (1 - RI_OFF);
      unusedRi += Math.max(0, R - p) * PRICE * (1 - RI_OFF);
      spotCost += sp * PRICE * (1 - SPOT_OFF);
      odCost += od * PRICE;
      odAll += p * PRICE;
      idle += (p - used[h]) / p;
      interrupts += sp * 0.004;                // ~0.4% of spot instance-hours reclaimed (illustrative)
    }
    const compute = riCost + spotCost + odCost, cdn = st.cache ? 0.4 * N * 2 : 0;
    const reqM = used.reduce((a, b) => a + b, 0) * CAP / (1 - hit) * 3600 / 1e6;
    const wasteCost = compute * (idle / N);
    return { used, prov, R, riCost, odCost, spotCost, unusedRi, compute, cdn, total: compute + cdn, odAll, util: 1 - idle / N, reqM, wasteCost, interrupts, N };
  }

  function build(narrow) {
    const my = ++gen;
    root.innerHTML = '';
    const VW = narrow ? 360 : 600, VH = narrow ? 230 : 240, FS = narrow ? 14 : 13;
    const L = narrow ? 40 : 44, R = 10, T = 12, B = 26, PW = VW - L - R, PH = VH - T - B;

    const ctl = el('div', { class: 'w-controls' });
    const seg = (label, opts, key) => {
      const wrap = el('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' } }, el('span', { text: label }));
      const btns = opts.map(([v, l]) => {
        const b = el('button', { class: 'btn' + (st[key] === v ? ' primary' : ''), text: l });
        b.addEventListener('click', () => { st[key] = v; btns.forEach((x) => x.classList.toggle('primary', x === b)); update(); });
        wrap.append(b); return b;
      });
      return wrap;
    };
    ctl.append(seg('Window', [[1, '24 h'], [7, '7 days']], 'days'), seg('Autoscaling', [[false, 'Off'], [true, 'On']], 'scale'), seg('Cache 40%', [[false, 'Off'], [true, 'On']], 'cache'));
    const slider = (k, label, max) => {
      const out = el('b', { text: st[k] + '%' });
      const inp = el('input', { type: 'range', min: 0, max, step: 10, value: st[k], 'aria-label': label });
      inp.addEventListener('input', () => { st[k] = +inp.value; out.textContent = st[k] + '%'; update(); });
      return el('label', { style: { display: 'flex', flexDirection: 'column', gap: '2px', flex: '1 1 150px', minWidth: '140px' } }, el('span', null, label + ': ', out), inp);
    };
    ctl.append(slider('ri', 'Commitment (% of floor)', 150), slider('spot', 'Spot share above commitment', 100));
    root.append(ctl);

    const S = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': 'Provisioned versus used capacity', style: narrow ? '' : 'max-width:760px;display:block;margin:0 auto' });
    root.append(el('div', { class: 'w-stage' }, S,
      el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: '<b style="color:var(--accent)">▆</b> paid capacity · <b>━</b> demand · <b style="color:var(--err)">▆</b> waste · <b style="color:var(--ok)">┄</b> committed instances. Y axis: instances. $0.20/instance-hour, 100 req/s each, 25% headroom (<em>illustrative</em>).' })));
    const stats = el('div', { class: 'w-stats' });
    const bars = el('div', { style: { marginTop: '10px', display: 'grid', gap: '6px' } });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, bars, log);

    function update() {
      if (my !== gen) return;
      const m = model();
      const yMax = Math.max(...m.prov, m.R) * 1.1;
      const X = (i) => L + (i / (m.N - 1)) * PW, Y = (v) => T + PH - (v / yMax) * PH;
      S.innerHTML = '';
      for (let i = 0; i <= 2; i++) {
        const v = yMax * i / 2;
        S.append(svg('line', { x1: L, x2: VW - R, y1: Y(v), y2: Y(v), stroke: 'var(--border)', 'stroke-dasharray': i ? '3 4' : '' }));
        S.append(svg('text', { x: L - 4, y: Y(v) + FS * 0.35, 'text-anchor': 'end', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--mono)`, text: Math.round(v) }));
      }
      const step = m.N === 24 ? (narrow ? 8 : 6) : 24;
      for (let i = 0; i < m.N; i += step) {
        S.append(svg('text', { x: X(i), y: VH - 7, 'text-anchor': i ? 'middle' : 'start', fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: m.N === 24 ? String(i).padStart(2, '0') + 'h' : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i / 24].slice(0, narrow ? 2 : 3) }));
      }
      const pts = (arr) => arr.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1));
      const stepPts = (arr) => { const o = []; arr.forEach((v, i) => { o.push(X(Math.max(0, i - 0.5)).toFixed(1) + ',' + Y(v).toFixed(1), X(Math.min(m.N - 1, i + 0.5)).toFixed(1) + ',' + Y(v).toFixed(1)); }); return o; };
      const provP = stepPts(m.prov), base = Y(0);
      S.append(svg('polygon', { points: [L + ',' + base].concat(provP, [(VW - R) + ',' + base]).join(' '), fill: 'var(--accent)', 'fill-opacity': 0.22 }));
      S.append(svg('polygon', { points: provP.concat(pts(m.used).reverse()).join(' '), fill: 'var(--err)', 'fill-opacity': 0.28 }));
      S.append(svg('polyline', { points: provP.join(' '), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2 }));
      S.append(svg('polyline', { points: pts(m.used).join(' '), fill: 'none', stroke: 'var(--text)', 'stroke-width': narrow ? 2.5 : 2 }));
      if (m.R > 0) {
        S.append(svg('line', { x1: L, x2: VW - R, y1: Y(m.R), y2: Y(m.R), stroke: 'var(--ok)', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
        S.append(svg('text', { x: VW - R - 2, y: Y(m.R) - 5, 'text-anchor': 'end', fill: 'var(--ok)', style: `font:700 ${FS}px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:4px`, text: 'committed ' + m.R }));
      }

      const money = (n) => '$' + ctx.fmt.num(Math.round(n));
      stats.innerHTML = '';
      const add = (k, v) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` }));
      add('Bill (' + (st.days === 1 ? 'day' : 'week') + ')', money(m.total));
      add('vs all on-demand', money(m.odAll + m.cdn));
      add('Capacity used', Math.round(m.util * 100) + '%');
      add('$ per 1M requests', '$' + (m.total / m.reqM).toFixed(3));
      add('Spot reclaims (est.)', m.interrupts.toFixed(1));

      const parts = [
        ['Committed', m.riCost - m.unusedRi, 'var(--ok)'],
        ['Unused commitment', m.unusedRi, 'var(--warn)'],
        ['On-demand', m.odCost, 'var(--accent)'],
        ['Spot', m.spotCost, 'var(--text-3)'],
        ['Cache / CDN', m.cdn, 'var(--border)'],
        ['of which idle waste', m.wasteCost, 'var(--err)']
      ];
      const mx = Math.max(...parts.map((p) => p[1]), 1);
      bars.innerHTML = '';
      parts.forEach(([n, v, c]) => bars.append(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        el('span', { text: n, style: { flex: '0 0 ' + (narrow ? '118px' : '150px'), fontSize: '14px' } }),
        el('div', { style: { flex: '1', height: '14px', background: 'var(--surface-2)', borderRadius: '4px', overflow: 'hidden' } },
          el('div', { style: { height: '100%', width: (v / mx * 100).toFixed(1) + '%', background: c, transition: ctx.reduced ? 'none' : 'width .35s' } })),
        el('span', { text: money(v), style: { fontFamily: 'var(--mono)', fontSize: '13px', minWidth: '64px', textAlign: 'right' } }))));

      let msg;
      if (!st.scale) msg = 'Fixed fleet sized for the <b>weekly peak</b> + headroom: everything above the black line is paid but unused. Turn autoscaling on.';
      else if (m.unusedRi > m.riCost * 0.05) msg = 'Commitment above the floor: at night the fleet shrinks below the committed line and you pay for <b>unused commitment</b>. Commit to the floor, not the peak.';
      else if (st.ri < 50) msg = 'The always-on floor is billed at on-demand prices. Commit to more of it: that portion is used every hour.';
      else if (st.spot > 60) msg = 'Most of the burst is on spot: cheapest, but every reclaim must be survivable. Keep an on-demand floor for critical paths.';
      else msg = 'Good shape: floor committed, burst autoscaled. ' + (st.cache ? 'Caching cut the instances you need.' : 'Try the cache: it reduces <b>quantity</b>, which discounts cannot.');
      log.innerHTML = ''; log.append(el('div', { html: msg }));
    }
    update();
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
