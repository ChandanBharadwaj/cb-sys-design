SD.register({
  slug: 'consistency-models',
  domain: 1,
  title: 'Consistency Models & Isolation',
  examples: 'Jepsen, Postgres SSI',
  tagline: 'A consistency model is a <b>contract about which histories are allowed</b>: what a read may return while other clients write. Stronger contracts forbid more anomalies, and cost <b>latency, aborts and retries</b>.',
  tldr: {
    problem: 'Two requests touch the same data at the same time, or a read goes to a replica that is a few hundred milliseconds behind. Without a clear contract you get <b>lost updates, double bookings and "my change vanished"</b>, and nobody can say whether the database or the code is wrong.',
    idea: 'Name the guarantee. For single objects on replicas: <b>linearizable → sequential → causal → session guarantees → eventual</b>. For multi-row transactions: <b>serializable → snapshot isolation / repeatable read → read committed</b>. Each level is defined by the <b>anomalies it forbids</b> (Berenson et al. 1995, Adya 1999).',
    insight: 'Postgres defaults to <b>Read Committed</b>, which allows lost updates and write skew. Its REPEATABLE READ is <b>snapshot isolation</b>; SERIALIZABLE is <b>SSI</b> and aborts with SQLSTATE <code>40001</code>, so you <b>must retry</b>. In an interview, name the anomaly, the level that stops it, and the cheaper targeted fix (<code>FOR UPDATE</code>, a constraint, a version column).',
    numbers: [
      { v: 'READ COMMITTED', l: 'Postgres default isolation level; allows lost update, write skew and phantoms' },
      { v: '40001', l: 'SQLSTATE serialization_failure: Postgres docs say retry the whole transaction' },
      { v: '< 7%', l: 'SSI throughput cost vs snapshot isolation on the benchmarks in Ports & Grittner (VLDB 2012)' }
    ]
  },

  intro: {
    what: 'A <b>consistency model</b> is a promise a database makes about what a read can return when many clients read and write at once, or when data is copied to several machines. An <b>isolation level</b> is the same idea for transactions: how much one transaction may see of another that is still running. The stronger the promise, the more the database must <b>wait, lock or abort</b> to keep it.',
    analogy: {
      icon: '📝',
      title: 'A shared whiteboard in an office',
      text: 'Everyone edits one whiteboard. The strictest rule is <b>one marker</b>: people queue, and everyone sees each change the moment it is made (linearizable, serializable). A looser rule lets people copy the board to their notebook and work from the copy (a <b>snapshot</b>), which is faster but two people can each erase a line based on an old copy. Photos of the board sent to other floors arrive late (<b>replicas</b>), so someone there may act on yesterday\'s plan. The analogy is loose in one way: a database can detect many conflicts after the fact and undo one transaction, which an office cannot.'
    },
    problem: 'Two nurses look at the on-call rota at the same moment. Each sees two doctors on call, so each lets one go home. Both updates touch <b>different rows</b>, so no row lock fires, and the hospital now has <b>nobody on call</b>. Every statement was correct; the interleaving was not. <b>Which interleavings must the database refuse, and what does that cost?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Read, decide in code, write',
        text: 'The app reads a value, decides in Java, and writes the result back. With one user at a time this is perfectly correct, so it passes every unit test.',
        scene: {
          nodes: [
            { id: 'a', label: 'Request A', sub: 'stock check', kind: 'client', at: [70, 0] },
            { id: 'app', label: 'Order service', sub: 'read → decide → write', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Postgres', sub: 'stock = 1', kind: 'store', at: [350, 0] }
          ],
          edges: [{ from: 'a', to: 'app' }, { from: 'app', to: 'db', bidi: true }],
          flow: ['a>app', 'app>db', 'db>app'],
          ok: ['db']
        }
      },
      {
        stage: 'breaks',
        title: 'Two requests interleave',
        text: 'Two requests read <b>stock = 1</b> at the same time, both decide "in stock", and both write <b>stock = 0</b>. Under the default <b>Read Committed</b> level both commit: one item, two orders. This is a <b>lost update</b>.',
        scene: {
          nodes: [
            { id: 'a', label: 'Request A', sub: 'reads 1', kind: 'client', at: [70, 0] },
            { id: 'b', label: 'Request B', sub: 'reads 1', kind: 'client', at: [70, 220] },
            { id: 'app', label: 'Order service', sub: 'two threads', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Postgres', sub: 'READ COMMITTED', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'a', to: 'app' }, { from: 'b', to: 'app' }, { from: 'app', to: 'db', bidi: true }],
          flow: [['a>app', 'b>app'], 'app>db'],
          err: ['db'],
          badges: { db: ['sold twice', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Name the anomaly, then block it',
        text: 'Lock the row while deciding (<code>SELECT … FOR UPDATE</code>), check a <b>version</b> on write, or run the transaction as <b>SERIALIZABLE</b> and retry the one that the database aborts. The second request now sees <b>stock = 0</b>.',
        scene: {
          nodes: [
            { id: 'a', label: 'Request A', sub: 'commits', kind: 'client', at: [70, 0] },
            { id: 'b', label: 'Request B', sub: 'retries', kind: 'client', at: [70, 220] },
            { id: 'app', label: 'Order service', sub: 'retry on 40001', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Postgres', sub: 'SERIALIZABLE', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'a', to: 'app' }, { from: 'b', to: 'app' }, { from: 'app', to: 'db', bidi: true }],
          flow: ['a>app', 'app>db', 'b>app', 'app>db'],
          ok: ['db', 'a'],
          warn: ['b'],
          badges: { db: ['1 sold ✓', 'ok'], b: ['out of stock', 'warn'] }
        }
      }
    ],
    usedBy: ['PostgreSQL (SSI since 9.1)', 'Google Spanner', 'CockroachDB', 'Amazon DynamoDB', 'MySQL InnoDB', 'Jepsen test suite'],
    whenToUse: [
      'Any read-modify-write on shared data: balances, stock, seats, quotas, unique slots',
      'You add read replicas or caches and must say which reads may be stale and by how much',
      'You review a design or incident and need a precise name for "it went wrong only under load"'
    ],
    whenNot: [
      'Single-writer data, append-only logs, or idempotent overwrites where the last value is always correct',
      'Choosing what replicas do during a network partition (see <a href="cap-pacelc.html">CAP &amp; PACELC</a>)',
      'Making nodes agree on a leader or an order of commands (see <a href="consensus-theory.html">Consensus &amp; Impossibility Results</a>)'
    ],
    glossary: [
      { term: 'Linearizable', def: 'Every operation seems to take effect at one instant between its start and its end, as if on a single copy (Herlihy & Wing, 1990).' },
      { term: 'Serializable', def: 'The result of running transactions together equals some one-at-a-time order of them; that order need not match real time.' },
      { term: 'Snapshot isolation (SI)', def: 'Each transaction reads from a snapshot taken at its start; of two concurrent writers to the same row, the first committer wins.' },
      { term: 'Lost update', def: 'Two transactions read the same value and both write back a result, so one change silently disappears.' },
      { term: 'Write skew', def: 'Two transactions read an overlapping set, then write different rows, together breaking a rule that each one checked.' },
      { term: 'Phantom', def: 'A row that matches a search appears or disappears because another transaction inserted or deleted it.' },
      { term: 'Read-your-writes', def: 'A session guarantee: after you write, your own later reads show that write (Terry et al., 1994).' },
      { term: 'MVCC', def: 'Multi-version concurrency control: the database keeps old row versions so readers do not block writers.' }
    ]
  },

  requirements: {
    functional: [
      'State the <b>model per operation</b>: which reads may be stale, which writes must be serializable, which can be eventual',
      'Define levels by <b>anomalies forbidden</b> (dirty read, lost update, write skew, phantom), not by vendor names',
      'Every <b>read-modify-write</b> on shared data uses a lock, a version check, an atomic SQL update or SERIALIZABLE',
      'Treat <code>40001</code> and deadlocks as <b>normal outcomes</b>: retry the whole transaction, with a bounded budget',
      'Push invariants into the database where possible: <b>unique and exclusion constraints, CHECKs</b>',
      'Route reads deliberately: <b>primary</b> for read-your-writes, replicas with a stated <b>staleness bound</b> otherwise'
    ],
    nonFunctional: [
      'Money and stock: <b>zero</b> lost updates or double bookings, verified by concurrency tests',
      'Serialization retries <b>&lt; 1%</b> of transactions at p99 load (<em>rule of thumb</em>; alert above it)',
      'Retry budget: at most <b>3 attempts</b> with jittered backoff, then a clean error',
      'Replica staleness <b>p99 &lt; 1 s</b>, with read-your-writes for the writer\'s own session',
      'Lock waits <b>p99 &lt; 50 ms</b> on hot rows; transactions short, no network calls inside them',
      'Isolation level and routing <b>documented per endpoint</b> and checked in code review'
    ],
    outOfScope: [
      '<b>"We use transactions, so we are safe"</b>: Read Committed transactions still lose updates',
      '<b>Assuming REPEATABLE READ means the same everywhere</b>: Postgres is SI, MySQL InnoDB differs, ANSI is lock-based',
      '<b>SERIALIZABLE without a retry loop</b>: the first busy day turns 40001s into user-facing 500s',
      '<b>Check-then-insert for uniqueness</b> instead of a unique or exclusion constraint',
      '<b>Reading from a replica right after a write</b> in the same user flow'
    ]
  },

  calculator: {
    inputs: [
      { id: 'lag', label: 'Replica lag (p50)', min: 1, max: 5000, value: 200, unit: 'ms', log: true },
      { id: 'gap', label: 'Mean gap from a user\'s write to their next read', min: 50, max: 60000, value: 1500, unit: 'ms', log: true },
      { id: 'rep', label: 'Reads routed to replicas', min: 0, max: 100, value: 80, unit: '%' },
      { id: 'tps', label: 'Transactions per second on the hot set', min: 1, max: 20000, value: 500, log: true },
      { id: 'dur', label: 'Transaction duration', min: 1, max: 2000, value: 20, unit: 'ms', log: true },
      { id: 'hot', label: 'Hot rows they contend on', min: 1, max: 100000, value: 1000, log: true }
    ],
    outputs: [
      { label: 'Read-your-writes violation chance per follow-up read', fmt: 'pct', f: (v) => (v.rep / 100) * (1 - Math.exp(-v.lag / v.gap)) * 100 },
      { label: 'Concurrent transactions in flight (Little\'s law)', fmt: 'raw', f: (v) => (v.tps * v.dur / 1000).toFixed(1) },
      { label: 'Chance a transaction conflicts (SI / SSI abort)', fmt: 'pct', f: (v) => { const k = v.tps * v.dur / 1000; return (1 - Math.exp(-2 * k / v.hot)) * 100; } },
      { label: 'Expected attempts per transaction', fmt: 'raw', f: (v) => { const k = v.tps * v.dur / 1000, p = Math.min(0.99, 1 - Math.exp(-2 * k / v.hot)); return (1 / (1 - p)).toFixed(3) + '×'; } },
      { label: 'Retries per second', fmt: 'raw', f: (v) => { const k = v.tps * v.dur / 1000, p = Math.min(0.99, 1 - Math.exp(-2 * k / v.hot)); return SD.fmt.num(Math.round(v.tps * p / (1 - p))) + ' /s'; } },
      { label: 'Verdict', fmt: 'raw', f: (v) => { const k = v.tps * v.dur / 1000, p = 1 - Math.exp(-2 * k / v.hot); return p < 0.01 ? 'SERIALIZABLE is cheap here' : p < 0.1 ? 'SERIALIZABLE fine with a retry loop' : 'Hot spot: shorten transactions or use FOR UPDATE / atomic SQL'; } }
    ],
    note: 'Stale-read model: the follow-up read hits a replica with probability <i>rep</i> and arrives before the write is replayed with probability <code>1 − e^(−lag/gap)</code> (exponential gaps, <em>estimate</em>). Conflict model: each transaction touches one uniformly random hot row and overlaps with <code>k = tps × duration</code> others, so <code>P ≈ 1 − e^(−2k/rows)</code>. This is a <em>rule-of-thumb</em> upper bound for write-write conflicts; SSI can also abort on read-write patterns (false positives), and skewed keys make it much worse. Measure with <code>pg_stat_database.xact_rollback</code> and your retry counter.'
  },

  api: [
    { m: 'ADR', p: 'ADR-021: isolation and routing per use case', d: 'Default <b>READ COMMITTED</b> + atomic SQL; <b>SERIALIZABLE + retry</b> for booking and transfers; replica reads only for catalog and reports, with a 1 s staleness bound. Lists the anomaly each choice prevents.' },
    { m: 'SQL', p: 'Constraints that encode invariants', d: '<code>UNIQUE (seat_id, show_id)</code>, <code>EXCLUDE USING gist (room WITH =, during WITH &amp;&amp;)</code>, <code>CHECK (balance &gt;= 0)</code>. The cheapest serializability is a constraint the database enforces for you.' },
    { m: 'POLICY', p: 'Retry contract', d: 'Retry on <code>40001</code> and <code>40P01</code> only, whole transaction, max 3 attempts, exponential backoff with jitter, idempotency key on the request. Never retry inside the transaction.' },
    { m: 'HTTP', p: 'PUT /orders/{id} + If-Match', d: 'Optimistic concurrency at the API: the client sends the <code>ETag</code> (row version) it read; a mismatch returns <b>412 Precondition Failed</b> instead of overwriting.' },
    { m: 'DOC', p: 'Read-routing matrix', d: 'For each endpoint: primary, replica, or "primary for N s after this session wrote" (read-your-writes). Names the <b>session guarantee</b> each route provides.' },
    { m: 'SLO', p: 'Contention SLO', d: 'Serialization failures &lt; 1% of transactions; lock wait p99 &lt; 50 ms; replica <code>replay_lag</code> p99 &lt; 1 s.' }
  ],

  dataModel: [
    { name: 'doctors (write-skew demo)', store: 'Postgres', fields: [['id', 'bigint', 'pk'], ['shift_id', 'bigint', 'idx'], ['name', 'text'], ['on_call', 'boolean']], note: 'Invariant: at least one doctor per shift has <code>on_call = true</code>. No single row encodes it, so row locks on the updated row do not protect it.' },
    { name: 'account (optimistic)', store: 'Postgres via JPA', fields: [['id', 'bigint', 'pk'], ['balance_cents', 'bigint'], ['version', 'bigint'], ['updated_at', 'timestamptz']], note: '<code>UPDATE … SET balance_cents = ?, version = version + 1 WHERE id = ? AND version = ?</code>. Zero rows updated means someone else won: reload and retry.' },
    { name: 'booking (phantom-safe)', store: 'Postgres', fields: [['id', 'bigint', 'pk'], ['room_id', 'bigint', 'idx'], ['during', 'tstzrange', 'idx'], ['user_id', 'bigint']], note: 'An <code>EXCLUDE USING gist</code> constraint rejects overlapping ranges even when both inserts run concurrently under Read Committed.' },
    { name: 'session_write_marker', store: 'Redis / cookie', fields: [['session_id', 'text', 'pk'], ['last_commit_lsn', 'pg_lsn'], ['expires_at', 'timestamp']], note: 'Read-your-writes on replicas: route to a replica only if its <code>pg_last_wal_replay_lsn()</code> ≥ the session\'s last commit LSN.' }
  ],

  architecture: {
    title: 'Two clients, one primary, an async replica, and the isolation machinery',
    nodes: [
      { id: 'cliA', label: 'Client A', sub: 'nurse 1 / buyer 1', kind: 'client', wide: [150, 0], tall: [70, 0], tip: 'One concurrent request. Its operations interleave with Client B\'s.' },
      { id: 'cliB', label: 'Client B', sub: 'nurse 2 / buyer 2', kind: 'client', wide: [450, 0], tall: [350, 0], tip: 'The other concurrent request.' },
      { id: 'iso', label: 'Isolation policy', sub: 'RC · RR (SI) · SSI', kind: 'policy', wide: [800, 0], tall: [210, 0], tip: 'Chosen per transaction: SET TRANSACTION ISOLATION LEVEL, or @Transactional(isolation = ...).' },
      { id: 'app', label: 'Order service', sub: '@Transactional', kind: 'service', wide: [300, 125], tall: [210, 105], tip: 'Opens the transaction, runs read → decide → write, commits. The bug usually lives here, in the decide step.' },
      { id: 'router', label: 'Read router', sub: 'primary or replica', kind: 'edge', wide: [600, 125], tall: [350, 105], tip: 'Sends writes and fresh reads to the primary, other reads to replicas. Read-your-writes needs a rule here.' },
      { id: 'retry', label: 'Retry loop', sub: 'on 40001 / 40P01', kind: 'compute', wide: [150, 250], tall: [70, 105], tip: 'Re-runs the whole transaction after a serialization failure or deadlock, with backoff and a small budget.' },
      { id: 'primary', label: 'Postgres primary', sub: 'MVCC · row locks', kind: 'store', wide: [450, 250], tall: [210, 210], tip: 'Serves all writes. Each transaction reads a snapshot; concurrent writers to one row wait on its row lock.' },
      { id: 'replica', label: 'Read replica', sub: 'async · lag ~ms–s', kind: 'store', wide: [800, 250], tall: [350, 210], tip: 'Replays the WAL stream later. Reads here can be stale; serializable transactions cannot run here as serializable writes.' },
      { id: 'mvcc', label: 'MVCC versions', sub: 'snapshot per stmt/tx', kind: 'cache', wide: [300, 375], tall: [70, 210], tip: 'Read Committed takes a new snapshot per statement; Repeatable Read and Serializable keep one snapshot for the whole transaction.' },
      { id: 'ssi', label: 'SSI tracker', sub: 'SIREAD locks · rw edges', kind: 'compute', wide: [600, 375], tall: [210, 315], tip: 'Only at SERIALIZABLE: records what each transaction read and flags a dangerous structure of two read-write dependencies, then aborts one transaction.' }
    ],
    edges: [
      { from: 'cliA', to: 'app' },
      { from: 'cliB', to: 'app' },
      { from: 'iso', to: 'app', dashed: true },
      { from: 'app', to: 'router', bidi: true },
      { from: 'app', to: 'retry', bidi: true },
      { from: 'router', to: 'primary', bidi: true },
      { from: 'router', to: 'replica', bidi: true },
      { from: 'primary', to: 'replica', label: 'WAL async' },
      { from: 'primary', to: 'mvcc', bidi: true },
      { from: 'primary', to: 'ssi', bidi: true }
    ]
  },

  scenarios: [
    {
      id: 'lost', title: 'Lost update under Read Committed', tone: 'err',
      steps: [
        { text: 'Both clients buy the last item. Each transaction runs <code>SELECT stock FROM item WHERE id = 7</code> and reads <b>1</b>.', flow: [['cliA>app', 'cliB>app'], 'app>router', 'router>primary', 'primary>mvcc'], badges: { primary: 'stock = 1' } },
        { text: 'Each decides in Java: <code>1 &gt; 0</code>, so sell. A writes <code>stock = 0</code> and takes the <b>row lock</b>.', flow: ['app>router', 'router>primary'], badges: { primary: ['A locks row', 'info'] } },
        { text: 'B\'s <code>UPDATE … SET stock = 0</code> <b>waits</b> on A\'s row lock. A commits; Read Committed lets B proceed and write its <b>precomputed</b> 0.', flow: ['router>primary'], warn: ['primary'], badges: { primary: ['B waited, then wrote', 'warn'] }, tone: 'warn' },
        { text: 'Both commit: <b>two orders, one item</b>. No error was raised, because Read Committed does not forbid lost updates.', nodes: ['cliA', 'cliB', 'primary'], err: ['primary'], badges: { primary: ['sold twice', 'err'] }, tone: 'err' },
        { text: 'Fixes: atomic <code>UPDATE … SET stock = stock - 1 WHERE stock &gt; 0</code>, or <code>SELECT … FOR UPDATE</code>, or a <b>version column</b>, or REPEATABLE READ, where B gets <code>40001</code>.', nodes: ['iso', 'app'], ok: ['app'], badges: { iso: ['pick one', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'skew', title: 'Write skew: SI allows it, SSI aborts it', tone: 'warn',
      steps: [
        { text: 'Rota rule: at least one doctor on call. A and B both run <code>SELECT count(*) … WHERE on_call</code> and see <b>2</b>.', flow: [['cliA>app', 'cliB>app'], 'app>router', 'router>primary'], badges: { primary: 'on call = 2' } },
        { text: 'A sets <b>Alice</b> off call; B sets <b>Bob</b> off call. <b>Different rows</b>, so no row lock conflict and no first-committer-wins.', flow: ['router>primary', 'primary>mvcc'], badges: { mvcc: 'two new versions' } },
        { text: 'Under <b>REPEATABLE READ</b> (snapshot isolation in Postgres) both commit. Nobody is on call. This is <b>write skew</b>, anomaly A5B in Berenson et al.', nodes: ['primary'], err: ['primary'], badges: { primary: ['on call = 0', 'err'] }, tone: 'err' },
        { text: 'Under <b>SERIALIZABLE</b>, the SSI tracker saw A read Bob\'s row that B wrote, and B read Alice\'s row that A wrote: a <b>cycle of rw-dependencies</b>.', flow: ['primary>ssi', 'ssi>primary'], warn: ['ssi'], badges: { ssi: ['A ⇄ B rw', 'warn'] }, tone: 'warn' },
        { text: 'A commits first. B\'s COMMIT fails with <code>40001 could not serialize access</code>. The retry loop re-runs B, which now sees <b>1</b> on call and refuses.', flow: ['primary>app', 'app>retry', 'retry>app', 'app>router', 'router>primary'], ok: ['retry', 'primary'], badges: { retry: ['retry 1 ✓', 'ok'], primary: ['on call = 1', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'stale', title: 'Stale replica read: read-your-writes broken', tone: 'warn',
      steps: [
        { text: 'Client A renames its profile. The write commits on the <b>primary</b>.', flow: ['cliA>app', 'app>router', 'router>primary'], ok: ['primary'], badges: { primary: ['name = Anna', 'ok'] } },
        { text: 'The redirect loads the profile page. The router sends the read to the <b>replica</b>, which has not replayed that WAL yet.', flow: ['app>router', 'router>replica'], warn: ['replica'], badges: { replica: ['name = Ann (old)', 'warn'] }, tone: 'warn' },
        { text: 'The user sees the old name and edits again. Isolation level does <b>not</b> matter: this is a <b>replication</b> guarantee (read-your-writes), not a transaction one.', nodes: ['iso', 'replica'], err: ['cliA'], badges: { cliA: ['"my change vanished"', 'err'] }, tone: 'err' },
        { text: 'Fix: route this session to the primary for a few seconds after a write, or wait until the replica\'s replay LSN passes the session\'s commit LSN.', flow: ['primary>replica', 'app>router', 'router>primary'], ok: ['router', 'cliA'], badges: { router: ['sticky to primary', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'pess', title: 'FOR UPDATE vs optimistic version', tone: 'info',
      steps: [
        { text: '<b>Pessimistic</b>: <code>SELECT … FOR UPDATE</code> locks the row at read time. B\'s locking read <b>waits</b> until A commits, then sees A\'s value.', flow: ['cliA>app', 'app>router', 'router>primary', 'cliB>app'], badges: { primary: ['B waits on lock', 'info'] } },
        { text: 'Good when conflicts are <b>frequent</b>: nobody does work that is thrown away. Cost: lock waits, and deadlocks if rows are locked in different orders.', nodes: ['primary'], warn: ['primary'], badges: { primary: ['lock wait p99', 'warn'] } },
        { text: '<b>Optimistic</b>: read without locks, then <code>UPDATE … WHERE id = ? AND version = 4</code>. If 0 rows change, someone else won; JPA throws <code>OptimisticLockException</code>.', flow: ['app>router', 'router>primary', 'primary>app', 'app>retry'], badges: { retry: 'reload + retry' } },
        { text: 'Good when conflicts are <b>rare</b> and the read spans a user\'s think time (HTTP <code>If-Match</code>). Never hold a database lock across a user\'s think time.', nodes: ['app', 'retry'], ok: ['app', 'retry'], badges: { app: ['no locks held', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'hot', title: 'Under load: SERIALIZABLE on a hot row', tone: 'warn',
      steps: [
        { text: 'Flash sale: 2,000 transactions per second all touch the same <b>stock row</b>, each running ~20 ms. About 40 are in flight at any moment.', flow: [['cliA>app', 'cliB>app'], 'app>router', 'router>primary'], warn: ['primary'], badges: { primary: ['~40 in flight', 'warn'] }, tone: 'warn' },
        { text: 'At SERIALIZABLE nearly every pair conflicts. Most transactions abort with <code>40001</code>; retries add more load, and goodput falls.', flow: ['primary>app', 'app>retry', 'retry>app', 'app>router', 'router>primary'], err: ['retry', 'primary'], badges: { retry: ['retry storm', 'err'] }, tone: 'err' },
        { text: 'Fix the access pattern, not the level: one atomic <code>UPDATE … WHERE stock &gt; 0 RETURNING</code> queues on the row lock but never aborts.', flow: ['app>router', 'router>primary'], ok: ['primary'], badges: { primary: ['1 statement, no retry', 'ok'] } },
        { text: 'Or split the hot row into <b>N stock buckets</b>, or reserve through a queue. Keep SERIALIZABLE for the low-contention, multi-row invariants.', nodes: ['iso', 'primary'], ok: ['iso'], badges: { iso: ['level per use case', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'A booking service on Postgres with one async replica. Choose the isolation level, how read-modify-write is written, where reads go, and how hot the data is. Numbers are <em>illustrative</em>, derived from the mechanisms on this page.',
    diagram: null,
    controls: [
      { id: 'iso', label: 'Isolation level', type: 'seg', value: 'rc', options: [
        { v: 'rc', l: 'READ COMMITTED' }, { v: 'rr', l: 'REPEATABLE READ (SI)' }, { v: 'ser', l: 'SERIALIZABLE (SSI)' }] },
      { id: 'rmw', label: 'Read-modify-write style', type: 'seg', value: 'naive', options: [
        { v: 'naive', l: 'Read, decide, write' }, { v: 'lock', l: 'SELECT … FOR UPDATE' }, { v: 'opt', l: '@Version (optimistic)' }, { v: 'atomic', l: 'Atomic SQL + constraint' }] },
      { id: 'route', label: 'Read routing', type: 'seg', value: 'primary', options: [
        { v: 'primary', l: 'All reads on primary' }, { v: 'replica', l: 'Reads on replica' }, { v: 'ryw', l: 'Replica + read-your-writes' }] },
      { id: 'cont', label: 'Contention', type: 'seg', value: 'low', options: [
        { v: 'low', l: 'Low (many rows)' }, { v: 'high', l: 'Hot rows (flash sale)' }] }
    ],
    evaluate(s) {
      const hot = s.cont === 'high';
      const isoRank = { rc: 0, rr: 1, ser: 2 }[s.iso];
      // lost update risk
      let lu, luS;
      if (s.rmw === 'atomic' || s.rmw === 'lock' || s.rmw === 'opt') { lu = 'prevented by ' + { atomic: 'atomic SQL', lock: 'row lock', opt: 'version check' }[s.rmw]; luS = 0.95; }
      else if (isoRank >= 1) { lu = 'prevented: 40001 on concurrent update'; luS = 0.9; }
      else { lu = hot ? 'high: concurrent writers overwrite each other' : 'possible under concurrency'; luS = hot ? 0.05 : 0.3; }
      // write skew / phantom risk (multi-row invariants)
      let ws, wsS;
      if (s.iso === 'ser') { ws = 'prevented by SSI'; wsS = 0.95; }
      else if (s.rmw === 'atomic') { ws = 'only where a constraint encodes the rule'; wsS = 0.7; }
      else if (s.rmw === 'lock') { ws = 'existing rows locked; phantoms still possible'; wsS = 0.5; }
      else { ws = 'possible: ' + (s.iso === 'rr' ? 'SI allows write skew' : 'RC allows it'); wsS = 0.2; }
      // staleness
      const stale = s.route === 'primary' ? ['none: one copy', 0.95] : s.route === 'ryw' ? ['others may lag ≤ 1 s; your own writes visible', 0.75] : ['your own write may be missing', 0.2];
      // abort / retry rate
      const conflict = hot ? 0.6 : 0.01;
      let abort;
      if (s.rmw === 'atomic') abort = s.iso === 'ser' ? conflict * 0.3 : 0;
      else if (s.rmw === 'lock') abort = s.iso === 'rc' ? 0 : conflict * 0.8;
      else if (s.rmw === 'opt') abort = conflict;
      else abort = s.iso === 'rc' ? 0 : conflict * (s.iso === 'ser' ? 1.1 : 1);
      abort = Math.min(0.85, abort);
      // latency and throughput
      let lat = 4;
      if (s.rmw === 'lock') lat += hot ? 30 : 0.5;
      if (s.rmw === 'atomic') lat += hot ? 8 : 0;
      if (s.iso === 'ser') lat += 0.5;
      lat = lat / (1 - abort);
      if (s.route !== 'primary') lat *= 0.9;
      const base = hot ? 3000 : 20000;
      let tput = base * (1 - abort) * (s.rmw === 'lock' && hot ? 0.5 : 1) * (s.iso === 'ser' ? 0.93 : 1) * (s.route === 'primary' ? 0.8 : 1);
      const pct = (x) => (x * 100 < 1 && x > 0 ? (x * 100).toFixed(1) : Math.round(x * 100)) + '%';
      const metrics = [
        { k: 'Lost-update risk', v: lu, s: luS },
        { k: 'Write-skew / phantom risk', v: ws, s: wsS },
        { k: 'Stale-read risk', v: stale[0], s: stale[1] },
        { k: 'Abort / retry rate', v: pct(abort) + ' of transactions', s: abort < 0.02 ? 0.95 : abort < 0.2 ? 0.55 : 0.1, hint: s.rmw === 'opt' ? 'OptimisticLockException' : '40001 / 40P01' },
        { k: 'Latency p50 (incl. retries)', v: '≈ ' + lat.toFixed(1) + ' ms', s: lat < 6 ? 0.95 : lat < 15 ? 0.6 : 0.2 },
        { k: 'Goodput', v: '≈ ' + SD.fmt.num(Math.round(tput)) + ' tx/s', s: Math.min(1, tput / 18000) + 0.05, hint: 'illustrative' }
      ];
      const notes = [];
      if (s.iso === 'rr') notes.push('Postgres REPEATABLE READ is <b>snapshot isolation</b>: stronger than ANSI RR for phantoms, weaker for write skew. Jepsen notes SI and RR are incomparable.');
      if (s.iso === 'ser') notes.push('SSI keeps "readers never block writers" but aborts on dangerous read-write patterns, including some <b>false positives</b>. A retry loop is mandatory.');
      if (s.iso === 'rc' && s.rmw === 'naive') notes.push('This is the <b>Postgres default</b> and the most common source of oversold stock in code reviews.');
      if (s.rmw === 'lock') notes.push('<code>FOR UPDATE</code> locks rows that exist. It cannot lock a <b>row that is not there yet</b>, so check-then-insert still double-books.');
      if (s.rmw === 'opt' && hot) notes.push('Optimistic locking under contention means most attempts are <b>wasted work</b>. Switch to a lock or an atomic statement for hot rows.');
      if (s.route === 'replica') notes.push('Async replicas break <b>read-your-writes</b> and <b>monotonic reads</b> (two reads may hit replicas at different lag).');
      if (s.route !== 'primary' && s.iso === 'ser') notes.push('A standby can run SERIALIZABLE only as <b>read-only, deferrable</b>; the serializable read-write transactions still go to the primary.');
      let verdict;
      if (luS >= 0.9 && wsS >= 0.9 && stale[1] >= 0.75 && abort < 0.2) verdict = '✅ <b>Strong and affordable:</b> serializable invariants, fresh reads where they matter, retries rare.';
      else if (luS < 0.5) verdict = '❌ <b>Lost updates are possible:</b> two buyers can both take the last item. Lock, version, or update atomically.';
      else if (abort >= 0.2) verdict = '⚠ <b>Correct but thrashing:</b> ' + pct(abort) + ' of transactions abort on hot rows. Use atomic SQL or split the hot row.';
      else if (wsS < 0.5) verdict = '⚠ <b>Single-row safe, multi-row rules exposed:</b> write skew can break "at least one on call". Use SERIALIZABLE or a constraint.';
      else if (stale[1] < 0.5) verdict = '⚠ <b>Transactions are fine, reads are not:</b> users may not see their own writes on the replica.';
      else verdict = '👍 <b>Reasonable:</b> the main anomalies are covered; document the remaining gap in the ADR.';
      return {
        metrics, verdict, notes,
        flow: ['cliA>app', 'app>router', s.route === 'primary' ? 'router>primary' : 'router>replica'].concat(s.iso === 'ser' ? ['primary>ssi'] : ['primary>mvcc']),
        labels: {
          iso: { label: { rc: 'READ COMMITTED', rr: 'REPEATABLE READ', ser: 'SERIALIZABLE' }[s.iso], sub: { rc: 'snapshot per statement', rr: 'snapshot isolation', ser: 'SSI' }[s.iso] },
          app: { label: 'Order service', sub: { naive: 'read → decide → write', lock: 'SELECT … FOR UPDATE', opt: '@Version check', atomic: 'UPDATE … WHERE' }[s.rmw] },
          router: { label: 'Read router', sub: { primary: 'all → primary', replica: 'reads → replica', ryw: 'sticky after write' }[s.route] }
        },
        hide: s.iso === 'ser' ? [] : ['ssi'],
        hot: hot ? ['primary'] : [],
        warn: (abort >= 0.2 ? ['retry'] : []).concat(stale[1] < 0.5 ? ['replica'] : []),
        err: luS < 0.5 ? ['primary'] : [],
        ok: s.iso === 'ser' ? ['ssi'] : [],
        badges: { retry: [pct(abort) + ' retry', abort >= 0.2 ? 'err' : abort > 0.02 ? 'warn' : 'ok'], replica: [s.route === 'primary' ? 'unused' : stale[1] < 0.5 ? 'stale reads' : 'bounded', s.route === 'replica' ? 'warn' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Interleave two transactions and run them as Postgres would',
    caption: 'Pick a history: <b>lost update</b>, <b>write skew</b>, <b>phantom</b> or <b>stale replica read</b>. Step through it under <b>READ COMMITTED</b>, <b>REPEATABLE READ</b> (snapshot isolation) or <b>SERIALIZABLE</b> (SSI). The simulator implements MVCC snapshots, row locks with waits, first-updater-wins errors and a simplified SSI check (abort a transaction with both an incoming and an outgoing read-write dependency when the other side has committed). Toggle <b>Fix</b> to apply the targeted remedy. The table shows which models allow the history.'
  },

  realWorld: {
    intro: 'Forty years of definitions, a famous critique of the SQL standard, and test suites that showed vendors\' labels do not mean what you think.',
    timeline: [
      { when: '1979', who: 'Leslie Lamport', title: 'Sequential consistency', text: 'For multiprocessors: the result must be as if all operations ran in <b>some sequential order</b>, with each processor\'s operations in program order. Real time is not required.', src: 0 },
      { when: '1990', who: 'Maurice Herlihy & Jeannette Wing', title: 'Linearizability', text: 'Each operation appears to take effect <b>instantaneously between its invocation and response</b>. Unlike sequential consistency it respects real time and is <b>local</b>: per-object linearizability composes.', src: 1 },
      { when: '1994', who: 'Terry et al. (Xerox PARC, Bayou)', title: 'Session guarantees', text: 'Four guarantees on top of weakly consistent replicas: <b>read your writes, monotonic reads, writes follow reads, monotonic writes</b>, keeping read-any/write-any replication.', src: 2 },
      { when: '1995', who: 'Berenson, Bernstein, Gray, Melton, O\'Neil, O\'Neil', title: 'A Critique of ANSI SQL Isolation Levels', text: 'The SQL-92 definitions, based on three phenomena, are ambiguous and miss real levels. Adds <b>dirty write, lost update, read skew, write skew</b>, and defines <b>snapshot isolation</b>, which avoids the ANSI anomalies yet is not serializable.', src: 3 },
      { when: '1999', who: 'Atul Adya (MIT, PhD thesis)', title: 'Implementation-independent definitions', text: 'Defines isolation levels as forbidden cycles in a <b>dependency graph</b> (G0, G1, G2…), so optimistic and multi-version systems can be judged too. Jepsen\'s checkers use these names.', src: 4 },
      { when: '2008', who: 'Werner Vogels (Amazon)', title: 'Eventually Consistent, Revisited', text: 'If no new updates arrive, all reads eventually return the last value. Names <b>read-your-writes</b> and <b>monotonic reads</b> as the most desirable client-side extras.', src: 5 },
      { when: '2008', who: 'Cahill, Röhm & Fekete', title: 'Serializable Snapshot Isolation', text: 'Detect SI anomalies at runtime by tracking <b>read-write dependencies</b>; abort when two consecutive ones meet at a transaction. Readers still do not block writers.', src: 6 },
      { when: '2012', who: 'Dan Ports & Kevin Grittner', title: 'SSI in PostgreSQL 9.1', text: 'The first SSI in a production release. On their benchmarks SSI costs <b>under 7%</b> versus snapshot isolation and beats two-phase locking on read-heavy workloads; adds a read-only optimisation.', src: 7 },
      { when: '2014', who: 'Martin Kleppmann', title: 'Hermitage', text: 'A test suite that runs the anomaly histories against real databases. It shows that a level\'s <b>name</b> (e.g. REPEATABLE READ) means different things in Postgres, MySQL, Oracle and SQL Server.', src: 8 },
      { when: '2017', who: 'Todd Warszawski & Peter Bailis (Stanford)', title: 'ACIDRain', text: 'Concurrency attacks via normal APIs on 12 self-hosted e-commerce apps: <b>22 vulnerabilities</b> in apps spanning over 2M websites, e.g. overspending gift cards, caused by weak isolation and badly scoped transactions.', src: 9 },
      { when: '2020', who: 'Kyle Kingsbury (Jepsen)', title: 'PostgreSQL 12.3', text: 'Found <b>G2-item</b> anomalies under SERIALIZABLE in normal operation, a bug fixed by the Postgres team; and documents that Postgres REPEATABLE READ is snapshot isolation, which allows G2-item.', src: 10 },
      { when: 'today', who: 'Jepsen', title: 'The consistency map', text: 'One diagram of models and implications, from strict serializable down to read uncommitted and eventual, coloured by which can stay <b>totally available</b> during partitions.', src: 11 }
    ],
    lessons: [
      'Vendor level names are not specs. Ask <b>which anomalies</b> are forbidden, and test with Hermitage-style histories.',
      'The default (Read Committed) allows <b>lost updates and write skew</b>. Every read-modify-write needs an explicit answer.',
      'SERIALIZABLE in Postgres is affordable on low contention, but only with a <b>retry loop</b> around the whole transaction.',
      'Replica reads are a <b>separate</b> axis: session guarantees, not isolation levels, decide whether users see their own writes.'
    ],
    sources: [
      { title: 'How to Make a Multiprocessor Computer That Correctly Executes Multiprocess Programs', url: 'https://www.microsoft.com/en-us/research/?p=338381', pub: 'Leslie Lamport, IEEE Trans. Computers, 1979' },
      { title: 'Linearizability: A Correctness Condition for Concurrent Objects', url: 'https://www.cs.columbia.edu/~wing/publications/HerlihyWing90.pdf', pub: 'Herlihy & Wing, ACM TOPLAS, 1990' },
      { title: 'Session Guarantees for Weakly Consistent Replicated Data', url: 'https://cs.utexas.edu/users/lorenzo/corsi/cs380d/papers/SessionGuaranteesBayou.pdf', pub: 'Terry et al., PDIS 1994' },
      { title: 'A Critique of ANSI SQL Isolation Levels', url: 'https://www.microsoft.com/en-us/research/?p=152222', pub: 'Berenson et al., SIGMOD 1995' },
      { title: 'Weak Consistency: A Generalized Theory and Optimistic Implementations for Distributed Transactions', url: 'https://dspace.mit.edu/handle/1721.1/149899', pub: 'Atul Adya, MIT PhD thesis, 1999' },
      { title: 'Eventually Consistent - Revisited', url: 'https://www.allthingsdistributed.com/2008/12/eventually_consistent.html', pub: 'Werner Vogels, 2008' },
      { title: 'Serializable Isolation for Snapshot Databases', url: 'https://courses.cs.washington.edu/courses/csep544/09sp/resources/fekete-sigmod2008.pdf', pub: 'Cahill, Röhm & Fekete, SIGMOD 2008' },
      { title: 'Serializable Snapshot Isolation in PostgreSQL', url: 'https://arxiv.org/abs/1208.4179', pub: 'Ports & Grittner, VLDB 2012' },
      { title: 'Hermitage: Testing the "I" in ACID', url: 'https://martin.kleppmann.com/2014/11/25/hermitage-testing-the-i-in-acid.html', pub: 'Martin Kleppmann, 2014' },
      { title: 'ACIDRain: Concurrency-Related Attacks on Database-Backed Web Applications', url: 'https://blog.acolyer.org/2017/08/07/acidrain-concurrency-related-attacks-on-database-backed-web-applications/', pub: 'Warszawski & Bailis, SIGMOD 2017 (summary by A. Colyer)' },
      { title: 'Jepsen: PostgreSQL 12.3', url: 'https://jepsen.io/analyses/postgresql-12.3', pub: 'Kyle Kingsbury, 2020' },
      { title: 'Consistency Models', url: 'https://jepsen.io/consistency', pub: 'Jepsen' },
      { title: 'Serialization Failure Handling', url: 'https://www.postgresql.org/docs/16/mvcc-serialization-failure-handling.html', pub: 'PostgreSQL documentation' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Isolation level', '<b>READ COMMITTED</b>: no aborts on read-write patterns, anomalies possible', '<b>SERIALIZABLE (SSI)</b>: no anomalies, ~few % overhead, 40001 retries', 'SERIALIZABLE for multi-row invariants on low-contention data; RC + targeted fixes for hot paths'],
      ['Read-modify-write', '<b>Pessimistic</b> <code>FOR UPDATE</code>: waits, no wasted work', '<b>Optimistic</b> version check: no locks, retry on conflict', 'Pessimistic when conflicts are frequent; optimistic when rare or across user think time'],
      ['Invariant enforcement', '<b>Constraint</b> (unique, exclusion, check)', '<b>Application check</b> inside a transaction', 'Always prefer a constraint when the rule fits one; it holds at every level'],
      ['Snapshot vs per-statement', '<b>RR / SI</b>: stable reads for reports, first-updater-wins', '<b>RC</b>: each statement sees latest commits', 'SI for consistent multi-query reads; remember it still allows write skew'],
      ['Read routing', '<b>Primary</b>: linearizable for single rows, more primary load', '<b>Replica</b>: scales reads, stale by the lag', 'Replicas for browse and reports; primary or LSN-wait for read-after-write'],
      ['Distributed store', '<b>Strict serializable</b> (Spanner, CockroachDB)', '<b>Eventual + session guarantees</b> (Dynamo-style)', 'Strict for money and identity; eventual for feeds, counters, carts with merge']
    ]
  },
  failures: [
    { f: 'Lost update on read-modify-write', detect: 'Counts or balances drift from the ledger; concurrency test with 2 threads reproduces it', fix: 'Atomic <code>UPDATE … SET x = x - 1 WHERE x &gt; 0</code>, <code>FOR UPDATE</code>, <code>@Version</code>, or REPEATABLE READ with retry.' },
    { f: 'Write skew breaks a multi-row rule', detect: 'Invariant check job finds "zero on call", overdrawn joint accounts', fix: 'SERIALIZABLE for that transaction, lock a parent row (the shift) <code>FOR UPDATE</code>, or materialise the rule as a constrained row.' },
    { f: 'Double booking via phantom insert', detect: 'Overlapping bookings for the same room and time', fix: '<code>EXCLUDE USING gist</code> constraint, a unique slot row, or SERIALIZABLE (SSI takes predicate SIREAD locks).' },
    { f: '40001 surfaced as HTTP 500', detect: 'Error logs with "could not serialize access"; spikes at peak', fix: 'Retry the whole transaction (not one statement) with jittered backoff; make the handler idempotent.' },
    { f: 'Retry storm on a hot row', detect: 'Rollback rate &gt; 10%, latency rising with load, CPU on primary high', fix: 'Atomic statements, shorter transactions, split the counter, queue the writes; cap retries.' },
    { f: 'Deadlocks from inconsistent lock order', detect: '<code>40P01 deadlock detected</code> in logs', fix: 'Lock rows in a fixed order (e.g. by id), keep transactions short, retry 40P01.' },
    { f: 'Read-your-writes broken by replicas', detect: 'Users report changes disappearing; reads within seconds of writes hit replicas', fix: 'Sticky primary reads after a write, or wait for replica replay LSN ≥ commit LSN.' }
  ],

  interview: [
    { q: 'Linearizability vs serializability: what is the difference?', a: '<p><b>Linearizability</b> (Herlihy &amp; Wing 1990) is about <b>single operations on single objects</b>: each takes effect at one instant between its start and end, so it respects <b>real time</b>.</p><p><b>Serializability</b> is about <b>transactions over many objects</b>: the outcome equals <i>some</i> serial order, which may not match real time (a transaction may appear to run "in the past").</p><p>Both together is <b>strict serializability</b> (Spanner calls it external consistency). Do not mix up the C in CAP (linearizability) with the C in ACID (application invariants).</p>', lvl: 'core' },
    { q: 'Walk down the replication consistency ladder.', a: '<ul><li><b>Linearizable</b>: one-copy illusion with real-time order.</li><li><b>Sequential</b> (Lamport 1979): one total order consistent with each client\'s program order, not real time.</li><li><b>Causal</b>: operations that are causally related are seen in the same order by everyone; concurrent ones may differ.</li><li><b>Session guarantees</b> (Terry 1994): read-your-writes, monotonic reads, monotonic writes, writes-follow-reads.</li><li><b>Eventual</b>: if writes stop, replicas converge.</li></ul><p>Causal and weaker can stay available in a partition; sequential and stronger cannot be totally available (Jepsen map).</p>', lvl: 'core' },
    { q: 'Name the anomalies and which isolation levels prevent them.', a: '<ul><li><b>Dirty read</b>: prevented from Read Committed up (Postgres never shows uncommitted data; its READ UNCOMMITTED behaves as RC).</li><li><b>Non-repeatable read / read skew</b>: prevented by Repeatable Read and SI.</li><li><b>Lost update</b>: allowed by RC; prevented by SI (first-updater-wins → 40001) and locking RR.</li><li><b>Phantom</b>: allowed by ANSI RR; Postgres RR (SI) does not show phantoms in re-reads.</li><li><b>Write skew</b>: allowed by SI; prevented only by Serializable.</li></ul><p>Source of these names: Berenson et al. 1995, formalised by Adya 1999.</p>', lvl: 'core' },
    { q: 'Explain write skew with an example and how you would prevent it.', a: '<p>Two doctors on call; rule "at least one". Two transactions each count 2, each turns <b>a different doctor</b> off, both commit. No row was written twice, so snapshot isolation\'s first-updater-wins rule does not fire.</p><p>Prevent it with <b>SERIALIZABLE</b> (SSI aborts one with 40001), or lock the shared parent row (<code>SELECT … FROM shift WHERE id = ? FOR UPDATE</code>) so the checks serialise, or materialise the rule as a row or constraint.</p>', fu: 'Why does FOR UPDATE on the doctor rows you read work for this case but not for "no overlapping bookings"? (The rows exist; for bookings, the conflicting row does not exist yet.)', lvl: 'core' },
    { q: 'What do Postgres REPEATABLE READ and SERIALIZABLE actually implement?', a: '<p><b>REPEATABLE READ</b> is <b>snapshot isolation</b>: one snapshot per transaction; a write to a row changed by a concurrent committed transaction fails with <code>40001</code>. It forbids phantoms in re-reads (stronger than ANSI) but allows write skew.</p><p><b>SERIALIZABLE</b> (since 9.1) is <b>SSI</b> (Cahill et al. 2008; Ports &amp; Grittner 2012): SI plus SIREAD (predicate) locks that track read-write dependencies, aborting a transaction that would complete a dangerous structure. No blocking between readers and writers; some false-positive aborts.</p>', lvl: 'deep' },
    { q: 'SELECT … FOR UPDATE or optimistic versioning: how do you choose?', a: '<ul><li><b>FOR UPDATE</b>: locks at read time; others wait. Best when conflicts are <b>frequent</b> and the transaction is short. Risks: lock waits, deadlocks (lock in a fixed order).</li><li><b>Optimistic</b> (<code>@Version</code>, <code>WHERE version = ?</code>, HTTP <code>If-Match</code>): no locks; the loser gets 0 rows / <code>OptimisticLockException</code> and retries. Best when conflicts are <b>rare</b> or the read and the write are separated by user think time.</li><li>Best of all, when possible: one <b>atomic statement</b> (<code>UPDATE … SET stock = stock - 1 WHERE stock &gt; 0</code>).</li></ul>', lvl: 'core' },
    { q: 'How do you write a correct retry for serialization failures in Spring?', a: '<p>Retry <b>outside</b> the transaction boundary: the retrying method calls a separate <code>@Transactional(isolation = SERIALIZABLE)</code> bean method, so each attempt is a new transaction with a new snapshot. Retry on SQLSTATE <code>40001</code> (Spring translates both into subclasses of <code>PessimisticLockingFailureException</code>, under <code>ConcurrencyFailureException</code>) and <code>40P01</code>, with jittered backoff and 3–5 attempts.</p><p>Re-run <b>all</b> the logic that chose values, per the Postgres docs. Make external side effects (emails, payments) happen after commit or be idempotent.</p>', lvl: 'deep' },
    { q: 'A user updates their profile and the page shows the old value. Diagnose.', a: '<p>Almost certainly a <b>read-your-writes</b> violation: the write went to the primary, the follow-up read to an <b>async replica</b> that had not replayed the WAL. Isolation level is irrelevant; this is a replication guarantee.</p><p>Fixes: route the session to the primary for a window after a write; or store the commit LSN and only use a replica whose <code>pg_last_wal_replay_lsn()</code> has passed it; or <code>synchronous_commit = remote_apply</code> on a standby for that flow.</p>', lvl: 'core' },
    { q: 'Is "eventual consistency" ever the right choice for a payment system?', a: '<p>For the <b>ledger and balance check</b>, no: a double spend cannot be merged away. Use a serializable transaction or a single-row atomic conditional update, plus idempotency keys.</p><p>Around it, yes: notifications, analytics, search indexes and the "recent transactions" view can be eventually consistent if they are <b>derived from</b> the ledger (outbox / CDC) and the UI states it.</p>', lvl: 'core' },
    { q: 'You inherit a booking service with occasional double bookings. What do you do?', a: '<ol><li><b>Reproduce</b> with a two-thread test or a Hermitage-style script to name the anomaly (likely check-then-insert phantom under RC).</li><li><b>Fix at the database</b>: an <code>EXCLUDE USING gist (room_id WITH =, during WITH &amp;&amp;)</code> constraint; handle the violation as "slot taken".</li><li>Where no constraint fits, run that transaction SERIALIZABLE with a retry loop.</li><li><b>Clean up</b> existing duplicates, add an invariant check job and an alert.</li></ol>', lvl: 'deep' },
    { q: 'Why can serializable throughput collapse, and what do you do about it?', a: '<p>Abort probability grows with <b>concurrent transactions × rows touched / hot rows</b>. On a hot row, most transactions abort, retries add load, and goodput falls (a retry storm).</p><p>Shorten transactions, avoid network calls inside them, use atomic statements that <b>queue on the row lock</b> instead of aborting, split counters into buckets, and cap retries. Mark long read-only reports <code>READ ONLY DEFERRABLE</code> so SSI never aborts them.</p>', lvl: 'deep' },
    { q: 'How would you convince a team to move a flow from READ COMMITTED to SERIALIZABLE?', a: '<p>Show the bug, not the theory: a <b>two-transaction script</b> that breaks the invariant under RC, and the same script failing safely under SERIALIZABLE. Quote the cost: Ports &amp; Grittner measured under 7% versus SI on their benchmarks, then <b>measure ours</b> with a load test, tracking the 40001 rate.</p><p>Limit the blast radius: only the flows with multi-row invariants, a shared retry helper, a metric and an ADR. Keep RC + atomic SQL for hot counters.</p>', fu: 'What would make you roll back? (Retry rate above the SLO, or p99 latency regressions on the flow.)', lvl: 'core' }
  ],

  code: [
    {
      title: 'Spring Boot 3: SERIALIZABLE with retry on 40001', lang: 'java',
      code: `// Retry lives OUTSIDE the transaction: every attempt gets a fresh snapshot.
@Service
public class ShiftService {
  private final ShiftTx tx;
  public ShiftService(ShiftTx tx) { this.tx = tx; }

  public void goOffCall(long shiftId, long doctorId) {
    for (int attempt = 1; ; attempt++) {
      try {
        tx.goOffCall(shiftId, doctorId);
        return;
      } catch (ConcurrencyFailureException e) {   // 40001 / 40P01 map here
        if (attempt == 3) throw e;
        long backoff = (long) (Math.pow(2, attempt) * 10 * (0.5 + Math.random()));
        try { Thread.sleep(backoff); } catch (InterruptedException ie) {
          Thread.currentThread().interrupt(); throw e;
        }
      }
    }
  }
}

@Component
class ShiftTx {
  private final JdbcTemplate jdbc;
  ShiftTx(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  @Transactional(isolation = Isolation.SERIALIZABLE)
  public void goOffCall(long shiftId, long doctorId) {
    Integer onCall = jdbc.queryForObject(
        "SELECT count(*) FROM doctors WHERE shift_id = ? AND on_call", Integer.class, shiftId);
    if (onCall == null || onCall < 2) throw new IllegalStateException("last doctor on call");
    jdbc.update("UPDATE doctors SET on_call = false WHERE id = ? AND shift_id = ?", doctorId, shiftId);
  }
}`,
      note: 'Spring translates Postgres <code>40001</code> and <code>40P01</code> into subclasses of <code>PessimisticLockingFailureException</code>, itself a <code>ConcurrencyFailureException</code>. The transactional method is on a separate bean so the Spring proxy applies. Spring Retry\'s <code>@Retryable</code> does the same, provided it wraps the <code>@Transactional</code> call from outside.'
    },
    {
      title: 'Postgres: reproduce write skew, then fix it', lang: 'sql',
      code: `CREATE TABLE doctors (id int PRIMARY KEY, shift_id int, name text, on_call bool);
INSERT INTO doctors VALUES (1, 1, 'alice', true), (2, 1, 'bob', true);

-- Session A                                   -- Session B
BEGIN ISOLATION LEVEL REPEATABLE READ;         BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) FROM doctors                   SELECT count(*) FROM doctors
 WHERE shift_id = 1 AND on_call;  -- 2          WHERE shift_id = 1 AND on_call;  -- 2
UPDATE doctors SET on_call = false             UPDATE doctors SET on_call = false
 WHERE id = 1;                                  WHERE id = 2;
COMMIT;                                        COMMIT;   -- succeeds: nobody on call

-- Same script with BEGIN ISOLATION LEVEL SERIALIZABLE:
--   Session B's COMMIT fails:
--   ERROR: could not serialize access due to read/write dependencies
--          among transactions   (SQLSTATE 40001)

-- Targeted fix at READ COMMITTED: serialise on the parent row
BEGIN;
SELECT 1 FROM shifts WHERE id = 1 FOR UPDATE;   -- B waits here until A commits
SELECT count(*) FROM doctors WHERE shift_id = 1 AND on_call;
UPDATE doctors SET on_call = false WHERE id = 2;
COMMIT;

-- Phantom-proof bookings: no lock needed, the constraint decides
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE booking (id bigserial PRIMARY KEY, room_id int, during tstzrange,
  EXCLUDE USING gist (room_id WITH =, during WITH &&));`,
      note: 'Run the two columns in two psql sessions, statement by statement. The SERIALIZABLE error may also appear on the second UPDATE instead of COMMIT, depending on timing. The <code>shifts</code> table is assumed to exist with one row per shift.'
    },
    {
      title: 'JPA: optimistic locking with @Version', lang: 'java',
      code: `@Entity
public class Account {
  @Id private Long id;
  private long balanceCents;
  @Version private long version;        // JPA adds "AND version = ?" to every UPDATE

  public void withdraw(long cents) {
    if (cents > balanceCents) throw new IllegalStateException("insufficient funds");
    balanceCents -= cents;
  }
}

public interface AccountRepo extends JpaRepository<Account, Long> {}

@Service
public class WithdrawService {
  private final AccountRepo repo;
  public WithdrawService(AccountRepo repo) { this.repo = repo; }

  @Retryable(retryFor = ObjectOptimisticLockingFailureException.class,
             maxAttempts = 3, backoff = @Backoff(delay = 20, multiplier = 2, random = true))
  @Transactional
  public void withdraw(long accountId, long cents) {
    Account a = repo.findById(accountId).orElseThrow();
    a.withdraw(cents);
    // flush at commit: UPDATE account SET balance_cents=?, version=version+1
    //                  WHERE id=? AND version=?   -> 0 rows => exception, retry
  }
}`,
      note: 'Requires <code>spring-retry</code> and <code>@EnableRetry</code>. <code>@EnableRetry</code> orders its advice just before the transaction advice by default, so each attempt starts a new transaction and re-reads the row. Works at READ COMMITTED: the version check, not the isolation level, prevents the lost update.'
    }
  ],

  related: ['cap-pacelc', 'consensus-theory', 'sd:distributed-sql', 'sd:kv-store', 'sd:payment-gateway', 'sd:ticket-booking']
});
