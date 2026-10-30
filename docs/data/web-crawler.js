SD.register({
  slug: 'web-crawler',
  domain: 6,
  title: 'Distributed Web Crawler',
  examples: 'Googlebot, Common Crawl',
  tagline: 'Download <b>billions of pages</b> quickly without hammering any single website, while skipping duplicates, traps and pages you have already seen.',
  tldr: {
    problem: 'The web is huge, keeps changing and is full of duplicates and infinite URL spaces. Thousands of fetchers must work in parallel, but each <i>host</i> wants to be visited gently.',
    idea: 'A <b>URL frontier</b> with two layers: <b>front queues</b> decide <i>what</i> matters most, and <b>back queues (one per host)</b> decide <i>when</i> it is polite to fetch. A <b>Bloom filter</b> answers "seen this URL?" from RAM, and <b>SimHash</b> catches near-duplicate content.',
    insight: 'Politeness, not bandwidth, is usually the limit: throughput ≈ <b>number of active hosts ÷ per-host delay</b>. So you scale by crawling many hosts at once, not one host faster.',
    numbers: [
      { v: '6.3B', l: 'pages in 41 days on one server (IRLbot, 2008)' },
      { v: '~2.1B', l: 'pages in Common Crawl\'s Aug 2026 archive' },
      { v: '64-bit · k=3', l: 'SimHash near-dup setting at 8B pages (Google, 2007)' }
    ]
  },

  requirements: {
    functional: [
      'Start from seed URLs and follow links',
      'Obey robots.txt and per-host rate limits',
      'Skip URLs already seen; normalise URL variants',
      'Detect exact and near-duplicate content',
      'Store raw pages (WARC) for indexing and analysis',
      'Re-crawl pages based on importance and change rate'
    ],
    nonFunctional: [
      'Thousands to 10⁵+ pages/s across the fleet',
      'Never overload a site (politeness)',
      'Robust to traps, malformed HTML and slow servers',
      'Seen-set lookups from memory (no disk seek per URL)',
      'Horizontally scalable; survive node loss via checkpoints',
      'Prioritise important and fresh pages'
    ],
    outOfScope: ['Ranking and query serving (see Search Engine)', 'Rendering heavy JavaScript apps at scale', 'Login-walled or paywalled content']
  },

  calculator: {
    inputs: [
      { id: 'pages', label: 'Pages per crawl cycle', min: 100000000, max: 100000000000, value: 5000000000, log: true },
      { id: 'days', label: 'Cycle length', min: 1, max: 60, value: 30, unit: 'days' },
      { id: 'size', label: 'Avg page size (uncompressed)', min: 10000, max: 500000, value: 150000, fmt: 'bytes', log: true },
      { id: 'srv', label: 'Pages/s one fetcher server sustains', min: 100, max: 3000, step: 50, value: 1000 },
      { id: 'known', label: 'Distinct URLs known (seen set)', min: 1000000000, max: 1000000000000, value: 20000000000, log: true },
      { id: 'bits', label: 'Bloom filter bits per URL', min: 4, max: 24, value: 10, unit: 'bits' }
    ],
    outputs: [
      { label: 'Fetch rate needed', unit: 'pages/s', f: (v) => v.pages / (v.days * 86400) },
      { label: 'Download bandwidth', fmt: 'bits', f: (v) => v.pages / (v.days * 86400) * v.size * 8 },
      { label: 'Fetcher servers', f: (v) => Math.ceil(v.pages / (v.days * 86400) / v.srv) },
      { label: 'Raw storage per cycle', fmt: 'bytes', f: (v) => v.pages * v.size },
      { label: 'Bloom filter RAM', fmt: 'bytes', f: (v) => v.known * v.bits / 8 },
      { label: 'Bloom false-positive rate (optimal k)', fmt: 'pct', f: (v) => Math.pow(0.6185, v.bits) }
    ],
    note: 'Common Crawl\'s Aug 2026 archive is 2.14B pages and ~360 TiB uncompressed, about 185 KB per record, which is where the default size comes from. IRLbot sustained 1,789 pages/s on a single server, so 1,000/s is a conservative <em>estimate</em>. FP rate ≈ <code>0.6185^(m/n)</code> at the optimal <code>k = (m/n)·ln 2</code>.'
  },

  api: [
    { m: 'POST', p: '/v1/seeds', d: 'Add seed URLs with a priority. They enter the front queues like any discovered link.' },
    { m: 'RPC', p: 'Frontier.next(fetcherId) → (host, url)', d: 'Returns a URL only from a host whose <code>next_allowed_at</code> has passed. A heap keyed by that time makes this O(log hosts).' },
    { m: 'RPC', p: 'Frontier.addBatch(urls[], src)', d: 'Links after normalisation and the seen check. Batched per destination node, because the owner is <code>hash(host) mod N</code>.' },
    { m: 'GET', p: 'robots cache: allowed(host, path)', d: 'robots.txt fetched once and cached (RFC 9309: up to 24 h). Missing (4xx) means allow all; unreachable (5xx) means assume disallow.' },
    { m: 'PUT', p: 's3://crawl/{date}/{segment}.warc.gz', d: 'Raw responses with headers, appended into large WARC files: few objects, many records.' }
  ],
  dataModel: [
    { name: 'url_seen', store: 'Bloom filter (RAM) + URL DB', fields: [['url_hash', '64-bit', 'pk'], ['last_fetch', 'ts'], ['etag / last_modified', 'text'], ['change_rate', 'float'], ['simhash', '64-bit', 'idx']], note: 'The Bloom filter answers "definitely new" in RAM. The disk DB keeps recrawl metadata (IRLbot batched these checks with DRUM).' },
    { name: 'host', store: 'per-node table', fields: [['host', 'text', 'pk'], ['ip', 'cached DNS'], ['next_allowed_at', 'ts', 'idx'], ['crawl_delay', 's'], ['robots', 'parsed rules + fetched_at'], ['budget', 'pages left']], note: 'Owned by the node that hash(host) maps to, so politeness is enforced locally.' },
    { name: 'frontier', store: 'disk-backed queues', fields: [['front[i]', 'FIFO per priority level', 'idx'], ['back[host]', 'FIFO, one host each', 'pk'], ['heap', '(next_allowed_at, host)']], note: 'Only the queue heads live in memory. The rest spills to disk.' }
  ],

  architecture: {
    title: 'Web crawler architecture',
    nodes: [
      { id: 'robots', label: 'robots.txt cache', sub: 'rules per host ≤ 24 h', kind: 'cache', wide: [710, -75], tall: [350, 105], tip: 'Parsed robots rules per host. Fetched once and cached; RFC 9309 says caches should not be used for more than 24 hours.' },
      { id: 'dns', label: 'DNS cache', sub: 'host → IP, async', kind: 'cache', wide: [910, -75], tall: [350, 210], tip: 'A local resolver cache. Without it, DNS lookups become the bottleneck (Brin & Page kept a DNS cache in every crawler).' },
      { id: 'seeds', label: 'Seed URLs', sub: 'curated start set', kind: 'client', wide: [90, 40], tall: [70, 0], tip: 'Hand-picked and previously known good URLs. They enter the frontier like any other link.' },
      { id: 'front', label: 'Frontier: front', sub: 'F priority queues', kind: 'queue', wide: [290, 40], tall: [210, 0], tip: 'Prioritiser puts each URL into one of F queues by importance (in-degree, PageRank, change rate). A biased selector drains higher queues more often.' },
      { id: 'back', label: 'Frontier: back', sub: 'one queue per host', kind: 'queue', wide: [500, 40], tall: [210, 105], tip: 'Each back queue holds URLs of a single host. A heap of (next_allowed_at, host) decides which host may be fetched next.' },
      { id: 'fetch', label: 'Fetchers', sub: 'async HTTP, 1000s conns', kind: 'compute', wide: [710, 40], tall: [210, 210], tip: 'Event-loop HTTP clients with thousands of open connections per server, timeouts and size limits.' },
      { id: 'web', label: 'The Web', sub: 'billions of hosts', kind: 'external', wide: [910, 40], tall: [350, 315], tip: 'Slow servers, 429s, redirects, broken HTML, infinite calendars. Everything must be defensive.' },
      { id: 'sched', label: 'Recrawl scheduler', sub: 'importance × change rate', kind: 'compute', wide: [90, 160], tall: [350, 0], tip: 'Re-queues known URLs when they are likely to have changed: news hourly, archives monthly.' },
      { id: 'seen', label: 'URL seen?', sub: 'Bloom filter + URL DB', kind: 'cache', wide: [290, 160], tall: [70, 105], tip: 'A Bloom filter in RAM answers "definitely new" or "probably seen". A false positive means a new URL is wrongly skipped.' },
      { id: 'filter', label: 'URL filter', sub: 'normalise · scope · traps', kind: 'service', wide: [500, 160], tall: [70, 210], tip: 'Lowercases the host, removes fragments and session ids, sorts query params, and enforces depth, length and per-host budgets.' },
      { id: 'parse', label: 'Parser', sub: 'links + text', kind: 'service', wide: [710, 160], tall: [210, 315], tip: 'Extracts outlinks (resolved against the base URL), text and metadata. Honours rel=nofollow and meta robots.' },
      { id: 'dedup', label: 'Content dedup', sub: 'checksum + SimHash', kind: 'compute', wide: [710, 280], tall: [210, 420], tip: 'Exact duplicates by checksum, near-duplicates by 64-bit SimHash within Hamming distance 3.' },
      { id: 'store', label: 'Page store', sub: 'WARC on object store', kind: 'store', wide: [910, 160], tall: [350, 420], tip: 'Raw HTTP responses in WARC files on S3/GCS, which feed indexing, analytics and ML.' }
    ],
    edges: [
      { from: 'seeds', to: 'front' },
      { from: 'front', to: 'back' },
      { from: 'back', to: 'fetch' },
      { from: 'fetch', to: 'robots' },
      { from: 'fetch', to: 'dns' },
      { from: 'fetch', to: 'web', bidi: true },
      { from: 'fetch', to: 'parse' },
      { from: 'parse', to: 'dedup' },
      { from: 'dedup', to: 'store' },
      { from: 'parse', to: 'filter' },
      { from: 'filter', to: 'seen' },
      { from: 'seen', to: 'front' },
      { from: 'seen', to: 'sched', dashed: true },
      { from: 'sched', to: 'front', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'cycle', title: 'One fetch cycle', tone: 'info',
      steps: [
        { text: 'Seeds enter the <b>front queues</b> by priority. The router moves them to the <b>back queue</b> for their host.', flow: ['seeds>front', 'front>back'], badges: { back: 'host: bbc.co.uk' } },
        { text: 'The host heap says <code>bbc.co.uk</code> may be fetched now. The fetcher resolves DNS from cache and checks the <b>robots.txt</b> rules.', flow: ['back>fetch', ['fetch>dns', 'fetch>robots']], badges: { robots: 'allowed' } },
        { text: 'HTTP GET with a size cap and timeout. The response comes back over a connection kept alive for this host.', flow: ['fetch>web', 'web>fetch'], badges: { fetch: '200 · 182 KB' } },
        { text: 'The parser extracts 140 links and the text. The content hash and SimHash are new, so the page is appended to a <b>WARC</b> file.', flow: ['fetch>parse', 'parse>dedup', 'dedup>store'], ok: ['store'], tone: 'ok' },
        { text: 'Links are normalised and filtered, then checked against the <b>Bloom filter</b>. The 37 that are definitely new go back into the frontier.', flow: ['parse>filter', 'filter>seen', 'seen>front'], badges: { seen: '37 new / 140' }, tone: 'ok' }
      ]
    },
    {
      id: 'polite', title: 'Politeness on a hot host', tone: 'warn',
      steps: [
        { text: 'A sitemap page yields <b>5,000 links</b>, all on <code>shop.example</code>. Without control the fetchers would hit it 5,000 times at once.', flow: ['parse>filter', 'filter>seen', 'seen>front', 'front>back'], warn: ['back'], badges: { back: ['5,000 × 1 host', 'warn'] }, tone: 'warn' },
        { text: 'They all land in <b>one back queue</b>, and only one fetch per host is in flight. After each fetch, <code>next_allowed_at = now + delay</code> (robots <code>Crawl-delay</code>, or a multiple of the last response time).', flow: ['back>fetch', 'fetch>web'], badges: { back: 'next in 2 s' } },
        { text: 'Meanwhile the fetchers serve <b>thousands of other hosts</b> from the heap, so total throughput stays high even though each host is visited slowly.', nodes: ['back', 'fetch'], ok: ['fetch'], badges: { fetch: ['other hosts', 'ok'] }, tone: 'ok' },
        { text: 'The site answers <code>429</code> or <code>503</code>. Back off <b>exponentially</b> for that host and honour <code>Retry-After</code>.', flow: ['fetch>web', 'web>fetch'], warn: ['web'], badges: { web: ['429', 'warn'], back: 'delay ×2' } }
      ]
    },
    {
      id: 'trap', title: 'Spider trap: infinite calendar', tone: 'err',
      steps: [
        { text: 'A calendar page links to <code>/cal/2026/11</code>, which links to <code>/cal/2026/12</code>, and so on <b>forever</b>. Every URL is new, so the Bloom filter says "new" each time.', flow: ['fetch>parse', 'parse>filter', 'filter>seen', 'seen>front'], err: ['front'], badges: { front: ['+1 forever', 'err'] }, tone: 'err' },
        { text: 'Other traps include session ids in URLs, <code>?sort=</code> permutations and ever-deeper relative paths (<code>/a/a/a/…</code>).', nodes: ['filter'], warn: ['filter'], badges: { filter: ['/a/a/a/a/…', 'warn'] } },
        { text: '<b>URL filter</b> defences: max depth and URL length, repeated path segments, stripping session parameters, and a <b>per-host page budget</b>.', nodes: ['filter'], ok: ['filter'], badges: { filter: ['depth ≤ 16', 'ok'] }, tone: 'ok' },
        { text: 'IRLbot\'s approach: give each domain a <b>budget based on its reputation</b> (links from other sites). A spam farm with no real in-links cannot grow its share of the crawl.', nodes: ['sched', 'front'], ok: ['front'], badges: { sched: 'budget by in-degree' }, tone: 'ok' }
      ]
    },
    {
      id: 'dup', title: 'Near-duplicate page', tone: 'warn',
      steps: [
        { text: 'A mirror site serves the same article with a different header, date and ads. The URL is new and the checksum differs.', flow: ['back>fetch', 'fetch>web', 'web>fetch', 'fetch>parse'], badges: { parse: 'new URL' } },
        { text: '<b>SimHash</b>: hash every shingle and add ±1 per bit position, then keep the sign. Similar text gives fingerprints that differ in only a few bits.', flow: ['parse>dedup'], badges: { dedup: 'Hamming = 2' }, warn: ['dedup'] },
        { text: 'Hamming distance ≤ 3 on a 64-bit fingerprint means near-duplicate (the setting Google reported for 8B pages). Do not store the page, and lower the mirror\'s priority.', nodes: ['dedup', 'store'], ok: ['dedup'], badges: { store: ['skipped', 'ok'] }, tone: 'ok' },
        { text: 'Its links may still be useful, so they are filtered and seen-checked as usual. Most will already be in the Bloom filter.', flow: ['parse>filter', 'filter>seen'], badges: { seen: '0 new / 90' } }
      ]
    },
    {
      id: 'scale', title: 'Scaling out across machines', tone: 'ok',
      steps: [
        { text: 'Partition by <b>hash(host) mod N</b>. Each node owns whole hosts, so politeness, DNS and robots caching stay <b>local</b>.', nodes: ['back', 'robots', 'dns'], ok: ['back'], labels: { back: { label: 'Frontier: back', sub: 'node 7 of 64' } } },
        { text: 'Links to hosts owned by other nodes are <b>batched</b> and shipped. Many links point within the same site, so those never leave the node.', flow: ['parse>filter', 'filter>seen'], badges: { filter: 'batch → node 12' } },
        { text: 'The seen-set check runs in big sorted batches against disk instead of one seek per URL. IRLbot\'s <b>DRUM</b> used bucket sort for this and ran <b>6.3B pages in 41 days on one server</b>.', nodes: ['seen'], ok: ['seen'], badges: { seen: 'DRUM batch' }, tone: 'ok' },
        { text: 'A node dies: its hosts are rehashed to the others, which reload the frontier from the last <b>checkpoint</b>. Some pages are fetched twice; nothing is lost.', nodes: ['front', 'back'], warn: ['back'], badges: { back: ['reassigned', 'warn'] } }
      ]
    }
  ],

  knobs: {
    intro: 'Tune the crawl order, the seen-set Bloom filter, the politeness delay and how work is split across nodes. Fleet: 100 fetcher servers, 200K hosts with pending URLs (illustrative).',
    diagram: null,
    controls: [
      { id: 'order', label: 'Crawl strategy', type: 'seg', value: 'prio', options: [
        { v: 'bfs', l: 'BFS (FIFO)' }, { v: 'prio', l: 'Priority (PageRank / in-degree)' }, { v: 'fresh', l: 'Freshness re-crawl' }] },
      { id: 'bits', label: 'Bloom bits per URL (m/n)', type: 'range', min: 2, max: 20, step: 1, value: 10, unit: 'bits' },
      { id: 'delay', label: 'Per-host delay', type: 'range', min: 0.5, max: 30, step: 0.5, value: 2, unit: 's' },
      { id: 'part', label: 'Partition work by', type: 'seg', value: 'host', options: [
        { v: 'host', l: 'hash(host)' }, { v: 'url', l: 'hash(full URL)' }] }
    ],
    evaluate(s) {
      const CAP = 100 * 1500;     // 100 servers × 1.5K pages/s (estimate; IRLbot did ~1.8K/s on one box)
      const HOSTS = 200000;       // hosts with pending URLs (estimate)
      const polite = HOSTS / s.delay;
      const urlPartPenalty = s.part === 'url' ? 0.7 : 1; // global per-host rate limiter round-trips (illustrative)
      const pps = Math.min(CAP, polite) * urlPartPenalty;
      const k = Math.max(1, Math.round(s.bits * Math.LN2));
      const fp = Math.pow(1 - Math.exp(-k / s.bits), k);
      const mem = 10e9 * s.bits / 8;
      const O = {
        bfs: { imp: 'whatever is near the seeds', si: 0.4, fr: 'none: one pass, pages go stale', sf: 0.2, sub: 'FIFO (BFS)' },
        prio: { imp: 'high in-degree pages first', si: 0.9, fr: 'weak: no revisit policy', sf: 0.4, sub: 'by PageRank / in-degree' },
        fresh: { imp: 'important known pages kept fresh', si: 0.75, fr: 'revisit ∝ change rate', sf: 0.9, sub: 'due recrawls + new URLs' }
      }[s.order];
      const metrics = [
        { k: 'Pages fetched / s', v: SD.fmt.num(pps) + '/s (' + SD.fmt.num(pps * 86400) + '/day)', s: Math.min(1, pps / CAP), hint: polite < CAP ? 'politeness-bound' : 'fetcher-bound' },
        { k: 'Load on each host', v: '1 request / ' + s.delay + ' s', s: s.delay < 1 ? 0.15 : s.delay <= 10 ? 0.9 : 0.75, hint: s.delay < 1 ? 'impolite' : 'polite' },
        { k: 'Seen-set RAM (10B URLs)', v: SD.fmt.bytes(mem) + ' · k = ' + k, s: mem <= 15e9 ? 0.85 : mem <= 25e9 ? 0.6 : 0.35 },
        { k: 'New URLs wrongly skipped', v: (fp * 100).toFixed(fp < 0.001 ? 4 : 2) + '%', s: fp <= 0.01 ? 0.9 : fp <= 0.05 ? 0.55 : 0.15, hint: 'Bloom FP' },
        { k: 'Important pages first', v: O.imp, s: O.si },
        { k: 'Index freshness', v: O.fr, s: O.sf },
        { k: 'Politeness enforcement', v: s.part === 'host' ? 'local per-host queue' : 'global rate limiter needed', s: s.part === 'host' ? 0.9 : 0.4 }
      ];
      const notes = [];
      if (s.delay < 1) notes.push('Sub-second delays look like an attack to small sites and get crawlers blocked. Honour <code>Crawl-delay</code> and back off on 429/503.');
      if (polite < CAP) notes.push('Throughput is <b>politeness-bound</b>: ' + SD.fmt.num(HOSTS) + ' hosts ÷ ' + s.delay + ' s = ' + SD.fmt.num(polite) + '/s. To go faster, keep <i>more hosts</i> active instead of hitting each one harder.');
      notes.push('Bloom filter with ' + s.bits + ' bits/URL and k = ' + k + ': FP ≈ ' + (fp * 100).toFixed(2) + '%. A false positive means a <b>new URL is never crawled</b>, with no error raised.');
      if (s.part === 'url') notes.push('With URL hashing every node holds URLs for every host. Politeness then needs a shared per-host limiter, and DNS and robots caches are duplicated N times.');
      if (s.part === 'host') notes.push('Host hashing keeps a host on one node (Mercator-style). Watch for giant hosts skewing one node; split them by path if needed.');
      if (s.order === 'fresh') notes.push('The recrawl scheduler estimates each page\'s change rate (from ETag and content-hash history) and revisits pages that change often and matter.');
      let verdict;
      if (s.delay < 1) verdict = '❌ <b>Impolite.</b> Sites will rate-limit or ban the crawler.';
      else if (fp > 0.05) verdict = '⚠ <b>Bloom filter too small:</b> ' + (fp * 100).toFixed(1) + '% of new URLs are silently dropped.';
      else if (s.order === 'bfs') verdict = '⚠ <b>BFS is simple, but it wastes fetches on low-value pages and never revisits.</b> Fine for a small, bounded crawl.';
      else if (s.part === 'url') verdict = '⚠ <b>URL-hash partitioning fights politeness.</b> Partition by host.';
      else if (s.order === 'fresh' && s.bits >= 8) verdict = '✅ <b>Production shape:</b> host-partitioned frontier, a right-sized Bloom filter, polite delays and change-rate-driven recrawls.';
      else verdict = '👍 <b>Good first-pass crawler.</b> Add a recrawl policy to keep the index fresh.';
      return {
        metrics, verdict, notes,
        labels: { front: { label: 'Frontier: front', sub: O.sub }, seen: { label: 'URL seen?', sub: 'Bloom ' + s.bits + ' b/URL · ' + (fp * 100).toFixed(1) + '% FP' }, back: { label: 'Frontier: back', sub: s.part === 'host' ? 'per host · local' : 'per host · global lock' } },
        hide: s.order === 'fresh' ? [] : ['sched'],
        hot: s.order === 'fresh' ? ['sched'] : [],
        warn: (fp > 0.05 ? ['seen'] : []).concat(s.part === 'url' ? ['back'] : []),
        err: s.delay < 1 ? ['web'] : [],
        badges: { fetch: [SD.fmt.num(pps) + '/s', 'info'], seen: [(fp * 100).toFixed(1) + '% FP', fp > 0.05 ? 'err' : 'info'] },
        flow: (s.order === 'fresh' ? ['seen>sched', 'sched>front'] : []).concat(['front>back', 'back>fetch', 'fetch>web', 'fetch>parse', 'parse>filter', 'filter>seen', 'seen>front'])
      };
    }
  },

  widget: {
    title: 'Bloom filter "seen" set + per-host back queues',
    caption: 'Each discovered URL is hashed <b>k</b> times into an <b>m</b>-bit array (real double hashing). If every bit is already set it is "probably seen" and skipped, and sometimes wrongly (a <b>false positive</b>). New URLs go to their host\'s back queue, and each host is fetched at most once per delay.'
  },

  realWorld: {
    intro: 'Crawler design has been remarkably stable since the late 1990s. The papers below are still the reference designs.',
    timeline: [
      { when: '1998', who: 'Google (Brin & Page)', title: 'The original Google crawler', text: 'A URLserver hands lists of URLs to a few crawlers. Each crawler keeps roughly <b>300 connections</b> open, uses asynchronous I/O and has its own <b>DNS cache</b>. The paper calls crawling the most fragile part of the system.', src: 0 },
      { when: '1999', who: 'Compaq (Heydon & Najork)', title: 'Mercator', text: 'A scalable, extensible crawler in Java. Its URL frontier, as taught in IR courses, has <b>front queues</b> for priority and <b>back queues with one host each</b> for politeness, plus fingerprint-based content-seen tests.', src: 1 },
      { when: '2007', who: 'Google (Manku et al.)', title: 'SimHash near-duplicate detection', text: 'For a repository of <b>8 billion pages</b>, 64-bit SimHash fingerprints with Hamming distance <b>k = 3</b> were found to work well for near-duplicate detection during crawling.', src: 3 },
      { when: '2008', who: 'Texas A&M', title: 'IRLbot: 6.3B pages on one server', text: 'A 41-day crawl fetched <b>6.3 billion</b> valid HTML pages at an average of <b>1,789 pages/s</b> (319 Mb/s). <b>DRUM</b> batches URL-seen checks and updates on disk with bucket sort, and domain budgets resist spam traps.', src: 4 },
      { when: 'Sep 2022', who: 'IETF', title: 'RFC 9309: robots.txt standardised', text: 'Nearly 30 years after the original 1994 convention, the Robots Exclusion Protocol became a standard. It defines caching (generally no more than 24 hours), error handling, and requires crawlers to parse at least 500 KiB of robots.txt.', src: 5 },
      { when: 'Aug 2026', who: 'Common Crawl', title: 'Open monthly crawls', text: 'The August 2026 archive has about <b>2.14 billion pages</b> and roughly <b>360 TiB</b> of uncompressed content, published as WARC files for anyone to use.', src: 6 }
    ],
    lessons: [
      'Separate <b>what to crawl</b> (priority) from <b>when it is polite</b> (per-host timing).',
      'Partition by <b>host</b> so politeness and caches stay local.',
      'Do seen checks in <b>RAM (Bloom)</b> or in <b>sorted batches (DRUM)</b>, never one disk seek per URL.',
      'Assume the web is adversarial: traps, spam, mirrors and slow servers.'
    ],
    sources: [
      { title: 'The Anatomy of a Large-Scale Hypertextual Web Search Engine', url: 'https://research.google/pubs/pub334/', pub: 'Brin & Page, WWW 1998' },
      { title: 'Mercator: A Scalable, Extensible Web Crawler', url: 'https://courses.cs.washington.edu/courses/cse454/13wi/papers/mercator.pdf', pub: 'Heydon & Najork, 1999' },
      { title: 'Web crawling lecture (Mercator URL frontier)', url: 'https://www.cs.sjtu.edu.cn/~kzhu/wsm/L8.pdf', pub: 'SJTU, after Manning et al. IIR ch. 20' },
      { title: 'Detecting Near-Duplicates for Web Crawling', url: 'https://www.www2007.cpsc.ucalgary.ca/papers/paper215.pdf', pub: 'Manku, Jain, Das Sarma, WWW 2007' },
      { title: 'IRLbot: Scaling to 6 Billion Pages and Beyond', url: 'https://archives.iw3c2.org/www2008/papers/fp865.html', pub: 'Lee et al., WWW 2008' },
      { title: 'RFC 9309: Robots Exclusion Protocol', url: 'https://rfc-editor.org/rfc/rfc9309.html', pub: 'IETF, Sep 2022' },
      { title: 'August 2026 Crawl Archive Now Available', url: 'https://commoncrawl.org/blog/august-2026-crawl-archive-now-available', pub: 'Common Crawl, 2026' },
      { title: 'Optimizing Bloom Filter: Challenges, Solutions, and Comparisons', url: 'https://arxiv.org/pdf/1804.04777', pub: 'arXiv survey' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Seen set', '<b>Bloom filter</b>: tiny RAM, false positives skip new URLs', '<b>Exact set / disk DB</b>: no misses, needs batching (DRUM)', 'Bloom in front of a disk DB that holds recrawl metadata'],
      ['Partitioning', '<b>hash(host)</b>: local politeness and caches', '<b>hash(URL)</b>: even spread', 'Host, then split only the few giant hosts'],
      ['Order', '<b>BFS</b>: simple, finds high-in-degree pages early-ish', '<b>Priority</b>: important first, needs link stats', 'Priority for big crawls; BFS for small bounded ones'],
      ['Duplicate detection', '<b>Checksum</b>: exact only, cheap', '<b>SimHash</b>: near-dups, needs a Hamming index', 'Both: checksum first, SimHash on misses'],
      ['Rendering', '<b>Raw HTML</b>: fast and cheap', '<b>Headless browser</b>: sees JS content, ~10–100× cost (estimate)', 'Render only pages that need it, flagged by heuristics'],
      ['Recrawl', '<b>Uniform</b> (every N days)', '<b>Change-rate based</b>', 'Change-rate: spend fetches where content actually changes']
    ]
  },
  failures: [
    { f: 'Spider trap', detect: 'One host\'s queue grows without bound; deep or repetitive paths', fix: 'Depth and length caps, per-host budgets, path-repetition filter.' },
    { f: 'Overloading a site', detect: '429/503 responses, complaints, blocks', fix: 'One connection per host, delay from robots or response time, exponential backoff.' },
    { f: 'DNS bottleneck', detect: 'Fetchers idle, waiting on resolution', fix: 'Local caching resolver, async DNS, prefetch for queued hosts.' },
    { f: 'Bloom filter saturation', detect: 'Fill ratio > 50%; new-URL rate drops', fix: 'Size for the expected n up front, or use scalable / partitioned Bloom filters.' },
    { f: 'Node crash', detect: 'Heartbeats lost', fix: 'Rehash its hosts; restore frontier from checkpoint; accept a few duplicate fetches.' },
    { f: 'Near-duplicate floods (mirrors, faceted pages)', detect: 'High SimHash match rate per host', fix: 'Skip storing, demote host priority, canonicalise parameters.' }
  ],

  interview: [
    { q: 'How do you make the crawler polite?', a: '<ul><li>Obey <b>robots.txt</b>.</li><li>Keep <b>one connection per host</b>.</li><li>After each fetch, wait (Crawl-delay, or a multiple of the response time) before the next fetch to that host.</li><li>Back off on 429/503 and honour Retry-After.</li></ul><p>Structurally: <b>back queues with one host each</b> plus a heap keyed by <code>next_allowed_at</code>.</p>', lvl: 'core' },
    { q: 'Explain front queues vs back queues in the frontier.', a: '<p><b>Front queues</b> (F of them) encode <i>priority</i>: a prioritiser assigns each URL a level, and a biased selector pulls from high levels more often.</p><p><b>Back queues</b> (B of them) each hold <i>one host</i>. A heap of (next allowed time, queue) tells fetchers which host may be hit now. When a back queue empties, it is refilled from the front queues. Priority and politeness are decoupled.</p>', lvl: 'core' },
    { q: 'Dedupe URLs vs dedupe content: what is the difference?', a: '<p><b>URL dedup</b> (seen set) avoids fetching the same address twice: normalise the URL, then check a Bloom filter or URL DB.</p><p><b>Content dedup</b> catches different URLs with the same or similar page: an exact checksum, then <b>SimHash</b> for near-dups (Hamming ≤ 3 on 64 bits). You need both.</p>', lvl: 'core' },
    { q: 'Size a Bloom filter for 10 billion URLs at 1% false positives.', a: '<p><code>m/n = −ln(p) / (ln 2)² ≈ 9.6 bits</code>, so about <b>96 Gbit ≈ 12 GB</b>, with <code>k = (m/n)·ln 2 ≈ 7</code> hashes.</p><p>A false positive means a new URL is <b>silently never crawled</b>. That is acceptable at 1%, and you can shard the filter by host hash across nodes.</p>', lvl: 'core' },
    { q: 'How do you detect and escape spider traps?', a: '<p>Use limits: max depth, max URL length, repeated path segments, per-host page budgets, and canonicalising or stripping session and sort parameters.</p><p>Use reputation: give domains crawl budget in proportion to their in-links (IRLbot\'s approach), so link farms cannot grow their share.</p>', lvl: 'core' },
    { q: 'How do you decide when to re-crawl a page?', a: '<p>Estimate each page\'s <b>change rate</b> from history (content hash, ETag, Last-Modified) and weight it by importance. Schedule the next visit sooner for pages that change often and matter.</p><p>Use conditional GETs (<code>If-None-Match</code>) so unchanged pages cost a 304.</p>', lvl: 'deep' },
    { q: 'How do you distribute the crawl across machines?', a: '<p>Assign hosts to nodes with <b>hash(host)</b>, ideally consistent hashing. Each node owns its hosts\' back queues, robots and DNS caches, so politeness is local.</p><p>Discovered links to foreign hosts are <b>batched</b> to their owners. Checkpoint the frontier, and rehash a dead node\'s hosts.</p>', lvl: 'core' },
    { q: 'Why is DNS a bottleneck, and what do you do?', a: '<p>Each new host needs a lookup. Synchronous resolvers block threads and add 10–100 ms each (<em>estimate</em>). Run a <b>local caching resolver</b>, resolve asynchronously, and prefetch for hosts that are about to reach the front of the heap.</p>', lvl: 'deep' },
    { q: 'What do you normalise in a URL before the seen check?', a: '<ul><li>Lowercase the scheme and host.</li><li>Remove the default port and the <code>#fragment</code>.</li><li>Resolve <code>./</code> and <code>../</code>.</li><li>Sort query parameters and drop tracking or session parameters.</li><li>Decode unreserved percent-escapes.</li><li>Apply <code>rel=canonical</code> after fetch.</li></ul><p>Otherwise one page appears as thousands of "new" URLs.</p>', lvl: 'core' },
    { q: 'How would you handle JavaScript-heavy sites?', a: '<p>Most pages do not need rendering. Use a two-tier pipeline: fetch raw HTML first, and if heuristics show content is missing (empty body, app shell), send the page to a <b>headless-browser rendering queue</b> with strict budgets, because rendering costs far more CPU than parsing.</p>', lvl: 'deep' },
    { q: 'How fast can one machine crawl?', a: '<p>IRLbot (2008) sustained <b>1,789 pages/s</b> (319 Mb/s) on a <b>single server</b> for 41 days, fetching 6.3B pages. The limits were seen-set checks (solved with DRUM batching), politeness across enough hosts, and spam avoidance, not raw bandwidth.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Python: Bloom filter (double hashing)', lang: 'python',
      code: `import hashlib, math

class BloomFilter:
    def __init__(self, n: int, fp: float):
        self.m = math.ceil(-n * math.log(fp) / math.log(2) ** 2)   # bits
        self.k = max(1, round(self.m / n * math.log(2)))             # hash count
        self.bits = bytearray((self.m + 7) // 8)

    def _positions(self, item: str):
        d = hashlib.blake2b(item.encode(), digest_size=16).digest()
        h1 = int.from_bytes(d[:8], "little")
        h2 = int.from_bytes(d[8:], "little") | 1
        return ((h1 + i * h2) % self.m for i in range(self.k))      # Kirsch-Mitzenmacher

    def add(self, item: str) -> bool:
        """Insert; return True if it was (probably) present already."""
        present = True
        for p in self._positions(item):
            byte, bit = divmod(p, 8)
            if not self.bits[byte] >> bit & 1:
                present = False
                self.bits[byte] |= 1 << bit
        return present

    def __contains__(self, item: str) -> bool:
        return all(self.bits[p // 8] >> (p % 8) & 1 for p in self._positions(item))

    def fp_rate(self, n: int) -> float:
        return (1 - math.exp(-self.k * n / self.m)) ** self.k

seen = BloomFilter(n=10_000_000, fp=0.01)   # ~12 MB, k = 7`
    },
    {
      title: 'Python asyncio: polite crawler skeleton', lang: 'python',
      code: `import asyncio, re, time, aiohttp
from urllib.parse import urljoin, urldefrag, urlsplit
from urllib.robotparser import RobotFileParser

UA = "AtlasBot/0.1 (+https://example.com/bot)"
HREF = re.compile(r"""href=["'](.*?)["']""", re.I)
next_ok: dict[str, float] = {}               # host -> earliest next fetch
robots: dict[str, RobotFileParser] = {}

async def allowed(s: aiohttp.ClientSession, url: str) -> bool:
    p = urlsplit(url)
    if p.netloc not in robots:
        rp = RobotFileParser()
        try:
            async with s.get(f"{p.scheme}://{p.netloc}/robots.txt") as r:
                body = await r.text() if r.status == 200 else ""
                rp.parse(["User-agent: *", "Disallow: /"] if r.status >= 500 else body.splitlines())
        except (aiohttp.ClientError, asyncio.TimeoutError):
            rp.parse(["User-agent: *", "Disallow: /"])   # unreachable: assume disallow
        robots[p.netloc] = rp
    return robots[p.netloc].can_fetch(UA, url)

async def polite_wait(host: str, delay: float = 2.0) -> None:
    now = time.monotonic()
    slot = max(now, next_ok.get(host, 0.0))
    next_ok[host] = slot + delay                 # reserve the slot before sleeping
    await asyncio.sleep(slot - now)

async def worker(s, q: asyncio.Queue) -> None:
    while True:
        url, depth = await q.get()
        try:
            if depth > 8 or not await allowed(s, url):
                continue
            await polite_wait(urlsplit(url).netloc)
            async with s.get(url) as r:
                if "text/html" not in r.headers.get("content-type", ""):
                    continue
                html = await r.text()
            for href in HREF.findall(html):
                link, _ = urldefrag(urljoin(url, href))
                if link.startswith("http") and not seen.add(link):   # Bloom filter above
                    q.put_nowait((link, depth + 1))
        except (aiohttp.ClientError, asyncio.TimeoutError):
            pass
        finally:
            q.task_done()

async def main(seeds: list[str]) -> None:
    q: asyncio.Queue = asyncio.Queue()
    for u in seeds:
        seen.add(u); q.put_nowait((u, 0))
    async with aiohttp.ClientSession(headers={"User-Agent": UA},
                                     timeout=aiohttp.ClientTimeout(total=20)) as s:
        tasks = [asyncio.create_task(worker(s, q)) for _ in range(50)]
        await q.join()
        for t in tasks: t.cancel()`,
      note: 'One process with 50 coroutines. Scale out by running one per host partition (<code>hash(host) % N</code>) and shipping foreign links to their owner.'
    },
    {
      title: 'Java: 64-bit SimHash for near-duplicates', lang: 'java',
      code: `// Guava: com.google.common.hash.Hashing
public final class SimHash {
  public static long of(List<String> words) {
    int[] v = new int[64];
    for (int i = 0; i + 2 < words.size(); i++) {               // 3-word shingles
      String shingle = words.get(i) + ' ' + words.get(i + 1) + ' ' + words.get(i + 2);
      long h = Hashing.murmur3_128().hashString(shingle, StandardCharsets.UTF_8).asLong();
      for (int b = 0; b < 64; b++) v[b] += ((h >>> b) & 1L) == 1L ? 1 : -1;
    }
    long fp = 0L;
    for (int b = 0; b < 64; b++) if (v[b] > 0) fp |= 1L << b;
    return fp;
  }

  /** Manku et al. (2007): 64-bit fingerprints, Hamming distance <= 3. */
  public static boolean nearDuplicate(long a, long b) {
    return Long.bitCount(a ^ b) <= 3;
  }
}`,
      note: 'To find near-duplicates among billions of fingerprints, keep several tables sorted by different bit permutations, so a match within 3 bits shares an exact prefix in at least one table (the paper\'s trick).'
    }
  ],

  related: ['search-engine', 'url-shortener', 'job-scheduler', 'message-queue', 'object-storage', 'top-k']
});
