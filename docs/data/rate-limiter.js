SD.register({
  slug: 'rate-limiter',
  domain: 1,
  title: 'Distributed Rate Limiter',
  examples: 'Stripe, Cloudflare, Envoy',
  tagline: 'Decide in well under a millisecond whether a request may pass, using <b>one shared count per client</b> across hundreds of gateway instances, and stay up when the counter store does not.',
  tldr: {
    problem: 'One noisy client, a retry storm or a scraper can eat the capacity everyone else needs. Each gateway instance sees only a slice of the traffic, so it cannot count alone.',
    idea: 'Keep a tiny per-key state (a <b>token bucket</b> or <b>two window counters</b>) in a shared <b>Redis</b>, and update it with one <b>atomic Lua script</b> per request. Reject with <code>429</code> + <code>Retry-After</code>.',
    insight: 'The limiter is a <i>protection</i> layer, not a source of truth. When Redis fails, most APIs <b>fail open</b>: a few seconds without limits beats a full outage.',
    numbers: [
      { v: '4', l: 'limiter types Stripe runs in production (Stripe, 2017)' },
      { v: '0.003%', l: 'wrong decisions of sliding-window counter vs exact (Cloudflare, 2017)' },
      { v: '2 numbers', l: 'state per key for a token bucket: tokens + last refill time' }
    ]
  },

  requirements: {
    functional: [
      'Limit by API key, user, IP or route (and combinations)',
      'Different limits per plan / endpoint, changed without a deploy',
      'Allow short bursts, enforce a sustained rate',
      'Return <code>429</code> with <code>Retry-After</code> and remaining-quota headers',
      'Concurrency limits (requests in flight), not only rate',
      'Shadow mode: log would-be rejections before enforcing'
    ],
    nonFunctional: [
      'Adds ≲ 1 ms at p99 to each request',
      'Hundreds of thousands of decisions/s',
      'Accurate across all gateway instances (shared state)',
      'Limiter failure must not take the API down',
      'Hot keys must not overload one counter shard',
      'Config changes take effect in seconds'
    ],
    outOfScope: ['Billing / monthly quotas (use a metering pipeline)', 'Bot detection and WAF rules', 'Volumetric DDoS (handled at the network edge)']
  },

  calculator: {
    inputs: [
      { id: 'rps', label: 'Peak requests / second (all gateways)', min: 1000, max: 5000000, value: 200000, log: true },
      { id: 'keys', label: 'Active keys (API keys / users) in a window', min: 1000, max: 20000000, value: 1000000, log: true },
      { id: 'limit', label: 'Limit per key (requests / minute)', min: 10, max: 10000, value: 600, log: true },
      { id: 'gws', label: 'Gateway instances', min: 1, max: 500, value: 50, log: true },
      { id: 'shardops', label: 'Ops/s one Redis shard handles (Lua)', min: 20000, max: 200000, step: 10000, value: 80000 }
    ],
    outputs: [
      { label: 'Redis script calls / second (1 per request)', f: (v) => v.rps },
      { label: 'Redis primaries needed', fmt: 'raw', f: (v) => String(Math.max(1, Math.ceil(v.rps / v.shardops))) },
      { label: 'Token-bucket state (~100 B/key incl. overhead)', fmt: 'bytes', f: (v) => v.keys * 100 },
      { label: 'Sliding-log state, worst case (~40 B/entry)', fmt: 'bytes', f: (v) => v.keys * v.limit * 40 },
      { label: 'Requests/min one key could get if each gateway counted alone', f: (v) => v.limit * v.gws },
      { label: 'Per-gateway share if you split the limit evenly', fmt: 'raw', f: (v) => (v.limit / v.gws).toFixed(v.limit / v.gws < 10 ? 1 : 0) + ' req/min' }
    ],
    note: 'Per-shard throughput and bytes per key are <em>estimates</em> (Lua calls are slower than plain GET/SET; measure your own). The point: token buckets and window counters stay tiny, a <b>sliding log</b> grows with the limit, and <b>local-only counting</b> multiplies the limit by the number of gateways.'
  },

  api: [
    { m: 'RPC', p: 'ShouldRateLimit(domain, descriptors[])', d: 'Called by the gateway on every request (Envoy\'s global rate-limit API works this way). Returns <code>OK</code> or <code>OVER_LIMIT</code> plus remaining quota.' },
    { m: 'GET', p: '/v1/charges  →  429 Too Many Requests', d: 'Rejected request. Headers: <code>Retry-After: 2</code> and remaining-quota headers. The IETF <code>RateLimit-Policy</code> / <code>RateLimit</code> fields are still a draft (2026).' },
    { m: 'PUT', p: '/admin/limits/{plan}/{route}', d: 'Change a rule, e.g. <code>{rate: 100, per: "s", burst: 200}</code>. Pushed to limiters within seconds.' },
    { m: 'POST', p: '/admin/limits/{rule}/shadow', d: 'Run a new rule in <b>shadow mode</b>: count and log, but do not reject.' },
    { m: 'SQL', p: 'EVALSHA token_bucket 1 rl:{key} cap rate cost', d: 'The hot path: one round trip, atomic read-modify-write inside Redis.' }
  ],
  dataModel: [
    { name: 'rl:{api_key}', store: 'Redis hash (token bucket)', fields: [['key', 'rl:{api_key}', 'pk'], ['tokens', 'float'], ['ts', 'last refill (s)'], ['TTL', '≈ 2 × cap / rate']], note: 'Refilled lazily on each call: <code>tokens += (now − ts) × rate</code>. Idle keys expire.' },
    { name: 'rl:{key}:{window}', store: 'Redis string (window counter)', fields: [['key', 'rl:{key}:{minute}', 'pk'], ['count', 'int'], ['TTL', '2 × window']], note: 'Sliding-window counter reads this and the previous window: two integers per key.' },
    { name: 'limit_rules', store: 'Postgres → pushed to limiters', fields: [['rule_id', 'uuid', 'pk'], ['descriptor', 'plan/route/ip', 'idx'], ['rate, unit', 'int, s|min|h|day'], ['burst', 'int'], ['mode', 'enforce|shadow']], note: 'Small, read-mostly. Cached in each limiter and reloaded on change.' }
  ],

  architecture: {
    title: 'Distributed rate limiter architecture',
    nodes: [
      { id: 'cli', label: 'Clients', sub: 'API keys · IPs', kind: 'client', wide: [90, 165], tall: [70, 0], tip: 'Mobile apps, partner servers, scripts. Some retry aggressively, which is exactly what the limiter protects against.' },
      { id: 'gw', label: 'API gateway', sub: 'TLS · auth · routing', kind: 'edge', wide: [280, 165], tall: [210, 0], tip: 'Authenticates the caller first, so the limiter can key on a trusted API key or user id rather than a spoofable header.' },
      { id: 'cfg', label: 'Limit config', sub: 'rules per plan/route', kind: 'store', wide: [470, 50], tall: [350, 0], tip: 'Rules such as "free plan: 100 req/s, burst 200". Pushed to limiters and cached in memory, never read per request.' },
      { id: 'lim', label: 'Limiter middleware', sub: 'token bucket check', kind: 'service', wide: [470, 165], tall: [210, 105], tip: 'Builds the key (api_key + route), runs one atomic script in Redis, adds headers, and returns 429 when the bucket is empty.' },
      { id: 'local', label: 'Local bucket', sub: 'in-process fallback', kind: 'cache', wide: [280, 280], tall: [70, 105], tip: 'An in-memory bucket per key. Used as a pre-check for hot keys, and as a coarse fallback (limit ÷ instances) when Redis is unreachable.' },
      { id: 'obs', label: 'Metrics', sub: '429 rate · Redis p99', kind: 'external', wide: [660, 50], tall: [350, 105], tip: 'Rejections per rule, limiter latency and Redis errors. Shadow-mode rules report here before they are enforced.' },
      { id: 'redis', label: 'Redis cluster', sub: 'Lua: atomic update', kind: 'cache', wide: [660, 165], tall: [210, 210], tip: 'Holds one tiny state per key, sharded by key hash. The Lua script makes read-refill-decrement atomic, so two gateways cannot both spend the last token.' },
      { id: 'peer', label: 'Region B counters', sub: 'async count sync', kind: 'cache', wide: [860, 165], tall: [350, 210], tip: 'Each region limits locally for speed. Counts are exchanged asynchronously, so a global limit is approximate during the sync delay.' },
      { id: 'shed', label: 'Load shedder', sub: 'fleet / worker level', kind: 'compute', wide: [470, 280], tall: [70, 210], tip: 'Not per client: it drops low-priority traffic when the whole fleet is overloaded (Stripe\'s fleet-usage and worker-utilization shedders).' },
      { id: 'svc', label: 'API services', sub: 'business logic', kind: 'service', wide: [660, 280], tall: [70, 315], tip: 'Only sees traffic that passed both the per-client limiter and the global load shedder.' },
      { id: 'db', label: 'Primary DB', sub: 'Postgres', kind: 'store', wide: [860, 280], tall: [210, 315], tip: 'The scarce resource the whole layer exists to protect.' }
    ],
    edges: [
      { from: 'cli', to: 'gw', bidi: true },
      { from: 'gw', to: 'lim', bidi: true },
      { from: 'cfg', to: 'lim', dashed: true },
      { from: 'lim', to: 'redis' },
      { from: 'lim', to: 'local' },
      { from: 'lim', to: 'obs', dashed: true },
      { from: 'redis', to: 'peer', bidi: true, dashed: true },
      { from: 'lim', to: 'shed' },
      { from: 'shed', to: 'svc' },
      { from: 'svc', to: 'db' }
    ]
  },

  scenarios: [
    {
      id: 'allow', title: 'Request allowed', tone: 'ok',
      steps: [
        { text: 'A client calls the API. The gateway terminates TLS and <b>authenticates</b> the key first, so the limit is keyed on something the client cannot fake.', flow: ['cli>gw', 'gw>lim'] },
        { text: 'The limiter builds the key <code>rl:{key_42}</code> and runs <b>one Lua script</b> with <code>EVALSHA</code>: refill tokens for the elapsed time, then take one. One round trip, atomic.', flow: ['lim>redis'], badges: { redis: '7 → 6 tokens' } },
        { text: 'Tokens were left, so the request passes. The limiter adds remaining-quota headers and records a metric.', flow: ['lim>obs', 'lim>shed'], badges: { lim: ['allow', 'ok'] }, tone: 'ok' },
        { text: 'The fleet-level <b>load shedder</b> sees normal load and lets it through to the service.', flow: ['shed>svc', 'svc>db'], ok: ['svc'], tone: 'ok' }
      ]
    },
    {
      id: 'burst', title: 'Burst → 429 + Retry-After', tone: 'warn',
      steps: [
        { text: 'A client\'s retry loop fires <b>50 requests in 200 ms</b>. Its bucket has capacity 20 and refills at 10 tokens/s.', flow: [['cli>gw', 'cli>gw'], 'gw>lim'], badges: { cli: ['50 req', 'warn'] } },
        { text: 'The first 20 drain the bucket. The burst allowance is working as designed: short spikes are fine.', flow: ['lim>redis'], badges: { redis: '20 → 0 tokens' } },
        { text: 'The next 30 find an empty bucket. The script also returns <b>when the next token arrives</b> (1 / rate = 100 ms).', flow: ['lim>redis'], warn: ['redis'], badges: { redis: ['0 tokens', 'warn'] }, tone: 'warn' },
        { text: 'The limiter answers <code>429 Too Many Requests</code> with <code>Retry-After</code>. The services never see these 30 calls.', flow: ['lim>gw', 'gw>cli'], badges: { cli: ['429 · Retry-After: 1', 'warn'] }, tone: 'warn' },
        { text: 'A well-behaved client backs off with <b>exponential backoff + jitter</b>. A second later its bucket holds 10 tokens again.', nodes: ['cli', 'redis'], ok: ['redis'], badges: { redis: ['+10 tokens/s', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'redis-down', title: 'Redis shard down: fail open or closed?', tone: 'err',
      steps: [
        { text: 'The Redis primary that owns this key\'s slot dies. Script calls start to time out.', flow: ['lim>redis'], err: ['redis'], badges: { redis: ['timeout', 'err'] }, tone: 'err' },
        { text: 'The limiter uses a <b>short timeout</b> (a few ms) and a circuit breaker. It must not wait on Redis, or every API call inherits the outage.', nodes: ['lim'], warn: ['lim'], badges: { lim: ['breaker open', 'warn'] }, tone: 'warn' },
        { text: '<b>Fail open</b> (the usual choice): fall back to a coarse <b>local bucket</b> (limit ÷ instances) or allow all. Stripe says to build limiters so they can be switched off safely.', flow: ['lim>local', 'lim>shed', 'shed>svc'], ok: ['local'], badges: { local: ['local only', 'ok'] }, tone: 'ok' },
        { text: '<b>Fail closed</b> only for limits that guard money or abuse, e.g. login attempts or SMS sends. There, rejecting is safer than allowing.', flow: ['lim>gw', 'gw>cli'], badges: { cli: ['503 / 429', 'err'] }, tone: 'err' },
        { text: 'Redis Cluster promotes a replica in seconds. Counters for that slot may restart from zero, which briefly <b>under-counts</b>. That is acceptable for a protection layer.', nodes: ['redis'], ok: ['redis'], badges: { redis: ['replica promoted', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'hot-key', title: 'Hot key: one tenant floods one shard', tone: 'warn',
      steps: [
        { text: 'One big tenant sends <b>40% of all traffic</b> with one API key. Every call hits the same Redis key and therefore the <b>same shard</b>.', flow: [['cli>gw', 'cli>gw'], 'gw>lim', 'lim>redis'], warn: ['redis'], badges: { redis: ['hot shard', 'warn'] }, tone: 'warn' },
        { text: 'Fix 1: a <b>local pre-check</b>. Each gateway keeps a small in-memory bucket for that key and only asks Redis for tokens in batches (e.g. take 50 at a time).', flow: ['lim>local'], badges: { local: 'batch of 50' } },
        { text: 'Redis now sees one call per batch instead of one per request. Accuracy drops slightly (unused batch tokens are lost), load drops 50×.', flow: ['lim>redis'], ok: ['redis'], badges: { redis: ['÷50 calls', 'ok'] }, tone: 'ok' },
        { text: 'Fix 2: if the tenant is legitimately huge, give it its own limit and split the key (<code>rl:{t}:0..7</code>), each holding 1/8 of the rate.', nodes: ['cfg', 'lim'], badges: { cfg: 'split ×8' }, tone: 'ok' }
      ]
    },
    {
      id: 'multi-region', title: 'One limit across regions', tone: 'info',
      steps: [
        { text: 'A customer\'s limit is 1,000 req/s <b>globally</b>, but traffic arrives in two regions. A cross-region Redis call would add tens of milliseconds to every request.', flow: ['cli>gw', 'gw>lim', 'lim>redis'], badges: { redis: 'region A' } },
        { text: 'Each region enforces locally against its own Redis, starting from a share of the limit (e.g. by recent traffic split).', flow: ['lim>redis'], badges: { redis: 'A: 600/s', peer: 'B: 400/s' } },
        { text: 'Regions exchange counts <b>asynchronously</b> every second or so and rebalance the shares.', flow: ['redis>peer', 'peer>redis'], badges: { peer: 'sync' } },
        { text: 'Trade-off: within one sync interval a client can exceed the global limit a little. For protection limits, <b>fast and approximately right</b> beats slow and exact.', nodes: ['redis', 'peer'], warn: ['peer'], badges: { peer: ['≈ +sync drift', 'warn'] }, tone: 'warn' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick an algorithm, where counters live and what happens when Redis fails. The limiter node shows the algorithm; the meters show the cost.',
    controls: [
      { id: 'algo', label: 'Algorithm', type: 'seg', value: 'tb', options: [
        { v: 'tb', l: 'Token bucket' }, { v: 'lb', l: 'Leaky bucket' }, { v: 'fw', l: 'Fixed window' }, { v: 'sl', l: 'Sliding log' }, { v: 'sw', l: 'Sliding-window counter' }] },
      { id: 'where', label: 'Where counters live', type: 'seg', value: 'central', options: [
        { v: 'local', l: 'Local (in-process)' }, { v: 'central', l: 'Central Redis' }, { v: 'hybrid', l: 'Local + async sync' }] },
      { id: 'fail', label: 'If Redis fails', type: 'seg', value: 'open', options: [
        { v: 'open', l: 'Fail open' }, { v: 'closed', l: 'Fail closed' }] },
      { id: 'gws', label: 'Gateway instances', type: 'range', min: 1, max: 100, step: 1, value: 20 }
    ],
    evaluate(s) {
      const A = {
        tb: { name: 'Token bucket', sub: 'tokens + refill', mem: '2 numbers', memS: 0.9, burst: 'up to bucket size (by design)', burstS: 0.7, acc: 0.92 },
        lb: { name: 'Leaky bucket', sub: 'queue drains at rate', mem: '2 numbers (+ queue)', memS: 0.8, burst: 'none: output is smoothed', burstS: 0.95, acc: 0.92 },
        fw: { name: 'Fixed window', sub: 'count per minute', mem: '1 counter', memS: 0.95, burst: 'up to 2× limit at the edge', burstS: 0.2, acc: 0.5 },
        sl: { name: 'Sliding log', sub: 'timestamps in ZSET', mem: '1 entry per request', memS: 0.15, burst: 'none: exact', burstS: 0.95, acc: 1 },
        sw: { name: 'Sliding-window ctr', sub: 'prev × weight + curr', mem: '2 counters', memS: 0.9, burst: '≈ none (weighted)', burstS: 0.85, acc: 0.9 }
      }[s.algo];
      const n = s.gws;
      let lat, latS, acc, accS, ops, opsS, fail, failS;
      if (s.where === 'local') {
        lat = '≈ 0 (in-process)'; latS = 0.98;
        acc = n === 1 ? 'exact (1 instance)' : 'up to ' + n + '× the limit'; accS = n === 1 ? A.acc : Math.max(0.05, 0.6 / n);
        ops = '0 (no Redis)'; opsS = 1;
        fail = 'not affected'; failS = 0.95;
      } else if (s.where === 'central') {
        lat = '+1 Redis RTT (~0.3–1 ms)'; latS = 0.65;
        acc = { tb: 'exact', lb: 'exact', fw: 'exact count, bad edges', sl: 'exact', sw: '≈ exact (Cloudflare: 0.003% wrong)' }[s.algo]; accS = A.acc;
        ops = s.algo === 'sl' ? '1 script (ZADD+ZREMRANGE)' : '1 script call'; opsS = s.algo === 'sl' ? 0.5 : 0.7;
        fail = s.fail === 'open' ? 'traffic flows unlimited' : 'every request rejected'; failS = s.fail === 'open' ? 0.75 : 0.1;
      } else {
        lat = '≈ 0 (sync off the hot path)'; latS = 0.95;
        acc = 'over by ≈ rate × sync interval'; accS = Math.min(A.acc, 0.65);
        ops = '1 batched sync / key / interval'; opsS = 0.9;
        fail = s.fail === 'open' ? 'keeps local counts' : 'rejects after sync loss'; failS = s.fail === 'open' ? 0.85 : 0.3;
      }
      const metrics = [
        { k: 'Added latency', v: lat, s: latS },
        { k: 'Global accuracy', v: acc, s: accS },
        { k: 'Boundary burst', v: A.burst, s: A.burstS },
        { k: 'Memory per key', v: A.mem, s: A.memS },
        { k: 'If Redis fails', v: fail, s: failS },
        { k: 'Redis work / request', v: ops, s: opsS }
      ];
      const notes = [];
      if (s.algo === 'fw') notes.push('Fixed window: a client sends the full limit at 0:59 and again at 1:00, so <b>2× the limit passes in about a second</b>.');
      if (s.algo === 'sl') notes.push('A sliding log stores every timestamp (e.g. a sorted set). With a 10,000/min limit that is up to 10,000 entries per key. Exact, but costly.');
      if (s.algo === 'sw') notes.push('Estimate = <code>prev × (1 − elapsed/window) + curr</code>. It assumes the previous window\'s requests were spread evenly. Cloudflare measured 0.003% wrong decisions on 400M requests (2017).');
      if (s.algo === 'tb') notes.push('Two parameters: <b>rate</b> (sustained) and <b>capacity</b> (burst). Stripe uses token buckets for its request-rate limiter.');
      if (s.algo === 'lb') notes.push('A leaky bucket <i>queues</i> requests and releases them at a fixed rate. Good for smoothing calls to a fragile downstream; it adds waiting time instead of rejecting.');
      if (s.where === 'local' && n > 1) notes.push('Each of the ' + n + ' instances counts alone. Dividing the limit by ' + n + ' only works if the load balancer spreads each client evenly; sticky or uneven routing causes false 429s.');
      if (s.where === 'hybrid') notes.push('Each instance spends from a local budget and syncs counts in batches. Envoy uses a similar split: a local token bucket filter plus an optional global rate-limit service.');
      if (s.fail === 'closed' && s.where !== 'local') notes.push('Fail closed turns a Redis incident into an API outage. Reserve it for abuse-sensitive limits (logins, OTP sends).');
      let verdict;
      if (s.where === 'local' && n > 1) verdict = '⚠ <b>Not a global limit.</b> With ' + n + ' instances, one client can get up to ' + n + '× its quota. Fine as a coarse shield, wrong for quotas.';
      else if (s.fail === 'closed' && s.where === 'central') verdict = '⚠ <b>Redis becomes a hard dependency of every request.</b> A cache blip now takes the whole API down.';
      else if (s.algo === 'fw') verdict = '⚠ <b>Cheap but leaky at window edges.</b> Use a sliding-window counter for the same memory and far better accuracy.';
      else if (s.algo === 'sl') verdict = '👍 <b>Exact</b>, but memory grows with the limit. Use it for small limits (e.g. 5 logins / 15 min).';
      else if (s.algo === 'tb' && s.where === 'central') verdict = '✅ <b>Stripe-style:</b> per-key token bucket in Redis, updated atomically, failing open. A strong default.';
      else if (s.algo === 'sw' && s.where !== 'local') verdict = '✅ <b>Cloudflare-style:</b> two counters per key, near-exact, tiny memory.';
      else if (s.where === 'hybrid') verdict = '👍 <b>Fast and nearly right.</b> Good for very high QPS or multi-region, if a small overshoot is acceptable.';
      else verdict = '👍 Workable. Check the meters for the trade-off you are paying.';
      const flow = ['cli>gw', 'gw>lim'].concat(s.where === 'local' ? ['lim>local'] : s.where === 'central' ? ['lim>redis'] : [['lim>local', 'lim>redis']]).concat(['lim>shed', 'shed>svc']);
      return {
        metrics, verdict, notes, flow,
        labels: { lim: { label: A.name, sub: A.sub } },
        hide: s.where === 'local' ? ['redis', 'peer'] : s.where === 'central' ? ['peer'] : [],
        hot: s.where === 'local' ? ['local'] : s.where === 'hybrid' ? ['local', 'redis'] : ['redis'],
        warn: (s.where === 'local' && n > 1) || s.algo === 'fw' ? ['lim'] : [],
        err: s.fail === 'closed' && s.where === 'central' ? ['redis'] : [],
        badges: s.where === 'local' ? { local: [n + ' separate counts', n > 1 ? 'warn' : 'ok'] } : { redis: [s.fail === 'open' ? 'fail open' : 'fail closed', s.fail === 'open' ? 'ok' : 'err'] }
      };
    }
  },

  widget: {
    title: 'Four algorithms, one request stream',
    caption: 'Every request you send goes to <b>all four limiters at once</b>. Green ticks pass, red ticks get a 429. Try <b>Boundary attack</b>: the fixed window lets through twice the limit across the window edge, the sliding algorithms hold the line, and the token bucket allows only its burst plus what refilled.'
  },

  realWorld: {
    intro: 'Rate limiting is published unusually openly. These are primary sources from the companies that run it at scale.',
    timeline: [
      { when: '2017', who: 'Stripe', title: 'Four limiters, token buckets in Redis', text: 'Stripe runs a <b>request-rate limiter</b>, a <b>concurrent-requests limiter</b>, a <b>fleet-usage load shedder</b> (reserves capacity for critical requests such as charges) and a <b>worker-utilization load shedder</b>. Rate limiters use a token bucket per user, stored in Redis.', src: 0 },
      { when: '2017', who: 'Stripe', title: 'Example code published', text: 'Paul Tarjan, the post\'s author, published example code for the limiter types in a companion gist, a useful reference for the Redis token-bucket logic.', src: 1 },
      { when: '2017', who: 'Cloudflare', title: 'Sliding-window counter at the edge', text: 'Cloudflare keeps <b>two counters per key</b> (this window and the previous one) and weights the previous one by how much of it still overlaps. On <b>400 million requests from 270,000 sources</b>, only <b>0.003%</b> were wrongly allowed or limited.', src: 2 },
      { when: 'Open source', who: 'Lyft → Envoy', title: 'Global rate-limit service', text: 'Lyft open-sourced a Go service backed by Redis that answers <code>ShouldRateLimit</code> for <b>domains and descriptors</b> (e.g. <code>remote_address</code>, <code>path</code>). It lives on as <code>envoyproxy/ratelimit</code>, with per second/minute/hour/day units and a shadow mode.', src: 3 },
      { when: '2021', who: 'GitHub', title: 'Memcached → sharded, replicated Redis', text: 'GitHub moved its API limiter off a shared Memcached, where evictions could drop live counters. Keys are sharded by the app across Redis primaries with replicas. Because replicas do not expire keys on their own, GitHub stores the <b>reset time</b> itself instead of trusting TTLs.', src: 4 },
      { when: '2026', who: 'IETF', title: 'Standard headers, still a draft', text: 'The HTTPAPI working group\'s <code>RateLimit-Policy</code> and <code>RateLimit</code> header fields are still an Internet-Draft. <code>Retry-After</code> remains the one header every client understands.', src: 5 }
    ],
    lessons: [
      '<span>Separate <b>per-client limits</b> (fairness) from <b>load shedding</b> (protect the fleet). You need both.</span>',
      '<span>Make the check <b>one atomic round trip</b>: a Lua script, not GET then SET.</span>',
      '<span>Launch new limits in <b>shadow mode</b> and watch who would have been blocked.</span>',
      '<span>Decide the <b>failure mode</b> up front. Most limits fail open.</span>'
    ],
    sources: [
      { title: 'Scaling your API with rate limiters', url: 'https://stripe.com/blog/rate-limiters', pub: 'Stripe, 2017' },
      { title: 'Stripe rate limiter examples (gist)', url: 'https://gist.github.com/ptarjan/e38f45f2dfe601419ca3af937fff574d', pub: 'Paul Tarjan, 2017' },
      { title: 'How we built rate limiting capable of scaling to millions of domains', url: 'https://blog.cloudflare.com/counting-things-a-lot-of-different-things/', pub: 'Cloudflare, 2017' },
      { title: 'envoyproxy/ratelimit', url: 'https://github.com/envoyproxy/ratelimit', pub: 'Envoy (originally Lyft)' },
      { title: 'How we scaled the GitHub API with a sharded, replicated rate limiter in Redis', url: 'https://github.blog/engineering/infrastructure/how-we-scaled-github-api-sharded-replicated-rate-limiter-redis/', pub: 'GitHub, 2021' },
      { title: 'RateLimit header fields for HTTP (draft-ietf-httpapi-ratelimit-headers)', url: 'https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/', pub: 'IETF HTTPAPI WG' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Algorithm', '<b>Token bucket</b>: rate + burst, 2 numbers', '<b>Sliding-window counter</b>: smooth, 2 counters', 'Token bucket for APIs that should allow bursts; window counter for "N per minute" rules'],
      ['Exactness', '<b>Sliding log</b>: exact, memory ∝ limit', '<b>Fixed window</b>: 1 counter, 2× edge burst', 'Log only for small limits (logins); never plain fixed windows for strict quotas'],
      ['Counter location', '<b>Central Redis</b>: accurate, +1 RTT', '<b>Local + sync</b>: ~0 latency, small overshoot', 'Central by default; local+sync for hot keys or multi-region'],
      ['Failure mode', '<b>Fail open</b>: API stays up', '<b>Fail closed</b>: abuse stays blocked', 'Open for general traffic; closed for login, OTP, payouts'],
      ['Granularity', '<b>Per API key / user</b>: fair, needs auth first', '<b>Per IP</b>: works before auth', 'IP limits at the edge for anonymous traffic; key limits after auth. NAT means one IP can be many users'],
      ['Reject vs queue', '<b>429 now</b>: client decides', '<b>Queue (leaky bucket)</b>: smooth, adds latency', 'Reject for public APIs; queue for outbound calls to a fragile partner']
    ]
  },
  failures: [
    { f: 'Redis primary dies', detect: 'Script timeouts, breaker opens', fix: 'Fail open to a local bucket; Redis Cluster promotes a replica; counters for that slot restart (brief under-count).' },
    { f: 'Race: two gateways spend the last token', detect: 'Over-limit traffic in audits', fix: 'Do read-refill-decrement inside one Lua script (atomic in Redis). Never GET then SET from the app.' },
    { f: 'Hot key overloads one shard', detect: 'One shard\'s CPU / ops far above others', fix: 'Local pre-check with batched token grabs; split the key into N sub-keys with rate/N each.' },
    { f: 'Clock skew across gateways', detect: 'Buckets refilling too fast or slow', fix: 'Use Redis server time (<code>TIME</code> inside the script), not each app server\'s clock.' },
    { f: 'Retry storm after 429s', detect: 'Rejected requests climbing with no new users', fix: '<code>Retry-After</code>, client backoff with jitter, and a concurrency limit so slow requests cannot pile up.' },
    { f: 'Bad rule blocks a big customer', detect: '429 spike for one plan right after a config push', fix: 'Shadow mode first, per-rule kill switch, and alerts on rejections per rule.' }
  ],

  interview: [
    { q: 'Why use a Lua script instead of GET then SET?', a: '<p>GET-then-SET is a <b>read-modify-write race</b>. Two gateways both read "1 token left", both allow, both write 0. The limit leaks under exactly the load it exists for.</p><p>Redis runs a Lua script <b>atomically</b>: no other command runs in between. Refill, check and decrement happen in one round trip.</p>', fu: 'Could you use MULTI/EXEC instead? (Only with WATCH and retries, since you need to read before deciding. Lua is simpler and faster.)', lvl: 'core' },
    { q: 'What is the fixed-window boundary problem?', a: '<p>With "100 per minute" in fixed windows, a client sends 100 at 0:59.9 and 100 at 1:00.1. Both windows are within limit, but <b>200 requests pass in 0.2 s</b>.</p><p>Fixes: a <b>sliding log</b> (exact, more memory) or a <b>sliding-window counter</b> that weights the previous window.</p>', lvl: 'core' },
    { q: 'Explain the token bucket. What do the two parameters mean?', a: '<p>A bucket holds up to <b>capacity</b> tokens and refills at <b>rate</b> tokens/second. Each request takes one token, or is rejected if none are left.</p><ul><li><b>rate</b> is the sustained throughput.</li><li><b>capacity</b> is the largest burst after idling.</li></ul><p>You do not need a timer: store <code>tokens</code> and <code>last_ts</code>, and refill lazily on each call.</p>', lvl: 'core' },
    { q: 'Should you limit per user, per IP or per API key?', a: '<p>Use the most <b>trustworthy identity</b> you have at that layer.</p><ul><li><b>Per IP</b> at the edge, before auth, to stop anonymous floods. Beware NAT and mobile carriers: one IP can be thousands of users.</li><li><b>Per API key / user</b> after authentication, for fairness and plan quotas.</li><li>Often both, plus per-route limits for expensive endpoints.</li></ul>', lvl: 'core' },
    { q: 'How do you rate limit across regions?', a: '<p>A cross-region call per request is too slow. Instead, each region enforces <b>locally</b> against a share of the global limit and <b>syncs counts asynchronously</b>, rebalancing shares by recent traffic.</p><p>The cost is a small overshoot within one sync interval. If a limit must be exact globally (rare), route that tenant to a home region.</p>', lvl: 'deep' },
    { q: 'What is the difference between rate limiting and load shedding?', a: '<p><b>Rate limiting</b> is per client: "you have used your share". It protects fairness and keeps working at normal load.</p><p><b>Load shedding</b> is per server or fleet: "we are overloaded, drop the least important work". Stripe runs both: two rate limiters plus a fleet-usage shedder that reserves capacity for critical requests and a worker-utilization shedder.</p>', lvl: 'core' },
    { q: 'Which headers should a 429 response carry?', a: '<ul><li><code>Retry-After</code> (seconds or HTTP date): the standard header clients understand.</li><li>Remaining-quota headers. Many APIs use <code>X-RateLimit-Limit / Remaining / Reset</code>; the IETF draft defines <code>RateLimit-Policy</code> and <code>RateLimit</code> fields.</li><li>A machine-readable error body naming the limit that was hit.</li></ul>', lvl: 'core' },
    { q: 'Redis is down. Do you fail open or fail closed?', a: '<p>For most API limits, <b>fail open</b>: the limiter is protection, and blocking all traffic would turn a Redis incident into a full outage. Fall back to a coarse local bucket so you are not entirely unprotected.</p><p><b>Fail closed</b> where letting traffic through is worse than blocking it: login attempts, OTP or SMS sends, payouts.</p>', lvl: 'core' },
    { q: 'How does the sliding-window counter work, and how wrong can it be?', a: '<p>Keep counters for the current and previous fixed windows. Estimate the rolling count as <code>prev × (1 − elapsed/window) + curr</code>.</p><p>It assumes the previous window\'s requests were evenly spread, so it can be off when traffic was bunched. Cloudflare measured <b>0.003%</b> wrong decisions on 400M requests in 2017.</p>', lvl: 'deep' },
    { q: 'How do you handle a single very hot key?', a: '<p>All its requests land on one Redis shard. Options:</p><ul><li><b>Local pre-check with batching</b>: each gateway takes tokens from Redis in batches and spends them locally.</li><li><b>Split the key</b> into N sub-keys, each with rate/N, chosen at random.</li><li>Give the tenant a dedicated limit or its own shard.</li></ul>', lvl: 'deep' },
    { q: 'What is a concurrency limiter, and when do you need one?', a: '<p>It caps <b>requests in flight</b> per client instead of requests per second. Implement it as a counter incremented on start and decremented on finish (with a TTL or sorted set of request ids, so crashed requests do not leak slots).</p><p>You need it for <b>slow, expensive endpoints</b>: 10 req/s of 30-second report queries would still exhaust your workers.</p>', lvl: 'deep' },
    { q: 'Where should the limiter run: in the gateway or in each service?', a: '<p>Put coarse limits (IP, API key, global per route) in the <b>gateway</b>, so rejected traffic costs almost nothing. Put business-aware limits (e.g. "5 refunds per hour per merchant") in the <b>service</b> that understands them.</p><p>Both can share the same Redis and the same script.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Redis Lua: atomic token bucket', lang: 'lua',
      code: `-- KEYS[1] = bucket key, ARGV = capacity, refill_per_sec, cost
local cap  = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local t    = redis.call('TIME')                -- Redis clock, no app-server skew
local now  = tonumber(t[1]) + tonumber(t[2]) / 1e6

local s      = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(s[1]) or cap
local ts     = tonumber(s[2]) or now
tokens = math.min(cap, tokens + math.max(0, now - ts) * rate)  -- lazy refill

local allowed = 0
local retry_ms = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry_ms = math.ceil((cost - tokens) / rate * 1000)
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', KEYS[1], math.ceil(cap / rate) * 2)  -- idle keys vanish
return { allowed, math.floor(tokens), retry_ms }`,
      note: 'Calling <code>TIME</code> before a write is fine in Redis 5+ because scripts replicate their effects, not the script. Keep everything for one key in one slot.'
    },
    {
      title: 'Spring Boot 3: HandlerInterceptor that fails open', lang: 'java',
      code: `@Component
public class RateLimitInterceptor implements HandlerInterceptor {
  @SuppressWarnings("rawtypes")
  private static final RedisScript<List> BUCKET =
      RedisScript.of(new ClassPathResource("token_bucket.lua"), List.class);
  private final StringRedisTemplate redis;

  public RateLimitInterceptor(StringRedisTemplate redis) { this.redis = redis; }

  @Override
  public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object h) {
    String apiKey = req.getHeader("X-Api-Key");          // already authenticated upstream
    String key = "rl:{" + (apiKey != null ? apiKey : req.getRemoteAddr()) + "}";
    List<?> r;
    try {
      r = redis.execute(BUCKET, List.of(key), "20", "10", "1"); // cap, rate/s, cost
    } catch (DataAccessException e) {
      return true;                                       // fail open
    }
    res.setHeader("X-RateLimit-Remaining", String.valueOf(r.get(1)));
    if (((Long) r.get(0)) == 1L) return true;
    long retryMs = (Long) r.get(2);
    res.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
    res.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(Math.max(1, (retryMs + 999) / 1000)));
    return false;
  }
}

@Configuration
class WebConfig implements WebMvcConfigurer {
  private final RateLimitInterceptor limiter;
  WebConfig(RateLimitInterceptor limiter) { this.limiter = limiter; }
  @Override public void addInterceptors(InterceptorRegistry r) { r.addInterceptor(limiter); }
}`,
      note: 'Set a short Redis command timeout (e.g. <code>spring.data.redis.timeout=20ms</code>) so a slow Redis cannot stall requests. Bucket4j with its Redis backend is a ready-made alternative.'
    },
    {
      title: 'Python: sliding-window counter (Cloudflare formula)', lang: 'python',
      code: `import time
import redis

r = redis.Redis(decode_responses=True)

def allow(key: str, limit: int, window: int = 60) -> bool:
    now = time.time()
    cur = int(now // window)
    elapsed = now - cur * window
    k_cur, k_prev = f"rl:{{{key}}}:{cur}", f"rl:{{{key}}}:{cur - 1}"

    pipe = r.pipeline()            # MULTI/EXEC; both keys share the {key} slot
    pipe.incr(k_cur)
    pipe.expire(k_cur, window * 2)
    pipe.get(k_prev)
    curr, _, prev = pipe.execute()

    estimate = int(prev or 0) * (1 - elapsed / window) + curr
    return estimate <= limit`,
      note: 'This version also counts rejected calls, so a client that keeps hammering stays limited. To count only accepted calls, move the check and the INCR into one Lua script.'
    }
  ],

  related: ['api-gateway', 'distributed-cache', 'llm-gateway', 'cdn', 'payment-gateway', 'ticket-booking']
});
