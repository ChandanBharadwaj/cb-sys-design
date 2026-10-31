SD.register({
  slug: 'top-k',
  domain: 4,
  title: 'Top-K / Heavy Hitters',
  examples: 'Twitter Trends',
  tagline: 'Find the most frequent (or fastest-rising) items in a stream of <b>millions of events per second</b>, using memory that does <b>not grow with the number of distinct items</b>.',
  tldr: {
    problem: 'A hashtag stream has hundreds of millions of distinct keys per day. An exact hash map per window, per region, per shard blows up memory, and merging per-shard top-K lists silently drops items.',
    idea: 'Keep a <b>small sketch</b> (Count-Min, Space-Saving or HeavyKeeper) plus a <b>min-heap of K candidates</b> per window. Sketches are tiny, fast and (for Count-Min) <b>mergeable by adding cells</b>. A batch job computes exact counts later.',
    insight: 'You only need to be accurate about the <b>heavy</b> items. Errors of ±εN are irrelevant for the long tail and small for the head. And <b>trending ≠ popular</b>: trends are about velocity against a baseline, not raw volume.',
    numbers: [
      { v: '±εN', l: 'Count-Min over-count bound with prob. 1−δ, using ⌈e/ε⌉ × ⌈ln 1/δ⌉ counters (Cormode & Muthukrishnan, 2005)' },
      { v: '1/ε', l: 'counters Space-Saving needs for error ≤ εN, independent of stream length (Metwally et al., 2005)' },
      { v: '0.9', l: 'default decay in Redis Top-K, a HeavyKeeper implementation (Redis docs)' }
    ]
  },

  intro: {
    what: 'A Top-K system watches a never-ending stream of events, such as hashtags, searches or product clicks. It answers one question: <b>which K items are the most frequent right now?</b> "K" is just the length of the list, like the top 10. A variant answers "which items are rising fastest?", which is how trending lists work.',
    analogy: {
      icon: '📋',
      title: 'Counting song requests with a small tally sheet',
      text: 'A radio station gets thousands of song requests an hour. The clerk cannot keep a page for every song ever named, so she uses a sheet with a fixed number of tally boxes. A simple rule sends each song to a box, so a few rare songs may share one. Hits still stand out because their box fills much faster, and she copies the 10 biggest onto a short leaderboard. The real version uses several such sheets with different rules and trusts the smallest tally, which keeps the over-count small.'
    },
    problem: 'Imagine showing "Trending now" on a social app. Every second, a huge number of posts mention hashtags, and new hashtags appear all the time. You must answer <b>"what are the top 10 in the last hour?"</b> within about a minute, without storing a counter for every hashtag ever seen. You must also tell the difference between something that is <b>always big</b> and something that is <b>suddenly big</b>.',
    story: [
      {
        stage: 'naive',
        title: 'Keep one counter per hashtag',
        text: 'Every post goes to one server that keeps a <b>hash map</b>: hashtag → count. To show the list, sort the map and take the top 10. It is exact and easy, and it works for a small app.',
        scene: {
          nodes: [
            { id: 'src', label: 'Posts', sub: 'hashtags', kind: 'client', at: [70, 0] },
            { id: 'agg', label: 'Hash map', sub: 'tag → count', kind: 'store', at: [210, 110] },
            { id: 'app', label: 'Trends panel', sub: 'sort, take 10', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'src', to: 'agg' }, { from: 'agg', to: 'app' }],
          flow: ['src>agg', 'agg>app']
        }
      },
      {
        stage: 'breaks',
        title: 'Memory explodes and merged lists miss winners',
        text: 'The map gets a new entry for every typo and one-off tag, so memory grows <b>without limit</b>, once per window and per region. Sorting it is slow. Splitting the stream randomly over many servers does not help: a tag that is #11 on every server makes no local top 10, yet it may be #1 in total. <b>Merging the short lists misses it.</b>',
        scene: {
          nodes: [
            { id: 'src', label: 'Posts', sub: 'endless stream', kind: 'client', at: [70, 0] },
            { id: 'agg', label: 'Hash map 1', sub: 'every tag ever', kind: 'store', at: [70, 110] },
            { id: 'agg2', label: 'Hash map 2', sub: 'every tag ever', kind: 'store', at: [350, 110] },
            { id: 'merge', label: 'Merge top 10s', sub: 'per-server lists', kind: 'service', at: [210, 220] },
            { id: 'app', label: 'Trends panel', sub: 'wrong list', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'src', to: 'agg' }, { from: 'src', to: 'agg2' }, { from: 'agg', to: 'merge' }, { from: 'agg2', to: 'merge' }, { from: 'merge', to: 'app' }],
          flow: [['src>agg', 'src>agg2'], ['agg>merge', 'agg2>merge'], 'merge>app'],
          err: ['agg', 'agg2'],
          warn: ['merge'],
          badges: { agg: ['out of memory', 'err'], merge: ['missed #1', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Small sketches, keyed by tag, plus a short heap',
        text: 'Send each tag to <b>one fixed worker</b>, so no tag is split. Each worker keeps a <b>sketch</b>: a small, fixed grid of counters that estimates any tag\'s count and never under-counts. Next to it sits a <b>heap</b> of the K best candidates. A merger combines the workers\' lists and compares each tag with its normal rate to find what is trending.',
        scene: {
          nodes: [
            { id: 'src', label: 'Posts', sub: 'hashtags', kind: 'client', at: [70, 0] },
            { id: 'kfk', label: 'Log by tag', sub: 'split by tag', kind: 'queue', at: [210, 0] },
            { id: 'agg', label: 'Worker 1', sub: 'sketch + heap', kind: 'compute', at: [70, 110] },
            { id: 'agg2', label: 'Worker 2', sub: 'sketch + heap', kind: 'compute', at: [350, 110] },
            { id: 'merge', label: 'Merger', sub: 'global top 10', kind: 'service', at: [210, 220] },
            { id: 'app', label: 'Trends panel', sub: 'fresh list', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'src', to: 'kfk' }, { from: 'kfk', to: 'agg' }, { from: 'kfk', to: 'agg2' }, { from: 'agg', to: 'merge' }, { from: 'agg2', to: 'merge' }, { from: 'merge', to: 'app' }],
          flow: ['src>kfk', ['kfk>agg', 'kfk>agg2'], ['agg>merge', 'agg2>merge'], 'merge>app'],
          ok: ['agg', 'agg2', 'merge'],
          badges: { merge: ['top 10 ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['Twitter / X Trends', 'Redis Top-K data type', 'Apache DataSketches', 'Network "top talkers" monitoring', 'Popular-searches lists', 'Best-seller and most-viewed lists'],
    whenToUse: [
      'You need the <b>most frequent</b> items from a stream with far too many distinct keys to count one by one',
      'A small, bounded error on counts is fine for a live view',
      'You want a "trending" list that reacts within a minute'
    ],
    whenNot: [
      'Only a few thousand distinct items: an exact hash map or a SQL <code>GROUP BY</code> is simpler',
      'Counts must be exact for money or billing (see <a href="ad-click-aggregation.html">Ad Click Aggregation</a>)',
      'You need a ranked list of known players with exact scores (see <a href="leaderboard.html">Live Leaderboard</a>)'
    ],
    glossary: [
      { term: 'Heavy hitter', def: 'An item that makes up a large share of the stream, such as a very popular hashtag.' },
      { term: 'Sketch', def: 'A small, fixed-size data structure that summarizes a huge stream and answers questions about it approximately.' },
      { term: 'Count-Min Sketch', def: 'A grid of counters with one hash function per row; an item\'s estimate is the smallest of its counters, so it can over-count but never under-count.' },
      { term: 'Min-heap', def: 'A structure that keeps a set of items with the smallest one always on top, so you can quickly drop the weakest of the current top K.' },
      { term: 'Sliding window', def: 'A time range that moves forward, like "the last 60 minutes", often built from many small time buckets.' },
      { term: 'Hot key', def: 'One key that gets so much traffic that the single partition or worker owning it is overloaded.' },
      { term: 'Baseline', def: 'The normal, expected rate for a term at this time of day; trending means far above it.' },
      { term: 'Watermark', def: 'A stream job\'s marker for "events older than this time have probably all arrived", used to decide when a window can close.' }
    ]
  },

  requirements: {
    functional: [
      'Top-K hashtags / queries / products per window (1 min, 1 h, 24 h)',
      'Per region and global views',
      'Trending (fast-rising) list, separate from most-popular',
      'Point query: approximate count of any term',
      'Exact daily counts for reports and billing',
      'Filter spam / bot bursts before ranking'
    ],
    nonFunctional: [
      '~10⁵–10⁶ events/s ingest, bursty',
      'Fresh within ~1 minute',
      'Bounded memory per worker, regardless of key cardinality',
      'Approximate in real time; exact in batch',
      'Survive worker crashes without double counting',
      'Hot keys must not overload one partition'
    ],
    outOfScope: ['Personalized trends', 'Content moderation policy', 'Storage of the tweets themselves', 'Search over terms']
  },

  calculator: {
    inputs: [
      { id: 'rate', label: 'Events per second', min: 1000, max: 10000000, value: 300000, log: true },
      { id: 'win', label: 'Window length', min: 1, max: 1440, value: 60, unit: 'min', log: true },
      { id: 'distinct', label: 'Distinct keys per window', min: 10000, max: 1000000000, value: 30000000, log: true },
      { id: 'w', label: 'Count-Min width w (counters per row)', min: 256, max: 4194304, value: 65536, log: true },
      { id: 'd', label: 'Count-Min depth d (hash rows)', min: 2, max: 10, value: 5 }
    ],
    outputs: [
      { label: 'Events per window (N)', f: (v) => v.rate * v.win * 60 },
      { label: 'ε = e / w', fmt: 'pct', f: (v) => Math.E / v.w },
      { label: 'Max over-count εN (prob. 1 − δ)', f: (v) => (Math.E / v.w) * v.rate * v.win * 60 },
      { label: 'δ = e^−d (chance to exceed it)', fmt: 'pct', f: (v) => Math.exp(-v.d) },
      { label: 'Count-Min memory (4-byte counters)', fmt: 'bytes', f: (v) => v.w * v.d * 4 },
      { label: 'Exact hash map (~100 B per key)', fmt: 'bytes', f: (v) => v.distinct * 100 }
    ],
    note: 'Rates, cardinalities and the 100 B per hash-map entry (key string + counter + overhead) are <em>estimates</em>. The ε and δ formulas are from the Count-Min paper. Compare the last two rows: the sketch stays in the <b>MB</b> range while an exact map needs <b>GB</b> per window, per region, per shard. Note that εN grows with the window, so long windows need a wider sketch.'
  },

  api: [
    { m: 'GET', p: '/v1/trends?region=IN&k=10', d: 'Current trending list (velocity-ranked), served from the Top-K store. Cached for ~30 s.' },
    { m: 'GET', p: '/v1/top?metric=hashtag&window=1h&k=50', d: 'Most popular items in a window. Approximate, with the error bound in the response.' },
    { m: 'GET', p: '/v1/count?term=%23worldcup&window=1h', d: 'Point query against the Count-Min sketch: never under-counts, may over-count by ≤ εN.' },
    { m: 'GET', p: '/v1/top/daily?date=2026-10-29', d: 'Exact daily top-K from the batch path.' },
    { m: 'RPC', p: 'produce(topic=events, key=term)', d: 'Ingest via Kafka. The key choice decides whether merging is exact (key = term) or lossy (random key).' }
  ],
  dataModel: [
    { name: 'events', store: 'Kafka topic', fields: [['key', 'term (or salted term)', 'pk'], ['value', '{term, region, user, ts}'], ['partition', 'hash(key) mod P']], note: 'Event time in the payload, so windows use event time, not arrival time.' },
    { name: 'sketch_state', store: 'Stream job keyed state', fields: [['(region, window_start)', 'key', 'pk'], ['cms', 'int32[d][w]'], ['heap', 'K × (term, est)'], ['watermark', 'ts']], note: 'Checkpointed together with Kafka offsets, so recovery neither loses nor double-counts events.' },
    { name: 'topk:{region}:{window}', store: 'Redis sorted set', fields: [['member', 'term', 'pk'], ['score', 'estimated count / trend score'], ['TTL', '2 × window']], note: 'What the API reads. Replaced atomically at each window close.' },
    { name: 'term_daily', store: 'Warehouse / Postgres', fields: [['(day, region, term)', 'key', 'pk'], ['count', 'bigint'], ['rank', 'int']], note: 'Exact counts from the batch job. Also the history for the trend baseline.' }
  ],

  architecture: {
    title: 'Top-K pipeline: streaming sketch + batch exact path',
    nodes: [
      { id: 'src', label: 'Producers', sub: 'posts · queries · clicks', kind: 'client', wide: [90, 220], tall: [70, 0], tip: 'Every post, search or click emits an event with the extracted terms.' },
      { id: 'kfk', label: 'Kafka', sub: 'partitioned by key', kind: 'queue', wide: [280, 220], tall: [210, 0], tip: 'Partitioning by term sends all events of a term to one worker, which makes the later merge exact. Very hot terms may need salting.' },
      { id: 'lake', label: 'Event lake', sub: 'S3 · Parquet', kind: 'store', wide: [280, 110], tall: [350, 0], tip: 'Raw events kept for replays and exact batch counts.' },
      { id: 'agg', label: 'Sketch workers', sub: 'Count-Min + heap', kind: 'compute', wide: [470, 220], tall: [210, 105], tip: 'A stream job (e.g. Flink). Per window and region: update the sketch, query the estimate, and keep a min-heap of the top K candidates.' },
      { id: 'batch', label: 'Batch job', sub: 'exact daily counts', kind: 'compute', wide: [470, 110], tall: [350, 105], tip: 'GROUP BY term over the day. Corrects the approximate real-time numbers and feeds the baseline.' },
      { id: 'base', label: 'Trend baseline', sub: 'expected rate / term', kind: 'ml', wide: [660, 0], tall: [70, 105], tip: 'Per term and region: typical rate for this hour of day. Trending = observed rate far above expected.' },
      { id: 'merge', label: 'Merger', sub: 'global top-K', kind: 'service', wide: [660, 220], tall: [210, 210], tip: 'Combines per-worker results. Exact if workers own disjoint keys; otherwise merge sketches (add cells) and re-query candidates.' },
      { id: 'store', label: 'Top-K store', sub: 'Redis · per window', kind: 'cache', wide: [850, 220], tall: [350, 315], tip: 'Sorted set per (region, window). Swapped atomically when a window closes.' },
      { id: 'api', label: 'Trends API', sub: 'cached ~30 s', kind: 'service', wide: [850, 340], tall: [210, 315], tip: 'Reads the store, applies policy filters, and returns the list.' },
      { id: 'cli', label: 'App', sub: 'trends panel', kind: 'client', wide: [660, 340], tall: [70, 315], tip: 'Shows trending and top lists to users.' }
    ],
    edges: [
      { from: 'src', to: 'kfk' },
      { from: 'kfk', to: 'agg' },
      { from: 'kfk', to: 'lake' },
      { from: 'lake', to: 'batch' },
      { from: 'agg', to: 'merge' },
      { from: 'base', to: 'merge', dashed: true },
      { from: 'merge', to: 'store' },
      { from: 'batch', to: 'store', dashed: true, bend: -0.15 },
      { from: 'api', to: 'store' },
      { from: 'cli', to: 'api', bidi: true }
    ]
  },

  scenarios: [
    {
      id: 'count', title: 'Hashtag → sketch → heap', tone: 'info',
      steps: [
        { text: 'A post with <code>#worldcup</code> arrives. The producer extracts the term and sends an event keyed by the term.', flow: ['src>kfk'], badges: { kfk: 'key #worldcup' } },
        { text: 'The worker that owns the partition hashes the term with <b>d independent hash functions</b> and increments one counter in each of the d rows.', flow: ['kfk>agg'], badges: { agg: 'd = 5 increments' } },
        { text: 'It queries the estimate: the <b>minimum</b> of those d counters. Collisions only ever add, so the minimum is the least-polluted guess and never an under-count.', nodes: ['agg'], badges: { agg: 'est = min(…) = 18,204' } },
        { text: 'If the estimate beats the smallest entry in the K-sized <b>min-heap</b>, the term replaces it. Memory is d·w counters + K heap entries, whatever the number of distinct terms.', nodes: ['agg'], ok: ['agg'], badges: { agg: ['heap: #worldcup ↑', 'ok'] }, tone: 'ok' },
        { text: 'At the window boundary each worker emits its heap. The merger publishes the sorted list to Redis; the API serves it.', flow: ['agg>merge', 'merge>store', 'api>store', 'api>cli'], badges: { store: 'topk:IN:1m' } }
      ]
    },
    {
      id: 'window', title: 'Sliding window from buckets', tone: 'ok',
      steps: [
        { text: 'A sliding 1-hour window is kept as <b>60 one-minute buckets</b>, each with its own sketch and heap.', nodes: ['agg'], badges: { agg: '60 × 1-min sketches' } },
        { text: 'Count-Min is <b>linear</b>: the sketch of a union is the cell-wise sum. The 1-hour sketch is the sum of 60 bucket sketches (or a running total).', nodes: ['agg'], badges: { agg: 'Σ buckets' } },
        { text: 'Each minute the oldest bucket is <b>subtracted</b> from the running total and dropped, and a fresh one starts. The window slides with no rescan of raw events.', nodes: ['agg'], ok: ['agg'], badges: { agg: ['−oldest +newest', 'ok'] }, tone: 'ok' },
        { text: 'Candidates are the union of the bucket heaps. They are re-scored against the 1-hour sketch and the top K are published.', flow: ['agg>merge', 'merge>store'], badges: { store: 'topk:IN:1h' } }
      ]
    },
    {
      id: 'merge', title: 'Why merging partial top-Ks is lossy', tone: 'warn',
      steps: [
        { text: 'Suppose events were spread <b>randomly</b> across 10 workers. Term X is #11 on every worker, so it appears on <b>no</b> local top-10 list.', nodes: ['agg'], warn: ['agg'], badges: { agg: ['X is #11 × 10', 'warn'] }, tone: 'warn' },
        { text: 'Globally, X\'s total is 10 × its local count, which is enough to be #1 overall. Merging the ten top-10 lists <b>cannot see it</b>.', flow: ['agg>merge'], err: ['merge'], badges: { merge: ['missed #1', 'err'] }, tone: 'err' },
        { text: 'Fix 1: <b>partition by term</b>, so each term lives on exactly one worker and per-worker lists are disjoint. The merge is then exact.', flow: ['src>kfk', 'kfk>agg'], ok: ['kfk'], badges: { kfk: ['key = term', 'ok'] } },
        { text: 'Fix 2: workers send <b>sketches</b> (added cell-wise) plus a longer candidate list (K′ ≫ K); the merger re-queries all candidates against the merged sketch.', flow: ['agg>merge', 'merge>store'], ok: ['merge'], badges: { merge: ['Σ sketches', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'spike', title: 'Hot spot: a term spikes (trending)', tone: 'warn',
      steps: [
        { text: 'A goal is scored. <code>#GOAL</code> jumps from 50/min to 40,000/min. Because the topic is keyed by term, one Kafka partition and one worker take the whole spike.', flow: [['src>kfk', 'src>kfk'], 'kfk>agg'], warn: ['kfk', 'agg'], badges: { agg: ['hot key', 'warn'] }, tone: 'warn' },
        { text: 'Producers <b>pre-aggregate</b> (count locally for 1 s and send <code>(term, n)</code>), or salt very hot keys into N sub-keys that the merger sums.', nodes: ['src', 'kfk'], ok: ['kfk'], badges: { src: 'combine 1 s' } },
        { text: '<code>#weather</code> has a higher raw count than <code>#GOAL</code> every day. A <b>popularity</b> list would show it; a <b>trending</b> list should not.', nodes: ['merge'], badges: { merge: '#weather: steady' } },
        { text: 'The merger scores each candidate against its <b>baseline</b> (expected rate for this hour), e.g. a z-score of observed vs expected. <code>#GOAL</code> is 800× its baseline, so it trends.', flow: ['base>merge', 'merge>store'], ok: ['store'], badges: { store: ['#GOAL z ≫ 3', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'crash', title: 'Worker crash and late events', tone: 'err',
      steps: [
        { text: 'A sketch worker dies mid-window. Its in-memory sketch and heap are gone.', nodes: ['agg'], err: ['agg'], badges: { agg: ['crashed', 'err'] }, tone: 'err' },
        { text: 'The job restarts from the last <b>checkpoint</b> (sketch state plus Kafka offsets, stored together) and replays events after those offsets. No event is lost or counted twice.', flow: ['kfk>agg'], warn: ['agg'], badges: { agg: ['restore + replay', 'warn'] }, tone: 'warn' },
        { text: 'Events from phones that were offline arrive minutes late. Windows close by <b>watermark</b>; events within the allowed lateness update the window, later ones go to a side output.', flow: ['src>kfk', 'kfk>agg'], badges: { agg: 'late → side output' } },
        { text: 'The nightly batch job recomputes <b>exact</b> counts from the lake and overwrites the daily numbers. Real time is fast; batch is right.', flow: ['kfk>lake', 'lake>batch', 'batch>store'], ok: ['batch', 'store'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick an algorithm, size it, and choose the window and the meaning of "top". Assumes ~300K events/s and window cardinalities from the calculator (estimates).',
    controls: [
      { id: 'algo', label: 'Counting structure', type: 'seg', value: 'cms', options: [
        { v: 'exact', l: 'Exact hash map' }, { v: 'cms', l: 'Count-Min + heap' }, { v: 'ss', l: 'Space-Saving' }, { v: 'hk', l: 'HeavyKeeper' }] },
      { id: 'lw', label: 'Width / counters (log₂)', type: 'range', min: 8, max: 20, step: 1, value: 16, fmt: (v) => '2^' + v + ' = ' + SD.fmt.num(Math.pow(2, v)) },
      { id: 'd', label: 'Depth (hash rows)', type: 'range', min: 2, max: 8, step: 1, value: 5 },
      { id: 'win', label: 'Window', type: 'seg', value: '1h', options: [
        { v: '1m', l: 'Tumbling 1 min' }, { v: '1h', l: 'Sliding 1 h (60 buckets)' }, { v: '24h', l: 'Sliding 24 h (24 buckets)' }] },
      { id: 'trend', label: 'What "top" means', type: 'seg', value: 'velocity', options: [
        { v: 'count', l: 'Highest count' }, { v: 'velocity', l: 'Velocity vs baseline' }] }
    ],
    evaluate(s) {
      const rate = 3e5;
      const W = { '1m': { secs: 60, distinct: 2e6, buckets: 1 }, '1h': { secs: 3600, distinct: 3e7, buckets: 60 }, '24h': { secs: 86400, distinct: 2e8, buckets: 24 } }[s.win];
      const N = rate * W.secs;
      const w = Math.pow(2, s.lw);
      const kth = N * 5e-4; // count of the 10th item: illustrative assumption (0.05% of traffic)
      let mem, err, errS, conf, confS, recall, merge, mergeS, cost;
      if (s.algo === 'exact') {
        mem = W.distinct * 100; err = 'exact'; errS = 1; conf = '100%'; confS = 1; recall = 1;
        merge = 'yes, but ships huge maps'; mergeS = 0.4; cost = 'hash + cache miss';
      } else if (s.algo === 'cms') {
        mem = w * s.d * 4 * W.buckets;
        const eN = Math.E / w * N;
        err = '≤ ' + SD.fmt.num(eN) + ' (' + (eN / kth * 100).toFixed(eN / kth < 0.1 ? 2 : 0) + '% of #10)'; errS = Math.max(0.05, 1 - eN / kth);
        conf = (100 * (1 - Math.exp(-s.d))).toFixed(s.d >= 5 ? 2 : 1) + '%'; confS = 1 - Math.exp(-s.d);
        recall = Math.max(0.3, Math.min(0.99, 1 - 0.6 * eN / kth)) * (0.85 + 0.15 * confS);
        merge = 'exact: add cells'; mergeS = 0.95; cost = s.d + ' hashes + heap log K';
      } else if (s.algo === 'ss') {
        mem = w * 64 * W.buckets;
        const eN = N / w;
        err = '≤ N/m = ' + SD.fmt.num(eN) + ' (deterministic)'; errS = Math.max(0.05, 1 - eN / kth);
        conf = 'deterministic'; confS = 1;
        recall = Math.max(0.3, Math.min(0.99, 1 - 0.5 * eN / kth));
        merge = 'mergeable, error bounds add'; mergeS = 0.7; cost = 'O(1) stream-summary';
      } else {
        mem = w * s.d * 8 * W.buckets;
        err = w >= 1024 ? 'tiny for heavy items' : 'grows: too few buckets'; errS = w >= 1024 ? 0.85 : 0.4;
        conf = 'empirical (no εN bound)'; confS = 0.7;
        recall = w >= 1024 ? 0.97 : 0.7;
        merge = 'no simple merge (decay is order-dependent)'; mergeS = 0.3; cost = s.d + ' hashes + decay + heap';
      }
      const metrics = [
        { k: 'Memory per worker', v: SD.fmt.bytes(mem), s: mem < 64e6 ? 0.9 : mem < 1e9 ? 0.6 : 0.2 },
        { k: 'Count error', v: err, s: errS },
        { k: 'Bound holds with', v: conf, s: confS },
        { k: 'Recall of true top-10 (est.)', v: Math.round(recall * 100) + '%', s: recall },
        { k: 'Merge across shards', v: merge, s: mergeS },
        { k: 'Update cost per event', v: cost, s: s.algo === 'ss' ? 0.9 : s.algo === 'exact' ? 0.7 : 0.8 },
        { k: 'Surfaces breaking news', v: s.trend === 'velocity' ? 'yes: spikes vs baseline' : 'no: steady giants win', s: s.trend === 'velocity' ? 0.9 : 0.3 }
      ];
      const notes = [];
      if (s.algo === 'exact') notes.push('Exact counting is fine at 1-minute scale for one region. At 24 h and global scale the map is ' + SD.fmt.bytes(W.distinct * 100) + ' per window per shard, and it grows with every new hashtag.');
      if (s.algo === 'cms') notes.push('Count-Min only stores counts, not keys, so you need the <b>heap</b> to remember which terms are candidates. Conservative update (only raise the minimum counters) reduces over-counting further.');
      if (s.algo === 'ss') notes.push('Space-Saving keeps m (term, count, error) slots. A new term evicts the smallest slot and inherits its count + 1, so counts are over-estimates by at most N/m.');
      if (s.algo === 'hk') notes.push('HeavyKeeper uses <b>count-with-exponential-decay</b>: when a new flow collides with an occupied bucket, the old count is decremented with probability b<sup>−count</sup>, so mice rarely displace elephants. Redis Top-K implements it.');
      if (s.win === '24h' && s.algo !== 'exact') notes.push('Long windows mean large N. εN grows linearly with N, so widen the sketch or rank on the short windows.');
      if (s.trend === 'velocity') notes.push('Twitter has said trends are driven by <b>velocity</b> relative to a normal baseline, which is why a big but steady topic may never trend.');
      let verdict;
      if (s.algo === 'exact' && s.win !== '1m') verdict = '❌ <b>Memory explodes.</b> An exact map per window and shard does not scale to this cardinality.';
      else if (errS < 0.4) verdict = '⚠ <b>Sketch too small for this window.</b> The error is comparable to the #10 count, so the list will be noisy. Increase the width.';
      else if (s.trend === 'count') verdict = '👍 Correct <b>popular</b> list, but not a <b>trending</b> list: steady giants will always top it.';
      else if (s.algo === 'cms' || s.algo === 'ss') verdict = '✅ <b>Solid design:</b> bounded memory, a provable error bound, mergeable windows and velocity-based trends, with exact counts from batch.';
      else verdict = '👍 <b>Very accurate for heavy hitters</b> in little memory, but plan for no simple cross-shard merge: partition by term.';
      return {
        metrics, verdict, notes,
        labels: { agg: { label: 'Sketch workers', sub: { exact: 'exact hash map', cms: 'CMS ' + s.d + '×2^' + s.lw + ' + heap', ss: 'Space-Saving m=2^' + s.lw, hk: 'HeavyKeeper ' + s.d + '×2^' + s.lw }[s.algo] } },
        hide: s.trend === 'velocity' ? [] : ['base'],
        hot: ['agg'],
        warn: errS < 0.4 || mem > 1e9 ? ['agg'] : [],
        badges: { agg: [SD.fmt.bytes(mem), mem > 1e9 ? 'err' : 'info'] },
        flow: ['src>kfk', 'kfk>agg', 'agg>merge'].concat(s.trend === 'velocity' ? ['base>merge'] : []).concat(['merge>store', 'api>store'])
      };
    }
  },

  widget: {
    title: 'Count-Min Sketch + top-5 heap',
    caption: 'Hashtags stream in with a skewed (Zipf) distribution. Each one is hashed into <b>one cell per row</b>; the estimate is the <b>minimum</b> of its cells. Watch estimates (est) drift above true counts as the grid gets crowded. Shrink the <b>width</b> to see collisions grow, or fire a <b>burst</b>.'
  },

  realWorld: {
    intro: 'The algorithms come from the streaming literature of the 2000s; Twitter explained in public what "trending" means.',
    timeline: [
      { when: '2004–05', who: 'Cormode & Muthukrishnan', title: 'The Count-Min Sketch', text: 'A d × w array of counters with pairwise-independent hashes. With <b>w = ⌈e/ε⌉</b> and <b>d = ⌈ln(1/δ)⌉</b>, a point query never under-counts and over-counts by more than <b>εN</b> with probability at most δ. Sketches of two streams add cell-wise.', src: 0 },
      { when: '2005', who: 'Metwally, Agrawal, El Abbadi', title: 'Space-Saving', text: 'Keep m counters. A new item replaces the item with the smallest count and inherits that count + 1. One structure answers both frequent-item and top-k queries, with guaranteed error bounds.', src: 1 },
      { when: 'Dec 2010', who: 'Twitter', title: '"To Trend or Not to Trend"', text: 'Prompted by questions about #wikileaks, Twitter explained that trends reflect topics whose conversation is <b>accelerating</b> relative to their normal baseline, not simply the most-mentioned topics.', src: 2 },
      { when: '2011', who: 'Nieman Lab · Gilad Lotan', title: 'Spikes beat steady volume', text: 'An analysis of #occupywallstreet: a systematic rise in volume without a clear spike may <b>never trend</b>, because the algorithm adapts to a term\'s changing velocity.', src: 3 },
      { when: '2018', who: 'Peking Univ. (USENIX ATC)', title: 'HeavyKeeper', text: 'For top-k elephant flows in networks: <b>count-with-exponential-decay</b> weakens small flows when they collide with large ones, giving high precision with small memory and constant work per packet.', src: 4 },
      { when: 'Today', who: 'Redis · Apache DataSketches', title: 'Off-the-shelf sketches', text: 'Redis Top-K is based on HeavyKeeper (decay defaults to 0.9; width and depth are set when you reserve the key). DataSketches\' frequent-items sketch returns results with <b>no false positives</b> or <b>no false negatives</b>, your choice.', src: 5 }
    ],
    lessons: [
      'Decide what you need exactly (daily reports) and what can be approximate (live lists).',
      'Sketch <b>plus</b> heap: the sketch counts, the heap remembers the candidate keys.',
      'Partition by key, or merge <b>sketches</b>, never just partial top-K lists.',
      'Trending is a <b>rate-of-change</b> problem with a baseline, not a counting problem.',
      'Checkpoint sketches with stream offsets to get exactly-once state.'
    ],
    sources: [
      { title: 'An Improved Data Stream Summary: The Count-Min Sketch and its Applications', url: 'https://www.cs.tufts.edu/~nr/cs257/archive/graham-cormode/count-min.pdf', pub: 'J. Algorithms, 2005 (LATIN 2004)' },
      { title: 'Efficient Computation of Frequent and Top-k Elements in Data Streams', url: 'https://cse.hkust.edu.hk/~raywong/comp5331/References/EfficientComputationOfFrequentAndTop-kElementsInDataStreams.pdf', pub: 'ICDT 2005' },
      { title: 'To Trend or Not to Trend', url: 'https://blog.twitter.com/2010/trend-or-not-trend', pub: 'Twitter Blog, Dec 2010' },
      { title: 'Why hasn\'t #occupywallstreet trended in New York?', url: 'https://www.niemanlab.org/2011/10/why-hasnt-occupywallstreet-trended-in-new-york/', pub: 'Nieman Lab, Oct 2011' },
      { title: 'HeavyKeeper: An Accurate Algorithm for Finding Top-k Elephant Flows', url: 'https://usenix.org/conference/atc18/presentation/gong', pub: 'USENIX ATC 2018' },
      { title: 'Top-K (probabilistic data types)', url: 'https://redis.io/docs/latest/develop/data-types/probabilistic/top-k/', pub: 'Redis Docs' },
      { title: 'Frequent Items Overview', url: 'https://datasketches.apache.org/docs/Frequency/FrequentItemsOverview.html', pub: 'Apache DataSketches' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Counting', '<b>Exact hash map</b>: precise, simple', '<b>Sketch + heap</b>: bounded memory, small error', 'Exact for low cardinality or batch; sketches for live, high-cardinality streams'],
      ['Sketch type', '<b>Count-Min</b>: provable εN, mergeable, point queries', '<b>Space-Saving / HeavyKeeper</b>: tracks keys, very accurate for the head', 'CMS when you merge across shards/windows; SS/HK for a single top-K stream'],
      ['Partitioning', '<b>Key = term</b>: exact merge, but hot keys', '<b>Random key</b>: balanced, but lossy merge', 'Key by term + local pre-aggregation for hot terms'],
      ['Window', '<b>Tumbling</b>: simple, jumpy at edges', '<b>Sliding (buckets)</b>: smooth, more memory', 'Sliding for user-facing lists; tumbling for reports'],
      ['Ranking', '<b>Count</b>: what is popular', '<b>Velocity vs baseline</b>: what is new', 'Both: "Top" and "Trending" are different products'],
      ['Architecture', '<b>Lambda</b>: stream + batch correction', '<b>Kappa</b>: stream only, replay to fix', 'Lambda when exact daily numbers matter (billing, reports)']
    ]
  },
  failures: [
    { f: 'Worker crash mid-window', detect: 'Job manager heartbeat', fix: 'Restore sketch state from the checkpoint and replay Kafka from the stored offsets.' },
    { f: 'Hot key overloads one partition', detect: 'Per-partition lag and CPU skew', fix: 'Pre-aggregate at producers; salt very hot terms into sub-keys and sum them in the merger.' },
    { f: 'Merged list misses a global heavy hitter', detect: 'Batch exact top-K disagrees with live list', fix: 'Partition by term, or merge sketches and re-score a longer candidate list.' },
    { f: 'Sketch saturates (too many collisions)', detect: 'εN approaches the #K count; batch comparison', fix: 'Increase width, shorten windows, or use conservative update.' },
    { f: 'Late / out-of-order events', detect: 'Events behind the watermark', fix: 'Allowed lateness + side output; batch path corrects totals.' },
    { f: 'Bots manufacture a trend', detect: 'Burst from few accounts / new accounts', fix: 'Count distinct users per term (HyperLogLog), weight by account reputation, filter before ranking.' }
  ],

  interview: [
    { q: 'Why can\'t you just keep a counter per hashtag?', a: '<p>Cardinality. Hundreds of millions of distinct terms per day, per region, per window, per shard means GBs of hash maps that keep growing, and most entries are long-tail noise seen once.</p><p>You only care about the <b>head</b>, so a fixed-size sketch plus a K-sized heap answers the question in MBs.</p>', lvl: 'core' },
    { q: 'How does a Count-Min Sketch work, and what are its error bounds?', a: '<p>A d × w array of counters and d pairwise-independent hash functions. <b>Update</b>: increment one counter per row. <b>Query</b>: take the <b>minimum</b> of the item\'s d counters.</p><p>It never under-counts. With w = ⌈e/ε⌉ and d = ⌈ln(1/δ)⌉, the over-count is at most <b>εN</b> with probability ≥ 1 − δ, where N is the total count.</p>', fu: 'Why the minimum and not the average? (Collisions only add, so every counter is ≥ the truth; the minimum is the tightest.)', lvl: 'core' },
    { q: 'A Count-Min Sketch gives counts. How do you get the top K from it?', a: '<p>The sketch does not store keys. Keep a <b>min-heap of size K</b> next to it: after each update, query the item\'s estimate; if it is larger than the heap minimum (or the item is already in the heap), insert/update it.</p>', lvl: 'core' },
    { q: 'Why is merging per-shard top-K lists lossy?', a: '<p>An item can be just below the cut on every shard and still have the largest <b>total</b>. It appears on no partial list, so the merger can\'t see it.</p><p>Fixes: partition by key (shards own disjoint keys), or ship mergeable sketches (CMS adds cell-wise) plus longer candidate lists (K′ ≫ K) and re-score.</p>', lvl: 'core' },
    { q: 'What is the difference between trending and popular?', a: '<p><b>Popular</b> = highest count in a window. <b>Trending</b> = growing much faster than usual: compare the current rate with a baseline for that term and time (ratio or z-score), with smoothing and a minimum volume.</p><p>Twitter has described trends as velocity-based, which is why steady high-volume topics often don\'t trend.</p>', lvl: 'core' },
    { q: 'How do you implement a sliding 1-hour window?', a: '<p>Keep <b>buckets</b> (e.g. 60 one-minute sketches). Because CMS is linear, the window sketch is the sum of the buckets; maintain a running total and subtract the expiring bucket each minute.</p><p>Candidates come from the union of the bucket heaps, re-scored against the window sketch.</p>', lvl: 'deep' },
    { q: 'How does Space-Saving work?', a: '<p>Keep m (item, count, error) slots. If the item is tracked, increment it. Otherwise <b>evict the slot with the smallest count</b> c<sub>min</sub>, put the new item there with count c<sub>min</sub> + 1 and error c<sub>min</sub>.</p><p>Every count over-estimates by at most N/m. A "stream-summary" linked structure makes each update O(1).</p>', lvl: 'deep' },
    { q: 'How does HeavyKeeper differ from Count-Min?', a: '<p>Each bucket stores a <b>fingerprint and a count</b>. If the fingerprint matches, increment. If not, <b>decay</b> the existing count with probability b<sup>−count</sup> and take over the bucket when it reaches zero.</p><p>Small flows can\'t easily displace big ones, so heavy items keep accurate counts in small memory.</p>', lvl: 'deep' },
    { q: 'How do you handle late events and crashes without double counting?', a: '<p>Use <b>event time</b> with watermarks and an allowed lateness; route later events to a side output. Checkpoint the sketch state <b>together with</b> the Kafka offsets (Flink does this), so recovery replays exactly the uncounted events.</p><p>The batch path produces the exact final numbers.</p>', lvl: 'deep' },
    { q: 'A single hashtag gets 50% of traffic. What breaks?', a: '<p>With key = term, one partition and one worker get half the load. Pre-aggregate on producers (send <code>(term, n)</code> per second), or <b>salt</b> the key into N sub-keys and sum them in the merger.</p>', lvl: 'core' },
    { q: 'How big should the Count-Min Sketch be?', a: '<p>Size it against the item you must rank correctly: the <b>K-th</b> one. The error εN must be well below that item\'s count.</p><p>Example (estimates): 300K events/s for 1 h gives N ≈ 1.1 B. If the #10 hashtag has 0.05% of traffic, it has ≈ 540K. With w = 2<sup>16</sup>, ε = e/w ≈ 4×10<sup>−5</sup>, so εN ≈ 45K, about 8% of #10. With d = 5 (δ ≈ 0.7%) that is 5 × 65,536 × 4 B ≈ <b>1.3 MB</b>.</p><p>εN grows with N, so a 24 h window needs a wider sketch (or ranking on shorter windows).</p>', lvl: 'deep' },
    { q: 'How would you stop bots from manufacturing trends?', a: '<p>Rank on <b>distinct users</b> per term (HyperLogLog per term candidate), not raw events; weight by account age and reputation; detect coordinated bursts; and apply policy filters before publishing.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Python: Count-Min Sketch + top-K heap', lang: 'python',
      code: `import hashlib, heapq, math

class CountMinTopK:
    def __init__(self, eps: float, delta: float, k: int):
        self.w = math.ceil(math.e / eps)          # width from the error target
        self.d = math.ceil(math.log(1 / delta))   # depth from the confidence target
        self.rows = [[0] * self.w for _ in range(self.d)]
        self.k, self.n = k, 0
        self.top: dict[str, int] = {}              # candidate -> estimate

    def _cells(self, item: str):
        h = hashlib.blake2b(item.encode(), digest_size=16).digest()
        h1, h2 = int.from_bytes(h[:8], "little"), int.from_bytes(h[8:], "little")
        for i in range(self.d):                   # Kirsch-Mitzenmacher double hashing
            yield i, (h1 + i * h2) % self.w

    def add(self, item: str, count: int = 1) -> int:
        self.n += count
        for i, j in self._cells(item):
            self.rows[i][j] += count
        est = self.estimate(item)
        if item in self.top or len(self.top) < self.k:
            self.top[item] = est
        else:
            low = min(self.top, key=self.top.get)  # O(k); use a heap + index at scale
            if est > self.top[low]:
                del self.top[low]
                self.top[item] = est
        return est

    def estimate(self, item: str) -> int:        # never under-counts
        return min(self.rows[i][j] for i, j in self._cells(item))

    def topk(self) -> list[tuple[str, int]]:
        return heapq.nlargest(self.k, self.top.items(), key=lambda kv: kv[1])

cms = CountMinTopK(eps=1e-4, delta=1e-3, k=10)   # 27,183 x 7 counters`,
      note: 'Double hashing from two 64-bit halves is a standard way to derive d hash functions. For production use, Apache DataSketches (frequent items) is battle-tested.'
    },
    {
      title: 'Java: Redis Top-K (HeavyKeeper) per minute', lang: 'java',
      code: `// redis.clients:jedis 5.x, Redis 8 (or Redis Stack) with the Top-K data type
public class TrendingCounter {
  private final UnifiedJedis jedis = new JedisPooled("localhost", 6379);
  private static final DateTimeFormatter MIN =
      DateTimeFormatter.ofPattern("yyyyMMddHHmm").withZone(ZoneOffset.UTC);

  private String key(String region, Instant t) { return "topk:" + region + ":" + MIN.format(t); }

  public void record(String region, Map<String, Long> termCounts, Instant eventTime) {
    String k = key(region, eventTime);
    if (!jedis.exists(k)) {
      try {   // k=50, width=2000, depth=7, decay=0.925 (Redis docs example sizing)
        jedis.topkReserve(k, 50, 2000, 7, 0.925);
      } catch (JedisDataException alreadyCreated) { /* another worker won the race */ }
      jedis.expire(k, 2 * 3600);
    }
    jedis.topkIncrBy(k, termCounts);             // pre-aggregated counts from this batch
  }

  public Map<String, Long> topNow(String region) {
    return jedis.topkListWithCount(key(region, Instant.now().minusSeconds(60)));
  }
}`,
      note: 'Redis Top-K keeps the K heavy hitters per key. For a sliding hour, query the last 60 minute-keys and merge the candidates, then re-score with exact or sketch counts.'
    },
    {
      title: 'SQL: exact daily top-K per region (batch path)', lang: 'sql',
      code: `-- runs nightly over the event lake (or a Postgres table for smaller volumes)
WITH counts AS (
  SELECT region, term, count(*) AS cnt
    FROM hashtag_events
   WHERE ts >= DATE '2026-10-29' AND ts < DATE '2026-10-30'
   GROUP BY region, term
), ranked AS (
  SELECT region, term, cnt,
         row_number() OVER (PARTITION BY region ORDER BY cnt DESC, term) AS rn
    FROM counts
)
INSERT INTO term_daily (day, region, term, count, rank)
SELECT DATE '2026-10-29', region, term, cnt, rn
  FROM ranked
 WHERE rn <= 100
ON CONFLICT (day, region, term) DO UPDATE
   SET count = EXCLUDED.count, rank = EXCLUDED.rank;`
    }
  ],

  related: ['stream-analytics', 'ad-click-aggregation', 'message-queue', 'typeahead', 'newsfeed', 'leaderboard']
});
