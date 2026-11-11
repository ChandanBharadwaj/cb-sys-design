/* One feature change ("add loyalty points to checkout") rippling through five architectural styles.
   Each style is a real component graph: components grouped into deploy units, owned by teams, linked by
   in-process calls, network calls, async events or DB access. Counts are computed from the graph. */
SD.widget('architectural-styles', function (root, ctx) {
  const { el, svg } = ctx;
  const TEAM = {
    FE: ['Frontend', 'var(--k-client)'], BE: ['Backend', 'var(--k-service)'], DATA: ['DBA / data', 'var(--k-store)'],
    CHK: ['Checkout', 'var(--k-service)'], LOY: ['Loyalty', 'var(--k-compute)'], ORD: ['Orders & pay', 'var(--k-store)'],
    WEB: ['Web / BFF', 'var(--k-client)'], PLAT: ['Platform', 'var(--k-policy)']
  };
  // comp: [id, label, team, flag] flag: 'n' new, 'c' changed, '' untouched. edge: [from, to, type, newHopOnCheckoutPath]
  const STYLES = {
    layered: {
      name: 'Layered', note: 'Teams own technical layers, so one feature crosses all of them. The DB is always shared here.',
      own: {
        units: [
          ['shop.war', 'deploy', [['page', 'Checkout page', 'FE', 'c'], ['ctl', 'Controllers', 'BE', 'c'], ['csv', 'CheckoutService', 'BE', 'c'], ['lsv', 'LoyaltyService', 'BE', 'n'], ['psv', 'PaymentService', 'BE', ''], ['repo', 'OrderRepository', 'DATA', 'c']]],
          ['Shared DB', 'db', [['otab', 'orders table', 'DATA', ''], ['pcol', 'points column', 'DATA', 'n']]]
        ],
        path: [['page', 'ctl', 'in'], ['ctl', 'csv', 'in'], ['csv', 'lsv', 'in'], ['lsv', 'repo', 'in'], ['repo', 'pcol', 'db']],
        order: 'one release: migration + shop.war'
      }
    },
    hexmono: {
      name: 'Hexagonal modular monolith', note: 'Change stays inside the loyalty module plus one call from checkout. One artefact ships.',
      own: {
        units: [
          ['shop.jar', 'deploy', [['cweb', 'checkout web', 'CHK', 'c'], ['ccore', 'checkout core', 'CHK', 'c'], ['lapi', 'loyalty API port', 'LOY', 'n'], ['lcore', 'loyalty core', 'LOY', 'n'], ['ljdbc', 'JDBC adapter', 'LOY', 'n'], ['ordm', 'orders module', 'ORD', '']]],
          ['Postgres', 'db', [['lsch', 'loyalty schema', 'LOY', 'n'], ['osch', 'orders schema', 'ORD', '']]]
        ],
        path: [['cweb', 'ccore', 'in'], ['ccore', 'lapi', 'in'], ['lapi', 'lcore', 'in'], ['lcore', 'ljdbc', 'in'], ['ljdbc', 'lsch', 'db']],
        order: 'one release: shop.jar (+ loyalty migration)'
      },
      shared: {
        units: [
          ['shop.jar', 'deploy', [['cweb', 'checkout web', 'CHK', 'c'], ['ccore', 'checkout core', 'CHK', 'c'], ['lapi', 'loyalty API port', 'LOY', 'n'], ['lcore', 'loyalty core', 'LOY', 'n'], ['ljdbc', 'JDBC adapter', 'LOY', 'n'], ['ordm', 'orders module', 'ORD', 'c']]],
          ['Postgres', 'db', [['osch', 'orders table +col', 'ORD', 'c']]]
        ],
        path: [['cweb', 'ccore', 'in'], ['ccore', 'lapi', 'in'], ['lapi', 'lcore', 'in'], ['lcore', 'ljdbc', 'in'], ['ljdbc', 'osch', 'db'], ['osch', 'ordm', 'db']],
        order: 'one release, but orders team must approve a change to its table'
      }
    },
    micro: {
      name: 'Microservices', note: 'Three services change and must ship callee-first. Checkout gains a network hop.',
      own: {
        units: [
          ['web-bff', 'deploy', [['bff', 'BFF: show points', 'WEB', 'c']]],
          ['checkout-svc', 'deploy', [['capi', 'checkout API', 'CHK', ''], ['clog', 'checkout logic', 'CHK', 'c'], ['ccli', 'loyalty client', 'CHK', 'n']]],
          ['loyalty-svc', 'deploy', [['lapi', 'POST /points', 'LOY', 'n'], ['llog', 'points logic', 'LOY', 'n'], ['ldb', 'loyalty DB', 'LOY', 'n']]],
          ['orders-svc', 'deploy', [['olog', 'orders logic', 'ORD', ''], ['odb', 'orders DB', 'ORD', '']]],
          ['payments-svc', 'deploy', [['plog', 'payments', 'ORD', '']]]
        ],
        path: [['bff', 'capi', 'net'], ['capi', 'clog', 'in'], ['clog', 'ccli', 'in'], ['ccli', 'lapi', 'net', 1], ['lapi', 'llog', 'in'], ['llog', 'ldb', 'db'], ['bff', 'lapi', 'net']],
        order: 'loyalty-svc → checkout-svc → web-bff (callee first)'
      },
      shared: {
        units: [
          ['web-bff', 'deploy', [['bff', 'BFF: show points', 'WEB', 'c']]],
          ['checkout-svc', 'deploy', [['capi', 'checkout API', 'CHK', ''], ['clog', 'checkout logic', 'CHK', 'c'], ['ccli', 'loyalty client', 'CHK', 'n']]],
          ['loyalty-svc', 'deploy', [['lapi', 'POST /points', 'LOY', 'n'], ['llog', 'points logic', 'LOY', 'n']]],
          ['Shared DB', 'db', [['sdb', 'orders table +col', 'ORD', 'c']]],
          ['orders-svc', 'deploy', [['olog', 'orders ORM map', 'ORD', 'c']]],
          ['payments-svc', 'deploy', [['plog', 'payments ORM map', 'ORD', 'c']]]
        ],
        path: [['bff', 'capi', 'net'], ['capi', 'clog', 'in'], ['clog', 'ccli', 'in'], ['ccli', 'lapi', 'net', 1], ['lapi', 'llog', 'in'], ['llog', 'sdb', 'db'], ['sdb', 'olog', 'db'], ['sdb', 'plog', 'db'], ['bff', 'lapi', 'net']],
        order: 'LOCKSTEP: migration + all services that map the table, together', lockstep: true
      }
    },
    faas: {
      name: 'Serverless', note: 'A new function, a new workflow step, a table and IAM. Each step is a billed invocation and state transition.',
      own: {
        units: [
          ['API Gateway', 'deploy', [['route', 'POST /checkout', 'CHK', '']]],
          ['Step Functions', 'deploy', [['wf', 'checkout workflow', 'CHK', 'c']]],
          ['checkout λ', 'deploy', [['cfn', 'reserve + pay', 'CHK', '']]],
          ['award-points λ', 'deploy', [['afn', 'award points', 'LOY', 'n']]],
          ['DynamoDB', 'db', [['ptab', 'points table', 'LOY', 'n']]],
          ['IaC stack', 'deploy', [['iam', 'IAM + wiring', 'PLAT', 'c']]]
        ],
        path: [['route', 'wf', 'net'], ['wf', 'cfn', 'net'], ['wf', 'afn', 'net', 1], ['afn', 'ptab', 'db'], ['iam', 'afn', 'in']],
        order: 'IaC stack: table + IAM → function → workflow'
      },
      shared: {
        units: [
          ['API Gateway', 'deploy', [['route', 'POST /checkout', 'CHK', '']]],
          ['Step Functions', 'deploy', [['wf', 'checkout workflow', 'CHK', 'c']]],
          ['checkout λ', 'deploy', [['cfn', 'reads new item shape', 'CHK', 'c']]],
          ['award-points λ', 'deploy', [['afn', 'award points', 'LOY', 'n']]],
          ['Shared table', 'db', [['stab', 'orders items +attr', 'ORD', 'c']]],
          ['IaC stack', 'deploy', [['iam', 'IAM + wiring', 'PLAT', 'c']]]
        ],
        path: [['route', 'wf', 'net'], ['wf', 'cfn', 'net'], ['wf', 'afn', 'net', 1], ['afn', 'stab', 'db'], ['stab', 'cfn', 'db'], ['iam', 'afn', 'in']],
        order: 'LOCKSTEP: table change + both functions + workflow', lockstep: true
      }
    },
    event: {
      name: 'Event-driven', note: 'Loyalty subscribes to an event that already exists. Checkout and orders do not change.',
      own: {
        units: [
          ['checkout-svc', 'deploy', [['clog', 'checkout', 'CHK', '']]],
          ['orders-svc', 'deploy', [['opub', 'OrderPlaced pub', 'ORD', ''], ['odb', 'orders DB', 'ORD', '']]],
          ['Kafka', 'bus', [['topic', 'orders.placed', 'PLAT', '']]],
          ['loyalty-svc', 'deploy', [['lcon', 'event consumer', 'LOY', 'n'], ['lapi', 'GET /points', 'LOY', 'n'], ['lst', 'points store', 'LOY', 'n']]],
          ['web-bff', 'deploy', [['bff', 'show points', 'WEB', 'c']]]
        ],
        path: [['clog', 'opub', 'net'], ['opub', 'topic', 'async'], ['topic', 'lcon', 'async'], ['lcon', 'lst', 'db'], ['bff', 'lapi', 'net'], ['lapi', 'lst', 'db']],
        order: 'loyalty-svc → web-bff; nobody else ships'
      },
      shared: {
        units: [
          ['checkout-svc', 'deploy', [['clog', 'checkout', 'CHK', '']]],
          ['orders-svc', 'deploy', [['opub', 'OrderPlaced pub', 'ORD', ''], ['oorm', 'orders ORM map', 'ORD', 'c']]],
          ['Kafka', 'bus', [['topic', 'orders.placed', 'PLAT', '']]],
          ['loyalty-svc', 'deploy', [['lcon', 'event consumer', 'LOY', 'n'], ['lapi', 'GET /points', 'LOY', 'n']]],
          ['Shared DB', 'db', [['sdb', 'orders table +col', 'ORD', 'c']]],
          ['web-bff', 'deploy', [['bff', 'show points', 'WEB', 'c']]]
        ],
        path: [['clog', 'opub', 'net'], ['opub', 'topic', 'async'], ['topic', 'lcon', 'async'], ['lcon', 'sdb', 'db'], ['sdb', 'oorm', 'db'], ['bff', 'lapi', 'net'], ['lapi', 'sdb', 'db']],
        order: 'LOCKSTEP: migration + orders-svc + loyalty-svc', lockstep: true
      }
    }
  };
  const ORDER = ['layered', 'hexmono', 'micro', 'faas', 'event'];
  const SHORT = { layered: 'Layered', hexmono: 'Modular mono', micro: 'Microservices', faas: 'Serverless', event: 'Event-driven' };

  function variant(k, shared) { const st = STYLES[k]; return (shared && st.shared) || st.own; }
  // the real counting: walk the graph
  function count(k, shared) {
    const v = variant(k, shared);
    const comps = [], unitOf = {};
    v.units.forEach((u) => u[2].forEach((c) => { comps.push(c); unitOf[c[0]] = u; }));
    const changed = comps.filter((c) => c[3]);
    const units = [...new Set(changed.map((c) => unitOf[c[0]]))];
    const deployUnits = units.filter((u) => u[1] !== 'db' && u[1] !== 'bus').length;
    const migrations = units.filter((u) => u[1] === 'db').length;
    const teams = [...new Set(changed.map((c) => c[2]))];
    const newCalls = v.path.filter((e) => e[2] === 'net' && (e[3] || changed.some((c) => c[0] === e[1] && c[3] === 'n'))).length;
    const hops = v.path.filter((e) => e[3]).length;
    return { changed: changed.length, deployUnits, migrations, teams, handoffs: Math.max(0, teams.length - 1), hops, newCalls, order: v.order, lockstep: !!v.lockstep };
  }

  let style = 'hexmono', shared = false, running = 0, narrow = ctx.narrow;
  const styleBtns = ORDER.map((k) => {
    const b = el('button', { class: 'btn', text: SHORT[k] });
    b.addEventListener('click', () => { style = k; draw(); });
    return b;
  });
  const shipBtn = el('button', { class: 'btn primary', text: '▶ Ship the change' });
  shipBtn.addEventListener('click', () => ship());
  const shareBtn = el('button', { class: 'btn', text: '⛁ Shared database: off' });
  shareBtn.addEventListener('click', () => { shared = !shared; draw(); });
  root.append(el('div', { class: 'w-controls' }, ...styleBtns), el('div', { class: 'w-controls' }, shipBtn, shareBtn));
  const stage = el('div', { class: 'w-stage' });
  const legend = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' } });
  const stats = el('div', { class: 'w-stats' });
  const table = el('div', { style: { overflowX: 'auto', marginTop: '10px' } });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stage, legend, stats, table, log);

  let pos = {}, lines = [], unitEls = {}, compEls = {};
  function draw() {
    running++;
    shipBtn.disabled = false;
    styleBtns.forEach((b, i) => b.classList.toggle('primary', ORDER[i] === style));
    shareBtn.textContent = '⛁ Shared database: ' + (shared ? 'on' : 'off');
    const v = variant(style, shared);
    const W = narrow ? 360 : 760, COLS = narrow ? 2 : 4, GAP = narrow ? 8 : 14;
    const UW = (W - GAP * (COLS + 1)) / COLS, CH = narrow ? 32 : 30, HD = narrow ? 26 : 26, FS = narrow ? 13.5 : 13, FH = narrow ? 13.5 : 13.5;
    const colH = new Array(COLS).fill(GAP);
    pos = {}; unitEls = {}; compEls = {}; lines = [];
    const gUnits = svg('g'), gLines = svg('g'), gComps = svg('g');
    v.units.forEach((u) => {
      const col = colH.indexOf(Math.min(...colH));
      const x = GAP + col * (UW + GAP), y = colH[col];
      const h = HD + u[2].length * (CH + 6) + 4;
      colH[col] += h + GAP;
      const dash = u[1] === 'db' ? '5 4' : u[1] === 'bus' ? '2 3' : '';
      const rect = svg('rect', { x, y, width: UW, height: h, rx: 10, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 1.5, 'stroke-dasharray': dash });
      const title = svg('text', { x: x + 10, y: y + 18, fill: 'var(--text-2)', style: `font:700 ${FH}px var(--sans)`, text: (u[1] === 'db' ? '⛁ ' : u[1] === 'bus' ? '⇶ ' : '▣ ') + u[0] });
      const tag = svg('text', { x: x + UW - 8, y: y + 18, 'text-anchor': 'end', fill: 'var(--ok)', style: `font:700 ${FH}px var(--sans)`, text: '' });
      gUnits.append(rect, title, tag);
      unitEls[u[0]] = { rect, tag, u };
      u[2].forEach((c, i) => {
        const cx = x + 8, cy = y + HD + i * (CH + 6), cw = UW - 16;
        pos[c[0]] = { x: cx + cw / 2, y: cy + CH / 2 };
        const box = svg('rect', { x: cx, y: cy, width: cw, height: CH, rx: 7, fill: 'var(--surface)', stroke: 'var(--border)', 'stroke-width': 1.2, style: 'transition:fill .3s,stroke .3s' });
        const stripe = svg('rect', { x: cx, y: cy, width: 6, height: CH, rx: 3, fill: TEAM[c[2]][1] });
        const t = svg('text', { x: cx + 13, y: cy + CH / 2 + FS * 0.36, fill: 'var(--text)', style: `font:600 ${FS}px var(--sans)`, text: c[1] });
        gComps.append(box, stripe, t);
        compEls[c[0]] = { box, t, c };
      });
    });
    const H = Math.max(...colH);
    v.path.forEach((e) => {
      const a = pos[e[0]], b = pos[e[1]];
      const col = e[2] === 'net' ? 'var(--accent)' : e[2] === 'async' ? 'var(--k-queue)' : e[2] === 'db' ? 'var(--k-store)' : 'var(--text-3)';
      const ln = svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: col, 'stroke-width': e[2] === 'net' ? 3 : 2, 'stroke-dasharray': e[2] === 'async' ? '7 5' : e[2] === 'db' ? '2 4' : '', 'stroke-linecap': 'round', opacity: 0.12 });
      gLines.append(ln); lines.push({ ln, e });
    });
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Components grouped by deploy unit for the ' + STYLES[style].name + ' style' });
    S.append(gUnits, gLines, gComps);
    stage.innerHTML = ''; stage.append(S);
    const teamsHere = [...new Set(v.units.flatMap((u) => u[2].map((c) => c[2])))];
    legend.innerHTML = 'Stripe = owning team: ' + teamsHere.map((t) => `<b style="color:${TEAM[t][1]}">▌</b>${TEAM[t][0]}`).join(' · ') +
      '<br>Lines: <b style="color:var(--accent)">━</b> network call · <b style="color:var(--k-queue)">╍</b> async event · <b style="color:var(--k-store)">┈</b> DB access · <b style="color:var(--text-3)">─</b> in-process call. Dashed box = database.';
    setStats(null);
    renderTable();
    log.innerHTML = '';
    say(`<b>${STYLES[style].name}</b>${shared && STYLES[style].shared ? ' + shared DB' : ''}: ${STYLES[style].note}` + (style === 'layered' && shared ? ' (Layered already shares one schema, so the toggle changes nothing here.)' : '') + ' Press ▶ to ship.');
    if (ctx.reduced) ship();
  }
  function setStats(r) {
    stats.innerHTML = '';
    const c = r || { changed: '?', deployUnits: '?', migrations: '', hops: '?', newCalls: '?', handoffs: '?', order: 'press ▶' };
    const items = {
      'components changed': c.changed,
      'deploy units': c.deployUnits + (r && c.migrations ? ' + ' + c.migrations + ' migration' : ''),
      'new hops on checkout path': c.hops,
      'new network calls': c.newCalls,
      'team handoffs': c.handoffs,
      'release': c.order
    };
    Object.entries(items).forEach(([k, val]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b${r && r.lockstep && k === 'release' ? ' style="color:var(--err)"' : ''}>${val}</b>` })));
  }
  function renderTable() {
    const TINY = { layered: 'Layered', hexmono: 'Mod. mono', micro: 'Micro', faas: 'FaaS', event: 'Events' };
    const rows = ORDER.map((k) => { const r = count(k, shared); return `<tr${k === style ? ' style="background:var(--surface-2);font-weight:700"' : ''}><td>${narrow ? TINY[k] : SHORT[k]}</td><td>${r.changed}</td><td>${r.deployUnits}${r.lockstep ? ' ⚠' : ''}</td><td>${r.hops}</td><td>${r.handoffs}</td></tr>`; }).join('');
    table.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left"><thead><tr style="color:var(--text-3)"><th>${narrow ? 'Style' : 'Same change in…'}</th><th>Changed</th><th>Deploys</th><th>+Hops</th><th>${narrow ? 'Hand-offs' : 'Handoffs'}</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="muted" style="margin:4px 0 0;font-size:12.5px">Shared database is <b>${shared ? 'on' : 'off'}</b>. ⚠ = services must deploy in lockstep.</p>`;
    table.querySelectorAll('td,th').forEach((c) => { c.style.padding = narrow ? '4px 3px' : '4px 6px'; c.style.borderBottom = '1px solid var(--border)'; });
  }
  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));
  const KIND = { in: 'in-process call', net: 'network call', async: 'async event', db: 'DB access' };

  async function ship() {
    const my = ++running;
    shipBtn.disabled = true;
    const v = variant(style, shared);
    lines.forEach((l) => l.ln.setAttribute('opacity', 0.12));
    Object.values(compEls).forEach((x) => { x.box.style.fill = 'var(--surface)'; x.box.style.stroke = 'var(--border)'; });
    Object.values(unitEls).forEach((x) => { x.tag.textContent = ''; x.rect.setAttribute('stroke', 'var(--border)'); });
    const mark = (id) => {
      const x = compEls[id]; const f = x.c[3];
      x.box.style.fill = f === 'n' ? 'color-mix(in srgb, var(--ok) 28%, var(--surface))' : f === 'c' ? 'color-mix(in srgb, var(--warn) 30%, var(--surface))' : 'var(--surface)';
      x.box.style.stroke = f ? (f === 'n' ? 'var(--ok)' : 'var(--warn)') : 'var(--text-3)';
    };
    for (const { ln, e } of lines) {
      if (my !== running) return;
      ln.setAttribute('opacity', 1);
      mark(e[0]); mark(e[1]);
      const A = compEls[e[0]].c, B = compEls[e[1]].c;
      say(`${A[1]} → ${B[1]}: ${KIND[e[2]]}${e[3] ? ' <b>(+1 hop on checkout path)</b>' : ''}${A[2] !== B[2] ? ' · crosses team ' + TEAM[A[2]][0] + ' → ' + TEAM[B[2]][0] : ''}`);
      await sleep(650);
    }
    if (my !== running) return;
    // every changed component, even off the animated path, gets marked
    Object.keys(compEls).forEach((id) => { if (compEls[id].c[3]) mark(id); });
    let n = 0;
    for (const x of Object.values(unitEls)) {
      if (!x.u[2].some((c) => c[3])) continue;
      n++;
      x.rect.setAttribute('stroke', v.lockstep ? 'var(--err)' : 'var(--ok)');
      x.tag.setAttribute('fill', v.lockstep ? 'var(--err)' : 'var(--ok)');
      x.tag.textContent = x.u[1] === 'db' ? 'migrate' : 'ship ' + n;
      await sleep(300);
      if (my !== running) return;
    }
    const r = count(style, shared);
    setStats(r);
    say(`<b>Result:</b> ${r.changed} components changed, ${r.deployUnits} deploy unit${r.deployUnits === 1 ? '' : 's'}, ${r.hops} new hop${r.hops === 1 ? '' : 's'} on the checkout path, ${r.handoffs} team handoff${r.handoffs === 1 ? '' : 's'} (${r.teams.map((t) => TEAM[t][0]).join(', ')}).`);
    if (r.lockstep) say('⚠ <b>Distributed monolith:</b> a schema change on a shared table forces services owned by other teams to redeploy together.');
    shipBtn.disabled = false;
  }
  draw();
  ctx.onResize((nw) => { narrow = nw; draw(); });
});
