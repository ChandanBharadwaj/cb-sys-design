SD.register({
  slug: 'quality-attributes',
  domain: 2,
  title: 'Quality Attributes & ATAM',
  examples: 'ISO 25010, SEI ATAM',
  tagline: '"Fast, secure, scalable" is not a requirement. A <b>quality-attribute scenario</b> with a number in it is. ATAM is how you find the design decisions that <b>trade one quality for another</b> before production finds them for you.',
  tldr: {
    problem: 'Stakeholders ask for a system that is "fast", "secure" and "highly available". Nobody can test those words, so every design looks fine on a slide, and the real conflicts (encryption vs latency, caching vs freshness, cost vs redundancy) surface in production.',
    idea: 'Write each quality as a six-part <b>scenario</b>: source, stimulus, artifact, environment, response, <b>response measure</b>. Rank scenarios in a <b>utility tree</b> by (importance, difficulty). Walk the architecture against the top (H,H) ones and record <b>risks, non-risks, sensitivity points and trade-off points</b>.',
    insight: 'The output of ATAM is not a grade. It is a list of <b>decisions that several qualities depend on</b> (trade-off points) and the <b>risk themes</b> they create, tied back to business goals. Most of the value comes from the conversation that makes the requirements precise.',
    numbers: [
      { v: '9', l: 'product quality characteristics in ISO/IEC 25010:2023 (up from 8 in 2011)' },
      { v: '6', l: 'parts of a quality-attribute scenario (Bass, Clements & Kazman)' },
      { v: '9 steps', l: 'in the ATAM evaluation phases (Kazman, Klein & Clements, SEI 2000)' }
    ]
  },

  intro: {
    what: 'A <b>quality attribute</b> is a measurable "how well" property of a system: how fast, how available, how easy to change, how secure. <b>ATAM</b> (Architecture Tradeoff Analysis Method) is a structured review from the Software Engineering Institute that checks a design against the qualities that matter most and shows where improving one quality hurts another.',
    analogy: {
      icon: '🚗',
      title: 'Buying a car with a real spec sheet',
      text: '"I want a safe, fast, cheap car" does not help a salesperson. "0 to 100 km/h in under 8 seconds, five-star crash rating, under 6 litres per 100 km, under 30,000" does. Now you can see the <b>trade-offs</b>: the bigger engine helps speed but hurts fuel use. That engine is a <b>trade-off point</b>. ATAM is the test drive with your whole family in the car, each person checking the thing they care about. Where the analogy breaks: cars come with spec sheets, while software qualities must be written by you, per system.'
    },
    problem: 'A payments team is told the new API must be "fast and secure". They add mutual TLS, per-request token introspection and a fraud check, all synchronous. In load testing p99 latency is 900 ms and the business wanted "fast". Nobody wrote down what fast meant, so nobody saw that the security choices spent the latency budget. <b>How do you make qualities precise enough to design against, and find the conflicts before you build?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Adjectives in a slide deck',
        text: 'Requirements say "fast, secure, scalable, easy to maintain". The architect presents boxes and arrows, everyone nods, and the design is approved. Each adjective means something different to each person in the room.',
        scene: {
          nodes: [
            { id: 'biz', label: 'Product owner', sub: '"make it fast"', kind: 'person', at: [70, 0] },
            { id: 'sec', label: 'Security', sub: '"make it secure"', kind: 'person', at: [350, 0] },
            { id: 'arch', label: 'Architect', sub: 'one diagram', kind: 'person', at: [210, 110] },
            { id: 'sys', label: 'Design', sub: 'approved', kind: 'service', at: [210, 220] }
          ],
          edges: [{ from: 'biz', to: 'arch' }, { from: 'sec', to: 'arch' }, { from: 'arch', to: 'sys' }],
          flow: [['biz>arch', 'sec>arch'], 'arch>sys']
        }
      },
      {
        stage: 'breaks',
        title: 'The conflict shows up in production',
        text: 'Security adds token checks and encryption on every hop. Each choice is reasonable alone. Together they push p99 latency far past what the business meant by "fast", and the rework happens after launch, when it is most expensive.',
        scene: {
          nodes: [
            { id: 'biz', label: 'Product owner', sub: 'p99 900 ms?!', kind: 'person', at: [70, 0] },
            { id: 'sec', label: 'Security', sub: 'mTLS + introspect', kind: 'person', at: [350, 0] },
            { id: 'sys', label: 'Payments API', sub: '4 sync checks', kind: 'service', at: [210, 110] },
            { id: 'user', label: 'Customers', sub: 'checkout drops', kind: 'client', at: [210, 220] }
          ],
          edges: [{ from: 'sec', to: 'sys' }, { from: 'sys', to: 'user' }, { from: 'user', to: 'biz' }],
          flow: ['sec>sys', 'sys>user', 'user>biz'],
          err: ['sys'], warn: ['biz'],
          badges: { sys: ['p99 900 ms', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Scenarios, a utility tree, then analysis',
        text: 'The team writes "<b>at 2,000 payments/s, p99 under 300 ms</b>" and "<b>a stolen token is useless after 5 minutes</b>". Ranked in a utility tree, both are (High, High). Walking the design against them shows token validation is a <b>trade-off point</b>, so they pick short-lived signed tokens validated locally.',
        scene: {
          nodes: [
            { id: 'biz', label: 'Product owner', sub: 'p99 < 300 ms', kind: 'person', at: [70, 0] },
            { id: 'sec', label: 'Security', sub: 'token TTL 5 min', kind: 'person', at: [350, 0] },
            { id: 'arch', label: 'Utility tree', sub: '(H,H) first', kind: 'policy', at: [210, 110] },
            { id: 'sys', label: 'Payments API', sub: 'local JWT check', kind: 'service', at: [210, 220] }
          ],
          edges: [{ from: 'biz', to: 'arch' }, { from: 'sec', to: 'arch' }, { from: 'arch', to: 'sys' }],
          flow: [['biz>arch', 'sec>arch'], 'arch>sys'],
          ok: ['sys', 'arch'],
          badges: { arch: ['trade-off found', 'ok'] }
        }
      }
    ],
    usedBy: ['Carnegie Mellon SEI (ATAM)', 'US Department of Defense programmes', 'ISO/IEC 25010 adopters', 'AWS Well-Architected reviews', 'Thoughtworks (fitness functions)', 'arc42 users (quality requirements section)'],
    whenToUse: [
      'Before committing to an architecture that is <b>expensive to change</b>: a new platform, a re-platforming, a regulated or safety-relevant system',
      'When stakeholders <b>disagree</b> or speak in adjectives: scenarios force them to say what they mean in numbers',
      'When you suspect a <b>hidden conflict</b> between qualities (security vs latency, consistency vs availability, cost vs redundancy)'
    ],
    whenNot: [
      'Do not run a full multi-day ATAM on a small, easily reversible service. A one-hour review of three scenarios, or a fitness function, gives most of the value',
      'Do not treat ATAM as a pass/fail audit. It finds risks; decisions and follow-up live in ADRs (see <a href="rfcs-adrs.html">RFCs & ADRs</a>)',
      'Do not stop at the review. Turn the top scenarios into automated checks (see <a href="architecture-governance.html">Architecture Governance</a>)'
    ],
    glossary: [
      { term: 'Quality attribute', def: 'A measurable property that says how well the system does its job, such as latency, availability, modifiability or security.' },
      { term: 'Quality-attribute scenario', def: 'A six-part statement (source, stimulus, artifact, environment, response, response measure) that makes a quality testable.' },
      { term: 'Architecturally significant requirement (ASR)', def: 'A requirement that has a large effect on the architecture: if it changed, the structure would change.' },
      { term: 'Utility tree', def: 'A tree from "utility" to quality attributes to refinements to concrete scenarios, each rated by importance and difficulty.' },
      { term: 'Tactic', def: 'A design decision that influences one quality attribute response, such as caching, redundancy, or limiting access.' },
      { term: 'Sensitivity point', def: 'A property of one or more components that is critical for achieving a particular quality response.' },
      { term: 'Trade-off point', def: 'A property that is a sensitivity point for more than one attribute, improving one while hurting another.' },
      { term: 'Fitness function', def: 'An automated, objective check of an architectural characteristic that runs continuously, for example in CI.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Qualities are scenarios, not adjectives</b>: every important quality has at least one six-part scenario with a response measure',
      '<b>Rank before you analyse</b>: rate scenarios by business importance and architectural difficulty, and analyse the (H,H) ones first',
      '<b>Trace to business goals</b>: each scenario says which business driver it serves, so trade-offs can be argued in business terms',
      '<b>Name the tactic</b>: for each top scenario, say which design decision (tactic) achieves the response, and what it costs elsewhere',
      '<b>Record sensitivity and trade-off points explicitly</b>, with the attributes they touch and the direction of each effect',
      '<b>Close the loop</b>: risks become backlog items or ADRs; top scenarios become fitness functions or SLOs'
    ],
    nonFunctional: [
      '<b>Testability of requirements</b>: 100 % of (H,·) scenarios have a numeric response measure',
      '<b>Coverage</b>: every business driver maps to ≥ 1 scenario; every scenario to a driver',
      '<b>Review cost</b>: lightweight review in hours, full ATAM in days (SEI describes phase 1 and phase 2 as on-site meetings over several days)',
      '<b>Risk yield</b>: findings arrive before the design is frozen, when a change costs a meeting rather than a migration',
      '<b>Decision confidence</b>: each trade-off point has an owner and an ADR that names what was given up',
      '<b>Continuous verification</b>: top scenarios run as automated checks on every build or in production monitoring'
    ],
    outOfScope: [
      '<b>Adjective NFRs</b>: "fast", "scalable", "user-friendly" with no number and no condition',
      '<b>Everything is High</b>: a utility tree where every scenario is (H,H) ranks nothing',
      '<b>Audit theatre</b>: an evaluation that grades the architect instead of finding risks',
      '<b>One-off review</b>: scenarios analysed once, never re-checked as the system evolves',
      '<b>Checklist without context</b>: copying a generic ISO list without asking which qualities this business needs'
    ]
  },

  calculator: {
    inputs: [
      { id: 'n', label: 'Scenarios in the utility tree', min: 5, max: 120, value: 40 },
      { id: 'hh', label: 'Share rated (H,H)', min: 0, max: 60, value: 15, unit: '%' },
      { id: 'hm', label: 'Share rated (H,M) or (M,H)', min: 0, max: 60, value: 25, unit: '%' },
      { id: 'min', label: 'Analysis time per scenario', min: 10, max: 90, step: 5, value: 30, unit: 'min' },
      { id: 'ppl', label: 'People in the room', min: 3, max: 25, value: 10 },
      { id: 'rate', label: 'Loaded cost per person-hour', min: 50, max: 250, step: 10, value: 120, unit: '$' }
    ],
    outputs: [
      { label: '(H,H) scenarios: analyse all', f: (v) => Math.round(v.n * v.hh / 100) },
      { label: '(H,M)/(M,H) scenarios: analyse if time allows', f: (v) => Math.round(v.n * v.hm / 100) },
      { label: 'Analysis hours for (H,H) + (H,M)', f: (v) => (Math.round((Math.round(v.n * v.hh / 100) + Math.round(v.n * v.hm / 100)) * v.min / 6) / 10) + ' h' },
      { label: 'Person-hours of analysis', f: (v) => Math.round((Math.round(v.n * v.hh / 100) + Math.round(v.n * v.hm / 100)) * v.min / 60 * v.ppl) },
      { label: 'Cost of the analysis sessions', f: (v) => '$' + Math.round((Math.round(v.n * v.hh / 100) + Math.round(v.n * v.hm / 100)) * v.min / 60 * v.ppl * v.rate).toLocaleString('en-US') },
      { label: 'Ranking health', f: (v) => v.hh > 30 ? '⚠ too many (H,H): ranking is not discriminating' : v.hh + v.hm === 0 ? '⚠ nothing is important?' : '✓ a short, sharp top of the list' }
    ],
    note: 'Utility-tree ratings are ordinal (H/M/L). Analyse every (H,H), then (H,M) and (M,H) while time allows; low-importance scenarios are usually only recorded. The 30-minute analysis slot and the cost per person-hour are <em>rules of thumb / estimates</em>, not SEI figures. If more than about a third of scenarios are (H,H), the group has not really prioritised: ask "if we could only meet five of these, which five?"'
  },

  api: [
    { m: 'YAML', p: 'QAS-PERF-01: checkout latency under peak', d: 'The six parts: <b>source</b> (shoppers), <b>stimulus</b> (2,000 checkout requests/s), <b>artifact</b> (checkout API + payment adapter), <b>environment</b> (normal operation, Black Friday peak), <b>response</b> (order accepted), <b>response measure</b> (p99 ≤ 300 ms, errors ≤ 0.1 %). Plus business driver, importance and difficulty.' },
    { m: 'DOC', p: 'Utility tree', d: 'Root "utility" → quality attributes (performance, availability, security, modifiability…) → refinements (latency, throughput, data confidentiality…) → concrete scenarios, each tagged <b>(importance, difficulty)</b> as H/M/L.' },
    { m: 'DOC', p: 'Business-drivers presentation (ATAM step 2)', d: 'Goals, constraints, stakeholders, and the qualities that matter most, presented by the project or business lead. Every scenario must trace back to something said here.' },
    { m: 'DOC', p: 'Analysis of architectural approaches', d: 'Per (H,H) scenario: the approaches and tactics used, the <b>risks</b>, <b>non-risks</b>, <b>sensitivity points</b> and <b>trade-off points</b>, and the reasoning or measurement behind each.' },
    { m: 'DOC', p: 'ATAM outputs and risk themes', d: 'The final report: the ranked scenarios, the analysis, and <b>risk themes</b> (groups of related risks) each linked to the business drivers they threaten.' },
    { m: 'ADR', p: 'ADR-031: local JWT validation over token introspection', d: 'Records a trade-off point: latency and availability improve, revocation is delayed up to the token TTL. Names the scenarios affected and what would make you revisit.' }
  ],

  dataModel: [
    { name: 'qa_scenario', store: 'Postgres / repo YAML', fields: [['id', 'text', 'pk'], ['attribute', 'text', 'idx'], ['refinement', 'text'], ['source', 'text'], ['stimulus', 'text'], ['artifact', 'text'], ['environment', 'text'], ['response', 'text'], ['measure', 'text'], ['importance', 'enum (H|M|L)', 'idx'], ['difficulty', 'enum (H|M|L)', 'idx'], ['driver_id', 'text', 'fk']], note: 'One row per scenario. <code>measure</code> must be numeric for any scenario rated High importance.' },
    { name: 'design_decision', store: 'Postgres / ADR log', fields: [['id', 'text', 'pk'], ['title', 'text'], ['tactic', 'text'], ['adr', 'text']], note: 'The architectural approaches and tactics identified in ATAM step 4.' },
    { name: 'decision_effect', store: 'Postgres', fields: [['decision_id', 'text', 'pk'], ['scenario_id', 'text', 'pk'], ['effect', 'enum (+|−)'], ['kind', 'enum (sensitivity|tradeoff)', 'idx']], note: 'A decision touching one attribute is a sensitivity point; one that helps some attributes and hurts others is a trade-off point.' },
    { name: 'finding', store: 'Postgres / backlog', fields: [['id', 'uuid', 'pk'], ['kind', 'enum (risk|non_risk)', 'idx'], ['scenario_id', 'text', 'fk'], ['decision_id', 'text', 'fk'], ['theme', 'text', 'idx'], ['owner', 'text'], ['status', 'enum']], note: 'Risks are grouped into risk themes and become backlog items; non-risks document why a decision is safe.' }
  ],

  architecture: {
    title: 'From business goals to risk themes (ATAM)',
    nodes: [
      { id: 'biz', label: 'Business drivers', sub: 'goals · constraints', kind: 'person', wide: [100, 90], tall: [70, 0], tip: 'ATAM step 2: the project or business lead presents goals, constraints and the most important qualities.' },
      { id: 'stk', label: 'Stakeholders', sub: 'ops · security · users', kind: 'team', wide: [100, 330], tall: [350, 0], tip: 'Phase 2 widens the room: developers, operators, testers, users. They brainstorm and vote on scenarios (step 7).' },
      { id: 'arc', label: 'Architect', sub: 'presents design', kind: 'person', wide: [100, 210], tall: [210, 0], tip: 'ATAM step 3: the architect presents the architecture at the level of detail needed to analyse it.' },
      { id: 'appr', label: 'Approaches', sub: 'styles · tactics', kind: 'service', wide: [310, 210], tall: [70, 110], tip: 'ATAM step 4: the evaluators list the architectural approaches and tactics in use, without analysing them yet.' },
      { id: 'tree', label: 'Utility tree', sub: '(importance, difficulty)', kind: 'policy', wide: [310, 90], tall: [210, 110], tip: 'ATAM step 5: utility → attributes → refinements → scenarios, each rated H/M/L for importance and difficulty.' },
      { id: 'brain', label: 'Scenario vote', sub: 'brainstorm + rank', kind: 'queue', wide: [310, 330], tall: [350, 110], tip: 'ATAM step 7: a larger group brainstorms scenarios and votes. Results are compared with the utility tree.' },
      { id: 'ana', label: 'Analysis', sub: 'steps 6 and 8', kind: 'compute', wide: [520, 210], tall: [210, 220], tip: 'Walk each high-priority scenario through the approaches: how is the response achieved, what is it sensitive to?' },
      { id: 'sens', label: 'Sensitivity pts', sub: 'one attribute', kind: 'store', wide: [720, 90], tall: [70, 330], tip: 'Properties critical for one quality response, e.g. the cache TTL decides freshness.' },
      { id: 'trade', label: 'Trade-off pts', sub: 'several attributes', kind: 'store', wide: [720, 210], tall: [210, 330], tip: 'Sensitivity points for more than one attribute, e.g. encryption: security up, latency down.' },
      { id: 'risk', label: 'Risks / non-risks', sub: 'with rationale', kind: 'store', wide: [720, 330], tall: [350, 330], tip: 'Risks: decisions that may cause problems for a quality. Non-risks: decisions judged safe, with the reason.' },
      { id: 'theme', label: 'Risk themes', sub: 'step 9 report', kind: 'policy', wide: [900, 210], tall: [105, 440], tip: 'Related risks grouped into themes and tied back to the business drivers they threaten.' },
      { id: 'ff', label: 'ADRs + fitness fns', sub: 'keep it true', kind: 'compute', wide: [900, 330], tall: [315, 440], tip: 'After the review: decisions recorded in ADRs, top scenarios turned into automated checks and SLOs.' }
    ],
    edges: [
      { from: 'biz', to: 'tree' },
      { from: 'arc', to: 'appr' },
      { from: 'stk', to: 'brain' },
      { from: 'tree', to: 'ana' },
      { from: 'appr', to: 'ana' },
      { from: 'brain', to: 'ana' },
      { from: 'ana', to: 'sens' },
      { from: 'ana', to: 'trade' },
      { from: 'ana', to: 'risk' },
      { from: 'trade', to: 'theme' },
      { from: 'risk', to: 'theme' },
      { from: 'theme', to: 'ff' },
      { from: 'brain', to: 'tree', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'phase1', title: 'ATAM phase 1: build the utility tree', tone: 'info',
      steps: [
        { text: 'Step 2: the business lead says the goal is to <b>double checkout volume</b> by next year and pass a <b>PCI DSS</b> audit. Those are the drivers everything else must trace to.', flow: ['biz>tree'], badges: { biz: '2 drivers' } },
        { text: 'Step 3–4: the architect presents the design; evaluators list the approaches: <b>cache-aside</b> for the catalogue, <b>JWT</b> auth, <b>async</b> order events, active-passive database.', flow: ['arc>appr'], badges: { appr: '4 approaches' } },
        { text: 'Step 5: the utility tree. Performance → latency → "p99 ≤ 300 ms at 2,000 rps" rated <b>(H,H)</b>. Modifiability → "add a payment provider in ≤ 2 weeks" rated (M,L).', nodes: ['tree'], badges: { tree: ['12 scenarios · 3 (H,H)', 'info'] } },
        { text: 'Step 6: analyse each (H,H) scenario against the approaches. The active-passive database fails over in about a minute: a <b>risk</b> for the 99.95 % availability scenario.', flow: ['tree>ana', 'appr>ana', 'ana>risk'], warn: ['risk'], badges: { risk: ['failover ≈ 60 s', 'warn'] } }
      ]
    },
    {
      id: 'vague', title: 'Turning "it must be fast" into a scenario', tone: 'ok',
      steps: [
        { text: 'The requirement says "<b>fast</b>". Ask: fast <i>for whom</i>, doing <i>what</i>, under <i>which load</i>, and <i>measured how</i>?', nodes: ['biz'], labels: { biz: { label: 'Requirement', sub: '"must be fast"' } }, warn: ['biz'] },
        { text: 'Source: a shopper. Stimulus: submits checkout. Artifact: checkout API. Environment: <b>peak</b>, 2,000 req/s. Response: order accepted. Measure: <b>p99 ≤ 300 ms</b>.', flow: ['biz>tree'], labels: { biz: { label: 'Requirement', sub: 'six parts' } }, badges: { tree: 'QAS-PERF-01' } },
        { text: 'Add the environment you forgot: during a <b>database failover</b>, p99 ≤ 2 s and no order lost. Same quality, different condition, different design pressure.', nodes: ['tree'], badges: { tree: ['+ degraded mode', 'info'] } },
        { text: 'Rate it (H,H) and hand it to analysis. Later it becomes a load-test <b>fitness function</b> in CI, so the number stays true after the review.', flow: ['tree>ana'], ok: ['tree'], badges: { ff: ['Gatling p99 check', 'ok'] }, nodes: ['ff'], tone: 'ok' }
      ]
    },
    {
      id: 'tradeoff', title: 'Finding a trade-off point: token validation', tone: 'warn',
      steps: [
        { text: 'Two (H,H) scenarios: "p99 ≤ 300 ms at peak" and "a revoked credential stops working within <b>60 s</b>".', nodes: ['tree'], badges: { tree: '2 × (H,H)' } },
        { text: 'The approach: every call introspects the token at the identity provider. Good for revocation (instant), but adds a network hop and makes the IdP a <b>dependency of every request</b>.', flow: ['appr>ana'], labels: { appr: { label: 'Token introspect', sub: 'per request' } }, warn: ['ana'] },
        { text: 'The analysis shows the same decision moves <b>security up</b> and <b>latency and availability down</b>. That is a <b>trade-off point</b>, not just a sensitivity point.', flow: ['ana>trade'], warn: ['trade'], badges: { trade: ['security ↑ latency ↓', 'warn'] }, tone: 'warn' },
        { text: 'Options: local JWT validation with a short TTL (revocation delayed up to the TTL), or a cached introspection result. The team picks a <b>5-minute JWT</b> and writes an ADR naming what it gave up.', flow: ['trade>theme', 'theme>ff'], ok: ['ff'], badges: { ff: ['ADR-031', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'skipped', title: 'No evaluation: the risk is found in production', tone: 'err',
      steps: [
        { text: 'Under schedule pressure the team <b>skips the review</b>. Requirements say "highly available". The design uses one primary database with asynchronous replication.', nodes: ['arc', 'appr'], labels: { appr: { label: 'Async replica', sub: 'manual failover' } }, hidden: ['tree', 'brain'] },
        { text: 'Nobody wrote the scenario "primary fails during peak: recover in ≤ 30 s, lose ≤ 0 orders". So nobody checked <b>failover time</b> or <b>replication lag</b>.', nodes: ['ana'], err: ['ana'], badges: { ana: ['never analysed', 'err'] }, hidden: ['tree', 'brain'], tone: 'err' },
        { text: 'Peak day: the primary dies. Manual failover takes <b>40 minutes</b>, and orders written in the last seconds before the crash are lost because replication was asynchronous.', nodes: ['risk'], err: ['risk', 'biz'], badges: { risk: ['RTO 40 min · data loss', 'err'] }, hidden: ['tree', 'brain'], tone: 'err' },
        { text: 'The fix costs a migration instead of a meeting. A one-hour scenario review would have turned "highly available" into an RTO/RPO pair and exposed the <b>risk</b> on paper.', flow: ['ana>risk', 'risk>theme'], ok: ['theme'], badges: { theme: ['post-mortem theme', 'ok'] } }
      ]
    },
    {
      id: 'scale', title: 'Phase 2 at scale: 20 stakeholders, 60 scenarios', tone: 'warn',
      steps: [
        { text: 'Step 7: operators, testers, support and security brainstorm. <b>60 scenarios</b> arrive, many duplicates, many vague.', flow: ['stk>brain'], warn: ['brain'], badges: { brain: ['60 raw', 'warn'] }, tone: 'warn' },
        { text: 'Merge duplicates, then <b>vote</b>: each participant gets a few votes (often about 30 % of the scenario count, rounded). The top scenarios are compared with the utility tree.', flow: ['brain>tree'], badges: { tree: '7 new (H,·)' } },
        { text: 'New high-priority scenarios that were not in the tree are a finding in themselves: the architect and the business saw the system differently. Add them as <b>new leaves</b>.', nodes: ['tree'], ok: ['tree'], badges: { tree: ['tree updated', 'ok'] } },
        { text: 'Step 8: analyse only the newly important ones; step 9: present <b>risk themes</b> such as "single points of failure in the data tier threaten the growth goal".', flow: ['tree>ana', ['ana>trade', 'ana>risk'], 'risk>theme'], badges: { theme: ['3 risk themes', 'info'] } }
      ]
    }
  ],

  knobs: {
    intro: 'Pick the dominant business driver, how much evaluation you do and how risky the system is. Meters show outcomes; values are <em>illustrative</em> estimates and the direction is the point.',
    controls: [
      { id: 'driver', label: 'Dominant driver', type: 'seg', value: 'scale', options: [
        { v: 'ttm', l: 'Time to market' }, { v: 'scale', l: 'Scalability' }, { v: 'sec', l: 'Security' }, { v: 'cost', l: 'Cost' }] },
      { id: 'rigor', label: 'Evaluation rigor', type: 'seg', value: 'light', options: [
        { v: 'none', l: 'None' }, { v: 'light', l: 'Lightweight review' }, { v: 'atam', l: 'Full ATAM' }, { v: 'ff', l: 'Review + fitness functions' }] },
      { id: 'reversible', label: 'Cost to reverse the design', type: 'seg', value: 'mid', options: [
        { v: 'low', l: 'Low (one service)' }, { v: 'mid', l: 'Medium' }, { v: 'high', l: 'High (platform / regulated)' }] },
      { id: 'measured', label: 'Scenarios with a numeric measure', type: 'range', min: 0, max: 100, step: 10, value: 50, fmt: (v) => v + ' %' }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0.05, Math.min(1, x));
      const R = { none: 0, light: 1, atam: 2, ff: 1.5 }[s.rigor];
      const rev = { low: 0, mid: 1, high: 2 }[s.reversible];
      const m = s.measured / 100;
      // share of serious design risks found before build (illustrative)
      let found = { none: 0.1, light: 0.45, atam: 0.75, ff: 0.6 }[s.rigor] * (0.5 + 0.5 * m);
      if (s.driver === 'sec' && s.rigor === 'light') found -= 0.05;
      const costD = { none: 0, light: 2, atam: 12, ff: 6 }[s.rigor];            // person-days, estimate
      const sched = { none: 0, light: 0.5, atam: 3, ff: 2 }[s.rigor] + (s.driver === 'ttm' && s.rigor === 'atam' ? 1 : 0);
      let conf = 0.2 + found * 0.7 + (s.rigor === 'ff' ? 0.1 : 0);
      const late = (1 - found) * (0.3 + 0.35 * rev);
      const fit = { ttm: R <= 1 ? 0.85 : 0.4, scale: R >= 1 ? 0.8 : 0.3, sec: R >= 1.5 ? 0.85 : R === 1 ? 0.55 : 0.2, cost: R === 1 || R === 1.5 ? 0.8 : R === 2 ? 0.5 : 0.4 }[s.driver];
      const over = (s.rigor === 'atam' && rev === 0);
      const under = (R <= 1 && rev === 2) || (s.rigor === 'none' && rev >= 1);

      const metrics = [
        { k: 'Risks found before build', v: '≈ ' + Math.round(found * 100) + ' %', s: clamp(found) },
        { k: 'Cost of review', v: costD === 0 ? 'none' : '≈ ' + costD + ' person-days', s: clamp(1 - costD / 14) },
        { k: 'Schedule impact', v: sched === 0 ? 'none' : '+' + sched + ' wk', s: clamp(1 - sched / 4.5) },
        { k: 'Decision confidence', v: conf > 0.7 ? 'high: trade-offs named' : conf > 0.45 ? 'medium' : 'low: adjectives only', s: clamp(conf) },
        { k: 'Late-rework exposure', v: late > 0.5 ? 'high' : late > 0.25 ? 'medium' : 'low', s: clamp(1 - late) },
        { k: 'Fit to driver', v: { ttm: 'ship fast', scale: 'prove the peak', sec: 'prove the threat model', cost: 'spend review where it pays' }[s.driver], s: clamp(fit) }
      ];
      const notes = [];
      if (m < 0.5) notes.push('Fewer than half the scenarios have a number. Analysis on adjectives finds fewer risks: a review cannot check "fast".');
      if (s.rigor === 'ff') notes.push('Fitness functions keep the top scenarios true <b>after</b> the review: a load test asserting p99, an ArchUnit rule, a cost budget in CI.');
      if (s.rigor === 'atam') notes.push('SEI ATAM: phase 1 with the architect and leads, phase 2 with the wider stakeholder group, then a written report of risks, sensitivity and trade-off points, and risk themes.');
      if (s.driver === 'sec') notes.push('For security, pair scenarios with a <b>threat model</b> (e.g. STRIDE). Many security risks are trade-off points against latency and usability.');
      if (s.driver === 'ttm' && s.rigor === 'atam') notes.push('A full ATAM on a time-to-market product may cost more calendar time than the risks it removes. A mini-ATAM over the 3–5 (H,H) scenarios is usually enough.');
      if (s.driver === 'scale') notes.push('Scalability scenarios need an <b>environment</b> (normal, peak, degraded) and a load number, or they cannot be tested.');
      if (s.driver === 'cost') notes.push('Treat run cost as a quality attribute: write a scenario ("cost per 1,000 orders ≤ $0.40 at 2× load") and track it as a fitness function.');

      let verdict;
      if (under && rev === 2) verdict = '❌ <b>Under-reviewed for a hard-to-reverse design.</b> The rework from one missed (H,H) risk dwarfs a few days of evaluation.';
      else if (s.rigor === 'none') verdict = '⚠ <b>No evaluation.</b> Fine for a throwaway spike; for anything else, at least review the top three scenarios.';
      else if (over) verdict = '⚠ <b>Over-engineered process.</b> A multi-day ATAM on a cheap-to-reverse service: use a one-hour review and a fitness function.';
      else if (m < 0.3) verdict = '⚠ <b>Process without precision.</b> Raise the share of measurable scenarios before spending more on reviews.';
      else if (s.rigor === 'ff' || (s.rigor === 'atam' && rev === 2)) verdict = '✅ <b>Rigor matches the stakes.</b> Trade-offs are named, recorded and checked continuously.';
      else verdict = '👍 <b>Proportionate.</b> Add fitness functions for the (H,H) scenarios so the review does not decay.';

      const lbl = { none: { label: 'No review', sub: 'skipped' }, light: { label: 'Mini-ATAM', sub: '1–2 h, (H,H) only' }, atam: { label: 'Analysis', sub: 'full ATAM, 2 phases' }, ff: { label: 'Analysis', sub: 'review + CI checks' } }[s.rigor];
      const flow = s.rigor === 'none' ? ['arc>appr'] : s.rigor === 'atam' ? ['biz>tree', 'stk>brain', ['tree>ana', 'appr>ana', 'brain>ana'], ['ana>trade', 'ana>risk'], 'risk>theme'] : ['biz>tree', ['tree>ana', 'appr>ana'], ['ana>trade', 'ana>risk'], 'risk>theme', 'theme>ff'];
      return {
        metrics, verdict, notes, flow,
        labels: { ana: lbl, biz: { label: 'Business drivers', sub: { ttm: 'ship by Q2', scale: '10× peak', sec: 'PCI / threat model', cost: 'unit cost' }[s.driver] } },
        hide: s.rigor === 'atam' ? [] : ['stk', 'brain'].concat(s.rigor === 'ff' ? [] : ['ff']),
        err: s.rigor === 'none' ? ['ana'] : [],
        warn: under ? ['risk'] : over ? ['ana'] : [],
        ok: s.rigor === 'ff' ? ['ff'] : [],
        badges: { risk: [Math.round(found * 100) + ' % found', found > 0.5 ? 'ok' : 'warn'], ana: [costD + ' p-days', 'info'] }
      };
    }
  },

  widget: {
    title: 'Build a utility tree and find the trade-off points',
    caption: 'Tap a scenario to cycle its <b>importance</b> and <b>difficulty</b> (H/M/L); its dot moves on the 3×3 grid and the ranked list updates. The <b>(H,H)</b> cell is what ATAM analyses first. Then pick a <b>design decision</b>: if it affects one attribute it is a <b>sensitivity point</b>; if it helps one attribute and hurts another it is a <b>trade-off point</b>, and every scenario it touches lights up.'
  },

  realWorld: {
    intro: 'Quality attributes have a long paper trail: an SEI method from the late 1990s, a textbook now in its fourth edition, an ISO standard revised in 2023, and the practitioner shift to lightweight, continuous checks.',
    timeline: [
      { when: '1998', who: 'SEI (Kazman, Klein, Barbacci et al.)', title: 'The Architecture Tradeoff Analysis Method', text: 'The first SEI technical report on ATAM (CMU/SEI-98-TR-008). It builds on the earlier <b>SAAM</b> (Software Architecture Analysis Method) and on attribute-specific analysis models.', src: 1 },
      { when: '2000', who: 'Kazman, Klein & Clements (SEI)', title: 'ATAM: Method for Architecture Evaluation', text: 'CMU/SEI-2000-TR-004 describes the method as used today: <b>nine steps</b> across presentation, investigation and analysis, testing, and reporting; the <b>utility tree</b>; and the outputs: risks, non-risks, <b>sensitivity points</b>, <b>trade-off points</b> and risk themes.', src: 0 },
      { when: '2005', who: 'SEI and US Army', title: 'ATAM on WIN-T', text: 'Clements, Bergey and Mason report applying ATAM to the Army\'s Warfighter Information Network-Tactical system, including how the evaluation fit into the <b>contract and acquisition</b> process. One of many cases in the SEI ATAM collection.', src: 2 },
      { when: '2011', who: 'Ted Neward', title: 'Architectural katas', text: 'Neward runs "Architectural Katas" workshops: small teams design a system for a short brief, then present and defend their choice of qualities and trade-offs. A low-cost way to practise the same reasoning.', src: 7 },
      { when: '2017', who: 'Thoughtworks Technology Radar', title: 'Architectural fitness functions (Trial)', text: 'The Radar describes a fitness function as an objective check of architectural characteristics, borrowed from evolutionary computing, so qualities are <b>validated automatically and continuously</b>.', src: 5 },
      { when: '2021', who: 'Bass, Clements & Kazman', title: 'Software Architecture in Practice, 4th ed.', text: 'The standard textbook for six-part <b>quality-attribute scenarios</b> and <b>tactics</b>, with chapters per quality including availability, deployability, energy efficiency, integrability, modifiability, performance, safety, security, testability and usability.', src: 3 },
      { when: '2021', who: 'AWS', title: 'Well-Architected adds a Sustainability pillar', text: 'AWS\'s review framework, a lightweight question-based evaluation by quality area, gains its sixth pillar in December 2021, explicitly about <b>balancing</b> sustainability against security, cost, performance, reliability and operational excellence.', src: 8 },
      { when: '2022', who: 'Ford, Parsons, Kua & Sadalage', title: 'Building Evolutionary Architectures, 2nd ed.', text: 'Makes <b>fitness functions</b> the core mechanism for keeping architectural characteristics true as a system evolves, and for automating governance.', src: 6 },
      { when: '2023', who: 'ISO/IEC', title: 'ISO/IEC 25010:2023', text: 'The product quality model now has <b>nine characteristics</b>: <b>Safety</b> is new; Usability becomes <b>Interaction capability</b>; Portability becomes <b>Flexibility</b> (with scalability added); security gains resistance.', src: 4 }
    ],
    lessons: [
      'The durable idea is the <b>scenario with a response measure</b>; methods around it (ATAM, mini-ATAM, katas, Well-Architected) differ mainly in cost and formality.',
      'ATAM\'s most valuable outputs are <b>trade-off points</b> and <b>risk themes</b> linked to business goals, not a score.',
      'Standards like ISO 25010 are a <b>checklist of what to ask about</b>, not a list of things to optimise; pick the few that matter here.',
      'Reviews decay. <b>Fitness functions</b> keep the top scenarios honest after the meeting ends.'
    ],
    sources: [
      { title: 'ATAM: Method for Architecture Evaluation (CMU/SEI-2000-TR-004)', url: 'https://apps.dtic.mil/sti/html/tr/ADA382629/index.html', pub: 'Kazman, Klein & Clements, SEI, 2000' },
      { title: 'The Architecture Tradeoff Analysis Method (CMU/SEI-98-TR-008)', url: 'https://apps.dtic.mil/sti/pdfs/ADA350761.pdf', pub: 'SEI, 1998' },
      { title: 'Using the SEI ATAM to Evaluate WIN-T: A Case Study', url: 'https://www.sei.cmu.edu/documents/2080/2005_004_001_14522.pdf', pub: 'Clements, Bergey & Mason, SEI, 2005' },
      { title: 'Software Architecture in Practice, 4th edition', url: 'https://www.pearson.com/store/en-us/p/software-architecture-in-practice/P200000000111', pub: 'Bass, Clements & Kazman, Addison-Wesley, 2021' },
      { title: 'ISO 25010 update 2023', url: 'https://quality.arc42.org/articles/iso-25010-update-2023', pub: 'arc42 quality model (Q42)' },
      { title: 'Architectural fitness function', url: 'https://www.thoughtworks.com/radar/techniques/architectural-fitness-function', pub: 'Thoughtworks Technology Radar' },
      { title: 'Building Evolutionary Architectures, 2nd Edition', url: 'https://nealford.com/books/bea2e.html', pub: 'Ford, Parsons, Kua & Sadalage, O\'Reilly, 2022' },
      { title: 'Architectural Katas Workshop', url: 'https://vslive.com/events/spring-2011/sessions/friday/fwk1-architectural-katas-workshop.aspx', pub: 'Ted Neward, VSLive 2011' },
      { title: 'New Sustainability Pillar for the AWS Well-Architected Framework', url: 'https://aws.amazon.com/about-aws/whats-new/2021/12/new-sustainability-pillar-aws-well-architected-framework', pub: 'AWS, 2021' },
      { title: 'Architecture Tradeoff Analysis Method Collection', url: 'https://sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/', pub: 'SEI' }
    ]
  },

  tradeoffs: {
    headers: ['Approach', 'Effort', 'Finds', 'Misses', 'Pick when…'],
    rows: [
      ['<b>No evaluation</b>', 'None', 'Nothing up front', 'Every conflict between qualities until production', 'Throwaway spike or prototype'],
      ['<b>Mini-ATAM / lightweight review</b>', '1–3 hours, architect + 3–6 people', 'Obvious risks on the top 3–5 scenarios', 'Concerns of stakeholders not in the room; subtle trade-offs', 'Most services and features; reversible decisions'],
      ['<b>Full ATAM (SEI)</b>', 'Several days over two phases plus prep and report', 'Trade-off points, risk themes, misaligned priorities across many stakeholders', 'Anything not exercised by a scenario; drift after the review', 'Expensive-to-reverse platforms, regulated or safety-relevant systems, large programmes'],
      ['<b>Architecture kata</b>', 'A workshop', 'Skill and shared vocabulary; alternative designs', 'Your real system\'s risks', 'Training architects and teams'],
      ['<b>Checklist review (e.g. Well-Architected)</b>', 'Hours per workload', 'Gaps against known good practice per quality area', 'Business-specific priorities and trade-offs', 'Many workloads on one cloud; periodic hygiene'],
      ['<b>Fitness functions</b>', 'Build once, run on every change', 'Regressions on the qualities you encoded', 'Qualities nobody encoded; new risks', 'After any review, to keep the top scenarios true']
    ]
  },

  failures: [
    { f: '<b>Adjective requirements</b>: "fast", "secure", "scalable"', detect: 'No requirement has a number, a load level or an environment. Reviewers argue about meaning.', fix: 'Rewrite each as a six-part scenario. Ask: who, what, under which conditions, measured how?' },
    { f: '<b>Everything is (H,H)</b>', detect: 'More than about a third of the utility tree is rated High importance and High difficulty.', fix: 'Force-rank: "if we could meet only five, which five?" Use votes; separate importance (business) from difficulty (architect).' },
    { f: '<b>Only the sunny-day environment</b>', detect: 'All scenarios say "under normal operation". None mention peak, failover, deploys or a degraded dependency.', fix: 'Add degraded-mode and peak environments for each critical scenario, with their own response measures (RTO, RPO, p99).' },
    { f: '<b>Evaluation as an audit</b>', detect: 'The architect defends instead of exploring; findings are negotiated down; the report is filed and forgotten.', fix: 'Frame it as risk discovery. Findings go to the backlog with owners; trade-offs go into ADRs.' },
    { f: '<b>Trade-off hidden as a sensitivity point</b>', detect: 'A decision is recorded as "improves security", with no note on what it costs latency, availability or cost.', fix: 'For each key decision, ask which other attributes it touches and in which direction. Two or more with opposite signs: trade-off point.' },
    { f: '<b>Review decay</b>', detect: 'The design changed since the review, but the scenarios were never re-checked; the p99 creeps up release by release.', fix: 'Turn (H,H) scenarios into fitness functions (load tests, ArchUnit rules, cost budgets) and SLO alerts.' }
  ],

  interview: [
    { q: 'What is a quality attribute, and how is it different from a functional requirement?', a: 'A functional requirement says <b>what</b> the system does ("place an order"). A quality attribute says <b>how well</b> it does it: latency, availability, security, modifiability. Qualities shape the architecture far more than features do, because most features can be built on most structures, but "p99 ≤ 300 ms at 10× load" or "deploy one team\'s change without the others" rules many structures out.', lvl: 'core' },
    { q: 'Turn "the system must be fast" into something testable.', a: 'Write a six-part scenario (Bass, Clements & Kazman): <b>source</b> (a shopper), <b>stimulus</b> (submits checkout), <b>artifact</b> (checkout API), <b>environment</b> (peak, 2,000 req/s), <b>response</b> (order accepted), <b>response measure</b> (p99 ≤ 300 ms, errors ≤ 0.1 %). Then add a degraded-mode variant (during failover p99 ≤ 2 s). The response measure is what makes it testable; without it the scenario is still an adjective.', fu: 'Why p99 rather than average latency?', lvl: 'core' },
    { q: 'What is an architecturally significant requirement?', a: 'A requirement with a <b>large effect on the structure</b>: change it and the architecture must change. Usually a demanding quality ("five nines", "data must stay in the EU") or a hard constraint. You find them by asking which requirements would rule out candidate designs, and by the (H,H) leaves of the utility tree: high business value, hard to achieve.', lvl: 'core' },
    { q: 'Walk me through ATAM.', a: 'SEI\'s method (Kazman, Klein & Clements, CMU/SEI-2000-TR-004). Nine steps: <b>(1)</b> present ATAM, <b>(2)</b> present business drivers, <b>(3)</b> present the architecture, <b>(4)</b> identify architectural approaches, <b>(5)</b> build the quality-attribute utility tree, <b>(6)</b> analyse approaches against the top scenarios, <b>(7)</b> brainstorm and prioritise scenarios with a larger stakeholder group, <b>(8)</b> analyse again with the new scenarios, <b>(9)</b> present results. Steps 1–6 run in phase 1 with the architect and leads, 7–9 in phase 2 with the wider group; there is preparation before and a report after. Outputs: risks, non-risks, sensitivity points, trade-off points, risk themes.', fu: 'What does ATAM not tell you?', lvl: 'core' },
    { q: 'What is the difference between a sensitivity point and a trade-off point? Give an example.', a: 'A <b>sensitivity point</b> is a property of one or more components that is critical to achieving a particular quality response, e.g. the cache TTL controls data freshness. A <b>trade-off point</b> is a sensitivity point for <b>more than one</b> attribute, where improving one hurts another: encrypting every internal hop raises confidentiality but costs latency and CPU; the number of replicas raises availability but raises cost and, with synchronous replication, write latency. Common misreading: "trade-off point" does not mean a bad decision; it means a decision you must make consciously and record.', lvl: 'core' },
    { q: 'How is a utility tree built and rated?', a: 'Root "utility", then quality attributes, then refinements (performance → latency, throughput), then concrete scenarios. Each scenario gets two ratings: <b>importance</b> to the business (set by stakeholders) and <b>difficulty</b> to achieve with this architecture (set by the architect), each H/M/L. Analyse (H,H) first, then (H,M) and (M,H). (L,·) scenarios are recorded but usually not analysed. If most leaves are (H,H), the ranking failed.', lvl: 'core' },
    { q: 'What is a tactic? Name tactics for availability and for performance.', a: 'A tactic is a design decision that influences one quality-attribute response (Bass et al.). Availability: detect faults (heartbeat, health check), recover (redundancy with active or passive spares, retry, rollback), prevent (remove from service, transactions). Performance: control resource demand (rate limiting, prioritisation, reducing work per request) and manage resources (caching, concurrency, replication, more resources). Patterns and styles bundle several tactics, and each tactic usually has a cost on another attribute.', lvl: 'deep' },
    { q: 'What changed in ISO/IEC 25010:2023, and how do you use the standard?', a: 'The product quality model went from eight to <b>nine characteristics</b>: <b>Safety</b> was added; Usability is now <b>Interaction capability</b>; Portability is now <b>Flexibility</b>, with scalability as a sub-characteristic; security gained resistance. The others are functional suitability, performance efficiency, compatibility, reliability, security and maintainability. Use it as a <b>checklist so you do not forget a whole category</b>, not as a list to maximise; then write scenarios only for the few that matter for this business.', lvl: 'deep' },
    { q: 'A full ATAM takes days. What would you do in a startup or for one service?', a: 'A <b>mini-ATAM</b>: one or two hours with the architect, a product lead, someone from operations and security. Agree the 3–5 (H,H) scenarios, walk the design through each, record risks and trade-off points, write an ADR for each trade-off. Then encode the top scenarios as <b>fitness functions</b>: a load test asserting p99, an ArchUnit rule, a cost budget. The rigor should match how expensive the decision is to reverse.', lvl: 'core' },
    { q: 'How do you convince stakeholders to spend time on scenario workshops?', a: 'Tie it to money and dates: a risk found on paper costs a meeting; the same risk found in production costs a migration and an incident. Start small (an hour, three scenarios), show one concrete trade-off they had not seen, and let the findings sell the next session. Make the output useful to them: a short list of risks with owners, not a 60-page report.', lvl: 'deep' },
    { q: 'Tell me about a time an evaluation changed a design.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> We were about to launch a new payments API; requirements said "fast and secure". <b>T:</b> As lead architect I had two weeks before the design freeze. <b>A:</b> I ran a two-hour mini-ATAM with product, security and SRE. We wrote 14 scenarios and rated 4 as (H,H), including "p99 ≤ 300 ms at 2,000 req/s" and "revoked credential rejected within 5 minutes". Analysis showed per-request token introspection was a trade-off point: it added a hop to every call and made the identity provider a dependency of every request. We moved to locally validated short-lived JWTs and wrote an ADR naming the 5-minute revocation window. <b>R:</b> Load tests showed p99 well under target, security signed off on the ADR, and the Gatling check now runs in CI.', lvl: 'deep' },
    { q: 'Tell me about a time you disagreed with stakeholders on priorities between qualities.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Product wanted multi-region active-active for a new internal tool; the budget was small. <b>T:</b> Agree what availability the business actually needed. <b>A:</b> I asked for the cost of an hour of downtime and wrote two scenarios: "region outage: recover in ≤ 4 h" vs "≤ 1 min". I priced each design and put both in the utility tree with importance set by the business owner. <b>R:</b> They rated the 1-minute scenario Medium once they saw it would roughly triple run cost. We shipped single-region with tested backups and recorded the revisit trigger in an ADR.', lvl: 'deep' }
  ],

  code: [
    {
      title: 'A quality-attribute scenario as YAML (versioned with the code)', lang: 'yaml',
      code: `# docs/quality/QAS-PERF-01.yaml
id: QAS-PERF-01
attribute: performance            # ISO/IEC 25010: performance efficiency
refinement: latency
business_driver: BD-2 "double checkout volume by next peak season"
source: shoppers on web and mobile
stimulus: submit checkout, 2000 requests/s sustained for 10 min
artifact: checkout-api + payment adapter
environment: peak load, all dependencies healthy
response: order accepted and confirmation returned
response_measure:
  p99_latency_ms: 300
  error_rate_pct: 0.1
priority:
  importance: H                   # set by business stakeholders
  difficulty: H                   # set by the architect
variants:
  - environment: primary database failover in progress
    response_measure: { p99_latency_ms: 2000, orders_lost: 0 }
decisions:
  - id: ADR-031                   # local JWT validation
    effect: { performance: "+", security: "-" }   # trade-off point
verified_by: perf/CheckoutPeakSimulation.java    # fitness function`,
      note: 'Keeping scenarios as files next to the code lets you review them in pull requests, link them to ADRs, and point each one at the check that verifies it.'
    },
    {
      title: 'Performance fitness function (Gatling Java DSL)', lang: 'java',
      code: `// build: io.gatling:gatling-charts-highcharts + gatling Maven/Gradle plugin (Gatling 3.10+)
import static io.gatling.javaapi.core.CoreDsl.*;
import static io.gatling.javaapi.http.HttpDsl.*;

import io.gatling.javaapi.core.*;
import io.gatling.javaapi.http.*;
import java.time.Duration;
import java.util.*;
import java.util.stream.Stream;

/** Verifies QAS-PERF-01: at 2,000 checkouts/s, p99 <= 300 ms and errors <= 0.1 %. */
public class CheckoutPeakSimulation extends Simulation {

  HttpProtocolBuilder httpProtocol = http.baseUrl(System.getProperty("baseUrl", "http://localhost:8080"))
      .contentTypeHeader("application/json");

  Iterator<Map<String, Object>> carts =
      Stream.generate(() -> Map.<String, Object>of("cartId", UUID.randomUUID().toString())).iterator();

  ScenarioBuilder checkout = scenario("QAS-PERF-01 checkout at peak")
      .feed(carts)
      .exec(http("checkout")
          .post("/api/checkout")
          .body(StringBody("{\\"cartId\\":\\"#{cartId}\\",\\"paymentToken\\":\\"tok_test\\"}"))
          .check(status().is(201)));

  {
    setUp(checkout.injectOpen(rampUsersPerSec(100).to(2000).during(Duration.ofMinutes(2)),
                    constantUsersPerSec(2000).during(Duration.ofMinutes(10))))
      .protocols(httpProtocol)
      .assertions(
          global().responseTime().percentile(99.0).lt(300),   // response measure
          global().failedRequests().percent().lte(0.1));        // build fails if violated
  }
}`,
      note: 'Assertions make the Gatling run exit non-zero when the response measure is missed, so a nightly pipeline turns QAS-PERF-01 into a <b>fitness function</b>. Run against a production-like environment; a laptop number is not the scenario\'s environment.'
    },
    {
      title: 'Rank the utility tree and flag trade-off points (Python 3.11+)', lang: 'python',
      code: `from dataclasses import dataclass, field
from collections import defaultdict

W = {"H": 3, "M": 2, "L": 1}

@dataclass
class Scenario:
    id: str
    attribute: str
    importance: str
    difficulty: str
    effects: dict[str, str] = field(default_factory=dict)  # decision -> "+" / "-"

    @property
    def score(self) -> int:              # importance weighs a little more than difficulty
        return W[self.importance] * 10 + W[self.difficulty]

tree = [
    Scenario("PERF-01", "performance", "H", "H", {"jwt-local": "+", "mtls-all-hops": "-"}),
    Scenario("SEC-02", "security", "H", "M", {"jwt-local": "-", "mtls-all-hops": "+"}),
    Scenario("AVAIL-01", "availability", "H", "H", {"jwt-local": "+"}),
    Scenario("MOD-03", "modifiability", "M", "L", {}),
]

for s in sorted(tree, key=lambda s: s.score, reverse=True):
    tag = "ANALYSE FIRST" if (s.importance, s.difficulty) == ("H", "H") else ""
    print(f"{s.id:9} ({s.importance},{s.difficulty}) {s.score:3} {tag}")

effects: dict[str, set[tuple[str, str]]] = defaultdict(set)
for s in tree:
    for decision, sign in s.effects.items():
        effects[decision].add((s.attribute, sign))

for decision, hits in effects.items():
    signs = {sign for _, sign in hits}
    attrs = sorted({a for a, _ in hits})
    kind = "TRADE-OFF point" if len(attrs) > 1 and signs == {"+", "-"} else "sensitivity point"
    print(f"{decision:14} {kind:18} {attrs}")`,
      note: 'Sorting by importance first, then difficulty, follows ATAM practice: business value decides what matters, difficulty decides where the architecture is at risk. A decision that pushes different attributes in opposite directions is reported as a trade-off point.'
    }
  ],

  related: ['architectural-styles', 'okrs-to-nfrs', 'documenting-architecture', 'architecture-governance', 'reliability-math', 'rfcs-adrs']
});
