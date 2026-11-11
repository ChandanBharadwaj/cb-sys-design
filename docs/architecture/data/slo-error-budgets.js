SD.register({
  slug: 'slo-error-budgets',
  domain: 8,
  title: 'SRE: SLIs, SLOs & Error Budgets',
  examples: 'Google SRE book & workbook',
  tagline: 'Agree how reliable is <b>reliable enough</b>, measure it the way users feel it, and spend the leftover <b>error budget</b> on shipping. Page a human only when that budget is burning fast.',
  tldr: {
    problem: 'Developers want to ship fast, operators want nothing to change, and nobody can say how reliable the service <i>should</i> be. Alerts fire on every blip, so people stop reading them.',
    idea: 'Define an <b>SLI</b> (good events ÷ valid events), set an <b>SLO</b> target over a window, and treat <b>1 − SLO</b> as an <b>error budget</b>. Alert on how fast the budget burns, and let an agreed <b>error budget policy</b> decide when releases slow down.',
    insight: 'The budget turns a political argument ("is it stable enough to ship?") into arithmetic that product and SRE both signed. 100% is the wrong target: users cannot tell 99.99% from 100%, and chasing it stops all change.',
    numbers: [
      { v: '43.2 min', l: 'error budget per 30 days at a 99.9% SLO (arithmetic: 0.1% × 43,200 min)' },
      { v: '14.4×', l: 'fast-burn page: 2% of a 30-day budget spent in 1 hour (SRE Workbook, "Alerting on SLOs")' },
      { v: '50%', l: 'cap on SRE time spent on toil / operational work (Google SRE book)' }
    ]
  },

  intro: {
    what: 'An <b>SLO</b> (service level objective) is a reliability target written as a number, such as "99.9% of checkout requests succeed over 28 days". It is measured with an <b>SLI</b> (service level indicator): the share of user requests that were good. Whatever the target leaves over is the <b>error budget</b>, the amount of failure you are allowed to spend.',
    analogy: {
      icon: '📱',
      title: 'A phone plan with a monthly data allowance',
      text: 'Your plan gives you 10 GB a month. You do not panic over every megabyte; you get a warning when you burn data unusually fast ("50% used in 3 days"), and if you run out you slow down until the month rolls over. An error budget works the same way: a fixed allowance of failures per window, warnings based on <b>burn speed</b>, and a rule about what happens when it is gone. The analogy breaks in one place: you choose to spend data, but failures spend the budget for you.'
    },
    problem: 'A team pages on every 5xx error and promises "five nines" nobody measured. The on-call engineer is woken 40 times a week, mostly for blips users never noticed. Meanwhile product wants to ship and operations wants a freeze, and the loudest voice wins. The question this answers is: <b>how much unreliability can we afford, and who decides what happens when we have used it up?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Aim for 100% and alert on every error',
        text: 'The service should never fail, so any error sends an alert to the on-call phone. It feels responsible: every failure is seen by a human.',
        scene: {
          nodes: [
            { id: 'users', label: 'Users', sub: 'checkout', kind: 'client', at: [70, 0] },
            { id: 'svc', label: 'Service', sub: 'target: 100%', kind: 'service', at: [210, 0] },
            { id: 'mon', label: 'Alert rule', sub: 'any 5xx → page', kind: 'compute', at: [350, 0] },
            { id: 'oncall', label: 'On-call', sub: 'phone', kind: 'person', at: [350, 110] },
            { id: 'dev', label: 'Dev team', sub: 'ships weekly', kind: 'team', at: [70, 110] }
          ],
          edges: [{ from: 'users', to: 'svc' }, { from: 'svc', to: 'mon' }, { from: 'mon', to: 'oncall' }, { from: 'dev', to: 'svc' }],
          flow: ['users>svc', 'svc>mon', 'mon>oncall']
        }
      },
      {
        stage: 'breaks',
        title: 'Pages all night, and a war over releases',
        text: 'Every deploy causes a few errors, so every deploy pages someone. Engineers learn to <b>ignore alerts</b>, and the real outage hides in the noise. Ops demands a freeze, product refuses, and there is no shared number to settle it.',
        scene: {
          nodes: [
            { id: 'users', label: 'Users', sub: 'mostly fine', kind: 'client', at: [70, 0] },
            { id: 'svc', label: 'Service', sub: '99.95% actual', kind: 'service', at: [210, 0] },
            { id: 'mon', label: 'Alert rule', sub: 'any 5xx → page', kind: 'compute', at: [350, 0] },
            { id: 'oncall', label: 'On-call', sub: '40 pages/week', kind: 'person', at: [350, 110] },
            { id: 'dev', label: 'Dev team', sub: 'frozen?', kind: 'team', at: [70, 110] }
          ],
          edges: [{ from: 'users', to: 'svc' }, { from: 'svc', to: 'mon' }, { from: 'mon', to: 'oncall' }, { from: 'dev', to: 'svc' }],
          flow: ['svc>mon', 'mon>oncall', 'mon>oncall'],
          err: ['oncall'], warn: ['dev'],
          badges: { oncall: ['alert fatigue', 'err'], dev: ['blocked', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Agree a target and spend the leftover',
        text: 'Measure the share of <b>good requests</b> and agree a target below 100%. The gap is a <b>budget</b>. Page only when it burns fast; while budget remains, the team ships freely; when it runs out, reliability work comes first.',
        scene: {
          nodes: [
            { id: 'users', label: 'Users', sub: 'checkout', kind: 'client', at: [70, 0] },
            { id: 'svc', label: 'Service', sub: 'SLO 99.9%', kind: 'service', at: [210, 0] },
            { id: 'sli', label: 'SLI', sub: 'good ÷ valid', kind: 'compute', at: [210, 110] },
            { id: 'budget', label: 'Error budget', sub: '62% left', kind: 'policy', at: [350, 110] },
            { id: 'oncall', label: 'On-call', sub: 'fast burn only', kind: 'person', at: [350, 220] },
            { id: 'dev', label: 'Dev team', sub: 'ships freely', kind: 'team', at: [70, 220] }
          ],
          edges: [{ from: 'users', to: 'svc' }, { from: 'svc', to: 'sli' }, { from: 'sli', to: 'budget' }, { from: 'budget', to: 'oncall' }, { from: 'budget', to: 'dev' }],
          flow: ['users>svc', 'svc>sli', 'sli>budget', ['budget>dev', 'budget>oncall']],
          ok: ['budget', 'dev'],
          badges: { dev: ['green light', 'ok'] }
        }
      }
    ],
    usedBy: ['Google (SRE book & workbook)', 'Google Cloud Monitoring SLOs', 'SoundCloud', 'Zalando', 'Mattermost', 'Prometheus + Sloth / Pyrra users'],
    whenToUse: [
      'A user-facing service where people argue about whether it is "stable enough" to ship',
      'On-call is drowning in alerts that do not match what users feel',
      'Internal platforms (Kafka, Kubernetes, auth) that many teams depend on and need a clear promise'
    ],
    whenNot: [
      'A prototype with no users yet: there is nothing meaningful to measure',
      'Pure batch jobs with a deadline: use a freshness or completion SLO, not a request-success one',
      'You only need to know how many nines a chain of dependencies gives you: see <a href="reliability-math.html">Reliability Math</a>'
    ],
    glossary: [
      { term: 'SLI', def: 'Service level indicator: a measured ratio of good events to valid events, such as successful requests ÷ all requests.' },
      { term: 'SLO', def: 'Service level objective: a target for an SLI over a time window, such as 99.9% over 28 days.' },
      { term: 'SLA', def: 'Service level agreement: a contract with customers that includes penalties (credits, refunds) when it is missed. It is set looser than the SLO.' },
      { term: 'Error budget', def: '1 − SLO: the share of events allowed to fail in the window, counted in minutes or bad requests.' },
      { term: 'Burn rate', def: 'How fast the budget is being spent relative to plan: observed error rate ÷ (1 − SLO). A burn rate of 1 uses exactly the whole budget by the end of the window.' },
      { term: 'Rolling window', def: 'An SLO window that always covers the last N days, so a bad day ages out after N days.' },
      { term: 'Error budget policy', def: 'A signed agreement on what the team does when the budget is spent, for example freezing feature releases.' },
      { term: 'Toil', def: 'Manual, repetitive, automatable operational work that grows with the service and leaves no lasting value.' }
    ]
  },

  requirements: {
    functional: [
      'Measure reliability <b>as users experience it</b>: SLI = good events ÷ valid events, per user journey',
      'Pick a target <b>below 100%</b> that keeps users happy, not the best you have ever achieved',
      'Treat <b>1 − SLO</b> as a budget to spend on releases, experiments and migrations',
      'Alert on <b>budget burn rate</b> (symptoms), not on CPU, single errors or causes',
      'A written, signed <b>error budget policy</b> says what happens when the budget is gone',
      'Review SLOs on a fixed cadence and change them with evidence'
    ],
    nonFunctional: [
      'A full outage pages within ~1 min at 99.9% (14.4× over 1 h fires after 0.1% × 14.4 × 60 min ≈ 0.86 min)',
      'Alerts clear within ~5 min of a fix (short window = 1/12 of the long window)',
      'Slow leaks (burn ≈ 1×) still raise a <b>ticket</b> within days',
      'SRE toil ≤ 50% of time (Google SRE book)',
      'SLA target looser than the SLO (e.g. SLO 99.95% behind an SLA of 99.9%) so you act before penalties',
      'Every page is actionable and has a runbook link'
    ],
    outOfScope: [
      '<b>100% targets</b>: no room for change, and users cannot tell the difference',
      '<b>SLOs on CPU, memory or host up-time</b> instead of user-visible outcomes',
      '<b>SLA = SLO</b>: you learn about a breach from the customer\'s refund claim',
      '<b>Dozens of SLOs per service</b> that nobody reviews',
      '<b>Budget as a weapon</b>: blaming teams instead of buying reliability work'
    ]
  },

  calculator: {
    inputs: [
      { id: 'slo', label: 'SLO target', min: 95, max: 99.99, step: 0.01, value: 99.9, unit: '%', fmt: 'raw' },
      { id: 'days', label: 'SLO window', min: 7, max: 90, value: 30, unit: 'days' },
      { id: 'rps', label: 'Average request rate', min: 1, max: 100000, value: 200, log: true, unit: 'req/s' },
      { id: 'err', label: 'Current error rate', min: 0.00001, max: 0.5, value: 0.005, log: true, fmt: 'pct' },
      { id: 'used', label: 'Budget already used this window', min: 0, max: 100, step: 5, value: 25, unit: '%' }
    ],
    outputs: [
      { label: 'Error budget per window (time at 100% errors)', fmt: 'ms', f: (v) => v.days * 86400e3 * (1 - v.slo / 100) },
      { label: 'Error budget per window (bad requests)', f: (v) => v.rps * v.days * 86400 * (1 - v.slo / 100) },
      { label: 'Burn rate = error rate ÷ (1 − SLO)', f: (v) => { const b = v.err / (1 - v.slo / 100); return (b < 10 ? b.toFixed(2) : b.toFixed(1)) + '×'; } },
      { label: 'Time until the remaining budget is gone', fmt: 'ms', f: (v) => { const left = 1 - v.used / 100; if (left <= 0) return 'exhausted'; const b = v.err / (1 - v.slo / 100); return left * v.days * 86400e3 / b; } },
      { label: 'Alert under the multi-window rule (steady error rate)', f: (v) => {
        const e = 1 - v.slo / 100, b = v.err / e, H = v.days * 24;
        if (b >= 0.02 * H / 1) return '🔴 PAGE (2% in 1 h)';
        if (b >= 0.05 * H / 6) return '🔴 PAGE (5% in 6 h)';
        if (b >= 0.10 * H / 72) return '🟡 TICKET (10% in 3 d)';
        return '🟢 no alert';
      } },
      { label: 'Fast-burn page fires above this error rate', f: (v) => { const e = 1 - v.slo / 100; const r = 0.02 * v.days * 24 * e * 100; return '> ' + (r < 0.1 ? r.toFixed(3) : r < 10 ? r.toFixed(2) : r.toFixed(1)) + '%'; } }
    ],
    note: 'Budget = (1 − SLO) × window. Burn rate 1 spends exactly the whole budget by the end of the window. The alert tiers keep the SRE Workbook\'s <b>budget fractions</b> (2% in 1 h and 5% in 6 h page, 10% in 3 days tickets). For a 30-day window they give the published burn rates <b>14.4×, 6× and 1×</b>; for other windows the burn thresholds are rescaled (threshold = fraction × window hours ÷ alert window hours). Assumes a steady error rate, so both the long and the short window agree.'
  },

  api: [
    { m: 'SLO', p: 'SLO document (per service)', d: 'Service and owner, user journeys, each <b>SLI specification</b> ("ratio of checkout requests served in &lt; 300 ms") and <b>implementation</b> (which metric, measured where), target, window, rationale, and who approved it. The SRE Workbook\'s Appendix A is a template.' },
    { m: 'POLICY', p: 'Error budget policy', d: 'What happens when the budget is spent: e.g. freeze non-urgent releases until back within SLO, postmortem for any incident using > 20% of the budget, escalation path if the teams disagree. Signed by product, dev and SRE leads (Workbook Appendix B).' },
    { m: 'YAML', p: 'slo.yaml (Sloth / OpenSLO spec)', d: 'The SLO as code: good and total queries, objective, window, page and ticket alert labels. A generator turns it into recording and alerting rules, so every team gets the same burn-rate math.' },
    { m: 'YAML', p: 'Prometheus rules', d: 'Recording rules for error ratios over 5m, 30m, 1h, 6h and 3d, plus multi-window burn-rate alerts with <code>severity: page</code> or <code>ticket</code> and a runbook link.' },
    { m: 'DOC', p: 'SLA schedule (customer contract)', d: 'External promise and remedy: e.g. 99.9% monthly uptime, service credits of 10% / 25% below thresholds, exclusions (planned maintenance, customer misuse). Always looser than the internal SLO.' },
    { m: 'DOC', p: 'Quarterly SLO review', d: 'Budget spent per service, top budget consumers (incidents, deploys, dependencies), whether the SLO still matches user happiness (support tickets, churn), and proposed target changes.' }
  ],
  dataModel: [
    { name: 'slo_definition', store: 'Git (YAML) → Postgres catalog', fields: [['slo_id', 'text', 'pk'], ['service', 'text', 'idx'], ['journey', 'text'], ['sli_good_query', 'text'], ['sli_valid_query', 'text'], ['objective', 'numeric(6,4)'], ['window', 'interval'], ['owner_team', 'text', 'fk']], note: 'The source of truth lives in Git and is reviewed like code; the catalog powers dashboards and reviews.' },
    { name: 'sli_events', store: 'Prometheus counters', fields: [['http_server_requests_seconds_count', 'counter'], ['…_bucket{le="0.3"}', 'counter'], ['status / outcome', 'label'], ['uri, method', 'label'], ['job, instance', 'label']], note: 'Counters, not gauges: ratios over any window are computed with rate() at query time.' },
    { name: 'error_budget_ledger', store: 'Postgres (daily rollup)', fields: [['slo_id', 'text', 'pk'], ['day', 'date', 'pk'], ['valid_events', 'bigint'], ['bad_events', 'bigint'], ['budget_spent_pct', 'numeric'], ['top_cause', 'text']], note: 'Lets the review answer "what spent our budget?": a deploy, an incident id or a dependency.' },
    { name: 'budget_decision', store: 'Postgres', fields: [['decision_id', 'uuid', 'pk'], ['slo_id', 'text', 'fk'], ['state', 'enum(normal, freeze)'], ['started_at', 'timestamptz'], ['approved_by', 'text'], ['exception_reason', 'text']], note: 'Audit trail of freezes and exceptions granted under the policy.' }
  ],

  architecture: {
    title: 'SLO pipeline: from requests to pages and release decisions',
    nodes: [
      { id: 'users', label: 'Users', sub: 'checkout journey', kind: 'client', wide: [90, 0], tall: [70, 0], tip: 'The SLI should reflect what these people experience: did the request succeed, and was it fast enough?' },
      { id: 'lb', label: 'Load balancer', sub: 'SLI measured here', kind: 'edge', wide: [290, 0], tall: [210, 0], tip: 'Measuring at the load balancer also catches requests that never reached a healthy server. Client-side (RUM) or synthetic probes are closer still to the user.' },
      { id: 'svc', label: 'Checkout service', sub: 'SLO 99.9% · 28 d', kind: 'service', wide: [490, 0], tall: [350, 0], tip: 'Exports request counters by status and latency buckets (e.g. Micrometer histograms with an SLO boundary at 300 ms).' },
      { id: 'dep', label: 'Payment provider', sub: 'dependency · 99.9%', kind: 'external', wide: [690, 0], tall: [350, 105], tip: 'A hard dependency caps your SLO: without retries, caching or a fallback you cannot promise more than it does.' },
      { id: 'prom', label: 'Prometheus', sub: 'good / valid counters', kind: 'store', wide: [290, 110], tall: [210, 105], tip: 'Scrapes counters; ratios over any window come from rate() at query time.' },
      { id: 'rules', label: 'Recording rules', sub: 'ratio 5m … 3d', kind: 'compute', wide: [490, 110], tall: [210, 210], tip: 'Pre-computes error ratios over 5m, 30m, 1h, 6h and 3d so alerts and dashboards are cheap.' },
      { id: 'budget', label: 'Budget policy', sub: 'freeze if exhausted', kind: 'policy', wide: [690, 110], tall: [70, 210], tip: 'The signed agreement: what happens to releases when the budget is spent, and who can grant an exception.' },
      { id: 'deploy', label: 'CI/CD', sub: 'release gate', kind: 'service', wide: [890, 110], tall: [70, 105], tip: 'Checks the remaining budget before promoting a release; can roll back automatically.' },
      { id: 'alert', label: 'Alertmanager', sub: 'burn-rate alerts', kind: 'service', wide: [490, 220], tall: [210, 315], tip: 'Routes severity=page to the on-call phone and severity=ticket to the team queue.' },
      { id: 'oncall', label: 'On-call SRE', sub: 'paged on fast burn', kind: 'person', wide: [290, 220], tall: [70, 315], tip: 'Only woken when budget is burning fast enough to matter (e.g. 2% of the month in an hour).' },
      { id: 'ticket', label: 'Ticket queue', sub: 'slow burn', kind: 'queue', wide: [690, 220], tall: [350, 315], tip: 'Slow leaks become tickets handled in working hours.' },
      { id: 'product', label: 'Product team', sub: 'roadmap owner', kind: 'team', wide: [890, 220], tall: [350, 210], tip: 'Co-signs the SLO and the policy; decides what to ship while budget remains.' }
    ],
    edges: [
      { from: 'users', to: 'lb' },
      { from: 'lb', to: 'svc' },
      { from: 'svc', to: 'dep' },
      { from: 'lb', to: 'prom' },
      { from: 'svc', to: 'prom' },
      { from: 'prom', to: 'rules' },
      { from: 'rules', to: 'alert' },
      { from: 'alert', to: 'oncall' },
      { from: 'alert', to: 'ticket' },
      { from: 'rules', to: 'budget' },
      { from: 'budget', to: 'deploy' },
      { from: 'deploy', to: 'svc' },
      { from: 'ticket', to: 'product' },
      { from: 'product', to: 'deploy' },
      { from: 'product', to: 'budget', dashed: true, bend: -0.3 }
    ]
  },

  scenarios: [
    {
      id: 'measure', title: 'How the SLI is measured', tone: 'info',
      steps: [
        { text: 'A user checks out. The <b>load balancer</b> sees the request and its outcome, so even requests that never reach a healthy pod are counted.', flow: ['users>lb', 'lb>svc'] },
        { text: 'Counters go up: <code>requests_total</code> (valid events) and <code>requests_total{status=~"5.."}</code>. A latency SLI uses the histogram bucket <code>le="0.3"</code> (served in ≤ 300 ms).', flow: [['lb>prom', 'svc>prom']], badges: { prom: 'good / valid' } },
        { text: '<b>Recording rules</b> turn counters into error ratios over 5m, 30m, 1h, 6h and 3d. 4xx caused by the client are usually <b>not valid events</b>: they are excluded, not counted as good.', flow: ['prom>rules'], badges: { rules: '0.04% (1h)' } },
        { text: 'Over 28 days the SLI is 99.96% against a 99.9% SLO: <b>60% of the budget is left</b>. The release gate stays green.', flow: ['rules>budget', 'budget>deploy'], ok: ['budget'], badges: { budget: ['60% left', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'fastburn', title: 'Bad deploy: fast burn → page', tone: 'err',
      steps: [
        { text: 'A deploy ships a bug. <b>20% of checkouts fail</b>. With a 99.9% SLO that is a <b>burn rate of 200×</b>: the whole month\'s budget would be gone in about 3.6 hours.', flow: ['deploy>svc', 'users>lb', 'lb>svc'], err: ['svc'], badges: { svc: ['20% errors', 'err'] }, tone: 'err' },
        { text: 'The <b>1 h</b> error ratio crosses 14.4 × 0.1% = 1.44% within minutes, and the <b>5 m</b> ratio confirms it is still happening. Both conditions are true, so the alert fires.', flow: ['prom>rules', 'rules>alert'], badges: { rules: ['1h: 200× · 5m: 200×', 'err'] } },
        { text: 'Alertmanager sends <code>severity=page</code>. The on-call engineer opens the runbook: "recent deploy? roll back first, debug later".', flow: ['alert>oncall'], err: ['oncall'], badges: { oncall: ['PAGE', 'err'] } },
        { text: 'Rollback through CI/CD. Errors stop. The <b>5 m window</b> drops below threshold within minutes, so the page resolves fast instead of firing for another hour.', flow: ['oncall>deploy', 'deploy>svc'], ok: ['svc'], badges: { svc: ['rolled back', 'ok'] }, tone: 'ok' },
        { text: 'Damage: 25 min at 20% errors ≈ <b>12% of the 30-day budget</b> (25 × 0.2 ÷ 43.2). Under the Workbook\'s example policy, a single incident over 20% would require a postmortem.', nodes: ['budget'], warn: ['budget'], badges: { budget: ['−12%', 'warn'] } }
      ]
    },
    {
      id: 'slowburn', title: 'Slow leak: ticket, not a page', tone: 'warn',
      steps: [
        { text: 'The payment provider starts timing out on <b>0.3% of calls</b>. Burn rate = 0.3% ÷ 0.1% = <b>3×</b>. Nobody would notice on a dashboard.', flow: ['svc>dep'], warn: ['dep'], badges: { dep: ['0.3% timeouts', 'warn'] }, tone: 'warn' },
        { text: '3× is below the page thresholds (14.4× in 1 h, 6× in 6 h), so <b>nobody is woken up</b>. A static "errors &gt; 1%" alert would also stay silent, forever.', flow: ['prom>rules'], badges: { rules: '1h: 3× · 6h: 3×' } },
        { text: 'After roughly a day the <b>3-day</b> ratio passes 1× while the 6 h window confirms it is ongoing. A <b>ticket</b> lands in the team queue.', flow: ['rules>alert', 'alert>ticket', 'ticket>product'], badges: { ticket: ['TICKET', 'warn'] } },
        { text: 'The team adds a retry with a deadline and a circuit breaker around the provider. Left alone, this leak would have spent the <b>whole budget in 10 days</b>.', nodes: ['svc', 'dep'], ok: ['svc'], badges: { svc: ['retry + breaker', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'freeze', title: 'Budget exhausted: the policy kicks in', tone: 'warn',
      steps: [
        { text: 'Three incidents in two weeks. The 28-day SLI is 99.87%: the budget is <b>overspent by 30%</b>.', flow: ['rules>budget'], err: ['budget'], badges: { budget: ['−30%', 'err'] }, tone: 'err' },
        { text: 'The <b>error budget policy</b>, signed months ago, applies: feature releases pause; only P0 bug and security fixes ship. Nobody has to win an argument.', flow: ['budget>deploy'], warn: ['deploy'], badges: { deploy: ['features frozen', 'warn'] }, tone: 'warn' },
        { text: 'The product team re-plans the sprint around <b>reliability work</b> from the postmortems: better canaries, a fallback for the payment provider, load tests.', flow: ['product>budget', 'product>deploy'], nodes: ['product'], badges: { product: 'reliability sprint' } },
        { text: 'With a <b>rolling 28-day window</b>, the bad days age out one by one. When the SLI is back above 99.9%, releases resume automatically.', flow: ['rules>budget', 'budget>deploy'], ok: ['budget', 'deploy'], badges: { budget: ['back in SLO', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'deps', title: 'At scale: dependencies cap your SLO', tone: 'warn',
      steps: [
        { text: 'Checkout wants 99.95%. It calls three hard dependencies in series, each with a 99.9% SLO. If any one fails, checkout fails.', flow: ['users>lb', 'lb>svc', 'svc>dep'], badges: { dep: '×3 at 99.9%' } },
        { text: 'Composite availability ≈ 0.999³ ≈ <b>99.7%</b>, below the 99.95% target. The SLO is <b>impossible</b> as designed, however good checkout\'s own code is.', nodes: ['svc', 'dep'], err: ['svc'], badges: { svc: ['≤ 99.7%', 'err'] }, tone: 'err' },
        { text: 'Options: make dependencies soft (cache, queue the payment capture, degrade gracefully), add redundancy, or negotiate a stricter internal SLO from the platform team.', nodes: ['svc', 'dep', 'product'], badges: { product: 'trade-off' } },
        { text: 'Platforms publish SLOs too, written from the <b>consumer\'s view</b> (e.g. "99.95% of produce calls ack in &lt; 50 ms"), so teams can do this arithmetic before promising anything.', nodes: ['dep', 'svc'], ok: ['svc'], badges: { svc: ['async capture', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real choice an SRE lead makes. Meter values are <em>illustrative</em> but follow the Workbook\'s reasoning: precision, recall, detection time and reset time are the four properties of an alert.',
    diagram: null,
    controls: [
      { id: 'slo', label: 'SLO target', type: 'seg', value: '99.9', options: [
        { v: '99', l: '99%' }, { v: '99.5', l: '99.5%' }, { v: '99.9', l: '99.9%' }, { v: '99.95', l: '99.95%' }, { v: '99.99', l: '99.99%' }] },
      { id: 'alert', label: 'Alerting strategy', type: 'seg', value: 'mwmbr', options: [
        { v: 'static', l: 'Static: errors > 1% for 5m', hint: 'The classic threshold, unrelated to the SLO' },
        { v: 'single', l: 'Burn rate, one window', hint: '14.4× over 1 h only' },
        { v: 'mwmbr', l: 'Multi-window, multi-burn-rate', hint: 'SRE Workbook: 1h+5m, 6h+30m page; 3d+6h ticket' }] },
      { id: 'window', label: 'SLO window', type: 'seg', value: '28d', options: [
        { v: '7d', l: '7 days rolling' }, { v: '28d', l: '28 days rolling' }, { v: '30cal', l: '30 days calendar' }] },
      { id: 'policy', label: 'Error budget policy', type: 'seg', value: 'soft', options: [
        { v: 'none', l: 'None (dashboard only)' }, { v: 'soft', l: 'Soft: prioritise fixes' }, { v: 'freeze', l: 'Enforced release freeze' }] }
    ],
    evaluate(s) {
      const slo = +s.slo, e = 1 - slo / 100;
      const days = { '7d': 7, '28d': 28, '30cal': 30 }[s.window];
      const H = days * 24;
      const budgetMin = days * 1440 * e;
      const fastThr = 0.02 * H; // burn threshold for 2% of budget in 1 h
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const dur = (min) => min < 1 ? Math.round(min * 60) + ' s' : min < 120 ? (min < 10 ? min.toFixed(1).replace(/\.0$/, '') : Math.round(min)) + ' min' : (min / 60).toFixed(1) + ' h';
      const staticBurn = 0.01 / e; // what burn rate a fixed 1% threshold corresponds to

      let precision, recall, detectMin, resetMin, pages;
      if (s.alert === 'static') {
        precision = clamp(0.2 + Math.log10(staticBurn) * 0.35);
        recall = clamp(1 - Math.log10(staticBurn) / 2.5);
        detectMin = 5; resetMin = 5; pages = 5;
      } else if (s.alert === 'single') {
        precision = 0.85; recall = 0.45;
        detectMin = e * fastThr * 60; resetMin = 58; pages = 1.2;
      } else {
        precision = 0.9; recall = 0.9;
        detectMin = e * fastThr * 60; resetMin = 5; pages = 1;
      }
      if (s.alert !== 'static') {
        pages *= { 99: 0.6, 99.5: 0.8, 99.9: 1, 99.95: 1.3, 99.99: 2 }[slo];
        pages *= { '7d': 1.6, '28d': 1, '30cal': 1 }[s.window];
        if (s.window === '7d') precision -= 0.15;
      }
      pages *= { none: 1.4, soft: 1.1, freeze: 0.85 }[s.policy];

      let vel = { 99: 0.9, 99.5: 0.85, 99.9: 0.75, 99.95: 0.6, 99.99: 0.35 }[slo];
      vel += { none: 0.1, soft: 0, freeze: -0.08 }[s.policy];
      vel += { '7d': -0.05, '28d': 0, '30cal': -0.03 }[s.window];
      vel = clamp(vel);

      const metrics = [
        { k: 'Error budget', v: dur(budgetMin) + ' per ' + days + ' d', s: clamp(Math.log10(Math.max(budgetMin, 1)) / Math.log10(400)), hint: 'room to change' },
        { k: 'Alert precision', v: precision >= 0.8 ? 'high: pages mean real budget loss' : precision >= 0.5 ? 'medium: some pages are noise' : 'low: pages on harmless blips', s: clamp(precision) },
        { k: 'Alert recall', v: recall >= 0.8 ? 'high: slow leaks become tickets' : recall >= 0.5 ? 'medium: misses some burns' : 'low: slow burns go unseen', s: clamp(recall) },
        { k: 'Detection time (full outage)', v: '≈ ' + dur(detectMin), s: clamp(1 - Math.log10(detectMin * 60) / Math.log10(3600)), hint: s.alert === 'static' ? 'for: 5m' : 'e × burn × 1 h' },
        { k: 'Alert reset time', v: '≈ ' + dur(resetMin) + ' after the fix', s: resetMin <= 5 ? 0.9 : 0.25 },
        { k: 'Release velocity', v: vel >= 0.8 ? 'high' : vel >= 0.6 ? 'steady' : vel >= 0.4 ? 'slowed by frequent freezes' : 'low: little room to change', s: vel },
        { k: 'On-call load', v: '≈ ' + pages.toFixed(1) + ' pages / week', s: clamp(1 - pages / 8), hint: 'illustrative' }
      ];

      const notes = [];
      if (s.alert === 'static') notes.push('A fixed 1% threshold equals a burn rate of <b>' + staticBurn.toFixed(staticBurn < 10 ? 1 : 0) + '×</b> at ' + slo + '%. ' + (staticBurn < 6 ? 'That pages on burns that would never threaten the budget.' : 'Anything slower than that never alerts, however long it lasts.'));
      if (s.alert === 'single') notes.push('One 1 h window at 14.4× misses a 10× burn completely (it would spend the 30-day budget in 3 days) and stays firing for up to <b>58 min after the fix</b> (SRE Workbook).');
      if (s.alert === 'mwmbr') notes.push('Page when 1 h <b>and</b> 5 m burn ≥ ' + (0.02 * H).toFixed(1) + '×, or 6 h and 30 m ≥ ' + (0.05 * H / 6).toFixed(1) + '×; ticket when 3 d and 6 h ≥ ' + (0.1 * H / 72).toFixed(2) + '×. ' + (days === 30 ? 'These are the Workbook\'s 14.4 / 6 / 1.' : 'Rescaled from the Workbook\'s 30-day values to keep the same budget fractions.'));
      if (s.window === '7d') notes.push('A 7-day window gives only ' + dur(budgetMin) + ' of budget: one incident can wipe it, but it is also forgotten within a week. Good for fast-moving teams, noisy for paging.');
      if (s.window === '30cal') notes.push('Calendar months match SLA reporting and reviews (Evernote chose this), but the budget <b>resets on the 1st</b>: an outage on the 30th is forgotten the next day.');
      if (s.policy === 'none') notes.push('Without a policy the budget is just a chart. Nothing changes when it runs out, so reliability slowly drifts and pages grow.');
      if (s.policy === 'freeze') notes.push('The Workbook\'s example policy halts changes other than P0 and security fixes until the service is back within SLO.');
      if (slo >= 99.99) notes.push('Four nines over ' + days + ' days is ' + dur(budgetMin) + ': a single manual rollback can spend it. You need automated canaries, rollback and redundancy, not just alerts.');

      let verdict;
      if (s.alert === 'static') verdict = '⚠ <b>Static thresholds ignore the budget.</b> They page on harmless blips or miss slow leaks, depending on the SLO. Switch to burn-rate alerts.';
      else if (s.policy === 'none') verdict = '⚠ <b>No error budget policy:</b> the alerts may be good, but nothing links the budget to release decisions, so product and SRE are back to arguing.';
      else if (slo >= 99.99) verdict = '⚠ <b>' + dur(budgetMin) + ' of budget is very tight.</b> Only promise four nines if users truly need it and every dependency can support it.';
      else if (s.alert === 'single') verdict = '👍 <b>Better than thresholds,</b> but add a short window (faster reset) and slower tiers (recall) to get the full Workbook setup.';
      else if (s.alert === 'mwmbr' && s.window === '28d' && (slo === 99.9 || slo === 99.95)) verdict = '✅ <b>Workbook-style setup:</b> multi-window burn-rate alerts on a rolling 28-day SLO, backed by a policy everyone signed. Good interview default.';
      else verdict = '👍 <b>Sound setup.</b> Check the meters for the trade-off this target and window impose on on-call and release pace.';

      const labels = {
        rules: s.alert === 'static' ? { label: 'Threshold rule', sub: 'errors > 1% for 5m' } : s.alert === 'single' ? { label: 'Burn-rate rule', sub: '14.4× over 1h' } : { label: 'Burn-rate rules', sub: '1h+5m · 6h+30m · 3d+6h' },
        budget: { label: s.policy === 'none' ? 'No policy' : 'Budget policy', sub: { none: 'dashboard only', soft: 'prioritise fixes', freeze: 'enforced freeze' }[s.policy] },
        svc: { label: 'Checkout service', sub: 'SLO ' + slo + '% · ' + days + ' d' }
      };
      const flow = ['users>lb', 'lb>prom', 'prom>rules', 'rules>alert', s.alert === 'mwmbr' ? ['alert>oncall', 'alert>ticket'] : 'alert>oncall', 'rules>budget'].concat(s.policy === 'none' ? [] : ['budget>deploy']);
      return {
        metrics, verdict, notes, labels, flow,
        hide: s.alert === 'mwmbr' ? [] : ['ticket'],
        warn: (s.alert === 'static' ? ['oncall'] : []).concat(s.policy === 'none' ? ['budget'] : []),
        ok: s.alert === 'mwmbr' && s.policy !== 'none' ? ['budget'] : [],
        badges: { budget: [dur(budgetMin), slo >= 99.99 ? 'err' : 'info'], oncall: [pages.toFixed(1) + '/wk', pages > 4 ? 'err' : pages > 2 ? 'warn' : 'ok'] }
      };
    }
  },

  widget: {
    title: 'A month of error budget, with burn-rate alerts',
    caption: 'Thirty days of traffic play out in about 40 seconds. <b>Inject an incident</b> at any moment: a sharp spike, a medium burn or a slow leak. The top chart shows the budget left; the middle one shows the <b>1 h burn rate</b> on a log scale against the 14.4×, 6× and 1× lines; the strip shows when the multi-window <b>page</b> and <b>ticket</b> alerts from the SRE Workbook would fire.'
  },

  realWorld: {
    intro: 'Google wrote the playbook; others turned it into Prometheus rules and tooling. Numbers below are quoted from the sources.',
    timeline: [
      { when: '2016', who: 'Google (SRE book)', title: '"Embracing Risk": the error budget', text: 'Google argues that extreme reliability has a cost and that users cannot tell very high availability from perfect. The error budget, 1 − SLO, gives product and SRE <b>a common, data-driven mechanism</b> for deciding when to launch.', src: 0 },
      { when: '2016', who: 'Google (SRE book)', title: 'SLIs, SLOs and SLAs defined', text: 'The "Service Level Objectives" chapter defines the three terms and tells the story of <b>Chubby</b>: the lock service was so reliable that teams depended on it too much, so Google introduced planned outages to keep it at, not far above, its target.', src: 1 },
      { when: '2016', who: 'Google (SRE book)', title: 'The 50% toil cap', text: 'SRE teams aim to keep operational work (toil) <b>below 50%</b> of each SRE\'s time, so the rest goes to engineering that reduces future toil. When it stays above that, work flows back to the product team.', src: 2 },
      { when: '2018', who: 'Google (SRE Workbook)', title: 'Implementing SLOs', text: 'Worked example: a 99.9% target on a service that receives <b>3 million requests over four weeks</b> gives a budget of <b>3,000 errors</b>. The example SLO document uses a <b>four-week rolling window</b>.', src: 3 },
      { when: '2018', who: 'Google (SRE Workbook)', title: 'Alerting on SLOs: multi-window, multi-burn-rate', text: 'Six alerting designs are compared on precision, recall, detection and reset time. The recommended table: page at <b>14.4× over 1 h</b> (2% of budget) and <b>6× over 6 h</b> (5%), ticket at <b>1× over 3 days</b> (10%), each paired with a short window of 1/12 the long one (5 m, 30 m, 6 h).', src: 4 },
      { when: '2018', who: 'Google (SRE Workbook)', title: 'Example error budget policy', text: 'If the service exceeds its budget over the preceding four weeks, changes other than P0 issues and security fixes halt until it is back within SLO; any single incident using <b>more than 20% of the budget over four weeks</b> needs a postmortem.', src: 5 },
      { when: '2019', who: 'SoundCloud', title: 'Alerting on SLOs like Pros', text: 'Björn Rabenstein describes doing this with Prometheus and finding that the Workbook chapter described what they were already doing. Their table adds a <b>3× over 1 d / 2 h</b> ticket tier next to the Workbook\'s three.', src: 7 },
      { when: '2016–2022', who: 'Zalando', title: 'From service SLOs to business-operation SLOs', text: 'Zalando introduced SLOs with SRE in 2016, later built tooling that shows the <b>error budget</b> next to each SLO, and moved to SLOs on <b>critical business operations</b> with multi-window burn-rate paging.', src: 8 },
      { when: '2020s', who: 'Mattermost · OpenSLO', title: 'SLOs as code', text: 'Mattermost generates its SLIs, SLOs and burn-rate alerts with <b>Sloth</b>, even wiring it into its provisioner so every new cloud workspace gets SLOs. The vendor-neutral <b>OpenSLO</b> spec describes SLOs in YAML that many tools can read.', src: 10 }
    ],
    lessons: [
      'Start from <b>user journeys</b>, not from the metrics you already have.',
      'Pick a target users are happy with, then <b>write down the policy</b> before you need it.',
      'Alert on <b>burn rate</b> with a long window for significance and a short one for fast reset.',
      'Generate the rules from an <b>SLO spec</b> so every team uses the same, reviewed math.',
      'Review SLOs regularly: a target nobody revisits drifts away from what users need.'
    ],
    sources: [
      { title: 'Chapter 3 - Embracing Risk', url: 'https://sre.google/sre-book/embracing-risk/', pub: 'Google, Site Reliability Engineering (2016)' },
      { title: 'Chapter 4 - Service Level Objectives', url: 'https://sre.google/sre-book/service-level-objectives/', pub: 'Google, Site Reliability Engineering (2016)' },
      { title: 'Chapter 5 - Eliminating Toil', url: 'https://sre.google/sre-book/eliminating-toil/', pub: 'Google, Site Reliability Engineering (2016)' },
      { title: 'Chapter 2 - Implementing SLOs', url: 'https://sre.google/workbook/implementing-slos/', pub: 'Google, The Site Reliability Workbook (2018)' },
      { title: 'Chapter 5 - Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/', pub: 'Google, The Site Reliability Workbook (2018)' },
      { title: 'Appendix B - Example Error Budget Policy', url: 'https://sre.google/workbook/error-budget-policy/', pub: 'Google, The Site Reliability Workbook (2018)' },
      { title: 'SRE fundamentals 2021: SLIs vs SLAs vs SLOs', url: 'https://cloud.google.com/blog/products/devops-sre/sre-fundamentals-sli-vs-slo-vs-sla/', pub: 'Google Cloud blog, 2021' },
      { title: 'Alerting on SLOs like Pros', url: 'https://developers.soundcloud.com/blog/alerting-on-slos/', pub: 'SoundCloud Backstage blog, 2019' },
      { title: 'Tracing SRE\'s journey in Zalando - Part III', url: 'https://engineering.zalando.com/posts/2021/10/sre-journey-part3.html', pub: 'Zalando Engineering, 2021' },
      { title: 'Operation-Based SLOs', url: 'https://engineering.zalando.com/posts/2022/04/operation-based-slos.html', pub: 'Zalando Engineering, 2022' },
      { title: 'How We Use Sloth to do SLO Monitoring and Alerting with Prometheus', url: 'https://mattermost.com/blog/sloth-for-slo-monitoring-and-alerting-with-prometheus/', pub: 'Mattermost blog' },
      { title: 'OpenSLO specification', url: 'https://github.com/OpenSLO/OpenSLO', pub: 'OpenSLO project, GitHub' },
      { title: 'Sloth: Prometheus SLO generator', url: 'https://github.com/slok/sloth', pub: 'GitHub' },
      { title: 'Appendix A - Example SLO Document', url: 'https://sre.google/workbook/slo-document', pub: 'Google, The Site Reliability Workbook (2018)' },
      { title: 'Chapter 3 - SLO Engineering Case Studies (Evernote, Home Depot)', url: 'https://sre.google/workbook/slo-engineering-case-studies/', pub: 'Google, The Site Reliability Workbook (2018)' },
      { title: 'Spring Boot reference: Metrics (per-meter properties)', url: 'https://docs.spring.io/spring-boot/reference/actuator/metrics.html', pub: 'Spring Boot docs' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['SLO window', '<b>Rolling (28 d)</b>: smooth, bad days age out; every weekday counted 4×', '<b>Calendar month</b>: matches SLA and business reporting; resets on the 1st', 'Rolling for operations and alerting; calendar for SLA reports and reviews'],
      ['SLI type', '<b>Request-based</b>: good requests ÷ valid requests', '<b>Windows-based</b>: good minutes ÷ total minutes (a minute is good if p99 &lt; 300 ms)', 'Request-based for high traffic; windows-based for low traffic or when one heavy user should not dominate'],
      ['Alerting', '<b>Static threshold</b>: simple, familiar', '<b>Multi-window burn rate</b>: ties alerts to budget impact', 'Burn rate almost always; static only for hard limits like disk full'],
      ['Target', '<b>Tighter (99.99%)</b>: happier edge-case users', '<b>Looser (99.9%)</b>: 10× more budget for change', 'Start at what users accept today, tighten only with evidence (tickets, churn)'],
      ['Policy', '<b>Soft</b>: budget informs priorities', '<b>Enforced freeze</b>: automatic release gate', 'Soft while trust builds; enforced when the policy is signed by leadership'],
      ['Where to measure', '<b>Server / load balancer</b>: cheap, precise', '<b>Client (RUM) / synthetic probes</b>: sees DNS, CDN, network', 'LB for the SLO, plus probes or RUM to catch what the LB cannot see']
    ]
  },
  failures: [
    { f: 'SLO set to today\'s best performance', detect: 'Budget always near zero; permanent freeze; teams ignore the policy', fix: 'Set the target from user needs, not history. Loosen it, and buy reliability with engineering, not with a number.' },
    { f: 'SLI misses failures users see', detect: 'Users complain while dashboards are green (DNS, CDN or LB errors never reach the app)', fix: 'Measure at the load balancer or with client telemetry and synthetic probes; count timeouts as bad.' },
    { f: 'Alert fatigue from static thresholds', detect: 'Pages per shift high; many pages need no action', fix: 'Replace with multi-window burn-rate alerts; route slow burns to tickets.' },
    { f: 'Low-traffic service: one error = huge burn', detect: 'Night-time pages from 1 failure in 20 requests', fix: 'Windows-based SLIs, synthetic traffic, longer windows, or a minimum request count in the alert.' },
    { f: 'Policy on paper only', detect: 'Budget exhausted for months; releases continue unchanged', fix: 'Get the policy signed by product leadership with an escalation path; make the release gate check the budget.' },
    { f: 'Dependency below your SLO', detect: 'Budget spent mostly on one dependency\'s errors in the ledger', fix: 'Make the call soft (cache, async, fallback), add redundancy, or negotiate the dependency\'s SLO.' },
    { f: 'Gaming the SLI (Goodhart)', detect: 'More errors reclassified as "invalid"; SLI improves while tickets rise', fix: 'Review exclusions in the SLO review; validate the SLI against support tickets and user research.' }
  ],

  interview: [
    { q: 'What is the difference between an SLI, an SLO and an SLA?', a: '<ul><li><b>SLI</b>: a measurement, ideally good events ÷ valid events (e.g. checkout requests that returned 2xx in &lt; 300 ms ÷ all valid checkout requests).</li><li><b>SLO</b>: an internal target for that SLI over a window: 99.9% over 28 days.</li><li><b>SLA</b>: an external contract with consequences (credits) if missed.</li></ul><p>The SLA is <b>looser</b> than the SLO, so you burn through the SLO and react long before you owe customers money.</p>', lvl: 'core' },
    { q: 'Why not target 100%?', a: '<p>Users cannot tell 99.99% from 100%: their phone, Wi-Fi and ISP fail more often than that. Each extra nine costs far more (redundancy, slower change) for a benefit nobody feels.</p><p>And 100% leaves <b>zero budget for change</b>, while most outages are caused by changes. A 100% target means never shipping.</p>', fu: 'Is there any system where 100% is the right goal? (Safety-critical parts like pacemakers, and even there you design for failure.)', lvl: 'core' },
    { q: 'How would you choose SLIs for a checkout service?', a: '<p>Start from <b>user journeys</b> (browse, add to cart, pay) and ask what "good" means for each:</p><ul><li><b>Availability</b>: share of valid requests that did not fail (5xx, timeouts).</li><li><b>Latency</b>: share served under a threshold, e.g. 99% &lt; 300 ms. Thresholds beat averages.</li><li><b>Correctness</b>: orders with the right total (sampled or reconciled).</li><li><b>Freshness</b> for data pipelines: share of reads using data &lt; 10 min old.</li></ul><p>Keep it to a few SLIs per journey, measured as close to the user as is practical.</p>', lvl: 'core' },
    { q: 'A 99.9% SLO over 30 days at 1M requests per day: what is the budget?', a: '<p>Time: 0.1% × 30 × 24 × 60 = <b>43.2 minutes</b> of full outage.</p><p>Requests: 30M × 0.1% = <b>30,000 failed requests</b>. Request-based budgets are more honest: a 2-hour, 1% partial outage spends 1.2 "minutes", not 120.</p>', lvl: 'core' },
    { q: 'What is burn rate, and why multi-window, multi-burn-rate alerts?', a: '<p>Burn rate = observed error rate ÷ (1 − SLO). At 1× you spend exactly the budget by the end of the window.</p><p>Workbook design for a 30-day window: page if <b>2% of the budget is spent in 1 h</b> (burn 0.02 × 720 ÷ 1 = <b>14.4×</b>) or 5% in 6 h (<b>6×</b>); ticket if 10% in 3 days (<b>1×</b>).</p><p>Each alert also needs a <b>short window</b> (1/12 of the long one: 5 m, 30 m, 6 h) over the same threshold, so the alert stops firing soon after the problem is fixed. Long window = significance, short window = "still happening".</p>', fu: 'How fast does the 14.4× alert fire for a full outage at 99.9%? (0.1% × 14.4 × 60 min ≈ 52 s.)', lvl: 'deep' },
    { q: 'Request-based or windows-based SLIs? What about low-traffic services?', a: '<p><b>Request-based</b> (good ÷ valid requests) weights by traffic, so it fits busy services.</p><p><b>Windows-based</b> counts good minutes (a minute is good if its error rate or p99 is under target). It suits low traffic and treats a quiet hour the same as a busy one.</p><p>For low traffic, one failed request out of 20 is a 5% error rate, which is a huge burn. Use synthetic traffic, longer windows, a minimum event count, or group small services into one SLO.</p>', lvl: 'deep' },
    { q: 'Rolling or calendar windows?', a: '<p><b>Rolling</b> (e.g. 28 days: four whole weeks, so every weekday counts the same) gives a smooth, current view; an outage ages out after 28 days. Best for alerting and release gates.</p><p><b>Calendar</b> windows match contracts and business reviews but reset on the 1st, so the same outage matters more early in the month. Many teams use rolling internally and calendar for the SLA.</p>', lvl: 'core' },
    { q: 'Checkout calls three hard dependencies, each at 99.9%. What SLO can you promise?', a: '<p>If any failure fails checkout, availability ≈ 0.999³ ≈ <b>99.7%</b>, before checkout\'s own bugs. You cannot promise 99.95%.</p><p>Options: make dependencies <b>soft</b> (cache, fallback, async capture via a queue), add redundancy (two providers), use retries within a deadline, or ask the platform for a stricter internal SLO. Show this arithmetic before agreeing to any target.</p>', lvl: 'deep' },
    { q: 'What goes into an error budget policy, and why does it matter?', a: '<ul><li>What happens when the budget is exhausted (freeze features, only P0 and security fixes ship).</li><li>Thresholds for postmortems (e.g. a single incident &gt; 20% of the budget).</li><li>How releases resume (back within SLO in the rolling window).</li><li>Exceptions and escalation (who decides when product and SRE disagree).</li><li>Signatures from product, development and SRE leadership.</li></ul><p>It turns a future argument into a decision made calmly in advance. Without it, the budget is only a chart.</p>', lvl: 'core' },
    { q: 'How do SLOs work for an internal platform like Kafka or Kubernetes?', a: '<p>Write them from the <b>consumer\'s point of view</b>: "99.95% of produce requests are acknowledged in &lt; 50 ms", "99.9% of pod scheduling completes in &lt; 30 s". Publish them so product teams can compute composite SLOs.</p><p>The platform\'s budget policy protects its consumers: risky upgrades wait when the budget is low. Review with the biggest consumers each quarter.</p>', lvl: 'deep' },
    { q: 'Behavioural: tell me about convincing a product leader to accept a release freeze.', a: '<p><b>Situation</b>: a payments API had used 140% of its 28-day budget after three deploy-related incidents; a big launch was two weeks away.</p><p><b>Task</b>: pause features without a political fight and protect the launch.</p><p><b>Action</b>: I showed the budget ledger (80% spent by deploys without canaries), pointed to the policy the VP had signed, and offered a <b>two-week reliability sprint</b> with a clear exit: back within SLO plus automated canary analysis. I agreed a narrow exception for one launch-critical change behind a feature flag.</p><p><b>Result</b>: the budget recovered in 12 days, the launch went out on time, and deploy-caused incidents dropped over the next quarter.</p>', lvl: 'deep' },
    { q: 'Behavioural: how did you introduce SLOs to a team drowning in alerts?', a: '<p><b>Situation</b>: on-call got about 30 pages a week, most needing no action, and engineers were muting alerts.</p><p><b>Task</b>: cut noise without missing real incidents.</p><p><b>Action</b>: workshop with product to pick two journeys and SLIs; started with targets at current performance minus a margin; generated multi-window burn-rate rules with Sloth; ran the new alerts in shadow mode for two weeks next to the old ones; deleted cause-based pages that never matched a real budget loss.</p><p><b>Result</b>: pages dropped to a few per week, every incident in the shadow period was still caught, and the team adopted a soft error budget policy at the next quarterly review.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Prometheus: recording rules + multi-window burn-rate alerts (99.9%)', lang: 'yaml',
      code: `groups:
- name: checkout-slo-recording
  rules:
  # error ratio = bad / valid, one rule per window (5m, 30m, 1h, 6h, 3d)
  - record: job:slo_errors_per_request:ratio_rate5m
    expr: |
      sum by (job) (rate(http_server_requests_seconds_count{job="checkout",status=~"5.."}[5m]))
      / sum by (job) (rate(http_server_requests_seconds_count{job="checkout"}[5m]))
  # ...repeat with [30m], [1h], [6h], [3d] -> ratio_rate30m, _rate1h, _rate6h, _rate3d

- name: checkout-slo-alerts
  rules:
  - alert: CheckoutErrorBudgetBurn
    expr: |
      (job:slo_errors_per_request:ratio_rate1h{job="checkout"} > (14.4 * 0.001)
       and job:slo_errors_per_request:ratio_rate5m{job="checkout"} > (14.4 * 0.001))
      or
      (job:slo_errors_per_request:ratio_rate6h{job="checkout"} > (6 * 0.001)
       and job:slo_errors_per_request:ratio_rate30m{job="checkout"} > (6 * 0.001))
    labels:
      severity: page
    annotations:
      summary: "Checkout is burning its 30-day error budget fast"
      runbook_url: https://runbooks.example.com/checkout/slo
  - alert: CheckoutErrorBudgetBurn
    expr: |
      job:slo_errors_per_request:ratio_rate3d{job="checkout"} > (1 * 0.001)
      and job:slo_errors_per_request:ratio_rate6h{job="checkout"} > (1 * 0.001)
    labels:
      severity: ticket`,
      note: 'Thresholds are from the SRE Workbook table for a 30-day window: 14.4× (1 h / 5 m) and 6× (6 h / 30 m) page, 1× (3 d / 6 h) tickets. <code>0.001</code> is 1 − 0.999. A raw <code>[3d]</code> rate is expensive on busy series; many setups derive long windows from shorter recorded ratios, or let Sloth/Pyrra generate them.'
    },
    {
      title: 'Sloth spec: the SLO as code (generates the rules above)', lang: 'yaml',
      code: `# sloth generate -i checkout-slo.yaml -o checkout-rules.yaml
version: "prometheus/v1"
service: "checkout"
labels:
  owner: "payments-team"
slos:
  - name: "requests-availability"
    objective: 99.9                      # percent, over Sloth's default 30d window
    description: "Checkout requests that do not fail with 5xx."
    sli:
      events:
        error_query: sum(rate(http_server_requests_seconds_count{job="checkout",status=~"5.."}[{{.window}}]))
        total_query: sum(rate(http_server_requests_seconds_count{job="checkout"}[{{.window}}]))
    alerting:
      name: CheckoutHighErrorRate
      labels:
        category: "availability"
      annotations:
        runbook: "https://runbooks.example.com/checkout/slo"
      page_alert:
        labels:
          severity: page
      ticket_alert:
        labels:
          severity: ticket`,
      note: 'Sloth fills <code>{{.window}}</code> for every window and writes the recording rules plus multi-window, multi-burn-rate page and ticket alerts. The same SLO can be written in the vendor-neutral <b>OpenSLO</b> format (<code>kind: SLO</code> with a <code>ratioMetric</code> indicator, <code>timeWindow</code> and <code>objectives</code>), which other tools read.'
    },
    {
      title: 'Spring Boot 3: latency SLO buckets for the SLI', lang: 'java',
      code: `// application.yml — publish exact buckets at the SLO thresholds
// management:
//   endpoints.web.exposure.include: health,prometheus
//   metrics.distribution.slo:
//     "[http.server.requests]": 100ms,300ms,1s
//
// Prometheus then exposes http_server_requests_seconds_bucket{le="0.3"}.
// Latency SLI (share of requests served in <= 300 ms):
//   sum(rate(http_server_requests_seconds_bucket{job="checkout",le="0.3"}[5m]))
//   / sum(rate(http_server_requests_seconds_count{job="checkout"}[5m]))

@Component
public class PaymentClientMetrics {
  private final Timer timer;

  public PaymentClientMetrics(MeterRegistry registry) {
    this.timer = Timer.builder("payment.provider.calls")
        .description("Calls to the external payment provider")
        .serviceLevelObjectives(Duration.ofMillis(300), Duration.ofSeconds(1))
        .register(registry);
  }

  public <T> T record(Supplier<T> call) {
    return timer.record(call);          // also counts the call in _count
  }
}`,
      note: '<code>management.metrics.distribution.slo</code> is a per-meter property in Spring Boot 3 (the brackets keep the dots in the meter name). SLO boundaries add only the buckets you ask for, unlike <code>percentiles-histogram</code>, which adds dozens.'
    },
    {
      title: 'Python: error budget and alert tier calculator', lang: 'python',
      code: `from dataclasses import dataclass

# (budget fraction, long window h, short window h, severity) — SRE Workbook
TIERS = [(0.02, 1, 5 / 60, "page"), (0.05, 6, 0.5, "page"), (0.10, 72, 6, "ticket")]

@dataclass
class Budget:
    slo: float            # e.g. 0.999
    window_days: int      # e.g. 30
    rps: float            # average valid requests per second

    @property
    def allowed(self) -> float:
        return 1 - self.slo

    def minutes(self) -> float:
        return self.window_days * 24 * 60 * self.allowed

    def bad_requests(self) -> float:
        return self.rps * self.window_days * 86_400 * self.allowed

    def burn_rate(self, error_rate: float) -> float:
        return error_rate / self.allowed

    def hours_to_exhaust(self, error_rate: float, used: float = 0.0) -> float:
        return (1 - used) * self.window_days * 24 / self.burn_rate(error_rate)

    def severity(self, err_long: float, err_short: float) -> str | None:
        hours = self.window_days * 24
        for frac, long_h, _short_h, sev in TIERS:
            threshold = frac * hours / long_h       # 14.4, 6, 1 for 30 days
            if min(self.burn_rate(err_long), self.burn_rate(err_short)) >= threshold:
                return sev
        return None

b = Budget(slo=0.999, window_days=30, rps=200)
print(round(b.minutes(), 1), round(b.bad_requests()))  # 43.2 518400
print(round(b.burn_rate(0.02), 1), b.severity(0.02, 0.03))  # 20.0 page
print(round(b.hours_to_exhaust(0.003, used=0.25)))     # 180 (7.5 days at 3x)`
    }
  ],

  related: ['observability-pillars', 'incident-management', 'reliability-math', 'chaos-engineering', 'disaster-recovery', 'sd:observability']
});
