SD.register({
  slug: 'architectural-styles',
  domain: 2,
  title: 'Architectural Styles',
  examples: 'Spring Modulith, Shopify, Prime Video',
  tagline: 'Layered, hexagonal, modular monolith, microservices, serverless, event-driven. Each style <b>buys some quality attributes and charges you for others</b>. Pick by what you must optimise, not by fashion.',
  tldr: {
    problem: 'Every system needs a shape: where the boundaries are, what runs in one process, and how the parts talk. The wrong shape makes every feature slow to build, slow to run or painful to operate.',
    idea: 'Choose the style from the <b>quality attributes</b> you must hit (deployability, scalability, team autonomy, latency, operability, cost). Start with <b>strong boundaries inside one deployable</b> (hexagonal modules in a modular monolith). <b>Distribute only the parts</b> where a measured need outweighs the network tax.',
    insight: 'Boundaries matter more than deployment units. Microservices with a shared database and synchronous chains are a <b>distributed monolith</b>: all of the cost and none of the independence. A well-cut modular monolith is easy to split later. A badly cut set of services is hard to merge back.',
    numbers: [
      { v: '99.9⁵ ≈ 99.5 %', l: 'five synchronous dependencies at three nines each (arithmetic)' },
      { v: '> 90 %', l: 'infra cost cut when Prime Video moved a monitoring tool into one process (2023)' },
      { v: '~2,200', l: 'critical microservices at Uber when it introduced DOMA (2020)' }
    ]
  },

  intro: {
    what: 'An <b>architectural style</b> is the overall shape of a system: how code is split into parts, which parts run together in one process, and how they talk to each other. Examples are a layered app, a modular monolith, microservices, serverless functions and event-driven systems. Each one makes some things easy and other things expensive.',
    analogy: {
      icon: '🏠',
      title: 'One house with rooms vs a street of separate houses',
      text: 'A <b>modular monolith</b> is one house with well-built rooms: one roof, one front door, one set of pipes, and walls that stop you wandering into the bedroom from the kitchen. <b>Microservices</b> are a street of separate houses: each family can renovate on its own schedule, but every visit means going outside, and each house needs its own roof, boiler and alarm. A house with no inner walls is a <b>big ball of mud</b>. A street where every house shares one boiler is a <b>distributed monolith</b>. The analogy breaks in one place: moving a wall in software is cheap only if the walls were real to begin with.'
    },
    problem: 'A team of 40 adds "loyalty points at checkout". In a tangled codebase the change touches files owned by five teams, and nobody is sure what else breaks. In a badly split microservice system the same change needs three services deployed in the right order, and checkout now waits on one more network call. <b>Which shape lets this team ship this change quickly, run it reliably and pay a sensible bill?</b>',
    story: [
      {
        stage: 'naive',
        title: 'One app, no inner walls',
        text: 'Everything lives in one codebase with one database. Any class may call any other class or read any table. It is fast to start, and every team just "adds a bit" wherever it is convenient.',
        scene: {
          nodes: [
            { id: 'a', label: 'Cart team', sub: 'edits anything', kind: 'team', at: [70, 0] },
            { id: 'b', label: 'Loyalty team', sub: 'edits anything', kind: 'team', at: [350, 0] },
            { id: 'app', label: 'Shop app', sub: 'one codebase', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'One database', sub: 'every table', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'a', to: 'app' }, { from: 'b', to: 'app' }, { from: 'app', to: 'db' }],
          flow: [['a>app', 'b>app'], 'app>db']
        }
      },
      {
        stage: 'breaks',
        title: 'Split into services, but still tangled',
        text: 'The team splits the app into services, yet they still <b>share one database</b> and call each other synchronously. A schema change forces every service to deploy together, and when Loyalty is slow, Checkout times out. This is a <b>distributed monolith</b>.',
        scene: {
          nodes: [
            { id: 'a', label: 'Cart team', sub: 'waits on others', kind: 'team', at: [70, 0] },
            { id: 'b', label: 'Loyalty team', sub: 'waits on others', kind: 'team', at: [350, 0] },
            { id: 's1', label: 'Checkout svc', sub: 'sync call', kind: 'service', at: [70, 110] },
            { id: 's2', label: 'Loyalty svc', sub: 'slow', kind: 'service', at: [210, 110] },
            { id: 's3', label: 'Orders svc', sub: 'sync call', kind: 'service', at: [350, 110] },
            { id: 'db', label: 'Shared DB', sub: 'one schema', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'a', to: 's1' }, { from: 'b', to: 's2' }, { from: 's1', to: 's2' }, { from: 's2', to: 's3' }, { from: 's1', to: 'db' }, { from: 's2', to: 'db' }, { from: 's3', to: 'db' }],
          flow: ['s1>s2', 's2>s3', ['s1>db', 's2>db', 's3>db']],
          err: ['db'], warn: ['s1', 's2'],
          badges: { db: ['lockstep deploy', 'err'], s1: ['timeout', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Real walls first, separate houses later',
        text: 'Cut the code into <b>modules by business capability</b>, each with its own tables and a small public API. Modules talk through that API or through <b>events</b>, and a test fails the build if anyone sneaks past a wall. Extract a module into a service only when it needs its own scaling, release cadence or failure isolation.',
        scene: {
          nodes: [
            { id: 'a', label: 'Cart team', sub: 'owns checkout', kind: 'team', at: [70, 0] },
            { id: 'b', label: 'Loyalty team', sub: 'owns loyalty', kind: 'team', at: [350, 0] },
            { id: 's1', label: 'checkout mod', sub: 'public API', kind: 'service', at: [70, 110] },
            { id: 'ev', label: 'OrderPlaced', sub: 'in-process event', kind: 'queue', at: [210, 110] },
            { id: 's2', label: 'loyalty mod', sub: 'own tables', kind: 'service', at: [350, 110] },
            { id: 'db', label: 'One database', sub: 'schema per module', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'a', to: 's1' }, { from: 'b', to: 's2' }, { from: 's1', to: 'ev' }, { from: 'ev', to: 's2' }, { from: 's1', to: 'db' }, { from: 's2', to: 'db' }],
          flow: ['a>s1', 's1>ev', 'ev>s2'],
          ok: ['s1', 's2'],
          badges: { ev: ['1 deploy', 'ok'] }
        }
      }
    ],
    usedBy: ['Shopify (modular monolith)', 'Amazon Prime Video', 'Uber (domain-oriented microservices)', 'Segment / Twilio', 'Spring Modulith users', 'Netflix (microservices)'],
    whenToUse: [
      'You are starting a product or a new domain: begin with a <b>modular monolith</b> and hexagonal modules',
      'Several teams need to <b>release independently</b> and parts of the system scale very differently: extract those parts as services',
      'Work is <b>spiky or naturally event-shaped</b> (uploads, webhooks, nightly jobs): serverless functions or event consumers fit well'
    ],
    whenNot: [
      'Do not pick microservices for a team of five because big companies use them. Each one brings its own pipelines, on-call and network failures',
      'Do not split services along technical layers (UI service, logic service, data service). Split by business capability (see <a href="ddd.html">Domain-Driven Design</a>)',
      'Do not rewrite a working monolith in one go. Peel parts off gradually (see <a href="strangler-fig.html">Strangler Fig</a>)'
    ],
    glossary: [
      { term: 'Architectural style', def: 'A named, reusable shape for a whole system, with known strengths and costs (layered, microservices, event-driven…).' },
      { term: 'Quality attribute', def: 'A measurable "how well" property such as latency, availability, deployability or cost. Styles are chosen to hit these.' },
      { term: 'Modular monolith', def: 'One deployable application split into modules with enforced boundaries, each owning its data and exposing a small API.' },
      { term: 'Hexagonal architecture', def: 'Alistair Cockburn\'s "ports and adapters": business logic in the centre, talking to the outside world only through interfaces (ports) implemented by adapters.' },
      { term: 'Microservice', def: 'A small service around one business capability, running in its own process, deployed independently and owning its own data.' },
      { term: 'Distributed monolith', def: 'Services that look separate but must be changed and deployed together, usually because of a shared database or tight synchronous calls.' },
      { term: 'Serverless / FaaS', def: 'Functions as a Service: you upload functions, the cloud runs and scales them per event, and you pay per invocation.' },
      { term: 'Fitness function', def: 'An automated test of an architectural rule, such as "no module reads another module\'s internals", that runs in CI.' }
    ]
  },

  requirements: {
    functional: [
      'Choose the style from the <b>quality attributes</b> you must hit, ranked, not from what is fashionable',
      'Draw boundaries around <b>business capabilities</b> (bounded contexts), not technical layers',
      '<b>Dependencies point inward</b>: domain code knows nothing of web frameworks, ORMs or brokers (hexagonal / clean / onion)',
      'Each module or service <b>owns its data</b>; others use its API or its events, never its tables',
      'Make boundaries <b>executable</b>: verify them in CI (Spring Modulith, ArchUnit, Packwerk)',
      '<b>Distribute on evidence</b>: split a part out only when independent scaling, release cadence, team autonomy or fault isolation clearly pays for the network'
    ],
    nonFunctional: [
      '<b>Deployability</b>: a team ships its change without a cross-team release train (target: most deploys touch one unit)',
      '<b>Latency</b>: ≤ 2–3 synchronous network hops on the user path, each with a budget (rule of thumb)',
      '<b>Availability</b>: composite of all sync dependencies ≥ the SLO (5 × 99.9 % ≈ 99.5 %)',
      '<b>Team autonomy</b>: most changes touch one module and one team (track it from commits)',
      '<b>Operability</b>: on-call can trace any request end to end; one dashboard per deploy unit',
      '<b>Cost</b>: infra + platform people per request is tracked; steady load is not on per-invocation pricing'
    ],
    outOfScope: [
      '<b>Big ball of mud</b>: no enforced boundaries, everything calls everything',
      '<b>Distributed monolith</b>: services that share a database or deploy in lockstep',
      '<b>Nano-services</b>: one service or function per CRUD operation, chained synchronously',
      '<b>Sinkhole layers</b>: layers that only pass calls through without adding logic',
      '<b>Résumé-driven architecture</b>: microservices or Kubernetes for a team of five'
    ]
  },

  calculator: {
    inputs: [
      { id: 'svc', label: 'Deployable services (or functions)', min: 1, max: 300, value: 40, log: true },
      { id: 'hops', label: 'Synchronous calls in sequence on one request', min: 0, max: 20, value: 6 },
      { id: 'lat', label: 'Cost per network hop (network + serialise + TLS)', min: 0.5, max: 20, step: 0.5, value: 2, unit: 'ms' },
      { id: 'bp', label: 'Per-hop unavailability, basis points (10 = 99.9 % up)', min: 1, max: 100, value: 10, unit: 'bp' },
      { id: 'teams', label: 'Teams', min: 1, max: 60, value: 8 },
      { id: 'dep', label: 'Avg services each one calls', min: 1, max: 10, value: 3 }
    ],
    outputs: [
      { label: 'Added latency from hops (in sequence)', fmt: 'ms', f: (v) => v.hops * v.lat },
      { label: 'End-to-end availability (product of all hops + entry)', f: (v) => (Math.pow(1 - v.bp / 1e4, v.hops + 1) * 100).toFixed(3) + ' %' },
      { label: 'Expected downtime per 30 days', fmt: 'ms', f: (v) => (1 - Math.pow(1 - v.bp / 1e4, v.hops + 1)) * 30 * 86400 * 1000 },
      { label: 'Deploy units per team (each with pipeline, dashboards, on-call)', f: (v) => Math.round(v.svc / v.teams * 10) / 10 },
      { label: 'Service-to-service contracts to keep green', f: (v) => Math.min(v.svc * (v.svc - 1), v.svc * Math.min(v.dep, Math.max(0, v.svc - 1))) },
      { label: 'Contracts that cross a team boundary (≈)', f: (v) => Math.round(Math.min(v.svc * (v.svc - 1), v.svc * Math.min(v.dep, Math.max(0, v.svc - 1))) * (v.teams > 1 ? 1 - 1 / v.teams : 0)) }
    ],
    note: 'Availability multiplies: a request that needs <b>all</b> of N sync hops is up only when every hop is up, so A = a<sup>N</sup>. Set hops to 0 to model a monolith (only the entry point counts). The per-hop cost and "calls per service" are <em>rules of thumb</em>; a modular monolith pays nanoseconds per in-process call, not milliseconds. Cross-team contracts assume callers pick targets at random across teams (<em>estimate</em>); a good domain split keeps most calls inside a team.'
  },

  api: [
    { m: 'ADR', p: 'ADR-007: Modular monolith first, extract on evidence', d: 'Context (team size, load profile, release cadence), the ranked <b>quality attributes</b>, options considered (layered, modular monolith, microservices, serverless), decision, and the <b>revisit triggers</b> that would make you extract a service.' },
    { m: 'POLICY', p: 'Module boundary rules', d: 'Which module may depend on which, what each module exposes (its API package or <i>named interfaces</i>), and "no cycles". Enforced by <code>ApplicationModules.verify()</code>, ArchUnit or Packwerk in CI.' },
    { m: 'EVENT', p: 'OrderPlaced v1 (orders module API)', d: 'Published contract: <code>{orderId, customerId, total, placedAt}</code>. Additive changes only; a breaking change gets a new version and a deprecation window. Lets loyalty and shipping react without checkout knowing they exist.' },
    { m: 'YAML', p: 'Service catalogue entry', d: 'Owner team, tier, SLO, sync and async dependencies, data owned, on-call rota, runbook. Required for every deploy unit before it gets production traffic.' },
    { m: 'DOC', p: 'Extraction checklist', d: 'Evidence the module needs its own deploy unit: different scaling curve, different release cadence, separate team, isolation need. Plus: is its data already separate? Are its callers already using events or its API only?' },
    { m: 'SLO', p: 'Latency and availability budget per hop', d: 'User-path p99 budget split across hops, e.g. 300 ms total → gateway 20, checkout 80, each dependency ≤ 40, with timeouts set below the budget and retries counted.' }
  ],

  dataModel: [
    { name: 'module_catalog', store: 'Postgres / repo YAML', fields: [['module', 'text', 'pk'], ['owner_team', 'text', 'idx'], ['style', 'enum (module|service|function)'], ['public_api', 'text[]'], ['allowed_deps', 'text[]'], ['extraction_candidate', 'bool']], note: 'One row per module or service. Drives the dependency rules and the service catalogue.' },
    { name: 'dependency_edge', store: 'Postgres (from CI scan)', fields: [['from_module', 'text', 'pk'], ['to_module', 'text', 'pk'], ['kind', 'enum (call|event|table)', 'pk'], ['count', 'int'], ['violation', 'bool', 'idx'], ['scanned_at', 'timestamptz']], note: 'Rebuilt on every build. A <code>table</code> edge between two modules is the early warning of a distributed monolith.' },
    { name: 'event_publication', store: 'Spring Modulith registry', fields: [['id', 'uuid', 'pk'], ['listener_id', 'text', 'idx'], ['event_type', 'text'], ['serialized_event', 'text'], ['publication_date', 'timestamptz'], ['completion_date', 'timestamptz', 'idx']], note: 'Spring Modulith writes each event-to-listener publication in the same transaction as the business change and marks it complete when the listener succeeds, so incomplete ones can be retried.' },
    { name: 'style_decision', store: 'ADR log (git)', fields: [['adr_id', 'text', 'pk'], ['scope', 'text'], ['drivers', 'text[] (quality attributes)'], ['decision', 'text'], ['status', 'enum'], ['revisit_when', 'text']], note: 'Keeps the "why" next to the code, so the next architect knows what would change the answer.' }
  ],

  architecture: {
    title: 'One checkout, many possible shapes',
    nodes: [
      { id: 'user', label: 'Shopper', sub: 'web / app', kind: 'client', wide: [90, 220], tall: [70, 0], tip: 'Places an order. Sees one product, whatever the internal style.' },
      { id: 'gw', label: 'API / web layer', sub: 'gateway or controller', kind: 'edge', wide: [280, 220], tall: [210, 0], tip: 'In a monolith this is the controller layer (a driving adapter). With services it is an API gateway or BFF.' },
      { id: 'ci', label: 'Deploy pipeline', sub: 'build · verify · ship', kind: 'policy', wide: [90, 440], tall: [350, 0], tip: 'Runs the architecture fitness functions (module verification, ArchUnit) and decides what ships together.' },
      { id: 'chk', label: 'Checkout', sub: 'module or service', kind: 'service', wide: [470, 220], tall: [210, 110], tip: 'Orchestrates the order: reserve stock, take payment, create the order. Owned by the checkout team.' },
      { id: 'loy', label: 'Loyalty', sub: 'points ledger', kind: 'service', wide: [850, 330], tall: [70, 110], tip: 'The new capability. Can be called synchronously by checkout or react to OrderPlaced events.' },
      { id: 'ord', label: 'Orders', sub: 'owns order data', kind: 'service', wide: [470, 330], tall: [350, 110], tip: 'Owns the order record and publishes OrderPlaced.' },
      { id: 'pay', label: 'Payments', sub: 'PSP integration', kind: 'service', wide: [660, 110], tall: [70, 220], tip: 'Talks to the payment provider through a driven adapter.' },
      { id: 'inv', label: 'Inventory', sub: 'stock reservations', kind: 'service', wide: [660, 220], tall: [210, 220], tip: 'Reserves stock. Scales very differently from loyalty during a sale.' },
      { id: 'bus', label: 'Event bus', sub: 'in-process or Kafka', kind: 'queue', wide: [660, 440], tall: [350, 220], tip: 'In a modular monolith this can be Spring application events with a publication log; across services it is a broker such as Kafka.' },
      { id: 'db', label: 'Database(s)', sub: 'shared or per owner', kind: 'store', wide: [850, 165], tall: [210, 330], tip: 'One database with a schema per module, or one database per service. Sharing tables across owners is the main cause of distributed monoliths.' },
      { id: 'ship', label: 'Shipping', sub: 'reacts to orders', kind: 'service', wide: [850, 440], tall: [350, 330], tip: 'Another consumer of OrderPlaced. Added without changing checkout.' }
    ],
    edges: [
      { from: 'user', to: 'gw', bidi: true },
      { from: 'gw', to: 'chk' },
      { from: 'chk', to: 'pay' },
      { from: 'chk', to: 'inv' },
      { from: 'chk', to: 'loy' },
      { from: 'chk', to: 'ord' },
      { from: 'ord', to: 'bus' },
      { from: 'bus', to: 'loy' },
      { from: 'bus', to: 'ship' },
      { from: 'pay', to: 'db' },
      { from: 'inv', to: 'db' },
      { from: 'ci', to: 'chk', dashed: true },
      { from: 'ci', to: 'ord', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'mono', title: 'Checkout in a modular monolith', tone: 'ok',
      steps: [
        { text: 'The shopper places an order. The controller (a <b>driving adapter</b>) calls the checkout module\'s port. Everything below runs in <b>one JVM</b>.', flow: ['user>gw', 'gw>chk'], labels: { chk: { label: 'checkout module', sub: 'same process' } } },
        { text: 'Checkout calls inventory and payments through their <b>public module APIs</b>. Each call is a method call: nanoseconds, no serialisation, no partial network failure.', flow: [['chk>inv', 'chk>pay']], labels: { chk: { label: 'checkout module', sub: 'same process' } }, badges: { chk: ['0 network hops', 'ok'] } },
        { text: 'Stock and payment records are written in <b>one local ACID transaction</b>. Each module owns its own schema, but the database is shared infrastructure.', flow: [['inv>db', 'pay>db']], labels: { db: { label: 'One Postgres', sub: 'schema per module' } }, badges: { db: ['1 commit', 'ok'] } },
        { text: 'Orders publishes <b>OrderPlaced</b> as an application event. Loyalty and shipping listen after commit; the publication is logged so a failed listener can be retried.', flow: ['chk>ord', 'ord>bus', ['bus>loy', 'bus>ship']], labels: { bus: { label: 'App events', sub: 'publication log' } }, tone: 'ok' },
        { text: 'One artefact ships. CI ran <code>ApplicationModules.verify()</code> first, so nobody reached into another module\'s internals.', flow: [['ci>chk', 'ci>ord']], ok: ['ci'], badges: { ci: ['1 deploy · verified', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'micro', title: 'Same checkout as microservices', tone: 'info',
      steps: [
        { text: 'Now every box is its own service with its own database and pipeline. The request enters through an <b>API gateway</b>.', flow: ['user>gw', 'gw>chk'], labels: { gw: { label: 'API gateway', sub: 'auth · routing' }, chk: { label: 'checkout-svc', sub: 'own pod + DB' } } },
        { text: 'Checkout calls inventory, payments and loyalty over HTTP/gRPC. Each hop adds a few ms of network and serialisation, and each can <b>time out</b> independently.', flow: ['chk>inv', 'chk>pay', 'chk>loy'], badges: { inv: '+2 ms', pay: '+2 ms', loy: '+2 ms' }, labels: { chk: { label: 'checkout-svc', sub: 'own pod + DB' } } },
        { text: 'Availability multiplies: five sync dependencies at 99.9 % each give about <b>99.5 %</b>. You need timeouts, retries with backoff, and circuit breakers on every hop.', nodes: ['chk', 'inv', 'pay', 'loy', 'ord'], warn: ['chk'], badges: { chk: ['≈ 99.5 % composite', 'warn'] }, tone: 'warn' },
        { text: 'No shared transaction: stock, payment and order commit in <b>different databases</b>. A failure half-way needs a <b>saga</b> with compensations (release stock, refund).', flow: ['chk>ord', 'ord>bus'], labels: { db: { label: 'DB per service', sub: '5 databases' } }, badges: { ord: 'saga step 3/3' } },
        { text: 'The payoff: the loyalty team deploys 10 times a day without asking anyone, and inventory scales on its own during a sale.', flow: [['ci>chk', 'ci>ord']], ok: ['loy', 'inv'], badges: { ci: ['independent deploys', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'event', title: 'Event-driven: add loyalty without touching checkout', tone: 'ok',
      steps: [
        { text: 'Orders already publishes <b>OrderPlaced</b> to the broker. Checkout does not know who listens.', flow: ['chk>ord', 'ord>bus'], labels: { bus: { label: 'Kafka topic', sub: 'orders.placed' } } },
        { text: 'The loyalty team adds a <b>consumer</b>. Nothing in checkout or orders changes, and no extra hop lands on the shopper\'s request.', flow: ['bus>loy'], ok: ['loy'], badges: { loy: ['new consumer', 'ok'] }, tone: 'ok' },
        { text: 'Loyalty goes down for 10 minutes. Checkout keeps working; events wait in the topic and are processed when loyalty comes back. Points show as <b>pending</b> meanwhile.', flow: ['ord>bus'], err: ['loy'], ok: ['chk'], badges: { loy: ['down', 'err'], bus: ['lag 10 min', 'warn'] }, tone: 'warn' },
        { text: 'The cost: the system is <b>eventually consistent</b>, and "what happens when an order is placed?" is now spread across consumers. Keep an event catalogue and trace IDs on every event.', flow: [['bus>loy', 'bus>ship']], ok: ['loy', 'ship'], badges: { bus: ['caught up', 'ok'] } }
      ]
    },
    {
      id: 'distmono', title: 'Distributed monolith: lockstep deploy', tone: 'err',
      steps: [
        { text: 'Loyalty needs a <code>points</code> column on the <b>shared orders table</b>. Three services map that table with an ORM.', nodes: ['db', 'chk', 'ord', 'loy'], warn: ['db'], labels: { db: { label: 'Shared DB', sub: 'orders table' } }, badges: { db: ['ALTER TABLE', 'warn'] } },
        { text: 'The migration ships; checkout and orders, built against the old schema, start failing on insert. Every service touching the table must be <b>released together</b>.', flow: [['ci>chk', 'ci>ord']], err: ['chk', 'ord'], badges: { ci: ['lockstep release', 'err'] }, tone: 'err' },
        { text: 'At the same time loyalty is slow, and checkout calls it synchronously with no timeout. Threads pile up and checkout goes down: a <b>cascading failure</b>.', flow: ['user>gw', 'gw>chk', 'chk>loy'], err: ['chk', 'loy'], badges: { loy: ['p99 8 s', 'err'], chk: ['threads exhausted', 'err'] }, tone: 'err' },
        { text: 'Fix: give each service its <b>own data</b>, publish events instead of sharing tables, put timeouts and breakers on sync calls, or <b>merge the services back</b> into one modular deployable.', flow: ['ord>bus', 'bus>loy'], ok: ['chk', 'ord', 'loy'], labels: { db: { label: 'DB per owner', sub: 'no shared tables' } }, badges: { db: ['decoupled', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'scale', title: 'Black Friday: scaling the hot path', tone: 'warn',
      steps: [
        { text: 'Traffic jumps 10×. Inventory reservations are the hot spot; loyalty and shipping barely notice.', flow: [['user>gw', 'user>gw'], 'gw>chk', 'chk>inv'], warn: ['inv'], badges: { inv: ['hot', 'warn'] }, tone: 'warn' },
        { text: '<b>Modular monolith</b>: add whole replicas. Idle modules ride along and use some memory, but for most shops this is the cheapest answer. The database is usually the real limit.', nodes: ['chk', 'inv', 'db'], labels: { chk: { label: 'shop ×12', sub: 'all modules' } }, badges: { db: ['connection pool?', 'warn'] } },
        { text: '<b>Microservices</b>: scale only inventory and checkout pods, and give inventory its own database tuned for write contention. This is where independent scaling earns its cost.', nodes: ['inv', 'chk'], ok: ['inv'], labels: { inv: { label: 'inventory ×20', sub: 'own DB' } }, badges: { inv: ['scaled alone', 'ok'] }, tone: 'ok' },
        { text: '<b>Serverless</b>: functions scale per request with no capacity planning, but cold starts hit p99 and a long chain of functions plus a workflow engine is billed per call and per state transition.', flow: ['gw>chk', 'chk>inv', 'chk>pay'], labels: { chk: { label: 'checkout λ', sub: 'per-request scale' } }, badges: { chk: ['cold start', 'warn'] } }
      ]
    }
  ],

  knobs: {
    intro: 'Pick a style, a team count, how data is owned and how parts talk. The diagram relabels itself and the meters show what you buy and what you pay. Numbers are <em>illustrative</em>; the direction of each change is the point.',
    controls: [
      { id: 'style', label: 'Architectural style', type: 'seg', value: 'hexmono', options: [
        { v: 'layered', l: 'Layered monolith' }, { v: 'hexmono', l: 'Hexagonal modular monolith' }, { v: 'micro', l: 'Microservices' }, { v: 'faas', l: 'Serverless' }, { v: 'event', l: 'Event-driven' }] },
      { id: 'teams', label: 'Teams working on it', type: 'range', min: 1, max: 40, step: 1, value: 6 },
      { id: 'data', label: 'Data ownership', type: 'seg', value: 'own', options: [
        { v: 'shared', l: 'Shared DB / tables' }, { v: 'own', l: 'Owned per module / service' }] },
      { id: 'comm', label: 'Communication', type: 'seg', value: 'sync', options: [
        { v: 'sync', l: 'Synchronous calls' }, { v: 'async', l: 'Async events' }] }
    ],
    evaluate(s) {
      const mono = s.style === 'layered' || s.style === 'hexmono';
      const dist = !mono;
      const shared = s.data === 'shared';
      const async = s.comm === 'async' || s.style === 'event';
      const T = s.teams;
      const clamp = (x) => Math.max(0.05, Math.min(1, x));
      const units = mono ? 1 : s.style === 'faas' ? T * 6 : Math.max(3, Math.round(T * 1.5));
      const hops = mono ? 0 : s.style === 'faas' ? (async ? 2 : 5) : s.style === 'event' ? (s.comm === 'sync' ? 2 : 1) : (async ? 1 : 4);
      const compA = Math.pow(0.999, hops + 1);

      // deploy independence
      let dep = { layered: 0.15, hexmono: 0.35, micro: 0.9, faas: 0.85, event: 0.9 }[s.style];
      if (dist && shared) dep = 0.3;
      if (s.style === 'micro' && !async && !shared) dep -= 0.15;
      // user-path latency
      const lat = mono ? 0.95 : { micro: async ? 0.75 : 0.45, faas: async ? 0.55 : 0.25, event: s.comm === 'sync' ? 0.6 : 0.75 }[s.style];
      const latMs = mono ? '≈ 0 ms extra · in-process' : '+' + (hops * 2) + ' ms + ' + hops + ' failure points' + (s.style === 'faas' ? ' + cold starts' : '');
      // ops simplicity
      let ops = { layered: 0.9, hexmono: 0.85, micro: 0.3, faas: 0.55, event: 0.35 }[s.style];
      if (dist && T >= 12) ops += 0.1; // a platform team amortises the tooling
      if (mono && async) ops -= 0.05;
      // consistency ease
      let cons;
      if (mono) cons = shared ? 0.95 : 0.85;
      else if (shared) cons = 0.7;
      else cons = s.style === 'micro' && !async ? 0.4 : 0.3;
      if (mono && async) cons -= 0.1;
      // team autonomy
      let auto;
      if (s.style === 'layered') auto = T <= 2 ? 0.7 : 0.7 - 0.1 * (T - 2);
      else if (s.style === 'hexmono') auto = (T <= 8 ? 0.75 : 0.75 - 0.025 * (T - 8)) + (shared ? -0.1 : 0) + (async ? 0.05 : 0);
      else auto = shared ? 0.35 : (T >= 3 ? 0.9 : 0.55) - (async ? 0 : 0.1);
      // cost (infra + people)
      let cost;
      if (mono) cost = 0.85;
      else if (s.style === 'faas') cost = async ? 0.65 : 0.45;
      else cost = (T < 5 ? 0.25 : T < 12 ? 0.5 : 0.6) - (s.style === 'event' ? 0.05 : 0);

      const metrics = [
        { k: 'Deploy independence', v: mono ? '1 artefact for ' + T + ' team' + (T > 1 ? 's' : '') : shared ? units + ' units, but lockstep' : units + ' independent units', s: clamp(dep) },
        { k: 'User-path latency', v: latMs, s: clamp(lat), hint: (compA * 100).toFixed(2) + ' % avail.' },
        { k: 'Ops simplicity', v: { layered: '1 app, 1 pipeline', hexmono: '1 app + module checks', micro: 'K8s, tracing, mesh, ' + units + ' pipelines', faas: 'no servers; IaC + tracing', event: 'brokers, DLQs, replay, tracing' }[s.style], s: clamp(ops) },
        { k: 'Consistency ease', v: mono ? (shared ? 'one ACID transaction' : 'local tx + module events') : shared ? 'easy, but coupled' : 'sagas + outbox, eventual', s: clamp(cons) },
        { k: 'Team autonomy', v: s.style === 'layered' && T > 2 ? 'every feature crosses layer teams' : auto >= 0.7 ? 'teams own a slice end to end' : 'frequent cross-team handoffs', s: clamp(auto) },
        { k: 'Cost (infra + people)', v: mono ? 'lowest' : s.style === 'faas' ? (async ? 'pay per use; great when spiky' : 'per-call + state transitions add up') : T < 5 ? 'platform cost on a small team' : 'platform cost shared by ' + T + ' teams', s: clamp(cost) }
      ];

      const notes = [];
      if (dist && shared) notes.push('A shared schema means a column change can break every service that maps the table. That is the definition of a <b>distributed monolith</b>.');
      if (dist && T <= 3) notes.push('With ' + T + ' team' + (T > 1 ? 's' : '') + ' you pay for ' + units + ' pipelines and dashboards without gaining much autonomy. Fowler\'s <b>MonolithFirst</b> argument applies.');
      if (s.style === 'layered' && T > 2) notes.push('Layers are split by <i>technology</i>, so "add loyalty points" touches the UI, service and data layers and every team that owns them. Slice by <b>business capability</b> instead.');
      if (s.style === 'hexmono') notes.push('Ports keep the domain framework-free; <b>Spring Modulith</b> or ArchUnit fails the build when a module reaches past another\'s API. Extract a module later by swapping its adapter for a remote client.');
      if (s.style === 'hexmono' && T > 12) notes.push('Shopify runs a very large modular monolith, but it invested heavily in boundary tooling (Packwerk). Above this size, pick 1–2 modules with a real scaling or cadence need and extract them.');
      if (s.style === 'faas' && !async) notes.push('Chains of functions orchestrated per item are billed per invocation and per state transition. Prime Video moved such a pipeline into one process and reported a cost cut of over 90 %.');
      if (s.style === 'micro' && !async && !shared) notes.push(hops + ' sync hops at 99.9 % each → ≈ ' + (compA * 100).toFixed(2) + ' % before retries. Add timeouts, circuit breakers, and consider events for non-critical steps like loyalty.');
      if (async && !mono && !shared) notes.push('Use the <b>outbox pattern</b> so the event is published only if the local transaction commits; consumers must be idempotent.');
      if (mono && async) notes.push('In-process events (e.g. <code>@ApplicationModuleListener</code>) decouple modules without a broker; the publication log makes them retryable.');
      if (mono && shared && s.style === 'hexmono') notes.push('Shared tables between modules defeat the boundaries. Give each module its own schema, even in one database.');

      let verdict;
      if (dist && shared) verdict = '❌ <b>Distributed monolith.</b> You pay the network tax but still deploy in lockstep. Split the data or merge the services back.';
      else if (dist && T <= 3) verdict = '⚠ <b>Too much machinery for ' + T + ' team' + (T > 1 ? 's' : '') + '.</b> Start with a hexagonal modular monolith and extract on evidence.';
      else if (s.style === 'layered' && T > 4) verdict = '⚠ <b>Layered by technology does not scale to ' + T + ' teams.</b> Every feature becomes a cross-team project. Move to modules by capability.';
      else if (s.style === 'layered') verdict = '👍 <b>Fine for a small team and a simple domain.</b> Watch for sinkhole layers and keep the domain free of framework code.';
      else if (s.style === 'hexmono' && T <= 12) verdict = '✅ <b>The sensible default.</b> One deployable, real boundaries, cheap to run, and easy to split later because the seams already exist.';
      else if (s.style === 'hexmono') verdict = '👍 <b>Still workable at ' + T + ' teams</b> with strong tooling, but release coordination grows. Extract the modules with the strongest need.';
      else if (s.style === 'faas' && !async) verdict = '⚠ <b>Synchronous function chains</b> add cold starts, per-call cost and many failure points. Keep FaaS for spiky, event-shaped work.';
      else if (s.style === 'faas') verdict = '👍 <b>Good for spiky, event-shaped workloads.</b> Re-check the bill if load becomes steady and high.';
      else if (s.style === 'micro' && !async) verdict = '👍 <b>Workable with ' + T + ' teams</b> if every sync hop has a timeout, breaker and budget. Move non-critical steps to events.';
      else verdict = '✅ <b>Fits ' + T + ' autonomous teams</b>: owned data, async integration, independent deploys. Invest in tracing, contracts and an event catalogue.';

      const chkLabel = {
        layered: { label: 'Service layer', sub: 'CheckoutService' },
        hexmono: { label: 'checkout module', sub: 'ports + adapters' },
        micro: { label: 'checkout-svc', sub: 'own pod + DB' },
        faas: { label: 'checkout λ', sub: 'function + workflow' },
        event: { label: 'checkout-svc', sub: 'emits OrderPlaced' }
      }[s.style];
      const labels = {
        chk: chkLabel,
        gw: mono ? { label: 'Controllers', sub: 'driving adapter' } : s.style === 'faas' ? { label: 'API Gateway', sub: 'routes → functions' } : { label: 'API gateway', sub: 'auth · routing' },
        db: shared ? { label: 'Shared DB', sub: 'one schema, all tables' } : mono ? { label: 'One Postgres', sub: 'schema per module' } : { label: 'DB per service', sub: 'owned data' },
        bus: mono ? { label: 'App events', sub: 'publication log' } : { label: 'Event broker', sub: 'Kafka / SNS+SQS' },
        loy: s.style === 'faas' ? { label: 'award-points λ', sub: 'per event' } : mono ? { label: 'loyalty module', sub: 'points ledger' } : { label: 'loyalty-svc', sub: 'points ledger' }
      };
      const flow = async
        ? ['user>gw', 'gw>chk', ['chk>inv', 'chk>pay'], 'chk>ord', 'ord>bus', ['bus>loy', 'bus>ship']]
        : ['user>gw', 'gw>chk', ['chk>inv', 'chk>pay', 'chk>loy'], 'chk>ord'];
      return {
        metrics, verdict, notes, labels, flow,
        hide: async ? [] : ['bus', 'ship'],
        err: dist && shared ? ['db'] : [],
        warn: (s.style === 'faas' && !async) || (s.style === 'micro' && !async) ? ['chk'] : [],
        ok: mono && !shared ? ['db'] : [],
        badges: {
          chk: [hops + ' net hop' + (hops === 1 ? '' : 's'), hops >= 4 ? 'warn' : hops === 0 ? 'ok' : 'info'],
          ci: [units + ' deploy unit' + (units > 1 ? 's' : ''), dist && shared ? 'err' : 'info'],
          db: dist && shared ? ['lockstep', 'err'] : ['owned', 'ok']
        }
      };
    }
  },

  widget: {
    title: 'One feature, five styles: "add loyalty points to checkout"',
    caption: 'Pick a style and press <b>Ship the change</b>. The ripple walks the real dependency graph of that style: every <b>component touched</b>, every <b>deploy unit</b> that must ship, every <b>network hop</b> added to the shopper\'s request and every <b>team handoff</b>. Toggle <b>shared database</b> to watch services fall back into lockstep.'
  },

  realWorld: {
    intro: 'The industry swung from monoliths to microservices and partly back. The lesson from the companies that published is not "monolith good" or "microservices good". It is: <b>match the style to the need, and enforce boundaries either way</b>.',
    timeline: [
      { when: '2005', who: 'Alistair Cockburn', title: 'Hexagonal architecture (ports & adapters)', text: 'Cockburn describes putting the application inside a boundary that talks to the world only through <b>ports</b>, with <b>adapters</b> for UI, tests, databases and other systems, so the app can be driven by users, programs or tests alike. He later preferred the name "Ports & Adapters"; the hexagon is just a drawing with room for many ports.', src: 0 },
      { when: '2014', who: 'James Lewis & Martin Fowler', title: '"Microservices" article', text: 'Defines the style as a suite of small services, each <b>running in its own process</b>, built around <b>business capabilities</b> and <b>independently deployable</b> by automated machinery, with decentralised data management.', src: 1 },
      { when: '2015', who: 'Martin Fowler', title: 'MonolithFirst', text: 'Observes that successful microservice stories usually started from a monolith that grew too big, and that teams starting with microservices often struggled. Boundaries are hard to get right before you know the domain.', src: 2 },
      { when: '2018', who: 'Segment', title: '"Goodbye Microservices"', text: 'Segment had split each destination integration into its own service and queue. With 100+ services, shared-library versions drifted and operational load grew. They <b>merged the destinations back into one service</b> and report faster shared-library improvements, while accepting that one bad destination can now affect the rest.', src: 3 },
      { when: '2019', who: 'Shopify', title: 'Deconstructing the Monolith', text: 'Rather than microservices, Shopify chose a <b>modular monolith</b>: keep one codebase, but define and enforce boundaries between components. The post describes a Rails monolith of over 2.8 million lines of Ruby with more than a thousand contributors over a decade.', src: 4 },
      { when: '2020', who: 'Shopify', title: 'Packwerk open-sourced', text: 'A static checker that groups files into packages and flags <b>dependency and privacy violations</b>, so module boundaries are enforced in CI instead of by convention. Shopify\'s 2024 retrospective admits the tool alone does not create good boundaries.', src: 5 },
      { when: '2020', who: 'Uber', title: 'Domain-Oriented Microservice Architecture (DOMA)', text: 'With about <b>2,200 critical microservices</b>, Uber found that debugging could mean working through ~50 services across 12 teams. DOMA groups services into <b>domains</b> behind a single <b>gateway</b>, arranges domains in <b>layers</b> that limit dependencies, and adds <b>extension points</b>.', src: 7 },
      { when: '2023', who: 'Amazon Prime Video', title: 'Serverless pipeline → one process', text: 'The video-quality monitoring tool used Step Functions and Lambda, passing frames through S3. State transitions and S3 calls dominated cost, and it hit a scaling limit at about <b>5 % of expected load</b>. Moving all components into a single ECS task <b>cut infrastructure cost by over 90 %</b>. Commentators noted it was one workload, not a verdict on microservices in general.', src: 8 },
      { when: '2023', who: 'Spring', title: 'Spring Modulith 1.0 GA', text: 'Spring Modulith becomes a supported Spring project: application modules are top-level packages, <code>ApplicationModules.verify()</code> rejects cycles and access to module internals, and an event publication registry makes in-process events reliable.', src: 10 }
    ],
    lessons: [
      '<b>Boundaries first, distribution second.</b> Shopify and Spring Modulith enforce module boundaries inside one deployable; extraction is then a small step.',
      'A distributed design must <b>pay for its network</b>: Segment and Prime Video went back when it did not.',
      'At very large scale, microservices need <b>structure above the service</b>: Uber\'s domains, gateways and layers.',
      'Write the decision as an ADR with <b>revisit triggers</b>; the right style changes as teams and load change.'
    ],
    sources: [
      { title: 'Hexagonal Architecture', url: 'https://alistaircockburn.com/Articles/Hexagonal-Architecture', pub: 'Alistair Cockburn, 2005' },
      { title: 'Microservices: a definition of this new architectural term', url: 'https://www.martinfowler.com/articles/microservices.html', pub: 'James Lewis & Martin Fowler, 2014' },
      { title: 'MonolithFirst', url: 'https://www.martinfowler.com/bliki/MonolithFirst.html', pub: 'Martin Fowler, 2015' },
      { title: 'Goodbye Microservices: From 100s of problem children to 1 superstar', url: 'https://segment.com/blog/goodbye-microservices', pub: 'Segment Engineering, 2018' },
      { title: 'Deconstructing the Monolith: Designing Software that Maximizes Developer Productivity', url: 'https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity', pub: 'Shopify Engineering, 2019' },
      { title: 'Enforcing Modularity in Rails Apps with Packwerk', url: 'https://shopify.engineering/enforcing-modularity-rails-apps-packwerk', pub: 'Shopify Engineering, 2020' },
      { title: 'A Packwerk Retrospective', url: 'https://shopify.engineering/a-packwerk-retrospective', pub: 'Shopify Engineering, 2024' },
      { title: 'Introducing Domain-Oriented Microservice Architecture', url: 'https://www.uber.com/blog/microservice-architecture/', pub: 'Uber Engineering, 2020' },
      { title: 'Prime Video Switched from Serverless to EC2 and ECS to Save Costs', url: 'https://infoq.com/news/2023/05/prime-ec2-ecs-saves-costs', pub: 'InfoQ, 2023 (on the Prime Video Tech post)' },
      { title: 'Verifying Application Module Structure', url: 'https://docs.spring.io/spring-modulith/reference/verification.html', pub: 'Spring Modulith reference docs' },
      { title: 'Spring Modulith 1.0 GA released', url: 'https://spring.io/blog/2023/08/21/spring-modulith-1-0-ga-released', pub: 'spring.io, 2023' }
    ]
  },

  tradeoffs: {
    headers: ['Style', 'Optimises for', 'Costs you', 'Pick when…'],
    rows: [
      ['<b>Layered / n-tier</b>', 'Familiarity, separation of UI, logic and data; easy to start', 'Changes cut across every layer; sinkhole layers; domain leaks into ORM/web code', 'Small team, CRUD-heavy app, short life'],
      ['<b>Hexagonal · clean · onion</b>', 'Testable, framework-free domain; swap DBs, UIs, brokers via adapters', 'More interfaces and mapping code; overkill for thin CRUD', 'Domain logic is the valuable part and must outlive frameworks'],
      ['<b>Modular monolith</b>', 'One deploy, in-process speed, ACID transactions, cheap ops; clear seams for later', 'Shared release cadence and blast radius; scales as a whole; needs boundary tooling', 'Default for new products and for most orgs up to many teams'],
      ['<b>Microservices</b> (and SOA before them)', 'Independent deploy and scaling per capability; team autonomy; fault isolation', 'Network latency and failures, eventual consistency, platform and on-call cost', 'Many teams, parts with very different scale or cadence, mature DevOps'],
      ['<b>Serverless / FaaS</b>', 'No servers, scale to zero, pay per use, fast to wire events', 'Cold starts, per-call and per-transition pricing, limits, harder local testing', 'Spiky, event-shaped or glue workloads; low steady load'],
      ['<b>Event-driven</b> (also space-based)', 'Loose coupling, add consumers freely, absorbs spikes, elastic', 'Eventual consistency, hard-to-follow flows, replay and ordering issues', 'Many reactions to the same fact; integration between domains']
    ]
  },
  failures: [
    { f: 'Distributed monolith', detect: 'Services release together; most PRs span repos; a shared schema or shared domain library everyone pins', fix: 'Give each service its own data, integrate by events, version contracts, or merge the services back into one modular deployable' },
    { f: 'Big ball of mud', detect: 'Cycles in the dependency graph; module verification or Packwerk violations rising; nobody can name an owner', fix: 'Carve modules by capability, make the API package explicit, fail the build on new violations, burn down old ones' },
    { f: 'Cascading failure on sync chains', detect: 'Traces show deep fan-out; p99 tracks the slowest dependency; thread pools exhausted during incidents', fix: 'Timeouts below budget, circuit breakers, bulkheads; move non-critical steps (loyalty, emails) to async events' },
    { f: 'Serverless cost cliff', detect: 'Cost per request rises with volume; state-transition and storage-request lines dominate the bill', fix: 'Batch work, keep hot paths in a long-running container, use FaaS for spiky edges (the Prime Video move)' },
    { f: 'Event spaghetti', detect: 'Nobody can say what happens after OrderPlaced; loops between consumers; silent DLQ growth', fix: 'Event catalogue with owners, trace IDs on events, orchestrate critical multi-step flows as an explicit saga' },
    { f: 'Leaky hexagon', detect: 'Domain classes import JPA, Spring Web or broker types; tests need a Spring context to run domain logic', fix: 'ArchUnit rule "domain depends on nothing outside", map at the adapter, wire domain services with plain @Bean methods' },
    { f: 'Nano-services', detect: 'Services with one endpoint each; most requests touch five or more; teams own a dozen services each', fix: 'Merge by bounded context; aim for one deploy unit per team or capability, not per entity' }
  ],

  interview: [
    { q: 'What is an architectural style, and how do you choose one?', a: '<p>A style is a reusable shape for the whole system: how it is split, what runs together, and how parts communicate. Each has known <b>strengths and costs</b>.</p><p>To choose: list the <b>quality attributes</b> that matter (deployability, scalability, latency, availability, team autonomy, operability, cost), rank them with the business, and add constraints (team size and skills, existing platform, compliance). Then pick the simplest style that meets the top attributes and write it as an ADR with <b>revisit triggers</b>.</p>', fu: 'What would make you revisit the decision in a year?', lvl: 'core' },
    { q: 'Layered vs hexagonal vs clean/onion: what is the difference?', a: '<p><b>Layered</b> stacks UI → service → data; dependencies point down, so the domain often depends on the persistence layer.</p><p><b>Hexagonal</b> (Cockburn, 2005) puts the application in the centre and talks to everything outside through <b>ports</b> (interfaces) and <b>adapters</b> (implementations). Driving adapters (HTTP, tests) call in; driven adapters (DB, PSP) are called out. Dependencies point <b>inward</b>.</p><p><b>Onion</b> (Palermo) and <b>Clean</b> (Martin) are the same dependency rule drawn as rings: entities, use cases, interface adapters, frameworks. The practical test is the same: can you run the domain without Spring or a database?</p>', lvl: 'core' },
    { q: 'When does a modular monolith beat microservices?', a: '<ul><li>Few teams (rule of thumb: under ~10) and one release cadence is acceptable.</li><li>The domain is still being discovered, so boundaries will move. Moving a module boundary is a refactor; moving a service boundary is a migration.</li><li>Workflows need strong consistency across capabilities: one local transaction instead of a saga.</li><li>Latency budget is tight: method calls instead of network hops.</li><li>Ops capacity is limited: one pipeline, one runtime to monitor.</li></ul><p>It loses when parts need very different scaling, independent release cadence or strict fault isolation.</p>', lvl: 'core' },
    { q: 'What is a distributed monolith and how do you detect it?', a: '<p>Services that are <b>deployed separately but must change together</b>. Usual causes: a shared database schema, a shared domain library, long synchronous call chains, or services cut by technical layer.</p><p>Detect it with numbers: share of deploys that need another service to deploy first; share of PRs spanning repos; table-level dependencies between services; traces where one request touches many services synchronously.</p>', fu: 'Would you fix it by splitting further or by merging?', lvl: 'core' },
    { q: 'A request calls five services in sequence, each 99.9 % available. What is the availability, and how do you improve it?', a: '<p>If all five are needed, availability multiplies: 0.999<sup>5</sup> ≈ <b>99.5 %</b>, about 3.6 hours of failure a month instead of ~43 minutes.</p><p>Improve it by: removing hops (merge services, aggregate APIs); making non-critical calls <b>async</b>; caching or degrading gracefully (show "points pending"); retries with backoff and timeouts where idempotent; and redundancy for each dependency.</p>', lvl: 'core' },
    { q: 'Each microservice owns its data. How do you place an order that touches stock, payment and orders without two-phase commit?', a: '<p>Use a <b>saga</b>: a sequence of local transactions, each publishing an event or replying to an orchestrator, with a <b>compensating action</b> for each step (release stock, refund payment).</p><p>Publish events with the <b>transactional outbox</b> so state change and event are atomic, make consumers idempotent, and expose intermediate states ("pending") to users. Orchestration (Temporal, Camunda, a state machine) is easier to follow for critical flows; choreography suits loose reactions.</p>', lvl: 'deep' },
    { q: 'When is serverless the right style, and when is it not?', a: '<p>Good fit: spiky or unpredictable load, event-shaped work (uploads, webhooks, queues), glue code, low steady traffic where scale to zero saves money.</p><p>Poor fit: steady high throughput, chatty pipelines passing data between functions through storage, long-running or latency-critical paths sensitive to cold starts. Prime Video\'s monitoring tool is the known example: Step Functions transitions and S3 calls per frame dominated cost, and moving into one ECS task cut infrastructure cost by over 90 % (2023).</p>', lvl: 'deep' },
    { q: 'Where do SOA, microkernel and space-based architectures fit?', a: '<p><b>SOA</b>: services for enterprise integration, often through a central ESB with shared schemas and smart pipes. Microservices keep the service idea but use "smart endpoints, dumb pipes" and decentralised data.</p><p><b>Microkernel / plugin</b>: a small core plus plugins with a defined contract (IDEs, browsers, Jenkins, rules engines). Great for product lines and extensibility.</p><p><b>Space-based</b>: processing units with in-memory replicated data grids and async write-behind to the DB, so the database is off the hot path. Fits extreme, spiky concurrency (ticketing, auctions) at the cost of complexity and eventual persistence.</p>', lvl: 'core' },
    { q: 'How would you enforce module boundaries in a Spring Boot monolith?', a: '<ul><li><b>Spring Modulith</b>: top-level packages under the main class are modules; only their base package (or declared named interfaces) is public. <code>ApplicationModules.of(App.class).verify()</code> in a test fails on cycles and on access to internals; <code>@ApplicationModule(allowedDependencies = …)</code> narrows it further.</li><li><b>ArchUnit</b> rules for layers and "domain must not depend on Spring/JPA".</li><li>Optionally Gradle/Maven modules or JPMS for compile-time walls.</li><li>Each module owns its own tables (schema per module) and integrates by events where possible.</li></ul>', lvl: 'core' },
    { q: 'How do you decide to extract a module from a modular monolith into a service?', a: '<p>Extract on <b>evidence</b>, one module at a time: a different scaling curve, a release cadence blocked by the shared train, a separate team that is slowed by coordination, a need for failure isolation, or a different runtime (GPU, another language).</p><p>Pre-conditions: its data is already separate, callers use only its API or events, and you have tracing, contract tests and a pipeline ready. Then swap the in-process adapter for a remote client behind the same port, and run both in parallel before cutting over (<a href="strangler-fig.html">strangler fig</a>).</p>', lvl: 'deep' },
    { q: 'How does Conway\'s law affect style choice?', a: '<p>Systems mirror the communication structure of the organisation that builds them. If teams are split by technology (front end, back end, DBA), you get a layered system and every feature becomes a cross-team project.</p><p>Use the <b>inverse Conway manoeuvre</b>: shape teams around business capabilities, then give each a module or service it owns end to end. Microservices without matching team ownership tend to become a distributed monolith.</p>', lvl: 'deep' },
    { q: 'Your team wants to rewrite the monolith as 30 microservices. How do you respond? (STAR)', a: '<p><b>Situation:</b> 4 teams, one Spring Boot monolith, slow releases, and a proposal for 30 services.</p><p><b>Task:</b> fix the delivery problem without buying a platform problem.</p><p><b>Action:</b> measured where time went (most delay was merge conflicts and a flaky shared test suite, not deployment); ran an ADR session ranking quality attributes; introduced Spring Modulith modules with verification in CI and schema-per-module; agreed revisit triggers; extracted one module (search) that truly needed separate scaling.</p><p><b>Result:</b> lead time dropped, one service in production with its own SLO, and the team kept the option to extract more on evidence.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Hexagonal port & adapter (Java 21, Spring Boot 3)', lang: 'java',
      code: `// --- loyalty/domain: plain Java, no Spring or JPA imports ---
package shop.loyalty.domain;

public record Points(long value) {
  public Points { if (value < 0) throw new IllegalArgumentException("negative points"); }
  static Points forOrder(Money total) { return new Points(total.cents() / 100); }
}

public interface AwardPoints {                 // driving port: what callers may ask
  Points award(CustomerId customer, Money orderTotal);
}

public interface PointsLedger {                // driven port: what the domain needs
  void credit(CustomerId customer, Points points);
}

public final class AwardPointsService implements AwardPoints {
  private final PointsLedger ledger;
  public AwardPointsService(PointsLedger ledger) { this.ledger = ledger; }
  @Override public Points award(CustomerId c, Money total) {
    Points p = Points.forOrder(total);
    ledger.credit(c, p);
    return p;
  }
}

// --- loyalty/adapter/jdbc: the framework lives outside the hexagon ---
@Repository
class JdbcPointsLedger implements PointsLedger {
  private final JdbcClient jdbc;               // Spring Framework 6.1+ / Boot 3.2+
  JdbcPointsLedger(JdbcClient jdbc) { this.jdbc = jdbc; }
  @Override public void credit(CustomerId c, Points p) {
    jdbc.sql("INSERT INTO loyalty.ledger (customer_id, points) VALUES (:c, :p)")
        .param("c", c.value()).param("p", p.value())
        .update();
  }
}

@Configuration
class LoyaltyWiring {                          // domain stays annotation-free
  @Bean AwardPoints awardPoints(PointsLedger ledger) { return new AwardPointsService(ledger); }
}`,
      note: 'Each top-level type goes in its own file; they are shown together here. In unit tests, pass an in-memory <code>PointsLedger</code> to <code>AwardPointsService</code>: no Spring context, no database. Extracting loyalty later means writing a new adapter (an HTTP client) for the same port.'
    },
    {
      title: 'Spring Modulith: events between modules + boundary test', lang: 'java',
      code: `// build.gradle (Boot 3.5): use spring-modulith-bom 1.4.x (2.x pairs with Boot 4)
//   implementation 'org.springframework.modulith:spring-modulith-starter-core'
//   implementation 'org.springframework.modulith:spring-modulith-starter-jpa' // publication log
//   testImplementation 'org.springframework.modulith:spring-modulith-starter-test'

// shop/loyalty/package-info.java : loyalty may only depend on the orders module
@org.springframework.modulith.ApplicationModule(allowedDependencies = "orders")
package shop.loyalty;

// shop/orders/OrderService.java : publishes a fact, does not call loyalty
@Service
public class OrderService {
  private final ApplicationEventPublisher events;
  OrderService(ApplicationEventPublisher events) { this.events = events; }

  @Transactional
  public void place(Order order) {
    // ... persist the order ...
    events.publishEvent(new OrderPlaced(order.id(), order.customerId(), order.total()));
  }
}

// shop/loyalty/LoyaltyListener.java : async, after commit, in its own transaction
@Component
class LoyaltyListener {
  private final AwardPoints awardPoints;
  LoyaltyListener(AwardPoints awardPoints) { this.awardPoints = awardPoints; }

  @ApplicationModuleListener
  void on(OrderPlaced event) { awardPoints.award(event.customerId(), event.total()); }
}

// src/test/java/shop/ModularityTests.java
class ModularityTests {
  ApplicationModules modules = ApplicationModules.of(ShopApplication.class);

  @Test void verifiesModuleBoundaries() { modules.verify(); }   // cycles, internals, allowed deps
  @Test void writesDiagrams() { new Documenter(modules).writeDocumentation(); }
}`,
      note: '<code>@ApplicationModuleListener</code> combines <code>@Async</code>, <code>@Transactional(REQUIRES_NEW)</code> and <code>@TransactionalEventListener</code>. With a registry starter (JPA/JDBC) each publication is stored with the order and marked complete when the listener succeeds, so failures can be resubmitted. <code>OrderPlaced</code> must live in the orders module\'s base package to be visible to loyalty.'
    },
    {
      title: 'ArchUnit: layered rule + framework-free domain', lang: 'java',
      code: `// testImplementation 'com.tngtech.archunit:archunit-junit5:1.3.0'
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(packages = "shop", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureRules {

  @ArchTest
  static final ArchRule layers = layeredArchitecture().consideringAllDependencies()
      .layer("Web").definedBy("..web..")
      .layer("Application").definedBy("..application..")
      .layer("Domain").definedBy("..domain..")
      .layer("Persistence").definedBy("..persistence..")
      .whereLayer("Web").mayNotBeAccessedByAnyLayer()
      .whereLayer("Application").mayOnlyBeAccessedByLayers("Web")
      .whereLayer("Persistence").mayOnlyBeAccessedByLayers("Application");

  @ArchTest
  static final ArchRule domainIsFrameworkFree = noClasses()
      .that().resideInAPackage("..domain..")
      .should().dependOnClassesThat()
      .resideInAnyPackage("org.springframework..", "jakarta.persistence..", "com.fasterxml..");
}`,
      note: 'These are <b>fitness functions</b>: the architecture is checked on every build. ArchUnit also has <code>onionArchitecture()</code> for hexagonal/onion layouts. Spring Modulith uses ArchUnit internally for its own verification.'
    }
  ],

  related: ['quality-attributes', 'ddd', 'strangler-fig', 'conways-law', 'design-principles', 'sd:api-gateway', 'sd:message-queue']
});
