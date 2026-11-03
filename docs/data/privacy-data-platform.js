SD.register({
  slug: 'privacy-data-platform',
  domain: 9,
  title: 'Privacy-Aware Data Platform',
  examples: 'Meta, Uber, LinkedIn DataHub',
  tagline: 'Know which of a million columns hold <b>personal data</b>, follow every copy through <b>column-level lineage</b>, decide at query time who may see what <b>for which purpose</b>, and delete one person everywhere on request.',
  tldr: {
    problem: 'Personal data lands in a few source tables, then jobs copy, join and reshape it into thousands of tables, indexes, feature stores and backups. Table grants and a wiki of "PII tables" stop being true within weeks.',
    idea: '<b>Scan</b> columns and tag them in a <b>catalog</b>. Capture <b>column-level lineage</b> from every job and query, and <b>propagate tags</b> along it. Write <b>policies on tags and purposes</b>, not on tables, and enforce them <b>inside the query engine</b> with masks and row filters. Use the same lineage to fan out <b>erasure</b> to every copy.',
    insight: 'The tag must <b>travel with the data</b>. A derived column of a PII column is PII unless someone explicitly declassifies it. Then a new table is protected the moment it is written, before anyone has looked at it.',
    numbers: [
      { v: '> 2 EB', l: 'data Uber\'s DataK9 classifies at field level (RSAC 2026 talk)' },
      { v: '~1%', l: 'of datasets labelled by hand to train DataK9 (Uber, 2024)' },
      { v: '1 month · 45 days', l: 'answer deadlines: GDPR (Art. 12) · CCPA delete' }
    ]
  },

  intro: {
    what: 'A privacy-aware data platform is the set of shared services around a company\'s data lake or warehouse that knows <b>which columns hold personal data</b>, <b>who may see them and why</b>, and <b>where every copy went</b>. It masks data at query time and can delete one person\'s data from every table, index and backup on request.',
    analogy: {
      icon: '🏷️',
      title: 'A records office that colour-codes every page',
      text: 'Each page that arrives is checked and gets a coloured sticker: red for personal details. Any photocopy or summary of a red page is stamped red too, and the office keeps a ledger of which copy came from which page. At the counter, a clerk checks your badge <i>and the reason you give</i> before handing over a red page, and may black out lines. When someone asks to be forgotten, the ledger lists every copy to shred. The analogy breaks in one place: here the copies are made by thousands of automated jobs, not by people asking at a counter.'
    },
    problem: 'A customer writes: "delete my data". Their email sits in the users table, a joined orders table, a support search index, an ML feature store, a marketing export and last night\'s backup. A new table with their email was created yesterday by a job nobody reviewed. You need to answer <b>"where is this person\'s data, who can see it and for what purpose, and can we remove all of it?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'Grant tables to roles and keep a list of PII tables',
        text: 'A DBA grants <b>whole tables</b> to roles: analysts get the orders schema, support gets users. A wiki page lists which tables hold PII. Deletion requests are a ticket to each team that owns one of the listed tables.',
        scene: {
          nodes: [
            { id: 'app', label: 'Apps', sub: 'write users, orders', kind: 'client', at: [70, 0] },
            { id: 'wh', label: 'Warehouse', sub: 'table grants', kind: 'store', at: [210, 110] },
            { id: 'an', label: 'Analyst', sub: 'role: analytics', kind: 'client', at: [350, 0] },
            { id: 'wiki', label: 'PII wiki page', sub: 'list of tables', kind: 'external', at: [70, 220] }
          ],
          edges: [{ from: 'app', to: 'wh' }, { from: 'an', to: 'wh' }, { from: 'wiki', to: 'wh', dashed: true }],
          flow: ['app>wh', 'an>wh']
        }
      },
      {
        stage: 'breaks',
        title: 'Copies escape the list, and deletes miss them',
        text: 'A nightly job joins users and orders into a <b>new table that carries email</b>. It is on no list and inherits no grant, so every analyst can read raw emails. An erasure request deletes the listed tables but misses the new table, the search index and the backups.',
        scene: {
          nodes: [
            { id: 'app', label: 'Apps', sub: 'write users, orders', kind: 'client', at: [70, 0] },
            { id: 'wh', label: 'Warehouse', sub: '10,000 tables', kind: 'store', at: [210, 110] },
            { id: 'an', label: 'Analyst', sub: 'reads anything', kind: 'client', at: [350, 0] },
            { id: 'job', label: 'Nightly job', sub: 'join → new table', kind: 'compute', at: [70, 220] },
            { id: 'cp', label: 'user_orders', sub: 'raw emails', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'app', to: 'wh' }, { from: 'wh', to: 'job' }, { from: 'job', to: 'cp' }, { from: 'an', to: 'cp', bend: -0.25 }],
          flow: ['app>wh', 'wh>job', 'job>cp', 'an>cp'],
          err: ['cp'], warn: ['an'],
          badges: { cp: ['untagged PII', 'err'], an: ['sees emails', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Tag columns, follow lineage, enforce at query time',
        text: 'A <b>scanner</b> tags columns in a <b>catalog</b>. Every job reports <b>which output column came from which input column</b>, so the email tag flows to the new table automatically. A <b>policy engine</b> decides per column (show, mask or hide) for this role and purpose, and the same lineage lists every copy to erase.',
        scene: {
          nodes: [
            { id: 'app', label: 'Apps', sub: 'write users, orders', kind: 'client', at: [70, 0] },
            { id: 'wh', label: 'Warehouse', sub: 'masks · filters', kind: 'store', at: [210, 110] },
            { id: 'an', label: 'Analyst', sub: 'purpose: analytics', kind: 'client', at: [350, 0] },
            { id: 'job', label: 'Nightly job', sub: 'emits lineage', kind: 'compute', at: [70, 220] },
            { id: 'cat', label: 'Catalog', sub: 'tags + lineage', kind: 'service', at: [210, 220] },
            { id: 'cp', label: 'user_orders', sub: 'email = PII', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'app', to: 'wh' }, { from: 'job', to: 'cat' }, { from: 'cat', to: 'cp' }, { from: 'an', to: 'wh' }, { from: 'cat', to: 'wh' }],
          flow: ['job>cat', 'cat>cp', 'an>wh', 'cat>wh'],
          ok: ['cp', 'cat'],
          badges: { cp: ['tag inherited', 'ok'], an: ['email masked', 'ok'] }
        }
      }
    ],
    usedBy: ['Meta (Privacy Aware Infrastructure)', 'Uber (DataK9 classification)', 'LinkedIn (DataHub)', 'Airbnb (Data Protection Platform)', 'Apache Ranger + Atlas deployments', 'Google Cloud Sensitive Data Protection'],
    whenToUse: [
      'Personal data is copied by many jobs into many tables, indexes and feature stores',
      'You must answer access and erasure requests (GDPR, India\'s DPDP Act, CCPA) for every copy',
      'Many teams query shared data for different purposes and need different views of it'
    ],
    whenNot: [
      'One app database with a dozen tables: Postgres column grants plus row-level security are enough',
      'Permissions on documents fed to an AI assistant: see <a href="rag-agent-platform.html">RAG &amp; AI Agent Platform</a>',
      'Stripping PII out of prompts sent to model providers: see <a href="llm-gateway.html">LLM Gateway</a>'
    ],
    glossary: [
      { term: 'PII', def: 'Personally identifiable information: data that identifies a person directly (email, phone) or together with other data (date of birth plus postcode).' },
      { term: 'Data catalog', def: 'A searchable inventory of every dataset and column, with owners, tags and lineage, stored as a metadata graph.' },
      { term: 'Column-level lineage', def: 'A record of which input columns, through which transformation, produced each output column.' },
      { term: 'Tag propagation', def: 'Copying a column\'s sensitivity tag to every column derived from it by following lineage.' },
      { term: 'PDP / PEP', def: 'Policy decision point (decides allow, mask or deny) and policy enforcement point (the query engine that applies the decision).' },
      { term: 'Purpose limitation', def: 'Personal data may only be used for the purposes it was collected for, so access depends on why you ask, not only on who you are.' },
      { term: 'Pseudonymization', def: 'Replacing an identifier with a token or keyed hash. The data is still personal data because it can be linked back.' },
      { term: 'Crypto-shredding', def: 'Encrypting each person\'s data under their own key and deleting the key to make every copy unreadable.' }
    ]
  },

  requirements: {
    functional: [
      'Discover and classify personal data at column level, with a confidence score and human review',
      'Catalog every dataset, column, owner and tag as a metadata graph',
      'Capture column-level lineage from jobs and queries, and propagate tags along it',
      'Enforce access per column and row by role, tag and declared purpose (mask, filter, deny)',
      'Fulfil access and erasure requests across every copy: tables, indexes, caches, features, backups',
      'Retention TTLs, consent checks, audit logs, access reviews and break-glass access'
    ],
    nonFunctional: [
      'A new table is protected the moment it is written (default deny until classified)',
      'Policy check adds ≲ 10 ms at query planning, nothing per row beyond the mask expression (estimate)',
      'Erasure complete within the legal deadline (GDPR one month, CCPA 45 days)',
      'Classifier recall over precision: a missed PII column is worse than a false alarm',
      'Audit log is append-only and kept longer than the data it describes',
      'Scales to millions of columns and billions of lineage edges'
    ],
    outOfScope: ['Legal interpretation of each law (privacy counsel decides)', 'Prompt redaction for LLM calls (see LLM Gateway)', 'Document permissions in RAG (see RAG platform)', 'Building the lake itself (see Data Lake)']
  },

  calculator: {
    inputs: [
      { id: 'tables', label: 'Tables in the lake / warehouse', min: 1000, max: 2000000, value: 200000, log: true },
      { id: 'cols', label: 'Average columns per table', min: 5, max: 200, value: 40 },
      { id: 'sample', label: 'Values sampled per column per scan', min: 100, max: 100000, value: 1000, log: true },
      { id: 'review', label: 'Columns sent to human review', min: 0.5, max: 20, step: 0.5, value: 3, unit: '%' },
      { id: 'dsr', label: 'Erasure requests per day', min: 10, max: 1000000, value: 20000, log: true },
      { id: 'fan', label: 'Datasets holding one user (fan-out)', min: 3, max: 500, value: 60, log: true }
    ],
    outputs: [
      { label: 'Columns to classify', f: (v) => v.tables * v.cols },
      { label: 'Values inspected per full scan', f: (v) => v.tables * v.cols * v.sample },
      { label: 'Scanner core-hours per full scan (~1M values/s/core)', f: (v) => (v.tables * v.cols * v.sample / 1e6 / 3600).toFixed(1), fmt: 'raw' },
      { label: 'Columns in the review queue', f: (v) => Math.round(v.tables * v.cols * v.review / 100) },
      { label: 'Reviewer days at 30 s per column', f: (v) => (v.tables * v.cols * v.review / 100 * 30 / 3600 / 8).toFixed(0), fmt: 'raw' },
      { label: 'Deletion tasks per day (requests × fan-out)', f: (v) => v.dsr * v.fan }
    ],
    note: 'All inputs are <em>estimates</em>; the scanner speed is an assumption. Uber reports labelling about 1% of datasets by hand and auto-tagging the rest (2024). Two things jump out: <b>sampling</b> keeps scans cheap, but the <b>human review queue</b> grows with column count, so the classifier must be confident on most columns. And erasure is a <b>fan-out problem</b>: one request becomes dozens of tasks, so batch them per dataset.'
  },

  api: [
    { m: 'POST', p: '/v1/scan', d: 'Classify a dataset: <code>{dataset, sample_rows}</code> → per column <code>{infoType, likelihood, detector}</code>. Run on new tables, schema changes, and periodically.' },
    { m: 'PUT', p: '/v1/catalog/columns/{urn}/tags', d: 'Set or confirm a tag: <code>{tag: "PII.email", source: "scanner|steward", confidence}</code>. A steward can also mark a column <b>declassified</b>, with a reason.' },
    { m: 'POST', p: '/api/v1/lineage', d: 'OpenLineage <code>RunEvent</code> from Spark, Airflow, dbt or the query engine, with a <code>columnLineage</code> facet per output.' },
    { m: 'RPC', p: 'PDP.Authorize', d: '<code>{principal, purpose, dataset, columns}</code> → per column <code>clear | mask(fn) | deny</code>, plus a row filter and obligations (log, ticket). Called at query planning.' },
    { m: 'POST', p: '/v1/dsr', d: 'Data subject request <code>{subject_ids, type: access|erasure, law}</code> → request id. <code>GET /v1/dsr/{id}</code> shows status per system.' },
    { m: 'POST', p: '/v1/break-glass', d: 'Emergency access <code>{dataset, reason, ticket, ttl}</code>: time-boxed, alerts the privacy team, reviewed afterwards.' }
  ],
  dataModel: [
    { name: 'column_tags', store: 'Catalog (Postgres + graph index)', fields: [['column_urn', 'text', 'pk'], ['tag', 'PII.email | PSEUDO | …', 'idx'], ['source', 'scanner | lineage | steward'], ['confidence', 'float'], ['status', 'auto | review | confirmed | declassified'], ['updated_by, updated_at', 'text, ts']], note: 'A propagated tag stores the upstream column it came from, so a steward can see why it is there.' },
    { name: 'lineage_edge', store: 'Graph store (billions of edges)', fields: [['src_col', 'urn', 'pk'], ['dst_col', 'urn', 'pk'], ['job_id', 'urn', 'idx'], ['transform', 'IDENTITY | AGGREGATION | masking…'], ['last_seen', 'ts']], note: 'Edges not seen for N days are aged out, so dead jobs stop widening erasure fan-outs.' },
    { name: 'policy', store: 'Policy store (PDP cache)', fields: [['policy_id', 'text', 'pk'], ['tag', 'text', 'idx'], ['roles', 'text[]'], ['purposes', 'text[]'], ['effect', 'clear | mask | deny'], ['mask_fn, row_filter', 'text'], ['priority', 'int']] },
    { name: 'dsr_task', store: 'Workflow DB', fields: [['request_id', 'uuid', 'pk'], ['dataset', 'urn', 'pk'], ['action', 'delete | shred | evict | reindex'], ['status', 'enum'], ['attempts', 'int'], ['verified_at', 'ts']], note: 'Done only when a verification query finds zero rows for the subject.' }
  ],

  architecture: {
    title: 'Privacy-aware data platform',
    nodes: [
      { id: 'ingest', label: 'Ingestion', sub: 'CDC · events · minimise', kind: 'edge', wide: [90, 0], tall: [210, 0], tip: 'Drops fields nobody needs, tokenizes or encrypts direct identifiers at the door, and stamps the schema with owner and purpose.' },
      { id: 'lake', label: 'Lake / warehouse', sub: 'Iceberg · Hive tables', kind: 'store', wide: [280, 0], tall: [210, 110], tip: 'The data itself. Users never get raw table access; every read goes through the query engine.' },
      { id: 'jobs', label: 'ETL jobs', sub: 'Spark · SQL · dbt', kind: 'compute', wide: [470, 0], tall: [350, 110], tip: 'Every job emits OpenLineage events with a columnLineage facet: which input columns produced each output column.' },
      { id: 'copies', label: 'Derived copies', sub: 'features · index · cache', kind: 'store', wide: [660, 0], tall: [350, 0], tip: 'Feature stores, search indexes, caches, exports and backups. The copies most often forgotten in an erasure.' },
      { id: 'scan', label: 'PII scanner', sub: 'regex · Luhn · ML', kind: 'ml', wide: [470, 110], tall: [210, 220], tip: 'Samples values per column. Regex plus validators (Luhn for cards), name dictionaries and an ML model give an info type and a confidence.' },
      { id: 'lin', label: 'Lineage service', sub: 'OpenLineage graph', kind: 'service', wide: [660, 110], tall: [350, 220], tip: 'Builds the column graph from job events and parsed query logs, and propagates tags along it.' },
      { id: 'kms', label: 'KMS', sub: 'per-user keys', kind: 'store', wide: [860, 110], tall: [350, 440], tip: 'Holds a data key per user. Deleting the key makes every encrypted copy unreadable, including backups (crypto-shredding).' },
      { id: 'user', label: 'Analysts · ML', sub: 'SQL + declared purpose', kind: 'client', wide: [90, 220], tall: [70, 0], tip: 'Every query carries a purpose (analytics, support, training…), set by the tool or the notebook session.' },
      { id: 'qe', label: 'Query engine (PEP)', sub: 'masks · row filters', kind: 'service', wide: [280, 220], tall: [70, 110], tip: 'Trino, Spark or the warehouse. Rewrites the plan with mask expressions and row filters before any data is read.' },
      { id: 'cat', label: 'Data catalog', sub: 'metadata graph · tags', kind: 'service', wide: [565, 220], tall: [210, 330], tip: 'DataHub or Atlas style. Datasets, columns, owners, tags with confidence, and lineage, in one graph.' },
      { id: 'dsr', label: 'DSR orchestrator', sub: 'access · erasure', kind: 'service', wide: [860, 220], tall: [350, 330], tip: 'Turns one request into tasks per dataset using lineage, tracks them to verified completion and keeps evidence.' },
      { id: 'pdp', label: 'Policy engine (PDP)', sub: 'tags · roles · purpose', kind: 'service', wide: [375, 330], tall: [70, 220], tip: 'Ranger or OPA style. Evaluates tag-based and purpose-based policies and returns clear, mask or deny per column.' },
      { id: 'audit', label: 'Audit log', sub: 'append-only', kind: 'store', wide: [565, 330], tall: [70, 330], tip: 'Who read which tagged columns, for which purpose, under which policy. Feeds access reviews and anomaly alerts.' }
    ],
    edges: [
      { from: 'ingest', to: 'lake' },
      { from: 'lake', to: 'jobs' },
      { from: 'jobs', to: 'copies' },
      { from: 'jobs', to: 'lin', label: 'lineage' },
      { from: 'scan', to: 'lake', label: 'sample' },
      { from: 'scan', to: 'cat' },
      { from: 'lin', to: 'cat' },
      { from: 'user', to: 'qe' },
      { from: 'qe', to: 'lake' },
      { from: 'qe', to: 'pdp' },
      { from: 'cat', to: 'pdp', label: 'tags' },
      { from: 'pdp', to: 'audit' },
      { from: 'dsr', to: 'lin' },
      { from: 'dsr', to: 'cat' },
      { from: 'dsr', to: 'kms' }
    ]
  },

  scenarios: [
    {
      id: 'classify', title: 'New table gets classified', tone: 'info',
      steps: [
        { text: 'A team creates <code>user_orders</code>. Until it is classified, the catalog marks it <b>default deny</b> for everyone except its owner.', flow: ['lake>jobs', 'jobs>lin', 'lin>cat'], badges: { cat: 'new · unscanned' } },
        { text: 'The <b>scanner samples</b> a few thousand values per column. A 16-digit value that passes the <b>Luhn checksum</b> is very likely a card; one that fails is probably an order or tracking number.', flow: ['scan>lake'], badges: { scan: 'card_no: VERY_LIKELY' } },
        { text: '<code>email</code> matches the regex on 99% of samples and the column name agrees: auto-tag <b>PII.email</b>. <code>notes</code> has emails in 4% of rows: <b>POSSIBLE</b>, so it goes to a human.', flow: ['scan>cat'], badges: { cat: '2 auto · 1 review' }, warn: ['cat'] },
        { text: 'Lineage already knew <code>user_orders.email</code> comes from <code>users.email</code>, so the tag was <b>inherited before the scan</b>. The scan confirms it and catches columns lineage could not see.', nodes: ['lin', 'cat'], ok: ['cat'], badges: { cat: ['tags confirmed', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'query', title: 'Analyst query: mask and filter', tone: 'ok',
      steps: [
        { text: 'An analyst runs <code>SELECT user_id, email, amount FROM user_orders</code> with purpose <b>analytics</b>.', flow: ['user>qe'] },
        { text: 'At planning time the engine asks the <b>PDP</b>. The PDP reads the column tags from the catalog: <code>email</code> = PII, <code>user_id</code> = PSEUDO, <code>amount</code> = untagged.', flow: ['qe>pdp', 'cat>pdp'], badges: { pdp: '3 columns' } },
        { text: 'Decision: <code>amount</code> clear, <code>user_id</code> clear (pseudonymous is allowed for analytics), <code>email</code> <b>masked</b>. Purpose "analytics" is on the analyst\'s allowed list.', nodes: ['pdp'], ok: ['pdp'], badges: { pdp: ['mask email', 'ok'] } },
        { text: 'The engine <b>rewrites the plan</b>: <code>email</code> becomes <code>mask_email(email)</code>. Masking happens inside the engine, so no BI tool or notebook ever sees the raw value.', flow: ['qe>lake'], badges: { qe: 'plan rewritten' } },
        { text: 'The decision, the policy ids and the purpose go to the <b>append-only audit log</b>, which feeds quarterly access reviews.', flow: ['pdp>audit'], ok: ['audit'], tone: 'ok' }
      ]
    },
    {
      id: 'erase', title: 'Erasure request fans out', tone: 'ok',
      steps: [
        { text: 'A user asks to be deleted (GDPR Art. 17, DPDP Act s.12 or CCPA). The orchestrator resolves their identifiers: user id, email, device ids.', nodes: ['dsr'], badges: { dsr: 'u42 · 3 ids' } },
        { text: 'It walks <b>lineage downstream</b> from the source columns that hold those identifiers and keeps every dataset whose columns still carry a PII or PSEUDO tag.', flow: ['dsr>lin', 'dsr>cat'], badges: { lin: '9 datasets' } },
        { text: 'Tasks go out per dataset: delete rows in lake tables, delete docs in the search index, evict caches, delete feature rows by hashed key, suppress in exports.', nodes: ['lake', 'copies'], badges: { lake: 'DELETE · rewrite', copies: 'index · cache · features' } },
        { text: 'Backups are immutable. Their PII fields were encrypted under the user\'s key, so the orchestrator <b>deletes the key</b> in the KMS (crypto-shredding).', flow: ['dsr>kms'], badges: { kms: ['key u42 destroyed', 'ok'] } },
        { text: 'Each task is done only when a <b>verification query</b> finds zero rows. Aggregates that were explicitly declassified (daily revenue) are left alone.', nodes: ['dsr', 'audit'], ok: ['dsr'], badges: { dsr: ['verified 9/9', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'scale', title: 'Scale: a million new columns', tone: 'warn',
      steps: [
        { text: 'A schema migration adds columns to 50,000 tables overnight. Full rescans of everything would take thousands of core-hours.', flow: ['jobs>lin', 'lin>cat'], warn: ['scan'], badges: { scan: ['backlog', 'warn'] }, tone: 'warn' },
        { text: '<b>Scan incrementally</b>: only new or changed columns, a fixed-size sample per column, and skip columns whose tag was <b>inherited through lineage</b> with high confidence.', flow: ['scan>lake'], badges: { scan: 'changed cols only' } },
        { text: 'The PDP keeps policies and tags in memory and answers per <b>query plan</b>, not per row. One decision covers billions of rows.', flow: ['qe>pdp'], badges: { pdp: 'cached · per plan' } },
        { text: 'Lineage edges not seen for 30 days are aged out, so dead jobs stop widening erasure fan-outs. Untagged new tables stay <b>default deny</b> until scanned.', nodes: ['lin', 'cat'], ok: ['lin'], tone: 'ok' }
      ]
    },
    {
      id: 'leak', title: 'Failure: copy without lineage', tone: 'err',
      steps: [
        { text: 'An engineer exports <code>users</code> to a CSV in a scratch bucket with a storage client that bypasses the query engine and the instrumented writers. <b>No lineage event</b> is emitted.', flow: ['user>lake'], err: ['lake'], badges: { lake: ['scratch/users.csv', 'err'] }, tone: 'err' },
        { text: 'The new file has no tags, so tag-based policies do not apply. An erasure request a week later <b>misses it</b>.', flow: ['dsr>lin'], err: ['dsr'], badges: { dsr: ['8 of 9 copies', 'err'] }, tone: 'err' },
        { text: 'Detection: the periodic <b>scanner</b> finds emails in an untagged object, and the audit log shows who exported it.', flow: ['scan>lake', 'scan>cat'], warn: ['cat'], badges: { cat: ['new PII found', 'warn'] } },
        { text: 'Fix: <b>no raw write paths</b>. Writes go through libraries that emit lineage (Meta puts this check inside its logging library), untagged storage is default deny, and scratch space has a short TTL.', nodes: ['jobs', 'lin'], ok: ['lin'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick how PII is found, how lineage is captured, how access is decided and how data is protected at rest. Numbers are illustrative; they show direction, not a benchmark.',
    diagram: null, // filled below to add the optional steward review queue
    controls: [
      { id: 'discover', label: 'PII discovery', type: 'seg', value: 'ml', options: [
        { v: 'manual', l: 'Owners tag by hand' }, { v: 'regex', l: 'Regex + validators' }, { v: 'ml', l: '+ ML + human review' }] },
      { id: 'lineage', label: 'Lineage', type: 'seg', value: 'column', options: [
        { v: 'none', l: 'None' }, { v: 'table', l: 'Table-level' }, { v: 'column', l: 'Column-level' }] },
      { id: 'access', label: 'Access model', type: 'seg', value: 'purpose', options: [
        { v: 'rbac', l: 'RBAC per table' }, { v: 'abac', l: 'Tag-based (ABAC)' }, { v: 'purpose', l: 'Tags + purpose' }] },
      { id: 'protect', label: 'Protection at rest', type: 'seg', value: 'shred', options: [
        { v: 'none', l: 'Plaintext' }, { v: 'token', l: 'Tokenize at ingest' }, { v: 'shred', l: '+ per-user keys' }] },
      { id: 'tables', label: 'Datasets (thousands)', type: 'range', min: 1, max: 500, step: 1, value: 100, unit: 'k' }
    ],
    evaluate(s) {
      const k = s.tables;
      const recall = { manual: k <= 5 ? 0.8 : k <= 50 ? 0.5 : 0.3, regex: 0.75, ml: 0.93 }[s.discover];
      const downstream = { none: recall * 0.4, table: Math.min(1, recall * 1.02), column: recall }[s.lineage];
      const overTag = s.lineage === 'table';
      const exposure = { rbac: 0.25, abac: 0.7, purpose: 0.9 }[s.access] * (overTag ? 0.95 : 1) * (0.5 + 0.5 * downstream) + (s.protect !== 'none' ? 0.08 : 0);
      const roles = 30, tags = 12, purposes = 6;
      const policies = { rbac: roles * k * 1000 * 0.05, abac: roles * tags, purpose: tags * purposes * 2 }[s.access];
      const erase = { none: 0.35, table: 0.85, column: 0.92 }[s.lineage] * (s.protect === 'shred' ? 1 : 0.9) * (0.6 + 0.4 * recall);
      const eraseScope = s.lineage === 'table' ? 'broad: whole tables' : s.lineage === 'column' ? 'precise' : 'guesswork';
      const friction = s.access === 'rbac' ? 0.45 : overTag ? 0.4 : s.access === 'purpose' ? 0.72 : 0.8;
      const review = s.discover === 'ml' ? Math.round(k * 1000 * 40 * 0.03 / 1000) + 'k cols' : s.discover === 'regex' ? 'none (misses names, free text)' : 'all columns by hand';
      const pct = (x) => Math.round(Math.max(0, Math.min(1, x)) * 100) + '%';
      const metrics = [
        { k: 'PII columns found', v: pct(recall), s: recall, hint: { manual: 'owners skip tables', regex: 'patterns only', ml: 'names + values + model' }[s.discover] },
        { k: 'Tags on derived copies', v: pct(downstream) + (overTag ? ' (over-tagged)' : ''), s: overTag ? downstream * 0.8 : downstream },
        { k: 'Exposure control', v: pct(exposure), s: Math.min(1, exposure), hint: 'share of PII reads masked or denied when not needed' },
        { k: 'Policies to maintain', v: '≈ ' + SD.fmt.num(policies), s: policies < 500 ? 0.9 : policies < 20000 ? 0.55 : 0.15, hint: s.access === 'rbac' ? 'roles × tables' : 'tags × roles/purposes' },
        { k: 'Erasure completeness', v: pct(erase) + ' · ' + eraseScope, s: erase },
        { k: 'Review queue', v: review, s: s.discover === 'ml' ? 0.7 : s.discover === 'regex' ? 0.6 : (k <= 5 ? 0.6 : 0.1) },
        { k: 'Analyst friction', v: { rbac: 'ask for table grants', abac: 'works, some masked', purpose: 'declare a purpose' }[s.access] + (overTag ? ' · too much masked' : ''), s: friction }
      ];
      const notes = [];
      if (s.discover === 'manual' && k > 5) notes.push('Hand-tagging ' + k + 'k datasets never finishes, and new tables arrive faster than owners tag them. Uber labels about 1% by hand and trains a model for the rest.');
      if (s.discover === 'regex') notes.push('Regex plus validators (Luhn for cards) is precise on structured types but misses PII in names, free text and coded fields. Add column-name dictionaries and a model.');
      if (s.lineage === 'none') notes.push('Without lineage every derived table starts untagged, and erasure depends on teams remembering their copies.');
      if (s.lineage === 'table') notes.push('Table-level lineage tags <b>every</b> column of a derived table as PII, so analysts lose harmless columns and erasure deletes more than needed.');
      if (s.access === 'rbac') notes.push('Per-table grants grow as roles × tables (≈ ' + SD.fmt.num(policies) + ' here, assuming 5% of tables per role) and cannot mask one column.');
      if (s.access === 'purpose') notes.push('Purpose-based checks are what <b>purpose limitation</b> asks for. Meta enforces it with Policy Zones, an information-flow-control system in its data infrastructure.');
      if (s.protect === 'shred') notes.push('Per-user keys let one key deletion erase immutable backups and logs. The key store itself must not live in long-retention backups.');
      if (s.protect === 'token') notes.push('Tokenizing at ingest keeps raw identifiers out of the lake; deterministic tokens still allow joins. Backups still need their own erasure path.');
      let verdict;
      if (s.lineage === 'none' && s.discover === 'manual') verdict = '❌ <b>You cannot say where PII is</b>, so neither access control nor erasure can be correct.';
      else if (s.lineage === 'none') verdict = '⚠ <b>Copies escape.</b> Scanning finds source PII, but derived tables stay unprotected until the next scan, and erasure misses them.';
      else if (s.access === 'rbac') verdict = '⚠ <b>Grants explode and cannot mask a column.</b> Move to tag-based policies enforced in the query engine.';
      else if (s.discover === 'ml' && s.lineage === 'column' && s.access === 'purpose' && s.protect === 'shred') verdict = '✅ <b>Close to what Meta, Uber and Airbnb describe:</b> automatic classification, column lineage, purpose-aware policies, and erasure that reaches backups.';
      else verdict = '👍 <b>Workable.</b> Check which meter is weakest: that is your next privacy incident.';
      const flow = ['user>qe', 'qe>pdp', 'cat>pdp', 'qe>lake', 'pdp>audit'];
      return {
        metrics, verdict, notes, flow,
        labels: {
          pdp: { label: 'Policy engine (PDP)', sub: { rbac: 'role → table grants', abac: 'tag-based policies', purpose: 'tags + purpose' }[s.access] },
          scan: { label: s.discover === 'manual' ? 'Owner tagging' : 'PII scanner', sub: { manual: 'forms in the catalog', regex: 'regex · Luhn', ml: 'regex · Luhn · ML' }[s.discover] },
          lin: { label: 'Lineage service', sub: { none: 'not captured', table: 'table → table', column: 'column → column' }[s.lineage] },
          ingest: { label: 'Ingestion', sub: { none: 'raw identifiers', token: 'tokenize at ingest', shred: 'tokenize + per-user keys' }[s.protect] }
        },
        hide: (s.discover === 'ml' ? [] : ['review']).concat(s.protect === 'shred' ? [] : ['kms']),
        hot: s.discover === 'ml' ? ['review'] : [],
        warn: (s.lineage === 'none' ? ['lin'] : []).concat(s.access === 'rbac' ? ['pdp'] : []),
        err: s.lineage === 'none' && s.discover === 'manual' ? ['cat'] : [],
        badges: { cat: [pct(downstream) + ' tagged', downstream > 0.85 ? 'ok' : downstream > 0.6 ? 'warn' : 'err'] }
      };
    }
  },

  widget: {
    title: 'Tag propagation, policy check and erasure fan-out',
    caption: '<b>1.</b> Scan the two source tables (real regex + Luhn checks on sample values), or tap a source column to tag it yourself. Tags then flow down the <b>column-level lineage</b>. <b>2.</b> Pick a role, a purpose and a dataset and run a query: each column comes back clear, masked or dropped. <b>3.</b> Erase a user and see every copy that must change. Turn declassifiers off to see how far PII spreads without them.'
  },

  realWorld: {
    intro: 'The big platforms converged on the same pieces: automatic classification, a metadata graph, lineage, and enforcement inside the data infrastructure rather than in each app.',
    timeline: [
      { when: '2016', who: 'Apache Ranger', title: 'Row filters and column masks in Hive', text: 'Ranger 0.6 added <b>row-level filter</b> and <b>column masking</b> policies, applied by the Hive plugin on every query. A mask policy does not grant access by itself: a separate policy must allow <code>select</code>.', src: 10 },
      { when: '2017–18', who: 'LinkedIn', title: 'GDPR: metadata-driven purging', text: 'Talks describe <b>Dali</b>, LinkedIn\'s data access layer, generating column-level transformations from dataset metadata and <b>member privacy preferences</b>, with Gobblin doing compliant purges. DataHub grew out of the same metadata needs.', src: 9 },
      { when: 'CDP 7.x', who: 'Atlas + Ranger', title: 'Tags drive policies and follow lineage', text: 'Atlas classifications become Ranger <b>tag-based policies</b>, and Atlas can <b>propagate a classification along lineage</b> to columns built from the tagged data, so the policy applies at the new location too.', src: 11 },
      { when: 'c. 2021', who: 'Airbnb', title: 'Data Protection Platform', text: '<b>Madoka</b> stores security and privacy metadata for every data asset. <b>Inspekt</b> scans data and reports personal data back to Madoka, which flags mismatches with owner annotations. <b>Cipher</b> encrypts, and <b>Obliviate</b> orchestrates privacy requests.', src: 7 },
      { when: '2022', who: 'LinkedIn', title: 'Shift governance left into schemas', text: 'Governance annotations are written into dataset <b>schemas at creation time</b> and kept in DataHub, so the metadata stays current as data changes and governance is federated across teams.', src: 8 },
      { when: '2024', who: 'Uber', title: 'DataK9: field-level auto-classification', text: 'Experts label <b>under 1%</b> of datasets (about 1,000 critical tables); models tag the other <b>99%+</b> using field names, types, sampled values and lineage. A model ships only above <b>90% accuracy and 85% F2</b>. A 2026 talk puts coverage at <b>over two exabytes on 7+ platforms</b>.', src: 5 },
      { when: '2024', who: 'Meta', title: 'Policy Zones for purpose limitation', text: 'Part of Meta\'s <b>Privacy Aware Infrastructure</b>. Annotated data is checked as it is processed, and a flow is blocked when the destination\'s purpose is not allowed. It is <b>information-flow control</b> integrated with HHVM, Presto and Spark.', src: 0 },
      { when: '2025', who: 'Meta', title: 'Lineage at scale with Privacy Probes', text: 'Static analysis plus <b>runtime probes</b> that sample source and sink payloads within a request and match them. Exact matches are strong evidence of a flow; transformed values (a count) need human review. Lineage tells Meta where to place Policy Zones.', src: 1 },
      { when: '2025', who: 'Meta', title: 'Policy Zones in batch for messaging data', text: 'Loggers that write non-content messaging data (such as delivery status) carry a <code>MESSAGING_DATA</code> annotation, and batch jobs reading it may only write to destinations with compatible restrictions.', src: 2 },
      { when: '2026', who: 'Meta', title: 'PrivacyLib inside the logger', text: 'Before writing a record, the PrivacyLib integration in Meta\'s logger asks Policy Zones whether the data may flow to the destination table. The same library emits lineage metadata into a central graph.', src: 3 }
    ],
    lessons: [
      'Put the tag on the <b>column</b> and make it <b>travel along lineage</b>; a list of PII tables is out of date the day it is written.',
      'Enforce in the <b>data infrastructure</b> (query engine, logger, writers), not in each app or BI tool.',
      'Classification needs <b>humans in the loop</b> for low-confidence columns; train on a small expert-labelled set.',
      'Plan erasure from day one: <b>lineage for the fan-out</b>, per-user keys for backups, and verification queries for proof.'
    ],
    sources: [
      { title: 'How Meta enforces purpose limitation via Privacy Aware Infrastructure at scale', url: 'https://engineering.fb.com/2024/08/27/security/privacy-aware-infrastructure-purpose-limitation-meta/', pub: 'Meta Engineering, 2024' },
      { title: 'How Meta discovers data flows via lineage at scale', url: 'https://engineering.fb.com/2025/01/22/security/how-meta-discovers-data-flows-via-lineage-at-scale/', pub: 'Meta Engineering, 2025' },
      { title: 'Policy Zones: purpose limitation in batch processing systems', url: 'https://engineering.fb.com/2025/07/23/security/policy-zones-meta-purpose-limitation-batch-processing-systems/', pub: 'Meta Engineering, 2025' },
      { title: 'PrivacyLib', url: 'https://engineering.fb.com/2026/10/27/security/privacylib/', pub: 'Meta Engineering, 2026' },
      { title: 'Meta\'s Privacy Aware Infrastructure for GenAI data flows', url: 'https://www.infoq.com/news/2026/01/meta-pai-genai-data-flows', pub: 'InfoQ, 2026' },
      { title: 'DataK9: Auto-categorizing an exabyte of data at field level through AI/ML', url: 'https://www.uber.com/en-DE/blog/auto-categorizing-data-through-ai-ml/', pub: 'Uber Engineering, 2024' },
      { title: 'DataK9: GenAI-Driven Data Discovery and Classification at Exabyte Scale (talk abstract)', url: 'https://citation.thinkst.com/talk/102750', pub: 'RSAC 2026' },
      { title: 'Automating Data Protection at Scale, Part 1', url: 'https://medium.com/airbnb-engineering/automating-data-protection-at-scale-part-1-c74909328e08', pub: 'Airbnb Engineering' },
      { title: 'Shifting left on governance: DataHub and schema annotations', url: 'https://engineering.linkedin.com/blog/2022/shifting-left-on-governance--datahub-and-schema-annotations', pub: 'LinkedIn Engineering, 2022' },
      { title: 'Data Privacy at Scale', url: 'https://www.slideshare.net/slideshow/data-privacy-at-scale/102739352', pub: 'LinkedIn talk slides, 2018' },
      { title: 'Row-level filtering and column-masking using Apache Ranger policies in Apache Hive', url: 'https://cwiki.apache.org/confluence/spaces/RANGER/pages/65868896/Row-level+filtering+and+column-masking+using+Apache+Ranger+policies+in+Apache+Hive', pub: 'Apache Ranger wiki' },
      { title: 'Atlas classifications drive Ranger policies', url: 'https://docs.cloudera.com/runtime/7.3.1/cdp-governance-controlling-access-tags/topics/atlas-controlling-data-access-with-tags.html', pub: 'Cloudera docs' },
      { title: 'Column Level Lineage Dataset Facet', url: 'https://openlineage.io/docs/spec/facets/dataset-facets/column_lineage_facet/', pub: 'OpenLineage spec' },
      { title: 'Open Policy Agent documentation', url: 'https://www.openpolicyagent.org/docs', pub: 'OPA' },
      { title: 'InfoType detector reference', url: 'https://docs.cloud.google.com/dlp/docs/infotypes-reference', pub: 'Google Cloud Sensitive Data Protection' },
      { title: 'Art. 17 GDPR: Right to erasure (\'right to be forgotten\')', url: 'https://gdpr-info.eu/art-17-gdpr/', pub: 'GDPR text' },
      { title: 'Digital Personal Data Protection Rules, 2025 (explainer)', url: 'https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf', pub: 'PIB, Government of India, Nov 2025' },
      { title: 'India\'s Data Protection Bill 2023: rights of individuals', url: 'https://www.medianama.com/2023/08/223-indias-data-protection-bill-2023-privacy-rights-individuals/', pub: 'MediaNama, 2023' },
      { title: 'CCPA compliance series part 6: retaining and deleting data', url: 'https://perkinscoie.com/insights/blog/ccpa-12-month-compliance-series-part-6-retaining-and-deleting-data', pub: 'Perkins Coie' },
      { title: 'Crypto shredding', url: 'https://thoughtworks.com/radar/techniques/crypto-shredding', pub: 'Thoughtworks Technology Radar' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Access model', '<b>RBAC</b>: roles get tables; simple to explain', '<b>ABAC / tag-based</b>: policies on tags, plus purpose', 'RBAC for a few dozen tables; tags once tables outnumber the people who can review grants'],
      ['Where to enforce', '<b>In the query engine</b> (Ranger, warehouse masking policies)', '<b>In every app / BI tool</b>', 'Always the engine: one enforcement point that every tool must pass through'],
      ['Protect identifiers', '<b>Dynamic masking</b> at read: raw data stays in the lake', '<b>Tokenize at ingest</b>: raw values live only in a vault', 'Masking for broad analytics; tokenize the few direct identifiers (cards, government ids) nobody downstream needs'],
      ['Lineage capture', '<b>Job instrumentation</b> (OpenLineage from Spark, Airflow, dbt)', '<b>Parse query logs</b> / runtime probes', 'Both: instrumentation is precise, log parsing and probes catch what bypasses it'],
      ['Erasure in backups', '<b>Rewrite backups</b> or let them age out', '<b>Crypto-shred</b> the user\'s key', 'Short backup retention can be enough; long or immutable stores need per-user keys'],
      ['Tag on derived data', '<b>Inherit by default</b>, declassify on review', '<b>Re-scan</b> each new table', 'Inherit by default, and scan as a safety net for copies made outside lineage']
    ]
  },
  failures: [
    { f: 'Copy made outside lineage (notebook export, raw bucket write)', detect: 'Periodic scanner finds PII in an untagged object; audit log of exports', fix: 'Only instrumented writers, default deny on untagged storage, short TTL on scratch space.' },
    { f: 'Classifier misses a PII column', detect: 'Steward spot checks; scanner disagreeing with lineage-inherited tags', fix: 'Favour recall, send POSSIBLE results to review, add the miss to the training set.' },
    { f: 'Over-tagging blocks analysts', detect: 'Rising access-request tickets and masked-column complaints', fix: 'Column-level lineage instead of table-level; approved declassifiers for real aggregates.' },
    { f: 'Erasure misses a copy', detect: 'Verification queries per dataset; sampling for the subject\'s identifiers after completion', fix: 'Fan-out from lineage, not from a list; keep the task open until verified; crypto-shred backups.' },
    { f: 'Purpose spoofing (user claims "support" to see emails)', detect: 'Purpose not matching the user\'s ticket or tool; anomaly alerts on audit logs', fix: 'Bind purposes to roles and tools, require a ticket id for sensitive purposes, review access quarterly.' },
    { f: 'Break-glass access left open', detect: 'Grants older than their TTL', fix: 'Time-boxed grants that expire automatically, a page to the privacy team, and a mandatory review.' }
  ],

  interview: [
    { q: 'How do you find PII across hundreds of thousands of tables?', a: '<ul><li><b>Sample</b> values per column (a fixed number of rows, not the whole table).</li><li>Run <b>detectors</b>: regex plus validators (Luhn for cards, check digits for national ids), column-name dictionaries, and an ML model that uses names, types and values.</li><li>Score a <b>confidence</b>. Auto-tag high confidence; send the middle band to the owner or a privacy steward.</li><li>Write tags to the <b>catalog</b>, and rescan only new or changed columns.</li></ul><p>Uber, for example, labels about 1% of datasets by hand and trains models for the rest.</p>', fu: 'Why is a Luhn check useful? (Many 16-digit ids are not cards; a random number passes Luhn only 1 time in 10.)', lvl: 'core' },
    { q: 'How do you capture column-level lineage?', a: '<p>Two sources, used together:</p><ul><li><b>Instrument jobs</b>: Spark, Airflow, dbt and the query engine emit OpenLineage events. The <code>columnLineage</code> facet lists, for each output column, its input columns and the transformation (identity, aggregation, masking…).</li><li><b>Parse query logs</b> for SQL that ran outside those tools, and use runtime probes or static analysis for application code (Meta combines both).</li></ul><p>Store edges in a graph with <code>last_seen</code> so dead jobs age out.</p>', lvl: 'core' },
    { q: 'What are the rules for propagating tags along lineage?', a: '<ul><li>A column derived from a PII column <b>is PII</b> by default (identity, concat, substring, join key).</li><li><b>Hashing or tokenizing</b> makes it <b>pseudonymous</b>: still personal data, but it may be allowed for analytics.</li><li>Only an <b>explicit, reviewed declassification</b> removes the tag, for example an aggregate over enough people.</li><li>Take the <b>most sensitive</b> tag over all inputs. Tags only go up, so propagation over cycles still terminates.</li></ul>', lvl: 'core' },
    { q: 'RBAC, ABAC, purpose-based: what is the difference?', a: '<p><b>RBAC</b>: a role gets resources ("analysts read the orders schema"). Simple, but grants grow as roles × tables and cannot mask one column.</p><p><b>ABAC / tag-based</b>: policies on attributes of the user and the data ("PII columns are masked unless role = support"). New tables are covered as soon as they are tagged.</p><p><b>Purpose-based</b>: the request also carries <i>why</i>, and data may only be used for the purposes it was collected for (GDPR\'s purpose limitation). Meta enforces this as information-flow control with Policy Zones.</p>', lvl: 'core' },
    { q: 'Where do you enforce policies: PDP vs PEP?', a: '<p>The <b>PDP</b> (Ranger admin, OPA) holds policies and answers "clear, mask or deny, with which row filter" for a principal, purpose and set of columns. The <b>PEP</b> is the query engine: it calls the PDP at <b>planning time</b> and rewrites the plan with mask expressions and filters.</p><p>Enforce in the engine, not in BI tools, because every tool, notebook and export passes through the engine. Cache policies and tags in the engine so a decision costs microseconds, not a network call per row.</p>', lvl: 'core' },
    { q: 'Masking, tokenization, encryption: when do you use which?', a: '<ul><li><b>Dynamic masking</b>: raw data stays stored; each reader sees a masked or clear value. Flexible, but the raw value is in the lake.</li><li><b>Tokenization</b>: replace the value at ingest with a token; the real value lives in a vault. <b>Deterministic</b> tokens keep joins and counts working.</li><li><b>Encryption with per-user keys</b>: protects copies you cannot rewrite (backups, logs) and enables crypto-shredding.</li></ul>', lvl: 'deep' },
    { q: 'Is a SHA-256 hash of an email anonymous?', a: '<p>No. Anyone with a list of emails can hash them and match, so an unsalted hash is a <b>pseudonym</b>, not anonymization, and it is still personal data. Use a <b>keyed hash (HMAC)</b> or tokens from a vault, keep the key separate, and keep the column tagged as pseudonymous.</p>', lvl: 'core' },
    { q: 'Walk me through an erasure request end to end.', a: '<ol><li>Verify the requester and resolve all their identifiers (user id, email, device ids).</li><li>Walk <b>lineage downstream</b> from the source columns to find every dataset that still carries a PII or pseudonymous tag.</li><li>Create one task per dataset: delete rows (rewrite files in a lake table), delete search docs, evict caches, delete feature rows by hashed key, tell processors.</li><li><b>Crypto-shred</b> what you cannot rewrite, such as backups.</li><li><b>Verify</b> with a query per dataset, then close with evidence. GDPR expects an answer within a month; CCPA gives 45 days.</li></ol>', fu: 'What about a model trained on that data? (Delete the training rows; retrain on schedule, or document why the model holds no personal data.)', lvl: 'deep' },
    { q: 'How do retention and consent fit in?', a: '<p><b>Retention</b>: each tag or dataset has a TTL; a daily job deletes partitions past it, and lineage applies the shortest upstream TTL to derived copies. <b>Consent</b>: store consent per user and purpose; jobs for a purpose such as marketing join on the consent table (or the PDP adds a row filter), so withdrawn users drop out automatically.</p>', lvl: 'deep' },
    { q: 'How do you design audit logs, access reviews and break-glass access?', a: '<ul><li>Log every decision on tagged data: who, purpose, columns, policy ids, query hash. Append-only, with longer retention than the data.</li><li><b>Access reviews</b>: owners re-approve grants and purposes every quarter; unused grants are removed automatically.</li><li><b>Break-glass</b>: time-boxed elevated access with a reason and ticket, a page to the privacy team, and a mandatory review afterwards.</li></ul>', lvl: 'core' },
    { q: 'How do you make sure a brand-new table is protected?', a: '<p>Three layers: <b>inherit tags through lineage</b> at write time, <b>default deny</b> for untagged datasets except for their owner, and a <b>scan on creation</b> as a safety net. Meta goes further and checks the flow inside its logging library before the record is written.</p>', lvl: 'deep' },
    { q: 'What does minimising data at ingest mean in practice?', a: '<p>Do not collect fields with no stated purpose. Drop or <b>coarsen</b> at the door: birth year instead of date, city instead of GPS, last 4 card digits instead of the number. Tokenize the identifiers you must keep. Data you never store cannot leak and never needs erasing.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Postgres: tag- and purpose-based masking with a row filter', lang: 'sql',
      code: `-- Catalog tags + tag/purpose policies (what the PDP reads)
CREATE TABLE column_tags (tbl text, col text, tag text NOT NULL, PRIMARY KEY (tbl, col));
CREATE TABLE tag_policy (
  tag text, role name, purpose text,
  effect text NOT NULL CHECK (effect IN ('clear', 'mask')),
  PRIMARY KEY (tag, role, purpose));

-- Untagged → clear. Tagged with no matching policy → deny (NULL).
CREATE FUNCTION col_effect(p_tbl text, p_col text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN t.tag IS NULL THEN 'clear' ELSE coalesce(p.effect, 'deny') END
  FROM (SELECT 1) AS one
  LEFT JOIN column_tags t ON t.tbl = p_tbl AND t.col = p_col
  LEFT JOIN tag_policy p ON p.tag = t.tag AND p.role = current_user
        AND p.purpose = current_setting('app.purpose', true)
$$;

CREATE FUNCTION mask_email(e text) RETURNS text LANGUAGE sql IMMUTABLE
  AS $$ SELECT left(e, 1) || '***@' || split_part(e, '@', 2) $$;

-- Enforcement point: users get the view, never the table.
CREATE VIEW user_orders_v WITH (security_barrier) AS
SELECT user_id,
       CASE col_effect('user_orders', 'email')
            WHEN 'clear' THEN email
            WHEN 'mask'  THEN mask_email(email) END AS email,   -- deny → NULL
       amount
FROM user_orders
WHERE current_setting('app.purpose', true) IS DISTINCT FROM 'support'
   OR user_id = current_setting('app.ticket_user', true);       -- row filter

INSERT INTO column_tags VALUES ('user_orders', 'email', 'PII');
INSERT INTO tag_policy VALUES ('PII', 'support', 'support', 'mask'),
                              ('PII', 'privacy', 'dsr',     'clear');`,
      note: 'Grant <code>SELECT</code> on the view (and the two metadata tables) only, never on <code>user_orders</code>. Tested on Postgres 16: an analyst gets NULL emails, a support agent with ticket <code>u42</code> sees only u42\'s rows with <code>l***@post.de</code>, and the privacy role with purpose <code>dsr</code> sees clear values. <code>app.purpose</code> is a session setting here; in production the trusted query gateway sets it and logs it, not the user.'
    },
    {
      title: 'Python: propagate tags along OpenLineage column lineage', lang: 'python',
      code: `from collections import defaultdict, deque

RANK = {None: 0, "PSEUDO": 1, "PII": 2}

def column_edges(events):
    """(src_col, dst_col, transformation) from each output's columnLineage facet."""
    for ev in events:
        for out in ev.get("outputs", []):
            facet = out.get("facets", {}).get("columnLineage", {})
            for dst, spec in facet.get("fields", {}).items():
                for inp in spec.get("inputFields", []):
                    for tr in inp.get("transformations") or [{}]:
                        yield f'{inp["name"]}.{inp["field"]}', f'{out["name"]}.{dst}', tr

def propagate(seeds, edges, declassified=frozenset()):
    """A derived column of PII is PII, unless a steward declassified it."""
    nxt = defaultdict(list)
    for src, dst, tr in edges:
        nxt[src].append((dst, tr))
    tags, work = dict(seeds), deque(seeds)
    while work:                       # tags only go up, so cycles still terminate
        col = work.popleft()
        for dst, tr in nxt[col]:
            t = tags[col]
            if tr.get("masking") and t == "PII":
                t = "PSEUDO"          # hashed/tokenized: still personal data
            if dst in declassified:
                t = None
            if RANK[t] > RANK[tags.get(dst)]:
                tags[dst] = t
                work.append(dst)
    return tags

def erasure_fanout(tags):
    """Every dataset that still holds a personal-data column."""
    return sorted({col.rsplit(".", 1)[0] for col, t in tags.items() if t})`,
      note: 'Run on Python 3.13 with two OpenLineage events: <code>users.email → user_orders.email</code> (IDENTITY), <code>users.user_id → user_orders.user_key</code> (<code>masking: true</code>) and <code>user_orders.user_key → daily_rev.buyers</code> (AGGREGATION). Result: email PII, user_key and buyers PSEUDO, fan-out <code>[daily_rev, user_orders, users]</code>; with <code>daily_rev.buyers</code> declassified, <code>daily_rev</code> drops out.'
    },
    {
      title: 'Spring Boot: per-user keys and crypto-shredding', lang: 'java',
      code: `import static java.nio.charset.StandardCharsets.UTF_8;
import java.nio.ByteBuffer; import java.security.*; import java.util.*;
import javax.crypto.*; import javax.crypto.spec.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

// CREATE TABLE subject_keys (user_id text PRIMARY KEY, dek bytea NOT NULL);
@Service
public class SubjectKeyService {
  private static final SecureRandom RNG = new SecureRandom();
  private final JdbcTemplate jdbc;
  public SubjectKeyService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  /** Encrypt a PII field under the data subject's own key (AES-256-GCM). */
  public byte[] encrypt(String userId, String plain) throws GeneralSecurityException {
    byte[] dek = new byte[32]; RNG.nextBytes(dek);
    jdbc.update("INSERT INTO subject_keys VALUES (?, ?) ON CONFLICT DO NOTHING", userId, dek);
    byte[] iv = new byte[12]; RNG.nextBytes(iv);
    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(Cipher.ENCRYPT_MODE, key(userId).orElseThrow(), new GCMParameterSpec(128, iv));
    c.updateAAD(userId.getBytes(UTF_8));            // ciphertext is bound to its subject
    byte[] ct = c.doFinal(plain.getBytes(UTF_8));
    return ByteBuffer.allocate(12 + ct.length).put(iv).put(ct).array();
  }

  /** Empty once the subject was shredded: backups and replicas become unreadable too. */
  public Optional<String> decrypt(String userId, byte[] blob) throws GeneralSecurityException {
    Optional<SecretKey> k = key(userId);
    if (k.isEmpty()) return Optional.empty();
    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(Cipher.DECRYPT_MODE, k.get(), new GCMParameterSpec(128, blob, 0, 12));
    c.updateAAD(userId.getBytes(UTF_8));
    return Optional.of(new String(c.doFinal(blob, 12, blob.length - 12), UTF_8));
  }

  /** Erasure: destroy one key instead of rewriting every copy of the data. */
  public boolean shred(String userId) {
    return jdbc.update("DELETE FROM subject_keys WHERE user_id = ?", userId) == 1;
  }

  private Optional<SecretKey> key(String userId) {
    return jdbc.query("SELECT dek FROM subject_keys WHERE user_id = ?",
        (rs, i) -> (SecretKey) new SecretKeySpec(rs.getBytes(1), "AES"), userId).stream().findFirst();
  }
}`,
      note: 'Compiled with <code>javac --release 21</code> against Spring Boot 3.5.6 and run against Postgres 16: values decrypt, a blob from one user fails GCM authentication under another user\'s key, and after <code>shred("u42")</code> u42\'s blobs return empty while u17\'s still decrypt. In production, wrap each data key with a KMS key and keep the key table out of long-retention backups, or the shredded key comes back on restore. Whether key deletion counts as erasure is a legal call; many teams treat it as such for backups.'
    }
  ],

  related: ['data-lake', 'event-ingestion', 'rag-agent-platform', 'llm-gateway', 'observability', 'api-gateway']
});

/* knobs diagram = architecture + an optional steward review queue for low-confidence tags */
(function () {
  const d = SD.data;
  const a = d.architecture;
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes.concat([{ id: 'review', label: 'Steward review', sub: 'low-confidence tags', kind: 'client', wide: [760, 330], tall: [210, 440], tip: 'Columns the classifier is unsure about go to the data owner or a privacy steward. Their answers become training data.' }]),
    edges: a.edges.concat([{ from: 'cat', to: 'review' }])
  };
})();
