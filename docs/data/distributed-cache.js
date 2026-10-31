SD.register({
  slug: 'distributed-cache',
  domain: 1,
  title: 'Distributed Cache',
  examples: 'Memcache @ Facebook, Redis',
  tagline: 'Serve most reads from RAM spread over many nodes, keep the database alive behind it, and <b>stay correct enough</b> when data changes, keys go hot or a node dies.',
  tldr: {
    problem: 'The database can serve thousands of reads per second; the product needs millions. Reads are skewed: a few keys are very hot.',
    idea: 'Put a <b>look-aside cache</b> in front of the DB, <b>sharded by key hash</b> (consistent hashing or Redis hash slots). On a write, update the DB and <b>delete</b> the cached key.',
    insight: 'The hard part is not speed but <b>invalidation and herds</b>: stale sets after races, stampedes when a hot key expires, and load spikes when a node dies. Leases, gutter pools and change-log invalidation solve them.',
    numbers: [
      { v: 'billions/s', l: 'requests served by Facebook\'s memcache tier (NSDI \'13 paper)' },
      { v: '~5B/s', l: 'peak requests through mcrouter at Facebook (2014)' },
      { v: '16,384', l: 'hash slots in a Redis Cluster (CRC16 mod 16384)' }
    ]
  },
  intro: {
    what: 'A distributed cache keeps copies of frequently read data <b>in memory</b>, spread across many servers, so applications can read it much faster than from the database. The database stays the <b>source of truth</b>. The cache only holds copies that can be thrown away and rebuilt at any time.',
    analogy: {
      icon: '📚',
      title: 'A library front desk that keeps the popular books',
      text: 'The library\'s stacks hold every book, but fetching one takes a while. So the front desk keeps copies of the most requested books within arm\'s reach. If a book is not at the desk, a clerk fetches it from the stacks and leaves a copy at the desk for the next reader. When a book gets a new edition, the desk copy is thrown away so nobody reads the old one. A big library has several desks, each in charge of a range of titles. Unlike a real desk, a cache copy can be briefly out of date before it is thrown away.'
    },
    problem: 'Your app shows each user\'s profile on every page. Every page view reads the same rows from the database again and again, and a database can only answer so many queries per second. When traffic grows tenfold the database falls over, even though almost all of those reads ask for data that has not changed. The question is <b>"how do I serve most reads from fast memory without showing stale data, and without crushing the database when the cache misses?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'Put one cache server in front of the database',
        text: 'The app asks the cache first. On a <b>miss</b> (the key is not there) it reads the database and stores a copy in the cache with an expiry time. Later reads are <b>hits</b> served from memory. This pattern is called <b>cache-aside</b>, and it takes most of the load off the database.',
        scene: {
          nodes: [
            { id: 'app', label: 'App servers', sub: 'cache first', kind: 'service', at: [70, 0] },
            { id: 'cache', label: 'Cache server', sub: 'one box · RAM', kind: 'cache', at: [350, 0] },
            { id: 'db', label: 'Database', sub: 'source of truth', kind: 'store', at: [70, 220] }
          ],
          edges: [{ from: 'app', to: 'cache' }, { from: 'app', to: 'db' }],
          flow: ['app>cache', 'app>db', 'app>cache']
        }
      },
      {
        stage: 'breaks',
        title: 'One box fills up, and every miss lands at once',
        text: 'The data outgrows one machine\'s memory and network. When the box restarts, or a very popular key expires, thousands of requests miss <b>at the same moment</b> and all query the database for the same row: a <b>stampede</b>. Writes cause a quieter problem too: the cache can keep serving the old value after the database changed.',
        scene: {
          nodes: [
            { id: 'app', label: 'App servers', sub: 'all miss at once', kind: 'service', at: [70, 0] },
            { id: 'cache', label: 'Cache server', sub: 'full · restarting', kind: 'cache', at: [350, 0] },
            { id: 'db', label: 'Database', sub: 'same query ×1000', kind: 'store', at: [70, 220] }
          ],
          edges: [{ from: 'app', to: 'cache' }, { from: 'app', to: 'db' }],
          flow: ['app>cache', ['app>db', 'app>db'], ['app>db', 'app>db']],
          warn: ['cache'],
          err: ['db'],
          badges: { cache: ['miss', 'warn'], db: ['stampede', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Shard by key, delete on write, let one request refill',
        text: 'Spread keys over many cache servers by <b>hashing the key</b>, using consistent hashing so adding a server moves only a few keys. On a write, update the database and then <b>delete</b> the cached copy. When a hot key is missing, a <b>lease</b> lets only one request reload it while the others wait a moment.',
        scene: {
          nodes: [
            { id: 'app', label: 'App servers', sub: 'cache-aside', kind: 'service', at: [70, 0] },
            { id: 'rtr', label: 'hash(key)', sub: 'picks a shard', kind: 'edge', at: [210, 110] },
            { id: 's1', label: 'Shard A', sub: '⅓ of keys · RAM', kind: 'cache', at: [350, 0] },
            { id: 's2', label: 'Shard B', sub: '⅓ of keys · RAM', kind: 'cache', at: [350, 110] },
            { id: 's3', label: 'Shard C', sub: '⅓ of keys · RAM', kind: 'cache', at: [350, 220] },
            { id: 'db', label: 'Database', sub: '1 reload per key', kind: 'store', at: [70, 220] }
          ],
          edges: [{ from: 'app', to: 'rtr' }, { from: 'rtr', to: 's1' }, { from: 'rtr', to: 's2' }, { from: 'rtr', to: 's3' }, { from: 'app', to: 'db' }],
          flow: ['app>rtr', 'rtr>s2', 'app>rtr', 'rtr>s3'],
          ok: ['s1', 's2', 's3', 'db'],
          badges: { s2: ['hit', 'ok'] }
        }
      }
    ],
    usedBy: ['Facebook', 'Twitter / X', 'Stack Overflow', 'Redis', 'Memcached', 'Amazon ElastiCache'],
    whenToUse: [
      'Reads far outnumber writes, and the <b>same items</b> are read again and again',
      'The database is the bottleneck, and a value that is a few seconds old is acceptable',
      'Results are expensive to compute or fetch, such as a rendered feed or a joined query'
    ],
    whenNot: [
      'The value must always be exactly current, like a balance during a money transfer',
      'The data must survive restarts on its own: use a real store (see <a href="kv-store.html">Distributed Key-Value Store</a>)',
      'You want to cache whole files and pages close to users around the world: use a <a href="cdn.html">Content Delivery Network</a>'
    ],
    glossary: [
      { term: 'Cache-aside (look-aside)', def: 'The app checks the cache, reads the database on a miss, then writes the value into the cache itself.' },
      { term: 'Hit ratio', def: 'The share of reads answered by the cache; a small drop can multiply the load on the database.' },
      { term: 'TTL', def: 'Time to live: how long a cached copy may be kept before it expires and is reloaded.' },
      { term: 'Consistent hashing', def: 'A way to map keys to servers so that adding or removing a server moves only a small share of keys.' },
      { term: 'Invalidation', def: 'Removing a cached copy after the underlying data changes, so the next read loads the fresh value.' },
      { term: 'Stampede (thundering herd)', def: 'Many requests miss the same key at once and all hit the database together.' },
      { term: 'Lease', def: 'A short permission the cache gives to one client to reload a missing key, so the others wait instead of piling on.' },
      { term: 'Hot key', def: 'A single key read so often that the one server holding it becomes overloaded.' }
    ]
  },

  requirements: {
    functional: [
      '<code>get / set / delete</code> by key, with TTL',
      'Batch reads (<code>multi-get</code>) for page rendering',
      'Invalidate on DB writes',
      'Add or remove nodes without a full cache flush',
      'Atomic counters and simple data structures (Redis)',
      'Per-key or per-namespace TTLs'
    ],
    nonFunctional: [
      'Sub-millisecond p99 inside a datacenter',
      'Hit ratio ≥ 95% on skewed traffic',
      'A node failure must not overload the DB',
      'Bounded staleness after writes (seconds)',
      'Scale linearly with nodes',
      'Hot keys must not melt one node'
    ],
    outOfScope: ['Durable storage (the DB is the source of truth)', 'CDN / edge caching of HTTP responses', 'Full-text or secondary-index queries']
  },

  calculator: {
    inputs: [
      { id: 'qps', label: 'Read requests / second', min: 10000, max: 100000000, value: 5000000, log: true },
      { id: 'hit', label: 'Hit ratio', min: 50, max: 99.9, step: 0.1, value: 95, unit: '%' },
      { id: 'items', label: 'Items in the hot set', min: 1000000, max: 10000000000, value: 200000000, log: true },
      { id: 'size', label: 'Average item size (key + value)', min: 100, max: 100000, value: 800, log: true, fmt: 'bytes' },
      { id: 'rep', label: 'Copies of each item (primary + replicas)', min: 1, max: 3, value: 2 },
      { id: 'ram', label: 'Usable RAM per cache node (GB)', min: 16, max: 512, value: 64, log: true, unit: 'GB' }
    ],
    outputs: [
      { label: 'DB reads/s from misses', f: (v) => v.qps * (1 - v.hit / 100) },
      { label: 'DB reads/s if the cache were empty', f: (v) => v.qps },
      { label: 'Cache memory (×1.3 overhead, × copies)', fmt: 'bytes', f: (v) => v.items * v.size * 1.3 * v.rep },
      { label: 'Cache nodes needed (by RAM)', fmt: 'raw', f: (v) => String(Math.max(1, Math.ceil((v.items * v.size * 1.3 * v.rep) / (v.ram * 1e9)))) },
      { label: 'Cache egress for hits', fmt: 'bytesps', f: (v) => v.qps * (v.hit / 100) * v.size },
      { label: 'Extra DB load per 1% hit-ratio drop', f: (v) => v.qps * 0.01 }
    ],
    note: 'The 1.3× per-item overhead (keys, pointers, allocator slack) is an <em>estimate</em>. Look at the last row: at high QPS a <b>one-point drop in hit ratio</b> can double the DB load. Hit ratio is the number to watch.'
  },

  api: [
    { m: 'GET', p: 'get(key) / mget(keys[])', d: 'Look-aside read. On a miss the <b>application</b> loads from the DB and calls <code>set</code>. Batch keys per page to cut round trips.' },
    { m: 'PUT', p: 'set(key, value, ttl)', d: 'Always with a TTL (plus a little random jitter) so mistakes heal themselves and expiries do not line up.' },
    { m: 'DELETE', p: 'delete(key)', d: 'Called after a DB write, and by the change-log invalidator. Deletes are idempotent, so they are safe to retry and to broadcast.' },
    { m: 'RPC', p: 'lease_get(key) → value | token', d: 'Facebook-style lease: on a miss the server hands out a token. Only the token holder may <code>set</code>; a delete in between voids the token.' },
    { m: 'RPC', p: 'CLUSTER SLOTS / -MOVED 3999 10.0.0.7:6379', d: 'Redis Cluster: the client caches the slot → node map and follows <code>MOVED</code> / <code>ASK</code> redirects while slots migrate.' }
  ],
  dataModel: [
    { name: 'Cache entry', store: 'Memcached / Redis (RAM)', fields: [['key', 'user:42:profile', 'pk'], ['value', 'serialized bytes'], ['ttl', 'seconds'], ['cas / version', 'int64']], note: 'Key naming includes a schema version (<code>v3:user:42</code>) so a deploy can switch formats safely.' },
    { name: 'Ring / slot map', store: 'Client router config', fields: [['vnode_hash', 'uint32', 'pk'], ['node', 'host:port'], ['slot (Redis)', '0…16383', 'idx']], note: 'Consistent-hash ring with many virtual nodes per server, or Redis Cluster\'s 16384 slots.' },
    { name: 'Source table', store: 'Postgres', fields: [['id', 'bigint', 'pk'], ['…columns', ''], ['updated_at', 'timestamptz'], ['version', 'int']], note: 'The truth. Its WAL / binlog drives invalidation.' }
  ],

  architecture: {
    title: 'Distributed cache architecture',
    nodes: [
      { id: 'l1', label: 'L1 local cache', sub: 'in-process, hot keys', kind: 'cache', wide: [160, 40], tall: [70, 0], tip: 'A tiny per-server cache (e.g. Caffeine) with a short TTL for the hottest keys. Takes hot-key load off any single shard.' },
      { id: 'app', label: 'App servers', sub: 'cache-aside client', kind: 'service', wide: [160, 160], tall: [210, 0], tip: 'Read: cache first, DB on miss, then set. Write: DB first, then delete the key.' },
      { id: 'db', label: 'Postgres', sub: 'source of truth', kind: 'store', wide: [160, 280], tall: [350, 0], tip: 'Must survive the load of all misses, plus the extra misses after a node failure or a cold start.' },
      { id: 'gut', label: 'Gutter pool', sub: 'takes over dead shard', kind: 'cache', wide: [460, 40], tall: [70, 105], tip: 'A small spare pool (Facebook used about 1% of servers). When a shard does not answer, clients use the gutter instead of rehashing, so the DB is not hit by a wave of misses. Entries expire quickly.' },
      { id: 'rtr', label: 'Client router', sub: 'ring + vnodes (mcrouter)', kind: 'edge', wide: [460, 160], tall: [210, 105], tip: 'Maps key → shard with consistent hashing (or Redis slots). Facebook runs mcrouter as a proxy that speaks the memcached protocol.' },
      { id: 'inv', label: 'Invalidator', sub: 'tails WAL → DELETE', kind: 'queue', wide: [460, 280], tall: [350, 105], tip: 'Reads the DB commit log (Facebook\'s mcsqueal; Debezium/logical decoding on Postgres) and sends deletes for changed keys. Catches writers that forgot to invalidate.' },
      { id: 's1', label: 'Cache shard 1', sub: 'primary + replica', kind: 'cache', wide: [790, 40], tall: [70, 210], tip: 'Owns a set of ring ranges (or hash slots). Evicts with LRU/LFU when full.' },
      { id: 's2', label: 'Cache shard 2', sub: 'primary + replica', kind: 'cache', wide: [790, 160], tall: [210, 210], tip: 'Each shard is independent: no cross-shard transactions, which is why it scales linearly.' },
      { id: 's3', label: 'Cache shard 3', sub: 'primary + replica', kind: 'cache', wide: [790, 280], tall: [350, 210], tip: 'Adding a shard with consistent hashing moves only about 1/N of keys.' }
    ],
    edges: [
      { from: 'app', to: 'l1', bidi: true },
      { from: 'app', to: 'rtr', bidi: true },
      { from: 'app', to: 'db' },
      { from: 'rtr', to: 'gut', dashed: true },
      { from: 'rtr', to: 's1' },
      { from: 'rtr', to: 's2' },
      { from: 'rtr', to: 's3' },
      { from: 'db', to: 'inv', label: 'WAL' },
      { from: 'inv', to: 'rtr' }
    ]
  },

  scenarios: [
    {
      id: 'aside', title: 'Cache-aside: miss, then hit', tone: 'ok',
      steps: [
        { text: 'A request needs <code>user:42</code>. The app asks the router, which hashes the key to <b>shard 2</b>.', flow: ['app>rtr', 'rtr>s2'], badges: { s2: ['miss', 'warn'] } },
        { text: 'Miss. The app reads the row from <b>Postgres</b> (a few ms instead of sub-ms).', flow: ['app>db'], badges: { db: 'SELECT … id=42' } },
        { text: 'The app writes the value back with a <b>TTL</b> (plus jitter, so keys loaded together do not expire together).', flow: ['app>rtr', 'rtr>s2'], badges: { s2: 'set · ttl 600 s' } },
        { text: 'The next thousand reads hit shard 2 in well under a millisecond. The DB sees none of them.', flow: ['app>rtr', 'rtr>s2'], ok: ['s2'], badges: { s2: ['hit', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'write', title: 'Write → invalidate', tone: 'info',
      steps: [
        { text: 'A user edits their profile. The app writes <b>Postgres first</b>; the DB is the source of truth.', flow: ['app>db'], badges: { db: 'UPDATE users' } },
        { text: 'Then it <b>deletes</b> the key (it does not set the new value). Deletes are idempotent and cannot race into storing an old value.', flow: ['app>rtr', 'rtr>s2'], badges: { s2: 'DELETE user:42' } },
        { text: 'As a safety net, the <b>invalidator</b> tails the WAL and sends the same delete. This catches writes from batch jobs and other services that forgot to invalidate.', flow: ['db>inv', 'inv>rtr', 'rtr>s2'], badges: { inv: 'from WAL' } },
        { text: 'The next read misses and reloads the fresh row. Staleness is bounded by replication + invalidation lag, usually well under a second.', flow: ['app>rtr', 'rtr>s2', 'app>db'], ok: ['s2'], tone: 'ok' }
      ]
    },
    {
      id: 'stampede', title: 'Hot key expires → stampede', tone: 'warn',
      steps: [
        { text: 'A celebrity\'s profile is read <b>50,000 times/s</b>. Its TTL runs out.', flow: [['app>rtr', 'app>rtr'], 'rtr>s2'], warn: ['s2'], badges: { s2: ['expired', 'warn'] }, tone: 'warn' },
        { text: 'Without protection, <b>every concurrent miss</b> queries the DB for the same row: thousands of identical queries in the time one takes.', flow: [['app>db', 'app>db']], err: ['db'], badges: { db: ['herd', 'err'] }, tone: 'err' },
        { text: '<b>Leases</b> (Facebook): the first miss gets a token and loads the row. Other clients are told to wait briefly and retry instead of querying.', nodes: ['s2', 'app'], badges: { s2: 'lease → 1 loader' } },
        { text: 'One DB query, one <code>set</code> with the token, then everyone hits. The paper reports leases cutting a peak DB query rate from <b>17K/s to 1.3K/s</b>.', flow: ['app>db', 'app>rtr', 'rtr>s2'], ok: ['db', 's2'], badges: { db: ['1 query', 'ok'] }, tone: 'ok' },
        { text: 'For extreme keys, also keep a copy in each server\'s <b>L1 cache</b> for a second or two. The shard then sees one read per server, not one per request.', flow: ['app>l1'], ok: ['l1'], badges: { l1: 'hot key copy' }, tone: 'ok' }
      ]
    },
    {
      id: 'node-loss', title: 'Cache shard dies', tone: 'err',
      steps: [
        { text: 'Shard 2 stops answering. A third of all keys are suddenly unreachable.', flow: ['rtr>s2'], err: ['s2'], badges: { s2: ['down', 'err'] }, tone: 'err' },
        { text: 'Naive fix: rehash its keys to shards 1 and 3. They all start <b>cold</b>, so their misses flood the DB at the worst possible moment.', flow: [['rtr>s1', 'rtr>s3'], 'app>db'], warn: ['db'], badges: { db: ['+33% misses', 'warn'] }, tone: 'warn' },
        { text: '<b>Gutter pool</b> (Facebook): on a timeout the client retries against a small spare pool. The first miss there loads from the DB and fills it with a short TTL.', flow: ['rtr>gut'], ok: ['gut'], badges: { gut: 'serving shard 2 keys' } },
        { text: 'Load on the DB stays bounded and the other shards keep their hit ratio. When shard 2 (or its replacement) returns, traffic moves back.', nodes: ['s2', 'gut', 'db'], ok: ['s2', 'db'], badges: { s2: ['replaced', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'stale-set', title: 'Race: stale value cached', tone: 'warn',
      steps: [
        { text: 'Reader A misses on <code>user:42</code> and reads the row from the DB: <b>name = "Ann"</b>.', flow: ['app>rtr', 'rtr>s2', 'app>db'], badges: { app: 'A has "Ann"' } },
        { text: 'Before A writes it back, writer B updates the row to <b>"Anna"</b> and deletes the key, which is not there yet.', flow: ['app>db', 'app>rtr', 'rtr>s2'], badges: { db: '"Anna"' } },
        { text: 'A finally <code>set</code>s its old value. The cache now holds <b>"Ann"</b> until the TTL expires: a <b>stale set</b>.', flow: ['app>rtr', 'rtr>s2'], warn: ['s2'], badges: { s2: ['"Ann" (stale)', 'warn'] }, tone: 'warn' },
        { text: 'Fixes: <b>leases</b> (B\'s delete voids A\'s token, so A\'s set is rejected), versioned sets (only newer versions win), or a short TTL as a backstop.', nodes: ['s2'], ok: ['s2'], badges: { s2: ['set rejected', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose the caching pattern, eviction policy, sharding scheme and stampede protection. The router and shard labels follow your choices.',
    controls: [
      { id: 'pat', label: 'Caching pattern', type: 'seg', value: 'aside', options: [
        { v: 'aside', l: 'Cache-aside' }, { v: 'rt', l: 'Read-through' }, { v: 'wt', l: 'Write-through' }, { v: 'wb', l: 'Write-behind' }] },
      { id: 'ev', label: 'Eviction (Redis maxmemory-policy)', type: 'seg', value: 'lru', options: [
        { v: 'lru', l: 'allkeys-lru' }, { v: 'lfu', l: 'allkeys-lfu' }, { v: 'none', l: 'noeviction (TTL only)' }] },
      { id: 'shard', label: 'Sharding', type: 'seg', value: 'ring', options: [
        { v: 'mod', l: 'hash % N' }, { v: 'ring', l: 'Consistent hash + vnodes' }, { v: 'slots', l: 'Redis 16384 slots' }] },
      { id: 'herd', label: 'Stampede protection', type: 'seg', value: 'none', options: [
        { v: 'none', l: 'None' }, { v: 'lease', l: 'Leases' }, { v: 'early', l: 'Probabilistic early expiry' }, { v: 'single', l: 'Request coalescing' }] },
      { id: 'n', label: 'Cache nodes', type: 'range', min: 2, max: 64, step: 1, value: 8 }
    ],
    evaluate(s) {
      const n = s.n, apps = 200, concurrent = 2000; // illustrative: app servers, concurrent readers of one hot key
      const hit = { lru: [0.95, '≈ 95% (recency)'], lfu: [0.96, '≈ 96% (frequency, skewed load)'], none: [0.9, 'writes fail when full (OOM)'] }[s.ev];
      let hitS = s.ev === 'none' ? 0.3 : hit[0];
      const stale = { aside: ['until delete / TTL; race possible', 0.65], rt: ['until delete / TTL; race possible', 0.65], wt: ['≈ none: cache updated on write', 0.9], wb: ['none in cache; DB lags', 0.75] }[s.pat];
      const wlat = { aside: ['DB write + delete', 0.75], rt: ['DB write + delete', 0.75], wt: ['DB write + cache write', 0.55], wb: ['cache only (fastest)', 0.95] }[s.pat];
      const moved = s.shard === 'mod' ? n / (n + 1) : 1 / (n + 1);
      const herdN = { none: concurrent, lease: 1, early: 1, single: apps }[s.herd];
      const loss = s.pat === 'wb' ? ['writes lost if a node dies before flush', 0.15] : ['none (DB written first)', 0.95];
      const metrics = [
        { k: 'Hit ratio', v: hit[1], s: hitS, hint: 'illustrative' },
        { k: 'Staleness after write', v: stale[0], s: stale[1] },
        { k: 'Write latency', v: wlat[0], s: wlat[1] },
        { k: 'Keys moved on +1 node', v: (moved * 100).toFixed(moved < 0.1 ? 1 : 0) + '% of keys', s: 1 - moved },
        { k: 'DB queries on hot-key expiry', v: '≈ ' + SD.fmt.num(herdN) + (s.herd === 'single' ? ' (1 per app server)' : ''), s: herdN <= 1 ? 0.95 : herdN <= apps ? 0.6 : 0.1 },
        { k: 'Data-loss risk', v: loss[0], s: loss[1] }
      ];
      const notes = [];
      if (s.shard === 'mod') notes.push('<code>hash % N</code>: going from ' + n + ' to ' + (n + 1) + ' nodes remaps ≈ ' + Math.round(moved * 100) + '% of keys. The cache is effectively flushed and the DB takes every miss.');
      if (s.shard === 'ring') notes.push('Consistent hashing moves ≈ 1/(N+1) of keys. Each server owns many <b>virtual nodes</b> on the ring so load and moved keys are spread evenly.');
      if (s.shard === 'slots') notes.push('Redis Cluster: <code>CRC16(key) mod 16384</code> picks a slot; slots are assigned to primaries and moved with <code>MIGRATE</code>. Clients follow <code>MOVED</code>/<code>ASK</code>. Use <code>{hash tags}</code> to keep related keys in one slot.');
      if (s.herd === 'none') notes.push('About ' + SD.fmt.num(concurrent) + ' concurrent readers (illustrative) all miss and query the DB for the same row.');
      if (s.herd === 'lease') notes.push('Leases also fix <b>stale sets</b>: a delete invalidates the outstanding token, so a slow reader cannot write an old value back.');
      if (s.herd === 'early') notes.push('XFetch-style early expiry: each reader recomputes early with a probability that rises as expiry nears, so usually exactly one refreshes before the TTL.');
      if (s.herd === 'single') notes.push('Coalescing (single-flight, Spring <code>@Cacheable(sync = true)</code>) dedupes per process: ' + apps + ' app servers still send ' + apps + ' queries.');
      if (s.pat === 'wb') notes.push('Write-behind acknowledges before the DB has the data. Only for data you can lose or rebuild (counters, view counts).');
      if (s.ev === 'none') notes.push('Redis\'s default <code>maxmemory-policy</code> is <code>noeviction</code>: when memory is full, writes return OOM errors. Set an eviction policy for a cache.');
      let verdict;
      if (s.pat === 'wb') verdict = '⚠ <b>Fast writes, but the cache is now a database</b> without a database\'s durability. Avoid for anything users would miss.';
      else if (s.ev === 'none') verdict = '❌ <b>No eviction:</b> a full cache starts rejecting writes. Use allkeys-lru or allkeys-lfu.';
      else if (s.shard === 'mod') verdict = '⚠ <b>Scaling the cache flushes it.</b> Use consistent hashing or Redis slots.';
      else if (s.herd === 'none') verdict = '⚠ <b>One hot-key expiry can take down the DB.</b> Add leases, early expiry or at least coalescing.';
      else if (s.pat === 'aside' && s.herd === 'lease') verdict = '✅ <b>Facebook-style:</b> look-aside, delete on write, leases against herds and stale sets, consistent hashing.';
      else verdict = '👍 <b>Solid.</b> Check staleness and write latency for your read/write mix.';
      const rtrSub = { mod: 'hash(key) % N', ring: 'ring + vnodes', slots: '16384 slots · MOVED' }[s.shard];
      const evSub = { lru: 'allkeys-lru', lfu: 'allkeys-lfu', none: 'noeviction' }[s.ev];
      const flow = s.pat === 'wb' ? ['app>rtr', 'rtr>s2', 's2>db'] : s.pat === 'wt' ? ['app>rtr', 'rtr>s2', 'app>db'] : s.pat === 'rt' ? ['app>rtr', 'rtr>s2', 's2>db'] : ['app>rtr', 'rtr>s2', 'app>db'];
      return {
        metrics, verdict, notes, flow,
        labels: { rtr: { label: s.shard === 'slots' ? 'Cluster client' : 'Client router', sub: rtrSub }, s1: { label: 'Cache shard 1', sub: evSub }, s2: { label: 'Cache shard 2', sub: evSub }, s3: { label: 'Cache shard 3', sub: evSub } },
        hot: s.herd === 'single' ? ['app'] : [],
        warn: s.shard === 'mod' ? ['rtr'] : [],
        err: s.herd === 'none' ? ['db'] : s.pat === 'wb' ? ['s2'] : [],
        badges: { db: [s.herd === 'none' ? 'herd risk' : 'protected', s.herd === 'none' ? 'err' : 'ok'], rtr: [Math.round(moved * 100) + '% move', s.shard === 'mod' ? 'warn' : 'ok'] }
      };
    }
  },

  widget: {
    title: 'Consistent hash ring with virtual nodes',
    caption: 'Dots are keys, coloured by the node that owns them. <b>Add or remove a node</b> and see what share of keys move. Switch to <b>hash % N</b> to compare, and raise <b>vnodes</b> to even out the load.'
  },

  realWorld: {
    intro: 'Facebook\'s memcache paper is the classic reference; Redis Cluster and Twitter\'s caches show other choices.',
    timeline: [
      { when: '1997', who: 'MIT (Karger et al.)', title: 'Consistent hashing (STOC \'97)', text: 'Karger, Lehman, Leighton, Panigrahy, Levine and Lewin define a hash that <b>changes minimally when the set of caches changes</b>, and use it to spread web-cache load without every client knowing the full, current set of servers. The idea behind Akamai and every hash ring since.', src: 6 },
      { when: '2013', who: 'Facebook', title: 'Scaling Memcache at Facebook (NSDI \'13)', text: 'A look-aside memcache tier serving <b>billions of requests per second</b> and holding <b>trillions of items</b>. Writes go to MySQL, then delete the key. The paper introduces <b>leases</b> against stale sets and herds (peak DB query rate 17K/s → 1.3K/s in their measurement), <b>gutter</b> servers for failed hosts and <b>mcsqueal</b>, which reads the MySQL commit log to broadcast deletes.', src: 0 },
      { when: '2013', who: 'Facebook', title: 'Engineering blog companion', text: 'Facebook\'s own summary of the paper: regions, clusters and how invalidations reach every cache.', src: 1 },
      { when: '2014', who: 'Facebook', title: 'mcrouter open-sourced', text: 'A memcached-protocol router used across thousands of cache servers in dozens of clusters, handling close to <b>5 billion requests per second</b> at peak. Any memcached client can talk to it unchanged, because it speaks the memcached protocol.', src: 2 },
      { when: '2015', who: 'Vattani et al.', title: 'XFetch: optimal probabilistic early expiry (VLDB)', text: 'Vattani, Chierichetti and Lowenstein show that refreshing early with probability rising towards expiry, scaled by how long the value takes to <b>recompute</b>, prevents stampedes with no locks or coordination, and prove the scheme optimal in their model.', src: 7 },
      { when: '2012', who: 'Twitter', title: 'Twemcache', text: 'Twitter forked Memcached into <b>Twemcache</b> to make it a reliable building block for its production environment.', src: 3 },
      { when: 'Later', who: 'Twitter', title: 'Twemcache → Pelikan', text: 'Twemcache is no longer maintained; Twitter\'s later caching work moved to <b>Pelikan</b>, a framework for building cache servers.', src: 4 },
      { when: 'Spec', who: 'Redis', title: 'Redis Cluster: 16384 hash slots', text: '<code>HASH_SLOT = CRC16(key) mod 16384</code>. Nodes gossip over a cluster bus, do not proxy requests, and redirect clients with <code>-MOVED</code> / <code>-ASK</code>. Hash tags <code>{…}</code> force related keys into one slot.', src: 5 }
    ],
    lessons: [
      '<span>Write to the DB, then <b>delete</b> from the cache; never update both.</span>',
      '<span>Plan for <b>herds</b> (hot-key expiry) and <b>stale sets</b> (read/write races) from day one.</span>',
      '<span>A dead cache node is a <b>DB-load problem</b>. Gutter pools beat rehashing to cold nodes.</span>',
      '<span>Tail the DB change log so every writer\'s changes invalidate the cache.</span>'
    ],
    sources: [
      { title: 'Scaling Memcache at Facebook', url: 'https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala', pub: 'Nishtala et al., USENIX NSDI 2013' },
      { title: 'Scaling memcache at Facebook (blog)', url: 'https://engineering.fb.com/2013/04/15/core-infra/scaling-memcache-at-facebook/', pub: 'Facebook Engineering, 2013' },
      { title: 'Introducing mcrouter: a memcached protocol router', url: 'https://engineering.fb.com/2014/09/15/web/introducing-mcrouter-a-memcached-protocol-router-for-scaling-memcached-deployments/', pub: 'Facebook Engineering, 2014' },
      { title: 'Caching with Twemcache', url: 'https://blog.x.com/engineering/en_us/a/2012/caching-with-twemcache', pub: 'Twitter Engineering, 2012' },
      { title: 'twitter/twemcache (see Pelikan)', url: 'https://github.com/twitter/twemcache', pub: 'GitHub' },
      { title: 'Redis cluster specification', url: 'https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/', pub: 'Redis docs' },
      { title: 'Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web', url: 'https://cs.brown.edu/courses/csci2950-u/f09/papers/chash97stoc.pdf', pub: 'Karger et al., ACM STOC 1997 (doi 10.1145/258533.258660)' },
      { title: 'Optimal Probabilistic Cache Stampede Prevention', url: 'https://mail.vldb.org/pvldb/volumes/8/paper/Optimal%20Probabilistic%20Cache%20Stampede%20Prevention', pub: 'Vattani, Chierichetti, Lowenstein · PVLDB 8(8), 2015' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Pattern', '<b>Cache-aside</b>: app controls, simple', '<b>Read/write-through</b>: library hides it', 'Cache-aside by default; through-patterns when one library owns all access'],
      ['On write', '<b>Delete key</b>: idempotent, race-safe', '<b>Update key</b>: no miss after write', 'Delete, unless the value is expensive and writes are rare'],
      ['Engine', '<b>Memcached</b>: simple, multithreaded, slab memory', '<b>Redis</b>: data structures, replication, cluster', 'Memcached for plain blobs at huge scale; Redis for counters, sets, sorted sets'],
      ['Sharding', '<b>Consistent hash</b> in the client / proxy', '<b>Redis Cluster slots</b>: server-side map', 'Proxy (mcrouter, twemproxy) for memcached; slots when you run Redis Cluster'],
      ['Node failure', '<b>Rehash</b> to survivors', '<b>Gutter pool</b> / replica promotion', 'Gutter or replicas when the DB cannot absorb a shard\'s misses'],
      ['Eviction', '<b>LRU</b>: recency', '<b>LFU</b>: frequency', 'LFU for stable popularity skew; LRU for shifting working sets']
    ]
  },
  failures: [
    { f: 'Hot key expiry → stampede', detect: 'DB QPS spike for one query shape', fix: 'Leases / single-flight, probabilistic early refresh, TTL jitter, L1 copies of hot keys.' },
    { f: 'Stale value after a race', detect: 'Users see old data until TTL', fix: 'Delete-on-write, leases or versioned sets, and a TTL as the backstop.' },
    { f: 'Cache node dies', detect: 'Client timeouts, shard health checks', fix: 'Gutter pool or replica promotion; avoid rehashing a third of keys onto cold nodes.' },
    { f: 'Cache penetration', detect: 'Many misses for keys that do not exist', fix: 'Cache negative results briefly, or check a Bloom filter of valid ids first.' },
    { f: 'Avalanche (mass expiry)', detect: 'Miss rate jumps at a fixed time', fix: 'Random TTL jitter; warm the cache before switching traffic.' },
    { f: 'Missed invalidation', detect: 'Data differs from DB long after writes', fix: 'Tail the WAL/binlog (CDC) and delete changed keys, in addition to app deletes.' },
    { f: 'Hot shard', detect: 'One node\'s CPU/network far above others', fix: 'Local L1 cache, replicate the hot key to several nodes, split big values.' }
  ],

  interview: [
    { q: 'How can cache-aside leave stale data in the cache?', a: '<p>Reader A misses and reads the old row. Writer B updates the DB and deletes the key. A then <code>set</code>s the old value. The cache is stale until the TTL.</p><p>Fixes: <b>leases</b> (the delete voids A\'s token), <b>versioned sets</b> (reject older versions), and short TTLs as a backstop.</p>', lvl: 'core' },
    { q: 'On a write, why delete the key instead of updating it?', a: '<p>Two concurrent writers can update the DB in one order and the cache in the other, leaving the cache wrong indefinitely. A <b>delete</b> is idempotent and order-independent: the next reader loads whatever the DB holds.</p>', lvl: 'core' },
    { q: 'How do you handle a hot key?', a: '<ul><li><b>L1 in-process cache</b> with a 1–5 s TTL on every app server.</li><li><b>Replicate</b> the key under several names (<code>key#0..7</code>) on different shards and read a random one.</li><li><b>Coalesce</b> misses (leases / single-flight) so expiry does not cause a herd.</li></ul>', lvl: 'core' },
    { q: 'Why do consistent-hash rings use virtual nodes?', a: '<p>With one point per server, the arcs between points are uneven, so some servers own far more keys. When a server leaves, its whole arc lands on one neighbour.</p><p>With <b>many virtual nodes</b> per server, ownership averages out, and a removed server\'s keys spread across all others. (Consistent hashing itself comes from Karger et al., STOC 1997.)</p>', fu: 'How many vnodes? (Enough that max/avg load is close to 1, often in the low hundreds per server (ketama uses 160); more costs ring memory and lookup time. Try the deep-dive slider.)', lvl: 'core' },
    { q: 'Redis or Memcached?', a: '<p><b>Memcached</b>: plain key → blob, multithreaded, very predictable. Good for huge simple look-aside caches.</p><p><b>Redis</b>: data structures (hashes, sorted sets, streams), atomic scripts, replication and Redis Cluster. Good when the cache also does counters, leaderboards, rate limits or queues.</p>', lvl: 'core' },
    { q: 'Cache penetration vs avalanche vs stampede?', a: '<ul><li><b>Penetration</b>: requests for keys that do not exist always miss. Cache "not found" briefly or use a Bloom filter.</li><li><b>Avalanche</b>: many keys expire at once (same TTL, cold restart). Add TTL jitter and warm up.</li><li><b>Stampede</b>: one hot key expires and every reader hits the DB. Leases, single-flight, or <b>probabilistic early refresh</b> (XFetch, Vattani et al. 2015): each reader refreshes early with a probability that rises near expiry, so one reader usually refreshes first.</li></ul>', lvl: 'core' },
    { q: 'How does Facebook keep caches consistent across regions?', a: '<p>One region holds the MySQL primary; others hold replicas. In every region, <b>mcsqueal</b> reads the local MySQL commit log and sends deletes to local caches, so caches are invalidated only after the local DB has the change.</p><p>For a user\'s own writes from a non-primary region, a <b>remote marker</b> tells reads to go to the primary region until replication catches up.</p>', lvl: 'deep' },
    { q: 'What happens when you add a node with hash % N?', a: '<p>Almost every key changes owner: going from N to N+1 remaps about <b>N/(N+1)</b> of keys. The cache behaves as if flushed and the DB takes all misses.</p><p>Consistent hashing or hash slots move only about <b>1/(N+1)</b>.</p>', lvl: 'core' },
    { q: 'How do Redis Cluster hash slots work?', a: '<p><code>slot = CRC16(key) mod 16384</code>. Each primary owns ranges of slots. Clients cache the slot map; a wrong node replies <code>MOVED</code> (permanent) or <code>ASK</code> (during migration, one request).</p><p>Multi-key operations need all keys in one slot, which <code>{hash tags}</code> provide.</p>', lvl: 'deep' },
    { q: 'A cache shard dies. What happens to the database?', a: '<p>Every key on that shard now misses. If you rehash to survivors, they start cold and the DB absorbs a burst of misses.</p><p>Mitigations: replicas with fast promotion (Redis), or a <b>gutter pool</b> that briefly serves the dead shard\'s keys (Facebook), plus rate-limited DB access.</p>', lvl: 'deep' },
    { q: 'Write-through vs write-behind?', a: '<p><b>Write-through</b>: write cache and DB synchronously. Fresh reads, slower writes.</p><p><b>Write-behind</b>: write the cache, flush to the DB later. Fast, but a crash loses writes and the DB lags. Only for loss-tolerant data such as counters.</p>', lvl: 'core' },
    { q: 'LRU or LFU?', a: '<p><b>LRU</b> keeps recently used items; one big scan can push out the real working set. <b>LFU</b> keeps frequently used items and resists scans, but adapts more slowly when popularity shifts.</p><p>Redis approximates both by sampling keys rather than keeping exact lists.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot 3: @Cacheable + Redis, evict after commit', lang: 'java',
      code: `@Configuration
@EnableCaching
class CacheConfig {
  @Bean
  RedisCacheManager cacheManager(RedisConnectionFactory cf) {
    var json = RedisSerializationContext.SerializationPair
        .fromSerializer(new GenericJackson2JsonRedisSerializer());
    var defaults = RedisCacheConfiguration.defaultCacheConfig()
        .entryTtl(Duration.ofMinutes(10))
        .disableCachingNullValues()
        .serializeValuesWith(json);
    return RedisCacheManager.builder(cf)
        .cacheDefaults(defaults)
        .transactionAware()          // put/evict run after the DB commit
        .build();
  }
}

@Service
class ProductService {
  private final ProductRepository repo;
  ProductService(ProductRepository repo) { this.repo = repo; }

  @Cacheable(cacheNames = "product", key = "#id", sync = true) // one loader per JVM
  public ProductDto get(long id) {
    return repo.findDtoById(id).orElseThrow();
  }

  @Transactional
  @CacheEvict(cacheNames = "product", key = "#cmd.id()")      // delete, not update
  public void update(UpdateProduct cmd) {
    repo.apply(cmd);
  }
}`,
      note: '<code>transactionAware()</code> defers the evict until the transaction commits, so a reader cannot reload the old row in between. <code>sync = true</code> coalesces misses per JVM only.'
    },
    {
      title: 'Python: lease-style get-or-load with Redis', lang: 'python',
      code: `import json
import random
import time
import uuid
import redis

r = redis.Redis()
# release the lease only if we still hold it (it may have expired and moved on)
RELEASE = r.register_script(
    "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0")

def get_or_load(key: str, load, ttl: int = 600, lease_ttl: int = 5):
    for _ in range(100):                       # ~5 s max wait
        cached = r.get(key)
        if cached is not None:
            return json.loads(cached)
        token = uuid.uuid4().hex
        # miss: only one caller per key wins the lease and hits the DB
        if r.set(f"lease:{key}", token, nx=True, ex=lease_ttl):
            try:
                value = load()                 # e.g. SELECT ... FROM products WHERE id = %s
                jitter = random.randint(0, ttl // 10)
                r.set(key, json.dumps(value), ex=ttl + jitter)
                return value
            finally:
                RELEASE(keys=[f"lease:{key}"], args=[token])
        time.sleep(0.05)                       # someone else is loading
    return load()                              # lease holder stuck: fall back`,
      note: 'Unlike Facebook\'s leases, this does not stop stale sets; pair it with delete-on-write and the TTL.'
    },
    {
      title: 'Python: probabilistic early expiry (XFetch)', lang: 'python',
      code: `import math
import random
import time

def xfetch(cache, key: str, recompute, ttl: int = 600, beta: float = 1.0):
    """cache stores {'v': value, 'delta': seconds to recompute, 'exp': expiry ts}."""
    e = cache.get(key)
    now = time.time()
    # -log(U) for U in (0, 1] is >= 0; refresh early with rising probability
    early = -e["delta"] * beta * math.log(1.0 - random.random()) if e else 0
    if e is None or now + early >= e["exp"]:
        start = time.time()
        value = recompute()
        delta = time.time() - start
        cache.set(key, {"v": value, "delta": delta, "exp": time.time() + ttl}, ttl)
        return value
    return e["v"]`,
      note: 'Keys that are slow to recompute (large <code>delta</code>) refresh earlier. Usually one reader refreshes before expiry and nobody waits.'
    }
  ],

  related: ['kv-store', 'cdn', 'rate-limiter', 'newsfeed', 'url-shortener', 'leaderboard']
});
