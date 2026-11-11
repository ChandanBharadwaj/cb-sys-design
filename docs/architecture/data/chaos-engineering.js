(function () {
SD.register({
  slug: 'chaos-engineering',
  domain: 8,
  title: 'Chaos Engineering',
  examples: 'Chaos Monkey, Gremlin, AWS FIS',
  tagline: 'Breaking things <b>on purpose, in a controlled way</b>: state a hypothesis about steady state, inject a real-world fault into a small slice of production, and abort the moment customers notice. You learn about the weakness <b>before</b> 3 a.m. teaches you.',
  tldr: {
    problem: 'Resilience features (timeouts, fallbacks, failover, autoscaling) are code paths that almost never run. Untested, they rot: the fallback throws, the failover runbook is stale, the timeout is the library default. You find out during the real outage.',
    idea: 'Run <b>experiments</b>, not random breakage: define a <b>steady-state</b> metric customers feel, <b>hypothesise</b> it holds when a fault hits, inject the fault into a <b>small blast radius</b> with an <b>automatic abort</b> tied to the SLO, compare against a control group, and turn every surprise into a fix and a regression experiment.',
    insight: 'Chaos engineering is <i>not</i> "breaking production for fun". It is the scientific method applied to reliability: the goal is to <b>disprove</b> a claim of resilience cheaply, while the cost is a few seconds of error budget on 1% of traffic.',
    numbers: [
      { v: '2011', l: 'Netflix publishes "The Netflix Simian Army", describing Chaos Monkey (Netflix Tech Blog)' },
      { v: '0.3%', l: 'share of traffic Netflix\'s ChAP diverted into experiments in its 2016 paper (Basiri et al.)' },
      { v: '5', l: 'advanced principles on principlesofchaos.org: hypothesis, real-world events, production, automation, blast radius' }
    ]
  },

  intro: {
    what: 'Chaos engineering is the practice of <b>deliberately injecting failures</b> (a server dies, a network link slows down, a dependency returns errors) into a running system to check that it keeps serving users. Each run is an <b>experiment</b> with a written hypothesis, a limited scope and a stop button. The output is not an outage: it is a list of weaknesses found while everyone is awake and watching.',
    analogy: {
      icon: '🚒',
      title: 'A fire drill, not an arson',
      text: 'A school does not wait for a real fire to learn that one exit is locked. It runs a <b>drill</b>: announced to the right people, on one building first, with a teacher ready to stop it. Chaos experiments are drills for software: a small, controlled "fire" (a killed node) checks that the exits (failover, fallbacks, alerts) really work. Where the analogy breaks: a drill fakes the fire, while a chaos experiment injects a <b>real</b> fault, which is why it needs an automatic stop.'
    },
    problem: 'Your shop has a Redis cache in front of the product database, and the design doc says "if the cache is down we fall back to the database". Nobody has ever tested it. One evening a cache node dies: every request that hashes to it waits 30 s on the client\'s default timeout, threads pile up, and checkout goes down for 40 minutes. The question chaos engineering answers is: <b>does the system really behave the way we believe when something fails, and how do we find out safely?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Trust the design doc and the unit tests',
        text: 'The team writes a fallback, unit-tests it with a mock that throws, and ships. Staging runs one cache node with no real traffic. Everyone <b>believes</b> the system is resilient, because nothing has broken yet.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'browse · buy', kind: 'client', at: [70, 0] },
            { id: 'app', label: 'Shop service', sub: 'fallback: untested', kind: 'service', at: [210, 110] },
            { id: 'c', label: 'Cache cluster', sub: '6 nodes', kind: 'cache', at: [70, 220] },
            { id: 'db', label: 'Product DB', sub: 'source of truth', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'u', to: 'app' }, { from: 'app', to: 'c' }, { from: 'app', to: 'db', dashed: true }],
          flow: ['u>app', 'app>c'],
          ok: ['c']
        }
      },
      {
        stage: 'breaks',
        title: 'A real node dies at 3 a.m.',
        text: 'One cache node fails. The client has no timeout, so requests for its keys <b>hang</b>; the fallback never runs because no exception is ever thrown. Threads fill up and the whole shop stalls. The fallback was correct code on an <b>unreachable path</b>.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'spinners', kind: 'client', at: [70, 0] },
            { id: 'app', label: 'Shop service', sub: 'threads stuck', kind: 'service', at: [210, 110] },
            { id: 'c', label: 'Cache cluster', sub: '1 node dead', kind: 'cache', at: [70, 220] },
            { id: 'db', label: 'Product DB', sub: 'never called', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'u', to: 'app' }, { from: 'app', to: 'c' }, { from: 'app', to: 'db', dashed: true }],
          flow: [['u>app', 'u>app'], 'app>c'],
          err: ['c', 'app'],
          warn: ['u'],
          badges: { c: ['hangs 30 s', 'err'], app: ['pool full', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Run the failure on purpose, small and watched',
        text: 'The team writes a hypothesis ("p99 stays under 300 ms when one cache node dies"), kills one node for <b>1% of traffic</b> on a Tuesday afternoon, and arms an <b>auto-abort</b> on the SLO. The experiment fails in seconds, the abort fires, a timeout is added, and the rerun passes.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: '1% in experiment', kind: 'client', at: [70, 0] },
            { id: 'app', label: 'Shop service', sub: 'timeout 50 ms', kind: 'service', at: [210, 110] },
            { id: 'c', label: 'Cache cluster', sub: '1 node killed', kind: 'cache', at: [70, 220] },
            { id: 'db', label: 'Product DB', sub: 'fallback works', kind: 'store', at: [350, 220] },
            { id: 'g', label: 'Abort guard', sub: 'SLO watch', kind: 'policy', at: [350, 0] }
          ],
          edges: [{ from: 'u', to: 'app' }, { from: 'app', to: 'c' }, { from: 'app', to: 'db' }, { from: 'g', to: 'app', dashed: true }],
          flow: ['u>app', 'app>c', 'app>db'],
          ok: ['app', 'db', 'g'],
          warn: ['c'],
          badges: { db: ['fallback', 'ok'], g: ['p99 OK', 'ok'] }
        }
      }
    ],
    usedBy: ['Netflix (Chaos Monkey, ChAP)', 'Amazon (GameDay)', 'Google (DiRT exercises)', 'Microsoft Azure (Chaos Studio)', 'AWS customers (Fault Injection Service)', 'Kubernetes shops (LitmusChaos, Chaos Mesh)'],
    whenToUse: [
      'You have <b>redundancy or fallbacks</b> in the design and need evidence they work, not just a diagram',
      'You already have <b>SLOs and good observability</b>, so you can see steady state and tell when it moves',
      'A recent incident revealed a failure mode you want to <b>prove is fixed</b> and keep fixed'
    ],
    whenNot: [
      'You cannot yet <b>see</b> steady state: build telemetry first (see <a href="observability-pillars.html">Three Pillars of Observability</a>)',
      'You <b>know</b> the system will fail (no timeouts, single points of failure): fix it first (see <a href="resiliency-patterns.html">Resiliency Patterns</a>); an experiment only confirms the outage',
      'The error budget is already spent: freeze risky work and recover the SLO (see <a href="slo-error-budgets.html">SLOs &amp; Error Budgets</a>)'
    ],
    glossary: [
      { term: 'Steady state', def: 'A measurable, customer-facing output that shows the system is behaving normally, such as successful checkouts per second or p99 latency.' },
      { term: 'Hypothesis', def: 'A falsifiable claim such as "steady state does not change when one cache node dies"; the experiment tries to disprove it.' },
      { term: 'Blast radius', def: 'The share of users, requests, hosts or regions an experiment can affect.' },
      { term: 'Control / experiment group', def: 'Two equally sized slices of traffic; only the experiment group gets the fault, so differences are caused by it.' },
      { term: 'Abort (stop) condition', def: 'An automatic rule, usually an SLO alarm, that ends the experiment and removes the fault when customers start to feel it.' },
      { term: 'Fault injection', def: 'The mechanism that causes a failure: killing a process, adding latency, dropping packets, returning errors from a library call.' },
      { term: 'Game day', def: 'A scheduled, team-wide exercise where a larger failure is injected and people practise detection and response together.' },
      { term: 'Error budget', def: 'The amount of unreliability an SLO allows (for example 0.1% of requests a month), which chaos experiments spend on purpose.' }
    ]
  },

  requirements: {
    functional: [
      'Define <b>steady state</b> from customer-visible outputs (throughput, error rate, latency percentiles), not CPU or internal counters',
      'Write a <b>falsifiable hypothesis</b> before injecting anything, with the abort thresholds next to it',
      'Inject <b>real-world events</b> weighted by likelihood and impact: instance loss, latency, dependency errors, network partition, zone or region loss',
      'Run where the truth is: <b>production</b> (a small slice) once staging experiments pass, because staging traffic and config differ',
      '<b>Minimise blast radius</b> and grow it in steps: 1 host or 1% of traffic, then 5%, 25%, a zone, a region',
      '<b>Automate</b> experiments to run continuously (in CI/CD or on a schedule) and feed every finding into a tracked fix'
    ],
    nonFunctional: [
      'Abort within <b>seconds</b> of an SLO breach (target: detection + rollback ≤ 60 s) and remove the fault automatically',
      'Chaos spends ≤ <b>10–20%</b> of the monthly error budget (team policy, <em>rule of thumb</em>)',
      'Every critical service has at least one <b>automated</b> experiment per release or per week',
      'Each experiment produces an outcome record: hypothesis held / failed / aborted, plus linked tickets',
      'Findings from failed experiments are fixed within an agreed SLA (e.g. high-severity within 2 sprints)',
      'Experiments are <b>opt-in</b>, scheduled, announced, and auditable (who ran what, where, when)'
    ],
    outOfScope: [
      '<b>Random breakage without a hypothesis</b>: you cause pain but learn nothing measurable',
      '<b>Chaos without observability</b>: if you cannot see steady state you cannot abort, or tell what happened',
      '<b>Starting in broad production</b> with no stop condition ("let\'s kill a region and see")',
      '<b>Findings with no owner</b>: experiments that fail every week and nobody fixes',
      'Treating a passed experiment as <b>proof forever</b>: systems drift, so experiments must rerun'
    ]
  },

  calculator: {
    inputs: [
      { id: 'svc', label: 'Services under chaos', min: 1, max: 500, value: 40, log: true },
      { id: 'exp', label: 'Experiments per month (all services)', min: 1, max: 1000, value: 60, log: true },
      { id: 'pf', label: 'Experiments that find an issue (estimate)', min: 1, max: 60, value: 15, unit: '%' },
      { id: 'br', label: 'Blast radius (share of traffic)', min: 0.1, max: 100, step: 0.1, value: 1, unit: '%' },
      { id: 'rps', label: 'Service traffic', min: 10, max: 100000, value: 2000, log: true, unit: 'req/s' },
      { id: 'det', label: 'Abort detection + rollback time', min: 5, max: 900, value: 60, unit: 's' }
    ],
    outputs: [
      { label: 'Issues found per year', fmt: 'num', f: (v) => Math.round(v.exp * 12 * v.pf / 100) },
      { label: 'Experiments per service per quarter', f: (v) => (v.exp * 3 / v.svc).toFixed(1) },
      { label: 'Worst case: requests hurt by one failing experiment (rps × radius × abort time)', fmt: 'num', f: (v) => Math.round(v.rps * v.br / 100 * v.det) },
      { label: 'Expected bad requests per month from chaos', fmt: 'num', f: (v) => Math.round(v.exp * v.pf / 100 * v.rps * v.br / 100 * v.det) },
      { label: 'Monthly error budget at 99.9% (requests)', fmt: 'num', f: (v) => Math.round(v.rps * 2592000 * 0.001) },
      { label: 'Share of that budget spent by chaos', fmt: 'pct', f: (v) => (v.exp * v.pf / 100 * v.br / 100 * v.det) / (2592000 * 0.001) }
    ],
    note: 'Model: a failing experiment (rate <em>estimate</em>) breaks <b>every</b> request in its blast radius until the abort fires; passing experiments cost nothing. That is pessimistic: a real failure usually hurts only part of the slice. The budget line assumes all experiments target one service with this traffic, a 30-day month and a 99.9% request SLO. Read it backwards: the two cheapest levers are <b>blast radius</b> and <b>abort time</b>, both linear. Going from 100% to 1% radius, or from a 15-minute human abort to a 60 s automatic one, cuts the cost by 100× and 15×.'
  },

  api: [
    { m: 'DOC', p: 'Experiment brief (one per experiment)', d: 'Steady-state metric, <b>hypothesis</b>, fault and target, blast radius, <b>abort conditions</b>, duration, owner, who is on call, rollback steps, comms. Reviewed before the first run, like a change request.' },
    { m: 'SLO', p: 'Abort conditions = SLO guardrails', d: 'E.g. "stop if experiment-group error rate &gt; 1% for 30 s, or p99 &gt; 300 ms for 60 s, or a P1 alert fires". Wired to the tool (FIS stop condition, Litmus probe with <code>stopOnFailure</code>, Gremlin halt).' },
    { m: 'YAML', p: 'ChaosEngine / NetworkChaos / FIS template', d: 'The experiment as code: target selector (labels, tags, <b>opt-in</b> tag), fault parameters, duration, stop conditions. Versioned and run from CI or a scheduler.' },
    { m: 'POLICY', p: 'Chaos policy', d: 'Which environments and services may be targeted, maximum blast radius per tier, <b>allowed hours</b> (business hours, no freezes, no peak events), approvals for zone/region faults, and error-budget limits.' },
    { m: 'DOC', p: 'Game day plan', d: 'Scenario, injected failures and their order, roles (facilitator, observers, responders), success criteria, "stop the game" word, and a blameless debrief template.' },
    { m: 'DOC', p: 'Findings report', d: 'Result per hypothesis, timeline, what was surprising, tickets with owners and due dates, and the <b>regression experiment</b> to add once fixed.' }
  ],
  dataModel: [
    { name: 'experiment', store: 'Chaos platform DB', fields: [['experiment_id', 'uuid', 'pk'], ['service', 'text', 'idx'], ['fault_type', 'enum'], ['target_selector', 'jsonb'], ['blast_radius_pct', 'numeric'], ['hypothesis', 'text'], ['abort_conditions', 'jsonb'], ['schedule', 'text'], ['owner', 'text']], note: 'The definition. Fault types: instance kill, latency, packet loss, partition, CPU/memory stress, dependency error, clock skew, DNS failure, zone/region evacuation.' },
    { name: 'experiment_run', store: 'Chaos platform DB', fields: [['run_id', 'uuid', 'pk'], ['experiment_id', 'uuid', 'fk'], ['env', 'enum'], ['started_at', 'timestamptz', 'idx'], ['ended_at', 'timestamptz'], ['outcome', 'enum'], ['abort_reason', 'text'], ['bad_requests', 'bigint'], ['budget_spent_pct', 'numeric']], note: 'Outcome: passed / hypothesis failed / aborted / inconclusive. <code>budget_spent_pct</code> lets the SLO owner see what chaos costs.' },
    { name: 'finding', store: 'Issue tracker', fields: [['finding_id', 'text', 'pk'], ['run_id', 'uuid', 'fk'], ['severity', 'enum'], ['description', 'text'], ['owner_team', 'text', 'idx'], ['due', 'date'], ['status', 'enum'], ['regression_experiment_id', 'uuid', 'fk']], note: 'Closing the loop: a finding is done only when its regression experiment passes.' }
  ],

  architecture: {
    title: 'A production chaos experiment: control vs experiment group with an SLO abort',
    nodes: [
      { id: 'users', label: 'Users', sub: 'real traffic', kind: 'client', wide: [90, 150], tall: [350, 0], tip: 'Real users. Only a small, sticky slice of them is routed into the experiment group.' },
      { id: 'router', label: 'Traffic router', sub: 'sticky 1% + 1%', kind: 'edge', wide: [280, 150], tall: [350, 105], tip: 'Gateway or service mesh that routes equal-sized slices to a control and an experiment cluster (Netflix used Zuul for this in ChAP).' },
      { id: 'control', label: 'Control group', sub: 'no fault', kind: 'service', wide: [480, 40], tall: [70, 210], tip: 'Same code, same config, same traffic share, no fault. The baseline for comparison.' },
      { id: 'exp', label: 'Experiment group', sub: 'fault injected', kind: 'service', wide: [480, 260], tall: [350, 315], tip: 'Same as control, except the fault is injected here (killed node, added latency, failed calls).' },
      { id: 'cache', label: 'Cache cluster', sub: 'dependency', kind: 'cache', wide: [480, 370], tall: [350, 420], tip: 'The dependency the hypothesis is about. The fault can be at the infrastructure (kill a node) or in the client library (FIT-style).' },
      { id: 'obs', label: 'Observability', sub: 'SLIs per group', kind: 'store', wide: [680, 150], tall: [210, 315], tip: 'Metrics split by group: error rate, p99, business KPIs (Netflix: stream starts per second). Without this split you cannot see the effect.' },
      { id: 'guard', label: 'Abort guardrail', sub: 'SLO thresholds', kind: 'policy', wide: [880, 150], tall: [70, 105], tip: 'Evaluates abort conditions every few seconds. On breach it stops the experiment and removes the fault: an FIS stop condition, a Litmus probe or a Gremlin halt.' },
      { id: 'hyp', label: 'Hypothesis', sub: 'p99 < 300 ms', kind: 'policy', wide: [680, 40], tall: [210, 0], tip: 'Written before the run: the steady-state metric, the expected result and the abort thresholds.' },
      { id: 'team', label: 'Service owners', sub: 'opt-in · on call', kind: 'team', wide: [880, 40], tall: [70, 0], tip: 'The team that owns the service opts in, picks a time and watches. Chaos is done with them, not to them.' },
      { id: 'orch', label: 'Fault injector', sub: 'FIS · Litmus · Gremlin', kind: 'compute', wide: [680, 260], tall: [210, 210], tip: 'Executes the fault: terminates instances, adds tc/netem latency, drops packets, stresses CPU, fails library calls.' },
      { id: 'backlog', label: 'Findings backlog', sub: 'fix → rerun', kind: 'queue', wide: [880, 260], tall: [210, 105], tip: 'Every failed hypothesis becomes a ticket with an owner and a regression experiment.' }
    ],
    edges: [
      { from: 'users', to: 'router' },
      { from: 'router', to: 'control' },
      { from: 'router', to: 'exp' },
      { from: 'exp', to: 'cache' },
      { from: 'control', to: 'obs' },
      { from: 'exp', to: 'obs' },
      { from: 'obs', to: 'guard', bend: 0.15 },
      { from: 'hyp', to: 'guard' },
      { from: 'team', to: 'hyp' },
      { from: 'guard', to: 'orch', label: 'abort' },
      { from: 'orch', to: 'exp', label: 'inject' },
      { from: 'guard', to: 'backlog', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'pass', title: 'Experiment passes: hypothesis holds', tone: 'ok',
      steps: [
        { text: 'The cart team opts in and writes the hypothesis: <b>"p99 &lt; 300 ms and errors &lt; 1% when one cache node dies"</b>. Abort thresholds are the same numbers.', flow: ['team>hyp', 'hyp>guard'], badges: { hyp: 'written first' } },
        { text: 'The router sends a sticky <b>1% of users</b> to the control group and another 1% to the experiment group. Everyone else is untouched.', flow: ['users>router', ['router>control', 'router>exp']], badges: { router: '1% + 1%' } },
        { text: 'The injector <b>kills one cache node</b> used by the experiment group only.', flow: ['orch>exp', 'exp>cache'], warn: ['cache'], badges: { cache: ['1 node down', 'warn'] } },
        { text: 'Requests for that node\'s keys time out in 50 ms and <b>fall back</b> to the database. Both groups report the same SLIs.', flow: [['control>obs', 'exp>obs']], ok: ['exp'], badges: { obs: 'Δ p99 +12 ms' } },
        { text: 'After 10 minutes the guardrail never fired. Outcome: <b>hypothesis held</b>. Confidence goes up, and the experiment is scheduled to run weekly.', nodes: ['guard', 'hyp'], ok: ['guard', 'hyp', 'exp'], badges: { guard: ['passed', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'abort', title: 'Hypothesis fails: SLO abort fires', tone: 'err',
      steps: [
        { text: 'Same experiment, but this service\'s cache client has <b>no timeout</b>. The killed node\'s requests hang.', flow: ['orch>exp', 'exp>cache'], err: ['cache'], badges: { cache: ['hangs', 'err'] } },
        { text: 'Experiment-group p99 jumps to 2 s and errors to 15%; the control group is flat. The <b>difference</b> between groups is the signal.', flow: [['control>obs', 'exp>obs']], err: ['exp'], ok: ['control'], badges: { exp: ['p99 2 s', 'err'], control: ['p99 90 ms', 'ok'] } },
        { text: 'The guardrail sees errors &gt; 1% for 10 s and <b>aborts</b>: the injector restores the node and the router stops sending users to the experiment group.', flow: ['obs>guard', 'guard>orch'], err: ['guard'], badges: { guard: ['ABORT', 'err'] }, tone: 'err' },
        { text: 'Cost: about 1% of users for ~15 s. A real node loss would have hit <b>100%</b> of users until someone woke up. A finding is filed with the cart team.', flow: ['guard>backlog'], warn: ['backlog'], badges: { backlog: ['+1 finding', 'warn'] } },
        { text: 'The fix (client timeout + fallback) ships; the <b>same experiment</b> is rerun and passes, and becomes a regression check in CI.', nodes: ['exp', 'backlog'], ok: ['exp', 'backlog'], badges: { backlog: ['closed', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'grow', title: 'Growing the blast radius at scale', tone: 'warn',
      steps: [
        { text: 'The experiment passed at 1%. The next step is <b>5%</b>, then <b>25%</b>, then a whole availability zone. Each step needs a clean pass at the previous one.', nodes: ['router'], badges: { router: '1% → 5% → 25%' } },
        { text: 'At 25% the fallback sends <b>far more reads to the database</b> than it has ever seen. Latency rises in <b>both</b> groups because they share the DB.', flow: ['router>exp', 'exp>cache'], warn: ['exp', 'control'], badges: { control: ['p99 ↑', 'warn'] } },
        { text: 'This is a <b>scale finding</b>: the fallback works for one node but not for many. Small experiments could never show it.', nodes: ['obs'], warn: ['obs'], badges: { obs: ['shared DB hot', 'warn'] } },
        { text: 'The guardrail stops at the SLO line. The fix is capacity planning (DB read replicas, a stale-cache fallback) before trying zone loss.', flow: ['obs>guard', 'guard>orch', 'guard>backlog'], warn: ['guard'], badges: { guard: ['stopped at 25%', 'warn'] }, tone: 'warn' }
      ]
    },
    {
      id: 'gameday', title: 'Game day: practising the people part', tone: 'info',
      steps: [
        { text: 'A scheduled <b>game day</b>: the facilitator plans a zone failure for the payments stack. Owners, on-call and support are in one room or call.', nodes: ['team', 'hyp'], badges: { team: 'facilitator + on-call' } },
        { text: 'The injector blocks traffic to one zone. Responders must <b>detect</b> it from dashboards and alerts, not from the facilitator.', flow: ['orch>exp', 'exp>cache'], warn: ['exp', 'cache'], badges: { exp: ['zone lost', 'warn'] } },
        { text: 'Findings are often <b>human</b>: an alert routed to an old rota, a runbook that names a deleted dashboard, a failover needing an admin who is on leave.', flow: ['exp>obs', 'obs>guard'], warn: ['obs'], badges: { obs: ['alert late', 'warn'] } },
        { text: 'A blameless debrief turns each surprise into a ticket. The automated version of the scenario is added so it runs <b>without</b> a room full of people next time.', flow: ['guard>backlog'], ok: ['backlog'], badges: { backlog: ['6 findings', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'You are planning one experiment on a checkout service at 2,000 req/s with a 99.9% SLO (≈ 5.2 M "bad request" budget per month). Pick where to run it, what to inject, how big, and how it stops. Numbers are an <em>illustrative model</em>; the directions are what matter.',
    controls: [
      { id: 'env', label: 'Environment', type: 'seg', value: 'canary', options: [
        { v: 'staging', l: 'Staging' }, { v: 'canary', l: 'Prod canary slice' }, { v: 'broad', l: 'Prod broad' }] },
      { id: 'fault', label: 'Fault type', type: 'seg', value: 'kill', options: [
        { v: 'kill', l: 'Instance / node kill' }, { v: 'latency', l: 'Dependency latency' }, { v: 'dep', l: 'Dependency errors' }, { v: 'region', l: 'Zone / region loss' }] },
      { id: 'br', label: 'Blast radius', type: 'range', min: 1, max: 100, step: 1, value: 5, unit: '%', kind: 'pct', fmt: (v) => v + '%' },
      { id: 'abort', label: 'Abort automation', type: 'seg', value: 'slo', options: [
        { v: 'none', l: 'None (humans watch)' }, { v: 'slo', l: 'SLO-based auto-abort' }] }
    ],
    evaluate(s) {
      const realism = { staging: 0.35, canary: 0.85, broad: 1 }[s.env];
      const faultLearn = { kill: 0.55, latency: 0.85, dep: 0.75, region: 0.95 }[s.fault];
      const faultSev = { kill: 0.3, latency: 0.6, dep: 0.7, region: 1 }[s.fault];
      const br = s.env === 'canary' ? Math.min(s.br, 10) : s.br;      // canary slice caps the radius
      const abortS = s.abort === 'slo' ? 30 : 600;                   // seconds of harm before stopping
      const prod = s.env !== 'staging';
      const learn = Math.min(1, realism * (0.4 + 0.6 * faultLearn) * (0.75 + 0.25 * Math.min(1, br / 25)));
      const harm = prod ? 2000 * (br / 100) * abortS * faultSev * 0.3 : 0;   // expected bad requests (30% chance the hypothesis fails)
      const budget = harm / 5184000;
      const risk = prod ? Math.min(1, (br / 100) * faultSev * (s.abort === 'slo' ? 0.5 : 2)) : 0.02;
      const confidence = Math.min(1, realism * (s.fault === 'region' ? 0.95 : 0.8) * (br >= 5 ? 1 : 0.8));
      const effort = 0.3 + (s.fault === 'region' ? 0.35 : 0) + (s.abort === 'slo' ? 0.15 : 0) + (s.env === 'broad' ? 0.1 : 0);
      const metrics = [
        { k: 'Learning value', v: learn >= 0.7 ? 'high' : learn >= 0.4 ? 'medium' : 'low', s: learn, hint: s.env === 'staging' ? 'staging ≠ prod' : '' },
        { k: 'Customer risk', v: !prod ? 'none' : risk < 0.05 ? 'low' : risk < 0.25 ? 'moderate' : 'high', s: 1 - risk, hint: prod ? Math.round(br) + '% of users exposed' : '' },
        { k: 'Confidence in result', v: Math.round(confidence * 100) + '%', s: confidence },
        { k: 'Effort to run safely', v: effort > 0.75 ? 'game-day scale' : effort > 0.5 ? 'planned' : 'routine', s: 1 - Math.min(1, effort) },
        { k: 'Error budget used', v: prod ? (budget * 100 < 0.1 ? '< 0.1%' : (budget * 100).toFixed(1) + '%') : '0%', s: budget < 0.01 ? 0.95 : budget < 0.1 ? 0.6 : budget < 0.3 ? 0.3 : 0.05, hint: '≈ ' + SD.fmt.num(Math.round(harm)) + ' bad req' },
        { k: 'Time to stop harm', v: !prod ? 'n/a' : s.abort === 'slo' ? '≈ 30 s (automatic)' : '≈ 10 min (humans)', s: !prod ? 0.9 : s.abort === 'slo' ? 0.9 : 0.25 }
      ];
      const notes = [];
      if (s.env === 'staging') notes.push('Staging is the right <b>first</b> step, but its traffic, data volume and config differ from production. The principles say to sample real traffic for a reason.');
      if (s.env === 'canary' && s.br > 10) notes.push('A canary slice is capped at 10% here; to go wider you are running <b>broad</b> production chaos.');
      if (s.env === 'broad' && s.abort === 'none') notes.push('Broad production with no automatic stop is how chaos engineering gets <b>banned</b> at a company. Always wire abort conditions to the SLO.');
      if (s.fault === 'region') notes.push('Zone or region loss is the most valuable and most expensive test: it needs spare capacity and a rehearsed evacuation (Netflix\'s Chaos Kong). Run it as a <b>game day</b> first.');
      if (s.fault === 'kill') notes.push('Instance kills are cheap and well understood since Chaos Monkey; most mature systems pass them. <b>Latency</b> and partial dependency failure find more bugs.');
      if (s.fault === 'latency') notes.push('Latency is nastier than a crash: nothing throws, so timeouts and breakers are the only defence. It finds missing timeouts quickly.');
      if (budget > 0.2) notes.push('This plan could burn <b>' + Math.round(budget * 100) + '%</b> of the monthly error budget. Shrink the radius or automate the abort.');
      let verdict;
      if (s.env === 'broad' && s.abort === 'none') verdict = '❌ <b>Reckless:</b> real users, wide radius and no automatic stop. One bad hypothesis becomes an incident.';
      else if (prod && s.abort === 'none') verdict = '⚠ <b>Risky:</b> production but stopped only by people watching dashboards. Automate the abort before you widen the radius.';
      else if (s.env === 'staging') verdict = '👍 <b>Safe rehearsal.</b> Good for a first run and for CI regression, but it will not prove production behaviour.';
      else if (s.env === 'broad' && s.br > 25) verdict = '⚠ <b>Big step.</b> Only do this after the same experiment passed at smaller radii, ideally as an announced game day.';
      else if (s.fault === 'region') verdict = '👍 <b>High value, high effort.</b> Make it a planned game day with capacity reserved and every owner present.';
      else verdict = '✅ <b>Textbook:</b> real production traffic, a small slice, a realistic fault and an SLO-based abort. Maximum learning per unit of risk.';
      return {
        metrics, verdict, notes,
        labels: {
          router: { label: s.env === 'staging' ? 'Load generator' : 'Traffic router', sub: s.env === 'staging' ? 'synthetic traffic' : 'sticky ' + br + '% + ' + br + '%' },
          orch: { label: 'Fault injector', sub: { kill: 'kill 1 node', latency: '+400 ms latency', dep: '50% call errors', region: 'evacuate zone' }[s.fault] },
          guard: s.abort === 'slo' ? { label: 'Abort guardrail', sub: 'SLO auto-stop' } : { label: 'Humans watching', sub: 'manual stop' }
        },
        warn: s.abort === 'none' ? ['guard'] : [],
        err: s.env === 'broad' && s.abort === 'none' ? ['exp', 'users'] : [],
        ok: s.abort === 'slo' ? ['guard'] : [],
        badges: { exp: [prod ? br + '% of users' : 'staging', prod && br > 25 ? 'warn' : 'info'], guard: [s.abort === 'slo' ? '≈ 30 s' : '≈ 10 min', s.abort === 'slo' ? 'ok' : 'warn'] },
        flow: ['users>router', 'router>exp', 'orch>exp', 'exp>cache', 'exp>obs', 'obs>guard']
      };
    }
  },

  widget: {
    title: 'Experiment runner: hypothesis, fault, blast radius, auto-abort',
    caption: 'Hypothesis: <b>"p99 &lt; 300 ms and errors &lt; 1% in the experiment group when one cache node fails"</b>. Pick a fault and a blast radius, then <b>Run</b>. Each tick simulates real requests to a 6-node cache: those that hash to the faulty node behave as the fault says. Without a fallback the hypothesis fails and the <b>SLO auto-abort</b> removes the fault after 3 s of breach. Turn on <b>Fix: timeout + fallback</b> and rerun.'
  },

  realWorld: {
    intro: 'Chaos engineering grew from Amazon\'s GameDay and Netflix\'s move to AWS, was written down as principles by Netflix in 2015–2016, and became managed cloud services by 2021–2023. Every card links to its source.',
    timeline: [
      { when: 'early 2000s', who: 'Amazon · Jesse Robbins', title: 'GameDay', text: 'Robbins, with a firefighter\'s background, created GameDay at Amazon to increase resilience by <b>purposely injecting major failures</b> into critical systems semi-regularly, to discover flaws and subtle dependencies. Described in a 2012 ACM Queue roundtable with Kripa Krishnan (Google DiRT) and John Allspaw.', src: 0 },
      { when: 'Jul 2011', who: 'Netflix', title: 'The Netflix Simian Army', text: 'Netflix described <b>Chaos Monkey</b>, which randomly terminates production instances during business hours so engineers build services that tolerate it, and its siblings: Latency Monkey, Conformity Monkey, Janitor Monkey and <b>Chaos Gorilla</b> (a whole availability zone).', src: 1 },
      { when: '2012', who: 'Netflix', title: 'Chaos Monkey open-sourced', text: 'Netflix announced it would open-source Chaos Monkey as part of its Netflix OSS tools; the Simian Army code followed on GitHub. A rewritten Chaos Monkey 2.0 integrated with Spinnaker came later.', src: 2 },
      { when: '2015–2016', who: 'Netflix · Basiri et al.', title: 'Principles and the IEEE Software paper', text: 'Netflix published <b>principlesofchaos.org</b> and the paper "Chaos Engineering" (IEEE Software, May/June 2016), defining it as <i>experimenting on a distributed system to build confidence in its capability to withstand turbulent conditions in production</i>, and using a customer metric, stream starts per second, as steady state. It also describes <b>Chaos Kong</b>, which evacuates a whole AWS region.', src: 3 },
      { when: '2016', who: 'Netflix', title: 'ChAP: automated experiments', text: 'The Chaos Automation Platform runs experiments in production with <b>control and experiment clusters</b> and uses <b>FIT</b> (failure injection testing) to fail or delay calls between services. The paper describes diverting <b>0.3% of traffic</b> to test resilience to failures of non-critical services.', src: 4 },
      { when: '2017', who: 'Gremlin', title: 'Chaos as a commercial service', text: 'Gremlin, founded in 2016 by former Amazon and Netflix engineers Kolton Andrus and Matthew Fornaciari, launched a "failure as a service" product with host, network and application attacks and a halt button.', src: 5 },
      { when: '2020 · 2022', who: 'CNCF', title: 'LitmusChaos and Chaos Mesh incubate', text: 'Both Kubernetes-native chaos frameworks entered the CNCF Sandbox in 2020 and moved to <b>Incubating</b> in early 2022 (Litmus in January, Chaos Mesh in February). Experiments are custom resources: ChaosEngine, PodChaos, NetworkChaos.', src: 6 },
      { when: '2021', who: 'AWS', title: 'Fault Injection Service (FIS)', text: 'AWS\'s managed service runs experiment templates (actions such as stopping EC2 instances, CPU stress, network disruption) with <b>stop conditions</b> wired to CloudWatch alarms; an experiment stopped by an alarm cannot be resumed.', src: 7 },
      { when: 'Nov 2023', who: 'Microsoft', title: 'Azure Chaos Studio GA', text: 'After about two years in preview, Azure Chaos Studio became generally available, with service-direct and agent-based faults, experiment templates and load-testing faults. Microsoft describes using it to test Azure\'s own services.', src: 8 }
    ],
    lessons: [
      'The method matters more than the tool: <b>hypothesis, small blast radius, automatic abort</b>, then widen.',
      'Measure <b>customer-facing</b> steady state (Netflix: stream starts per second), and compare against a control group.',
      'Instance kills are the start, not the end: <b>latency, partial failures and region loss</b> find the expensive bugs.',
      'Game days test the <b>people</b> and runbooks; automated experiments keep the fixes from regressing.'
    ],
    sources: [
      { title: 'Resilience Engineering: Learning to Embrace Failure', url: 'https://cacmb4.acm.org/magazines/2012/11/156581-resilience-engineering/fulltext', pub: 'ACM Queue 2012, reprinted in CACM Nov 2012 (Robbins, Krishnan, Allspaw, Limoncelli)' },
      { title: 'The Netflix Simian Army', url: 'https://techblog.netflix.com/2011/07/netflix-simian-army.html', pub: 'Netflix Tech Blog, July 2011' },
      { title: 'Netflix to Open Source Chaos Monkey and More', url: 'https://siliconangle.com/blog/2012/04/13/netflix-to-open-source-chaos-monkey-and-more/', pub: 'SiliconANGLE, April 2012' },
      { title: 'Chaos Engineering (Basiri et al.)', url: 'https://arxiv.org/abs/1702.05843', pub: 'IEEE Software 33(3), 2016; arXiv 1702.05843' },
      { title: 'A Platform for Automating Chaos Experiments', url: 'https://arxiv.org/abs/1702.05849', pub: 'Basiri et al., ISSRE Workshops 2016' },
      { title: 'Gremlin Brings Chaos Engineering to Every Cloud Organization', url: 'https://www.businesswire.com/news/home/20171212005851/en/Gremlin-Brings-Chaos-Engineering-Cloud-Organization--', pub: 'Business Wire, December 2017' },
      { title: 'Chaos Mesh moves to the CNCF Incubator', url: 'https://cncf.io/blog/2022/02/16/chaos-mesh-moves-to-the-cncf-incubator', pub: 'CNCF blog, February 2022' },
      { title: 'Stop conditions for AWS FIS', url: 'https://docs.aws.amazon.com/fis/latest/userguide/stop-conditions.html', pub: 'AWS FIS User Guide' },
      { title: 'Azure Chaos Studio is now generally available', url: 'https://azure.microsoft.com/updates/azure-chaos-studio-is-now-generally-available/', pub: 'Azure Updates, November 2023' },
      { title: 'Principles of Chaos Engineering', url: 'https://principlesofchaos.org/', pub: 'principlesofchaos.org (last updated March 2019)' },
      { title: 'LitmusChaos becomes a CNCF incubator project', url: 'https://thenewstack.io/litmuschaos-becomes-a-cncf-incubator-project/', pub: 'The New Stack, January 2022' },
      { title: 'Automating chaos experiments in production', url: 'https://arxiv.org/abs/1905.04648', pub: 'Basiri et al., ICSE-SEIP 2019' }
    ]
  },

  tradeoffs: {
    headers: ['Approach', 'Realism', 'Customer risk', 'Effort', 'Best for'],
    rows: [
      ['<b>Unit / integration tests with fault doubles</b> (Toxiproxy, mocks)', 'Low: one component, fake traffic', 'None', 'Low; runs in CI', 'Proving a timeout or fallback code path exists and works'],
      ['<b>Staging chaos</b> (Litmus, Chaos Mesh in a pre-prod cluster)', 'Medium: real infra, synthetic load', 'None', 'Low–medium', 'First run of every experiment; regression checks per release'],
      ['<b>Production canary slice</b> with control group and auto-abort', 'High: real traffic and config', 'Low (1–5% for seconds)', 'Medium: routing, per-group metrics', 'The core practice; continuous automated experiments (ChAP-style)'],
      ['<b>Game day</b> (planned, people in the loop)', 'High, includes humans and runbooks', 'Medium, announced', 'High: a day of several teams', 'Zone/region failover, incident response, new systems before launch'],
      ['<b>Random always-on chaos</b> (Chaos Monkey style)', 'High', 'Low for stateless fleets', 'Low once in place', 'Keeping "any instance can die" true forever as a cultural forcing function']
    ]
  },

  failures: [
    { f: '<b>No hypothesis</b>: "let\'s break stuff and see"', detect: 'Experiments have no written expected outcome or abort thresholds; results are anecdotes.', fix: 'Template every experiment: steady state, hypothesis, abort conditions, owner. No template, no run.' },
    { f: '<b>Abort that does not stop</b>', detect: 'The fault (a tc rule, a stopped instance, a stress process) stays after the abort; nobody tested the rollback.', fix: 'Test the abort path itself in staging; prefer faults with a built-in duration; keep a manual kill switch.' },
    { f: '<b>Blast radius bigger than planned</b>', detect: 'Control group metrics move too; shared dependencies (DB, cache, quota) spread the fault.', fix: 'Pick targets by opt-in tag, cap count/percentage in the tool, and include shared dependencies in abort conditions.' },
    { f: '<b>Findings never fixed</b>', detect: 'The same experiment fails week after week; the backlog of findings grows.', fix: 'Findings get owners and SLAs, tracked like postmortem actions; pause new experiments on a service with stale findings.' },
    { f: '<b>Chaos fatigue / loss of trust</b>', detect: 'Teams opt out, or an experiment caused an incident and chaos was banned.', fix: 'Opt-in, business hours, announced runs, start small, publish wins (bugs found before customers did).' },
    { f: '<b>Testing only easy faults</b>', detect: 'Every experiment is an instance kill and everything passes.', fix: 'Weight faults by real incident history: latency, partial errors, DNS, clock skew, quota exhaustion, zone loss.' },
    { f: '<b>Blind experiments</b>', detect: 'Metrics are not split by group, or dashboards lag by minutes.', fix: 'Make per-group SLIs and fast (≤ 10 s) aggregation a prerequisite; that is maturity level one.' }
  ],

  interview: [
    { q: 'What is chaos engineering, and how is it different from testing?', a: 'Netflix\'s definition: <b>"the discipline of experimenting on a system in order to build confidence in the system\'s capability to withstand turbulent conditions in production"</b>. A test <i>asserts</i> a known property of a component in a controlled environment; an experiment <i>explores</i> the emergent behaviour of the whole system (config, traffic, dependencies, people) and can produce new knowledge. They are complementary: chaos findings often turn into tests.', lvl: 'core' },
    { q: 'Walk me through the principles of chaos engineering.', a: '<ul><li><b>Build a hypothesis around steady-state behaviour</b>: a measurable customer output (throughput, error rate, latency percentiles).</li><li><b>Vary real-world events</b>, weighted by likelihood: crashes, latency, malformed responses, traffic spikes.</li><li><b>Run experiments in production</b>, because behaviour depends on real traffic.</li><li><b>Automate experiments to run continuously.</b></li><li><b>Minimise blast radius.</b></li></ul>The method: define steady state, hypothesise it continues in control and experiment groups, inject, try to disprove by finding a difference.', fu: 'Which of these do teams most often skip? (The hypothesis, and the control group.)', lvl: 'core' },
    { q: 'A common misreading is "chaos engineering means randomly killing servers in production". What is wrong with that?', a: 'Random instance termination (Chaos Monkey) is <b>one</b> fault type and one tool. The discipline is about <b>controlled experiments</b>: written hypothesis, chosen fault, minimal blast radius, automated abort, and learning. Many experiments start in staging. "Running in production" is the advanced end of a maturity path, not the entry ticket, and never without a stop condition.', lvl: 'core' },
    { q: 'How do you choose abort conditions?', a: 'Tie them to the <b>SLO</b> of the service, measured on the <b>experiment group</b>: e.g. error rate &gt; 1% for 30 s or p99 &gt; 300 ms for 60 s, plus any P1 alert, plus a business KPI drop (orders/min). Thresholds sit <b>at or slightly inside</b> the SLO so you stop before customers broadly notice. Detection must be fast (short evaluation windows) and the abort must remove the fault automatically: AWS FIS uses CloudWatch alarms as stop conditions; Litmus uses probes with <code>stopOnFailure</code>.', lvl: 'core' },
    { q: 'How does chaos engineering relate to error budgets?', a: 'An experiment that fails <b>spends</b> error budget, deliberately and in small, bounded amounts, to avoid spending far more on an unplanned outage. The cost is roughly <b>traffic × blast radius × time to abort</b>. Practical rules: allocate a slice (say 10–20%, a <em>rule of thumb</em>) of the budget to chaos; when the budget is exhausted, pause production experiments (the error-budget policy freezes risky work). A healthy budget is permission to experiment.', lvl: 'deep' },
    { q: 'What do you need before your first production experiment?', a: '<ul><li><b>Observability</b>: SLIs that can be split by group, updated within seconds.</li><li><b>SLOs</b> and an agreed error budget.</li><li><b>Basic resilience</b> already in place (timeouts, redundancy): otherwise you know the answer.</li><li>A way to <b>scope</b>: opt-in tags, traffic routing or host selection.</li><li>An <b>automatic abort</b> and a tested rollback.</li><li>On-call and owners aware; business hours; no change freeze or peak event.</li></ul>And a successful run of the same experiment in staging.', lvl: 'core' },
    { q: 'Describe a chaos maturity model.', a: 'A useful ladder (adapted from Netflix\'s sophistication/adoption model): <b>1</b> ad-hoc game days in staging, manual, results in docs; <b>2</b> scripted experiments in staging, in CI per release; <b>3</b> production experiments on small slices with control groups and automatic aborts; <b>4</b> continuous automated experiments across many services, findings tracked to fixes; <b>5</b> experiments selected automatically (by risk and past incidents), region-level exercises routine. Adoption (how many teams) is the second axis: a sophisticated platform used by one team is still immature.', lvl: 'deep' },
    { q: 'Design: how would you test that your service survives the loss of an availability zone?', a: 'Start with a hypothesis ("checkout success rate ≥ 99.5% and p99 &lt; 500 ms during loss of zone A"). Prerequisites: capacity in the other zones (N+1), zone-aware load balancing, data replicated across zones. Step 1: staging zone-loss with FIS/Chaos Mesh network blackhole. Step 2: production, one service, during business hours, as a <b>game day</b>, with abort on SLO and a pre-agreed manual "stop" word. Watch: health checks, LB draining time, connection pool reconnection, leader elections, DNS TTLs. Step 3: automate it quarterly. Netflix\'s <b>Chaos Kong</b> does the same for whole regions by evacuating traffic.', lvl: 'deep' },
    { q: 'Which fault types do you inject, and which find the most bugs?', a: 'Instance/pod kill, CPU/memory/disk stress, <b>latency</b>, packet loss, network partition/blackhole, dependency errors (5xx, exceptions), DNS failure, clock skew, certificate expiry, quota/limit exhaustion, zone/region loss. Kills are cheap and most stateless systems pass them. <b>Latency and partial failure</b> find more bugs: nothing throws, so missing timeouts, unbounded queues and retry storms show up. Weight the list by your own incident history.', lvl: 'core' },
    { q: 'How do you get a sceptical organisation to allow chaos experiments?', a: 'Start where risk is zero: a <b>game day in staging</b> that reproduces a recent incident, and show the findings. Make it <b>opt-in</b>, scheduled, in business hours, with small blast radius and an automatic abort, and publish the abort logic. Report in money and incidents: "found 6 issues, 2 would have been P1s". Frame it as cheaper than the next outage and as error budget spent on purpose. Never surprise a team: chaos is done <b>with</b> owners, not to them.', lvl: 'core' },
    { q: 'Tell me about a time a chaos experiment or game day found something important.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Our checkout claimed to survive a Redis node loss; a similar incident at a partner had cost them hours. <b>T:</b> As the platform architect I had to prove it without risking revenue. <b>A:</b> I wrote a hypothesis (p99 &lt; 300 ms, errors &lt; 1%), ran it in staging (passed, but staging had one shard), then in production for 1% of users with a FIS stop condition on the p99 alarm. It aborted after 14 s: the Lettuce client had a 60 s command timeout and no fallback on that path. <b>R:</b> We set a 100 ms timeout with a DB fallback, reran at 1%, 5% and 25% (the 25% run exposed DB read load, fixed with a replica), and added the experiment to our weekly schedule. The next real node failure, four months later, caused no customer impact.', lvl: 'deep' },
    { q: 'How would you close the loop so chaos actually improves reliability?', a: 'Every run produces an outcome record. Failed hypotheses become <b>findings</b> with owners, severity and due dates, tracked like postmortem actions. A finding is closed only when the <b>regression experiment</b> passes, and that experiment then runs continuously. Report trends: findings opened/closed, mean time to fix, error budget spent on chaos vs on incidents. In an interview, say: "I would decide the environment and radius from maturity and the error budget, start small with an SLO abort, and judge success by fixed findings, not by experiments run."', lvl: 'deep' }
  ],

  code: [
    {
      title: 'LitmusChaos: delete 25% of cart pods, stop if the SLO probe fails',
      lang: 'yaml',
      code: `apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: cart-pod-delete
  namespace: shop
spec:
  engineState: active
  appinfo:
    appns: shop
    applabel: app=cart          # only workloads that opted in carry this label
    appkind: deployment
  chaosServiceAccount: pod-delete-sa
  experiments:
    - name: pod-delete
      spec:
        components:
          env:
            - name: TOTAL_CHAOS_DURATION
              value: "120"       # seconds
            - name: CHAOS_INTERVAL
              value: "20"
            - name: PODS_AFFECTED_PERC
              value: "25"        # blast radius
            - name: FORCE
              value: "false"
        probe:
          - name: checkout-steady-state
            type: httpProbe
            mode: Continuous     # checked during the whole experiment
            httpProbe/inputs:
              url: http://checkout.shop.svc:8080/api/health/slo
              method:
                get:
                  criteria: ==
                  responseCode: "200"
            runProperties:
              probeTimeout: 2s
              interval: 5s
              retry: 1
              stopOnFailure: true   # abort the experiment on breach`,
      note: 'The <code>/api/health/slo</code> endpoint is your own: it returns 503 when the service\'s recent error rate or p99 breaks the hypothesis. The pod-delete experiment CR and service account must be installed from the Litmus ChaosHub first.'
    },
    {
      title: 'AWS FIS (CloudFormation): stop one opted-in cache node, abort on a p99 alarm',
      lang: 'yaml',
      code: `Resources:
  CheckoutP99Alarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmDescription: Abort chaos if checkout p99 > 300 ms
      Namespace: AWS/ApplicationELB
      MetricName: TargetResponseTime
      Dimensions:
        - Name: LoadBalancer
          Value: !Ref CheckoutAlbFullName
      ExtendedStatistic: p99
      Period: 10
      EvaluationPeriods: 3
      Threshold: 0.3              # seconds
      ComparisonOperator: GreaterThanThreshold
      TreatMissingData: notBreaching

  CacheNodeStop:
    Type: AWS::FIS::ExperimentTemplate
    Properties:
      Description: Stop one cache node for 10 minutes
      RoleArn: !GetAtt FisRole.Arn
      Tags:
        Name: cache-node-stop
      StopConditions:
        - Source: aws:cloudwatch:alarm
          Value: !GetAtt CheckoutP99Alarm.Arn
      Targets:
        CacheNodes:
          ResourceType: aws:ec2:instance
          ResourceTags:
            chaos-opt-in: "true"
            role: cache
          Filters:
            - Path: State.Name
              Values: [running]
          SelectionMode: COUNT(1)   # blast radius: one node
      Actions:
        StopNode:
          ActionId: aws:ec2:stop-instances
          Parameters:
            startInstancesAfterDuration: PT10M
          Targets:
            Instances: CacheNodes`,
      note: 'Period 10 s needs high-resolution metrics; with standard 60 s metrics, detection takes minutes, which is a real cost in the calculator above. <code>FisRole</code> and <code>CheckoutAlbFullName</code> are defined elsewhere in the stack.'
    },
    {
      title: 'Spring Boot 3 test: inject cache latency with Toxiproxy (Testcontainers)',
      lang: 'java',
      code: `@SpringBootTest
@Testcontainers
class CacheLatencyChaosTest {
  static final Network net = Network.newNetwork();

  @Container
  static final GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine")
      .withExposedPorts(6379).withNetwork(net).withNetworkAliases("redis");

  @Container
  static final ToxiproxyContainer toxiproxy =
      new ToxiproxyContainer("ghcr.io/shopify/toxiproxy:2.9.0").withNetwork(net);

  static Proxy proxy;

  @DynamicPropertySource
  static void props(DynamicPropertyRegistry r) throws IOException {
    var client = new ToxiproxyClient(toxiproxy.getHost(), toxiproxy.getControlPort());
    proxy = client.createProxy("redis", "0.0.0.0:8666", "redis:6379");
    r.add("spring.data.redis.host", toxiproxy::getHost);
    r.add("spring.data.redis.port", () -> toxiproxy.getMappedPort(8666));
    r.add("spring.data.redis.timeout", () -> "100ms");   // the fix under test
  }

  @Autowired ProductService products;

  @Test
  void slowCacheFallsBackWithinLatencyBudget() throws IOException {
    proxy.toxics().latency("slow-cache", ToxicDirection.DOWNSTREAM, 1_000);
    try {
      long t0 = System.nanoTime();
      Product p = products.get("sku-42");                 // must fall back to the DB
      long ms = Duration.ofNanos(System.nanoTime() - t0).toMillis();
      assertThat(p).isNotNull();
      assertThat(ms).isLessThan(300);                     // the hypothesis, as a test
    } finally {
      proxy.toxics().get("slow-cache").remove();
    }
  }
}`,
      note: 'Uses <code>org.testcontainers:toxiproxy</code> and <code>eu.rekawek.toxiproxy:toxiproxy-java</code>. <code>ProductService</code> must catch the Redis timeout and read from the database. This is the CI-level "experiment": it proves the fallback path exists before you try it in production.'
    }
  ],

  related: ['resiliency-patterns', 'slo-error-budgets', 'disaster-recovery', 'incident-management', 'reliability-math', 'observability-pillars', 'sd:distributed-cache']
});
})();
