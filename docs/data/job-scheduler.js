SD.register({
  slug: 'job-scheduler',
  domain: 6,
  title: 'Job Queue & Task Scheduler',
  examples: 'Airflow, Temporal, Celery',
  tagline: 'Run millions of background jobs, crons and DAGs <b>on time and at least once</b>, even while workers crash, schedulers fail over and networks hiccup.',
  tldr: {
    problem: 'Work must happen later, on a schedule, or in dependency order, spread over many workers. Any worker can die halfway through a task.',
    idea: 'Store jobs durably. Workers <b>claim</b> a job with a time-limited <b>lease</b> and keep it alive with heartbeats. If the lease expires, the job goes back to the queue. Several schedulers share the work through <b>row locks</b> (<code>SKIP LOCKED</code>).',
    insight: 'You cannot get exactly-once <i>execution</i>. You get <b>at-least-once delivery + idempotent tasks</b>, which together give an exactly-once <i>effect</i>.',
    numbers: [
      { v: '9,000/s', l: 'tasks scheduled by Dropbox ATF (InfoQ, 2020)' },
      { v: '≥ 2', l: 'schedulers Astronomer recommends for HA (Airflow 2)' },
      { v: '9.5', l: 'Postgres version that added SKIP LOCKED (2016)' }
    ]
  },

  intro: {
    what: 'A job queue and task scheduler runs work <b>in the background</b>, away from the request a user is waiting on. Apps hand it jobs such as "send this email", "resize this video" or "build the sales report at 2 am". It stores each job safely, gives it to one of many worker machines, and <b>retries it</b> if something fails.',
    analogy: {
      icon: '🧾',
      title: 'Order tickets on a restaurant rail',
      text: 'Waiters clip order tickets to a rail, and any free cook takes the next one. If a cook walks out mid-dish, the ticket goes back on the rail for someone else. Some tickets say "start at 7 pm" or "dessert only after the mains", which is what schedules and dependencies are. One difference matters: the system often cannot tell whether a vanished cook finished the dish, so every job must be safe to do twice.'
    },
    problem: 'A shop sends a receipt email after each order and builds a sales report every night. If the web server does this inline, a slow mail provider makes checkout slow, and a crash halfway loses the email for good. The nightly report must not be skipped or started twice, even if the machine that triggers it is rebooting at 2 am. The question is: <b>how do you run every job on time and at least once, when any machine can die mid-task?</b>',
    story: [
      {
        stage: 'naive',
        title: 'One cron server that runs everything',
        text: 'A single server runs <b>cron</b>, the classic Unix timer, plus a loop that reads a jobs table and runs each job itself. It is easy to build, and fine for a few jobs a minute.',
        scene: {
          nodes: [
            { id: 'app', label: 'Web app', sub: 'adds jobs', kind: 'client', at: [70, 0] },
            { id: 'db', label: 'Jobs table', sub: 'one row per job', kind: 'store', at: [210, 0] },
            { id: 'sch', label: 'Cron server', sub: 'timer + runner', kind: 'service', at: [210, 110] },
            { id: 'ext', label: 'Email / APIs', sub: 'side effects', kind: 'external', at: [350, 110] }
          ],
          edges: [{ from: 'app', to: 'db' }, { from: 'db', to: 'sch' }, { from: 'sch', to: 'ext' }],
          flow: ['app>db', 'db>sch', 'sch>ext']
        }
      },
      {
        stage: 'breaks',
        title: 'The server dies, and its jobs die with it',
        text: 'Jobs arrive faster than one machine can run them, so a backlog grows. When the server crashes mid-job, nobody knows the job was half done, so it is <b>silently lost</b>. While the server is down no cron fires at all, and the 2 am report simply never runs.',
        scene: {
          nodes: [
            { id: 'app', label: 'Web app', sub: 'adds jobs', kind: 'client', at: [70, 0] },
            { id: 'db', label: 'Jobs table', sub: 'jobs pile up', kind: 'store', at: [210, 0] },
            { id: 'sch', label: 'Cron server', sub: 'crashed mid-job', kind: 'service', at: [210, 110] },
            { id: 'ext', label: 'Email / APIs', sub: 'never called', kind: 'external', at: [350, 110] }
          ],
          edges: [{ from: 'app', to: 'db' }, { from: 'db', to: 'sch' }, { from: 'sch', to: 'ext' }],
          flow: ['app>db', 'app>db', 'db>sch'],
          err: ['sch'],
          warn: ['db'],
          badges: { sch: ['down', 'err'], db: ['backlog', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Durable jobs, leased to many workers',
        text: 'Keep every job in a <b>durable job store</b>. Two schedulers share the work of marking due jobs as ready. Any worker can claim a job with a time-limited <b>lease</b> and renews it with heartbeats while it works. If a worker goes quiet, the lease expires and another worker retries the job. Jobs are written to be <b>idempotent</b>, so a second run does no harm.',
        scene: {
          nodes: [
            { id: 'app', label: 'Web app', sub: 'adds jobs', kind: 'client', at: [70, 0] },
            { id: 'db', label: 'Job store', sub: 'durable', kind: 'store', at: [210, 0] },
            { id: 'sch', label: 'Schedulers ×2', sub: 'cron · due jobs', kind: 'service', at: [350, 0] },
            { id: 'q', label: 'Task queue', sub: 'ready + leases', kind: 'queue', at: [210, 110] },
            { id: 'w1', label: 'Worker A', sub: 'lease + heartbeat', kind: 'compute', at: [70, 220] },
            { id: 'w2', label: 'Worker B', sub: 'lease + heartbeat', kind: 'compute', at: [210, 220] },
            { id: 'w3', label: 'Worker C', sub: 'lease + heartbeat', kind: 'compute', at: [350, 220] }
          ],
          edges: [{ from: 'app', to: 'db' }, { from: 'sch', to: 'db', bidi: true }, { from: 'sch', to: 'q' }, { from: 'q', to: 'w1', bidi: true }, { from: 'q', to: 'w2', bidi: true }, { from: 'q', to: 'w3', bidi: true }],
          flow: ['app>db', 'sch>db', 'sch>q', ['q>w1', 'q>w2', 'q>w3']],
          ok: ['w1', 'w2', 'w3'],
          badges: { q: ['no job lost', 'ok'] }
        }
      }
    ],
    usedBy: ['Apache Airflow (created at Airbnb)', 'Celery (Python)', 'Sidekiq (Ruby)', 'Temporal', 'Uber Cadence', 'Kubernetes CronJobs'],
    whenToUse: [
      'Work is slow or unreliable (emails, video, third-party APIs) and should not block a user request',
      'Tasks must run <b>on a schedule</b>, or only after other tasks finish (nightly data pipelines)',
      'A lost or skipped task costs money or trust, so you need retries and a record of every attempt'
    ],
    whenNot: [
      'You want to broadcast one event to many consumers (see <a href="message-queue.html">Message Queue</a>)',
      'You compute live numbers over an endless event stream (see <a href="stream-analytics.html">Stream Analytics</a>)',
      'A few jobs a day on one machine: plain cron is enough'
    ],
    glossary: [
      { term: 'Worker', def: 'A process that takes jobs from the queue and runs them.' },
      { term: 'Lease / visibility timeout', def: 'A time-limited claim on a job. If the worker does not finish or renew it in time, the job becomes available again.' },
      { term: 'Heartbeat', def: 'A small "I am still alive" message a worker sends to extend its lease.' },
      { term: 'At-least-once delivery', def: 'Every job is guaranteed to run, but after a failure it may run twice.' },
      { term: 'Idempotent', def: 'Safe to repeat: running the task a second time has the same effect as running it once.' },
      { term: 'DAG', def: 'Directed acyclic graph: tasks joined by "run B after A" arrows, with no loops.' },
      { term: 'Dead-letter queue', def: 'Where a job goes after failing too many times, so a human can inspect it.' },
      { term: 'SKIP LOCKED', def: 'A Postgres clause that lets many workers each claim a different row without waiting on each other.' }
    ]
  },

  requirements: {
    functional: [
      'Submit a job now, at a time, or on a cron schedule',
      'Define DAGs: run a task when its upstream tasks succeed',
      'Retries with exponential backoff and a max-attempt limit',
      'Dead-letter queue for jobs that keep failing',
      'Priorities and per-tenant fairness',
      'Query status, logs and results; cancel or re-run'
    ],
    nonFunctional: [
      'No job silently lost (durable before ack)',
      'At-least-once execution; duplicates are rare and safe',
      'Cron fires on time (seconds of jitter, not minutes)',
      'Scheduler has no single point of failure',
      'Scale workers horizontally to 10⁴+ tasks/s',
      'Fast detection of dead workers (seconds to minutes)'
    ],
    outOfScope: ['Stream processing (see Stream Analytics)', 'Message fan-out pub/sub (see Message Queue)', 'Resource scheduling of containers (Kubernetes, YARN)']
  },

  calculator: {
    inputs: [
      { id: 'jobs', label: 'Jobs per day', min: 100000, max: 10000000000, value: 100000000, log: true },
      { id: 'dur', label: 'Average task run time', min: 0.1, max: 3600, value: 20, unit: 's', log: true },
      { id: 'peak', label: 'Peak-to-average ratio (top-of-hour crons)', min: 1, max: 30, value: 6, unit: '×' },
      { id: 'retry', label: 'Retry rate', min: 0, max: 30, value: 3, unit: '%' },
      { id: 'payload', label: 'Row size (payload + metadata)', min: 200, max: 100000, value: 1500, fmt: 'bytes', log: true },
      { id: 'days', label: 'Keep finished jobs for', min: 1, max: 90, value: 14, unit: 'days' }
    ],
    outputs: [
      { label: 'Average dequeue rate (incl. retries)', unit: '/s', f: (v) => v.jobs * (1 + v.retry / 100) / 86400 },
      { label: 'Peak dequeue rate', unit: '/s', f: (v) => v.jobs * (1 + v.retry / 100) / 86400 * v.peak },
      { label: 'Busy worker slots at peak (Little\'s law)', f: (v) => v.jobs * (1 + v.retry / 100) / 86400 * v.peak * v.dur },
      { label: 'Heartbeat writes/s (every 10 s)', unit: '/s', f: (v) => v.jobs * (1 + v.retry / 100) / 86400 * v.peak * v.dur / 10 },
      { label: 'Rows retained', f: (v) => v.jobs * (1 + v.retry / 100) * v.days },
      { label: 'Job-store size (one copy)', fmt: 'bytes', f: (v) => v.jobs * (1 + v.retry / 100) * v.days * v.payload }
    ],
    note: 'Little\'s law: <b>slots in use = arrival rate × time in system</b>. All inputs are <em>estimates</em> to play with. Notice how long tasks, not job count, drive worker and heartbeat load. A single Postgres primary handles thousands of claim/complete pairs per second (<em>estimate</em>, depends heavily on hardware and batching).'
  },

  api: [
    { m: 'POST', p: '/v1/jobs', d: 'Enqueue <code>{queue, type, payload, run_at?, priority?, dedupe_key?}</code>. A unique <code>dedupe_key</code> makes submit idempotent.' },
    { m: 'POST', p: '/v1/schedules', d: 'Register a cron: <code>{cron: "*/5 * * * *", tz, job_template, overlap: skip|allow}</code>.' },
    { m: 'POST', p: '/v1/dags/{id}/runs', d: 'Trigger a DAG run for a logical date. Backfills create one run per missing date.' },
    { m: 'RPC', p: 'Worker.claim(queue, n, lease) → jobs', d: 'Atomically take up to n ready jobs and set <code>lease_until</code>. Postgres: <code>FOR UPDATE SKIP LOCKED</code>.' },
    { m: 'RPC', p: 'Worker.heartbeat(job, attempt) / complete / fail', d: 'Extend the lease, or finish. The <code>attempt</code> number acts as a <b>fencing token</b>, so stale workers are rejected.' },
    { m: 'GET', p: '/v1/jobs/{id}', d: 'Status, attempts, last error, result pointer.' }
  ],
  dataModel: [
    { name: 'jobs', store: 'Postgres (job store)', fields: [['id', 'bigserial', 'pk'], ['queue, priority, run_at', 'partial idx where queued', 'idx'], ['status', 'queued|running|done|dead'], ['attempts / max_attempts', 'int'], ['locked_by, lease_until', 'text, timestamptz'], ['dedupe_key', 'text unique', 'idx'], ['payload', 'jsonb']], note: 'One row per job. A partial index on ready rows keeps claims fast as finished rows pile up.' },
    { name: 'task_runs', store: 'Postgres (DAG state)', fields: [['run_id, task_id', 'composite', 'pk'], ['state', 'none|queued|running|success|failed'], ['try_number', 'int'], ['upstream', 'task_deps table', 'fk']], note: 'Like Airflow\'s task instances. A task becomes ready when all upstream rows are success.' },
    { name: 'schedules', store: 'Postgres', fields: [['schedule_id', 'uuid', 'pk'], ['cron, tz', 'text'], ['next_fire_at', 'timestamptz', 'idx'], ['last_run_key', 'text unique']], note: '<code>UNIQUE(schedule_id, fire_time)</code> makes it impossible to create a cron run twice.' }
  ],

  architecture: {
    title: 'Job queue & scheduler architecture',
    nodes: [
      { id: 'cli', label: 'Producers', sub: 'apps · UI · CLI', kind: 'client', wide: [90, 0], tall: [70, 0], tip: 'Services that enqueue jobs, users who trigger DAGs, and CI pipelines.' },
      { id: 'api', label: 'Job API', sub: 'submit · cron · DAG', kind: 'edge', wide: [290, 0], tall: [210, 0], tip: 'Validates, deduplicates (dedupe_key) and writes the job durably before returning 202.' },
      { id: 'jdb', label: 'Job store', sub: 'Postgres: jobs, runs', kind: 'store', wide: [500, 0], tall: [350, 0], tip: 'Source of truth for jobs, schedules, DAG runs and task state. Schedulers coordinate through row locks here.' },
      { id: 'sch2', label: 'Scheduler #2', sub: 'active · row locks', kind: 'service', wide: [710, 0], tall: [350, 105], tip: 'A second scheduler. In Airflow 2 every scheduler is active, and they avoid double work with SELECT … FOR UPDATE SKIP LOCKED on the metadata DB.' },
      { id: 'dag', label: 'DAG resolver', sub: 'deps → ready tasks', kind: 'compute', wide: [290, 115], tall: [70, 105], tip: 'Given finished tasks, finds tasks whose upstream dependencies have all succeeded.' },
      { id: 'sch', label: 'Scheduler', sub: 'cron · due jobs', kind: 'service', wide: [500, 115], tall: [210, 105], tip: 'Loops: find due crons and runnable tasks, lock them, mark them queued and push them to the queue.' },
      { id: 'dlq', label: 'Dead letters', sub: 'after max attempts', kind: 'queue', wide: [90, 230], tall: [70, 315], tip: 'Jobs that failed max_attempts times. A human or a tool inspects, fixes and re-drives them.' },
      { id: 'reaper', label: 'Lease reaper', sub: 'expired → requeue', kind: 'service', wide: [290, 230], tall: [70, 210], tip: 'Finds running jobs whose lease expired (worker dead or stuck) and makes them claimable again, or dead-letters them.' },
      { id: 'q', label: 'Task queue', sub: 'ready tasks + leases', kind: 'queue', wide: [500, 230], tall: [210, 210], tip: 'Redis/RabbitMQ (Celery), Kafka, or the jobs table itself with SKIP LOCKED.' },
      { id: 'w1', label: 'Worker A', sub: 'lease + heartbeat', kind: 'compute', wide: [710, 230], tall: [210, 315], tip: 'Claims a task with a lease, heartbeats while running, then acks with its attempt number.' },
      { id: 'w2', label: 'Worker B', sub: 'lease + heartbeat', kind: 'compute', wide: [710, 345], tall: [350, 315], tip: 'Identical worker. Scale the pool on queue depth and age of the oldest job.' },
      { id: 'res', label: 'Result store', sub: 'status · outputs', kind: 'store', wide: [910, 175], tall: [350, 210], tip: 'Task results and final state. The scheduler reads completions to unblock downstream DAG tasks.' },
      { id: 'ext', label: 'Side effects', sub: 'email · payments · APIs', kind: 'external', wide: [910, 345], tall: [350, 420], tip: 'The outside world. Pass an idempotency key so a duplicate run does not charge or email twice.' }
    ],
    edges: [
      { from: 'cli', to: 'api' },
      { from: 'api', to: 'jdb' },
      { from: 'sch', to: 'jdb', bidi: true },
      { from: 'sch2', to: 'jdb', bidi: true, dashed: true },
      { from: 'sch', to: 'dag' },
      { from: 'sch', to: 'q' },
      { from: 'q', to: 'w1', bidi: true },
      { from: 'q', to: 'w2', bidi: true },
      { from: 'reaper', to: 'q', bidi: true },
      { from: 'reaper', to: 'dlq' },
      { from: 'w1', to: 'res' },
      { from: 'w2', to: 'res' },
      { from: 'w1', to: 'ext' },
      { from: 'w2', to: 'ext' },
      { from: 'res', to: 'sch', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'dag', title: 'DAG run with dependencies', tone: 'info',
      steps: [
        { text: 'At 02:00 the nightly DAG is due. The scheduler <b>locks the DAG-run row</b> so no other scheduler creates it too.', flow: ['sch>jdb'], badges: { jdb: 'run 2026-10-30' } },
        { text: 'The resolver checks dependencies: <code>extract</code> has no upstream tasks, so it is the only ready task.', flow: ['sch>dag'], badges: { dag: 'ready: extract' } },
        { text: '<code>extract</code> succeeds, so <code>clean_a</code> and <code>clean_b</code> both become ready and run <b>in parallel</b> on two workers.', flow: ['sch>q', ['q>w1', 'q>w2']], badges: { w1: 'clean_a', w2: 'clean_b' } },
        { text: 'Each worker writes its result and state. The scheduler sees the completions.', flow: [['w1>res', 'w2>res'], 'res>sch'], badges: { res: '2/2 success' }, tone: 'ok' },
        { text: '<code>load</code> needed both, so now it is ready. One queued, one run, and the DAG run is marked success.', flow: ['sch>dag', 'sch>q', 'q>w1', 'w1>res'], badges: { w1: 'load' }, ok: ['res'], tone: 'ok' }
      ]
    },
    {
      id: 'crash', title: 'Worker dies mid-task', tone: 'err',
      steps: [
        { text: 'Worker A claims <code>resize_video#88</code> with a <b>60 s lease</b> and heartbeats every 20 s.', flow: ['q>w1'], badges: { w1: 'lease 60 s' } },
        { text: 'The node is OOM-killed. There is no ack and no "I failed" message, just <b>silence</b>.', nodes: ['w1'], err: ['w1'], badges: { w1: ['dead', 'err'] }, tone: 'err' },
        { text: 'The lease expires. The <b>reaper</b> runs <code>UPDATE … SET status = \'queued\' WHERE lease_until &lt; now()</code>.', flow: ['reaper>q'], err: ['w1'], badges: { reaper: ['expired', 'warn'] }, tone: 'warn' },
        { text: 'Worker B claims it as <b>attempt 2</b> and finishes. Detection time is about the lease length, which is why leases with heartbeats beat a long fixed timeout.', flow: ['q>w2', 'w2>res'], err: ['w1'], badges: { w2: ['attempt 2', 'ok'] }, tone: 'ok' },
        { text: 'A <b>poison job</b> that crashes every worker is moved to the dead-letter queue after <code>max_attempts</code>, so it cannot keep killing the fleet.', flow: ['reaper>dlq'], badges: { dlq: ['attempt 5 → DLQ', 'err'] } }
      ]
    },
    {
      id: 'dup', title: 'Duplicate run + idempotency', tone: 'warn',
      steps: [
        { text: 'Worker A claims <code>charge_order#7</code> with a 60 s lease.', flow: ['q>w1'], badges: { w1: 'attempt 1' } },
        { text: 'A 90 s GC pause or network partition. A is <b>alive but silent</b>, so its lease expires.', nodes: ['w1'], warn: ['w1'], badges: { w1: ['paused', 'warn'] }, tone: 'warn' },
        { text: 'The reaper requeues the job and Worker B runs <b>attempt 2</b>. Both workers now believe they own the job.', flow: ['reaper>q', 'q>w2', 'w2>ext'], warn: ['w1'], badges: { w2: 'attempt 2' }, tone: 'warn' },
        { text: 'A wakes and also calls the payment API. Both calls carry the <b>same idempotency key</b> (<code>order-7</code>), so the provider returns the first result and nobody is charged twice.', flow: [['w1>ext', 'w2>ext']], ok: ['ext'], badges: { ext: ['dedup by key', 'ok'] } },
        { text: '<b>Fencing:</b> completion is <code>UPDATE … WHERE id = 7 AND attempts = 1</code>. A\'s stale write matches 0 rows and is rejected.', flow: ['w1>res'], err: ['w1'], ok: ['res'], badges: { res: ['stale attempt 1 rejected', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'cron', title: 'Midnight cron stampede', tone: 'warn',
      steps: [
        { text: 'At 00:00 UTC, <b>a million</b> daily schedules become due in the same second.', nodes: ['jdb', 'sch'], warn: ['jdb'], badges: { jdb: ['1M due', 'warn'] }, tone: 'warn' },
        { text: 'Both schedulers claim in batches: <code>WHERE next_fire_at &lt;= now() ORDER BY next_fire_at LIMIT 500 FOR UPDATE SKIP LOCKED</code>. Each skips the other\'s locked rows, so there is no overlap.', flow: [['sch>jdb', 'sch2>jdb']], badges: { sch: '500 rows', sch2: '500 rows' } },
        { text: '<code>UNIQUE(schedule_id, fire_time)</code> guarantees each cron tick creates exactly <b>one</b> run, even after a retry.', nodes: ['jdb'], ok: ['jdb'], badges: { jdb: ['no dup runs', 'ok'] } },
        { text: 'Queue depth spikes. Workers autoscale on <b>age of the oldest ready job</b>, and low-priority crons get a <b>jitter</b> (hash(id) mod 10 min) so the next night is smoother.', flow: ['sch>q', ['q>w1', 'q>w2']], warn: ['q'], badges: { q: ['depth 1M', 'warn'] } }
      ]
    },
    {
      id: 'failover', title: 'Scheduler crashes', tone: 'err',
      steps: [
        { text: 'Scheduler #1 dies while it holds row locks on 500 due jobs.', nodes: ['sch'], err: ['sch'], badges: { sch: ['crash', 'err'] }, tone: 'err' },
        { text: 'Its DB session ends, so Postgres <b>releases its locks</b> right away. Those rows are claimable again. Nothing was half-committed because each claim was one transaction.', nodes: ['jdb'], err: ['sch'], ok: ['jdb'], badges: { jdb: ['locks freed', 'ok'] } },
        { text: '<b>Active-active</b> (Airflow 2): scheduler #2 was already working and picks up the slack with no election. <b>Active-passive</b> would wait for a leader lease to expire first.', flow: ['sch2>jdb'], err: ['sch'], ok: ['sch2'], badges: { sch2: ['takes over', 'ok'] }, tone: 'ok' },
        { text: 'Workers never noticed: they talk to the queue and the job store, not to a particular scheduler.', flow: ['q>w1', 'w1>res'], err: ['sch'], ok: ['w1'] }
      ]
    }
  ],

  knobs: {
    intro: 'Choose a queue backend, delivery semantics, scheduler HA and lease timing. The meters show what you gain and what can go wrong.',
    diagram: null,
    controls: [
      { id: 'backend', label: 'Queue backend', type: 'seg', value: 'pg', options: [
        { v: 'redis', l: 'Redis / RabbitMQ (Celery)' }, { v: 'kafka', l: 'Kafka topic' }, { v: 'pg', l: 'Postgres SKIP LOCKED' }] },
      { id: 'delivery', label: 'Delivery & liveness', type: 'seg', value: 'hb', options: [
        { v: 'amo', l: 'At-most-once (ack on receive)' }, { v: 'alo', l: 'At-least-once, fixed timeout' }, { v: 'hb', l: 'At-least-once, lease + heartbeat' }] },
      { id: 'ha', label: 'Scheduler HA', type: 'seg', value: 'active', options: [
        { v: 'single', l: 'Single scheduler' }, { v: 'leader', l: 'Leader election (standby)' }, { v: 'active', l: 'Active-active (row locks)' }] },
      { id: 'lease', label: 'Lease / visibility timeout', type: 'range', min: 5, max: 900, step: 5, value: 60, unit: 's' },
      { id: 'p99', label: 'Task run time p99', type: 'range', min: 10, max: 1800, step: 10, value: 120, unit: 's' }
    ],
    evaluate(s) {
      const B = {
        redis: { thr: 'tens of K/s per broker', st: 0.8, feat: 'retries, ETA, priorities via the library', sf: 0.7, ops: 'one more stateful system', so: 0.7, q: { label: 'Redis / RabbitMQ', sub: 'queue + unacked set' } },
        kafka: { thr: '100K+/s (partitioned log)', st: 0.95, feat: 'no per-job ack, delay or priority; a slow job blocks its partition', sf: 0.25, ops: 'cluster + consumer groups', so: 0.45, q: { label: 'Kafka topic', sub: 'partitions + offsets' } },
        pg: { thr: '~1–10K/s per primary (est.)', st: 0.55, feat: 'any SQL: run_at, priority, dedupe, same txn as business data', sf: 0.92, ops: 'reuse the DB you already run', so: 0.9, q: { label: 'jobs table', sub: 'FOR UPDATE SKIP LOCKED' } }
      }[s.backend];
      const fixed = s.delivery === 'alo', hb = s.delivery === 'hb', amo = s.delivery === 'amo';
      const short = fixed && s.lease < s.p99;
      const metrics = [
        { k: 'Throughput ceiling', v: B.thr, s: B.st, hint: 'illustrative' },
        { k: 'Lost on worker crash', v: amo ? 'yes: the task is gone' : 'none: redelivered', s: amo ? 0.1 : 0.95 },
        { k: 'Duplicate runs', v: amo ? 'never' : short ? 'likely: lease < task p99' : hb ? 'only after real failures' : 'only after crashes', s: amo ? 0.95 : short ? 0.12 : hb ? 0.8 : 0.65 },
        { k: 'Dead-worker detection', v: amo ? 'n/a (no retry)' : '≈ ' + s.lease + ' s', s: amo ? 0.2 : s.lease <= 30 ? 0.9 : s.lease <= 180 ? 0.65 : 0.3 },
        { k: 'Scheduler failover', v: { single: 'manual: crons stop until restart', leader: 'after leader lease expires (~10–30 s)', active: '≈ 0: peers keep scheduling' }[s.ha], s: { single: 0.12, leader: 0.7, active: 0.95 }[s.ha] },
        { k: 'Job features', v: B.feat, s: B.sf },
        { k: 'Ops cost', v: B.ops + (s.ha === 'leader' ? ' + election' : ''), s: B.so - (s.ha === 'leader' ? 0.1 : 0) }
      ];
      const notes = [];
      if (s.backend === 'kafka') notes.push('Kafka tracks <b>one offset per partition</b>, not one ack per job. A long or stuck job blocks every job behind it in that partition, and there are no per-message delays or priorities. Use it to feed a scheduler, not as the job queue itself.');
      if (s.backend === 'pg') notes.push('<code>FOR UPDATE SKIP LOCKED</code> (Postgres 9.5+) lets N workers claim different rows with no blocking. You can enqueue a job <b>in the same transaction</b> as the business write, so there are no lost or phantom jobs.');
      if (s.backend === 'redis') notes.push('Celery + Redis redelivers unacked tasks after <code>visibility_timeout</code>. With <code>acks_late</code> a task that runs longer than the timeout gets a <b>second copy</b> while the first is still running.');
      if (short) notes.push('Lease ' + s.lease + ' s is shorter than task p99 ' + s.p99 + ' s, so healthy long tasks are redelivered mid-run. Raise the timeout above p99, or switch to heartbeats.');
      if (hb) notes.push('With heartbeats the lease only measures <b>silence</b>, so it can be short (detect death in ' + s.lease + ' s) even for hour-long tasks. Temporal and Dropbox ATF both work this way.');
      if (fixed && !short) notes.push('A fixed timeout above p99 avoids false redelivery, but a crashed worker\'s job then waits up to ' + s.lease + ' s before anyone retries it.');
      if (amo) notes.push('At-most-once is fine only for disposable work (cache warmers, metrics pings). Anything that matters must be at-least-once and idempotent.');
      if (s.ha === 'single') notes.push('One scheduler is a single point of failure for every cron and DAG.');
      let verdict;
      if (amo) verdict = '⚠ <b>Work silently disappears when a worker dies.</b> Use at-least-once with idempotent tasks.';
      else if (short) verdict = '❌ <b>The lease is shorter than the task.</b> Running tasks get duplicated. Lengthen it or heartbeat.';
      else if (s.backend === 'kafka') verdict = '⚠ <b>A log is not a job queue.</b> Head-of-line blocking and no per-job retries. Put a real queue or table behind it.';
      else if (s.ha === 'single') verdict = '⚠ <b>The scheduler is a SPOF.</b> Add a second scheduler (active-active with row locks is simplest).';
      else if (s.backend === 'pg' && hb && s.ha === 'active') verdict = '✅ <b>Simple and robust:</b> a Postgres job table with SKIP LOCKED, leases with heartbeats, idempotent tasks and several active schedulers (Airflow 2 style). It is enough for thousands of jobs per second.';
      else if (s.backend === 'redis') verdict = '👍 <b>The classic Celery/Sidekiq setup.</b> It has high throughput. Keep tasks idempotent and the visibility timeout above p99.';
      else verdict = '👍 Workable. Check the duplicate and failover meters for the trade-off you are making.';
      const reaperLabel = amo ? null : s.backend === 'kafka' ? { label: 'Group coordinator', sub: 'rebalance on timeout' } : hb ? { label: 'Lease reaper', sub: 'no heartbeat → requeue' } : { label: 'Visibility timeout', sub: 'unacked → redeliver' };
      const labels = { q: B.q, sch2: s.ha === 'leader' ? { label: 'Standby scheduler', sub: 'waits for leader lease' } : { label: 'Scheduler #2', sub: 'active · row locks' } };
      if (reaperLabel) labels.reaper = reaperLabel;
      const hide = [];
      if (s.ha === 'single') hide.push('sch2');
      if (amo) hide.push('reaper', 'dlq');
      const flow = ['cli>api', 'api>jdb', s.ha === 'active' ? ['sch>jdb', 'sch2>jdb'] : 'sch>jdb', 'sch>q', 'q>w1', 'w1>res'];
      return {
        metrics, verdict, notes, labels, hide, flow,
        hot: s.ha === 'active' ? ['sch', 'sch2'] : ['sch'],
        warn: (short ? ['w1', 'w2'] : []).concat(s.backend === 'kafka' ? ['q'] : []),
        err: amo ? ['w1'] : [],
        badges: { q: [s.backend === 'kafka' ? 'offset/partition' : s.backend === 'pg' ? 'SKIP LOCKED' : 'ack late', s.backend === 'kafka' ? 'warn' : 'info'], w1: short ? ['dup risk', 'err'] : amo ? ['may lose', 'err'] : ['lease ' + s.lease + ' s', 'info'] }
      };
    }
  },

  widget: {
    title: 'SKIP LOCKED vs naive FOR UPDATE',
    caption: 'Workers run the classic claim query on a 10-row job table. With plain <code>FOR UPDATE</code> they all queue on the <b>same first row</b>. With <code>SKIP LOCKED</code> each one grabs the next free row. <b>Kill</b> a worker to see its transaction abort and the row become claimable again.'
  },

  realWorld: {
    intro: 'Job systems evolved from "a table and a cron" to durable-execution engines. The core ideas stayed the same: durable state, leases and idempotency.',
    timeline: [
      { when: '2016', who: 'PostgreSQL', title: 'SKIP LOCKED in 9.5', text: '<code>SELECT … FOR UPDATE SKIP LOCKED</code> works like NOWAIT, but skips locked rows instead of raising an error. It became the standard way to build a job queue on a plain table.', src: 0 },
      { when: '2017', who: 'Uber', title: 'Cadence open-sourced', text: 'Uber built <b>Cadence</b> to orchestrate microservice workflows and open-sourced it in 2017. You write workflows and activities as code, and Cadence persists every step (front end, history and matching services, Cassandra back end).', src: 4 },
      { when: '2019', who: 'Temporal', title: 'Temporal: Cadence\'s successor', text: 'Cadence\'s creators, Maxim Fateev and Samar Abbas, founded Temporal in 2019 and forked Cadence into a "durable execution" platform. Workflow state survives crashes by replaying an event history.', src: 5 },
      { when: 'Nov 2020', who: 'Dropbox', title: 'Async Task Framework (ATF)', text: 'ATF runs lambda-like callbacks <b>at least once</b>, never concurrently for the same task, and retries tasks that get stuck in CLAIMED or PROCESSING. InfoQ reported <b>9,000 tasks/s</b> for 28 internal teams.', src: 6 },
      { when: 'Dec 2020', who: 'Apache Airflow', title: 'HA scheduler in Airflow 2.0', text: 'Airflow 2 runs <b>several active schedulers</b> against one metadata DB, with no consensus layer. They coordinate with <b>row-level locks</b> (<code>SELECT … FOR UPDATE</code>, SKIP LOCKED where the DB supports it). Astronomer recommends at least two schedulers in production.', src: 1 },
      { when: 'Feb 2021', who: 'Facebook', title: 'FOQS: priority queue on MySQL', text: 'FOQS is a multitenant priority queue on <b>sharded MySQL</b>, one item per row. Its API is enqueue, dequeue, ack and nack, with a lease after dequeue. Lower numbers mean higher priority, and it supports both at-least-once and at-most-once delivery.', src: 8 }
    ],
    lessons: [
      'Keep job state in a <b>durable store</b>. A queue alone is not a source of truth.',
      'Use <b>leases with heartbeats</b>, not "hope the worker finishes".',
      'Design every task to be <b>idempotent</b> and pass idempotency keys downstream.',
      'Coordinate schedulers through <b>DB row locks or unique constraints</b>, not in-memory flags.'
    ],
    sources: [
      { title: 'PostgreSQL 9.5: what\'s new (SKIP LOCKED)', url: 'https://www.hagander.net/talks/postgresql95.pdf', pub: 'Magnus Hagander, 2015' },
      { title: 'Airflow: Scheduler (running more than one scheduler)', url: 'https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/scheduler.html', pub: 'Apache Airflow docs' },
      { title: 'The Airflow 2.0 Scheduler', url: 'https://www.astronomer.io/blog/airflow-2-scheduler', pub: 'Astronomer' },
      { title: 'AIP-15: Support Multiple Schedulers for HA', url: 'https://cwiki.apache.org/confluence/spaces/AIRFLOW/pages/103092651/AIP-15+Support+Multiple-Schedulers+for+HA+Better+Scheduling+Performance', pub: 'Apache Airflow wiki' },
      { title: 'Conducting Better Business with Uber\'s Open Source Orchestration Tool, Cadence', url: 'https://www.uber.com/blog/open-source-orchestration-tool-cadence-overview', pub: 'Uber Engineering, 2019' },
      { title: 'Temporal: Who we are', url: 'https://temporal.io/about', pub: 'temporal.io' },
      { title: 'Asynchronous Task Scheduling at Dropbox', url: 'https://dropbox.tech/infrastructure/asynchronous-task-scheduling-at-dropbox', pub: 'Dropbox Tech Blog, 2020' },
      { title: 'Dropbox distributed task scheduling', url: 'https://www.infoq.com/news/2020/11/dropbox-distributed-tasks/', pub: 'InfoQ, Nov 2020' },
      { title: 'FOQS: Scaling a distributed priority queue', url: 'https://engineering.fb.com/2021/02/22/production-engineering/foqs-scaling-a-distributed-priority-queue/', pub: 'Engineering at Meta, 2021' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Queue store', '<b>DB table + SKIP LOCKED</b>: transactional enqueue, rich queries', '<b>Broker</b> (Redis/RabbitMQ): higher throughput, separate system', 'Table until thousands of jobs/s; broker beyond that'],
      ['Delivery', '<b>At-least-once</b>: no loss, possible duplicates', '<b>At-most-once</b>: no duplicates, possible loss', 'Almost always at-least-once + idempotent tasks'],
      ['Liveness', '<b>Fixed visibility timeout</b>: simple', '<b>Lease + heartbeat</b>: fast detection, safe for long tasks', 'Heartbeats once tasks run longer than a minute or so'],
      ['Scheduler HA', '<b>Active-passive</b> (leader election)', '<b>Active-active</b> (row locks / unique keys)', 'Active-active when the DB can arbitrate; it removes failover delay'],
      ['Model', '<b>Task queue</b> (Celery): fire-and-forget tasks', '<b>Durable execution</b> (Temporal): multi-step workflows as code', 'Workflows with many steps, timers and compensation → Temporal'],
      ['Ordering', '<b>FIFO per key</b>: correct order, one at a time', '<b>Parallel</b>: throughput, no ordering', 'Order only where business needs it (per account, per document)']
    ]
  },
  failures: [
    { f: 'Worker crashes mid-task', detect: 'Heartbeats stop; lease expires', fix: 'Reaper requeues with attempt+1. The task is idempotent, so a rerun is safe.' },
    { f: 'Alive but slow worker (GC pause, partition)', detect: 'Lease expired while the worker still runs', fix: 'Fencing token (attempt number) on every write; idempotency keys on side effects.' },
    { f: 'Poison message', detect: 'Same job fails on every worker', fix: 'max_attempts → dead-letter queue; alert; fix and re-drive.' },
    { f: 'Cron stampede at :00', detect: 'Queue age spike at the top of the hour', fix: 'Jitter, batched claims, autoscaling on oldest-job age, priorities.' },
    { f: 'Scheduler down', detect: 'No new runs; heartbeat table stale', fix: 'Active-active schedulers sharing row locks; DB releases a dead session\'s locks.' },
    { f: 'Job table bloat', detect: 'Claim latency rises; dead tuples pile up', fix: 'Partial index on ready rows, delete or partition finished jobs, tune autovacuum.' },
    { f: 'Duplicate cron run', detect: 'Two runs for the same fire time', fix: 'UNIQUE(schedule_id, fire_time) and INSERT … ON CONFLICT DO NOTHING.' }
  ],

  interview: [
    { q: 'Can a job system guarantee exactly-once execution?', a: '<p>Not in general. A worker can finish the work and crash before the ack, so the system cannot tell "done" from "not started". You choose:</p><ul><li><b>at-most-once</b>: ack first, risk loss</li><li><b>at-least-once</b>: ack after, risk duplicates</li></ul><p>Exactly-once <i>effect</i> = at-least-once + <b>idempotent</b> tasks (dedupe keys, upserts, idempotency keys downstream).</p>', fu: 'How do you make "send email" idempotent? (Record a sent key in the same DB, or let the provider dedupe by key.)', lvl: 'core' },
    { q: 'What is a visibility timeout or lease?', a: '<p>When a worker takes a job it becomes <b>invisible</b> to others for T seconds. If the worker acks in time the job is deleted. If not, it reappears for another worker.</p><p>T must be longer than the task, <i>or</i> the worker must <b>heartbeat</b> to extend it. Otherwise healthy tasks get duplicated.</p>', lvl: 'core' },
    { q: 'How does FOR UPDATE SKIP LOCKED make Postgres a good queue?', a: '<p>Each worker runs <code>SELECT … WHERE status=\'queued\' ORDER BY run_at LIMIT n FOR UPDATE SKIP LOCKED</code>. Rows locked by others are <b>skipped instead of waited on</b>, so N workers claim N different rows in parallel.</p><p>With plain FOR UPDATE they all block on the same first row and run one at a time. Bonus: enqueue happens in the <b>same transaction</b> as your business write.</p>', lvl: 'core' },
    { q: 'How do you run cron at scale without duplicate runs?', a: '<ul><li>Store <code>next_fire_at</code> per schedule and index it.</li><li>Schedulers claim due rows with SKIP LOCKED in batches.</li><li>Insert the run with <b>UNIQUE(schedule_id, fire_time)</b>, so a retry or a second scheduler cannot double-fire.</li><li>Compute the next fire time in the same transaction.</li><li>Add jitter for jobs that do not need exact times.</li></ul>', lvl: 'core' },
    { q: 'How do you make the scheduler highly available?', a: '<p><b>Active-passive</b>: leader election (etcd/ZooKeeper lease), and the standby takes over when the lease expires. That means seconds of downtime.</p><p><b>Active-active</b>: all schedulers work at once and let the <b>database arbitrate</b> with row locks and unique constraints. This is Airflow 2\'s approach. It needs no consensus system and has no failover gap.</p>', lvl: 'deep' },
    { q: 'How would you implement priorities without starving low-priority jobs?', a: '<p>Use separate queues per priority, and have workers take from them with <b>weighted</b> selection (e.g. 70/20/10), not strict priority. Add <b>aging</b> (priority rises with wait time) and <b>per-tenant quotas</b>, so one noisy customer cannot fill the queue.</p>', lvl: 'deep' },
    { q: 'How are DAG dependencies resolved?', a: '<p>Store task instances per run with a state. After each completion, find tasks in the run whose upstream tasks are all <code>success</code> (a NOT EXISTS query, or in-memory counters of remaining deps) and queue them.</p><p>Trigger rules (all_success, one_failed…) generalise this.</p>', lvl: 'core' },
    { q: 'What is a backfill and what can go wrong?', a: '<p>A backfill runs a DAG for past logical dates, for example to fill 90 days of a new table. Risks: flooding the cluster (use a concurrency cap per DAG), <b>non-idempotent tasks</b> (each run must overwrite its own date partition, never append), and tasks that wrongly read "now" instead of the logical date.</p>', lvl: 'deep' },
    { q: 'Why not just use Kafka as the job queue?', a: '<p>Kafka commits <b>offsets per partition</b>. One slow or failing job blocks everything behind it in that partition, and you cannot ack or retry it individually, delay it, or prioritise it.</p><p>Kafka is great for feeding events into a scheduler, but the jobs themselves want per-message acks and leases (a broker or a table).</p>', lvl: 'deep' },
    { q: 'A worker paused for 90 s and its job was given to another worker. How do you stop the first one corrupting state?', a: '<p>Use a <b>fencing token</b>: every claim increments <code>attempts</code>, and every write includes <code>WHERE attempts = :mine</code>. The stale worker\'s update matches zero rows.</p><p>For external side effects, pass an idempotency key so the second call is a no-op.</p>', lvl: 'deep' },
    { q: 'Task queue (Celery) vs durable execution (Temporal)?', a: '<p>A <b>task queue</b> runs independent functions. Multi-step flows, timers and compensation are your problem.</p><p><b>Temporal/Cadence</b> persist the workflow\'s event history, so a workflow can sleep for 30 days, survive crashes by replaying, and call activities with retries. It is worth it for long business processes, and overkill for a thumbnail job.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Spring Boot: claim with SKIP LOCKED, lease, fencing', lang: 'java',
      code: `@Component
public class JobWorker {                     // needs @EnableScheduling
  private final JdbcTemplate jdbc;
  private final JobHandler handler;          // your idempotent business logic
  private final String me = "w-" + UUID.randomUUID();
  public JobWorker(JdbcTemplate jdbc, JobHandler handler) { this.jdbc = jdbc; this.handler = handler; }

  record Job(long id, String payload, int attempt) {}

  private static final String CLAIM = """
      UPDATE jobs SET status = 'running', attempts = attempts + 1,
             locked_by = ?, lease_until = now() + interval '60 seconds'
       WHERE id IN (SELECT id FROM jobs
                     WHERE queue = ? AND status = 'queued' AND run_at <= now()
                     ORDER BY priority, run_at
                     LIMIT ? FOR UPDATE SKIP LOCKED)
      RETURNING id, payload::text, attempts""";

  @Scheduled(fixedDelay = 500)
  public void poll() {
    List<Job> jobs = jdbc.query(CLAIM,
        (rs, i) -> new Job(rs.getLong(1), rs.getString(2), rs.getInt(3)), me, "default", 10);
    for (Job j : jobs) {
      try {
        handler.handle(j.payload(), "job-" + j.id());          // idempotency key
        jdbc.update("UPDATE jobs SET status = 'done' WHERE id = ? AND attempts = ?",
            j.id(), j.attempt());                               // fencing: stale attempt -> 0 rows
      } catch (Exception e) {
        jdbc.update("""
            UPDATE jobs SET locked_by = NULL,
                   status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
                   run_at = now() + make_interval(secs => power(2, attempts))
             WHERE id = ? AND attempts = ?""", j.id(), j.attempt());
      }
    }
  }

  @Scheduled(fixedDelay = 20_000)            // heartbeat: extend my leases
  public void heartbeat() {
    jdbc.update("UPDATE jobs SET lease_until = now() + interval '60 seconds' "
        + "WHERE locked_by = ? AND status = 'running'", me);
  }
}`,
      note: 'The claim commits at once (short transaction), so no lock is held while the job runs. The lease and the fencing check provide safety instead.'
    },
    {
      title: 'Postgres: table, reaper and DAG readiness', lang: 'sql',
      code: `CREATE TABLE jobs (
  id           bigserial   PRIMARY KEY,
  queue        text        NOT NULL DEFAULT 'default',
  priority     int         NOT NULL DEFAULT 100,
  payload      jsonb       NOT NULL,
  status       text        NOT NULL DEFAULT 'queued',  -- queued|running|done|dead
  run_at       timestamptz NOT NULL DEFAULT now(),
  attempts     int         NOT NULL DEFAULT 0,
  max_attempts int         NOT NULL DEFAULT 5,
  locked_by    text,
  lease_until  timestamptz,
  dedupe_key   text UNIQUE                           -- idempotent enqueue
);
CREATE INDEX jobs_ready ON jobs (queue, priority, run_at) WHERE status = 'queued';

-- reaper (every few seconds): expired leases go back to the queue or to dead
UPDATE jobs
   SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
       locked_by = NULL
 WHERE status = 'running' AND lease_until < now();

-- DAG: tasks in this run whose upstream tasks have all succeeded
SELECT t.task_id
  FROM task_runs t
 WHERE t.run_id = :run AND t.state = 'none'
   AND NOT EXISTS (
     SELECT 1 FROM task_deps d
       JOIN task_runs u ON u.run_id = t.run_id AND u.task_id = d.upstream_id
      WHERE d.task_id = t.task_id AND u.state <> 'success');`
    },
    {
      title: 'Python: Celery configured for at-least-once', lang: 'python',
      code: `from celery import Celery
import redis

app = Celery("jobs", broker="redis://localhost:6379/0", backend="redis://localhost:6379/1")
app.conf.update(
    task_acks_late=True,               # ack after the task finishes -> at-least-once
    task_reject_on_worker_lost=True,   # requeue if the worker process dies mid-task
    worker_prefetch_multiplier=1,      # do not hoard tasks on one worker
    broker_transport_options={"visibility_timeout": 3600},  # must exceed the longest task
)
done = redis.Redis(db=2)

@app.task(bind=True, autoretry_for=(ConnectionError,), retry_backoff=True,
          retry_jitter=True, max_retries=5)
def charge(self, order_id: int) -> str:
    key = f"charge:{order_id}"
    if done.exists(key):                # duplicate delivery: already applied
        return "skipped"
    payments.charge(order_id, idempotency_key=key)   # provider dedupes too
    done.set(key, 1, ex=7 * 86400)
    return "charged"`,
      note: '<code>payments</code> stands for your payment client. The provider-side idempotency key covers a crash between the charge and <code>done.set</code>.'
    }
  ],

  related: ['message-queue', 'lock-manager', 'payment-gateway', 'notifications', 'stream-analytics', 'distributed-sql']
});
