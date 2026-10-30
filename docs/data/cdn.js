SD.register({
  slug: 'cdn',
  domain: 6,
  title: 'Content Delivery Network',
  examples: 'Akamai, Cloudflare',
  tagline: 'Serve the same bytes to millions of users from a server <b>a few milliseconds away</b>, so the origin only sees a trickle. The key ideas are anycast routing, tiered caches, a careful cache key and fast purge.',
  tldr: {
    problem: 'Users are 100–300 ms of round trips away from your origin, and a TLS handshake plus a request costs several of them. One origin also cannot absorb global peaks or a DDoS.',
    idea: 'Put caches in hundreds of <b>PoPs</b>. Route each user to a nearby healthy PoP (<b>DNS steering</b> or <b>anycast</b>). On a miss, go to an <b>upper tier / shield</b> that coalesces requests, and only then to the origin. A <b>control plane</b> pushes config and purges to every PoP in seconds.',
    insight: 'The <b>cache key</b> and the <b>tiers</b> decide the hit ratio more than the size of the edge does. One un-normalised tracking parameter, or caching per cookie, can push the hit ratio towards zero.',
    numbers: [
      { v: '61,000+', l: 'servers in ~70 countries on Akamai\'s platform (Nygren et al., 2010)' },
      { v: '< 150 ms', l: 'Cloudflare global purge latency, P50 (Cloudflare, 2024)' },
      { v: '1T+ req/day', l: 'handled by Cloudflare\'s Pingora proxy (Cloudflare, 2022)' }
    ]
  },

  requirements: {
    functional: [
      'Cache and serve static assets, images and video segments at the edge',
      'Terminate TLS at the edge with customer certificates',
      'Route each user to a nearby, healthy PoP',
      'Purge by URL, tag or prefix',
      'Per-customer rules: cache key, TTLs, headers, WAF',
      'Access logs and analytics'
    ],
    nonFunctional: [
      'Edge hit TTFB in tens of ms (estimate)',
      'Hit ratio above ~90–95% for static content',
      'Global purge within seconds',
      'Losing a PoP causes no visible outage',
      'Absorb Tbps-scale DDoS attacks',
      'Roll out config changes safely (canaries)'
    ],
    outOfScope: ['Edge compute (Workers)', 'DNS registrar', 'Video encoding (see Video Streaming)', 'Bot-detection models']
  },

  calculator: {
    inputs: [
      { id: 'rps', label: 'Requests per second (global)', min: 10000, max: 100000000, value: 5000000, log: true },
      { id: 'size', label: 'Average object size', min: 1000, max: 5000000, value: 200000, log: true, fmt: 'bytes' },
      { id: 'hit', label: 'Edge hit ratio', min: 50, max: 99.9, step: 0.1, value: 95, unit: '%' },
      { id: 'shield', label: 'Shield hit ratio (of edge misses)', min: 0, max: 99, value: 80, unit: '%' },
      { id: 'pops', label: 'Number of PoPs', min: 10, max: 500, value: 300 }
    ],
    outputs: [
      { label: 'Edge egress', fmt: 'bits', f: (v) => v.rps * v.size * 8 },
      { label: 'Edge misses/s', f: (v) => v.rps * (1 - v.hit / 100) },
      { label: 'Origin requests/s (with shield)', f: (v) => v.rps * (1 - v.hit / 100) * (1 - v.shield / 100) },
      { label: 'Origin offload', fmt: 'pct', f: (v) => 1 - (1 - v.hit / 100) * (1 - v.shield / 100) },
      { label: 'Origin egress', fmt: 'bits', f: (v) => v.rps * (1 - v.hit / 100) * (1 - v.shield / 100) * v.size * 8 },
      { label: 'Average requests/s per PoP', f: (v) => v.rps / v.pops }
    ],
    note: 'Traffic, sizes and ratios are <em>estimates</em>; real traffic is far from evenly spread across PoPs. Move the edge hit ratio from 95% to 90%: edge misses double, and without a shield the origin load doubles too.'
  },

  api: [
    { m: 'GET', p: 'https://cdn.example.com/app.3f9a1c.js', d: 'Served from the edge. The response carries <code>Cache-Control</code>, <code>Age</code> and a cache status header (HIT / MISS / REVALIDATED).' },
    { m: 'GET', p: 'origin: If-None-Match: "v42"', d: 'Revalidation when a cached object expires. The origin answers <b>304 Not Modified</b>, so no body crosses the network.' },
    { m: 'POST', p: '/zones/{id}/purge_cache', d: 'Body <code>{files: [...]}</code>, <code>{tags: [...]}</code> or <code>{prefixes: [...]}</code>. Fans out to every PoP; returns once accepted.' },
    { m: 'PUT', p: '/zones/{id}/cache_rules', d: 'Cache-key rules (which query params, headers and cookies count), TTL overrides and bypass rules for private paths.' },
    { m: 'GET', p: '/zones/{id}/analytics?since=', d: 'Requests, bytes, hit ratio and status codes by PoP, path and cache status.' }
  ],
  dataModel: [
    { name: 'edge cache index', store: 'Per server: RAM + SSD', fields: [['key', 'hash(host, path, query*, vary*)', 'pk'], ['body_ref', 'ram | ssd offset'], ['expires_at', 'ts'], ['etag', 'text'], ['tags', 'text[]', 'idx']], note: 'Hot objects in RAM, the long tail on SSD; LRU-like eviction.' },
    { name: 'zone_config', store: 'Control-plane DB → pushed', fields: [['zone_id', 'int64', 'pk'], ['origin', 'host'], ['rules', 'jsonb'], ['version', 'int']], note: 'Every edge holds a local copy; changes roll out as versioned pushes.' },
    { name: 'purge_requests', store: 'Durable queue', fields: [['purge_id', 'uuid', 'pk'], ['zone_id', 'int64', 'idx'], ['selector', 'url | tag | prefix'], ['issued_at', 'ts']], note: 'Each PoP applies purges in order and reports completion.' }
  ],

  architecture: {
    title: 'CDN architecture',
    nodes: [
      { id: 'user', label: 'Users', sub: 'browsers · apps', kind: 'client', wide: [90, 165], tall: [70, 0], tip: 'Resolve the hostname, connect to the nearest PoP and reuse that connection.' },
      { id: 'dns', label: 'DNS / anycast', sub: 'nearest healthy PoP', kind: 'edge', wide: [290, 40], tall: [210, 0], tip: 'Either DNS returns a PoP-specific IP based on the resolver\'s location, or every PoP announces the same IP and BGP picks the closest.' },
      { id: 'l4', label: 'PoP load balancer', sub: 'L4 · DDoS filtering', kind: 'edge', wide: [290, 165], tall: [70, 105], tip: 'Spreads connections across servers in the PoP (ECMP, consistent hashing) and drops attack traffic before it reaches the cache.' },
      { id: 'edge', label: 'Edge cache', sub: 'TLS · RAM + SSD', kind: 'cache', wide: [490, 165], tall: [70, 210], tip: 'Terminates TLS, builds the cache key, serves hits, and coalesces concurrent misses for the same object.' },
      { id: 'tier', label: 'Upper tier', sub: 'regional shield', kind: 'cache', wide: [690, 165], tall: [210, 315], tip: 'A small set of larger caches near the origin. Edge misses go here first, so the origin sees one request instead of one per PoP.' },
      { id: 'origin', label: 'Origin', sub: 'customer servers', kind: 'external', wide: [890, 165], tall: [210, 420], tip: 'The source of truth. With tiering it only sees upper-tier misses and revalidations.' },
      { id: 'pop2', label: 'Neighbour PoP', sub: 'same anycast IP', kind: 'cache', wide: [290, 290], tall: [210, 105], tip: 'If a PoP withdraws its route, BGP sends its users here automatically.' },
      { id: 'logs', label: 'Logs + analytics', sub: 'per request', kind: 'store', wide: [490, 290], tall: [70, 420], tip: 'Request logs streamed off the edge for analytics, billing and security.' },
      { id: 'cust', label: 'Customer / CI', sub: 'deploy · purge', kind: 'client', wide: [890, 40], tall: [350, 0], tip: 'Deploys new assets, changes rules and purges cached content through the API.' },
      { id: 'ctrl', label: 'Control plane', sub: 'config · purge API', kind: 'service', wide: [690, 40], tall: [350, 105], tip: 'Validates config and purges, versions them, and publishes them to every PoP.' },
      { id: 'bus', label: 'Distribution bus', sub: 'fan-out to every PoP', kind: 'queue', wide: [490, 40], tall: [350, 210], tip: 'Pushes config versions and purge events to thousands of servers, in order.' }
    ],
    edges: [
      { from: 'user', to: 'dns', bidi: true },
      { from: 'user', to: 'l4', bidi: true },
      { from: 'l4', to: 'edge' },
      { from: 'edge', to: 'tier', bidi: true },
      { from: 'tier', to: 'origin', bidi: true },
      { from: 'user', to: 'pop2', bidi: true, dashed: true },
      { from: 'pop2', to: 'tier', dashed: true },
      { from: 'edge', to: 'logs' },
      { from: 'cust', to: 'ctrl' },
      { from: 'ctrl', to: 'bus' },
      { from: 'bus', to: 'edge' },
      { from: 'bus', to: 'tier' }
    ]
  },

  scenarios: [
    {
      id: 'hit', title: 'Cache hit at the edge', tone: 'ok',
      steps: [
        { text: 'The browser resolves <code>cdn.example.com</code>. With <b>anycast</b> every PoP announces the same IP, and BGP delivers packets to the nearest one.', flow: ['user>dns', 'dns>user'], badges: { dns: '104.x.x.x' } },
        { text: 'The TCP and TLS handshakes finish at a PoP ~10 ms away instead of an origin ~150 ms away. The load balancer picks a server in the PoP.', flow: ['user>l4', 'l4>edge'], badges: { l4: 'TLS @ edge' } },
        { text: 'The edge builds the <b>cache key</b> (host, path, allowed query params) and finds the object in RAM.', nodes: ['edge'], ok: ['edge'], badges: { edge: ['HIT', 'ok'] } },
        { text: 'Bytes go straight back. The origin never knew this request happened, and a log line goes to analytics.', flow: ['l4>user', 'edge>logs'], ok: ['user'], tone: 'ok' }
      ]
    },
    {
      id: 'miss', title: 'New file: miss, tiered fill, coalescing', tone: 'info',
      steps: [
        { text: 'A new build is deployed. Thousands of users in one PoP request <code>app.4b2e.js</code> at the same moment.', flow: [['user>l4', 'user>l4'], 'l4>edge'], warn: ['edge'], badges: { edge: ['MISS ×1000', 'warn'] } },
        { text: 'The edge <b>coalesces</b> them: one request goes upstream, and the other 999 wait for it.', flow: ['edge>tier'], badges: { edge: '1 upstream' } },
        { text: 'The upper tier also misses, so it fetches from the origin once for <b>all</b> PoPs that map to it.', flow: ['tier>origin', 'origin>tier'], badges: { origin: '1 request' } },
        { text: 'The object streams back to the tier, then the edge, then all 1,000 waiting users. Later PoPs that miss will hit at the tier.', flow: ['tier>edge', 'l4>user'], ok: ['edge', 'tier'], badges: { tier: ['cached', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'purge', title: 'Purge a bad asset worldwide', tone: 'warn',
      steps: [
        { text: 'A broken price list is cached everywhere with a 1-day TTL. CI calls the purge API for tag <code>prices</code>.', flow: ['cust>ctrl'], warn: ['edge'], badges: { ctrl: 'purge tag' }, tone: 'warn' },
        { text: 'The control plane writes the purge to the <b>distribution bus</b>, which fans it out to every PoP and tier.', flow: ['ctrl>bus', ['bus>edge', 'bus>tier']], badges: { bus: 'fan-out' } },
        { text: 'Each server drops (or marks stale) every object carrying that tag. Cloudflare reports under 150 ms at P50 for tag purges (2024).', nodes: ['edge', 'tier'], ok: ['edge', 'tier'], badges: { edge: ['purged', 'ok'] } },
        { text: 'The next requests are misses and refill through the tiers. Purging everything at once can stampede the origin; a <b>soft purge</b> plus <code>stale-while-revalidate</code> avoids that.', flow: ['user>l4', 'l4>edge', 'edge>tier', 'tier>origin'], badges: { origin: 'refill' }, tone: 'ok' }
      ]
    },
    {
      id: 'popdown', title: 'Failure: a PoP goes dark', tone: 'err',
      steps: [
        { text: 'The PoP loses power. Every connection through it resets.', nodes: ['l4', 'edge'], err: ['l4', 'edge'], badges: { edge: ['down', 'err'] }, tone: 'err' },
        { text: 'Its routers stop announcing the anycast prefix. Within seconds <b>BGP</b> sends those users to the next-nearest PoP with the <b>same IP</b>. No DNS TTL to wait for.', flow: ['user>pop2'], warn: ['pop2'], badges: { pop2: ['+traffic', 'warn'] }, tone: 'warn' },
        { text: 'The neighbour\'s cache is colder for this region\'s long tail, so it misses more, but the upper tier still has those objects.', flow: ['pop2>tier'], badges: { tier: 'HIT' } },
        { text: 'Clients reconnect and retry. With DNS-based steering instead, users would keep going to the dead PoP until health checks and resolver caches caught up.', nodes: ['pop2', 'user'], ok: ['pop2'], tone: 'ok' }
      ]
    },
    {
      id: 'ddos', title: 'Hot spot: a multi-Tbps DDoS', tone: 'err',
      steps: [
        { text: 'A botnet floods one customer\'s site with UDP and SYN packets at multiple Tbps.', flow: [['user>l4', 'user>pop2']], err: ['l4'], badges: { l4: ['Tbps flood', 'err'] }, tone: 'err' },
        { text: '<b>Anycast</b> splits the attack across every PoP, because each bot reaches its nearest one. No single site takes all of it.', nodes: ['l4', 'pop2'], warn: ['l4', 'pop2'], badges: { pop2: ['share', 'warn'] }, tone: 'warn' },
        { text: 'Each server drops attack packets in the kernel or NIC before they reach the cache, using fingerprints shared across the fleet.', nodes: ['l4'], ok: ['l4'], badges: { l4: ['dropped', 'ok'] } },
        { text: 'Legitimate requests are still served from cache. The origin sees nothing, ideally because it only accepts traffic from the CDN.', flow: ['l4>edge', 'l4>user'], ok: ['edge', 'origin'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: '5M requests/s of mostly static content. Hit ratios and latencies are illustrative <em>estimates</em>.',
    diagram: null, // filled below: adds a direct edge→origin path for "no tier"
    controls: [
      { id: 'route', label: 'Routing', type: 'seg', value: 'anycast', options: [
        { v: 'dns', l: 'DNS geo-steering' }, { v: 'anycast', l: 'Anycast (BGP)' }] },
      { id: 'tier', label: 'Tiers', type: 'seg', value: 'shield', options: [
        { v: 'edge', l: 'Edge only' }, { v: 'shield', l: 'Edge + upper tier' }] },
      { id: 'key', label: 'Cache key', type: 'seg', value: 'norm', options: [
        { v: 'raw', l: 'Full URL + cookies' }, { v: 'norm', l: 'Normalised (allow-listed params)' }] },
      { id: 'ttl', label: 'Freshness', type: 'seg', value: 'swr', options: [
        { v: 'short', l: '60 s TTL' }, { v: 'long', l: '1 day TTL + purge' }, { v: 'swr', l: '1 day + purge + stale-while-revalidate' }] },
      { id: 'mode', label: 'Fill model', type: 'seg', value: 'pull', options: [
        { v: 'pull', l: 'Pull (fetch on miss)' }, { v: 'push', l: 'Push (pre-position)' }] }
    ],
    evaluate(s) {
      const RPS = 5e6;
      let hit = s.key === 'raw' ? 0.4 : 0.95;
      if (s.ttl === 'short') hit *= 0.85;
      if (s.mode === 'push') hit = Math.max(hit, s.key === 'raw' ? 0.4 : 0.98);
      const shieldHit = s.tier === 'shield' ? 0.85 : 0;
      const originRps = s.mode === 'push' ? RPS * (1 - hit) * 0.05 : RPS * (1 - hit) * (1 - shieldHit);
      const ttfb = hit * 15 + (1 - hit) * (s.tier === 'shield' ? shieldHit * 55 + (1 - shieldHit) * 160 : 150);
      const metrics = [
        { k: 'Edge hit ratio', v: (hit * 100).toFixed(1) + '%', s: hit > 0.93 ? 0.92 : hit > 0.8 ? 0.6 : 0.15 },
        { k: 'Origin requests/s', v: SD.fmt.num(originRps) + '/s', s: originRps < 5e4 ? 0.92 : originRps < 3e5 ? 0.6 : 0.15, hint: 'of 5M/s' },
        { k: 'Median TTFB (est.)', v: '≈ ' + Math.round(ttfb) + ' ms', s: ttfb < 30 ? 0.9 : ttfb < 70 ? 0.6 : 0.25 },
        { k: 'Freshness after a change', v: { short: '≤ 60 s, no purge needed', long: 'seconds (purge)', swr: 'seconds (purge), no stampede' }[s.ttl], s: { short: 0.7, long: 0.75, swr: 0.9 }[s.ttl] },
        { k: 'PoP failover', v: s.route === 'anycast' ? 'seconds (BGP withdraw)' : 'DNS TTL + resolver caching: minutes', s: s.route === 'anycast' ? 0.9 : 0.4 },
        { k: 'DDoS absorption', v: s.route === 'anycast' ? 'spread across every PoP' : 'lands on the PoPs DNS chose', s: s.route === 'anycast' ? 0.9 : 0.5 },
        { k: 'Operational effort', v: s.mode === 'push' ? 'you upload and track every object' : 'set headers, the CDN fetches', s: s.mode === 'push' ? 0.45 : 0.85 }
      ];
      const notes = [];
      if (s.key === 'raw') notes.push('<code>?utm_source=…</code>, <code>?fbclid=…</code> or a session cookie in the key makes nearly every URL unique. Strip or allow-list params, and never key on cookies for public assets.');
      if (s.tier === 'edge') notes.push('Without an upper tier every PoP fetches each object from the origin separately. With 300 PoPs, one new file can mean 300 origin fetches.');
      if (s.tier === 'shield') notes.push('Cloudflare\'s Smart Tiered Cache picks one upper tier close to the origin, so only that data centre talks to it. The cost is extra latency for far-away misses.');
      if (s.ttl === 'swr') notes.push('<code>stale-while-revalidate</code> serves the cached copy while one background request refreshes it, so expiry never blocks users.');
      if (s.ttl === 'short') notes.push('A 60 s TTL means every PoP revalidates every object each minute. Conditional requests (ETag → 304) keep that cheap but not free.');
      if (s.mode === 'push') notes.push('Push suits large, predictable catalogs. Netflix Open Connect fills its appliances off-peak with what it predicts members will watch.');
      if (s.route === 'dns') notes.push('DNS steering sees the resolver\'s location, not the user\'s (unless EDNS Client Subnet is used), and resolvers cache answers past failures.');
      let verdict;
      if (s.key === 'raw') verdict = '❌ <b>The cache key is killing your hit ratio.</b> Normalise query strings and drop cookies from the key.';
      else if (s.tier === 'edge' && s.mode === 'pull') verdict = '⚠ <b>The origin sees every PoP\'s misses.</b> Add an upper tier or shield.';
      else if (s.route === 'dns') verdict = '👍 <b>Works</b>, but failover waits on DNS caches and attacks are not spread. Anycast handles both.';
      else if (s.mode === 'push') verdict = '👍 <b>Right for big, predictable catalogs</b> (video libraries, game patches). Overkill for a website.';
      else if (s.ttl === 'swr') verdict = '✅ <b>Production-grade:</b> anycast, tiered cache, a normalised key, long TTLs with purge, and stale-while-revalidate.';
      else verdict = '✅ <b>Solid.</b> Add stale-while-revalidate so expiries and purges never block users.';
      const flow = ['user>l4', 'l4>edge'].concat(s.mode === 'push' ? [] : s.tier === 'shield' ? ['edge>tier', 'tier>origin'] : ['edge>origin']);
      return {
        metrics, verdict, notes, flow,
        hide: s.tier === 'shield' ? [] : ['tier'],
        labels: {
          dns: s.route === 'anycast' ? { label: 'Anycast IP', sub: 'BGP picks nearest PoP' } : { label: 'Geo DNS', sub: 'per-PoP IP by resolver' },
          edge: { label: 'Edge cache', sub: s.key === 'raw' ? 'key: full URL + cookies' : 'key: host + path + allowed' },
          origin: s.mode === 'push' ? { label: 'CDN storage', sub: 'pre-positioned objects' } : { label: 'Origin', sub: 'customer servers' }
        },
        err: s.key === 'raw' ? ['edge'] : [],
        hot: originRps >= 3e5 ? ['origin'] : [],
        warn: s.route === 'dns' ? ['dns'] : [],
        badges: { edge: [(hit * 100).toFixed(0) + '% hit', hit > 0.93 ? 'ok' : hit > 0.8 ? 'info' : 'err'], origin: [SD.fmt.num(originRps) + '/s', originRps < 5e4 ? 'ok' : 'err'] }
      };
    }
  },

  widget: {
    title: 'Ten PoPs, Zipf traffic, real LRU caches',
    caption: 'Each PoP runs a real LRU cache with TTLs; requests follow a Zipf popularity curve. Toggle the <b>upper tier</b>, change <b>TTL</b> and <b>cache size</b>, or add a <b>tracking param</b> to the cache key, and watch the hit ratio and origin load. <b>Purge all</b> shows the refill stampede.'
  },

  realWorld: {
    intro: 'The core design was set by Akamai around 2000; Cloudflare, Fastly and in-house CDNs refined routing, tiering and purge.',
    timeline: [
      { when: '2010', who: 'Akamai', title: 'The Akamai Network paper', text: 'Nygren, Sitaraman and Sun describe an overlay of <b>61,000+ servers</b> in nearly 1,000 networks across 70 countries, built because the Internet itself is best-effort and offers no end-to-end performance guarantees.', src: 0 },
      { when: '2011', who: 'Cloudflare', title: 'Anycast everywhere', text: 'Cloudflare explains anycast: many data centres announce the same IP and routing delivers each user to the nearest one. It uses anycast at two levels, the WAN and the LAN.', src: 1 },
      { when: '2012+', who: 'Netflix', title: 'Open Connect: push to the ISP', text: 'Netflix gives qualifying ISPs free <b>Open Connect Appliances</b> to host inside their networks, and <b>fills them proactively during off-peak hours</b>, using predictions of what members will watch.', src: 5 },
      { when: '2022', who: 'Cloudflare', title: 'Pingora replaces NGINX', text: 'Cloudflare\'s Rust proxy serves <b>over 1 trillion requests a day</b>. Sharing connections across threads raised origin connection reuse for one major customer from <b>87.1% to 99.92%</b>, 160× fewer new connections.', src: 4 },
      { when: '2024', who: 'Cloudflare', title: 'Instant Purge', text: 'Purges by tag, hostname and prefix reach the whole network in <b>under 150 ms at P50</b>, a 90% improvement since May 2022.', src: 3 },
      { when: '2025', who: 'Cloudflare', title: '22.2 Tbps DDoS absorbed', text: 'Cloudflare reported mitigating an attack peaking at about <b>22.2 Tbps</b> and 10.6 billion packets per second, lasting about 40 seconds, without manual intervention.', src: 6 },
      { when: 'Today', who: 'Cloudflare', title: 'Tiered cache topologies', text: '<b>Smart</b> tiered cache uses one upper tier close to the origin, which conserves the origin but adds latency for distant users. <b>Generic global</b> lets every upper tier reach the origin, trading origin load for long-tail latency.', src: 2 }
    ],
    lessons: [
      'Get the <b>cache key</b> right before anything else.',
      'Add an <b>upper tier</b>: it turns N PoP misses into one origin request.',
      'Prefer <b>long TTLs plus fast purge</b> over short TTLs, and use stale-while-revalidate.',
      '<b>Anycast</b> gives fast failover and spreads DDoS load for free.'
    ],
    sources: [
      { title: 'The Akamai Network: A Platform for High-Performance Internet Applications', url: 'https://groups.cs.umass.edu/wp-content/uploads/sites/3/2019/12/The-akamai-network-a-platform-for-high-performance-internet-applications.pdf', pub: 'ACM SIGOPS OSR, 2010' },
      { title: 'A Brief Primer on Anycast', url: 'https://blog.cloudflare.com/a-brief-anycast-primer/', pub: 'Cloudflare Blog, 2011' },
      { title: 'Tiered Cache', url: 'https://developers.cloudflare.com/cache/how-to/tiered-cache/', pub: 'Cloudflare docs' },
      { title: 'Instant Purge: invalidating cached content in under 150ms', url: 'https://blog.cloudflare.com/instant-purge/', pub: 'Cloudflare Blog, 2024' },
      { title: 'How we built Pingora, the proxy that connects Cloudflare to the Internet', url: 'https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/', pub: 'Cloudflare Blog, 2022' },
      { title: 'Open Connect Overview', url: 'https://openconnect.netflix.com/Open-Connect-Overview.pdf', pub: 'Netflix' },
      { title: 'Cloudflare mitigates largest-ever DDoS attack at 22.2 Tbps', url: 'https://securityaffairs.com/182521/security/cloudflare-mitigates-largest-ever-ddos-attack-at-22-2-tbps.html', pub: 'Security Affairs, 2025' },
      { title: 'Cloudflare\'s Architecture: Eliminating Single Points of Failure', url: 'https://blog.cloudflare.com/cloudflares-architecture-eliminating-single-p/', pub: 'Cloudflare Blog, 2011' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Routing', '<b>DNS steering</b>: fine-grained control per user', '<b>Anycast</b>: instant failover, spreads attacks', 'Anycast by default; DNS when you must pin users to specific PoPs'],
      ['Tiers', '<b>Edge only</b>: lowest latency on a miss', '<b>Edge + upper tier</b>: far fewer origin hits', 'Tiered whenever the origin is small or far away'],
      ['Freshness', '<b>Short TTL</b>: simple, always fresh-ish', '<b>Long TTL + purge</b>: high hit ratio', 'Long TTLs with versioned filenames and tag purge'],
      ['Fill', '<b>Pull</b>: zero setup, fetch on miss', '<b>Push</b>: pre-positioned, origin-free', 'Push for big predictable catalogs (video, patches)'],
      ['Dynamic content', '<b>Bypass cache</b>: always correct', '<b>Micro-cache 1–5 s</b> + connection reuse', 'Micro-cache public dynamic pages under heavy load']
    ]
  },
  failures: [
    { f: 'Hit ratio collapses after a release', detect: 'Hit ratio and origin RPS by path', fix: 'Fix the cache key (query params, Vary, cookies); check Cache-Control from the origin.' },
    { f: 'Origin stampede after purge or expiry', detect: 'Origin RPS spike right after a purge', fix: 'Request coalescing, upper tier, soft purge, stale-while-revalidate.' },
    { f: 'PoP outage', detect: 'Health checks and BGP monitoring', fix: 'Withdraw the anycast route; neighbours absorb traffic.' },
    { f: 'Bad config pushed globally', detect: 'Error rate right after a config version', fix: 'Stage rollouts by PoP with automatic rollback; validate before publishing.' },
    { f: 'Private data cached and shown to others', detect: 'Responses with Set-Cookie or user data served as HIT', fix: '<code>Cache-Control: private</code> or <code>no-store</code> for personal responses; never cache with Set-Cookie.' },
    { f: 'DDoS on the origin directly', detect: 'Origin traffic not coming from CDN ranges', fix: 'Allow only CDN IPs or authenticated origin pulls; keep the origin IP secret.' }
  ],

  interview: [
    { q: 'Anycast vs DNS-based routing?', a: '<p><b>DNS</b>: the authoritative server returns a PoP-specific IP chosen from the resolver\'s location and PoP health. It allows fine control, but it sees the resolver rather than the user, and failover waits on DNS caches.</p><p><b>Anycast</b>: every PoP announces the same IP and BGP routes to the nearest. Failover is a route withdrawal (seconds) and attacks spread naturally. You give up some control because BGP\'s "nearest" is about networks, not geography.</p>', lvl: 'core' },
    { q: 'What goes into a cache key, and what are the pitfalls?', a: '<p>Typically scheme, host, path and the <b>query params that change the response</b>. Pitfalls:</p><ul><li>Tracking params (<code>utm_*</code>, <code>fbclid</code>) make every URL unique.</li><li>Parameter order: <code>?a=1&b=2</code> vs <code>?b=2&a=1</code>, so sort them.</li><li><code>Vary: User-Agent</code> or <code>Vary: Cookie</code> fragments the cache.</li><li>Leaving a param out that <i>does</i> change the response serves wrong content.</li></ul>', lvl: 'core' },
    { q: 'How do you purge content globally in seconds?', a: '<p>The API writes the purge to a durable log, and a fan-out system pushes it to every PoP and tier, which apply it in order. Tag-based purge needs a <b>tag → keys index</b> on each server. Prefer <b>soft purge</b> (mark stale and revalidate) to avoid a stampede. Cloudflare reports under 150 ms P50 for tag purges.</p>', lvl: 'core' },
    { q: 'What is an origin shield and why use one?', a: '<p>An upper-tier cache that all edges (or a region\'s edges) go to on a miss. A new object then costs one origin fetch instead of one per PoP, and the shield coalesces concurrent misses. The cost is an extra hop on misses and a potential bottleneck, so you need several shields and a fallback path.</p>', lvl: 'core' },
    { q: 'How does a CDN speed up dynamic, uncacheable content?', a: '<ul><li><b>TLS termination near the user</b>: handshake round trips are short.</li><li><b>Warm, reused connections</b> from edge to origin (Pingora\'s connection reuse cut new origin connections 160× for one customer).</li><li><b>Optimised routes</b> across the CDN backbone instead of the public internet.</li><li><b>Micro-caching</b> of public dynamic pages for 1–5 s.</li></ul>', lvl: 'deep' },
    { q: 'What is request coalescing?', a: '<p>When many requests miss on the same key at once, the cache sends <b>one</b> request upstream and makes the rest wait for its response. Without it, a popular new object or an expiry turns into a thundering herd on the origin.</p>', lvl: 'core' },
    { q: 'How would you version static assets?', a: '<p>Put a content hash in the filename (<code>app.3f9a1c.js</code>) and serve it with <code>Cache-Control: public, max-age=31536000, immutable</code>. HTML that references it gets a short TTL or is revalidated. A deploy then needs no purge: new HTML points to new URLs.</p>', lvl: 'core' },
    { q: 'Push CDN vs pull CDN?', a: '<p><b>Pull</b>: the CDN fetches from your origin on a miss. Zero setup, but the first request in each PoP is slow. <b>Push</b>: you upload content to the CDN\'s storage ahead of time. Good for large, predictable catalogs; you must manage what is where. Netflix Open Connect fills appliances off-peak with predicted demand.</p>', lvl: 'core' },
    { q: 'How does a CDN absorb a large DDoS?', a: '<p>Anycast spreads the attack across every PoP, so each one sees a fraction. Servers drop packets early (XDP / NIC filters) based on fingerprints, SYN cookies handle SYN floods, and rate limits and WAF rules stop L7 floods. The origin only accepts CDN traffic, so attackers cannot go around it.</p>', lvl: 'deep' },
    { q: 'How do you choose TTLs?', a: '<p>Immutable, versioned assets: a year. Content that changes but can be purged: hours to days, plus purge on change. Truly live data: seconds, or bypass. Add <code>stale-while-revalidate</code> and <code>stale-if-error</code> so expiry and origin outages do not hurt users.</p>', lvl: 'core' },
    { q: 'How is cache storage organised on one edge server?', a: '<p>Hot objects in <b>RAM</b>, the long tail on <b>SSD</b>, with an LRU-like policy that resists one-hit wonders (for example, admit to SSD only on the second request). Inside a PoP, consistent hashing on the cache key makes each object live on one or two servers instead of all of them, which multiplies the effective cache size.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot: CDN-friendly cache headers + ETag', lang: 'java',
      code: `@RestController
@RequestMapping("/api/products")
public class ProductController {
  private final ProductService products;
  public ProductController(ProductService products) { this.products = products; }

  @GetMapping("/{id}")
  public ResponseEntity<ProductDto> get(@PathVariable long id, WebRequest request) {
    ProductDto p = products.find(id);
    String etag = "\\"" + p.version() + "\\"";
    if (request.checkNotModified(etag)) {
      return null;                                  // Spring sends 304, no body
    }
    return ResponseEntity.ok()
        .eTag(etag)
        .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60))   // browsers
            .sMaxAge(Duration.ofDays(1))                            // CDN
            .staleWhileRevalidate(Duration.ofSeconds(60))
            .cachePublic())
        .header("Cache-Tag", "product-" + id)         // purge by tag on change
        .body(p);
  }
}

// application.yml: fingerprinted static assets, cached for a year
// spring.web.resources.chain.strategy.content.enabled: true
// spring.web.resources.chain.strategy.content.paths: /**
// spring.web.resources.cache.cachecontrol.max-age: 365d
// spring.web.resources.cache.cachecontrol.cache-public: true`,
      note: 'The tag header name depends on the CDN (<code>Cache-Tag</code> on Cloudflare, <code>Surrogate-Key</code> on Fastly). When the product changes, purge <code>product-{id}</code>.'
    },
    {
      title: 'Python: cache-key normalisation + single-flight', lang: 'python',
      code: `import asyncio
from urllib.parse import urlsplit, parse_qsl, urlencode

ALLOWED = {"w", "h", "format", "v"}                  # params that change the response

def cache_key(url: str) -> str:
    u = urlsplit(url)
    q = sorted((k, v) for k, v in parse_qsl(u.query) if k in ALLOWED)
    return f"{u.hostname.lower()}{u.path}?{urlencode(q)}"

class SingleFlight:
    """One upstream fetch per key; concurrent callers await the same future."""
    def __init__(self):
        self._inflight: dict[str, asyncio.Future] = {}

    async def get(self, key: str, fetch):
        if key in self._inflight:
            return await self._inflight[key]
        fut = asyncio.get_running_loop().create_future()
        self._inflight[key] = fut
        try:
            fut.set_result(await fetch())
        except Exception as e:
            fut.set_exception(e)
        finally:
            del self._inflight[key]
        return await fut

# cache_key("https://CDN.x.com/i.png?utm_source=ad&h=200&w=100")
# -> "cdn.x.com/i.png?h=200&w=100"`,
      note: 'If the fetch fails and no other caller awaited the future, the stored exception is still retrieved by the final <code>await fut</code>, so asyncio does not warn about it.'
    },
    {
      title: 'bash: inspect cache status and purge by tag', lang: 'bash',
      code: `# is it cached? look at the cache status, Age and Cache-Control
curl -sI https://cdn.example.com/app.3f9a1c.js \\
  | grep -iE '^(cf-cache-status|x-cache|age|cache-control|etag):'

# purge everything tagged "prices" (Cloudflare API)
curl -sS -X POST \\
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \\
  -H "Authorization: Bearer $CF_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data '{"tags":["prices"]}'

# other selectors: {"files":["https://…/a.css"]}, {"prefixes":["cdn.example.com/img/"]}`
    }
  ],

  related: ['video-streaming', 'live-streaming', 'distributed-cache', 'rate-limiter', 'object-storage', 'api-gateway']
});

/* knobs diagram = architecture + a direct edge → origin path used when there is no upper tier */
(function () {
  const d = SD.data;
  const a = d.architecture;
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes,
    edges: a.edges.concat([{ from: 'edge', to: 'origin', bend: 0.25, dashed: true }])
  };
})();
