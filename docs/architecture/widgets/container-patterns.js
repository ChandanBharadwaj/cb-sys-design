/* Pod builder. Startup timeline follows Kubernetes rules: init containers run one at a time to completion;
   native sidecars (init containers with restartPolicy: Always) start in order, each gating the next until its
   startup probe passes; app containers start last. Legacy sidecars are regular containers that start in parallel
   with the app. Replicas, model copies and nodes come from real capacity and bin-packing arithmetic. */
SD.widget('container-patterns', function (root, ctx) {
  const { el, svg } = ctx;
  // name, kind, cpu (m), mem (MiB), seconds to start (init: run time)
  const C = {
    init: { n: 'init: db-migrate', short: 'init', kind: 'init', cpu: 100, mem: 128, t: 4, col: 'var(--k-compute)' },
    amb: { n: 'ambassador (Envoy)', short: 'proxy', kind: 'side', cpu: 100, mem: 128, t: 1.5, col: 'var(--k-edge)' },
    log: { n: 'log adapter (Fluent Bit)', short: 'logs', kind: 'side', cpu: 50, mem: 64, t: 1, col: 'var(--k-service)' },
    ml: { n: 'inference sidecar (Python)', short: 'model', kind: 'side', cpu: 1000, mem: 2048, t: 20, col: 'var(--k-ml)' },
    app: { n: 'app (Spring Boot)', short: 'app', kind: 'main', cpu: 500, mem: 768, t: 10, col: 'var(--accent)' }
  };
  const ORDER = ['init', 'amb', 'log', 'ml', 'app'];
  const APP_RPS = 300, ML_RPS = 60, INFER = 15; // per-Pod capacity; ML: 1 core at ~15 ms per score (illustrative)
  const NODE = { cpu: 8000 * 0.9, mem: 32768 * 0.85 }; // 8 vCPU / 32 GiB node, allocatable estimate
  let on = { init: true, amb: true, log: true, ml: true }, mode = 'sidecar', native = true, rps = 600, narrow = ctx.narrow;

  const addBtns = ['init', 'amb', 'log', 'ml'].map((k) => {
    const b = el('button', { class: 'btn', text: '' });
    b.addEventListener('click', () => { on[k] = !on[k]; render(); });
    return [k, b];
  });
  const modeBtns = [['lib', 'Model as library'], ['sidecar', 'Model as sidecar'], ['remote', 'Model as service']].map(([v, l]) => {
    const b = el('button', { class: 'btn', text: l });
    b.addEventListener('click', () => { mode = v; render(); });
    return [v, b];
  });
  const natBtn = el('button', { class: 'btn' });
  natBtn.addEventListener('click', () => { native = !native; render(); });
  const slider = el('input', { type: 'range', min: 50, max: 3000, step: 50, value: rps, 'aria-label': 'Requests per second' });
  slider.style.flex = '1 1 160px';
  const rpsLab = el('span', { class: 'muted', style: { fontSize: '13px', minWidth: '90px' } });
  slider.addEventListener('input', () => { rps = +slider.value; render(); });
  root.append(
    el('div', { class: 'w-controls' }, ...addBtns.map((x) => x[1])),
    el('div', { class: 'w-controls' }, ...modeBtns.map((x) => x[1]), natBtn),
    el('div', { class: 'w-controls', style: { alignItems: 'center' } }, el('span', { class: 'muted', style: { fontSize: '13px' }, text: 'Load' }), slider, rpsLab)
  );
  const stage = el('div', { class: 'w-stage' });
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stage, stats, log);

  // containers actually in the app Pod for this mode
  function podContainers() {
    const list = ORDER.filter((k) => k === 'app' || (on[k] && !(k === 'ml' && mode !== 'sidecar')));
    return list.map((k) => {
      const c = Object.assign({ k }, C[k]);
      if (k === 'app' && mode === 'lib' && on.ml) { c.n = 'app + model library'; c.cpu += 1000; c.mem += 1536; c.t += 14; }
      return c;
    });
  }
  // real Kubernetes ordering
  function timeline(list) {
    let t = 0; const rows = []; let mainStart;
    list.filter((c) => c.kind === 'init').forEach((c) => { rows.push({ c, s: t, r: t + c.t, run: false }); t += c.t; });
    const sides = list.filter((c) => c.kind === 'side');
    if (native) {
      sides.forEach((c) => { rows.push({ c, s: t, r: t + c.t, run: true }); t += c.t; }); // next waits for startupProbe
      mainStart = t;
    } else {
      sides.forEach((c) => rows.push({ c, s: t, r: t + c.t, run: true })); // all regular containers start together
      mainStart = t;
    }
    const app = list.find((c) => c.k === 'app');
    const appRow = { c: app, s: mainStart, r: mainStart + app.t, run: true };
    rows.push(appRow);
    const mlRow = rows.find((r) => r.c.k === 'ml');
    const race = !native && mlRow && mlRow.r > appRow.r ? [appRow.r, mlRow.r] : null;
    return { rows, ready: appRow.r, race };
  }
  function capacity(list) {
    const pod = list.reduce((a, c) => ({ cpu: a.cpu + c.cpu, mem: a.mem + c.mem }), { cpu: 0, mem: 0 });
    const needsMl = on.ml;
    const perPod = needsMl && mode !== 'remote' ? Math.min(APP_RPS, ML_RPS) : APP_RPS;
    const appPods = Math.max(2, Math.ceil(rps / perPod));
    const mlPods = needsMl && mode === 'remote' ? Math.max(2, Math.ceil(rps / ML_RPS)) : 0;
    const mlPod = { cpu: C.ml.cpu, mem: C.ml.mem };
    const cpu = appPods * pod.cpu + mlPods * mlPod.cpu, mem = appPods * pod.mem + mlPods * mlPod.mem;
    // first-fit bin packing on requests
    const nodes = [];
    const place = (p, who) => {
      let n = nodes.find((x) => x.cpu + p.cpu <= NODE.cpu && x.mem + p.mem <= NODE.mem);
      if (!n) { n = { cpu: 0, mem: 0, pods: [] }; nodes.push(n); }
      n.cpu += p.cpu; n.mem += p.mem; n.pods.push(who);
    };
    for (let i = 0; i < mlPods; i++) place(mlPod, 'm');
    for (let i = 0; i < appPods; i++) place(pod, 'a');
    const copies = !needsMl ? 0 : mode === 'remote' ? mlPods : appPods;
    const hop = !needsMl ? 0 : { lib: 0.02, sidecar: 0.3, remote: 3 }[mode];
    const lat = 4 + (needsMl ? INFER + hop : 0) + (on.amb ? 0.3 : 0);
    return { pod, appPods, mlPods, nodes, cpu, mem, copies, hop, lat, perPod };
  }

  function render() {
    addBtns.forEach(([k, b]) => { b.textContent = (on[k] ? '✓ ' : '+ ') + C[k].short; b.classList.toggle('primary', on[k]); });
    modeBtns.forEach(([v, b]) => { b.classList.toggle('primary', v === mode); b.disabled = !on.ml; });
    natBtn.textContent = native ? 'Sidecars: native' : 'Sidecars: legacy';
    natBtn.classList.toggle('primary', native);
    rpsLab.textContent = rps + ' req/s';
    const list = podContainers(), tl = timeline(list), cap = capacity(list);
    const W = narrow ? 360 : 720, FS = narrow ? 14 : 13.5, RH = narrow ? 46 : 34, X0 = narrow ? 10 : 200, X1 = W - 14;
    const tMax = Math.max(tl.ready, ...tl.rows.map((r) => r.r)) + 6;
    const sx = (t) => X0 + (t / tMax) * (X1 - X0);
    const g = svg('g');
    g.append(svg('text', { x: 10, y: 18, fill: 'var(--text-2)', style: `font:700 ${FS}px var(--sans)`, text: 'Pod startup (seconds)' }));
    let y = 32;
    tl.rows.forEach((r) => {
      const ly = narrow ? y + 14 : y + RH / 2 + 5, by = narrow ? y + 20 : y + 6, bh = narrow ? 18 : 20;
      g.append(svg('text', { x: 10, y: ly, fill: 'var(--text)', style: `font:600 ${FS}px var(--sans)`, text: r.c.n + (r.c.kind === 'side' ? (native ? ' · native' : ' · regular') : '') }));
      g.append(svg('rect', { x: sx(r.s), y: by, width: Math.max(3, sx(r.r) - sx(r.s)), height: bh, rx: 4, fill: r.c.col, opacity: 0.45 }));
      if (r.run) g.append(svg('rect', { x: sx(r.r), y: by, width: Math.max(2, X1 - sx(r.r)), height: bh, rx: 4, fill: r.c.col, opacity: 0.9 }));
      y += RH;
    });
    if (tl.race) {
      g.append(svg('rect', { x: sx(tl.race[0]), y: 28, width: sx(tl.race[1]) - sx(tl.race[0]), height: y - 28, fill: 'var(--err)', opacity: 0.15 }));
      g.append(svg('text', { x: sx(tl.race[0]) + 3, y: y + 14, fill: 'var(--err)', style: `font:700 ${FS}px var(--sans)`, text: 'app Ready, model not: errors' }));
      y += 14;
    }
    const rx = sx(tl.ready);
    g.append(svg('line', { x1: rx, y1: 26, x2: rx, y2: y + 2, stroke: 'var(--ok)', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
    g.append(svg('text', { x: Math.min(rx + 4, X1 - 90), y: y + 18 + (tl.race ? 4 : 0), fill: 'var(--ok)', style: `font:700 ${FS}px var(--sans)`, text: 'Ready at ' + tl.ready.toFixed(1) + ' s' }));
    y += 40;
    // node packing
    g.append(svg('text', { x: 10, y, fill: 'var(--text-2)', style: `font:700 ${FS}px var(--sans)`, text: 'Nodes (8 vCPU / 32 GiB): ' + cap.nodes.length }));
    y += 10;
    const cols = narrow ? 6 : 12, NW = (W - 20 - (cols - 1) * 6) / cols, NH = narrow ? 44 : 40;
    const shown = cap.nodes.slice(0, cols * 2);
    shown.forEach((n, i) => {
      const nx = 10 + (i % cols) * (NW + 6), ny = y + Math.floor(i / cols) * (NH + 6);
      g.append(svg('rect', { x: nx, y: ny, width: NW, height: NH, rx: 5, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      const memA = n.pods.filter((p) => p === 'a').length * cap.pod.mem, memM = n.pods.filter((p) => p === 'm').length * C.ml.mem;
      const hA = (memA / NODE.mem) * (NH - 4), hM = (memM / NODE.mem) * (NH - 4);
      g.append(svg('rect', { x: nx + 2, y: ny + NH - 2 - hA, width: NW - 4, height: hA, fill: 'var(--accent)', opacity: 0.6 }));
      if (hM) g.append(svg('rect', { x: nx + 2, y: ny + NH - 2 - hA - hM, width: NW - 4, height: hM, fill: 'var(--k-ml)', opacity: 0.8 }));
      g.append(svg('text', { x: nx + NW / 2, y: ny + NH / 2 + 5, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${FS}px var(--sans)`, text: String(n.pods.length) }));
    });
    const rowsN = Math.ceil(shown.length / cols);
    y += rowsN * (NH + 6) + (cap.nodes.length > shown.length ? 20 : 4);
    if (cap.nodes.length > shown.length) g.append(svg('text', { x: 10, y: y - 4, fill: 'var(--text-3)', style: `font:600 ${FS}px var(--sans)`, text: '+ ' + (cap.nodes.length - shown.length) + ' more nodes' }));
    const S = svg('svg', { viewBox: `0 0 ${W} ${y + 6}`, role: 'img', 'aria-label': 'Pod startup timeline and node packing' });
    S.append(g);
    stage.innerHTML = ''; stage.append(S);

    stats.innerHTML = '';
    const items = {
      'Pod requests': (cap.pod.cpu / 1000).toFixed(2) + ' vCPU · ' + (cap.pod.mem / 1024).toFixed(1) + ' GiB',
      'App Pods': cap.appPods + ' (' + cap.perPod + ' req/s each)',
      'Model replicas': on.ml ? cap.copies + (mode === 'remote' ? ' (own Deployment)' : ' (one per app Pod)') : 'none',
      'Total requests': (cap.cpu / 1000).toFixed(1) + ' vCPU · ' + (cap.mem / 1024).toFixed(0) + ' GiB',
      'Request latency': '≈ ' + cap.lat.toFixed(1) + ' ms' + (on.ml ? ' (model hop ' + cap.hop + ' ms)' : ''),
      'Pod ready after': tl.ready.toFixed(1) + ' s'
    };
    Object.entries(items).forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    log.innerHTML = '';
    const say = (t) => log.append(el('div', { html: t }));
    say('Bars: light = starting / running to completion, solid = running. Node squares: number of Pods; fill = memory requested (<b style="color:var(--accent)">app Pods</b>, <b style="color:var(--k-ml)">model service</b>).');
    if (tl.race) say('⚠ <b>Startup race</b>: legacy sidecars start alongside the app. The app is Ready ' + (tl.race[1] - tl.race[0]).toFixed(1) + ' s before the model, so scoring calls fail. Native sidecars gate the app on the model\'s startup probe.');
    else if (on.ml && mode === 'sidecar') say('✓ Native sidecar: the app starts only after the model\'s startup probe passes. Slower start, no failed first requests, and sidecars stop after the app.');
    if (on.ml && mode !== 'remote') say('Scaling is <b>coupled</b>: each Pod handles min(app ' + APP_RPS + ', model ' + ML_RPS + ') = ' + cap.perPod + ' req/s, so ' + cap.appPods + ' Pods carry ' + cap.copies + ' model copies.' + (mode === 'lib' ? ' Model memory lives in the JVM process; a model update is an app release.' : ''));
    if (on.ml && mode === 'remote') say('Scaling is <b>independent</b>: ' + cap.appPods + ' light app Pods + ' + cap.mlPods + ' model Pods, each scaled on its own signal. Cost: a ~3 ms network hop, a timeout and a breaker (estimate).');
    if (cap.hop === 0 && on.ml) say('Library: zero transport, but a Python model in a JVM needs ONNX export or a native binding.');
    if (!on.ml) say('No model: each Pod handles ' + APP_RPS + ' req/s.');
  }
  render();
  ctx.onResize((nw) => { narrow = nw; render(); });
});
