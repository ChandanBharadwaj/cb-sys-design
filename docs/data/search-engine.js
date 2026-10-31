SD.register({
  slug: 'search-engine',
  domain: 7,
  title: 'Distributed Search Engine',
  examples: 'Elasticsearch, Lucene',
  tagline: 'Full-text search over billions of documents with <b>relevance ranking in milliseconds</b>, and new documents become searchable in about <b>a second</b>.',
  tldr: {
    problem: 'A <code>LIKE \'%term%\'</code> scan cannot search billions of documents, rank them by relevance, or keep up with a stream of new writes.',
    idea: 'Build an <b>inverted index</b> (term → list of docs) in <b>immutable segments</b>, split the corpus into <b>shards</b> with replicas, and answer each query by <b>scatter-gather</b>: every shard returns its top-k, and a coordinator merges them.',
    insight: 'Immutable segments make indexing cheap and caching safe. <b>Refresh</b> opens a new small segment (searchable, not yet durable). The <b>translog</b> gives durability, and background <b>merges</b> keep the segment count down.',
    numbers: [
      { v: '1 s', l: 'default refresh: write → searchable (Elasticsearch guide)' },
      { v: '≤ 10 s', l: 'tweet → searchable in Earlybird (Twitter, 2012)' },
      { v: '1.2 · 0.75', l: 'BM25 k1 · b defaults in Elasticsearch' }
    ]
  },

  intro: {
    what: 'A search engine finds the documents that contain some words and <b>ranks them by relevance</b>, best match first. It powers the search box in shops, wikis, help centres and log tools. Engines such as Elasticsearch do this over billions of documents in milliseconds.',
    analogy: {
      icon: '📖',
      title: 'The index at the back of a textbook',
      text: 'To find "photosynthesis" in a textbook, you do not read all 600 pages. You look it up in the index at the back, which lists the pages where the word appears. A search engine builds that kind of index for every word in every document, then scores the matches so the most useful come first. Unlike a printed index, it has to take in new documents and make them findable within seconds.'
    },
    problem: 'An online shop has millions of products. A customer types "wireless headphones". Reading every product description to look for those words takes far too long, and you still get thousands of matches in no useful order. Meanwhile new products keep arriving and must show up quickly. The question is: <b>how do you find and rank the best matches among billions of documents in milliseconds?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Scan the table with LIKE',
        text: 'Keep the products in a database and run <code>WHERE description LIKE \'%headphones%\'</code>. The database reads every row and checks its text. On a few thousand rows this feels instant.',
        scene: {
          nodes: [
            { id: 'user', label: 'Shopper', sub: 'types a query', kind: 'client', at: [70, 0] },
            { id: 'coord', label: 'Shop app', sub: 'builds the SQL', kind: 'service', at: [210, 0] },
            { id: 'db', label: 'Products DB', sub: 'one big table', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'user', to: 'coord', bidi: true }, { from: 'coord', to: 'db', bidi: true }],
          flow: ['user>coord', 'coord>db', 'db>coord', 'coord>user']
        }
      },
      {
        stage: 'breaks',
        title: 'Every query reads every row, and nothing is ranked',
        text: 'With millions of rows, each search <b>reads the whole table</b>, so queries take seconds and the database falls over at peak time. Matches come back unordered: a product that mentions headphones once in small print ranks the same as one titled "Wireless Headphones".',
        scene: {
          nodes: [
            { id: 'user', label: 'Shoppers', sub: 'thousands/s', kind: 'client', at: [70, 0] },
            { id: 'coord', label: 'Shop app', sub: 'waiting…', kind: 'service', at: [210, 0] },
            { id: 'db', label: 'Products DB', sub: 'millions of rows', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'user', to: 'coord', bidi: true }, { from: 'coord', to: 'db', bidi: true }],
          flow: ['user>coord', ['coord>db', 'coord>db'], 'db>coord'],
          err: ['db'],
          warn: ['user'],
          badges: { db: ['full scan', 'err'], user: ['slow ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'An inverted index, split into shards',
        text: 'Build an <b>inverted index</b>: for each word, the list of documents that contain it. A query reads only the lists for its own words, then <b>scores</b> each match (rare words and short fields count more). The index is split into <b>shards</b> on several machines. A coordinator asks every shard for its top 10 and merges them.',
        scene: {
          nodes: [
            { id: 'user', label: 'Shopper', sub: 'types a query', kind: 'client', at: [70, 0] },
            { id: 'coord', label: 'Coordinator', sub: 'scatter + merge', kind: 'edge', at: [210, 0] },
            { id: 's0', label: 'Shard 0', sub: 'index, part 1', kind: 'service', at: [70, 110] },
            { id: 's1', label: 'Shard 1', sub: 'index, part 2', kind: 'service', at: [210, 110] },
            { id: 's2', label: 'Shard 2', sub: 'index, part 3', kind: 'service', at: [350, 110] }
          ],
          edges: [{ from: 'user', to: 'coord', bidi: true }, { from: 'coord', to: 's0', bidi: true }, { from: 'coord', to: 's1', bidi: true }, { from: 'coord', to: 's2', bidi: true }],
          flow: ['user>coord', ['coord>s0', 'coord>s1', 'coord>s2'], ['s0>coord', 's1>coord', 's2>coord'], 'coord>user'],
          ok: ['s0', 's1', 's2'],
          badges: { coord: ['top 10 merged', 'ok'] }
        }
      }
    ],
    usedBy: ['Elasticsearch', 'OpenSearch', 'Apache Solr', 'Apache Lucene', 'Wikipedia search', 'Twitter Earlybird'],
    whenToUse: [
      'Users type <b>free text</b> and expect the best matches first',
      'You need typo tolerance, word stemming ("running" finds "run"), synonyms or filter counts (facets)',
      'The data is too big or too busy for your database\'s built-in text search'
    ],
    whenNot: [
      'Exact lookups by id or simple filters: an ordinary database index is enough',
      'A few million rows and simple ranking: Postgres full-text search will do',
      'You search by meaning rather than by words (see <a href="vector-db.html">Vector DB</a>), or by prefix as the user types (see <a href="typeahead.html">Typeahead</a>)'
    ],
    glossary: [
      { term: 'Inverted index', def: 'A map from each word to the list of documents that contain it.' },
      { term: 'Postings list', def: 'The sorted list of document ids (plus counts and positions) stored for one word.' },
      { term: 'Analyzer', def: 'The step that turns text into searchable terms: split into words, lowercase them, strip endings.' },
      { term: 'BM25', def: 'The standard relevance formula. Rare words count more, each repeat of a word counts a little less, and matches in short fields weigh more.' },
      { term: 'Shard', def: 'One slice of the index, living on one machine. Together the shards hold every document.' },
      { term: 'Replica', def: 'A copy of a shard on another machine, used for failover and to share the read load.' },
      { term: 'Segment', def: 'An immutable mini-index file. New documents go into new segments, which are merged in the background.' },
      { term: 'Refresh', def: 'Opening newly written segments for search. It is what makes a new document visible, by default about once a second.' }
    ]
  },

  requirements: {
    functional: [
      'Index, update and delete JSON documents',
      'Full-text query with relevance ranking (BM25)',
      'Filters, sorting and aggregations (facets)',
      'Pagination, including deep "load more"',
      'Analyzers: tokenise, lowercase, stem, synonyms',
      'Highlight matching snippets'
    ],
    nonFunctional: [
      'p99 query latency ≲ 100–200 ms',
      'New docs searchable within ~1 s (near-real-time)',
      'Acked writes survive a node crash',
      'Scale reads with replicas, data with shards',
      'Survive the loss of a node with no data loss',
      'Indexing throughput of 10⁴–10⁵ docs/s'
    ],
    outOfScope: ['Web crawling (see Web Crawler)', 'Vector / semantic search (see Vector DB)', 'Learning-to-rank model training']
  },

  calculator: {
    inputs: [
      { id: 'docs', label: 'Documents', min: 1000000, max: 100000000000, value: 1000000000, log: true },
      { id: 'size', label: 'Avg document size (source)', min: 200, max: 20000, value: 2000, fmt: 'bytes', log: true },
      { id: 'ratio', label: 'Index size ÷ source size (estimate)', min: 0.3, max: 2, step: 0.1, value: 1.1, unit: '×' },
      { id: 'qps', label: 'Peak queries per second', min: 10, max: 100000, value: 3000, log: true },
      { id: 'rep', label: 'Replicas per shard', min: 0, max: 3, value: 1 },
      { id: 'shardGB', label: 'Target shard size', min: 10, max: 60, value: 40, unit: 'GB' }
    ],
    outputs: [
      { label: 'Primary index size', fmt: 'bytes', f: (v) => v.docs * v.size * v.ratio },
      { label: 'Disk incl. replicas', fmt: 'bytes', f: (v) => v.docs * v.size * v.ratio * (1 + v.rep) },
      { label: 'Primary shards', f: (v) => Math.max(1, Math.ceil(v.docs * v.size * v.ratio / (v.shardGB * 1e9))) },
      { label: 'Shard copies to place', f: (v) => Math.max(1, Math.ceil(v.docs * v.size * v.ratio / (v.shardGB * 1e9))) * (1 + v.rep) },
      { label: 'Shard-level searches/s (fan-out)', unit: '/s', f: (v) => v.qps * Math.max(1, Math.ceil(v.docs * v.size * v.ratio / (v.shardGB * 1e9))) },
      { label: 'Per copy of each shard', unit: 'q/s', f: (v) => v.qps / (1 + v.rep) }
    ],
    note: 'Every query visits <b>one copy of every shard</b>, so more shards means more fan-out per query, while more replicas means more copies to share the load. The index/source ratio depends on mappings (stored source, doc values, n-grams) and is an <em>estimate</em>. Shard sizes of tens of GB are a common rule of thumb.'
  },

  api: [
    { m: 'PUT', p: '/{index}/_doc/{id}', d: 'Index or replace a document. It is routed to shard <code>hash(_routing or _id) % primaries</code>. <code>?refresh=wait_for</code> blocks until it is searchable.' },
    { m: 'POST', p: '/_bulk', d: 'Batch many index, update and delete actions. This is the way to reach high indexing throughput.' },
    { m: 'POST', p: '/{index}/_search', d: '<code>{query: {bool: {must: match, filter: term}}, size, sort, search_after}</code>. Query-then-fetch across all shards.' },
    { m: 'POST', p: '/{index}/_refresh', d: 'Force a refresh: open new segments for search. Normally automatic every <code>refresh_interval</code> (default 1 s).' },
    { m: 'POST', p: '/{index}/_forcemerge?max_num_segments=1', d: 'Merge read-only indices down to one segment. Never run it on an index that is still being written.' }
  ],
  dataModel: [
    { name: 'inverted index (per segment)', store: 'Lucene segment files', fields: [['term dictionary', 'FST: term → offsets', 'pk'], ['postings', 'docIDs (delta + bit-packed)'], ['freqs / positions', 'for scoring and phrases'], ['norms', 'field length for BM25'], ['live docs', 'bitset of deletions']], note: 'Write-once. Deletes only flip a bit; merges physically drop them.' },
    { name: 'doc values / stored fields', store: 'columnar + row-wise', fields: [['doc values', 'per-field column', 'idx'], ['_source', 'original JSON (compressed)']], note: 'Doc values power sorting and aggregations. _source is fetched only for the final top hits.' },
    { name: 'translog (per shard)', store: 'append-only file', fields: [['seq_no', 'long', 'pk'], ['op', 'index | delete'], ['primary_term', 'long']], note: 'fsynced per request by default, so acked writes survive a crash. It is replayed on restart, then trimmed after a flush commit.' }
  ],

  architecture: {
    title: 'Distributed search architecture',
    nodes: [
      { id: 'app', label: 'Indexer app', sub: 'bulk index docs', kind: 'client', wide: [90, 30], tall: [70, 0], tip: 'Writes documents with the bulk API, often fed from a DB change stream (CDC) or Kafka.' },
      { id: 'cli', label: 'Search users', sub: 'query + filters', kind: 'client', wide: [90, 165], tall: [210, 0], tip: 'Search box, filters and facets. Any node can act as the coordinator.' },
      { id: 'coord', label: 'Coordinator', sub: 'route · scatter/gather', kind: 'edge', wide: [290, 97], tall: [105, 210], tip: 'Routes writes to the primary shard by hash(_id). For searches, sends the query to one copy of every shard, merges the top-k, then fetches the winners.' },
      { id: 'p0', label: 'Shard 0 · primary', sub: 'Lucene index', kind: 'service', wide: [500, -60], tall: [315, 105], tip: 'A full Lucene index holding about half the documents.' },
      { id: 'r0', label: 'Shard 0 · replica', sub: 'copy on another node', kind: 'service', wide: [500, 45], tall: [315, 210], tip: 'Serves reads and becomes primary if shard 0\'s primary is lost.' },
      { id: 'r1', label: 'Shard 1 · replica', sub: 'copy on another node', kind: 'service', wide: [500, 255], tall: [315, 315], tip: 'Receives every operation from its primary. Searches can use either copy.' },
      { id: 'p1', label: 'Shard 1 · primary', sub: 'Lucene index', kind: 'service', wide: [500, 150], tall: [315, 420], tip: 'Writes go here first, then are replicated to r1. Its internals are shown on the right.' },
      { id: 'master', label: 'Master node', sub: 'cluster state · alloc', kind: 'service', wide: [710, -60], tall: [105, 420], tip: 'The elected master keeps the cluster state: which shard copies live where, which are in sync, and who is primary.' },
      { id: 'buf', label: 'Indexing buffer', sub: 'RAM · not searchable', kind: 'cache', wide: [710, 150], tall: [315, 525], tip: 'New documents are analysed into an in-memory segment. They become searchable at the next refresh.' },
      { id: 'tlog', label: 'Translog', sub: 'fsync before ack', kind: 'store', wide: [710, 255], tall: [105, 525], tip: 'A write-ahead log of operations. It makes acked writes durable between Lucene commits.' },
      { id: 'seg', label: 'Segments', sub: 'immutable · searchable', kind: 'store', wide: [910, 150], tall: [315, 630], tip: 'Each refresh writes a small new segment. A search visits every segment of the shard and merges the results.' },
      { id: 'merge', label: 'Merge policy', sub: 'tiered background merges', kind: 'compute', wide: [910, 255], tall: [105, 630], tip: 'Merges many small segments into fewer large ones and drops deleted documents. IO is throttled so it does not starve searches.' }
    ],
    edges: [
      { from: 'app', to: 'coord' },
      { from: 'cli', to: 'coord', bidi: true },
      { from: 'coord', to: 'p0' },
      { from: 'coord', to: 'r0' },
      { from: 'coord', to: 'p1' },
      { from: 'coord', to: 'r1' },
      { from: 'p0', to: 'r0', label: 'replicate' },
      { from: 'p1', to: 'r1' },
      { from: 'master', to: 'r0', dashed: true },
      { from: 'p1', to: 'buf' },
      { from: 'p1', to: 'tlog' },
      { from: 'buf', to: 'seg', label: 'refresh' },
      { from: 'seg', to: 'merge', bidi: true }
    ]
  },

  scenarios: [
    {
      id: 'index', title: 'Index a doc → searchable in ~1 s', tone: 'info',
      steps: [
        { text: 'The app sends <code>PUT /products/_doc/42</code>. The coordinator routes it with <code>hash(42) % 2 = 1</code>, so it goes to <b>shard 1\'s primary</b>.', flow: ['app>coord', 'coord>p1'], badges: { p1: 'shard 1' } },
        { text: 'The primary analyses the text (tokenise, lowercase, stem), adds it to the <b>in-memory buffer</b> and appends the operation to the <b>translog</b>, fsynced before the ack.', flow: [['p1>buf', 'p1>tlog']], badges: { tlog: 'fsync', buf: 'not searchable' } },
        { text: 'The operation is forwarded to the in-sync replica, which does the same. Only then is the client acked, so the write survives losing either node.', flow: ['p1>r1', 'r1>p1', 'p1>coord', 'coord>app'], badges: { r1: 'ack' }, tone: 'ok' },
        { text: '<b>Refresh</b> (every 1 s by default): the buffer becomes a <b>new immutable segment</b>, opened for search but <i>not fsynced</i>. Doc 42 is now visible, which is <b>near-real-time</b>.', flow: ['buf>seg'], ok: ['seg'], badges: { seg: ['+1 segment', 'ok'] }, tone: 'ok' },
        { text: 'Later a <b>flush</b> does a Lucene commit, fsyncing the segments, and trims the translog. If the node crashes before that, the translog is replayed on restart.', nodes: ['seg', 'tlog'], ok: ['tlog'], badges: { tlog: 'trimmed' } }
      ]
    },
    {
      id: 'query', title: 'Search: query-then-fetch', tone: 'ok',
      steps: [
        { text: 'The user searches <i>"wireless headphones"</i>. The receiving node becomes the <b>coordinator</b>.', flow: ['cli>coord'] },
        { text: '<b>Query phase:</b> it sends the query to <b>one copy of every shard</b> (here p0 and r1). Each shard scores its own segments with BM25 and returns only <b>doc ids + scores</b> for its top 10.', flow: [['coord>p0', 'coord>r1']], badges: { p0: 'top-10', r1: 'top-10' } },
        { text: 'The coordinator merges 2 × 10 candidates into the <b>global top 10</b> with a priority queue.', flow: [['p0>coord', 'r1>coord']], badges: { coord: 'merge 20 → 10' } },
        { text: '<b>Fetch phase:</b> only for those 10 winners, it asks the owning shards for <code>_source</code> and highlights, then responds. Heavy documents are never read for losers.', flow: [['coord>p0', 'coord>r1'], 'coord>cli'], tone: 'ok', badges: { cli: '10 hits · 35 ms' } },
        { text: 'Deep page (<code>from = 10000</code>)? Every shard must return 10,010 hits for the merge. Elasticsearch caps this (<code>index.max_result_window</code>) and recommends <code>search_after</code>, which continues from the last sort value.', nodes: ['coord', 'p0', 'r1'], warn: ['coord'], badges: { coord: ['from+size × shards', 'warn'] }, tone: 'warn' }
      ]
    },
    {
      id: 'burst', title: 'Indexing burst: segments pile up', tone: 'warn',
      steps: [
        { text: 'A product-catalogue import sends 50K docs/s. Every second each shard refreshes, producing a <b>new tiny segment</b>.', flow: ['app>coord', 'coord>p1', 'p1>buf', 'buf>seg'], warn: ['seg'], badges: { seg: ['+1 seg / s', 'warn'] }, tone: 'warn' },
        { text: 'A search must visit <b>every segment</b> of every shard, so hundreds of small segments slow queries down and use file handles and memory.', flow: ['cli>coord', 'coord>p1'], warn: ['seg', 'p1'], badges: { p1: ['300 segments', 'warn'] } },
        { text: 'The <b>tiered merge policy</b> merges similar-size segments into bigger ones in the background and drops deleted docs as it goes. Merge IO is throttled.', flow: ['seg>merge', 'merge>seg'], ok: ['merge'], badges: { merge: '10 → 1' }, tone: 'ok' },
        { text: 'Bulk-load tip: set <code>refresh_interval: -1</code> and <code>replicas: 0</code> during the import, then restore them. You get fewer, larger segments and no double indexing.', nodes: ['buf', 'seg', 'r1'], ok: ['seg'], labels: { buf: { sub: 'refresh off' } } }
      ]
    },
    {
      id: 'nodeloss', title: 'Node dies → replica promoted', tone: 'err',
      steps: [
        { text: 'The node holding <b>shard 0\'s primary</b> crashes.', nodes: ['p0'], err: ['p0'], badges: { p0: ['down', 'err'] }, tone: 'err' },
        { text: 'The master\'s fault detection notices. Shard 0 has an <b>in-sync replica</b>, so it is promoted to primary with a new <code>primary_term</code>, which fences out stale writes from the old primary.', flow: ['master>r0'], err: ['p0'], ok: ['r0'], labels: { r0: { label: 'Shard 0 · primary', sub: 'promoted (term +1)' } }, badges: { master: 'yellow' } },
        { text: 'Searches and writes for shard 0 continue on the promoted copy. Clients only see a brief retry.', flow: ['cli>coord', 'coord>r0'], err: ['p0'], ok: ['r0'], labels: { r0: { label: 'Shard 0 · primary', sub: 'serving' } }, tone: 'ok' },
        { text: 'The master allocates a <b>new replica</b> on a healthy node, which copies segments and replays recent operations (peer recovery). The cluster turns green. With 0 replicas this shard would have been <b>lost</b>.', nodes: ['master', 'r0'], err: ['p0'], ok: ['r0', 'master'], labels: { r0: { label: 'Shard 0 · primary', sub: 'recovering replica' } }, badges: { master: ['green', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'idf', title: 'Relevance across shards (DFS)', tone: 'warn',
      steps: [
        { text: 'The term <i>"kafka"</i> is rare overall, but by chance shard 0 holds many matching docs and shard 1 very few.', nodes: ['p0', 'p1'], badges: { p0: 'df = 900', p1: 'df = 3' } },
        { text: 'BM25 uses <b>IDF from each shard\'s local stats</b>. On shard 1 the term looks very rare (high IDF), so its few matches get inflated scores and outrank better docs from shard 0.', flow: [['coord>p0', 'coord>p1']], warn: ['p1'], badges: { p1: ['IDF too high', 'warn'] }, tone: 'warn' },
        { text: '<code>dfs_query_then_fetch</code> first asks every shard for term statistics, computes <b>global IDF</b>, then scores. Rankings are consistent, at the cost of an <b>extra round-trip</b>.', flow: [['coord>p0', 'coord>p1'], ['p0>coord', 'p1>coord'], ['coord>p0', 'coord>p1']], ok: ['coord'], badges: { coord: ['global IDF', 'ok'] }, tone: 'ok' },
        { text: 'In practice, with millions of docs randomly spread per shard, local stats converge, so DFS matters most for <b>small indices or skewed routing</b>.', nodes: ['coord'] }
      ]
    }
  ],

  knobs: {
    intro: 'A 600 GB index on a cluster sized to hold about 4 shard copies per node (numbers are illustrative). Change refresh, sharding, scoring and replicas.',
    diagram: null,
    controls: [
      { id: 'refresh', label: 'Refresh interval', type: 'seg', value: '1s', options: [
        { v: '1s', l: '1 s (default)' }, { v: '30s', l: '30 s' }, { v: 'off', l: '-1 (bulk load)' }] },
      { id: 'shards', label: 'Primary shards', type: 'range', min: 1, max: 48, step: 1, value: 12 },
      { id: 'scoring', label: 'Scoring', type: 'seg', value: 'bm25', options: [
        { v: 'tfidf', l: 'Classic TF-IDF' }, { v: 'bm25', l: 'BM25' }, { v: 'dfs', l: 'BM25 + global IDF (DFS)' }] },
      { id: 'rep', label: 'Replicas per shard', type: 'range', min: 0, max: 3, step: 1, value: 1 }
    ],
    evaluate(s) {
      const DATA = 600;                                   // GB of primary index (illustrative)
      const shardGB = DATA / s.shards;
      const copies = s.shards * (1 + s.rep);
      const nodes = Math.max(3, 1 + s.rep, Math.ceil(copies / 4)); // copies of one shard never share a node
      const perShardMs = 2 + shardGB * 0.15;             // illustrative: cost grows with shard size
      const fanTail = 1 + 0.12 * Math.log2(Math.max(1, s.shards));
      const p99 = Math.round((perShardMs * fanTail + (s.scoring === 'dfs' ? 8 : 0)) * 1.6);
      const qpsCap = Math.min(nodes, copies) * 16 * 1000 / perShardMs / s.shards; // 16 search threads per node; idle nodes add nothing (illustrative)
      const refreshMul = { '1s': 0.75, '30s': 0.92, off: 1 }[s.refresh];
      const idxRel = refreshMul / (1 + s.rep);           // document replication re-indexes on each copy
      const metrics = [
        { k: 'Write → searchable', v: { '1s': '≈ 1 s', '30s': '≈ 30 s', off: 'only on manual refresh' }[s.refresh], s: { '1s': 0.92, '30s': 0.5, off: 0.1 }[s.refresh] },
        { k: 'Indexing throughput (relative)', v: Math.round(idxRel * 100) + '% of max', s: Math.min(1, idxRel * 1.1) },
        { k: 'Shard size', v: shardGB.toFixed(shardGB < 10 ? 1 : 0) + ' GB × ' + s.shards, s: shardGB < 5 ? 0.35 : shardGB <= 50 ? 0.9 : shardGB <= 100 ? 0.5 : 0.2, hint: shardGB < 5 ? 'oversharded' : shardGB > 50 ? 'large' : 'healthy' },
        { k: 'Query p99 (model)', v: '≈ ' + p99 + ' ms', s: p99 <= 60 ? 0.9 : p99 <= 150 ? 0.6 : 0.25 },
        { k: 'Read QPS capacity (model)', v: '≈ ' + SD.fmt.num(qpsCap) + ' q/s on ' + nodes + ' nodes', s: Math.min(1, qpsCap / 1500) },
        { k: 'Survives node loss', v: s.rep === 0 ? 'no: shards are lost' : 'yes, ' + s.rep + ' node' + (s.rep > 1 ? 's' : '') + ' at a time', s: s.rep === 0 ? 0.05 : s.rep === 1 ? 0.75 : 0.95 },
        { k: 'Ranking quality', v: { tfidf: 'TF-IDF: no tf saturation, long docs win', bm25: 'BM25: saturating tf + length norm', dfs: 'BM25 with consistent global IDF' }[s.scoring], s: { tfidf: 0.5, bm25: 0.82, dfs: s.shards > 1 ? 0.92 : 0.82 }[s.scoring] }
      ];
      const notes = [];
      if (s.refresh === '1s') notes.push('A 1 s refresh writes a new small segment every second per shard. That is great for freshness, but it costs indexing throughput and creates merge work.');
      if (s.refresh === 'off') notes.push('Refresh off is ideal for a one-off bulk load. Turn it back on afterwards, otherwise nothing new is ever visible.');
      if (shardGB < 5) notes.push('Many tiny shards: each one has fixed overhead (heap, file handles, cluster-state entries), and every query fans out to all ' + s.shards + ' of them.');
      if (shardGB > 50) notes.push(shardGB.toFixed(0) + ' GB shards are slow to recover or relocate after a node failure, and a single shard query does a lot of work.');
      if (s.scoring === 'dfs') notes.push(s.shards > 1 ? '<code>dfs_query_then_fetch</code> adds a round-trip to gather term stats from every shard before scoring.' : 'With one shard, local IDF already <i>is</i> global IDF, so DFS adds nothing.');
      if (s.scoring === 'tfidf') notes.push('Classic TF-IDF grows without bound with term frequency, so keyword-stuffed or very long docs win. BM25 caps tf with k1 and normalises by length with b.');
      if (s.rep === 0) notes.push('With no replicas, a single disk or node failure loses shards (red cluster), and reads cannot be spread.');
      let verdict;
      if (s.rep === 0) verdict = '❌ <b>No replicas:</b> one node failure loses data. Use 0 replicas only temporarily for a bulk load.';
      else if (s.refresh === 'off') verdict = '⚠ <b>Bulk-load mode:</b> maximum indexing speed, but new docs are invisible until you refresh.';
      else if (shardGB < 5 || shardGB > 100) verdict = '⚠ <b>Shard count is off:</b> aim for shards of tens of GB.';
      else if (s.scoring === 'tfidf') verdict = '⚠ <b>Use BM25.</b> It is the Elasticsearch default for good reasons: saturation and length normalisation.';
      else if (s.refresh === '1s' && s.scoring !== 'tfidf' && s.rep >= 1) verdict = '✅ <b>Standard production setup:</b> 1 s near-real-time refresh, BM25, healthy shard sizes and at least one replica.';
      else verdict = '👍 Reasonable. A longer refresh trades freshness for indexing throughput, which suits logs and analytics.';
      const flow = ['cli>coord', ['coord>p0', s.rep ? 'coord>r1' : 'coord>p1'], 'app>coord', 'coord>p1', 'p1>buf', 'buf>seg'];
      return {
        metrics, verdict, notes, flow,
        hide: s.rep === 0 ? ['r0', 'r1'] : [],
        labels: {
          p0: { sub: shardGB.toFixed(shardGB < 10 ? 1 : 0) + ' GB · 1 of ' + s.shards },
          p1: { sub: shardGB.toFixed(shardGB < 10 ? 1 : 0) + ' GB · 1 of ' + s.shards },
          buf: { sub: { '1s': 'refresh every 1 s', '30s': 'refresh every 30 s', off: 'refresh disabled' }[s.refresh] },
          coord: { sub: s.scoring === 'dfs' ? 'dfs → query → fetch' : 'query → fetch' }
        },
        hot: s.scoring === 'dfs' ? ['coord'] : [],
        warn: (shardGB < 5 || shardGB > 50 ? ['p0', 'p1'] : []).concat(s.refresh === '1s' ? ['merge'] : []),
        err: s.rep === 0 ? ['p0', 'p1'] : [],
        badges: { coord: ['p99 ≈ ' + p99 + ' ms', p99 <= 150 ? 'info' : 'warn'], seg: [s.refresh === '1s' ? '+1 seg/s' : s.refresh === '30s' ? '+1 seg/30 s' : 'paused', 'info'] }
      };
    }
  },

  widget: {
    title: 'Live inverted index + BM25 breakdown',
    caption: 'Add documents: they land in the <b>buffer</b> and are <b>not searchable</b> until you <b>Refresh</b>, which writes a new immutable segment. <b>Merge</b> combines segments. Type a query to see the postings lists and each document\'s real BM25 score, term by term (k1 = 1.2, b = 0.75).'
  },

  realWorld: {
    intro: 'Inverted indexes are decades old. What changed is the move to near-real-time, distributed and replicated indexes.',
    timeline: [
      { when: '1998', who: 'Google (Brin & Page)', title: 'Inverted index in barrels', text: 'The original Google indexer parsed pages into hit lists stored in <b>barrels</b>, and a sorter re-sorted them by word ID to build the <b>inverted index</b>. That is the same term → postings structure every engine still uses.', src: 0 },
      { when: '2015 guide', who: 'Elastic / Lucene', title: 'Near-real-time with immutable segments', text: 'Each shard is a Lucene index of <b>immutable segments</b>. Lucene can write and open a new segment <b>without a full commit</b> (fsync), so Elasticsearch refreshes every shard <b>once per second</b> by default. <code>refresh_interval</code> can be raised, or set to -1 for bulk loads.', src: 1 },
      { when: '2012', who: 'Twitter', title: 'Earlybird real-time search', text: 'Earlybird made tweets searchable <b>within 10 seconds</b>, served <b>over two billion queries a day</b> with about <b>50 ms</b> average latency, and used a <b>single-writer, multi-reader</b> in-memory index with memory barriers. Recency was the dominant ranking signal.', src: 2 },
      { when: '2016', who: 'Elastic', title: 'BM25 becomes the default', text: 'Elasticsearch moved from TF-IDF to <b>BM25</b> as the default similarity (5.0). The defaults are <b>k1 = 1.2</b> (term-frequency saturation) and <b>b = 0.75</b> (length normalisation), with field length counted in terms.', src: 3 }
    ],
    lessons: [
      '<b>Immutable segments</b> plus background merges beat updating an index in place.',
      'Separate <b>visibility</b> (refresh) from <b>durability</b> (translog + flush).',
      'Scatter-gather with a <b>two-phase</b> query: ids and scores first, documents last.',
      'Size shards by data volume (tens of GB) and add <b>replicas</b> for reads and failover.'
    ],
    sources: [
      { title: 'The Anatomy of a Large-Scale Hypertextual Web Search Engine', url: 'https://research.google/pubs/pub334/', pub: 'Brin & Page, 1998' },
      { title: 'Near Real-Time Search (Elasticsearch: The Definitive Guide)', url: 'https://elastic.co/guide/en/elasticsearch/guide/current/near-real-time.html', pub: 'Elastic (legacy guide)' },
      { title: 'Earlybird: Real-Time Search at Twitter', url: 'https://cs.uwaterloo.ca/~jimmylin/publications/Busch_etal_ICDE2012.pdf', pub: 'Busch et al., ICDE 2012' },
      { title: 'Practical BM25, Part 2: The BM25 Algorithm and its Variables', url: 'https://www.elastic.co/blog/practical-bm25-part-2-the-bm25-algorithm-and-its-variables', pub: 'Elastic blog' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Refresh interval', '<b>1 s</b>: near-real-time', '<b>30 s / off</b>: faster indexing, fewer segments', '1 s for user-facing search; longer for logs and bulk loads'],
      ['Shard count', '<b>Few, large shards</b>: less overhead', '<b>Many, small shards</b>: more parallelism, more fan-out', 'Tens of GB per shard; leave room to grow, or use rollover indices'],
      ['Scoring', '<b>query_then_fetch</b>: local IDF, one round-trip', '<b>dfs_query_then_fetch</b>: global IDF, extra round-trip', 'DFS for small or skewed indices; default otherwise'],
      ['Pagination', '<b>from + size</b>: random access, costly when deep', '<b>search_after</b>: cheap and stable, sequential only', 'search_after for infinite scroll and exports'],
      ['Engine', '<b>Postgres FTS</b> (tsvector + GIN): one system, transactional', '<b>Elasticsearch</b>: BM25, analyzers, facets, scale-out', 'Postgres up to millions of rows and simple ranking; ES beyond'],
      ['Replicas', '<b>0</b>: fastest indexing, no redundancy', '<b>1–2</b>: failover + read scaling', '0 only during a bulk load; ≥ 1 in production']
    ]
  },
  failures: [
    { f: 'Node loss', detect: 'Master fault detection; cluster turns yellow or red', fix: 'Promote an in-sync replica (primary term +1), re-replicate. Keep ≥ 1 replica.' },
    { f: 'Too many segments', detect: 'Segment count and query latency climbing during ingest', fix: 'Longer refresh interval for bulk loads; let merges catch up; force-merge read-only indices.' },
    { f: 'Oversharding', detect: 'Thousands of small shards; heavy cluster state; high heap', fix: 'Shrink or reindex into fewer shards; use rollover with size targets.' },
    { f: 'Deep pagination', detect: 'from + size near the result window; coordinator memory spikes', fix: 'search_after (+ point-in-time) instead of from/size.' },
    { f: 'Mapping explosion', detect: 'Field count grows from dynamic JSON keys', fix: 'Strict mappings, a flattened field type, field-count limits.' },
    { f: 'Split brain (older clusters)', detect: 'Two masters, divergent cluster state', fix: 'Quorum-based master election (3 master-eligible nodes).' }
  ],

  interview: [
    { q: 'What is an inverted index?', a: '<p>A map from each <b>term</b> to its <b>postings list</b>: the sorted doc ids containing it, plus frequencies and positions. A query for "red shoes" intersects or unions two postings lists instead of scanning documents.</p><p>Postings are delta-encoded and bit-packed, so they are compact and fast to iterate.</p>', lvl: 'core' },
    { q: 'Why are Lucene segments immutable?', a: '<ul><li>Writes are sequential: append a new segment, never rewrite.</li><li>Readers need no locks, and the OS page cache and filter caches stay valid.</li><li>Compression is easier.</li></ul><p>The cost is that updates are <b>delete + re-add</b>. Deletes are a bitset, and <b>merges</b> rewrite small segments into larger ones and drop deleted docs.</p>', lvl: 'core' },
    { q: 'What does near-real-time mean? Refresh vs flush vs translog?', a: '<ul><li><b>Refresh</b> (default every 1 s): the buffer becomes a new segment opened for search. It is visible but not fsynced.</li><li><b>Translog</b>: every operation is appended and fsynced before the ack, so it is durable.</li><li><b>Flush</b>: a Lucene commit that fsyncs segments and lets the translog be trimmed.</li></ul><p>Visibility and durability are separate.</p>', fu: 'How do you make a write visible immediately for a test? (refresh=wait_for, or refresh=true sparingly.)', lvl: 'core' },
    { q: 'Explain BM25. How is it better than TF-IDF?', a: '<p><code>score = Σ IDF(t) · tf·(k1+1) / (tf + k1·(1 − b + b·dl/avgdl))</code></p><ul><li><b>Saturation</b> (k1 ≈ 1.2): the 10th occurrence adds far less than the 1st.</li><li><b>Length normalisation</b> (b ≈ 0.75): a match in a short title outweighs one in a long essay.</li></ul><p>TF-IDF lacks saturation, so keyword stuffing wins.</p>', lvl: 'core' },
    { q: 'Walk through a distributed search request.', a: '<p><b>Query phase</b>: the coordinator sends the query to one copy of each shard. Each shard returns its top-k doc ids and scores (or sort values).</p><p>The coordinator merges them into the global top-k.</p><p><b>Fetch phase</b>: it requests full documents only for those k from their shards, adds highlights, and responds.</p>', lvl: 'core' },
    { q: 'Why is deep pagination expensive, and what do you use instead?', a: '<p>For <code>from = 10000, size = 10</code>, <b>every shard</b> must produce 10,010 hits and the coordinator sorts shards × 10,010. Elasticsearch caps this with <code>index.max_result_window</code>.</p><p>Use <b>search_after</b> with a tiebreaker sort (and a point-in-time for consistency). Each page then costs the same.</p>', lvl: 'core' },
    { q: 'How do you choose the number of shards?', a: '<p>From <b>data volume</b>: a common rule of thumb is shards of tens of GB. Too many small shards means fixed per-shard overhead and a large fan-out for every query. Too few huge shards means slow recovery and relocation and no parallelism.</p><p>Primary count is fixed at index creation, so use <b>rollover / time-based indices</b> or <code>_split</code> to grow.</p>', lvl: 'deep' },
    { q: 'Scores differ for the same doc depending on shard. Why?', a: '<p>IDF is computed from <b>shard-local</b> statistics. If a term is spread unevenly, its IDF differs per shard.</p><p>Fixes: <code>dfs_query_then_fetch</code> (gather global stats first, at the cost of an extra round-trip), or just enough data per shard with random routing, so stats converge.</p>', lvl: 'deep' },
    { q: 'How do replicas and primaries keep consistent?', a: '<p>Writes go to the <b>primary</b>, which forwards them to all <b>in-sync replicas</b> and acks after they apply. The master tracks the in-sync set.</p><p>On failover, an in-sync replica is promoted with a higher <code>primary_term</code>, so stale operations from the old primary are rejected. Sequence numbers let recovering copies replay only what they missed.</p>', lvl: 'deep' },
    { q: 'When is Postgres full-text search enough?', a: '<p><code>tsvector</code> + a <b>GIN</b> index + <code>ts_rank</code> handle millions of rows well, with transactional consistency and no extra system to run.</p><p>Move to Elasticsearch/OpenSearch when you need BM25-quality relevance with corpus-wide IDF, rich analyzers and synonyms, fuzzy typo tolerance, heavy facets, or horizontal scale.</p>', lvl: 'core' },
    { q: 'How did Twitter make tweets searchable within seconds?', a: '<p>Earlybird (2012) kept recent tweets in <b>in-memory</b> postings designed for a <b>single writer and many concurrent readers</b>, using memory barriers instead of locks. Tweets were searchable within about 10 s, and the system served over 2B queries/day at about 50 ms average. Ranking was dominated by <b>recency</b>.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Data Elasticsearch: map, search, search_after', lang: 'java',
      code: `@Document(indexName = "products")
@Setting(shards = 3, replicas = 1, refreshInterval = "1s")
public record Product(
    @Id String id,
    @Field(type = FieldType.Keyword) String sku,
    @Field(type = FieldType.Text, analyzer = "english") String title,
    @Field(type = FieldType.Text, analyzer = "english") String description,
    @Field(type = FieldType.Keyword) String brand,
    @Field(type = FieldType.Double) double price) {}

@Service
public class ProductSearch {
  private final ElasticsearchOperations ops;
  public ProductSearch(ElasticsearchOperations ops) { this.ops = ops; }

  /** Pass null for the first page, then the last hit's getSortValues(). */
  public SearchHits<Product> search(String text, String brand, List<Object> after) {
    NativeQuery q = NativeQuery.builder()
        .withQuery(qb -> qb.bool(b -> b
            .must(m -> m.multiMatch(mm -> mm.query(text).fields("title^3", "description")))
            .filter(f -> f.term(t -> t.field("brand").value(brand)))))
        .withSort(Sort.by(Sort.Order.desc("_score"), Sort.Order.asc("sku")))  // tiebreaker
        .withPageable(PageRequest.of(0, 20))
        .withSearchAfter(after)                    // deep paging without from + size
        .build();
    return ops.search(q, Product.class);           // BM25 by default
  }
}`,
      note: 'Spring Boot 3 with spring-boot-starter-data-elasticsearch. The <code>filter</code> clause does not affect scoring and is cached; <code>must</code> is scored.'
    },
    {
      title: 'Postgres: full-text search with tsvector + GIN', lang: 'sql',
      code: `ALTER TABLE products ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX products_tsv ON products USING gin (tsv);   -- inverted index

SELECT id, title,
       ts_rank_cd(tsv, q) AS rank,
       ts_headline('english', description, q) AS snippet
  FROM products,
       websearch_to_tsquery('english', 'wireless "noise cancelling" -earbuds') AS q
 WHERE tsv @@ q
 ORDER BY rank DESC
 LIMIT 20;`,
      note: '<code>ts_rank</code> uses term frequency and weights but no corpus-wide IDF, so relevance is weaker than BM25. GIN is Postgres\'s inverted index.'
    },
    {
      title: 'Python: BM25 from scratch', lang: 'python',
      code: `import math, re
from collections import Counter, defaultdict

def tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())

class BM25Index:
    def __init__(self, k1: float = 1.2, b: float = 0.75):
        self.k1, self.b = k1, b
        self.postings: dict[str, dict[str, int]] = defaultdict(dict)  # term -> {doc: tf}
        self.doc_len: dict[str, int] = {}

    def add(self, doc_id: str, text: str) -> None:
        tf = Counter(tokens(text))
        self.doc_len[doc_id] = sum(tf.values())
        for term, n in tf.items():
            self.postings[term][doc_id] = n

    def idf(self, term: str) -> float:                 # Lucene's BM25 idf (never negative)
        N, df = len(self.doc_len), len(self.postings.get(term, {}))
        return math.log(1 + (N - df + 0.5) / (df + 0.5))

    def search(self, query: str, k: int = 10) -> list[tuple[str, float]]:
        avgdl = sum(self.doc_len.values()) / max(1, len(self.doc_len))
        scores: Counter = Counter()
        for term in tokens(query):
            idf = self.idf(term)
            for doc, tf in self.postings.get(term, {}).items():
                norm = self.k1 * (1 - self.b + self.b * self.doc_len[doc] / avgdl)
                scores[doc] += idf * tf * (self.k1 + 1) / (tf + norm)
        return scores.most_common(k)`,
      note: 'Modern Lucene drops the constant <code>(k1 + 1)</code> factor because it does not change the ranking.'
    }
  ],

  related: ['web-crawler', 'typeahead', 'vector-db', 'observability', 'rag-agent-platform', 'kv-store']
});
