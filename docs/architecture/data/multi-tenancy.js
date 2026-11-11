(function () {
  /* Shared cost/ops model for the calculator. Every constant is an ESTIMATE (rule of thumb), not a vendor price:
     one app pod serves ~400 req/s; one pooled Postgres primary (+replica) serves ~4,000 req/s and costs ~$1,800/month;
     a small dedicated DB (silo) costs ~$120/month minimum; an app pod costs ~$120/month; app pool size = 20 connections per pod
     (pool / schema) or 2 per tenant per pod (database-per-tenant without a pooler); a schema-per-tenant cluster
     holds at most ~2,000 schemas before catalog size and migrations hurt; migrations run 8 tenants in parallel. */
  function model(v) {
    const m = Math.round(v.model);
    const peak = v.tenants * v.avg * v.peak;                       // req/s at the busiest hour (all tenants peaking together = worst case)
    const pods = Math.max(2, Math.ceil(peak / 400));
    let dbs, dbCost, conns, migr;
    if (m === 1) {                                               // pool: shared tables + tenant_id + RLS
      dbs = Math.max(1, Math.ceil(peak / 4000));
      dbCost = dbs * 1800;
      conns = pods * 20;
      migr = v.migSec * Math.max(1, Math.log10(v.tenants));      // one migration, bigger tables
    } else if (m === 2) {                                        // bridge: schema per tenant
      dbs = Math.max(Math.ceil(peak / 4000), Math.ceil(v.tenants / 2000));
      dbCost = dbs * 1800;
      conns = pods * 20 * Math.min(dbs, 4);
      migr = v.tenants * v.migSec / 8;
    } else {                                                     // silo: database per tenant
      dbs = v.tenants;
      dbCost = v.tenants * 120 + Math.ceil(peak / 4000) * 600;
      conns = pods * v.tenants * 2;
      migr = v.tenants * (v.migSec + 3) / 8;                       // +3 s connect / lock / verify per DB
    }
    const infra = dbCost + pods * 120;
    return { m, peak, pods, dbs, infra, conns, migr, perTenant: infra / v.tenants };
  }
  const $ = (n) => '$' + SD.fmt.num(Math.round(n));
  const dur = (s) => s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h';

  SD.register({
    slug: 'multi-tenancy',
    domain: 5,
    title: 'Multi-tenancy Architecture',
    examples: 'AWS SaaS Lens, Postgres RLS',
    tagline: 'Serve thousands of customers from one platform, and make each of them feel alone in it: <b>isolated data, fair performance, a known cost</b>.',
    tldr: {
      problem: 'A SaaS product serves many customers (<b>tenants</b>) on shared infrastructure. Share too much and one tenant can read another\'s data or slow everyone down. Share too little and every customer costs a database, a deployment and a migration run.',
      idea: 'Choose a <b>tenancy model per layer</b>: <b>silo</b> (dedicated), <b>pool</b> (shared) or <b>bridge</b> (a mix), the terms AWS uses in its SaaS Lens. Carry a verified <b>tenant context</b> from the token to the database, enforce isolation <b>in the data layer</b> (Postgres row-level security), throttle and <b>meter per tenant</b>, and put premium or regulated tenants in silos.',
      insight: 'Isolation is not one switch. You trade <b>data isolation, performance isolation and cost</b> separately, and the expensive mistakes are operational: <b>migrations across N schemas, connection counts</b> and a noisy neighbour with no per-tenant limit.',
      numbers: [
        { v: '3 models', l: 'silo, pool, bridge (AWS SaaS Lens)' },
        { v: '2048 / 4', l: 'Route 53 virtual name servers / per domain with shuffle sharding (AWS Builders\' Library)' },
        { v: '~1–5K', l: 'schemas per Postgres cluster before catalog and migrations hurt (rule of thumb)' }
      ]
    },

    intro: {
      what: 'Multi-tenancy means <b>one running system serves many customers</b>, called tenants, at once. A tenant is usually a company or workspace, with many users inside it. The architecture decides <b>what tenants share</b> (servers, databases, tables) and <b>how they are kept apart</b>: their data, their performance and their bill.',
      analogy: {
        icon: '🏢',
        title: 'An apartment building, not a street of houses',
        text: 'Houses (one deployment per customer) give everyone their own walls, plumbing and roof, but each one must be built and repaired separately. An apartment building shares the structure, the lifts and the boiler, so each flat is far cheaper. It still needs <b>locked doors</b> (data isolation), <b>sound-proofing</b> (performance isolation) and <b>a meter per flat</b> (cost attribution). The penthouse can have a private lift: that is a premium tenant in a silo. The analogy breaks in one place: in software a missing lock is invisible until somebody walks through the wrong door.'
      },
      problem: 'A startup runs one database for all customers and filters every query with <code>WHERE tenant_id = ?</code>. One developer forgets the filter in a new report endpoint, and customer A downloads customer B\'s invoices. The same month, customer C runs a giant export and every other customer\'s pages take 8 seconds. The question this page answers is <b>"how do we share infrastructure for cost while guaranteeing each tenant\'s data, performance and bill stay its own?"</b>',
      story: [
        {
          stage: 'naive',
          title: 'One database, filter in the code',
          text: 'All tenants share tables and app servers. Every query adds <code>WHERE tenant_id = ?</code> by hand. It is cheap, simple and fast to build, which is exactly why every SaaS starts here.',
          scene: {
            nodes: [
              { id: 'a', label: 'Tenant A', sub: 'users', kind: 'client', at: [70, 0] },
              { id: 'b', label: 'Tenant B', sub: 'users', kind: 'client', at: [210, 0] },
              { id: 'c', label: 'Tenant C', sub: 'users', kind: 'client', at: [350, 0] },
              { id: 'app', label: 'App servers', sub: 'shared', kind: 'service', at: [210, 110] },
              { id: 'db', label: 'One database', sub: 'WHERE tenant_id=?', kind: 'store', at: [210, 220] }
            ],
            edges: [{ from: 'a', to: 'app' }, { from: 'b', to: 'app' }, { from: 'c', to: 'app' }, { from: 'app', to: 'db' }],
            flow: [['a>app', 'b>app', 'c>app'], 'app>db']
          }
        },
        {
          stage: 'breaks',
          title: 'A forgotten filter and a noisy neighbour',
          text: 'One query misses the filter and leaks another tenant\'s rows. Tenant C\'s bulk export saturates the shared database, so <b>everyone</b> slows down. Nobody can say what tenant C actually costs.',
          scene: {
            nodes: [
              { id: 'a', label: 'Tenant A', sub: 'sees B\'s data!', kind: 'client', at: [70, 0] },
              { id: 'b', label: 'Tenant B', sub: '8 s pages', kind: 'client', at: [210, 0] },
              { id: 'c', label: 'Tenant C', sub: 'bulk export', kind: 'client', at: [350, 0] },
              { id: 'app', label: 'App servers', sub: 'no limits', kind: 'service', at: [210, 110] },
              { id: 'db', label: 'One database', sub: 'CPU 100%', kind: 'store', at: [210, 220] }
            ],
            edges: [{ from: 'a', to: 'app' }, { from: 'b', to: 'app' }, { from: 'c', to: 'app' }, { from: 'app', to: 'db' }],
            flow: ['c>app', 'app>db', 'app>a'],
            err: ['a', 'db'], warn: ['b', 'c'],
            badges: { a: ['data leak', 'err'], db: ['saturated', 'err'] }
          }
        },
        {
          stage: 'fix',
          title: 'Tenant context, enforced in the data layer',
          text: 'The tenant comes from the <b>signed token</b>, not from a parameter. The database enforces it with <b>row-level security</b>, so a forgotten filter returns nothing. A <b>per-tenant rate limit</b> caps tenant C, and the biggest customer gets its own <b>silo</b>.',
          scene: {
            nodes: [
              { id: 'a', label: 'Tenant A', sub: 'own rows only', kind: 'client', at: [70, 0] },
              { id: 'b', label: 'Tenant B', sub: 'fast again', kind: 'client', at: [210, 0] },
              { id: 'c', label: 'Tenant C', sub: 'premium', kind: 'client', at: [350, 0] },
              { id: 'app', label: 'App + limits', sub: 'tenant from JWT', kind: 'service', at: [140, 110] },
              { id: 'db', label: 'Pool DB + RLS', sub: 'policy per row', kind: 'store', at: [140, 220] },
              { id: 'silo', label: 'Silo for C', sub: 'dedicated stack', kind: 'store', at: [350, 165] }
            ],
            edges: [{ from: 'a', to: 'app' }, { from: 'b', to: 'app' }, { from: 'c', to: 'silo' }, { from: 'app', to: 'db' }],
            flow: [['a>app', 'b>app', 'c>silo'], 'app>db'],
            ok: ['db', 'app', 'silo'],
            badges: { db: ['RLS on', 'ok'], silo: ['isolated', 'ok'] }
          }
        }
      ],
      usedBy: ['Salesforce (one shared database, every row keyed by OrgID)', 'Slack (cell-based architecture per availability zone)', 'Atlassian Cloud (Jira, Confluence: tenant context service)', 'Amazon Route 53 (shuffle sharding per domain)', 'Citus / Azure Cosmos DB for PostgreSQL (shard by tenant id)', 'Supabase (Postgres row-level security as the access model)'],
      whenToUse: [
        'You sell the same product to many organisations and want one codebase and one deployment pipeline',
        'Per-customer infrastructure would make small customers unprofitable',
        'You need a mix: cheap pooled tiers for the long tail and dedicated silos for large or regulated customers'
      ],
      whenNot: [
        'You have a handful of huge customers who each demand their own deployment and contract: run single-tenant stacks with good automation',
        'A tenant boundary is really an identity question (who may see what inside one company): see <a href="iam-oauth-oidc.html">Identity &amp; Access</a>',
        'The worry is legal (residency, deletion, consent) more than architecture: start with <a href="data-privacy.html">Data Privacy &amp; Regulation</a>'
      ],
      glossary: [
        { term: 'Tenant', def: 'A customer organisation whose users, data and configuration are grouped and isolated together.' },
        { term: 'Silo / pool / bridge', def: 'Dedicated resources per tenant, resources shared by all tenants, or a mix chosen per layer or per service.' },
        { term: 'Tenant context', def: 'The verified tenant id carried with every request, from the token through the code to the database session.' },
        { term: 'Row-level security (RLS)', def: 'A Postgres feature where policies attached to a table filter which rows a session can read or write.' },
        { term: 'Noisy neighbour', def: 'A tenant whose heavy load degrades the performance of other tenants sharing the same resources.' },
        { term: 'Shuffle sharding', def: 'Giving each tenant a random small subset of workers, so two tenants rarely share all of theirs.' },
        { term: 'Cell', def: 'A complete, independent copy of the stack serving a subset of tenants, so a failure stays inside one cell.' },
        { term: 'Tiering', def: 'Selling different isolation, limits and support levels (e.g. basic, premium) on the same platform.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Tenant context from a trusted source</b>: derive it from a verified token claim, never from a URL or body parameter',
        '<b>Enforce isolation below the application</b>: RLS, separate schemas or separate databases, so one bug cannot leak data',
        '<b>Choose silo / pool / bridge per layer</b>, and per tier: premium and regulated tenants may get silos',
        '<b>Throttle and quota per tenant</b> at the edge and at shared resources (queues, DB, caches)',
        '<b>Meter per tenant</b>: usage and cost attributed to a tenant id, feeding pricing and margins',
        '<b>Automate the lifecycle</b>: onboarding, tier changes, moves between cells, offboarding and deletion'
      ],
      nonFunctional: [
        'Zero cross-tenant reads: tested by automated isolation tests on every release',
        'Noisy-neighbour impact: other tenants\' p99 rises < 20% when one tenant hits its limit',
        'Onboarding a pooled tenant in minutes; a silo tenant in < 1 hour, fully automated',
        'Schema migration across all tenants completes inside one maintenance window',
        '≥ 90% of infrastructure cost attributed to a tenant or tier (the rest is platform overhead)',
        'Per-tenant restore point and residency region honoured, with an auditable record'
      ],
      outOfScope: [
        '<b>Filter-by-convention</b>: relying on every developer to remember <code>WHERE tenant_id = ?</code>',
        '<b>Tenant id from the client</b>: trusting a header or path parameter the user controls',
        '<b>One-off snowflakes</b>: custom code branches or hand-built stacks per customer',
        '<b>Silo everything by default</b>: paying per-tenant infrastructure and N migrations for tenants who never asked for it',
        '<b>Owner-role app connection</b>: RLS enabled but the app connects as the table owner or a BYPASSRLS role'
      ]
    },

    calculator: {
      inputs: [
        { id: 'tenants', label: 'Tenants', min: 10, max: 100000, value: 2000, log: true, fmt: 'num' },
        { id: 'avg', label: 'Average load per tenant (req/s)', min: 0.1, max: 50, step: 0.1, value: 2, unit: 'req/s' },
        { id: 'peak', label: 'Peak-to-average ratio', min: 1, max: 20, step: 0.5, value: 4, unit: '×' },
        { id: 'model', label: 'Isolation: 1 = pool (RLS) · 2 = schema per tenant · 3 = DB per tenant', min: 1, max: 3, step: 1, value: 1 },
        { id: 'migSec', label: 'One schema migration, per tenant (s)', min: 1, max: 120, value: 5, unit: 's' }
      ],
      outputs: [
        { label: 'Peak load / app pods / databases', f: (v) => { const r = model(v); return SD.fmt.num(Math.round(r.peak)) + ' req/s · ' + r.pods + ' pods · ' + SD.fmt.num(r.dbs) + ' DB' + (r.dbs > 1 ? 's' : ''); } },
        { label: 'Infrastructure cost / month', f: (v) => $(model(v).infra) },
        { label: 'Cost per tenant / month', f: (v) => '$' + model(v).perTenant.toFixed(2) },
        { label: 'Database connections (no pooler)', f: (v) => { const c = model(v).conns; return SD.fmt.num(c) + (c > 5000 ? ' ⚠ needs PgBouncer / RDS Proxy' : ''); } },
        { label: 'Migration run across all tenants', f: (v) => dur(model(v).migr) + (model(v).m > 1 ? ' (8 in parallel)' : ' (one schema)') },
        { label: 'Catalog objects (≈ 50 tables × 3 objects each)', f: (v) => { const r = model(v); return r.m === 1 ? '≈ 150 (shared)' : '≈ ' + SD.fmt.num(Math.round(150 * v.tenants / (r.m === 2 ? r.dbs : v.tenants))) + ' per database'; } }
      ],
      note: 'All prices and capacities are <em>estimates</em> for a mid-size cloud setup: ~400 req/s per app pod, ~4,000 req/s and ~$1,800/month per pooled Postgres primary + replica, ~$120/month per small dedicated database, 20 connections per pod per database, 2 per tenant per pod for DB-per-tenant without a pooler. The peak assumes <b>all tenants peak together</b>, the worst case; real fleets are smoother. Watch three cliffs: <b>connections</b> grow with tenants × pods in a silo; <b>migration time</b> grows linearly with schemas or databases; <b>catalog size</b> (pg_class, pg_attribute) grows with every schema, slowing planning, backups and <code>pg_dump</code>.'
    },

    api: [
      { m: 'DOC', p: 'Tenancy model decision (ADR)', d: 'Per layer (identity, compute, queue, database, storage, search): silo, pool or bridge, and why. Which tiers get which isolation. The trigger to move a tenant to a silo (size, regulation, contract).' },
      { m: 'HTTP', p: 'JWT tenant claim', d: 'Claims <code>tenant_id</code>, <code>tier</code> and <code>region</code> (e.g. <code>"tenant_id": "t-acme"</code>), issued by the IdP after login. The gateway verifies the signature and drops any client-supplied tenant header.' },
      { m: 'SQL', p: 'RLS policy per pooled table', d: '<code>ENABLE</code> + <code>FORCE ROW LEVEL SECURITY</code>, a policy <code>USING (tenant_id = current_setting(…)::uuid)</code> on <code>app.tenant_id</code>, with the same <code>WITH CHECK</code>, an app role without <code>BYPASSRLS</code>.' },
      { m: 'POLICY', p: 'Per-tenant limits by tier', d: 'Requests/s, burst, concurrent jobs, storage GB, API keys, seats. Enforced at the gateway (token bucket keyed by tenant) and at queues (per-tenant concurrency). Returns 429 with <code>Retry-After</code>.' },
      { m: 'EVENT', p: 'TenantProvisioned / TenantOffboarded', d: 'Emitted by the onboarding service: tenant id, tier, region, cell, created resources. Consumers create billing accounts, IdP orgs, DNS and dashboards. Offboarding records the deletion deadline.' },
      { m: 'DOC', p: 'Per-tenant runbook', d: 'Restore one tenant to a point in time, export a tenant\'s data, move a tenant between cells, purge a tenant within the contract deadline, and verify each step.' }
    ],

    dataModel: [
      { name: 'tenant', store: 'Control plane (Postgres / DynamoDB)', fields: [['tenant_id', 'uuid', 'pk'], ['name', 'text'], ['tier', 'basic|premium|enterprise', 'idx'], ['isolation', 'pool|schema|silo'], ['region', 'text', 'idx'], ['cell_id', 'text', 'fk'], ['status', 'active|suspended|deleting'], ['created_at', 'timestamptz']], note: 'The source of truth the router reads. Everything about a tenant\'s placement lives here, not in config files.' },
      { name: 'invoice (pooled table)', store: 'Postgres with RLS', fields: [['tenant_id', 'uuid', 'pk'], ['invoice_id', 'uuid', 'pk'], ['customer', 'text'], ['amount', 'numeric'], ['created_at', 'timestamptz', 'idx']], note: 'Tenant id leads the primary key and every index, so queries stay per-tenant and the table can later be sharded by tenant (the Citus pattern).' },
      { name: 'tenant_limits', store: 'Control plane + cache', fields: [['tenant_id', 'uuid', 'pk'], ['rps', 'int'], ['burst', 'int'], ['max_jobs', 'int'], ['storage_gb', 'int'], ['shard_set', 'int[]']], note: '<code>shard_set</code> holds the tenant\'s shuffle-shard workers.' },
      { name: 'usage_record', store: 'Columnar store / data warehouse', fields: [['tenant_id', 'uuid', 'idx'], ['hour', 'timestamptz', 'idx'], ['metric', 'requests|cpu_s|storage_gb|egress_gb'], ['quantity', 'numeric'], ['source', 'text']], note: 'Feeds cost allocation and usage billing. Platform overhead is spread by a stated rule.' }
    ],

    architecture: {
      title: 'Tenant-aware request path: token → gateway → router → cell → database',
      nodes: [
        { id: 'client', label: 'Tenant users', sub: 'acme.app.com', kind: 'client', wide: [90, 170], tall: [70, 0], tip: 'Users of many tenants hit the same domain or a tenant subdomain.' },
        { id: 'idp', label: 'Identity provider', sub: 'JWT with tenant_id', kind: 'external', wide: [280, 60], tall: [210, 0], tip: 'Login issues a signed token whose claims carry tenant id, tier and region. The client cannot change them.' },
        { id: 'onboard', label: 'Onboarding svc', sub: 'provision · offboard', kind: 'service', wide: [680, 60], tall: [350, 0], tip: 'Automates the tenant lifecycle: creates the IdP org, catalog row, schema or silo, limits and billing account.' },
        { id: 'gw', label: 'API gateway', sub: 'verify · rate-limit', kind: 'edge', wide: [280, 170], tall: [70, 105], tip: 'Verifies the JWT, strips client tenant headers, applies the per-tenant token bucket and emits usage events.' },
        { id: 'meter', label: 'Metering', sub: 'usage per tenant', kind: 'queue', wide: [90, 300], tall: [210, 105], tip: 'Usage events (requests, CPU seconds, GB) keyed by tenant id, for billing and cost attribution.' },
        { id: 'catalog', label: 'Tenant catalog', sub: 'tier · cell · region', kind: 'store', wide: [470, 60], tall: [350, 105], tip: 'The control plane: which cell, region, isolation model and limits each tenant has.' },
        { id: 'router', label: 'Tenant router', sub: 'tenant → cell', kind: 'policy', wide: [470, 170], tall: [210, 210], tip: 'Looks up the tenant\'s cell in the catalog (cached) and forwards. Moving a tenant is a catalog update.' },
        { id: 'cellA', label: 'Pool cell A', sub: 'shared app pods', kind: 'service', wide: [660, 170], tall: [70, 315], tip: 'A full copy of the stack for a few thousand basic tenants. Sets the tenant id on every DB transaction.' },
        { id: 'silo', label: 'Premium silo', sub: 'one tenant', kind: 'service', wide: [470, 300], tall: [210, 315], tip: 'Dedicated stack for a premium or regulated tenant. Same code, same pipeline, own resources.' },
        { id: 'cellB', label: 'Pool cell B', sub: 'shared app pods', kind: 'service', wide: [660, 280], tall: [350, 315], tip: 'Another cell. A failure or a noisy tenant in cell A cannot touch tenants in cell B.' },
        { id: 'dbA', label: 'Postgres A', sub: 'tenant_id + RLS', kind: 'store', wide: [870, 170], tall: [70, 420], tip: 'Pooled tables. Every query runs with app.tenant_id set; RLS policies filter rows.' },
        { id: 'siloDb', label: 'Silo database', sub: 'own DB · own region', kind: 'store', wide: [280, 300], tall: [210, 420], tip: 'Database per tenant: own backups, own encryption key, own restore point, own residency.' },
        { id: 'dbB', label: 'Postgres B', sub: 'tenant_id + RLS', kind: 'store', wide: [870, 280], tall: [350, 420], tip: 'Pooled database for cell B.' }
      ],
      edges: [
        { from: 'client', to: 'idp' },
        { from: 'client', to: 'gw' },
        { from: 'gw', to: 'meter' },
        { from: 'gw', to: 'router' },
        { from: 'router', to: 'catalog' },
        { from: 'onboard', to: 'catalog' },
        { from: 'router', to: 'cellA' },
        { from: 'router', to: 'cellB' },
        { from: 'router', to: 'silo' },
        { from: 'cellA', to: 'dbA' },
        { from: 'cellB', to: 'dbB' },
        { from: 'silo', to: 'siloDb' }
      ]
    },

    scenarios: [
      {
        id: 'path', title: 'A request carries its tenant to the row', tone: 'ok',
        steps: [
          { text: 'A user of tenant <b>acme</b> logs in. The IdP issues a signed JWT with <code>tenant_id=acme</code>, <code>tier=basic</code>.', flow: ['client>idp'], badges: { idp: 'tenant_id=acme' } },
          { text: 'The gateway verifies the signature, <b>drops any X-Tenant-Id header</b> from the client, checks acme\'s token bucket, and emits a usage event.', flow: ['client>gw', 'gw>meter'], badges: { gw: ['bucket ok', 'ok'] } },
          { text: 'The router looks up acme in the (cached) catalog: <b>cell A</b>, pool, region eu-west.', flow: ['gw>router', 'router>catalog'], badges: { catalog: 'acme → A' } },
          { text: 'Cell A opens a transaction and runs <code>SET LOCAL app.tenant_id = \'acme\'</code> before any query.', flow: ['router>cellA', 'cellA>dbA'], badges: { cellA: 'SET LOCAL' } },
          { text: 'A query with no WHERE clause still returns only acme\'s rows: the <b>RLS policy</b> adds the filter. A forgotten filter becomes a non-event, not a breach.', nodes: ['dbA'], ok: ['dbA'], badges: { dbA: ['RLS filtered', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'noisy', title: 'Noisy neighbour: one tenant floods a shared cell', tone: 'err',
        steps: [
          { text: 'Tenant <b>bigco</b> starts a script that sends 20× its usual traffic into pool cell A.', flow: ['client>gw', 'gw>router', 'router>cellA'], warn: ['cellA'], badges: { client: ['bigco 20×', 'warn'] } },
          { text: 'There is no per-tenant limit. Cell A\'s pods and database saturate, and <b>every tenant in cell A</b> sees timeouts.', flow: ['cellA>dbA'], err: ['cellA', 'dbA'], badges: { dbA: ['CPU 100%', 'err'] }, tone: 'err' },
          { text: 'Cell B and the premium silo are untouched: <b>the cell is the blast radius</b>. Without cells, this would be every customer.', nodes: ['cellB', 'silo'], ok: ['cellB', 'silo'], badges: { cellB: ['fine', 'ok'], silo: ['fine', 'ok'] } },
          { text: 'Fix: a <b>per-tenant token bucket</b> at the gateway returns 429 to bigco above its tier limit, and per-tenant concurrency caps protect queues and the DB pool.', flow: ['client>gw'], ok: ['gw'], badges: { gw: ['429 for bigco', 'ok'] } },
          { text: 'Longer term: <b>shuffle-shard</b> tenants across workers so a bad tenant shares all its workers with almost nobody, and move bigco to a larger tier or its own cell.', nodes: ['router', 'catalog'], ok: ['cellA', 'dbA'], tone: 'ok' }
        ]
      },
      {
        id: 'onboard', title: 'Onboard a premium tenant into a silo', tone: 'info',
        steps: [
          { text: 'Sales closes a regulated customer that needs <b>its own database in the EU</b> and a dedicated encryption key.', nodes: ['onboard'], badges: { onboard: 'tier=premium' } },
          { text: 'The onboarding service runs the same infrastructure-as-code module as every silo: database, key, app deployment, limits, IdP org.', flow: ['onboard>catalog'], badges: { catalog: 'cell=silo-17' } },
          { text: 'The router now sends this tenant\'s traffic to its silo. The code is identical; only placement differs.', flow: ['client>gw', 'gw>router', 'router>silo', 'silo>siloDb'], ok: ['silo', 'siloDb'] },
          { text: 'Usage still flows to metering, so the silo\'s <b>direct cost</b> appears on that tenant\'s margin report.', flow: ['gw>meter'], ok: ['meter'], badges: { meter: 'direct cost', siloDb: ['eu-west', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'migrate', title: 'Scale: a migration across 8,000 schemas', tone: 'warn',
        steps: [
          { text: 'The product grew on <b>schema-per-tenant</b>. Now there are 8,000 schemas, each with 50 tables and their indexes.', nodes: ['dbA', 'dbB'], warn: ['dbA', 'dbB'], badges: { dbA: '4,000 schemas', dbB: '4,000 schemas' } },
          { text: 'A new column means 8,000 <code>ALTER TABLE</code> runs. At 5 s each and 8 in parallel, that is <b>over an hour</b>, and some schemas fail half way.', nodes: ['dbA', 'dbB'], err: ['dbA'], badges: { dbA: ['schema 3,112 failed', 'err'] }, tone: 'warn' },
          { text: 'The catalog holds over a million objects per database. Planning, <code>pg_dump</code> and backups slow down.', nodes: ['dbA'], warn: ['dbA'], badges: { dbA: ['catalog bloat', 'warn'] } },
          { text: 'Fix: make migrations <b>backward compatible</b> (expand/contract), track a per-tenant schema version in the catalog, and move the long tail to pooled tables with RLS. Keep schemas or silos for the few who need them.', flow: ['onboard>catalog'], ok: ['catalog'], badges: { catalog: ['schema_version per tenant', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'cellfail', title: 'Pressure: a bad deploy hits one cell', tone: 'warn',
        steps: [
          { text: 'A release goes to <b>cell A first</b> (cells double as deployment waves). Error rate jumps.', nodes: ['cellA'], err: ['cellA'], badges: { cellA: ['5xx 12%', 'err'] }, tone: 'warn' },
          { text: 'Only cell A\'s tenants are affected. The pipeline halts the rollout before cell B or any silo gets the build.', nodes: ['cellB', 'silo'], ok: ['cellB', 'silo'] },
          { text: 'Roll back cell A. Because tenants are pinned to cells in the catalog, the router can also <b>move a critical tenant</b> to cell B while it recovers.', flow: ['router>catalog', 'router>cellB', 'cellB>dbB'], ok: ['cellB', 'dbB'], tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Pick how much you isolate at each layer. Meters show what that buys and costs for a platform of a few thousand mostly small tenants. Values are an illustrative model, not a benchmark.',
      controls: [
        { id: 'data', label: 'Data isolation', type: 'seg', value: 'rls', options: [
          { v: 'rls', l: 'Shared tables + RLS', hint: 'pool' }, { v: 'schema', l: 'Schema per tenant', hint: 'bridge' }, { v: 'db', l: 'Database per tenant', hint: 'silo' }] },
        { id: 'compute', label: 'Compute isolation', type: 'seg', value: 'shared', options: [
          { v: 'shared', l: 'Shared pool' }, { v: 'tier', l: 'Pools per tier' }, { v: 'tenant', l: 'Per tenant' }] },
        { id: 'throttle', label: 'Throttling', type: 'seg', value: 'none', options: [
          { v: 'none', l: 'None' }, { v: 'limits', l: 'Per-tenant limits' }, { v: 'shuffle', l: 'Limits + shuffle sharding' }] },
        { id: 'premium', label: 'Premium tier in silo', type: 'seg', value: 'off', options: [
          { v: 'off', l: 'Off' }, { v: 'on', l: 'On' }] }
      ],
      evaluate(s) {
        const clamp = (x) => Math.max(0.03, Math.min(1, x));
        const dIso = { rls: 0.6, schema: 0.72, db: 0.95 }[s.data];
        const cIso = { shared: 0.35, tier: 0.6, tenant: 0.95 }[s.compute];
        const tIso = { none: 0, limits: 0.25, shuffle: 0.38 }[s.throttle];
        const iso = clamp(0.45 * dIso + 0.35 * Math.min(1, cIso + tIso) + (s.premium === 'on' ? 0.1 : 0) + 0.05);
        let cost = { rls: 1, schema: 1.3, db: 4.5 }[s.data] * { shared: 1, tier: 1.15, tenant: 3.5 }[s.compute];
        if (s.throttle === 'shuffle') cost *= 1.05;
        if (s.premium === 'on' && s.data !== 'db') cost *= 1.12;
        const ops = clamp(1 - ({ rls: 0.15, schema: 0.45, db: 0.7 }[s.data] + { shared: 0.05, tier: 0.12, tenant: 0.35 }[s.compute] + (s.throttle === 'shuffle' ? 0.08 : s.throttle === 'limits' ? 0.04 : 0) + (s.premium === 'on' ? 0.06 : 0)));
        // blast radius = share of tenants hurt by one noisy tenant
        let blast = s.compute === 'tenant' ? 0.01 : s.compute === 'tier' ? 0.5 : 1;
        if (s.throttle === 'limits') blast *= 0.25;
        if (s.throttle === 'shuffle') blast *= 0.03;
        if (s.data === 'db' && s.compute !== 'shared') blast *= 0.5;
        const blastPct = Math.max(0.1, blast * 100);
        const onboardMin = ({ rls: 1, schema: 3, db: 20 }[s.data]) + ({ shared: 0, tier: 0, tenant: 25 }[s.compute]);
        const migr = { rls: 'one run', schema: 'N runs (one per schema)', db: 'N runs (one per database)' }[s.data];
        const metrics = [
          { k: 'Isolation (data + performance)', v: iso >= 0.8 ? 'strong' : iso >= 0.55 ? 'good' : 'weak', s: iso },
          { k: 'Cost per tenant (pool + RLS = 1×)', v: cost.toFixed(1) + '×', s: clamp(1.1 - Math.log(cost) / 3), hint: 'illustrative' },
          { k: 'Ops load', v: ops >= 0.7 ? 'low' : ops >= 0.4 ? 'medium' : 'high (N of everything)', s: ops, hint: 'migrations: ' + migr },
          { k: 'Noisy-neighbour blast radius', v: '≈ ' + (blastPct < 1 ? blastPct.toFixed(1) : Math.round(blastPct)) + '% of tenants', s: clamp(1 - blastPct / 100) },
          { k: 'Onboarding time', v: '≈ ' + onboardMin + ' min', s: clamp(1 - onboardMin / 50), hint: 'automated' },
          { k: 'Premium / compliance fit', v: s.premium === 'on' || s.data === 'db' ? 'dedicated option' : 'shared only', s: s.premium === 'on' || s.data === 'db' ? 0.9 : 0.4 }
        ];
        const notes = [];
        if (s.data === 'rls') notes.push('Use <code>FORCE ROW LEVEL SECURITY</code> and an app role that is not the table owner and has no <code>BYPASSRLS</code>; owners and superusers skip policies.');
        if (s.data === 'schema') notes.push('Schema per tenant feels isolated but shares one cluster\'s CPU, memory and catalog. Expect long migration runs and catalog bloat past a few thousand schemas.');
        if (s.data === 'db') notes.push('Database per tenant multiplies connections (pods × tenants) and backups. You will need a pooler (PgBouncer, RDS Proxy) and fleet-wide migration tooling.');
        if (s.throttle === 'none') notes.push('With no per-tenant limits, any tenant can consume the whole shared pool. This is the most common real noisy-neighbour cause.');
        if (s.throttle === 'shuffle') notes.push('Shuffle sharding: with 8 workers and 2 per tenant there are 28 combinations, so a noisy tenant fully overlaps with only ~1 in 28 others.');
        if (s.compute === 'tenant' && s.data === 'rls') notes.push('Dedicated compute but a shared database: the DB is still the shared bottleneck. Isolate the layer that actually saturates.');
        if (s.premium === 'on') notes.push('Bridge by tier: the long tail stays pooled and cheap, premium tenants get a silo with their own limits, region and restore point.');
        let verdict;
        if (s.compute === 'tenant' && s.data === 'db' && s.premium === 'off') verdict = '⚠ <b>Full silo for everyone.</b> Strong isolation, but per-tenant cost and N-of-everything operations make small tenants unprofitable.';
        else if (s.throttle === 'none' && s.compute !== 'tenant') verdict = '❌ <b>No per-tenant limits on shared compute.</b> One tenant can take the platform down. Add limits before anything else.';
        else if (s.data === 'rls' && s.throttle !== 'none' && s.compute !== 'tenant') verdict = s.premium === 'on' ? '✅ <b>The usual winning bridge:</b> pooled tables with RLS and limits for the long tail, silos for premium tenants.' : '👍 <b>Solid pool.</b> Cheap and safe if RLS is forced; add a premium silo when large or regulated customers arrive.';
        else if (s.data === 'schema') verdict = '⚠ <b>Workable for hundreds of tenants.</b> Past a few thousand, migrations and catalog size dominate. Plan the exit to RLS or silos.';
        else verdict = '👍 <b>Defensible.</b> Check the cost per tenant against your cheapest plan\'s price.';
        const target = s.premium === 'on' ? 'silo' : 'cellA';
        const flow = ['client>gw', 'gw>router', 'router>' + target, target === 'silo' ? 'silo>siloDb' : 'cellA>dbA'];
        return {
          metrics, verdict, notes, flow,
          labels: {
            dbA: { label: 'Postgres A', sub: { rls: 'tenant_id + RLS', schema: 'schema per tenant', db: 'DB per tenant' }[s.data] },
            cellA: { label: 'Pool cell A', sub: { shared: 'shared app pods', tier: 'pods per tier', tenant: 'pods per tenant' }[s.compute] },
            gw: { label: 'API gateway', sub: { none: 'no tenant limits', limits: 'token bucket / tenant', shuffle: 'limits + shuffle' }[s.throttle] }
          },
          hide: s.premium === 'on' || s.data === 'db' ? [] : ['silo', 'siloDb'],
          hot: [target], err: s.throttle === 'none' && s.compute !== 'tenant' ? ['cellA'] : [], ok: iso >= 0.8 ? ['dbA'] : [],
          warn: s.data === 'schema' ? ['dbA'] : [],
          badges: { cellA: [blastPct < 5 ? 'blast ≈ ' + blastPct.toFixed(1) + '%' : 'blast ≈ ' + Math.round(blastPct) + '%', blastPct < 5 ? 'ok' : blastPct < 40 ? 'warn' : 'err'] }
        };
      }
    },

    widget: {
      title: 'Noisy neighbour lab + row-level security demo',
      caption: 'Twelve tenants share a cluster of eight workers. <b>Tap a tenant</b> to make it noisy (10× load) and watch the others\' latency. Turn on <b>per-tenant limits</b> and <b>shuffle sharding</b>, or switch the isolation model, and watch the cost and isolation meters. Below, pick the current tenant: the RLS policy filters the same <code>SELECT</code> to that tenant\'s rows, unless the session bypasses RLS.'
    },

    realWorld: {
      intro: 'The vocabulary comes from AWS\'s SaaS guidance; the hard lessons come from companies that run thousands to millions of tenants. Isolation, routing and noisy-neighbour control are recurring themes.',
      timeline: [
        { when: '2008', who: 'Salesforce', title: 'One shared schema, keyed by OrgID', text: 'Salesforce describes its platform as <b>multitenant and metadata-driven</b>: one shared database and schema, every tenant-specific row carries an <b>OrgID</b>, and per-org metadata tables (objects, fields) define each tenant\'s customisations. Craig Weissman\'s QCon 2008 talk adds that tables are hash-partitioned by OrgID with no runtime DDL.', src: 0 },
        { when: '2016', who: 'Citus Data', title: 'Shard by tenant id, co-locate everything', text: 'Citus recommends distributing every table by the <b>tenant id</b> column so a tenant\'s rows across tables live on the same node. Per-tenant queries and joins route to one shard; primary and foreign keys include the tenant id.', src: 2 },
        { when: '2016+', who: 'AWS Builders\' Library', title: 'Shuffle sharding in Route 53', text: 'Route 53 assigns each hosted zone <b>4 of 2,048</b> virtual name servers. With so many combinations, two domains almost never share the same set, so an attack on one domain affects very few others. AWS published the Infima library with implementations.', src: 3 },
        { when: 'c. 2020', who: 'AWS SaaS Factory', title: 'Tenant isolation strategies whitepaper', text: 'AWS defines <b>silo, pool and bridge</b> isolation and argues isolation must be enforced by infrastructure and policies (for example IAM scoped by tenant), not just by application code.', src: 4 },
        { when: '2020+', who: 'AWS Well-Architected', title: 'SaaS Lens', text: 'The SaaS Lens frames silo (dedicated resources), pool (shared resources) and bridge (a mix, often per microservice), and lists tenant isolation, onboarding, metering and tiering as core design areas.', src: 5 },
        { when: 'c. 2020', who: 'AWS Database Blog', title: 'Multi-tenant isolation with Postgres RLS', text: 'AWS shows pooled Postgres tables protected by RLS policies on a session variable, and warns that table owners bypass policies unless the table uses <b>FORCE ROW LEVEL SECURITY</b>.', src: 6 },
        { when: 'n.d.', who: 'Atlassian', title: 'Tenant Context Service', text: 'Atlassian\'s TCS serves tenant metadata to every Cloud product with targets of <b>4–5 nines</b>. To limit blast radius and noisy neighbours it groups tenants into smallish <b>shards</b>, deployed in all Cloud regions.', src: 8 },
        { when: 'Aug 2023', who: 'Slack', title: 'Migration to a cellular architecture', text: 'After availability-zone incidents, Slack rebuilt its critical services as <b>cells per AZ</b>, so traffic can be drained away from a failing cell. InfoQ reports the migration took about 1.5 years.', src: 9 },
        { when: 'ongoing', who: 'Microsoft Azure', title: 'Multitenant guidance and deployment stamps', text: 'Azure\'s Architecture Center describes <b>deployment stamps</b> (copies of the stack for one tenant or a group) as the main lever between isolation and cost, and warns that shared compute and databases invite noisy neighbours.', src: 11 }
      ],
      lessons: [
        'Pick a tenancy model <b>per layer and per tier</b>. Pure silo and pure pool are both rare at scale; bridge is the norm.',
        'Enforce isolation where a single bug cannot bypass it: <b>database policies and scoped credentials</b>, not just code reviews.',
        'Contain blast radius with <b>cells</b> and <b>shuffle sharding</b>, and stop noisy tenants at the edge with per-tenant limits.',
        'The control plane (tenant catalog, onboarding, metering) is a product of its own. Without it, every tenant becomes a snowflake.'
      ],
      sources: [
        { title: 'Platform Multitenant Architecture', url: 'https://architect.salesforce.com/fundamentals/platform-multitenant-architecture', pub: 'Salesforce Architects' },
        { title: 'The Magic Behind Multi-Tenancy (slides)', url: 'https://qconsf.com/sf2008/dl/qcon-sanfran-2008/slides_/CraigWeissmann_The_Magic_Behind_Multi_Tenancy.pdf', pub: 'Craig Weissman, QCon SF 2008' },
        { title: 'Scaling out relational data models, and SQL, through co-location', url: 'https://www.citusdata.com/blog/2016/12/22/scaling-out-sql-with-colocation/', pub: 'Citus Data, 2016' },
        { title: 'Workload isolation using shuffle-sharding', url: 'https://aws.amazon.com/builders-library/workload-isolation-using-shuffle-sharding', pub: 'AWS Builders\' Library' },
        { title: 'SaaS Tenant Isolation Strategies: the bridge model', url: 'https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/the-bridge-model.html', pub: 'AWS whitepaper' },
        { title: 'Silo, pool, and bridge models (SaaS Lens)', url: 'https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/bridge-model.html', pub: 'AWS Well-Architected SaaS Lens' },
        { title: 'Multi-tenant data isolation with PostgreSQL Row Level Security', url: 'https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security', pub: 'AWS Database Blog' },
        { title: 'Row Security Policies', url: 'https://www.postgresql.org/docs/18/ddl-rowsecurity.html', pub: 'PostgreSQL 18 documentation' },
        { title: 'Scaling a multi-region low-latency service on AWS (Tenant Context Service)', url: 'https://www.atlassian.com/engineering/aws-scaling-multi-region-low-latency-service', pub: 'Atlassian Engineering' },
        { title: 'Slack\'s Migration to a Cellular Architecture', url: 'https://slack.engineering/slacks-migration-to-a-cellular-architecture/', pub: 'Slack Engineering, Aug 2023' },
        { title: 'Slack cell-based architecture', url: 'https://www.infoq.com/news/2024/01/slack-cell-based-architecture', pub: 'InfoQ, Jan 2024' },
        { title: 'Architectural approaches for a multitenant solution', url: 'https://learn.microsoft.com/azure/architecture/guide/multitenant/approaches/overview', pub: 'Microsoft Azure Architecture Center' },
        { title: 'Deployment Stamps pattern', url: 'https://learn.microsoft.com/azure/architecture/patterns/deployment-stamp', pub: 'Microsoft Azure Architecture Center' },
        { title: 'Multi-tenant Applications (Citus docs)', url: 'https://docs.citusdata.com/en/stable/use_cases/multi_tenant.html', pub: 'Citus documentation' }
      ]
    },

    tradeoffs: {
      headers: ['Data model', 'Isolation', 'Cost & ops', 'Limits', 'Pick when…'],
      rows: [
        ['<b>Shared tables + tenant_id + RLS</b> (pool)', 'Logical, enforced by DB policy; performance shared', 'Cheapest; <b>one</b> migration; one backup', 'Per-tenant restore is a filtered export; one big tenant can dominate a table', 'Long tail of small tenants; default for most SaaS'],
        ['<b>Schema per tenant</b> (bridge)', 'Namespace per tenant; same cluster resources', 'Moderate; migrations × N schemas', 'Catalog bloat and slow <code>pg_dump</code> past a few thousand schemas; <code>search_path</code> mistakes', 'Hundreds of mid-size tenants with per-tenant customisation'],
        ['<b>Database per tenant</b> (silo)', 'Strong: own DB, keys, backups, region', 'Highest; connections × tenants; fleet tooling needed', 'Connection explosion without a pooler; N migrations; idle cost per tenant', 'Premium, regulated or very large tenants'],
        ['<b>Full stack per tenant</b> (silo)', 'Strongest: own compute, network, DB', 'Per-tenant infra and deploys; automation mandatory', 'Snowflake drift unless one pipeline deploys all', 'Contract or regulator demands it; few, large tenants'],
        ['<b>Cells</b> (pool per cell)', 'Blast radius = one cell', 'Some duplication per cell; router + catalog needed', 'Cross-cell queries and tenant moves are hard', 'Platform big enough that one shared pool is too much risk']
      ]
    },

    failures: [
      { f: '<b>Cross-tenant data leak</b> from a missing filter or a cached object keyed without tenant id', detect: 'Automated isolation tests that log in as tenant A and probe B\'s ids; audit logs of rows returned vs session tenant; cache keys reviewed', fix: 'RLS with FORCE; tenant id in every cache key and object-storage prefix; scoped credentials (IAM per tenant) for silos' },
      { f: '<b>RLS silently bypassed</b>: app connects as table owner, superuser or BYPASSRLS role', detect: 'CI check: <code>relforcerowsecurity</code> true and app role lacks BYPASSRLS; test that a query without tenant set returns 0 rows', fix: 'Separate migration (owner) and runtime roles; <code>FORCE ROW LEVEL SECURITY</code>; fail closed when <code>app.tenant_id</code> is unset' },
      { f: '<b>Tenant context leaks between requests</b> via pooled connections or thread-locals', detect: 'Requests logged with a tenant different from the token\'s; flaky cross-tenant test failures under load', fix: '<code>SET LOCAL</code> / <code>set_config(..., true)</code> per transaction, never session-level <code>SET</code>; clear thread-locals in <code>finally</code>' },
      { f: '<b>Noisy neighbour</b> saturates a shared DB or queue', detect: 'Per-tenant p99 and resource dashboards; top-N tenants by CPU/IO from <code>pg_stat_statements</code> tagged by tenant', fix: 'Per-tenant rate limits and concurrency caps; shuffle sharding; move heavy tenants to their own tier or cell' },
      { f: '<b>Migration stalls half way</b> across N schemas or databases', detect: 'Per-tenant schema version in the catalog; dashboard of tenants behind', fix: 'Expand/contract migrations that tolerate mixed versions; idempotent, resumable runners; batch by wave' },
      { f: '<b>Unattributed cost</b>: nobody knows which tenants lose money', detect: 'Share of spend without a tenant or tier tag; margin report per plan', fix: 'Meter usage per tenant at the gateway and workers; tag silo resources with tenant id; allocate shared cost by a stated driver' },
      { f: '<b>Offboarding leaves data behind</b> in backups, caches, search indexes or logs', detect: 'Deletion checklist per data store with a verified timestamp', fix: 'Per-tenant encryption keys you can destroy (crypto-shredding); automated deletion workflow with evidence' }
    ],

    interview: [
      { q: 'Define silo, pool and bridge. Who uses these terms?', a: 'They come from AWS SaaS guidance (the SaaS Lens and the Tenant Isolation Strategies whitepaper). <b>Silo</b>: a tenant gets dedicated resources. <b>Pool</b>: tenants share resources and are separated logically. <b>Bridge</b>: a mix, chosen per layer or per service (e.g. pooled compute, siloed database). Common misreading: the choice is not made once for the whole product; it is made <b>per layer and per tier</b>.', lvl: 'core' },
      { q: 'How would you isolate tenant data in a shared Postgres database?', a: 'Put <code>tenant_id</code> on every tenant table, lead every primary key and index with it, and enable <b>row-level security</b> with a policy <code>USING (tenant_id = current_setting(\'app.tenant_id\')::uuid)</code> and the same <code>WITH CHECK</code>. Add <code>FORCE ROW LEVEL SECURITY</code> because table owners bypass policies, and connect as a role without <code>BYPASSRLS</code>. Set the tenant per transaction with <code>SET LOCAL</code>. The application filter is then a second line, not the only one.', fu: 'What happens if app.tenant_id is unset?', lvl: 'core' },
      { q: 'Where does the tenant id come from, and how does it reach the database?', a: 'From a <b>verified token claim</b> issued by the identity provider at login, never from a header, path or body the client controls. The gateway verifies the JWT and strips client tenant headers. A filter puts the tenant in a request-scoped context; the data layer sets it on the DB transaction (<code>SET LOCAL app.tenant_id</code>) and clears it at the end. Async jobs carry the tenant in the message and set it the same way.', lvl: 'core' },
      { q: 'Compare schema-per-tenant with shared tables plus RLS.', a: 'Schema per tenant gives a clear namespace and easy per-tenant export, but every migration runs N times, the catalog grows with every schema (slower planning, <code>pg_dump</code>, backups), and you still share CPU and memory. Shared tables plus RLS have one schema, one migration and the best density, but need RLS discipline and a plan for per-tenant restore. Rule of thumb: schemas work for hundreds of tenants; for thousands, pool with RLS and silo the few who need more.', lvl: 'core' },
      { q: 'What is a noisy neighbour and how do you mitigate it?', a: 'A tenant whose load degrades others on shared resources. Layers: <b>per-tenant rate limits and quotas</b> at the gateway (token bucket keyed by tenant, 429 + Retry-After); <b>per-tenant concurrency</b> on queues and DB pools; <b>shuffle sharding</b> so tenants share few workers; <b>cells</b> to cap blast radius; and tiering so heavy tenants pay for their own capacity. Measure per-tenant p99 to prove it works.', lvl: 'core' },
      { q: 'Explain shuffle sharding with numbers.', a: 'Instead of assigning each tenant to one of k shards, give each tenant a random <b>combination</b> of h workers out of n. With n = 8 and h = 2 there are C(8,2) = 28 combinations, so a bad tenant fully overlaps with roughly 1 in 28 others, while plain sharding into 4 shards puts it with 1 in 4. Clients retry on the other worker of their pair. AWS Route 53 uses 4 of 2,048 virtual name servers per domain, which makes full overlap practically impossible.', fu: 'Why does it need retries to work?', lvl: 'deep' },
      { q: 'You have 20,000 tenants on database-per-tenant. What breaks first?', a: '<b>Connections</b>: every app pod keeps a pool per database, so pods × tenants × pool size explodes past Postgres limits; you need PgBouncer or RDS Proxy and lazy pools. <b>Migrations</b>: 20,000 runs, partial failures, mixed versions. <b>Cost</b>: minimum instance size per idle tenant. <b>Ops</b>: monitoring, backups and upgrades × 20,000. Typical fix: pack small tenants into pooled databases and keep silos for premium.', lvl: 'deep' },
      { q: 'How do you attribute cost per tenant in a pooled system?', a: 'Meter usage per tenant at the gateway and workers (requests, CPU seconds, storage GB, egress), store hourly usage records, and allocate each shared cost pool by its <b>driver</b> (compute by CPU seconds, storage by GB). Silo resources are tagged and charged directly. Leftover platform overhead is spread by a stated rule. Compare cost per tenant with the plan price to find unprofitable tiers.', lvl: 'core' },
      { q: 'How do you restore one tenant\'s data without rolling back everybody?', a: 'Silo: restore that tenant\'s database to a point in time. Pool: restore a snapshot into a <b>side database</b>, extract the tenant\'s rows (<code>WHERE tenant_id = ?</code>), and merge them back with conflict rules, or provide per-tenant logical exports. Design the keys (tenant-scoped UUIDs) so a restore cannot collide with other tenants. Test it; per-tenant restore is a feature customers ask about in security reviews.', lvl: 'deep' },
      { q: 'A large customer demands its data stay in the EU. How do you design for that?', a: 'Make <b>region a tenant attribute</b> in the catalog and deploy cells per region. The router sends the tenant to a cell in its region; data, backups and logs stay there. Global services (login, billing) hold only minimal data or have regional copies. Silo the tenant if they also want their own keys. Document it in the DPA. Moving an existing tenant is a data migration with a cutover, so offer it at onboarding.', lvl: 'deep' },
      { q: 'What are cells, and how do they relate to multi-tenancy?', a: 'A cell is a complete, independent copy of the stack serving a subset of tenants. The router maps tenant → cell from a catalog. Cells cap the blast radius of failures, bad deploys and noisy tenants to one cell, and double as deployment waves. Slack moved to cells per availability zone (2023). Costs: duplication, a routing layer, and hard cross-cell features.', lvl: 'core' },
      { q: 'Behavioural: tell me about a time you changed a tenancy model.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Our B2B product ran schema-per-tenant with 3,500 schemas; a release migration took 4 hours and failed on 60 schemas. <b>T:</b> Make releases safe without a big-bang rewrite. <b>A:</b> I wrote an ADR proposing pooled tables with RLS for basic tenants and silos for the 12 enterprise ones, built isolation tests first, then moved tenants in waves with a per-tenant schema version in the catalog. <b>R:</b> Migrations dropped to one 10-minute run, database cost fell about 40%, and we had zero cross-tenant incidents in the following year.', lvl: 'core' }
    ],

    code: [
      {
        title: 'Postgres 15+: pooled table with forced row-level security', lang: 'sql',
        code: `-- Runtime role: not the owner, no BYPASSRLS, no superuser.
CREATE ROLE app_rt LOGIN PASSWORD :'pw' NOBYPASSRLS;

CREATE TABLE invoice (
  tenant_id  uuid        NOT NULL,
  invoice_id uuid        NOT NULL DEFAULT gen_random_uuid(),
  customer   text        NOT NULL,
  amount     numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, invoice_id)          -- tenant leads every key
);
CREATE INDEX ON invoice (tenant_id, created_at);

ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice FORCE  ROW LEVEL SECURITY;  -- owner is filtered too

-- current_setting(..., true) returns NULL when unset: NULL = x is never true,
-- so a session without a tenant sees no rows (fail closed).
CREATE POLICY tenant_isolation ON invoice
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON invoice TO app_rt;

-- Per transaction, from the app:
BEGIN;
SELECT set_config('app.tenant_id', 'a1b2c3d4-0000-4000-8000-000000000001', true); -- = SET LOCAL
SELECT count(*) FROM invoice;   -- only this tenant's rows
COMMIT;                          -- setting is gone; pooled connection is clean`,
        note: '<code>set_config(name, value, true)</code> is the function form of <code>SET LOCAL</code> and accepts a bind parameter, which <code>SET</code> does not. Superusers and BYPASSRLS roles still skip policies even with FORCE, so never run the app as one.'
      },
      {
        title: 'Java 21 / Spring Boot 3: tenant from JWT, set per transaction', lang: 'java',
        code: `// 1) Request scope: tenant comes from the verified JWT, never from a header.
@Component
class TenantFilter extends OncePerRequestFilter {
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                  FilterChain chain) throws ServletException, IOException {
    var auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth instanceof JwtAuthenticationToken jwt) {
      TenantContext.set(UUID.fromString(jwt.getToken().getClaimAsString("tenant_id")));
    }
    try { chain.doFilter(req, res); } finally { TenantContext.clear(); }
  }
}

final class TenantContext {
  private static final ThreadLocal<UUID> CURRENT = new ThreadLocal<>();
  static void set(UUID t) { CURRENT.set(t); }
  static UUID require() {
    var t = CURRENT.get();
    if (t == null) throw new IllegalStateException("no tenant in context");
    return t;
  }
  static void clear() { CURRENT.remove(); }
}

// 2) Data layer: every unit of work runs in a tx that first sets app.tenant_id.
@Component
class TenantTx {
  private final TransactionTemplate tx; private final JdbcClient jdbc;
  TenantTx(PlatformTransactionManager tm, JdbcClient jdbc) {
    this.tx = new TransactionTemplate(tm); this.jdbc = jdbc;
  }
  <T> T run(Supplier<T> work) {
    return tx.execute(status -> {
      jdbc.sql("SELECT set_config('app.tenant_id', ?, true)")   // SET LOCAL
          .param(TenantContext.require().toString()).query().singleValue();
      return work.get();       // same connection, same transaction
    });
  }
}

// Usage: List<Invoice> l = tenantTx.run(() -> invoiceRepo.findAll());`,
        note: 'Because the setting is transaction-local, a pooled connection never carries one tenant into the next request. Hibernate 6 also offers <code>@TenantId</code> on an entity field, which adds the tenant filter and fills it on insert from a <code>CurrentTenantIdentifierResolver</code>; keep RLS underneath as the safety net for native SQL and other clients.'
      },
      {
        title: 'Python 3.11: allocate shared cost per tenant by driver', lang: 'python',
        code: `from collections import defaultdict
from dataclasses import dataclass

@dataclass(frozen=True)
class Usage:
    tenant: str
    cpu_s: float      # CPU seconds this month
    storage_gb: float # average GB stored
    requests: int

def allocate(shared: dict[str, float], usage: list[Usage],
             direct: dict[str, float]) -> dict[str, float]:
    """shared: cost pool -> $, e.g. {'compute': 42_000, 'storage': 9_000, 'gateway': 3_000}.
    Each pool is split by its driver; silo costs in 'direct' are added as-is."""
    drivers = {'compute': 'cpu_s', 'storage': 'storage_gb', 'gateway': 'requests'}
    cost: dict[str, float] = defaultdict(float)
    for pool, amount in shared.items():
        field = drivers[pool]
        total = sum(getattr(u, field) for u in usage) or 1.0
        for u in usage:
            cost[u.tenant] += amount * getattr(u, field) / total
    for tenant, amount in direct.items():
        cost[tenant] += amount
    return dict(cost)

usage = [Usage('acme', 9e5, 120, 4_000_000), Usage('bigco', 6e6, 900, 30_000_000),
         Usage('tiny', 2e4, 2, 80_000)]
costs = allocate({'compute': 42_000, 'storage': 9_000, 'gateway': 3_000},
                 usage, direct={'bigco': 2_500})          # bigco has a silo DB
plan_price = {'acme': 4_000, 'bigco': 30_000, 'tiny': 49}
for t, c in sorted(costs.items(), key=lambda kv: -kv[1]):
    print(f'{t:6} cost \${c:>10,.0f}  margin {1 - c / plan_price[t]:6.0%}')`,
        note: 'The choice of driver is a policy decision: write it down, because it changes which tenants look unprofitable. Unattributed platform overhead should be a visible line, not hidden in the drivers.'
      }
    ],

    related: ['iam-oauth-oidc', 'reliability-math', 'finops', 'api-design', 'data-privacy', 'sd:rate-limiter', 'sd:api-gateway']
  });
})();
