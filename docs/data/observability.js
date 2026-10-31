SD.register({
  slug: 'observability',
  domain: 7,
  title: 'Log Aggregation & Observability',
  examples: 'Datadog, ELK, Dapper',
  tagline: 'Collect logs, metrics and traces from thousands of hosts, keep the useful parts searchable within seconds, and avoid a <b>telemetry bill bigger than the production bill</b>.',
  tldr: {
    problem: 'Every service emits logs, metrics and spans, often more bytes than the business data itself. You must ingest bursts without hurting the app, query within seconds during an incident, and keep cost and cardinality bounded.',
    idea: 'A lightweight <b>agent</b> per host buffers and ships to a <b>collector tier</b>, then to <b>Kafka</b>, then to three purpose-built stores: a <b>TSDB</b> for metrics (Gorilla-style compression), a <b>log store</b> (inverted index or labels + compressed chunks), and a <b>trace store</b> keyed by trace id. Shared trace ids link the three.',
    insight: 'The cost driver is <b>cardinality and volume</b>, not machines. Sample traces (keep errors and slow ones), keep labels low-cardinality, index less, and tier old data to object storage.',
    numbers: [
      { v: '1.37 B', l: 'per time-series point with Gorilla compression vs 16 B raw (Facebook, VLDB 2015)' },
      { v: '1/1024', l: 'trace sampling rate in Dapper\'s first production version (Google, 2010)' },
      { v: '6.6B', l: 'time series stored in Uber\'s M3 (2018 blog)' }
    ]
  },

  intro: {
    what: 'An observability platform collects the signals that running software gives off: <b>logs</b> (text records of events), <b>metrics</b> (numbers over time) and <b>traces</b> (the path of one request through many services). It stores them centrally and makes them searchable, so engineers can see whether systems are healthy, get alerted when they are not, and find out why.',
    analogy: {
      icon: '✈️',
      title: 'Flight recorders plus a control tower',
      text: 'Every plane records its readings in a black box, and the control tower watches gauges for all planes at once. Metrics are the tower\'s gauges, logs are the black-box records, and a trace follows one passenger through every gate. The big difference: a software fleet produces so much data that you must choose what to keep, or the recorders cost more than the planes.'
    },
    problem: 'A checkout service starts failing for some users at 3 am. It runs on hundreds of servers, each writing thousands of log lines a minute, and the failing request passed through six other services. Without a central system, an engineer has to log into machines one by one, and the evidence may already be gone. The question is: <b>how do you collect everything from thousands of machines, find the one bad request in seconds, and not go broke storing it all?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Log files on each server, read by hand',
        text: 'Every service writes logs to its own disk. When something breaks, an engineer connects to each machine over SSH and searches the files with <code>grep</code>. With three servers, this works.',
        scene: {
          nodes: [
            { id: 's1', label: 'Server 1', sub: 'app.log', kind: 'service', at: [70, 0] },
            { id: 's2', label: 'Server 2', sub: 'app.log', kind: 'service', at: [210, 0] },
            { id: 's3', label: 'Server 3', sub: 'app.log', kind: 'service', at: [350, 0] },
            { id: 'eng', label: 'Engineer', sub: 'ssh + grep', kind: 'client', at: [210, 110] }
          ],
          edges: [{ from: 'eng', to: 's1', bidi: true }, { from: 'eng', to: 's2', bidi: true }, { from: 'eng', to: 's3', bidi: true }],
          flow: ['eng>s1', 'eng>s2', 'eng>s3']
        }
      },
      {
        stage: 'breaks',
        title: 'Thousands of machines, and the clues are scattered',
        text: 'Now there are thousands of short-lived containers. A container\'s logs <b>vanish when it is replaced</b>, one request crosses six services, and nobody notices a problem until users complain. Searching machine by machine takes hours in the middle of an outage.',
        scene: {
          nodes: [
            { id: 's1', label: 'Pods ×2000', sub: 'logs on local disk', kind: 'service', at: [70, 0] },
            { id: 's2', label: 'Replaced pod', sub: 'logs deleted', kind: 'service', at: [210, 0] },
            { id: 's3', label: 'Checkout', sub: 'failing', kind: 'service', at: [350, 0] },
            { id: 'eng', label: 'Engineer', sub: 'hours of grep', kind: 'client', at: [210, 110] }
          ],
          edges: [{ from: 'eng', to: 's1', bidi: true }, { from: 'eng', to: 's2', bidi: true }, { from: 'eng', to: 's3', bidi: true }],
          flow: ['eng>s1', 'eng>s2', 'eng>s3'],
          err: ['s2'],
          warn: ['s3', 'eng'],
          badges: { s2: ['logs lost', 'err'], eng: ['3 am ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Ship everything to purpose-built stores',
        text: 'A small <b>agent</b> on each host ships logs, metrics and traces to a collector tier, which buffers them (often in Kafka) and writes each kind to a store built for it. Every log line and span carries a shared <b>trace id</b>, so one click jumps from a spike on a chart to the exact failing request. Traces are <b>sampled</b> to keep the bill down.',
        scene: {
          nodes: [
            { id: 's1', label: 'Services', sub: 'emit telemetry', kind: 'service', at: [70, 0] },
            { id: 'agent', label: 'Node agents', sub: 'buffer + ship', kind: 'edge', at: [210, 0] },
            { id: 'coll', label: 'Collectors', sub: 'batch · sample', kind: 'service', at: [350, 0] },
            { id: 'tsdb', label: 'Metrics DB', sub: 'numbers by time', kind: 'store', at: [70, 110] },
            { id: 'logs', label: 'Log store', sub: 'searchable text', kind: 'store', at: [210, 110] },
            { id: 'traces', label: 'Trace store', sub: 'by trace id', kind: 'store', at: [350, 110] },
            { id: 'eng', label: 'Dashboards', sub: 'alerts + search', kind: 'client', at: [210, 220] }
          ],
          edges: [{ from: 's1', to: 'agent' }, { from: 'agent', to: 'coll' }, { from: 'coll', to: 'tsdb' }, { from: 'coll', to: 'logs' }, { from: 'coll', to: 'traces' }, { from: 'tsdb', to: 'eng' }, { from: 'logs', to: 'eng' }, { from: 'traces', to: 'eng' }],
          flow: ['s1>agent', 'agent>coll', ['coll>tsdb', 'coll>logs', 'coll>traces'], ['tsdb>eng', 'logs>eng', 'traces>eng']],
          ok: ['eng'],
          badges: { eng: ['root cause ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['Datadog', 'Grafana (Prometheus, Loki, Tempo)', 'Elastic (ELK stack)', 'Splunk', 'New Relic', 'Google Dapper'],
    whenToUse: [
      'You run <b>many services or machines</b> and need one place to see them all',
      'Someone must be alerted when users are affected, not hours later',
      'A request crosses several services and you need to see where the time went'
    ],
    whenNot: [
      'One app on one server: its log file plus a simple uptime check may be enough',
      'You want business numbers such as revenue per region (see <a href="stream-analytics.html">Stream Analytics</a>)',
      'You need full-text search over product or document data (see <a href="search-engine.html">Search Engine</a>)'
    ],
    glossary: [
      { term: 'Log', def: 'A timestamped text record of one event, such as "card declined for order 42".' },
      { term: 'Metric', def: 'A number measured over time, such as requests per second or memory in use.' },
      { term: 'Trace / span', def: 'A trace is the path of one request across services. Each step in it is a span, with a start time and a duration.' },
      { term: 'Agent', def: 'A small program on each host that collects telemetry and ships it onward, buffering when the network is slow.' },
      { term: 'TSDB', def: 'Time-series database: a store built for numbers indexed by time.' },
      { term: 'Cardinality', def: 'How many distinct label combinations a metric has. Each one is a separate series that costs memory.' },
      { term: 'Sampling', def: 'Keeping only some traces. Tail sampling decides after a request finishes, so errors and slow requests are always kept.' },
      { term: 'Hot / cold tier', def: 'Recent data on fast, expensive storage; older data moved to cheap object storage.' }
    ]
  },

  requirements: {
    functional: [
      'Ship logs, metrics and traces from every host and container',
      'Search logs by labels, text and trace id',
      'Dashboards and PromQL-style queries on metrics',
      'Trace waterfall per request across services',
      'Alert rules with routing, grouping and silencing',
      'Retention tiers: hot (fast) → cold (cheap)'
    ],
    nonFunctional: [
      'Agent overhead ≲ 1–2% CPU; never block the app',
      'Data searchable within seconds of being emitted',
      'Survive bursts (incidents produce 10× more logs)',
      'Bounded cardinality per tenant',
      'Observability must stay up when production is down',
      'Cost grows sub-linearly with traffic (sampling, tiering)'
    ],
    outOfScope: ['APM code profiling', 'Security SIEM rules', 'Business analytics (see Stream Analytics)', 'Incident management workflow']
  },

  calculator: {
    inputs: [
      { id: 'hosts', label: 'Hosts / pods', min: 10, max: 100000, value: 2000, log: true },
      { id: 'lps', label: 'Log lines per second per host', min: 1, max: 5000, value: 200, log: true },
      { id: 'lb', label: 'Bytes per log line', min: 100, max: 2000, step: 50, value: 300, fmt: 'bytes' },
      { id: 'series', label: 'Active metric series per host', min: 100, max: 100000, value: 2000, log: true },
      { id: 'scrape', label: 'Scrape / push interval', min: 5, max: 60, step: 5, value: 15, unit: 's' },
      { id: 'ret', label: 'Log retention', min: 1, max: 90, value: 15, unit: 'days' }
    ],
    outputs: [
      { label: 'Log ingest bandwidth', fmt: 'bytesps', f: (v) => v.hosts * v.lps * v.lb },
      { label: 'Raw logs per day', fmt: 'bytes', f: (v) => v.hosts * v.lps * v.lb * 86400 },
      { label: 'Log storage for retention (≈10× compression)', fmt: 'bytes', f: (v) => v.hosts * v.lps * v.lb * 86400 * v.ret / 10 },
      { label: 'Active metric series', f: (v) => v.hosts * v.series },
      { label: 'Metric samples per second', f: (v) => v.hosts * v.series / v.scrape },
      { label: 'TSDB bytes per day at 1.37 B/sample', fmt: 'bytes', f: (v) => (v.hosts * v.series / v.scrape) * 86400 * 1.37 }
    ],
    note: '1.37 bytes per sample is Gorilla\'s reported average for Facebook\'s data. Noisy floats compress far worse. 10× log compression is an <em>estimate</em> for repetitive text. Notice that metrics are cheap per sample, but <b>each series costs memory</b> in the TSDB head block (the in-memory window of recent samples), so series count, not samples, is what breaks clusters.'
  },

  api: [
    { m: 'POST', p: '/v1/traces · /v1/metrics · /v1/logs', d: 'OTLP (OpenTelemetry Protocol) over HTTP on port 4318, or gRPC on 4317, into the collector. Batched and protobuf-encoded, with retry and back-off on 429/503.' },
    { m: 'GET', p: '/api/v1/query_range?query=…', d: 'Prometheus-style query API, e.g. <code>sum by (svc) (rate(errors_total[5m]))</code>.' },
    { m: 'GET', p: '/loki/api/v1/query_range?query=…', d: 'LogQL: a label selector picks the streams, then a filter scans the chunks: <code>{app="checkout"} |= "trace_id=4bf9…"</code>.' },
    { m: 'GET', p: '/api/traces/{traceId}', d: 'Fetch every span of one trace for the waterfall view.' },
    { m: 'POST', p: '/alerts (webhook)', d: 'Alert manager → pager / chat, after grouping, inhibition and silences.' }
  ],
  dataModel: [
    { name: 'span', store: 'Trace store', fields: [['trace_id', '128-bit', 'pk'], ['span_id', '64-bit', 'sk'], ['parent_span_id', '64-bit'], ['service, name', 'string', 'idx'], ['start, duration', 'ts, µs'], ['status, attributes', 'map']], note: 'Looked up by trace_id. Search by attributes needs a separate index or columnar scan.' },
    { name: 'series', store: 'TSDB', fields: [['series_id', 'hash(name+labels)', 'pk'], ['labels', 'sorted k=v set', 'idx'], ['chunk', 'Gorilla-encoded (t, v)'], ['block', '2 h, then compacted']], note: 'One series per unique label set. An inverted index maps label → series ids.' },
    { name: 'log_stream', store: 'Log store', fields: [['stream labels', '{app, env, pod}', 'pk'], ['ts', 'ns', 'sk'], ['line', 'text / json'], ['trace_id', 'string', 'idx']], note: 'Loki indexes only the stream labels. Elasticsearch indexes every token.' },
    { name: 'alert_rule', store: 'Config (git)', fields: [['name', 'string', 'pk'], ['expr', 'PromQL'], ['for', 'duration'], ['severity, route', 'labels']] }
  ],

  architecture: {
    title: 'Observability pipeline',
    nodes: [
      { id: 'app', label: 'Services', sub: 'OTel SDK · Micrometer', kind: 'client', wide: [90, 0], tall: [70, 0], tip: 'Emit structured logs (with trace_id), metrics and spans. Telemetry calls must never block request threads.' },
      { id: 'agent', label: 'Node agent', sub: 'OTel/Fluent Bit · buffer', kind: 'edge', wide: [280, 0], tall: [210, 0], tip: 'One per host. Tails files, scrapes metrics, adds host/k8s labels, and buffers to disk when downstream is slow.' },
      { id: 'coll', label: 'Collector tier', sub: 'batch · tail sampling', kind: 'service', wide: [470, 0], tall: [350, 0], tip: 'Stateless gateways: batching, compression, rate limits, PII redaction. For tail sampling, all spans of a trace must reach the same collector.' },
      { id: 'kfk', label: 'Kafka', sub: 'logs · metrics · spans', kind: 'queue', wide: [660, 0], tall: [350, 105], tip: 'Absorbs bursts and decouples ingestion from storage, so a slow store does not push back on hosts.' },
      { id: 'proc', label: 'Processors', sub: 'parse · enrich · route', kind: 'compute', wide: [660, 110], tall: [210, 105], tip: 'Parse JSON/logfmt, extract fields, drop noisy lines, compute log-derived metrics, route by tenant.' },
      { id: 'traces', label: 'Trace store', sub: 'by trace_id', kind: 'store', wide: [470, 220], tall: [350, 210], tip: 'Spans grouped by trace id (Tempo/Jaeger style), often on object storage with a small index.' },
      { id: 'tsdb', label: 'Metrics TSDB', sub: 'Gorilla-compressed', kind: 'store', wide: [660, 220], tall: [210, 210], tip: 'Series held in memory for recent data (head block), compressed with delta-of-delta + XOR, then flushed to blocks.' },
      { id: 'logs', label: 'Log store', sub: 'index + chunks', kind: 'store', wide: [850, 220], tall: [70, 210], tip: 'Either an inverted index over every token (ELK) or an index on labels only plus compressed chunks (Loki) or columnar (ClickHouse).' },
      { id: 'query', label: 'Query layer', sub: 'PromQL · LogQL · SQL', kind: 'service', wide: [660, 330], tall: [210, 315], tip: 'Fans out to stores, merges results, and caches. Links metrics → traces (exemplars) → logs (trace_id).' },
      { id: 'obj', label: 'Object storage', sub: 'cold tier · S3', kind: 'store', wide: [850, 330], tall: [70, 315], tip: 'Old chunks and blocks move here: cheaper by an order of magnitude, slower to query.' },
      { id: 'alert', label: 'Alert manager', sub: 'rules · group · route', kind: 'service', wide: [470, 440], tall: [350, 420], tip: 'Evaluates rules on a schedule, deduplicates and groups firing alerts, and routes them to on-call.' },
      { id: 'ui', label: 'Dashboards', sub: 'Grafana · on-call', kind: 'client', wide: [280, 330], tall: [70, 420], tip: 'Humans: dashboards, explore, and the pager.' }
    ],
    edges: [
      { from: 'app', to: 'agent' },
      { from: 'agent', to: 'coll' },
      { from: 'coll', to: 'kfk' },
      { from: 'kfk', to: 'proc' },
      { from: 'proc', to: 'traces' },
      { from: 'proc', to: 'tsdb' },
      { from: 'proc', to: 'logs' },
      { from: 'logs', to: 'obj', label: 'tier' },
      { from: 'traces', to: 'query' },
      { from: 'tsdb', to: 'query' },
      { from: 'logs', to: 'query' },
      { from: 'obj', to: 'query', dashed: true },
      { from: 'query', to: 'alert' },
      { from: 'alert', to: 'ui' },
      { from: 'query', to: 'ui', bidi: true }
    ]
  },

  scenarios: [
    {
      id: 'logline', title: 'A log line\'s journey', tone: 'info',
      steps: [
        { text: 'Checkout logs <code>{"level":"ERROR","msg":"card declined","trace_id":"4bf9…"}</code> to stdout. The logger is <b>asynchronous</b>, so a slow disk never blocks the request.', flow: ['app>agent'] },
        { text: 'The node agent tails the file, adds <code>pod</code>, <code>namespace</code> and <code>node</code> labels, and buffers to local disk. It batches and compresses before sending.', flow: ['agent>coll'], badges: { agent: 'batch 1 MB' } },
        { text: 'The collector redacts card numbers, applies per-tenant rate limits and writes to Kafka. Kafka absorbs bursts so the stores ingest at their own pace.', flow: ['coll>kfk', 'kfk>proc'] },
        { text: 'Processors parse the JSON, promote <code>level</code> and <code>app</code> to labels, keep <code>trace_id</code> as a field and append to the log store. It is searchable within seconds.', flow: ['proc>logs'], badges: { logs: 'searchable' }, tone: 'ok' },
        { text: 'After the hot window (e.g. 7 days) chunks move to <b>object storage</b>. Queries still work, just slower and cheaper.', flow: ['logs>obj'], badges: { obj: 'day 8+' } }
      ]
    },
    {
      id: 'storm', title: 'Log storm → backpressure → drop policy', tone: 'warn',
      steps: [
        { text: 'A dependency fails and every request logs a 4 KB stack trace. Log volume jumps <b>20×</b> within a minute.', flow: [['app>agent', 'app>agent'], 'agent>coll'], warn: ['agent'], badges: { app: ['20× logs', 'warn'] }, tone: 'warn' },
        { text: 'Kafka absorbs the burst. Processors fall behind and <b>consumer lag</b> grows, so search freshness drops from seconds to minutes.', flow: ['coll>kfk', 'kfk>proc'], warn: ['kfk', 'proc'], badges: { kfk: ['lag 6 min', 'warn'] } },
        { text: 'Collectors hit their per-tenant limit and return 429. Agents <b>buffer to disk</b> and back off. The app is never blocked.', nodes: ['coll', 'agent'], warn: ['coll'], badges: { agent: ['disk buffer 72%', 'warn'] } },
        { text: 'When the buffer is nearly full, the <b>drop policy</b> applies: DEBUG/INFO go first, repeated identical lines are sampled, and ERROR is kept. Every drop is counted in a metric.', nodes: ['agent'], ok: ['agent'], badges: { agent: ['drop DEBUG', 'ok'] }, tone: 'ok' },
        { text: 'Metrics and traces travel on separate topics and quotas, so <b>alerting keeps working</b> while logs catch up.', flow: ['proc>tsdb', 'tsdb>query', 'query>alert'], ok: ['alert'], tone: 'ok' }
      ]
    },
    {
      id: 'trace', title: 'Trace stitched across services', tone: 'ok',
      steps: [
        { text: 'The edge starts a trace and passes <code>traceparent: 00-4bf9…-00f0…-01</code> (W3C) on every downstream call. Each service creates child spans.', nodes: ['app'], badges: { app: '6 services' } },
        { text: 'Spans flow through agents to the collector tier. A <b>load-balancing exporter</b> routes by <code>trace_id</code>, so one collector sees the whole trace.', flow: ['app>agent', 'agent>coll'], badges: { coll: 'hash(trace_id)' } },
        { text: '<b>Tail sampling</b> waits ~30 s for the trace to finish, then keeps it if any span errored or it was slow, plus 1% of the rest.', nodes: ['coll'], badges: { coll: ['keep: error', 'ok'] } },
        { text: 'Kept spans land in the trace store, which is keyed by trace id. Storage is about 3% of the unsampled volume.', flow: ['coll>kfk', 'kfk>proc', 'proc>traces'], tone: 'ok' },
        { text: 'On-call clicks a latency spike. An <b>exemplar</b> (a sample trace id stored with a histogram bucket) links to this trace, and its <code>trace_id</code> pulls the matching log lines.', flow: ['ui>query', ['traces>query', 'logs>query'], 'query>ui'], tone: 'ok' }
      ]
    },
    {
      id: 'alert', title: 'Alert fires', tone: 'info',
      steps: [
        { text: 'Every 15 s, request counters per (service, status) are collected and appended to the TSDB. Each sample costs about <b>1–2 bytes</b> after compression.', flow: ['app>agent', 'agent>coll', 'coll>kfk', 'kfk>proc', 'proc>tsdb'] },
        { text: 'The rule <code>5xx ratio &gt; 2% for 5m</code> is evaluated every 30 s via the query layer. <code>for: 5m</code> filters out blips.', flow: ['tsdb>query', 'query>alert'], badges: { alert: 'pending → firing' } },
        { text: 'The alert manager <b>groups</b> 40 pod-level alerts into one page, applies inhibition (no pages for downstream symptoms) and routes to the checkout on-call.', flow: ['alert>ui'], badges: { ui: ['1 page', 'warn'] }, tone: 'warn' },
        { text: 'The engineer drills down: dashboard → exemplar trace → logs with the same trace_id. The root cause is a slow card provider.', flow: ['ui>query', ['tsdb>query', 'traces>query', 'logs>query'], 'query>ui'], tone: 'ok' }
      ]
    },
    {
      id: 'cardinality', title: 'Cardinality explosion', tone: 'err',
      steps: [
        { text: 'A developer adds <code>user_id</code> as a tag on a latency histogram: 14 series (12 buckets + sum + count) × 50 endpoints × 1M users.', nodes: ['app'], warn: ['app'], badges: { app: ['+user_id tag', 'warn'] }, tone: 'warn' },
        { text: 'The TSDB creates a series per unique label set: <b>700M new series</b>. Each one needs index entries and an in-memory head chunk.', flow: ['proc>tsdb'], err: ['tsdb'], badges: { tsdb: ['700M series', 'err'] }, tone: 'err' },
        { text: 'Ingesters run out of memory and crash-loop. Queries time out and <b>alerting goes blind</b> at the worst moment.', flow: ['tsdb>query', 'query>alert'], err: ['tsdb', 'alert'], badges: { alert: ['no data', 'err'] }, tone: 'err' },
        { text: 'Fix: a <b>per-tenant series limit</b> rejects new series, the collector drops the label (relabel rule), and per-user detail goes to <b>traces/logs</b>, which handle high cardinality.', nodes: ['coll', 'tsdb'], ok: ['coll', 'tsdb'], badges: { coll: ['drop user_id', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Model: 50K req/s, 20 spans per request (500 B each), 1% errors, 20 TB/day of raw logs, 30-day retention. Prices and per-series memory are <em>estimates</em>, meant for comparing options.',
    controls: [
      { id: 'sampling', label: 'Trace sampling', type: 'seg', value: 'tail', options: [
        { v: 'none', l: 'Keep all' }, { v: 'head10', l: 'Head 10%' }, { v: 'head1', l: 'Head 1%' }, { v: 'tail', l: 'Tail: errors + slow + 1%' }] },
      { id: 'card', label: 'Values of the busiest metric label', type: 'range', min: 1, max: 6, step: 1, value: 2, fmt: (v) => '10^' + v + ' (' + SD.fmt.num(Math.pow(10, v)) + ')' },
      { id: 'logidx', label: 'Log indexing', type: 'seg', value: 'labels', options: [
        { v: 'full', l: 'Full-text index (ELK)' }, { v: 'labels', l: 'Labels only (Loki)' }, { v: 'columnar', l: 'Columnar (ClickHouse)' }] },
      { id: 'tier', label: 'Retention tiers (30 days total)', type: 'seg', value: 'hot7', options: [
        { v: 'hot3', l: '3 d hot + S3' }, { v: 'hot7', l: '7 d hot + S3' }, { v: 'hot30', l: '30 d all hot' }] }
    ],
    evaluate(s) {
      const RAW_TRACE_DAY = 50e3 * 20 * 500 * 86400; // 43.2 TB/day unsampled
      const keep = { none: 1, head10: 0.1, head1: 0.01, tail: 0.03 }[s.sampling];
      const errKept = { none: 1, head10: 0.1, head1: 0.01, tail: 1 }[s.sampling];
      const traceDay = RAW_TRACE_DAY * keep;
      const buffer = s.sampling === 'tail' ? 500e6 * 30 : 50e6; // 500 MB/s × 30 s decision wait
      const vals = Math.pow(10, s.card);
      const series = 2e5 + 50 * 14 * vals;
      const tsdbMem = series * 4e3; // ~4 KB per active series incl. index (estimate)
      const LOG_RAW = 20e12;
      const logDay = { full: LOG_RAW * 1.0, labels: LOG_RAW / 10, columnar: LOG_RAW / 8 }[s.logidx];
      const hotDays = { hot3: 3, hot7: 7, hot30: 30 }[s.tier];
      const dayStored = logDay + traceDay / 5;
      const cost = (dayStored * hotDays * 0.2 + dayStored * (30 - hotDays) * 0.023) / 1e9; // $/GB-month hot 0.20, S3 0.023 (estimates)
      const clamp01 = (x) => Math.max(0, Math.min(1, x));
      const needle = { full: ['≈ 1 s (token index)', 0.9], labels: ['10 s – minutes (scan chunks)', 0.35], columnar: ['seconds (skip indexes + scan)', 0.65] }[s.logidx];
      const metrics = [
        { k: 'Trace data / day', v: SD.fmt.bytes(traceDay), s: clamp01(1 - Math.log10(traceDay / 1e11) / 2.7) },
        { k: 'Error traces kept', v: (errKept * 100) + '%', s: errKept, hint: errKept < 1 ? 'random loss' : 'all kept' },
        { k: 'Collector buffer', v: SD.fmt.bytes(buffer) + (s.sampling === 'tail' ? ' (30 s of spans)' : ' (batches)'), s: s.sampling === 'tail' ? 0.55 : 0.9 },
        { k: 'Active series', v: SD.fmt.num(series), s: clamp01(1 - Math.log10(series / 2e5) / 3.5) },
        { k: 'TSDB memory', v: SD.fmt.bytes(tsdbMem), s: clamp01(1 - Math.log10(tsdbMem / 1e9) / 3) },
        { k: 'Find one request id', v: needle[0], s: needle[1] },
        { k: 'Storage bill (30 d)', v: '≈ $' + SD.fmt.num(cost) + ' / month', s: clamp01(1 - Math.log10(cost / 5e3) / 2.2), hint: 'estimate' }
      ];
      const notes = [];
      if (s.sampling === 'tail') notes.push('Tail sampling needs <b>all spans of a trace on one collector</b> (load-balance by trace_id) and RAM for ~30 s of spans. It keeps 100% of errors at ~3% of the volume.');
      if (s.sampling === 'head1' || s.sampling === 'head10') notes.push('Head sampling decides at the root span, before anyone knows if the request will fail. Rare errors are mostly <b>thrown away</b>.');
      if (s.sampling === 'none') notes.push('Keeping every span stores ' + SD.fmt.bytes(traceDay) + '/day. Almost nobody looks at 99% of successful traces.');
      if (s.card >= 4) notes.push('Each label value multiplies series. ' + SD.fmt.num(vals) + ' values × 50 endpoints × 14 histogram series = <b>' + SD.fmt.num(50 * 14 * vals) + '</b> series. Put ids in traces/logs, not metric labels.');
      if (s.logidx === 'full') notes.push('A full-text index makes needle searches instant, but the index is roughly as big as the data and indexing burns CPU on every line (<em>estimate</em>).');
      if (s.logidx === 'labels') notes.push('Loki-style: a tiny index on stream labels, with text filters applied at query time over compressed chunks. Cheap to ingest; broad searches scan a lot.');
      if (s.logidx === 'columnar') notes.push('Columnar logs (Uber moved from ELK to ClickHouse in 2021) compress well and aggregate fast. Map/array columns give schema-on-read for arbitrary fields.');
      if (s.tier === 'hot30') notes.push('Everything on hot SSD: fast but about 9× the per-GB price of object storage (<em>estimate</em>). Most queries touch the last few days.');
      let verdict;
      if (s.card >= 5) verdict = '❌ <b>Cardinality explosion:</b> ' + SD.fmt.num(series) + ' series need ~' + SD.fmt.bytes(tsdbMem) + ' of TSDB memory. Drop the label at the collector and enforce series limits.';
      else if (s.sampling === 'none') verdict = '⚠ <b>Storing every trace</b> is the biggest line on the bill and rarely helps. Use tail sampling.';
      else if (s.sampling === 'head1') verdict = '⚠ <b>Cheap, but blind to rare errors:</b> 99% of failing traces are dropped before anyone knows they failed.';
      else if (s.sampling === 'tail' && s.card <= 3 && s.logidx !== 'full' && s.tier !== 'hot30') verdict = '✅ <b>Modern default:</b> tail-sampled traces, bounded label cardinality, cheap log indexing and a short hot tier on top of object storage.';
      else if (s.card === 4) verdict = '⚠ <b>Series budget at risk:</b> ' + SD.fmt.num(series) + ' series already need ~' + SD.fmt.bytes(tsdbMem) + ' of TSDB memory, and any extra label multiplies that again. Cap the label at the collector.';
      else if (s.sampling === 'head10') verdict = '👍 <b>Head 10%:</b> traces are 10× cheaper than keeping all, but 90% of error traces are dropped at random. Tail sampling keeps them all for less.';
      else if (s.logidx === 'full') verdict = '👍 <b>Full-text index:</b> needle searches take about a second, but you pay for an index about as big as the logs. Worth it for search-heavy or security use.';
      else if (s.tier === 'hot30') verdict = '👍 <b>All hot:</b> every query is equally fast, but you pay hot-disk prices for weeks of data that are rarely read.';
      else verdict = '👍 Workable. Check the meters to see which bill (storage, memory or query time) you are paying.';
      return {
        metrics, verdict, notes,
        labels: {
          coll: { label: 'Collector tier', sub: { none: 'keep everything', head10: 'head-sampled at SDK', head1: 'head-sampled at SDK', tail: 'tail sampling · 30 s' }[s.sampling] },
          logs: { full: { label: 'Search index', sub: 'inverted index (ELK)' }, labels: { label: 'Log chunks', sub: 'label index only (Loki)' }, columnar: { label: 'Columnar logs', sub: 'ClickHouse-style' } }[s.logidx],
          obj: { label: 'Object storage', sub: s.tier === 'hot30' ? 'unused (all hot)' : 'after day ' + hotDays }
        },
        err: s.card >= 5 ? ['tsdb'] : [],
        warn: s.card === 4 ? ['tsdb'] : s.sampling === 'none' ? ['traces'] : [],
        hot: s.sampling === 'tail' ? ['coll'] : [],
        badges: { tsdb: [SD.fmt.num(series) + ' series', s.card >= 5 ? 'err' : s.card === 4 ? 'warn' : 'info'], traces: [SD.fmt.bytes(traceDay) + '/d', s.sampling === 'none' ? 'warn' : 'info'] },
        flow: ['app>agent', 'agent>coll', 'coll>kfk', 'kfk>proc', ['proc>traces', 'proc>tsdb', 'proc>logs']].concat(s.tier === 'hot30' ? [] : ['logs>obj'])
      };
    }
  },

  widget: {
    title: 'Gorilla compression and the cardinality multiplier',
    caption: 'Top: a real <b>Gorilla</b> encoder (delta-of-delta timestamps + XOR\'d float values) runs over a series, showing bits per point. Pick a series type to see why steady gauges compress to about 1–2 bytes and random floats do not. Bottom: toggle labels and watch the <b>series count</b> multiply.'
  },

  realWorld: {
    intro: 'The big observability systems are well documented. A pattern repeats: sample aggressively, compress cleverly, separate compute from storage.',
    timeline: [
      { when: '2010', who: 'Google', title: 'Dapper: tracing with sampling', text: 'Trace context propagated through RPCs, with low overhead as a design goal. The first production version sampled <b>1 in 1024</b> traces uniformly, which was enough for most analyses of high-throughput services. Adaptive sampling came later.', src: 0 },
      { when: '2015', who: 'Facebook', title: 'Gorilla in-memory TSDB', text: '<b>Delta-of-delta</b> timestamps and <b>XOR</b>\'d floating-point values brought storage to about <b>1.37 bytes per point</b>, from 16 bytes. That made it possible to keep recent monitoring data in RAM.', src: 1 },
      { when: '2018', who: 'Uber', title: 'M3 open-sourced', text: 'A horizontally scalable Prometheus backend (M3DB + coordinator) holding <b>over 6.6 billion time series</b>. It downsamples at ingest time to save space.', src: 2 },
      { when: '2020', who: 'Google', title: 'Monarch (VLDB)', text: 'Planet-scale, multi-tenant, in-memory TSDB in operation since 2010. Regional zones plus global query and config planes. It ingests <b>terabytes per second</b> and serves millions of queries.', src: 3 },
      { when: '2021', who: 'Uber', title: 'Logs: ELK → ClickHouse', text: 'Semi-structured logs with evolving schemas caused Elasticsearch type conflicts and dropped logs. A schema-agnostic ClickHouse layer now ingests <b>millions of logs/s</b> into several PB.', src: 4 },
      { when: '2022', who: 'Datadog', title: 'Husky event store', text: 'A third-generation store: <b>schemaless, columnar, on object storage</b>, with separate writers, readers and compactors fed from Kafka, so ingest, storage and query scale independently.', src: 5 },
      { when: '2022', who: 'OpenTelemetry', title: 'Tail sampling in the Collector', text: 'Sampling decisions after the trace completes (errors, latency, attributes). It needs all spans of a trace on the same collector instance, which the load-balancing exporter provides.', src: 6 },
      { when: 'Today', who: 'Grafana Loki', title: 'Index labels, not content', text: 'Only a small set of stream labels is indexed. Log lines are compressed into chunks on object storage, and content filters run at query time. Label choice decides both cost and speed. Since Loki 3.0, high-cardinality values such as trace ids can go in <b>structured metadata</b> instead of labels.', src: 7 }
    ],
    lessons: [
      '<span><b>Sample</b> traces by outcome (tail), not at random up front, and keep every error.</span>',
      '<span><b>Cardinality</b> is the TSDB\'s budget. Ids belong in traces and logs, not metric labels.</span>',
      '<span>Put <b>Kafka</b> between hosts and stores so storage hiccups never push back on applications.</span>',
      '<span><b>Separate compute from storage</b> (object storage + stateless readers), as Husky, Loki and Monarch\'s regional design do.</span>'
    ],
    sources: [
      { title: 'Dapper, a Large-Scale Distributed Systems Tracing Infrastructure', url: 'https://research.google/pubs/pub36356/', pub: 'Google Research, 2010' },
      { title: 'Gorilla: A Fast, Scalable, In-Memory Time Series Database', url: 'https://www.vldb.org/pvldb/vol8/p1816-teller.pdf', pub: 'PVLDB 8(12), 2015' },
      { title: 'M3: Uber\'s Open Source, Large-scale Metrics Platform for Prometheus', url: 'https://www.uber.com/blog/m3/', pub: 'Uber Engineering, 2018' },
      { title: 'Monarch: Google\'s Planet-Scale In-Memory Time Series Database', url: 'https://www.vldb.org/pvldb/vol13/p3181-adams.pdf', pub: 'PVLDB 13(12), 2020' },
      { title: 'Fast and Reliable Schema-Agnostic Log Analytics Platform', url: 'https://www.uber.com/blog/logging/', pub: 'Uber Engineering, 2021' },
      { title: 'Introducing Husky, Datadog\'s Third-Generation Event Store', url: 'https://www.datadoghq.com/blog/engineering/introducing-husky/', pub: 'Datadog Engineering, 2022' },
      { title: 'Tail Sampling with OpenTelemetry: Why it\'s useful, how to do it, and what to consider', url: 'https://opentelemetry.io/blog/2022/tail-sampling/', pub: 'OpenTelemetry blog, 2022' },
      { title: 'Grafana Loki documentation (overview: index labels, not log content)', url: 'https://grafana.com/docs/loki/latest/', pub: 'Grafana Labs docs (stable release)' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Trace sampling', '<b>Head</b>: decided at the root, zero buffering', '<b>Tail</b>: decided after completion, keeps errors and slow traces', 'Head for very high volume with uniform traffic; tail when rare failures matter (almost always)'],
      ['Log indexing', '<b>Full-text index</b>: instant needle search', '<b>Labels only / columnar</b>: cheap ingest, scan at query time', 'Full-text for security and search-heavy use; labels or columnar for high-volume app logs'],
      ['Metrics collection', '<b>Pull</b> (scrape): server controls rate, easy liveness', '<b>Push</b> (OTLP/StatsD): short jobs, behind NAT', 'Pull inside a cluster; push for serverless, batch jobs and edge'],
      ['Retention', '<b>All hot</b>: uniform speed', '<b>Hot + cold tier</b>: object storage for old data', 'Tier as soon as data is older than most incident investigations (days, not weeks)'],
      ['Counting things', '<b>Metrics</b>: cheap, pre-aggregated, low cardinality', '<b>Logs/events</b>: any dimension, expensive per event', 'Metrics for alerts and SLOs; events for debugging and high-cardinality questions'],
      ['Build vs buy', '<b>Self-host</b> (Prometheus/Loki/Tempo/ClickHouse)', '<b>SaaS</b> (Datadog etc.)', 'SaaS until the bill or data-residency rules justify a platform team']
    ]
  },
  failures: [
    { f: 'Cardinality explosion', detect: 'Series count per metric/tenant, ingester memory', fix: 'Per-tenant series limits, relabel/drop at the collector, high-cardinality ids to traces.' },
    { f: 'Log storm from an error loop', detect: 'Bytes/s per service jumps; Kafka lag', fix: 'Per-service quotas, agent drop policy (DEBUG first), dedupe repeated lines, rate-limited logger.' },
    { f: 'Tail-sampling collector OOM', detect: 'Collector memory, dropped spans counter', fix: 'memory_limiter processor, scale the collector tier, shorter decision_wait, LB by trace_id.' },
    { f: 'Agent hurts the host', detect: 'Agent CPU/memory vs app, noisy-neighbour latency', fix: 'Cgroup limits for the agent, cheaper parsing at the edge, move heavy parsing to processors.' },
    { f: 'Monitoring down with production', detect: 'Meta-monitoring from another region / provider', fix: 'Run observability on separate infrastructure; dead-man\'s-switch alert that must always fire.' },
    { f: 'Broken traces', detect: 'Orphan spans, missing parents', fix: 'Propagate W3C traceparent through every hop, including queues (message headers) and async executors.' },
    { f: 'Out-of-order or late samples rejected', detect: 'Ingest error counters (out-of-order / too-old samples), gaps on graphs from batch or edge producers', fix: 'Fix clock skew (NTP), give each producer its own series labels, or enable an out-of-order window (Prometheus 2.39+ <code>out_of_order_time_window</code>, off by default).' },
    { f: 'Alert storm / fatigue', detect: 'Pages per shift, % pages with no action', fix: 'Group and inhibit, alert on SLO burn rate (symptoms) instead of every cause.' }
  ],

  interview: [
    { q: 'Logs vs metrics vs traces: when do you use which?', a: '<ul><li><b>Metrics</b>: cheap numeric aggregates over time. Use for alerting, SLOs and dashboards. Low cardinality.</li><li><b>Logs</b>: discrete events with arbitrary detail. Use for debugging the "why". Expensive per byte.</li><li><b>Traces</b>: causal tree of one request across services. Use for latency breakdown and dependencies.</li></ul><p>Link them with shared <b>trace ids</b> and <b>exemplars</b>.</p>', lvl: 'core' },
    { q: 'What is high cardinality, and why does it hurt a TSDB?', a: '<p>Each unique combination of label values is a separate <b>series</b> with its own index entries and in-memory chunk. Labels multiply: 50 endpoints × 10 statuses × 1M user ids = 500M series.</p><p>Memory and index size scale with series, not samples. Keep ids out of metric labels; put them in traces and logs, which store per-event detail.</p>', fu: 'How would you enforce this across 300 teams?', lvl: 'core' },
    { q: 'Head-based vs tail-based sampling?', a: '<p><b>Head</b>: decide at the root span (e.g. keep 1%) and propagate the decision. Cheap and stateless, but blind: most error traces are dropped.</p><p><b>Tail</b>: buffer all spans until the trace completes (~30 s), then keep errors, slow traces and a baseline. It needs memory and <b>trace-id-affine routing</b> to collectors.</p>', lvl: 'core' },
    { q: 'How does Gorilla compress time series so well?', a: '<p><b>Timestamps</b>: store the delta-of-delta. Regular intervals give 0, encoded in <b>1 bit</b>.</p><p><b>Values</b>: XOR with the previous value. Identical values give 0 (1 bit). Similar values share sign, exponent and high mantissa bits, so only the "meaningful" middle bits are stored.</p><p>On Facebook\'s data the average was <b>1.37 bytes/point</b> vs 16 raw.</p>', lvl: 'deep' },
    { q: 'How does a Prometheus-style TSDB lay data out on disk?', a: '<p>New samples go to an in-memory <b>head block</b> and a <b>write-ahead log</b> (WAL) for crash recovery. Every ~2 hours the head is cut into an immutable <b>block</b>: compressed chunks plus an inverted index from label → series ids. Background <b>compaction</b> merges small blocks into larger ones and applies retention by deleting whole blocks.</p><p>Writes are cheap appends; memory scales with active series; long-range queries touch few, large blocks.</p>', fu: 'How would you keep a year of data cheaply? (downsample and ship blocks to object storage, as Thanos/Mimir/M3 do)', lvl: 'deep' },
    { q: 'How do you keep the agent from hurting the application?', a: '<p>Asynchronous, non-blocking loggers with bounded queues (drop rather than block). Run the agent in its own cgroup with CPU/memory limits. Batch and compress. Parse at the processor tier instead of the edge. Spill to a bounded disk buffer when downstream is slow.</p>', lvl: 'core' },
    { q: 'Index every log line or only labels?', a: '<p>A <b>full-text inverted index</b> gives instant needle searches, but the index can be as large as the data, and indexing costs CPU on every line.</p><p><b>Labels-only</b> (Loki) indexes a few stream labels and greps compressed chunks at query time: very cheap to ingest, slower for broad searches. <b>Columnar</b> (ClickHouse) sits in between and is excellent for aggregations.</p>', lvl: 'core' },
    { q: 'How do you cut retention cost?', a: '<p>Tier by age: hot SSD for days, then object storage (an order of magnitude cheaper). Downsample old metrics (5 m / 1 h rollups). Sample or drop DEBUG logs, and keep audit logs on a separate, longer policy. Charge teams for their volume.</p>', lvl: 'core' },
    { q: 'What happens during an incident log storm?', a: '<p>Kafka absorbs the burst, consumer lag grows, and collectors throttle per tenant. Agents buffer to disk, then apply a drop policy (DEBUG first, dedupe repeated lines). Metrics and traces use separate quotas so alerting keeps working.</p>', lvl: 'deep' },
    { q: 'Why can\'t you average p99 latencies across pods?', a: '<p>Percentiles are not additive. The average of per-pod p99s is not the global p99. Export <b>histograms</b> (bucket counters) and aggregate the buckets, then compute the quantile: <code>histogram_quantile(0.99, sum by (le) (rate(..._bucket[5m])))</code>.</p>', lvl: 'deep' },
    { q: 'Pull vs push metrics?', a: '<p><b>Pull</b> (Prometheus scrapes): the server controls the rate, a failed scrape signals that the target is down, and service discovery drives targets. <b>Push</b> (OTLP, StatsD): works for short-lived jobs and NAT\'d clients but needs back-pressure and auth on the receiver. Many stacks use both.</p>', lvl: 'core' },
    { q: 'How should you alert?', a: '<p>Alert on <b>symptoms</b> that users feel (error rate, latency SLO burn rate), not every cause. Use <code>for:</code> durations to avoid flapping, group related alerts, inhibit downstream noise, and make every page actionable with a runbook link.</p>', lvl: 'core' },
    { q: 'How do you monitor the monitoring system?', a: '<p>Run meta-monitoring on <b>independent infrastructure</b> (another region or provider). Add a <b>dead-man\'s switch</b>: an alert that always fires, so its absence pages someone. Track ingest lag, dropped-data counters and query latency as SLOs of the platform itself.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot: Micrometer + OTel', lang: 'yaml',
      code: `# Spring Boot 3.4/3.5 keys. Boot 4 renamed management.otlp.tracing.*
#   to management.opentelemetry.tracing.export.otlp.*
# deps: spring-boot-starter-actuator, micrometer-tracing-bridge-otel,
#       opentelemetry-exporter-otlp, micrometer-registry-otlp
management:
  tracing:
    sampling:
      probability: 1.0          # send everything; the collector tail-samples
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces
    metrics:
      export:
        url: http://otel-collector:4318/v1/metrics
        step: 15s
  metrics:
    distribution:
      percentiles-histogram:
        http.server.requests: true   # buckets, so p99 aggregates correctly
    tags:
      service: checkout             # low-cardinality common tags only
logging:
  structured:
    format:
      console: ecs                  # Boot 3.4+: JSON logs incl. traceId / spanId`,
      note: 'Add a cardinality guard bean: <code>MeterFilter.maximumAllowableTags(...)</code> capping <code>uri</code> at e.g. 200 values, with <code>MeterFilter.deny()</code> beyond that. In the Observation API, <code>highCardinalityKeyValue(...)</code> goes to spans only, never to metrics.'
    },
    {
      title: 'OTel Collector: tail sampling', lang: 'yaml',
      code: `receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }
processors:
  memory_limiter:                    # shed load before the collector OOMs
    check_interval: 1s
    limit_percentage: 80
    spike_limit_percentage: 20
  tail_sampling:
    decision_wait: 30s               # buffer spans until the trace is complete
    num_traces: 200000
    policies:                        # a trace is kept if ANY policy matches
      - name: errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow
        type: latency
        latency: { threshold_ms: 2000 }
      - name: baseline
        type: probabilistic
        probabilistic: { sampling_percentage: 1 }
  batch:
    send_batch_size: 8192
    timeout: 2s
exporters:
  otlp/traces:
    endpoint: tempo:4317
    tls: { insecure: true }
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, tail_sampling, batch]
      exporters: [otlp/traces]`,
      note: 'Run a first tier with the <code>loadbalancing</code> exporter (routing key = traceID) in front of this one, so every span of a trace reaches the same sampler.'
    }
  ],

  related: ['stream-analytics', 'search-engine', 'message-queue', 'api-gateway', 'object-storage']
});
