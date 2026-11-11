(function () {
  const dur = (s) => {
    if (!isFinite(s)) return '∞';
    if (s < 90) return Math.round(s) + ' s';
    if (s < 5400) return Math.round(s / 60) + ' min';
    if (s < 172800) return (s / 3600).toFixed(1) + ' h';
    return (s / 86400).toFixed(1) + ' days';
  };
  // effective rows/s of a batched backfill: workers × batch / batch time, minus the share of time spent throttled
  const rate = (v) => v.workers * v.batch / (v.batchMs / 1000) * (1 - v.throttle / 100);

  SD.register({
    slug: 'zero-downtime-migrations',
    domain: 4,
    title: 'Zero-Downtime State Migrations',
    examples: 'Expand/contract, gh-ost, pg_repack',
    tagline: 'Change a schema or move billions of rows <b>while users keep working</b>: expand first, backfill in small throttled batches with checkpoints, switch reads and writes behind flags, and only then contract. Never let one DDL statement hold the table hostage.',
    tldr: {
      problem: 'A schema change looks like one line of SQL. On a hot table it can take an <b>ACCESS EXCLUSIVE</b> lock, queue every query behind it, rewrite gigabytes, and make old and new application versions disagree about the data. A "maintenance window" does not scale to 24×7 products.',
      idea: '<b>Expand → migrate → contract</b> (parallel change). Add new structures in a backward-compatible way, deploy code that works with both shapes, <b>backfill</b> existing rows in small committed batches with a <b>checkpoint</b>, throttle on replica lag, verify, switch reads and writes, then drop the old shape in a later release.',
      insight: 'Zero downtime is not one trick; it is <b>many small, reversible steps</b>, each with a lock budget (<code>lock_timeout</code>), a load budget (throttle) and a way back. Most outages come from <b>lock queues</b>, not from slow copies.',
      numbers: [
        { v: '3 phases', l: 'expand · migrate · contract (Parallel Change, martinfowler.com bliki)' },
        { v: 'PG 11', l: 'ADD COLUMN with a constant default no longer rewrites the table (2018 release notes)' },
        { v: '~15 s', l: 'API downtime GoCardless traced to a lock queue during a planned migration' }
      ]
    },

    intro: {
      what: 'A <b>zero-downtime migration</b> changes how data is stored (a new column, a split table, a new database) while the application keeps serving reads and writes. Instead of stopping the app, you move in small steps where <b>old and new code both work</b> at every moment, and the data is copied in the background in small pieces.',
      analogy: {
        icon: '🛣️',
        title: 'Rebuilding a motorway without closing it',
        text: 'Engineers first build the new lanes next to the old ones (expand). Traffic keeps flowing on the old lanes while the new ones are paved section by section, at night, when traffic is light (throttled backfill). Then cones shift cars over a lane at a time (switch reads and writes), and only when nobody uses the old lanes are they torn up (contract). The analogy breaks in one place: in a database, both "lanes" must hold the <b>same cars</b> at the same time, so you also need to keep them in sync.'
      },
      problem: 'A team renames <code>users.name</code> to <code>full_name</code> with one <code>ALTER TABLE</code> and deploys new code. For a few minutes, servers still on the old version crash looking for <code>name</code>. Worse, the ALTER waited behind a slow report query, and every login queued behind the ALTER. <b>How do you change the shape of live data without stopping the app or breaking the version still running?</b>',
      story: [
        {
          stage: 'naive',
          title: 'One ALTER in a maintenance window',
          text: 'Announce downtime at 2 a.m., stop the app, run <code>ALTER TABLE</code> and an <code>UPDATE</code> of every row, deploy the new code, start the app. Simple, and fine when the table is small and the business can stop.',
          scene: {
            nodes: [
              { id: 'app', label: 'App v1 → v2', sub: 'stopped', kind: 'service', at: [70, 0] },
              { id: 'ddl', label: 'ALTER TABLE', sub: '+ UPDATE all rows', kind: 'policy', at: [350, 0] },
              { id: 'db', label: 'orders', sub: '800 M rows', kind: 'store', at: [210, 110] }
            ],
            edges: [{ from: 'app', to: 'db', dashed: true }, { from: 'ddl', to: 'db' }],
            flow: ['ddl>db'],
            badges: { app: ['down 2 h', 'warn'] }
          }
        },
        {
          stage: 'breaks',
          title: 'The table is locked and the queue explodes',
          text: 'Nobody can stop a 24×7 app. So the ALTER runs live. It waits for a long transaction, and every new query queues <b>behind it</b>. Connection pools fill, the API times out. Old servers mid-deploy also query a column that no longer exists.',
          scene: {
            nodes: [
              { id: 'app', label: 'App v1 + v2', sub: 'rolling deploy', kind: 'service', at: [70, 0] },
              { id: 'ddl', label: 'ALTER TABLE', sub: 'wants EXCLUSIVE', kind: 'policy', at: [350, 0] },
              { id: 'q', label: 'Lock queue', sub: '3,000 waiting', kind: 'queue', at: [210, 110] },
              { id: 'db', label: 'orders', sub: 'report txn open', kind: 'store', at: [210, 220] }
            ],
            edges: [{ from: 'app', to: 'q' }, { from: 'ddl', to: 'q' }, { from: 'q', to: 'db' }],
            flow: [['app>q', 'ddl>q']],
            err: ['q', 'app'],
            badges: { q: ['pile-up', 'err'], app: ['timeouts', 'err'] }
          }
        },
        {
          stage: 'fix',
          title: 'Expand, backfill in batches, contract later',
          text: 'Add the new column in a <b>metadata-only</b> step with a short <code>lock_timeout</code>. Ship code that writes both columns. A worker copies old rows <b>in small batches</b>, saving its position in a checkpoint table and slowing down when replicas lag. Drop the old column in a later release.',
          scene: {
            nodes: [
              { id: 'app', label: 'App v2', sub: 'writes both', kind: 'service', at: [70, 0] },
              { id: 'ddl', label: 'Backfill worker', sub: '5k rows / batch', kind: 'compute', at: [350, 0] },
              { id: 'db', label: 'orders', sub: '+ full_name', kind: 'store', at: [210, 110] },
              { id: 'ck', label: 'Checkpoint', sub: 'last id 41.2 M', kind: 'store', at: [350, 220] }
            ],
            edges: [{ from: 'app', to: 'db' }, { from: 'ddl', to: 'db' }, { from: 'ddl', to: 'ck' }],
            flow: [['app>db', 'ddl>db'], 'ddl>ck'],
            ok: ['db', 'ddl'],
            badges: { db: ['no downtime', 'ok'] }
          }
        }
      ],
      usedBy: ['GitHub (gh-ost for MySQL)', 'Stripe (dual-write online migrations)', 'Figma (Postgres horizontal sharding)', 'GoCardless (Postgres lock_timeout practice)', 'Percona Toolkit users (pt-online-schema-change)', 'Flyway and Liquibase users'],
      whenToUse: [
        'The product runs <b>24×7</b> and a maintenance window would breach an SLO or a contract',
        'Tables are large or hot enough that a rewrite or a long lock is visible to users',
        'You deploy with <b>rolling</b> or blue/green releases, so two app versions run at once'
      ],
      whenNot: [
        'The table is tiny and the change is metadata-only: just run it, with a <code>lock_timeout</code>',
        'An agreed maintenance window exists and costs less than the extra engineering',
        'You are replacing a whole system, not a schema: start with the <a href="strangler-fig.html">Strangler Fig</a> and <a href="cdc-pipelines.html">CDC</a>'
      ],
      glossary: [
        { term: 'Expand / contract (parallel change)', def: 'Add the new shape next to the old one, migrate users and data to it, then remove the old shape in a separate step.' },
        { term: 'ACCESS EXCLUSIVE lock', def: 'The strongest Postgres table lock; it conflicts with every other lock, including plain SELECT.' },
        { term: 'Lock queue', def: 'Waiting lock requests on a table; a queued strong lock makes later, weaker requests wait behind it.' },
        { term: 'lock_timeout', def: 'A Postgres setting that aborts a statement if it waits longer than the limit to acquire a lock.' },
        { term: 'Backfill', def: 'Filling a new column or table for rows that already existed before the change, usually in batches.' },
        { term: 'Keyset pagination', def: 'Walking a table by "primary key greater than the last one seen", which stays fast at any depth, unlike OFFSET.' },
        { term: 'Checkpoint table', def: 'A small table that records how far each migration job (or tenant) has got, so it can resume after a crash.' },
        { term: 'Dual write / shadow read', def: 'Writing to old and new stores at once, and reading both to compare, before trusting the new one.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Backward compatible at every step</b>: version N and N+1 of the app both work against the schema',
        '<b>Separate schema from code deploys</b>: expand before the code needs it, contract after nothing uses it',
        '<b>Bounded locks</b>: every DDL runs with <code>lock_timeout</code> and retries, never an open-ended wait',
        '<b>Small committed batches</b>: backfill by keyset, commit per batch, checkpoint progress',
        '<b>Throttle on the real bottleneck</b>: replica lag, WAL rate, p99 of live traffic',
        '<b>Verify before switching</b>: counts, checksums or shadow reads prove the new shape is right'
      ],
      nonFunctional: [
        'Zero user-visible downtime; no lock wait above ~2 s on hot tables (<em>rule of thumb</em>)',
        'Live p99 latency within +10–20% while the backfill runs (<em>example budget</em>)',
        'Replica lag kept below the read-your-writes tolerance, e.g. &lt; 1–5 s',
        'Resume after a crash from the last checkpoint, losing at most one batch per worker',
        'Every step reversible until contract; rollback of a read or write switch in minutes',
        'Progress and ETA visible per table, partition or tenant'
      ],
      outOfScope: [
        '<b>Rename-in-place</b>: <code>RENAME COLUMN</code> while old code still reads the old name',
        '<b>One giant UPDATE</b>: one transaction for all rows, huge WAL burst, long-held row locks, bloat',
        '<b>OFFSET pagination</b> for backfills: each batch gets slower than the last',
        '<b>Dual writes without verification</b>: two stores that drift silently',
        '<b>Contract in the same release as expand</b>: no way back once the old column is gone'
      ]
    },

    calculator: {
      inputs: [
        { id: 'rows', label: 'Rows to backfill', min: 1e6, max: 1e10, value: 8e8, log: true, fmt: 'num' },
        { id: 'batch', label: 'Batch size (rows per COMMIT)', min: 100, max: 100000, value: 5000, log: true, fmt: 'num' },
        { id: 'batchMs', label: 'Time per batch', min: 20, max: 5000, value: 250, unit: 'ms', log: true },
        { id: 'workers', label: 'Parallel workers (tenants / partitions per wave)', min: 1, max: 32, value: 4 },
        { id: 'throttle', label: 'Time spent throttled (paused for lag)', min: 0, max: 90, value: 20, unit: '%' },
        { id: 'replica', label: 'Replica can replay (rows/s of this change)', min: 5000, max: 500000, value: 60000, log: true, fmt: 'num' }
      ],
      outputs: [
        { label: 'Effective backfill rate', fmt: 'raw', f: (v) => Math.round(rate(v)).toLocaleString('en-US') + ' rows/s' },
        { label: 'Total duration', fmt: 'raw', f: (v) => dur(v.rows / rate(v)) },
        { label: 'Batches = checkpoint writes', fmt: 'num', f: (v) => Math.ceil(v.rows / v.batch) },
        { label: 'Write rate while running vs replica replay', fmt: 'raw', f: (v) => { const r = v.workers * v.batch / (v.batchMs / 1000); return Math.round(100 * r / v.replica) + '% of replica capacity'; } },
        { label: 'Replica lag risk', fmt: 'raw', f: (v) => { const r = v.workers * v.batch / (v.batchMs / 1000); const x = r / v.replica; if (x <= 0.6) return 'low: replay keeps up'; if (x <= 1) return 'medium: little headroom'; return 'high: lag grows ≈ ' + Math.round((x - 1) * 3600 / x) + ' s per hour running'; } },
        { label: 'Work redone after a crash (≤ 1 batch per worker)', fmt: 'raw', f: (v) => (v.workers * v.batch).toLocaleString('en-US') + ' rows' }
      ],
      note: 'Rate = workers × batch ÷ batch time × (1 − throttled share). Lag growth assumes the replica replays this change at the rate you set while the backfill writes faster (<em>simplified</em>: real replay depends on WAL volume, indexes touched and replica hardware). Batch time grows with batch size and with the indexes on the table, so measure a few batches first. Big batches finish sooner but hold row locks longer and send bigger WAL bursts; <b>more workers multiply both the speed and the lag</b>. Throttling turns a lag problem into a longer run, which is almost always the right trade.'
    },

    api: [
      { m: 'SQL', p: 'V42__expand_add_full_name.sql', d: 'Expand step only: <code>SET lock_timeout</code>, <code>ADD COLUMN</code> (nullable or constant default), <code>CREATE INDEX CONCURRENTLY</code>, constraints <code>NOT VALID</code>. No data change, no drop.' },
      { m: 'SQL', p: 'migration_checkpoint table', d: 'One row per job and tenant/partition: last key done, rows done, state, attempts, last error. The backfill reads it to resume and the dashboard reads it for ETA.' },
      { m: 'POLICY', p: 'Online DDL rules (CI linter)', d: 'Reject <code>RENAME</code>/<code>DROP</code> of columns still in use, non-concurrent index builds, <code>ADD CONSTRAINT</code> without <code>NOT VALID</code> on big tables, and migrations without <code>lock_timeout</code>.' },
      { m: 'YAML', p: 'Flyway / Liquibase config', d: 'Migrations versioned in Git and run in order before the app starts (or as a separate job). Contract scripts live in a <b>later</b> version, after the code that stops using the old shape has shipped.' },
      { m: 'ADR', p: 'ADR: move subscriptions to their own table', d: 'Phases (dual write → backfill → shadow read → switch reads → switch writes → delete), verification bar, throttle limits, rollback per phase, owner and exit date.' },
      { m: 'SLO', p: 'Migration guard rails', d: 'Pause when replica lag &gt; N s, live p99 &gt; budget, or error rate rises. Resume automatically when healthy; alert if paused longer than X minutes.' }
    ],
    dataModel: [
      { name: 'migration_checkpoint', store: 'Postgres (same DB)', fields: [['job', 'text', 'pk'], ['tenant_id', 'bigint', 'pk'], ['last_id', 'bigint'], ['rows_done', 'bigint'], ['state', 'PENDING|RUNNING|DONE|FAILED|PAUSED', 'idx'], ['attempts', 'int'], ['last_error', 'text'], ['updated_at', 'timestamptz']], note: 'Updated in the <b>same transaction</b> as each batch, so the checkpoint can never be ahead of or behind the data.' },
      { name: 'orders (during expand)', store: 'Postgres', fields: [['id', 'bigint', 'pk'], ['tenant_id', 'bigint', 'idx'], ['name', 'text (old, still written)'], ['full_name', 'text (new, nullable)'], ['status', 'text'], ['created_at', 'timestamptz']], note: 'Both columns exist. App v2 writes both; the backfill fills <code>full_name</code> for old rows; a later release drops <code>name</code>.' },
      { name: 'migration_wave', store: 'Postgres (control plane)', fields: [['wave', 'int', 'pk'], ['tenant_ids', 'bigint[]'], ['max_parallel', 'int'], ['started_at', 'timestamptz'], ['finished_at', 'timestamptz']], note: 'Small pilot wave first (internal tenants), then larger waves. A wave only starts when the previous one is DONE and verified.' },
      { name: 'shadow_mismatch', store: 'Postgres / logs', fields: [['id', 'bigint identity', 'pk'], ['entity_id', 'bigint', 'idx'], ['old_value', 'jsonb'], ['new_value', 'jsonb'], ['seen_at', 'timestamptz', 'idx']], note: 'Written when a shadow read of the new store disagrees with the old one. Must trend to zero before switching reads.' }
    ],

    architecture: {
      title: 'Online migration: expand, backfill, verify, switch',
      nodes: [
        { id: 'users', label: 'Live traffic', sub: 'reads + writes 24×7', kind: 'client', wide: [100, 60], tall: [70, 0], tip: 'Users never stop. Every step must keep their p99 within budget.' },
        { id: 'migr', label: 'Migration runner', sub: 'Flyway · lock_timeout', kind: 'policy', wide: [500, 60], tall: [210, 0], tip: 'Runs versioned DDL in order. Each statement gets a short lock_timeout and is retried with backoff instead of waiting forever.' },
        { id: 'lagmon', label: 'Lag / p99 monitor', sub: 'throttle signal', kind: 'policy', wide: [880, 60], tall: [350, 105], tip: 'Watches replica replay lag and live latency. Tells the backfill to slow down or pause.' },
        { id: 'app', label: 'App v1 + v2', sub: 'both shapes work', kind: 'service', wide: [100, 170], tall: [70, 105], tip: 'During a rolling deploy both versions run. v2 writes the old and new shape (dual write) behind a flag.' },
        { id: 'lockq', label: 'Lock queue', sub: 'per table', kind: 'queue', wide: [310, 170], tall: [210, 105], tip: 'Postgres grants locks in order. A waiting ACCESS EXCLUSIVE request blocks every later request on that table, even plain reads.' },
        { id: 'primary', label: 'Primary DB', sub: 'orders (old + new)', kind: 'store', wide: [520, 170], tall: [210, 210], tip: 'Holds both shapes during the migration. Metadata-only DDL is instant; batches are small transactions.' },
        { id: 'replica', label: 'Read replica', sub: 'replays WAL', kind: 'store', wide: [760, 170], tall: [350, 210], tip: 'Replays the primary\'s write-ahead log. A burst of backfill writes shows up here as replay lag and stale reads.' },
        { id: 'worker', label: 'Backfill workers', sub: 'keyset · N per wave', kind: 'compute', wide: [310, 280], tall: [70, 210], tip: 'A stored procedure with COMMIT per batch, or a Java/Python job. One worker per tenant or partition in a wave.' },
        { id: 'ckpt', label: 'Checkpoint table', sub: 'last_id per tenant', kind: 'store', wide: [100, 390], tall: [70, 315], tip: 'Updated in the same transaction as each batch. Pause, crash or deploy: the job resumes exactly where it stopped.' },
        { id: 'newstore', label: 'New shape / store', sub: 'column · table · shard', kind: 'store', wide: [760, 280], tall: [210, 315], tip: 'The target: a new column, a new table, or a different database or shard.' },
        { id: 'verify', label: 'Shadow verifier', sub: 'compare old vs new', kind: 'compute', wide: [760, 390], tall: [350, 315], tip: 'Reads both shapes (Scientist-style or batch checksums) and records mismatches before reads are switched.' }
      ],
      edges: [
        { from: 'users', to: 'app' },
        { from: 'app', to: 'lockq' },
        { from: 'migr', to: 'lockq' },
        { from: 'lockq', to: 'primary' },
        { from: 'primary', to: 'replica' },
        { from: 'worker', to: 'primary' },
        { from: 'worker', to: 'ckpt' },
        { from: 'replica', to: 'lagmon' },
        { from: 'lagmon', to: 'worker', dashed: true, bend: 0.25 },
        { from: 'app', to: 'newstore', dashed: true, bend: 0.3 },
        { from: 'primary', to: 'newstore' },
        { from: 'primary', to: 'verify', dashed: true },
        { from: 'newstore', to: 'verify', dashed: true }
      ]
    },

    scenarios: [
      {
        id: 'expand', title: 'Expand / contract a column rename', tone: 'info',
        steps: [
          { text: '<b>Release 1 (expand)</b>: <code>ADD COLUMN full_name text</code> with <code>lock_timeout = 2s</code>. Metadata only: a brief lock, no rewrite. Old code ignores the new column.', flow: ['migr>lockq', 'lockq>primary'], badges: { migr: 'V42 expand', primary: ['+ full_name', 'ok'] } },
          { text: '<b>Release 2</b>: app writes <b>both</b> <code>name</code> and <code>full_name</code>, still reads <code>name</code>. v1 and v2 servers coexist safely during the rolling deploy.', flow: ['users>app', 'app>lockq', 'lockq>primary'], badges: { app: 'write both' } },
          { text: '<b>Backfill</b>: workers copy <code>name → full_name</code> for old rows, a few thousand per transaction, by primary-key range.', flow: ['worker>primary', 'worker>ckpt'], badges: { worker: 'id > 41,200,000', ckpt: 'saved' } },
          { text: 'Verify: <code>count(*) WHERE full_name IS NULL</code> is 0 and a sample matches. Then <b>Release 3</b> reads <code>full_name</code> (flag on, can flip back).', flow: [['primary>verify', 'newstore>verify']], ok: ['verify'], badges: { verify: ['0 mismatches', 'ok'] } },
          { text: '<b>Release 4 (contract)</b>: stop writing <code>name</code>; <b>Release 5</b> drops it. Each phase shipped separately, so each could be rolled back.', flow: ['migr>lockq', 'lockq>primary'], badges: { migr: 'V47 contract' }, tone: 'ok' }
        ]
      },
      {
        id: 'pileup', title: 'Naive ALTER → lock queue pile-up', tone: 'err',
        steps: [
          { text: 'An analyst\'s report has held a transaction open on <code>orders</code> for 3 minutes. It holds only an <b>ACCESS SHARE</b> lock, harmless on its own.', flow: ['users>app', 'app>lockq', 'lockq>primary'], badges: { primary: 'report txn 3 min' } },
          { text: 'A migration runs <code>ALTER TABLE orders ADD COLUMN …</code> with no timeout. It needs <b>ACCESS EXCLUSIVE</b>, which conflicts with the report, so it waits.', flow: ['migr>lockq'], warn: ['lockq'], badges: { lockq: ['ALTER waiting', 'warn'] }, tone: 'warn' },
          { text: 'Every new <code>SELECT</code> on orders now queues <b>behind the ALTER</b>, because its request conflicts with the queued exclusive lock. The table is effectively down.', flow: ['users>app', 'app>lockq'], err: ['lockq', 'app'], badges: { lockq: ['3,000 queued', 'err'], app: ['pool exhausted', 'err'] }, tone: 'err' },
          { text: 'Fix: <code>SET lock_timeout = \'2s\'</code> so the ALTER gives up quickly, then retry with backoff. Log lock waits (<code>log_lock_waits</code>) and kill or avoid long transactions before DDL.', flow: ['migr>lockq', 'lockq>primary'], ok: ['lockq'], badges: { migr: ['retry #3 ok', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'backfill', title: 'At scale: throttled backfill of 800 M rows', tone: 'warn',
        steps: [
          { text: 'Each worker selects the next <b>5,000</b> ids with <code>WHERE id &gt; :last ORDER BY id LIMIT 5000</code>, updates them, writes the checkpoint and <b>COMMITs</b>.', flow: ['worker>primary', 'worker>ckpt'], badges: { worker: '4 workers' } },
          { text: 'Eight workers at full speed write faster than the replica can replay. Replica lag climbs to <b>40 s</b>; users reading from replicas see stale orders.', flow: ['worker>primary', 'primary>replica'], warn: ['replica'], badges: { replica: ['lag 40 s', 'warn'] }, tone: 'warn' },
          { text: 'The monitor reports lag above the 2 s budget. Workers <b>sleep</b> between batches until lag falls under 0.5 s (hysteresis), the same idea as gh-ost\'s and pt-osc\'s lag throttles.', flow: ['primary>replica', 'replica>lagmon', 'lagmon>worker'], badges: { lagmon: 'pause', worker: ['throttled', 'info'] } },
          { text: 'Steady state: lag under 1 s, live p99 +8%, the job runs about 30% longer. A slower, boring backfill is the goal.', nodes: ['replica', 'worker'], ok: ['replica'], badges: { replica: ['lag 0.6 s', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'waves', title: 'Tenant waves, a failure and resume', tone: 'warn',
        steps: [
          { text: 'Wave 1 is a <b>pilot</b>: 3 internal tenants, one worker each (a <code>CALL backfill_tenant(t)</code> per tenant). Problems hurt your own staff first.', flow: ['worker>primary', 'worker>ckpt'], badges: { worker: 'wave 1 · 3 tenants' } },
          { text: 'Wave 3 runs 8 tenants in parallel. Tenant 1207 fails on a row with bad legacy data: <code>check constraint violated</code>. Only that tenant\'s current batch rolls back.', flow: ['worker>primary'], err: ['worker'], badges: { worker: ['tenant 1207 FAILED', 'err'] }, tone: 'err' },
          { text: 'The checkpoint still says <code>last_id = 88,500</code> for tenant 1207 because it was committed with the last good batch. The other 7 tenants keep going.', flow: ['worker>ckpt'], badges: { ckpt: '1207: 88,500 · FAILED' } },
          { text: 'Fix the data rule, retry: the job resumes <b>from 88,500</b>, not from zero. Everything is idempotent (<code>WHERE full_name IS NULL</code>), so re-running a batch is safe.', flow: ['ckpt>worker', 'worker>primary'], ok: ['worker'], badges: { worker: ['resumed', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'dual', title: 'New store: dual write, shadow read, cut-over', tone: 'ok',
        steps: [
          { text: 'Stripe\'s pattern for moving data to a new table or store: <b>1. dual write</b> new changes to both, while a backfill copies history.', flow: ['users>app', ['app>lockq', 'app>newstore'], 'worker>newstore'], badges: { app: 'dual write' } },
          { text: '<b>2. Change reads</b>: read both, return the old answer, record any difference (shadow read).', flow: [['primary>verify', 'newstore>verify']], badges: { verify: 'diff 0.02%' } },
          { text: 'Fix the differences until mismatches are zero for days. Then serve reads from the new store, behind a flag you can flip back.', nodes: ['newstore', 'verify'], ok: ['verify'], badges: { verify: ['0 diffs · 7 days', 'ok'] } },
          { text: '<b>3. Change writes</b> to the new store only (keep syncing back to the old one if you still need a rollback path). <b>4. Delete</b> the old data once nothing reads it.', flow: ['app>newstore'], ok: ['newstore'], badges: { newstore: ['source of truth', 'ok'] }, tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Each control is a real choice for an 800 M-row table on a busy primary with replicas. Durations and latency deltas are <em>illustrative</em>, derived from the calculator model above.',
      controls: [
        { id: 'approach', label: 'Approach', type: 'seg', value: 'expand', options: [
          { v: 'big', l: 'Big ALTER in maintenance window' }, { v: 'expand', l: 'Expand / contract + backfill' }, { v: 'tool', l: 'Online tool (gh-ost, pg_repack)' }, { v: 'dual', l: 'Dual write to new store' }] },
        { id: 'batch', label: 'Batch size (rows per commit)', type: 'range', min: 500, max: 100000, step: 500, value: 5000, kind: 'num' },
        { id: 'par', label: 'Parallel workers', type: 'range', min: 1, max: 16, step: 1, value: 4, kind: 'num' },
        { id: 'throttle', label: 'Throttle on replica lag', type: 'seg', value: 'on', options: [{ v: 'on', l: 'On' }, { v: 'off', l: 'Off' }] }
      ],
      evaluate(s) {
        const clamp = (x) => Math.max(0.03, Math.min(0.97, x));
        const A = s.approach, big = A === 'big', thr = s.throttle === 'on';
        const ROWS = 8e8, REPLAY = 60000;
        const bms = 20 + s.batch * 0.045;                      // ms per batch, grows with size (estimate)
        const raw = s.par * s.batch / (bms / 1000);              // rows/s at full speed
        const over = raw / REPLAY;
        const eff = thr ? Math.min(raw, REPLAY * 0.8) : raw;     // throttle caps to ~80% of replay
        const toolF = A === 'tool' ? 0.7 : 1;                    // tools copy the whole table + apply binlog / triggers
        const secs = big ? 3 * 3600 : ROWS / (eff * toolF) * (A === 'dual' ? 1.3 : 1);
        const hours = secs / 3600;
        const lagS = big ? 0 : thr ? Math.min(1, over) * 0.8 : Math.max(0, (over - 1)) * 120;
        const lockMs = s.batch * 0.045;                          // row locks held per batch
        let p99 = big ? 0 : 6 + 3.2 * Math.pow(s.par, 0.8) * Math.pow(s.batch / 5000, 0.6) * (thr ? 0.7 : 1.15);
        if (A === 'tool') p99 += 4;
        const downtime = big ? '≈ 3 h planned window' : (A === 'tool' ? 'seconds (final swap lock)' : 'none (lock waits ≤ 2 s)');

        const metrics = [
          { k: 'Downtime', v: downtime, s: big ? 0.05 : A === 'tool' ? 0.8 : 0.93 },
          { k: 'Duration', v: hours < 1 ? Math.round(hours * 60) + ' min' : hours < 48 ? hours.toFixed(1) + ' h' : (hours / 24).toFixed(1) + ' days', s: clamp(1 - Math.log10(Math.max(1, hours)) / 2.4), hint: 'illustrative' },
          { k: 'p99 impact on live traffic', v: big ? 'n/a (app is down)' : '+' + Math.round(p99) + '%', s: big ? 0.1 : clamp(1 - p99 / 60) },
          { k: 'Replica lag', v: big ? 'n/a' : lagS < 1.5 ? '≈ ' + lagS.toFixed(1) + ' s' : '≈ ' + Math.round(lagS) + ' s and growing', s: big ? 0.5 : clamp(1 - lagS / 30) },
          { k: 'Rollback ease', v: { big: 'restore from backup', expand: 'flag flip until contract', tool: 'drop ghost table before swap', dual: 'flip reads/writes back' }[A], s: { big: 0.12, expand: 0.85, tool: 0.6, dual: 0.75 }[A] },
          { k: 'Risk', v: big ? 'all-or-nothing, window overrun' : (!thr && over > 1) ? 'lag + stale reads' : s.batch > 40000 ? 'long row locks per batch' : A === 'dual' ? 'drift without verification' : 'low', s: clamp(big ? 0.15 : 0.85 - (!thr && over > 1 ? 0.45 : 0) - (s.batch > 40000 ? 0.25 : 0) - (A === 'dual' ? 0.15 : 0)) }
        ];

        const notes = [];
        if (big) notes.push('A window works only if the business can stop. On a large table, <code>ALTER</code> plus a full <code>UPDATE</code> can overrun it, and rollback means restoring a backup.');
        if (A === 'expand') notes.push('Postgres 11+ adds a column with a constant default without rewriting the table, so the expand step is metadata-only; the cost moves to the <b>backfill</b>, which you control.');
        if (A === 'tool') notes.push('gh-ost copies rows into a ghost table and tails the binlog (no triggers); pt-online-schema-change uses triggers; pg_repack rebuilds a Postgres table online. All need a short exclusive lock to swap, and about 2× the table\'s disk space.');
        if (A === 'dual') notes.push('Dual write suits a <b>new table or store</b> (Stripe\'s four steps). Two writes are not atomic, so add shadow reads and reconciliation before switching.');
        if (!big && !thr && over > 1) notes.push('Write rate is ≈ ' + over.toFixed(1) + '× what the replica can replay: lag grows for as long as the job runs. Turn throttling on or reduce workers.');
        if (!big && s.batch > 40000) notes.push('Batches of ' + s.batch.toLocaleString('en-US') + ' rows hold row locks for ~' + Math.round(lockMs) + ' ms each and make large WAL bursts. 1k–10k rows per commit is a common <em>rule of thumb</em>.');
        if (!big && s.batch < 1500) notes.push('Tiny batches mean one commit and one checkpoint write per few hundred rows: the overhead dominates and the job crawls.');
        if (!big && s.par > 8) notes.push('Many workers multiply speed <b>and</b> contention. Run them in waves and raise parallelism only while p99 and lag stay inside budget.');

        let verdict;
        if (big) verdict = '❌ <b>Maintenance-window ALTER</b>: simple, but it needs downtime, can overrun, and its only rollback is a restore.';
        else if (!thr && over > 1) verdict = '⚠ <b>Unthrottled</b>: the backfill outruns replica replay; stale reads and failover risk grow every minute.';
        else if (s.batch > 40000) verdict = '⚠ <b>Batches too large</b>: fast on paper, but long lock holds and WAL bursts hit live p99.';
        else if (A === 'expand' && thr) verdict = '✅ <b>Textbook</b>: metadata-only expand, throttled keyset backfill with checkpoints, flag-guarded switch, contract later. Say this in the interview.';
        else if (A === 'tool') verdict = '👍 <b>Good for whole-table rewrites</b> (type change, repack) when expand/contract would be awkward. Plan the cut-over lock and disk space.';
        else if (A === 'dual') verdict = '👍 <b>Right for moving to a new table or store</b>, as long as shadow reads prove both sides match before you switch.';
        else verdict = '👍 <b>Workable</b>. Check the weakest meter: that is where the incident will come from.';

        const hide = [];
        if (big) hide.push('worker', 'ckpt', 'lagmon', 'verify', 'newstore');
        if (A === 'tool') hide.push('verify');
        if (!thr) hide.push('lagmon');
        const flow = big ? ['migr>lockq', 'lockq>primary'] : ['users>app', 'app>lockq', 'lockq>primary', 'worker>primary', 'worker>ckpt', 'primary>replica'];
        if (!big && thr) flow.push('replica>lagmon', 'lagmon>worker');
        if (A === 'dual') flow.push('app>newstore', ['primary>verify', 'newstore>verify']);
        if (A === 'expand') flow.push('primary>newstore');
        const badges = {
          worker: ['×' + s.par + ' · ' + (s.batch >= 1000 ? Math.round(s.batch / 1000) + 'k' : s.batch) + '/batch', 'info'],
          replica: big ? ['offline', 'info'] : [lagS < 1.5 ? 'lag ' + lagS.toFixed(1) + ' s' : 'lag ' + Math.round(lagS) + ' s', lagS < 1.5 ? 'ok' : 'err']
        };
        if (big) badges.app = ['DOWN', 'err'];
        return {
          metrics, verdict, notes: notes.slice(0, 4), hide, flow, badges,
          labels: {
            worker: { label: A === 'tool' ? 'gh-ost / pg_repack' : 'Backfill workers', sub: A === 'tool' ? 'row copy + log apply' : 'keyset · ' + s.par + ' per wave' },
            newstore: { label: A === 'dual' ? 'New store' : A === 'tool' ? 'Ghost table' : 'New column', sub: A === 'dual' ? 'table · shard' : A === 'tool' ? 'swapped at the end' : 'full_name' }
          },
          err: big ? ['app'] : (!thr && over > 1 ? ['replica'] : []),
          warn: s.batch > 40000 ? ['primary'] : [],
          ok: !big && thr ? ['replica'] : []
        };
      }
    },

    widget: {
      title: 'Wave scheduler: tenants, throttling, checkpoints',
      caption: 'Migrate tenants in <b>parallel waves</b>. Each tile is one tenant; its fill is the committed checkpoint. Change <b>batch size</b> and <b>parallelism</b> and watch live p99 and replica lag. Switch to <b>naive ALTER</b> to see the lock queue pile up. Pause and resume from checkpoints; one tenant fails and is retried.'
    },

    realWorld: {
      intro: 'The techniques are old and well documented. The best evidence comes from teams that published what went wrong.',
      timeline: [
        { when: '2014', who: 'Danilo Sato · martinfowler.com', title: 'Parallel Change (expand and contract)', text: 'The bliki describes splitting a backward-incompatible change into <b>expand, migrate and contract</b>, notes that each phase can be released on its own (useful for continuous delivery), and applies it to database refactoring, where migrate is the transition period between old and new schema. It warns that skipping contract can leave you worse off than before.', src: 0 },
        { when: '2016', who: 'GitHub', title: 'gh-ost: triggerless online schema migration', text: 'GitHub argued that trigger-based tools such as pt-online-schema-change cause load and locking problems on busy MySQL masters, and built gh-ost: it copies rows into a ghost table and applies ongoing changes by <b>reading the binary log</b>, with pause, dynamic reconfiguration and throttling on load and <b>replication lag</b>.', src: 1 },
        { when: '2017', who: 'Stripe', title: 'Online migrations at scale', text: 'Jacqueline Xu describes moving subscriptions out of the Customer record with a <b>four-step dual-writing pattern</b>: dual write, change reads (using Scientist to compare both), change writes, delete the old data.', src: 2 },
        { when: '2018', who: 'PostgreSQL 11', title: 'Fast ADD COLUMN and procedures with COMMIT', text: 'The release removed the table rewrite for <code>ADD COLUMN</code> with a non-null default in most cases, and added <code>CREATE PROCEDURE</code> with <b>transaction control</b>, so a PL/pgSQL procedure can COMMIT after each batch.', src: 3 },
        { when: '2019–2024', who: 'GoCardless', title: 'Zero-downtime Postgres migrations: the hard parts', text: 'GoCardless took about <b>15 seconds</b> of unexpected API downtime during a planned migration and traced it to the <b>lock queue</b>: a waiting lock blocks every conflicting request behind it. The follow-up centres on <code>lock_timeout</code> to cap that wait.', src: 5 },
        { when: 'ongoing', who: 'reorg/pg_repack', title: 'Online table rebuilds for Postgres', text: 'pg_repack rebuilds a table (like VACUUM FULL or CLUSTER) without holding an exclusive lock during the copy, taking a <b>brief lock to swap</b> at the end. It needs about twice the table\'s disk space and a primary key or unique NOT NULL index.', src: 7 },
        { when: '2022–2024', who: 'Figma', title: 'Horizontal sharding of Postgres', text: 'After vertical partitioning, some Figma tables reached several terabytes and billions of rows. The team built horizontal sharding on RDS Postgres with a <b>DBProxy</b> router, rolled out <b>logical sharding</b> before physical moves, and said the first table took roughly nine months end to end.', src: 8 }
      ],
      lessons: [
        'Most migration outages are <b>lock queues</b>, not slow copies: always set <code>lock_timeout</code> and retry.',
        'Separate <b>expand</b> and <b>contract</b> into different releases so two app versions can coexist.',
        'Backfill in small, committed, <b>checkpointed</b> batches and throttle on replica lag.',
        '<b>Verify</b> (counts, checksums, shadow reads) before switching reads; keep a way back until contract.',
        'Do a <b>logical</b> switch before a physical move (Figma) and pilot on a small wave first.'
      ],
      sources: [
        { title: 'Parallel Change', url: 'https://www.martinfowler.com/bliki/ParallelChange.html', pub: 'Danilo Sato, martinfowler.com bliki (2014)' },
        { title: 'gh-ost: GitHub\'s online schema migration tool for MySQL', url: 'https://github.blog/engineering/databases/gh-ost-github-s-online-migration-tool-for-mysql/', pub: 'GitHub Engineering, 2016' },
        { title: 'Online migrations at scale', url: 'https://stripe.com/se/blog/online-migrations', pub: 'Stripe blog (Jacqueline Xu), 2017' },
        { title: 'PostgreSQL 11 Release Notes', url: 'https://www.postgresql.org/docs/release/11.0/', pub: 'PostgreSQL Global Development Group, 2018' },
        { title: 'Explicit Locking', url: 'https://postgresql.org/docs/18/explicit-locking.html', pub: 'PostgreSQL documentation' },
        { title: 'Zero-downtime Postgres migrations: the hard parts', url: 'https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts/', pub: 'GoCardless Engineering' },
        { title: 'Zero-downtime Postgres migrations: a little help', url: 'https://gocardless.com/blog/zero-downtime-postgres-migrations-a-little-help', pub: 'GoCardless Engineering' },
        { title: 'pg_repack: reorganize tables with minimal locks', url: 'https://www.pgxn.org/dist/pg_repack/doc/pg_repack.html', pub: 'reorg/pg_repack documentation (PGXN)' },
        { title: 'How Figma\'s Databases Team Lived to Tell the Scale', url: 'https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/', pub: 'Figma blog (Sammy Steele), 2024' },
        { title: 'gh-ost repository', url: 'https://github.com/github/gh-ost', pub: 'GitHub (MIT licence)' },
        { title: 'pt-online-schema-change', url: 'https://man.archlinux.org/man/pt-online-schema-change.1p.en', pub: 'Percona Toolkit manual page' },
        { title: 'API expand-contract', url: 'https://www.thoughtworks.com/radar/techniques/api-expand-contract', pub: 'Thoughtworks Technology Radar, 2021' }
      ]
    },

    tradeoffs: {
      headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
      rows: [
        ['Change method', '<b>Expand / contract</b> in app releases', '<b>Online tool</b> (gh-ost, pt-osc, pg_repack) rewrites the table', 'Expand/contract for adding and renaming; a tool for type changes or rebuilds the database cannot do in place'],
        ['Backfill engine', '<b>Stored procedure</b> with COMMIT per batch (PG 11+)', '<b>App-side worker</b> (Java/Python) with metrics and throttling', 'Procedure for simple SQL transforms near the data; worker when you need lag checks, external calls or fine control'],
        ['Batch size', '<b>Small</b> (1k–5k): short locks, small WAL bursts', '<b>Large</b> (50k+): fewer commits, faster on paper', 'Start small, measure batch time, grow while p99 and lag stay in budget'],
        ['Parallelism', '<b>One worker</b>: easy to reason about', '<b>Waves of N</b> tenants/partitions', 'Waves when the table is huge and naturally partitioned; pilot wave first'],
        ['New store', '<b>Dual write + backfill</b>', '<b>CDC</b> from the old store', 'Dual write when the app owns both writes and you can verify; CDC when you want one writer and fewer code paths'],
        ['Contract timing', '<b>Soon</b>: less dual-shape code', '<b>After a soak</b>: rollback stays possible', 'Contract after at least one release cycle with zero reads of the old shape']
      ]
    },
    failures: [
      { f: 'Lock queue pile-up behind DDL', detect: 'Spike of waiting sessions in <code>pg_locks</code>/<code>pg_stat_activity</code>, pool exhaustion, timeouts on one table', fix: '<code>lock_timeout</code> of a few seconds plus retry with backoff; no long transactions during DDL; <code>log_lock_waits</code> on.' },
      { f: 'Old code meets new schema', detect: 'Errors like "column does not exist" during a rolling deploy', fix: 'Expand before the code, contract after; never rename or drop in the same release as the code change.' },
      { f: 'Backfill overloads replicas', detect: 'Replica replay lag rising, stale reads, failover risk', fix: 'Throttle on lag with hysteresis, fewer workers, smaller batches, run off-peak.' },
      { f: 'Slowing backfill (OFFSET paging)', detect: 'Each batch takes longer than the last', fix: 'Keyset pagination: <code>WHERE id &gt; :last ORDER BY id LIMIT n</code> on an indexed key.' },
      { f: 'Invalid index after failed CONCURRENTLY build', detect: '<code>pg_index.indisvalid = false</code>', fix: 'Drop it (<code>DROP INDEX CONCURRENTLY</code>) and rebuild; check after every concurrent build.' },
      { f: 'Restart from zero after a crash', detect: 'Job progress resets; duplicated work', fix: 'Checkpoint in the same transaction as the batch; idempotent batches so a replayed batch is harmless.' },
      { f: 'Dual-write drift', detect: 'Shadow-read mismatches or nightly checksum differences', fix: 'Verification before switching reads; reconciliation job; prefer one writer plus CDC where possible.' }
    ],

    interview: [
      { q: 'What is expand/contract (parallel change), and why does it give zero downtime?', a: '<p>Described on Martin Fowler\'s bliki by Danilo Sato: split a backward-incompatible change into <b>expand</b> (add the new shape next to the old), <b>migrate</b> (move code and data over) and <b>contract</b> (remove the old shape). Each phase can be deployed alone.</p><p>It gives zero downtime because at every moment both app version N and N+1 work against the schema, so rolling deploys and rollbacks are safe. The common misreading is to treat it as only a DB trick: it applies to APIs and code too.</p>', fu: 'Walk through renaming a column with it.', lvl: 'core' },
      { q: 'Why can a "fast" ALTER TABLE take an API down in Postgres?', a: '<p>Many ALTERs need an <b>ACCESS EXCLUSIVE</b> lock, which conflicts with everything, including SELECT. If a long transaction holds even a weak lock, the ALTER waits, and Postgres queues every later conflicting request <b>behind the waiting ALTER</b>. So a metadata-only change can block the table for as long as the long transaction runs.</p><p>Fix: <code>SET lock_timeout</code> (seconds), retry with backoff, avoid long transactions, monitor lock waits. GoCardless documented exactly this outage.</p>', lvl: 'core' },
      { q: 'lock_timeout vs statement_timeout?', a: '<p><code>lock_timeout</code> aborts a statement that <b>waits to acquire a lock</b> longer than the limit; it protects other sessions from queueing behind your DDL. <code>statement_timeout</code> aborts a statement that <b>runs</b> too long in total, including lock waits.</p><p>For migrations set a short <code>lock_timeout</code> (e.g. 2–5 s) on the DDL session, and a <code>statement_timeout</code> sized to the step; for <code>CREATE INDEX CONCURRENTLY</code> or <code>VALIDATE</code>, the statement may legitimately run for hours.</p>', lvl: 'core' },
      { q: 'How do you add a NOT NULL foreign key column to a 1 TB table safely in Postgres?', a: '<ol><li><code>ADD COLUMN customer_id bigint</code> (nullable; metadata-only).</li><li>Deploy code that writes it for new rows.</li><li>Backfill old rows in keyset batches, throttled.</li><li><code>CREATE INDEX CONCURRENTLY</code> on it.</li><li><code>ADD CONSTRAINT … FOREIGN KEY … NOT VALID</code>, then <code>VALIDATE CONSTRAINT</code>, which takes a weaker lock and does not block writes.</li><li>For NOT NULL: add <code>CHECK (customer_id IS NOT NULL) NOT VALID</code>, validate it, then <code>SET NOT NULL</code> (PG 12+ uses the valid check to skip the scan).</li></ol>', lvl: 'deep' },
      { q: 'Design a backfill for 2 billion rows. What does each batch look like?', a: '<p>Keyset pagination on the primary key: <code>WHERE id &gt; :last AND id &lt;= :last + n</code> (or <code>ORDER BY id LIMIT n</code>), update only rows still needing it (idempotent), write the <b>checkpoint in the same transaction</b>, COMMIT.</p><p>Size batches by time (e.g. ~100–500 ms), not rows. Throttle on replica lag and live p99, run several workers by partition or tenant, and expose progress and ETA. Never one giant UPDATE: it holds locks, bloats the table and floods WAL.</p>', fu: 'Why not OFFSET?', lvl: 'core' },
      { q: 'Why use a stored procedure with COMMIT inside it, and what are the limits?', a: '<p>Since PostgreSQL 11, a procedure invoked with a top-level <code>CALL</code> can <code>COMMIT</code>, so one call can process many batches as separate transactions, close to the data, without round-trips.</p><p>Limits: it cannot COMMIT if called inside an outer transaction block (or from a function), it has less observability than an app worker, and throttling on replica lag needs a query against <code>pg_stat_replication</code> plus <code>pg_sleep</code>. Many teams use a procedure per tenant and an app scheduler for waves.</p>', lvl: 'deep' },
      { q: 'How do you migrate thousands of tenants in parallel without hurting live traffic?', a: '<p><b>Waves</b>: a pilot wave of internal or small tenants, then larger waves of N tenants in parallel, where N is raised only while p99 and lag stay in budget. A <b>checkpoint row per tenant</b> makes pause, crash and retry cheap. Failed tenants are isolated, retried with backoff, and do not block the wave forever. Track waves and tenants in a control table so the plan is visible and resumable.</p>', lvl: 'deep' },
      { q: 'gh-ost vs pt-online-schema-change vs pg_repack?', a: '<p>All build a copy of the table and swap it in. <b>pt-osc</b> (Percona, MySQL) keeps the copy in sync with <b>triggers</b>. <b>gh-ost</b> (GitHub, MySQL) is <b>triggerless</b>: it tails the binary log, which reduces load on the master and lets it pause and throttle cleanly. <b>pg_repack</b> (Postgres) rebuilds a table or index online to remove bloat, with a brief lock at the swap.</p><p>All need roughly 2× disk and a short cut-over lock. In Postgres, many changes need no tool because they are metadata-only.</p>', lvl: 'core' },
      { q: 'You need to move a table to a new store (or shard). Walk me through it.', a: '<p>Stripe\'s four steps: <b>dual write</b> (plus backfill of history), <b>change reads</b> with shadow comparison until mismatches are zero, <b>change writes</b> to the new store, <b>delete</b> the old data. Each switch behind a flag. Alternatively one writer plus <a href="cdc-pipelines.html">CDC</a> into the new store avoids non-atomic dual writes.</p><p>Figma did a <b>logical</b> shard first (routing as if sharded) before physically moving data, which de-risked the physical step.</p>', lvl: 'deep' },
      { q: 'How do you roll back a migration halfway?', a: '<p>Design rollback per phase. Until contract, the old shape is still complete, so rollback is flipping the read or write flag back. A backfill is paused, not undone: the new column is simply ignored. After contract there is no cheap way back, which is why contract waits for a soak period and a separate release. For schema tools, abort before the swap and drop the ghost table.</p>', lvl: 'core' },
      { q: 'How do Flyway or Liquibase fit into zero-downtime deploys?', a: '<p>They version and order migrations, and record which ran. Zero downtime comes from <b>what</b> each version contains: expand scripts ship with or before the code that needs them, contract scripts in a later version. Long backfills do not belong in a startup migration that blocks app boot: run them as separate jobs. Set <code>lock_timeout</code> in each script and keep <code>CREATE INDEX CONCURRENTLY</code> outside a transaction (Flyway can run a script non-transactionally).</p>', lvl: 'core' },
      { q: 'Your team wants a 4-hour maintenance window for a big schema change. How do you convince them otherwise?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a 900 M-row orders table needed a new tenant key; the plan was a Saturday window. <b>Task</b>: avoid downtime for EU and US customers. <b>Action</b>: I showed the window could overrun (a test UPDATE on a copy took 6 h) and that rollback was a restore. I proposed expand/contract: metadata-only ADD COLUMN with lock_timeout, dual write behind a flag, a throttled keyset backfill per tenant with checkpoints, pilot wave first. <b>Result</b>: done over 4 days with p99 +7%, no downtime, and one tenant retried from its checkpoint after bad legacy data.</p>', lvl: 'core' }
    ],

    code: [
      {
        title: 'Postgres: expand with lock_timeout, CONCURRENTLY and NOT VALID', lang: 'sql',
        code: `-- V42__expand_orders_customer.sql  (Postgres 15+)
-- Run outside a transaction block: CREATE INDEX CONCURRENTLY requires it.
SET lock_timeout = '2s';          -- give up fast instead of queueing everyone
SET statement_timeout = '15s';

-- 1. Metadata-only: nullable column, no table rewrite
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id bigint;
-- (PG 11+: a constant DEFAULT would also avoid a rewrite)

-- 2. Index without blocking writes (takes SHARE UPDATE EXCLUSIVE)
SET statement_timeout = 0;        -- may run for a long time; lock_timeout still applies
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_id_idx
  ON orders (customer_id);

-- 3. Constraints enforced for new rows only; no full scan under a strong lock
SET statement_timeout = '15s';
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id)
  REFERENCES customers (id) NOT VALID;
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_nn CHECK (customer_id IS NOT NULL) NOT VALID;

-- ---- later, AFTER the backfill (separate migration) ----
-- VALIDATE scans the table but does not block reads or writes on orders.
SET statement_timeout = 0;
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_nn;
-- PG 12+: a valid CHECK lets SET NOT NULL skip its own scan
ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_customer_nn;

-- If a CONCURRENTLY build failed, it leaves an INVALID index:
-- SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;`,
        note: 'The migration runner should retry a statement that fails with <code>lock_not_available</code> (SQLSTATE 55P03) after a short backoff. The FK check during VALIDATE takes ROW SHARE on <code>customers</code>, which is also weak.'
      },
      {
        title: 'Postgres: per-tenant backfill PROCEDURE with COMMIT per batch and a checkpoint', lang: 'sql',
        code: `CREATE TABLE IF NOT EXISTS migration_checkpoint (
  job text, tenant_id bigint, last_id bigint NOT NULL DEFAULT 0,
  rows_done bigint NOT NULL DEFAULT 0, state text NOT NULL DEFAULT 'RUNNING',
  attempts int NOT NULL DEFAULT 0, last_error text, updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (job, tenant_id));

CREATE OR REPLACE PROCEDURE backfill_customer_id(p_tenant bigint, p_batch int DEFAULT 5000,
                                                 p_max_lag interval DEFAULT '2 s')
LANGUAGE plpgsql AS $$
DECLARE v_last bigint; v_max bigint; v_n bigint;
BEGIN
  INSERT INTO migration_checkpoint (job, tenant_id) VALUES ('customer_id', p_tenant)
    ON CONFLICT (job, tenant_id) DO UPDATE SET attempts = migration_checkpoint.attempts + 1,
                                               state = 'RUNNING';
  SELECT last_id INTO v_last FROM migration_checkpoint
   WHERE job = 'customer_id' AND tenant_id = p_tenant;
  COMMIT;
  LOOP
    -- keyset: the next p_batch ids of this tenant after the checkpoint
    SELECT max(id) INTO v_max FROM (
      SELECT id FROM orders WHERE tenant_id = p_tenant AND id > v_last
      ORDER BY id LIMIT p_batch) s;
    EXIT WHEN v_max IS NULL;
    UPDATE orders o SET customer_id = a.customer_id
      FROM accounts a
     WHERE o.tenant_id = p_tenant AND o.id > v_last AND o.id <= v_max
       AND a.id = o.account_id AND o.customer_id IS NULL;     -- idempotent
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE migration_checkpoint SET last_id = v_max, rows_done = rows_done + v_n, updated_at = now()
     WHERE job = 'customer_id' AND tenant_id = p_tenant;
    COMMIT;                                   -- batch + checkpoint are atomic (PG 11+)
    v_last := v_max;
    -- throttle: wait while any replica is behind (pg_stat_replication, PG 10+)
    WHILE (SELECT coalesce(max(replay_lag), '0') FROM pg_stat_replication) > p_max_lag LOOP
      PERFORM pg_sleep(0.5);
    END LOOP;
  END LOOP;
  UPDATE migration_checkpoint SET state = 'DONE', updated_at = now()
   WHERE job = 'customer_id' AND tenant_id = p_tenant;
  COMMIT;
END $$;
-- CALL backfill_customer_id(1207);   -- top-level CALL, not inside BEGIN … COMMIT`,
        note: 'An index on <code>(tenant_id, id)</code> keeps each keyset step cheap. If a batch fails, the error aborts the call and the checkpoint still holds the last committed id; a scheduler marks the tenant FAILED, records the error and retries with backoff. <code>replay_lag</code> can read stale when the primary is idle; that only makes the throttle more cautious.'
      },
      {
        title: 'Java 21: wave scheduler with per-tenant retries', lang: 'java',
        code: `// Spring Boot 3, JdbcTemplate. Runs N tenants per wave; a failed tenant is retried
// and resumes from its checkpoint because the procedure reads migration_checkpoint.
@Component
public class WaveScheduler {
  private static final Logger log = LoggerFactory.getLogger(WaveScheduler.class);
  private final JdbcTemplate jdbc;
  public WaveScheduler(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public void run(List<Long> tenants, int parallel, int maxAttempts) throws InterruptedException {
    for (List<Long> wave : partition(tenants, parallel)) {
      try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
        for (long t : wave) pool.submit(() -> migrateTenant(t, maxAttempts));
      } // close() waits for the whole wave to finish
      if (isPaused()) { log.info("paused after wave; resume re-runs from checkpoints"); return; }
    }
  }

  private void migrateTenant(long tenant, int maxAttempts) {
    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // autocommit connection, so the procedure is allowed to COMMIT per batch
        jdbc.execute("CALL backfill_customer_id(" + tenant + ", 5000, interval '2 s')");
        return;
      } catch (DataAccessException e) {
        jdbc.update("UPDATE migration_checkpoint SET state='FAILED', last_error=? " +
                    "WHERE job='customer_id' AND tenant_id=?", e.getMessage(), tenant);
        log.warn("tenant {} attempt {} failed: {}", tenant, attempt, e.getMessage());
        sleep(Duration.ofSeconds((long) Math.pow(2, attempt)));
      }
    }
  }

  private boolean isPaused() {
    return Boolean.TRUE.equals(jdbc.queryForObject(
        "SELECT paused FROM migration_control WHERE job='customer_id'", Boolean.class));
  }
  private static <T> List<List<T>> partition(List<T> l, int n) {
    List<List<T>> out = new ArrayList<>();
    for (int i = 0; i < l.size(); i += n) out.add(l.subList(i, Math.min(l.size(), i + n)));
    return out;
  }
  private static void sleep(Duration d) {
    try { Thread.sleep(d); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
  }
}`,
        note: 'The tenant id is a <code>long</code>, so concatenating it is safe; never concatenate strings into SQL. Do not call this from a <code>@Transactional</code> method: the procedure must be a top-level CALL to COMMIT. Flyway runs the expand script before the app starts; this job runs separately.'
      }
    ],

    related: ['strangler-fig', 'cdc-pipelines', 'deployment-strategies', 'consistency-models', 'sd:distributed-sql', 'sd:payment-gateway']
  });
})();
