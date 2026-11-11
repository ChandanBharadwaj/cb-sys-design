SD.register({
  slug: 'conways-law',
  domain: 9,
  title: 'Conway\'s Law & Team Topologies',
  examples: 'Conway 1968, Team Topologies',
  tagline: 'Your system ends up shaped like the <b>communication structure</b> of the organisation that builds it, so design the teams and the architecture <b>together</b>.',
  tldr: {
    problem: 'Teams are cut by skill (frontend, backend, DBA, ops), so every feature crosses four teams, waits in four queues, and the code grows the same four tightly coupled layers.',
    idea: 'Accept <b>Conway\'s Law</b> and use it on purpose: give each <b>stream-aligned team</b> a slice of the domain it owns end to end, back it with a <b>platform</b> it consumes as a service, and keep <b>cognitive load</b> within what one team of 5–9 people can hold.',
    insight: 'You cannot draw service boundaries that cut across team boundaries and expect them to last. The <b>Inverse Conway Manoeuvre</b>: change the team structure first, and the architecture follows.',
    numbers: [
      { v: '1968', l: 'Conway\'s "How Do Committees Invent?" published in Datamation' },
      { v: '4 · 3', l: 'team types · interaction modes (Team Topologies, Skelton & Pais, 2019)' },
      { v: 'up to 6×', l: 'less modular code from tightly coupled orgs in matched pairs (MacCormack et al., 2012)' }
    ]
  },

  intro: {
    what: 'Conway\'s Law says that the structure of a software system <b>copies the way the people who build it talk to each other</b>. Teams that talk all day build parts that are tightly connected; teams that rarely talk build parts joined by a thin, formal interface. <b>Team Topologies</b> is a practical method that uses this: it designs teams, their boundaries and how they interact so the architecture you want is the easy one to build.',
    analogy: {
      icon: '🏗️',
      title: 'Building a house with three separate trades',
      text: 'Hire one company for walls, another for plumbing and a third for wiring, and make them talk only through formal change requests. You get a house where the pipes and cables run exactly where the contracts said, and every change needs all three companies to agree. A small crew that builds the whole kitchen together moves faster, and the kitchen fits together better. The analogy has a limit: software teams can also share a <i>platform</i> (like a shared toolbox) without having to coordinate on every job.'
    },
    problem: 'A company splits engineering into a <b>frontend team</b>, a <b>backend team</b> and a <b>database team</b>. A simple feature such as "save for later" needs a button, an endpoint and a column, so it waits in three backlogs. The code also ends up in three layers that must release together. The question this topic answers is: <b>how should we cut the teams so that most changes need only one team?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Organise by skill: one team per layer',
        text: 'It feels efficient: specialists sit together, share standards and review each other\'s work. Each team owns one <b>technical layer</b> of the system.',
        scene: {
          nodes: [
            { id: 'pm', label: 'Product', sub: 'new feature', kind: 'person', at: [210, 0] },
            { id: 'fe', label: 'Frontend team', sub: 'owns the UI', kind: 'team', at: [70, 110] },
            { id: 'be', label: 'Backend team', sub: 'owns the APIs', kind: 'team', at: [210, 110] },
            { id: 'db', label: 'DBA team', sub: 'owns schemas', kind: 'team', at: [350, 110] }
          ],
          edges: [{ from: 'pm', to: 'fe' }, { from: 'pm', to: 'be' }, { from: 'pm', to: 'db' }],
          flow: [['pm>fe', 'pm>be', 'pm>db']]
        }
      },
      {
        stage: 'breaks',
        title: 'Every feature becomes a relay race',
        text: 'One feature now needs <b>three teams</b>, three backlogs and two hand-offs. Each hand-off waits for the next team\'s sprint. The code mirrors the org: a UI layer, an API layer and a shared database that all have to <b>release together</b>.',
        scene: {
          nodes: [
            { id: 'pm', label: 'Product', sub: 'waiting…', kind: 'person', at: [210, 0] },
            { id: 'fe', label: 'Frontend team', sub: 'done, blocked', kind: 'team', at: [70, 110] },
            { id: 'be', label: 'Backend team', sub: 'next sprint', kind: 'team', at: [210, 110] },
            { id: 'db', label: 'DBA team', sub: 'ticket queue', kind: 'team', at: [350, 110] },
            { id: 'sys', label: 'Shared DB', sub: 'lockstep release', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'pm', to: 'fe' }, { from: 'fe', to: 'be' }, { from: 'be', to: 'db' }, { from: 'db', to: 'sys' }],
          flow: ['pm>fe', 'fe>be', 'be>db', 'db>sys'],
          warn: ['be'], err: ['db'],
          badges: { db: ['queue', 'err'], pm: ['+2 hand-offs', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Organise by flow: one team per slice of the business',
        text: 'A <b>stream-aligned team</b> owns "Checkout" end to end: UI, API and data. A <b>platform team</b> offers deployment and monitoring as a <b>self-service product</b>. Most features now need one team and zero hand-offs.',
        scene: {
          nodes: [
            { id: 'pm', label: 'Product', sub: 'new feature', kind: 'person', at: [210, 0] },
            { id: 'fe', label: 'Checkout team', sub: 'UI + API + data', kind: 'team', at: [70, 110] },
            { id: 'be', label: 'Search team', sub: 'UI + API + data', kind: 'team', at: [210, 110] },
            { id: 'pl', label: 'Platform team', sub: 'self-service', kind: 'team', at: [350, 110] },
            { id: 'sys', label: 'Checkout svc', sub: 'own data', kind: 'service', at: [70, 220] }
          ],
          edges: [{ from: 'pm', to: 'fe' }, { from: 'fe', to: 'sys' }, { from: 'pl', to: 'sys', dashed: true }],
          flow: ['pm>fe', 'fe>sys', 'pl>sys'],
          ok: ['fe', 'sys'],
          badges: { fe: ['0 hand-offs', 'ok'] }
        }
      }
    ],
    usedBy: ['Amazon (two-pizza teams)', 'Spotify (squads, with caveats)', 'Team Topologies adopters', 'Backstage software catalog users', 'Microservice migrations generally'],
    whenToUse: [
      'Several teams work on <b>one product</b> and features keep crossing team boundaries',
      'You are splitting a monolith and need to decide <b>who owns which service</b>',
      'Lead time is dominated by <b>waiting</b> for other teams, not by building'
    ],
    whenNot: [
      'One team of 5–9 people builds everything: a well-structured <b>monolith</b> is fine, and Conway predicts it',
      'You want a reorg to fix a problem that is really unclear product strategy',
      'You are choosing service boundaries without domain analysis: start with <a href="ddd.html">Domain-Driven Design</a> and bounded contexts'
    ],
    glossary: [
      { term: 'Conway\'s Law', def: 'Organisations produce system designs that copy their own communication structure.' },
      { term: 'Inverse Conway Manoeuvre', def: 'Changing team structure on purpose so the desired architecture emerges.' },
      { term: 'Stream-aligned team', def: 'A team aligned to one flow of change (a product, journey or user segment) that delivers end to end.' },
      { term: 'Platform team', def: 'A team that offers internal services (deploy, observability, data) that stream-aligned teams consume with little coordination.' },
      { term: 'Enabling team', def: 'Specialists who coach other teams in a new skill for a limited time, then step away.' },
      { term: 'Cognitive load', def: 'How much a team must keep in its head to do its work; Team Topologies splits it into intrinsic, extraneous and germane.' },
      { term: 'Fracture plane', def: 'A natural seam along which to split a system and its team, such as a business domain, a regulatory boundary or a different rate of change.' },
      { term: 'Hand-off', def: 'A point where work must wait for another team before it can continue.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Design teams and architecture together</b>: every service boundary should match a team boundary',
      'Cut teams along <b>fracture planes</b>: business domain (bounded context), regulation, change cadence, risk, user persona',
      'Default to <b>stream-aligned teams</b>; add platform, enabling and complicated-subsystem teams only to reduce their load',
      'Give every team a <b>team API</b>: what it owns, how to ask it for things, how it communicates',
      'Choose an <b>interaction mode</b> per team pair: collaboration (time-boxed), X-as-a-Service or facilitating',
      'Size the scope to the team: limit <b>cognitive load</b>, not just headcount (5–9 people per team)'
    ],
    nonFunctional: [
      '<b>Hand-offs per feature</b> ≤ 1 for most work (measure from tickets)',
      '<b>Lead time</b> for change measured and falling (a DORA metric)',
      '<b>Cross-team dependency edges</b> &lt; ~20% of all service edges (rule of thumb)',
      'Every service and repo has <b>exactly one owning team</b> in the catalog',
      'Platform onboarding is <b>self-service</b>: a new service reaches production without a ticket',
      'Collaboration periods have an <b>end date</b> (e.g. 1–3 months, rule of thumb)'
    ],
    outOfScope: [
      '<b>Component / layer teams</b> for product work: every feature becomes a relay race',
      'A shared <b>"integration" team</b> that wires other teams\' changes together',
      'A <b>platform run as a ticket queue</b> instead of a product',
      'A <b>distributed monolith</b>: services that must deploy together because the teams were never separated',
      'Copying the <b>"Spotify model"</b> names (squads, tribes) without its context'
    ]
  },

  calculator: {
    inputs: [
      { id: 'eng', label: 'Engineers in the product group', min: 5, max: 1000, value: 120, log: true },
      { id: 'size', label: 'Team size', min: 3, max: 15, value: 8, unit: 'people' },
      { id: 'deps', label: 'Other teams a typical feature needs', min: 0, max: 6, step: 0.5, value: 1.5 },
      { id: 'delay', label: 'Wait per hand-off (queue + sprint alignment)', min: 0.5, max: 20, step: 0.5, value: 4, unit: 'days' },
      { id: 'work', label: 'Hands-on work per feature', min: 1, max: 30, value: 5, unit: 'days' }
    ],
    outputs: [
      { label: 'Number of teams', f: (v) => Math.ceil(v.eng / v.size) },
      { label: 'Paths if everyone talks to everyone: n(n−1)/2', f: (v) => v.eng * (v.eng - 1) / 2 },
      { label: 'Paths in a team-of-teams (inside teams + between teams)', f: (v) => { const t = Math.ceil(v.eng / v.size); return t * v.size * (v.size - 1) / 2 + t * (t - 1) / 2; } },
      { label: 'Lead time added by hand-offs', unit: 'days', f: (v) => Math.round(v.deps * v.delay * 10) / 10 },
      { label: 'Flow efficiency (work ÷ total lead time)', fmt: 'pct', f: (v) => v.work / (v.work + v.deps * v.delay) },
      { label: 'Features needing cross-team coordination', fmt: 'pct', f: (v) => 1 - Math.exp(-v.deps) }
    ],
    note: 'Communication paths use the classic <b>n(n−1)/2</b> from Brooks: 120 people have 7,140 possible pairs, but 15 teams of 8 have 420 inside teams plus 105 between teams. The coordination share assumes the number of other teams per feature is <em>Poisson-distributed</em> with the mean you set, so P(≥ 1) = 1 − e<sup>−mean</sup>. Wait per hand-off and work days are <em>estimates</em>: measure your own from ticket timestamps.'
  },

  api: [
    { m: 'DOC', p: 'Team API (one page per team)', d: 'Mission, the services and repos it owns, its <b>interaction mode</b> with each neighbour, how to request work, on-call rota, chat channel, roadmap, SLOs it promises, and its working agreements.' },
    { m: 'DOC', p: 'Team interaction map', d: 'A diagram of all teams by type (stream-aligned, platform, enabling, complicated-subsystem) with arrows labelled <b>collaboration</b> (with an end date), <b>X-as-a-Service</b> or <b>facilitating</b>. Reviewed every quarter.' },
    { m: 'YAML', p: 'Ownership map: catalog-info.yaml + CODEOWNERS', d: 'Every component has one <code>owner</code> team, a <code>system</code> and a <code>domain</code> in the service catalog; CODEOWNERS makes that owner a required reviewer. No owner, no deploy.' },
    { m: 'DOC', p: 'RACI per capability', d: 'For shared concerns (auth, payments, data retention): who is <b>R</b>esponsible, <b>A</b>ccountable (exactly one), <b>C</b>onsulted, <b>I</b>nformed. Use it to kill "everyone and no one owns it".' },
    { m: 'ADR', p: 'Reorg / team boundary ADR', d: 'The decision record for a team change: the fracture plane chosen, the cognitive-load evidence, the expected effect on hand-offs and lead time, and the date you will review it.' },
    { m: 'SLO', p: 'Platform service SLOs', d: 'The platform as a product: "a new service reaches production in &lt; 1 day, self-service", "CI p50 &lt; 10 min". Measured and published like any external SLA.' }
  ],
  dataModel: [
    { name: 'teams', store: 'Service catalog (Backstage Group)', fields: [['team_id', 'text', 'pk'], ['type', 'stream | platform | enabling | complicated', 'idx'], ['size', 'int'], ['mission', 'text'], ['channel', 'text'], ['oncall_rota', 'text']], note: 'The source of truth for the team API. HR systems model reporting lines, not ownership.' },
    { name: 'service_ownership', store: 'Service catalog (Component)', fields: [['service_id', 'text', 'pk'], ['owner_team', 'text', 'fk'], ['system', 'text', 'idx'], ['domain', 'text', 'idx'], ['lifecycle', 'enum']], note: 'Exactly one owner per service. Shared ownership means no ownership.' },
    { name: 'service_dependency', store: 'Catalog relations / tracing', fields: [['from_service', 'text', 'pk'], ['to_service', 'text', 'pk'], ['kind', 'sync | async | data'], ['calls_per_day', 'bigint']], note: 'Join with ownership to find edges that cross team boundaries: the coupling Conway warns about.' },
    { name: 'team_interaction', store: 'Team interaction map', fields: [['team_a', 'text', 'pk'], ['team_b', 'text', 'pk'], ['mode', 'collab | xaas | facilitating'], ['started', 'date'], ['review_by', 'date', 'idx']], note: 'Collaboration rows must have a <code>review_by</code> date; a collaboration that never ends is a missing boundary.' }
  ],

  architecture: {
    title: 'An organisation shaped for flow',
    nodes: [
      { id: 'prod', label: 'Product manager', sub: 'feature requests', kind: 'person', wide: [100, 40], tall: [70, 0], tip: 'Brings work to the stream-aligned team that owns that part of the business, not to a layer team.' },
      { id: 'en', label: 'Enabling team', sub: 'facilitating', kind: 'team', wide: [480, 40], tall: [210, 0], tip: 'Specialists (e.g. testing, observability) who coach a team for weeks, then leave it self-sufficient.' },
      { id: 'lead', label: 'Eng leadership', sub: 'designs the teams', kind: 'person', wide: [860, 40], tall: [350, 0], tip: 'Uses the Inverse Conway Manoeuvre: decides team boundaries with the target architecture in mind.' },
      { id: 's1', label: 'Checkout team', sub: 'stream-aligned', kind: 'team', wide: [290, 150], tall: [70, 110], tip: 'Owns the buy flow end to end: UI, API, data, on-call. Aligned to a stream of change.' },
      { id: 's2', label: 'Search team', sub: 'stream-aligned', kind: 'team', wide: [480, 150], tall: [210, 110], tip: 'Owns browse and search end to end.' },
      { id: 'cs', label: 'Fraud team', sub: 'complicated subsystem', kind: 'team', wide: [670, 150], tall: [350, 110], tip: 'A small team of specialists (ML, risk) owning a subsystem too hard for a stream team to carry.' },
      { id: 'svc1', label: 'Checkout svc', sub: 'owned by Checkout', kind: 'service', wide: [290, 260], tall: [70, 220], tip: 'Deployed independently by its owning team.' },
      { id: 'svc2', label: 'Search svc', sub: 'owned by Search', kind: 'service', wide: [480, 260], tall: [210, 220], tip: 'Its own index and API.' },
      { id: 'risk', label: 'Fraud scoring', sub: 'API: score(order)', kind: 'service', wide: [670, 260], tall: [350, 220], tip: 'Consumed by Checkout as a service through a stable, versioned API.' },
      { id: 'db1', label: 'Orders DB', sub: 'private to Checkout', kind: 'store', wide: [100, 370], tall: [70, 330], tip: 'No other team reads it directly. Shared databases are the most common hidden cross-team coupling.' },
      { id: 'pp', label: 'Internal platform', sub: 'CI/CD · k8s · obs', kind: 'service', wide: [480, 370], tall: [210, 330], tip: 'Self-service: templates, pipelines, runtime, dashboards. Consumed X-as-a-Service.' },
      { id: 'plat', label: 'Platform team', sub: 'X-as-a-Service', kind: 'team', wide: [860, 370], tall: [350, 330], tip: 'Runs the platform as a product with users (the stream teams), a roadmap and SLOs.' }
    ],
    edges: [
      { from: 'prod', to: 's1' },
      { from: 'en', to: 's1', dashed: true, label: 'facilitate' },
      { from: 'lead', to: 'en', dashed: true },
      { from: 's1', to: 's2', bidi: true, dashed: true },
      { from: 's1', to: 'svc1' },
      { from: 's2', to: 'svc2' },
      { from: 'cs', to: 'risk' },
      { from: 'svc1', to: 'risk', bend: 0.25 },
      { from: 'svc1', to: 'db1' },
      { from: 'svc1', to: 'pp' },
      { from: 'svc2', to: 'pp' },
      { from: 'risk', to: 'pp' },
      { from: 'plat', to: 'pp' }
    ]
  },

  scenarios: [
    {
      id: 'flow', title: 'A feature in a stream-aligned team', tone: 'ok',
      steps: [
        { text: 'Product asks for "pay later at checkout". It goes to <b>one team</b>: Checkout owns the whole buy flow.', flow: ['prod>s1'], badges: { s1: 'owns it' } },
        { text: 'The team changes its UI, API and <b>its own database</b> in one sprint. No other team\'s backlog is involved.', flow: ['s1>svc1', 'svc1>db1'], ok: ['s1'] },
        { text: 'It calls Fraud scoring through a <b>stable, versioned API</b> (X-as-a-Service). No meeting is needed for a new field that is optional.', flow: ['svc1>risk'], badges: { risk: 'v2 API' } },
        { text: 'Deployment is <b>self-service</b> on the internal platform: pipeline template, canary, dashboards. No ticket to an ops team.', flow: ['svc1>pp'], ok: ['pp', 'svc1'], badges: { s1: ['0 hand-offs', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'layers', title: 'Conway in action: layer teams', tone: 'err',
      steps: [
        { text: 'Same org chart, but cut <b>by skill</b>: a frontend, a backend and a DBA team, plus an ops team that takes tickets.', nodes: ['s1', 's2', 'cs', 'plat'] },
        { text: 'The feature starts in Frontend, then is <b>handed off</b> to Backend, which waits for its next sprint.', flow: ['prod>s1', 's1>s2'], warn: ['s2'], badges: { s2: ['next sprint', 'warn'] } },
        { text: 'Backend needs a column, so a ticket goes to the DBA team, and then a deploy ticket goes to Ops. <b>Three hand-offs</b> for one small feature.', flow: ['s2>cs', 'cs>plat'], err: ['cs', 'plat'], badges: { cs: ['ticket', 'err'], plat: ['ticket', 'err'] } },
        { text: 'The code copies the org: <b>UI layer → API layer → shared schema</b>. Every release touches all three and must ship together. This is Conway\'s Law, not bad luck.', nodes: ['svc1', 'svc2', 'risk'], err: ['svc1', 'svc2', 'risk'], badges: { svc2: ['lockstep', 'err'] }, tone: 'err' }
      ]
    },
    {
      id: 'inverse', title: 'Inverse Conway Manoeuvre', tone: 'info',
      steps: [
        { text: 'Leadership picks the <b>target architecture first</b>: services per business capability (bounded contexts), each with its own data.', nodes: ['lead'], badges: { lead: 'target' } },
        { text: 'Then it draws <b>teams along the same fracture planes</b>: one stream-aligned team per capability, each 5–9 people, each owning its services and data.', flow: ['lead>s1', 'lead>s2'], ok: ['s1', 's2'] },
        { text: 'An <b>enabling team</b> coaches the new teams in things they never owned before (on-call, observability, database migrations) for a fixed period.', flow: ['lead>en', 'en>s1'], badges: { en: '8 weeks' } },
        { text: 'Old shared code is split as the teams take ownership. The org now <b>pulls</b> the architecture toward the target instead of fighting it.', flow: ['s1>svc1', 's2>svc2'], ok: ['svc1', 'svc2', 'db1'], tone: 'ok' }
      ]
    },
    {
      id: 'queue', title: 'At scale: platform becomes a ticket queue', tone: 'warn',
      steps: [
        { text: 'The company grows to 20 stream teams. The platform team still provisions databases and pipelines <b>by ticket</b>.', flow: [['svc1>pp', 'svc2>pp', 'risk>pp']], warn: ['plat'], badges: { plat: ['40 open tickets', 'warn'] }, tone: 'warn' },
        { text: 'Every stream team now has a <b>hidden hand-off</b> on every new service. Lead time grows while the platform team burns out.', nodes: ['s1', 's2', 'plat'], err: ['plat'], warn: ['s1', 's2'], badges: { s1: ['waiting', 'warn'] }, tone: 'err' },
        { text: 'Fix: treat the platform as a <b>product</b>. Start with the <b>Thinnest Viable Platform</b> (docs and templates), then automate the most common requests into self-service.', flow: ['plat>pp'], ok: ['pp'], badges: { pp: ['self-service', 'ok'] } },
        { text: 'The interaction mode becomes true <b>X-as-a-Service</b>: stream teams use the platform without talking to the platform team. The team\'s backlog is the roadmap, not tickets.', flow: ['svc1>pp', 'svc2>pp'], ok: ['plat', 's1', 's2'], tone: 'ok' }
      ]
    },
    {
      id: 'distmono', title: 'Distributed monolith (org smell)', tone: 'err',
      steps: [
        { text: 'Checkout calls Fraud scoring <b>synchronously</b>, and both read the same order tables. The teams talk daily to keep them in step.', flow: ['svc1>risk', 'svc1>db1'], warn: ['risk'] },
        { text: 'Fraud changes a field. Checkout breaks in production. Now every release of either service <b>needs both teams</b> in the room.', nodes: ['risk', 'svc1', 'cs', 's1'], err: ['svc1', 'risk'], badges: { svc1: ['broken', 'err'] }, tone: 'err' },
        { text: 'The services are separate, but the <b>teams never were</b>: a permanent "collaboration" with no end date. Conway predicts exactly this coupling.', flow: ['s1>s2'], warn: ['s1', 'cs'] },
        { text: 'Fix both sides: a <b>versioned contract</b> with consumer-driven tests, Fraud owns its own data, and the team interaction becomes <b>X-as-a-Service</b>.', flow: ['cs>risk', 'svc1>risk'], ok: ['risk', 'svc1'], badges: { risk: ['contract v2', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real organisational choice for a 60-engineer product group. Watch which teams appear, the path a feature takes, and the meters. Numbers are <em>illustrative</em>, built from hand-off counts and the cognitive-load reasoning in Team Topologies.',
    diagram: {
      title: 'How a feature reaches production',
      nodes: [
        { id: 'prod', label: 'Product', sub: 'next feature', kind: 'person', wide: [100, 200], tall: [210, 0], tip: 'The source of demand.' },
        { id: 'fe', label: 'Frontend team', sub: 'component team', kind: 'team', wide: [300, 90], tall: [70, 110], tip: 'Owns the UI layer for every feature.' },
        { id: 'be', label: 'Backend team', sub: 'component team', kind: 'team', wide: [490, 90], tall: [210, 110], tip: 'Owns the API layer for every feature.' },
        { id: 'dba', label: 'DBA team', sub: 'component team', kind: 'team', wide: [680, 90], tall: [350, 110], tip: 'Owns all schemas.' },
        { id: 'sa', label: 'Stream team A', sub: 'checkout', kind: 'team', wide: [400, 200], tall: [70, 110], tip: 'Stream-aligned: owns a business flow end to end.' },
        { id: 'sb', label: 'Stream team B', sub: 'search', kind: 'team', wide: [400, 310], tall: [210, 110], tip: 'Another stream-aligned team.' },
        { id: 'en', label: 'Enabling team', sub: 'coaching', kind: 'team', wide: [490, 90], tall: [350, 110], tip: 'Temporary coaching on a new capability.' },
        { id: 'ops', label: 'Ops team', sub: 'infra tickets', kind: 'team', wide: [870, 90], tall: [350, 220], tip: 'Central operations team.' },
        { id: 'plat', label: 'Platform team', sub: 'self-service', kind: 'team', wide: [680, 310], tall: [350, 220], tip: 'Internal platform run as a product.' },
        { id: 'prodn', label: 'Production', sub: 'running service', kind: 'service', wide: [870, 200], tall: [210, 330], tip: 'Where the feature finally delivers value.' }
      ],
      edges: [
        { from: 'prod', to: 'fe' }, { from: 'fe', to: 'be' }, { from: 'be', to: 'dba' }, { from: 'dba', to: 'ops' }, { from: 'ops', to: 'prodn' },
        { from: 'prod', to: 'sa' }, { from: 'sa', to: 'sb', bidi: true, dashed: true }, { from: 'sa', to: 'prodn' }, { from: 'sa', to: 'ops' },
        { from: 'sa', to: 'plat' }, { from: 'sb', to: 'plat' }, { from: 'plat', to: 'prodn' }, { from: 'en', to: 'sa', dashed: true, bend: 0.3 }
      ]
    },
    controls: [
      { id: 'org', label: 'Org structure', type: 'seg', value: 'platform', options: [
        { v: 'layer', l: 'Component / layer teams' }, { v: 'stream', l: 'Stream-aligned teams' }, { v: 'platform', l: 'Stream + platform' }, { v: 'enabling', l: '+ enabling team' }] },
      { id: 'mode', label: 'Main interaction mode between teams', type: 'seg', value: 'xaas', options: [
        { v: 'collab', l: 'Collaboration' }, { v: 'xaas', l: 'X-as-a-Service' }, { v: 'facil', l: 'Facilitating' }] },
      { id: 'mat', label: 'Platform / infra maturity', type: 'seg', value: 'tvp', options: [
        { v: 'tickets', l: 'Tickets' }, { v: 'tvp', l: 'Thinnest viable (docs + templates)' }, { v: 'self', l: 'Self-service product' }] },
      { id: 'size', label: 'Team size', type: 'range', min: 3, max: 15, step: 1, value: 7, unit: 'people' }
    ],
    evaluate(s) {
      const E = 60;
      const teams = Math.ceil(E / s.size);
      const hasPlat = s.org === 'platform' || s.org === 'enabling';
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const small = s.size < 5, big = s.size > 9;
      // feature hand-offs: work hand-offs between product teams + infra hand-off
      const baseH = { layer: 3, stream: 0.6, platform: 0.5, enabling: 0.4 }[s.org] * (small ? 1 + (5 - s.size) * 0.25 : 1);
      const infraH = { tickets: 1, tvp: 0.4, self: 0.1 }[s.mat];
      const modeF = { collab: 0.7, xaas: 1, facil: 0.9 }[s.mode];
      const handoffs = (baseH + infraH) * modeF;
      const intra = 1 + (big ? (s.size - 9) * 0.08 : 0);              // more paths inside a big team
      const lead = 4 * intra + handoffs * 3 + (s.mode === 'collab' ? 1 : 0);
      let load = { layer: 0.45, stream: 0.78, platform: 0.55, enabling: 0.45 }[s.org]
        - { tickets: 0, tvp: 0.05, self: 0.12 }[s.mat]
        + { collab: 0.15, xaas: 0, facil: -0.05 }[s.mode]
        + (small ? 0.15 : 0) - (big ? 0.05 : 0);
      if (s.org === 'layer') load += handoffs * 0.03;
      let coupling = { layer: 0.82, stream: 0.45, platform: 0.38, enabling: 0.35 }[s.org] + (s.mode === 'collab' ? 0.12 : 0) + (small ? 0.1 : 0) - (s.mode === 'xaas' && s.mat === 'self' ? 0.05 : 0);
      let autonomy = { layer: 0.25, stream: 0.62, platform: 0.78, enabling: 0.8 }[s.org] - { tickets: 0.2, tvp: 0.05, self: 0 }[s.mat] - (s.mode === 'collab' ? 0.15 : 0) - (big ? 0.05 : 0);
      let consistency = { layer: 0.72, stream: 0.38, platform: 0.65, enabling: 0.8 }[s.org] + { tickets: 0, tvp: 0.05, self: 0.12 }[s.mat] + (s.mode === 'facil' ? 0.1 : 0);
      [load, coupling, autonomy, consistency] = [load, coupling, autonomy, consistency].map(clamp);
      const lvl = (x) => (x >= 0.7 ? 'high' : x >= 0.45 ? 'medium' : 'low');
      const metrics = [
        { k: 'Lead time per feature', v: '≈ ' + lead.toFixed(1) + ' days', s: clamp(1 - (lead - 4) / 14), hint: 'illustrative' },
        { k: 'Cross-team hand-offs', v: handoffs.toFixed(1) + ' per feature', s: clamp(1 - handoffs / 4) },
        { k: 'Cognitive load (per team)', v: lvl(load), s: clamp(1 - load) },
        { k: 'Architectural coupling', v: lvl(coupling), s: clamp(1 - coupling) },
        { k: 'Team autonomy', v: lvl(autonomy), s: autonomy },
        { k: 'Consistency of standards', v: lvl(consistency), s: consistency },
        { k: 'Teams (60 engineers)', v: teams + ' teams of ' + s.size, s: s.size >= 5 && s.size <= 9 ? 0.9 : 0.4, hint: '5–9 sweet spot' }
      ];
      const notes = [];
      if (s.org === 'layer') notes.push('Every feature crosses Frontend → Backend → DBA → Ops. Conway predicts a <b>layered system</b> where all layers release together.');
      if (s.org === 'stream') notes.push('Stream teams own their code, but with no platform each team rebuilds pipelines and monitoring: <b>extraneous cognitive load</b> and drifting standards.');
      if (hasPlat && s.mat === 'tickets') notes.push('A platform that works by ticket is a <b>hidden hand-off</b> on every change. Make the most common requests self-service first.');
      if (s.mat === 'tvp') notes.push('A <b>Thinnest Viable Platform</b> can be a wiki page and a few templates. Grow it only when stream teams pull for more.');
      if (s.mode === 'collab') notes.push('Collaboration is great for discovery but expensive. <b>Time-box it</b>; a collaboration with no end date usually means a boundary is missing.');
      if (s.mode === 'facil' && s.org !== 'enabling') notes.push('Facilitating works best with a dedicated <b>enabling team</b> that leaves once the skill has transferred.');
      if (small) notes.push('Teams under 5 cannot carry on-call plus a domain; services get split to fit teams and coupling rises.');
      if (big) notes.push('A team of ' + s.size + ' has ' + (s.size * (s.size - 1) / 2) + ' internal communication paths and tends to split informally. Split along a fracture plane.');
      let verdict;
      if (s.org === 'layer') verdict = '❌ <b>Component teams make every feature a relay race</b> (' + handoffs.toFixed(1) + ' hand-offs). Re-cut the teams along business streams.';
      else if (hasPlat && s.mat === 'tickets' && s.mode === 'xaas') verdict = '⚠ <b>"X-as-a-Service" over tickets is a queue, not a service.</b> Invest in self-service before calling it a platform.';
      else if (s.size < 4 || s.size > 11) verdict = '⚠ <b>Team size is outside the 5–9 range</b> that Team Topologies recommends. Fix the size before tuning anything else.';
      else if (s.mode === 'collab') verdict = '⚠ <b>Collaboration as the default</b> keeps teams coupled. Use it for a fixed discovery period, then move to X-as-a-Service.';
      else if (s.org === 'enabling' && s.mat === 'self') verdict = '✅ <b>Close to the Team Topologies target:</b> stream-aligned teams, a self-service platform and an enabling team that coaches and leaves.';
      else if (hasPlat) verdict = '👍 <b>Good shape.</b> Stream teams own flow, the platform removes extraneous load. Keep maturing the platform as a product.';
      else verdict = '👍 <b>Fast flow, but each team carries too much.</b> Add a platform team when teams start rebuilding the same infrastructure.';
      const hide = { layer: ['sa', 'sb', 'plat', 'en'], stream: ['fe', 'be', 'dba', 'plat', 'en'], platform: ['fe', 'be', 'dba', 'ops', 'en'], enabling: ['fe', 'be', 'dba', 'ops'] }[s.org];
      let flow;
      if (s.org === 'layer') flow = ['prod>fe', 'fe>be', 'be>dba', 'dba>ops', 'ops>prodn'];
      else if (s.org === 'stream') flow = ['prod>sa'].concat(s.mode === 'collab' ? ['sa>sb'] : []).concat(['sa>ops', 'ops>prodn']);
      else flow = (s.org === 'enabling' ? ['en>sa'] : []).concat(['prod>sa']).concat(s.mode === 'collab' ? ['sa>sb'] : []).concat(['sa>plat', 'plat>prodn']);
      const matLbl = { tickets: 'ticket queue', tvp: 'docs + templates', self: 'self-service' }[s.mat];
      const modeLbl = { collab: 'collaborating', xaas: 'uses X-as-a-Service', facil: 'being facilitated' }[s.mode];
      return {
        metrics, verdict, notes, hide, flow,
        labels: { plat: { label: 'Platform team', sub: matLbl }, ops: { label: 'Ops team', sub: matLbl }, sa: { label: 'Stream team A', sub: modeLbl }, sb: { label: 'Stream team B', sub: s.size + ' people' } },
        hot: s.org === 'enabling' ? ['en'] : [],
        warn: (s.mat === 'tickets' ? ['plat', 'ops'] : []).concat(s.org === 'stream' ? ['sa'] : []),
        err: s.org === 'layer' ? ['be', 'dba'] : [],
        ok: s.org !== 'layer' && s.mat === 'self' ? ['sa', 'plat'] : [],
        badges: { prod: ['≈ ' + lead.toFixed(0) + ' days', lead > 10 ? 'err' : lead > 7 ? 'warn' : 'ok'], prodn: [handoffs.toFixed(1) + ' hand-offs', handoffs > 1.5 ? 'warn' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Org chart vs dependency graph: Conway alignment',
    caption: 'Left: the <b>teams</b> and how much they must talk. Right: the <b>services</b> and their dependencies, coloured by owning team. Red dashed edges cross a team boundary. Pick a reorganisation, or <b>tap a service</b> to move it to another team, then press <b>Ship feature</b> to count the hand-offs.'
  },

  realWorld: {
    intro: 'From a 1968 magazine article to a 2019 book that many platform teams now organise around. Every claim below links to its source.',
    timeline: [
      { when: '1968', who: 'Melvin Conway', title: '"How Do Committees Invent?" in Datamation', text: 'The thesis: <i>"organizations which design systems (in the broad sense used here) are constrained to produce designs which are copies of the communication structures of these organizations."</i> Harvard Business Review had rejected the paper; Datamation published it in April 1968. Conway also noted that each delegation of design narrows the alternatives that can be considered.', src: 0 },
      { when: '1975 → 2022', who: 'Fred Brooks · Martin Fowler', title: 'The law gets its name, and a modern reading', text: 'Brooks cited it as "Conway\'s Law" in <i>The Mythical Man-Month</i>, which made the name stick. Fowler\'s bliki (2022) adds: a dozen or two people with informal communication will build a monolith and that is fine; the first step is <b>not to fight the law</b>, and the modular decomposition and the team decomposition must be done together.', src: 1 },
      { when: '2012', who: 'MacCormack, Baldwin, Rusnak', title: 'The "mirroring hypothesis" tested', text: 'Comparing matched pairs of products with the same function, built by tightly coupled firms versus loosely coupled open-source communities, the loosely coupled products were <b>more modular in every pair</b>, with differences in propagation cost of <b>up to a factor of six</b> (<i>Research Policy</i> 41(8)).', src: 2 },
      { when: '2014', who: 'Thoughtworks', title: 'Inverse Conway Maneuver on the Tech Radar', text: 'The Radar placed the technique in <b>Trial</b>: evolve team and organisational structure to promote the architecture you want, ideally isomorphic with the business architecture. The blip is no longer on the current edition, and Thoughtworks notes old blips may not reflect its view today.', src: 3 },
      { when: '2014', who: 'Spotify', title: 'Squads, tribes, chapters, guilds', text: 'Henrik Kniberg\'s animated "Spotify Engineering Culture" videos described autonomous squads with long-term missions. Kniberg framed it as <b>a journey in progress</b>, not a finished model.', src: 4 },
      { when: '2019', who: 'Skelton & Pais', title: 'Team Topologies', text: 'Four team types (<b>stream-aligned, enabling, complicated-subsystem, platform</b>) and three interaction modes (<b>collaboration, X-as-a-Service, facilitating</b>), with team cognitive load as the main sizing constraint.', src: 6 },
      { when: '2020', who: 'Jeremiah Lee', title: '"Spotify\'s Failed #SquadGoals"', text: 'A former Spotify product manager argues that Spotify did not fully use "the Spotify model" either, citing problems such as matrix management and weak cross-team coordination, and warns against copying it. Treat it as one well-informed critique, not an official Spotify position.', src: 5 },
      { when: 'Ongoing', who: 'Amazon', title: 'Two-pizza teams with single-threaded ownership', text: 'AWS describes teams small enough to be fed by two pizzas, and stresses that <b>single-threaded ownership</b> of a product or service matters more than the size rule. When demand grows, teams are split rather than grown. AWS also notes the risk of duplication and that it may not suit every organisation.', src: 7 }
    ],
    lessons: [
      'The law is <b>descriptive</b>, not a recommendation: it tells you what you will get, so design teams for the architecture you want.',
      'Ownership beats headcount: Amazon\'s own write-up puts <b>single-threaded ownership</b> above the pizza count.',
      'Copy <b>principles</b> (autonomy, clear ownership, low cognitive load), not <b>names</b> (squads, tribes).',
      'Interaction modes are a <b>choice with an end date</b>, not a permanent state.'
    ],
    sources: [
      { title: 'How Do Committees Invent? (Melvin E. Conway, Datamation, April 1968)', url: 'https://www.melconway.com/Home/Committees_Paper.html', pub: 'melconway.com' },
      { title: 'Conway\'s Law', url: 'https://www.martinfowler.com/bliki/ConwaysLaw.html', pub: 'Martin Fowler, bliki, 2022' },
      { title: 'Exploring the Duality between Product and Organizational Architectures: A Test of the "Mirroring" Hypothesis', url: 'https://dash.harvard.edu/handle/1/34403525', pub: 'MacCormack, Baldwin, Rusnak · Research Policy, 2012' },
      { title: 'Inverse Conway Maneuver', url: 'https://www.thoughtworks.com/radar/techniques/inverse-conway-maneuver', pub: 'Thoughtworks Technology Radar' },
      { title: 'Spotify Engineering Culture (part 1)', url: 'https://engineering.atspotify.com/spotify-engineering-culture-part-1/', pub: 'Spotify Engineering, 2014' },
      { title: 'Failed #SquadGoals', url: 'https://jeremiahlee.com/posts/failed-squad-goals/', pub: 'Jeremiah Lee, 2020' },
      { title: 'Team Topologies: Key Concepts', url: 'https://teamtopologies.com/key-concepts', pub: 'teamtopologies.com (Skelton & Pais)' },
      { title: 'Amazon\'s Two-Pizza Teams', url: 'https://aws.amazon.com/executive-insights/content/amazon-two-pizza-team/', pub: 'AWS Executive Insights' },
      { title: 'Reckoning with the force of Conway\'s Law', url: 'https://www.thoughtworks.com/insights/podcasts/technology-podcasts/reckoning-with-the-force-conways-law', pub: 'Thoughtworks Technology Podcast, 2022' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Team boundary', '<b>Component / layer teams</b>: deep specialism, consistent standards', '<b>Stream-aligned teams</b>: end-to-end ownership, few hand-offs', 'Stream-aligned for product work; keep specialists in enabling or complicated-subsystem teams'],
      ['Interaction mode', '<b>Collaboration</b>: fast discovery, shared ownership', '<b>X-as-a-Service</b>: low coordination, clear contract', 'Collaborate while the boundary is unknown (time-boxed), then switch to XaaS'],
      ['Platform scope', '<b>Thinnest Viable Platform</b>: docs, templates, a few paved paths', '<b>Full internal platform</b>: self-service infra, data, observability', 'Start thin; grow only when several stream teams pull for the same thing'],
      ['Team size', '<b>Small (4–6)</b>: fast decisions, fewer paths', '<b>Larger (8–9)</b>: can carry on-call and a bigger domain', 'Size to the domain\'s cognitive load, within 5–9; split along a fracture plane beyond that'],
      ['Change approach', '<b>Big-bang reorg</b>: one clear moment', '<b>Incremental Inverse Conway</b>: move one team and its services at a time', 'Incremental, unless the current structure is blocking almost every feature']
    ]
  },
  failures: [
    { f: 'Component teams: every feature is a relay', detect: 'Tickets show 2+ teams per feature; flow efficiency &lt; 20%', fix: 'Re-cut into stream-aligned teams along business capabilities; move layer specialists into enabling roles.' },
    { f: 'Shared "integration" team', detect: 'A team whose backlog is other teams\' merges and releases', fix: 'Give integration to the stream teams with contract tests; disband or turn it into an enabling team.' },
    { f: 'Platform as a ticket queue', detect: 'Platform backlog grows with the number of teams; long waits for infra', fix: 'Run the platform as a product: user research, roadmap, SLOs and self-service for the top requests.' },
    { f: 'Distributed monolith', detect: 'Services must deploy together; cross-team sync calls and shared DB tables', fix: 'Align service and team boundaries, own data per service, versioned contracts, async events where possible.' },
    { f: 'Cognitive overload', detect: 'Team owns too many services; on-call burnout; slow onboarding', fix: 'Move extraneous load to the platform, hand a subdomain to a new team, or add an enabling team for a while.' },
    { f: 'Copying the "Spotify model"', detect: 'New names (squads, tribes) but the same hand-offs and approvals', fix: 'Measure hand-offs and lead time, not titles; change ownership and interaction modes, not labels.' },
    { f: 'Reorg without architecture', detect: 'Teams renamed, but services and repos still shared across them', fix: 'Pair every team change with an ownership map update (catalog + CODEOWNERS) and a migration plan for the code.' }
  ],

  interview: [
    { q: 'State Conway\'s Law precisely. What is the common misreading?', a: '<p>Melvin Conway, <i>"How Do Committees Invent?"</i>, Datamation, 1968: organisations that design systems <b>are constrained to produce designs which are copies of their communication structures</b>.</p><p>The misreading is that it is about the <b>org chart</b>. It is about who actually <b>communicates</b>: two teams under different managers who talk daily will build tightly coupled parts. It is also descriptive, not a recommendation.</p>', fu: 'Is there empirical evidence? (MacCormack, Baldwin, Rusnak 2012: loosely coupled orgs produced more modular code in every matched pair.)', lvl: 'core' },
    { q: 'What is the Inverse Conway Manoeuvre, and when would you not use it?', a: '<p>Deciding the <b>target architecture</b> first and then shaping teams so that they naturally build it: one team per bounded context, each owning its services and data. Thoughtworks put it on its Tech Radar in 2014.</p><p>Do not use it when the target architecture is unknown (a new product still finding its shape) or for a small group: a dozen people talking freely will build a monolith, and that is fine.</p>', lvl: 'core' },
    { q: 'Name the four Team Topologies team types and three interaction modes.', a: '<ul><li><b>Stream-aligned</b>: owns a flow of change end to end. Most teams.</li><li><b>Platform</b>: internal services that reduce stream teams\' load.</li><li><b>Enabling</b>: coaches teams in a new capability, then leaves.</li><li><b>Complicated-subsystem</b>: specialists for a hard part (codec, risk model).</li></ul><p>Modes: <b>collaboration</b> (time-boxed, for discovery), <b>X-as-a-Service</b> (consume with minimal talk), <b>facilitating</b> (help another team learn).</p>', lvl: 'core' },
    { q: 'What is team cognitive load, and how do you measure it?', a: '<p>Team Topologies uses three kinds from learning theory: <b>intrinsic</b> (the domain itself), <b>extraneous</b> (incidental: pipelines, YAML, environment quirks) and <b>germane</b> (learning the business domain deeply). Minimise extraneous, so there is room for germane.</p><p>Measure it with proxies: number of services and technologies per team, on-call pages per week, onboarding time, and a short team survey on how well they understand what they own.</p>', lvl: 'core' },
    { q: 'You have 120 engineers in component teams and lead time is 6 weeks. What do you do?', a: '<ol><li><b>Measure</b>: map a sample of features to the teams they touched and where they waited.</li><li>Find <b>fracture planes</b> with domain analysis (event storming).</li><li>Pick one stream with high demand; form a <b>stream-aligned team</b> that owns its UI, API and data.</li><li>Create a <b>thin platform</b> so that team does not rebuild infra.</li><li>Move teams one at a time; update ownership in the catalog; review hand-offs and lead time after each step.</li></ol>', fu: 'How long until you expect results? (One or two quarters for the first stream; full migration often a year or more.)', lvl: 'deep' },
    { q: 'How do Brooks\'s Law and n(n−1)/2 relate to team design?', a: '<p>Brooks (1975): <b>adding people to a late software project makes it later</b>, because of ramp-up and communication overhead. Pairs grow as n(n−1)/2: 8 people have 28 paths, 50 people have 1,225.</p><p>Teams of 5–9 with <b>explicit interfaces between teams</b> keep paths manageable. The same reasoning is why service APIs should be the main channel between teams.</p>', lvl: 'core' },
    { q: 'How do you stop a platform team becoming a ticket queue?', a: '<p>Run it as a <b>product</b>: stream teams are its customers, it does discovery with them, has a roadmap and publishes SLOs. Start with the <b>Thinnest Viable Platform</b>, often just docs and templates, and automate the most frequent requests first.</p><p>Track how many requests need a human. The target interaction mode is <b>X-as-a-Service</b>.</p>', lvl: 'deep' },
    { q: 'Is the "Spotify model" a good template?', a: '<p>Use it as one company\'s <b>snapshot from 2012–2014</b>, not a template. Kniberg himself called it a journey in progress, and former Spotify staff such as Jeremiah Lee (2020) argue Spotify never fully worked that way.</p><p>Borrow the principles: autonomous teams with long-lived missions and clear ownership. Then check what you are missing: product management, cross-team coordination, and a platform.</p>', lvl: 'deep' },
    { q: 'Behavioural: Tell me about a time you changed team structure to fix an architecture problem.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Checkout and Payments were two teams but one deployable; every release needed both, 2–3 incidents a quarter came from mismatched changes.</p><p><b>T:</b> As lead architect, cut release coupling without a big-bang rewrite.</p><p><b>A:</b> Mapped 40 recent changes to teams and services, showing 70% touched both. Proposed moving payment-method UI and its API into Payments, giving Payments its own database and a versioned API, and a 6-week time-boxed collaboration followed by X-as-a-Service. Wrote it as an ADR and agreed it with both engineering managers.</p><p><b>R:</b> Within two quarters, joint releases fell to under 10% of changes and lead time roughly halved. Lesson: I should have involved product managers earlier, because the roadmap also had to split.</p>', lvl: 'deep' },
    { q: 'Behavioural: How did you convince leadership to create a platform team?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> 9 stream teams each maintained their own CI, Terraform and dashboards; three different logging stacks.</p><p><b>T:</b> Get headcount for a platform team in a budget freeze.</p><p><b>A:</b> Measured the cost: a survey plus ticket data showed roughly 20% of each team\'s time on undifferentiated infra. Framed it in money and risk (engineer-weeks per quarter, audit findings). Proposed moving 5 volunteers from existing teams, not new headcount, with a Thinnest Viable Platform and three measurable goals (new service to production in a day, one logging stack, CI under 10 minutes).</p><p><b>R:</b> Approved as a 2-quarter pilot; hit two of the three goals and the team was made permanent. I learned to show the cost of <i>not</i> doing it in terms executives already track.</p>', lvl: 'deep' },
    { q: 'Behavioural: Tell me about a reorg that did not work and what you learned.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> We renamed component teams into "squads" per feature area, but kept the shared monolith and one release train.</p><p><b>T:</b> I was asked to find out why lead time did not improve.</p><p><b>A:</b> Traced 30 features: most still needed 3+ squads, because the code ownership had not changed. Built an ownership map (catalog + CODEOWNERS), moved modules to their squads, added ArchUnit rules to stop new cross-module calls, and split out the two most-changed modules as services.</p><p><b>R:</b> Hand-offs per feature dropped from about 3 to about 1 over two quarters. Lesson: a reorg must move <b>code ownership</b>, not only people.</p>', lvl: 'deep' },
    { q: 'Behavioural: Describe a disagreement over team boundaries and how you resolved it.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Two directors both wanted to own a new "pricing" capability.</p><p><b>T:</b> Recommend an owner without picking a political winner.</p><p><b>A:</b> Ran an event-storming session to find the bounded context, and scored options against change frequency, cognitive load per team and number of cross-team dependencies. The data showed pricing changed with promotions, not catalog. Proposed it as a new stream-aligned team with a 3-month collaboration with Catalog, written up as an ADR.</p><p><b>R:</b> Both directors accepted because the criteria were agreed before the answer. Pricing shipped independently from the next quarter.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Backstage catalog-info.yaml: owner, system, domain', lang: 'yaml',
      code: `# catalog-info.yaml in the checkout-api repo
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: checkout-api
  description: Turns a cart into an order
  annotations:
    github.com/project-slug: shop/checkout-api
spec:
  type: service
  lifecycle: production
  owner: group:checkout-team        # exactly one owning team
  system: checkout
  providesApis: [checkout-api]
  consumesApis: [catalog-api, fraud-score-api]
  dependsOn: [resource:orders-db]
---
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: checkout
spec:
  owner: group:checkout-team
  domain: commerce
---
apiVersion: backstage.io/v1alpha1
kind: Group
metadata:
  name: checkout-team
  description: Stream-aligned team for the buy flow
spec:
  type: team
  parent: commerce-org
  children: []`,
      note: '<code>domain</code> belongs on the <b>System</b>, not on the Component. <code>consumesApis</code> and <code>dependsOn</code> give you the dependency graph that the Python report below needs.'
    },
    {
      title: 'Python: cross-team dependency edges', lang: 'python',
      code: `"""Which service dependencies cross team boundaries?  (Python 3.11+)"""
from collections import Counter

owner = {                       # service -> owning team (from the catalog)
    "cart-ui": "checkout", "checkout-api": "checkout", "orders-db": "checkout",
    "browse-ui": "search", "catalog-api": "search", "catalog-db": "search",
    "fraud-api": "fraud",
}
deps = [                        # (from, to) from tracing or catalog relations
    ("cart-ui", "checkout-api"), ("checkout-api", "orders-db"),
    ("browse-ui", "catalog-api"), ("catalog-api", "catalog-db"),
    ("checkout-api", "catalog-api"), ("checkout-api", "fraud-api"),
]

def report(owner: dict[str, str], deps: list[tuple[str, str]]) -> None:
    missing = {s for e in deps for s in e} - owner.keys()
    if missing:
        raise SystemExit(f"no owner for: {sorted(missing)}")
    cross = [(a, b) for a, b in deps if owner[a] != owner[b]]
    pairs = Counter(tuple(sorted((owner[a], owner[b]))) for a, b in cross)
    print(f"alignment: {1 - len(cross) / len(deps):.0%} of edges inside a team")
    for (t1, t2), n in pairs.most_common():
        print(f"  {t1} <-> {t2}: {n} edge(s)")
    load = Counter(owner.values())
    print("services per team:", dict(load))

report(owner, deps)`,
      note: 'Run it in CI against the catalog every week and chart the alignment. A team pair whose edge count keeps rising is a candidate for a boundary change or a better API.'
    },
    {
      title: 'Java: ArchUnit rule enforcing module ownership', lang: 'java',
      code: `// build.gradle: testImplementation 'com.tngtech.archunit:archunit-junit5:1.3.0'
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

@AnalyzeClasses(packages = "com.shop")
class TeamBoundaryTest {

  // Each top-level package is owned by one team (see CODEOWNERS).
  // Other teams may only use its published "api" package.
  @ArchTest
  static final ArchRule only_public_api_across_teams =
      noClasses().that().resideOutsideOfPackage("com.shop.catalog..")
          .should().dependOnClassesThat()
          .resideInAPackage("com.shop.catalog.internal..")
          .because("Catalog team owns catalog; use com.shop.catalog.api");

  // No cycles between team-owned modules: cycles force lockstep releases.
  @ArchTest
  static final ArchRule no_cycles_between_teams =
      slices().matching("com.shop.(*)..").should().beFreeOfCycles();
}`,
      note: 'Pair it with a <code>.github/CODEOWNERS</code> file such as <code>/src/main/java/com/shop/catalog/ @shop/search-team</code> and branch protection that requires code-owner review, so ownership is enforced at review time as well as in the build.'
    }
  ],

  related: ['socio-technical-laws', 'platform-engineering', 'ddd', 'architectural-styles', 'architecture-governance', 'stakeholder-communication']
});

/* the layer-teams scenario relabels the same diagram on every step */
(function () {
  const L = { s1: { label: 'Frontend team', sub: 'component team' }, s2: { label: 'Backend team', sub: 'component team' }, cs: { label: 'DBA team', sub: 'component team' }, plat: { label: 'Ops team', sub: 'ticket queue' }, svc1: { label: 'Web UI', sub: 'all features' }, svc2: { label: 'API layer', sub: 'all features' }, risk: { label: 'Shared schema', sub: 'all features' } };
  SD.data.scenarios.find((x) => x.id === 'layers').steps.forEach((st) => { st.labels = L; });
})();
