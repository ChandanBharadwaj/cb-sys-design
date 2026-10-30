SD.register({
  slug: 'stream-analytics',
  domain: 7,
  title: 'Real-Time Stream Analytics',
  examples: 'Flink, ClickHouse',
  tagline: 'Turn an endless, out-of-order event stream into correct per-minute numbers within seconds, and keep them correct when machines crash. The tools are <b>event time, watermarks and checkpoints</b>.',
  tldr: {
    problem: 'Events arrive late and out of order: phones go offline and partitions lag. You still need per-key, per-window aggregates that are fresh, correct, and not double-counted after a crash.',
    idea: 'Window by <b>event time</b>. A <b>watermark</b> says "I don\'t expect anything older than T". When it passes a window\'s end, the window fires. Periodic <b>barrier snapshots</b> of operator state and Kafka offsets make recovery exactly-once. Results land in a columnar store (<b>ClickHouse MergeTree</b>) for sub-second queries.',
    insight: 'You can never know a window is complete, so pick your trade-off explicitly. Watermark lag buys <i>completeness</i> with <i>latency</i>, and allowed lateness buys <i>corrections</i> with <i>state</i>. This is the core argument of Google\'s Dataflow model paper.',
    numbers: [
      { v: '6M/s', l: 'HTTP requests fed into Cloudflare\'s ClickHouse analytics (2018 blog)' },
      { v: 'several PB', l: 'of logs on Uber\'s ClickHouse platform (2021 blog)' },
      { v: '≈ 5 s', l: 'a typical watermark lag for app events (<em>estimate</em>)' }
    ]
  },

  requirements: {
    functional: [
      'Ingest clickstream / request events from many producers',
      'Per-key windowed aggregates (count, sum, distinct users, p99)',
      'Dashboards and ad-hoc SQL over recent and historical data',
      'Threshold alerts on live aggregates',
      'Handle late events: correct the window or route them aside',
      'Replay / backfill from the log after a bug fix'
    ],
    nonFunctional: [
      'Results visible within seconds of a window closing',
      'Millions of events/s, horizontally scalable',
      'Exactly-once results after failures (no double counts)',
      'Bounded state, even with millions of keys',
      'Recovery in under a minute from a node loss',
      'Sub-second queries over billions of rows'
    ],
    outOfScope: ['Ad click billing and dedup (see Ad Click Aggregation)', 'Batch ETL / data lake design', 'ML feature stores', 'Kafka internals (see Message Queue)']
  },

  calculator: {
    inputs: [
      { id: 'eps', label: 'Events per second (peak)', min: 1000, max: 10000000, value: 1000000, log: true },
      { id: 'bytes', label: 'Bytes per event (uncompressed)', min: 100, max: 2000, step: 50, value: 500, fmt: 'bytes' },
      { id: 'keys', label: 'Distinct keys per window', min: 1000, max: 100000000, value: 1000000, log: true },
      { id: 'win', label: 'Window size', min: 10, max: 3600, step: 10, value: 60, unit: 's' },
      { id: 'late', label: 'Allowed lateness', min: 0, max: 3600, step: 30, value: 120, unit: 's' },
      { id: 'ret', label: 'Raw-event retention in ClickHouse', min: 1, max: 365, value: 30, unit: 'days' }
    ],
    outputs: [
      { label: 'Ingest bandwidth into Kafka', fmt: 'bytesps', f: (v) => v.eps * v.bytes },
      { label: 'Raw events per day', f: (v) => v.eps * 86400 },
      { label: 'Window state (~64 B per key per open window)', fmt: 'bytes', f: (v) => v.keys * 64 * Math.ceil((v.win + v.late) / v.win) },
      { label: 'Aggregate rows per day (upper bound)', f: (v) => v.keys * 86400 / v.win },
      { label: 'Reduction: events → aggregate rows', f: (v) => Math.max(1, (v.eps * v.win) / v.keys), unit: '×' },
      { label: 'Raw storage (≈10× columnar compression)', fmt: 'bytes', f: (v) => v.eps * v.bytes * 86400 * v.ret / 10 }
    ],
    note: 'Peak rate is used as if sustained, so storage is an upper bound. 64 B per window aggregate and 10× compression are <em>estimates</em>; real ratios depend on the columns. Notice how <b>allowed lateness multiplies state</b>: each key keeps every window that could still receive a late event.'
  },

  api: [
    { m: 'POST', p: '/v1/events (batch)', d: 'Producers send batches of <code>{event_id, key, event_time, …}</code>. The service writes them to Kafka keyed by <code>key</code> so one key\'s events stay ordered in one partition.' },
    { m: 'GET', p: '/v1/metrics?key&from&to&step=1m', d: 'Time series for dashboards. It reads the per-minute rollup table in ClickHouse and always re-aggregates, because merges are eventual.' },
    { m: 'SQL', p: 'SELECT … FROM page_views_1m FINAL', d: 'Ad-hoc analytics straight on ClickHouse. <code>FINAL</code> (or <code>argMax</code>) collapses window rows that were re-fired by late data.' },
    { m: 'WS', p: '/v1/live?key', d: 'Pushes each window result to open dashboards as soon as the sink commits it.' },
    { m: 'POST', p: '/jobs/{id}/savepoints', d: 'Flink REST: take a savepoint before deploying new code. Then restart from it with the new jar, or with more parallelism.' }
  ],
  dataModel: [
    { name: 'events (topic)', store: 'Kafka', fields: [['key', 'page_id', 'pk'], ['event_id', 'uuid'], ['event_time', 'ts (ms)', 'idx'], ['payload', 'json/avro'], ['partition', 'hash(key)']], note: 'The source of truth. Retention long enough to replay a bug fix.' },
    { name: 'window state', store: 'Flink keyed state (RocksDB)', fields: [['key + window', 'bytes', 'pk'], ['count / sum', 'long'], ['distinct', 'HLL sketch'], ['timer', 'window end + lateness']], note: 'Scoped to the key. Cleared by a timer once the watermark passes end + allowed lateness.' },
    { name: 'page_views_1m', store: 'ClickHouse ReplacingMergeTree', fields: [['page_id', 'UInt64', 'pk'], ['window_start', 'DateTime', 'pk'], ['views', 'UInt64'], ['fired_at', 'DateTime64 (version)', 'sk']], note: 'ORDER BY is also the dedup key. A re-fired window or a replayed row replaces the older version on merge.' },
    { name: 'checkpoint chk-n', store: 'S3 / object store', fields: [['_metadata', 'file', 'pk'], ['kafka offsets', 'per partition'], ['state handles', 'SST files (shared)']], note: 'Incremental: unchanged RocksDB files are referenced, not uploaded again.' }
  ],

  architecture: {
    title: 'Stream analytics architecture',
    nodes: [
      { id: 'src', label: 'Event sources', sub: 'apps · CDN · devices', kind: 'client', wide: [90, 110], tall: [70, 0], tip: 'Producers stamp each event with its own event time and send batches.' },
      { id: 'kfk', label: 'Kafka', sub: 'partitioned by key', kind: 'queue', wide: [280, 110], tall: [210, 0], tip: 'Durable, replayable log. Offsets let Flink rewind to exactly where a checkpoint was taken.' },
      { id: 'jm', label: 'JobManager', sub: 'checkpoint coordinator', kind: 'service', wide: [470, 0], tall: [350, 0], tip: 'Triggers checkpoints, collects acknowledgements, and restarts tasks from the last completed checkpoint after a failure.' },
      { id: 'ingest', label: 'Flink source', sub: 'timestamps + watermarks', kind: 'compute', wide: [470, 110], tall: [210, 105], tip: 'Reads Kafka partitions, extracts event time, and emits watermarks (max seen − bounded out-of-orderness).' },
      { id: 'ckpt', label: 'Checkpoint store', sub: 'S3 · state snapshots', kind: 'store', wide: [850, 0], tall: [350, 105], tip: 'Durable copies of operator state plus source offsets. Recovery reloads from here.' },
      { id: 'win', label: 'Keyed windows', sub: 'keyBy → window → agg', kind: 'compute', wide: [660, 110], tall: [210, 210], tip: 'Each key\'s window aggregates live here. A window fires when the watermark passes its end.' },
      { id: 'state', label: 'State backend', sub: 'RocksDB · local SSD', kind: 'cache', wide: [660, 0], tall: [350, 210], tip: 'Where keyed state lives: JVM heap objects (HashMap backend) or RocksDB on local disk.' },
      { id: 'late', label: 'Late side output', sub: 'too-late events', kind: 'queue', wide: [470, 220], tall: [70, 210], tip: 'Events behind watermark + allowed lateness are not dropped silently. They go to a side topic for a batch fix-up.' },
      { id: 'out', label: 'Results topic', sub: 'Kafka txn (2PC)', kind: 'queue', wide: [850, 110], tall: [210, 315], tip: 'The sink writes in a Kafka transaction committed only when the checkpoint completes, so consumers with read_committed see each result once.' },
      { id: 'alert', label: 'Alerting', sub: 'threshold rules', kind: 'service', wide: [660, 220], tall: [70, 420], tip: 'Consumes window results and fires on rules such as error rate > 2% for 3 windows.' },
      { id: 'ch', label: 'ClickHouse', sub: 'MergeTree · rollups', kind: 'store', wide: [850, 220], tall: [210, 420], tip: 'Columnar, sorted by ORDER BY key, with sparse primary index. Background merges compact many small inserted parts.' },
      { id: 'dash', label: 'Dashboards', sub: 'Grafana · SQL', kind: 'client', wide: [850, 330], tall: [210, 525], tip: 'Queries re-aggregate on read, because merges (and dedup) happen eventually.' }
    ],
    edges: [
      { from: 'src', to: 'kfk' },
      { from: 'kfk', to: 'ingest' },
      { from: 'jm', to: 'ingest', dashed: true, label: 'barrier' },
      { from: 'ingest', to: 'win' },
      { from: 'win', to: 'state', bidi: true },
      { from: 'state', to: 'ckpt', bidi: true },
      { from: 'ckpt', to: 'jm', dashed: true, bend: 0.25 },
      { from: 'win', to: 'late' },
      { from: 'win', to: 'out' },
      { from: 'out', to: 'alert' },
      { from: 'out', to: 'ch' },
      { from: 'ch', to: 'dash' }
    ]
  },

  scenarios: [
    {
      id: 'fire', title: 'Events in order → window fires', tone: 'info',
      steps: [
        { text: 'Apps send page-view events stamped with their own <b>event time</b>. Kafka partitions by <code>page_id</code>, so each key\'s events stay in order within a partition.', flow: ['src>kfk'] },
        { text: 'The Flink source reads each partition and emits a <b>watermark</b> = max event time seen − 5 s. It means "nothing older than this should still arrive".', flow: ['kfk>ingest'], badges: { ingest: 'WM = max − 5 s' } },
        { text: '<code>keyBy(page)</code> routes every key to one subtask. Each event bumps the counter for window <b>[12:00, 12:01)</b> in keyed state.', flow: ['ingest>win', 'win>state'], badges: { state: 'count=1,204' } },
        { text: 'The watermark crosses <b>12:01:00</b>. The window <b>fires</b> and emits <code>(page, 12:00, 1204)</code>. Its state stays until end + allowed lateness, then a timer clears it.', flow: ['ingest>win', 'win>out'], badges: { win: ['fired', 'ok'] }, tone: 'ok' },
        { text: 'The result goes to ClickHouse and alerting. Dashboards read the per-minute rollup with sub-second queries.', flow: [['out>ch', 'out>alert'], 'ch>dash'], tone: 'ok' }
      ]
    },
    {
      id: 'late', title: 'Late event: inside vs beyond lateness', tone: 'warn',
      steps: [
        { text: 'A phone was offline. Its event from <b>12:00:50</b> arrives when the watermark is already <b>12:01:20</b>, so the 12:00 window has already fired.', flow: ['src>kfk', 'kfk>ingest'], badges: { ingest: ['late 30 s', 'warn'] }, tone: 'warn' },
        { text: 'Allowed lateness is 2 min, so the window state still exists. The count is updated and the window <b>re-fires</b> with the corrected total (1205).', flow: ['ingest>win', 'win>state', 'win>out'], badges: { win: ['re-fire', 'warn'] } },
        { text: 'Downstream must treat results as <b>upserts</b>: ReplacingMergeTree keeps the newest <code>fired_at</code> per (page, window). A plain SUM would double count.', flow: ['out>ch'], badges: { ch: 'replace v2' }, tone: 'ok' },
        { text: 'An event <b>older than watermark − lateness</b> finds its window already purged. It goes to the <b>late side output</b>, and a batch job reconciles it later.', flow: ['ingest>win', 'win>late'], err: ['late'], badges: { late: ['+1 too late', 'err'] }, tone: 'err' }
      ]
    },
    {
      id: 'checkpoint', title: 'Checkpoint: barrier snapshot', tone: 'ok',
      steps: [
        { text: 'Every 60 s the JobManager triggers checkpoint <b>n</b>. Sources record their Kafka offsets and inject <b>barrier n</b> into the stream.', flow: ['jm>ingest'], badges: { ingest: 'offsets@n' } },
        { text: 'The barrier flows <b>with</b> the data. An operator with several inputs <b>aligns</b>: it buffers inputs whose barrier came early until barrier n has arrived on all of them.', flow: ['ingest>win'], badges: { win: 'align n' } },
        { text: 'The operator snapshots its state <b>asynchronously</b> and keeps processing. With RocksDB, only new SST files are uploaded (<b>incremental</b>).', flow: ['win>state', 'state>ckpt'], badges: { ckpt: '+38 MB' } },
        { text: 'All tasks acknowledge, so the JobManager marks checkpoint n <b>complete</b>. The transactional sink now commits the Kafka transaction holding the results since n−1.', flow: ['ckpt>jm', 'win>out'], badges: { out: ['commit', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'crash', title: 'TaskManager crash → restore', tone: 'err',
      steps: [
        { text: 'The machine running the window operator dies mid-window. Its local RocksDB state is gone.', nodes: ['win', 'state'], err: ['win', 'state'], badges: { win: ['lost', 'err'] }, tone: 'err' },
        { text: 'The JobManager notices the missed heartbeats and restarts the affected tasks from the <b>last completed checkpoint n</b>. State is downloaded from S3.', flow: ['ckpt>state', 'state>win'], warn: ['win'], badges: { state: ['restore n', 'warn'] }, tone: 'warn' },
        { text: 'Sources <b>rewind</b> to the Kafka offsets stored in checkpoint n and replay. Events after n are processed a second time.', flow: ['kfk>ingest', 'ingest>win'], badges: { kfk: 'seek offsets@n' } },
        { text: 'The un-committed Kafka transaction from before the crash is <b>aborted</b>, so read_committed consumers never see those results. Replayed results commit once: <b>exactly-once</b> end to end.', flow: ['win>out', 'out>ch'], ok: ['out', 'ch'], badges: { out: ['abort → redo', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'hot', title: 'Hot key: one page goes viral', tone: 'warn',
      steps: [
        { text: 'One page suddenly gets 40% of all traffic. <code>keyBy</code> sends all of it to <b>one subtask</b>.', flow: ['src>kfk', 'kfk>ingest', 'ingest>win'], warn: ['win'], badges: { win: ['1 hot subtask', 'warn'] }, tone: 'warn' },
        { text: '<b>Backpressure</b> spreads upstream. Sources slow down, Kafka consumer lag grows, and checkpoint barriers queue behind buffered data.', nodes: ['ingest', 'kfk', 'jm'], warn: ['kfk', 'ingest'], badges: { kfk: ['lag ↑', 'warn'], jm: ['ckpt slow', 'warn'] } },
        { text: 'Fix with <b>two-phase aggregation</b>: pre-aggregate locally (or salt the key into <code>page#0..15</code>), then merge the 16 partial counts per window.', nodes: ['win'], ok: ['win'], badges: { win: ['salted ×16', 'ok'] }, tone: 'ok' },
        { text: '<b>Unaligned checkpoints</b> let barriers overtake buffered data, so checkpoints still finish under backpressure. To scale out, restart from a <b>savepoint</b> with more parallelism, up to max parallelism.', flow: ['jm>ingest', 'win>state', 'state>ckpt'], tone: 'ok' },
        { text: 'On the ClickHouse side, insert in <b>large batches</b> (e.g. once per second per shard). Many tiny inserts create too many parts for background merges to keep up with.', flow: ['out>ch'], badges: { ch: 'batch inserts' }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Model: a Flink job counting events per key, with 50M active keys (<em>illustrative</em>). Event delay is modelled as 93% "normal" (mean 1.5 s) and 7% "was offline" (mean 45 s). Watch latency, completeness and state pull against each other.',
    controls: [
      { id: 'window', label: 'Window type', type: 'seg', value: 'tumble', options: [
        { v: 'tumble', l: 'Tumbling 1 min' }, { v: 'slide', l: 'Sliding 1 min / 10 s' }, { v: 'session', l: 'Session (5 min gap)' }] },
      { id: 'wm', label: 'Watermark lag (bounded out-of-orderness)', type: 'range', min: 0, max: 60, step: 1, value: 5, unit: 's' },
      { id: 'lateness', label: 'Allowed lateness', type: 'range', min: 0, max: 600, step: 10, value: 120, unit: 's' },
      { id: 'guarantee', label: 'Delivery guarantee', type: 'seg', value: 'exactly', options: [
        { v: 'atleast', l: 'At-least-once' }, { v: 'exactly', l: 'Exactly-once (2PC sink)' }] },
      { id: 'backend', label: 'State backend', type: 'seg', value: 'rocks', options: [
        { v: 'heap', l: 'HashMap (JVM heap)' }, { v: 'rocks', l: 'RocksDB (local SSD)' }] }
    ],
    evaluate(s) {
      const KEYS = 5e7, AGG = 64, HEAP_BUDGET = 64e9, CKPT = 30;
      const pLate = (t) => 0.93 * Math.exp(-t / 1.5) + 0.07 * Math.exp(-t / 45);
      const onTime = 1 - pLate(s.wm);
      const dropped = pLate(s.wm + s.lateness);
      const size = s.window === 'slide' ? 10 : 60;
      const copies = s.window === 'session' ? 1 + (s.wm + s.lateness) / 300 : Math.ceil((60 + s.wm + s.lateness) / size);
      const stateB = KEYS * AGG * copies;
      const heapNeed = stateB * 3; // Java object overhead, estimate
      const heapBad = s.backend === 'heap' && heapNeed > HEAP_BUDGET;
      const firstAt = s.window === 'session' ? 300 : 0;
      const lat = firstAt + s.wm + (s.guarantee === 'exactly' ? CKPT / 2 : 0);
      const ckptUpload = s.backend === 'rocks' ? stateB * 0.2 : stateB;
      const clamp01 = (x) => Math.max(0, Math.min(1, x));
      const pct = (x) => (x * 100 < 0.01 ? '<0.01' : (x * 100).toFixed(x < 0.1 ? 2 : 1)) + '%';
      const metrics = [
        { k: 'Result latency', v: (s.window === 'session' ? 'gap 5 min + ' : 'window end + ') + s.wm + ' s' + (s.guarantee === 'exactly' ? ' + ≤30 s commit' : ''), s: clamp01(1 - lat / 360), hint: '≈ ' + Math.round(lat) + ' s avg' },
        { k: 'On time at first fire', v: pct(onTime), s: clamp01((onTime - 0.6) / 0.4) },
        { k: 'Dropped as too late', v: pct(dropped), s: clamp01(1 - dropped * 20), hint: 'to side output' },
        { k: 'Window state', v: SD.fmt.bytes(s.backend === 'heap' ? heapNeed : stateB) + (s.backend === 'heap' ? ' heap' : ' on SSD'), s: heapBad ? 0.1 : clamp01(1 - stateB / 4e11), hint: heapBad ? 'exceeds heap' : copies.toFixed(1) + ' windows/key' },
        { k: 'Duplicates after crash', v: s.guarantee === 'exactly' ? 'none (txn aborted)' : 'replayed since last ckpt', s: s.guarantee === 'exactly' ? 0.95 : 0.35 },
        { k: 'Checkpoint upload', v: SD.fmt.bytes(ckptUpload) + (s.backend === 'rocks' ? ' (incremental)' : ' (full)'), s: clamp01(1 - ckptUpload / 3e10) },
        { k: 'Throughput per core', v: s.backend === 'heap' ? 'highest (no serde)' : '≈ ½ of heap (serde + SSD)', s: s.backend === 'heap' ? 0.9 : 0.55, hint: 'illustrative' }
      ];
      const notes = [];
      if (s.wm === 0) notes.push('With <b>zero lag</b> the watermark equals the newest timestamp seen. Any event that is even slightly out of order counts as late.');
      if (s.wm > 20) notes.push('A long watermark lag delays <b>every</b> result to wait for a few stragglers. Allowed lateness plus re-firing is usually the cheaper way to catch them.');
      if (s.lateness > 0) notes.push('Allowed lateness of ' + s.lateness + ' s means windows <b>re-fire</b>. The sink must upsert (ReplacingMergeTree / keyed upsert), not append and sum.');
      else notes.push('No allowed lateness: state is freed as soon as the window fires, and anything late goes to the side output.');
      if (s.window === 'slide') notes.push('Each event lands in <b>6 overlapping windows</b>, so state and output grow 6×. Flink stores sliding windows per pane, so prefer incremental aggregates.');
      if (s.window === 'session') notes.push('Session windows <b>merge</b> as events arrive. Results only appear after 5 min of inactivity, which suits user-journey metrics but not live dashboards.');
      if (s.guarantee === 'exactly') notes.push('The Kafka transaction timeout must exceed checkpoint interval + restart time. Otherwise the broker aborts the transaction and data is lost.');
      if (heapBad) notes.push('The HashMap backend keeps deserialized Java objects on the heap. At about 3× the raw size this misses the heap budget, causing GC pauses and then OOM.');
      let verdict;
      if (heapBad) verdict = '❌ <b>State does not fit the JVM heap.</b> Switch to RocksDB, which spills to local SSD and checkpoints incrementally, or shrink lateness and window overlap.';
      else if (s.wm === 0) verdict = '⚠ <b>Too aggressive.</b> With no watermark lag the first results are fast but most windows fire incomplete and then keep re-firing.';
      else if (dropped > 0.01) verdict = '⚠ <b>' + pct(dropped) + ' of events miss their window.</b> Raise allowed lateness or reconcile the side output in batch.';
      else if (s.guarantee === 'atleast') verdict = '👍 Fast and simple, but a crash replays and <b>re-emits</b> results. That is fine for dashboards if the sink is idempotent (upsert by key and window).';
      else if (s.window === 'tumble' && s.backend === 'rocks' && s.wm <= 15) verdict = '✅ <b>Solid production default:</b> tumbling event-time windows, a small watermark lag, a couple of minutes of lateness, RocksDB state and a transactional sink.';
      else verdict = '👍 Workable. Check the meters to see which side of the latency / completeness / state triangle you are paying for.';
      return {
        metrics, verdict, notes,
        labels: {
          win: { label: { tumble: 'Tumbling 1 min', slide: 'Sliding 1m / 10s', session: 'Session windows' }[s.window], sub: 'WM −' + s.wm + ' s · late ' + s.lateness + ' s' },
          state: s.backend === 'rocks' ? { label: 'RocksDB backend', sub: 'local SSD · incremental' } : { label: 'HashMap backend', sub: 'objects on JVM heap' },
          out: { label: 'Results topic', sub: s.guarantee === 'exactly' ? 'Kafka txn (2PC)' : 'at-least-once' },
          ckpt: { label: 'Checkpoint store', sub: s.backend === 'rocks' ? 'incremental SSTs' : 'full snapshot' }
        },
        err: heapBad ? ['state'] : [],
        warn: dropped > 0.01 ? ['late'] : [],
        badges: { state: [SD.fmt.bytes(s.backend === 'heap' ? heapNeed : stateB), heapBad ? 'err' : 'info'], late: [pct(dropped), dropped > 0.01 ? 'warn' : 'info'] },
        flow: ['src>kfk', 'kfk>ingest', 'ingest>win', ['win>state', 'win>out', 'win>late'], 'out>ch', 'ch>dash']
      };
    }
  },

  widget: {
    title: 'Event time vs processing time: watermarks and late data',
    caption: 'Events (dots) land in their <b>event-time</b> window column as they arrive. The <b>watermark</b> line trails the newest event by the lag. When it passes a window\'s end, the window fires. <b>Tap or drag on the chart</b> to inject an event with an old timestamp, and see whether it is accepted, re-fires a window, or is dropped.'
  },

  realWorld: {
    intro: 'The ideas came from Google\'s internal streaming systems. Flink made them practical in open source, and columnar stores like ClickHouse became the serving layer.',
    timeline: [
      { when: '2013', who: 'Google', title: 'MillWheel: low watermarks', text: 'MillWheel tracks a <b>low watermark</b> per computation: the oldest timestamp of any unfinished work at or upstream of it. Timers can fire on it. Updates are checkpointed per key and records are delivered exactly once.', src: 0 },
      { when: '2014', who: 'Jay Kreps (LinkedIn/Confluent)', title: '"Questioning the Lambda Architecture"', text: 'Argues against running the same logic twice (batch + speed layer). Keep an immutable log and <b>reprocess by replaying it</b> through the same streaming job. This became known as the <b>Kappa</b> architecture.', src: 1 },
      { when: '2015', who: 'Google', title: 'The Dataflow Model (VLDB)', text: 'Separates <b>what</b> is computed, <b>where</b> in event time (windows), <b>when</b> in processing time (triggers and watermarks), and <b>how</b> refinements relate. It treats completeness, latency and cost as explicit trade-offs.', src: 2 },
      { when: '2015', who: 'Apache Flink', title: 'Asynchronous Barrier Snapshotting', text: 'A variant of Chandy-Lamport. Barriers flow with the data, and on acyclic graphs <b>only operator state is persisted</b>, with no in-flight record logging. This is the basis of Flink checkpoints.', src: 3 },
      { when: '2017', who: 'Apache Flink 1.3', title: 'Incremental RocksDB checkpoints', text: 'For large state, each checkpoint uploads only the changes since the last completed checkpoint. It is available only with the RocksDB backend.', src: 4 },
      { when: '2017–18', who: 'Apache Flink 1.4', title: 'End-to-end exactly-once', text: '<code>TwoPhaseCommitSinkFunction</code> ties a sink transaction to checkpoints. Writes between two checkpoints form one transaction, committed only when the checkpoint completes. Kafka 0.11+ transactions were the first user.', src: 5 },
      { when: '2018', who: 'Cloudflare', title: 'HTTP analytics on ClickHouse', text: 'Replaced a Citus/Postgres pipeline with ClickHouse to keep up with about <b>6M requests/s</b>. Uses aggregated <b>SummingMergeTree / AggregatingMergeTree</b> tables rather than storing every raw request.', src: 6 },
      { when: '2021', who: 'Uber', title: 'Log analytics moved from ELK to ClickHouse', text: 'A schema-agnostic layer on ClickHouse ingests <b>millions of logs/s</b> and stores several PB. It replaced 20+ Elasticsearch clusters per region.', src: 7 }
    ],
    lessons: [
      '<span>Window by <b>event time</b>. Processing time gives different answers every time you replay.</span>',
      '<span>Make the trade-off explicit: <b>watermark lag</b> buys completeness, <b>allowed lateness</b> buys corrections, and both cost latency or state.</span>',
      '<span>Exactly-once is a <b>pipeline</b> property: replayable source + consistent snapshots + transactional or idempotent sink.</span>',
      '<span>Serve from a <b>columnar store</b> sorted by your filter keys. Insert in batches and let merges do the rest.</span>'
    ],
    sources: [
      { title: 'MillWheel: Fault-Tolerant Stream Processing at Internet Scale', url: 'https://research.google/pubs/pub41378/', pub: 'Google Research, VLDB 2013' },
      { title: 'Lambda architecture questions (coverage of Kreps, "Questioning the Lambda Architecture")', url: 'https://www.infoq.com/news/2014/09/lambda-architecture-questions', pub: 'InfoQ, 2014' },
      { title: 'The Dataflow Model: balancing correctness, latency, and cost in massive-scale, unbounded, out-of-order data processing', url: 'https://research.google/pubs/the-dataflow-model-a-practical-approach-to-balancing-correctness-latency-and-cost-in-massive-scale-unbounded-out-of-order-data-processing/', pub: 'Google Research, VLDB 2015' },
      { title: 'Lightweight Asynchronous Snapshots for Distributed Dataflows', url: 'https://arxiv.org/abs/1506.08603', pub: 'Carbone et al., arXiv 2015' },
      { title: 'Large State in Apache Flink: An Intro to Incremental Checkpointing', url: 'https://ververica.com/blog/managing-large-state-apache-flink-incremental-checkpointing-overview', pub: 'Ververica' },
      { title: 'An Overview of End-to-End Exactly-Once Processing in Apache Flink (with Apache Kafka, too!)', url: 'https://flink.apache.org/2018/02/28/an-overview-of-end-to-end-exactly-once-processing-in-apache-flink-with-apache-kafka-too/', pub: 'Apache Flink blog, 2018' },
      { title: 'HTTP Analytics for 6M requests per second using ClickHouse', url: 'https://blog.cloudflare.com/http-analytics-for-6m-requests-per-second-using-clickhouse/', pub: 'Cloudflare, 2018' },
      { title: 'Fast and Reliable Schema-Agnostic Log Analytics Platform', url: 'https://www.uber.com/blog/logging/', pub: 'Uber Engineering, 2021' },
      { title: 'MergeTree table engine', url: 'https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree', pub: 'ClickHouse docs' },
      { title: 'State Backends', url: 'https://nightlies.apache.org/flink/flink-docs-master/docs/ops/state/state_backends/', pub: 'Apache Flink docs' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Time domain', '<b>Processing time</b>: simple, lowest latency', '<b>Event time + watermarks</b>: correct on replay and with late data', 'Event time for anything that is billed, alerted on or compared over time'],
      ['Watermark lag', '<b>Small (1–5 s)</b>: fresh results', '<b>Large (30 s+)</b>: more complete first answer', 'Small lag + allowed lateness + upserts, unless consumers cannot handle corrections'],
      ['Guarantee', '<b>At-least-once</b>: lower latency, no transactions', '<b>Exactly-once</b>: 2PC sink, results visible on checkpoint', 'Exactly-once for money and alerts; at-least-once + idempotent upsert for dashboards'],
      ['State backend', '<b>HashMap (heap)</b>: fastest access', '<b>RocksDB</b>: state ≫ RAM, incremental checkpoints', 'RocksDB once state reaches GBs or windows are long'],
      ['Where to aggregate', '<b>In Flink</b>: small output, bounded state', '<b>In ClickHouse</b> (raw + materialized views): flexible queries', 'Pre-aggregate known dashboards; keep raw for ad-hoc questions while affordable'],
      ['Architecture', '<b>Lambda</b>: batch + speed layers', '<b>Kappa</b>: one streaming job, replay the log to recompute', 'Kappa unless the batch logic genuinely differs or the log cannot hold history']
    ]
  },
  failures: [
    { f: 'TaskManager crash', detect: 'Missed heartbeats at the JobManager', fix: 'Restart from the last completed checkpoint, rewind Kafka offsets, and abort open sink transactions.' },
    { f: 'Watermark stuck (idle partition)', detect: 'Windows stop firing; watermark-lag metric climbs', fix: '<code>withIdleness()</code> so idle splits stop holding the watermark back; alert on watermark age.' },
    { f: 'Checkpoints time out under backpressure', detect: 'Checkpoint duration ≈ timeout, alignment time high', fix: 'Unaligned checkpoints, fix the hot operator, raise parallelism from a savepoint.' },
    { f: 'State grows without bound', detect: 'RocksDB size and checkpoint size trend upward', fix: 'State TTL, bounded allowed lateness, avoid global windows; audit key cardinality.' },
    { f: 'Exactly-once sink loses data', detect: 'Gaps after a long restart; "transaction expired" errors', fix: 'Kafka transaction timeout > checkpoint interval + max downtime (and ≤ broker max).' },
    { f: 'ClickHouse "too many parts"', detect: 'Insert errors / delayed inserts, part count per partition', fix: 'Fewer, bigger inserts (batch ≥ ~1 s or many thousand rows), async inserts, sane PARTITION BY.' },
    { f: 'Hot key skew', detect: 'One subtask at 100% busy, others idle', fix: 'Local pre-aggregation or key salting, then merge partials.' }
  ],

  interview: [
    { q: 'Event time vs processing time: why does it matter?', a: '<p><b>Event time</b> is when the thing happened, as stamped by the producer. <b>Processing time</b> is when your operator sees it.</p><p>Windowing by processing time is simple, but results change with lag, outages and replays. Event time gives the same answer for the same data, which is what you want for billing, alerting and backfills.</p>', lvl: 'core' },
    { q: 'What is a watermark, and how is it generated?', a: '<p>A watermark is a timestamp <i>W</i> flowing in the stream that asserts "no more events with time ≤ W are expected". Windows ending ≤ W can fire.</p><p>The usual generator is <b>bounded out-of-orderness</b>: W = max event time seen − lag. Each parallel source emits its own watermark and downstream takes the <b>minimum</b> across inputs. That is why one idle partition can stall everything.</p>', fu: 'What happens when one Kafka partition gets no data?', lvl: 'core' },
    { q: 'What happens to events that arrive after the watermark?', a: '<ul><li>Within <b>allowed lateness</b>: window state still exists, so the window re-fires with an updated result. Downstream must handle upserts.</li><li>Beyond it: the state was purged, so the event is dropped, or better, sent to a <b>side output</b> for batch reconciliation.</li></ul>', lvl: 'core' },
    { q: 'How does Flink achieve exactly-once end-to-end?', a: '<p>Three parts:</p><ol><li>A <b>replayable source</b> (Kafka offsets stored in the checkpoint).</li><li><b>Consistent snapshots</b> of operator state via checkpoint barriers.</li><li>A <b>transactional sink</b> using two-phase commit: pre-commit on the barrier, commit when the checkpoint completes, abort on restore.</li></ol><p>"Exactly-once" means <i>effects</i> happen once. Records may still be processed more than once internally.</p>', fu: 'What if the sink is a database without transactions? (Idempotent upsert by key + window.)', lvl: 'core' },
    { q: 'Explain checkpoint barriers and alignment.', a: '<p>The coordinator injects barrier <i>n</i> at the sources. An operator with several inputs waits until barrier <i>n</i> has arrived on all inputs, buffering the early ones (<b>alignment</b>), then snapshots its state and forwards the barrier.</p><p>Under heavy backpressure alignment is slow. <b>Unaligned checkpoints</b> let barriers overtake buffered data and store those in-flight buffers as part of the snapshot.</p>', lvl: 'deep' },
    { q: 'Tumbling vs sliding vs session windows?', a: '<ul><li><b>Tumbling</b>: fixed, non-overlapping (per-minute counts).</li><li><b>Sliding</b>: fixed size, overlapping (5-min average every 10 s). Each event belongs to size/slide windows, which costs more state.</li><li><b>Session</b>: gap-based and per key, merging as events arrive (user sessions). Results come only after the gap.</li></ul>', lvl: 'core' },
    { q: 'How do you keep state size under control?', a: '<p>Use incremental aggregates (not full event lists), bounded allowed lateness, <b>state TTL</b> for keyed state that is not window state, and approximate structures such as <b>HyperLogLog</b> for distinct counts.</p><p>Move large state to <b>RocksDB</b> with incremental checkpoints, and watch key cardinality: a new high-cardinality key multiplies everything.</p>', lvl: 'deep' },
    { q: 'Lambda vs Kappa architecture?', a: '<p><b>Lambda</b> runs a batch layer (accurate, slow) and a speed layer (approximate, fast), then merges them. You maintain two implementations of the same logic.</p><p><b>Kappa</b> keeps one streaming job. To recompute, replay the immutable log through a new version of the job and switch over. Event-time semantics make the replay give the same result.</p>', lvl: 'core' },
    { q: 'Why ClickHouse (or another columnar store) for serving?', a: '<p>Analytics queries read a few columns over many rows. Columnar storage with compression, a <b>sparse primary index</b> on the sort key, and vectorized execution scans billions of rows per second.</p><p>MergeTree writes each insert as an immutable sorted <b>part</b> and merges parts in the background. That makes writes cheap, but dedup and summing are only <i>eventual</i>: always aggregate at query time.</p>', fu: 'Why are many small inserts bad?', lvl: 'core' },
    { q: 'A hot key overloads one subtask. What do you do?', a: '<p><b>Two-phase aggregation</b>: pre-aggregate before the shuffle (local combine), or salt the key (<code>key#rand(16)</code>), aggregate per salted key, then merge the partials by the real key.</p><p>This works for associative aggregates (count, sum, HLL), not for order-dependent logic.</p>', lvl: 'deep' },
    { q: 'How do you deploy a new version of a stateful job?', a: '<p>Take a <b>savepoint</b> (a portable, user-triggered snapshot), stop the job, and start the new jar from the savepoint. Keep operator <code>uid</code>s stable so state maps to the right operators.</p><p>You can change parallelism up to the configured <b>max parallelism</b> (the number of key groups).</p>', lvl: 'deep' },
    { q: 'How would you count distinct users per minute at scale?', a: '<p>Exact distinct needs a set per window, so memory grows with users. Use a <b>HyperLogLog</b> sketch per key and window: a few KB, about 1% error, and <b>mergeable</b>. Hourly uniques are then a merge of minute sketches. In ClickHouse, store <code>uniqCombinedState(user_id)</code> in an AggregatingMergeTree and read it with <code>uniqCombinedMerge</code>.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Flink: windows + exactly-once', lang: 'java',
      code: `// Flink 1.19+/2.x DataStream API + flink-connector-kafka
StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
env.enableCheckpointing(60_000, CheckpointingMode.EXACTLY_ONCE);   // barrier every 60 s

KafkaSource<PageView> source = KafkaSource.<PageView>builder()
    .setBootstrapServers("kafka:9092").setTopics("page-views").setGroupId("pv-1m")
    .setValueOnlyDeserializer(new PageViewSchema())
    .build();

WatermarkStrategy<PageView> wm = WatermarkStrategy
    .<PageView>forBoundedOutOfOrderness(Duration.ofSeconds(5))      // WM = max ts - 5 s
    .withTimestampAssigner((e, ts) -> e.eventTimeMillis())
    .withIdleness(Duration.ofMinutes(1));                           // idle partitions can't stall WM

OutputTag<PageView> tooLate = new OutputTag<PageView>("too-late") {};

SingleOutputStreamOperator<PageCount> counts = env
    .fromSource(source, wm, "page-views")
    .keyBy(PageView::pageId)
    .window(TumblingEventTimeWindows.of(Duration.ofMinutes(1)))
    .allowedLateness(Duration.ofMinutes(2))      // late events re-fire the window
    .sideOutputLateData(tooLate)                 // later than that: side output
    .aggregate(new CountAgg(), new EmitWithWindow());  // incremental count + window start

KafkaSink<PageCount> sink = KafkaSink.<PageCount>builder()
    .setBootstrapServers("kafka:9092")
    .setRecordSerializer(KafkaRecordSerializationSchema.builder()
        .setTopic("page-counts-1m").setValueSerializationSchema(new PageCountSchema()).build())
    .setDeliveryGuarantee(DeliveryGuarantee.EXACTLY_ONCE)          // Kafka txn per checkpoint
    .setTransactionalIdPrefix("pv-1m")
    .setProperty("transaction.timeout.ms", "900000")              // > ckpt interval + restart
    .build();

counts.sinkTo(sink);
counts.getSideOutput(tooLate).sinkTo(lateSink);
env.execute("page-views-per-minute");`,
      note: 'Consumers of <code>page-counts-1m</code> must use <code>isolation.level=read_committed</code>. Otherwise they also see aborted transactions.'
    },
    {
      title: 'ClickHouse: MergeTree DDL', lang: 'sql',
      code: `-- raw events: sorted by the columns you filter on, TTL for retention
CREATE TABLE page_views
(
    event_time DateTime64(3),
    page_id    UInt64,
    user_id    UInt64,
    country    LowCardinality(String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(event_time)
ORDER BY (page_id, event_time)
TTL toDateTime(event_time) + INTERVAL 30 DAY;

-- per-minute results from Flink; a re-fired window carries a newer fired_at
CREATE TABLE page_views_1m
(
    page_id      UInt64,
    window_start DateTime,
    views        UInt64,
    fired_at     DateTime64(3)
)
ENGINE = ReplacingMergeTree(fired_at)      -- keeps the newest version per ORDER BY key
PARTITION BY toYYYYMM(window_start)
ORDER BY (page_id, window_start);

-- merges are eventual, so collapse versions at read time
SELECT window_start, views
FROM page_views_1m FINAL
WHERE page_id = 42 AND window_start >= now() - INTERVAL 1 HOUR
ORDER BY window_start;`,
      note: 'Do not use SummingMergeTree for re-fired windows. Each re-fire carries the <i>full</i> count, so summing double counts. Summing is correct only when the stream emits deltas.'
    }
  ],

  related: ['message-queue', 'ad-click-aggregation', 'top-k', 'observability', 'search-engine']
});
