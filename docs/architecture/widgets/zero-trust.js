/* Lateral movement simulator. 12 services with a declared call graph.
   An attacker holds one foothold and probes every other service. Each attempt passes three layers in order:
   1) network: flat = any pod may connect; micro-segmentation = only declared caller->callee edges (by pod label)
   2) mTLS: the caller must present a valid workload cert (a rogue pod has none; a compromised service keeps its own)
   3) authz policy at the callee's PEP: only declared caller principals, only declared method/path
   Reached services become new footholds (worst case: full pivot) unless authz limited the attacker to one API call. BFS. */
SD.widget('zero-trust', function (root, ctx) {
  const { el, svg } = ctx;
  const SVC = [
    ['web', 'web'], ['cart', 'cart'], ['catalog', 'catalog'], ['search', 'search'],
    ['orders', 'orders'], ['users', 'users'], ['notify', 'notify'], ['report', 'report-job'],
    ['payments', 'payments'], ['ledger', 'ledger'], ['vault', 'card-vault'], ['admin', 'admin']
  ];
  const CALLS = { web: ['cart', 'catalog', 'search', 'orders'], cart: ['catalog'], search: ['catalog'], orders: ['payments', 'users', 'notify'],
    report: ['orders'], payments: ['ledger', 'vault'], admin: ['users'], ledger: [], vault: [], users: [], notify: [], catalog: [] };
  const PATH = { cart: 'GET /items', catalog: 'GET /products', search: 'GET /q', orders: 'GET /orders', payments: 'POST /charge',
    users: 'GET /users/{id}', notify: 'POST /send', ledger: 'POST /entries', vault: 'POST /tokenize' };
  const allowed = (a, b) => (CALLS[a] || []).includes(b);
  const sp = (id) => 'spiffe://acme/ns/prod/sa/' + id;
  const st = { foot: 'report', net: 'flat', mtls: false, authz: false };
  let busy = false, result = null, shown = 0;

  const seg = (label, key, opts) => {
    const wrap = el('div', { class: 'seg', role: 'group', 'aria-label': label });
    const btns = opts.map(([v, l]) => el('button', { class: 'btn', text: l, onclick: () => { if (busy) return; st[key] = v; sync(); compute(); paint(); } }));
    wrap.append(el('span', { class: 'muted', style: { fontSize: '13px', marginRight: '6px' }, text: label }), ...btns);
    return { wrap, btns, opts, key };
  };
  const ctrls = [
    seg('Foothold', 'foot', [['report', 'Compromised report-job'], ['web', 'Compromised web'], ['rogue', 'Rogue pod (no identity)']]),
    seg('Network', 'net', [['flat', 'Flat'], ['micro', 'Micro-segmented']]),
    seg('mTLS', 'mtls', [[false, 'Off'], [true, 'On']]),
    seg('Authz policy', 'authz', [[false, 'Off'], [true, 'Default-deny']])
  ];
  function sync() {
    if (st.authz && !st.mtls) st.mtls = true;   // authz by principal needs mTLS identities
    ctrls.forEach((c) => c.btns.forEach((b, i) => b.classList.toggle('primary', c.opts[i][0] === st[c.key])));
  }
  const runBtn = el('button', { class: 'btn primary', text: '▶ Attack', onclick: () => run() });
  const ctl = el('div', { class: 'w-controls' }, ...ctrls.map((c) => c.wrap), runBtn);
  root.append(ctl);
  const box = el('div', { style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px' } });
  root.append(box);
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);

  // ---- mechanism
  function attempt(from, to) {
    const rogue = from === 'rogue';
    if (st.net === 'micro' && (rogue || !allowed(from, to))) return { ok: false, layer: 'net', why: `NetworkPolicy: no ingress rule ${rogue ? 'for unlabelled pod' : from + ' → ' + to}; SYN dropped` };
    if (st.mtls && rogue) return { ok: false, layer: 'mtls', why: 'mTLS handshake failed: no client certificate (no SVID)' };
    if (st.authz && !allowed(from, to)) return { ok: false, layer: 'authz', why: `403 RBAC: access denied. principal ${sp(from)} not in allowed principals of ${to}` };
    return { ok: true, pivot: !st.authz, api: st.authz ? PATH[to] : 'any port / any path' };
  }
  function compute() {
    const tries = [], reached = new Set(), queue = [st.foot], seen = new Set([st.foot]);
    while (queue.length) {
      const cur = queue.shift();
      SVC.forEach(([id]) => {
        if (id === cur || id === st.foot || reached.has(id)) return;
        const r = attempt(cur, id);
        tries.push({ from: cur, to: id, ...r });
        if (r.ok && !reached.has(id)) { reached.add(id); if (r.pivot && !seen.has(id)) { seen.add(id); queue.push(id); } }
      });
    }
    result = { tries, reached };
    shown = tries.length;
  }

  // ---- drawing
  let S, W, FS, pos = {};
  function layout(narrow) {
    W = narrow ? 360 : 640; FS = narrow ? 14 : 13;
    const cols = narrow ? 3 : 4, cw = (W - 20) / cols, rh = narrow ? 70 : 78;
    pos = {};
    SVC.forEach(([id], i) => { pos[id] = { x: 10 + cw * (i % cols) + cw / 2, y: 64 + Math.floor(i / cols) * rh, w: cw - 12 }; });
    pos.rogue = { x: W / 2, y: 18, w: narrow ? 150 : 170 };
    const H = 64 + Math.ceil(SVC.length / cols) * rh - 20;
    box.innerHTML = '';
    S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Service graph showing lateral movement' });
    box.append(S);
  }
  function paint() {
    S.innerHTML = '';
    const tries = result.tries.slice(0, shown);
    const reached = new Set(tries.filter((t) => t.ok).map((t) => t.to));
    // declared call graph (faint)
    Object.entries(CALLS).forEach(([a, bs]) => bs.forEach((b) => S.append(svg('line', { x1: pos[a].x, y1: pos[a].y, x2: pos[b].x, y2: pos[b].y, stroke: 'var(--border)', 'stroke-width': 1.5 }))));
    // attempts: show successful ones and the last few denied
    const denied = tries.filter((t) => !t.ok).slice(-4);
    tries.filter((t) => t.ok).concat(denied).forEach((t) => {
      const a = pos[t.from], b = pos[t.to];
      S.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: t.ok ? 'var(--err)' : 'var(--ok)', 'stroke-width': t.ok ? 2.5 : 1.5, 'stroke-dasharray': t.ok ? '' : '4 4', opacity: t.ok ? 0.85 : 0.7 }));
    });
    const node = (id, label, kind) => {
      const p = pos[id], h = 34;
      const fill = kind === 'foot' ? 'var(--err)' : kind === 'hit' ? 'color-mix(in srgb, var(--err) 25%, var(--surface))' : 'var(--surface)';
      const stroke = kind === 'safe' ? 'var(--ok)' : kind === 'hit' || kind === 'foot' ? 'var(--err)' : 'var(--border)';
      S.append(svg('rect', { x: p.x - p.w / 2, y: p.y - h / 2, width: p.w, height: h, rx: 8, fill, stroke, 'stroke-width': 2 }));
      S.append(svg('text', { x: p.x, y: p.y + FS / 3, 'text-anchor': 'middle', fill: kind === 'foot' ? '#fff' : 'var(--text)', style: `font:600 ${FS}px var(--sans)`, text: label }));
    };
    const done = shown >= result.tries.length;
    SVC.forEach(([id, label]) => node(id, label, id === st.foot ? 'foot' : reached.has(id) ? 'hit' : done ? 'safe' : 'idle'));
    if (st.foot === 'rogue') node('rogue', 'rogue pod', 'foot');
    // stats
    const total = SVC.length - (st.foot === 'rogue' ? 0 : 1);
    const nDeny = (l) => tries.filter((t) => !t.ok && t.layer === l).length;
    stats.innerHTML = '';
    [['Blast radius', `<b>${reached.size}</b> of ${total} services`], ['Attempts', tries.length],
      ['Stopped by network', nDeny('net')], ['Stopped by mTLS', nDeny('mtls')], ['Stopped by authz (PEP)', nDeny('authz')],
      ['Reach per service', st.authz ? 'one declared API' : 'any port, any path']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  const say = (h) => { log.insertBefore(el('div', { html: h }), log.firstChild); while (log.childNodes.length > 7) log.removeChild(log.lastChild); };

  function summary() {
    const n = result.reached.size;
    const deny = result.tries.find((t) => !t.ok && t.layer === 'authz') || result.tries.find((t) => !t.ok);
    if (deny) say(`⛔ PEP at <b>${deny.to}</b>: ${deny.why}`);
    if (st.mtls && !st.authz && st.foot !== 'rogue') say('⚠ mTLS is on, but the compromised service still holds a <b>valid certificate</b>, so every handshake succeeds. Authentication is not authorisation.');
    if (st.authz) say(`✅ Authz limits the foothold to its declared calls (e.g. <code>${PATH[(CALLS[st.foot] || [])[0]] || '—'}</code>) and no pivot: the attacker gets an API, not a shell.`);
    say(`${n === 0 ? '✅' : n > 6 ? '❌' : '⚠'} Blast radius: <b>${n}</b> service${n === 1 ? '' : 's'} reachable${result.reached.has('vault') ? ', <b>including card-vault</b>' : ''}.`);
  }

  function run() {
    if (busy) return;
    compute();
    say(`▶ Foothold <b>${st.foot === 'rogue' ? 'rogue pod' : st.foot}</b>; network ${st.net}, mTLS ${st.mtls ? 'on' : 'off'}, authz ${st.authz ? 'default-deny' : 'off'}.`);
    if (ctx.reduced) { shown = result.tries.length; paint(); summary(); return; }
    busy = true; runBtn.disabled = true; shown = 0;
    let acc = 0;
    const h = ctx.loop((dt) => {
      acc += dt;
      if (acc > 110) { acc = 0; shown++; paint(); }
      if (shown >= result.tries.length) { h.stop(); busy = false; runBtn.disabled = false; paint(); summary(); }
    });
  }

  layout(ctx.narrow);
  ctx.onResize((n) => { layout(n); paint(); });
  sync(); compute(); paint();
  say('Tip: start Flat + mTLS on and press Attack, then switch Authz to Default-deny. Try the rogue pod with mTLS on.');
});
