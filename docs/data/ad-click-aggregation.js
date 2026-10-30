SD.register({
  slug: 'ad-click-aggregation',
  domain: 7,
  title: 'Ad Click Aggregation',
  examples: 'Google Photon, Uber Ads',
  tagline: 'Count billions of ad clicks per ad and per minute, <b>exactly once</b>. It has to be fast enough to pace budgets and correct enough to bill.',
  tldr: {
    problem: 'Clicks arrive from many servers. Some are <b>duplicates</b> (retries, double taps, bots), some arrive out of order, and some arrive <b>minutes late</b>. Advertisers are billed on these counts, so double counting overcharges them and dropping events loses revenue.',
    idea: 'Log every raw click to <b>Kafka</b> with a <b>click_id</b> created upstream. A stream job (Flink) <b>dedups by click_id</b>, filters fraud, and counts clicks in <b>1-minute event-time windows per ad_id</b>, closed by <b>watermarks</b>. Results go to an OLAP store with idempotent upserts. The raw log is archived to S3 for nightly <b>reconciliation</b>.',
    insight: '"Exactly-once" is really <b>at-least-once delivery + deduplication + atomic or idempotent writes</b>: Flink checkpoints, Kafka transactions read with <code>read_committed</code>, and upserts keyed by (ad_id, minute). Google\'s Photon used a Paxos-backed <b>IdRegistry</b> so a click is joined at most once across datacenters.',
    numbers: [
      { v: '< 10 s', l: 'Photon average end-to-end latency (Google, SIGMOD 2013)' },
      { v: '2 min', l: 'Flink checkpoint interval in Uber\'s exactly-once ads pipeline (2021)' },
      { v: '1 min', l: 'typical aggregation window per ad_id (design choice)' }
    ]
  },

  requirements: {
    functional: [
      'Record each click (redirect or beacon) with a unique click_id',
      'Count clicks per ad_id per minute (also per campaign, country, device)',
      'Query counts for a time range for dashboards and billing',
      'Top-N ads in the last minute or hour',
      'Drop duplicates and filter fraudulent clicks',
      'Reconcile against the raw log and publish corrections'
    ],
    nonFunctional: [
      'Exactly-once counts: they feed invoices',
      'Click → visible in ~1–2 min for budget pacing',
      '10⁴–10⁶ clicks/s at peak (<em>estimate</em>, depends on scale)',
      'No data loss: raw events kept for replay',
      'Correct handling of events minutes late',
      'Aggregate queries in < 1 s'
    ],
    outOfScope: ['The ad auction and ad serving', 'Fraud ML models (only the hook)', 'Conversion attribution', 'Invoicing and payments']
  },

  calculator: {
    inputs: [
      { id: 'day', label: 'Clicks per day', min: 10000000, max: 100000000000, value: 1000000000, log: true },
      { id: 'bytes', label: 'Bytes per raw click event', min: 100, max: 2000, step: 50, value: 300, fmt: 'bytes' },
      { id: 'peak', label: 'Peak-to-average ratio', min: 1, max: 10, step: 0.5, value: 3, unit: '×' },
      { id: 'ads', label: 'Ads that get clicks in a day', min: 1000, max: 100000000, value: 2000000, log: true },
      { id: 'win', label: 'Window size', min: 1, max: 60, value: 1, unit: 'min' },
      { id: 'dedup', label: 'Dedup state TTL', min: 1, max: 48, value: 24, unit: 'h' }
    ],
    outputs: [
      { label: 'Average clicks / second', f: (v) => v.day / 86400 },
      { label: 'Peak clicks / second', f: (v) => v.day / 86400 * v.peak },
      { label: 'Kafka ingress at peak', fmt: 'bytesps', f: (v) => v.day / 86400 * v.peak * v.bytes },
      { label: 'Raw log per day (before compression)', fmt: 'bytes', f: (v) => v.day * v.bytes },
      { label: 'Aggregate rows per day (upper bound)', f: (v) => (1440 / v.win) * Math.min(v.ads, v.day / (1440 / v.win)) },
      { label: 'Dedup state (~50 B per click_id)', fmt: 'bytes', f: (v) => v.day / 24 * v.dedup * 50 }
    ],
    note: 'An ad only produces a row for windows in which it was clicked, so the row count is an upper bound. The 50 B per remembered click_id (key + RocksDB overhead) is an <em>estimate</em>. Notice that <b>dedup state</b>, not the aggregates, is the large piece of state. Its TTL is a business decision: how late can a duplicate arrive?'
  },

  api: [
    { m: 'GET', p: '/c?ad=42&imp={signed_impression}&u={landing}', d: 'The click tracker answers <b>302</b> to the landing page right away and logs the event asynchronously. <code>click_id</code> comes from the signed impression id, so a retried click carries the <b>same id</b>.' },
    { m: 'POST', p: '/v1/events/clicks', d: 'Batched events from app SDKs <code>[{click_id, ad_id, event_ts, …}]</code>. These can be minutes late: phones go offline.' },
    { m: 'RPC', p: 'Kafka produce → ad-clicks', d: 'Idempotent producer, <code>acks=all</code>, key = click_id so partitions stay even when one ad is hot.' },
    { m: 'GET', p: '/v1/ads/{ad_id}/clicks?from&to&granularity=minute', d: 'Time series for the dashboard, read from the OLAP store.' },
    { m: 'GET', p: '/v1/ads/top?window=1m&n=100&country=IN', d: 'Top-N ads. Precomputed per window, or an ORDER BY on the minute table.' },
    { m: 'GET', p: '/v1/billing/ads/{ad_id}?day=2026-10-29', d: 'Billing reads <b>reconciled</b> numbers only, never the provisional stream counts.' }
  ],
  dataModel: [
    { name: 'click_event', store: 'Kafka topic ad-clicks → S3 (Parquet)', fields: [['click_id', 'string (from impression)', 'pk'], ['ad_id', 'bigint', 'idx'], ['event_ts', 'timestamp (device/server)'], ['ip_hash, ua, user_hash', 'fraud features'], ['ingest_ts', 'timestamp']], note: 'Immutable. Retained in Kafka for days (replay) and in S3 for good (audit).' },
    { name: 'ad_click_minute', store: 'OLAP: Pinot / ClickHouse / Postgres', fields: [['ad_id', 'bigint', 'pk'], ['window_start', 'timestamptz', 'pk'], ['clicks', 'bigint'], ['source', 'stream | reconciled'], ['updated_at', 'timestamptz']], note: 'Upsert on (ad_id, window_start). Writing the same window twice is harmless.' },
    { name: 'dedup state', store: 'Flink keyed state (RocksDB)', fields: [['click_id', 'key', 'pk'], ['seen', 'boolean'], ['TTL', '24 h']], note: 'Included in every checkpoint, so it rolls back together with the Kafka offsets.' },
    { name: 'correction', store: 'Postgres', fields: [['ad_id, window_start', 'composite', 'pk'], ['stream_clicks', 'bigint'], ['batch_clicks', 'bigint'], ['run_id', 'uuid', 'idx']], note: 'An audit trail of what reconciliation changed, and why.' }
  ],

  architecture: {
    title: 'Ad click aggregation pipeline',
    nodes: [
      { id: 'usr', label: 'Users', sub: 'click an ad', kind: 'client', wide: [90, 60], tall: [105, 0], tip: 'Browsers and apps. Double taps, retries and offline phones are all normal.' },
      { id: 'redir', label: 'Click tracker', sub: '302 redirect · log', kind: 'edge', wide: [290, 60], tall: [315, 0], tip: 'Redirects the user immediately and appends the event to Kafka asynchronously. Never make the user wait for analytics.' },
      { id: 'kraw', label: 'Kafka: raw clicks', sub: 'key = click_id', kind: 'queue', wide: [490, 60], tall: [210, 105], tip: 'The durable, replayable source of truth. Keyed by click_id so a hot ad does not create a hot partition.' },
      { id: 'dedup', label: 'Dedup + fraud', sub: 'Flink · keyBy(click_id)', kind: 'compute', wide: [690, 60], tall: [350, 210], tip: 'Keyed state remembers each click_id for 24 h. Rules or models drop bot traffic.' },
      { id: 'agg', label: 'Window aggregator', sub: '1-min event-time · ad_id', kind: 'compute', wide: [890, 60], tall: [350, 315], tip: 'Tumbling event-time windows. A window fires when the watermark passes its end, and re-fires for late events within the allowed lateness.' },
      { id: 'kagg', label: 'Kafka: aggregates', sub: 'transactional', kind: 'queue', wide: [890, 190], tall: [350, 420], tip: 'Written inside a Kafka transaction that commits with each Flink checkpoint. Consumers use isolation.level=read_committed.' },
      { id: 'budget', label: 'Budget pacing', sub: 'stop spend at cap', kind: 'service', wide: [690, 190], tall: [210, 315], tip: 'Needs fresh counts (minutes) to stop serving an ad when its budget runs out.' },
      { id: 'olap', label: 'OLAP store', sub: 'Pinot / ClickHouse', kind: 'store', wide: [890, 320], tall: [350, 525], tip: 'Columnar store with upsert on (ad_id, window_start). Uber added upsert support to Pinot for this.' },
      { id: 'api', label: 'Query / billing API', sub: 'time series · top-N', kind: 'service', wide: [890, 430], tall: [210, 525], tip: 'Dashboards read provisional stream numbers. Billing reads reconciled ones.' },
      { id: 'adv', label: 'Advertisers', sub: 'dashboard · invoices', kind: 'client', wide: [690, 430], tall: [70, 525], tip: 'They see clicks within minutes, and are billed on numbers that have been audited.' },
      { id: 'lake', label: 'S3 raw archive', sub: 'Parquet · by hour', kind: 'store', wide: [490, 190], tall: [70, 210], tip: 'Every raw event, kept indefinitely for audits, disputes and recomputation.' },
      { id: 'recon', label: 'Reconciliation', sub: 'nightly batch (Spark)', kind: 'compute', wide: [490, 320], tall: [70, 315], tip: 'Recomputes the same counts from the raw archive, with all late data, and writes corrections where the stream was off.' }
    ],
    edges: [
      { from: 'usr', to: 'redir' },
      { from: 'redir', to: 'kraw' },
      { from: 'kraw', to: 'dedup' },
      { from: 'dedup', to: 'agg' },
      { from: 'agg', to: 'kagg', label: '2PC' },
      { from: 'kagg', to: 'budget' },
      { from: 'kagg', to: 'olap', label: 'upsert' },
      { from: 'olap', to: 'api' },
      { from: 'adv', to: 'api', bidi: true },
      { from: 'kraw', to: 'lake', dashed: true, label: 'archive' },
      { from: 'lake', to: 'recon' },
      { from: 'recon', to: 'olap', label: 'corrections' }
    ]
  },

  scenarios: [
    {
      id: 'click', title: 'Click → counted within a minute', tone: 'info',
      steps: [
        { text: 'A user taps an ad. The tracker <b>302-redirects</b> at once and appends <code>{click_id, ad_id, event_ts}</code> to Kafka with an idempotent producer.', flow: ['usr>redir', 'redir>kraw'], badges: { kraw: 'click c-91f' } },
        { text: 'The dedup job looks up <code>c-91f</code> in keyed state. It is new, so it is kept and remembered for 24 h. Fraud rules pass it.', flow: ['kraw>dedup'], badges: { dedup: 'new ✓' } },
        { text: 'The user double-taps and the browser sends the <b>same click_id</b> again. State says "seen", so it is dropped. This is why the id must be created upstream, not on arrival.', flow: ['usr>redir', 'redir>kraw', 'kraw>dedup'], warn: ['dedup'], badges: { dedup: ['dup dropped', 'warn'] }, tone: 'warn' },
        { text: 'The aggregator adds the click to <b>ad 42, window 12:00–12:01</b> by its <i>event</i> time. When the watermark passes 12:01:00 the window fires: 1,382 clicks.', flow: ['dedup>agg', 'agg>kagg'], badges: { agg: 'ad 42 · 1,382' } },
        { text: 'The result is written inside a Kafka transaction that commits with the next checkpoint. Pacing and the OLAP store read only committed data and <b>upsert</b> by (ad_id, minute).', flow: [['kagg>budget', 'kagg>olap']], tone: 'ok', badges: { olap: 'upserted' } },
        { text: 'The advertiser\'s dashboard shows the minute about a minute or two after the click.', flow: ['adv>api', 'api>olap'], tone: 'ok' }
      ]
    },
    {
      id: 'late', title: 'Late events and watermarks', tone: 'warn',
      steps: [
        { text: 'A phone was offline. Its click has <code>event_ts = 12:00:40</code> but reaches Kafka at 12:03. Window 12:00 already fired.', flow: ['usr>redir', 'redir>kraw', 'kraw>dedup', 'dedup>agg'], warn: ['agg'], badges: { agg: ['late by 2 min', 'warn'] }, tone: 'warn' },
        { text: 'The watermark (max event time − 30 s) says how long to wait for stragglers. A longer delay is more complete but fires later.', nodes: ['agg'], badges: { agg: 'WM = max − 30 s' } },
        { text: '<b>allowedLateness = 5 min</b>: Flink kept the window state, so it <b>re-fires</b> with 1,383. The upsert overwrites the row, so nothing is double counted.', flow: ['agg>kagg', 'kagg>olap'], ok: ['olap'], badges: { olap: ['1,382 → 1,383', 'ok'] }, tone: 'ok' },
        { text: 'A click that is later than the allowed lateness goes to a <b>side output</b> and is kept in the raw archive. Reconciliation will count it tonight.', flow: ['kraw>lake'], badges: { lake: 'kept for recon' } }
      ]
    },
    {
      id: 'crash', title: 'Aggregator crash → exactly-once recovery', tone: 'err',
      steps: [
        { text: 'A Flink TaskManager dies mid-window. Its in-memory counts are gone, and some results were written to Kafka in an <b>open, uncommitted</b> transaction.', nodes: ['agg', 'kagg'], err: ['agg'], badges: { agg: ['crashed', 'err'] }, tone: 'err' },
        { text: 'The job restarts from the last <b>checkpoint</b>, a consistent snapshot of the Kafka offsets, the dedup state and the window state, all taken at the same point.', nodes: ['kraw', 'dedup', 'agg'], warn: ['agg'], badges: { agg: ['restore ckpt 812', 'warn'] }, tone: 'warn' },
        { text: 'The open transaction is <b>aborted</b>. Consumers using <code>read_committed</code> never saw those records, so pacing and OLAP never counted them.', nodes: ['kagg', 'budget', 'olap'], ok: ['olap'], badges: { kagg: ['txn aborted', 'warn'] } },
        { text: 'Kafka replays from the checkpointed offsets. The same clicks produce the same windows, which commit at the next checkpoint. Each click is counted once. The cost: results appear only <b>after each checkpoint</b> (2 min at Uber).', flow: ['kraw>dedup', 'dedup>agg', 'agg>kagg', 'kagg>olap'], ok: ['agg'], tone: 'ok' }
      ]
    },
    {
      id: 'hot', title: 'Hot ad: a Super Bowl spot', tone: 'warn',
      steps: [
        { text: 'One ad gets 200K clicks/s. <code>keyBy(ad_id)</code> sends every one of them to <b>one subtask</b>, which falls behind. Backpressure builds and Kafka lag grows.', flow: [['usr>redir', 'usr>redir'], 'redir>kraw', 'kraw>dedup', 'dedup>agg'], err: ['agg'], badges: { agg: ['1 subtask hot', 'err'] }, tone: 'err' },
        { text: 'Ingest is still fine: the raw topic is keyed by <b>click_id</b>, so the load is spread across all partitions and all dedup subtasks.', nodes: ['kraw', 'dedup'], ok: ['kraw', 'dedup'] },
        { text: '<b>Key salting</b>: stage 1 counts by <code>(ad_id, hash(click_id) % 16)</code>, spreading the hot ad over 16 subtasks. Stage 2 adds the 16 partial counts per ad.', nodes: ['agg'], ok: ['agg'], badges: { agg: ['2-stage · 16 salts', 'ok'] }, tone: 'ok' },
        { text: 'Window results are tiny (one row per ad per minute), so stage 2 is cheap. Pacing stops the campaign when it hits its cap.', flow: ['agg>kagg', 'kagg>budget'], badges: { budget: 'cap reached' }, tone: 'ok' }
      ]
    },
    {
      id: 'recon', title: 'Nightly reconciliation finds a mismatch', tone: 'ok',
      steps: [
        { text: 'All day, raw events were archived to S3 as Parquet, partitioned by hour.', flow: ['kraw>lake'], badges: { lake: '1B rows' } },
        { text: 'A batch job recomputes the same counts with <code>COUNT(DISTINCT click_id)</code> per (ad, minute), including every late event and the latest fraud verdicts.', flow: ['lake>recon'], badges: { recon: 'recompute' } },
        { text: 'Ad 42 at 12:00 differs: stream 1,383, batch 1,420. Those 37 clicks arrived later than the allowed lateness. The diff is within the alert threshold (e.g. 0.5%).', nodes: ['recon', 'olap'], warn: ['olap'], badges: { recon: ['Δ 37', 'warn'] }, tone: 'warn' },
        { text: 'Correction rows overwrite the stream numbers and are marked <code>reconciled</code>. Billing reads only reconciled data, and dashboards quietly update.', flow: ['recon>olap', 'olap>api', 'adv>api'], ok: ['olap'], badges: { olap: ['reconciled', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose the architecture, delivery guarantee, window size, hot-key handling and edge pre-aggregation. Assume 1B clicks/day with one Super Bowl-sized ad at 200K clicks/s.',
    controls: [
      { id: 'arch', label: 'Architecture', type: 'seg', value: 'kappa', options: [
        { v: 'lambda', l: 'Lambda (stream + batch layer)' }, { v: 'kappa', l: 'Kappa (stream + replay)' }] },
      { id: 'del', label: 'Delivery guarantee', type: 'seg', value: 'eo', options: [
        { v: 'amo', l: 'At-most-once' }, { v: 'alo', l: 'At-least-once' }, { v: 'dedup', l: 'At-least-once + dedup' }, { v: 'eo', l: 'Exactly-once (ckpt + txn + upsert)' }] },
      { id: 'win', label: 'Window size', type: 'seg', value: '1m', options: [
        { v: '10s', l: '10 s' }, { v: '1m', l: '1 min' }, { v: '5m', l: '5 min' }, { v: '1h', l: '1 hour' }] },
      { id: 'hot', label: 'Hot ad handling', type: 'seg', value: 'none', options: [
        { v: 'none', l: 'keyBy(ad_id)' }, { v: 'salt', l: 'Salted 2-stage (16)' }] },
      { id: 'edge', label: 'Pre-aggregate at the click tracker', type: 'seg', value: 'off', options: [
        { v: 'off', l: 'Off: ship raw clicks' }, { v: 'on', l: 'On: ship 5 s counts' }] }
    ],
    evaluate(s) {
      const winS = { '10s': 10, '1m': 60, '5m': 300, '1h': 3600 }[s.win];
      const wm = 30, ckpt = s.del === 'eo' ? 60 : 5;     // watermark delay and commit cadence (s), illustrative
      const fresh = winS + wm + ckpt + (s.edge === 'on' ? 5 : 0);
      const perSub = 30000;                                 // clicks/s one subtask can aggregate (estimate)
      const hotLoad = s.hot === 'salt' ? 200000 / 16 : 200000;
      const hotUtil = hotLoad / perSub;
      const rowsDay = 86400 / winS * 2e6 * (winS >= 300 ? 1 : winS / 300 + 0.05);   // active ad-windows, rough
      const raw = s.edge === 'off';
      const acc = !raw ? { v: 'no click_ids: cannot dedup', s: 0.3 } : {
        amo: { v: 'undercounts after failures', s: 0.2 },
        alo: { v: 'overcounts on retry/replay', s: 0.3 },
        dedup: { v: 'exact if the sink is idempotent', s: 0.75 },
        eo: { v: 'exact, end to end', s: 0.95 }
      }[s.del];
      const metrics = [
        { k: 'Count accuracy', v: acc.v, s: acc.s },
        { k: 'Freshness (click → visible)', v: '≈ ' + SD.fmt.dur(fresh * 1000), s: fresh <= 120 ? 0.9 : fresh <= 400 ? 0.6 : 0.25, hint: 'window + watermark + commit' },
        { k: 'Hot-ad subtask load', v: Math.round(hotUtil * 100) + '% of one subtask', s: hotUtil <= 0.7 ? 0.9 : hotUtil <= 1 ? 0.5 : 0.1 },
        { k: 'Kafka volume', v: raw ? '≈ 35K events/s peak' : '≈ 50× fewer messages', s: raw ? 0.55 : 0.9 },
        { k: 'Rows written per day', v: SD.fmt.num(rowsDay), hint: 'rough estimate', s: rowsDay < 5e8 ? 0.85 : rowsDay < 3e9 ? 0.6 : 0.3 },
        { k: 'Recompute / audit path', v: !raw ? 'none: raw clicks never stored' : s.arch === 'lambda' ? 'batch layer, every night' : 'replay Kafka (within retention) + S3', s: !raw ? 0.15 : s.arch === 'lambda' ? 0.85 : 0.75 },
        { k: 'Codebases to keep in sync', v: s.arch === 'lambda' ? '2 (stream + batch)' : '1 (stream)', s: s.arch === 'lambda' ? 0.4 : 0.85 }
      ];
      const notes = [];
      if (s.del === 'alo') notes.push('Every producer retry and every replay after a crash adds clicks again. For billing that means <b>overcharging advertisers</b>.');
      if (s.del === 'amo') notes.push('Never retrying means a crashed task or a failed send simply loses clicks: lost revenue.');
      if (s.del === 'dedup') notes.push('Dedup removes duplicate <i>inputs</i>, but a replay can still re-emit a window. Make the sink an <b>upsert</b> keyed by (ad_id, window) so the second write is a no-op.');
      if (s.del === 'eo') notes.push('Flink 2PC sink: output is only visible once the checkpoint commits, so freshness ≥ checkpoint interval. Uber used 2 min.');
      if (s.edge === 'on') notes.push('Pre-aggregating at the tracker cuts traffic, but the click_ids are gone. You can no longer dedup, filter fraud per click, or reconcile from the raw log.');
      if (s.hot === 'none' && hotUtil > 1) notes.push('All 200K/s of the hot ad land on one subtask (~30K/s capacity, <em>estimate</em>). Lag grows without bound. Salt the key.');
      if (s.win === '1h') notes.push('Hourly windows are cheap to store, but pacing learns about overspend an hour late.');
      if (s.win === '10s') notes.push('10 s windows are fresh but write 6× more rows than 1 min. Roll them up to minutes and hours for storage.');
      let verdict;
      if (!raw) verdict = '❌ <b>Billing without raw events.</b> Pre-aggregate inside the stream job, not before Kafka, and keep every click for audits.';
      else if (s.del === 'alo' || s.del === 'amo') verdict = '❌ <b>Money needs exactly-once.</b> Add dedup by click_id plus transactional or idempotent writes.';
      else if (s.hot === 'none') verdict = '⚠ <b>The hot ad will stall one subtask.</b> Use two-stage aggregation with salted keys.';
      else if (s.win === '1h') verdict = '⚠ <b>Too coarse for pacing.</b> Use 1-minute windows and roll up for reports.';
      else if (s.del === 'eo' && s.arch === 'kappa') verdict = '✅ <b>Close to Uber\'s 2021 design:</b> Flink + Kafka transactions + upserts, with a batch reconciliation job as the audit.';
      else verdict = '👍 Correct counts. The meters show what you pay in freshness and operational effort.';
      const flow = ['usr>redir', 'redir>kraw', 'kraw>dedup', 'dedup>agg', 'agg>kagg', 'kagg>olap'].concat(s.arch === 'lambda' ? ['kraw>lake', 'lake>recon', 'recon>olap'] : []);
      return {
        metrics, verdict, notes, flow,
        labels: {
          agg: { label: s.hot === 'salt' ? 'Salted aggregator' : 'Window aggregator', sub: s.win + ' event-time · ' + (s.hot === 'salt' ? '2-stage' : 'ad_id') },
          redir: { label: 'Click tracker', sub: raw ? '302 · raw events' : '302 · 5 s pre-agg' },
          recon: { label: s.arch === 'lambda' ? 'Batch layer' : 'Reconciliation', sub: s.arch === 'lambda' ? 'serving view = merge' : 'audit + corrections' },
          kagg: { label: 'Kafka: aggregates', sub: s.del === 'eo' ? 'transactional' : 'plain topic' }
        },
        err: (s.hot === 'none' ? ['agg'] : []).concat(!raw ? ['lake'] : []),
        warn: s.del === 'alo' || s.del === 'amo' ? ['olap'] : [],
        hot: s.arch === 'lambda' ? ['recon'] : [],
        badges: { agg: [Math.round(hotUtil * 100) + '% hot subtask', hotUtil > 1 ? 'err' : 'ok'], olap: [acc.s >= 0.75 ? 'exact' : 'drifts', acc.s >= 0.75 ? 'ok' : 'warn'] }
      };
    }
  },

  widget: {
    title: 'Event-time windows, watermarks and dedup',
    caption: 'Clicks land in 10 s windows by their <b>event time</b>. The <b>watermark</b> (max event time − delay) closes windows. Add duplicates and late clicks, and compare the correct pipeline with a <b>naive counter</b> (processing time, no dedup) against the ground truth.'
  },

  realWorld: {
    intro: 'Ad counting drove much of the theory and practice of exactly-once stream processing.',
    timeline: [
      { when: '2013', who: 'Google', title: 'Photon (SIGMOD)', text: 'Joins search queries with ad clicks across datacenters. It never emits a duplicate at any point and reaches <b>exactly-once eventually</b>. It handles millions of events per minute at peak with <b>under 10 s</b> average latency, and survives a datacenter outage without manual work.', src: 0 },
      { when: '2013', who: 'Google', title: 'The IdRegistry trick', text: 'Workers retry until they succeed (at-least-once), and a <b>Paxos-replicated in-memory key-value store</b> of click_ids accepts each id only once (at-most-once). Together that gives exactly-once joins.', src: 1 },
      { when: '2014', who: 'Google', title: 'Mesa (VLDB)', text: 'The data warehouse for Google\'s advertising measurements: geo-replicated, near real-time updates, and multi-versioned so queries see consistent snapshots. Only metadata goes through Paxos.', src: 2 },
      { when: '2014', who: 'Jay Kreps', title: '"Questioning the Lambda Architecture"', text: 'Maintaining the same logic in a batch layer and a stream layer is costly. If the stream system can <b>replay a log</b>, reprocessing is just running the stream job again. This became known as <b>Kappa</b>.', src: 3 },
      { when: '2017', who: 'Apache Kafka', title: 'Exactly-once semantics', text: 'Kafka 0.11 added the <b>idempotent producer</b> (sequence numbers per partition) and <b>transactions</b> across partitions, with consumer offsets committed in the same transaction and <code>read_committed</code> consumers.', src: 4 },
      { when: '2021', who: 'Uber', title: 'Exactly-once ad events', text: 'Uber Eats ads: <b>3 Flink jobs in 2 regions</b>, Kafka transactions committed by <b>checkpoints every 2 min</b>, consumers on read_committed, a UUID per aggregate as the idempotency key, and Pinot <b>upsert</b> support added by Uber.', src: 5 }
    ],
    lessons: [
      'Create the <b>dedup key upstream</b> (signed into the impression) so retries carry the same id.',
      'Exactly-once = replayable source + consistent checkpoints + <b>transactional or idempotent sink</b>.',
      'Use <b>event time and watermarks</b>, not arrival time. Decide explicitly what happens to late data.',
      'Keep the raw log forever and <b>reconcile</b>. Bill on reconciled numbers.'
    ],
    sources: [
      { title: 'Photon: Fault-tolerant and Scalable Joining of Continuous Data Streams', url: 'https://research.google/pubs/photon-fault-tolerant-and-scalable-joining-of-continuous-data-streams/', pub: 'Google Research, SIGMOD 2013' },
      { title: 'Photon: Fault-tolerant and Scalable Joining of Continuous Data Streams (reading notes)', url: 'https://manuzhang.github.io/posts/2015-07-15-photon/index.html', pub: 'Manu Zhang, 2015' },
      { title: 'Mesa: Geo-Replicated, Near Real-Time, Scalable Data Warehousing', url: 'https://research.google/pubs/mesa-geo-replicated-near-real-time-scalable-data-warehousing/', pub: 'Google Research, VLDB 2014' },
      { title: 'Lambda architecture questions', url: 'https://www.infoq.com/news/2014/09/lambda-architecture-questions', pub: 'InfoQ, 2014 (on Jay Kreps\' O\'Reilly post)' },
      { title: 'Exactly-Once Semantics Are Possible: Here\'s How Kafka Does It', url: 'https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/', pub: 'Confluent, 2017' },
      { title: 'Real-Time Exactly-Once Ad Event Processing with Apache Flink, Kafka, and Pinot', url: 'https://www.uber.com/blog/real-time-exactly-once-ad-event-processing/', pub: 'Uber Engineering, 2021' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Architecture', '<b>Lambda</b>: stream for speed, batch for truth', '<b>Kappa</b>: one stream codebase, replay to recompute', 'Kappa plus a batch <i>audit</i> job, unless the batch logic is genuinely different'],
      ['Guarantee', '<b>At-least-once + dedup + upsert</b>: simple, fast', '<b>Transactional exactly-once</b>: atomic across sinks', 'Upserts when the sink supports keys; transactions when downstream consumers count records'],
      ['Window size', '<b>Small (10 s–1 min)</b>: fresh pacing', '<b>Large (5 min–1 h)</b>: fewer rows', '1 min for pacing, then roll up to hours and days'],
      ['Late data', '<b>Short watermark delay</b>: early results', '<b>Long delay / allowed lateness</b>: complete results', 'Short delay + allowed lateness (re-fire + upsert) + nightly reconciliation'],
      ['Partition key', '<b>ad_id</b>: one place per ad, but hot keys', '<b>click_id → salted ad_id</b>: even load', 'Key raw topics by click_id and salt hot ads in the aggregation'],
      ['Store', '<b>Pinot / Druid / ClickHouse</b>: fast slice-and-dice', '<b>Postgres (partitioned)</b>: simple, transactional', 'Postgres up to ~10⁸ rows a day with rollups; OLAP beyond that or for ad-hoc queries']
    ]
  },
  failures: [
    { f: 'Duplicate clicks counted', detect: 'Stream counts higher than COUNT(DISTINCT) in reconciliation', fix: 'Dedup by an upstream click_id in keyed state with a TTL, plus an idempotent sink.' },
    { f: 'Aggregator crash mid-window', detect: 'Job restarts, checkpoint restore', fix: 'Restore offsets and state together. The uncommitted Kafka transaction is aborted, and read_committed consumers never see it.' },
    { f: 'Late events lost', detect: 'Side-output volume, reconciliation deltas', fix: 'Tune the watermark delay and allowed lateness. Send the rest to a side output and let reconciliation count it.' },
    { f: 'Hot ad backpressure', detect: 'Kafka consumer lag, one busy subtask', fix: 'Two-stage aggregation with salted keys and local pre-aggregation inside the job.' },
    { f: 'Click-fraud spike', detect: 'Clicks per IP or device, low conversion, sudden CTR jumps', fix: 'Filter in the stream, and re-score in the nightly batch job. Never bill fraud the stream missed.' },
    { f: 'Idle Kafka partition stalls the watermark', detect: 'Windows stop firing, watermark flat', fix: 'Use <code>withIdleness</code> so idle partitions do not hold back the global watermark.' },
    { f: 'Dedup state grows without bound', detect: 'Checkpoint size and duration climbing', fix: 'Set a state TTL (e.g. 24 h), use RocksDB with incremental checkpoints, or use a Bloom filter per hour.' }
  ],

  interview: [
    { q: 'Why does ad counting need exactly-once?', a: '<p>The counts are <b>money</b>. A double-counted click overcharges the advertiser and inflates reported performance. A lost click is lost revenue. Analytics can tolerate approximate counts. Invoices cannot.</p>', lvl: 'core' },
    { q: 'What do you use as the dedup key?', a: '<p>A <b>click_id created upstream</b>, for example derived from a signed impression id plus the click timestamp, embedded in the click URL. Then a browser retry, a tracker retry or a Kafka producer retry all carry the <b>same id</b>.</p><p>If you generate the id when the event arrives, every retry looks like a new click.</p>', fu: 'How long must you remember ids? (As long as a duplicate can arrive, e.g. 24 h. Set that as the state TTL.)', lvl: 'core' },
    { q: 'How does Flink + Kafka give exactly-once end to end?', a: '<ul><li>The source offsets, dedup state and window state are snapshotted together in a <b>checkpoint</b>.</li><li>The Kafka sink writes inside a <b>transaction</b> that commits only when the checkpoint completes (two-phase commit).</li><li>Downstream consumers use <code>isolation.level=read_committed</code>.</li><li>After a crash: restore the checkpoint, abort the open transaction, and replay from the saved offsets.</li></ul>', lvl: 'deep' },
    { q: 'Isn\'t "exactly-once" impossible in distributed systems?', a: '<p>Exactly-once <i>delivery</i> is impossible. Exactly-once <b>effect</b> is achievable: deliver at least once, and make the effect happen once through deduplication, idempotent writes (upsert by key) or atomic commits.</p>', lvl: 'core' },
    { q: 'How do you handle late events?', a: '<p>Window by <b>event time</b>. A watermark (max event time − delay) decides when a window may fire. <b>Allowed lateness</b> keeps window state a little longer so late events re-fire an updated result, which an upsert overwrites. Anything later goes to a side output, and reconciliation counts it.</p>', lvl: 'core' },
    { q: 'How do you reconcile, and what do you do with differences?', a: '<p>Each night, recompute the same aggregates from the immutable raw archive with <code>COUNT(DISTINCT click_id)</code>, including all late data and updated fraud verdicts. Compare with the stream results per (ad, minute). Write <b>corrections</b> with an audit trail and alert if the delta exceeds a threshold.</p><p>Billing uses the reconciled numbers.</p>', lvl: 'core' },
    { q: 'One ad gets 200K clicks/s. What breaks, and how do you fix it?', a: '<p><code>keyBy(ad_id)</code> sends every click of that ad to one subtask, so it becomes the bottleneck and lag grows.</p><p>Key the <b>raw topic by click_id</b> so ingest stays even. In the job, aggregate in two stages: first by <code>(ad_id, salt)</code> with 16–64 salts, then sum the partial counts per ad. Local pre-aggregation (mini-batches) before the shuffle also helps.</p>', lvl: 'deep' },
    { q: 'Lambda or Kappa?', a: '<p><b>Lambda</b> runs a batch layer (truth) and a speed layer (fresh results) and merges them, at the cost of two codebases that must agree. <b>Kappa</b> keeps one streaming codebase and recomputes by replaying the log.</p><p>A common middle ground is Kappa for serving, plus a batch <b>reconciliation</b> job used only as an audit.</p>', lvl: 'core' },
    { q: 'What query patterns must the store support?', a: '<ul><li>Clicks for one ad over a time range (time series).</li><li>Top-N ads per minute or hour, often filtered by country or campaign.</li><li>Rollups by campaign and advertiser.</li></ul><p>A columnar OLAP store (Pinot, Druid, ClickHouse) partitioned by time does this well. Precompute top-N per window if it is on a hot dashboard.</p>', lvl: 'core' },
    { q: 'Why not count with Redis INCR per ad per minute?', a: '<p>INCR is fast but <b>not idempotent</b>: a retry or replay increments again. There is also no event-time handling or late data, and no consistent snapshot with the Kafka offsets.</p><p>Redis is fine as a cache for live pacing next to an exactly-once pipeline, not as the system of record.</p>', lvl: 'deep' },
    { q: 'How did Google\'s Photon avoid double-joining a click across datacenters?', a: '<p>Workers in several datacenters process the same click streams and retry until they succeed. Before writing output, a joiner must <b>insert the click_id into the IdRegistry</b>, a Paxos-replicated in-memory key-value store. Only the first insert wins, so output has no duplicates, and retries guarantee nothing is lost in the end.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Flink: dedup + 1-min event-time window per ad (Java)', lang: 'java',
      code: `// Flink 1.19+ DataStream API + flink-connector-kafka
KafkaSource<Click> source = KafkaSource.<Click>builder()
    .setBootstrapServers("kafka:9092").setTopics("ad-clicks").setGroupId("click-agg")
    .setProperty("isolation.level", "read_committed")
    .setValueOnlyDeserializer(new ClickSchema())
    .build();

WatermarkStrategy<Click> wm = WatermarkStrategy
    .<Click>forBoundedOutOfOrderness(Duration.ofSeconds(30))      // watermark = max ts − 30 s
    .withTimestampAssigner((click, ts) -> click.eventTimeMillis())
    .withIdleness(Duration.ofMinutes(1));                          // idle partitions don't stall it

OutputTag<Click> tooLate = new OutputTag<Click>("too-late") {};

SingleOutputStreamOperator<AdMinute> perMinute = env
    .fromSource(source, wm, "clicks")
    .keyBy(Click::clickId).filter(new Dedup())                     // drop repeated click_ids
    .keyBy(Click::adId)
    .window(TumblingEventTimeWindows.of(Duration.ofMinutes(1)))
    .allowedLateness(Duration.ofMinutes(5))                        // re-fire with updated count
    .sideOutputLateData(tooLate)                                   // later than that → recon
    .aggregate(new CountClicks(), new ToAdMinute());               // (adId, windowStart, clicks)

/** Keyed by click_id: remembers each id for 24 h. Part of every checkpoint. */
class Dedup extends RichFilterFunction<Click> {
  private transient ValueState<Boolean> seen;
  @Override public void open(OpenContext ctx) {
    var d = new ValueStateDescriptor<>("seen", Boolean.class);
    d.enableTimeToLive(StateTtlConfig.newBuilder(Duration.ofHours(24)).build());
    seen = getRuntimeContext().getState(d);
  }
  @Override public boolean filter(Click c) throws Exception {
    if (seen.value() != null) return false;
    seen.update(true);
    return true;
  }
}`,
      note: 'Enable checkpointing (e.g. <code>env.enableCheckpointing(60_000, CheckpointingMode.EXACTLY_ONCE)</code>) and use a <code>KafkaSink</code> with <code>DeliveryGuarantee.EXACTLY_ONCE</code> and a <code>transactionalIdPrefix</code>, or the idempotent upsert below.'
    },
    {
      title: 'Postgres: idempotent upsert sink + top-N', lang: 'sql',
      code: `CREATE TABLE ad_click_minute (
  ad_id        bigint      NOT NULL,
  window_start timestamptz NOT NULL,
  clicks       bigint      NOT NULL,
  source       text        NOT NULL DEFAULT 'stream',   -- 'stream' | 'reconciled'
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_id, window_start)
) PARTITION BY RANGE (window_start);                      -- one partition per day

-- The window emits its FULL count, so overwriting is replay-safe (never "+=").
INSERT INTO ad_click_minute (ad_id, window_start, clicks)
VALUES ($1, $2, $3)
ON CONFLICT (ad_id, window_start) DO UPDATE
   SET clicks = EXCLUDED.clicks, updated_at = now()
 WHERE ad_click_minute.source = 'stream';                -- never clobber reconciled rows

-- Top 10 ads in the last complete minute
SELECT ad_id, clicks
  FROM ad_click_minute
 WHERE window_start = date_trunc('minute', now()) - interval '1 minute'
 ORDER BY clicks DESC
 LIMIT 10;`
    },
    {
      title: 'Python: nightly reconciliation with DuckDB', lang: 'python',
      code: `import duckdb

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL postgres; LOAD postgres;")
con.execute("ATTACH 'dbname=ads host=db user=recon' AS pg (TYPE postgres)")

day = "2026-10-29"
diff = con.execute(f"""
    WITH batch AS (
        SELECT ad_id, date_trunc('minute', event_ts) AS window_start,
               count(DISTINCT click_id)            AS clicks     -- truth: every late event
          FROM read_parquet('s3://ads-raw/clicks/dt={day}/*/*.parquet')
         WHERE NOT is_fraud
         GROUP BY ALL)
    SELECT b.ad_id, b.window_start, s.clicks AS stream, b.clicks AS batch
      FROM batch b
      LEFT JOIN pg.public.ad_click_minute s USING (ad_id, window_start)
     WHERE s.clicks IS DISTINCT FROM b.clicks
""").df()

total = con.execute(f"SELECT count(*) FROM read_parquet('s3://ads-raw/clicks/dt={day}/*/*.parquet')").fetchone()[0]
drift = (diff.batch - diff.stream.fillna(0)).abs().sum() / max(total, 1)
print(f"{len(diff)} windows differ, drift {drift:.4%}")
if drift > 0.005:
    raise SystemExit("drift above 0.5%: page the on-call before billing runs")`,
      note: 'Write the differences back as <code>source = \'reconciled\'</code> rows, plus an audit row in <code>correction</code>.'
    }
  ],

  related: ['stream-analytics', 'top-k', 'message-queue', 'observability', 'payment-gateway', 'unique-id']
});
