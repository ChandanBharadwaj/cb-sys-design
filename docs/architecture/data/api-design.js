SD.register({
  slug: 'api-design',
  domain: 5,
  title: 'API Design & Governance',
  examples: 'OpenAPI, Pact, Google AIP',
  tagline: 'Design the contract <b>first</b>, make every change <b>additive</b>, catch breaking changes <b>in CI before consumers do</b>, and retire old versions with <b>dates and headers</b>, not surprise.',
  tldr: {
    problem: 'An API is a promise to teams you do not manage. Every rename, new required field or tightened enum can break a mobile app that will not be updated for months. Without rules, each team invents its own errors, paging and versioning, and the platform becomes impossible to evolve.',
    idea: 'Write the contract first (<b>OpenAPI 3.1</b>, <b>.proto</b>, GraphQL SDL, AsyncAPI), lint it against a <b>style guide</b>, diff it for <b>breaking changes</b> in CI, verify it against real <b>consumer contracts</b> (Pact), and evolve by <b>adding, never changing</b>. When you must break, ship a new version, announce it with <code>Deprecation</code>/<code>Sunset</code> headers and give a dated migration window.',
    insight: 'Interview line: "Compatibility is the product. I make changes additive, enforce that with automated schema diffs and consumer-driven contract tests, use idempotency keys and cursor pagination from day one, and treat a new major version as an expensive last resort, because of Hyrum\'s Law: someone depends on every observable behaviour."',
    numbers: [
      { v: '2011 →', l: 'Stripe has kept every API version backward-compatible since it began (Stripe blog)' },
      { v: '4 levels', l: 'Richardson Maturity Model: 0 swamp of POX, 1 resources, 2 verbs, 3 hypermedia (Fowler, 2010)' },
      { v: '2 + 1', l: 'versions most teams can afford to run at once: current, previous, plus one in sunset (rule of thumb)' }
    ]
  },

  intro: {
    what: 'An <b>API</b> (application programming interface) is the contract one piece of software offers others: which requests it accepts, what it returns, and what errors mean. <b>API design</b> is choosing that shape well; <b>API governance</b> is the set of shared rules and automated checks that keep hundreds of APIs consistent and stop changes from breaking the people who call them.',
    analogy: {
      icon: '🔌',
      title: 'A wall socket standard',
      text: 'A socket standard lets any lamp work in any house, for decades. You can add a USB port next to the socket (an <b>additive change</b>) and old lamps do not care. Change the pin shape (a <b>breaking change</b>) and every lamp stops working, so countries run old and new sockets side by side for years (<b>versioning with overlap</b>). An inspector checks new wiring against the standard before anyone moves in (<b>linting and contract tests</b>). The analogy breaks in one way: software callers also depend on behaviour nobody wrote down, such as ordering or timing.'
    },
    problem: 'The Orders team renames <code>customer_name</code> to <code>customerName</code> because the style guide prefers camelCase. Their tests pass. On Monday the partner integration that files invoices silently writes empty names, and the iOS app, which cannot be hot-fixed, crashes on a missing field. <b>How do you let an API keep improving without breaking consumers you do not control?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Just change the code',
        text: 'The provider changes the response when it suits them and tells consumers on chat. Shared tests are the provider\'s own unit tests. It is fast, and with one consumer in the same team it is fine.',
        scene: {
          nodes: [
            { id: 'prov', label: 'Orders team', sub: 'edits code', kind: 'team', at: [70, 0] },
            { id: 'api', label: 'Orders API', sub: 'shape drifts', kind: 'service', at: [210, 110] },
            { id: 'app', label: 'Mobile app', sub: 'reads JSON', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'prov', to: 'api' }, { from: 'api', to: 'app' }],
          flow: ['prov>api', 'api>app']
        }
      },
      {
        stage: 'breaks',
        title: 'One rename, three outages',
        text: 'A renamed field, a new required input and a removed enum value each break a different consumer. Nobody knew who used what. Old app versions stay in the wild for months, so a rollback is the only fix.',
        scene: {
          nodes: [
            { id: 'prov', label: 'Orders team', sub: 'renamed a field', kind: 'team', at: [70, 0] },
            { id: 'api', label: 'Orders API', sub: 'v1 changed', kind: 'service', at: [210, 110] },
            { id: 'app', label: 'Mobile app', sub: 'crash', kind: 'client', at: [350, 220] },
            { id: 'partner', label: 'Partner', sub: 'empty names', kind: 'external', at: [70, 220] }
          ],
          edges: [{ from: 'prov', to: 'api' }, { from: 'api', to: 'app' }, { from: 'api', to: 'partner' }],
          flow: ['prov>api', ['api>app', 'api>partner']],
          err: ['app', 'partner'],
          badges: { app: ['field missing', 'err'], partner: ['silent data loss', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Contract first, checked in CI',
        text: 'The change starts as a <b>spec diff</b>. CI lints it, flags it as breaking, and replays every <b>consumer\'s contract</b>. The team adds <code>customerName</code> alongside the old field instead, and deprecates the old one with a date.',
        scene: {
          nodes: [
            { id: 'prov', label: 'Orders team', sub: 'edits the spec', kind: 'team', at: [70, 0] },
            { id: 'ci', label: 'CI gate', sub: 'lint + diff + Pact', kind: 'policy', at: [350, 0] },
            { id: 'api', label: 'Orders API', sub: 'additive only', kind: 'service', at: [210, 110] },
            { id: 'app', label: 'Mobile app', sub: 'unchanged', kind: 'client', at: [350, 220] },
            { id: 'partner', label: 'Partner', sub: 'unchanged', kind: 'external', at: [70, 220] }
          ],
          edges: [{ from: 'prov', to: 'ci' }, { from: 'ci', to: 'api' }, { from: 'api', to: 'app' }, { from: 'api', to: 'partner' }],
          flow: ['prov>ci', 'ci>api', ['api>app', 'api>partner']],
          ok: ['ci', 'app', 'partner'],
          badges: { ci: ['breaking → blocked', 'ok'] }
        }
      }
    ],
    usedBy: ['Stripe (date-based API versions)', 'Google Cloud APIs (AIP guidelines)', 'GitHub REST and GraphQL APIs', 'Zalando (public RESTful API guidelines)', 'Kubernetes API (versioned groups, deprecation policy)', 'Netflix (federated GraphQL)'],
    whenToUse: [
      'Other teams, partners or mobile apps you cannot redeploy call your service',
      'Many teams publish APIs and consumers need one consistent look and feel',
      'You run microservices and want to deploy them independently without integration-test environments'
    ],
    whenNot: [
      'A private function call inside one deployable: a module boundary is enough (see <a href="design-principles.html">Design Principles</a>)',
      'A one-off internal script with one owner: a full governance process costs more than it saves',
      'Your real problem is cross-service consistency of a workflow: see <a href="event-driven-sagas.html">Event-Driven Sagas</a>'
    ],
    glossary: [
      { term: 'Breaking change', def: 'A change after which a correctly written existing client stops working or gets a wrong result.' },
      { term: 'Additive change', def: 'Adding an optional field, endpoint or method: old clients keep working and simply ignore it.' },
      { term: 'OpenAPI', def: 'A machine-readable description of an HTTP API (paths, schemas, errors) used for docs, code generation and checks.' },
      { term: 'Idempotency key', def: 'A unique client-chosen value sent with a write so a retried request is executed only once.' },
      { term: 'Cursor pagination', def: 'Paging with an opaque token that marks where the last page ended, instead of a page number.' },
      { term: 'Contract test', def: 'A test that checks a provider still satisfies the exact requests and responses a consumer relies on.' },
      { term: 'Deprecation', def: 'Announcing that something will be removed, with a date, while it still works.' },
      { term: 'Hyrum\'s Law', def: 'With enough users, every observable behaviour of an API is depended on by somebody.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Contract first</b>: the OpenAPI / proto / SDL is reviewed before code, and code is generated or verified from it',
      '<b>Resources, not RPC verbs in URLs</b>: nouns, standard methods, correct HTTP semantics (RFC 9110)',
      '<b>Additive evolution</b>: add optional fields and endpoints; never rename, retype or remove inside a major version',
      '<b>Safe retries</b>: every non-idempotent write accepts an <code>Idempotency-Key</code>',
      '<b>One error format</b> (RFC 9457 problem details) and <b>one paging style</b> (cursor) across all APIs',
      '<b>Explicit lifecycle</b>: stability level, owner, deprecation and sunset dates are part of the contract'
    ],
    nonFunctional: [
      '<b>0</b> unannounced breaking changes reach production (blocked by CI diff and contract tests)',
      'Deprecation-to-sunset window of <b>≥ 6–12 months</b> for external consumers (<em>rule of thumb</em>)',
      'At most <b>2–3</b> major versions live at once (<em>rule of thumb</em>)',
      'Style-guide lint finds issues in <b>seconds</b> in the pull request, not weeks later in a review board',
      'Retry of any write is safe: duplicate side effects <b>= 0</b> for keyed requests within the key TTL (often 24 h)',
      'p99 page fetch stays flat with depth: cursor paging costs <b>O(page)</b>, not O(offset)'
    ],
    outOfScope: [
      '<b>Breaking changes in place</b> ("it is only a rename")',
      '<b>Central API review board</b> as the only gate: weeks of queueing and rubber stamps',
      '<b>Version per endpoint per sprint</b>: v1…v9 live, none deleted',
      '<b>200 OK with an error body</b>, or a different error shape per team',
      '<b>Offset paging on large, changing tables</b>: slow deep pages, skipped and duplicated rows'
    ]
  },

  calculator: {
    inputs: [
      { id: 'cons', label: 'Consumer applications (teams, partners, app builds)', min: 1, max: 2000, value: 120, log: true },
      { id: 'brk', label: 'Breaking changes wanted per year', min: 0, max: 40, value: 6 },
      { id: 'bundle', label: 'Breaking changes bundled per new major version', min: 1, max: 10, value: 3 },
      { id: 'overlap', label: 'Overlap: months an old version stays live', min: 1, max: 36, value: 12, unit: 'mo' },
      { id: 'mig', label: 'Effort per consumer to migrate one version', min: 0.5, max: 20, value: 3, step: 0.5, unit: 'days' },
      { id: 'run', label: 'Provider cost to keep one extra version alive', min: 1, max: 30, value: 6, unit: 'days/mo' }
    ],
    outputs: [
      { label: 'New major versions per year', fmt: 'raw', f: (v) => (v.brk / v.bundle).toFixed(1) },
      { label: 'Versions live at once (Little\'s law: 1 + rate × overlap)', fmt: 'raw', f: (v) => (1 + (v.brk / v.bundle) * v.overlap / 12).toFixed(1) },
      { label: 'Consumer migrations per year', f: (v) => v.cons * v.brk / v.bundle },
      { label: 'Consumer migration effort (engineer-days / year)', f: (v) => v.cons * (v.brk / v.bundle) * v.mig },
      { label: 'Provider support cost (engineer-days / year)', f: (v) => (v.brk / v.bundle) * v.overlap / 12 * v.run * 12 },
      { label: 'Total cost in engineer-years (220 days each, estimate)', fmt: 'raw', f: (v) => ((v.cons * (v.brk / v.bundle) * v.mig + (v.brk / v.bundle) * v.overlap * v.run) / 220).toFixed(1) + ' FTE' }
    ],
    note: 'The model shows <b>who pays</b> for a breaking change. The provider pays for each extra live version (security patches, tests, docs, on-call): versions in flight = arrival rate × time each stays (Little\'s law). <b>Consumers</b> pay the much larger bill: every consumer must migrate every major version, so the cost scales with <b>consumers × majors</b>. That is why mature API teams bundle breaking changes, prefer additive change, or translate old versions at the edge (Stripe-style) so consumers upgrade only when they choose. All effort numbers are <em>estimates</em>; plug in your own.'
  },

  api: [
    { m: 'YAML', p: 'orders.openapi.yaml (OpenAPI 3.1)', d: 'Paths, JSON Schema 2020-12 bodies, <code>application/problem+json</code> errors, security schemes, <code>x-api-lifecycle</code> (owner, stability, sunset). The single source for docs, SDKs, mocks and checks.' },
    { m: 'RFC', p: 'orders/v1/orders.proto', d: 'gRPC service and messages with stable <b>field numbers</b>; removed fields become <code>reserved</code> numbers and names. Checked with <code>buf breaking</code> against the main branch.' },
    { m: 'POLICY', p: '.spectral.yaml (style guide)', d: 'Lint rules derived from the company guide (Zalando, Google AIP, or your own): naming, problem details, cursor paging, required <code>Idempotency-Key</code> on POST, no verbs in paths.' },
    { m: 'HTTP', p: 'Deprecation / Sunset / Link', d: '<code>Deprecation: @1767225600</code> (RFC 9745), <code>Sunset: Wed, 30 Jun 2027 23:59:59 GMT</code> (RFC 8594), <code>Link: &lt;…/migrate-v2&gt;; rel="deprecation"</code>. Returned on every response from the old version.' },
    { m: 'DOC', p: 'pacts/mobile-orders.json', d: 'Consumer-driven contract: the exact requests the mobile app sends and the response fields it reads. Published to a Pact Broker and verified in the provider\'s CI; <code>can-i-deploy</code> gates releases.' },
    { m: 'ADR', p: 'ADR-031: REST + events, gRPC inside', d: 'Records the style choice per boundary, the versioning scheme, compatibility rules and the deprecation policy, so teams do not reargue them per API.' }
  ],
  dataModel: [
    { name: 'idempotency_key', store: 'Postgres (provider)', fields: [['key', 'text (client UUID)', 'pk'], ['client_id', 'text', 'pk'], ['request_hash', 'sha256 of method+path+body'], ['status', 'in_progress | done'], ['response_code', 'int'], ['response_body', 'jsonb'], ['created_at', 'timestamptz', 'idx']], note: 'Insert first with <code>ON CONFLICT DO NOTHING</code>; same key + different hash → 422; expired after 24 h by a sweeper.' },
    { name: 'api_catalog', store: 'Registry / dev portal', fields: [['api_id', 'text', 'pk'], ['owner_team', 'text', 'idx'], ['style', 'rest | grpc | graphql | async'], ['stability', 'alpha | beta | ga'], ['spec_url', 'git ref'], ['lint_score', 'int']], note: 'Backstage-style catalog: who owns what, where the contract is, how healthy it is.' },
    { name: 'api_version', store: 'Registry', fields: [['api_id', 'text', 'pk'], ['version', 'v1 | 2024-06-20', 'pk'], ['status', 'current | deprecated | sunset'], ['deprecated_at', 'date'], ['sunset_at', 'date'], ['calls_last_7d', 'bigint']], note: 'Traffic per version from gateway logs drives who to chase before the sunset date.' },
    { name: 'contract_verification', store: 'Pact Broker', fields: [['consumer', 'text', 'pk'], ['consumer_version', 'git sha', 'pk'], ['provider_version', 'git sha', 'pk'], ['success', 'bool'], ['verified_at', 'timestamptz']], note: 'The matrix behind <code>can-i-deploy</code>: is this provider build compatible with every consumer version in production?' }
  ],

  architecture: {
    title: 'API-first lifecycle: spec → lint → diff → contract tests → gateway → consumers',
    nodes: [
      { id: 'prov', label: 'Provider team', sub: 'owns Orders API', kind: 'team', wide: [90, 0], tall: [70, 0], tip: 'Writes and reviews the contract first, then implements it. Owns compatibility and deprecation.' },
      { id: 'spec', label: 'Contract in Git', sub: 'OpenAPI 3.1 / .proto', kind: 'store', wide: [290, 0], tall: [210, 0], tip: 'The spec is code: versioned, reviewed in pull requests, used to generate docs, SDKs, mocks and server stubs.' },
      { id: 'lint', label: 'Style linter', sub: 'Spectral · AIP rules', kind: 'policy', wide: [490, 0], tall: [350, 0], tip: 'Automates the style guide: naming, errors, paging, security. Runs in seconds in the PR. Governance as code, not a meeting.' },
      { id: 'diff', label: 'Breaking diff', sub: 'oasdiff · buf breaking', kind: 'policy', wide: [690, 0], tall: [350, 105], tip: 'Compares the new spec with the one in main / production and fails the build on removed or retyped fields, new required inputs, removed enum values.' },
      { id: 'broker', label: 'Pact Broker', sub: 'consumer contracts', kind: 'store', wide: [890, 0], tall: [210, 105], tip: 'Stores contracts published by each consumer and the verification matrix. can-i-deploy answers: is this build safe for every consumer version in prod?' },
      { id: 'cons', label: 'Consumer teams', sub: 'publish pacts', kind: 'team', wide: [890, 110], tall: [70, 105], tip: 'Each consumer writes tests against a mock provider; the recorded interactions become the contract the provider must keep.' },
      { id: 'client', label: 'Apps & partners', sub: 'old + new builds', kind: 'client', wide: [90, 220], tall: [70, 210], tip: 'Mobile builds live for months; partner integrations for years. They are why compatibility matters.' },
      { id: 'gw', label: 'API gateway', sub: 'auth · limits · versions', kind: 'edge', wide: [290, 220], tall: [210, 210], tip: 'Routes by version, enforces auth and rate limits, adds Deprecation/Sunset headers, logs traffic per version and client.' },
      { id: 'svc', label: 'Orders API', sub: 'REST + gRPC', kind: 'service', wide: [490, 220], tall: [350, 315], tip: 'Implements the contract. Returns RFC 9457 problem details, cursor pages, honours Idempotency-Key.' },
      { id: 'idem', label: 'Idempotency keys', sub: 'Postgres, 24 h TTL', kind: 'store', wide: [690, 220], tall: [350, 210], tip: 'Stores key, request hash and the first response so a retry replays the stored result instead of charging twice.' },
      { id: 'events', label: 'Webhooks / events', sub: 'AsyncAPI · signed', kind: 'queue', wide: [890, 220], tall: [350, 420], tip: 'Async contract: event schemas in AsyncAPI, deliveries signed with HMAC and a timestamp, retried with backoff.' },
      { id: 'portal', label: 'Developer portal', sub: 'docs · changelog', kind: 'external', wide: [90, 330], tall: [70, 315], tip: 'Generated reference docs, changelog, migration guides and the deprecation calendar.' },
      { id: 'db', label: 'Orders DB', sub: 'keyset index', kind: 'store', wide: [490, 330], tall: [210, 315], tip: 'Index on (created_at, id) makes cursor pages a cheap index range scan at any depth.' }
    ],
    edges: [
      { from: 'prov', to: 'spec', label: 'PR' },
      { from: 'spec', to: 'lint' },
      { from: 'lint', to: 'diff' },
      { from: 'diff', to: 'broker', label: 'verify' },
      { from: 'cons', to: 'broker', bidi: true, label: 'pacts' },
      { from: 'spec', to: 'gw', dashed: true, bend: 0.25 },
      { from: 'client', to: 'gw', bidi: true },
      { from: 'client', to: 'portal', dashed: true },
      { from: 'gw', to: 'svc' },
      { from: 'svc', to: 'idem' },
      { from: 'svc', to: 'db' },
      { from: 'svc', to: 'events', bend: 0.3 },
      { from: 'events', to: 'cons', dashed: true },
      { from: 'broker', to: 'svc', dashed: true, bend: 0.2, label: 'can-i-deploy' }
    ]
  },

  scenarios: [
    {
      id: 'first', title: 'API-first: from spec to release', tone: 'ok',
      steps: [
        { text: 'The team opens a pull request that adds <code>GET /orders?cursor=</code> to <b>orders.openapi.yaml</b> before writing code. Consumers review the shape, not the implementation.', flow: ['prov>spec'], badges: { spec: 'PR #412' } },
        { text: '<b>Spectral</b> lints it against the style guide in seconds: plural nouns, <code>problem+json</code> errors, cursor paging, no verbs in paths. One rule fails: <code>limit</code> has no maximum.', flow: ['spec>lint'], warn: ['lint'], badges: { lint: ['1 error', 'warn'] } },
        { text: 'Fixed. The <b>breaking-change diff</b> against main finds only additions: new path, new optional fields. Classified <b>minor</b>.', flow: ['lint>diff'], ok: ['diff'], badges: { diff: ['additive', 'ok'] } },
        { text: 'The provider build replays every consumer\'s <b>pact</b> from the broker against the real service. All pass, so <code>can-i-deploy</code> says yes.', flow: ['diff>broker', 'broker>svc'], ok: ['broker'], badges: { broker: ['3/3 verified', 'ok'] } },
        { text: 'Docs, changelog and SDKs are regenerated from the same spec, and the gateway route goes live. No meeting was needed.', flow: ['spec>gw', 'gw>svc', 'client>portal'], ok: ['gw', 'svc'], tone: 'ok' }
      ]
    },
    {
      id: 'retry', title: 'Timeout on POST /payments: retry safely', tone: 'info',
      steps: [
        { text: 'The app sends <code>POST /payments</code> with <code>Idempotency-Key: 7c9e…</code>. The service inserts the key with status <b>in_progress</b> and the request hash, then charges.', flow: ['client>gw', 'gw>svc', 'svc>idem'], badges: { idem: 'key reserved' } },
        { text: 'The charge succeeds, the response is stored with the key, but the mobile network drops the reply. The client sees a <b>timeout</b>: did it pay or not?', flow: ['svc>db', 'svc>idem'], warn: ['client'], badges: { client: ['timeout', 'warn'] }, tone: 'warn' },
        { text: 'The client retries with the <b>same key</b> after backoff. The insert conflicts, the hash matches, status is done: the service <b>replays the stored 201</b>. No second charge.', flow: ['client>gw', 'gw>svc', 'svc>idem'], ok: ['idem'], badges: { idem: ['replayed', 'ok'] }, tone: 'ok' },
        { text: 'A buggy client reuses the key with a <b>different amount</b>: the hash differs, so the service returns <b>422</b> as problem details instead of guessing.', nodes: ['svc'], err: ['client'], badges: { svc: ['422 key reuse', 'err'] } },
        { text: 'A retry that arrives while the first is still <b>in_progress</b> gets <b>409 Conflict</b> and retries later, never a parallel second charge.', nodes: ['svc', 'idem'], badges: { svc: '409 in progress' }, tone: 'ok' }
      ]
    },
    {
      id: 'caught', title: 'Breaking change caught in CI', tone: 'warn',
      steps: [
        { text: 'A developer renames <code>customer_name</code> to <code>customerName</code> and makes <code>currency</code> required. Unit tests pass: they were updated too.', flow: ['prov>spec', 'spec>lint'], badges: { spec: 'rename + required' } },
        { text: 'The <b>diff</b> flags two breaking changes: a removed response property and a new required request property.', flow: ['lint>diff'], err: ['diff'], badges: { diff: ['2 breaking', 'err'] }, tone: 'err' },
        { text: 'Provider verification against the broker fails for <b>Partner</b> (reads <code>customer_name</code>) and <b>Mobile 4.2</b> (does not send <code>currency</code>). <code>can-i-deploy</code> says no.', flow: ['diff>broker'], err: ['broker', 'cons'], badges: { broker: ['2/3 failed', 'err'] }, tone: 'err' },
        { text: 'The team makes it additive: return <b>both</b> names, default <code>currency</code> from the account, mark the old field <code>deprecated: true</code>. Verification passes.', flow: ['prov>spec', 'spec>lint', 'lint>diff', 'diff>broker'], ok: ['broker', 'diff'], badges: { broker: ['3/3', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'sunset', title: 'Sunsetting v1 with 300 consumers', tone: 'warn',
      steps: [
        { text: 'v2 is GA. The gateway now adds <code>Deprecation</code>, <code>Sunset</code> (12 months out) and a <code>Link rel="deprecation"</code> to every v1 response.', flow: ['client>gw'], nodes: ['gw'], badges: { gw: 'Deprecation + Sunset' } },
        { text: 'Gateway logs count <b>v1 calls per client id</b>. After 6 months, 40 of 300 consumers still call v1; the team emails and opens tickets with exactly those owners.', nodes: ['gw', 'portal'], warn: ['client'], badges: { client: ['40 on v1', 'warn'] }, tone: 'warn' },
        { text: 'One month before sunset: <b>brownouts</b>. v1 returns 410 for 1 hour, then a day, announced in the changelog, so forgotten integrations surface while there is still time.', flow: ['client>gw'], warn: ['gw'], badges: { gw: ['brownout', 'warn'] } },
        { text: 'On the sunset date v1 answers <b>410 Gone</b> with a problem details body linking the migration guide. The provider deletes the v1 code path and its tests.', nodes: ['gw', 'svc'], ok: ['svc'], badges: { gw: ['410 Gone', 'info'] }, tone: 'ok' }
      ]
    },
    {
      id: 'hyrum', title: 'Failure: Hyrum\'s Law and the "non-breaking" change', tone: 'err',
      steps: [
        { text: 'The team swaps the list query to a faster index. The spec is unchanged, the diff is clean, every pact passes. It ships.', flow: ['spec>lint', 'lint>diff', 'diff>broker'], ok: ['diff', 'broker'] },
        { text: 'Results used to come back sorted by id <b>by accident</b>. A partner relied on that to detect new orders, and now misses some. The contract never promised an order.', flow: ['gw>svc', 'svc>db', 'client>gw'], err: ['client'], badges: { client: ['missed orders', 'err'] }, tone: 'err' },
        { text: 'Webhooks also changed: a new event type is now emitted. One consumer\'s strict enum parser rejects the whole payload and stops processing.', flow: ['svc>events', 'events>cons'], err: ['cons'], badges: { cons: ['unknown enum', 'err'] }, tone: 'err' },
        { text: 'Fixes: make the order <b>explicit</b> in the contract (<code>order_by</code>, documented default), state that enums and event types are <b>open</b> sets, and add those cases to consumer contract tests.', nodes: ['spec', 'broker'], ok: ['spec'], tone: 'ok' },
        { text: 'Lesson: tests check what was written down; <b>Hyrum\'s Law</b> says users depend on what they can observe. Shrink the observable surface and document defaults.', nodes: ['prov'], badges: { prov: 'document defaults' }, tone: 'warn' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick the API style, the versioning strategy, how contracts are tested and how lists are paged. Scores are illustrative judgements from the sources on this page, not measurements.',
    diagram: null,
    controls: [
      { id: 'style', label: 'API style', type: 'seg', value: 'rest', options: [
        { v: 'rest', l: 'REST + OpenAPI' }, { v: 'grpc', l: 'gRPC + Protobuf' }, { v: 'graphql', l: 'GraphQL' }, { v: 'async', l: 'Async events' }] },
      { id: 'ver', label: 'Versioning strategy', type: 'seg', value: 'uri', options: [
        { v: 'uri', l: 'URI /v1/' }, { v: 'header', l: 'Header / media type' }, { v: 'date', l: 'Date-pinned (Stripe)' }, { v: 'none', l: 'No versions, evolve' }] },
      { id: 'ct', label: 'Contract testing', type: 'seg', value: 'diff', options: [
        { v: 'none', l: 'None' }, { v: 'diff', l: 'Schema diff in CI' }, { v: 'cdc', l: 'Consumer-driven (Pact)' }] },
      { id: 'page', label: 'Pagination', type: 'seg', value: 'cursor', options: [
        { v: 'offset', l: 'Offset / page number' }, { v: 'cursor', l: 'Cursor (keyset)' }] }
    ],
    evaluate(s) {
      const c01 = (x) => Math.max(0, Math.min(1, x));
      let dx = { rest: 0.8, grpc: 0.55, graphql: 0.8, async: 0.5 }[s.style];
      let evo = { rest: 0.6, grpc: 0.8, graphql: 0.75, async: 0.55 }[s.style];
      let risk = { none: 0.15, diff: 0.6, cdc: 0.85 }[s.ct];
      let perf = { rest: 0.65, grpc: 0.9, graphql: 0.55, async: 0.8 }[s.style];
      let gov = { none: 0.85, diff: 0.7, cdc: 0.45 }[s.ct];
      if (s.ver === 'uri') { dx += 0.05; evo -= 0.05; }
      if (s.ver === 'header') { dx -= 0.1; evo += 0.05; }
      if (s.ver === 'date') { dx += 0.1; evo += 0.15; gov -= 0.2; }
      if (s.ver === 'none') { evo += s.ct === 'none' ? -0.25 : 0.1; risk -= s.ct === 'none' ? 0.1 : 0; gov += 0.05; }
      if (s.page === 'offset') { perf -= 0.2; dx += 0.05; risk -= 0.05; } else { dx -= 0.03; }
      if (s.style === 'graphql') { gov -= 0.1; }
      if (s.style === 'async' && s.ct === 'cdc') { gov -= 0.05; }
      const verTxt = { uri: '/v1 → /v2', header: 'Accept: …;v=2', date: 'Stripe-Version: 2024-06-20', none: 'one evolving version' }[s.ver];
      const metrics = [
        { k: 'Client DX', v: { rest: 'curl-able, cacheable', grpc: 'codegen, needs tooling', graphql: 'ask for exactly what you need', async: 'decoupled, harder to debug' }[s.style], s: c01(dx) },
        { k: 'Evolvability', v: s.ver === 'date' ? 'upgrade per account, per change' : s.ver === 'none' ? (s.ct === 'none' ? 'evolves blind' : 'additive only, enforced') : 'new major = migration', s: c01(evo), hint: verTxt },
        { k: 'Breakage safety', v: { none: 'found by consumers in prod', diff: 'schema breaks caught in CI', cdc: 'real usage verified per consumer' }[s.ct], s: c01(risk) },
        { k: 'Performance', v: { rest: 'JSON, HTTP caching', grpc: 'binary, HTTP/2 streams', graphql: 'fewer round trips, costly resolvers', async: 'high throughput, eventual' }[s.style] + (s.page === 'offset' ? '; deep pages slow' : ''), s: c01(perf) },
        { k: 'Governance effort', v: gov > 0.7 ? 'low' : gov > 0.5 ? 'moderate' : 'high (worth it at scale)', s: c01(gov), hint: s.ct === 'cdc' ? 'broker + consumer buy-in' : s.ver === 'date' ? 'version transforms to maintain' : '' }
      ];
      const notes = [];
      if (s.style === 'grpc') notes.push('Protobuf compatibility is by <b>field number</b>: renames are wire-safe, but never reuse or retype a number; mark removed ones <code>reserved</code>. Run <code>buf breaking</code> in CI.');
      if (s.style === 'graphql') notes.push('GraphQL avoids versions by <b>adding fields and @deprecated</b>. Budget for <b>DataLoader</b> batching (N+1), query depth/cost limits and persisted queries for public clients.');
      if (s.style === 'async') notes.push('Events are an API too: describe them in <b>AsyncAPI</b>, register schemas with compatibility rules, sign webhooks (HMAC + timestamp) and expect at-least-once delivery.');
      if (s.style === 'rest') notes.push('REST at Richardson level 2 (resources + verbs + status codes) is what most good public APIs ship; hypermedia (level 3) is optional.');
      if (s.ver === 'date') notes.push('Date versions (Stripe) pin each account to the version of its first call; old shapes are produced by <b>transformation modules</b> at the edge, so the core code has one model.');
      if (s.ver === 'none' && s.ct === 'none') notes.push('"No versioning" only works when additive change is <b>enforced</b>. Without diff or contract tests it is just breaking in place.');
      if (s.ver === 'header') notes.push('Header or media-type versions keep URLs stable but hide the version from logs, caches and curl users; add <code>Vary</code> and log it explicitly.');
      if (s.page === 'offset') notes.push('<code>OFFSET 100000</code> makes the database read and discard 100 000 rows, and inserts shift pages (duplicates, skips). Use a cursor for feeds and exports.');
      if (s.ct === 'cdc') notes.push('Consumer-driven contracts only test <b>what consumers declared</b>; Hyrum\'s Law means undeclared behaviour can still break someone.');
      let verdict;
      if (s.ct === 'none' && s.ver === 'none') verdict = '❌ <b>No versions and no checks</b>: every change is a gamble on consumers you cannot see.';
      else if (s.ct === 'none') verdict = '⚠ <b>Versioning without checks</b>: you will find accidental breaks when consumers page you. Add a schema diff in CI at least.';
      else if (s.style === 'graphql' && s.page === 'offset') verdict = '⚠ <b>Use Relay-style cursor connections</b> in GraphQL; offset arguments make deep pages slow and unstable.';
      else if (s.ct === 'cdc' && (s.ver === 'none' || s.ver === 'date')) verdict = '✅ <b>Evolve without breaking</b>: additive change enforced by diff and consumer contracts, versions only when truly needed.';
      else if (s.page === 'offset') verdict = '👍 <b>Sound governance</b>, but switch large or changing lists to cursor pagination.';
      else verdict = '👍 <b>Solid default.</b> Keep majors rare and bundle breaking changes.';
      const labels = {
        svc: { label: 'Orders API', sub: { rest: 'REST · OpenAPI 3.1', grpc: 'gRPC · proto3', graphql: 'GraphQL subgraph', async: 'publishes events' }[s.style] },
        spec: { label: 'Contract in Git', sub: { rest: 'openapi.yaml', grpc: 'orders.proto', graphql: 'schema.graphql', async: 'asyncapi.yaml' }[s.style] },
        diff: { label: 'Breaking diff', sub: { rest: 'oasdiff', grpc: 'buf breaking', graphql: 'schema check', async: 'registry compat' }[s.style] },
        gw: { label: 'API gateway', sub: verTxt },
        db: { label: 'Orders DB', sub: s.page === 'cursor' ? 'keyset index scan' : 'OFFSET scan + discard' }
      };
      const hide = s.ct === 'cdc' ? [] : ['broker'];
      if (s.ct === 'none') hide.push('diff');
      const flow = s.ct === 'none' ? ['prov>spec', 'spec>lint', 'spec>gw', 'gw>svc', 'svc>db'] : s.ct === 'diff' ? ['prov>spec', 'spec>lint', 'lint>diff', 'spec>gw', 'gw>svc', 'svc>db'] : ['prov>spec', 'spec>lint', 'lint>diff', 'diff>broker', 'broker>svc', 'gw>svc', 'svc>db'];
      if (s.style === 'async') flow.push('svc>events', 'events>cons');
      return {
        metrics, verdict, notes: notes.slice(0, 4), labels, hide, flow,
        err: s.ct === 'none' ? ['client'] : [], warn: s.page === 'offset' ? ['db'] : [], ok: s.ct === 'cdc' ? ['broker'] : [],
        hot: ['spec'],
        badges: { gw: [s.ver === 'none' ? 'no version' : 'versioned', 'info'], client: s.ct === 'none' ? ['finds breaks', 'err'] : ['safe', 'ok'] }
      };
    }
  },

  widget: {
    title: 'Schema-change checker',
    caption: 'Start from a real <b>Order</b> schema shown as OpenAPI or Protobuf. Apply changes one by one. The checker diffs the new schema against the original using the standard compatibility rules, then runs each consumer\'s <b>contract</b> (the fields it reads, the fields it sends, the enum values it uses) and shows exactly whose tests fail.'
  },

  realWorld: {
    intro: 'The ideas are old and stable; what changed is how they are enforced. From a dissertation to RFCs, public style guides and contract-test pipelines.',
    timeline: [
      { when: '2000', who: 'Roy Fielding, UC Irvine', title: 'REST defined (dissertation, chapter 5)', text: 'REST is derived by adding constraints: client-server, stateless, cache, uniform interface, layered system, optional code on demand. The uniform interface has four constraints, ending with <b>hypermedia as the engine of application state</b>. REST is an architectural style, not "JSON over HTTP".', src: 0 },
      { when: '2008 / 2010', who: 'Leonard Richardson, Martin Fowler', title: 'Richardson Maturity Model', text: 'Richardson\'s QCon talk graded web APIs by use of resources, HTTP verbs and hypermedia; Fowler\'s article "steps toward the glory of REST" popularised it. Most real APIs stop at level 2.', src: 1 },
      { when: 'Living doc', who: 'Zalando', title: 'Public RESTful API and Event Guidelines', text: 'Zalando published the guidelines owned by its internal API Guild under CC BY 4.0, covering REST and event schemas. Its <b>Zally</b> linter checks APIs against them, an early example of governance as code.', src: 2 },
      { when: '2017', who: 'Stripe', title: 'Idempotency keys and versioning, explained', text: 'Stripe described <code>Idempotency-Key</code> on mutating requests with client retries using backoff and jitter, and separately how it has kept <b>every API version backward-compatible since 2011</b> by pinning accounts to versions and transforming responses for older ones (versioning post).', src: 4 },
      { when: 'Feb 2021', who: 'OpenAPI Initiative', title: 'OpenAPI 3.1.0', text: 'Full alignment with <b>JSON Schema 2020-12</b>, top-level <code>webhooks</code>, and removal of <code>nullable</code> in favour of type arrays. Released as 3.1 rather than 4.0 although strictly a small schema-level break.', src: 5 },
      { when: 'Jun 2022', who: 'IETF', title: 'RFC 9110 HTTP Semantics', text: 'Consolidates HTTP method properties: <b>safe</b> (GET, HEAD, OPTIONS, TRACE) and <b>idempotent</b> (safe methods plus PUT and DELETE). POST and PATCH are neither by default, which is why idempotency keys exist.', src: 6 },
      { when: 'Jul 2023', who: 'IETF', title: 'RFC 9457 Problem Details', text: 'Obsoletes RFC 7807: a standard <code>application/problem+json</code> body with <code>type</code>, <code>title</code>, <code>status</code>, <code>detail</code>, <code>instance</code> and extensions. Spring Framework 6 ships <code>ProblemDetail</code> for it.', src: 7 },
      { when: '2023–25', who: 'Google', title: 'AIP-180: backwards compatibility', text: 'Google\'s API Improvement Proposals separate <b>wire</b>, <b>source</b> and <b>semantic</b> compatibility, and forbid removing fields, enum values or methods within a major version, or moving fields into a oneof.', src: 8 },
      { when: 'Mar 2025', who: 'IETF', title: 'RFC 9745 Deprecation header', text: 'Standardises <code>Deprecation</code> (a date) and the <code>deprecation</code> link relation; the RFC 8594 <code>Sunset</code> date must not be earlier than the deprecation date.', src: 9 },
      { when: 'Oct 2025', who: 'IETF HTTPAPI WG', title: 'Idempotency-Key header (draft-07)', text: 'Standardising what Stripe and others do: a string key per request, a server-side fingerprint, 400 when a required key is missing. Still an Internet-Draft, not an RFC.', src: 10 },
      { when: 'Case study', who: 'eBay', title: 'Contract testing for API evolution', text: 'eBay described adopting consumer-driven contracts with a <b>Pact Broker</b> that replays stored contracts against the provider, as a way to evolve services while keeping backward compatibility.', src: 11 }
    ],
    lessons: [
      'The cheapest breaking change is the one you never make: <b>add, deprecate, then remove</b> on a dated schedule.',
      'Enforce rules with <b>tools in the pull request</b> (lint, diff, contract tests), not with a review board that becomes a queue.',
      'Standards beat inventions: RFC 9110 semantics, RFC 9457 errors, <code>Deprecation</code>/<code>Sunset</code>, idempotency keys.',
      'Hyrum\'s Law: document defaults (ordering, enums are open, nulls) or someone will depend on the accident.'
    ],
    sources: [
      { title: 'Fielding, Architectural Styles and the Design of Network-based Software Architectures, Ch. 5: REST', url: 'https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm', pub: 'UC Irvine, 2000' },
      { title: 'Richardson Maturity Model: steps toward the glory of REST', url: 'https://www.martinfowler.com/articles/richardsonMaturityModel.html', pub: 'Martin Fowler, 2010' },
      { title: 'Zalando RESTful API and Event Guidelines', url: 'https://opensource.zalando.com/restful-api-guidelines/', pub: 'Zalando' },
      { title: 'Designing robust and predictable APIs with idempotency', url: 'https://stripe.com/blog/idempotency', pub: 'Stripe blog, 2017' },
      { title: 'APIs as infrastructure: future-proofing Stripe with versioning', url: 'https://stripe.com/blog/api-versioning', pub: 'Stripe blog, 2017' },
      { title: 'OpenAPI 3.1.0 announcement', url: 'https://www.openapis.org/2021/02', pub: 'OpenAPI Initiative, Feb 2021' },
      { title: 'RFC 9110: HTTP Semantics', url: 'https://www.rfc-editor.org/rfc/rfc9110.html', pub: 'IETF, Jun 2022' },
      { title: 'RFC 9457: Problem Details for HTTP APIs', url: 'https://www.rfc-editor.org/rfc/rfc9457.html', pub: 'IETF, Jul 2023' },
      { title: 'AIP-180: Backwards compatibility', url: 'https://google.aip.dev/180', pub: 'Google API Improvement Proposals' },
      { title: 'RFC 9745: The Deprecation HTTP Response Header Field', url: 'https://www.rfc-editor.org/rfc/rfc9745.html', pub: 'IETF, Mar 2025' },
      { title: 'The Idempotency-Key HTTP Header Field (draft-07)', url: 'https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.html', pub: 'IETF Internet-Draft, Oct 2025' },
      { title: 'API Evolution with Confidence: contract testing adoption at eBay', url: 'https://innovation.ebayinc.com/tech/engineering/api-evolution-with-confidence-a-case-study-of-contract-testing-adoption-at-ebay/', pub: 'eBay Tech Blog' },
      { title: 'Hyrum\'s Law (mirror of hyrumslaw.com)', url: 'https://www.gwern.net/docs/www/www.hyrumslaw.com/80a99df5dd87f0da9cb8ceb14399cc94504468b5.html', pub: 'Hyrum Wright' }
    ]
  },

  tradeoffs: {
    headers: ['Style', 'Strengths', 'Costs', 'Pick when…'],
    rows: [
      ['<b>REST + OpenAPI</b>', 'Universal tooling, HTTP caching, readable with curl, natural for public and partner APIs', 'Over/under-fetching, chatty for complex screens, no built-in streaming', 'Public, partner and most service APIs; the default unless a reason below applies'],
      ['<b>gRPC + Protobuf</b>', 'Binary and compact, HTTP/2 streaming, generated clients, field-number compatibility is easy to check', 'Browsers need gRPC-Web or a proxy, less human-readable, L7 tooling needed', 'Internal service-to-service calls, high volume, polyglot backends, streaming'],
      ['<b>GraphQL</b>', 'Client picks fields, one round trip per screen, schema evolves with @deprecated, federation unifies many teams', 'N+1 resolvers, caching is harder (POST), query cost and abuse limits, resolver ownership', 'Many client screens over many backends (BFF layer), product teams iterating fast'],
      ['<b>Async events / webhooks</b>', 'Decouples time and availability, fan-out, natural for "something happened"', 'Eventual consistency, ordering and duplicates, harder debugging, schemas still need governance', 'Notifications, integration between domains, partners reacting to state changes'],
      ['<b>URI vs header vs date versions</b>', 'URI: visible, simple routing. Header: clean URLs. Date (Stripe): per-account, fine-grained', 'URI: whole-API bumps. Header: hidden from caches/logs. Date: transform layer to maintain', 'URI for most teams; date-pinning when you have many external consumers and a platform team to own it'],
      ['<b>Offset vs cursor paging</b>', 'Offset: jump to page N, simple. Cursor: O(page) at any depth, stable under inserts', 'Offset: deep pages slow, rows skipped/duplicated. Cursor: no random access, opaque', 'Offset for small admin tables; cursor for feeds, exports, sync and anything large']
    ]
  },
  failures: [
    { f: '<b>Breaking change in place</b> (rename, retype, new required field)', detect: 'Consumer errors after deploy; oasdiff / buf breaking in CI would have said so', fix: 'Diff gate in CI, add-then-deprecate, consumer contract verification with can-i-deploy.' },
    { f: '<b>Version sprawl</b>: v1–v6 all live, none removed', detect: 'Per-version traffic dashboards show long tails; security patches applied six times', fix: 'Bundle breaking changes, publish sunset dates, brownouts, chase owners from gateway logs.' },
    { f: '<b>Duplicate side effects on retry</b> (double charge, two orders)', detect: 'Reconciliation finds duplicates clustered around timeouts', fix: 'Idempotency-Key with a stored response and request hash; idempotent consumers for events.' },
    { f: '<b>GraphQL N+1 and abusive queries</b>', detect: 'Database calls per request grow with list size; deep nested queries in logs', fix: 'Per-request DataLoader batching, depth and cost limits, persisted queries for public clients.' },
    { f: '<b>Governance bottleneck</b>: central board reviews every API', detect: 'Weeks of lead time to ship a field; teams bypass the gateway', fix: 'Automate the guide (Spectral), self-service templates, guild owns the rules, humans review only exceptions.' },
    { f: '<b>Hyrum\'s Law surprise</b>: undocumented ordering, timing or enum set changes', detect: 'Consumers break with no schema change', fix: 'Document defaults, treat enums as open, randomise what must not be relied on, add contract cases.' },
    { f: '<b>Unsigned or replayable webhooks</b>', detect: 'Events accepted from unknown senders; old payloads replayed', fix: 'HMAC over id.timestamp.body, reject timestamps older than ~5 min, dedupe on event id.' }
  ],

  interview: [
    { q: 'What is REST really, and where does a typical JSON API sit on the Richardson Maturity Model?', a: '<p>REST is the <b>architectural style</b> Roy Fielding defined in his 2000 dissertation: client-server, stateless, cacheable, layered, a <b>uniform interface</b> (resource identification, manipulation through representations, self-descriptive messages, hypermedia as the engine of application state), optional code on demand.</p><p>The Richardson model grades APIs: <b>0</b> one endpoint, everything POST (RPC tunnelling); <b>1</b> resources; <b>2</b> HTTP verbs and status codes used correctly; <b>3</b> hypermedia links drive the client. Most good public APIs are level 2. Common misreading: "REST = JSON over HTTP". JSON is not required and hypermedia is the part most "REST" APIs skip.</p>', fu: 'Is level 3 worth it? (Rarely for internal APIs; it helps when servers must change URLs without breaking long-lived clients.)', lvl: 'core' },
    { q: 'Which changes are safe for existing clients, and which are breaking?', a: '<ul><li><b>Safe (additive)</b>: new optional request field, new response field, new endpoint or method, new optional query parameter, relaxing a validation.</li><li><b>Breaking</b>: removing or renaming a field, changing its type or format, making an optional input required, removing an enum value, tightening validation, changing defaults or error codes, changing URL or auth.</li><li><b>Grey zone</b>: adding an enum value or event type breaks clients that parse enums strictly; that is why guides say "treat enums as open" and clients should be tolerant readers.</li></ul><p>Google AIP-180 adds the useful split: <b>wire</b>, <b>source</b> and <b>semantic</b> compatibility. A change can keep the wire format and still break meaning.</p>', lvl: 'core' },
    { q: 'How do you version an API? Compare URI, header and Stripe\'s date-based versions.', a: '<p><b>URI</b> (<code>/v1/</code>): visible, easy routing and logs, but every bump moves the whole API. <b>Header / media type</b>: stable URLs, but invisible to caches and curl users unless you add <code>Vary</code>. <b>Date-pinned</b> (Stripe): an account is pinned to the version of its first call; each breaking change is a small, dated <b>transformation</b> that the edge applies backwards for older versions, so the core has one model and consumers upgrade when they choose.</p><p>Best of all is <b>not needing a new version</b>: additive changes only, enforced by CI. My default: URI major version, rarely bumped, plus additive evolution; date-pinning when there are thousands of external integrators and a platform team to own the transforms.</p>', fu: 'What does a version transform cost over time? (Each one runs on every old-version response, and they pile up; you still need to retire very old dates.)', lvl: 'core' },
    { q: 'How would you make POST /payments safe to retry?', a: '<p>POST is neither safe nor idempotent under RFC 9110, so add an <b>Idempotency-Key</b> header (Stripe practice, IETF draft). Server side:</p><ul><li>In one transaction, <code>INSERT</code> the key with client id, request hash and <code>in_progress</code>, <code>ON CONFLICT DO NOTHING</code>.</li><li>If it existed: same hash and done → replay the stored status and body; still in progress → <b>409</b>; different hash → <b>422</b>.</li><li>Do the work, store the response with the key, commit. Expire keys after ~24 h.</li></ul><p>Clients retry with exponential backoff and jitter and the <b>same key</b>. Downstream calls also need keys, or the side effect must be in the same transaction.</p>', fu: 'What if the service crashes after charging but before saving the response? (Make the charge call itself idempotent with a derived key, or recover by checking the downstream state for in-progress keys.)', lvl: 'core' },
    { q: 'Offset or cursor pagination? Show how a cursor works.', a: '<p><code>LIMIT 50 OFFSET 100000</code> makes the database walk and discard 100 000 rows, so deep pages get slower, and inserts between calls shift rows so clients <b>skip or duplicate</b> items. A <b>cursor</b> (keyset) encodes the last row\'s sort key, e.g. <code>(created_at, id)</code>, as an opaque base64 token; the next page is <code>WHERE (created_at, id) &lt; (:ts, :id) ORDER BY created_at DESC, id DESC LIMIT 51</code>, an index range scan at any depth. Fetch one extra row to know if there is a next page. Keep the cursor opaque so you can change it later; include filters in it or reject a cursor used with different filters.</p>', lvl: 'core' },
    { q: 'What are the backward-compatibility rules for Protobuf and gRPC?', a: '<ul><li>Fields are identified on the wire by <b>number</b>, not name: renaming is wire-safe (but breaks JSON mapping and generated code).</li><li><b>Never reuse or renumber</b> a field. When you delete one, add <code>reserved 4; reserved "old_name";</code> so nobody reuses it.</li><li>Do not change a field\'s type except between documented wire-compatible types; changing <code>int64</code> to <code>string</code> corrupts old readers.</li><li>Unknown fields are kept and ignored, so adding fields is safe. Do not move fields into or out of a <code>oneof</code>.</li><li>Enums: first value <code>*_UNSPECIFIED = 0</code>; old clients see unknown values as their number.</li></ul><p>Enforce with <code>buf breaking --against main</code> in CI.</p>', lvl: 'deep' },
    { q: 'What problems does GraphQL bring, and how do you govern it across many teams?', a: '<p><b>N+1</b>: a list of 50 orders, each resolving <code>customer</code>, makes 51 calls. Fix with a <b>per-request DataLoader</b> that batches keys collected in one tick into one call and caches within the request. <b>Abuse</b>: deep or wide queries; set depth and <b>cost limits</b>, timeouts, and use <b>persisted queries</b> (allow-listed operations) for public clients. <b>Caching</b>: queries are usually POST, so lean on client and entity caches.</p><p>For many teams, <b>federation</b>: each team owns a subgraph and a router composes the supergraph; schema checks against real client operations in CI replace versioning, with <code>@deprecated</code> and usage metrics before removal.</p>', lvl: 'deep' },
    { q: 'How do consumer-driven contract tests differ from a schema diff and from end-to-end tests?', a: '<p>A <b>schema diff</b> (oasdiff, buf) compares two specs: fast, no consumer input, but it flags changes nobody uses and misses behaviour. <b>Consumer-driven contracts</b> (Pact, Spring Cloud Contract): each consumer\'s tests record the requests it sends and the fields it reads; the provider replays them in its own CI, and a broker\'s <code>can-i-deploy</code> checks compatibility with the versions actually in production. It tells you <b>who</b> breaks. <b>End-to-end tests</b> need every service deployed together, are slow and flaky, and couple release trains. Use diff for every API, CDC where you know your consumers, a few E2E smoke tests for critical journeys.</p>', fu: 'When is Pact a poor fit? (Public APIs with unknown consumers, or consumers who will not maintain pacts.)', lvl: 'core' },
    { q: 'Design error handling for a public API.', a: '<ul><li>Correct status codes: 400 validation, 401 unauthenticated, 403 forbidden, 404, 409 conflict, 422 semantic, 429 with <code>Retry-After</code>, 5xx only for server faults.</li><li>One body format: <b>RFC 9457</b> <code>application/problem+json</code> with <code>type</code> (a stable URI clients can switch on), <code>title</code>, <code>status</code>, <code>detail</code>, <code>instance</code>, plus extensions such as <code>errors[]</code> per field and a trace id.</li><li>Never 200 with an error body; never leak stack traces.</li><li>Error <code>type</code> values are part of the contract: adding is fine, changing which one you return is a breaking change.</li></ul>', lvl: 'core' },
    { q: 'How do you run API governance across 80 teams without becoming a bottleneck?', a: '<p>Make the paved road the easy road. A small <b>API guild</b> owns a written style guide (start from Zalando or Google AIP), encoded as a <b>Spectral ruleset</b> that runs in every PR and in the IDE. Templates and generators produce compliant APIs by default. CI runs <b>breaking-change diff</b> and contract verification. A <b>catalog</b> shows owner, lifecycle and lint score. Humans review only <b>exceptions</b> and new public APIs, with a time-boxed SLA. The gateway enforces cross-cutting rules (auth, limits, deprecation headers) centrally. Measure: lead time for an API change, number of breaking incidents, lint debt.</p>', lvl: 'deep' },
    { q: 'Tell me about a time you had to retire an API version that many teams depended on.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S</b>: Our orders v1 API had 140 consumers, 30 external, two years after v2 shipped; v1 needed a separate code path and blocked a database migration. <b>T</b>: Sunset v1 within 9 months without a partner outage. <b>A</b>: I used gateway logs to list every client id still on v1 and its owner, added <code>Deprecation</code> and <code>Sunset</code> headers, wrote a migration guide with a diff of each payload, and ran fortnightly office hours. For the three hardest partners we built an adapter. One month before the date we ran two announced <b>brownouts</b>, which found four forgotten cron jobs. <b>R</b>: v1 traffic fell from 31% to 0 by the date, no P1 incidents, and deleting v1 removed about 9 000 lines and unblocked the migration. Since then we bundle breaking changes yearly.', lvl: 'deep' },
    { q: 'What is Hyrum\'s Law and how does it change the way you design APIs?', a: '<p>Hyrum Wright (Google) observed: "With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody." Titus Winters named it. Misreading: it is not "never change anything". It means <b>contracts are what users observe</b>, not what you documented.</p><p>So: keep the observable surface small (return only needed fields), document defaults like sort order, say enums and event types are open sets, add random jitter or shuffle where order must not be relied on, avoid leaking internal ids and timing, and expect "safe" refactors to need a canary and consumer communication.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Spring Boot 3: ProblemDetail, cursor paging and Idempotency-Key (Postgres)', lang: 'java',
      code: `@RestController
@RequestMapping("/v1/orders")
class OrderController {
  private final JdbcClient db; private final OrderService orders; private final ObjectMapper json;
  OrderController(JdbcClient db, OrderService orders, ObjectMapper json) { this.db = db; this.orders = orders; this.json = json; }

  record Page(List<Order> data, String nextCursor) {}

  @GetMapping   // keyset pagination: cursor = base64("createdAt|id")
  Page list(@RequestParam(required = false) String cursor, @RequestParam(defaultValue = "50") @Max(200) int limit) {
    var c = cursor == null ? new String[]{"9999-12-31T00:00:00Z", "~"}
        : new String(Base64.getUrlDecoder().decode(cursor)).split("\\\\|", 2);
    var rows = db.sql("""
        SELECT * FROM orders WHERE (created_at, id) < (?::timestamptz, ?)
        ORDER BY created_at DESC, id DESC LIMIT ?""")
        .params(c[0], c[1], limit + 1).query(Order.class).list();
    String next = null;
    if (rows.size() > limit) {
      var last = rows.get(limit - 1); rows = rows.subList(0, limit);
      next = Base64.getUrlEncoder().withoutPadding().encodeToString((last.createdAt() + "|" + last.id()).getBytes());
    }
    return new Page(rows, next);
  }

  @PostMapping @Transactional
  ResponseEntity<String> create(@RequestHeader("Idempotency-Key") @NotBlank String key,
                                @RequestBody @Valid CreateOrder body, Principal who) throws Exception {
    String hash = DigestUtils.md5DigestAsHex(json.writeValueAsBytes(body));
    int inserted = db.sql("""
        INSERT INTO idempotency_key(key, client_id, request_hash, status) VALUES (?, ?, ?, 'in_progress')
        ON CONFLICT DO NOTHING""").params(key, who.getName(), hash).update();
    if (inserted == 0) {
      var prev = db.sql("SELECT request_hash, status, response_code, response_body FROM idempotency_key WHERE key=? AND client_id=? FOR UPDATE")
          .params(key, who.getName()).query().singleRow();
      if (!hash.equals(prev.get("request_hash"))) throw new ErrorResponseException(HttpStatus.UNPROCESSABLE_ENTITY,
          ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, "Idempotency-Key reused with a different body"), null);
      if (!"done".equals(prev.get("status"))) throw new ErrorResponseException(HttpStatus.CONFLICT);
      return ResponseEntity.status((Integer) prev.get("response_code")).body(prev.get("response_body").toString()); // replay
    }
    String created = json.writeValueAsString(orders.create(body, who.getName()));
    db.sql("UPDATE idempotency_key SET status='done', response_code=201, response_body=?::jsonb WHERE key=? AND client_id=?")
        .params(created, key, who.getName()).update();
    return ResponseEntity.status(201).body(created);
  }
}`,
      note: 'Set <code>spring.mvc.problemdetails.enabled=true</code> so validation and <code>ErrorResponseException</code> render as <code>application/problem+json</code> (RFC 9457). Because insert and business write share one transaction, a concurrent retry blocks on the row lock and then sees <code>done</code> or nothing. If <code>orders.create</code> calls another service, pass a derived idempotency key downstream. Use SHA-256 instead of MD5 if keys are security-relevant. Assumes a <code>Order(id, createdAt, …)</code> record and an index on <code>(created_at, id)</code>.'
    },
    {
      title: 'Protobuf: evolving a message without breaking clients', lang: 'go',
      code: `syntax = "proto3";
package shop.orders.v1;             // major version in the package

message Order {
  // v1 had: string customer_name = 4;   removed in 2025, never reuse
  reserved 4;
  reserved "customer_name";

  string id = 1;
  int64  amount_minor = 2;           // never change to string: wire-incompatible
  string currency = 3;               // ISO 4217
  OrderStatus status = 5;
  Customer customer = 6;             // replacement for customer_name (additive)
  optional string note = 7;          // proto3 'optional' gives presence tracking
}

message Customer { string id = 1; string display_name = 2; }

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;      // zero value must mean "unknown"
  ORDER_STATUS_PENDING = 1;
  ORDER_STATUS_PAID = 2;
  ORDER_STATUS_REFUNDED = 3;         // adding values is wire-safe; clients must
}                                    // handle unknown numbers gracefully

service OrderService {
  rpc GetOrder(GetOrderRequest) returns (Order);
  rpc ListOrders(ListOrdersRequest) returns (ListOrdersResponse);
}
message GetOrderRequest { string id = 1; }
message ListOrdersRequest  { int32 page_size = 1; string page_token = 2; }   // AIP-158 paging
message ListOrdersResponse { repeated Order orders = 1; string next_page_token = 2; }`,
      note: 'CI: <code>buf lint</code> for style and <code>buf breaking --against \'.git#branch=main\'</code> to block deleted fields without <code>reserved</code>, type changes and renumbering. Removing <code>reserved</code> later is itself flagged.'
    },
    {
      title: 'Spectral ruleset: the style guide as code', lang: 'yaml',
      code: `# .spectral.yaml  (run: npx @stoplight/spectral-cli lint orders.openapi.yaml)
extends: ["spectral:oas"]
rules:
  paths-kebab-case:
    description: Paths use kebab-case nouns, no verbs
    severity: error
    given: $.paths[*]~
    then:
      function: pattern
      functionOptions:
        match: "^(/[a-z0-9-]+|/{[a-zA-Z]+})+$"
  no-verbs-in-paths:
    severity: error
    given: $.paths[*]~
    then:
      function: pattern
      functionOptions:
        notMatch: "/(get|create|update|delete|do)[A-Za-z-]*"
  errors-use-problem-details:
    description: 4xx/5xx responses must be application/problem+json (RFC 9457)
    severity: error
    given: $.paths[*][*].responses[?(@property >= '400')].content
    then:
      field: application/problem+json
      function: truthy
  post-requires-idempotency-key:
    severity: warn
    given: $.paths[*].post
    then:
      field: parameters
      function: schema
      functionOptions:
        schema:
          type: array
          contains: { properties: { name: { const: Idempotency-Key } } }
  list-uses-cursor:
    description: Collections page with cursor, not offset
    severity: error
    given: $.paths[*].get.parameters[*].name
    then:
      function: pattern
      functionOptions:
        notMatch: "^(offset|page)$"`,
      note: 'Run it in the IDE, in pre-commit and in CI. Parameters defined via <code>$ref</code> are resolved by Spectral before rules run. Pair it with <code>oasdiff breaking base.yaml head.yaml --fail-on ERR</code> for compatibility checks.'
    }
  ],

  related: ['socio-technical-laws', 'event-driven-sagas', 'iam-oauth-oidc', 'multi-tenancy', 'architecture-governance', 'sd:api-gateway', 'sd:payment-gateway']
});
