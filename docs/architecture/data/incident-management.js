SD.register({
  slug: 'incident-management',
  domain: 8,
  title: 'Incident Management & Postmortems',
  examples: 'PagerDuty, Google SRE',
  tagline: 'Run an outage calmly with <b>clear roles</b>, <b>stop the bleeding first</b>, keep people informed, then <b>learn from it without blame</b> so the same thing does not happen again.',
  tldr: {
    problem: `Production breaks. Ten engineers jump into one chat channel, three of them change things at once, nobody tells customers or support, and the fix waits until someone finds the root cause. Afterwards one person gets blamed, and the same failure returns in three months.`,
    idea: `Treat incidents as a <b>practised process</b>: symptom-based alerts page one on-call, an <b>Incident Commander</b> coordinates while an <b>Ops lead</b> fixes, a <b>Comms lead</b> updates a status page on a fixed cadence and a <b>Scribe</b> keeps the timeline. <b>Mitigate first</b> (roll back, fail over, shed load), diagnose later. Then write a <b>blameless postmortem</b> with tracked action items.`,
    insight: `Most of an outage is rarely the fix itself: it is <b>detection, getting the right people, and deciding</b>. Roles and a default of "roll back first" cut those phases. And MTTR is a weak scorecard: incident durations are skewed and noisy, so judge the practice by what you <b>learn and change</b>.`,
    numbers: [
      { v: '4 roles', l: 'IC, Ops lead, Comms lead, Scribe/Planning: Google SRE adapts the Incident Command System' },
      { v: '27 min', l: 'Cloudflare\'s 2 July 2019 global outage from one WAF regex (Cloudflare postmortem)' },
      { v: '883 sites', l: 'deleted by one script at Atlassian in April 2022; restoring all took up to 14 days (Atlassian PIR)' }
    ]
  },

  intro: {
    what: `Incident management is the agreed way a company <b>responds when a live service is broken</b>: how it notices, who is in charge, who fixes, who talks to customers, and when it is over. A <b>postmortem</b> (also called a post-incident review) is the written review afterwards that explains what happened and what will change, <b>without blaming individuals</b>.`,
    analogy: {
      icon: '🚒',
      title: 'A fire brigade at a building fire',
      text: `One officer takes <b>command</b> and does not hold a hose. Crews are assigned tasks, a radio operator keeps the log, and a spokesperson talks to the press and residents. Their first job is to <b>stop the fire spreading</b>, not to find out who left the stove on. The investigation comes later and is about fixing building codes, not punishing the cook. The analogy breaks in one place: in software you can often <b>undo</b> the cause (roll back a deploy) in minutes, which a fire brigade never can.`
    },
    problem: `A checkout deploy at 14:02 starts failing 30% of payments. Customers notice first and tweet. Engineers debate in a busy channel, two of them restart different services, the CTO messages everyone for updates, and the root cause is found at 15:40. Nobody rolled back because nobody was clearly in charge. The question this topic answers: <b>how do we shorten the outage, keep everyone informed, and make sure it never repeats the same way?</b>`,
    story: [
      {
        stage: 'naive',
        title: 'Everyone jumps in',
        text: `An alert or a customer complaint lands in a shared channel. Whoever sees it starts debugging. It feels fast and heroic: lots of smart people working on the problem at once.`,
        scene: {
          nodes: [
            { id: 'svc', label: 'Checkout', sub: '30% errors', kind: 'service', at: [210, 0] },
            { id: 'a', label: 'Engineer A', sub: 'debugging', kind: 'person', at: [70, 110] },
            { id: 'b', label: 'Engineer B', sub: 'debugging', kind: 'person', at: [210, 110] },
            { id: 'c', label: 'Engineer C', sub: 'restarting', kind: 'person', at: [350, 110] }
          ],
          edges: [{ from: 'a', to: 'svc' }, { from: 'b', to: 'svc' }, { from: 'c', to: 'svc' }],
          flow: [['a>svc', 'b>svc', 'c>svc']],
          warn: ['svc']
        }
      },
      {
        stage: 'breaks',
        title: 'Nobody is in charge',
        text: `Two people change production at the same time and make it worse. Nobody updates customers, so support and executives interrupt the engineers. The fix waits for a root cause, and a rollback that would have worked in 5 minutes is never tried.`,
        scene: {
          nodes: [
            { id: 'svc', label: 'Checkout', sub: 'now 60% errors', kind: 'service', at: [210, 0] },
            { id: 'a', label: 'Engineer A', sub: 'hunting cause', kind: 'person', at: [70, 110] },
            { id: 'b', label: 'Engineer B', sub: 'config change', kind: 'person', at: [210, 110] },
            { id: 'c', label: 'Engineer C', sub: 'restarting', kind: 'person', at: [350, 110] },
            { id: 'cto', label: 'Execs + support', sub: '"any update?"', kind: 'team', at: [210, 220] }
          ],
          edges: [{ from: 'b', to: 'svc' }, { from: 'c', to: 'svc' }, { from: 'cto', to: 'a' }, { from: 'cto', to: 'b' }, { from: 'cto', to: 'c' }],
          flow: [['b>svc', 'c>svc'], ['cto>a', 'cto>b', 'cto>c']],
          err: ['svc'], warn: ['a', 'b', 'c'],
          badges: { svc: ['98 min', 'err'], cto: ['interrupting', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Command, roles, mitigate first',
        text: `The on-call declares an incident and becomes <b>Incident Commander</b>. One <b>Ops lead</b> rolls back the 14:02 deploy. A <b>Comms lead</b> posts status updates every 30 minutes, so nobody needs to interrupt. Root cause waits for the <b>blameless postmortem</b>.`,
        scene: {
          nodes: [
            { id: 'svc', label: 'Checkout', sub: 'rolled back', kind: 'service', at: [210, 0] },
            { id: 'a', label: 'Ops lead', sub: 'rollback', kind: 'person', at: [70, 110] },
            { id: 'b', label: 'Incident Cmdr', sub: 'coordinates', kind: 'person', at: [210, 110] },
            { id: 'c', label: 'Comms lead', sub: 'every 30 min', kind: 'person', at: [350, 110] },
            { id: 'cto', label: 'Status page', sub: 'execs + users', kind: 'external', at: [350, 220] }
          ],
          edges: [{ from: 'b', to: 'a' }, { from: 'a', to: 'svc' }, { from: 'b', to: 'c' }, { from: 'c', to: 'cto' }],
          flow: ['b>a', 'a>svc', 'b>c', 'c>cto'],
          ok: ['svc', 'b'],
          badges: { svc: ['18 min', 'ok'] }
        }
      }
    ],
    usedBy: ['Google SRE', 'PagerDuty', 'Etsy', 'GitLab', 'Cloudflare', 'Atlassian', 'Most cloud providers (public status pages)'],
    whenToUse: [
      'You run a <b>production service</b> that customers depend on, with an on-call rota',
      'More than one team can be needed to fix an outage, so <b>coordination</b> becomes the bottleneck',
      'Incidents <b>repeat</b>, or postmortems produce action items that never get done'
    ],
    whenNot: [
      'A minor, single-owner bug with no user impact: file a ticket, do not declare an incident and wake people',
      'Do not use a postmortem to decide performance reviews or discipline; that destroys honest reporting',
      'If the real gap is that you cannot see the problem, start with <a href="observability-pillars.html">Observability</a> and <a href="slo-error-budgets.html">SLOs & error budgets</a>'
    ],
    glossary: [
      { term: 'Incident', def: 'An unplanned event that degrades a service enough to need a coordinated, urgent response.' },
      { term: 'Severity (SEV)', def: 'A level, usually SEV1 (worst) to SEV3 or SEV4, set by user impact, that decides who is paged and how often to communicate.' },
      { term: 'Incident Commander (IC)', def: 'The single person who coordinates the response, delegates roles and makes decisions; the IC does not type fixes.' },
      { term: 'Mitigation', def: 'Any action that stops user impact (roll back, fail over, disable a feature, shed load) without necessarily understanding the cause.' },
      { term: 'MTTA / MTTR', def: 'Mean time to acknowledge a page, and mean time to restore (or resolve) service.' },
      { term: 'Blameless postmortem', def: 'A written review that explains how the system and the work allowed the failure, without punishing the people involved.' },
      { term: 'Contributing factor', def: 'One of several conditions that together made the incident possible; preferred over a single "root cause".' },
      { term: 'Action item', def: 'A tracked, owned and dated change that comes out of a postmortem.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Detect from symptoms</b>: page on user-facing SLO burn (errors, latency), not on every CPU spike',
      '<b>Declare early, with a severity</b>: anyone may declare; downgrading later is cheap, a late declaration is not',
      '<b>One Incident Commander</b>: delegates Ops, Comms and Scribe; holds every role not yet delegated; hands off explicitly',
      '<b>Mitigate first</b>: roll back, fail over, flag off or shed load before searching for the root cause',
      '<b>Communicate on a cadence</b>: internal and status-page updates at a fixed interval set by severity, even when there is no news',
      '<b>Learn without blame</b>: a written postmortem for every SEV1/SEV2, with contributing factors and owned, dated action items'
    ],
    nonFunctional: [
      '<b>Time to detect</b> for SEV1: alert before customers notice (target minutes, from burn-rate alerts)',
      '<b>Time to acknowledge</b> a page: within 5 minutes for high urgency (common target, rule of thumb)',
      '<b>Update cadence</b>: SEV1 every 30 min, SEV2 every 60 min (typical policy, adjust to your users)',
      '<b>Postmortem draft</b> within 5 business days; review meeting held; published internally to everyone',
      '<b>Action items</b>: ≥ 80% of priority items closed by due date (rule of thumb; track it)',
      '<b>On-call load</b>: few enough pages that each one gets a real investigation; the SRE book caps on-call at about 25% of an SRE\x27s time (rule of thumb)'
    ],
    outOfScope: [
      '<b>Hero culture</b>: the same two people fix everything and nobody else learns',
      '<b>Blame and "human error"</b> as the conclusion: people stop reporting and hide near misses',
      '<b>Root cause before mitigation</b>: debugging while users are still failing',
      '<b>Write-only postmortems</b>: documents nobody reads, action items nobody tracks',
      '<b>MTTR as a team target</b>: it is gamed (late declaration, early closing) and says little about reliability'
    ]
  },

  calculator: {
    inputs: [
      { id: 'det', label: 'Detection (failure starts → alert fires)', min: 0, max: 120, value: 8, unit: 'min' },
      { id: 'ack', label: 'Acknowledge (alert → human engaged)', min: 0, max: 60, value: 4, unit: 'min' },
      { id: 'dia', label: 'Diagnosis (engaged → mitigation chosen)', min: 0, max: 240, value: 20, unit: 'min' },
      { id: 'mit', label: 'Mitigation (action → impact gone)', min: 1, max: 120, value: 10, unit: 'min' },
      { id: 'n', label: 'User-impacting incidents per month', min: 0, max: 30, value: 3 },
      { id: 'rps', label: 'Failing requests per second during an incident', min: 1, max: 100000, value: 500, log: true, fmt: 'num' }
    ],
    outputs: [
      { label: 'Where the time goes (detect · ack · diagnose · mitigate)', fmt: 'raw', f: (v) => { const t = v.det + v.ack + v.dia + v.mit; const p = (x) => Math.round(100 * x / t) + '%'; return p(v.det) + ' · ' + p(v.ack) + ' · ' + p(v.dia) + ' · ' + p(v.mit); } },
      { label: 'Time to restore per incident (TTD + TTA + diagnose + mitigate)', unit: 'min', f: (v) => v.det + v.ack + v.dia + v.mit },
      { label: 'Impact minutes per month', unit: 'min', f: (v) => v.n * (v.det + v.ack + v.dia + v.mit) },
      { label: 'Failed requests per month', fmt: 'num', f: (v) => Math.round(v.n * (v.det + v.ack + v.dia + v.mit) * 60 * v.rps) },
      { label: '99.9% monthly error budget used (if incidents fail 30% of traffic)', fmt: 'pct', f: (v) => v.n * (v.det + v.ack + v.dia + v.mit) * 0.3 / 43.2 },
      { label: 'Pages per week (≈ 4 pages per incident incl. escalations + noise)', f: (v) => Math.round(v.n * 12 / 52 * 4 * 10) / 10 }
    ],
    note: `Time to restore is the sum of the four phases; the first two are pure waiting and are cut by <b>better alerts and paging</b>, the third by <b>roles and a roll-back-first default</b>. A 99.9% SLO over 30 days allows <b>43.2 minutes</b> of full outage; an incident that fails 30% of requests burns that budget at 0.3× speed. The pages-per-incident factor of 4 is an <em>estimate</em>: replace it with your own alert counts. Remember that a <b>mean</b> of skewed durations is dominated by a few long incidents; look at medians and the long tail too.`
  },

  api: [
    { m: 'POLICY', p: 'Severity matrix', d: 'SEV1: many users cannot use a core function, or data loss / security. SEV2: significant degradation or one major customer. SEV3: minor, workaround exists. For each: who is paged, IC required?, update cadence, status page?, postmortem required?' },
    { m: 'DOC', p: 'Incident roles & handoff rules', d: '<b>IC</b> coordinates and decides; <b>Ops lead</b> is the only one changing production; <b>Comms lead</b> owns internal and external updates; <b>Scribe</b> keeps the timeline. Handoffs are explicit: "you are now IC", acknowledged on the call.' },
    { m: 'YAML', p: 'Alert routing & escalation policy', d: 'Alertmanager or PagerDuty: SEV1 pages the primary on-call immediately, escalates to secondary after 5 min and to the IC rota after 10; low urgency goes to a ticket queue, not a phone.' },
    { m: 'DOC', p: 'Status page & update template', d: 'What is affected, since when, what we are doing, next update time. Plain language, no blame, no guessed ETAs. Posted within minutes of declaring a customer-facing SEV1.' },
    { m: 'DOC', p: 'Blameless postmortem', d: 'Summary, impact (users, duration, budget), timeline, contributing factors, what went well, where we got lucky, action items with owner, priority and due date. Reviewed in a meeting; published widely.' },
    { m: 'SQL', p: 'Incident & action-item records', d: 'Timestamps for start, detect, ack, mitigate, resolve; severity; links to postmortem; action items with status. Feeds review of trends (not leaderboards).' }
  ],
  dataModel: [
    { name: 'incidents', store: 'Postgres / incident tool', fields: [['id', 'bigint', 'pk'], ['sev', 'smallint', 'idx'], ['started_at', 'timestamptz'], ['detected_at', 'timestamptz'], ['acked_at', 'timestamptz'], ['mitigated_at', 'timestamptz'], ['resolved_at', 'timestamptz'], ['commander', 'text'], ['service', 'text', 'idx']], note: 'Keep every timestamp, not just "duration": the phases tell you where to invest.' },
    { name: 'timeline_events', store: 'Postgres / chat export', fields: [['incident_id', 'bigint', 'fk'], ['at', 'timestamptz', 'idx'], ['kind', 'alert | decision | action | update'], ['author', 'text'], ['text', 'text']], note: 'Written by the Scribe or a chat bot during the incident; the postmortem timeline is built from it.' },
    { name: 'action_items', store: 'Issue tracker', fields: [['id', 'text', 'pk'], ['incident_id', 'bigint', 'fk'], ['owner_team', 'text', 'idx'], ['priority', 'P0 | P1 | P2'], ['due', 'date', 'idx'], ['status', 'open | done | wontfix']], note: 'Review overdue items weekly. A repeat incident with an open action item is the strongest signal you have.' },
    { name: 'pages', store: 'Paging tool export', fields: [['id', 'text', 'pk'], ['alert', 'text', 'idx'], ['at', 'timestamptz'], ['oncall', 'text'], ['actionable', 'bool']], note: 'Feeds on-call health: pages per shift, out-of-hours pages, share of non-actionable alerts.' }
  ],

  architecture: {
    title: 'Incident response: signals, roles and the learning loop',
    nodes: [
      { id: 'svc', label: 'Production svc', sub: 'checkout · 30% errors', kind: 'service', wide: [300, 40], tall: [70, 0], tip: 'The thing that is broken. Only the Ops lead changes it during the incident.' },
      { id: 'mon', label: 'SLO alerting', sub: 'burn-rate alerts', kind: 'compute', wide: [500, 40], tall: [210, 0], tip: 'Alerts on user-facing symptoms (error rate, latency vs SLO), not on causes like CPU.' },
      { id: 'pager', label: 'Paging', sub: 'PagerDuty / Alertmanager', kind: 'external', wide: [700, 40], tall: [350, 0], tip: 'Routes by service and severity; escalates if nobody acknowledges.' },
      { id: 'oncall', label: 'On-call engineer', sub: 'acks · declares SEV', kind: 'person', wide: [900, 40], tall: [350, 105], tip: 'First responder. Acknowledges, assesses impact, declares the incident and its severity.' },
      { id: 'ops', label: 'Ops lead', sub: 'only one changing prod', kind: 'person', wide: [300, 150], tall: [70, 105], tip: 'Leads the technical work; the only person (or team) applying changes, to avoid conflicting fixes.' },
      { id: 'ic', label: 'Incident Cmdr', sub: 'coordinates · decides', kind: 'person', wide: [600, 150], tall: [210, 105], tip: 'Holds the big picture, delegates roles, decides (e.g. roll back now), does not type fixes.' },
      { id: 'comms', label: 'Comms lead', sub: 'updates on cadence', kind: 'person', wide: [860, 150], tall: [350, 210], tip: 'Sends updates to execs, support and customers at a fixed interval, shielding responders from interruptions.' },
      { id: 'scribe', label: 'Scribe', sub: 'live timeline', kind: 'person', wide: [400, 260], tall: [70, 210], tip: 'Records decisions and actions with timestamps. Not a stenographer: the useful facts.' },
      { id: 'stake', label: 'Execs & support', sub: 'internal channel', kind: 'team', wide: [640, 260], tall: [210, 210], tip: 'Get their updates from the Comms lead instead of messaging engineers.' },
      { id: 'status', label: 'Status page', sub: 'public updates', kind: 'external', wide: [860, 260], tall: [350, 315], tip: 'Public, plain-language updates with the next update time.' },
      { id: 'pm', label: 'Postmortem', sub: 'blameless review', kind: 'policy', wide: [400, 370], tall: [70, 315], tip: 'Built from the Scribe\'s timeline: impact, contributing factors, what went well, action items.' },
      { id: 'actions', label: 'Action items', sub: 'owned · dated', kind: 'store', wide: [640, 370], tall: [70, 420], tip: 'Tracked in the issue tracker and reviewed until done.' },
      { id: 'users', label: 'Customers', sub: 'see impact + updates', kind: 'client', wide: [860, 370], tall: [350, 420], tip: 'Trust depends as much on honest, regular updates as on the outage length.' }
    ],
    edges: [
      { from: 'svc', to: 'mon' },
      { from: 'mon', to: 'pager' },
      { from: 'pager', to: 'oncall' },
      { from: 'oncall', to: 'ic', label: 'declare' },
      { from: 'ic', to: 'ops' },
      { from: 'ops', to: 'svc', label: 'mitigate' },
      { from: 'ic', to: 'comms' },
      { from: 'ic', to: 'scribe' },
      { from: 'comms', to: 'stake' },
      { from: 'comms', to: 'status' },
      { from: 'status', to: 'users' },
      { from: 'scribe', to: 'pm' },
      { from: 'pm', to: 'actions' }
    ]
  },

  scenarios: [
    {
      id: 'sev1', title: 'A SEV1 run by the book', tone: 'ok',
      steps: [
        { text: 'A 14:02 deploy makes checkout fail 30% of payments. The <b>error-budget burn-rate alert</b> fires at 14:06, before any customer complaint.', flow: ['svc>mon', 'mon>pager'], err: ['svc'], badges: { mon: '4 min' } },
        { text: 'The on-call acknowledges within 2 minutes, sees a core flow broken for many users, and <b>declares a SEV1</b>. By policy they are IC until someone else takes over.', flow: ['pager>oncall', 'oncall>ic'], badges: { oncall: ['SEV1', 'err'] } },
        { text: 'The IC delegates: a checkout engineer becomes <b>Ops lead</b>, someone else takes <b>Comms</b> and <b>Scribe</b>. Clear names, said out loud on the call.', flow: [['ic>ops', 'ic>comms', 'ic>scribe']], ok: ['ic'] },
        { text: 'A deploy correlates with the start. The IC decides: <b>roll back now</b>, investigate later. Impact stops at 14:20.', flow: ['ic>ops', 'ops>svc'], ok: ['svc'], badges: { svc: ['mitigated 18 min', 'ok'] } },
        { text: 'Comms has posted to the status page at 14:10 and every 30 minutes since, so <b>nobody interrupted</b> the responders.', flow: [['comms>stake', 'comms>status'], 'status>users'], ok: ['users'], tone: 'ok' }
      ]
    },
    {
      id: 'adhoc', title: 'Ad hoc response: everyone debugs', tone: 'err',
      steps: [
        { text: 'No symptom alert exists. The first signal is <b>customer complaints</b> to support 22 minutes after the deploy.', nodes: ['users', 'svc'], err: ['svc'], warn: ['users'], badges: { users: ['tweeting', 'err'] }, hidden: ['ic', 'comms', 'scribe'] },
        { text: 'Support posts in a busy channel. Five engineers start <b>debugging in parallel</b>; two change production at the same time.', flow: ['stake>ops', 'ops>svc'], err: ['svc'], warn: ['ops'], badges: { ops: ['5 people', 'warn'] }, hidden: ['ic', 'comms', 'scribe'] },
        { text: 'Executives and support ask "any update?" every few minutes. <b>Each interruption</b> pulls someone off the problem.', flow: ['stake>ops'], warn: ['stake', 'ops'], badges: { stake: ['interrupting', 'warn'] }, hidden: ['ic', 'comms', 'scribe'] },
        { text: 'Nobody owns the decision to roll back, so the group hunts for <b>root cause</b>. A hot-fix ships 98 minutes after the start. No timeline was kept.', flow: ['ops>svc'], err: ['svc', 'pm'], badges: { svc: ['98 min', 'err'], pm: ['no timeline', 'err'] }, hidden: ['ic', 'comms', 'scribe'], tone: 'err' }
      ]
    },
    {
      id: 'scale', title: 'Under pressure: a multi-day outage', tone: 'warn',
      steps: [
        { text: 'A maintenance script deletes customer sites. Restoring is slow and manual: this will last <b>days</b>, not minutes (the shape of Atlassian\'s April 2022 outage).', nodes: ['svc'], err: ['svc'], badges: { svc: ['days', 'err'] }, tone: 'warn' },
        { text: 'One IC cannot run a week. Use <b>explicit handoffs</b> on a shift schedule, and split into workstreams, each with its own lead reporting to the IC.', flow: ['ic>ops', 'ic>scribe'], warn: ['ic'], badges: { ic: ['shift 2 of 9', 'warn'] } },
        { text: 'Customers care most about <b>"is my data safe and when do I get it back"</b>. Comms gives honest, regular updates per customer, not a generic banner.', flow: [['comms>stake', 'comms>status'], 'status>users'], warn: ['users'] },
        { text: 'The scribe\'s timeline and per-workstream notes become the <b>public post-incident review</b>, including what went wrong in communication.', flow: ['scribe>pm', 'pm>actions'], ok: ['pm'], tone: 'ok' }
      ]
    },
    {
      id: 'learn', title: 'From postmortem to fewer repeats', tone: 'info',
      steps: [
        { text: 'Within a few days the Ops lead drafts a postmortem from the <b>Scribe\'s timeline</b>: impact, start, detection, mitigation.', flow: ['scribe>pm'], badges: { pm: 'draft' } },
        { text: 'The review asks <b>how</b> it made sense to ship that change, not <b>who</b> did it. Contributing factors: no canary, config not validated, rollback was manual.', nodes: ['pm'], ok: ['pm'], badges: { pm: ['3 factors', 'info'] } },
        { text: 'Each factor gets an <b>action item</b> with an owner team, priority and due date in the tracker. Not "be more careful".', flow: ['pm>actions'], badges: { actions: ['3 items', 'info'] } },
        { text: 'A weekly review chases overdue items. Months later the same config error is <b>caught by canary</b>, not by customers.', flow: ['actions>svc', 'svc>mon'], ok: ['svc', 'actions'], badges: { svc: ['canary caught it', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'fatigue', title: 'Alert fatigue hides the real page', tone: 'err',
      steps: [
        { text: 'Hundreds of cause-based alerts (CPU, disk, single pod restarts) page the on-call. Most need <b>no action</b>.', flow: ['mon>pager', 'pager>oncall'], warn: ['mon', 'pager'], badges: { pager: ['40 pages/wk', 'err'] } },
        { text: 'At 03:00 the real SEV1 page arrives among the noise. The tired on-call <b>snoozes it</b>, assuming another false alarm.', nodes: ['oncall'], err: ['oncall', 'svc'], badges: { oncall: ['snoozed', 'err'] }, tone: 'err' },
        { text: 'Fix: page only on <b>symptoms that need a human now</b>; route the rest to tickets; delete alerts that were never actionable.', flow: ['svc>mon', 'mon>pager'], ok: ['mon'], badges: { mon: ['SLO alerts only', 'ok'] } },
        { text: 'Pages drop to a handful per week, each one investigated. On-call becomes <b>sustainable</b>, and detection time for real incidents falls.', flow: ['pager>oncall', 'oncall>ic'], ok: ['oncall', 'pager'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real choice for how a team runs incidents. Meters show outcomes for a typical customer-facing SEV1 and for the team over a quarter. Numbers are <em>illustrative</em>, built from the phase model in the calculator.',
    controls: [
      { id: 'roles', label: 'Incident roles', type: 'seg', value: 'ic', options: [
        { v: 'adhoc', l: 'Ad hoc (whoever is around)' }, { v: 'ic', l: 'IC + Ops lead' }, { v: 'full', l: 'IC + Ops + Comms + Scribe' }] },
      { id: 'comms', label: 'Communication', type: 'seg', value: 'none', options: [
        { v: 'none', l: 'None until fixed' }, { v: 'internal', l: 'Internal channel only' }, { v: 'status', l: 'Scheduled updates + status page' }] },
      { id: 'pm', label: 'Postmortem culture', type: 'seg', value: 'doc', options: [
        { v: 'blame', l: 'Find who did it' }, { v: 'doc', l: 'Blameless doc, untracked actions' }, { v: 'tracked', l: 'Blameless + tracked actions' }] },
      { id: 'alerts', label: 'Alerting quality', type: 'seg', value: 'cause', options: [
        { v: 'none', l: 'Customers tell us' }, { v: 'cause', l: 'Many cause alerts (CPU, disk)' }, { v: 'slo', l: 'SLO burn-rate alerts' }] },
      { id: 'mit', label: 'Default first move', type: 'seg', value: 'debug', options: [
        { v: 'debug', l: 'Find root cause first' }, { v: 'rollback', l: 'Mitigate first (roll back / flag off)' }] }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const det = { none: 25, cause: 9, slo: 4 }[s.alerts];
      const ack = { none: 10, cause: 7, slo: 3 }[s.alerts] + (s.roles === 'adhoc' ? 6 : 0);
      let dia = (s.mit === 'rollback' ? 6 : 35) + (s.roles === 'adhoc' ? 12 : s.roles === 'ic' ? 3 : 0);
      if (s.comms === 'none') dia += s.roles === 'full' ? 2 : 8;           // interruptions from people who want updates
      else if (s.comms === 'internal') dia += 2;
      const mitM = s.mit === 'rollback' ? 6 : 14;
      const ttr = det + ack + dia + mitM;
      const pagesWk = { none: 2, cause: 30, slo: 5 }[s.alerts];
      const repeat = { blame: 0.45, doc: 0.3, tracked: 0.1 }[s.pm];
      let trust = { none: 0.2, internal: 0.4, status: 0.85 }[s.comms] - (ttr > 60 ? 0.15 : 0) - (s.alerts === 'none' ? 0.15 : 0);
      let learning = { blame: 0.15, doc: 0.5, tracked: 0.85 }[s.pm] + (s.roles === 'full' ? 0.1 : s.roles === 'adhoc' ? -0.15 : 0);
      let fatigue = clamp(pagesWk / 35 + (s.roles === 'adhoc' ? 0.2 : 0) + (repeat > 0.3 ? 0.15 : 0));
      let coord = { adhoc: 0.2, ic: 0.6, full: 0.9 }[s.roles] + (s.comms === 'status' ? 0.05 : 0);
      [trust, learning, coord] = [trust, learning, coord].map(clamp);
      const lvl = (x) => (x >= 0.7 ? 'high' : x >= 0.45 ? 'medium' : 'low');
      const metrics = [
        { k: 'Time to restore (SEV1)', v: '≈ ' + ttr + ' min', s: clamp(1 - (ttr - 15) / 90), hint: det + ' detect · ' + ack + ' ack · ' + dia + ' diag · ' + mitM + ' fix' },
        { k: 'Customer trust', v: lvl(trust), s: trust },
        { k: 'Repeat incidents', v: Math.round(repeat * 100) + '% recur', s: clamp(1 - repeat * 2) },
        { k: 'On-call fatigue', v: pagesWk + ' pages/wk · ' + lvl(fatigue), s: 1 - fatigue },
        { k: 'Learning', v: lvl(learning), s: learning },
        { k: 'Coordination', v: lvl(coord), s: coord }
      ];
      const notes = [];
      if (s.alerts === 'none') notes.push('Customers are your monitoring: <b>' + det + ' min</b> of impact before anyone knows. Add SLO burn-rate alerts on the main user journeys.');
      if (s.alerts === 'cause') notes.push('Cause-based alerts produce <b>~' + pagesWk + ' pages a week</b> (<em>illustrative</em>), most not actionable. Real pages get snoozed. Page on symptoms; ticket the rest.');
      if (s.mit === 'debug') notes.push('Root cause first adds <b>~30 min</b> of user impact here. Roll back or flag off when a recent change correlates; investigate after.');
      if (s.roles === 'adhoc') notes.push('Without an IC, several people change production at once and <b>nobody decides</b> to roll back.');
      if (s.comms === 'none') notes.push('Silence invites "any update?" messages that interrupt responders, and customers assume the worst.');
      if (s.comms === 'status' && s.roles !== 'full') notes.push('Scheduled updates need an owner. Without a <b>Comms lead</b>, the IC writes them and loses focus.');
      if (s.pm === 'blame') notes.push('Blame teaches people to <b>hide information</b>. The next postmortem will have a thinner timeline and the real factors stay unfixed.');
      if (s.pm === 'doc') notes.push('Blameless but untracked: good insight, yet action items <b>decay in a doc</b>. Put them in the tracker with owners and dates.');
      let verdict;
      if (s.pm === 'blame') verdict = '❌ <b>Blame culture undermines everything else:</b> people stop reporting, so you lose the information you need to improve.';
      else if (s.alerts === 'none' || (s.roles === 'adhoc' && s.mit === 'debug')) verdict = '❌ <b>Slow and chaotic:</b> ≈ ' + ttr + ' min per SEV1, most of it waiting and uncoordinated debugging.';
      else if (s.roles === 'full' && s.comms === 'status' && s.pm === 'tracked' && s.alerts === 'slo' && s.mit === 'rollback') verdict = '✅ <b>Mature incident practice:</b> fast detection, clear command, mitigate first, honest updates, and a learning loop that closes.';
      else if (s.alerts === 'cause') verdict = '⚠ <b>Alert noise is the weak spot:</b> on-call fatigue will eventually cause a missed SEV1. Move to symptom-based alerts.';
      else if (s.mit === 'debug') verdict = '⚠ <b>Good structure, wrong first move:</b> make mitigation the default and the time to restore drops sharply.';
      else verdict = '👍 <b>Solid response.</b> Close the remaining gap (' + (s.comms !== 'status' ? 'communication' : s.roles !== 'full' ? 'dedicated Comms and Scribe' : 'tracked actions') + ') to finish the picture.';
      const hide = [];
      if (s.roles === 'adhoc') hide.push('ic', 'scribe');
      if (s.roles !== 'full') hide.push('scribe');
      if (s.roles !== 'full' && s.comms === 'none') hide.push('comms');
      if (s.comms !== 'status') hide.push('status');
      let flow = s.alerts === 'none' ? ['users>svc'] : ['svc>mon', 'mon>pager', 'pager>oncall'];
      flow = flow.concat(s.roles === 'adhoc' ? ['oncall>ops'] : ['oncall>ic', 'ic>ops']).concat(['ops>svc']);
      if (s.comms === 'status') flow.push('comms>status', 'status>users');
      else if (s.comms === 'internal') flow.push('comms>stake');
      if (s.roles === 'full') flow.push('scribe>pm');
      flow.push('pm>actions');
      return {
        metrics, verdict, notes, hide, flow,
        labels: {
          mon: { label: { none: 'No alerting', cause: 'Cause alerts', slo: 'SLO alerting' }[s.alerts], sub: { none: 'customers report it', cause: 'CPU · disk · pods', slo: 'burn-rate alerts' }[s.alerts] },
          ops: { label: s.roles === 'adhoc' ? 'Everyone' : 'Ops lead', sub: s.mit === 'rollback' ? 'roll back first' : 'hunting root cause' },
          comms: { label: s.roles === 'full' ? 'Comms lead' : 'IC writes updates', sub: { none: 'silent', internal: 'internal only', status: 'every 30 min' }[s.comms] },
          pm: { label: s.pm === 'blame' ? 'Blame review' : 'Postmortem', sub: s.pm === 'blame' ? 'who did it?' : 'blameless' },
          actions: { label: 'Action items', sub: s.pm === 'tracked' ? 'owned · dated' : 'in a doc, decaying' }
        },
        err: (s.pm === 'blame' ? ['pm'] : []).concat(s.alerts === 'none' ? ['mon'] : []),
        warn: (s.alerts === 'cause' ? ['pager', 'oncall'] : []).concat(s.pm === 'doc' ? ['actions'] : []).concat(s.roles === 'adhoc' ? ['ops'] : []),
        ok: (s.pm === 'tracked' ? ['actions'] : []).concat(s.mit === 'rollback' ? ['svc'] : []),
        badges: { svc: ['≈ ' + ttr + ' min', ttr > 60 ? 'err' : ttr > 30 ? 'warn' : 'ok'], oncall: [pagesWk + ' pages/wk', pagesWk > 15 ? 'err' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Incident timeline simulator',
    caption: 'A bad deploy breaks checkout. At each <b>decision point</b> choose what to do: how you find out, whom to page, roll back or debug, and whether to update the status page. Bars show <b>where the minutes went</b>; compare your run with an ad-hoc and a structured response, then <b>generate the postmortem skeleton</b> from your timeline.'
  },

  realWorld: {
    intro: 'The practice grew from emergency services (the Incident Command System), was adapted by web operations teams, and is now visible in detailed public postmortems. Every claim links to its source.',
    timeline: [
      { when: '2012', who: 'John Allspaw · Etsy', title: '"Blameless PostMortems and a Just Culture"', text: 'Allspaw\'s Code as Craft post argued that engineers who can give a detailed account of their actions <b>without fear of punishment</b> give the organisation the information it needs to prevent the next failure. It popularised the term "blameless postmortem".', src: 4 },
      { when: '2014', who: 'John Allspaw', title: '"The Infinite Hows (or, the Dangers of the Five Whys)"', text: 'A critique of the Toyota-born <b>5 whys</b>: it forces a linear, single-cause story onto complex systems and tends to end at a person. Ask <b>how</b> the conditions came together instead.', src: 6 },
      { when: '2016', who: 'Google', title: 'Site Reliability Engineering, ch. 14 and 15', text: 'Ch. 14 "Managing Incidents" adapts the <b>Incident Command System</b>: Incident Commander, Operations lead, Communications lead and Planning, a recognised command post, a live incident document and <b>explicit handoffs</b>. Ch. 15 "Postmortem Culture" makes postmortems <b>blameless</b>: focus on contributing causes without indicting any individual or team.', src: 0 },
      { when: '2016', who: 'Etsy', title: 'Debriefing Facilitation Guide', text: 'A free guide for <b>facilitating</b> blameless debriefs: the facilitator\'s job is to help the group explore how the event unfolded and what people knew at the time, rather than to collect remediation items quickly.', src: 5 },
      { when: 'Jan 2017', who: 'GitLab', title: 'Database outage, postmortem published openly', text: 'While fighting replication lag, an engineer deleted data on the <b>primary</b> database, believing it was the secondary. Production data changed between <b>17:20 and 00:00 UTC</b> on 31 January was lost because several backup and replication mechanisms were not working. GitLab published a candid public postmortem.', src: 7 },
      { when: 'Jul 2019', who: 'Cloudflare', title: 'A WAF regex takes the edge down for 27 minutes', text: 'A new managed WAF rule contained a regular expression that <b>backtracked</b> enormously and exhausted CPU on machines serving HTTP worldwide. The rule had been deployed <b>globally at once</b>. The postmortem lists the contributing factors and the changes to staged rollout.', src: 8 },
      { when: '2019 →', who: 'LFI community', title: 'Learning from Incidents in Software', text: 'Nora Jones started a community and site applying <b>resilience engineering</b> and safety science to software incidents: richer incident analysis, less focus on counts and root cause.', src: 13 },
      { when: '2021 → 2022', who: 'Courtney Nash · VOID', title: 'MTTR is not a viable reliability metric', text: 'Analysing public incident reports collected in the Verica Open Incident Database, Nash found durations are <b>positively skewed</b>, so means mislead, and that duration <b>does not correlate with severity</b>. Her conclusion: MTTR does not tell you how reliable you are.', src: 9 },
      { when: 'Apr 2022', who: 'Atlassian', title: 'Up to 14-day outage for 775 customers', text: 'A maintenance script deleted <b>883 sites (775 customers)</b> in about 23 minutes because it received site IDs instead of app IDs; peer review had not cross-checked the IDs. Restores ran from 8 to 18 April. The PIR also covers what went wrong in <b>communication</b> with affected customers.', src: 10 },
      { when: 'Jul 2024', who: 'CrowdStrike', title: 'Channel File 291', text: 'A content update expected <b>21 input fields</b> while the sensor supplied <b>20</b>; a validator logic error let it through and Windows hosts crashed. Microsoft estimated <b>8.5 million</b> devices were affected (less than 1% of Windows machines). Fixes include more validation and customer control over staged content rollout.', src: 11 }
    ],
    lessons: [
      'Big outages are almost never one cause: each review above lists <b>several contributing factors</b> (validation gaps, global rollout, untested backups).',
      '<b>Staged rollout and fast rollback</b> are the most common action items: the cheapest way to make the next failure small.',
      'Public, candid postmortems (GitLab, Cloudflare) <b>build trust</b>; slow or vague communication (a theme of Atlassian\'s own review) erodes it.',
      'Measure <b>learning and follow-through</b>, not just MTTR: durations are noisy and skewed.'
    ],
    sources: [
      { title: 'Managing Incidents (Site Reliability Engineering, ch. 14)', url: 'https://sre.google/sre-book/incident-response/', pub: 'Google, O\'Reilly 2016' },
      { title: 'Postmortem Culture: Learning from Failure (ch. 15)', url: 'https://sre.google/sre-book/postmortem-culture/', pub: 'Google, O\'Reilly 2016' },
      { title: 'Incident Response (SRE Workbook, ch. 9)', url: 'https://sre.google/workbook/incident-response/', pub: 'Google, 2018' },
      { title: 'Different Roles (PagerDuty Incident Response docs)', url: 'https://response.pagerduty.com/before/different_roles/', pub: 'PagerDuty' },
      { title: 'Blameless PostMortems and a Just Culture', url: 'https://www.etsy.com/codeascraft/blameless-postmortems', pub: 'John Allspaw, Etsy Code as Craft, 2012' },
      { title: 'Debriefing Facilitation Guide for Blameless Postmortems', url: 'https://www.etsy.com/codeascraft/debriefing-facilitation-guide', pub: 'Etsy Code as Craft, 2016' },
      { title: 'The Infinite Hows (or, the Dangers of the Five Whys)', url: 'https://www.kitchensoap.com/2014/11/14/the-infinite-hows-or-the-dangers-of-the-five-whys/', pub: 'John Allspaw, Kitchen Soap, 2014' },
      { title: 'Postmortem of database outage of January 31', url: 'https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/', pub: 'GitLab, Feb 2017' },
      { title: 'Details of the Cloudflare outage on July 2, 2019', url: 'https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019', pub: 'Cloudflare blog, Jul 2019' },
      { title: 'Tales from the VOID: The Scary Truth about Incident Metrics', url: 'https://www.usenix.org/conference/srecon22americas/presentation/nash', pub: 'Courtney Nash, SREcon22 Americas' },
      { title: 'Post-Incident Review on the Atlassian April 2022 outage', url: 'https://www.atlassian.com/blog/how-we-build/post-incident-review-april-2022-outage', pub: 'Atlassian, 2022' },
      { title: 'Channel File 291 Incident: Root Cause Analysis is Available', url: 'https://www.crowdstrike.com/en-us/blog/channel-file-291-rca-available/', pub: 'CrowdStrike, Aug 2024' },
      { title: 'Microsoft says 8.5M Windows devices were affected by CrowdStrike outage', url: 'https://techcrunch.com/2024/07/20/microsoft-says-8-5m-windows-devices-were-affected-by-crowdstrike-outage/', pub: 'TechCrunch, Jul 2024' },
      { title: 'Learning from Incidents in Software', url: 'https://www.learningfromincidents.io/', pub: 'LFI community' },
      { title: 'Incident metrics and the VOID', url: 'https://www.infoq.com/articles/incident-metrics-void', pub: 'InfoQ' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['First move', '<b>Mitigate first</b>: roll back, fail over, flag off', '<b>Diagnose first</b>: understand, then fix forward', 'Mitigate whenever a safe lever exists; diagnose first only if mitigation could destroy evidence or data (e.g. GitLab-style data loss)'],
      ['Roles', '<b>One person does it all</b>: fast to start', '<b>IC + Ops + Comms + Scribe</b>: parallel, focused', 'Small SEV3s: one person. Anything customer-facing or multi-team: split roles (one person may hold two on a small team)'],
      ['Declaring', '<b>Declare early, downgrade later</b>', '<b>Declare only when sure</b>', 'Early: a false alarm costs minutes, a late SEV1 costs trust and budget'],
      ['Communication', '<b>Fixed cadence</b>, even "no news"', '<b>Update when there is news</b>', 'Cadence for SEV1/2: predictability stops interruptions and rumour'],
      ['Analysis', '<b>Single root cause / 5 whys</b>: simple, quick', '<b>Contributing factors</b>: richer, slower', 'Contributing factors for anything important; 5 whys tends to stop at a person'],
      ['Metric', '<b>MTTR / incident counts</b>: easy, comparable', '<b>Phase timings, SLO impact, action follow-through</b>', 'Use durations as diagnostics per incident, not as targets; report SLO impact upward']
    ]
  },
  failures: [
    { f: 'No one in command', detect: 'Several people changing prod; contradictory messages; no decision log', fix: 'Anyone may declare; the declarer is IC until handed off; one Ops lead applies changes.' },
    { f: 'Root-cause tunnel vision', detect: 'Long diagnosis phase while a recent deploy correlates with the start', fix: 'Make "what changed? roll it back" the first question; practise rollbacks so they are trusted.' },
    { f: 'Silent incident', detect: 'Executives and support DM engineers; customers learn from social media', fix: 'Comms lead, update template, fixed cadence, status page for customer-facing SEVs.' },
    { f: 'Alert fatigue', detect: 'Many pages per shift; low share actionable; acks without action', fix: 'Page on SLO burn rate; route causes to tickets; delete alerts with no action in 30 days.' },
    { f: 'Blame and "human error"', detect: 'Postmortems name people; thin timelines; fewer near-miss reports', fix: 'Blameless template; trained facilitators; ask how it made sense at the time; never link to performance reviews.' },
    { f: 'Action items that die', detect: 'Repeat incidents with an open item from a previous postmortem', fix: 'Items in the tracker with owner, priority and due date; weekly review; escalate overdue P0s.' },
    { f: 'Gaming MTTR', detect: 'Late declarations, early resolution, incidents re-labelled as bugs', fix: 'Stop using MTTR as a target; review phases and SLO impact per incident instead.' }
  ],

  interview: [
    { q: 'Walk me through the lifecycle of an incident.', a: '<ol><li><b>Detect</b>: a symptom alert (or a user) signals impact.</li><li><b>Triage</b>: on-call acks, assesses impact, sets a <b>severity</b>.</li><li><b>Mobilise</b>: declare, appoint an IC, page the needed people, open the call and channel.</li><li><b>Mitigate</b>: stop user impact (roll back, fail over, flag off, shed load).</li><li><b>Resolve</b>: fix properly, confirm metrics are normal, close.</li><li><b>Learn</b>: blameless postmortem, tracked action items, share widely.</li></ol>', lvl: 'core' },
    { q: 'What does an Incident Commander do, and why should they not fix things themselves?', a: '<p>Google SRE adapts the <b>Incident Command System</b> (from firefighting): the IC holds the big picture, assigns roles (Ops lead, Comms lead, Scribe/Planning), makes decisions and holds every role not yet delegated. PagerDuty\'s docs say the IC\'s job is to <b>coordinate, not make technical changes</b>.</p><p>If the IC starts debugging, nobody is watching the whole: conflicting changes, forgotten comms, missed decisions like "roll back now".</p>', fu: 'How do you hand off command? (Explicitly, out loud, acknowledged: "You are now IC.")', lvl: 'core' },
    { q: 'Why mitigate before finding the root cause?', a: '<p>Users feel the outage, not your understanding of it. If a recent change correlates with the start, <b>rolling it back</b> usually ends impact in minutes, while diagnosis can take an hour. You keep logs, metrics and the bad build to investigate afterwards.</p><p>Exception: when the "mitigation" could destroy data or evidence (e.g. restoring over a database), slow down and think first.</p>', lvl: 'core' },
    { q: 'How do you define severity levels?', a: '<p>By <b>user and business impact</b>, not by technical cause: SEV1 = core function down for many users, data loss or security breach; SEV2 = significant degradation or a key customer; SEV3 = minor with a workaround. Each level fixes <b>who is paged, whether an IC is required, update cadence, status page and postmortem</b>. Declare high and downgrade; arguing about severity mid-incident wastes time.</p>', lvl: 'core' },
    { q: 'What are MTTD, MTTA and MTTR, and what is wrong with MTTR?', a: '<p>Mean time to <b>detect</b> (start → alert), to <b>acknowledge</b> (alert → human) and to <b>restore/resolve</b> (start → impact gone).</p><p>Courtney Nash\'s VOID analysis found incident durations are <b>positively skewed</b>, so a mean is dominated by a few long incidents, and duration <b>did not correlate with severity</b>. As a target it gets gamed (declare late, close early). Use phase timings per incident to find where time goes; report <b>SLO/error-budget impact</b> and action follow-through upward.</p>', lvl: 'deep' },
    { q: 'What makes a postmortem blameless, and is it "no accountability"?', a: '<p>Google SRE ch. 15: it focuses on <b>contributing causes without indicting any individual or team</b>. Allspaw (Etsy, 2012): people who can describe what they did and why <b>without fear of punishment</b> give you the information needed to fix the system.</p><p>It is not "no accountability": accountability moves to <b>owning the follow-up</b> (action items) and telling the full story. If a well-meaning person could make the mistake, the system allowed it.</p>', lvl: 'core' },
    { q: 'Why do many practitioners avoid the 5 whys and "single root cause"?', a: '<p>Allspaw\'s "The Infinite Hows" (2014): the 5 whys forces a <b>linear chain</b> onto a complex system, and the chain tends to end at a person ("why did he run the script?"). Real outages have <b>several contributing factors</b>: Cloudflare 2019 combined a backtracking regex with a global, all-at-once rule deploy; GitLab 2017 combined a mistaken command with backups that did not work.</p><p>Ask <b>how</b> it made sense at the time and which conditions lined up; fix several of them.</p>', lvl: 'deep' },
    { q: 'Design the on-call and alerting setup for a new 30-person product group.', a: '<ul><li><b>SLOs</b> on the main user journeys; page on <b>multi-window burn rate</b>, ticket on slow burns.</li><li>Rota per service area, primary + secondary, 1 week shifts, at least 6–8 people per rota (rule of thumb) so each is on-call rarely.</li><li>Escalation: primary → secondary after 5 min → IC rota.</li><li>A trained <b>IC rota</b>, runbooks for top alerts, one-click rollback.</li><li>Track pages/shift and actionable rate; review in a weekly on-call handover.</li></ul>', lvl: 'deep' },
    { q: 'How do you make sure postmortem action items actually get done?', a: '<p>Put them in the <b>normal tracker</b>, not the doc, each with one owner team, priority and due date. Review overdue P0/P1 items weekly with engineering leadership. Link repeat incidents to earlier open items and make that visible. Use the error budget policy: if the budget is spent, reliability items jump the queue. Keep the list short: three items done beat fifteen ignored.</p>', lvl: 'core' },
    { q: 'Tell me about a time you led an incident response.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><p><b>S:</b> A config push made our payments API return 500s for ~25% of requests on a Friday evening; four people were debugging in one channel.</p><p><b>T:</b> As the senior on-call, restore service and get the response under control.</p><p><b>A:</b> Declared SEV1 and took IC; named one Ops lead and asked everyone else to stop changing prod; asked a PM to take comms with 30-minute status-page updates; we correlated the start with the config push and rolled it back.</p><p><b>R:</b> Impact ended 11 minutes after I took command (47 minutes total). The postmortem produced three tracked items, including config validation in CI, all done within a month.</p>', lvl: 'deep' },
    { q: 'Tell me about introducing blameless postmortems where people were blamed before.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><p><b>S:</b> Postmortems were written by managers and named the engineer at fault; near-miss reports had almost stopped.</p><p><b>T:</b> As principal engineer, make reviews useful again without a mandate over managers.</p><p><b>A:</b> Got the VP to state publicly that postmortems never feed performance reviews; introduced a template with contributing factors and "what went well"; trained 6 facilitators with Etsy\'s guide; facilitated the first five myself.</p><p><b>R:</b> In two quarters, voluntary near-miss reports went from 1 to 9 per month and repeat incidents in the top services fell by about half.</p>', lvl: 'deep' },
    { q: 'A stakeholder demands an ETA and the root cause during a SEV1. What do you do?', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><p><b>S:</b> During a 2-hour search outage our CRO messaged three engineers directly for an ETA every 10 minutes.</p><p><b>T:</b> As IC, protect the responders while keeping leadership genuinely informed.</p><p><b>A:</b> Assigned a Comms lead, created an exec channel, committed to updates every 20 minutes with "what we know, what we are doing, next update at"; never gave a guessed ETA, only the mitigation we were trying and when we would know if it worked.</p><p><b>R:</b> Direct messages to engineers stopped; the CRO later asked us to use the same format for every SEV1, and it became policy.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Blameless postmortem template (Markdown, created by a script)', lang: 'bash',
      code: `#!/usr/bin/env bash
# usage: ./new-postmortem.sh 2026-11-03 "Checkout 500s after config push" SEV1
set -euo pipefail
date="$1"; title="$2"; sev="$3"
file="postmortems/\${date}-$(echo "$title" | tr 'A-Z ' 'a-z-' | tr -cd 'a-z0-9-').md"
mkdir -p postmortems
cat > "$file" <<EOF
# \${title}  (\${sev}, \${date})
Status: draft · Facilitator: · Authors: · Review meeting:

## Summary
Two or three sentences a non-engineer understands.

## Impact
Users / requests affected · duration · error budget consumed · data loss?

## Timeline (UTC, from the scribe log)
| Time | Event (detect / ack / decision / action / update) |
|------|---------------------------------------------------|

## Contributing factors
- How did it make sense, at the time, to do what was done?
- Which conditions lined up? (no single root cause)

## What went well · Where we got lucky

## Action items
| Item | Type (prevent/detect/mitigate) | Owner team | Priority | Due | Ticket |
|------|-------------------------------|------------|----------|-----|--------|
EOF
echo "created $file"`,
      note: 'The template has no "who caused it" field on purpose. Fill the timeline from the Scribe\'s log or the chat export before the review meeting.'
    },
    {
      title: 'Alertmanager: severity-based routing to PagerDuty', lang: 'yaml',
      code: `route:
  receiver: ticket-queue             # default: low urgency, no page
  group_by: [alertname, service]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers: [ 'severity="page"' ]   # SLO fast-burn alerts only
      receiver: pagerduty-high
      group_wait: 10s
      repeat_interval: 1h
    - matchers: [ 'severity="ticket"' ] # slow burn, causes (disk, CPU)
      receiver: ticket-queue

receivers:
  - name: pagerduty-high
    pagerduty_configs:
      - routing_key_file: /etc/alertmanager/pd-checkout.key
        severity: critical   # PagerDuty escalation policy does
                             # primary -> secondary (5m) -> IC rota (10m)
        description: '{{ .CommonAnnotations.summary }}'
  - name: ticket-queue
    webhook_configs:
      - url: http://ticket-bridge.internal/alerts

inhibit_rules:   # a page suppresses the related cause alerts
  - source_matchers: [ 'severity="page"' ]
    target_matchers: [ 'severity="ticket"' ]
    equal: [service]`,
      note: 'Escalation timing lives in the PagerDuty escalation policy, not in Alertmanager. <code>routing_key_file</code> needs Alertmanager 0.25+; older versions use <code>routing_key</code>.'
    },
    {
      title: 'Python: phase timings (MTTD, MTTA, time to mitigate) with medians', lang: 'python',
      code: `import csv
from datetime import datetime
from statistics import mean, median, quantiles

PHASES = [("detect", "started_at", "detected_at"),
          ("ack", "detected_at", "acked_at"),
          ("mitigate", "acked_at", "mitigated_at"),
          ("restore", "started_at", "mitigated_at")]

def minutes(a: str, b: str) -> float:
    return (datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() / 60

def report(path: str, sev: str = "1") -> None:
    with open(path, newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["sev"] == sev]
    print(f"SEV{sev}: {len(rows)} incidents")
    for name, start, end in PHASES:
        xs = [minutes(r[start], r[end]) for r in rows if r[start] and r[end]]
        if len(xs) < 2:
            continue
        p90 = quantiles(xs, n=10)[-1]
        print(f"  {name:9} mean {mean(xs):6.1f}  median {median(xs):6.1f}"
              f"  p90 {p90:6.1f} min")

if __name__ == "__main__":
    report("incidents.csv")   # columns: id,sev,started_at,detected_at,...`,
      note: 'Show the median and p90 next to the mean: with skewed durations the mean alone hides what a typical incident looks like. Use the phases to decide where to invest (alerts, paging, rollback), not as a team target.'
    }
  ],

  related: ['slo-error-budgets', 'observability-pillars', 'chaos-engineering', 'disaster-recovery', 'stakeholder-communication', 'conflict-resolution']
});
