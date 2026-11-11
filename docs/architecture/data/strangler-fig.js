(function () {
  const money = (k) => (k >= 1000 ? '$' + (k / 1000).toFixed(k >= 10000 ? 0 : 1) + 'M' : '$' + Math.round(k) + 'k');
  // Zipf-like route popularity: weight(i) ∝ 1 / i^s, with s chosen so the busiest 20% of routes carry `top` of traffic.
  function routeShares(n, top) {
    n = Math.max(2, Math.round(n));
    const cut = Math.max(1, Math.round(n * 0.2));
    let best = null;
    for (let s = 0; s <= 3; s += 0.02) {
      const w = []; let tot = 0;
      for (let i = 1; i <= n; i++) { const x = 1 / Math.pow(i, s); w.push(x); tot += x; }
      let head = 0; for (let i = 0; i < cut; i++) head += w[i];
      const err = Math.abs(head / tot - top);
      if (!best || err < best.err) best = { err, w: w.map((x) => x / tot) };
    }
    return best.w;
  }
  function shareAfter(v, months) {
    const target = Math.round(v.caps * v.stop / 100);
    const moved = Math.min(target, Math.floor(v.rate * months / 3));
    const w = routeShares(v.caps, v.top / 100);
    let s = 0; for (let i = 0; i < moved; i++) s += w[i];
    return s;
  }

  SD.register({
    slug: 'strangler-fig',
    domain: 4,
    title: 'Evolutionary Architecture & Strangler Fig',
    examples: 'Fowler, Shopify, fitness functions',
    tagline: 'Replace a legacy system <b>one route at a time</b> behind a facade. Prove each slice with shadow traffic, shift users with a dial, and keep a one-click way back. No big-bang rewrite and no cut-over weekend.',
    tldr: {
      problem: 'The legacy system earns the money, nobody fully understands it, and it keeps changing. A <b>big-bang rewrite</b> must copy years of hidden behaviour, chase a moving target, and then bet the business on one cut-over day.',
      idea: 'Put a <b>facade</b> (proxy, gateway or event router) in front of the old system. Extract one capability, verify it with a <b>parallel run</b>, then move traffic to it route by route with <b>toggles</b>. Repeat until the old system is gone or small enough to keep.',
      insight: 'The goal is not "microservices". It is <b>reducing risk per step</b>: every step ships value, is observable and can be undone. <b>Fitness functions</b> keep the new architecture from decaying while you change it.',
      numbers: [
        { v: '2004', l: 'Fowler names the Strangler Application (bliki, revised 2024)' },
        { v: '3 phases', l: 'transform · coexist · eliminate (AWS Prescriptive Guidance)' },
        { v: '10×', l: 'merge speed-up GitHub verified with a Scientist parallel run (2023)' }
      ]
    },

    intro: {
      what: 'The <b>strangler fig</b> is a way to replace an old software system <b>gradually</b>. You put a routing layer in front of it, build new pieces next to it, and send more and more requests to the new pieces until the old system can be switched off. <b>Evolutionary architecture</b> is the wider idea behind it: design systems so they can keep changing safely, in small steps, with automated checks.',
      analogy: {
        icon: '🌳',
        title: 'A fig vine that slowly replaces its host tree',
        text: 'A strangler fig starts as a seed high in a host tree. Its roots grow down around the trunk, a little each year, until the fig stands on its own and the host is gone. The forest canopy never has a gap. Your users likewise keep getting answers while the old system is replaced underneath them. Unlike the tree, you choose the pace, and you can stop halfway on purpose.'
      },
      problem: 'A bank has a 15-year-old order system. Every change is slow and risky, so the team proposes a rewrite. Two years later the rewrite still lacks features the old system gained in the meantime, and the launch weekend fails on data nobody knew about. The question this page answers is <b>how do you replace a system that must keep running, without one giant risky switch?</b>',
      story: [
        {
          stage: 'naive',
          title: 'Rewrite it all, then switch over',
          text: 'The team freezes the old system and builds <b>v2 from scratch</b> in parallel. The plan is one big cut-over night when every user moves to v2. It feels clean: no messy coexistence and no legacy code in the new design.',
          scene: {
            nodes: [
              { id: 'u', label: 'Users', sub: 'all traffic', kind: 'client', at: [70, 0] },
              { id: 'old', label: 'Legacy app', sub: 'feature freeze', kind: 'service', at: [70, 110] },
              { id: 'new', label: 'Rewrite v2', sub: 'not live yet', kind: 'service', at: [350, 110] },
              { id: 'db', label: 'Legacy DB', sub: 'shared schema', kind: 'store', at: [210, 220] }
            ],
            edges: [{ from: 'u', to: 'old' }, { from: 'old', to: 'db' }, { from: 'new', to: 'db', dashed: true }],
            flow: ['u>old', 'old>db'],
            badges: { new: ['18 months', 'info'] }
          }
        },
        {
          stage: 'breaks',
          title: 'The target moves and cut-over day fails',
          text: 'The business cannot wait, so the old system keeps getting features. v2 chases it. On cut-over night, hidden rules and odd data break v2 for <b>every user at once</b>, and rolling back means undoing a whole night of writes.',
          scene: {
            nodes: [
              { id: 'u', label: 'Users', sub: '100% switched', kind: 'client', at: [70, 0] },
              { id: 'old', label: 'Legacy app', sub: 'still changing', kind: 'service', at: [70, 110] },
              { id: 'new', label: 'Rewrite v2', sub: 'missing rules', kind: 'service', at: [350, 110] },
              { id: 'db', label: 'Migrated DB', sub: 'odd old data', kind: 'store', at: [210, 220] }
            ],
            edges: [{ from: 'u', to: 'new' }, { from: 'new', to: 'db' }, { from: 'old', to: 'db', dashed: true }],
            flow: ['u>new', 'new>db', 'u>new'],
            err: ['new'], warn: ['db'],
            badges: { new: ['errors 💥', 'err'], db: ['no way back', 'warn'] }
          }
        },
        {
          stage: 'fix',
          title: 'Route one slice at a time through a facade',
          text: 'Put a <b>facade</b> in front. Move one capability (say <code>/orders</code>) to a new service, compare its answers with the old ones, then shift users with a <b>dial</b>, not a switch. Everything else still goes to the old system, and you can turn the dial back.',
          scene: {
            nodes: [
              { id: 'u', label: 'Users', sub: 'unchanged URLs', kind: 'client', at: [210, 0] },
              { id: 'f', label: 'Facade', sub: 'routes by path', kind: 'edge', at: [210, 110] },
              { id: 'old', label: 'Legacy app', sub: '/catalog, /cart…', kind: 'service', at: [70, 220] },
              { id: 'new', label: 'Orders svc', sub: '/orders · 25%', kind: 'service', at: [350, 220] }
            ],
            edges: [{ from: 'u', to: 'f' }, { from: 'f', to: 'old' }, { from: 'f', to: 'new' }],
            flow: ['u>f', ['f>old', 'f>new']],
            ok: ['new', 'f'],
            badges: { new: ['diff 0.01%', 'ok'] }
          }
        }
      ],
      usedBy: ['Shopify (storefront rewrite, Shop model)', 'GitHub (Scientist parallel runs)', 'AWS Migration Hub Refactor Spaces', 'Azure Architecture Center guidance', 'Thoughtworks legacy displacement work'],
      whenToUse: [
        'A <b>business-critical</b> legacy system must keep serving users while you replace it',
        'You can <b>intercept</b> its inputs (HTTP routes, messages, file drops or events) in one place',
        'The value is in changing parts of it sooner, not in a perfect rewrite later'
      ],
      whenNot: [
        'The system is small enough to rewrite and swap in a week, with an easy rollback',
        'You cannot intercept calls at all (a sealed batch box), so use data-level replacement or retire it',
        'The real problem is tangled code inside one deployable: try a <a href="architectural-styles.html">modular monolith</a> first'
      ],
      glossary: [
        { term: 'Facade (strangler proxy)', def: 'A routing layer in front of the old system that decides, per request, whether the old or the new code answers.' },
        { term: 'Event interception', def: 'Catching the messages or calls that flow into the old system so you can redirect or copy them to new code.' },
        { term: 'Branch by abstraction', def: 'Putting an interface in front of a component inside the codebase, building a new implementation behind it, then switching over on trunk.' },
        { term: 'Parallel run (shadow traffic)', def: 'Sending the same request to old and new code, returning the old answer, and logging any differences.' },
        { term: 'Anti-corruption layer', def: 'A translator that keeps the old system\'s data model from leaking into the new service\'s model.' },
        { term: 'Change data capture (CDC)', def: 'Streaming every committed row change from a database log to other systems, in order.' },
        { term: 'Fitness function', def: 'An automated check that measures how close the architecture is to a goal, such as "no service reads another\'s tables".' },
        { term: 'Transitional architecture', def: 'Temporary components (proxies, sync jobs, diff tools) that exist only during the migration and are removed after.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Incremental change</b>: every step is small, shippable and reversible',
        '<b>Intercept first</b>: one facade or event router owns where each request goes',
        '<b>Verify before you shift</b>: shadow or parallel-run new code against the old',
        '<b>Move ownership, not just code</b>: each extracted capability ends up owning its data',
        '<b>Guided by fitness functions</b>: automated checks for coupling, latency and contracts',
        '<b>Appropriate coupling</b>: split along business capabilities, not technical layers'
      ],
      nonFunctional: [
        'Zero planned downtime for any cut-over',
        'Rollback of a route in &lt; 1 minute (toggle flip)',
        'First extracted capability live within ~1 quarter (<em>rule of thumb</em>)',
        'Parallel-run mismatch rate below an agreed bar (e.g. &lt; 0.1%) before ramping',
        'Facade adds &lt; 5 ms p99 and is not a single point of failure',
        'Legacy footprint and cost shrink every quarter (tracked, visible)'
      ],
      outOfScope: [
        '<b>Big-bang rewrite</b> with feature freeze and one cut-over night',
        '<b>Distributed monolith</b>: new services that still share the old schema',
        '<b>Dual writes without reconciliation</b>, so two stores drift silently',
        '<b>Never-ending strangle</b>: transitional parts that become permanent',
        '<b>Lift-and-shift labelled as modernisation</b>: same coupling, new hosting'
      ]
    },

    calculator: {
      inputs: [
        { id: 'caps', label: 'Capabilities / routes to move', min: 10, max: 400, value: 60, log: true },
        { id: 'rate', label: 'Routes extracted per quarter', min: 1, max: 40, value: 6 },
        { id: 'top', label: 'Traffic carried by the busiest 20% of routes', min: 30, max: 95, value: 80, unit: '%' },
        { id: 'stop', label: 'Stop strangling at (routes moved)', min: 50, max: 100, value: 90, unit: '%' },
        { id: 'legacy', label: 'Legacy run cost per month', min: 20, max: 2000, value: 250, unit: '$k', log: true },
        { id: 'dual', label: 'Dual-run overhead while both systems live', min: 5, max: 100, value: 30, unit: '% of legacy' }
      ],
      outputs: [
        { label: 'Months to reach the stop line', fmt: 'raw', f: (v) => { const m = Math.ceil(Math.round(v.caps * v.stop / 100) / v.rate) * 3; return m + ' months (≈ ' + (m / 12).toFixed(1) + ' yr)'; } },
        { label: 'Dual-running cost over the migration', fmt: 'raw', f: (v) => { const m = Math.ceil(Math.round(v.caps * v.stop / 100) / v.rate) * 3; return money(m * v.legacy * v.dual / 100); } },
        { label: 'Traffic on the new system at 6 · 12 · 24 months', fmt: 'raw', f: (v) => [6, 12, 24].map((m) => Math.round(shareAfter(v, m) * 100) + '%').join(' · ') },
        { label: 'Largest single cut-over (share of all traffic)', fmt: 'pct', f: (v) => routeShares(v.caps, v.top / 100)[0] },
        { label: 'Legacy cost left after the stop line', fmt: 'raw', f: (v) => (v.stop >= 100 ? '$0 (retired)' : money(v.legacy * Math.max(0.15, 1 - v.stop / 100)) + ' / month') },
        { label: 'Cut-overs per month (each: shadow → canary → 100%)', fmt: 'raw', f: (v) => (v.rate / 3).toFixed(1) }
      ],
      note: 'Route popularity follows a Zipf-like curve fitted so the busiest 20% carry the share you set, and routes are assumed to move <b>busiest first after a pilot</b>; start with cold routes and the traffic curve lags. Costs, the 15% legacy floor and the rates are <em>estimates</em>. Compare the largest single cut-over with a big-bang rewrite, where it is <b>100%</b> on one night. Notice how a long tail of cold routes makes the last 10% expensive: that is the "when to stop" question.'
    },

    api: [
      { m: 'ADR', p: 'ADR-031: Strangle Orders out of the monolith', d: 'Context, the seam you will intercept, chosen data strategy (CDC then service-owned), verification bar, rollback plan, and the <b>exit criteria</b> for the transitional parts.' },
      { m: 'YAML', p: 'facade routes (gateway config)', d: 'Path predicates and <b>weights</b> per route, e.g. <code>/orders/**</code> 20% new / 80% legacy. Lives in Git; changes are reviewed and auditable.' },
      { m: 'POLICY', p: 'Cut-over runbook per route', d: 'Shadow ≥ 7 days with mismatch &lt; 0.1%, then canary 1% → 5% → 25% → 100% with automatic rollback on error-rate or latency SLO burn (<em>example thresholds</em>).' },
      { m: 'EVENT', p: 'orders.v1 (CDC topic)', d: 'Row changes from the legacy <code>orders</code> table, mapped through the anti-corruption layer into the new service\'s model. Keyed by order id so changes stay in order.' },
      { m: 'SLO', p: 'Fitness functions (CI + prod)', d: 'No new code reads legacy tables; facade p99 &lt; 5 ms; contract tests green; legacy LOC and route count trend down every sprint.' },
      { m: 'SQL', p: 'route_migration status table', d: 'One row per route (and tenant): state, % on new, owner, last mismatch rate. The single source of truth for "how far along are we?".' }
    ],
    dataModel: [
      { name: 'route_migration', store: 'Postgres (control plane)', fields: [['route', 'text', 'pk'], ['tenant_id', 'text', 'pk'], ['state', 'LEGACY|SHADOW|CANARY|NEW|ROLLED_BACK|RETIRED'], ['new_pct', 'smallint 0–100'], ['owner_team', 'text', 'idx'], ['version', 'int']], note: 'The facade reads this (cached) to decide routing. A version column makes concurrent ramp/rollback edits safe.' },
      { name: 'shadow_result', store: 'Postgres / ClickHouse', fields: [['id', 'bigint identity', 'pk'], ['route', 'text', 'idx'], ['matched', 'boolean'], ['diff', 'jsonb'], ['observed_at', 'timestamptz', 'idx']], note: 'Sampled parallel-run outcomes. Feed a mismatch-rate dashboard and the promotion gate.' },
      { name: 'id_map', store: 'Postgres (ACL)', fields: [['legacy_id', 'bigint', 'pk'], ['new_id', 'uuid', 'idx'], ['entity', 'text'], ['synced_lsn', 'pg_lsn']], note: 'The anti-corruption layer keeps the mapping between old and new identifiers, plus the last CDC position applied.' }
    ],

    architecture: {
      title: 'Strangler fig migration',
      nodes: [
        { id: 'users', label: 'Clients', sub: 'web · mobile · partners', kind: 'client', wide: [90, 220], tall: [210, 0], tip: 'Clients keep calling the same URLs. They never learn which system answered.' },
        { id: 'facade', label: 'Strangler facade', sub: 'gateway · routes by path', kind: 'edge', wide: [280, 220], tall: [210, 105], tip: 'An API gateway or reverse proxy (Spring Cloud Gateway, Envoy, API Management). It intercepts every request and decides old vs new per route, tenant or percentage.' },
        { id: 'flags', label: 'Toggle store', sub: 'route → % on new', kind: 'policy', wide: [280, 100], tall: [350, 0], tip: 'Feature toggles or a route_migration table. Changing a percentage is a config change, not a deploy, so rollback takes seconds.' },
        { id: 'fit', label: 'Fitness functions', sub: 'CI + prod checks', kind: 'policy', wide: [490, 0], tall: [70, 0], tip: 'Automated architecture checks: dependency rules, contract tests, latency budgets, "no reads of legacy tables". They keep each step from adding new coupling.' },
        { id: 'svc', label: 'Orders service', sub: 'new · extracted', kind: 'service', wide: [490, 110], tall: [70, 210], tip: 'The newly extracted capability. Built around the business domain (a bounded context), not around the old code structure.' },
        { id: 'sdb', label: 'Orders DB', sub: 'service-owned', kind: 'store', wide: [700, 110], tall: [70, 315], tip: 'The end state: the service owns its data. Until then it is filled from the legacy DB through CDC.' },
        { id: 'acl', label: 'Anti-corruption', sub: 'translate old ⇄ new', kind: 'compute', wide: [490, 220], tall: [210, 315], tip: 'Translates the legacy model (codes, flags, odd tables) into the new domain model, so legacy concepts do not leak into the new service.' },
        { id: 'mono', label: 'Legacy monolith', sub: 'everything else', kind: 'service', wide: [490, 330], tall: [350, 210], tip: 'Still serves every route not yet moved. It shrinks over time and may never fully disappear.' },
        { id: 'mdb', label: 'Legacy DB', sub: 'shared schema', kind: 'store', wide: [700, 330], tall: [350, 315], tip: 'The hardest part to strangle: many modules read and write the same tables.' },
        { id: 'diff', label: 'Diff / Scientist', sub: 'compare responses', kind: 'compute', wide: [700, 220], tall: [210, 210], tip: 'Parallel run: the same request goes to both systems, the legacy answer is returned, and differences are logged and counted (like GitHub\'s Scientist or Shopify\'s verifier service).' },
        { id: 'cdc', label: 'CDC stream', sub: 'Debezium → Kafka', kind: 'queue', wide: [900, 220], tall: [210, 420], tip: 'Reads the legacy DB\'s commit log and streams each row change, in order, to the new service\'s store.' }
      ],
      edges: [
        { from: 'users', to: 'facade' },
        { from: 'flags', to: 'facade', dashed: true },
        { from: 'facade', to: 'svc' },
        { from: 'facade', to: 'mono' },
        { from: 'svc', to: 'sdb' },
        { from: 'mono', to: 'mdb' },
        { from: 'svc', to: 'acl' },
        { from: 'acl', to: 'mono' },
        { from: 'svc', to: 'diff', dashed: true },
        { from: 'mono', to: 'diff', dashed: true },
        { from: 'mdb', to: 'cdc' },
        { from: 'cdc', to: 'sdb' },
        { from: 'fit', to: 'svc', dashed: true }
      ]
    },

    scenarios: [
      {
        id: 'extract', title: 'Extract the first route', tone: 'info',
        steps: [
          { text: 'Day 0: a facade goes in front of the monolith and passes <b>100%</b> of traffic straight through. Nothing changes for users, but you now own the seam.', flow: ['users>facade', 'facade>mono', 'mono>mdb'], badges: { facade: 'pass-through' } },
          { text: 'Pick the first capability: <b>valuable, well bounded, low risk</b>. Here, <code>/orders</code>. Build the Orders service around the business domain, not the old classes.', nodes: ['svc'], badges: { svc: 'v0.1' } },
          { text: 'The new service still needs customer data the monolith owns. It calls it through an <b>anti-corruption layer</b> that translates legacy codes into the new model.', flow: ['svc>acl', 'acl>mono'], badges: { acl: 'CUST_TYP=3 → Business' } },
          { text: 'Fitness functions run in CI on every change: no direct reads of legacy tables, contract tests pass, p99 within budget.', flow: ['fit>svc'], ok: ['svc'], badges: { fit: ['green', 'ok'] } },
          { text: 'The toggle store sets <code>/orders</code> to <b>1%</b>. The facade starts sending a sliver of real users to the new service. The other 99% and all other routes still hit the monolith.', flow: ['flags>facade', ['facade>svc', 'facade>mono']], badges: { flags: '/orders: 1%' }, tone: 'ok' }
        ]
      },
      {
        id: 'shadow', title: 'Parallel run: shadow & diff', tone: 'ok',
        steps: [
          { text: 'Before any user sees the new code, run it in <b>shadow</b>. The facade sends each <code>GET /orders/42</code> to the monolith <i>and</i> to the new service.', flow: ['users>facade', ['facade>mono', 'facade>svc']] },
          { text: 'Both responses go to the <b>diff</b> step. The user always gets the <b>legacy</b> answer, so a bug in the new code cannot hurt anyone yet.', flow: [['mono>diff', 'svc>diff']], badges: { diff: 'compare' } },
          { text: 'Mismatch: the legacy system rounds tax per line, the new one per order. <b>0.8%</b> of responses differ. This is the hidden rule a rewrite would have missed.', nodes: ['diff', 'svc'], warn: ['svc'], badges: { diff: ['0.8% differ', 'warn'] }, tone: 'warn' },
          { text: 'Normalise noise (timestamps, ordering, random ids), fix the real bug, redeploy. A week of shadow traffic later the mismatch rate is under the bar.', nodes: ['diff', 'svc'], ok: ['svc'], badges: { diff: ['0.004%', 'ok'] }, tone: 'ok' },
          { text: 'Only <b>reads</b> are shadowed by default. A shadowed <code>POST</code> would create a second order, so writes need a sandbox, an idempotency key or a dry-run mode.', nodes: ['svc', 'sdb'], badges: { svc: ['reads only', 'info'] } }
        ]
      },
      {
        id: 'data', title: 'Moving the data out', tone: 'warn',
        steps: [
          { text: 'At first the Orders service reads the <b>shared legacy schema</b>. That is fast to start, but every legacy column is now part of its contract: a distributed monolith.', flow: ['svc>acl', 'acl>mono', 'mono>mdb'], warn: ['mdb'], badges: { mdb: ['shared', 'warn'] }, tone: 'warn' },
          { text: 'Step two: <b>CDC</b>. Debezium reads the legacy DB\'s commit log and streams every orders row change, in commit order, into the service\'s own store. Legacy is still the only writer.', flow: ['mdb>cdc', 'cdc>sdb'], badges: { cdc: 'lag ~1 s' } },
          { text: 'Tempting shortcut: the service <b>dual-writes</b> to both DBs. Two writes are not atomic, so a crash between them leaves the stores different. Prefer one writer plus CDC or an outbox.', nodes: ['svc', 'sdb', 'mdb'], warn: ['sdb', 'mdb'], badges: { svc: ['dual write?', 'warn'] }, tone: 'warn' },
          { text: 'Cut-over of ownership: the new service becomes the writer, and a <b>reverse sync</b> keeps the legacy tables fed for the modules that still read them, until they are gone too.', flow: ['svc>sdb'], ok: ['sdb'], badges: { sdb: ['owner', 'ok'] }, tone: 'ok' },
          { text: 'Reconcile nightly: count and checksum rows on both sides. A mismatch blocks the next step instead of surfacing months later as a finance query.', nodes: ['sdb', 'mdb'], badges: { mdb: 'checksum ✓', sdb: 'checksum ✓' }, tone: 'ok' }
        ]
      },
      {
        id: 'rollback', title: 'Canary goes bad → rollback', tone: 'err',
        steps: [
          { text: '<code>/orders</code> is ramped to <b>25%</b>. A new release of the Orders service ships with a timeout bug against the payment provider.', flow: ['users>facade', 'facade>svc'], badges: { flags: '/orders: 25%' } },
          { text: 'Error rate on the new path jumps to <b>4%</b>. Because only a quarter of one route is on new code, about 3% of orders traffic is affected, not the whole site.', nodes: ['svc'], err: ['svc'], badges: { svc: ['5xx 4%', 'err'] }, tone: 'err' },
          { text: 'The SLO burn alert fires. Automation (or the on-call engineer) sets <code>/orders</code> back to <b>0%</b>. No deploy, no database restore: a config change.', flow: ['flags>facade', 'facade>mono'], badges: { flags: ['/orders: 0%', 'warn'] }, tone: 'warn' },
          { text: 'Users are back on the legacy path within seconds. This only worked because legacy still had the data (CDC, legacy still the writer). <b>Do not retire the old path until rollback is no longer needed.</b>', flow: ['users>facade', 'facade>mono', 'mono>mdb'], ok: ['mono'], tone: 'ok' }
        ]
      },
      {
        id: 'tail', title: 'At scale: the long tail', tone: 'warn',
        steps: [
          { text: 'Two years in: <b>45 of 60</b> routes are on new services and carry ~95% of traffic. The facade handles every request, so it is now critical infrastructure: run it redundant and watch its p99.', flow: ['users>facade', 'facade>svc'], hot: ['facade'], badges: { facade: ['critical path', 'warn'] } },
          { text: 'The remaining 15 routes are rarely used admin screens and batch jobs. Each costs as much to extract as a busy one but saves little.', nodes: ['mono'], warn: ['mono'], badges: { mono: ['15 cold routes', 'warn'] }, tone: 'warn' },
          { text: 'Decide explicitly: <b>retire</b> unused features, <b>freeze</b> the rest in a small, well-fenced legacy core, or finish. Do not leave it to drift.', nodes: ['mono', 'fit'], badges: { fit: 'legacy LOC ↓' } },
          { text: 'Then delete the transitional parts: shadow diffing, reverse sync, old routes in the facade. Transitional architecture that stays forever is just more legacy.', nodes: ['cdc', 'svc'], hidden: ['diff'], ok: ['svc'], badges: { cdc: ['decommission', 'info'] }, tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Each control is a real migration decision. Watch the facade, the data path and the meters. Durations are <em>illustrative</em> for a mid-size monolith (~60 capabilities, a few teams).',
      diagram: null, // filled below: architecture + edges for shared-DB and dual-write paths
      controls: [
        { id: 'approach', label: 'Migration approach', type: 'seg', value: 'route', options: [
          { v: 'bigbang', l: 'Big-bang rewrite' }, { v: 'route', l: 'Strangler by route' }, { v: 'domain', l: 'Strangler by domain + ACL' }, { v: 'bba', l: 'Branch by abstraction' }] },
        { id: 'data', label: 'Data strategy', type: 'seg', value: 'cdc', options: [
          { v: 'shared', l: 'Shared legacy DB' }, { v: 'cdc', l: 'CDC sync' }, { v: 'dual', l: 'Dual write' }, { v: 'owned', l: 'Service-owned from day 1' }] },
        { id: 'verify', label: 'Verification', type: 'seg', value: 'shadow', options: [
          { v: 'none', l: 'None (tests only)' }, { v: 'shadow', l: 'Shadow + diff' }, { v: 'canary', l: 'Canary only' }] },
        { id: 'gran', label: 'Cut-over granularity', type: 'seg', value: 'ramp', options: [
          { v: 'flip', l: 'One flag flip (0 → 100%)' }, { v: 'ramp', l: '% ramp (1 → 5 → 25 → 100)' }, { v: 'tenant', l: 'Tenant by tenant' }] }
      ],
      evaluate(s) {
        const clamp = (x) => Math.max(0.03, Math.min(0.97, x));
        const A = s.approach, D = s.data, V = s.verify, G = s.gran;
        const big = A === 'bigbang';
        // downtime risk (goodness = low risk)
        let down = { bigbang: 0.15, route: 0.65, domain: 0.7, bba: 0.65 }[A] + { none: -0.1, shadow: 0.12, canary: 0.15 }[V] + { flip: -0.1, ramp: 0.12, tenant: 0.08 }[G];
        if (big && G !== 'flip') down += 0.05;
        // time to first value
        const ttfv = { bigbang: [0.08, '18–36 months (at the end)'], route: [0.85, '~1 quarter'], domain: [0.65, '~2 quarters (model + ACL first)'], bba: [0.9, '~1–2 months, inside the code'] }[A];
        let ttfvS = ttfv[0] - (V === 'shadow' ? 0.05 : 0) - (D === 'owned' && !big ? 0.15 : 0);
        // rollback ease
        let rb = big ? 0.15 : { flip: 0.6, ramp: 0.85, tenant: 0.8 }[G];
        rb += { shared: 0.1, cdc: 0, dual: -0.1, owned: -0.3 }[D];
        // data consistency risk (goodness = low risk)
        let dc = { shared: 0.65, cdc: 0.8, dual: 0.3, owned: big ? 0.35 : 0.6 }[D] + (V === 'shadow' ? 0.08 : 0);
        // team load
        let load = { bigbang: 0.25, route: 0.62, domain: 0.5, bba: 0.68 }[A] + { none: 0.05, shadow: -0.1, canary: -0.05 }[V] + { shared: 0.05, cdc: -0.1, dual: -0.08, owned: -0.05 }[D] + (G === 'tenant' ? -0.05 : 0);
        // total duration (months, illustrative)
        let months = { bigbang: 24, route: 18, domain: 22, bba: 9 }[A] + { shared: 0, cdc: 3, dual: 2, owned: 4 }[D] + { none: 0, shadow: 2, canary: 1 }[V] + (G === 'tenant' ? 3 : 0);
        if (big && V === 'none') months += 6; // late surprises
        const durS = clamp(1 - (months - 8) / 30);
        // coupling left behind
        const coup = { shared: [0.15, 'shared tables: distributed monolith'], cdc: [0.7, 'one writer, events out'], dual: [0.45, 'two writers to reconcile'], owned: [0.9, 'clean ownership'] }[D];

        const metrics = [
          { k: 'Downtime risk', v: down >= 0.75 ? 'low: slices, verified' : down >= 0.5 ? 'medium' : 'high: one big switch', s: clamp(down) },
          { k: 'Time to first value', v: ttfv[1], s: clamp(ttfvS) },
          { k: 'Rollback ease', v: big ? 'hard: whole system + data' : rb >= 0.75 ? 'toggle back in seconds' : rb >= 0.5 ? 'possible, needs care' : 'one-way: needs reverse sync', s: clamp(rb) },
          { k: 'Data consistency risk', v: { shared: 'low drift, high coupling', cdc: 'seconds of lag, one writer', dual: 'no atomicity across 2 DBs', owned: big ? 'mass migration on cut night' : 'big migration up front' }[D], s: clamp(dc) },
          { k: 'Team load', v: load >= 0.6 ? 'manageable' : load >= 0.4 ? 'heavy: two systems + tooling' : 'very heavy: feature freeze', s: clamp(load) },
          { k: 'Total duration', v: '≈ ' + months + ' months', s: durS, hint: 'illustrative' },
          { k: 'Coupling left behind', v: coup[1], s: coup[0] }
        ];

        const notes = [];
        if (big) notes.push('A rewrite has to rediscover <b>every implicit rule</b> before it can launch, while the old system keeps changing. Fowler\'s bliki calls such rewrites far more complex than they seem and full of risk.');
        if (A === 'domain') notes.push('Splitting by <b>bounded context</b> (see DDD) costs a quarter of modelling up front, but the <b>anti-corruption layer</b> stops legacy codes and flags leaking into the new model.');
        if (A === 'bba') notes.push('Branch by abstraction works <b>inside one codebase</b>: add an interface, move callers to it, build the new implementation behind it, switch on trunk. Ideal for a library or persistence layer; it does not split deployables by itself.');
        if (D === 'shared') notes.push('Reading the legacy schema gets you live fast, but you have moved <b>code, not ownership</b>. Any legacy column change can now break the new service.');
        if (D === 'dual') notes.push('Dual writes fail half-way (crash, timeout, retry). Without an outbox or CDC plus nightly reconciliation, the two stores <b>drift silently</b>.');
        if (D === 'cdc') notes.push('Legacy stays the single writer while CDC fills the new store. Rollback stays easy because the old path never lost any data.');
        if (D === 'owned' && !big) notes.push('Owning data from day 1 means a one-time migration before the first cut-over, and rollback needs a <b>reverse sync</b> to the legacy tables.');
        if (V === 'none') notes.push('Without a parallel run you find behaviour differences <b>in production, from users</b>. Tests only cover the rules you already know about.');
        if (V === 'canary') notes.push('A canary catches errors and latency, but not <b>wrong-but-plausible</b> answers (a tax rounded differently). Shadow diffing catches those.');
        if (G === 'flip' && !big) notes.push('One flag flip per route is still far safer than a big bang, but a % ramp limits the blast radius of each step.');
        if (G === 'tenant') notes.push('Tenant-by-tenant cut-over lets you start with internal or friendly customers and keeps each tenant\'s data in one system at a time.');

        let verdict;
        if (big && V === 'none') verdict = '❌ <b>Big-bang rewrite with no parallel run:</b> every hidden rule surfaces on cut-over night, for all users, with no easy way back.';
        else if (big) verdict = '⚠ <b>Still a big bang.</b> Verification helps, but you deliver nothing for years and the switch is all or nothing. Strangle instead unless the system is tiny.';
        else if (D === 'dual' && V === 'none') verdict = '⚠ <b>Dual writes with no verification</b> will drift unnoticed. Add CDC or an outbox, reconciliation and shadow diffs.';
        else if (D === 'shared') verdict = '👍 <b>Fast start, but not finished:</b> you have new code on an old schema. Plan the CDC → service-owned step or you build a distributed monolith.';
        else if ((A === 'route' || A === 'domain') && (D === 'cdc' || D === 'owned') && V === 'shadow' && G !== 'flip') verdict = '✅ <b>The textbook strangler:</b> facade, verified slices, gradual ramp, one writer per table and a toggle to go back. Say this in the interview.';
        else if (A === 'bba') verdict = '👍 <b>Good for a component inside the codebase</b> (ORM, payment client, search). Combine with a facade when you split out a deployable service.';
        else verdict = '👍 <b>Workable strangler.</b> Check the meters: the weakest one is where the next incident will come from.';

        const labels = {
          facade: { bigbang: { label: 'Cut-over switch', sub: 'all or nothing' }, route: { label: 'Strangler facade', sub: 'routes by path' }, domain: { label: 'Strangler facade', sub: 'routes by bounded ctx' }, bba: { label: 'Abstraction seam', sub: 'interface in the code' } }[A],
          svc: big ? { label: 'Rewrite v2', sub: 'whole system' } : A === 'bba' ? { label: 'New impl', sub: 'behind interface' } : { label: 'Orders service', sub: 'new · extracted' },
          flags: { label: 'Toggle store', sub: { flip: 'route → on/off', ramp: 'route → % on new', tenant: 'tenant → old/new' }[G] },
          sdb: { label: 'Orders DB', sub: D === 'dual' ? 'second writer' : D === 'owned' ? 'service-owned' : 'CDC replica' }
        };
        const hide = [];
        if (A !== 'domain') hide.push('acl');
        if (V !== 'shadow') hide.push('diff');
        if (D !== 'cdc') hide.push('cdc');
        if (D === 'shared') hide.push('sdb');
        const flow = ['users>facade', 'flags>facade', 'facade>svc'];
        if (A === 'domain') flow.push('svc>acl', 'acl>mono');
        if (D === 'shared') flow.push('svc>mdb');
        else if (D === 'dual') flow.push(['svc>sdb', 'svc>mdb']);
        else flow.push('svc>sdb');
        if (D === 'cdc') flow.push('mdb>cdc', 'cdc>sdb');
        if (V === 'shadow') flow.push(['svc>diff', 'mono>diff']);
        const badges = {
          flags: [{ flip: 'off → on', ramp: '1→5→25→100%', tenant: 'tenant A, B…' }[G], 'info'],
          facade: big ? ['100% on one night', 'err'] : ['per-route', 'ok']
        };
        if (V === 'shadow') badges.diff = ['mismatch < 0.1%', 'ok'];
        if (D === 'dual') badges.svc = ['2 writes, no txn', 'warn'];
        return {
          metrics, verdict, notes: notes.slice(0, 4), labels, hide, flow, badges,
          hot: big ? ['facade'] : [],
          warn: (D === 'shared' ? ['mdb'] : []).concat(D === 'dual' ? ['sdb', 'mdb'] : []),
          err: big && V === 'none' ? ['svc'] : [],
          ok: !big && V === 'shadow' ? ['svc'] : []
        };
      }
    },

    widget: {
      title: 'Strangler facade: migrate, shadow, ramp, roll back',
      caption: 'Live routing table of a facade. <b>Pick a route</b> (tap a row), <b>build</b> its new service, turn on <b>shadow</b> to count mismatches, <b>fix</b> them, then <b>ramp</b> traffic. Users only see new-code errors once the route is ramped. Turn the guard on and a bad canary rolls itself back.'
    },

    realWorld: {
      intro: 'The pattern is twenty years old. The best evidence is from teams who wrote down how they verified each step.',
      timeline: [
        { when: '2004 → 2024', who: 'Martin Fowler', title: 'Strangler (Fig) Application', text: 'Fowler named the pattern in 2004 after the strangler figs he saw in Queensland rainforests, arguing that rewrites of critical systems are far more complex and risky than they look. He describes <b>event interception</b> and <b>asset capture</b> as the core moves. The page, renamed "Strangler Fig Application", was substantially revised in 2024.', src: 0 },
        { when: '2000s', who: 'Paul Hammant · Fowler', title: 'Branch by Abstraction', text: 'Paul Hammant coined the name while arguing for trunk-based development (crediting Stacy Curl with the idea). Fowler describes it: add an abstraction in front of the supplier, move clients onto it, build the new supplier behind it, then switch.', src: 1 },
        { when: '2016', who: 'GitHub', title: 'Scientist 1.0 open-sourced', text: 'Built when GitHub rewrote its <b>permissions code</b>, one of its most critical systems. Scientist runs the old (control) and new (candidate) paths, <b>randomises their order</b>, times both, returns the control result and publishes mismatches.', src: 6 },
        { when: '2017 · 2022', who: 'Ford, Parsons, Kua (+ Sadalage)', title: 'Building Evolutionary Architectures', text: 'Defines an evolutionary architecture as one that supports <b>guided, incremental change across multiple dimensions</b>, and uses <b>fitness functions</b> (atomic vs holistic, triggered vs continual) to protect what matters. The 2nd edition (2022) goes deeper on automating governance with them.', src: 3 },
        { when: '2019', who: 'Sam Newman', title: 'Monolith to Microservices', text: 'Catalogues the migration patterns side by side: strangler fig, <b>branch by abstraction</b>, <b>parallel run</b> (with a credit-derivative pricing example), decorating collaborator, change data capture, and how to split the database.', src: 5 },
        { when: '2019–20', who: 'Shopify', title: 'Storefront rewrite verified in production', text: 'Shopify rewrote the software behind all online storefronts starting in January 2019. A <b>verifier service</b> compared status, headers and body of legacy and new responses (with time and randomness pinned), and routing sent request types to the new renderer only once they had passed verification. Shopify reported the new renderer as roughly <b>5× faster</b> on average.', src: 9 },
        { when: '~2020', who: 'Shopify', title: 'Strangling the Shop "God object"', text: 'The Shop model was over <b>3,000 lines</b>. With zero downtime as a hard requirement, the team rejected a big-bang change and used the strangler fig in a documented <b>7-step</b> process, starting with store settings: for a while writers persisted to the new table <b>and</b> the old one, so reads could move over safely.', src: 8 },
        { when: '2021–24', who: 'Thoughtworks', title: 'Patterns of Legacy Displacement', text: 'Ian Cartwright, Rob Horn and James Lewis describe <b>Transitional Architecture</b>: temporary seams such as an event router (Event Interception) that exist only to make displacement safe and are removed afterwards.', src: 2 },
        { when: '2023', who: 'GitHub', title: 'merge-ort switched over with Scientist', text: 'GitHub ran old (libgit2) and new (merge-ort) merges side by side in production. For its own monolith repo it saw a <b>10× speed-up</b> in both average and p99; one rebase experiment took 2.56 hours of compute on the old path vs under 10 minutes on the new.', src: 7 },
        { when: 'today', who: 'AWS · Microsoft', title: 'Cloud guidance and tooling', text: 'AWS frames the pattern as <b>transform, coexist, eliminate</b>, warns that the proxy can become a single point of failure or bottleneck, and ships Migration Hub Refactor Spaces for it. Azure\'s guide applies the same idea to decomposing the database step by step.', src: 13 }
      ],
      lessons: [
        'Own the <b>seam</b> first (facade or event router); every later step is a routing change.',
        'Verify with <b>real traffic</b>: shadow and diff find the rules nobody wrote down.',
        'Move <b>data ownership</b>, not just code; one writer per table at any moment.',
        'Keep rollback cheap until the end, then <b>delete transitional parts</b> on purpose.',
        'Decide when to stop: a fenced, frozen legacy core can be a valid end state.'
      ],
      sources: [
        { title: 'Strangler Fig Application', url: 'https://www.martinfowler.com/bliki/StranglerFigApplication.html', pub: 'Martin Fowler, bliki (2004, revised 2024)' },
        { title: 'Branch By Abstraction', url: 'https://www.martinfowler.com/bliki/BranchByAbstraction.html', pub: 'Martin Fowler, bliki' },
        { title: 'Patterns of Legacy Displacement', url: 'https://martinfowler.com/articles/patterns-legacy-displacement', pub: 'Cartwright, Horn, Lewis (Thoughtworks) on martinfowler.com' },
        { title: 'Building Evolutionary Architectures', url: 'https://nealford.com/books/buildingevolutionaryarchitectures.html', pub: 'Neal Ford, Rebecca Parsons, Patrick Kua, Pramod Sadalage (O\'Reilly)' },
        { title: 'Building Evolutionary Architectures, 2nd edition', url: 'https://www.thoughtworks.com/en-us/insights/books/building-evolutionaryarchitectures-second-edition', pub: 'Thoughtworks, 2022' },
        { title: 'Monolith to Microservices', url: 'https://samnewman.io/books/monolith-to-microservices/', pub: 'Sam Newman (O\'Reilly)' },
        { title: 'Scientist: Measure Twice, Cut Once', url: 'https://github.blog/engineering/infrastructure/scientist/', pub: 'GitHub Engineering, 2016' },
        { title: 'Scaling merge-ort across GitHub', url: 'https://github.blog/engineering/infrastructure/scaling-merge-ort-across-github', pub: 'GitHub Engineering, 2023' },
        { title: 'Refactoring Legacy Code with the Strangler Fig Pattern', url: 'https://shopify.engineering/refactoring-legacy-code-strangler-fig-pattern', pub: 'Shopify Engineering' },
        { title: 'How Shopify Reduced Storefront Response Times with a Rewrite', url: 'https://shopify.engineering/how-shopify-reduced-storefront-response-times-rewrite', pub: 'Shopify Engineering' },
        { title: 'How to Dynamically Route Storefront Traffic', url: 'https://shopify.engineering/dynamically-route-storefront-traffic', pub: 'Shopify Engineering' },
        { title: 'A Packwerk Retrospective', url: 'https://shopify.engineering/a-packwerk-retrospective', pub: 'Shopify Engineering, 2024' },
        { title: 'Strangler Fig pattern', url: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig', pub: 'Microsoft Azure Architecture Center' },
        { title: 'Strangler fig pattern', url: 'https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-decomposing-monoliths/strangler-fig.html', pub: 'AWS Prescriptive Guidance' },
        { title: 'Strangler fig pattern (cloud design patterns)', url: 'https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html', pub: 'AWS Prescriptive Guidance' }
      ]
    },

    tradeoffs: {
      headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
      rows: [
        ['Overall approach', '<b>Big-bang rewrite</b>: clean design, one switch', '<b>Strangler fig</b>: value every quarter, reversible steps', 'Rewrite only small systems you can swap and swap back in a day; strangle everything else'],
        ['Seam', '<b>Facade / proxy</b> at the edge (HTTP routes, messages)', '<b>Branch by abstraction</b> inside the code', 'Facade to split deployables; abstraction for a component inside one codebase. Large migrations use both.'],
        ['Verification', '<b>Shadow + diff</b>: catches wrong-but-plausible answers', '<b>Canary</b>: catches errors and latency on real users', 'Shadow reads first, then canary. Writes need a sandbox or dry-run mode to shadow.'],
        ['Data', '<b>CDC from legacy</b>: one writer, easy rollback', '<b>Service-owned early</b>: clean ownership sooner', 'CDC while you still might roll back; flip ownership once the route is stable, with reverse sync for stragglers'],
        ['Cut-over unit', '<b>% of traffic</b>: smooth ramp, fast feedback', '<b>Per tenant</b>: whole customer on one side', '% for stateless reads; tenant when a customer\'s data must live in one system at a time'],
        ['End state', '<b>Retire legacy fully</b>', '<b>Fenced legacy core</b> kept frozen', 'Retire when the tail is cheap to move; fence it when the last routes are rarely used and stable']
      ]
    },
    failures: [
      { f: 'Big-bang rewrite stalls (second-system effect)', detect: 'No production users after 6+ months; feature parity list keeps growing', fix: 'Stop, put a facade in front, ship the most valuable slice behind it, and keep going in slices.' },
      { f: 'Distributed monolith', detect: 'New services read legacy tables; a schema change needs several teams to deploy together', fix: 'Fitness function that fails the build on cross-schema reads; CDC into service-owned stores; one writer per table.' },
      { f: 'Dual-write drift', detect: 'Nightly row counts or checksums differ between old and new stores', fix: 'Single writer plus CDC or a transactional outbox; a reconciliation job that blocks the next ramp step.' },
      { f: 'Shadow traffic causes side effects', detect: 'Duplicate emails, charges or orders from the candidate path', fix: 'Shadow reads only, stub outbound calls in the candidate, or use idempotency keys and a dry-run flag.' },
      { f: 'Facade becomes a bottleneck or SPOF', detect: 'Facade p99 and saturation alarms; outage when one instance dies', fix: 'Run it stateless and redundant, keep routing rules simple and cached, load-test it like any edge tier.' },
      { f: 'Rollback no longer possible', detect: 'Legacy path deleted or legacy DB no longer receives writes while the route is still ramping', fix: 'Keep legacy as writer (or reverse sync) until the route has been at 100% for an agreed soak period.' },
      { f: 'Never-ending strangle', detect: 'Transitional parts (diff, sync, facade rules) older than a year; legacy cost flat', fix: 'Exit criteria in the ADR, a visible burn-down of routes and legacy cost, and a decision to retire or fence the tail.' }
    ],

    interview: [
      { q: 'What is the strangler fig pattern, and why prefer it to a rewrite?', a: '<p>Martin Fowler named it in 2004. You put an <b>interception layer</b> (facade, proxy or event router) in front of the legacy system and move functionality to new code <b>piece by piece</b>, routing each piece over when it is ready, until the old system can be retired.</p><p>Versus a rewrite: you deliver value early, the old system keeps evolving in a controlled way, each step is <b>verifiable and reversible</b>, and you never bet everything on one cut-over.</p>', fu: 'What did Fowler mean by event interception and asset capture?', lvl: 'core' },
      { q: 'What is evolutionary architecture, and what is a fitness function?', a: '<p>Ford, Parsons and Kua define an evolutionary architecture as one that supports <b>guided, incremental change across multiple dimensions</b>.</p><p>A <b>fitness function</b> is an objective, preferably automated check of one architectural characteristic: a dependency rule in CI (ArchUnit, Packwerk), a contract test, a p99 budget in production, "no service reads another\'s tables". They are the guardrails that make many small changes safe.</p>', fu: 'Give one atomic and one holistic fitness function.', lvl: 'core' },
      { q: 'How do you choose the first piece to extract?', a: '<ul><li><b>Clear boundary</b>: a business capability with few inbound dependencies (often found with DDD and event storming).</li><li><b>Real value</b>: something the business wants to change faster.</li><li><b>Low blast radius</b>: not the payment core on day one.</li><li><b>Interceptable</b>: its inputs pass through a seam you control.</li></ul><p>The first slice also proves the platform: facade, CI, observability, toggles.</p>', lvl: 'core' },
      { q: 'How would you verify that the new service behaves like the old one?', a: '<p>A <b>parallel run</b>: send the same request to both, <b>return the legacy answer</b>, compare and log differences. GitHub\'s Scientist and Shopify\'s storefront verifier work this way.</p><p>Normalise noise (timestamps, ordering, ids), measure the mismatch rate per route, and only start a canary when it is below an agreed bar. Shadow <b>reads</b>; writes need a sandbox, stubs or dry-run mode.</p>', fu: 'Why randomise the order in which control and candidate run?', lvl: 'core' },
      { q: 'How do you migrate the data when the monolith has one shared database?', a: '<ol><li>Start with the new service reading through an <b>anti-corruption layer</b> (or a view), never with new direct table dependencies.</li><li>Stream changes with <b>CDC</b> into a service-owned store; legacy remains the single writer.</li><li>Flip <b>write ownership</b> per entity, with reverse sync for modules that still read the old tables.</li><li>Reconcile with counts and checksums; remove the old tables when nobody reads them.</li></ol>', lvl: 'deep' },
      { q: 'Why are dual writes dangerous, and what do you use instead?', a: '<p>Writing to two databases from application code is <b>not atomic</b>: a crash, timeout or retry between the writes leaves them different, and nothing tells you.</p><p>Use <b>one writer</b> and propagate: CDC from the database log, or a <b>transactional outbox</b> written in the same transaction as the data. Add a reconciliation job either way.</p>', lvl: 'core' },
      { q: 'Strangler fig vs branch by abstraction: when do you use which?', a: '<p><b>Strangler fig</b> intercepts at the system boundary (HTTP routes, queues, files) and moves functionality to a <b>separate deployable</b>.</p><p><b>Branch by abstraction</b> works <b>inside one codebase</b>: introduce an interface in front of a component, move callers onto it, build the new implementation behind it and switch on trunk with a toggle. It suits swapping an ORM, a payment client or a module. Big migrations often use both.</p>', lvl: 'core' },
      { q: 'What does an anti-corruption layer do in a migration?', a: '<p>It is a <b>translator</b> between the legacy model and the new domain model (Eric Evans, DDD). It maps codes, flags, odd keys and IDs, so legacy concepts do not leak into the new service.</p><p>It also isolates change: when legacy behaviour shifts, only the ACL changes. It is transitional and should shrink as the legacy side shrinks.</p>', lvl: 'deep' },
      { q: 'How do you design rollback for a route that is at 25% on the new service?', a: '<p>Routing lives in a <b>toggle or gateway config</b>, so rollback is setting <code>/orders</code> to 0%, ideally automated on SLO burn or error-rate alerts.</p><p>The precondition is <b>data</b>: legacy must still have everything (legacy as writer with CDC out, or reverse sync). Keep that true until the route has soaked at 100% for an agreed period.</p>', lvl: 'deep' },
      { q: 'When do you stop strangling?', a: '<p>When the <b>marginal cost</b> of extracting the next route exceeds what it saves. The tail is usually rarely used admin and batch features.</p><p>Options: <b>retire</b> unused features, <b>fence and freeze</b> a small legacy core behind the facade, or finish. Make it an explicit, recorded decision (ADR), then delete transitional components so they do not become new legacy.</p>', lvl: 'deep' },
      { q: 'Your CTO wants a full rewrite in 18 months. How do you convince them otherwise?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a core platform slows every release. <b>Task</b>: modernise without a risky rewrite. <b>Action</b>: frame it in business risk: a rewrite delivers nothing for 18 months, chases a moving target and ends in one all-or-nothing cut-over. Propose the first slice behind a facade in one quarter, with a mismatch dashboard and a toggle to go back, and a quarterly burn-down of legacy routes and cost. <b>Result</b>: value in the first quarter and a migration the board can track and stop at any time.</p>', lvl: 'core' },
      { q: 'What can go wrong with the facade itself?', a: '<p>It sits on every request, so it can become a <b>single point of failure</b> or a latency bottleneck (AWS calls this out). Run it stateless and redundant, keep routing logic simple and cached, and give it its own SLO.</p><p>Also guard against it turning into a "smart" integration layer full of business logic: it should route, not decide.</p>', lvl: 'deep' }
    ],

    code: [
      {
        title: 'Spring Cloud Gateway: weighted split for /orders/**', lang: 'yaml',
        code: `# application.yml (Spring Cloud Gateway 4.3+, Spring Boot 3.5)
# Older versions use the prefix spring.cloud.gateway.routes
spring:
  cloud:
    gateway:
      server:
        webflux:
          routes:
            - id: orders-new            # 20% of /orders traffic
              uri: http://orders-svc:8080
              order: 0
              predicates:
                - Path=/orders/**
                - Weight=orders, 20
            - id: orders-legacy         # 80% stays on the monolith
              uri: http://legacy-monolith:8080
              order: 0
              predicates:
                - Path=/orders/**
                - Weight=orders, 80
            - id: orders-beta-tenants   # opt-in cohort, always new
              uri: http://orders-svc:8080
              order: -1
              predicates:
                - Path=/orders/**
                - Header=X-Tenant, (acme|globex)
            - id: legacy-catch-all      # everything not yet strangled
              uri: http://legacy-monolith:8080
              order: 1000
              predicates:
                - Path=/**`,
        note: 'Routes in the same <code>Weight</code> group split traffic by their weights; each request is placed independently, so add a cookie or header rule if a user must stay on one side. Ramping is a config change (Spring Cloud Config refresh), and rollback is setting the weights to 0/100.'
      },
      {
        title: 'Java: parallel-run comparator (return legacy, log diffs)', lang: 'java',
        code: `// Spring Boot 3.3+, Java 21. Reads only: never shadow non-idempotent writes.
@Service
public class OrdersParallelRun {
  private static final Logger log = LoggerFactory.getLogger(OrdersParallelRun.class);
  private static final Set<String> NOISE = Set.of("generatedAt", "traceId");
  private final RestClient legacy, candidate;
  private final ObjectMapper json;
  private final MeterRegistry meters;
  private final ExecutorService shadow = Executors.newVirtualThreadPerTaskExecutor();

  public OrdersParallelRun(RestClient.Builder b, ObjectMapper json, MeterRegistry meters) {
    this.legacy = b.clone().baseUrl("http://legacy-monolith:8080").build();
    this.candidate = b.clone().baseUrl("http://orders-svc:8080").build();
    this.json = json; this.meters = meters;
  }

  public ResponseEntity<String> getOrder(String id) {
    ResponseEntity<String> control = call(legacy, id);   // the user always gets this
    shadow.submit(() -> compare(id, control));            // never blocks the user
    return control;
  }

  private void compare(String id, ResponseEntity<String> control) {
    String result;
    try {
      ResponseEntity<String> cand = call(candidate, id);
      boolean same = control.getStatusCode().equals(cand.getStatusCode())
          && normalise(control.getBody()).equals(normalise(cand.getBody()));
      result = same ? "match" : "mismatch";
      if (!same) log.warn("orders diff id={} legacy={} new={}", id, control.getBody(), cand.getBody());
    } catch (Exception e) {
      result = "candidate_error";
    }
    meters.counter("parallel_run", "route", "/orders", "result", result).increment();
  }

  private ResponseEntity<String> call(RestClient c, String id) {
    return c.get().uri("/orders/{id}", id).retrieve()
        .onStatus(HttpStatusCode::isError, (req, res) -> { })  // compare errors too
        .toEntity(String.class);
  }

  private JsonNode normalise(String body) throws JsonProcessingException {
    JsonNode n = json.readTree(body == null ? "null" : body);
    if (n instanceof ObjectNode o) NOISE.forEach(o::remove);
    return n;
  }
}`,
        note: 'The same idea as GitHub\'s Scientist: control result returned, candidate measured and compared, mismatches counted per route. Sample (e.g. 10% of requests) if the candidate cannot take full load, and put a timeout on the candidate client.'
      },
      {
        title: 'Postgres: migration status and a guarded promotion', lang: 'sql',
        code: `CREATE TYPE cutover_state AS ENUM
  ('LEGACY','SHADOW','CANARY','NEW','ROLLED_BACK','RETIRED');

CREATE TABLE route_migration (
  route       text NOT NULL,                 -- '/orders/**'
  tenant_id   text NOT NULL DEFAULT '*',     -- '*' = all tenants
  state       cutover_state NOT NULL DEFAULT 'LEGACY',
  new_pct     smallint NOT NULL DEFAULT 0 CHECK (new_pct BETWEEN 0 AND 100),
  owner_team  text NOT NULL,
  version     int  NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (route, tenant_id)
);

CREATE TABLE shadow_result (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route       text NOT NULL,
  matched     boolean NOT NULL,
  diff        jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON shadow_result (route, observed_at);

-- Promote SHADOW -> CANARY 5% only if the last 24 h had enough samples
-- and fewer than 0.1% mismatches. 0 rows returned = gate not met.
UPDATE route_migration m
   SET state = 'CANARY', new_pct = 5, version = version + 1, updated_at = now()
 WHERE m.route = '/orders/**' AND m.tenant_id = '*' AND m.state = 'SHADOW'
   AND (SELECT count(*) >= 10000
               AND avg((NOT matched)::int) < 0.001
          FROM shadow_result s
         WHERE s.route = m.route
           AND s.observed_at > now() - interval '24 hours')
RETURNING route, state, new_pct;`
      }
    ],

    related: ['architectural-styles', 'ddd', 'cdc-pipelines', 'zero-downtime-migrations', 'deployment-strategies', 'sd:api-gateway']
  });

  /* knobs diagram = architecture + the extra data paths used by the shared-DB and dual-write choices */
  const a = SD.data.architecture;
  SD.data.knobs.diagram = {
    title: a.title,
    nodes: a.nodes,
    edges: a.edges.concat([{ from: 'svc', to: 'mdb', dashed: true, bend: -0.35 }])
  };
})();
