SD.register({
  slug: 'ddd',
  domain: 4,
  title: 'Domain-Driven Design',
  examples: 'Evans, Event Storming',
  tagline: 'Model the business, not the database. <b>Bounded contexts</b> give each model a clear edge and a shared language; <b>aggregates</b> guard the rules that must hold in one transaction. Together they tell you where your service boundaries are.',
  tldr: {
    problem: 'Large systems drift into one giant model where "Order", "Customer" and "Product" mean five different things to five teams. Every change ripples everywhere, and services cut by entity or by layer end up calling each other for every request.',
    idea: 'Split the domain into <b>bounded contexts</b>, each with its own model and <b>ubiquitous language</b>, owned by one team. Map how contexts relate (<b>context map</b>). Inside a context, group objects into small <b>aggregates</b> that enforce invariants in one transaction and talk to each other by ID and <b>domain events</b>.',
    insight: 'DDD is first a <b>boundary-finding</b> tool. A microservice should be no smaller than an aggregate and no larger than a bounded context. Splitting by entity ("Order service", "Customer service") puts one word with many meanings in one place and scatters each business flow across many services.',
    numbers: [
      { v: '2003', l: 'Eric Evans publishes "Domain-Driven Design" (the blue book; Addison-Wesley, dated 2004)' },
      { v: '1 aggregate / tx', l: 'Vernon\'s rule: modify one aggregate instance per transaction (2011)' },
      { v: '≥ aggregate, ≤ context', l: 'size of a microservice (Microsoft Azure Architecture Center guidance)' }
    ]
  },

  intro: {
    what: '<b>Domain-Driven Design</b> (DDD) is a way to design software by modelling the business it serves. Developers and domain experts agree on words and rules, then write code that uses exactly those words. It also tells you where to draw the lines between parts of a large system, so each part has one clear model and one owning team.',
    analogy: {
      icon: '🏥',
      title: 'The word "patient" in a hospital',
      text: 'At reception a <b>patient</b> is a name, an address and an insurance number. In the operating theatre a patient is a body with allergies and a blood type. In billing a patient is an account with unpaid invoices. Each department keeps its own file with its own words, and they pass a <b>patient number</b> between them rather than one giant shared folder. Those departments are <b>bounded contexts</b>. The analogy breaks in one place: hospitals grew their departments over decades, while in software you must choose the borders on purpose.'
    },
    problem: 'An online shop has one <code>Order</code> class with 60 fields, used by checkout, warehouse, billing and delivery. The billing team adds a "tax-exempt" flag and the warehouse screen breaks. Two teams edit the same order at the same time and one save is lost. Nobody can say which rule belongs to whom. <b>Where should one model end and the next begin, and which rules must hold together in one transaction?</b>',
    story: [
      {
        stage: 'naive',
        title: 'One model for the whole shop',
        text: 'One big <code>Order</code> entity and one database. Every team adds its fields and rules to it. Splitting into services by entity gives an "Order service" that everyone calls.',
        scene: {
          nodes: [
            { id: 'a', label: 'Checkout team', sub: 'edits Order', kind: 'team', at: [70, 0] },
            { id: 'b', label: 'Billing team', sub: 'edits Order', kind: 'team', at: [210, 0] },
            { id: 'c', label: 'Shipping team', sub: 'edits Order', kind: 'team', at: [350, 0] },
            { id: 'o', label: 'Order model', sub: '60 fields', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'One database', sub: 'orders table', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'a', to: 'o' }, { from: 'b', to: 'o' }, { from: 'c', to: 'o' }, { from: 'o', to: 'db' }],
          flow: [['a>o', 'b>o', 'c>o'], 'o>db']
        }
      },
      {
        stage: 'breaks',
        title: 'One word, three meanings',
        text: '"Order" means a cart to checkout, an invoice to billing and a parcel to shipping. Their rules clash, every change needs three teams to agree, and concurrent edits to the same row <b>conflict</b> and get lost.',
        scene: {
          nodes: [
            { id: 'a', label: 'Checkout team', sub: 'blocked', kind: 'team', at: [70, 0] },
            { id: 'b', label: 'Billing team', sub: 'blocked', kind: 'team', at: [210, 0] },
            { id: 'c', label: 'Shipping team', sub: 'blocked', kind: 'team', at: [350, 0] },
            { id: 'o', label: 'Order model', sub: '3 meanings', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'One database', sub: 'row conflicts', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'a', to: 'o' }, { from: 'b', to: 'o' }, { from: 'c', to: 'o' }, { from: 'o', to: 'db' }],
          flow: [['a>o', 'b>o', 'c>o'], 'o>db'],
          err: ['o'], warn: ['db'],
          badges: { o: ['meanings clash', 'err'], db: ['lost update', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'A model per context, linked by events',
        text: 'Each team gets a <b>bounded context</b> with its own small model and words. Sales owns the order until it is placed, then publishes <b>OrderPlaced</b>. Billing and Shipping keep their own records keyed by the order ID.',
        scene: {
          nodes: [
            { id: 'a', label: 'Sales', sub: 'Order = cart', kind: 'service', at: [70, 0] },
            { id: 'ev', label: 'OrderPlaced', sub: 'domain event', kind: 'queue', at: [210, 110] },
            { id: 'b', label: 'Billing', sub: 'Invoice', kind: 'service', at: [70, 220] },
            { id: 'c', label: 'Shipping', sub: 'Shipment', kind: 'service', at: [350, 220] }
          ],
          edges: [{ from: 'a', to: 'ev' }, { from: 'ev', to: 'b' }, { from: 'ev', to: 'c' }],
          flow: ['a>ev', ['ev>b', 'ev>c']],
          ok: ['a', 'b', 'c'],
          badges: { ev: ['by ID, async', 'ok'] }
        }
      }
    ],
    usedBy: ['Microsoft Azure Architecture Center guidance', 'Uber (domain-oriented microservices)', 'Spring Modulith and jMolecules', 'Axon Framework users', 'Thoughtworks consulting practice', 'Zalando and many e-commerce teams'],
    whenToUse: [
      'The business rules are <b>complex and valuable</b> (pricing, underwriting, logistics), and you will live with them for years',
      'Several teams work on one system and keep stepping on each other: use bounded contexts to give each a clear area',
      'You are splitting a monolith or planning microservices and need <b>boundaries that follow the business</b>'
    ],
    whenNot: [
      'Thin CRUD over a database, admin forms, reports: tactical DDD (aggregates, repositories, events) adds ceremony for nothing',
      'A team of three on a young product: use the language and a few contexts as modules, skip the heavy patterns. See <a href="architectural-styles.html">Architectural Styles</a>',
      'Do not treat DDD as "one microservice per aggregate". Split later and gradually: see <a href="strangler-fig.html">Strangler Fig</a>'
    ],
    glossary: [
      { term: 'Ubiquitous language', def: 'The shared words of developers and domain experts inside one context, used in talk, tests and code alike.' },
      { term: 'Bounded context', def: 'An explicit boundary inside which one model and one language apply consistently; usually owned by one team.' },
      { term: 'Subdomain', def: 'A part of the business problem: core (your advantage), supporting (needed, specific) or generic (buy it).' },
      { term: 'Context map', def: 'A drawing of the bounded contexts and the relationships between them (customer–supplier, conformist, ACL…).' },
      { term: 'Aggregate', def: 'A cluster of entities and value objects with one root, changed as a unit in one transaction to keep its invariants true.' },
      { term: 'Value object', def: 'An immutable object defined only by its values, such as Money or Address; two with equal values are the same.' },
      { term: 'Domain event', def: 'A record of something that happened that domain experts care about, named in the past tense: OrderPlaced.' },
      { term: 'Anti-corruption layer', def: 'A translation layer that keeps another system\'s model from leaking into yours.' }
    ]
  },

  requirements: {
    functional: [
      'Build a <b>ubiquitous language</b> with domain experts and use it everywhere: in conversation, tests, class and method names',
      'Split the domain into <b>bounded contexts</b>; one model, one language and ideally one team per context',
      'Classify subdomains as <b>core, supporting or generic</b>; spend design effort on the core, buy or simplify the rest',
      'Draw a <b>context map</b> and pick an explicit integration pattern for every relationship (ACL, OHS, conformist…)',
      'Design <b>small aggregates</b> around true invariants; reference other aggregates <b>by ID</b>; change one aggregate per transaction',
      'Communicate across aggregates and contexts with <b>domain events</b>, accepting eventual consistency where the business does'
    ],
    nonFunctional: [
      '<b>Low coupling</b>: most business changes touch one context (target: > 80 % of PRs, a <em>rule of thumb</em>)',
      '<b>Team autonomy</b>: one team per context; no cross-team approval for internal model changes',
      '<b>Low contention</b>: optimistic-lock conflicts on any aggregate below ~1 % of writes (<em>rule of thumb</em>)',
      '<b>Explicit contracts</b>: every cross-context event or API is versioned and has an owner',
      '<b>Testability</b>: domain logic unit-tested without Spring, database or broker',
      '<b>Changeability</b>: model refactors inside a context ship without coordinating other teams'
    ],
    outOfScope: [
      '<b>Anaemic domain model</b> (Fowler, 2003): entities with getters and setters, all rules in "service" classes',
      '<b>One enterprise model</b>: a single canonical <code>Customer</code> shared by every system',
      '<b>Services per entity</b>: Order service, Customer service, Product service, each a CRUD wrapper',
      '<b>Large-cluster aggregates</b>: loading a whole object graph to change one field, with lock contention to match',
      '<b>Pattern-first DDD</b>: repositories and factories everywhere, but no conversation with domain experts'
    ]
  },

  calculator: {
    inputs: [
      { id: 'w', label: 'Users editing the same aggregate at once', min: 1, max: 200, value: 20, log: true },
      { id: 'r', label: 'Writes per user per minute', min: 0.1, max: 60, step: 0.1, value: 2, log: true },
      { id: 'n', label: 'Entities loaded per aggregate (lines, items…)', min: 1, max: 5000, value: 400, log: true },
      { id: 'base', label: 'Base transaction time (load + save)', min: 1, max: 200, value: 15, unit: 'ms' },
      { id: 'per', label: 'Extra time per loaded entity', min: 0.005, max: 1, step: 0.005, value: 0.05, unit: 'ms' }
    ],
    outputs: [
      { label: 'Transaction time on this aggregate', fmt: 'ms', f: (v) => v.base + v.n * v.per },
      { label: 'Write rate hitting this one aggregate', f: (v) => (v.w * v.r / 60).toFixed(2) + ' tx/s' },
      { label: 'Conflict probability per write (optimistic lock)', f: (v) => { const d = (v.base + v.n * v.per) / 1000; const lam = (v.w - 1) * v.r / 60; return ((1 - Math.exp(-2 * lam * d)) * 100).toFixed(2) + ' %'; } },
      { label: 'Expected retries per successful write', f: (v) => { const d = (v.base + v.n * v.per) / 1000; const p = 1 - Math.exp(-2 * (v.w - 1) * v.r / 60 * d); return p >= 0.999 ? '∞ (saturated)' : (p / (1 - p)).toFixed(3); } },
      { label: 'Lock busy share (utilisation if writes serialise)', f: (v) => Math.min(100, v.w * v.r / 60 * (v.base + v.n * v.per) / 10).toFixed(1) + ' %' },
      { label: 'Recommended split to keep conflicts < 1 %', f: (v) => { const d = (v.base + v.n * v.per) / 1000; const x = 2 * (v.w - 1) * v.r / 60 * d; const need = Math.ceil(x / 0.01005); return need <= 1 ? 'keep as one aggregate' : 'split into ≥ ' + need + ' aggregates (e.g. by ' + (v.n > 50 ? 'line / item' : 'user') + ')'; } }
    ],
    note: 'Model: writes from the other users arrive as a Poisson stream at λ = (W − 1) · r / 60 per second. A write with optimistic locking (<code>@Version</code>) fails if another write commits inside its window, roughly 2 × the transaction time, so p ≈ 1 − e<sup>−2λd</sup>. Transaction time grows with the number of entities loaded: that is how a <b>large-cluster aggregate</b> hurts twice. The per-entity cost and the 2d window are <em>estimates</em>; measure yours. Splitting by k divides λ by about k (each aggregate sees fewer writers) and usually shrinks d too. This is Vernon\'s "design small aggregates" argument in numbers.'
  },

  api: [
    { m: 'DOC', p: 'Context map (context-map.md / Context Mapper DSL)', d: 'Every bounded context, its owning team and subdomain type, and each relationship labelled with its pattern: <b>U/D</b> (upstream/downstream), customer–supplier, conformist, ACL, OHS + published language, shared kernel, partnership, separate ways.' },
    { m: 'DOC', p: 'Ubiquitous language glossary (per context)', d: 'Term, definition, examples, and <b>what it is not</b>. "Order (Sales): a customer\'s confirmed basket. Not a shipment." Lives next to the code; terms appear in class names and tests.' },
    { m: 'ADR', p: 'ADR-012: Service boundaries follow bounded contexts', d: 'Context: Event Storming results. Decision: one deployable per context (modules first). Rejected: per-entity services, per-layer services. Revisit when a context needs its own scaling or cadence.' },
    { m: 'EVENT', p: 'sales.OrderPlaced v2 (published language)', d: '<code>{eventId, orderId, customerId, lines[{sku, qty}], total{amount, currency}, occurredAt}</code>. Integration event, separate from the internal domain event; additive changes only; consumers translate it in their own ACL.' },
    { m: 'DOC', p: 'Aggregate design canvas', d: 'Name, invariants enforced, commands handled, events emitted, throughput and concurrent-writer estimate, size (entities loaded), references by ID. From the DDD Crew canvas.' },
    { m: 'POLICY', p: 'Architecture rules (Spring Modulith / jMolecules / ArchUnit)', d: 'Contexts may not import each other\'s internals; aggregates reference others by ID only; repositories only for aggregate roots. Fails the build on violation.' }
  ],

  dataModel: [
    { name: 'orders (Sales context)', store: 'Postgres · schema sales', fields: [['id', 'uuid', 'pk'], ['customer_id', 'uuid (ID ref only)', 'idx'], ['status', 'text'], ['total_cents', 'bigint'], ['version', 'bigint'], ['placed_at', 'timestamptz']], note: 'The aggregate root row. <code>version</code> drives optimistic locking. No foreign key to Billing or Shipping tables: other contexts hold their own copy keyed by <code>id</code>.' },
    { name: 'order_line (inside Order aggregate)', store: 'Postgres · schema sales', fields: [['order_id', 'uuid', 'pk'], ['line_no', 'int', 'pk'], ['sku', 'text'], ['quantity', 'int'], ['unit_price_cents', 'bigint']], note: 'Owned by the root; never loaded or saved on its own. The invariant "total = sum of lines, max 50 lines" is checked in <code>Order</code>.' },
    { name: 'invoice (Billing context)', store: 'Postgres · schema billing', fields: [['id', 'uuid', 'pk'], ['order_id', 'uuid', 'idx'], ['account_id', 'uuid', 'fk'], ['amount_cents', 'bigint'], ['tax_cents', 'bigint'], ['status', 'text']], note: 'Billing\'s own model of the same business transaction, built from <code>OrderPlaced</code>. Different fields, different rules, same ID.' },
    { name: 'event_publication', store: 'Spring Modulith registry', fields: [['id', 'uuid', 'pk'], ['listener_id', 'text', 'idx'], ['event_type', 'text'], ['serialized_event', 'text'], ['publication_date', 'timestamptz'], ['completion_date', 'timestamptz', 'idx']], note: 'Written in the same transaction as the aggregate, so a domain event is never lost; incomplete rows are retried (outbox style).' }
  ],

  architecture: {
    title: 'From Event Storming to a context map',
    nodes: [
      { id: 'es', label: 'Event Storming', sub: 'orange stickies', kind: 'policy', wide: [90, 110], tall: [70, 0], tip: 'A workshop where experts and developers put domain events on a wall in time order. Clusters and language shifts reveal bounded contexts.' },
      { id: 'team', label: 'Domain experts', sub: '+ developers', kind: 'team', wide: [90, 330], tall: [350, 0], tip: 'The people who know the business. Their words become the ubiquitous language.' },
      { id: 'web', label: 'Storefront', sub: 'web / app', kind: 'client', wide: [280, 220], tall: [210, 0], tip: 'Sends commands such as PlaceOrder to the Sales context.' },
      { id: 'cat', label: 'Catalog context', sub: 'OHS: product API', kind: 'service', wide: [470, 90], tall: [70, 110], tip: 'Supporting subdomain. Offers an Open Host Service; Sales is a customer of it.' },
      { id: 'sales', label: 'Sales context', sub: 'Order aggregate', kind: 'service', wide: [470, 220], tall: [210, 110], tip: 'Core subdomain. Owns the Order aggregate, enforces its invariants and publishes OrderPlaced.' },
      { id: 'sdb', label: 'Sales DB', sub: 'own schema', kind: 'store', wide: [470, 350], tall: [350, 110], tip: 'Only Sales reads and writes it. Others get events, not table access.' },
      { id: 'inv', label: 'Inventory context', sub: 'StockItem aggr.', kind: 'service', wide: [660, 90], tall: [70, 220], tip: 'Reserves stock when it hears OrderPlaced. One aggregate per SKU keeps contention local.' },
      { id: 'bus', label: 'Domain events', sub: 'published language', kind: 'queue', wide: [660, 220], tall: [210, 220], tip: 'In-process events (Spring Modulith) or a broker such as Kafka. Integration events are the published language between contexts.' },
      { id: 'ship', label: 'Shipping context', sub: 'Shipment aggr.', kind: 'service', wide: [660, 350], tall: [350, 220], tip: 'Creates a Shipment from OrderPlaced plus its own copy of the address.' },
      { id: 'bill', label: 'Billing context', sub: 'Invoice aggr.', kind: 'service', wide: [850, 220], tall: [210, 330], tip: 'Generic-ish subdomain built on a legacy ERP. Translates through an anti-corruption layer.' },
      { id: 'acl', label: 'Anti-corruption', sub: 'translate ERP model', kind: 'edge', wide: [850, 350], tall: [70, 440], tip: 'Maps legacy codes and records into Billing\'s clean model, and back. The legacy model never leaks in.' },
      { id: 'erp', label: 'Legacy ERP', sub: 'upstream, conformist', kind: 'external', wide: [850, 460], tall: [210, 440], tip: 'The old system. You cannot change its model, so you isolate it.' }
    ],
    edges: [
      { from: 'team', to: 'es' },
      { from: 'es', to: 'sales', dashed: true, label: 'finds contexts' },
      { from: 'web', to: 'sales', label: 'PlaceOrder' },
      { from: 'cat', to: 'sales', label: 'OHS' },
      { from: 'sales', to: 'sdb' },
      { from: 'sales', to: 'bus' },
      { from: 'bus', to: 'inv' },
      { from: 'bus', to: 'ship' },
      { from: 'bus', to: 'bill' },
      { from: 'bill', to: 'acl' },
      { from: 'acl', to: 'erp', bidi: true }
    ]
  },

  scenarios: [
    {
      id: 'storm', title: 'Event Storming finds the contexts', tone: 'ok',
      steps: [
        { text: 'Domain experts and developers write <b>domain events</b> on orange stickies (OrderPlaced, StockReserved, InvoiceIssued) and place them on a long wall in time order.', flow: ['team>es'], ok: ['es'], badges: { es: '40+ events' } },
        { text: 'Language shifts mark borders: Sales says "order", Billing says "invoice", Shipping says "consignment" for the same deal. Each cluster becomes a candidate <b>bounded context</b>.', nodes: ['sales', 'inv', 'ship', 'bill', 'cat'], badges: { sales: 'Order', bill: 'Invoice', ship: 'Shipment' } },
        { text: 'Classify: Sales pricing and promotions are the <b>core subdomain</b>; Catalog and Shipping are <b>supporting</b>; invoicing on the ERP is <b>generic</b>. Put the best people on the core.', nodes: ['sales', 'cat', 'bill'], ok: ['sales'], badges: { sales: ['core', 'ok'], cat: 'supporting', bill: 'generic' } },
        { text: 'Draw the <b>context map</b>: Catalog is upstream with an Open Host Service, contexts integrate by published events, Billing protects itself with an ACL.', flow: ['cat>sales', 'sales>bus', ['bus>inv', 'bus>ship', 'bus>bill'], 'bill>acl'], tone: 'ok' }
      ]
    },
    {
      id: 'order', title: 'Placing an order across contexts', tone: 'info',
      steps: [
        { text: 'The storefront sends <code>PlaceOrder</code>. Sales loads <b>one Order aggregate</b> by ID; product data comes from Catalog\'s open host API, copied into value objects.', flow: ['web>sales', 'cat>sales'], badges: { sales: '1 aggregate' } },
        { text: '<code>order.place()</code> checks the invariants (lines present, total matches, limit not exceeded), changes state and <b>records OrderPlaced</b>. One local transaction with an optimistic lock.', flow: ['sales>sdb'], ok: ['sales'], badges: { sdb: ['commit v7', 'ok'] } },
        { text: 'The event is published after commit. Inventory, Billing and Shipping each react in <b>their own transaction</b>, on their own aggregates, keyed by <code>orderId</code>.', flow: ['sales>bus', ['bus>inv', 'bus>bill', 'bus>ship']], badges: { bus: 'OrderPlaced' } },
        { text: 'Stock is out? Inventory publishes <code>StockReservationFailed</code> and Sales cancels the order: a <b>compensation</b>, not a rollback. The business accepts seconds of inconsistency.', flow: ['bus>inv'], warn: ['inv'], badges: { inv: ['out of stock', 'warn'] }, tone: 'warn' }
      ]
    },
    {
      id: 'acl', title: 'Anti-corruption layer over a legacy ERP', tone: 'ok',
      steps: [
        { text: 'Billing must issue invoices through a 20-year-old ERP with codes like <code>STAT_CD=\'H3\'</code> and a customer record with 140 columns.', nodes: ['erp'], warn: ['erp'], badges: { erp: ['legacy model', 'warn'] } },
        { text: 'Billing does not conform. Its <b>ACL</b> translates <code>OrderPlaced</code> into an ERP posting, and ERP replies into Billing\'s own <code>Invoice</code> and <code>AccountStatus</code> value objects.', flow: ['bus>bill', 'bill>acl', 'acl>erp'], ok: ['acl'], badges: { acl: ['translate', 'ok'] } },
        { text: 'When the ERP is replaced, only the ACL changes. The Billing model and every consumer of Billing events stay the same. This is also how a <a href="strangler-fig.html">strangler fig</a> migration keeps its seams.', flow: ['acl>erp'], ok: ['bill'], labels: { erp: { label: 'New ERP', sub: 'swap behind ACL' } }, tone: 'ok' }
      ]
    },
    {
      id: 'entity', title: 'Failure: services split by entity', tone: 'err',
      steps: [
        { text: 'The team split by noun: Order service, Customer service, Product service. Each wraps a table with CRUD endpoints.', nodes: ['sales', 'cat', 'inv'], labels: { sales: { label: 'Order service', sub: 'CRUD' }, cat: { label: 'Product service', sub: 'CRUD' }, inv: { label: 'Customer svc', sub: 'CRUD' } } },
        { text: 'Placing one order now calls Product, Customer and Order synchronously, then billing and shipping logic <b>reach into the Order service</b> to add their fields. Every flow crosses every service.', flow: ['web>sales', 'cat>sales', 'sales>bus', ['bus>inv', 'bus>bill', 'bus>ship']], err: ['sales'], labels: { sales: { label: 'Order service', sub: 'everyone edits it' } }, badges: { sales: ['3 teams, 1 model', 'err'] }, tone: 'err' },
        { text: 'The shared <code>Order</code> grows to 60 fields, with rules from three teams. A billing change breaks shipping; releases need all teams. A <b>distributed monolith</b> with an <b>anaemic</b> core.', nodes: ['sdb', 'sales'], err: ['sdb', 'sales'], badges: { sdb: ['shared schema', 'err'] }, tone: 'err' },
        { text: 'Fix: re-cut by <b>bounded context</b>. Each context keeps only the order data it needs and owns its rules. Event Storming the order flow is the fastest way to find the cut.', flow: ['sales>bus', ['bus>bill', 'bus>ship']], ok: ['sales', 'bill', 'ship'], tone: 'ok' }
      ]
    },
    {
      id: 'hot', title: 'Flash sale: one aggregate becomes a hot spot', tone: 'warn',
      steps: [
        { text: 'A <code>Campaign</code> aggregate holds the campaign <b>and all 5,000 reserved units</b>. During a flash sale 300 shoppers per second try to reserve.', flow: [['web>sales', 'web>sales'], 'sales>bus', 'bus>inv'], warn: ['inv'], labels: { inv: { label: 'Campaign aggr.', sub: '5,000 units inside' } } },
        { text: 'Every reservation loads and saves the same aggregate. Optimistic-lock conflicts climb toward 100 %; retries make it worse. The <b>large-cluster aggregate</b> is the bottleneck, not the database.', nodes: ['inv'], err: ['inv'], badges: { inv: ['version conflicts', 'err'] }, tone: 'err' },
        { text: 'Ask the business which rule is truly <b>transactional</b>. "Never sell more than 5,000" can be enforced per stock bucket or by a counter; "campaign title" does not need the units at all.', nodes: ['inv', 'team'], badges: { team: 'which invariant?' } },
        { text: 'Split: <code>Campaign</code> (small) plus <code>StockBucket</code> aggregates (e.g. 50 buckets of 100). Each write touches one bucket; contention falls ~50×. See the <b>Model it</b> calculator.', nodes: ['inv'], ok: ['inv'], labels: { inv: { label: 'StockBucket ×50', sub: 'small aggregates' } }, badges: { inv: ['conflicts < 1 %', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose how you cut the system, how big your aggregates are and how the parts integrate. The meters show coupling, consistency, autonomy, contention and the cost of change. Numbers are <em>illustrative</em>; the direction of each change is the point.',
    controls: [
      { id: 'cut', label: 'Boundary choice', type: 'seg', value: 'bc', options: [
        { v: 'entity', l: 'By entity (CRUD)' }, { v: 'layer', l: 'By layer' }, { v: 'bc', l: 'By bounded context' }] },
      { id: 'agg', label: 'Aggregate size', type: 'seg', value: 'small', options: [
        { v: 'large', l: 'Large cluster' }, { v: 'small', l: 'Small, ref by ID' }] },
      { id: 'int', label: 'Integration between parts', type: 'seg', value: 'events', options: [
        { v: 'db', l: 'Shared database' }, { v: 'sync', l: 'Sync API calls' }, { v: 'events', l: 'Domain events + ACL' }] }
    ],
    evaluate(s) {
      const c = (x) => Math.max(0.05, Math.min(1, x));
      const bc = s.cut === 'bc', ent = s.cut === 'entity', lay = s.cut === 'layer';
      const big = s.agg === 'large';
      // cross-part calls per business flow (place order): from the board in the widget
      const cross = { entity: 8, layer: 12, bc: 7 }[s.cut];
      let coup = bc ? 0.8 : ent ? 0.35 : 0.2;
      if (s.int === 'db') coup -= 0.3; else if (s.int === 'sync') coup -= 0.12; else coup += 0.1;
      let cons = s.int === 'db' ? 0.9 : s.int === 'sync' ? 0.6 : 0.4;
      if (big) cons += 0.1;
      if (bc && s.int === 'events') cons += 0.05;
      let auto = bc ? 0.85 : ent ? 0.4 : 0.15;
      if (s.int === 'db') auto -= 0.25; else if (s.int === 'events') auto += 0.1;
      let cont = big ? 0.25 : 0.85;
      if (s.int === 'db' && big) cont -= 0.1;
      if (ent) cont -= 0.1; // one entity row edited by every flow
      let change = bc ? 0.8 : ent ? 0.35 : 0.25;
      if (s.int === 'db') change -= 0.2; if (s.int === 'events') change += 0.05;
      if (big) change -= 0.1;
      const lat = s.int === 'sync' ? (bc ? 0.6 : 0.3) : 0.85;
      const metrics = [
        { k: 'Coupling (low is good)', v: (s.int === 'db' ? 'shared tables + ' : '') + cross + ' cross-boundary links / flow', s: c(coup) },
        { k: 'Consistency ease', v: s.int === 'db' ? 'one ACID tx (everything coupled)' : s.int === 'sync' ? 'sync calls, partial failures' : 'local tx + eventual across', s: c(cons) },
        { k: 'Team autonomy', v: bc ? 'one team owns each model' : ent ? 'every flow needs 3+ teams' : 'every feature crosses all layer teams', s: c(auto) },
        { k: 'Write contention', v: big ? 'large aggregate: version conflicts under load' : 'small aggregates: conflicts rare', s: c(cont) },
        { k: 'Change cost', v: change > 0.65 ? 'most changes stay in one context' : change > 0.4 ? 'changes ripple to neighbours' : 'changes ripple everywhere', s: c(change) },
        { k: 'Request-path resilience', v: s.int === 'sync' ? 'availability multiplies per hop' : s.int === 'db' ? 'one DB = one failure domain' : 'consumers can lag safely', s: c(lat) }
      ];
      const notes = [];
      if (ent) notes.push('Per-entity services put one noun with many meanings (Order as cart, invoice, parcel) in one place and scatter each flow across services. Fowler calls the result an <b>anaemic</b> model when the rules move into callers.');
      if (lay) notes.push('Teams per layer (UI, logic, data) turn every feature into a cross-team project. Conway\'s law then hard-wires that layering into the system.');
      if (big) notes.push('Large-cluster aggregates load whole graphs and serialise every writer on one version number. Vernon: <b>design small aggregates</b>, reference others <b>by identity</b>.');
      if (s.int === 'db') notes.push('A shared database is a <b>shared kernel</b> nobody agreed to: any schema change needs every team. Keep a schema per context.');
      if (s.int === 'sync' && bc) notes.push('Sync calls are fine for queries (Open Host Service). For "something happened", publish a domain event so the caller does not wait or fail.');
      if (s.int === 'events') notes.push('Publish integration events with an <b>outbox</b> or Spring Modulith\'s publication registry; consumers translate them in an <b>ACL</b> and must be idempotent.');
      let verdict;
      if (bc && !big && s.int === 'events') verdict = '✅ <b>Textbook strategic + tactical DDD.</b> Boundaries follow the language, aggregates are small, contexts integrate by events.';
      else if (bc && !big) verdict = '👍 <b>Good boundaries</b>; ' + (s.int === 'db' ? 'but the shared database undoes them. Split schemas.' : 'move "something happened" calls to events to remove runtime coupling.');
      else if (bc) verdict = '⚠ <b>Right contexts, wrong aggregates.</b> Split the large cluster around its true invariants before load finds it for you.';
      else if (ent && s.int === 'db') verdict = '❌ <b>Distributed monolith by noun.</b> Shared tables plus per-entity services: all the cost of distribution, none of the independence.';
      else if (ent) verdict = '⚠ <b>Entity services look tidy but couple every flow.</b> Re-cut by bounded context using Event Storming.';
      else verdict = '❌ <b>Layer split</b> maximises cross-team handoffs. Slice vertically by business capability.';
      const name = (bcName, entName, layName) => (bc ? bcName : ent ? entName : layName);
      return {
        metrics, verdict, notes,
        labels: {
          sales: { label: name('Sales context', 'Order service', 'Logic layer'), sub: big ? 'large aggregate' : 'small aggregates' },
          cat: { label: name('Catalog context', 'Product service', 'UI layer'), sub: name('OHS: product API', 'CRUD', 'all screens') },
          inv: { label: name('Inventory context', 'Customer service', 'Data layer'), sub: name('StockItem aggr.', 'CRUD', 'all tables') },
          bus: s.int === 'events' ? { label: 'Domain events', sub: 'published language' } : s.int === 'sync' ? { label: 'Sync REST calls', sub: 'request / response' } : { label: 'Shared tables', sub: 'one schema' },
          sdb: s.int === 'db' ? { label: 'Shared DB', sub: 'every team' } : { label: 'Sales DB', sub: 'own schema' },
          acl: s.int === 'events' ? { label: 'Anti-corruption', sub: 'translate ERP model' } : { label: 'No ACL', sub: 'ERP model leaks in' }
        },
        err: (ent && s.int === 'db') ? ['sdb', 'sales'] : big ? ['sales'] : [],
        warn: s.int === 'sync' ? ['bus'] : s.int !== 'events' ? ['acl'] : [],
        ok: bc && !big && s.int === 'events' ? ['sales', 'inv', 'ship', 'bill'] : [],
        badges: {
          sales: big ? ['conflicts', 'err'] : ['1 aggr / tx', 'ok'],
          bus: [cross + ' cross links', cross > 8 ? 'warn' : 'info']
        },
        flow: ['web>sales', 'cat>sales', 'sales>sdb', 'sales>bus', ['bus>inv', 'bus>bill', 'bus>ship'], 'bill>acl', 'acl>erp']
      };
    }
  },

  widget: {
    title: 'Event Storming board: group the stickies into contexts',
    caption: 'Fourteen <b>domain events</b> from an online shop, with arrows for "this leads to that". Pick a preset, or tap a sticky to move it to the next context. The board counts <b>cross-context links</b>, <b>language conflicts</b> (one context holding two meanings of a word) and a <b>coupling score</b>, then draws the resulting <b>context map</b> with a suggested integration pattern for every pair.'
  },

  realWorld: {
    intro: 'DDD came from one book and grew through a small community of practitioners. The parts that lasted are the strategic ones: <b>bounded contexts, language and context maps</b>. They became the standard way to find microservice boundaries.',
    timeline: [
      { when: '2003', who: 'Eric Evans', title: '"Domain-Driven Design: Tackling Complexity in the Heart of Software"', text: 'The blue book (Addison-Wesley; copyright 2004). Introduces ubiquitous language, the building blocks (entities, value objects, aggregates, repositories, services, factories) and, in its second half, strategic design: bounded contexts and context maps.', src: 0 },
      { when: '2003', who: 'Martin Fowler', title: 'AnemicDomainModel', text: 'Fowler names the <b>anaemic domain model</b> an anti-pattern: objects that look like a domain model but hold data with almost no behaviour, while all the logic sits in service objects. You pay for the mapping without getting the benefits of objects.', src: 1 },
      { when: '2011', who: 'Vaughn Vernon', title: '"Effective Aggregate Design" (3 parts)', text: 'Rules of thumb that became standard: <b>model true invariants in consistency boundaries</b>, <b>design small aggregates</b>, <b>reference other aggregates by identity</b>, and use <b>eventual consistency</b> outside the boundary. Shows a large Product aggregate failing under concurrent users.', src: 2 },
      { when: '2013', who: 'Vaughn Vernon', title: '"Implementing Domain-Driven Design" (the red book)', text: 'Turns the blue book into practice: domain events as a first-class building block, context mapping with code, and aggregate design examples. Later followed by the short "DDD Distilled" (2016).', src: 3 },
      { when: '2013', who: 'Alberto Brandolini', title: 'Introducing Event Storming', text: 'A workshop format: domain experts and developers put <b>domain events on orange stickies</b> along a wall in time order, then add commands, policies and hot spots. Pivotal events and language shifts reveal the bounded contexts.', src: 4 },
      { when: '2014', who: 'Martin Fowler', title: 'BoundedContext', text: 'Short definition that became the common reference: DDD deals with large models by dividing them into bounded contexts and being explicit about their relationships; the same concept (Customer, Product) can mean different things in Sales and Support.', src: 5 },
      { when: '2015', who: 'Eric Evans', title: 'DDD Reference (free, CC BY)', text: 'Evans publishes short summaries of every pattern in the book plus patterns that came later, including domain events, and a revised list of context-mapping patterns (partnership, shared kernel, customer–supplier, conformist, ACL, open host service, published language, separate ways, big ball of mud).', src: 6 },
      { when: '2019+', who: 'Microsoft', title: 'Azure Architecture Center: domain analysis for microservices', text: 'Guidance for cutting services: analyse the domain, define bounded contexts, then aggregates, then services. A microservice should be <b>no smaller than an aggregate and no larger than a bounded context</b>; when in doubt, start coarse.', src: 7 },
      { when: '2020', who: 'Oliver Drotbohm / jMolecules', title: 'jMolecules: DDD concepts in Java code', text: 'Annotations and interfaces such as <code>@AggregateRoot</code>, <code>@ValueObject</code> and <code>@DomainEvent</code> make building blocks explicit, with integrations for Spring, JPA and Jackson and ArchUnit rules that verify them.', src: 8 },
      { when: 'Spring Data', who: 'Spring', title: 'Publishing events from aggregate roots', text: '<code>@DomainEvents</code> and <code>@AfterDomainEventPublication</code> (or the <code>AbstractAggregateRoot</code> base class) let an aggregate record events that the repository publishes on <code>save()</code>.', src: 9 }
    ],
    lessons: [
      '<b>Strategic first.</b> Bounded contexts and the context map give most of the value; tactical patterns are optional per context.',
      '<b>Small aggregates</b> scale. Vernon\'s rules (one aggregate per transaction, reference by ID) are about contention and coupling, not style.',
      '<b>Find boundaries with people</b>, not with an ER diagram. Event Storming makes the language shifts visible in hours.',
      '<b>Protect the core</b> with ACLs; conform only where the upstream model is good enough and not your differentiator.'
    ],
    sources: [
      { title: 'The Big Blue Book: Domain-Driven Design', url: 'https://domainlanguage.com/?p=460', pub: 'Domain Language (Eric Evans), 2003' },
      { title: 'Anemic Domain Model', url: 'https://www.martinfowler.com/bliki/AnemicDomainModel.html', pub: 'Martin Fowler, 2003' },
      { title: 'Effective Aggregate Design, Part I', url: 'https://dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf', pub: 'Vaughn Vernon, dddcommunity.org, 2011' },
      { title: 'Implementing Domain-Driven Design', url: 'https://www.oreilly.com/library/view/implementing-domain-driven-design/9780133039900/pref06lev2sec3.html', pub: 'Vaughn Vernon, Addison-Wesley, 2013' },
      { title: 'Introducing Event Storming', url: 'https://ziobrando.blogspot.ca/2013/11/introducing-event-storming.html', pub: 'Alberto Brandolini, 2013' },
      { title: 'Bounded Context', url: 'https://martinfowler.com/bliki/BoundedContext.html', pub: 'Martin Fowler, 2014' },
      { title: 'DDD Reference (PDF)', url: 'https://domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf', pub: 'Eric Evans, 2015' },
      { title: 'Using domain analysis to model microservices', url: 'https://learn.microsoft.com/azure/architecture/microservices/model/domain-analysis', pub: 'Microsoft Azure Architecture Center' },
      { title: 'jMolecules', url: 'https://github.com/xmolecules/jmolecules', pub: 'xmolecules on GitHub' },
      { title: 'Publishing Events from Aggregate Roots', url: 'https://docs.spring.io/spring-data/commons/reference/repositories/core-domain-events.html', pub: 'Spring Data Commons reference' },
      { title: 'Effective Aggregate Design, Part II', url: 'https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf', pub: 'Vaughn Vernon, dddcommunity.org, 2011' }
    ]
  },

  tradeoffs: {
    headers: ['Context-map pattern', 'What it means', 'Costs you', 'Use when…'],
    rows: [
      ['<b>Partnership</b> / <b>Shared kernel</b>', 'Two teams succeed or fail together; or they share a small, jointly owned part of the model (code or schema)', 'Coordination on every change to the shared part; drifts into a shared monolith', 'Two closely aligned teams, small shared core, high trust'],
      ['<b>Customer–supplier</b>', 'Upstream plans its work with the downstream team\'s needs in mind', 'Negotiation and priority conflicts; upstream must care', 'Same organisation, upstream willing to serve'],
      ['<b>Conformist</b>', 'Downstream adopts the upstream model as is', 'Your model is shaped by someone else\'s; no translation cost', 'Upstream model is good enough and not your core'],
      ['<b>Anti-corruption layer</b>', 'Downstream translates upstream concepts into its own model', 'Mapping code to write and test; another hop', 'Legacy or third-party upstream; protecting your core subdomain'],
      ['<b>Open host service</b> + <b>published language</b>', 'Upstream offers a documented protocol (API, events, schema) for many consumers', 'Versioning and backward compatibility work', 'One upstream, many downstreams'],
      ['<b>Separate ways</b>', 'No integration; each context solves it alone', 'Duplicated features or data entry', 'Integration costs more than it returns']
    ]
  },
  failures: [
    { f: 'Anaemic domain model', detect: 'Entities are getters and setters; services named <code>OrderManager</code> hold all rules; invariants checked in controllers', fix: 'Move behaviour onto the aggregate (<code>order.place()</code>), make setters private, enforce invariants in constructors and methods, test domain without Spring' },
    { f: 'Large-cluster aggregate', detect: 'Version-conflict exceptions and retries rise with users; one load pulls thousands of rows; long transactions', fix: 'Ask which rule is truly transactional; split around it, reference by ID, update the rest by events' },
    { f: 'Services per entity / CRUD services', detect: 'Each business flow calls most services; one service edited by many teams; chatty sync graphs', fix: 'Event Storm the flows, re-cut by bounded context, merge entity services into context services' },
    { f: 'One enterprise canonical model', detect: 'A shared <code>Customer</code> library pinned by every service; committee to change a field', fix: 'Let each context own its view; integrate via published language and translate in ACLs' },
    { f: 'Leaky upstream model', detect: 'Legacy field names and status codes appear in your domain classes', fix: 'Add an anti-corruption layer; map at the boundary; contract-test the translation' },
    { f: 'Multi-aggregate transactions', detect: 'One <code>@Transactional</code> method saves several aggregates; deadlocks; hard to split later', fix: 'One aggregate per transaction; the rest via domain events and eventual consistency (or a saga across contexts)' },
    { f: 'Pattern theatre', detect: 'Factories, repositories and specifications everywhere, but no glossary and no expert has seen the model', fix: 'Start with language and contexts; use tactical patterns only in the core subdomain' }
  ],

  interview: [
    { q: 'What is a bounded context, and how is it different from a subdomain?', a: '<p>A <b>subdomain</b> is part of the <i>problem</i>: an area of the business (pricing, shipping, invoicing). Evans classifies them as <b>core</b> (your competitive edge), <b>supporting</b> and <b>generic</b>.</p><p>A <b>bounded context</b> is part of the <i>solution</i>: an explicit boundary in which one model and one ubiquitous language apply consistently. Ideally one context per subdomain and one team per context, but they do not have to line up 1:1, especially with legacy systems.</p><p>Common misreading: a bounded context is not "a microservice". It is a model boundary; a context can be a module in a monolith or a few services.</p>', lvl: 'core' },
    { q: 'What is an aggregate, and what are Vernon\'s rules for designing one?', a: '<p>An aggregate is a cluster of entities and value objects with one <b>root</b>. Outsiders hold references only to the root; the root enforces the <b>invariants</b> of the whole cluster, and the cluster is loaded and saved as a unit in one transaction.</p><p>Vernon\'s rules (2011): <ul><li>Model <b>true invariants</b> in consistency boundaries.</li><li>Design <b>small aggregates</b>.</li><li>Reference other aggregates <b>by identity</b>, not object references.</li><li>Use <b>eventual consistency</b> outside the boundary.</li></ul> and the corollary: <b>modify one aggregate instance per transaction</b>.</p>', fu: 'When would you break the one-aggregate-per-transaction rule?', lvl: 'core' },
    { q: 'Entity vs value object: give examples and say why it matters.', a: '<p>An <b>entity</b> has identity that lasts through changes: an Order is the same order after you add a line. A <b>value object</b> is defined only by its values and is immutable: <code>Money(10, EUR)</code>, <code>Address</code>, <code>DateRange</code>. Replace it, never mutate it.</p><p>Why it matters: value objects carry validation and behaviour (<code>money.plus()</code> checks currency), remove primitive obsession, are thread-safe and easy to test. In Java 21 a <code>record</code> with a compact constructor is a natural value object.</p>', lvl: 'core' },
    { q: 'How do you find microservice boundaries with DDD?', a: '<ol><li>Run <b>Event Storming</b> across a key business flow with experts.</li><li>Look for <b>language shifts</b>, pivotal events and different owners: those mark candidate bounded contexts.</li><li>Classify subdomains; decide what to build, buy or simplify.</li><li>Draw the <b>context map</b> and choose integration patterns.</li><li>Start each context as a <b>module</b> in one deployable; extract services where scaling, cadence or team need it.</li></ol><p>Size rule from Microsoft\'s guidance: a service is <b>no smaller than an aggregate and no larger than a bounded context</b>.</p>', fu: 'Why not one service per aggregate?', lvl: 'core' },
    { q: 'Walk me through the context-mapping patterns.', a: '<ul><li><b>Partnership</b>: two teams coordinate closely and succeed or fail together.</li><li><b>Shared kernel</b>: a small, explicitly shared subset of the model.</li><li><b>Customer–supplier</b>: upstream plans for downstream needs.</li><li><b>Conformist</b>: downstream adopts the upstream model.</li><li><b>Anti-corruption layer</b>: downstream translates to protect its model.</li><li><b>Open host service</b> + <b>published language</b>: upstream offers a documented protocol for many consumers.</li><li><b>Separate ways</b>: no integration.</li></ul><p>The map also shows power: who is <b>upstream</b> (their changes flow down) and who is downstream.</p>', lvl: 'core' },
    { q: 'What is an anaemic domain model, and is it always bad?', a: '<p>Fowler (2003): domain objects with data and getters/setters but almost no behaviour; the logic lives in service classes (a <b>transaction script</b> in disguise). You pay for an object model and ORM mapping without getting encapsulation: anyone can set <code>status = SHIPPED</code> without the rules.</p><p>Not always bad: for simple CRUD or reporting contexts, a transaction script is honest and cheap. It is bad in the <b>core subdomain</b>, where rules are complex and change often.</p>', lvl: 'core' },
    { q: 'Domain events vs integration events: what is the difference?', a: '<p>A <b>domain event</b> records something that happened inside a context, in its language (<code>OrderPlaced</code>), and may carry internal types. An <b>integration event</b> is the <b>published language</b> sent to other contexts: a stable, versioned contract with only what consumers need.</p><p>Publish domain events after the aggregate commits (Spring Data <code>@DomainEvents</code>, Modulith registry), translate to integration events at the boundary, and publish via an <b>outbox</b> so the event is sent if and only if the transaction committed.</p>', lvl: 'deep' },
    { q: 'Two users edit the same Order and get optimistic-lock failures 20 % of the time. What do you do?', a: '<p>First check the aggregate design: what does one edit load and lock? Usually the aggregate is too large (lines, notes, shipping data, approvals in one cluster).</p><ul><li>List the <b>true invariants</b> with the business ("total ≤ credit limit" may be one; "notes" is not).</li><li>Split: notes, shipping instructions, approvals become their own aggregates referenced by <code>orderId</code>.</li><li>Shorten transactions (no remote calls inside).</li><li>For a counter-like invariant, use buckets or a reservation model.</li></ul><p>Conflict probability rises roughly with writers × rate × transaction time, so splitting by k cuts it about k times. Retries only hide the problem.</p>', lvl: 'deep' },
    { q: 'When would you build an anti-corruption layer, and what goes in it?', a: '<p>When the upstream model is legacy, third-party or simply different, and your context is valuable enough to protect. The ACL contains <b>facades</b> over the upstream API, <b>adapters</b>, and <b>translators</b> that map upstream records and codes into your value objects and back.</p><p>Test it with contract tests against the upstream. It is also the seam for a strangler-fig migration: replace the upstream and only the ACL changes. Skip it (conformist) when the upstream is good and the area is generic.</p>', lvl: 'deep' },
    { q: 'How do you implement DDD in Spring Boot without polluting the domain?', a: '<ul><li>Aggregates as classes with private state and intent-revealing methods; value objects as <b>records</b> with compact-constructor validation.</li><li>Spring Data repositories <b>only for aggregate roots</b>; the root extends <code>AbstractAggregateRoot</code> or uses <code>@DomainEvents</code> so <code>save()</code> publishes events.</li><li><b>Spring Modulith</b>: one top-level package per bounded context, <code>ApplicationModules.verify()</code> in tests, <code>@ApplicationModuleListener</code> with the publication registry for reliable in-process events.</li><li><b>jMolecules</b> annotations (<code>@AggregateRoot</code>, <code>@ValueObject</code>) plus its ArchUnit rules to verify references by ID.</li></ul><p>JPA annotations on aggregates are a pragmatic trade-off; keep business logic free of Spring calls.</p>', lvl: 'deep' },
    { q: 'How does DDD relate to Conway\'s law and team design?', a: '<p>Bounded contexts are natural <b>team boundaries</b>: one team owns the model, language and data of one (or a few) contexts. Context-map patterns describe team relationships as much as technical ones (partnership, customer–supplier, conformist).</p><p>If teams are organised by layer or by entity, Conway\'s law pushes the system into the same shape. The <b>inverse Conway manoeuvre</b> aligns teams with contexts first.</p>', lvl: 'core' },
    { q: 'Tell me about a time you introduced DDD to a team that was splitting a monolith. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation:</b> a retail monolith being split into services by table: Order, Customer, Product. After six months, every feature still touched four services and releases were coordinated weekly.</p><p><b>Task:</b> find boundaries that let three teams ship independently.</p><p><b>Action:</b> ran a two-day Event Storming with ops, finance and warehouse experts (~180 events); found five contexts from language shifts; wrote a context map with an ACL for the ERP; merged entity services into context modules in a Spring Modulith app; split the 3,000-line Order aggregate into Order, Payment and Shipment aggregates linked by events.</p><p><b>Result:</b> share of PRs touching more than one context fell from ~70 % to ~15 % in a quarter; weekly release train dropped to per-team deploys; lock-conflict errors on orders disappeared.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Order aggregate: records as value objects, invariants, domain events (Java 21, Spring Data JPA)', lang: 'java',
      code: `// Value objects: immutable, self-validating (each in its own file)
public record Money(long cents) {
  public Money { if (cents < 0) throw new IllegalArgumentException("negative money"); }
  public Money plus(Money o) { return new Money(Math.addExact(cents, o.cents)); }
  public Money times(int n) { return new Money(Math.multiplyExact(cents, n)); }
  public static final Money ZERO = new Money(0);
}

@Embeddable                                   // records as embeddables: Hibernate 6.2+
public record OrderLine(String sku, int quantity, long unitPriceCents) {
  public OrderLine {
    if (sku == null || sku.isBlank()) throw new IllegalArgumentException("sku required");
    if (quantity < 1 || quantity > 99) throw new IllegalArgumentException("quantity 1..99");
  }
  Money subtotal() { return new Money(unitPriceCents).times(quantity); }
}

public record OrderPlaced(UUID orderId, UUID customerId, long totalCents, Instant at) {}

@Entity @Table(name = "orders", schema = "sales")
public class Order extends AbstractAggregateRoot<Order> {     // aggregate root
  enum Status { DRAFT, PLACED, CANCELLED }
  static final int MAX_LINES = 50;
  static final Money LIMIT = new Money(1_000_000);           // invariant: total <= 10,000.00

  @Id private UUID id;
  @Version private long version;                            // optimistic lock
  private UUID customerId;                                  // other aggregate: by ID only
  @Enumerated(EnumType.STRING) private Status status = Status.DRAFT;
  @ElementCollection @CollectionTable(name = "order_line", schema = "sales",
      joinColumns = @JoinColumn(name = "order_id"))
  @OrderColumn(name = "line_no")
  private List<OrderLine> lines = new ArrayList<>();

  protected Order() {}                                      // for JPA
  public Order(UUID id, UUID customerId) { this.id = id; this.customerId = customerId; }

  public void addLine(OrderLine line) {
    requireStatus(Status.DRAFT);
    if (lines.size() >= MAX_LINES) throw new IllegalStateException("too many lines");
    if (total().plus(line.subtotal()).cents() > LIMIT.cents()) throw new IllegalStateException("order limit");
    lines.add(line);
  }

  public void place(Clock clock) {
    requireStatus(Status.DRAFT);
    if (lines.isEmpty()) throw new IllegalStateException("empty order");
    status = Status.PLACED;
    registerEvent(new OrderPlaced(id, customerId, total().cents(), clock.instant()));
  }

  public Money total() { return lines.stream().map(OrderLine::subtotal).reduce(Money.ZERO, Money::plus); }
  public List<OrderLine> lines() { return List.copyOf(lines); }
  private void requireStatus(Status s) { if (status != s) throw new IllegalStateException("order is " + status); }
}`,
      note: 'No public setters: the only way to change an order is through methods that check the invariants. <code>registerEvent</code> (from <code>AbstractAggregateRoot</code>) records the event; the repository publishes it on <code>save()</code>. Optionally mark <code>Order</code> with jMolecules\' <code>@AggregateRoot</code> and the records with <code>@ValueObject</code> so ArchUnit can verify the rules.'
    },
    {
      title: 'Repository, application service and a listener in another context', lang: 'java',
      code: `// sales: repository only for the aggregate root
public interface Orders extends JpaRepository<Order, UUID> {}

@Service
public class PlaceOrderService {                    // application service: thin, no rules
  private final Orders orders;
  private final Clock clock;
  PlaceOrderService(Orders orders, Clock clock) { this.orders = orders; this.clock = clock; }

  @Transactional                                    // one aggregate per transaction
  public void place(UUID orderId) {
    Order order = orders.findById(orderId)
        .orElseThrow(() -> new NoSuchElementException("order " + orderId));
    order.place(clock);                             // the aggregate decides
    orders.save(order);                             // publishes OrderPlaced (@DomainEvents)
  }
}

// billing: another bounded context (Spring Modulith module) reacting to the event
@Component
class BillingOnOrderPlaced {
  private final Invoices invoices;
  BillingOnOrderPlaced(Invoices invoices) { this.invoices = invoices; }

  @ApplicationModuleListener                        // async, after commit, own transaction
  void on(OrderPlaced event) {
    if (invoices.existsByOrderId(event.orderId())) return;    // idempotent
    invoices.save(Invoice.draftFor(event.orderId(), event.customerId(),
        new Amount(event.totalCents())));           // Billing's own model, keyed by ID
  }
}

// test: contexts may not touch each other's internals
class ModularityTests {
  @Test void contextsRespectBoundaries() {
    ApplicationModules.of(ShopApplication.class).verify();
  }
}`,
      note: 'Spring Data publishes the aggregate\'s registered events when <code>save()</code> is called, then clears them (<code>@AfterDomainEventPublication</code>). With a Spring Modulith event-publication registry starter (JPA or JDBC), each listener invocation is recorded in the same transaction and retried if it fails. <code>OrderPlaced</code> must sit in the sales module\'s API package.'
    },
    {
      title: 'Anti-corruption layer over a legacy ERP', lang: 'java',
      code: `// The legacy model, exactly as the ERP returns it. Never used outside the ACL.
record ErpCustomerRecord(String CUST_NO, String STAT_CD, String CRLMT, String CCY, String ADDR1) {}

interface ErpClient { ErpCustomerRecord fetchCustomer(String custNo); }

// Billing's own model (value objects)
public record AccountId(String value) {}
public enum AccountStatus { ACTIVE, ON_HOLD, CLOSED }
public record CreditLimit(long cents, String currency) {}
public record BillingAccount(AccountId id, AccountStatus status, CreditLimit limit) {}

// Port that Billing's domain depends on
public interface BillingAccounts { BillingAccount byId(AccountId id); }

// The ACL: facade + translator. Legacy codes stop here.
@Component
class ErpBillingAccounts implements BillingAccounts {
  private final ErpClient erp;
  ErpBillingAccounts(ErpClient erp) { this.erp = erp; }

  @Override public BillingAccount byId(AccountId id) {
    return translate(erp.fetchCustomer(id.value()));
  }

  static BillingAccount translate(ErpCustomerRecord r) {
    AccountStatus status = switch (r.STAT_CD().trim()) {
      case "A", "A1" -> AccountStatus.ACTIVE;
      case "H2", "H3" -> AccountStatus.ON_HOLD;     // illustrative legacy codes
      case "X" -> AccountStatus.CLOSED;
      default -> throw new IllegalStateException("unknown ERP status " + r.STAT_CD());
    };
    long cents = new BigDecimal(r.CRLMT().trim()).movePointRight(2).longValueExact();
    return new BillingAccount(new AccountId(r.CUST_NO().trim()), status,
        new CreditLimit(cents, r.CCY().trim()));
  }
}`,
      note: 'Unit-test <code>translate</code> with real ERP samples and contract-test <code>ErpClient</code>. The rest of Billing sees only <code>BillingAccount</code>; replacing the ERP means writing a new implementation of <code>BillingAccounts</code>. Record component names like <code>CUST_NO</code> are legal Java, kept to mirror the legacy schema.'
    }
  ],

  related: ['architectural-styles', 'strangler-fig', 'event-driven-sagas', 'conways-law', 'data-architecture', 'sd:ecommerce-orders']
});
