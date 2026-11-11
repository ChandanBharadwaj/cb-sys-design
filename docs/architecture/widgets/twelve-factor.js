/* Part 1: 12-factor audit lighting up failures in a cluster. Part 2: rolling update with/without graceful shutdown. */
SD.widget('twelve-factor', function (root, ctx) {
  const { el, svg } = ctx;
  const F = [
    { n: 'I', name: 'Codebase', bad: 'Prod hot-patched on the box', t: 'prd', b: 'unknown code', fail: 'Prod runs code that is in no commit. The next deploy silently removes the hotfix.' },
    { n: 'II', name: 'Dependencies', bad: 'Needs ImageMagick on host', t: 'p2', b: 'no lib', fail: 'A pod lands on a new node image without the tool and crashes on the first upload.' },
    { n: 'III', name: 'Config', bad: 'application-prod.yml in image', t: 'stg', b: 'drift', fail: 'Staging and prod run different images; prod’s pool size was never tested. Rotating a password needs a rebuild.' },
    { n: 'IV', name: 'Backing services', bad: 'DB host hard-coded', t: 'db', b: 'hard-coded', fail: 'Failing over to the replica needs a code change and a rebuild while the site is down.' },
    { n: 'V', name: 'Build/release/run', bad: 'mvn package at container start', t: 'build', b: 'no release', fail: 'Each start may pull different dependencies; there is no release to roll back to.' },
    { n: 'VI', name: 'Processes', bad: 'Session in RAM, sticky LB', t: 'p3', b: 'sessions', fail: 'Scale-in deletes pod 4: its users are logged out and their uploads on local disk are gone.' },
    { n: 'VII', name: 'Port binding', bad: 'WAR in shared app server', t: 'lb', b: 'needs Tomcat', fail: 'The app cannot run on its own; restarting the shared server takes every app on it down.' },
    { n: 'VIII', name: 'Concurrency', bad: 'One giant process', t: 'p0', b: 'scale up', fail: 'Web and background jobs share one process: a queue backlog can only be fixed with a bigger VM.' },
    { n: 'IX', name: 'Disposability', bad: '90 s start, exit on SIGTERM', t: 'p1', b: '502s', fail: 'Every rolling deploy cuts in-flight requests, and autoscaling arrives after the spike has passed.' },
    { n: 'X', name: 'Dev/prod parity', bad: 'H2 in dev, Postgres in prod', t: 'dev', b: 'H2≠PG', fail: 'A query that passed every test fails in prod on a Postgres-specific type.' },
    { n: 'XI', name: 'Logs', bad: 'Log files in the container', t: 'logs', b: 'lost', fail: 'The pod is killed and its log file goes with it; nobody can see why it crashed.' },
    { n: 'XII', name: 'Admin processes', bad: 'SQL pasted via kubectl exec', t: 'job', b: 'ad-hoc', fail: 'A data fix runs from a laptop with local config against prod; nothing records what changed.' }
  ];
  const on = F.map(() => true);
  on[2] = false; on[5] = false; on[10] = false;              // start with three classic violations
  let gen = 0, loops = [];

  function build() {
    const my = ++gen;
    loops.forEach((l) => l.stop()); loops = [];
    root.innerHTML = '';
    const FS = 14, FB = 13;
    const txt = (x, y, s, o) => svg('text', Object.assign({ x, y, 'text-anchor': (o && o.a) || 'middle', fill: (o && o.c) || 'var(--text-2)', style: `font:600 ${(o && o.f) || FS}px var(--sans)`, text: s }));

    // ---------- Part 1: audit ----------
    root.append(el('h4', { text: '1 · Factor audit', style: { margin: '0 0 6px' } }));
    const grid = el('div', { class: 'w-controls', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px' } });
    const btns = F.map((f, i) => {
      const b = el('button', { class: 'btn', 'aria-pressed': String(on[i]) });
      b.addEventListener('click', () => { on[i] = !on[i]; paint1(); });
      grid.append(b); return b;
    });
    const allBtn = el('button', { class: 'btn primary', text: 'All twelve ✓' });
    allBtn.addEventListener('click', () => { on.fill(true); paint1(); });
    const noneBtn = el('button', { class: 'btn', text: 'Pet server ✗' });
    noneBtn.addEventListener('click', () => { on.fill(false); paint1(); });
    root.append(grid, el('div', { class: 'w-controls' }, allBtn, noneBtn));

    const W = 360, H1 = 300;
    const S1 = svg('svg', { viewBox: `0 0 ${W} ${H1}`, role: 'img', 'aria-label': 'Cluster with failures caused by violated factors', style: { maxWidth: '560px', display: 'block', margin: '0 auto' } });
    const box = {};
    const mk = (id, x, y, w, h, label) => {
      const r = svg('rect', { x, y, width: w, height: h, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 2 });
      const t = txt(x + w / 2, y + 19, label);
      const b = txt(x + w / 2, y + 38, '', { f: FB, c: 'var(--err)' });
      S1.append(r, t, b); box[id] = { r, b, x: x + w / 2, y: y + h / 2 };
    };
    S1.append(txt(4, 14, 'environments', { a: 'start', f: FB, c: 'var(--text-3)' }));
    mk('dev', 4, 20, 112, 46, 'dev'); mk('stg', 124, 20, 112, 46, 'staging'); mk('prd', 244, 20, 112, 46, 'prod');
    mk('build', 4, 80, 112, 46, 'CI build'); mk('lb', 124, 80, 112, 46, 'Ingress'); mk('job', 244, 80, 112, 46, 'Admin task');
    ['p0', 'p1', 'p2', 'p3'].forEach((id, i) => mk(id, 4 + i * 89, 146, 84, 46, 'pod ' + (i + 1)));
    mk('db', 4, 226, 172, 46, 'Postgres / Redis'); mk('logs', 184, 226, 172, 46, 'Log collector');
    const dots = svg('g'); S1.append(dots);
    root.append(S1);
    const status1 = el('div', { class: 'w-stats' });
    const log1 = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(status1, log1);

    function paint1() {
      Object.values(box).forEach((o) => { o.r.setAttribute('stroke', 'var(--border)'); o.r.setAttribute('fill', 'var(--surface-2)'); o.b.textContent = ''; });
      F.forEach((f, i) => {
        btns[i].textContent = (on[i] ? '✓ ' : '✗ ') + f.n + ' ' + f.name;
        btns[i].setAttribute('aria-pressed', String(on[i]));
        btns[i].style.borderColor = on[i] ? 'var(--ok)' : 'var(--err)';
        if (!on[i]) { const o = box[f.t]; o.r.setAttribute('stroke', 'var(--err)'); o.r.setAttribute('fill', 'color-mix(in srgb, var(--err) 14%, var(--surface))'); o.b.textContent = o.b.textContent ? o.b.textContent + ' +' : f.b; }
      });
      if (!on[2]) { const o = box.prd; o.r.setAttribute('stroke', 'var(--err)'); if (!o.b.textContent) o.b.textContent = 'drift'; }
      const bad = F.filter((f, i) => !on[i]);
      status1.innerHTML = '';
      status1.append(el('span', { class: 'w-stat', html: `score: <b>${12 - bad.length}/12</b>` }),
        el('span', { class: 'w-stat', html: `disposable pods: <b>${on[5] && on[8] && on[10] ? 'yes' : 'no'}</b>` }),
        el('span', { class: 'w-stat', html: `same image everywhere: <b>${on[2] && on[4] ? 'yes' : 'no'}</b>` }));
      log1.innerHTML = '';
      if (!bad.length) log1.append(el('div', { html: '✅ Every pod can be killed, copied or moved; one image is promoted with per-environment config.' }));
      bad.forEach((f) => log1.append(el('div', { html: `<b style="color:var(--err)">${f.n} ${f.name}</b> (${f.bad}): ${f.fail}` })));
    }
    paint1();

    // traffic + periodic platform events
    let acc = 0, evAcc = 0, ev = 0;
    const live = [];
    const pods = ['p0', 'p1', 'p2', 'p3'];
    const EVENTS = [
      { name: 'scale-in removes pod 4', hit: [5, 10], pod: 'p3' },
      { name: 'rolling deploy kills pod 2', hit: [8, 10, 4], pod: 'p1' },
      { name: 'promote staging → prod', hit: [2, 0, 9], pod: null },
      { name: 'pod rescheduled to a new node', hit: [1, 5, 10], pod: 'p2' }
    ];
    function flash(id) { const o = box[id]; if (!o) return; o.r.setAttribute('stroke-width', 5); setTimeout(() => o.r.setAttribute('stroke-width', 2), 600); }
    function event() {
      const e = EVENTS[ev++ % EVENTS.length];
      const hits = e.hit.filter((i) => !on[i]);
      if (e.pod) flash(e.pod);
      hits.forEach((i) => flash(F[i].t));
      const msg = hits.length ? `⚡ <b>${e.name}</b> → ` + hits.map((i) => `<span style="color:var(--err)">${F[i].n}: ${F[i].b}</span>`).join(', ') : `⚡ <b>${e.name}</b> → nobody notices ✓`;
      if (my === gen) { log1.prepend(el('div', { html: msg })); while (log1.children.length > 16) log1.lastChild.remove(); }
    }
    if (!ctx.reduced) {
      loops.push(ctx.loop((dt) => {
        acc += dt; evAcc += dt;
        if (acc > 260) {
          acc = 0;
          const p = pods[Math.floor(Math.random() * 4)];
          const c = svg('circle', { r: 5, cx: box.lb.x, cy: box.lb.y, fill: 'var(--accent)' }); dots.append(c);
          live.push({ c, p, t: 0 });
        }
        for (let i = live.length - 1; i >= 0; i--) {
          const d = live[i]; d.t += dt / 700;
          const a = box.lb, b = box[d.p];
          const bad = (d.p === 'p3' && !on[5]) || (d.p === 'p1' && !on[8]);
          d.c.setAttribute('cx', a.x + (b.x - a.x) * Math.min(1, d.t)); d.c.setAttribute('cy', a.y + 23 + (b.y - 23 - a.y - 23) * Math.min(1, d.t));
          if (d.t > 0.7 && bad) d.c.setAttribute('fill', 'var(--err)');
          if (d.t >= 1.2) { d.c.remove(); live.splice(i, 1); }
        }
        if (evAcc > 3200) { evAcc = 0; event(); }
      }));
    } else { const b = el('button', { class: 'btn', text: '⚡ Next platform event' }); b.addEventListener('click', event); root.insertBefore(el('div', { class: 'w-controls' }, b), status1); }

    // ---------- Part 2: disposability sim ----------
    root.append(el('h4', { text: '2 · Rolling update: kill pods with and without graceful shutdown', style: { margin: '18px 0 6px' } }));
    let graceful = false, readiness = true, startS = 4;
    const gBtn = el('button', { class: 'btn', text: 'Graceful: off' });
    const rBtn = el('button', { class: 'btn', text: 'Readiness probe: on' });
    const runBtn = el('button', { class: 'btn primary', text: '▶ Roll out' });
    const sV = el('b', { text: startS + ' s' });
    const sIn = el('input', { type: 'range', min: 1, max: 10, step: 1, value: startS, 'aria-label': 'Startup time' });
    sIn.addEventListener('input', () => { startS = +sIn.value; sV.textContent = startS + ' s'; });
    gBtn.addEventListener('click', () => { graceful = !graceful; gBtn.textContent = 'Graceful: ' + (graceful ? 'on' : 'off'); run(); });
    rBtn.addEventListener('click', () => { readiness = !readiness; rBtn.textContent = 'Readiness probe: ' + (readiness ? 'on' : 'off'); run(); });
    runBtn.addEventListener('click', run);
    root.append(el('div', { class: 'w-controls' }, runBtn, gBtn, rBtn, el('label', null, 'Startup ', sV, ' ', sIn)));
    const LX = 70, PW = 280, LH = 26, TOP = 8, NL = 8, H2 = TOP + NL * LH + 34;
    const S2 = svg('svg', { viewBox: `0 0 ${W} ${H2}`, role: 'img', 'aria-label': 'Timeline of pods and requests during a rolling update', style: { maxWidth: '560px', display: 'block', margin: '0 auto' } });
    const g2 = svg('g'); S2.append(g2);
    const head = svg('line', { y1: TOP, y2: TOP + NL * LH, stroke: 'var(--accent)', 'stroke-width': 2 }); S2.append(head);
    root.append(S2);
    root.append(el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Bars: <b style="color:var(--text-3)">■</b> starting, <b style="color:var(--accent)">■</b> serving, <b style="color:var(--warn)">■</b> terminating. Ticks: <b style="color:var(--ok)">|</b> request served, <b style="color:var(--err)">|</b> refused or cut. Requests: 30/s, 800 ms each, round-robin over the endpoints the proxy currently knows.' }));
    const stats2 = el('div', { class: 'w-stats' });
    const log2 = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats2, log2);

    function sim() {
      const RATE = 30, DUR = 0.8, PRE = 5;
      const pods = [];
      let t0 = 0.8;
      for (let i = 0; i < 4; i++) pods.push({ lane: 2 * i, start: -10, ready: -10, kill: 0, lag: 0.5 + Math.random() * 2 });
      for (let i = 0; i < 4; i++) {                       // maxSurge 1, maxUnavailable 0
        const nw = { lane: 2 * i + 1, start: t0, ready: t0 + startS, kill: Infinity, lag: 0 };
        pods.push(nw); pods[i].kill = nw.ready; t0 = nw.ready;
      }
      const T = t0 + (graceful ? PRE + 2 : 3);
      const reqs = []; let rr = 0, fail = 0, cut = 0, refused = 0;
      for (let t = 0; t < T; t += 1 / RATE) {
        // proxy view: added on readiness (or container start without a probe), removed lag seconds after deletion
        const eps = pods.filter((p) => t >= (readiness ? p.ready : p.start) && t < p.kill + p.lag);
        if (!eps.length) continue;
        const p = eps[rr++ % eps.length];
        let ok = true;
        if (t < p.ready) { ok = false; refused++; }                         // app not listening yet
        else if (!graceful && t >= p.kill) { ok = false; refused++; }        // process already gone
        else if (!graceful && t + DUR > p.kill) { ok = false; cut++; }        // in flight when killed
        if (!ok) fail++;
        reqs.push({ t, lane: p.lane, ok });
      }
      return { pods, reqs, T, fail, cut, refused, PRE };
    }

    let R = null, loop2 = null;
    function draw(upTo) {
      g2.innerHTML = '';
      const X = (t) => LX + PW * Math.max(0, Math.min(t, R.T)) / R.T;
      for (let l = 0; l < NL; l++) g2.append(txt(LX - 6, TOP + l * LH + 17, (l % 2 ? 'new ' : 'old ') + ((l >> 1) + 1), { a: 'end', f: FB }));
      R.pods.forEach((p) => {
        const y = TOP + p.lane * LH + 6, h = LH - 12;
        const s = Math.max(0, p.start), endServe = Math.min(p.kill, upTo), endTerm = graceful ? p.kill + R.PRE + 0.8 : p.kill;
        if (upTo > s) g2.append(svg('rect', { x: X(s), y, width: Math.max(0, X(Math.min(p.ready, upTo)) - X(s)), height: h, fill: 'var(--text-3)', opacity: 0.45 }));
        if (upTo > p.ready) g2.append(svg('rect', { x: X(Math.max(0, p.ready)), y, width: Math.max(0, X(endServe) - X(Math.max(0, p.ready))), height: h, fill: 'var(--accent)', opacity: 0.5 }));
        if (upTo > p.kill && endTerm > p.kill) g2.append(svg('rect', { x: X(p.kill), y, width: Math.max(0, X(Math.min(endTerm, upTo)) - X(p.kill)), height: h, fill: 'var(--warn)', opacity: 0.6 }));
      });
      R.reqs.forEach((q) => { if (q.t <= upTo) g2.append(svg('rect', { x: X(q.t), y: TOP + q.lane * LH + 3, width: 1.4, height: LH - 6, fill: q.ok ? 'var(--ok)' : 'var(--err)' })); });
      [0, R.T / 2, R.T].forEach((t, i) => g2.append(txt(X(t), TOP + NL * LH + 20, Math.round(t) + ' s', { a: ['start', 'middle', 'end'][i], f: FB })));
      head.setAttribute('x1', X(upTo)); head.setAttribute('x2', X(upTo));
      const seen = R.reqs.filter((q) => q.t <= upTo), bad = seen.filter((q) => !q.ok).length;
      stats2.innerHTML = '';
      [['requests', seen.length], ['failed', bad], ['failure rate', seen.length ? (100 * bad / seen.length).toFixed(1) + '%' : '0%'], ['rollout', R.T.toFixed(1) + ' s']].forEach(([k, v]) => stats2.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
    function finish() {
      if (my !== gen) return;
      log2.innerHTML = '';
      const lines = [];
      if (graceful) lines.push(`✅ preStop sleep ${R.PRE} s covered the endpoint lag (0.5–2.5 s), then Spring drained in-flight requests. Refused: ${R.refused}, cut: ${R.cut}.`);
      else lines.push(`❌ Pods exited on SIGTERM: <b>${R.cut}</b> in-flight requests were cut and <b>${R.refused}</b> were sent to a pod that was gone (the proxy had not caught up yet).`);
      if (!readiness) lines.push('⚠ Without a readiness probe, new pods got traffic the moment the container started, before Spring was listening: those requests were refused.');
      lines.push(`Total: ${R.fail} of ${R.reqs.length} requests failed in one rollout of 4 pods.`);
      lines.forEach((l) => log2.append(el('div', { html: l })));
    }
    function run() {
      if (my !== gen) return;
      if (loop2) { loop2.stop(); loop2 = null; }
      R = sim();
      if (ctx.reduced) { draw(R.T); finish(); return; }
      let t = 0; runBtn.disabled = true;
      loop2 = ctx.loop((dt) => {
        t = Math.min(R.T, t + (Math.min(dt, 100) / 1000) * R.T / 7);   // play in ~7 s
        draw(t);
        if (t >= R.T) { loop2.stop(); loop2 = null; runBtn.disabled = false; finish(); }
      });
      loops.push(loop2);
    }
    R = sim(); draw(0);
    log2.append(el('div', { html: 'Press <b>Roll out</b>, then turn <b>Graceful</b> on and compare the red ticks.' }));
  }
  build();
  ctx.onResize(() => {});
});
