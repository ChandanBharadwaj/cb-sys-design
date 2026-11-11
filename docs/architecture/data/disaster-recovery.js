SD.register({
  slug: 'disaster-recovery',
  domain: 8,
  title: 'Disaster Recovery: RTO & RPO',
  examples: 'AWS DR strategies, Patroni',
  tagline: 'Decide, per service, how long you may be down (<b>RTO</b>) and how much data you may lose (<b>RPO</b>). Then buy exactly that much standby capacity, replication and practice, and prove it with drills.',
  tldr: {
    problem: 'A region, a data centre or a database can disappear: fire, a bad network change, an engineer deleting the wrong directory, ransomware. Without a plan, recovery time is "whenever we figure it out" and data loss is "whatever the last backup that actually works happens to contain".',
    idea: 'Run a <b>business impact analysis</b>, tier services by criticality, and give each tier an <b>RTO</b> and an <b>RPO</b>. Pick the cheapest of the four AWS strategies that meets them (<b>backup &amp; restore, pilot light, warm standby, multi-site active/active</b>), choose sync or async replication to match the RPO, and run <b>drills</b> that measure the real numbers.',
    insight: 'RPO is decided by <b>how data gets to the other site</b> (backup interval, WAL archiving, replication lag); RTO is decided by <b>what is already running there</b> and how fast traffic moves (detection, decision, scale-up, DNS). A backup you have never restored is a hope, not an RPO.',
    numbers: [
      { v: '1 s / < 1 min', l: 'RPO / RTO AWS advertises for Aurora Global Database; the user guide says RPO is "measured in seconds" and RTO "in the order of minutes"' },
      { v: '~6 h', l: 'database changes GitLab.com lost on 31 Jan 2017 when its backups turned out not to work (GitLab postmortem)' },
      { v: '7 h', l: 'Route 53 APIs impaired in us-east-1 on 7 Dec 2021 (07:30–14:30 PST); existing DNS answers kept working (AWS summary)' }
    ]
  },

  intro: {
    what: 'Disaster recovery (<b>DR</b>) is the plan and the machinery for bringing a service back after a large failure that normal redundancy cannot absorb, such as losing a whole region. It is measured by two numbers: the <b>recovery time objective</b> (RTO), how long the service may be unavailable, and the <b>recovery point objective</b> (RPO), how much recent data you may lose, measured in time.',
    analogy: {
      icon: '🏠',
      title: 'House insurance and a spare key',
      text: 'If your house burns down, two questions matter: how long until you have somewhere to live (RTO), and which belongings are gone for good (RPO). A photo album copied to a relative\'s house last Christmas means you lose everything since Christmas. A furnished flat kept ready across town means you move in tonight, but you pay rent on it every month. DR is choosing how much of that rent to pay. The analogy breaks in one place: a house fire is obvious, but in IT you must first <b>detect and decide</b> that it is a disaster, and that often takes longer than the recovery itself.'
    },
    problem: 'A team runs one Postgres primary with a nightly dump to the same cloud account. The region has a long outage, and when they try to restore, the dump job had been failing silently for weeks and the account holding the backups is the one that is down. The question this answers is: <b>how much downtime and data loss can each service afford, and what is the cheapest setup that provably delivers that?</b>',
    story: [
      {
        stage: 'naive',
        title: 'One region, a nightly backup',
        text: 'Everything runs in one region. A cron job dumps the database to object storage in the same account every night. It looks safe: there is a backup.',
        scene: {
          nodes: [
            { id: 'users', label: 'Users', sub: 'orders', kind: 'client', at: [70, 0] },
            { id: 'app', label: 'App', sub: 'region A', kind: 'service', at: [210, 0] },
            { id: 'db', label: 'Postgres', sub: 'single primary', kind: 'store', at: [210, 110] },
            { id: 'bak', label: 'Nightly dump', sub: 'same account', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'users', to: 'app' }, { from: 'app', to: 'db' }, { from: 'db', to: 'bak' }],
          flow: ['users>app', 'app>db', 'db>bak']
        }
      },
      {
        stage: 'breaks',
        title: 'Region down, backup useless',
        text: 'The region fails. The backups sit in the same blast radius, the last good dump is <b>days old</b> because the job failed silently, and nobody has ever timed a restore. RPO: days. RTO: unknown.',
        scene: {
          nodes: [
            { id: 'users', label: 'Users', sub: 'errors', kind: 'client', at: [70, 0] },
            { id: 'app', label: 'App', sub: 'region A down', kind: 'service', at: [210, 0] },
            { id: 'db', label: 'Postgres', sub: 'unreachable', kind: 'store', at: [210, 110] },
            { id: 'bak', label: 'Nightly dump', sub: 'last ok: 9 d ago', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'users', to: 'app' }, { from: 'app', to: 'db' }, { from: 'db', to: 'bak' }],
          flow: ['users>app'],
          err: ['app', 'db'], warn: ['bak'],
          badges: { app: ['down', 'err'], bak: ['never tested', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'A tested copy somewhere else',
        text: 'Stream the database to a <b>standby in a second region</b>, archive WAL to <b>immutable</b> storage in another account, and point users at whichever region is healthy. Drill it, so the RTO and RPO are <b>measured</b>, not assumed.',
        scene: {
          nodes: [
            { id: 'users', label: 'Users', sub: 'orders', kind: 'client', at: [70, 0] },
            { id: 'dns', label: 'DNS failover', sub: 'health checks', kind: 'edge', at: [210, 0] },
            { id: 'app', label: 'App', sub: 'region A', kind: 'service', at: [70, 110] },
            { id: 'appb', label: 'App', sub: 'region B (warm)', kind: 'service', at: [350, 110] },
            { id: 'db', label: 'Primary', sub: 'region A', kind: 'store', at: [70, 220] },
            { id: 'dbb', label: 'Standby', sub: 'region B', kind: 'store', at: [350, 220] },
            { id: 'bak', label: 'WAL archive', sub: 'immutable', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'users', to: 'dns' }, { from: 'dns', to: 'app' }, { from: 'dns', to: 'appb' }, { from: 'app', to: 'db' }, { from: 'appb', to: 'dbb' }, { from: 'db', to: 'bak' }, { from: 'bak', to: 'dbb' }],
          flow: ['users>dns', 'dns>app', 'app>db', ['db>bak', 'bak>dbb']],
          ok: ['dbb', 'bak'],
          badges: { dbb: ['lag 1 s', 'ok'] }
        }
      }
    ],
    usedBy: ['AWS (DR whitepaper, Elastic Disaster Recovery)', 'Amazon Aurora Global Database', 'Patroni (Zalando, open source)', 'pgBackRest and WAL-G users', 'Google Cloud Spanner multi-region', 'GitLab.com (after its 2017 incident)'],
    whenToUse: [
      'Any service whose loss for hours or whose data loss would hurt revenue, safety or legal obligations',
      'Regulated workloads (finance, health) where an auditor will ask for documented and tested RTO / RPO',
      'Stateful systems: databases, queues and object stores, where redundancy inside one site does not protect against deletion, corruption or a site loss'
    ],
    whenNot: [
      'Stateless, rebuildable services: infrastructure as code plus a redeploy is the DR plan, no standby needed',
      'Protecting against a single server or zone failure: that is high availability, covered by <a href="reliability-math.html">Reliability Math</a> and multi-AZ',
      'Proving the system really survives failures day to day: that is <a href="chaos-engineering.html">Chaos Engineering</a>; DR is the plan it tests'
    ],
    glossary: [
      { term: 'RTO', def: 'Recovery time objective: the maximum acceptable time between the disruption and the service being usable again.' },
      { term: 'RPO', def: 'Recovery point objective: the maximum acceptable amount of data loss, measured as time before the disruption.' },
      { term: 'Business impact analysis', def: 'A review that estimates what each hour of downtime and each hour of lost data costs per service, and sets RTO / RPO from that.' },
      { term: 'Pilot light', def: 'A DR strategy where data is replicated live but application servers in the recovery region are off until needed.' },
      { term: 'Warm standby', def: 'A scaled-down but fully working copy of the system in the recovery region, scaled up on failover.' },
      { term: 'PITR', def: 'Point-in-time recovery: restore a base backup, then replay archived write-ahead log (WAL) up to a chosen moment.' },
      { term: 'Split brain', def: 'Two nodes both believe they are the primary and accept writes, so the data diverges.' },
      { term: 'Fencing', def: 'Forcibly stopping the old primary (or cutting it off) so it cannot accept writes after a failover.' }
    ]
  },

  requirements: {
    functional: [
      'Set <b>RTO and RPO per service tier</b> from a business impact analysis, not one number for the whole company',
      'Keep at least one copy of data <b>outside the blast radius</b>: another region and another account, ideally immutable',
      'Pick the <b>cheapest strategy that meets the tier</b>: backup &amp; restore, pilot light, warm standby or active/active',
      'Match replication to RPO: <b>synchronous</b> for RPO 0, <b>asynchronous</b> when seconds of loss are acceptable',
      'Make failover a <b>data-plane action</b> that does not depend on the failed region\'s control plane',
      'Write <b>runbooks</b>, rehearse them in drills, and record the measured RTO / RPO'
    ],
    nonFunctional: [
      'Tier 0 (payments, auth): RTO ≤ 15 min, RPO ≤ 1 min or 0 (<em>typical targets</em>)',
      'Tier 1 (core features): RTO ≤ 1–4 h, RPO ≤ 15 min (<em>typical</em>)',
      'Tier 2 (internal, analytics): RTO ≤ 24 h, RPO ≤ 24 h (<em>typical</em>)',
      'Restore test of every critical database at least <b>monthly</b>, with measured duration',
      'Replication lag alert well below RPO (e.g. alert at 25% of RPO)',
      'DNS TTL on failover records ≤ 60 s so clients follow within about a minute'
    ],
    outOfScope: [
      '<b>Untested backups</b>: a job that "succeeds" without anyone ever restoring the output',
      '<b>Backups in the same account and region</b> as production: one credential or one fire takes both',
      '<b>Replication as backup</b>: a DROP TABLE replicates to the standby in milliseconds',
      '<b>Automated failover without fencing</b>: a recipe for split brain',
      '<b>One RTO for everything</b>: either far too expensive or far too weak for the critical paths'
    ]
  },

  calculator: {
    inputs: [
      { id: 'wps', label: 'Write rate (committed transactions)', min: 1, max: 50000, value: 500, log: true, unit: 'tx/s' },
      { id: 'lag', label: 'Async replication lag', min: 0, max: 60, step: 0.5, value: 2, unit: 's' },
      { id: 'bk', label: 'Backup / WAL push interval', min: 1, max: 1440, value: 60, log: true, unit: 'min' },
      { id: 'size', label: 'Database size', min: 10, max: 20000, value: 500, log: true, unit: 'GB' },
      { id: 'tput', label: 'Restore throughput', min: 20, max: 2000, value: 200, log: true, unit: 'MB/s' },
      { id: 'detect', label: 'Detection + decision time', min: 1, max: 120, value: 15, unit: 'min' }
    ],
    outputs: [
      { label: 'RPO with async replica (transactions at risk)', f: (v) => '≈ ' + Math.round(v.wps * v.lag).toLocaleString('en-US') + ' tx (' + v.lag + ' s)' },
      { label: 'RPO with backups only (transactions at risk, worst case)', f: (v) => '≈ ' + Math.round(v.wps * v.bk * 60).toLocaleString('en-US') + ' tx (' + (v.bk < 120 ? v.bk + ' min' : (v.bk / 60).toFixed(1) + ' h') + ')' },
      { label: 'RTO backup & restore (detect + 30 min provision + restore + 1 min DNS) · cost ≈ 1.1×', fmt: 'ms', f: (v) => (v.detect + 30 + 1) * 60e3 + v.size * 1024 / v.tput * 1e3 },
      { label: 'RTO pilot light (detect + 20 min scale-up + promote + DNS) · cost ≈ 1.2–1.4×', fmt: 'ms', f: (v) => (v.detect + 20 + 1 + 1) * 60e3 },
      { label: 'RTO warm standby (detect + 5 min scale-up + promote + DNS) · cost ≈ 1.5–1.8×', fmt: 'ms', f: (v) => (v.detect + 5 + 1 + 1) * 60e3 },
      { label: 'RTO active/active (automated detection ~1–2 min + DNS) · cost ≈ 2×+', fmt: 'ms', f: (v) => (Math.min(v.detect, 2) + 1) * 60e3 }
    ],
    note: 'RPO = write rate × the window of data not yet in the other site (replication lag, or time since the last backup / WAL push). Restore time = size ÷ throughput, ignoring WAL replay, which can add as much again. Provisioning (30 min), scale-up (20 / 5 min), promote (1 min), DNS (1 min at TTL 60 s) and all cost multipliers are <em>estimates / rules of thumb</em>; replace them with numbers from your own drills. Detection + decision is often the biggest term: a human deciding to declare a disaster can take longer than the failover. For multiplying availabilities see <a href="reliability-math.html">Reliability Math</a>.'
  },

  api: [
    { m: 'DOC', p: 'Business impact analysis', d: 'Per service: revenue and contractual cost per hour of downtime, cost of each hour of lost data, regulatory duties, dependencies. Output: a <b>tier</b> and agreed <b>RTO / RPO</b>, signed by the business owner.' },
    { m: 'POLICY', p: 'DR tier policy', d: 'Tier 0–3 definitions, the strategy each tier must use (e.g. tier 0 = warm standby or active/active), backup retention, immutability and cross-account rules, drill frequency.' },
    { m: 'DOC', p: 'Failover runbook', d: 'Who may declare a disaster, the exact steps (fence old primary, promote standby, flip DNS / global load balancer, scale up), verification checks, communication templates, and the <b>failback</b> procedure with data reconciliation.' },
    { m: 'YAML', p: 'patroni.yml / Postgres config', d: '<code>synchronous_standby_names</code>, <code>archive_command</code> to pgBackRest / WAL-G, <code>maximum_lag_on_failover</code>, watchdog, DCS endpoints. Reviewed like code.' },
    { m: 'SLO', p: 'DR objectives register', d: 'Measured, not promised: last drill date, measured RTO and RPO, replication lag p99, last successful restore test. Red when older than policy.' },
    { m: 'DOC', p: 'Game day / drill report', d: 'Scenario, timeline with timestamps, measured RTO / RPO vs target, what surprised the team, runbook fixes and owners.' }
  ],
  dataModel: [
    { name: 'service_tier', store: 'Postgres (service catalog)', fields: [['service', 'text', 'pk'], ['tier', 'smallint'], ['rto_target', 'interval'], ['rpo_target', 'interval'], ['strategy', 'enum(backup, pilot, warm, active)'], ['owner_team', 'text', 'fk']], note: 'Result of the business impact analysis; drives monitoring thresholds and drill cadence.' },
    { name: 'backup_run', store: 'Postgres', fields: [['backup_id', 'text', 'pk'], ['service', 'text', 'fk'], ['type', 'enum(full, diff, incr, wal)'], ['started_at', 'timestamptz', 'idx'], ['bytes', 'bigint'], ['location', 'text'], ['immutable_until', 'timestamptz'], ['verified', 'boolean']], note: 'A backup counts towards RPO only once <code>verified</code> is true from a restore test.' },
    { name: 'dr_drill', store: 'Postgres', fields: [['drill_id', 'uuid', 'pk'], ['service', 'text', 'fk'], ['scenario', 'text'], ['declared_at', 'timestamptz'], ['serving_at', 'timestamptz'], ['last_txn_lost_at', 'timestamptz'], ['measured_rto', 'interval'], ['measured_rpo', 'interval']], note: 'Measured RTO = serving_at − declared (or failure) time; measured RPO = failure time − last recovered commit.' },
    { name: 'reconciliation_item', store: 'Postgres', fields: [['item_id', 'bigserial', 'pk'], ['drill_or_incident', 'uuid', 'fk'], ['table_name', 'text'], ['pk_value', 'text'], ['old_primary_row', 'jsonb'], ['new_primary_row', 'jsonb'], ['resolution', 'text']], note: 'Writes found on the old primary after failback that never reached the new one; each needs a decision (replay, merge, refund, discard).' }
  ],

  architecture: {
    title: 'Two-region DR for a Postgres-backed service',
    nodes: [
      { id: 'users', label: 'Users', sub: 'web + mobile', kind: 'client', wide: [90, 0], tall: [70, 0], tip: 'Clients resolve the service name; how fast they follow a failover depends on DNS TTL and on client-side caching.' },
      { id: 'dns', label: 'DNS / global LB', sub: 'failover records', kind: 'edge', wide: [290, 0], tall: [210, 0], tip: 'Health-checked failover records or a global load balancer. Keep the TTL low (e.g. 60 s) and make the flip a data-plane action you can do even when a control plane is impaired.' },
      { id: 'health', label: 'Health checks', sub: 'probes both regions', kind: 'compute', wide: [490, 0], tall: [210, 105], tip: 'External probes from several locations. Detection time = probe interval × failure threshold, plus the time a human takes to declare a disaster if failover is manual.' },
      { id: 'oncall', label: 'Incident cmdr', sub: 'runbook', kind: 'person', wide: [690, 0], tall: [350, 0], tip: 'Declares the disaster, runs the runbook, owns the decision to fail over and later to fail back.' },
      { id: 'appA', label: 'App region A', sub: 'primary, full size', kind: 'service', wide: [290, 110], tall: [70, 105], tip: 'Serves all traffic in active/passive setups.' },
      { id: 'appB', label: 'App region B', sub: 'warm: 25% size', kind: 'service', wide: [690, 110], tall: [350, 105], tip: 'Off (pilot light), small (warm standby) or full size (active/active). Scale-up time is part of RTO.' },
      { id: 'dcs', label: 'etcd / DCS', sub: 'Patroni leader lock', kind: 'policy', wide: [890, 110], tall: [210, 210], tip: 'The distributed configuration store holds the leader key with a TTL. Only the node holding it may run as primary; a primary that cannot renew it demotes itself.' },
      { id: 'dbA', label: 'Postgres primary', sub: 'region A', kind: 'store', wide: [290, 220], tall: [70, 210], tip: 'Streams WAL to the standby and archives WAL segments to object storage.' },
      { id: 'dbB', label: 'Postgres standby', sub: 'region B, hot', kind: 'store', wide: [690, 220], tall: [350, 210], tip: 'Async: RPO = lag. Sync (synchronous_standby_names): RPO 0 but every commit waits a cross-region round trip.' },
      { id: 'backup', label: 'Backup repo', sub: 'pgBackRest / WAL-G', kind: 'store', wide: [490, 330], tall: [210, 315], tip: 'Full + incremental backups and continuous WAL archive: enables point-in-time recovery to before a bad DELETE.' },
      { id: 'vault', label: 'Immutable copy', sub: 'other account, locked', kind: 'store', wide: [890, 330], tall: [350, 315], tip: 'Object Lock / WORM in a separate account with separate credentials: ransomware or a compromised admin cannot delete it.' }
    ],
    edges: [
      { from: 'users', to: 'dns' },
      { from: 'dns', to: 'appA' },
      { from: 'dns', to: 'appB', dashed: true },
      { from: 'health', to: 'dns' },
      { from: 'health', to: 'oncall' },
      { from: 'appA', to: 'dbA' },
      { from: 'appB', to: 'dbB' },
      { from: 'dbA', to: 'dbB', label: 'WAL stream', bend: 0.25 },
      { from: 'dbA', to: 'backup' },
      { from: 'backup', to: 'vault' },
      { from: 'backup', to: 'dbB', dashed: true },
      { from: 'dcs', to: 'dbB', dashed: true },
      { from: 'oncall', to: 'dcs', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'steady', title: 'Steady state: how data reaches region B', tone: 'info',
      steps: [
        { text: 'Users resolve the service name. The failover record points at <b>region A</b>, with a 60 s TTL.', flow: ['users>dns', 'dns>appA', 'appA>dbA'] },
        { text: 'Each commit is written to the primary\'s <b>WAL</b> and streamed to the standby in region B. Async: the commit returns before B has it, so <b>RPO = replication lag</b>.', flow: ['dbA>dbB'], badges: { dbB: 'lag 0.8 s' } },
        { text: 'In parallel, WAL segments and nightly full backups go to the <b>backup repo</b>, which copies them to an <b>immutable</b> bucket in another account.', flow: ['dbA>backup', 'backup>vault'], ok: ['vault'], badges: { vault: ['locked 35 d', 'ok'] } },
        { text: 'Health checks probe both regions every 10 s. Region B runs a small <b>warm</b> app tier that is exercised by synthetic traffic, so it is known to work.', flow: [['health>dns', 'health>oncall']], badges: { appB: 'warm 25%' }, tone: 'ok' }
      ]
    },
    {
      id: 'regionloss', title: 'Region A lost: warm-standby failover', tone: 'err',
      steps: [
        { text: 'Region A fails. Users see errors. Health checks fail 3 times in a row: about <b>30 s</b> of detection.', flow: ['users>dns', 'dns>appA'], err: ['appA', 'dbA'], badges: { appA: ['down', 'err'] }, tone: 'err' },
        { text: 'Policy for this tier says a human declares the disaster. The incident commander confirms with a second signal and starts the runbook: <b>~10 min</b> of decision time, often the biggest term.', flow: ['health>oncall'], warn: ['oncall'], badges: { oncall: ['declare DR', 'warn'] } },
        { text: '<b>Fence first:</b> the old primary loses the DCS leader lock (it cannot renew it from the dead region), then the standby is promoted. Transactions inside the lag window are <b>lost</b>.', flow: ['oncall>dcs', 'dcs>dbB'], ok: ['dbB'], badges: { dbB: ['promoted', 'ok'], dbA: ['~1 s of writes lost', 'err'] } },
        { text: 'The app tier in B scales from 25% to 100%. This depends on the <b>control plane</b> having capacity; pre-provisioning (static stability) removes that dependency.', nodes: ['appB'], warn: ['appB'], badges: { appB: ['scaling 25→100%', 'warn'] }, tone: 'warn' },
        { text: 'DNS flips to region B. Clients follow as their cached answers expire (TTL 60 s). Measured RTO ≈ detect + decide + promote + scale + DNS ≈ <b>20 min</b>.', flow: ['users>dns', 'dns>appB', 'appB>dbB'], ok: ['appB', 'dns'], badges: { dns: ['→ region B', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'deletion', title: 'Operator deletes data: PITR, not replication', tone: 'err',
      steps: [
        { text: 'An engineer runs a destructive command against the <b>primary</b> by mistake. It commits at 17:20.', flow: ['appA>dbA'], err: ['dbA'], badges: { dbA: ['data deleted', 'err'] }, tone: 'err' },
        { text: 'Replication does its job perfectly: the deletion reaches the standby in under a second. <b>Replicas protect against site loss, not against mistakes.</b>', flow: ['dbA>dbB'], err: ['dbB'], badges: { dbB: ['also deleted', 'err'] } },
        { text: 'Recovery comes from the <b>backup repo</b>: restore last night\'s full backup and replay archived WAL with <code>recovery_target_time = 17:19:59</code>.', flow: ['backup>dbB'], nodes: ['backup'], badges: { backup: 'base + WAL' } },
        { text: 'If the repo was wiped too (same credentials), the <b>immutable copy</b> in another account still has it. RPO ≈ 1 s before the mistake; RTO = restore + replay time, known from monthly restore tests.', flow: ['vault>backup', 'backup>dbB'], ok: ['dbB', 'vault'], badges: { dbB: ['restored to 17:19:59', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'splitbrain', title: 'Partition: split brain and fencing', tone: 'warn',
      steps: [
        { text: 'The link between regions breaks, but region A is <b>still alive</b> and serving some users. Region B can no longer see the primary.', flow: ['users>dns', 'dns>appA', 'appA>dbA'], warn: ['dbA'], badges: { dbA: ['isolated', 'warn'] }, tone: 'warn' },
        { text: 'Without fencing, B promotes itself, and some clients with old DNS answers keep writing to A. <b>Two primaries</b>: orders written on both sides diverge.', flow: [['appA>dbA', 'appB>dbB']], err: ['dbA', 'dbB'], badges: { dbA: ['primary?', 'err'], dbB: ['primary?', 'err'] }, tone: 'err' },
        { text: 'With Patroni, A must renew its <b>leader key</b> in the DCS. It cannot reach the DCS majority, so it <b>demotes itself</b> before the key TTL expires; a watchdog reboots it if Patroni hangs.', flow: ['dcs>dbB'], ok: ['dbB'], warn: ['dbA'], badges: { dbA: ['demoted (read-only)', 'warn'] } },
        { text: 'Only then is B promoted. Place the DCS members in <b>three</b> locations (A, B and a tie-breaker) so a majority exists on one side of any single partition.', nodes: ['dcs', 'dbB'], ok: ['dcs', 'dbB'], badges: { dcs: ['quorum 2 of 3', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'failback', title: 'At scale: failback and reconciliation', tone: 'warn',
      steps: [
        { text: 'Region A is back after 6 hours. Region B has taken <b>millions of writes</b> since the failover. The old primary also holds ~1 s of writes that never reached B.', nodes: ['dbA', 'dbB'], warn: ['dbA'], badges: { dbA: ['diverged', 'warn'], dbB: ['primary', 'ok'] }, tone: 'warn' },
        { text: 'Do not just restart A as primary. <b>Extract the orphaned writes</b> (WAL after the divergence point) into a reconciliation table, then rebuild A as a standby of B with <code>pg_rewind</code> or a fresh base backup.', flow: ['dbB>dbA'], badges: { dbA: 'pg_rewind' } },
        { text: 'The business owner decides each orphan: replay it, merge it, refund the customer, or discard it. Unique IDs that are not reused (UUIDs, region-prefixed sequences) make this safe.', nodes: ['oncall'], badges: { oncall: '312 rows to review' } },
        { text: 'Failback is a <b>planned switchover</b> in a quiet hour: drain, wait for lag 0, promote A, flip DNS. A controlled switchover is RPO 0 because you wait for replication to catch up.', flow: ['dbB>dbA', 'dns>appA'], ok: ['dbA', 'appA'], badges: { dbA: ['primary again', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'The four strategies come from the AWS DR whitepaper; replication modes from Postgres and Patroni. Meter values are <em>illustrative estimates</em> that follow the reasoning on this page; measure your own in drills.',
    diagram: null,
    controls: [
      { id: 'strategy', label: 'DR strategy', type: 'seg', value: 'warm', options: [
        { v: 'backup', l: 'Backup & restore', hint: 'Only data in region B' },
        { v: 'pilot', l: 'Pilot light', hint: 'Live data, app servers off' },
        { v: 'warm', l: 'Warm standby', hint: 'Small working copy' },
        { v: 'active', l: 'Active/active', hint: 'Both regions serve traffic' }] },
      { id: 'repl', label: 'Database replication', type: 'seg', value: 'async', options: [
        { v: 'async', l: 'Async', hint: 'RPO = lag' },
        { v: 'quorum', l: 'Semi-sync quorum (ANY 1 of 2)', hint: 'Local + remote standby' },
        { v: 'sync', l: 'Sync to remote region', hint: 'RPO 0, +RTT per commit' }] },
      { id: 'failover', label: 'Failover decision', type: 'seg', value: 'manual', options: [
        { v: 'manual', l: 'Manual (runbook)', hint: 'Human declares DR' },
        { v: 'auto', l: 'Automated', hint: 'Health checks + leader lock' }] },
      { id: 'drill', label: 'DR drill frequency', type: 'seg', value: 'quarter', options: [
        { v: 'never', l: 'Never' }, { v: 'year', l: 'Yearly' }, { v: 'quarter', l: 'Quarterly' }, { v: 'month', l: 'Monthly' }] }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const fmtMin = (m) => m < 1 ? Math.round(m * 60) + ' s' : m < 120 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' h';
      const base = { backup: { rto: 240, cost: 1.1, cx: 0.25 }, pilot: { rto: 35, cost: 1.3, cx: 0.45 }, warm: { rto: 12, cost: 1.6, cx: 0.55 }, active: { rto: 1.5, cost: 2.1, cx: 0.85 } }[s.strategy];
      let rto = base.rto + (s.failover === 'manual' ? 15 : 1);
      if (s.drill === 'never') rto *= 2.5; else if (s.drill === 'year') rto *= 1.5; else if (s.drill === 'month') rto *= 0.9;
      // RPO in seconds
      let rpoS;
      if (s.strategy === 'backup') rpoS = 15 * 60; // WAL push / snapshot interval (estimate)
      else rpoS = s.repl === 'async' ? 2 : 0;
      const quorumNote = s.repl === 'quorum' && s.strategy !== 'backup';
      let cost = base.cost + (s.repl === 'sync' ? 0.1 : s.repl === 'quorum' ? 0.15 : 0) + (s.drill === 'month' ? 0.05 : 0);
      let cx = base.cx + (s.failover === 'auto' ? 0.15 : 0) + (s.repl !== 'async' ? 0.1 : 0);
      if (s.strategy === 'active' && s.repl === 'async') cx += 0.05;
      let sb = 0.1;
      if (s.failover === 'auto') sb += 0.35;
      if (s.strategy === 'active') sb += 0.3;
      if (s.repl === 'sync') sb -= 0.1;
      if (s.strategy === 'backup') sb = 0.05;
      const conf = { never: 0.1, year: 0.45, quarter: 0.75, month: 0.9 }[s.drill];
      const latency = s.strategy === 'backup' ? 0 : s.repl === 'sync' ? 70 : s.repl === 'quorum' ? 2 : 0;
      const metrics = [
        { k: 'RTO (estimate)', v: '≈ ' + fmtMin(rto), s: clamp(1 - Math.log10(Math.max(rto, 1)) / Math.log10(1000)) },
        { k: 'RPO (data lost)', v: rpoS === 0 ? '0 (committed = replicated)' : rpoS < 60 ? '≈ ' + rpoS + ' s of writes' : '≈ ' + Math.round(rpoS / 60) + ' min of writes', s: rpoS === 0 ? 1 : clamp(1 - Math.log10(rpoS + 1) / 3.2) },
        { k: 'Commit latency added', v: latency ? '+' + latency + ' ms per commit' : 'none', s: clamp(1 - latency / 100), hint: latency === 70 ? 'cross-region RTT' : '' },
        { k: 'Cost vs one region', v: '≈ ' + cost.toFixed(1) + '×', s: clamp(1 - (cost - 1) / 1.3), hint: 'rule of thumb' },
        { k: 'Complexity', v: cx > 0.8 ? 'high' : cx > 0.5 ? 'medium' : 'low', s: clamp(1 - cx) },
        { k: 'Split-brain risk', v: sb > 0.5 ? 'high without fencing' : sb > 0.25 ? 'moderate: needs fencing' : 'low', s: clamp(1 - sb) },
        { k: 'Confidence it works', v: { never: 'untested', year: 'stale', quarter: 'good', month: 'high' }[s.drill], s: conf }
      ];
      const notes = [];
      if (s.strategy === 'backup') notes.push('Backup &amp; restore: RPO is the backup / WAL push interval and RTO is dominated by <b>provisioning + restore</b> (size ÷ throughput). Cheapest, and the AWS whitepaper notes it is the usual starting point.');
      if (s.strategy === 'pilot') notes.push('Pilot light: the database is replicated live, but app servers must be <b>started</b>. That needs the cloud control plane to work during a regional event.');
      if (s.strategy === 'warm') notes.push('Warm standby: a small but working copy that takes test traffic, so you know it works. Scale-up is the main RTO cost.');
      if (s.strategy === 'active') notes.push('Active/active: both regions take writes, so you need <b>conflict handling</b> (partitioned ownership per user/region, or a globally consistent database) and capacity for 100% in each region.');
      if (s.repl === 'sync' && s.strategy !== 'backup') notes.push('Sync to a remote region gives RPO 0, but every commit waits a cross-region round trip (≈ 70 ms is an <em>illustrative</em> US east–west figure), and writes <b>stop</b> if the standby is unreachable unless you allow fallback.');
      if (quorumNote) notes.push('<code>synchronous_standby_names = \'ANY 1 (local, remote)\'</code>: commits wait for whichever standby answers first, usually the local one. RPO 0 for a <b>node</b> loss, but a whole-region loss can still lose the lag window to region B.');
      if (s.repl !== 'async' && s.strategy === 'backup') notes.push('Replication mode has no effect with backup &amp; restore: there is no live standby.');
      if (s.failover === 'auto') notes.push('Automated failover needs <b>fencing</b> (DCS leader lock with TTL, watchdog) and a quorum placed in three locations, or a partition can produce two primaries.');
      if (s.drill === 'never') notes.push('Never drilled: GitLab in 2017 discovered during the incident that its backup procedures did not work. Assume the RTO is unknown.');
      let verdict;
      if (s.drill === 'never') verdict = '❌ <b>Untested DR is a hope, not a plan.</b> Whatever the design, run a restore test and a failover drill before you quote any RTO.';
      else if (s.strategy === 'active' && s.repl === 'async' && s.failover === 'auto') verdict = '⚠ <b>Active/active with async writes</b> loses or conflicts writes on failover. Partition ownership by key or use a database designed for multi-region consensus.';
      else if (s.strategy === 'backup' && s.drill !== 'year') verdict = '👍 <b>Fine for tier 2–3:</b> cheap and simple, as long as hours of RTO and minutes of RPO are acceptable to the business owner.';
      else if (s.strategy === 'warm' || s.strategy === 'pilot') verdict = '✅ <b>The usual sweet spot</b> for tier 1: the AWS whitepaper notes pilot light or warm standby often meet both RTO and cost criteria.';
      else if (s.strategy === 'active') verdict = '👍 <b>Lowest RTO, highest cost and complexity.</b> Reserve for tier 0 services that truly cannot be down for minutes.';
      else verdict = '⚠ <b>Yearly drills</b> mean the runbook is probably out of date. Increase drill frequency before trusting the RTO.';
      const off = s.strategy === 'backup';
      return {
        metrics, verdict, notes,
        labels: {
          appB: { label: 'App region B', sub: { backup: 'not deployed', pilot: 'off (0 instances)', warm: 'warm: 25% size', active: 'active: 100%' }[s.strategy] },
          dbB: { label: off ? 'Restore target' : 'Postgres standby', sub: off ? 'from backup' : s.repl === 'sync' ? 'sync (RPO 0)' : s.repl === 'quorum' ? 'quorum member' : 'async, lag ~2 s' },
          oncall: { label: s.failover === 'manual' ? 'Incident cmdr' : 'Automation', sub: s.failover === 'manual' ? 'declares DR' : 'Patroni + health checks' }
        },
        flow: s.strategy === 'active' ? ['users>dns', ['dns>appA', 'dns>appB'], ['appA>dbA', 'appB>dbB'], 'dbA>dbB'] : off ? ['users>dns', 'dns>appA', 'appA>dbA', 'dbA>backup', 'backup>vault'] : ['users>dns', 'dns>appA', 'appA>dbA', 'dbA>dbB', 'dbA>backup'],
        warn: s.failover === 'auto' && s.strategy !== 'backup' ? ['dcs'] : [],
        err: s.drill === 'never' ? ['oncall'] : [],
        ok: s.drill === 'month' ? ['vault'] : [],
        badges: { dbB: [off ? 'RPO ' + fmtMin(rpoS / 60) : rpoS === 0 ? 'RPO 0' : 'RPO ~2 s', rpoS === 0 ? 'ok' : 'warn'], appB: ['RTO ' + fmtMin(rto), rto < 30 ? 'ok' : rto < 120 ? 'warn' : 'err'] }
      };
    }
  },

  widget: {
    title: 'Fail a region: watch the RTO and RPO clocks',
    caption: 'Pick a <b>strategy</b> and a <b>replication mode</b>, then click <b>Fail region A</b>. The RTO clock runs through detection, decision, scale-up or restore, and the DNS switch; writes still in flight on the async link turn red and count as <b>lost</b> (RPO). Then <b>fail back</b> to see those orphaned writes reconciled. Phase durations are <em>illustrative estimates</em>; the bars show relative cost.'
  },

  realWorld: {
    intro: 'The vocabulary comes from AWS and the Postgres ecosystem; the lessons come from public postmortems. Numbers are quoted from the linked sources.',
    timeline: [
      { when: 'current', who: 'AWS (DR whitepaper)', title: 'Four strategies on a cost / RTO curve', text: 'AWS\'s whitepaper "Disaster Recovery of Workloads on AWS" describes <b>backup &amp; restore, pilot light, warm standby and multi-site active/active</b>, from cheapest and slowest to most expensive with the lowest RTO and RPO, and recommends the more active ones when a disaster could take out a whole Region.', src: 0 },
      { when: 'current', who: 'AWS (DR whitepaper)', title: 'Pick by RTO and cost together', text: 'The business continuity section notes that pilot light or warm standby often meet both the RTO and the cost criteria, while the other two are either too slow or too costly for most workloads.', src: 1 },
      { when: 'Jan 2017', who: 'GitLab.com', title: 'Database deleted, backups did not work', text: 'While fixing replication, an engineer removed about <b>300 GB</b> of data from the primary. The daily <code>pg_dump</code> uploads to S3 had been failing because of a Postgres <b>version mismatch</b>, so the bucket was empty. GitLab restored from a staging snapshot and lost database changes made between <b>17:20 and 00:00 UTC</b>.', src: 2 },
      { when: 'Feb 2017', who: 'GitLab.com', title: 'Public write-up and follow-ups', text: 'GitLab documented the incident in public as it happened and listed which of its backup and replication mechanisms had failed, then tracked every follow-up in a public issue. It is the canonical lesson that <b>backups must be restore-tested</b>.', src: 3 },
      { when: 'Mar 2021', who: 'OVHcloud', title: 'Strasbourg fire destroys SBG2', text: 'A fire in the early hours of 10 March 2021 destroyed the SBG2 data centre and damaged SBG1; the rest of the Strasbourg campus was shut down. Any backup kept <b>on the same campus</b> shared the fate of production.', src: 4 },
      { when: 'Mar 2022', who: 'OVHcloud (fire report)', title: 'What the investigation found', text: 'The fire service report found SBG2 had <b>no automatic fire extinguishing system</b> and no electrical cut-off. Physical site design is part of every provider\'s blast radius, which is why off-site copies matter.', src: 5 },
      { when: 'Dec 2021', who: 'AWS us-east-1', title: 'Control planes fail, data planes keep going', text: 'Network congestion on AWS\'s internal network impaired EC2 APIs and other services. <b>Route 53 APIs were impaired from 7:30 AM to 2:30 PM PST</b>, so customers could not change DNS records, but existing records kept answering. Failover that needs a DNS <i>change</i> or new instances during a regional event can fail.', src: 6 },
      { when: 'current', who: 'AWS (fault isolation)', title: 'Static stability', text: 'AWS recommends pre-provisioning capacity rather than relying on a control plane to launch replacements during a failure. For DR: prefer warm standby with capacity already running, and failover mechanisms that are <b>data-plane</b> actions.', src: 7 },
      { when: 'current', who: 'Amazon Aurora', title: 'Global Database: seconds, not zero', text: 'AWS markets an effective <b>RPO of 1 second and RTO under 1 minute</b>. The user guide is more careful: a cross-Region failover has a non-zero RPO "measured in seconds", and RTO can be "in the order of minutes".', src: 8 },
      { when: 'current', who: 'Patroni (open source)', title: 'Bounded data loss on automatic failover', text: 'Patroni\'s <code>maximum_lag_on_failover</code> limits how far behind a replica may be and still be promoted; <code>synchronous_mode</code> ensures committed transactions are not lost on failover, at the cost of write availability when no sync standby is available.', src: 10 }
    ],
    lessons: [
      'Set RTO and RPO <b>per tier</b> from business impact, and get the owner to sign them.',
      'Replicas protect against site loss; only <b>backups with PITR</b> protect against deletion and corruption.',
      'Keep a copy in <b>another account, another region, immutable</b>.',
      'Make failover a <b>data-plane</b> action with capacity already running; control planes are often impaired during big events.',
      '<b>Drill it.</b> The measured RTO is the only real one.'
    ],
    sources: [
      { title: 'Disaster recovery options in the cloud', url: 'https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html', pub: 'AWS whitepaper: Disaster Recovery of Workloads on AWS' },
      { title: 'Business Continuity Plan (BCP)', url: 'https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/business-continuity-plan-bcp.html', pub: 'AWS whitepaper: Disaster Recovery of Workloads on AWS' },
      { title: 'Postmortem of database outage of January 31', url: 'https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/', pub: 'GitLab blog, 10 Feb 2017' },
      { title: 'GitLab.com database incident', url: 'https://about.gitlab.com/2017/02/01/gitlab-dot-com-database-incident/', pub: 'GitLab blog, 1 Feb 2017' },
      { title: 'OVH data centre in Strasbourg on fire', url: 'https://www.theregister.com/2021/03/10/ovh_strasbourg_fire/', pub: 'The Register, 10 Mar 2021' },
      { title: 'OVHcloud fire report', url: 'https://www.theregister.com/2022/03/22/ovhcloud_fire_datacenter_report/', pub: 'The Register, 22 Mar 2022' },
      { title: 'Summary of the AWS Service Event in the Northern Virginia (US-EAST-1) Region', url: 'https://aws.amazon.com/message/12721/', pub: 'AWS, December 2021' },
      { title: 'Static stability', url: 'https://docs.aws.amazon.com/whitepapers/latest/aws-fault-isolation-boundaries/static-stability.html', pub: 'AWS whitepaper: AWS Fault Isolation Boundaries' },
      { title: 'Amazon Aurora Global Database', url: 'https://aws.amazon.com/rds/aurora/global-database/', pub: 'AWS product page' },
      { title: 'Using switchover or failover in an Amazon Aurora global database', url: 'https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database-disaster-recovery.html', pub: 'Amazon Aurora User Guide' },
      { title: 'Replication modes', url: 'https://patroni.readthedocs.io/en/latest/replication_modes.html', pub: 'Patroni documentation' },
      { title: 'Dynamic configuration settings', url: 'https://patroni.readthedocs.io/en/latest/dynamic_configuration.html', pub: 'Patroni documentation' },
      { title: 'Continuous Archiving and Point-in-Time Recovery (PITR)', url: 'https://access.crunchydata.com/documentation/postgresql15/15.2/continuous-archiving.html', pub: 'PostgreSQL 15 documentation (Crunchy Data mirror)' },
      { title: 'Write Ahead Log: synchronous_standby_names', url: 'https://www.postgresql.org/docs/current/interactive/runtime-config-wal.html', pub: 'PostgreSQL documentation' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Strategy', '<b>Backup &amp; restore / pilot light</b>: cheap, RTO of hours (or tens of minutes)', '<b>Warm standby / active-active</b>: RTO of minutes, 1.5–2×+ cost (<em>estimate</em>)', 'From the business impact analysis: cost of an hour down vs the yearly cost of standby'],
      ['Replication', '<b>Async</b>: no commit latency, RPO = lag (seconds)', '<b>Sync</b>: RPO 0, every commit pays a cross-region RTT and writes stall if the standby is gone', 'Sync for money and ledgers in nearby regions; async (with lag alerts) for most data'],
      ['Failover trigger', '<b>Manual</b>: a human confirms; fewer false failovers', '<b>Automated</b>: faster, but needs fencing and a 3-site quorum', 'Automate within a region (Patroni across zones); keep cross-region failover a human decision unless RTO demands otherwise'],
      ['Traffic switch', '<b>DNS failover</b>: simple, follows TTL, clients may cache longer', '<b>Global anycast load balancer</b>: near-instant, one more critical dependency', 'DNS with TTL 60 s for most; global LB when seconds matter'],
      ['Multi-region writes', '<b>Single writer + standby</b>: no conflicts, failover needed', '<b>Multi-writer</b> (partitioned by key, or consensus DB such as Spanner / distributed SQL)', 'Multi-writer only when RTO near 0 is a hard need and the data model allows partitioning'],
      ['Backups', '<b>Snapshots in the same account</b>: fast restores', '<b>Immutable, cross-account copies</b>: survive ransomware and admin compromise', 'Both: local for speed, immutable remote for survival (3-2-1)']
    ]
  },
  failures: [
    { f: 'Backups that were never restored', detect: 'No restore-test record in the last month; backup job "succeeds" with tiny output files', fix: 'Automated restore test that boots the backup, runs checks and records measured RTO; alert when it is missing or slow.' },
    { f: 'Backups inside the blast radius', detect: 'Backup bucket in the same region, account or campus as production; same admin credentials can delete both', fix: '3-2-1: three copies, two media, one off-site, plus an immutable (Object Lock / WORM) copy in a separate account.' },
    { f: 'Replication mistaken for backup', detect: 'DR plan has a standby but no PITR; a bad migration would replicate instantly', fix: 'Continuous WAL archiving with pgBackRest / WAL-G and retention long enough to notice the mistake.' },
    { f: 'Split brain after automated failover', detect: 'Two nodes report <code>pg_is_in_recovery() = false</code>; writes on both; conflicting IDs', fix: 'DCS leader lock with TTL, watchdog, quorum in three locations, and fencing of the old primary before promotion.' },
    { f: 'Failover depends on a broken control plane', detect: 'Drill only works when all cloud APIs are healthy; runbook says "launch instances" or "edit DNS record"', fix: 'Static stability: pre-provisioned capacity, health-checked DNS records that flip without API calls, routing controls with a data-plane API.' },
    { f: 'DNS TTL and client caching longer than RTO', detect: 'Traffic still hits the dead region minutes after the flip; JVMs or mobile clients cache DNS', fix: 'TTL ≤ 60 s on failover records, set JVM <code>networkaddress.cache.ttl</code>, retry with re-resolution in clients.' },
    { f: 'Failback without reconciliation', detect: 'Old primary restarted as writer; customers report missing or duplicate orders', fix: 'Rebuild old primary as a standby (pg_rewind), export orphaned writes, reconcile with the business, then do a planned switchover.' }
  ],
  interview: [
    { q: 'Define RTO and RPO, and give an example where they differ a lot.', a: '<p><b>RTO</b> (recovery time objective) is the maximum acceptable time until the service is usable again. <b>RPO</b> (recovery point objective) is the maximum acceptable data loss, measured as time before the disruption.</p><p>They are independent. A search index can have RTO 15 min but RPO 24 h (rebuild from source). A payments ledger may accept RTO 1 h but needs RPO 0. A common misreading is that RPO is "how old the backup is": it is the <b>worst-case</b> gap, so with daily backups RPO is 24 h, not "last night".</p>', lvl: 'core' },
    { q: 'Walk through the four AWS DR strategies.', a: '<ul><li><b>Backup &amp; restore</b>: only data in the recovery region; rebuild infrastructure from code and restore. RTO hours, RPO = backup interval. Cheapest.</li><li><b>Pilot light</b>: data replicated live, core infrastructure defined, app servers off. RTO tens of minutes.</li><li><b>Warm standby</b>: a scaled-down working copy taking test traffic. RTO minutes, mainly scale-up.</li><li><b>Multi-site active/active</b>: both regions serve production. RTO near zero, highest cost and needs a multi-writer data story.</li></ul><p>Choose the cheapest one that meets the tier\'s RTO/RPO.</p>', lvl: 'core' },
    { q: 'How do you set RTO and RPO for a company with 80 services?', a: '<p>Run a <b>business impact analysis</b> with the owners: cost per hour of downtime (revenue, SLA credits, regulatory), cost of lost data, dependencies. Group services into <b>tiers</b> (e.g. tier 0: payments, auth; tier 3: internal reporting), with one strategy per tier.</p><p>Watch dependencies: a tier 0 service that calls a tier 2 service is really tier 2. Then compare the yearly cost of the standby with expected loss (probability × impact) and get the owner to sign.</p>', lvl: 'core' },
    { q: 'Synchronous vs asynchronous replication: what does each mean for RPO and latency?', a: '<p><b>Async</b>: the primary commits locally and ships WAL afterwards. No added latency; RPO = replication lag (usually sub-second, more under load).</p><p><b>Sync</b>: the commit waits until a standby confirms it has the WAL (<code>synchronous_commit = on</code> waits for flush, <code>remote_apply</code> for replay). RPO 0 for that standby, but each commit pays the round trip, and if no sync standby is available writes block.</p><p>A middle ground is a <b>quorum</b>: <code>ANY 1 (local, remote)</code> waits for whichever answers first.</p>', fu: 'Does sync replication protect against a DROP TABLE? (No: it replicates the mistake. You need PITR.)', lvl: 'core' },
    { q: 'What is point-in-time recovery and how is it implemented in Postgres?', a: '<p>Take a <b>base backup</b> and archive every WAL segment continuously (<code>archive_command</code>, usually via pgBackRest or WAL-G). To recover, restore the base backup, create <code>recovery.signal</code>, set <code>restore_command</code> and <code>recovery_target_time</code>, and Postgres replays WAL up to that moment.</p><p>RPO is how much WAL had not been archived yet (minutes, or seconds with <code>archive_timeout</code> or streaming to the repo). RTO is restore time plus replay time, which you only know by testing.</p>', lvl: 'core' },
    { q: 'What is split brain and how does Patroni prevent it?', a: '<p>Split brain is two primaries accepting writes after a partition. Patroni keeps a <b>leader key with a TTL</b> in a consensus store (etcd, Consul, ZooKeeper). The primary must renew it every loop; if it cannot, it demotes itself before the TTL expires. Only a node that acquires the key can promote.</p><p>Add a <b>watchdog</b> so a hung Patroni process causes a reboot, place DCS members in <b>three</b> failure domains, and fence the old primary (stop it, cut its network, or revoke its storage) before trusting the new one.</p>', lvl: 'deep' },
    { q: 'Your DR plan fails over by updating a DNS record. What can go wrong?', a: '<ul><li>The DNS <b>control plane</b> may be impaired during the same event: in AWS\'s December 2021 us-east-1 event, Route 53 APIs were impaired for about 7 hours while existing records kept answering. Prefer health-checked failover records that flip on their own.</li><li><b>TTLs</b> and client caches (JVM, mobile, corporate resolvers) delay the switch beyond the TTL.</li><li>Detection itself: health checks must test the real dependency path, not a static page.</li></ul>', lvl: 'deep' },
    { q: 'Why is replication not a backup? Use a real incident.', a: '<p>Replication copies every change, including the wrong ones, within seconds. In the GitLab.com incident of January 2017 an engineer deleted the data directory on the primary while working on replication; the daily <code>pg_dump</code> had been failing due to a version mismatch, and GitLab ended up restoring a staging snapshot and lost roughly six hours of changes.</p><p>Lessons: keep PITR backups, store them outside the blast radius, and <b>restore-test them automatically</b>.</p>', lvl: 'core' },
    { q: 'How would you design failback after a regional failover?', a: '<ol><li>Do not restart the old primary as a writer: it may hold writes that never reached the new one.</li><li>Extract the orphaned changes (from WAL or logical decoding) into a reconciliation table.</li><li>Rebuild the old site as a standby of the new primary (<code>pg_rewind</code> or new base backup).</li><li>Reconcile the orphans with the business owner.</li><li>Do a <b>planned switchover</b> in a quiet window: drain, wait for lag 0, promote, flip traffic. Planned switchovers are RPO 0.</li></ol>', lvl: 'deep' },
    { q: 'When would you choose active/active over warm standby?', a: '<p>Only when minutes of RTO are unacceptable <b>and</b> the data model allows it: writes partitioned by key (each user has a home region), or a database built for multi-region consensus. Cost is roughly 2× or more and every feature must handle multi-region semantics (see <a href="cap-pacelc.html">CAP / PACELC</a>).</p><p>For most systems, warm standby with a 15–30 min RTO is far cheaper and simpler, and the remaining risk is managed with drills.</p>', lvl: 'deep' },
    { q: 'Tell me about a time you improved a team\'s disaster recovery.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><p><b>Situation:</b> Our order service had a documented RTO of 1 h, but nobody had ever failed over; backups ran nightly to the same account.</p><p><b>Task:</b> Prove or fix the RTO before a regulatory audit.</p><p><b>Action:</b> I ran a game day in staging: the restore took 3 h 40 min, mostly WAL replay, and two runbook steps referenced deleted scripts. We added a Patroni standby in a second region, cross-account immutable backups with pgBackRest, and a weekly automated restore test that reports measured RTO.</p><p><b>Result:</b> The next quarterly drill measured RTO 22 min and RPO ~2 s; the audit passed and the drill is now a standing quarterly event.</p>', lvl: 'core' },
    { q: 'How do you convince leadership to pay for warm standby?', a: '<p>Turn it into money and risk they own: <b>cost per hour down</b> × realistic outage duration with today\'s plan (measured, from a drill) vs the yearly cost of the standby. Show the tiers, so only tier 0–1 pay for it. Cite public incidents (OVHcloud 2021, AWS us-east-1 2021) as plausibility, not fear.</p><p>Offer options with explicit RTO/RPO and cost, and let the business owner choose and sign. Then commit to drills so the money buys a measured result.</p>', lvl: 'core' }
  ],
  code: [
    {
      title: 'Patroni + Postgres: quorum sync, WAL archiving with pgBackRest', lang: 'yaml',
      code: `# patroni.yml (excerpt) — one cluster spanning two regions
scope: orders
name: pg-a1
etcd3:
  hosts: etcd-a:2379,etcd-b:2379,etcd-c:2379   # 3 sites: A, B, tie-breaker
bootstrap:
  dcs:
    ttl: 30                       # leader lock lifetime (s)
    loop_wait: 10
    retry_timeout: 10             # loop_wait + 2*retry_timeout <= ttl
    maximum_lag_on_failover: 1048576   # don't promote a replica > 1 MiB behind
    synchronous_mode: true        # only a sync standby may be auto-promoted
    synchronous_node_count: 1
    postgresql:
      use_pg_rewind: true
      parameters:
        wal_level: replica
        synchronous_commit: "on"
        archive_mode: "on"
        archive_command: "pgbackrest --stanza=orders archive-push %p"
        archive_timeout: 60       # force a segment switch at least every 60 s
        max_wal_senders: 10
postgresql:
  recovery_conf:
    restore_command: "pgbackrest --stanza=orders archive-get %f %p"
watchdog:
  mode: required                  # refuse to lead without /dev/watchdog
  device: /dev/watchdog
  safety_margin: 5
# Without Patroni, the plain-Postgres equivalent of quorum commit is:
#   synchronous_standby_names = 'ANY 1 (pg_a2, pg_b1)'`,
      note: 'With <code>synchronous_mode</code>, Patroni manages <code>synchronous_standby_names</code> itself. Use <code>synchronous_node_count</code> and a local + remote standby to get quorum behaviour. Put the pgBackRest repository in another region and account, with object lock enabled on the bucket.'
    },
    {
      title: 'Point-in-time recovery to just before a bad DELETE', lang: 'bash',
      code: `#!/usr/bin/env bash
# Restore the 'orders' cluster on a fresh host to 17:19:59 UTC (Postgres 15+).
set -euo pipefail
PGDATA=/var/lib/postgresql/15/main
TARGET="2026-11-10 17:19:59+00"

systemctl stop postgresql
rm -rf "\${PGDATA:?}"/*

# 1. Restore the newest base backup taken before TARGET and write the
#    recovery settings (restore_command, recovery_target_time) for us.
pgbackrest --stanza=orders --delta \\
  --type=time --target="$TARGET" --target-action=promote \\
  --target-exclusive restore

# pgBackRest writes to postgresql.auto.conf and creates recovery.signal:
#   restore_command = 'pgbackrest --stanza=orders archive-get %f "%p"'
#   recovery_target_time = '2026-11-10 17:19:59+00'
#   recovery_target_action = 'promote'

# 2. Start: Postgres replays archived WAL up to TARGET, then promotes.
systemctl start postgresql
until psql -Atqc "select not pg_is_in_recovery()" | grep -q t; do sleep 5; done

# 3. Verify before sending traffic.
psql -Atc "select max(created_at) from orders"   # should be <= TARGET`,
      note: '<code>--target-exclusive</code> stops just before the target time, so the 17:20 deletion is not replayed. With WAL-G the steps are <code>wal-g backup-fetch $PGDATA LATEST</code>, then set <code>restore_command = \'wal-g wal-fetch %f %p\'</code> and <code>recovery_target_time</code> yourself and <code>touch recovery.signal</code>.'
    },
    {
      title: 'Python: automated restore test that reports measured RTO', lang: 'python',
      code: `import subprocess, time, json

STANZA, TARGET_RTO_S = "orders", 30 * 60

def run(cmd: str) -> str:
    return subprocess.run(cmd, shell=True, check=True,
                          capture_output=True, text=True).stdout.strip()

def restore_test() -> dict:
    t0 = time.monotonic()
    run("systemctl stop postgresql && rm -rf /var/lib/postgresql/15/main/*")
    run(f"pgbackrest --stanza={STANZA} --delta --type=default restore")
    t_restored = time.monotonic()
    run("systemctl start postgresql")
    while run("psql -Atqc 'select pg_is_in_recovery()'") != "f":
        time.sleep(5)                       # WAL replay to end of archive
    t_ready = time.monotonic()
    age = float(run("psql -Atqc \\"select extract(epoch from now() - max(created_at)) from orders\\""))
    rows = int(run("psql -Atqc 'select count(*) from orders'"))
    rto = t_ready - t0
    return {"measured_rto_s": round(rto), "restore_s": round(t_restored - t0),
            "replay_s": round(t_ready - t_restored), "rows": rows,
            "newest_row_age_s": round(age),
            "pass": rto <= TARGET_RTO_S and rows > 0}

if __name__ == "__main__":
    report = restore_test()
    print(json.dumps(report))               # ship to the dr_drill table / metrics
    raise SystemExit(0 if report["pass"] else 1)`,
      note: 'Run it on an isolated host on a schedule (e.g. weekly). <code>newest_row_age_s</code> approximates the RPO of the backup chain at test time. Alert if the job fails, is missing, or the measured RTO trends towards the target.'
    }
  ],

  related: ['reliability-math', 'chaos-engineering', 'incident-management', 'slo-error-budgets', 'cap-pacelc', 'sd:distributed-sql', 'sd:object-storage']
});
