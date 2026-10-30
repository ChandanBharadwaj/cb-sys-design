SD.register({
  slug: 'distributed-sql',
  domain: 9,
  title: 'Distributed SQL',
  examples: 'Spanner, CockroachDB',
  tagline: 'Keep <b>SQL and ACID transactions</b> while the data spreads over many machines and regions: cut the key space into <b>ranges</b>, replicate each range with <b>Raft</b>, and order everything with <b>timestamps</b>.',
  tldr: {
    problem: 'One Postgres primary caps write throughput and lives in one region. Hand-rolled sharding scales, but you lose cross-shard transactions, joins and an easy failover story.',
    idea: 'Sort every row and index entry into <b>one ordered key space</b>, split it into ranges, and make each range a small <b>Raft group</b> (3 or 5 replicas). Transactions that touch several ranges use <b>2PC over Raft</b> on top of <b>MVCC</b> versions.',
    insight: 'The hard part is <b>time</b>. Spanner bounds clock error with GPS and atomic clocks and simply <b>waits the error out</b> (commit wait). CockroachDB uses ordinary NTP plus a <b>hybrid logical clock</b> and <b>restarts reads</b> that land inside the uncertainty window.',
    numbers: [
      { v: '1–7 ms', l: 'TrueTime uncertainty ε, a sawtooth (Spanner paper, 2012)' },
      { v: '3', l: 'replicas per range by default (CockroachDB docs)' },
      { v: '40001', l: 'SQLSTATE of every retryable txn error (CockroachDB docs)' }
    ]
  },

  requirements: {
    functional: [
      'Standard SQL: secondary indexes, joins, constraints',
      'ACID transactions across any rows, on any node',
      'Serializable isolation by default',
      'Automatic split, merge and rebalance of data',
      'Pin rows to a home region (geo-partitioning)',
      'Cheap stale reads served by nearby replicas'
    ],
    nonFunctional: [
      'Lose a node or zone with no data loss (RPO = 0)',
      'Writes scale out by adding nodes',
      'Single-region write commit in a few ms',
      'No lost updates, no stale reads after commit',
      'Survive bounded clock skew between nodes',
      'Postgres wire protocol for existing drivers'
    ],
    outOfScope: ['Columnar analytics (OLAP)', 'Every Postgres extension', 'Cross-database federation', 'Backups and CDC pipelines (mentioned only)']
  },

  calculator: {
    inputs: [
      { id: 'data', label: 'Logical data (before replication)', min: 1e11, max: 1e15, value: 2e13, log: true, fmt: 'bytes' },
      { id: 'range', label: 'Target range size', min: 64, max: 1024, step: 64, value: 512, unit: 'MiB' },
      { id: 'rf', label: 'Replicas per range', min: 3, max: 7, step: 2, value: 3 },
      { id: 'nodes', label: 'Nodes in the cluster', min: 3, max: 500, value: 30, log: true },
      { id: 'wps', label: 'Peak row writes per second', min: 1000, max: 2000000, value: 50000, log: true },
      { id: 'rtt', label: 'Round trip to reach a quorum', min: 1, max: 200, value: 2, unit: 'ms' }
    ],
    outputs: [
      { label: 'Ranges (Raft groups)', f: (v) => v.data / (v.range * 1048576) },
      { label: 'Replicas per node', f: (v) => (v.data / (v.range * 1048576)) * v.rf / v.nodes },
      { label: 'Raw storage with replication', fmt: 'bytes', f: (v) => v.data * v.rf },
      { label: 'Raft log appends per node per second', f: (v) => v.wps * v.rf / v.nodes },
      { label: 'Commit latency floor (one consensus round)', fmt: 'ms', f: (v) => v.rtt },
      { label: 'Replica failures each range survives', fmt: 'raw', f: (v) => Math.floor((v.rf - 1) / 2) + ' of ' + v.rf }
    ],
    note: 'Recent CockroachDB versions split ranges at about 512 MiB (it was 64 MiB in older releases; check your version). A quorum round trip is about 1–2 ms between zones of one region and tens of ms between regions: these are <em>estimates</em>. Storage ignores compression and MVCC history. Notice that latency is set by <b>where the quorum lives</b>, not by how many nodes you add.'
  },

  api: [
    { m: 'SQL', p: 'BEGIN; … COMMIT;', d: 'Normal Postgres-wire transactions. Under SERIALIZABLE the client must be ready to <b>retry on SQLSTATE 40001</b> ("restart transaction").' },
    { m: 'SQL', p: 'SELECT … AS OF SYSTEM TIME follower_read_timestamp()', d: 'A slightly stale, read-only query that any nearby replica can serve. No trip to a remote leaseholder.' },
    { m: 'SQL', p: 'ALTER DATABASE app SURVIVE REGION FAILURE', d: 'CockroachDB multi-region: place replicas so each range keeps a quorum after losing a whole region.' },
    { m: 'SQL', p: 'ALTER TABLE users SET LOCALITY REGIONAL BY ROW', d: 'Geo-partitioning: each row lives (and has its leaseholder) in its home region, so local reads and writes stay local.' },
    { m: 'RPC', p: 'BatchRequest → range leaseholder', d: 'Internal KV call. The gateway routes each key to the range that owns it. A stale cache gets <code>NotLeaseHolderError</code> and is redirected.' }
  ],
  dataModel: [
    { name: 'range descriptor', store: 'meta ranges (KV)', fields: [['start_key, end_key', 'key span', 'pk'], ['range_id', 'int64', 'idx'], ['replicas', '3–5 × (node, store)'], ['leaseholder', 'replica id'], ['generation', 'int']], note: 'A two-level index of ranges, itself stored in ranges. Gateways cache it and refresh on a miss.' },
    { name: 'MVCC key/value', store: 'LSM engine per node', fields: [['/table/index/pk…', 'bytes', 'pk'], ['timestamp', 'HLC (wall, logical)', 'sk'], ['value', 'encoded row'], ['intent?', 'txn id (uncommitted)']], note: 'Every write adds a new version. Readers pick the newest version at or below their timestamp. Old versions are garbage-collected after a TTL.' },
    { name: 'transaction record', store: 'on the txn\'s first range', fields: [['txn_id', 'uuid', 'pk'], ['status', 'PENDING · STAGING · COMMITTED · ABORTED'], ['write_ts', 'HLC'], ['in_flight_writes', 'key list'], ['heartbeat', 'ts']], note: 'Flipping this one record commits all intents atomically. Readers that hit an intent check here.' },
    { name: 'accounts (SQL)', store: 'table', fields: [['id', 'UUID', 'pk'], ['crdb_region', 'enum', 'sk'], ['owner', 'STRING', 'idx'], ['balance', 'DECIMAL']], note: 'A random UUID key spreads inserts across ranges. A SERIAL or timestamp key would pile every insert onto the last range.' }
  ],

  architecture: {
    title: 'Distributed SQL: ranges, Raft groups and a transaction layer',
    nodes: [
      { id: 'app', label: 'App (JDBC)', sub: 'Spring Boot · pgjdbc', kind: 'client', wide: [90, 170], tall: [105, 0], tip: 'Talks the Postgres wire protocol to any node. Wraps transactions in a retry loop for 40001.' },
      { id: 'lb', label: 'Load balancer', sub: 'any node is a gateway', kind: 'edge', wide: [280, 170], tall: [315, 0], tip: 'Spreads connections across nodes. There is no special primary node: every node can parse and plan SQL.' },
      { id: 'gw', label: 'SQL gateway', sub: 'parse · plan · DistSQL', kind: 'service', wide: [470, 170], tall: [210, 105], tip: 'Turns SQL into KV operations on key spans, and pushes filters and aggregations down to the nodes that hold the data.' },
      { id: 'meta', label: 'Range directory', sub: 'meta ranges (cached)', kind: 'cache', wide: [470, 50], tall: [70, 105], tip: 'Maps a key to its range and the range\'s leaseholder. Cached on each gateway and refreshed when a request is redirected.' },
      { id: 'clock', label: 'Clock', sub: 'TrueTime or HLC + NTP', kind: 'external', wide: [660, 50], tall: [70, 210], tip: 'Spanner: GPS and atomic clocks give an interval [earliest, latest]. CockroachDB: NTP-synced wall clock inside a hybrid logical clock, with a maximum allowed offset.' },
      { id: 'txn', label: 'Txn coordinator', sub: 'timestamps · 2PC', kind: 'service', wide: [660, 170], tall: [210, 210], tip: 'Picks the transaction timestamp, writes intents to every range it touches, then flips one transaction record to COMMITTED.' },
      { id: 'rA', label: 'Range A', sub: 'leaseholder · [a, m)', kind: 'store', wide: [860, 60], tall: [105, 315], tip: 'Leaseholder of range A, usually also its Raft leader. Serves consistent reads and proposes every write to its Raft group.' },
      { id: 'rAf', label: 'Range A followers', sub: '2 replicas · other AZs', kind: 'store', wide: [860, 170], tall: [315, 315], tip: 'Append the leader\'s log entries. A write is committed when a majority (2 of 3) has it durably.' },
      { id: 'rB', label: 'Range B', sub: 'leaseholder · [m, z)', kind: 'store', wide: [660, 300], tall: [350, 210], tip: 'Another range, another Raft group, often led from a different node. Load spreads because leaders spread.' },
      { id: 'rBf', label: 'Range B followers', sub: '2 replicas · other AZs', kind: 'store', wide: [470, 300], tall: [350, 105], tip: 'Can also serve follower reads at a timestamp below the range\'s closed timestamp.' }
    ],
    edges: [
      { from: 'app', to: 'lb', bidi: true },
      { from: 'lb', to: 'gw', bidi: true },
      { from: 'gw', to: 'meta' },
      { from: 'gw', to: 'txn', bidi: true },
      { from: 'clock', to: 'txn', dashed: true },
      { from: 'txn', to: 'rA', bidi: true },
      { from: 'txn', to: 'rB', bidi: true },
      { from: 'rA', to: 'rAf', bidi: true, label: 'Raft' },
      { from: 'rB', to: 'rBf', bidi: true, label: 'Raft' },
      { from: 'gw', to: 'rBf', bidi: true, dashed: true },
      { from: 'txn', to: 'rAf', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'write', title: 'Single-range write via Raft', tone: 'info',
      steps: [
        { text: 'The app runs <code>UPDATE accounts SET … WHERE id = $1</code>. The load balancer picks any node, which becomes the <b>gateway</b> for this connection.', flow: ['app>lb', 'lb>gw'] },
        { text: 'The gateway encodes the row as a key and looks up which range owns it in its cached <b>range directory</b>: range A.', flow: ['gw>meta'], badges: { meta: 'key → range A' } },
        { text: 'The coordinator takes a timestamp from the clock and sends the write to range A\'s <b>leaseholder</b>.', flow: ['clock>txn', 'gw>txn', 'txn>rA'], badges: { txn: 'ts = 1714…/0' } },
        { text: 'The leaseholder proposes the write to its Raft group. It is committed once a <b>majority</b> (itself plus one follower) has it in the log.', flow: ['rA>rAf', 'rAf>rA'], badges: { rAf: '2 of 3 acks' }, tone: 'ok' },
        { text: 'The write is applied as a new <b>MVCC version</b> at that timestamp and the client gets its ack. One consensus round inside one region: a few ms.', flow: ['rA>txn', 'txn>gw', 'gw>lb', 'lb>app'], ok: ['rA'], badges: { app: 'COMMIT ✓' }, tone: 'ok' }
      ]
    },
    {
      id: 'xrange', title: 'Cross-range txn: 2PC and commit wait', tone: 'warn',
      steps: [
        { text: 'A transfer debits account <i>alice</i> (range A) and credits <i>bob</i> (range B) in one transaction.', flow: ['app>lb', 'lb>gw', 'gw>txn'] },
        { text: 'The coordinator writes <b>intents</b> (provisional versions tagged with its txn id) to both ranges in parallel. Each intent goes through its own Raft group.', flow: [['txn>rA', 'txn>rB'], ['rA>rAf', 'rB>rBf']], badges: { rA: 'intent', rB: 'intent' } },
        { text: 'Commit = flipping the <b>transaction record</b> (on range A) to COMMITTED. CockroachDB\'s <i>parallel commits</i> write it as STAGING alongside the intents, saving a round trip.', flow: ['txn>rA'], badges: { rA: ['COMMITTED', 'ok'] }, tone: 'ok' },
        { text: 'Spanner adds <b>commit wait</b>: pick <code>s = TT.now().latest</code>, then wait until <code>TT.now().earliest &gt; s</code>, about 2ε. After that every node agrees s is in the past.', nodes: ['clock', 'txn'], warn: ['txn'], badges: { clock: ['wait ≈ 2ε', 'warn'] }, tone: 'warn' },
        { text: 'The client is acknowledged. Intents are cleaned up into normal versions in the background. Readers that hit one before that check the transaction record.', flow: ['txn>gw', 'gw>lb', 'lb>app', ['txn>rA', 'txn>rB']], ok: ['rA', 'rB'], tone: 'ok' }
      ]
    },
    {
      id: 'follower', title: 'Follower read at a timestamp', tone: 'ok',
      steps: [
        { text: 'A dashboard in another region runs <code>SELECT … AS OF SYSTEM TIME follower_read_timestamp()</code>. It can tolerate data a few seconds old.', flow: ['app>lb', 'lb>gw'] },
        { text: 'Range B\'s leaseholder is far away. The gateway sends the read to the <b>nearest replica</b>, a follower, instead.', flow: ['gw>rBf'], badges: { rBf: 'local' } },
        { text: 'The follower may answer because the leaseholder publishes a <b>closed timestamp</b>: a promise that no new writes will land below it. The read time is below that line.', nodes: ['rB', 'rBf'], ok: ['rBf'], badges: { rB: 'closed ts → T', rBf: ['read @ T−δ ✓', 'ok'] }, tone: 'ok' },
        { text: 'Result: a consistent snapshot with no cross-region round trip. The price is staleness, and these queries must be read-only.', flow: ['rBf>gw', 'gw>lb', 'lb>app'], badges: { app: 'snapshot, ~seconds old' } }
      ]
    },
    {
      id: 'hot', title: 'Hot range: sequential keys', tone: 'warn',
      steps: [
        { text: 'An events table uses a timestamp primary key. Every new row sorts after the last one, so <b>all inserts hit the last range</b>.', flow: ['app>lb', 'lb>gw', 'gw>txn', 'txn>rB'], warn: ['rB'], badges: { rB: ['90% of writes', 'warn'] }, tone: 'warn' },
        { text: '<b>Load-based splitting</b> cuts range B in two, and the rebalancer moves one half\'s lease to a quieter node. The directory is updated.', nodes: ['rB', 'meta'], labels: { rB: { label: 'Range B1 | B2', sub: 'split by load' } }, badges: { meta: 'new split' } },
        { text: 'It does not help much: the newest key is still always in the <b>last</b> range. A split only moves the hot spot.', nodes: ['rB'], warn: ['rB'], labels: { rB: { label: 'Range B2', sub: 'still the tail' } }, badges: { rB: ['still hot', 'warn'] } },
        { text: 'Fix the key: use a random <b>UUID</b>, or a <b>hash-sharded</b> index (<code>PRIMARY KEY (ts, id) USING HASH</code>) that prefixes a bucket so inserts spread over many ranges.', flow: [['txn>rA', 'txn>rB']], ok: ['rA', 'rB'], badges: { rA: ['~50%', 'ok'], rB: ['~50%', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'fail', title: 'Leaseholder node dies', tone: 'err',
      steps: [
        { text: 'The node holding range A\'s lease (and Raft leadership) crashes. Writes and consistent reads for range A stall.', nodes: ['rA'], err: ['rA'], badges: { rA: ['down', 'err'] }, tone: 'err' },
        { text: 'The followers stop receiving heartbeats. After a randomized <b>election timeout</b> one of them becomes a candidate and asks for votes.', nodes: ['rAf'], warn: ['rAf'], badges: { rAf: ['term 8: vote?', 'warn'] }, tone: 'warn' },
        { text: 'Two of three replicas are still alive, which is a majority. A follower wins the election and takes the <b>lease</b>. Committed data is safe because it was on a majority.', nodes: ['rAf'], ok: ['rAf'], labels: { rAf: { label: 'Range A (new)', sub: 'leader · term 8' } }, badges: { rAf: ['leader', 'ok'] } },
        { text: 'The gateway\'s cached leaseholder is now wrong. Its request is redirected (<code>NotLeaseHolderError</code>), it updates the cache and retries. The client sees a pause of seconds, not an error.', flow: ['gw>txn', 'txn>rAf'], labels: { rAf: { label: 'Range A (new)', sub: 'leader · term 8' } }, err: ['rA'], tone: 'ok' },
        { text: 'Lose <b>two</b> of three replicas and the range has no quorum: it stays unavailable until one returns. That is why multi-region setups use 5 replicas across 3 regions.', nodes: ['rA', 'rAf'], err: ['rA', 'rAf'], badges: { rAf: ['1 of 3 alive', 'err'] }, tone: 'err' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick how the cluster tells time, where replicas live, and what readers may see. The meters show commit latency, remote-read latency, what failure you survive and how often clients retry.',
    controls: [
      { id: 'clock', label: 'Clock', type: 'seg', value: 'hlc', options: [
        { v: 'tt', l: 'TrueTime (GPS + atomic)' }, { v: 'hlc', l: 'HLC + NTP' }, { v: 'tso', l: 'Central timestamp oracle' }] },
      { id: 'place', label: 'Replica placement', type: 'seg', value: 'single', options: [
        { v: 'single', l: '1 region, 3 zones' }, { v: 'multi', l: '3 regions, survive region' }, { v: 'geo', l: 'Geo-partitioned rows' }] },
      { id: 'iso', label: 'Isolation', type: 'seg', value: 'ser', options: [
        { v: 'ser', l: 'Serializable' }, { v: 'rc', l: 'Read committed' }] },
      { id: 'fr', label: 'Follower reads', type: 'seg', value: 'off', options: [
        { v: 'off', l: 'Off (leaseholder only)' }, { v: 'on', l: 'On (AS OF SYSTEM TIME)' }] },
      { id: 'rtt', label: 'Round trip between regions', type: 'range', min: 20, max: 250, step: 10, value: 80, unit: 'ms' }
    ],
    evaluate(s) {
      const AZ = 2; // ms, zone-to-zone round trip inside a region (estimate)
      const eps = 4; // ms, typical TrueTime ε reported in the Spanner paper
      const consensus = s.place === 'multi' ? s.rtt : AZ;
      const wait = s.clock === 'tt' ? Math.max(0, 2 * eps - consensus) : 0; // commit wait overlaps the consensus round
      const tsoHop = s.clock === 'tso' ? (s.place === 'single' ? 1 : s.rtt / 2) : 0;
      const write = consensus + wait + tsoHop;
      const remoteRead = s.fr === 'on' ? AZ / 2 + (s.clock === 'tso' && s.place !== 'single' ? s.rtt / 2 : 0) : s.place === 'geo' ? AZ / 2 : s.rtt;
      const retryBase = s.iso === 'ser' ? 0.6 : 0.85;
      const retryClock = s.clock === 'hlc' ? -0.1 : 0;
      const retryS = Math.max(0.15, retryBase + retryClock - (s.place === 'multi' ? 0.1 : 0));
      const ms = (x) => (x < 10 ? x.toFixed(1) : Math.round(x)) + ' ms';
      const surv = { single: ['a zone (not a region)', 0.55], multi: ['a whole region', 0.95], geo: ['a zone; a region outage takes its rows offline', 0.5] }[s.place];
      const clockV = { tt: ['GPS + atomic clocks bound ε to a few ms', 0.7], hlc: ['NTP only; a node with too much offset shuts itself down', 0.75], tso: ['no clock trust, but every txn asks one service', 0.5] }[s.clock];
      const metrics = [
        { k: 'Write commit latency', v: '≈ ' + ms(write) + (wait > 0 ? ' (incl. commit wait)' : ''), s: clamp01(1 - write / 160), hint: s.place === 'multi' ? 'cross-region quorum' : 'in-region quorum' },
        { k: 'Read from a far region', v: '≈ ' + ms(remoteRead) + (s.fr === 'on' ? ' (stale)' : s.place === 'geo' ? ' (home rows)' : ' (to leaseholder)'), s: clamp01(1 - remoteRead / 160) },
        { k: 'Survives losing', v: surv[0], s: surv[1] },
        { k: 'Client retries (40001)', v: s.iso === 'ser' ? (s.clock === 'hlc' ? 'more: conflicts + uncertainty restarts' : 'under write-write and read-write conflicts') : 'rare: only limited cases', s: retryS },
        { k: 'Clock dependency', v: clockV[0], s: clockV[1] },
        { k: 'Read freshness', v: s.fr === 'on' ? 'a few seconds behind' : 'latest committed', s: s.fr === 'on' ? 0.5 : 0.95 },
        { k: 'Anomaly protection', v: s.iso === 'ser' ? 'serializable: no write skew' : 'read committed: write skew possible', s: s.iso === 'ser' ? 0.95 : 0.5 }
      ];
      const notes = [];
      if (s.clock === 'tt') notes.push('Commit wait is about 2ε. With ε ≈ 4 ms it hides inside a cross-region consensus round, but it is visible in a single region (' + ms(wait) + ' here).');
      if (s.clock === 'hlc') notes.push('No special hardware. A read that finds a value inside its <b>uncertainty window</b> (up to the max clock offset) cannot tell if it came first, so it <b>moves its timestamp up</b> and may have to restart.');
      if (s.clock === 'tso') notes.push('A single timestamp oracle (as in Percolator or TiDB\'s placement driver) gives a total order without trusting clocks, but adds a hop per transaction and must itself be replicated.');
      if (s.place === 'multi') notes.push('5 replicas across 3 regions keeps a quorum after a region outage, but every write waits for a cross-region round trip (' + s.rtt + ' ms).');
      if (s.place === 'geo') notes.push('REGIONAL BY ROW keeps each row\'s quorum in its home region: local writes are fast, but a user who travels pays the cross-region trip.');
      if (s.iso === 'rc') notes.push('READ COMMITTED takes a new snapshot per statement and returns far fewer 40001s. Use <code>SELECT … FOR UPDATE</code> where you need the old guarantees.');
      if (s.fr === 'on') notes.push('Follower reads only work in read-only transactions, at a timestamp below the closed timestamp.');
      let verdict;
      if (s.place === 'multi' && s.fr === 'off' && s.rtt >= 120) verdict = '⚠ <b>Every write and every remote read crosses an ocean.</b> Add follower reads for dashboards, or geo-partition rows by home region.';
      else if (s.iso === 'rc') verdict = '👍 <b>Fewer retries, weaker guarantees.</b> Good for Postgres apps that already assume READ COMMITTED; check every read-modify-write for write skew.';
      else if (s.clock === 'tso' && s.place !== 'single') verdict = '⚠ <b>The timestamp oracle sits in one region.</b> Transactions elsewhere pay a round trip just to get a timestamp.';
      else if (s.clock === 'tt' && s.place === 'multi') verdict = '✅ <b>This is Spanner:</b> external consistency across regions, with commit wait hidden behind the cross-region Paxos round.';
      else if (s.clock === 'hlc' && s.place === 'single' && s.fr === 'off') verdict = '✅ <b>A strong default:</b> serializable, a few ms per write, survives a zone. Wrap transactions in a 40001 retry loop.';
      else verdict = '👍 <b>Workable.</b> Read the meters to see which cost you chose to pay.';
      const labels = {
        clock: { tt: { label: 'TrueTime', sub: '[earliest, latest] · ε' }, hlc: { label: 'HLC + NTP', sub: 'max offset bound' }, tso: { label: 'Timestamp oracle', sub: 'one service, Raft HA' } }[s.clock],
        rAf: { label: 'Range A followers', sub: { single: '2 replicas · other AZs', multi: '4 replicas · 3 regions', geo: '2 replicas · home region' }[s.place] },
        rBf: { label: 'Range B followers', sub: s.fr === 'on' ? 'serve stale reads' : { single: '2 replicas · other AZs', multi: '4 replicas · 3 regions', geo: '2 replicas · home region' }[s.place] },
        txn: { label: 'Txn coordinator', sub: s.iso === 'ser' ? 'SERIALIZABLE' : 'READ COMMITTED' }
      };
      const flow = ['app>lb', 'lb>gw', 'gw>txn', 'txn>rA', 'rA>rAf'].concat(s.fr === 'on' ? ['gw>rBf'] : ['txn>rB']);
      if (s.clock !== 'hlc') flow.splice(3, 0, 'clock>txn');
      return {
        metrics, verdict, notes, labels, flow,
        hot: s.fr === 'on' ? ['rBf'] : [],
        warn: (s.place === 'multi' && s.rtt >= 120) ? ['rAf'] : s.clock === 'tso' && s.place !== 'single' ? ['clock'] : [],
        badges: { txn: ['≈ ' + ms(write), write > 60 ? 'warn' : 'info'] }
      };
      function clamp01(x) { return Math.max(0.03, Math.min(1, x)); }
    }
  },

  widget: {
    title: 'TrueTime commit wait · Raft election',
    caption: '<b>TrueTime:</b> each node only knows time as an interval of ±ε. Run T1 then T2 with commit wait on and off and with worst-case skew, and see when T2 gets a <i>smaller</i> timestamp even though it started later. <b>Raft:</b> five replicas with randomized election timeouts. Kill the leader (or tap any node) and watch a new one get elected, or fail to get a majority.'
  },

  realWorld: {
    intro: 'Google showed it could be done with special clocks. Open-source systems then rebuilt the idea on ordinary hardware.',
    timeline: [
      { when: '2012', who: 'Google', title: 'Spanner (OSDI\'12)', text: 'A globally distributed, synchronously replicated database with <b>externally consistent</b> transactions. Its TrueTime API exposes clock uncertainty, and the paper describes ε as a sawtooth of about <b>1–7 ms</b>. Writes wait out the uncertainty before becoming visible.', src: 0 },
      { when: '2014', who: 'Stanford', title: 'Raft (USENIX ATC\'14)', text: 'Ongaro and Ousterhout publish Raft: leader election with <b>randomized timeouts</b>, log replication and a safety argument, designed to be easier to understand than Paxos. CockroachDB and others run one Raft group per range.', src: 1 },
      { when: '2020', who: 'Cockroach Labs', title: 'CockroachDB (SIGMOD\'20)', text: 'The paper describes geo-distributed SQL on <b>commodity clocks</b>: hybrid logical clocks for MVCC timestamps, an <b>uncertainty interval</b> that forces reads to move up and sometimes restart, and Raft-replicated ranges.', src: 2 },
      { when: 'Docs', who: 'Cockroach Labs', title: 'Leaseholders and 3 replicas', text: 'By default each range has <b>three replicas</b>. One replica, the <b>leaseholder</b>, coordinates all reads and writes for the range and is normally also the Raft leader.', src: 3 },
      { when: 'Docs', who: 'Cockroach Labs', title: 'Follower reads', text: '<code>AS OF SYSTEM TIME follower_read_timestamp()</code> lets any replica serve a read-only query at a slightly old timestamp, so remote regions avoid the leaseholder round trip.', src: 4 },
      { when: 'Docs', who: 'Cockroach Labs', title: 'Retry on 40001', text: 'Every transaction retry error uses SQLSTATE <b>40001</b>. The server retries on its own when it can. Otherwise the client must roll back, back off and run the whole transaction again.', src: 5 },
      { when: '2023–24', who: 'Cockroach Labs', title: 'READ COMMITTED', text: 'Previewed in 23.2, with GA planned for 24.1. The docs say it never returns <code>RETRY_SERIALIZABLE</code> and returns 40001 only in limited cases.', src: 6 },
      { when: 'Docs', who: 'Google Cloud', title: 'TrueTime in software', text: 'Spanner Omni runs TrueTime without GPS or atomic-clock hardware. The docs note that uncertainty adds no commit latency while it is <b>smaller than the Paxos round trip</b>.', src: 7 }
    ],
    lessons: [
      '<b>Raft per range</b> spreads leadership, and therefore load, across the whole cluster.',
      'Latency is set by <b>where the quorum lives</b>. Choose placement per table, not per cluster.',
      'You cannot avoid clock uncertainty. You can only <b>wait it out</b> (Spanner) or <b>restart</b> on it (CockroachDB).',
      'Serializable systems push work to the client: <b>every transaction needs a retry loop</b>.'
    ],
    sources: [
      { title: 'Spanner: Google\'s Globally-Distributed Database', url: 'https://research.google/pubs/pub39966/', pub: 'OSDI 2012' },
      { title: 'In Search of an Understandable Consensus Algorithm', url: 'https://www.usenix.org/node/184041', pub: 'USENIX ATC 2014' },
      { title: 'CockroachDB: The Resilient Geo-Distributed SQL Database', url: 'https://www.cockroachlabs.com/guides/cockroachdb-the-resilient-geo-distributed-sql-database-sigmod-2020/', pub: 'SIGMOD 2020' },
      { title: 'Reads and Writes in CockroachDB', url: 'https://www.cockroachlabs.com/docs/stable/architecture/reads-and-writes-overview', pub: 'CockroachDB docs' },
      { title: 'Follower Reads', url: 'https://www.cockroachlabs.com/docs/stable/follower-reads', pub: 'CockroachDB docs' },
      { title: 'Transaction Retry Error Reference', url: 'https://www.cockroachlabs.com/docs/stable/transaction-retry-error-reference', pub: 'CockroachDB docs' },
      { title: 'Read Committed in 23.2: no more anomaly tables', url: 'https://www.cockroachlabs.com/blog/232-read-committed-no-more-anomaly-tables/', pub: 'Cockroach Labs blog' },
      { title: 'TrueTime and external consistency', url: 'https://docs.cloud.google.com/spanner-omni/true-time-external-consistency', pub: 'Google Cloud docs (Spanner Omni)' },
      { title: 'Spanner (lecture slides)', url: 'https://www.cs.princeton.edu/courses/archive/spr24/cos418/docs/L17-spanner-pt1.pdf', pub: 'Princeton COS 418' },
      { title: 'Read Committed Transactions', url: 'https://www.cockroachlabs.com/docs/dev/read-committed', pub: 'CockroachDB docs' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Clock', '<b>TrueTime</b>: tight ε, commit wait, strict external consistency', '<b>HLC + NTP</b>: any hardware, uncertainty restarts', 'TrueTime if you run on Google; HLC everywhere else'],
      ['Placement', '<b>One region, 3 zones</b>: ~ms writes', '<b>3 regions, 5 replicas</b>: survives a region, writes pay cross-region RTT', 'Multi-region only for data that must survive a region loss'],
      ['Isolation', '<b>Serializable</b>: no anomalies, more 40001 retries', '<b>Read committed</b>: Postgres-like, fewer retries', 'Serializable for money and inventory; RC for ported apps'],
      ['Remote reads', '<b>Leaseholder</b>: always fresh', '<b>Follower read</b>: local, seconds stale', 'Followers for dashboards, catalogs, anything read-only'],
      ['Primary key', '<b>Sequential</b> (SERIAL, timestamp): one hot range', '<b>UUID / hash-sharded</b>: spread writes', 'Almost always B. Keep time-ordering in a secondary index'],
      ['Architecture', '<b>Distributed SQL</b>: automatic sharding, global txns', '<b>Sharded Postgres</b> (Citus, app-level): mature, fast single-shard', 'Sharded PG when nearly every txn stays inside one tenant or shard']
    ]
  },
  failures: [
    { f: 'Leaseholder node crashes', detect: 'Raft heartbeats stop; lease expires', fix: 'A follower is elected and takes the lease within seconds. Gateways follow redirects and refresh their range cache.' },
    { f: 'Clock skew beyond the max offset', detect: 'Clock-offset metrics; node compares offsets with peers', fix: 'The node shuts itself down rather than risk anomalies. Fix NTP (use slewing) before restarting it.' },
    { f: 'Retry storm on contended rows', detect: 'Rising 40001 rate and txn restarts', fix: 'Lock early with <code>SELECT … FOR UPDATE</code>, keep txns short, back off with jitter, or use READ COMMITTED.' },
    { f: 'Hot range from sequential keys', detect: 'One range or node far above the rest in QPS and CPU', fix: 'Switch to UUIDs or a hash-sharded index. Load-based splitting alone only moves the hot tail.' },
    { f: 'Quorum lost (2 of 3 replicas down)', detect: 'Ranges reported unavailable / under-replicated', fix: 'Bring a replica back. Prevent it with 5 replicas across 3 regions or zones for critical data.' },
    { f: 'Region partitioned away', detect: 'Cross-region RPC failures', fix: 'The majority side keeps serving. Leaseholders in the minority move away. Clients there fail over.' },
    { f: 'Long transaction blocks others', detect: 'Contention events; old txn heartbeats', fix: 'Break bulk updates into batches. Long txns also raise the chance of restarts.' }
  ],

  interview: [
    { q: 'What is commit wait, and why does Spanner need it?', a: '<p>TrueTime returns an interval <code>[earliest, latest]</code> that is guaranteed to contain true time. A transaction picks <code>s = TT.now().latest</code>, then waits until <code>TT.now().earliest &gt; s</code> before it releases locks and acknowledges. That takes about <b>2ε</b>.</p><p>After the wait, s is in the past on every node. Any transaction that starts after the ack must therefore get a larger timestamp. That is <b>external consistency</b>.</p>', fu: 'Why does a smaller ε matter? (It does not change correctness, only how long commits wait.)', lvl: 'core' },
    { q: 'How does CockroachDB work without atomic clocks?', a: '<p>Timestamps come from a <b>hybrid logical clock</b>: the NTP wall clock plus a logical counter that moves forward on every message, so causally related events stay ordered.</p><p>Clocks may be off by up to a configured <b>max offset</b>. A read at time t that finds a value written in <code>(t, t + max_offset]</code> cannot tell which came first. It moves its read timestamp above that value, and if earlier reads would now change, it <b>restarts</b>. Nodes whose clocks drift too far shut themselves down.</p>', fu: 'What does it give up versus Spanner? (No strict serializability guarantee for unrelated transactions on different keys.)', lvl: 'deep' },
    { q: 'Why one Raft group per range instead of one for the whole database?', a: '<p>One group would mean <b>one leader</b> for every write in the cluster, which is a bottleneck. With thousands of small groups, leadership spreads across all nodes, writes to different ranges run in parallel, and a failure only affects the ranges that had a replica on that node.</p><p>The cost is overhead per group (heartbeats, logs), which systems reduce by coalescing heartbeats and letting idle ranges go quiet.</p>', lvl: 'core' },
    { q: 'What is a leaseholder, and how is it different from the Raft leader?', a: '<p>The <b>Raft leader</b> orders writes in the log. The <b>leaseholder</b> holds a time-based lease that lets it serve consistent reads <i>locally</i>, without a Raft round, because no other replica can accept writes during its lease.</p><p>CockroachDB keeps them on the same replica almost all the time. They differ only briefly, for example during a lease transfer.</p>', lvl: 'core' },
    { q: 'Walk through a transaction that touches two ranges.', a: '<ul><li>The coordinator picks a timestamp and writes <b>intents</b> to both ranges. Each intent is replicated by that range\'s Raft group.</li><li>It writes the <b>transaction record</b> as COMMITTED (CockroachDB\'s parallel commits use a STAGING state to overlap this with the intent writes).</li><li>It acks the client, then resolves intents into normal values in the background.</li></ul><p>A reader that meets an intent looks up the transaction record to see if it is committed, aborted or still pending.</p>', lvl: 'deep' },
    { q: 'Distributed SQL or sharded Postgres?', a: '<p><b>Sharded Postgres</b> (Citus, or sharding in the app) is mature and very fast when a transaction stays in one shard, for example one tenant. Cross-shard transactions, resharding and failover are on you.</p><p><b>Distributed SQL</b> makes sharding, rebalancing, replication and cross-range ACID automatic, at the cost of a consensus round per write, retry handling, and less Postgres compatibility.</p>', fu: 'What if 99% of queries are per-tenant? (Sharded Postgres by tenant is often simpler.)', lvl: 'core' },
    { q: 'How do you handle hot ranges?', a: '<p>The usual cause is a <b>monotonic key</b> (SERIAL, timestamp) that sends every insert to the last range. Splitting does not help, because the tail is always hot.</p><p>Use random UUIDs or a <b>hash-sharded index</b> that prefixes a bucket number. For a single hot row (a counter), shard the counter into N rows and sum them on read.</p>', lvl: 'core' },
    { q: 'What latency choices do you have in a multi-region deployment?', a: '<ul><li><b>Survive zone</b>: quorum in one region, fast writes, a region outage takes that data offline.</li><li><b>Survive region</b>: 5 replicas across 3 regions, every write pays a cross-region round trip.</li><li><b>REGIONAL BY ROW</b>: each row\'s leaseholder in its home region.</li><li><b>GLOBAL</b> tables: fast reads everywhere, slow writes.</li><li><b>Follower reads</b> for anything that can be a few seconds stale.</li></ul>', lvl: 'deep' },
    { q: 'Why must clients retry, and how should the loop look?', a: '<p>Under SERIALIZABLE, a transaction can be <b>pushed</b> by a conflict and fail to commit at a valid timestamp. CockroachDB retries internally when it has not yet sent results to the client. Otherwise it returns <b>SQLSTATE 40001</b>.</p><p>The client rolls back, sleeps with exponential backoff and jitter, and re-runs the <i>whole</i> transaction, including its reads. Keep side effects (emails, payments) outside the loop.</p>', lvl: 'core' },
    { q: 'How can a follower serve a consistent read?', a: '<p>The leaseholder regularly publishes a <b>closed timestamp</b>: a promise that it will accept no more writes at or below it. Any follower that has applied the log up to that point holds a complete snapshot at that time.</p><p>A read at a timestamp below the closed timestamp is therefore consistent on any up-to-date follower. That is what <code>follower_read_timestamp()</code> picks.</p>', lvl: 'deep' },
    { q: 'What happens when a range loses its quorum?', a: '<p>With 3 replicas, losing 2 leaves no majority. The range cannot elect a leader or commit writes, so it becomes <b>unavailable</b> (consistency over availability, as CAP predicts). Data that was committed is still on the surviving replica.</p><p>Plan for this with replication factor 5 and placement across failure domains.</p>', lvl: 'core' },
    { q: 'Serializable vs read committed: which would you choose?', a: '<p><b>Serializable</b> stops anomalies like write skew (two doctors both going off call) but causes more 40001 retries. <b>Read committed</b> takes a fresh snapshot per statement, matches what most Postgres apps assume, and rarely asks for retries.</p><p>Choose serializable for money and inventory. For RC, add explicit locks (<code>FOR UPDATE</code>) on read-modify-write paths.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Java 17: CockroachDB transaction with 40001 retry', lang: 'java',
      code: `@Component
public class CrdbTx {
  private static final int MAX_ATTEMPTS = 6;
  private final DataSource ds;
  public CrdbTx(DataSource ds) { this.ds = ds; }

  @FunctionalInterface public interface Work<T> { T run(Connection c) throws SQLException; }

  public <T> T run(Work<T> work) throws SQLException {
    for (int attempt = 1; ; attempt++) {
      try (Connection c = ds.getConnection()) {
        c.setAutoCommit(false);
        try {
          T result = work.run(c);
          c.commit();                       // commit can also throw 40001
          return result;
        } catch (SQLException e) {
          c.rollback();
          if (!"40001".equals(e.getSQLState()) || attempt == MAX_ATTEMPTS) throw e;
        }
      }
      long backoff = Math.min(2_000, 25L << attempt);           // exponential, capped
      try { Thread.sleep(backoff / 2 + ThreadLocalRandom.current().nextLong(backoff / 2)); }
      catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw new SQLException(ie); }
    }
  }

  public void transfer(UUID from, UUID to, BigDecimal amt) throws SQLException {
    run(c -> {
      try (PreparedStatement debit = c.prepareStatement(
             "UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance >= ?");
           PreparedStatement credit = c.prepareStatement(
             "UPDATE accounts SET balance = balance + ? WHERE id = ?")) {
        debit.setBigDecimal(1, amt); debit.setObject(2, from); debit.setBigDecimal(3, amt);
        if (debit.executeUpdate() != 1) throw new SQLException("insufficient funds", "P0001");
        credit.setBigDecimal(1, amt); credit.setObject(2, to);
        credit.executeUpdate();
        return null;
      }
    });
  }
}`,
      note: 'Do not wrap this in Spring <code>@Transactional</code>: the loop must own the whole transaction. Keep side effects outside it. If a commit outcome is <b>ambiguous</b> (the connection dropped during COMMIT), only retry when the work is idempotent.'
    },
    {
      title: 'SQL: multi-region schema, hot-key fix, follower reads', lang: 'sql',
      code: `-- CockroachDB multi-region database
ALTER DATABASE bank SET PRIMARY REGION "us-east1";
ALTER DATABASE bank ADD REGION "europe-west1";
ALTER DATABASE bank ADD REGION "asia-southeast1";
ALTER DATABASE bank SURVIVE REGION FAILURE;      -- 5 replicas over 3 regions

CREATE TABLE accounts (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- random: no hot tail
  owner   STRING NOT NULL,
  balance DECIMAL(19,4) NOT NULL CHECK (balance >= 0)
) LOCALITY REGIONAL BY ROW;                     -- row lives in its home region

-- time-ordered key without a hot range: hash-sharded primary key
CREATE TABLE events (
  ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
  id      UUID NOT NULL DEFAULT gen_random_uuid(),
  payload JSONB,
  PRIMARY KEY (ts, id) USING HASH
);

-- lock early: concurrent writers wait instead of failing with 40001
BEGIN;
SELECT balance FROM accounts WHERE id = $1 FOR UPDATE;
UPDATE accounts SET balance = balance - 10 WHERE id = $1;
COMMIT;

-- stale-but-local read for dashboards
SELECT owner, balance FROM accounts
  AS OF SYSTEM TIME follower_read_timestamp() WHERE owner = 'alice';

SHOW RANGES FROM TABLE accounts;                -- see splits and leaseholders`
    },
    {
      title: 'Python: a hybrid logical clock (HLC)', lang: 'python',
      code: `import time

class HLC:
    """Kulkarni et al. hybrid logical clock: (wall_ns, logical)."""
    def __init__(self, max_offset_ns=500_000_000, clock=time.time_ns):
        self.l, self.c, self.max_offset, self.clock = 0, 0, max_offset_ns, clock

    def now(self):                      # local event or message send
        pt = self.clock()
        if pt > self.l:
            self.l, self.c = pt, 0
        else:
            self.c += 1                 # wall clock behind: bump logical part
        return (self.l, self.c)

    def update(self, ml, mc):           # message received with timestamp (ml, mc)
        pt = self.clock()
        if ml - pt > self.max_offset:
            raise RuntimeError("remote clock too far ahead: refuse")
        old = self.l
        self.l = max(old, ml, pt)
        if self.l == old == ml: self.c = max(self.c, mc) + 1
        elif self.l == old:     self.c += 1
        elif self.l == ml:      self.c = mc + 1
        else:                   self.c = 0
        return (self.l, self.c)

# tuples compare lexicographically, so HLC timestamps sort like (wall, logical)`,
      note: 'The HLC stays close to wall time but never goes backwards and respects causality. It cannot order two unrelated events closer together than the clock offset, which is why the uncertainty window exists.'
    }
  ],

  related: ['kv-store', 'lock-manager', 'payment-gateway', 'unique-id', 'message-queue']
});
