(function () {
/* Illustrative Brooks model shared by the calculator and the knobs.
   n veterans, k hires added at week `start`; hires ramp linearly 0 → 1 over R weeks and each
   costs m of a mentor's time while ramping; every person loses c of their week per other person
   (communication overhead, n(n−1)/2 paths). Returns weeks to burn down W person-weeks. */
function brooks(n, k, R, m, W, start, c) {
  c = c == null ? 0.02 : c; start = start || 0;
  let t = 0, left = W; const dt = 0.1;
  while (left > 0 && t < 520) {
    const on = t >= start && k > 0, N = n + (on ? k : 0);
    const eff = Math.max(0, 1 - c * (N - 1));
    const r = on ? Math.min(1, (t - start) / Math.max(R, 0.01)) : 0;
    const thr = n * eff + (on ? k * r * eff - k * m * (1 - r) : 0);
    left -= Math.max(0, thr) * dt; t += dt;
  }
  return t;
}
const paths = (n) => n * (n - 1) / 2;
const r1 = (x) => Math.round(x * 10) / 10;

SD.register({
  slug: 'socio-technical-laws',
  domain: 1,
  title: 'Socio-technical Laws',
  examples: 'Conway, Brooks, Hyrum, Goodhart',
  tagline: 'The laws about <b>people and software</b>: why adding engineers to a late project slows it down, why every observable behaviour becomes a contract, and why a metric that becomes a target stops measuring anything.',
  tldr: {
    problem: `Architects get asked to rescue late projects, to change APIs that thousands of callers use, and to "drive" teams with metrics. The intuitive moves (add people, change the undocumented bit, set a target) keep backfiring in the same ways.`,
    idea: `A handful of <b>empirical laws</b> describe those failures: <b>Brooks</b> (communication and ramp-up), <b>Hyrum</b> (implicit interfaces), <b>Goodhart / Campbell</b> (gamed measures), <b>Lehman</b> (systems in use must change and grow more complex), <b>Parkinson</b> and <b>Hofstadter</b> (estimates), and <b>Conway</b> (structure copies communication). Use them as checklists before you decide.`,
    insight: `None of these is a law of physics. Each is a <b>tendency with a mechanism</b>. Name the mechanism (paths, ramp-up, reliance on behaviour, incentive), and you can design around it: cut scope instead of adding people, randomise what you do not promise, measure a balanced set.`,
    numbers: [
      { v: '1975', l: 'Brooks\'s Law in <i>The Mythical Man-Month</i>' },
      { v: 'n(n−1)/2', l: 'communication paths: 10 people → 45, 20 → 190' },
      { v: '2019', l: 'RFC 8594: the <code>Sunset</code> HTTP header for retiring APIs' }
    ]
  },

  intro: {
    what: `Socio-technical laws are short, well-tested observations about how <b>people, organisations and software affect each other</b>. They are not about CPUs or networks; they are about teams, users, incentives and time. Each one explains a recurring surprise, such as a late project getting later after more people join, or a harmless refactor breaking a customer.`,
    analogy: {
      icon: '🍳',
      title: 'A busy restaurant kitchen',
      text: `Adding four cooks during the dinner rush does not double output: someone has to show them where things are, and the kitchen gets crowded (<b>Brooks</b>). Regulars learn that table 4 always gets extra bread, and complain loudly when it stops, even though it was never on the menu (<b>Hyrum</b>). Reward the chef for "plates out per hour" and the plates get smaller (<b>Goodhart</b>). The analogy breaks in one place: software is copied for free, so one "regular" can be ten thousand automated callers.`
    },
    problem: `A project is three weeks late. Management offers four extra engineers. They need a month to learn the code, and the people who could teach them are the ones doing the critical work. Meanwhile, the platform team "only" changed the order of a JSON list and broke two downstream teams. <b>Which of our instincts about people and change are wrong, and what do we do instead?</b>`,
    story: [
      {
        stage: 'naive', title: 'More people, more targets, free refactors',
        text: 'The obvious playbook: a late project gets more engineers, a slow team gets a target ("deploy daily"), and anything not written in the API docs can change at will.',
        scene: {
          nodes: [
            { id: 'mgr', label: 'Manager', sub: 'project is late', kind: 'person', at: [210, 0] },
            { id: 'team', label: 'Team of 6', sub: '15 paths', kind: 'team', at: [70, 110] },
            { id: 'new', label: '+4 hires', sub: 'start Monday', kind: 'person', at: [210, 110] },
            { id: 'api', label: 'Public API', sub: 'docs = contract', kind: 'service', at: [350, 110] }
          ],
          edges: [{ from: 'mgr', to: 'team' }, { from: 'mgr', to: 'new' }, { from: 'new', to: 'team' }, { from: 'mgr', to: 'api' }],
          flow: [['mgr>team', 'mgr>new'], 'new>team', 'mgr>api']
        }
      },
      {
        stage: 'breaks', title: 'Slower, gamed and broken',
        text: 'Seniors spend their days onboarding, and 10 people now have <b>45 paths</b> instead of 15. The deploy target is met by splitting commits. A reordered list breaks callers who relied on it.',
        scene: {
          nodes: [
            { id: 'mgr', label: 'Manager', sub: 'still late', kind: 'person', at: [210, 0] },
            { id: 'team', label: 'Team of 10', sub: '45 paths', kind: 'team', at: [70, 110] },
            { id: 'new', label: '+4 hires', sub: 'ramping up', kind: 'person', at: [210, 110] },
            { id: 'api', label: 'Public API', sub: 'order changed', kind: 'service', at: [350, 110] },
            { id: 'cli', label: 'Callers', sub: 'relied on order', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'mgr', to: 'team' }, { from: 'new', to: 'team', bidi: true }, { from: 'api', to: 'cli' }],
          flow: ['new>team', 'team>new', 'api>cli'],
          warn: ['team', 'new'], err: ['cli'],
          badges: { team: ['mentoring', 'warn'], cli: ['broken', 'err'] }
        }
      },
      {
        stage: 'fix', title: 'Design for the laws',
        text: 'Cut or <b>sequence scope</b> instead of adding people late. Measure a <b>balanced set</b> of metrics. Treat every observable behaviour as a possible contract: randomise what you do not promise, and <b>announce retirements</b> with dates.',
        scene: {
          nodes: [
            { id: 'mgr', label: 'Manager', sub: 'scope cut', kind: 'person', at: [210, 0] },
            { id: 'team', label: 'Team of 6', sub: 'focused', kind: 'team', at: [70, 110] },
            { id: 'api', label: 'Public API', sub: 'Sunset header', kind: 'service', at: [350, 110] },
            { id: 'cli', label: 'Callers', sub: 'migrate in time', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'mgr', to: 'team' }, { from: 'mgr', to: 'api' }, { from: 'api', to: 'cli' }],
          flow: ['mgr>team', 'mgr>api', 'api>cli'],
          ok: ['team', 'api', 'cli'],
          badges: { team: ['on time', 'ok'], cli: ['warned', 'ok'] }
        }
      }
    ],
    usedBy: ['Google (Software Engineering at Google)', 'Go language team (randomised map order)', 'IETF (Sunset header, RFC 8594)', 'DORA research programme', 'Team Topologies adopters'],
    whenToUse: [
      'Someone proposes <b>adding people</b> or changing a deadline on a late project',
      'You are changing, deprecating or versioning an API with <b>many callers</b>',
      'Leadership wants a <b>target metric</b> for teams (velocity, deploys, coverage)'
    ],
    whenNot: [
      'As a slogan to block all hiring: early, well-partitioned work <b>does</b> scale with people',
      'As a reason never to change an API: change it, with a <a href="api-design.html">versioning and deprecation policy</a>',
      'To explain team-shape problems in depth: see <a href="conways-law.html">Conway\'s Law & Team Topologies</a>'
    ],
    glossary: [
      { term: 'Brooks\'s Law', def: 'Adding manpower to a late software project makes it later (Fred Brooks, 1975).' },
      { term: 'Ramp-up', def: 'The weeks a new person needs before producing at full speed, during which they also consume mentors\' time.' },
      { term: 'Communication paths', def: 'The pairs of people who may need to coordinate: n(n−1)/2 for n people.' },
      { term: 'Hyrum\'s Law', def: 'With enough users, every observable behaviour of a system will be depended on by somebody, whatever the contract says.' },
      { term: 'Goodhart\'s Law', def: 'When a measure becomes a target, it ceases to be a good measure (Strathern\'s 1997 phrasing).' },
      { term: 'Lehman\'s laws', def: 'Laws of software evolution: a system in use must keep changing, and its complexity grows unless work is done to reduce it.' },
      { term: 'Second-system effect', def: 'Brooks: the second system an architect designs tends to be over-designed with every idea held back from the first.' },
      { term: 'Sunset header', def: 'An HTTP response header (RFC 8594) giving the date a resource is expected to stop responding.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Brooks:</b> late projects are rescued by <b>scope and sequencing</b> first; people are added early, onto separable work, with a named mentor budget',
      '<b>Communication:</b> keep teams at 5–9 people and coordinate between teams through <b>explicit interfaces</b>, so paths grow by team, not by person',
      '<b>Hyrum:</b> treat every observable behaviour (order, timing, error text, defaults) as a potential contract; <b>randomise or hide</b> what you do not promise',
      '<b>Goodhart / Campbell:</b> measure a <b>balanced set</b> (speed and stability), use metrics for learning, not for ranking teams',
      '<b>Lehman:</b> plan for <b>continuing change</b> and budget explicit work against growing complexity',
      '<b>Estimates:</b> plan with ranges and buffers (Hofstadter), and time-box with clear exit criteria (Parkinson)'
    ],
    nonFunctional: [
      'Breaking changes to a public API need a <b>deprecation window</b> (e.g. ≥ 6–12 months for external callers, rule of thumb) and a <code>Sunset</code> date',
      'Every deprecated endpoint reports <b>remaining callers</b> by client ID, trending to zero before sunset',
      'Delivery metrics reported as a <b>set</b>: throughput (lead time, deploy frequency) next to instability (change fail rate, rework)',
      'New-hire <b>time to first production change</b> measured (e.g. &lt; 2 weeks, rule of thumb)',
      '≥ 15–20% of capacity reserved for <b>complexity reduction</b> (rule of thumb; tune to your debt)',
      'Estimates carry a <b>range and confidence</b>, and actuals are compared with them each release'
    ],
    outOfScope: [
      '<b>"Throw people at it"</b> in the last month of a late project',
      '<b>Velocity or deploy count as a team target</b> tied to bonuses or rankings',
      '<b>"It wasn\'t in the docs"</b> as a reason to break thousands of callers without notice',
      '<b>The grand rewrite</b>: a second system carrying every postponed idea (second-system effect)',
      '<b>Single-point estimates</b> treated as commitments'
    ]
  },

  calculator: {
    inputs: [
      { id: 'n', label: 'Current team size', min: 2, max: 30, value: 6, unit: 'people' },
      { id: 'w', label: 'Remaining work (at full speed)', min: 10, max: 600, value: 30, unit: 'person-weeks', log: true },
      { id: 'k', label: 'New people added now', min: 0, max: 20, value: 4, unit: 'people' },
      { id: 'r', label: 'Ramp-up to full productivity', min: 1, max: 26, value: 8, unit: 'weeks' },
      { id: 'm', label: 'Mentor time lost per new hire while ramping', min: 0, max: 100, step: 5, value: 50, unit: '% of a person' }
    ],
    outputs: [
      { label: 'Finish without adding people', unit: 'weeks', f: (v) => r1(brooks(v.n, 0, v.r, v.m / 100, v.w)) },
      { label: 'Finish after adding people now', unit: 'weeks', f: (v) => r1(brooks(v.n, v.k, v.r, v.m / 100, v.w)) },
      { label: 'Difference (positive = later)', unit: 'weeks', f: (v) => r1(brooks(v.n, v.k, v.r, v.m / 100, v.w) - brooks(v.n, 0, v.r, v.m / 100, v.w)) },
      { label: 'Communication paths before → after', fmt: 'raw', f: (v) => paths(v.n) + ' → ' + paths(v.n + v.k) },
      { label: 'Steady-state output per person after (overhead 2%/path-partner)', fmt: 'pct', f: (v) => Math.max(0, 1 - 0.02 * (v.n + v.k - 1)) },
      { label: 'Verdict', fmt: 'raw', f: (v) => { const d = brooks(v.n, v.k, v.r, v.m / 100, v.w) - brooks(v.n, 0, v.r, v.m / 100, v.w); return v.k === 0 ? 'no change' : d > 0.2 ? 'Brooks wins: later' : d < -0.2 ? 'helps: earlier' : 'roughly a wash'; } }
    ],
    note: `An <em>illustrative</em> model, not Brooks\'s own maths. Each new hire ramps <b>linearly</b> from 0 to full speed over the ramp-up period and costs the set share of a mentor until then. Everyone loses <em>2% of their week per colleague</em> to coordination (an assumption), which is why paths n(n−1)/2 matter. With 6 people, 30 person-weeks left and 4 hires the finish moves <b>later</b>; at 40 it is a wash; at 120 or more, hiring clearly helps. Brooks\'s Law bites when the <b>remaining</b> work is short compared with ramp-up, and Brooks himself later called it an "outrageous oversimplification".`
  },

  api: [
    { m: 'POLICY', p: 'API deprecation policy', d: 'What counts as a breaking change (including <b>observable behaviour</b> such as ordering and error text), minimum notice per audience, the <code>Deprecation</code> / <code>Sunset</code> headers and <code>Link rel="sunset"</code>, and who signs off removal.' },
    { m: 'HTTP', p: 'Sunset: Sat, 31 Oct 2026 23:59:59 GMT', d: 'RFC 8594 header on every response from a retiring resource, plus a <code>Link</code> to the migration guide. Clients treat it as a hint; the date is your promise.' },
    { m: 'DOC', p: 'Metrics charter', d: 'For each metric: the question it answers, its <b>counter-metric</b> (deploy frequency ↔ change fail rate), who sees it, and an explicit statement that it is <b>not</b> used to rank individuals or teams.' },
    { m: 'ADR', p: 'Late-project recovery decision', d: 'Options considered (add people, cut scope, move date, split team), the Brooks model inputs (ramp-up, mentors, separable work), the choice and the date you will re-check it.' },
    { m: 'DOC', p: 'Estimate record', d: 'Range (P50 / P90), assumptions, known unknowns and the reference class used. Compared with actuals after delivery to calibrate the next one.' },
    { m: 'SLO', p: 'Evolution budget', d: 'Share of each quarter reserved for complexity reduction and dependency upgrades (Lehman II), tracked like an error budget.' }
  ],
  dataModel: [
    { name: 'api_deprecation', store: 'API catalog', fields: [['endpoint', 'text', 'pk'], ['deprecated_at', 'timestamptz'], ['sunset_at', 'timestamptz', 'idx'], ['replacement', 'text'], ['migration_doc', 'url'], ['owner_team', 'text', 'fk']], note: 'Source of truth for the <code>Deprecation</code> and <code>Sunset</code> headers.' },
    { name: 'api_caller_usage', store: 'Gateway logs → warehouse', fields: [['endpoint', 'text', 'pk'], ['client_id', 'text', 'pk'], ['day', 'date', 'pk'], ['calls', 'bigint'], ['relies_on_order', 'bool']], note: 'Who still calls a deprecated endpoint. Hyrum\'s Law means you assume each of them depends on something you never promised.' },
    { name: 'delivery_metrics', store: 'Metrics warehouse', fields: [['team', 'text', 'pk'], ['week', 'date', 'pk'], ['deploys', 'int'], ['lead_time_h_p50', 'numeric'], ['change_fail_rate', 'numeric'], ['rework_deploys', 'int']], note: 'Always viewed as a set. A rising deploy count with a rising fail rate is a Goodhart signal.' },
    { name: 'staffing_plan', store: 'Planning doc / sheet', fields: [['project', 'text', 'pk'], ['person', 'text', 'pk'], ['joined_week', 'int'], ['ramp_weeks', 'int'], ['mentor', 'text', 'fk']], note: 'Makes mentoring cost visible: a senior mentoring two hires is not a full-time contributor.' }
  ],

  architecture: {
    title: 'Where the laws act in an engineering organisation',
    nodes: [
      { id: 'est', label: 'Estimate', sub: 'Hofstadter·Parkinson', kind: 'policy', wide: [290, 40], tall: [70, 0], tip: 'Estimates are optimistic (Hofstadter) and work expands to fill the time given (Parkinson).' },
      { id: 'lead', label: 'Leadership', sub: 'dates and targets', kind: 'person', wide: [480, 40], tall: [210, 0], tip: 'Decides staffing, deadlines and what gets measured.' },
      { id: 'metric', label: 'Target metric', sub: 'Goodhart·Campbell', kind: 'policy', wide: [670, 40], tall: [350, 0], tip: 'A measure turned into a target stops measuring, and distorts the work it measures.' },
      { id: 'hires', label: 'New hires', sub: 'ramp-up weeks', kind: 'person', wide: [100, 150], tall: [70, 110], tip: 'Not productive on day one, and they consume mentors\' time.' },
      { id: 'team', label: 'Core team', sub: 'n(n−1)/2 paths', kind: 'team', wide: [290, 150], tall: [210, 110], tip: 'Coordination cost grows with the square of team size (Brooks).' },
      { id: 'dash', label: 'Dashboard', sub: 'DORA, velocity', kind: 'store', wide: [860, 150], tall: [350, 110], tip: 'Useful for learning; dangerous as a ranking.' },
      { id: 'refac', label: 'Refactoring', sub: 'Lehman II budget', kind: 'compute', wide: [100, 260], tall: [70, 220], tip: 'Complexity grows unless work is done to reduce it.' },
      { id: 'code', label: 'Codebase', sub: 'Lehman: must change', kind: 'service', wide: [290, 260], tall: [210, 220], tip: 'A system in real use must keep changing or become less useful.' },
      { id: 'v2', label: 'Rewrite v2', sub: 'second-system risk', kind: 'service', wide: [290, 370], tall: [350, 220], tip: 'Brooks: the second system tends to be over-designed.' },
      { id: 'api', label: 'Public API', sub: 'contract + behaviour', kind: 'service', wide: [480, 260], tall: [70, 330], tip: 'What callers see is more than what the docs promise.' },
      { id: 'cons', label: 'Callers', sub: 'Hyrum: rely on all', kind: 'client', wide: [670, 260], tall: [210, 330], tip: 'With enough users, every observable behaviour is depended on by somebody.' }
    ],
    edges: [
      { from: 'lead', to: 'est' },
      { from: 'lead', to: 'metric' },
      { from: 'lead', to: 'hires', dashed: true, label: 'add people' },
      { from: 'est', to: 'team' },
      { from: 'hires', to: 'team', bidi: true },
      { from: 'team', to: 'dash' },
      { from: 'metric', to: 'dash', dashed: true },
      { from: 'team', to: 'code' },
      { from: 'code', to: 'refac', bidi: true },
      { from: 'code', to: 'v2', dashed: true },
      { from: 'code', to: 'api' },
      { from: 'api', to: 'cons' }
    ]
  },

  scenarios: [
    {
      id: 'brooks', title: 'Brooks: rescuing a late project with people', tone: 'err',
      steps: [
        { text: 'Six engineers, 45 person-weeks left, deadline in 7 weeks. Leadership adds <b>four people</b> to "catch up".', flow: ['lead>hires', 'hires>team'], badges: { hires: '+4' } },
        { text: 'The hires need ~8 weeks to ramp up. Two seniors now spend <b>half their time</b> mentoring, so output drops first.', flow: ['team>hires', 'hires>team'], warn: ['team'], badges: { team: ['−2 people', 'warn'] } },
        { text: 'The team went from <b>15 to 45</b> communication paths. More meetings, more merge conflicts, more "who owns this?".', nodes: ['team'], labels: { team: { label: 'Team of 10', sub: '45 paths' } }, warn: ['team'] },
        { text: 'The finish date does not move earlier: the work left was too short to repay the ramp-up. <b>Brooks\'s Law</b> holds.', flow: ['team>code'], err: ['lead'], badges: { lead: ['still late', 'err'] }, tone: 'err' },
        { text: 'The alternative: cut scope to the must-haves, ship on time, and put new people on <b>separable</b> work for the next release.', nodes: ['est'], ok: ['team', 'code'], badges: { est: ['scope cut', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'hyrum', title: 'Hyrum: a "harmless" change breaks callers', tone: 'warn',
      steps: [
        { text: 'The API returns orders from a hash map. The docs say <b>"order is unspecified"</b>.', flow: ['code>api', 'api>cons'] },
        { text: 'A library upgrade changes the hash order. Tests pass; the contract was never broken.', flow: ['code>api'], badges: { api: 'new order' } },
        { text: 'Two caller teams took "first item = newest" for granted. Their UIs now show the wrong order. <b>Hyrum\'s Law</b>.', flow: ['api>cons'], err: ['cons'], badges: { cons: ['broken', 'err'] }, tone: 'err' },
        { text: 'Fix: either <b>promise</b> an order (sort, and document it) or <b>randomise</b> it so nobody can depend on it. Contract tests catch the rest.', flow: ['code>api', 'api>cons'], ok: ['api', 'cons'], badges: { api: ['sorted + documented', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'goodhart', title: 'Goodhart: deploy frequency becomes the target', tone: 'err',
      steps: [
        { text: 'Leadership sets a target: every team must deploy <b>daily</b>, shown on a league table.', flow: ['lead>metric', 'metric>dash'] },
        { text: 'Teams split changes into tiny no-op deploys and config toggles. The number climbs.', flow: ['team>dash'], warn: ['dash'], badges: { dash: ['deploys ×3', 'warn'] } },
        { text: 'Lead time for real features does not improve, and change fail rate rises. The measure stopped measuring (<b>Goodhart</b>) and changed the work (<b>Campbell</b>).', nodes: ['metric', 'dash'], err: ['metric'], badges: { metric: ['gamed', 'err'] }, tone: 'err' },
        { text: 'Fix: report DORA metrics as a <b>set</b> (throughput and instability), use them per team for learning, and drop the ranking.', flow: ['team>dash'], ok: ['dash'], badges: { dash: ['balanced set', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'lehman', title: 'At scale: Lehman\'s laws and the rewrite temptation', tone: 'warn',
      steps: [
        { text: 'The system is in heavy use, so requests never stop: <b>continuing change</b> (Lehman I).', flow: ['team>code', 'code>api', 'api>cons'] },
        { text: 'Each change adds special cases. Without work against it, <b>complexity grows</b> (Lehman II) and every change gets slower.', nodes: ['code'], warn: ['code'], badges: { code: ['complexity ↑', 'warn'] } },
        { text: 'The team proposes a grand <b>v2 rewrite</b> with every idea held back from v1: the <b>second-system effect</b>.', flow: ['code>v2'], err: ['v2'], badges: { v2: ['18 months?', 'err'] }, tone: 'err' },
        { text: 'Better: a standing <b>refactoring budget</b> and incremental replacement (strangler fig), so the system keeps evolving while it serves users.', flow: ['code>refac', 'refac>code'], ok: ['refac', 'code'], hidden: ['v2'], tone: 'ok' }
      ]
    },
    {
      id: 'estimate', title: 'Hofstadter and Parkinson: estimating well', tone: 'info',
      steps: [
        { text: 'A team estimates "3 weeks". Hofstadter: <i>it always takes longer than you expect, even when you take Hofstadter\'s Law into account</i>.', flow: ['lead>est'] },
        { text: 'Pad it to 6 weeks without clear exit criteria and <b>Parkinson</b> kicks in: work expands to fill the time available.', flow: ['est>team'], warn: ['est'] },
        { text: 'Better: give a <b>range</b> (P50 4 weeks, P90 7 weeks) from past similar work, and time-box with a defined "done".', nodes: ['est'], ok: ['est'], badges: { est: ['P50 / P90', 'ok'] } },
        { text: 'Re-estimate as you learn, and compare actuals with estimates to calibrate. Kernighan\'s Law adds: keep code simple, because debugging costs more than writing.', flow: ['est>team', 'team>code'], ok: ['team'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Three real choices for a 10-person project that is about 4 weeks late, with a public API used by many teams. Meters are <em>illustrative</em>, derived from the Brooks model above and the Goodhart and Hyrum mechanisms.',
    controls: [
      { id: 'late', label: 'Response to the late project', type: 'seg', value: 'scope', options: [
        { v: 'add', l: 'Add people', hint: 'Brooks' }, { v: 'scope', l: 'Cut scope' }, { v: 'date', l: 'Extend date' }, { v: 'split', l: 'Split the team' }] },
      { id: 'metric', label: 'Metric strategy', type: 'seg', value: 'set', options: [
        { v: 'single', l: 'Single target metric' }, { v: 'set', l: 'Balanced set' }, { v: 'none', l: 'No metrics' }] },
      { id: 'api', label: 'API change policy', type: 'seg', value: 'sunset', options: [
        { v: 'any', l: 'Change anything undocumented' }, { v: 'sunset', l: 'Deprecate + Sunset date' }, { v: 'never', l: 'Never break anything' }] },
      { id: 'hires', label: 'People added (if adding)', type: 'range', min: 1, max: 10, step: 1, value: 4, unit: 'people' }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const n = 10, W = 60, R = 8;
      const base = brooks(n, 0, R, 0.5, W);
      let weeks, quality = 0.7, morale = 0.65;
      if (s.late === 'add') { weeks = brooks(n, s.hires, R, 0.5, W); quality -= 0.05 + s.hires * 0.02; morale -= 0.1; }
      else if (s.late === 'scope') { weeks = brooks(n, 0, R, 0.5, W * 0.7); quality += 0.05; morale += 0.1; }
      else if (s.late === 'date') { weeks = base; morale -= 0.05; }
      else { weeks = brooks(5, 0, R, 0.5, W * 0.5) + 0.5; quality += 0.02; morale += 0.05; }
      const deadline = base - 4;
      const slip = weeks - deadline;
      if (s.metric === 'single') { quality -= 0.15; morale -= 0.15; }
      if (s.metric === 'set') { quality += 0.1; }
      if (s.metric === 'none') { quality -= 0.05; }
      let breakage = { any: 0.8, sunset: 0.25, never: 0.08 }[s.api];
      if (s.api === 'never') { quality -= 0.1; morale -= 0.1; weeks += 1; }
      if (s.api === 'any') morale -= 0.05;
      const gaming = { single: 0.85, set: 0.3, none: 0.1 }[s.metric];
      const N = s.late === 'add' ? n + s.hires : s.late === 'split' ? 5 : n;
      quality = clamp(quality); morale = clamp(morale);
      const lvl = (x) => (x >= 0.7 ? 'high' : x >= 0.45 ? 'medium' : 'low');
      const metrics = [
        { k: 'Delivery (weeks vs deadline)', v: (slip > 0 ? '+' : '') + slip.toFixed(1) + ' wk', s: clamp(1 - slip / 8), hint: 'illustrative' },
        { k: 'Quality', v: lvl(quality), s: quality },
        { k: 'Morale', v: lvl(morale), s: morale },
        { k: 'Breakage risk for callers', v: lvl(breakage), s: 1 - breakage },
        { k: 'Metric gaming risk', v: lvl(gaming), s: 1 - gaming },
        { k: 'Communication paths', v: String(paths(N)) + (s.late === 'split' ? ' per team' : ''), s: clamp(1 - paths(N) / 150) }
      ];
      const notes = [];
      if (s.late === 'add') notes.push('Adding ' + s.hires + ' people raises paths from ' + paths(n) + ' to ' + paths(n + s.hires) + ', and seniors mentor for ~' + R + ' weeks. With ~' + W + ' person-weeks left, the model finishes ' + (weeks > base ? 'later' : 'only slightly earlier') + ' than doing nothing.');
      if (s.late === 'scope') notes.push('Cutting 30% of scope is the fastest lever: no ramp-up, no new paths. Agree the cut with product, in writing.');
      if (s.late === 'date') notes.push('Moving the date is honest but beware <b>Parkinson</b>: give the extra time a clear definition of done.');
      if (s.late === 'split') notes.push('Two teams of 5 on <b>separable</b> halves cut paths from 45 to 10 each, but only if the interface between halves is clear (see Conway).');
      if (s.metric === 'single') notes.push('A single target invites <b>Goodhart</b>: it will be met in the cheapest way, not the intended one.');
      if (s.metric === 'none') notes.push('No metrics means no gaming, but also no feedback: you cannot tell whether the recovery is working.');
      if (s.api === 'any') notes.push('<b>Hyrum</b>: callers depend on undocumented behaviour. Changing it without notice turns your refactor into their incident.');
      if (s.api === 'never') notes.push('Never breaking anything freezes the design: workarounds pile up and complexity grows (<b>Lehman II</b>).');
      let verdict;
      if (s.late === 'add' && weeks > base) verdict = '❌ <b>Brooks wins:</b> the new people make the late project later. Cut scope now; add people to the next, separable piece.';
      else if (s.metric === 'single') verdict = '⚠ <b>The target metric will be gamed.</b> Replace it with a balanced set used for learning.';
      else if (s.api === 'any') verdict = '⚠ <b>Expect broken callers.</b> Publish a deprecation policy with Sunset dates before the next change.';
      else if (s.late === 'scope' && s.metric === 'set' && s.api === 'sunset') verdict = '✅ <b>Designed for the laws:</b> scope cut instead of people, balanced metrics, and announced API retirements.';
      else if (s.late === 'add') verdict = '⚠ <b>Adding people only roughly breaks even here.</b> It pays off only when the work left is long and separable.';
      else verdict = '👍 <b>Reasonable.</b> Check the notes for the remaining law you are exposed to.';
      const flow = (s.late === 'add' ? ['lead>hires', 'hires>team'] : ['lead>est', 'est>team']).concat(['team>dash', 'team>code', 'code>api', 'api>cons']);
      return {
        metrics, verdict, notes, flow,
        hide: ['v2'],
        labels: {
          team: { label: s.late === 'split' ? '2 teams of 5' : 'Team of ' + N, sub: paths(N) + ' paths' + (s.late === 'split' ? ' each' : '') },
          hires: { label: s.late === 'add' ? '+' + s.hires + ' hires' : 'New hires', sub: s.late === 'add' ? 'ramping ' + R + ' wk' : 'none added' },
          metric: { label: { single: 'Target metric', set: 'Balanced set', none: 'No metrics' }[s.metric], sub: { single: 'gamed', set: 'DORA as a set', none: 'flying blind' }[s.metric] },
          api: { label: 'Public API', sub: { any: 'silent changes', sunset: 'Sunset header', never: 'frozen forever' }[s.api] },
          est: { label: 'Plan', sub: { add: 'same scope', scope: 'scope −30%', date: 'date +4 wk', split: 'two halves' }[s.late] }
        },
        warn: (s.late === 'add' ? ['hires', 'team'] : []).concat(s.api === 'never' ? ['code'] : []),
        err: (s.metric === 'single' ? ['metric'] : []).concat(s.api === 'any' ? ['cons'] : []),
        ok: (s.metric === 'set' ? ['dash'] : []).concat(s.api === 'sunset' ? ['api', 'cons'] : []),
        badges: { lead: [(slip > 0 ? '+' : '') + slip.toFixed(1) + ' wk', slip > 2 ? 'err' : slip > 0 ? 'warn' : 'ok'] }
      };
    }
  },

  widget: {
    title: 'Brooks\'s Law simulator',
    caption: 'A late project: the team, the work left and a deadline. Choose <b>how many people</b> to add and <b>in which week</b>, then press <b>Play</b>. The chart burns down remaining work with ramp-up and mentoring overhead (solid) against the baseline (dashed); the graph shows every communication path. Model is <em>illustrative</em>.'
  },

  realWorld: {
    intro: 'From a 1955 satire in The Economist to an IETF header: the sources behind each law, and how real teams designed around them.',
    timeline: [
      { when: '1955', who: 'C. Northcote Parkinson', title: '"Parkinson\'s Law" in The Economist', text: 'A satirical essay on the British civil service opens with <i>"work expands so as to fill the time available for its completion"</i>. Reprinted in the 1958 book. In software it is the warning against padded estimates with no definition of done.', src: 8 },
      { when: '1975', who: 'Fred Brooks', title: 'The Mythical Man-Month', text: 'From managing IBM OS/360: <i>"Adding manpower to a late software project makes it later."</i> Also the <b>second-system effect</b> and the n(n−1)/2 intercommunication argument. The 1995 anniversary edition added "No Silver Bullet" and Brooks\'s own second thoughts.', src: 9 },
      { when: '1974 → 1980', who: 'Meir Lehman (with Les Belady)', title: 'Laws of software evolution', text: 'From studies of IBM OS/360 releases. The 1980 <i>Proceedings of the IEEE</i> paper separates S-, P- and E-programs and argues E-programs (embedded in the real world) need never-ending maintenance. The laws were revised and extended up to 1996 (eight in total).', src: 1 },
      { when: '1979', who: 'Donald T. Campbell', title: 'Campbell\'s law', text: 'In "Assessing the impact of planned social change": the more a quantitative social indicator is used for decision-making, the more it is subject to corruption pressures and the more apt it is to <b>distort the processes</b> it is meant to monitor.', src: 6 },
      { when: '1997', who: 'Marilyn Strathern', title: 'Goodhart\'s Law in its popular form', text: 'Charles Goodhart\'s 1975 point was about monetary policy. Strathern\'s paper on British university audit gave the wording everyone quotes: <i>"When a measure becomes a target, it ceases to be a good measure."</i>', src: 5 },
      { when: '2012 → 2014', who: 'Go team', title: 'Randomised map iteration as a Hyrum defence', text: 'Go 1 defined map iteration order as <b>unpredictable</b> and started each iteration at a random point. When a Go 1.1 optimisation stopped randomising small maps (≤ 8 entries), code came to depend on the order; Go 1.3 reintroduced randomisation "to flush out these bugs".', src: 2 },
      { when: '2019', who: 'IETF (Erik Wilde)', title: 'RFC 8594: the Sunset header', text: 'An informational RFC: a <code>Sunset</code> response header with an HTTP-date when a resource is expected to become unresponsive, plus a <code>sunset</code> link relation. Clients should treat it as a hint.', src: 0 },
      { when: '2020', who: 'Google (Winters, Manshreck, Wright)', title: 'Software Engineering at Google', text: 'The book states Hyrum\'s Law: <i>"With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody."</i> It frames software engineering as "programming integrated over time".', src: 3 },
      { when: '2024', who: 'Hyrum Wright', title: 'On SE Radio', text: 'Wright discusses the law and the book; he has said he did not name it himself (Titus Winters popularised the name).', src: 4 },
      { when: 'Ongoing', who: 'DORA', title: 'Delivery metrics as a set', text: 'DORA\'s guide now describes <b>five</b> software delivery performance metrics across throughput and instability. Reporting them together is the practical counter to gaming any single one.', src: 7 }
    ],
    lessons: [
      'Every law has a <b>mechanism</b>; design against the mechanism, not the slogan.',
      'Brooks applies when remaining work is <b>short</b> compared with ramp-up, and to <b>tightly coupled</b> work. Early, separable work does scale.',
      'If you do not want a behaviour depended on, <b>make it unreliable on purpose</b> (randomise) or hide it.',
      'Pair every metric with a <b>counter-metric</b>, and never tie it to individual rewards.'
    ],
    sources: [
      { title: 'RFC 8594: The Sunset HTTP Header Field', url: 'https://www.rfc-editor.org/rfc/rfc8594', pub: 'IETF, E. Wilde, May 2019' },
      { title: 'Programs, life cycles, and laws of software evolution', url: 'https://ieeexplore.ieee.org/document/1456074', pub: 'M. M. Lehman · Proceedings of the IEEE 68(9), 1980' },
      { title: 'Go 1 Release Notes (map iteration order)', url: 'https://go.dev/doc/go1', pub: 'go.dev, 2012' },
      { title: 'Software Engineering at Google (free online edition)', url: 'https://abseil.io/resources/swe-book/html/toc.html', pub: 'Winters, Manshreck, Wright · O\'Reilly, 2020' },
      { title: 'SE Radio 609: Hyrum Wright on Software Engineering at Google', url: 'https://se-radio.net/2024/03/se-radio-609-hyrum-wright-on-software-engineering-at-google/', pub: 'Software Engineering Radio, 2024' },
      { title: '\'Improving ratings\': audit in the British University system', url: 'https://www.cambridge.org/core/journals/european-review/article/improving-ratings-audit-inthe-british-university-system/FC2EE640C0C44E3DB87C29FB666E9AAB', pub: 'M. Strathern · European Review 5(3), 1997' },
      { title: 'Assessing the impact of planned social change', url: 'https://econpapers.repec.org/RePEc:eee:epplan:v:2:y:1979:i:1:p:67-90', pub: 'D. T. Campbell · Evaluation and Program Planning 2(1), 1979' },
      { title: 'DORA\'s software delivery performance metrics', url: 'https://dora.dev/guides/dora-metrics-four-keys', pub: 'dora.dev' },
      { title: 'Parkinson\'s law', url: 'https://www.wikipedia.org/wiki/Parkinson%27s_Law', pub: 'Wikipedia (cites The Economist, 19 Nov 1955)' },
      { title: 'The Mythical Man-Month', url: 'https://www.wikipedia.org/wiki/Mythical_man_month', pub: 'Wikipedia (F. Brooks, 1975; anniversary ed. 1995)' },
      { title: 'Go 1.3 Release Notes (small-map iteration randomised again)', url: 'https://go.googlesource.com/website/+show/0150c532bf6ef0e57f79bcf8fc66afc29a94dea5/_content/doc/go1.3.md', pub: 'Go project, 2014' }
    ]
  },

  tradeoffs: {
    headers: ['Situation', 'Instinct', 'Better default', 'Pick the instinct when…'],
    rows: [
      ['Late project', '<b>Add people</b>', '<b>Cut or sequence scope</b>; move the date with exit criteria', 'Lots of work remains, it splits into separable parts, and ramp-up is short (experienced hires, good docs)'],
      ['Team performance', '<b>One target metric</b>', '<b>Balanced set</b> (throughput + instability) used for learning', 'Almost never as a target; a single <i>diagnostic</i> metric is fine for a short, specific experiment'],
      ['Undocumented API behaviour', '<b>Change freely</b>, "not in the contract"', '<b>Deprecate with notice</b>, randomise unpromised behaviour', 'Internal callers you can all find and fix in one change (monorepo, large-scale change tooling)'],
      ['Old, complex system', '<b>Rewrite (v2)</b>', '<b>Refactoring budget</b> + incremental replacement', 'The platform itself is obsolete and the scope of v2 is frozen to v1 parity'],
      ['Estimate', '<b>Single date</b>, padded', '<b>Range</b> (P50/P90) from reference cases, re-estimated', 'A fixed external date: then fix the date and flex scope explicitly']
    ]
  },
  failures: [
    { f: 'Late-stage staffing surge', detect: 'Headcount up, throughput down for weeks; seniors\' commits drop', fix: 'Freeze headcount near the end; cut scope; put new people on the next separable milestone.' },
    { f: 'Gamed delivery metrics', detect: 'Deploy count rises while lead time for features is flat and change fail rate climbs', fix: 'Report metrics as a set with counter-metrics; remove rankings and targets tied to rewards.' },
    { f: 'Hyrum breakage', detect: 'Incidents in callers after "non-breaking" changes; tickets saying "it used to…"', fix: 'Contract tests, randomise unpromised behaviour, deprecation policy with Sunset headers and usage tracking.' },
    { f: 'Frozen API (fear of Hyrum)', detect: 'Workarounds and v1 flags pile up; nothing is ever removed', fix: 'Versioned APIs with dated retirements; measure remaining callers and help them migrate.' },
    { f: 'Second-system rewrite', detect: 'v2 plan has more features than v1; no date for parity', fix: 'Strangler-fig migration, v1-parity scope first, new ideas after cut-over.' },
    { f: 'Unbudgeted complexity growth (Lehman II)', detect: 'Change lead time rises release over release with the same team', fix: 'Reserve capacity for refactoring and upgrades; track it like an error budget.' },
    { f: 'Padded, undefined estimates', detect: 'Every task takes exactly its estimate or more (Parkinson)', fix: 'Range estimates, time-boxes with a defined done, compare actuals to calibrate.' }
  ],

  interview: [
    { q: 'State Brooks\'s Law precisely and explain why it holds. When does it not?', a: '<p>Fred Brooks, <i>The Mythical Man-Month</i> (1975): <b>"Adding manpower to a late software project makes it later."</b> Two mechanisms: <b>ramp-up</b> (new people are unproductive and take mentors away from the work) and <b>communication overhead</b>, which grows as n(n−1)/2 pairs. Some tasks also cannot be split (nine women cannot make a baby in one month).</p><p>It does not hold when lots of work remains, the work is <b>separable</b> and newcomers ramp quickly. Brooks himself (1995) called it an "outrageous oversimplification", true in spirit.</p>', fu: 'How would you quantify it for your project? (Ramp-up weeks, mentor share, remaining work.)', lvl: 'core' },
    { q: 'What is Hyrum\'s Law and how does it change how you design APIs?', a: '<p>From Hyrum Wright at Google, stated in <i>Software Engineering at Google</i> (2020): with enough users, <b>all observable behaviours</b> of your system will be depended on by somebody, whatever the contract says.</p><ul><li>Minimise observable surface: return only what you mean to promise.</li><li><b>Randomise</b> what you do not promise (Go map order; Java <code>Map.of</code> iteration order varies between JVM runs).</li><li>Contract tests and usage telemetry, so you know who relies on what.</li><li>A deprecation policy with <code>Sunset</code> dates.</li></ul>', lvl: 'core' },
    { q: 'Goodhart vs Campbell: what is the difference, and how do you use DORA metrics without gaming?', a: '<p><b>Goodhart</b> (economist, 1975; popular wording by Strathern, 1997): when a measure becomes a target, it ceases to be a good measure. <b>Campbell</b> (1979) goes further: the indicator used for decisions also <b>distorts the process</b> it monitors.</p><p>With DORA: report the metrics <b>as a set</b> (throughput and instability together), use them per team for improvement, never to rank teams or individuals, and look at trends, not absolute targets.</p>', lvl: 'core' },
    { q: 'Name Lehman\'s laws that matter most to an architect.', a: '<p>Lehman and Belady, from 1974, published in the 1980 <i>Proceedings of the IEEE</i> paper and revised to eight laws by 1996. For E-type systems (used in the real world):</p><ul><li><b>I Continuing change</b>: a system must keep adapting or become progressively less satisfactory.</li><li><b>II Increasing complexity</b>: as it evolves, complexity grows unless work is done to maintain or reduce it.</li><li><b>VII Declining quality</b> unless rigorously maintained and adapted.</li></ul><p>Implication: budget evolution and refactoring as permanent work, not a project.</p>', lvl: 'core' },
    { q: 'Your project is 6 weeks late with 10 engineers. The VP offers 5 more. What do you say?', a: '<ol><li>Ask what is left: if most is <b>short and coupled</b>, new people will slow us down (ramp-up ~ weeks, 45 → 105 paths).</li><li>Propose <b>cut scope</b> to the must-haves for the date, with product agreeing in writing.</li><li>If work is long and separable, accept the people <b>onto a separate stream</b> with its own lead, so they do not drain the critical path.</li><li>Write it in an ADR with the model inputs and a check-in date.</li></ol>', fu: 'What if the date is legally fixed? (Then flex scope; nothing else moves the date.)', lvl: 'deep' },
    { q: 'What is the second-system effect, and how does it relate to rewrites?', a: '<p>Brooks: the <b>second system</b> an architect designs is the most dangerous, because every feature held back from the first is added "this time". The result is over-designed and late.</p><p>Guard against it with <b>v1-parity scope</b> first, incremental replacement (strangler fig) rather than a big-bang rewrite, and new features only after cut-over.</p>', lvl: 'core' },
    { q: 'How would you deprecate a widely used REST endpoint?', a: '<ul><li>Publish the replacement and a migration guide.</li><li>Return a <code>Deprecation</code> header and, per <b>RFC 8594</b>, a <code>Sunset</code> date plus <code>Link: rel="sunset"</code>.</li><li>Track <b>callers by client ID</b>; contact the top callers directly.</li><li>Brown-outs (short planned failures) before the date to find hidden callers.</li><li>Remove only when usage is near zero or the date passes with sign-off.</li></ul>', lvl: 'deep' },
    { q: 'Kernighan\'s Law, Hofstadter\'s Law and the Lindy effect: how do they show up in design decisions?', a: '<p><b>Kernighan</b> (<i>The Elements of Programming Style</i>, with Plauger): "Everyone knows that debugging is twice as hard as writing a program in the first place. So if you\'re as clever as you can be when you write it, how will you ever debug it?" Prefer boring, readable code.</p><p><b>Hofstadter</b> (<i>Gödel, Escher, Bach</i>, 1979): it always takes longer than you expect, even when you take Hofstadter\'s Law into account. Use ranges.</p><p><b>Lindy effect</b> (popularised by Taleb): for non-perishable things, expected remaining life grows with age. A 20-year-old database is a safer bet than a 1-year-old one; a heuristic, not a guarantee.</p>', lvl: 'core' },
    { q: 'How do Conway\'s Law and Brooks\'s Law fit together?', a: '<p>Conway (1968): systems copy the <b>communication structure</b> of the organisation. Brooks: communication cost grows as n(n−1)/2. Together: keep teams small and connect them through <b>explicit interfaces</b>, so coordination cost grows with the number of teams, and the architecture has matching seams. See <a href="conways-law.html">Conway\'s Law & Team Topologies</a>.</p>', lvl: 'core' },
    { q: 'Behavioural: Tell me about a time you pushed back on adding people to a late project.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> A payments migration was 5 weeks late; the director offered 6 contractors for the last 2 months.</p><p><b>T:</b> As the architect, recommend whether to accept.</p><p><b>A:</b> Listed the remaining work: 70% was tightly coupled cut-over tasks needing system knowledge. Modelled ramp-up (6 weeks) and mentor time; it showed a 1–2 week <i>delay</i>. Proposed moving two reporting features to a later release and giving the contractors the separate reporting module.</p><p><b>R:</b> Core cut-over shipped 1 week late instead of 5; reporting followed a month later with the contractors. The ADR became our template for late-project decisions.</p>', lvl: 'deep' },
    { q: 'Behavioural: Describe a time a metric was gamed and what you changed.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Leadership set a target of 80% unit-test coverage for every service.</p><p><b>T:</b> I was asked why incidents had not dropped after coverage hit the target.</p><p><b>A:</b> Sampled 50 tests: many had no assertions. Showed coverage up 25 points while escaped defects were flat. Proposed replacing the target with a set: change fail rate, escaped defects and mutation score on critical modules, reviewed per team, not ranked.</p><p><b>R:</b> Assertion-free tests were deleted, coverage settled lower, and escaped defects fell over the next two quarters.</p>', lvl: 'deep' },
    { q: 'Behavioural: Tell me about a change that broke consumers because of Hyrum\'s Law.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> We replaced a JSON library; field order in responses changed. Our docs never promised an order.</p><p><b>T:</b> Two partner integrations failed; I led the response and the follow-up.</p><p><b>A:</b> Rolled back within an hour, then added consumer-driven contract tests with the partners, documented which behaviours are guaranteed, and wrote a deprecation policy with Sunset headers and 6-month notice.</p><p><b>R:</b> The re-release went out with notice and no incidents; the policy was adopted for all public APIs.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Brooks model: when does adding people pay off? (Python 3.11+)', lang: 'python',
      code: `"""Illustrative Brooks's Law model: ramp-up, mentoring and n(n-1)/2 overhead."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Plan:
    team: int                # current engineers
    work: float              # remaining person-weeks at full speed
    hires: int = 0           # people added
    start: float = 0.0       # week they join
    ramp: float = 8.0        # weeks to full productivity
    mentor: float = 0.5      # share of a person each hire costs while ramping
    overhead: float = 0.02   # share of a week lost per colleague

def weeks_to_finish(p: Plan, dt: float = 0.1) -> float:
    t, left = 0.0, p.work
    while left > 0 and t < 520:
        joined = t >= p.start and p.hires > 0
        n = p.team + (p.hires if joined else 0)
        eff = max(0.0, 1 - p.overhead * (n - 1))     # communication cost
        r = min(1.0, (t - p.start) / p.ramp) if joined else 0.0
        rate = p.team * eff
        if joined:
            rate += p.hires * r * eff - p.hires * p.mentor * (1 - r)
        left -= max(0.0, rate) * dt
        t += dt
    return t

if __name__ == "__main__":
    for work in (60, 120, 400):
        base = weeks_to_finish(Plan(team=6, work=work))
        more = weeks_to_finish(Plan(team=6, work=work, hires=4))
        print(f"{work:>4} pw: {base:5.1f} wk alone, {more:5.1f} wk with +4 "
              f"({'later' if more > base else 'earlier'})")`,
      note: 'Short remaining work makes the hires a net loss; long work repays the ramp-up. The overhead and mentor shares are assumptions: calibrate them from your own onboarding data.'
    },
    {
      title: 'Hyrum\'s Law in Java: callers relying on HashMap order, and the defence', lang: 'java',
      code: `import java.util.*;

// The "contract": returns the user's roles. Order was never promised.
record RolesResponse(List<String> roles) {}

class RoleService {
    private final Map<String, Boolean> roles = new HashMap<>();

    // BAD: leaks HashMap iteration order. A JDK upgrade, a capacity change or
    // a new key can reorder it, and some caller WILL have used roles().get(0).
    RolesResponse leaky() {
        return new RolesResponse(List.copyOf(roles.keySet()));
    }

    // GOOD (option 1): promise an order, document it, test it.
    RolesResponse sorted() {
        return new RolesResponse(roles.keySet().stream().sorted().toList());
    }

    // GOOD (option 2): make the unpromised order unreliable on purpose,
    // like Go's map iteration or Java's Map.of/Set.of (varies per JVM run).
    RolesResponse shuffled() {
        var list = new ArrayList<>(roles.keySet());
        Collections.shuffle(list);
        return new RolesResponse(List.copyOf(list));
    }
}

// Contract test (JUnit 5): fails if the response order ever changes.
// @Test void rolesAreSortedAlphabetically() {
//     var r = service.sorted().roles();
//     assertEquals(r.stream().sorted().toList(), r);
// }`,
      note: 'Pick one: either the order is part of the contract (sort and test) or it is visibly random (shuffle in non-production and in tests). Leaving it "stable by accident" is what Hyrum\'s Law punishes.'
    },
    {
      title: 'Deprecation policy in application.yml + Sunset header filter (Spring Boot 3)', lang: 'java',
      code: `// application.yml
// api:
//   deprecations:
//     - path: /api/v1/orders/**
//       deprecated-at: 2026-05-01T00:00:00Z
//       sunset-at: 2026-11-30T23:59:59Z
//       link: https://developer.example.com/migrate/orders-v2

@ConfigurationProperties("api")
record DeprecationProps(List<Entry> deprecations) {
    record Entry(String path, Instant deprecatedAt, Instant sunsetAt, String link) {}
}

@Component
@EnableConfigurationProperties(DeprecationProps.class)
class SunsetHeaderFilter extends OncePerRequestFilter {
    private final DeprecationProps props;
    private final AntPathMatcher matcher = new AntPathMatcher();
    private static final DateTimeFormatter HTTP_DATE = DateTimeFormatter
            .ofPattern("EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.ENGLISH).withZone(ZoneOffset.UTC);
    SunsetHeaderFilter(DeprecationProps props) { this.props = props; }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        for (var d : props.deprecations()) {
            if (!matcher.match(d.path(), req.getRequestURI())) continue;
            // RFC 9745 Deprecation: structured date (@epoch-seconds)
            res.setHeader("Deprecation", "@" + d.deprecatedAt().getEpochSecond());
            // RFC 8594 Sunset: an HTTP-date
            res.setHeader("Sunset", HTTP_DATE.format(d.sunsetAt()));
            res.addHeader("Link", "<" + d.link() + ">; rel=\\"sunset\\"");
            break;
        }
        chain.doFilter(req, res);
    }
}`,
      note: 'Imports omitted (jakarta.servlet, org.springframework.*, java.time, java.util). Log the client ID on every deprecated call so you can see who still depends on the endpoint before the sunset date.'
    }
  ],

  related: ['conways-law', 'design-principles', 'tech-debt', 'api-design', 'stakeholder-communication', 'okrs-to-nfrs']
});
})();
