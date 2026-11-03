SD.register({
  slug: 'data-lake',
  domain: 9,
  title: 'Data Lake & Batch/Stream ETL',
  examples: 'Netflix Iceberg, Uber Hudi, Databricks',
  tagline: 'Keep every raw and cleaned dataset as <b>immutable files in cheap object storage</b>, and make them behave like database tables: a <b>table format</b> (Iceberg, Delta, Hudi) turns every batch or streaming write into an atomic snapshot, committed by <b>one compare-and-swap</b> on a metadata pointer.',
  tldr: {
    problem: 'Thousands of jobs and streams write Parquet files into S3, and several engines read them. Without coordination, readers see half-written partitions, an update means rewriting whole folders, and nobody can say exactly which files make up "the table" right now.',
    idea: 'Track a table\'s files in an <b>immutable metadata tree</b>: metadata.json → manifest list → manifests → data files. A writer uploads new files, then <b>atomically swaps one pointer</b> in a catalog. Readers pin one snapshot. Writers use <b>optimistic concurrency</b>: validate, retry, or abort.',
    insight: 'Because snapshots are immutable, <b>snapshot isolation, time travel and rollback come almost for free</b>. The bill arrives as housekeeping: compaction of small files, snapshot expiry and orphan-file cleanup.',
    numbers: [
      { v: '~350 PB', l: 'logical data in Uber\'s Hudi lake (Uber, 2026)' },
      { v: '~350K', l: 'Hudi commits per day at Uber (Uber, 2026)' },
      { v: '512 MB', l: 'Iceberg default target data-file size' }
    ]
  },

  intro: {
    what: 'A data lake keeps all of a company\'s data (app events, copies of production databases, logs) as files in cheap <b>object storage</b> such as Amazon S3. A <b>table format</b> on top makes those files behave like database tables, so nightly batch jobs, live streams and SQL engines can all read and write the same tables safely.',
    analogy: {
      icon: '📚',
      title: 'A library whose card catalogue is swapped in one move',
      text: 'The books (data files) sit on huge, cheap shelves and are never edited: a new edition is a new book. The <b>card catalogue</b> lists which books make up the current collection. A librarian adding books shelves them first, then swaps in a new catalogue drawer in one move, and readers keep using the drawer they already picked up. The analogy breaks in one place: real catalogues are edited card by card, while here every change produces a whole new catalogue version that shares most of its cards with the old one.'
    },
    problem: 'A streaming job writes a new file into <code>s3://lake/orders/date=2026-11-03/</code> every minute, and a nightly job rewrites the same folder. A dashboard query lists the folder halfway through the rewrite and counts some orders twice. Fixing one customer\'s address means rewriting the whole folder. <b>How do you get database-style atomic commits and consistent reads on top of plain files that many engines share?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Drop Parquet files into folders',
        text: 'Each job writes files into one folder per day (<code>date=…</code>). A metastore maps the table name to its folders, and a query engine <b>lists the folder</b> and reads every file in it. It is cheap and open, and every engine understands it.',
        scene: {
          nodes: [
            { id: 'job', label: 'Nightly job', sub: 'rewrites a day', kind: 'compute', at: [70, 0] },
            { id: 'strm', label: 'Stream job', sub: 'file per minute', kind: 'compute', at: [350, 0] },
            { id: 's3', label: 'S3 folders', sub: 'date=2026-11-03/', kind: 'store', at: [210, 110] },
            { id: 'q', label: 'Query engine', sub: 'lists the folder', kind: 'service', at: [210, 220] }
          ],
          edges: [{ from: 'job', to: 's3' }, { from: 'strm', to: 's3' }, { from: 'q', to: 's3' }],
          flow: [['job>s3', 'strm>s3'], 'q>s3']
        }
      },
      {
        stage: 'breaks',
        title: 'Half-written folders, tiny files, no row updates',
        text: 'A reader lists the folder while the nightly job is replacing it and sees old and new files together. Changing one row means rewriting the whole folder. The stream adds <b>thousands of tiny files</b>, and listing them on S3 gets slow.',
        scene: {
          nodes: [
            { id: 'job', label: 'Nightly job', sub: 'replacing files', kind: 'compute', at: [70, 0] },
            { id: 'strm', label: 'Stream job', sub: 'file per minute', kind: 'compute', at: [350, 0] },
            { id: 's3', label: 'S3 folders', sub: 'old + new mixed', kind: 'store', at: [210, 110] },
            { id: 'q', label: 'Query engine', sub: 'lists the folder', kind: 'service', at: [210, 220] }
          ],
          edges: [{ from: 'job', to: 's3' }, { from: 'strm', to: 's3' }, { from: 'q', to: 's3' }],
          flow: [['job>s3', 'strm>s3'], 'q>s3'],
          err: ['s3', 'q'],
          badges: { q: ['double count', 'err'], s3: ['10K tiny files', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Commit snapshots by swapping one pointer',
        text: 'Writers upload new immutable files, list them in a new metadata version, then <b>swap the catalogue pointer</b> with a compare-and-swap. If two writers race, one swap fails and that writer retries on top of the winner. Readers follow the pointer to one fixed snapshot.',
        scene: {
          nodes: [
            { id: 'job', label: 'Nightly job', sub: 'new files + v43', kind: 'compute', at: [70, 0] },
            { id: 'strm', label: 'Stream job', sub: 'new files + v43', kind: 'compute', at: [350, 0] },
            { id: 'cat', label: 'Catalog', sub: 'current → v42', kind: 'service', at: [210, 110] },
            { id: 's3', label: 'S3 files', sub: 'immutable Parquet', kind: 'store', at: [70, 220] },
            { id: 'q', label: 'Query engine', sub: 'reads snapshot', kind: 'service', at: [350, 220] }
          ],
          edges: [{ from: 'job', to: 's3' }, { from: 'job', to: 'cat' }, { from: 'strm', to: 'cat' }, { from: 'q', to: 'cat' }, { from: 'q', to: 's3' }],
          flow: ['job>s3', ['job>cat', 'strm>cat'], 'q>cat', 'q>s3'],
          ok: ['cat', 'q'],
          warn: ['strm'],
          badges: { cat: ['v42 → v43', 'ok'], strm: ['lost race → retry', 'warn'] }
        }
      }
    ],
    usedBy: ['Netflix (Apache Iceberg)', 'Uber (Apache Hudi)', 'Databricks (Delta Lake)', 'Airbnb (Iceberg on S3)', 'AWS Athena and Glue', 'Snowflake and BigQuery (Iceberg tables)'],
    whenToUse: [
      'Many teams and engines (Spark, Flink, Trino) need the <b>same tables</b>, at petabyte scale and object-storage prices',
      'Both nightly batch jobs and streams must write those tables, including <b>row-level upserts</b> from database change feeds',
      'You need reproducible history: <b>time travel</b>, rollback of a bad load, and audits of what changed when'
    ],
    whenNot: [
      'Dashboards need second-level freshness and small aggregates: use <a href="stream-analytics.html">Stream Analytics</a> with a serving store',
      'The workload is transactional (many small reads and writes per second by key): use <a href="distributed-sql.html">Distributed SQL</a> or Postgres',
      'All your data fits in one warehouse or one Postgres and only one engine reads it: a lake adds moving parts you do not need'
    ],
    glossary: [
      { term: 'Object storage', def: 'A store of immutable blobs addressed by key (S3, GCS, ADLS): cheap and very durable, but it has no multi-file transactions.' },
      { term: 'Table format', def: 'A specification (Iceberg, Delta Lake, Hudi) for metadata files that say which data files form a table at each version.' },
      { term: 'Snapshot', def: 'The complete, immutable list of a table\'s files at one commit. Reads use one snapshot from start to end.' },
      { term: 'Manifest', def: 'A metadata file listing data or delete files with their partition values and per-column min/max statistics.' },
      { term: 'Catalog', def: 'The service that maps a table name to its current metadata file and swaps that pointer atomically (Hive Metastore, Glue, a REST catalog).' },
      { term: 'Compare-and-swap (CAS)', def: '"Set the pointer to B only if it still equals A." The single atomic step that makes a commit all or nothing.' },
      { term: 'Compaction', def: 'A background rewrite that merges many small files (and pending deletes) into fewer large ones.' },
      { term: 'Change data capture (CDC)', def: 'Streaming every insert, update and delete out of a database\'s log, for example with Debezium.' }
    ]
  },

  requirements: {
    functional: [
      'Land app events and OLTP database changes (CDC) in a raw <b>bronze</b> zone within minutes',
      'Clean, deduplicate and conform into <b>silver</b> tables; aggregate into <b>gold</b> tables for BI and ML',
      'Batch jobs (nightly, backfills) and streaming jobs write the <b>same tables</b>',
      'Row-level upserts and deletes (CDC, GDPR erasure)',
      'Time travel (as of snapshot or timestamp) and rollback of a bad write',
      'Spark, Flink and Trino share tables through one catalog'
    ],
    nonFunctional: [
      'Atomic commits: a reader never sees part of a write',
      'Freshness: minutes for streaming tables, hours for nightly gold',
      'Petabytes at object-storage cost per byte',
      'Query planning must not depend on listing folders',
      'Schema and partitioning can change without rewriting data',
      'Retention and deletion enforced (storage cost and privacy)'
    ],
    outOfScope: ['Sub-second streaming aggregates (see Stream Analytics)', 'Object store durability and erasure coding (see Object Storage)', 'Workflow scheduler internals (see Job Scheduler)', 'PII discovery and access policy (see Privacy-Aware Data Platform)']
  },

  calculator: {
    inputs: [
      { id: 'eps', label: 'Rows ingested per second (all streams)', min: 5000, max: 5000000, value: 200000, log: true },
      { id: 'bytes', label: 'Bytes per row in Parquet (compressed)', min: 20, max: 500, step: 10, value: 60, fmt: 'bytes' },
      { id: 'interval', label: 'Streaming commit interval (checkpoint)', min: 10, max: 900, step: 10, value: 60, unit: 's' },
      { id: 'par', label: 'Files per commit (writer tasks × partitions touched)', min: 1, max: 256, value: 32 },
      { id: 'target', label: 'Compaction target file size', min: 64, max: 1024, step: 64, value: 512, unit: 'MB' },
      { id: 'retain', label: 'Snapshot retention (time-travel window)', min: 1, max: 30, value: 5, unit: 'days' }
    ],
    outputs: [
      { label: 'New lake data per day', fmt: 'bytes', f: (v) => v.eps * v.bytes * 86400 },
      { label: 'Commits (snapshots) per day', f: (v) => 86400 / v.interval },
      { label: 'Files written per day by streaming', f: (v) => (86400 / v.interval) * v.par },
      { label: 'Average streaming file size', fmt: 'bytes', f: (v) => (v.eps * v.bytes * v.interval) / v.par },
      { label: 'Files per day after compaction', f: (v) => Math.ceil((v.eps * v.bytes * 86400) / (v.target * 1e6)) },
      { label: 'Snapshots kept for time travel', f: (v) => Math.round((86400 / v.interval) * v.retain) }
    ],
    note: 'Row sizes and parallelism are <em>estimates</em>. Compare the average streaming file size with the compaction target: when it is a few MB, every query pays per-file overhead (an S3 GET plus a Parquet footer read per file) until compaction runs. The 512 MB default target is Iceberg\'s <code>write.target-file-size-bytes</code>. Snapshots kept grows with commit frequency, which is why streaming tables need regular <b>expire_snapshots</b>.'
  },

  api: [
    { m: 'POST', p: '/v1/{prefix}/namespaces/{ns}/tables/{table}', d: 'Iceberg REST catalog <b>commit</b>. The body has <code>requirements</code> (e.g. <code>assert-ref-snapshot-id</code>: main is still S41) and <code>updates</code> (<code>add-snapshot</code>, <code>set-snapshot-ref</code>). A failed requirement returns <b>409</b> and the client retries.' },
    { m: 'SQL', p: 'MERGE INTO silver.orders t USING cdc s ON t.id = s.id …', d: 'Row-level upsert from a CDC batch. Copy-on-write rewrites affected files; merge-on-read writes delete files instead.' },
    { m: 'SQL', p: 'INSERT OVERWRITE silver.events SELECT … (dynamic)', d: 'Idempotent batch load: replaces only the partitions present in the output, so rerunning a day gives the same table.' },
    { m: 'SQL', p: 'SELECT … FROM t VERSION AS OF 8812 | TIMESTAMP AS OF \'…\'', d: '<b>Time travel</b> in Spark SQL: read an older snapshot. It works only while that snapshot has not been expired.' },
    { m: 'SQL', p: 'CALL system.rollback_to_snapshot(\'silver.orders\', 8812)', d: 'Point <code>main</code> back to an older snapshot after a bad load. No data is copied or deleted.' },
    { m: 'SQL', p: 'CALL system.rewrite_data_files / expire_snapshots / remove_orphan_files', d: 'Table maintenance: compact small files, drop old snapshots, then delete files no snapshot references.' }
  ],
  dataModel: [
    { name: 'iceberg_tables (catalog)', store: 'Catalog: JDBC / REST / Glue / HMS', fields: [['namespace, table_name', 'text', 'pk'], ['metadata_location', 's3 path'], ['previous_metadata_location', 's3 path']], note: 'The <b>only mutable thing</b> in the design. A commit is <code>UPDATE … SET metadata_location = :new WHERE metadata_location = :expected</code>.' },
    { name: '00042-….metadata.json', store: 'Object store, immutable', fields: [['table-uuid', 'uuid', 'pk'], ['format-version', '1 | 2 | 3'], ['schemas, current-schema-id', 'field ids'], ['partition-specs, default-spec-id', 'spec ids'], ['current-snapshot-id', 'int64', 'fk'], ['snapshots[], snapshot-log', 'list'], ['refs', 'main, audit, tags']], note: 'Every commit writes a new one. Old versions stay for time travel until expired.' },
    { name: 'manifest list (one per snapshot)', store: 'Avro file', fields: [['snapshot-id, parent-snapshot-id', 'int64', 'pk'], ['sequence-number', 'int64'], ['manifest_path', 's3 path', 'fk'], ['partitions', 'min/max per field', 'idx'], ['added / existing / deleted counts', 'int']], note: 'Partition summaries let the planner skip whole manifests.' },
    { name: 'manifest', store: 'Avro file', fields: [['status', 'ADDED | EXISTING | DELETED'], ['content', 'data | pos-del | eq-del'], ['file_path', 's3 path', 'pk'], ['partition', 'struct', 'idx'], ['record_count, file_size_in_bytes', 'int64'], ['lower_bounds / upper_bounds', 'per column', 'idx']], note: 'Unchanged manifests are reused by the next snapshot, so an append rewrites only a little metadata.' }
  ],

  architecture: {
    title: 'Lakehouse: batch and streaming writers sharing one table format',
    nodes: [
      { id: 'apps', label: 'App events', sub: 'clicks, logs', kind: 'client', wide: [90, 40], tall: [70, 0], tip: 'Services and devices publish events. See the Event Ingestion page for collection and validation.' },
      { id: 'oltp', label: 'OLTP Postgres', sub: 'orders, users', kind: 'store', wide: [90, 200], tall: [350, 0], tip: 'Production databases. Never scanned by analytics; changes leave through the write-ahead log instead.' },
      { id: 'cdc', label: 'Debezium CDC', sub: 'WAL → change events', kind: 'service', wide: [290, 200], tall: [350, 105], tip: 'Reads the database log through a logical replication slot and emits one event per row change: op c/u/d with before and after images. The first run takes a consistent snapshot (op r).' },
      { id: 'kafka', label: 'Kafka', sub: 'raw + CDC topics', kind: 'queue', wide: [290, 40], tall: [70, 105], tip: 'Durable, replayable buffer between sources and the lake. Streaming writers store their offsets in checkpoints.' },
      { id: 'flink', label: 'Flink streaming', sub: 'commit per checkpoint', kind: 'compute', wide: [490, 40], tall: [70, 210], tip: 'Writes Parquet files continuously and commits one Iceberg snapshot when a checkpoint completes, which gives exactly-once into the table.' },
      { id: 'spark', label: 'Spark batch', sub: 'nightly · backfill', kind: 'compute', wide: [490, 200], tall: [210, 210], tip: 'Reads bronze, writes silver and gold. Uses dynamic partition overwrite or MERGE so a rerun gives the same result.' },
      { id: 'sched', label: 'Airflow', sub: 'DAGs · logical dates', kind: 'service', wide: [490, 340], tall: [350, 315], tip: 'Runs batch DAGs per logical date, backfills and maintenance. See the Job Scheduler page.' },
      { id: 'cat', label: 'Catalog', sub: 'REST · CAS pointer', kind: 'service', wide: [690, 40], tall: [210, 315], tip: 'Maps each table to its current metadata.json and swaps that pointer atomically: Hive Metastore, AWS Glue, Nessie, Polaris or another REST catalog.' },
      { id: 's3', label: 'Object store', sub: 'Parquet + metadata', kind: 'store', wide: [690, 200], tall: [70, 315], tip: 'Immutable data files, delete files, manifests and metadata.json versions. Bronze, silver and gold are just different tables (often different prefixes).' },
      { id: 'dq', label: 'Quality audit', sub: 'checks before publish', kind: 'compute', wide: [690, 340], tall: [210, 420], tip: 'Write-audit-publish: checks run on a staged snapshot or branch; only a passing snapshot becomes main.' },
      { id: 'maint', label: 'Table services', sub: 'compact · expire · GC', kind: 'compute', wide: [890, 200], tall: [70, 420], tip: 'Compaction, manifest rewrite, snapshot expiry and orphan-file removal. These are writers too and commit through the same CAS.' },
      { id: 'trino', label: 'Trino / Spark SQL', sub: 'BI and ad hoc', kind: 'service', wide: [890, 40], tall: [350, 420], tip: 'Readers load the pointer once, prune with manifest statistics, and read only the files of that snapshot.' }
    ],
    edges: [
      { from: 'apps', to: 'kafka' },
      { from: 'oltp', to: 'cdc' },
      { from: 'cdc', to: 'kafka' },
      { from: 'kafka', to: 'flink' },
      { from: 'flink', to: 's3' },
      { from: 'flink', to: 'cat', label: 'CAS' },
      { from: 'sched', to: 'spark' },
      { from: 'spark', to: 's3', bidi: true },
      { from: 'spark', to: 'cat' },
      { from: 'sched', to: 'dq' },
      { from: 'dq', to: 's3' },
      { from: 'dq', to: 'cat', bend: 0.3, dashed: true, label: 'publish' },
      { from: 'maint', to: 's3' },
      { from: 'maint', to: 'cat', bend: -0.15 },
      { from: 'trino', to: 'cat' },
      { from: 'trino', to: 's3' }
    ]
  },

  scenarios: [
    {
      id: 'stream', title: 'Streaming append: commit on checkpoint', tone: 'info',
      steps: [
        { text: 'Apps publish click events to <b>Kafka</b>. Flink reads them and buffers rows into open Parquet files, one per writer task and partition (<code>hours(event_ts)</code>).', flow: ['apps>kafka', 'kafka>flink'] },
        { text: 'At each <b>checkpoint</b> (say every 60 s) the writers close their files and upload them. Nothing points at them yet, so no reader can see them.', flow: ['flink>s3'], badges: { s3: '+32 Parquet files' } },
        { text: 'When the checkpoint completes, the committer writes a <b>manifest</b>, a <b>manifest list</b> and <code>00042.metadata.json</code>, then asks the catalog: swap <code>v41 → v42</code>, only if it is still v41.', flow: ['flink>s3', 'flink>cat'], badges: { cat: ['CAS v41 → v42', 'ok'] }, tone: 'ok' },
        { text: 'Trino reads the pointer <b>once</b>, then that snapshot\'s metadata tree, and skips files using partition and column min/max stats. It never lists an S3 folder.', flow: ['trino>cat', 'trino>s3'], badges: { trino: 'snapshot 42' } },
        { text: 'If Flink crashes after uploading but before the swap, it restarts from the last checkpoint and writes those rows again. The first files were never referenced: they are <b>orphans</b> for cleanup, not duplicates.', nodes: ['flink', 's3'], warn: ['s3'], badges: { s3: ['orphans', 'warn'] } }
      ]
    },
    {
      id: 'cdc', title: 'CDC upserts from Postgres', tone: 'ok',
      steps: [
        { text: 'A customer changes their address. <b>Debezium</b> reads the change from Postgres\' write-ahead log through a logical replication slot and emits <code>{op: "u", before, after}</code> to Kafka.', flow: ['oltp>cdc', 'cdc>kafka'], badges: { cdc: 'op = u' } },
        { text: 'Flink keys by primary key and writes an <b>upsert</b> in merge-on-read style: an <b>equality delete</b> (<code>id = 42</code>) masks the old row, and the new row goes into a new data file.', flow: ['kafka>flink', 'flink>s3'], badges: { s3: '+data +delete' } },
        { text: 'One CAS commits both files as <b>one snapshot</b>. Readers see the old row or the new one, never both and never neither.', flow: ['flink>cat'], badges: { cat: ['v43', 'ok'] }, tone: 'ok' },
        { text: 'Readers now apply delete files while scanning. <b>Copy-on-write</b> would instead rewrite every data file holding a changed key: slow writes, plain fast reads.', flow: ['trino>cat', 'trino>s3'], badges: { trino: 'merge on read' } },
        { text: 'Later a table service <b>compacts</b>: it rewrites data files with the deletes applied, so readers are back to plain Parquet.', flow: ['maint>s3', 'maint>cat'], ok: ['maint'], badges: { maint: ['deletes applied', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'wap', title: 'Nightly batch: write, audit, publish', tone: 'info',
      steps: [
        { text: 'At 02:00 Airflow starts the run for logical date <code>2026-11-02</code>. Spark reads that day\'s bronze rows, including late arrivals, then deduplicates and joins them.', flow: ['sched>spark', 'spark>s3'] },
        { text: 'It writes to an <b>audit branch</b> of the silver table with a <b>dynamic partition overwrite</b>. Only that day\'s partition is replaced, so a rerun of the same date gives the same table.', flow: ['spark>s3', 'spark>cat'], badges: { cat: 'branch audit' } },
        { text: 'Quality checks run against the branch: row count vs last week, null rates, unique keys, referential checks. <code>main</code>, which dashboards read, has not moved.', flow: ['sched>dq', 'dq>s3'], badges: { dq: 'checks 12/12' } },
        { text: '<b>Publish</b> is one metadata commit: fast-forward <code>main</code> to the audited snapshot. No data is copied, and every dashboard switches atomically.', flow: ['dq>cat'], ok: ['cat'], badges: { cat: ['main → audited', 'ok'] }, tone: 'ok' },
        { text: 'If a check fails, main never moves: consumers keep yesterday\'s data and on-call gets an alert instead of a wrong dashboard. A bad load that slipped through earlier is undone with <code>rollback_to_snapshot</code>.', nodes: ['dq', 'cat'], warn: ['dq'], badges: { dq: ['blocked', 'warn'] }, tone: 'warn' }
      ]
    },
    {
      id: 'conflict', title: 'Compaction loses the race to a MERGE', tone: 'err',
      steps: [
        { text: 'Compaction starts from snapshot <b>S50</b> and rewrites 40 small files of partition <code>hour=10</code> into one 512 MB file. That takes a few minutes.', flow: ['maint>cat', 'maint>s3'], badges: { maint: 'base S50' } },
        { text: 'Meanwhile Flink commits <b>S51</b> (an append), and a Spark CDC <code>MERGE</code> commits <b>S52</b> with a <b>position delete</b>: "row 1,207 of file 17 is gone". File 17 is one of the 40.', flow: ['flink>cat', 'spark>s3', 'spark>cat'], badges: { cat: 'now S52' } },
        { text: 'Compaction tries the swap: expected S50, found S52. The <b>CAS fails</b>. It reloads the table and checks what changed since its base.', flow: ['maint>cat'], err: ['maint'], badges: { maint: ['CAS failed', 'err'] }, tone: 'err' },
        { text: 'S51 only added files: no conflict. S52 deleted a row inside an input file. The new 512 MB file still holds that row, so committing it would <b>bring the deleted row back</b>. The rewrite must <b>abort</b>; its output becomes orphans.', nodes: ['maint', 's3'], err: ['maint'], warn: ['s3'], badges: { maint: ['abort', 'err'] }, tone: 'err' },
        { text: 'Fixes: compact <b>closed</b> partitions, rewrite in small groups with partial progress, and keep MERGE hot spots apart. Appends never abort: they re-apply on the new snapshot and retry.', nodes: ['maint'], ok: ['maint'], badges: { maint: ['retry other groups', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'small', title: 'Scale: small files and snapshot sprawl', tone: 'warn',
      steps: [
        { text: 'A team cuts the commit interval to <b>10 s</b> for freshness. With 64 writer tasks that is 8,640 snapshots and about <b>550K files a day</b>, most of them a few MB.', flow: ['kafka>flink', 'flink>s3'], warn: ['s3'], badges: { s3: ['550K files/day', 'warn'] }, tone: 'warn' },
        { text: 'Queries slow down: planning reads ever larger manifests, every tiny file costs an S3 request and a footer read, and <code>metadata.json</code> grows with every snapshot.', flow: ['trino>cat', 'trino>s3'], warn: ['trino', 'cat'], badges: { trino: ['slow planning', 'warn'] } },
        { text: '<b>Compaction</b> bin-packs closed hours into ~512 MB files, and <b>rewrite manifests</b> regroups metadata by partition.', flow: ['maint>s3', 'maint>cat'], ok: ['maint'], badges: { s3: ['→ hundreds of files', 'ok'] }, tone: 'ok' },
        { text: '<b>Expire snapshots</b> older than the time-travel window, then <b>remove orphan files</b> older than the longest-running write (3 days by default). Storage and metadata stop growing.', flow: ['maint>cat', 'maint>s3'], ok: ['s3'], badges: { maint: ['expire + GC', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'A streaming table fed by events and CDC (illustrative: ~4 MB/s of compressed rows, about 345 GB a day, 8 writer tasks). Each control is a real design decision.',
    controls: [
      { id: 'layer', label: 'Table layer', type: 'seg', value: 'iceberg', options: [
        { v: 'hive', l: 'Plain folders (Hive-style)' }, { v: 'iceberg', l: 'Table format (Iceberg)' }] },
      { id: 'upsert', label: 'Row updates', type: 'seg', value: 'mor', options: [
        { v: 'cow', l: 'Copy-on-write' }, { v: 'mor', l: 'Merge-on-read' }] },
      { id: 'compact', label: 'Compaction', type: 'seg', value: 'hourly', options: [
        { v: 'none', l: 'None' }, { v: 'daily', l: 'Nightly, whole day' }, { v: 'hourly', l: 'Hourly, closed hours' }] },
      { id: 'interval', label: 'Commit interval', type: 'range', min: 10, max: 900, step: 10, value: 60, unit: 's' },
      { id: 'updates', label: 'Share of rows that are updates (CDC)', type: 'range', min: 0, max: 40, step: 5, value: 10, unit: '%' }
    ],
    evaluate(s) {
      const R = 4e6, P = 8, ROWS = 40000, DAY = R * 86400, BIG = 512e6;   // illustrative workload
      const i = s.interval, u = s.updates / 100, hive = s.layer === 'hive', mor = s.upsert === 'mor';
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const commits = 86400 / i, perCommit = R * i, fileB = perCommit / P;
      const dataFiles = commits * P, delFiles = !hive && mor && u > 0 ? commits * P : 0;
      const filesDay = dataFiles + delFiles, bigDay = Math.ceil(DAY / BIG);
      const read24 = s.compact === 'none' ? filesDay : s.compact === 'daily' ? filesDay / 2 + bigDay / 2 : filesDay / 24 + bigDay;
      // write amplification: bytes written per byte ingested
      let amp;
      if (hive) amp = 1 + (u > 0 ? (DAY / 2) / perCommit : 0);                      // rewrite the open day partition
      else if (!mor) amp = 1 + Math.min(200, Math.ceil((ROWS * i * u) / 2000)) * 256e6 / perCommit * (u > 0 ? 1 : 0);
      else amp = 1 + (u > 0 ? 0.05 : 0);
      if (s.compact !== 'none') amp += 1;
      const pendingDel = !hive && mor ? delFiles * ({ none: 1, daily: 0.5, hourly: 1 / 24 })[s.compact] : 0;
      // compaction aborts: chance that a concurrent commit changes a file the rewrite is using
      const T = s.compact === 'daily' ? 1800 : 180, near = s.compact === 'hourly' ? 1 : 0.3;
      const p = Math.min(0.9, u * near * (mor ? 1 : 2));
      const abort = s.compact === 'none' ? 0 : 1 - Math.pow(1 - p, T / i);
      const fmtAmp = (a) => a >= 100 ? Math.round(a) + '×' : a.toFixed(1) + '×';
      const metrics = [
        { k: 'Freshness', v: '≈ ' + SD.fmt.dur(i * 1000) + ' after the event', s: i <= 60 ? 0.9 : i <= 300 ? 0.65 : 0.4 },
        { k: 'Reader consistency', v: hive ? 'can see partial writes' : 'snapshot isolation', s: hive ? 0.1 : 0.95 },
        { k: 'Files written / day', v: SD.fmt.num(filesDay) + ' (avg ' + SD.fmt.bytes(fileB) + ')', s: fileB >= 128e6 ? 0.9 : fileB >= 32e6 ? 0.6 : 0.25, hint: 'data + delete files' },
        { k: 'Files read by a 24 h query', v: SD.fmt.num(Math.round(read24)), s: clamp(1 - Math.log10(read24 / bigDay) / 2.5), hint: s.compact === 'none' ? 'no compaction' : '' },
        { k: 'Write amplification', v: fmtAmp(amp), s: clamp(1 - Math.log10(amp) / 2.3), hint: s.compact !== 'none' ? 'incl. compaction rewrite' : '' },
        { k: 'Delete files to merge', v: hive || !mor ? 'none (plain Parquet)' : SD.fmt.num(Math.round(pendingDel)), s: hive || !mor ? 0.95 : clamp(1 - Math.log10(1 + pendingDel) / 4.5) },
        { k: 'Compaction aborts', v: hive ? 'no commit protocol' : s.compact === 'none' ? 'n/a (no compaction)' : Math.round(abort * 100) + '% of runs', s: hive ? 0.1 : s.compact === 'none' ? 0.6 : clamp(1 - abort) }
      ];
      const notes = [];
      if (hive) notes.push('Plain folders have no commit: readers list whatever files exist at that moment. An "update" is <code>INSERT OVERWRITE</code> of a whole partition, so even one changed row rewrites the day.');
      if (!hive && !mor && u > 0) notes.push('Copy-on-write rewrites each data file that holds an updated key. With frequent commits and scattered keys it rewrites far more than it ingests (illustrative: up to 200 files of 256 MB per commit).');
      if (!hive && mor && u > 0) notes.push('Merge-on-read writes small delete files instead (Flink upserts write <b>equality deletes</b>; Spark MERGE writes <b>position deletes</b>, or deletion vectors in Iceberg v3). Readers pay until compaction applies them.');
      if (s.compact === 'none') notes.push('Without compaction the small files never go away: after 30 days this table holds about ' + SD.fmt.num(filesDay * 30) + ' files.');
      if (s.compact === 'daily' && !hive) notes.push('A whole-day rewrite runs for a long time while upserts keep committing, so it often fails validation. Iceberg\'s <code>partial-progress.enabled</code> commits finished file groups one by one.');
      if (s.compact === 'hourly' && !hive) notes.push('Compacting only <b>closed</b> hours keeps the rewrite short and away from the files that streaming writers are still changing.');
      if (i <= 20) notes.push('Every commit is a snapshot: ' + SD.fmt.num(commits) + ' per day. Expire them aggressively, or planning and metadata.json size suffer.');
      notes.push('The conflict model assumes the CDC writer names the files it changes (position deletes or copy-on-write). A rewrite that keeps its starting sequence number can commit past equality deletes. All numbers are illustrative.');
      let verdict;
      if (hive) verdict = '❌ <b>Plain folders cannot do this job.</b> Readers can see half-written data, there is no row-level upsert, and two writers can silently overwrite each other. Use a table format.';
      else if (s.compact === 'none') verdict = '⚠ <b>No compaction:</b> about ' + SD.fmt.num(filesDay) + ' new files a day pile up and queries get slower every week. Schedule compaction of closed partitions.';
      else if (!mor && amp > 20) verdict = '⚠ <b>Copy-on-write is rewriting ~' + fmtAmp(amp) + ' the data you ingest.</b> Switch to merge-on-read for a CDC-heavy table, or commit far less often.';
      else if (abort > 0.5) verdict = '⚠ <b>Compaction keeps losing the race</b> (' + Math.round(abort * 100) + '% of runs abort). Compact smaller groups of closed partitions with partial progress.';
      else if (i <= 20) verdict = '⚠ <b>Very fresh, very expensive:</b> tiny files and thousands of snapshots a day. One to five minutes is usually enough for a lake.';
      else if (mor && s.compact === 'hourly' && i >= 60 && i <= 300) verdict = '✅ <b>A common production shape:</b> merge-on-read upserts, 1–5 minute commits, and hourly compaction of closed partitions that applies the deletes.';
      else verdict = '👍 Workable. Read the meters to see whether you are paying in small files, rewrites or freshness.';
      const flow = ['kafka>flink', 'flink>s3', 'flink>cat'].concat(s.compact !== 'none' ? ['maint>s3', 'maint>cat'] : []).concat(['trino>cat', 'trino>s3']);
      return {
        metrics, verdict, notes, flow,
        labels: {
          cat: hive ? { label: 'Hive Metastore', sub: 'table → folders' } : { label: 'Catalog', sub: 'REST · CAS pointer' },
          s3: { label: 'Object store', sub: hive ? 'folders of Parquet' : mor ? 'Parquet + delete files' : 'Parquet, rewritten' },
          maint: { label: 'Table services', sub: { none: 'compaction off', daily: 'nightly rewrite', hourly: 'hourly, closed hours' }[s.compact] }
        },
        warn: (hive ? ['cat', 'trino'] : []).concat(s.compact === 'none' || fileB < 32e6 ? ['s3'] : []).concat(abort > 0.5 ? ['maint'] : []),
        err: hive ? ['s3'] : [],
        ok: !hive && s.compact === 'hourly' && abort <= 0.5 ? ['maint'] : [],
        badges: { s3: [SD.fmt.num(filesDay) + ' files/day', fileB < 32e6 ? 'warn' : 'info'], flink: ['commit / ' + SD.fmt.dur(i * 1000), 'info'] }
      };
    }
  },

  widget: {
    title: 'Optimistic commits: two writers race for one pointer',
    caption: 'An Iceberg-style table: a catalog pointer, a chain of immutable snapshots, and data files in three hourly partitions. The <b>ingest writer</b> commits small files every couple of seconds; <b>compaction</b> takes longer and starts from an older snapshot. Both must <b>CAS the pointer</b>. Turn on <b>MERGE deletes</b> and watch compaction abort when a row it is rewriting was deleted. Tap a snapshot to <b>time travel</b> or roll back.'
  },

  realWorld: {
    intro: 'Three companies built the three main table formats for the same reason: Hive-style folders on HDFS or S3 could not give atomic, incremental updates at their scale.',
    timeline: [
      { when: '2016–17', who: 'Uber', title: 'Hudi: upserts and incremental pulls on Hadoop', text: 'Uber\'s 2017 post introduces <b>Hudi</b> (Hadoop Upserts Deletes and Incrementals). It keeps a <b>timeline</b> of actions on each dataset, an <b>index</b> from record key to file id, and writes updates to Avro logs that <b>compaction</b> turns into Parquet. The goal was data in minutes without a separate speed layer.', src: 7 },
      { when: '2017', who: 'Netflix', title: 'Iceberg: fixing Hive tables on S3', text: 'Ryan Blue and Owen O\'Malley\'s 2018 Strata talk lists the problems: Hive keeps table state in <b>two places</b> (partitions in the metastore, files in the file system), relies on listing directories, and makes users know the physical layout. Iceberg tracks every file in its own metadata instead.', src: 5 },
      { when: '2018–20', who: 'Apache', title: 'Iceberg joins the ASF', text: 'Netflix donated Iceberg to the Apache Incubator in <b>November 2018</b>. It became a top-level project in <b>May 2020</b>.', src: 6 },
      { when: '2017–20', who: 'Uber', title: 'All raw tables on Hudi', text: 'Uber writes that before Hudi, in early 2016, some of its largest jobs used <b>more than 1,000 executors</b> to process <b>over 20 TB</b>, and that by the end of 2017 <b>all raw data tables</b> used the Hudi format. Hudi graduated to an Apache top-level project in 2020.', src: 8 },
      { when: '2019–20', who: 'Databricks', title: 'Delta Lake, open source and in VLDB', text: 'Delta Lake moved to the Linux Foundation in <b>October 2019</b>. The VLDB 2020 paper describes a <b>transaction log</b> stored in the object store next to the data and compacted into Parquet checkpoints, giving ACID commits and <b>time travel</b>. It reports use at thousands of customers, the largest at <b>exabyte scale</b>.', src: 11 },
      { when: '2022', who: 'Airbnb', title: 'Spark 3 + Iceberg on S3', text: 'Airbnb moved its warehouse from Hive to <b>Iceberg and Spark 3</b> on S3. It cites one schema definition that behaves the same across engines, and <b>multiple partition specs</b> that let ingestion consolidate data over time.', src: 15 },
      { when: '2023', who: 'Netflix', title: 'Incremental processing on Iceberg', text: 'Netflix\'s Maestro workflow engine gained an incremental processing solution built on Iceberg metadata. Jobs read only the <b>new or changed</b> data instead of reprocessing with costly lookback windows.', src: 16 },
      { when: '2025', who: 'Apache', title: 'Iceberg format v3', text: 'Format version 3 replaces v2 position delete files with <b>deletion vectors</b> (Roaring bitmaps stored in Puffin files) and adds <b>row lineage</b>.', src: 18 },
      { when: '2026', who: 'Uber', title: 'Trillion-record scale', text: 'Uber reports about <b>350 logical PB</b> on HDFS and GCS, ~6 trillion rows and ~3 million new files ingested per day, about <b>350,000 commits a day</b> across 19,500 datasets, and ~70,000 table-service operations (compaction, cleaning, clustering) daily.', src: 9 }
    ],
    lessons: [
      'Make <b>one pointer</b> the only mutable state. Everything else is immutable files, so commits, isolation, time travel and rollback all follow.',
      'Optimistic concurrency works because most lake writes are <b>appends</b>, which rebase without conflict. Design maintenance to stay away from files that writers are still changing.',
      'Small files and old snapshots are the price of freshness. Budget for <b>compaction, expiry and orphan cleanup</b> from day one.',
      'Keep raw data (bronze) replayable, and make every batch step <b>idempotent per partition</b>, so late data and bug fixes mean a rerun, not a repair.'
    ],
    sources: [
      { title: 'Iceberg Table Spec', url: 'https://iceberg.apache.org/spec/', pub: 'Apache Iceberg' },
      { title: 'Reliability (concurrent writes, optimistic concurrency)', url: 'https://iceberg.apache.org/docs/1.7.2/reliability', pub: 'Apache Iceberg docs 1.7.2' },
      { title: 'Partitioning (hidden partitioning)', url: 'https://iceberg.apache.org/docs/latest/partitioning', pub: 'Apache Iceberg docs' },
      { title: 'Evolution (schema and partition evolution)', url: 'https://iceberg.apache.org/docs/latest/evolution/', pub: 'Apache Iceberg docs' },
      { title: 'Flink writes (exactly-once, commit on checkpoint)', url: 'https://iceberg.apache.org/docs/latest/flink-writes', pub: 'Apache Iceberg docs' },
      { title: 'Iceberg: a modern table format for big data (Strata NY 2018)', url: 'https://www.slideshare.net/RyanBlue3/iceberg-a-modern-table-format-for-big-data-strata-ny-2018', pub: 'Ryan Blue, Owen O\'Malley, 2018' },
      { title: 'Apache Iceberg', url: 'https://en.wikipedia.org/wiki/Apache_Iceberg', pub: 'Wikipedia' },
      { title: 'Hudi: Uber Engineering\'s Incremental Processing Framework on Apache Hadoop', url: 'https://www.uber.com/blog/hoodie/', pub: 'Uber Engineering, 2017' },
      { title: 'Building a Large-scale Transactional Data Lake at Uber Using Apache Hudi', url: 'https://eng.uber.com/blog/apache-hudi-graduation/', pub: 'Uber Engineering, 2020' },
      { title: 'Apache Hudi at Uber: Engineering for Trillion-Record-Scale Data Lake Operations', url: 'https://www.uber.com/blog/apache-hudi-at-uber/', pub: 'Uber Engineering, 2026' },
      { title: 'Table & Query Types (copy-on-write, merge-on-read)', url: 'https://hudi.apache.org/docs/table_types', pub: 'Apache Hudi docs' },
      { title: 'Delta Lake: High-Performance ACID Table Storage over Cloud Object Stores', url: 'https://vldb.org/pvldb/vol13/p3411-armbrust.pdf', pub: 'Armbrust et al., PVLDB 13(12), 2020' },
      { title: 'The Delta Lake Project Turns to Linux Foundation', url: 'https://linuxfoundation.org/press-release/the-delta-lake-project-turns-to-linux-foundation-to-become-the-open-standard-for-data-lakes', pub: 'Linux Foundation, Oct 2019' },
      { title: 'What is the medallion lakehouse architecture?', url: 'https://docs.databricks.com/aws/lakehouse/medallion', pub: 'Databricks docs' },
      { title: 'Debezium connector for PostgreSQL', url: 'https://debezium.io/documentation/reference/2.0/connectors/postgresql.html', pub: 'Debezium docs' },
      { title: 'Upgrading Data Warehouse Infrastructure at Airbnb', url: 'https://medium.com/airbnb-engineering/upgrading-data-warehouse-infrastructure-at-airbnb-a4e18f09b6d5', pub: 'Airbnb Engineering, 2022' },
      { title: 'Incremental Processing using Netflix Maestro and Apache Iceberg', url: 'https://netflixtechblog.medium.com/incremental-processing-using-netflix-maestro-and-apache-iceberg-b8ba072ddeeb', pub: 'Netflix TechBlog, 2023' },
      { title: 'Build Write-Audit-Publish pattern with Apache Iceberg branching and AWS Glue Data Quality', url: 'https://aws.amazon.com/blogs/big-data/build-write-audit-publish-pattern-with-apache-iceberg-branching-and-aws-glue-data-quality', pub: 'AWS Big Data Blog' },
      { title: 'Working with Iceberg table format specification version 3', url: 'https://docs.aws.amazon.com/prescriptive-guidance/latest/apache-iceberg-on-aws/table-spec-v3.html', pub: 'AWS Prescriptive Guidance' },
      { title: 'Iceberg table properties and defaults (Rust implementation)', url: 'https://rust.iceberg.apache.org/api/src/iceberg/spec/table_properties.rs.html', pub: 'Apache Iceberg Rust' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Row updates', '<b>Copy-on-write</b>: rewrite affected files; reads are plain Parquet', '<b>Merge-on-read</b>: write delete files or logs; readers merge until compaction', 'CoW for read-heavy tables with rare, batched updates; MoR for CDC and streaming upserts'],
      ['Commit interval', '<b>Short (10–30 s)</b>: fresh data', '<b>Longer (1–15 min)</b>: bigger files, fewer snapshots, fewer conflicts', 'Minutes for most lakes; seconds belong in a stream processor with a serving store'],
      ['Table format', '<b>Iceberg</b>: engine-neutral spec, hidden partitioning, REST catalog', '<b>Delta / Hudi</b>: log in the table folder (Delta); record index and incremental pulls (Hudi)', 'Iceberg for many engines; Delta inside Databricks; Hudi for upsert-heavy pipelines with built-in table services'],
      ['Catalog', '<b>Hive Metastore / Glue</b>: already everywhere', '<b>REST catalog</b> (Polaris, Nessie, Unity, Gravitino): server-side commits, credentials, branches', 'REST when several engines and teams commit, or you want multi-table operations and access control in one place'],
      ['Partitioning', '<b>Fine (hour)</b>: precise pruning', '<b>Coarse (day) + sort order</b>: fewer, bigger files; min/max stats do the pruning', 'Partition by what queries filter on and what keeps files ≥ 128 MB; evolve the spec as volume grows'],
      ['Batch load', '<b>Partition overwrite</b>: simple and idempotent', '<b>MERGE</b>: touches only changed rows', 'Overwrite for daily facts; MERGE for dimension tables and CDC']
    ]
  },
  failures: [
    { f: 'Two writers commit at once', detect: 'CAS fails (REST 409, <code>CommitFailedException</code>)', fix: 'Reload, validate the snapshots since your base, re-apply and retry with backoff (<code>commit.retry.num-retries</code>, default 4). Abort on a real conflict.' },
    { f: 'Stream checkpoints succeed but commits fail', detect: 'Alert on time since last successful commit (the Iceberg Flink sink reports seconds since the last successful commit as a metric)', fix: 'Fix the catalog or permissions; the committer retries pending checkpoints on restart, and abandoned files are removed as orphans.' },
    { f: 'Small-file explosion', detect: 'Files per partition, average file size, planning time', fix: 'Hourly compaction of closed partitions, longer commit interval, fewer writer tasks per partition (shuffle by partition before writing).' },
    { f: 'Bad batch load reaches dashboards', detect: 'Quality checks, consumer complaints', fix: '<code>rollback_to_snapshot</code> now; write-audit-publish so main only moves after checks pass.' },
    { f: 'Orphan cleanup deletes in-flight files', detect: 'Readers or writers fail with missing files', fix: 'Set <code>older_than</code> well beyond the longest write (default 3 days); never run it with a tiny window.' },
    { f: 'Late or corrected data for closed partitions', detect: 'Late-row counters per partition', fix: 'Rerun the affected logical dates with idempotent partition overwrite, or read changes incrementally between snapshots.' },
    { f: 'OLTP schema change breaks CDC', detect: 'Deserialization errors, Debezium schema-change events', fix: 'Additive changes map to schema evolution by field id; renames and type changes go through a reviewed data contract.' }
  ],

  interview: [
    { q: 'Why not just keep Parquet files in Hive-style folders?', a: '<p>Because the table is defined by <b>whatever files a folder listing returns</b>. That gives:</p><ul><li>No atomic commit: readers see half-written partitions.</li><li>No row-level change: one update rewrites a partition.</li><li>Listing millions of objects is slow, and two writers can silently clobber each other.</li></ul><p>A table format lists the exact files in metadata and commits by swapping one pointer.</p>', lvl: 'core' },
    { q: 'Walk me through an Iceberg commit.', a: '<ol><li>Read the current <code>metadata.json</code> from the catalog (the base).</li><li>Write new data and delete files to object storage.</li><li>Write a new manifest for them, a new manifest list (reusing unchanged manifests), and a new <code>metadata.json</code> with the new snapshot.</li><li>Ask the catalog to swap the pointer from base to new, only if it still equals base.</li></ol><p>Until step 4 nothing is visible. After it, the whole change is.</p>', lvl: 'core' },
    { q: 'Two writers commit at the same time. What happens?', a: '<p>Both prepared their metadata from the same base, so only one CAS wins. The loser <b>reloads</b> the table and <b>validates</b> the snapshots committed since its base:</p><ul><li>An <b>append</b> does not conflict with anything: re-apply it on the new snapshot and retry.</li><li>A <b>rewrite or delete</b> conflicts if a file it removes was removed or got new deletes concurrently: abort.</li></ul><p>This is optimistic concurrency. It is cheap when conflicts are rare, and lake writes are mostly appends.</p>', fu: 'What isolation level does this give readers? (Snapshot isolation; Iceberg can also validate for serializable on overwrite and MERGE.)', lvl: 'core' },
    { q: 'Copy-on-write vs merge-on-read?', a: '<p><b>CoW</b>: an update rewrites every data file that contains an affected row. Writes are slow and amplified; reads are plain columnar files.</p><p><b>MoR</b>: write a small <b>delete file</b> (Iceberg position or equality deletes, Hudi log files, Delta deletion vectors) plus the new rows. Writes are cheap; readers merge until compaction folds the deletes in.</p><p>CDC and streaming upserts usually want MoR plus regular compaction.</p>', lvl: 'core' },
    { q: 'How do you get exactly-once from Kafka into a lake table?', a: '<p>Flink writes files continuously, but the Iceberg sink <b>commits only when a checkpoint completes</b>. The checkpoint holds the Kafka offsets, and the commit records which checkpoint it covers, so after a restart it neither skips nor double-commits.</p><p>Files written after the last successful commit are never referenced: they become orphans, not duplicates.</p>', lvl: 'deep' },
    { q: 'What is the small-files problem, and how do you fix it?', a: '<p>Every streaming commit writes one file per writer task and partition, so a short interval creates many small files. Each costs an S3 request, a footer read and a manifest entry; planning and scans slow down.</p><p>Fix: <b>compaction</b> (bin-pack closed partitions to ~512 MB), <b>rewrite manifests</b>, a longer commit interval, and shuffling rows by partition before writing.</p>', lvl: 'core' },
    { q: 'What are hidden partitioning and partition evolution?', a: '<p>Iceberg stores a <b>transform</b> such as <code>days(event_ts)</code> in the partition spec and derives partition values itself. Users filter on <code>event_ts</code> and get pruning without knowing the layout.</p><p>Because files record which spec wrote them, you can change the spec (for example days → hours) as a <b>metadata-only</b> change: old files keep the old layout, new files use the new one, and queries plan across both. In Hive that needs a new table.</p>', lvl: 'deep' },
    { q: 'How does schema evolution work without rewriting data?', a: '<p>Iceberg identifies columns by <b>field id</b>, not by name or position. Add, drop, rename and reorder change only metadata. A dropped column\'s id is never reused, so old files cannot leak a stale column into a new one with the same name. Type changes are limited to safe widenings, such as int to long.</p>', lvl: 'deep' },
    { q: 'How do you handle late data and backfills?', a: '<p>Make each batch step <b>idempotent per partition</b>: recompute a whole logical date from bronze and overwrite that partition (dynamic overwrite) or MERGE by key. A rerun gives the same result, so late data or a bug fix means rerunning the affected dates.</p><p>For streams, write late rows into their event-time partition, and let downstream jobs pick up changed partitions incrementally from snapshot metadata.</p>', lvl: 'core' },
    { q: 'What is write-audit-publish?', a: '<p>Write the new data to a <b>branch</b> (or an unpublished staged snapshot), run quality checks against it, and only if they pass <b>fast-forward main</b> to it. Publishing is a metadata commit, so no data is copied, and consumers never see unchecked data.</p><p>If a check fails, main does not move.</p>', lvl: 'deep' },
    { q: 'How do you control storage cost and honour deletion requests?', a: '<ul><li><b>Expire snapshots</b> older than the time-travel window. Files referenced only by those snapshots become deletable.</li><li><b>Remove orphan files</b> that no snapshot references, but only older than the longest-running write.</li><li>For GDPR erasure, a row-level delete is not enough: the old files still exist until the snapshots that reference them expire and the files are cleaned up.</li></ul>', lvl: 'deep' },
    { q: 'Where is the "database" in a lakehouse, and what can the catalog become a bottleneck for?', a: '<p>The only transactional component is the <b>catalog</b>: one row (or key) per table holding the current metadata location. Its throughput limits commits per table, and a hot table with hundreds of writers spends its time retrying.</p><p>Mitigations: fewer, larger commits (one committer per job), separate tables per writer and a merge job, or a REST catalog that resolves commits server-side.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Postgres: the catalog pointer and its compare-and-swap', lang: 'sql',
      code: `-- The only mutable state in a lakehouse: one pointer per table (same columns as Iceberg's JdbcCatalog)
CREATE TABLE iceberg_tables (
  catalog_name               text NOT NULL,
  table_namespace            text NOT NULL,
  table_name                 text NOT NULL,
  metadata_location          text NOT NULL,
  previous_metadata_location text,
  PRIMARY KEY (catalog_name, table_namespace, table_name)
);
-- Our addition: an append-only commit log for audits and "as of <time>" lookups
CREATE TABLE commit_log (
  table_name        text        NOT NULL,
  metadata_location text        NOT NULL,
  committed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (table_name, metadata_location)
);

-- Commit = compare-and-swap on the pointer. :expected = the metadata file the writer started from.
WITH swapped AS (
  UPDATE iceberg_tables
     SET previous_metadata_location = metadata_location,
         metadata_location          = :'new'
   WHERE (catalog_name, table_namespace, table_name) = ('lake', 'silver', 'orders')
     AND metadata_location = :'expected'
  RETURNING table_name, metadata_location
)
INSERT INTO commit_log (table_name, metadata_location)
SELECT table_name, metadata_location FROM swapped
RETURNING metadata_location;  -- 1 row: you won. 0 rows: someone committed first ->
                              -- reload, re-validate, write a new metadata file, retry

-- Time travel by timestamp: which metadata file was current at :as_of?
SELECT metadata_location FROM commit_log
 WHERE table_name = 'orders' AND committed_at <= :'as_of'
 ORDER BY committed_at DESC LIMIT 1;`,
      note: 'Run in psql (<code>\\set new …</code>). Under READ COMMITTED a concurrent second writer waits on the row lock, re-checks the WHERE clause after the first commits, and gets 0 rows. The data and metadata files themselves live in object storage; only the pointer needs a transaction.'
    },
    {
      title: 'Python: validate, then CAS (append rebases, rewrite aborts)', lang: 'python',
      code: `from dataclasses import dataclass
from itertools import count
import threading

@dataclass(frozen=True)
class Snapshot:
    id: int
    parent: int | None
    files: frozenset[str]                       # live data files
    deletes: frozenset[str] = frozenset()       # data files that got row deletes here

class Conflict(Exception): ...
class Catalog:
    def __init__(self, first: Snapshot):
        self.snaps, self.current, self._lock = {first.id: first}, first.id, threading.Lock()
    def cas(self, expected: int, new: Snapshot) -> bool:      # the only atomic step
        with self._lock:
            if self.current != expected:
                return False
            self.snaps[new.id], self.current = new, new.id
            return True

ids = count(2)
def commit(cat, base, add=frozenset(), remove=frozenset(), delete_in=frozenset(), retries=4):
    for _ in range(retries + 1):
        head = s = cat.current
        while s != base:                                      # every snapshot since our base
            snap = cat.snaps[s]
            gone = cat.snaps[snap.parent].files - snap.files
            if hit := ((remove | delete_in) & gone) | (remove & snap.deletes):
                raise Conflict(f"S{s} changed {sorted(hit)}")
            s = snap.parent
        files = (cat.snaps[head].files - remove) | add        # re-apply our change on the new head
        if cat.cas(head, Snapshot(next(ids), head, files, frozenset(delete_in))):
            return cat.current
    raise Conflict("too many retries")

cat = Catalog(Snapshot(1, None, frozenset({"a", "b", "c"})))
print("append  ->", commit(cat, base=1, add={"d"}))                   # S2
print("upsert  ->", commit(cat, base=2, add={"e"}, delete_in={"b"}))  # position delete in b: S3
print("compact a+c ->", commit(cat, base=1, add={"ac"}, remove={"a", "c"}))  # untouched: S4
try:
    commit(cat, base=2, add={"bd"}, remove={"b", "d"})                # b got deletes in S3
except Conflict as e:
    print("compact b+d -> abort:", e)                                 # else deleted rows return`,
      note: 'Prints <code>2, 3, 4</code>, then <code>abort: S3 changed [\'b\']</code>. Compaction of a and c starts from S1 but still commits, because nothing it touches changed. The same rules drive the widget above. Real Iceberg also handles equality deletes, sequence numbers and manifest reuse.'
    },
    {
      title: 'Java (Spark 3.5 + Iceberg): nightly write-audit-publish', lang: 'java',
      code: `import java.time.LocalDate;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import static org.apache.spark.sql.functions.*;

public final class NightlyEventsJob {
  public static void main(String[] args) {
    LocalDate day = LocalDate.parse(args[0]);        // logical date from Airflow; parse = no SQL injection
    SparkSession spark = SparkSession.builder().appName("silver-events-" + day)
        .config("spark.sql.sources.partitionOverwriteMode", "dynamic")  // replace only touched days
        .getOrCreate();

    // 1. WRITE: rebuild one day of silver from bronze (late events included), into an audit branch
    Dataset<Row> clean = spark.table("lake.bronze.events")
        .where(to_date(col("event_ts")).equalTo(lit(day.toString()).cast("date")))
        .dropDuplicates("event_id")                    // at-least-once ingest -> dedupe here
        .where(col("user_id").isNotNull())
        .select("event_id", "user_id", "event_type", "country", "event_ts");
    clean.createOrReplaceTempView("clean");
    spark.sql("ALTER TABLE lake.silver.events CREATE OR REPLACE BRANCH audit");   // = main now
    spark.sql("INSERT OVERWRITE lake.silver.events.branch_audit SELECT * FROM clean");

    // 2. AUDIT: checks run on the branch; main (what dashboards read) has not moved
    Row r = spark.sql("SELECT count(*), count_if(country IS NULL) FROM lake.silver.events.branch_audit"
        + " WHERE to_date(event_ts) = DATE '" + day + "'").first();
    long rows = r.getLong(0), noCountry = r.getLong(1);
    if (rows == 0 || noCountry * 100 > rows) {
      throw new IllegalStateException("audit failed for " + day + ": rows=" + rows + " noCountry=" + noCountry);
    }

    // 3. PUBLISH: one metadata commit moves main to the audited snapshot; no data is copied
    spark.sql("CALL lake.system.fast_forward('silver.events', 'main', 'audit')");
    spark.stop();
  }
}`,
      note: 'Needs <code>iceberg-spark-runtime</code> and the Iceberg SQL extensions. The silver table is <code>PARTITIONED BY (days(event_ts))</code>. Rerunning a date gives the same table. A failed audit leaves main untouched. Fast-forward needs main to be an ancestor of audit, so give each silver table one batch writer.'
    }
  ],

  related: ['object-storage', 'stream-analytics', 'job-scheduler', 'message-queue', 'event-ingestion', 'privacy-data-platform']
});
