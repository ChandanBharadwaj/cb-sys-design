SD.register({
  slug: 'observability-pillars',
  domain: 8,
  title: 'Three Pillars of Observability',
  examples: 'OpenTelemetry, Dapper, Honeycomb',
  tagline: 'Instrument once with <b>OpenTelemetry</b>, emit <b>metrics, structured logs and traces</b> that share one <code>trace_id</code>, and sample and label carefully, so you can explain any slow request without a telemetry bill bigger than production.',
  tldr: {
    problem: 'A request crosses six services, a queue and a database. Dashboards say p99 is up, but nobody can say <i>which</i> requests are slow or <i>why</i>. Logs are free-text, have no shared id, and cost a fortune.',
    idea: 'Emit three correlated signals: <b>metrics</b> (cheap aggregates: RED, USE, golden signals) to detect, <b>traces</b> (a tree of timed spans per request, linked by W3C <code>traceparent</code>) to locate, and <b>structured logs</b> carrying the same <code>trace_id</code> to explain. Standardise on <b>OpenTelemetry</b> and keep the interesting traces with <b>tail-based sampling</b>.',
    insight: 'The pillars are only useful when <b>joined</b>: an exemplar on a latency histogram jumps to a trace, a span jumps to its logs. The critique from Honeycomb ("observability 2.0") is that three separate stores are the problem; one store of wide events can derive all three.',
    numbers: [
      { v: '1/1024', l: 'trace sampling rate in Dapper\'s first production version (Google, 2010 paper)' },
      { v: '10%', l: 'Spring Boot\'s default trace sampling probability (Spring Boot reference docs)' },
      { v: '55 B', l: 'length of a W3C <code>traceparent</code> header value: version, 16-byte trace id, 8-byte parent id, flags (W3C Trace Context)' }
    ]
  },

  intro: {
    what: '<b>Observability</b> is how well you can work out what is happening inside a running system just from what it emits. In practice that means three kinds of telemetry: <b>metrics</b> (numbers over time), <b>logs</b> (records of events) and <b>traces</b> (the path and timing of one request through many services). This page is about how an architect instruments services so those signals answer questions nobody predicted.',
    analogy: {
      icon: '🚚',
      title: 'A parcel delivery network',
      text: 'Metrics are the depot dashboard: parcels per hour, share delivered late. Logs are each driver\'s notebook entries. A trace is the <b>tracking number</b>: scan it and you see every hop, with timestamps, so you can see the parcel sat in Leeds for six hours. The trick is that every notebook entry quotes the tracking number. The analogy breaks in one place: a parcel follows one path, while a request often fans out to several services at once.'
    },
    problem: 'Checkout p99 latency doubles at 14:00. The dashboard proves it, but not why. Engineers grep the logs of eight services by timestamp, guessing which lines belong to the same request. Two hours later someone finds a missing index in the inventory database. The question this answers is: <b>given one slow or failed request, how do I find the exact step that caused it, in minutes, at an affordable cost?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Dashboards plus grep',
        text: 'Each service writes free-text logs and a few CPU and request-count graphs. It works while there are two services and the person who wrote them is on call.',
        scene: {
          nodes: [
            { id: 'gw', label: 'Gateway', sub: 'logs: text', kind: 'edge', at: [70, 0] },
            { id: 'ord', label: 'Orders', sub: 'logs: text', kind: 'service', at: [210, 0] },
            { id: 'inv', label: 'Inventory', sub: 'logs: text', kind: 'service', at: [350, 0] },
            { id: 'dash', label: 'Dashboard', sub: 'CPU, req/s', kind: 'compute', at: [210, 110] }
          ],
          edges: [{ from: 'gw', to: 'ord' }, { from: 'ord', to: 'inv' }, { from: 'ord', to: 'dash', dashed: true }],
          flow: ['gw>ord', 'ord>inv', 'ord>dash']
        }
      },
      {
        stage: 'breaks',
        title: 'Slow, but nobody knows where',
        text: 'With many services and retries, a timestamp is not an identity. The graph shows p99 is up; the logs cannot be <b>joined</b> into one request story, and logging everything at DEBUG costs more than the servers.',
        scene: {
          nodes: [
            { id: 'gw', label: 'Gateway', sub: 'p99 2.4 s', kind: 'edge', at: [70, 0] },
            { id: 'ord', label: 'Orders', sub: '10k lines/s', kind: 'service', at: [210, 0] },
            { id: 'inv', label: 'Inventory', sub: 'slow query?', kind: 'service', at: [350, 0] },
            { id: 'dash', label: 'Dashboard', sub: 'p99 up. why?', kind: 'compute', at: [210, 110] }
          ],
          edges: [{ from: 'gw', to: 'ord' }, { from: 'ord', to: 'inv' }, { from: 'ord', to: 'dash', dashed: true }],
          flow: ['gw>ord', 'ord>inv'],
          err: ['inv'], warn: ['dash'],
          badges: { inv: ['hidden cause', 'err'], dash: ['no context', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'One trace id ties it together',
        text: 'Every service is instrumented with <b>OpenTelemetry</b>. The gateway starts a trace and passes its id in a header; every span and log line carries it. The latency graph links to an example trace, and the trace points at the 1.9 s database span.',
        scene: {
          nodes: [
            { id: 'gw', label: 'Gateway', sub: 'starts trace', kind: 'edge', at: [70, 0] },
            { id: 'ord', label: 'Orders', sub: 'span + logs', kind: 'service', at: [210, 0] },
            { id: 'inv', label: 'Inventory', sub: 'DB span 1.9 s', kind: 'service', at: [350, 0] },
            { id: 'col', label: 'Collector', sub: 'keeps slow ones', kind: 'compute', at: [210, 110] },
            { id: 'ui', label: 'Trace view', sub: 'waterfall', kind: 'client', at: [210, 220] }
          ],
          edges: [{ from: 'gw', to: 'ord', label: 'traceparent' }, { from: 'ord', to: 'inv' }, { from: 'ord', to: 'col', dashed: true }, { from: 'inv', to: 'col', dashed: true }, { from: 'col', to: 'ui' }],
          flow: ['gw>ord', 'ord>inv', ['ord>col', 'inv>col'], 'col>ui'],
          ok: ['col', 'ui'], warn: ['inv'],
          badges: { ui: ['root cause found', 'ok'] }
        }
      }
    ],
    usedBy: ['Google (Dapper)', 'OpenTelemetry (CNCF)', 'Honeycomb', 'Jaeger and Zipkin', 'Grafana (Prometheus, Loki, Tempo)', 'Datadog, New Relic, Dynatrace'],
    whenToUse: [
      'More than a handful of services, queues or serverless functions in one user request',
      'Incidents where the dashboard shows <i>that</i> something is wrong but not <i>where</i>',
      'You want vendor-neutral instrumentation so you can change backends without touching code'
    ],
    whenNot: [
      'A single monolith with one database: good metrics and structured logs are enough; tracing adds little',
      'You need to design the storage and ingest platform itself: see <a href="../../system-design/systems/observability.html">Log Aggregation &amp; Observability</a>',
      'You need to decide how reliable is reliable enough: see <a href="slo-error-budgets.html">SLIs, SLOs &amp; Error Budgets</a>'
    ],
    glossary: [
      { term: 'Span', def: 'One timed operation (an HTTP call, a DB query) with a name, start, duration, attributes and a parent span id.' },
      { term: 'Trace', def: 'The tree of spans that share one trace id: the whole journey of one request.' },
      { term: 'Context propagation', def: 'Passing the trace id and parent span id across process boundaries, usually in the W3C traceparent header.' },
      { term: 'Cardinality', def: 'The number of distinct label-value combinations of a metric; each one is a separate time series you pay for.' },
      { term: 'Exemplar', def: 'A sample trace id stored alongside a metric bucket, so a latency spike links to a real request.' },
      { term: 'Head sampling', def: 'Deciding whether to keep a trace when it starts, before you know whether it will be slow or fail.' },
      { term: 'Tail sampling', def: 'Buffering all spans of a trace and deciding after it completes, so errors and slow traces can always be kept.' },
      { term: 'OTLP', def: 'The OpenTelemetry Protocol: the standard wire format (gRPC or HTTP) for sending metrics, logs and traces.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Detect with metrics</b>: RED for every service (rate, errors, duration), USE for every resource, golden signals at the edge',
      '<b>Locate with traces</b>: every inbound request starts or continues a trace; every outbound call and queue message propagates context',
      '<b>Explain with structured logs</b>: JSON, fixed field names, <code>trace_id</code> and <code>span_id</code> on every line',
      '<b>Correlate</b>: exemplars from histograms to traces, trace to logs, one shared resource model (<code>service.name</code>, version, env)',
      '<b>Instrument once</b>: OpenTelemetry API/SDK or agent; backends are swappable behind the Collector',
      '<b>Budget telemetry</b>: sampling, label allow-lists and retention tiers are designed, not left to defaults'
    ],
    nonFunctional: [
      'From alert to the guilty span in <b>&lt; 10 min</b> (MTTR target, rule of thumb)',
      'Instrumentation overhead <b>&lt; 1–3% CPU</b> and no added latency on the hot path (export is async and batched; estimate)',
      '<b>100% of error and slow traces</b> retained; a small baseline share of normal traces',
      'Active series per service bounded (e.g. &lt; 10k), enforced in CI or the Collector',
      'Telemetry spend kept to a budgeted share of infra cost (often quoted as 10–30%; rule of thumb, not a survey)',
      'No PII or secrets in logs, span attributes or baggage (masked at source and again in the Collector)'
    ],
    outOfScope: [
      '<b>Unbounded labels</b>: <code>user_id</code>, <code>order_id</code> or full URLs as metric labels',
      '<b>Log-and-grep debugging</b>: free-text lines with no trace id',
      '<b>Sampling only at the head</b> and then wondering why the failing trace is missing',
      '<b>Three vendors, three agents, three ids</b>: signals that cannot be joined',
      '<b>Dashboards nobody reads</b> instead of alerts on symptoms (SLO burn)'
    ]
  },

  calculator: {
    inputs: [
      { id: 'rps', label: 'Requests per second (edge)', min: 10, max: 200000, value: 2000, log: true, unit: 'req/s' },
      { id: 'spans', label: 'Spans per request', min: 1, max: 200, value: 25, log: true },
      { id: 'span', label: 'Average span size', min: 200, max: 4000, value: 800, step: 50, unit: 'B' },
      { id: 'samp', label: 'Trace sampling kept', min: 0.1, max: 100, value: 10, log: true, unit: '%' },
      { id: 'logs', label: 'Log lines per request (500 B each)', min: 0, max: 100, value: 12, step: 1 },
      { id: 'series', label: 'Series per service × services', min: 1000, max: 20000000, value: 400000, log: true, fmt: 'num' }
    ],
    outputs: [
      { label: 'Traces ingested per day', fmt: 'bytes', f: (v) => v.rps * 86400 * v.spans * v.span * v.samp / 100 },
      { label: 'Logs ingested per day', fmt: 'bytes', f: (v) => v.rps * 86400 * v.logs * 500 },
      { label: 'Active metric series', fmt: 'num', f: (v) => v.series },
      { label: 'Monthly cost: traces ($0.30/GB, illustrative)', f: (v) => '$' + Math.round(v.rps * 86400 * v.spans * v.span * v.samp / 100 / 1e9 * 30 * 0.30).toLocaleString('en-US') },
      { label: 'Monthly cost: logs ($0.50/GB, illustrative)', f: (v) => '$' + Math.round(v.rps * 86400 * v.logs * 500 / 1e9 * 30 * 0.50).toLocaleString('en-US') },
      { label: 'Monthly cost: metrics ($0.08/series, illustrative)', f: (v) => '$' + Math.round(v.series * 0.08).toLocaleString('en-US') }
    ],
    note: 'Trace bytes/day = rps × 86,400 × spans × span size × sampling. Logs assume 500 B per JSON line. Prices are <em>illustrative</em> list-price magnitudes for a managed backend, not any vendor\'s quote; self-hosted cost is mostly storage and people. Notice how quickly <b>logs</b> dominate, and how a single high-cardinality label can multiply the series count by 1000×.'
  },

  api: [
    { m: 'HTTP', p: 'traceparent / tracestate headers', d: 'W3C Trace Context: <code>traceparent: 00-&lt;32 hex trace-id&gt;-&lt;16 hex parent-id&gt;-01</code>. The last byte holds the <b>sampled</b> flag. <code>tracestate</code> carries vendor data. The same keys go into Kafka record headers.' },
    { m: 'HTTP', p: 'baggage header', d: 'W3C Baggage: key=value pairs (e.g. <code>tenant=acme</code>) propagated to every downstream service. Never put PII or secrets in it: it leaves your trust boundary with every outbound call.' },
    { m: 'YAML', p: 'otel-collector.yaml', d: 'Pipelines of <b>receivers</b> (otlp, prometheus, filelog) → <b>processors</b> (memory_limiter, batch, attributes/redaction, tail_sampling) → <b>exporters</b> (otlp to Tempo/Jaeger/vendor, prometheusremotewrite, Loki).' },
    { m: 'POLICY', p: 'Telemetry conventions', d: 'OpenTelemetry semantic conventions (<code>http.request.method</code>, <code>db.system</code>…), required resource attributes, log field names, allowed metric labels, PII rules, sampling policy and retention per signal.' },
    { m: 'DOC', p: 'Service instrumentation checklist', d: 'RED metrics with SLO buckets, inbound/outbound spans, async context propagation, JSON logs with trace ids, exemplars on, dashboards and runbook links. Part of the production-readiness review.' },
    { m: 'SLO', p: 'Telemetry budget', d: 'Per team: GB/day of logs and traces, active series cap, cost owner. Alert when a deploy doubles series or log volume.' }
  ],

  dataModel: [
    { name: 'span', store: 'Trace store (Tempo / Jaeger / vendor)', fields: [['trace_id', '16 bytes', 'pk'], ['span_id', '8 bytes', 'pk'], ['parent_span_id', '8 bytes', 'fk'], ['name', 'text'], ['kind', 'SERVER | CLIENT | PRODUCER | CONSUMER'], ['start, end', 'unix nanos'], ['status', 'UNSET | OK | ERROR'], ['attributes', 'map'], ['resource', 'service.name, version…']], note: 'A trace is just all spans with the same trace_id; the tree is rebuilt from parent ids.' },
    { name: 'log_record', store: 'Log store (Loki / Elasticsearch / ClickHouse)', fields: [['timestamp', 'timestamptz'], ['severity', 'DEBUG … FATAL'], ['body', 'text'], ['trace_id', 'hex', 'idx'], ['span_id', 'hex'], ['service.name', 'label', 'idx'], ['attributes', 'JSON']], note: 'Index the few fields you filter on; keep the rest in compressed chunks.' },
    { name: 'metric_series', store: 'TSDB (Prometheus / Mimir)', fields: [['name', 'http_server_requests_seconds', 'pk'], ['labels', 'service, route, method, status', 'pk'], ['bucket le', 'histogram'], ['exemplar', 'trace_id + value'], ['samples', '(ts, value)[]']], note: 'One series per unique label set: labels must be bounded. Exemplars carry the high-cardinality id instead.' },
    { name: 'wide_event', store: 'Columnar event store (Honeycomb-style)', fields: [['timestamp', 'timestamptz'], ['trace_id, span_id', 'hex', 'idx'], ['duration_ms', 'float'], ['user_id, tenant, build_id …', 'any cardinality'], ['200+ more columns', 'sparse']], note: 'The "observability 2.0" model: one rich event per unit of work; metrics are derived at query time.' }
  ],

  architecture: {
    title: 'Instrumented services → OpenTelemetry Collector → three stores, joined by trace id',
    nodes: [
      { id: 'user', label: 'Client', sub: 'browser / app', kind: 'client', wide: [90, 0], tall: [70, 0], tip: 'Real-user monitoring can start the trace in the browser and send traceparent.' },
      { id: 'gw', label: 'API gateway', sub: 'starts trace', kind: 'edge', wide: [290, 0], tall: [210, 0], tip: 'Creates the root span if no valid traceparent arrives, and makes the head sampling decision.' },
      { id: 'ord', label: 'Orders svc', sub: 'OTel Java agent', kind: 'service', wide: [490, 0], tall: [350, 0], tip: 'Auto-instrumentation wraps HTTP server/client, JDBC and Kafka clients with no code change.' },
      { id: 'kafka', label: 'Kafka', sub: 'traceparent header', kind: 'queue', wide: [690, 0], tall: [350, 105], tip: 'Context rides in record headers; the consumer span links to the producer span.' },
      { id: 'pay', label: 'Payments svc', sub: 'manual spans', kind: 'service', wide: [890, 0], tall: [210, 105], tip: 'Business spans and attributes added by hand on top of the agent.' },
      { id: 'db', label: 'Postgres', sub: 'db.query span', kind: 'store', wide: [490, 105], tall: [70, 105], tip: 'The client span measures the query as the service sees it, including pool wait.' },
      { id: 'col', label: 'OTel Collector', sub: 'batch · redact · tail', kind: 'compute', wide: [690, 105], tall: [210, 210], tip: 'Receives OTLP, removes PII, buffers whole traces and decides what to keep.' },
      { id: 'tsdb', label: 'Metrics TSDB', sub: 'RED + exemplars', kind: 'store', wide: [490, 210], tall: [70, 315], tip: 'Prometheus or Mimir; histograms carry exemplar trace ids.' },
      { id: 'logs', label: 'Log store', sub: 'JSON + trace_id', kind: 'store', wide: [690, 210], tall: [210, 315], tip: 'Loki, Elasticsearch or ClickHouse; filter by trace_id.' },
      { id: 'traces', label: 'Trace store', sub: 'Tempo / Jaeger', kind: 'store', wide: [890, 210], tall: [350, 315], tip: 'Looks up all spans of a trace by id.' },
      { id: 'ui', label: 'Grafana / UI', sub: 'jump between signals', kind: 'client', wide: [690, 315], tall: [210, 420], tip: 'Metric → exemplar → trace → logs, all by trace id.' },
      { id: 'oncall', label: 'On-call', sub: 'debugging', kind: 'person', wide: [490, 315], tall: [70, 420], tip: 'Starts from an SLO burn alert, ends at a span.' }
    ],
    edges: [
      { from: 'user', to: 'gw' },
      { from: 'gw', to: 'ord', label: 'traceparent' },
      { from: 'ord', to: 'kafka' },
      { from: 'kafka', to: 'pay' },
      { from: 'ord', to: 'db' },
      { from: 'ord', to: 'col', dashed: true },
      { from: 'pay', to: 'col', dashed: true },
      { from: 'gw', to: 'col', dashed: true, bend: 0.25 },
      { from: 'col', to: 'tsdb' },
      { from: 'col', to: 'logs' },
      { from: 'col', to: 'traces' },
      { from: 'tsdb', to: 'ui' },
      { from: 'logs', to: 'ui' },
      { from: 'traces', to: 'ui' },
      { from: 'ui', to: 'oncall', bidi: true }
    ]
  },

  scenarios: [
    {
      id: 'propagate', title: 'One request, one trace id', tone: 'info',
      steps: [
        { text: 'The gateway receives a request with no <code>traceparent</code>, so it creates a <b>root span</b> with a new 16-byte trace id and decides "sampled".', flow: ['user>gw'], badges: { gw: 'trace 4bf9…' } },
        { text: 'It calls Orders with <code>traceparent: 00-4bf9…-00f0…-01</code>. The OTel agent in Orders reads it and makes a <b>child SERVER span</b>.', flow: ['gw>ord'], badges: { ord: 'child span' } },
        { text: 'Orders queries Postgres (a CLIENT span) and publishes to Kafka: the agent writes <code>traceparent</code> into the <b>record headers</b>.', flow: [['ord>db', 'ord>kafka']], badges: { kafka: 'header' } },
        { text: 'Payments consumes the record, continues the trace (CONSUMER span) and logs JSON with the same <code>trace_id</code>.', flow: ['kafka>pay'], badges: { pay: 'same trace_id' } },
        { text: 'All services export spans, logs and metrics over <b>OTLP</b> to the Collector, which fans them out to three stores.', flow: [['gw>col', 'ord>col', 'pay>col'], ['col>tsdb', 'col>logs', 'col>traces']], ok: ['col'], tone: 'ok' }
      ]
    },
    {
      id: 'debug', title: 'Incident: metric → exemplar → trace → logs', tone: 'err',
      steps: [
        { text: 'An SLO burn alert fires: checkout p99 is 2.4 s. The latency <b>histogram</b> in the TSDB shows the bad bucket.', flow: ['tsdb>ui', 'ui>oncall'], err: ['oncall'], badges: { tsdb: ['p99 2.4 s', 'err'] }, tone: 'err' },
        { text: 'The bucket carries an <b>exemplar</b>: a real trace id that landed in it. One click opens that trace.', flow: ['traces>ui'], badges: { traces: 'exemplar' } },
        { text: 'The waterfall shows 1.9 s inside the Orders → Postgres span. Every other span is fast.', nodes: ['ord', 'db'], err: ['db'], badges: { db: ['1.9 s', 'err'] } },
        { text: 'Filter logs by that <code>trace_id</code>: "connection pool exhausted, waited 1.8 s". The cause is pool size after a deploy, not the query.', flow: ['logs>ui'], badges: { logs: ['pool wait', 'warn'] } },
        { text: 'Roll back, raise the pool limit, and add a <b>pool-wait metric</b> (USE: saturation) so it is detectable next time.', flow: ['ui>oncall'], ok: ['db', 'oncall'], tone: 'ok' }
      ]
    },
    {
      id: 'sampling', title: 'Head sampling hides the bad trace', tone: 'warn',
      steps: [
        { text: 'The gateway samples <b>10% at the head</b>, by trace id. The decision travels downstream in the sampled flag, so the trace is complete or absent.', flow: ['user>gw', 'gw>ord'], badges: { gw: '10% head' } },
        { text: 'One request in 1,000 fails in Payments. 90% of those failing traces were <b>dropped before they failed</b>.', flow: ['ord>kafka', 'kafka>pay'], err: ['pay'], badges: { pay: ['error, not kept', 'err'] }, tone: 'err' },
        { text: 'Switch to <b>tail sampling</b>: services send 100% of spans to the Collector, which buffers each trace (<code>decision_wait</code>, e.g. 10–30 s) and then applies policies.', flow: [['gw>col', 'ord>col', 'pay>col']], labels: { col: { label: 'OTel Collector', sub: 'tail_sampling' } } },
        { text: 'Policies: keep <b>all errors</b>, keep <b>latency &gt; 500 ms</b>, keep <b>5% of the rest</b>. Storage stays near 10%, but every failure is kept.', flow: ['col>traces'], ok: ['traces'], badges: { traces: ['all errors kept', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'cardinality', title: 'At scale: cardinality explosion', tone: 'err',
      steps: [
        { text: 'A developer adds <code>user_id</code> as a label on <code>http_server_requests</code> to debug one customer.', nodes: ['ord'], warn: ['ord'], badges: { ord: ['+user_id label', 'warn'] } },
        { text: '20 routes × 5 statuses × 30 buckets × 2 M users = <b>6 billion potential series</b>. Active series jump 100× within an hour.', flow: ['ord>col', 'col>tsdb'], err: ['tsdb'], badges: { tsdb: ['OOM / bill ×100', 'err'] }, tone: 'err' },
        { text: 'Fix: drop the label in the Collector (attributes processor) and enforce a <b>label allow-list</b> plus a series cap per service.', nodes: ['col'], ok: ['col'], badges: { col: 'drop user_id' } },
        { text: 'Keep per-user detail where it is cheap: as a <b>span attribute</b> or in a wide event, and as an exemplar trace id on the metric.', flow: ['col>traces'], ok: ['tsdb', 'traces'], tone: 'ok' }
      ]
    },
    {
      id: 'async', title: 'Lost context across Kafka', tone: 'warn',
      steps: [
        { text: 'Orders publishes an event with a hand-rolled producer that does not copy headers. The trace <b>ends at the topic</b>.', flow: ['ord>kafka'], warn: ['kafka'], badges: { kafka: ['no traceparent', 'warn'] }, tone: 'warn' },
        { text: 'Payments starts a new, unrelated trace. A payment failure cannot be tied to the order that caused it.', flow: ['kafka>pay'], err: ['pay'], badges: { pay: ['orphan trace', 'err'] } },
        { text: 'Fix: inject context with the OTel propagator into record headers; on consume, extract it and start a CONSUMER span with a <b>link</b> (batches can have many parents).', flow: ['ord>kafka', 'kafka>pay'], ok: ['kafka', 'pay'], badges: { kafka: ['traceparent', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Four choices every platform or service architect makes. Meter values are <em>illustrative</em>, derived from the reasoning in the notes rather than from a benchmark.',
    diagram: null,
    controls: [
      { id: 'samp', label: 'Trace sampling', type: 'seg', value: 'tail', options: [
        { v: 'h100', l: '100% head', hint: 'keep everything' },
        { v: 'h10', l: '10% head', hint: 'probabilistic, at the root' },
        { v: 'tail', l: 'Tail: errors + slow + 5%', hint: 'decided in the Collector' }] },
      { id: 'log', label: 'Logging', type: 'seg', value: 'json', options: [
        { v: 'text', l: 'Unstructured text' },
        { v: 'json', l: 'Structured JSON + trace_id' }] },
      { id: 'labels', label: 'Metric labels', type: 'seg', value: 'low', options: [
        { v: 'low', l: 'Low cardinality (route, status)' },
        { v: 'high', l: 'High cardinality (+ user_id)' }] },
      { id: 'inst', label: 'Instrumentation', type: 'seg', value: 'agent', options: [
        { v: 'manual', l: 'Manual spans only' },
        { v: 'agent', l: 'OTel auto agent (+ manual)' }] }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const keep = { h100: 1, h10: 0.1, tail: 0.14 }[s.samp];
      const errKept = { h100: 1, h10: 0.1, tail: 1 }[s.samp];
      let debug = 0.25 + 0.35 * errKept + (s.log === 'json' ? 0.25 : 0) + (s.inst === 'agent' ? 0.15 : 0.05);
      if (s.labels === 'high') debug += 0.05;
      debug = clamp(debug);
      let cost = 1 * keep * 0.5 + (s.log === 'json' ? 0.25 : 0.3) + (s.labels === 'high' ? 1.2 : 0.1);
      if (s.samp === 'tail') cost += 0.08;
      const series = s.labels === 'high' ? '≈ 2–6 M active series' : '≈ 20–60 k active series';
      let over = (s.inst === 'agent' ? 1.5 : 0.8) + (s.samp === 'h100' ? 1.2 : s.samp === 'tail' ? 0.8 : 0.2);
      let mttr = 15 + (1 - errKept) * 50 + (s.log === 'text' ? 40 : 0) + (s.inst === 'manual' ? 25 : 0);
      const metrics = [
        { k: 'Debuggability', v: debug > 0.85 ? 'high: any bad request explainable' : debug > 0.6 ? 'medium: gaps in the story' : 'low: guesswork', s: debug },
        { k: 'Telemetry cost', v: '≈ ' + cost.toFixed(2) + '× baseline', s: clamp(1 - (cost - 0.4) / 1.6), hint: 'illustrative' },
        { k: 'Cardinality risk', v: series, s: s.labels === 'high' ? 0.1 : 0.9 },
        { k: 'Runtime overhead', v: '≈ ' + over.toFixed(1) + '% CPU', s: clamp(1 - over / 6), hint: 'estimate' },
        { k: 'Errors with a trace', v: Math.round(errKept * 100) + '%', s: errKept },
        { k: 'MTTR (typical incident)', v: '≈ ' + Math.round(mttr) + ' min', s: clamp(1 - (mttr - 15) / 120), hint: 'illustrative' }
      ];
      const notes = [];
      if (s.samp === 'h100') notes.push('Keeping 100% is fine at low traffic, but storage scales linearly with requests; most of what you keep is identical healthy traces.');
      if (s.samp === 'h10') notes.push('Head sampling is decided before the outcome is known: <b>90% of failing traces are gone</b>. It is cheap and stateless, and its decision propagates in the <code>sampled</code> flag.');
      if (s.samp === 'tail') notes.push('Tail sampling needs <b>all spans of a trace on one Collector</b> (route by trace id with the load-balancing exporter) and memory for <code>decision_wait</code> seconds of traffic.');
      if (s.log === 'text') notes.push('Free-text logs cannot be filtered by field or joined to traces; you pay to index text you then grep.');
      if (s.labels === 'high') notes.push('<code>user_id</code> as a metric label multiplies series by the number of users. Put it on spans or wide events and use <b>exemplars</b> instead.');
      if (s.inst === 'manual') notes.push('Manual-only instrumentation misses the JDBC, HTTP client and Kafka spans where most latency hides. Start with the agent, add business spans by hand.');
      let verdict;
      if (s.labels === 'high') verdict = '❌ <b>Cardinality explosion:</b> the TSDB bill and memory grow with your user count. Move user_id off metric labels.';
      else if (s.samp === 'h10' && s.log === 'text') verdict = '⚠ <b>Cheap but blind:</b> most failures have no trace and logs cannot be joined to anything.';
      else if (s.samp === 'tail' && s.log === 'json' && s.inst === 'agent') verdict = '✅ <b>Good default:</b> OTel agent, JSON logs with trace ids, low-cardinality metrics and tail sampling that keeps every error and slow trace.';
      else if (s.samp === 'h100') verdict = '👍 <b>Complete but costly:</b> fine for low traffic or a pre-production environment; add tail sampling before scale.';
      else verdict = '👍 <b>Workable,</b> but one signal is weaker than it needs to be. See the notes.';
      return {
        metrics, verdict, notes,
        labels: {
          col: { label: 'OTel Collector', sub: s.samp === 'tail' ? 'tail: err+slow+5%' : s.samp === 'h10' ? 'pass-through (10%)' : 'pass-through (100%)' },
          ord: { label: 'Orders svc', sub: s.inst === 'agent' ? 'OTel Java agent' : 'manual spans only' },
          logs: { label: 'Log store', sub: s.log === 'json' ? 'JSON + trace_id' : 'free text' },
          tsdb: { label: 'Metrics TSDB', sub: s.labels === 'high' ? '+ user_id label' : 'RED + exemplars' }
        },
        err: s.labels === 'high' ? ['tsdb'] : [],
        warn: (s.log === 'text' ? ['logs'] : []).concat(s.samp === 'h10' ? ['traces'] : []),
        ok: s.samp === 'tail' ? ['col'] : [],
        badges: { traces: [Math.round(errKept * 100) + '% of errors', errKept === 1 ? 'ok' : 'err'] },
        flow: ['user>gw', 'gw>ord', ['ord>db', 'ord>kafka'], 'kafka>pay', ['ord>col', 'pay>col'], ['col>tsdb', 'col>logs', 'col>traces'], 'traces>ui']
      };
    }
  },

  widget: {
    title: 'Trace waterfall: head vs tail sampling',
    caption: 'A checkout request fans out through <b>gateway → orders → inventory (DB) and payments</b>. Run 200 requests (about 4% fail, about 6% hit a slow DB query) under <b>head</b> (10% by trace id) or <b>tail</b> sampling (keep errors, slow &gt; 500 ms, plus 5%). Pick a kept trace to see its waterfall, tap a span to see the log lines that share its <code>trace_id</code>, and tap the red dot on the latency histogram to follow its <b>exemplar</b>.'
  },

  realWorld: {
    intro: 'From Google\'s internal tracer to an open standard, and a live debate about whether "three pillars" is the right model at all.',
    timeline: [
      { when: '1960', who: 'R. E. Kálmán', title: 'Observability in control theory', text: 'Kálmán defined a system as <b>observable</b> if its internal state can be inferred from its external outputs. Software borrowed the word: can you explain the inside of a service from its telemetry alone, without shipping new code?', src: 11 },
      { when: '2010', who: 'Google (Dapper)', title: 'Dapper paper', text: 'Sigelman et al. describe Google\'s production tracer: spans and trees, <b>low overhead through sampling</b>, and instrumentation in a <b>small number of common libraries</b> so applications get tracing transparently. Its first production version sampled 1 in 1024 traces.', src: 0 },
      { when: '2016', who: 'Google (SRE book)', title: 'The four golden signals', text: '"If you can only measure four metrics of your user-facing system, focus on these four": <b>latency, traffic, errors and saturation</b>. Alert on symptoms users see, not on causes.', src: 1 },
      { when: '2012 / 2018', who: 'Brendan Gregg · Tom Wilkie', title: 'USE and RED methods', text: 'Gregg\'s <b>USE</b>: for every resource, check utilization, saturation and errors. Wilkie\'s <b>RED</b> (Weaveworks, later Grafana): for every service, rate, errors, duration. RED is about your users, USE about your machines.', src: 2 },
      { when: '2019', who: 'CNCF', title: 'OpenTracing + OpenCensus = OpenTelemetry', text: 'The two competing projects merged in May 2019 into OpenTelemetry, a CNCF sandbox project with one API, SDKs and a Collector for traces, metrics and logs. It became incubating in 2021; OpenCensus repos were archived in 2023.', src: 3 },
      { when: '2020 / 2021', who: 'W3C', title: 'Trace Context becomes a Recommendation', text: 'The <code>traceparent</code> and <code>tracestate</code> headers became a W3C Recommendation in February 2020 (editorial update November 2021), so any vendor can continue another vendor\'s trace.', src: 5 },
      { when: '2024', who: 'OpenTelemetry', title: 'Profiles: a fourth signal', text: 'OpenTelemetry announced support for <b>profiling</b> in March 2024, and Elastic donated its continuous profiling agent. Profiles link CPU and memory hot spots to the spans that caused them.', src: 7 },
      { when: '2024', who: 'Honeycomb (Charity Majors)', title: '"Observability 2.0": against the pillars', text: 'Majors argues that the one key difference is the storage model: observability 1.0 keeps metrics, logs and traces in <b>separate stores</b>; 2.0 keeps <b>one source of truth of wide, structured events</b> from which the others can be derived, with high cardinality as a feature.', src: 9 }
    ],
    lessons: [
      'Pillars are a <b>data model</b>, not a goal: the value is in the joins (exemplars, trace ids in logs).',
      'Instrument at the <b>library and framework layer</b> (Dapper\'s lesson, OTel agents), not in every handler.',
      'Decide sampling <b>after</b> the outcome when you can afford the buffering: errors and slow requests are the traces you need.',
      'Keep metric labels bounded; put high-cardinality context on spans or wide events.',
      'Standardise on OpenTelemetry and W3C headers so backends stay a procurement choice.'
    ],
    sources: [
      { title: 'Dapper, a Large-Scale Distributed Systems Tracing Infrastructure', url: 'https://research.google/pubs/dapper-a-large-scale-distributed-systems-tracing-infrastructure/', pub: 'Google Technical Report (2010)' },
      { title: 'Chapter 6 - Monitoring Distributed Systems', url: 'https://sre.google/sre-book/monitoring-distributed-systems/', pub: 'Google, Site Reliability Engineering (2016)' },
      { title: 'The RED Method: How to Instrument Your Services', url: 'https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/', pub: 'Grafana Labs (2018)' },
      { title: 'A brief history of OpenTelemetry (so far)', url: 'https://www.cncf.io/blog/2019/05/21/a-brief-history-of-opentelemetry-so-far/', pub: 'CNCF blog (2019)' },
      { title: 'OpenTelemetry: the merger of OpenCensus and OpenTracing', url: 'https://opensource.googleblog.com/2019/05/opentelemetry-merger-of-opencensus-and.html', pub: 'Google Open Source blog (2019)' },
      { title: 'Trace Context (W3C Recommendation)', url: 'https://www.w3.org/TR/trace-context/', pub: 'W3C' },
      { title: 'Sunsetting OpenCensus', url: 'https://opentelemetry.io/blog/2023/sunsetting-opencensus/', pub: 'OpenTelemetry blog (2023)' },
      { title: 'OpenTelemetry announces support for profiling', url: 'https://opentelemetry.io/blog/2024/profiling/', pub: 'OpenTelemetry blog (2024)' },
      { title: 'Elastic contributes its continuous profiling agent to OpenTelemetry', url: 'https://opentelemetry.io/blog/2024/elastic-contributes-continuous-profiling-agent/', pub: 'OpenTelemetry blog (2024)' },
      { title: 'There Is Only One Key Difference Between Observability 1.0 and 2.0', url: 'https://charity.wtf/p/there-is-only-one-key-difference-between-observability-1-0-and-2-0', pub: 'Charity Majors (Honeycomb blog, 2024)' },
      { title: 'Tracing: tail sampling processor', url: 'https://pkg.go.dev/github.com/open-telemetry/opentelemetry-collector-contrib/processor/tailsamplingprocessor', pub: 'OpenTelemetry Collector Contrib' },
      { title: 'Systems Performance methodology (USE method)', url: 'https://brendangregg.com/Slides/ACMApplicative2016_SystemMethodology.pdf', pub: 'Brendan Gregg, ACM Applicative (2016)' },
      { title: 'Spring Boot reference: Tracing', url: 'https://docs.spring.io/spring-boot/3.4.0/reference/actuator/tracing.html', pub: 'Spring Boot 3.4 docs' },
      { title: 'Controllability and observability (cites Kalman, IFAC Moscow 1960)', url: 'https://ncatlab.org/nlab/show/reachability', pub: 'nLab' }
    ]
  },

  tradeoffs: {
    headers: ['Choice', 'Gain', 'Cost', 'Pick when'],
    rows: [
      ['<b>Head sampling</b> (probabilistic at the root)', 'Stateless, cheap, consistent across services via the sampled flag', 'Misses most rare errors and slow outliers', 'High volume, healthy traffic, cost first'],
      ['<b>Tail sampling</b> (Collector decides after completion)', 'Keeps 100% of errors and slow traces at ~10% storage', 'Buffer memory, trace-id-aware routing, decision delay', 'Default for production microservices'],
      ['<b>Three pillars</b> (TSDB + log store + trace store)', 'Mature, cheap metrics, many tools, OTel-native', 'Three data models; joins only via ids and exemplars', 'Most organisations today'],
      ['<b>Wide events</b> ("observability 2.0")', 'Any dimension, any cardinality, metrics derived at query time', 'Columnar store, event volume cost, newer tooling', 'High-cardinality debugging, product + ops questions'],
      ['<b>Auto-instrumentation agent</b>', 'Coverage on day one: HTTP, JDBC, Kafka, gRPC', 'Some overhead, noisy spans, version coupling', 'JVM/.NET/Python services; then add business spans'],
      ['<b>Vendor SDK</b> instead of OTel', 'Deep vendor features out of the box', 'Lock-in: re-instrumenting to switch', 'Rarely; prefer OTel plus vendor exporter']
    ]
  },

  failures: [
    { f: '<b>Cardinality explosion</b> from user_id, request_id or raw URLs as metric labels', detect: 'Active series per job jumps after a deploy; TSDB memory or bill spikes', fix: 'Label allow-list, Collector attribute drop, per-tenant series limits; use exemplars and span attributes' },
    { f: '<b>Broken context</b> across async hops (Kafka, thread pools, @Async)', detect: 'Orphan root spans in consumer services; traces end at the producer', fix: 'Propagator inject/extract in headers; context-aware executors; span links for batches' },
    { f: '<b>Head sampling drops the incident</b>', detect: 'Error-rate metric is up but no error traces exist', fix: 'Tail sampling with error and latency policies, or always-sample on error in a second pass' },
    { f: '<b>PII in telemetry</b> (emails in logs, card numbers in span attributes, user data in baggage)', detect: 'Scanners on log streams; audit of span attributes', fix: 'Mask at source, redaction processor in the Collector, never put PII in baggage' },
    { f: '<b>Log volume runaway</b> (DEBUG left on, logging in tight loops)', detect: 'GB/day per service alert; log bill per team', fix: 'Default INFO, dynamic levels, sampling of repetitive lines, short retention for debug' },
    { f: '<b>Telemetry hurting production</b>: synchronous export, unbounded queues', detect: 'Latency rises when the backend is slow; OOM in the exporter', fix: 'Batch span processor with bounded queue, drop on overflow, memory_limiter in the Collector' },
    { f: '<b>Clock skew</b> making child spans start before parents', detect: 'Negative gaps in waterfalls', fix: 'NTP/chrony; trust durations within a process, not cross-host timestamps' }
  ],

  interview: [
    { q: 'What is the difference between monitoring and observability?', a: '<b>Monitoring</b> answers questions you knew to ask in advance: dashboards and alerts on known failure modes. <b>Observability</b> (from Kálmán\'s 1960 control theory: inferring internal state from outputs) is the ability to ask <b>new</b> questions of production without shipping new code. In practice you need both: monitoring tells you <i>that</i> something is wrong (SLO burn), observability lets you find <i>why</i>. A common misreading is that buying a tracing tool makes you observable; it depends on what context you emit.', lvl: 'core' },
    { q: 'Explain the three pillars and what each is best at.', a: '<b>Metrics</b>: aggregated numbers (counters, gauges, histograms), cheap to store and query over long ranges, ideal for alerting and trends, poor at individual requests. <b>Logs</b>: discrete events with detail, ideal for explaining what code did, expensive at volume. <b>Traces</b>: the causal tree of spans for one request across services, ideal for locating latency and errors. Join them with a shared <code>trace_id</code> and exemplars. Profiles are increasingly called the fourth signal.', fu: 'What would you instrument first in a new service?', lvl: 'core' },
    { q: 'RED, USE and the four golden signals: when do you use which?', a: '<b>RED</b> (Tom Wilkie): rate, errors, duration for every request-driven service. <b>USE</b> (Brendan Gregg): utilization, saturation, errors for every resource (CPU, pool, disk, queue). <b>Golden signals</b> (Google SRE book): latency, traffic, errors, saturation for a user-facing system. RED/golden signals drive alerts (user symptoms), USE helps diagnose causes. I would put RED plus saturation on every service dashboard.', lvl: 'core' },
    { q: 'How does context propagation work, including across Kafka?', a: 'The caller injects <b>W3C <code>traceparent</code></b> (<code>00-traceid-parentspanid-flags</code>) into outbound HTTP or gRPC headers; the callee extracts it and creates a child span. For Kafka, the producer instrumentation writes the same header into <b>record headers</b>; the consumer extracts it and starts a CONSUMER span, using <b>span links</b> when a batch contains messages from many traces. Inside a process, context lives in a thread-local or coroutine context, so thread pools need context-wrapping executors. <code>baggage</code> carries business keys, but never PII.', fu: 'What breaks when a team uses its own Kafka wrapper?', lvl: 'deep' },
    { q: 'Head-based versus tail-based sampling: what would you choose?', a: '<b>Head</b>: decided at the root, usually by hashing the trace id, propagated via the sampled flag. Cheap and consistent, but it decides before the outcome, so 10% head sampling keeps only 10% of errors. <b>Tail</b>: services send every span to a Collector tier that buffers the trace (<code>decision_wait</code>) and applies policies such as status_code ERROR, latency &gt; 500 ms and a probabilistic baseline. Cost: memory, trace-id-aware routing (load-balancing exporter) and a decision delay. My default is a light head sample only at extreme volume, plus tail sampling for errors and slow traces.', lvl: 'core' },
    { q: 'What is cardinality, and how do you prevent a cardinality explosion?', a: 'Each unique combination of metric name and label values is a time series. Labels like <code>user_id</code> or full URLs multiply series by millions: memory, query time and cost explode. Prevention: <b>label allow-lists</b> in conventions, route templates (<code>/orders/{id}</code>) instead of raw paths, a Collector processor to drop labels, per-service series limits, and CI checks. Keep high-cardinality context on spans, logs or wide events, and use <b>exemplars</b> to link a metric bucket to a specific trace.', lvl: 'core' },
    { q: 'What is OpenTelemetry, and why standardise on it?', a: 'OpenTelemetry (CNCF, formed in 2019 by merging OpenTracing and OpenCensus) provides a vendor-neutral <b>API</b>, language <b>SDKs</b>, <b>auto-instrumentation</b> (e.g. the Java agent), the <b>OTLP</b> protocol, semantic conventions, and the <b>Collector</b> with receivers, processors and exporters. Standardising means you instrument once and switch or mix backends by changing exporter config, not code. The Collector is also where you centralise redaction, sampling and routing.', fu: 'Agent or Collector: what runs where?', lvl: 'core' },
    { q: 'What is the "observability 2.0" critique of the three pillars?', a: 'Charity Majors (Honeycomb) argues the pillars are three siloed stores of the same truth, each lossy: metrics pre-aggregate away the dimensions you need, logs are unstructured, traces are sampled separately. Observability 2.0 stores <b>one wide, structured event per unit of work</b> with arbitrarily many high-cardinality fields and derives metrics and traces from it at query time. Counterpoint: metrics are still far cheaper for long-range alerting, and most teams already run pillar tooling. A balanced answer: emit rich span events through OTel (spans are wide events), keep a few cheap metrics for SLOs.', lvl: 'deep' },
    { q: 'Design telemetry for 50 microservices at 20k requests per second within a budget.', a: 'OTel agents in every service, exporting OTLP to a <b>Collector agent</b> per node and a <b>gateway Collector</b> tier routed by trace id. Metrics: RED with SLO buckets, low-cardinality labels, exemplars on. Traces: tail sampling (all errors, latency above the SLO threshold, 1–5% baseline). Logs: JSON with trace ids, INFO by default, debug retention of days not months. Budget: 20k × 86,400 × 25 spans × 800 B ≈ 35 TB/day unsampled, so sampling is not optional; at 10% it is about 3.5 TB/day. Owners and per-team quotas on GB/day and series.', lvl: 'deep' },
    { q: 'How do structured logs and traces fit together? What goes in a log line?', a: 'JSON with stable field names: timestamp, level, service.name, message, <code>trace_id</code>, <code>span_id</code>, and a few domain keys (order_id, tenant). The logging bridge or MDC fills trace ids automatically. Levels: ERROR for things that need action, WARN for degraded, INFO for business events, DEBUG off in production or sampled. Mask PII at source. With trace ids in logs you jump from a span to exactly its lines; you can also attach important events to the span itself (span events).', lvl: 'core' },
    { q: 'Tell me about a time better instrumentation shortened an incident.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Checkout p99 rose from 400 ms to 2 s twice a week; each incident took about 3 hours, spent grepping logs from 9 services. <b>T:</b> As the architect, get MTTR under 30 minutes without raising telemetry spend. <b>A:</b> Rolled out the OTel Java agent through the shared base image, made JSON logs with trace ids the default in the platform logging library, enabled exemplars, and replaced 20% head sampling with tail sampling (errors, &gt; 800 ms, 5% baseline). Dropped two high-cardinality labels found in the series audit. <b>R:</b> The next incident took 18 minutes: exemplar → trace → a connection-pool wait in one service. Trace storage fell by about a third and the metrics bill fell after the label clean-up.', lvl: 'core' },
    { q: 'How would you convince teams to adopt a common instrumentation standard?', a: 'Make the right thing the default: a <b>paved road</b> (base images with the agent, a logging library that emits JSON with trace ids, a dashboard template generated per service). Show value in one incident review: the joined trace beats grep. Define a short <b>conventions doc</b> (resource attributes, label allow-list, PII rules) and enforce the cheap parts automatically in the Collector and CI. Give teams their own telemetry cost numbers so the budget conversation is concrete. In the interview, end with the decision: OTel + W3C context + tail sampling + bounded labels, revisited when volume or cost changes.', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot 3: Micrometer Tracing with the OTel bridge and OTLP export', lang: 'yaml',
      code: `# build.gradle (Spring Boot 3.2+):
#   implementation 'org.springframework.boot:spring-boot-starter-actuator'
#   implementation 'io.micrometer:micrometer-tracing-bridge-otel'
#   implementation 'io.opentelemetry:opentelemetry-exporter-otlp'
#   runtimeOnly    'io.micrometer:micrometer-registry-prometheus'
spring:
  application:
    name: orders                     # becomes service.name
management:
  tracing:
    sampling:
      probability: 1.0               # default 0.1; send all, let the Collector tail-sample
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces   # OTLP/HTTP
  metrics:
    distribution:
      percentiles-histogram:
        "[http.server.requests]": true   # buckets + exemplars for traces
  endpoints:
    web:
      exposure:
        include: health,prometheus
logging:
  structured:
    format:
      console: ecs                   # Boot 3.4+: JSON logs; trace/span ids from MDC
  pattern:
    correlation: "[\${spring.application.name:},%X{traceId:-},%X{spanId:-}] "`,
      note: 'Property names are for Spring Boot 3.x (<code>management.otlp.tracing.endpoint</code> since 3.1, structured logging since 3.4). Spring Boot 4 moved OTLP settings under <code>management.opentelemetry.tracing.export.otlp.*</code>. Kafka templates and listeners propagate context when observation is enabled (<code>spring.kafka.template.observation-enabled=true</code>, <code>spring.kafka.listener.observation-enabled=true</code>).'
    },
    {
      title: 'OpenTelemetry Collector: tail sampling pipeline', lang: 'yaml',
      code: `receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }
processors:
  memory_limiter: { check_interval: 1s, limit_percentage: 80, spike_limit_percentage: 20 }
  attributes/redact:
    actions:
      - { key: user.email, action: delete }
      - { key: enduser.id, action: hash }
  tail_sampling:
    decision_wait: 10s           # buffer each trace this long after its first span
    num_traces: 100000
    policies:
      - name: errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow
        type: latency
        latency: { threshold_ms: 500 }
      - name: baseline
        type: probabilistic
        probabilistic: { sampling_percentage: 5 }
  batch: {}
exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls: { insecure: true }
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, attributes/redact, tail_sampling, batch]
      exporters: [otlp/tempo]`,
      note: 'A trace is kept if <b>any</b> policy matches. All spans of one trace must reach the same Collector instance, so put a first tier with the <code>loadbalancing</code> exporter (routing by trace id) in front of a horizontally scaled sampling tier.'
    },
    {
      title: 'Python 3.11: manual span and a JSON log line carrying trace_id', lang: 'python',
      code: `import json, logging
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.trace import Status, StatusCode

provider = TracerProvider(resource=Resource.create({"service.name": "payments"}))
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint="http://otel-collector:4318/v1/traces")))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("payments")

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ctx = trace.get_current_span().get_span_context()
        return json.dumps({
            "ts": self.formatTime(record), "level": record.levelname,
            "service.name": "payments", "msg": record.getMessage(),
            "trace_id": format(ctx.trace_id, "032x") if ctx.is_valid else None,
            "span_id": format(ctx.span_id, "016x") if ctx.is_valid else None,
            **getattr(record, "fields", {}),
        })

handler = logging.StreamHandler(); handler.setFormatter(JsonFormatter())
log = logging.getLogger("payments"); log.addHandler(handler); log.setLevel(logging.INFO)

def charge(order_id: str, amount_cents: int) -> None:
    with tracer.start_as_current_span("charge_card") as span:
        span.set_attribute("order.id", order_id)          # fine on a span, never a metric label
        span.set_attribute("payment.amount_cents", amount_cents)
        try:
            ...  # call the payment provider
            log.info("card charged", extra={"fields": {"order_id": order_id}})
        except TimeoutError as exc:
            span.record_exception(exc)
            span.set_status(Status(StatusCode.ERROR, "provider timeout"))
            log.error("charge failed", extra={"fields": {"order_id": order_id}})
            raise`,
      note: 'Needs <code>opentelemetry-sdk</code> and <code>opentelemetry-exporter-otlp-proto-http</code>. In production you would usually let <code>opentelemetry-instrument</code> (auto-instrumentation) add HTTP and DB spans and the logging integration inject ids.'
    }
  ],

  related: ['slo-error-budgets', 'incident-management', 'service-mesh', 'chaos-engineering', 'sd:observability', 'event-driven-sagas']
});
