SD.register({
  slug: 'okrs-to-nfrs',
  domain: 3,
  title: 'Translating OKRs to Tech',
  examples: 'Impact mapping, latency budgets',
  tagline: 'Turn "grow retention" into <b>p95 page load &lt; 200 ms</b>, then into an <b>architecture tactic</b> and an <b>SLO</b> that proves it, so every technical decision can be traced back to a business result.',
  tldr: {
    problem: 'Leadership sets goals in business words ("lift conversion", "cut cost to serve"). Engineering hears "build feature X" or "make it fast". Nobody can say which architecture work moves which goal, so the roadmap fills with outputs and the goals are graded by gut feel.',
    idea: 'Build an explicit <b>traceability chain</b>: objective → key result → user journey → <b>non-functional requirement</b> written as a measurable quality scenario → <b>architecture tactic</b> → <b>SLO or fitness function</b> that is measured continuously. Split a latency target into a <b>budget per tier</b>.',
    insight: 'A key result describes an <b>outcome</b> (behaviour or business number changes), not an output (we shipped a cache). The architect\'s job is the middle of the chain: a falsifiable hypothesis that "this tactic moves this NFR, and this NFR moves that KR", checked with real measurements, ideally an experiment.',
    numbers: [
      { v: '0.1 s', l: 'mobile speed gain linked to +8.4% retail and +10.1% travel conversion (Deloitte for Google, "Milliseconds Make Millions", 2020)' },
      { v: '+8%', l: 'sales from a Vodafone landing page with 31% better LCP in an A/B test (web.dev case study, 2021)' },
      { v: '≈ 70%', l: 'Google\'s "success" score for stretch OKRs; committed OKRs should hit 100% (Google re:Work guide)' }
    ]
  },

  intro: {
    what: 'An <b>OKR</b> is a goal written as an <b>Objective</b> (what we want, in words) plus 2–5 <b>Key Results</b> (numbers that show we got there). Translating OKRs to tech means finding which <b>quality of the system</b> (speed, availability, cost, auditability) drives each key result, writing it down as a measurable requirement, and choosing the architecture that meets it.',
    analogy: {
      icon: '🏃',
      title: 'Training for a marathon time',
      text: 'The goal "finish a marathon in under 4 hours" is the objective and key result. A coach turns it into a <b>pace budget</b>: 5:41 per km, split over 42 km. That pace drives the training tactics (long runs, intervals), and a watch measures every run against it. Architects do the same: a business goal becomes a latency or availability budget split across tiers, tactics are chosen to meet it, and dashboards measure it. The analogy breaks in one place: running faster always helps the runner, but past a point a faster page no longer moves the business number.'
    },
    problem: 'The company objective is "customers come back more often". The engineering roadmap says "migrate to Kubernetes" and "add GraphQL". Six months later retention is flat, nobody knows whether the platform work helped, and the next budget review cuts it. The question this answers is: <b>which measurable property of the system moves this business goal, how much is enough, and how will we know?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Goals in slides, features in Jira',
        text: 'Leadership publishes objectives. Teams translate them into a list of features and technical projects, ship them, and mark the key results "on track" because the work is done.',
        scene: {
          nodes: [
            { id: 'obj', label: 'Objective', sub: 'grow retention', kind: 'policy', at: [70, 0] },
            { id: 'team', label: 'Eng team', sub: 'feature list', kind: 'team', at: [210, 0] },
            { id: 'sys', label: 'System', sub: 'k8s + GraphQL', kind: 'service', at: [350, 0] },
            { id: 'kr', label: 'Key result', sub: '"on track"', kind: 'policy', at: [210, 110] }
          ],
          edges: [{ from: 'obj', to: 'team' }, { from: 'team', to: 'sys' }, { from: 'team', to: 'kr' }],
          flow: ['obj>team', 'team>sys', 'team>kr']
        }
      },
      {
        stage: 'breaks',
        title: 'Outputs shipped, outcome unchanged',
        text: 'Everything shipped, yet returning users did not move. Pages still take 3 seconds on mobile, which nobody measured. The key result was graded on <b>output</b> (we built it), not <b>outcome</b> (users behaved differently).',
        scene: {
          nodes: [
            { id: 'obj', label: 'Objective', sub: 'grow retention', kind: 'policy', at: [70, 0] },
            { id: 'team', label: 'Eng team', sub: 'all shipped', kind: 'team', at: [210, 0] },
            { id: 'sys', label: 'System', sub: 'p95 3.1 s mobile', kind: 'service', at: [350, 0] },
            { id: 'kr', label: 'Key result', sub: 'retention flat', kind: 'policy', at: [210, 110] },
            { id: 'user', label: 'Users', sub: 'bounce', kind: 'client', at: [350, 110] }
          ],
          edges: [{ from: 'obj', to: 'team' }, { from: 'team', to: 'sys' }, { from: 'team', to: 'kr' }, { from: 'sys', to: 'user' }],
          flow: ['team>sys', 'sys>user'],
          err: ['kr'], warn: ['sys', 'user'],
          badges: { kr: ['no link', 'err'], user: ['slow', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'A chain you can measure',
        text: 'Map the goal to a journey ("open the app and see my feed") and a <b>quality target</b> (p95 load under 200 ms). Pick a <b>tactic</b> (edge caching) and an <b>SLO</b> that watches it. Now the team can test whether faster pages really bring people back.',
        scene: {
          nodes: [
            { id: 'obj', label: 'Objective', sub: 'grow retention', kind: 'policy', at: [70, 0] },
            { id: 'kr', label: 'Key result', sub: '7-day return +5%', kind: 'policy', at: [210, 0] },
            { id: 'nfr', label: 'NFR', sub: 'p95 load < 200 ms', kind: 'policy', at: [350, 0] },
            { id: 'sys', label: 'Edge cache', sub: 'tactic', kind: 'cache', at: [350, 110] },
            { id: 'slo', label: 'SLO', sub: '95% < 200 ms', kind: 'compute', at: [210, 110] },
            { id: 'user', label: 'Users', sub: 'come back', kind: 'client', at: [70, 110] }
          ],
          edges: [{ from: 'obj', to: 'kr' }, { from: 'kr', to: 'nfr' }, { from: 'nfr', to: 'sys' }, { from: 'sys', to: 'slo' }, { from: 'slo', to: 'user' }],
          flow: ['obj>kr', 'kr>nfr', 'nfr>sys', 'sys>slo', 'slo>user'],
          ok: ['slo', 'user'],
          badges: { slo: ['measured', 'ok'] }
        }
      }
    ],
    usedBy: ['Intel (OKRs under Andy Grove)', 'Google (OKRs since 1999)', 'Teams using impact mapping (Gojko Adzic)', 'Web teams tracking Core Web Vitals', 'SRE teams with SLOs per user journey'],
    whenToUse: [
      'The company runs OKRs and engineering cannot show how platform work moves them',
      'You need to justify an architecture investment (CDN, multi-region, re-platforming) to executives',
      'Several teams own parts of one user journey and need a shared latency or availability budget'
    ],
    whenNot: [
      'Pure exploration or a prototype: you do not yet know which behaviour matters; run experiments first',
      'The goal is already a technical SLO with an owner: go straight to <a href="slo-error-budgets.html">SLIs, SLOs &amp; Error Budgets</a>',
      'You need to rank quality attributes against each other, not trace one goal: use <a href="quality-attributes.html">Quality Attributes &amp; ATAM</a>'
    ],
    glossary: [
      { term: 'Objective', def: 'A qualitative, inspiring statement of what you want to achieve this period.' },
      { term: 'Key result', def: 'A number that shows progress toward the objective; it measures an outcome, not a task.' },
      { term: 'Outcome vs output', def: 'An output is something you shipped; an outcome is a change in user behaviour or a business number.' },
      { term: 'NFR', def: 'Non-functional requirement: a quality the system must have, such as speed, availability or cost, ideally with a number.' },
      { term: 'Quality attribute scenario', def: 'A testable NFR: source, stimulus, environment, artefact, response and response measure (SEI).' },
      { term: 'Architecture tactic', def: 'A design decision that improves one quality attribute, such as caching for latency or redundancy for availability.' },
      { term: 'Latency budget', def: 'An end-to-end latency target split into an allowance for each tier and network hop.' },
      { term: 'Fitness function', def: 'An automated check that an architectural characteristic still meets its target (Ford, Parsons, Kua).' }
    ]
  },

  requirements: {
    functional: [
      'Every architecture initiative names the <b>objective and key result</b> it serves, or is labelled "hygiene" honestly',
      'Key results measure <b>outcomes</b> (behaviour, revenue, cost per unit), never outputs ("ship X")',
      'Each KR maps to one or more <b>user journeys</b> and the system quality that limits them',
      'Write the quality as a <b>measurable scenario</b>: stimulus, environment, response measure (p95, %, $)',
      'Split end-to-end targets into <b>budgets per tier</b> with an owner for each',
      'Close the loop: an <b>SLO or fitness function</b> measures the NFR, and an experiment checks the NFR really moves the KR'
    ],
    nonFunctional: [
      'Traceability: 100% of funded tech initiatives link to a KR or a named risk',
      'Latency NFRs stated as percentiles (p95/p99) from real users (RUM), not averages from servers',
      'Latency budget slack ≥ 10–20% of the target per journey (<em>rule of thumb</em>) for variance and new features',
      'Availability NFRs as SLOs per journey, e.g. checkout 99.95% over 28 days',
      'Cost KRs as <b>unit economics</b> (cost per order, per active user), not total cloud bill',
      'KR progress visible weekly from automated data, not quarterly from slides'
    ],
    outOfScope: [
      '<b>Output KRs</b>: "launch the new cache" is a task, not a result',
      '<b>Vanity NFRs</b>: "the system must be fast and scalable" with no number',
      '<b>Average latency</b> targets that hide the slow tail users actually feel',
      '<b>Goodhart traps</b>: optimising the proxy (server p95) while the real goal (retention) does not move',
      '<b>One giant budget</b>: an end-to-end target with no per-tier owner, so every team assumes another will fix it'
    ]
  },

  calculator: {
    inputs: [
      { id: 'target', label: 'Target p95 page load (end to end)', min: 50, max: 2000, value: 200, step: 10, unit: 'ms' },
      { id: 'tiers', label: 'Tiers on the miss path (edge, gateway, app, DB…)', min: 1, max: 8, value: 4, step: 1 },
      { id: 'rtt', label: 'Network round trip per hop', min: 1, max: 150, value: 25, step: 1, unit: 'ms' },
      { id: 'srv', label: 'Server time per tier (p95)', min: 1, max: 300, value: 30, step: 1, unit: 'ms' },
      { id: 'hit', label: 'Edge (CDN) latency on a cache hit', min: 5, max: 200, value: 40, step: 5, unit: 'ms' },
      { id: 'ratio', label: 'Current cache hit ratio', min: 0, max: 100, value: 80, step: 1, unit: '%' }
    ],
    outputs: [
      { label: 'Even budget per tier (target ÷ tiers)', fmt: 'ms', f: (v) => v.target / v.tiers },
      { label: 'Miss path latency = tiers × (RTT + server)', fmt: 'ms', f: (v) => v.tiers * (v.rtt + v.srv) },
      { label: 'Slack on the miss path (target − miss)', f: (v) => { const s = v.target - v.tiers * (v.rtt + v.srv); return (s >= 0 ? '+' : '') + Math.round(s) + ' ms' + (s < 0 ? ' (over budget)' : ''); } },
      { label: 'Required cache hit ratio for p95 ≤ target', f: (v) => {
        const miss = v.tiers * (v.rtt + v.srv);
        if (miss <= v.target) return '0% (misses already fit)';
        if (v.hit > v.target) return 'impossible: even hits are too slow';
        return '≥ 95% (≤ 5% of requests may miss)';
      } },
      { label: 'p95 at the current hit ratio', f: (v) => { const miss = v.tiers * (v.rtt + v.srv); const slow = Math.max(miss, v.hit), fast = Math.min(miss, v.hit); const fracSlow = miss >= v.hit ? 1 - v.ratio / 100 : v.ratio / 100; const p = fracSlow > 0.05 ? slow : fast; return Math.round(p) + ' ms ' + (p <= v.target ? '✅' : '❌'); } },
      { label: 'Mean latency (looks fine, hides the tail)', fmt: 'ms', f: (v) => (v.ratio / 100) * v.hit + (1 - v.ratio / 100) * v.tiers * (v.rtt + v.srv) }
    ],
    note: 'Model: a request is either a <b>hit</b> served at the edge or a <b>miss</b> that crosses every tier (one RTT + server time each). With two latencies, the p95 is the slow one whenever more than 5% of requests take the slow path, so meeting a p95 with caching alone needs a <b>≥ 95% hit ratio</b>, whatever the mean says. Real tiers have jitter and parallel calls; the widget below samples that. Per-tier numbers are <em>illustrative</em>.'
  },

  api: [
    { m: 'DOC', p: 'OKR sheet (per quarter)', d: 'Objective in words; 2–5 KRs with baseline, target, owner and data source. Mark each as <b>committed</b> (must hit 100%) or <b>aspirational</b> (≈ 70% is success), as in Google\'s guide.' },
    { m: 'DOC', p: 'Impact map', d: 'Adzic\'s four levels: <b>Why</b> (goal = the KR), <b>Who</b> (actors who can help or hinder), <b>How</b> (behaviour change we want), <b>What</b> (deliverables, including architecture work). Each branch is a hypothesis.' },
    { m: 'YAML', p: 'okr-trace.yaml', d: 'Machine-readable chain: KR → journey → NFR scenario → tactic → SLO id. Reviewed in Git, rendered into a dashboard, and checked in CI so no SLO is orphaned.' },
    { m: 'SLO', p: 'Journey SLO', d: 'E.g. "95% of feed page loads (RUM, LCP) &lt; 200 ms over 28 days". Owns the per-tier latency budget table and links back to the KR it serves.' },
    { m: 'ADR', p: 'ADR: "Edge-cache the feed"', d: 'Context cites the KR and NFR; decision names the tactic; consequences state the expected NFR change, cost and how the experiment will prove it.' },
    { m: 'DOC', p: 'KR review (monthly)', d: 'KR trend next to its NFRs and SLOs, experiment results, and a call: keep investing, change tactic, or drop the hypothesis.' }
  ],
  dataModel: [
    { name: 'okr_key_result', store: 'Postgres', fields: [['kr_id', 'text', 'pk'], ['objective', 'text'], ['metric_query', 'text'], ['baseline', 'numeric'], ['target', 'numeric'], ['kind', 'enum(committed, aspirational)'], ['owner', 'text'], ['quarter', 'text', 'idx']], note: 'The KR is an outcome metric with a query behind it, so progress comes from data.' },
    { name: 'quality_scenario', store: 'Git (YAML) → Postgres', fields: [['nfr_id', 'text', 'pk'], ['kr_id', 'text', 'fk'], ['journey', 'text'], ['stimulus', 'text'], ['environment', 'text'], ['response_measure', 'text'], ['tactic', 'text'], ['slo_id', 'text', 'fk']], note: 'One row per link in the chain; the SEI scenario fields make the NFR testable.' },
    { name: 'latency_budget', store: 'Postgres', fields: [['journey', 'text', 'pk'], ['tier', 'text', 'pk'], ['budget_ms', 'int'], ['observed_p95_ms', 'int'], ['owner_team', 'text']], note: 'Per-tier allowance vs reality. The sum of budgets plus network must stay under the journey target.' },
    { name: 'kr_experiment', store: 'Postgres', fields: [['exp_id', 'uuid', 'pk'], ['nfr_id', 'text', 'fk'], ['variant', 'text'], ['nfr_delta', 'numeric'], ['kr_delta', 'numeric'], ['confidence', 'numeric']], note: 'Evidence that moving the NFR moved the KR, e.g. a slowdown or speed-up A/B test.' }
  ],

  architecture: {
    title: 'From objective to SLO: the traceability chain over a real request path',
    nodes: [
      { id: 'obj', label: 'Objective', sub: 'grow retention', kind: 'policy', wide: [90, 0], tall: [70, 0], tip: 'Qualitative and inspiring. Set by leadership for the quarter or year.' },
      { id: 'kr', label: 'Key result', sub: '7-day return 38→42%', kind: 'policy', wide: [290, 0], tall: [210, 0], tip: 'An outcome number with a baseline, a target and a data source. Not a feature.' },
      { id: 'journey', label: 'User journey', sub: 'open app → feed', kind: 'client', wide: [490, 0], tall: [350, 0], tip: 'Which user behaviour must change, and which journey limits it. This is the "How" level of an impact map.' },
      { id: 'nfr', label: 'NFR scenario', sub: 'p95 load < 200 ms', kind: 'policy', wide: [690, 0], tall: [350, 105], tip: 'A quality attribute scenario: on a 4G phone, at peak, 95% of feed loads finish within 200 ms (RUM).' },
      { id: 'slo', label: 'SLO / fitness fn', sub: '95% < 200 ms · 28 d', kind: 'compute', wide: [890, 0], tall: [70, 105], tip: 'Continuously checks the NFR in production; a fitness function checks it in CI (load test, bundle size).' },
      { id: 'user', label: 'Users', sub: 'mobile, 4G', kind: 'client', wide: [90, 110], tall: [70, 210], tip: 'Real users. Measure what they experience (LCP, RUM), not only what servers see.' },
      { id: 'cdn', label: 'Edge cache / CDN', sub: 'tactic: cache', kind: 'cache', wide: [290, 110], tall: [210, 210], tip: 'The tactic chosen for the NFR: serve the feed shell and assets close to the user.' },
      { id: 'api', label: 'Feed API', sub: 'budget 60 ms', kind: 'service', wide: [490, 110], tall: [350, 210], tip: 'Each tier gets a slice of the end-to-end budget and an owner.' },
      { id: 'db', label: 'Feed store', sub: 'budget 30 ms', kind: 'store', wide: [690, 110], tall: [210, 315], tip: 'Store reads within its slice; slow queries show up against the budget, not as "the site is slow".' },
      { id: 'pay', label: 'Payment PSP', sub: 'checkout journey', kind: 'external', wide: [890, 110], tall: [350, 315], tip: 'A conversion KR maps to checkout availability: multi-AZ plus idempotent payment calls.' },
      { id: 'rum', label: 'RUM + metrics', sub: 'p95 per journey', kind: 'store', wide: [290, 220], tall: [70, 315], tip: 'Real-user monitoring plus server histograms with SLO buckets feed both the SLO and the KR dashboard.' },
      { id: 'cost', label: 'Cost per order', sub: 'unit-cost KR', kind: 'compute', wide: [690, 220], tall: [210, 420], tip: 'Cloud bill allocated by tag ÷ orders. A cost KR is unit economics, not the total bill.' },
      { id: 'review', label: 'KR review', sub: 'monthly', kind: 'team', wide: [490, 220], tall: [70, 420], tip: 'Puts the KR trend next to NFRs, SLOs and experiment results, and decides whether the hypothesis holds.' }
    ],
    edges: [
      { from: 'obj', to: 'kr' },
      { from: 'kr', to: 'journey' },
      { from: 'journey', to: 'nfr' },
      { from: 'nfr', to: 'slo' },
      { from: 'user', to: 'cdn' },
      { from: 'cdn', to: 'api' },
      { from: 'api', to: 'db' },
      { from: 'api', to: 'pay', bend: -0.25 },
      { from: 'user', to: 'rum' },
      { from: 'api', to: 'rum' },
      { from: 'rum', to: 'review' },
      { from: 'db', to: 'cost' },
      { from: 'cost', to: 'review' },
      { from: 'nfr', to: 'cdn', dashed: true, label: 'tactic' },
      { from: 'review', to: 'kr', dashed: true, bend: 0.3 }
    ]
  },

  scenarios: [
    {
      id: 'trace', title: 'Retention → p95 < 200 ms → edge cache', tone: 'info',
      steps: [
        { text: 'Objective: <b>"customers come back more often"</b>. Key result: 7-day return rate from 38% to 42%. That is an outcome, so it needs a hypothesis about <i>why</i> people do not return.', flow: ['obj>kr'], badges: { kr: '38% → 42%' } },
        { text: 'Data shows users who wait more than ~1 s for the feed return less often. The journey "open app → see feed" becomes the target. The NFR: <b>95% of feed loads &lt; 200 ms</b> on 4G at peak.', flow: ['kr>journey', 'journey>nfr'], badges: { nfr: 'p95 < 200 ms' } },
        { text: 'Tactic: <b>cache the feed shell and assets at the edge</b>. A hit skips three tiers; only misses pay the full path.', flow: ['nfr>cdn', 'user>cdn'], ok: ['cdn'], badges: { cdn: ['hit 40 ms', 'ok'] } },
        { text: 'An <b>SLO</b> watches the NFR from real users, and a monthly review checks the KR. If p95 drops but returns do not rise, the hypothesis was wrong: change the bet, not the dashboard.', flow: ['user>rum', 'rum>review', 'review>kr'], nodes: ['slo'], ok: ['slo'], tone: 'ok' }
      ]
    },
    {
      id: 'budget', title: 'Splitting the latency budget across tiers', tone: 'info',
      steps: [
        { text: 'End-to-end target 200 ms. The network is not free: on 4G one round trip can cost <b>tens of milliseconds</b>, and the miss path has several.', flow: ['user>cdn', 'cdn>api', 'api>db'], badges: { cdn: 'edge 40', api: 'app 60', db: 'db 30' } },
        { text: 'Budget table: edge 40 ms, network 50 ms, app 60 ms, DB 30 ms, slack 20 ms = 200 ms. Each tier has an <b>owner</b> and its own p95 dashboard.', nodes: ['cdn', 'api', 'db'], labels: { api: { label: 'Feed API', sub: '60 ms · team Feed' }, db: { label: 'Feed store', sub: '30 ms · team Data' } } },
        { text: 'Careful: p95s do not add. The sum of per-tier p95s is a <b>pessimistic</b> bound; the real end-to-end p95 is lower unless tiers are slow together. Measure end to end; use tier budgets to find who is over.', nodes: ['rum'], badges: { rum: 'measure e2e' } },
        { text: 'A new feature adds a call to a recommendations service (+45 ms). It does not fit. The budget makes the trade-off explicit: <b>parallelise it, cache it, or drop it</b>.', flow: ['cdn>api', 'api>db'], warn: ['api'], badges: { api: ['+45 ms', 'warn'] }, tone: 'warn' }
      ]
    },
    {
      id: 'conversion', title: 'Conversion KR → checkout 99.95% → multi-AZ + idempotency', tone: 'info',
      steps: [
        { text: 'Objective: grow online revenue. KR: <b>checkout conversion 3.1% → 3.4%</b>. Funnel analysis shows failed payments and timeouts at the last step.', flow: ['obj>kr', 'kr>journey'], labels: { journey: { label: 'User journey', sub: 'pay for basket' } } },
        { text: 'NFR: <b>checkout availability 99.95%</b> over 28 days, and a double charge rate of zero.', flow: ['journey>nfr'], labels: { nfr: { label: 'NFR scenario', sub: 'checkout 99.95%' }, slo: { label: 'SLO', sub: '99.95% · 28 d' } } },
        { text: 'Tactics: run the checkout API <b>multi-AZ</b>; make payment calls <b>idempotent</b> (idempotency key per order) so a retry after a timeout never charges twice.', flow: ['api>pay'], ok: ['api'], badges: { api: ['multi-AZ', 'ok'], pay: ['Idempotency-Key', 'ok'] } },
        { text: 'The SLO now guards the KR: a checkout outage burns budget and also shows up as lost conversion in the review.', flow: ['api>rum', 'rum>review'], nodes: ['slo'], ok: ['slo'], tone: 'ok' }
      ]
    },
    {
      id: 'goodhart', title: 'Goodhart: the proxy improves, the goal does not', tone: 'err',
      steps: [
        { text: 'The team is rewarded for <b>server p95 &lt; 200 ms</b>. They move slow work to the client, where the server timer does not see it.', flow: ['cdn>api', 'api>db'], ok: ['api'], badges: { api: ['p95 120 ms ✓', 'ok'] } },
        { text: 'Users now wait for a spinner while JavaScript fetches the real data. The page <b>looks</b> fast on the dashboard and <b>feels</b> slower.', flow: ['user>cdn'], err: ['user'], badges: { user: ['LCP 2.8 s', 'err'] }, tone: 'err' },
        { text: 'The KR review shows the 7-day return rate <b>fell</b>. "When a measure becomes a target, it ceases to be a good measure" (Strathern\'s 1997 phrasing of Goodhart).', flow: ['rum>review', 'review>kr'], err: ['kr'], badges: { kr: ['38% → 37%', 'err'] } },
        { text: 'Fix: measure the NFR <b>as users feel it</b> (RUM LCP), pair it with a guard metric, and keep the KR itself as the final judge.', nodes: ['rum', 'slo'], ok: ['rum', 'slo'], tone: 'ok' }
      ]
    },
    {
      id: 'cost', title: 'At scale: a cost KR as cost per order', tone: 'warn',
      steps: [
        { text: 'Objective: profitable growth. KR: <b>cloud cost per order from $0.12 to $0.09</b> while orders grow 40%. The total bill may still rise, and that is fine.', flow: ['obj>kr'], labels: { kr: { label: 'Key result', sub: '$/order 0.12→0.09' } } },
        { text: 'Tag every resource by service; divide the allocated bill by orders. The <b>feed store</b> turns out to be the biggest cost per order.', flow: ['db>cost'], warn: ['db'], badges: { cost: ['$0.12/order', 'warn'] }, tone: 'warn' },
        { text: 'Tactics: the edge cache absorbs reads (fewer DB replicas), rightsize instances, move batch work to cheaper capacity. Check each against the latency NFR, so cost cuts do not break retention.', flow: ['user>cdn', 'cdn>api'], ok: ['cdn'], badges: { cdn: ['hit 92%', 'ok'] } },
        { text: 'The review tracks both: cost per order down to $0.095, p95 unchanged. One KR, one guard metric.', flow: ['cost>review', 'rum>review'], ok: ['review'], badges: { review: ['$0.095 · p95 ok', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick an objective, a tactic and how you will measure it. Meters are <em>illustrative</em> scores based on how directly the tactic moves the NFR behind that objective, what it typically costs, and how trustworthy the measurement is.',
    diagram: null,
    controls: [
      { id: 'obj', label: 'Objective', type: 'seg', value: 'retention', options: [
        { v: 'retention', l: 'Retention', hint: 'KR: 7-day return rate' },
        { v: 'revenue', l: 'Revenue / conversion', hint: 'KR: checkout conversion' },
        { v: 'cost', l: 'Cost to serve', hint: 'KR: cost per order' },
        { v: 'compliance', l: 'Compliance', hint: 'KR: audit findings, time to evidence' }] },
      { id: 'tactic', label: 'Architecture tactic', type: 'seg', value: 'cache', options: [
        { v: 'cache', l: 'Edge caching / CDN', hint: 'latency' },
        { v: 'redundancy', l: 'Multi-AZ + idempotent retries', hint: 'availability' },
        { v: 'efficiency', l: 'Rightsize + autoscale', hint: 'cost' },
        { v: 'controls', l: 'Audit log + encryption', hint: 'security / compliance' },
        { v: 'rewrite', l: 'Big re-platform', hint: 'everything, eventually' }] },
      { id: 'measure', label: 'How you measure success', type: 'seg', value: 'slo', options: [
        { v: 'output', l: 'Output: "shipped"', hint: 'task done' },
        { v: 'server', l: 'Server metric', hint: 'server p95 / uptime' },
        { v: 'slo', l: 'User-facing SLO', hint: 'RUM / journey SLO' },
        { v: 'experiment', l: 'SLO + A/B test', hint: 'proves NFR → KR' }] }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      // how directly each tactic moves the NFR behind each objective (illustrative)
      const fit = {
        retention: { cache: 0.9, redundancy: 0.45, efficiency: 0.15, controls: 0.05, rewrite: 0.4 },
        revenue: { cache: 0.6, redundancy: 0.9, efficiency: 0.1, controls: 0.1, rewrite: 0.4 },
        cost: { cache: 0.55, redundancy: 0.05, efficiency: 0.9, controls: 0.05, rewrite: 0.35 },
        compliance: { cache: 0.05, redundancy: 0.2, efficiency: 0.05, controls: 0.9, rewrite: 0.35 }
      }[s.obj][s.tactic];
      const costT = { cache: 0.35, redundancy: 0.6, efficiency: -0.2, controls: 0.3, rewrite: 0.95 }[s.tactic];
      const weeks = { cache: 4, redundancy: 8, efficiency: 4, controls: 6, rewrite: 40 }[s.tactic] + { output: 0, server: 1, slo: 2, experiment: 4 }[s.measure];
      const meas = { output: 0.1, server: 0.45, slo: 0.75, experiment: 0.95 }[s.measure];
      const conf = { output: 0.2, server: 0.5, slo: 0.75, experiment: 1 }[s.measure];
      const impact = clamp(fit * (0.55 + 0.45 * conf));
      const goodhart = s.measure === 'output' ? 0.9 : s.measure === 'server' ? 0.6 : s.measure === 'slo' ? 0.3 : 0.15;
      const nfr = { retention: 'p95 feed load < 200 ms', revenue: 'checkout availability 99.95%', cost: 'cost per order ≤ $0.09', compliance: '100% admin actions audited' }[s.obj];
      const kr = { retention: '7-day return 38→42%', revenue: 'conversion 3.1→3.4%', cost: '$/order 0.12→0.09', compliance: '0 major audit findings' }[s.obj];
      const tLabel = { cache: ['Edge cache / CDN', 'tactic: cache'], redundancy: ['Multi-AZ + idemp.', 'tactic: redundancy'], efficiency: ['Rightsize + HPA', 'tactic: efficiency'], controls: ['Audit + KMS', 'tactic: controls'], rewrite: ['Re-platform', '12+ months'] }[s.tactic];
      const sloSub = { output: 'none: "done"', server: 'server metric', slo: 'journey SLO', experiment: 'SLO + A/B' }[s.measure];

      const metrics = [
        { k: 'KR impact', v: impact >= 0.75 ? 'strong, direct' : impact >= 0.45 ? 'partial / indirect' : 'weak: wrong lever', s: impact },
        { k: 'Run + build cost', v: costT < 0 ? 'saves money' : costT < 0.4 ? 'low' : costT < 0.7 ? 'medium (2× capacity)' : 'high', s: clamp(1 - costT) },
        { k: 'Time to first evidence', v: '≈ ' + weeks + ' weeks', s: clamp(1 - weeks / 44) },
        { k: 'Measurability', v: meas >= 0.9 ? 'causal evidence' : meas >= 0.7 ? 'user-facing number' : meas >= 0.4 ? 'proxy only' : 'none: done ≠ worked', s: meas },
        { k: 'Goodhart risk', v: goodhart >= 0.8 ? 'high: grading activity' : goodhart >= 0.5 ? 'medium: proxy can be gamed' : 'low', s: 1 - goodhart },
        { k: 'Traceability', v: fit >= 0.75 ? 'KR → NFR → tactic is clear' : fit >= 0.4 ? 'needs a stated hypothesis' : 'no plausible link', s: clamp(fit * 0.7 + meas * 0.3) }
      ];

      const notes = ['Chain: <b>' + kr + '</b> → NFR <b>' + nfr + '</b> → ' + tLabel[0] + ' → ' + sloSub + '.'];
      if (fit < 0.3) notes.push('This tactic does not plausibly move the NFR behind this objective. It may still be worth doing, but fund it under its own goal.');
      if (s.tactic === 'rewrite') notes.push('A re-platform touches every attribute a little and none soon. Executives hear "a year with no KR movement"; slice it into strangler steps that each move one NFR.');
      if (s.measure === 'output') notes.push('"Shipped" is an output. The KR can be graded green while users notice nothing.');
      if (s.measure === 'server') notes.push('Server-side p95 misses DNS, TLS, network and client rendering. Users can get slower while the server number improves.');
      if (s.measure === 'experiment') notes.push('A holdout or slowdown experiment shows whether the NFR change <b>causes</b> the KR change; worth it for big bets.');
      if (s.obj === 'cost' && s.tactic === 'cache') notes.push('Caching cuts origin load and egress from the origin, so it helps cost per order too: one tactic serving two KRs.');

      let verdict;
      if (fit < 0.3) verdict = '❌ <b>Wrong lever.</b> No credible path from this tactic to this key result.';
      else if (s.measure === 'output') verdict = '⚠ <b>Right idea, unmeasured.</b> Without an NFR measurement you cannot tell whether it moved the KR.';
      else if (s.tactic === 'rewrite') verdict = '⚠ <b>Too slow to show impact this quarter.</b> Break it into tactics that each move one NFR.';
      else if (fit >= 0.75 && s.measure === 'experiment') verdict = '✅ <b>Full chain:</b> direct tactic, user-facing SLO and causal evidence that it moves the KR.';
      else if (fit >= 0.75) verdict = '👍 <b>Good trace.</b> Add an experiment for large investments to prove the NFR really moves the KR.';
      else verdict = '👍 <b>Plausible but indirect.</b> Write the hypothesis down and look for a more direct tactic.';

      return {
        metrics, verdict, notes,
        labels: { kr: { label: 'Key result', sub: kr }, nfr: { label: 'NFR scenario', sub: nfr.length > 24 ? nfr.slice(0, 23) + '…' : nfr }, cdn: { label: tLabel[0], sub: tLabel[1] }, slo: { label: 'Measurement', sub: sloSub } },
        warn: (s.measure === 'output' || s.measure === 'server' ? ['slo'] : []).concat(s.tactic === 'rewrite' ? ['cdn'] : []),
        err: fit < 0.3 ? ['cdn'] : [],
        ok: fit >= 0.75 && s.measure !== 'output' ? ['cdn', 'slo'] : [],
        badges: { kr: [impact >= 0.75 ? 'moves' : impact >= 0.45 ? 'maybe' : 'flat', impact >= 0.75 ? 'ok' : impact >= 0.45 ? 'warn' : 'err'] },
        flow: ['obj>kr', 'kr>journey', 'journey>nfr', 'nfr>cdn', 'user>cdn', 'cdn>api'].concat(s.measure === 'output' ? [] : ['user>rum', 'rum>review', 'review>kr'])
      };
    }
  },

  widget: {
    title: 'Trace an OKR, then fit the latency budget',
    caption: 'Pick an OKR and watch the chain light up from objective to SLO. Below, the <b>latency budget waterfall</b> samples 2,000 real requests through your tiers (with jitter): add or remove tiers, change per-tier time and the <b>cache hit ratio</b>, and see whether the measured <b>p95</b> fits under the target. Watch the mean: it often looks fine while p95 fails.'
  },

  realWorld: {
    intro: 'OKRs come from Intel and Google; the evidence that speed moves business numbers comes from controlled studies and A/B tests. Figures are quoted from the sources and belong to their context (sector, year, device).',
    timeline: [
      { when: '1970s', who: 'Intel (Andy Grove)', title: 'OKRs are born', text: 'Grove adapted management by objectives into Objectives and Key Results at Intel; John Doerr learned them there and calls Grove the father of OKRs. Grove described the method in <i>High Output Management</i> (1983).', src: 0 },
      { when: '1999', who: 'Google', title: 'Doerr brings OKRs to Google', text: 'Doerr presented OKRs to Google\'s founders in 1999; the company has used them since. Google\'s guide sets aspirational OKRs so that achieving about <b>70%</b> is success, while committed OKRs are expected to be met in full.', src: 1 },
      { when: '2012', who: 'Gojko Adzic', title: 'Impact Mapping', text: 'The book introduces a map with four levels, <b>Why, Who, How, What</b>, so deliverables (including architecture work) are always connected to a business goal through a behaviour change. Adzic stresses that "What" is the least important level.', src: 2 },
      { when: '2017', who: 'Akamai', title: 'Retail performance report', text: 'Akamai\'s spring 2017 study of about 10 billion retail visits reported that a <b>100 ms delay</b> could hurt conversion rates by up to 7% (the mobile figure), and that a 2-second delay raised bounce rates by 103%.', src: 3 },
      { when: '2018', who: 'John Doerr', title: '<i>Measure What Matters</i>', text: 'Doerr\'s book popularises OKRs beyond Silicon Valley, with stories from Intel, Google and others, and separates committed from aspirational goals.', src: 4 },
      { when: '2020', who: 'Deloitte for Google', title: '"Milliseconds Make Millions"', text: 'Study of 37 brands and about 30 million sessions: a <b>0.1 s</b> mobile speed improvement was associated with conversion up 8.4% in retail and 10.1% in travel, and retail spend up 9.2%.', src: 5 },
      { when: '2021', who: 'Vodafone (web.dev)', title: 'A/B test on LCP', text: 'An optimised landing page with <b>31% better LCP</b> produced <b>8% more sales</b> than the control in a controlled A/B test, using field LCP measured from real users.', src: 6 },
      { when: '2021', who: 'Rakuten 24 (web.dev)', title: 'Core Web Vitals investment', text: 'An A/B test reported revenue per visitor up 53.37% and conversion rate up 33.13% for the version optimised for Core Web Vitals.', src: 7 },
      { when: '2017 / 2022', who: 'Ford, Parsons, Kua', title: 'Fitness functions', text: '<i>Building Evolutionary Architectures</i> defines an architectural fitness function as an objective integrity check of architectural characteristics: the automated end of the traceability chain.', src: 8 },
      { when: '1975 / 1997', who: 'Goodhart · Strathern', title: 'When a measure becomes a target', text: 'Goodhart\'s 1975 point about monetary statistics was generalised by anthropologist Marilyn Strathern in 1997: "When a measure becomes a target, it ceases to be a good measure."', src: 9 }
    ],
    lessons: [
      'Write KRs as <b>outcomes</b> and treat architecture work as a <b>hypothesis</b> about how to move them.',
      'Make the NFR a <b>quality scenario</b> with a percentile and a population (mobile, peak), measured from real users.',
      'Split latency targets into <b>owned per-tier budgets</b>, but judge success end to end.',
      'Prefer <b>experiments</b> (A/B, holdouts) over correlations when the investment is large.',
      'Pair every proxy metric with a <b>guard metric</b> and keep the KR as the final judge (Goodhart).'
    ],
    sources: [
      { title: 'The OKR Origin Story', url: 'https://www.whatmatters.com/stories/the-origin-story', pub: 'What Matters (John Doerr)' },
      { title: 'Set goals with OKRs', url: 'https://rework.withgoogle.com/en/guides/set-goals-with-okrs', pub: 'Google re:Work' },
      { title: 'Impact Mapping', url: 'https://gojko.net/books/impact-mapping', pub: 'Gojko Adzic, 2012' },
      { title: 'Akamai releases Spring 2017 State of Online Retail Performance report', url: 'https://www.akamai.com/fr/newsroom/press-release/akamai-releases-spring-2017-state-of-online-retail-performance-report', pub: 'Akamai press release, 2017' },
      { title: 'Measure What Matters', url: 'https://penguinrandomhouse.com/books/546304/measure-what-matters-by-john-doerr-foreword-by-larry-page', pub: 'Penguin Random House, 2018 (Portfolio)' },
      { title: 'Milliseconds make millions', url: 'https://web.dev/case-studies/milliseconds-make-millions', pub: 'web.dev case study (Deloitte / Google, 2020)' },
      { title: 'Vodafone: A 31% improvement in LCP increased sales by 8%', url: 'https://web.dev/case-studies/vodafone', pub: 'web.dev, 2021' },
      { title: 'How Rakuten 24\'s investment in Core Web Vitals increased revenue per visitor by 53.37% and conversion rate by 33.13%', url: 'https://web.dev/case-studies/rakuten', pub: 'web.dev' },
      { title: 'Building Evolutionary Architectures, Chapter 2: Fitness Functions', url: 'https://oreilly.com/library/view/building-evolutionary-architectures/9781492097532/ch02.html', pub: 'O\'Reilly, 2nd ed.' },
      { title: 'Goodhart\'s law', url: 'https://en.wikipedia.org/wiki/Goodhart%27s_law', pub: 'Wikipedia (cites Strathern 1997, European Review 5(3))' },
      { title: 'Milliseconds Make Millions (full report PDF)', url: 'https://www2.deloitte.com/content/dam/Deloitte/ie/Documents/Consulting/Milliseconds_Make_Millions_report.pdf', pub: 'Deloitte, 2020' },
      { title: 'The business impact of Core Web Vitals', url: 'https://web.dev/case-studies/vitals-business-impact', pub: 'web.dev' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['KR type', '<b>Outcome</b> (return rate, conversion): what the business wants', '<b>Output</b> (ship cache by Q3): easy to grade', 'Outcomes for KRs; outputs belong in the plan underneath them'],
      ['Latency metric', '<b>Server p95</b>: cheap, precise, per tier', '<b>RUM p75/p95 (LCP, INP)</b>: what users feel, noisier', 'RUM for the NFR and SLO; server metrics for per-tier budgets and debugging'],
      ['Budget split', '<b>Even split</b> per tier: simple', '<b>Weighted by physics</b>: network first, then what each tier really needs', 'Weighted, with explicit slack; revisit when a tier changes'],
      ['Evidence', '<b>Correlation</b> from dashboards', '<b>Experiment</b> (A/B, holdout, deliberate slowdown)', 'Experiments for large bets or when the KR has many drivers'],
      ['Commitment', '<b>Committed KR</b>: must hit 100%', '<b>Aspirational KR</b>: ≈ 70% is success', 'Committed for SLOs and compliance; aspirational for growth bets'],
      ['Cost KR', '<b>Total cloud bill</b>', '<b>Unit cost</b> (per order, per user)', 'Unit cost almost always: growth should not look like failure']
    ]
  },
  failures: [
    { f: 'Output KRs ("launch X")', detect: 'All KRs green, business numbers flat; KRs read like a task list', fix: 'Rewrite each KR as a behaviour or business change; move tasks into the plan under it.' },
    { f: 'Unmeasurable NFRs ("fast", "scalable")', detect: 'No percentile, population or window; arguments about whether it is met', fix: 'Write a quality attribute scenario with a response measure; add an SLO or fitness function.' },
    { f: 'Averages instead of percentiles', detect: 'Mean latency fine, support tickets about slowness; bimodal latency (cache hit vs miss)', fix: 'Set p95/p99 targets from RUM; look at the histogram, not the mean.' },
    { f: 'Budget with no owners', detect: 'End-to-end target missed; every team\'s own dashboard is green', fix: 'Per-tier budget table with owners; alert a tier when it exceeds its slice.' },
    { f: 'Goodhart: gaming the proxy', detect: 'Proxy improves, KR flat or worse; work shifted to unmeasured places', fix: 'Measure as close to the user as possible, add guard metrics, judge by the KR.' },
    { f: 'Speed past the point of value', detect: 'Further latency cuts show no KR movement in experiments', fix: 'Stop: the NFR is met. Move investment to the next limiting attribute.' },
    { f: 'Borrowed numbers as promises', detect: 'Business case quotes "+7% per 100 ms" as a forecast for your product', fix: 'Treat industry studies as motivation; size your own effect with a slowdown or speed-up experiment.' }
  ],

  interview: [
    { q: 'What is an OKR, and what makes a good key result?', a: '<p>An <b>Objective</b> is a qualitative goal; <b>Key Results</b> are 2–5 measurable results that show it was reached. The method comes from Andy Grove at Intel; John Doerr brought it to Google in 1999 and described it in <i>Measure What Matters</i> (2018).</p><p>A good KR is an <b>outcome</b> with a baseline, target, date and data source ("7-day return 38% → 42%"), not an output ("ship the CDN"). Google distinguishes <b>committed</b> KRs (expected 100%) from <b>aspirational</b> ones (≈ 70% is success).</p>', lvl: 'core' },
    { q: 'Walk me from "increase retention" to an architecture decision.', a: '<ol><li><b>KR</b>: 7-day return rate 38 → 42%.</li><li><b>Hypothesis / journey</b>: users who wait for the feed return less; journey "open app → feed".</li><li><b>NFR scenario</b>: on 4G at peak, 95% of feed loads (RUM LCP) &lt; 200 ms.</li><li><b>Budget</b>: edge 40, network 50, app 60, DB 30, slack 20 ms.</li><li><b>Tactic</b>: edge caching of shell and assets, plus precomputed feeds; ADR records the expected effect.</li><li><b>SLO / fitness function</b>: journey SLO from RUM; CI load test and bundle-size check.</li><li><b>Proof</b>: holdout or slowdown A/B to see if latency moves returns.</li></ol>', lvl: 'core' },
    { q: 'What is the difference between an outcome and an output, and why does it matter for architects?', a: '<p>An output is something produced (a service, a migration). An outcome is a change in behaviour or a business number. Architecture work is almost always an output, so it needs an explicit link to an outcome or it is first to be cut. Framing it as "this tactic moves this NFR, which drives this KR" makes it fundable and falsifiable.</p>', lvl: 'core' },
    { q: 'You have a 200 ms p95 target and four tiers. How do you set the latency budget?', a: '<p>Start with physics: count network round trips (on the miss path every hop costs an RTT, plus TLS on new connections). Give each tier a slice based on what it needs, keep <b>10–20% slack</b> (rule of thumb), and assign an owner per tier.</p><p>Remember percentiles do not add: summing per-tier p95s is a pessimistic bound. Judge the target end to end from RUM; use tier budgets to find who is over. If the miss path cannot fit, change the shape: cache, parallelise calls, move compute to the edge, or remove a hop.</p>', fu: 'With a cache, what hit ratio do you need? (If misses exceed the target and hits fit, at least 95% hits for a p95.)', lvl: 'deep' },
    { q: 'Why does a 95% cache hit ratio matter specifically for a p95 target?', a: '<p>With bimodal latency (fast hits, slow misses), p95 is the latency of the 95th percentile request. If more than 5% of requests miss, the 95th percentile request is a miss, so p95 equals the miss latency, however good the mean looks. So either the miss path fits under the target, or misses must be ≤ 5% (≤ 1% for p99).</p>', lvl: 'deep' },
    { q: 'A conversion KR: which NFRs and tactics would you propose for checkout?', a: '<ul><li><b>Availability</b>: checkout SLO 99.95% over 28 days, measured at the load balancer and from the client.</li><li><b>Correctness</b>: zero double charges: <b>idempotency keys</b> on payment calls so retries are safe.</li><li><b>Tactics</b>: multi-AZ deployment, timeouts with retries and a circuit breaker toward the payment provider, async capture where the business allows.</li><li><b>Latency</b>: p95 for "pay" step; a slow checkout also loses sales.</li></ul><p>Tie the SLO to the KR in the review: lost conversion during incidents makes the budget real to product.</p>', lvl: 'core' },
    { q: 'How do you turn a cost objective into something architecture can act on?', a: '<p>Use <b>unit economics</b>: cost per order or per active user, from a tagged, allocated bill. A total-bill KR punishes growth. Then find the biggest contributors per unit (often storage, egress, idle capacity) and choose tactics: caching, rightsizing, autoscaling, cheaper capacity for batch. Pair it with a latency or availability <b>guard metric</b> so cost cuts do not hurt the other KRs. See <a href="finops.html">FinOps</a>.</p>', lvl: 'core' },
    { q: 'What is Goodhart\'s law, and how do you protect OKR-driven NFRs from it?', a: '<p>Charles Goodhart (1975) observed that statistical regularities collapse once used for control; Marilyn Strathern (1997) gave the popular phrasing: "When a measure becomes a target, it ceases to be a good measure."</p><p>Protection: measure close to the user (RUM over server timers), pair each target with a guard metric, review exclusions, keep the KR as the final judge, and do not tie individual pay to a single proxy.</p>', lvl: 'core' },
    { q: 'An executive quotes "every 100 ms costs 1% of sales". How do you respond?', a: '<p>That line is widely repeated but its origin is hard to trace to a primary source. Point to sourced studies instead: Akamai 2017 (up to 7% conversion per 100 ms on mobile), Deloitte for Google 2020 (0.1 s → +8.4% retail conversion), Vodafone\'s A/B test (31% better LCP → 8% more sales). Then say the honest part: <b>our</b> effect size is unknown; run a small slowdown or speed-up experiment before promising a revenue number.</p>', lvl: 'deep' },
    { q: 'What is impact mapping and where does architecture appear on the map?', a: '<p>Gojko Adzic\'s technique (2012) draws four levels: <b>Why</b> (goal), <b>Who</b> (actors), <b>How</b> (behaviour changes), <b>What</b> (deliverables). Architecture work is a "What" under a specific "How": e.g. Why = retention, Who = mobile commuters, How = open the app more often, What = edge-cached feed. Each path is a testable assumption, so you can drop deliverables whose impact does not show up.</p>', lvl: 'core' },
    { q: 'Behavioural: tell me about getting funding for an architecture investment by tying it to a business goal.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: our product page p95 on mobile was 2.4 s; a CDN and image pipeline project had been rejected twice as "tech wish list".</p><p><b>Task</b>: reframe it against the company KR "mobile conversion 2.1% → 2.4%".</p><p><b>Action</b>: I segmented RUM data by load time and showed conversion falling in slower buckets, then ran a two-week 10% holdout with 300 ms injected delay to measure our own effect. I wrote an ADR with the latency budget per tier and an SLO ("95% of product page LCP &lt; 1.5 s").</p><p><b>Result</b>: the holdout showed a measurable conversion drop, the project was funded the next quarter, p95 fell to 1.3 s, and the conversion KR reached 2.3%: the review credited part of it to speed.</p>', lvl: 'deep' },
    { q: 'Behavioural: describe a time a metric you were targeting was gamed or misleading.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: teams were measured on server p95 &lt; 150 ms; dashboards were green but app-store reviews complained about slowness.</p><p><b>Task</b>: find out why and fix the incentive without blaming teams.</p><p><b>Action</b>: I compared server timings with RUM and found work had moved to client-side fetches after first paint. I proposed changing the SLO to RUM LCP per journey, with server p95 kept as a per-tier budget, and added a guard metric (session length).</p><p><b>Result</b>: the honest number looked worse at first, but it pointed at two waterfalled API calls; merging them cut LCP by 35% and complaints fell.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'okr-trace.yaml: KR → NFR → tactic → SLO (reviewed in Git)',
      lang: 'yaml',
      code: `objective: "Customers come back more often"
quarter: 2026-Q1
key_results:
  - id: KR-RET-1
    metric: seven_day_return_rate
    baseline: 0.38
    target: 0.42
    kind: aspirational          # ~70% achievement counts as success
    journeys:
      - id: open-feed
        nfr:
          id: NFR-FEED-LATENCY
          scenario:
            source: returning user on 4G
            stimulus: opens the app
            environment: peak traffic
            response: feed is visible
            measure: "p95 LCP < 200 ms (RUM), 28-day window"
          latency_budget_ms: { edge: 40, network: 50, app: 60, db: 30, slack: 20 }
          tactics: [edge-cache-feed-shell, precomputed-feed]
          adr: ADR-042
          slo:
            id: SLO-FEED-LCP
            sli: "share of feed loads with LCP < 200 ms"
            objective: 0.95
            window: 28d
          fitness_functions:
            - "k6 load test: p95 < 120 ms at origin, 2x peak"
            - "bundle size < 170 KB gzip"
          guard_metrics: [session_length, crash_free_sessions]`,
      note: 'One file per KR keeps the chain reviewable. A CI check can fail the build if an SLO or ADR id is missing, turning traceability itself into a fitness function.'
    },
    {
      title: 'Spring Boot 3: latency histogram with the KR\'s SLO boundary',
      lang: 'java',
      code: `import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

@Component
public class FeedLatency {

    private final Timer timer;

    public FeedLatency(MeterRegistry registry) {
        this.timer = Timer.builder("feed.render")
            .description("Feed render time; NFR-FEED-LATENCY / KR-RET-1")
            .tag("journey", "open-feed")
            .publishPercentileHistogram()
            // SLO buckets: le="0.06" is the app tier's budget,
            // le="0.2" the end-to-end target
            .serviceLevelObjectives(Duration.ofMillis(60), Duration.ofMillis(200))
            .minimumExpectedValue(Duration.ofMillis(1))
            .maximumExpectedValue(Duration.ofSeconds(5))
            .register(registry);
    }

    public <T> T record(Supplier<T> work) {
        return timer.record(work);
    }
}

// PromQL: share of feed renders within the 60 ms app budget (28 d)
// sum(rate(feed_render_seconds_bucket{le="0.06"}[28d]))
//   / sum(rate(feed_render_seconds_count[28d]))`,
      note: 'For built-in HTTP metrics the same is a property: <code>management.metrics.distribution.slo.http.server.requests=60ms,200ms</code>. Server metrics feed the per-tier budget; the user-facing SLO should come from RUM.'
    },
    {
      title: 'Python: latency budget check with sampled p95',
      lang: 'python',
      code: `import random
from dataclasses import dataclass

@dataclass(frozen=True)
class Tier:
    name: str
    rtt_ms: float      # network round trip to reach this tier
    server_ms: float   # median server time in this tier
    jitter: float = 0.35  # lognormal sigma

def sample_request(tiers: list[Tier], edge_hit_ms: float, hit_ratio: float) -> float:
    if random.random() < hit_ratio:
        return edge_hit_ms * random.lognormvariate(0, 0.2)
    return sum((t.rtt_ms + t.server_ms) * random.lognormvariate(0, t.jitter)
               for t in tiers)

def p(values: list[float], q: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, int(q * len(s)))]

def check(tiers: list[Tier], target_ms: float, edge_hit_ms: float,
          hit_ratio: float, n: int = 20_000) -> None:
    lat = [sample_request(tiers, edge_hit_ms, hit_ratio) for _ in range(n)]
    p95, mean = p(lat, 0.95), sum(lat) / n
    print(f"mean {mean:.0f} ms, p95 {p95:.0f} ms, target {target_ms} ms ->",
          "OK" if p95 <= target_ms else f"over by {p95 - target_ms:.0f} ms")
    for t in tiers:
        print(f"  {t.name:<8} budget share {(t.rtt_ms + t.server_ms) / target_ms:.0%}")

if __name__ == "__main__":
    random.seed(7)
    path = [Tier("edge", 20, 5), Tier("gateway", 5, 10),
            Tier("app", 5, 110), Tier("db", 2, 25)]
    for h in (0.80, 0.95, 0.98):
        check(path, target_ms=200, edge_hit_ms=40, hit_ratio=h)`,
      note: 'Sampling (instead of adding p95s) shows the real end-to-end percentile, and why the hit ratio must clear 95% before a p95 target benefits from caching.'
    }
  ],

  related: ['quality-attributes', 'slo-error-budgets', 'finops', 'stakeholder-communication', 'socio-technical-laws', 'sd:cdn']
});
