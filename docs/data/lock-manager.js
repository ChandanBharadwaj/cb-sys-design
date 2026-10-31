SD.register({
  slug: 'lock-manager',
  domain: 1,
  title: 'Distributed Lock Manager',
  examples: 'Chubby, ZooKeeper, etcd',
  tagline: 'Let exactly one process act at a time across many machines, even when processes pause, networks split and clocks drift, and <b>prove it at the resource with a fencing token</b>.',
  tldr: {
    problem: 'Several workers may run the same job or write the same object. A lock must survive server crashes, but a crashed holder must not block everyone forever.',
    idea: 'Keep locks in a small <b>consensus cluster</b> (Raft/Zab/Paxos) as keys tied to a <b>lease</b> that the holder keeps alive. Each grant comes with a <b>monotonic token</b> that the protected resource checks.',
    insight: 'A lease only says "you <i>had</i> the lock". A GC pause or slow network can outlive it. Safety therefore comes from <b>fencing</b>: the storage rejects writes with a token older than one it has already seen.',
    numbers: [
      { v: '5', l: 'replicas in a typical Chubby cell, 3 needed (Google, 2006)' },
      { v: '12 s', l: 'default Chubby session lease, extended by KeepAlives (2006 paper)' },
      { v: '2f + 1', l: 'servers needed to survive f failures (Raft / Zab / Paxos)' }
    ]
  },
  intro: {
    what: 'A distributed lock manager lets processes on many different machines agree that <b>only one of them</b> may do a certain thing at a time, such as run the nightly billing job or update one file. A process asks for a named lock, does its work, then releases it. If the holder crashes, the lock frees itself after a short timeout so nobody waits forever.',
    analogy: {
      icon: '🎤',
      title: 'A numbered microphone at a meeting',
      text: 'Only the person holding the microphone may speak. The chair lends it out for ten minutes at a time, and the speaker must keep nodding to the chair to keep it. If the speaker dozes off, the chair hands a new microphone with a <b>higher number</b> to the next person. The note-taker writes down only words spoken into the highest-numbered microphone so far, so a speaker who wakes up and keeps talking is simply ignored.'
    },
    problem: 'Your billing job runs every night at midnight. For safety it is installed on five servers, so at midnight all five start it and every customer is charged five times. You need exactly one of them to do the work. But the winner might crash halfway, or freeze for twenty seconds, and that must neither block the job forever nor let a frozen winner wake up and overwrite someone else\'s work. The question is <b>"how do many machines agree that exactly one of them is in charge right now, even when machines crash, pause or lose the network?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'One lock key with an expiry time',
        text: 'Each worker tries to create the key <code>lock:billing</code> in one shared store, with a 10-second expiry. The create succeeds only if the key does not exist yet. The worker that succeeds does the job; the others see the key and back off. If the winner crashes, the key expires and someone else can try.',
        scene: {
          nodes: [
            { id: 'a', label: 'Worker A', sub: 'got the lock', kind: 'client', at: [70, 0] },
            { id: 'lk', label: 'Lock key', sub: 'one store · 10 s', kind: 'cache', at: [210, 110] },
            { id: 'b', label: 'Worker B', sub: 'must wait', kind: 'client', at: [70, 220] },
            { id: 'res', label: 'Storage', sub: 'billing data', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'a', to: 'lk' }, { from: 'b', to: 'lk' }, { from: 'a', to: 'res' }, { from: 'b', to: 'res' }],
          flow: [['a>lk', 'b>lk'], 'a>res']
        }
      },
      {
        stage: 'breaks',
        title: 'A frozen holder wakes up and writes anyway',
        text: 'Worker A freezes for 15 seconds, for example in a <b>garbage-collection pause</b> where the runtime stops the program to clean up memory. Its key expires and worker B takes the lock. Then A wakes up, still believing it holds the lock, and writes too: <b>two writers</b>. Separately, if the single lock store crashes or fails over, the lock can vanish and two workers both win.',
        scene: {
          nodes: [
            { id: 'a', label: 'Worker A', sub: 'paused 15 s', kind: 'client', at: [70, 0] },
            { id: 'lk', label: 'Lock key', sub: 'expired → B', kind: 'cache', at: [210, 110] },
            { id: 'b', label: 'Worker B', sub: 'now holds it', kind: 'client', at: [70, 220] },
            { id: 'res', label: 'Storage', sub: 'A and B write', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'a', to: 'lk' }, { from: 'b', to: 'lk' }, { from: 'a', to: 'res' }, { from: 'b', to: 'res' }],
          flow: ['b>lk', ['a>res', 'b>res']],
          warn: ['a', 'lk'],
          err: ['res'],
          badges: { a: ['frozen', 'warn'], res: ['two writers', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'A voting cluster, renewed leases and a fencing token',
        text: 'Locks live in a small <b>consensus cluster</b>: three or five servers that only grant a lock once a majority agrees, so one crash loses nothing. The holder keeps its <b>lease</b> alive by renewing it. Every grant comes with a number that always goes up, the <b>fencing token</b>. Storage remembers the highest token it has seen and rejects older ones, so frozen A is turned away.',
        scene: {
          nodes: [
            { id: 'a', label: 'Worker A', sub: 'old token 33', kind: 'client', at: [70, 0] },
            { id: 'lk', label: 'Lock cluster', sub: '3 servers · vote', kind: 'service', at: [210, 110] },
            { id: 'b', label: 'Worker B', sub: 'token 34', kind: 'client', at: [70, 220] },
            { id: 'res', label: 'Storage', sub: 'max token 34', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'a', to: 'lk' }, { from: 'b', to: 'lk' }, { from: 'a', to: 'res' }, { from: 'b', to: 'res' }],
          flow: ['b>lk', 'b>res', 'a>res'],
          ok: ['lk', 'res', 'b'],
          badges: { res: ['rejects 33', 'ok'] }
        }
      }
    ],
    usedBy: ['Google Chubby (used by Bigtable and GFS)', 'Apache ZooKeeper', 'etcd', 'Kubernetes leader election', 'HashiCorp Consul'],
    whenToUse: [
      'A scheduled job runs on many servers but must do its work <b>only once</b>',
      'Replicas must elect <b>one leader</b>, such as one active scheduler or one primary',
      'Several workers may update the same file or object and must take turns'
    ],
    whenNot: [
      'All the data lives in one database: use its own transactions, row locks or advisory locks',
      'Handing out lots of small tasks: use a <a href="message-queue.html">Distributed Message Queue</a> or a <a href="job-scheduler.html">Job Queue &amp; Task Scheduler</a> with per-task leases',
      'You can design the lock away, for example with a version check on every update or a single writer per partition'
    ],
    glossary: [
      { term: 'Lease', def: 'A lock that is granted only for a limited time and expires unless the holder renews it.' },
      { term: 'KeepAlive', def: 'The small message a client sends regularly to renew its lease and prove it is still alive.' },
      { term: 'Fencing token', def: 'A number that grows with every lock grant and is sent with each write, so the storage can reject writes from an older holder.' },
      { term: 'Consensus (Raft / Zab / Paxos)', def: 'Algorithms that let a group of servers agree on one order of changes, as long as a majority of them is up.' },
      { term: 'Majority (quorum)', def: 'More than half of the servers; with 3 servers any 2 can decide, so the cluster survives 1 failure.' },
      { term: 'Split brain', def: 'Two parts of a system that cannot talk to each other both believe they are in charge.' },
      { term: 'Ephemeral sequential node', def: 'A ZooKeeper entry that gets the next number in a queue and disappears when its owner\'s session ends.' },
      { term: 'Herd effect', def: 'When a lock is released and every waiter wakes up and retries at once, though only one can win.' }
    ]
  },

  requirements: {
    functional: [
      'Acquire / release a named lock (blocking and try-lock)',
      'Lock expires automatically if the holder dies',
      'Monotonic <b>fencing token</b> with every grant',
      'Fair queueing of waiters, without a thundering herd',
      'Leader election as a special case of locking',
      'Read/write (shared/exclusive) locks'
    ],
    nonFunctional: [
      'Safety: never two holders whose writes both take effect',
      'Survives the loss of a minority of lock servers',
      'Acquire in a few ms; low write volume (coarse-grained)',
      'Bounded wait after a holder crashes (≈ lease TTL)',
      'No reliance on synchronized clocks for safety',
      'Linearizable lock state'
    ],
    outOfScope: ['Fine-grained row locks (use the database)', 'Distributed transactions across services (see sagas)', 'High-volume work queues (use a queue with leases)']
  },

  calculator: {
    inputs: [
      { id: 'acq', label: 'Lock acquisitions / second', min: 1, max: 100000, value: 500, log: true },
      { id: 'hold', label: 'Average hold time', min: 10, max: 600000, value: 2000, log: true, unit: 'ms' },
      { id: 'ttl', label: 'Lease TTL', min: 1, max: 60, value: 10, unit: 's' },
      { id: 'sess', label: 'Client sessions keeping leases alive', min: 10, max: 100000, value: 2000, log: true },
      { id: 'fsync', label: 'Quorum write latency (RTT + fsync)', min: 0.5, max: 30, step: 0.5, value: 3, unit: 'ms' },
      { id: 'n', label: 'Lock servers in the cluster', min: 3, max: 7, step: 2, value: 3 }
    ],
    outputs: [
      { label: 'Locks held at any moment (Little\'s law)', f: (v) => v.acq * v.hold / 1000 },
      { label: 'Quorum writes/s (acquire + release)', f: (v) => v.acq * 2 },
      { label: 'KeepAlive RPCs/s (each session every TTL/3)', f: (v) => v.sess / (v.ttl / 3) },
      { label: 'Uncontended acquire latency', fmt: 'ms', f: (v) => v.fsync + 0.5 },
      { label: 'Server failures tolerated', fmt: 'raw', f: (v) => String((v.n - 1) / 2) },
      { label: 'Worst wait after a holder crashes', fmt: 'ms', f: (v) => v.ttl * 1000 }
    ],
    note: 'Latencies are <em>estimates</em> for one datacenter. Every acquire and release is a replicated, fsynced write, which is why lock services are built for <b>coarse-grained</b> locks (Chubby\'s own framing): thousands of writes per second, not millions.'
  },

  api: [
    { m: 'RPC', p: 'LeaseGrant(ttl) → leaseId · LeaseKeepAlive(leaseId)', d: 'etcd: a lease is a TTL the client keeps refreshing. Keys attached to it vanish when it expires.' },
    { m: 'RPC', p: 'Lock(name, leaseId) → key, revision', d: 'etcd concurrency API: blocks until the caller\'s key is the oldest under the prefix. The key\'s <b>revision</b> is cluster-wide monotonic: use it as the fencing token.' },
    { m: 'RPC', p: 'create("/locks/job-", EPHEMERAL_SEQUENTIAL)', d: 'ZooKeeper: returns e.g. <code>/locks/job-0000000042</code>. Lowest sequence holds the lock. The node disappears with the client\'s session.' },
    { m: 'SQL', p: 'SELECT pg_try_advisory_lock(hashtextextended(\'job\', 0))', d: 'Postgres advisory lock: enough when every participant already talks to the same primary.' },
    { m: 'PUT', p: '/storage/objects/{id}  (Fencing-Token: 34)', d: 'The protected resource stores the highest token it has seen and rejects any write with a lower one.' }
  ],
  dataModel: [
    { name: 'Lock key (etcd)', store: 'Raft-replicated KV', fields: [['key', '/locks/job-42/<lease>', 'pk'], ['create_revision', 'int64 (token)', 'idx'], ['lease', 'leaseId', 'fk'], ['value', 'owner id']], note: 'Waiters watch the key with the next-lower revision.' },
    { name: 'Lock znode (ZooKeeper)', store: 'Zab-replicated tree', fields: [['path', '/locks/job-0000000042', 'pk'], ['ephemeralOwner', 'session id', 'fk'], ['czxid', 'int64 (creation txn id)']], note: 'Ephemeral: removed when the session expires. Sequence number orders the queue.' },
    { name: 'Protected resource', store: 'Postgres / object store', fields: [['id', 'bigint', 'pk'], ['data', '…'], ['fence_token', 'bigint']], note: '<code>UPDATE … WHERE fence_token &lt;= :token</code>: a stale holder updates 0 rows.' }
  ],

  architecture: {
    title: 'Lock service with fencing',
    nodes: [
      { id: 'trig', label: 'Job trigger', sub: 'cron fires on every node', kind: 'external', wide: [330, 40], tall: [105, 0], tip: 'The classic reason for a lock: the same scheduled job starts on every replica, and only one should do the work.' },
      { id: 'res', label: 'Storage', sub: 'checks fencing token', kind: 'store', wide: [790, 40], tall: [315, 0], tip: 'The thing being protected. It remembers the highest token it has accepted and rejects writes carrying an older one.' },
      { id: 'c1', label: 'Client A', sub: 'holds lock · token 33', kind: 'client', wide: [330, 160], tall: [70, 105], tip: 'Holds the lease and sends KeepAlives every ~TTL/3. If it pauses longer than the TTL, the lease expires without it knowing.' },
      { id: 'c2', label: 'Client B', sub: 'waiting', kind: 'client', wide: [560, 160], tall: [210, 105], tip: 'Waits by watching the key just ahead of its own (ZooKeeper recipe / etcd mutex).' },
      { id: 'c3', label: 'Client C', sub: 'waiting', kind: 'client', wide: [790, 160], tall: [350, 105], tip: 'Another waiter. Each waiter watches only its predecessor, so a release wakes exactly one client.' },
      { id: 'f1', label: 'Follower 1', sub: 'replica', kind: 'service', wide: [330, 290], tall: [70, 210], tip: 'Clients may connect to any member; writes are forwarded to the leader. Followers vote in elections.' },
      { id: 'l1', label: 'Lock leader', sub: 'Raft / Zab leader', kind: 'service', wide: [560, 290], tall: [210, 210], tip: 'Orders every lock operation in a replicated log. A grant is committed only after a majority has it on disk.' },
      { id: 'f2', label: 'Follower 2', sub: 'replica', kind: 'service', wide: [790, 290], tall: [350, 210], tip: 'With 3 servers, any 2 form a majority: the cluster survives one failure.' }
    ],
    edges: [
      { from: 'trig', to: 'c1', dashed: true },
      { from: 'trig', to: 'c2', dashed: true },
      { from: 'trig', to: 'c3', dashed: true },
      { from: 'c1', to: 'f1', bidi: true },
      { from: 'c2', to: 'l1', bidi: true },
      { from: 'c3', to: 'f2', bidi: true },
      { from: 'f1', to: 'l1', bidi: true },
      { from: 'l1', to: 'f2', bidi: true },
      { from: 'c1', to: 'res' },
      { from: 'c2', to: 'res' },
      { from: 'c3', to: 'res' }
    ]
  },

  scenarios: [
    {
      id: 'happy', title: 'Acquire → work → release', tone: 'ok',
      steps: [
        { text: 'The nightly job fires on every node. Client A opens a session with a <b>10 s lease</b> and asks for <code>/locks/billing</code>.', flow: ['trig>c1', 'c1>f1', 'f1>l1'], badges: { c1: 'lease 10 s' } },
        { text: 'The leader appends the lock key to its log and replicates it. Once a <b>majority</b> has it on disk, it is committed.', flow: [['l1>f1', 'l1>f2']], badges: { l1: 'commit rev 33' } },
        { text: 'A gets the lock plus <b>token 33</b> (the key\'s revision). B and C queue behind it and each watch their predecessor.', flow: ['l1>f1', 'f1>c1'], ok: ['c1'], badges: { c1: ['token 33', 'ok'], c2: 'waits', c3: 'waits' }, tone: 'ok' },
        { text: 'A writes to storage and sends its token. Storage records 33 as the highest token seen.', flow: ['c1>res'], badges: { res: ['max token 33', 'ok'] } },
        { text: 'A deletes its key. Only B (the next in line) is notified, gets <b>token 34</b> and proceeds.', flow: ['c1>f1', 'f1>l1', 'l1>c2'], ok: ['c2'], badges: { c2: ['token 34', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'gc-pause', title: 'GC pause: fencing saves the data', tone: 'err',
      steps: [
        { text: 'A holds the lock with token 33 and reads the object it will update.', flow: ['c1>res'], badges: { c1: 'token 33' } },
        { text: 'A hits a <b>15 s stop-the-world GC pause</b>. It sends no KeepAlives, and it cannot notice, because it is not running.', nodes: ['c1'], warn: ['c1'], badges: { c1: ['GC pause 15 s', 'warn'] }, tone: 'warn' },
        { text: 'After 10 s the lease <b>expires</b>. The service deletes A\'s key and grants the lock to B with <b>token 34</b>.', flow: ['l1>c2'], ok: ['c2'], badges: { l1: 'lease expired', c2: ['token 34', 'ok'] } },
        { text: 'B writes its update. Storage now has max token 34.', flow: ['c2>res'], badges: { res: ['max token 34', 'ok'] }, tone: 'ok' },
        { text: 'A wakes up still believing it holds the lock and writes with <b>token 33</b>. Storage sees 33 &lt; 34 and <b>rejects</b> it. Without fencing, A would silently overwrite B\'s work.', flow: ['c1>res'], err: ['c1'], badges: { res: ['reject 33 < 34', 'err'] }, tone: 'err' }
      ]
    },
    {
      id: 'failover', title: 'Lock-service leader fails', tone: 'warn',
      steps: [
        { text: 'The leader crashes. Locks are not lost: every committed grant is on a majority of disks.', nodes: ['l1'], err: ['l1'], badges: { l1: ['down', 'err'] }, tone: 'err' },
        { text: 'Followers stop hearing heartbeats and start an <b>election</b>. Follower 1 wins with votes from itself and follower 2.', flow: ['f1>f2'], warn: ['f1'], labels: { f1: { label: 'New leader', sub: 'term 8' } }, badges: { f1: ['elected', 'warn'] }, tone: 'warn' },
        { text: 'Clients reconnect to a live member. KeepAlives could not be processed during the election, so the new leader must not expire leases for that gap. etcd refreshes existing leases when a new leader takes over.', flow: ['c1>f1', 'c3>f2'], labels: { f1: { label: 'New leader', sub: 'term 8' } }, badges: { c1: 'session kept' } },
        { text: 'Service resumes. A 3-node cluster survives 1 failure; a 5-node cluster survives 2. Even sizes add cost without adding tolerance.', nodes: ['f1', 'f2'], ok: ['f1', 'f2'], labels: { f1: { label: 'New leader', sub: 'term 8' } }, tone: 'ok' }
      ]
    },
    {
      id: 'partition', title: 'Network partition: no split brain', tone: 'err',
      steps: [
        { text: 'A network split isolates the <b>old leader</b> and client B (connected to it) from the two followers.', nodes: ['l1', 'c2', 'f1', 'f2'], err: ['l1'], badges: { l1: ['minority side', 'err'] }, tone: 'err' },
        { text: 'The old leader cannot reach a majority, so it <b>cannot commit</b> anything: no new grants, no renewals. B\'s KeepAlives fail.', flow: ['c2>l1'], warn: ['c2'], badges: { c2: ['renew fails', 'warn'] }, tone: 'warn' },
        { text: 'The majority side (followers 1 and 2) elects a new leader and serves normally. Only one side can ever form a quorum: no split brain inside the lock service.', flow: ['f1>f2'], ok: ['f1', 'f2'], labels: { f1: { label: 'New leader', sub: 'majority side' } }, tone: 'ok' },
        { text: 'B, stuck on the minority side, must stop work when its local lease timer runs out (minus a margin for clock drift). Anything it still sends to storage is caught by the <b>fencing token</b>.', flow: ['c2>res'], labels: { f1: { label: 'New leader', sub: 'majority side' } }, badges: { res: ['fenced', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'herd', title: 'Hot lock: 1,000 waiters', tone: 'warn',
      steps: [
        { text: 'A thousand workers want the same lock. Naively, each one <b>watches the lock node</b> itself.', flow: [['c2>l1', 'c3>f2', 'c1>f1']], warn: ['l1'], badges: { l1: ['1,000 watches', 'warn'] }, tone: 'warn' },
        { text: 'On release, the server notifies <b>all 1,000</b>. They all re-read and retry; 999 fail. That is the <b>herd effect</b>: a load spike on every release.', flow: [['l1>c2', 'f2>c3', 'f1>c1']], err: ['l1'], badges: { l1: ['herd', 'err'] }, tone: 'err' },
        { text: 'ZooKeeper recipe: each client creates an <b>ephemeral sequential</b> node and watches only the node <b>just before its own</b>.', nodes: ['c1', 'c2', 'c3'], badges: { c2: 'watches n-41', c3: 'watches n-42' } },
        { text: 'A release now wakes exactly <b>one</b> client, in FIFO order. If a waiter dies, its ephemeral node vanishes and only its successor re-checks.', flow: ['l1>c2'], ok: ['c2', 'l1'], badges: { c2: ['next!', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick the backend, the lease length and the worst pause your clients can hit. Then switch fencing on and off.',
    diagram: null, // filled below: adds a Redis node in the leader's spot
    controls: [
      { id: 'be', label: 'Lock backend', type: 'seg', value: 'etcd', options: [
        { v: 'redis', l: 'Single Redis' }, { v: 'redlock', l: 'Redlock (5 Redis)' }, { v: 'etcd', l: 'etcd (Raft)' }, { v: 'zk', l: 'ZooKeeper (Zab)' }] },
      { id: 'fence', label: 'Fencing tokens at the resource', type: 'seg', value: 'on', options: [
        { v: 'on', l: 'On' }, { v: 'off', l: 'Off' }] },
      { id: 'ttl', label: 'Lease TTL', type: 'range', min: 1, max: 60, step: 1, value: 10, unit: 's' },
      { id: 'pause', label: 'Worst client pause (GC, VM, network)', type: 'range', min: 0, max: 30, step: 1, value: 15, unit: 's' }
    ],
    evaluate(s) {
      const redis = s.be === 'redis' || s.be === 'redlock';
      const expiresInPause = s.pause >= s.ttl;
      const tokenOk = s.fence === 'on' && !redis;
      let safe, safeS;
      if (tokenOk) { safe = 'stale writes rejected by token'; safeS = 0.95; }
      else if (s.fence === 'on' && redis) { safe = 'token not monotonic across failover'; safeS = 0.45; }
      else if (expiresInPause) { safe = 'two holders can both write'; safeS = 0.08; }
      else { safe = 'OK until a pause ≥ TTL'; safeS = 0.45; }
      const lat = { redis: ['~1 RTT (< 1 ms)', 0.95], redlock: ['majority of 5 RTTs (~1–2 ms)', 0.85], etcd: ['Raft commit + fsync (few ms)', 0.65], zk: ['Zab commit + fsync (few ms)', 0.65] }[s.be];
      const surv = { redis: ['async replica may lose the lock', 0.2], redlock: ['2 of 5 down, but timing-dependent', 0.55], etcd: ['1 of 3 (or 2 of 5) down', 0.9], zk: ['1 of 3 (or 2 of 5) down', 0.9] }[s.be];
      const wait = s.ttl + ' s after a holder crash';
      const ops = { redis: ['one process', 0.95], redlock: ['5 independent masters', 0.55], etcd: ['3–5 node Raft cluster', 0.65], zk: ['3–5 node JVM ensemble', 0.5] }[s.be];
      const metrics = [
        { k: 'Safety', v: safe, s: safeS },
        { k: 'Lease vs pause', v: expiresInPause ? 'lease expires during the pause' : 'pause fits inside the lease', s: expiresInPause ? 0.2 : 0.85 },
        { k: 'Acquire latency', v: lat[0], s: lat[1] },
        { k: 'Lock-server failure', v: surv[0], s: surv[1] },
        { k: 'Wait if holder dies', v: wait, s: Math.max(0.1, 1 - s.ttl / 60) },
        { k: 'Ops cost', v: ops[0], s: ops[1] }
      ];
      const notes = [];
      if (expiresInPause) notes.push('A ' + s.pause + ' s pause outlives the ' + s.ttl + ' s lease. Raising the TTL only moves the threshold: pauses, packet delays and clock jumps have no hard upper bound.');
      if (!expiresInPause && s.ttl >= 30) notes.push('A long TTL makes false expiry rarer, but after a real crash everyone waits ' + s.ttl + ' s.');
      if (s.be === 'redlock') notes.push('Redlock takes the lock on a majority of 5 independent Redis masters within a validity time. Kleppmann (2016) argued it depends on bounded pauses and clock drift and offers no fencing token; antirez replied that the timing checks are adequate. Both agree: if correctness matters, fence.');
      if (s.be === 'redis') notes.push('<code>SET lock owner NX PX ttl</code> and a compare-and-delete script are fine for <b>efficiency</b> locks. Replication is asynchronous, so a failover can hand the same lock to a second client.');
      if (s.be === 'etcd') notes.push('Use the lock key\'s <b>revision</b> as the token: revisions only grow, cluster-wide. Jepsen (2020) found etcd locks unsafe <i>without</i> such fencing.');
      if (s.be === 'zk') notes.push('The znode\'s sequence number or creation zxid works as a token. Watch the predecessor, not the lock node, to avoid the herd effect.');
      if (s.fence === 'off') notes.push('Without fencing, the resource cannot tell a current holder from a paused, expired one.');
      let verdict;
      if (!tokenOk && expiresInPause && s.fence === 'off') verdict = '❌ <b>Data corruption possible:</b> the paused client wakes after its lease expired and overwrites the new holder\'s work.';
      else if (tokenOk) verdict = '✅ <b>Correct:</b> consensus-backed lock plus fencing. Leases give liveness, tokens give safety.';
      else if (redis && s.fence === 'on') verdict = '⚠ <b>Fencing needs a token that never goes backwards.</b> Redis counters can roll back on failover; use etcd/ZooKeeper for correctness locks.';
      else verdict = '⚠ <b>Fine for efficiency</b> (avoiding duplicate work), <b>not for correctness</b>. Add fencing before protecting data.';
      return {
        metrics, verdict, notes,
        flow: redis ? ['c1>redis', 'c1>res'] : ['c1>f1', 'f1>l1', ['l1>f1', 'l1>f2'], 'c1>res'],
        hide: redis ? ['l1', 'f1', 'f2'] : ['redis'],
        labels: Object.assign(
          { redis: s.be === 'redis' ? { label: 'Redis primary', sub: 'SET NX PX · async replica' } : { label: 'Redis ×5 (Redlock)', sub: 'majority of 5 masters' } },
          s.be === 'etcd' ? { l1: { label: 'etcd leader', sub: 'Raft · revisions' } } : s.be === 'zk' ? { l1: { label: 'ZooKeeper leader', sub: 'Zab · seq. znodes' } } : {},
          { res: { label: 'Storage', sub: s.fence === 'on' ? 'checks fencing token' : 'accepts any write' } }),
        hot: redis ? ['redis'] : ['l1'],
        warn: expiresInPause ? ['c1'] : [],
        err: !tokenOk && expiresInPause && s.fence === 'off' ? ['res'] : [],
        badges: { c1: [expiresInPause ? 'pause ' + s.pause + ' s > TTL' : 'pause ' + s.pause + ' s', expiresInPause ? 'warn' : 'ok'], res: [tokenOk ? 'rejects stale' : s.fence === 'off' ? 'no check' : 'weak token', tokenOk ? 'ok' : 'err'] }
      };
    }
  },

  widget: {
    title: 'Lease expiry and fencing on a timeline',
    caption: 'Client A takes the lock, then hits a <b>GC pause</b>. If the pause outlasts the <b>lease</b>, the lock passes to B while A is frozen. Press <b>▶ Run</b>, then try different pauses and switch <b>fencing</b> off to see the overwrite.'
  },

  realWorld: {
    intro: 'Lock services come from Google\'s Chubby; the open-source world built ZooKeeper and etcd. The 2016 Redlock debate made fencing tokens mainstream.',
    timeline: [
      { when: '2006', who: 'Google', title: 'Chubby lock service (OSDI \'06)', text: 'Coarse-grained advisory locks plus small files, served by a cell of usually <b>five replicas</b> (three must be up) using Paxos. Sessions are kept alive by <b>KeepAlive</b> RPCs over a lease (12 s by default). A holder can get a <b>sequencer</b> (lock name, mode, generation number) for servers to check; <b>lock-delay</b> protects servers that cannot.', src: 0 },
      { when: '2010', who: 'Yahoo!', title: 'ZooKeeper (USENIX ATC \'10)', text: 'Instead of lock calls, a <b>wait-free</b> API of znodes, watches, ephemeral and sequential nodes. Writes are linearizable and each client\'s requests run in FIFO order. Locks, barriers and leader election are recipes built on top.', src: 1 },
      { when: 'Docs', who: 'Apache ZooKeeper', title: 'Lock recipe without herd effect', text: 'Create <code>_locknode_/guid-lock-</code> with SEQUENCE|EPHEMERAL, list children <b>without</b> a watch, and watch only the next-lower node. Each release wakes one client.', src: 2 },
      { when: '2016', who: 'Martin Kleppmann', title: 'How to do distributed locking', text: 'Separates <b>efficiency</b> locks from <b>correctness</b> locks, shows how a process pause breaks a lease, proposes <b>fencing tokens</b>, and argues Redlock is unsafe because it relies on timing assumptions and provides no token.', src: 3 },
      { when: '2016', who: 'Salvatore Sanfilippo', title: 'Is Redlock safe? (reply)', text: 'Redis\'s author disputes the analysis, arguing that the timing checks bound the risk and that the pause problem affects any lock with auto-release.', src: 4 },
      { when: '2020', who: 'Jepsen', title: 'etcd 3.4.3 analysis', text: 'etcd\'s key-value operations were <b>strict serializable</b> under faults, but its locks were "fundamentally unsafe" without fencing: lease-based mutual exclusion cannot be guaranteed in an asynchronous network. Recommendation: use the lock key\'s <b>revision</b> as a fencing token.', src: 5 }
    ],
    lessons: [
      '<span>Leases give <b>liveness</b> (a dead holder is replaced). Only fencing gives <b>safety</b>.</span>',
      '<span>Classify each lock: <b>efficiency</b> (duplicate work is OK) or <b>correctness</b> (must fence).</span>',
      '<span>Use a consensus store (etcd, ZooKeeper) or your database for correctness locks.</span>',
      '<span>Prefer designs that need no lock: single-writer partitions, idempotent writes, optimistic version checks.</span>'
    ],
    sources: [
      { title: 'The Chubby lock service for loosely-coupled distributed systems', url: 'https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/', pub: 'Burrows, OSDI 2006' },
      { title: 'ZooKeeper: Wait-free coordination for Internet-scale systems', url: 'https://www.usenix.org/conference/usenix-atc-10/zookeeper-wait-free-coordination-internet-scale-systems', pub: 'Hunt, Konar, Junqueira, Reed · USENIX ATC 2010' },
      { title: 'ZooKeeper Recipes and Solutions', url: 'https://zookeeper.apache.org/doc/r3.8.2/recipes.html', pub: 'Apache ZooKeeper docs' },
      { title: 'How to do distributed locking', url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html', pub: 'Martin Kleppmann, 2016' },
      { title: 'Is Redlock safe?', url: 'https://antirez.com/news/101', pub: 'antirez, 2016' },
      { title: 'Jepsen: etcd 3.4.3', url: 'https://jepsen.io/analyses/etcd-3.4.3', pub: 'Jepsen, 2020' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Backend', '<b>Redis</b> (single / Redlock): fast, familiar', '<b>etcd / ZooKeeper</b>: consensus, monotonic tokens', 'Redis for efficiency locks; etcd/ZK (or the DB) for correctness'],
      ['Lease TTL', '<b>Short</b>: fast takeover after a crash', '<b>Long</b>: fewer false expiries', 'A few × your p99.9 pause, plus fencing so a false expiry is harmless'],
      ['Safety mechanism', '<b>Lease only</b>: simple', '<b>Lease + fencing token</b>: safe', 'Always fence when two writers would corrupt data'],
      ['Where to lock', '<b>Separate lock service</b>', '<b>The database you already write</b> (advisory locks, <code>FOR UPDATE</code>)', 'Use the DB when the protected data lives there; the lock and data then share one source of truth'],
      ['Waiting', '<b>Poll / retry with backoff</b>', '<b>Watch predecessor</b> (FIFO)', 'Watches for hot locks; polling for rare, low-contention locks'],
      ['Need a lock at all?', '<b>Lock</b> then write', '<b>Optimistic</b> version check / single-writer partition', 'Prefer optimistic or partitioned designs when conflicts are rare']
    ]
  },
  failures: [
    { f: 'Holder pauses past its lease (GC, VM freeze)', detect: 'Rejected stale tokens at the resource; pause metrics', fix: 'Fencing token checked by the resource; tune GC; keep TTL ≫ typical pauses.' },
    { f: 'Holder crashes while holding the lock', detect: 'Missed KeepAlives', fix: 'Lease expires (ephemeral node / etcd lease); next waiter proceeds after ≈ TTL.' },
    { f: 'Lock-service leader fails', detect: 'Election timeout', fix: 'Majority elects a new leader; committed locks survive; leases extended over the gap.' },
    { f: 'Network partition', detect: 'Client cannot renew', fix: 'Minority side cannot commit; client stops at local lease end (minus drift margin); fencing catches stragglers.' },
    { f: 'Redis failover loses a lock', detect: 'Two holders observed', fix: 'Do not use async-replicated Redis for correctness locks; move to etcd/ZK or fence with a DB-backed token.' },
    { f: 'Herd on release', detect: 'CPU / watch-notification spikes on each release', fix: 'Watch the predecessor (sequential nodes), or use a fair queue.' },
    { f: 'Clock jump on the lock server', detect: 'Leases expiring early', fix: 'Measure lease time with monotonic clocks; avoid designs where safety depends on wall-clock time.' }
  ],

  interview: [
    { q: 'Why is a lease alone not enough for safety?', a: '<p>A lease tells the client it held the lock <b>at some point</b>. Between checking the lease and writing, the process can stall: GC pause, VM migration, page fault, slow network. The lease expires, another client takes the lock, and the first one wakes and writes anyway.</p><p>The client cannot detect this itself, because it was not running. The resource must reject it: <b>fencing</b>.</p>', lvl: 'core' },
    { q: 'What is a fencing token?', a: '<p>A number that <b>increases with every lock grant</b> and travels with every write. The resource remembers the highest token it has accepted and rejects writes with lower tokens.</p><p>Examples: etcd lock key revision, ZooKeeper zxid or sequence number, a Postgres sequence used inside the same database.</p>', fu: 'What if the resource cannot check tokens? (Use a conditional write on a version column, or keep the lock in the same DB as the data.)', lvl: 'core' },
    { q: 'Is Redlock safe?', a: '<p>For <b>efficiency</b> locks, it is fine. For <b>correctness</b>, Kleppmann (2016) showed it depends on bounded process pauses, network delays and clock drift, and it provides no fencing token. Antirez replied that its timing checks limit the risk.</p><p>Either way: if two holders would corrupt data, use a consensus store and fence.</p>', lvl: 'deep' },
    { q: 'How do you avoid the herd effect in ZooKeeper locks?', a: '<p>Each client creates an <b>ephemeral sequential</b> node under the lock path. The lowest sequence holds the lock. Every other client watches only the node <b>immediately before its own</b>.</p><p>A release (or a crash, which removes the ephemeral node) wakes exactly one waiter, in FIFO order.</p>', lvl: 'core' },
    { q: 'Efficiency lock vs correctness lock?', a: '<p><b>Efficiency</b>: the lock avoids duplicate work (sending a report twice). An occasional double run is annoying but harmless; a single Redis lock is fine.</p><p><b>Correctness</b>: two holders would corrupt data or double-spend. You need consensus-backed locks <i>and</i> fencing, or a design without locks.</p>', lvl: 'core' },
    { q: 'How does clock drift affect distributed locks?', a: '<p>Lease expiry is measured with clocks. If the client\'s clock runs slow, it believes its lease is valid after the server expired it. Clock jumps (NTP step) can expire leases early or late.</p><p>Use <b>monotonic clocks</b> for durations, stop work a safety margin before the local lease end, and never let safety depend on time: fence.</p>', lvl: 'deep' },
    { q: 'Why does a lock service need consensus, and why an odd number of nodes?', a: '<p>Lock state must be <b>linearizable</b> and survive crashes, so every grant is committed by a majority (Raft, Zab, Paxos). Two majorities always overlap, so two leaders cannot both grant the same lock.</p><p>3 nodes tolerate 1 failure, 5 tolerate 2. A 4th node does not raise tolerance over 3, it only adds cost.</p>', lvl: 'core' },
    { q: 'What happens to a lock when its holder crashes?', a: '<p>Its session stops sending KeepAlives. When the lease expires, the server deletes the lock key (etcd) or ephemeral node (ZooKeeper), and the next waiter is notified. Waiters therefore wait at most about one TTL.</p>', lvl: 'core' },
    { q: 'How do you get a fencing token from etcd?', a: '<p>The etcd mutex creates a key under the lock prefix bound to your lease. That key\'s <b>create revision</b> is assigned by the cluster\'s single, ever-increasing revision counter, so a later holder always has a higher revision. Pass it with each write.</p><p>Jepsen\'s 2020 etcd analysis recommends exactly this.</p>', lvl: 'deep' },
    { q: 'When are Postgres advisory locks enough?', a: '<p>When the protected data lives in the <b>same Postgres</b>. <code>pg_advisory_xact_lock</code> is released at commit or rollback, and a crashed session releases its locks when the connection drops.</p><p>Caveats: they live on the primary only, and with transaction-pooling proxies (PgBouncer) session-level locks need care.</p>', lvl: 'core' },
    { q: 'What happens to held locks when the lock service fails over?', a: '<p>Committed lock keys are on a majority, so the new leader has them. The danger is <b>leases</b>: clients could not renew during the election. The new leader must not expire them for that gap; etcd refreshes all leases when a new leader is elected, and Chubby\'s failover protocol keeps sessions alive across a master change.</p>', lvl: 'deep' },
    { q: 'Can you avoid the distributed lock entirely?', a: '<ul><li><b>Optimistic concurrency</b>: <code>UPDATE … WHERE version = :v</code>; retry on 0 rows.</li><li><b>Single writer per partition</b>: route all work for a key to one consumer (Kafka partition).</li><li><b>Idempotent operations</b>: make double execution harmless.</li></ul><p>Often simpler and faster than any lock service.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Postgres: advisory locks + a fencing column', lang: 'sql',
      code: `-- Efficiency lock: only one node runs the nightly job.
-- Transaction-scoped: released automatically at COMMIT / ROLLBACK.
BEGIN;
SELECT pg_try_advisory_xact_lock(hashtextextended('nightly-billing', 0)) AS got_it;
-- got_it = false  =>  another node is running it: ROLLBACK and exit
-- ... do the work ...
COMMIT;

-- Correctness: the resource itself rejects stale holders.
CREATE TABLE documents (
  id          bigint PRIMARY KEY,
  body        text   NOT NULL,
  fence_token bigint NOT NULL DEFAULT 0
);

UPDATE documents
   SET body = :body,
       fence_token = :token
 WHERE id = :id
   AND fence_token <= :token;   -- 0 rows => a newer lock holder already wrote`,
      note: '<code>hashtextextended</code> (Postgres 11+) maps a name to the <code>bigint</code> key advisory locks need.'
    },
    {
      title: 'Spring Integration: JdbcLockRegistry for a scheduled job', lang: 'java',
      code: `// implementation 'org.springframework.integration:spring-integration-jdbc'
// create INT_LOCK with the schema-postgresql.sql shipped in that jar
@Configuration
class LockConfig {
  @Bean
  DefaultLockRepository lockRepository(DataSource ds) {
    var repo = new DefaultLockRepository(ds);
    repo.setTimeToLive(60_000);                 // ms before a lock counts as expired
    return repo;
  }

  @Bean
  JdbcLockRegistry lockRegistry(LockRepository repo) {
    return new JdbcLockRegistry(repo);
  }
}

@Component
class NightlyBilling {
  private final LockRegistry locks;
  private final BillingService billing;

  NightlyBilling(LockRegistry locks, BillingService billing) {
    this.locks = locks;
    this.billing = billing;
  }

  @Scheduled(cron = "0 0 2 * * *")
  void run() throws InterruptedException {
    Lock lock = locks.obtain("nightly-billing");
    if (!lock.tryLock(2, TimeUnit.SECONDS)) return;   // another node has it
    try {
      billing.runBatch();      // keep it well under the TTL, or renew the lock
    } finally {
      lock.unlock();
    }
  }
}`,
      note: 'This is an <b>efficiency</b> lock. If <code>runBatch</code> writes data that must not be written twice, also fence those writes (version column or token).'
    },
    {
      title: 'Python: single-Redis lock done right (for efficiency)', lang: 'python',
      code: `import uuid
import redis

r = redis.Redis()

# Delete only if we still own it: GET + DEL must be atomic.
RELEASE = r.register_script("""
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
""")

def acquire(name: str, ttl_ms: int = 10_000) -> str | None:
    owner = str(uuid.uuid4())
    # SET NX PX in one command: no gap between "create" and "expire"
    if r.set(f"lock:{name}", owner, nx=True, px=ttl_ms):
        return owner
    return None

def release(name: str, owner: str) -> bool:
    return RELEASE(keys=[f"lock:{name}"], args=[owner]) == 1

owner = acquire("nightly-report")
if owner:
    try:
        send_report()            # must finish well within ttl_ms
    finally:
        release("nightly-report", owner)`,
      note: 'Replication is asynchronous, so a Redis failover can grant the lock twice. Fine for avoiding duplicate work; for correctness use etcd/ZooKeeper or the database plus fencing.'
    }
  ],

  related: ['kv-store', 'job-scheduler', 'distributed-sql', 'ticket-booking', 'message-queue', 'unique-id']
});

/* knobs diagram = architecture + a Redis node placed where the quorum leader sits */
(function () {
  const d = SD.data;
  const a = d.architecture;
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes.concat([{ id: 'redis', label: 'Redis primary', sub: 'SET NX PX', kind: 'cache', wide: [560, 290], tall: [210, 210], tip: 'Alternative backend: a single Redis (async replicas) or Redlock across 5 independent masters.' }]),
    edges: a.edges.concat([{ from: 'c1', to: 'redis', bidi: true }, { from: 'c2', to: 'redis', bidi: true }, { from: 'c3', to: 'redis', bidi: true }])
  };
})();
