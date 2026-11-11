SD.register({
  slug: 'consensus-theory',
  domain: 1,
  title: 'Consensus & Impossibility Results',
  examples: 'FLP, Two Generals, Raft',
  tagline: 'Machines that talk over an unreliable network <b>can never be certain</b> what the others know. Majorities, terms, leases and fencing tokens turn that impossibility into systems that are <b>always safe and usually live</b>.',
  tldr: {
    problem: 'Several machines must agree on one thing: who is leader, which write came first, whether a transfer committed. Messages get lost or delayed, and a crashed machine looks exactly like a <b>slow</b> one. How do they agree without ever being <b>wrong</b>?',
    idea: '<b>FLP</b> (Fischer, Lynch &amp; Paterson 1985): in a fully asynchronous network, no deterministic protocol can guarantee agreement <i>and</i> termination if even one process may crash. Real systems keep <b>safety always</b> (majority quorums, terms) and get <b>liveness when the network behaves</b> (timeouts, partial synchrony, randomised election timers): that is <b>Paxos</b> and <b>Raft</b>.',
    insight: 'In the interview, separate <b>safety</b> (never two different decisions) from <b>liveness</b> (eventually decide). Say <b>2f + 1</b> nodes for f crashes, <b>3f + 1</b> for f liars, quorums that <b>overlap</b>, and that a lease without a <b>fencing token</b> is a bug waiting for a GC pause.',
    numbers: [
      { v: '2f + 1', l: 'nodes to survive f crash failures with majority quorums (3 → 1, 5 → 2)' },
      { v: '3f + 1', l: 'nodes to survive f Byzantine (lying) nodes with oral messages (Lamport, Shostak, Pease 1982)' },
      { v: '5', l: 'typical replicas in a Google Chubby cell (Burrows, OSDI 2006)' }
    ]
  },

  intro: {
    what: '<b>Consensus</b> is getting several computers to agree on one value, such as "who is the leader" or "what is the next entry in the log", even when some of them crash and messages get lost. The <b>impossibility results</b> are proofs that say exactly where this cannot be done perfectly. Algorithms like <b>Raft</b> and <b>Paxos</b> live inside those limits.',
    analogy: {
      icon: '🗳️',
      title: 'A committee that votes by post',
      text: 'Five board members must approve decisions, but they only communicate by letter, and letters can arrive late or never. A decision counts once <b>three of five</b> sign it, because any two groups of three share at least one member who would notice a contradiction. A chair runs the votes; if the chair goes silent for too long, someone calls an election for a new <b>term</b>, and letters from an older term are ignored. The analogy breaks in one way: real machines cannot tell a late letter from a lost one, which is why timeouts are guesses, not facts.'
    },
    problem: 'You run two copies of a job scheduler so one can take over if the other dies. A long garbage-collection pause freezes the primary for 20 seconds. The backup sees silence, decides the primary is dead and starts running jobs. Then the primary wakes up and keeps going. Now <b>every job runs twice</b>, and invoices go out twice. <b>How do machines that cannot see each other agree on exactly one leader, and stop the old one from doing damage?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Primary and backup with a heartbeat',
        text: 'The backup pings the primary every second. If three pings go unanswered, it <b>promotes itself</b>. Simple, and it works when the primary really crashes.',
        scene: {
          nodes: [
            { id: 'p', label: 'Primary', sub: 'runs jobs', kind: 'service', at: [70, 0] },
            { id: 'b', label: 'Backup', sub: 'pings primary', kind: 'service', at: [350, 0] },
            { id: 'db', label: 'Database', sub: 'invoices', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'b', to: 'p', dashed: true }, { from: 'p', to: 'db' }, { from: 'b', to: 'db' }],
          flow: ['b>p', 'p>db'],
          ok: ['p']
        }
      },
      {
        stage: 'breaks',
        title: 'Slow looks exactly like dead',
        text: 'The primary pauses, so pings time out. The backup promotes itself. The primary wakes up still believing it is leader. <b>Two leaders</b> write to the database: split brain. No timeout value fixes this, because a pause can always be longer.',
        scene: {
          nodes: [
            { id: 'p', label: 'Primary', sub: 'paused 20 s', kind: 'service', at: [70, 0] },
            { id: 'b', label: 'Backup', sub: 'now "primary"', kind: 'service', at: [350, 0] },
            { id: 'db', label: 'Database', sub: 'invoices', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'b', to: 'p', dashed: true }, { from: 'p', to: 'db' }, { from: 'b', to: 'db' }],
          flow: [['p>db', 'b>db']],
          err: ['p', 'b', 'db'],
          badges: { db: ['sent twice', 'err'], p: ['still leader?', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Majority vote, terms, and a fencing token',
        text: 'Use <b>three or five</b> voters. A leader needs a <b>majority</b>, and each election bumps a <b>term</b> number. The new leader writes with token 34; the database <b>rejects</b> the old leader\'s writes carrying token 33.',
        scene: {
          nodes: [
            { id: 'p', label: 'Old leader', sub: 'token 33', kind: 'service', at: [70, 0] },
            { id: 'b', label: 'New leader', sub: 'token 34', kind: 'service', at: [350, 0] },
            { id: 'v', label: 'Voters ×3', sub: 'majority = 2', kind: 'compute', at: [350, 110] },
            { id: 'db', label: 'Database', sub: 'checks token', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'v', to: 'b' }, { from: 'p', to: 'db' }, { from: 'b', to: 'db' }],
          flow: ['v>b', 'b>db', 'p>db'],
          ok: ['b', 'db', 'v'],
          warn: ['p'],
          badges: { db: ['33 < 34: reject', 'ok'] }
        }
      }
    ],
    usedBy: ['etcd (Kubernetes)', 'Apache ZooKeeper', 'Kafka KRaft', 'HashiCorp Consul', 'Google Chubby and Spanner', 'CockroachDB'],
    whenToUse: [
      'Several nodes must agree on a single leader, owner, lock holder or configuration',
      'You need a replicated log or state machine with no lost acknowledged writes',
      'You must explain why the system needs 3 or 5 nodes and what happens when a zone or region fails'
    ],
    whenNot: [
      'Data where conflicts can be merged later (carts, counters, presence): use AP replication and CRDTs (see <a href="cap-pacelc.html">CAP &amp; PACELC</a>)',
      'Choosing a consistency or isolation level for application queries (see <a href="consistency-models.html">Consistency Models &amp; Isolation</a>)',
      'High-throughput data paths: run consensus on metadata and leadership, not on every event (see <a href="../../system-design/systems/message-queue.html">Message Queue</a>)'
    ],
    glossary: [
      { term: 'Consensus', def: 'Processes propose values and all correct ones decide the same value, which one of them proposed, and eventually decide.' },
      { term: 'Safety vs liveness', def: 'Safety: nothing bad ever happens (no two decisions). Liveness: something good eventually happens (a decision is reached).' },
      { term: 'Quorum', def: 'A set of nodes large enough that any two such sets share at least one node, e.g. a majority.' },
      { term: 'Term (epoch, ballot)', def: 'A number that increases with every election; messages from an older term are rejected.' },
      { term: 'Commit index', def: 'The highest log entry known to be stored on a majority, and therefore safe to apply.' },
      { term: 'Lease', def: 'Permission that expires after a fixed time, so a silent holder loses it without having to be told.' },
      { term: 'Fencing token', def: 'A number that increases each time a lock is granted; the resource rejects writes with an older number.' },
      { term: 'Idempotent', def: 'Doing an operation twice has the same effect as doing it once.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Safety is never traded.</b> Two nodes must never decide different values, however bad the network gets',
      '<b>Liveness is conditional.</b> Progress is guaranteed only when a majority is up and messages arrive within a bound for long enough (partial synchrony)',
      'Every decision needs a <b>quorum</b>, and any two quorums must <b>intersect</b> (majority, or R + W &gt; N for reads)',
      'Every leadership change bumps a <b>term</b>; stale-term messages are rejected everywhere, including at the storage layer (<b>fencing</b>)',
      'An entry is <b>committed</b> only when stored on a majority; only committed entries are applied or acknowledged',
      'Delivery is <b>at least once</b>; effects become exactly once through <b>idempotent</b> processing at the endpoint (end-to-end argument)'
    ],
    nonFunctional: [
      'Survive <b>f</b> simultaneous node failures with <b>2f + 1</b> nodes (crash) or <b>3f + 1</b> (Byzantine)',
      'Failover (new leader serving writes) in <b>&lt; 1 to 10 s</b>: election timeout plus one vote round (<em>rule of thumb</em>)',
      'Commit latency ≈ <b>one round trip</b> to the fastest majority plus fsync: ~2 ms across zones, ~1 RTT across regions (<em>estimate</em>)',
      '<b>Zero</b> acknowledged writes lost on leader failover (RPO = 0)',
      'Lease-based reads only with a stated <b>clock-drift bound</b> and a lease shorter than the election timeout',
      'Duplicate-delivery side effects: <b>0</b> (dedup table or idempotency key on every consumer)'
    ],
    outOfScope: [
      '<b>Two-node clusters</b> with "the survivor takes over": a partition gives you two leaders or no leader',
      '<b>Distributed locks without fencing</b>: a paused holder writes after its lease expired',
      '<b>Even-sized clusters</b> (4, 6) that cost one more node without tolerating one more failure',
      '<b>"Exactly-once delivery"</b> claimed by middleware while the consumer has non-idempotent side effects',
      '<b>Consensus on the data path</b> for every event when a partitioned log or a single-writer design would do'
    ]
  },

  calculator: {
    inputs: [
      { id: 'n', label: 'Cluster size N (voting members)', min: 1, max: 9, value: 5 },
      { id: 'down', label: 'Nodes currently down', min: 0, max: 8, value: 1 },
      { id: 'rtt', label: 'Round trip leader ↔ followers', min: 0.2, max: 200, value: 2, step: 0.1, unit: 'ms', log: true },
      { id: 'et', label: 'Election timeout (base)', min: 50, max: 5000, value: 1000, unit: 'ms', log: true },
      { id: 'p', label: 'Availability of one node', min: 90, max: 99.99, value: 99.5, step: 0.01, unit: '%' }
    ],
    outputs: [
      { label: 'Majority (quorum) size', fmt: 'raw', f: (v) => Math.floor(v.n / 2) + 1 + ' of ' + v.n },
      { label: 'Failures tolerated: crash · Byzantine', fmt: 'raw', f: (v) => Math.floor((v.n - 1) / 2) + ' crash · ' + Math.floor((v.n - 1) / 3) + ' Byzantine (needs 3f + 1)' },
      { label: 'Can it commit right now?', fmt: 'raw', f: (v) => { const up = v.n - Math.min(v.down, v.n), m = Math.floor(v.n / 2) + 1; return up >= m ? 'yes: ' + up + ' up ≥ ' + m + ' needed (' + (up - m) + ' more may fail)' : 'NO: ' + up + ' up < ' + m + ' needed, cluster is read-only or down'; } },
      { label: 'Commit latency (1 RTT to majority + fsync)', fmt: 'raw', f: (v) => { const up = v.n - Math.min(v.down, v.n), m = Math.floor(v.n / 2) + 1; return up < m ? 'blocked' : v.n === 1 ? '≈ 1 ms (fsync only)' : '≈ ' + SD.fmt.dur(v.rtt + 2); } },
      { label: 'Leader failover time', fmt: 'raw', f: (v) => v.n < 3 ? 'none: no majority without the leader' : '≈ ' + SD.fmt.dur(v.et + v.rtt) + ' to ' + SD.fmt.dur(2 * v.et + 2 * v.rtt) },
      { label: 'Quorum availability (independent failures)', fmt: 'raw', f: (v) => { const n = v.n, m = Math.floor(n / 2) + 1, p = v.p / 100; let s = 0; const C = (a, b) => { let r = 1; for (let i = 1; i <= b; i++) r = r * (a - b + i) / i; return r; }; for (let k = m; k <= n; k++) s += C(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k); const mins = (1 - s) * 525600; return (s * 100).toFixed(s > 0.99999 ? 6 : 4) + '% (' + (mins < 1 ? (mins * 60).toFixed(1) + ' s' : SD.fmt.num(Math.round(mins)) + ' min') + ' without quorum per year)'; } }
    ],
    note: 'Majority = ⌊N/2⌋ + 1. Availability is the binomial chance that at least a majority is up, assuming <b>independent</b> node failures; real failures are correlated (a zone, a bad deploy), so spread nodes across failure domains. Commit latency assumes ~2 ms of fsync and equal RTTs (<em>estimate</em>). Failover follows Raft: a follower waits a randomised timeout in [T, 2T], then one vote round. Try N = 4 vs N = 3: same failures tolerated, lower availability.'
  },

  api: [
    { m: 'ADR', p: 'ADR-031: coordination service and cluster size', d: 'Why <b>etcd with 5 voters across 3 zones</b>: tolerates 2 node failures or 1 zone; commit ≈ 2 ms; what is <i>not</i> stored there (no bulk data). Records the fault model (crash, not Byzantine) and the read mode chosen.' },
    { m: 'POLICY', p: 'Lock usage policy', d: 'Every distributed lock is a <b>lease</b> with TTL; every protected write carries the <b>fencing token</b> (lock revision); resources reject lower tokens. Locks for efficiency may skip fencing, locks for correctness may not.' },
    { m: 'YAML', p: 'Raft timing config', d: 'Heartbeat interval and election timeout, e.g. etcd <code>heartbeat-interval: 100</code>, <code>election-timeout: 1000</code> (ms). Rule of thumb: timeout ≈ 10× heartbeat and well above the p99 RTT.' },
    { m: 'SQL', p: 'processed_message dedup table', d: 'Primary key <code>(consumer, message_id)</code>, written in the <b>same transaction</b> as the side effect. Turns at-least-once delivery into exactly-once effects.' },
    { m: 'DOC', p: 'Quorum-loss runbook', d: 'How to detect lost quorum, why you must <b>not</b> force a new cluster from a minority while the majority may still be alive, and the disaster-recovery steps (restore from snapshot, re-seed members).' },
    { m: 'SLO', p: 'Coordination SLOs', d: '<code>leader_changes_total</code> &lt; 1/day, <code>wal_fsync_duration p99 &lt; 10 ms</code>, proposals committed p99 &lt; 25 ms, and an alert on <code>has_leader == 0</code>.' }
  ],

  dataModel: [
    { name: 'raft_persistent_state', store: 'Each node, fsynced before replying', fields: [['current_term', 'uint64'], ['voted_for', 'node_id | null'], ['log[i].term', 'uint64', 'pk'], ['log[i].command', 'bytes']], note: 'Must be on stable storage before answering a vote or append, or a restarted node could vote twice in one term.' },
    { name: 'raft_volatile_state', store: 'Memory (leader adds nextIndex/matchIndex)', fields: [['commit_index', 'uint64'], ['last_applied', 'uint64'], ['next_index[peer]', 'uint64'], ['match_index[peer]', 'uint64']], note: 'commit_index advances when a majority\'s match_index ≥ N and log[N].term == current_term.' },
    { name: 'fenced_resource', store: 'Postgres (the protected resource)', fields: [['id', 'text', 'pk'], ['fence_token', 'bigint'], ['payload', 'jsonb'], ['updated_at', 'timestamptz']], note: 'Writes only apply if their token ≥ the stored one; a zombie holder\'s writes match 0 rows.' },
    { name: 'processed_message', store: 'Postgres (consumer side)', fields: [['consumer', 'text', 'pk'], ['message_id', 'uuid', 'pk'], ['processed_at', 'timestamptz', 'idx']], note: 'Insert-or-skip in the same transaction as the effect. Prune rows older than the broker\'s maximum redelivery window.' }
  ],

  architecture: {
    title: 'A 5-node Raft group, a lock lease, and a fenced resource',
    nodes: [
      { id: 'wa', label: 'Worker A', sub: 'holds lock · token 34', kind: 'service', wide: [150, 0], tall: [70, 420], tip: 'Acquired the lock through the cluster; every write it sends carries fencing token 34.' },
      { id: 'timer', label: 'Election timer', sub: 'random 150–300 ms', kind: 'policy', wide: [500, 0], tall: [210, 0], tip: 'Each follower waits a randomised timeout without hearing from a leader, then starts an election. Randomness makes split votes rare: the partial-synchrony escape from FLP.' },
      { id: 'cli', label: 'Client', sub: 'writes / reads', kind: 'client', wide: [850, 0], tall: [350, 0], tip: 'Sends commands to the leader. Followers redirect it.' },
      { id: 'lead', label: 'n1 · Leader', sub: 'term 7', kind: 'compute', wide: [500, 125], tall: [210, 210], tip: 'Appends the command to its log, replicates with AppendEntries, commits once a majority (3 of 5) stored it, applies it and answers.' },
      { id: 'sm', label: 'State machine', sub: 'apply ≤ commitIndex', kind: 'store', wide: [850, 125], tall: [210, 315], tip: 'Every node applies committed entries in log order, so all replicas compute the same state.' },
      { id: 'n2', label: 'n2 · Follower', sub: 'zone a', kind: 'compute', wide: [125, 250], tall: [70, 105], tip: 'Accepts AppendEntries only if the previous entry matches (log matching property).' },
      { id: 'n3', label: 'n3 · Follower', sub: 'zone b', kind: 'compute', wide: [375, 250], tall: [350, 105], tip: 'Grants at most one vote per term, only to a candidate whose log is at least as up to date.' },
      { id: 'n4', label: 'n4 · Follower', sub: 'zone b', kind: 'compute', wide: [625, 250], tall: [70, 315], tip: 'Any 3 of the 5 nodes form a quorum; any two quorums share a node.' },
      { id: 'n5', label: 'n5 · Follower', sub: 'zone c', kind: 'compute', wide: [875, 250], tall: [350, 315], tip: 'Can be down or partitioned and the group still commits.' },
      { id: 'res', label: 'Storage', sub: 'rejects token < max', kind: 'store', wide: [500, 375], tall: [210, 420], tip: 'The protected resource checks the fencing token on every write. This is where safety is enforced, end to end.' },
      { id: 'wb', label: 'Worker B', sub: 'zombie · token 33', kind: 'service', wide: [850, 375], tall: [350, 420], tip: 'Its lease expired during a GC pause, but it does not know yet. Its writes carry the old token.' }
    ],
    edges: [
      { from: 'cli', to: 'lead', bidi: true },
      { from: 'timer', to: 'lead', dashed: true },
      { from: 'lead', to: 'sm' },
      { from: 'lead', to: 'n2', bidi: true },
      { from: 'lead', to: 'n3', bidi: true },
      { from: 'lead', to: 'n4', bidi: true },
      { from: 'lead', to: 'n5', bidi: true },
      { from: 'wa', to: 'lead', dashed: true, label: 'lease' },
      { from: 'wa', to: 'res', bend: 0.25 },
      { from: 'wb', to: 'res' }
    ]
  },

  scenarios: [
    {
      id: 'commit', title: 'Normal write: replicate, commit, apply', tone: 'info',
      steps: [
        { text: 'The client sends <code>SET x = 5</code> to the leader n1 (term 7). n1 appends it as <b>entry 42</b> in its own log, not yet committed.', flow: ['cli>lead'], badges: { lead: 'log[42] = x:5' } },
        { text: 'n1 sends <b>AppendEntries</b> (term 7, prevLogIndex 41, prevLogTerm 7, entry 42) to all four followers in parallel.', flow: [['lead>n2', 'lead>n3', 'lead>n4', 'lead>n5']] },
        { text: 'n2 and n3 match entry 41, append 42, fsync and ack. With n1 itself that is <b>3 of 5</b>: a majority. n4 and n5 are slower; nobody waits for them.', flow: [['n2>lead', 'n3>lead']], ok: ['lead', 'n2', 'n3'], badges: { n2: ['ack', 'ok'], n3: ['ack', 'ok'] } },
        { text: 'n1 advances <b>commitIndex to 42</b>, applies it to the state machine and replies. The next heartbeat tells followers commitIndex = 42 so they apply it too.', flow: ['lead>sm', 'lead>cli'], ok: ['sm'], badges: { sm: ['x = 5', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'crash', title: 'Leader crash: election in a new term', tone: 'err',
      steps: [
        { text: 'n1 crashes. Followers stop receiving heartbeats. Nobody is told; each only sees <b>silence</b>, the FLP problem in practice.', err: ['lead'], badges: { lead: ['crashed', 'err'] }, tone: 'err' },
        { text: 'n3\'s randomised timer fires first. It becomes <b>candidate</b>, increments to <b>term 8</b>, votes for itself and sends RequestVote to everyone.', flow: [['n3>n2', 'n3>n4', 'n3>n5']], nodes: ['timer'], warn: ['n3'], badges: { n3: ['candidate T8', 'warn'] } },
        { text: 'n2 and n4 have not voted in term 8 and n3\'s log is <b>at least as up to date</b> as theirs, so they grant. 3 of 5 votes: n3 is leader of term 8.', flow: [['n2>n3', 'n4>n3']], ok: ['n3', 'n2', 'n4'], badges: { n3: ['leader T8', 'ok'] } },
        { text: 'Because every committed entry is on a majority, and a candidate needs votes from a majority that only vote for up-to-date logs, <b>the new leader has every committed entry</b>. No acknowledged write is lost.', nodes: ['n3', 'sm'], ok: ['n3'], tone: 'ok' },
        { text: 'n1 restarts with term 7. The first message from n3 carries term 8, so n1 <b>steps down</b> and its uncommitted tail is overwritten by the leader\'s log.', nodes: ['lead', 'n3'], warn: ['lead'], badges: { lead: ['follower T8', 'warn'] } }
      ]
    },
    {
      id: 'partition', title: 'Partition: the old leader in the minority', tone: 'warn',
      steps: [
        { text: 'A network cut leaves n1 and n2 on one side, n3, n4, n5 on the other. n1 still thinks it is leader of term 7.', nodes: ['lead', 'n2'], warn: ['lead', 'n2'], badges: { lead: ['minority', 'warn'] }, tone: 'warn' },
        { text: 'A client write reaches n1. It appends and replicates to n2, but <b>2 of 5</b> is not a majority. The entry is never committed and the client <b>times out</b>.', flow: ['cli>lead', 'lead>n2', 'n2>lead'], err: ['cli'], badges: { cli: ['timeout', 'err'] }, tone: 'err' },
        { text: 'On the majority side n4 times out, wins term 8 with votes from n3 and n5, and <b>commits new writes</b>. The system stays available for everyone who can reach the majority.', flow: [['n4>n3', 'n4>n5']], ok: ['n3', 'n4', 'n5'], badges: { n4: ['leader T8', 'ok'] } },
        { text: 'When the cut heals, n1 sees term 8, steps down and its uncommitted entry is <b>discarded</b>. Safety held: no two leaders ever committed in the same term. A <b>lease read</b> on n1 during the cut would have been stale, which is why leases must expire before a new election can win.', nodes: ['lead'], ok: ['lead'], badges: { lead: ['rolled back', 'info'] }, tone: 'ok' }
      ]
    },
    {
      id: 'fence', title: 'Zombie lock holder vs fencing token', tone: 'err',
      steps: [
        { text: 'Worker B holds the lock (lease 10 s) with <b>token 33</b>, starts writing, then hits a <b>20 s GC pause</b>.', nodes: ['wb'], warn: ['wb'], badges: { wb: ['paused', 'warn'] } },
        { text: 'The lease expires in the cluster. Worker A acquires the lock and gets <b>token 34</b> (the etcd revision of its lock key, strictly larger). It writes to storage.', flow: ['wa>lead', 'lead>wa', 'wa>res'], ok: ['wa', 'res'], badges: { res: ['max = 34', 'ok'] } },
        { text: 'Worker B wakes up, still believing it holds the lock, and sends its delayed write with token 33. Without fencing this <b>overwrites A\'s data</b>.', flow: ['wb>res'], err: ['wb'], badges: { wb: ['token 33', 'err'] }, tone: 'err' },
        { text: 'With fencing the storage compares: <b>33 &lt; 34, reject</b>. Safety lives at the resource, not in the lock service. This is Kleppmann\'s point and the end-to-end argument in one picture.', nodes: ['res'], ok: ['res'], err: ['wb'], badges: { res: ['33 < 34: reject', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'scale', title: 'Under pressure: 3 regions and a slow disk', tone: 'warn',
      steps: [
        { text: 'The team spreads 5 nodes across <b>3 regions</b> to survive a region loss. Now every commit waits for the second-closest region: <b>+1 cross-region RTT</b> on each write.', flow: ['cli>lead', ['lead>n4', 'lead>n5'], 'n4>lead'], warn: ['lead'], badges: { lead: ['+60 ms / write', 'warn'] }, tone: 'warn' },
        { text: 'A follower\'s disk gets slow (fsync p99 = 500 ms). With 5 nodes the leader only needs the <b>2 fastest followers</b>, so commit latency barely moves. Quorums hide stragglers.', nodes: ['n5'], warn: ['n5'], badges: { n5: ['slow fsync', 'warn'] } },
        { text: 'If the <b>leader\'s</b> disk is slow, heartbeats stall, followers time out and elections churn. Watch <code>leader_changes</code>; raise the election timeout above the p99 RTT plus fsync.', nodes: ['lead', 'timer'], err: ['lead'], badges: { timer: ['churn', 'err'] }, tone: 'err' },
        { text: 'Fixes: put the leader near the clients (leader preference), serve reads with <b>leases or follower reads</b>, and keep consensus for <b>metadata</b> while bulk data flows through partitioned logs.', nodes: ['lead', 'sm'], ok: ['lead', 'sm'], badges: { sm: ['metadata only', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'A replicated coordination service (think etcd, ZooKeeper, a Raft-backed metadata store). Every combination below is a real deployment choice. Latencies are <em>illustrative</em>: 0.5 ms within a zone, ~1.5 ms across zones, ~60 ms across regions.',
    diagram: null,
    controls: [
      { id: 'n', label: 'Cluster size (voters)', type: 'seg', value: '5', options: [
        { v: '3', l: '3 nodes' }, { v: '4', l: '4 nodes' }, { v: '5', l: '5 nodes' }, { v: '7', l: '7 nodes' }] },
      { id: 'fault', label: 'Fault model', type: 'seg', value: 'crash', options: [
        { v: 'crash', l: 'Crash (Raft / Paxos)' }, { v: 'byz', l: 'Byzantine (PBFT-style)' }] },
      { id: 'dep', label: 'Deployment', type: 'seg', value: 'az3', options: [
        { v: 'az1', l: '1 zone' }, { v: 'az3', l: '3 zones, 1 region' }, { v: 'r3', l: '3 regions' }] },
      { id: 'read', label: 'Read mode', type: 'seg', value: 'leader', options: [
        { v: 'leader', l: 'Leader (ReadIndex)' }, { v: 'lease', l: 'Leader lease read' }, { v: 'follower', l: 'Follower read' }] }
    ],
    evaluate(s) {
      const N = +s.n, byz = s.fault === 'byz';
      const f = byz ? Math.floor((N - 1) / 3) : Math.floor((N - 1) / 2);
      const rtt = { az1: 0.5, az3: 1.5, r3: 60 }[s.dep];
      const fsync = 2;
      const wl = byz ? 3 * rtt + fsync : rtt + fsync;                 // PBFT: pre-prepare, prepare, commit rounds
      const remote = s.dep === 'r3' ? (2 / 3) * rtt : 0;               // avg client→leader extra in 3 regions
      const rl = s.read === 'follower' ? 0.5 : s.read === 'lease' ? 0.5 + remote : 0.5 + rtt + remote;
      const cost = N * (byz ? 1.3 : 1) * (s.dep === 'r3' ? 1.6 : s.dep === 'az3' ? 1.1 : 1);
      const ms = (x) => x < 10 ? x.toFixed(1) + ' ms' : Math.round(x) + ' ms';
      const survive = s.dep === 'az1' ? 'nodes only, not a zone' : s.dep === 'az3' ? (N >= 3 && f >= Math.ceil(N / 3) ? 'one zone' : 'nodes; a zone only if ≤ ' + f + ' nodes in it') : (f >= Math.ceil(N / 3) ? 'one region' : 'nodes; not every region');
      const zoneOk = s.dep !== 'az1' && f >= Math.ceil(N / 3);
      let riskV, riskS;
      if (s.read === 'leader') { riskV = 'none: linearizable (confirm leadership each read)'; riskS = 0.95; }
      else if (s.read === 'lease') { riskV = 'stale only if clock drift exceeds the bound'; riskS = s.dep === 'r3' ? 0.55 : 0.7; }
      else { riskV = 'stale reads by replication lag (not linearizable)'; riskS = 0.35; }
      const metrics = [
        { k: 'Failures tolerated', v: f + ' ' + (byz ? 'Byzantine' : 'crash') + ' of ' + N, s: Math.min(1, f / 3), hint: byz ? 'N ≥ 3f + 1' : 'N ≥ 2f + 1' },
        { k: 'Survives', v: survive, s: zoneOk ? (s.dep === 'r3' ? 1 : 0.8) : 0.3 },
        { k: 'Write latency', v: '≈ ' + ms(wl), s: wl < 5 ? 0.95 : wl < 30 ? 0.6 : 0.2, hint: byz ? '3 message rounds' : '1 RTT to majority + fsync' },
        { k: 'Read latency', v: '≈ ' + ms(rl), s: rl < 3 ? 0.95 : rl < 30 ? 0.6 : 0.25 },
        { k: 'Cost (relative)', v: cost.toFixed(1) + '×', s: Math.max(0.05, 1 - cost / 15) },
        { k: 'Stale / split-brain risk', v: riskV, s: riskS }
      ];
      const notes = [];
      if (N % 2 === 0) notes.push('<b>Even size:</b> ' + N + ' nodes need a majority of ' + (N / 2 + 1) + ' and tolerate only ' + f + ' crash, the same as ' + (N - 1) + ' nodes, with more machines that can fail.');
      if (byz) notes.push('Byzantine tolerance needs <b>3f + 1</b> nodes, signed messages and more rounds. Worth it across <b>mutually distrusting</b> parties (blockchains); rarely inside one company, where bugs are correlated across identical replicas anyway.');
      if (s.read === 'lease') notes.push('Lease reads skip the confirmation round: the leader serves locally while its lease is valid, assuming clocks drift less than the margin. A paused or skewed leader can serve <b>stale</b> data.');
      if (s.read === 'follower') notes.push('Follower reads are local and cheap but see <b>replication lag</b>. Fine for config caches and dashboards; wrong for "check then act" decisions.');
      if (s.dep === 'r3') notes.push('Across regions, each write pays <b>~1 cross-region RTT</b>. Spanner and CockroachDB accept this and keep reads local with leases or bounded-staleness reads.');
      if (s.dep === 'az1') notes.push('One zone is fast, but a zone outage takes the <b>whole quorum</b> with it.');
      let verdict;
      if (N % 2 === 0) verdict = '⚠ <b>Even cluster:</b> pay for ' + N + ' nodes, tolerate ' + f + '. Use ' + (N - 1) + ' or ' + (N + 1) + '.';
      else if (byz && s.dep !== 'r3') verdict = '⚠ <b>Byzantine inside one trust domain</b> triples write rounds and cost; crash tolerance plus checksums and fencing is usually enough.';
      else if (s.dep === 'az1') verdict = '⚠ <b>Fast but fragile:</b> survives ' + f + ' node(s), not a zone outage.';
      else if (s.read === 'follower') verdict = '👍 <b>Cheap reads, weaker guarantee:</b> good for caches; route correctness-critical reads to the leader.';
      else if (s.dep === 'r3' && s.read === 'leader') verdict = '👍 <b>Region-proof and linearizable</b>, but every write and leader read crosses the WAN. Consider lease reads near the leader.';
      else if (N === 3 && s.dep === 'az3') verdict = '✅ <b>The default:</b> 3 nodes in 3 zones survive one zone; commit ≈ ' + ms(wl) + '.';
      else verdict = '✅ <b>Solid choice:</b> ' + N + ' nodes, ' + f + ' failures tolerated, ' + (s.dep === 'r3' ? 'region' : 'zone') + ' loss survivable.';
      const hide = N === 3 ? ['n4', 'n5'] : N === 4 ? ['n5'] : [];
      return {
        metrics, verdict, notes, hide,
        flow: s.read === 'follower' ? ['cli>lead', ['lead>n2', 'lead>n3'], 'n2>lead', 'lead>cli'] : ['cli>lead', ['lead>n2', 'lead>n3'], 'n3>lead', 'lead>sm', 'lead>cli'],
        labels: {
          lead: { label: 'n1 · Leader', sub: byz ? 'primary · 3 phases' : 'quorum ' + (Math.floor(N / 2) + 1) + ' of ' + N },
          n5: { label: 'n5 · Follower', sub: N === 7 ? '+ n6, n7' : 'zone c' },
          timer: { label: byz ? 'View change' : 'Election timer', sub: byz ? 'needs 2f + 1 votes' : 'random 150–300 ms' }
        },
        ok: s.read === 'leader' ? ['lead'] : [],
        warn: (s.read !== 'leader' ? ['sm'] : []).concat(N % 2 === 0 ? ['n4'] : []),
        badges: { lead: [s.read === 'leader' ? 'ReadIndex' : s.read === 'lease' ? 'lease read' : 'writes only', 'info'], cli: ['f = ' + f, f >= 2 ? 'ok' : 'warn'] }
      };
    }
  },

  widget: {
    title: 'Raft on five nodes: kill, partition, watch the terms',
    caption: 'A real Raft simulation: randomised election timeouts, RequestVote with the up-to-date log check, AppendEntries with the previous-entry consistency check, and commit only when a <b>majority</b> stores an entry of the <b>current term</b>. Tap a node to kill or revive it, <b>Partition</b> to cut the leader off with one follower, and <b>Write</b> to send a command to every node that believes it is leader. Log cells are coloured by term; solid = committed. Below, check whether two quorums must overlap.'
  },

  realWorld: {
    intro: 'Fifty years from thought experiment to the control plane of every Kubernetes cluster: the proofs set the limits, the systems learned to live inside them.',
    timeline: [
      { when: '1975–78', who: 'Akkoyunlu, Ekanadham &amp; Huber; Jim Gray', title: 'Two Generals', text: 'Two parties over a lossy channel can never both be <b>certain</b> they agree: the last messenger might always be lost. Gray named it in his 1978 "Notes on Data Base Operating Systems". The practical lesson: acknowledgements and retries, not certainty.', src: 0 },
      { when: '1982', who: 'Lamport, Shostak &amp; Pease (SRI)', title: 'The Byzantine Generals Problem', text: 'With only oral messages, agreement is possible <b>if and only if more than two-thirds</b> of the generals are loyal (n ≥ 3f + 1). With unforgeable signed messages, any number of traitors can be tolerated.', src: 1 },
      { when: '1984', who: 'Saltzer, Reed &amp; Clark (MIT)', title: 'End-to-end arguments', text: 'Functions like reliable delivery and duplicate suppression can only be <b>completely and correctly</b> implemented at the endpoints; lower layers can only help performance. The root of "exactly-once = at-least-once + idempotency".', src: 4 },
      { when: '1985', who: 'Fischer, Lynch &amp; Paterson', title: 'FLP impossibility (JACM)', text: 'In a fully asynchronous system, <b>every</b> consensus protocol has a possible non-terminating run, even with only one faulty process, because a crashed process cannot be told apart from a slow one.', src: 2 },
      { when: '1988', who: 'Dwork, Lynch &amp; Stockmeyer', title: 'Partial synchrony', text: 'Models between synchronous and asynchronous, such as bounds that only hold <b>after some unknown time</b>, in which consensus <i>is</i> solvable: safe always, live once the network settles. Dijkstra Prize 2007.', src: 3 },
      { when: '1994–97', who: 'L Peter Deutsch, James Gosling (Sun)', title: 'Fallacies of distributed computing', text: 'The network is reliable, latency is zero, bandwidth is infinite, the network is secure, topology doesn\'t change, there is one administrator, transport cost is zero, the network is homogeneous. Accounts of who wrote the first four differ.', src: 6 },
      { when: '2001', who: 'Leslie Lamport', title: 'Paxos Made Simple', text: 'Re-explains the Part-Time Parliament algorithm in plain English: proposers, acceptors and learners; a value is chosen once a <b>majority of acceptors</b> accept the same numbered proposal.', src: 5 },
      { when: '2006', who: 'Google (Mike Burrows)', title: 'Chubby lock service', text: 'A Paxos-replicated lock service, typically <b>5 replicas</b>, used by GFS and Bigtable to elect masters. Google chose a lock service over a Paxos library so teams could use familiar locks. Inspired ZooKeeper.', src: 7 },
      { when: '2014', who: 'Diego Ongaro &amp; John Ousterhout (Stanford)', title: 'Raft (USENIX ATC, Best Paper)', text: 'Same guarantees as Multi-Paxos, structured for understandability: separate <b>leader election, log replication and safety</b>. A user study found students learned it more easily than Paxos.', src: 8 },
      { when: '2016', who: 'Martin Kleppmann', title: 'How to do distributed locking', text: 'A client can pause after acquiring a lock and write after its lease expired. Fix: a <b>fencing token</b> that increases on every grant, checked by the storage (token 33 rejected after 34). Redlock produces no such token.', src: 9 },
      { when: '2019', who: 'Amazon Builders\' Library', title: 'Leader election in distributed systems', text: '<b>Leases</b> are the most widely used leader-election mechanism at Amazon. The hard part is making sure the leader only does work <b>while it still holds</b> the lease; clocks are not trusted for ordering.', src: 10 },
      { when: '2019–25', who: 'Apache Kafka', title: 'KIP-500: KRaft replaces ZooKeeper', text: 'Kafka moves cluster metadata into an internal log managed by a <b>Raft quorum of controllers</b> inside Kafka, removing the external ZooKeeper ensemble.', src: 11 },
      { when: 'today', who: 'etcd', title: 'Locks are an optimisation', text: 'etcd\'s concurrency API returns a lock key tied to a lease and warns that the lock API <b>cannot be used as a mutual exclusion mechanism by itself</b>: guard writes with the key\'s revision.', src: 12 }
    ],
    lessons: [
      'You cannot buy certainty from the network. Design for <b>safety always, liveness usually</b>.',
      'Use <b>odd</b> clusters of 3 or 5, spread across failure domains; 7 only when you must survive 3 failures.',
      'A lock or lease without a <b>fencing check at the resource</b> is only an efficiency hint.',
      'Exactly-once is an <b>end-to-end</b> property: at-least-once delivery plus idempotent, transactional processing.'
    ],
    sources: [
      { title: 'Two Generals (lecture notes)', url: 'https://cs.yale.edu/homes/aspnes/pinewiki/TwoGenerals.html', pub: 'James Aspnes, Yale' },
      { title: 'The Byzantine Generals Problem', url: 'https://www.microsoft.com/en-us/research/publication/byzantine-generals-problem/', pub: 'Lamport, Shostak & Pease, ACM TOPLAS 1982' },
      { title: 'Impossibility of Distributed Consensus with One Faulty Process', url: 'https://groups.csail.mit.edu/tds/papers/Lynch/jacm85.pdf', pub: 'Fischer, Lynch & Paterson, JACM 1985' },
      { title: 'Consensus in the Presence of Partial Synchrony', url: 'https://groups.csail.mit.edu/tds/papers/Lynch/jacm88.pdf', pub: 'Dwork, Lynch & Stockmeyer, JACM 1988' },
      { title: 'End-to-End Arguments in System Design', url: 'https://www.cs.princeton.edu/courses/archive/fall15/cos518/papers/endtoend.pdf', pub: 'Saltzer, Reed & Clark, ACM TOCS 1984' },
      { title: 'Paxos Made Simple', url: 'https://pdos.csail.mit.edu/archive/6.824-2012/papers/paxos-simple.pdf', pub: 'Leslie Lamport, 2001' },
      { title: 'Fallacies of Distributed Computing Explained', url: 'https://lasr.cs.ucla.edu/classes/188_winter15/readings/fallacies.pdf', pub: 'Arnon Rotem-Gal-Oz' },
      { title: 'The Chubby lock service for loosely-coupled distributed systems', url: 'https://static.usenix.org/event/osdi06/tech/full_papers/burrows/burrows_html/index.html', pub: 'Mike Burrows, OSDI 2006' },
      { title: 'In Search of an Understandable Consensus Algorithm', url: 'https://www.usenix.org/conference/atc14/technical-sessions/presentation/ongaro', pub: 'Ongaro & Ousterhout, USENIX ATC 2014' },
      { title: 'How to do distributed locking', url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html', pub: 'Martin Kleppmann, 2016' },
      { title: 'Leader election in distributed systems', url: 'https://aws.amazon.com/builders-library/leader-election-in-distributed-systems/', pub: 'Amazon Builders\' Library' },
      { title: 'KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum', url: 'https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum', pub: 'Apache Kafka' },
      { title: 'etcd concurrency API reference', url: 'https://etcd.io/docs/v3.4/dev-guide/api_concurrency_reference_v3/', pub: 'etcd documentation' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Cluster size', '<b>3 nodes</b>: tolerates 1, cheapest, fastest quorum', '<b>5 nodes</b>: tolerates 2 (or 1 during maintenance)', '3 for most services; 5 when you patch nodes routinely or need to survive a zone plus a node'],
      ['Fault model', '<b>Crash-fault</b> (Raft, Paxos): 2f + 1, 1 round', '<b>Byzantine</b> (PBFT, Tendermint): 3f + 1, signatures, more rounds', 'Byzantine only across organisations that distrust each other'],
      ['Reads', '<b>Leader / ReadIndex</b>: linearizable, +1 heartbeat round', '<b>Lease or follower reads</b>: local, depend on clocks or accept lag', 'Lease reads with tight clocks; follower reads for caches and dashboards'],
      ['Leadership', '<b>Consensus service</b> (etcd, ZooKeeper, Consul)', '<b>Lease in a DB row</b> (conditional update with expiry)', 'DB lease is fine if the resource checks a fencing token; otherwise use the consensus service'],
      ['Placement', '<b>3 zones, 1 region</b>: ~1–2 ms commit', '<b>3 regions</b>: survives a region, ~1 WAN RTT per commit', 'Multi-region when region loss is in scope and writes are few'],
      ['Duplicates', '<b>Middleware "exactly-once"</b> (Kafka transactions)', '<b>Idempotent consumer</b> (dedup table, idempotency keys)', 'Middleware covers Kafka-to-Kafka; any external side effect still needs idempotency']
    ]
  },
  failures: [
    { f: 'Split brain: two nodes act as leader', detect: 'Two nodes report leader; writes with two different terms in one time window; divergent data', fix: 'Majority-quorum election with terms; leases shorter than election timeout; fencing tokens checked by every resource.' },
    { f: 'Zombie lock holder after a GC pause', detect: 'Writes from a worker whose lease expired; token gaps or regressions in the resource\'s log', fix: 'Fencing token (lock revision) on every write; resource rejects lower tokens; keep critical sections short.' },
    { f: 'Election churn (leader flapping)', detect: '<code>leader_changes_total</code> rising; high fsync or RTT p99; client timeouts in bursts', fix: 'Election timeout ≫ heartbeat and p99 RTT; dedicated fast disks for the WAL; avoid CPU starvation; pre-vote.' },
    { f: 'Quorum lost', detect: 'No leader; proposals time out; <code>has_leader == 0</code>', fix: 'Restore failed members first. Forcing a new cluster from a minority can lose committed writes: only as documented disaster recovery.' },
    { f: 'Lease read returns stale data', detect: 'Linearizability checker (Jepsen-style) finds stale reads after clock jumps or VM pauses', fix: 'Monotonic clocks, drift margin in lease length, or fall back to ReadIndex for critical reads.' },
    { f: 'Duplicate side effects from redelivery', detect: 'Double charges or emails after consumer restarts or rebalances', fix: 'Idempotent consumer: dedup table in the same transaction as the effect; idempotency keys on outbound calls.' },
    { f: 'Even or two-node cluster', detect: 'Design review: "what happens if the link between the two drops?"', fix: 'Odd number of voters; add a witness / tie-breaker in a third failure domain.' }
  ],

  interview: [
    { q: 'What does the FLP result say, and why do Raft and Paxos still work?', a: '<p>Fischer, Lynch and Paterson (JACM 1985): in a <b>fully asynchronous</b> system, where message delays have no bound, no <b>deterministic</b> consensus protocol can guarantee termination if even <b>one</b> process may crash. A slow process is indistinguishable from a dead one, so an adversarial schedule can keep the protocol undecided forever.</p><p>It does <b>not</b> say consensus is impossible in practice. Real systems escape by weakening an assumption:</p><ul><li><b>Partial synchrony</b> (Dwork, Lynch, Stockmeyer 1988): safety always, liveness once delays are bounded. Raft and Paxos are always safe and make progress when the network behaves.</li><li><b>Timeouts</b> as failure detectors (may be wrong, cost only liveness).</li><li><b>Randomisation</b>: Raft\'s random election timeouts, Ben-Or style protocols terminate with probability 1.</li></ul>', fu: 'Is FLP about safety or liveness? (Liveness: you can always be safe; you cannot always guarantee progress.)', lvl: 'core' },
    { q: 'Why do we need 2f + 1 nodes for crash faults but 3f + 1 for Byzantine faults?', a: '<p><b>Crash</b>: you must make progress while f nodes are silent, so a quorum is at most N − f. Two quorums must intersect: 2(N − f) &gt; N, so <b>N ≥ 2f + 1</b>. The overlap node is honest, so it carries the latest decision.</p><p><b>Byzantine</b>: the overlap might itself be a liar. Two quorums of N − f must overlap in at least <b>f + 1</b> nodes so at least one honest node is shared: 2(N − f) − N ≥ f + 1, giving <b>N ≥ 3f + 1</b>. Lamport, Shostak and Pease (1982) proved this bound for oral messages; with signatures the agreement bound changes, but practical BFT state machine replication still uses 3f + 1.</p>', lvl: 'core' },
    { q: 'Explain the Two Generals problem and what it teaches system designers.', a: '<p>Two generals must attack at the same time and can only communicate by messengers who may be captured. However many acknowledgements they exchange, the sender of the <b>last</b> message cannot know it arrived, so neither can be certain. No finite protocol gives common knowledge over a lossy link.</p><p>Lessons: you cannot get exactly-once <b>delivery</b>; you get at-most-once or at-least-once. So you design <b>retries + idempotency</b>, timeouts with explicit unknown outcomes ("did my payment go through?"), and reconciliation. It is also why two-phase commit can block.</p>', lvl: 'core' },
    { q: 'Walk me through Raft: election, terms, log replication and commit.', a: '<ul><li><b>Terms</b>: logical clock; each term has at most one leader. Any message with a higher term makes the receiver a follower.</li><li><b>Election</b>: a follower that hears nothing for a randomised timeout becomes candidate, increments its term, votes for itself and sends RequestVote. A node grants one vote per term, only if the candidate\'s log is <b>at least as up to date</b> (last term, then length). Majority wins.</li><li><b>Replication</b>: the leader appends commands and sends AppendEntries with <code>prevLogIndex/prevLogTerm</code>; followers reject on mismatch and the leader backs up <code>nextIndex</code> until logs match (log matching property).</li><li><b>Commit</b>: an entry is committed once stored on a majority <b>and</b> it is from the leader\'s current term (older entries commit indirectly). Then it is applied to the state machine and the client is answered.</li></ul>', fu: 'Why the current-term rule? (Figure 8 of the Raft paper: an old-term entry on a majority can still be overwritten by a later leader.)', lvl: 'deep' },
    { q: 'How do Paxos and Raft relate?', a: '<p>Both are crash-fault-tolerant majority-quorum protocols with the same core idea: a numbered round (ballot / term), a promise from a majority not to accept older rounds, and adopting any value that might already be chosen. <b>Multi-Paxos</b> with a stable leader is essentially what Raft specifies.</p><p>Raft\'s differences are for understandability: a strong leader, logs that only flow leader → follower, no holes in the log, and election restricted to up-to-date candidates, so the new leader never needs to fetch missing entries. Ongaro and Ousterhout (2014) report it is as efficient as Paxos.</p>', lvl: 'deep' },
    { q: 'What is a fencing token, and why is a lease alone not enough?', a: '<p>A lease is a lock with an expiry. The holder can be paused (GC, VM migration, page fault) <b>after</b> checking it still holds the lease and <b>before</b> writing. By the time the write lands, the lease has expired and someone else holds the lock.</p><p>A <b>fencing token</b> is a number that increases on every grant (ZooKeeper zxid, etcd revision of the lock key, a DB sequence). Every write carries it, and the <b>resource</b> rejects tokens lower than the highest it has seen (Kleppmann 2016). Safety is enforced at the endpoint, not in the lock service.</p>', fu: 'What if the resource cannot check tokens? (Make the operation idempotent or conditional, e.g. compare-and-set on a version.)', lvl: 'core' },
    { q: 'Your quorum store has N = 5. Which R and W give strong reads, and what do R + W > N and W > N/2 each guarantee?', a: '<p><b>R + W &gt; N</b> means every read set intersects every write set, so a read sees at least one copy of the latest acknowledged write (e.g. W = 3, R = 3, or W = 4, R = 2).</p><p><b>W &gt; N/2</b> means two write quorums intersect, so two concurrent writes cannot both succeed on disjoint sets without seeing each other. You need both for a sensible register, and still need a version or term to pick the latest. Quorum overlap alone is not linearizability (no read repair, sloppy quorums, LWW): consensus adds the ordering.</p>', lvl: 'core' },
    { q: 'What does "exactly-once" really mean in Kafka or any queue?', a: '<p>Delivery over an unreliable network is at-most-once or <b>at-least-once</b> (Two Generals). "Exactly-once" is about <b>effects</b>: at-least-once delivery plus <b>idempotent or transactional</b> processing.</p><ul><li>Kafka: the idempotent producer dedups retries by producer id + sequence; transactions commit output records and consumer offsets atomically, read with <code>read_committed</code>. That covers Kafka-to-Kafka.</li><li>Any external effect (DB write, email, payment) needs the consumer to dedup: a <code>processed_message</code> row in the same DB transaction, or an idempotency key sent to the downstream API.</li></ul><p>This is the <b>end-to-end argument</b> (Saltzer, Reed, Clark 1984): only the endpoint can do it completely.</p>', lvl: 'core' },
    { q: 'Name the fallacies of distributed computing and one design consequence of each you have seen.', a: '<ul><li><b>Reliable network</b> → retries, idempotency, timeouts.</li><li><b>Zero latency</b> → batch, avoid chatty calls, put the leader near writers.</li><li><b>Infinite bandwidth</b> → snapshots and log compaction in Raft.</li><li><b>Secure network</b> → mTLS between peers.</li><li><b>Topology does not change</b> → membership changes (joint consensus), service discovery.</li><li><b>One administrator</b> → versioned configs, safe rollouts.</li><li><b>Transport cost is zero</b> → cross-zone traffic bills.</li><li><b>Homogeneous network</b> → mixed MTUs, NATs, clocks.</li></ul><p>Attributed to L Peter Deutsch and colleagues at Sun (1994), with the eighth added by James Gosling around 1997.</p>', lvl: 'core' },
    { q: 'Design: leader election for a cron scheduler that must never run a job twice.', a: '<ul><li>Elect with an <b>etcd lease</b> (TTL ~10 s, refreshed every 3 s) or a Kubernetes Lease object.</li><li>Use the lock key\'s <b>revision as fencing token</b>; every job run inserts <code>(job_id, scheduled_at)</code> with the token into Postgres, with a unique key and a token check.</li><li>Leader steps down if it cannot refresh before TTL − margin, and checks lease validity before each run.</li><li>Jobs are <b>idempotent</b> by <code>(job_id, scheduled_at)</code>, so a duplicate attempt is a no-op even if fencing is bypassed.</li><li>Run 3 scheduler replicas across zones; failover ≈ TTL + election, well under a minute.</li></ul>', fu: 'What if etcd is unavailable? (No new leader: jobs pause. That is the CP choice; document it.)', lvl: 'deep' },
    { q: 'Tell me about a time a coordination bug caused duplicate or lost work. What did you change?', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><p><b>Situation:</b> Our invoice batch ran on two instances with a Redis lock (30 s TTL). After a JVM upgrade, a 40 s GC pause let the second instance take the lock, and 1,200 customers got duplicate invoices.</p><p><b>Task:</b> As tech lead I owned the fix and the post-incident review.</p><p><b>Action:</b> I showed the timeline (lock expired mid-batch) and argued the lock was only an efficiency hint. We moved to an etcd lease with the <b>revision as fencing token</b>, added a unique <code>(customer_id, period)</code> constraint plus token check on the invoice table, and made sending emails consume from an outbox keyed by invoice id.</p><p><b>Result:</b> Zero duplicates in the next 18 months, including two forced failovers in game days; the pattern became our standard for any singleton job.</p>', lvl: 'core' },
    { q: 'How would you convince a team to run 3 etcd nodes across zones instead of 2 "for cost"?', a: '<p>Frame it as a failure the team will actually see. With <b>2 nodes</b>, majority is 2, so losing <b>either</b> node stops writes: availability is worse than one node. With 3 across 3 zones, majority is 2, one node or one zone can fail, and the third node costs a small VM.</p><p>Show the numbers: with 99.5% nodes, the 3-node quorum is up ~99.99%; the 2-node one ~99.0%. Write it in an ADR with the fault model and the failover test you will run.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Java + Postgres: reject writes from a zombie lock holder', lang: 'java',
      code: `// Spring Boot 3, Java 21, Postgres 15+
// CREATE TABLE fenced_resource (
//   id text PRIMARY KEY, fence_token bigint NOT NULL,
//   payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class FencedWriter {
  private final JdbcTemplate jdbc;
  public FencedWriter(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  /** token = lock revision from etcd/ZooKeeper; grows on every grant. */
  @Transactional
  public void write(String id, long token, String json) {
    int rows = jdbc.update("""
        INSERT INTO fenced_resource (id, fence_token, payload)
        VALUES (?, ?, ?::jsonb)
        ON CONFLICT (id) DO UPDATE
           SET fence_token = EXCLUDED.fence_token,
               payload     = EXCLUDED.payload,
               updated_at  = now()
         WHERE fenced_resource.fence_token <= EXCLUDED.fence_token
        """, id, token, json);
    if (rows == 0) {
      // a newer holder has written: we lost the lock while paused
      throw new StaleLockException(id, token);
    }
  }

  public static class StaleLockException extends RuntimeException {
    public StaleLockException(String id, long token) {
      super("fencing token " + token + " is stale for " + id);
    }
  }
}`,
      note: 'The check runs <b>inside the resource</b>, atomically with the write: Postgres serialises the upsert on the row, so a token-33 write after a token-34 write updates 0 rows. <code>&lt;=</code> lets the current holder write repeatedly.'
    },
    {
      title: 'Python: etcd lease lock that hands out a fencing token', lang: 'python',
      code: `# pip install etcd3  (python-etcd3, etcd v3 gRPC API)
import etcd3

client = etcd3.client(host="etcd", port=2379)
KEY = "/locks/invoice-batch"

def acquire(owner: str, ttl: int = 10):
    lease = client.lease(ttl)                      # expires unless refreshed
    ok, _ = client.transaction(
        compare=[client.transactions.create(KEY) == 0],   # key absent
        success=[client.transactions.put(KEY, owner, lease)],
        failure=[],
    )
    if not ok:
        lease.revoke()
        return None
    _, meta = client.get(KEY)
    token = meta.create_revision    # cluster-wide, strictly increasing
    return lease, token

def run_batch(owner: str) -> None:
    got = acquire(owner)
    if got is None:
        return                      # someone else is leader
    lease, token = got
    try:
        for chunk in range(10):
            lease.refresh()         # keep alive; a pause can still outlive it
            write_with_token(chunk, token)   # e.g. FencedWriter.write(...)
    finally:
        lease.revoke()              # release early; TTL is the safety net`,
      note: 'When the lease expires, etcd deletes the key, so the next <code>put</code> gets a larger <code>create_revision</code>. etcd\'s docs warn the lock alone is not mutual exclusion: the token check at the resource is what makes it safe. The python-etcd3 client is lightly maintained; in Java, jetcd\'s <code>Lock</code> client returns the lock key, whose revision serves the same purpose.'
    },
    {
      title: 'Postgres: idempotent consumer (at-least-once in, exactly-once effect)', lang: 'sql',
      code: `CREATE TABLE processed_message (
  consumer     text        NOT NULL,
  message_id   uuid        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, message_id)
);

-- Per message, in ONE transaction; ack the broker only after COMMIT.
-- $1 = message_id, $2 = amount_cents, $3 = account_id
BEGIN;
WITH claim AS (
  INSERT INTO processed_message (consumer, message_id)
  VALUES ('billing', $1)
  ON CONFLICT DO NOTHING          -- a redelivery inserts nothing
  RETURNING message_id
)
UPDATE account
   SET balance_cents = balance_cents - $2
 WHERE id = $3
   AND EXISTS (SELECT 1 FROM claim);  -- effect only on first delivery
COMMIT;

-- Housekeeping: keep rows longer than the broker's max redelivery window
DELETE FROM processed_message
 WHERE processed_at < now() - interval '14 days';`,
      note: 'If the consumer crashes after COMMIT but before acking, the broker redelivers; the insert conflicts, <code>claim</code> is empty and the update touches 0 rows. Concurrent duplicates block on the primary key until the first commits, then skip.'
    }
  ],

  related: ['cap-pacelc', 'consistency-models', 'reliability-math', 'sd:lock-manager', 'sd:distributed-sql', 'sd:kv-store', 'sd:message-queue']
});
