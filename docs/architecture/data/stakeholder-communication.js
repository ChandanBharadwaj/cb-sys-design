(function () {
  /* Risk-adjusted option comparison used by the calculator.
     Expected cost = upfront cost + P(failure) × impact. Benefit starts after delivery.
     Status quo: you keep paying the expected annual loss you are trying to remove. All $K. */
  function model(v) {
    const exp = v.cost + (v.p / 100) * v.impact;               // expected cost of the plan
    const monthly = v.benefit / 12;
    const horizon = 36;
    const benefit3y = monthly * Math.max(0, horizon - v.months);
    const roi = exp > 0 ? (benefit3y - exp) / exp : 0;
    const payback = monthly > 0 ? v.months + exp / monthly : Infinity;
    const quo = (v.quo / 100) * v.impact * 3;                    // 3-year expected loss of doing nothing
    return { exp, benefit3y, roi, payback, quo };
  }
  const k = (n) => (Math.abs(n) >= 1000 ? '$' + (n / 1000).toFixed(1) + 'M' : '$' + Math.round(n) + 'K');

  SD.register({
    slug: 'stakeholder-communication',
    domain: 9,
    title: 'Stakeholder Communication',
    examples: 'Pyramid principle, one-pagers',
    tagline: 'Lead with the answer, speak in <b>money, risk and time</b>, offer options with a recommendation, and tell bad news <b>early</b>.',
    tldr: {
      problem: 'Architects make good technical decisions that never get funded, or get funded and then surprise everyone. The usual cause is not the idea but the message: a 40-slide deep dive for a CFO, a vague "it\'s risky" for an engineer, a green status that was really red.',
      idea: 'Map who matters (<b>power/interest grid</b>, <b>RACI</b>). For each audience, write a <b>pyramid</b>: the answer first, three supporting points in their vocabulary (revenue, cost, risk, time, customer experience), then a clear ask. Present <b>options with a recommendation</b>, quantify risk as <b>probability × impact</b>, and follow up in writing.',
      insight: 'Executives do not need less information, they need it <b>in a different order</b> and <b>a different unit</b>. "p99 latency" becomes "checkout abandonment"; "risk of downtime" becomes "10% chance of a 4-hour outage costing about $200K".',
      numbers: [
        { v: '1 sentence', l: 'the answer you lead with (Minto: the top of the pyramid)' },
        { v: '6 pages', l: 'Amazon narrative memo, read silently at the meeting start (Bezos, 2018 letter)' },
        { v: '4 quadrants', l: 'Mendelow power/interest grid: manage, satisfy, inform, monitor' }
      ]
    },

    intro: {
      what: 'Stakeholder communication is how an architect gets <b>decisions made and kept</b> by people who do not read code: executives, product managers, finance, operations, other teams. It covers <b>who</b> to talk to, <b>what</b> each of them cares about, and <b>how</b> to structure the message so the decision is easy to make.',
      analogy: {
        icon: '🩺',
        title: 'A surgeon talking to a patient\'s family',
        text: 'A surgeon does not explain suture technique to the family. She says: <b>"We recommend surgery tomorrow. It has a 95% success rate; waiting raises the risk. We need your consent today."</b> The same facts go to the surgical team in clinical detail. The analogy breaks in one place: your executives are not passive, they own the budget and will push back, so you need options, not just a diagnosis.'
      },
      problem: 'An architect asks the leadership team for three months to shard the main database. She spends 20 minutes on replication lag and connection pools. The CEO asks "so what happens if we don\'t?" and nobody has a number. The decision is deferred; six weeks later the database falls over on Black Friday. The question this page answers is <b>"how do I turn a technical need into a decision the right people make quickly, and keep supporting?"</b>',
      story: [
        {
          stage: 'naive',
          title: 'Explain everything, in order',
          text: 'The architect tells the story the way she lived it: background, analysis, options, and the recommendation on the last slide. <b>Same deck for everyone.</b>',
          scene: {
            nodes: [
              { id: 'arch', label: 'Architect', sub: '40-slide deck', kind: 'person', at: [210, 0] },
              { id: 'exec', label: 'CEO / CFO', sub: 'same deck', kind: 'person', at: [70, 110] },
              { id: 'pm', label: 'Product', sub: 'same deck', kind: 'person', at: [210, 110] },
              { id: 'eng', label: 'Eng teams', sub: 'same deck', kind: 'team', at: [350, 110] },
              { id: 'dec', label: 'Decision', sub: 'last slide', kind: 'policy', at: [210, 220] }
            ],
            edges: [{ from: 'arch', to: 'exec' }, { from: 'arch', to: 'pm' }, { from: 'arch', to: 'eng' }, { from: 'pm', to: 'dec' }],
            flow: [['arch>exec', 'arch>pm', 'arch>eng'], 'pm>dec']
          }
        },
        {
          stage: 'breaks',
          title: 'The CEO leaves at slide 12',
          text: 'Executives tune out before the answer; product hears only "three months of no features"; engineers want more detail. Nobody hears a cost or a risk in their own units, so the <b>decision is deferred</b> and the risk lands anyway.',
          scene: {
            nodes: [
              { id: 'arch', label: 'Architect', sub: 'still on slide 12', kind: 'person', at: [210, 0] },
              { id: 'exec', label: 'CEO / CFO', sub: '"so what?"', kind: 'person', at: [70, 110] },
              { id: 'pm', label: 'Product', sub: '"no features?!"', kind: 'person', at: [210, 110] },
              { id: 'eng', label: 'Eng teams', sub: 'want detail', kind: 'team', at: [350, 110] },
              { id: 'dec', label: 'Decision', sub: 'deferred', kind: 'policy', at: [210, 220] }
            ],
            edges: [{ from: 'arch', to: 'exec' }, { from: 'arch', to: 'pm' }, { from: 'arch', to: 'eng' }, { from: 'pm', to: 'dec' }],
            flow: [['arch>exec', 'arch>pm', 'arch>eng'], 'pm>dec'],
            err: ['exec', 'dec'], warn: ['pm', 'eng'],
            badges: { exec: ['lost', 'err'], dec: ['deferred', 'err'] }
          }
        },
        {
          stage: 'fix',
          title: 'Answer first, in their units',
          text: 'One <b>decision memo</b>: the recommendation in the first sentence, three reasons, options with cost and risk, and the ask. Then <b>tailored versions</b>: money and risk for the CFO, roadmap impact for product, design detail for engineers.',
          scene: {
            nodes: [
              { id: 'arch', label: 'Architect', sub: 'memo + map', kind: 'person', at: [210, 0] },
              { id: 'exec', label: 'CEO / CFO', sub: '$ · risk · ask', kind: 'person', at: [70, 110] },
              { id: 'pm', label: 'Product', sub: 'roadmap impact', kind: 'person', at: [210, 110] },
              { id: 'eng', label: 'Eng teams', sub: 'design doc', kind: 'team', at: [350, 110] },
              { id: 'dec', label: 'Decision', sub: 'made in 1 meeting', kind: 'policy', at: [210, 220] }
            ],
            edges: [{ from: 'arch', to: 'exec' }, { from: 'arch', to: 'pm' }, { from: 'arch', to: 'eng' }, { from: 'exec', to: 'dec' }],
            flow: [['arch>exec', 'arch>pm', 'arch>eng'], 'exec>dec'],
            ok: ['exec', 'dec', 'pm', 'eng'],
            badges: { dec: ['approved', 'ok'] }
          }
        }
      ],
      usedBy: ['Amazon (six-page narrative memos, PR/FAQ)', 'McKinsey and most strategy consultancies (Pyramid Principle)', 'US Army correspondence (BLUF)', 'Project management practice (PMI stakeholder registers, RACI)', 'Architecture teams using C4 context diagrams'],
      whenToUse: [
        'You need money, people or time from someone who does not share your technical context',
        'A decision affects several groups with different goals (product, finance, ops, security)',
        'Something is going wrong and people outside the team will be affected'
      ],
      whenNot: [
        'A reversible, local decision your team owns: decide and note it in an ADR, see <a href="rfcs-adrs.html">RFCs &amp; ADRs</a>',
        'The real problem is a disagreement between engineers: see <a href="conflict-resolution.html">Conflict Resolution</a>',
        'You need a full risk register, not a message: see <a href="risk-management.html">Risk Management</a>'
      ],
      glossary: [
        { term: 'Stakeholder', def: 'Anyone who can affect, or is affected by, the decision or the system.' },
        { term: 'Power/interest grid', def: 'Mendelow\'s 2×2 that places stakeholders by influence and concern to choose how closely to engage them.' },
        { term: 'RACI', def: 'A matrix naming who is Responsible, Accountable, Consulted and Informed for each decision or task.' },
        { term: 'Pyramid Principle', def: 'Barbara Minto\'s rule: state the governing idea first, then group supporting ideas beneath it.' },
        { term: 'SCQA', def: 'Situation, Complication, Question, Answer: Minto\'s way to open a document so the answer lands.' },
        { term: 'BLUF', def: 'Bottom Line Up Front: the US Army writing rule to put the conclusion or request first.' },
        { term: 'RAG status', def: 'Red / Amber / Green project health rating; a "watermelon" is green outside, red inside.' },
        { term: 'Expected cost', def: 'Probability × impact, summed over risks: the unit that lets executives compare risky options.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Answer first</b>: recommendation and ask in the first two sentences (Pyramid / BLUF)',
        '<b>Know your audience</b>: map stakeholders by power and interest; set RACI per decision',
        '<b>Translate units</b>: latency, coupling and debt become revenue, cost, risk, time-to-market and customer experience',
        '<b>Options with a recommendation</b>: two or three real options, including "do nothing", with cost, time and risk',
        '<b>Quantify risk</b>: probability × impact in money or hours, with a range, not adjectives',
        '<b>Close the loop</b>: written follow-up with decision, owners and dates; status that reflects reality'
      ],
      nonFunctional: [
        'Decision in ≤ 1 meeting for most asks (target)',
        'Exec summary readable in ≤ 2 minutes; memo ≤ 6 pages',
        'Bad news escalated within 1 working day of being known',
        'No stakeholder hears a decision affecting them first from someone else',
        'Status changes colour at most one step between reports (no green → red jumps)',
        'Every decision has a written record and a named accountable owner'
      ],
      outOfScope: [
        '<b>Slide 37 recommendation</b>: the answer arrives after the audience has left',
        '<b>Jargon wall</b>: "p99", "sharding", "CQRS" to a CFO with no business translation',
        '<b>Hobson\'s choice</b>: one real option plus two straw men nobody would pick',
        '<b>Watermelon status</b>: green on the report, red in the team',
        '<b>Drive-by approval</b>: a hallway "yes" with no written follow-up'
      ]
    },

    calculator: {
      inputs: [
        { id: 'cost', label: 'Option cost (people + infra)', min: 20, max: 3000, value: 400, step: 10, unit: '$K', log: true },
        { id: 'months', label: 'Months to deliver', min: 1, max: 24, value: 3, unit: 'mo' },
        { id: 'p', label: 'Probability the plan goes wrong', min: 0, max: 60, value: 10, unit: '%' },
        { id: 'impact', label: 'Impact if it goes wrong (outage, rework)', min: 10, max: 5000, value: 600, step: 10, unit: '$K', log: true },
        { id: 'benefit', label: 'Benefit per year once delivered', min: 10, max: 5000, value: 900, step: 10, unit: '$K', log: true },
        { id: 'quo', label: 'Yearly chance of that loss if we do nothing', min: 0, max: 100, value: 40, unit: '%' }
      ],
      outputs: [
        { label: 'Expected cost of the plan (cost + p × impact)', f: (v) => k(model(v).exp) },
        { label: 'Benefit over 3 years (after delivery)', f: (v) => k(model(v).benefit3y) },
        { label: 'Risk-adjusted ROI over 3 years', f: (v) => (model(v).roi * 100).toFixed(0) + '%' },
        { label: 'Payback', f: (v) => { const p = model(v).payback; return isFinite(p) && p <= 120 ? p.toFixed(1) + ' months' : 'never (no benefit)'; } },
        { label: 'Expected 3-year loss of doing nothing', f: (v) => k(model(v).quo) },
        { label: 'One-line exec summary', f: (v) => {
          const m = model(v);
          if (m.roi < 0 && m.quo < m.exp) return 'Do not proceed: expected cost ' + k(m.exp) + ' exceeds 3-year return and the risk of waiting (' + k(m.quo) + ').';
          return 'Recommend: invest ' + k(v.cost) + ' over ' + v.months + ' mo; risk-adjusted ROI ' + (m.roi * 100).toFixed(0) + '%, payback ' + (isFinite(m.payback) ? m.payback.toFixed(0) : '∞') + ' mo; waiting risks ' + k(m.quo) + '.';
        } }
      ],
      note: 'Simple undiscounted model over a 3-year horizon. Expected cost = cost + p × impact; the benefit starts only after delivery; payback = delivery months + expected cost ÷ monthly benefit. "Do nothing" uses the same impact with its own yearly probability, which is the number executives most often never see. The defaults are <em>illustrative</em>. Give ranges ("$300–500K") when the inputs are guesses, and say so.'
    },

    api: [
      { m: 'DOC', p: 'Decision memo / one-pager', d: '<b>BLUF</b> line (recommendation + ask + deadline), SCQA context, 2–3 options with cost, time, risk (p × impact) and customer effect, recommendation with reasons, what we need from you, and how we will report progress.' },
      { m: 'DOC', p: 'Six-page narrative', d: 'Amazon-style prose for large or contested decisions: full sentences instead of bullets, appendices for data. Read silently at the start of the meeting, then discussed.' },
      { m: 'DOC', p: 'Stakeholder map', d: 'Each stakeholder on the power/interest grid with attitude (supporter, neutral, blocker), what they care about, preferred channel and cadence, and the owner of that relationship.' },
      { m: 'YAML', p: 'RACI matrix', d: 'Per decision or workstream: exactly <b>one A</b>, at least one R, a short C list (two-way), a wider I list (one-way). Kept in the repo next to the ADR.' },
      { m: 'DOC', p: 'C4 context diagram', d: 'One box for the system, its users and the external systems it talks to. No technology names. The only diagram most executives need.' },
      { m: 'DOC', p: 'Status report', d: 'RAG with <b>defined criteria</b> (e.g. amber = date at risk by &gt; 2 weeks), trend arrow, top 3 risks with p × impact, decisions needed, and what changed since last time.' }
    ],

    dataModel: [
      { name: 'stakeholder', store: 'Wiki table / Postgres', fields: [['stakeholder_id', 'text', 'pk'], ['name_role', 'text'], ['power', 'int 1–5', 'idx'], ['interest', 'int 1–5', 'idx'], ['attitude', 'support|neutral|block'], ['cares_about', 'text'], ['channel_cadence', 'text'], ['owner', 'text', 'fk']], note: 'Mendelow\'s two axes plus attitude, which the plain grid leaves out. Re-score at each milestone.' },
      { name: 'raci_entry', store: 'YAML in repo', fields: [['decision_id', 'text', 'pk'], ['stakeholder_id', 'text', 'pk'], ['role', 'R|A|C|I'], ['notified_at', 'timestamp']], note: 'Constraint: exactly one <code>A</code> per decision.' },
      { name: 'decision_log', store: 'ADR repo / Postgres', fields: [['decision_id', 'text', 'pk'], ['question', 'text'], ['options', 'jsonb'], ['recommended', 'text'], ['decided', 'text'], ['decided_by', 'text', 'fk'], ['decided_at', 'date', 'idx'], ['follow_up_sent', 'bool']] },
      { name: 'status_report', store: 'Postgres', fields: [['project_id', 'text', 'pk'], ['week', 'date', 'pk'], ['rag', 'R|A|G', 'idx'], ['rag_reason', 'text'], ['trend', 'up|flat|down'], ['top_risks', 'jsonb'], ['asks', 'text']], note: 'Storing the reason forces "green because…", which is where watermelons are caught.' }
    ],

    architecture: {
      title: 'From a technical situation to a decision people keep',
      nodes: [
        { id: 'sit', label: 'Tech situation', sub: 'e.g. shard the DB', kind: 'service', wide: [90, 165], tall: [210, 0], tip: 'Start from the facts: what is happening, what it costs, what happens if nothing changes.' },
        { id: 'map', label: 'Stakeholder map', sub: 'power × interest', kind: 'policy', wide: [280, 55], tall: [70, 110], tip: 'Mendelow grid plus attitude. Tells you whom to manage closely, keep satisfied, keep informed or monitor.' },
        { id: 'arch', label: 'Architect', sub: 'rides the elevator', kind: 'person', wide: [280, 165], tall: [210, 110], tip: 'Hohpe\'s architect elevator: connects the engine room to the penthouse and translates in both directions.' },
        { id: 'raci', label: 'RACI', sub: 'one Accountable', kind: 'policy', wide: [280, 275], tall: [350, 110], tip: 'Who decides, who does the work, who must be asked, who must be told.' },
        { id: 'memo', label: 'Decision memo', sub: 'answer first', kind: 'store', wide: [470, 110], tall: [70, 220], tip: 'Pyramid / BLUF one-pager: recommendation, three reasons, options with cost and risk, the ask.' },
        { id: 'brief', label: 'Tailored briefs', sub: 'per audience', kind: 'store', wide: [470, 275], tall: [350, 220], tip: 'Same facts, different units: roadmap impact for product, design detail for engineers, runbook impact for ops.' },
        { id: 'exec', label: 'CEO / CFO', sub: 'money · risk · time', kind: 'person', wide: [680, 55], tall: [70, 330], tip: 'High power. Wants the answer, the cost, the risk in money, and what you need from them.' },
        { id: 'pm', label: 'Product lead', sub: 'roadmap · customers', kind: 'person', wide: [680, 165], tall: [210, 330], tip: 'Wants to know which features move and what customers will notice.' },
        { id: 'eng', label: 'Eng teams', sub: 'design · effort', kind: 'team', wide: [680, 275], tall: [350, 330], tip: 'Wants the design, the migration plan and who does what.' },
        { id: 'ops', label: 'SRE / Ops', sub: 'risk · runbooks', kind: 'team', wide: [680, 385], tall: [350, 440], tip: 'Wants maintenance windows, rollback plans, on-call impact.' },
        { id: 'forum', label: 'Decision forum', sub: 'approve / defer', kind: 'policy', wide: [880, 110], tall: [70, 440], tip: 'Where the decision is actually made. Pre-wire key people before it; never surprise them in it.' },
        { id: 'status', label: 'Status (RAG)', sub: 'follow-up loop', kind: 'compute', wide: [880, 330], tall: [210, 440], tip: 'Honest, criteria-based status and early bad news keep the decision alive after it is made.' }
      ],
      edges: [
        { from: 'sit', to: 'arch' },
        { from: 'arch', to: 'map' },
        { from: 'arch', to: 'raci' },
        { from: 'arch', to: 'memo' },
        { from: 'arch', to: 'brief' },
        { from: 'memo', to: 'exec' },
        { from: 'brief', to: 'pm' },
        { from: 'brief', to: 'eng' },
        { from: 'brief', to: 'ops' },
        { from: 'exec', to: 'forum' },
        { from: 'pm', to: 'forum' },
        { from: 'forum', to: 'status' },
        { from: 'eng', to: 'status' },
        { from: 'status', to: 'exec', dashed: true, bend: 0.3 }
      ]
    },

    scenarios: [
      {
        id: 'shard', title: 'Getting 3 months for a DB sharding', tone: 'ok',
        steps: [
          { text: 'The primary Postgres is at 80% CPU at peak and growing. Sharding needs <b>3 months and 4 engineers</b>, with a risk of downtime during cut-over.', flow: ['sit>arch'], badges: { sit: '80% CPU' } },
          { text: '<b>Map first.</b> CFO and CEO: high power, low interest in detail. Product lead: high power, high interest (features pause). Ops: high interest. RACI: CTO is <b>Accountable</b>.', flow: [['arch>map', 'arch>raci']], badges: { map: '4 groups', raci: 'A = CTO' } },
          { text: 'Memo opens with the answer: <b>"Approve 3 months to shard the database; without it we expect peak-traffic outages within two quarters."</b> Then cost, risk as p × impact, and two alternatives.', flow: ['arch>memo', 'memo>exec'], badges: { memo: 'BLUF' }, ok: ['memo'] },
          { text: 'Tailored briefs: product hears "two features slip one sprint each, checkout stays fast"; engineers get the design doc; ops gets the cut-over and rollback plan.', flow: ['arch>brief', ['brief>pm', 'brief>eng', 'brief>ops']] },
          { text: 'Key people were pre-wired, so the forum <b>decides in one meeting</b>. A written follow-up lists the decision, owner, dates and the first status date.', flow: [['exec>forum', 'pm>forum'], 'forum>status'], ok: ['forum', 'status'], badges: { forum: ['approved', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'watermelon', title: 'Watermelon status (failure)', tone: 'err',
        steps: [
          { text: 'Week 6 of the sharding project. The team knows the data migration tool is <b>4 weeks behind</b>. The status report still says <b>green</b>: "we can catch up".', flow: ['eng>status'], labels: { status: { label: 'Status: GREEN', sub: 'really red' } }, warn: ['status'], badges: { eng: ['4 wks late', 'warn'] } },
          { text: 'Weeks 7–10: still green. Nobody outside the team can help, because nobody outside the team knows. Product plans a launch on the original date.', flow: ['status>exec', 'brief>pm'], warn: ['pm'], badges: { pm: 'launch planned' } },
          { text: 'Week 11: status jumps from <b>green to red</b>. The launch is cancelled, marketing spend is wasted, and the CFO asks why the first warning came a week before the date.', nodes: ['exec', 'status'], err: ['exec', 'status', 'pm'], badges: { exec: ['surprised', 'err'] }, tone: 'err' },
          { text: 'Cost: the slip itself was recoverable; the <b>loss of trust</b> is not. The next ask from this architect will get more scrutiny and less benefit of the doubt.', nodes: ['arch'], err: ['arch'], badges: { arch: ['trust ↓', 'err'] } },
          { text: 'Fix: RAG with written criteria (amber = any milestone &gt; 1 week late), a "why this colour" field, and a rule that bad news goes up <b>within a day</b>, with options.', flow: ['eng>status', 'status>exec'], ok: ['status'], labels: { status: { label: 'Status: AMBER', sub: 'with 3 options' } }, tone: 'ok' }
        ]
      },
      {
        id: 'badnews', title: 'Delivering bad news early', tone: 'warn',
        steps: [
          { text: 'Load testing in week 3 shows cut-over needs a <b>2-hour write freeze</b>, not the zero-downtime plan in the memo.', flow: ['eng>status'], warn: ['eng'], badges: { eng: ['2 h freeze', 'warn'] } },
          { text: 'Same day, BLUF to the CTO and product lead: <b>"Cut-over needs a 2-hour write freeze. We recommend Sunday 02:00–04:00. Decision needed by Friday."</b>', flow: ['status>exec', 'brief>pm'], badges: { exec: 'heard early' } },
          { text: 'Options with numbers: Sunday window (≈ $8K lost orders, <em>estimate</em>), 3 more weeks to build dual-writes (zero downtime, launch slips), or a phased per-tenant cut-over.', flow: ['exec>forum'], badges: { forum: '3 options' } },
          { text: 'Product chooses the Sunday window and tells support and customers in advance. <b>Nobody is surprised</b>, and trust in the next status report goes up.', flow: ['forum>status'], ok: ['forum', 'exec', 'pm'], tone: 'ok' }
        ]
      },
      {
        id: 'no', title: 'Saying no to a scope change under pressure', tone: 'warn',
        steps: [
          { text: 'Mid-project, sales asks to add <b>multi-region</b> to the sharding work "since you\'re in there anyway" for a big deal.', flow: ['pm>forum'], nodes: ['pm'], warn: ['pm'], badges: { pm: 'scope +' } },
          { text: 'Do not say "no" or "yes". Say <b>"yes, and here is what it costs"</b>: +2 months, +$300K, and the outage risk window doubles.', flow: ['arch>memo', 'memo>exec'], badges: { memo: 'trade-off' } },
          { text: 'Offer options: (A) finish sharding, then multi-region (deal date at risk); (B) both now (+2 months for everything); (C) a contractual commitment to multi-region next quarter.', nodes: ['forum'], badges: { forum: 'A / B / C' } },
          { text: 'The CEO picks C: sales gets a dated commitment, the team keeps focus. The decision and the date go in the decision log and the next status report.', flow: ['exec>forum', 'forum>status'], ok: ['forum', 'status'], tone: 'ok' }
        ]
      },
      {
        id: 'scale', title: 'At scale: 30 stakeholders, 5 teams', tone: 'info',
        steps: [
          { text: 'A platform migration touches five teams, two vendors, security, legal and finance. One message for everyone no longer works, and meetings do not scale.', flow: ['sit>arch'], badges: { arch: '30 people' } },
          { text: 'Use the grid to set cadence: <b>manage closely</b> (weekly 1:1s), <b>keep satisfied</b> (monthly brief), <b>keep informed</b> (fortnightly newsletter), <b>monitor</b> (changelog).', flow: ['arch>map'], badges: { map: '4 cadences' } },
          { text: 'A RACI per workstream stops the "I thought you were deciding that" problem. Exactly one <b>A</b> per decision.', flow: ['arch>raci'], ok: ['raci'] },
          { text: 'One written source of truth (memo + status page) and tailored digests on top of it. A C4 context diagram is the one picture every audience shares.', flow: ['arch>memo', 'arch>brief', ['brief>pm', 'brief>eng', 'brief>ops'], 'forum>status'], ok: ['memo', 'status'], tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Pick who you are talking to and how. The meters show how well the message is likely to land. The scoring is an illustrative model of common experience, not a measured study.',
      controls: [
        { id: 'aud', label: 'Audience', type: 'seg', value: 'exec', options: [
          { v: 'exec', l: 'Executive', hint: 'CEO, CFO' }, { v: 'pm', l: 'Product manager' }, { v: 'eng', l: 'Engineers' }, { v: 'ops', l: 'Ops / SRE' }] },
        { id: 'frame', label: 'Framing', type: 'seg', value: 'biz', options: [
          { v: 'tech', l: 'Technical detail' }, { v: 'biz', l: 'Business impact' }, { v: 'opts', l: 'Options + recommendation' }] },
        { id: 'fmt', label: 'Format', type: 'seg', value: 'memo', options: [
          { v: 'deck', l: 'Slide deck' }, { v: 'memo', l: 'One-pager memo' }, { v: 'demo', l: 'Demo' }] },
        { id: 'timing', label: 'Bad news timing', type: 'seg', value: 'early', options: [
          { v: 'early', l: 'Early (as soon as known)' }, { v: 'late', l: 'Late (when certain)' }] }
      ],
      evaluate(s) {
        const c = (x) => Math.max(0.05, Math.min(1, x));
        const fit = {
          exec: { tech: 0.15, biz: 0.75, opts: 0.95 },
          pm: { tech: 0.35, biz: 0.8, opts: 0.85 },
          eng: { tech: 0.9, biz: 0.5, opts: 0.75 },
          ops: { tech: 0.8, biz: 0.45, opts: 0.7 }
        }[s.aud][s.frame];
        const fmtK = {
          deck: { exec: 0.75, pm: 0.8, eng: 0.6, ops: 0.6 },
          memo: { exec: 0.95, pm: 0.85, eng: 0.8, ops: 0.85 },
          demo: { exec: 0.55, pm: 0.9, eng: 0.85, ops: 0.7 }
        }[s.fmt][s.aud];
        const early = s.timing === 'early';
        const clarity = c(fit * 0.7 + fmtK * 0.3);
        const speed = c((s.frame === 'opts' ? 0.9 : s.frame === 'biz' ? 0.65 : 0.3) * (s.aud === 'exec' ? 1 : 0.9) * (s.fmt === 'memo' ? 1 : s.fmt === 'deck' ? 0.85 : 0.75) + (early ? 0.05 : -0.1));
        const trust = c((early ? 0.85 : 0.3) + (s.frame === 'opts' ? 0.1 : 0) - (s.frame === 'tech' && s.aud === 'exec' ? 0.1 : 0));
        const buyin = c(0.45 * clarity + 0.35 * trust + (s.frame === 'opts' ? 0.2 : 0.1) + (s.fmt === 'demo' && s.aud !== 'exec' ? 0.05 : 0));
        const surprise = c(early ? 0.85 + (s.fmt === 'memo' ? 0.1 : 0) : 0.2);
        const prep = { deck: 0.6, memo: 0.5, demo: 0.35 }[s.fmt];
        const avg = (clarity + speed + trust + buyin + surprise) / 5;
        const metrics = [
          { k: 'Clarity', v: clarity > 0.75 ? 'lands first time' : clarity > 0.5 ? 'needs follow-up' : 'lost in translation', s: clarity },
          { k: 'Decision speed', v: speed > 0.75 ? 'decided in the meeting' : speed > 0.5 ? 'one more round' : 'deferred', s: speed },
          { k: 'Trust', v: trust > 0.75 ? 'rising' : trust > 0.5 ? 'steady' : 'damaged', s: trust },
          { k: 'Buy-in', v: buyin > 0.75 ? 'committed' : buyin > 0.5 ? 'compliant' : 'resisting', s: buyin },
          { k: 'Low risk of surprise', v: surprise > 0.75 ? 'no surprises' : 'surprise likely', s: surprise },
          { k: 'Prep effort', v: { deck: '≈ 1–2 days', memo: '≈ 2–5 days (writing is thinking)', demo: '≈ 3–5 days + rehearsal' }[s.fmt], s: prep, hint: 'illustrative' }
        ];
        const notes = [];
        if (s.aud === 'exec' && s.frame === 'tech') notes.push('Executives cannot weigh "p99 latency" against revenue. Translate to <b>money, risk, time</b> or they will defer.');
        if (s.aud === 'eng' && s.frame === 'biz') notes.push('Engineers hear business-only framing as "management decided". Show the <b>design and the trade-offs</b> too, or buy-in is shallow.');
        if (s.frame === 'opts') notes.push('Options + recommendation gives a decision-maker something to <b>choose</b>, not just approve. Include "do nothing" with its cost.');
        if (s.fmt === 'memo') notes.push('A memo forces complete sentences and causal logic; Amazon reads them silently at the start of the meeting.');
        if (s.fmt === 'demo' && s.aud === 'exec') notes.push('A demo shows the feature but not the cost or the risk. Pair it with a one-page summary.');
        if (s.fmt === 'deck' && s.aud === 'exec') notes.push('If you use slides, make the first one the answer and the ask (BLUF). Put the detail in an appendix.');
        if (!early) notes.push('Late bad news turns a schedule problem into a <b>trust</b> problem: a watermelon. Escalate with options as soon as it is likely, not certain.');
        let verdict;
        if (!early && avg < 0.55) verdict = '❌ <b>Late bad news sinks the message.</b> Whatever the framing, the audience will remember the surprise.';
        else if (!early) verdict = '⚠ <b>Well framed, but late.</b> Clarity is good; trust and surprise suffer because the news arrived when it was certain, not when it was likely.';
        else if (avg > 0.8) verdict = '✅ <b>Strong fit.</b> The right framing and format for this audience, with bad news shared early.';
        else if (avg > 0.65) verdict = '👍 <b>Workable.</b> Tighten the framing for this audience to get a faster decision.';
        else verdict = '⚠ <b>Mismatch.</b> The message is not in this audience\'s units; expect "so what?" and a deferred decision.';
        const target = { exec: 'exec', pm: 'pm', eng: 'eng', ops: 'ops' }[s.aud];
        const via = s.aud === 'exec' ? 'memo' : 'brief';
        const tone = avg > 0.75 && early ? 'ok' : avg > 0.55 ? 'warn' : 'err';
        return {
          metrics, verdict, notes,
          flow: ['sit>arch', 'arch>' + via, via + '>' + target].concat(target === 'exec' || target === 'pm' ? [target + '>forum', 'forum>status'] : [target === 'eng' ? 'eng>status' : 'brief>ops']),
          labels: { [via]: { label: via === 'memo' ? 'Decision memo' : 'Tailored brief', sub: { deck: 'slide deck', memo: 'one-pager', demo: 'demo' }[s.fmt] + ' · ' + { tech: 'tech', biz: 'business', opts: 'options' }[s.frame] } },
          hot: [target], ok: tone === 'ok' ? [target] : [], warn: tone === 'warn' ? [target] : [], err: tone === 'err' ? [target] : [],
          badges: { [target]: [tone === 'ok' ? 'lands' : tone === 'warn' ? 'partly' : 'misses', tone], status: early ? ['early', 'ok'] : ['late', 'err'] }
        };
      }
    },

    widget: {
      title: 'Message rewriter and power/interest grid',
      caption: 'Pick a technical situation and an audience: the rewriter builds a <b>pyramid</b> (answer, three supporting points, the ask) using that audience\'s metrics and vocabulary. Below, <b>drag stakeholders</b> on the power/interest grid; each gets a Mendelow quadrant and a suggested communication plan (channel, cadence, framing).'
    },

    realWorld: {
      intro: 'The core tools are old and well documented: Minto from consulting, BLUF from the US Army, Mendelow from strategy research, and Amazon\'s memo culture from industry. The architect-specific framing comes from Hohpe and Brown.',
      timeline: [
        { when: '1960s–1987', who: 'Barbara Minto (McKinsey)', title: 'The Pyramid Principle', text: 'Minto, an early woman consultant at McKinsey, codifies "start with the answer, then group and summarise the supporting ideas", with SCQA introductions. The book appears in 1987; her textbook edition supersedes it.', src: 1 },
        { when: 'Ongoing', who: 'Minto Books International', title: 'Ideas as a pyramid under a single point', text: 'The official site states the principle: thinking is easy to grasp when ideas are presented as a pyramid under a single point. <b>Misreading</b>: it is not just "be brief"; the supporting points must logically answer the question the top raises.', src: 0 },
        { when: '1991', who: 'Aubrey Mendelow', title: 'Power/interest grid', text: 'Mendelow\'s stakeholder mapping places stakeholders on power and interest axes, giving four engagement strategies. NN/g notes it leaves out <b>attitude</b>, so add supporter/blocker yourself. Sources differ on the exact paper title.', src: 2 },
        { when: 'AR 25-50', who: 'US Army', title: 'Bottom Line Up Front', text: 'Army correspondence rules require the main point (recommendation, conclusion or reason for writing) in the first paragraph. BLUF is the civilian shorthand for the same rule.', src: 3 },
        { when: '2006–', who: 'Simon Brown', title: 'C4 System Context diagram', text: 'The first C4 level shows the system as one box with its users and neighbouring systems, intended for <b>everyone, technical and non-technical</b>. It is the right diagram for an executive audience.', src: 4 },
        { when: 'Apr 2018', who: 'Jeff Bezos (Amazon)', title: 'Six-page narrative memos', text: 'In the 2017 shareholder letter Bezos writes that Amazon does not do PowerPoint presentations; it writes narratively structured <b>six-page memos</b>, read silently at the start of each meeting in a kind of "study hall", and that a great memo probably takes a week or more.', src: 5 },
        { when: '2020', who: 'Gregor Hohpe', title: 'The Software Architect Elevator', text: 'Hohpe describes architects who ride the elevator between the IT <b>engine room</b> and the <b>penthouse</b> of leadership, translating strategy into technical decisions and technical realities into business terms.', src: 6 },
        { when: '2021', who: 'Bryar & Carr (ex-Amazon)', title: 'Working Backwards and the PR/FAQ', text: 'The book describes Amazon\'s practice of writing a future press release and FAQ before building: a stakeholder document that starts from customer impact, refined over several reviews with senior leaders.', src: 7 },
        { when: 'Practice', who: 'Project management', title: 'The watermelon status report', text: 'Green outside, red inside: reports that look healthy while the project is in trouble, driven by optimism, incentives and fear. Practitioners call it <b>worse than an honest red</b>, because it removes the chance to help.', src: 8 }
      ],
      lessons: [
        'Put the <b>answer and the ask first</b>. Every source above (Minto, Army, Amazon) converges on this.',
        'Change the <b>unit</b>, not just the length, for each audience: money, risk, time and customer impact for executives.',
        'Writing is thinking. A memo exposes gaps that a deck hides, which is why Amazon takes a week over one.',
        'Trust is the asset. Early, honest bad news with options keeps it; a watermelon spends it.'
      ],
      sources: [
        { title: 'The Minto Pyramid Principle: concept', url: 'https://barbaraminto.com/concept', pub: 'Minto Books International' },
        { title: 'Barbara Minto', url: 'https://en.wikipedia.org/wiki/Barbara_Minto', pub: 'Wikipedia' },
        { title: 'Stakeholder Analysis for UX Projects', url: 'https://www.nngroup.com/articles/stakeholder-analysis/', pub: 'Nielsen Norman Group' },
        { title: 'BLUF (communication)', url: 'https://en.wikipedia.org/wiki/BLUF_(communication)', pub: 'Wikipedia (citing AR 25-50)' },
        { title: 'The C4 model for visualising software architecture', url: 'https://c4model.com/', pub: 'Simon Brown' },
        { title: '2017 Letter to Shareholders', url: 'https://www.aboutamazon.com/2017-letter-to-shareholders/', pub: 'Amazon, Apr 2018' },
        { title: 'About the Architect Elevator', url: 'https://architectelevator.com/about', pub: 'Gregor Hohpe' },
        { title: 'Working Backwards: inside Amazon\'s strategy to launch new products', url: 'https://www.geekwire.com/2021/working-backwards-customer-inside-amazons-strategy-launch-new-products/', pub: 'GeekWire, 2021' },
        { title: 'The Poisonous Watermelon: a Project Management Fable', url: 'https://builtin.com/product-management/poisonous-watermelon-project-management-fable', pub: 'Built In' },
        { title: 'Watermelon Reports: When a Green Status Hides a Red Project', url: 'https://blog.masterofproject.com/watermelon-status-report/', pub: 'Master of Project' }
      ]
    },

    tradeoffs: {
      headers: ['Format', 'Strength', 'Weakness', 'Use for'],
      rows: [
        ['<b>One-pager memo</b> (BLUF)', 'Fast to read, forces a clear answer and ask, easy to forward', 'Little room for nuance; a weak recommendation is exposed', 'Most decisions; pre-reads for executives'],
        ['<b>Six-page narrative</b>', 'Complete causal reasoning, silent reading levels the room', 'A week or more to write well; overkill for small asks', 'Large, contested or strategic decisions'],
        ['<b>Slide deck</b>', 'Visual, good for large audiences and storytelling', 'Bullets hide missing logic; recommendation drifts to the end', 'Town halls, kick-offs; put the answer on slide 1'],
        ['<b>Demo</b>', 'Makes the benefit concrete; builds excitement', 'Shows the happy path, not cost or risk', 'Product and engineering audiences; pair with a memo for execs'],
        ['<b>Status report (RAG)</b>', 'Cheap, regular, comparable over time', 'Easily becomes a watermelon without criteria', 'Ongoing projects; with a "why this colour" field']
      ]
    },

    failures: [
      { f: 'Recommendation buried at the end', detect: 'Executives ask "so what do you want?" or leave early', fix: 'BLUF: answer and ask in the first two sentences; detail in an appendix.' },
      { f: 'Jargon for a business audience', detect: 'Questions are about terms, not the decision; decision deferred', fix: 'Translate each technical point into revenue, cost, risk, time-to-market or customer experience.' },
      { f: 'Straw-man options', detect: 'Options B and C are obviously absurd; decision-makers feel managed', fix: 'Two or three real options including "do nothing", each with honest cost and risk.' },
      { f: 'Watermelon status', detect: 'Long runs of green followed by a jump to red; team mood does not match the report', fix: 'Written RAG criteria, a reason per colour, trend arrows, and reward for early amber.' },
      { f: 'Missed stakeholder', detect: 'Late objection from security, legal or a dependent team', fix: 'Power/interest map and RACI at the start; re-score at each milestone.' },
      { f: 'Surprise in the decision meeting', detect: 'A powerful attendee objects publicly to something they hear for the first time', fix: 'Pre-wire: 1:1 walk-throughs with high-power stakeholders before the forum.' },
      { f: 'Hallway approval, no follow-up', detect: 'Two people remember different decisions a month later', fix: 'Written follow-up within 24 h: decision, owner, dates, what was not decided.' }
    ],

    interview: [
      { q: 'How would you explain a database sharding project to the CFO?', a: '<p>Answer first, in money, risk and time:</p><ul><li><b>Ask</b>: "Approve 3 months and 4 engineers (≈ $400K) to split our main database."</li><li><b>Why</b>: at current growth we expect peak-traffic outages within two quarters; one hour of checkout downtime costs about $X.</li><li><b>Risk</b>: ~10% chance of a short outage during cut-over; we schedule it in a low-traffic window with a rollback plan.</li><li><b>Options</b>: do nothing (expected loss), buy a bigger machine (6 months of headroom), shard (years).</li></ul><p>No mention of hash keys or replicas unless asked.</p>', fu: 'What if they ask for a guarantee of no downtime?', lvl: 'core' },
      { q: 'What is the Pyramid Principle, and what is SCQA?', a: '<p><b>Barbara Minto</b> (developed at McKinsey; book 1987): present the <b>governing idea first</b>, then the supporting points grouped beneath it, each group summarised by the idea above. Points at one level should be the same kind of idea and together answer the question the top raises (MECE).</p><p><b>SCQA</b> is the introduction: <b>Situation</b> (what the reader agrees with), <b>Complication</b> (what changed), <b>Question</b> (which the complication raises), <b>Answer</b> (the top of the pyramid). <b>Common misreading</b>: it is not "be short"; it is "be logically ordered, answer first".</p>', lvl: 'core' },
      { q: 'How do you map stakeholders for a large change?', a: '<p>List everyone affected, then place them on <b>Mendelow\'s power/interest grid</b>:</p><ul><li>High power, high interest: <b>manage closely</b> (1:1s, pre-wire decisions).</li><li>High power, low interest: <b>keep satisfied</b> (short, outcome-focused briefs).</li><li>Low power, high interest: <b>keep informed</b> (regular updates, invite input).</li><li>Low power, low interest: <b>monitor</b>.</li></ul><p>Add <b>attitude</b> (supporter, neutral, blocker), which the grid omits, and a RACI per decision with exactly one Accountable. Re-score at each milestone: interest rises when something affects people.</p>', lvl: 'core' },
      { q: 'How do you quantify technical risk for executives?', a: '<p>Turn adjectives into <b>probability × impact</b>: "10% chance of a 4-hour outage; at $50K/hour that is $200K × 0.1 = $20K expected". Give a <b>range</b> and say where the numbers come from (incident history, load tests, industry rule of thumb). Compare against the <b>risk of doing nothing</b>, which is the number most often missing.</p><p>Then present expected cost, payback and ROI per option, with a one-line summary and a recommendation.</p>', lvl: 'core' },
      { q: 'What is the "architect elevator"?', a: '<p><b>Gregor Hohpe</b>\'s metaphor (book <i>The Software Architect Elevator</i>, 2020): architects ride between the <b>engine room</b> (code, infrastructure) and the <b>penthouse</b> (strategy, leadership). Value comes from carrying information both ways: strategy into technical decisions, technical constraints and options into business terms. An architect who stays on one floor is either an ivory-tower strategist or a senior developer.</p>', lvl: 'core' },
      { q: 'How do you present a trade-off so a decision actually gets made?', a: '<ul><li>Frame the <b>question</b> the decision-maker is answering.</li><li>Two or three <b>real options</b>, including do nothing, each with cost, time, risk and customer effect in the same units.</li><li>A clear <b>recommendation</b> and why.</li><li>What you need, by when, and what happens if the decision slips.</li><li>Pre-wire the key people; follow up in writing.</li></ul><p>Options let executives exercise judgement; a single proposal invites "come back with alternatives".</p>', lvl: 'deep' },
      { q: 'What diagrams would you show an executive?', a: '<p>Usually one: a <b>C4 System Context</b> diagram. Simon Brown\'s first C4 level shows your system as a single box with its users and the external systems it depends on, with no technology choices. It answers "what is this and what does it touch?" Annotate it with the <b>business</b> point: where revenue flows, where the risk sits. Container and component diagrams belong in engineering reviews.</p>', lvl: 'core' },
      { q: 'What is a watermelon status, and how do you prevent it?', a: '<p>A status that is <b>green outside and red inside</b>: the report looks healthy while the team knows it is not. Causes: optimism, fear of blame, incentives to look good.</p><p>Prevent it with <b>written RAG criteria</b> (amber = a milestone at risk by more than a set amount), a "why this colour" field, trend arrows, leading indicators (burn-up, open risks), and by <b>rewarding early amber</b> so people are not punished for honesty.</p>', lvl: 'deep' },
      { q: 'Tell me about a time you had to deliver bad news to senior leadership. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: three weeks into a payments migration, load tests showed cut-over needed a 2-hour write freeze, not the zero-downtime plan leadership had approved. <b>Task</b>: as lead architect, tell the CTO and product VP and get a decision before the launch date was at risk.</p><p><b>Action</b>: I sent a BLUF note the same day: the problem, the cause, three options (Sunday 02:00 window ≈ $8K lost orders; 3 more weeks for dual writes; phased per-merchant cut-over) and my recommendation, then walked both through it 1:1 before the weekly review.</p><p><b>Result</b>: they chose the Sunday window in one meeting; support warned merchants a week ahead; cut-over took 95 minutes with no escalations. The CTO later asked for the same format in all project reviews.</p>', lvl: 'deep' },
      { q: 'Tell me about a time you said no to a stakeholder. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: midway through a database re-platform, sales asked us to add multi-region support for a large prospect. <b>Task</b>: protect the project without losing the deal.</p><p><b>Action</b>: instead of "no", I wrote a one-pager: adding it now meant +2 months, ≈ $300K and twice the outage-risk window. I offered three options, including a contractual commitment to multi-region the following quarter, and met the sales VP before the steering meeting.</p><p><b>Result</b>: the CEO chose the dated commitment; the prospect signed; we delivered the re-platform on time and multi-region one quarter later.</p>', lvl: 'deep' },
      { q: 'Tell me about a time you won buy-in for an unpopular technical investment. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: our monolith\'s deploy pipeline took 90 minutes and failed one run in five, but product leadership saw a pipeline rebuild as "no customer value". <b>Task</b>: secure one quarter for two engineers.</p><p><b>Action</b>: I measured lost engineering time (≈ 6 engineer-hours a day waiting or re-running) and converted it to money and to features delayed per quarter. I mapped stakeholders: the product VP was high power and sceptical, so I asked her team lead to co-present the time-to-market argument. I showed options: do nothing, quick fixes (half the gain), full rebuild.</p><p><b>Result</b>: the quick fixes were approved immediately and the rebuild a quarter later; deploys dropped to 20 minutes and release frequency doubled, which I reported monthly against the original memo.</p>', lvl: 'deep' },
      { q: 'How do you make sure a decision sticks after the meeting?', a: '<ul><li><b>Written follow-up</b> within a day: decision, options rejected and why, owner (the A in RACI), dates, open questions.</li><li>Record it in the <b>decision log / ADR</b> and link it from the status page.</li><li>Tell the <b>Informed</b> group directly so nobody hears it second-hand.</li><li>Report progress against the numbers in the memo, and raise variance early.</li></ul>', lvl: 'core' }
    ],

    code: [
      {
        title: 'Decision memo template (Markdown, BLUF + SCQA + options)', lang: 'yaml',
        code: `# DECISION: Shard the orders database (needed by 14 Mar)

**BLUF:** Approve 3 months and 4 engineers (~$400K) to shard the orders
database. Without it we expect peak-traffic outages within two quarters.

## Situation
Orders DB serves all checkout traffic; peak CPU is 80% and growing 6%/month.
## Complication
At this rate we hit saturation before the Q4 peak. Last year's 1-hour
checkout outage cost ~$50K in lost orders (estimate from order rate).
## Question
How do we keep checkout available through Q4 at acceptable cost and risk?

## Options
| Option            | Cost   | Time  | Risk (p x impact)           | Customer effect   |
|-------------------|--------|-------|-----------------------------|-------------------|
| A. Do nothing     | $0     | -     | 40%/yr x $600K = $240K/yr   | outages at peak   |
| B. Bigger machine | $120K  | 3 wk  | buys ~6 months only         | none now          |
| C. Shard (rec.)   | $400K  | 3 mo  | 10% x $600K = $60K          | 2 h Sunday window |

## Recommendation
C, starting with B as a bridge if the Q3 trend steepens.

## What we need from you
1. Approve budget and the 2 features moving one sprint (Product).
2. Approve a 2-hour Sunday maintenance window in May.

## How we will report
Fortnightly RAG with written criteria; any milestone >1 week late = amber.`,
        note: 'The first two lines are all a busy executive must read. Each option uses the same units, and "do nothing" carries its own expected cost.'
      },
      {
        title: 'Python: risk-adjusted option comparison and exec summary', lang: 'python',
        code: `# Python 3.11+, no dependencies. All money in $K, horizon in months.
from dataclasses import dataclass

@dataclass(frozen=True)
class Option:
    name: str
    cost: float          # people + infra
    months: int          # time to deliver
    p_fail: float        # probability the plan goes wrong (0-1)
    impact: float        # cost if it goes wrong
    benefit_yr: float    # value per year once delivered

    def expected_cost(self) -> float:
        return self.cost + self.p_fail * self.impact

    def roi(self, horizon: int = 36) -> float:
        gain = self.benefit_yr / 12 * max(0, horizon - self.months)
        return (gain - self.expected_cost()) / self.expected_cost()

    def payback_months(self) -> float:
        monthly = self.benefit_yr / 12
        return self.months + self.expected_cost() / monthly if monthly else float("inf")

options = [
    Option("Do nothing", 0.01, 0, 0.40 * 3, 600, 0),   # 40%/yr chance, 3 years
    Option("Bigger machine", 120, 1, 0.25, 600, 300),
    Option("Shard", 400, 3, 0.10, 600, 900),
]
for o in options:
    print(f"{o.name:15} expected {o.expected_cost():7.0f}K  "
          f"ROI {o.roi():6.0%}  payback {o.payback_months():5.1f} mo")

best = max((o for o in options if o.benefit_yr), key=Option.roi)
print(f"\\nRecommend {best.name}: invest \${best.cost:.0f}K over {best.months} months; "
      f"risk-adjusted ROI {best.roi():.0%}, payback {best.payback_months():.0f} months. "
      f"Doing nothing carries ~\${options[0].expected_cost():.0f}K expected loss.")`,
        note: 'p_fail for "do nothing" is the yearly probability multiplied over the horizon (an approximation; it can exceed 1 as an expected count of incidents). Replace the numbers with ranges from incident history.'
      },
      {
        title: 'RACI for the decision (YAML, kept next to the ADR)', lang: 'yaml',
        code: `# raci/orders-db-sharding.yaml
decision: Shard the orders database
adr: ADR-0057
rules:
  accountable_per_item: exactly_one     # CI check fails otherwise
items:
  - name: Approve budget and timeline
    A: cto
    R: [lead-architect]
    C: [cfo, vp-product]
    I: [eng-managers, finance-bp]
  - name: Shard key and data model
    A: lead-architect
    R: [orders-team]
    C: [sre, dba, payments-team]
    I: [vp-product]
  - name: Cut-over window and rollback plan
    A: sre-lead
    R: [sre, orders-team]
    C: [support-lead, vp-product]
    I: [cto, customer-success, all-engineering]
  - name: Customer and support communication
    A: vp-product
    R: [support-lead]
    C: [lead-architect, sre-lead]
    I: [sales]
cadence:
  manage_closely: [cto, vp-product]          # weekly 1:1
  keep_satisfied: [cfo]                       # monthly one-pager
  keep_informed: [eng-managers, support-lead] # fortnightly status
  monitor: [sales]                            # changelog`,
        note: 'One <b>A</b> per item; C is two-way (asked before), I is one-way (told after). The cadence block links RACI to the power/interest grid.'
      }
    ],

    related: ['rfcs-adrs', 'build-vs-buy', 'risk-management', 'tech-debt', 'conflict-resolution', 'okrs-to-nfrs', 'documenting-architecture']
  });
})();
