(function () {
/* Shared maths for the calculator and the knobs. */
const usl = (n, a, b) => n / (1 + a * (n - 1) + b * n * (n - 1));
const amdahl = (n, s) => 1 / (s + (1 - s) / n);
const peakN = (a, b) => (b > 0 ? Math.sqrt((1 - a) / b) : Infinity);
/* Model used by the calculator: N nodes, each with mean service time S when alone.
   Cluster capacity X(N) = C(N) / S. Each node is an M/M/1 queue whose effective
   service time is stretched by contention and coherency: S_eff = S · N / C(N). */
function model(v) {
  const a = v.a / 100, b = v.b / 10000, S = v.S / 1000;
  const C = usl(v.N, a, b), X = C / S, rho = v.lam / X, Seff = S * v.N / C;
  const R = rho < 1 ? Seff / (1 - rho) : Infinity;
  return { a, b, C, X, rho, Seff, R };
}

SD.register({
  slug: 'scalability-laws',
  domain: 1,
  title: 'Scalability Laws',
  examples: "Amdahl, Gunther's USL, Little",
  tagline: 'Five small formulas that tell you <b>how much faster more machines make you</b>, why throughput can <b>go down</b> when you add nodes, and why latency <b>explodes</b> long before a server reaches 100% busy.',
  tldr: {
    problem: 'Teams assume capacity grows linearly with nodes, size pools by gut feel, and run servers "efficiently" at 90% busy. Then the 2× bigger cluster is 1.3× faster, the bigger connection pool makes the database slower, and p99 latency triples during a 10% traffic bump.',
    idea: '<b>Amdahl</b> caps speed-up by the serial fraction. <b>Gunther\'s USL</b> adds a coherency cost that makes throughput <b>peak and then fall</b>. <b>Little\'s Law</b> (L = λW) sizes every pool and queue. <b>Queueing theory</b> says waiting grows like ρ/(1−ρ). <b>The tail at scale</b> says fan-out turns rare slowness into the common case.',
    insight: 'Interviewers want you to say: "Scaling is limited by what is <b>shared</b>: a lock, a leader, a database, a coordination round. I would <b>measure throughput at 1, 2, 4, 8 nodes, fit the USL</b>, plan to run below ~70% utilisation, and size pools with Little\'s Law, not intuition."',
    numbers: [
      { v: '20×', l: 'max speed-up with 5% serial work, however many cores (Amdahl, 1967)' },
      { v: '63%', l: 'requests slower than 1 s when fanning out to 100 servers that are each slow 1% of the time (Dean & Barroso, 2013)' },
      { v: '(2 × cores) + spindles', l: 'HikariCP\'s starting point for a database connection pool, a <em>rule of thumb</em> to load-test' }
    ]
  },

  intro: {
    what: 'Scalability laws are simple equations that predict <b>what happens to throughput and latency when you add workers or add load</b>. Some describe parallel work (how much faster do 32 cores make a job?). Others describe queues (how long does a request wait when the server is 80% busy?). Together they turn "will it scale?" into numbers you can check.',
    analogy: {
      icon: '🍳',
      title: 'A restaurant kitchen',
      text: 'Add cooks and dishes come out faster, until they all queue for the <b>one oven</b> (contention, Amdahl). Add even more and they spend their time <b>asking each other</b> what is done (coherency), so output actually falls. At the front, the number of diners waiting equals arrival rate × time each spends (<b>Little\'s Law</b>), and when the kitchen is almost fully busy, the queue at the door grows <b>much faster than the load</b>. The analogy is loose on one point: computers can sometimes remove the oven (shard the lock); kitchens rarely can.'
    },
    problem: 'Your search service handles 2,000 requests a second on 10 nodes. Marketing plans a launch at 4,000, so you order 10 more nodes. On launch day throughput tops out at 2,700, p99 latency goes from 120 ms to 900 ms, and adding the database connections you were sure would help makes it worse. <b>How much capacity does each extra node really add, and how busy can a server run before latency breaks?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Twice the nodes, twice the throughput',
        text: 'The obvious plan: measure one node, multiply by the number of nodes, and run them at 90% busy to save money. Size the thread pool and DB pool "big, to be safe".',
        scene: {
          nodes: [
            { id: 'u', label: 'Traffic', sub: '4,000 req/s', kind: 'client', at: [210, 0] },
            { id: 'a', label: 'Node 1..10', sub: '200 req/s each', kind: 'compute', at: [70, 110] },
            { id: 'b', label: 'Node 11..20', sub: 'just added', kind: 'compute', at: [350, 110] },
            { id: 'db', label: 'Database', sub: 'pool = 200', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'u', to: 'a' }, { from: 'u', to: 'b' }, { from: 'a', to: 'db' }, { from: 'b', to: 'db' }],
          flow: [['u>a', 'u>b'], ['a>db', 'b>db']],
          badges: { b: ['+2,000?', 'info'] }
        }
      },
      {
        stage: 'breaks',
        title: 'Shared things set the ceiling',
        text: 'Every request takes a row lock and nodes keep a shared cache in sync, so each new node adds less, then <b>slows the others down</b>. Servers run at 90% busy, so small bursts become long queues. The 400 DB connections fight over 16 cores.',
        scene: {
          nodes: [
            { id: 'u', label: 'Traffic', sub: 'p99 900 ms', kind: 'client', at: [210, 0] },
            { id: 'a', label: 'Node 1..10', sub: '90% busy', kind: 'compute', at: [70, 110] },
            { id: 'b', label: 'Node 11..20', sub: 'adds only 35%', kind: 'compute', at: [350, 110] },
            { id: 'db', label: 'Database', sub: '400 conns, 16 cores', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'u', to: 'a' }, { from: 'u', to: 'b' }, { from: 'a', to: 'db' }, { from: 'b', to: 'db' }, { from: 'a', to: 'b', bidi: true, dashed: true }],
          flow: [['u>a', 'u>b'], ['a>b'], ['a>db', 'b>db']],
          err: ['db'], warn: ['a', 'b'],
          badges: { db: ['lock queue', 'err'], u: ['2,700 max', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Measure, fit, remove the shared part',
        text: 'Measure throughput at a few cluster sizes and fit the curve, so you know where it peaks. <b>Shard</b> the hot lock, keep utilisation near 60–70%, and size the DB pool from <b>Little\'s Law</b>: busy connections = queries per second × seconds each one holds a connection.',
        scene: {
          nodes: [
            { id: 'u', label: 'Traffic', sub: 'p99 130 ms', kind: 'client', at: [210, 0] },
            { id: 'a', label: 'Shard A', sub: '65% busy', kind: 'compute', at: [70, 110] },
            { id: 'b', label: 'Shard B', sub: '65% busy', kind: 'compute', at: [350, 110] },
            { id: 'db', label: 'Database', sub: 'pool = λ × W', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'u', to: 'a' }, { from: 'u', to: 'b' }, { from: 'a', to: 'db' }, { from: 'b', to: 'db' }],
          flow: [['u>a', 'u>b'], ['a>db', 'b>db']],
          ok: ['a', 'b', 'db'],
          badges: { db: ['33 conns', 'ok'], u: ['4,000 ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['Google (The Tail at Scale)', 'HikariCP and Spring Boot pool sizing', 'Java 21 virtual threads (JEP 444)', 'Performance Dynamics (USL capacity planning)', 'Database and HPC benchmarking', 'Cloud autoscaling targets'],
    whenToUse: [
      '<b>Capacity planning</b>: how many nodes for next year\'s traffic, and where the curve stops paying',
      '<b>Sizing</b> thread pools, connection pools, queues, Kafka consumers and autoscaling targets',
      'Explaining why a system <b>stopped scaling</b> or why p99 jumped with only a small traffic increase'
    ],
    whenNot: [
      'As a replacement for a <b>load test</b>: the formulas need measured inputs and they are best-case models',
      'For availability questions: use <a href="reliability-math.html">Reliability Math</a> for nines and chains of dependencies',
      'For cost alone: the laws tell you efficiency per node, but pricing and commitments live in <a href="finops.html">FinOps</a>'
    ],
    glossary: [
      { term: 'Speed-up', def: 'Time on 1 worker divided by time on N workers (or throughput on N divided by throughput on 1).' },
      { term: 'Serial fraction', def: 'The share of the work that cannot run in parallel, such as a single lock or a single leader.' },
      { term: 'Contention (α)', def: 'Time lost queueing for a shared resource; grows linearly with the number of workers.' },
      { term: 'Coherency (β)', def: 'Time lost keeping workers consistent with each other (crosstalk); grows with the number of pairs, about N².' },
      { term: 'Utilisation (ρ)', def: 'The fraction of time a server is busy: arrival rate × service time ÷ number of servers.' },
      { term: 'Little\'s Law', def: 'L = λW: the average number of items in a stable system equals the arrival rate times the average time each item spends there.' },
      { term: 'Tail latency', def: 'The slowest responses, usually measured as the 99th or 99.9th percentile (p99, p99.9).' },
      { term: 'Hedged request', def: 'A second copy of a request sent to another replica if the first has not answered within a short delay; the first reply wins.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Amdahl (1967)</b>: with serial fraction s, speed-up on N workers is <code>1 / (s + (1−s)/N)</code>, and can never exceed <code>1/s</code>',
      '<b>Gustafson (1988)</b>: if the problem grows with the machine, scaled speed-up is <code>N − s(N−1)</code>, close to linear',
      '<b>USL (Gunther, 1993)</b>: <code>C(N) = N / (1 + α(N−1) + βN(N−1))</code>; with β &gt; 0 throughput <b>peaks</b> at <code>N* = √((1−α)/β)</code> and then falls',
      '<b>Little (1961)</b>: <code>L = λW</code> for any stable system, whatever the distributions: concurrency = throughput × time in system',
      '<b>Queueing</b>: in an M/M/1 queue <code>W = 1/(μ−λ)</code>; waiting grows like <code>ρ/(1−ρ)</code>, and <b>Kingman</b> multiplies it by the variability <code>(c<sub>a</sub>² + c<sub>s</sub>²)/2</code>',
      '<b>Tail at scale (2013)</b>: a request that waits for N parallel calls is slow with probability <code>1 − (1−p)<sup>N</sup></code>'
    ],
    nonFunctional: [
      '<b>Scaling efficiency</b> C(N)/N ≥ 0.7 at the planned cluster size, measured, not assumed',
      'Planned cluster size well below the fitted <b>peak N*</b> (e.g. ≤ 0.5·N*)',
      'Steady-state utilisation ≤ <b>60–70%</b> for latency-sensitive services (<em>rule of thumb</em>), leaving room for bursts and failover',
      'Every pool sized from <b>Little\'s Law</b> with measured λ and W, plus headroom, and bounded by what the downstream can serve',
      'Fan-out services meet their SLO at <b>p99 of the leaves</b>, not the median, with hedging or tied requests where needed',
      'A capacity model reviewed whenever a load test, release or traffic forecast changes it'
    ],
    outOfScope: [
      '<b>Linear extrapolation</b>: "1 node does 200 req/s, so 50 nodes do 10,000"',
      '<b>Running hot to save money</b>: 90–95% average utilisation on an interactive service',
      '<b>"Bigger pool = faster"</b>: hundreds of DB connections per app instance against a database with a few dozen cores',
      '<b>Averages only</b>: planning with mean latency when users feel p99 and fan-out multiplies it',
      'Using Little\'s Law on a system that is <b>not stable</b> (arrivals above capacity, queue growing without bound)'
    ]
  },

  calculator: {
    inputs: [
      { id: 'a', label: 'Serial fraction / contention α (Amdahl s = USL α)', min: 0, max: 30, step: 0.5, value: 5, unit: '%' },
      { id: 'b', label: 'Coherency β (in units of 10⁻⁴)', min: 0, max: 50, step: 0.5, value: 5, unit: '× 10⁻⁴' },
      { id: 'N', label: 'Nodes (or cores / workers)', min: 1, max: 256, value: 16 },
      { id: 'lam', label: 'Arrival rate λ', min: 10, max: 20000, value: 800, log: true, unit: 'req/s' },
      { id: 'S', label: 'Service time per request on one idle node', min: 1, max: 200, value: 10, unit: 'ms' },
      { id: 'M', label: 'Fan-out width (parallel calls per request)', min: 1, max: 500, value: 50, log: true }
    ],
    outputs: [
      { label: 'Amdahl speed-up at N (cap 1/s)', f: (v) => { const s = v.a / 100; return amdahl(v.N, s).toFixed(1) + '×' + (s > 0 ? ' (max ' + (1 / s).toFixed(0) + '×)' : ''); } },
      { label: 'USL relative capacity C(N) and peak N*', f: (v) => { const m = model(v), p = peakN(m.a, m.b); return m.C.toFixed(1) + '× · peak at N* ≈ ' + (isFinite(p) ? Math.round(p) : '∞'); } },
      { label: 'Utilisation ρ = λ / X(N), X(N) = C(N)/S', fmt: 'pct', f: (v) => model(v).rho },
      { label: 'Mean response time (M/M/1 per node, stretched service time)', f: (v) => { const m = model(v); return isFinite(m.R) ? SD.fmt.dur(m.R * 1000) : 'unstable: queue grows forever'; } },
      { label: 'Requests in flight L = λW (Little): threads / connections needed', f: (v) => { const m = model(v); return isFinite(m.R) ? Math.ceil(v.lam * m.R) + ' in flight' : '∞'; } },
      { label: 'Fan-out: share of requests that hit at least one p99 leaf', fmt: 'pct', f: (v) => 1 - Math.pow(0.99, v.M) }
    ],
    note: 'Model: N identical nodes; on N nodes each request\'s service time is stretched to S·N/C(N) by contention and coherency, so cluster capacity is C(N)/S. Each node is treated as an <b>M/M/1</b> queue (Poisson arrivals, exponential service), so mean response time is S<sub>eff</sub>/(1−ρ). Real service times are usually more variable: Kingman\'s formula scales the <i>waiting</i> part by (c<sub>a</sub>² + c<sub>s</sub>²)/2. Amdahl uses the same slider as α (Gunther shows Amdahl is the USL with β = 0). The fan-out line assumes leaves are independent; correlated slowness (a shared GC pause, a noisy neighbour) is worse. All outputs are <em>estimates</em> for reasoning, not a substitute for a load test.'
  },

  api: [
    { m: 'DOC', p: 'Capacity model', d: 'Measured throughput at N = 1, 2, 4, 8, 16 nodes, the fitted <b>α, β, N*</b>, the planned size, utilisation target and the date of the load test it came from.' },
    { m: 'YAML', p: 'spring.datasource.hikari.*', d: '<code>maximum-pool-size</code> derived from Little\'s Law (queries/s × connection hold time) and capped by the database\'s core count, with <code>connection-timeout</code> as the back-pressure signal.' },
    { m: 'SLO', p: 'Latency SLO at the tail', d: 'p99 (and p99.9 for fan-out roots) per endpoint, with the <b>utilisation ceiling</b> that the SLO assumes, e.g. "p99 ≤ 200 ms at ≤ 70% CPU".' },
    { m: 'POLICY', p: 'Autoscaling target', d: 'Target utilisation (e.g. 60% CPU or in-flight requests per pod from Little\'s Law), scale-up lead time, and the max size beyond which the USL fit says adding pods stops helping.' },
    { m: 'ADR', p: 'Scale up, out or shard', d: 'Which shared resource sets α and β today (lock, leader, global counter, cache invalidation), and the chosen remedy: bigger box, more nodes, partitioning, or removing the coordination.' },
    { m: 'HTTP', p: 'Hedged / tied request policy', d: 'Which idempotent reads may be hedged, the delay before the hedge (e.g. the p95 of that call), the extra-load budget, and cancellation of the loser.' }
  ],
  dataModel: [
    { name: 'load_test_run', store: 'Postgres / sheet', fields: [['run_id', 'uuid', 'pk'], ['git_sha', 'text'], ['nodes', 'int', 'idx'], ['offered_rps', 'numeric'], ['throughput_rps', 'numeric'], ['p50_ms', 'numeric'], ['p99_ms', 'numeric'], ['cpu_util', 'numeric']], note: 'One row per step of a stepped load test. The USL fit and the latency-vs-utilisation curve are both computed from these rows.' },
    { name: 'usl_fit', store: 'Postgres / sheet', fields: [['service', 'text', 'pk'], ['fitted_at', 'timestamptz', 'pk'], ['lambda1_rps', 'numeric'], ['alpha', 'numeric'], ['beta', 'numeric'], ['peak_n', 'numeric'], ['r_squared', 'numeric']], note: 'Keep the history: a release that raises β (new cache invalidation, a chatty protocol) shows up here before it shows up in an outage.' },
    { name: 'pool_sizing', store: 'Config repo', fields: [['pool', 'text', 'pk'], ['arrival_rps', 'numeric'], ['hold_time_ms', 'numeric'], ['littles_l', 'numeric'], ['headroom', 'numeric'], ['max_size', 'int'], ['downstream_limit', 'int']], note: 'The audit trail for every pool: L = λW, times headroom, but never above what the downstream (database cores, partner rate limit) can serve.' }
  ],

  architecture: {
    title: 'Where each law bites in a request path',
    nodes: [
      { id: 'users', label: 'Arrivals λ', sub: 'requests / s', kind: 'client', wide: [90, 150], tall: [210, 0], tip: 'The arrival rate. Little\'s Law and every queueing formula start here.' },
      { id: 'lb', label: 'Load balancer', sub: 'spreads λ over N', kind: 'edge', wide: [280, 150], tall: [210, 105], tip: 'Divides the arrivals across N nodes. Per-node utilisation is λ × S ÷ capacity.' },
      { id: 'q', label: 'Request queue', sub: 'wait ∝ ρ/(1−ρ)', kind: 'queue', wide: [480, 150], tall: [210, 210], tip: 'Where latency hides. Near full utilisation, waiting time grows without bound.' },
      { id: 'workers', label: 'Workers × N', sub: 'service time S', kind: 'compute', wide: [680, 150], tall: [210, 315], tip: 'The parallel part. Amdahl and the USL describe how much capacity N of them really give.' },
      { id: 'lock', label: 'Shared lock', sub: 'contention α', kind: 'policy', wide: [680, 40], tall: [70, 315], tip: 'Anything only one worker can use at a time: a row lock, a single leader, a global sequence. It is the serial fraction.' },
      { id: 'coh', label: 'Coherency', sub: 'crosstalk β · N²', kind: 'cache', wide: [880, 40], tall: [70, 420], tip: 'Work to keep workers consistent: cache invalidation, cluster membership, distributed locks. It grows with the number of pairs.' },
      { id: 'pool', label: 'DB pool', sub: 'size = λ × W', kind: 'service', wide: [680, 260], tall: [350, 420], tip: 'Connections in use = queries per second × time each holds a connection (Little). More than the database can run in parallel only adds queueing.' },
      { id: 'db', label: 'Postgres', sub: 'cores × 2 + spindles', kind: 'store', wide: [880, 260], tall: [350, 525], tip: 'A database has a fixed number of cores and disks. HikariCP\'s rule of thumb starts the pool at (2 × cores) + effective spindles.' },
      { id: 'agg', label: 'Fan-out root', sub: 'waits for slowest', kind: 'service', wide: [480, 260], tall: [210, 420], tip: 'Sends one sub-request to every shard and must wait for all of them, so its latency is the maximum of the leaves.' },
      { id: 'leaves', label: 'Leaf shards × M', sub: '1% slow each', kind: 'compute', wide: [480, 370], tall: [210, 525], tip: 'Each leaf is usually fast. With M leaves, the chance that at least one is slow is 1 − 0.99^M.' },
      { id: 'hedge', label: 'Hedged request', sub: 'after p95 delay', kind: 'policy', wide: [280, 370], tall: [70, 525], tip: 'If a leaf has not answered by about its p95, send the same read to another replica and take whichever answers first.' }
    ],
    edges: [
      { from: 'users', to: 'lb' },
      { from: 'lb', to: 'q' },
      { from: 'q', to: 'workers' },
      { from: 'workers', to: 'lock', bidi: true },
      { from: 'workers', to: 'coh', dashed: true, bidi: true, label: 'sync' },
      { from: 'workers', to: 'pool' },
      { from: 'pool', to: 'db' },
      { from: 'workers', to: 'agg' },
      { from: 'agg', to: 'leaves' },
      { from: 'agg', to: 'hedge', dashed: true },
      { from: 'hedge', to: 'leaves', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'little', title: 'Sizing pools with Little\'s Law', tone: 'info',
      steps: [
        { text: 'Traffic is <b>λ = 800 req/s</b>. Each request spends <b>W = 50 ms</b> in the service, so on average <b>L = λW = 40</b> requests are in flight.', flow: ['users>lb', 'lb>q', 'q>workers'], badges: { workers: 'L = 40' } },
        { text: 'Little\'s Law needs no assumption about distributions, only a <b>stable</b> system. 40 is the average; give the worker pool headroom for bursts (say 2×), not 10×.', nodes: ['workers'], badges: { workers: ['80 threads', 'ok'] } },
        { text: 'Each request runs 1.5 queries holding a connection for 8 ms: 800 × 1.5 × 0.008 = <b>9.6 connections busy</b> on average across the fleet.', flow: ['workers>pool', 'pool>db'], badges: { pool: 'L ≈ 10' } },
        { text: 'The database has 8 cores. HikariCP\'s starting point, (2 × 8) + 1 = <b>17</b> connections in total, covers the 10 busy ones with headroom. Split it across app instances; do not give each one 100.', nodes: ['db', 'pool'], ok: ['db', 'pool'], badges: { db: ['17 total', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'knee', title: 'The utilisation knee: a 10% bump triples latency', tone: 'err',
      steps: [
        { text: 'Each node serves a request in <b>10 ms</b> and runs at <b>ρ = 70%</b>. In an M/M/1 queue the mean response time is S/(1−ρ) = <b>33 ms</b>.', flow: ['users>lb', 'lb>q', 'q>workers'], badges: { q: 'ρ 70%' } },
        { text: 'A campaign adds <b>20%</b> traffic: ρ = 84%. Response time becomes 10/(1−0.84) = <b>63 ms</b>, almost double, for a fifth more load.', flow: [['users>lb', 'users>lb'], 'lb>q'], warn: ['q'], badges: { q: ['ρ 84% · 63 ms', 'warn'] } },
        { text: 'One node of six fails. The rest go to <b>ρ ≈ 100%</b>: arrivals now exceed capacity, the queue grows <b>without bound</b>, and Little\'s Law says in-flight requests grow with it.', nodes: ['q', 'workers'], err: ['q', 'workers'], badges: { q: ['queue → ∞', 'err'], workers: ['1 node down', 'err'] }, tone: 'err' },
        { text: 'Real traffic is burstier than Poisson. <b>Kingman</b>: with variability c² = 2, waiting time is twice the M/M/1 figure at every utilisation.', nodes: ['q'], err: ['q'], badges: { q: ['×2 for bursts', 'err'] } },
        { text: 'The fix is headroom: plan for <b>≤ 70% after losing a node</b>, shed load early, and autoscale on a target well below the knee.', nodes: ['lb', 'workers'], ok: ['lb', 'workers'], badges: { workers: ['plan ≤ 70%', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'usl', title: 'Adding nodes: contention, then retrograde scaling', tone: 'warn',
      steps: [
        { text: 'Load tests at 1, 2, 4 and 8 nodes give 1,000, 1,900, 3,500 and 5,900 req/s. A <b>USL fit</b> gives α ≈ 3% and β ≈ 0.0005.', flow: ['q>workers'], badges: { workers: 'fit α, β' } },
        { text: 'α is the <b>shared lock</b>: every request updates one inventory row. It caps speed-up at 1/α ≈ 33×, however many nodes you add.', flow: ['workers>lock'], warn: ['lock'], badges: { lock: ['α 3%', 'warn'] } },
        { text: 'β is <b>coherency</b>: every node invalidates every other node\'s cache on write. That cost grows with N(N−1) pairs.', flow: ['workers>coh'], warn: ['coh'], badges: { coh: ['β · N²', 'warn'] } },
        { text: 'Peak at N* = √((1−α)/β) ≈ <b>44 nodes</b>. At 64 nodes throughput is <b>lower</b> than at 44: each node adds more crosstalk than work.', nodes: ['workers', 'coh'], err: ['coh', 'workers'], badges: { workers: ['64 < 44', 'err'] }, tone: 'err' },
        { text: 'Remove the shared parts instead of buying nodes: <b>shard</b> the inventory row into buckets (α ↓) and partition the cache by key so writes notify one owner (β ↓).', nodes: ['lock', 'coh'], ok: ['lock', 'coh'], badges: { lock: ['sharded', 'ok'], coh: ['owner only', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'tail', title: 'Fan-out: the tail becomes the median', tone: 'warn',
      steps: [
        { text: 'A search fans out to <b>100 leaf shards</b>. Each leaf answers in 10 ms, except 1% of the time it takes 1 s (GC pause, compaction, noisy neighbour).', flow: ['workers>agg', 'agg>leaves'], badges: { leaves: '1% slow' } },
        { text: 'The root waits for <b>all</b> leaves. Probability that at least one is slow: 1 − 0.99<sup>100</sup> = <b>63%</b>. Most users now see 1 s.', nodes: ['agg'], err: ['agg'], badges: { agg: ['63% slow', 'err'] }, tone: 'err' },
        { text: 'A <b>hedged request</b>: if a leaf has not answered by its p95, send the same read to another replica and use whichever comes first.', flow: ['agg>hedge', 'hedge>leaves'], ok: ['hedge'], badges: { hedge: ['after p95', 'ok'] } },
        { text: 'Only ~5% of sub-requests get a second copy, so extra load is about 5%, yet a leaf is slow only if <b>both</b> copies are. Dean and Barroso report a large p99.9 cut for about <b>2%</b> extra requests.', nodes: ['agg', 'leaves'], ok: ['agg', 'leaves'], badges: { agg: ['tail cut', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'pool', title: 'A bigger DB pool makes it slower', tone: 'err',
      steps: [
        { text: '20 app instances each get <code>maximum-pool-size: 50</code> "to be safe": up to <b>1,000 connections</b> to a 16-core Postgres.', flow: ['workers>pool', 'pool>db'], warn: ['pool'], badges: { pool: ['1,000 conns', 'warn'] } },
        { text: 'Under load all of them are active. The database can only run ~16 at once; the rest <b>context-switch</b>, contend for locks and buffers, and each process uses memory.', nodes: ['db'], err: ['db'], badges: { db: ['16 cores', 'err'] }, tone: 'err' },
        { text: 'Query time W rises from 5 ms to 60 ms. By Little\'s Law, connections in use = λW rises 12×, so the pool fills even faster: a <b>feedback loop</b>.', nodes: ['pool', 'db'], err: ['pool', 'db'], badges: { pool: ['L = λW ↑', 'err'] } },
        { text: 'Shrink the pool so total connections ≈ what the database can run, and let requests <b>wait in the app</b> (cheap) instead of inside Postgres (expensive). Throughput rises; p99 falls.', nodes: ['pool', 'db'], ok: ['pool', 'db'], badges: { pool: ['2 × 20 = 40', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Scenario: a service must handle <b>λ = 2,000 req/s</b>. One node alone serves 100 req/s (10 ms per request). You choose the workload shape, how to scale, how busy to run and how wide each request fans out. The engine finds the <b>smallest cluster</b> that meets the utilisation target, using the USL for capacity and M/M/1 for latency. Numbers are an <em>illustrative model</em>.',
    controls: [
      { id: 'w', label: 'Workload', type: 'seg', value: 'lock', options: [
        { v: 'cpu', l: 'CPU-bound, embarrassingly parallel', hint: 'α 0.5%, β 0.000001' },
        { v: 'lock', l: 'Shared lock / hot row', hint: 'α 3%, β 0.00002' },
        { v: 'chatty', l: 'Chatty coordination', hint: 'α 2%, β 0.0005' }] },
      { id: 'st', label: 'Scaling strategy', type: 'seg', value: 'out', options: [
        { v: 'up', l: 'Scale up (one big box, ≤ 128 cores)' },
        { v: 'out', l: 'Scale out (more nodes)' },
        { v: 'shard', l: 'Shard (groups of 8, nothing shared)' }] },
      { id: 'u', label: 'Target utilisation', type: 'range', min: 30, max: 95, step: 5, value: 85, unit: '%', kind: 'raw', fmt: (v) => v + '%' },
      { id: 'm', label: 'Fan-out width per request', type: 'range', min: 1, max: 200, step: 1, value: 1, kind: 'raw', fmt: (v) => v === 1 ? '1 (no fan-out)' : v + ' calls' }
    ],
    evaluate(s) {
      const LAM = 2000, X1 = 100, S = 10;
      const W = { cpu: [0.005, 0.000001], lock: [0.03, 0.00002], chatty: [0.02, 0.0005] }[s.w];
      let a = W[0], b = W[1], cost = 1, maxN = 1000;
      if (s.st === 'up') { b = b / 3; cost = 1.6; maxN = 128; }            // in-box coherency is cheaper; big boxes cost more per core (estimate)
      const cap = (n) => {
        if (s.st === 'shard') { const g = Math.ceil(n / 8), per = n / g; return X1 * g * usl(per, a, b) * (s.w === 'lock' ? 1 : 0.97); }
        return X1 * usl(n, a, b);
      };
      let n = 1, best = 1;
      for (let k = 1; k <= maxN; k++) { if (cap(k) > cap(best)) best = k; if (LAM / cap(k) <= s.u / 100) { n = k; break; } n = k; }
      const feasible = LAM / cap(n) <= s.u / 100;
      if (!feasible) n = best;
      const C = cap(n), rho = Math.min(LAM / C, 0.999), seff = S * n * X1 / C;
      const pNode = (q) => -Math.log(1 - q) * seff / (1 - rho);     // M/M/1 response-time quantile
      const over = LAM > C;
      const p99 = over ? Infinity : pNode(Math.pow(0.99, 1 / s.m));
      const tail = 1 - Math.pow(0.99, s.m);
      const eff = Math.min(LAM, C) / (n * X1 * cost), scaleEff = C / (n * X1 * cost);
      const head = C / LAM - 1;
      const pk = s.st === 'shard' ? Infinity : peakN(a, b);
      const metrics = [
        { k: 'Throughput', v: Math.round(Math.min(LAM, C)).toLocaleString() + ' / 2,000 req/s', s: Math.min(1, C / LAM) * (over ? 0.6 : 1), hint: over ? 'cannot meet demand' : 'meets demand' },
        { k: 'Cluster size', v: n + (s.st === 'up' ? ' cores, 1 box' : ' nodes') + (isFinite(pk) ? ' · peak N* ≈ ' + Math.round(pk) : ' · no peak'), s: over ? 0.1 : n <= 80 ? 0.85 : n <= 200 ? 0.55 : 0.3 },
        { k: 'p99 latency', v: isFinite(p99) ? SD.fmt.dur(p99) : 'unbounded', s: !isFinite(p99) ? 0 : p99 <= 100 ? 0.9 : p99 <= 250 ? 0.65 : p99 <= 600 ? 0.35 : 0.1, hint: s.m > 1 ? 'slowest of ' + s.m + ' calls' : 'one call' },
        { k: 'Cost efficiency', v: Math.round(eff * 100) + '% of paid capacity does useful work', s: Math.max(0.05, Math.min(1, eff)), hint: 'scaling efficiency ' + Math.round(100 * scaleEff) + '%' },
        { k: 'Headroom', v: over ? 'none: overloaded' : '+' + Math.round(head * 100) + '% burst', s: over ? 0 : head >= 0.4 ? 0.9 : head >= 0.2 ? 0.6 : 0.25 },
        { k: 'Tail exposure', v: Math.round(tail * 100) + '% of requests touch a p99 leaf', s: 1 - tail }
      ];
      const notes = [];
      if (s.w === 'chatty' && s.st === 'out') notes.push('With β = 0.0005 the USL peaks at N* = √((1−α)/β) ≈ <b>' + Math.round(peakN(a, b)) + ' nodes</b>. Past that, each node adds more crosstalk than work.');
      if (s.w === 'lock' && s.st !== 'shard') notes.push('A shared lock at α = 3% caps speed-up at 1/α ≈ <b>33×</b> (Amdahl), so the last nodes add very little: efficiency C(N)/N is ' + Math.round(100 * C / (n * X1)) + '% at ' + n + ' nodes.');
      if (s.st === 'shard') notes.push('Sharding keeps α and β <b>inside a group of 8</b>, so capacity grows almost linearly. The price: cross-shard queries now fan out, so watch the tail.');
      if (s.st === 'up') notes.push('One box has cheaper coherency (shared memory) but tops out at 128 cores and costs more per core (<em>estimate</em>: 1.6×). It is also one failure domain.');
      if (s.u >= 85 && !over) notes.push('At ' + s.u + '% utilisation, waiting is ρ/(1−ρ) = <b>' + (rho / (1 - rho)).toFixed(1) + '×</b> the service time on average, before any burst.');
      if (s.m >= 20) notes.push('Fan-out of ' + s.m + ': p99 of the request is the p' + (100 * Math.pow(0.99, 1 / s.m)).toFixed(2) + ' of one leaf. Hedge reads after the p95 to cut it.');
      let verdict;
      if (over) verdict = '❌ <b>Cannot reach 2,000 req/s.</b> Peak capacity is ' + Math.round(C).toLocaleString() + ' req/s at ' + n + ' nodes; more nodes make it worse. Remove the shared resource (shard) instead.';
      else if (!feasible) verdict = '⚠ <b>The ' + s.u + '% target is out of reach.</b> Even at the best size (' + n + (s.st === 'up' ? ' cores' : ' nodes') + ') the cluster runs at ' + Math.round(rho * 100) + '%: the shared parts eat every extra node.';
      else if (scaleEff < 0.5) verdict = '⚠ <b>It works, but you pay for contention:</b> scaling efficiency is ' + Math.round(100 * scaleEff) + '%, so most of each node you buy is lost to the shared parts. Sharding or removing coordination is cheaper than nodes.';
      else if (s.u >= 90) verdict = '⚠ <b>Cheap but fragile:</b> the cluster meets demand, but at ' + s.u + '% busy a small burst or one failed node pushes latency up the knee.';
      else if (p99 > 250) verdict = '⚠ <b>Throughput is fine, the tail is not.</b> Fan-out multiplies rare slowness; lower utilisation, hedge requests or reduce fan-out.';
      else if (s.u <= 50) verdict = '👍 <b>Fast and safe, but expensive:</b> at ' + s.u + '% you pay for lots of idle capacity. 60–70% is the usual compromise.';
      else verdict = '✅ <b>Balanced:</b> enough nodes below the USL peak, utilisation below the knee, and a tail you can live with.';
      return {
        metrics, verdict, notes,
        flow: ['users>lb', 'lb>q', 'q>workers', s.w === 'lock' ? 'workers>lock' : s.w === 'chatty' ? 'workers>coh' : 'workers>pool'].concat(s.m > 1 ? ['workers>agg', 'agg>leaves'] : []),
        labels: {
          workers: { label: s.st === 'up' ? 'One big box' : s.st === 'shard' ? 'Shards of 8' : 'Workers × N', sub: n + (s.st === 'up' ? ' cores' : ' nodes') + ' · ρ ' + Math.round(rho * 100) + '%' },
          lock: { label: 'Shared lock', sub: 'α = ' + (a * 100).toFixed(0) + '%' + (s.st === 'shard' ? ' per shard' : '') },
          coh: { label: 'Coherency', sub: 'β = ' + b.toFixed(5).replace(/0+$/, '') },
          leaves: { label: 'Leaf shards × ' + s.m, sub: Math.round(tail * 100) + '% hit a slow one' }
        },
        hide: s.m > 1 ? [] : ['agg', 'leaves', 'hedge'],
        err: over ? ['workers', 'q'] : [],
        warn: (s.u >= 85 ? ['q'] : []).concat(s.w === 'lock' && s.st !== 'shard' ? ['lock'] : []).concat(s.w === 'chatty' && s.st !== 'shard' ? ['coh'] : []),
        ok: !over && s.u <= 75 ? ['workers'] : [],
        badges: { q: ['ρ ' + Math.round(rho * 100) + '%', rho >= 0.85 ? 'warn' : 'info'], workers: [n + (s.st === 'up' ? ' cores' : ' nodes'), over ? 'err' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Speed-up curves, the queueing knee and the tail at scale',
    caption: 'Three live models. <b>Top:</b> relative capacity as nodes grow for <b>Amdahl</b> (fixed problem), <b>Gustafson</b> (problem grows with N) and the <b>USL</b> (contention α plus coherency β); the dot marks the USL peak N*. <b>Middle:</b> response time ÷ service time versus utilisation for an M/M/1 queue, scaled by <b>Kingman\'s</b> variability factor. <b>Bottom:</b> 2,000 simulated requests fanning out to M leaves (each slow 1% of the time), with and without <b>hedging</b> after the leaf\'s p95.'
  },

  realWorld: {
    intro: 'The laws come from a 1960s mainframe debate, operations research and Google-scale serving. Every card links to its source.',
    timeline: [
      { when: '1961', who: 'John D. C. Little', title: 'A proof for L = λW', text: 'Little proves in <i>Operations Research</i> that if the long-run averages exist and the system is stationary, <b>L = λW</b>. It needs no assumption about arrival or service distributions, which is why it applies to thread pools, connection pools and Kafka consumers alike.', src: 0 },
      { when: '1961', who: 'J. F. C. Kingman', title: 'The single server queue in heavy traffic', text: 'Kingman\'s heavy-traffic approximation for a G/G/1 queue: waiting ≈ <b>ρ/(1−ρ) × (c<sub>a</sub>² + c<sub>s</sub>²)/2 × service time</b>. Utilisation, variability and time multiply, so burstiness matters as much as load.', src: 1 },
      { when: '1967', who: 'Gene Amdahl (IBM)', title: 'Validity of the single processor approach', text: 'A three-page AFIPS paper with no equations argues that the sequential "housekeeping" part of a workload limits what multiprocessors can deliver. The formula 1/(s + (1−s)/N) was written down later by others from this argument.', src: 2 },
      { when: '1988', who: 'John Gustafson (Sandia)', title: 'Reevaluating Amdahl\'s Law', text: 'A one-page <i>Communications of the ACM</i> note: in practice users <b>grow the problem</b> with the machine, so the serial part shrinks as a share and <b>scaled speed-up</b> N − s(N−1) stays near linear. It reframes Amdahl rather than refuting it.', src: 3 },
      { when: '1993 · 2008', who: 'Neil Gunther', title: 'Universal Scalability Law', text: 'First presented at the 1993 CMG conference, the USL adds a <b>coherency</b> term β·N(N−1) to Amdahl\'s contention term. With β &gt; 0 capacity has a maximum and then goes retrograde. Gunther\'s 2008 paper shows it is a rational function that includes Amdahl (β = 0) as a special case.', src: 4 },
      { when: '2011', who: 'John Little', title: 'Little\'s Law at 50', text: 'Little\'s retrospective in <i>Operations Research</i> explains how the law moved from queueing theory into operations management and computing, and stresses that it is about <b>long-run averages</b> of a stable system.', src: 5 },
      { when: '2013', who: 'Jeff Dean & Luiz André Barroso (Google)', title: 'The Tail at Scale', text: 'If a server is slow 1 in 100 times, a request fanning out to 100 such servers is slow <b>63%</b> of the time. Remedies: <b>hedged</b> and <b>tied requests</b>, micro-partitions and selective replication. In their BigTable example, hedging after 10 ms cut p99.9 latency for a 1,000-key read from 1,800 ms to 74 ms with about <b>2%</b> more requests.', src: 6 },
      { when: '2010s', who: 'HikariCP (Brett Wooldridge)', title: 'About Pool Sizing', text: 'The HikariCP wiki argues that a database connection pool should be <b>small</b>: start at <code>(core_count × 2) + effective_spindle_count</code>, count physical cores only, and tune with a load test. Many more connections than cores only adds context switching.', src: 7 },
      { when: '2017', who: 'Baron Schwartz (VividCortex)', title: 'Scalability is quantifiable', text: 'A USENIX LISA talk and free e-book that brought the USL to operations teams: fit α and β from production throughput and concurrency, and treat the fit as a <b>best case</b> when forecasting beyond what you have measured.', src: 8 },
      { when: '2023', who: 'OpenJDK', title: 'JEP 444: Virtual Threads (Java 21)', text: 'The JEP argues that in thread-per-request servers, concurrency must grow with throughput (Little\'s Law), and that platform threads cap throughput below what the hardware supports. Virtual threads make that many threads cheap; the downstream still needs a <b>limit</b>.', src: 9 }
    ],
    lessons: [
      'Capacity is limited by what is <b>shared</b>. Find the lock, leader or coordination round before you buy nodes.',
      'Fit the USL to <b>measured</b> points; if β &gt; 0, know your peak and stay well below it.',
      'Size every pool with <b>L = λW</b>, then cap it at what the downstream can actually run in parallel.',
      'Plan utilisation for the <b>bad day</b> (a node lost, a burst), and measure latency at the tail, multiplied by fan-out.'
    ],
    sources: [
      { title: 'A Proof for the Queuing Formula: L = λW', url: 'https://econpapers.repec.org/RePEc:inm:oropre:v:9:y:1961:i:3:p:383-387', pub: 'John D. C. Little, Operations Research 9(3), 1961' },
      { title: 'Kingman\'s formula', url: 'https://en.wikipedia.org/wiki/Kingman%27s_formula', pub: 'Wikipedia summary of Kingman, Proc. Cambridge Phil. Soc. 57(4), 1961 (secondary source)' },
      { title: 'Validity of the single processor approach to achieving large scale computing capabilities', url: 'https://www3.cs.stonybrook.edu/~rezaul/Spring-2019/CSE613/reading/Amdahl-1967.pdf', pub: 'Gene M. Amdahl, AFIPS Spring Joint Computer Conference, 1967 (IEEE SSCS News reprint, 2007)' },
      { title: 'Reevaluating Amdahl\'s Law', url: 'https://users.cs.utah.edu/~hari/teaching/paralg/Gustafson88.pdf', pub: 'John L. Gustafson, Communications of the ACM 31(5), 1988' },
      { title: 'A General Theory of Computational Scalability Based on Rational Functions', url: 'https://arxiv.org/pdf/0808.1431', pub: 'Neil J. Gunther, arXiv, 2008' },
      { title: 'Little\'s Law as Viewed on Its 50th Anniversary (reprint)', url: 'https://projectproduction.org/journal/reprint-littles-law-as-viewed-on-its-50th-anniversary/', pub: 'John D. C. Little, Operations Research 59(3), 2011' },
      { title: 'The Tail at Scale', url: 'https://research.google/pubs/pub40801/', pub: 'Jeffrey Dean, Luiz André Barroso, Communications of the ACM 56(2), 2013' },
      { title: 'About Pool Sizing', url: 'https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing', pub: 'HikariCP wiki' },
      { title: 'Scalability Is Quantifiable: The Universal Scalability Law', url: 'https://www.usenix.org/conference/lisa17/conference-program/presentation/schwartz', pub: 'Baron Schwartz, USENIX LISA17, 2017' },
      { title: 'JEP 444: Virtual Threads', url: 'https://openjdk.org/jeps/444', pub: 'OpenJDK, delivered in JDK 21 (2023)' },
      { title: 'How to Quantify Scalability', url: 'https://www.perfdynamics.com/Manifesto/USLscalability.html', pub: 'Neil Gunther, Performance Dynamics' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['How to add capacity', '<b>Scale up</b>: one bigger box, shared memory keeps β low', '<b>Scale out</b>: more nodes, no hardware ceiling, more failure domains', 'Up while it fits in one box and the workload is chatty; out when it is parallel or you need fault isolation.'],
      ['Remove the shared part', '<b>Shard / partition</b>: α and β stay inside each partition', '<b>Keep one shared store</b> and scale around it', 'Shard when the fit shows α or β dominate; accept cross-shard queries and their fan-out tail.'],
      ['Utilisation target', '<b>High (80–90%)</b>: cheaper', '<b>Moderate (50–70%)</b>: headroom for bursts and failover', 'High for batch and async queues; moderate for interactive, latency-SLO traffic (<em>rule of thumb</em>).'],
      ['Pool size', '<b>Small</b>: ≈ L = λW plus headroom, capped by downstream cores', '<b>Large</b>: "never wait for a connection"', 'Almost always small: waiting in the app is cheaper than thrashing inside the database.'],
      ['Fan-out', '<b>Wide</b>: more parallelism, lower median', '<b>Narrow</b> or two-level: fewer leaves to wait on', 'Wide only with hedging, tied requests or partial results; narrow when p99 matters more than p50.'],
      ['Concurrency model', '<b>Platform-thread pool</b>: the pool size is the limit', '<b>Virtual threads</b>: cheap threads, explicit limits (semaphores) per downstream', 'Virtual threads for blocking I/O-heavy Java 21 services, always with a semaphore per scarce resource.']
    ]
  },
  failures: [
    { f: '<b>Retrograde scaling</b>: adding nodes lowers throughput', detect: 'Load tests at several sizes; throughput per node falls and total throughput drops past a point. USL fit gives β &gt; 0.', fix: 'Stop adding nodes. Find the coherency cost (cache invalidation, gossip, distributed locks) and partition it so each write talks to one owner.' },
    { f: '<b>Running past the knee</b>', detect: 'p99 rises sharply with small traffic increases; queue length and in-flight requests grow while throughput is flat.', fix: 'Set utilisation targets with headroom for N−1 nodes, autoscale earlier, and shed or rate-limit before the queue explodes.' },
    { f: '<b>Oversized connection pool</b>', detect: 'Database CPU and context switches high, active connections ≫ cores, query latency rises with pool size.', fix: 'Total connections ≈ a small multiple of database cores (HikariCP heuristic), shared across instances; a proxy pooler (PgBouncer) if instances are many.' },
    { f: '<b>Little\'s Law on an unstable system</b>', detect: 'Arrival rate exceeds completion rate; the queue grows over the measurement window.', fix: 'Little\'s Law only holds when the system is stable. Fix capacity first, then size with L = λW.' },
    { f: '<b>Fan-out tail amplification</b>', detect: 'Root p99 far above leaf p99; latency correlates with the number of shards touched.', fix: 'Hedge or tie idempotent reads, return partial results by deadline, reduce fan-out with better partitioning or a two-level tree.' },
    { f: '<b>Extrapolating a fit too far</b>', detect: 'Forecast for 64 nodes from points measured at 1–4 nodes; real results fall short.', fix: 'Measure at least 4–6 points spread over the range, treat the USL as a best case, and re-test before each big step.' }
  ],

  interview: [
    { q: 'State Amdahl\'s Law. What does it say about a job that is 95% parallel?', a: '<b>Gene Amdahl, 1967</b>: speed-up on N processors is <code>1 / (s + (1−s)/N)</code>, where s is the serial fraction. With s = 5% the limit as N → ∞ is <b>1/s = 20×</b>. At 64 cores you get about 15×, so the last 48 cores buy you only a few ×. Common misreading: Amdahl is not "parallelism is useless", it says <b>shrink the serial part first</b>.', lvl: 'core' },
    { q: 'How does Gustafson\'s Law differ from Amdahl\'s? Which applies to a web service?', a: '<b>Amdahl</b> fixes the problem size and asks how much faster it runs. <b>Gustafson (1988)</b> fixes the run time and lets the problem grow with N, giving scaled speed-up <code>N − s(N−1)</code>. They are two views of the same arithmetic. A web service with growing traffic is closer to Gustafson for <b>throughput</b> (more independent requests), but each <b>single request\'s latency</b> obeys Amdahl.', lvl: 'core' },
    { q: 'What is the Universal Scalability Law and what do α and β mean?', a: 'Neil Gunther\'s model: <code>C(N) = N / (1 + α(N−1) + βN(N−1))</code>. <b>α</b> is contention (queueing for a shared resource, the Amdahl term). <b>β</b> is coherency or crosstalk: the cost of workers keeping each other consistent, which grows with pairs. With β &gt; 0 throughput <b>peaks at N* = √((1−α)/β)</b> and then falls (retrograde). I fit it with non-linear least squares to load-test points.', fu: 'What would you change in the system if β is large?', lvl: 'core' },
    { q: 'Explain Little\'s Law and use it to size a thread pool.', a: '<b>L = λW</b> (John Little, 1961): the average number in a stable system equals arrival rate times average time in system, with no assumption about distributions. If a service gets 500 req/s and each request takes 80 ms, <b>40</b> are in flight on average, so a worker pool of 40 is the floor; add headroom for bursts (e.g. 2×). If the pool is smaller, requests wait in a queue and W grows until the equation balances.', lvl: 'core' },
    { q: 'Why does latency explode near 100% utilisation?', a: 'For an M/M/1 queue mean response time is <code>W = 1/(μ − λ) = S/(1−ρ)</code>, so waiting is <b>ρ/(1−ρ)</b> service times: 1× at 50%, 4× at 80%, 9× at 90%, 19× at 95%. The curve is flat then vertical. <b>Kingman\'s</b> approximation adds a variability factor (c<sub>a</sub>² + c<sub>s</sub>²)/2, so bursty traffic hits the knee earlier. That is why interactive services plan for ~60–70% (a rule of thumb, not a law).', lvl: 'core' },
    { q: 'Your 20 app instances each have a HikariCP pool of 50 and Postgres is slow. What do you do?', a: 'That is up to 1,000 connections to a database that can run maybe 16–32 queries at once. Extra connections add context switching and lock contention, so query time W rises, and by Little\'s Law more connections are busy. I would <b>shrink the pools</b>: start from HikariCP\'s rule of thumb, (2 × cores) + effective spindles for the <i>whole</i> database, check it against λW from metrics, and split it across instances, or put PgBouncer in front if there are many instances. Then load-test.', lvl: 'deep' },
    { q: 'What is "the tail at scale" and how would you mitigate it?', a: 'Dean and Barroso (2013): when a request fans out to many servers, the slowest one sets its latency. With 100 leaves each slow 1% of the time, <code>1 − 0.99<sup>100</sup> ≈ 63%</code> of requests are slow. Mitigations: <b>hedged requests</b> (send a duplicate after the p95 delay), <b>tied requests</b> (enqueue on two servers that cancel each other), micro-partitioning, returning partial results by a deadline, and removing sources of variability (GC, background jobs).', fu: 'When is hedging dangerous?', lvl: 'core' },
    { q: 'When is hedging a bad idea?', a: 'When the request is <b>not idempotent</b>, when the slowness is caused by <b>overload</b> (duplicates add load to a saturated system and can cause a metastable failure), or when replicas share the same bottleneck so the duplicate is just as slow. Limit hedges to a small budget (a few % of requests), send them only after a delay, and cancel the loser.', lvl: 'deep' },
    { q: 'You are asked: "If we double the nodes, will we double throughput?" How do you answer in a design review?', a: '"Only if nothing is shared." I would ask for throughput measured at 1, 2, 4, 8 nodes, fit α and β, and show the predicted curve with N* marked. If the plan is beyond ~half of N*, or the efficiency C(N)/N is under ~0.7, buying nodes is the wrong lever: we should <b>remove the shared resource</b> (shard the hot row, partition the cache, avoid cluster-wide coordination). Then I would name the risk: a USL fit is a best case outside the measured range.', lvl: 'deep' },
    { q: 'Do virtual threads in Java 21 make Little\'s Law irrelevant?', a: 'No, they make it <b>affordable</b>. JEP 444 argues that thread-per-request needs L = λW threads, which platform threads cannot supply at high λ or long W. Virtual threads remove the thread limit, but the database, a partner API or a CPU still has a fixed capacity, so <b>the limit moves to a semaphore</b> per scarce resource. Without one, a million virtual threads will happily open a million connections.', lvl: 'deep' },
    { q: 'Tell me about a time you used capacity modelling to change a scaling decision.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Our order service was at 2,400 req/s on 12 pods and the plan for peak season was to go to 36 pods. <b>T:</b> I owned the capacity sign-off. <b>A:</b> I ran stepped load tests at 3, 6, 12 and 24 pods, fitted the USL (α ≈ 4%, β ≈ 0.0008, peak ≈ 35 pods) and showed that 36 pods would give only ~4% more than 24. The β came from a cache that broadcast invalidations to every pod; we partitioned it by order id so each write notified one owner. <b>R:</b> The refit (β ≈ 0.0001) put the peak near 100 pods, 24 pods handled the 3,500 req/s peak at about 65% CPU, and we cancelled the extra 12 pods.', lvl: 'deep' },
    { q: 'Tell me about a time a system fell over well below its "max capacity".', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> A search API sized for 90% CPU started missing its 300 ms p99 SLO every Monday morning at ~75% of tested max throughput. <b>T:</b> Explain it and fix it without doubling the fleet. <b>A:</b> I plotted p99 against utilisation from our metrics: a classic knee, made worse by bursty arrivals (Kingman) and a 40-shard fan-out where one slow shard set the latency. We lowered the autoscaling target to 65%, added hedged reads after the shard p95, and capped the batch reindex job\'s concurrency. <b>R:</b> p99 dropped from ~900 ms to ~220 ms at peak, with about 20% more pods rather than 100%.', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot 3: HikariCP pool sized with Little\'s Law',
      lang: 'yaml',
      code: `# Measured at peak (per app instance, 3 instances):
#   λ = 200 queries/s,  W = 12 ms average connection hold time
#   Little: busy connections L = λ × W = 200 × 0.012 = 2.4
#   Bursts and p99 hold times: × 2.5 headroom  -> 6
# Database side: Postgres on 8 physical cores, data set cached.
#   HikariCP rule of thumb (whole DB): (2 × 8) + 0 = 16 connections
#   3 instances × 6 = 18 ≈ 16, so 6 per instance is within budget.
spring:
  datasource:
    url: jdbc:postgresql://orders-db:5432/orders
    username: orders_app
    hikari:
      pool-name: orders
      maximum-pool-size: 6        # L = λW with headroom, capped by DB cores
      minimum-idle: 6             # fixed-size pool, as HikariCP recommends
      connection-timeout: 500     # ms: fail fast instead of queueing forever
      max-lifetime: 1800000       # 30 min, below any proxy / DB idle cutoff
      validation-timeout: 250
  threads:
    virtual:
      enabled: true               # Spring Boot 3.2+: request threads are virtual,
                                  # so the pool (not the thread count) is the limit
management:
  metrics:
    enable:
      hikaricp: true              # watch pending threads and usage time (= W)`,
      note: 'Re-derive the number when traffic or query time changes: <code>hikaricp.connections.usage</code> is W and the query rate is λ. If <code>hikaricp.connections.pending</code> is often above zero at normal load, the database is the bottleneck, not the pool size.'
    },
    {
      title: 'Python: fit the Universal Scalability Law to load-test results',
      lang: 'python',
      code: `import numpy as np
from scipy.optimize import curve_fit

# Stepped load test: nodes -> max throughput (req/s) at the latency SLO
n = np.array([1, 2, 4, 8, 16, 24, 32], dtype=float)
x = np.array([980, 1890, 3560, 6150, 9300, 10400, 10600], dtype=float)

def usl(n, lam1, alpha, beta):
    """Gunther's USL: X(N) = λ1·N / (1 + α(N−1) + βN(N−1))."""
    return lam1 * n / (1 + alpha * (n - 1) + beta * n * (n - 1))

(lam1, alpha, beta), cov = curve_fit(
    usl, n, x,
    p0=[x[0], 0.02, 0.0005],
    bounds=([0, 0, 0], [np.inf, 1, 1]),   # α, β must be non-negative
)
resid = x - usl(n, lam1, alpha, beta)
r2 = 1 - (resid ** 2).sum() / ((x - x.mean()) ** 2).sum()

peak_n = np.sqrt((1 - alpha) / beta) if beta > 0 else float("inf")
print(f"λ1={lam1:.0f} req/s  α={alpha:.4f}  β={beta:.6f}  R²={r2:.3f}")
print(f"peak at N*≈{peak_n:.1f} nodes, X(N*)≈{usl(peak_n, lam1, alpha, beta):.0f} req/s")
for target in (48, 64):
    eff = usl(target, lam1, alpha, beta) / (lam1 * target)
    print(f"N={target}: {usl(target, lam1, alpha, beta):.0f} req/s, efficiency {eff:.0%}")`,
      note: 'Measure throughput at a fixed latency SLO, not at "whatever it does when saturated". Use 5+ points spread over the range, and treat predictions beyond the largest measured N as a <b>best case</b>.'
    },
    {
      title: 'Java 21: virtual threads with a semaphore bulkhead',
      lang: 'java',
      code: `import java.util.concurrent.*;

public final class InventoryClient {
    // Little: 300 calls/s × 40 ms = 12 in flight on average; allow 24.
    private final Semaphore permits = new Semaphore(24);
    private final HttpLikeApi api;

    public InventoryClient(HttpLikeApi api) { this.api = api; }

    public Stock fetch(String sku) throws InterruptedException {
        // Bound the wait: being rejected fast beats queueing past the knee.
        if (!permits.tryAcquire(20, TimeUnit.MILLISECONDS)) {
            throw new RejectedExecutionException("inventory bulkhead full");
        }
        try {
            return api.get(sku);            // blocking call: cheap on a virtual thread
        } finally {
            permits.release();
        }
    }

    public static void main(String[] args) throws Exception {
        var client = new InventoryClient(sku -> new Stock(sku, 3));
        try (ExecutorService exec = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = java.util.stream.IntStream.range(0, 10_000)
                .mapToObj(i -> exec.submit(() -> client.fetch("sku-" + i)))
                .toList();                  // 10,000 threads, at most 24 calls in flight
            for (var f : futures) f.get();
        }
    }

    public record Stock(String sku, int qty) {}
    @FunctionalInterface public interface HttpLikeApi { Stock get(String sku); }
}`,
      note: 'Virtual threads remove the thread-count limit, so the <b>semaphore</b> becomes the place where Little\'s Law is enforced. Size it from λ × W of the downstream, not from the number of requests you can accept.'
    }
  ],

  related: ['reliability-math', 'resiliency-patterns', 'finops', 'sd:distributed-cache', 'sd:llm-inference', 'sd:search-engine']
});
})();
