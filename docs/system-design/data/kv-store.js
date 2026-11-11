SD.register({
  slug: 'kv-store',
  domain: 9,
  title: 'Distributed Key-Value Store',
  examples: 'Dynamo, Cassandra',
  tagline: 'Spread keys over a <b>consistent-hash ring</b> and keep N copies of each. Every request chooses how many replicas must answer: <b>R + W > N</b> buys consistency, smaller numbers buy latency and availability.',
  tldr: {
    problem: 'One machine can neither hold all the keys nor survive its own failure. With many machines, nodes fail, networks partition and two clients write the same key at once. You must decide what a read returns while that is happening.',
    idea: 'A <b>consistent-hash ring with virtual nodes</b> maps each key to a <b>preference list</b> of N nodes. Any node can <b>coordinate</b>: it sends the request to all N and waits for <b>W</b> acks (write) or <b>R</b> replies (read). Gossip tracks membership. <b>Hinted handoff</b>, <b>read repair</b> and <b>Merkle-tree anti-entropy</b> fix divergence. Each node stores data in an <b>LSM tree</b>.',
    insight: 'If <b>R + W > N</b>, every read quorum overlaps every write quorum, so a read meets at least one replica with the latest acknowledged write (as long as quorums are strict). Dynamo chose availability instead: <b>sloppy quorums</b> plus <b>vector clocks</b>, and the application merges conflicting versions.',
    numbers: [
      { v: '3 · 2 · 2', l: 'common (N, R, W) for Amazon\'s Dynamo instances (SOSP 2007)' },
      { v: '89.2M/s', l: 'DynamoDB peak requests, Prime Day 2021 (USENIX ATC 2022)' },
      { v: 'R + W > N', l: 'the quorum-overlap condition' }
    ]
  },

  intro: {
    what: 'A distributed key-value store saves values under keys, like a giant dictionary: <code>put(key, value)</code> to save, <code>get(key)</code> to read it back. It spreads the keys over <b>many machines</b> and keeps <b>several copies</b> of each. So it can hold far more data than one server, and keep working when some servers die.',
    analogy: {
      icon: '🏢',
      title: 'Every file kept in three branch offices',
      text: 'Picture a company that files every document in three branch offices, chosen by a fixed rule on the document\'s name. To save a change you phone all three and wait until two confirm. To read, you ask two and keep the newer copy. If one office is closed for a day, the other two still answer, and the closed office catches up when it reopens.'
    },
    problem: 'An online shop keeps every shopper\'s cart under a key such as <code>cart:alice</code>. Millions of carts must be read and written in milliseconds, all day, even while servers crash or the network splits. One database server cannot hold them all, and if it dies, nobody can shop. The core question is <b>how to spread keys over many machines, keep the copies in sync, and decide what a read returns while some machines are down</b>.',
    story: [
      {
        stage: 'naive',
        title: 'One server holds every key',
        text: 'Run one database server and store each cart as a row under its key. Every app server reads and writes there. It is simple and always correct, because there is only one copy of each value.',
        scene: {
          nodes: [
            { id: 'a1', label: 'App server', sub: 'put cart:alice', kind: 'client', at: [70, 0] },
            { id: 'a2', label: 'App server', sub: 'get cart:bob', kind: 'client', at: [350, 0] },
            { id: 'db', label: 'One server', sub: 'all keys', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'a1', to: 'db', bidi: true }, { from: 'a2', to: 'db', bidi: true }],
          flow: [['a1>db', 'a2>db'], ['db>a1', 'db>a2']]
        }
      },
      {
        stage: 'breaks',
        title: 'One server fills up, then fails',
        text: 'Keys and traffic keep growing until one machine\'s disk and CPU run out. Splitting keys with <code>hash(key) % servers</code> helps, but adding a server then moves <b>almost every key</b>. Worse, when a server dies, every key on it is unreachable and writes start failing.',
        scene: {
          nodes: [
            { id: 'a1', label: 'App server', sub: 'put cart:alice', kind: 'client', at: [70, 0] },
            { id: 'a2', label: 'App server', sub: 'get cart:bob', kind: 'client', at: [350, 0] },
            { id: 'db', label: 'One server', sub: 'disk full · down', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'a1', to: 'db', bidi: true }, { from: 'a2', to: 'db', bidi: true }],
          flow: [['a1>db', 'a2>db']],
          err: ['db'],
          warn: ['a1', 'a2'],
          badges: { db: ['down', 'err'], a1: ['writes fail', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'A hash ring with three copies of each key',
        text: 'Place nodes on a <b>consistent-hash ring</b>: each key belongs to the next few nodes clockwise, so adding a node moves only a small slice of keys. Each key is copied to <b>N = 3</b> nodes. A write waits for <b>W = 2</b> acknowledgements and a read for <b>R = 2</b> replies. Because 2 + 2 &gt; 3, every read overlaps the latest write, and one dead node stops nothing.',
        scene: {
          nodes: [
            { id: 'a1', label: 'App server', sub: 'put cart:alice', kind: 'client', at: [70, 0] },
            { id: 'a2', label: 'App server', sub: 'get cart:bob', kind: 'client', at: [350, 0] },
            { id: 'db', label: 'Coordinator', sub: 'any node', kind: 'edge', at: [210, 110] },
            { id: 'nA', label: 'Node A', sub: 'copy 1', kind: 'service', at: [70, 220] },
            { id: 'nB', label: 'Node B', sub: 'copy 2', kind: 'service', at: [210, 220] },
            { id: 'nC', label: 'Node C', sub: 'copy 3 · down', kind: 'service', at: [350, 220] }
          ],
          edges: [{ from: 'a1', to: 'db', bidi: true }, { from: 'a2', to: 'db', bidi: true }, { from: 'db', to: 'nA', bidi: true }, { from: 'db', to: 'nB', bidi: true }, { from: 'db', to: 'nC', bidi: true }],
          flow: ['a1>db', ['db>nA', 'db>nB', 'db>nC'], ['nA>db', 'nB>db'], 'db>a1'],
          warn: ['nC'],
          ok: ['nA', 'nB'],
          badges: { db: ['2 of 3 acks', 'ok'] }
        }
      }
    ],
    usedBy: ['Amazon DynamoDB', 'Apache Cassandra', 'ScyllaDB', 'Riak', 'Shopping carts, sessions and user profiles'],
    whenToUse: [
      'Huge numbers of small records looked up <b>by key</b>: carts, sessions, profiles, device data',
      'Writes must keep working even when servers or network links fail',
      'Data and traffic will outgrow one machine'
    ],
    whenNot: [
      'You need joins, ad-hoc queries or multi-row transactions: see <a href="distributed-sql.html">Distributed SQL</a>',
      'The data fits on one machine: a single Postgres or Redis with a replica is simpler',
      'You store large files such as images or videos: see <a href="object-storage.html">Object Storage</a>'
    ],
    glossary: [
      { term: 'Consistent hashing', def: 'Placing nodes and keys on a ring of hash values, so adding or removing a node moves only nearby keys. Virtual nodes give each server many small slices.' },
      { term: 'Replication factor (N)', def: 'How many nodes hold a copy of each key, often 3.' },
      { term: 'Quorum (R and W)', def: 'How many replicas must answer a read (R) or acknowledge a write (W) before the client gets a reply.' },
      { term: 'Hinted handoff', def: 'A healthy node temporarily keeps a write meant for a dead node, with a note, and passes it on when that node returns.' },
      { term: 'Read repair', def: 'During a read, the coordinator notices a stale replica and writes the newest value back to it.' },
      { term: 'Vector clock', def: 'A small per-node version counter attached to a value, used to tell whether two writes happened one after the other or at the same time.' },
      { term: 'LSM tree', def: 'A storage layout that buffers writes in memory, flushes them as sorted files and merges the files in the background.' },
      { term: 'Gossip', def: 'Nodes regularly swap status with a few random peers, so news about joins and failures spreads without a central master.' }
    ]
  },

  requirements: {
    functional: [
      'put(key, value), get(key), delete(key) via tombstones',
      'Consistency chosen per request (ONE, QUORUM, ALL, LOCAL_QUORUM)',
      'Automatic partitioning and rebalancing as nodes join and leave',
      'Replication across racks, zones and regions',
      'Per-key TTL',
      'Conditional write (compare-and-set) for the rare cases that need it'
    ],
    nonFunctional: [
      'p99 reads and writes in single-digit ms',
      'Writes accepted even with a replica down (e.g. shopping cart)',
      'Near-linear scaling by adding nodes',
      'Survive a node, rack or zone failure',
      'An acknowledged write survives a crash (commit log)',
      'Adding a node moves only ~1/n of the data'
    ],
    outOfScope: ['Multi-key ACID transactions (see Distributed SQL)', 'Secondary indexes and ad-hoc queries', 'A cache tier in front (see Distributed Cache)']
  },

  calculator: {
    inputs: [
      { id: 'keys', label: 'Number of keys', min: 1000000, max: 1000000000000, value: 10000000000, log: true },
      { id: 'val', label: 'Average value size', min: 100, max: 100000, value: 1000, fmt: 'bytes', log: true },
      { id: 'n', label: 'Replication factor N', min: 1, max: 5, value: 3 },
      { id: 'disk', label: 'Usable disk per node', min: 1, max: 30, value: 4, unit: 'TB' },
      { id: 'wps', label: 'Client writes per second', min: 1000, max: 10000000, value: 200000, log: true },
      { id: 'wa', label: 'Compaction write amplification (estimate)', min: 2, max: 30, value: 10, unit: '×' }
    ],
    outputs: [
      { label: 'Logical data (value + ~50 B key/overhead)', fmt: 'bytes', f: (v) => v.keys * (v.val + 50) },
      { label: 'Stored with N replicas', fmt: 'bytes', f: (v) => v.keys * (v.val + 50) * v.n },
      { label: 'Nodes (disks kept ≤ 50% full for compaction)', f: (v) => Math.max(v.n, Math.ceil(v.keys * (v.val + 50) * v.n / (v.disk * 1e12 * 0.5))) },
      { label: 'Replica writes per second (cluster)', f: (v) => v.wps * v.n },
      { label: 'Disk write bandwidth incl. compaction', fmt: 'bytesps', f: (v) => v.wps * v.n * (v.val + 50) * v.wa },
      { label: 'Data streamed when one node joins', fmt: 'bytes', f: (v) => v.keys * (v.val + 50) * v.n / (Math.max(v.n, Math.ceil(v.keys * (v.val + 50) * v.n / (v.disk * 1e12 * 0.5))) + 1) }
    ],
    note: 'Size-tiered compaction can briefly need as much free space as the SSTables it merges, hence the 50% rule of thumb. Write amplification depends heavily on the compaction strategy (size-tiered is low, leveled is higher) and is an <em>estimate</em>. With vnodes, a joining node takes a little data from <i>every</i> node instead of half of one neighbour\'s.'
  },

  api: [
    { m: 'PUT', p: '/kv/{key}  (consistency=QUORUM)', d: 'The coordinator hashes the key, sends to all N replicas in its preference list and acks after <b>W</b>. Dynamo also takes the <b>context</b> (vector clock) returned by the last read.' },
    { m: 'GET', p: '/kv/{key}?consistency=ONE', d: 'Waits for <b>R</b> replies. LWW stores return the newest timestamp. Dynamo can return several <b>siblings</b> plus a context for the client to merge.' },
    { m: 'DELETE', p: '/kv/{key}', d: 'Writes a <b>tombstone</b>, not an erase. It must reach every replica before it is purged (<code>gc_grace_seconds</code>, default 10 days in Cassandra), or the deleted value can come back.' },
    { m: 'SQL', p: 'UPDATE … IF qty = 2  (CQL LWT)', d: 'Compare-and-set via <b>Paxos</b> among the replicas. Linearizable for that partition, but several round trips. Use it sparingly.' },
    { m: 'RPC', p: 'gossip: GossipDigestSyn / Ack', d: 'Each node exchanges membership and heartbeat versions with a few random peers every second. A <b>φ-accrual</b> detector turns missed heartbeats into "probably down".' },
    { m: 'RPC', p: 'repair: Merkle tree exchange', d: 'Anti-entropy. Replicas hash their token ranges into Merkle trees, compare roots, and stream only the ranges that differ.' }
  ],
  dataModel: [
    { name: 'ring / token metadata', store: 'Gossiped to every node', fields: [['node_id', 'uuid', 'pk'], ['tokens', 'vnodes (e.g. 16)'], ['dc, rack', 'placement'], ['status', 'UP | DOWN | JOINING | LEAVING'], ['heartbeat', '(generation, version)']], note: 'Every node knows the whole ring, so any node can coordinate in one hop.' },
    { name: 'commit log + memtable', store: 'Append-only file + sorted in-memory map', fields: [['key', 'partition + clustering', 'pk'], ['value', 'bytes'], ['timestamp', 'µs (LWW)'], ['tombstone', 'bool']], note: 'Write = sequential append + in-memory insert. No read-before-write.' },
    { name: 'SSTable', store: 'Immutable sorted file', fields: [['key range', 'sorted', 'pk'], ['index + summary', 'offsets', 'idx'], ['Bloom filter', 'skip files without the key'], ['min/max timestamp', 'for compaction and TTL']], note: 'Never modified. Compaction merges several into new ones and drops overwritten and expired data.' },
    { name: 'hints', store: 'On coordinator / fallback node', fields: [['target_node', 'uuid', 'pk'], ['mutation', 'key + value + ts'], ['created_at', 'ts']], note: 'Replayed when the target comes back. Cassandra stops storing new hints for a node that has been down longer than <code>max_hint_window</code> (3 h by default); after that, repair must fix it.' }
  ],

  architecture: {
    title: 'Leaderless replicated key-value store',
    nodes: [
      { id: 'cli', label: 'Client', sub: 'token-aware driver', kind: 'client', wide: [90, 170], tall: [210, 0], tip: 'A token-aware driver knows the ring and sends each request straight to a replica, saving a hop.' },
      { id: 'coord', label: 'Coordinator', sub: 'any node · N=3 W=2 R=2', kind: 'edge', wide: [290, 170], tall: [210, 105], tip: 'Whichever node receives the request. It computes the preference list, fans out to N replicas and waits for W or R responses.' },
      { id: 'gossip', label: 'Gossip', sub: 'membership · φ detector', kind: 'compute', wide: [290, 340], tall: [70, 105], tip: 'Peer-to-peer membership. There is no master: state spreads epidemically in O(log n) rounds.' },
      { id: 'ra', label: 'Node A', sub: 'replica 1 of key', kind: 'service', wide: [490, 30], tall: [70, 210], tip: 'First node clockwise from hash(key) on the ring. Its storage engine is shown to the right.' },
      { id: 'rb', label: 'Node B', sub: 'replica 2', kind: 'service', wide: [490, 140], tall: [210, 210], tip: 'Next distinct physical node clockwise (vnodes of the same host are skipped).' },
      { id: 'rc', label: 'Node C', sub: 'replica 3', kind: 'service', wide: [490, 250], tall: [350, 210], tip: 'Third replica. With rack awareness, replicas go to different racks or zones.' },
      { id: 'rd', label: 'Node D', sub: 'next on ring', kind: 'service', wide: [490, 360], tall: [350, 105], tip: 'Not a replica for this key. Under a sloppy quorum it temporarily accepts writes meant for a dead replica, with a hint.' },
      { id: 'wal', label: 'Commit log', sub: 'sequential append', kind: 'store', wide: [690, 30], tall: [70, 315], tip: 'Durability first: the mutation is appended (and fsynced per the sync policy) before the ack.' },
      { id: 'mem', label: 'Memtable', sub: 'sorted, in RAM', kind: 'cache', wide: [690, 140], tall: [210, 315], tip: 'A sorted in-memory map. Reads check it first. When full it is flushed to a new SSTable.' },
      { id: 'sst', label: 'SSTables', sub: 'immutable · Bloom filters', kind: 'store', wide: [890, 140], tall: [210, 420], tip: 'Sorted, immutable files. A read checks the Bloom filter of each candidate file and skips most of them.' },
      { id: 'comp', label: 'Compaction', sub: 'size-tiered / leveled', kind: 'compute', wide: [890, 30], tall: [350, 420], tip: 'Merges SSTables, keeps the newest version of each key and purges tombstones older than gc_grace.' },
      { id: 'ae', label: 'Anti-entropy', sub: 'Merkle-tree repair', kind: 'compute', wide: [690, 305], tall: [350, 315], tip: 'Background repair: compare Merkle-tree hashes of token ranges between replicas and stream only the ranges that differ.' }
    ],
    edges: [
      { from: 'cli', to: 'coord', bidi: true },
      { from: 'coord', to: 'ra' },
      { from: 'coord', to: 'rb' },
      { from: 'coord', to: 'rc' },
      { from: 'coord', to: 'rd', dashed: true, label: 'sloppy' },
      { from: 'rd', to: 'rc', dashed: true, label: 'hint replay' },
      { from: 'gossip', to: 'coord', bidi: true, dashed: true },
      { from: 'ra', to: 'wal', label: 'append' },
      { from: 'ra', to: 'mem' },
      { from: 'mem', to: 'sst', label: 'flush' },
      { from: 'sst', to: 'comp', bidi: true },
      { from: 'rb', to: 'ae', dashed: true },
      { from: 'ae', to: 'rc', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'write', title: 'Write with W = 2 of N = 3', tone: 'info',
      steps: [
        { text: 'The client writes <code>cart:alice</code> at QUORUM. Whichever node receives it becomes the <b>coordinator</b>; there is no leader for the key.', flow: ['cli>coord'] },
        { text: 'hash(key) lands on the ring. Walking clockwise and skipping vnodes of hosts already chosen gives the <b>preference list</b>: A, B, C.', nodes: ['coord', 'ra', 'rb', 'rc'], badges: { coord: 'token 0x3fa…' } },
        { text: 'The coordinator sends the mutation to <b>all three</b> in parallel. W only decides how many acks it waits for.', flow: [['coord>ra', 'coord>rb', 'coord>rc']] },
        { text: 'Each replica <b>appends to the commit log</b>, then inserts into the memtable. No disk seek and no read-before-write, which is why LSM writes are cheap.', flow: [['ra>wal', 'ra>mem']], badges: { wal: 'append', mem: '+1 key' } },
        { text: 'Acks from A and B arrive: <b>W = 2 reached</b>, so the client gets success. C\'s ack arrives a little later, in the background.', flow: [['ra>coord', 'rb>coord'], 'coord>cli'], ok: ['ra', 'rb'], badges: { coord: ['2/3 acks ✓', 'ok'] }, tone: 'ok' },
        { text: 'Later the memtable fills and is <b>flushed</b> as a new immutable SSTable. Compaction merges SSTables in the background and keeps only the newest version of each key.', flow: ['mem>sst', 'sst>comp'], badges: { sst: '+1 SSTable', comp: 'merge 4 → 1' }, tone: 'ok' }
      ]
    },
    {
      id: 'repair', title: 'Read repair on a stale replica', tone: 'ok',
      steps: [
        { text: 'C missed the last write (it was briefly overloaded). It still holds v1, while A and B hold v2.', nodes: ['ra', 'rb', 'rc'], warn: ['rc'], badges: { ra: 'v2', rb: 'v2', rc: ['v1', 'warn'] } },
        { text: 'A read at QUORUM (R = 2) goes to B and C: full data from one, a digest (hash) from the other.', flow: [['coord>rb', 'coord>rc']], badges: { coord: 'R = 2' } },
        { text: 'The digests do not match. The coordinator compares timestamps (or vector clocks) and picks <b>v2</b>. Because R + W > N, at least one of the two replies is guaranteed to be v2.', nodes: ['coord'], badges: { coord: ['v2 wins', 'ok'] }, tone: 'ok' },
        { text: '<b>Read repair</b>: the coordinator writes v2 back to C and returns v2 to the client. Data that is read often heals itself.', flow: ['coord>rc', 'coord>cli'], ok: ['rc'], badges: { rc: ['v1 → v2', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'handoff', title: 'Node down → hinted handoff → replay', tone: 'err',
      steps: [
        { text: 'Node C crashes. Gossip stops seeing its heartbeat increase, and the φ-accrual detector marks it <b>DOWN</b> on every node.', nodes: ['rc', 'gossip'], err: ['rc'], badges: { rc: ['down', 'err'] }, tone: 'err' },
        { text: 'A write arrives. A and B ack, so W = 2 is met and the client is happy. The copy meant for C must not be lost.', flow: [['coord>ra', 'coord>rb']], ok: ['ra', 'rb'] },
        { text: '<b>Sloppy quorum</b> (Dynamo): the next healthy node clockwise, D, stores the write with a <b>hint</b> saying "this belongs to C". Cassandra keeps the hint on the coordinator instead.', flow: ['coord>rd'], warn: ['rd'], badges: { rd: ['hint → C', 'warn'] }, tone: 'warn' },
        { text: 'C restarts and gossip announces it. D <b>replays the hint</b> to C and deletes it. C is back in sync for those writes.', flow: ['rd>rc'], ok: ['rc'], badges: { rc: ['caught up', 'ok'] }, tone: 'ok' },
        { text: 'Had C been down longer than the hint window (3 h in Cassandra), no more hints would be kept for it. Then <b>Merkle-tree repair</b> compares range hashes and streams only the ranges that differ.', flow: ['rb>ae', 'ae>rc'], badges: { ae: '2 ranges differ' } }
      ]
    },
    {
      id: 'conflict', title: 'Concurrent writes: vector clocks vs LWW', tone: 'warn',
      steps: [
        { text: 'The cart has version D2 with clock <code>[Sx:2]</code>. During a partition, two clients update it through different coordinators.', nodes: ['coord', 'ra', 'rb'], badges: { ra: '[Sx:2]', rb: '[Sx:2]' } },
        { text: 'One write is coordinated by Sy and becomes <code>[Sx:2, Sy:1]</code> (+book). The other is coordinated by Sz and becomes <code>[Sx:2, Sz:1]</code> (+pen). Neither clock descends from the other: they are <b>concurrent</b>.', flow: [['coord>ra', 'coord>rb']], warn: ['ra', 'rb'], badges: { ra: ['+book', 'warn'], rb: ['+pen', 'warn'] }, tone: 'warn' },
        { text: '<b>Dynamo</b>: a read returns <b>both siblings</b>. The cart merges them (union), and the next write carries the merged clock <code>[Sx:3, Sy:1, Sz:1]</code>. Nothing is lost, though a deleted item can reappear.', flow: [['coord>ra', 'coord>rb'], 'coord>cli'], ok: ['cli'], badges: { cli: ['book + pen', 'ok'] }, tone: 'ok' },
        { text: '<b>Cassandra (LWW)</b>: each cell keeps the highest timestamp. One of the two updates is <b>silently dropped</b>, and clock skew decides which. Model data so concurrent writes touch different cells (one row per cart item).', nodes: ['ra', 'rb'], err: ['rb'], badges: { rb: ['+pen lost', 'err'] }, tone: 'err' }
      ]
    },
    {
      id: 'scale', title: 'Adding a node, and a hot partition', tone: 'warn',
      steps: [
        { text: 'Disks are 60% full, so we add node E. With <b>vnodes</b> (e.g. 16 tokens per node) E takes many small token ranges from <i>all</i> nodes, instead of half of one neighbour\'s range.', nodes: ['gossip', 'ra', 'rb', 'rc', 'rd'], badges: { gossip: 'E joining' } },
        { text: 'Each existing node streams about 1/n of its data to E while still serving traffic. Gossip spreads the new token map and drivers update their routing.', flow: ['gossip>coord'], ok: ['ra', 'rb', 'rc', 'rd'], badges: { ra: '-1/5', rb: '-1/5' }, tone: 'ok' },
        { text: 'A celebrity\'s key gets 100K reads/s. More nodes do not help: one key always lives on the same <b>N replicas</b>.', flow: [['cli>coord', 'cli>coord'], ['coord>ra', 'coord>rb', 'coord>rc']], err: ['ra', 'rb', 'rc'], badges: { ra: ['hot', 'err'] }, tone: 'err' },
        { text: 'Fixes: read at ONE to spread load over all three replicas, put a <b>cache</b> in front, or <b>split the key</b> (<code>key#0..7</code>) and fan out or merge in the app.', nodes: ['coord'], ok: ['ra', 'rb', 'rc'], badges: { coord: 'key#0..7' }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Set N, R and W, then choose the availability model and the compaction strategy. Latencies assume replicas typically answer in 2, 3, 5, 9 and 20 ms (an illustrative spread), and each node is unavailable 1% of the time.',
    controls: [
      { id: 'n', label: 'Replicas N', type: 'range', min: 1, max: 5, step: 1, value: 3 },
      { id: 'w', label: 'Write quorum W', type: 'range', min: 1, max: 5, step: 1, value: 2 },
      { id: 'r', label: 'Read quorum R', type: 'range', min: 1, max: 5, step: 1, value: 2 },
      { id: 'model', label: 'Availability model', type: 'seg', value: 'strict', options: [
        { v: 'strict', l: 'Strict quorum + LWW (Cassandra)' }, { v: 'sloppy', l: 'Sloppy quorum + vector clocks (Dynamo)' }] },
      { id: 'comp', label: 'Compaction', type: 'seg', value: 'stcs', options: [
        { v: 'stcs', l: 'Size-tiered' }, { v: 'lcs', l: 'Leveled' }, { v: 'ucs', l: 'Unified (Cassandra 5.0)' }] }
    ],
    evaluate(s) {
      const N = s.n, W = Math.min(s.w, N), R = Math.min(s.r, N);
      const lat = [2, 3, 5, 9, 20];                    // k-th fastest replica reply (ms), illustrative
      const pUp = 0.99;
      const atLeast = (k) => { let p = 0; for (let i = k; i <= N; i++) p += binom(N, i) * Math.pow(pUp, i) * Math.pow(1 - pUp, N - i); return p; };
      const sloppy = s.model === 'sloppy';
      const wAvail = sloppy ? 1 - 1e-9 : atLeast(W), rAvail = atLeast(R);
      const overlap = R + W > N;
      const nines = (p) => p >= 0.9999999 ? '≈ 100%' : (p * 100).toFixed(p > 0.9999 ? 5 : p > 0.999 ? 4 : 3) + '%';
      const compM = {
        stcs: { v: 'low write amp; reads may touch many SSTables', s: 0.6 },
        lcs: { v: 'reads hit ~1 SSTable per level; ~10× more rewrite', s: 0.65 },
        ucs: { v: 'tunable between tiered and leveled', s: 0.8 }
      }[s.comp];
      const metrics = [
        { k: 'Read sees latest write?', v: !overlap ? 'not guaranteed (R + W ≤ N)' : sloppy ? 'usually; not during failover' : 'yes: quorums overlap', s: !overlap ? 0.25 : sloppy ? 0.6 : 0.9 },
        { k: 'Write latency', v: '≈ ' + lat[W - 1] + ' ms (' + ord(W) + ' fastest of ' + N + ')', s: lat[W - 1] <= 3 ? 0.9 : lat[W - 1] <= 5 ? 0.75 : lat[W - 1] <= 9 ? 0.5 : 0.25 },
        { k: 'Read latency', v: '≈ ' + lat[R - 1] + ' ms (' + ord(R) + ' fastest of ' + N + ')', s: lat[R - 1] <= 3 ? 0.9 : lat[R - 1] <= 5 ? 0.75 : lat[R - 1] <= 9 ? 0.5 : 0.25 },
        { k: 'Write availability', v: nines(wAvail) + (sloppy ? ' · fallback nodes take writes' : ' · tolerates ' + (N - W) + ' down'), s: Math.min(1, Math.max(0.05, (Math.log10(1 / Math.max(1e-12, 1 - wAvail)) - 1) / 6)) },
        { k: 'Read availability', v: nines(rAvail) + ' · tolerates ' + (N - R) + ' down', s: Math.min(1, Math.max(0.05, (Math.log10(1 / Math.max(1e-12, 1 - rAvail)) - 1) / 6)) },
        { k: 'Concurrent writes', v: sloppy ? 'kept as siblings; app merges' : 'last write wins; one silently dropped', s: sloppy ? 0.75 : 0.45 },
        { k: 'Compaction', v: compM.v, s: compM.s }
      ];
      const notes = [];
      if (s.r > N || s.w > N) notes.push('R and W cannot exceed N; they are capped at ' + N + ' here.');
      if (N === 1) notes.push('N = 1 means no replication: one disk failure loses data, and one node restart makes its keys unavailable.');
      if (W === 1) notes.push('W = 1 acks after a single replica has the write. If that node dies before replicating, an <b>acknowledged write is lost</b>.');
      if (W === N && !sloppy) notes.push('W = N: a single slow or dead replica blocks or fails every write to its keys.');
      if (overlap && !sloppy) notes.push('R + W > N still is not full linearizability: a write that failed after reaching some replicas can surface later, and LWW depends on clocks. Cassandra uses Paxos (LWT) when it must be exact.');
      if (sloppy && overlap) notes.push('A sloppy quorum may count fallback nodes like D, so the read quorum and the write quorum can miss each other during a failure. Dynamo trades that for an always-writable cart.');
      if (s.comp === 'lcs') notes.push('Leveled compaction suits read-heavy, update-heavy tables. On write-heavy ingest it can eat disk bandwidth.');
      if (s.comp === 'stcs') notes.push('Size-tiered is write-friendly but needs free space for big merges, and old versions of a key can sit in many files.');
      if (s.comp === 'ucs') notes.push('The Apache Cassandra docs recommend UCS for most workloads starting with 5.0. It is a single parameterised framework rather than a third algorithm.');
      let verdict;
      if (N === 1) verdict = '❌ <b>No redundancy.</b> Use N = 3 across zones.';
      else if (W === 1 && !sloppy) verdict = '⚠ <b>Fast but fragile:</b> W = 1 can lose acknowledged writes.';
      else if (!overlap) verdict = '⚠ <b>Eventually consistent:</b> fast and highly available, but reads can be stale. Fine for metrics or feeds, not for balances.';
      else if (W === N && !sloppy) verdict = '⚠ <b>Writes stop when any replica is down.</b> Lower W, or accept sloppy quorums.';
      else if (N === 3 && R === 2 && W === 2) verdict = sloppy ? '✅ <b>Dynamo\'s classic (3, 2, 2)</b> with sloppy quorums: always writable, conflicts resolved by the application.' : '✅ <b>The standard QUORUM / QUORUM setup:</b> reads see acknowledged writes, and one replica can be down.';
      else verdict = '👍 <b>Quorums overlap</b> (R + W = ' + (R + W) + ' > ' + N + '). The price: writes wait for the ' + ord(W) + ' fastest replica (≈ ' + lat[W - 1] + ' ms), reads for the ' + ord(R) + ' (≈ ' + lat[R - 1] + ' ms); writes survive ' + (N - W) + ' and reads ' + (N - R) + ' replicas down.';
      const rep = ['ra', 'rb', 'rc', 'rd'].slice(0, Math.min(N, 4));
      const hide = ['ra', 'rb', 'rc', 'rd'].filter((x) => !rep.includes(x) && !(sloppy && x === 'rd'));
      return {
        metrics, verdict, notes,
        flow: ['cli>coord', rep.map((x) => 'coord>' + x)].concat(sloppy && N < 4 ? ['coord>rd'] : []),
        hide,
        labels: {
          coord: { label: 'Coordinator', sub: 'N=' + N + ' W=' + W + ' R=' + R },
          comp: { label: 'Compaction', sub: { stcs: 'size-tiered (STCS)', lcs: 'leveled (LCS)', ucs: 'unified (UCS)' }[s.comp] },
          rd: N >= 4 ? { label: 'Node D', sub: N === 5 ? 'replica 4 (+ E = 5)' : 'replica 4' } : { label: 'Node D', sub: 'fallback + hint' }
        },
        ok: rep.slice(0, W),
        warn: !overlap ? ['coord'] : [],
        badges: { coord: [overlap ? 'R+W=' + (R + W) + ' > ' + N : 'R+W=' + (R + W) + ' ≤ ' + N, overlap ? 'ok' : 'warn'] }
      };
      function ord(k) { return k + (['th', 'st', 'nd', 'rd'][k] || 'th'); }
      function binom(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
    }
  },

  widget: {
    title: 'Quorum ring: kill nodes, change R and W, read back',
    caption: 'Six nodes own 4 vnodes each on a <b>consistent-hash ring</b>. The key\'s <b>preference list</b> is the next N distinct nodes clockwise. Writes ack after W replies; the remaining replicas get the write ~2 s later. <b>Tap a node</b> to kill or revive it, then read: <b>fresh</b>, <b>stale</b> or <b>unavailable</b>?'
  },

  realWorld: {
    intro: 'Two papers define this design space: Amazon\'s Dynamo, and the LSM-tree underneath almost every implementation.',
    timeline: [
      { when: '1996', who: 'O\'Neil et al.', title: 'The log-structured merge-tree', text: 'Batch index changes in a memory component and merge them into disk components like a merge sort. It is built for <b>write-heavy</b> workloads, and is the ancestor of the storage engines in Bigtable, LevelDB, RocksDB and Cassandra.', src: 0 },
      { when: '2007', who: 'Amazon', title: 'Dynamo (SOSP)', text: 'An always-writable store for the shopping cart: consistent hashing, <b>sloppy quorum + hinted handoff</b>, <b>vector clocks</b> with application-side reconciliation, Merkle-tree anti-entropy and gossip membership.', src: 1 },
      { when: '2009', who: 'Facebook', title: 'Cassandra (LADIS)', text: 'Built by Avinash Lakshman (a Dynamo co-author) and Prashant Malik for <b>Inbox Search</b>. It combines Dynamo-style distribution with a Bigtable-like data model on an LSM engine. The talk cites 50+ TB on a 150-node cluster.', src: 2 },
      { when: '2012', who: 'AWS', title: 'DynamoDB launches', text: 'A managed service built on the lessons of the Dynamo paper. Customers wanted predictable performance without running the system themselves.', src: 4 },
      { when: '2022', who: 'AWS', title: 'DynamoDB paper (USENIX ATC)', text: 'Unlike Dynamo, each partition\'s replicas use <b>Multi-Paxos with a leader</b>, which allows strongly consistent reads. During Prime Day 2021 DynamoDB peaked at <b>89.2 million requests per second</b>.', src: 5 },
      { when: '2024', who: 'Apache Cassandra', title: '5.0: Unified Compaction Strategy', text: 'UCS makes the trade-off between tiered and leveled compaction (read vs write amplification) a tunable setting, with sharding. The docs recommend it for most workloads from 5.0.', src: 6 }
    ],
    lessons: [
      'Pick N, R and W <b>per use case</b>: a cart wants writes that never fail, a balance wants overlap.',
      'LWW is simple but <b>silently drops</b> concurrent updates. Model data so concurrent writes touch different cells.',
      'Repair is not optional: hints expire, and tombstones must reach every replica before <code>gc_grace</code>.',
      'Leaderless is not the only answer: DynamoDB moved to per-partition leaders with Multi-Paxos.'
    ],
    sources: [
      { title: 'The log-structured merge-tree (LSM-tree)', url: 'https://link.springer.com/article/10.1007/s002360050048', pub: 'Acta Informatica, 1996' },
      { title: 'Dynamo: Amazon\'s Highly Available Key-Value Store (reference)', url: 'https://www.allthingsdistributed.com/2007/07/dynamo_reference.html', pub: 'All Things Distributed, SOSP 2007' },
      { title: 'Facebook\'s Cassandra paper, annotated and compared to Apache Cassandra 2.0', url: 'https://docs.datastax.com/en/articles/cassandra/cassandrathenandnow.html', pub: 'DataStax' },
      { title: 'Cassandra: A Decentralized Structured Storage System (talk)', url: 'https://research.cs.cornell.edu/ladis2009/talks/malik-talk-ladis2009.pdf', pub: 'LADIS 2009' },
      { title: 'Amazon\'s DynamoDB: 10 years later', url: 'https://www.amazon.science/latest-news/amazons-dynamodb-10-years-later', pub: 'Amazon Science, 2022' },
      { title: 'Amazon DynamoDB: A Scalable, Predictably Performant, and Fully Managed NoSQL Database Service', url: 'https://www.usenix.org/conference/atc22/presentation/vig', pub: 'USENIX ATC 2022' },
      { title: 'Apache Cassandra 5.0 Features: Unified Compaction Strategy', url: 'https://cassandra.apache.org/_/blog/Apache-Cassandra-5.0-Features-Unified-Compaction-Strategy.html', pub: 'Apache Cassandra blog' },
      { title: 'Hints (max_hint_window, default 3 h)', url: 'https://cassandra.apache.org/doc/latest/operating/hints.html', pub: 'Apache Cassandra docs' },
      { title: 'Notes on the DynamoDB paper', url: 'https://brooker.co.za/blog/2022/07/12/dynamodb.html', pub: 'Marc Brooker, 2022' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Quorum', '<b>R + W > N</b> (QUORUM / QUORUM): reads see acked writes', '<b>R = W = 1</b>: lowest latency, highest availability', 'Overlap for user-visible state; ONE for telemetry and caches'],
      ['Replication', '<b>Leaderless</b> (Dynamo, Cassandra): any replica takes writes', '<b>Leader per partition</b> (DynamoDB, Raft/Paxos stores): ordered, strongly consistent', 'Leaderless for always-writable; leader-based when you need CAS or strong reads cheaply'],
      ['Conflicts', '<b>LWW timestamps</b>: simple, may drop a write', '<b>Vector clocks / CRDTs</b>: no lost updates, the app merges', 'LWW with cell-level modelling; CRDTs for counters, sets and carts'],
      ['Storage engine', '<b>LSM tree</b>: fast sequential writes, compaction cost', '<b>B-tree</b> (Postgres): fast reads, in-place updates', 'LSM for write-heavy and time-series; B-tree for read-heavy and range-heavy'],
      ['Compaction', '<b>Size-tiered</b>: low write amplification', '<b>Leveled</b>: low read and space amplification', 'STCS for ingest, LCS for read-mostly, TWCS for TTL time-series, UCS on 5.0+'],
      ['Partitioning', '<b>Consistent hashing + vnodes</b>: even spread, cheap rebalancing', '<b>Range partitioning</b>: range scans, but hot ranges', 'Hashing for key lookups; ranges when you scan by key order']
    ]
  },
  failures: [
    { f: 'Replica down', detect: 'Gossip φ-accrual detector', fix: 'Quorum still met with N − W replicas down; hinted handoff covers the gap and repair covers anything longer.' },
    { f: 'Stale read after a missed write', detect: 'Digest mismatch on read', fix: 'Read repair on the spot, plus regular Merkle-tree anti-entropy.' },
    { f: 'Deleted data comes back ("zombie")', detect: 'Deleted rows reappear after a node rejoins', fix: 'Run full repair within <code>gc_grace_seconds</code> so tombstones reach every replica before they are purged.' },
    { f: 'Concurrent writes, one lost', detect: 'Customer reports; LWW timestamps out of order', fix: 'Vector clocks or CRDTs, finer-grained cells, or LWT for compare-and-set.' },
    { f: 'Clock skew breaks LWW', detect: 'NTP offset alarms, writes "in the future"', fix: 'Tight NTP, client-side timestamps from one source, or avoid LWW for that data.' },
    { f: 'Compaction falls behind', detect: 'Pending compactions, SSTables per read, disk filling', fix: 'Throttle ingest, add nodes, choose a better-suited strategy, keep disks ≤ 50% full.' },
    { f: 'Queue-like table drowns in tombstones', detect: 'Tombstone warnings in logs, slow or failing range reads on a partition', fix: 'Do not use the store as a queue. Bucket partitions by time, expire with TTL and time-window compaction, so whole SSTables drop at once.' },
    { f: 'Hot partition', detect: 'Per-partition latency, one replica set saturated', fix: 'Cache, read at ONE across replicas, or split the key with a suffix.' }
  ],

  interview: [
    { q: 'What does R + W > N actually guarantee?', a: '<p>Any set of R replicas <b>intersects</b> any set of W replicas, so every read contacts at least one replica that has the latest acknowledged write. With version numbers or timestamps the coordinator returns the newest one.</p><p>It does <i>not</i> give full linearizability: a failed write can be partially applied, sloppy quorums break the overlap, and LWW depends on clocks.</p>', lvl: 'core' },
    { q: 'Why consistent hashing, and why virtual nodes?', a: '<p>With <code>hash(key) % n</code>, changing n moves almost every key. On a ring, adding a node moves only the keys between it and its predecessor, about 1/n of the data.</p><p><b>Vnodes</b> give each host many small ranges, so load is even, a joining node takes data from everyone, and a dead node\'s load spreads over many peers instead of one neighbour.</p>', lvl: 'core' },
    { q: 'Why did Dynamo use vector clocks?', a: '<p>To tell "newer" apart from "concurrent". A vector clock is a list of (node, counter) pairs. If one clock is ≥ another in every entry, it is a descendant and the old version can be dropped. Otherwise the writes are <b>concurrent</b>, and both are kept as siblings for the application to merge (union of carts).</p><p>LWW would silently drop one of them.</p>', fu: 'What is the downside? (Clocks grow with the number of coordinators, so Dynamo truncated them, and the merge logic is pushed to every client.)', lvl: 'core' },
    { q: 'LSM tree vs B-tree?', a: '<ul><li><b>LSM</b>: writes are a sequential log append plus an in-memory insert, so writes are fast. Reads may check several SSTables (Bloom filters help), and compaction costs background I/O (write amplification).</li><li><b>B-tree</b>: updates in place with random I/O and a WAL. Reads are one tree walk, and range scans are excellent.</li></ul><p>Use LSM for write-heavy data, B-tree for read-heavy.</p>', lvl: 'core' },
    { q: 'Hinted handoff vs read repair vs anti-entropy?', a: '<ul><li><b>Hinted handoff</b>: covers <i>short</i> outages. Writes for a dead replica are stored elsewhere and replayed when it returns.</li><li><b>Read repair</b>: fixes divergence on keys that are <i>read</i>.</li><li><b>Anti-entropy</b> (Merkle trees): background repair of <i>everything</i>, including cold keys and long outages.</li></ul><p>You need all three.</p>', lvl: 'core' },
    { q: 'How do you use tunable consistency in practice?', a: '<p>With RF = 3 per datacenter, use <code>LOCAL_QUORUM</code> for both reads and writes. You get overlap inside the DC without paying cross-region latency, and other DCs catch up asynchronously.</p><p>Use <code>ONE</code> for metrics and logs, and <b>LWT / SERIAL</b> only where you need compare-and-set (for example unique usernames).</p>', lvl: 'core' },
    { q: 'How does a read find a key in an LSM store?', a: '<p>Check the memtable, then the SSTables from newest to oldest. For each SSTable, the <b>Bloom filter</b> answers "definitely not here" for most files. Then the partition index or summary gives the offset. Merge what you find, newest timestamp wins, and tombstones hide older values.</p>', lvl: 'deep' },
    { q: 'Why are deletes hard in an eventually consistent store?', a: '<p>You cannot just erase the value: a replica that missed the delete would later "repair" it back. So a delete writes a <b>tombstone</b> that is kept for <code>gc_grace_seconds</code> (10 days by default in Cassandra). Repair must run within that window so every replica sees the tombstone before compaction purges it.</p>', lvl: 'deep' },
    { q: 'How is DynamoDB different from the Dynamo paper?', a: '<p>Dynamo is leaderless, uses sloppy quorums, vector clocks and client-side reconciliation, and was run by the teams that used it. DynamoDB, per its 2022 paper, is a managed multi-tenant service where each partition\'s replicas run <b>Multi-Paxos with a leader</b>. That allows strongly consistent reads and conditional writes, with admission control for predictable latency.</p>', lvl: 'deep' },
    { q: 'How do nodes detect failures without a master?', a: '<p><b>Gossip</b>: every second each node exchanges heartbeat versions with a few random peers, so information spreads in O(log n) rounds. A <b>φ-accrual detector</b> turns the time since the last heartbeat into a suspicion level, which adapts to network jitter better than a fixed timeout.</p>', lvl: 'deep' },
    { q: 'When would you pick Postgres over a Dynamo-style store?', a: '<p>When you need multi-row transactions, joins, secondary indexes or ad-hoc queries, and one primary (plus read replicas or sharding) can handle the write rate.</p><p>Pick the KV store for very high write throughput, multi-region always-on writes, and simple key-based access.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Spring Data Cassandra: consistency per query and per write', lang: 'java',
      code: `// spring-boot-starter-data-cassandra (DataStax driver 4.x)
// application.yml default: spring.cassandra.request.consistency: local_quorum
@Table("cart_items")
public record CartItem(
    @PrimaryKeyColumn(name = "user_id", type = PrimaryKeyType.PARTITIONED) String userId,
    @PrimaryKeyColumn(name = "sku", ordinal = 1, type = PrimaryKeyType.CLUSTERED) String sku,
    int qty) {}

public interface CartRepository extends CassandraRepository<CartItem, MapId> {
  @Consistency(DefaultConsistencyLevel.LOCAL_QUORUM)   // R = 2 of RF 3 in this DC
  List<CartItem> findByUserId(String userId);

  @Consistency(DefaultConsistencyLevel.LOCAL_ONE)      // fastest; may be stale
  List<CartItem> findAllByUserId(String userId);
}

@Service
class CartService {
  private final CassandraOperations ops;
  CartService(CassandraOperations ops) { this.ops = ops; }

  void add(CartItem item) {
    ops.insert(item, InsertOptions.builder()
        .consistencyLevel(DefaultConsistencyLevel.LOCAL_QUORUM)   // W = 2 → R + W > 3
        .ttl(Duration.ofDays(30))
        .build());
  }

  /** Compare-and-set via Paxos (LWT). Several round trips: use only where needed. */
  boolean changeQty(String user, String sku, int expected, int next) {
    var stmt = SimpleStatement.newInstance(
            "UPDATE cart_items SET qty = ? WHERE user_id = ? AND sku = ? IF qty = ?",
            next, user, sku, expected)
        .setSerialConsistencyLevel(DefaultConsistencyLevel.LOCAL_SERIAL);
    return ops.getCqlOperations().execute(stmt);           // true = applied
  }
}`
    },
    {
      title: 'CQL vs Postgres: the same cart table', lang: 'sql',
      code: `-- Cassandra: N = 3 replicas in each datacenter
CREATE KEYSPACE shop WITH replication =
  {'class': 'NetworkTopologyStrategy', 'dc1': 3, 'dc2': 3};

CREATE TABLE shop.cart_items (
  user_id text, sku text, qty int,
  PRIMARY KEY ((user_id), sku)            -- partition key, then clustering key
) WITH compaction = {'class': 'LeveledCompactionStrategy'}
  AND gc_grace_seconds = 864000;          -- run repair at least every 10 days

-- cqlsh> CONSISTENCY LOCAL_QUORUM;
INSERT INTO shop.cart_items (user_id, sku, qty) VALUES ('alice', 'B07X', 2) USING TTL 2592000;
UPDATE shop.cart_items SET qty = 1 WHERE user_id = 'alice' AND sku = 'B07X' IF qty = 2;  -- LWT

-- Postgres: same shape, but ONE primary takes every write
CREATE TABLE cart_items (
  user_id text, sku text, qty int NOT NULL,
  PRIMARY KEY (user_id, sku)
);
INSERT INTO cart_items VALUES ('alice', 'B07X', 2)
ON CONFLICT (user_id, sku) DO UPDATE SET qty = EXCLUDED.qty;
-- synchronous_standby_names = 'FIRST 1 (s1, s2)' ≈ "W = 2": primary + one standby before COMMIT returns`,
      note: 'One row per cart item means two devices adding different items never collide, even with LWW.'
    },
    {
      title: 'Python: vector clocks detect concurrent writes', lang: 'python',
      code: `Clock = dict[str, int]                      # coordinator node -> counter

def descends(a: Clock, b: Clock) -> bool:   # a has seen everything b has
    return all(a.get(n, 0) >= c for n, c in b.items())

def bump(clock: Clock, node: str) -> Clock: # the coordinator of a write increments its entry
    return {**clock, node: clock.get(node, 0) + 1}

def reconcile(replies):
    """[(clock, value)] from R replicas -> surviving siblings (ancestors dropped)."""
    sibs = []
    for clock, val in replies:
        if any(descends(c, clock) for c, _ in sibs):
            continue                                      # already covered by a sibling
        sibs = [(c, v) for c, v in sibs if not descends(clock, c)]
        sibs.append((clock, val))
    return sibs

# The Dynamo paper's example: D3 and D4 both descend from D2 [Sx:2]
d2 = bump(bump({}, "Sx"), "Sx")                           # {'Sx': 2}
d3 = bump(d2, "Sy")                                       # +book via node Sy
d4 = bump(d2, "Sz")                                       # +pen  via node Sz
sibs = reconcile([(d2, {"a"}), (d3, {"a", "book"}), (d4, {"a", "pen"})])
assert len(sibs) == 2                                     # concurrent: app must merge

merged = set().union(*(v for _, v in sibs))               # cart semantics: union
d5 = bump({n: max(c.get(n, 0) for c, _ in sibs) for c0, _ in sibs for n in c0}, "Sx")
print(sorted(merged), d5)   # ['a', 'book', 'pen'] {'Sx': 3, 'Sy': 1, 'Sz': 1}`
    }
  ],

  related: ['distributed-cache', 'distributed-sql', 'object-storage', 'lock-manager', 'unique-id', 'message-queue']
});
