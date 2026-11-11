SD.register({
  slug: 'conflict-resolution',
  domain: 9,
  title: 'Conflict Resolution',
  examples: 'Thomas–Kilmann, DACI',
  tagline: 'Turn a heated <b>"Kafka vs RabbitMQ"</b> argument into a decision people commit to: uncover <b>interests</b>, agree <b>criteria before options</b>, gather <b>evidence</b> in a time box, and make sure exactly <b>one person decides</b>.',
  tldr: {
    problem: 'Two senior engineers hold opposite positions on a technology choice. Each meeting repeats the same arguments, the team splits into camps, and the decision is finally made by whoever is most senior, loudest or still standing. The loser quietly undermines it.',
    idea: 'Separate the <b>people</b> from the <b>problem</b>. Ask <b>why</b> each person holds their position to find the interests behind it, turn those interests into <b>weighted criteria agreed before anyone scores options</b>, fill the scores with a <b>time-boxed spike</b>, and let a named <b>decider</b> (DACI / RAPID) close it. Record the decision and the dissent in an ADR.',
    insight: 'Most technical disagreements are not about facts; they are about <b>unstated priorities</b>. Once weights are agreed, the matrix plus a <b>sensitivity check</b> shows whether the remaining disagreement even matters. Match the process weight to the door: <b>two-way doors</b> deserve a light, fast process.',
    numbers: [
      { v: '5 modes', l: 'Thomas–Kilmann: competing, collaborating, compromising, avoiding, accommodating (1970s)' },
      { v: '51 teams', l: 'in Edmondson\'s 1999 study linking psychological safety to team learning' },
      { v: '1 "D"', l: 'one person holds the decision in RAPID (Bain) and the Approver role in DACI' }
    ]
  },

  intro: {
    what: 'Conflict resolution for engineers is the practice of turning a disagreement into a <b>decision</b> that is good, fast enough and <b>supported</b> by the people who must live with it. It combines a little negotiation theory (what people really want), a <b>decision process</b> (who decides and how), and <b>evidence</b> (prototypes, benchmarks, a scored comparison).',
    analogy: {
      icon: '🧭',
      title: 'Two hikers arguing about the route',
      text: 'One hiker wants the ridge, the other the valley. Arguing "ridge!" vs "valley!" goes nowhere. Asking why reveals one wants the view and the other is worried about the weather. Now you can agree what matters (be back before the storm, see something good), check the forecast and the map, and let the trip leader call it. The analogy is imperfect: in a company the "leader" is a defined role, and the decision is written down so the next group of hikers knows why.'
    },
    problem: 'A platform team must pick a message broker for a new event pipeline. A staff engineer insists on Kafka; a senior engineer who runs on-call insists on RabbitMQ. Three meetings later nothing is decided, the project is two weeks late, and the two have stopped reviewing each other\'s code. The question this topic answers is: <b>how do we reach a decision quickly that both of them will actually commit to?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Debate until someone wins',
        text: 'The obvious approach: put both engineers in a room and let them argue it out. The best argument should win, and senior people are good at arguing.',
        scene: {
          nodes: [
            { id: 'a', label: 'Priya', sub: '"Kafka!"', kind: 'person', at: [70, 0] },
            { id: 'b', label: 'Marco', sub: '"RabbitMQ!"', kind: 'person', at: [350, 0] },
            { id: 'm', label: 'Meeting', sub: 'debate', kind: 'policy', at: [210, 110] }
          ],
          edges: [{ from: 'a', to: 'm' }, { from: 'b', to: 'm' }],
          flow: [['a>m', 'b>m']]
        }
      },
      {
        stage: 'breaks',
        title: 'Positions harden; decision by attrition',
        text: 'Each round restates <b>positions</b>, not reasons. Nobody knows who decides. After weeks, the manager picks the option of the most senior voice (<b>HiPPO</b>). The other engineer disagrees and does not commit; the choice gets relitigated at every incident.',
        scene: {
          nodes: [
            { id: 'a', label: 'Priya', sub: 'frustrated', kind: 'person', at: [70, 0] },
            { id: 'b', label: 'Marco', sub: 'disengaged', kind: 'person', at: [350, 0] },
            { id: 'm', label: 'Meeting #4', sub: 'same arguments', kind: 'policy', at: [210, 110] },
            { id: 'h', label: 'HiPPO', sub: 'picks by rank', kind: 'person', at: [210, 220] }
          ],
          edges: [{ from: 'a', to: 'm' }, { from: 'b', to: 'm' }, { from: 'm', to: 'h' }],
          flow: [['a>m', 'b>m'], 'm>h'],
          warn: ['m'], err: ['b', 'h'],
          badges: { m: ['+3 weeks', 'warn'], b: ['no commit', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Interests → criteria → evidence → one decider',
        text: 'A <b>driver</b> asks each engineer why, turns the answers into <b>weighted criteria</b> agreed up front, runs a <b>5-day spike</b> to score both options, and the <b>approver</b> decides from the matrix. Dissent is recorded in the ADR, and both commit.',
        scene: {
          nodes: [
            { id: 'a', label: 'Priya', sub: 'replay, scale', kind: 'person', at: [70, 0] },
            { id: 'b', label: 'Marco', sub: 'ops, skills', kind: 'person', at: [350, 0] },
            { id: 'm', label: 'Criteria', sub: 'weights first', kind: 'policy', at: [210, 110] },
            { id: 's', label: 'Spike', sub: '5-day timebox', kind: 'compute', at: [70, 220] },
            { id: 'h', label: 'Approver', sub: 'decides + ADR', kind: 'person', at: [350, 220] }
          ],
          edges: [{ from: 'a', to: 'm' }, { from: 'b', to: 'm' }, { from: 'm', to: 's' }, { from: 's', to: 'h' }],
          flow: [['a>m', 'b>m'], 'm>s', 's>h'],
          ok: ['m', 'h'],
          badges: { h: ['both commit', 'ok'] }
        }
      }
    ],
    usedBy: ['Amazon ("disagree and commit")', 'Atlassian (DACI play)', 'Intuit (origin of DACI)', 'Bain clients (RAPID)', 'IETF (rough consensus)', 'Google (Project Aristotle)'],
    whenToUse: [
      'Two or more credible engineers hold <b>opposing positions</b> and discussion has stopped converging',
      'The choice is costly to reverse (a <b>one-way door</b>): a datastore, a broker, a language, a public API',
      'People will have to <b>live with</b> the result: on-call, migrations, hiring'
    ],
    whenNot: [
      'A <b>two-way door</b> that is cheap to undo: let the owning team decide in a day and revisit with data',
      'The disagreement is really about values or behaviour, not the technology: handle it 1:1 or with the manager first',
      'A policy or standard already answers it: point to the <a href="architecture-governance.html">governance</a> decision instead of reopening it'
    ],
    glossary: [
      { term: 'Position', def: 'What someone says they want ("we must use Kafka").' },
      { term: 'Interest', def: 'Why they want it: the need or worry behind the position ("we need to replay events for analytics").' },
      { term: 'BATNA', def: 'Best Alternative To a Negotiated Agreement: what happens if no agreement is reached.' },
      { term: 'DACI', def: 'Driver, Approver, Contributors, Informed: who runs, decides, advises and hears about a decision.' },
      { term: 'One-way / two-way door', def: 'Bezos\'s names for irreversible versus reversible decisions.' },
      { term: 'Spike', def: 'A short, time-boxed experiment that produces evidence, not production code.' },
      { term: 'Weighted decision matrix', def: 'A table that scores options on agreed criteria and multiplies by agreed weights.' },
      { term: 'Disagree and commit', def: 'Voicing disagreement openly, then fully supporting the decision once it is made.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Separate the people from the problem</b>: attack the question together, not each other (Fisher & Ury)',
      'Focus on <b>interests, not positions</b>: ask "what would that give us?" until you reach a criterion',
      'Agree <b>criteria and weights before scoring options</b>, so nobody tunes the weights to their favourite',
      'Name <b>one decider</b> up front (DACI Approver / RAPID "D") and the date the decision is due',
      'Replace opinions with <b>evidence</b>: a time-boxed spike, a benchmark, a prototype, a reference call',
      'Close with <b>disagree and commit</b>: record dissent in the ADR, with a revisit trigger'
    ],
    nonFunctional: [
      '<b>Decision lead time</b>: two-way doors ≤ 2 days; one-way doors ≤ 2–3 weeks (rule of thumb)',
      '<b>Commitment</b>: no reopening without new evidence or a triggered revisit condition',
      '<b>Robustness</b>: the winner survives a ±10-point change to any single weight (sensitivity check)',
      '<b>Traceability</b>: 100% of one-way-door decisions have an ADR with options, criteria and dissent',
      '<b>Psychological safety</b>: dissenters speak in the meeting, not in the corridor afterwards',
      '<b>Relationship health</b>: both parties still review each other\'s work a month later'
    ],
    outOfScope: [
      '<b>HiPPO</b>: the Highest-Paid Person\'s Opinion decides, regardless of evidence',
      '<b>Design by committee</b>: everyone must agree, so the result is a compromise nobody wanted',
      '<b>Endless debate</b> with no owner and no deadline',
      '<b>Decision by attrition</b>: the side with more stamina wins when the other gives up',
      '<b>Weights after scores</b>: reverse-engineering criteria to justify a favourite'
    ]
  },

  calculator: {
    inputs: [
      { id: 'people', label: 'Participants in the debate', min: 2, max: 20, value: 6 },
      { id: 'opts', label: 'Options on the table', min: 2, max: 6, value: 2 },
      { id: 'w', label: 'Weight of the criteria where A is stronger', min: 5, max: 95, value: 50, unit: '%' },
      { id: 'dA', label: 'A\'s score lead on those criteria (1–5 scale)', min: 0.5, max: 4, step: 0.5, value: 2 },
      { id: 'dB', label: 'B\'s score lead on the other criteria', min: 0.5, max: 4, step: 0.5, value: 1.5 },
      { id: 'box', label: 'Spike time box', min: 1, max: 15, value: 5, unit: 'days' }
    ],
    outputs: [
      { label: 'Weighted margin A − B (on the 1–5 scale)', fmt: 'raw', f: (v) => { const w = v.w / 100; return (w * v.dA - (1 - w) * v.dB).toFixed(2); } },
      { label: 'Winner', fmt: 'raw', f: (v) => { const w = v.w / 100, m = w * v.dA - (1 - w) * v.dB; return Math.abs(m) < 0.05 ? 'tie: decide on a tie-breaker' : m > 0 ? 'Option A' : 'Option B'; } },
      { label: 'Weight at which the winner flips', unit: '%', f: (v) => Math.round(100 * v.dB / (v.dA + v.dB)) },
      { label: 'Weight change needed to flip (sensitivity)', fmt: 'raw', f: (v) => { const flip = 100 * v.dB / (v.dA + v.dB), d = Math.abs(v.w - flip); return d.toFixed(0) + ' pts' + (d < 10 ? ' ⚠ fragile' : d < 20 ? ' (moderate)' : ' ✓ robust'); } },
      { label: 'Communication pairs n(n−1)/2', f: (v) => v.people * (v.people - 1) / 2 },
      { label: 'Time to decide: timeboxed vs open-ended (estimate)', fmt: 'raw', f: (v) => { const pairs = v.people * (v.people - 1) / 2; const open = Math.round(3 + 0.5 * pairs * (v.opts - 1)); return (v.box + 1) + ' d vs ~' + open + ' d'; } }
    ],
    note: 'The model scores two options on two groups of criteria. A wins when <code>w·ΔA &gt; (1−w)·ΔB</code>, so the flip point is <code>w* = ΔB / (ΔA + ΔB)</code>, and <b>sensitivity</b> is how far the agreed weight sits from it. Under 10 points means stakeholders who merely weight things differently will disagree on the winner: spend the time agreeing weights, not arguing scores. The open-ended debate time is an <em>illustrative estimate</em> (3 days + half a day per pair of people per extra option); the timeboxed path is the spike plus one decision meeting.'
  },

  api: [
    { m: 'DOC', p: 'DACI: [question we are answering]?', d: 'Atlassian\'s template: the question, <b>Driver</b>, <b>Approver</b> (one), <b>Contributors</b>, <b>Informed</b>, due date, background, options with pros and cons, and the outcome.' },
    { m: 'DOC', p: 'Interests map', d: 'For each party: stated position → underlying interests → the criterion each interest becomes. Read back to each person until they say "yes, that is what I care about".' },
    { m: 'DOC', p: 'Decision criteria + weights', d: 'Signed off by the Approver <b>before</b> scoring. Each criterion has a definition, a 1–5 scale with anchors ("5 = 3× peak load with p99 &lt; 50 ms") and a weight. Must-haves are listed separately as gates.' },
    { m: 'DOC', p: 'Spike charter', d: 'Time box (e.g. 5 days), owners from <b>both camps</b>, the questions to answer, the benchmark scenario and the exit criteria. Output is evidence, not production code.' },
    { m: 'ADR', p: 'ADR-0042: Message broker for order events', d: 'Context, options, criteria and weights, matrix, sensitivity, the <b>decision</b>, <b>dissent</b> with names (with consent), consequences, and the <b>revisit trigger</b>.' },
    { m: 'POLICY', p: 'Escalation policy', d: 'When the parties cannot agree on criteria or the Approver is a party: escalate <b>together</b>, with one shared write-up of both options, to the next common manager, with a date.' }
  ],
  dataModel: [
    { name: 'decision', store: 'Decision log (ADR repo)', fields: [['decision_id', 'text', 'pk'], ['question', 'text'], ['door_type', 'one_way | two_way', 'idx'], ['approver', 'text', 'fk'], ['driver', 'text'], ['due_date', 'date', 'idx'], ['status', 'open | decided | revisit']], note: 'One row per DACI. A decision without an approver or a due date is a debate, not a decision.' },
    { name: 'criterion', store: 'Decision log', fields: [['decision_id', 'text', 'pk'], ['criterion', 'text', 'pk'], ['weight', 'numeric'], ['is_gate', 'bool'], ['scale_anchors', 'text'], ['agreed_at', 'timestamptz']], note: '<code>agreed_at</code> must be earlier than the first score: that is the guard against weights tuned to a favourite.' },
    { name: 'score', store: 'Decision log', fields: [['decision_id', 'text', 'pk'], ['option', 'text', 'pk'], ['criterion', 'text', 'pk'], ['score', 'smallint'], ['evidence_url', 'text']], note: 'Every score links to evidence (benchmark run, spike notes, vendor doc). Unsupported scores are flagged.' },
    { name: 'dissent', store: 'Decision log', fields: [['decision_id', 'text', 'fk'], ['person', 'text'], ['concern', 'text'], ['revisit_trigger', 'text'], ['committed', 'bool']], note: 'Dissent is a first-class record: it often becomes the revisit trigger.' }
  ],

  architecture: {
    title: 'From a dispute to a committed decision',
    nodes: [
      { id: 'ctr', label: 'Contributors', sub: 'SRE · data · product', kind: 'team', wide: [290, 40], tall: [70, 105], tip: 'People with expertise who give input but do not decide (DACI "C", RAPID "I").' },
      { id: 'drv', label: 'Driver', sub: 'runs the process', kind: 'person', wide: [480, 40], tall: [210, 0], tip: 'Neutral where possible. Owns the timeline, the DACI page and the meeting notes. Often a staff engineer or EM not in either camp.' },
      { id: 'esc', label: 'Eng director', sub: 'escalation path', kind: 'person', wide: [670, 40], tall: [350, 105], tip: 'The next common manager. Used only when criteria cannot be agreed or the approver is conflicted; both parties escalate together.' },
      { id: 'pa', label: 'Priya (staff)', sub: 'position: Kafka', kind: 'person', wide: [100, 150], tall: [70, 0], tip: 'Interests: replay events for analytics, headroom for 10× growth.' },
      { id: 'crit', label: 'Criteria + weights', sub: 'agreed before scores', kind: 'policy', wide: [290, 150], tall: [210, 105], tip: 'Each interest becomes a criterion with a definition, scale anchors and a weight. Signed off before any option is scored.' },
      { id: 'spike', label: 'Spike', sub: '5-day timebox', kind: 'compute', wide: [480, 150], tall: [70, 210], tip: 'Both camps build the same benchmark against both options. Evidence, not production code.' },
      { id: 'bench', label: 'Evidence', sub: 'benchmarks · notes', kind: 'store', wide: [670, 150], tall: [210, 210], tip: 'Throughput and latency runs, failure drills, ops runbook estimates. Every score links here.' },
      { id: 'pb', label: 'Marco (senior)', sub: 'position: RabbitMQ', kind: 'person', wide: [860, 150], tall: [350, 0], tip: 'Interests: low on-call burden, a skill set the team already has, per-message routing.' },
      { id: 'mx', label: 'Decision matrix', sub: 'weighted + sensitivity', kind: 'policy', wide: [480, 260], tall: [350, 210], tip: 'Weighted totals plus a check of how much any weight must move to flip the winner.' },
      { id: 'appr', label: 'Approver', sub: 'the one "D"', kind: 'person', wide: [670, 260], tall: [210, 315], tip: 'Makes the call by the due date, explains it, and owns it. Not a vote.' },
      { id: 'rep', label: 'Repair 1:1s', sub: 'disagree & commit', kind: 'person', wide: [290, 370], tall: [70, 420], tip: 'The approver or manager meets the dissenter: acknowledges what they were right about, asks for commitment, gives them a visible role.' },
      { id: 'adr', label: 'ADR', sub: 'decision + dissent', kind: 'store', wide: [480, 370], tall: [210, 420], tip: 'Context, options, matrix, decision, dissent and revisit trigger. Ends relitigation.' },
      { id: 'inf', label: 'Informed', sub: 'all eng teams', kind: 'team', wide: [670, 370], tall: [350, 420], tip: 'Told the outcome and where the ADR lives, so the debate does not restart in other channels.' }
    ],
    edges: [
      { from: 'drv', to: 'pa', bend: 0.15 },
      { from: 'drv', to: 'pb', bend: -0.15 },
      { from: 'ctr', to: 'crit' },
      { from: 'pa', to: 'crit' },
      { from: 'pb', to: 'bench' },
      { from: 'drv', to: 'crit' },
      { from: 'crit', to: 'spike' },
      { from: 'spike', to: 'bench' },
      { from: 'crit', to: 'mx' },
      { from: 'bench', to: 'mx' },
      { from: 'mx', to: 'appr' },
      { from: 'drv', to: 'esc', dashed: true, label: 'escalate' },
      { from: 'esc', to: 'appr', dashed: true, bend: 0.35 },
      { from: 'appr', to: 'adr' },
      { from: 'adr', to: 'inf' },
      { from: 'adr', to: 'rep' },
      { from: 'rep', to: 'pa', dashed: true, bend: -0.2 }
    ]
  },

  scenarios: [
    {
      id: 'daci', title: 'Kafka vs RabbitMQ, done well', tone: 'ok',
      steps: [
        { text: 'An EM outside both camps becomes <b>Driver</b> and names the VP of Platform as <b>Approver</b>, with a due date in 2 weeks. It is a <b>one-way door</b>: event schemas and consumers will depend on it.', nodes: ['drv', 'appr'], badges: { appr: 'due in 2 wks' } },
        { text: 'The driver asks each engineer <b>why</b>. Priya: replay for analytics, 10× growth. Marco: on-call load, team skills, routing. Positions become <b>interests</b>.', flow: [['drv>pa', 'drv>pb']], badges: { pa: 'replay · scale', pb: 'ops · skills' } },
        { text: 'Interests become five <b>criteria with weights</b>, agreed with contributors and signed off <b>before</b> anyone scores an option.', flow: [['pa>crit', 'ctr>crit', 'drv>crit']], ok: ['crit'], badges: { crit: 'locked' } },
        { text: 'A <b>5-day spike</b>: one engineer from each camp runs the same benchmark and failure drill on both brokers. Scores link to evidence.', flow: ['crit>spike', 'spike>bench', 'pb>bench'], badges: { spike: 'day 5/5' } },
        { text: 'The matrix ranks the options, and the <b>sensitivity check</b> shows the winner survives a 15-point weight change. The approver decides; the ADR records Marco\'s dissent and a revisit trigger.', flow: [['crit>mx', 'bench>mx'], 'mx>appr', 'appr>adr', 'adr>inf'], ok: ['appr', 'adr'], badges: { mx: ['robust ±15', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'hippo', title: 'HiPPO and decision by attrition', tone: 'err',
      steps: [
        { text: 'No driver, no approver, no deadline. Both engineers restate <b>positions</b> in four meetings and a 90-message thread.', nodes: ['pa', 'pb'], warn: ['pa', 'pb'], badges: { pa: '"Kafka!"', pb: '"Rabbit!"' } },
        { text: 'Criteria are never agreed, so each side quotes the benchmarks that favour it. Evidence becomes ammunition.', nodes: ['bench'], warn: ['bench'], badges: { bench: ['cherry-picked', 'warn'] } },
        { text: 'After 5 weeks the director, tired of it, picks the option the more senior engineer wants. That is <b>HiPPO</b> plus <b>attrition</b>: the stamina won, not the argument.', flow: ['esc>appr'], err: ['esc'], badges: { esc: ['by rank', 'err'] } },
        { text: 'Marco never commits. Every production issue restarts the debate ("this would not happen with RabbitMQ"). Six months later, a partial migration back: <b>rework</b>.', nodes: ['pb', 'adr'], err: ['pb', 'adr'], badges: { pb: ['no commit', 'err'], adr: ['no ADR', 'err'] }, tone: 'err' }
      ]
    },
    {
      id: 'twoway', title: 'Two-way door: decide in a day', tone: 'info',
      steps: [
        { text: 'A smaller fight: which JSON library to use in a new service. Swapping it later is a one-file change: a <b>two-way door</b>.', nodes: ['pa', 'pb'], badges: { pb: 'reversible' } },
        { text: 'Bezos (2016 letter): reversible decisions "can use a <b>light-weight process</b>". The owning team\'s tech lead is the approver, criteria are implicit, no spike.', nodes: ['appr'], ok: ['appr'] },
        { text: 'Decide today, note it in two lines in the service README, and set a <b>revisit trigger</b>: "if p99 serialisation &gt; 2 ms, reconsider".', flow: ['appr>adr'], ok: ['adr'], badges: { adr: ['1 day', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'escalate', title: 'Escalation done well (under deadline pressure)', tone: 'warn',
      steps: [
        { text: 'A launch is 6 weeks away. The parties <b>cannot agree on criteria</b>: Priya will not weight on-call load; Marco says throughput above today\'s needs is speculative.', nodes: ['crit'], warn: ['crit'], badges: { crit: ['stuck', 'warn'] }, tone: 'warn' },
        { text: 'The driver escalates <b>with both engineers</b>, using one shared page: both options, the disputed weights, and the date a decision is needed. No side channels.', flow: ['drv>esc'], badges: { esc: 'joint brief' } },
        { text: 'The director does not pick a broker. She sets the <b>missing priority</b> ("operability beats headroom for the next 18 months") and hands the decision back.', flow: ['esc>appr'], ok: ['esc'], badges: { appr: 'weights set' } },
        { text: 'With weights settled the matrix decides in a day. Escalation clarified <b>context</b>; it did not overrule the experts.', flow: ['crit>mx', 'mx>appr', 'appr>adr'], ok: ['mx', 'adr'], tone: 'ok' }
      ]
    },
    {
      id: 'repair', title: 'Disagree, commit, and repair', tone: 'ok',
      steps: [
        { text: 'The decision goes against Marco. The approver tells him <b>first, in private</b>, before the announcement, and explains the deciding criteria.', flow: ['appr>adr', 'adr>rep'], badges: { rep: '1:1 first' } },
        { text: 'His concern (on-call load) is written into the ADR as a <b>consequence and revisit trigger</b>: "if broker pages exceed 2/week for a quarter, reopen".', nodes: ['adr'], ok: ['adr'], badges: { adr: 'dissent logged' } },
        { text: 'He is given a visible role: owning the Kafka runbooks and alerting. People commit more easily to what they help shape.', flow: ['rep>pa'], ok: ['pb'], badges: { pb: ['commits', 'ok'] } },
        { text: 'A month later the two pair on a design review. The relationship survived because the <b>process was fair</b>, even if the outcome was not his first choice.', nodes: ['pa', 'pb'], ok: ['pa', 'pb'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'The same Kafka vs RabbitMQ dispute, handled four different ways. Each control is a real choice the driver or manager makes. Meter values are <em>illustrative</em>, built from the reasoning in Thomas–Kilmann, Fisher &amp; Ury and the Bezos letters, not from a study.',
    controls: [
      { id: 'mode', label: 'Dominant conflict mode', type: 'seg', value: 'collab', options: [
        { v: 'compete', l: 'Competing', hint: 'assertive, uncooperative' }, { v: 'collab', l: 'Collaborating', hint: 'assertive, cooperative' }, { v: 'compro', l: 'Compromising', hint: 'middle' }, { v: 'avoid', l: 'Avoiding', hint: 'neither' }, { v: 'accom', l: 'Accommodating', hint: 'cooperative, unassertive' }] },
      { id: 'fw', label: 'Decision framework', type: 'seg', value: 'daci', options: [
        { v: 'none', l: 'None' }, { v: 'consensus', l: 'Full consensus' }, { v: 'daci', l: 'DACI with one approver' }, { v: 'escalate', l: 'Escalate to manager' }] },
      { id: 'ev', label: 'Evidence', type: 'seg', value: 'spike', options: [
        { v: 'opinion', l: 'Opinions' }, { v: 'spike', l: 'Spike + benchmark' }] },
      { id: 'door', label: 'Door type', type: 'seg', value: 'one', options: [
        { v: 'one', l: 'One-way (irreversible)' }, { v: 'two', l: 'Two-way (reversible)' }] }
    ],
    evaluate(s) {
      const c = (x) => Math.max(0, Math.min(1, x));
      const M = { compete: [0.6, 0.45, 0.25, 0.35], collab: [0.45, 0.85, 0.85, 0.85], compro: [0.7, 0.5, 0.65, 0.55], avoid: [0.15, 0.3, 0.5, 0.3], accom: [0.8, 0.45, 0.7, 0.5] }[s.mode];
      const F = { none: [-0.25, -0.1, -0.1, -0.2], consensus: [-0.3, 0, 0.05, 0.15], daci: [0.2, 0.1, 0.05, 0.1], escalate: [0.1, -0.05, -0.15, -0.15] }[s.fw];
      const spike = s.ev === 'spike', one = s.door === 'one';
      let speed = M[0] + F[0] - (spike ? (one ? 0.08 : 0.2) : 0) + (one ? 0 : 0.1);
      let quality = M[1] + F[1] + (spike ? 0.2 : -0.1) - (one && !spike ? 0.1 : 0);
      let rel = M[2] + F[2] + (spike ? 0.05 : -0.05);
      let commit = M[3] + F[3] + (spike ? 0.08 : -0.05);
      [speed, quality, rel, commit] = [speed, quality, rel, commit].map(c);
      const rework = c((1 - quality) * (one ? 0.9 : 0.4) + (1 - commit) * 0.4);
      const days = Math.round((one ? 14 : 3) * (1.6 - speed) * (spike && !one ? 1.4 : 1));
      const lvl = (x) => (x >= 0.7 ? 'high' : x >= 0.45 ? 'medium' : 'low');
      const metrics = [
        { k: 'Decision speed', v: '≈ ' + days + ' days', s: speed, hint: 'illustrative' },
        { k: 'Decision quality', v: lvl(quality), s: quality },
        { k: 'Relationship health', v: lvl(rel), s: rel },
        { k: 'Commitment after', v: lvl(commit), s: commit },
        { k: 'Rework risk', v: lvl(rework), s: 1 - rework }
      ];
      const notes = [];
      if (s.mode === 'compete') notes.push('<b>Competing</b> is right for emergencies or unpopular-but-necessary calls (Thomas–Kilmann). Between peers on a design choice it produces a winner and a loser who does not commit.');
      if (s.mode === 'avoid') notes.push('<b>Avoiding</b> postpones the choice; the dispute resurfaces in code reviews and incidents. Fine only for trivial or not-yet-ripe issues.');
      if (s.mode === 'accom') notes.push('<b>Accommodating</b> is fast and kind, but if the person who gave in had the better case, quality pays. Use it when the issue matters much more to the other side.');
      if (s.mode === 'compro') notes.push('<b>Compromising</b> on architecture often means "both brokers": twice the ops load. Split the difference on <i>scope or timing</i>, not on the technology.');
      if (s.mode === 'collab') notes.push('<b>Collaborating</b> looks for an option that satisfies both sets of interests. It costs time, so reserve it for decisions that matter.');
      if (s.fw === 'consensus') notes.push('Full consensus gives every participant a veto. The IETF uses <b>rough consensus</b> instead: all issues addressed, not necessarily accommodated (RFC 7282).');
      if (s.fw === 'none') notes.push('With no named decider, the outcome is set by <b>attrition</b> or rank. Name a driver and one approver with a date.');
      if (s.fw === 'escalate') notes.push('Escalating the <i>choice</i> takes it away from the experts. Escalate to get a <b>missing priority</b> set, then let the approver decide.');
      if (!spike && one) notes.push('A one-way door decided on opinions: run a <b>time-boxed spike</b> so scores are evidence, not seniority.');
      if (spike && !one) notes.push('A spike for a reversible choice costs more than being wrong: just try it and <b>revisit with data</b>.');
      let verdict;
      if (s.fw === 'none' && (s.mode === 'compete' || s.mode === 'avoid')) verdict = '❌ <b>Decision by attrition.</b> No owner, no deadline, and a mode that either fights or hides. Expect HiPPO and rework.';
      else if (!one && s.fw === 'consensus') verdict = '⚠ <b>Process heavier than the door.</b> A reversible choice does not need everyone\'s agreement. Let the owner decide.';
      else if (one && !spike) verdict = '⚠ <b>One-way door on opinions.</b> Add a spike and a weighted matrix before committing.';
      else if (s.fw === 'daci' && s.mode === 'collab' && spike) verdict = '✅ <b>Collaborate on interests, decide with one approver, score with evidence.</b> Slower to start, rarely reopened.';
      else if (s.fw === 'daci' && !one && !spike) verdict = '✅ <b>Right-sized:</b> two-way door, named owner, quick call, revisit with data.';
      else if (s.fw === 'escalate') verdict = '👍 <b>Escalation can unblock,</b> but use it to set priorities, not to have the manager pick the technology.';
      else verdict = '👍 <b>Workable.</b> Check the notes: mode and process are not perfectly matched to the door type.';
      const badges = {};
      badges.appr = s.fw === 'none' ? ['nobody', 'err'] : s.fw === 'consensus' ? ['everyone', 'warn'] : s.fw === 'escalate' ? ['director', 'warn'] : ['one D', 'ok'];
      if (!spike) badges.bench = ['opinions', 'warn'];
      const flow = spike ? ['drv>pa', 'pa>crit', 'crit>spike', 'spike>bench', 'bench>mx', 'mx>appr', 'appr>adr'] : ['drv>pa', 'pa>crit', 'crit>mx', 'mx>appr', 'appr>adr'];
      if (s.fw === 'escalate') flow.splice(1, 0, 'drv>esc', 'esc>appr');
      return {
        metrics, verdict, notes: notes.slice(0, 4), badges, flow,
        hide: spike ? [] : ['spike'],
        labels: { appr: { label: { none: 'No approver', consensus: 'Everyone', daci: 'Approver', escalate: 'Director decides' }[s.fw], sub: one ? 'one-way door' : 'two-way door' } },
        err: s.fw === 'none' ? ['appr'] : [], warn: !spike && one ? ['bench'] : [], ok: s.fw === 'daci' ? ['appr'] : []
      };
    }
  },

  widget: {
    title: 'Kafka vs RabbitMQ: resolve it with interests, weights and a spike',
    caption: 'Step 1: ask each engineer why. Step 2: agree weights <b>before</b> seeing scores, then lock them. Step 3: run the time-boxed spike to fill the scores. The weighted matrix picks the winner, the sensitivity bars show how far each weight would have to move to flip it, and the outcome is written as an ADR. Scores are <em>illustrative</em>.'
  },

  realWorld: {
    intro: 'The ideas come from negotiation research, organisational psychology and a few companies that wrote down how they decide. Every item links to its source.',
    timeline: [
      { when: '1970s', who: 'Kenneth Thomas & Ralph Kilmann', title: 'Five conflict-handling modes', text: 'The Thomas–Kilmann instrument places behaviour on two axes, <b>assertiveness</b> (satisfying your own concerns) and <b>cooperativeness</b> (satisfying the other person\'s), giving competing, collaborating, compromising, avoiding and accommodating. It uses 30 forced-choice pairs. <b>No mode is "best"</b>; each fits some situations.', src: 0 },
      { when: '1981', who: 'Roger Fisher & William Ury', title: '<i>Getting to Yes</i> (Harvard Negotiation Project)', text: 'Principled negotiation: separate the people from the problem, focus on <b>interests not positions</b>, invent options for mutual gain, insist on <b>objective criteria</b>, and know your <b>BATNA</b>. Later editions (1991, 2011) added Bruce Patton.', src: 1 },
      { when: '1999', who: 'Amy Edmondson', title: 'Psychological safety and learning behaviour', text: 'In <i>Administrative Science Quarterly</i>, team psychological safety is "a shared belief held by members of a team that the team is safe for interpersonal risk taking". In a study of <b>51 work teams</b>, it predicted learning behaviour, which in turn predicted performance.', src: 2 },
      { when: '2006', who: 'Bain & Company', title: 'RAPID: "Who has the D?"', text: 'Rogers and Blenko assign <b>Recommend, Agree, Perform, Input, Decide</b>. The "D" is a single point of accountability; the veto-holding "A" should be used sparingly, and a vetoer must propose an alternative or escalate.', src: 3 },
      { when: '2014', who: 'IETF (Pete Resnick)', title: 'RFC 7282: rough consensus', text: '"We reject: kings, presidents and voting. We believe in: rough consensus and running code." Rough consensus means <b>all issues are addressed, not necessarily accommodated</b>; counting heads is not consensus.', src: 4 },
      { when: '2015', who: 'Google re:Work', title: 'Project Aristotle', text: 'Google studied what makes its teams effective and named five dynamics: <b>psychological safety</b>, dependability, structure &amp; clarity, meaning and impact. Psychological safety was "far and away the most important", underpinning the other four.', src: 5 },
      { when: '2016', who: 'Jeff Bezos (2015 letter)', title: 'Type 1 and Type 2 decisions', text: 'Some decisions are <b>one-way doors</b>, consequential and irreversible, and deserve slow, careful deliberation. Most are <b>two-way doors</b> and should be made quickly by small groups. Large companies tend to use the heavy process for everything.', src: 6 },
      { when: '2017', who: 'Jeff Bezos (2016 letter)', title: '"Disagree and commit"', text: '"Never use a one-size-fits-all decision-making process." The letter asks for high-velocity decisions and describes <b>disagree and commit</b>: Bezos backed an Amazon Studios show he doubted, saying he disagreed and committed.', src: 7 },
      { when: 'Ongoing', who: 'Atlassian', title: 'DACI play in the Team Playbook', text: 'Free template: a <b>Driver</b> moves the decision, one <b>Approver</b> makes it, <b>Contributors</b> give expertise, the <b>Informed</b> hear the outcome. The page is titled with the question being answered.', src: 8 }
    ],
    lessons: [
      '<b>Name the decider first.</b> Bain, Atlassian and Amazon all converge on one accountable person, not a vote.',
      '<b>Interests, then criteria, then options.</b> Fisher and Ury\'s objective criteria map directly onto a weighted matrix.',
      '<b>Match process weight to reversibility.</b> Heavy process on two-way doors is a cost Bezos explicitly warns about.',
      '<b>Safety precedes honest dissent.</b> Without it, disagreement goes underground and "commit" is fake.'
    ],
    sources: [
      { title: 'Kilmann & Thomas: Developing a forced-choice measure of conflict-handling behavior: the "MODE" instrument', url: 'https://kilmanndiagnostics.com:443/wp-content/uploads/2018/07/Kilmann-Thomas-Validating-TKI.pdf', pub: 'Kilmann Diagnostics (paper, 1977)' },
      { title: 'Getting to Yes (tag archive)', url: 'https://www.pon.harvard.edu/tag/getting-to-yes', pub: 'Program on Negotiation, Harvard Law School' },
      { title: 'Psychological Safety and Learning Behavior in Work Teams', url: 'https://dash.harvard.edu/entities/publication/13a7b031-0fdd-45ec-a7e0-2b80e2bc679f', pub: 'Edmondson · Administrative Science Quarterly 44(2), 1999' },
      { title: 'Who has the D? How clear decision roles enhance organizational performance', url: 'https://www.bain.com/insights/who-has-the-d', pub: 'Bain & Company (Rogers & Blenko)' },
      { title: 'RFC 7282: On Consensus and Humming in the IETF', url: 'https://www.rfc-editor.org/rfc/rfc7282.html', pub: 'IETF, P. Resnick, June 2014' },
      { title: 'Guide: Understand team effectiveness', url: 'https://rework.withgoogle.com/en/guides/understanding-team-effectiveness', pub: 'Google re:Work' },
      { title: 'Jeff Bezos: There are two types of decisions to make and don\'t confuse them', url: 'https://www.businessinsider.in/jeff-bezos-there-are-two-types-of-decisions-to-make-and-dont-confuse-them/articleshow/51706758.cms', pub: 'Business Insider, April 2016 (quotes the 2015 letter)' },
      { title: '2016 Letter to Shareholders', url: 'https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders', pub: 'Amazon (published April 2017)' },
      { title: 'DACI decision-making framework', url: 'https://www.atlassian.com/team-playbook/plays/daci', pub: 'Atlassian Team Playbook' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Who decides', '<b>Consensus</b>: everyone agrees; strong buy-in, slow, gives everyone a veto', '<b>One approver</b> (DACI / RAPID "D"): fast, clear accountability, needs trust in the process', 'One approver almost always; <b>consent</b> ("no reasoned objection") or rough consensus for standards that bind many teams'],
      ['Evidence', '<b>Expert judgement</b>: minutes, cheap, biased by experience and rank', '<b>Spike / benchmark</b>: days, costs engineer time, produces shared facts', 'Spike for one-way doors and when the dispute is about a measurable claim ("it cannot do 50k msg/s")'],
      ['Process weight', '<b>Light</b>: owner decides, two lines in a README', '<b>Heavy</b>: DACI page, criteria sign-off, spike, ADR, review', 'By door type: light for two-way, heavy for one-way. Never one size for all (Bezos)'],
      ['Conflict mode', '<b>Collaborating</b>: best outcomes, most time and energy', '<b>Compromising / accommodating</b>: fast, may lose quality', 'Collaborate when both interests matter and the stakes are high; accommodate when it matters far more to them'],
      ['Escalation', '<b>Resolve at team level</b>: preserves autonomy, can stall', '<b>Escalate</b>: unblocks quickly, risks overruling experts', 'Escalate jointly, with a shared write-up, when <b>priorities</b> conflict or the deadline is at risk']
    ]
  },

  failures: [
    { f: 'HiPPO decides', detect: 'Decision matches the most senior opinion regardless of evidence; juniors stop speaking in reviews', fix: 'Separate Driver and Approver from rank; require criteria and scores before the approver speaks; leaders speak last.' },
    { f: 'Design by committee', detect: 'Every option gets a "yes, and"; result combines both (two brokers, two ORMs)', fix: 'One approver. Use consent ("any reasoned objection?") instead of unanimous agreement.' },
    { f: 'Endless debate / decision by attrition', detect: 'No due date; same arguments in meetings 3, 4 and 5; thread length grows', fix: 'Time-box: a date for the decision and a time box for the spike. If missed, the approver decides on current evidence.' },
    { f: 'Weights tuned to the favourite', detect: 'Criteria change after scores appear; weights land exactly where the preferred option wins', fix: 'Lock criteria and weights (timestamp) before scoring; run a sensitivity check and publish it.' },
    { f: 'Fake commitment', detect: '"I told you so" in incident channels; quiet workarounds; reopened RFCs with no new evidence', fix: 'Record dissent and a revisit trigger in the ADR; private 1:1 before the announcement; give the dissenter an owning role.' },
    { f: 'Escalation as a weapon', detect: 'One party goes to the manager alone; the other learns of the decision second-hand', fix: 'Escalation policy: escalate together, with one shared document, and ask for priorities, not a verdict.' },
    { f: 'Low psychological safety', detect: 'Disagreement only in private messages; retros are silent; people agree in the meeting and complain after', fix: 'Leaders invite dissent explicitly, thank people for it, and model "I was wrong". Measure with a team survey.' }
  ],

  interview: [
    { q: 'Two senior engineers disagree on Kafka vs RabbitMQ. Walk me through how you resolve it.', a: '<p>First check the <b>door type</b>: a broker for core events is close to one-way, so it deserves real process. Then: <ol><li>Name a neutral <b>Driver</b>, one <b>Approver</b> and a due date (DACI).</li><li>Ask each engineer <b>why</b> to turn positions into interests (replay, scale vs on-call load, skills, routing).</li><li>Agree <b>criteria and weights before scoring</b>, plus any must-have gates.</li><li>Run a <b>time-boxed spike</b> with one person from each camp on the same benchmark.</li><li>Score, compute the weighted matrix, run a <b>sensitivity check</b>.</li><li>Approver decides; ADR records the decision, dissent and a revisit trigger; a private 1:1 with the person who lost.</li></ol></p>', fu: 'What if the matrix result is within the noise? (Then it does not matter much which one you pick: decide quickly on a tie-breaker such as team skill, and move on.)', lvl: 'core' },
    { q: 'Name the Thomas–Kilmann conflict modes and when each is appropriate.', a: '<p>Two axes, <b>assertiveness</b> and <b>cooperativeness</b> (Thomas &amp; Kilmann, 1970s):</p><ul><li><b>Competing</b> (high/low): emergencies, security fixes, unpopular but necessary calls.</li><li><b>Collaborating</b> (high/high): important decisions where both sets of concerns must be met.</li><li><b>Compromising</b> (medium): time pressure, equal power; split scope or timing, not architecture.</li><li><b>Avoiding</b> (low/low): trivial issues, or when emotions need to cool first.</li><li><b>Accommodating</b> (low/high): it matters more to them, or you are wrong.</li></ul><p>The misreading is that collaborating is always best: it is the most expensive mode.</p>', lvl: 'core' },
    { q: 'What is the difference between a position and an interest? Give a technical example.', a: '<p>From Fisher &amp; Ury\'s <i>Getting to Yes</i> (1981). A <b>position</b> is what someone demands; an <b>interest</b> is why. "We must use Kafka" is a position; "analytics needs to replay 30 days of events" is an interest. Interests are often compatible even when positions are not: RabbitMQ Streams or a separate archive might meet the replay interest. Interests become <b>criteria</b> in the decision matrix.</p>', lvl: 'core' },
    { q: 'DACI vs RAPID vs RACI: what is the difference?', a: '<p><b>DACI</b> (originated at Intuit, popularised by Atlassian): Driver, Approver, Contributors, Informed; built for a single decision. <b>RAPID</b> (Bain, 2006): Recommend, Agree (a sparing veto), Perform, Input, Decide; one "D". <b>RACI</b> is for ongoing <i>tasks</i> (Responsible, Accountable, Consulted, Informed), not decisions. All three insist on <b>exactly one</b> accountable decider.</p>', lvl: 'core' },
    { q: 'Explain one-way and two-way doors. How does that change your process?', a: '<p>Bezos\'s 2015 letter: <b>Type 1</b> decisions are consequential and irreversible or nearly so; make them slowly and carefully. <b>Type 2</b> are reversible; make them fast, by individuals or small groups. The 2016 letter: "never use a one-size-fits-all decision-making process". In practice: a broker, a primary datastore or a public API gets DACI, a spike and an ADR; a library or a feature-flagged UI choice gets the owner\'s call today. You can also <b>turn a one-way door into a two-way door</b>, for example by putting the broker behind an interface or an outbox.</p>', lvl: 'core' },
    { q: 'Why agree criteria and weights before scoring options?', a: '<p>Because people (rationally) pick weights that make their favourite win once they see the scores. Locking weights first keeps the discussion on <b>priorities</b>, where the real disagreement usually is. Then a <b>sensitivity analysis</b> (how far a weight must move to flip the result) shows whether the remaining disagreement matters: if the winner only changes with a 30-point swing, stop debating.</p>', fu: 'How do you handle must-haves? (As gates, before weighting: an option that fails a gate is out, however high it scores elsewhere.)', lvl: 'deep' },
    { q: 'What does "disagree and commit" mean, and how is it misused?', a: '<p>Bezos (2016 letter): voice disagreement fully, then once a decision is made, support it as if it were yours. Misuses: a leader using it to <b>skip the listening</b> part ("disagree and commit" as a command), or applying it before the dissenter has been heard. It only works with a fair process, a recorded dissent and a <b>revisit trigger</b>, so commitment is to a decision, not to silence.</p>', lvl: 'core' },
    { q: 'What is psychological safety, and what is the evidence for it?', a: '<p>Amy Edmondson (1999): "a shared belief held by members of a team that the team is safe for interpersonal risk taking". In 51 teams it predicted <b>learning behaviour</b>, which predicted performance. Google\'s Project Aristotle (re:Work, 2015) found it was the most important of five team dynamics. It is not "being nice": it is being able to say "I think this design is wrong" without penalty, which is what makes technical conflict productive.</p>', lvl: 'core' },
    { q: 'Tell me about a time you resolved a technical disagreement between senior engineers.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: two staff engineers had argued for three weeks over Kafka vs RabbitMQ for a new order-events pipeline; a launch was 10 weeks out. <b>Task</b>: as the architect, get a decision both would back within two weeks. <b>Action</b>: I wrote a DACI page with the VP of Platform as approver and a date; ran 1:1s to surface interests (replay and growth vs on-call load and team skill); agreed five weighted criteria with SRE and data before any scoring; ran a 5-day spike with one engineer from each side on the same 20k msg/s benchmark and a broker-failure drill. <b>Result</b>: Kafka (managed) won by 0.4 points and stayed ahead under any ±15-point weight change; the RabbitMQ advocate\'s on-call concern became the revisit trigger in the ADR and he owned the alerting. We hit the launch, and the debate did not reopen.', lvl: 'deep' },
    { q: 'Tell me about a time you disagreed with a decision and committed anyway.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: our director chose a single shared Postgres cluster for four services; I had argued for database-per-service. <b>Task</b>: make the decision succeed without relitigating it. <b>Action</b>: I stated my concern once, in writing, with the specific risk (cross-team schema coupling) and asked for a revisit trigger: "more than two cross-service schema changes a month". Then I wrote the schema-ownership conventions and a CI check that blocked cross-schema joins. <b>Result</b>: the trigger never fired in 18 months; the CI check caught 11 violations; the director later asked me to lead the next data-platform decision.', lvl: 'core' },
    { q: 'Tell me about a time a conflict damaged a working relationship, and how you repaired it.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: after I pushed hard for gRPC in a design review, a senior engineer who preferred REST stopped reviewing my PRs. <b>Task</b>: restore a working relationship on a team of six. <b>Action</b>: I asked for a 1:1, acknowledged that I had argued in public in a way that made it feel personal, and asked what I had missed. His real interest was browser clients and debuggability; we agreed a gRPC-Gateway JSON facade, and I asked him to own its design. <b>Result</b>: reviews resumed within a week; the facade served 3 browser apps; we co-presented the API guidelines a quarter later.', lvl: 'deep' },
    { q: 'When should you escalate a technical disagreement, and how?', a: '<p>Escalate when <b>priorities</b> conflict (and only someone above can set them), when the deadline is at risk, or when the approver is a party. Do it <b>jointly</b>: both parties, one shared write-up of the options and the disputed trade-off, and the date a decision is needed. Ask the manager to set the <b>missing priority</b>, not to pick the technology. Never escalate alone; it destroys trust even when you are right.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Python: weighted decision matrix with sensitivity analysis', lang: 'python',
      code: `from dataclasses import dataclass

@dataclass(frozen=True)
class Criterion:
    name: str
    weight: float  # agreed BEFORE scores are seen

def totals(crit: list[Criterion], scores: dict[str, dict[str, float]]) -> dict[str, float]:
    w = sum(c.weight for c in crit)
    return {opt: sum(c.weight * s[c.name] for c in crit) / w for opt, s in scores.items()}

def flip_delta(crit, scores, win: str, other: str, name: str) -> float | None:
    """Weight change on one criterion (others fixed) that makes win and other tie."""
    margin = sum(c.weight * (scores[win][c.name] - scores[other][c.name]) for c in crit)
    d = scores[win][name] - scores[other][name]
    if d == 0:
        return None                      # this weight cannot change the order
    delta = -margin / d
    w = next(c.weight for c in crit if c.name == name)
    return delta if w + delta >= 0 else None   # weights cannot go negative

crit = [Criterion("throughput", 25), Criterion("replay", 25), Criterion("routing", 15),
        Criterion("ops_burden", 20), Criterion("team_skill", 15)]
scores = {"kafka":    {"throughput": 5, "replay": 5, "routing": 2, "ops_burden": 2, "team_skill": 2},
          "rabbitmq": {"throughput": 3, "replay": 3, "routing": 5, "ops_burden": 4, "team_skill": 5}}

t = totals(crit, scores)
win, other = sorted(t, key=t.get, reverse=True)
print({k: round(v, 2) for k, v in t.items()}, "winner:", win)
for c in crit:
    d = flip_delta(crit, scores, win, other, c.name)
    print(f"{c.name:11} {'cannot flip' if d is None else f'flips at {d:+.0f} pts'}")`,
      note: 'With these illustrative scores RabbitMQ wins 3.80 to 3.50; raising "replay" by 15 points flips it. A flip under ~10 points means the decision is about weights, so go back and agree them.'
    },
    {
      title: 'YAML: DACI record for the broker decision', lang: 'yaml',
      code: `# decisions/2026-11-broker.daci.yaml  (rendered into the Confluence DACI page)
question: "Which message broker do we use for order events?"
door: one-way            # consumers and schemas will depend on it
due: 2026-11-25
driver: em.lena          # outside both camps; runs the process
approver: vp.platform    # exactly one
contributors: [priya.staff, marco.senior, sre.oncall-lead, data.analytics-lead]
informed: [eng-all, product-orders]
gates:                   # must-haves; fail one and the option is out
  - "Managed offering available in eu-west-1"
  - "At-least-once delivery with consumer acks"
criteria:                # agreed and locked before scoring
  locked_at: 2026-11-12T16:00:00Z
  items:
    - { name: throughput, weight: 25, anchor: "5 = 3x peak (60k msg/s) with p99 < 50 ms" }
    - { name: replay,     weight: 25, anchor: "5 = replay 30 days by offset or timestamp" }
    - { name: routing,    weight: 15, anchor: "5 = per-message routing without code" }
    - { name: ops_burden, weight: 20, anchor: "5 = < 1 page/month in the spike drill" }
    - { name: team_skill, weight: 15, anchor: "5 = 3+ engineers have run it in prod" }
spike:
  timebox_days: 5
  owners: [priya.staff, marco.senior]   # one from each camp
  evidence: "https://wiki.example.com/spikes/broker-2026-11"
escalation: "If criteria not locked by 2026-11-14, Driver and both parties escalate jointly to Director, Platform."`,
      note: 'Keep the file next to the ADR. The <code>locked_at</code> timestamp is what proves the weights were agreed before scoring.'
    },
    {
      title: 'ADR template recording the decision and the dissent', lang: 'bash',
      code: `# ADR-0042: Message broker for order events

Status: Accepted (2026-11-24)   Approver: vp.platform   Driver: em.lena
Door type: one-way (mitigated: producers publish via an outbox + Broker port)

## Context
Order events must reach 6 consumers; analytics needs 30-day replay;
current peak 20k msg/s, plan for 3x. On-call is 4 engineers.

## Options considered
1. Managed Kafka     2. RabbitMQ (quorum queues + Streams)

## Criteria (locked 2026-11-12) and results
| Criterion  | Weight | Kafka | RabbitMQ | Evidence        |
|------------|--------|-------|----------|-----------------|
| throughput |   25   |   5   |    3     | spike run #3    |
| replay     |   25   |   5   |    3     | spike notes s.2 |
| ...        |        |       |          |                 |
Weighted: Kafka 3.9, RabbitMQ 3.5. Winner holds under any +/-15 pt weight change.

## Decision
We will use managed Kafka for order events.

## Dissent (recorded with consent)
marco.senior: on-call load and team skill are under-weighted for an
18-month horizon. Commits to the decision; owns alerting and runbooks.

## Consequences and revisit trigger
+ Replay and headroom. - New skill for on-call; training budget approved.
Revisit if broker pages > 2/week for a full quarter, or cost > 1.5x estimate.`,
      note: 'Markdown, following Michael Nygard\'s ADR format with two additions: a <b>Dissent</b> section and an explicit <b>revisit trigger</b>. Both end relitigation without silencing anyone.'
    }
  ],

  related: ['rfcs-adrs', 'stakeholder-communication', 'build-vs-buy', 'conways-law', 'quality-attributes', 'sd:message-queue']
});
