SD.register({
  slug: 'multi-region',
  domain: 1,
  title: 'Multi-Region Active-Active',
  examples: 'Netflix, Uber, DynamoDB Global Tables',
  tagline: 'Run the same product <b>live in several regions at once</b>: steer each user to a nearby healthy region, give every piece of data a clear rule for <b>who may write it</b>, and keep enough spare capacity that losing a whole region is a non-event.',
  tldr: {
    problem: 'One region is a single point of failure and is far from most of the world. Copying <b>stateless code</b> to more regions is easy. <b>Data</b> is hard: two regions can write the same thing at once, and whatever was not copied yet is gone when a region dies.',
    idea: 'Steer each user to a nearby healthy region. Then pick a strategy <b>per data class</b>: async multi-master with a merge rule (LWW or CRDT) for data that can merge, <b>one home region per user or entity</b> for most writes, and <b>cross-region consensus</b> only for the small set that must never diverge.',
    insight: 'Active-active is also a <b>capacity promise</b>. With N equal regions each one may run at most <b>(N−1)/N</b> busy, or the survivors fall over when a neighbour fails. You only know the promise holds if you <b>evacuate regions on purpose</b>.',
    numbers: [
      { v: '≈ 7 min', l: 'Netflix full-region failover after pre-scaling (Project Nimble), down from ~45 min (2018 talk)' },
      { v: '0.5–2.5 s', l: 'typical DynamoDB global-table replication lag between Regions in one geography (AWS)' },
      { v: '(N−1)/N', l: 'max steady-state utilisation when any one of N equal regions may fail' }
    ]
  },

  intro: {
    what: 'A multi-region active-active system runs the same application in two or more <b>cloud regions</b> (separate groups of data centres, often on different continents). <b>Every region serves real users at the same time.</b> Each user is sent to a nearby region, and if a whole region fails, the other regions take over its users.',
    analogy: {
      icon: '🏦',
      title: 'One bank, three branches in three cities',
      text: 'Each branch serves its own customers at the counter and sends the other branches copies of every account change. If one branch floods, its customers walk to another branch, which needs enough tellers for the extra queue. The tricky case: the same account is changed at two branches before their copies cross, and someone must decide which change wins. Unlike real branches, regions exchange copies within a second or two, not at the end of the day.'
    },
    problem: 'Your app runs in one region. One afternoon that region has a networking outage for four hours, and every user worldwide sees errors. Users far away were already waiting 150 ms or more for every request. A copy of the app in a second region fixes the code half. The hard half is the data: <b>how can several regions accept writes, stay close to each other, and lose a region without losing users or data?</b>',
    story: [
      {
        stage: 'naive',
        title: 'One region, one database',
        text: 'All users, from every continent, talk to <b>one app and one database in us-east</b>. It is simple and always consistent, because there is only one copy of the data.',
        scene: {
          nodes: [
            { id: 'ueu', label: 'Users (EU)', sub: '+90 ms away', kind: 'client', at: [70, 0] },
            { id: 'uus', label: 'Users (US)', sub: 'nearby', kind: 'client', at: [350, 0] },
            { id: 'rus', label: 'us-east app', sub: 'the only region', kind: 'service', at: [210, 110] },
            { id: 'dbus', label: 'Database', sub: 'one primary', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'ueu', to: 'rus' }, { from: 'uus', to: 'rus' }, { from: 'rus', to: 'dbus' }],
          flow: [['ueu>rus', 'uus>rus'], 'rus>dbus']
        }
      },
      {
        stage: 'breaks',
        title: 'The region goes dark',
        text: 'A power or network failure takes out the <b>whole region</b>. Spare servers inside that region do not help, so every user is down until it returns. A cold backup elsewhere takes hours to restore and misses the latest writes.',
        scene: {
          nodes: [
            { id: 'ueu', label: 'Users (EU)', sub: 'errors', kind: 'client', at: [70, 0] },
            { id: 'uus', label: 'Users (US)', sub: 'errors', kind: 'client', at: [350, 0] },
            { id: 'rus', label: 'us-east app', sub: 'region outage', kind: 'service', at: [210, 110] },
            { id: 'dbus', label: 'Database', sub: 'unreachable', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'ueu', to: 'rus' }, { from: 'uus', to: 'rus' }, { from: 'rus', to: 'dbus' }],
          flow: [['ueu>rus', 'uus>rus']],
          err: ['rus', 'dbus'],
          badges: { rus: ['down', 'err'], ueu: ['5xx', 'err'], uus: ['5xx', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Every region live, data copied between them',
        text: 'Run a full copy in each region and send each user to the <b>nearest healthy one</b>. Each region writes locally and <b>copies changes to the others in the background</b>. Give every user one <b>home region</b> for writes so two regions never edit the same record. If a region dies, steer its users elsewhere.',
        scene: {
          nodes: [
            { id: 'ueu', label: 'Users (EU)', sub: '→ nearest', kind: 'client', at: [70, 0] },
            { id: 'uus', label: 'Users (US)', sub: '→ nearest', kind: 'client', at: [350, 0] },
            { id: 'reu', label: 'eu-west app', sub: 'live', kind: 'service', at: [70, 110] },
            { id: 'rus', label: 'us-east app', sub: 'live', kind: 'service', at: [350, 110] },
            { id: 'dbeu', label: 'EU database', sub: 'home of EU users', kind: 'store', at: [70, 220] },
            { id: 'rep', label: 'Replication', sub: 'async, ~1 s', kind: 'queue', at: [210, 220] },
            { id: 'dbus', label: 'US database', sub: 'home of US users', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'ueu', to: 'reu' }, { from: 'uus', to: 'rus' }, { from: 'reu', to: 'dbeu' }, { from: 'rus', to: 'dbus' }, { from: 'dbeu', to: 'rep', bidi: true }, { from: 'rep', to: 'dbus', bidi: true }],
          flow: [['ueu>reu', 'uus>rus'], ['reu>dbeu', 'rus>dbus'], 'dbeu>rep', 'rep>dbus'],
          ok: ['reu', 'rus'],
          badges: { rep: ['lag 0.8 s', 'ok'] }
        }
      }
    ],
    usedBy: ['Netflix', 'Uber', 'Amazon DynamoDB global tables', 'Google Cloud Spanner (multi-region)', 'Shopify (pods)', 'CockroachDB (multi-region)'],
    whenToUse: [
      'A region-wide outage would cost more than running, and regularly testing, a second or third full copy',
      'Users are spread over continents and every extra round trip hurts',
      'Laws keep some users\' data in their own region, but the product must stay global'
    ],
    whenNot: [
      'One region with several availability zones already meets your availability target: most outages are zone-level',
      'Almost every write needs one global order (a single stock count, a ledger) and cannot pay cross-region latency: keep one home region, or use <a href="distributed-sql.html">Distributed SQL</a> for that slice',
      'You only need fast <i>static files</i> worldwide: a <a href="cdn.html">CDN</a> does that without moving the database'
    ],
    glossary: [
      { term: 'Region', def: 'A cloud provider\'s group of data centres in one metro area (us-east, eu-west), with its own power and network, far from other regions.' },
      { term: 'Active-passive vs active-active', def: 'Active-passive keeps a standby region that only takes traffic after a failover; active-active serves live traffic from every region all the time.' },
      { term: 'Home region', def: 'The one region allowed to write a given user\'s, tenant\'s or entity\'s data; other regions keep read copies and forward writes to it.' },
      { term: 'Replication lag', def: 'How long a committed write takes to appear in another region\'s copy.' },
      { term: 'RPO / RTO', def: 'Recovery point objective: how much recent data you may lose. Recovery time objective: how long until service is back.' },
      { term: 'Last-writer-wins (LWW)', def: 'A conflict rule that keeps the write with the newest timestamp and silently drops the other.' },
      { term: 'CRDT', def: 'Conflict-free replicated data type: a value (counter, set) whose copies can be merged in any order and always agree, without losing updates.' },
      { term: 'Fencing (epoch)', def: 'A number that goes up each time ownership moves, so writes from an old owner that still thinks it is in charge are rejected.' }
    ]
  },

  requirements: {
    functional: [
      'Serve each user from a nearby healthy region; reads and most writes stay local',
      'Survive the loss of a whole region with no manual data repair',
      'Every user, tenant or entity has one clear <b>home region</b> for writes, which can move on failover',
      'Merge concurrent writes for the few data types that accept writes everywhere',
      'Evacuate a region on demand, for drills, risky deploys and incidents',
      'Keep regulated users\' personal data inside their legal region'
    ],
    nonFunctional: [
      'No cross-region call on the user\'s critical path; local p99 under ~100 ms',
      'RTO for a region loss in minutes, not hours',
      'RPO of seconds for async data, zero for the consensus data class',
      'Surviving regions absorb a failed region\'s load without tipping over',
      'Replication lag measured per region pair, with alerts',
      'Cross-region egress cost known and budgeted'
    ],
    outOfScope: ['How one store replicates inside a region (see Key-Value Store)', 'Raft, Paxos and TrueTime internals (see Distributed SQL)', 'Edge caching of static content (see CDN)', 'Zone-level failover inside one region']
  },

  calculator: {
    inputs: [
      { id: 'n', label: 'Regions (N)', min: 2, max: 7, value: 3 },
      { id: 'rps', label: 'Global peak requests / second', min: 1000, max: 10000000, value: 300000, log: true },
      { id: 'wf', label: 'Share of requests that write', min: 1, max: 50, value: 10, unit: '%' },
      { id: 'bytes', label: 'Replicated bytes per write (row + log overhead)', min: 100, max: 20000, step: 100, value: 1500, fmt: 'bytes' },
      { id: 'lag', label: 'Replication lag at the moment of failure', min: 0.1, max: 10, step: 0.1, value: 1, unit: 's' },
      { id: 'usd', label: 'Inter-region transfer price ($ per GB)', min: 0.01, max: 0.15, step: 0.01, value: 0.02 }
    ],
    outputs: [
      { label: 'Safe steady utilisation per region (≤ 85 % after losing one)', fmt: 'pct', f: (v) => 0.85 * (v.n - 1) / v.n },
      { label: 'Fleet size vs. one region at 85 %', fmt: 'raw', f: (v) => (v.n / (v.n - 1)).toFixed(2) + '×' },
      { label: 'Global writes / second', f: (v) => v.rps * v.wf / 100 },
      { label: 'Cross-region replication traffic (each write to N−1 regions)', fmt: 'bytesps', f: (v) => v.rps * v.wf / 100 * v.bytes * (v.n - 1) },
      { label: 'Replication transfer cost per month', fmt: 'raw', f: (v) => '$' + SD.fmt.num(Math.round(v.rps * v.wf / 100 * v.bytes * (v.n - 1) * 2592000 / 1e9 * v.usd)) },
      { label: 'Async writes at risk when one region dies (RPO window)', f: (v) => Math.round(v.rps * v.wf / 100 / v.n * v.lag) }
    ],
    note: 'Request mix, bytes per write and the 85 % ceiling are <em>estimates</em>. The transfer price is an <em>estimate</em> too: around $0.02/GB is commonly quoted between big US regions, other pairs cost more, and you pay it per destination region. The capacity rule assumes equal regions: with unequal regions the <b>largest</b> one sets the limit (see the widget). Peak traffic is assumed to spread evenly, so it is also an <em>estimate</em>.'
  },

  api: [
    { m: 'GET', p: '/internal/home/{userId}', d: 'Home directory lookup: <code>{region, epoch, residency}</code>. Read from a <b>local cache</b> in every region, so routing never crosses an ocean.' },
    { m: 'POST', p: '/v1/orders  (Idempotency-Key)', d: 'A write. If this region is not the user\'s home it is forwarded (or 307-redirected) to the home region. The idempotency key makes a retry after a failover safe, and order ids come from a region-aware generator, so two regions never mint the same id.' },
    { m: 'POST', p: '/admin/traffic/evacuate', d: '<code>{region, percent, rampMinutes}</code>. Shifts steering weights away from a region in steps, after the other regions are pre-scaled.' },
    { m: 'POST', p: '/admin/home/move', d: '<code>{shard, toRegion}</code>. A consensus write that bumps the shard\'s <b>epoch</b>. The old home stops writing when its lease lapses, and its late writes are fenced off by epoch.' },
    { m: 'GET', p: '/admin/replication/lag?from&to', d: 'p50 / p99 lag and the age of the oldest unreplicated write for one region pair. This number <i>is</i> your current async RPO.' }
  ],
  dataModel: [
    { name: 'home_directory', store: 'Consensus store (multi-region quorum), cached in every region', fields: [['shard_id', 'int', 'pk'], ['home_region', 'text'], ['epoch', 'bigint'], ['lease_until', 'timestamptz'], ['residency', 'text (e.g. EU-only)']], note: 'Tiny and read on every write, so every region caches it. It changes only on a move or a failover, and only through a majority write.' },
    { name: 'profile', store: 'Regional SQL; written only in the home region, async replicas elsewhere', fields: [['user_id', 'bigint', 'pk'], ['data', 'jsonb'], ['epoch', 'bigint'], ['version', 'bigint'], ['updated_at', 'timestamptz']], note: 'The replication applier keeps a row only if <code>(epoch, version)</code> is newer, so a deposed home cannot overwrite newer data.' },
    { name: 'counter_slot', store: 'Multi-master table (PN-counter CRDT)', fields: [['key', 'text', 'pk'], ['region', 'text', 'sk'], ['incr', 'bigint'], ['decr', 'bigint']], note: 'Each region writes only its own row. Merge = max per row; value = Σ incr − Σ decr. Use it for likes, view counts and quotas, not for money.' },
    { name: 'repl_heartbeat', store: 'Every regional DB (replicated like normal data)', fields: [['source_region', 'text', 'pk'], ['seq', 'bigint'], ['written_at', 'timestamptz']], note: 'Each region writes its row every second. In region B, <code>now() − written_at</code> for source A is the A→B lag, measured end to end.' }
  ],

  architecture: {
    title: 'Three regions, active-active with home-region writes',
    nodes: [
      { id: 'users', label: 'Users', sub: 'worldwide', kind: 'client', wide: [470, 0], tall: [210, 0], tip: 'Web and mobile clients. They retry with idempotency keys, so a request repeated after a failover does not double-apply.' },
      { id: 'ctrl', label: 'Traffic control', sub: 'evacuate · re-home', kind: 'compute', wide: [800, 0], tall: [350, 0], tip: 'The control plane. It watches health from several vantage points, changes steering weights, pre-scales survivors and moves home regions. It must keep working while a region is down, so it is not hosted only in one region.' },
      { id: 'glob', label: 'Consensus store', sub: 'quorum across 3 regions', kind: 'store', wide: [150, 110], tall: [70, 105], tip: 'Spanner, CockroachDB, DynamoDB MRSC or etcd-style. Every region\'s stack uses it (only two edges are drawn). It holds the small data that must never diverge: home assignments and epochs, unique usernames, balances. Each write waits for a majority of regions, about one inter-region round trip.' },
      { id: 'steer', label: 'Global steering', sub: 'GeoDNS · anycast LB', kind: 'edge', wide: [470, 110], tall: [210, 105], tip: 'Sends each user to the nearest healthy region. DNS steering is cheap but slow to change (resolver caches). Anycast or a global load balancer moves new connections within seconds.' },
      { id: 'home', label: 'Home directory', sub: 'user → region, epoch', kind: 'cache', wide: [800, 110], tall: [350, 105], tip: 'A read-local cache of the home table. Writes for a user homed elsewhere are forwarded to the home region; reads stay local and may be a little stale.' },
      { id: 'ra', label: 'us-east stack', sub: 'gateway · services', kind: 'service', wide: [200, 225], tall: [70, 215], tip: 'A full copy of the stateless tier, plus a regional cache and queue. No synchronous call leaves the region on the user\'s path.' },
      { id: 'rb', label: 'eu-west stack', sub: 'gateway · services', kind: 'service', wide: [470, 225], tall: [210, 215], tip: 'Identical stack. It also serves EU-resident users whose personal data must not leave the EU.' },
      { id: 'rc', label: 'ap-south stack', sub: 'gateway · services', kind: 'service', wide: [740, 225], tall: [350, 215], tip: 'Identical stack. Sized so that it and one other region can carry the whole load if a third fails.' },
      { id: 'dba', label: 'us-east DB', sub: 'home for US users', kind: 'store', wide: [200, 340], tall: [70, 325], tip: 'Primary for users homed in us-east, plus async replicas of everyone else.' },
      { id: 'dbb', label: 'eu-west DB', sub: 'home for EU users', kind: 'store', wide: [470, 340], tall: [210, 325], tip: 'Primary for users homed in eu-west. EU-only data is never replicated out.' },
      { id: 'dbc', label: 'ap-south DB', sub: 'home for AP users', kind: 'store', wide: [740, 340], tall: [350, 325], tip: 'Primary for users homed in ap-south.' },
      { id: 'repl', label: 'Replication', sub: 'async log · lag ~1 s', kind: 'queue', wide: [470, 455], tall: [210, 435], tip: 'Ships each region\'s commits to the others (CDC, a Kafka-style log or the database\'s own replication). Lag per pair is the async RPO, so it is graphed and alerted.' }
    ],
    edges: [
      { from: 'users', to: 'steer' },
      { from: 'ctrl', to: 'steer', label: 'weights' },
      { from: 'ctrl', to: 'home' },
      { from: 'steer', to: 'home', dashed: true, label: 'lookup' },
      { from: 'steer', to: 'ra' },
      { from: 'steer', to: 'rb' },
      { from: 'steer', to: 'rc' },
      { from: 'ra', to: 'glob' },
      { from: 'rb', to: 'glob' },
      { from: 'ra', to: 'dba' },
      { from: 'rb', to: 'dbb' },
      { from: 'rc', to: 'dbc' },
      { from: 'dba', to: 'repl', bidi: true },
      { from: 'dbb', to: 'repl', bidi: true },
      { from: 'dbc', to: 'repl', bidi: true }
    ]
  },

  scenarios: [
    {
      id: 'local', title: 'Normal day: read local, write home', tone: 'info',
      steps: [
        { text: 'A user in Frankfurt opens the app. <b>Global steering</b> (GeoDNS or anycast) picks the nearest healthy region and checks the cached <b>home directory</b>: this user is homed in eu-west, epoch 3.', flow: ['users>steer', 'steer>home'], badges: { home: 'eu-west · ep 3' } },
        { text: 'The request lands in eu-west. Reads and writes go to the <b>local database</b> in a few milliseconds. No call crosses an ocean.', flow: ['steer>rb', 'rb>dbb'], ok: ['rb'], badges: { dbb: '≈ 5 ms' }, tone: 'ok' },
        { text: 'The commit is shipped <b>asynchronously</b> to the other regions. The user never waits for it. The copies are about a second behind.', flow: ['dbb>repl', ['repl>dba', 'repl>dbc']], badges: { repl: 'lag 0.8 s' } },
        { text: 'A traveller homed in us-east is now in Europe. Reads are served from eu-west\'s replica (possibly a second stale). Writes are <b>forwarded to us-east</b> and pay one transatlantic round trip, but they never conflict.', flow: ['steer>rb', 'rb>ra', 'ra>dba'], badges: { ra: '+1 RTT' }, tone: 'warn' }
      ]
    },
    {
      id: 'conflict', title: 'Same key written in two regions', tone: 'warn',
      steps: [
        { text: 'A like counter is <b>multi-master</b>: any region accepts the write. A US user and an EU user like the same post within one second.', flow: ['users>steer', ['steer>ra', 'steer>rb'], ['ra>dba', 'rb>dbb']], badges: { dba: '10 → 11', dbb: '10 → 11' } },
        { text: 'Both regions read 10 and wrote 11 <b>before either copy arrived</b>. Their changes cross in the replication log.', flow: [['dba>repl', 'dbb>repl'], ['repl>dbb', 'repl>dba']], warn: ['repl'], badges: { repl: ['concurrent', 'warn'] }, tone: 'warn' },
        { text: '<b>Last-writer-wins</b>: the higher timestamp wins in both regions, so they converge to 11. <b>One like is silently lost.</b> DynamoDB global tables in their default mode resolve concurrent writes to an item this way.', nodes: ['dba', 'dbb'], err: ['dba', 'dbb'], badges: { dba: ['11 ✗', 'err'], dbb: ['11 ✗', 'err'] }, tone: 'err' },
        { text: '<b>CRDT counter</b>: each region counts only its own likes ({us: 6, eu: 5}). Merge takes the max per region and the value is the sum, so both converge to <b>12</b>.', nodes: ['dba', 'dbb'], ok: ['dba', 'dbb'], badges: { dba: ['12 ✓', 'ok'], dbb: ['12 ✓', 'ok'] }, tone: 'ok' },
        { text: 'For data with no clean merge (a cart, a profile), either keep both versions and merge in the app, or <b>route all writes to the home region</b> so concurrent edits are serialised there.', flow: ['rb>ra', 'ra>dba'], badges: { ra: 'home' } }
      ]
    },
    {
      id: 'evac', title: 'Region failure → evacuation', tone: 'err',
      steps: [
        { text: 'ap-south loses connectivity. Health checks from several vantage points fail, and the control plane declares the region unhealthy, typically within a minute or two.', nodes: ['rc', 'dbc', 'ctrl'], err: ['rc', 'dbc'], badges: { rc: ['down', 'err'] }, tone: 'err' },
        { text: 'Steering weight for ap-south is set to 0. Anycast or a global load balancer moves new connections in seconds. DNS changes too, but resolvers that cached the old answer keep sending users there <b>until the TTL expires</b>, and some hold it longer.', flow: ['ctrl>steer', ['steer>ra', 'steer>rb']], badges: { steer: 'ap-south: 0 %' }, tone: 'warn' },
        { text: 'With N = 3 equal regions, each survivor now carries <b>1.5×</b> its normal load. At ≤ 66 % utilisation before, it lands at ≤ 100 %. Pre-scaled spare capacity covers the minutes autoscaling needs.', nodes: ['ra', 'rb'], warn: ['ra', 'rb'], badges: { ra: ['+50 %', 'warn'], rb: ['+50 %', 'warn'] } },
        { text: 'Users homed in ap-south get a new home. The control plane writes the move to the <b>consensus store</b> and bumps the epoch, so late writes from ap-south are fenced off.', flow: ['ctrl>home', 'ra>glob'], badges: { home: 'AP users → us-east · ep 8' } },
        { text: 'Writes ap-south acknowledged but had not yet shipped are lost to the survivors. That gap is the <b>async RPO</b>, roughly the lag at the moment of failure. Reconcile them from its log if the region comes back, or accept the loss for that data class.', nodes: ['repl', 'dbc'], err: ['dbc'], badges: { repl: ['RPO ≈ 1 s', 'err'] }, tone: 'err' }
      ]
    },
    {
      id: 'herd', title: 'Hot spot: failover herd and cold caches', tone: 'warn',
      steps: [
        { text: 'A third of all users arrive at us-east and eu-west at once. Their sessions and hot data are <b>not in these regions\' caches</b>, so miss traffic hammers the databases.', flow: [['steer>ra', 'steer>rb'], ['ra>dba', 'rb>dbb']], warn: ['dba', 'dbb'], badges: { dba: ['miss storm', 'warn'], dbb: ['miss storm', 'warn'] }, tone: 'warn' },
        { text: 'Autoscaling takes minutes (boot, warm-up, register). So <b>scale the survivors first, then shift traffic</b>. Netflix describes the same order in Project Nimble: detect, pre-scale the "savior" regions, then move traffic.', nodes: ['ctrl', 'ra', 'rb'], badges: { ctrl: 'pre-scale ↑' } },
        { text: 'Shift in steps (10 % → 50 % → 100 %) while watching error rate and DB load. Shed low-priority work (recommendations, analytics) before critical paths (playback, checkout).', flow: ['ctrl>steer', 'steer>ra', 'steer>rb'], badges: { steer: '10→50→100 %' } },
        { text: 'Replication now carries more writes. Watch lag per region pair until the backlog drains, then declare the evacuation complete.', flow: ['dba>repl', 'dbb>repl'], ok: ['repl', 'ra', 'rb'], badges: { repl: ['lag back < 1 s', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'split', title: 'Partition: split-brain and fencing', tone: 'err',
      steps: [
        { text: 'The link between us-east and eu-west breaks, but <b>both regions are up</b>. Each one sees the other as down.', nodes: ['ra', 'rb', 'repl'], warn: ['repl'], badges: { repl: ['US ✂ EU', 'err'] }, tone: 'warn' },
        { text: 'If each region could promote itself, both would become home for the same users: <b>two writers, diverging data</b>. That is split-brain.', nodes: ['ra', 'rb', 'dba', 'dbb'], err: ['dba', 'dbb'], badges: { dba: ['writer?', 'err'], dbb: ['writer?', 'err'] }, tone: 'err' },
        { text: 'Rule: only the control plane moves a home, and only through a <b>majority write</b> in the consensus store. ap-south is the tie-breaker: 2 of 3 regions agree to move these users to eu-west, epoch 4 → 5.', flow: ['rb>glob', 'ctrl>home'], ok: ['glob'], badges: { glob: ['2 of 3 · ep 5', 'ok'] } },
        { text: 'The old home holds a <b>time-bound lease</b> it can no longer renew, so it stops taking writes before the new home starts. Writes it sent just before that carry epoch 4, and replicas reject them because the rows already have epoch 5.', nodes: ['ra', 'dba'], warn: ['ra'], badges: { ra: ['lease lost', 'warn'] } },
        { text: 'The minority side is briefly <b>unavailable for writes, but never wrong</b>. When the link heals, replication catches up and the lag alarm clears.', flow: ['dbb>repl', 'repl>dba'], ok: ['dba', 'dbb'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose a topology, the region count, how hot each region runs and how traffic is steered. The meters use real arithmetic for capacity; latencies assume an <em>illustrative</em> ~80 ms inter-region round trip.',
    controls: [
      { id: 'model', label: 'Topology / write model', type: 'seg', value: 'home', options: [
        { v: 'ap', l: 'Active-passive (warm standby)' }, { v: 'mm', l: 'Active-active, multi-master (LWW)' }, { v: 'home', l: 'Active-active, home region' }, { v: 'cons', l: 'Consensus across regions' }] },
      { id: 'n', label: 'Regions', type: 'seg', value: '3', options: [{ v: '2', l: '2' }, { v: '3', l: '3' }, { v: '5', l: '5' }] },
      { id: 'util', label: 'Normal peak utilisation per region', type: 'range', min: 30, max: 90, step: 5, value: 60, unit: '%' },
      { id: 'steer', label: 'Traffic steering', type: 'seg', value: 'dns', options: [{ v: 'dns', l: 'GeoDNS (TTL 60 s)' }, { v: 'any', l: 'Anycast / global LB' }] }
    ],
    evaluate(s) {
      const n = +s.n, u = s.util / 100, m = s.model;
      // after losing one region, survivors share its load evenly (equal regions)
      const after = m === 'ap' ? u / 0.3 : u * n / (n - 1);             // warm standby sized at 30 % of primary
      const fleet = m === 'ap' ? (1 + 0.3 * (n - 1)) / u : 1 / u;           // primary + (N−1) warm standbys at 30 %
      const consNoQuorum = m === 'cons' && n === 2;
      const steerMin = s.steer === 'dns' ? 3 : 0.5;                         // detection + propagation (estimate)
      const extra = { ap: 10, mm: 0, home: 0.5, cons: 0 }[m];               // promote + scale standby / re-home
      const scaleMin = after > 1 ? 6 : 0;                                   // autoscaling catches up (estimate)
      const rto = consNoQuorum ? Infinity : 1 + steerMin + extra + scaleMin;
      const lat = {
        ap: ['≈ 5 ms near primary, ≈ 80 ms elsewhere', 0.35],
        mm: ['≈ 5 ms everywhere', 0.95],
        home: ['≈ 5 ms at home, +1 RTT when away', 0.8],
        cons: [n === 5 ? '≈ RTT to 2nd-nearest region (≈ 100 ms)' : '≈ RTT to nearest other region (≈ 40–80 ms)', n === 5 ? 0.3 : 0.4]
      }[m];
      const rpo = {
        ap: ['≈ replication lag (seconds)', 0.6],
        mm: ['lag (s) + concurrent writes LWW drops', 0.35],
        home: ['≈ lag (s), only for the failed region\'s users', 0.65],
        cons: consNoQuorum ? ['writes stop: no majority', 0.1] : ['0 (majority commit)', 1]
      }[m];
      const conflicts = { ap: ['none (one writer)', 0.95], mm: ['yes: same key in two regions', 0.25], home: ['none (one writer per entity)', 0.9], cons: ['none (serialised)', 1] }[m];
      const metrics = [
        { k: 'Write latency', v: lat[0], s: lat[1] },
        { k: 'RPO on region loss', v: rpo[0], s: rpo[1] },
        { k: 'Write conflicts', v: conflicts[0], s: conflicts[1] },
        { k: 'RTO (estimate)', v: rto === Infinity ? 'until the region returns' : '≈ ' + rto.toFixed(1) + ' min', s: rto === Infinity ? 0.05 : Math.max(0.05, Math.min(1, 1 - (rto - 1.5) / 18)) },
        { k: 'Survivor load after 1 loss', v: Math.round(after * 100) + ' %' + (after > 1 ? ' → shed ' + Math.round((1 - 1 / after) * 100) + ' %' : ''), s: after <= 0.85 ? 0.9 : after <= 1 ? 0.55 : 0.1, hint: m === 'ap' ? 'standby sized at 30 %' : 'util × N/(N−1)' },
        { k: 'Fleet cost (capacity ÷ peak)', v: fleet.toFixed(2) + '×', s: Math.max(0.05, Math.min(1, 1.6 / fleet - 0.2)) },
        { k: 'Cross-region copies per write', v: (n - 1) + (m === 'ap' ? ' (to the standbys)' : ' (to every other region)'), s: n === 2 ? 0.8 : n === 3 ? 0.65 : 0.4 }
      ];
      const notes = [];
      const safe = Math.round((n - 1) / n * 100);
      if (m !== 'ap') notes.push(`With ${n} equal regions each may run at most <b>${safe} %</b> busy at peak (that is (N−1)/N) for the survivors to stay at or under 100 % after one loss. Leave room under that for spikes.`);
      if (m === 'ap') notes.push('The standby is cheap because it is small, but after failover it must <b>scale up before it can take full load</b>. That is most of the RTO, and failover is a rare, scary event unless you drill it.');
      if (m === 'mm') notes.push('Last-writer-wins keeps one of two concurrent writes and drops the other with no error. Use it only where that is acceptable, and use CRDTs (counters, sets) where it is not.');
      if (m === 'home') notes.push('Moving a home must be a consensus write with an epoch bump, and the old home must stop on lease expiry. Otherwise a partition creates two writers.');
      if (m === 'cons') notes.push(n === 2 ? 'A majority of 2 is 2, so losing either region stops all writes. Add a third region, or at least a witness replica.' : 'Every commit waits for a majority of regions, so pick nearby regions for the voters, or a leader region close to most writers. Use it for the small, critical slice of data.');
      if (s.steer === 'dns') notes.push('DNS failover waits for detection plus the TTL, and some resolvers and clients cache longer than the TTL. Netflix avoided latency-based DNS routing because traffic moved unpredictably.');
      else notes.push('Anycast or a global load balancer keeps the same IPs and moves new connections within seconds of health checks failing. Existing long-lived connections still have to reconnect.');
      let verdict;
      if (consNoQuorum) verdict = '❌ <b>Two-region consensus cannot survive a region loss.</b> A majority of 2 is 2. Add a third voting region or a witness.';
      else if (after > 1) verdict = `⚠ <b>Survivors would run at ${Math.round(after * 100)} %.</b> They shed load until autoscaling catches up. ` + (m === 'ap' ? 'Keep a bigger warm standby or accept a long RTO.' : `Keep normal utilisation at or below ${safe} %, or add a region.`);
      else if (m === 'mm') verdict = '⚠ <b>Fast everywhere, but concurrent writes are silently lost under LWW.</b> Limit multi-master to data that merges cleanly.';
      else if (m === 'home') verdict = '✅ <b>Good default:</b> local reads everywhere, local writes for most users, no conflicts, and an RPO of seconds for one region\'s users.';
      else if (m === 'cons') verdict = '👍 <b>No data loss and no conflicts</b>, but every write pays a cross-region quorum. Use it for the critical slice, not for everything.';
      else verdict = '👍 <b>Simplest to build.</b> Failover is slow and rarely exercised. Drill it, or the standby will not work on the day.';
      const hide = [];
      if (n === 2) hide.push('rc', 'dbc');
      if (m === 'ap' || m === 'mm') hide.push('glob');
      if (m !== 'home') hide.push('home');
      const dbSub = { ap: ['primary', 'standby replica', 'standby replica'], mm: ['multi-master', 'multi-master', 'multi-master'], home: ['home for US users', 'home for EU users', 'home for AP users'], cons: ['voting replica', 'voting replica', 'voting replica'] }[m];
      const labels = {
        dba: { label: 'us-east DB', sub: dbSub[0] }, dbb: { label: 'eu-west DB', sub: dbSub[1] }, dbc: { label: n === 5 ? '+3 more regions' : 'ap-south DB', sub: dbSub[2] },
        rb: { label: 'eu-west stack', sub: m === 'ap' ? 'warm standby (idle)' : 'gateway · services' },
        rc: { label: n === 5 ? '+3 more stacks' : 'ap-south stack', sub: m === 'ap' ? 'warm standby (idle)' : 'gateway · services' },
        steer: { label: 'Global steering', sub: s.steer === 'dns' ? 'GeoDNS · TTL 60 s' : 'anycast · global LB' },
        repl: { label: m === 'cons' ? 'Consensus log' : 'Replication', sub: m === 'cons' ? 'majority commit' : 'async · lag ~1 s' },
        glob: { label: 'Consensus store', sub: m === 'cons' ? 'all data · quorum' : 'homes · epochs' }
      };
      let flow;
      if (m === 'ap') flow = ['users>steer', 'steer>ra', 'ra>dba', 'dba>repl', 'repl>dbb'];
      else if (m === 'mm') flow = ['users>steer', ['steer>ra', 'steer>rb'], ['ra>dba', 'rb>dbb'], ['dba>repl', 'dbb>repl']];
      else if (m === 'home') flow = ['users>steer', 'steer>home', 'steer>rb', 'rb>dbb', 'dbb>repl', 'repl>dba'];
      else flow = ['users>steer', 'steer>rb', 'rb>glob', 'rb>dbb', 'dbb>repl', 'repl>dba'];
      return {
        metrics, verdict, notes, labels, hide, flow,
        warn: after > 1 ? ['ra', 'rb'] : m === 'mm' ? ['repl'] : [],
        err: consNoQuorum ? ['glob', 'repl'] : [],
        ok: m === 'home' && after <= 1 ? ['home'] : [],
        badges: { steer: [s.steer === 'dns' ? 'TTL 60 s' : 'seconds', s.steer === 'dns' ? 'warn' : 'ok'], ra: [Math.round(u * 100) + ' % busy', after > 1 ? 'err' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Three regions: replication lag, conflicts and failover',
    caption: 'Every region holds a copy of one <b>like counter</b>. Writes copy to the other regions after the <b>replication lag</b>. Press <b>US + EU at once</b> in each mode: <b>LWW</b> loses a like, the <b>CRDT</b> keeps both, and <b>Home region</b> forwards the EU write to us-east (slower, no conflict). <b>Cut US↔EU</b> to hold messages, then heal. <b>Tap a region</b> (or Fail US) to kill it: watch the survivors\' load against the headroom slider, and count the writes lost because they had not replicated yet.'
  },

  realWorld: {
    intro: 'Public write-ups agree on the shape: keep the request path inside one region, replicate asynchronously, choose a conflict rule per data type, and practise failover until it is routine.',
    timeline: [
      { when: '2013', who: 'Netflix', title: 'Active-Active for Multi-Regional Resiliency', text: 'Netflix served members in the Americas from two AWS regions at once. The design rule was <b>no cross-region calls on the user\'s call path</b>. State was replicated asynchronously with <b>Cassandra</b> multi-datacenter replication, and EVCache got cross-region invalidation. Traffic moved with Route 53 layered on UltraDNS. They avoided latency-based routing because traffic moved unpredictably, and ran split-brain exercises many times.', src: 0 },
      { when: '2016', who: 'Netflix', title: 'Global Cloud: three regions, steer to both survivors', text: 'With three regions, Netflix\'s improved traffic steering could <b>evacuate one region into both remaining regions</b> to use their spare capacity. Personalisation data once precomputed in one region and copied was reworked so that recompute events reach all three regions.', src: 1 },
      { when: '2018', who: 'Netflix', title: 'Project Nimble: ~45 min → ~7 min failover', text: 'Failover used to take <b>about 45 minutes</b>, mostly scaling up the survivors. Nimble <b>pre-scales the "savior" regions</b> and then shifts traffic: about 2 min to detect, 4 min to scale and 3 min to shift, roughly <b>7 minutes</b> in total.', src: 2 },
      { when: '2017', who: 'Shopify', title: 'Pods: one active region per shard', text: 'A pod is an isolated slice of Shopify (shops and their datastores). Each pod is <b>active in one region and replicated to a second</b>. A routing layer called Sorting Hat sends each request to the pod\'s active region, and failover means re-pointing routing, failing over MySQL and moving jobs, with requests briefly paused.', src: 3 },
      { when: '2020', who: 'Uber', title: 'Multi-region Kafka for disaster recovery', text: 'Producers write to a <b>regional</b> Kafka cluster, and <b>uReplicator</b> copies every region into aggregate clusters in each region. Consumers run <b>active/active</b> (for example surge pricing, recomputed in each region) or <b>active/passive</b> with offsets mapped across regions so a consumer can resume elsewhere.', src: 4 },
      { when: '2023', who: 'Slack', title: 'Cellular architecture and drains', text: 'After a 2021 network disruption in one availability zone, Slack re-architected around cells so traffic can be <b>drained</b> away from a sick zone. InfoQ reports a full drain within about 5 minutes. The same evacuation idea applies at region level.', src: 5 },
      { when: '2019 → 2025', who: 'AWS', title: 'DynamoDB global tables: LWW, then strong consistency', text: 'Global tables are multi-active. In the default <b>eventual consistency (MREC)</b> mode, concurrent writes to one item are resolved by <b>last-writer-wins</b>, and typical lag between Regions in one geography is <b>0.5–2.5 s</b>. <b>Multi-Region strong consistency (MRSC)</b> was previewed in Dec 2024 and became <b>generally available on 30 June 2025</b> with an RPO of zero. The mode is chosen when the table is created.', src: 6 },
      { when: 'ongoing', who: 'Google Cloud', title: 'Spanner multi-region configurations', text: 'A multi-region instance has <b>read-write regions</b> (one is the default leader), read-only replicas, and a <b>witness</b> region that votes. Writes need a majority of voters, so write latency depends on the leader\'s distance to that quorum. Reads can be served by nearby replicas.', src: 8 }
    ],
    lessons: [
      'Keep the user\'s request path inside one region. Cross-region work happens asynchronously or in a small consensus slice.',
      'Pick a write rule <b>per data class</b>. LWW is fine for "last known position", wrong for counters and money.',
      'Capacity is part of the design: (N−1)/N headroom, pre-scaling before shifting, and the largest region sets the limit.',
      'Evacuate regions on purpose and often. A failover that is never exercised does not work on the day.',
      'Even active-active needs <b>backups</b>: replication copies corruption and deletes to every region just as fast.'
    ],
    sources: [
      { title: 'Active-Active for Multi-Regional Resiliency', url: 'https://netflixtechblog.com/active-active-for-multi-regional-resiliency-c47719f6685b', pub: 'Netflix TechBlog, Dec 2013' },
      { title: 'Global Cloud — Active-Active and Beyond', url: 'https://netflixtechblog.com/global-cloud-active-active-and-beyond-a0fdfa2c3a45', pub: 'Netflix TechBlog, 2016' },
      { title: 'How Netflix does failovers in 7 minutes flat', url: 'https://opensource.com/article/18/4/how-netflix-does-failovers-7-minutes-flat', pub: 'opensource.com (Amjith Ramanujam, Netflix), 2018' },
      { title: 'Shopify\'s architecture: pods, Sorting Hat and Pod Mover', url: 'https://www.infoq.com/news/2017/10/shopify-commerce', pub: 'InfoQ, 2017 (GOTO Copenhagen talk)' },
      { title: 'Disaster Recovery for Multi-Region Kafka at Uber', url: 'https://www.uber.com/blog/kafka/', pub: 'Uber Engineering, Dec 2020' },
      { title: 'Slack\'s Migration to a Cellular Architecture', url: 'https://slack.engineering/slacks-migration-to-a-cellular-architecture/', pub: 'Slack Engineering, 2023' },
      { title: 'Amazon DynamoDB global tables with multi-Region strong consistency is now generally available', url: 'https://aws.amazon.com/about-aws/whats-new/2025/06/amazon-dynamo-db-global-tables-multi-region-strong-consistency-generally-available/', pub: 'AWS What\'s New, 30 Jun 2025' },
      { title: 'DynamoDB global tables: how it works (consistency modes, last-writer-wins)', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_HowItWorks.html', pub: 'AWS docs' },
      { title: 'Demystifying Cloud Spanner multi-region configurations', url: 'https://cloud.google.com/blog/topics/developers-practitioners/demystifying-cloud-spanner-multi-region-configurations', pub: 'Google Cloud blog' },
      { title: 'Spanner replication (replica types, witness, leader-aware routing)', url: 'https://docs.cloud.google.com/spanner/docs/replication', pub: 'Google Cloud docs' },
      { title: 'REL13-BP02 Use defined recovery strategies to meet the recovery objectives', url: 'https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_planning_for_recovery_disaster_recovery.html', pub: 'AWS Well-Architected Framework' },
      { title: 'Disaster recovery options in the cloud', url: 'https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html', pub: 'AWS whitepaper' },
      { title: 'Disaster Recovery (DR) Architecture on AWS, Part IV: Multi-site Active/Active', url: 'https://aws.amazon.com/blogs/architecture/disaster-recovery-dr-architecture-on-aws-part-iv-multi-site-active-active', pub: 'AWS Architecture Blog' },
      { title: 'Measuring DynamoDB global tables replication lag', url: 'https://community.aws/tutorials/ddb-globaltables-lag', pub: 'community.aws tutorial' },
      { title: 'Using switchover or failover in Amazon Aurora Global Database', url: 'https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database-disaster-recovery.html', pub: 'AWS docs' },
      { title: 'Conflict-free Replicated Data Types (SSS 2011)', url: 'https://www.cs.tufts.edu/~nr/cs257/archive/marc-shapiro/CRDTs_SSS-2011.pdf', pub: 'Shapiro, Preguiça, Baquero, Zawirski, 2011' },
      { title: 'Slack migrates to cell-based architecture on AWS', url: 'https://www.infoq.com/news/2024/01/slack-cell-based-architecture', pub: 'InfoQ, Jan 2024' }
    ]
  },

  tradeoffs: {
    headers: ['Strategy', 'Write latency', 'RPO / RTO on region loss', 'Conflicts', 'Use for'],
    rows: [
      ['<b>Active-passive</b> (pilot light / warm standby)', 'Local near the primary, one RTT elsewhere', 'RPO ≈ lag; RTO = detect + promote + <b>scale up</b> (tens of minutes)', 'None', 'Apps that tolerate a slow, rare failover; the cheapest step up from one region'],
      ['<b>Async multi-master</b> + LWW', 'Local everywhere', 'RPO ≈ lag; RTO ≈ steering time', '<b>Silently lost updates</b>', 'Last-known-state data: presence, last position, preferences'],
      ['<b>Async multi-master</b> + CRDT / app merge', 'Local everywhere', 'RPO ≈ lag; RTO ≈ steering time', 'Merged, nothing lost (but only some types fit)', 'Counters, sets, carts, collaborative docs'],
      ['<b>Home region</b> per user / tenant + async replicas', 'Local at home, +1 RTT when away', 'RPO ≈ lag for the failed region\'s homes; RTO ≈ steering + re-home', 'None (one writer per entity)', 'Most user-owned data: profiles, orders, messages'],
      ['<b>Synchronous consensus</b> (Spanner, CockroachDB, DynamoDB MRSC)', 'RTT to a majority of regions on every write', 'RPO 0; RTO ≈ leader re-election (seconds)', 'None', 'Small critical slice: balances, uniqueness, home assignments']
    ]
  },
  failures: [
    { f: 'Whole region down', detect: 'Health checks from several vantage points; error rate per region at the edge', fix: 'Set its steering weight to 0, pre-scale survivors, re-home its users with an epoch bump, and reconcile its unshipped writes if it returns.' },
    { f: 'Gray failure (region slow, not dead)', detect: 'Latency and error SLOs per region, not just up/down checks', fix: 'Drain it partially or fully. A cheap, routine evacuation path is what makes this safe to do early.' },
    { f: 'Split-brain after a partition', detect: 'Two regions both claim the same home; epoch mismatch alarms', fix: 'Move homes only by majority in the consensus store. The old home stops on lease expiry, and stale-epoch writes are rejected on apply.' },
    { f: 'Survivors overloaded after failover', detect: 'Utilisation forecast: u × N/(N−1) per region, checked continuously', fix: 'Keep headroom for the largest region, scale before shifting, shift in steps, shed low-priority traffic.' },
    { f: 'Replication lag grows (RPO silently widens)', detect: 'Heartbeat-row lag per region pair; oldest unreplicated write age', fix: 'Alert on lag, not just errors. Throttle bulk writers, add replication throughput, and refuse planned failovers until lag is near zero.' },
    { f: 'Lost updates from LWW', detect: 'Count overwrites where the incoming timestamp is close to the stored one; user reports', fix: 'Move that data to a CRDT or to home-region writes. Never use LWW for counters or balances.' },
    { f: 'Stale DNS keeps traffic on a dead region', detect: 'Requests still arriving at the evacuated region after the TTL', fix: 'Short TTLs on regional records, plus anycast or a global load balancer for fast moves. Make clients retry against a second endpoint.' }
  ],

  interview: [
    { q: 'Active-passive vs active-active: what do you actually gain?', a: '<p><b>Active-passive</b> keeps a standby that only takes traffic after failover. It is simple and conflict-free, but failover is rare, slow (promote and scale up) and often broken when you need it.</p><p><b>Active-active</b> serves from every region all the time, so failover is just "send fewer users there". Every region is proven by real traffic and users get a nearby region. The price: you must decide who may write each piece of data, and you pay for N copies plus headroom.</p>', lvl: 'core' },
    { q: 'How would you design a multi-region active-active architecture? (the whole answer in two minutes)', a: '<ul><li><b>Steering</b>: GeoDNS or anycast sends users to the nearest healthy region.</li><li><b>Stateless tier</b> identical in every region; no cross-region call on the request path.</li><li><b>Data by class</b>: home region per user for most data; CRDT or LWW multi-master for mergeable data; a consensus store for the small critical slice (homes, uniqueness, money).</li><li><b>Async replication</b> with lag monitoring.</li><li><b>Capacity</b> at most (N−1)/N per region; pre-scale before evacuating.</li><li><b>Control plane</b> for evacuation and re-homing, with epochs and leases to prevent split-brain.</li><li><b>Regular region evacuation drills.</b></li></ul>', lvl: 'core' },
    { q: 'What does "active-active with a home region" mean, and why is it the common default?', a: '<p>Every user, tenant or entity is pinned to <b>one home region</b> that is the only writer for its data. Other regions hold async replicas, serve reads locally and forward writes to the home.</p><p>You keep local latency for the common case (users live near their home), you get <b>no write conflicts</b>, and a region loss only affects the RPO of the users homed there. The cost: travelling users pay one RTT on writes, and moving a home needs a careful, fenced protocol.</p>', lvl: 'core' },
    { q: 'Why is last-writer-wins dangerous? When is it fine?', a: '<p>LWW keeps the write with the larger timestamp and <b>silently discards the other</b>. Two regions incrementing the same counter from 10 both write 11, so one increment vanishes. Clock skew can even make an older write win.</p><p>It is fine when the newest value really replaces the old one and losing an intermediate write is harmless: last seen location, online status, a display preference. For counters use a CRDT; for carts use a merge; for money use one writer or consensus.</p>', fu: 'How does a PN-counter avoid the lost update? (Each region increments only its own slot; merge = max per slot; value = sum. Merge is commutative, associative and idempotent.)', lvl: 'core' },
    { q: 'Define RPO and RTO, and give them for each data strategy.', a: '<p><b>RPO</b>: the most recent data you may lose. <b>RTO</b>: how long until service is back.</p><ul><li>Async replication (multi-master or home region): RPO ≈ replication lag at the moment of failure (seconds); RTO ≈ detection + steering (+ re-homing).</li><li>Active-passive: RPO ≈ lag; RTO adds promotion and scaling the standby (often tens of minutes).</li><li>Synchronous consensus: RPO = 0, because a commit is on a majority; RTO ≈ leader re-election (seconds), but every write pays the quorum RTT.</li></ul><p>Backups still matter: replication copies a bad delete everywhere.</p>', lvl: 'core' },
    { q: 'How much spare capacity does each region need?', a: '<p>If any one of N equal regions may fail, the other N−1 must carry the whole load, so each region can run at most <b>(N−1)/N</b> of its capacity at peak: 50 % with 2 regions, 67 % with 3, 80 % with 5. Leave a margin below that, since you never want to run at 100 %.</p><p>With unequal regions, the largest one sets the limit: if it carries 45 % of traffic, the others must absorb 45 %, so everyone runs at ≤ 55 %. Autoscaling takes minutes, so keep pre-scaled buffers or scale before shifting, as Netflix\'s Nimble does.</p>', lvl: 'core' },
    { q: 'How fast is DNS-based failover, and what is faster?', a: '<p>DNS failover = detection + the record\'s TTL + resolvers that cache longer than the TTL, + clients that hold connections. Expect minutes, with a long tail.</p><p><b>Anycast</b> or a <b>global load balancer</b> keeps the same IPs and shifts new connections within seconds of health checks failing. Either way, clients should retry against another endpoint, and long-lived connections must reconnect.</p>', lvl: 'deep' },
    { q: 'How do you prevent split-brain when moving a home region?', a: '<ul><li>The move is a <b>majority write</b> in a consensus store spread over 3+ regions (2 of 3 must agree), so a region that is cut off alone cannot appoint itself.</li><li>The home holds a <b>time-bound lease</b>. It stops writing when it cannot renew, and the new home starts only after the old lease has expired, plus a margin for clock skew.</li><li>Each move bumps an <b>epoch</b>. Replicated writes carry it, and appliers reject anything older than the row\'s epoch: a <b>fencing token</b>.</li></ul><p>The minority side becomes unavailable for those users rather than wrong.</p>', lvl: 'deep' },
    { q: 'When would you pay for synchronous cross-region consensus?', a: '<p>When divergence is unacceptable and the data is small or write-light: account balances, inventory that must not oversell, unique usernames, the home directory itself. Spanner, CockroachDB or DynamoDB MRSC give RPO 0, but every write waits about one RTT to a quorum (tens of ms between nearby regions, more across oceans).</p><p>Keep it a slice of the system and put voters close together. See <a href="distributed-sql.html">Distributed SQL</a> for the internals.</p>', lvl: 'deep' },
    { q: 'How do you keep IDs and retries correct across regions?', a: '<p><b>IDs</b>: never use one global auto-increment. Use region-aware generators (a region field in a Snowflake-style id, see <a href="unique-id.html">Unique ID</a>) or UUIDv7, so two regions never mint the same id.</p><p><b>Retries</b>: a client may retry a write in a different region after failover. Store the <code>Idempotency-Key</code> with the result in the <b>home region\'s</b> data, so the retry finds it. Keys written in a region that died before replicating can be lost, so make downstream effects (payments, emails) idempotent too.</p>', lvl: 'deep' },
    { q: 'Which stateful pieces stay regional, and which replicate?', a: '<ul><li><b>Sessions</b>: stateless tokens (signed JWT) or replicated session data, so a failed-over user stays logged in.</li><li><b>Caches</b>: regional. Invalidate across regions or use short TTLs, and expect a cold-cache miss storm after failover (Netflix added cross-region invalidation to EVCache; see <a href="distributed-cache.html">Distributed Cache</a>).</li><li><b>Queues and streams</b>: regional for producers, with replicated aggregate topics (Uber\'s uReplicator setup). Consumers are active/active if idempotent, or active/passive with offset mapping.</li><li><b>Regulated data</b>: never replicated out of its legal region. Route those users\' writes and reads there.</li></ul>', lvl: 'deep' },
    { q: 'How do you know your RPO right now, and how do you test failover?', a: '<p><b>RPO</b>: each region writes a heartbeat row every second. The replica\'s <code>now() − written_at</code> per region pair is the real end-to-end lag. Alert on its p99 and on the age of the oldest unreplicated write.</p><p><b>Testing</b>: evacuate a region in production on a schedule (Netflix\'s Chaos Kong exercises, Slack\'s AZ drains), first at low traffic, then at peak. Measure time to drain, survivor utilisation and error budget used.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Postgres: fenced replica apply + PN-counter CRDT', lang: 'sql',
      code: `-- Rows remember the home epoch they were written under.
CREATE TABLE profile (
  user_id bigint PRIMARY KEY, data jsonb NOT NULL,
  epoch bigint NOT NULL, version bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now());

-- Replication applier (runs in each non-home region): idempotent and fenced.
-- A write from a deposed home (older epoch) or an older version never wins.
PREPARE apply_profile(bigint, jsonb, bigint, bigint) AS
INSERT INTO profile AS p (user_id, data, epoch, version)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id) DO UPDATE
   SET data = EXCLUDED.data, epoch = EXCLUDED.epoch,
       version = EXCLUDED.version, updated_at = now()
 WHERE (EXCLUDED.epoch, EXCLUDED.version) > (p.epoch, p.version);

-- Multi-master counter as a PN-counter: one row per (key, region).
CREATE TABLE counter_slot (
  key text, region text,
  incr bigint NOT NULL DEFAULT 0, decr bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (key, region));

-- A local +1 only touches this region's own row.
INSERT INTO counter_slot VALUES ('post:42', 'eu-west', 1, 0)
ON CONFLICT (key, region) DO UPDATE SET incr = counter_slot.incr + 1;

-- Merging a replicated row: max() is commutative and idempotent.
INSERT INTO counter_slot VALUES ('post:42', 'us-east', 6, 0)
ON CONFLICT (key, region) DO UPDATE
   SET incr = GREATEST(counter_slot.incr, EXCLUDED.incr),
       decr = GREATEST(counter_slot.decr, EXCLUDED.decr);

SELECT sum(incr - decr) AS likes FROM counter_slot WHERE key = 'post:42';`,
      note: 'Tested on Postgres 16: an old-epoch or replayed write returns <code>INSERT 0 0</code>; applying the same counter row twice, or in either order, gives the same total. The epoch check protects the <i>apply</i> path. Stopping the old home from accepting new writes is the lease\'s job (next snippet).'
    },
    {
      title: 'Spring Boot 3: route writes to the home region', lang: 'java',
      code: `@Component
public class HomeRegionFilter extends OncePerRequestFilter {
  public record Home(String region, long epoch) {}
  public interface HomeDirectory { Home lookup(long userId); }   // local cache of the consensus table
  public interface LeaseKeeper { boolean holds(long epoch); }      // lease renewed by majority write

  private final HomeDirectory homes;
  private final LeaseKeeper lease;
  private final String localRegion;
  private final Map<String, String> baseUrl;                       // region -> https://eu-west.api...

  public HomeRegionFilter(HomeDirectory homes, LeaseKeeper lease,
      @Value("\${app.region}") String localRegion,
      @Value("#{\${app.region-urls}}") Map<String, String> baseUrl) {
    this.homes = homes; this.lease = lease; this.localRegion = localRegion; this.baseUrl = baseUrl;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    String user = req.getHeader("X-User-Id");                      // set by auth at the edge
    if (user == null || "GET".equals(req.getMethod()) || "HEAD".equals(req.getMethod())) {
      chain.doFilter(req, res);                                    // reads stay local (maybe ~1 s stale)
      return;
    }
    Home home = homes.lookup(Long.parseLong(user));
    if (!home.region().equals(localRegion)) {                      // 307 keeps method and body
      String q = req.getQueryString() == null ? "" : "?" + req.getQueryString();
      res.setStatus(HttpStatus.TEMPORARY_REDIRECT.value());
      res.setHeader(HttpHeaders.LOCATION, baseUrl.get(home.region()) + req.getRequestURI() + q);
      return;
    }
    if (!lease.holds(home.epoch())) {                              // deposed or cut-off home: fenced
      res.sendError(HttpStatus.SERVICE_UNAVAILABLE.value(), "home lease lost, retry");
      return;
    }
    req.setAttribute("homeEpoch", home.epoch());                   // stamped on rows + replication log
    chain.doFilter(req, res);
  }
}`,
      note: 'Compiled with <code>javac --release 21</code> against Spring Boot 3.5 jars. In production the edge or gateway usually proxies the write to the home region instead of redirecting the client. <code>app.region-urls</code> is a SpEL map, e.g. <code>{\'us-east\':\'https://us.api\',\'eu-west\':\'https://eu.api\'}</code>.'
    },
    {
      title: 'Python: can we lose any one region?', lang: 'python',
      code: `from dataclasses import dataclass

@dataclass
class Region:
    name: str
    peak_rps: float       # traffic it serves at today's peak
    capacity_rps: float   # what it can serve right now, before autoscaling

def evacuate(regions, failed, ceiling=0.85):
    """Move the failed region's peak onto survivors in proportion to their spare room."""
    survivors = [r for r in regions if r.name != failed]
    moved = next(r.peak_rps for r in regions if r.name == failed)
    spare = {r.name: max(0.0, r.capacity_rps * ceiling - r.peak_rps) for r in survivors}
    room = sum(spare.values())
    util = {}
    for r in survivors:
        share = spare[r.name] / room if room else 1 / len(survivors)
        util[r.name] = (r.peak_rps + moved * share) / r.capacity_rps
    return util, max(0.0, moved - room)      # rps that cannot fit under the ceiling

fleet = [Region("us-east", 45_000, 75_000),
         Region("eu-west", 35_000, 58_000),
         Region("ap-south", 20_000, 34_000)]   # every region at ~60 % today

for r in fleet:
    util, over = evacuate(fleet, r.name)
    shown = ", ".join(f"{k} {v:.0%}" for k, v in util.items())
    print(f"lose {r.name:8}: {shown}  | over ceiling: {over:,.0f} rps")`,
      note: 'Output: losing us-east puts eu-west at 108 % and ap-south at 110 %, with 21,800 rps above the 85 % ceiling. Losing eu-west gives 92 % / 92 % (7,350 rps over). Only losing ap-south fits (75 % / 75 %). Running every region at ~60 % is not enough when one region carries 45 % of the traffic: here everyone would need to run at about 47 %.'
    }
  ],

  related: ['distributed-sql', 'kv-store', 'distributed-cache', 'cdn', 'api-gateway', 'message-queue']
});
