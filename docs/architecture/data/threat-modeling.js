SD.register({
  slug: 'threat-modeling',
  domain: 7,
  title: 'Threat Modeling',
  examples: 'STRIDE, OWASP, attack trees',
  tagline: 'Draw what you are building, mark where <b>trust changes</b>, ask <b>what can go wrong</b> at every element, and turn the answers into <b>tracked mitigations</b> before the code ships.',
  tldr: {
    problem: 'Most serious security bugs are design bugs: a missing authorisation check, a trusted webhook nobody verifies, an admin path straight to the database. Scanners and pen tests find them late, when the fix means rework.',
    idea: 'Model the system as a <b>data-flow diagram</b> (external entities, processes, data stores, data flows) with <b>trust boundaries</b>. Walk each element with <b>STRIDE</b> (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege), score what you find, and put each threat with its <b>mitigation</b> in the backlog.',
    insight: 'Threat modeling is <b>Shostack\'s four questions</b>, not a tool: what are we working on, what can go wrong, what are we going to do about it, did we do a good enough job? Say "lightweight, per feature, owned by the developers with a security champion, focused on flows that cross trust boundaries, and kept in the repo next to the code".',
    numbers: [
      { v: '4 questions', l: 'Shostack\'s framework, adopted by the Threat Modeling Manifesto (2020)' },
      { v: '6 letters', l: 'STRIDE, Kohnfelder &amp; Garg, Microsoft, Apr 1999' },
      { v: '2–4 h', l: 'a per-feature session for a small change (<em>rule of thumb</em>)' }
    ]
  },

  intro: {
    what: 'Threat modeling is a structured way to <b>find how a design can be attacked before you build it</b>. You draw how data moves through the system, mark where it crosses from less-trusted to more-trusted parts, and systematically ask what an attacker could do at each place. The output is a list of threats, each with a decision: fix, mitigate, accept or transfer.',
    analogy: {
      icon: '🏠',
      title: 'Walking a house plan with a burglar\'s eyes',
      text: 'Before building a house you look at the <b>floor plan</b> (the data-flow diagram) and ask: where are the doors and windows (entry points), which doors lead from the street into private rooms (trust boundaries), where are the valuables kept (data stores)? For each door you ask the same checklist: can someone fake a key, break the lock, sneak out unseen? Then you decide on locks, alarms and safes. The analogy breaks in one way: software doors change every sprint, so the walk-through has to be repeated, not done once.'
    },
    problem: 'A team ships a checkout service. It accepts payment-provider webhooks to mark orders as paid, and nobody asked who else could call that URL. Six months later an attacker posts fake "payment succeeded" webhooks and walks off with goods. No scanner flagged it, because the code did exactly what it was designed to do. <b>How do you find flaws in the design itself, early, while they are cheap to fix?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Security review at the end',
        text: 'The team designs and builds the feature, then asks the security team for a <b>pen test</b> the week before launch. It feels efficient: experts look at the real thing.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Dev team', sub: 'design + build', kind: 'team', at: [70, 0] },
            { id: 'app', label: 'Checkout', sub: 'shipped code', kind: 'service', at: [210, 110] },
            { id: 'sec', label: 'Pen test', sub: 'week before go-live', kind: 'person', at: [350, 220] }
          ],
          edges: [{ from: 'dev', to: 'app' }, { from: 'app', to: 'sec' }],
          flow: ['dev>app', 'app>sec']
        }
      },
      {
        stage: 'breaks',
        title: 'Design flaws found too late, or never',
        text: 'The pen test finds the unauthenticated webhook, but fixing it needs signature keys, a new contract with the provider and a schema change. Launch slips, or the risk is "accepted" in a hurry. Flaws outside the tester\'s time box are never found.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Dev team', sub: 'rework', kind: 'team', at: [70, 0] },
            { id: 'app', label: 'Checkout', sub: 'webhook open', kind: 'service', at: [210, 110] },
            { id: 'sec', label: 'Pen test', sub: '3-day time box', kind: 'person', at: [350, 220] },
            { id: 'atk', label: 'Attacker', sub: 'fake "paid"', kind: 'external', at: [70, 220] }
          ],
          edges: [{ from: 'dev', to: 'app' }, { from: 'app', to: 'sec' }, { from: 'atk', to: 'app' }],
          flow: ['atk>app', 'app>sec'],
          err: ['app'],
          warn: ['dev'],
          badges: { app: ['spoofed webhook', 'err'], dev: ['launch slips', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Model the design, per feature',
        text: 'Before coding, the team draws the <b>data-flow diagram</b>, sees the webhook crosses a <b>trust boundary</b>, and asks STRIDE questions. "Spoofing: who can send this?" leads to signed webhooks in the design. The pen test later confirms rather than discovers.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Dev team', sub: '+ champion', kind: 'team', at: [70, 0] },
            { id: 'tm', label: 'Threat model', sub: 'DFD + STRIDE', kind: 'policy', at: [350, 0] },
            { id: 'app', label: 'Checkout', sub: 'HMAC webhooks', kind: 'service', at: [210, 110] },
            { id: 'sec', label: 'Pen test', sub: 'confirms', kind: 'person', at: [350, 220] }
          ],
          edges: [{ from: 'dev', to: 'tm' }, { from: 'tm', to: 'app' }, { from: 'app', to: 'sec' }],
          flow: ['dev>tm', 'tm>app', 'app>sec'],
          ok: ['app', 'tm'],
          badges: { app: ['spoofing mitigated', 'ok'] }
        }
      }
    ],
    usedBy: ['Microsoft Security Development Lifecycle (SDL)', 'OWASP (Threat Dragon, pytm, Threat Modeling Cheat Sheet)', 'NIST SSDF (SP 800-218) design practices', 'AWS and Azure well-architected security guidance', 'PCI DSS and medical-device (FDA) security submissions'],
    whenToUse: [
      'A new feature adds a data flow that crosses a trust boundary (new API, webhook, third party, admin path)',
      'The system handles money, personal data, credentials or safety-relevant actions',
      'A design review or ADR is about to fix the shape of something hard to change later'
    ],
    whenNot: [
      'Pure refactors and copy changes with no new flows: a checklist question in the PR template is enough',
      'Finding bugs in existing code: use SAST, dependency scanning and tests (see <a href="devsecops.html">DevSecOps &amp; Supply Chain</a>)',
      'Deciding network-level trust between workloads: that is <a href="zero-trust.html">Zero Trust Architecture</a>, which a threat model then checks'
    ],
    glossary: [
      { term: 'DFD', def: 'Data-flow diagram: external entities, processes, data stores and the data flows between them.' },
      { term: 'Trust boundary', def: 'A line where the level of trust changes, for example internet to your API, or your service to a third party.' },
      { term: 'STRIDE', def: 'Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege: six threat categories.' },
      { term: 'Attack tree', def: 'A tree with an attacker goal at the root and alternative (OR) or combined (AND) ways to reach it below.' },
      { term: 'Mitigation', def: 'A control that removes or reduces a threat, such as authentication, signing, encryption or rate limiting.' },
      { term: 'Residual risk', def: 'The risk that remains after mitigations, which someone with authority must accept explicitly.' },
      { term: 'Security champion', def: 'A developer in the team trained to lead threat-model sessions and pull in security experts when needed.' },
      { term: 'CVSS', def: 'Common Vulnerability Scoring System from FIRST: a 0–10 severity score for vulnerabilities; v4.0 since Nov 2023.' }
    ]
  },

  requirements: {
    functional: [
      'Answer the <b>four questions</b> every time: what are we working on, what can go wrong, what will we do about it, did we do a good enough job',
      'Start from a <b>DFD with trust boundaries</b>; every flow that crosses one gets explicit attention',
      'Enumerate systematically: <b>STRIDE per element</b> (or per interaction), attack trees for high-value goals, LINDDUN for personal data',
      'Every threat ends with a <b>decision</b>: mitigate, eliminate, transfer or accept, with an owner and a ticket',
      'Prioritise with a <b>consistent bar</b> (CVSS-style severity or a bug bar), not gut feeling in the room',
      'Keep the model <b>alive</b>: in the repo or ADR, updated when flows change, checked when incidents happen'
    ],
    nonFunctional: [
      '<b>Coverage</b>: 100% of boundary-crossing flows reviewed for each feature that adds or changes one',
      '<b>Effort</b>: a per-feature session fits in <b>2–4 hours</b> (<em>rule of thumb</em>)',
      '<b>Closure</b>: high-severity threats mitigated before release; the rest tracked with due dates',
      '<b>Ownership</b>: developers lead most models; security reviews, not writes, them',
      '<b>Traceability</b>: threat → mitigation → test or control → evidence (useful for audits)',
      '<b>Freshness</b>: model reviewed at least once per release, or flagged stale (<em>rule of thumb</em>)'
    ],
    outOfScope: [
      '<b>Shelfware</b>: a 60-page model written once for an audit and never opened again',
      '<b>Admiring the problem</b>: long threat lists with no decisions or owners',
      '<b>Tool-first</b>: arguing about notation or tools instead of asking what can go wrong',
      '<b>Security-team-only</b> models that the people building the system never see',
      '<b>Scoring theatre</b>: decimal DREAD scores debated for an hour'
    ]
  },

  calculator: {
    inputs: [
      { id: 'el', label: 'DFD elements (entities, processes, stores, flows)', min: 4, max: 120, value: 24 },
      { id: 'tpe', label: 'Threats per element (STRIDE rule of thumb)', min: 1, max: 6, value: 2.5, step: 0.5 },
      { id: 'cross', label: 'Share of elements on a trust boundary', min: 0, max: 100, value: 40, unit: '%' },
      { id: 'mins', label: 'Review time per threat', min: 2, max: 45, value: 10, unit: 'min' },
      { id: 'people', label: 'People in the session', min: 1, max: 10, value: 4 },
      { id: 'mit', label: 'Mitigations implemented', min: 0, max: 100, value: 70, unit: '%' }
    ],
    outputs: [
      { label: 'Threats identified', f: (v) => Math.round(v.el * v.tpe) },
      { label: 'Of which on boundary-crossing elements', f: (v) => Math.round(v.el * v.tpe * v.cross / 100) },
      { label: 'Session length (wall clock)', fmt: 'raw', f: (v) => { const h = v.el * v.tpe * v.mins / 60; return h.toFixed(1) + ' h' + (h > 4 ? ' (split it)' : ''); } },
      { label: 'Review effort (person-hours)', fmt: 'raw', f: (v) => (v.el * v.tpe * v.mins / 60 * v.people).toFixed(1) + ' p-h' },
      { label: 'Residual open threats', f: (v) => Math.round(v.el * v.tpe * (1 - v.mit / 100)) },
      { label: 'Open threats on trust boundaries (fix first)', f: (v) => Math.round(v.el * v.tpe * v.cross / 100 * (1 - v.mit / 100)) }
    ],
    note: 'Threats ≈ elements × threats per element. STRIDE-per-element gives at most 2 categories for an external entity, 6 for a process, 4 for a store and 3 for a flow, and many do not apply, so <b>2–3 real threats per element</b> is a <em>rule of thumb</em>, not a law. The model shows why big systems are modelled <b>per feature</b>: 24 elements already take a 4-person team a working day. Spend the time on <b>boundary-crossing</b> elements first; that is where most real threats live.'
  },

  api: [
    { m: 'DOC', p: 'Threat model (per feature)', d: 'Scope and assumptions, the DFD with trust boundaries, the threat table (STRIDE category, element, scenario, severity, decision, ticket), and open questions. One page per feature is enough.' },
    { m: 'ADR', p: 'ADR "Security considerations"', d: 'Each architecture decision record gets a section: which flows it adds, which boundaries they cross, top threats and chosen mitigations, accepted residual risk and who accepted it.' },
    { m: 'YAML', p: 'threats/*.yaml', d: 'Machine-readable threat entries next to the code (template below). CI can fail the build when a high-severity threat has no mitigation or test reference.' },
    { m: 'RFC', p: 'tm.py (pytm model)', d: 'Threat model as code: elements, boundaries and flows in Python. Generates the DFD (Graphviz), a sequence diagram and a findings report; diffed in pull requests.' },
    { m: 'POLICY', p: 'Bug bar / severity policy', d: 'How findings are rated (for example CVSS v4.0 base plus environmental, or a fixed bug bar), and the SLA per severity: critical before release, high in 30 days.' },
    { m: 'DOC', p: 'Risk acceptance record', d: 'Threat, why it is not mitigated now, compensating controls, expiry date, and the name of the business owner who accepts it. Feeds the risk register.' }
  ],
  dataModel: [
    { name: 'threat', store: 'Repo YAML / tracker', fields: [['id', 'TM-ORD-012', 'pk'], ['model_id', 'feature model', 'fk'], ['element', 'flow or node id', 'idx'], ['stride', 'S|T|R|I|D|E', 'idx'], ['scenario', 'text'], ['severity', 'crit|high|med|low'], ['status', 'open|mitigated|accepted', 'idx']], note: 'One row per threat. Severity comes from the bug bar, not from a debate.' },
    { name: 'mitigation', store: 'Repo YAML / tracker', fields: [['id', 'MIT-031', 'pk'], ['threat_id', 'TM-ORD-012', 'fk'], ['control', 'HMAC webhook signature'], ['ticket', 'JIRA-4411'], ['verified_by', 'test id / pentest'], ['done_at', 'date']], note: 'A mitigation is only "done" with evidence: a test, a config check or a pen-test result.' },
    { name: 'dfd_element', store: 'pytm / Threat Dragon file', fields: [['id', 'order-svc', 'pk'], ['type', 'entity|process|store|flow'], ['boundary', 'internal', 'idx'], ['data_class', 'PII | card | public'], ['crosses_boundary', 'bool (flows)']], note: 'The type decides which STRIDE categories apply.' },
    { name: 'risk_acceptance', store: 'Risk register', fields: [['threat_id', 'TM-ORD-019', 'pk'], ['owner', 'VP Payments'], ['reason', 'text'], ['compensating', 'text'], ['expires', 'date', 'idx']], note: 'Acceptances expire; the model is revisited when they do.' }
  ],

  architecture: {
    title: 'Threat modeling inside the delivery lifecycle',
    nodes: [
      { id: 'dev', label: 'Feature team', sub: 'Q1: what are we building', kind: 'team', wide: [90, 0], tall: [70, 0], tip: 'Developers, product owner and a security champion. They own the model because they own the design.' },
      { id: 'adr', label: 'Design doc / ADR', sub: 'scope + assumptions', kind: 'policy', wide: [290, 0], tall: [210, 0], tip: 'The design review or ADR is the natural trigger: if it adds a flow or crosses a boundary, it needs a threat section.' },
      { id: 'dfd', label: 'DFD + boundaries', sub: 'entities, flows, stores', kind: 'service', wide: [490, 0], tall: [350, 0], tip: 'External entities, processes, data stores and data flows, with trust boundaries drawn as dashed lines.' },
      { id: 'tmcode', label: 'Model as code', sub: 'pytm / Threat Dragon', kind: 'compute', wide: [690, 0], tall: [350, 105], tip: 'The DFD lives in the repo (pytm Python or Threat Dragon JSON), is diffed in PRs and regenerates diagrams and a draft threat list.' },
      { id: 'sec', label: 'Security champion', sub: 'facilitates', kind: 'person', wide: [290, 110], tall: [70, 105], tip: 'Leads the session, asks the STRIDE questions, escalates to the central security team for crypto, payments or novel designs.' },
      { id: 'stride', label: 'STRIDE session', sub: 'Q2: what can go wrong', kind: 'team', wide: [490, 110], tall: [210, 105], tip: 'Walk each element (or each interaction) through the STRIDE categories that apply to its type.' },
      { id: 'trees', label: 'Attack trees', sub: 'high-value goals', kind: 'ml', wide: [690, 110], tall: [350, 210], tip: 'For the crown jewels (steal card data, take over admin): AND/OR decomposition with cost or feasibility per leaf.' },
      { id: 'score', label: 'Risk scoring', sub: 'bug bar / CVSS v4', kind: 'policy', wide: [890, 110], tall: [210, 210], tip: 'A consistent severity bar. DREAD is easy to start with but notoriously inconsistent; Microsoft moved away from it.' },
      { id: 'backlog', label: 'Backlog', sub: 'Q3: mitigations', kind: 'queue', wide: [490, 220], tall: [70, 210], tip: 'Each threat becomes a ticket with a mitigation, or an explicit risk acceptance with an owner and expiry.' },
      { id: 'ci', label: 'CI pipeline', sub: 'tests + model checks', kind: 'compute', wide: [290, 220], tall: [70, 315], tip: 'Security unit tests for each mitigation, SAST/DAST, and a check that high-severity threats are closed or accepted.' },
      { id: 'prod', label: 'Production', sub: 'running system', kind: 'service', wide: [490, 330], tall: [210, 315], tip: 'What actually runs. Drift between the model and production is the main way models die.' },
      { id: 'pentest', label: 'Pen test / bounty', sub: 'Q4: good enough?', kind: 'external', wide: [690, 220], tall: [350, 315], tip: 'Independent validation. Findings that the model missed are feedback on the modeling, not just bugs.' },
      { id: 'incident', label: 'Incidents', sub: 'feed the model', kind: 'external', wide: [890, 330], tall: [210, 420], tip: 'Every security incident asks: was this threat in the model? If not, why not? Update the model and the checklist.' }
    ],
    edges: [
      { from: 'dev', to: 'adr' },
      { from: 'adr', to: 'dfd' },
      { from: 'dfd', to: 'tmcode', dashed: true },
      { from: 'tmcode', to: 'stride', label: 'draft threats' },
      { from: 'dfd', to: 'stride' },
      { from: 'sec', to: 'stride', bidi: true },
      { from: 'stride', to: 'trees' },
      { from: 'trees', to: 'score' },
      { from: 'score', to: 'backlog' },
      { from: 'stride', to: 'backlog' },
      { from: 'backlog', to: 'ci' },
      { from: 'ci', to: 'prod' },
      { from: 'prod', to: 'pentest' },
      { from: 'pentest', to: 'backlog', dashed: true },
      { from: 'prod', to: 'incident', dashed: true },
      { from: 'incident', to: 'backlog', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'feature', title: 'Per-feature model: "pay by webhook"', tone: 'ok',
      steps: [
        { text: '<b>Q1, what are we working on?</b> The team writes an ADR: the order service will accept payment-provider <b>webhooks</b> to mark orders paid.', flow: ['dev>adr'], badges: { adr: 'ADR-042' } },
        { text: 'They add one flow to the DFD: <code>Payment provider → Order service</code>. It <b>crosses a trust boundary</b> (third party → internal), so it gets full attention.', flow: ['adr>dfd', 'dfd>tmcode'], badges: { dfd: ['crosses boundary', 'warn'] } },
        { text: '<b>Q2, what can go wrong?</b> STRIDE on the flow and the receiving process: <b>S</b>poofed webhook, <b>T</b>ampered amount, <b>R</b>"we never sent that", <b>D</b> replay flood.', flow: ['tmcode>stride', 'sec>stride'], badges: { stride: '4 threats' } },
        { text: '<b>Q3, what will we do?</b> HMAC signature with timestamp, amount re-fetched from the provider API, idempotency key against replay, signed audit log. Four tickets.', flow: ['stride>backlog'], badges: { backlog: '4 tickets' } },
        { text: 'Each mitigation gets a test: an unsigned or 6-minute-old webhook must be rejected. CI keeps it from regressing.', flow: ['backlog>ci', 'ci>prod'], ok: ['ci', 'prod'], tone: 'ok' }
      ]
    },
    {
      id: 'crown', title: 'Crown jewels: an attack tree for card data', tone: 'info',
      steps: [
        { text: 'For the highest-value goal, "read stored card data", the team builds an <b>attack tree</b> (Schneier, 1999): the goal at the root, OR/AND children below.', flow: ['stride>trees'], badges: { trees: 'goal: card data' } },
        { text: 'OR branches: SQL injection in the order API; stolen DB backup; admin account takeover; malicious dependency. AND node: takeover needs <b>phished password AND no MFA</b>.', nodes: ['trees'], badges: { trees: '4 OR · 1 AND' } },
        { text: 'Each leaf gets a <b>cost or feasibility</b>. The cheapest path decides the risk: here the unencrypted backup in a shared bucket, not the exotic exploit.', flow: ['trees>score'], warn: ['score'], badges: { score: ['cheapest: backup', 'warn'] }, tone: 'warn' },
        { text: 'Mitigations target the cheapest leaves first: tokenise cards (do not store them), encrypt backups with KMS, enforce MFA for admins.', flow: ['score>backlog'], ok: ['backlog'], tone: 'ok' }
      ]
    },
    {
      id: 'scale', title: 'At scale: 40 teams, one security team of 5', tone: 'warn',
      steps: [
        { text: 'The central security team reviews every design. With 40 teams shipping weekly, the queue is <b>three weeks</b> long (illustrative).', nodes: ['sec', 'stride'], warn: ['stride'], badges: { stride: ['3-week queue', 'warn'] }, tone: 'warn' },
        { text: 'Teams start skipping the review, or schedule it after launch. Coverage collapses exactly as delivery speeds up.', nodes: ['dev', 'adr'], err: ['adr'], badges: { adr: ['review skipped', 'err'] }, tone: 'err' },
        { text: 'Fix: <b>security champions</b> in each team run lightweight STRIDE sessions themselves; the model lives as code and drafts threats automatically.', flow: ['dev>adr', 'adr>dfd', 'dfd>tmcode', 'tmcode>stride'], ok: ['sec'], badges: { sec: ['1 per team', 'ok'] } },
        { text: 'The central team <b>triages by risk</b>: it joins only for new boundaries, payments, crypto and auth changes, and samples the rest.', flow: ['stride>trees', 'trees>score'], ok: ['stride'], tone: 'ok' }
      ]
    },
    {
      id: 'drift', title: 'Failure: the model rotted, the breach used a new path', tone: 'err',
      steps: [
        { text: 'A careful threat model was written at launch two years ago. Since then, a <b>support admin tool</b> was added with direct read access to the orders database.', nodes: ['prod', 'dfd'], warn: ['dfd'], badges: { dfd: ['2 years stale', 'warn'] }, tone: 'warn' },
        { text: 'A support agent\'s laptop is phished. The attacker uses the admin tool to export customer data. The tool has no MFA and no per-record audit.', flow: ['prod>incident'], err: ['prod', 'incident'], badges: { incident: ['data exported', 'err'] }, tone: 'err' },
        { text: 'Post-incident question: <b>was this threat in the model?</b> No: the admin flow never existed in the DFD. The model described a system that no longer existed.', flow: ['incident>backlog'], err: ['dfd'], tone: 'err' },
        { text: 'Fixes: model as code in the repo, a PR template question "does this add a flow or cross a boundary?", <code>--stale_days</code> checks in CI, and a model review per release.', flow: ['backlog>ci', 'dfd>tmcode'], ok: ['tmcode', 'ci'], tone: 'ok' }
      ]
    },
    {
      id: 'validate', title: 'Q4: did we do a good enough job?', tone: 'info',
      steps: [
        { text: 'Before release, the team checks the model itself: every boundary-crossing flow has threats, every threat has a decision, every "mitigated" has a test.', nodes: ['backlog', 'ci'], badges: { backlog: '22/24 closed' } },
        { text: 'Two medium threats are <b>accepted</b>: a business owner signs, with compensating controls and an <b>expiry date</b>.', nodes: ['score'], warn: ['score'], badges: { score: ['2 accepted', 'warn'] } },
        { text: 'An external pen test finds one issue: an IDOR (OWASP API1:2023, Broken Object Level Authorization) in a list endpoint. It was <b>not</b> in the model.', flow: ['prod>pentest', 'pentest>backlog'], err: ['pentest'], badges: { pentest: ['1 miss', 'err'] } },
        { text: 'The fix goes in, and so does a <b>process fix</b>: "object-level authorisation on every ID parameter" joins the team\'s STRIDE-E checklist.', nodes: ['stride', 'backlog'], ok: ['stride', 'backlog'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick how you model, how often, and who takes part. Meters are illustrative judgements from the practice literature (Shostack, the Manifesto, OWASP), not measurements.',
    diagram: null,
    controls: [
      { id: 'approach', label: 'Approach', type: 'seg', value: 'stride', options: [
        { v: 'none', l: 'None' }, { v: 'check', l: 'Ad-hoc checklist' }, { v: 'stride', l: 'STRIDE per element' }, { v: 'full', l: 'STRIDE + trees + scoring' }] },
      { id: 'cadence', label: 'Cadence', type: 'seg', value: 'feature', options: [
        { v: 'once', l: 'Once (at launch)' }, { v: 'release', l: 'Per release' }, { v: 'feature', l: 'Per feature' }] },
      { id: 'who', label: 'Participants', type: 'seg', value: 'mixed', options: [
        { v: 'sec', l: 'Security team only' }, { v: 'mixed', l: 'Devs + security' }] }
    ],
    evaluate(s) {
      const c01 = (x) => Math.max(0, Math.min(1, x));
      const depth = { none: 0, check: 0.35, stride: 0.75, full: 0.95 }[s.approach];
      const cost = { none: 0, check: 0.15, stride: 0.45, full: 0.8 }[s.approach];
      const freq = { once: 0.35, release: 0.7, feature: 1 }[s.cadence];
      const freqCost = { once: 0.2, release: 0.5, feature: 0.8 }[s.cadence];
      const devs = s.who === 'mixed';
      const none = s.approach === 'none';
      const coverage = none ? 0.02 : depth * freq * (devs ? 1 : 0.85);
      const effort = none ? 0 : cost * freqCost * (devs ? 1.15 : 0.8);
      const quality = none ? 0 : depth * (devs ? 1 : 0.8) + (s.approach === 'full' && !devs ? 0.05 : 0);
      const owner = none ? 0.05 : devs ? 0.85 - (s.cadence === 'once' ? 0.3 : 0) : 0.15;
      let ttm = 1 - effort * 0.7;
      if (!devs && !none) ttm -= s.cadence === 'feature' ? 0.35 : 0.15; // central queue
      const fresh = none ? 0 : freq * (devs ? 1 : 0.8);
      const metrics = [
        { k: 'Coverage of real threats', v: Math.round(coverage * 100) + '% (illustrative)', s: c01(coverage) },
        { k: 'Effort', v: none ? 'none' : effort < 0.2 ? 'low' : effort < 0.45 ? 'moderate' : 'high', s: c01(1 - effort), hint: 'person-hours per quarter' },
        { k: 'Findings quality', v: quality > 0.8 ? 'design-level, prioritised' : quality > 0.55 ? 'systematic' : quality > 0.2 ? 'shallow, generic' : 'none', s: c01(quality) },
        { k: 'Developer ownership', v: owner > 0.6 ? 'team owns it' : owner > 0.3 ? 'partial' : 'security\'s problem', s: c01(owner) },
        { k: 'Time to market', v: ttm > 0.8 ? 'no visible delay' : ttm > 0.55 ? 'small delay' : 'queue / gate delays', s: c01(ttm) },
        { k: 'Model freshness', v: none ? 'no model' : s.cadence === 'once' ? 'stale within months' : s.cadence === 'release' ? 'per release' : 'current', s: c01(fresh) }
      ];
      const notes = [];
      if (none) notes.push('No model means design flaws surface in pen tests, bug bounties or incidents, when the fix is rework. OWASP A04:2021 <b>Insecure Design</b> exists as a category for exactly this.');
      if (s.approach === 'check') notes.push('A checklist catches known classes (OWASP Top 10) but not design-specific flaws such as an unsigned webhook. Good as a <b>floor</b> for tiny changes.');
      if (s.approach === 'full') notes.push('Attack trees and scoring pay off for crown jewels (payments, auth, PII). For every feature they are heavy; use them selectively.');
      if (s.cadence === 'once') notes.push('A launch-time model rots: new flows (admin tools, webhooks, integrations) appear and nobody models them. Most breaches use paths the old diagram never had.');
      if (!devs && s.cadence === 'feature' && !none) notes.push('A central security team modelling every feature becomes a <b>queue</b>. Teams route around it. Train champions instead.');
      if (devs && !none) notes.push('Developers know the real flows; security brings attacker thinking. The Manifesto\'s value: <b>people and collaboration over processes, methodologies and tools</b>.');
      let verdict;
      if (none) verdict = '❌ <b>No threat modeling.</b> You find design flaws in production. Start with lightweight STRIDE per feature.';
      else if (s.cadence === 'once') verdict = '⚠ <b>A one-off model goes stale.</b> Tie updates to releases or, better, to every feature that adds a flow.';
      else if (!devs && s.cadence === 'feature') verdict = '⚠ <b>Thorough but a bottleneck.</b> Push sessions into teams with champions; keep security for high-risk reviews.';
      else if (s.approach === 'check') verdict = '👍 <b>Better than nothing</b>, but checklists miss design-specific threats. Use STRIDE where flows cross boundaries.';
      else if (s.approach === 'full' && s.cadence === 'feature') verdict = '👍 <b>Very thorough, expensive.</b> Keep the full treatment for crown jewels; STRIDE-only for ordinary features.';
      else if (devs && s.cadence === 'feature') verdict = '✅ <b>Recommended default:</b> lightweight STRIDE per feature, developer-owned, security as coach.';
      else verdict = '👍 <b>Solid.</b> Per-release modelling works for slower release trains; watch for flows added mid-release.';
      const labels = {
        stride: { label: { none: 'No session', check: 'Checklist', stride: 'STRIDE session', full: 'STRIDE + trees' }[s.approach], sub: devs ? 'devs + champion' : 'security team' },
        dfd: { label: 'DFD + boundaries', sub: { once: 'drawn at launch', release: 'updated per release', feature: 'updated per feature' }[s.cadence] },
        sec: { label: devs ? 'Security champion' : 'Central security', sub: devs ? 'facilitates' : 'reviews everything' }
      };
      let flow;
      if (none) flow = ['dev>adr', 'ci>prod', 'prod>incident', 'incident>backlog'];
      else if (s.approach === 'full') flow = ['dev>adr', 'adr>dfd', 'dfd>stride', 'stride>trees', 'trees>score', 'score>backlog', 'backlog>ci', 'ci>prod'];
      else flow = ['dev>adr', 'adr>dfd', 'dfd>stride', 'stride>backlog', 'backlog>ci', 'ci>prod'];
      const err = [], warn = [], ok = [];
      if (none) err.push('incident', 'dfd', 'stride');
      if (s.cadence === 'once' && !none) warn.push('dfd');
      if (!devs && s.cadence === 'feature' && !none) warn.push('sec');
      if (!none && devs && s.cadence !== 'once') ok.push('stride', 'backlog');
      return {
        metrics, verdict, notes: notes.slice(0, 4), labels, flow, err, warn, ok,
        hot: none ? ['incident'] : ['stride'],
        hide: [],
        badges: { stride: [{ none: 'skipped', check: 'checklist', stride: 'STRIDE', full: 'STRIDE+AT' }[s.approach], none ? 'err' : 'info'], dfd: [{ once: 'once', release: 'per release', feature: 'per feature' }[s.cadence], s.cadence === 'once' ? 'warn' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Interactive DFD: STRIDE per element on a web shop',
    caption: 'A sample shop with four <b>trust boundaries</b>. Click any element or data flow to list the STRIDE categories that apply to its type, with concrete threats and mitigations. Tick a mitigation when it is done and watch the residual risk drop. <b>Highlight crossings</b> shows the flows that cross a boundary, where threats are weighted ×1.5.'
  },

  realWorld: {
    intro: 'Threat modeling grew out of Microsoft\'s security push and the attack-tree work of the late 1990s, and is now a community practice with open tools and a manifesto.',
    timeline: [
      { when: 'Apr 1999', who: 'Microsoft', title: '"The threats to our products" (STRIDE)', text: 'Loren Kohnfelder and Praerit Garg published the internal paper that introduced the threat categories later known as STRIDE, recommended by Microsoft\'s Security Task Force for all product teams.', src: 0 },
      { when: 'Dec 1999', who: 'Bruce Schneier', title: 'Attack trees (Dr. Dobb\'s Journal)', text: 'A goal at the root, ways to reach it as children, OR and AND nodes, and values such as cost or likelihood on each leaf, so you can find the cheapest attack and reason about which attackers matter.', src: 1 },
      { when: '2002–2008', who: 'Microsoft', title: 'DREAD added, then dropped', text: 'DREAD (Damage, Reproducibility, Exploitability, Affected users, Discoverability) entered the SDL around <i>Writing Secure Code</i> 2nd ed. (2002). Microsoft later moved to a <b>bug bar</b>; Shostack explains the scores were inconsistent and shifted over time.', src: 2 },
      { when: '2007', who: 'Microsoft SDL', title: 'STRIDE per element', text: 'Larry Osterman\'s SDL posts describe the four DFD element types and which STRIDE categories apply to each: external entities only S and R, processes all six.', src: 3 },
      { when: '2014', who: 'Adam Shostack', title: 'Four-question framework', text: 'Shostack\'s book <i>Threat Modeling: Designing for Security</i> introduced the four questions (first drafted as five at Microsoft). The Microsoft Threat Modeling Tool 2014 generates threats per interaction.', src: 4 },
      { when: '2019–', who: 'OWASP', title: 'pytm: threat model as code', text: 'pytm describes elements, boundaries and flows in Python and generates DFDs (Graphviz), sequence diagrams and findings, so the model lives in the repo.', src: 5 },
      { when: 'Nov 2020', who: 'Threat Modeling Manifesto', title: 'Values, principles, patterns', text: 'A group of practitioners published the Manifesto around the four questions. It is deliberately not prescriptive about method, valuing a culture of finding and fixing design issues over checkbox compliance.', src: 6 },
      { when: 'Sep 2021', who: 'OWASP', title: 'Top 10 2021: A04 Insecure Design', text: 'A new category, <b>Insecure Design</b>, explicitly calls for threat modeling. A01 Broken Access Control moved to first place.', src: 7 },
      { when: 'Jun 2023', who: 'OWASP', title: 'API Security Top 10 2023', text: 'API1 Broken Object Level Authorization stays first; BOPLA merges excessive data exposure and mass assignment; SSRF is new at API7.', src: 8 },
      { when: 'Nov 2023', who: 'FIRST', title: 'CVSS v4.0', text: 'Four metric groups (Base, Threat, Environmental, Supplemental) and explicit score names such as CVSS-B and CVSS-BTE, so a base score is no longer mistaken for risk in your environment.', src: 9 },
      { when: '2023–', who: 'OWASP', title: 'Threat Dragon 2.x', text: 'The open-source DFD and threat tool was rewritten in Vue.js for version 2, available as web and desktop app, for drawing DFDs and recording threats and mitigations.', src: 10 },
      { when: 'ongoing', who: 'KU Leuven', title: 'LINDDUN for privacy', text: 'Seven privacy threat types (Linking, Identifying, Non-repudiation, Detecting, Data disclosure, Unawareness, Non-compliance), applied on the same DFD; listed by NIST in its Privacy Framework resources.', src: 11 }
    ],
    lessons: [
      'The method matters less than <b>asking the four questions regularly</b>. A 2-hour STRIDE session per feature beats a perfect model once.',
      'Spend time where <b>trust changes</b>: flows that cross a boundary carry most real threats.',
      'Use a <b>consistent bar</b> for severity. DREAD was dropped at Microsoft because its scores were inconsistent.',
      'Keep the model <b>alive</b> as code or in the ADR, and treat every incident and pen-test finding as feedback on the model.'
    ],
    sources: [
      { title: 'The Threats To Our Products (Kohnfelder & Garg, 1999)', url: 'https://threatmodelingbook.com/files/microsoft/The-Threats-To-Our-Products.docx', pub: 'Microsoft Interface, Apr 1999 (hosted by Shostack)' },
      { title: 'Attack Trees', url: 'https://www.schneier.com/academic/archives/1999/12/attack_trees.html', pub: 'Bruce Schneier, Dr. Dobb\'s Journal, Dec 1999' },
      { title: 'The DREAD Pirates', url: 'https://shostack.org/blog/tmt-the-dread-pirates/', pub: 'Shostack + Friends blog' },
      { title: 'Threat Modeling Again: What does STRIDE have to do with threat modeling?', url: 'https://learn.microsoft.com/en-us/archive/blogs/larryosterman/threat-modeling-again-what-does-stride-have-to-do-with-threat-modeling', pub: 'Larry Osterman, Microsoft blog archive, 2007' },
      { title: 'The Four Question Framework', url: 'https://shostack.org/files/papers/The_Four_Question_Framework.pdf', pub: 'Adam Shostack, white paper' },
      { title: 'OWASP pytm', url: 'https://github.com/OWASP/pytm', pub: 'OWASP, GitHub' },
      { title: 'Threat Modeling Manifesto', url: 'https://threatmodelingmanifesto.org/', pub: 'Threat Modeling Manifesto working group, Nov 2020' },
      { title: 'OWASP Top 10 2021: A01 Broken Access Control', url: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control', pub: 'OWASP, 2021' },
      { title: 'OWASP API Security Project (Top 10 2023)', url: 'https://owasp.org/projects/api-security-project', pub: 'OWASP, 2023' },
      { title: 'FIRST announces CVSS v4.0 release', url: 'https://www.redhat.com/en/blog/first-announces-cvss-v40-release', pub: 'Red Hat, Nov 2023' },
      { title: 'Threat Dragon version 2.0', url: 'https://owasp.org/www-project-threat-dragon/docs-2/about', pub: 'OWASP' },
      { title: 'LINDDUN privacy threat modeling framework', url: 'https://www.nist.gov/privacy-framework/linddun-privacy-threat-modeling-framework', pub: 'NIST Privacy Framework resources' },
      { title: 'Microsoft Threat Modeling Tool', url: 'https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool', pub: 'Microsoft Learn' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Enumeration method', '<b>STRIDE</b>: six categories, per element or per interaction; easy to teach', '<b>PASTA</b>: seven risk-centric stages from business objectives to attack simulation (UcedaVélez &amp; Morana, 2015)', 'STRIDE for engineering teams and per-feature work; PASTA when the organisation wants business-impact-driven analysis and has security analysts to run it'],
      ['Depth for high-value goals', '<b>STRIDE list</b>: broad, one row per threat', '<b>Attack trees</b>: deep, AND/OR paths with cost per leaf', 'Attack trees for crown jewels (card data, admin takeover, signing keys); STRIDE everywhere else'],
      ['Security vs privacy', '<b>STRIDE</b>: attacker harms the system', '<b>LINDDUN</b>: the system (even working correctly) harms the person', 'Add LINDDUN when the feature processes personal data; both run on the same DFD'],
      ['Scoring', '<b>DREAD</b>: 5 factors, quick, subjective', '<b>CVSS v4.0</b> or a <b>bug bar</b>: defined metrics, consistent', 'A fixed bug bar for design threats; CVSS-BTE for concrete vulnerabilities; avoid debating DREAD decimals'],
      ['Tooling', '<b>Whiteboard / diagram tool</b>: fast, zero setup', '<b>Model as code</b> (pytm, Threat Dragon JSON, MS TMT files) in the repo', 'Whiteboard for the first session; commit the result as code so it is diffed, reviewed and kept current'],
      ['Who runs it', '<b>Central security team</b>: expert, scarce', '<b>Developers + champion</b>: scalable, owns the fix', 'Teams by default; central security for new boundaries, crypto, auth, payments, and to coach']
    ]
  },
  failures: [
    { f: '<b>Shelfware</b>: model written once for an audit, never updated', detect: 'Last-modified date older than the last three releases; DFD missing services that exist in production', fix: 'Model as code in the repo, PR-template trigger question, pytm <code>--stale_days</code> in CI, review per release.' },
    { f: '<b>Boundary blindness</b>: everything inside the VPC treated as trusted', detect: 'DFD has one boundary (internet); no threats on service-to-service or third-party flows', fix: 'Draw a boundary wherever privilege or ownership changes: third parties, admin paths, tenants, data stores. Apply zero-trust assumptions.' },
    { f: '<b>Threat list with no decisions</b>', detect: 'Threats without owner, ticket or status; same threats reappear each review', fix: 'No threat leaves the session without mitigate / eliminate / transfer / accept, an owner and a ticket. Acceptances expire.' },
    { f: '<b>Mitigations never verified</b>', detect: 'Tickets closed with no test; pen test finds "mitigated" threats exploitable', fix: 'Each mitigation names its evidence: a security unit test, config check or DAST rule. CI blocks closing without it.' },
    { f: '<b>Security team bottleneck</b>', detect: 'Review queue in weeks; teams launch before review; models done after the fact', fix: 'Security champions per team, risk-based triage of what central security reviews, templates and model-as-code drafts.' },
    { f: '<b>Scoring theatre</b>', detect: 'Long debates over a DREAD 6.4 vs 7.2; the same threat rated differently by two teams', fix: 'A small fixed bug bar (critical / high / medium / low with examples); CVSS v4.0 for concrete vulnerabilities.' },
    { f: '<b>Checklist only</b>: OWASP Top 10 ticked, design flaw missed', detect: 'Incidents that abuse business logic (unsigned webhook, refund loop) rather than injection', fix: 'Use the checklist as a floor, then ask STRIDE questions about the specific flows of this feature.' }
  ],

  interview: [
    { q: 'What is threat modeling, and what are Shostack\'s four questions?', a: '<p>A structured way to find design-level security problems before you build. Shostack\'s framework, adopted by the <b>Threat Modeling Manifesto (2020)</b>: <b>What are we working on? What can go wrong? What are we going to do about it? Did we do a good enough job?</b></p><p>Common misreading: that threat modeling <i>is</i> STRIDE or a tool. STRIDE answers question two; DFDs answer question one; the backlog answers three; tests and pen tests answer four.</p>', lvl: 'core' },
    { q: 'What are the four DFD element types, and what is a trust boundary?', a: '<p><b>External entities</b> (users, third parties you do not control), <b>processes</b> (your code), <b>data stores</b> (DBs, queues, files) and <b>data flows</b> between them. A <b>trust boundary</b> is where the level of trust or privilege changes: internet to gateway, service to third-party API, app to admin path, one tenant to another.</p><p>Flows that cross a boundary are where most threats are; every one of them deserves explicit questions about authentication, integrity and input validation.</p>', lvl: 'core' },
    { q: 'Explain STRIDE and the security property each letter violates.', a: '<ul><li><b>S</b>poofing → authentication</li><li><b>T</b>ampering → integrity</li><li><b>R</b>epudiation → non-repudiation</li><li><b>I</b>nformation disclosure → confidentiality</li><li><b>D</b>enial of service → availability</li><li><b>E</b>levation of privilege → authorisation</li></ul><p>Introduced by Kohnfelder and Garg at Microsoft in 1999. <b>STRIDE per element</b>: external entities get S and R; processes all six; data stores T, I, D (and R if they hold logs); data flows T, I, D.</p>', fu: 'Why does an external entity not get Tampering?', lvl: 'core' },
    { q: 'When would you use an attack tree instead of STRIDE?', a: '<p>Attack trees (Schneier, Dr. Dobb\'s, Dec 1999) put an <b>attacker goal</b> at the root and decompose it into OR alternatives and AND preconditions, with a value (cost, feasibility, skill) per leaf. They answer "what is the cheapest way to reach this goal?"</p><p>Use them for <b>crown jewels</b>: card data, admin takeover, signing keys. STRIDE is breadth-first over the whole DFD; attack trees are depth-first on one goal. They complement each other.</p>', lvl: 'core' },
    { q: 'What is DREAD, and why did Microsoft stop using it? What would you use instead?', a: '<p>DREAD scores Damage, Reproducibility, Exploitability, Affected users, Discoverability. It is easy to start but <b>subjective</b>: two people rate the same threat differently, and Discoverability rewards obscurity. Shostack explains Microsoft moved to a <b>bug bar</b> because scores were inconsistent and changed over time.</p><p>I use a small fixed <b>severity bar</b> with examples for design threats, and <b>CVSS v4.0</b> (FIRST, Nov 2023) for concrete vulnerabilities, adding Threat and Environmental metrics (CVSS-BTE) so the score reflects our context. Common misreading: a CVSS <i>base</i> score is severity, not risk.</p>', lvl: 'deep' },
    { q: 'How do OWASP Top 10 (2021) and API Security Top 10 (2023) fit with threat modeling?', a: '<p>They are <b>checklists of common weakness classes</b>, useful as a floor and as prompts during STRIDE. 2021 added <b>A04 Insecure Design</b>, which explicitly calls for threat modeling, and put <b>A01 Broken Access Control</b> first. The API list keeps <b>API1 Broken Object Level Authorization</b> first.</p><p>Mapping: BOLA and broken access control are STRIDE-<b>E</b> (and I); injection is <b>T</b>; security misconfiguration often <b>I</b>; unrestricted resource consumption is <b>D</b>. A Top 10 checklist will not find a business-logic flaw like an unsigned webhook; a model of the actual flows will.</p>', lvl: 'core' },
    { q: 'How do you make threat modeling work in an agile team shipping weekly?', a: '<p><b>Lightweight, per feature, developer-owned.</b> A trigger in the PR or story template: "does this add a data flow or cross a trust boundary?" If yes, a 30–120 minute STRIDE session on the changed part of the DFD with a <b>security champion</b>. Threats go straight into the backlog with acceptance criteria.</p><p>The full model lives <b>as code</b> (pytm or Threat Dragon JSON) next to the service, so changes are diffed in PRs. Central security joins only for high-risk changes. Review the whole model once per release, and after every incident.</p>', lvl: 'core' },
    { q: 'Threat-model a payment webhook endpoint.', a: '<p>DFD: Payment provider (external entity) → webhook flow (crosses third-party → internal boundary) → Order service (process) → Orders DB (store).</p><ul><li><b>S</b>: anyone can POST "paid" → HMAC signature with a shared secret, verify before parsing</li><li><b>T</b>: amount altered → fetch the payment from the provider API, do not trust the body</li><li><b>R</b>: dispute "we never sent it" → store raw signed payload and signature</li><li><b>I</b>: verbose errors leak internals → generic 4xx</li><li><b>D</b>: replay flood → timestamp tolerance + idempotency key, rate limit</li><li><b>E</b>: webhook handler runs with DB admin rights → least-privilege role</li></ul>', lvl: 'deep' },
    { q: 'What is LINDDUN and when do you add it?', a: '<p>A privacy threat framework from KU Leuven: <b>Linking, Identifying, Non-repudiation, Detecting, Data disclosure, Unawareness, Non-compliance</b>. It runs on the same DFD as STRIDE.</p><p>The key difference: STRIDE asks how an attacker harms the system; LINDDUN also asks how the system, <b>working as designed</b>, harms the person (linking datasets, unwanted identification). Add it whenever a feature processes personal data, and feed the results into the DPIA.</p>', lvl: 'deep' },
    { q: 'How do you know a threat model was good enough?', a: '<p>Question four. Checks I use: every boundary-crossing flow has at least one threat considered; every threat has a decision and owner; every "mitigated" has evidence (a test or config check); accepted risks are signed and expire.</p><p>Then validate externally: pen-test and bug-bounty findings, and incidents, are checked against the model. A finding that was <b>not</b> in the model is feedback on the process (for example, add object-level authorisation to the checklist).</p>', lvl: 'core' },
    { q: 'Tell me about a time you introduced threat modeling to a team that saw it as overhead. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: eight product teams, one security engineer, and design reviews that happened after launch if at all. <b>Task</b>: get design flaws caught earlier without slowing delivery.</p><p><b>Action</b>: I ran one 90-minute STRIDE session on a live feature (a partner webhook) with the team itself; it found an unsigned callback in the first 20 minutes. I then added one question to the story template, trained one champion per team, and put a pytm model in each repo.</p><p><b>Result</b>: within two quarters about 70% of boundary-crossing features had a model before merge, and the next pen test reported no design-level findings, only implementation bugs.</p>', lvl: 'core' },
    { q: 'Tell me about a risk from a threat model that you chose to accept. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: our model flagged that support staff could view full order history without per-record audit. <b>Task</b>: decide whether to block the release for it.</p><p><b>Action</b>: I quantified it with the team: about 30 staff, SSO with MFA, access already logged per session. I proposed accepting it for one quarter with a compensating control (weekly access review) and wrote a risk acceptance signed by the support director, expiring in 90 days.</p><p><b>Result</b>: the release went out on time; per-record audit shipped in the next quarter before the acceptance expired, and the acceptance record satisfied the auditor.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'pytm: the web shop threat model as code (Python 3.11)',
      lang: 'python',
      code: `#!/usr/bin/env python3
# pip install pytm   ·  python3 tm.py --dfd | dot -Tpng -o dfd.png
#                       python3 tm.py --report docs/basic_template.md
from pytm import (TM, Actor, Boundary, Classification, Data,
                  Dataflow, Datastore, Server)

tm = TM("Web shop checkout")
tm.description = "Browser -> gateway -> order service -> DB / payments"
tm.isOrdered = True          # number the flows in diagrams
tm.mergeResponses = True

internet = Boundary("Internet")
dmz      = Boundary("DMZ")
internal = Boundary("Internal network")
psp_zone = Boundary("Payment provider")

user = Actor("Customer browser");  user.inBoundary = internet
gw = Server("API gateway");        gw.inBoundary = dmz
gw.controls.isHardened = True
orders = Server("Order service");  orders.inBoundary = internal
orders.controls.sanitizesInput = True
orders.controls.authorizesSource = True     # E: object-level authz
psp = Actor("Payment provider");   psp.inBoundary = psp_zone
db = Datastore("Orders DB");       db.inBoundary = internal
db.isSQL = True
db.maxClassification = Classification.RESTRICTED

card = Data("Card token", classification=Classification.SECRET)

f1 = Dataflow(user, gw, "Place order (HTTPS)")
f1.protocol, f1.dstPort = "HTTPS", 443
f2 = Dataflow(gw, orders, "Forward with JWT")
f3 = Dataflow(orders, db, "Write order (SQL)")
f4 = Dataflow(orders, psp, "Charge card token")
f4.data = card
f5 = Dataflow(psp, orders, "Payment webhook (HMAC)")  # S: verify signature

tm.process()`,
      note: 'Every <code>Dataflow</code> between objects in different <code>Boundary</code> instances is a boundary crossing; pytm matches its threat library against element attributes (for example missing input sanitisation) and lists findings. Commit <code>tm.py</code> next to the service and regenerate diagrams in CI. Attribute names follow the pytm README; check them against your installed version.'
    },
    {
      title: 'Threat entry template for an ADR or backlog (YAML)',
      lang: 'yaml',
      code: `# threats/TM-ORD-012.yaml  - one file per threat, reviewed in PRs
id: TM-ORD-012
model: checkout-webhooks          # feature model / ADR-042
element: flow:psp->order-service  # DFD element id
crosses_boundary: true            # third party -> internal
stride: S                         # S | T | R | I | D | E
property_violated: authentication
scenario: >
  Anyone who knows the webhook URL posts {"status":"paid"} for an
  unpaid order and receives goods.
owasp: [API2:2023 Broken Authentication]
severity: high                    # from the team bug bar
cvss_v4: null                     # fill in for concrete vulnerabilities
decision: mitigate                # mitigate | eliminate | transfer | accept
mitigations:
  - id: MIT-031
    control: HMAC-SHA256 signature over timestamp + body, 5-min tolerance
    ticket: SHOP-4411
    verified_by: test/WebhookSignatureTest#rejectsUnsigned
  - id: MIT-032
    control: Re-fetch payment status from provider API before fulfilment
    ticket: SHOP-4412
    verified_by: test/FulfilmentTest#ignoresBodyAmount
owner: team-checkout
status: mitigated                 # open | mitigated | accepted
risk_acceptance: null             # {by, reason, compensating, expires}
reviewed: 2026-11-04`,
      note: 'The fields mirror the four questions: element (what we work on), STRIDE and scenario (what can go wrong), decision and mitigations (what we do), <code>verified_by</code> (did we do enough). A CI check can fail when <code>severity: high</code> has <code>status: open</code> on the release branch.'
    },
    {
      title: 'Spring Security 6 (Boot 3): controls mapped to STRIDE',
      lang: 'java',
      code: `@Configuration
@EnableWebSecurity
@EnableMethodSecurity                       // E: enables @PreAuthorize
class SecurityConfig {

  @Bean
  SecurityFilterChain web(HttpSecurity http) throws Exception {
    http
      .authorizeHttpRequests(a -> a
        .requestMatchers("/actuator/health").permitAll()
        .requestMatchers("/admin/**").hasRole("ADMIN")      // E
        .anyRequest().authenticated())                      // S
      .oauth2Login(Customizer.withDefaults())               // S: OIDC login
      .csrf(c -> c                                          // T: CSRF
        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
      .headers(h -> h
        .contentSecurityPolicy(p -> p.policyDirectives(     // T/I: XSS
            "default-src 'self'; frame-ancestors 'none'"))
        .frameOptions(f -> f.deny())                        // T: clickjacking
        .httpStrictTransportSecurity(s -> s                 // I: no downgrade
            .includeSubDomains(true).maxAgeInSeconds(31_536_000)));
    return http.build();
  }

  @Bean                                     // R: publish authz denials
  AuthorizationEventPublisher authzEvents(ApplicationEventPublisher p) {
    return new SpringAuthorizationEventPublisher(p);
  }

  @EventListener
  void onDenied(AuthorizationDeniedEvent<?> e) {             // R: audit trail
    LoggerFactory.getLogger("audit").warn("DENY user={} decision={}",
        e.getAuthentication().get().getName(), e.getAuthorizationDecision());
  }
}

@Service
class OrderService {
  // E + I: object-level check stops BOLA (OWASP API1:2023)
  @PreAuthorize("hasRole('ADMIN') or @orderAuthz.isOwner(#id, authentication)")
  public Order cancel(UUID id) { /* ... */ return null; }
}`,
      note: 'Each comment names the STRIDE category the control addresses. D (denial of service) is not handled by Spring Security: add rate limits at the gateway and resource limits in the service. For a stateless API using only bearer tokens, CSRF protection can be disabled because browsers do not attach bearer tokens automatically.'
    }
  ],

  related: ['zero-trust', 'iam-oauth-oidc', 'devsecops', 'data-privacy', 'risk-management', 'secrets-kms', 'ai-architecture']
});
