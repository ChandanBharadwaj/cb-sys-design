SD.register({
  slug: 'deployment-strategies',
  domain: 6,
  title: 'Deployment Strategies & Feature Flags',
  examples: 'Argo Rollouts, LaunchDarkly',
  tagline: 'Ship a new version to <b>a few users first</b>, let metrics decide whether it goes further, and keep <b>deploy</b> (code on servers) separate from <b>release</b> (users see the feature), so a bad change costs minutes and a handful of requests, not a headline.',
  tldr: {
    problem: 'Most outages start with a change. Replacing every server at once means a bad build hits <b>100% of users</b> before anyone looks at a graph, and rolling back takes as long as rolling forward.',
    idea: 'Limit the <b>blast radius</b>: shift traffic in steps (canary), keep the old version warm (blue-green), let an <b>automated analysis</b> compare the new version against the baseline and roll back on its own, and hide unfinished features behind <b>flags</b> so deploying and releasing are separate decisions.',
    insight: 'A canary at 5% that is rolled back automatically after 3 minutes fails about <b>1/20 of the requests</b> a big-bang deploy would, for the same bug. The skill is choosing steps, metrics and thresholds, not the tool.',
    numbers: [
      { v: '25% / 25%', l: 'Kubernetes Deployment defaults for maxSurge and maxUnavailable in a rolling update (Kubernetes API reference)' },
      { v: '> $460M', l: 'Knight Capital loss in about 45 minutes after one of eight servers missed a deploy (SEC order, 2013)' },
      { v: '78 min', l: 'how long CrowdStrike Channel File 291 was live before it was reverted, 19 July 2024 (CrowdStrike RCA)' }
    ]
  },

  intro: {
    what: 'A <b>deployment strategy</b> is the order and pace in which a new version of a service replaces the old one: all at once, a few servers at a time, a second full copy you switch to, or a small slice of traffic that grows while metrics stay healthy. <b>Feature flags</b> are runtime switches in the code that decide who sees a feature, so new code can be on the servers but still turned off.',
    analogy: {
      icon: '🍲',
      title: 'A restaurant changing a recipe',
      text: 'A careless kitchen swaps the recipe for every table on Friday night. A careful one serves the new dish to <b>two tables first</b>, watches their faces, and only then changes the menu. If those two diners wince, the old pot is still on the stove (that is blue-green: two pots, switch which one you serve from). A flag is the waiter being told "only offer the new dish to regulars". The analogy breaks in one place: diners notice a bad dish, but software needs <b>metrics</b> to notice for it.'
    },
    problem: 'A team deploys a new checkout version to all 40 pods with a rolling update. A null-pointer bug only appears for one payment method. Ten minutes later every pod runs the bug, 4% of checkouts fail, and rolling back means another ten-minute rollout. The question this answers is: <b>how do we put new code in front of real users while limiting how many can be hurt, and undo it in seconds?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Replace every server, then hope',
        text: 'CI builds the image and the deploy job replaces all servers. It is simple and fast, and on a good day nobody notices.',
        scene: {
          nodes: [
            { id: 'ci', label: 'CI/CD', sub: 'deploy v2', kind: 'service', at: [70, 0] },
            { id: 'lb', label: 'Load balancer', sub: '100% → v2', kind: 'edge', at: [210, 0] },
            { id: 'users', label: 'Users', sub: 'all of them', kind: 'client', at: [350, 0] },
            { id: 'v2', label: 'v2 pods', sub: '40 / 40', kind: 'service', at: [210, 110] }
          ],
          edges: [{ from: 'ci', to: 'v2' }, { from: 'users', to: 'lb' }, { from: 'lb', to: 'v2' }],
          flow: ['ci>v2', 'users>lb', 'lb>v2']
        }
      },
      {
        stage: 'breaks',
        title: 'A bug reaches everyone at once',
        text: 'The bug ships to <b>every user</b>. Someone notices on a dashboard minutes later. Rollback is another full deploy, so the damage keeps growing while it runs.',
        scene: {
          nodes: [
            { id: 'ci', label: 'CI/CD', sub: 'rollback = redeploy', kind: 'service', at: [70, 0] },
            { id: 'lb', label: 'Load balancer', sub: '100% → v2', kind: 'edge', at: [210, 0] },
            { id: 'users', label: 'Users', sub: '4% checkouts fail', kind: 'client', at: [350, 0] },
            { id: 'v2', label: 'v2 pods', sub: 'NullPointer', kind: 'service', at: [210, 110] }
          ],
          edges: [{ from: 'ci', to: 'v2' }, { from: 'users', to: 'lb' }, { from: 'lb', to: 'v2' }],
          flow: ['users>lb', 'lb>v2', 'ci>v2'],
          err: ['v2', 'users'],
          badges: { v2: ['100% exposed', 'err'], ci: ['10 min back', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Small slice first, metrics decide',
        text: 'Send <b>5%</b> of traffic to v2 while v1 keeps the rest. An analysis job compares v2\'s error rate with v1\'s. It fails, so the controller sets v2\'s weight back to <b>0% in seconds</b>; 95% of users never saw the bug.',
        scene: {
          nodes: [
            { id: 'users', label: 'Users', sub: 'checkout', kind: 'client', at: [70, 0] },
            { id: 'lb', label: 'Traffic split', sub: '95 / 5', kind: 'edge', at: [210, 0] },
            { id: 'v1', label: 'v1 (stable)', sub: '95%', kind: 'service', at: [70, 110] },
            { id: 'v2', label: 'v2 (canary)', sub: '5%', kind: 'service', at: [210, 110] },
            { id: 'an', label: 'Analysis', sub: 'v2 vs v1 errors', kind: 'compute', at: [350, 110] },
            { id: 'ctl', label: 'Controller', sub: 'auto-rollback', kind: 'policy', at: [350, 0] }
          ],
          edges: [{ from: 'users', to: 'lb' }, { from: 'lb', to: 'v1' }, { from: 'lb', to: 'v2' }, { from: 'v2', to: 'an' }, { from: 'an', to: 'ctl' }, { from: 'ctl', to: 'lb' }],
          flow: ['users>lb', ['lb>v1', 'lb>v2'], 'v2>an', 'an>ctl', 'ctl>lb'],
          ok: ['v1', 'ctl'], warn: ['v2'],
          badges: { ctl: ['weight → 0%', 'ok'], v1: ['95% safe', 'ok'] }
        }
      }
    ],
    usedBy: ['Google (canarying, SRE Workbook)', 'Netflix (Spinnaker, Kayenta)', 'Facebook (dark launch of Chat, 2008)', 'Argo Rollouts and Flagger users on Kubernetes', 'LaunchDarkly, Unleash and flagd (feature flags)', 'CrowdStrike (canary rings after July 2024)'],
    whenToUse: [
      'Any user-facing service that deploys often: canary or blue-green with automated rollback',
      'Features that need a dark launch, a gradual ramp or a quick off switch: feature flags',
      'Risky infrastructure or configuration changes that should go out region by region in rings'
    ],
    whenNot: [
      'Tiny internal tools with a maintenance window, where a simple recreate deploy is fine',
      'Breaking database changes: two versions run side by side, so first make the schema compatible with <a href="zero-downtime-migrations.html">Zero-Downtime Migrations</a>',
      'Traffic so low that a 5% slice gives no statistical signal: use longer steps, synthetic load or a staging soak'
    ],
    glossary: [
      { term: 'Blast radius', def: 'The share of users or requests a bad change can hurt before it is stopped.' },
      { term: 'Rolling update', def: 'Replacing instances a few at a time, bounded by maxSurge (extra pods allowed) and maxUnavailable (pods allowed down).' },
      { term: 'Blue-green', def: 'Two full production environments; the router points at one, and a release switches it to the other.' },
      { term: 'Canary', def: 'A new version that gets a small, growing share of real traffic while it is compared with the stable version.' },
      { term: 'Automated canary analysis', def: 'A job that queries metrics for canary and baseline, applies pass/fail thresholds and tells the controller to promote or abort.' },
      { term: 'Dark launch', def: 'Running new code paths on real production traffic without showing the result to users, to test load and correctness.' },
      { term: 'Feature flag', def: 'A runtime switch that decides, per request or user, whether a code path is active; it separates deploy from release.' },
      { term: 'Kill switch', def: 'A long-lived operational flag that turns a feature or dependency off instantly during an incident.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Limit blast radius</b>: no change reaches 100% of users before it has passed a smaller exposure',
      '<b>Decide with metrics, not eyeballs</b>: canary vs baseline on error rate, latency and saturation, with thresholds written down',
      '<b>Rollback is a traffic change</b>, not a rebuild: the previous version stays deployable or still running',
      '<b>Separate deploy from release</b>: code ships dark behind flags; turning it on is a product decision',
      '<b>Every version must coexist</b>: old and new run side by side, so APIs, messages and schemas stay compatible (expand / contract)',
      '<b>Flags have owners and expiry dates</b>; release flags are removed once the feature is at 100%'
    ],
    nonFunctional: [
      'Bad canary detected and rolled back within <b>~2–5 min</b> (analysis interval × failure limit), illustrative target',
      'Rollback to the previous version in <b>&lt; 1 min</b> (weight change or router switch)',
      'Requests affected by a bad build <b>&lt; 5%</b> of what a big-bang deploy would hurt',
      'Deployment frequency on demand, <b>change failure rate</b> and <b>failed deployment recovery time</b> tracked (DORA)',
      'Extra capacity: canary ≈ step % of replicas; blue-green ≈ <b>2×</b> during the switch',
      'Kill switch flips propagate to all instances in seconds, and fall back to a safe default if the flag service is down'
    ],
    outOfScope: [
      '<b>Eyeball canary</b>: someone watches a graph for 10 minutes and clicks promote',
      '<b>Big-bang database change</b> in the same deploy as the code that needs it',
      '<b>Flag debt</b>: hundreds of stale flags nobody owns, and combinations nobody tested',
      '<b>Repurposing an old flag</b> for new behaviour (Knight Capital, 2012)',
      '<b>Global config push</b> that skips the rings code has to go through'
    ]
  },

  calculator: {
    inputs: [
      { id: 'replicas', label: 'Replicas (pods)', min: 2, max: 200, value: 20, log: true },
      { id: 'step', label: 'Canary step size', min: 1, max: 50, value: 5, unit: '%' },
      { id: 'dur', label: 'Pause per step', min: 1, max: 60, value: 10, unit: 'min' },
      { id: 'detect', label: 'Time for analysis to fail a bad canary', min: 1, max: 30, value: 3, unit: 'min' },
      { id: 'err', label: 'Error rate of the bad version', min: 0.001, max: 1, value: 0.05, log: true, fmt: 'pct' },
      { id: 'rps', label: 'Traffic', min: 10, max: 100000, value: 1000, log: true, unit: 'req/s' }
    ],
    outputs: [
      { label: 'Canary steps and total rollout time (healthy build)', f: (v) => { const n = Math.ceil(100 / v.step); return n + ' steps · ' + Math.round((n - 1) * v.dur) + ' min'; } },
      { label: 'Failed requests before auto-rollback (canary)', fmt: 'num', f: (v) => {
        let t = v.detect, pct = v.step, sum = 0;
        while (t > 0) { const d = Math.min(t, v.dur); sum += d * Math.min(100, pct) / 100; t -= d; pct += v.step; }
        return v.rps * v.err * sum * 60;
      } },
      { label: 'Failed requests, same bug with blue-green / big bang (100% switch)', fmt: 'num', f: (v) => v.rps * v.err * v.detect * 60 },
      { label: 'Blast radius reduction from the canary', f: (v) => {
        let t = v.detect, pct = v.step, sum = 0;
        while (t > 0) { const d = Math.min(t, v.dur); sum += d * Math.min(100, pct) / 100; t -= d; pct += v.step; }
        return (v.detect / sum).toFixed(1) + '× fewer failed requests';
      } },
      { label: 'Extra pods needed: canary vs blue-green', f: (v) => '+' + Math.ceil(v.replicas * v.step / 100) + ' vs +' + Math.round(v.replicas) + ' (2×)' },
      { label: 'Rolling update with maxSurge 25%, maxUnavailable 25%', f: (v) => { const r = Math.round(v.replicas), b = Math.ceil(r * 0.25) + Math.floor(r * 0.25); return '≈ ' + Math.ceil(r / Math.max(1, b)) + ' waves of ≤ ' + b + ' pods'; } }
    ],
    note: 'Canary steps grow linearly by the step size (5, 10, 15 … 100%). The bad version fails at the given rate on whatever share it receives until the analysis fails it, then the weight goes to 0% immediately. Blue-green rolls back just as fast but exposes <b>100%</b> during detection. Rolling-update waves are an <em>estimate</em>: maxSurge rounds up and maxUnavailable rounds down, and each wave waits for readiness probes. Real tools let you set uneven steps (5 → 25 → 50 → 100%).'
  },

  api: [
    { m: 'YAML', p: 'Rollout (Argo Rollouts) / Canary (Flagger)', d: 'Replaces the Deployment: <b>steps</b> (setWeight, pause), traffic router (Istio, NGINX, Gateway API, ALB), stable and canary Services, and which analysis runs at which step.' },
    { m: 'YAML', p: 'AnalysisTemplate', d: 'The metrics that decide: Prometheus (or Datadog, CloudWatch…) query, <b>interval</b>, <b>successCondition</b> / failureCondition, <b>failureLimit</b>, and arguments such as the canary service name.' },
    { m: 'POLICY', p: 'Release policy', d: 'Which services need canary vs blue-green, minimum bake time per ring, who may skip a step, freeze rules tied to the <a href="slo-error-budgets.html">error budget</a>, and that config pushes follow the same rings as code.' },
    { m: 'DOC', p: 'Flag registry entry', d: 'Flag key, type (<b>release / experiment / ops / permission</b>), owner, default, targeting rules, creation date and <b>expiry date</b>; a linter fails the build when a release flag is past expiry.' },
    { m: 'ADR', p: 'Rollback vs roll-forward runbook', d: 'When to abort (any failed analysis, any data-corrupting bug), when to fix forward (schema already contracted, rollback would lose data), and who decides during an incident.' },
    { m: 'SQL', p: 'Expand / contract migration plan', d: 'Expand (add nullable column, dual write) ships before the code; contract (drop old column) ships only after no running version reads it.' }
  ],
  dataModel: [
    { name: 'rollout_run', store: 'Kubernetes CRD status → Postgres audit', fields: [['rollout_id', 'uuid', 'pk'], ['service', 'text', 'idx'], ['from_version', 'text'], ['to_version', 'text'], ['current_step', 'int'], ['canary_weight', 'int'], ['phase', 'enum(Progressing, Paused, Degraded, Healthy)'], ['started_at', 'timestamptz']], note: 'Feeds DORA metrics: deployment frequency and lead time from commit to Healthy.' },
    { name: 'analysis_run', store: 'Kubernetes CRD', fields: [['analysis_id', 'uuid', 'pk'], ['rollout_id', 'uuid', 'fk'], ['metric', 'text'], ['measured_at', 'timestamptz'], ['value', 'float8'], ['phase', 'enum(Successful, Failed, Inconclusive, Error)'], ['consecutive_failures', 'int']], note: 'Inconclusive (e.g. no traffic, NaN) should pause, not promote.' },
    { name: 'feature_flag', store: 'Flag service (LaunchDarkly, Unleash, flagd)', fields: [['key', 'text', 'pk'], ['type', 'enum(release, experiment, ops, permission)'], ['owner_team', 'text', 'fk'], ['variants', 'jsonb'], ['targeting', 'jsonb'], ['default_variant', 'text'], ['expires_on', 'date', 'idx']], note: 'Evaluated in-process from a cached ruleset; the code always passes a safe default.' },
    { name: 'deploy_outcome', store: 'Postgres', fields: [['deploy_id', 'uuid', 'pk'], ['service', 'text', 'idx'], ['failed', 'boolean'], ['remediation', 'enum(rollback, roll_forward, flag_off)'], ['recovered_after', 'interval']], note: 'Change failure rate = failed ÷ all deploys; failed deployment recovery time = recovered_after.' }
  ],

  architecture: {
    title: 'Canary with automated analysis and feature flags',
    nodes: [
      { id: 'users', label: 'Users', sub: 'checkout traffic', kind: 'client', wide: [90, 0], tall: [70, 0], tip: 'Real users; a sticky hash (user id) keeps each user on one version during the canary.' },
      { id: 'lb', label: 'Traffic router', sub: 'mesh / ingress weights', kind: 'edge', wide: [290, 0], tall: [210, 0], tip: 'Istio, Linkerd, NGINX or Gateway API: splits by weight, header or cookie. Without one, Argo Rollouts approximates weights with pod counts.' },
      { id: 'stable', label: 'v1 stable', sub: 'ReplicaSet · 95%', kind: 'service', wide: [490, 0], tall: [70, 105], tip: 'Keeps serving most traffic and is the baseline the canary is compared with.' },
      { id: 'db', label: 'Database', sub: 'schema v1 + v2 compatible', kind: 'store', wide: [690, 0], tall: [70, 210], tip: 'Both versions read and write it at the same time, so changes must be expand / contract.' },
      { id: 'ci', label: 'CI / GitOps', sub: 'new image tag', kind: 'service', wide: [90, 110], tall: [350, 0], tip: 'A commit changes the image tag; Argo CD or Flux syncs the Rollout object.' },
      { id: 'ctl', label: 'Rollout controller', sub: 'Argo Rollouts / Flagger', kind: 'policy', wide: [290, 110], tall: [350, 105], tip: 'Walks the steps: set weight, pause, run analysis, promote or abort.' },
      { id: 'canary', label: 'v2 canary', sub: 'ReplicaSet · 5%', kind: 'service', wide: [490, 110], tall: [210, 105], tip: 'The new version, scaled to its share of traffic.' },
      { id: 'flags', label: 'Flag service', sub: 'OpenFeature provider', kind: 'compute', wide: [690, 110], tall: [350, 315], tip: 'Rules evaluated in-process from a cached ruleset. New code paths default to off.' },
      { id: 'prom', label: 'Prometheus', sub: 'canary vs stable', kind: 'store', wide: [490, 220], tall: [210, 210], tip: 'Per-version request counters and latency histograms, labelled by ReplicaSet or service.' },
      { id: 'an', label: 'AnalysisRun', sub: 'errors · p99 · thresholds', kind: 'compute', wide: [290, 220], tall: [350, 210], tip: 'Runs the AnalysisTemplate queries every interval; failureLimit failures abort the rollout.' },
      { id: 'oncall', label: 'On-call', sub: 'notified, not needed', kind: 'person', wide: [90, 220], tall: [70, 315], tip: 'Gets a notification after an automatic abort; investigates without time pressure.' }
    ],
    edges: [
      { from: 'users', to: 'lb' },
      { from: 'lb', to: 'stable' },
      { from: 'lb', to: 'canary' },
      { from: 'stable', to: 'db' },
      { from: 'canary', to: 'db' },
      { from: 'canary', to: 'flags' },
      { from: 'ci', to: 'ctl' },
      { from: 'ctl', to: 'lb' },
      { from: 'ctl', to: 'canary' },
      { from: 'canary', to: 'prom' },
      { from: 'stable', to: 'prom', bend: 0.35 },
      { from: 'prom', to: 'an' },
      { from: 'an', to: 'ctl' },
      { from: 'an', to: 'oncall' }
    ]
  },

  scenarios: [
    {
      id: 'happy', title: 'Healthy canary: 5 → 25 → 50 → 100%', tone: 'ok',
      steps: [
        { text: 'A merge bumps the image tag. GitOps syncs the <b>Rollout</b>; the controller starts a v2 ReplicaSet beside v1.', flow: ['ci>ctl', 'ctl>canary'], badges: { canary: 'v2 starting' } },
        { text: '<b>setWeight: 5</b>. The router sends 5% of requests to v2, keyed by user so nobody flips between versions.', flow: ['ctl>lb', 'users>lb', ['lb>stable', 'lb>canary']], badges: { lb: '95 / 5' } },
        { text: 'Every minute the <b>AnalysisRun</b> asks Prometheus for v2\'s 5xx ratio and p99 latency and compares them with the thresholds.', flow: [['canary>prom', 'stable>prom'], 'prom>an'], badges: { an: ['0.2% · pass', 'ok'] } },
        { text: 'Pass after the pause: weight goes to <b>25%, then 50%</b>, each with another bake period and analysis.', flow: ['an>ctl', 'ctl>lb'], badges: { lb: '50 / 50' } },
        { text: 'At 100% the canary becomes the new <b>stable</b> and v1 scales down. Elapsed: about 30 min, no human involved.', nodes: ['canary', 'stable'], ok: ['canary'], labels: { canary: { label: 'v2 stable', sub: '100%' }, stable: { label: 'v1', sub: 'scaled down' } }, tone: 'ok' }
      ]
    },
    {
      id: 'abort', title: 'Bad build: automated rollback', tone: 'err',
      steps: [
        { text: 'v2 has a bug for one payment method: <b>5% of its requests fail</b>. At 5% weight, only 0.25% of all checkouts are affected.', flow: ['users>lb', 'lb>canary', 'canary>db'], err: ['canary'], badges: { canary: ['5% errors', 'err'] }, tone: 'err' },
        { text: 'The analysis query returns 0.05 against <code>successCondition: result[0] &lt; 0.01</code>. One failure; <b>failureLimit: 1</b> allows one more.', flow: ['canary>prom', 'prom>an'], warn: ['an'], badges: { an: ['fail 1/2', 'warn'] } },
        { text: 'Second failed measurement a minute later. The AnalysisRun is <b>Failed</b> and the controller aborts.', flow: ['prom>an', 'an>ctl'], err: ['an'], badges: { an: ['fail 2/2', 'err'] } },
        { text: 'Abort = <b>weight back to 0%</b> in seconds; v1 pods were never touched. On-call gets a notification, not a page at 3 a.m.', flow: ['ctl>lb', 'lb>stable', 'an>oncall'], ok: ['stable'], badges: { lb: ['100 / 0', 'ok'], oncall: 'FYI' }, tone: 'ok' },
        { text: 'Damage at 1,000 req/s: ≈ 2.5 min × 5% traffic × 5% errors ≈ <b>375 failed requests</b>, versus ~7,500 for the same bug at 100%.', nodes: ['canary'], badges: { canary: ['≈ 375 failed', 'warn'] } }
      ]
    },
    {
      id: 'flags', title: 'Deploy dark, release with a flag', tone: 'info',
      steps: [
        { text: 'The new recommendation widget ships inside v2, but its <b>release flag</b> defaults to <b>off</b>. The deploy changes nothing users can see.', flow: ['ctl>canary', 'canary>flags'], badges: { flags: 'off for all' } },
        { text: '<b>Dark launch</b>: v2 calls the new recommender for 10% of requests and discards the result, to test load and errors with real traffic.', flow: ['users>lb', 'lb>canary', 'canary>flags'], badges: { flags: 'shadow 10%' } },
        { text: 'Product turns it on for <b>employees, then 1%, 10%, 50%</b> of users. Each change is a flag edit with an audit log, not a deploy.', flow: ['canary>flags'], badges: { flags: ['on: 10% users', 'ok'] } },
        { text: 'At 100% for two weeks, the team <b>deletes the flag and the old code path</b>. A release flag that stays becomes debt.', nodes: ['flags'], ok: ['flags'], badges: { flags: ['flag removed', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'db', title: 'Schema change during a canary', tone: 'warn',
      steps: [
        { text: 'v2 renames <code>addr</code> to <code>street</code>. If the migration drops <code>addr</code>, the 95% of pods still on <b>v1 break instantly</b>.', flow: ['lb>stable', 'stable>db'], err: ['stable', 'db'], badges: { stable: ['column missing', 'err'] }, tone: 'err' },
        { text: '<b>Expand</b> first: add <code>street</code>, v2 writes both columns, a backfill copies old rows. v1 and v2 both work.', flow: [['stable>db', 'canary>db']], ok: ['db'], badges: { db: ['both columns', 'ok'] } },
        { text: 'Rollback stays safe: v1 still reads <code>addr</code>, which v2 kept writing.', flow: ['ctl>lb', 'lb>stable', 'stable>db'], ok: ['stable'] },
        { text: '<b>Contract</b> only in a later release, once no running version reads <code>addr</code>. See Zero-Downtime Migrations.', nodes: ['db'], badges: { db: 'drop addr later' }, tone: 'ok' }
      ]
    },
    {
      id: 'scale', title: 'At scale: rings for a fleet of millions', tone: 'warn',
      steps: [
        { text: 'One global config push reaches every host at once. If it crashes the agent, there is <b>no slice left untouched</b> to roll back to (CrowdStrike, July 2024).', flow: ['ci>ctl', 'ctl>canary'], err: ['canary'], badges: { canary: ['100% of fleet', 'err'] }, tone: 'err' },
        { text: '<b>Rings</b>: internal dogfood → canary 1% → early adopters → region by region. Config and content follow the same rings as code.', flow: ['ctl>lb', ['lb>canary', 'lb>stable']], badges: { lb: 'ring 1 of 4' } },
        { text: 'Each ring has a <b>bake time</b> and its own analysis. At millions of hosts, even 1% is a statistically strong sample.', flow: [['canary>prom', 'stable>prom'], 'prom>an'], badges: { an: ['ring 1 healthy', 'ok'] } },
        { text: 'A failure stops the train at that ring; customers can opt to stay on n-1. Speed is traded for a <b>bounded blast radius</b>.', flow: ['an>ctl'], ok: ['ctl'], badges: { ctl: ['halt at ring 2', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real choice. Meter values are <em>illustrative</em>, reasoned from how much traffic sees a bad build, how long rollback takes, and what each option costs to run.',
    diagram: null,
    controls: [
      { id: 'strategy', label: 'Deployment strategy', type: 'seg', value: 'canary', options: [
        { v: 'recreate', l: 'Recreate', hint: 'Stop all v1, start v2: downtime' },
        { v: 'rolling', l: 'Rolling update', hint: 'maxSurge 25% / maxUnavailable 25%' },
        { v: 'bluegreen', l: 'Blue-green', hint: 'Second full stack, switch router' },
        { v: 'canary', l: 'Canary 5→25→50→100', hint: 'Weighted traffic steps' }] },
      { id: 'analysis', label: 'Promotion decision', type: 'seg', value: 'auto', options: [
        { v: 'manual', l: 'Manual (watch graphs)' }, { v: 'auto', l: 'Automated metric analysis' }] },
      { id: 'flags', label: 'Feature flags', type: 'seg', value: 'kill', options: [
        { v: 'none', l: 'None' }, { v: 'release', l: 'Release flags' }, { v: 'kill', l: 'Flags + kill switches' }] },
      { id: 'db', label: 'Database change style', type: 'seg', value: 'expand', options: [
        { v: 'breaking', l: 'Breaking change in the same deploy' }, { v: 'expand', l: 'Expand / contract' }] }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const st = s.strategy, auto = s.analysis === 'auto';
      // share of traffic exposed while a bad build is detected
      let blast = { recreate: 100, rolling: 60, bluegreen: 100, canary: 5 }[st];
      let detect = auto ? 3 : 15;                            // minutes until someone/something notices
      if (s.flags !== 'none') blast *= 0.5;                  // new code paths still off for most users
      let rollbackMin = { recreate: 8, rolling: 10, bluegreen: 0.5, canary: 0.3 }[st];
      if (s.flags === 'kill') rollbackMin = Math.min(rollbackMin, 0.2);
      const downtime = st === 'recreate';
      if (s.db === 'breaking' && st !== 'recreate') { blast = Math.max(blast, 95); }
      const rolloutMin = { recreate: 5, rolling: 10, bluegreen: 15, canary: 35 }[st] + (auto ? 0 : 15);
      const cost = { recreate: 1, rolling: 1.25, bluegreen: 2, canary: 1.1 }[st];
      let cx = { recreate: 0.1, rolling: 0.2, bluegreen: 0.45, canary: 0.6 }[st] + (auto ? 0.15 : 0) + { none: 0, release: 0.1, kill: 0.15 }[s.flags] + (s.db === 'expand' ? 0.1 : 0);
      const exposure = blast / 100 * (detect + rollbackMin);   // "100%-minutes"
      const dur = (m) => m < 1 ? Math.round(m * 60) + ' s' : Math.round(m) + ' min';

      const metrics = [
        { k: 'Blast radius (bad build)', v: '≈ ' + Math.round(blast) + '% of traffic', s: clamp(1 - blast / 100), hint: 'share exposed' },
        { k: 'Damage before recovery', v: '≈ ' + exposure.toFixed(1) + ' full-traffic minutes', s: clamp(1 - Math.log10(1 + exposure) / Math.log10(30)), hint: 'blast × (detect + rollback)' },
        { k: 'Rollback speed', v: (s.db === 'breaking' && st !== 'recreate') ? 'unsafe: old version breaks' : dur(rollbackMin), s: (s.db === 'breaking' && st !== 'recreate') ? 0.1 : clamp(1 - Math.log10(rollbackMin * 60) / Math.log10(900)) },
        { k: 'Rollout time (healthy)', v: '≈ ' + rolloutMin + ' min', s: clamp(1 - rolloutMin / 60) },
        { k: 'Infra cost during deploy', v: cost.toFixed(2).replace(/0$/, '') + '× capacity', s: clamp(1.6 - cost * 0.75) },
        { k: 'Downtime', v: downtime ? 'yes: v1 stops before v2 is ready' : 'none', s: downtime ? 0.05 : 1 },
        { k: 'Complexity', v: cx > 0.8 ? 'high: mesh, analysis, flag hygiene' : cx > 0.45 ? 'moderate' : 'low', s: clamp(1 - cx) }
      ];

      const notes = [];
      if (st === 'recreate') notes.push('Recreate is the only strategy that never runs two versions at once, which is why it tolerates breaking schema changes. The price is <b>downtime</b> and a 100% blast radius.');
      if (st === 'rolling') notes.push('A rolling update has no traffic control: readiness probes check that pods start, not that they are correct. By the time errors show, most pods may be on v2, and rollback is <b>another rollout</b>.');
      if (st === 'bluegreen') notes.push('Blue-green gives the fastest rollback (switch the router back) and a full pre-production smoke test on green, but the switch exposes <b>100% at once</b> and needs <b>2× capacity</b>.');
      if (st === 'canary') notes.push('Canary exposes only the first step (5%) while the analysis decides. Needs a traffic router for exact weights and enough traffic for a statistical signal.');
      if (!auto) notes.push('Manual promotion depends on someone watching the right graph. Google\'s CRE team notes manual inspection is not reliable enough to catch rises in error rate or latency.');
      if (s.flags === 'kill') notes.push('Kill switches turn a feature off without any deploy: often the fastest remediation of all, but each one needs an owner and a tested "off" path.');
      if (s.flags === 'none') notes.push('Without flags every release is a deploy, so a half-finished feature blocks the pipeline or forces long-lived branches.');
      if (s.db === 'breaking' && st !== 'recreate') notes.push('Two versions share the database. A breaking migration breaks the version still running, and makes <b>rollback impossible</b>.');

      let verdict;
      if (s.db === 'breaking' && st !== 'recreate') verdict = '❌ <b>Breaking schema change with mixed versions:</b> whichever version is not migrated will fail. Use expand / contract.';
      else if (st === 'recreate') verdict = '⚠ <b>Recreate means downtime</b> and no gradual exposure. Acceptable only for internal tools or with a maintenance window.';
      else if (st === 'rolling' && !auto) verdict = '⚠ <b>Kubernetes default, unguarded:</b> fine for low-risk services, but a bad build reaches most pods before anyone reacts.';
      else if (st === 'canary' && auto && s.flags !== 'none' && s.db === 'expand') verdict = '✅ <b>Progressive delivery:</b> small steps, automated analysis, flags for release and kill switches, compatible schema. Good interview default.';
      else if (st === 'bluegreen' && auto) verdict = '👍 <b>Blue-green with post-switch analysis:</b> instant rollback, but every bad build still hits everyone briefly. Add flags or a canary step to shrink exposure.';
      else verdict = '👍 <b>Reasonable,</b> but check the meters: automated analysis and flags are the cheapest ways to cut damage further.';

      const w = { recreate: '0 → 100', rolling: 'pods in waves', bluegreen: 'blue ⇄ green', canary: '95 / 5' }[st];
      return {
        metrics, verdict, notes,
        labels: {
          lb: { label: 'Traffic router', sub: w },
          canary: { label: st === 'canary' ? 'v2 canary' : st === 'bluegreen' ? 'v2 green' : 'v2 pods', sub: st === 'canary' ? 'ReplicaSet · 5%' : st === 'bluegreen' ? 'full copy, idle' : 'replacing v1' },
          stable: { label: st === 'bluegreen' ? 'v1 blue' : 'v1 stable', sub: st === 'recreate' ? 'stopped first' : st === 'bluegreen' ? 'live · 100%' : 'serving' },
          an: auto ? { label: 'AnalysisRun', sub: 'errors · p99 · thresholds' } : { label: 'Human check', sub: 'dashboard glance' },
          db: { label: 'Database', sub: s.db === 'expand' ? 'expand / contract' : 'breaking migration' }
        },
        hide: s.flags === 'none' ? ['flags'] : [],
        err: (s.db === 'breaking' && st !== 'recreate' ? ['db'] : []).concat(st === 'recreate' ? ['stable'] : []),
        warn: auto ? [] : ['an'],
        ok: st === 'canary' && auto ? ['ctl'] : [],
        badges: { lb: [Math.round(blast) + '% exposed', blast > 50 ? 'err' : blast > 10 ? 'warn' : 'ok'], canary: [cost + '× pods', cost >= 2 ? 'warn' : 'info'] },
        flow: ['ci>ctl', 'ctl>lb', 'users>lb', st === 'canary' ? ['lb>stable', 'lb>canary'] : 'lb>canary', 'canary>prom', 'prom>an', 'an>ctl']
      };
    }
  },

  widget: {
    title: 'Canary simulator with automated analysis',
    caption: 'Traffic ramps through <b>5 → 25 → 50 → 100%</b>, 4 simulated minutes per step. <b>Inject</b> an error rate or extra latency into v2 at any time. Every simulated minute the analysis compares v2 with the v1 baseline: errors must stay under <b>max(1%, 2× baseline)</b> and p99 under <b>baseline + 100 ms</b>; two failed checks in a row abort and set the weight to 0%. Switch to <b>blue-green</b> to see the same bug at a 100% switch.'
  },

  realWorld: {
    intro: 'The patterns were named in the 2000s and 2010s and are now built into Kubernetes controllers. The incidents show what happens when a change skips them.',
    timeline: [
      { when: '2008', who: 'Facebook', title: 'Dark launch of Facebook Chat', text: 'Before Chat had any UI, Facebook pages silently connected to the chat servers, queried presence and simulated message sends, so the backend saw <b>real load from real users</b> before launch to 70 million users. The engineering note made "dark launch" a common term.', src: 0 },
      { when: '2010', who: 'Martin Fowler', title: 'BlueGreenDeployment', text: 'Fowler\'s bliki entry, written as Humble and Farley finished <i>Continuous Delivery</i>, describes two identical environments behind a router: release by switching, roll back by switching back. Blue and green can also be slices of one environment.', src: 1 },
      { when: '2012', who: 'Knight Capital', title: '$460M in 45 minutes from a partial deploy', text: 'New code was deployed to seven of eight servers; the eighth still held dead "Power Peg" code, and the new release <b>repurposed the flag</b> that used to activate it. That server flooded the market with orders. The SEC found Knight lost over $460 million and fined it $12 million (order dated 16 Oct 2013).', src: 2 },
      { when: '2014', who: 'martinfowler.com bliki', title: 'CanaryRelease', text: 'Defines canary release as rolling a change out to a small subset of users before making it available to everybody, with routing and rollback as the key mechanics, and relates it to blue-green.', src: 3 },
      { when: '2016', who: 'Pete Hodgson (martinfowler.com)', title: 'Feature Toggles taxonomy', text: 'Classifies flags by <b>longevity and dynamism</b> into release, experiment, ops and permission toggles, and warns that toggles are inventory with a carrying cost: keep few, remove them promptly.', src: 4 },
      { when: '2018', who: 'Google & Netflix', title: 'Kayenta: open automated canary analysis', text: 'Netflix\'s internal canary judge, rebuilt with Google and integrated into Spinnaker, compares canary and baseline metrics statistically and returns a score that decides promotion. Released as open source on 10 April 2018.', src: 5 },
      { when: '2018', who: 'Google (SRE Workbook)', title: 'Canarying Releases', text: 'Chapter 16 treats canarying as an A/B test of the new release against the old on a small slice of production, and covers picking metrics, canary size and duration, and why canary and control must run at the same time.', src: 6 },
      { when: '2018', who: 'James Governor (RedMonk)', title: '"Progressive delivery" named', text: 'Groups canarying, feature flags and traffic routing under one name, built on decoupling <b>deploy from release</b>. Argo Rollouts and Flagger later describe themselves as progressive delivery controllers.', src: 7 },
      { when: '2023', who: 'CNCF', title: 'OpenFeature becomes incubating', text: 'A vendor-neutral flag evaluation API and SDKs (Java, Go, .NET, JS…) with pluggable providers for LaunchDarkly, Flagsmith, flagd and others, so application code does not lock into one vendor.', src: 8 },
      { when: '2024', who: 'CrowdStrike', title: 'Channel File 291 and the move to rings', text: 'A content update crashed Windows hosts worldwide; it was live from 04:09 to 05:27 UTC on 19 July. The RCA commits to staggered deployment: canary first, then <b>successive rings</b>, rolled back if problems are detected.', src: 9 }
    ],
    lessons: [
      'Treat <b>every change</b> (code, config, content, flags) as a deploy that goes through rings.',
      'Let <b>metrics and thresholds</b> decide promotion; humans set the thresholds.',
      'Make rollback a <b>traffic change</b> and keep every version compatible with the data.',
      'Separate <b>deploy from release</b>, and delete release flags once the feature is done.',
      'Never reuse a flag name for new behaviour; remove dead code paths.'
    ],
    sources: [
      { title: 'Facebook Chat (dark launch)', url: 'https://engineering.fb.com/2008/05/13/web-development/facebook-chat/', pub: 'Facebook Engineering, Eugene Letuchy, May 2008' },
      { title: 'BlueGreenDeployment', url: 'https://www.martinfowler.com/bliki/BlueGreenDeployment.html', pub: 'Martin Fowler, bliki, 2010' },
      { title: 'SEC order: In the Matter of Knight Capital Americas LLC (summary)', url: 'https://www.jrvarma.in/blog/Y2013/Knight-Capital.html', pub: 'J. R. Varma, summarising SEC Release 34-70694, Oct 2013' },
      { title: 'CanaryRelease', url: 'https://www.martinfowler.com/bliki/CanaryRelease.html', pub: 'martinfowler.com bliki, 2014' },
      { title: 'Feature Toggles (aka Feature Flags)', url: 'https://www.martinfowler.com/articles/feature-toggles.html', pub: 'Pete Hodgson, martinfowler.com, 2016' },
      { title: 'Introducing Kayenta: an open automated canary analysis tool from Google and Netflix', url: 'https://cloud.google.com/blog/products/gcp/introducing-kayenta-an-open-automated-canary-analysis-tool-from-google-and-netflix', pub: 'Google Cloud blog, April 2018' },
      { title: 'Chapter 16 - Canarying Releases', url: 'https://sre.google/workbook/canarying-releases/', pub: 'Google, The Site Reliability Workbook (2018)' },
      { title: 'Towards Progressive Delivery', url: 'https://redmonk.com/jgovernor/towards-progressive-delivery/', pub: 'James Governor, RedMonk, 2018' },
      { title: 'OpenFeature becomes a CNCF incubating project', url: 'https://www.cncf.io/blog/2023/12/19/openfeature-becomes-a-cncf-incubating-project/', pub: 'CNCF blog, Dec 2023' },
      { title: 'Executive Summary: Root Cause Analysis, Channel File 291', url: 'https://crowdstrike.com/wp-content/uploads/2024/08/Executive-Summary_Root-Cause-Analysis_Channel-File-291.pdf', pub: 'CrowdStrike, Aug 2024' },
      { title: 'Analysis & Progressive Delivery', url: 'https://argo-rollouts.readthedocs.io/en/stable/features/analysis', pub: 'Argo Rollouts documentation' },
      { title: 'Flagger: progressive delivery Kubernetes operator', url: 'https://docs.flagger.app', pub: 'Flux project (CNCF)' },
      { title: 'DORA\'s software delivery performance metrics', url: 'https://dora.dev/guides/dora-metrics-four-keys', pub: 'DORA (Google Cloud)' },
      { title: 'A history of DORA\'s software delivery metrics', url: 'https://dora.dev/guides/dora-metrics/history/', pub: 'DORA' },
      { title: 'V1RollingUpdateDeployment (maxSurge / maxUnavailable defaults)', url: 'https://github.com/kubernetes-client/python/blob/master/kubernetes/docs/V1RollingUpdateDeployment.md', pub: 'Kubernetes API reference (client docs)' },
      { title: 'How release canaries can save your bacon: CRE life lessons', url: 'https://cloud.google.com/blog/products/gcp/how-release-canaries-can-save-your-bacon-cre-life-lessons', pub: 'Google Cloud blog' }
    ]
  },

  tradeoffs: {
    headers: ['Strategy', 'Exposure to a bad build', 'Rollback', 'Cost / needs', 'Pick when…'],
    rows: [
      ['<b>Recreate</b>', '100%, plus downtime', 'Redeploy old version (minutes)', '1× capacity; nothing extra', 'Internal tools, maintenance windows, or versions that truly cannot coexist'],
      ['<b>Rolling update</b>', 'Grows wave by wave; often most pods before anyone reacts', 'Another rollout (minutes)', '≈ 1.25× with 25% surge; built into Kubernetes', 'Low-risk stateless services; add readiness probes and <code>minReadySeconds</code>'],
      ['<b>Blue-green</b>', '100% at the switch, but green is smoke-tested first', 'Switch back (seconds)', '2× capacity while both run; shared DB must fit both', 'Fast, all-or-nothing releases; easy pre-production testing on real infra'],
      ['<b>Canary + analysis</b>', 'First step only (1–5%)', 'Weight to 0% (seconds)', 'Traffic router, per-version metrics, enough traffic', 'User-facing services with real traffic: the default for frequent deploys'],
      ['<b>Feature flag</b>', 'Whatever targeting says (employees, 1%, a tenant)', 'Flip the flag (seconds), no deploy', 'Flag service, cleanup discipline, test both paths', 'Separate release from deploy; experiments; kill switches'],
      ['<b>A/B test vs canary</b>', 'A/B: chosen cohort for weeks', 'n/a: both variants are "good" builds', 'Statistics on business metrics', 'A/B answers "is the feature better?"; a canary answers "is the build safe?"']
    ]
  },
  failures: [
    { f: 'Partial deploy: one server left on old code', detect: 'Version skew in an inventory check; per-host error or behaviour outliers', fix: 'Deploy through a controller that reports every instance\'s version; fail the deploy if any instance does not converge (Knight Capital).' },
    { f: 'Canary that cannot see the bug', detect: 'Rollouts always pass, yet incidents follow promotion', fix: 'Compare canary vs baseline at the same time, include business metrics (checkout success), and size steps so the canary gets enough requests.' },
    { f: 'Inconclusive analysis promotes anyway', detect: 'Query returns NaN or empty at night (no traffic) and the step passes', fix: 'Treat no data as inconclusive and pause; require a minimum request count; use synthetic traffic for low-volume services.' },
    { f: 'Rollback impossible after a schema change', detect: 'Old version errors on a missing column during rollback', fix: 'Expand / contract: additive migrations first, destructive ones only after every running version stops using the old shape.' },
    { f: 'Flag debt and repurposed flags', detect: 'Hundreds of flags past expiry; flags with no owner; untested combinations', fix: 'Expiry dates, owners and a linter; delete release flags after rollout; never reuse a flag key.' },
    { f: 'Config or content bypasses the rings', detect: 'Global outage from a "data only" change', fix: 'Route config, rules and content through the same canary rings and automated checks as code (CrowdStrike RCA, 2024).' },
    { f: 'Flag service outage takes down the app', detect: 'Evaluation errors or timeouts during a vendor incident', fix: 'Evaluate in-process from a cached ruleset, always pass a safe default, and alert on evaluation errors.' }
  ],

  interview: [
    { q: 'Compare recreate, rolling, blue-green and canary.', a: '<ul><li><b>Recreate</b>: stop v1, start v2. Downtime, 100% exposure, but versions never overlap.</li><li><b>Rolling</b>: replace pods in waves (Kubernetes default, maxSurge / maxUnavailable 25%). No downtime, but no traffic control, and rollback is another rollout.</li><li><b>Blue-green</b>: a second full stack; switch the router. Instant rollback, 2× capacity, 100% exposure at the switch.</li><li><b>Canary</b>: a small, growing share of real traffic with analysis at each step. Smallest blast radius, needs a router and metrics.</li></ul>', fu: 'Which one tolerates a breaking schema change, and why?', lvl: 'core' },
    { q: 'What do maxSurge and maxUnavailable do?', a: '<p><b>maxSurge</b>: how many pods above the desired count may exist during the update. <b>maxUnavailable</b>: how many below it may be unready. Both default to <b>25%</b>; surge rounds up, unavailable rounds down; they cannot both be 0.</p><p>maxSurge 1 / maxUnavailable 0 is the safest (always full capacity, slow); a larger surge is faster but needs headroom. Readiness probes and <code>minReadySeconds</code> decide when a pod counts as available.</p>', lvl: 'core' },
    { q: 'How does automated canary analysis decide to roll back?', a: '<p>Each interval, query the same metrics for <b>canary and baseline</b> (ideally a baseline started fresh at the same time, so age and cache warmth match): error ratio, p99 latency, saturation, plus a business metric. Compare against thresholds (<code>successCondition</code>) or statistically (Kayenta scores each metric and aggregates a score).</p><p>After <b>failureLimit</b> failures the AnalysisRun fails and the controller sets the canary weight to 0. No data or NaN should be <b>inconclusive</b>, which pauses rather than promotes.</p>', fu: 'Why compare against a baseline instead of a fixed threshold?', lvl: 'deep' },
    { q: 'How many failed requests does a 5% canary save versus a big-bang deploy?', a: '<p>At 1,000 req/s and a bug that fails 5% of requests, detected in 3 min: big bang ≈ 1,000 × 0.05 × 180 = <b>9,000 failures</b>. A 5% canary ≈ 9,000 × 0.05 = <b>450</b>. Rollback by weight change is near-instant, so damage scales with <b>first-step size × detection time</b>.</p><p>The catch: at 5% the canary gets only 50 req/s, so subtle regressions need longer steps to be statistically visible.</p>', lvl: 'core' },
    { q: 'What is the difference between deploy and release, and why separate them?', a: '<p><b>Deploy</b> = the new binary runs in production. <b>Release</b> = users experience the change. Feature flags separate them: code ships dark, and turning it on is a flag change with its own targeting (employees, 1%, one tenant) and an instant off.</p><p>Benefits: trunk-based development without long branches, smaller deploys, and product controls launch timing. Cost: flag debt and two code paths to test.</p>', lvl: 'core' },
    { q: 'Name Pete Hodgson\'s four flag types and how they differ.', a: '<ul><li><b>Release toggles</b>: hide unfinished work; short-lived; remove after launch.</li><li><b>Experiment toggles</b>: A/B tests; per-request, cohort-based; live for the experiment.</li><li><b>Ops toggles</b>: kill switches and degradation controls; some are long-lived.</li><li><b>Permission toggles</b>: premium or beta features for certain users; long-lived.</li></ul><p>He classifies them by <b>longevity</b> and <b>dynamism</b> (static config vs per-request decision); the type tells you who owns it and when to delete it.</p>', lvl: 'core' },
    { q: 'How do you change a database schema while two versions run?', a: '<p><b>Expand / contract</b> (parallel change): 1) add the new column or table, nullable; 2) deploy code that writes both and reads old; 3) backfill; 4) switch reads to new; 5) stop writing old; 6) drop it in a later release.</p><p>Every step is backward compatible with the version before it, so a canary or rollback never meets a schema it does not understand.</p>', lvl: 'deep' },
    { q: 'Rollback or roll forward?', a: '<p><b>Roll back</b> by default: it returns to a known-good state and is fast when rollback is a traffic change. <b>Roll forward</b> when rollback is unsafe or slower: a contracted schema, data written in a new format, or a one-line fix that is faster through a healthy pipeline than a revert.</p><p>Decide the rule in advance, not during the incident; turning a flag off is often the third and quickest option.</p>', lvl: 'deep' },
    { q: 'Canary vs A/B test vs dark launch: what is each for?', a: '<ul><li><b>Canary</b>: is this <b>build</b> safe? Minutes to hours, judged on errors and latency, then rolled forward.</li><li><b>A/B test</b>: is this <b>feature</b> better? Days to weeks, random cohorts, judged on business metrics with statistical significance.</li><li><b>Dark launch / shadow traffic</b>: does the new path cope with real load and give the same answers? Users see nothing; responses are compared or discarded. Watch out for side effects (double writes, emails).</li></ul>', lvl: 'core' },
    { q: 'Which DORA metrics measure deployment health?', a: '<p>Deployment frequency and change lead time (throughput); <b>change failure rate</b> and <b>failed deployment recovery time</b> (formerly MTTR, renamed in 2023). DORA\'s research shows speed and stability move together: small, frequent, automated deploys fail less and recover faster.</p><p>Canary + automatic rollback mostly improves recovery time and reduces the impact of each failure; flags reduce batch size.</p>', fu: 'How would you avoid teams gaming these metrics?', lvl: 'core' },
    { q: 'Behavioural: tell me about introducing canary deployments to a team that feared them.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a payments team did rolling deploys on Friday mornings only; two bad releases in a quarter each failed about 3% of payments for 20 minutes.</p><p><b>Task</b>: deploy more often without more risk.</p><p><b>Action</b>: piloted Argo Rollouts on one service with steps 5 → 25 → 50 → 100 and an AnalysisTemplate on 5xx ratio and p99; ran it in "dry run" for two weeks so people could see it would have caught both past incidents; then enabled automatic abort.</p><p><b>Result</b>: deploys went from weekly to daily; the next bad build was aborted at 5% after 3 minutes with a few hundred failed requests, and nobody was paged.</p>', lvl: 'deep' },
    { q: 'Behavioural: how did you deal with feature flag debt?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a monolith had about 400 flags; nobody knew which were live, and a stale flag caused a production bug when someone toggled it.</p><p><b>Task</b>: reduce risk without blocking feature work.</p><p><b>Action</b>: added owner, type and expiry to every flag; a CI check failed builds for release flags past expiry; a monthly "flag cleanup" hour; adopted OpenFeature so the provider could change later.</p><p><b>Result</b>: down to about 90 flags in two quarters, all owned; release flags lived weeks, not years.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Argo Rollouts: canary steps + Prometheus AnalysisTemplate', lang: 'yaml',
      code: `apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata: { name: checkout }
spec:
  replicas: 20
  selector: { matchLabels: { app: checkout } }
  template:              # same pod template as a Deployment
    metadata: { labels: { app: checkout } }
    spec:
      containers:
      - { name: app, image: registry.example.com/checkout:2.4.0 }
  strategy:
    canary:
      canaryService: checkout-canary
      stableService: checkout-stable
      trafficRouting:
        nginx: { stableIngress: checkout }
      analysis:          # background analysis from step 1 onwards
        templates: [{ templateName: error-rate }]
        startingStep: 1
        args: [{ name: service, value: checkout-canary }]
      steps:
      - setWeight: 5
      - pause: { duration: 5m }
      - setWeight: 25
      - pause: { duration: 5m }
      - setWeight: 50
      - pause: { duration: 10m }
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata: { name: error-rate }
spec:
  args: [{ name: service }]
  metrics:
  - name: error-rate
    interval: 1m
    failureLimit: 1            # a second failure aborts the rollout
    successCondition: len(result) > 0 && result[0] < 0.01
    provider:
      prometheus:
        address: http://prometheus.monitoring:9090
        query: |
          sum(rate(http_server_requests_seconds_count{service="{{args.service}}",status=~"5.."}[2m]))
          / sum(rate(http_server_requests_seconds_count{service="{{args.service}}"}[2m]))`,
      note: 'After the last step the Rollout goes to 100% and the canary becomes stable. A failed AnalysisRun aborts: the weight returns to 0% and the stable ReplicaSet keeps serving. With no traffic the query returns an empty result or NaN, so guard the condition (or require a minimum request count) rather than promoting blindly.'
    },
    {
      title: 'OpenFeature Java SDK in Spring Boot 3: release flag + kill switch', lang: 'java',
      code: `import dev.openfeature.sdk.*;
import dev.openfeature.contrib.providers.flagd.FlagdProvider;

@Configuration
class FeatureFlagConfig {
  @Bean
  Client featureClient() {
    OpenFeatureAPI api = OpenFeatureAPI.getInstance();
    api.setProviderAndWait(new FlagdProvider());   // swap for LaunchDarkly, Flagsmith...
    return api.getClient("checkout");
  }
}

@Service
class CheckoutService {
  private final Client flags;
  private final RecommendationClient recs;
  CheckoutService(Client flags, RecommendationClient recs) { this.flags = flags; this.recs = recs; }

  List<Item> suggestions(String userId, String plan) {
    EvaluationContext ctx = new ImmutableContext(userId, Map.of("plan", new Value(plan)));

    // ops toggle / kill switch: default TRUE means "disabled" if the flag service is down
    if (flags.getBooleanValue("recs-kill-switch", true, ctx)) return List.of();

    // release toggle: default FALSE keeps unfinished code dark
    if (flags.getBooleanValue("new-recs-widget", false, ctx)) {
      return recs.v2(userId);
    }
    return recs.v1(userId);
  }
}`,
      note: 'The targeting key (user id) makes percentage rollouts sticky per user. Defaults are the safe value when evaluation fails. Requires <code>dev.openfeature:sdk</code> and the <code>dev.openfeature.contrib.providers:flagd</code> provider; the flag rules live in flagd\'s JSON, not in code.'
    },
    {
      title: 'Kubernetes Deployment: safe rolling update settings', lang: 'yaml',
      code: `apiVersion: apps/v1
kind: Deployment
metadata: { name: orders }
spec:
  replicas: 12
  revisionHistoryLimit: 5          # keep old ReplicaSets for kubectl rollout undo
  progressDeadlineSeconds: 300     # mark the rollout failed if stuck
  minReadySeconds: 20              # pod must stay Ready 20 s before counting
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%                # up to 3 extra pods (rounded up)
      maxUnavailable: 0            # never drop below 12 ready pods
  selector: { matchLabels: { app: orders } }
  template:
    metadata: { labels: { app: orders } }
    spec:
      terminationGracePeriodSeconds: 30
      containers:
      - name: app
        image: registry.example.com/orders:3.1.0
        readinessProbe:
          httpGet: { path: /actuator/health/readiness, port: 8080 }
          periodSeconds: 5
        lifecycle:
          preStop: { sleep: { seconds: 5 } }   # let the LB drain first (K8s 1.30+)`,
      note: 'maxUnavailable 0 + maxSurge 25% keeps full capacity during the rollout. A failed rollout does <b>not</b> roll back by itself: <code>progressDeadlineSeconds</code> only marks it failed, and you run <code>kubectl rollout undo</code> (or use Argo Rollouts). On clusters older than 1.30 use an <code>exec</code> preStop with <code>sleep 5</code>.'
    }
  ],

  related: ['zero-downtime-migrations', 'slo-error-budgets', 'gitops', 'platform-engineering', 'strangler-fig', 'service-mesh']
});
