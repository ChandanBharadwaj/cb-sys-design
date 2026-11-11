/* Request path Frontend -> Orders -> Payments(v1/v2) with no mesh, sidecars or ambient (ztunnel + waypoint).
   Real mechanics: per-request weighted backend choice, nested retry attempts (app x mesh), Istio PeerAuthentication
   STRICT/PERMISSIVE semantics and an ALLOW AuthorizationPolicy keyed on the caller's principal. */
SD.widget('service-mesh', function (root, ctx) {
  const { el, svg } = ctx;
  const PASS = { sidecar: 0.4, ztunnel: 0.15, waypoint: 0.4 };       // ms per proxy pass (estimates)
  const st = { mode: 'sidecar', strict: false, authz: false, canary: 10, flaky: false, retry: 'app' };
  let gen = 0, loopH = null, packets = [], timer = 0;
  const tot = { req: 0, ok: 0, fail: 0, calls: 0, v2: 0, lat: 0 };

  function build(narrow) {
    const my = ++gen;
    if (loopH) { loopH.stop(); loopH = null; }
    root.innerHTML = ''; packets = []; Object.keys(tot).forEach((k) => { tot[k] = 0; });
    const F = narrow ? 14 : 13, W = narrow ? 360 : 640, H = narrow ? 470 : 300;
    const BW = narrow ? 120 : 130, BH = 44;
    const P = narrow
      ? { fe: [95, 45], rogue: [270, 45], ord: [95, 215], v1: [95, 395], v2: [270, 395] }
      : { fe: [80, 80], rogue: [80, 230], ord: [310, 80], v1: [550, 60], v2: [550, 200] };
    const names = { fe: 'Frontend', rogue: 'Caller X', ord: 'Orders', v1: 'Payments v1', v2: 'Payments v2' };

    // ---- controls ----
    const seg = (label, key, opts) => {
      const wrap = el('div', { class: 'w-controls' }, el('span', { class: 'muted', text: label }));
      opts.forEach(([v, l]) => {
        const b = el('button', { class: 'btn' + (st[key] === v ? ' primary' : ''), text: l });
        b.addEventListener('click', () => { st[key] = v; build(ctx.narrow); });
        wrap.append(b);
      });
      return wrap;
    };
    const tog = (key, on, off) => {
      const b = el('button', { class: 'btn' + (st[key] ? ' primary' : ''), text: st[key] ? on : off });
      b.addEventListener('click', () => { st[key] = !st[key]; build(ctx.narrow); });
      return b;
    };
    root.append(seg('Data plane', 'mode', [['none', 'No mesh'], ['sidecar', 'Sidecars'], ['ambient', 'Ambient']]));
    root.append(seg('Retries', 'retry', [['app', 'App ×3'], ['mesh', 'Mesh ×3'], ['both', 'Both']]));
    const cv = el('b', { text: (100 - st.canary) + ' / ' + st.canary });
    const ci = el('input', { type: 'range', min: 0, max: 50, step: 5, value: st.canary, 'aria-label': 'Canary weight' });
    ci.addEventListener('input', () => { st.canary = +ci.value; cv.textContent = (100 - st.canary) + ' / ' + st.canary; });
    const b1 = el('button', { class: 'btn', text: 'Call from legacy pod (plaintext)' });
    const b2 = el('button', { class: 'btn', text: 'Call from sa/reports (mTLS)' });
    root.append(el('div', { class: 'w-controls' }, tog('strict', 'mTLS: STRICT', 'mTLS: PERMISSIVE'), tog('authz', 'AuthZ: only sa/orders', 'AuthZ: off'), tog('flaky', 'Payments: 40% 5xx', 'Payments: healthy')));
    root.append(el('div', { class: 'w-controls' }, el('label', null, 'Split v1/v2 ', cv, ' ', ci), b1, b2));

    const stage = el('div', { class: 'w-stage' });
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Request path through three services' });
    stage.append(S); root.append(stage);
    const stats = el('div', { class: 'w-stats' }); const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);
    const say = (t) => { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 12) log.lastChild.remove(); };
    const T = (x, y, s, o) => svg('text', Object.assign({ x, y, 'text-anchor': 'middle', fill: (o && o.c) || 'var(--text)', style: `font:600 ${(o && o.f) || F}px var(--sans)`, text: s }));

    // ---- draw ----
    const amb = st.mode === 'ambient', side = st.mode === 'sidecar', mesh = st.mode !== 'none';
    const needWp = amb && (st.authz || st.retry !== 'app' || st.canary > 0);   // L7 features need a waypoint
    if (amb) {
      const zy = narrow ? 130 : 280;
      S.append(svg('rect', { x: 4, y: zy - 14, width: W - 8, height: 28, rx: 6, fill: 'color-mix(in srgb, var(--accent) 10%, transparent)', stroke: 'var(--accent)', 'stroke-dasharray': '5 4' }));
      S.append(T(W / 2, zy + 5, 'ztunnel on each node: L4 mTLS (HBONE)', { f: F, c: 'var(--accent)' }));
    }
    const wpPos = narrow ? [270, 215] : [430, 200];
    if (needWp) {
      S.append(svg('rect', { x: wpPos[0] - 55, y: wpPos[1] - 18, width: 110, height: 36, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--warn)', 'stroke-width': 2 }));
      S.append(T(wpPos[0], wpPos[1] + 5, 'waypoint L7', { c: 'var(--warn)' }));
    }
    const lines = [['fe', 'ord'], ['ord', 'v1'], ['ord', 'v2'], ['rogue', 'v1']];
    lines.forEach(([a, b]) => S.append(svg('line', { x1: P[a][0], y1: P[a][1], x2: P[b][0], y2: P[b][1], stroke: 'var(--border)', 'stroke-width': 2, 'stroke-dasharray': a === 'rogue' ? '4 4' : '' })));
    const box = {};
    Object.keys(P).forEach((k) => {
      const [x, y] = P[k];
      const r = svg('rect', { x: x - BW / 2, y: y - BH / 2, width: BW, height: BH, rx: 9, fill: 'var(--surface)', stroke: k === 'rogue' ? 'var(--text-3)' : 'var(--border)', 'stroke-width': 2 });
      S.append(r, T(x, y + (side ? -2 : 5), names[k]));
      if (side && k !== 'rogue') S.append(T(x, y + 15, '+ Envoy', { f: F - 1, c: 'var(--accent)' }));
      box[k] = r;
    });
    // hop latency labels
    const passes = () => (side ? 2 * PASS.sidecar : amb ? 2 * PASS.ztunnel : 0);
    const hopTxt = (wp) => mesh ? '+' + (passes() + (wp ? PASS.waypoint : 0)).toFixed(2) + ' ms' : '+0 ms';
    const mid = (a, b) => [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2];
    const m1 = mid('fe', 'ord'), m2 = mid('ord', 'v1');
    S.append(T(narrow ? 45 : m1[0], narrow ? 175 : m1[1] - 10, hopTxt(false), { f: F, c: 'var(--text-2)' }));
    S.append(T(narrow ? 45 : m2[0] + 50, narrow ? 305 : m2[1] - 6, hopTxt(needWp), { f: F, c: 'var(--text-2)' }));

    // ---- mechanics ----
    function path(a, b) {
      const pts = [P[a]];
      if (amb) { const zy = narrow ? 130 : 280; pts.push([P[a][0], zy]); if (needWp && (b === 'v1' || b === 'v2')) pts.push(wpPos); else pts.push([P[b][0], zy]); }
      pts.push(P[b]); return pts;
    }
    function shoot(a, b, tone, late) {
      if (ctx.reduced) return;
      packets.push({ pts: path(a, b), t: -(late || 0), tone, dot: null });
    }
    function attempt() { return !(st.flaky && Math.random() < 0.4); }
    function userRequest() {
      tot.req++;
      const tgt = Math.random() * 100 < st.canary ? 'v2' : 'v1';
      if (tgt === 'v2') tot.v2++;
      const appN = st.retry === 'mesh' || (st.retry !== 'both' && st.retry !== 'app') ? 1 : 3;
      const meshN = mesh && st.retry !== 'app' ? 3 : 1;
      const appTries = st.retry === 'mesh' && !mesh ? 1 : appN;
      let calls = 0, ok = false;
      for (let i = 0; i < appTries && !ok; i++) for (let j = 0; j < meshN && !ok; j++) { calls++; ok = attempt(); }
      tot.calls += calls; ok ? tot.ok++ : tot.fail++;
      const lat = mesh ? 2 * (passes()) + (needWp ? PASS.waypoint : 0) : 0;
      tot.lat = lat;
      shoot('fe', 'ord', 'var(--accent)');
      for (let c = 0; c < Math.min(calls, 9); c++) shoot('ord', tgt, c === calls - 1 && ok ? 'var(--ok)' : 'var(--err)', 0.6 + c * 0.18);
      if (calls > 3) say(`Request #${tot.req}: <b>${calls} calls</b> to Payments ${tgt} (app ${appTries} × mesh ${meshN}) — ${ok ? 'eventually OK' : 'failed'}.`);
    }
    function rogue(plaintext) {
      let verdict, ok;
      const who = plaintext ? 'legacy pod (no identity)' : 'sa/reports';
      if (!mesh) { ok = true; verdict = 'no mesh: nothing checks the caller'; }
      else if (plaintext && st.strict) { ok = false; verdict = 'STRICT mTLS: plaintext connection refused at the handshake'; }
      else if (st.authz) { ok = false; verdict = plaintext ? 'AuthorizationPolicy: no principal, request denied (403)' : 'AuthorizationPolicy: principal sa/reports not allowed (403)'; }
      else { ok = true; verdict = plaintext ? 'PERMISSIVE accepts plaintext' : 'mTLS authenticates, but nothing authorizes'; }
      if (amb && st.authz && !needWp) verdict += ' (L4 rule enforced by ztunnel)';
      names.rogue = plaintext ? 'Legacy pod' : 'sa/reports';
      box.rogue.nextSibling.textContent = names.rogue;
      shoot('rogue', 'v1', ok ? 'var(--warn)' : 'var(--err)');
      say(`Call from <b>${who}</b> → POST /charges: ${ok ? '<b style="color:var(--warn)">allowed</b>' : '<b style="color:var(--err)">blocked</b>'}. ${verdict}.`);
    }
    b1.addEventListener('click', () => rogue(true));
    b2.addEventListener('click', () => rogue(false));

    function paintStats() {
      stats.innerHTML = '';
      const amp = tot.req ? (tot.calls / tot.req).toFixed(2) : '–';
      const worst = (st.retry === 'both' && mesh ? 9 : 3);
      [['data plane', st.mode], ['added per request', '+' + (mesh ? (2 * passes() + (needWp ? PASS.waypoint : 0)).toFixed(2) : '0') + ' ms'], ['requests', tot.req], ['success', tot.req ? Math.round(100 * tot.ok / tot.req) + '%' : '–'], ['calls / request', amp + ' (worst ' + worst + ')'], ['to v2', tot.req ? Math.round(100 * tot.v2 / tot.req) + '%' : '–']]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
    function tick(dt) {
      const s = Math.min(dt, 100) / 1000;
      timer += s;
      if (timer > 1.1) { timer = 0; userRequest(); paintStats(); }
      packets = packets.filter((p) => {
        p.t += s * 1.4;
        if (p.t < 0) return true;
        const n = p.pts.length - 1, u = Math.min(p.t, 1) * n, i = Math.min(Math.floor(u), n - 1), f = u - i;
        const x = p.pts[i][0] + (p.pts[i + 1][0] - p.pts[i][0]) * f, y = p.pts[i][1] + (p.pts[i + 1][1] - p.pts[i][1]) * f;
        if (!p.dot) { p.dot = svg('circle', { r: 6, fill: p.tone }); S.append(p.dot); }
        p.dot.setAttribute('cx', x); p.dot.setAttribute('cy', y);
        if (p.t >= 1) { p.dot.remove(); return false; }
        return true;
      });
    }
    const exp = st.mode === 'none' ? 'No proxies: the app talks plaintext unless each team added TLS; retries live in code.'
      : side ? 'Every call crosses <b>two Envoy sidecars</b> (caller and callee): ~' + (2 * PASS.sidecar) + ' ms p50 per hop (estimate).'
        : 'Traffic is tunnelled by the <b>per-node ztunnel</b> (L4 mTLS). ' + (needWp ? 'Canary, retries or path authz need L7, so payments traffic also crosses a <b>waypoint</b>.' : 'No L7 feature is on, so no waypoint is needed.');
    say(exp);
    paintStats();
    if (ctx.reduced) { for (let i = 0; i < 20; i++) userRequest(); paintStats(); }
    else loopH = ctx.loop(tick);
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
