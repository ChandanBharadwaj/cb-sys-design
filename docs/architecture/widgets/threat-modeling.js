/* Interactive DFD with trust boundaries: STRIDE-per-element threat enumeration, mitigation tracking, residual risk. */
SD.widget('threat-modeling', function (root, ctx) {
  const { el, svg } = ctx;
  // STRIDE per element: which categories apply to each DFD element type (Microsoft SDL)
  const APPLIES = { entity: 'SR', process: 'STRIDE', store: 'TRID', flow: 'TID' };
  const PROP = { S: 'authentication', T: 'integrity', R: 'non-repudiation', I: 'confidentiality', D: 'availability', E: 'authorisation' };
  const ZONES = { internet: 'Internet', corp: 'Corp network', dmz: 'DMZ', internal: 'Internal', psp: 'Payment provider' };
  const NODES = [
    { id: 'browser', l: 'Browser', t: 'entity', z: 'internet' },
    { id: 'admin', l: 'Admin user', t: 'entity', z: 'corp' },
    { id: 'gw', l: 'API gateway', t: 'process', z: 'dmz' },
    { id: 'order', l: 'Order service', t: 'process', z: 'internal' },
    { id: 'db', l: 'Orders DB', t: 'store', z: 'internal' },
    { id: 'pay', l: 'Payment prov.', t: 'entity', z: 'psp' }
  ];
  const FLOWS = [
    { id: 'f1', a: 'browser', b: 'gw', l: 'HTTPS order' },
    { id: 'f2', a: 'admin', b: 'gw', l: 'admin API' },
    { id: 'f3', a: 'gw', b: 'order', l: 'JWT call' },
    { id: 'f4', a: 'order', b: 'db', l: 'SQL' },
    { id: 'f5', a: 'order', b: 'pay', l: 'charge', off: -14 },
    { id: 'f6', a: 'pay', b: 'order', l: 'webhook', off: -14 }
  ];
  const byId = {}; NODES.forEach((n) => { byId[n.id] = n; });
  FLOWS.forEach((f) => { f.t = 'flow'; f.cross = byId[f.a].z !== byId[f.b].z; byId[f.id] = f; });
  // [category, threat, mitigation, severity 1..3]
  const T = {
    browser: [['S', 'Attacker logs in as a customer with stuffed credentials', 'MFA / passkeys, breached-password check, login rate limit', 3], ['R', 'Customer denies placing an order', 'Signed order confirmation + audit log with session id', 1]],
    admin: [['S', 'Phished admin password used from anywhere', 'SSO with phishing-resistant MFA, device posture check', 3], ['R', 'Admin denies refunding an order', 'Per-action audit log, append-only, user id from token', 2]],
    gw: [['S', 'Forged or expired JWT accepted', 'Verify signature, iss, aud, exp; alg allow-list', 3], ['T', 'Request smuggling alters routed request', 'Normalise headers, reject ambiguous Content-Length', 2], ['R', 'No record of who called what', 'Structured access logs with subject and request id', 1], ['I', 'Stack traces in error responses', 'Generic errors, details only in logs', 1], ['D', 'Bot floods checkout', 'Per-client rate limits, WAF, autoscaling caps', 2], ['E', 'Admin routes reachable from public listener', 'Separate admin listener, role check at the edge', 3]],
    order: [['S', 'Webhook handler trusts any caller', 'Verify HMAC signature + timestamp on webhooks', 3], ['T', 'Price or amount taken from client body', 'Recompute totals server-side; re-fetch payment', 3], ['R', 'Order state changes untraceable', 'Event log of state transitions with actor', 1], ['I', 'Another user\'s order by changing the id (BOLA)', 'Object-level authz: owner or tenant check per id', 3], ['D', 'Huge cart or slow query exhausts pool', 'Input limits, timeouts, bulkheads', 2], ['E', 'Service runs with DB owner rights', 'Least-privilege DB role; no DDL at runtime', 2]],
    db: [['T', 'SQL injection modifies orders', 'Parameterised queries / ORM only', 3], ['R', 'Audit table can be edited', 'Append-only audit, separate writer role', 1], ['I', 'Backup or snapshot readable', 'Encrypt at rest with KMS; tokenise card data', 3], ['D', 'Disk fills or connections exhausted', 'Quotas, connection pool limits, alerts', 2]],
    pay: [['S', 'Fake provider endpoint (DNS or config tampering)', 'Pinned provider host, TLS verification, config review', 2], ['R', 'Provider disputes a charge result', 'Store raw signed provider responses', 1]],
    f1: [['T', 'Request modified in transit', 'TLS 1.2+ with HSTS', 2], ['I', 'Session cookie sniffed', 'Secure, HttpOnly, SameSite cookies', 2], ['D', 'TLS handshake flood', 'CDN / edge DDoS protection', 2]],
    f2: [['T', 'Admin action replayed', 'CSRF tokens, short sessions', 2], ['I', 'Admin API exposed on internet', 'Reach only via corp network / ZTNA', 3], ['D', 'Admin API rate-limit bypass', 'Separate, strict limits for admin', 1]],
    f3: [['T', 'Internal hop modified', 'mTLS between gateway and services', 2], ['I', 'Token logged in plain text', 'Redact Authorization header in logs', 2], ['D', 'Retry storm from gateway', 'Retry budgets, circuit breaker', 1]],
    f4: [['T', 'Unencrypted DB connection altered', 'TLS to DB, verify server cert', 1], ['I', 'Query results cached in shared logs', 'No row data in logs', 1], ['D', 'N+1 queries saturate DB', 'Query review, pool limits', 1]],
    f5: [['T', 'Charge amount modified', 'Signed API requests, idempotency keys', 3], ['I', 'Raw card number sent', 'Send only provider tokens (PCI scope)', 3], ['D', 'Provider slow, threads blocked', 'Timeouts, async checkout, breaker', 2]],
    f6: [['T', 'Webhook body altered', 'HMAC over body; re-fetch status', 3], ['I', 'Webhook URL leaks order ids', 'Opaque ids, no PII in URL', 1], ['D', 'Webhook replay flood', 'Timestamp window + dedupe by event id', 2]]
  };
  const done = {};
  let sel = 'order', showCross = false;

  const ctrls = el('div', { class: 'w-controls' });
  const crossBtn = el('button', { class: 'btn', text: '⚡ Highlight crossings', onclick: () => { showCross = !showCross; paint(); } });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset', onclick: () => { Object.keys(done).forEach((k) => delete done[k]); paint(); } });
  const quickBtn = el('button', { class: 'btn primary', text: '✓ Fix all severity 3', onclick: () => { Object.keys(T).forEach((id) => T[id].forEach((t, i) => { if (t[3] === 3) done[id + i] = true; })); paint(); } });
  ctrls.append(crossBtn, quickBtn, resetBtn);
  const stage = el('div', { class: 'w-stage' });
  const stats = el('div', { class: 'w-stats' });
  const panel = el('div', { class: 'w-log', 'aria-live': 'polite', style: { maxHeight: 'none', fontFamily: 'var(--sans)', fontSize: '14px', lineHeight: '1.45' } });
  root.append(ctrls, stage, stats, panel);

  function layout(narrow) {
    if (narrow) return {
      W: 360, H: 470, bw: 118, bh: 50, F: 14,
      zones: [['internet', 8, 8, 170, 86], ['corp', 182, 8, 170, 86], ['dmz', 70, 128, 220, 80], ['internal', 8, 244, 210, 218], ['psp', 230, 300, 122, 120]],
      pos: { browser: [93, 58], admin: [267, 58], gw: [180, 172], order: [113, 296], db: [113, 412], pay: [291, 368] }
    };
    return {
      W: 660, H: 330, bw: 120, bh: 50, F: 14,
      zones: [['internet', 8, 20, 150, 120], ['corp', 8, 190, 150, 120], ['dmz', 190, 100, 140, 130], ['internal', 362, 20, 150, 290], ['psp', 530, 20, 122, 150]],
      pos: { browser: [83, 85], admin: [83, 255], gw: [260, 170], order: [437, 95], db: [437, 255], pay: [591, 100] }
    };
  }
  const isDone = (id, i) => !!done[id + i];
  const weight = (id) => (byId[id].cross ? 1.5 : 1);
  function openOf(id) { return T[id].filter((t, i) => !isDone(id, i)); }
  function tone(id) { const o = openOf(id); return !o.length ? 'var(--ok)' : o.some((t) => t[3] === 3) ? 'var(--err)' : 'var(--warn)'; }

  function draw() {
    const L = layout(ctx.narrow);
    const S = svg('svg', { viewBox: `0 0 ${L.W} ${L.H}`, role: 'img', 'aria-label': 'Data-flow diagram of a web shop with trust boundaries' });
    S.append(svg('defs', {}, svg('marker', { id: 'tmArr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--text-3)' }))));
    L.zones.forEach(([z, x, y, w, h]) => {
      S.append(svg('rect', { x, y, width: w, height: h, rx: 10, fill: 'none', stroke: 'var(--err)', 'stroke-dasharray': '6 5', 'stroke-width': 1.5, opacity: 0.75 }));
      S.append(svg('text', { x: x + 8, y: y + 16, fill: 'var(--text-3)', style: `font:600 13px var(--sans)`, text: ZONES[z] }));
    });
    const edge = (p, q, bw, bh) => { // clip line to box border
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const s = Math.min(Math.abs((bw / 2 + 4) / (dx || 1e-9)), Math.abs((bh / 2 + 4) / (dy || 1e-9)));
      return [p[0] + dx * s, p[1] + dy * s];
    };
    FLOWS.forEach((f) => {
      const p = L.pos[f.a], q = L.pos[f.b];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]), nx = -(q[1] - p[1]) / len * (f.off || 0), ny = (q[0] - p[0]) / len * (f.off || 0);
      const a = edge([p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], L.bw, L.bh), b = edge([q[0] + nx, q[1] + ny], [p[0] + nx, p[1] + ny], L.bw, L.bh);
      const hot = showCross && f.cross, on = sel === f.id;
      const col = on ? 'var(--accent)' : hot ? tone(f.id) : 'var(--text-3)';
      const g = svg('g', { style: 'cursor:pointer', onclick: () => { sel = f.id; paint(); } });
      g.append(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'transparent', 'stroke-width': 16 }));
      g.append(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: col, 'stroke-width': on || hot ? 3.5 : 2, 'marker-end': 'url(#tmArr)' }));
      const mx = (a[0] + b[0]) / 2 + nx * 1.8, my = (a[1] + b[1]) / 2 + ny * 1.8 + 5;
      g.append(svg('text', { x: mx, y: my - 4, 'text-anchor': 'middle', fill: on ? 'var(--accent)' : 'var(--text)', style: `font:600 13px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:4px`, text: f.l }));
      S.append(g);
    });
    NODES.forEach((n) => {
      const [x, y] = L.pos[n.id], on = sel === n.id;
      const g = svg('g', { style: 'cursor:pointer', onclick: () => { sel = n.id; paint(); } });
      const shape = n.t === 'store'
        ? svg('path', { d: `M${x - L.bw / 2},${y - L.bh / 2} h${L.bw} M${x - L.bw / 2},${y + L.bh / 2} h${L.bw}`, stroke: tone(n.id), 'stroke-width': on ? 4 : 2.5 })
        : svg('rect', { x: x - L.bw / 2, y: y - L.bh / 2, width: L.bw, height: L.bh, rx: n.t === 'process' ? 22 : 3, fill: 'var(--surface-2)', stroke: on ? 'var(--accent)' : tone(n.id), 'stroke-width': on ? 3.5 : 2 });
      if (n.t === 'store') g.append(svg('rect', { x: x - L.bw / 2, y: y - L.bh / 2, width: L.bw, height: L.bh, fill: 'var(--surface-2)', stroke: on ? 'var(--accent)' : 'none', 'stroke-width': 2 }));
      g.append(shape);
      const o = openOf(n.id).length;
      g.append(svg('text', { x, y: y - 3, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${L.F}px var(--sans)`, text: n.l }));
      g.append(svg('text', { x, y: y + 15, 'text-anchor': 'middle', fill: tone(n.id), style: 'font:600 13px var(--sans)', text: o ? o + ' open' : 'all mitigated' }));
      S.append(g);
    });
    stage.innerHTML = ''; stage.append(S);
  }

  function paint() {
    crossBtn.classList.toggle('primary', showCross);
    draw();
    let total = 0, closed = 0, risk = 0, max = 0, crossOpen = 0;
    const per = { S: 0, T: 0, R: 0, I: 0, D: 0, E: 0 };
    Object.keys(T).forEach((id) => T[id].forEach((t, i) => {
      const r = t[3] * weight(id); total++; max += r;
      if (isDone(id, i)) closed++; else { risk += r; per[t[0]]++; if (byId[id].cross) crossOpen++; }
    }));
    stats.innerHTML = '';
    [['threats', total], ['mitigated', closed + ' (' + Math.round(closed / total * 100) + '%)'], ['residual risk', risk.toFixed(1) + ' / ' + max.toFixed(1)], ['open on crossings', crossOpen],
      ['open by STRIDE', Object.entries(per).map(([k, v]) => k + v).join(' ')]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    const e = byId[sel];
    const kind = e.t === 'flow' ? 'data flow ' + byId[e.a].l + ' → ' + byId[e.b].l : { entity: 'external entity', process: 'process', store: 'data store' }[e.t];
    panel.innerHTML = `<b>${e.l}</b> · ${kind}${e.t === 'flow' ? (e.cross ? ' · <b style="color:var(--err)">crosses a trust boundary (×1.5)</b>' : ' · inside one boundary') : ' · zone: ' + ZONES[e.z]}<br>` +
      `STRIDE per element for a ${e.t === 'entity' ? 'external entity' : e.t}: <b>${APPLIES[e.t].split('').join(' ')}</b> (${APPLIES[e.t].split('').map((c) => PROP[c]).join(', ')}).`;
    const list = el('div', { style: { marginTop: '8px', display: 'grid', gap: '6px' } });
    T[sel].forEach((t, i) => {
      const cb = el('input', { type: 'checkbox' }); cb.checked = isDone(sel, i);
      cb.addEventListener('change', () => { done[sel + i] = cb.checked; paint(); });
      const sev = ['', 'low', 'med', 'high'][t[3]], col = ['', 'var(--text-3)', 'var(--warn)', 'var(--err)'][t[3]];
      list.append(el('label', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer', opacity: cb.checked ? 0.6 : 1 } }, cb,
        el('span', { html: `<b style="color:var(--accent)">${t[0]}</b> <span style="color:${col}">[${sev}]</span> ${t[1]}<br><span style="color:var(--text-3)">Mitigation:</span> ${cb.checked ? '<s>' + t[2] + '</s> ✓' : t[2]}` })));
    });
    panel.append(list);
  }
  ctx.onResize(() => paint());
  paint();
});
