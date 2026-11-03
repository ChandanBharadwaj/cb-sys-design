SD.register({
  slug: 'event-ingestion',
  domain: 7,
  title: 'Event Ingestion Pipeline',
  examples: 'Netflix Keystone, Segment, LinkedIn',
  tagline: 'Collect <b>billions of events a day</b> from apps and services, check each one against a schema contract, and fan it out to every sink, without losing events or letting one slow sink stall the rest.',
  tldr: {
    problem: 'Millions of phones, browsers and servers emit clicks, plays and logs. Networks drop, clients retry, app versions disagree about the event format, and ten different systems want a copy.',
    idea: 'SDKs <b>batch and spool to disk</b>. Stateless <b>collectors</b> authenticate and write to a <b>durable log</b>. A validator checks each event against a <b>schema registry</b>, dedups by <code>event_id</code>, enriches it, and sends failures to a <b>dead-letter queue</b>. Then <b>one router per sink</b> delivers at its own pace.',
    insight: 'The log separates <i>accepted</i> from <i>delivered</i>. Once the log acks, the client can forget the event, and every sink can lag, fail or replay on its own. Delivery is at-least-once, so <b>every event carries an id</b> and sinks expect duplicates.',
    numbers: [
      { v: '500B/day', l: 'Netflix events by 2015, up from 45B/day in 2011 (VentureBeat, by a Netflix engineer)' },
      { v: '~0.6%', l: 'events Segment found to be duplicates within a 4-week window (2017)' },
      { v: '800B/day', l: 'messages through LinkedIn\'s Kafka, ~175 TB (2015)' }
    ]
  },

  intro: {
    what: 'An event ingestion pipeline is the front door for a company\'s data. Apps and services send it small records of <b>what just happened</b> ("user played a video", "payment failed"). It checks them, stores them safely, and hands a copy to every system that needs them: the data warehouse, search, fraud detection, marketing tools.',
    analogy: {
      icon: '📮',
      title: 'A postal sorting centre',
      text: 'Post boxes (the SDKs) collect letters and a van picks them up in batches. At the sorting centre, every letter is checked for a valid address format (the schema). Letters that can\'t be read go to the <b>dead-letter office</b>, which is where the term "dead-letter queue" comes from. Good letters are sorted into one bin per destination, so a closed post office in one town does not stop deliveries to the others. One difference: the post delivers each letter once, while this pipeline gives <b>a copy</b> to every destination.'
    },
    problem: 'A product team adds an "Add to cart" event. The app sends it straight to the warehouse and to the marketing tool. During the nightly load the warehouse is slow, so app requests time out and events are lost. A week later someone renames a field, and the revenue dashboard silently drops to zero. <b>How do you get every event from millions of clients into many systems, in a format everyone agrees on, even when parts are slow or broken?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Each app writes to each destination',
        text: 'The app calls the warehouse API and the search API directly for every event. It is simple and works for one app and two destinations.',
        scene: {
          nodes: [
            { id: 'app', label: 'App', sub: 'sends each event', kind: 'client', at: [210, 0] },
            { id: 'wh', label: 'Warehouse', sub: 'insert per event', kind: 'store', at: [70, 110] },
            { id: 'se', label: 'Search', sub: 'index per event', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'app', to: 'wh' }, { from: 'app', to: 'se' }],
          flow: [['app>wh', 'app>se']]
        }
      },
      {
        stage: 'breaks',
        title: 'One slow sink and one bad field break it',
        text: 'When the warehouse slows down, the app waits, retries and finally <b>drops events</b>. Retries that did succeed create <b>duplicates</b>. A renamed field passes straight through and corrupts reports, and nobody knows which app version sent it.',
        scene: {
          nodes: [
            { id: 'app', label: 'App ×1M', sub: 'retrying…', kind: 'client', at: [210, 0] },
            { id: 'wh', label: 'Warehouse', sub: 'slow load', kind: 'store', at: [70, 110] },
            { id: 'se', label: 'Search', sub: 'bad field', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'app', to: 'wh' }, { from: 'app', to: 'se' }],
          flow: [['app>wh', 'app>se'], 'app>wh'],
          err: ['wh'], warn: ['se', 'app'],
          badges: { wh: ['timeouts', 'err'], app: ['events lost', 'warn'], se: ['page = null', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Collect once, check once, deliver per sink',
        text: 'The app hands batches to a <b>collector</b>, which only has to write them to a <b>durable log</b>. A validator checks each event against the <b>registered schema</b> and sets bad ones aside. Each destination then reads the checked events <b>at its own speed</b>.',
        scene: {
          nodes: [
            { id: 'app', label: 'App SDK', sub: 'batch + spool', kind: 'client', at: [70, 0] },
            { id: 'col', label: 'Collector', sub: 'auth · ack', kind: 'service', at: [210, 0] },
            { id: 'log', label: 'Event log', sub: 'durable buffer', kind: 'queue', at: [350, 0] },
            { id: 'dlq', label: 'Dead letters', sub: 'bad events', kind: 'queue', at: [210, 110] },
            { id: 'val', label: 'Validator', sub: 'schema contract', kind: 'compute', at: [350, 110] },
            { id: 'wh', label: 'Warehouse', sub: 'own pace', kind: 'store', at: [210, 220] },
            { id: 'se', label: 'Search', sub: 'own pace', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'app', to: 'col' }, { from: 'col', to: 'log' }, { from: 'log', to: 'val' }, { from: 'val', to: 'dlq' }, { from: 'val', to: 'wh' }, { from: 'val', to: 'se' }],
          flow: ['app>col', 'col>log', 'log>val', ['val>wh', 'val>se', 'val>dlq']],
          ok: ['log', 'wh', 'se'],
          badges: { log: ['nothing lost', 'ok'], dlq: ['1 bad', 'warn'] }
        }
      }
    ],
    usedBy: ['Netflix (Keystone)', 'Segment (Twilio)', 'LinkedIn', 'Uber', 'Pinterest', 'Snowplow (open source)'],
    whenToUse: [
      'Many producers (apps, services, devices) and <b>many consumers</b> want the same events',
      'Losing or double-counting events costs money: billing, ads, experiments, compliance',
      'Several teams change event formats independently and need a <b>contract</b> between them'
    ],
    whenNot: [
      'One service hands work to another (commands, jobs): use a plain <a href="message-queue.html">Message Queue</a>',
      'You need windows, joins or aggregates over the stream: that is <a href="stream-analytics.html">Stream Analytics</a>, which reads from this pipeline',
      'Only operational metrics, logs and traces: an <a href="observability.html">Observability</a> agent pipeline fits better'
    ],
    glossary: [
      { term: 'Event', def: 'An immutable record that something happened, with an id, a type, a timestamp and properties.' },
      { term: 'SDK spool', def: 'A small on-device queue (often on disk) where events wait until a batch is sent and acknowledged.' },
      { term: 'Collector', def: 'A stateless HTTP endpoint that authenticates a batch and writes it to the log.' },
      { term: 'Schema registry', def: 'A service that stores every version of each event schema and rejects changes that would break readers.' },
      { term: 'Backward / forward compatible', def: 'Backward: new readers can read old data. Forward: old readers can read new data.' },
      { term: 'Dead-letter queue (DLQ)', def: 'A side queue for events that failed a check, kept with the reason so they can be fixed and replayed.' },
      { term: 'At-least-once', def: 'Every event is delivered, but some may arrive twice, so consumers dedup by event id.' },
      { term: 'Back-pressure', def: 'What a stage does when the next stage is slower: block, buffer, or drop.' }
    ]
  },

  requirements: {
    functional: [
      'Client and server SDKs send events in compressed batches (<code>track</code>, <code>identify</code>, <code>page</code>)',
      'Authenticate every source with a <b>write key</b>; per-source quotas',
      'Validate against a registered schema; failures go to a DLQ with the reason',
      'Dedup by <code>event_id</code>; enrich (geo-IP, user agent, server time); strip or hash PII',
      'Fan out to many sinks: lake/warehouse, search, real-time consumers, third-party APIs',
      'Replay a time range or a DLQ to one sink after a fix'
    ],
    nonFunctional: [
      'Peak ~1M events/s; collector ack p99 < 100 ms (our target)',
      'Once acked, never lost (replicated log); audited loss < 0.01%',
      'Real-time sinks within seconds, lake within minutes',
      'A slow or broken sink never delays the others',
      'Clients keep working through a region outage',
      'PII minimised at the edge; tenants isolated by quota'
    ],
    outOfScope: ['Kafka internals: partitions, ISR, consumer groups (see Message Queue)', 'Windows, watermarks, checkpoints (see Stream Analytics)', 'Table formats and compaction in the lake (see Data Lake)', 'Product-analytics dashboards']
  },

  calculator: {
    inputs: [
      { id: 'dau', label: 'Daily active devices + services', min: 100000, max: 500000000, value: 50000000, log: true },
      { id: 'epu', label: 'Events per device per day', min: 10, max: 2000, value: 200, log: true },
      { id: 'bytes', label: 'Average event size (JSON, uncompressed)', min: 200, max: 5000, step: 100, value: 1000, fmt: 'bytes' },
      { id: 'peak', label: 'Peak-to-average ratio', min: 1, max: 10, step: 0.5, value: 3, unit: '×' },
      { id: 'ratio', label: 'Compression ratio on batches', min: 2, max: 15, value: 6, unit: '×' },
      { id: 'sinks', label: 'Sinks reading the stream', min: 1, max: 20, value: 5 }
    ],
    outputs: [
      { label: 'Events per day', f: (v) => v.dau * v.epu },
      { label: 'Peak events / second', f: (v) => (v.dau * v.epu / 86400) * v.peak },
      { label: 'Peak ingress (compressed)', fmt: 'bytesps', f: (v) => (v.dau * v.epu / 86400) * v.peak * v.bytes / v.ratio },
      { label: 'Log storage per day (compressed, RF 3)', fmt: 'bytes', f: (v) => v.dau * v.epu * v.bytes / v.ratio * 3 },
      { label: 'Log read bandwidth at peak (all sinks)', fmt: 'bytesps', f: (v) => (v.dau * v.epu / 86400) * v.peak * v.bytes / v.ratio * v.sinks },
      { label: 'Collector instances at peak (~20K events/s each)', f: (v) => Math.ceil((v.dau * v.epu / 86400) * v.peak / 20000) }
    ],
    note: 'All inputs are <em>estimates</em>; 20K events/s per collector is an illustrative figure for a JSON-parsing JVM service, so measure your own. The default (50M devices × 200 events) is 10B events a day, about 116K/s on average. Notice that <b>read</b> bandwidth grows with the number of sinks: every sink reads the full stream, which is why routers often filter events before writing.'
  },

  api: [
    { m: 'POST', p: '/v1/batch', d: 'SDKs send <code>{batch:[{event_id, type, event, timestamp, properties}], sent_at}</code>, gzip-compressed, with the write key in an HTTP Basic header. The response is <b>200 only after the log has acked</b>. 429/503 come with <code>Retry-After</code>; 400 per bad batch.' },
    { m: 'POST', p: '/v1/track', d: 'One event, for low-volume server code. Same auth and same ack rule.' },
    { m: 'GET', p: '/subjects/{subject}/versions/latest', d: 'Schema registry (Confluent API): returns <code>{id, version, schema}</code>. Validators cache schemas by id.' },
    { m: 'POST', p: '/compatibility/subjects/{subject}/versions/latest', d: 'Checks a candidate schema in CI before merge: <code>{"is_compatible": false}</code> fails the build.' },
    { m: 'POST', p: '/subjects/{subject}/versions', d: 'Registers a new version. Returns <b>409</b> if it breaks the subject\'s compatibility mode.' },
    { m: 'POST', p: '/v1/replay', d: 'Our design: <code>{sink, from:"dlq"|"log", source_id, start, end}</code> re-runs events through validation into one sink only.' }
  ],
  dataModel: [
    { name: 'raw-events', store: 'Kafka topic', fields: [['key', 'anonymous_id / device id', 'pk'], ['value', 'event JSON as received'], ['headers', 'source_id, received_at, region'], ['partition', 'hash(key)']], note: 'Raw and untouched, so you can always re-validate. Keyed by device so one device\'s events stay in order.' },
    { name: 'events.<type>', store: 'Kafka topics (clean)', fields: [['key', 'user or device id', 'pk'], ['value', 'Avro: magic byte + schema id + body'], ['enriched', 'geo, ua, server_ts'], ['pii', 'hashed / dropped']], note: 'One topic per event family. Consumers fetch the writer schema by id from the registry.' },
    { name: 'dlq_events', store: 'Kafka topic + Postgres index', fields: [['id', 'bigserial', 'pk'], ['event_id', 'uuid', 'idx'], ['source_id', 'text', 'idx'], ['stage · reason', 'ingest | sink:&lt;name&gt; · text'], ['payload', 'jsonb'], ['replayed_at', 'timestamptz']] },
    { name: 'seen_events', store: 'Dedup store (RocksDB / Postgres)', fields: [['event_id', 'uuid', 'pk'], ['event_day', 'date', 'pk'], ['first_seen', 'timestamptz']], note: 'Window = how long keys are kept. Partition by day so old keys expire by dropping a partition.' }
  ],

  architecture: {
    title: 'Event ingestion pipeline',
    nodes: [
      { id: 'sdk', label: 'SDKs & agents', sub: 'batch · gzip · spool', kind: 'client', wide: [100, 60], tall: [70, 0], tip: 'Web, mobile and server SDKs plus log-tailing agents. They batch events, compress them, keep them on disk until acked, and retry with backoff and jitter.' },
      { id: 'col', label: 'Collectors', sub: 'behind GeoDNS + LB', kind: 'edge', wide: [380, 60], tall: [210, 0], tip: 'Stateless HTTP endpoints. They check the write key, size and basic shape, add received_at and source_id, write to the raw log and only then return 200. They scale horizontally.' },
      { id: 'raw', label: 'Raw event log', sub: 'Kafka · RF 3 · 7 d', kind: 'queue', wide: [660, 60], tall: [210, 110], tip: 'The durable buffer. Events are kept exactly as received for days, so any later stage can be fixed and re-run.' },
      { id: 'reg', label: 'Schema registry', sub: 'versions · compat', kind: 'store', wide: [470, 175], tall: [70, 110], tip: 'Every version of every event schema, with a compatibility mode per subject. Validators cache schemas by id.' },
      { id: 'enr', label: 'Validate & enrich', sub: 'schema · dedup · PII', kind: 'compute', wide: [660, 175], tall: [210, 220], tip: 'Checks each event against its schema, drops duplicates by event_id, adds geo and user-agent fields, and hashes or removes PII.' },
      { id: 'dlq', label: 'Dead-letter queue', sub: 'reason + payload', kind: 'queue', wide: [850, 175], tall: [70, 220], tip: 'Events that failed validation, each with the reason. After a fix they are replayed back through the validator.' },
      { id: 'audit', label: 'Audit & lag', sub: 'counts per tier', kind: 'compute', wide: [90, 290], tall: [350, 110], tip: 'Every tier reports event counts per source per time window. A job compares tiers and alerts on gaps (loss) and on lag.' },
      { id: 'clean', label: 'Clean topics', sub: 'per event type', kind: 'queue', wide: [660, 290], tall: [210, 330], tip: 'Validated, enriched events in a compact binary format, one topic per event family.' },
      { id: 'rt', label: 'Real-time apps', sub: 'fraud · personalise', kind: 'service', wide: [850, 290], tall: [70, 330], tip: 'Services and stream jobs that read the clean topics directly with their own consumer groups.' },
      { id: 'router', label: 'Sink routers', sub: 'one job per sink', kind: 'compute', wide: [470, 290], tall: [210, 440], tip: 'One consumer job per destination with its own offsets, batching, retries and DLQ. A slow sink only slows its own router.' },
      { id: 'lake', label: 'Lake / warehouse', sub: 'hourly files', kind: 'store', wide: [280, 400], tall: [350, 550], tip: 'Batched Parquet files or warehouse loads, partitioned by event date. See the Data Lake page for what happens next.' },
      { id: 'search', label: 'Search / OLAP', sub: 'seconds fresh', kind: 'store', wide: [470, 400], tall: [210, 550], tip: 'Elasticsearch or a columnar store for interactive queries.' },
      { id: 'tp', label: '3rd-party APIs', sub: 'rate-limited', kind: 'external', wide: [660, 400], tall: [70, 550], tip: 'Marketing, CRM and ad partners. Slow, rate-limited and sometimes down, so they need the most isolation.' }
    ],
    edges: [
      { from: 'sdk', to: 'col' },
      { from: 'col', to: 'raw' },
      { from: 'raw', to: 'enr' },
      { from: 'enr', to: 'reg' },
      { from: 'enr', to: 'dlq', bidi: true },
      { from: 'enr', to: 'clean' },
      { from: 'clean', to: 'rt' },
      { from: 'clean', to: 'router' },
      { from: 'router', to: 'lake' },
      { from: 'router', to: 'search' },
      { from: 'router', to: 'tp' },
      { from: 'col', to: 'audit', dashed: true },
      { from: 'lake', to: 'audit', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'journey', title: 'One event, end to end', tone: 'ok',
      steps: [
        { text: 'The app calls <code>track("Video Played")</code>. The SDK gives it a <b>UUID event_id at creation</b> and writes it to an on-disk spool. Every 10 s, or 100 events, it sends one gzip batch.', flow: ['sdk>col'], badges: { sdk: '100 events · 9 KB' } },
        { text: 'The collector checks the <b>write key</b>, the size and the JSON shape, stamps <code>received_at</code> and <code>source_id</code>, and writes to the raw log with <code>acks=all</code>.', flow: ['col>raw'], badges: { raw: 'acked' } },
        { text: 'Only after the log acks does the collector return <b>200</b>. The SDK then deletes the batch from its spool. Until then the batch stays on the device.', nodes: ['sdk', 'col'], ok: ['sdk'], badges: { sdk: ['200 → delete', 'ok'] } },
        { text: 'The validator looks up the schema (cached by id), validates, drops the event if its <code>event_id</code> was already seen, adds geo and user agent, and <b>truncates the IP</b>.', flow: ['raw>enr', 'enr>reg', 'enr>clean'], badges: { enr: 'valid · new' } },
        { text: 'Real-time apps read the clean topic within seconds. <b>Each sink router</b> batches for its own destination: hourly files to the lake, bulk index to search, rate-limited calls to partners.', flow: [['clean>rt', 'clean>router'], ['router>lake', 'router>search', 'router>tp']], tone: 'ok' }
      ]
    },
    {
      id: 'bad-schema', title: 'A bad release breaks the contract', tone: 'warn',
      steps: [
        { text: 'App v5.2 ships a bug: it sends <code>price</code> as the string <code>"9.99 USD"</code> instead of a number.', flow: ['sdk>col', 'col>raw'], warn: ['sdk'] },
        { text: 'The validator rejects those events against the registered schema and writes them to the <b>DLQ with the reason</b> and the source. Good events keep flowing.', flow: ['raw>enr', 'enr>reg', 'enr>dlq'], warn: ['dlq'], badges: { dlq: ['price: not double', 'warn'] }, tone: 'warn' },
        { text: 'An alert on <b>DLQ rate per source and app version</b> fires within minutes and pages the owning team, not the platform team.', nodes: ['dlq', 'audit'], badges: { audit: ['DLQ 4% · ios 5.2', 'warn'] } },
        { text: 'The team adds a small fix-up rule (parse the number) and <b>replays the DLQ</b> through the validator. The repaired events land in every sink with their original ids.', flow: ['dlq>enr', 'enr>clean', 'clean>router'], ok: ['enr'], tone: 'ok' },
        { text: 'To stop it happening again, CI calls the registry\'s <b>compatibility endpoint</b> before merging any event change.', nodes: ['reg'], ok: ['reg'], badges: { reg: ['CI check', 'ok'] } }
      ]
    },
    {
      id: 'slow-sink', title: 'A partner API slows down', tone: 'warn',
      steps: [
        { text: 'A marketing partner starts answering <b>429 Too Many Requests</b> and 5-second timeouts.', flow: ['router>tp'], err: ['tp'], badges: { tp: ['429 · 5 s', 'err'] }, tone: 'warn' },
        { text: 'Only that sink\'s router slows. Its <b>consumer lag</b> grows, but the log keeps every event, so nothing is lost while it waits.', nodes: ['router', 'clean'], warn: ['router'], badges: { router: ['tp lag 40 min', 'warn'] } },
        { text: 'The lake and search routers have their <b>own offsets</b> and keep moving. Real-time apps are not affected at all.', flow: [['router>lake', 'router>search', 'clean>rt']], ok: ['lake', 'search', 'rt'], tone: 'ok' },
        { text: 'The tp router retries with exponential backoff. After N attempts it parks the event in a <b>per-sink DLQ</b> so one bad record does not block the queue.', nodes: ['router', 'dlq'], badges: { dlq: 'sink:tp parked' } },
        { text: 'When the partner recovers, the router drains its backlog under the partner\'s rate limit, then replays the parked events.', flow: ['router>tp'], ok: ['tp'], tone: 'ok' }
      ]
    },
    {
      id: 'region', title: 'Region outage: retries and duplicates', tone: 'err',
      steps: [
        { text: 'The raw log in region A becomes unreachable. Collectors <b>cannot get an ack</b>, so they answer <b>503 + Retry-After</b>, not 200.', flow: ['sdk>col', 'col>raw'], err: ['raw'], badges: { raw: ['unreachable', 'err'], col: ['503', 'err'] }, tone: 'err' },
        { text: 'SDKs keep the batches in their <b>disk spool</b> and retry with exponential backoff and jitter. Apps keep working; nothing is lost on the device.', nodes: ['sdk'], warn: ['sdk'], badges: { sdk: ['spool 2 MB', 'warn'] } },
        { text: 'GeoDNS health checks move traffic to <b>region B</b>. Some batches were written in region A just before the cut but their 200 never arrived, so the SDK sends them again.', flow: ['sdk>col', 'col>raw'], ok: ['col'], badges: { col: 'region B' } },
        { text: 'The validator\'s <b>dedup on event_id</b> drops those repeats. When region A\'s log returns, its events are replicated into the aggregate cluster and dedup catches overlaps there too.', flow: ['raw>enr', 'enr>clean'], badges: { enr: ['dup dropped', 'ok'] }, tone: 'ok' },
        { text: 'The audit job compares <b>collector counts vs lake counts</b> per source per 10-minute window. The gap closes to zero, which shows the outage cost latency, not data.', flow: ['col>audit', 'lake>audit'], ok: ['audit'], badges: { audit: ['Δ = 0', 'ok'] } }
      ]
    },
    {
      id: 'spike', title: 'Scale: a 10× spike during a live event', tone: 'warn',
      steps: [
        { text: 'A live final starts and event volume jumps <b>10× in two minutes</b>, concentrated on a few event types.', flow: [['sdk>col', 'sdk>col']], warn: ['col'], badges: { col: ['10× rps', 'warn'] }, tone: 'warn' },
        { text: 'Collectors are stateless, so the autoscaler adds instances behind the load balancer. Their only job is to write to the log, which keeps them cheap.', nodes: ['col'], ok: ['col'], badges: { col: ['+40 pods', 'ok'] } },
        { text: 'The log <b>absorbs the burst</b>. Validation lags by a few minutes because it reads at its own pace; retention is days, so this is safe.', flow: ['col>raw', 'raw>enr'], warn: ['enr'], badges: { enr: ['lag 3 min', 'warn'] } },
        { text: 'If lag keeps growing, apply <b>priority</b>: SDKs sample debug and low-value events by remote config, while purchases and plays are never sampled.', nodes: ['sdk', 'enr'], badges: { sdk: 'sample debug 10%' } },
        { text: 'Lag drains after the peak. Partitions sized for peak (not average) and quotas per source keep one noisy tenant from taking the whole cluster.', flow: ['enr>clean', 'clean>router'], ok: ['enr'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real design decision for a pipeline taking about <b>100K events/s</b> on average (illustrative). Watch the router label, the hidden components and the meters.',
    controls: [
      { id: 'schema', label: 'Schema contract', type: 'seg', value: 'strict', options: [
        { v: 'none', l: 'Schemaless JSON' }, { v: 'tag', l: 'Validate & tag' }, { v: 'strict', l: 'Validate → DLQ' }] },
      { id: 'dedup', label: 'Duplicate handling', type: 'seg', value: 'day', options: [
        { v: 'none', l: 'None (sinks cope)' }, { v: 'day', l: 'event_id, 24 h' }, { v: 'long', l: 'event_id, 4 weeks' }] },
      { id: 'bp', label: 'When downstream is slow', type: 'seg', value: 'spool', options: [
        { v: 'block', l: 'Block / hold in memory' }, { v: 'spool', l: 'Spool to disk' }, { v: 'drop', l: 'Drop low priority' }] },
      { id: 'iso', label: 'Sink delivery', type: 'seg', value: 'per', options: [
        { v: 'shared', l: 'One shared writer' }, { v: 'per', l: 'One router per sink' }] },
      { id: 'flush', label: 'SDK flush interval', type: 'range', min: 1, max: 60, step: 1, value: 10, unit: 's' }
    ],
    evaluate(s) {
      const devices = 10e6;                       // illustrative online devices
      const eps = 1e5;                            // illustrative average events/s
      const rps = devices / s.flush;
      const keysPerDay = eps * 86400, keyB = 40;  // ~40 B per dedup key incl. overhead (estimate)
      const dedupBytes = s.dedup === 'none' ? 0 : keysPerDay * keyB * (s.dedup === 'day' ? 1 : 28);
      const loss = { block: ['app memory fills; lost if the app is killed', 0.45], spool: ['spool survives restarts and outages', 0.9], drop: ['low-priority events dropped on purpose', 0.6] }[s.bp];
      const metrics = [
        { k: 'Data loss risk', v: loss[0], s: loss[1] },
        { k: 'Duplicates in sinks', v: { none: '~0.6% (Segment\'s measured rate)', day: 'only retries > 24 h apart', long: '≈ none inside 4 weeks' }[s.dedup], s: { none: 0.3, day: 0.75, long: 0.92 }[s.dedup] },
        { k: 'Bad events in sinks', v: { none: 'all of them, silently', tag: 'present, flagged', strict: '0 (held in DLQ)' }[s.schema], s: { none: 0.15, tag: 0.55, strict: 0.92 }[s.schema] },
        { k: 'Slow-sink blast radius', v: s.iso === 'shared' ? 'every sink stalls' : 'only that sink lags', s: s.iso === 'shared' ? 0.12 : 0.92 },
        { k: 'Time to real-time apps', v: '≈ ' + (s.flush / 2).toFixed(s.flush < 4 ? 1 : 0) + '–' + s.flush + ' s + ~2 s', s: s.flush <= 5 ? 0.9 : s.flush <= 20 ? 0.6 : 0.3, hint: 'avg wait is half the flush interval' },
        { k: 'Collector requests/s', v: SD.fmt.num(rps) + '/s', s: rps <= 1e6 ? 0.85 : rps <= 3e6 ? 0.55 : 0.3, hint: '10M online devices' },
        { k: 'Dedup state', v: dedupBytes ? SD.fmt.bytes(dedupBytes) : 'none', s: s.dedup === 'none' ? 0.9 : s.dedup === 'day' ? 0.7 : 0.4, hint: '~40 B/key, estimate' }
      ];
      const notes = [];
      if (s.schema === 'none') notes.push('With no contract, a renamed field reaches every sink. Dashboards show zeros and nobody gets an error.');
      if (s.schema === 'tag') notes.push('Tagging keeps data flowing during a bad release, but every consumer must remember to filter the flag.');
      if (s.schema === 'strict') notes.push('Strict validation needs an owner for the DLQ: alerts per source, fix-up rules and replay tooling.');
      if (s.dedup === 'long') notes.push('Segment dedups over a <b>4-week</b> window with per-partition RocksDB on local disk. The state is large but needs no coordination.');
      if (s.dedup === 'none') notes.push('Without dedup, every sink must be idempotent itself (e.g. <code>MERGE … ON event_id</code>). Counting sinks like ad billing usually are not.');
      if (s.bp === 'block') notes.push('Blocking pushes the problem into the app. A phone holding events in memory loses them when the OS kills the app.');
      if (s.bp === 'drop') notes.push('Dropping is fine for debug or high-volume telemetry if it is <b>deliberate and counted</b>. Never drop purchases or billing events.');
      if (s.iso === 'shared') notes.push('One shared writer is what Segment moved away from: retries for one failing destination blocked the queue for all of them.');
      if (s.flush >= 30) notes.push('Long flush intervals save battery and requests but delay real-time use cases.');
      let verdict;
      if (s.schema === 'none' && s.dedup === 'none') verdict = '❌ <b>No contract and no dedup:</b> bad and repeated events reach every report. Add at least validation and an event_id.';
      else if (s.iso === 'shared') verdict = '⚠ <b>One slow partner API will stall the lake and search.</b> Give each sink its own router and offsets.';
      else if (s.bp === 'block') verdict = '⚠ <b>Back-pressure lands on users\' devices.</b> Spool to disk on the client and let the log absorb bursts.';
      else if (s.schema === 'strict' && s.bp === 'spool' && s.dedup !== 'none') verdict = '✅ <b>Close to what Netflix and Segment describe:</b> durable client spool, a log in front, validation to a DLQ, dedup by id, and isolated routers per sink.';
      else verdict = '👍 Workable. Check which meter you are trading away.';
      const flow = ['sdk>col', 'col>raw', 'raw>enr'].concat(s.schema !== 'none' ? ['enr>reg'] : []).concat(s.schema === 'strict' ? ['enr>dlq'] : []).concat(['enr>clean', 'clean>router', ['router>lake', 'router>search', 'router>tp']]);
      return {
        metrics, verdict, notes, flow,
        labels: {
          router: s.iso === 'shared' ? { label: 'Shared writer', sub: 'one loop, all sinks' } : { label: 'Sink routers', sub: 'one job per sink' },
          sdk: { label: 'SDKs & agents', sub: { block: 'batch · hold in RAM', spool: 'batch · disk spool', drop: 'batch · sample low-pri' }[s.bp] },
          enr: { label: 'Validate & enrich', sub: (s.schema === 'none' ? 'no schema' : 'schema') + ' · ' + (s.dedup === 'none' ? 'no dedup' : s.dedup === 'day' ? 'dedup 24 h' : 'dedup 4 wk') }
        },
        hide: s.schema === 'none' ? ['reg', 'dlq'] : s.schema === 'tag' ? ['dlq'] : [],
        warn: s.iso === 'shared' ? ['router'] : s.bp === 'block' ? ['sdk'] : [],
        err: s.iso === 'shared' ? ['tp'] : [],
        ok: s.schema === 'strict' ? ['reg'] : [],
        badges: s.iso === 'shared' ? { tp: ['slow', 'err'], lake: ['stalled', 'warn'], search: ['stalled', 'warn'] } : { tp: ['slow', 'warn'], lake: ['on time', 'ok'] }
      };
    }
  },

  widget: {
    title: 'Schema evolution checker and validation router',
    caption: 'Edit the <b>PageView</b> schema and see BACKWARD / FORWARD / FULL computed with Avro\'s real reader/writer rules (checked against Apache Avro\'s own compatibility checker). Register it under a registry mode, then send events from an <b>old app</b> (writes v1) and a <b>new app</b> (writes the latest). Malformed payloads go to the ingest DLQ. Events a sink cannot decode with its reader schema go to that sink\'s DLQ until you upgrade it and replay.'
  },

  realWorld: {
    intro: 'Most large companies built this path in stages: first a log in front of everything, then contracts, isolation per sink and audits. Figures are from the year given.',
    timeline: [
      { when: '2011–15', who: 'Netflix', title: 'From Chukwa batch to a Kafka-fronted pipeline', text: 'Netflix\'s event volume grew from <b>45 billion events/day in 2011 to 500 billion/day (about 1 PB ingested) by 2015</b>. The Hadoop-era Chukwa pipeline could not keep up, which led to Keystone.', src: 2 },
      { when: '2015', who: 'LinkedIn', title: 'Tiers, mirror makers and an audit tier', text: 'LinkedIn\'s Kafka ecosystem carried <b>over 800 billion messages a day (over 175 TB)</b>. One cluster rarely loses messages, but extra tiers and mirror makers add many places where messages can disappear, so key consumers such as Hadoop write <b>audit counts</b> back as a separate tier.', src: 3 },
      { when: '2016', who: 'Netflix', title: 'Keystone routing: one job per sink', text: 'Keystone version 1.5 added a Kafka-fronted branch. A routing service filters events and forwards them to sinks such as S3, Elasticsearch and other Kafka streams, with <b>separate routing jobs per sink</b> so one sink\'s outage does not affect the others. The routers ran as Samza jobs in Docker on EC2.', src: 0 },
      { when: '2016', who: 'Uber', title: 'uReplicator replaces MirrorMaker', text: 'Cross-datacenter copying with MirrorMaker suffered rebalances with <b>about 5–10 minutes of inactivity</b>, a static topic whitelist that needed restarts, and loss risk. Uber built uReplicator with a Helix controller that assigns partitions to workers, aiming for zero data loss.', src: 7 },
      { when: '2016', who: 'Uber', title: 'Chaperone audits Kafka end to end', text: 'Each tier counts messages in <b>10-minute tumbling windows</b> keyed by the event time inside the message. A job compares counts between tiers and alerts on any gap. A write-ahead log plus UUIDs keeps the audit itself exactly-once.', src: 8 },
      { when: '2017', who: 'Segment', title: 'Dedup over a 4-week window', text: 'About <b>0.6% of ingested events were duplicates</b> within a 4-week window, mostly client retries. A two-phase design reads from Kafka, checks each message id in a <b>RocksDB store local to each worker</b>, publishes only new ids, then commits the input offset.', src: 4 },
      { when: 'c. 2017', who: 'Pinterest', title: 'Write to local disk first, ship with an agent', text: 'Services write logs to <b>local disk</b> and the Singer agent uploads them to Kafka with at-least-once delivery. Writing directly to Kafka meant buffering in memory, so a long Kafka outage could lose data. Pinterest reported more than 150 billion messages a day.', src: 9 },
      { when: '2018', who: 'Segment', title: 'Per-destination queues, then Centrifuge', text: 'A single shared queue let retries for one failing destination block every other destination (head-of-line blocking). Segment first split to a queue and service per destination, then built <b>Centrifuge</b>, a system of virtual queues that isolates each customer and endpoint.', src: 6 },
      { when: '2018', who: 'Netflix', title: 'Keystone becomes stream processing as a service', text: 'InfoQ recalls that in 2016 Netflix ran <b>36 Kafka clusters handling over 700 billion messages a day</b>. Keystone grew from routing into a self-service platform, with tunable at-least-once delivery that trades latency against delivery.', src: 1 },
      { when: 'Today', who: 'Snowplow', title: 'Validate after the collector, keep failed events', text: 'The open-source pipeline has a collector that only receives and stores raw events, then an enrich step that validates them against <b>Iglu schemas</b>. Failures go to a separate bad stream as typed failed events (size violation, format violation, schema violation).', src: 12 }
    ],
    lessons: [
      'Put a <b>durable log</b> right behind the collectors. Ack only after it, and do everything else asynchronously.',
      'Make schemas a <b>contract</b>: a registry with a compatibility mode, checked in CI, with a DLQ and replay for what slips through.',
      'Plan for <b>at-least-once</b>: an event_id from the client, a dedup window, and idempotent sinks.',
      'Give each sink its own consumer, offsets, retries and DLQ, and <b>audit counts between tiers</b> so loss is measured, not guessed.'
    ],
    sources: [
      { title: 'Netflix Keystone: petabyte-scale real-time event stream processing', url: 'https://www.infoq.com/news/2016/03/netflix-keystone-data-pipeline', pub: 'InfoQ, 2016' },
      { title: 'Keystone Real-time Stream Processing Platform at Netflix', url: 'https://www.infoq.com/news/2018/09/netflix-keystone-real-time-proc/', pub: 'InfoQ, 2018' },
      { title: 'How Netflix built its real-time data infrastructure', url: 'https://venturebeat.com/business/how-netflix-built-its-real-time-data-infrastructure', pub: 'VentureBeat (Zhenzhong Xu, ex-Netflix)' },
      { title: 'Running Kafka At Scale', url: 'https://engineering.linkedin.com/kafka/running-kafka-scale', pub: 'LinkedIn Engineering, 2015' },
      { title: 'Delivering billions of messages exactly once', url: 'https://segment.com/blog/exactly-once-delivery', pub: 'Segment Engineering, 2017' },
      { title: 'Centrifuge: a reliable system for delivering billions of events per day', url: 'https://www.twilio.com/en-us/blog/archive/2018/introducing-centrifuge', pub: 'Segment / Twilio, 2018' },
      { title: 'Segment: from monolith to microservices and back', url: 'https://www.infoq.com/news/2018/07/segment-microservices', pub: 'InfoQ, 2018' },
      { title: 'uReplicator: Uber Engineering\'s robust Apache Kafka replicator', url: 'https://www.uber.com/blog/ureplicator-apache-kafka-replicator/', pub: 'Uber Engineering, 2016' },
      { title: 'Introducing Chaperone: how Uber Engineering audits Apache Kafka end-to-end', url: 'https://eng.uber.com/chaperone-audit-kafka-messages/', pub: 'Uber Engineering, 2016' },
      { title: 'Scalable and reliable data ingestion at Pinterest', url: 'https://medium.com/pinterest-engineering/scalable-and-reliable-data-ingestion-at-pinterest-b921c2ee8754', pub: 'Pinterest Engineering' },
      { title: 'Singer: high-performance logging agent for Kafka', url: 'https://github.com/pinterest/singer', pub: 'GitHub, Pinterest' },
      { title: 'Schema evolution and compatibility (Schema Registry)', url: 'https://docs.confluent.io/platform/7.2/schema-registry/avro.html', pub: 'Confluent documentation' },
      { title: 'What is deployed? (Snowplow pipeline)', url: 'https://docs.snowplow.io/docs/getting-started-on-snowplow-open-source/what-is-deployed', pub: 'Snowplow documentation' },
      { title: 'A new bad row format', url: 'https://discourse.snowplow.io/t/a-new-bad-row-format/2558', pub: 'Snowplow Discourse' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Where to validate', '<b>At the collector</b>: the client gets a 400 right away', '<b>After the log</b>: accept fast, validate async, DLQ', 'B for analytics events (never lose them); A for server APIs where the caller can fix and resend'],
      ['Wire format', '<b>JSON + JSON Schema</b>: easy for web and partners', '<b>Avro / Protobuf + registry</b>: compact, typed, evolvable', 'JSON at the edge, Avro or Protobuf on clean topics'],
      ['Back-pressure', '<b>Buffer</b> (client disk spool, log retention)', '<b>Drop / sample</b> by priority', 'Buffer everything that matters; drop only debug or telemetry, and count what you drop'],
      ['Dedup', '<b>Dedup stage</b> with an id window', '<b>Idempotent sinks</b> (MERGE on event_id)', 'Both for billing-grade data; idempotent sinks alone if the warehouse dedups at load'],
      ['Sink delivery', '<b>Shared consumer</b>: fewer jobs', '<b>Router per sink</b>: isolation, own offsets and DLQ', 'Per sink as soon as any sink is external or slow'],
      ['Partition key', '<b>Device / user id</b>: per-user order', '<b>Random / round-robin</b>: even load', 'User id unless one key is huge (bots, test devices); then salt or route those keys apart']
    ]
  },
  failures: [
    { f: 'Log unreachable in a region', detect: 'Collector produce errors, 503 rate', fix: 'Return 503 + Retry-After (never 200), clients keep the spool and back off, GeoDNS moves them to another region.' },
    { f: 'Breaking schema change ships', detect: 'DLQ rate per source and app version', fix: 'Registry compatibility check in CI; fix-up rule plus replay from the DLQ.' },
    { f: 'One sink slow or down', detect: 'Consumer lag per sink router', fix: 'Isolated router per sink, backoff, park poison events in the sink DLQ, drain under the sink\'s rate limit.' },
    { f: 'Duplicate storm after retries', detect: 'Dedup hit rate jumps; count mismatch vs unique ids', fix: 'Dedup by event_id within a window; idempotent sink writes.' },
    { f: 'Silent loss between tiers', detect: 'Audit: counts per source per window differ between collector and lake', fix: 'Find the tier with the gap (replicator, router), fix, and re-run from the raw log.' },
    { f: 'Device clocks are wrong', detect: 'Event timestamps in the future or in 1970', fix: 'Keep client time, sent_at and received_at; correct with received_at − (sent_at − timestamp).' },
    { f: 'PII lands in the lake', detect: 'Scanners on new properties; data-owner review', fix: 'Allow-list properties per schema, hash or drop at the validator, delete by user id on request.' }
  ],

  interview: [
    { q: 'Walk me through the ingestion path end to end.', a: '<ul><li><b>SDK</b>: give each event an id, batch, gzip, spool to disk, retry with backoff.</li><li><b>Collector</b> (stateless, behind a load balancer): auth by write key, size limits, write to the raw log, return 200 only after the ack.</li><li><b>Validator</b>: schema check against the registry, dedup, enrich, PII rules. Failures go to a DLQ.</li><li><b>Clean topics</b> per event type.</li><li><b>Routers</b>, one per sink: lake, search, partners. Real-time apps read clean topics directly.</li><li><b>Audit</b>: counts and lag per tier.</li></ul>', lvl: 'core' },
    { q: 'Why put a log between collectors and sinks instead of writing straight to the warehouse?', a: '<p>It <b>decouples accept from deliver</b>. The collector only needs one fast, highly available write. The warehouse can be slow, down or reloading, and events wait in the log.</p><p>You also get <b>replay</b> (re-run validation or a sink after a bug fix) and <b>fan-out</b>: many sinks read the same data without the producer knowing about them.</p>', lvl: 'core' },
    { q: 'When should the collector return 200?', a: '<p>Only after the event is <b>durable</b>: the log has acked with <code>acks=all</code> and enough in-sync replicas. Before that, the client must keep the batch.</p><p>If the log is unavailable, return <b>503 with Retry-After</b>. Never ack from memory: a collector crash would then lose events the client already deleted.</p>', fu: 'What about latency? Batch on the collector for a few ms (linger) and ack the whole HTTP batch at once.', lvl: 'core' },
    { q: 'Delivery is at-least-once. How do you avoid double counting?', a: '<p>The <b>client creates the event_id</b> (a UUID) when the event happens, not when it is sent, so every retry carries the same id.</p><p>The validator keeps a <b>dedup window</b> of seen ids (Segment used 4 weeks in RocksDB per partition). Sinks are idempotent too: <code>MERGE</code> or <code>ON CONFLICT DO NOTHING</code> on event_id. Duplicates older than the window are rare and caught by the sink.</p>', lvl: 'core' },
    { q: 'Backward vs forward vs full compatibility: which do you choose?', a: '<ul><li><b>Backward</b>: the new schema can read old data. Upgrade <b>consumers first</b>. Confluent\'s default, because consumers can rewind to old data.</li><li><b>Forward</b>: old readers can read new data. Upgrade <b>producers first</b>.</li><li><b>Full</b>: both, so any order works.</li></ul><p>For events from mobile apps that you can\'t force to update, old producers live for months, so use <b>full</b> (only add or remove fields that have defaults). The <b>transitive</b> variants check every earlier version, not just the latest.</p>', lvl: 'core' },
    { q: 'A team renames a field. What happens, and how do you prevent damage?', a: '<p>A rename is a remove plus an add. Old data lacks the new name and new data lacks the old one, so without help it breaks <b>both directions</b>.</p><p>In Avro, an <b>alias</b> on the reader maps the old name, which fixes backward reads but not forward. The safe way is: add the new optional field, write both for a while, migrate readers, then remove the old one. The registry rejects the unsafe version with 409, and CI calls the compatibility endpoint before merge.</p>', lvl: 'core' },
    { q: 'Validate at the collector or after the log?', a: '<p><b>At the collector</b>: the client gets an error at once, but a bad deploy of the validator, or the registry being down, now loses data or blocks ingestion.</p><p><b>After the log</b>: the collector stays tiny and always accepts; validation can be fixed and re-run from the raw log. Most analytics pipelines (Snowplow, Segment-style) validate after, and keep a cheap size and shape check at the edge.</p>', lvl: 'deep' },
    { q: 'One sink (a partner API) is slow. How do you stop it hurting the others?', a: '<p>Give each sink its <b>own consumer group / router</b> with its own offsets, batch size, rate limit, retry policy and DLQ. Then a slow sink only raises <i>its own</i> lag.</p><p>Inside the router, don\'t retry forever in line: after N tries <b>park</b> the event in the sink DLQ so later events are not blocked. Netflix ran separate routing jobs per sink; Segment moved to per-destination queues to fix head-of-line blocking.</p>', lvl: 'core' },
    { q: 'Back-pressure: block, buffer or drop?', a: '<ul><li><b>Block</b>: correct but moves the pain upstream. On a phone, events in memory die with the app.</li><li><b>Buffer</b>: client disk spool plus log retention. Best default, but bound it (size and age) and say what happens when it is full.</li><li><b>Drop</b>: acceptable for low-priority data only, done on purpose with counters. Priorities must be decided per event type in advance.</li></ul>', lvl: 'deep' },
    { q: 'How do you know you are not losing events?', a: '<p><b>Audit by counts.</b> Every tier (collector, raw log, validator, each sink) emits counts per source per time window, keyed by event time. A job compares tiers and alerts on gaps. Uber\'s Chaperone used 10-minute windows; LinkedIn wrote audit counts back from Hadoop.</p><p>Add end-to-end <b>lag</b> (now − received_at at each sink) and canary events sent through the real path.</p>', lvl: 'deep' },
    { q: 'How do you collect events in several regions?', a: '<p>Clients go to the nearest healthy region through <b>GeoDNS</b>. Each region has collectors and a local log, so ingestion never depends on a cross-ocean link.</p><p>A replicator (MirrorMaker 2, uReplicator) copies regional topics into an <b>aggregate cluster</b> for global sinks. Avoid replication loops with per-region topic names, and rely on event_id dedup for batches retried in a second region after failover.</p>', lvl: 'deep' },
    { q: 'How do you handle PII at ingest?', a: '<p>Treat the schema as an <b>allow-list</b>: unknown properties are dropped or quarantined, not stored. Truncate IPs after geo lookup, hash or tokenise emails and phone numbers at the validator, and keep raw-log retention short.</p><p>Store a user-id index so you can delete or rewrite a user\'s events on request, and restrict who can read the raw topic.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot: collector that acks only after Kafka does', lang: 'java',
      code: `// application.yml: spring.kafka.producer.acks=all, properties.enable.idempotence=true,
//   compression-type=zstd, properties.linger.ms=5; gzip request bodies are inflated by a filter.
@RestController
public class CollectorController {
  public interface WriteKeys { String sourceFor(String writeKey); }   // cached lookup
  private final KafkaTemplate<String, String> kafka;
  private final WriteKeys keys;
  public CollectorController(KafkaTemplate<String, String> kafka, WriteKeys keys) {
    this.kafka = kafka; this.keys = keys;
  }

  @PostMapping("/v1/batch")
  public ResponseEntity<Map<String, Integer>> batch(
      @RequestHeader(HttpHeaders.AUTHORIZATION) String auth, @RequestBody JsonNode body)
      throws InterruptedException {
    String key = new String(Base64.getDecoder().decode(auth.replaceFirst("^Basic ", "")),
        StandardCharsets.UTF_8).split(":", 2)[0];                 // write key as Basic user
    String source = keys.sourceFor(key);
    if (source == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    JsonNode events = body.path("batch");
    if (!events.isArray() || events.isEmpty() || events.size() > 500)
      return ResponseEntity.badRequest().build();
    byte[] received = Long.toString(System.currentTimeMillis()).getBytes(StandardCharsets.UTF_8);
    List<CompletableFuture<SendResult<String, String>>> acks = new ArrayList<>();
    for (JsonNode e : events) {
      String id = e.path("event_id").asText("");
      if (id.isEmpty()) return ResponseEntity.badRequest().build();
      var rec = new ProducerRecord<>("raw-events", e.path("anonymous_id").asText(id), e.toString());
      rec.headers().add("source_id", source.getBytes(StandardCharsets.UTF_8))
                   .add("received_at", received);
      acks.add(kafka.send(rec));
    }
    try {                                    // durable on all in-sync replicas, or no 200
      CompletableFuture.allOf(acks.toArray(CompletableFuture[]::new)).get(5, TimeUnit.SECONDS);
    } catch (ExecutionException | TimeoutException ex) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).header("Retry-After", "5").build();
    }
    return ResponseEntity.ok(Map.of("accepted", acks.size()));
  }
}`,
      note: 'If the 5 s wait times out, some events may already be in Kafka. The client resends the whole batch and the validator\'s event_id dedup removes the repeats. That is at-least-once by design. Imports omitted; compiled against Spring Boot 3.5 and spring-kafka 3.3.'
    },
    {
      title: 'Postgres: dedup window by partition + DLQ replay', lang: 'sql',
      code: `-- Dedup keys partitioned by the event's own day: retries keep the same day,
-- and dropping the oldest partition expires the window (no DELETE scans).
CREATE TABLE seen_events (
  event_id   uuid        NOT NULL,
  event_day  date        NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, event_day)
) PARTITION BY RANGE (event_day);
CREATE TABLE seen_events_20261103 PARTITION OF seen_events
  FOR VALUES FROM ('2026-11-03') TO ('2026-11-04');

-- Validator: 1 row back = new event, 0 rows = duplicate (skip it)
INSERT INTO seen_events (event_id, event_day)
VALUES ('7f1c0a52-3e0b-4c43-9b0e-2d7c1f6a9e10', '2026-11-03')
ON CONFLICT DO NOTHING
RETURNING event_id;

CREATE TABLE dlq_events (
  id bigserial PRIMARY KEY, event_id uuid, source_id text NOT NULL,
  stage text NOT NULL, reason text NOT NULL, payload jsonb NOT NULL,
  failed_at timestamptz NOT NULL DEFAULT now(), replayed_at timestamptz);
CREATE INDEX dlq_pending ON dlq_events (source_id, failed_at) WHERE replayed_at IS NULL;

-- Replay worker (BEGIN … COMMIT around it): claim a batch, re-publish, commit.
-- Parallel workers skip each other's rows; a crash rolls the claim back.
WITH batch AS (
  SELECT id FROM dlq_events
   WHERE replayed_at IS NULL AND source_id = 'ios-app' AND stage = 'ingest'
   ORDER BY failed_at LIMIT 500
   FOR UPDATE SKIP LOCKED)
UPDATE dlq_events d SET replayed_at = now()
  FROM batch WHERE d.id = batch.id
RETURNING d.event_id, d.payload;   -- publish these to raw-events, then COMMIT`,
      note: 'A crash after publishing but before COMMIT replays the batch again; dedup on event_id absorbs it. Create tomorrow\'s partition ahead of time (a daily job or pg_partman) and <code>DROP TABLE</code> the partition that leaves the window.'
    },
    {
      title: 'Python: tiny SDK with disk spool, gzip batches and jittered retry', lang: 'python',
      code: `import base64, gzip, json, random, sqlite3, time, uuid
import urllib.error, urllib.request

class Tracker:
    def __init__(self, url, write_key, path="spool.db", batch=100):
        self.url, self.batch = url, batch
        self.auth = "Basic " + base64.b64encode(f"{write_key}:".encode()).decode()
        self.db = sqlite3.connect(path)
        self.db.execute("CREATE TABLE IF NOT EXISTS spool (id INTEGER PRIMARY KEY, body TEXT)")

    def track(self, event, props, anonymous_id):
        e = {"event_id": str(uuid.uuid4()), "type": "track", "event": event,  # id fixed now,
             "properties": props, "anonymous_id": anonymous_id,                # not at send time
             "timestamp": time.time()}
        with self.db:                                    # durable before we return
            self.db.execute("INSERT INTO spool (body) VALUES (?)", (json.dumps(e),))

    def flush(self, tries=5):
        rows = self.db.execute("SELECT id, body FROM spool ORDER BY id LIMIT ?", (self.batch,)).fetchall()
        if not rows:
            return 0
        payload = {"batch": [json.loads(b) for _, b in rows], "sent_at": time.time()}
        req = urllib.request.Request(self.url, gzip.compress(json.dumps(payload).encode()), {
            "Content-Type": "application/json", "Content-Encoding": "gzip", "Authorization": self.auth})
        for attempt in range(tries):
            try:
                urllib.request.urlopen(req, timeout=10).close()
                break                                    # 2xx: the log has it
            except urllib.error.HTTPError as err:
                if err.code not in (408, 429) and err.code < 500:
                    break                                # 400/401/413: retrying won't help
                wait = float(err.headers.get("Retry-After") or 0)
            except OSError:
                wait = 0                                 # network error: retry
            time.sleep(max(wait, random.uniform(0, min(30, 0.5 * 2 ** attempt))))  # full jitter
        else:
            return 0                                     # keep the spool; try on next flush
        with self.db:
            self.db.execute("DELETE FROM spool WHERE id <= ?", (rows[-1][0],))
        return len(rows)`,
      note: 'A rejected batch (4xx) is deleted here to keep the demo short. A real SDK would log it and report a counter so the loss is visible. Mobile SDKs also cap the spool by size and age, and drop the oldest low-priority events first.'
    }
  ],

  related: ['message-queue', 'stream-analytics', 'data-lake', 'ad-click-aggregation', 'observability', 'notifications']
});
