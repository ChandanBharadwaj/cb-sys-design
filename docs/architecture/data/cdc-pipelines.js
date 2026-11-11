(function () {
  const GB = 1024 ** 3;
  const dur = (sec) => {
    if (!isFinite(sec)) return 'never (consumer slower than writes)';
    if (sec < 90) return Math.round(sec) + ' s';
    if (sec < 5400) return Math.round(sec / 60) + ' min';
    if (sec < 172800) return (sec / 3600).toFixed(1) + ' h';
    return (sec / 86400).toFixed(1) + ' days';
  };
  const bytes = (b) => (b >= GB * 1024 ? (b / GB / 1024).toFixed(1) + ' TB' : b >= GB ? (b / GB).toFixed(1) + ' GB' : (b / 1024 ** 2).toFixed(0) + ' MB');
  // WAL bytes per captured row change: row image + record headers + index/full-page-write overhead. ~2.5x is an estimate.
  const walPerRow = (v) => v.row * 2.5;
  // Debezium JSON/Avro envelope: after image + key + source block; before image only with REPLICA IDENTITY FULL. Estimate.
  const evtBytes = (v) => v.row * 1.3 + 300;

  SD.register({
    slug: 'cdc-pipelines',
    domain: 4,
    title: 'Change Data Capture & Change Data Feed',
    examples: 'Debezium, Delta CDF, outbox',
    tagline: 'Read the database\'s own <b>commit log</b> and turn every committed insert, update and delete into an ordered event, so caches, search indexes, warehouses and other services stay in sync <b>without dual writes</b>.',
    tldr: {
      problem: 'The same data must live in Postgres, Redis, Elasticsearch, the lakehouse and other services. Writing to all of them from application code (a <b>dual write</b>) is not atomic: a crash or a race leaves them disagreeing, silently.',
      idea: 'Let the database be the single writer. A connector such as <b>Debezium</b> reads the <b>write-ahead log</b> through a <b>replication slot</b>, snapshots existing rows, then streams each committed change in order to <b>Kafka</b>. Sinks apply them <b>idempotently</b>. For your own events, write them to an <b>outbox table</b> in the same transaction.',
      insight: 'CDC gives <b>at-least-once, per-key ordered</b> delivery. Correctness comes from <b>idempotent, version-checked sinks</b>; safety comes from <b>watching the slot</b>, because a stalled consumer makes Postgres keep WAL until the disk is full.',
      numbers: [
        { v: '2015', l: 'Kleppmann: "why dual writes are a bad idea" (Craft Conference talk)' },
        { v: 'PG 13', l: 'adds max_slot_wal_keep_size to cap WAL a slot may hold (2020)' },
        { v: '4', l: '_change_type values in Delta CDF: insert, update_preimage/postimage, delete' }
      ]
    },

    intro: {
      what: '<b>Change data capture (CDC)</b> watches a database and publishes every committed change (insert, update, delete) as an event, in commit order. Other systems subscribe and keep their own copy up to date. A <b>change data feed</b> is the same idea for lakehouse tables: Delta Lake records which rows changed in each table version so jobs can process only those.',
      analogy: {
        icon: '📒',
        title: 'Copying a ship\'s logbook instead of asking the crew',
        text: 'A ship keeps a logbook: every event is written down, in order, before anything else happens. To keep a second chart in sync you could ask each sailor to also tell you what they did (and some will forget), or you could copy new logbook lines every few minutes. CDC copies the logbook. One difference: the database keeps old log pages only while some reader still needs them, so a reader that stops reading makes the logbook pile up.'
      },
      problem: 'A shop updates a product price in Postgres, then the code also writes the price to Redis and Elasticsearch. One day the search call times out after the database commit. Customers now see the old price in search and the new one at checkout, and nothing alerts. <b>How do you keep every copy of the data in step with the database without trusting every code path to update every copy?</b>',
      story: [
        {
          stage: 'naive',
          title: 'Write to every store from the app',
          text: 'The service saves the row, then updates the cache, then the search index. It is easy to write and it works in the demo, so most teams start here, or with a nightly job that copies changed rows by <code>updated_at</code>.',
          scene: {
            nodes: [
              { id: 'app', label: 'Product svc', sub: 'writes 3 times', kind: 'service', at: [210, 0] },
              { id: 'db', label: 'Postgres', sub: 'price = 25', kind: 'store', at: [70, 110] },
              { id: 'c', label: 'Redis', sub: 'price = 25', kind: 'cache', at: [210, 220] },
              { id: 's', label: 'Search', sub: 'price = 25', kind: 'store', at: [350, 110] }
            ],
            edges: [{ from: 'app', to: 'db' }, { from: 'app', to: 'c' }, { from: 'app', to: 's' }],
            flow: ['app>db', 'app>c', 'app>s']
          }
        },
        {
          stage: 'breaks',
          title: 'Half the writes fail, silently',
          text: 'The database commit succeeds, the search call times out, and a retry from another request overtakes it. The stores now <b>disagree</b>. A polling job would also miss <b>deletes</b> and any update that did not touch <code>updated_at</code>.',
          scene: {
            nodes: [
              { id: 'app', label: 'Product svc', sub: 'crashed mid-way', kind: 'service', at: [210, 0] },
              { id: 'db', label: 'Postgres', sub: 'price = 30', kind: 'store', at: [70, 110] },
              { id: 'c', label: 'Redis', sub: 'price = 30', kind: 'cache', at: [210, 220] },
              { id: 's', label: 'Search', sub: 'price = 25', kind: 'store', at: [350, 110] }
            ],
            edges: [{ from: 'app', to: 'db' }, { from: 'app', to: 'c' }, { from: 'app', to: 's', dashed: true }],
            flow: ['app>db', 'app>c', 'app>s'],
            err: ['s'], warn: ['app'],
            badges: { s: ['stale 💥', 'err'], app: ['timeout', 'warn'] }
          }
        },
        {
          stage: 'fix',
          title: 'One writer, the log feeds the rest',
          text: 'The service writes <b>only</b> to Postgres. A connector reads the database\'s commit log and publishes each change to Kafka. Cache and search consume the stream and apply each change <b>by key and version</b>, so a repeat is harmless.',
          scene: {
            nodes: [
              { id: 'app', label: 'Product svc', sub: 'writes once', kind: 'service', at: [70, 0] },
              { id: 'db', label: 'Postgres', sub: 'WAL = the log', kind: 'store', at: [210, 0] },
              { id: 'k', label: 'Debezium→Kafka', sub: 'ordered per key', kind: 'queue', at: [210, 110] },
              { id: 'c', label: 'Redis', sub: 'upsert v7', kind: 'cache', at: [70, 220] },
              { id: 's', label: 'Search', sub: 'upsert v7', kind: 'store', at: [350, 220] }
            ],
            edges: [{ from: 'app', to: 'db' }, { from: 'db', to: 'k' }, { from: 'k', to: 'c' }, { from: 'k', to: 's' }],
            flow: ['app>db', 'db>k', ['k>c', 'k>s']],
            ok: ['c', 's', 'k'],
            badges: { s: ['in sync', 'ok'] }
          }
        }
      ],
      usedBy: ['Netflix (DBLog)', 'Airbnb (SpinalTap)', 'Shopify (Longboat, query-based)', 'Debezium on Kafka Connect', 'Databricks / Delta Lake change data feed', 'AWS DMS and Google Datastream'],
      whenToUse: [
        'Several read models (cache, search, analytics) must follow one <b>system of record</b>',
        'You need <b>deletes</b> and every intermediate change, not just a nightly snapshot',
        'A service must publish events <b>atomically</b> with its own write (the outbox pattern)'
      ],
      whenNot: [
        'One consumer that tolerates hours of staleness: a nightly export is simpler',
        'The other system should own the data: move ownership instead (see <a href="strangler-fig.html">Strangler Fig</a>)',
        'You need a cross-service business transaction: CDC moves facts, it does not coordinate them (see <a href="event-driven-sagas.html">Sagas</a>)'
      ],
      glossary: [
        { term: 'WAL (write-ahead log)', def: 'Postgres\'s append-only log of every change, written before data files; replicas and CDC read it.' },
        { term: 'Logical decoding', def: 'Postgres turning WAL records into row-level changes (table, key, old and new values) via an output plug-in such as pgoutput.' },
        { term: 'Replication slot', def: 'A server-side bookmark that remembers how far a consumer has confirmed, and stops Postgres deleting WAL the consumer has not read.' },
        { term: 'Publication', def: 'The set of tables (and operations) whose changes pgoutput sends to a subscriber.' },
        { term: 'Snapshot', def: 'A consistent read of the rows that already exist, taken before streaming so the copy starts complete.' },
        { term: 'Transactional outbox', def: 'A table you insert events into in the same transaction as the business change; CDC then publishes them.' },
        { term: 'Idempotent sink', def: 'A consumer that gives the same result whether it applies an event once or several times, usually an upsert guarded by a version.' },
        { term: 'Tombstone', def: 'A Kafka record with a key and a null value; it tells sinks and log compaction that the key was deleted.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Single writer</b>: the source database is the system of record; everything else is derived',
        '<b>Capture from the log</b>: committed changes only, in commit order, including deletes',
        '<b>Snapshot, then stream</b>: start every new copy complete, then follow the log without gaps',
        '<b>Order per key</b>: one key always lands on one partition, so its changes stay in sequence',
        '<b>Idempotent apply</b>: sinks upsert by key with a version or LSN check; replays are harmless',
        '<b>Contracts for events</b>: schemas in a registry with compatibility rules; outbox for public events'
      ],
      nonFunctional: [
        'End-to-end lag p99 under a few seconds in steady state (<em>typical target</em>)',
        'Zero lost changes across connector restarts (at-least-once, offsets + slot)',
        'Slot-retained WAL alerted well before <code>max_slot_wal_keep_size</code> or disk limit',
        'Catch-up after a 1-hour outage in under 1 hour (consumer headroom ≥ 2× write rate, <em>rule of thumb</em>)',
        'Snapshot/backfill adds bounded load on the source (chunked, no long locks)',
        'Drift between source and each sink measured and reconciled (row counts, checksums)'
      ],
      outOfScope: [
        '<b>Dual writes</b> from application code to DB and broker without an outbox',
        '<b>Polling <code>updated_at</code></b> as the only capture method when deletes matter',
        '<b>Exposing raw table CDC</b> as a public API, so every column becomes a contract',
        '<b>Abandoned replication slots</b> nobody monitors, until the primary\'s disk fills',
        '<b>Append-only sinks</b> that assume exactly-once delivery'
      ]
    },

    calculator: {
      inputs: [
        { id: 'rate', label: 'Captured row changes per second', min: 50, max: 200000, value: 3000, log: true, fmt: 'num' },
        { id: 'row', label: 'Average row size', min: 100, max: 20000, value: 600, unit: 'B', log: true, fmt: 'bytes' },
        { id: 'cons', label: 'Slowest consumer throughput (rows/s)', min: 100, max: 400000, value: 9000, log: true, fmt: 'num' },
        { id: 'out', label: 'Connector or sink outage', min: 1, max: 1440, value: 60, unit: 'min', log: true },
        { id: 'cap', label: 'max_slot_wal_keep_size (or free disk)', min: 5, max: 2000, value: 100, unit: 'GB', log: true },
        { id: 'ret', label: 'Kafka retention', min: 1, max: 30, value: 7, unit: 'days' }
      ],
      outputs: [
        { label: 'WAL a stalled slot retains during the outage', fmt: 'raw', f: (v) => bytes(v.rate * walPerRow(v) * v.out * 60) },
        { label: 'Longest connector outage before the cap is hit', fmt: 'raw', f: (v) => dur(v.cap * GB / (v.rate * walPerRow(v))) },
        { label: 'Catch-up time after the outage ends', fmt: 'raw', f: (v) => dur(v.cons > v.rate ? (v.rate * v.out * 60) / (v.cons - v.rate) : Infinity) },
        { label: 'Peak staleness (outage + catch-up)', fmt: 'raw', f: (v) => (v.cons > v.rate ? dur(v.out * 60 + (v.rate * v.out * 60) / (v.cons - v.rate)) : 'grows forever') },
        { label: 'Kafka topic volume per day (×3 replicas)', fmt: 'raw', f: (v) => bytes(v.rate * 86400 * evtBytes(v)) + ' · ' + bytes(v.rate * 86400 * evtBytes(v) * 3) },
        { label: 'Broker disk for retention (×3 replicas)', fmt: 'raw', f: (v) => bytes(v.rate * 86400 * evtBytes(v) * 3 * v.ret) }
      ],
      note: 'A <b>connector</b> outage holds WAL in Postgres (the slot stops advancing); a <b>sink</b> outage behind Kafka only builds consumer lag in Kafka, which retention covers. WAL ≈ <em>2.5× row size</em> per change and event ≈ <em>1.3× row + 300 B</em> are <em>estimates</em> (index updates, full-page writes and the envelope vary a lot; measure with <code>pg_current_wal_lsn()</code> deltas). Catch-up uses <code>backlog ÷ (consumer − write rate)</code>: with only 1.2× headroom a 1-hour outage takes 5 hours to drain. A slot retains WAL for the <b>whole cluster</b>, not just the published tables, so a busy unrelated table makes this worse.'
    },

    api: [
      { m: 'SQL', p: 'CREATE PUBLICATION + logical slot', d: '<code>wal_level = logical</code> (restart), a publication listing exactly the captured tables, one slot per connector, <code>REPLICA IDENTITY FULL</code> only where sinks need the old row. Owned by the platform team, reviewed like schema.' },
      { m: 'YAML', p: 'Debezium connector (KafkaConnector CR)', d: 'Plug-in <code>pgoutput</code>, slot and publication names, table include list, snapshot mode, heartbeat, signal table for incremental snapshots, converters pointing at the schema registry, SMTs (outbox router or unwrap).' },
      { m: 'EVENT', p: 'Change event envelope', d: '<code>before</code>, <code>after</code>, <code>op</code> (<code>c</code> create, <code>u</code> update, <code>d</code> delete, <code>r</code> snapshot read), <code>source</code> (LSN, txId, table), <code>ts_ms</code>. Key = primary key. A delete is followed by a <b>tombstone</b> (null value) for compaction.' },
      { m: 'POLICY', p: 'Schema compatibility', d: 'Registry subject per topic with <b>BACKWARD</b> (or FULL) compatibility: add nullable columns freely; renames and type changes go through expand/contract. CI fails a migration that would break a registered consumer.' },
      { m: 'SLO', p: 'Pipeline SLOs + alerts', d: 'Lag p99 &lt; 5 s; slot retained WAL &lt; 20% of cap; <code>wal_status</code> = reserved; consumer lag per group; reconciliation drift = 0 rows (<em>example thresholds</em>).' },
      { m: 'SQL', p: 'Delta CDF read (readChangeFeed)', d: '<code>delta.enableChangeDataFeed = true</code> on the table, then read with option <code>readChangeFeed</code> = true and a <code>startingVersion</code>. Filter <code>_change_type</code>, merge only changed keys downstream, store the last <code>_commit_version</code> processed.' }
    ],

    dataModel: [
      { name: 'outbox', store: 'Postgres (same DB as the service)', fields: [['id', 'uuid', 'pk'], ['aggregatetype', 'text'], ['aggregateid', 'text'], ['type', 'text'], ['payload', 'jsonb'], ['created_at', 'timestamptz']], note: 'Column names match the Debezium outbox router defaults. Insert in the business transaction; delete rows right after (the WAL already has them) or purge on a schedule.' },
      { name: 'pg_replication_slots (view)', store: 'Postgres catalog', fields: [['slot_name', 'name', 'pk'], ['plugin', 'name'], ['active', 'bool'], ['restart_lsn', 'pg_lsn'], ['confirmed_flush_lsn', 'pg_lsn'], ['wal_status', 'reserved|extended|unreserved|lost'], ['safe_wal_size', 'int8']], note: '<code>current_lsn − restart_lsn</code> = WAL held. <code>safe_wal_size</code> (PG 13+) is how much more can be written before the slot is at risk of becoming <code>lost</code>.' },
      { name: 'search_doc / read model', store: 'Postgres, Elasticsearch, Redis', fields: [['id', 'bigint', 'pk'], ['body', 'jsonb'], ['src_version', 'bigint'], ['src_lsn', 'pg_lsn'], ['deleted', 'bool']], note: 'The sink keeps the last version (or LSN) it applied per key and ignores anything older. That one column makes replays and reordering harmless.' },
      { name: 'debezium_signal', store: 'Postgres', fields: [['id', 'varchar(42)', 'pk'], ['type', 'varchar(32)'], ['data', 'varchar(2048)']], note: 'Insert <code>execute-snapshot</code> rows here to trigger an <b>incremental snapshot</b> (backfill) of chosen tables while streaming continues.' }
    ],

    architecture: {
      title: 'Log-based CDC from Postgres to cache, search and lakehouse',
      nodes: [
        { id: 'app', label: 'Order service', sub: 'writes once', kind: 'service', wide: [90, 60], tall: [70, 0], tip: 'The only writer. It commits business rows (and outbox rows) in one local transaction. It never writes to Kafka, Redis or search directly.' },
        { id: 'pg', label: 'Postgres', sub: 'orders table', kind: 'store', wide: [280, 60], tall: [210, 0], tip: 'System of record. wal_level=logical. A publication lists the captured tables.' },
        { id: 'outbox', label: 'Outbox table', sub: 'same transaction', kind: 'store', wide: [280, 190], tall: [350, 0], tip: 'Domain events inserted in the same transaction as the business change, so an event exists if and only if the change committed.' },
        { id: 'wal', label: 'WAL + slot', sub: 'pgoutput · LSN', kind: 'store', wide: [470, 60], tall: [210, 105], tip: 'Logical decoding reads the WAL through a replication slot. The slot remembers the last confirmed LSN and keeps all newer WAL on disk until the connector confirms it.' },
        { id: 'dbz', label: 'Debezium', sub: 'Kafka Connect task', kind: 'compute', wide: [660, 60], tall: [210, 210], tip: 'Snapshots existing rows, then streams changes. Emits before/after/op envelopes keyed by primary key. Stores its position in Kafka Connect offsets and confirms LSNs back to the slot.' },
        { id: 'reg', label: 'Schema registry', sub: 'Avro / Protobuf', kind: 'service', wide: [860, 60], tall: [350, 210], tip: 'Stores a schema version per topic and rejects incompatible changes, so a column drop does not silently break consumers.' },
        { id: 'kafka', label: 'Kafka topic', sub: 'partition by key', kind: 'queue', wide: [660, 190], tall: [210, 315], tip: 'Durable, replayable buffer. All changes for one key go to one partition, so they stay in order. Compaction keeps the latest value per key.' },
        { id: 'cw', label: 'Cache updater', sub: 'upsert / evict', kind: 'compute', wide: [470, 310], tall: [70, 420], tip: 'Consumer group that updates or evicts Redis keys, ignoring events older than what the cache holds.' },
        { id: 'ix', label: 'Search indexer', sub: 'version check', kind: 'compute', wide: [660, 310], tall: [210, 420], tip: 'Writes documents with external versioning (the source version or LSN), so a replayed or late event cannot overwrite a newer document.' },
        { id: 'delta', label: 'Delta table', sub: 'bronze → silver', kind: 'store', wide: [860, 310], tall: [350, 420], tip: 'Lakehouse copy. MERGE applies changes by key. With change data feed on, downstream jobs read only the rows that changed in each version.' },
        { id: 'redis', label: 'Redis', sub: 'read cache', kind: 'cache', wide: [470, 420], tall: [70, 525], tip: 'Hot read path. Stale for at most the pipeline lag.' },
        { id: 'es', label: 'Elasticsearch', sub: 'search index', kind: 'store', wide: [660, 420], tall: [210, 525], tip: 'Full-text and faceted search over orders, kept in sync by the indexer.' },
        { id: 'job', label: 'Incremental job', sub: 'readChangeFeed', kind: 'compute', wide: [860, 420], tall: [350, 525], tip: 'Spark batch or stream that reads the change data feed from the last processed version and updates aggregates for only the changed keys.' }
      ],
      edges: [
        { from: 'app', to: 'pg' },
        { from: 'app', to: 'outbox', bend: 0.25 },
        { from: 'pg', to: 'wal' },
        { from: 'outbox', to: 'wal' },
        { from: 'wal', to: 'dbz' },
        { from: 'dbz', to: 'reg', dashed: true },
        { from: 'dbz', to: 'kafka' },
        { from: 'kafka', to: 'cw' },
        { from: 'kafka', to: 'ix' },
        { from: 'kafka', to: 'delta' },
        { from: 'cw', to: 'redis' },
        { from: 'ix', to: 'es' },
        { from: 'delta', to: 'job' }
      ]
    },

    scenarios: [
      {
        id: 'snap', title: 'Snapshot, then stream', tone: 'info',
        steps: [
          { text: 'A new connector starts. Debezium creates (or reuses) the <b>replication slot</b> first, which pins a WAL position, so nothing committed after that point can be lost.', flow: ['pg>wal', 'wal>dbz'], badges: { wal: 'slot @ LSN 0/1A0' } },
          { text: 'It then reads the existing rows in a consistent snapshot and emits them with <code>op = r</code> (read). Sinks receive a complete starting copy.', flow: ['pg>wal', 'wal>dbz', 'dbz>kafka', ['kafka>cw', 'kafka>ix', 'kafka>delta']], badges: { dbz: 'op=r ×2.1M' } },
          { text: 'The snapshot finishes and the connector switches to <b>streaming</b> from the slot position. Changes made during the snapshot arrive now, in commit order.', flow: ['app>pg', 'pg>wal', 'wal>dbz', 'dbz>kafka'], badges: { dbz: ['streaming', 'ok'] }, ok: ['dbz'] },
          { text: 'Each event: key = <code>{id: 42}</code>, value = <code>before</code>, <code>after</code>, <code>op = u</code>, <code>source.lsn</code>. Kafka partitions by key, so all changes to order 42 stay in order.', flow: ['dbz>reg', 'dbz>kafka'], badges: { kafka: 'p3: id 42' } },
          { text: 'Sinks upsert by key. Steady-state lag is usually seconds, mostly connector poll and batch settings.', flow: [['kafka>cw', 'kafka>ix'], ['cw>redis', 'ix>es']], ok: ['redis', 'es'], tone: 'ok' }
        ]
      },
      {
        id: 'outbox', title: 'Outbox: publish events atomically', tone: 'ok',
        steps: [
          { text: 'Placing an order must also publish <code>OrderPlaced</code>. Writing to Kafka after the commit is a <b>dual write</b>: a crash between the two loses the event.', nodes: ['app'], warn: ['app'], badges: { app: ['DB + Kafka?', 'warn'] }, tone: 'warn' },
          { text: 'Instead the service inserts the order <b>and</b> an outbox row in <b>one local transaction</b>. Both commit or neither does.', flow: [['app>pg', 'app>outbox']], badges: { outbox: 'OrderPlaced' } },
          { text: 'Debezium captures the outbox insert from the WAL. The <b>outbox event router</b> SMT routes it to <code>outbox.event.order</code>, keyed by <code>aggregateid</code>, with the payload as the value.', flow: ['outbox>wal', 'wal>dbz', 'dbz>kafka'], badges: { dbz: 'EventRouter' } },
          { text: 'Consumers get a <b>designed event</b> (a public contract), not the internal table shape. The outbox row can be deleted right away; the WAL already has it.', flow: ['kafka>ix'], ok: ['kafka'], tone: 'ok' }
        ]
      },
      {
        id: 'stall', title: 'Stalled slot fills the disk', tone: 'err',
        steps: [
          { text: 'Friday night the Kafka Connect cluster loses its credentials. The connector stops, but its <b>slot stays</b>. Postgres keeps every WAL segment after the slot\'s <code>restart_lsn</code>.', nodes: ['dbz', 'wal'], err: ['dbz'], badges: { dbz: ['stopped', 'err'] }, tone: 'err' },
          { text: 'The whole cluster writes ~40 MB/s of WAL, not just the captured tables. After 10 hours the slot holds <b>~1.4 TB</b> (<em>illustrative</em>).', flow: ['app>pg', 'pg>wal'], warn: ['wal'], badges: { wal: ['+1.4 TB held', 'err'] } },
          { text: 'Without a cap the WAL volume fills and <b>the primary stops accepting writes</b>. A side pipeline has taken down the main database.', nodes: ['pg', 'wal'], err: ['pg', 'wal'], badges: { pg: ['disk full', 'err'] }, tone: 'err' },
          { text: 'With <code>max_slot_wal_keep_size</code> (PG 13+) Postgres instead marks the slot <code>lost</code> and frees the WAL. The database survives; the connector must <b>re-snapshot</b>.', nodes: ['wal'], ok: ['pg'], warn: ['wal'], badges: { wal: ['slot lost', 'warn'] }, tone: 'warn' },
          { text: 'Prevention: alert on retained WAL and <code>wal_status</code>, drop slots of retired connectors, and use heartbeats so idle captured DBs still confirm LSNs.', nodes: ['wal', 'dbz'], ok: ['dbz'], tone: 'ok' }
        ]
      },
      {
        id: 'replay', title: 'Replay & duplicates at scale', tone: 'warn',
        steps: [
          { text: 'At 20k changes/s the search indexer crashes after writing a batch but before committing its Kafka offsets. On restart it <b>replays</b> the last batch.', flow: ['kafka>ix'], warn: ['ix'], badges: { ix: ['replay 5k', 'warn'] }, tone: 'warn' },
          { text: 'An <b>append</b> sink (insert a doc per event, increment a counter) now has duplicates. At-least-once delivery is the contract; exactly-once end to end is not.', nodes: ['ix', 'es'], err: ['es'], badges: { es: ['dupes', 'err'] }, tone: 'err' },
          { text: 'An <b>idempotent</b> sink writes by key with the source version: a replayed v7 over a stored v7 is a no-op, and an old v6 is rejected.', flow: ['ix>es'], ok: ['es'], badges: { es: ['version ≥ 7', 'ok'] }, tone: 'ok' },
          { text: 'Scale out by <b>partitions</b>, not by threads inside one partition: per-key order holds only within a partition. Re-partitioning changes key placement, so plan the count up front.', flow: [['kafka>cw', 'kafka>ix', 'kafka>delta']], hot: ['kafka'], badges: { kafka: '48 partitions' } },
          { text: 'Backfill a new index without stopping the stream: insert an <code>execute-snapshot</code> signal. Debezium re-reads the table in chunks, interleaved with live changes (DBLog-style watermarks).', flow: ['pg>wal', 'wal>dbz', 'dbz>kafka', 'kafka>ix'], badges: { dbz: 'incremental snapshot' }, tone: 'ok' }
        ]
      },
      {
        id: 'cdf', title: 'Delta CDF drives incremental jobs', tone: 'info',
        steps: [
          { text: 'A sink connector (or Spark job) MERGEs CDC events into a bronze/silver <b>Delta table</b> by key.', flow: ['kafka>delta'], badges: { delta: 'MERGE by id' } },
          { text: 'The table has <code>delta.enableChangeDataFeed = true</code>. Each commit also records which rows changed, with <code>_change_type</code>, <code>_commit_version</code>, <code>_commit_timestamp</code>.', nodes: ['delta'], badges: { delta: 'v1842' } },
          { text: 'The downstream job reads with <code>readChangeFeed</code> from its last processed version. It touches only changed keys, not the full table.', flow: ['delta>job'], badges: { job: 'v1840→1842' }, ok: ['job'] },
          { text: 'It skips <code>update_preimage</code> rows (or uses them to subtract old values from aggregates) and processes inserts, postimages and deletes. CDF only covers changes made <b>after</b> it was enabled.', flow: ['delta>job'], tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Each control is a real pipeline decision. Meter values are <em>illustrative</em> for a Postgres OLTP database at a few thousand writes per second with three sinks.',
      controls: [
        { id: 'cap', label: 'Capture method', type: 'seg', value: 'log', options: [
          { v: 'query', l: 'Query (poll updated_at)' }, { v: 'trigger', l: 'Triggers → audit table' }, { v: 'log', l: 'Log-based (WAL)' }, { v: 'outbox', l: 'Log-based + outbox' }] },
        { id: 'sink', label: 'Sink / delivery', type: 'seg', value: 'upsert', options: [
          { v: 'append', l: 'Append (at-least-once)' }, { v: 'upsert', l: 'Upsert by key + version' }, { v: 'eos', l: 'Kafka EOS + upsert' }] },
        { id: 'schema', label: 'Schema management', type: 'seg', value: 'reg', options: [
          { v: 'none', l: 'Schemaless JSON' }, { v: 'reg', l: 'Registry, BACKWARD' }] },
        { id: 'snap', label: 'Snapshot strategy', type: 'seg', value: 'incr', options: [
          { v: 'none', l: 'No snapshot' }, { v: 'block', l: 'Blocking initial' }, { v: 'incr', l: 'Incremental (chunked)' }] }
      ],
      evaluate(s) {
        const clamp = (x) => Math.max(0.03, Math.min(0.97, x));
        const C = s.cap, K = s.sink, R = s.schema, P = s.snap;
        const logb = C === 'log' || C === 'outbox';
        const fresh = { query: [0.3, '≈ poll interval (1–15 min)'], trigger: [0.75, 'seconds (+ relay poll)'], log: [0.92, 'sub-second to seconds'], outbox: [0.9, 'seconds'] }[C];
        let load = { query: 0.45, trigger: 0.2, log: 0.85, outbox: 0.8 }[C] + { none: 0.05, block: -0.25, incr: -0.05 }[P];
        let corr = { query: 0.3, trigger: 0.7, log: 0.75, outbox: 0.85 }[C] + { append: -0.35, upsert: 0.12, eos: 0.15 }[K] + (R === 'reg' ? 0.06 : -0.1) + (P === 'none' ? -0.25 : 0);
        let ops = { query: 0.8, trigger: 0.55, log: 0.45, outbox: 0.4 }[C] + (K === 'eos' ? -0.12 : 0) + (R === 'reg' ? -0.05 : 0.05) + (P === 'incr' ? -0.03 : 0);
        const disk = { query: [0.9, 'none: no slot'], trigger: [0.65, 'audit table bloat'], log: [0.35, 'slot can hold WAL'], outbox: [0.35, 'slot can hold WAL'] }[C];
        const dels = C === 'query' ? [0.15, 'missed (unless soft delete)'] : C === 'outbox' ? [0.85, 'as designed events'] : [0.95, 'every delete + tombstone'];
        const evo = R === 'reg' ? [0.85, 'checked at deploy time'] : [0.25, 'breaks consumers at runtime'];
        const metrics = [
          { k: 'Freshness', v: fresh[1], s: fresh[0] },
          { k: 'Source DB load', v: load >= 0.75 ? 'low: reads the log' : load >= 0.5 ? 'moderate' : 'high: extra writes or scans', s: clamp(load) },
          { k: 'Correctness risk', v: corr >= 0.8 ? 'low' : corr >= 0.55 ? 'medium' : 'high: drift likely', s: clamp(corr) },
          { k: 'Deletes captured', v: dels[1], s: dels[0] },
          { k: 'Schema evolution', v: evo[1], s: evo[0] },
          { k: 'Ops complexity', v: ops >= 0.7 ? 'low' : ops >= 0.45 ? 'medium: Connect + Kafka' : (K === 'eos' ? 'high: Connect, Kafka, registry, EOS' : 'high: Connect, Kafka, registry'), s: clamp(ops) },
          { k: 'Disk risk on source', v: disk[1], s: disk[0] }
        ];
        const notes = [];
        if (C === 'query') notes.push('Polling <code>updated_at &gt; :last</code> misses <b>hard deletes</b>, collapses several updates between polls into one, and can skip rows committed late with an earlier timestamp. It needs an index and still scans every poll.');
        if (C === 'trigger') notes.push('Triggers write an audit row <b>inside every transaction</b>: complete and simple, but it roughly doubles write work and still needs a relay to publish the audit table.');
        if (logb) notes.push('Log-based capture adds almost no write load, but the <b>replication slot</b> holds WAL while the connector is down. Set <code>max_slot_wal_keep_size</code> and alert on retained WAL.');
        if (C === 'outbox') notes.push('The outbox publishes <b>designed domain events</b>, so consumers do not couple to your table layout. Use raw table CDC for internal read models, outbox for other teams.');
        if (K === 'append') notes.push('Append sinks double-count on every replay (connector restart, rebalance, offset reset). Fine for a raw audit log, wrong for caches, indexes and totals.');
        if (K === 'eos') notes.push('Kafka exactly-once covers Kafka-to-Kafka steps. The final write to Redis or Elasticsearch is outside that transaction, so the sink must <b>still</b> be idempotent.');
        if (P === 'none') notes.push('Without a snapshot the sinks only see rows changed <b>after</b> the connector started; old rows are missing until they happen to change.');
        if (P === 'block' && logb) notes.push('A blocking initial snapshot of a large table can run for hours while the slot holds WAL. Incremental snapshots chunk the work and can be paused or re-run per table.');
        if (R === 'none') notes.push('Schemaless JSON lets a dropped or renamed column reach consumers as nulls or parse errors in production. A registry rejects the incompatible schema at deploy time.');

        let verdict;
        if (C === 'query' && K === 'append') verdict = '❌ <b>Polling into an append sink</b> misses deletes and duplicates on every re-run. Only acceptable for a rough nightly export.';
        else if (K === 'append' && C !== 'query') verdict = '⚠ <b>Good capture, fragile sink.</b> At-least-once delivery plus an append sink means duplicates after every restart. Upsert by key and version.';
        else if (C === 'query') verdict = '👍 <b>Simple and safe for the source disk</b>, but minutes stale and blind to hard deletes. Fine for analytics, not for caches or search.';
        else if (P === 'none') verdict = '⚠ <b>Incomplete copies:</b> sinks never see rows that did not change after start-up. Snapshot first, then stream.';
        else if (logb && K !== 'append' && R === 'reg' && P === 'incr') verdict = C === 'outbox' ? '✅ <b>The textbook pipeline:</b> outbox for public events, log-based capture, idempotent sinks, registry, incremental backfills. Say this in the interview.' : '✅ <b>Solid internal CDC:</b> log-based, ordered per key, idempotent sinks, schemas checked, backfills without downtime. Add an outbox for events other teams consume.';
        else if (C === 'trigger') verdict = '👍 <b>Works without logical replication</b> (e.g. a managed DB that forbids it), at the cost of extra write load on every transaction.';
        else verdict = '👍 <b>Workable.</b> Look at the weakest meter: that is where your next incident will come from.';

        const labels = {
          dbz: { query: { label: 'Poller job', sub: 'WHERE updated_at >' }, trigger: { label: 'Audit relay', sub: 'polls audit table' }, log: { label: 'Debezium', sub: 'Kafka Connect task' }, outbox: { label: 'Debezium', sub: 'outbox EventRouter' } }[C],
          wal: { query: { label: 'Table scan', sub: 'indexed updated_at' }, trigger: { label: 'Audit table', sub: 'written by trigger' }, log: { label: 'WAL + slot', sub: 'pgoutput · LSN' }, outbox: { label: 'WAL + slot', sub: 'pgoutput · LSN' } }[C],
          ix: { label: 'Search indexer', sub: K === 'append' ? 'append docs' : 'upsert by version' },
          cw: { label: 'Cache updater', sub: K === 'append' ? 'blind apply' : 'upsert / evict' },
          reg: R === 'reg' ? { label: 'Schema registry', sub: 'BACKWARD compat' } : { label: 'No registry', sub: 'JSON as-is' }
        };
        const hide = [];
        if (C !== 'outbox') hide.push('outbox');
        if (R === 'none') hide.push('reg');
        const flow = ['app>pg'];
        if (C === 'outbox') flow.push(['app>outbox'], 'outbox>wal');
        else flow.push('pg>wal');
        flow.push('wal>dbz');
        if (R === 'reg') flow.push('dbz>reg');
        flow.push('dbz>kafka', ['kafka>cw', 'kafka>ix', 'kafka>delta'], ['cw>redis', 'ix>es', 'delta>job']);
        const badges = {
          wal: logb ? ['slot: watch WAL', 'warn'] : C === 'query' ? ['scan every poll', 'warn'] : ['+1 write / txn', 'warn'],
          es: K === 'append' ? ['dupes on replay', 'err'] : ['idempotent', 'ok']
        };
        if (P === 'incr') badges.dbz = ['chunked backfill', 'info'];
        if (P === 'none') badges.redis = ['old rows missing', 'warn'];
        return {
          metrics, verdict, notes: notes.slice(0, 4), labels, hide, flow, badges,
          warn: (logb ? ['wal'] : []).concat(C === 'query' ? ['pg'] : []),
          err: K === 'append' ? ['es'] : [],
          ok: K !== 'append' ? ['ix', 'cw'] : []
        };
      }
    },

    widget: {
      title: 'CDC pipeline: WAL → slot → Kafka → cache + search',
      caption: 'Rows change in Postgres; WAL entries flow through the <b>slot</b> and the connector into a <b>Kafka partition</b>, then to two sinks. <b>Stop the connector</b> to watch retained WAL grow in the slot. <b>Pause a sink</b> to see lag build in Kafka instead (the slot stays small). <b>Crash a sink</b> to replay from its last committed offset, and switch <b>idempotent</b> off to see duplicates.'
    },

    realWorld: {
      intro: 'Every large company that runs CDC wrote about the same three problems: getting a complete initial copy, never losing a change, and not hurting the source database.',
      timeline: [
        { when: '2015', who: 'Martin Kleppmann', title: 'Why dual writes are a bad idea', text: 'In a Craft Conference talk, later a Confluent post and a chapter of <i>Making Sense of Stream Processing</i>, Kleppmann showed how two clients writing to two stores can <b>interleave</b> so the stores disagree permanently. His fix: make the database\'s ordered log the source of truth and derive the other stores from it.', src: 0 },
        { when: '2017–18', who: 'Airbnb', title: 'SpinalTap', text: 'Airbnb built SpinalTap, a general-purpose, <b>lossless</b> CDC service that detects mutations with low latency across different data sources and publishes them as standardised events, so services stop polling or dual-writing. It was presented at Percona Live 2017 and described on the Airbnb blog in 2018, then open-sourced.', src: 4 },
        { when: '2020', who: 'Netflix', title: 'DBLog: watermark-based CDC', text: 'Andreakis and Papapanagiotou described DBLog: it <b>interleaves log events with chunked table selects</b>, using low/high watermarks so full-state dumps can run, pause and resume <b>without locks</b> while streaming continues. The paper says it ran in production for tens of microservices. Debezium\'s incremental snapshots are based on this design.', src: 5 },
        { when: '2020', who: 'PostgreSQL 13', title: 'max_slot_wal_keep_size', text: 'Before PG 13 a forgotten slot could retain WAL without limit and fill the primary\'s disk. PG 13 added <code>max_slot_wal_keep_size</code> (default <code>-1</code>, unlimited) and the <code>wal_status</code> / <code>safe_wal_size</code> columns; past the cap the slot is invalidated instead of the server failing.', src: 7 },
        { when: 'pre-streaming', who: 'Shopify', title: 'Capturing every change from a sharded monolith', text: 'Shopify described <b>Longboat</b>, a custom <b>query-based</b> CDC tool that ran batch extraction jobs against its sharded MySQL monolith and wrote change events to cloud storage that were then denormalised into large warehouse tables. It is a candid example of where query-based CDC works (batch analytics) and where its latency and gaps start to hurt.', src: 6 },
        { when: 'ongoing', who: 'Chris Richardson', title: 'Transactional outbox & log tailing', text: 'microservices.io documents the outbox: events are inserted into an outbox table in the same local transaction, so a message is sent <b>if and only if</b> the transaction commits, without 2PC. A relay (polling publisher or <b>transaction log tailing</b>) forwards them, and may publish a message more than once, so consumers must be idempotent.', src: 2 },
        { when: 'Debezium 1.x →', who: 'Debezium', title: 'Outbox event router & incremental snapshots', text: 'Debezium ships an <b>outbox event router</b> SMT (topic from <code>aggregatetype</code>, key from <code>aggregateid</code>, payload passed through) and <b>signals</b> that trigger incremental, chunked snapshots of chosen tables while streaming continues.', src: 11 },
        { when: '2022', who: 'Delta Lake', title: 'Change data feed in open source', text: 'Delta Lake 2.0 brought the change data feed to open source: row-level changes between table versions with <code>_change_type</code> (insert, update_preimage, update_postimage, delete), read with <code>readChangeFeed</code>. Only changes after enabling it are recorded.', src: 13 }
      ],
      lessons: [
        'Make the database the <b>only writer</b>; derive everything else from its log.',
        'Snapshot and stream must be stitched without gaps: <b>slot first, then snapshot</b> (or watermarks).',
        'Treat <b>replication slots as production risk</b>: cap them, alert on them, drop unused ones.',
        'Delivery is at-least-once; correctness lives in <b>idempotent, versioned sinks</b>.',
        'Publish <b>designed events</b> through an outbox; keep raw table CDC internal.'
      ],
      sources: [
        { title: 'Using logs to build a solid data infrastructure (or: why dual writes are a bad idea)', url: 'https://martin.kleppmann.com/2015/05/27/logs-for-data-infrastructure.html', pub: 'Martin Kleppmann, 2015' },
        { title: 'Solving the Dual-Write Problem', url: 'https://www.confluent.io/blog/dual-write-problem', pub: 'Confluent blog' },
        { title: 'Pattern: Transactional outbox', url: 'https://microservices.io/patterns/data/transactional-outbox', pub: 'Chris Richardson, microservices.io' },
        { title: 'Pattern: Transaction log tailing', url: 'https://microservices.io/patterns/data/transaction-log-tailing.html', pub: 'Chris Richardson, microservices.io' },
        { title: 'Capturing Data Evolution in a Service-Oriented Architecture (SpinalTap)', url: 'https://medium.com/airbnb-engineering/capturing-data-evolution-in-a-service-oriented-architecture-72f7c643ee6f', pub: 'Airbnb Engineering, 2018' },
        { title: 'DBLog: A Watermark Based Change-Data-Capture Framework', url: 'https://arxiv.org/abs/2010.12597', pub: 'Andreakis & Papapanagiotou (Netflix), arXiv 2020' },
        { title: 'Capturing Every Change From Shopify\'s Sharded Monolith', url: 'https://shopify.engineering/capturing-every-change-shopify-sharded-monolith', pub: 'Shopify Engineering (John Martin, Adam Bellemare)' },
        { title: 'Replication settings: max_slot_wal_keep_size', url: 'https://www.postgresql.org/docs/17/runtime-config-replication.html', pub: 'PostgreSQL documentation' },
        { title: 'PostgreSQL 13: Don\'t let slots kill your primary', url: 'https://www.enterprisedb.com/index.php/blog/postgresql-13-dont-let-slots-kill-your-primary', pub: 'EDB / 2ndQuadrant' },
        { title: 'Mastering Postgres Replication Slots', url: 'https://morling.dev/blog/mastering-postgres-replication-slots', pub: 'Gunnar Morling' },
        { title: 'Debezium connector for PostgreSQL', url: 'https://debezium.io/documentation/reference/2.2/connectors/postgresql.html', pub: 'Debezium documentation' },
        { title: 'Outbox Event Router', url: 'https://debezium.io/documentation/reference/2.4/transformations/outbox-event-router.html', pub: 'Debezium documentation' },
        { title: 'Sending signals to a Debezium connector', url: 'https://debezium.io/documentation/reference/2.0/configuration/signalling.html', pub: 'Debezium documentation' },
        { title: 'Change data feed', url: 'https://docs.delta.io/3.0.0/delta-change-data-feed.html', pub: 'Delta Lake documentation' },
        { title: 'Use change data feed on Databricks', url: 'https://docs.databricks.com/aws/en/tables/features/change-data-feed', pub: 'Databricks documentation' }
      ]
    },

    tradeoffs: {
      headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
      rows: [
        ['Capture', '<b>Query-based</b> (poll <code>updated_at</code>): no DB privileges, no slot', '<b>Log-based</b> (WAL): every change incl. deletes, low source load', 'Query for coarse analytics feeds; log-based for caches, search, services. Triggers when logical replication is not allowed.'],
        ['What to publish', '<b>Raw table CDC</b>: zero app changes, full fidelity', '<b>Outbox events</b>: designed contract, decoupled from schema', 'Raw CDC for your own read models; outbox for events other teams consume'],
        ['Sink semantics', '<b>Append</b>: full history, simple', '<b>Upsert by key + version</b>: replay-safe current state', 'Append only for audit logs that dedupe by event id; upsert for every state copy'],
        ['Delivery', '<b>At-least-once</b> + idempotent sink', '<b>Kafka EOS</b> transactions', 'Always idempotent at the edge; EOS helps only for Kafka-to-Kafka processing'],
        ['Initial load', '<b>Blocking snapshot</b>: simple, consistent', '<b>Incremental snapshot</b>: chunked, resumable, per table', 'Blocking for small tables; incremental for large ones and for re-backfills'],
        ['Lakehouse change tracking', '<b>Delta CDF</b>: row changes per version', '<b>Full recompute</b> or file-level diffs', 'CDF when downstream jobs can merge by key; recompute for small tables or complex logic']
      ]
    },

    failures: [
      { f: 'Stale replication slot fills the primary\'s disk', detect: '<code>pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)</code> growing; <code>active = false</code>; <code>wal_status</code> extended/unreserved', fix: 'Set <code>max_slot_wal_keep_size</code>, alert at 20% of it, drop slots of retired connectors, enable heartbeats on low-traffic databases.' },
      { f: 'Dual write drift', detect: 'Reconciliation finds rows that differ between DB and cache/index; support tickets about "wrong price in search"', fix: 'Remove direct writes to derived stores; derive them from CDC; publish events via an outbox.' },
      { f: 'Duplicates after replay', detect: 'Counts in a sink exceed the source; same event id applied twice after a rebalance', fix: 'Upsert by key with a version/LSN guard; dedupe by event id for append-only logs.' },
      { f: 'Out-of-order apply', detect: 'Older value overwrites newer one; occurs after a partition count change or multi-threaded consumers', fix: 'Partition by primary key, keep one thread per partition, reject events with a lower version.' },
      { f: 'Breaking schema change', detect: 'Consumer deserialisation errors or sudden null columns after a migration', fix: 'Schema registry with BACKWARD compatibility in CI; expand/contract migrations; outbox payloads versioned.' },
      { f: 'Missing deletes / zombie rows', detect: 'Rows deleted in source still in search or cache; compacted topic keeps old keys', fix: 'Log-based capture; emit tombstones; sinks handle <code>op = d</code> and null values as deletes.' },
      { f: 'Snapshot overloads the source', detect: 'Long-running snapshot queries, replica lag, lock waits during the initial load', fix: 'Incremental (chunked) snapshots from a replica where supported; throttle chunk size; run off-peak.' }
    ],

    interview: [
      { q: 'What is change data capture, and what are the three ways to do it?', a: '<p>CDC turns committed database changes into a stream of events. <b>Query-based</b>: poll for rows with <code>updated_at</code> greater than the last high-water mark; simple, but misses hard deletes and intermediate updates and loads the DB with scans. <b>Trigger-based</b>: triggers write each change to an audit table; complete, but adds a write to every transaction. <b>Log-based</b>: read the transaction log (Postgres WAL, MySQL binlog); complete, ordered, low overhead, but needs replication privileges and slot management.</p>', fu: 'Why does polling miss rows even when nothing is deleted?', lvl: 'core' },
      { q: 'What is the dual-write problem and how does CDC fix it?', a: '<p>Writing to two systems (DB and Kafka, or DB and Elasticsearch) from application code is <b>not atomic</b>: a crash between them loses one write, and two concurrent requests can apply in different orders in each store (Kleppmann, 2015). CDC makes the DB the <b>single writer</b> and derives the other stores from its commit-ordered log, so they converge. For events, the <b>transactional outbox</b> puts the event in the same local transaction.</p>', lvl: 'core' },
      { q: 'How does Postgres logical decoding work end to end?', a: '<p>Set <code>wal_level = logical</code>. Create a <b>publication</b> naming the tables. A <b>logical replication slot</b> with the <code>pgoutput</code> plug-in decodes WAL into row changes for those tables, in commit order, sending only committed transactions. The client confirms an LSN; the slot\'s <code>confirmed_flush_lsn</code> and <code>restart_lsn</code> advance and Postgres can recycle older WAL. <code>REPLICA IDENTITY</code> controls how much of the old row is included for updates and deletes (by default only the primary key).</p>', fu: 'What happens to the slot when the primary fails over to a replica?', lvl: 'deep' },
      { q: 'Why can a CDC pipeline take down the source database?', a: '<p>A slot stops Postgres from removing WAL the consumer has not confirmed. If the connector is down, or the captured DB is idle while others in the cluster are busy (so no LSN is confirmed), WAL accumulates for the <b>whole cluster</b> until the disk fills and the primary stops. Mitigate: <code>max_slot_wal_keep_size</code> (PG 13+, invalidates the slot instead), alerts on retained WAL and <code>wal_status</code>, heartbeats, and dropping unused slots. Trade-off: a lost slot means a re-snapshot.</p>', lvl: 'core' },
      { q: 'Describe a Debezium change event.', a: '<p>Key: the primary key. Value envelope: <code>before</code> (old row, null for inserts, key-only unless <code>REPLICA IDENTITY FULL</code>), <code>after</code> (new row, null for deletes), <code>op</code> (<code>c</code>, <code>u</code>, <code>d</code>, <code>r</code> for snapshot reads), <code>source</code> (connector, DB, table, LSN, txId) and <code>ts_ms</code>. A delete is followed by a <b>tombstone</b> (same key, null value) so log compaction can drop the key. Many sinks use the <code>ExtractNewRecordState</code> SMT to flatten to <code>after</code>.</p>', lvl: 'core' },
      { q: 'How do you get a complete copy of a 2 TB table without stopping writes?', a: '<p><b>Create the slot first</b> to pin the stream start, then snapshot the existing rows and stream from the slot, so nothing falls in the gap. For huge tables or later backfills use <b>incremental snapshots</b> (Netflix DBLog\'s idea, implemented in Debezium): read the table in primary-key chunks, bracket each chunk with low/high watermarks written to the log, and drop snapshot rows that were changed by a log event inside the window. No locks, resumable, can run per table while streaming continues.</p>', lvl: 'deep' },
      { q: 'CDC is at-least-once. How do you make sinks correct?', a: '<p>Make apply <b>idempotent</b> and <b>order-aware</b>: upsert by primary key and store the source version or LSN; ignore any event whose version is not newer (<code>ON CONFLICT ... WHERE target.version &lt; excluded.version</code>, Elasticsearch external versioning). Treat <code>op = d</code> and tombstones as deletes (or soft-delete with the version). Keep per-key order by partitioning on the key and processing a partition with one thread. Kafka EOS does not cover the write to Redis or Elasticsearch, so you still need this.</p>', fu: 'How would you dedupe an append-only audit sink?', lvl: 'core' },
      { q: 'When would you publish raw table changes, and when an outbox event?', a: '<p>Raw table CDC is great for <b>your own</b> derived stores (cache, search, warehouse): no code changes, full fidelity. But it exposes your schema: renaming a column becomes a breaking change for every consumer. For events other teams consume, use an <b>outbox</b>: the service writes a designed event (<code>OrderPlaced v2</code>) in the same transaction, Debezium\'s outbox router routes it by <code>aggregatetype</code> and keys it by <code>aggregateid</code>. You get atomicity <b>and</b> a stable contract.</p>', lvl: 'core' },
      { q: 'How do you handle schema evolution in a CDC pipeline?', a: '<p>Serialise with Avro or Protobuf and register schemas per topic in a <b>schema registry</b> with BACKWARD (or FULL) compatibility, so producers can only make changes old consumers can read: add optional columns, never drop or retype in one step. Run DB migrations as <b>expand/contract</b> (add new column, backfill, move readers, then drop). Check compatibility in CI before the migration ships.</p>', lvl: 'deep' },
      { q: 'What is Delta Lake\'s change data feed and when does it help?', a: '<p>With <code>delta.enableChangeDataFeed = true</code>, Delta records row-level changes per table version. Reading with <code>readChangeFeed</code> (batch from a <code>startingVersion</code>, or streaming) returns changed rows with <code>_change_type</code> (insert, update_preimage, update_postimage, delete), <code>_commit_version</code> and <code>_commit_timestamp</code>. It lets silver/gold jobs process <b>only changed keys</b> instead of recomputing whole tables. It only covers changes after enabling, and old change files are subject to retention/vacuum.</p>', lvl: 'deep' },
      { q: 'Design keeping a product search index in sync with Postgres at 20k writes/s.', a: '<p>Debezium on Kafka Connect reading a publication of <code>products</code> via <code>pgoutput</code>; topic partitioned by product id (e.g. 48 partitions for consumer headroom); Avro + registry. Indexer consumer group applies bulk requests with <b>external versions</b>, handles deletes. Initial load via incremental snapshot. SLOs: lag p99 &lt; 5 s, slot WAL &lt; 20% of <code>max_slot_wal_keep_size</code>. Size consumers at ≥ 2× peak write rate so a one-hour outage drains in about an hour. Nightly reconciliation of counts and checksums by id range. Reads that must see the user\'s own write go to Postgres.</p>', fu: 'How do you reindex with a new mapping without downtime?', lvl: 'core' },
      { q: 'Your team wants to add "publish to Kafka" right after the DB commit. How do you convince them to use CDC/outbox instead?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: orders were written to Postgres and then published to Kafka in the same request; billing occasionally never saw an order. <b>Task</b>: stop losing events without slowing delivery. <b>Action</b>: pulled a week of reconciliation data showing ~40 missing events, explained the crash window, prototyped an outbox table plus the Debezium outbox router in two days, and agreed slot alerts with the DBAs. <b>Result</b>: missing events went to zero in reconciliation, and the publish code in the request path was deleted.</p>', lvl: 'core' }
    ],

    code: [
      {
        title: 'Postgres: publication, slot cap and slot monitoring', lang: 'sql',
        code: `-- postgresql.conf: wal_level = logical  (requires restart)
-- Cap what any slot may retain; past this the slot becomes 'lost' (PG 13+).
ALTER SYSTEM SET max_slot_wal_keep_size = '100GB';
SELECT pg_reload_conf();

-- Only these tables are decoded for the connector.
CREATE PUBLICATION dbz_orders
  FOR TABLE public.orders, public.outbox
  WITH (publish = 'insert, update, delete');

-- Sinks that need the full old row on update/delete:
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Debezium creates its slot itself; shown for clarity:
-- SELECT pg_create_logical_replication_slot('dbz_orders', 'pgoutput');

-- Monitor: alert when retained WAL > 20% of the cap or a slot is inactive.
SELECT slot_name,
       active,
       wal_status,                                   -- reserved | extended | unreserved | lost
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn))         AS retained_wal,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS consumer_lag,
       pg_size_pretty(safe_wal_size)                 AS headroom_before_lost
FROM   pg_replication_slots
WHERE  slot_type = 'logical'
ORDER  BY pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) DESC;

-- Retired a connector? Drop its slot, or it holds WAL forever.
-- SELECT pg_drop_replication_slot('dbz_old');`,
        note: '<code>safe_wal_size</code> is null when no cap is set. Run the monitoring query from your metrics exporter every minute.'
      },
      {
        title: 'Debezium Postgres connector with the outbox router (Strimzi)', lang: 'yaml',
        code: `apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaConnector
metadata:
  name: orders-outbox
  labels:
    strimzi.io/cluster: connect
spec:
  class: io.debezium.connector.postgresql.PostgresConnector
  tasksMax: 1                      # Postgres connector is single-task
  config:
    database.hostname: orders-db
    database.port: 5432
    database.user: debezium
    database.password: \${secrets:cdc/orders-db:password}
    database.dbname: orders
    topic.prefix: orders           # Debezium 2.x
    plugin.name: pgoutput
    slot.name: dbz_orders
    publication.name: dbz_orders
    publication.autocreate.mode: disabled   # created by the DBA (see SQL)
    table.include.list: public.outbox
    snapshot.mode: initial
    heartbeat.interval.ms: 10000   # confirm LSNs even when tables are idle
    signal.data.collection: public.debezium_signal
    tombstones.on.delete: false
    key.converter: org.apache.kafka.connect.storage.StringConverter
    value.converter: io.confluent.connect.avro.AvroConverter
    value.converter.schema.registry.url: http://schema-registry:8081
    transforms: outbox
    transforms.outbox.type: io.debezium.transforms.outbox.EventRouter
    transforms.outbox.table.field.event.key: aggregateid
    transforms.outbox.route.by.field: aggregatetype
    transforms.outbox.route.topic.replacement: outbox.event.\${routedByValue}
    transforms.outbox.table.expand.json.payload: true`,
        note: 'This connector captures only the outbox. Run a second connector (its own slot and publication) for raw table CDC, flattened with <code>ExtractNewRecordState</code>. Check option names against the Debezium version you deploy.'
      },
      {
        title: 'Spring Kafka: idempotent, version-guarded upsert sink', lang: 'java',
        code: `// Spring Boot 3, Java 21. Topic values = flattened "after" row (ExtractNewRecordState),
// key = order id, null value = tombstone (delete).
@Component
public class OrderReadModelSink {
  private final JdbcClient jdbc;
  private final ObjectMapper json;
  public OrderReadModelSink(JdbcClient jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }

  record OrderRow(long id, String status, long totalCents, long version) {}

  @KafkaListener(topics = "orders.public.orders", groupId = "order-read-model")
  public void onChange(ConsumerRecord<String, String> rec) throws JsonProcessingException {
    if (rec.value() == null) {                       // tombstone: delete by key
      jdbc.sql("DELETE FROM order_view WHERE id = :id")
          .param("id", Long.parseLong(rec.key())).update();
      return;
    }
    OrderRow r = json.readValue(rec.value(), OrderRow.class);
    // Replays and late duplicates are no-ops: only a newer version wins.
    int changed = jdbc.sql("""
        INSERT INTO order_view (id, status, total_cents, version)
        VALUES (:id, :status, :total, :version)
        ON CONFLICT (id) DO UPDATE
          SET status = EXCLUDED.status,
              total_cents = EXCLUDED.total_cents,
              version = EXCLUDED.version
          WHERE order_view.version < EXCLUDED.version
        """)
        .param("id", r.id()).param("status", r.status())
        .param("total", r.totalCents()).param("version", r.version())
        .update();
    if (changed == 0) { /* stale or duplicate event: count it, do not fail */ }
  }
}`,
        note: '<code>version</code> is a column the source increments on every update (or use the event\'s LSN). Offsets are committed after the listener returns, so a crash replays the batch: harmless here. A delete followed by a replayed older insert can resurrect a row; soft-delete with a version if that matters.'
      }
    ],

    related: ['data-architecture', 'event-driven-sagas', 'zero-downtime-migrations', 'strangler-fig', 'sd:message-queue', 'sd:search-engine', 'sd:distributed-cache']
  });

  /* knobs diagram = architecture as-is (outbox/registry hidden per choice) */
  SD.data.knobs.diagram = SD.data.architecture;
})();
