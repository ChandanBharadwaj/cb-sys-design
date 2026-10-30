SD.register({
  slug: 'typeahead',
  domain: 5,
  title: 'Autocomplete / Typeahead',
  examples: 'Google, LinkedIn, Amazon',
  tagline: 'Return the ten best completions for every keystroke in a few milliseconds, under a <b>~100 ms</b> budget that includes the network.',
  tldr: {
    problem: 'Each search can trigger a request per keystroke, so typeahead traffic is several times search traffic. A prefix like "s" matches millions of queries, yet the answer must arrive before the next key is pressed.',
    idea: 'Build a <b>trie offline</b> from query logs and store the <b>top-k completions at every node</b>. A lookup walks the prefix (O(length)) and returns a precomputed list. Cache popular prefixes at the edge.',
    insight: 'Move the work to build time. Ranking millions of matches per keystroke is impossible; ranking them once per rebuild and storing the answer is cheap. A small <i>real-time layer</i> adds trending queries on top.',
    numbers: [
      { v: '~20 ms', l: 'average LinkedIn network typeahead latency (LinkedIn, 2012)' },
      { v: '150M', l: 'members covered by that typeahead (LinkedIn, 2012)' },
      { v: 'O(L)', l: 'lookup cost with top-k stored per node (L = prefix length)' }
    ]
  },

  requirements: {
    functional: [
      'Suggest up to 10 completions for a prefix',
      'Rank by popularity, with recency',
      'Surface trending queries within minutes',
      'Personal suggestions (recent searches)',
      'Remove offensive or policy-violating suggestions fast',
      'Multiple languages and locales'
    ],
    nonFunctional: [
      'Server p99 ≲ 10–20 ms; end to end ≲ 100 ms',
      'Very high QPS (several requests per search)',
      'Highly available; degrade to "no suggestions", never error',
      'Eventual consistency is fine for counts',
      'Memory-bounded index per node',
      'Cheap to rebuild and roll back'
    ],
    outOfScope: ['Full-text search results (see Search Engine)', 'Spell-correction models', 'Query understanding / intent', 'Ads in suggestions']
  },

  calculator: {
    inputs: [
      { id: 'dau', label: 'Daily active users', min: 1000000, max: 1000000000, value: 100000000, log: true },
      { id: 'searches', label: 'Searches per user per day', min: 1, max: 30, value: 5 },
      { id: 'req', label: 'Requests per search (after debounce)', min: 1, max: 15, value: 4 },
      { id: 'uniq', label: 'Unique queries kept in the index', min: 1000000, max: 1000000000, value: 50000000, log: true },
      { id: 'len', label: 'Average query length', min: 8, max: 40, value: 20, unit: 'chars' },
      { id: 'k', label: 'Top-k stored per node', min: 3, max: 20, value: 10 }
    ],
    outputs: [
      { label: 'Suggest requests / second (average)', f: (v) => (v.dau * v.searches * v.req) / 86400 },
      { label: 'Peak requests / second (×3)', f: (v) => (v.dau * v.searches * v.req) / 86400 * 3 },
      { label: 'Trie nodes (~half of all chars shared)', f: (v) => v.uniq * v.len * 0.5 },
      { label: 'Query strings', fmt: 'bytes', f: (v) => v.uniq * v.len },
      { label: 'Top-k lists (4-byte query ids)', fmt: 'bytes', f: (v) => v.uniq * v.len * 0.5 * v.k * 4 },
      { label: 'RAM per replica (+ ~24 B per node)', fmt: 'bytes', f: (v) => v.uniq * v.len + v.uniq * v.len * 0.5 * (v.k * 4 + 24) }
    ],
    note: 'All values are <em>estimates</em>. The prefix-sharing factor depends heavily on the data. Notice that the <b>top-k lists usually cost more memory than the strings</b>. That is why real systems store ids rather than strings, cap k, and keep top-k only down to a certain depth.'
  },

  api: [
    { m: 'GET', p: '/v1/suggest?q=sys&locale=en&limit=10', d: 'Global suggestions. The response is identical for all users, so it is <b>cacheable at the CDN</b> (<code>Cache-Control: max-age=300</code>).' },
    { m: 'GET', p: '/v1/suggest/personal?q=sys', d: 'Recent searches for the signed-in user. <b>Private</b>, never cached at shared caches; the client merges both lists.' },
    { m: 'POST', p: '/v1/suggest/feedback', d: 'Impression and click logs <code>{prefix, shown[], clicked}</code>. Used for ranking and click-through rate.' },
    { m: 'PUT', p: '/admin/suggest/denylist', d: 'Remove a suggestion everywhere within minutes. Checked at serve time, so removal does not wait for a rebuild.' }
  ],
  dataModel: [
    { name: 'query_stats', store: 'Warehouse (Spark / BigQuery)', fields: [['query', 'text', 'pk'], ['locale', 'text', 'pk'], ['score', 'decayed count'], ['clicks', 'int'], ['last_seen', 'date']], note: 'Rebuilt from query logs. Rare queries are dropped: they are noise and may contain private data.' },
    { name: 'trie snapshot', store: 'Object store (S3), versioned', fields: [['version', 'int', 'pk'], ['nodes', 'children + top-k ids'], ['strings', 'id → text']], note: 'Immutable. Servers load a new version and swap atomically.' },
    { name: 'trending', store: 'Redis sorted sets', fields: [['key', 'window:locale', 'pk'], ['member', 'query'], ['score', 'count in window']], note: 'Short sliding windows; compared with the baseline to detect bursts.' },
    { name: 'recent:{user}', store: 'Redis list', fields: [['user_id', 'int64', 'pk'], ['queries', 'last 20']], note: 'Feeds personal suggestions.' }
  ],

  architecture: {
    title: 'Typeahead architecture',
    nodes: [
      { id: 'cli', label: 'Client', sub: 'debounce · local cache', kind: 'client', wide: [90, 220], tall: [210, 0], tip: 'Waits for a short pause in typing before sending, reuses earlier responses, and cancels stale requests.' },
      { id: 'cdn', label: 'CDN / edge cache', sub: 'prefix → JSON', kind: 'edge', wide: [280, 220], tall: [210, 105], tip: 'Short popular prefixes are a small, very hot set: an ideal edge cache with a TTL of minutes.' },
      { id: 'sug', label: 'Suggest service', sub: 'route · merge · filter', kind: 'service', wide: [470, 220], tall: [210, 210], tip: 'Routes the prefix to its trie shard, merges trending and personal results, and applies the denylist.' },
      { id: 'pers', label: 'Personal history', sub: 'recent searches', kind: 'cache', wide: [470, 110], tall: [70, 210], tip: 'Per-user recent queries. Kept out of the shared cache.' },
      { id: 'shA', label: 'Trie shard a–m', sub: 'in-memory · top-k', kind: 'cache', wide: [660, 110], tall: [70, 315], tip: 'Immutable in-memory trie with the top-k completions stored at every node. Replicated for QPS.' },
      { id: 'shB', label: 'Trie shard n–z', sub: 'in-memory · top-k', kind: 'cache', wide: [660, 220], tall: [210, 315], tip: 'Prefix ranges are split by traffic, not by alphabet: "s" gets far more traffic than "x".' },
      { id: 'trend', label: 'Trending layer', sub: 'minutes-fresh', kind: 'compute', wide: [660, 330], tall: [350, 210], tip: 'Sliding-window counts from the query stream. Bursts above baseline are merged into suggestions in real time.' },
      { id: 'logs', label: 'Query log stream', sub: 'Kafka', kind: 'queue', wide: [470, 440], tall: [350, 315], tip: 'Every search and selection is logged asynchronously. It never sits on the request path.' },
      { id: 'agg', label: 'Aggregator', sub: 'count · decay · filter', kind: 'compute', wide: [660, 440], tall: [350, 420], tip: 'Batch job: normalise, count with time decay, drop rare queries, and apply policy filters.' },
      { id: 'build', label: 'Trie builder', sub: 'top-k per node', kind: 'compute', wide: [850, 440], tall: [210, 420], tip: 'Builds the trie, computes top-k bottom-up, and serialises a compact snapshot per shard.' },
      { id: 'snap', label: 'Snapshot store', sub: 'versioned · S3', kind: 'store', wide: [850, 220], tall: [70, 420], tip: 'Each build is a new immutable version. Shards hot-swap to it and can roll back instantly.' }
    ],
    edges: [
      { from: 'cli', to: 'cdn', bidi: true },
      { from: 'cdn', to: 'sug' },
      { from: 'sug', to: 'pers' },
      { from: 'sug', to: 'shA' },
      { from: 'sug', to: 'shB' },
      { from: 'sug', to: 'trend' },
      { from: 'sug', to: 'logs', dashed: true },
      { from: 'logs', to: 'trend' },
      { from: 'logs', to: 'agg' },
      { from: 'agg', to: 'build' },
      { from: 'build', to: 'snap' },
      { from: 'snap', to: 'shA' },
      { from: 'snap', to: 'shB' }
    ]
  },

  scenarios: [
    {
      id: 'keystroke', title: 'Typing "sys"', tone: 'ok',
      steps: [
        { text: 'The user types <b>s-y-s</b>. The client <b>debounces</b> (waits ~100 ms for a pause) and cancels in-flight requests for older prefixes.', nodes: ['cli'], badges: { cli: '"sys"' } },
        { text: 'Popular short prefixes are almost always in the <b>edge cache</b>. A hit returns in a few ms, close to the user.', flow: ['cli>cdn'], badges: { cdn: ['hit', 'ok'] } },
        { text: 'On a miss the suggest service routes "sys" to the shard that owns it and walks <b>3 nodes</b>: s → y → s.', flow: ['cdn>sug', 'sug>shB'], badges: { shB: '3 hops' } },
        { text: 'That node already holds the <b>top-10 completions</b>. No subtree scan and no sorting happen at request time.', nodes: ['shB'], ok: ['shB'], badges: { shB: ['top-10 ready', 'ok'] } },
        { text: 'Trending and personal candidates are merged, the denylist applied, and the response is cached at the edge.', flow: [['sug>trend', 'sug>pers'], 'sug>cdn', 'cdn>cli'], tone: 'ok' }
      ]
    },
    {
      id: 'rebuild', title: 'Offline rebuild + hot swap', tone: 'info',
      steps: [
        { text: 'Every search is logged to Kafka, off the request path.', flow: ['sug>logs'], badges: { logs: 'billions/day' } },
        { text: 'The aggregator normalises queries, counts them with <b>time decay</b>, drops rare ones (privacy and noise) and applies policy filters.', flow: ['logs>agg'], badges: { agg: 'decayed counts' } },
        { text: 'The builder creates the trie, computes the <b>top-k bottom-up</b> (a node\'s list is the best of its children\'s lists plus itself) and writes a versioned snapshot.', flow: ['agg>build', 'build>snap'], badges: { snap: 'v1042' } },
        { text: 'Each shard downloads the snapshot, loads it next to the live one, then <b>swaps a pointer</b> atomically. The previous version stays for rollback.', flow: [['snap>shA', 'snap>shB']], ok: ['shA', 'shB'], badges: { shA: 'v1042', shB: 'v1042' }, tone: 'ok' }
      ]
    },
    {
      id: 'trending', title: 'Hot spot: breaking news', tone: 'warn',
      steps: [
        { text: 'An earthquake hits. Millions start typing "ea…". The latest snapshot was built before this happened, so it does not know the new query.', flow: ['cli>cdn', 'cdn>sug', 'sug>shA'], warn: ['shA'], badges: { shA: ['stale', 'warn'] }, tone: 'warn' },
        { text: 'The <b>trending layer</b> counts queries in short sliding windows and flags "earthquake today" as far above its baseline.', flow: ['sug>logs', 'logs>trend'], badges: { trend: ['burst ×80', 'warn'] } },
        { text: 'The suggest service merges trending matches for the prefix and boosts them above the static top-k.', flow: ['sug>trend'], ok: ['trend'], badges: { sug: 'merged' } },
        { text: 'The hot prefix "ea" is served almost entirely from the edge. A short TTL keeps it fresh while the CDN absorbs the spike.', flow: ['cli>cdn'], ok: ['cdn'], badges: { cdn: ['TTL 60 s', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'shard', title: 'Scale: sharding the trie', tone: 'warn',
      steps: [
        { text: 'One trie no longer fits the RAM or QPS of one machine. Split it by <b>prefix range</b>.', nodes: ['shA', 'shB'], warn: ['shA'] },
        { text: 'Alphabetical ranges are very uneven: "s", "c" and "p" carry far more traffic than "x" or "q". Split by <b>measured traffic</b> and replicate the hot ranges.', nodes: ['shA', 'shB'], badges: { shA: 'a–f + 3 replicas', shB: 'g–z' } },
        { text: 'The router maps prefix → shard with a small range table that ships with each snapshot.', flow: ['sug>shA', 'sug>shB'] },
        { text: '1- and 2-character prefixes are few and very hot. Precompute them all and serve them from the edge.', flow: ['cli>cdn'], ok: ['cdn'], tone: 'ok' }
      ]
    },
    {
      id: 'shard-down', title: 'Trie shard crashes', tone: 'err',
      steps: [
        { text: 'A replica of shard a–m crashes.', nodes: ['shA'], err: ['shA'], badges: { shA: ['down', 'err'] }, tone: 'err' },
        { text: 'The suggest service retries a <b>different replica</b> under a tight timeout (tens of ms). Users notice nothing.', flow: ['sug>shA'], warn: ['shA'], badges: { shA: ['replica 2', 'warn'] }, tone: 'warn' },
        { text: 'If no replica answers in time, <b>degrade</b>: return trending and personal suggestions only, or an empty list. Search itself still works.', flow: [['sug>trend', 'sug>pers']], badges: { sug: 'partial' } },
        { text: 'A replacement node loads the current snapshot from the store in minutes. There is no state to recover.', flow: ['snap>shA'], ok: ['shA'], badges: { shA: ['loaded', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control trades latency, freshness or cost. Traffic: 100M users × 5 searches/day, about 8 keystrokes per search. Numbers are illustrative.',
    controls: [
      { id: 'topk', label: 'Completions at each node', type: 'seg', value: 'cached', options: [
        { v: 'cached', l: 'Top-k precomputed' }, { v: 'scan', l: 'Scan subtree per request' }] },
      { id: 'rebuild', label: 'Index freshness', type: 'seg', value: 'daily', options: [
        { v: 'weekly', l: 'Weekly rebuild' }, { v: 'daily', l: 'Daily + trending layer' }, { v: 'stream', l: 'Streaming updates' }] },
      { id: 'fuzzy', label: 'Typo tolerance', type: 'seg', value: 'off', options: [
        { v: 'off', l: 'Exact prefix' }, { v: 'on', l: 'Fuzzy (edit distance 1)' }] },
      { id: 'pers', label: 'Personalization', type: 'seg', value: 'off', options: [
        { v: 'off', l: 'Global only' }, { v: 'on', l: '+ recent searches' }] },
      { id: 'deb', label: 'Client debounce', type: 'range', min: 0, max: 500, step: 25, value: 150, fmt: (v) => v + ' ms' }
    ],
    evaluate(s) {
      const KEYS = 8, SEARCHES = 100e6 * 5;
      const reqPerSearch = Math.max(1, KEYS * Math.exp(-s.deb / 200)); // fewer requests as the pause gets longer
      const qps = SEARCHES * reqPerSearch / 86400;
      let lookup = s.topk === 'cached' ? 1 : 60;              // ms server time
      if (s.fuzzy === 'on') lookup += s.topk === 'cached' ? 6 : 40;
      if (s.pers === 'on') lookup += 2;
      if (s.rebuild === 'stream') lookup += 1;
      const hit = (s.fuzzy === 'on' ? 0.5 : 0.65);           // share of requests served by the edge (estimate)
      const perceived = s.deb + 30 + (1 - hit) * (lookup + 20);
      const fresh = { weekly: 7 * 86400, daily: 300, stream: 60 }[s.rebuild];
      const ram = s.topk === 'cached' ? 36 : 24;              // GB per replica, illustrative
      const metrics = [
        { k: 'Suggest QPS', v: SD.fmt.num(qps) + '/s', s: qps < 3e4 ? 0.85 : qps < 4e4 ? 0.6 : 0.35, hint: reqPerSearch.toFixed(1) + ' req/search' },
        { k: 'Server lookup p99', v: '≈ ' + lookup + ' ms', s: lookup <= 5 ? 0.95 : lookup <= 15 ? 0.7 : lookup <= 50 ? 0.4 : 0.1 },
        { k: 'Perceived delay', v: '≈ ' + Math.round(perceived) + ' ms', s: perceived < 200 ? 0.85 : perceived < 320 ? 0.55 : 0.25, hint: 'debounce + network' },
        { k: 'Trending freshness', v: SD.fmt.dur(fresh * 1000), s: fresh <= 120 ? 0.95 : fresh <= 600 ? 0.8 : 0.15 },
        { k: 'Edge cache hit', v: Math.round(hit * 100) + '%', s: hit, hint: s.fuzzy === 'on' ? 'typos are unique' : 'estimate' },
        { k: 'RAM per replica', v: '≈ ' + ram + ' GB', s: ram <= 24 ? 0.8 : 0.6 },
        { k: 'Pipeline complexity', v: { weekly: 'one batch job', daily: 'batch + stream counts', stream: 'mutable index + stream' }[s.rebuild], s: { weekly: 0.9, daily: 0.7, stream: 0.35 }[s.rebuild] }
      ];
      const notes = [];
      if (s.topk === 'scan') notes.push('A one-letter prefix like "s" covers millions of queries. Collecting and sorting them on every keystroke blows the latency budget.');
      if (s.topk === 'cached') notes.push('Top-k per node turns every lookup into a walk of the prefix. You pay for it in RAM, about k ids per node.');
      if (s.deb === 0) notes.push('No debounce: one request per keystroke. Fast typists send requests whose answers are already outdated.');
      if (s.deb > 300) notes.push('Long debounce saves QPS, but suggestions appear only after the user stops typing, which feels laggy.');
      if (s.fuzzy === 'on') notes.push('Edit distance 1 on a prefix of length L means about 54·L variants for a 26-letter alphabet. Typically enabled only after 3–4 characters and when the exact match has few results.');
      if (s.pers === 'on') notes.push('Personal results are fetched separately and merged, so the shared global response stays cacheable at the edge.');
      if (s.rebuild === 'weekly') notes.push('A weekly index misses news and new products for days.');
      if (s.rebuild === 'stream') notes.push('A mutable index needs locking or copy-on-write, and is harder to filter for abuse before it is shown.');
      let verdict;
      if (s.topk === 'scan') verdict = '❌ <b>Per-request subtree scans do not meet the latency budget.</b> Precompute the top-k at each node.';
      else if (s.rebuild === 'weekly') verdict = '⚠ <b>Fast but stale.</b> Add a trending layer for queries that spike within minutes.';
      else if (s.deb === 0 || s.deb > 300) verdict = '⚠ <b>Tune the debounce.</b> Roughly 100–200 ms balances load against responsiveness.';
      else if (s.rebuild === 'stream') verdict = '👍 <b>Freshest option</b>, but daily snapshots plus a trending layer give almost the same freshness with a simpler, immutable index.';
      else verdict = '✅ <b>Standard design:</b> immutable trie snapshots with top-k per node, a real-time trending layer, edge caching and client debounce.';
      const flow = ['cli>cdn', 'cdn>sug', 'sug>shB'].concat(s.pers === 'on' ? [['sug>trend', 'sug>pers']] : ['sug>trend']).concat(s.rebuild === 'weekly' ? [] : ['logs>trend']);
      return {
        metrics, verdict, notes, flow,
        hide: s.pers === 'on' ? [] : ['pers'],
        labels: {
          shB: { label: 'Trie shard n–z', sub: s.topk === 'cached' ? 'top-k at each node' : 'DFS + sort per query' },
          shA: { label: 'Trie shard a–m', sub: s.topk === 'cached' ? 'top-k at each node' : 'DFS + sort per query' },
          build: { label: s.rebuild === 'stream' ? 'Index updater' : 'Trie builder', sub: { weekly: 'weekly batch', daily: 'nightly batch', stream: 'continuous' }[s.rebuild] },
          trend: { label: 'Trending layer', sub: s.rebuild === 'weekly' ? 'not used' : 'minutes-fresh' },
          sug: { label: 'Suggest service', sub: s.fuzzy === 'on' ? 'fuzzy · edit dist 1' : 'route · merge · filter' }
        },
        hot: s.pers === 'on' ? ['pers'] : [],
        warn: (s.topk === 'scan' ? ['shA', 'shB'] : []).concat(s.rebuild === 'weekly' ? ['trend'] : []),
        badges: { cdn: [Math.round(hit * 100) + '% hit', 'info'], shB: ['≈ ' + lookup + ' ms', s.topk === 'scan' ? 'err' : 'ok'] }
      };
    }
  },

  widget: {
    title: 'Trie with top-5 at every node',
    caption: 'Type a prefix. The highlighted path is the O(L) walk; the list is read straight from the last node. Turn off <b>top-k cache</b> to see how many nodes a scan would touch. <b>Tap a suggestion</b> to search it 3,000 more times and watch the top-k lists along its path update.'
  },

  realWorld: {
    intro: 'Published typeahead systems split the work in the same way: precomputed structures for speed, plus a client layer and policy filtering.',
    timeline: [
      { when: '2012', who: 'LinkedIn', title: 'Cleo open-sourced', text: 'LinkedIn\'s typeahead library supports <b>partial, out-of-order and real-time</b> matching. "Generic" typeahead ranks globally (e.g. by popularity); "network" typeahead ranks by your connections. New members, companies and groups become searchable at once. With <b>150M members</b>, network typeahead answered in about <b>20 ms on average</b>.', src: 0 },
      { when: '2013', who: 'Twitter', title: 'typeahead.js', text: 'Twitter open-sourced its client-side autocomplete library. It can use <b>local, prefetched and remote</b> data sources, which is the client layer of the design: preload hot data, cache, and call the server only when needed.', src: 1 },
      { when: '2014', who: 'Pinterest', title: 'User typeahead rebuilt', text: 'Pinterest rebuilt its user typeahead with a <b>separate backend service</b> holding the data it needs, instead of querying general-purpose stores on each keystroke.', src: 2 },
      { when: '2020s', who: 'Google', title: 'Predictions and policies', text: 'Google describes autocomplete predictions as based on <b>common and trending queries</b>. Automated systems block predictions that break its policies, and enforcement teams remove those that slip through. The policies apply to predictions only, not to search results.', src: 3 }
    ],
    lessons: [
      'Precompute rankings offline; a request should only <b>walk and read</b>.',
      'Add a <b>small real-time layer</b> instead of making the big index mutable.',
      'The <b>client</b> is part of the system: debounce, cancel, prefetch, cache.',
      'Filtering is a product requirement: build-time filters plus a <b>serve-time denylist</b> for instant removal.'
    ],
    sources: [
      { title: 'Cleo: the open source technology behind LinkedIn\'s typeahead search', url: 'https://engineering.linkedin.com/open-source/cleo-open-source-technology-behind-linkedins-typeahead-search', pub: 'LinkedIn Engineering, 2012' },
      { title: 'Twitter typeahead.js: You Autocomplete Me', url: 'https://blog.twitter.com/2013/twitter-typeaheadjs-you-autocomplete-me', pub: 'Twitter Blog, 2013' },
      { title: 'Rebuilding the user typeahead', url: 'https://medium.com/pinterest-engineering/rebuilding-the-user-typeahead-9c5bf9723173', pub: 'Pinterest Engineering, 2014' },
      { title: 'How Google autocomplete predictions work', url: 'https://blog.google/products-and-platforms/products/search/how-google-autocomplete-predictions-work/', pub: 'Google' },
      { title: 'How Google autocomplete predictions work (policies)', url: 'https://support.google.com/websearch/answer/7368877', pub: 'Google Search Help' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Index', '<b>In-memory trie + top-k</b>: fastest, custom code', '<b>Search engine</b> (edge n-grams or a completion suggester): less code', 'Search engine for moderate QPS; dedicated trie at very large scale'],
      ['Freshness', '<b>Immutable snapshots</b>: simple, easy rollback', '<b>Mutable index</b>: instant updates', 'Snapshots + a separate trending layer'],
      ['Matching', '<b>Exact prefix</b>: cheap, cacheable', '<b>Fuzzy / infix</b>: forgiving, costly', 'Fuzzy only after a few characters or when exact results are few'],
      ['Personalization', '<b>Global only</b>: one cacheable response', '<b>Personal merge</b>: more relevant', 'Fetch personal results separately and merge on the client'],
      ['Sharding', '<b>By prefix range</b>: one shard per lookup', '<b>Replicate full index</b>: simplest routing', 'Replicate while it fits in RAM; shard by traffic-balanced ranges after']
    ]
  },
  failures: [
    { f: 'Offensive or harmful suggestion appears', detect: 'User reports, classifiers, policy review', fix: 'Serve-time denylist (minutes), then fix the build-time filter.' },
    { f: 'Trending event missing from suggestions', detect: 'Burst detector vs index version', fix: 'Real-time trending layer merged at query time.' },
    { f: 'Shard replica down', detect: 'Health checks, timeouts', fix: 'Retry another replica with a tight timeout; degrade to partial or empty suggestions.' },
    { f: 'Bad snapshot deployed', detect: 'Canary metrics (CTR, empty-result rate)', fix: 'Atomic swap back to the previous version.' },
    { f: 'QPS spike from a client bug (no debounce)', detect: 'Requests per search per client version', fix: 'Server-side rate limit per client; ship a fix; rely on edge caching.' },
    { f: 'Private data leaks into suggestions', detect: 'Audits of rare queries', fix: 'Minimum-count threshold across many users before a query can be suggested.' }
  ],

  interview: [
    { q: 'Why not use the database: WHERE query LIKE \'sys%\'?', a: '<p>A B-tree can find the prefix range, but you then need the <b>10 most popular</b> rows in it. For a short prefix that range has millions of rows, and you must read and sort them all on every keystroke.</p><p>A trie with the top-k stored at each node returns the answer after walking only the prefix: O(L), with no sort.</p>', fu: 'When is Postgres fine? (Small catalogs, such as a product list with thousands of items.)', lvl: 'core' },
    { q: 'What does storing the top-k at every node cost?', a: '<p>About <b>nodes × k</b> entries. Store 4-byte query ids, not strings, and keep only queries above a minimum count. You can also store top-k only down to a certain depth: deep nodes have small subtrees that are cheap to scan.</p>', lvl: 'core' },
    { q: 'How do you compute the top-k for every node efficiently?', a: '<p>Bottom-up at build time: a node\'s top-k is the best k among its own query (if it ends there) and its children\'s top-k lists. One post-order pass over the trie, merging small sorted lists.</p>', lvl: 'deep' },
    { q: 'How do you shard the trie?', a: '<p>By <b>prefix range</b>, so a lookup touches one shard. Choose ranges by <b>measured traffic</b>, not alphabet, because traffic is very skewed. Replicate hot ranges. Very short prefixes are few and hot: precompute them and serve them from the CDN.</p>', lvl: 'deep' },
    { q: 'How do you rank suggestions?', a: '<ul><li>Base score: query frequency with <b>time decay</b> (recent searches count more).</li><li>Click-through rate of the suggestion.</li><li>Locale and language.</li><li>Optional personal signals, such as your recent searches or (as in LinkedIn\'s network typeahead) your connections.</li></ul>', lvl: 'core' },
    { q: 'How do you filter offensive suggestions?', a: '<p>In two places. At <b>build time</b>: blocklists and classifiers drop bad queries before they enter the trie. At <b>serve time</b>: a small denylist checked on every response, so a reported suggestion disappears in minutes without a rebuild. A minimum-count threshold also stops one person from planting a suggestion.</p>', lvl: 'core' },
    { q: 'What does the client do?', a: '<p><b>Debounce</b> (wait ~100–200 ms of inactivity), <b>cancel</b> stale in-flight requests, cache responses per prefix, and filter a cached "sy" list locally while "sys" is fetched. Twitter\'s typeahead.js also prefetches a hot set to answer locally.</p>', lvl: 'core' },
    { q: 'How do trending queries appear within minutes if you rebuild daily?', a: '<p>Run a <b>trending layer</b>: sliding-window counts from the query stream, compared with a baseline. At query time, merge trending matches for the prefix into the static top-k. The big index stays immutable.</p>', lvl: 'core' },
    { q: 'How would you support typos?', a: '<p>Search the trie allowing <b>edit distance 1</b> (insert, delete, substitute, transpose) with a Levenshtein automaton or a precomputed deletion index (SymSpell-style). It multiplies the work and lowers cache hit rates, so enable it only after a few characters or when exact matches are scarce.</p>', lvl: 'deep' },
    { q: 'Where does caching help most?', a: '<p>Typeahead traffic is skewed toward short prefixes, and the global response is the same for everyone with the same locale. Cache <code>prefix + locale → JSON</code> at the <b>CDN</b> with a TTL of minutes. Keep personal results in a separate, private request.</p>', lvl: 'core' },
    { q: 'How do you deploy a new index safely?', a: '<p>Build an immutable, versioned snapshot. Load it on a canary, compare CTR and empty-result rate, then roll out. Each server loads the new version in the background and <b>atomically swaps a reference</b>; keep the old one for instant rollback.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Java: trie with top-k per node', lang: 'java',
      code: `public final class Autocomplete {
  public record Entry(String query, long score) {}
  private static final int K = 10;
  private static final class Node {
    final Map<Character, Node> kids = new HashMap<>();
    final List<Entry> top = new ArrayList<>();   // best K under this prefix
  }
  private final Node root = new Node();

  /** Build time only. Feed each (query, score) once. */
  public void add(String query, long score) {
    String q = query.toLowerCase(Locale.ROOT);
    Node n = root;
    offer(n, q, score);
    for (char c : q.toCharArray()) {
      n = n.kids.computeIfAbsent(c, k -> new Node());
      offer(n, q, score);
    }
  }

  private static void offer(Node n, String q, long s) {
    if (n.top.size() == K && n.top.get(K - 1).score() >= s) return;
    n.top.add(new Entry(q, s));
    n.top.sort(Comparator.comparingLong(Entry::score).reversed());
    if (n.top.size() > K) n.top.remove(K);
  }

  /** O(prefix length): walk, then read the precomputed list. */
  public List<Entry> suggest(String prefix) {
    Node n = root;
    for (char c : prefix.toLowerCase(Locale.ROOT).toCharArray()) {
      n = n.kids.get(c);
      if (n == null) return List.of();
    }
    return List.copyOf(n.top);
  }
}

// Serving: build a new Autocomplete per snapshot, then swap atomically.
// private final AtomicReference<Autocomplete> live = new AtomicReference<>(initial);
// live.set(next);   // readers call live.get().suggest(q)`,
      note: 'The structure is built once and never mutated while serving, so readers need no locks; the <code>AtomicReference</code> swap publishes the new version safely.'
    },
    {
      title: 'Postgres: prefix + typo-tolerant lookup', lang: 'sql',
      code: `CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE query_stats (
  query text PRIMARY KEY,
  score double precision NOT NULL
);
-- B-tree that supports LIKE 'prefix%' in any collation
CREATE INDEX query_prefix ON query_stats (query text_pattern_ops);
-- trigram index for fuzzy matching
CREATE INDEX query_trgm ON query_stats USING gin (query gin_trgm_ops);

-- exact prefix (escape % and _ in user input first)
SELECT query FROM query_stats
WHERE query LIKE 'sys%'
ORDER BY score DESC
LIMIT 10;

-- typo tolerant: "sytem desing"
SELECT query, similarity(query, 'sytem desing') AS sim
FROM query_stats
WHERE query % 'sytem desing'          -- similarity above pg_trgm.similarity_threshold
ORDER BY sim DESC, score DESC
LIMIT 10;`,
      note: 'Fine for thousands to a few million rows. For short prefixes the first query still reads and sorts every match, which is the problem the trie solves.'
    },
    {
      title: 'Python: decayed counts from query logs', lang: 'python',
      code: `import re
from collections import Counter
from datetime import datetime, timezone

HALF_LIFE_DAYS = 7
DENY = {"slur1", "slur2"}             # maintained by a policy team

def normalize(q: str) -> str:
    return re.sub(r"\\s+", " ", q.strip().lower())

def score_queries(rows, now=None, min_users=20):
    """rows: iterable of (query, user_id, ts). Returns {query: score}."""
    now = now or datetime.now(timezone.utc)
    score, users = Counter(), {}
    for q, user_id, ts in rows:
        q = normalize(q)
        if not q or DENY.intersection(q.split()):
            continue
        age_days = (now - ts).total_seconds() / 86400
        score[q] += 0.5 ** (age_days / HALF_LIFE_DAYS)     # exponential decay
        users.setdefault(q, set()).add(user_id)
    # only suggest queries typed by many distinct users (privacy, anti-spam)
    return {q: s for q, s in score.items() if len(users[q]) >= min_users}`
    }
  ],

  related: ['search-engine', 'top-k', 'distributed-cache', 'cdn', 'recommendation', 'newsfeed']
});
