SD.register({
  slug: 'url-shortener',
  domain: 6,
  title: 'URL Shortener',
  examples: 'TinyURL, Bitly',
  tagline: 'Turn a long URL into a 7-character code that never collides, then redirect <b>billions of clicks a month</b> with a single cache lookup.',
  tldr: {
    problem: 'Writes are modest but every code must be unique. Reads are about 10× more frequent, extremely skewed toward a few viral links, and each one is a redirect that should take milliseconds.',
    idea: 'Generate codes from a <b>unique integer encoded in Base62</b>. Hand out integers in <b>blocks</b> so app servers rarely coordinate. Serve redirects from a <b>cache in front of a key-value store</b> and send click events to Kafka asynchronously.',
    insight: 'You never need to check for collisions if the input is a counter: uniqueness comes from the counter, not from luck. 62⁷ ≈ 3.5 trillion codes is plenty; the real choice is <b>301 vs 302</b>, which trades load for analytics.',
    numbers: [
      { v: '62⁷ ≈ 3.5T', l: 'codes available with 7 Base62 characters' },
      { v: '6B / mo', l: 'Bitly clicks per month (2014 talk)' },
      { v: '600M / mo', l: 'Bitly links shortened per month (2014 talk)' }
    ]
  },

  intro: {
    what: 'A URL shortener turns a long web address into a short one, like <code>sho.rt/2crtgef</code>. When someone opens the short link, the service looks up the long address and <b>redirects</b> the browser there. Most also count clicks so the link owner can see who clicked.',
    analogy: {
      icon: '🧥',
      title: 'A coat-check ticket',
      text: 'At a coat check you hand over a bulky coat and get a small numbered ticket. The numbers come from a roll, so no two people ever get the same one. Later anyone with the ticket gets the coat back in seconds. A URL shortener hands out short codes from a counter the same way. Unlike a coat check, the ticket is never used up: the same code can be redeemed millions of times.'
    },
    problem: 'Long links break in text messages, look ugly on posters and do not fit in a QR code nicely. You want a short link that <b>never points to the wrong place</b> and opens instantly, even when it goes viral and gets thousands of clicks per second. The question is: <b>how do you hand out short codes that never collide, and redirect clicks in milliseconds?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Hash the URL and keep one table',
        text: 'Take a <b>hash</b> of the long URL (a scrambled fingerprint), keep the first 7 characters as the code and store <code>code → URL</code> in one database. Each click reads the row, adds 1 to its click count and redirects. Easy, and fine for a hobby project.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Browser', sub: 'create or click', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'App server', sub: 'hash → 7 chars', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'One database', sub: 'links + counts', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'cli', to: 'api' }, { from: 'api', to: 'db' }],
          flow: ['cli>api', 'api>db']
        }
      },
      {
        stage: 'breaks',
        title: 'Collisions and a flood of clicks',
        text: 'Cutting a hash to 7 characters means two different URLs can get the <b>same code</b>, so every create must check and retry, and that gets worse as the table fills. When a link goes viral, every click is a database read <b>plus</b> a write to bump the counter on the same row. Redirects slow down and the database becomes the bottleneck.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Browsers', sub: 'viral link', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'App server', sub: 'hash → 7 chars', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'One database', sub: 'read + write/click', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'cli', to: 'api' }, { from: 'api', to: 'db' }],
          flow: [['cli>api', 'cli>api'], ['api>db', 'api>db']],
          err: ['db'],
          warn: ['api'],
          badges: { api: ['collision!', 'warn'], db: ['overloaded', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Counter ids in Base62, cached redirects',
        text: 'Give every new link the next number from a <b>counter</b>, handed to servers in blocks so they rarely coordinate. Write that number in <b>Base62</b> (0–9, a–z, A–Z): 7 characters cover trillions of links and can never collide. Redirects read from a <b>cache</b>, and clicks go to a queue for analytics, so the redirect never waits.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Browser', sub: 'create or click', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'Create API', sub: 'id → Base62', kind: 'service', at: [210, 0] },
            { id: 'kgs', label: 'Id blocks', sub: '1,000 at a time', kind: 'service', at: [350, 0] },
            { id: 'redir', label: 'Redirect svc', sub: '302 → long URL', kind: 'service', at: [70, 110] },
            { id: 'cache', label: 'Cache', sub: 'code → URL', kind: 'cache', at: [210, 110] },
            { id: 'db', label: 'Link store', sub: 'key = code', kind: 'store', at: [350, 110] },
            { id: 'kfk', label: 'Click events', sub: 'counted later', kind: 'queue', at: [70, 220] }
          ],
          edges: [{ from: 'cli', to: 'api' }, { from: 'api', to: 'kgs' }, { from: 'api', to: 'db' }, { from: 'cli', to: 'redir' }, { from: 'redir', to: 'cache' }, { from: 'redir', to: 'kfk' }],
          flow: ['cli>api', 'api>kgs', 'api>db', 'cli>redir', ['redir>cache', 'redir>kfk']],
          ok: ['cache', 'redir'],
          badges: { cache: ['hit < 1 ms', 'ok'] }
        }
      }
    ],
    usedBy: ['Bitly', 'TinyURL', 'X / Twitter t.co links', 'Marketing QR codes and SMS links'],
    whenToUse: [
      'Long links must fit in texts, posters, QR codes or character limits',
      'You want to <b>count clicks</b> or change where a link points later',
      'Links are opened far more often than they are created'
    ],
    whenNot: [
      'You only need unique ids inside your own system, not a public link (see <a href="unique-id.html">Unique ID Generator</a>)',
      'The link must be secret and unguessable, like a password-reset link: use a long random token',
      'A handful of fixed links: a static redirect rule in your web server is enough'
    ],
    glossary: [
      { term: 'Short code', def: 'The few characters after the domain (like <code>2crtgef</code>) that identify one link.' },
      { term: 'Base62', def: 'Writing a number with 62 symbols (0–9, a–z, A–Z) so it takes far fewer characters than in decimal.' },
      { term: 'Collision', def: 'Two different long URLs ending up with the same short code.' },
      { term: 'Id block', def: 'A range of counter values, for example 1,000 ids, handed to one server so it can create links without asking the counter each time.' },
      { term: '301 vs 302 redirect', def: 'HTTP answers that send the browser elsewhere; 301 ("permanent") may be cached by browsers, 302 ("found") is checked each time, so clicks can be counted.' },
      { term: 'Cache-aside', def: 'Read from the cache first; on a miss, read the database and put the answer in the cache for next time.' },
      { term: 'Hot key', def: 'One key, like a viral link\'s code, read so often that the single cache server holding it gets overloaded.' },
      { term: 'Conditional insert', def: 'A write that succeeds only if the key does not exist yet, so two users can never claim the same custom alias.' }
    ]
  },

  requirements: {
    functional: [
      'Create a short code for a long URL',
      'Redirect a short code to its long URL',
      'Custom aliases (e.g. /launch)',
      'Optional expiry date',
      'Click analytics per link (count, country, referrer)',
      'Delete or disable a link (abuse)'
    ],
    nonFunctional: [
      'Redirect p99 ≲ 10–20 ms at the server',
      'Codes are unique and never reused',
      'Read-heavy: ~10–100 reads per write',
      'Highly available redirects (a dead link breaks someone else\'s page)',
      'Codes should not be easy to enumerate',
      'Analytics may lag; redirects must not wait for it'
    ],
    outOfScope: ['Link-in-bio pages and QR design', 'Billing', 'Full abuse/malware ML pipeline', 'Branded-domain DNS setup']
  },

  calculator: {
    inputs: [
      { id: 'links', label: 'New links per month', min: 1000000, max: 10000000000, value: 600000000, log: true },
      { id: 'clicks', label: 'Clicks per month', min: 10000000, max: 100000000000, value: 6000000000, log: true },
      { id: 'peak', label: 'Peak-to-average (viral links)', min: 1, max: 50, value: 10, unit: '×' },
      { id: 'size', label: 'Bytes per stored link (URL + metadata)', min: 100, max: 2000, step: 50, value: 400, fmt: 'bytes' },
      { id: 'years', label: 'Retention', min: 1, max: 20, value: 10, unit: 'years' },
      { id: 'len', label: 'Code length', min: 5, max: 9, value: 7, unit: 'chars' }
    ],
    outputs: [
      { label: 'Creates / second (average)', f: (v) => v.links / (30 * 86400) },
      { label: 'Redirects / second (peak)', f: (v) => (v.clicks / (30 * 86400)) * v.peak },
      { label: 'Reads per write', fmt: 'raw', f: (v) => Math.round(v.clicks / v.links) + ' : 1' },
      { label: 'Link storage over retention (RF = 3)', fmt: 'bytes', f: (v) => v.links * 12 * v.years * v.size * 3 },
      { label: 'Keyspace 62^length', f: (v) => Math.pow(62, v.len) },
      { label: 'Keyspace used after retention', fmt: 'pct', f: (v) => Math.min(1, (v.links * 12 * v.years) / Math.pow(62, v.len)) }
    ],
    note: 'The 600M links and 6B clicks per month defaults are Bitly\'s 2014 figures; everything else is an <em>estimate</em>. Try code length 6: 62⁶ ≈ 57B, and a decade at this rate would need more than that. That is why 7 characters is the usual choice.'
  },

  api: [
    { m: 'POST', p: '/v1/urls', d: 'Body <code>{long_url, custom_alias?, expires_at?}</code>. Returns <code>{code, short_url}</code>. Send an <code>Idempotency-Key</code> header so retries don\'t create duplicates.' },
    { m: 'GET', p: '/{code}', d: 'Redirect: <b>302 Found</b> (or 301) with a <code>Location</code> header. 404 if unknown, 410 if expired or disabled.' },
    { m: 'GET', p: '/v1/urls/{code}/stats?from&to', d: 'Clicks over time, by country and referrer, read from the analytics store, not from the link store.' },
    { m: 'DELETE', p: '/v1/urls/{code}', d: 'Disable the link. The code is <b>never reused</b>. Also purge it from the cache and CDN.' }
  ],
  dataModel: [
    { name: 'urls', store: 'KV store (DynamoDB / Cassandra) or Postgres', fields: [['code', 'varchar(9)', 'pk'], ['long_url', 'text'], ['owner_id', 'int64', 'idx'], ['created_at', 'ts'], ['expires_at', 'ts', 'idx'], ['status', 'active | disabled']], note: 'Partition key = code, so every redirect is a single-key lookup.' },
    { name: 'id_block (sequence)', store: 'Postgres sequence / ZooKeeper', fields: [['name', 'text', 'pk'], ['next', 'int64'], ['increment', '1000']], note: 'Each nextval reserves a block of 1,000 ids for one app server.' },
    { name: 'clicks', store: 'ClickHouse / BigQuery', fields: [['code', 'text', 'sk'], ['ts', 'datetime', 'pk'], ['country', 'text'], ['referrer', 'text'], ['ua_class', 'text']], note: 'Partition by day. Fed from Kafka, aggregated into rollups.' },
    { name: 'u:{code}', store: 'Redis', fields: [['key', 'code', 'pk'], ['value', 'long_url'], ['ttl', '24 h']], note: 'Cache-aside. The top few percent of links get most clicks.' }
  ],

  architecture: {
    title: 'URL shortener architecture',
    nodes: [
      { id: 'cli', label: 'Browser / app', sub: 'click or create', kind: 'client', wide: [90, 220], tall: [210, 0], tip: 'Creates links through the API or follows a short link. A 301 may be cached by the browser for a long time.' },
      { id: 'cdn', label: 'CDN / edge', sub: 'TLS · cache redirects', kind: 'edge', wide: [280, 220], tall: [210, 105], tip: 'Terminates TLS close to users. It can cache redirects for viral links for a short time.' },
      { id: 'api', label: 'Write API', sub: 'POST /urls', kind: 'service', wide: [470, 110], tall: [70, 210], tip: 'Validates and normalises the URL, takes the next id from its local block, encodes it in Base62 and stores the mapping.' },
      { id: 'safe', label: 'URL safety check', sub: 'malware / phishing', kind: 'external', wide: [470, 0], tall: [70, 105], tip: 'Checks the destination against threat lists before a link is created, and again when lists change.' },
      { id: 'kgs', label: 'Key ranges (KGS)', sub: 'blocks of 1,000 ids', kind: 'service', wide: [660, 0], tall: [70, 315], tip: 'Hands each API server a block of ids. The server uses them from memory, so it coordinates once per block.' },
      { id: 'ctr', label: 'Counter', sub: 'sequence · HA pair', kind: 'store', wide: [850, 0], tall: [70, 420], tip: 'A monotonic counter, such as a Postgres sequence. Flickr used two MySQL "ticket servers" handing out odd and even ids.' },
      { id: 'redir', label: 'Redirect service', sub: 'GET /{code}', kind: 'service', wide: [470, 330], tall: [210, 210], tip: 'Looks up the code in Redis, falls back to the store, answers 301/302 and emits a click event without waiting.' },
      { id: 'cache', label: 'Redis cache', sub: 'code → URL', kind: 'cache', wide: [660, 330], tall: [350, 210], tip: 'Cache-aside with a TTL. Clicks follow a power law, so a small cache serves most traffic.' },
      { id: 'db', label: 'Link store', sub: 'KV · key = code', kind: 'store', wide: [850, 220], tall: [210, 315], tip: 'Durable mapping. Single-key reads and conditional inserts (no overwrite) are all it needs.' },
      { id: 'kfk', label: 'Click events', sub: 'Kafka', kind: 'queue', wide: [660, 440], tall: [350, 315], tip: 'One small event per click, published asynchronously. Analytics never slows a redirect.' },
      { id: 'ana', label: 'Analytics', sub: 'OLAP rollups', kind: 'compute', wide: [850, 440], tall: [350, 420], tip: 'Aggregates clicks by link, time, country and referrer into a columnar store.' }
    ],
    edges: [
      { from: 'cli', to: 'cdn', bidi: true },
      { from: 'cdn', to: 'api' },
      { from: 'cdn', to: 'redir' },
      { from: 'api', to: 'safe' },
      { from: 'api', to: 'kgs' },
      { from: 'kgs', to: 'ctr' },
      { from: 'api', to: 'db' },
      { from: 'redir', to: 'cache' },
      { from: 'redir', to: 'db' },
      { from: 'redir', to: 'kfk' },
      { from: 'kfk', to: 'ana' }
    ]
  },

  scenarios: [
    {
      id: 'create', title: 'Create a short URL', tone: 'info',
      steps: [
        { text: '<code>POST /v1/urls {long_url}</code>. The API validates and normalises the URL and checks it against malware and phishing lists.', flow: ['cli>cdn', 'cdn>api', 'api>safe'], badges: { safe: 'clean' } },
        { text: 'The API takes the next id from its <b>in-memory block</b>. Only when the block is used up does it ask the key service for a new block of 1,000.', flow: ['api>kgs', 'kgs>ctr'], badges: { kgs: 'block 125000000000+' } },
        { text: 'Id <b>125,000,000,123</b> in Base62 is <code>2crtgef</code>: 7 characters, guaranteed unique because the id is.', nodes: ['api'], badges: { api: '→ 2crtgef' } },
        { text: 'A <b>conditional insert</b> (no overwrite) stores <code>2crtgef → long_url</code>. The API answers 201 with the short URL.', flow: ['api>db'], badges: { db: ['stored', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'hit', title: 'Redirect: cache hit', tone: 'ok',
      steps: [
        { text: 'A user clicks <code>sho.rt/2crtgef</code>. TLS ends at the nearest edge.', flow: ['cli>cdn', 'cdn>redir'] },
        { text: '<code>GET u:2crtgef</code> in Redis hits in under a millisecond. Most clicks go to a small set of hot links.', flow: ['redir>cache'], badges: { cache: ['hit', 'ok'] } },
        { text: 'Answer <b>302 Found</b> with <code>Location: long_url</code>. A click event is published to Kafka <b>without waiting</b> for an ack on the hot path.', flow: ['redir>kfk', 'redir>cdn', 'cdn>cli'], badges: { kfk: '+1 click' } },
        { text: 'Analytics consumers roll clicks up by minute, country and referrer. Lag of seconds is fine.', flow: ['kfk>ana'], tone: 'ok', badges: { ana: 'rollup' } }
      ]
    },
    {
      id: 'viral', title: 'Hot spot: a link goes viral', tone: 'warn',
      steps: [
        { text: 'A link is posted by a huge account. Thousands of clicks per second arrive at once, before it is in the cache.', flow: [['cli>cdn', 'cli>cdn'], 'cdn>redir', 'redir>cache'], warn: ['cache'], badges: { cache: ['miss', 'warn'] }, tone: 'warn' },
        { text: '<b>Request coalescing</b> (single-flight): only one request per server goes to the store; the others wait for its result.', flow: ['redir>db'], badges: { db: '1 read' } },
        { text: 'The value is cached with a TTL. The key is now hot on one Redis shard, so a small <b>in-process cache</b> in the redirect service absorbs the repeat reads.', flow: ['redir>cache'], ok: ['cache'], badges: { cache: ['hot key', 'ok'] } },
        { text: 'Optionally, let the CDN cache the redirect for ~60 s (<code>s-maxage</code>). Origin load drops sharply; analytics then come from CDN logs.', nodes: ['cdn'], ok: ['cdn'], badges: { cdn: ['cached 60 s', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'alias', title: 'Custom alias collision', tone: 'warn',
      steps: [
        { text: 'A user asks for <code>/launch</code>, which already exists.', flow: ['cli>cdn', 'cdn>api'] },
        { text: 'The API does <code>INSERT … ON CONFLICT DO NOTHING</code> (or a DynamoDB put with <code>attribute_not_exists</code>). Zero rows are written.', flow: ['api>db'], warn: ['db'], badges: { db: ['exists', 'warn'] }, tone: 'warn' },
        { text: 'The API returns <b>409 Conflict</b> with suggestions. Nothing is overwritten. Check-then-insert would be a race; the conditional write is atomic.', nodes: ['api'], badges: { api: '409' } },
        { text: 'Generated codes and aliases share the same unique key, so a future generated code can never take <code>launch</code> either.', nodes: ['db'], ok: ['db'], tone: 'ok' }
      ]
    },
    {
      id: 'ctr-down', title: 'Counter down, API node crashes', tone: 'err',
      steps: [
        { text: 'The counter database is unreachable.', nodes: ['ctr'], err: ['ctr'], badges: { ctr: ['down', 'err'] }, tone: 'err' },
        { text: 'API servers still hold <b>unused ids in memory</b>, so link creation continues until their blocks run out. Redirects are not affected at all.', flow: ['api>db', 'cdn>redir', 'redir>cache'], ok: ['api', 'redir'], badges: { api: '612 ids left' }, tone: 'warn' },
        { text: 'One API server crashes. The rest of its block is lost, leaving a <b>gap</b> in the ids. That is harmless: ids only need to be unique, not dense.', nodes: ['api'], warn: ['api'], badges: { api: ['gap', 'warn'] } },
        { text: 'For high availability, run <b>two counters</b> that hand out odd and even blocks, as Flickr did with its ticket servers. Either one can serve while the other is down.', flow: ['kgs>ctr'], ok: ['ctr'], badges: { ctr: ['odd / even', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose how codes are made and how redirects behave. Assumes 10B links already stored and 2.3K redirects/s on average (Bitly-scale). Illustrative.',
    controls: [
      { id: 'gen', label: 'Key generation', type: 'seg', value: 'kgs', options: [
        { v: 'hash', l: 'Hash + collision check' }, { v: 'counter', l: 'Central counter' }, { v: 'kgs', l: 'Id blocks (KGS)' }] },
      { id: 'len', label: 'Code length', type: 'range', min: 5, max: 9, step: 1, value: 7, unit: 'chars' },
      { id: 'redir', label: 'Redirect status', type: 'seg', value: '302', options: [
        { v: '301', l: '301 Permanent' }, { v: '302', l: '302 Found' }] },
      { id: 'scr', label: 'Make codes unguessable', type: 'seg', value: 'on', options: [
        { v: 'off', l: 'Plain sequence' }, { v: 'on', l: 'Scramble / random' }] },
      { id: 'cache', label: 'Redis cache size (share of links)', type: 'range', min: 0.1, max: 20, step: 0.1, value: 1, fmt: (v) => v.toFixed(1) + '%' }
    ],
    evaluate(s) {
      const N = 1e10, RPS = 2300, CREATES = 230;
      const space = Math.pow(62, s.len);
      const pColl = Math.min(1, N / space);                  // chance a random new code is taken
      const hit = Math.log(N * s.cache / 100) / Math.log(N);  // Zipf(1): H(C)/H(N) ≈ ln C / ln N
      const originRps = RPS * (s.redir === '301' ? 0.6 : 1);  // 301s get cached by browsers (illustrative)
      const dbReads = originRps * (1 - hit);
      const ramGB = N * s.cache / 100 * 300 / 1e9;
      const coord = { hash: (pColl * 100).toFixed(pColl < 0.01 ? 3 : 1) + '% retries', counter: SD.fmt.num(CREATES) + ' counter calls/s', kgs: '1 call per 1,000 links' }[s.gen];
      const life = space / (6e8 * 12);
      const guess = s.gen === 'hash' || s.scr === 'on';
      const metrics = [
        { k: 'Keyspace', v: SD.fmt.num(space) + ' codes', s: space > 1e12 ? 0.9 : space > 1e11 ? 0.6 : 0.2, hint: life >= 1000 ? '1000+ years' : '≈ ' + Math.round(life) + ' yr at 600M/mo' },
        { k: 'Coordination per create', v: coord, s: s.gen === 'kgs' ? 0.9 : s.gen === 'counter' ? 0.35 : pColl < 0.01 ? 0.7 : 0.15 },
        { k: 'Enumeration risk', v: guess ? 'low (codes look random)' : 'high (next code = +1)', s: guess ? 0.85 : 0.15 },
        { k: 'Cache hit ratio', v: Math.round(hit * 100) + '%', s: hit, hint: SD.fmt.bytes(ramGB * 1e9) + ' RAM' },
        { k: 'Store reads/s', v: SD.fmt.num(dbReads) + '/s', s: dbReads < 300 ? 0.9 : dbReads < 800 ? 0.6 : 0.35 },
        { k: 'Click analytics', v: s.redir === '301' ? 'misses repeat clicks' : 'every click counted', s: s.redir === '301' ? 0.25 : 0.95 }
      ];
      const notes = [];
      if (s.gen === 'hash') notes.push('Hash and truncate: with ' + SD.fmt.num(N) + ' codes taken, a new ' + s.len + '-char code collides with probability ≈ ' + (pColl * 100).toFixed(pColl < 0.01 ? 3 : 1) + '%. Every create needs a conditional insert and a retry loop. Bonus: the same URL gives the same code.');
      if (s.gen === 'counter') notes.push('One database round trip per create, and the counter is a single point of failure. It is fine at a few hundred creates/s, but needs an HA design.');
      if (s.gen === 'kgs') notes.push('Each server reserves 1,000 ids per call (e.g. a Postgres sequence with <code>INCREMENT BY 1000</code>) and uses them from memory. A crash only leaves a gap.');
      if (s.gen !== 'hash' && s.scr === 'off') notes.push('Sequential codes let anyone walk <code>…aaa, …aab, …aac</code> and scrape every link, including private ones.');
      if (s.gen !== 'hash' && s.scr === 'on') notes.push('Scramble with a <b>bijection</b> on [0, 62^L), e.g. multiply by a constant coprime to 62^L. It stays unique and needs no extra lookup.');
      if (s.redir === '301') notes.push('RFC 9110 makes 301 <b>heuristically cacheable</b>, so browsers can skip you on repeat clicks. You also can\'t change or disable the destination for those users.');
      if (s.len <= 5) notes.push('62⁵ ≈ 916M codes is less than two months of Bitly-scale creation.');
      let verdict;
      if (s.len <= 5 || (s.gen === 'hash' && pColl > 0.05)) verdict = '❌ <b>Keyspace too small</b> for this volume. Use 7 or more characters.';
      else if (s.gen === 'counter') verdict = '⚠ <b>Correct, but the counter is a bottleneck and a single point of failure.</b> Reserve ids in blocks.';
      else if (!guess) verdict = '⚠ <b>Unique but enumerable.</b> Scramble the ids before encoding.';
      else if (s.redir === '301') verdict = '👍 <b>Lowest load</b>, but you lose repeat-click analytics and the ability to change a link. Bitly-style products use 301 only when analytics do not matter.';
      else if (s.gen === 'kgs') verdict = '✅ <b>Strong default:</b> id blocks + scrambled Base62, 302 redirects, cache-aside Redis.';
      else verdict = '👍 <b>Works:</b> random-looking codes with a conditional insert. Watch the retry rate as the table fills.';
      return {
        metrics, verdict, notes,
        flow: (s.gen === 'hash' ? ['cdn>api', 'api>db'] : s.gen === 'counter' ? ['cdn>api', 'api>kgs', 'kgs>ctr', 'api>db'] : ['cdn>api', 'api>kgs', 'api>db']).concat(['cli>cdn', 'cdn>redir', 'redir>cache', 'redir>kfk']),
        hide: s.gen === 'hash' ? ['kgs', 'ctr'] : [],
        labels: {
          kgs: s.gen === 'counter' ? { label: 'Counter client', sub: '1 call per link' } : { label: 'Key ranges (KGS)', sub: 'blocks of 1,000 ids' },
          api: { label: 'Write API', sub: s.gen === 'hash' ? 'hash → base62[:' + s.len + ']' : (s.scr === 'on' ? 'scramble → base62' : 'id → base62') },
          redir: { label: 'Redirect service', sub: s.redir === '301' ? '301 · browser caches' : '302 · every click seen' },
          cache: { label: 'Redis cache', sub: s.cache.toFixed(1) + '% of links' }
        },
        hot: s.gen === 'counter' ? ['ctr'] : [],
        warn: (s.gen === 'counter' ? ['ctr'] : []).concat(s.redir === '301' ? ['ana'] : []),
        badges: { cache: [Math.round(hit * 100) + '% hit', 'info'], db: [SD.fmt.num(dbReads) + ' r/s', dbReads < 800 ? 'ok' : 'warn'] }
      };
    }
  },

  widget: {
    title: 'Base62 encoder and keyspace',
    caption: 'Watch an id become a code by repeated division by 62. Step through ids to see why <b>plain sequences are guessable</b>, then turn on the <b>bijective scramble</b> and check that decoding still returns the original id.'
  },

  realWorld: {
    intro: 'URL shorteners are small systems, so the published material is about the parts they share with larger ones: unique ids, caching and click analytics.',
    timeline: [
      { when: '2010', who: 'Flickr', title: 'Ticket servers', text: 'Flickr generated globally unique 64-bit ids with dedicated MySQL <b>ticket servers</b>: <code>REPLACE INTO Tickets64 (stub) VALUES (\'a\'); SELECT LAST_INSERT_ID();</code>. Two servers split the space into <b>odd and even</b> ids (auto-increment-increment = 2) for availability.', src: 0 },
      { when: '2011', who: 'Instagram', title: 'Ids without a central server', text: 'Instagram packed <b>41 bits of time, 13 bits of logical shard and 10 bits of sequence</b> into a 64-bit id generated inside Postgres (PL/pgSQL). This is another way to avoid one counter for everything.', src: 2 },
      { when: '2014', who: 'Bitly', title: '6B clicks a month', text: 'Bitly reported <b>6 billion clicks</b> and <b>600 million shortens</b> per month, handled by dozens of small services talking over the network, on about 400 servers. Only ~30 of them took incoming traffic.', src: 1 },
      { when: '2022', who: 'IETF', title: 'Redirect semantics (RFC 9110)', text: '<b>301</b> is heuristically cacheable (§15.4.2), so clients may reuse it without asking again unless cache headers say otherwise. <b>302</b> is not on the heuristically cacheable list, so it is cached only when headers allow it. 307/308 are the variants that keep the request method.', src: 3 }
    ],
    lessons: [
      'Uniqueness from a <b>counter</b> beats uniqueness from hashing plus collision checks.',
      'Reserve ids in <b>blocks</b> so the counter is off the hot path.',
      '<b>Scramble</b> ids so codes cannot be enumerated.',
      'Keep analytics <b>asynchronous</b>; choose 302 if every click must be counted.'
    ],
    sources: [
      { title: 'Ticket Servers: Distributed Unique Primary Keys on the Cheap', url: 'https://code.flickr.net/2010/02/08/ticket-servers-distributed-unique-primary-keys-on-the-cheap/', pub: 'Flickr Code, 2010' },
      { title: 'Bitly: Lessons Learned Building a Distributed System that Handles 6 Billion Clicks a Month', url: 'https://highscalability.com/bitly-lessons-learned-building-a-distributed-system-that-han/', pub: 'High Scalability, 2014' },
      { title: 'Sharding & IDs at Instagram', url: 'https://instagram-engineering.com/1cf5a71e5a5c', pub: 'Instagram Engineering, 2011' },
      { title: 'RFC 9110: HTTP Semantics', url: 'https://www.rfc-editor.org/rfc/rfc9110.txt', pub: 'IETF, 2022' },
      { title: 'At 6 billion clicks a month, Bitly has a distributed analytics system', url: 'https://siliconangle.com/2014/07/24/at-6-billion-clicks-a-month-bitly-has-a-distributed-analytics-system-devops-plan/', pub: 'SiliconANGLE, 2014' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Key generation', '<b>Hash + truncate</b>: no coordination, same URL → same code', '<b>Counter + Base62</b>: never collides', 'Counter in blocks; hashing only if you want dedup of identical URLs'],
      ['Redirect status', '<b>301</b>: browsers cache it, less load', '<b>302</b>: every click reaches you', '302 for analytics or editable links; 301 for static, permanent links'],
      ['Store', '<b>KV (DynamoDB / Cassandra)</b>: scales by key', '<b>Postgres</b>: simple, sequences, constraints', 'Postgres to a few billion rows with partitioning; KV beyond'],
      ['Code format', '<b>Sequential</b>: shortest codes', '<b>Scrambled / random</b>: not guessable', 'Always scramble for public links'],
      ['Hot links', '<b>Redis only</b>: one hop', '<b>+ CDN caching of redirects</b>: absorbs spikes', 'Add CDN caching when single links reach thousands of clicks/s']
    ]
  },
  failures: [
    { f: 'Viral link overloads one cache shard', detect: 'Per-key QPS, shard CPU', fix: 'In-process cache in the redirect service, request coalescing, short CDN caching.' },
    { f: 'Counter unavailable', detect: 'Block-allocation errors', fix: 'Servers keep using their blocks; run odd/even counter pairs.' },
    { f: 'Two users get the same custom alias', detect: 'Conflicting inserts', fix: 'Atomic conditional insert; 409 for the loser.' },
    { f: 'Link points to malware', detect: 'Threat-list checks at creation and periodic re-scans', fix: 'Disable the link (410 or warning page) and purge caches.' },
    { f: 'Cache stampede after a Redis restart', detect: 'Miss rate and store latency spike', fix: 'Warm the top links, single-flight per key, rate-limit misses.' },
    { f: 'Analytics pipeline lagging', detect: 'Kafka consumer lag', fix: 'Redirects are unaffected; scale consumers and backfill from the topic.' }
  ],

  interview: [
    { q: '301 or 302: which do you return and why?', a: '<p><b>301 Moved Permanently</b> is heuristically cacheable (RFC 9110): browsers may follow it later without contacting you. Less load, but you miss repeat clicks and cannot change or disable the link for those users.</p><p><b>302 Found</b> is not cached by default, so every click hits you and is counted. Most analytics-driven shorteners prefer 302 (or 301 with short cache headers).</p>', lvl: 'core' },
    { q: 'How do you generate unique short codes?', a: '<ul><li><b>Hash</b> the URL (e.g. MD5), Base62 it, take 7 chars, and retry on collision. No coordination, but collisions grow as the table fills.</li><li><b>Counter + Base62</b>: unique by construction.</li><li><b>Id blocks</b>: each server reserves 1,000 ids at a time, so coordination is rare. This is usually the best choice.</li></ul>', lvl: 'core' },
    { q: 'How long should the code be?', a: '<p>62⁶ ≈ 57B, 62⁷ ≈ 3.5T, 62⁸ ≈ 218T. At 600M new links per month (Bitly 2014), 7 characters lasts centuries, while 6 fills up within a decade. Pick 7; allow custom aliases of other lengths.</p>', lvl: 'core' },
    { q: 'How do you stop people from enumerating links?', a: '<p>Do not expose the raw counter. Apply a <b>bijection</b> to the id before encoding: multiply by a constant coprime with 62^L modulo 62^L, or use a small Feistel cipher. Codes still never collide and decoding is possible, but neighbours look unrelated. Also rate-limit 404s per IP.</p>', lvl: 'core' },
    { q: 'How do you scale reads?', a: '<p>Reads are single-key lookups with a power-law distribution. Use a Redis <b>cache-aside</b> layer (a few percent of links serve most clicks), a KV store partitioned by code, read replicas, and CDN caching for the hottest redirects.</p>', lvl: 'core' },
    { q: 'How do you handle a viral link?', a: '<p>Single-flight on cache misses so one request goes to the store, an in-process LRU in front of Redis for very hot keys, and short CDN caching of the redirect. Analytics then come from CDN logs.</p>', lvl: 'deep' },
    { q: 'How do you implement expiry?', a: '<p>Store <code>expires_at</code>. The redirect service checks it and returns <b>410 Gone</b>. Set the cache TTL to <code>min(24 h, time to expiry)</code>. A background job (or the store\'s TTL feature) cleans up rows later. Do not reuse expired codes: old links in the wild would point somewhere new.</p>', lvl: 'core' },
    { q: 'Should the same long URL always get the same code?', a: '<p>Only if the product wants it. Different users usually need separate links with separate analytics. If you dedup, keep a unique index on a hash of <code>(owner_id, long_url)</code> and return the existing code.</p>', lvl: 'deep' },
    { q: 'How do you avoid a race on custom aliases?', a: '<p>Do not check-then-insert. Use an <b>atomic conditional insert</b>: <code>INSERT … ON CONFLICT DO NOTHING RETURNING code</code> in Postgres, or a conditional put in DynamoDB. Zero rows means the alias is taken: return 409.</p>', lvl: 'core' },
    { q: 'How do you collect click analytics without slowing redirects?', a: '<p>Publish a small event to Kafka asynchronously (or log it at the edge), then aggregate into a columnar store by minute, country and referrer. The redirect never waits on analytics.</p>', lvl: 'core' },
    { q: 'How do redirects survive the loss of a whole region?', a: '<p>Redirects are reads of data that almost never changes, so <b>replicate the link table to every region</b> asynchronously (DynamoDB global tables, Cassandra multi-DC) and serve each click from the nearest one.</p><p>Creates stay local: give each region its <b>own id-block range</b>, so no cross-region coordination is needed. Two gaps remain: a link created seconds ago may not have replicated yet, so on a miss ask the home region (which the id range identifies), and disabling a link must propagate and purge caches everywhere.</p>', lvl: 'deep' },
    { q: 'Postgres or a NoSQL store?', a: '<p>The access pattern is a single-key lookup plus a conditional insert, which any KV store does well. Postgres works up to billions of rows with partitioning and gives sequences and constraints for free. Choose a KV store (DynamoDB, Cassandra) when you need multi-region writes and effortless horizontal scale.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot: id blocks + Base62 + redirect', lang: 'java',
      code: `@Component
class IdBlock {                       // sequence is INCREMENT BY 1000
  private final JdbcTemplate jdbc;
  private long next, end;             // current block [next, end)
  IdBlock(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  synchronized long nextId() {
    if (next == end) {
      next = jdbc.queryForObject("SELECT nextval('url_id_block')", Long.class);
      end = next + 1000;
    }
    return next++;
  }
}

final class Base62 {
  private static final char[] A =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".toCharArray();
  static String encode(long n) {      // fixed 7 chars, so ids < 62^3 still match {4,12}
    StringBuilder sb = new StringBuilder();
    for (; n > 0; n /= 62) sb.append(A[(int) (n % 62)]);
    while (sb.length() < 7) sb.append('0');                // left-pad with '0'
    return sb.reverse().toString();
  }
}

@RestController
class RedirectController {
  private final StringRedisTemplate redis;
  private final UrlRepository repo;
  private final KafkaTemplate<String, String> kafka;
  RedirectController(StringRedisTemplate r, UrlRepository u, KafkaTemplate<String, String> k) {
    redis = r; repo = u; kafka = k;
  }

  @GetMapping("/{code:[0-9a-zA-Z]{4,12}}")
  ResponseEntity<Void> go(@PathVariable String code) {
    String url = redis.opsForValue().get("u:" + code);
    if (url == null) {
      url = repo.findActiveUrl(code).orElse(null);
      if (url == null) return ResponseEntity.notFound().build();
      redis.opsForValue().set("u:" + code, url, Duration.ofHours(24));
    }
    kafka.send("clicks", code, Instant.now().toString());   // async
    return ResponseEntity.status(HttpStatus.FOUND)
        .location(URI.create(url)).cacheControl(CacheControl.noStore()).build();
  }
}`,
      note: 'Before encoding, scramble the id with a bijection (see the widget) so codes are not sequential. In production, cap the cache TTL at the link\'s remaining lifetime and delete <code>u:{code}</code> when a link is disabled.'
    },
    {
      title: 'Postgres: block sequence, table, alias insert', lang: 'sql',
      code: `-- each nextval reserves a block of 1,000 ids: [v, v + 999]
CREATE SEQUENCE url_id_block START 1000 INCREMENT BY 1000;

CREATE TABLE urls (
  code        varchar(12) PRIMARY KEY,
  long_url    text        NOT NULL,
  owner_id    bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  status      text        NOT NULL DEFAULT 'active'
);
CREATE INDEX urls_expiring ON urls (expires_at) WHERE expires_at IS NOT NULL;

-- custom alias: atomic, no check-then-insert race
INSERT INTO urls (code, long_url, owner_id)
VALUES ('launch', 'https://example.com/big-launch', 42)
ON CONFLICT (code) DO NOTHING
RETURNING code;                -- no row returned  =>  409 Conflict

-- redirect lookup
SELECT long_url FROM urls
WHERE code = $1 AND status = 'active'
  AND (expires_at IS NULL OR expires_at > now());`
    },
    {
      title: 'Python: scrambled Base62 (bijective)', lang: 'python',
      code: `ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
L = 7
M = 62 ** L                      # keyspace: 3,521,614,606,208
P = 1_580_030_173                # odd and not divisible by 31 -> coprime with M
P_INV = pow(P, -1, M)            # modular inverse (Python 3.8+)

def encode(n: int) -> str:
    assert 0 <= n < M
    x = (n * P) % M              # bijection on [0, M): no collisions possible
    out = []
    for _ in range(L):           # fixed length, left-padded with '0'
        x, r = divmod(x, 62)
        out.append(ALPHA[r])
    return "".join(reversed(out))

def decode(code: str) -> int:
    x = 0
    for ch in code:
        x = x * 62 + ALPHA.index(ch)
    return (x * P_INV) % M

assert decode(encode(125_000_000_123)) == 125_000_000_123`,
      note: 'Multiplication by a constant is a light scramble that stops casual enumeration, not cryptography. Use a keyed Feistel network if codes must be truly unpredictable.'
    }
  ],

  related: ['unique-id', 'distributed-cache', 'kv-store', 'cdn', 'rate-limiter', 'ad-click-aggregation']
});
