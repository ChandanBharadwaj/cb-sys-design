/* C4 zoom: one sample system (an online bookstore) at Level 1 (context), Level 2 (containers) and Level 3 (components of the API).
   Tap a box with ⊕ to zoom in. "Bad diagram" swaps in a typical whiteboard version; the linter runs real checks
   (title, legend, element types, technology, labelled arrows, protocols on inter-container arrows, one abstraction level). */
SD.widget('documenting-architecture', function (root, ctx) {
  const { el, svg } = ctx;
  const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, var(--surface))`;
  const TYPE = { person: 'Person', system: 'Software System', external: 'External System', container: 'Container', store: 'Container: DB', component: 'Component', class: 'Class', infra: 'Deployment node' };
  const LEVEL = { person: 'system', system: 'system', external: 'system', container: 'container', store: 'container', component: 'component', class: 'code', infra: 'deployment' };
  const COLOR = { person: 'var(--accent)', system: 'var(--accent)', external: 'var(--text-3)', container: 'var(--ok)', store: 'var(--ok)', component: 'var(--warn)', class: 'var(--err)', infra: 'var(--err)' };
  // e(id, name, kind, tech, desc, wide[col,row], narrow[col,row], drill?)
  const e = (id, name, kind, tech, desc, w, n, drill) => ({ id, name, kind, tech, desc, w, n, drill });
  const VIEWS = {
    context: {
      level: 'L1', name: 'System context', title: '[System Context] Online bookstore', allowed: ['system'],
      els: [
        e('cust', 'Customer', 'person', '', 'Browses and buys books.', [0, 0], [0, 0]),
        e('staff', 'Back-office staff', 'person', '', 'Manages the catalogue and refunds.', [2, 0], [1, 0]),
        e('sys', 'Bookstore', 'system', '', 'Lets customers find, buy and track books.', [1, 1], [1, 1], 'container'),
        e('pay', 'Payment provider', 'external', '', 'Card payments (third party).', [0, 2], [0, 1]),
        e('mail', 'Email service', 'external', '', 'Sends transactional email.', [1, 2], [0, 2]),
        e('wh', 'Warehouse system', 'external', '', 'Picks and ships parcels.', [2, 2], [1, 2])
      ],
      rels: [['cust', 'sys', 'Browses, buys books [HTTPS]'], ['staff', 'sys', 'Manages catalogue [HTTPS]'], ['sys', 'pay', 'Takes payments [HTTPS/JSON]'], ['sys', 'mail', 'Sends order emails [SMTP]'], ['sys', 'wh', 'Sends pick lists [AMQP]']],
      bad: { noTitle: true, rename: { sys: { name: 'Backend', kind: 'nokind' } }, drop: [0, 2, 4], vague: [3], extra: [e('x', 'OrderRepoImpl', 'class', 'Java', 'A class: code level detail on a context diagram.', [2, 1], [0, 3]), ['sys', 'x', '']] }
    },
    container: {
      level: 'L2', name: 'Containers', title: '[Container] Bookstore', allowed: ['system', 'container'],
      els: [
        e('cust', 'Customer', 'person', '', 'Browses and buys books.', [0, 0], [0, 0]),
        e('spa', 'Web app', 'container', 'React', 'Single-page app served from a CDN.', [1, 0], [1, 0]),
        e('api', 'API application', 'container', 'Spring Boot', 'JSON API: catalogue, cart, checkout.', [1, 1], [1, 1], 'component'),
        e('pay', 'Payment provider', 'external', '', 'Card payments (third party).', [2, 1], [0, 1]),
        e('db', 'Orders DB', 'store', 'PostgreSQL', 'Orders, customers, stock.', [0, 2], [0, 2]),
        e('search', 'Search index', 'store', 'OpenSearch', 'Full-text book search.', [1, 2], [1, 2]),
        e('bus', 'Event bus', 'container', 'RabbitMQ', 'OrderPlaced events to warehouse and email.', [2, 2], [0, 3])
      ],
      rels: [['cust', 'spa', 'Uses [HTTPS]'], ['spa', 'api', 'Calls API [JSON/HTTPS]'], ['api', 'pay', 'Charges card [HTTPS]'], ['api', 'db', 'Reads, writes [JDBC]'], ['api', 'search', 'Queries [HTTPS]'], ['api', 'bus', 'Publishes OrderPlaced [AMQP]']],
      bad: { noTitle: true, rename: { api: { name: 'Backend', tech: '' }, db: { tech: '' } }, drop: [1, 3], vague: [4, 5], extra: [e('x', 'k8s node pool', 'infra', 'EKS', 'Deployment detail on a container diagram.', [0, 1], [1, 3]), ['search', 'x', '']] }
    },
    component: {
      level: 'L3', name: 'Components: API', title: '[Component] Bookstore - API application', allowed: ['system', 'container', 'component'],
      els: [
        e('spa', 'Web app', 'container', 'React', 'Calls the API.', [0, 0], [0, 0]),
        e('octl', 'Order controller', 'component', 'Spring MVC', 'REST endpoints for orders.', [1, 0], [1, 0]),
        e('osvc', 'Checkout service', 'component', 'Spring bean', 'Validates cart, charges, saves, publishes.', [1, 1], [1, 1]),
        e('pub', 'Event publisher', 'component', 'Spring AMQP', 'Publishes domain events after commit.', [2, 1], [0, 1]),
        e('repo', 'Order repository', 'component', 'Spring Data JPA', 'Persists orders.', [0, 2], [1, 2]),
        e('payad', 'Payment adapter', 'component', 'RestClient', 'Anti-corruption layer for the provider.', [1, 2], [0, 3]),
        e('bus', 'Event bus', 'container', 'RabbitMQ', 'Outside this container.', [2, 2], [0, 2]),
        e('db', 'Orders DB', 'store', 'PostgreSQL', 'Outside this container.', [0, 3], [1, 3]),
        e('pay', 'Payment provider', 'external', '', 'Third party.', [1, 3], [0, 4])
      ],
      rels: [['spa', 'octl', 'POST /orders [JSON/HTTPS]'], ['octl', 'osvc', 'Places order'], ['osvc', 'pub', 'Raises OrderPlaced'], ['osvc', 'repo', 'Saves order'], ['osvc', 'payad', 'Charges card'], ['pub', 'bus', 'Publishes [AMQP]'], ['repo', 'db', 'Reads, writes [JDBC]'], ['payad', 'pay', 'Authorises [HTTPS]']],
      bad: { noTitle: true, rename: { osvc: { name: 'OrderManager', kind: 'nokind' } }, drop: [1, 3, 6], vague: [5], extra: [e('x', 'OrderEntity.java', 'class', 'JPA', 'Code level (Level 4) detail mixed into a component view.', [2, 3], [1, 4]), ['bus', 'x', '']] }
    }
  };
  let view = 'context', bad = false, sel = null;

  // ---- controls
  const lvlBtns = {};
  const ctl = el('div', { class: 'w-controls' });
  Object.entries(VIEWS).forEach(([k, v]) => { const b = el('button', { class: 'btn', text: v.level + ' ' + v.name, onclick: () => go(k) }); lvlBtns[k] = b; ctl.append(b); });
  const badBtn = el('button', { class: 'btn', text: '⚠ Bad diagram + lint', onclick: () => { bad = !bad; say(bad ? 'Switched to the <b>whiteboard version</b>: same system, typical mistakes. The linter lists them below.' : 'Back to the <b>C4 version</b>: every rule passes.'); render(); } });
  ctl.append(badBtn);
  root.append(ctl);
  const titleEl = el('p', { style: { margin: '6px 0 4px', fontSize: '14px', fontWeight: '700' } });
  const S = svg('svg', { role: 'img', 'aria-label': 'C4 diagram of an online bookstore' });
  const stage = el('div', { class: 'w-stage', style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px', transition: ctx.reduced ? '' : 'transform .35s ease, opacity .35s ease' } }, S);
  const legend = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: '13px', margin: '8px 0 0', color: 'var(--text-2)' } });
  const relList = el('ol', { style: { fontSize: '13px', margin: '8px 0 0', paddingLeft: '22px', color: 'var(--text-2)' } });
  const lintBox = el('div', { style: { fontSize: '13px', margin: '8px 0 0' } });
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(titleEl, stage, legend, relList, lintBox, stats, log);
  [['Person', 'person'], ['Software system', 'system'], ['External system', 'external'], ['Container', 'container'], ['Database container', 'store'], ['Component', 'component']].forEach(([l, k]) => {
    legend.append(el('span', { html: `<span style="display:inline-block;width:14px;height:12px;vertical-align:-1px;margin-right:5px;border-radius:${k === 'store' ? '6px' : '3px'};background:${tint(COLOR[k], k === 'external' ? 15 : 30)};border:1.5px ${k === 'external' ? 'dashed' : 'solid'} ${COLOR[k]}"></span>${l}` }));
  });
  legend.append(el('span', { html: '→ arrow = one-way dependency, label = intent [protocol] · ⊕ = tap to zoom in' }));
  ctx.onResize(() => render());

  function effective() {
    const V = VIEWS[view];
    let els = V.els.map((x) => Object.assign({}, x)), rels = V.rels.map((r) => r.slice());
    if (bad) {
      const B = V.bad;
      els.forEach((x) => Object.assign(x, B.rename[x.id] || {}));
      B.drop.forEach((i) => { rels[i][2] = ''; });
      B.vague.forEach((i) => { rels[i][2] = 'uses'; });
      els.push(Object.assign({}, B.extra[0])); rels.push(B.extra[1].slice());
    }
    return { V, els, rels, title: bad && V.bad.noTitle ? '' : V.title, legend: !bad };
  }

  // the linter: real rule checks over whatever diagram is shown
  function lint(D) {
    const byId = Object.fromEntries(D.els.map((x) => [x.id, x]));
    const out = [], badEl = new Set(), badRel = new Set();
    const rule = (name, fails) => out.push({ name, fails });
    rule('Diagram has a title stating type and scope', D.title ? [] : ['no title']);
    rule('Diagram has a key / legend', D.legend ? [] : ['no legend']);
    const untyped = D.els.filter((x) => !TYPE[x.kind]); untyped.forEach((x) => badEl.add(x.id));
    rule('Every element says what type it is', untyped.map((x) => '"' + x.name + '" has no type'));
    const notech = D.els.filter((x) => ['container', 'store', 'component'].includes(x.kind) && !x.tech); notech.forEach((x) => badEl.add(x.id));
    rule('Containers and components name their technology', notech.map((x) => '"' + x.name + '" has no technology'));
    const unl = []; D.rels.forEach((r, i) => { if (!r[2] || /^(uses|calls|talks to)$/i.test(r[2].trim())) { unl.push(byId[r[0]].name + ' → ' + byId[r[1]].name + (r[2] ? ' says only "' + r[2] + '"' : ' is unlabelled')); badRel.add(i); } });
    rule('Every arrow is labelled with its intent (not just "uses")', unl);
    const noproto = []; D.rels.forEach((r, i) => { const a = LEVEL[byId[r[0]].kind], b = LEVEL[byId[r[1]].kind]; if (a === 'container' && b === 'container' && r[2] && !/\[.+\]/.test(r[2])) { noproto.push(byId[r[0]].name + ' → ' + byId[r[1]].name); badRel.add(i); } });
    rule('Arrows between containers name the protocol', noproto);
    const mixed = D.els.filter((x) => TYPE[x.kind] && !D.V.allowed.includes(LEVEL[x.kind])); mixed.forEach((x) => badEl.add(x.id));
    rule('One abstraction level per diagram', mixed.map((x) => '"' + x.name + '" is ' + LEVEL[x.kind] + ' level, this is a ' + D.V.name.toLowerCase() + ' view'));
    return { out, badEl, badRel };
  }

  function render() {
    const N = ctx.narrow, D = effective(), L = lint(D);
    const W = N ? 360 : 600, BW = N ? 160 : 176, BH = 66, fs = N ? [15, 14] : [15, 14];
    const pos = (x) => { const p = N ? x.n : x.w; return { x: N ? 90 + p[0] * 180 : 100 + p[0] * 200, y: 45 + p[1] * (N ? 108 : 112) }; };
    const rows = Math.max(...D.els.map((x) => (N ? x.n : x.w)[1])) + 1;
    S.setAttribute('viewBox', `0 0 ${W} ${rows * (N ? 108 : 112) - 4}`);
    S.innerHTML = '';
    Object.entries(lvlBtns).forEach(([k, b]) => b.classList.toggle('primary', k === view));
    badBtn.classList.toggle('primary', bad);
    titleEl.textContent = D.title || '(untitled diagram)';
    titleEl.style.color = D.title ? 'var(--text)' : 'var(--err)';
    legend.style.display = D.legend ? 'flex' : 'none';
    const P = Object.fromEntries(D.els.map((x) => [x.id, pos(x)]));
    const clip = (f, t) => { const dx = f.x - t.x, dy = f.y - t.y; const k = Math.min(Math.abs((BW / 2 + 3) / (dx || 1e-6)), Math.abs((BH / 2 + 3) / (dy || 1e-6))); return { x: t.x + dx * k, y: t.y + dy * k }; };
    relList.innerHTML = '';
    D.rels.forEach((r, i) => {
      const f = P[r[0]], t = P[r[1]], a = clip(t, f), b = clip(f, t), isBad = bad && L.badRel.has(i);
      const col = isBad ? 'var(--err)' : 'var(--text-3)';
      const ang = Math.atan2(b.y - a.y, b.x - a.x), h = 9;
      S.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: col, 'stroke-width': 1.8, 'stroke-dasharray': isBad ? '6 4' : '' }));
      S.append(svg('polygon', { points: [[b.x, b.y], [b.x - h * Math.cos(ang - 0.42), b.y - h * Math.sin(ang - 0.42)], [b.x - h * Math.cos(ang + 0.42), b.y - h * Math.sin(ang + 0.42)]].map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' '), fill: col }));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const lbl = N ? String(i + 1) : (r[2] || '?');
      const lw = N ? 22 : Math.max(22, lbl.length * 7.2 + 10);
      S.append(svg('rect', { x: mx - lw / 2, y: my - 11, width: lw, height: 21, rx: N ? 10 : 5, fill: 'var(--surface)', stroke: isBad ? 'var(--err)' : 'var(--border)' }));
      S.append(svg('text', { x: mx, y: my + 4.5, 'text-anchor': 'middle', fill: isBad ? 'var(--err)' : 'var(--text-2)', style: `font:600 ${N ? 14 : 13}px var(--sans)`, text: lbl }));
      if (N) relList.append(el('li', { html: `${D.els.find((x) => x.id === r[0]).name} → ${D.els.find((x) => x.id === r[1]).name}: ${r[2] ? r[2] : '<b style="color:var(--err)">(no label)</b>'}` }));
    });
    relList.style.display = N ? '' : 'none';
    D.els.forEach((x) => {
      const p = P[x.id], c = COLOR[x.kind] || 'var(--text-3)', flag = bad && L.badEl.has(x.id), on = sel === x.id;
      const g = svg('g', { style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-label': x.name + (x.drill ? ': zoom in' : '') });
      g.append(svg('rect', { x: p.x - BW / 2, y: p.y - BH / 2, width: BW, height: BH, rx: x.kind === 'person' ? 22 : x.kind === 'store' ? 16 : 7, fill: tint(c, x.kind === 'external' ? 12 : x.drill ? 34 : 22), stroke: flag ? 'var(--err)' : c, 'stroke-width': flag || on ? 3 : 1.6, 'stroke-dasharray': x.kind === 'external' || flag ? '6 4' : '' }));
      g.append(svg('text', { x: p.x, y: p.y - 10, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${fs[0]}px var(--sans)`, text: x.name }));
      const ty = TYPE[x.kind];
      g.append(svg('text', { x: p.x, y: p.y + 8, 'text-anchor': 'middle', fill: ty ? 'var(--text-2)' : 'var(--err)', style: `font:500 ${fs[1]}px var(--sans)`, text: ty ? '[' + ty + ']' : '[type?]' }));
      if (['container', 'store', 'component', 'class', 'infra'].includes(x.kind)) g.append(svg('text', { x: p.x, y: p.y + 25, 'text-anchor': 'middle', fill: x.tech ? 'var(--text-2)' : 'var(--err)', style: `font:italic 500 ${fs[1]}px var(--sans)`, text: x.tech || 'tech?' }));
      if (x.drill) g.append(svg('text', { x: p.x + BW / 2 - 12, y: p.y - BH / 2 + 17, 'text-anchor': 'middle', fill: 'var(--accent)', style: 'font:700 16px var(--sans)', text: '⊕' }));
      if (flag) g.append(svg('text', { x: p.x - BW / 2 + 11, y: p.y - BH / 2 + 17, 'text-anchor': 'middle', fill: 'var(--err)', style: 'font:800 16px var(--sans)', text: '!' }));
      const act = () => { sel = x.id; if (x.drill && !bad) { say(`⊕ Zoom into <b>${x.name}</b>: the next level shows what is inside it.`); go(x.drill); return; } say(`<b>${x.name}</b> [${TYPE[x.kind] || 'no type'}${x.tech ? ': ' + x.tech : ''}]: ${x.desc}${x.drill && bad ? ' (turn off the bad diagram to zoom)' : ''}`); render(); };
      g.addEventListener('click', act);
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act(); } });
      S.append(g);
    });
    // lint report (HTML so it stays readable on phones)
    const fails = L.out.filter((r) => r.fails.length).length;
    lintBox.innerHTML = '';
    lintBox.append(el('div', { style: { fontWeight: '700', margin: '0 0 4px' }, text: `Diagram lint: ${L.out.length - fails}/${L.out.length} rules pass` }));
    L.out.forEach((r) => lintBox.append(el('div', { html: (r.fails.length ? '<b style="color:var(--err)">✗</b> ' : '<b style="color:var(--ok)">✓</b> ') + r.name + (r.fails.length ? ': <span class="muted">' + r.fails.slice(0, 3).join('; ') + (r.fails.length > 3 ? '…' : '') + '</span>' : '') })));
    stats.innerHTML = '';
    [['Level', D.V.level + ' ' + D.V.name], ['Elements', D.els.length], ['Arrows', D.rels.length], ['Labelled', D.rels.filter((r) => r[2] && r[2] !== 'uses').length + ' / ' + D.rels.length], ['Lint', fails ? fails + ' problem' + (fails > 1 ? 's' : '') + ' ❌' : 'clean ✅']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  function go(k) {
    if (k === view) { render(); return; }
    const deeper = Object.keys(VIEWS).indexOf(k) > Object.keys(VIEWS).indexOf(view);
    view = k; sel = null;
    if (!ctx.reduced) { stage.style.transform = `scale(${deeper ? 0.9 : 1.08})`; stage.style.opacity = '0.2'; requestAnimationFrame(() => requestAnimationFrame(() => { stage.style.transform = 'scale(1)'; stage.style.opacity = '1'; })); }
    render();
    say({ context: 'Level 1, <b>System context</b>: one box for the system, its users and neighbours. Readable by anyone, including executives.', container: 'Level 2, <b>Containers</b>: the separately deployable or runnable parts and the protocols between them. The most useful diagram for most teams.', component: 'Level 3, <b>Components</b> inside the API application. Draw it only for complex containers, or generate it from code. Level 4 (code) is best left to the IDE.' }[k]);
  }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  render();
  say('Tap <b>Bookstore ⊕</b> to zoom from context to containers, then <b>API application ⊕</b> for its components. Then try <b>Bad diagram + lint</b> on each level.');
});
