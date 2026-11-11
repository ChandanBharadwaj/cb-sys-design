(function () {
  /* Expected-loss model shared by the calculator. All money in $K per year. */
  function el(v) {
    const p = v.p / 100, eff = v.eff / 100;
    const before = p * v.impact;
    const after = before * (1 - eff);
    const cut = before - after;
    return { before, after, cut, roi: v.cost > 0 ? (cut - v.cost) / v.cost : Infinity };
  }
  const k = (n) => n >= 1000 ? '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'M' : '$' + Math.round(n) + 'K';
  const bucketL = (p) => p < 5 ? 1 : p < 20 ? 2 : p < 50 ? 3 : p < 80 ? 4 : 5;
  const bucketI = (i) => i < 50 ? 1 : i < 250 ? 2 : i < 1000 ? 3 : i < 5000 ? 4 : 5;

  SD.register({
    slug: 'risk-management',
    domain: 3,
    title: 'Risk Management & Lock-in',
    examples: 'Risk register, pre-mortem',
    tagline: 'Write down what could go wrong, put a <b>price and an owner</b> on each item, and decide on purpose whether to avoid, reduce, transfer or accept it, including how hard it would be to <b>leave a vendor</b>.',
    tldr: {
      problem: 'Every architecture carries risk: a dependency vanishes, a vendor update crashes every machine, the one engineer who understands billing resigns, a contract makes leaving impossible. Unmanaged, these risks are discovered in production, by customers.',
      idea: 'Keep a living <b>risk register</b>: each risk has a likelihood, an impact, an <b>owner</b>, a <b>response</b> (avoid, mitigate, transfer, accept), a <b>trigger</b> that says when to act and a review date. Find risks with <b>pre-mortems</b>, <b>risk storming</b> and <b>ATAM</b>. Rank them by <b>expected loss</b>, not only by colour on a heat map.',
      insight: 'The goal is not zero risk. It is <b>risk you chose</b>: every residual risk is inside the agreed <b>risk appetite</b>, has a named owner, and has a tested plan. Vendor lock-in is one risk among many; price the <b>exit cost</b> instead of trying to remove it.',
      numbers: [
        { v: '4 + 1', l: 'responses: avoid, mitigate, transfer, accept (+ exploit for opportunities)' },
        { v: '< 10%', l: 'of random hazard pairs a typical risk matrix ranks correctly (Cox, 2008)' },
        { v: '~30%', l: 'better at naming failure causes with prospective hindsight (cited by Klein, 2007)' }
      ]
    },

    intro: {
      what: 'Risk management is the habit of <b>listing what could go wrong</b>, estimating how likely and how bad each thing is, and choosing a response before it happens. For an architect, risks include technical failures, security holes, vendor and licence changes, key people leaving, compliance gaps and late delivery. <b>Vendor lock-in</b> is the risk that leaving a supplier becomes too expensive to do.',
      analogy: {
        icon: '🏠',
        title: 'A homeowner before winter',
        text: 'A homeowner cannot stop storms, but can <b>avoid</b> some risks (do not build on the flood plain), <b>reduce</b> others (clean the gutters), <b>transfer</b> some (buy insurance) and <b>accept</b> the rest (a few broken roof tiles). They check the list each autumn. The analogy breaks in one place: insurance pays money back, while in software a transferred risk still hurts your users.'
      },
      problem: 'A team ships a payment service that depends on one cloud region, one open-source library and one senior engineer. Nobody wrote these down. The region has an outage, the library has a critical CVE, and the engineer is on holiday, all in the same quarter. The question this page answers is <b>"which risks are worth spending on, who owns each one, and how do we know when to act?"</b>',
      story: [
        {
          stage: 'naive',
          title: 'Hope plus a heroic team',
          text: 'Risks live in people\'s heads. When one fires, the strongest engineers drop everything and fix it. It seems to work, because <b>most risks do not fire most of the time</b>.',
          scene: {
            nodes: [
              { id: 'plan', label: 'Project plan', sub: 'no risk list', kind: 'policy', at: [210, 0] },
              { id: 'team', label: 'Team', sub: 'heroes on call', kind: 'team', at: [210, 110] },
              { id: 'a', label: 'Vendor', sub: 'single supplier', kind: 'external', at: [70, 220] },
              { id: 'b', label: 'OSS library', sub: 'unpinned', kind: 'service', at: [210, 220] },
              { id: 'c', label: 'Key person', sub: 'only one knows', kind: 'person', at: [350, 220] }
            ],
            edges: [{ from: 'plan', to: 'team' }, { from: 'team', to: 'a' }, { from: 'team', to: 'b' }, { from: 'team', to: 'c' }],
            flow: ['plan>team', ['team>a', 'team>b', 'team>c']]
          }
        },
        {
          stage: 'breaks',
          title: 'Three risks fire at once',
          text: 'A vendor update breaks production, a library CVE needs patching everywhere, and the one person who knows the billing code is away. Nobody knows who decides, what the fallback is, or <b>what was already accepted</b>.',
          scene: {
            nodes: [
              { id: 'plan', label: 'Project plan', sub: 'date slips', kind: 'policy', at: [210, 0] },
              { id: 'team', label: 'Team', sub: 'firefighting', kind: 'team', at: [210, 110] },
              { id: 'a', label: 'Vendor', sub: 'bad update', kind: 'external', at: [70, 220] },
              { id: 'b', label: 'OSS library', sub: 'critical CVE', kind: 'service', at: [210, 220] },
              { id: 'c', label: 'Key person', sub: 'on holiday', kind: 'person', at: [350, 220] }
            ],
            edges: [{ from: 'plan', to: 'team' }, { from: 'team', to: 'a' }, { from: 'team', to: 'b' }, { from: 'team', to: 'c' }],
            flow: [['a>team', 'b>team', 'c>team'], 'team>plan'],
            err: ['a', 'b'], warn: ['c', 'team', 'plan'],
            badges: { team: ['overloaded', 'err'], plan: ['late ⏳', 'warn'] }
          }
        },
        {
          stage: 'fix',
          title: 'A register with owners and triggers',
          text: 'Each risk is written down with an <b>owner</b>, a response and a trigger. The vendor sits behind an interface with a staged rollout, the library is pinned and scanned, the billing knowledge is shared. When something fires, the <b>plan already exists</b>.',
          scene: {
            nodes: [
              { id: 'plan', label: 'Risk register', sub: 'owner · trigger', kind: 'store', at: [210, 0] },
              { id: 'team', label: 'Team', sub: 'planned response', kind: 'team', at: [210, 110] },
              { id: 'a', label: 'Vendor', sub: 'port + staged', kind: 'external', at: [70, 220] },
              { id: 'b', label: 'OSS library', sub: 'pinned · SBOM', kind: 'service', at: [210, 220] },
              { id: 'c', label: 'Billing know-how', sub: 'pairing · docs', kind: 'team', at: [350, 220] }
            ],
            edges: [{ from: 'plan', to: 'team' }, { from: 'team', to: 'a' }, { from: 'team', to: 'b' }, { from: 'team', to: 'c' }],
            flow: ['plan>team', ['team>a', 'team>b', 'team>c']],
            ok: ['plan', 'a', 'b', 'c'],
            badges: { plan: ['risk you chose', 'ok'] }
          }
        }
      ],
      usedBy: ['ISO 31000 risk management guidelines (2018)', 'SEI ATAM architecture evaluations', 'NASA and defence programmes (risk matrices, risk registers)', 'Banks and insurers (risk appetite statements)', 'Teams running pre-mortems before launches'],
      whenToUse: [
        'Before committing to an architecture, a vendor or a launch date: run a pre-mortem or risk storming session',
        'When a system becomes business-critical, regulated or dependent on a single supplier',
        'On a fixed cadence (e.g. quarterly) and after any incident, licence change or key-person departure'
      ],
      whenNot: [
        'A small, cheap-to-reverse experiment: a heavyweight register costs more than the risks it lists',
        'Detailed security threats per data flow: use <a href="threat-modeling.html">Threat Modeling</a> (STRIDE) and feed its output in here',
        'Recovering after an outage: that is <a href="disaster-recovery.html">Disaster Recovery</a>; this page decides how much to invest before'
      ],
      glossary: [
        { term: 'Risk', def: 'ISO 31000: the "effect of uncertainty on objectives"; it can be negative (a threat) or positive (an opportunity).' },
        { term: 'Risk register', def: 'The list of identified risks with likelihood, impact, owner, response, trigger and status.' },
        { term: 'Expected loss', def: 'Likelihood × impact over a period, e.g. 10% per year × $2M = $200K per year.' },
        { term: 'Residual risk', def: 'The risk that remains after the chosen response is in place.' },
        { term: 'Risk appetite', def: 'How much risk the organisation is willing to carry to reach its goals, agreed by its leaders.' },
        { term: 'Pre-mortem', def: 'Gary Klein\'s exercise: imagine the project has already failed and ask everyone to write down why.' },
        { term: 'Trigger', def: 'An observable signal (a metric, a date, an event) that says a risk is turning into an issue and the plan must start.' },
        { term: 'Vendor lock-in', def: 'When leaving a supplier is so expensive (data, APIs, contracts, skills) that you effectively cannot.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Name it, own it</b>: every risk has one accountable owner, not a team or "IT"',
        '<b>Quantify where you can</b>: likelihood per period and impact in money or user-minutes, with a range',
        '<b>Choose a response on purpose</b>: avoid, mitigate, transfer, accept (or exploit an opportunity)',
        '<b>Define triggers</b>: the signal that moves a risk from "watch" to "act"',
        '<b>Compare residual risk to appetite</b>: anything above appetite needs more work or an explicit sign-off',
        '<b>Price the exit</b> for every critical supplier and keep it affordable'
      ],
      nonFunctional: [
        'Top-10 risks reviewed at least monthly; full register quarterly',
        '100% of high risks have an owner, a response and a trigger',
        'Every critical vendor has an exit plan with a tested data export in the last 12 months',
        'Bus factor ≥ 2 for every production system (two people can operate and change it)',
        'Third-party updates reach production in stages (canary → % rollout), never all at once',
        'Dependency inventory (SBOM) answers "where do we use library X?" in under 1 hour'
      ],
      outOfScope: [
        '<b>Register theatre</b>: a spreadsheet filled once for an audit and never read again',
        '<b>Colour-only ranking</b>: trusting the heat-map colour and ignoring expected loss',
        '<b>Accept by default</b>: risks "accepted" because nobody chose anything',
        '<b>Zero lock-in dogma</b>: abstracting every service and paying for multi-cloud nobody uses',
        '<b>Owner = everyone</b>: a risk owned by a committee is owned by nobody'
      ]
    },

    calculator: {
      inputs: [
        { id: 'p', label: 'Likelihood per year', min: 1, max: 95, value: 20, unit: '%' },
        { id: 'impact', label: 'Impact if it happens ($K)', min: 10, max: 20000, value: 2000, log: true, unit: 'K' },
        { id: 'cost', label: 'Mitigation cost per year ($K)', min: 0, max: 2000, value: 120, step: 10, unit: 'K' },
        { id: 'eff', label: 'Mitigation effectiveness', min: 0, max: 100, value: 70, step: 5, unit: '%' },
        { id: 'appetite', label: 'Risk appetite: max residual per risk ($K / yr)', min: 10, max: 1000, value: 100, step: 10, unit: 'K' }
      ],
      outputs: [
        { label: 'Expected annual loss before (likelihood × impact)', f: (v) => k(el(v).before) },
        { label: 'Residual expected loss after mitigation', f: (v) => k(el(v).after) + ' / yr' },
        { label: 'Loss avoided per year', f: (v) => k(el(v).cut) },
        { label: 'ROI of mitigation ((avoided − cost) ÷ cost)', f: (v) => { const r = el(v).roi; return r === Infinity ? 'free' : (r * 100).toFixed(0) + '%' + (r < 0 ? ' (costs more than it saves)' : ''); } },
        { label: 'Priority score (5×5: L × I, 1–25)', f: (v) => { const s = bucketL(v.p) * bucketI(v.impact); return s + ' / 25 · ' + (s >= 15 ? 'high' : s >= 8 ? 'medium' : 'low'); } },
        { label: 'Decision', f: (v) => { const e = el(v); if (e.after > v.appetite) return e.roi > 0 ? 'mitigate, and still above appetite: add controls or sign off' : 'above appetite: avoid, transfer or escalate'; return e.roi > 0 ? 'mitigate: pays for itself, residual within appetite' : (e.before <= v.appetite ? 'accept: within appetite, mitigation not worth it' : 'mitigation works but costs more than it saves: look for a cheaper one'); } }
      ],
      note: 'Expected loss is a <b>mean</b>: it hides the tail. A 1% chance of a $50M loss and a 50% chance of $1M both give $500K/year, but only one can end the company, so check the impact against the appetite as well (see the Monte Carlo snippet below). The priority buckets are a common 5×5 scheme (<em>rule of thumb</em>): likelihood <5 / 20 / 50 / 80%, impact <$50K / $250K / $1M / $5M.'
    },

    api: [
      { m: 'DOC', p: 'Risk register', d: 'ID, description ("<i>cause</i> → <i>event</i> → <i>effect</i>"), category, likelihood, impact, owner, response, mitigation actions, <b>trigger</b>, residual rating, status (open / mitigating / accepted / closed / occurred), review date.' },
      { m: 'POLICY', p: 'Risk appetite statement', d: 'Agreed by leadership per category, e.g. "no single risk with residual expected loss > $100K/yr", "zero tolerance for regulatory breaches", "moderate appetite for delivery risk on experiments".' },
      { m: 'DOC', p: 'Pre-mortem record', d: 'Plan briefed, "it is 12 months later and the project failed", each person\'s reasons, the clustered themes, and which ones became register entries with owners.' },
      { m: 'ADR', p: 'ADR: accepted risk', d: 'When you accept a significant risk, record it: why, the residual exposure, who signed off, and the trigger that reopens the decision.' },
      { m: 'POLICY', p: 'Vendor exit plan', d: 'Lock-in type (data, API, contractual, skills), export format and time, fallback option, estimated exit cost, last drill date, contract end and notice period.' },
      { m: 'YAML', p: 'risks.yaml in the repo', d: 'The register as code next to the system it covers, reviewed in pull requests and rendered into a dashboard.' }
    ],

    dataModel: [
      { name: 'risk', store: 'Postgres', fields: [['risk_id', 'text', 'pk'], ['title', 'text'], ['category', 'enum', 'idx'], ['likelihood_pct', 'numeric'], ['impact_usd', 'numeric'], ['owner', 'text', 'fk'], ['response', 'avoid|mitigate|transfer|accept|exploit'], ['trigger', 'text'], ['status', 'enum', 'idx'], ['review_due', 'date', 'idx']], note: 'Store numbers, not only colours: expected loss = likelihood × impact can then be sorted and summed.' },
      { name: 'mitigation', store: 'Postgres', fields: [['mitigation_id', 'bigint', 'pk'], ['risk_id', 'text', 'fk'], ['action', 'text'], ['cost_usd_year', 'numeric'], ['effectiveness_pct', 'numeric'], ['due', 'date'], ['done', 'bool']] },
      { name: 'risk_review', store: 'Postgres', fields: [['risk_id', 'text', 'pk'], ['reviewed_at', 'timestamptz', 'pk'], ['likelihood_pct', 'numeric'], ['impact_usd', 'numeric'], ['note', 'text']], note: 'History shows whether a risk is trending up and whether mitigations actually moved it.' },
      { name: 'vendor_dependency', store: 'Postgres', fields: [['vendor', 'text', 'pk'], ['lock_in_type', 'data|api|contract|skills'], ['exit_cost_usd', 'numeric'], ['last_export_drill', 'date', 'idx'], ['contract_end', 'date', 'idx']] }
    ],

    architecture: {
      title: 'The risk management loop: identify → assess → respond → monitor',
      nodes: [
        { id: 'src', label: 'Identify', sub: 'pre-mortem · storming', kind: 'team', wide: [90, 110], tall: [210, 0], tip: 'Pre-mortems, risk storming on the C4 diagrams, incident history, dependency scans, vendor reviews.' },
        { id: 'atam', label: 'ATAM review', sub: 'risks · sensitivity', kind: 'policy', wide: [90, 250], tall: [350, 105], tip: 'SEI ATAM outputs risks, non-risks, sensitivity points and trade-off points against quality-attribute scenarios.' },
        { id: 'reg', label: 'Risk register', sub: 'ID · L · I · owner', kind: 'store', wide: [280, 165], tall: [210, 105], tip: 'One row per risk: cause → event → effect, likelihood, impact, owner, response, trigger, status.' },
        { id: 'mon', label: 'Triggers + review', sub: 'monthly · on event', kind: 'compute', wide: [280, 330], tall: [70, 105], tip: 'Watch the triggers, re-score on a cadence and after incidents, licence changes or departures.' },
        { id: 'appetite', label: 'Risk appetite', sub: 'leadership limit', kind: 'person', wide: [470, 30], tall: [350, 215], tip: 'How much residual risk the business accepts, per category. Residual above appetite needs work or explicit sign-off.' },
        { id: 'assess', label: 'Assess', sub: 'L × I · expected loss', kind: 'policy', wide: [470, 165], tall: [210, 215], tip: 'Score on a 5×5 matrix for communication, but rank by expected loss and check the worst case.' },
        { id: 'avoid', label: 'Avoid', sub: 'change the plan', kind: 'policy', wide: [680, 30], tall: [70, 325], tip: 'Remove the cause: do not take the dependency, drop the feature, choose another design.' },
        { id: 'mitig', label: 'Mitigate', sub: 'lower L or I', kind: 'service', wide: [680, 140], tall: [210, 325], tip: 'Reduce likelihood (tests, staged rollout) or impact (redundancy, fallbacks, blast-radius limits).' },
        { id: 'transfer', label: 'Transfer', sub: 'insure · contract', kind: 'external', wide: [680, 250], tall: [350, 325], tip: 'Move the financial impact: insurance, SLA credits, indemnity. Your users still feel the outage.' },
        { id: 'accept', label: 'Accept', sub: 'signed + trigger', kind: 'person', wide: [680, 360], tall: [350, 435], tip: 'A deliberate, recorded choice by someone with authority, with a trigger that reopens it.' },
        { id: 'port', label: 'Port + exit plan', sub: 'lock-in mitigation', kind: 'service', wide: [890, 140], tall: [70, 435], tip: 'Your own interface in front of the vendor, portable data, a tested export and a contract exit clause.' },
        { id: 'resid', label: 'Residual risk', sub: '≤ appetite?', kind: 'store', wide: [890, 300], tall: [210, 435], tip: 'What remains after the response. Compare to appetite; record and monitor it.' }
      ],
      edges: [
        { from: 'src', to: 'reg' },
        { from: 'atam', to: 'reg' },
        { from: 'reg', to: 'assess' },
        { from: 'appetite', to: 'assess' },
        { from: 'assess', to: 'avoid' },
        { from: 'assess', to: 'mitig' },
        { from: 'assess', to: 'transfer' },
        { from: 'assess', to: 'accept', bend: 0.12 },
        { from: 'mitig', to: 'port' },
        { from: 'mitig', to: 'resid' },
        { from: 'transfer', to: 'resid' },
        { from: 'accept', to: 'resid' },
        { from: 'resid', to: 'mon', bend: -0.25 },
        { from: 'mon', to: 'reg' }
      ]
    },

    scenarios: [
      {
        id: 'premortem', title: 'Pre-mortem fills the register', tone: 'ok',
        steps: [
          { text: 'Before a migration to a new payments provider, the architect runs a <b>pre-mortem</b>: "It is a year from now and the migration was a disaster. Write down why." Two minutes, silently.', nodes: ['src'], badges: { src: '30 min' } },
          { text: 'Reasons come round the room one at a time: <i>webhook format differs</i>, <i>only Priya knows reconciliation</i>, <i>no way to export card tokens</i>. Each becomes a register entry: cause → event → effect.', flow: ['src>reg'], badges: { reg: '+9 risks' } },
          { text: 'Each risk is scored: likelihood per year and impact in dollars. "No token export" scores 20% × $3M = <b>$600K/yr</b> expected loss, top of the list.', flow: ['reg>assess'], warn: ['assess'], badges: { assess: ['$600K/yr', 'warn'] } },
          { text: 'Leadership\'s appetite is ≤ $100K/yr residual per risk, so it must be treated. Response: <b>mitigate</b>, with a token-portability clause in the contract and a port in front of the SDK.', flow: ['appetite>assess', 'assess>mitig', 'mitig>port'], ok: ['port'] },
          { text: 'Residual drops to about $90K/yr, inside appetite. Owner and trigger ("contract renewal, or export test fails") are recorded.', flow: ['mitig>resid', 'resid>mon'], ok: ['resid'], tone: 'ok', badges: { resid: ['≤ appetite', 'ok'] } }
        ]
      },
      {
        id: 'crowdstrike', title: 'Failure: a trusted vendor update (CrowdStrike, July 2024)', tone: 'err',
        steps: [
          { text: 'On 19 July 2024 a CrowdStrike Falcon <b>content update</b> (Channel File 291) caused an out-of-bounds memory read in a Windows kernel driver. Machines that received it crashed and could not boot normally.', nodes: ['transfer'], err: ['transfer'], labels: { transfer: { label: 'Security vendor', sub: 'kernel agent' } }, badges: { transfer: ['bad update', 'err'] }, tone: 'err' },
          { text: 'Many customers had implicitly <b>accepted</b> "vendor content updates go everywhere at once", because it was the product default and nobody had written it down as a risk.', flow: ['assess>accept'], warn: ['accept'], badges: { accept: ['implicit', 'warn'] } },
          { text: 'The impact was not in the register, so there was no plan: recovery needed <b>hands-on fixes per machine</b>, and BitLocker recovery keys had to be found first.', flow: ['accept>resid'], err: ['resid'], badges: { resid: ['not planned', 'err'] } },
          { text: 'CrowdStrike\'s review added content validation, bounds checks and <b>staged deployment</b> of content updates, plus customer control over update timing. The general lesson: a vendor with kernel access is a top-tier risk; demand staged rollout and plan recovery.', flow: ['resid>mon', 'mon>reg', 'reg>assess', 'assess>mitig'], ok: ['mitig'], badges: { mitig: ['staged rollout', 'ok'] } }
        ]
      },
      {
        id: 'lockin', title: 'Vendor lock-in: price the exit', tone: 'info',
        steps: [
          { text: 'A team adopts a managed queue with proprietary APIs. The register lists <b>four kinds of lock-in</b>: data (message history), API (SDK calls in 40 services), contractual (3-year commit) and skills (only this vendor\'s tooling).', flow: ['src>reg', 'reg>assess'], badges: { assess: '4 lock-in types' } },
          { text: 'Full avoidance (multi-cloud everything) would double run cost. Accepting all of it means a <b>$2M exit</b> if prices rise. The middle path is to mitigate.', nodes: ['avoid', 'accept'], warn: ['avoid', 'accept'] },
          { text: 'Mitigations: a <b>port</b> in the code so only one adapter imports the SDK, an open protocol where possible, data in an open format, a contract exit clause. Estimated exit cost drops to ~$300K (<em>estimate</em>).', flow: ['assess>mitig', 'mitig>port'], ok: ['port'], badges: { port: ['exit ≈ $300K', 'ok'] } },
          { text: 'The remaining lock-in is <b>accepted on purpose</b> and recorded in an ADR, with the trigger "renewal price +20% or SLA breached twice".', flow: ['mitig>resid', 'resid>mon'], ok: ['resid'], tone: 'ok' }
        ]
      },
      {
        id: 'scale', title: 'Scale: 200 risks and a red heat map', tone: 'warn',
        steps: [
          { text: 'After a year, the register has <b>200 entries</b>. Forty are red. Leadership stops reading it.', nodes: ['reg'], warn: ['reg'], badges: { reg: ['200 rows', 'warn'] }, tone: 'warn' },
          { text: 'The 5×5 matrix suffers <b>range compression</b>: a $300K risk and a $4M risk share a cell. Cox (2008) showed typical matrices rank most random pairs of hazards ambiguously.', flow: ['reg>assess'], warn: ['assess'], badges: { assess: ['same colour ≠ same risk', 'warn'] } },
          { text: 'Fix: sort by <b>expected loss</b>, show the top 10 with owners and trends, merge duplicates, close risks whose cause is gone. Keep the matrix only as a communication picture.', flow: ['assess>mitig', 'mitig>resid'], ok: ['assess'], labels: { assess: { label: 'Rank by $', sub: 'top 10 · trend' } } },
          { text: 'The monthly review now takes 30 minutes and focuses on triggers that moved.', flow: ['resid>mon', 'mon>reg'], ok: ['mon'], tone: 'ok', badges: { mon: ['top 10', 'ok'] } }
        ]
      },
      {
        id: 'deadline', title: 'Pressure: launch date vs risk appetite', tone: 'warn',
        steps: [
          { text: 'A launch is in 3 weeks. Load testing is not finished: a <b>30%</b> chance the service falls over on launch day, with a $500K revenue impact (<em>estimates</em>).', nodes: ['assess'], warn: ['assess'], badges: { assess: ['$150K', 'warn'] } },
          { text: 'That is above the $100K appetite. Options: <b>avoid</b> (slip the date), <b>mitigate</b> (feature flag + waitlist to cap traffic), or <b>accept</b> with sign-off.', flow: ['appetite>assess', ['assess>avoid', 'assess>mitig', 'assess>accept']] },
          { text: 'The team mitigates: a waitlist caps traffic at the tested load, cutting likelihood to ~5%. Residual ≈ $25K, inside appetite.', flow: ['assess>mitig', 'mitig>resid'], ok: ['mitig', 'resid'] },
          { text: 'The product owner signs the residual risk; the trigger is "p99 latency > 800 ms for 5 minutes": the waitlist closes automatically.', flow: ['resid>mon'], ok: ['mon'], tone: 'ok', badges: { mon: ['auto trigger', 'ok'] } }
        ]
      }
    ],

    knobs: {
      intro: 'Take one significant risk: a <b>critical third-party dependency</b> with a 20%/year chance of a $2M incident (illustrative). Choose how to respond, how much lock-in protection to build, and how often you review. The meters are an illustrative model, not a benchmark.',
      controls: [
        { id: 'resp', label: 'Response strategy', type: 'seg', value: 'mitigate', options: [
          { v: 'avoid', l: 'Avoid', hint: 'drop the dependency' }, { v: 'mitigate', l: 'Mitigate', hint: 'tests, staging, fallback' }, { v: 'transfer', l: 'Transfer', hint: 'insurance, SLA credits' }, { v: 'accept', l: 'Accept', hint: 'record + trigger' }] },
        { id: 'lock', label: 'Lock-in mitigation', type: 'seg', value: 'port', options: [
          { v: 'none', l: 'None', hint: 'SDK everywhere' }, { v: 'port', l: 'Abstraction layer', hint: 'port + adapter, exit plan' }, { v: 'multi', l: 'Multi-provider', hint: 'two live vendors' }] },
        { id: 'cad', label: 'Review cadence', type: 'seg', value: 'monthly', options: [
          { v: 'never', l: 'Set and forget' }, { v: 'quarterly', l: 'Quarterly' }, { v: 'monthly', l: 'Monthly + triggers' }] },
        { id: 'crit', label: 'How critical is the system?', type: 'seg', value: 'high', options: [
          { v: 'low', l: 'Internal tool' }, { v: 'high', l: 'Revenue-critical' }] }
      ],
      evaluate(s) {
        const clamp = (x) => Math.max(0.03, Math.min(1, x));
        const P = 0.2, I = s.crit === 'high' ? 2000 : 200;            // $K
        const respK = { avoid: { p: 0.15, i: 1, cost: 250, speed: 0.55, cx: 0.5 }, mitigate: { p: 0.35, i: 0.7, cost: 120, speed: 0.75, cx: 0.55 }, transfer: { p: 1, i: 0.5, cost: 60, speed: 0.95, cx: 0.25 }, accept: { p: 1, i: 1, cost: 0, speed: 1, cx: 0.1 } }[s.resp];
        const lockK = { none: { i: 1, cost: 0, speed: 1, cx: 0, exit: 2000 }, port: { i: 0.85, cost: 60, speed: 0.92, cx: 0.15, exit: 350 }, multi: { i: 0.45, cost: 400, speed: 0.7, cx: 0.4, exit: 80 } }[s.lock];
        const cadK = { never: { p: 1.4, cost: 0, d: 'months (found by customers)' }, quarterly: { p: 1.1, cost: 15, d: 'up to a quarter' }, monthly: { p: 1, cost: 40, d: 'days (triggers alert)' } }[s.cad];
        const avoidLock = s.resp === 'avoid';                       // no dependency, so lock-in spend is wasted
        const resid = P * respK.p * cadK.p * I * respK.i * (avoidLock ? 1 : lockK.i);
        const scale = s.crit === 'high' ? 1 : 0.25;
        const cost = (respK.cost + lockK.cost + cadK.cost) * scale;
        const speed = respK.speed * lockK.speed;
        const cx = Math.min(1, respK.cx + lockK.cx + (s.cad === 'monthly' ? 0.1 : 0));
        const exit = avoidLock ? 0 : lockK.exit * scale;
        const before = P * I;
        const appetite = s.crit === 'high' ? 100 : 30;
        const metrics = [
          { k: 'Residual expected loss', v: '$' + Math.round(resid) + 'K / yr', s: clamp(1 - resid / before), hint: 'from $' + Math.round(before) + 'K · appetite $' + appetite + 'K' },
          { k: 'Annual cost of response', v: '$' + Math.round(cost) + 'K', s: clamp(1 - cost / 600), hint: 'illustrative' },
          { k: 'Delivery speed', v: Math.round(speed * 100) + '% of baseline', s: clamp(speed) },
          { k: 'Complexity', v: cx < 0.25 ? 'low' : cx < 0.55 ? 'medium' : 'high', s: clamp(1 - cx) },
          { k: 'Exit cost (lock-in)', v: exit === 0 ? 'none (no vendor)' : '$' + Math.round(exit) + 'K', s: clamp(1 - exit / 2000) },
          { k: 'Time to notice drift', v: cadK.d, s: { never: 0.1, quarterly: 0.5, monthly: 0.9 }[s.cad] }
        ];
        const net = before - resid - cost;
        const notes = [];
        if (s.resp === 'transfer') notes.push('Insurance or SLA credits move <b>money</b>, not the outage: users still see it, and SLA credits rarely cover real losses. Likelihood is unchanged.');
        if (s.resp === 'accept') notes.push('Accepting is fine when it is <b>signed</b> by someone with authority, recorded, and has a trigger. "Accepted by default" is the anti-pattern.');
        if (s.resp === 'avoid') notes.push('Avoiding removes the risk and any lock-in, but you now build or run the capability yourself: new risks (key person, run cost) appear in the register.');
        if (s.lock === 'multi' && s.resp !== 'avoid') notes.push('Multi-provider protects against one vendor failing, but costs two integrations, the <b>lowest common denominator</b> of features and constant drift testing. Worth it for a few truly critical paths only.');
        if (s.lock === 'none' && s.resp !== 'avoid' && s.crit === 'high') notes.push('With the SDK spread through the code, leaving costs a rewrite. A port + adapter and a tested export usually cut exit cost by most of that for a small price.');
        if (s.cad === 'never') notes.push('Without reviews, likelihood drifts up unnoticed (new versions, new usage). The model adds +40% likelihood.');
        if (s.crit === 'low' && (s.lock === 'multi' || s.resp === 'avoid')) notes.push('For an internal tool this is <b>over-engineering</b>: the protection costs more than the risk.');
        let verdict;
        if (resid > appetite * 2) verdict = '❌ <b>Residual risk $' + Math.round(resid) + 'K/yr is far above appetite ($' + appetite + 'K).</b> Mitigate, avoid or get explicit executive sign-off.';
        else if (net < 0) verdict = '⚠ <b>Over-insured.</b> The response costs more than the loss it removes (net $' + Math.round(net) + 'K/yr). Choose something lighter.';
        else if (resid > appetite) verdict = '⚠ <b>Close to appetite.</b> Residual $' + Math.round(resid) + 'K/yr vs $' + appetite + 'K: add one more control or record a signed acceptance.';
        else if (s.cad === 'never') verdict = '👍 <b>Within appetite today</b>, but with no reviews you will not know when that stops being true.';
        else verdict = '✅ <b>Risk you chose.</b> Residual $' + Math.round(resid) + 'K/yr within appetite, net benefit $' + Math.round(net) + 'K/yr. Record owner, trigger and exit plan.';
        const node = { avoid: 'avoid', mitigate: 'mitig', transfer: 'transfer', accept: 'accept' }[s.resp];
        const flow = ['reg>assess', 'assess>' + node].concat(s.resp === 'mitigate' && s.lock !== 'none' ? ['mitig>port'] : []).concat(s.resp === 'avoid' ? [] : [node + '>resid', 'resid>mon']).concat(s.cad === 'never' ? [] : ['mon>reg']);
        const tone = verdict[0] === '✅' ? 'ok' : verdict[0] === '❌' ? 'err' : 'warn';
        return {
          metrics, verdict, notes, flow,
          labels: {
            port: { label: s.lock === 'multi' ? 'Two providers' : s.lock === 'port' ? 'Port + exit plan' : 'SDK everywhere', sub: 'exit ≈ $' + Math.round(exit) + 'K' },
            mon: { label: 'Triggers + review', sub: { never: 'none', quarterly: 'quarterly', monthly: 'monthly · on event' }[s.cad] },
            resid: { label: 'Residual risk', sub: '$' + Math.round(resid) + 'K / yr' }
          },
          hot: [node], ok: tone === 'ok' ? ['resid'] : [], warn: tone === 'warn' ? ['resid'] : [], err: tone === 'err' ? ['resid'] : [].concat(s.cad === 'never' ? ['mon'] : []),
          badges: { [node]: ['chosen', 'info'], resid: [resid <= appetite ? '≤ appetite' : '> appetite', tone] }
        };
      }
    },

    widget: {
      title: '5×5 risk heat map with live mitigations',
      caption: 'Eight sample risks for a payments platform, placed by likelihood (rows) and impact (columns). Select a risk and apply a response: <b>Mitigate</b> moves it down or left, <b>Transfer</b> lowers the impact you carry, <b>Avoid</b> removes it. Totals show expected loss before and after, and what the mitigations cost. Filter by category. Notice risks in the same cell with very different expected loss: that is the matrix\'s blind spot.'
    },

    realWorld: {
      intro: 'The methods come from standards bodies, the SEI and decision researchers. The incidents show the three classic unmanaged risks: a trusted vendor, a tiny dependency and a ubiquitous library.',
      timeline: [
        { when: '2000', who: 'SEI (Kazman, Klein, Clements)', title: 'ATAM names architecture risks', text: 'The Architecture Tradeoff Analysis Method evaluates an architecture against quality-attribute scenarios and outputs <b>risks, non-risks, sensitivity points and trade-off points</b>. Risks are decisions that might cause problems for a quality attribute.', src: 3 },
        { when: 'Sep 2007', who: 'Gary Klein (HBR)', title: 'Performing a Project Premortem', text: 'Klein proposes the pre-mortem: tell the team the project has failed and ask each person to write down why. He cites research that <b>prospective hindsight</b> raised the ability to identify reasons for future outcomes by 30%, and notes it gives people permission to voice doubts.', src: 0 },
        { when: '2008', who: 'Louis Anthony (Tony) Cox Jr.', title: 'What\'s Wrong with Risk Matrices?', text: 'In <i>Risk Analysis</i> 28(2), Cox shows typical matrices can unambiguously compare only a small fraction (e.g. <b>under 10%</b>) of random hazard pairs, can rate quantitatively smaller risks higher, and compress very different risks into one cell. Use with caution and explain the judgments.', src: 2 },
        { when: 'Mar 2016', who: 'npm', title: 'left-pad unpublished', text: 'After a naming dispute, a maintainer unpublished his packages, including the 11-line <b>left-pad</b>. From 22 March builds across the ecosystem failed; npm restored the package and later changed its unpublish policy. A transitive dependency nobody listed was a single point of failure.', src: 4 },
        { when: '2016', who: 'Simon Brown', title: 'Risk storming', text: 'In <i>Software Architecture for Developers</i>, Brown describes <b>risk storming</b>: draw the architecture diagrams, have everyone place risk sticky notes on them independently, then converge and prioritise. Different perspectives find the non-obvious risks.', src: 5 },
        { when: 'Feb 2018', who: 'ISO', title: 'ISO 31000:2018', text: 'The revised standard defines risk as the <b>"effect of uncertainty on objectives"</b>, covering both threats and opportunities, and is a set of guidelines, not a certifiable requirement.', src: 1 },
        { when: 'Dec 2021', who: 'Apache Log4j · CISA', title: 'Log4Shell (CVE-2021-44228)', text: 'A remote code execution flaw in Log4j 2.0-beta9 to 2.14.1 via JNDI lookups. CISA issued Emergency Directive 22-02. Teams with a dependency inventory (SBOM) found affected systems in hours; others searched for weeks.', src: 6 },
        { when: 'Aug 2023', who: 'HashiCorp', title: 'Licence change as lock-in risk', text: 'Terraform and other products moved from MPL 2.0 to the Business Source License for future releases: a reminder that open source carries <b>contractual</b> lock-in risk too.', src: 9 },
        { when: 'Jul 2024', who: 'CrowdStrike', title: 'Channel File 291 outage', text: 'A faulty Falcon content update caused an out-of-bounds read in the Windows sensor and crashed hosts worldwide on 19 July; it was reverted 78 minutes later, but crashed machines needed manual recovery. The preliminary review committed to <b>staggered deployment</b> and customer control over content updates.', src: 7 },
        { when: 'Aug 2024', who: 'CrowdStrike', title: 'Root cause analysis', text: 'The RCA explains a mismatch between 21 input fields defined and 20 supplied, missed by validation. Fixes included bounds checking and input-field count validation. For buyers, the lesson is to treat kernel-level vendors as top-tier risks.', src: 8 }
      ],
      lessons: [
        'Most damaging risks were <b>known in principle</b> but never written down with an owner: vendor updates, transitive dependencies, ubiquitous libraries.',
        'Matrices are for <b>communication</b>; rank with numbers (expected loss plus worst case) and keep the reasoning.',
        'Pre-mortems and risk storming work because they make it <b>safe to say</b> what could go wrong, before commitment.',
        'Lock-in is not only APIs: <b>data, contracts, licences and skills</b> lock you in too. Price the exit and test it.'
      ],
      sources: [
        { title: 'Performing a Project Premortem', url: 'https://hbr.org/2007/09/performing-a-project-premortem', pub: 'Gary Klein, Harvard Business Review, Sep 2007' },
        { title: 'The new ISO 31000 keeps risk management simple', url: 'https://www.iso.org/news/ref2263.html', pub: 'ISO, Feb 2018' },
        { title: 'What\'s Wrong with Risk Matrices?', url: 'https://econpapers.repec.org/RePEc:wly:riskan:v:28:y:2008:i:2:p:497-512', pub: 'L. A. Cox, Risk Analysis 28(2), 2008' },
        { title: 'Architecture tradeoff analysis method', url: 'https://en.wikipedia.org/wiki/Architecture_tradeoff_analysis_method', pub: 'Overview of SEI ATAM (CMU/SEI-2000-TR-004)' },
        { title: 'kik, left-pad, and npm', url: 'https://blog.npmjs.org/post/141577284765/kik-left-pad-and-npm.html', pub: 'npm blog, Mar 2016' },
        { title: 'Risk storming', url: 'https://icepanel.io/blog/risk-storming', pub: 'IcePanel (on Simon Brown\'s technique)' },
        { title: 'Apache Log4j Vulnerability Guidance', url: 'https://cisa.gov/uscert/apache-log4j-vulnerability-guidance', pub: 'CISA, Dec 2021' },
        { title: 'Falcon Content Update: Preliminary Post Incident Report', url: 'https://www.crowdstrike.com/en-us/blog/falcon-content-update-preliminary-post-incident-report/', pub: 'CrowdStrike, Jul 2024' },
        { title: 'Executive Summary: Root Cause Analysis, Channel File 291', url: 'https://crowdstrike.com/wp-content/uploads/2024/08/Executive-Summary_Root-Cause-Analysis_Channel-File-291.pdf', pub: 'CrowdStrike, Aug 2024' },
        { title: 'HashiCorp adopts the Business Source License', url: 'https://www.hashicorp.com/blog/hashicorp-adopts-business-source-license', pub: 'HashiCorp, Aug 2023' }
      ]
    },

    tradeoffs: {
      headers: ['Response', 'What it does', 'You pay', 'Use when…'],
      rows: [
        ['<b>Avoid</b>', 'Removes the cause: no dependency, no feature, different design', 'Lost capability or speed; new risks from the alternative', 'Impact is unacceptable and an alternative exists'],
        ['<b>Mitigate / reduce</b>', 'Lowers likelihood (tests, staged rollout) or impact (redundancy, fallback, smaller blast radius)', 'Engineering time, run cost, complexity', 'Expected loss avoided exceeds the cost, the usual case'],
        ['<b>Transfer</b>', 'Moves financial impact to an insurer or supplier (cyber insurance, SLA credits, indemnity)', 'Premiums; you still own reputation and user harm', 'Rare, high-cost events with a quantifiable loss'],
        ['<b>Accept</b>', 'Carries the risk knowingly, with a trigger and a budget for the bad day', 'The residual expected loss', 'Low expected loss, or mitigation costs more than it saves'],
        ['<b>Exploit</b> (opportunity)', 'Makes a positive risk more likely: e.g. a vendor price drop, a new open standard', 'Flexibility you must keep in the design', 'ISO 31000 counts upside uncertainty as risk too']
      ]
    },
    failures: [
      { f: 'Register theatre', detect: 'Last review date months old; no risk closed or re-scored after incidents', fix: 'Top 10 in the monthly ops review; incident postmortems must update the register; delete stale rows.' },
      { f: 'Heat-map ranking errors', detect: 'Very different dollar exposures share a colour; debates about cell boundaries', fix: 'Store numbers; rank by expected loss and worst case; keep the matrix only as a summary picture.' },
      { f: 'Accepted by default', detect: 'Risks with no response or no owner; "we knew about that" after an incident', fix: 'Acceptance requires a named approver, a recorded rationale and a trigger, ideally in an ADR.' },
      { f: 'Vendor blast radius', detect: 'Third-party updates reach 100% of hosts at once; vendor has kernel or admin access', fix: 'Demand staged rollout and update controls in contracts; canary groups; documented manual recovery.' },
      { f: 'Invisible transitive dependency', detect: 'Cannot answer "where do we use X?" quickly; no SBOM', fix: 'SBOM per build, pinned versions, internal mirror/proxy registry, dependency scanning in CI.' },
      { f: 'Bus factor of one', detect: 'Only one person merges to or is paged for a system; stalled work when they are away', fix: 'Pairing, rotation on call, runbooks, a second owner in the register.' },
      { f: 'Lock-in discovered at renewal', detect: 'No export ever tested; vendor SDK types throughout domain code', fix: 'Port + adapter, open formats, exit clause, yearly export drill, exit cost in the register.' }
    ],

    interview: [
      { q: 'What goes in a risk register, and what makes one useful rather than theatre?', a: '<p>Per risk: ID, description as <b>cause → event → effect</b>, category, likelihood, impact, <b>owner</b>, response, mitigation actions, <b>trigger</b>, residual rating, status and review date.</p><p>Useful means: numbers not just colours, one named owner, triggers tied to real signals, a short top-10 reviewed monthly, and updates after every incident. If nothing in it changed in three months, it is theatre.</p>', lvl: 'core' },
      { q: 'Explain the four risk responses with a software example of each.', a: '<ul><li><b>Avoid</b>: do not store card numbers at all; use a tokenising payment provider.</li><li><b>Mitigate</b>: staged rollout and automatic rollback to cut the likelihood and blast radius of a bad deploy.</li><li><b>Transfer</b>: cyber insurance or contractual indemnity for a breach.</li><li><b>Accept</b>: a single-region internal tool, signed off, with a trigger to revisit.</li></ul><p>For opportunities, the mirror responses are exploit, enhance, share and accept.</p>', fu: 'Does transferring a risk to a cloud provider via an SLA remove it? (No: credits are small and users still see the outage.)', lvl: 'core' },
      { q: 'What is wrong with a 5×5 likelihood × impact matrix?', a: '<p>Cox (2008) showed matrices have <b>poor resolution</b> (they rank few random pairs unambiguously), <b>range compression</b> (very different risks share a cell), can rank a smaller risk higher, and depend on subjective category boundaries. Multiplying ordinal scores (3 × 4 = 12) is not real arithmetic.</p><p>Use it to communicate, but rank by <b>expected loss</b> with ranges, and look separately at catastrophic tails.</p>', lvl: 'deep' },
      { q: 'How would you run a pre-mortem?', a: '<ol><li>Brief the plan.</li><li>Say: "It is a year from now. The project has failed badly."</li><li>Everyone writes reasons alone for a few minutes (prevents anchoring on the boss).</li><li>Go round the room, one reason each, until exhausted.</li><li>Cluster, then turn the top themes into register entries with owners and triggers.</li></ol><p>Klein (HBR, 2007) argues prospective hindsight surfaces more causes and makes dissent safe.</p>', lvl: 'core' },
      { q: 'What is risk storming, and how does it differ from ATAM?', a: '<p><b>Risk storming</b> (Simon Brown) is a light, visual workshop: put up C4 diagrams, everyone places risk notes on them independently, then converge and prioritise. It takes an hour or two.</p><p><b>ATAM</b> (SEI, 2000) is a structured evaluation driven by prioritised quality-attribute scenarios, producing <b>risks, non-risks, sensitivity points and trade-off points</b>. It takes days and stakeholders. Use storming often, ATAM for big, costly decisions.</p>', lvl: 'deep' },
      { q: 'What kinds of vendor lock-in are there, and how do you mitigate each?', a: '<ul><li><b>Data</b>: proprietary formats, no bulk export → open formats, export drills.</li><li><b>API</b>: SDK calls throughout the code → <b>port and adapter</b>, open standards (SQL, OIDC, OpenTelemetry, S3-compatible APIs).</li><li><b>Contractual</b>: multi-year commits, no exit assistance → exit clauses, price caps, notice periods.</li><li><b>Skills</b>: team only knows one vendor\'s tooling → general skills, documented runbooks.</li></ul><p>Aim for a <b>known, affordable exit cost</b>, not zero lock-in.</p>', lvl: 'core' },
      { q: 'Should we go multi-cloud to avoid lock-in?', a: '<p>Usually not for everything. Multi-cloud active-active costs two integrations, the <b>lowest common denominator</b> of features, more complex operations and skills split two ways. It protects against provider failure or a hostile renewal.</p><p>Do it for a few truly critical paths or where regulation demands it. Elsewhere use portable building blocks (containers, Postgres, Terraform/OpenTofu), a port in the code, and a tested exit plan.</p>', lvl: 'core' },
      { q: 'What lessons does the CrowdStrike outage of July 2024 hold for an architect?', a: '<p>A trusted security vendor\'s content update crashed Windows hosts globally. Lessons: list <b>vendors with privileged access</b> as top-tier risks; require <b>staged rollout</b> and update controls in contracts; have a canary group; plan manual recovery (where are BitLocker keys?); and check whether your redundancy shares the same agent, since all replicas crashed together.</p>', lvl: 'deep' },
      { q: 'How do you decide whether a mitigation is worth it?', a: '<p>Compare <b>loss avoided</b> (expected loss before − after) with its cost per year: ROI = (avoided − cost) ÷ cost. Then check two things the mean hides: the <b>worst case</b> against risk appetite, and side effects on delivery speed and complexity.</p><p>Example: 20% × $2M = $400K/yr; a $120K control that is 70% effective avoids $280K, ROI ≈ 133%.</p>', lvl: 'core' },
      { q: 'Tell me about a time you raised a risk others did not want to hear. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a launch depended on one engineer who understood the billing reconciliation, and on a vendor with no data export. <b>Task</b>: as architect I had to raise it without stopping the launch.</p><p><b>Action</b>: I ran a 30-minute pre-mortem with the team; both risks came up independently. I put them in the register with dollar estimates and proposed two cheap mitigations: pairing for six weeks and an export clause before signing.</p><p><b>Result</b>: the product owner accepted both; the launch slipped by zero days, and when the engineer left four months later, two others could run reconciliation.</p>', lvl: 'core' },
      { q: 'Tell me about a risk you accepted on purpose. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: an internal reporting service ran in one region. <b>Task</b>: decide whether to make it multi-region.</p><p><b>Action</b>: I estimated a 5% yearly chance of a day-long regional outage costing about $20K in delayed reports, against ~$150K/yr for multi-region. I wrote an ADR accepting the risk, signed by the head of finance, with a trigger: "revisit if reports become customer-facing".</p><p><b>Result</b>: we saved the spend; a year later the trigger fired when reports went to customers, and we made it multi-region with the ADR as the starting point.</p>', lvl: 'core' },
      { q: 'How do you present risks to executives?', a: '<p>Short and decision-focused: the <b>top 5</b> by expected loss, each with owner, trend and the decision needed. Translate into business terms (revenue, customers, regulatory exposure). Compare residual risk with the agreed <b>appetite</b>, and ask clearly: fund this mitigation, or sign this acceptance. Keep the full register in an appendix.</p>', lvl: 'core' }
    ],

    code: [
      {
        title: 'Postgres: risk register with expected loss and a priority query', lang: 'sql',
        code: `CREATE TYPE risk_response AS ENUM ('avoid','mitigate','transfer','accept','exploit');

CREATE TABLE risk (
  risk_id        text PRIMARY KEY,                 -- e.g. 'R-014'
  title          text NOT NULL,                    -- cause -> event -> effect
  category       text NOT NULL CHECK (category IN
                   ('technical','operational','security','vendor','key_person','compliance','delivery')),
  likelihood_pct numeric(5,2) NOT NULL CHECK (likelihood_pct BETWEEN 0 AND 100),
  impact_usd     numeric(14,2) NOT NULL CHECK (impact_usd >= 0),
  mitigation_eff numeric(5,2) NOT NULL DEFAULT 0 CHECK (mitigation_eff BETWEEN 0 AND 100),
  owner          text NOT NULL,
  response       risk_response,
  trigger        text,
  status         text NOT NULL DEFAULT 'open',
  review_due     date NOT NULL,
  expected_loss  numeric GENERATED ALWAYS AS (likelihood_pct / 100 * impact_usd) STORED,
  residual_loss  numeric GENERATED ALWAYS AS
                   (likelihood_pct / 100 * impact_usd * (1 - mitigation_eff / 100)) STORED
);
CREATE INDEX risk_open_idx ON risk (residual_loss DESC) WHERE status <> 'closed';

-- Top risks: above appetite, missing a decision, or overdue for review
SELECT risk_id, title, owner, category,
       round(expected_loss) AS el_usd, round(residual_loss) AS residual_usd,
       width_bucket(likelihood_pct, ARRAY[5,20,50,80])          -- 0..4
         + 1 AS l_score,
       width_bucket(impact_usd, ARRAY[50e3,250e3,1e6,5e6]) + 1 AS i_score,
       (residual_loss > 100000) AS above_appetite,
       (response IS NULL OR trigger IS NULL) AS undecided,
       (review_due < current_date) AS overdue
FROM risk
WHERE status <> 'closed'
ORDER BY above_appetite DESC, residual_loss DESC, undecided DESC
LIMIT 10;`,
        note: 'Generated columns keep expected and residual loss consistent with the inputs. <code>width_bucket</code> with an array gives the 5×5 score for the picture, but the ordering uses dollars.'
      },
      {
        title: 'Python: Monte Carlo of annual risk exposure', lang: 'python',
        code: `# Simulate a year of a risk portfolio: frequency (Poisson) x severity (lognormal).
# Python 3.11+, standard library only.
import math, random, statistics
from dataclasses import dataclass

@dataclass
class Risk:
    name: str
    rate: float      # expected events per year (≈ likelihood for rare events)
    median: float    # median loss per event, $
    p90: float       # 90th percentile loss per event, $

    def sample_loss(self, rng: random.Random) -> float:
        sigma = math.log(self.p90 / self.median) / 1.2816   # z(0.9)
        n, t = 0, rng.expovariate(self.rate)                # Poisson via arrivals
        while t < 1.0:
            n += 1
            t += rng.expovariate(self.rate)
        return sum(rng.lognormvariate(math.log(self.median), sigma) for _ in range(n))

def simulate(risks: list[Risk], years=20_000, seed=7) -> list[float]:
    rng = random.Random(seed)
    return [sum(r.sample_loss(rng) for r in risks) for _ in range(years)]

portfolio = [
    Risk("vendor bad update", 0.20, 800_000, 3_000_000),
    Risk("critical OSS CVE",  0.50, 150_000,   600_000),
    Risk("key person leaves", 0.30, 120_000,   400_000),
    Risk("region outage",     0.10, 400_000, 2_000_000),
]
losses = sorted(simulate(portfolio))
q = lambda p: losses[int(p * (len(losses) - 1))]
print(f"mean annual loss : \${statistics.fmean(losses):,.0f}")
print(f"P90 / P99 year   : \${q(0.90):,.0f} / \${q(0.99):,.0f}")
print(f"P(loss > $1M)    : {sum(l > 1e6 for l in losses) / len(losses):.1%}")`,
        note: 'The mean matches the sum of expected losses; the <b>P99 year</b> is what to compare with risk appetite. Re-run with a mitigation (lower <code>rate</code> or <code>p90</code>) to see how much tail it removes, not just the mean.'
      },
      {
        title: 'Java 21 / Spring Boot 3: a port that caps vendor lock-in', lang: 'java',
        code: `// Domain code depends on this port only. No vendor types leak past the adapter.
public interface PaymentGateway {
  ChargeResult charge(ChargeRequest req);
  Stream<StoredToken> exportTokens();          // the exit plan, as an API
}
public record ChargeRequest(String customerRef, long amountMinor, String currency, String idemKey) {}
public record ChargeResult(String providerRef, boolean approved, String declineCode) {}
public record StoredToken(String customerRef, String networkToken) {}

@Component
@ConditionalOnProperty(name = "payments.provider", havingValue = "acmepay")
class AcmePayGateway implements PaymentGateway {
  private final AcmePayClient client;          // vendor SDK lives only here
  AcmePayGateway(AcmePayClient client) { this.client = client; }

  public ChargeResult charge(ChargeRequest r) {
    var resp = client.charges().create(r.customerRef(), r.amountMinor(), r.currency(), r.idemKey());
    return new ChargeResult(resp.id(), resp.status() == AcmeStatus.SUCCEEDED, resp.declineCode());
  }
  public Stream<StoredToken> exportTokens() {
    return client.vault().bulkExport().stream()
        .map(t -> new StoredToken(t.customer(), t.networkToken()));
  }
}

// A contract test runs against every adapter, so a second provider is a drop-in.
abstract class PaymentGatewayContractTest {
  protected abstract PaymentGateway gateway();
  @Test void declinedCardIsNotApproved() {
    var res = gateway().charge(new ChargeRequest("c-1", 1000, "EUR", UUID.randomUUID().toString()));
    assertThat(res.approved()).isFalse();      // sandbox card that always declines
  }
}`,
        note: '<code>AcmePayClient</code> stands for any vendor SDK. The port turns API lock-in into one class; <code>exportTokens</code> forces the data-portability question during vendor selection, not at exit time.'
      }
    ],

    related: ['build-vs-buy', 'threat-modeling', 'quality-attributes', 'disaster-recovery', 'stakeholder-communication', 'architecture-governance']
  });
})();
