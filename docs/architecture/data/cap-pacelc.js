SD.register({
  slug: 'cap-pacelc',
  domain: 1,
  title: 'CAP & PACELC',
  examples: 'Brewer, Gilbert–Lynch, Abadi',
  tagline: 'When the network splits, a replicated store must <b>refuse some requests or let copies disagree</b>. When it does not split, every request still pays: <b>wait for other replicas, or answer fast and maybe stale</b>.',
  tldr: {
    problem: 'You keep copies of data on several machines so you survive failures. Copies must talk over a network, and networks drop, delay and cut messages. What should a replica do when it <b>cannot reach the others</b>?',
    idea: '<b>CAP</b> (Brewer 2000, proved by Gilbert &amp; Lynch 2002): during a <b>partition</b>, a system cannot be both <b>linearizable</b> and answer every request. <b>PACELC</b> (Abadi 2012): if <b>P</b>artitioned choose <b>A</b> or <b>C</b>; <b>E</b>lse choose <b>L</b>atency or <b>C</b>onsistency.',
    insight: 'Partitions are rare, but the <b>latency vs consistency</b> trade-off is paid on <i>every</i> request. In an interview, decide <b>per operation</b> (cart vs balance), name the quorum (R + W &gt; N), and say what happens at <b>heal time</b>.',
    numbers: [
      { v: '2 of 3?', l: 'misleading: Brewer (2012) says only C vs A during a partition is the real choice' },
      { v: 'R + W > N', l: 'read and write quorums overlap, so a read meets the latest acked write' },
      { v: '(3, 2, 2)', l: 'common (N, R, W) in Amazon\'s Dynamo paper (2007)' }
    ]
  },

  intro: {
    what: 'The <b>CAP theorem</b> is a rule about databases that keep copies of the same data on several machines. It says that when those machines <b>cannot talk to each other</b>, each one must choose: <b>refuse the request</b> (stay correct) or <b>answer anyway</b> (stay up, risk being wrong). <b>PACELC</b> adds the everyday case: even when the network is fine, waiting for other copies makes every request slower.',
    analogy: {
      icon: '📒',
      title: 'Two bank branches with one shared ledger',
      text: 'Two branches each keep a copy of your account book and phone each other after every change. One day the phone line is cut. A customer asks the cut-off branch for a withdrawal. The clerk can <b>say no</b> until the line is back (correct but unhelpful), or <b>pay out</b> and fix the books later (helpful, but you might overdraw twice). Even on a normal day, phoning the other branch before every withdrawal makes the queue slower. The analogy is loose in one place: real databases detect a "cut line" only through timeouts, so they can never be sure the other side is down rather than just slow.'
    },
    problem: 'You replicate your orders table to a second region for safety. A fibre cut separates the regions for ten minutes. Customers in both regions keep clicking <b>Buy</b>. If both regions accept, the last item in stock is sold twice. If one region refuses, its customers see errors. <b>Which side may keep writing, and what do you do with the writes when the link heals?</b>',
    story: [
      {
        stage: 'naive',
        title: 'One database, one copy',
        text: 'Every app talks to <b>one database</b>. There is only one copy, so every read sees the latest write. Simple and correct, until that one machine, or the network to it, fails.',
        scene: {
          nodes: [
            { id: 'cw', label: 'Web app', sub: 'Europe users', kind: 'client', at: [70, 0] },
            { id: 'ce', label: 'Mobile app', sub: 'US users', kind: 'client', at: [350, 0] },
            { id: 'db', label: 'One database', sub: 'single copy', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'cw', to: 'db' }, { from: 'ce', to: 'db' }],
          flow: [['cw>db', 'ce>db']],
          ok: ['db']
        }
      },
      {
        stage: 'breaks',
        title: 'Two copies, and the link between them is cut',
        text: 'You add a copy in a second region for safety and speed. Then the network between regions is <b>cut</b>. A write arrives on each side. Each copy must either <b>refuse</b> (it cannot confirm with the other) or <b>accept</b> and let the copies drift apart.',
        scene: {
          nodes: [
            { id: 'cw', label: 'Web app', sub: 'Europe users', kind: 'client', at: [70, 0] },
            { id: 'ce', label: 'Mobile app', sub: 'US users', kind: 'client', at: [350, 0] },
            { id: 'rw', label: 'Copy West', sub: 'stock = 1', kind: 'store', at: [70, 110] },
            { id: 're', label: 'Copy East', sub: 'stock = 1', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'cw', to: 'rw' }, { from: 'ce', to: 're' }, { from: 'rw', to: 're', bidi: true, dashed: true }],
          flow: [['cw>rw', 'ce>re']],
          err: ['rw', 're'],
          badges: { rw: ['sold ✓', 'warn'], re: ['sold ✓ again?', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Majority decides, and you choose per operation',
        text: 'Keep <b>three</b> copies. A write counts when a <b>majority</b> (2 of 3) confirms it, so only one side of a cut can keep writing. For data where a stale answer is harmless, like a shopping cart, let both sides accept and <b>merge</b> after the link heals.',
        scene: {
          nodes: [
            { id: 'cw', label: 'Web app', sub: 'Europe users', kind: 'client', at: [70, 0] },
            { id: 'ce', label: 'Mobile app', sub: 'US users', kind: 'client', at: [350, 0] },
            { id: 'rw', label: 'Replica A', sub: 'West', kind: 'store', at: [70, 110] },
            { id: 'rb', label: 'Replica B', sub: 'West', kind: 'store', at: [70, 220] },
            { id: 're', label: 'Replica C', sub: 'East · minority', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'cw', to: 'rw' }, { from: 'ce', to: 're' }, { from: 'rw', to: 'rb', bidi: true }, { from: 'rw', to: 're', bidi: true, dashed: true }],
          flow: ['cw>rw', 'rw>rb', 'ce>re'],
          ok: ['rw', 'rb'],
          warn: ['re'],
          badges: { rb: ['2 of 3 ✓', 'ok'], re: ['balance: refuse', 'warn'] }
        }
      }
    ],
    usedBy: ['Google Spanner', 'Amazon DynamoDB', 'Apache Cassandra', 'CockroachDB', 'MongoDB replica sets', 'PostgreSQL streaming replication'],
    whenToUse: [
      'You replicate data across machines, zones or regions and must say what happens when they cannot talk',
      'You are choosing a database or a consistency level per query (ONE, QUORUM, majority, strong read)',
      'You must justify to product why checkout fails during an outage but the cart keeps working'
    ],
    whenNot: [
      'A single-node database with no replicas: there is nothing to partition (crash recovery is a different problem)',
      'You need to reason about transaction isolation anomalies such as write skew (see <a href="consistency-models.html">Consistency Models &amp; Isolation</a>)',
      'You need to know how replicas agree on order and who is leader (see <a href="consensus-theory.html">Consensus &amp; Impossibility Results</a>)'
    ],
    glossary: [
      { term: 'Partition', def: 'Some nodes cannot exchange messages with others (lost or delayed indefinitely), while each side keeps running.' },
      { term: 'Linearizability', def: 'The C in CAP: the system behaves as if there is one copy, and every read returns the latest completed write.' },
      { term: 'Availability (CAP)', def: 'Every request that reaches a non-failing node eventually gets a non-error response.' },
      { term: 'Quorum', def: 'The number of replicas that must answer: W for a write, R for a read, out of N copies.' },
      { term: 'Eventual consistency', def: 'If writes stop, all replicas converge to the same value at some point; reads before that may be stale.' },
      { term: 'Hinted handoff', def: 'A reachable node keeps a write meant for an unreachable replica and forwards it when that replica returns.' },
      { term: 'Last-write-wins (LWW)', def: 'On conflict, keep the version with the highest timestamp and silently drop the others.' },
      { term: 'Siblings / vector clock', def: 'Concurrent versions are all kept, tagged with per-node counters, so the application can merge them.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Partitions are not optional.</b> Any system that sends messages over a network will see them; only the response is a choice',
      'During a partition, <b>each operation</b> either waits or fails (C) or answers from local state (A)',
      'Outside partitions, every replicated operation trades <b>latency</b> (wait for remote replicas) against <b>consistency</b> (PACELC "E")',
      'Pick <b>overlapping quorums</b> (R + W &gt; N) where reads must see the latest acknowledged write',
      'Design <b>partition mode</b> and <b>recovery</b> explicitly: what is allowed, what is logged, how it is merged',
      'Choose consistency <b>per data type and per operation</b>, not per company'
    ],
    nonFunctional: [
      'Ledger and inventory writes: <b>zero</b> lost or double-applied acknowledged writes',
      'Cart and session writes accepted <b>≥ 99.99%</b> of the time, including during a region cut',
      'Local reads <b>p99 &lt; 10 ms</b>; cross-region quorum reads budgeted at ~1 RTT (<em>rule of thumb</em>)',
      'Bounded staleness for replica reads: e.g. <b>&lt; 1 s</b> lag at p99, alerted',
      'Conflicts after heal resolved <b>deterministically</b>, with zero silent drops for money',
      'Failover RPO stated per store: <b>0</b> with synchronous quorum, <b>seconds</b> with async replication'
    ],
    outOfScope: [
      '<b>"We are CA"</b>: claiming to give up partition tolerance in a system that runs on a network',
      '<b>One label for the whole database</b> ("Cassandra is AP") without naming the consistency level',
      '<b>Last-write-wins on money</b>: concurrent debits silently vanish',
      '<b>Async replica reads for read-your-writes flows</b>: the user saves, refreshes, and the change is gone',
      '<b>Infinite retries against a CP store in partition</b>: clients turn a minority outage into a retry storm'
    ]
  },

  calculator: {
    inputs: [
      { id: 'n', label: 'Replicas N', min: 1, max: 9, value: 3 },
      { id: 'w', label: 'Write quorum W (acks before success)', min: 1, max: 9, value: 2 },
      { id: 'r', label: 'Read quorum R (replies before answer)', min: 1, max: 9, value: 2 },
      { id: 'rtt', label: 'Cross-region round trip', min: 1, max: 250, value: 70, unit: 'ms', log: true },
      { id: 'parts', label: 'Partitions per year (between regions)', min: 0, max: 50, value: 6 },
      { id: 'dur', label: 'Mean partition duration', min: 1, max: 120, value: 12, unit: 'min' }
    ],
    outputs: [
      { label: 'Quorum overlap (R + W > N)?', fmt: 'raw', f: (v) => { const w = Math.min(v.w, v.n), r = Math.min(v.r, v.n); return (r + w > v.n) ? 'yes: ' + r + ' + ' + w + ' > ' + v.n + ', reads meet the latest write' : 'no: ' + r + ' + ' + w + ' ≤ ' + v.n + ', stale reads possible'; } },
      { label: 'Write latency (W-th ack, replicas spread over 3 regions)', fmt: 'ms', f: (v) => { const local = Math.ceil(v.n / 3), w = Math.min(v.w, v.n); return w <= local ? 1 : v.rtt; } },
      { label: 'Read latency (R-th reply)', fmt: 'ms', f: (v) => { const local = Math.ceil(v.n / 3), r = Math.min(v.r, v.n); return r <= local ? 1 : v.rtt; } },
      { label: 'Replicas that can be down and still serve', fmt: 'raw', f: (v) => 'writes: ' + Math.max(0, v.n - Math.min(v.w, v.n)) + ' · reads: ' + Math.max(0, v.n - Math.min(v.r, v.n)) },
      { label: 'Staleness window with no partition', fmt: 'raw', f: (v) => (Math.min(v.r, v.n) + Math.min(v.w, v.n) > v.n) ? '0: quorums overlap' : '≈ ' + SD.fmt.dur(v.rtt / 2 + 5) + ' or more (one-way delay + apply, estimate)' },
      { label: 'Time per year in partition mode', fmt: 'raw', f: (v) => { const m = v.parts * v.dur; return SD.fmt.num(m) + ' min (' + (m / 5256).toFixed(3) + '% of the year)'; } }
    ],
    note: 'Latency model: replicas are spread evenly over 3 regions, so <code>ceil(N/3)</code> are local (~1 ms) and the rest are one cross-region RTT away (<em>estimate</em>; real p99 is higher). Partition counts and durations are <em>illustrative</em>; measure yours. Notice the asymmetry PACELC points at: a few minutes a year in partition mode, but the <b>RTT on every quorum request</b>, all year.'
  },

  api: [
    { m: 'ADR', p: 'ADR-017: consistency per data class', d: 'Context, decision and consequences: <b>ledger = CP</b> (strict quorum, fail fast in partition), <b>cart = AP</b> (accept locally, merge on heal), <b>catalog = EL</b> (stale replica reads OK for 5 s). Names the PACELC letter for each.' },
    { m: 'POLICY', p: 'Consistency contract per endpoint', d: 'For every API: read level (<code>ONE</code> / <code>LOCAL_QUORUM</code> / strong), write level, staleness bound, and what the caller sees in partition (<code>503 + Retry-After</code> vs degraded success).' },
    { m: 'YAML', p: 'Driver profiles', d: 'Named execution profiles such as <code>ledger</code> (<code>LOCAL_QUORUM</code> + serial <code>LOCAL_SERIAL</code>) and <code>feed</code> (<code>LOCAL_ONE</code>), so code picks a profile, not a raw level.' },
    { m: 'SQL', p: 'synchronous_standby_names', d: 'Postgres quorum commit: <code>ANY 1 (replica_b, replica_c)</code>. Documents which commits wait for a standby and the RPO this buys.' },
    { m: 'DOC', p: 'Partition-mode runbook', d: 'How a partition is detected, which side keeps writing, what is queued or compensated, and the <b>recovery</b> steps: replay hints, merge siblings, reconcile invariants, notify users.' },
    { m: 'SLO', p: 'Replica staleness SLO', d: '<code>replica_lag_seconds p99 &lt; 1</code> over 30 days, plus an alert when a read path silently falls back to a weaker level.' }
  ],

  dataModel: [
    { name: 'consistency_matrix', store: 'Architecture repo (YAML / table)', fields: [['operation', 'text', 'pk'], ['data_class', 'enum'], ['read_level', 'ONE|QUORUM|STRONG'], ['write_level', 'ONE|QUORUM|ALL'], ['partition_behaviour', 'refuse|accept|degrade'], ['pacelc', 'PC/EC|PA/EL|…']], note: 'The decision record behind the ADR; reviewed when a new endpoint ships.' },
    { name: 'versioned_value', store: 'Replica storage (Dynamo-style)', fields: [['key', 'blob', 'pk'], ['value', 'blob'], ['vector_clock', 'map<node, counter>', 'sk'], ['write_ts', 'timestamp'], ['tombstone', 'bool']], note: 'Several rows per key = siblings. LWW keeps only max(write_ts); vector clocks keep every concurrent version.' },
    { name: 'partition_events', store: 'Ops warehouse', fields: [['event_id', 'uuid', 'pk'], ['started_at', 'ts', 'idx'], ['healed_at', 'ts'], ['sides', 'jsonb'], ['writes_refused', 'int'], ['conflicts_merged', 'int'], ['compensations', 'int']], note: 'Lets you show that partitions are rare, and price what each one cost.' }
  ],

  architecture: {
    title: 'Three replicas, two regions, one partition policy',
    nodes: [
      { id: 'cliW', label: 'Client West', sub: 'EU users', kind: 'client', wide: [200, 0], tall: [70, 0], tip: 'Talks to the nearest replica, which coordinates the request.' },
      { id: 'policy', label: 'Partition policy', sub: 'CP refuse · AP accept', kind: 'policy', wide: [500, 0], tall: [210, 0], tip: 'The architectural decision: when a quorum is unreachable, fail the request (CP) or serve it locally (AP). It can differ per operation.' },
      { id: 'cliE', label: 'Client East', sub: 'US users', kind: 'client', wide: [800, 0], tall: [350, 0], tip: 'Talks to Replica C, the only replica in its region.' },
      { id: 'r1', label: 'Replica A', sub: 'West · coordinator', kind: 'store', wide: [200, 125], tall: [70, 105], tip: 'Coordinates West requests: sends the write to all replicas and waits for W acks; sends reads to R replicas.' },
      { id: 'r3', label: 'Replica C', sub: 'East · minority', kind: 'store', wide: [800, 125], tall: [350, 105], tip: 'Alone on its side of a cross-region cut, so it can never form a 2-of-3 majority by itself.' },
      { id: 'r2', label: 'Replica B', sub: 'West', kind: 'store', wide: [200, 250], tall: [70, 210], tip: 'Second West replica. With A it forms a majority, so the West side keeps a quorum during a cross-region cut.' },
      { id: 'hint', label: 'Hint log', sub: 'writes for C, queued', kind: 'queue', wide: [500, 250], tall: [210, 210], tip: 'Hinted handoff: writes meant for an unreachable replica are kept and replayed when it returns (Dynamo, Cassandra).' },
      { id: 'recon', label: 'Reconciler', sub: 'LWW · siblings · CRDT', kind: 'compute', wide: [800, 250], tall: [350, 210], tip: 'After heal: anti-entropy (Merkle trees), read repair, and conflict resolution: last-write-wins, keep siblings for the app, or merge CRDTs.' },
      { id: 'fd', label: 'Failure detector', sub: 'heartbeats · timeouts', kind: 'compute', wide: [500, 375], tall: [210, 315], tip: 'A partition is only ever seen as timeouts. A slow link and a cut link look the same, which is why the choice must be made under uncertainty.' }
    ],
    edges: [
      { from: 'cliW', to: 'r1', bidi: true },
      { from: 'cliE', to: 'r3', bidi: true },
      { from: 'r1', to: 'r2', bidi: true, label: '1 ms' },
      { from: 'r1', to: 'r3', bidi: true, label: 'WAN ~70 ms' },
      { from: 'r2', to: 'hint' },
      { from: 'hint', to: 'r3' },
      { from: 'r3', to: 'recon', bidi: true },
      { from: 'policy', to: 'r1', dashed: true },
      { from: 'policy', to: 'r3', dashed: true },
      { from: 'fd', to: 'r2', dashed: true },
      { from: 'fd', to: 'recon', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'normal', title: 'No partition: quorum write + read', tone: 'info',
      steps: [
        { text: 'Client West writes <code>balance = 90</code>. Replica A coordinates and sends the write to <b>all three</b> replicas.', flow: ['cliW>r1', ['r1>r2', 'r1>r3']] },
        { text: 'With <b>W = 2</b>, A answers as soon as A and B have it (~1 ms). C\'s ack arrives ~70 ms later and is not waited for.', flow: ['r2>r1', 'r1>cliW'], ok: ['r1', 'r2'], badges: { r2: ['ack 1 ms', 'ok'], r3: ['ack 70 ms', 'info'] }, tone: 'ok' },
        { text: 'Client East reads with <b>R = 1</b> from C only: ~1 ms, but if C has not applied the write yet it returns <b>100</b>. That is the <b>EL</b> choice: low latency, maybe stale.', flow: ['cliE>r3', 'r3>cliE'], warn: ['r3'], badges: { r3: ['stale 100?', 'warn'] }, tone: 'warn' },
        { text: 'With <b>R = 2</b>, C must also ask a West replica: ~70 ms, but since <b>R + W = 4 &gt; 3</b> the two sets overlap and the newest version wins. That is the <b>EC</b> choice.', flow: ['cliE>r3', 'r3>r1', 'r1>r3', 'r3>cliE'], ok: ['r3'], badges: { r3: ['90 ✓ (70 ms)', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'cp', title: 'Partition, CP: minority refuses', tone: 'err',
      steps: [
        { text: 'The link between regions is cut. Nothing announces it: the <b>failure detector</b> only sees heartbeats time out on both sides.', nodes: ['fd', 'r1', 'r3'], err: ['r3'], badges: { fd: ['timeouts', 'warn'], r3: ['cut off', 'err'] }, tone: 'warn' },
        { text: 'West has A and B: still <b>2 of 3</b>. A write from Client West reaches its quorum and succeeds. The majority side stays fully consistent and available.', flow: ['cliW>r1', 'r1>r2', 'r2>r1', 'r1>cliW'], ok: ['r1', 'r2'], badges: { r1: ['W=2 ✓', 'ok'] } },
        { text: 'Client East writes to C. C cannot reach any other replica, so it cannot get 2 acks. The <b>CP</b> policy returns an error (or times out) instead of accepting.', flow: ['cliE>r3', 'policy>r3', 'r3>cliE'], err: ['r3', 'cliE'], badges: { r3: ['unavailable', 'err'], cliE: ['503', 'err'] }, tone: 'err' },
        { text: 'This is CAP: C is a <b>non-failing node</b> that gives an error, so the system is not "available" in the CAP sense. In return nobody ever reads a balance that disagrees with West.', nodes: ['r3', 'policy'], err: ['r3'], badges: { policy: ['chose C', 'info'] } }
      ]
    },
    {
      id: 'ap', title: 'Partition, AP: both sides diverge', tone: 'warn',
      steps: [
        { text: 'Same cut. This time the operation is <b>add to cart</b>, and the policy says <b>accept locally</b>.', nodes: ['policy', 'r3'], warn: ['r3'], badges: { policy: ['AP', 'warn'] }, tone: 'warn' },
        { text: 'Client West adds <b>milk</b>. A and B store it. The copy meant for C is kept as a <b>hint</b> for later (hinted handoff).', flow: ['cliW>r1', 'r1>r2', 'r2>hint'], ok: ['r1', 'r2'], badges: { hint: '1 hint for C' } },
        { text: 'Client East adds <b>tea</b> at the same time. C accepts it alone (<b>sloppy quorum</b>) and answers success. Now West says [milk], East says [tea].', flow: ['cliE>r3', 'r3>cliE'], warn: ['r3', 'r1'], badges: { r3: ['[tea]', 'warn'], r1: ['[milk]', 'warn'] }, tone: 'warn' },
        { text: 'Every request got a non-error answer: the system is <b>available</b>, and reads are no longer linearizable. The bill arrives at heal time.', nodes: ['r1', 'r3', 'recon'], warn: ['recon'], badges: { recon: ['2 versions', 'warn'] } }
      ]
    },
    {
      id: 'heal', title: 'Heal: LWW vs siblings', tone: 'ok',
      steps: [
        { text: 'The link returns. Hints are replayed to C, and anti-entropy compares Merkle trees to find keys that differ.', flow: ['hint>r3', 'r3>recon'], badges: { hint: 'replay', recon: 'diff' } },
        { text: '<b>Last-write-wins</b>: keep the version with the highest timestamp. The cart becomes [tea] and <b>milk is silently lost</b>. With clock skew, an older write can even win.', nodes: ['recon', 'r3'], err: ['recon'], badges: { recon: ['milk lost', 'err'] }, tone: 'err' },
        { text: '<b>Siblings</b>: vector clocks show the two versions are <b>concurrent</b>, so both are kept. The next read returns both, and the app merges them: [milk, tea]. This is what Dynamo did for the cart.', flow: ['recon>r3', 'r3>r1'], ok: ['recon', 'r1', 'r3'], badges: { recon: ['merge ∪', 'ok'] }, tone: 'ok' },
        { text: 'Or use a <b>CRDT</b> (e.g. an observed-remove set), whose merge is built in and deterministic. For money, neither LWW nor union is enough: you need CP, or compensating actions.', nodes: ['recon'], ok: ['recon', 'r1', 'r2', 'r3'], badges: { r2: ['converged', 'ok'] } }
      ]
    },
    {
      id: 'scale', title: 'Under load: the latency tax', tone: 'warn',
      steps: [
        { text: 'Peak traffic, no partition. East users read with <b>QUORUM</b>: each read waits for a West replica, so every page pays <b>~70 ms</b> more, thousands of times a second.', flow: [['cliE>r3', 'cliE>r3'], 'r3>r1', 'r1>r3'], warn: ['r3'], badges: { r3: ['+70 ms each', 'warn'] }, tone: 'warn' },
        { text: 'A slow West replica (GC pause) now sets the latency of East reads too. Quorums make you depend on the <b>R-th fastest</b> replica.', nodes: ['r1', 'r2'], warn: ['r1'], badges: { r1: ['p99 spike', 'warn'] } },
        { text: 'Fix for read-mostly data: <b>LOCAL_QUORUM</b> or follower reads with a <b>staleness bound</b>. Keep cross-region quorums for the few operations that need them.', flow: ['cliE>r3', 'r3>cliE'], ok: ['r3'], badges: { r3: ['1 ms, ≤ 5 s stale', 'ok'] }, tone: 'ok' },
        { text: 'This is Abadi\'s point: partitions are rare, but the <b>latency vs consistency</b> trade-off is paid all year, so it shapes the design more than CAP does.', nodes: ['policy'], badges: { policy: ['ELC', 'info'] } }
      ]
    }
  ],

  knobs: {
    intro: 'Three replicas; Client West writes through Replica A. Each control is a real setting. The partition meters assume one replica is cut off from the other two, with clients spread evenly.',
    diagram: null,
    controls: [
      { id: 'mode', label: 'When a quorum is unreachable', type: 'seg', value: 'cp', options: [
        { v: 'cp', l: 'CP: refuse (strict quorum)' }, { v: 'ap', l: 'AP: accept (sloppy quorum + hints)' }] },
      { id: 'read', label: 'Read consistency level', type: 'seg', value: 'quorum', options: [
        { v: 'one', l: 'ONE' }, { v: 'quorum', l: 'QUORUM (2)' }, { v: 'all', l: 'ALL (3)' }] },
      { id: 'write', label: 'Write replication', type: 'seg', value: 'quorum', options: [
        { v: 'async', l: 'Async (W = 1)' }, { v: 'quorum', l: 'Quorum sync (W = 2)' }, { v: 'all', l: 'Fully sync (W = 3)' }] },
      { id: 'layout', label: 'Region layout', type: 'seg', value: 'r2', options: [
        { v: 'az', l: '1 region, 3 zones' }, { v: 'r2', l: '2 regions (2 + 1)' }, { v: 'r3', l: '3 regions (1 + 1 + 1)' }] }
    ],
    evaluate(s) {
      const N = 3;
      const R = { one: 1, quorum: 2, all: 3 }[s.read];
      const W = { async: 1, quorum: 2, all: 3 }[s.write];
      // ack times (ms) from the coordinator, sorted: itself, then the others (illustrative RTTs)
      const acks = { az: [0.3, 1, 1.2], r2: [0.3, 1, 70], r3: [0.3, 70, 90] }[s.layout];
      const rl = acks[R - 1] + 1, wl = acks[W - 1] + 1;
      const overlap = R + W > N;
      const cp = s.mode === 'cp';
      // one replica is cut off; clients spread evenly, so 2/3 sit with the majority
      const servedW = cp ? (2 / 3) * (W <= 2 ? 1 : 0) + (1 / 3) * (W <= 1 ? 1 : 0) : 1;
      const servedR = cp ? (2 / 3) * (R <= 2 ? 1 : 0) + (1 / 3) * (R <= 1 ? 1 : 0) : 1;
      const tol = cp ? Math.min(N - R, N - W) : 2;
      const lag = acks[2];
      const pct = (x) => Math.round(x * 100) + '%';
      const ms = (x) => x < 10 ? x.toFixed(1) + ' ms' : Math.round(x) + ' ms';
      let staleV, staleS;
      if (overlap && cp) { staleV = 'none: R + W = ' + (R + W) + ' > 3'; staleS = 0.95; }
      else if (overlap) { staleV = 'none normally; possible in partition (sloppy quorum)'; staleS = 0.6; }
      else { staleV = 'yes: up to ~' + ms(lag) + ' lag, longer in partition'; staleS = s.layout === 'az' ? 0.45 : 0.2; }
      let confV, confS;
      if (cp && W >= 2) { confV = 'none: minority cannot write'; confS = 0.95; }
      else if (cp) { confV = 'high: W = 1 lets both sides write'; confS = 0.15; }
      else { confV = 'both sides write: LWW drops or siblings to merge'; confS = 0.3; }
      const metrics = [
        { k: 'Writes served in partition', v: pct(servedW) + ' of clients', s: servedW, hint: cp ? 'minority side refused' : 'every side accepts' },
        { k: 'Reads served in partition', v: pct(servedR) + ' of clients', s: servedR },
        { k: 'Read latency (no partition)', v: '≈ ' + ms(rl), s: rl < 5 ? 0.95 : rl < 50 ? 0.55 : 0.25, hint: 'R-th fastest reply' },
        { k: 'Write latency (no partition)', v: '≈ ' + ms(wl), s: wl < 5 ? 0.95 : wl < 50 ? 0.55 : 0.25, hint: 'W-th fastest ack' },
        { k: 'Stale-read risk', v: staleV, s: staleS },
        { k: 'Conflict / lost-write risk', v: confV, s: confS },
        { k: 'Replica failures tolerated', v: tol + ' of 3', s: tol / 2, hint: cp ? 'min(N − R, N − W)' : 'sloppy quorum' }
      ];
      const pc = cp ? 'PC' : 'PA';
      const ec = overlap ? 'EC' : 'EL';
      const notes = [];
      notes.push('PACELC label for this configuration: <b>' + pc + '/' + ec + '</b>.');
      if (cp && !overlap) notes.push('Strict quorums but <b>R + W ≤ N</b>: a read can miss the latest write even with no partition, so this is not consistent despite refusing requests.');
      if (!cp && overlap) notes.push('Sloppy quorums count <i>any</i> reachable nodes (including hint holders), so <b>R + W &gt; N no longer guarantees overlap</b> during a partition. Dynamo and Cassandra both document this.');
      if (R === 3 || W === 3) notes.push('<b>ALL</b> means one slow or dead replica blocks the operation. You pay CP unavailability even without a partition.');
      if (s.layout === 'r3' && (R >= 2 || W >= 2)) notes.push('With one replica per region, <b>every quorum crosses the WAN</b>. Spanner and CockroachDB accept this for writes and offer bounded-staleness or follower reads to keep reads local.');
      if (s.layout === 'az') notes.push('One region with 3 zones: quorums cost ~1 ms, so <b>EC is almost free</b>; but a whole-region outage takes everything down.');
      if (s.write === 'async') notes.push('Async replication is the Postgres default: a failover can <b>lose the last few acknowledged commits</b> (RPO &gt; 0).');
      let verdict;
      if (cp && overlap && R < 3 && W < 3) verdict = '✅ <b>PC/EC:</b> the majority side keeps working, the minority fails fast, and reads always see the latest write. Use for balances, inventory and locks.';
      else if (cp && (R === 3 || W === 3)) verdict = '⚠ <b>ALL is fragile:</b> a single replica outage stops ' + (W === 3 ? 'writes' : 'reads') + '. Prefer QUORUM.';
      else if (cp && !overlap) verdict = '❌ <b>Worst of both:</b> labelled CP, yet R + W ≤ N gives stale reads' + (W === 1 ? ' and both sides can write' : '') + '.';
      else if (!cp && R === 1 && W === 1) verdict = '👍 <b>PA/EL, the Dynamo shopping-cart choice:</b> always writable and fast; you must merge conflicts on heal.';
      else if (!cp && overlap) verdict = '👍 <b>PA/EC-ish:</b> fresh in normal operation, available in a partition, but expect conflicts to merge afterwards.';
      else verdict = '👍 <b>PA/EL with some extra latency.</b> Check whether the quorum is buying anything.';
      const flow = ['cliW>r1'].concat(W >= 2 ? [['r1>r2', 'r1>r3']] : ['r1>r2']).concat(['cliE>r3']);
      return {
        metrics, verdict, notes, flow,
        labels: {
          r1: { label: 'Replica A', sub: 'R=' + R + ' · W=' + W },
          policy: { label: cp ? 'CP: refuse' : 'AP: accept', sub: cp ? 'strict quorum' : 'sloppy quorum + hints' },
          r3: { label: 'Replica C', sub: { az: 'zone c · 1 ms', r2: 'East · 70 ms', r3: 'region 3 · 90 ms' }[s.layout] },
          r2: { label: 'Replica B', sub: { az: 'zone b · 1 ms', r2: 'West · 1 ms', r3: 'region 2 · 70 ms' }[s.layout] }
        },
        hide: cp ? ['hint'] : [],
        hot: cp ? [] : ['hint', 'recon'],
        warn: (!overlap ? ['r3'] : []).concat(!cp ? ['recon'] : []),
        ok: cp && overlap ? ['r1', 'r2'] : [],
        badges: { policy: [pc + '/' + ec, cp && overlap ? 'ok' : 'warn'], r3: [cp && (R > 1 || W > 1) ? 'refuses in cut' : 'serves in cut', cp ? 'info' : 'warn'] }
      };
    }
  },

  widget: {
    title: 'Cut the network, write on both sides, then heal',
    caption: 'Three replicas: <b>A</b> and <b>B</b> in the West, <b>C</b> alone in the East. <b>Cut</b> the link, add items to the cart from either side, and compare <b>CP</b> (minority refuses) with <b>AP</b> (both accept and diverge). <b>Heal</b> to reconcile with last-write-wins or siblings. Below, the PACELC slider shows the price when nothing is broken.'
  },

  realWorld: {
    intro: 'From a conference keynote to a proof, a decade of argument, and production systems that each picked a different corner.',
    timeline: [
      { when: '2000', who: 'Eric Brewer (UC Berkeley / Inktomi)', title: 'CAP conjecture at PODC', text: 'Keynote "Towards Robust Distributed Systems": of consistency, availability and partition tolerance you can have at most two. He contrasts <b>ACID</b> with <b>BASE</b> (basically available, soft state, eventually consistent).', src: 0 },
      { when: '2002', who: 'Seth Gilbert & Nancy Lynch (MIT)', title: 'The proof', text: 'Formalise C as <b>atomic (linearizable)</b> objects and A as "every request received by a non-failing node must result in a response". Prove it impossible in an <b>asynchronous</b> network with partitions, then discuss what partial synchrony allows.', src: 1 },
      { when: '2007', who: 'Amazon', title: 'Dynamo: always writable', text: 'The shopping cart must accept writes even during failures. Dynamo uses consistent hashing, <b>sloppy quorums and hinted handoff</b>, and <b>vector clocks</b>, returning concurrent versions for the application to merge. Tunable (N, R, W), commonly (3, 2, 2).', src: 2 },
      { when: '2010', who: 'Daniel Abadi', title: 'PACELC first proposed', text: 'Blog post "Problems with CAP, and Yahoo\'s little known NoSQL system": CAP makes people think NoSQL gives up consistency for availability, when the daily reason is <b>latency</b>. Uses Yahoo PNUTS as the example.', src: 3 },
      { when: '2012', who: 'Eric Brewer', title: 'CAP twelve years later', text: 'The "2 of 3" framing is <b>misleading</b>: partitions are rare, so give up C or A only while partitioned, and at fine granularity. Design an explicit <b>partition mode</b> and a <b>recovery</b> step that restores invariants and compensates mistakes.', src: 4 },
      { when: '2012', who: 'Daniel Abadi (IEEE Computer)', title: 'PACELC in print', text: '"CAP is only part of the story." Classifies Dynamo, Cassandra and Riak as <b>PA/EL</b> by default, fully ACID systems such as VoltDB as <b>PC/EC</b>, and Yahoo PNUTS as <b>PC/EL</b>.', src: 5 },
      { when: '2012', who: 'Google', title: 'Spanner (OSDI)', text: 'Globally distributed, <b>synchronously replicated</b> (Paxos) and externally consistent, using the TrueTime API that exposes clock uncertainty. A <b>PC/EC</b> design: writes pay cross-replica latency.', src: 6 },
      { when: '2013–14', who: 'Kyle Kingsbury (Jepsen), Peter Bailis', title: 'Partitions are real', text: 'The "Call me maybe" series cuts networks under real databases and finds lost acknowledged writes. "The Network is Reliable" collects public reports of partitions in production networks.', src: 7 },
      { when: '2015', who: 'Martin Kleppmann', title: '"Please stop calling databases CP or AP"', text: 'Most databases, in their default configuration, satisfy <b>neither</b> CAP-C nor CAP-A. Talk about the specific consistency model and latency instead.', src: 9 },
      { when: '2017', who: 'Eric Brewer (Google)', title: 'Spanner, TrueTime and the CAP theorem', text: 'Spanner is <b>technically CP</b>: in a partition the minority side cannot commit. Because Google controls the network and partitions are very rare, users can in practice treat it as highly available.', src: 10 },
      { when: 'today', who: 'AWS, Cockroach Labs', title: 'Consistency as a per-request option', text: 'DynamoDB reads are <b>eventually consistent by default</b>; a strongly consistent read costs twice the read capacity. CockroachDB calls itself CP and argues CP systems can still be highly available when a majority is reachable.', src: 11 }
    ],
    lessons: [
      'Partition tolerance is not a feature you skip. The real decision is <b>what each operation does during a partition</b>.',
      'Most of the year there is no partition, so the <b>latency vs consistency</b> setting (the "E" in PACELC) drives cost and user experience.',
      'Label <b>configurations, not products</b>: Cassandra at QUORUM, DynamoDB with ConsistentRead, MongoDB with majority concerns.',
      'Plan the <b>heal</b>: hints, anti-entropy, a merge rule per data type, and compensation for broken invariants.'
    ],
    sources: [
      { title: 'Towards Robust Distributed Systems (PODC 2000 keynote slides)', url: 'https://sites.cs.ucsb.edu/~rich/class/cs293b-cloud/papers/Brewer_podc_keynote_2000.pdf', pub: 'Eric Brewer, PODC 2000' },
      { title: 'Brewer\'s Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services', url: 'https://sites.cs.ucsb.edu/~rich/class/cs293b-cloud/papers/cap-proof.pdf', pub: 'Gilbert & Lynch, ACM SIGACT News, 2002' },
      { title: 'Amazon\'s Dynamo', url: 'https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html', pub: 'Werner Vogels / SOSP 2007' },
      { title: 'DBMS Musings, April 2010: Problems with CAP, and Yahoo\'s little known NoSQL system', url: 'https://dbmsmusings.blogspot.ca/2010/04/', pub: 'Daniel Abadi, 2010' },
      { title: 'CAP Twelve Years Later: How the "Rules" Have Changed', url: 'https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed', pub: 'Eric Brewer, IEEE Computer / InfoQ, 2012' },
      { title: 'Consistency Tradeoffs in Modern Distributed Database System Design: CAP is Only Part of the Story', url: 'https://cs.umd.edu/~abadi/papers/abadi-pacelc.pdf', pub: 'Daniel Abadi, IEEE Computer, Feb 2012' },
      { title: 'Spanner: Google\'s Globally-Distributed Database', url: 'https://research.google/pubs/pub39966/', pub: 'Corbett et al., OSDI 2012' },
      { title: 'Call me maybe: Carly Rae Jepsen and the perils of network partitions', url: 'https://aphyr.com/posts/281-call-me-maybe', pub: 'Kyle Kingsbury, 2013' },
      { title: 'The Network is Reliable', url: 'https://aphyr.com/posts/288-the-network-is-reliable', pub: 'Bailis & Kingsbury, ACM Queue / CACM, 2014' },
      { title: 'Please stop calling databases CP or AP', url: 'https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html', pub: 'Martin Kleppmann, 2015' },
      { title: 'Spanner, TrueTime and the CAP Theorem', url: 'https://research.google/pubs/spanner-truetime-and-the-cap-theorem/', pub: 'Google Research, 2017' },
      { title: 'DynamoDB read consistency', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html', pub: 'AWS documentation' },
      { title: 'What are the limits of the CAP theorem?', url: 'https://www.cockroachlabs.com/blog/limits-of-the-cap-theorem/', pub: 'Cockroach Labs, 2022' },
      { title: 'Read concern (MongoDB manual)', url: 'https://www.mongodb.com/docs/v8.2/reference/read-concern/', pub: 'MongoDB documentation' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['During a partition', '<b>CP</b>: minority refuses; no divergence', '<b>AP</b>: every side answers; merge later', 'CP for money, stock, locks, uniqueness. AP for carts, likes, presence, metrics'],
      ['Normal operation (PACELC E)', '<b>EC</b>: wait for a quorum or the leader', '<b>EL</b>: answer from the nearest replica', 'EC when a stale read causes a wrong decision; EL for feeds, catalogs, dashboards'],
      ['Replication', '<b>Synchronous / quorum</b>: RPO 0, +1 RTT per write', '<b>Asynchronous</b>: fast writes, lose the tail on failover', 'Quorum across zones is cheap; across regions, reserve it for critical writes'],
      ['Conflict resolution (AP)', '<b>Last-write-wins</b>: simple, silently drops writes', '<b>Siblings / CRDTs</b>: no loss, the app or the type must merge', 'LWW only for idempotent overwrites (profile photo); CRDTs for counters and sets'],
      ['Reads', '<b>Leader / quorum reads</b>: linearizable', '<b>Follower / bounded-staleness reads</b>: local and cheap', 'Follower reads for read-mostly data with a stated staleness bound'],
      ['Placement', '<b>One region, 3 zones</b>: EC costs ~1 ms', '<b>Multi-region</b>: survives a region, every quorum crosses the WAN', 'Multi-region when a region outage is in your availability target']
    ]
  },
  failures: [
    { f: 'Split brain: two leaders accept writes', detect: 'Two nodes report the primary role; divergent WAL timelines; Jepsen-style tests', fix: 'Majority-quorum leader election, leases that expire before a new leader is chosen, and fencing tokens on every write.' },
    { f: 'Async failover loses acknowledged writes', detect: 'Replica lag at failover time; gaps in sequence numbers after promotion', fix: 'Quorum commit (<code>ANY 1</code>) for critical data, or document RPO &gt; 0 and reconcile from an outbox.' },
    { f: 'LWW silently drops concurrent updates', detect: 'Lost-update reports; counts that do not add up after a partition', fix: 'Use siblings or CRDTs, or conditional writes (LWT / compare-and-set) for read-modify-write.' },
    { f: '"QUORUM" that is not: sloppy quorum in partition', detect: 'Hint backlog grows; reads after heal return older values', fix: 'Know that hints do not count toward strict quorums; disable sloppy behaviour for CP data; run repair.' },
    { f: 'Retry storm against the refusing minority', detect: 'Request rate on the minority side spikes during the partition', fix: 'Return a clear 503 with Retry-After, exponential backoff with jitter, and route clients to the majority side.' },
    { f: 'Stale read after own write (replica read)', detect: 'Users report "my change disappeared" after refresh', fix: 'Read-your-writes: route the session to the leader for a short time, or wait for the replica LSN / causal token.' },
    { f: 'Claiming "CA" for a multi-node system', detect: 'Design review: no answer to "what happens if this link drops?"', fix: 'Write the partition-mode runbook and choose C or A per operation.' }
  ],

  interview: [
    { q: 'State the CAP theorem precisely.', a: '<p>In an asynchronous network where messages can be lost (a <b>partition</b>), no replicated read/write register can guarantee both:</p><ul><li><b>Consistency</b> = <b>linearizability</b>: every operation appears to take effect at one instant between its start and end, as if on a single copy;</li><li><b>Availability</b> = every request received by a <b>non-failing node</b> eventually returns a <b>non-error</b> response.</li></ul><p>Brewer conjectured it in his PODC 2000 keynote; Gilbert and Lynch proved it in 2002. Note that CAP\'s C is <b>not</b> the C of ACID.</p>', fu: 'Is a system that times out after 30 s "available"? (Not in the CAP sense: the definition needs a non-error response.)', lvl: 'core' },
    { q: 'Why is "CA" not a real choice for a distributed database?', a: '<p>P is not a property you choose; it is something the network does to you. Any system whose nodes communicate over a network will sometimes lose messages. When that happens, the only question is whether nodes keep answering (A) or wait or refuse (C).</p><p>"CA" only describes a single node, or a system that simply does not define its behaviour under partition, which in practice means it does something undefined.</p>', lvl: 'core' },
    { q: 'What does PACELC add, and why do architects care more about it?', a: '<p>Abadi (2010 blog, 2012 IEEE Computer): <b>if P</b>artition, trade <b>A</b> vs <b>C</b>; <b>E</b>lse trade <b>L</b>atency vs <b>C</b>onsistency.</p><p>Partitions happen minutes per year, but every replicated request pays the <b>E</b> trade-off: waiting for a remote quorum or a leader costs one RTT (e.g. ~70 ms across regions) on every call. That shapes cost and UX far more often than the partition case.</p>', lvl: 'core' },
    { q: 'Classify Spanner, Cassandra, DynamoDB and a Postgres primary with async replicas.', a: '<ul><li><b>Spanner</b>: PC/EC. Paxos-replicated, externally consistent; the minority side cannot commit. Brewer (2017) calls it technically CP but effectively highly available.</li><li><b>Cassandra</b> (and Dynamo, Riak): PA/EL by default per Abadi; tunable per query: QUORUM/QUORUM moves it towards EC, and LWT (Paxos) gives CP for single-partition compare-and-set.</li><li><b>DynamoDB</b>: eventually consistent reads by default (EL); <code>ConsistentRead=true</code> on tables and LSIs gives strong reads at twice the read cost (EC for those reads). GSIs are always eventually consistent.</li><li><b>Postgres + async replicas</b>: writes go to one primary, so clients cut off from it cannot write (PC for writes), while replicas keep serving <b>stale</b> reads (PA/EL for reads). Sync replication lowers RPO but does not make replica reads fresh unless you use <code>remote_apply</code>.</li></ul>', fu: 'Where is CockroachDB? (PC/EC via Raft; follower reads trade freshness for latency.)', lvl: 'deep' },
    { q: 'Explain R + W > N. Does it make a Dynamo-style store linearizable?', a: '<p>With N replicas, a write waits for W acks and a read for R replies. If <b>R + W &gt; N</b>, any read set intersects any write set, so at least one reply carries the latest acknowledged write.</p><p>It is <b>not enough</b> for linearizability: concurrent writes resolved by LWW can lose updates, a read concurrent with a write may see the new value and a later read the old one unless read repair is synchronous, and <b>sloppy quorums</b> during a partition break the overlap entirely. For a true compare-and-set you need consensus (Paxos/Raft, e.g. Cassandra LWT).</p>', lvl: 'deep' },
    { q: 'Design: shopping cart vs bank balance. Which is CP, which is AP, and why?', a: '<p><b>Cart</b>: AP / EL. Refusing "add to cart" loses revenue; a duplicate or resurrected item is fixed at checkout. Keep siblings or use an OR-set CRDT and merge on read (Dynamo\'s design).</p><p><b>Balance</b>: CP / EC. An overdraft or double spend is a real loss and cannot be merged away. Majority-quorum writes, conditional debit (<code>WHERE balance &gt;= amount</code>), and fail fast in the minority.</p><p>The <b>same checkout flow</b> uses both: AP for the cart, CP for payment authorisation and stock reservation.</p>', lvl: 'core' },
    { q: 'What happens when the partition heals in an AP system?', a: '<ul><li><b>Hinted handoff</b> replays writes buffered for the missing replica.</li><li><b>Anti-entropy</b> (Merkle tree comparison) and <b>read repair</b> find remaining differences.</li><li><b>Conflict resolution</b>: LWW (simple, loses data, clock-sensitive), siblings via vector clocks (app merges), or CRDTs (merge is built into the type).</li><li>Brewer 2012: also <b>check invariants and compensate</b>, e.g. refund a double-sold item and apologise.</li></ul>', lvl: 'core' },
    { q: 'Does choosing CP mean the system has low availability?', a: '<p>No. CAP availability is about <b>every</b> node answering. A CP system with 3 replicas keeps serving on the <b>majority</b> side of a partition and survives one node failure. Only clients stuck with the minority are refused.</p><p>That is why Spanner and CockroachDB can be CP and still advertise high availability: the unavailable case needs a partition <b>and</b> a client on the wrong side of it.</p>', lvl: 'core' },
    { q: 'Is a database "CP" or "AP"?', a: '<p>Usually neither, as a whole. Kleppmann (2015) points out most databases in default configuration satisfy neither CAP-C nor CAP-A. The label belongs to a <b>configuration and an operation</b>: Cassandra at ONE is AP-ish; at QUORUM it is neither strictly; MongoDB with <code>w: majority</code> and <code>readConcern: linearizable</code> on the primary is CP for single-document operations.</p><p>In an interview, name the setting, not the brand.</p>', lvl: 'deep' },
    { q: 'How would you test partition behaviour before production?', a: '<ul><li><b>Jepsen</b>-style tests: run a workload, cut the network with iptables, heal, then check the history for linearizability or lost writes.</li><li>Chaos experiments in staging: drop the inter-region link, block a single AZ.</li><li>Toxiproxy or tc-netem in integration tests for latency and loss.</li><li>Assert on outcomes: acknowledged writes never lost, minority returns 503 within the timeout, conflicts merged as designed.</li></ul>', lvl: 'deep' },
    { q: 'How do you convince product that checkout must fail during a region cut?', a: '<p>Frame it as <b>money and risk</b>, not theory. "A partition between regions happens a few times a year for minutes. In those minutes, if both regions sell, we oversell the last items and double-charge some users. Refusing in the minority region affects only users routed there, for minutes."</p><p>Offer a <b>degraded path</b>: keep browsing and the cart available (AP), queue the order with \'we will confirm by email\', and show a clear message. Record the decision in an ADR with the numbers.</p>', fu: 'What would you measure to revisit the decision? (Partition minutes per year, orders refused, oversell incidents.)', lvl: 'core' },
    { q: 'How does Spanner get strong consistency across continents without "beating" CAP?', a: '<p>It does not beat CAP. Each data split is a <b>Paxos group</b>; a write commits only with a majority, so a minority side is unavailable. <b>TrueTime</b> exposes a bounded clock uncertainty; Spanner waits out that uncertainty (commit wait) so timestamps match real-time order, giving <b>external consistency</b> and lock-free snapshot reads.</p><p>It pays the <b>EC latency</b>: cross-region Paxos round trips on writes. High availability comes from Google\'s redundant private network making partitions rare.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Data Cassandra: consistency per query', lang: 'java',
      code: `// Spring Boot 3, spring-boot-starter-data-cassandra (DataStax Java driver 4.x)
// application.yml default:  spring.cassandra.request.consistency: local-quorum
import com.datastax.oss.driver.api.core.DefaultConsistencyLevel;
import com.datastax.oss.driver.api.core.cql.SimpleStatement;
import org.springframework.data.cassandra.core.CassandraOperations;
import org.springframework.data.cassandra.repository.*;
import org.springframework.stereotype.Service;
import java.util.*;

public interface CartRepository extends CassandraRepository<CartItem, CartKey> {
  @Consistency(DefaultConsistencyLevel.LOCAL_ONE)       // PA/EL: fast, may be stale
  List<CartItem> findByKeyUserId(UUID userId);
}

@Service
public class LedgerService {
  private final CassandraOperations ops;
  public LedgerService(CassandraOperations ops) { this.ops = ops; }

  public Account read(UUID id) {                         // EC: R = local quorum
    var stmt = SimpleStatement.builder("SELECT * FROM accounts WHERE id = ?")
        .addPositionalValue(id)
        .setConsistencyLevel(DefaultConsistencyLevel.LOCAL_QUORUM)
        .build();
    return ops.selectOne(stmt, Account.class);
  }

  public boolean debit(UUID id, long cents) {               // CP: Paxos LWT
    Account a = read(id);
    if (a.balance() < cents) return false;
    var cas = SimpleStatement.builder(
            "UPDATE accounts SET balance = ?, version = ? WHERE id = ? IF version = ?")
        .addPositionalValues(a.balance() - cents, a.version() + 1, id, a.version())
        .setConsistencyLevel(DefaultConsistencyLevel.LOCAL_QUORUM)
        .setSerialConsistencyLevel(DefaultConsistencyLevel.LOCAL_SERIAL)
        .build();
    return ops.getCqlOperations().execute(cas);          // false => lost the race, retry
  }
}`,
      note: 'Writes and reads at <code>LOCAL_QUORUM</code> overlap inside one datacenter (R + W &gt; RF). The <code>IF</code> clause makes a <b>lightweight transaction</b> that runs Paxos among replicas: it refuses rather than diverges if a quorum is unreachable (CP). If a quorum is unreachable the call throws (unavailable / timeout) instead of applying the debit on one side only.'
    },
    {
      title: 'Postgres: choose the PACELC letter per transaction', lang: 'sql',
      code: `-- postgresql.conf on the primary (PG 15+)
-- wait for ANY one of the two standbys to confirm each commit (quorum commit)
--   synchronous_standby_names = 'ANY 1 (replica_b, replica_c)'
--   synchronous_commit = on          -- default: standby has flushed WAL to disk

-- Money: the standby must have *applied* the commit, so a read routed
-- to that standby right after sees it (EC for replica reads, +1 RTT)
BEGIN;
SET LOCAL synchronous_commit = remote_apply;
UPDATE accounts SET balance = balance - 4200
 WHERE id = 42 AND balance >= 4200;
INSERT INTO ledger(account_id, delta_cents) VALUES (42, -4200);
COMMIT;

-- Analytics events: accept losing the last few on a crash (EL, fastest)
BEGIN;
SET LOCAL synchronous_commit = local;
INSERT INTO page_views(user_id, path) VALUES (42, '/cart');
COMMIT;

-- Is the quorum healthy, and how stale are the replicas?
SELECT application_name, state, sync_state,     -- 'quorum' with ANY
       replay_lag, write_lag, flush_lag
  FROM pg_stat_replication;`,
      note: 'If no standby in the list is reachable, commits that need it <b>block</b> (CP behaviour for writes) until one returns or you change the setting. <code>remote_apply</code> makes the confirming standby fresh, not every replica.'
    },
    {
      title: 'Python: brute-force the quorum overlap', lang: 'python',
      code: `from itertools import combinations

def quorums_overlap(n: int, r: int, w: int) -> bool:
    """True if every possible read set meets every possible write set."""
    nodes = range(n)
    return all(set(rs) & set(ws)
               for ws in combinations(nodes, w)
               for rs in combinations(nodes, r))

def stale_read_chance(n: int, r: int, w: int) -> float:
    """Right after a write acked by exactly w random replicas (no repair yet),
    the probability that a random read set of size r sees none of them."""
    writes = list(combinations(range(n), w))
    reads = list(combinations(range(n), r))
    miss = sum(1 for ws in writes for rs in reads if not set(ws) & set(rs))
    return miss / (len(writes) * len(reads))

for n, r, w in [(3, 1, 1), (3, 2, 2), (3, 1, 3), (5, 2, 3), (5, 2, 2)]:
    print(f"N={n} R={r} W={w}  overlap={quorums_overlap(n, r, w)!s:5}  "
          f"stale={stale_read_chance(n, r, w):.0%}")
# N=3 R=1 W=1  overlap=False  stale=67%
# N=3 R=2 W=2  overlap=True   stale=0%
# N=3 R=1 W=3  overlap=True   stale=0%
# N=5 R=2 W=3  overlap=False  stale=10%
# N=5 R=2 W=2  overlap=False  stale=30%`
    }
  ],

  related: ['consistency-models', 'consensus-theory', 'reliability-math', 'sd:kv-store', 'sd:distributed-sql', 'sd:lock-manager']
});
