(function () {
  // Replay model (estimates): one projector applies ~50k events/s; an aggregate load costs ~20 µs per event read + one round trip.
  const PROJ_RATE = 50000, PER_EVENT_MS = 0.02, RTT_MS = 1;
  const dur = (s) => (s < 1 ? Math.round(s * 1000) + ' ms' : s < 120 ? s.toFixed(1) + ' s' : s < 7200 ? (s / 60).toFixed(1) + ' min' : s < 172800 ? (s / 3600).toFixed(1) + ' h' : (s / 86400).toFixed(1) + ' days');
  const total = (v) => v.perDay * 365 * v.years;

  SD.register({
    slug: 'data-architecture',
    domain: 4,
    title: 'Data Architecture: Mesh, Lake, CQRS, ES',
    examples: 'Data mesh, lakehouse, Axon',
    tagline: 'Two questions, often confused: <b>where does analytical data live and who owns it</b> (warehouse, lake, lakehouse, mesh), and <b>how does the operational side store truth</b> (CRUD rows, CQRS read models, or an append-only log of events). Pick each on its own merits.',
    tldr: {
      problem: 'One database cannot serve every need. The order service wants fast, consistent writes; finance wants five years of history joined across ten systems; data science wants raw files. A central data team becomes the bottleneck, and the operational model is too shaped by writes to answer the questions people ask.',
      idea: '<b>Separate operational from analytical data</b> and move data between them with events or CDC. Analytically, land raw data cheaply and refine it in layers (bronze, silver, gold) on open table formats, and decide whether a central team or the <b>domains themselves</b> own the data products. Operationally, use <b>CQRS</b> when reads and writes need different models, and <b>event sourcing</b> only where the history itself is the business value.',
      insight: 'These are <b>organisational and consistency decisions</b> wearing technology names. Data mesh fails without domain teams able to own data; event sourcing fails when nobody needs the history but everybody pays for versioning, projections and eventual consistency.',
      numbers: [
        { v: '2005', l: 'Fowler describes Event Sourcing (eaaDev); CQRS bliki follows in 2011' },
        { v: '4', l: 'data mesh principles (Dehghani, martinfowler.com, Dec 2020)' },
        { v: '3 layers', l: 'bronze · silver · gold medallion (Databricks docs; best practice, not a rule)' }
      ]
    },

    intro: {
      what: '<b>Data architecture</b> decides where data is stored, in what shape, who owns it and how it flows. It has two halves. The <b>operational</b> side runs the business right now (accounts, orders). The <b>analytical</b> side answers questions over history (revenue by region, fraud models). This page covers the main patterns on each side and when each one pays off.',
      analogy: {
        icon: '🏦',
        title: 'A bank ledger and the monthly reports',
        text: 'A bank never overwrites your balance: it writes every deposit and withdrawal into a ledger, and the balance is just the sum. That is <b>event sourcing</b>. The statement, the fraud dashboard and the branch report are different views computed from that ledger: <b>projections</b>, separated from writes as in <b>CQRS</b>. Head office gathers all branch ledgers into one archive for analysts: the warehouse or lake. The analogy stops at speed: a real bank batch runs nightly, while software projections update in milliseconds to seconds.'
      },
      problem: 'A fintech keeps one Postgres database for everything. Analysts run month-end queries on the primary and slow down payments. The fraud team needs "what did this account look like on 3 March?", but rows were overwritten. A central data team of six owns 400 pipelines and has a 3-month backlog. The question this page answers is <b>how do you shape and own data so the operational system stays fast and correct while analytics stays fresh and trusted?</b>',
      story: [
        {
          stage: 'naive',
          title: 'One database for everything',
          text: 'The app writes rows and updates them in place. Reports, dashboards and ML extracts all query the same <b>production database</b>. It is simple and always consistent.',
          scene: {
            nodes: [
              { id: 'app', label: 'App', sub: 'UPDATE in place', kind: 'service', at: [70, 0] },
              { id: 'bi', label: 'Reports + ML', sub: 'heavy scans', kind: 'client', at: [350, 0] },
              { id: 'db', label: 'Prod DB', sub: 'current rows only', kind: 'store', at: [210, 110] }
            ],
            edges: [{ from: 'app', to: 'db' }, { from: 'bi', to: 'db' }],
            flow: ['app>db', 'bi>db'],
            badges: { db: ['one copy', 'info'] }
          }
        },
        {
          stage: 'breaks',
          title: 'Scans hurt writes, history is gone, one team is the bottleneck',
          text: 'Month-end scans lock and slow payments. Overwritten rows cannot answer "what was true then?". Every new report waits in the <b>central data team</b> queue, and they do not understand the domain data they move.',
          scene: {
            nodes: [
              { id: 'app', label: 'App', sub: 'p99 x5', kind: 'service', at: [70, 0] },
              { id: 'bi', label: 'Reports + ML', sub: 'waiting', kind: 'client', at: [350, 0] },
              { id: 'db', label: 'Prod DB', sub: 'history lost', kind: 'store', at: [210, 110] },
              { id: 'team', label: 'Data team', sub: '3-month backlog', kind: 'team', at: [350, 220] }
            ],
            edges: [{ from: 'app', to: 'db' }, { from: 'bi', to: 'db' }, { from: 'team', to: 'db', dashed: true }],
            flow: ['bi>db', 'app>db'],
            err: ['db'], warn: ['team', 'app'],
            badges: { db: ['contention', 'err'], team: ['bottleneck', 'warn'] }
          }
        },
        {
          stage: 'fix',
          title: 'Events out, layered analytics, owned products',
          text: 'The app appends <b>events</b> (or streams changes with CDC). Read models answer app queries. A <b>lakehouse</b> lands the same events as bronze, cleans them into silver and models gold, and the <b>domain team</b> owns its data product end to end.',
          scene: {
            nodes: [
              { id: 'app', label: 'App', sub: 'append events', kind: 'service', at: [70, 0] },
              { id: 'db', label: 'Event store', sub: 'source of truth', kind: 'store', at: [70, 110] },
              { id: 'rm', label: 'Read model', sub: 'balance view', kind: 'cache', at: [210, 110] },
              { id: 'lh', label: 'Lakehouse', sub: 'bronze→gold', kind: 'store', at: [350, 110] },
              { id: 'bi', label: 'Reports + ML', sub: 'own copy', kind: 'client', at: [350, 220] }
            ],
            edges: [{ from: 'app', to: 'db' }, { from: 'db', to: 'rm' }, { from: 'db', to: 'lh', bend: 0.3 }, { from: 'lh', to: 'bi' }],
            flow: ['app>db', ['db>rm', 'db>lh'], 'lh>bi'],
            ok: ['db', 'lh'],
            badges: { lh: ['no prod load', 'ok'] }
          }
        }
      ],
      usedBy: ['Databricks (Delta Lake, lakehouse)', 'Netflix (created Apache Iceberg)', 'Uber (created Apache Hudi)', 'Zalando (data mesh talks)', 'Intuit (data mesh strategy)', 'Axon Framework and EventStoreDB users (event sourcing)'],
      whenToUse: [
        'Analytics needs history and joins across systems that production databases should not serve',
        'Many domains produce data and a central team cannot understand or keep up with all of it',
        'The <b>history is the product</b> (ledgers, audit, insurance claims) or reads and writes need very different models'
      ],
      whenNot: [
        'A small product with one team: a read replica plus a managed warehouse is enough',
        'Plain CRUD forms with no audit need: event sourcing adds versioning, projections and lag for nothing',
        'Domain teams lack data skills and platform support: a mesh then becomes many small swamps (see <a href="conways-law.html">Conway\'s Law</a>)'
      ],
      glossary: [
        { term: 'Data warehouse', def: 'A curated, schema-on-write store for analytics, modelled either as a normalised enterprise core (Inmon) or as star schemas of facts and dimensions (Kimball).' },
        { term: 'Data lake', def: 'Cheap object storage holding raw files of any format, read with a schema applied at query time.' },
        { term: 'Lakehouse', def: 'A lake whose files are managed by an open table format (Delta Lake, Iceberg, Hudi) that adds transactions, schema and time travel.' },
        { term: 'Data product', def: 'A dataset a domain team publishes with an owner, a schema contract, quality guarantees and documentation, so others can use it without asking.' },
        { term: 'CQRS', def: 'Command Query Responsibility Segregation: use one model to change data and a different model to read it.' },
        { term: 'Event sourcing', def: 'Storing every state change as an immutable event and deriving current state by replaying them.' },
        { term: 'Projection', def: 'A read model built by folding events in order, such as a balance table or a monthly statement.' },
        { term: 'Upcasting', def: 'Converting an old event version to the current shape as it is read, without rewriting stored events.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Separate operational and analytical data</b>: different workloads, different stores, explicit flows between them',
        '<b>One writer per fact</b>: each piece of data has exactly one owning system; everything else is a copy',
        '<b>Immutable raw landing</b>: keep the raw input (bronze or the event log) so you can recompute anything downstream',
        '<b>Data as a product</b>: owned, documented, versioned, with quality and freshness SLOs',
        '<b>Models fit the question</b>: write model for invariants, read models and star schemas for queries',
        '<b>Governance as code</b>: access, classification and retention enforced by the platform, not by wiki pages'
      ],
      nonFunctional: [
        'Analytical queries never touch the OLTP primary (0 report queries on the write path)',
        'Read-model / silver freshness: seconds for operational projections, &lt; 1 h for most analytics (<em>typical targets</em>)',
        'Any projection or gold table can be rebuilt from raw data within an agreed window (e.g. &lt; 4 h)',
        'Time to a new trusted dataset: days, not a quarter in a central queue',
        'Every dataset has a named owner and lineage back to its source',
        'Personal data erasable within the legal deadline, even from immutable logs'
      ],
      outOfScope: [
        '<b>Data swamp</b>: a lake with no owners, schemas or catalog',
        '<b>Event sourcing everywhere</b>: applied to every CRUD screen instead of the few domains that need history',
        '<b>Mesh as a rename</b>: the central team still does all the work, now called "platform"',
        '<b>Events as a shared database</b>: other services reading your internal event schema as their API',
        '<b>Reports on the primary</b>: analytics scanning the operational database'
      ]
    },

    calculator: {
      inputs: [
        { id: 'perDay', label: 'Events per day', min: 10000, max: 500000000, value: 5000000, log: true, fmt: 'num' },
        { id: 'size', label: 'Average event size (payload + metadata)', min: 100, max: 10000, value: 600, unit: 'B', log: true },
        { id: 'years', label: 'Retention (event sourcing usually keeps all)', min: 1, max: 10, value: 5, unit: 'yr' },
        { id: 'stream', label: 'Events per aggregate stream (lifetime)', min: 10, max: 100000, value: 2000, log: true, fmt: 'num' },
        { id: 'snap', label: 'Snapshot every N events', min: 10, max: 10000, value: 200, log: true, fmt: 'num' },
        { id: 'proj', label: 'Projections (read models)', min: 1, max: 30, value: 6 }
      ],
      outputs: [
        { label: 'Events stored', fmt: 'num', f: (v) => total(v) },
        { label: 'Event store size (×1.5 for indexes, estimate)', fmt: 'bytes', f: (v) => total(v) * v.size * 1.5 },
        { label: 'Load one aggregate: no snapshot vs snapshot', fmt: 'raw', f: (v) => { const a = v.stream * PER_EVENT_MS + RTT_MS, b = Math.min(v.stream, v.snap) * PER_EVENT_MS + 2 * RTT_MS; return v.stream.toLocaleString() + ' ev ≈ ' + dur(a / 1000) + ' vs ≤ ' + Math.min(v.stream, v.snap).toLocaleString() + ' ev ≈ ' + dur(b / 1000); } },
        { label: 'Rebuild one projection from event 0', fmt: 'raw', f: (v) => dur(total(v) / PROJ_RATE) },
        { label: 'Rebuild all projections (one at a time · in parallel)', fmt: 'raw', f: (v) => dur(total(v) * v.proj / PROJ_RATE) + ' · ' + dur(total(v) / PROJ_RATE) },
        { label: 'Snapshot store (latest per stream, ~4× event size)', fmt: 'bytes', f: (v) => (v.stream >= v.snap ? total(v) / v.stream * v.size * 4 : 0) }
      ],
      note: 'Throughputs are <em>estimates</em>: ~50k events/s for one projector applying simple updates, ~20 µs per event when rehydrating an aggregate, 1 ms per round trip. Measure your own. The key lesson: <b>snapshots shorten aggregate loads, not projection rebuilds</b>. A new or fixed projection must fold every event since event 0 (or since its own checkpoint), so rebuild time grows with total history. That is why teams keep projections cheap, rebuild in parallel or from a lakehouse copy, and keep streams short (close the books and start a new stream each period).'
    },

    api: [
      { m: 'ADR', p: 'ADR-014: Event-source the Ledger, CRUD elsewhere', d: 'Which bounded contexts use event sourcing and why (audit, temporal queries), which stay CRUD, how events reach analytics (outbox or CDC), and the erasure strategy for personal data.' },
      { m: 'EVENT', p: 'ledger.MoneyWithdrawn v2', d: 'Domain event schema: <code>accountId</code>, <code>amountCents</code>, <code>currency</code>, <code>occurredAt</code>, metadata (causation, correlation, schemaVersion). Past tense, business language, additive changes only.' },
      { m: 'SQL', p: 'events (stream_id, version) UNIQUE', d: 'Append-only table. The unique key gives <b>optimistic concurrency</b>: two writers with the same expected version cannot both append.' },
      { m: 'YAML', p: 'Data product contract: ledger.daily_balances', d: 'Owner team, schema, freshness SLO (e.g. by 06:00 UTC), quality checks, classification (PII), access policy and deprecation window. Lives in Git with the code that produces it.' },
      { m: 'POLICY', p: 'Federated governance rules', d: 'Global rules every product must satisfy, enforced by the platform: naming, PII tagging, encryption, retention, interoperable IDs. Domains decide everything else.' },
      { m: 'DOC', p: 'Medallion layer conventions', d: 'Bronze: raw, append-only, as received. Silver: deduplicated, typed, conformed keys, merged to current state. Gold: business aggregates and star schemas per use case.' }
    ],
    dataModel: [
      { name: 'events', store: 'Postgres (event store)', fields: [['global_position', 'bigint identity', 'pk'], ['stream_id', 'uuid', 'idx'], ['version', 'int'], ['event_type', 'text'], ['schema_version', 'smallint'], ['payload', 'jsonb'], ['recorded_at', 'timestamptz']], note: 'UNIQUE (stream_id, version) is the concurrency guard. Never UPDATE or DELETE rows (except erasure tooling).' },
      { name: 'snapshots', store: 'Postgres', fields: [['stream_id', 'uuid', 'pk'], ['version', 'int'], ['state', 'jsonb'], ['state_schema', 'smallint']], note: 'A cache of folded state. Safe to delete at any time; rebuilt from events.' },
      { name: 'projection_checkpoint', store: 'Postgres (read DB)', fields: [['projection', 'text', 'pk'], ['position', 'bigint'], ['updated_at', 'timestamptz']], note: 'Written in the same transaction as the read-model update, so a projector restarts exactly where it stopped.' },
      { name: 'silver.accounts', store: 'Delta Lake / Iceberg', fields: [['account_id', 'string', 'pk'], ['balance_cents', 'bigint'], ['status', 'string'], ['source_version', 'bigint'], ['_ingested_at', 'timestamp']], note: 'Current state merged from bronze events or CDC. source_version makes the MERGE idempotent and order-safe.' }
    ],

    architecture: {
      title: 'Operational CQRS + ES feeding a lakehouse',
      nodes: [
        { id: 'client', label: 'Clients', sub: 'app · partners', kind: 'client', wide: [90, 60], tall: [70, 0], tip: 'Send commands (withdraw 50) and queries (show balance) to different endpoints.' },
        { id: 'cmd', label: 'Command API', sub: 'validate intent', kind: 'edge', wide: [280, 60], tall: [210, 0], tip: 'Accepts commands, loads the aggregate, and returns success or a business error. No reads for screens here.' },
        { id: 'agg', label: 'Account aggregate', sub: 'rehydrate · decide', kind: 'service', wide: [470, 60], tall: [350, 0], tip: 'Rebuilds state from snapshot + events, checks invariants (no overdraft, not closed) and emits new events.' },
        { id: 'es', label: 'Event store', sub: 'append-only log', kind: 'store', wide: [660, 60], tall: [350, 105], tip: 'Postgres table, EventStoreDB/KurrentDB or Axon Server. Source of truth. (stream_id, version) unique.' },
        { id: 'bus', label: 'Event feed', sub: 'subscription · Kafka', kind: 'queue', wide: [850, 60], tall: [210, 105], tip: 'Projectors and downstream consumers tail the log by global position. Published integration events can differ from internal ones.' },
        { id: 'proj', label: 'Projectors', sub: 'balance · statement', kind: 'compute', wide: [660, 170], tall: [210, 210], tip: 'Fold events into read models and store a checkpoint. Idempotent, rebuildable from event 0.' },
        { id: 'read', label: 'Read models', sub: 'Postgres · Redis · ES', kind: 'cache', wide: [470, 170], tall: [70, 210], tip: 'Denormalised views shaped for each screen. Eventually consistent with the event store.' },
        { id: 'query', label: 'Query API', sub: 'read-only', kind: 'edge', wide: [280, 170], tall: [70, 105], tip: 'Serves screens from read models. Can return the version it reflects so clients can wait for their own write.' },
        { id: 'bronze', label: 'Bronze', sub: 'raw events · Delta', kind: 'store', wide: [850, 300], tall: [350, 210], tip: 'Raw, append-only copy of every event as received. Cheap object storage plus an open table format.' },
        { id: 'silver', label: 'Silver', sub: 'clean · MERGE state', kind: 'store', wide: [660, 300], tall: [350, 315], tip: 'Deduplicated, typed and conformed. Current state per entity via MERGE.' },
        { id: 'gold', label: 'Gold', sub: 'facts · dimensions', kind: 'store', wide: [470, 300], tall: [210, 315], tip: 'Business-level aggregates and star schemas (Kimball) per use case.' },
        { id: 'bi', label: 'BI · ML · domains', sub: 'consumers', kind: 'client', wide: [280, 300], tall: [70, 315], tip: 'Dashboards, notebooks, feature stores and other domains consuming data products.' },
        { id: 'gov', label: 'Governance', sub: 'catalog · PII · ACL', kind: 'policy', wide: [560, 410], tall: [210, 420], tip: 'Catalog, lineage, classification and access policy applied by the platform (e.g. Unity Catalog, Polaris, OpenMetadata).' }
      ],
      edges: [
        { from: 'client', to: 'cmd' },
        { from: 'cmd', to: 'agg' },
        { from: 'agg', to: 'es', bidi: true },
        { from: 'es', to: 'bus' },
        { from: 'bus', to: 'proj' },
        { from: 'proj', to: 'read' },
        { from: 'query', to: 'read' },
        { from: 'client', to: 'query' },
        { from: 'bus', to: 'bronze' },
        { from: 'bronze', to: 'silver' },
        { from: 'silver', to: 'gold' },
        { from: 'gold', to: 'bi' },
        { from: 'gov', to: 'silver', dashed: true },
        { from: 'gov', to: 'gold', dashed: true }
      ]
    },

    scenarios: [
      {
        id: 'write', title: 'Command → events (write side)', tone: 'info',
        steps: [
          { text: 'A client sends <code>Withdraw(acct-7, 50.00)</code> to the <b>Command API</b>. Commands are intents in the imperative; they may be rejected.', flow: ['client>cmd'], badges: { cmd: 'Withdraw 50' } },
          { text: 'The aggregate loads its latest <b>snapshot</b> (version 400) plus the 12 events after it, and folds them into current state: balance 120.00, open.', flow: ['cmd>agg', 'agg>es'], badges: { agg: 'v412 · 120.00' } },
          { text: 'Invariants pass (enough funds, not closed). The aggregate emits <code>MoneyWithdrawn v2</code>, a fact in the past tense.', nodes: ['agg'], ok: ['agg'], badges: { agg: ['MoneyWithdrawn', 'ok'] } },
          { text: 'Append with <b>expected version 412</b>. The row gets version 413; the unique (stream_id, version) key makes the check atomic. No UPDATE ever happens.', flow: ['agg>es'], ok: ['es'], badges: { es: ['v413 appended', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'read', title: 'Projections & eventual consistency', tone: 'warn',
        steps: [
          { text: 'Projectors tail the log by global position. The balance projector updates its row <b>and</b> its checkpoint in one transaction.', flow: ['es>bus', 'bus>proj', 'proj>read'], badges: { proj: 'pos 9,812,331' } },
          { text: 'The same event feeds a monthly-statement view and a fraud-score view. Each read model has its own shape and can live in a different store.', flow: ['bus>proj', 'proj>read'], badges: { read: '3 views' } },
          { text: 'The client immediately queries the balance and sees <b>120.00</b>, not 70.00: the projector is 300 ms behind. This is the cost of separating the models.', flow: ['client>query', 'query>read'], warn: ['read'], badges: { read: ['stale 300 ms', 'warn'] }, tone: 'warn' },
          { text: 'Fixes: return the new version from the command and let the query wait until the read model reaches it, or show the result optimistically in the UI. Do not read the event store for screens.', flow: ['client>query', 'query>read'], ok: ['read'], badges: { query: ['wait ≥ v413', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'conflict', title: 'Concurrent writes: optimistic concurrency', tone: 'warn',
        steps: [
          { text: 'Two requests withdraw 100.00 from the same account at the same moment. Both load version 413 with balance 120.00.', flow: [['client>cmd', 'cmd>agg']], badges: { agg: '2 × v413' } },
          { text: 'Both decide the withdrawal is valid. Both try to append version 414.', flow: ['agg>es'], warn: ['agg'], badges: { agg: ['both OK?', 'warn'] } },
          { text: 'The first insert wins. The second violates <b>UNIQUE (stream_id, version)</b> and fails: no overdraft, no lock held while deciding.', nodes: ['es'], err: ['agg'], ok: ['es'], badges: { es: ['23505 conflict', 'err'] }, tone: 'warn' },
          { text: 'The loser reloads (version 414, balance 20.00), re-runs the command and now rejects it with <b>InsufficientFunds</b>. Retries are safe because commands are re-decided on fresh state.', flow: ['cmd>agg', 'agg>es'], ok: ['agg'], badges: { agg: ['rejected', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'bug', title: 'Projection bug → rebuild from history', tone: 'err',
        steps: [
          { text: 'A release changes the statement projector and it starts counting reversals twice. Statements for 40k accounts are wrong.', nodes: ['proj', 'read'], err: ['proj', 'read'], badges: { read: ['wrong totals', 'err'] }, tone: 'err' },
          { text: 'With CRUD the overwritten rows would be lost. Here the <b>events are untouched</b>: the bug only lives in a derived view.', nodes: ['es'], ok: ['es'], badges: { es: ['truth intact', 'ok'] } },
          { text: 'Deploy the fix as a <b>new projection</b> (statement_v2) that replays from position 0 next to the old one. Snapshots do not help here: every event is read.', flow: ['es>bus', 'bus>proj', 'proj>read'], badges: { proj: ['replay 2.4 h', 'warn'] }, tone: 'warn' },
          { text: 'When v2 catches up, switch the Query API to it and drop v1. Blue-green for read models.', flow: ['query>read'], ok: ['read', 'proj'], badges: { query: ['→ statement_v2', 'ok'] }, tone: 'ok' },
          { text: 'An old event shape (<code>Deposited v1</code>, amount as a string) appears in the replay. An <b>upcaster</b> converts it to v2 on read, so projectors only know the current schema.', nodes: ['bus'], badges: { bus: 'upcast v1→v2' } }
        ]
      },
      {
        id: 'lake', title: 'At scale: events into the lakehouse', tone: 'info',
        steps: [
          { text: 'Every event is also landed raw into <b>bronze</b> (append-only, partitioned by date). It is cheap and lets you recompute anything later.', flow: ['es>bus', 'bus>bronze'], badges: { bronze: '5M ev/day' } },
          { text: 'A streaming job deduplicates, types and <b>MERGEs</b> current account state into <b>silver</b>. A version column makes replays and late events safe.', flow: ['bronze>silver'], badges: { silver: 'MERGE by version' } },
          { text: 'Gold builds a Kimball <b>star schema</b>: fact_transactions with dim_account, dim_date, dim_merchant. Analysts and ML read here, never the event store.', flow: ['silver>gold', 'gold>bi'], ok: ['gold'], badges: { gold: 'star schema' } },
          { text: 'Governance tags <code>iban</code> as PII and masks it in gold for most roles. Policies are applied by the platform, so every domain gets them for free.', flow: ['gov>silver', 'gov>gold'], badges: { gov: ['PII masked', 'ok'] }, tone: 'ok' },
          { text: 'An erasure request arrives. Silver and gold can be rewritten with DELETE + VACUUM, but the event log is immutable: use <b>crypto-shredding</b> (delete the per-customer key) or keep PII out of events.', nodes: ['es', 'bronze'], warn: ['es', 'bronze'], badges: { es: ['GDPR vs immutable', 'warn'] }, tone: 'warn' }
        ]
      }
    ],

    knobs: {
      intro: 'Three decisions that are often bundled but should be made separately. Meters are <em>illustrative</em>, based on the trade-offs described by Dehghani, the CIDR 2021 lakehouse paper and Fowler\'s CQRS warnings.',
      controls: [
        { id: 'ana', label: 'Analytical architecture', type: 'seg', value: 'lakehouse', options: [
          { v: 'dw', l: 'Central warehouse' }, { v: 'lake', l: 'Data lake' }, { v: 'lakehouse', l: 'Lakehouse' }, { v: 'mesh', l: 'Data mesh' }] },
        { id: 'write', label: 'Operational write model', type: 'seg', value: 'cqrs', options: [
          { v: 'crud', l: 'CRUD + CDC' }, { v: 'cqrs', l: 'CQRS (read models)' }, { v: 'es', l: 'CQRS + event sourcing' }] },
        { id: 'org', label: 'Organisation size', type: 'seg', value: 'mid', options: [
          { v: 'small', l: '1–3 teams' }, { v: 'mid', l: '10–30 teams' }, { v: 'large', l: '50+ teams' }] }
      ],
      evaluate(s) {
        const c = (x) => Math.max(0.04, Math.min(0.96, x));
        const A = s.ana, W = s.write, O = s.org;
        const big = O === 'large', small = O === 'small';
        // time to insight: central bottleneck grows with org size; mesh needs maturity
        let tti = { dw: 0.6, lake: 0.55, lakehouse: 0.72, mesh: 0.6 }[A];
        if (A === 'dw' || A === 'lakehouse') tti -= big ? 0.3 : O === 'mid' ? 0.08 : -0.1;
        if (A === 'mesh') tti += big ? 0.25 : small ? -0.3 : 0.05;
        if (A === 'lake') tti -= 0.1;
        if (W === 'es') tti += 0.05;
        let gov = { dw: 0.85, lake: 0.25, lakehouse: 0.7, mesh: big ? 0.65 : 0.4 }[A];
        let cost = { dw: 0.4, lake: 0.8, lakehouse: 0.72, mesh: small ? 0.2 : 0.5 }[A] - (W === 'es' ? 0.12 : W === 'cqrs' ? 0.05 : 0);
        let auto = { dw: 0.2, lake: 0.45, lakehouse: 0.4, mesh: 0.92 }[A];
        let cplx = { dw: 0.75, lake: 0.6, lakehouse: 0.6, mesh: small ? 0.15 : 0.35 }[A] - { crud: 0, cqrs: 0.15, es: 0.38 }[W];
        const lag = { crud: [0.85, 'ms (same DB) · CDC to analytics s–min'], cqrs: [0.6, 'read models 100 ms – s behind'], es: [0.5, 'projections 100 ms – s; rebuilds take hours'] }[W];
        const anaLag = { dw: 'nightly / hourly batch', lake: 'raw in minutes, trusted later', lakehouse: 'streaming silver in minutes', mesh: 'per product SLO' }[A];
        const metrics = [
          { k: 'Time to insight', v: tti >= 0.7 ? 'days' : tti >= 0.45 ? 'weeks' : 'months (queue)', s: c(tti) },
          { k: 'Governance & trust', v: gov >= 0.75 ? 'strong, central' : gov >= 0.55 ? 'good, platform-enforced' : 'weak: swamp risk', s: c(gov) },
          { k: 'Cost efficiency', v: cost >= 0.65 ? 'low: object storage' : cost >= 0.4 ? 'moderate' : 'high: duplicated platforms', s: c(cost) },
          { k: 'Team autonomy', v: auto >= 0.8 ? 'domains own data' : auto >= 0.4 ? 'self-serve, central model' : 'central team decides', s: c(auto) },
          { k: 'Complexity (inverse)', v: cplx >= 0.6 ? 'manageable' : cplx >= 0.3 ? 'significant' : 'very high', s: c(cplx) },
          { k: 'Consistency lag', v: lag[1] + ' · ' + anaLag, s: c(lag[0] - (A === 'dw' ? 0.15 : 0)) }
        ];
        const notes = [];
        if (A === 'dw') notes.push('Inmon (normalised enterprise core, marts on top) or Kimball (conformed star schemas, bus matrix). Strong trust, but every new source waits for the <b>central team</b>' + (big ? ', which at 50+ teams becomes the bottleneck.' : '.'));
        if (A === 'lake') notes.push('Schema-on-read and cheap storage, but without transactions, owners and a catalog the lake drifts into a <b>swamp</b>. The CIDR 2021 paper lists staleness and reliability as the classic two-tier pain.');
        if (A === 'lakehouse') notes.push('Open table formats (Delta, Iceberg, Hudi) add ACID, schema enforcement and time travel to files, so one copy serves BI and ML. Organisationally it is still <b>central</b> unless you add domain ownership.');
        if (A === 'mesh') notes.push(small ? 'Data mesh at 1–3 teams is overhead: four principles, a platform and federated governance for a handful of datasets. <b>Dehghani herself frames it for scale and complexity.</b>' : 'Mesh is an <b>operating model</b>: domains own data products, a platform team makes that cheap, and global rules are enforced as code. It usually runs <i>on</i> a lakehouse.');
        if (W === 'cqrs') notes.push('CQRS without event sourcing: the write DB stays normal, and read models are fed by an outbox or CDC. Fowler warns CQRS adds risky complexity for most systems: use it per bounded context.');
        if (W === 'es') notes.push('Event sourcing buys audit, temporal queries and rebuildable views, and costs <b>event versioning</b>, snapshots, projection rebuilds and GDPR work. Greg Young advised against building a whole system this way.');
        if (W === 'crud') notes.push('CRUD plus CDC (or an outbox) is the default: simple, strongly consistent writes, with changes streamed to analytics. See <a href="cdc-pipelines.html">CDC pipelines</a>.');
        let verdict;
        if (A === 'mesh' && small) verdict = '❌ <b>Mesh for a small org</b> buys coordination overhead without the scale problem it solves. Use a lakehouse with one team.';
        else if (A === 'lake' && !small) verdict = '⚠ <b>A raw lake at this size</b> becomes a swamp. Add an open table format, medallion layers and a catalog: a lakehouse.';
        else if (A === 'dw' && big) verdict = '⚠ <b>Central warehouse at 50+ teams</b>: trusted, but the central queue sets your time to insight. Consider mesh-style ownership on top.';
        else if (W === 'es' && small) verdict = '⚠ <b>Event sourcing with a small team</b> is justified only if history is the product (ledger, audit). Otherwise CRUD + CDC.';
        else if (A === 'mesh' && big) verdict = '✅ <b>Mesh at scale</b>: domain-owned products on a shared lakehouse platform with governance as code. Say why the org, not the tech, demanded it.';
        else if (A === 'lakehouse') verdict = '✅ <b>Lakehouse with a sensible write model</b>: the common default today. Keep ES and CQRS to the bounded contexts that need them.';
        else verdict = '👍 <b>Workable.</b> Check the weakest meter: that is the argument you will need to defend in the review.';
        const labels = {
          bronze: A === 'dw' ? { label: 'Staging', sub: 'ETL landing' } : A === 'mesh' ? { label: 'Domain raw', sub: 'owned by Ledger team' } : { label: 'Bronze', sub: A === 'lake' ? 'raw files · Parquet' : 'raw events · Delta' },
          silver: A === 'dw' ? { label: 'EDW core', sub: A === 'dw' ? 'Inmon 3NF / Kimball' : '' } : A === 'lake' ? { label: 'Curated zone', sub: 'schema-on-read' } : A === 'mesh' ? { label: 'Data product', sub: 'contract · SLO' } : { label: 'Silver', sub: 'clean · MERGE state' },
          gold: A === 'dw' ? { label: 'Data marts', sub: 'star schemas' } : A === 'mesh' ? { label: 'Consumer products', sub: 'aggregates per domain' } : { label: 'Gold', sub: 'facts · dimensions' },
          gov: A === 'mesh' ? { label: 'Federated gov.', sub: 'policy as code' } : A === 'lake' ? { label: 'Catalog?', sub: 'often missing' } : { label: 'Governance', sub: 'central catalog · ACL' },
          es: W === 'es' ? { label: 'Event store', sub: 'append-only log' } : { label: 'OLTP DB', sub: W === 'cqrs' ? 'rows + outbox' : 'rows · UPDATE' },
          bus: W === 'crud' ? { label: 'CDC stream', sub: 'Debezium · Kafka' } : { label: 'Event feed', sub: W === 'es' ? 'subscription · Kafka' : 'outbox · Kafka' }
        };
        const hide = W === 'crud' ? ['proj', 'read'] : [];
        const flow = ['client>cmd', 'cmd>agg', 'agg>es', 'es>bus'];
        if (W !== 'crud') flow.push('bus>proj', 'proj>read', 'client>query', 'query>read');
        flow.push('bus>bronze', 'bronze>silver', 'silver>gold', 'gold>bi');
        if (A !== 'lake') flow.push(['gov>silver', 'gov>gold']);
        const badges = { silver: [anaLag, A === 'dw' ? 'warn' : 'info'] };
        if (W === 'es') badges.es = ['replay = truth', 'ok'];
        if (A === 'dw' && big) badges.gold = ['central queue', 'warn'];
        if (A === 'mesh') badges.silver = ['owned by domain', 'ok'];
        return {
          metrics, verdict, notes: notes.slice(0, 4), labels, hide, flow, badges,
          warn: A === 'lake' ? ['gov', 'silver'] : A === 'dw' && big ? ['gold'] : [],
          err: A === 'mesh' && small ? ['gov'] : [],
          ok: A === 'lakehouse' || (A === 'mesh' && big) ? ['silver'] : [],
          hot: W === 'es' ? ['es'] : []
        };
      }
    },

    widget: {
      title: 'Event-sourced bank account: append, replay, snapshot, upcast',
      caption: 'Each cell is one immutable event. <b>Deposit</b>, <b>withdraw</b> or <b>close</b> to append (the aggregate rejects overdrafts using state rebuilt from events). <b>Rehydrate</b> to load the account and see how many events it reads with and without snapshots. <b>Rebuild projections</b> replays every event into three read models. Add a legacy <b>v1 event</b> and turn the upcaster off to see a replay break.'
    },

    realWorld: {
      intro: 'Most of the vocabulary comes from a handful of primary sources. Read them before quoting them: several are often misread.',
      timeline: [
        { when: '1990s', who: 'Bill Inmon · Ralph Kimball', title: 'Two schools of the data warehouse', text: 'Inmon: a top-down, normalised (3NF) enterprise warehouse as the single source of truth, with departmental marts derived from it. Kimball: bottom-up <b>dimensional models</b> (facts surrounded by dimensions) per business process, integrated through <b>conformed dimensions</b> on a bus matrix. Most real warehouses mix both.', src: 11 },
        { when: '2005', who: 'Martin Fowler', title: 'Event Sourcing (eaaDev)', text: 'Fowler describes capturing <b>all changes to application state as a sequence of events</b>, using the ledger example: record "add $10", not "set balance to $110". He notes such systems were then fairly rare in enterprise applications.', src: 0 },
        { when: '2010–2011', who: 'Greg Young · Fowler', title: 'CQRS named', text: 'Greg Young popularised Command Query Responsibility Segregation, building on Bertrand Meyer\'s command-query separation. Fowler\'s 2011 bliki entry credits Young and warns that for most systems CQRS adds <b>risky complexity</b>; use it only on parts of a system.', src: 1 },
        { when: '2014 · 2016', who: 'Greg Young', title: '"Not a top-level architecture"', text: 'Young: you can use CQRS without event sourcing, but event sourcing practically requires CQRS. At DDD Europe 2016 he warned against building a <b>whole system</b> on event sourcing; apply it inside the bounded contexts that need it.', src: 2 },
        { when: '2016–2017', who: 'Uber · Netflix', title: 'Hudi and Iceberg: transactions on the lake', text: 'Uber built Hudi to apply <b>updates and deletes</b> to ride data in HDFS without rewriting whole partitions. Netflix created Iceberg to fix Hive tables (atomic commits, schema evolution, hidden partitioning). Both became Apache projects; Databricks open-sourced Delta Lake in 2019.', src: 7 },
        { when: '2017+', who: 'Greg Young', title: 'Versioning in an Event Sourced System', text: 'Free Leanpub book on the hardest part of ES: changing events that are already stored. Covers type-based versioning, weak schemas, <b>upcasting</b> and copy-transform streams, and argues strongly against editing stored events.', src: 3 },
        { when: 'May 2019', who: 'Zhamak Dehghani', title: 'From a monolithic data lake to a data mesh', text: 'The Thoughtworks article that started the movement: centralised, domain-agnostic data platforms with hyper-specialised teams do not scale; apply <b>domain-driven ownership</b> and platform thinking to analytical data.', src: 4 },
        { when: 'Dec 2020', who: 'Zhamak Dehghani', title: 'Data Mesh Principles and Logical Architecture', text: 'Four principles: <b>domain-oriented decentralised data ownership</b>, <b>data as a product</b>, <b>self-serve data infrastructure as a platform</b>, and <b>federated computational governance</b>. Data products should be discoverable, addressable, trustworthy, self-describing, interoperable and secure.', src: 5 },
        { when: 'Jan 2021', who: 'Armbrust, Ghodsi, Xin, Zaharia', title: 'Lakehouse paper (CIDR 2021)', text: 'Argues the two-tier lake + warehouse architecture will wither, replaced by <b>lakehouses</b> on open formats such as Parquet with a transactional metadata layer, citing staleness, reliability, cost and lock-in. Reports TPC-DS results competitive with cloud warehouses.', src: 6 },
        { when: '2020–2021', who: 'Zalando · Intuit', title: 'Mesh in practice', text: 'Zalando (Max Schultze, Arif Wider) described moving from a central lake to domain-owned data with a shared platform, calling it a journey still far from an end state. Intuit published its data mesh strategy around data products with clear owners.', src: 9 },
        { when: 'today', who: 'Databricks', title: 'Medallion architecture', text: 'Bronze (raw), silver (validated), gold (enriched). Databricks docs call it a <b>recommended best practice, not a requirement</b>, and advise building silver from bronze rather than writing directly from ingestion.', src: 8 }
      ],
      lessons: [
        'Separate <b>operational</b> and <b>analytical</b> data; connect them with events or CDC, never with report queries.',
        'Keep <b>raw, immutable input</b> (bronze or the event log): it turns bugs into rebuilds instead of data loss.',
        'Data mesh is an <b>organisational</b> change on top of a platform, not a product you install.',
        'Use CQRS and event sourcing <b>per bounded context</b>, where history or read/write asymmetry pays for the complexity.',
        'Plan <b>event versioning and erasure</b> on day one; both are painful to retrofit.'
      ],
      sources: [
        { title: 'Event Sourcing', url: 'https://martinfowler.com/eaaDev/EventSourcing.html', pub: 'Martin Fowler, 2005' },
        { title: 'CQRS', url: 'https://www.martinfowler.com/bliki/CQRS.html', pub: 'Martin Fowler, bliki, 2011' },
        { title: 'Transcript of Greg Young\'s talk at Code on the Beach 2014: CQRS and Event Sourcing', url: 'https://kurrent.io/blog/transcript-of-greg-youngs-talk-at-code-on-the-beach-2014-cqrs-and-event-sourcing', pub: 'Kurrent (Event Store) blog' },
        { title: 'Versioning in an Event Sourced System', url: 'https://leanpub.com/esversioning', pub: 'Greg Young, Leanpub' },
        { title: 'Data mesh: the beginning, revisited', url: 'https://www.nextdata.com/our-pov/data-mesh-the-beginning-revisited', pub: 'Nextdata (Zhamak Dehghani)' },
        { title: 'Data Mesh Principles and Logical Architecture', url: 'https://martinfowler.com/articles/data-mesh-principles.html', pub: 'Zhamak Dehghani, martinfowler.com, Dec 2020' },
        { title: 'Lakehouse: A New Generation of Open Platforms that Unify Data Warehousing and Advanced Analytics', url: 'https://vldb.org/cidrdb/2021/lakehouse-a-new-generation-of-open-platforms-that-unify-data-warehousing-and-advanced-analytics.html', pub: 'Armbrust et al., CIDR 2021' },
        { title: 'Apache Hudi at Uber', url: 'https://www.uber.com/blog/apache-hudi-at-uber', pub: 'Uber Engineering' },
        { title: 'What is the medallion lakehouse architecture?', url: 'https://docs.databricks.com/aws/en/lakehouse/medallion.html', pub: 'Databricks documentation' },
        { title: 'Data Mesh in Practice: How Europe\'s Leading Online Platform for Fashion Goes Beyond the Data Lake', url: 'https://www.slideshare.net/slideshow/data-mesh-in-practice-how-europes-leading-online-platform-for-fashion-goes-beyond-the-data-lake-236728093/236728093', pub: 'Max Schultze, Arif Wider (Zalando, Thoughtworks), 2020' },
        { title: 'Intuit\'s Data Mesh Strategy', url: 'https://medium.com/intuit-engineering/intuits-data-mesh-strategy-778e3edaa017', pub: 'Tristan Baker, Intuit Engineering, 2021' },
        { title: 'Kimball vs Inmon', url: 'https://keboola.com/blog/kimball-vs-inmon', pub: 'Keboola (secondary summary)' },
        { title: 'Event sourcing as an anti-pattern? (Greg Young, DDD Europe 2016)', url: 'https://www.infoq.com/news/2016/04/event-sourcing-anti-pattern', pub: 'InfoQ, 2016' },
        { title: 'The difference between Hudi and Iceberg', url: 'https://www.starburst.io/blog/hudi-vs-iceberg/', pub: 'Starburst' }
      ]
    },

    tradeoffs: {
      headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
      rows: [
        ['Warehouse modelling', '<b>Inmon</b>: normalised enterprise core, marts derived', '<b>Kimball</b>: conformed star schemas per process', 'Kimball for fast BI delivery; an Inmon-style core when many sources must reconcile to one truth first. Most teams blend them.'],
        ['ETL vs ELT', '<b>ETL</b>: transform before loading', '<b>ELT</b>: load raw, transform in the warehouse/lakehouse (dbt, Spark)', 'ELT by default (cheap storage, replayable); ETL when data must be masked or reduced before it lands.'],
        ['Lake vs lakehouse', '<b>Lake</b>: files + schema-on-read', '<b>Lakehouse</b>: files + Delta/Iceberg/Hudi (ACID, time travel)', 'Lakehouse almost always now; a raw lake only as a landing zone.'],
        ['Central vs mesh', '<b>Central team</b> owns pipelines and models', '<b>Data mesh</b>: domains own data products on a shared platform', 'Mesh when many domains, a central backlog, and teams able to own data; central when small or immature.'],
        ['CRUD vs CQRS vs ES', '<b>CRUD + CDC</b>: one model, strongly consistent', '<b>CQRS (+ES)</b>: separate models, events as truth', 'ES where audit, temporal queries or rebuildable views are core (ledger, claims); CQRS for read-heavy views; CRUD elsewhere.'],
        ['Polyglot persistence', '<b>One database</b> for all models', '<b>Store per read model</b> (Postgres, Elasticsearch, Redis)', 'Add a store only when a query shape demands it; each one is another thing to operate and keep in sync.']
      ]
    },
    failures: [
      { f: 'Data swamp', detect: 'Datasets without owners, schema or lineage; analysts copy files to laptops', fix: 'Open table format, medallion layers, catalog with mandatory owner and classification; delete what nobody claims.' },
      { f: 'Mesh in name only', detect: 'Domain teams have no data engineers; the "platform" team still writes every pipeline', fix: 'Fund domain data roles, make the platform self-serve (templates, contracts, quality checks), start with 2–3 willing domains.' },
      { f: 'Event schema change breaks replay', detect: 'Projection rebuild or aggregate load fails on old events; deserialisation errors', fix: 'Schema version on every event, additive changes, upcasters in the read path, replay tests over production-like history in CI.' },
      { f: 'Read-your-own-write confusion', detect: 'Users see stale balances right after an action; support tickets about "missing" changes', fix: 'Return the new version and wait for the read model, optimistic UI, or read the aggregate for that one screen.' },
      { f: 'Projection rebuild takes days', detect: 'A fix to one view needs a multi-day replay; new read models are avoided', fix: 'Parallel projectors, cheap idempotent handlers, short streams (close the books per period), rebuild from the lakehouse copy.' },
      { f: 'Internal events used as public API', detect: 'Other teams break when you rename a field in a domain event', fix: 'Publish separate, versioned <b>integration events</b> or data products; keep internal events private to the bounded context.' },
      { f: 'GDPR erasure impossible', detect: 'PII inside immutable events and bronze files with no deletion path', fix: 'Keep PII in a separate erasable store referenced by ID, or crypto-shred with per-subject keys; DELETE + VACUUM in Delta/Iceberg tables.' }
    ],

    interview: [
      { q: 'What is the difference between a data warehouse, a data lake and a lakehouse?', a: '<p>A <b>warehouse</b> stores curated, structured data with schema-on-write, optimised for SQL and BI (Inmon or Kimball modelling). A <b>lake</b> stores raw files of any type cheaply with schema-on-read, good for ML and landing but easy to turn into a swamp.</p><p>A <b>lakehouse</b> (Armbrust et al., CIDR 2021) puts a transactional metadata layer (Delta Lake, Iceberg, Hudi) over open files, adding ACID, schema enforcement and time travel so one copy serves BI and ML. It removes the lake-to-warehouse copy and its staleness.</p>', fu: 'What does the table format actually store to give you ACID?', lvl: 'core' },
      { q: 'Inmon vs Kimball: explain both and which you would choose.', a: '<p><b>Inmon</b>: top-down, a normalised (3NF) enterprise warehouse as the integrated truth, with dimensional marts derived from it. <b>Kimball</b>: bottom-up dimensional models per business process (fact tables plus dimension tables) tied together by <b>conformed dimensions</b>.</p><p>I would usually build Kimball-style gold models on a lakehouse, with a cleaned, conformed silver layer playing a role similar to Inmon\'s integrated core.</p>', lvl: 'core' },
      { q: 'What is data mesh? State the four principles precisely.', a: '<p>Zhamak Dehghani (Thoughtworks, 2019 article; principles on martinfowler.com, Dec 2020): <ol><li><b>Domain-oriented decentralised data ownership</b> and architecture</li><li><b>Data as a product</b></li><li><b>Self-serve data infrastructure as a platform</b></li><li><b>Federated computational governance</b></li></ol></p><p>Common misreading: it is not a technology and not "every team runs its own stack". It is an operating model, usually on a shared lakehouse platform.</p>', fu: 'What makes a dataset a product rather than a table?', lvl: 'core' },
      { q: 'When does data mesh fail?', a: '<ul><li>The organisation is small, so the coordination cost outweighs the central bottleneck it removes.</li><li>Domain teams have no data skills or incentive; "ownership" is just a label.</li><li>No self-serve platform, so each domain reinvents pipelines and costs explode.</li><li>No global rules (IDs, PII, quality), so products do not join: many small swamps.</li></ul><p>I would start with 2–3 willing domains and a thin platform, and measure time to a new trusted dataset.</p>', lvl: 'deep' },
      { q: 'ETL vs ELT, and what is the medallion architecture?', a: '<p><b>ETL</b> transforms before loading; <b>ELT</b> loads raw and transforms inside the warehouse or lakehouse, which is now the default because storage is cheap and raw data can be reprocessed.</p><p><b>Medallion</b> (Databricks term) structures ELT as <b>bronze</b> raw, <b>silver</b> validated and conformed, <b>gold</b> business-level aggregates. Databricks calls it a best practice, not a requirement.</p>', lvl: 'core' },
      { q: 'Explain CQRS. Is it the same as event sourcing?', a: '<p>CQRS (Greg Young, building on Meyer\'s command-query separation) uses <b>one model to update</b> and <b>another to read</b>. The read side can be denormalised views, even in other stores.</p><p>It is <b>not</b> event sourcing: you can feed read models from a normal database via an outbox or CDC. Event sourcing almost always needs CQRS, because querying an event log directly is impractical. Fowler warns CQRS adds risky complexity for most systems; apply it per bounded context.</p>', lvl: 'core' },
      { q: 'How does event sourcing work, and how do you handle concurrency?', a: '<p>Each aggregate has a <b>stream</b> of immutable events. To handle a command you load the stream (from a snapshot plus later events), fold it into state, check invariants, and append new events.</p><p>Concurrency: append with an <b>expected version</b>. In Postgres a <code>UNIQUE (stream_id, version)</code> constraint makes the second writer fail; it reloads and re-decides. No locks are held while deciding.</p>', fu: 'How would a projector tail a Postgres event table without missing rows from slow transactions?', lvl: 'core' },
      { q: 'What are snapshots for, and what do they not solve?', a: '<p>A snapshot caches folded aggregate state at version N, so loading reads at most the events after it. It is a <b>performance cache</b>: you can delete it and rebuild.</p><p>It does not speed up <b>projection rebuilds</b>, which must read every event from position 0, and it must be versioned too (a state schema change invalidates old snapshots). Often the better fix is shorter streams, for example closing an account period.</p>', lvl: 'deep' },
      { q: 'How do you version events? What is upcasting?', a: '<p>Stored events never change. Options (Greg Young\'s versioning book): new event types, <b>weak schemas</b> with tolerant readers and additive fields, <b>upcasters</b> that convert old versions to the current shape on read, and as a last resort a <b>copy-and-transform</b> into a new stream.</p><p>Upcasting keeps handlers simple: they only know the latest version. Test it by replaying production-like history in CI.</p>', lvl: 'deep' },
      { q: 'Event sourcing and GDPR erasure: how do you reconcile them?', a: '<p>Immutable logs conflict with the right to erasure. Options: <b>keep PII out of events</b> (store a reference to an erasable PII store), or <b>crypto-shredding</b>: encrypt personal fields with a per-subject key and delete the key. Projections and lakehouse tables can be rewritten (DELETE then VACUUM in Delta, expire snapshots in Iceberg). Check with legal whether shredding counts as erasure in your context.</p>', lvl: 'deep' },
      { q: 'When would you NOT use event sourcing or CQRS?', a: '<ul><li>CRUD forms with no audit or temporal question.</li><li>Teams new to it on a deadline: versioning, projections and eventual consistency are a steep curve.</li><li>Where strong read-after-write is required everywhere and you cannot design the UI around lag.</li></ul><p>Default: CRUD + outbox/CDC. Use ES for ledgers, claims, bookings and workflows where the history is itself valuable.</p>', lvl: 'core' },
      { q: 'Your VP wants to "adopt data mesh" next quarter. How do you respond?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: 25 product teams, a 6-person central data team with a 3-month backlog. <b>Task</b>: decide whether mesh fits. <b>Action</b>: measured the backlog and time to a new dataset (11 weeks median), checked which domains had data skills, proposed a pilot with 2 domains publishing contracts-backed products on the existing lakehouse, with the central team turned into a platform team and 5 global policies automated. <b>Result</b>: pilot products shipped in 3 weeks each; we expanded domain by domain instead of a big-bang reorg.</p>', lvl: 'core' }
    ],

    code: [
      {
        title: 'Postgres event store with optimistic concurrency', lang: 'sql',
        code: `CREATE TABLE events (
  global_position bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stream_id      uuid        NOT NULL,
  version        int         NOT NULL CHECK (version > 0),
  event_type     text        NOT NULL,          -- 'MoneyWithdrawn'
  schema_version smallint    NOT NULL DEFAULT 1,
  payload        jsonb       NOT NULL,
  metadata       jsonb       NOT NULL DEFAULT '{}',  -- correlation, causation
  tx_id          xid8        NOT NULL DEFAULT pg_current_xact_id(),
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_stream_version UNIQUE (stream_id, version)
);

CREATE TABLE snapshots (
  stream_id uuid PRIMARY KEY, version int NOT NULL,
  state_schema smallint NOT NULL, state jsonb NOT NULL
);

-- Append: the caller read version 412 and appends 413.
-- A concurrent writer that also read 412 gets SQLSTATE 23505 and must retry.
INSERT INTO events (stream_id, version, event_type, schema_version, payload)
VALUES ($1, 413, 'MoneyWithdrawn', 2,
        '{"amountCents": 5000, "currency": "EUR"}');

-- Load an aggregate: snapshot first, then only the newer events.
SELECT version, event_type, schema_version, payload
  FROM events
 WHERE stream_id = $1 AND version > $2      -- $2 = snapshot version or 0
 ORDER BY version;

-- Tail for projectors. Identity values are assigned before commit, so a
-- slow transaction can commit a lower position later. Only read rows from
-- transactions older than every in-flight one.
SELECT global_position, stream_id, event_type, schema_version, payload
  FROM events
 WHERE global_position > $1                 -- projector checkpoint
   AND tx_id < pg_snapshot_xmin(pg_current_snapshot())
 ORDER BY global_position
 LIMIT 500;`,
        note: 'Postgres 13+ (<code>xid8</code>, <code>pg_current_xact_id</code>). The unique constraint is the whole concurrency story. The <code>xmin</code> filter prevents projectors from skipping events committed out of position order.'
      },
      {
        title: 'Java 21: aggregate rehydration, upcasting and a projection', lang: 'java',
        code: `sealed interface AccountEvent permits Opened, Deposited, Withdrawn, Closed {}
record Opened(String owner) implements AccountEvent {}
record Deposited(long amountCents, String currency) implements AccountEvent {}
record Withdrawn(long amountCents, String currency) implements AccountEvent {}
record Closed() implements AccountEvent {}

final class Account {
  private long balance; private boolean closed; private int version;

  static Account rehydrate(Snapshot snap, List<AccountEvent> newer) {
    Account a = new Account();
    if (snap != null) { a.balance = snap.balance(); a.closed = snap.closed(); a.version = snap.version(); }
    newer.forEach(a::apply);
    return a;
  }

  private void apply(AccountEvent e) {
    switch (e) {                                   // exhaustive over the sealed type
      case Opened o    -> { }
      case Deposited d -> balance += d.amountCents();
      case Withdrawn w -> balance -= w.amountCents();
      case Closed c    -> closed = true;
    }
    version++;
  }

  /** Decide: returns new events, never mutates storage. */
  List<AccountEvent> withdraw(long cents) {
    if (closed) throw new IllegalStateException("account closed");
    if (cents > balance) throw new InsufficientFunds(balance, cents);
    return List.of(new Withdrawn(cents, "EUR"));
  }
  int version() { return version; }
}

/** Upcaster: v1 stored {"amount":"12.50"} as a decimal string, no currency. */
static AccountEvent upcast(String type, int schemaVersion, JsonNode p) {
  if (type.equals("Deposited") && schemaVersion == 1)
    return new Deposited(new BigDecimal(p.get("amount").asText()).movePointRight(2)
        .longValueExact(), "EUR");
  return JSON.treeToValue(p, TYPES.get(type));     // current version
}

/** Projection: monthly statement, idempotent via checkpoint in the same tx. */
@Transactional
void on(long position, UUID account, YearMonth month, AccountEvent e) {
  long delta = switch (e) {
    case Deposited d -> d.amountCents();
    case Withdrawn w -> -w.amountCents();
    default -> 0L;
  };
  jdbc.sql("""
      INSERT INTO statement (account_id, month, net_cents) VALUES (?, ?, ?)
      ON CONFLICT (account_id, month) DO UPDATE SET net_cents = statement.net_cents + EXCLUDED.net_cents""")
    .params(account, month.toString(), delta).update();
  jdbc.sql("UPDATE projection_checkpoint SET position = ? WHERE projection = 'statement'")
    .params(position).update();
}`,
        note: 'Java 21 pattern matching for switch over a sealed interface; <code>jdbc</code> is Spring 6.1\'s <code>JdbcClient</code>. <code>Snapshot</code>, <code>InsufficientFunds</code>, <code>JSON</code> and <code>TYPES</code> are assumed helpers. The repository appends with the expected version and maps a <code>DuplicateKeyException</code> to a concurrency retry.'
      },
      {
        title: 'PySpark + Delta Lake: MERGE bronze changes into a silver table', lang: 'python',
        code: `# Python 3.11, PySpark 3.5, delta-spark 3.x
from delta.tables import DeltaTable
from pyspark.sql import DataFrame, Window, functions as F

def upsert_accounts(batch: DataFrame, batch_id: int) -> None:
    # Keep only the newest change per account inside this micro-batch.
    newest = Window.partitionBy("account_id").orderBy(F.col("source_version").desc())
    latest = (batch
              .dropDuplicates(["account_id", "source_version"])
              .withColumn("rn", F.row_number().over(newest))
              .filter("rn = 1").drop("rn")
              .withColumn("_ingested_at", F.current_timestamp()))

    silver = DeltaTable.forName(spark, "silver.accounts")
    (silver.alias("t")
        .merge(latest.alias("s"), "t.account_id = s.account_id")
        # Older or replayed changes never overwrite newer state.
        .whenMatchedDelete(condition="s.op = 'd' AND s.source_version > t.source_version")
        .whenMatchedUpdate(
            condition="s.op <> 'd' AND s.source_version > t.source_version",
            set={c: f"s.{c}" for c in
                 ["balance_cents", "status", "source_version", "_ingested_at"]})
        .whenNotMatchedInsert(
            condition="s.op <> 'd'",
            values={c: f"s.{c}" for c in
                    ["account_id", "balance_cents", "status", "source_version", "_ingested_at"]})
        .execute())

(spark.readStream.table("bronze.account_changes")      # raw, append-only
      .writeStream
      .foreachBatch(upsert_accounts)
      .option("checkpointLocation", "s3://lake/_chk/silver_accounts")
      .trigger(availableNow=True)                       # run as an incremental batch
      .start())`,
        note: 'The <code>source_version</code> guard makes the MERGE idempotent: replaying bronze or receiving late events cannot move silver backwards. Iceberg supports the same logic with Spark SQL <code>MERGE INTO</code>.'
      }
    ],

    related: ['cdc-pipelines', 'ddd', 'event-driven-sagas', 'consistency-models', 'sd:stream-analytics', 'sd:ad-click-aggregation']
  });
})();
