(function () {
  /* Shared 12-month capacity model (26 two-week sprints). Used by the calculator outputs.
     interest = % of team time lost to debt (slower changes, rework, incidents, workarounds).
     Without paydown, interest drifts up by `growth` points per sprint (debt compounds).
     With paydown, the allocated time removes `red` points per sprint, down to a 5% floor (some friction never goes away). */
  function sim(v) {
    const SPR = 26, floor = 5;
    let iNo = v.interest, iYes = v.interest, cNo = 0, cYes = 0, breakEven = null;
    const rows = [];
    for (let s = 1; s <= SPR; s++) {
      const fNo = v.team * Math.max(0, 1 - iNo / 100);
      const fYes = v.team * Math.max(0, 1 - iYes / 100 - v.alloc / 100);
      cNo += fNo; cYes += fYes;
      if (breakEven === null && cYes >= cNo && s > 1) breakEven = s;
      rows.push({ s, fNo, fYes, cNo, cYes, iNo, iYes });
      iNo = Math.min(80, iNo + v.growth);
      iYes = v.alloc > 0 ? Math.max(floor, iYes + v.growth - v.red * v.alloc / 20) : Math.min(80, iYes + v.growth);
    }
    return { rows, cNo, cYes, breakEven, last: rows[SPR - 1] };
  }
  const pm = (x) => x.toFixed(1) + ' eng-sprints';

  SD.register({
    slug: 'tech-debt',
    domain: 9,
    title: 'Technical Debt Management',
    examples: 'Fowler quadrant, hotspots',
    tagline: 'Debt is fine. <b>Unmeasured interest</b> is not. Find where it hurts (hotspots), price it in time, and pay it down <b>continuously</b> where the code changes most.',
    tldr: {
      problem: 'Every codebase takes shortcuts. Over time the cost of changing it rises: features take longer, incidents rise, good engineers leave. Teams complain about "tech debt" but cannot say how much, where, or what paying it would buy, so product managers keep saying no.',
      idea: 'Treat debt like a loan: the <b>principal</b> is the cost to fix it, the <b>interest</b> is the extra cost you pay every time you touch it. Find the debt that charges interest with <b>hotspot analysis</b> (change frequency × complexity), record it in a <b>debt register</b>, rank by <b>cost of delay</b>, and fund it with a <b>steady capacity share</b> tied to feature work.',
      insight: 'Most debt never needs paying: code nobody touches charges no interest. The skill is <b>not</b> "clean everything", it is showing that a <b>small part of the code</b> takes most of the change effort and making that part cheap to change. Speak in lead time and incidents, not "code smell".',
      numbers: [
        { v: '13.5 h/wk', l: 'developer-estimated time on tech debt, of a 41.1 h week (Stripe survey, 2018)' },
        { v: '124%', l: 'longer time-in-development for low-health code (Tornhill &amp; Borg, 39 codebases, 2022)' },
        { v: '15–25%', l: 'continuous capacity for debt work (rule of thumb; Shopify wrote about 25%)' }
      ]
    },

    intro: {
      what: 'Technical debt is the <b>extra cost of change</b> caused by code, design or infrastructure that no longer fits what you now know. Managing it means <b>finding</b> the debt that slows you down, <b>making it visible</b> to the people who fund the work, and <b>paying it down</b> on purpose instead of in a crisis.',
      analogy: {
        icon: '💳',
        title: 'A credit card for software',
        text: 'Borrowing can be smart: you buy now and pay later, like shipping a quick design to hit a launch. But every month the balance charges <b>interest</b>: in software, every change near that code takes longer. Pay a little each month and the card is a tool. Ignore it and the minimum payment eats your salary. The analogy breaks in one place: software debt has no statement, so you have to <b>measure the interest yourself</b>.'
      },
      problem: 'A checkout team ships fast for two years. Now every small change to pricing takes two weeks, breaks something in tax, and needs the one engineer who understands it. The PM asks why everything is slow; engineers say "tech debt" and ask for a rewrite. Nobody can say how much it costs or where to start. The question this page answers is <b>"which debt is worth paying, how do we prove it, and how much time should it get?"</b>',
      story: [
        {
          stage: 'naive',
          title: 'Features only, clean up later',
          text: 'Every sprint is 100% features. Shortcuts are taken to hit dates with a promise to <b>"clean it up later"</b>. Later never comes, because the next feature is always more urgent.',
          scene: {
            nodes: [
              { id: 'pm', label: 'Product', sub: 'next feature', kind: 'person', at: [70, 0] },
              { id: 'team', label: 'Team', sub: '100% features', kind: 'team', at: [210, 0] },
              { id: 'code', label: 'Codebase', sub: 'shortcuts pile up', kind: 'service', at: [350, 0] },
              { id: 'prod', label: 'Release', sub: 'on time', kind: 'client', at: [350, 110] }
            ],
            edges: [{ from: 'pm', to: 'team' }, { from: 'team', to: 'code' }, { from: 'code', to: 'prod' }],
            flow: ['pm>team', 'team>code', 'code>prod'],
            ok: ['prod']
          }
        },
        {
          stage: 'breaks',
          title: 'The interest comes due',
          text: 'A year on, each change touches tangled code. Lead time doubles, releases break things, and engineers spend a <b>third of their week</b> working around old decisions. The team asks for a rewrite; the PM hears "stop shipping for six months".',
          scene: {
            nodes: [
              { id: 'pm', label: 'Product', sub: 'why so slow?', kind: 'person', at: [70, 0] },
              { id: 'team', label: 'Team', sub: '⅓ time lost', kind: 'team', at: [210, 0] },
              { id: 'code', label: 'Codebase', sub: 'tangled', kind: 'service', at: [350, 0] },
              { id: 'prod', label: 'Release', sub: 'late + incidents', kind: 'client', at: [350, 110] },
              { id: 'rw', label: 'Rewrite?', sub: '6 months, no value', kind: 'policy', at: [210, 110] }
            ],
            edges: [{ from: 'pm', to: 'team' }, { from: 'team', to: 'code' }, { from: 'code', to: 'prod' }, { from: 'team', to: 'rw' }],
            flow: ['pm>team', 'team>code', 'code>prod', 'team>rw'],
            err: ['prod', 'code'], warn: ['team', 'rw'],
            badges: { code: ['interest', 'err'], prod: ['lead time ×2', 'err'] }
          }
        },
        {
          stage: 'fix',
          title: 'Measure, rank, pay steadily',
          text: 'The team mines git history to find <b>hotspots</b>: the few modules that are both complex and changed constantly. They log them in a <b>debt register</b> with the delay each one causes, agree a <b>steady 20%</b> with the PM, and fix hotspots as part of the features that touch them.',
          scene: {
            nodes: [
              { id: 'pm', label: 'Product', sub: 'agrees 20%', kind: 'person', at: [70, 0] },
              { id: 'team', label: 'Team', sub: '80/20 split', kind: 'team', at: [210, 0] },
              { id: 'code', label: 'Codebase', sub: 'hotspots fixed', kind: 'service', at: [350, 0] },
              { id: 'prod', label: 'Release', sub: 'faster again', kind: 'client', at: [350, 110] },
              { id: 'reg', label: 'Debt register', sub: 'ranked by delay', kind: 'store', at: [70, 110] },
              { id: 'hot', label: 'Hotspots', sub: 'churn × complexity', kind: 'compute', at: [210, 110] }
            ],
            edges: [{ from: 'pm', to: 'team' }, { from: 'team', to: 'code' }, { from: 'code', to: 'prod' }, { from: 'code', to: 'hot' }, { from: 'hot', to: 'reg' }, { from: 'reg', to: 'pm' }],
            flow: ['code>hot', 'hot>reg', 'reg>pm', 'pm>team', 'team>code', 'code>prod'],
            ok: ['prod', 'code', 'reg'],
            badges: { prod: ['lead time ↓', 'ok'] }
          }
        }
      ],
      usedBy: ['Shopify (a standing share of time for debt)', 'CodeScene and SonarQube users (hotspots, debt ratio)', 'Google (DORA research on delivery performance)', 'SAFe organisations (enabler work ranked by WSJF)', 'Any team with a "boy scout rule" in its working agreement'],
      whenToUse: [
        'Delivery is slowing and engineers blame the code, but nobody can say where or by how much',
        'You need to win time for refactoring from a product manager or an executive',
        'You are deciding whether to rewrite, strangle or keep improving a legacy system'
      ],
      whenNot: [
        'The code is stable and rarely changed: low interest, leave it (even if it is ugly)',
        'The real problem is unclear requirements or team structure: see <a href="socio-technical-laws.html">Socio-technical laws</a>',
        'A whole system must be replaced piece by piece: see <a href="strangler-fig.html">Strangler fig</a> for the migration itself'
      ],
      glossary: [
        { term: 'Principal', def: 'The one-off effort to fix a piece of debt (refactor, upgrade, write the tests).' },
        { term: 'Interest', def: 'The recurring extra effort you pay every time you work in or around the debt.' },
        { term: 'Hotspot', def: 'A file or module with both high change frequency and high complexity: where interest is paid most often.' },
        { term: 'Churn', def: 'How often (commits) or how much (lines added and deleted) a file changes over a period.' },
        { term: 'Debt register', def: 'A shared list of known debt items with owner, impact, estimated principal and interest, and status.' },
        { term: 'Cost of delay', def: 'The value lost per unit of time by not doing something now; Reinertsen\'s key prioritisation number.' },
        { term: 'WSJF', def: 'Weighted Shortest Job First: cost of delay divided by job size; highest score goes first.' },
        { term: 'Technical debt ratio', def: 'SonarQube\'s remediation cost divided by the estimated cost to develop the code (default 30 min per line).' }
      ]
    },

    requirements: {
      functional: [
        '<b>Make interest visible</b>: measure time lost (lead time, rework, incidents), not just code smells',
        '<b>Target hotspots</b>: pay debt where change frequency and complexity meet; ignore cold code',
        '<b>Keep a register</b>: every known debt item has an owner, impact, estimate and a review date',
        '<b>Rank economically</b>: cost of delay ÷ size (WSJF), not by who complains loudest',
        '<b>Fund it continuously</b>: a steady capacity share plus fixes tied to the features that touch the code',
        '<b>Stop new debt at the door</b>: quality gates on <i>new</i> code, architecture rules in CI, ADRs for deliberate debt'
      ],
      nonFunctional: [
        'Lead time for changes in top-10 hotspots trending down quarter over quarter',
        'Change failure rate ≤ 15% (DORA high-performer band)',
        'SonarQube maintainability rating A on new code (debt ratio ≤ 5%)',
        'Developer survey: "the code slows me down" score improving each quarter',
        '100% of deliberate shortcuts recorded with a payback trigger',
        'Debt share of capacity stable (e.g. 15–25%), not 0% then 100%'
      ],
      outOfScope: [
        '<b>Big-bang rewrite</b> as the default answer to slowness',
        '<b>Debt as a dumping ground</b>: calling bugs, missing features or bad process "tech debt"',
        '<b>Clean everything</b>: refactoring stable code nobody changes',
        '<b>Hidden debt</b>: engineers fixing things off the books, so nobody sees the cost or the benefit',
        '<b>Metric worship</b>: chasing a SonarQube grade while lead time does not move'
      ]
    },

    calculator: {
      inputs: [
        { id: 'team', label: 'Engineers on the team', min: 2, max: 50, value: 8 },
        { id: 'interest', label: 'Time lost to debt today (interest)', min: 5, max: 60, value: 30, unit: '%' },
        { id: 'growth', label: 'Interest growth per sprint if ignored', min: 0, max: 2, step: 0.1, value: 0.5, unit: 'pts' },
        { id: 'alloc', label: 'Capacity allocated to paydown', min: 0, max: 40, step: 5, value: 20, unit: '%' },
        { id: 'red', label: 'Interest removed per sprint at 20% paydown', min: 0, max: 4, step: 0.25, value: 1.5, unit: 'pts' }
      ],
      outputs: [
        { label: '12-month feature capacity · no paydown', f: (v) => pm(sim(v).cNo) },
        { label: '12-month feature capacity · with paydown', f: (v) => pm(sim(v).cYes) },
        { label: 'Difference after 12 months', f: (v) => { const r = sim(v); const d = (r.cYes - r.cNo) / r.cNo * 100; return (d >= 0 ? '+' : '') + d.toFixed(1) + '% feature work'; } },
        { label: 'Break-even (cumulative features catch up)', f: (v) => { const r = sim(v); if (v.alloc === 0) return 'no paydown'; return r.breakEven ? 'sprint ' + r.breakEven + ' (≈ month ' + Math.ceil(r.breakEven * 12 / 26) + ')' : 'not within 12 months'; } },
        { label: 'Interest at month 12 · no paydown vs paydown', f: (v) => { const r = sim(v).last; return r.iNo.toFixed(0) + '% vs ' + r.iYes.toFixed(0) + '%'; } },
        { label: 'Feature capacity per sprint at month 12', f: (v) => { const r = sim(v).last; return r.fNo.toFixed(1) + ' vs ' + r.fYes.toFixed(1) + ' engineers'; } }
      ],
      note: 'A 26-sprint (two-week) model. <em>Estimates and assumptions</em>: interest grows linearly when ignored; paydown removes interest in proportion to the allocation, with a 5% floor because some friction is irreducible; reduction per sprint is your judgement (hotspot-targeted work removes more per hour than random clean-up). The shape matters more than the numbers: paydown <b>costs</b> capacity at first, then <b>returns</b> it, and the break-even comes sooner the more targeted the work is. Measure your real interest with lead time per module and a developer survey, then re-run.'
    },

    api: [
      { m: 'DOC', p: 'Debt register entry', d: 'Title, type (code / architecture / test / infra / docs / dependency), quadrant, location (modules), <b>interest</b> (hours per sprint or incidents per quarter, with evidence), <b>principal</b> (estimate), cost of delay, owner, payback trigger, status.' },
      { m: 'ADR', p: 'ADR: deliberate debt taken', d: 'For prudent-deliberate debt: what shortcut, why now (deadline, learning), the expected interest, <b>the payback trigger</b> ("before second tenant", "by Q3") and who owns repayment.' },
      { m: 'POLICY', p: 'Capacity allocation agreement', d: 'Agreed with product: e.g. 20% of each sprint for register items plus the boy-scout rule on any file touched; how items are chosen (WSJF), how results are reported (lead time, incidents).' },
      { m: 'YAML', p: 'Quality gate (CI)', d: 'Fail the merge when <b>new code</b> lowers maintainability, adds critical issues or drops coverage. Gates on new code, not the legacy total, so the gate is fair and achievable.' },
      { m: 'DOC', p: 'Debt health report (quarterly)', d: 'One page for leadership: top hotspots and their trend, lead time and change failure rate per area, survey score, items paid and the measured effect, next quarter\'s ask.' },
      { m: 'SQL', p: 'Prioritisation query', d: 'Rank open register items by cost of delay ÷ principal (WSJF), boosted for hotspots and security exposure. Output feeds sprint planning.' }
    ],

    dataModel: [
      { name: 'debt_item', store: 'Postgres (debt register)', fields: [['id', 'bigint', 'pk'], ['title', 'text'], ['kind', 'code|arch|test|infra|docs|dependency', 'idx'], ['quadrant', 'prudent/reckless × deliberate/inadvertent'], ['module', 'text', 'idx'], ['interest_hours_per_sprint', 'numeric'], ['principal_days', 'numeric'], ['cost_of_delay', 'numeric'], ['owner_team', 'text', 'fk'], ['payback_trigger', 'text'], ['status', 'open|planned|paid|accepted', 'idx']], note: '<code>accepted</code> means "we decided to live with it" and is a valid outcome for cold code.' },
      { name: 'module_hotspot', store: 'Postgres (refreshed nightly from git)', fields: [['repo', 'text', 'pk'], ['path', 'text', 'pk'], ['commits_90d', 'int'], ['authors_90d', 'int'], ['loc', 'int'], ['complexity', 'numeric'], ['hotspot_score', 'numeric', 'idx'], ['computed_at', 'timestamptz']], note: 'Score = normalised churn × normalised complexity. Many authors on a hotspot also signals coordination cost.' },
      { name: 'delivery_metric', store: 'Postgres / metrics warehouse', fields: [['team', 'text', 'pk'], ['area', 'text', 'pk'], ['week', 'date', 'pk'], ['lead_time_p50_h', 'numeric'], ['change_failure_rate', 'numeric'], ['deploys', 'int'], ['survey_slowdown_score', 'numeric']], note: 'The before/after evidence that paydown worked, by area.' }
    ],

    architecture: {
      title: 'The debt management loop: measure → register → rank → fund → prevent',
      nodes: [
        { id: 'dev', label: 'Dev team', sub: 'features + paydown', kind: 'team', wide: [90, 110], tall: [70, 0], tip: 'Spends an agreed share of capacity on register items, and applies the boy-scout rule to any code it touches.' },
        { id: 'ci', label: 'CI quality gate', sub: 'new code only', kind: 'policy', wide: [280, 55], tall: [210, 0], tip: 'Blocks merges that add new debt: maintainability on new code, coverage, architecture rules (ArchUnit).' },
        { id: 'code', label: 'Codebase', sub: 'modules', kind: 'service', wide: [470, 55], tall: [350, 0], tip: 'Where the debt lives: code, architecture, tests, infrastructure, docs and dependencies.' },
        { id: 'dora', label: 'DORA metrics', sub: 'lead time · CFR', kind: 'compute', wide: [660, 55], tall: [70, 105], tip: 'Lead time for changes and change failure rate per area: the business-visible symptoms of interest.' },
        { id: 'lead', label: 'Eng leadership', sub: 'quarterly review', kind: 'person', wide: [850, 55], tall: [70, 210], tip: 'Sees trends, not file names. Backs the capacity agreement when deadlines press.' },
        { id: 'sonar', label: 'Static analysis', sub: 'SonarQube · SQALE', kind: 'compute', wide: [280, 165], tall: [210, 105], tip: 'Remediation cost and technical debt ratio. Good at code-level debt, blind to architecture and to where it matters.' },
        { id: 'git', label: 'Git history', sub: 'churn per file', kind: 'store', wide: [470, 165], tall: [350, 105], tip: 'Every commit is behavioural data: what changes, how often, by whom, and together with what.' },
        { id: 'hot', label: 'Hotspot analysis', sub: 'churn × complexity', kind: 'ml', wide: [660, 165], tall: [350, 210], tip: 'Tornhill\'s method: rank files by change frequency × complexity. A small part of the code usually dominates.' },
        { id: 'reg', label: 'Debt register', sub: 'interest · principal', kind: 'store', wide: [660, 275], tall: [210, 315], tip: 'One list, visible to product: what the debt is, what it costs per sprint, what it costs to fix, who owns it.' },
        { id: 'pm', label: 'Product manager', sub: 'owns the roadmap', kind: 'person', wide: [850, 165], tall: [70, 315], tip: 'Agrees capacity when debt is framed as speed, risk and cost: "checkout changes take 2× longer".' },
        { id: 'prio', label: 'Prioritise', sub: 'WSJF · cost of delay', kind: 'policy', wide: [470, 275], tall: [210, 420], tip: 'Cost of delay ÷ size. Hotspots and security exposure raise cost of delay; cold code rarely makes the cut.' },
        { id: 'plan', label: 'Sprint plan', sub: '~20% capacity', kind: 'policy', wide: [280, 275], tall: [70, 420], tip: 'Allocation strategy: continuous share, boy-scout rule, tied to features, or occasional focused sprints.' }
      ],
      edges: [
        { from: 'dev', to: 'ci' },
        { from: 'ci', to: 'code' },
        { from: 'ci', to: 'sonar' },
        { from: 'code', to: 'git' },
        { from: 'code', to: 'dora' },
        { from: 'git', to: 'hot' },
        { from: 'sonar', to: 'reg' },
        { from: 'hot', to: 'reg' },
        { from: 'dora', to: 'lead' },
        { from: 'lead', to: 'pm' },
        { from: 'reg', to: 'prio' },
        { from: 'pm', to: 'prio' },
        { from: 'prio', to: 'plan' },
        { from: 'plan', to: 'dev', dashed: true }
      ]
    },

    scenarios: [
      {
        id: 'find', title: 'Find the debt that charges interest', tone: 'info',
        steps: [
          { text: 'A 400K-line monolith. SonarQube reports <b>thousands</b> of issues and weeks of remediation. Where do you start? Not with the total.', nodes: ['code', 'sonar'], flow: ['ci>sonar'], badges: { sonar: ['weeks of issues', 'warn'] } },
          { text: 'Mine <b>git history</b>: commits per file over the last 6–12 months. Most files barely change; a handful change every week.', flow: ['code>git'], badges: { git: 'churn' } },
          { text: 'Combine churn with complexity: <b>hotspots</b>. Typically a small share of files carries a large share of the changes, so that is where interest is paid.', flow: ['git>hot'], badges: { hot: ['top 10 files', 'warn'] } },
          { text: 'Each top hotspot gets a <b>register entry</b> with evidence: lead time for tickets touching it, bugs traced to it, and what fixing it would take.', flow: ['hot>reg', 'sonar>reg'], ok: ['reg'], badges: { reg: '10 items' } },
          { text: 'The giant legacy module that nobody has touched for two years? <b>Accepted</b>. Ugly, but it charges no interest.', nodes: ['reg'], tone: 'ok', badges: { reg: ['cold = accepted', 'ok'] } }
        ]
      },
      {
        id: 'pm', title: 'Negotiate capacity with the PM', tone: 'ok',
        steps: [
          { text: 'The PM\'s roadmap is full. "Tech debt" means nothing to her; "<b>checkout changes take 9 days instead of 3</b>" does.', nodes: ['pm'], badges: { pm: 'roadmap full' } },
          { text: 'Show the trend: lead time per area from <b>DORA metrics</b>, incidents traced to the pricing module, and the survey where engineers rate it the worst place to work.', flow: ['code>dora', 'dora>lead', 'lead>pm'], badges: { dora: 'lead time ↑' } },
          { text: 'Rank register items by <b>cost of delay ÷ size</b>. The top three touch the next two roadmap features, so fixing them <i>speeds those features up</i>.', flow: ['reg>prio', 'pm>prio'], badges: { prio: 'WSJF' } },
          { text: 'Agree <b>20% continuous</b> plus "refactor what the feature touches". Promise a report in one quarter, in the PM\'s terms: lead time, incidents.', flow: ['prio>plan', 'plan>dev'], ok: ['plan', 'pm'], badges: { plan: ['20% agreed', 'ok'] } },
          { text: 'A quarter later, pricing lead time is down and incidents fell. The PM now <b>defends</b> the 20% in planning.', flow: ['dev>ci', 'ci>code', 'code>dora'], ok: ['dora', 'pm'], tone: 'ok' }
        ]
      },
      {
        id: 'deadline', title: 'Deliberate debt to hit a launch', tone: 'warn',
        steps: [
          { text: 'A partner launch in 6 weeks. The right design (a proper multi-tenant config service) takes 10. The team chooses a <b>deliberate shortcut</b>: hard-coded tenant config.', nodes: ['dev'], warn: ['dev'], badges: { dev: ['shortcut', 'warn'] } },
          { text: 'Fowler\'s <b>prudent, deliberate</b> quadrant: "we must ship now and deal with the consequences". Prudent only because it is written down with a payback trigger.', flow: ['dev>ci'], badges: { ci: 'ADR waiver' } },
          { text: 'The register entry says: <b>pay back before tenant #2</b>, est. 3 weeks, owner: platform team. Interest so far: zero.', nodes: ['reg'], ok: ['reg'], badges: { reg: 'trigger: tenant #2' } },
          { text: 'Sales signs tenant #2. The trigger fires, the item jumps to the top of WSJF, and the fix ships <b>before</b> the copy-paste spreads.', flow: ['reg>prio', 'prio>plan', 'plan>dev'], ok: ['dev'], tone: 'ok' }
        ]
      },
      {
        id: 'spiral', title: 'Failure: the debt spiral and the rewrite trap', tone: 'err',
        steps: [
          { text: 'No register, no allocation. Engineers fix things quietly; the cost is invisible. Interest climbs past <b>40% of capacity</b>.', nodes: ['code', 'dev'], err: ['code'], badges: { code: ['interest 40%', 'err'] }, tone: 'err' },
          { text: 'Incidents rise, the change failure rate climbs, two senior engineers leave. Leadership sees missed dates, not causes.', flow: ['code>dora', 'dora>lead'], err: ['dora', 'lead'], badges: { lead: ['dates missed', 'err'] } },
          { text: 'The team proposes a <b>full rewrite</b>. Spolsky (2000): Netscape\'s rewrite took about three years while competitors moved on. The old code holds years of bug fixes nobody wrote down.', nodes: ['plan'], warn: ['plan'], badges: { plan: ['rewrite?', 'warn'] } },
          { text: 'Recovery: freeze new debt with a <b>quality gate</b>, make the register visible, and replace the worst hotspot incrementally (strangler fig) while features keep shipping.', flow: ['ci>code', 'hot>reg', 'reg>prio', 'prio>plan'], ok: ['ci', 'reg'], tone: 'ok' }
        ]
      },
      {
        id: 'scale', title: 'Scale: 30 teams, one platform', tone: 'warn',
        steps: [
          { text: '30 teams, 200 services. Each team has a backlog of local debt, but the worst debt is <b>shared</b>: an old framework version on 120 services and a cyclic dependency in the core library.', nodes: ['code'], warn: ['code'], badges: { code: ['dependency debt', 'warn'] } },
          { text: 'Architecture and dependency debt need <b>central visibility</b>: one register, hotspots per repo, and the framework version tracked like a risk.', flow: ['code>git', 'git>hot', 'hot>reg'], badges: { reg: 'org-wide' } },
          { text: 'Fund it twice: each team keeps its <b>local share</b>, and the platform group runs a campaign (automated upgrades, codemods) for the shared items.', flow: ['reg>prio', 'prio>plan', 'plan>dev'], ok: ['plan'] },
          { text: '<b>ArchUnit</b> rules in CI forbid new cycles; the build fails on the old framework after a published date. Debt stops growing while it is paid.', flow: ['dev>ci', 'ci>code'], ok: ['ci', 'code'], tone: 'ok', badges: { ci: ['no new cycles', 'ok'] } }
        ]
      }
    ],

    knobs: {
      intro: 'Pick how your organisation funds, ranks and shows debt work. The meters compare outcomes at 6 and 12 months against today\'s feature throughput (100%). The model is <em>illustrative</em>: directions and relative sizes come from the reasoning on this page, not from a benchmark.',
      controls: [
        { id: 'alloc', label: 'Allocation strategy', type: 'seg', value: 'none', options: [
          { v: 'none', l: 'None (features only)' }, { v: 'cont', l: '20% continuous', hint: 'every sprint' }, { v: 'sprints', l: 'Periodic debt sprints', hint: '1 in 5' }, { v: 'scout', l: 'Boy-scout only', hint: 'opportunistic' }] },
        { id: 'prio', label: 'How items are chosen', type: 'seg', value: 'loud', options: [
          { v: 'loud', l: 'Loudest engineer' }, { v: 'hot', l: 'Hotspots' }, { v: 'cod', l: 'Cost of delay (WSJF)' }] },
        { id: 'vis', label: 'Visibility', type: 'seg', value: 'hidden', options: [
          { v: 'hidden', l: 'Hidden (off the books)' }, { v: 'reg', l: 'Register + metrics' }] }
      ],
      evaluate(s) {
        const clamp = (x) => Math.max(0.03, Math.min(1, x));
        // spend = share of capacity on debt; eff = interest removed per unit spent (targeting)
        const spend = { none: 0, cont: 0.2, sprints: 0.2, scout: 0.08 }[s.alloc];
        let eff = { loud: 0.35, hot: 0.85, cod: 1 }[s.prio];
        if (s.alloc === 'scout') eff = Math.max(eff, 0.7);          // boy-scout work is, by definition, where you are changing code
        if (s.alloc === 'sprints') eff *= 0.8;                      // batch work, context lost in between
        if (s.vis === 'hidden') eff *= 0.8;                          // no evidence, no follow-through
        const i0 = 0.3, grow = 0.012;                                // 30% interest today, +1.2 pts / sprint if ignored (estimate)
        let i = i0, c6 = 0, c12 = 0;
        for (let sp = 1; sp <= 26; sp++) {
          const sprintSpend = s.alloc === 'sprints' ? (sp % 5 === 0 ? 1 : 0) : spend;
          const feat = Math.max(0, 1 - i - sprintSpend);
          if (sp > 12 && sp <= 13) c6 = feat / (1 - i0);
          if (sp === 26) c12 = feat / (1 - i0);
          i = Math.max(0.06, Math.min(0.7, i + grow - sprintSpend * eff * 0.09 * (s.alloc === 'sprints' ? 1 : 1)));
        }
        const incidents = Math.round(100 * (0.4 + i * 2.2)) / 100;                 // relative to today = 1.06 at 30%
        const morale = clamp(0.75 - i + (s.vis === 'reg' ? 0.12 : -0.05) + (s.alloc === 'none' ? -0.1 : 0.05) + (s.prio === 'loud' ? 0.03 : 0));
        const predict = clamp(0.95 - i * 1.1 - (s.alloc === 'sprints' ? 0.12 : 0) + (s.vis === 'reg' ? 0.08 : 0));
        const trust = clamp(0.35 + (s.vis === 'reg' ? 0.35 : -0.1) + (s.prio === 'cod' ? 0.2 : s.prio === 'hot' ? 0.1 : -0.1) + (c12 > 1 ? 0.1 : -0.05) - (s.alloc === 'sprints' ? 0.08 : 0));
        const pct = (x) => Math.round(x * 100) + '%';
        const metrics = [
          { k: 'Feature throughput at 6 mo', v: pct(c6) + ' of today', s: clamp(c6 - 0.3), hint: 'interest now ' + Math.round(i * 100) + '%' },
          { k: 'Feature throughput at 12 mo', v: pct(c12) + ' of today', s: clamp(c12 - 0.3) },
          { k: 'Incident rate', v: '×' + (incidents / 1.06).toFixed(2) + ' vs today', s: clamp(1.6 - incidents) },
          { k: 'Team morale', v: morale > 0.7 ? 'good' : morale > 0.45 ? 'mixed' : 'low (attrition risk)', s: morale },
          { k: 'Predictability', v: predict > 0.7 ? 'estimates hold' : predict > 0.45 ? 'some surprises' : 'dates slip', s: predict },
          { k: 'PM / exec trust', v: trust > 0.7 ? 'high: debt work is funded' : trust > 0.45 ? 'neutral' : 'low: "engineers want to polish"', s: trust }
        ];
        const notes = [];
        if (s.alloc === 'none') notes.push('With no paydown, interest compounds: every sprint is a little slower than the last. The first months look best, which is why the trap is easy to fall into.');
        if (s.alloc === 'sprints') notes.push('Debt sprints spend the same 20% in bursts. Product loses a whole sprint at a time (a hard sell), and debt grows again between them. Useful for a focused campaign (e.g. a framework upgrade), weaker as the only mechanism.');
        if (s.alloc === 'scout') notes.push('The boy-scout rule ("leave the code better than you found it") lands exactly on code you are changing, so it is well targeted, but it is small: it slows decay rather than reversing it. Combine it with a register.');
        if (s.prio === 'loud') notes.push('The loudest engineer picks what annoys them, which is often cold code. Hotspots or cost of delay put the same hours where interest is paid.');
        if (s.prio === 'cod') notes.push('WSJF (cost of delay ÷ size) makes debt items compete with features in the same currency, which is what earns product trust.');
        if (s.vis === 'hidden') notes.push('Hidden work cannot be credited: the PM sees slow features and no explanation. A register plus lead time per area turns the same work into evidence.');
        let verdict;
        if (s.alloc === 'none') verdict = '❌ <b>Features only.</b> Throughput falls to ' + pct(c12) + ' of today within a year as interest compounds.';
        else if (s.alloc === 'cont' && s.prio !== 'loud' && s.vis === 'reg') verdict = '✅ <b>Sustainable.</b> A steady, targeted, visible share returns capacity: ' + pct(c12) + ' of today\'s throughput at 12 months.';
        else if (c12 >= 1) verdict = '👍 <b>Paying off</b> (' + pct(c12) + ' at 12 months), but ' + (s.vis === 'hidden' ? 'nobody can see why: make it visible.' : s.prio === 'loud' ? 'targeting by hotspots would pay off faster.' : 'a continuous share would be steadier.');
        else verdict = '⚠ <b>Not enough to beat the interest.</b> Throughput ' + pct(c12) + ' at 12 months. Target better or allocate more.';
        const tone = verdict[0] === '✅' ? 'ok' : verdict[0] === '❌' ? 'err' : 'warn';
        return {
          metrics, verdict, notes,
          flow: s.vis === 'reg' ? ['code>git', 'git>hot', 'hot>reg', 'reg>prio', 'prio>plan', 'plan>dev', 'dev>ci', 'ci>code'] : ['plan>dev', 'dev>ci', 'ci>code'],
          labels: {
            plan: { label: 'Sprint plan', sub: { none: '0% debt', cont: '20% every sprint', sprints: '1 debt sprint in 5', scout: 'boy-scout only' }[s.alloc] },
            prio: { label: 'Prioritise', sub: { loud: 'loudest voice', hot: 'hotspots', cod: 'WSJF · cost of delay' }[s.prio] },
            reg: { label: 'Debt register', sub: s.vis === 'reg' ? 'shared with product' : 'none (hidden)' }
          },
          hide: s.vis === 'hidden' ? ['reg', 'hot'] : [],
          hot: ['plan'],
          ok: tone === 'ok' ? ['code', 'plan'] : [], warn: tone === 'warn' ? ['code'] : [], err: tone === 'err' ? ['code'] : [],
          badges: { code: ['interest ' + Math.round(i * 100) + '%', tone], pm: [trust > 0.6 ? 'trusts it' : 'sceptical', trust > 0.6 ? 'ok' : 'warn'] }
        };
      }
    },

    widget: {
      title: 'Hotspot map: pay down where the code changes',
      caption: 'Each box is a module, <b>sized by lines of code</b> and <b>coloured by hotspot score</b> (churn × complexity). Tap modules to put them in the paydown plan (each costs 5% of capacity while being fixed), or use <b>Top hotspots</b>. Then run 12 sprints: the chart compares feature throughput with and without the plan. Try paying down the biggest box instead of the reddest.'
    },

    realWorld: {
      intro: 'The metaphor is 30+ years old; the measurement is newer. The strongest evidence links code health to delivery time, and the most practical advice is about where to look and how to fund the work.',
      timeline: [
        { when: '1992', who: 'Ward Cunningham', title: 'The debt metaphor (OOPSLA \'92)', text: 'In his experience report on the <b>WyCash portfolio management system</b>, Cunningham writes that shipping first-time code is like going into debt: a little debt speeds development if it is paid back promptly with a rewrite, and "every minute spent on not-quite-right code counts as interest on that debt".', src: 0 },
        { when: '2000', who: 'Joel Spolsky', title: 'Things You Should Never Do, Part I', text: 'Spolsky calls rewriting from scratch "the single worst strategic mistake", using Netscape as the example. Critics note Netscape had other problems too; the durable lesson is that old code holds <b>knowledge</b> you lose in a rewrite.', src: 7 },
        { when: '2009', who: 'Ward Cunningham', title: 'Debt is not "write it badly"', text: 'In a short video he clarifies the most common misreading: the metaphor was about <b>shipping code that reflects your current understanding</b> and then refactoring as you learn, not about writing poor code on purpose and cleaning it up later.', src: 1 },
        { when: 'Oct 2009', who: 'Martin Fowler', title: 'Technical debt quadrant', text: 'Fowler argues the useful distinction is not debt vs non-debt but <b>prudent vs reckless</b>, crossed with <b>deliberate vs inadvertent</b>. He also notes prudent debt in rarely touched code may never be worth paying.', src: 2 },
        { when: '2012', who: 'Letouzey &amp; Ilkiewicz', title: 'SQALE method', text: 'The SQALE method (IEEE Software) defines debt as the <b>remediation cost</b> of gaps from a "right code" quality model, and separates it from the business impact of not fixing it. SonarQube\'s debt ratio and maintainability rating build on it.', src: 3 },
        { when: '2015', who: 'Adam Tornhill', title: 'Hotspots: Your Code as a Crime Scene', text: 'Tornhill applies forensic ideas to version control: combine <b>change frequency</b> with complexity to find hotspots. CodeScene\'s docs note hotspots are a probability of where problems are, not a precise verdict.', src: 4 },
        { when: 'Sep 2018', who: 'Stripe', title: 'The Developer Coefficient', text: 'In a survey of developers and C-level executives, developers estimated the average developer spends <b>13.5 hours of a 41.1-hour week</b> on technical debt. It is self-reported, but it is the figure executives most often quote.', src: 5 },
        { when: '2022', who: 'Tornhill &amp; Borg', title: 'Code Red: business impact of code quality', text: 'Across 39 proprietary codebases, low-health code had about <b>15× more defects</b> and <b>124% longer</b> time-in-development, with much higher variance in task time. Vendor-affiliated authors and a proprietary metric, but the first large quantitative link to delivery.', src: 6 },
        { when: '—', who: 'Shopify Engineering', title: 'The 25 percent rule', text: 'Shopify describes giving debt a standing share of time at several scales (daily, weekly, monthly, yearly) and making the case for it to senior leaders, rather than waiting for a crisis.', src: 8 },
        { when: 'ongoing', who: 'SAFe · Reinertsen', title: 'WSJF and cost of delay', text: 'SAFe ranks features and enablers alike by <b>cost of delay ÷ job size</b>, using relative estimates. Reinertsen, whose flow book it builds on, uses real money: "if you only quantify one thing, quantify the cost of delay".', src: 9 }
      ],
      lessons: [
        'Debt is a <b>design learning</b> problem first: the code reflects what you knew then. Refactoring keeps it in step with what you know now.',
        'Measure <b>where</b> interest is paid: git history and hotspots beat a total remediation number for choosing work.',
        'Self-reported time lost (Stripe, surveys) wins attention; delivery metrics per area (lead time, failure rate) keep it.',
        'Prefer incremental replacement to rewrites; when you must replace, do it behind a seam, one hotspot at a time.'
      ],
      sources: [
        { title: 'The WyCash Portfolio Management System (OOPSLA \'92 experience report)', url: 'https://agilealliance.org/introduction-to-the-technical-debt-concept', pub: 'via Agile Alliance, Introduction to the Technical Debt Concept' },
        { title: 'Ward Explains Debt Metaphor', url: 'https://c2wiki.gothdyke.mom/WardExplainsDebtMetaphor.html', pub: 'c2 wiki mirror, video transcript (2009)' },
        { title: 'Technical Debt Quadrant', url: 'https://martinfowler.com/bliki/TechnicalDebtQuadrant.html', pub: 'Martin Fowler, Oct 2009' },
        { title: 'Managing Technical Debt with the SQALE Method (accepted version)', url: 'https://lists.uniroma2.it/index.html/arc/isssr/2014-01/msg00007/IEEE-SW-Managing-TD-with-SQALE-Accepted-version.pdf', pub: 'Letouzey &amp; Ilkiewicz, IEEE Software 2012' },
        { title: 'Hotspots (CodeScene documentation)', url: 'https://docs.enterprise.codescene.io/versions/3.4.2/guides/technical/hotspots.html', pub: 'CodeScene' },
        { title: 'The Developer Coefficient', url: 'https://stripe.com/files/reports/the-developer-coefficient.pdf', pub: 'Stripe, Sep 2018' },
        { title: 'Code Red: The Business Impact of Code Quality', url: 'https://arxiv.org/abs/2203.04374v1', pub: 'Tornhill &amp; Borg, TechDebt 2022' },
        { title: 'Things You Should Never Do, Part I', url: 'https://joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i', pub: 'Joel Spolsky, Apr 2000' },
        { title: 'Technical Debt: The 25 Percent Rule', url: 'https://shopify.engineering/technical-debt-25-percent-rule', pub: 'Shopify Engineering' },
        { title: 'Weighted Shortest Job First', url: 'https://framework.scaledagile.com/wsjf/', pub: 'SAFe Knowledge Base' },
        { title: 'Technical Debt', url: 'https://martinfowler.com/bliki/TechnicalDebt.html', pub: 'Martin Fowler' },
        { title: 'Metric definitions (technical debt ratio, maintainability rating)', url: 'https://docs.sonarsource.com/sonarqube-server/2025.4/user-guide/code-metrics/metrics-definition', pub: 'SonarSource docs' }
      ]
    },

    tradeoffs: {
      headers: ['Strategy', 'Strength', 'Weakness', 'Use when…'],
      rows: [
        ['<b>Continuous share</b> (15–25%)', 'Steady, predictable; debt never piles up; easy to plan around', 'Needs discipline when deadlines press; can drift to random clean-up without a register', 'Default for any long-lived product team'],
        ['<b>Boy-scout rule</b>', 'Perfectly targeted (only code you touch); no negotiation needed', 'Small increments; cannot fix architecture or cross-cutting debt', 'Always, as a team norm on top of anything else'],
        ['<b>Tie to features</b> ("refactor first, then add")', 'Debt work is part of the estimate; pays off in the same feature', 'Inflates estimates; PMs may push back without data', 'A hotspot sits directly in the roadmap\'s path'],
        ['<b>Debt sprints / fix-it weeks</b>', 'Focus for big items (framework upgrade, build system)', 'Stop-start; debt regrows between; product loses whole sprints', 'A time-boxed campaign with a clear goal'],
        ['<b>Rewrite / replace</b>', 'Can remove architectural debt the others cannot reach', 'Long delay with no customer value; loses hidden knowledge; usually late', 'Platform is truly end-of-life; do it incrementally (strangler fig)']
      ]
    },
    failures: [
      { f: 'Invisible debt work', detect: 'Engineers "sneak in" refactoring; PM sees only slow delivery', fix: 'Register plus area-level lead time; report paydown and its effect every quarter.' },
      { f: 'Cleaning cold code', detect: 'Refactoring PRs on files with near-zero churn', fix: 'Rank by hotspots or cost of delay; mark cold debt <code>accepted</code>.' },
      { f: 'Everything is "tech debt"', detect: 'Register full of bugs, feature requests and process complaints', fix: 'Define debt (design no longer fits); route bugs and features to their own backlogs.' },
      { f: 'The allocation evaporates under pressure', detect: 'Debt share falls to 0% each time a deadline appears', fix: 'Agree it with leadership as policy; show the interest curve when it is cut.' },
      { f: 'Metric gaming', detect: 'SonarQube grade improves, lead time does not', fix: 'Judge success by delivery and incident metrics in the hotspot area, not tool scores.' },
      { f: 'Rewrite that never lands', detect: 'Two systems in parallel for over a year; feature freeze on the old one', fix: 'Strangler fig: replace one slice at a time, ship each slice, retire old code as you go.' },
      { f: 'New debt as fast as you pay', detect: 'Register grows faster than it shrinks', fix: 'Quality gate on new code; ArchUnit rules; ADRs for any deliberate shortcut.' }
    ],

    interview: [
      { q: 'What is technical debt? Where does the term come from?', a: '<p>Ward Cunningham coined it in his <b>OOPSLA 1992</b> WyCash experience report: shipping first-time code is like taking on debt; a little speeds you up if you <b>pay it back promptly by refactoring</b>, and the time lost working in not-quite-right code is the <b>interest</b>.</p><p>Common misreading: it is not permission to write bad code. Cunningham later said the point was code that reflects your <i>current understanding</i>, refactored as understanding grows.</p>', lvl: 'core' },
      { q: 'Explain Fowler\'s technical debt quadrant.', a: '<p>Two axes (Fowler, 2009): <b>deliberate vs inadvertent</b>, and <b>prudent vs reckless</b>.</p><ul><li>Prudent + deliberate: "we must ship now and deal with consequences".</li><li>Reckless + deliberate: "we don\'t have time for design".</li><li>Reckless + inadvertent: the team did not know good design.</li><li>Prudent + inadvertent: "now we know how we should have done it": unavoidable learning.</li></ul><p>Use it to choose the response: record and schedule deliberate debt, train for reckless, refactor for learning.</p>', lvl: 'core' },
      { q: 'How do you measure technical debt?', a: '<ul><li><b>Where</b>: hotspots, change frequency × complexity from git history (Tornhill).</li><li><b>How much to fix</b>: static analysis remediation cost, SonarQube debt ratio (SQALE).</li><li><b>What it costs</b>: lead time and change failure rate per area (DORA), defects traced to modules.</li><li><b>How it feels</b>: a short developer survey ("which area slows you down most?").</li></ul><p>No single number: the principal comes from tools, the interest from delivery data.</p>', fu: 'Why not just use the SonarQube total? (It ignores where change happens, and misses architecture.)', lvl: 'core' },
      { q: 'What is a hotspot and why does it beat a static-analysis total?', a: '<p>A hotspot is code that is both <b>complex</b> and <b>changed often</b>. Interest is paid only when you work in the code, so a complex file nobody touches costs little. Change frequency is strongly linked to defects, and in practice a small share of files carries most of the changes. Fixing those first gives the biggest return per hour.</p>', lvl: 'core' },
      { q: 'How much capacity should go to tech debt?', a: '<p>There is no law. A common <b>rule of thumb</b> is a <b>steady 15–25%</b> (Shopify wrote about 25%) plus the boy-scout rule. The right number is whatever keeps interest (time lost) <b>flat or falling</b>: measure lead time and survey scores and adjust. Avoid 0% then a panic 100% rewrite.</p>', lvl: 'core' },
      { q: 'How do you prioritise debt items against features?', a: '<p>Put them in the same currency: <b>cost of delay ÷ size</b> (WSJF). Cost of delay for debt = interest per sprint (hours, incidents) + risk (security, end-of-life) + the features it blocks. Hotspots and items on the roadmap\'s path rank high; cold code ranks low and is often accepted.</p>', lvl: 'deep' },
      { q: 'The team wants a full rewrite. What do you do?', a: '<p>Ask what problem the rewrite solves and whether it can be solved <b>incrementally</b>. Spolsky\'s 2000 warning (Netscape): rewrites lose embedded knowledge and stop delivery. Prefer a <b>strangler fig</b>: put a seam in front, replace the worst hotspot first, ship each slice. Rewrite only when the platform is truly end-of-life or the architecture cannot meet a hard requirement, and even then in slices.</p>', lvl: 'deep' },
      { q: 'How do you stop new debt being added?', a: '<ul><li>Quality gate on <b>new code</b> in CI (SonarQube "clean as you code").</li><li><b>ArchUnit</b> or similar fitness functions for layering and cycles.</li><li>ADRs for deliberate shortcuts, with a payback trigger in the register.</li><li>Definition of done that includes tests and docs.</li></ul>', lvl: 'deep' },
      { q: 'What types of technical debt are there?', a: '<p><b>Code</b> (complexity, duplication), <b>architecture</b> (wrong boundaries, cycles, shared database), <b>test</b> (missing or flaky tests), <b>infrastructure</b> (manual deploys, snowflake servers), <b>documentation</b>, and <b>dependency/version</b> debt (old frameworks, end-of-life runtimes). Architecture and dependency debt are the most expensive and the least visible to code scanners.</p>', lvl: 'core' },
      { q: 'Tell me about a time you convinced a product manager to fund debt work. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: our PM had rejected two "refactoring epics"; pricing changes took about 9 days each. <b>Task</b>: get sustained capacity without stalling the roadmap.</p><p><b>Action</b>: I ran a hotspot analysis; 6 files out of 2,000 took a large share of commits. I matched them to lead time per ticket and three incidents last quarter, then showed the next two roadmap features touched those files. I asked for 20% for one quarter, with a lead-time target.</p><p><b>Result</b>: pricing lead time dropped to about 4 days, incidents in that area fell to one, and the PM kept the 20% in the next quarter\'s plan.</p>', lvl: 'core' },
      { q: 'Tell me about a time you took on technical debt on purpose. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a partner launch in six weeks; proper multi-tenant configuration would take ten. <b>Task</b>: hit the date without trapping us.</p><p><b>Action</b>: I proposed hard-coded config for one tenant, wrote an ADR naming it as deliberate debt, and logged a register item with the trigger "before tenant #2", owner and a three-week estimate. The PM signed it.</p><p><b>Result</b>: we launched on time; when tenant #2 was signed four months later the item went straight into the next sprint and shipped before any copy-paste spread.</p>', lvl: 'core' },
      { q: 'Tell me about a time debt work did not pay off. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: we spent a two-week debt sprint cleaning a legacy reporting module that scored badly in static analysis. <b>Task</b>: I had chosen the target.</p><p><b>Action</b>: afterwards I checked git history: the module had changed twice in a year. The real hotspot, order routing, had changed 140 times. I shared the miss openly, moved us to hotspot-based selection and a continuous share instead of debt sprints.</p><p><b>Result</b>: the next quarter\'s work on routing cut its lead time noticeably, and the "which file first" debate became a data question.</p>', lvl: 'deep' }
    ],

    code: [
      {
        title: 'Python: hotspot analysis from git log (churn × size/complexity)', lang: 'python',
        code: `# Rank files by change frequency x complexity. Python 3.11+, run inside a git repo.
import subprocess, sys
from collections import Counter
from pathlib import Path

def churn(since="12 months ago") -> Counter:
    out = subprocess.run(
        ["git", "log", f"--since={since}", "--name-only", "--pretty=format:"],
        capture_output=True, text=True, check=True).stdout
    return Counter(line for line in out.splitlines() if line.strip())

def complexity(path: Path) -> int:
    """Cheap proxy (Tornhill): count indented logical lines; deeper = more complex."""
    total = 0
    for line in path.read_text(errors="ignore").splitlines():
        s = line.expandtabs(4)
        if s.strip():
            total += 1 + (len(s) - len(s.lstrip())) // 4   # 1 per line + nesting depth
    return total

def hotspots(top=15, exts=(".java", ".py", ".ts", ".go")):
    changes = churn()
    rows = []
    for f, n in changes.items():
        p = Path(f)
        if p.suffix in exts and p.exists():
            rows.append((f, n, complexity(p)))
    if not rows:
        return []
    max_n = max(r[1] for r in rows); max_c = max(r[2] for r in rows)
    scored = [(f, n, c, (n / max_n) * (c / max_c)) for f, n, c in rows]
    return sorted(scored, key=lambda r: r[3], reverse=True)[:top]

if __name__ == "__main__":
    print(f"{'score':>6} {'commits':>7} {'cmplx':>6}  file")
    for f, n, c, s in hotspots(int(sys.argv[1]) if len(sys.argv) > 1 else 15):
        print(f"{s:6.2f} {n:7d} {c:6d}  {f}")`,
        note: 'Indentation-based complexity is the language-neutral proxy Tornhill recommends for a first pass; swap in cyclomatic complexity (e.g. <code>lizard</code>) if you want more precision. Run it per repository and look at the top 10, not the whole list.'
      },
      {
        title: 'Postgres: debt register and WSJF priority query', lang: 'sql',
        code: `CREATE TABLE debt_item (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title            text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('code','arch','test','infra','docs','dependency')),
  quadrant         text CHECK (quadrant IN ('prudent-deliberate','reckless-deliberate',
                                            'prudent-inadvertent','reckless-inadvertent')),
  module           text NOT NULL,
  interest_h       numeric NOT NULL DEFAULT 0,  -- extra hours per sprint
  risk_score       int NOT NULL DEFAULT 1 CHECK (risk_score BETWEEN 1 AND 13),
  blocks_roadmap   boolean NOT NULL DEFAULT false,
  principal_days   numeric NOT NULL CHECK (principal_days > 0),
  owner_team       text NOT NULL,
  payback_trigger  text,
  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','planned','paid','accepted')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Cost of delay per sprint (hours) = interest + risk + roadmap boost; WSJF = CoD / size.
SELECT d.id, d.title, d.module,
       round(cod.hours, 1)                          AS cost_of_delay_h,
       d.principal_days,
       round(cod.hours / (d.principal_days * 8), 3) AS wsjf,
       coalesce(h.hotspot_score, 0)                  AS hotspot
FROM debt_item d
LEFT JOIN module_hotspot h ON h.path = d.module
CROSS JOIN LATERAL (
  SELECT d.interest_h * (1 + coalesce(h.hotspot_score, 0))
       + d.risk_score * 2
       + CASE WHEN d.blocks_roadmap THEN 16 ELSE 0 END AS hours
) cod
WHERE d.status IN ('open', 'planned')
ORDER BY wsjf DESC
LIMIT 20;`,
        note: 'The weights (2 hours per risk point, 16 hours for blocking the roadmap) are a team convention, not a standard: agree them with the PM once, then let the query rank. <code>module_hotspot</code> is the nightly table from the data model above.'
      },
      {
        title: 'Java 21: ArchUnit rules that stop new architecture debt in CI', lang: 'java',
        code: `// JUnit 5 + ArchUnit 1.x. Fails the build when new code breaks the agreed structure.
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.freeze.FreezingArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

@AnalyzeClasses(packages = "com.acme.shop", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureDebtTest {

  @ArchTest
  static final ArchRule layers = layeredArchitecture().consideringAllDependencies()
      .layer("Web").definedBy("..web..")
      .layer("Domain").definedBy("..domain..")
      .layer("Persistence").definedBy("..persistence..")
      .whereLayer("Web").mayNotBeAccessedByAnyLayer()
      .whereLayer("Persistence").mayOnlyBeAccessedByLayers("Domain");

  // Existing cycles are recorded once and tolerated; any NEW cycle fails the build.
  @ArchTest
  static final ArchRule noNewCycles = FreezingArchRule.freeze(
      slices().matching("com.acme.shop.(*)..").should().beFreeOfCycles());

  @ArchTest
  static final ArchRule noLegacyClient = noClasses().that().resideOutsideOfPackage("..legacy..")
      .should().dependOnClassesThat().resideInAPackage("com.acme.legacy.billing..")
      .because("DEBT-142: billing v1 is being strangled; use BillingPort");
}`,
        note: '<code>FreezingArchRule</code> is the ArchUnit equivalent of SonarQube\'s "clean as you code": known violations are stored and allowed to shrink, new ones fail. Pair it with a SonarQube quality gate on new code for code-level debt.'
      }
    ],

    related: ['socio-technical-laws', 'stakeholder-communication', 'design-principles', 'strangler-fig', 'architecture-governance', 'risk-management']
  });
})();
