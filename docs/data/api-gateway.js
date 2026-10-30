SD.register({
  slug: 'api-gateway',
  domain: 6,
  title: 'API Gateway',
  examples: 'Netflix Zuul, Envoy, Kong',
  tagline: 'One front door for hundreds of services. <b>TLS, auth, rate limits, routing and resilience</b> are applied once, in a few milliseconds, to every request.',
  tldr: {
    problem: 'Without a gateway, every client calls dozens of services directly. Each service re-implements TLS, auth, rate limiting and retries, and your internal topology leaks to the outside world.',
    idea: 'Put a <b>stateless, horizontally scaled proxy</b> at the edge. Every request runs through a <b>filter chain</b>: inbound filters (auth, limits) → route → proxy → outbound filters. Routes come from a <b>control plane</b>, and backend addresses come from <b>service discovery</b>.',
    insight: 'The gateway sits on <i>every</i> request\'s critical path. It must be <b>non-blocking</b>, add only milliseconds, keep no session state, and <b>fail fast</b> (timeouts, circuit breakers, load shedding) so that one slow backend cannot exhaust it.',
    numbers: [
      { v: '80+ · 1M+/s', l: 'Zuul 2 clusters · requests per second at Netflix (2018)' },
      { v: '10,000/s', l: 'AWS API Gateway default throttle per account per Region, burst 5,000 (AWS docs)' },
      { v: '200', l: 'Tomcat default max threads: the ceiling of a thread-per-request gateway node' }
    ]
  },

  requirements: {
    functional: [
      'Route by host, path, header or weight to backend services found via discovery',
      'Authenticate (JWT / OAuth2, API keys, mTLS) and do coarse authorization',
      'Rate limits and quotas per client, API key or tenant',
      'Transform requests and responses; translate protocols (REST ⇄ gRPC)',
      'Aggregate several backend calls for one client screen (BFF)',
      'Access logs, metrics and trace headers for every request; canary routing'
    ],
    nonFunctional: [
      'Added latency p99 of a few ms (<em>estimate</em>: ≲ 5 ms excluding the backend)',
      '10⁵–10⁶ requests/s by adding stateless nodes',
      'No single point of failure: 99.99%+ availability',
      'A slow backend must not take the gateway down (isolation)',
      'Route and policy changes apply without restarts',
      'Tenants are isolated from noisy neighbours'
    ],
    outOfScope: ['Business logic (keep it out of the gateway)', 'Static asset caching (see CDN)', 'Token bucket internals (see Rate Limiter)', 'East-west service-to-service traffic, except as a comparison']
  },

  calculator: {
    inputs: [
      { id: 'rps', label: 'Peak requests per second', min: 1000, max: 5000000, value: 200000, log: true },
      { id: 'node', label: 'Requests/s one node can handle, CPU-bound (estimate)', min: 1000, max: 100000, value: 15000, log: true },
      { id: 'lat', label: 'Backend latency (average)', min: 5, max: 3000, value: 80, unit: 'ms', log: true },
      { id: 'filters', label: 'Filters in the chain', min: 1, max: 20, value: 8 },
      { id: 'cost', label: 'Average cost per filter', min: 0.02, max: 2, step: 0.02, value: 0.2, unit: 'ms' },
      { id: 'line', label: 'Access-log bytes per request', min: 100, max: 2000, step: 50, value: 500, fmt: 'bytes' }
    ],
    outputs: [
      { label: 'Gateway nodes (70% target utilisation)', f: (v) => Math.ceil(v.rps / (v.node * 0.7)) },
      { label: 'Gateway overhead per request', fmt: 'ms', f: (v) => v.filters * v.cost },
      { label: 'Requests in flight, cluster-wide (Little\'s law)', f: (v) => v.rps * (v.lat + v.filters * v.cost) / 1000 },
      { label: 'In flight per node', f: (v) => (v.rps * (v.lat + v.filters * v.cost) / 1000) / Math.ceil(v.rps / (v.node * 0.7)) },
      { label: 'Thread stacks per node if thread-per-request (~1 MB each)', fmt: 'bytes', f: (v) => (v.rps * (v.lat + v.filters * v.cost) / 1000) / Math.ceil(v.rps / (v.node * 0.7)) * 1e6 },
      { label: 'Access logs per day at peak rate', fmt: 'bytes', f: (v) => v.rps * v.line * 86400 }
    ],
    note: 'Little\'s law: <b>in-flight = arrival rate × time in system</b>. A blocking gateway needs one thread per in-flight request, so when backends slow down the thread count, not the CPU, becomes the limit. The per-node capacity, filter cost and 1 MB stack are <em>estimates</em>. Measure your own.'
  },

  api: [
    { m: 'GET', p: '/api/products/{id} (any path)', d: 'Data plane. The request is matched against route <b>predicates</b> (path, host, header, weight), runs the filters, and is proxied to <code>lb://catalog</code> over a pooled keep-alive connection. Over the limit: <b>429</b> with <code>X-RateLimit-Remaining</code> (Spring).' },
    { m: 'GET', p: '/mobile/v1/home', d: 'A <b>BFF</b> route. One client call fans out to orders, catalog and recommendations in the datacenter and returns one screen-shaped JSON.' },
    { m: 'GET', p: 'idp/.well-known/jwks.json', d: 'Fetched by the gateway and cached by <code>kid</code>. JWT signatures are verified locally, never with a per-request call to the IdP.' },
    { m: 'PUT', p: '/admin/routes/{id}', d: 'Control plane. A versioned route <code>{predicates, filters, uri, weight}</code> is validated, then pushed to every node (Envoy streams it over <b>xDS</b>).' },
    { m: 'GET', p: '/actuator/gateway/routes', d: 'Spring Cloud Gateway: list the routes and filters the node is actually running.' },
    { m: 'RPC', p: 'xDS stream (Envoy ADS, gRPC)', d: 'How Envoy nodes get listeners, routes, clusters and endpoints: a long-lived stream from the control plane, applied without a restart.' }
  ],
  dataModel: [
    { name: 'route', store: 'Config store (Git / etcd / DB) → pushed to nodes', fields: [['route_id', 'string', 'pk'], ['predicates', 'Path=/api/products/**, Weight=catalog,95'], ['filters', 'list: auth, limit, breaker…'], ['uri', 'lb://catalog'], ['version', 'int', 'idx']], note: 'Held in memory on every node. A bad push must be rolled back by version.' },
    { name: 'consumer / api_key', store: 'Postgres + node cache', fields: [['key_hash', 'sha256', 'pk'], ['tenant_id', 'uuid', 'idx'], ['plan', 'rate + quota'], ['scopes', 'text[]'], ['status', 'active | revoked']], note: 'Store only the hash of the key, like a password.' },
    { name: 'rate-limit bucket', store: 'Redis (Lua script)', fields: [['request_rate_limiter.{key}.tokens', 'int', 'pk'], ['request_rate_limiter.{key}.timestamp', 'epoch s'], ['TTL', '≈ 2 × fill time']], note: 'The key names Spring\'s RedisRateLimiter uses. Hash tags <code>{key}</code> keep both on one cluster slot.' },
    { name: 'jwks cache', store: 'In-process per node', fields: [['kid', 'string', 'pk'], ['public_key', 'RSA / EC'], ['fetched_at', 'ts']], note: 'An unknown kid triggers a single, rate-limited refetch.' }
  ],

  architecture: {
    title: 'API gateway architecture',
    nodes: [
      { id: 'web', label: 'Web app', sub: 'browser SPA', kind: 'client', wide: [90, 60], tall: [105, 0], tip: 'Calls the public API with a Bearer token.' },
      { id: 'mob', label: 'Mobile app', sub: 'high-latency network', kind: 'client', wide: [90, 260], tall: [315, 0], tip: 'Each round trip on a mobile network is expensive, which is why BFF aggregation helps mobile most.' },
      { id: 'lb', label: 'L4 load balancer', sub: 'anycast / NLB', kind: 'edge', wide: [290, 160], tall: [210, 105], tip: 'Spreads TCP connections across gateway nodes and removes unhealthy ones. With several nodes behind it, the gateway is not a single point of failure.' },
      { id: 'gw', label: 'Gateway cluster', sub: 'filter chain · non-blocking', kind: 'edge', wide: [490, 160], tall: [210, 210], tip: 'Stateless nodes (Zuul 2 / Envoy / Spring Cloud Gateway). TLS termination, auth, limits, routing, retries, timeouts and logging.' },
      { id: 'idp', label: 'Identity provider', sub: 'OAuth2 · JWKS', kind: 'external', wide: [490, 30], tall: [70, 105], tip: 'Issues tokens. The gateway only fetches its public keys (JWKS) and caches them.' },
      { id: 'disc', label: 'Service discovery', sub: 'k8s / Eureka / Consul', kind: 'store', wide: [290, 30], tall: [70, 210], tip: 'Maps lb://catalog to live instances. The gateway caches the list and refreshes it in the background.' },
      { id: 'cp', label: 'Control plane', sub: 'routes · policies', kind: 'service', wide: [290, 300], tall: [350, 105], tip: 'The source of truth for routes, plugins and limits. It validates changes and pushes versioned config to every node.' },
      { id: 'rl', label: 'Redis', sub: 'rate-limit buckets', kind: 'cache', wide: [490, 300], tall: [350, 210], tip: 'Shared token buckets so the limit holds across all gateway nodes. One Lua script call per request.' },
      { id: 'bff', label: 'Mobile BFF', sub: 'compose · shape JSON', kind: 'service', wide: [690, 60], tall: [70, 315], tip: 'Backend-for-frontend owned by the mobile team. It fans out in the datacenter and returns one response per screen.' },
      { id: 'cat2', label: 'Catalog v2', sub: 'canary · 5%', kind: 'service', wide: [890, 280], tall: [350, 315], tip: 'A new version that receives a small weighted share of traffic while its error rate and latency are compared with v1.' },
      { id: 'ord', label: 'Orders service', sub: 'REST / gRPC', kind: 'service', wide: [890, 60], tall: [70, 420], tip: 'An internal service. It never sees raw internet traffic.' },
      { id: 'cat', label: 'Catalog v1', sub: 'stable · 95%', kind: 'service', wide: [890, 170], tall: [210, 420], tip: 'The current production version.' },
      { id: 'obs', label: 'Observability', sub: 'logs · metrics · traces', kind: 'store', wide: [690, 300], tall: [350, 525], tip: 'Access logs, per-route RED metrics (rate, errors, duration) and trace spans, shipped asynchronously.' }
    ],
    edges: [
      { from: 'web', to: 'lb', bidi: true },
      { from: 'mob', to: 'lb', bidi: true },
      { from: 'lb', to: 'gw', bidi: true },
      { from: 'gw', to: 'idp', dashed: true, label: 'JWKS' },
      { from: 'gw', to: 'disc', dashed: true },
      { from: 'cp', to: 'gw', dashed: true, label: 'config' },
      { from: 'gw', to: 'rl' },
      { from: 'gw', to: 'bff' },
      { from: 'bff', to: 'ord' },
      { from: 'bff', to: 'cat' },
      { from: 'gw', to: 'cat' },
      { from: 'gw', to: 'cat2' },
      { from: 'gw', to: 'obs', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'chain', title: 'Request through the filter chain', tone: 'info',
      steps: [
        { text: 'The mobile app calls <code>GET /mobile/v1/home</code> with a Bearer token. The L4 balancer picks any healthy gateway node, because the nodes are stateless.', flow: ['mob>lb', 'lb>gw'] },
        { text: '<b>Auth filter</b>: verify the JWT signature with the <b>cached JWKS</b> key for its <code>kid</code>, then check <code>exp</code>, <code>iss</code> and <code>aud</code>. There is no network call.', nodes: ['gw'], badges: { gw: 'JWT ✓' } },
        { text: '<b>Rate-limit filter</b>: one Redis round trip runs the token-bucket Lua script for this user. A bucket with tokens left lets the request through.', flow: ['gw>rl'], badges: { rl: '17 tokens left' } },
        { text: '<b>Route</b>: the predicate <code>Path=/mobile/**</code> matches the BFF route. The node resolves <code>lb://mobile-bff</code> from its discovery cache and proxies on a pooled connection.', flow: ['gw>bff'], badges: { bff: 'route matched' } },
        { text: 'The BFF calls orders and catalog <b>in parallel</b> inside the datacenter (≈1 ms hops), then returns one screen-shaped JSON instead of three mobile round trips.', flow: [['bff>ord', 'bff>cat']], tone: 'ok', badges: { ord: '12 ms', cat: '9 ms' } },
        { text: '<b>Outbound filters</b> strip internal headers and add <code>traceparent</code>. The access log and metrics are written <b>asynchronously</b>, off the response path.', flow: ['gw>obs'], tone: 'ok' }
      ]
    },
    {
      id: 'jwks', title: 'JWT validation with a cached JWKS', tone: 'ok',
      steps: [
        { text: 'At startup, and then every few minutes, each node fetches the IdP\'s <b>JWKS</b> (public keys) and caches them by <code>kid</code>.', flow: ['gw>idp'], badges: { idp: '2 keys' } },
        { text: 'A request carries a token signed with <code>kid=k2</code>. It is a cache hit, so the gateway verifies the RS256 or ES256 signature locally in microseconds.', flow: ['web>lb', 'lb>gw'], badges: { gw: 'kid k2 ✓' }, tone: 'ok' },
        { text: 'The IdP rotates keys and starts signing with <code>k3</code>. The first unknown kid triggers <b>one</b> refetch (single-flight, rate-limited). It is never a fetch per request.', flow: ['gw>idp'], badges: { gw: ['unknown kid', 'warn'] }, tone: 'warn' },
        { text: 'If the IdP is down, cached keys keep working, because tokens are self-contained. The trade-off is <b>revocation lag</b>: a stolen token stays valid until <code>exp</code>, so keep access tokens short-lived.', nodes: ['idp', 'gw'], err: ['idp'], ok: ['gw'], badges: { idp: ['down', 'err'], gw: ['still verifying', 'ok'] } }
      ]
    },
    {
      id: 'breaker', title: 'Slow backend → circuit breaker', tone: 'err',
      steps: [
        { text: 'Catalog v1 hits a bad GC pause and its latency jumps from 40 ms to 5 s. At 2,000 req/s, Little\'s law gives <b>10,000 requests in flight</b>, all waiting on one backend.', flow: ['gw>cat'], err: ['cat'], badges: { cat: ['p99 5 s', 'err'] }, tone: 'err' },
        { text: 'A <b>1 s timeout</b> and a per-route <b>bulkhead</b> (concurrency cap) stop catalog from eating every connection. Orders traffic keeps flowing.', nodes: ['gw', 'bff', 'ord'], warn: ['gw'], ok: ['ord'], badges: { gw: ['timeout 1 s', 'warn'] }, tone: 'warn' },
        { text: 'The failure rate in the sliding window passes 50%, so the breaker goes <b>OPEN</b>. Calls fail fast with a fallback (stale cached data or a 503 with <code>Retry-After</code>) and the backend gets room to recover.', nodes: ['gw'], err: ['cat'], badges: { gw: ['breaker OPEN', 'err'] }, tone: 'err' },
        { text: 'After the wait time it goes <b>HALF-OPEN</b> and lets a few probe calls through. They succeed, so it goes CLOSED and normal traffic resumes.', flow: ['gw>cat'], ok: ['cat'], badges: { gw: ['CLOSED', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'canary', title: 'Canary: 5% to catalog v2', tone: 'warn',
      steps: [
        { text: 'The control plane pushes a new route version. A <b>Weight</b> predicate splits the catalog group 95 / 5 between v1 and v2.', flow: ['cp>gw'], badges: { gw: 'routes v42' } },
        { text: 'Each node picks by weight. For a sticky canary, hash the user id so the same user always lands on the same version.', flow: [['gw>cat', 'gw>cat2']], badges: { cat: '95%', cat2: '5%' } },
        { text: 'Per-version metrics show v2\'s 5xx rate at 4% against 0.1% for v1. The comparison is automatic, not someone watching a dashboard.', flow: ['gw>obs'], warn: ['cat2'], badges: { cat2: ['5xx 4%', 'warn'] }, tone: 'warn' },
        { text: 'Rollback is just another config push: weight 0 for v2. No redeploy is needed, and only 5% of users saw the bad version, briefly.', flow: ['cp>gw', 'gw>cat'], ok: ['cat'], badges: { cat: ['100%', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'spike', title: 'Traffic spike and abusive client', tone: 'warn',
      steps: [
        { text: 'A misbehaving script sends 5,000 req/s with one API key. Its token bucket in Redis empties in milliseconds.', flow: [['web>lb', 'web>lb'], 'lb>gw', 'gw>rl'], warn: ['rl'], badges: { rl: ['0 tokens', 'warn'] }, tone: 'warn' },
        { text: 'The gateway answers <b>429</b> with <code>Retry-After</code>. The backends never see those requests, and other keys have their own buckets.', nodes: ['gw', 'web'], badges: { gw: ['429', 'warn'] } },
        { text: 'Real demand also rises (a launch). Gateway CPU climbs, so <b>autoscaling adds nodes</b>. Because the nodes are stateless, the load balancer starts using them at once.', nodes: ['lb', 'gw'], ok: ['gw'], badges: { gw: ['12 → 20 nodes', 'ok'] } },
        { text: 'While new nodes warm up, <b>load shedding</b> rejects low-priority traffic (prefetch, analytics) first, so checkout and playback stay fast.', nodes: ['gw', 'bff', 'cat'], ok: ['bff', 'cat'], badges: { gw: 'shed low-pri' }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick a gateway style, an I/O model, where to authenticate and whether to aggregate. Drag the backend latency to see why Netflix moved Zuul to non-blocking I/O.',
    controls: [
      { id: 'style', label: 'Gateway style', type: 'seg', value: 'edge', options: [
        { v: 'edge', l: 'One edge gateway' }, { v: 'bff', l: 'Edge + BFF per client' }, { v: 'mesh', l: 'Thin edge + service mesh' }] },
      { id: 'io', label: 'Filter / I/O model', type: 'seg', value: 'async', options: [
        { v: 'block', l: 'Blocking, thread-per-request (Zuul 1)' }, { v: 'async', l: 'Non-blocking event loop (Zuul 2, Envoy)' }] },
      { id: 'auth', label: 'Where tokens are checked', type: 'seg', value: 'gw', options: [
        { v: 'gw', l: 'Gateway only' }, { v: 'svc', l: 'Each service only' }, { v: 'both', l: 'Gateway + services' }] },
      { id: 'agg', label: 'Response aggregation', type: 'seg', value: 'off', options: [
        { v: 'off', l: 'Off (client calls each API)' }, { v: 'on', l: 'On (one call per screen)' }] },
      { id: 'lat', label: 'Backend latency', type: 'range', min: 20, max: 2000, step: 20, value: 100, unit: 'ms', kind: 'ms' }
    ],
    evaluate(s) {
      const cpuCap = 10000;                       // req/s per node when CPU-bound (illustrative)
      const pool = 200;                           // Tomcat default maxThreads
      const blockCap = pool / (s.lat / 1000);     // Little's law ceiling for a blocking node
      const perNode = s.io === 'block' ? Math.min(cpuCap, blockCap) : cpuCap;
      const nodes = Math.ceil(100000 / perNode);
      const inflight = Math.round(perNode * s.lat / 1000);
      const overhead = 1.5 + (s.auth !== 'svc' ? 0.1 : 0) + (s.style === 'mesh' ? 2 : 0) + (s.style === 'bff' || s.agg === 'on' ? 1 : 0);
      const screen = (s.agg === 'on' || s.style === 'bff') ? 100 + s.lat : 2 * 100 + s.lat; // mobile RTT 100 ms; 4 calls in 2 waves vs 1
      const metrics = [
        { k: 'Gateway overhead p99', v: '≈ ' + overhead.toFixed(1) + ' ms', s: overhead <= 2 ? 0.9 : overhead <= 3 ? 0.7 : 0.5, hint: s.style === 'mesh' ? '+2 sidecar hops' : 'filters + proxy' },
        { k: 'Nodes for 100K req/s', v: nodes + (s.io === 'block' && blockCap < cpuCap ? ' (thread-bound)' : ' (CPU-bound)'), s: nodes <= 12 ? 0.9 : nodes <= 30 ? 0.55 : 0.2 },
        { k: 'Threads per node', v: s.io === 'block' ? Math.min(inflight, pool) + ' of ' + pool + (blockCap < cpuCap ? ' (pool full)' : '') : '≈ 1 per core (event loops)', s: s.io === 'block' ? (blockCap < cpuCap ? 0.2 : 0.6) : 0.9 },
        { k: 'Mobile home screen', v: (s.agg === 'on' || s.style === 'bff' ? '1 round trip' : '4 calls, 2 waves') + ' ≈ ' + SD.fmt.dur(screen), s: s.agg === 'on' || s.style === 'bff' ? 0.85 : 0.45, hint: '100 ms mobile RTT' },
        { k: 'Blast radius of a bad change', v: { edge: s.agg === 'on' ? 'every client (logic in shared GW)' : 'every client', bff: 'one client type', mesh: 'one service' }[s.style], s: { edge: s.agg === 'on' ? 0.25 : 0.45, bff: 0.7, mesh: 0.8 }[s.style] },
        { k: 'Security posture', v: { gw: 'perimeter only', svc: 'every team re-implements', both: 'defence in depth' }[s.auth], s: { gw: 0.55, svc: 0.45, both: 0.9 }[s.auth] },
        { k: 'Ops complexity', v: { edge: 'one cluster', bff: 'one cluster + N BFFs', mesh: 'sidecar per pod + control plane' }[s.style], s: { edge: 0.85, bff: 0.6, mesh: 0.35 }[s.style] }
      ];
      const notes = [];
      if (s.io === 'block') notes.push('Thread-per-request: each in-flight request pins a thread. At ' + s.lat + ' ms a 200-thread node tops out at <b>' + SD.fmt.num(Math.round(blockCap)) + ' req/s</b> (Little\'s law), however idle the CPU is.');
      else notes.push('Event loops hold thousands of connections on a few threads. Netflix found the big win for Zuul 2 was <b>connection scaling</b>. CPU-bound work was not much cheaper, and every filter must avoid blocking calls.');
      if (s.style === 'mesh') notes.push('A mesh moves retries, mTLS and timeouts into a sidecar next to each service. You still need an <b>ingress gateway</b> for internet concerns such as API keys and quotas.');
      if (s.style === 'bff') notes.push('Each client team owns its BFF, so mobile can change its screen JSON without touching web, and the shared edge stays thin.');
      if (s.agg === 'on' && s.style === 'edge') notes.push('Aggregation code inside the shared edge gateway couples every team\'s release to one deployable. This is the "gateway monolith" anti-pattern.');
      if (s.auth === 'gw') notes.push('Services trust identity headers set by the gateway. That is fine only if nothing can reach them without going through it (network policy or mTLS).');
      if (s.auth === 'svc') notes.push('No central rejection: unauthenticated junk reaches every service before being refused, and each team must get JWT validation right.');
      let verdict;
      if (s.io === 'block' && blockCap < cpuCap) verdict = '❌ <b>Thread-bound.</b> With ' + s.lat + ' ms backends a blocking gateway needs ' + nodes + ' nodes for 100K req/s. Go non-blocking or add strict timeouts.';
      else if (s.agg === 'on' && s.style === 'edge') verdict = '⚠ <b>Gateway monolith risk.</b> Move per-screen composition into BFFs that the client teams own.';
      else if (s.auth === 'svc') verdict = '⚠ <b>No front-door check.</b> Validate tokens at the edge and let services re-check scopes.';
      else if (s.io === 'async' && s.auth === 'both' && s.style !== 'edge') verdict = '✅ <b>Solid modern design:</b> a thin non-blocking edge, composition owned by the client teams, and tokens checked at the edge and again in services.';
      else verdict = '👍 Workable. The meters show which trade-off you are paying for.';
      const showBff = s.agg === 'on' || s.style === 'bff';
      const flow = ['mob>lb', 'lb>gw', 'gw>rl'].concat(showBff ? ['gw>bff', 'bff>ord', 'bff>cat'] : ['gw>cat']);
      const labels = {
        gw: { label: { edge: 'Edge gateway', bff: 'Edge gateway', mesh: 'Ingress gateway' }[s.style], sub: s.io === 'block' ? 'thread-per-request' : 'Netty event loop' },
        bff: { label: s.style === 'bff' ? 'Mobile BFF' : 'Aggregator', sub: s.style === 'bff' ? 'owned by mobile team' : 'inside shared GW team' }
      };
      if (s.style === 'mesh') { labels.ord = { label: 'Orders + sidecar', sub: 'Envoy · mTLS' }; labels.cat = { label: 'Catalog + sidecar', sub: 'Envoy · mTLS' }; }
      if (s.auth !== 'gw') { labels.ord = { label: labels.ord ? labels.ord.label : 'Orders service', sub: 'verifies JWT itself' }; }
      return {
        metrics, verdict, notes, labels, flow,
        hide: showBff ? ['cat2'] : ['bff', 'cat2'],
        hot: showBff ? ['bff'] : [],
        err: s.io === 'block' && blockCap < cpuCap ? ['gw'] : [],
        warn: s.agg === 'on' && s.style === 'edge' ? ['gw'] : [],
        badges: { gw: [s.io === 'block' ? Math.min(inflight, pool) + '/' + pool + ' threads' : inflight + ' in flight', s.io === 'block' && blockCap < cpuCap ? 'err' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Filter chain: toggle filters, watch the latency each one adds',
    caption: 'Requests flow top to bottom through real filters: a JWT check, a <b>token bucket</b> (10/s, burst 20), a TTL response cache, a <b>circuit breaker</b> (50% of the last 20 calls), and a 95/5 weighted router. <b>Tap a filter</b> to switch it off. Make the backend slow or failing, or fire a burst.'
  },

  realWorld: {
    intro: 'Gateways moved from blocking servlets to event-loop proxies, and from hand-edited config to control planes.',
    timeline: [
      { when: '2013', who: 'Netflix', title: 'Zuul: an edge service', text: 'Zuul was open-sourced as Netflix\'s front door for every device request. Its <b>filters</b> handled dynamic routing, monitoring, resiliency and security. Zuul 1 was built on blocking servlets.', src: 0 },
      { when: '2015', who: 'Mashape', title: 'Kong open-sourced', text: 'Kong was built at Mashape for its API marketplace and released as open source. It is a <b>Lua application running inside NGINX (OpenResty)</b>, with plugins for auth, logging and rate limiting.', src: 1 },
      { when: 'Sept 2016', who: 'Lyft', title: 'Envoy announced', text: 'A C++ <b>L3/L4 proxy with an HTTP L7 filter layer</b>, run next to every service and at the edge. Lyft used it for Python, Go, C++ and PHP services. It later became the data plane for many service meshes.', src: 2 },
      { when: '2016', who: 'Netflix', title: 'Zuul 2: async and non-blocking', text: 'Zuul was rebuilt on <b>Netty</b>. The main win was <b>connection scaling</b>. For their CPU-bound cluster the efficiency gain was small, and hidden blocking calls and thread-locals made the migration hard.', src: 3 },
      { when: '2018', who: 'Netflix', title: 'Zuul 2 open-sourced', text: 'At the time Netflix ran <b>more than 80 Zuul 2 clusters</b> in front of ~100 backend clusters, at <b>over 1 million requests per second</b>. The release included HTTP/2 and mutual TLS.', src: 4 },
      { when: '2020s', who: 'Spring · AWS', title: 'Token-bucket limits as a built-in filter', text: 'Spring Cloud Gateway\'s <code>RequestRateLimiter</code> runs a Redis token bucket (<code>replenishRate</code>, <code>burstCapacity</code>, <code>requestedTokens</code>). AWS API Gateway throttles each account to <b>10,000 req/s with a 5,000 burst</b> per Region by default (lower in some Regions).', src: 5 }
    ],
    lessons: [
      'Keep the gateway <b>thin and generic</b>: cross-cutting concerns only. Business composition belongs in BFFs or services.',
      'Non-blocking I/O buys <b>connection scaling</b>, not free CPU. Every filter must then avoid blocking calls.',
      'Every downstream call needs a <b>timeout, a concurrency cap and a breaker</b>, or one slow service takes the whole edge down.',
      'Treat config as code: validate, version, canary and roll back route changes just like deploys.'
    ],
    sources: [
      { title: 'Netflix/zuul wiki', url: 'https://github.com/Netflix/zuul/wiki', pub: 'Netflix OSS (GitHub)' },
      { title: 'Kong API Gateway', url: 'https://www.thoughtworks.com/radar/platforms/kong-api-gateway', pub: 'Thoughtworks Technology Radar' },
      { title: 'Announcing Envoy: C++ L7 proxy and communication bus', url: 'https://eng.lyft.com/announcing-envoy-c-l7-proxy-and-communication-bus-92520b6c8191', pub: 'Lyft Engineering, 2016' },
      { title: 'Zuul 2: The Netflix Journey to Asynchronous, Non-Blocking Systems', url: 'https://medium.com/netflix-techblog/zuul-2-the-netflix-journey-to-asynchronous-non-blocking-systems-45947377fb5c', pub: 'Netflix Technology Blog, 2016' },
      { title: 'Netflix open sources Zuul 2 cloud gateway', url: 'https://hub.packtpub.com/netflix-open-sources-zuul-2-cloud-gateway', pub: 'Packt Hub (summary of the Netflix Tech Blog post), 2018' },
      { title: 'RequestRateLimiter GatewayFilter Factory', url: 'https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway-server-webflux/gatewayfilter-factories/requestratelimiter-factory.html', pub: 'Spring Cloud Gateway reference' },
      { title: 'Throttle requests to your REST APIs for better throughput', url: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html', pub: 'Amazon API Gateway developer guide' },
      { title: 'How It Works 2.0', url: 'https://github.com/Netflix/zuul/wiki/How-It-Works-2.0', pub: 'Netflix/zuul wiki' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Shape', '<b>One edge gateway</b>: one place for policy', '<b>Edge + BFF per client</b>: teams own their composition', 'A single gateway while you have one client; BFFs once mobile and web need different shapes'],
      ['I/O model', '<b>Blocking</b>: simple stack traces, easy debugging', '<b>Non-blocking</b>: thousands of connections per node', 'Non-blocking for the edge, long-lived connections, push and slow backends'],
      ['Authentication', '<b>At the gateway</b>: reject junk early, one implementation', '<b>Also in services</b>: zero-trust, fine-grained scopes', 'Both: the gateway validates the token and services check scopes and ownership'],
      ['Product', '<b>Managed</b> (AWS API Gateway, Apigee): no ops', '<b>Self-hosted</b> (Envoy, Kong, Spring Cloud Gateway): full control and lower cost at volume', 'Managed for small or medium traffic; self-hosted at very high rps or with custom filters'],
      ['Edge vs mesh', '<b>API gateway</b>: north-south, client-facing policy', '<b>Service mesh</b>: east-west mTLS, retries and telemetry', 'They complement each other. Many teams run Envoy for both'],
      ['Rate-limit state', '<b>Local per node</b>: no network hop, approximate', '<b>Global in Redis</b>: exact across nodes, one hop', 'Local for DDoS-style coarse limits; global for paid quotas']
    ]
  },
  failures: [
    { f: 'Slow backend exhausts the gateway', detect: 'Rising in-flight count, connection-pool waits, p99 on one route', fix: 'Per-route timeouts, bulkheads (concurrency caps) and a circuit breaker with a fallback.' },
    { f: 'Bad route or plugin push breaks everything', detect: 'Error spike right after a config version change', fix: 'Validate config, roll it out as a canary to a few nodes, and roll back by version automatically.' },
    { f: 'Redis for rate limits is down', detect: 'Limiter errors and timeouts', fix: 'Decide fail-open or fail-closed up front. Spring\'s RedisRateLimiter <b>fails open</b>; keep a coarse local limit as a backstop.' },
    { f: 'IdP or JWKS endpoint unreachable', detect: 'Key refresh failures', fix: 'Keep serving with cached keys and alert. Refetch on unknown kid with single-flight and a rate limit.' },
    { f: 'Retry storm amplifies an outage', detect: 'Backend rps much higher than client rps', fix: 'Retry only idempotent requests, with jittered backoff and a retry budget (e.g. ≤ 10% extra load).' },
    { f: 'Gateway node crashes', detect: 'LB health checks', fix: 'Stateless nodes: the LB drops it and clients reconnect. Run nodes across availability zones.' },
    { f: 'Abusive client or credential stuffing', detect: 'Per-key 429 rate, auth failure rate', fix: 'Per-key and per-IP limits, a WAF or bot filter in front, and revoking the key.' }
  ],

  interview: [
    { q: 'API gateway vs load balancer vs service mesh: what is the difference?', a: '<ul><li><b>L4 load balancer</b>: spreads TCP connections and knows nothing about HTTP routes or users.</li><li><b>API gateway</b>: L7, north-south. It handles client-facing policy such as auth, API keys, quotas, routing, transformation and aggregation.</li><li><b>Service mesh</b>: east-west traffic between services. Sidecars add mTLS, retries, timeouts and telemetry.</li></ul><p>In production you often have all three, and Envoy can play both proxy roles.</p>', lvl: 'core' },
    { q: 'Isn\'t the gateway a single point of failure?', a: '<p>Only if it runs as one box. Run <b>many stateless nodes</b> across availability zones behind an L4 or anycast load balancer, keep state in replicated stores (Redis, the config store), and let nodes keep running on their last good config if the control plane is down.</p><p>The bigger risk is a <b>bad config push</b>, which hits every node at once. Canary the config.</p>', lvl: 'core' },
    { q: 'Where should authentication happen?', a: '<p><b>At the gateway</b>, verify the token (signature, <code>exp</code>, <code>aud</code>) with cached JWKS keys and reject junk early. <b>In services</b>, check <i>authorization</i>: scopes, and whether this user owns order 42.</p><p>Services must not trust identity headers unless traffic can only arrive through the gateway (mTLS or network policy).</p>', fu: 'How do you revoke a JWT? (Short expiry plus a denylist of token ids checked at the gateway.)', lvl: 'core' },
    { q: 'What is the BFF pattern and why use it?', a: '<p>A <b>backend-for-frontend</b> is a thin API per client type (iOS, Android, web, TV), owned by that client\'s team. It fans out to services inside the datacenter and returns exactly what one screen needs.</p><p>It saves mobile round trips and over-fetching, and it keeps client-specific logic out of the shared gateway.</p>', lvl: 'core' },
    { q: 'How do you stop the gateway becoming a monolith?', a: '<ul><li>Allow only <b>cross-cutting</b> filters in the shared gateway: auth, limits, routing, logging.</li><li>Put composition in BFFs and business rules in services.</li><li>Use declarative, self-service route config with ownership per route, so teams do not queue behind the gateway team.</li></ul>', lvl: 'core' },
    { q: 'Why did Netflix move Zuul to a non-blocking model?', a: '<p>A blocking gateway ties up one thread per in-flight request. By Little\'s law, in-flight = rate × latency, so slow backends or long-lived connections (push, WebSockets) exhaust threads long before the CPU is busy.</p><p>Zuul 2 on <b>Netty</b> holds many connections on a few event-loop threads. Netflix reported the win was mostly <b>connection scaling</b>. For CPU-bound work it was not much cheaper, and the code became harder to debug.</p>', lvl: 'deep' },
    { q: 'How do you rate limit across 50 gateway nodes?', a: '<p>Use a shared <b>token bucket</b> in Redis, updated atomically by a Lua script (one round trip). Key it by API key, user or tenant. Spring Cloud Gateway\'s <code>RequestRateLimiter</code> does exactly this with <code>replenishRate</code> and <code>burstCapacity</code>.</p><p>For very high rates, add a local per-node bucket in front for coarse limits and only use Redis for paid quotas.</p>', lvl: 'core' },
    { q: 'How do timeouts, retries and circuit breakers fit together?', a: '<ul><li><b>Timeout</b> on every call, shorter than the client\'s own timeout.</li><li><b>Retry</b> only idempotent requests, with jittered backoff and a retry budget.</li><li><b>Circuit breaker</b>: when the failure or slow-call rate in a window passes a threshold, fail fast for a while, then let probes through (half-open).</li><li><b>Bulkhead</b>: cap concurrency per route so one backend cannot take every connection.</li></ul>', lvl: 'deep' },
    { q: 'How do you do a canary release at the gateway?', a: '<p>Use a weighted route, for example 95/5 between v1 and v2, optionally sticky by user hash. Compare per-version error rate and latency automatically, then raise the weight step by step or set it to 0 to roll back. No redeploy is needed.</p>', lvl: 'core' },
    { q: 'How do routes reach the nodes without restarts?', a: '<p>A <b>control plane</b> holds versioned config and pushes it, for example over Envoy\'s <b>xDS</b> gRPC streams, or each node polls. Nodes swap their routing table atomically and keep the last good version if the control plane is unreachable.</p>', lvl: 'deep' },
    { q: 'What goes into the gateway\'s latency budget?', a: '<p>TLS termination (session resumption helps), JWT verification (microseconds with cached keys), one Redis round trip for limits (sub-millisecond in the same AZ), the route lookup, and the proxy hop on a pooled connection.</p><p>Keep the total to a few ms. Write logs and metrics asynchronously, never on the response path.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Cloud Gateway: canary route + Redis rate limiter + breaker', lang: 'java',
      code: `// spring-cloud-starter-gateway(-server-webflux), spring-boot-starter-data-redis-reactive,
// spring-cloud-starter-circuitbreaker-reactor-resilience4j
@Configuration
public class GatewayRoutes {

  @Bean
  RedisRateLimiter redisRateLimiter() {
    return new RedisRateLimiter(10, 20, 1);   // replenishRate/s, burstCapacity, requestedTokens
  }

  @Bean
  KeyResolver userOrIp() {                    // one bucket per user, else per client IP
    return exchange -> exchange.getPrincipal()
        .map(Principal::getName)
        .switchIfEmpty(Mono.fromSupplier(() ->
            exchange.getRequest().getRemoteAddress().getAddress().getHostAddress()));
  }

  @Bean
  RouteLocator routes(RouteLocatorBuilder b, RedisRateLimiter limiter, KeyResolver keys) {
    return b.routes()
        .route("catalog-v2", r -> r.path("/api/products/**").and().weight("catalog", 5)
            .filters(f -> common(f, limiter, keys)).uri("lb://catalog-v2"))
        .route("catalog-v1", r -> r.path("/api/products/**").and().weight("catalog", 95)
            .filters(f -> common(f, limiter, keys)).uri("lb://catalog"))
        .build();
  }

  private GatewayFilterSpec common(GatewayFilterSpec f, RedisRateLimiter l, KeyResolver k) {
    return f.stripPrefix(1)
        .requestRateLimiter(c -> c.setRateLimiter(l).setKeyResolver(k))   // 429 when empty
        .circuitBreaker(c -> c.setName("catalog")
            .setFallbackUri("forward:/fallback/catalog"));
  }
}`,
      note: 'Behind a load balancer, resolve the client IP from <code>X-Forwarded-For</code> that your LB sets (Spring has <code>XForwardedRemoteAddressResolver</code>). If Redis errors, this limiter lets requests through (fail-open).'
    },
    {
      title: 'Resilience4j + gateway timeouts (application.yml)', lang: 'yaml',
      code: `resilience4j:
  circuitbreaker:
    instances:
      catalog:
        slidingWindowType: COUNT_BASED
        slidingWindowSize: 20              # last 20 calls
        failureRateThreshold: 50           # % failures → OPEN
        slowCallDurationThreshold: 1s
        slowCallRateThreshold: 50          # % slow calls → OPEN
        waitDurationInOpenState: 10s       # then HALF_OPEN
        permittedNumberOfCallsInHalfOpenState: 3
  timelimiter:
    instances:
      catalog:
        timeoutDuration: 1s

spring:
  cloud:
    gateway:                               # 2025.0+: spring.cloud.gateway.server.webflux.*
      httpclient:
        connect-timeout: 500               # ms
        response-timeout: 2s               # global cap; per-route via route metadata`,
      note: 'The breaker counts calls that time out as failures, so the time limiter and the breaker work together.'
    },
    {
      title: 'Python: verify JWTs with a cached JWKS (PyJWT)', lang: 'python',
      code: `# pip install "pyjwt[crypto]"
import jwt
from jwt import PyJWKClient

ISSUER = "https://idp.example.com/"
jwks = PyJWKClient(ISSUER + ".well-known/jwks.json",
                   cache_jwk_set=True, lifespan=300)   # refetch the set at most every 5 min

def authenticate(auth_header: str) -> dict:
    if not auth_header.startswith("Bearer "):
        raise PermissionError("missing bearer token")
    token = auth_header.removeprefix("Bearer ")
    key = jwks.get_signing_key_from_jwt(token)   # looks up 'kid'; refreshes on unknown kid
    claims = jwt.decode(
        token, key.key,
        algorithms=["RS256", "ES256"],           # pin algorithms; never accept 'none'
        audience="orders-api", issuer=ISSUER,
        leeway=30,                               # seconds of clock skew
    )
    return {"sub": claims["sub"], "scopes": claims.get("scope", "").split()}`
    }
  ],

  related: ['rate-limiter', 'llm-gateway', 'cdn', 'distributed-cache', 'observability', 'url-shortener']
});
