SD.register({
  slug: 'feature-flags',
  domain: 6,
  title: 'Feature Flag & Config Service',
  examples: 'LaunchDarkly, Unleash, Meta Configerator',
  tagline: 'Turn a feature on for <b>exactly the right users</b> in seconds, for thousands of tenants, without a redeploy and <b>without a network call on any request</b>.',
  tldr: {
    problem: 'Teams want to ship code dark, then switch it on for 1% of users, a country or one customer, and switch it off again in seconds when it breaks. Flags are checked <b>millions of times per second</b>, so a check cannot be a network call.',
    idea: 'Store flags as <b>versioned rules</b> per tenant and environment. Server SDKs keep the whole ruleset <b>in memory</b> and evaluate locally. Changes are <b>pushed</b> over a stream (SSE) through relays and CDN snapshots. Percentage rollouts use a <b>deterministic hash</b> of <code>flag.salt.user</code>.',
    insight: 'The service is on the <i>change</i> path, not the <i>request</i> path. If it goes down, SDKs keep serving the <b>last known rules</b> (fail static). The real risks are a bad change spreading everywhere at once and one tenant\'s change fanning out to 100,000 connections.',
    numbers: [
      { v: 'trillions', l: 'config checks per day at Facebook (SOSP 2015 paper)' },
      { v: '6T+/day', l: 'LaunchDarkly flag evaluations (company press release, 2020)' },
      { v: '0', l: 'network calls per server-side evaluation (in-memory ruleset)' }
    ]
  },

  intro: {
    what: 'A feature flag service lets engineers <b>change what software does while it runs</b>. The new code ships switched off, and a rule stored in the service decides who sees it: nobody, staff only, 5% of users, or everyone. The same service also holds runtime settings (timeouts, limits, model versions) that should change without a deploy.',
    analogy: {
      icon: '📋',
      title: 'The specials board in a restaurant',
      text: 'The kitchen can already cook every dish. The board on the wall decides what is offered today and to whom, for example "the new curry for every table whose number ends in 0". Each waiter carries a copy of the board, so they never walk to the manager for each order. When the manager changes the board, every copy is updated within seconds. The analogy breaks in one place: a real service must update tens of thousands of copies at once, and must keep working when the manager is unreachable.'
    },
    problem: 'Suppose checkout v2 is merged and deployed, but must reach only 5% of shoppers, never the German store until legal approves, and must be <b>switched off in seconds</b> if errors rise. Each page view checks dozens of such flags. <b>How do you decide, per request and in microseconds, which users see which version, and change that decision everywhere at once without redeploying?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Read the flag from the database on every request',
        text: 'Each app server runs <code>SELECT enabled FROM flags WHERE key = ?</code> whenever the code reaches an <code>if</code>. For the 5% rollout it uses <code>random() &lt; 0.05</code>. It is simple and always up to date.',
        scene: {
          nodes: [
            { id: 'app', label: 'App servers', sub: 'if (flag) …', kind: 'service', at: [70, 0] },
            { id: 'user', label: 'Shoppers', sub: 'page views', kind: 'client', at: [350, 0] },
            { id: 'db', label: 'Flags DB', sub: '1 query per check', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'user', to: 'app' }, { from: 'app', to: 'db' }],
          flow: ['user>app', 'app>db']
        }
      },
      {
        stage: 'breaks',
        title: 'Millions of lookups, and users flicker',
        text: 'Thirty flags per page times thousands of pages per second is <b>far more queries than the real work</b>. When the flags database is slow, every page is slow; when it is down, every page fails. And <code>random()</code> shows the new checkout on one click and the old one on the next.',
        scene: {
          nodes: [
            { id: 'app', label: 'App servers', sub: '30 checks / page', kind: 'service', at: [70, 0] },
            { id: 'user', label: 'Shoppers', sub: 'v2, v1, v2 …', kind: 'client', at: [350, 0] },
            { id: 'db', label: 'Flags DB', sub: 'overloaded', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'user', to: 'app' }, { from: 'app', to: 'db' }],
          flow: ['user>app', ['app>db', 'app>db'], 'app>db'],
          err: ['db'], warn: ['user'],
          badges: { db: ['down = site down', 'err'], user: ['flicker', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Copy the rules into every app, push changes',
        text: 'Each app keeps the <b>whole rule set in memory</b> and decides locally. The flag service <b>pushes</b> each change over an open stream. A <b>hash of the user id</b> picks the 5%, so a user always gets the same answer. If the service is unreachable, apps keep the last rules they had.',
        scene: {
          nodes: [
            { id: 'ui', label: 'Dashboard', sub: 'edit a rule', kind: 'client', at: [70, 0] },
            { id: 'svc', label: 'Flag service', sub: 'rules + version', kind: 'service', at: [210, 0] },
            { id: 'db', label: 'Flags DB', sub: 'source of truth', kind: 'store', at: [350, 0] },
            { id: 'app', label: 'App + SDK', sub: 'rules in memory', kind: 'service', at: [210, 110] },
            { id: 'user', label: 'Shoppers', sub: 'same answer', kind: 'client', at: [210, 220] }
          ],
          edges: [{ from: 'ui', to: 'svc' }, { from: 'svc', to: 'db' }, { from: 'svc', to: 'app' }, { from: 'user', to: 'app' }],
          flow: ['ui>svc', 'svc>db', 'svc>app', 'user>app'],
          ok: ['app'],
          badges: { app: ['local · µs', 'ok'] }
        }
      }
    ],
    usedBy: ['LaunchDarkly', 'Unleash', 'Meta (Configerator, Gatekeeper)', 'Uber (Flipr)', 'Netflix (Archaius)', 'OpenFeature (CNCF standard API)'],
    whenToUse: [
      'You deploy often and want <b>release</b> (who sees it) separate from <b>deploy</b> (what code is running)',
      'You need gradual rollouts, kill switches, per-customer entitlements or A/B tests',
      'Runtime settings (timeouts, limits, thresholds) must change in seconds without a restart'
    ],
    whenNot: [
      'Secrets such as API keys or passwords: use a secrets manager, not flags',
      'Data that changes per request or per user action: that belongs in a database or <a href="distributed-cache.html">cache</a>',
      'Strongly consistent coordination such as leader election: use etcd / ZooKeeper (see <a href="lock-manager.html">Distributed Lock Manager</a>)'
    ],
    glossary: [
      { term: 'Feature flag', def: 'A named switch checked in code whose value comes from the flag service, not from the deploy.' },
      { term: 'Variation', def: 'One possible value a flag can return, such as <code>true</code>/<code>false</code> or <code>"blue"</code>/<code>"green"</code>.' },
      { term: 'Targeting rule', def: 'A condition on user attributes (country, plan, app version) that picks a variation.' },
      { term: 'Segment', def: 'A reusable, named group of users, defined by a list or by rules, that many flags can target.' },
      { term: 'Bucketing', def: 'Hashing a user key into a fixed number range so a percentage rollout gives the same user the same answer every time.' },
      { term: 'SDK', def: 'The library inside your app that holds the rules and evaluates flags.' },
      { term: 'Relay proxy', def: 'A server inside your network that holds one upstream stream and serves many local SDKs.' },
      { term: 'Fail static', def: 'When the service is unreachable, keep using the last known rules instead of failing or resetting.' }
    ]
  },

  requirements: {
    functional: [
      'Tenants (orgs) own projects; each project has environments (dev, staging, prod) and flags with 2+ variations',
      'Targeting: individual users, rules on attributes, reusable segments, prerequisites, percentage rollouts',
      'Server-side SDKs evaluate locally; client-side (browser, mobile) SDKs receive only their own evaluated values',
      'A change reaches every connected SDK in seconds; kill switch turns a flag off everywhere',
      'Audit log, approvals for protected environments, scheduled changes, stale-flag reports',
      'Exposure events for experiments and "which flags are still evaluated?" insights'
    ],
    nonFunctional: [
      'Evaluation in microseconds with no network call (server-side)',
      'Propagation p99 of a few seconds to 100K+ SDKs in one environment',
      'Apps keep working with the last rules when the service is down (fail static)',
      'Deterministic, sticky bucketing that stays monotonic as a rollout grows',
      'Tenant isolation: no data leaks, no noisy neighbour can delay others\' changes',
      'Every change is versioned, validated and attributable to a person'
    ],
    outOfScope: ['The statistics engine for experiments', 'The CI/CD deploy pipeline itself', 'Secrets management', 'Shipping large binary configs (ML models) — mentioned only briefly']
  },

  calculator: {
    inputs: [
      { id: 'servers', label: 'Server-SDK instances (all tenants)', min: 10000, max: 2000000, value: 300000, log: true },
      { id: 'qps', label: 'Requests / s per instance', min: 10, max: 5000, value: 200, log: true },
      { id: 'checks', label: 'Flag checks per request', min: 1, max: 100, value: 15 },
      { id: 'hot', label: 'SDK connections on the busiest environment', min: 100, max: 1000000, value: 50000, log: true },
      { id: 'rules', label: 'Ruleset size per environment', min: 10000, max: 5000000, value: 300000, log: true, fmt: 'bytes' },
      { id: 'changes', label: 'Flag changes per minute (all tenants)', min: 1, max: 5000, value: 200, log: true }
    ],
    outputs: [
      { label: 'Flag evaluations / s (all local, no network)', f: (v) => v.servers * v.qps * v.checks },
      { label: 'Messages per change on the busiest environment', f: (v) => v.hot },
      { label: 'Bytes per change if the full ruleset is re-sent', fmt: 'bytes', f: (v) => v.hot * v.rules },
      { label: 'Bytes per change as a ~1 KB patch', fmt: 'bytes', f: (v) => v.hot * 1000 },
      { label: 'Reconnect storm: everyone re-downloads the ruleset', fmt: 'bytes', f: (v) => v.hot * v.rules },
      { label: 'Stream messages / s if every change hit the busiest env', f: (v) => (v.changes / 60) * v.hot }
    ],
    note: 'All inputs are <em>estimates</em>. The first line shows why evaluation must be local: it is the request rate times the checks per request, and none of it should touch the network. The rest shows the real cost: <b>fan-out</b>. One change in a big environment becomes tens of thousands of messages, so send small <b>patches</b>, put <b>relay proxies</b> in front of large fleets, and make reconnects jittered so they do not all download the full snapshot at once.'
  },

  api: [
    { m: 'PATCH', p: '/api/v2/flags/{project}/{flag}?env=prod', d: 'Semantic patch, e.g. <code>{op:"updateRollout", pct:20}</code>, with <code>If-Match: version</code> and a comment. Validated, audited, and held for approval if the environment is protected.' },
    { m: 'SSE', p: '/sdk/stream (Authorization: server SDK key)', d: 'First event <code>put</code> = full ruleset with <code>envVersion</code>. Then <code>patch</code>/<code>delete</code> events, each with the flag\'s <code>version</code>. Resume with <code>Last-Event-ID</code>.' },
    { m: 'GET', p: '/sdk/latest-all', d: 'Polling fallback and cold start. Served from a <b>CDN</b>; <code>ETag</code> + <code>If-None-Match</code> returns 304 when nothing changed.' },
    { m: 'POST', p: '/client/eval/{clientSideId}', d: 'Browser or mobile sends its <i>context</i> (user key, attributes) and gets back <b>only evaluated values</b>, never the rules or other users\' targets.' },
    { m: 'POST', p: '/events/bulk', d: 'SDKs batch <b>summary counters</b> (flag, variation, count) and sampled <b>exposure</b> events for experiments.' },
    { m: 'GET', p: '/api/v2/audit?flag={key}', d: 'Who changed what, when, before/after JSON, approver. Also the source for "flag not evaluated in 30 days" cleanup reports.' }
  ],
  dataModel: [
    { name: 'flags', store: 'Postgres (sharded by tenant_id)', fields: [['tenant_id', 'bigint', 'pk'], ['project_id', 'bigint', 'pk'], ['flag_key', 'text', 'pk'], ['variations', 'jsonb'], ['temporary', 'bool'], ['owner', 'text']], note: 'What the flag <i>is</i>: same in every environment.' },
    { name: 'flag_env_config', store: 'Postgres', fields: [['tenant_id, env_id', 'bigint', 'pk'], ['flag_key', 'text', 'pk'], ['on', 'bool'], ['version', 'bigint'], ['salt', 'text'], ['targets, rules', 'jsonb'], ['fallthrough, off_var', 'jsonb'], ['prerequisites', 'jsonb']], note: 'How it behaves in one environment. <code>version</code> rises by 1 on every change; SDKs ignore anything not newer.' },
    { name: 'segments', store: 'Postgres', fields: [['tenant_id, env_id', 'bigint', 'pk'], ['segment_key', 'text', 'pk'], ['included', 'text[]'], ['rules', 'jsonb'], ['version', 'bigint']], note: 'Large lists (100K+ keys) are better kept out of the streamed ruleset and looked up separately.' },
    { name: 'change_log', store: 'Postgres outbox → Kafka', fields: [['tenant_id, env_id', 'bigint', 'pk'], ['env_version', 'bigint', 'pk'], ['actor', 'text'], ['before, after', 'jsonb'], ['approved_by', 'text'], ['at', 'timestamptz']], note: 'Written in the same transaction as the change: it is both the audit log and the feed that drives propagation.' }
  ],

  architecture: {
    title: 'Feature flag service architecture',
    nodes: [
      { id: 'ui', label: 'Dashboard / API', sub: 'engineers · CI', kind: 'client', wide: [90, 50], tall: [70, 0], tip: 'Where people and pipelines change flags. Every change carries an actor and a comment.' },
      { id: 'api', label: 'Flag API', sub: 'validate · approve', kind: 'service', wide: [290, 50], tall: [210, 0], tip: 'Checks the change (schema, rule references, cycles in prerequisites), applies role checks and approval policies, then writes it with an optimistic version check.' },
      { id: 'db', label: 'Config DB', sub: 'sharded by tenant', kind: 'store', wide: [490, 50], tall: [350, 0], tip: 'Source of truth. Rows are keyed by tenant, so tenants can be placed on different shards and moved.' },
      { id: 'log', label: 'Change log', sub: 'outbox → Kafka', kind: 'queue', wide: [690, 50], tall: [350, 110], tip: 'Each change becomes an ordered event per environment. It is also the audit trail.' },
      { id: 'snap', label: 'Snapshot builder', sub: 'per env · version', kind: 'compute', wide: [890, 50], tall: [210, 110], tip: 'Applies the event to the environment\'s ruleset, bumps its version, uploads the full snapshot and emits a small patch.' },
      { id: 'cdn', label: 'CDN snapshots', sub: 'latest-all · ETag', kind: 'edge', wide: [890, 170], tall: [70, 110], tip: 'Full rulesets cached at the edge. Used for cold starts, polling SDKs and as a fallback when the stream is down.' },
      { id: 'stream', label: 'Streaming tier', sub: 'SSE · by env', kind: 'service', wide: [590, 170], tall: [210, 220], tip: 'Holds long-lived SSE connections. Each node subscribes only to the environments of its connected SDKs, with per-tenant connection and message limits.' },
      { id: 'ceval', label: 'Client eval', sub: 'values only', kind: 'service', wide: [290, 170], tall: [350, 220], tip: 'Evaluates flags for browsers and phones, so rules, segments and other users\' keys never leave the server.' },
      { id: 'relay', label: 'Relay proxy', sub: 'in customer VPC', kind: 'edge', wide: [690, 290], tall: [210, 330], tip: 'One upstream stream, many local SDK connections. Also keeps serving its cached ruleset if the vendor is unreachable.' },
      { id: 'web', label: 'Browser / mobile', sub: 'client SDK', kind: 'client', wide: [90, 290], tall: [350, 330], tip: 'Gets evaluated values for its own user and caches them on the device.' },
      { id: 'srv', label: 'App + server SDK', sub: 'rules in RAM', kind: 'service', wide: [890, 290], tall: [70, 440], tip: 'The ruleset lives in memory. Evaluation is a pure function of (rules, user context): no network call.' },
      { id: 'events', label: 'Events pipeline', sub: 'exposures', kind: 'queue', wide: [490, 410], tall: [350, 440], tip: 'Summaries (flag, variation, count) and sampled exposures for experiments and stale-flag detection.' }
    ],
    edges: [
      { from: 'ui', to: 'api' },
      { from: 'api', to: 'db' },
      { from: 'db', to: 'log' },
      { from: 'log', to: 'snap' },
      { from: 'snap', to: 'cdn' },
      { from: 'snap', to: 'stream' },
      { from: 'stream', to: 'relay' },
      { from: 'relay', to: 'srv' },
      { from: 'cdn', to: 'srv', dashed: true, label: 'poll' },
      { from: 'stream', to: 'ceval' },
      { from: 'web', to: 'ceval', bidi: true },
      { from: 'srv', to: 'events' },
      { from: 'web', to: 'events' }
    ]
  },

  scenarios: [
    {
      id: 'change', title: 'A rollout change reaches 50K SDKs', tone: 'ok',
      steps: [
        { text: 'An engineer raises <b>new-checkout</b> from 10% to 20% in prod. The request carries <code>If-Match: version 41</code>, so two people editing at once cannot overwrite each other.', flow: ['ui>api'], badges: { api: 'validate ✓' } },
        { text: 'One transaction updates the flag row (version 42) and inserts a <b>change_log</b> row: the audit record and the propagation event are the same write.', flow: ['api>db', 'db>log'], badges: { db: 'v42' } },
        { text: 'The snapshot builder applies the event to the <b>prod</b> ruleset, bumps the environment version, uploads the full snapshot to the CDN and emits a ~1 KB <code>patch</code>.', flow: ['log>snap', ['snap>cdn', 'snap>stream']], badges: { snap: 'env v9312' } },
        { text: 'Stream nodes that hold prod connections push the patch. A <b>relay proxy</b> in the customer\'s network receives it once and fans it out to its local SDKs.', flow: ['stream>relay', 'relay>srv'], badges: { relay: '1 → 400' } },
        { text: 'The SDK applies the patch only if <code>42 &gt; its current version</code>. The next request is evaluated with the new rule in memory. Users who were in the first 10% <b>stay in</b>; another 10% join.', nodes: ['srv'], ok: ['srv'], badges: { srv: ['20% · sticky', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'eval', title: 'Evaluating a flag: server vs browser', tone: 'info',
      steps: [
        { text: 'Server side: <code>sdk.boolVariation("new-checkout", ctx, false)</code> runs <b>in memory</b>: flag on? → prerequisites → individual targets → rules in order → fallthrough rollout.', nodes: ['srv'], badges: { srv: '≈ µs' } },
        { text: 'For the rollout, the SDK hashes <code>new-checkout.salt.user-123</code> into a bucket 0–99,999. Bucket 13,402 &lt; 20,000, so the user gets <b>true</b>, and will on every request.', nodes: ['srv'], badges: { srv: 'bucket 13402' } },
        { text: 'Browser side: the rules mention other customers\' ids and internal segments, so they must <b>not</b> be shipped to the page. The client SDK sends its context and gets back <b>only its values</b>.', flow: ['web>ceval', 'ceval>web'], badges: { ceval: 'values only' } },
        { text: 'Client eval nodes receive the same patches as everyone else, so a change updates browsers too. The browser caches its values for offline starts.', flow: ['stream>ceval'], tone: 'ok' },
        { text: 'SDKs count evaluations per (flag, variation) and send <b>summaries</b>, plus sampled <b>exposure</b> events for experiments. Flags with zero evaluations for 30 days are cleanup candidates.', flow: [['srv>events', 'web>events']], badges: { events: 'exposures' } }
      ]
    },
    {
      id: 'kill', title: 'Bad rollout → kill switch', tone: 'warn',
      steps: [
        { text: 'new-checkout is at 20%. Error rates rise only for users in the treatment group: the exposure data makes this visible within minutes.', nodes: ['srv', 'events'], warn: ['srv'], badges: { events: ['errors ↑ in v2', 'warn'] }, tone: 'warn' },
        { text: 'On-call flips the flag <b>off</b>. A kill switch is just a high-priority change: no deploy, no build, no approval if policy allows it for turning things off.', flow: ['ui>api', 'api>db', 'db>log'], badges: { api: 'off · urgent' } },
        { text: 'The same pipeline pushes the patch. Every SDK now returns the <b>off variation</b> without looking at rules.', flow: ['log>snap', 'snap>stream', 'stream>relay', 'relay>srv'], ok: ['srv'], badges: { srv: ['off in seconds', 'ok'] }, tone: 'ok' },
        { text: 'The audit log shows who changed what. A guarded rollout can do this automatically: if the error metric for the treatment crosses a threshold, roll back to 0%.', nodes: ['log', 'events'], tone: 'ok' }
      ]
    },
    {
      id: 'fanout', title: 'Hot spot: big tenant and a bulk edit', tone: 'warn',
      steps: [
        { text: 'One tenant has <b>200K</b> SDK connections in prod. Its CI job bulk-edits 3,000 flags in a minute. Naively that is 600 million messages, and other tenants\' changes queue behind them.', flow: ['ui>api', 'api>db', 'db>log', 'log>snap'], warn: ['stream'], badges: { stream: ['600M msgs', 'warn'] }, tone: 'warn' },
        { text: 'Per-tenant <b>change-rate limits</b> at the API, plus <b>coalescing</b>: the snapshot builder batches changes for ~200 ms and emits one combined patch per environment.', nodes: ['api', 'snap'], badges: { snap: '3000 → 5 patches' } },
        { text: 'Streaming nodes are <b>sharded by environment</b>, with per-tenant send queues, so a big tenant\'s backlog cannot delay a small tenant\'s kill switch.', nodes: ['stream'], ok: ['stream'], badges: { stream: ['fair queues', 'ok'] } },
        { text: 'The big tenant runs <b>relay proxies</b>: 200K SDKs become ~400 upstream connections. The vendor fan-out drops by about 500×.', flow: ['stream>relay', 'relay>srv'], ok: ['relay'], badges: { relay: '400 upstream' }, tone: 'ok' }
      ]
    },
    {
      id: 'outage', title: 'Flag service down', tone: 'err',
      steps: [
        { text: 'The config DB and streaming tier are unreachable. Every SSE connection drops at once.', nodes: ['db', 'stream'], err: ['db', 'stream'], badges: { stream: ['down', 'err'] }, tone: 'err' },
        { text: 'Running SDKs <b>fail static</b>: they keep evaluating with the last ruleset in memory. Users see no change. Only <i>new</i> flag edits are delayed.', nodes: ['srv'], ok: ['srv'], badges: { srv: ['last known v42', 'ok'] } },
        { text: 'A new app instance starts. It cannot open the stream, so it loads the snapshot from the <b>CDN</b> (or from the relay\'s cache) and polls until the stream returns.', flow: ['cdn>srv'], badges: { cdn: 'snapshot' }, warn: ['cdn'] },
        { text: 'With no snapshot at all, the SDK gives up after an <b>init timeout</b> and serves the <b>code defaults</b>. Pick defaults that are safe: usually "new feature off".', nodes: ['srv'], warn: ['srv'], badges: { srv: ['defaults', 'warn'] }, tone: 'warn' },
        { text: 'When the stream returns, SDKs reconnect with <b>jittered backoff</b> and send <code>Last-Event-ID</code>, so most get a small catch-up instead of a full <code>put</code>.', flow: ['stream>relay', 'relay>srv'], ok: ['stream'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real design decision. Watch the request path, the labels and the meters.',
    diagram: null, // filled below: architecture + an optional local snapshot store
    controls: [
      { id: 'evalLoc', label: 'Where server-side evaluation happens', type: 'seg', value: 'local', options: [
        { v: 'remote', l: 'Remote call per check' }, { v: 'local', l: 'In the SDK (in memory)' }] },
      { id: 'delivery', label: 'How changes reach SDKs', type: 'seg', value: 'relay', options: [
        { v: 'poll', l: 'Poll CDN every 30 s' }, { v: 'stream', l: 'SSE stream' }, { v: 'relay', l: 'SSE via relay proxy' }] },
      { id: 'bucket', label: 'Percentage rollout bucketing', type: 'seg', value: 'hash', options: [
        { v: 'random', l: 'random() per check' }, { v: 'idmod', l: 'userId % 100' }, { v: 'hash', l: 'hash(flag.salt.user)' }] },
      { id: 'fallback', label: 'When the service is unreachable', type: 'seg', value: 'snapshot', options: [
        { v: 'none', l: 'Throw / block' }, { v: 'defaults', l: 'Code defaults' }, { v: 'snapshot', l: 'Last-known snapshot' }] },
      { id: 'n', label: 'SDK instances in this environment', type: 'range', min: 1000, max: 200000, step: 1000, value: 50000, kind: 'num' }
    ],
    evaluate(s) {
      const n = s.n;
      const rps = 200, checks = 15; // illustrative per-instance load
      const remote = s.evalLoc === 'remote';
      const relays = Math.ceil(n / 500);
      const evalRate = n * rps * checks;
      const metrics = [
        { k: 'Eval latency', v: remote ? '≈ 1–5 ms per check (network)' : '≈ microseconds (in memory)', s: remote ? 0.2 : 0.95 },
        { k: 'Load on flag service', v: remote ? SD.fmt.num(evalRate) + ' calls/s' : (s.delivery === 'poll' ? SD.fmt.num(n / 30) + ' polls/s (CDN)' : 'only changes × fan-out'), s: remote ? 0.05 : s.delivery === 'poll' ? 0.7 : 0.9, hint: remote ? rps + ' req/s × ' + checks + ' checks' : '' },
        { k: 'Propagation', v: remote ? 'immediate (next call)' : { poll: '≈ 15 s avg, 30 s max', stream: 'about a second (est.)', relay: 'about a second (+1 hop)' }[s.delivery], s: remote ? 0.95 : { poll: 0.45, stream: 0.9, relay: 0.85 }[s.delivery] },
        { k: 'Upstream connections', v: remote ? n + ' pools, every request' : { poll: 'none held (' + SD.fmt.num(n / 30) + ' req/s)', stream: SD.fmt.num(n) + ' long-lived', relay: SD.fmt.num(relays) + ' (via relays)' }[s.delivery], s: remote ? 0.2 : { poll: 0.75, stream: n > 50000 ? 0.35 : 0.65, relay: 0.9 }[s.delivery] },
        { k: 'Rollout stability', v: { random: 'flaps on every check', idmod: 'sticky, same users in every rollout', hash: 'sticky and independent per flag' }[s.bucket], s: { random: 0.05, idmod: 0.45, hash: 0.95 }[s.bucket] },
        { k: 'If the service is down', v: remote ? { none: 'every check errors', defaults: 'all flags → defaults', snapshot: 'cached values only' }[s.fallback] : { none: 'app fails to start', defaults: 'features revert to defaults', snapshot: 'last rules keep serving' }[s.fallback], s: remote ? { none: 0.02, defaults: 0.3, snapshot: 0.5 }[s.fallback] : { none: 0.1, defaults: 0.45, snapshot: 0.95 }[s.fallback] }
      ];
      const notes = [];
      if (remote) notes.push('A remote call per check puts the flag service on <b>every request\'s critical path</b>: ' + SD.fmt.num(evalRate) + ' calls/s here. This is fine only for a handful of low-traffic checks.');
      if (!remote && s.delivery === 'poll') notes.push('Polling is simple and CDN-friendly; Unleash documents a small propagation delay, typically a few seconds and configurable. A kill switch then takes up to one poll interval.');
      if (!remote && s.delivery === 'stream' && n > 50000) notes.push(SD.fmt.num(n) + ' SSE connections for one environment: each change is ' + SD.fmt.num(n) + ' sends from the vendor. LaunchDarkly added a relay proxy for exactly this, and for customers\' NAT limits.');
      if (s.delivery === 'relay' && !remote) notes.push('One relay per ~500 SDKs (illustrative): ' + SD.fmt.num(relays) + ' upstream streams. The relay also caches the ruleset, so it doubles as a local fallback.');
      if (s.bucket === 'random') notes.push('<code>random() &lt; 0.2</code> gives each <i>check</i> a 20% chance, not each <i>user</i>. One user sees v2, then v1, then v2; experiment data is useless.');
      if (s.bucket === 'idmod') notes.push('<code>userId % 100</code> is sticky, but every flag at 10% picks the <b>same</b> users. Early Flipper versions did this; later versions hash the feature name with the actor id.');
      if (s.bucket === 'hash') notes.push('LaunchDarkly hashes <code>flagKey.salt.userKey</code> (SHA-1, first 15 hex digits). Unleash uses MurmurHash3 of <code>groupId:userId</code>. Both are stable as the percentage grows.');
      if (s.fallback === 'none') notes.push('Blocking startup on the flag service turns its outage into your outage. Use an init timeout.');
      if (s.fallback === 'defaults') notes.push('Defaults are a last resort: every rolled-out feature disappears for everyone until the service returns.');
      let verdict;
      if (s.bucket === 'random') verdict = '❌ <b>Random bucketing breaks rollouts and experiments.</b> Hash a stable user key with the flag key and a salt.';
      else if (s.fallback === 'none') verdict = '❌ <b>The flag service is now a single point of failure.</b> Serve the last-known rules or safe defaults.';
      else if (remote) verdict = '⚠ <b>Every flag check is a network call.</b> Evaluate locally from an in-memory ruleset and push changes.';
      else if (s.bucket === 'idmod') verdict = '⚠ <b>Sticky but correlated:</b> the same 10% of users get every early rollout. Put the flag key and a salt in the hash.';
      else if (s.delivery === 'stream' && n > 50000) verdict = '⚠ <b>Works, but fan-out is expensive</b> at ' + SD.fmt.num(n) + ' connections. Add relay proxies.';
      else if (s.delivery === 'poll') verdict = '👍 <b>Simple and robust.</b> Fine when a 30 s kill switch is acceptable; stream if it is not.';
      else if (s.fallback === 'snapshot') verdict = '✅ <b>Close to what LaunchDarkly, Unleash and Uber Flipr describe:</b> local evaluation, pushed changes, sticky hashing and a cached fallback.';
      else verdict = '👍 Good, but a cached snapshot would keep features stable through an outage.';
      const flow = remote ? ['srv>ceval'] : { poll: ['log>snap', 'snap>cdn', 'cdn>srv'], stream: ['log>snap', 'snap>stream', 'stream>srv'], relay: ['log>snap', 'snap>stream', 'stream>relay', 'relay>srv'] }[s.delivery];
      if (s.fallback === 'snapshot' && !remote) flow.push('srv>disk');
      const hide = [];
      if (s.fallback !== 'snapshot') hide.push('disk');
      if (remote || s.delivery !== 'relay') hide.push('relay');
      return {
        metrics, verdict, notes, flow, hide,
        labels: remote ? { ceval: { label: 'Eval service', sub: '1 RPC per check' }, srv: { label: 'App server', sub: 'no local rules' } } : {},
        hot: s.fallback === 'snapshot' && !remote ? ['disk'] : [],
        warn: remote ? ['ceval'] : s.delivery === 'stream' && n > 50000 ? ['stream'] : [],
        err: s.bucket === 'random' || s.fallback === 'none' ? ['srv'] : [],
        badges: { srv: remote ? ['ms per check', 'err'] : ['µs, local', 'ok'] }
      };
    }
  },

  widget: {
    title: 'Deterministic bucketing: hash(flag.salt.user) → 0…99,999',
    caption: 'Each square is a user, bucketed with real <b>MurmurHash3 (32-bit)</b> of <code>flagKey.salt.userKey</code> mod 100,000. Drag the rollout up: everyone already on <b>stays on</b>. Switch to <b>random()</b> to see users flicker, to <b>id % 100</b> and turn on flag B to see correlated cohorts, press <b>New salt</b> to reshuffle, and turn on <b>rules</b> and tap a user to trace the evaluation order.'
  },

  realWorld: {
    intro: 'Big companies built this in-house first; vendors and open-source projects then turned it into a product and a standard API.',
    timeline: [
      { when: '2015', who: 'Meta (Facebook)', title: 'Configerator, Gatekeeper, PackageVessel (SOSP)', text: 'The paper says Facebook makes <b>thousands of online config changes</b> and runs <b>trillions of config checks</b> every day. <b>Configerator</b> treats config as code: version control, review, <b>automated canary testing</b> and distribution. Commits are synced by tailers into <b>Zeus</b> (Facebook\'s ZooKeeper) and pushed down a tree of observers and proxies. <b>Gatekeeper</b> rolls out features by evaluating <i>restraints</i> (e.g. "is employee", device type). <b>PackageVessel</b> moves large configs peer-to-peer.', src: 0 },
      { when: 'OSS', who: 'Netflix', title: 'Archaius dynamic properties', text: 'A Java library for properties that change at runtime. A polling source refreshes a whole configuration snapshot; sources like ZooKeeper can update single properties. Code reads a cached <code>Property</code> object instead of re-reading config.', src: 13 },
      { when: 'Gem history', who: 'Flipper (Ruby)', title: 'From id % 100 to hashing the feature name', text: 'Early Flipper compared <code>actor id % 100</code> with the percentage, so every flag at 10% picked the same users. Later versions hash the <b>feature name plus the actor id</b> (CRC32), so cohorts differ per flag but stay sticky.', src: 14 },
      { when: '2020', who: 'LaunchDarkly', title: 'From polling to streaming, plus a relay', text: 'LaunchDarkly started with polling, which became too costly as usage grew. It moved to a streaming design, and added a <b>relay proxy</b> that keeps one connection to LaunchDarkly for many SDKs, partly because many direct connections were a problem for customers\' NAT. Flags and rules are also cached on <b>Fastly\'s CDN</b> on every change.', src: 2 },
      { when: '2020', who: 'LaunchDarkly', title: 'Scale claim', text: 'A company press release said it served <b>over six trillion flag evaluations a day</b>, on fourteen million mobile devices and three million servers. Evaluations happen inside SDKs, which is how that number is affordable.', src: 7 },
      { when: '2021', who: 'Uber', title: 'Flipr', text: 'Dynamic config with <b>exceptions</b> and <b>constraints</b> on city, app version, user id and experiment treatment. A backend API feeds <b>gateways that act as a fan-out cache</b>, a per-host agent and client libraries. Replication is asynchronous (eventually consistent), and clients keep an <b>on-disk copy</b> so they keep working if the backend fails.', src: 12 },
      { when: 'Docs', who: 'Unleash', title: 'Local evaluation for servers, evaluated values for browsers', text: 'Backend SDKs fetch the full configuration and evaluate locally; frontend SDKs fetch <b>only evaluated flags</b>. Propagation has a small delay, typically a few seconds and configurable. Gradual rollouts hash <code>groupId</code> + user id with <b>MurmurHash</b>; <code>groupId</code> defaults to the flag name.', src: 8 },
      { when: 'Dec 2023', who: 'CNCF', title: 'OpenFeature becomes incubating', text: 'A vendor-neutral flag evaluation API with community SDKs. Code calls OpenFeature; a <i>provider</i> plugs in LaunchDarkly, Unleash, flagd or an in-house service.', src: 11 },
      { when: 'Jun 2025', who: 'Google Cloud', title: 'Unflagged code + globally replicated policy', text: 'A new Service Control code path was <b>not feature-flag protected</b>. A policy change with blank fields replicated globally within seconds and crashed it everywhere. Google\'s remediation: changes to critical binaries must be <b>flag protected and off by default</b>.', src: 16 },
      { when: 'Nov 2025', who: 'Cloudflare', title: 'A generated config file doubled in size', text: 'A database permission change made a query emit duplicate rows into the Bot Management <b>feature file</b>, which doubled in size and exceeded a limit in the proxy. The bad file spread across the fleet. A lesson for config services: <b>validate generated config like untrusted input</b> and roll it out in stages.', src: 17 }
    ],
    lessons: [
      'Keep the flag service off the request path: <b>local evaluation</b> from an in-memory ruleset, changes pushed.',
      'Hash a stable key <b>with the flag key and a salt</b>: sticky per user, independent across flags, monotonic as the rollout grows.',
      'Design for the service being down: <b>last-known snapshot</b>, then safe code defaults, never a blocked startup.',
      'A config change is a deploy: <b>validate, canary, audit and roll back</b> it like code. Global, instant config is the fastest way to break everything.'
    ],
    sources: [
      { title: 'Holistic Configuration Management at Facebook', url: 'https://sigops.org/s/conferences/sosp/2015/current/2015-Monterey/printable/008-tang.pdf', pub: 'Tang et al., SOSP 2015' },
      { title: 'Holistic Configuration Management at Facebook (summary)', url: 'https://blog.acolyer.org/2015/10/16/holistic-configuration-management-at-facebook/', pub: 'The Morning Paper, 2015' },
      { title: 'LaunchDarkly\'s evolution from polling to streaming', url: 'https://launchdarkly.com/blog/launchdarklys-evolution-from-polling-to-streaming/', pub: 'LaunchDarkly blog, 2020' },
      { title: 'Designing for failure to avoid disaster', url: 'https://launchdarkly.com/blog/designing-for-failure-to-avoid-disaster/', pub: 'LaunchDarkly blog' },
      { title: 'Flag evaluation rules in server-side SDKs', url: 'https://launchdarkly.com/docs/sdk/concepts/flag-evaluation-rules', pub: 'LaunchDarkly docs' },
      { title: 'How percentage rollouts work', url: 'https://spacecamp.launchdarkly.com/lesson-3/how-percentage-rollouts-work', pub: 'LaunchDarkly Space Camp' },
      { title: 'LaunchDarkly::Impl::EvaluatorBucketing (Ruby server SDK 8.5.0)', url: 'https://rubydoc.info/gems/launchdarkly-server-sdk/8.5.0/LaunchDarkly/Impl/EvaluatorBucketing', pub: 'RubyDoc (SDK source)' },
      { title: 'LaunchDarkly serves more flag evaluations per day than there are Google searches in a year', url: 'https://www.prweb.com/releases/launchdarkly_serves_more_flag_evaluations_per_day_than_there_are_google_searches_in_a_year/prweb17392998.htm', pub: 'LaunchDarkly press release (PRWeb), 2020' },
      { title: 'Unleash architecture overview', url: 'https://docs.getunleash.io/get-started/unleash-overview', pub: 'Unleash docs' },
      { title: 'Stickiness', url: 'https://docs.getunleash.io/concepts/stickiness', pub: 'Unleash docs' },
      { title: 'Enterprise Edge overview', url: 'https://docs.getunleash.io/unleash-edge', pub: 'Unleash docs' },
      { title: 'OpenFeature becomes a CNCF incubating project', url: 'https://www.cncf.io/blog/2023/12/19/openfeature-becomes-a-cncf-incubating-project/', pub: 'CNCF blog, Dec 2023' },
      { title: 'Flipr: Making Changes Quickly and Safely at Scale', url: 'https://www.uber.com/blog/flipr/', pub: 'Uber Engineering, 2021' },
      { title: 'Archaius overview', url: 'https://github.com/Netflix/archaius/wiki/Overview', pub: 'Netflix OSS (GitHub wiki)' },
      { title: 'Flipper::Gates::PercentageOfActors', url: 'https://www.rubydoc.info/gems/flipper/Flipper/Gates/PercentageOfActors', pub: 'RubyDoc (current gem)' },
      { title: 'Flipper::Gates::PercentageOfActors (0.2.0)', url: 'https://www.rubydoc.info/gems/flipper/0.2.0/Flipper/Gates/PercentageOfActors', pub: 'RubyDoc (early gem)' },
      { title: 'Google Cloud incident report, 12 June 2025', url: 'https://status.cloud.google.com/incidents/ow5i3PPK96RduMcb1SsW', pub: 'Google Cloud Service Health, 2025' },
      { title: 'Cloudflare outage on November 18, 2025', url: 'https://blog.cloudflare.com/18-november-2025-outage/', pub: 'Cloudflare blog, 2025' },
      { title: 'Secure mode', url: 'https://launchdarkly.com/docs/eu-docs/sdk/features/secure-mode', pub: 'LaunchDarkly docs' },
      { title: 'Predefined strategy types (gradual rollout, groupId)', url: 'https://docs.getunleash.io/concepts/predefined-strategy-types', pub: 'Unleash docs' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Where to evaluate', '<b>In the server SDK</b>: µs, no network, works offline', '<b>Remote evaluation</b>: rules never leave the service, one source of truth', 'SDK for servers; remote (at the edge) for browsers and phones, where rules would leak'],
      ['Change delivery', '<b>Polling</b> (ETag, CDN): simple, cacheable, firewall-friendly', '<b>Streaming</b> (SSE): about a second, but long-lived connections and fan-out', 'Stream by default with polling as fallback; poll-only for batch jobs and serverless'],
      ['Fan-out', '<b>Direct SDK connections</b>: nothing to run', '<b>Relay proxy</b>: one upstream per cluster, local cache, survives vendor outage', 'Relay once a fleet has thousands of instances or strict egress rules'],
      ['Payload', '<b>Full snapshot</b> each time: self-healing, simple', '<b>Versioned patches</b>: small, but need ordering and resync', 'Patches on the stream, full <code>put</code> on (re)connect and on version gaps'],
      ['Config storage', '<b>Database + UI</b>: instant edits, rich targeting', '<b>Config as code</b> (git, review, CI) like Configerator', 'Flags in a DB with audit and approvals; infra config in git with canary'],
      ['Tenancy', '<b>Shared tables</b> with tenant_id + row-level security', '<b>Shard or cell per tenant group</b>', 'Shared by default; move whales to their own shard and stream cells']
    ]
  },
  failures: [
    { f: 'Bad change spreads everywhere in seconds', detect: 'Error spike right after a change; exposure data shows only the treatment fails', fix: 'Validation, staged rollout of the change itself (canary env / % first), one-click revert to the previous version, automatic rollback on guard metrics.' },
    { f: 'Flag service or stream down', detect: 'SDK data-source status "interrupted"; stream connection count drops', fix: 'Fail static on last-known rules; new instances load a CDN or relay snapshot; init timeout then safe defaults.' },
    { f: 'Reconnect storm after an outage', detect: 'Connection rate and snapshot downloads spike together', fix: 'Jittered exponential backoff, <code>Last-Event-ID</code> catch-up instead of full <code>put</code>, CDN for snapshots, admission limits per tenant.' },
    { f: 'Out-of-order or duplicate updates', detect: 'SDK sees a version ≤ the one it holds, or a gap in env version', fix: 'Apply only if <code>version &gt; current</code>; on a gap, request a full snapshot.' },
    { f: 'Noisy tenant floods the stream', detect: 'Per-tenant message rate and queue depth', fix: 'Change-rate limits, coalesce patches, per-tenant fair queues, shard streams by environment, relay proxies for whales.' },
    { f: 'Rules leak through a client SDK', detect: 'Security review: payload contains other users\' keys or segment lists', fix: 'Client SDKs get evaluated values only; sign the user key (HMAC "secure mode") so a page cannot ask for another user\'s values.' },
    { f: 'Flag debt: hundreds of dead flags', detect: 'No evaluations in 30 days; flag at 100% for months', fix: 'Mark flags temporary with an owner and expiry, open cleanup tickets automatically, block new flags past a per-team budget.' }
  ],

  interview: [
    { q: 'Why do server-side SDKs evaluate flags locally instead of calling the flag service?', a: '<p>A page may check dozens of flags, and a service may handle thousands of requests per second. A network call per check adds milliseconds each and makes the flag service a <b>single point of failure on every request</b>.</p><p>So the SDK downloads the <b>whole ruleset</b> for its environment, keeps it in memory and evaluates a pure function of (rules, user context) in microseconds. The service is only on the <b>change</b> path.</p>', fu: 'When would you still evaluate remotely? (Browsers and phones, and very large segment lists.)', lvl: 'core' },
    { q: 'How does a percentage rollout give the same user the same answer every time?', a: '<p>Hash a stable key: <code>bucket = hash(flagKey + "." + salt + "." + userKey) mod 100000</code>. The user is in the rollout if <code>bucket &lt; pct × 1000</code>.</p><p>The hash depends only on those inputs, so it is the same on every server and every request, with no stored assignment. Raising 10% → 20% moves the threshold; everyone below 10,000 is still below 20,000, so <b>nobody loses the feature</b>.</p>', lvl: 'core' },
    { q: 'Why put the flag key and a salt in the hash? Why not just userId % 100?', a: '<p><code>userId % 100 &lt; 10</code> is sticky, but it picks the <b>same 10% of users for every flag</b>. Those users get every risky early rollout, and experiments on two flags are confounded.</p><p>Including the flag key makes each flag\'s buckets <b>independent</b>. The salt lets you deliberately <b>reshuffle</b> one flag (e.g. to rerun an experiment on fresh users). Sometimes you want the opposite, e.g. two flags that must go to the same users: then share the salt or group id on purpose (Unleash calls it <code>groupId</code>).</p>', lvl: 'core' },
    { q: 'What is the evaluation order for a flag with targeting?', a: '<ul><li>Flag <b>off</b> → off variation.</li><li><b>Prerequisites</b>: if any required flag does not return the required variation → off variation.</li><li><b>Individual targets</b> (user key lists).</li><li><b>Rules</b> in order; first match wins. A rule can match on attributes or on a <b>segment</b>.</li><li><b>Fallthrough</b>: a fixed variation or a percentage rollout.</li><li>Missing flag or SDK not ready → the <b>code default</b>.</li></ul><p>This is the order LaunchDarkly documents for its server SDKs.</p>', lvl: 'core' },
    { q: 'Client-side SDKs: why not send the whole ruleset to the browser?', a: '<p>Rules contain other customers\' ids, email domains, internal segments and unreleased feature names. Anything sent to a browser is public. Large rulesets also cost bandwidth on phones.</p><p>Instead the browser sends its context and gets back <b>evaluated values only</b>, from an edge or relay. To stop a page asking for someone else\'s values, the server can sign the user key with an HMAC (LaunchDarkly calls this <b>secure mode</b>).</p>', lvl: 'core' },
    { q: 'How do you push one change to 100,000 SDKs within seconds?', a: '<p>Write the change and an outbox event in one transaction. A builder applies it to the environment\'s ruleset, bumps the version and emits a small <b>patch</b>. Streaming nodes, <b>sharded by environment</b>, push it over SSE.</p><p>Add <b>relay proxies</b> inside big customers\' networks (1 upstream → hundreds of SDKs), put full <b>snapshots on a CDN</b> for cold starts and polling, and keep polling as the fallback when the stream fails.</p>', fu: 'Why SSE and not WebSockets? (One-way, plain HTTP, auto-reconnect with Last-Event-ID, passes most proxies.)', lvl: 'core' },
    { q: 'Patches can arrive late, twice, or out of order. How does the SDK stay correct?', a: '<p>Every flag has a <b>version</b> that rises on each change. The SDK applies an update only if <code>new.version &gt; held.version</code>; a delete is a tombstone with a version too, so an old patch cannot resurrect a deleted flag.</p><p>On reconnect the SDK sends <code>Last-Event-ID</code>; if the server cannot replay from there, it sends a full <code>put</code>. An environment-level version lets the SDK detect gaps and resync.</p>', lvl: 'deep' },
    { q: 'What happens when the flag service is completely down?', a: '<p>Running SDKs <b>fail static</b>: they keep the last ruleset in memory. New instances load a snapshot from the CDN, the relay\'s cache or a local file. Only if none exists do they give up after an <b>init timeout</b> and use code defaults.</p><p>So defaults must be safe (usually "new thing off"), and startup must never block forever on the flag service.</p>', lvl: 'core' },
    { q: 'How do you make it multi-tenant without noisy neighbours?', a: '<ul><li><b>Isolation</b>: every key starts with tenant_id; SDK keys are scoped to one environment; row-level security in the DB.</li><li><b>Fan-out cost</b> is per change × connections, so rate-limit changes per tenant and <b>coalesce</b> bursts into one patch.</li><li>Per-tenant <b>fair queues</b> in the streaming tier so a whale\'s backlog never delays someone else\'s kill switch.</li><li><b>Shard</b> storage and streams by tenant/environment; move whales to their own cell.</li><li>Limits on connections, ruleset size and segment size per plan.</li></ul>', lvl: 'deep' },
    { q: 'How do you make config changes themselves safe?', a: '<p>Treat a config change like a deploy. <b>Validate</b> (schema, referenced segments exist, no prerequisite cycles, size limits). Require <b>approvals</b> for prod. Roll the change out in <b>stages</b> (Facebook\'s Configerator runs automated canaries). Keep an <b>audit log</b> and one-click revert.</p><p>Recent outages show the risk: Google Cloud (2025) shipped a code path without a flag and a global policy change crashed it; Cloudflare (2025) pushed a generated file that exceeded a limit everywhere.</p>', lvl: 'deep' },
    { q: 'How do experiments use the flag system?', a: '<p>The flag assigns the variation; the SDK records an <b>exposure</b> event (user, flag, variation) <b>when the code actually evaluates it</b>, not when the user is targeted. Analysis joins exposures with metric events.</p><p>Bucketing must be deterministic and the population must not shift mid-experiment. Check <b>sample ratio mismatch</b>: if a 50/50 split shows 52/48, something (caching, bots, a crash in one arm) is broken.</p>', lvl: 'deep' },
    { q: 'How do you stop flags from piling up?', a: '<p>Mark release flags <b>temporary</b> with an owner and expected removal date. Use evaluation summaries to find flags at 100% or 0% for weeks, or not evaluated at all, then open cleanup tasks. Some teams cap the number of live temporary flags per team.</p><p>Permanent flags (kill switches, entitlements, ops toggles) are labelled as such and reviewed separately.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Postgres: versioned change + audit/outbox + tenant isolation', lang: 'sql',
      code: `CREATE TABLE flag_env_config (
  tenant_id bigint, env_id bigint, flag_key text,
  "on" boolean NOT NULL DEFAULT false,
  salt text NOT NULL DEFAULT md5(random()::text),
  rules jsonb NOT NULL DEFAULT '[]', fallthrough jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, env_id, flag_key));
CREATE TABLE environments (tenant_id bigint, env_id bigint,
  env_version bigint NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, env_id));
CREATE TABLE change_log (tenant_id bigint, env_id bigint, env_version bigint,
  flag_key text, flag_version bigint, actor text, after jsonb,
  at timestamptz DEFAULT now(), PRIMARY KEY (tenant_id, env_id, env_version));

ALTER TABLE flag_env_config ENABLE ROW LEVEL SECURITY;   -- app role is not the owner
CREATE POLICY tenant_only ON flag_env_config
  USING (tenant_id = current_setting('app.tenant_id')::bigint);

-- one change = one transaction; 0 rows from step 1 => someone else edited (409)
BEGIN;
WITH f AS (
  UPDATE flag_env_config SET fallthrough = '{"rollout": 20000}', version = version + 1
   WHERE tenant_id = 7 AND env_id = 1 AND flag_key = 'new-checkout' AND version = 41
  RETURNING tenant_id, env_id, flag_key, version, fallthrough),
e AS (
  UPDATE environments SET env_version = env_version + 1      -- row lock orders changes
   WHERE (tenant_id, env_id) = (SELECT tenant_id, env_id FROM f)
  RETURNING env_version)
INSERT INTO change_log (tenant_id, env_id, env_version, flag_key, flag_version, actor, after)
SELECT f.tenant_id, f.env_id, e.env_version, f.flag_key, f.version, 'alice', f.fallthrough
  FROM f, e
RETURNING env_version, flag_version;
COMMIT;`,
      note: 'The change, the per-environment sequence number and the audit row commit together; a relay process tails <code>change_log</code> (or CDC) to build snapshots and patches. Row-level security only applies to roles that do not own the table (or use <code>FORCE ROW LEVEL SECURITY</code>), and the app must <code>SET app.tenant_id</code> per transaction.'
    },
    {
      title: 'Spring Boot 3: SSE stream with versioned patches and resume', lang: 'java',
      code: `@RestController
public class FlagStreamController {
  public record Patch(long envVersion, String flagKey, long version, String json) {}
  private final Map<String, Set<SseEmitter>> subs = new ConcurrentHashMap<>();
  private final SnapshotStore snapshots;       // full ruleset per env + recent patches
  public FlagStreamController(SnapshotStore s) { this.snapshots = s; }

  @GetMapping(path = "/sdk/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter stream(@RequestHeader("Authorization") String sdkKey,
      @RequestHeader(value = "Last-Event-ID", required = false) Long lastSeen) throws IOException {
    String env = snapshots.envForKey(sdkKey);    // key is scoped to one tenant env
    SseEmitter em = new SseEmitter(0L);          // no server-side timeout
    List<Patch> missed = lastSeen == null ? null : snapshots.patchesSince(env, lastSeen);
    if (missed == null) {                        // new client or gap too old: full put
      var snap = snapshots.latest(env);
      em.send(SseEmitter.event().name("put").id(Long.toString(snap.envVersion())).data(snap.json()));
    } else {
      for (Patch p : missed) send(em, p);
    }
    Set<SseEmitter> set = subs.computeIfAbsent(env, k -> ConcurrentHashMap.newKeySet());
    set.add(em);
    em.onCompletion(() -> set.remove(em));
    em.onError(e -> set.remove(em));
    return em;
  }

  @EventListener                                 // fired by the change-log consumer
  public void onPatch(PatchEvent ev) {
    subs.getOrDefault(ev.env(), Set.of()).forEach(em -> {
      try { send(em, ev.patch()); } catch (IOException e) { em.completeWithError(e); }
    });
  }

  private static void send(SseEmitter em, Patch p) throws IOException {
    em.send(SseEmitter.event().name("patch").id(Long.toString(p.envVersion())).data(p.json()));
  }
}`,
      note: 'Sketch for a single node: in production each node subscribes only to the environments its clients use, sends from per-tenant queues off the consumer thread, and sends a heartbeat comment every ~30 s so proxies keep the connection. <code>SnapshotStore</code> and <code>PatchEvent</code> are your own types; <code>patchesSince</code> returns <code>null</code> when the gap is older than the kept history.'
    },
    {
      title: 'Python: SDK-side evaluation with sticky bucketing', lang: 'python',
      code: `import hashlib

def bucket(flag_key: str, salt: str, user_key: str) -> int:
    """0..99_999, LaunchDarkly-style: SHA-1, first 15 hex digits."""
    h = hashlib.sha1(f"{flag_key}.{salt}.{user_key}".encode()).hexdigest()[:15]
    return int(int(h, 16) / 0xFFFFFFFFFFFFFFF * 100_000)

def evaluate(flags: dict, key: str, ctx: dict, default):
    f = flags.get(key)
    if f is None:
        return default, "FLAG_NOT_FOUND"
    if not f["on"]:
        return f["off"], "OFF"
    for p in f.get("prereqs", []):
        if evaluate(flags, p["key"], ctx, None)[0] != p["value"]:
            return f["off"], "PREREQUISITE_FAILED"
    if ctx["key"] in f.get("targets", {}):
        return f["targets"][ctx["key"]], "TARGET_MATCH"
    for i, r in enumerate(f.get("rules", [])):          # first match wins
        if ctx.get(r["attr"]) in r["values"]:
            return r["serve"], f"RULE_MATCH:{i}"
    pct = f["rollout_pct"]                              # fallthrough
    on = bucket(key, f["salt"], ctx["key"]) < pct * 1000
    return on, "FALLTHROUGH"

def apply_patch(flags: dict, key: str, new: dict) -> bool:
    old = flags.get(key)
    if old and old["version"] >= new["version"]:
        return False                                    # stale or duplicate
    flags[key] = new
    return True

if __name__ == "__main__":
    users = [f"user-{i}" for i in range(10_000)]
    on10 = {u for u in users if bucket("new-checkout", "s1", u) < 10_000}
    on20 = {u for u in users if bucket("new-checkout", "s1", u) < 20_000}
    print(len(on10), len(on20), on10 <= on20)           # ~1000 ~2000 True`,
      note: 'Prerequisites must be checked for cycles when a flag is saved; here the recursion trusts that. Real SDKs also support segments, multiple clauses per rule, operators (semver, regex, dates) and weighted multi-variation rollouts.'
    }
  ],

  related: ['api-gateway', 'lock-manager', 'distributed-cache', 'notifications', 'rate-limiter', 'observability']
});

/* knobs diagram = architecture + an optional local snapshot store next to the SDK */
(function () {
  const d = SD.data;
  const a = d.architecture;
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes.concat([{ id: 'disk', label: 'Local snapshot', sub: 'last-known rules', kind: 'store', wide: [890, 410], tall: [70, 550], tip: 'The SDK (or relay) persists the last ruleset it saw, so a restart during an outage still has rules.' }]),
    edges: a.edges.concat([{ from: 'srv', to: 'disk' }])
  };
})();
