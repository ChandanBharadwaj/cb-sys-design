(function () {
  // Review queue model: manual decisions arrive continuously, a board clears `cap` per meeting.
  function gov(v) {
    const manual = v.teams * v.dpm * (1 - v.auto / 100);          // decisions / month needing a human
    const capM = v.cadence * v.cap;                                // reviews / month the board can do
    const rho = capM > 0 ? manual / capM : 9;
    const interval = 30 / v.cadence;                               // calendar days between meetings
    // Wait = time to the next meeting (half an interval on average) + whole meetings spent queued.
    // Queued meetings ≈ rho/(1-rho) (simple queueing estimate); unbounded growth when rho ≥ 1.
    const queued = rho < 0.98 ? rho / (1 - rho) : null;
    const wait = queued === null ? null : interval / 2 + queued * interval * 0.5;
    const backlog = rho >= 1 ? Math.round((manual - capM) * 3) : Math.round(queued * v.cap * 0.5);
    return { manual, capM, rho, interval, wait, backlog };
  }

  SD.register({
    slug: 'architecture-governance',
    domain: 9,
    title: 'Architecture Governance',
    examples: 'ArchUnit, Thoughtworks Radar',
    tagline: 'Keep dozens of teams <b>consistent, safe and interoperable</b> without making them queue for permission. Encode the rules as <b>automated guardrails</b>, decide the rest through a fast <b>advice process</b>, and keep a written trail of every exception.',
    tldr: {
      problem: 'Twenty teams each pick their own logging, auth library and API style. Integration gets hard, one team ships a known-vulnerable library, and nobody can say which systems break a policy. The classic fix, a <b>central review board</b>, then turns into a weekly queue that every change waits for.',
      idea: 'Split governance in two. Rules that can be checked by a machine become <b>fitness functions in CI</b> (dependency rules, banned libraries, latency budgets, security scans). Decisions that need judgement go through an <b>advice process</b> recorded in <b>ADRs</b>. A <b>tech radar</b> and <b>golden paths</b> make the right choice the easy one.',
      insight: 'Governance is a <b>feedback system, not a gate</b>. Measure it like one: how long a decision waits, what share of rules are automated, how many waivers are open and expired. A board that blocks delivery to buy consistency usually gets neither, because teams route around it.',
      numbers: [
        { v: '4 rings', l: 'Adopt · Trial · Assess · Hold (Thoughtworks radar; newer editions call the outer ring Caution)' },
        { v: '1 rule', l: 'advice process: anyone may decide, after seeking advice (Harmel-Law, martinfowler.com)' },
        { v: '2011', l: 'Nygard proposes Architecture Decision Records (Cognitect blog)' }
      ]
    },

    intro: {
      what: '<b>Architecture governance</b> is how an organisation makes sure that many teams\' technical decisions add up to a coherent whole: systems that fit together, meet security and compliance rules, and do not each reinvent the same thing. It covers <b>who decides</b>, <b>which rules apply</b>, <b>how they are checked</b>, and <b>what happens when someone needs an exception</b>.',
      analogy: {
        icon: '🛣️',
        title: 'Building codes and paved roads, not a permit office',
        text: 'A city does not ask an official to approve every shelf you put up. It publishes a <b>building code</b>, inspects the few things that can kill people (wiring, structure), and builds good roads so most people take them. Software governance works the same way: a short list of hard rules checked automatically, advice for the rest, and a paved road that is easier than going off-road. The analogy breaks in one place: software rules change every few months, so the code itself needs a lifecycle.'
      },
      problem: 'A bank has 30 teams. After a breach traced to an outdated library, leadership creates an Architecture Review Board that meets every two weeks and must approve every design. Six months later, a simple change waits a month for a slot, teams stop asking, and the board only sees the projects that could not avoid it. The question this page answers is <b>how do you get consistency and safety across many teams without turning architects into a bottleneck?</b>',
      story: [
        {
          stage: 'naive',
          title: 'Every design goes to the board',
          text: 'A central <b>Architecture Review Board</b> (ARB) approves every significant change. It feels safe: experienced people look at everything, and nothing ships without a stamp.',
          scene: {
            nodes: [
              { id: 't', label: 'Product teams', sub: '30 teams', kind: 'team', at: [70, 0] },
              { id: 'arb', label: 'Review board', sub: 'meets bi-weekly', kind: 'policy', at: [210, 110] },
              { id: 'p', label: 'Production', sub: 'after approval', kind: 'service', at: [350, 220] }
            ],
            edges: [{ from: 't', to: 'arb' }, { from: 'arb', to: 'p' }],
            flow: ['t>arb', 'arb>p'],
            badges: { arb: ['approve ✓', 'info'] }
          }
        },
        {
          stage: 'breaks',
          title: 'The queue grows and teams route around it',
          text: 'Requests arrive faster than one meeting can clear them. Waits stretch to <b>weeks</b>, reviews become rubber stamps, and teams learn to call changes "minor" so they skip the board. The risky change ships anyway, unreviewed.',
          scene: {
            nodes: [
              { id: 't', label: 'Product teams', sub: 'waiting', kind: 'team', at: [70, 0] },
              { id: 'arb', label: 'Review board', sub: 'backlog 40', kind: 'policy', at: [210, 110] },
              { id: 'p', label: 'Production', sub: 'drift + bypass', kind: 'service', at: [350, 220] }
            ],
            edges: [{ from: 't', to: 'arb' }, { from: 'arb', to: 'p' }, { from: 't', to: 'p', dashed: true }],
            flow: ['t>arb', 't>p'],
            err: ['arb'], warn: ['p'],
            badges: { arb: ['3–4 wk wait', 'err'], p: ['bypassed', 'warn'] }
          }
        },
        {
          stage: 'fix',
          title: 'Automate the rules, advise on the rest',
          text: 'Hard rules become <b>fitness functions</b> that run in every build and fail fast. Judgement calls go through an <b>advice process</b>: teams decide after asking the people affected, and write an ADR. The board turns into a forum that gives advice and curates the rules.',
          scene: {
            nodes: [
              { id: 't', label: 'Product teams', sub: 'decide + ADR', kind: 'team', at: [70, 0] },
              { id: 'ci', label: 'CI checks', sub: 'fitness functions', kind: 'compute', at: [70, 110] },
              { id: 'arb', label: 'Advice forum', sub: 'weekly, optional', kind: 'team', at: [350, 0] },
              { id: 'p', label: 'Production', sub: 'every build checked', kind: 'service', at: [210, 220] }
            ],
            edges: [{ from: 't', to: 'ci' }, { from: 'ci', to: 'p' }, { from: 't', to: 'arb', bidi: true, dashed: true }],
            flow: [['t>ci', 't>arb'], 'ci>p'],
            ok: ['ci', 'p'],
            badges: { ci: ['minutes', 'ok'] }
          }
        }
      ],
      usedBy: ['Thoughtworks (Technology Radar)', 'Spotify (Golden Paths)', 'Netflix (Paved Road)', 'Zalando (open-source Tech Radar)', 'ArchUnit users in Java shops', 'TOGAF-based enterprises (Architecture Board)'],
      whenToUse: [
        'More than a handful of teams share platforms, data or customers, so their choices affect each other',
        'You have <b>regulatory or security rules</b> that must hold everywhere and be provable to an auditor',
        'Integration pain, duplicated tools or "nobody knows what runs where" are slowing you down'
      ],
      whenNot: [
        'One or two teams in one codebase: a shared review habit and <a href="design-principles.html">good principles</a> are enough',
        'As a substitute for platform work: if the right way is hard, build a <a href="platform-engineering.html">golden path</a> before adding rules',
        'To settle every taste question (tabs, frameworks per team): govern interfaces and risks, not internals'
      ],
      glossary: [
        { term: 'Architecture Review Board (ARB)', def: 'A central group of senior architects that reviews and approves designs, usually in scheduled meetings.' },
        { term: 'Advice process', def: 'A decision rule: anyone may make an architecture decision, provided they first seek advice from those affected and those with expertise.' },
        { term: 'Fitness function', def: 'An objective, ideally automated check of one architectural characteristic, such as "the domain layer never imports the web layer".' },
        { term: 'Guardrail vs gate', def: 'A guardrail is an always-on, automatic boundary teams work within; a gate is a point where work stops until someone approves it.' },
        { term: 'Tech Radar', def: 'A published map of technologies placed in rings (Adopt, Trial, Assess, Hold) that tells teams what is recommended or discouraged.' },
        { term: 'Golden path (paved road)', def: 'A supported, ready-made way to build and run a typical service, so the compliant choice is also the easiest.' },
        { term: 'Waiver (exception)', def: 'A recorded, time-limited permission to break one rule, with an owner, a reason and an expiry date.' },
        { term: 'ADR', def: 'Architecture Decision Record: a short document with the context, the decision and its consequences.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Few, explicit principles</b>: 5–10 written principles with rationale and implications, not a 200-page standard',
        '<b>Automate what is checkable</b>: every hard rule becomes a fitness function in CI or a policy at deploy time',
        '<b>Decentralise decisions</b>: teams decide, after seeking advice; architects advise and curate',
        '<b>Decisions leave evidence</b>: ADRs in the repo are the audit trail, not meeting minutes',
        '<b>Standards have a lifecycle</b>: propose → trial → adopt → deprecate, visible on a radar',
        '<b>Exceptions are first-class</b>: waivers with owner, reason and expiry, reported openly'
      ],
      nonFunctional: [
        'Median wait for an architecture decision &lt; 5 working days (<em>rule of thumb</em>)',
        '≥ 70% of governance rules enforced automatically (<em>target, illustrative</em>)',
        'Fitness-function feedback within the normal CI run (minutes, not days)',
        'Zero <b>expired</b> waivers; open waivers trend down quarter on quarter',
        '100% of services on a supported runtime and no Hold-ring library in production builds',
        'Every architecturally significant change has an ADR linked from the service catalogue'
      ],
      outOfScope: [
        '<b>Ivory tower</b>: architects write standards they never build with and teams never read',
        '<b>Review board bottleneck</b>: one meeting approves everything and becomes the critical path',
        '<b>Rubber stamp</b>: reviews too shallow to catch anything, kept for the paperwork',
        '<b>Standards nobody follows</b>: rules with no check, no owner and no exception path',
        '<b>Permanent exceptions</b>: waivers with no expiry that quietly become the real standard'
      ]
    },

    calculator: {
      inputs: [
        { id: 'teams', label: 'Teams', min: 2, max: 200, value: 30, log: true },
        { id: 'dpm', label: 'Decisions per team per month needing review', min: 0.2, max: 8, value: 1.5, step: 0.1 },
        { id: 'cadence', label: 'Review meetings per month', min: 1, max: 20, value: 2 },
        { id: 'cap', label: 'Decisions reviewed per meeting', min: 2, max: 30, value: 10 },
        { id: 'auto', label: 'Share handled by fitness functions (no meeting)', min: 0, max: 95, value: 30, unit: '%' },
        { id: 'hrs', label: 'Reviewer hours per manual decision (all reviewers)', min: 0.5, max: 12, value: 3, step: 0.5, unit: 'h' }
      ],
      outputs: [
        { label: 'Manual decisions per month vs board capacity', fmt: 'raw', f: (v) => { const g = gov(v); return Math.round(g.manual) + ' arrive · ' + g.capM + ' slots (' + Math.round(g.rho * 100) + '% load)'; } },
        { label: 'Queue after one quarter', fmt: 'raw', f: (v) => { const g = gov(v); return g.rho >= 1 ? '≈ ' + g.backlog + ' waiting and growing' : '≈ ' + g.backlog + ' waiting (stable)'; } },
        { label: 'Average wait for a manual decision', fmt: 'raw', f: (v) => { const g = gov(v); return g.wait === null ? 'unbounded (queue grows)' : '≈ ' + g.wait.toFixed(1) + ' calendar days'; } },
        { label: 'Decisions not blocked by a meeting', fmt: 'pct', f: (v) => v.auto / 100 },
        { label: 'Reviewer hours per month', fmt: 'raw', f: (v) => { const g = gov(v); const done = Math.min(g.manual, g.capM); return Math.round(done * v.hrs) + ' h (≈ ' + (done * v.hrs / 140).toFixed(1) + ' FTE)'; } },
        { label: 'Meetings needed per month to keep load ≤ 70%', fmt: 'raw', f: (v) => Math.ceil(gov(v).manual / (0.7 * v.cap)) + ' meetings' }
      ],
      note: 'Wait = half the gap between meetings (you just missed one, on average) plus queueing. Queued meetings use the <em>estimate</em> ρ/(1−ρ), so wait explodes as load ρ nears 100%, exactly as with any server. Above 100% the queue grows every month and no wait is defined. Raise <b>% automated</b> to see why fitness functions are the cheapest capacity you can add: they remove arrivals instead of adding meetings. Reviewer hours and the 140 h FTE month are <em>illustrative</em>.'
    },

    api: [
      { m: 'DOC', p: 'Architecture principles (v3)', d: 'Each principle has a <b>statement, rationale and implications</b> (the TOGAF template), e.g. "Services own their data: no shared schemas". 5–10 of them, reviewed yearly.' },
      { m: 'ADR', p: 'docs/adr/0042-adopt-opentelemetry.md', d: 'Context, decision, consequences, status, and <b>who was asked for advice</b>. Lives next to the code; the ADR log is the governance evidence an auditor reads.' },
      { m: 'YAML', p: 'radar/entries.yaml (build-your-own-radar)', d: 'One entry per technology: <code>name, ring, quadrant, isNew, description</code>. Ring moves go through pull requests, so the history of every standard is in Git.' },
      { m: 'POLICY', p: 'Fitness functions (ArchUnit, OPA, budgets)', d: 'Layer rules, no cycles, no Hold-ring dependency, p95 latency budget, SAST/SCA severity threshold. Run in CI; <b>fail the build</b> with a message that links to the rule and its ADR.' },
      { m: 'SQL', p: 'governance_waiver register', d: 'Rule id, service, owner, reason, compensating control, <b>expires_on</b>. CI reads it: a valid waiver turns a failure into a warning; an expired one fails again.' },
      { m: 'GET', p: '/governance/scorecard?team=payments', d: '% rules passing, open and expired waivers, ADR count, median decision wait. Published per team in the developer portal so drift is visible without a meeting.' }
    ],
    dataModel: [
      { name: 'governance_rule', store: 'Postgres (governance catalogue)', fields: [['rule_id', 'text', 'pk'], ['title', 'text'], ['kind', 'AUTOMATED|ADVISORY'], ['severity', 'BLOCK|WARN'], ['adr_ref', 'text'], ['lifecycle', 'PROPOSED|TRIAL|ADOPTED|DEPRECATED']], note: 'The single list of what is governed. Each automated rule points at the fitness function that enforces it and the ADR that explains it.' },
      { name: 'governance_waiver', store: 'Postgres', fields: [['id', 'bigint identity', 'pk'], ['rule_id', 'text', 'fk'], ['service', 'text', 'idx'], ['owner', 'text'], ['reason', 'text'], ['expires_on', 'date', 'idx'], ['approved_by', 'text']], note: 'No row without an expiry. A nightly job lists waivers expiring in 14 days and pings owners.' },
      { name: 'radar_blip', store: 'Git (YAML) → catalogue', fields: [['name', 'text', 'pk'], ['quadrant', 'techniques|platforms|tools|languages'], ['ring', 'adopt|trial|assess|hold'], ['moved_at', 'date'], ['description', 'text']], note: 'Fitness functions read the Hold list to block new uses of discouraged libraries.' },
      { name: 'decision_log', store: 'Postgres (from ADR front-matter)', fields: [['adr_id', 'text', 'pk'], ['service', 'text', 'idx'], ['opened_at', 'timestamptz'], ['decided_at', 'timestamptz'], ['advice_from', 'text[]']], note: 'decided_at − opened_at gives the decision lead time: the metric that tells you whether governance is a bottleneck.' }
    ],

    architecture: {
      title: 'Governance as a feedback system',
      nodes: [
        { id: 'principles', label: 'Principles', sub: '5–10, with rationale', kind: 'policy', wide: [110, 40], tall: [70, 0], tip: 'The few rules everything else derives from, e.g. "services own their data", "secure by default", "prefer managed services".' },
        { id: 'radar', label: 'Tech Radar', sub: 'Adopt·Trial·Assess·Hold', kind: 'policy', wide: [330, 40], tall: [210, 0], tip: 'The lifecycle of each technology choice. Hold means "do not start new work with this"; fitness functions read this list.' },
        { id: 'golden', label: 'Golden paths', sub: 'templates · platform', kind: 'service', wide: [560, 40], tall: [350, 0], tip: 'Service templates and platform defaults that already satisfy most rules. The compliant way is the easy way.' },
        { id: 'arb', label: 'Review board', sub: 'gate (classic model)', kind: 'policy', wide: [800, 40], tall: [350, 105], tip: 'The classic central ARB. Useful for a few high-risk, irreversible decisions; a bottleneck when used for everything.' },
        { id: 'teams', label: 'Product teams', sub: 'decide + own', kind: 'team', wide: [110, 160], tall: [70, 105], tip: 'Teams make decisions and own the consequences. Under the advice process they must seek advice, not permission.' },
        { id: 'forum', label: 'Advice forum', sub: 'weekly, open', kind: 'team', wide: [330, 160], tall: [210, 105], tip: 'Andrew Harmel-Law\'s Architecture Advisory Forum: a regular, open meeting where decisions in flight are discussed and advice is offered. It does not approve.' },
        { id: 'adr', label: 'ADR repository', sub: 'decision evidence', kind: 'store', wide: [560, 160], tall: [210, 210], tip: 'ADRs in each repo (or one central log). They show what was decided, why, and who was consulted.' },
        { id: 'metrics', label: 'Scorecards', sub: 'wait · % pass · waivers', kind: 'store', wide: [800, 160], tall: [350, 210], tip: 'Governance measured: decision lead time, % of rules passing, open and expired waivers, Hold-ring usage.' },
        { id: 'waiver', label: 'Waiver register', sub: 'owner · expiry', kind: 'policy', wide: [110, 280], tall: [210, 315], tip: 'Time-limited exceptions. A valid waiver downgrades a failing check to a warning until its expiry date.' },
        { id: 'ci', label: 'CI fitness fns', sub: 'ArchUnit · OPA · budgets', kind: 'compute', wide: [330, 280], tall: [70, 315], tip: 'Automated architecture checks in every build: dependency rules, cycles, banned libraries, latency budgets, security scans.' },
        { id: 'prod', label: 'Production', sub: 'only checked builds', kind: 'service', wide: [560, 280], tall: [70, 420], tip: 'Only builds that pass (or hold a valid waiver) deploy.' }
      ],
      edges: [
        { from: 'principles', to: 'radar' },
        { from: 'radar', to: 'ci', dashed: true, bend: 0.35 },
        { from: 'golden', to: 'teams', bend: -0.12 },
        { from: 'teams', to: 'forum', bidi: true },
        { from: 'forum', to: 'adr' },
        { from: 'teams', to: 'arb', bend: 0.25 },
        { from: 'arb', to: 'adr' },
        { from: 'teams', to: 'ci' },
        { from: 'waiver', to: 'ci', dashed: true },
        { from: 'ci', to: 'prod' },
        { from: 'ci', to: 'metrics', dashed: true },
        { from: 'adr', to: 'metrics', dashed: true }
      ]
    },

    scenarios: [
      {
        id: 'advice', title: 'A decision via the advice process', tone: 'ok',
        steps: [
          { text: 'The Payments team wants to replace its hand-rolled retry code with a resilience library. Under the <b>advice process</b> they may decide this themselves.', nodes: ['teams'], badges: { teams: 'draft ADR-0042' } },
          { text: 'They check the <b>Tech Radar</b> first: Resilience4j is in <b>Adopt</b>, so there is a paved path and a template.', flow: ['principles>radar', 'golden>teams'], badges: { radar: ['Adopt', 'ok'] } },
          { text: 'They bring the draft to the weekly <b>advice forum</b>. The SRE lead points out the default retry count would hammer the card network during an outage. Advice, not a veto.', flow: ['teams>forum'], badges: { forum: 'advice given' } },
          { text: 'The team adjusts (retry budget, jitter), decides, and merges the <b>ADR</b> with the names of who they asked. Elapsed: 4 days, no approval queue.', flow: ['forum>adr', 'adr>metrics'], ok: ['adr'], badges: { metrics: ['lead time 4 d', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'ci', title: 'Guardrail: fitness function fails the build', tone: 'warn',
        steps: [
          { text: 'A developer adds a quick fix: the domain class imports a web-layer DTO. The change looks harmless in review.', flow: ['teams>ci'], badges: { teams: 'PR #812' } },
          { text: 'The <b>ArchUnit</b> layer rule runs in CI and fails in under a minute: <code>domain..</code> must not depend on <code>web..</code>. The message links the rule and its ADR.', nodes: ['ci'], err: ['ci'], badges: { ci: ['layer rule ✗', 'err'] }, tone: 'err' },
          { text: 'The developer moves the mapping into the web adapter. Green build. No architect was involved, and the feedback arrived while the code was fresh.', flow: ['ci>prod'], ok: ['ci', 'prod'], badges: { ci: ['all rules ✓', 'ok'] }, tone: 'ok' },
          { text: 'The result is recorded: % of builds passing each rule per team, so architects see <b>which rules hurt</b> and whether a rule or a template needs fixing.', flow: ['ci>metrics'], badges: { metrics: '98.4% pass' } }
        ]
      },
      {
        id: 'waiver', title: 'Exception with an expiry date', tone: 'info',
        steps: [
          { text: 'The radar moves an old XML library to <b>Hold</b>. A legacy billing service depends on it and cannot migrate before the quarter-end freeze.', flow: ['radar>ci'], nodes: ['ci'], warn: ['ci'], badges: { radar: ['moved to Hold', 'warn'] } },
          { text: 'The team files a <b>waiver</b>: rule, service, owner, reason, compensating control (input validation), and <b>expires 31 March</b>.', flow: ['waiver>ci'], badges: { waiver: 'until 31 Mar' } },
          { text: 'CI now reports the Hold dependency as a <b>warning</b>, not a failure, and shows the days left. Builds keep shipping.', flow: ['ci>prod'], ok: ['prod'], badges: { ci: ['warn: 42 days left', 'warn'] } },
          { text: 'On 1 April the waiver expires and the build <b>fails again</b>. Either the migration is done or the owner must renew with a reason, which shows up on the scorecard.', nodes: ['ci', 'metrics'], err: ['ci'], badges: { ci: ['waiver expired', 'err'], metrics: '1 expired' }, tone: 'err' }
        ]
      },
      {
        id: 'bottleneck', title: 'Failure: the review board bottleneck', tone: 'err',
        steps: [
          { text: 'Every design must pass the <b>ARB</b>, which meets twice a month and can review about 10 items each time. 30 teams raise about 45 items a month.', flow: ['teams>arb'], hot: ['arb'], badges: { arb: ['45 in · 20 out', 'err'] }, tone: 'err' },
          { text: 'The backlog grows by about 25 a month. Waits pass four weeks. Architects skim to keep up: the board becomes a <b>rubber stamp</b>.', nodes: ['arb'], err: ['arb'], badges: { arb: ['backlog 75', 'err'] } },
          { text: 'Teams relabel changes as "minor" and ship without review. The board sees less, approves more, and catches less risk than before.', flow: ['teams>ci', 'ci>prod'], warn: ['prod'], badges: { prod: ['unreviewed', 'warn'] }, tone: 'warn' },
          { text: 'Fix: automate the checkable rules, turn the ARB into an advice forum, and keep a real <b>gate</b> only for a few irreversible, high-risk decisions (new vendor with customer data, new data store).', flow: ['teams>forum', 'forum>adr', 'teams>ci'], hidden: ['arb'], ok: ['forum', 'ci'], tone: 'ok' }
        ]
      },
      {
        id: 'scale', title: 'At scale: 200 teams, one radar', tone: 'warn',
        steps: [
          { text: 'At 200 teams, one forum cannot hear every decision. Split it by domain, each with its own advice forum, and keep <b>one radar and one set of principles</b>.', nodes: ['forum', 'radar', 'principles'], badges: { forum: '×6 domains' } },
          { text: 'Golden paths do most of the work: new services start from a template that already passes every automated rule.', flow: ['golden>teams', 'teams>ci', 'ci>prod'], ok: ['golden'], badges: { golden: ['80% of new svcs', 'ok'] } },
          { text: 'Fitness functions now guard thousands of builds a day. Watch for <b>flaky or slow rules</b>: a rule that cries wolf gets waived everywhere.', nodes: ['ci'], warn: ['ci'], badges: { ci: ['flaky rule?', 'warn'] }, tone: 'warn' },
          { text: 'Scorecards replace status meetings: decision lead time, % passing, waivers open and expired, per domain. Architects spend their time on the red cells.', flow: ['ci>metrics', 'adr>metrics'], ok: ['metrics'], tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Pick a governance model, how rules are enforced, and how exceptions work. Scores are <em>illustrative</em> for an organisation of ~30 teams.',
      controls: [
        { id: 'model', label: 'Governance model', type: 'seg', value: 'guard', options: [
          { v: 'none', l: 'No governance' }, { v: 'arb', l: 'Central ARB gate' }, { v: 'advice', l: 'Advice process + ADRs' }, { v: 'guard', l: 'Guardrails + fitness fns + radar' }] },
        { id: 'enf', label: 'Enforcement', type: 'seg', value: 'ci', options: [
          { v: 'manual', l: 'Manual review' }, { v: 'ci', l: 'CI fitness functions' }] },
        { id: 'exc', label: 'Exception handling', type: 'seg', value: 'expiring', options: [
          { v: 'none', l: 'No exceptions' }, { v: 'expiring', l: 'Expiring waivers' }] }
      ],
      evaluate(s) {
        const c = (x) => Math.max(0.03, Math.min(0.97, x));
        const M = s.model, ci = s.enf === 'ci', W = s.exc === 'expiring';
        let cons = { none: 0.15, arb: 0.6, advice: 0.5, guard: 0.7 }[M] + (ci ? 0.2 : 0) + (W ? 0 : -0.08);
        let speed = { none: 0.9, arb: 0.2, advice: 0.7, guard: 0.75 }[M] + (ci ? 0.1 : -0.12) + (W ? 0.05 : -0.15);
        let auto = { none: 0.95, arb: 0.15, advice: 0.8, guard: 0.7 }[M] + (ci ? 0.05 : -0.05) + (W ? 0.05 : -0.1);
        let risk = { none: 0.1, arb: 0.45, advice: 0.5, guard: 0.65 }[M] + (ci ? 0.25 : 0) + (W ? 0.03 : -0.1);
        let load = { none: 0.95, arb: 0.15, advice: 0.6, guard: 0.7 }[M] + (ci ? 0.15 : -0.15) + (W ? -0.03 : 0.05);
        if (M === 'none') { cons = Math.min(cons, 0.35); risk = Math.min(risk, 0.35); }
        if (M === 'arb' && !W) risk -= 0.1; // teams relabel changes to dodge a no-exception gate
        const word = (x, a, b, d) => (x >= 0.7 ? a : x >= 0.45 ? b : d);
        const metrics = [
          { k: 'Consistency', v: word(cons, 'high, checked every build', 'partial', 'low: every team differs'), s: c(cons) },
          { k: 'Delivery speed', v: word(speed, 'minutes of feedback', 'days of waiting', 'weeks in a queue'), s: c(speed) },
          { k: 'Team autonomy', v: word(auto, 'teams decide', 'decide within rules', 'ask permission'), s: c(auto) },
          { k: 'Risk caught', v: word(risk, 'most known risks', 'some', 'little, or too late'), s: c(risk) },
          { k: 'Architect load', v: word(load, 'curating rules', 'advising', 'reviewing all day'), s: c(load), hint: 'higher = lighter' }
        ];
        const notes = [];
        if (M === 'none') notes.push('No governance is fine for 2–3 teams. At 30 you get <b>five logging stacks</b>, incompatible APIs and nobody who can answer "where do we use library X?" during an incident.');
        if (M === 'arb') notes.push('A gate turns architects into a queue. Load near 100% means waits measured in weeks (see <b>Model it</b>). Keep a gate only for <b>rare, irreversible</b> decisions.');
        if (M === 'advice') notes.push('The advice process (Harmel-Law) keeps decisions with the team, but nothing <b>checks</b> the outcome. Pair it with fitness functions so agreed rules stay true after the meeting.');
        if (M === 'guard') notes.push('Radar + golden paths + fitness functions make the right choice the easy one and check it continuously. Keep an advice forum for the judgement calls rules cannot express.');
        if (!ci) notes.push('Manual enforcement checks a design <b>once</b>, at review time. Code drifts afterwards; a CI rule checks it on every commit.');
        if (!W) notes.push('With no exception path, a rule that does not fit is either ignored or blocks a release. Teams learn to hide things rather than ask.');
        if (W) notes.push('Waivers with an <b>expiry</b> keep exceptions visible and temporary. Report open and expired counts on the scorecard.');
        let verdict;
        if (M === 'none') verdict = '❌ <b>No governance:</b> fast for a quarter, then integration pain and unmanaged risk across teams.';
        else if (M === 'arb' && !ci) verdict = '❌ <b>Central gate with manual checks:</b> slow, overloaded architects, and teams route around it. Classic review-board bottleneck.';
        else if (M === 'arb') verdict = '⚠ <b>Gate plus automation:</b> CI catches the basics, but every decision still waits for a meeting. Turn the gate into advice for most changes.';
        else if (M === 'guard' && ci && W) verdict = '✅ <b>Guardrails, not gates:</b> automated rules on every build, a radar for choices, expiring waivers and advice for the rest. Say this in the interview.';
        else if (!ci) verdict = '⚠ <b>Good intent, no feedback loop:</b> rules agreed in meetings drift in code. Automate the checkable ones.';
        else if (!W) verdict = '⚠ <b>Too rigid:</b> no way to make a reasoned exception, so rules get disabled or ignored. Add expiring waivers.';
        else verdict = '👍 <b>Advice process with automated checks:</b> fast and autonomous. Add a radar and golden paths to make the defaults obvious.';
        const hide = [];
        if (M !== 'arb') hide.push('arb');
        if (M === 'arb' || M === 'none') hide.push('forum');
        if (M !== 'guard') hide.push('golden', 'radar');
        if (!ci) hide.push('ci');
        if (!W) hide.push('waiver');
        if (M === 'none') hide.push('principles', 'adr');
        const flow = [];
        if (M === 'guard') flow.push('golden>teams');
        if (M === 'arb') flow.push('teams>arb', 'arb>adr');
        if (M === 'advice' || M === 'guard') flow.push('teams>forum', 'forum>adr');
        if (ci) { if (W) flow.push('waiver>ci'); flow.push('teams>ci', 'ci>prod', 'ci>metrics'); }
        const badges = {};
        if (M === 'arb') badges.arb = ['queue: weeks', 'err'];
        if (ci) badges.ci = ['every build', 'ok'];
        if (W) badges.waiver = ['expiry ⏱', 'info'];
        return {
          metrics, verdict, notes: notes.slice(0, 4), hide, flow, badges,
          labels: { teams: { label: 'Product teams', sub: M === 'arb' ? 'ask permission' : M === 'none' ? 'anything goes' : 'decide + own' } },
          hot: M === 'arb' ? ['arb'] : [],
          warn: M === 'none' ? ['teams'] : [],
          err: M === 'arb' && !ci ? ['arb'] : [],
          ok: ci ? ['ci'] : []
        };
      }
    },

    widget: {
      title: 'CI fitness-function runner',
      caption: 'A sample service: packages, their dependencies, libraries and a latency sample. <b>Introduce a bad change</b> and watch the real checks run (cycle search, layer rule, radar Hold list, p95 budget). Grant a <b>waiver</b> with an expiry date to turn a failure into a warning, and move <b>radar blips</b> between rings to see a rule start failing without any code change.'
    },

    realWorld: {
      intro: 'The modern practice moved from approval boards towards advice, automation and paved roads. These are the primary write-ups.',
      timeline: [
        { when: '1990s → today', who: 'The Open Group', title: 'TOGAF: Architecture Board and compliance reviews', text: 'TOGAF describes an <b>Architecture Board</b> that owns the architecture and signs off <b>Architecture Compliance reviews</b>, with checklists per domain, and a principles template (statement, rationale, implications). Common critique: applied literally it is heavyweight and slow for product teams; most organisations tailor it.', src: 0 },
        { when: '2010', who: 'Thoughtworks', title: 'Technology Radar', text: 'Thoughtworks publishes its radar twice a year: blips in four quadrants placed in rings. Adopt means proven and mature; <b>Trial</b> needs production experience; Assess is worth exploring. The outer ring was <b>Hold</b>; recent editions call it <b>Caution</b>. Blips normally appear for one edition unless they move.', src: 1 },
        { when: '2011', who: 'Michael Nygard', title: 'Documenting Architecture Decisions', text: 'Nygard proposed short <b>Architecture Decision Records</b> kept with the code: context, decision, status, consequences. ADR logs became the lightweight evidence trail that governance can point to.', src: 2 },
        { when: '2016', who: 'Zalando', title: 'Open-sourced Tech Radar', text: 'Zalando published its own radar and released the visualisation code so others could <b>build their own</b>. Its radar is how teams see which technologies are recommended company-wide.', src: 3 },
        { when: '2017 · 2022', who: 'Ford, Parsons, Kua (+ Sadalage)', title: 'Building Evolutionary Architectures', text: 'Introduced <b>architectural fitness functions</b>: objective checks of an architectural characteristic, atomic or holistic, triggered or continual. The 2nd edition (2022) focuses on <b>automating architectural governance</b> with them.', src: 4 },
        { when: '2018', who: 'Netflix', title: 'Full cycle developers and the paved road', text: 'Netflix describes central teams building a common platform, the <b>paved road</b>, while each team keeps the freedom to deviate from it. Governance by making the supported way the attractive way.', src: 5 },
        { when: '2020', who: 'Spotify', title: 'Golden Paths against fragmentation', text: 'Spotify introduced <b>Golden Paths</b>, opinionated supported routes for building backend, client, data and ML software, to fight a fragmented ecosystem. The first began as a Hack Week project.', src: 6 },
        { when: '2021', who: 'Andrew Harmel-Law', title: 'Scaling the Practice of Architecture, Conversationally', text: 'On martinfowler.com: the <b>advice process</b> has one rule and one qualifier: <b>anyone can make an architectural decision</b>, as long as they first seek advice from everyone meaningfully affected and from people with expertise. Supported by ADRs, an advisory forum, principles and a tech radar. Expanded in his 2024 book <i>Facilitating Software Architecture</i>.', src: 7 },
        { when: 'today', who: 'TNG · ArchUnit', title: 'Architecture rules as unit tests', text: 'ArchUnit checks package and class dependencies, layers and slices (including <b>cycles</b>) as JUnit tests, the most common way Java shops automate structural governance.', src: 8 }
      ],
      lessons: [
        'Separate <b>checkable rules</b> (automate them) from <b>judgement calls</b> (advise on them).',
        'Seek advice, not permission: decision speed is a governance outcome, so measure it.',
        'Make the governed choice the <b>easy</b> one: radar + golden paths beat mandates.',
        'Every exception has an owner and an <b>expiry</b>; report them openly.',
        'Keep a hard gate only for rare, irreversible, high-risk decisions.'
      ],
      sources: [
        { title: 'The TOGAF Standard: Architecture Capability and Governance', url: 'https://pubs.opengroup.org/togaf-standard/ea-capability-and-governance/index.html', pub: 'The Open Group' },
        { title: 'Technology Radar FAQ', url: 'https://www.thoughtworks.com/en-in/radar/faq', pub: 'Thoughtworks' },
        { title: 'Documenting Architecture Decisions', url: 'https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions', pub: 'Michael Nygard, Cognitect blog, 2011' },
        { title: 'Zalando\'s Tech Radar: All you need to know', url: 'https://engineering.zalando.com/posts/2016/05/zalando-tech-radar.html', pub: 'Zalando Engineering, 2016' },
        { title: 'Building Evolutionary Architectures, 2nd edition', url: 'https://www.thoughtworks.com/en-us/insights/books/building-evolutionaryarchitectures-second-edition', pub: 'Ford, Parsons, Kua, Sadalage (O\'Reilly / Thoughtworks), 2022' },
        { title: 'Netflix full cycle developers', url: 'https://www.infoq.com/news/2018/06/netflix-full-cycle-developers/', pub: 'InfoQ on the Netflix Technology Blog, 2018' },
        { title: 'How We Use Golden Paths to Solve Fragmentation in Our Software Ecosystem', url: 'https://engineering.atspotify.com/2020/8/how-we-use-golden-paths-to-solve-fragmentation-in-our-software-ecosystem', pub: 'Spotify Engineering, 2020' },
        { title: 'Scaling the Practice of Architecture, Conversationally', url: 'https://martinfowler.com/articles/scaling-architecture-conversationally.html', pub: 'Andrew Harmel-Law, martinfowler.com, 2021' },
        { title: 'ArchUnit User Guide', url: 'https://archunit.org/userguide/html/000_Index.html', pub: 'TNG Technology Consulting' },
        { title: 'Build Your Own Radar', url: 'https://github.com/thoughtworks/build-your-own-radar', pub: 'Thoughtworks (open source)' },
        { title: 'Zalando Tech Radar (live)', url: 'https://opensource.zalando.com/tech-radar', pub: 'Zalando' }
      ]
    },

    tradeoffs: {
      headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
      rows: [
        ['Who decides', '<b>Central ARB</b> approves', '<b>Advice process</b>: team decides after seeking advice', 'Advice by default; a board only for rare, costly-to-reverse decisions (new vendor with PII, new database engine)'],
        ['How rules hold', '<b>Gate</b>: stop until approved', '<b>Guardrail</b>: always-on automated check', 'Guardrails for anything checkable; gates only where a machine cannot judge and the risk is high'],
        ['Enforcement point', '<b>Design review</b> (once, early)', '<b>CI / deploy policy</b> (every change)', 'Both: review shapes the idea, CI stops drift afterwards'],
        ['Standards', '<b>Mandated list</b>', '<b>Radar + golden paths</b> (recommended, supported)', 'Mandate only security and interoperability must-haves; recommend the rest and make it easy'],
        ['Exceptions', '<b>None allowed</b>', '<b>Expiring waivers</b> with owner', 'Always allow reasoned, time-limited exceptions; zero exceptions just hides them'],
        ['Framework', '<b>TOGAF-style</b> formal EA process', '<b>Lightweight</b>: principles, ADRs, radar, fitness functions', 'Formal where regulators expect it (tailored); lightweight for product engineering']
      ]
    },
    failures: [
      { f: 'Ivory tower architecture', detect: 'Standards written by people who do not build with them; teams cannot name the principles; rules contradict the platform', fix: 'Architects pair with teams and own a golden path; every rule has an ADR and a fitness function or it is advice' },
      { f: 'Review board bottleneck', detect: 'Decision lead time in weeks; board load near 100%; agenda always full', fix: 'Automate checkable rules, switch to the advice process, keep a gate only for a short list of high-risk decision types' },
      { f: 'Rubber stamp reviews', detect: 'Approval rate ~100%; reviews under 10 minutes; incidents trace back to approved designs', fix: 'Review fewer things more deeply; replace box-ticking with automated checks and scenario-based reviews' },
      { f: 'Standards nobody follows', detect: '% compliant unknown or low; many services on Hold-ring tech; "we didn\'t know"', fix: 'Publish the radar where developers look (portal, PR bot), add a check, provide a migration path' },
      { f: 'Permanent exceptions', detect: 'Waivers without expiry or renewed many times; open waiver count rising', fix: 'Mandatory expiry, auto-reminders, scorecard reporting; repeated waivers mean the rule needs changing' },
      { f: 'Flaky or slow fitness functions', detect: 'Rule failure rate unrelated to code changes; teams waive or disable it everywhere', fix: 'Treat rules as product code: tests, ownership, fast feedback; start as WARN, promote to BLOCK when stable' },
      { f: 'Governance by surprise', detect: 'Radar change breaks builds overnight; teams learn of a rule from a red pipeline', fix: 'Lifecycle with notice: propose → trial → adopt → deprecate; new rules warn for a period before they block' }
    ],

    interview: [
      { q: 'Why does an organisation need architecture governance, and what is the tension?', a: '<p>Governance protects what no single team owns: <b>consistency</b> (systems that integrate and can be operated the same way), <b>risk</b> (security, compliance, data protection) and <b>interoperability</b> (shared APIs, identity, events).</p><p>The tension is with <b>team autonomy and flow</b>. Every central decision is a queue, and teams that wait lose context and speed. Good governance gets the shared outcomes with the <b>fewest blocking points</b>: automate the checkable, advise on the rest.</p>', lvl: 'core' },
      { q: 'What is the architecture advice process?', a: '<p>Described by Andrew Harmel-Law on martinfowler.com (2021): <b>anyone can make an architectural decision</b>, with one qualifier: before deciding, they must seek advice from <b>everyone meaningfully affected</b> and from <b>people with expertise</b>.</p><p>Advice is not permission: the decider owns the decision and need not follow it, but must listen. It is supported by ADRs, an <b>architecture advisory forum</b>, principles and a tech radar.</p><p>Common misreading: "no governance". It is a different decision mechanism that still leaves evidence and still sits inside agreed principles and automated rules.</p>', lvl: 'core' },
      { q: 'Guardrails vs gates: what is the difference and when do you use each?', a: '<p>A <b>gate</b> stops work until a person approves (a review board, a sign-off). A <b>guardrail</b> is an always-on boundary checked automatically (a CI rule, a deploy policy, a platform default).</p><p>Use guardrails for anything a machine can check: dependencies, banned libraries, encryption flags, latency budgets. Keep gates for <b>rare, high-risk, hard-to-reverse</b> decisions where judgement is needed, and give them a service-level target for how fast they answer.</p>', lvl: 'core' },
      { q: 'What is a fitness function? Give examples you would automate.', a: '<p>From <i>Building Evolutionary Architectures</i> (Ford, Parsons, Kua, 2017): an <b>objective function used to assess how close an architecture is to a goal</b>. They can be atomic or holistic, triggered or continual.</p><ul><li><b>ArchUnit</b>: domain must not depend on web; no package cycles.</li><li><b>Dependency policy</b> (OPA or a build plugin): no library on the radar\'s Hold list.</li><li><b>Performance budget</b>: p95 under 200 ms in a load-test stage.</li><li><b>Security scan</b>: no critical CVEs (SCA), no secrets in code.</li></ul><p>Each one fails the build with a message pointing to the rule and its ADR.</p>', lvl: 'core' },
      { q: 'How does a tech radar work, and how would you run one internally?', a: '<p>Thoughtworks places technologies ("blips") in four quadrants (techniques, platforms, tools, languages and frameworks) and four rings: <b>Adopt</b>, <b>Trial</b>, <b>Assess</b>, <b>Hold</b> (renamed Caution in recent editions).</p><p>Internally: keep entries in Git (the open-source build-your-own-radar reads CSV or JSON), move blips through pull requests reviewed by a small group of practitioners, publish twice a year, and wire the Hold list into a fitness function so new uses fail CI. The ring is the <b>standards lifecycle</b>: assess → trial → adopt → hold/deprecate.</p>', lvl: 'core' },
      { q: 'How do you handle exceptions to a standard?', a: '<p>Make them <b>explicit and temporary</b>: a waiver record with the rule, service, owner, reason, compensating control and an <b>expiry date</b>. CI reads it, so a valid waiver downgrades a failure to a warning, and an expired one fails again.</p><p>Report open and expired waivers on a scorecard. If the same rule keeps getting waived, the <b>rule is wrong</b> or the paved road is missing, so fix that instead.</p>', lvl: 'core' },
      { q: 'Our ARB has a 4-week backlog. What do you do?', a: '<p>Treat it as a queue. With arrivals above capacity the wait grows without bound, so more meetings only buy time.</p><ol><li><b>Measure</b> decision lead time and classify the backlog.</li><li><b>Automate</b> the recurring checks (library choice, layering, encryption) as fitness functions, removing those arrivals.</li><li>Switch the rest to the <b>advice process</b> with ADRs and a weekly forum.</li><li>Keep a gate for a <b>short list</b> of decision types and give it a target (e.g. answer within 5 days).</li></ol><p>Then show the numbers: lead time, % automated, waivers.</p>', lvl: 'deep' },
      { q: 'What is TOGAF\'s view of governance, and what are its critiques?', a: '<p>The Open Group\'s TOGAF defines an <b>Architecture Board</b>, <b>Architecture Compliance reviews</b> with checklists, and principles with statement, rationale and implications. It is useful vocabulary and expected in some regulated enterprises.</p><p>Critiques: heavyweight documentation, review late in the lifecycle, and a central-control mindset that fits poorly with continuous delivery and autonomous teams. Most organisations <b>tailor</b> it: keep principles and the compliance idea, replace document reviews with automated checks.</p>', lvl: 'deep' },
      { q: 'How do you measure whether governance is working?', a: '<ul><li><b>Decision lead time</b>: request to decision (from ADR timestamps).</li><li><b>% compliant</b> per rule and team, and <b>% of rules automated</b>.</li><li><b>Exceptions</b>: open, expiring soon, expired.</li><li><b>Outcome metrics</b>: incidents traced to known rule breaches, Hold-ring usage trend, DORA lead time before and after a new rule.</li></ul><p>If lead time rises while incidents do not fall, governance is costing more than it saves.</p>', lvl: 'deep' },
      { q: 'Behavioural: tell me about a time you replaced a slow approval process.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> 25 teams, a bi-weekly design review with a 3-week backlog; teams were bypassing it.</p><p><b>T:</b> As principal architect, cut wait time without losing control over security risks.</p><p><b>A:</b> Pulled 6 months of review outcomes: 70% were library or layering questions with a known answer. Encoded those as ArchUnit and dependency checks, published a radar, and moved the rest to an advice process with a weekly open forum and ADRs. Kept a gate only for new vendors handling customer data.</p><p><b>R:</b> Median decision wait went from ~18 to ~4 days in a quarter, and the security team got a list of every Hold-ring dependency for the first time. Lesson: I should have started the rules in warn mode; two blocked releases in week one cost goodwill.</p>', lvl: 'deep' },
      { q: 'Behavioural: describe a time a team pushed back on a standard you set.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> We mandated one HTTP client library; the data-streaming team said it could not handle their back-pressure needs.</p><p><b>T:</b> Keep consistency without forcing a bad fit.</p><p><b>A:</b> Asked them to write an ADR comparing options and brought it to the advice forum. They were right for their workload. We granted a waiver for 6 months, they trialled the alternative, and it moved to <b>Trial</b> on the radar for streaming use.</p><p><b>R:</b> The standard became "one of two clients, by workload", and the team became the owner of the second option. Lesson: a standard is a hypothesis; exceptions are how you find out it needs to change.</p>', lvl: 'deep' },
      { q: 'How would you introduce governance in a 15-team startup that has none?', a: '<p>Start light and useful:</p><ol><li>Write <b>5–7 principles</b> with the teams.</li><li>Start ADRs in every repo and a weekly <b>advice forum</b>.</li><li>Publish a first <b>radar</b> of what is actually used.</li><li>Add 3 fitness functions that guard real pain (no cycles, no critical CVEs, a p95 budget) in <b>warn mode</b>, then block.</li><li>Build one golden-path template.</li></ol><p>In the interview, frame it as reducing risk and integration cost while protecting team speed, with a metric for each.</p>', lvl: 'core' }
    ],

    code: [
      {
        title: 'ArchUnit (JUnit 5): layers, cycles, forbidden packages', lang: 'java',
        code: `// ArchUnit 1.x with archunit-junit5, Java 21, Spring Boot 3
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

@AnalyzeClasses(packages = "com.acme.orders",
                importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureRulesTest {

  @ArchTest
  static final ArchRule layers = layeredArchitecture()
      .consideringOnlyDependenciesInLayers()
      .layer("Web").definedBy("..web..")
      .layer("Application").definedBy("..app..")
      .layer("Domain").definedBy("..domain..")
      .layer("Infrastructure").definedBy("..infra..")
      .whereLayer("Web").mayNotBeAccessedByAnyLayer()
      .whereLayer("Application").mayOnlyBeAccessedByLayers("Web")
      .whereLayer("Domain").mayOnlyBeAccessedByLayers("Application", "Infrastructure")
      .because("ADR-0007: hexagonal layering; the domain stays framework-free");

  @ArchTest
  static final ArchRule noCycles = slices()
      .matching("com.acme.orders.(*)..")
      .should().beFreeOfCycles();

  @ArchTest // radar: Hold
  static final ArchRule noHoldLibraries = noClasses()
      .should().dependOnClassesThat()
      .resideInAnyPackage("org.apache.log4j..", "org.joda.time..")
      .because("Tech Radar: log4j 1.x and Joda-Time are on Hold (ADR-0019)");
}`,
        note: 'Runs as a normal unit test, so it fails the build in seconds. For a large legacy codebase, wrap a rule in <code>FreezingArchRule.freeze(...)</code> to record existing violations and fail only on new ones.'
      },
      {
        title: 'Build-your-own-radar entries (CSV) + GitHub Actions gate', lang: 'yaml',
        code: `# radar/blips.csv  (columns read by thoughtworks/build-your-own-radar)
# name,ring,quadrant,isNew,description
# Resilience4j,adopt,languages-and-frameworks,FALSE,Default for retries (ADR-0042)
# OpenTelemetry,adopt,tools,FALSE,Standard tracing SDK
# Joda-Time,hold,languages-and-frameworks,FALSE,Use java.time
# log4j 1.x,hold,languages-and-frameworks,FALSE,EOL since 2015

# .github/workflows/fitness-functions.yml
name: fitness-functions
on: [pull_request]
jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '21', cache: maven }
      - name: ArchUnit rules (layers, cycles, Hold libraries)
        run: ./mvnw -B -q test -Dtest='ArchitectureRulesTest'
      - name: Dependency policy vs radar Hold list (OPA)
        run: |
          ./mvnw -B -q dependency:list -DoutputFile=deps.txt
          python3 scripts/deps_to_json.py deps.txt > deps.json
          opa eval --fail-defined -d policy/ -i deps.json \\
            'data.governance.deny[msg]'
      - name: Performance budget (p95 < 200 ms)
        run: |
          k6 run --summary-export=k6.json perf/smoke.js
          jq -e '.metrics.http_req_duration["p(95)"] < 200' k6.json`,
        note: 'Each step exits non-zero on violation, which fails the job and blocks the merge when the check is required in branch protection. <code>opa eval --fail-defined</code> fails when the deny set is non-empty. The <code>deps_to_json.py</code> helper is assumed.'
      },
      {
        title: 'OPA (Rego v1): no Hold-ring dependency unless a valid waiver', lang: 'bash',
        code: `# policy/governance.rego  (OPA 1.x, Rego v1 syntax)
package governance

# radar: data.radar.hold = ["joda-time:joda-time", "log4j:log4j"]
# waivers: data.waivers = [{"artifact": "log4j:log4j",
#   "service": "billing", "expires": "2027-03-31", "owner": "team-billing"}]

hold contains a if some a in data.radar.hold

waived(artifact) if {
  some w in data.waivers
  w.artifact == artifact
  w.service == input.service
  time.parse_ns("2006-01-02", w.expires) > time.now_ns()
}

deny contains msg if {
  some d in input.dependencies
  key := sprintf("%s:%s", [d.group, d.artifact])
  key in hold
  not waived(key)
  msg := sprintf("%s is on Hold in the Tech Radar; migrate or file a waiver", [key])
}

warn contains msg if {
  some d in input.dependencies
  key := sprintf("%s:%s", [d.group, d.artifact])
  key in hold
  waived(key)
  msg := sprintf("%s allowed by waiver until expiry", [key])
}`,
        note: 'Policy as code: the radar Hold list and the waiver register are data, so moving a blip or expiring a waiver changes the result without touching the policy. Test it with <code>opa test</code>.'
      }
    ],

    related: ['rfcs-adrs', 'documenting-architecture', 'design-principles', 'platform-engineering', 'quality-attributes', 'conways-law', 'tech-debt']
  });
})();
