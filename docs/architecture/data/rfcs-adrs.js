SD.register({
  slug: 'rfcs-adrs',
  domain: 9,
  title: 'Leading Without Authority: RFCs & ADRs',
  examples: 'Nygard ADRs, Uber/Google RFCs',
  tagline: 'Get a technical decision <b>made</b>, <b>written down</b> and <b>adopted</b> by people who do not report to you: an RFC to decide, an ADR to remember, and a paved road to make the decision the easy path.',
  tldr: {
    problem: 'Big technical decisions get made in hallways, Slack threads or by whoever shouts last. Six months later nobody remembers why, the decision is reopened, and half the teams never adopted it anyway.',
    idea: 'Separate three jobs. An <b>RFC / design doc</b> gathers input and forces trade-offs into the open, with a named decider and a deadline. An <b>ADR</b> (Architecture Decision Record) records the outcome in a few hundred words next to the code. An <b>adoption plan</b> (paved road, migration tooling, deprecation date) makes the decision real.',
    insight: 'Influence without authority is mostly <b>preparation</b>: pre-wire the people who can block you, bring evidence instead of opinion, answer objections in writing, then ask for <b>"disagree and commit"</b>. The review meeting should confirm a decision, not discover objections.',
    numbers: [
      { v: '2011', l: 'Michael Nygard\'s "Documenting Architecture Decisions" (title, status, context, decision, consequences)' },
      { v: '10 days', l: 'Rust RFC final comment period, so it spans at least 5 business days (Rust RFC book)' },
      { v: '10–20 pages', l: 'Typical length of a larger Google design doc (Malte Ubl, "Design Docs at Google")' }
    ]
  },

  intro: {
    what: 'An <b>RFC</b> ("request for comments") or <b>design doc</b> is a written proposal that asks other engineers to review an idea before it is built. An <b>ADR</b> (Architecture Decision Record) is a short note that records one decision that was made, why, and what it costs. Together they let an engineer with <b>no formal power</b> over other teams get a decision made, remembered and adopted.',
    analogy: {
      icon: '🏛️',
      title: 'A town planning application',
      text: 'To build something that affects the neighbours, you file a planning application (the RFC). Neighbours get a fixed period to object, and a named official decides (the decider and deadline). The decision is filed in the public register with its reasons (the ADR), so nobody re-argues it next year. A smart applicant talks to the neighbours <b>before</b> filing. The analogy breaks in one place: inside a company the "official" is often a peer, and the decision only matters if teams then choose to adopt it.'
    },
    problem: 'A staff engineer wants every team to move from three home-grown job queues to one standard. She posts it in a big channel. Security asks about secrets, finance asks about cost, SRE asks who is on call, and the thread dies after 200 messages with no decision. A year later two more queues exist. <b>How do you get a cross-team technical decision made, written down and actually adopted when nobody has to listen to you?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Decide it in the hallway',
        text: 'The author and two friends agree in a meeting, and the author announces it in chat. It feels fast: no documents, no process, no waiting for reviewers.',
        scene: {
          nodes: [
            { id: 'au', label: 'Author', sub: 'staff engineer', kind: 'person', at: [70, 0] },
            { id: 'hall', label: 'Hallway chat', sub: '2 friends agree', kind: 'policy', at: [210, 0] },
            { id: 'tm', label: 'Other teams', sub: 'hear about it', kind: 'team', at: [350, 0] }
          ],
          edges: [{ from: 'au', to: 'hall' }, { from: 'hall', to: 'tm' }],
          flow: ['au>hall', 'hall>tm']
        }
      },
      {
        stage: 'breaks',
        title: 'Surprise objections and no record',
        text: 'Security and SRE first hear about it after the fact and <b>object in public</b>. Positions harden. There is no document to answer them in, no decider and no deadline, so the thread stalls. Nobody can later say what was decided or why.',
        scene: {
          nodes: [
            { id: 'au', label: 'Author', sub: 'defending', kind: 'person', at: [70, 0] },
            { id: 'hall', label: 'Hallway chat', sub: 'no record', kind: 'policy', at: [210, 0] },
            { id: 'tm', label: 'Other teams', sub: 'ignore it', kind: 'team', at: [350, 0] },
            { id: 'sec', label: 'Security', sub: 'objects', kind: 'person', at: [70, 110] },
            { id: 'ops', label: 'SRE', sub: 'objects', kind: 'person', at: [210, 110] }
          ],
          edges: [{ from: 'au', to: 'hall' }, { from: 'hall', to: 'tm' }, { from: 'sec', to: 'hall' }, { from: 'ops', to: 'hall' }],
          flow: [['sec>hall', 'ops>hall'], 'hall>tm'],
          err: ['sec', 'ops'], warn: ['tm'],
          badges: { hall: ['stalled', 'err'], tm: ['2 new queues', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Pre-wire, write, decide, record, pave',
        text: 'The author talks to Security and SRE <b>one to one first</b>, writes an RFC with options and a benchmark, and names a decider and a deadline. The outcome becomes an <b>ADR</b>, and a paved road with migration tooling makes the new queue the easy choice.',
        scene: {
          nodes: [
            { id: 'au', label: 'Author', sub: 'pre-wires', kind: 'person', at: [70, 0] },
            { id: 'hall', label: 'RFC + deadline', sub: 'named decider', kind: 'policy', at: [210, 0] },
            { id: 'tm', label: 'Other teams', sub: 'migrate', kind: 'team', at: [350, 220] },
            { id: 'sec', label: 'Security', sub: 'concern met', kind: 'person', at: [70, 110] },
            { id: 'ops', label: 'SRE', sub: 'concern met', kind: 'person', at: [210, 110] },
            { id: 'adr', label: 'ADR-0042', sub: 'accepted', kind: 'store', at: [350, 110] },
            { id: 'pv', label: 'Paved road', sub: 'template + tool', kind: 'service', at: [210, 220] }
          ],
          edges: [{ from: 'au', to: 'sec', dashed: true }, { from: 'au', to: 'hall' }, { from: 'hall', to: 'ops' }, { from: 'hall', to: 'adr' }, { from: 'adr', to: 'pv' }, { from: 'pv', to: 'tm' }],
          flow: ['au>sec', 'au>hall', 'hall>ops', 'hall>adr', 'adr>pv', 'pv>tm'],
          ok: ['sec', 'ops', 'adr', 'tm'],
          badges: { adr: ['accepted', 'ok'], tm: ['80% adopted', 'ok'] }
        }
      }
    ],
    usedBy: ['Google (design docs)', 'Uber (RFCs)', 'Oxide Computer (RFDs)', 'Rust language (RFCs)', 'HashiCorp (PRDs and RFCs)', 'UK Government Digital Service (ADRs)', 'Many teams via adr-tools and MADR'],
    whenToUse: [
      'The decision affects <b>more than one team</b>, or is expensive to reverse (a "one-way door")',
      'You need people <b>outside your reporting line</b> to agree, review or change their code',
      'The same question has been <b>argued before</b> and will be argued again unless the answer is written down'
    ],
    whenNot: [
      'A cheap, reversible choice inside one team: just do it, and write a one-paragraph ADR if it is architecturally significant',
      'An emergency: decide, act, and write the record afterwards (see the incident process, not an RFC)',
      'A deep values conflict between senior people: a document will not fix it; see <a href="conflict-resolution.html">Conflict Resolution</a>'
    ],
    glossary: [
      { term: 'RFC / design doc', def: 'A written proposal that describes a problem, options and a recommendation, circulated for comments before a decision.' },
      { term: 'ADR', def: 'Architecture Decision Record: a short, numbered, immutable note of one decision, its context and its consequences.' },
      { term: 'Decider', def: 'The one named person (or small group) who makes the call when reviewers disagree.' },
      { term: 'Pre-wiring', def: 'Meeting key stakeholders one to one before the formal review so their concerns are in the document, not raised as a surprise.' },
      { term: 'Disagree and commit', def: 'Voicing disagreement before a decision, then fully supporting it once it is made.' },
      { term: 'Superseded', def: 'ADR status meaning a later ADR replaced this one; the old record is kept, not edited.' },
      { term: 'Paved road', def: 'The supported, well-tooled default way of doing something, which teams choose because it is easiest.' },
      { term: 'Spike', def: 'A short, time-boxed prototype built to answer one question with evidence.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Write it down</b>: any decision that is cross-team, costly or hard to reverse gets an RFC before and an ADR after',
      'Every RFC names a <b>decider</b>, the <b>reviewers</b> and a <b>comment deadline</b>; consultation, not consensus',
      'Show <b>options considered</b> (including "do nothing") with trade-offs, and keep rejected ideas with the reason',
      'Bring <b>evidence</b>: a benchmark, spike or cost model for the claim that matters most',
      '<b>Pre-wire</b> people who can block or must implement, before the formal review',
      'Records are <b>immutable</b>: change a decision with a new ADR that supersedes the old one'
    ],
    nonFunctional: [
      '<b>Time to decision</b> for a typical RFC ≤ 2–3 weeks (rule of thumb; Rust uses a 10-day final comment period)',
      'ADR length: <b>one to two pages</b> (Nygard); readable in 5 minutes',
      '<b>100%</b> of accepted cross-team decisions have an ADR linked from the repo',
      '<b>Reopen rate</b>: a decision is re-argued only with new information, tracked as a superseding ADR',
      '<b>Adoption</b>: ≥ 80% of target teams migrated by the published deprecation date',
      'Every RFC ends in an explicit state: accepted, rejected, withdrawn or postponed; <b>none open &gt; 60 days</b> (rule of thumb)'
    ],
    outOfScope: [
      '<b>RFC as bureaucracy</b>: a mandatory 15-page template for every small change',
      '<b>Decisions without records</b>: made in meetings or chat, then forgotten and re-argued',
      '<b>Analysis paralysis</b>: endless comment rounds with no deadline and no decider',
      '<b>Reopening settled decisions</b> without new information',
      '<b>Decide and walk away</b>: an accepted RFC with no adoption plan, tooling or owner'
    ]
  },

  calculator: {
    inputs: [
      { id: 'stk', label: 'Stakeholders who must sign off', min: 1, max: 20, value: 6 },
      { id: 'rev', label: 'Review time per round', min: 1, max: 20, value: 5, unit: 'days' },
      { id: 'rnd', label: 'Review rounds', min: 1, max: 6, value: 2 },
      { id: 'teams', label: 'Teams that must migrate', min: 1, max: 200, value: 30, log: true },
      { id: 'wk', label: 'Migration effort per team', min: 0.5, max: 12, step: 0.5, value: 2, unit: 'weeks' },
      { id: 'rate', label: 'Share of remaining teams starting each month', min: 5, max: 80, value: 20, unit: '%' }
    ],
    outputs: [
      { label: 'Time to decision (pre-wiring + review rounds)', unit: 'days', f: (v) => Math.round(Math.ceil(v.stk / 3) * 2 + v.rnd * v.rev) },
      { label: 'Stakeholder pairs who may disagree: n(n−1)/2', f: (v) => v.stk * (v.stk - 1) / 2 },
      { label: 'Months until 80% of teams have started', f: (v) => Math.round(Math.log(0.2) / Math.log(1 - v.rate / 100) * 10) / 10 },
      { label: 'Months until 80% have finished migrating', f: (v) => Math.round((Math.log(0.2) / Math.log(1 - v.rate / 100) + v.wk / 4.33) * 10) / 10 },
      { label: 'Total migration effort', unit: 'team-weeks', f: (v) => Math.round(v.teams * v.wk * 10) / 10 },
      { label: 'Divergent work while undecided (estimate)', unit: 'team-weeks', f: (v) => Math.round(v.teams * 0.05 * (Math.ceil(v.stk / 3) * 2 + v.rnd * v.rev) / 5 * 10) / 10 }
    ],
    note: 'Pre-wiring assumes about <em>2 working days per 3 stakeholders</em> (an <em>estimate</em>). Adoption is modelled as a constant monthly hazard: if a share <i>r</i> of the teams that have not started begin each month, the started fraction after <i>m</i> months is 1 − (1 − r)<sup>m</sup>, so 80% takes ln(0.2) ÷ ln(1 − r) months, plus the per-team effort. A mandate raises <i>r</i>; a paved road with migration tooling raises <i>r</i> <b>and</b> cuts the weeks per team. <b>Cost of not deciding</b> assumes each team spends about <em>5% of a week, per week of delay</em> building things it will later redo (a <em>rule of thumb</em>; measure it from your own rework).'
  },

  api: [
    { m: 'RFC', p: 'RFC / design doc', d: 'Problem, context, <b>goals and non-goals</b>, options considered (including "do nothing"), recommendation, trade-offs, rollout and migration plan, risks, <b>open questions</b>. Header: author, <b>decider</b>, reviewers, status, comment deadline.' },
    { m: 'ADR', p: 'docs/adr/NNNN-title.md', d: 'Nygard\'s five parts: <b>title, status, context, decision, consequences</b>. MADR adds decision drivers, considered options and pros/cons. One decision per file, numbered, never rewritten.' },
    { m: 'DOC', p: 'Y-statement', d: 'One sentence (Zimmermann, 2012): <i>In the context of</i> X, <i>facing</i> Y, <i>we decided for</i> A <i>and against</i> B, <i>to achieve</i> Q, <i>accepting</i> D. Good for the ADR title block or a decision log row.' },
    { m: 'POLICY', p: 'Decision process (when to write what)', d: 'Which decisions need an RFC, which need only an ADR, who decides each class, default comment period, and how to <b>escalate</b> when reviewers deadlock.' },
    { m: 'DOC', p: 'Adoption plan', d: 'Paved-road template, migration tool or codemod, champions per org, a <b>deprecation timeline</b> with dates, and the adoption metric and dashboard.' },
    { m: 'YAML', p: 'Decision log index', d: 'Generated table of every ADR: number, title, status, date, superseded-by. Built in CI from the files, never edited by hand.' }
  ],
  dataModel: [
    { name: 'adr', store: 'Markdown in the repo (docs/adr/)', fields: [['number', 'int', 'pk'], ['title', 'text'], ['status', 'proposed | accepted | rejected | deprecated | superseded', 'idx'], ['date', 'date'], ['deciders', 'text[]'], ['superseded_by', 'int', 'fk']], note: 'Immutable once accepted, except the status line and a link to the superseding record.' },
    { name: 'rfc', store: 'Docs tool or repo', fields: [['rfc_id', 'text', 'pk'], ['author', 'text'], ['decider', 'text'], ['state', 'draft | review | final comment | accepted | rejected | withdrawn', 'idx'], ['comment_deadline', 'date', 'idx'], ['adr_number', 'int', 'fk']], note: 'An RFC with no decider or no deadline is a discussion, not a decision process.' },
    { name: 'review_signoff', store: 'RFC tracker', fields: [['rfc_id', 'text', 'pk'], ['reviewer', 'text', 'pk'], ['concern', 'security | cost | ops | product | other'], ['stance', 'support | concern | object | commit'], ['resolved_in', 'text']], note: '"commit" records a reviewer who disagreed but agreed to support the decision.' },
    { name: 'adoption', store: 'Catalog / dashboard', fields: [['team', 'text', 'pk'], ['adr_number', 'int', 'pk'], ['state', 'not started | migrating | done | exempt', 'idx'], ['started', 'date'], ['done', 'date']], note: 'Feeds the adoption curve and the deprecation timeline.' }
  ],

  architecture: {
    title: 'From proposal to adopted standard',
    nodes: [
      { id: 'au', label: 'Author', sub: 'no formal authority', kind: 'person', wide: [100, 40], tall: [70, 0], tip: 'Often a staff or principal engineer. Owns the doc, not the teams.' },
      { id: 'spike', label: 'Spike / benchmark', sub: 'evidence', kind: 'compute', wide: [300, 40], tall: [210, 0], tip: 'A time-boxed prototype that turns the key claim into data.' },
      { id: 'rfc', label: 'RFC / design doc', sub: 'options + trade-offs', kind: 'policy', wide: [500, 40], tall: [350, 0], tip: 'Problem, goals and non-goals, options, recommendation, rollout, risks, open questions.' },
      { id: 'board', label: 'Review forum', sub: 'arch board / async', kind: 'policy', wide: [700, 40], tall: [210, 220], tip: 'Where the doc is formally reviewed: an architecture board meeting or an async comment period.' },
      { id: 'dec', label: 'Decider', sub: 'named, one person', kind: 'person', wide: [900, 40], tall: [350, 220], tip: 'Makes the call when reviewers disagree. Consultation, not consensus.' },
      { id: 'sec', label: 'Security', sub: 'threat model?', kind: 'person', wide: [200, 150], tall: [70, 110], tip: 'Concern: new attack surface, secrets, data access.' },
      { id: 'fin', label: 'Finance / FinOps', sub: 'what will it cost?', kind: 'person', wide: [400, 150], tall: [210, 110], tip: 'Concern: run cost and licence cost versus today.' },
      { id: 'ops', label: 'SRE / Ops', sub: 'who is on call?', kind: 'person', wide: [600, 150], tall: [350, 110], tip: 'Concern: operability, runbooks, failure modes.' },
      { id: 'prod', label: 'Product', sub: 'roadmap impact?', kind: 'person', wide: [800, 150], tall: [70, 220], tip: 'Concern: migration time taken from features.' },
      { id: 'adr', label: 'ADR log', sub: 'docs/adr/0042', kind: 'store', wide: [100, 260], tall: [70, 330], tip: 'The record: title, status, context, decision, consequences.' },
      { id: 'pave', label: 'Paved road', sub: 'template + codemod', kind: 'service', wide: [450, 260], tall: [210, 330], tip: 'Makes the decision the easiest path: templates, libraries, migration tooling.' },
      { id: 'teams', label: '30 teams', sub: 'migrate', kind: 'team', wide: [600, 370], tall: [210, 440], tip: 'They adopt because it is easier and supported, not only because they were told.' },
      { id: 'dash', label: 'Adoption metric', sub: '% teams migrated', kind: 'service', wide: [870, 370], tall: [350, 440], tip: 'Tracks adoption against the deprecation date.' }
    ],
    edges: [
      { from: 'au', to: 'spike' },
      { from: 'spike', to: 'rfc' },
      { from: 'au', to: 'sec', dashed: true, label: 'pre-wire' },
      { from: 'rfc', to: 'sec' }, { from: 'rfc', to: 'fin' }, { from: 'rfc', to: 'ops' }, { from: 'rfc', to: 'prod', bend: -0.15 },
      { from: 'rfc', to: 'board' },
      { from: 'board', to: 'dec' },
      { from: 'au', to: 'adr', label: 'record' },
      { from: 'adr', to: 'pave' },
      { from: 'pave', to: 'teams' },
      { from: 'teams', to: 'dash' }
    ]
  },

  scenarios: [
    {
      id: 'happy', title: 'A pre-wired RFC gets accepted', tone: 'ok',
      steps: [
        { text: 'The author builds a <b>two-day spike</b>: the new queue handles the peak load with a p99 under target. That number goes into the doc.', flow: ['au>spike', 'spike>rfc'], badges: { spike: 'p99 ✓' } },
        { text: 'Before publishing, she meets Security and SRE <b>one to one</b>. Their concerns (secrets handling, on-call ownership) become sections of the RFC.', flow: ['au>sec'], nodes: ['ops'], ok: ['sec'], badges: { sec: 'pre-wired' } },
        { text: 'The RFC goes out with a <b>named decider</b> and a 10-day comment deadline. Comments are clarifications, not surprises.', flow: [['rfc>sec', 'rfc>fin', 'rfc>ops', 'rfc>prod']], ok: ['sec', 'ops'], badges: { rfc: '10 days' } },
        { text: 'The review forum confirms; the decider accepts. The outcome is written as <b>ADR-0042</b> with status Accepted.', flow: ['rfc>board', 'board>dec', 'dec>adr'], ok: ['dec', 'adr'], badges: { adr: ['accepted', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'ambush', title: 'Ambushed in the review meeting', tone: 'err',
      steps: [
        { text: 'The author skips pre-wiring and presents straight to the architecture board.', flow: ['au>spike', 'spike>rfc', 'rfc>board'] },
        { text: 'Security sees the design <b>for the first time</b> and objects in front of 15 people: tokens are shared across tenants. SRE agrees.', flow: [['sec>board', 'ops>board']], err: ['sec', 'ops'], badges: { sec: ['objects', 'err'], ops: ['objects', 'err'] } },
        { text: 'A public objection is harder to withdraw than a private one. With no decider named, the board asks for "more analysis". <b>Stalled</b>.', nodes: ['board', 'dec'], err: ['board'], badges: { board: ['come back later', 'err'] }, tone: 'err' },
        { text: 'Meanwhile two teams ship their own queues. No ADR exists, so the next proposal starts from zero.', nodes: ['teams', 'adr'], warn: ['teams'], badges: { teams: ['+2 queues', 'warn'], adr: ['nothing', 'warn'] }, tone: 'err' }
      ]
    },
    {
      id: 'objection', title: 'Turning an objection into a requirement', tone: 'info',
      steps: [
        { text: 'Finance comments: "this doubles our message bill". It is a <b>legitimate concern</b>, not obstruction.', flow: ['fin>rfc'], warn: ['fin'], badges: { fin: ['cost?', 'warn'] } },
        { text: 'The author answers <b>in the doc</b>: a cost model from the spike (batching cuts requests 10×), and a new non-goal: no cross-region replication in v1.', flow: ['au>spike', 'spike>rfc'], badges: { rfc: 'cost section' } },
        { text: 'Finance moves from <b>object</b> to <b>support</b>. Product still prefers to wait; it records "disagree and commit" and the decider accepts.', flow: ['rfc>board', 'board>dec'], ok: ['fin'], warn: ['prod'], badges: { prod: ['commits', 'info'] } },
        { text: 'The ADR\'s <b>consequences</b> section lists the accepted downside (no multi-region yet) so nobody is surprised later.', flow: ['dec>adr'], ok: ['adr'], tone: 'ok' }
      ]
    },
    {
      id: 'adopt', title: 'At scale: adoption across 30 teams', tone: 'warn',
      steps: [
        { text: 'The decision is accepted, but adoption is <b>voluntary</b>. After two months, only 4 of 30 teams have moved.', flow: ['adr>pave', 'pave>teams'], warn: ['teams'], badges: { teams: ['13%', 'warn'] }, tone: 'warn' },
        { text: 'The author builds a <b>paved road</b>: a service template on the new queue and a codemod that rewrites the old client calls.', nodes: ['pave'], ok: ['pave'], badges: { pave: 'codemod' } },
        { text: 'A <b>champion</b> in each org pairs with teams; the ADR publishes a <b>deprecation timeline</b>: old queues read-only in 6 months.', flow: ['pave>teams'], badges: { teams: 'champions' } },
        { text: 'The adoption dashboard shows the curve bend upward; 80% done before the date. The rest get an <b>exemption with an owner</b>.', flow: ['teams>dash'], ok: ['teams', 'dash'], badges: { dash: ['80%', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'reopen', title: 'Someone reopens a settled decision', tone: 'info',
      steps: [
        { text: 'A new tech lead joins and asks "why are we not on Kafka?" in a big channel. The thread starts to grow.', nodes: ['prod', 'ops'], warn: ['ops'] },
        { text: 'Answer with a link: <b>ADR-0042</b> lists the context, the options considered, and why Kafka lost (team size, ops cost).', flow: ['au>adr'], ok: ['adr'], badges: { adr: 'link it' } },
        { text: 'Rule: reopen only with <b>new information</b>. Here there is some: traffic grew 8×. That earns a new RFC, not a rewrite of the old ADR.', flow: ['au>spike', 'spike>rfc'], badges: { rfc: 'RFC v2' } },
        { text: 'If accepted, <b>ADR-0057 supersedes ADR-0042</b>. The old record stays, with its status changed and a link forward.', flow: ['rfc>board', 'board>dec', 'dec>adr'], ok: ['adr'], badges: { adr: ['0042 → 0057', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Four real choices when you drive a cross-team decision for about 30 teams. The meters are <em>illustrative</em>, built from the review-round and adoption reasoning in the calculator; watch which steps appear on the path.',
    controls: [
      { id: 'proc', label: 'Decision process', type: 'seg', value: 'rfc', options: [
        { v: 'hall', l: 'Hallway / chat' }, { v: 'rfc', l: 'RFC with deadline' }, { v: 'board', l: 'Architecture board' }, { v: 'adr', l: 'ADR + async review' }] },
      { id: 'pre', label: 'Pre-wiring', type: 'seg', value: 'key', options: [
        { v: 'none', l: 'None' }, { v: 'key', l: 'Key stakeholders' }] },
      { id: 'ev', label: 'Evidence', type: 'seg', value: 'proto', options: [
        { v: 'opinion', l: 'Opinion' }, { v: 'proto', l: 'Benchmark / prototype' }] },
      { id: 'adopt', label: 'Adoption strategy', type: 'seg', value: 'paved', options: [
        { v: 'mandate', l: 'Mandate' }, { v: 'paved', l: 'Paved road + migration tooling' }] }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const pre = s.pre === 'key', ev = s.ev === 'proto', paved = s.adopt === 'paved';
      // days to a decision
      let days = { hall: 2, rfc: 14, board: 28, adr: 12 }[s.proc] + (ev ? 4 : 0) + (pre ? 3 : 0);
      if (!pre && s.proc !== 'hall') days += { rfc: 10, board: 21, adr: 8 }[s.proc];      // surprise objections add a round
      if (!ev && s.proc !== 'hall') days += 5;
      let buy = { hall: 0.25, rfc: 0.62, board: 0.5, adr: 0.6 }[s.proc] + (pre ? 0.25 : -0.05) + (ev ? 0.1 : 0) + (s.adopt === 'mandate' ? -0.1 : 0.05);
      let quality = { hall: 0.3, rfc: 0.7, board: 0.72, adr: 0.66 }[s.proc] + (ev ? 0.18 : -0.08) + (pre ? 0.05 : 0);
      const rate = clamp((s.adopt === 'mandate' ? 0.3 : 0.25) * (0.5 + buy) + (paved ? 0.05 : 0));
      const wk = paved ? 1 : 3;
      const months = Math.log(0.2) / Math.log(1 - Math.max(0.03, rate)) + wk / 4.33;
      let rev = { hall: 0.15, rfc: 0.6, board: 0.55, adr: 0.9 }[s.proc] + (ev ? 0.05 : 0);
      [buy, quality, rev] = [buy, quality, rev].map(clamp);
      const lvl = (x) => (x >= 0.7 ? 'high' : x >= 0.45 ? 'medium' : 'low');
      const metrics = [
        { k: 'Time to decision', v: '≈ ' + days + ' days', s: clamp(1 - (days - 2) / 50), hint: 'illustrative' },
        { k: 'Buy-in', v: lvl(buy), s: buy },
        { k: 'Decision quality', v: lvl(quality), s: quality },
        { k: 'Time to 80% adoption', v: '≈ ' + months.toFixed(1) + ' months', s: clamp(1 - (months - 2) / 14) },
        { k: 'Migration effort per team', v: wk + ' weeks', s: paved ? 0.85 : 0.35 },
        { k: 'Reversibility (record + context)', v: lvl(rev), s: rev, hint: 'can you revisit it safely?' }
      ];
      const notes = [];
      if (s.proc === 'hall') notes.push('Fastest to "decide", but there is <b>no record</b> and no review: expect the decision to be reopened and silently ignored.');
      if (s.proc === 'board') notes.push('A board adds a calendar slot and an audience. Without pre-wiring it becomes the place where <b>objections are discovered</b> instead of resolved.');
      if (s.proc === 'adr') notes.push('ADR + async review: the proposed ADR is the RFC. Lightweight and well recorded; best for decisions of moderate blast radius.');
      if (!pre && s.proc !== 'hall') notes.push('No pre-wiring: each surprise objection costs about a <b>review round</b>, and public objections harden.');
      if (!ev) notes.push('Opinion versus opinion is decided by rank or stamina. A <b>2–5 day spike</b> usually ends the debate.');
      if (s.adopt === 'mandate') notes.push('A mandate starts migrations, but each team does the work by hand and resents it. Pair it with tooling.');
      if (paved) notes.push('A paved road plus a codemod cuts per-team effort and makes adoption <b>the easy path</b>; publish a deprecation date.');
      let verdict;
      if (s.proc === 'hall') verdict = '❌ <b>Fast but fragile.</b> A hallway decision has no reviewers, no record and no adoption plan; it will be reopened.';
      else if (!pre && s.proc === 'board') verdict = '⚠ <b>Expect an ambush.</b> Unprepared boards turn into the first time stakeholders see the design.';
      else if (!ev) verdict = '⚠ <b>Process without evidence.</b> Add a benchmark or prototype for the claim that matters most.';
      else if (s.adopt === 'mandate') verdict = '👍 <b>Good decision, slow adoption.</b> Build migration tooling so the mandate is cheap to follow.';
      else if (pre) verdict = '✅ <b>Influence done right:</b> pre-wired, evidence-based, recorded, and adopted through a paved road.';
      else verdict = '👍 <b>Solid, but slower than needed.</b> Pre-wire the two or three people who can block it.';
      const hide = [];
      if (s.proc !== 'board') hide.push('board');
      if (!ev) hide.push('spike');
      if (s.proc === 'hall') hide.push('adr', 'dec');
      if (!paved) hide.push('pave');
      let flow = [];
      if (pre) flow.push('au>sec');
      if (ev) flow.push('au>spike', 'spike>rfc');
      if (s.proc === 'hall') flow.push(['rfc>sec', 'rfc>ops']);
      else flow.push(['rfc>sec', 'rfc>fin', 'rfc>ops', 'rfc>prod']);
      if (s.proc === 'board') flow.push('rfc>board', 'board>dec');
      if (s.proc !== 'hall') flow.push('dec>adr');
      flow = flow.concat(paved ? ['adr>pave', 'pave>teams'] : [], ['teams>dash']);
      return {
        metrics, verdict, notes, hide, flow,
        labels: {
          rfc: { label: { hall: 'Chat thread', rfc: 'RFC', board: 'RFC for board', adr: 'Proposed ADR' }[s.proc], sub: s.proc === 'hall' ? 'no deadline' : 'deadline set' },
          teams: { label: '30 teams', sub: s.adopt === 'mandate' ? 'told to migrate' : 'pulled by tooling' }
        },
        err: s.proc === 'hall' ? ['rfc'] : [],
        warn: (!pre && s.proc !== 'hall' ? ['sec', 'ops'] : []).concat(s.adopt === 'mandate' ? ['teams'] : []),
        ok: pre ? ['sec'] : [],
        badges: { rfc: ['≈ ' + days + ' d', days > 35 ? 'err' : days > 20 ? 'warn' : 'ok'], dash: [months.toFixed(1) + ' mo to 80%', months > 9 ? 'warn' : 'info'] }
      };
    }
  },

  widget: {
    title: 'RFC lifecycle simulator',
    caption: 'Four stakeholders review your proposal, each with a hidden concern. <b>Tap a card</b> to select a stakeholder, then choose actions: pre-wire them, add a benchmark, address their objection, set a deadline, or escalate to the decider. Every action costs days. Watch sign-off states change, then read the <b>ADR generated</b> from what you did.'
  },

  realWorld: {
    intro: 'Written decision processes from a 2011 blog post to company-wide RFC systems. Each item links to its primary source.',
    timeline: [
      { when: 'Nov 2011', who: 'Michael Nygard', title: '"Documenting Architecture Decisions"', text: 'Proposes short records of "architecturally significant" decisions, kept in the repo as numbered text files with five parts: <b>title, status, context, decision, consequences</b>. Status is proposed, accepted, deprecated or superseded. Nygard aims for one to two pages, written as a conversation with a future developer.', src: 0 },
      { when: '2012', who: 'Olaf Zimmermann', title: 'Y-statements', text: 'Presented at SATURN 2012: a decision in one structured sentence: <i>in the context of</i> …, <i>facing</i> …, <i>we decided for</i> … <i>and against</i> …, <i>to achieve</i> …, <i>accepting that</i> …. Builds on George Fairbanks\' architecture haikus.', src: 1 },
      { when: '2016 → 2017', who: 'Thoughtworks', title: 'Lightweight ADRs on the Tech Radar', text: 'First placed in <b>Trial</b> in late 2016 and moved to <b>Adopt</b> in 2017, recommending ADRs in source control rather than a wiki. Thoughtworks notes older blips are no longer reviewed.', src: 2 },
      { when: 'Ongoing', who: 'adr-tools · MADR', title: 'Tooling and templates', text: 'Nat Pryce\'s <b>adr-tools</b> creates numbered records; <code>adr new -s 9 …</code> marks ADR 9 superseded and links both. <b>MADR</b> adds decision drivers and considered options; version 3 renamed it "Markdown <b>Any</b> Decision Records", and 4.0.0 shipped in September 2024.', src: 3 },
      { when: 'Ongoing', who: 'Google', title: 'Design docs', text: 'Malte Ubl describes design docs as a key part of Google\'s engineering culture: context and scope, <b>goals and non-goals</b>, the design, <b>alternatives considered</b>, cross-cutting concerns (security, privacy). Larger docs run about <b>10–20 pages</b>; a doc that is really an implementation manual probably should not exist.', src: 4 },
      { when: '2015 →', who: 'Uber', title: 'From DUCKs to RFCs to tiered planning', text: 'Gergely Orosz describes Uber\'s RFC process, which grew out of earlier "DUCK" service docs as the org reached hundreds of engineers. Past <b>2,000 engineers</b> the RFC flow caused friction and was replaced by a tiered engineering planning process: the process must scale with the org.', src: 5 },
      { when: '2020', who: 'Oxide Computer', title: 'RFD 1: Requests for Discussion', text: 'Inherited from Joyent. RFDs move through <b>prediscussion, ideation, discussion, published, committed, abandoned</b>, and are "the backbone" of Oxide\'s decisions. Writing first lets ideas be stated rigorously and discussed openly.', src: 6 },
      { when: 'Ongoing', who: 'Rust project', title: 'RFCs with a final comment period', text: 'A sub-team member proposes a disposition (<b>merge, close or postpone</b>), then a <b>10-calendar-day final comment period</b> runs. Usually quiet; substantial new arguments cancel it. Accepted RFCs are not substantially rewritten; changes become new RFCs.', src: 7 },
      { when: 'Ongoing', who: 'HashiCorp · Sourcegraph', title: 'PRD → RFC, consultation not consensus', text: 'HashiCorp writes a <b>PRD</b> to define the problem, then an <b>RFC</b> for the solution, and keeps abandoned ideas in the doc with the reason. Sourcegraph\'s handbook: RFCs requiring a decision follow <b>consultation, not consensus</b>, and approval lies with the decider named in the doc.', src: 8 },
      { when: '2016', who: 'Amazon', title: '"Disagree and commit"', text: 'Bezos\'s 2016 shareholder letter: use different processes for reversible ("two-way door") and irreversible decisions, and use <b>disagree and commit</b> to keep speed. "Have Backbone; Disagree and Commit" is an Amazon leadership principle. The idea is often traced to Andy Grove\'s Intel, but who coined the phrase is uncertain.', src: 9 }
    ],
    lessons: [
      'Record the <b>why</b> and the <b>rejected options</b>; the decision itself is usually visible in the code.',
      'Every process that worked names a <b>decider</b> and an <b>end</b> (Rust\'s FCP, Sourcegraph\'s decider, Oxide\'s states).',
      'Processes must scale: Uber outgrew a single RFC flow. Tier by blast radius.',
      'Influence is an exchange (Cohen &amp; Bradford\'s "currencies"): give reviewers what they value (data, credit, fewer pages) in return for their support.'
    ],
    sources: [
      { title: 'Documenting Architecture Decisions', url: 'https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions', pub: 'Michael Nygard, Cognitect blog, 2011' },
      { title: 'Y-Statements', url: 'https://medium.com/olzzio/y-statements-10eb07b5a177', pub: 'Olaf Zimmermann' },
      { title: 'Lightweight Architecture Decision Records', url: 'https://www.thoughtworks.com/radar/techniques/lightweight-architecture-decision-records', pub: 'Thoughtworks Technology Radar' },
      { title: 'adr-tools', url: 'https://github.com/npryce/adr-tools', pub: 'Nat Pryce, GitHub' },
      { title: 'Design Docs at Google', url: 'https://www.industrialempathy.com/posts/design-docs-at-google/', pub: 'Malte Ubl, Industrial Empathy' },
      { title: 'Scaling Engineering Teams via RFCs: Writing Things Down', url: 'https://blog.pragmaticengineer.com/scaling-engineering-teams-via-writing-things-down-rfcs/', pub: 'Gergely Orosz, The Pragmatic Engineer' },
      { title: 'RFD 1: Requests for Discussion', url: 'https://oxide.computer/blog/rfd-1-requests-for-discussion', pub: 'Oxide Computer blog, 2020' },
      { title: 'The Rust RFC Book', url: 'https://rust-lang.github.io/rfcs/introduction.html', pub: 'Rust project' },
      { title: 'Requests for comments (RFCs)', url: 'https://handbook.sourcegraph.com/communication/rfcs', pub: 'Sourcegraph handbook' },
      { title: '2016 Letter to Shareholders', url: 'https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders', pub: 'Jeff Bezos, Amazon' },
      { title: 'Markdown Any Decision Records (MADR)', url: 'https://adr.github.io/madr', pub: 'adr.github.io' },
      { title: 'RFC Template', url: 'https://www.hashicorp.com/how-hashicorp-works/articles/rfc-template', pub: 'HashiCorp' },
      { title: 'Amazon Leadership Principles', url: 'https://www.aboutamazon.com/working-at-amazon/our-leadership-principles', pub: 'Amazon' },
      { title: 'Influence Without Authority (ch. 3)', url: 'https://www.oreilly.com/library/view/influence-without-authority/9780471463306/ch03.html', pub: 'Cohen & Bradford, Wiley' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Artefact', '<b>RFC / design doc</b>: rich, invites comments before deciding', '<b>ADR</b>: short record of the outcome', 'Both for big cross-team decisions (RFC first, ADR after); ADR alone for team-local significant choices'],
      ['Who decides', '<b>Consensus</b>: everyone must agree', '<b>Consultation + named decider</b>', 'Decider almost always; consensus only in tiny groups or for values-level principles'],
      ['Review forum', '<b>Architecture board</b>: synchronous, authoritative', '<b>Async comment period</b> with deadline', 'Async by default; board for one-way doors that need executive cover or budget'],
      ['Template weight', '<b>Heavy</b> (15 sections, mandatory)', '<b>Light</b> (Nygard\'s 5 parts, MADR minimal)', 'Light, scaled to blast radius; heavy templates turn RFCs into bureaucracy'],
      ['Adoption', '<b>Mandate</b> with deadline', '<b>Paved road</b>: tooling, templates, champions', 'Paved road first; add a deprecation date (a soft mandate) once the road exists'],
      ['Changing a decision', '<b>Edit</b> the old record', '<b>Supersede</b> with a new ADR', 'Always supersede: the old context explains why things look the way they do']
    ]
  },

  failures: [
    { f: '<b>RFC as bureaucracy</b>: every change needs a long doc and a board slot', detect: 'Small RFCs wait weeks; engineers route around the process; template has unused sections', fix: 'Tier by blast radius: one-paragraph ADR for local choices, RFC only for cross-team or one-way doors; publish a target time to decision' },
    { f: '<b>Decisions without records</b>', detect: 'Same debate every quarter; new joiners ask "why?" and nobody knows; decisions live in chat', fix: 'ADR for every accepted RFC, linked from the repo; CI-generated decision log; answer "why?" with a link' },
    { f: '<b>Analysis paralysis</b>', detect: 'RFC open &gt; 60 days, third comment round, "needs more analysis" with no question named', fix: 'Set a comment deadline and a decider; turn open questions into a time-boxed spike; for two-way doors decide with about 70% of the information' },
    { f: '<b>Reopening settled decisions</b>', detect: 'A senior newcomer relitigates in a big channel; people quietly ignore an accepted ADR', fix: 'Reopen only with new information, via a new RFC that may supersede; ask dissenters to record "disagree and commit"' },
    { f: '<b>Review-meeting ambush</b>', detect: 'Stakeholders first see the design in the meeting; objections are public and personal', fix: 'Pre-wire blockers one to one; put their concerns in the doc with your answer before the review' },
    { f: '<b>Decide and walk away</b>', detect: 'ADR accepted, adoption flat after a quarter; old and new systems both growing', fix: 'Adoption plan in the RFC: paved road, codemod, champions, deprecation date, adoption dashboard' },
    { f: '<b>Design by committee</b>', detect: 'Every reviewer\'s pet feature is added; the doc grows, the design loses its point', fix: 'Goals and <b>non-goals</b> up front; the decider owns coherence; park extras as future work' }
  ],

  interview: [
    { q: 'What is an ADR and what does Nygard\'s format contain?', a: 'An <b>Architecture Decision Record</b> is a short, numbered note of one architecturally significant decision. Michael Nygard proposed it in 2011 with five parts: <b>title, status</b> (proposed, accepted, deprecated, superseded), <b>context</b> (the forces at play), <b>decision</b> (in active voice: "we will…") and <b>consequences</b> (good and bad). It lives in the repo next to the code. Common misreading: an ADR is not a design doc; it records an outcome, often <i>after</i> an RFC.', lvl: 'core' },
    { q: 'RFC versus ADR: how do they relate?', a: 'An <b>RFC</b> is for <b>deciding</b>: it gathers input on a problem, options and a recommendation. An <b>ADR</b> is for <b>remembering</b>: a compact, immutable record of what was decided and why. A typical flow: RFC → review → decider accepts → ADR written (or the RFC\'s summary becomes the ADR). For small decisions, a "proposed" ADR with an async review can be the whole process.', lvl: 'core' },
    { q: 'What goes into a persuasive RFC?', a: '<ul><li><b>Problem</b> and why now, with data</li><li><b>Goals and non-goals</b> (non-goals stop scope creep)</li><li><b>Options considered</b>, including "do nothing", each with trade-offs</li><li><b>Recommendation</b> and the evidence (benchmark, spike, cost model)</li><li><b>Rollout and migration</b> plan, <b>risks</b>, <b>open questions</b></li><li>Header: author, <b>decider</b>, reviewers, comment deadline</li></ul>Persuasion comes from showing you understood the alternatives better than their advocates.', fu: 'What if your preferred option is not the best in the comparison?', lvl: 'core' },
    { q: 'How do you change a decision that already has an accepted ADR?', a: 'You do not edit it. Write a new RFC/ADR that explains the <b>new information</b>, and when accepted it <b>supersedes</b> the old one: the old record\'s status becomes "Superseded by ADR-0057" and the new one links back. adr-tools automates this with <code>adr new -s 42 …</code>. The old context stays valuable: it explains why the code looks as it does.', lvl: 'core' },
    { q: 'How do you get a decision adopted by 30 teams that do not report to you?', a: 'Make the decision the <b>easiest path</b>: a <b>paved road</b> (templates, libraries), <b>migration tooling</b> (codemods, compatibility shims), <b>champions</b> in each org, office hours, then a <b>deprecation timeline</b> with dates once the road exists. Measure the share of teams migrated and the usage of the old path. Mandates start migrations; tooling finishes them.', lvl: 'deep' },
    { q: 'What is "disagree and commit", and when is it misused?', a: 'An Amazon leadership principle ("Have Backbone; Disagree and Commit"): challenge decisions respectfully while they are being made, then <b>commit wholly</b> once decided. Bezos tied it to decision speed in his 2016 letter. Misuse: a leader using it to <b>skip</b> the disagreement phase ("just commit"), or applying it to safety/ethics issues that warrant escalation. It needs a real chance to be heard first.', lvl: 'core' },
    { q: 'An RFC has been in review for two months with no decision. What do you do?', a: 'Diagnose: is there a <b>named decider</b>? A <b>deadline</b>? Are the open questions factual (answer with a <b>time-boxed spike</b>) or about values (escalate to the decider)? Then: list the remaining objections in the doc, propose a disposition, set a final comment period (Rust uses 10 days), and ask the decider to call it. If it is a two-way door, decide and plan a review date.', lvl: 'deep' },
    { q: 'How would you design a decision process for a 300-engineer org?', a: '<b>Tier by blast radius</b>: team-local → ADR only; cross-team or costly → RFC with async review, named decider, 1–2 week comment period; one-way doors or large spend → RFC plus a short architecture forum. Store ADRs in repos, generate a decision log in CI, and track time to decision and RFCs open &gt; 60 days. Review the process itself yearly: Uber had to replace its RFC flow once it grew past 2,000 engineers.', lvl: 'deep' },
    { q: 'Behavioural: Tell me about a time you drove a technical decision across teams without authority.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Four teams ran three different job queues; incidents were hard to debug and on-call knowledge was split.</p><p><b>T:</b> As a staff engineer with no reports, get one standard agreed and adopted.</p><p><b>A:</b> Built a 3-day spike with a load test, pre-wired the security lead and two SRE leads one to one, wrote an RFC with options, cost model and a migration plan, named our director as decider and set a 10-day comment deadline.</p><p><b>R:</b> Accepted in 3 weeks with no objections in the review; ADR written; a codemod moved 9 of 12 services within a quarter.</p>', lvl: 'core' },
    { q: 'Behavioural: Describe a time a stakeholder strongly objected to your proposal.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Finance objected to a managed search service: "this triples our bill".</p><p><b>T:</b> Keep the proposal alive without dismissing a real concern.</p><p><b>A:</b> Met one to one, asked what number would be acceptable, rebuilt the cost model with their data, and added a non-goal (no replicas in staging) plus a spend alert. Put the objection and my answer in the RFC.</p><p><b>R:</b> Cost estimate fell by about 40%; finance signed off; the objection section is still referenced in later RFCs.</p>', lvl: 'core' },
    { q: 'Behavioural: Tell me about a time you disagreed with a decision and committed anyway.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Our architecture forum picked GraphQL federation; I had argued for REST plus a BFF.</p><p><b>T:</b> I was tech lead of a team that had to implement it.</p><p><b>A:</b> I recorded my concerns (N+1 queries, schema ownership) in the ADR\'s consequences, then committed: led our migration and built the query-cost limits I had worried about.</p><p><b>R:</b> We shipped on time; the cost limits caught two expensive queries in month one. Recording concerns turned them into requirements instead of grudges.</p>', lvl: 'core' },
    { q: 'Behavioural: Tell me about a decision you had to reopen.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Two years earlier we had chosen a single shared Postgres per domain (ADR-0012).</p><p><b>T:</b> Traffic grew about 8× and write latency breached SLO; I had to propose changing a decision others had made.</p><p><b>A:</b> Linked the old ADR and credited its context, showed the new data, and wrote an RFC with three options. Pre-wired the original authors first.</p><p><b>R:</b> ADR-0031 superseded ADR-0012 with the original authors as reviewers; no relitigation, and the migration finished in two quarters.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'ADR template: Nygard core + MADR fields', lang: 'yaml',
      code: `---                                    # docs/adr/0042-use-one-job-queue.md
status: accepted        # proposed | accepted | rejected | deprecated | superseded by ADR-NNNN
date: 2026-03-14
deciders: [jane.doe]    # the named decider(s)
consulted: [security, sre, finops]
informed: [all-backend-teams]
---
# 42. Use one standard job queue for background work

## Context and problem statement
Four teams run three queue technologies. Incidents take long to debug and
on-call knowledge is split. Peak load is 4k jobs/s (from the spike, see RFC-17).

## Decision drivers
* operability with the current SRE team size
* cost at 2x today's peak
* migration effort per team < 2 weeks

## Considered options
* A. Managed queue service   * B. Self-hosted Kafka   * C. Do nothing

## Decision outcome
Chosen option: "A. Managed queue service", because it meets the p99 target
in the spike and needs no new on-call rota.

### Consequences
* Good: one runbook, one client library, paved-road template.
* Bad: vendor lock-in; no cross-region replication in v1 (accepted).

## Pros and cons of the options
* B. Kafka: good for replay and stream processing; bad: needs a platform team.
* C. Do nothing: no migration cost; bad: three runbooks, rising incident time.`,
      note: 'The five Nygard parts are title, status, context, decision, consequences; the drivers, options and front matter are MADR additions. Shown with <code>yaml</code> highlighting because the front matter is YAML; the body is Markdown.'
    },
    {
      title: 'RFC skeleton (design doc)', lang: 'yaml',
      code: `# RFC-17: One standard job queue
author: jane.doe          decider: eng-director-platform
reviewers: security, sre, finops, product
status: in review         comments close: 2026-03-10   # hard deadline

## 1. Problem and why now        (data, incidents, cost of doing nothing)
## 2. Goals                      (measurable: p99 < 200 ms at 2x peak)
## 3. Non-goals                  (no cross-region replication in v1)
## 4. Options considered
##    A ... B ... C. Do nothing  (each: how it works, pros, cons, cost)
## 5. Recommendation and evidence  (benchmark / spike results, cost model)
## 6. Trade-offs we accept
## 7. Rollout and migration      (paved-road template, codemod, champions,
##                                deprecation date, adoption metric)
## 8. Risks and mitigations      (security, operability, people)
## 9. Open questions             (each with an owner and a due date)
## 10. Stakeholder concerns raised and how they are addressed
## 11. Abandoned ideas           (kept, with the reason they were dropped)
## Decision: accepted / rejected  ->  ADR-0042`,
      note: 'Sections 2–4 and 9 mirror Google-style design docs; keeping abandoned ideas follows HashiCorp\'s RFC template; the decider and deadline in the header are what stop analysis paralysis.'
    },
    {
      title: 'Python: create, supersede and index ADRs', lang: 'python',
      code: `"""adr.py  -  python adr.py new "Title" [--supersedes N] | python adr.py index"""
import argparse, datetime as dt, re
from pathlib import Path

DIR = Path("docs/adr")
NAME = re.compile(r"^(\\d{4})-(.+)\\.md$")

def records() -> list[tuple[int, Path]]:
    return sorted((int(m[1]), p) for p in DIR.glob("*.md") if (m := NAME.match(p.name)))

def new(title: str, supersedes: int | None) -> Path:
    num = max((n for n, _ in records()), default=0) + 1
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    path = DIR / f"{num:04d}-{slug}.md"
    links = f"Supersedes ADR-{supersedes:04d}\\n" if supersedes else ""
    path.write_text(f"# {num}. {title}\\n\\nDate: {dt.date.today()}\\n\\n## Status\\n\\n"
                    f"Proposed\\n{links}\\n## Context\\n\\n## Decision\\n\\n## Consequences\\n")
    if supersedes:
        old = next(p for n, p in records() if n == supersedes)
        text = re.sub(r"(## Status\\n\\n)\\S+", rf"\\1Superseded by ADR-{num:04d}",
                      old.read_text(), count=1)
        old.write_text(text)
    return path

def index() -> None:
    rows = ["| ADR | Title | Status |", "|---|---|---|"]
    for n, p in records():
        text = p.read_text()
        title = text.splitlines()[0].split(". ", 1)[-1]
        status = re.search(r"## Status\\n\\n(.+)", text)
        rows.append(f"| [{n:04d}]({p.name}) | {title} | {status[1] if status else '?'} |")
    (DIR / "README.md").write_text("# Decision log\\n\\n" + "\\n".join(rows) + "\\n")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("cmd", choices=["new", "index"])
    ap.add_argument("title", nargs="?"); ap.add_argument("--supersedes", type=int)
    a = ap.parse_args(); DIR.mkdir(parents=True, exist_ok=True)
    print(new(a.title, a.supersedes)) if a.cmd == "new" else index()`,
      note: 'Same idea as adr-tools (<code>adr init docs/adr</code>, <code>adr new -s 42 Use managed queue</code>, <code>adr generate toc</code>) in plain Python 3.11. Run <code>index</code> in CI so the decision log is never edited by hand.'
    }
  ],

  related: ['documenting-architecture', 'stakeholder-communication', 'conflict-resolution', 'architecture-governance', 'quality-attributes', 'build-vs-buy']
});
