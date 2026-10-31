SD.register({
  slug: 'unique-id',
  domain: 6,
  title: 'Unique ID Generator',
  examples: 'Twitter Snowflake, Instagram',
  tagline: 'Hand out <b>millions of unique, roughly time-ordered 64-bit IDs per second</b> from many machines, with no coordination on the hot path.',
  tldr: {
    problem: 'A sharded system cannot use one database\'s <code>AUTO_INCREMENT</code>. Random UUIDs are unique but 128-bit, unordered and hard on B-tree indexes.',
    idea: 'Pack <b>time | worker id | sequence</b> into one 64-bit integer. Each worker owns its id, so it can mint IDs from its own clock and counter <b>without talking to anyone</b>.',
    insight: 'Uniqueness rests on two promises: <b>no two live workers share an id</b>, and <b>a worker\'s clock never goes backwards</b>. Most of the design is about keeping those promises.',
    numbers: [
      { v: '41 · 10 · 12', l: 'Snowflake bits: ms time · machine · sequence (Twitter README)' },
      { v: '4,096', l: 'IDs per ms per worker with a 12-bit sequence' },
      { v: '~69 yrs', l: 'life of a 41-bit ms timestamp (2^41 ms)' }
    ]
  },

  intro: {
    what: 'A unique ID generator hands out <b>numbers that are never repeated</b>, to label things like orders, messages or posts. In a large system, many machines need new IDs at the same time. The generator lets each of them create IDs on its own, while still guaranteeing no two are ever the same and that newer IDs are roughly larger.',
    analogy: {
      icon: '🎟️',
      title: 'Ticket numbers stamped with the time and the booth',
      text: 'A stadium has many ticket booths. Instead of phoning a central office for every ticket number, each booth stamps tickets with <b>the current time, its own booth number and a counter</b> that resets every second. Two booths can never print the same ticket, because their booth numbers differ, and sorting tickets roughly sorts them by time. It works only if no two booths share a number and no booth\'s clock runs backwards.'
    },
    problem: 'An online shop splits its orders across many database servers. Each server can count its own rows, but two of them would both hand out order number 1001. Every order, message and log line needs an ID <b>the moment it is created</b>, millions of times per second. The question is: <b>how do many machines create IDs that never clash, without asking each other first?</b>',
    story: [
      {
        stage: 'naive',
        title: 'One central counter',
        text: 'Keep a single database with an <b>auto-increment</b> counter: 1, 2, 3 and so on. Every server asks it for the next number before saving a row. IDs are small, unique and perfectly ordered. It works while there is one database and modest traffic.',
        scene: {
          nodes: [
            { id: 'app', label: 'Order server', sub: 'needs an ID', kind: 'client', at: [70, 0] },
            { id: 'app2', label: 'Chat server', sub: 'needs an ID', kind: 'client', at: [350, 0] },
            { id: 'ctr', label: 'Counter DB', sub: 'next = 1, 2, 3…', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'app', to: 'ctr' }, { from: 'app2', to: 'ctr' }],
          flow: [['app>ctr', 'app2>ctr']]
        }
      },
      {
        stage: 'breaks',
        title: 'The counter becomes a bottleneck',
        text: 'Every ID now costs a network round trip to one machine. At millions per second it cannot keep up, and if it goes down <b>nobody can create anything</b>. Random 128-bit <b>UUIDs</b> avoid the counter, but they are twice as big and land in random places in the database index, which slows inserts.',
        scene: {
          nodes: [
            { id: 'app', label: 'Order servers', sub: 'waiting', kind: 'client', at: [70, 0] },
            { id: 'app2', label: 'Chat servers', sub: 'waiting', kind: 'client', at: [350, 0] },
            { id: 'ctr', label: 'Counter DB', sub: 'one machine', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'app', to: 'ctr' }, { from: 'app2', to: 'ctr' }],
          flow: [['app>ctr', 'app2>ctr'], ['app>ctr', 'app2>ctr']],
          err: ['ctr'],
          warn: ['app', 'app2'],
          badges: { ctr: ['overloaded', 'err'], app: ['slow ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Pack time, worker and counter into 64 bits',
        text: 'Each generator builds an ID from three parts: <b>the time in milliseconds</b>, its own <b>worker number</b>, and a small <b>sequence</b> counter for IDs in the same millisecond. A coordinator hands out worker numbers once, at startup, so there is no network call per ID. Because time comes first, IDs sort roughly by creation time.',
        scene: {
          nodes: [
            { id: 'app', label: 'Services', sub: 'need IDs', kind: 'client', at: [210, 0] },
            { id: 'gen1', label: 'Worker 1', sub: 'time | 1 | seq', kind: 'service', at: [70, 110] },
            { id: 'gen2', label: 'Worker 2', sub: 'time | 2 | seq', kind: 'service', at: [210, 110] },
            { id: 'gen3', label: 'Worker 3', sub: 'time | 3 | seq', kind: 'service', at: [350, 110] },
            { id: 'zk', label: 'Coordinator', sub: 'leases worker #', kind: 'store', at: [70, 220] },
            { id: 'ntp', label: 'Clock sync', sub: 'never step back', kind: 'external', at: [350, 220] }
          ],
          edges: [{ from: 'app', to: 'gen1' }, { from: 'app', to: 'gen2' }, { from: 'app', to: 'gen3' }, { from: 'zk', to: 'gen1', dashed: true }, { from: 'ntp', to: 'gen3', dashed: true }],
          flow: ['zk>gen1', ['app>gen1', 'app>gen2', 'app>gen3']],
          ok: ['gen1', 'gen2', 'gen3'],
          badges: { gen2: ['no waiting', 'ok'] }
        }
      }
    ],
    usedBy: ['Twitter / X tweet IDs (Snowflake)', 'Discord message IDs', 'Instagram photo IDs', 'Sony\'s Sonyflake', 'Flickr ticket servers', 'UUIDv7 in PostgreSQL 18'],
    whenToUse: [
      'Many machines or database shards must create IDs <b>at the same time</b>',
      'You want IDs that fit in a 64-bit integer and sort roughly by time',
      'Asking a central service for every ID would be too slow or too fragile'
    ],
    whenNot: [
      'One database is enough: its built-in auto-increment is simpler',
      'The ID must be secret or unguessable, like a session token: use a random 128-bit value',
      'You need short, human-friendly codes for links (see <a href="url-shortener.html">URL Shortener</a>)'
    ],
    glossary: [
      { term: 'Primary key', def: 'The column that uniquely identifies each row in a database table, often the ID itself.' },
      { term: 'UUID', def: 'A 128-bit identifier; version 4 is random, version 7 starts with a timestamp so it sorts by time.' },
      { term: 'Snowflake ID', def: 'Twitter\'s 64-bit layout: a millisecond timestamp, then a worker number, then a per-millisecond sequence.' },
      { term: 'Epoch', def: 'The starting moment from which the timestamp part of an ID is counted, chosen by each system.' },
      { term: 'Worker id', def: 'A number unique to each generator process, so two generators can never produce the same ID.' },
      { term: 'Sequence', def: 'A small counter that numbers the IDs one worker makes within the same millisecond, then resets.' },
      { term: 'K-sorted', def: 'Almost in order: IDs from different machines may be out of order by roughly the difference between their clocks.' },
      { term: 'Lease', def: 'A claim on a resource, here a worker id, that expires unless it is renewed, so a dead process frees its id.' }
    ]
  },

  requirements: {
    functional: [
      'Return a new ID on every call (single or batch)',
      'IDs are unique across all machines and datacenters',
      'IDs sort roughly by creation time',
      'Decode an ID back to its creation time',
      'Fit in a 64-bit signed integer',
      'Work as a service or as an embedded library'
    ],
    nonFunctional: [
      'No coordination per ID (no locks, no DB round-trip)',
      'Latency in microseconds in-process, ~ms over the network',
      'Millions of IDs/s across the cluster',
      'Survive the loss of any generator',
      'Tolerate small clock adjustments safely',
      'Last decades before the time bits run out'
    ],
    outOfScope: ['Strict global ordering (needs one sequencer)', 'Secret or unguessable tokens (use random 128-bit)', 'Human-friendly short codes (see URL Shortener)']
  },

  calculator: {
    inputs: [
      { id: 'peak', label: 'Peak IDs per second (whole system)', min: 1000, max: 100000000, value: 2000000, log: true },
      { id: 'workers', label: 'Generator processes running', min: 1, max: 4096, value: 32, log: true },
      { id: 'wbits', label: 'Worker-id bits', min: 4, max: 16, value: 10, unit: 'bits' },
      { id: 'sbits', label: 'Sequence bits', min: 6, max: 16, value: 12, unit: 'bits' },
      { id: 'rows', label: 'Rows in your biggest table', min: 100000000, max: 1000000000000, value: 10000000000, log: true }
    ],
    outputs: [
      { label: 'Max IDs/s from one worker', f: (v) => Math.pow(2, v.sbits) * 1000 },
      { label: 'Cluster ceiling (usable workers × per-worker)', f: (v) => Math.min(v.workers, Math.pow(2, v.wbits)) * Math.pow(2, v.sbits) * 1000 },
      { label: 'Headroom over peak', fmt: 'raw', f: (v) => { const c = Math.min(v.workers, Math.pow(2, v.wbits)) * Math.pow(2, v.sbits) * 1000; return (c / v.peak).toFixed(c / v.peak >= 10 ? 0 : 1) + '×'; } },
      { label: 'Timestamp bits left (63 − worker − seq)', fmt: 'raw', f: (v) => (63 - v.wbits - v.sbits) + ' bits' },
      { label: 'Lifetime of ms timestamp from epoch', fmt: 'raw', f: (v) => { const y = Math.pow(2, 63 - v.wbits - v.sbits) / 3.15576e10; return y >= 1 ? y.toFixed(y >= 100 ? 0 : 1) + ' years' : (y * 365.25).toFixed(0) + ' days'; } },
      { label: 'PK bytes saved vs 128-bit UUID', fmt: 'bytes', f: (v) => v.rows * 8 }
    ],
    note: 'Bit math is exact. The ceiling assumes every worker runs flat out, which real traffic never does. Workers beyond <code>2^workerBits</code> cannot get a unique id. "Bytes saved" counts the primary-key column only. Foreign keys that point at it save the same again.'
  },

  api: [
    { m: 'RPC', p: 'IdService.next() → int64', d: 'One ID. Over the network this costs about as much as the RPC itself, so most callers batch or embed the generator.' },
    { m: 'RPC', p: 'IdService.nextBatch(n) → int64[]', d: 'Reserve up to the remaining sequence for this millisecond. This cuts per-ID RPC overhead.' },
    { m: 'GET', p: '/v1/ids/{id}/decode', d: 'Returns <code>{timestamp, worker, sequence}</code>. Useful for debugging and for time-range queries on the ID itself.' },
    { m: 'RPC', p: 'etcd: LeaseGrant + Put /workers/{n}', d: 'At startup a generator claims a free worker id with a TTL lease and keeps it alive. If the lease is lost, it must stop issuing IDs.' },
    { m: 'SQL', p: 'DEFAULT next_id() / uuidv7()', d: 'Generate inside the database instead: Instagram-style PL/pgSQL per shard, or <code>uuidv7()</code> built into Postgres 18.' }
  ],
  dataModel: [
    { name: 'snowflake_id (64 bits)', store: 'bit layout', fields: [['sign', '1 bit = 0'], ['timestamp', '41 bits ms since epoch', 'pk'], ['worker_id', '10 bits (0–1023)', 'idx'], ['sequence', '12 bits (0–4095)']], note: 'Sort order is timestamp first, so IDs sort by time across workers to within the clock skew between them.' },
    { name: 'worker_registry', store: 'etcd / ZooKeeper', fields: [['/ids/workers/{n}', 'key', 'pk'], ['owner', 'pod / host'], ['lease', 'TTL ~10 s'], ['last_ts', 'ms (optional)']], note: 'An ephemeral key per worker id. It disappears when the owner dies, so the id can be reused only after the owner is gone.' },
    { name: 'orders', store: 'Postgres', fields: [['id', 'bigint', 'pk'], ['customer_id', 'bigint', 'fk'], ['created_at', 'timestamptz'], ['total', 'numeric']], note: 'New IDs are always the largest, so inserts land on the rightmost B-tree leaf, which stays hot in cache.' }
  ],

  architecture: {
    title: 'Snowflake-style ID generation',
    nodes: [
      { id: 'app', label: 'App service', sub: 'needs a new ID', kind: 'client', wide: [90, 215], tall: [70, 0], tip: 'Any service creating a row, message or event. It calls the ID service, or embeds the generator as a library.' },
      { id: 'lb', label: 'ID service', sub: 'gRPC · any worker', kind: 'edge', wide: [290, 215], tall: [210, 105], tip: 'A thin client-side load balancer. Any worker can answer, because each one mints IDs independently.' },
      { id: 'gen1', label: 'ID worker 1', sub: 'worker_id = 1', kind: 'service', wide: [500, 100], tall: [70, 210], tip: 'Keeps last_ts and sequence in memory. id = (ts − epoch) << 22 | worker << 12 | seq.' },
      { id: 'gen2', label: 'ID worker 2', sub: 'worker_id = 2', kind: 'service', wide: [500, 215], tall: [210, 210], tip: 'Same code with a different worker id. No shared state with worker 1.' },
      { id: 'gen3', label: 'ID worker 3', sub: 'worker_id = 3', kind: 'service', wide: [500, 330], tall: [350, 210], tip: 'Same code with a different worker id. Add workers to scale linearly, up to 2^workerBits.' },
      { id: 'zk', label: 'Coordinator', sub: 'etcd/ZK worker leases', kind: 'store', wide: [730, 100], tall: [105, 315], tip: 'Used only at startup and for lease keep-alives: it hands out unique worker ids. It is never on the per-ID path.' },
      { id: 'ntp', label: 'Time source', sub: 'NTP / chrony (slew)', kind: 'external', wide: [730, 330], tall: [315, 315], tip: 'Keeps clocks close. Configure it to slew (speed up or slow down) instead of stepping the clock backwards.' },
      { id: 'db', label: 'Sharded DB', sub: 'PK = id (B-tree)', kind: 'store', wide: [90, 380], tall: [350, 0], tip: 'Rows keyed by the 64-bit id. Time-ordered keys append to the right edge of the index.' },
      { id: 'rd', label: 'Readers', sub: 'ORDER BY id DESC', kind: 'client', wide: [290, 380], tall: [350, 105], tip: 'Timelines and feeds can paginate by id (WHERE id < cursor) and get time order without a separate created_at index.' }
    ],
    edges: [
      { from: 'app', to: 'lb', bidi: true },
      { from: 'lb', to: 'gen1' },
      { from: 'lb', to: 'gen2' },
      { from: 'lb', to: 'gen3' },
      { from: 'zk', to: 'gen1', dashed: true },
      { from: 'zk', to: 'gen2', dashed: true },
      { from: 'ntp', to: 'gen2', dashed: true },
      { from: 'ntp', to: 'gen3', dashed: true },
      { from: 'app', to: 'db' },
      { from: 'rd', to: 'db' }
    ]
  },

  scenarios: [
    {
      id: 'gen', title: 'Mint an ID (happy path)', tone: 'info',
      steps: [
        { text: 'The order service needs a primary key <i>before</i> it writes, so it can also put the id in events and logs. It asks the ID service.', flow: ['app>lb', 'lb>gen2'] },
        { text: 'Worker 2 reads its clock: <code>ts = now − epoch</code>. Same millisecond as the last ID? Then <code>seq++</code>. New millisecond? <code>seq = 0</code>.', nodes: ['gen2'], badges: { gen2: 'ts · seq 0' } },
        { text: 'It packs <code>ts &lt;&lt; 22 | 2 &lt;&lt; 12 | seq</code> and returns it. There is no lock, no disk and no network call, so this takes microseconds.', flow: ['gen2>lb', 'lb>app'], badges: { app: 'id 1849…' }, tone: 'ok' },
        { text: 'The row is inserted with that id. Because new IDs are bigger than old ones, inserts append to the <b>rightmost B-tree page</b>, which stays in cache.', flow: ['app>db'], badges: { db: 'append' }, tone: 'ok' },
        { text: 'Readers page with <code>WHERE id &lt; :cursor ORDER BY id DESC</code>. That gives time order for free, accurate to within the clock skew between workers.', flow: ['rd>db'], badges: { rd: 'k-sorted' } }
      ]
    },
    {
      id: 'burst', title: '4,096 IDs in one millisecond', tone: 'warn',
      steps: [
        { text: 'Flash sale. One worker gets more than 4,096 ID requests inside the same millisecond.', flow: [['app>lb', 'lb>gen1']], warn: ['gen1'], badges: { gen1: ['10K req / ms', 'warn'] }, tone: 'warn' },
        { text: 'The 12-bit sequence runs 0 → 4095. The next increment wraps to 0. Reusing (ts, worker, 0) would create a <b>duplicate</b>, so the worker must not.', nodes: ['gen1'], warn: ['gen1'], badges: { gen1: ['seq = 4095', 'warn'] } },
        { text: '<b>Wait for the next millisecond</b> (spin until the clock ticks), then restart at seq 0. The wait is under 1 ms, and the hard ceiling is 4.096M IDs/s per worker.', nodes: ['gen1'], ok: ['gen1'], badges: { gen1: ['next ms', 'ok'] } },
        { text: 'The load balancer spreads the rest of the burst. Each worker has its own 4,096/ms budget, so <b>capacity scales with the number of workers</b> (up to 1,024 with 10 bits).', flow: [['lb>gen1', 'lb>gen2', 'lb>gen3']], ok: ['gen1', 'gen2', 'gen3'], tone: 'ok' }
      ]
    },
    {
      id: 'clock', title: 'Clock jumps backwards', tone: 'err',
      steps: [
        { text: 'A misconfigured NTP daemon <b>steps</b> worker 3\'s clock back by 40 ms. A VM migration or a manual <code>date</code> change can do the same.', flow: ['ntp>gen3'], warn: ['gen3'], badges: { gen3: ['clock −40 ms', 'warn'] }, tone: 'warn' },
        { text: 'Now <code>now &lt; last_ts</code>. If the worker kept going it would replay timestamps it has already used and could <b>re-issue the same IDs</b>.', nodes: ['gen3'], err: ['gen3'], badges: { gen3: ['now < last_ts', 'err'] }, tone: 'err' },
        { text: 'Twitter\'s rule: <b>refuse to generate</b> until the clock passes <code>last_ts</code>. A few ms: wait. More than that: return an error and alert. The client retries on another worker.', flow: ['lb>gen3', 'lb>gen1'], err: ['gen3'], ok: ['gen1'], badges: { gen1: ['retry ok', 'ok'] } },
        { text: 'The fix is operational: run NTP in <b>slew-only</b> mode, alarm on clock offset, and pull a worker out of rotation after a big jump. Persisting <code>last_ts</code> also guards restarts.', nodes: ['ntp', 'gen3'], ok: ['gen3'], tone: 'ok' }
      ]
    },
    {
      id: 'collide', title: 'Two workers share an id', tone: 'err',
      steps: [
        { text: 'A deploy copies a static config. Workers 1 and 2 both start with <code>worker_id = 7</code>.', nodes: ['gen1', 'gen2'], warn: ['gen1', 'gen2'], labels: { gen1: { sub: 'worker_id = 7' }, gen2: { sub: 'worker_id = 7' } }, badges: { gen1: ['id 7', 'warn'], gen2: ['id 7', 'warn'] }, tone: 'warn' },
        { text: 'In the same ms with the same seq they produce <b>identical IDs</b>. In SQL that is a primary-key violation, which is the lucky case. In a key-value store it is a <b>silent overwrite</b>.', flow: [['lb>gen1', 'lb>gen2'], 'app>db'], err: ['db', 'gen1', 'gen2'], labels: { gen1: { sub: 'worker_id = 7' }, gen2: { sub: 'worker_id = 7' } }, badges: { db: ['duplicate PK', 'err'] }, tone: 'err' },
        { text: 'Fix: each worker <b>leases</b> a free id from etcd/ZooKeeper (an ephemeral node or a key with a TTL) at startup and keeps the lease alive. If it loses the lease, it stops serving.', flow: [['zk>gen1', 'zk>gen2']], ok: ['gen1', 'gen2'], badges: { gen1: ['lease 7', 'ok'], gen2: ['lease 8', 'ok'] }, tone: 'ok' },
        { text: 'Coordination-free alternatives: derive the id from something already unique, such as the <b>DB shard</b> (Instagram) or the <b>low 16 bits of the private IP</b> (Sonyflake\'s default).', nodes: ['zk', 'db'], ok: ['db'] }
      ]
    },
    {
      id: 'insta', title: 'Instagram: IDs inside Postgres', tone: 'ok',
      steps: [
        { text: 'There is no ID service at all. Each <b>logical shard</b> is a Postgres schema with its own sequence and a PL/pgSQL <code>next_id()</code> used as the column DEFAULT.', flow: ['app>db'], hidden: ['lb', 'gen1', 'gen2', 'gen3', 'zk'], labels: { db: { label: 'Postgres shard', sub: 'DEFAULT next_id()' } } },
        { text: '<code>id = (now_ms − epoch) &lt;&lt; 23 | shard_id &lt;&lt; 10 | nextval % 1024</code>. That is 41 bits of time, 13 bits of shard (8,192 logical shards) and 10 bits of sequence.', nodes: ['db'], hidden: ['lb', 'gen1', 'gen2', 'gen3', 'zk'], labels: { db: { label: 'Postgres shard', sub: '41 | 13 | 10' } }, badges: { db: '1,024 / ms / shard' } },
        { text: 'The <b>shard id travels inside the ID</b>. Given only a photo id, the app knows which shard holds it, with no lookup table.', flow: ['rd>db'], hidden: ['lb', 'gen1', 'gen2', 'gen3', 'zk'], labels: { db: { label: 'Postgres shard', sub: 'route by id bits' } }, ok: ['db'], tone: 'ok' },
        { text: 'Trade-off: the ID is tied to the DB host\'s clock, and more than 1,024 inserts per ms on one shard would wrap the sequence. That was fine for Instagram\'s write rate per shard.', nodes: ['db', 'ntp'], hidden: ['lb', 'gen1', 'gen2', 'gen3', 'zk'], labels: { db: { label: 'Postgres shard', sub: 'DB clock' } }, warn: ['ntp'] }
      ]
    }
  ],

  knobs: {
    intro: 'Pick an ID format and a bit layout. Watch which components exist, what the request path looks like, and how the meters change.',
    diagram: null, // built below: architecture + embedded library + ticket servers
    controls: [
      { id: 'fmt', label: 'ID format', type: 'seg', value: 'snow', options: [
        { v: 'uuid4', l: 'UUIDv4' }, { v: 'uuid7', l: 'UUIDv7' }, { v: 'ulid', l: 'ULID' }, { v: 'snow', l: 'Snowflake' }, { v: 'insta', l: 'Instagram (PL/pgSQL)' }, { v: 'ticket', l: 'Ticket server' }] },
      { id: 'wbits', label: 'Worker / shard bits (64-bit layouts)', type: 'range', min: 4, max: 16, step: 1, value: 10, unit: 'bits' },
      { id: 'sbits', label: 'Sequence bits (64-bit layouts)', type: 'range', min: 6, max: 16, step: 1, value: 12, unit: 'bits' },
      { id: 'rate', label: 'Peak IDs per second', type: 'range', min: 3, max: 8, step: 0.5, value: 6, fmt: (v) => SD.fmt.num(Math.pow(10, v)) + '/s' }
    ],
    evaluate(s) {
      const rate = Math.pow(10, s.rate);
      const tsBits = 63 - s.wbits - s.sbits;
      const years = Math.pow(2, tsBits) / 3.15576e10;
      const perWorker = Math.pow(2, s.sbits) * 1000;
      const maxWorkers = Math.pow(2, s.wbits);
      const needWorkers = Math.ceil(rate / perWorker);
      const yrs = (y) => (y >= 1000 ? SD.fmt.num(y) : y >= 1 ? y.toFixed(y >= 100 ? 0 : 1) : (y * 365.25).toFixed(0) + ' d').toString() + (y >= 1 ? ' yrs' : '');
      const is64 = s.fmt === 'snow' || s.fmt === 'insta';
      const F = {
        uuid4: { size: '128-bit (16 B)', ss: 0.5, ord: 'none (random)', so: 0.1, coord: 'none', sc: 1, cap: 'CPU-bound (millions/s per core)', scap: 0.95, life: 'no time field', sl: 1, loc: 'random leaf: page splits, cache misses', slo: 0.2, risk: 'collision ≈ n² / 2^123: negligible', sr: 0.9 },
        uuid7: { size: '128-bit (16 B)', ss: 0.55, ord: 'ms (48-bit unix time)', so: 0.85, coord: 'none', sc: 1, cap: 'CPU-bound (millions/s per core)', scap: 0.95, life: '2^48 ms ≈ 8,900 yrs', sl: 1, loc: 'append at right edge', slo: 0.85, risk: 'clock drift only affects ordering', sr: 0.9 },
        ulid: { size: '128-bit (26-char text)', ss: 0.45, ord: 'ms (48-bit unix time)', so: 0.85, coord: 'none', sc: 1, cap: 'CPU-bound (millions/s per core)', scap: 0.95, life: '2^48 ms ≈ 8,900 yrs', sl: 1, loc: 'append (if stored as uuid, not text)', slo: 0.75, risk: 'clock drift only affects ordering', sr: 0.88 },
        snow: { size: '64-bit (8 B)', ss: 0.95, ord: 'ms, k-sorted across workers', so: 0.8, coord: 'worker-id lease at startup', sc: 0.75, life: yrs(years), sl: years >= 40 ? 0.9 : years >= 15 ? 0.55 : 0.15, loc: 'append at right edge', slo: 0.9, risk: 'clock rollback, id reuse', sr: 0.65 },
        insta: { size: '64-bit (8 B)', ss: 0.95, ord: 'ms, k-sorted across shards', so: 0.8, coord: 'none (shard id = worker id)', sc: 0.9, life: yrs(years), sl: years >= 40 ? 0.9 : years >= 15 ? 0.55 : 0.15, loc: 'append at right edge', slo: 0.9, risk: 'DB host clock; seq wraps over 2^seq/ms', sr: 0.65 },
        ticket: { size: '64-bit (8 B)', ss: 0.95, ord: 'per-server monotonic, no timestamp', so: 0.55, coord: 'DB round-trip per ID (or block)', sc: 0.3, life: '2^63 values', sl: 1, loc: 'append (interleaved odd/even)', slo: 0.8, risk: 'ticket DB is a single point of failure', sr: 0.4 }
      }[s.fmt];
      let capV = F.cap, capS = F.scap, over = false;
      if (is64) {
        over = needWorkers > maxWorkers;
        capV = SD.fmt.num(perWorker) + '/s per ' + (s.fmt === 'insta' ? 'shard' : 'worker') + ' → need ' + needWorkers + ' of ' + SD.fmt.num(maxWorkers);
        capS = over ? 0.1 : needWorkers > maxWorkers / 2 ? 0.5 : 0.9;
      } else if (s.fmt === 'ticket') {
        const cap = 2 * 5000; // two MySQL ticket servers, ~5K single-row writes/s each (estimate)
        over = rate > cap;
        capV = '~10K/s from 2 servers (est.)' + (over ? ', batch blocks of IDs' : '');
        capS = over ? 0.15 : rate > cap / 2 ? 0.5 : 0.8;
      }
      const metrics = [
        { k: 'Size / key width', v: F.size, s: F.ss },
        { k: 'Time-ordered', v: F.ord, s: F.so },
        { k: 'Coordination', v: F.coord, s: F.sc },
        { k: 'Capacity vs peak', v: capV, s: capS, hint: SD.fmt.num(rate) + '/s' },
        { k: 'Lifetime', v: F.life, s: is64 ? F.sl : 0.95 },
        { k: 'B-tree insert locality', v: F.loc, s: F.slo },
        { k: 'Main risk', v: F.risk, s: F.sr }
      ];
      const notes = [];
      if (s.fmt === 'uuid4') notes.push('Random keys scatter inserts across the whole index. Once the index is bigger than RAM, almost every insert reads a cold page, and Postgres writes more full-page images to WAL.');
      if (s.fmt === 'uuid7') notes.push('UUIDv7 (RFC 9562, 2024) puts a 48-bit ms timestamp first, so it is time-ordered with no coordinator. Postgres 18 added <code>uuidv7()</code>.');
      if (s.fmt === 'ulid') notes.push('ULID has the same idea as UUIDv7 (48-bit ms + 80 random bits) and predates the RFC. Store it as a 16-byte <code>uuid</code>, not as 26 characters of text.');
      if (s.fmt === 'snow') notes.push('Twitter\'s layout is 41 | 10 | 12. Slide the bits: every bit you give to workers or sequence halves the lifetime of the timestamp.');
      if (s.fmt === 'insta') notes.push('Instagram used 41 | 13 | 10 and generated IDs in PL/pgSQL on each logical shard, so the shard id doubles as the worker id and no coordinator is needed.');
      if (s.fmt === 'ticket') notes.push('Flickr (2010) ran two MySQL ticket servers, one handing out odd and one even numbers, using <code>REPLACE INTO</code> on a one-row table. It is simple but adds a network round-trip per ID unless clients reserve blocks.');
      if (is64 && years < 30) notes.push('Only ' + tsBits + ' timestamp bits are left: about ' + yrs(years) + ' from your epoch. Pick a recent custom epoch and keep at least ~40 bits.');
      if (is64 && over) notes.push('At ' + SD.fmt.num(rate) + '/s you need ' + needWorkers + ' workers but the layout only allows ' + SD.fmt.num(maxWorkers) + '. Add sequence or worker bits.');
      let verdict;
      if (is64 && years < 10) verdict = '❌ <b>The timestamp field is too small.</b> IDs would wrap within ' + yrs(years) + '.';
      else if (over) verdict = '❌ <b>Over capacity.</b> The layout cannot mint ' + SD.fmt.num(rate) + ' IDs/s.';
      else if (s.fmt === 'uuid4') verdict = '⚠ <b>Unique but unordered and 16 bytes.</b> Fine for low-volume tables or public tokens, but a poor clustered primary key at scale.';
      else if (s.fmt === 'ticket') verdict = '⚠ <b>Works, but every ID needs the database.</b> Good for a modest number of shards, and it becomes a bottleneck at high rates.';
      else if (s.fmt === 'snow' && s.wbits === 10 && s.sbits === 12) verdict = '✅ <b>Twitter Snowflake:</b> 64-bit, time-sortable, about 69 years of range, 4,096 IDs/ms per worker and 1,024 workers.';
      else if (is64) verdict = '👍 <b>Compact and time-sortable.</b> Check the lifetime and capacity meters for your bit split.';
      else verdict = '👍 <b>No coordination at all, and still time-ordered.</b> A strong default if 16-byte keys are acceptable.';
      const labelSub = s.wbits + ' w · ' + s.sbits + ' seq · ' + tsBits + ' ts';
      const hideAll = ['lb', 'gen1', 'gen2', 'gen3', 'zk', 'tkt1', 'tkt2'];
      let hide, flow, labels = {};
      if (s.fmt === 'uuid4' || s.fmt === 'uuid7' || s.fmt === 'ulid') {
        hide = hideAll.concat(s.fmt === 'uuid4' ? ['ntp'] : []);
        flow = ['app>lib', 'app>db', 'rd>db'];
        labels.lib = { label: 'In-process lib', sub: { uuid4: '122 random bits', uuid7: 'uuidv7(): 48-bit ms', ulid: 'ULID: 48-bit ms' }[s.fmt] };
      } else if (s.fmt === 'snow') {
        hide = ['lib', 'tkt1', 'tkt2'];
        flow = ['app>lb', 'lb>gen2', 'app>db'];
        ['gen1', 'gen2', 'gen3'].forEach((g) => { labels[g] = { sub: labelSub }; });
      } else if (s.fmt === 'insta') {
        hide = hideAll.concat(['lib']);
        flow = ['app>db', 'rd>db'];
        labels.db = { label: 'Postgres shards', sub: 'next_id() PL/pgSQL' };
      } else {
        hide = ['gen1', 'gen2', 'gen3', 'zk', 'ntp', 'lib'];
        flow = ['app>lb', ['lb>tkt1', 'lb>tkt2'], 'app>db'];
        labels.lb = { label: 'Ticket client', sub: 'round-robin odd/even' };
      }
      return {
        metrics, verdict, notes, labels, flow, hide,
        hot: s.fmt === 'insta' ? ['db'] : [],
        warn: over ? (s.fmt === 'ticket' ? ['tkt1', 'tkt2'] : ['gen1', 'gen2', 'gen3']) : [],
        badges: is64 ? { [s.fmt === 'insta' ? 'db' : 'gen2']: [SD.fmt.num(perWorker) + '/s each', over ? 'err' : 'info'] } : {}
      };
    }
  },

  widget: {
    title: '64-bit Snowflake: generate and decode',
    caption: 'Real BigInt bit packing. Choose a layout (Twitter, Discord, Instagram, Sonyflake), press <b>Generate</b>, and see every bit and field. Try <b>Burst</b> to exhaust the sequence inside one tick, or <b>Clock −2 s</b> to see the generator refuse. Paste any ID to decode it.'
  },

  realWorld: {
    intro: 'Most large companies converged on the same trick: put time in the high bits and a per-node id in the middle.',
    timeline: [
      { when: 'Feb 2010', who: 'Flickr', title: 'Ticket servers', text: 'Two MySQL servers hand out IDs from a one-row table with <code>REPLACE INTO</code>. One is configured for odd numbers and one for even (<code>auto-increment-increment = 2</code>). Flickr rejected GUIDs because they are big and index badly in MySQL.', src: 6 },
      { when: 'Jun 2010', who: 'Twitter', title: 'Snowflake announced', text: 'Ryan King\'s post introduced Snowflake, a network service that issues uncoordinated, roughly time-ordered 64-bit IDs for tweets.', src: 0 },
      { when: '2010', who: 'Twitter', title: 'Snowflake design goals', text: 'Tweets were moving from MySQL to Cassandra, which has no sequential ID facility. The README lists <b>41 bits</b> of ms timestamp with a custom epoch, a <b>10-bit</b> machine id and a <b>12-bit</b> sequence. The targets were at least <b>10K IDs/s per process</b> with about <b>2 ms</b> response time. If the clock moves backwards it <b>refuses to generate</b> until time catches up.', src: 1 },
      { when: 'Nov 2010', who: 'Twitter', title: 'Tweet IDs switch over', text: 'Snowflake tweet IDs went live after a delayed rollout. The default epoch, <code>1288834974657</code>, falls on 4 Nov 2010.', src: 2 },
      { when: 'Sep 2011', who: 'Instagram', title: 'IDs generated in PL/pgSQL', text: 'Instagram used <b>41 bits</b> of time, <b>13 bits</b> of logical shard id and a <b>10-bit</b> sequence (<code>nextval % 1024</code>), generated by a function in each shard\'s schema. The post\'s code counts from a custom 2011 epoch (<code>our_epoch = 1314220021721</code>). That gives 1,024 IDs per shard per ms with no extra service.', src: 3 },
      { when: '2015 epoch', who: 'Discord', title: 'Snowflakes from 2015', text: 'Discord uses a 42-bit timestamp from its own epoch (1 Jan 2015), then a 5-bit worker, 5-bit process and 12-bit increment. <code>(id &gt;&gt; 22) + 1420070400000</code> gives the creation time.', src: 4 },
      { when: '2014 epoch', who: 'Sony', title: 'Sonyflake: 10 ms ticks', text: 'Sonyflake trades per-node speed for range: <b>39 bits</b> of time in 10 ms units (about 174 years), an <b>8-bit</b> sequence (256 IDs per 10 ms per machine) and a <b>16-bit</b> machine id, by default the low 16 bits of the private IP. Version 1 counts from 1 Sep 2014; v2 moved the default start to 1 Jan 2025.', src: 5 },
      { when: 'May 2024', who: 'IETF', title: 'RFC 9562: UUIDv7', text: 'The new UUID RFC obsoletes RFC 4122 and adds <b>UUIDv7</b>: a 48-bit Unix-ms timestamp, then version, variant and random bits. You get time ordering with no coordination, at 128 bits.', src: 7 },
      { when: 'Sep 2025', who: 'PostgreSQL', title: 'uuidv7() built in', text: 'PostgreSQL 18 ships a native <code>uuidv7()</code> function, and <code>uuid_extract_timestamp()</code> understands version 7.', src: 8 }
    ],
    lessons: [
      'Put <b>time in the high bits</b>. Sorting, range scans and B-tree locality then come for free.',
      'Uniqueness needs a <b>unique node id</b> and a <b>monotonic clock</b>. Guard both explicitly.',
      'Choose a <b>recent custom epoch</b>. Every year before it is wasted range.',
      'If 16-byte keys are acceptable, <b>UUIDv7</b> removes the coordinator entirely.'
    ],
    sources: [
      { title: 'Announcing Snowflake', url: 'https://blog.x.com/engineering/en_us/a/2010/announcing-snowflake', pub: 'Twitter Engineering, Jun 2010' },
      { title: 'twitter-archive/snowflake README', url: 'https://github.com/twitter-archive/snowflake/blob/b3f6a3c6ca8e1b6847baa6ff42bf72201e2c2231/README.mkd', pub: 'GitHub (Twitter)' },
      { title: 'Snowflake ID', url: 'https://en.wikipedia.org/wiki/Snowflake_ID', pub: 'Wikipedia' },
      { title: 'Sharding & IDs at Instagram', url: 'https://instagram-engineering.com/1cf5a71e5a5c', pub: 'Instagram Engineering' },
      { title: 'API Reference: Snowflakes', url: 'https://docs.discord.com/developers/reference', pub: 'Discord Developer Docs' },
      { title: 'sony/sonyflake (v1)', url: 'https://pkg.go.dev/github.com/sony/sonyflake', pub: 'Go package docs' },
      { title: 'Ticket Servers: Distributed Unique Primary Keys on the Cheap', url: 'https://code.flickr.net/2010/02/08/ticket-servers-distributed-unique-primary-keys-on-the-cheap/', pub: 'code.flickr.net, 2010' },
      { title: 'RFC 9562: Universally Unique IDentifiers (UUIDs)', url: 'https://www.rfc-editor.org/info/rfc9562', pub: 'IETF, May 2024' },
      { title: 'UUIDv7 in PostgreSQL 18: what you need to know', url: 'https://www.dbvis.com/thetable/uuidv7-in-postgresql-18-what-you-need-to-know/', pub: 'DbVisualizer blog' },
      { title: 'sony/sonyflake v2', url: 'https://pkg.go.dev/github.com/sony/sonyflake/v2@v2.2.0', pub: 'Go package docs' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Key format', '<b>64-bit Snowflake</b>: 8 B, time-sorted, needs worker ids', '<b>UUIDv7</b>: 16 B, time-sorted, zero coordination', 'Snowflake for huge tables and FK-heavy schemas; UUIDv7 when simplicity wins'],
      ['Random vs ordered', '<b>UUIDv4</b>: unguessable', '<b>Time-ordered</b>: index-friendly, but leaks creation time', 'v4 for public tokens; ordered keys for primary keys'],
      ['Where it runs', '<b>Central ID service</b>: few worker ids, one place to watch clocks', '<b>Embedded library</b>: no RPC, but one worker id per app instance', 'Embed when you have a reliable lease service; centralise when instance counts churn'],
      ['Worker id source', '<b>Lease from etcd/ZK</b>: safe reuse', '<b>Derived</b> (shard id, IP bits): no coordinator', 'Derive only if the source is guaranteed unique'],
      ['Time unit', '<b>1 ms</b> (Snowflake): finer order, 69 yrs in 41 bits', '<b>10 ms</b> (Sonyflake): 174 yrs in 39 bits, 256 IDs per 10 ms', 'Coarser ticks when you need a long life more than per-node throughput'],
      ['DB-generated', '<b>Ticket server</b>: trivial, but a round-trip per ID', '<b>Per-shard function</b> (Instagram): local, no single point of failure', 'Per-shard when you already shard Postgres']
    ]
  },
  failures: [
    { f: 'Clock steps backwards', detect: 'Generator sees now < last_ts; NTP offset alarms', fix: 'Refuse or wait, slew-only NTP, take the node out of rotation after a big jump.' },
    { f: 'Two processes share a worker id', detect: 'Duplicate-key errors; lease conflicts in etcd', fix: 'Lease ids with a TTL and stop serving on lease loss. Never use hand-edited configs.' },
    { f: 'Sequence exhausted in one ms', detect: 'Wait-for-next-ms counter rising', fix: 'Spin to the next ms, add workers, or give the sequence more bits.' },
    { f: 'Timestamp bits run out', detect: 'Years left = (2^bits − (now − epoch)) / ms per year', fix: 'Choose a recent epoch. Plan a format version bit or a migration long before.' },
    { f: 'IDs leak business data', detect: 'Security review: competitors estimate volume from IDs', fix: 'Do not expose sequential ids publicly. Map them to opaque tokens (UUIDv4) at the edge.' },
    { f: 'JavaScript loses precision', detect: 'IDs above 2^53 change after JSON.parse', fix: 'Serialise 64-bit IDs as strings in JSON APIs.' },
    { f: 'Ticket DB down', detect: 'ID RPC errors', fix: 'Two servers (odd/even), clients cache blocks of IDs, then fail over.' }
  ],

  interview: [
    { q: 'Why not just use the database\'s AUTO_INCREMENT?', a: '<p>It is only unique <b>inside one database</b>. With many shards you would need one central sequence, which becomes a bottleneck and a single point of failure, and every insert pays a round-trip to it.</p><p>You also often need the id <i>before</i> the row is written, for example to put it in an event.</p>', lvl: 'core' },
    { q: 'Walk me through the Snowflake bit layout.', a: '<ul><li><b>1 bit</b> sign, always 0, so the value fits a signed long.</li><li><b>41 bits</b> ms since a custom epoch: 2^41 ms ≈ 69.7 years.</li><li><b>10 bits</b> worker id: 1,024 workers. Twitter\'s open-source code split these into a 5-bit datacenter id and a 5-bit worker id.</li><li><b>12 bits</b> sequence: 4,096 IDs per ms per worker, about 4M/s each.</li></ul><p><code>id = (ts − epoch) &lt;&lt; 22 | worker &lt;&lt; 12 | seq</code></p>', lvl: 'core' },
    { q: 'Why 64 bits instead of a 128-bit UUID?', a: '<p>It fits a native <code>bigint</code>, CPU registers and every language\'s long. That halves the primary-key and foreign-key width, so index fan-out is higher and more of the index fits in RAM.</p><p>The cost is that you need unique worker ids. UUIDs need no coordination.</p>', fu: 'When would you pick UUIDv7 anyway? (Small team, many independent writers, 16 B acceptable.)', lvl: 'core' },
    { q: 'What happens when the clock goes backwards?', a: '<p>The generator stores <code>last_ts</code>. If <code>now &lt; last_ts</code>, continuing could reproduce an already-issued (ts, seq) pair, which is a duplicate.</p><p>Twitter\'s generator <b>refuses</b> until time catches up. In practice: wait if the gap is a few ms, otherwise error, alert and route to another worker. Prevent it with slew-only NTP.</p>', lvl: 'core' },
    { q: 'What if a worker needs more than 4,096 IDs in a millisecond?', a: '<p>When the sequence wraps to 0 in the same ms, the worker <b>busy-waits for the next millisecond</b>. So the ceiling is a hard 4.096M/s per worker. Scale by adding workers, or move a bit from the timestamp to the sequence.</p>', lvl: 'core' },
    { q: 'How do you assign worker ids safely?', a: '<p>Use a coordination service: create an <b>ephemeral sequential node</b> in ZooKeeper, or a key with a <b>lease</b> in etcd, and pick the first free id. Keep the lease alive with heartbeats, and <b>stop issuing IDs if it expires</b>.</p><p>When a process restarts it gets a fresh id. Old ids are reused only after their lease has expired.</p>', lvl: 'deep' },
    { q: 'Are Snowflake IDs strictly increasing?', a: '<p>Per worker, yes. Globally they are only <b>k-sorted</b>: two workers whose clocks differ by 5 ms can issue IDs out of order by up to 5 ms.</p><p>Strict global order needs a <b>single sequencer</b> (one counter or a consensus log), which costs throughput and availability.</p>', lvl: 'deep' },
    { q: 'Why is UUIDv4 a poor primary key in Postgres?', a: '<p>Random keys insert into <b>random leaf pages</b> of the B-tree. Once the index outgrows memory, each insert touches a cold page, causing many page splits, more WAL (full-page writes after checkpoints) and a fragmented, larger index.</p><p>Time-ordered keys (Snowflake, UUIDv7) always append to the rightmost leaf.</p>', lvl: 'core' },
    { q: 'How long until the timestamp runs out, and what then?', a: '<p>41 bits of ms is about 69.7 years from the <b>custom epoch</b>. Twitter\'s epoch is in Nov 2010, so it lasts until about 2080. Pick an epoch close to launch.</p><p>Before the end, migrate to a new layout, for example with a version bit or wider IDs.</p>', lvl: 'core' },
    { q: 'How does Instagram\'s scheme differ from Snowflake?', a: '<p>Same idea, different placement: 41 bits time, <b>13 bits logical shard id</b> and 10 bits sequence, generated by a PL/pgSQL function in each shard. The shard id <i>is</i> the worker id, so no coordinator is needed, and the ID tells you which shard owns the row.</p>', lvl: 'deep' },
    { q: 'Any gotchas when sending these IDs to browsers?', a: '<p>JavaScript numbers are doubles and represent integers exactly only up to 2^53. A 63-bit ID silently changes after <code>JSON.parse</code>. Send IDs as <b>strings</b> in JSON, or parse them with <code>BigInt</code>.</p>', lvl: 'core' },
    { q: 'How do you run this across several datacenters?', a: '<p>Give each datacenter its own slice of the worker-id space, for example the top 5 of the 10 bits, as Twitter\'s original code did. Each region leases ids from its <b>own coordinator</b>, so minting never crosses the WAN, and a region cut off from the others keeps issuing IDs.</p><p>IDs from two regions are still k-sorted only to within the clock skew between them. Never fail a worker id over to another region while its old owner might still be alive.</p>', fu: 'What if you need more than 32 datacenters? (Take a bit from the sequence or timestamp, or switch to UUIDv7.)', lvl: 'deep' },
    { q: 'Ticket server vs Snowflake?', a: '<p>A <b>ticket server</b> (Flickr) is a DB row you increment. It is dead simple and gives compact IDs, but every ID (or block of IDs) costs a round-trip, and the server is a bottleneck. Flickr ran two, one for odd and one for even numbers.</p><p><b>Snowflake</b> generates locally with no I/O, but depends on clocks and worker-id assignment.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Java 17: thread-safe Snowflake generator', lang: 'java',
      code: `public final class Snowflake {
  private static final long EPOCH = 1704067200000L;      // 2024-01-01 UTC: pick once, never change
  private static final int WORKER_BITS = 10, SEQ_BITS = 12;
  private static final long MAX_WORKER = (1L << WORKER_BITS) - 1;  // 1023
  private static final long SEQ_MASK = (1L << SEQ_BITS) - 1;       // 4095
  private static final long MAX_BACKWARD_MS = 5;

  private final long workerId;
  private long lastTs = -1L, seq = 0L;

  public Snowflake(long workerId) {                     // from an etcd/ZK lease
    if (workerId < 0 || workerId > MAX_WORKER) throw new IllegalArgumentException("bad workerId");
    this.workerId = workerId;
  }

  public synchronized long nextId() {
    long ts = System.currentTimeMillis();
    if (ts < lastTs) {                                  // clock moved backwards
      if (lastTs - ts > MAX_BACKWARD_MS)
        throw new IllegalStateException("clock moved back " + (lastTs - ts) + " ms");
      ts = waitUntil(lastTs);                           // small skew: wait it out
    }
    if (ts == lastTs) {
      seq = (seq + 1) & SEQ_MASK;
      if (seq == 0) ts = waitUntil(lastTs + 1);         // 4096 used in this ms
    } else {
      seq = 0;
    }
    lastTs = ts;
    return ((ts - EPOCH) << (WORKER_BITS + SEQ_BITS)) | (workerId << SEQ_BITS) | seq;
  }

  private static long waitUntil(long target) {
    long ts = System.currentTimeMillis();
    while (ts < target) { Thread.onSpinWait(); ts = System.currentTimeMillis(); }
    return ts;
  }

  public static long epochMillis(long id) { return (id >>> (WORKER_BITS + SEQ_BITS)) + EPOCH; }
}`,
      note: 'Expose it as a Spring <code>@Bean</code> created with the worker id from your lease. <code>synchronized</code> is fine: one call takes well under a microsecond.'
    },
    {
      title: 'Postgres: Instagram-style IDs per shard', lang: 'sql',
      code: `CREATE SCHEMA shard_5;
CREATE SEQUENCE shard_5.id_seq;

CREATE OR REPLACE FUNCTION shard_5.next_id(OUT result bigint) AS $$
DECLARE
  our_epoch  bigint := 1704067200000;      -- 2024-01-01 UTC
  shard_id   int    := 5;                  -- 13 bits: 0..8191
  seq_id     bigint;
  now_millis bigint;
BEGIN
  SELECT nextval('shard_5.id_seq') % 1024 INTO seq_id;            -- 10 bits
  SELECT floor(extract(epoch FROM clock_timestamp()) * 1000) INTO now_millis;
  result := (now_millis - our_epoch) << 23;                       -- 41 bits of ms
  result := result | (shard_id << 10);
  result := result | seq_id;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE shard_5.photos (
  id         bigint PRIMARY KEY DEFAULT shard_5.next_id(),
  user_id    bigint NOT NULL,
  caption    text
);

-- decode creation time and owning shard from the id alone
SELECT id,
       to_timestamp(((id >> 23) + 1704067200000) / 1000.0) AS created,
       (id >> 10) & 8191                                     AS shard
FROM shard_5.photos ORDER BY id DESC LIMIT 5;`,
      note: 'More than 1,024 inserts per ms on one shard would wrap the sequence and could collide. That is the price of having no per-ms state.'
    },
    {
      title: 'Python: UUIDv7 by hand + Snowflake decoder', lang: 'python',
      code: `import os, time, uuid

def uuid7() -> uuid.UUID:
    """RFC 9562 UUIDv7: 48-bit unix ms | ver 7 | 12 rand | var 10 | 62 rand."""
    ms = time.time_ns() // 1_000_000
    value = (ms & ((1 << 48) - 1)) << 80 | int.from_bytes(os.urandom(10), "big")
    value = (value & ~(0xF << 76)) | (0x7 << 76)   # version = 7
    value = (value & ~(0x3 << 62)) | (0x2 << 62)   # variant = 0b10
    return uuid.UUID(int=value)

TWITTER_EPOCH = 1288834974657
DISCORD_EPOCH = 1420070400000

def decode_snowflake(i: int, epoch: int = TWITTER_EPOCH) -> dict:
    return {"ms": (i >> 22) + epoch,
            "worker": (i >> 12) & 0x3FF,
            "seq": i & 0xFFF}

u = uuid7()
print(u, u.version)                                 # ...-7xxx-..., 7
print(decode_snowflake(1_234_567_890_123_456_789))`,
      note: 'Python 3.14 adds <code>uuid.uuid7()</code>. This version works on 3.11+. IDs from the same ms are unique but not ordered among themselves (the RFC allows extra monotonic counters).'
    }
  ],

  related: ['url-shortener', 'distributed-sql', 'kv-store', 'lock-manager', 'chat', 'newsfeed']
});

/* knobs diagram = architecture + embedded library + two ticket servers */
(function () {
  const d = SD.data;
  const a = d.architecture;
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes.concat([
      { id: 'lib', label: 'In-process lib', sub: 'no network hop', kind: 'compute', wide: [290, 215], tall: [210, 105], tip: 'The generator runs inside the app process: UUIDv4/v7 or ULID need no worker id at all.' },
      { id: 'tkt1', label: 'Ticket server A', sub: 'odd: offset 1, step 2', kind: 'store', wide: [500, 155], tall: [70, 210], tip: 'MySQL with auto-increment-increment = 2 and offset = 1. REPLACE INTO a one-row table, then LAST_INSERT_ID().' },
      { id: 'tkt2', label: 'Ticket server B', sub: 'even: offset 2, step 2', kind: 'store', wide: [500, 275], tall: [350, 210], tip: 'Same table with offset = 2. If one server dies, clients use the other.' }
    ]),
    edges: a.edges.concat([
      { from: 'app', to: 'lib', bidi: true },
      { from: 'ntp', to: 'lib', dashed: true },
      { from: 'lb', to: 'tkt1' },
      { from: 'lb', to: 'tkt2' }
    ])
  };
})();
