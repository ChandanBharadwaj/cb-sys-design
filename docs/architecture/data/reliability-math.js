SD.register({
  slug: 'reliability-math',
  domain: 1,
  title: 'Reliability Math',
  examples: 'Nines, MTBF/MTTR, cells',
  tagline: 'Turn <b>nines into minutes</b>, multiply a chain of dependencies, add redundancy the right way, and shrink the <b>blast radius</b> with cells and shuffle sharding, while remembering that <b>correlated failures</b> break every formula on this page.',
  tldr: {
    problem: 'Teams promise "four nines" without checking the arithmetic. Five hard dependencies at 99.9% each cap the service at about 99.5%, and two "redundant" copies that share a config push or a region fail together.',
    idea: '<b>Series</b> availabilities multiply (A₁·A₂·…), <b>parallel</b> copies combine as 1 − Π(1 − Aᵢ), and availability ≈ <b>MTBF / (MTBF + MTTR)</b>. Then limit how many customers one failure can touch: <b>cells</b>, <b>shuffle sharding</b>, and <b>static stability</b>.',
    insight: 'The formulas assume <b>independent</b> failures. Real outages are mostly correlated (same deploy, same region, same poison request), so the architect\'s job is to make the independence assumption true: separate cells, staged deploys, and dependencies one nine better than you promise.',
    numbers: [
      { v: '43.8 min', l: 'downtime per month at 99.9% (arithmetic: 0.1% × 730 h average month)' },
      { v: '+1 nine', l: '"rule of the extra 9": critical dependencies should be about 10× more available than you (Treynor et al., ACM Queue 2017)' },
      { v: '730 billion', l: 'distinct shuffle shards from 2048 Route 53 virtual name servers, 4 per zone: C(2048, 4) (AWS)' }
    ]
  },

  intro: {
    what: '<b>Availability</b> is the fraction of time (or of requests) a service works. Reliability math is the small set of formulas that turns a target like "99.95%" into minutes of downtime, tells you what a chain of dependencies can deliver, and shows how much redundancy or faster repair buys. It also covers <b>blast radius</b>: how many users one failure reaches.',
    analogy: {
      icon: '💡',
      title: 'Christmas lights: in a string, or in parallel',
      text: 'Old Christmas lights were wired <b>in series</b>: one dead bulb and the whole string goes dark, so a string of 50 good bulbs is much less reliable than one bulb. Modern strings are wired <b>in parallel</b>: a dead bulb only darkens itself. Services are the same: hard dependencies are bulbs in series, replicas are bulbs in parallel. The analogy breaks in one place: bulbs fail independently, but replicas often share a power supply (a region, a deploy, a bug) and die together.'
    },
    problem: 'A team promises its checkout API at 99.99%. It calls auth, inventory, pricing, payment and a database, each with a 99.9% SLO. Even if checkout\'s own code never fails, the chain can only manage about 99.5%: <b>roughly 3.6 hours of downtime a month instead of 4 minutes</b>. The question this answers is: <b>what availability can this design actually deliver, and how many users does one failure hurt?</b>',
    story: [
      {
        stage: 'naive',
        title: 'One copy of everything, called in a chain',
        text: 'Each service calls the next, synchronously. Every piece is "pretty reliable" (99.9%), so the whole thing must be too. It is simple and fast to build.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'all customers', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'Checkout', sub: '99.9%', kind: 'service', at: [210, 0] },
            { id: 'auth', label: 'Auth', sub: '99.9%', kind: 'service', at: [350, 0] },
            { id: 'pay', label: 'Payment', sub: '99.9%', kind: 'external', at: [350, 110] },
            { id: 'db', label: 'Database', sub: '99.9%', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'u', to: 'api' }, { from: 'api', to: 'auth' }, { from: 'api', to: 'pay' }, { from: 'api', to: 'db' }],
          flow: ['u>api', ['api>auth', 'api>pay', 'api>db']]
        }
      },
      {
        stage: 'breaks',
        title: 'Any one failure takes down everyone',
        text: 'Four parts at 99.9% in <b>series</b> give 0.999⁴ ≈ 99.6%: about <b>2.9 hours a month</b> down. And when the database fails, <b>every</b> customer is affected at once.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: '100% affected', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'Checkout', sub: '≈ 99.6% total', kind: 'service', at: [210, 0] },
            { id: 'auth', label: 'Auth', sub: '99.9%', kind: 'service', at: [350, 0] },
            { id: 'pay', label: 'Payment', sub: '99.9%', kind: 'external', at: [350, 110] },
            { id: 'db', label: 'Database', sub: 'down', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'u', to: 'api' }, { from: 'api', to: 'auth' }, { from: 'api', to: 'pay' }, { from: 'api', to: 'db' }],
          flow: ['u>api', 'api>db'],
          err: ['db', 'api', 'u'],
          badges: { db: ['down', 'err'], u: ['all users', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Redundancy, soft dependencies and cells',
        text: 'Replicas in <b>parallel</b> turn 99.9% into 1 − 0.001² = 99.9999% (if failures are independent). Payment becomes a <b>soft</b> dependency behind a queue. Customers are split into <b>cells</b>, so one bad cell hurts a third of them, not all.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'routed by id', kind: 'client', at: [70, 0] },
            { id: 'r', label: 'Cell router', sub: 'thin, stateless', kind: 'edge', at: [210, 0] },
            { id: 'c1', label: 'Cell 1', sub: 'full stack', kind: 'service', at: [70, 110] },
            { id: 'c2', label: 'Cell 2', sub: 'full stack', kind: 'service', at: [210, 110] },
            { id: 'c3', label: 'Cell 3', sub: 'full stack', kind: 'service', at: [350, 110] },
            { id: 'pay', label: 'Payment', sub: 'async, queued', kind: 'external', at: [350, 0] }
          ],
          edges: [{ from: 'u', to: 'r' }, { from: 'r', to: 'c1' }, { from: 'r', to: 'c2' }, { from: 'r', to: 'c3' }, { from: 'r', to: 'pay', dashed: true }],
          flow: ['u>r', ['r>c1', 'r>c2', 'r>c3']],
          ok: ['c1', 'c3', 'pay'], err: ['c2'],
          badges: { c2: ['1/3 users', 'err'], c1: ['fine', 'ok'] }
        }
      }
    ],
    usedBy: ['Google (SRE book, "Calculus of Service Availability")', 'Amazon Route 53 (shuffle sharding)', 'AWS (cells, static stability)', 'Slack (AZ cells)', 'Grafana Mimir / Cortex (shuffle sharding)'],
    whenToUse: [
      'Before promising an SLO or SLA: check what the dependency chain can actually deliver',
      'Choosing between more replicas, faster recovery (MTTR) and fewer hard dependencies',
      'Multi-tenant systems where one noisy or poisonous customer could take down everyone'
    ],
    whenNot: [
      'Deciding how to alert and when to freeze releases: see <a href="slo-error-budgets.html">SLIs, SLOs &amp; Error Budgets</a>',
      'Region-loss planning with RTO/RPO targets: see <a href="disaster-recovery.html">Disaster Recovery</a>',
      'The mechanics of timeouts, retries and breakers: see <a href="resiliency-patterns.html">Resiliency Patterns</a>'
    ],
    glossary: [
      { term: 'Nines', def: 'Shorthand for availability: "three nines" = 99.9%, "four nines" = 99.99%. Each extra nine cuts allowed downtime by 10×.' },
      { term: 'MTBF', def: 'Mean time between failures: average time a component runs before it fails.' },
      { term: 'MTTR', def: 'Mean time to recovery (or repair): average time from failure to service restored. MTTD (detect) and MTTA (acknowledge) are its first two parts.' },
      { term: 'Series / parallel', def: 'Series: all parts are needed, so availabilities multiply. Parallel: any one copy is enough, so unavailabilities multiply.' },
      { term: 'k-of-n', def: 'A group of n replicas that works while at least k are up, such as a 3-node quorum that needs 2.' },
      { term: 'Blast radius', def: 'The share of customers or requests a single failure can affect.' },
      { term: 'Cell', def: 'A complete, independent copy of a workload serving a subset of customers, chosen by a partition key.' },
      { term: 'Shuffle sharding', def: 'Giving each customer a different random combination of k workers out of n, so two customers rarely share all their workers.' }
    ]
  },

  requirements: {
    functional: [
      'Express every target as <b>minutes of downtime</b> per month or year, not just nines',
      '<b>Series</b>: hard dependencies multiply, so A(chain) ≤ the weakest link',
      '<b>Parallel</b>: redundant copies combine as 1 − Π(1 − Aᵢ); quorums use the <b>k-of-n</b> binomial',
      'Availability ≈ <b>MTBF / (MTBF + MTTR)</b>: cutting repair time counts as much as failing less',
      'Make failures <b>independent</b> and <b>small</b>: cells, shuffle sharding, staged deploys',
      'Keep the data plane working without the control plane (<b>static stability</b>)'
    ],
    nonFunctional: [
      'Each critical dependency about <b>one nine better</b> than the service SLO (rule of the extra 9)',
      'Blast radius of one cell or shard ≤ <b>1/N</b> of customers (e.g. ≤ 12.5% with 8 cells)',
      'MTTD in minutes, not hours: alerting catches a full outage within ~1–5 min',
      'Survive the loss of one AZ with <b>no scaling action</b> (pre-provisioned N+1 capacity)',
      'Deploys reach at most one cell or one AZ at a time before bake time',
      'Every soft dependency has a tested fallback (cache, default, queue)'
    ],
    outOfScope: [
      '<b>Multiplying replicas without asking what they share</b> (region, deploy, config, bug): independence is assumed, not given',
      '<b>Promising more nines than your dependencies</b>: 99.99% on top of a 99.9% hard dependency',
      '<b>Global singletons</b> in the request path (one config service, one lock, one DNS provider)',
      '<b>Failover that needs the control plane</b> during the event it is meant to survive',
      '<b>Counting only MTBF</b>: ignoring detection and repair time'
    ]
  },

  calculator: {
    inputs: [
      { id: 'a', label: 'Availability of one component', min: 90, max: 99.999, step: 0.001, value: 99.9, unit: '%', fmt: 'raw' },
      { id: 'n', label: 'Hard dependencies in series (hops)', min: 1, max: 12, value: 5 },
      { id: 'r', label: 'Replicas per hop in parallel (need 1)', min: 1, max: 4, value: 1 },
      { id: 'mtbf', label: 'MTBF of one service', min: 24, max: 8760, value: 720, log: true, unit: 'h' },
      { id: 'mttr', label: 'MTTR of that service', min: 1, max: 600, value: 60, log: true, unit: 'min' }
    ],
    outputs: [
      { label: 'Composite availability = (1 − (1 − A)ʳ)ⁿ', f: (v) => { const u = 1 - v.a / 100; const A = Math.pow(1 - Math.pow(u, v.r), v.n); return (A * 100).toFixed(A > 0.9999 ? 5 : 3) + '%'; } },
      { label: 'Downtime per month (730 h)', f: (v) => { const u = 1 - v.a / 100; const A = Math.pow(1 - Math.pow(u, v.r), v.n); const m = (1 - A) * 730 * 60; return m < 1 ? (m * 60).toFixed(1) + ' s' : m < 120 ? m.toFixed(1) + ' min' : (m / 60).toFixed(1) + ' h'; } },
      { label: 'Nines (−log₁₀ of unavailability)', f: (v) => { const u = 1 - v.a / 100; const A = Math.pow(1 - Math.pow(u, v.r), v.n); return (-Math.log10(Math.max(1e-12, 1 - A))).toFixed(2); } },
      { label: 'Availability from MTBF / (MTBF + MTTR)', f: (v) => { const A = v.mtbf / (v.mtbf + v.mttr / 60); return (A * 100).toFixed(4) + '%'; } },
      { label: 'Downtime per month at that MTBF / MTTR', f: (v) => { const A = v.mtbf / (v.mtbf + v.mttr / 60); const m = (1 - A) * 730 * 60; return m < 120 ? m.toFixed(1) + ' min' : (m / 60).toFixed(1) + ' h'; } },
      { label: 'Effect of halving MTTR', f: (v) => { const A1 = v.mtbf / (v.mtbf + v.mttr / 60), A2 = v.mtbf / (v.mtbf + v.mttr / 120); const s = (A2 - A1) * 730 * 60; return (A2 * 100).toFixed(4) + '% (saves ' + (s < 120 ? s.toFixed(1) + ' min' : (s / 60).toFixed(1) + ' h') + '/month)'; } }
    ],
    note: 'Assumes <b>independent</b> failures and hops that are all hard dependencies; a correlated failure (same deploy, same region) makes real numbers worse than these. The first three outputs use the per-component availability; the last three model one service from <b>MTBF and MTTR</b>. Halving MTTR roughly halves downtime, which is the same as doubling MTBF and usually much cheaper. 730 h is the average month (8,760 h ÷ 12).'
  },

  api: [
    { m: 'DOC', p: 'Dependency inventory', d: 'Every downstream the service calls, marked <b>hard</b> (request fails without it) or <b>soft</b> (degrades), with its published SLO, the fallback, and the timeout and retry budget. This is the input to the composite availability math.' },
    { m: 'SLO', p: 'Composite availability budget', d: 'Target (e.g. 99.95%), own-code budget and per-dependency budget. Treynor et al. suggest that the service\'s own failures and its dependencies\' failures share the budget; dependencies should offer about one more nine.' },
    { m: 'ADR', p: 'ADR: cell-based architecture', d: 'Partition key (customer or tenant id), cell size and max cells, router design, what is shared across cells (ideally nothing), migration of customers between cells, and deploy order (one cell, bake, then waves).' },
    { m: 'POLICY', p: 'Deployment wave policy', d: 'Canary in one cell or AZ, bake time, then waves of growing size; never more than one AZ per region at once. Turns "one bad push" from a correlated failure into a one-cell failure.' },
    { m: 'YAML', p: 'Shuffle-shard config', d: 'Workers n, shard size k, assignment hash (tenant id → k workers), and the overlap guarantee. Grafana Mimir exposes this as per-tenant <code>*_tenant_shard_size</code> settings.' },
    { m: 'SQL', p: 'Incident metrics query', d: 'MTTD, MTTA, MTTR (mean and p90) per service per quarter from the incident table, used to decide whether to invest in detection, paging or repair.' }
  ],
  dataModel: [
    { name: 'dependency', store: 'Postgres (service catalog)', fields: [['service', 'text', 'pk'], ['depends_on', 'text', 'pk'], ['criticality', 'enum(hard, soft)'], ['published_slo', 'numeric(7,5)'], ['fallback', 'text'], ['timeout_ms', 'int']], note: 'Walk this graph to compute the composite availability of any service.' },
    { name: 'incident', store: 'Postgres', fields: [['incident_id', 'uuid', 'pk'], ['service', 'text', 'idx'], ['started_at', 'timestamptz'], ['detected_at', 'timestamptz'], ['acked_at', 'timestamptz'], ['resolved_at', 'timestamptz'], ['cells_affected', 'int'], ['cause', 'text']], note: 'Four timestamps give MTTD, MTTA and MTTR; cells_affected measures blast radius.' },
    { name: 'cell_assignment', store: 'DynamoDB / Postgres', fields: [['tenant_id', 'text', 'pk'], ['cell_id', 'text', 'idx'], ['shard_workers', 'int[]'], ['assigned_at', 'timestamptz'], ['migrating_to', 'text']], note: 'Read by the router on every request, so it is cached and must work if the control plane is down.' }
  ],

  architecture: {
    title: 'Cells behind a thin router, with hard and soft dependencies',
    nodes: [
      { id: 'users', label: 'Customers', sub: 'tenant id in request', kind: 'client', wide: [90, 0], tall: [70, 0], tip: 'The partition key (customer or tenant id) decides which cell serves the request.' },
      { id: 'dns', label: 'DNS', sub: 'shuffle-sharded', kind: 'edge', wide: [290, 0], tall: [210, 0], tip: 'Route 53 gives each hosted zone 4 of 2048 virtual name servers, so one zone under attack rarely overlaps fully with another.' },
      { id: 'router', label: 'Cell router', sub: 'thin, cached map', kind: 'edge', wide: [490, 0], tall: [210, 105], tip: 'The one shared layer. Keep it as simple as possible: look up tenant → cell and forward. It must keep working with a stale map.' },
      { id: 'ctrl', label: 'Control plane', sub: 'placement, scaling', kind: 'compute', wide: [890, 0], tall: [350, 0], tip: 'Creates cells, moves tenants and pushes the routing map. If it fails, the data plane keeps serving with what it has (static stability).' },
      { id: 'cellA', label: 'Cell A', sub: 'app + data, 3 AZ', kind: 'service', wide: [290, 110], tall: [70, 210], tip: 'A complete copy of the workload. No calls to other cells.' },
      { id: 'cellB', label: 'Cell B', sub: 'app + data, 3 AZ', kind: 'service', wide: [490, 110], tall: [210, 210], tip: 'A complete copy of the workload. No calls to other cells.' },
      { id: 'cellC', label: 'Cell C', sub: 'app + data, 3 AZ', kind: 'service', wide: [690, 110], tall: [350, 210], tip: 'A complete copy of the workload. No calls to other cells.' },
      { id: 'auth', label: 'Auth', sub: 'HARD dependency', kind: 'service', wide: [150, 220], tall: [70, 315], tip: 'Without auth the request cannot proceed: its availability multiplies into yours. Cache tokens or validate JWTs locally to soften it.' },
      { id: 'db', label: 'Cell database', sub: 'primary', kind: 'store', wide: [400, 220], tall: [210, 315], tip: 'Each cell has its own database, so a database failure is contained to one cell.' },
      { id: 'dbr', label: 'Standby replica', sub: 'other AZ', kind: 'store', wide: [620, 220], tall: [210, 420], tip: 'Parallel redundancy: 1 − (1 − A)² if the two fail independently. Same AZ or same bad migration breaks that assumption.' },
      { id: 'recs', label: 'Recommendations', sub: 'SOFT dependency', kind: 'service', wide: [850, 220], tall: [350, 315], tip: 'If it fails, the page renders without recommendations: it does not count against availability.' }
    ],
    edges: [
      { from: 'users', to: 'dns' },
      { from: 'dns', to: 'router' },
      { from: 'ctrl', to: 'router', dashed: true, label: 'map' },
      { from: 'router', to: 'cellA' },
      { from: 'router', to: 'cellB' },
      { from: 'router', to: 'cellC' },
      { from: 'cellB', to: 'auth' },
      { from: 'cellA', to: 'db' },
      { from: 'cellB', to: 'db' },
      { from: 'cellC', to: 'db' },
      { from: 'db', to: 'dbr', bidi: true },
      { from: 'cellB', to: 'recs', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'chain', title: 'Serial and parallel math on one request', tone: 'info',
      steps: [
        { text: 'A request passes DNS, the router, a cell, auth and the database. All are <b>hard</b>: if any fails, the request fails. That is a <b>series</b> system: A = A₁ × A₂ × … × Aₙ.', flow: ['users>dns', 'dns>router', 'router>cellB', 'cellB>auth', 'cellB>db'] },
        { text: 'With five hard hops at 99.9% each: 0.999⁵ ≈ <b>99.5%</b>, about <b>3.6 h of downtime a month</b>. The chain is always worse than its weakest link.', nodes: ['cellB', 'auth', 'db'], warn: ['cellB'], badges: { cellB: ['≈ 99.5%', 'warn'] } },
        { text: 'The database has a standby in another AZ. If each copy is 99.9% and they fail <b>independently</b>, the pair is 1 − 0.001² = <b>99.9999%</b>, ignoring failover time.', flow: ['db>dbr'], ok: ['db', 'dbr'], badges: { dbr: ['1 − (1 − A)²', 'ok'] } },
        { text: 'Recommendations is <b>soft</b>: on failure the page renders without it. Soft dependencies drop out of the product, so making a dependency soft is often the cheapest nine you can buy.', flow: ['cellB>recs'], ok: ['recs'], badges: { recs: ['not in the product', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'poison', title: 'Poison request kills a cell', tone: 'err',
      steps: [
        { text: 'A customer sends a request that triggers a crash bug. Retries spread it to every server that customer reaches.', flow: ['users>dns', 'dns>router', 'router>cellB'], err: ['cellB'], badges: { cellB: ['crash loop', 'err'] }, tone: 'err' },
        { text: 'Without cells, the same retries would hit <b>every</b> server: a 100% outage. With 3 cells, only the customers mapped to cell B are down: <b>blast radius ≈ 33%</b>.', nodes: ['cellA', 'cellC'], ok: ['cellA', 'cellC'], badges: { cellA: ['healthy', 'ok'], cellC: ['healthy', 'ok'] } },
        { text: 'With <b>shuffle sharding</b> inside the cell (each customer on 2 of 8 workers), only customers sharing <b>both</b> workers with the attacker lose everything: 1 of C(8,2) = 28 combinations.', nodes: ['cellB'], warn: ['cellB'], badges: { cellB: ['1/28 combos', 'warn'] } },
        { text: 'The router blocks the poison tenant; cell B recovers. More cells mean a smaller blast radius, but more to operate.', flow: ['router>cellB'], ok: ['cellB'], badges: { router: ['tenant blocked', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'deps', title: 'Hard vs soft dependency outage', tone: 'warn',
      steps: [
        { text: 'Auth has a 30-minute outage. It is a <b>hard</b> dependency of every cell, so all cells fail together: auth is a <b>shared fate</b> that cells do not isolate.', flow: ['cellB>auth'], err: ['auth', 'cellA', 'cellB', 'cellC'], badges: { auth: ['down 30 min', 'err'] }, tone: 'err' },
        { text: 'This is why the <b>rule of the extra 9</b> exists: a 99.99% service needs critical dependencies around 99.999%, or it has no budget left for its own failures.', nodes: ['auth'], badges: { auth: ['needs +1 nine', 'warn'] } },
        { text: 'Fix: validate signed tokens <b>locally</b> with cached keys, so auth is only needed at login. The hard dependency becomes soft for most requests.', nodes: ['cellB', 'auth'], ok: ['cellB'], badges: { cellB: ['JWT verify local', 'ok'] } },
        { text: 'Recommendations fails the same day. Pages render with a default list. Users barely notice: <b>soft dependencies do not multiply into availability</b>.', flow: ['cellB>recs'], warn: ['recs'], ok: ['cellB'], badges: { recs: ['fallback', 'warn'] }, tone: 'ok' }
      ]
    },
    {
      id: 'static', title: 'AZ lost while the control plane is down', tone: 'warn',
      steps: [
        { text: 'One AZ fails. A design that relies on <b>launching new capacity</b> now needs the control plane, the moment it is busiest or also impaired.', nodes: ['ctrl', 'db'], err: ['ctrl'], warn: ['db'], badges: { ctrl: ['impaired', 'err'] }, tone: 'warn' },
        { text: '<b>Static stability</b> (AWS Builders\' Library): each cell already runs enough capacity in the remaining AZs. Nothing has to be created; traffic just shifts.', nodes: ['cellA', 'cellB', 'cellC'], ok: ['cellA', 'cellB', 'cellC'], badges: { cellB: ['N+1 per AZ', 'ok'] } },
        { text: 'The standby database is promoted. Failover time counts against availability: the 99.9999% "parallel" number only holds if failover is fast and tested.', flow: ['dbr>db'], warn: ['dbr'], badges: { dbr: ['promoted', 'warn'] } },
        { text: 'The router keeps using its <b>cached map</b>. The control plane recovers later; nothing in the request path waited for it.', flow: ['users>dns', 'dns>router', 'router>cellA'], ok: ['router'], badges: { router: ['stale map ok', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'correlated', title: 'At scale: one config push, every cell', tone: 'err',
      steps: [
        { text: 'A bad config is pushed to <b>all cells at once</b>. The math said 3 independent cells; reality is one common cause.', flow: ['ctrl>router', ['router>cellA', 'router>cellB', 'router>cellC']], err: ['cellA', 'cellB', 'cellC'], badges: { ctrl: ['global push', 'err'] }, tone: 'err' },
        { text: 'Redundancy formulas assume independence. A <b>common-cause</b> fraction β of failures (the beta-factor model) puts a floor under unavailability: U ≥ β × u, whatever the number of copies.', nodes: ['cellA', 'cellB', 'cellC'], badges: { cellB: ['β × u floor', 'err'] } },
        { text: 'Fix: <b>deploy waves</b>. One cell first, bake, then the rest. The config push becomes a one-cell event, restoring the independence the math needs.', flow: ['ctrl>router', 'router>cellA'], warn: ['cellA'], ok: ['cellB', 'cellC'], badges: { cellA: ['canary cell', 'warn'] } },
        { text: 'Automated rollback on the canary cell\'s alarms cuts <b>MTTR</b>, which halves downtime as surely as halving the failure rate.', nodes: ['cellA'], ok: ['cellA'], badges: { cellA: ['rolled back', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'A service whose components are 99.9% each, with 4 downstream dependencies at 99.9%. Meter values follow the formulas on this page; cost and complexity are <em>illustrative</em>.',
    diagram: null,
    controls: [
      { id: 'red', label: 'Redundancy', type: 'seg', value: 'aa', options: [
        { v: 'none', l: 'None (single copy)' },
        { v: 'ap', l: 'Active-passive', hint: 'standby takes over after failover' },
        { v: 'aa', l: 'Active-active (3 AZ)', hint: 'all copies serve' },
        { v: 'cells', l: 'Cells (8 × 3 AZ)', hint: 'independent full stacks' }] },
      { id: 'dep', label: 'Dependency criticality', type: 'seg', value: 'hard', options: [
        { v: 'hard', l: 'All 4 hard' },
        { v: 'mixed', l: '1 hard, 3 soft', hint: 'fallbacks for 3' },
        { v: 'soft', l: 'All soft / async' }] },
      { id: 'shard', label: 'Tenant sharding', type: 'seg', value: 'none', options: [
        { v: 'none', l: 'None: everyone on all workers' },
        { v: 'simple', l: 'Simple: 4 shards of 2' },
        { v: 'shuffle', l: 'Shuffle: 2 of 8 per tenant' }] },
      { id: 'deploy', label: 'Deploy style', type: 'seg', value: 'global', options: [
        { v: 'global', l: 'Global push' },
        { v: 'waves', l: 'Waves (cell / AZ at a time)' }] }
    ],
    evaluate(s) {
      const a = 0.999, u = 1 - a;
      const clamp = (x) => Math.max(0, Math.min(1, x));
      // common-cause fraction: global pushes and shared regions correlate failures
      const beta = (s.deploy === 'global' ? 0.2 : 0.05) * (s.red === 'cells' ? 0.5 : 1);
      let uSvc;
      if (s.red === 'none') uSvc = u;
      else if (s.red === 'ap') uSvc = beta * u + Math.pow((1 - beta) * u, 2) + 0.0002;          // + failover gap (illustrative)
      else uSvc = beta * u + 3 * Math.pow((1 - beta) * u, 2);                                    // need 2 of 3 AZs
      const hard = { hard: 4, mixed: 1, soft: 0 }[s.dep];
      const A = (1 - uSvc) * Math.pow(a, hard);
      const downMin = (1 - A) * 730 * 60;
      const nines = -Math.log10(1 - A);
      let blast = { none: 1, simple: 0.25, shuffle: 1 / 28 }[s.shard];
      if (s.red === 'cells') blast /= 8;
      const cost = { none: 1, ap: 2, aa: 1.6, cells: 2 }[s.red] * (s.dep === 'hard' ? 1 : 1.1) * (s.shard === 'none' ? 1 : 1.05);
      const cx = clamp({ none: 0.1, ap: 0.35, aa: 0.4, cells: 0.7 }[s.red] + { hard: 0, mixed: 0.1, soft: 0.2 }[s.dep] + { none: 0, simple: 0.05, shuffle: 0.12 }[s.shard] + (s.deploy === 'waves' ? 0.05 : 0));
      const corr = s.red === 'none' ? 0.5 : clamp(beta * 3.5);
      const pct = (x) => (x * 100).toFixed(blast < 0.01 ? 2 : 1) + '%';
      const dm = downMin < 120 ? downMin.toFixed(1) + ' min' : (downMin / 60).toFixed(1) + ' h';

      const metrics = [
        { k: 'Availability', v: (A * 100).toFixed(nines > 4 ? 4 : 3) + '% (' + nines.toFixed(1) + ' nines)', s: clamp((nines - 2) / 3) },
        { k: 'Downtime / month', v: dm, s: clamp(1 - Math.log10(Math.max(downMin, 1)) / Math.log10(500)) },
        { k: 'Blast radius (one bad tenant)', v: pct(blast) + ' of customers', s: clamp(1 - Math.log10(blast * 400) / Math.log10(400)), hint: 'fully affected' },
        { k: 'Infrastructure cost', v: cost.toFixed(1) + '× baseline', s: clamp(1 - (cost - 1) / 1.5), hint: 'illustrative' },
        { k: 'Complexity', v: cx < 0.3 ? 'low' : cx < 0.55 ? 'moderate' : cx < 0.8 ? 'high' : 'very high', s: 1 - cx },
        { k: 'Correlated-failure risk', v: s.red === 'none' ? 'n/a: one copy' : 'β ≈ ' + Math.round(beta * 100) + '% common cause', s: 1 - corr, hint: 'beta-factor' }
      ];
      const notes = [];
      if (hard === 4) notes.push('Four hard dependencies at 99.9% alone cap you at 0.999⁴ ≈ <b>99.6%</b>, about 2.9 h a month, whatever your own redundancy.');
      if (s.dep === 'mixed') notes.push('Three dependencies now have fallbacks; only one 99.9% hard dependency multiplies in. By the rule of the extra 9 it should be ~99.99%.');
      if (s.red === 'ap') notes.push('Active-passive pays for a standby that serves nothing, and every failure still costs a <b>failover gap</b> (detection + promotion), shown here as an illustrative extra 0.02%.');
      if (s.red !== 'none') notes.push('With β = ' + Math.round(beta * 100) + '% of failures common to all copies, unavailability can never drop below β × 0.1% = <b>' + (beta * 0.1).toFixed(3) + '%</b>, however many replicas you add.');
      if (s.shard === 'shuffle') notes.push('C(8, 2) = 28 distinct worker pairs: a tenant that kills its 2 workers fully takes down only tenants on the same pair; 12 of the 28 pairs lose one worker and survive on the other.');
      if (s.shard === 'simple') notes.push('Simple sharding: the bad tenant takes its whole shard, so a quarter of tenants go down with it.');
      if (s.deploy === 'global') notes.push('A global push is the classic common cause: every copy gets the same bug at the same time.');

      let verdict;
      if (s.red === 'none') verdict = '❌ <b>Single copy:</b> every failure is a full outage for 100% of the time it lasts. Add redundancy before anything else.';
      else if (hard === 4 && s.red !== 'none') verdict = '⚠ <b>Redundant, but capped by dependencies:</b> four hard 99.9% calls limit you to ~99.6%. Make dependencies soft or demand an extra nine.';
      else if (s.deploy === 'global') verdict = '⚠ <b>Correlated by deploys:</b> the redundancy math assumes independence that a global push removes. Deploy in waves.';
      else if (s.red === 'cells' && s.shard === 'shuffle') verdict = '✅ <b>AWS-style isolation:</b> cells plus shuffle sharding and wave deploys. A strong answer for multi-tenant systems, at real cost and complexity.';
      else if (s.red === 'aa' || s.red === 'cells') verdict = '👍 <b>Solid:</b> active-active with soft dependencies and staged deploys. Add cells or shuffle sharding if one tenant can hurt everyone.';
      else verdict = '👍 <b>Workable:</b> active-passive is simpler but pays for idle capacity and a failover gap. Test the failover regularly.';

      return {
        metrics, verdict, notes,
        labels: {
          cellA: { label: s.red === 'cells' ? 'Cell A' : 'Replica A', sub: s.red === 'ap' ? 'active' : 'serving' },
          cellB: { label: s.red === 'cells' ? 'Cell B' : 'Replica B', sub: s.red === 'ap' ? 'passive standby' : 'serving' },
          auth: { label: 'Auth', sub: s.dep === 'soft' ? 'soft (cached JWT keys)' : 'HARD dependency' },
          recs: { label: 'Recommendations', sub: s.dep === 'hard' ? 'HARD (no fallback)' : 'SOFT dependency' },
          ctrl: { label: 'Control plane', sub: s.deploy === 'waves' ? 'deploys in waves' : 'global push' }
        },
        hide: s.red === 'none' ? ['cellA', 'cellC', 'dbr'] : s.red === 'ap' ? ['cellC'] : [],
        err: s.red === 'none' ? ['cellB'] : [],
        warn: (s.dep === 'hard' ? ['auth', 'recs'] : s.dep === 'mixed' ? ['auth'] : []).concat(s.deploy === 'global' ? ['ctrl'] : []),
        ok: s.deploy === 'waves' && s.red !== 'none' ? ['router'] : [],
        badges: { router: [pct(blast) + ' blast', blast > 0.2 ? 'err' : blast > 0.05 ? 'warn' : 'ok'], cellB: [(A * 100).toFixed(3) + '%', nines >= 3 ? 'ok' : 'warn'] },
        flow: ['users>dns', 'dns>router', s.red === 'none' ? 'router>cellB' : ['router>cellA', 'router>cellB'], 'cellB>auth', 'cellB>db'].concat(s.red === 'none' ? [] : ['db>dbr'])
      };
    }
  },

  widget: {
    title: 'Reliability block diagram + shuffle-sharding lab',
    caption: 'Top: pick a preset or edit each stage (availability, replicas, and how many must be up: <b>k of n</b>). Stages are in <b>series</b>, replicas in <b>parallel</b>; the composite updates live, with an optional <b>common-cause β</b> that shows how correlation erodes redundancy. Bottom: one noisy tenant kills its workers. Compare how many tenants lose <b>all</b> their workers with <b>simple</b> vs <b>shuffle</b> sharding.'
  },

  realWorld: {
    intro: 'The math is old reliability engineering; the useful additions are Google\'s dependency rule and AWS\'s isolation patterns. Numbers below are quoted from the sources.',
    timeline: [
      { when: '2016', who: 'Google (SRE book)', title: 'The availability table', text: 'The SRE book\'s appendix lists allowed downtime per year, quarter, month, week and day for each level, assuming no planned downtime, and "Embracing Risk" argues that each extra nine costs far more than the last.', src: 0 },
      { when: '2014', who: 'AWS (Route 53)', title: 'Shuffle sharding at Route 53', text: 'Colm MacCárthaigh describes giving each hosted zone <b>4 of 2048 virtual name servers</b>. That is about <b>730 billion</b> combinations, so a DDoS against one zone rarely takes out all name servers of another.', src: 2 },
      { when: '2017', who: 'Google (ACM Queue)', title: 'The Calculus of Service Availability', text: 'Treynor, Dahlin, Rau and Beyer: a service cannot be more available than the intersection of its critical dependencies, so each should offer about <b>one more nine</b> ("rule of the extra 9"). 99.99% leaves about <b>53 minutes a year</b>, which dependencies alone can use up.', src: 1 },
      { when: 'Builders\' Library', who: 'AWS (Colm MacCárthaigh)', title: 'Workload isolation using shuffle-sharding', text: 'Explains why simple sharding still loses a whole shard to one bad customer, and how giving each customer its own combination of workers shrinks the overlap (e.g. 8 workers in pairs gives C(8, 2) = <b>28</b> combinations: our arithmetic). The client must retry across its workers.', src: 3 },
      { when: 'Builders\' Library', who: 'AWS', title: 'Static stability using Availability Zones', text: 'The article explains why EC2 pre-provisions capacity across AZs so the <b>data plane keeps working</b> without control-plane actions when a zone fails, instead of reacting by launching new capacity.', src: 4 },
      { when: '2023', who: 'AWS (whitepaper)', title: 'Reducing the Scope of Impact with Cell-Based Architecture', text: 'A <b>cell</b> is a complete, independent instance of the workload; a thin router sends each customer to one cell by partition key. Cells limit how many customers a failure reaches and let deployments roll out <b>one cell at a time</b>.', src: 5 },
      { when: '2023–24', who: 'Slack', title: 'Migration to a cellular architecture', text: 'After availability-zone incidents leaked into user-visible outages, Slack moved critical services to <b>AZ-scoped cells</b> so traffic can be drained away from a failing zone.', src: 6 },
      { when: '2020s', who: 'Grafana Labs', title: 'Shuffle sharding in Cortex / Mimir', text: 'Multi-tenant Prometheus backends give each tenant its own subset of ingesters and queriers, so one tenant\'s overload does not take down others.', src: 7 }
    ],
    lessons: [
      'Translate every nine into <b>minutes</b>; then subtract what your dependencies will spend.',
      'Make dependencies <b>soft</b> before you buy more replicas.',
      'Redundancy only works if failures are <b>independent</b>: separate AZs, cells and deploy waves.',
      'Measure <b>MTTD and MTTR</b>; faster repair is often the cheapest availability.',
      'Isolate tenants: <b>cells</b> for blast radius, <b>shuffle sharding</b> for noisy neighbours.'
    ],
    sources: [
      { title: 'Appendix A - Availability Table', url: 'https://sre.google/sre-book/availability-table/', pub: 'Google, Site Reliability Engineering (2016)' },
      { title: 'The Calculus of Service Availability', url: 'https://queue.acm.org/detail.cfm?id=3096459', pub: 'Treynor, Dahlin, Rau, Beyer. ACM Queue 15(2), 2017' },
      { title: 'Shuffle Sharding: Massive and Magical Fault Isolation', url: 'https://aws.amazon.com/blogs/architecture/shuffle-sharding-massive-and-magical-fault-isolation', pub: 'AWS Architecture Blog, 2014' },
      { title: 'Workload isolation using shuffle-sharding', url: 'https://aws.amazon.com/builders-library/workload-isolation-using-shuffle-sharding', pub: 'Amazon Builders\' Library (Colm MacCárthaigh)' },
      { title: 'Static stability using Availability Zones', url: 'https://aws.amazon.com/builders-library/static-stability-using-availability-zones', pub: 'Amazon Builders\' Library' },
      { title: 'Reducing the Scope of Impact with Cell-Based Architecture', url: 'https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/reducing-scope-of-impact-with-cell-based-architecture.html', pub: 'AWS whitepaper, 2023' },
      { title: 'Slack\'s Migration to a Cellular Architecture', url: 'https://slack.engineering/slacks-migration-to-a-cellular-architecture/', pub: 'Slack Engineering' },
      { title: 'How shuffle sharding in Cortex leads to better scalability and more isolation', url: 'https://grafana.com/blog/how-shuffle-sharding-in-cortex-leads-to-better-scalability-and-more-isolation-for-prometheus/', pub: 'Grafana Labs blog' },
      { title: 'Chapter 3 - Embracing Risk', url: 'https://sre.google/sre-book/embracing-risk/', pub: 'Google, Site Reliability Engineering (2016)' }
    ]
  },

  tradeoffs: {
    headers: ['Approach', 'Availability gain', 'Blast radius', 'Cost', 'Main catch'],
    rows: [
      ['<b>Active-passive</b>', '1 − (1 − A)² minus failover gap', '100% during failover', '2× (idle standby)', 'Failover is rarely tested and often slow'],
      ['<b>Active-active (N+1 over 3 AZ)</b>', '2-of-3: ≈ 1 − 3u²', '100% if a bug hits all copies', '~1.5× (static stability headroom)', 'Correlated failures: same code, same config'],
      ['<b>Cells</b>', 'Per-cell like active-active', '≈ 1/N of customers', 'Router + per-cell overhead', 'Shared dependencies (auth, DNS) still global'],
      ['<b>Shuffle sharding</b>', 'Same fleet, better isolation', '≈ 1 / C(n, k) fully affected', 'Little extra hardware', 'Needs retrying clients and a tenant key'],
      ['<b>Soft dependencies</b>', 'Removes Aᵢ from the product', 'Degraded, not down', 'Fallback code + cache', 'Fallbacks rot unless exercised'],
      ['<b>Faster MTTR</b>', 'Halve MTTR ≈ halve downtime', 'Same, but shorter', 'Tooling, automation, drills', 'Hard to improve detection without good SLIs']
    ]
  },

  failures: [
    { f: '<b>Hidden shared fate</b>: "redundant" replicas share a region, a database, a DNS provider or a config service', detect: 'Dependency graph review; chaos experiments that kill the shared component; postmortems where "both" failed', fix: 'Separate AZs or cells, remove global singletons, make the shared piece statically stable' },
    { f: '<b>Correlated deploys</b>: one push breaks every copy', detect: 'Incidents starting within minutes of a deploy across all cells', fix: 'Wave deploys (one cell / AZ first, bake time), automated rollback on canary alarms' },
    { f: '<b>SLO above the dependency ceiling</b>', detect: 'Composite math: product of hard dependency SLOs &lt; your target', fix: 'Rule of the extra 9, soft dependencies, caching, or lower the promise' },
    { f: '<b>Failover that needs the control plane</b>', detect: 'Game day: disable scaling and control APIs, then fail an AZ', fix: 'Pre-provision capacity (static stability); keep routing data cached in the data plane' },
    { f: '<b>Retry storms across shards</b>: clients retry onto healthy workers and overload them too', detect: 'Healthy shards\' load spikes during a single-tenant incident', fix: 'Retry budgets, backoff with jitter, per-tenant rate limits' },
    { f: '<b>Slow detection</b> dominates MTTR', detect: 'MTTD is a large share of MTTR in the incident table', fix: 'Burn-rate alerts on user-facing SLIs; synthetic probes per cell' }
  ],

  interview: [
    { q: 'What does 99.9% mean in downtime, and why does each nine matter?', a: '<p>Unavailability = 1 − A. Per year (8,760 h) / month (730 h) / day:</p><ul><li><b>99%</b>: 3.65 days / 7.3 h / 14.4 min</li><li><b>99.9%</b>: 8.76 h / 43.8 min / 1.44 min</li><li><b>99.99%</b>: 52.6 min / 4.4 min / 8.6 s</li><li><b>99.999%</b>: 5.3 min / 26 s / 0.86 s</li></ul><p>Each nine is 10× less downtime. At four nines, one manual page-and-fix incident can use the whole month, so you need automated detection and rollback.</p>', lvl: 'core' },
    { q: 'How do you compute the availability of services in series and in parallel?', a: '<p><b>Series</b> (all needed): A = Π Aᵢ. Five 99.9% hops ≈ 99.5%.</p><p><b>Parallel</b> (any one is enough): A = 1 − Π(1 − Aᵢ). Two 99% copies = 99.99%.</p><p><b>k-of-n</b>: A = Σᵢ₌ₖⁿ C(n, i) aⁱ (1 − a)ⁿ⁻ⁱ. A 2-of-3 quorum of 99% nodes ≈ 99.97%.</p><p>All three assume <b>independent</b> failures; say that out loud.</p>', lvl: 'core' },
    { q: 'Explain availability = MTBF / (MTBF + MTTR). What follows from it?', a: '<p>Over a long run, a component alternates between up (mean MTBF) and down (mean MTTR). Its availability is the up fraction. For small MTTR, unavailability ≈ MTTR / MTBF.</p><p>So <b>halving MTTR halves downtime</b>, exactly like doubling MTBF. Repair is usually cheaper to improve: better alerts (MTTD), faster paging (MTTA), automated rollback (MTTR).</p>', fu: 'Break MTTR into MTTD + MTTA + time to mitigate; which one do you attack first?', lvl: 'core' },
    { q: 'What is the "rule of the extra 9"?', a: '<p>From Treynor, Dahlin, Rau and Beyer, "The Calculus of Service Availability" (ACM Queue, 2017): a service cannot be more available than the intersection of its critical dependencies, so each critical dependency should be about <b>one nine better</b> than the service (99.99% service → 99.999% dependencies).</p><p>Misreading: it is not a law of nature; it is a budgeting rule. If a dependency cannot meet it, you make it non-critical (cache, fallback, async), add redundancy, or lower your promise.</p>', lvl: 'core' },
    { q: 'Why do redundancy formulas overstate real availability?', a: '<p>They assume independent failures. Real outages are often <b>common-cause</b>: the same deploy, config, region, certificate expiry or poison request hits every copy.</p><p>The <b>beta-factor model</b> from safety engineering captures this: a fraction β of failures hits all copies, so U ≥ β·u however many copies you add. With β = 10% and u = 0.1%, two replicas give ~99.99%, not 99.9999%.</p><p>The architect\'s job is to lower β: separate AZs, cells, staged deploys, diverse dependencies.</p>', lvl: 'deep' },
    { q: 'What is a cell-based architecture and what does it cost?', a: '<p>AWS\'s whitepaper defines a <b>cell</b> as a complete, independent instance of the workload serving a subset of customers, chosen by a partition key through a thin router. A failure or bad deploy is contained to one cell (blast radius ≈ 1/N).</p><p>Costs: a routing layer that must be extremely simple; per-cell overhead; tenant migration between cells; cross-cell features (global search, reporting) become harder. Shared dependencies like auth stay global unless you cell them too.</p>', lvl: 'core' },
    { q: 'Explain shuffle sharding with the numbers.', a: '<p>Instead of splitting n workers into fixed shards, give each customer a <b>random combination of k workers</b>. With n = 8, k = 2 there are C(8, 2) = 28 combinations, versus 4 fixed shards.</p><p>If a poison customer kills its 2 workers, only customers on the <b>same pair</b> lose everything (~1/28). Others overlap on at most one worker and keep working <b>if their client retries</b> on the other. Route 53 uses n = 2048, k = 4: about 730 billion combinations.</p>', fu: 'Why does shuffle sharding require a fault-tolerant client?', lvl: 'deep' },
    { q: 'What is static stability?', a: '<p>From the AWS Builders\' Library: a system is statically stable if it keeps working during an impairment <b>without needing to change</b>: no new instances, no control-plane calls, no config pushes.</p><p>In practice: pre-provision enough capacity to lose an AZ (e.g. 3 AZs at 50% each), cache routing data in the data plane, and avoid failover paths that depend on the control plane that may be failing too.</p>', lvl: 'core' },
    { q: 'Your checkout must hit 99.95%. It has 4 hard dependencies at 99.9%. What do you do?', a: '<p>Math first: 0.999⁴ ≈ 99.6% before any own failures, so <b>the target is impossible as designed</b>.</p><ul><li>Make dependencies <b>soft</b>: cache prices, queue the payment capture, validate tokens locally.</li><li>Ask for an <b>extra nine</b> on the ones that must stay hard, or run them redundantly.</li><li>Add timeouts and retries with budgets so a slow dependency does not become your outage.</li></ul><p>If none is possible, lower the SLO and say why: an honest number beats a broken promise.</p>', lvl: 'deep' },
    { q: 'Active-passive or active-active?', a: '<p><b>Active-passive</b>: simpler data consistency, but pays for idle capacity and every failure costs a failover gap; standby paths rot unless exercised.</p><p><b>Active-active</b>: all copies take traffic, so failures are continuously tested and capacity is used; you need headroom for losing one (N+1) and a data model that tolerates multiple writers or a single-writer database underneath.</p><p>I default to active-active stateless tiers over a single-writer database with a tested automated failover.</p>', lvl: 'core' },
    { q: 'How would you measure MTTD, MTTA and MTTR, and which numbers do you report?', a: '<p>Record four timestamps per incident: <b>started</b> (first bad SLI minute), <b>detected</b> (alert), <b>acknowledged</b>, <b>resolved</b> (SLI back in range). MTTD = detected − started, MTTA = acked − detected, MTTR = resolved − started.</p><p>Report medians and p90 per quarter, not just means: one long incident skews the mean. Pair with incident count, because MTTR alone rewards splitting incidents.</p>', lvl: 'deep' },
    { q: 'How would you convince leadership to fund cells?', a: '<p>Turn it into numbers they already use: today one bad deploy or tenant affects <b>100%</b> of customers; with 8 cells, ≈ 12.5%. Multiply by incident history: "last year\'s three global outages would have been three 12% outages."</p><p>Show the cost honestly (router, per-cell overhead, migration work), propose a staged start (cells for the most critical service only), and define success: blast radius per incident and deploys contained to the canary cell.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Python: series, parallel, k-of-n and nines', lang: 'python',
      code: `from math import comb, log10, prod

def series(*a: float) -> float:
    """All components needed: availabilities multiply."""
    return prod(a)

def parallel(*a: float) -> float:
    """Any one copy is enough: unavailabilities multiply."""
    return 1 - prod(1 - x for x in a)

def k_of_n(a: float, k: int, n: int) -> float:
    """At least k of n identical, independent replicas must be up."""
    return sum(comb(n, i) * a**i * (1 - a)**(n - i) for i in range(k, n + 1))

def from_mtbf(mtbf_h: float, mttr_h: float) -> float:
    return mtbf_h / (mtbf_h + mttr_h)

def downtime_per_month_min(a: float) -> float:
    return (1 - a) * 730 * 60          # 730 h = average month

def nines(a: float) -> float:
    return -log10(1 - a)

if __name__ == "__main__":
    db = k_of_n(0.999, k=2, n=3)                   # quorum of 3
    web = parallel(0.999, 0.999, 0.999)
    chain = series(0.9999, web, db, 0.999)         # LB, web, db, auth
    print(f"db 2-of-3 = {db:.7f}")
    print(f"chain = {chain:.5%}, {nines(chain):.2f} nines, "
          f"{downtime_per_month_min(chain):.1f} min/month")
    print(f"halve MTTR: {from_mtbf(720, 1):.5%} -> {from_mtbf(720, 0.5):.5%}")`,
      note: 'Every function assumes independent failures. To model common-cause failures, add a β·u term to the unavailability of each redundant group.'
    },
    {
      title: 'Java 21: deterministic shuffle-shard assignment', lang: 'java',
      code: `import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.SplittableRandom;

/** Assigns each tenant k of n workers, stable across restarts and hosts. */
public record ShuffleSharder(int workers, int shardSize, String salt) {

    public ShuffleSharder {
        if (shardSize < 1 || shardSize > workers) throw new IllegalArgumentException("bad k");
    }

    public int[] shardFor(String tenantId) {
        var rnd = new SplittableRandom(seed(salt + ":" + tenantId));
        int[] pool = new int[workers];
        Arrays.setAll(pool, i -> i);
        // partial Fisher-Yates: the first k slots become a uniform random k-subset
        for (int i = 0; i < shardSize; i++) {
            int j = i + rnd.nextInt(workers - i);
            int t = pool[i]; pool[i] = pool[j]; pool[j] = t;
        }
        int[] shard = Arrays.copyOf(pool, shardSize);
        Arrays.sort(shard);
        return shard;
    }

    private static long seed(String key) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256")
                    .digest(key.getBytes(StandardCharsets.UTF_8));
            long s = 0;
            for (int i = 0; i < 8; i++) s = (s << 8) | (h[i] & 0xff);
            return s;
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
// new ShuffleSharder(8, 2, "v1").shardFor("tenant-42") -> e.g. [3, 6]`,
      note: 'SplittableRandom\'s algorithm is specified, so the same seed gives the same shard on every JVM. Changing the salt or n reshuffles everyone; to add workers without mass movement, store assignments or use rendezvous hashing per slot.'
    },
    {
      title: 'Postgres: MTTD, MTTA, MTTR per service per quarter', lang: 'sql',
      code: `SELECT service,
       date_trunc('quarter', started_at)                     AS quarter,
       count(*)                                              AS incidents,
       avg(detected_at - started_at)                         AS mttd,
       avg(acked_at    - detected_at)                        AS mtta,
       avg(resolved_at - started_at)                         AS mttr,
       percentile_cont(0.5) WITHIN GROUP
         (ORDER BY extract(epoch FROM resolved_at - started_at)) / 60
                                                             AS mttr_p50_min,
       percentile_cont(0.9) WITHIN GROUP
         (ORDER BY extract(epoch FROM resolved_at - started_at)) / 60
                                                             AS mttr_p90_min,
       sum(extract(epoch FROM resolved_at - started_at)) / 60
                                                             AS downtime_min,
       avg(cells_affected)                                   AS avg_cells_hit
FROM incident
WHERE resolved_at IS NOT NULL
GROUP BY service, date_trunc('quarter', started_at)
ORDER BY quarter DESC, downtime_min DESC;`,
      note: 'Averaging intervals returns an interval in Postgres. Report the percentiles too: one long incident distorts the mean.'
    }
  ],

  related: ['slo-error-budgets', 'disaster-recovery', 'resiliency-patterns', 'chaos-engineering', 'cap-pacelc', 'sd:cdn', 'sd:object-storage']
});
