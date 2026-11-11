SD.register({
  slug: 'structured-upskilling',
  domain: 9,
  title: 'Structured Upskilling',
  examples: 'Skills matrix, katas, guilds',
  tagline: 'An architecture is only as feasible as the <b>skills of the people who must build and run it</b>. Measure the gap, teach through <b>practice on real work</b>, and remove single points of knowledge.',
  tldr: {
    problem: 'The new vision needs event streaming, Kubernetes and observability. One senior engineer knows Kafka, nobody else has run Kubernetes in production, and the training budget was spent on a one-day course that nobody has used since.',
    idea: 'Treat skills like any other capacity: a <b>skills matrix</b> (people × skills, rated on the <b>Dreyfus</b> stages), a <b>gap analysis</b> against what the target architecture needs, a <b>curriculum</b> with clear objectives, and formats that force <b>spaced practice on real work</b>: pairing, mob programming, katas, runbooks, guilds.',
    insight: 'Training without practice decays. The forgetting curve (Ebbinghaus 1885, replicated in 2015) means a workshop that is not applied within days is mostly lost. Measure <b>behaviour and results</b> (Kirkpatrick levels 3–4), not attendance, and track the <b>bus factor</b> of every critical skill.',
    numbers: [
      { v: '5', l: 'stages of skill acquisition (Dreyfus & Dreyfus, 1980 report)' },
      { v: '4', l: 'evaluation levels: reaction, learning, behaviour, results (Kirkpatrick)' },
      { v: '≥ 3', l: 'people at "competent" per critical skill (rule of thumb for bus factor)' }
    ]
  },

  intro: {
    what: 'Structured upskilling is a <b>planned way to raise the whole team\'s skills</b> to what the architecture needs. You map who knows what, compare it with what the target design requires, and run a learning plan that mixes teaching with <b>practice on real work</b>. The architect owns it because an architecture the team cannot build or operate is not a real option.',
    analogy: {
      icon: '🧗',
      title: 'Preparing a climbing team for a harder mountain',
      text: 'A guide does not hand the team a book about ice climbing the night before. They check who can do what, then practise on easier ice, rope novices to experienced climbers, and repeat the moves until they are automatic. Only then do they attempt the summit. The analogy has a limit: software skills also decay faster when unused, because tools change under you.'
    },
    problem: 'A company decides to move from a monolith to event-driven services. Six months later, every Kafka incident is escalated to the one person who set it up, and teams avoid the new platform because they do not trust themselves with it. The architecture is right on paper and failing in practice. The question this topic answers is: <b>how do we raise the team\'s skill floor fast enough that the new architecture is actually feasible?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Send everyone on a course',
        text: 'Leadership buys a two-day vendor course and a video library licence. It is easy to arrange, easy to report ("40 people trained") and feels like action.',
        scene: {
          nodes: [
            { id: 'ar', label: 'Architect', sub: 'new vision', kind: 'person', at: [210, 0] },
            { id: 'c', label: 'Vendor course', sub: '2 days', kind: 'policy', at: [210, 110] },
            { id: 't1', label: 'Team A', sub: 'attended', kind: 'team', at: [70, 220] },
            { id: 't2', label: 'Team B', sub: 'attended', kind: 'team', at: [350, 220] }
          ],
          edges: [{ from: 'ar', to: 'c' }, { from: 'c', to: 't1' }, { from: 'c', to: 't2' }],
          flow: ['ar>c', ['c>t1', 'c>t2']]
        }
      },
      {
        stage: 'breaks',
        title: 'Nobody practises, so it fades',
        text: 'Back at work the backlog has no Kafka tickets for a month. By the time one arrives, most of the course is <b>forgotten</b>, and the work goes to the <b>one expert</b>, who becomes a bottleneck and a single point of failure.',
        scene: {
          nodes: [
            { id: 'ar', label: 'Architect', sub: 'vision stalls', kind: 'person', at: [210, 0] },
            { id: 'c', label: 'Vendor course', sub: 'forgotten', kind: 'policy', at: [70, 110] },
            { id: 'ex', label: 'The one expert', sub: 'every escalation', kind: 'person', at: [350, 110] },
            { id: 't1', label: 'Team A', sub: 'avoids Kafka', kind: 'team', at: [70, 220] },
            { id: 't2', label: 'Team B', sub: 'escalates', kind: 'team', at: [350, 220] }
          ],
          edges: [{ from: 't1', to: 'ex' }, { from: 't2', to: 'ex' }, { from: 'ex', to: 'ar' }],
          flow: [['t1>ex', 't2>ex'], 'ex>ar'],
          warn: ['c', 't1'], err: ['ex'],
          badges: { ex: ['bus factor 1', 'err'], c: ['decayed', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Map the gap, then practise on real work',
        text: 'A <b>skills matrix</b> shows the gap. The expert <b>pairs</b> with two people on real tickets, a short workshop is followed by <b>katas</b> each week, and a <b>guild</b> keeps the skill alive across teams. Within a quarter, three people can handle an incident.',
        scene: {
          nodes: [
            { id: 'ar', label: 'Architect', sub: 'owns the plan', kind: 'person', at: [210, 0] },
            { id: 'c', label: 'Skills matrix', sub: 'gap → plan', kind: 'store', at: [70, 110] },
            { id: 'ex', label: 'Expert', sub: 'pairs, mentors', kind: 'person', at: [350, 110] },
            { id: 't1', label: 'Team A', sub: 'practises weekly', kind: 'team', at: [70, 220] },
            { id: 't2', label: 'Team B', sub: 'handles on-call', kind: 'team', at: [350, 220] }
          ],
          edges: [{ from: 'ar', to: 'c' }, { from: 'c', to: 't1' }, { from: 'ex', to: 't1', dashed: true }, { from: 'ex', to: 't2', dashed: true }],
          flow: ['ar>c', 'c>t1', ['ex>t1', 'ex>t2']],
          ok: ['t1', 't2', 'ex'],
          badges: { t2: ['bus factor 3', 'ok'] }
        }
      }
    ],
    usedBy: ['Google (g2g peer teaching)', 'Spotify (guilds)', 'Thoughtworks (architectural katas via Neal Ford)', 'Hunter Industries (mob programming)', 'Coding dojos and code retreats worldwide'],
    whenToUse: [
      'A new architecture needs skills the team <b>does not have yet</b> (streaming, Kubernetes, a new language)',
      'Critical systems depend on <b>one or two people</b> (incidents always escalate to them)',
      'Onboarding takes months and every new hire learns by <b>interrupting</b> seniors'
    ],
    whenNot: [
      'The gap is one rare, short-lived task: <b>hire or buy</b> the expertise for that project instead',
      'The real blocker is too much tooling per team: reduce load first with <a href="platform-engineering.html">Platform Engineering</a>',
      'There is no time to practise at all: fix capacity first, or the plan will be training without practice'
    ],
    glossary: [
      { term: 'Skills matrix', def: 'A table of people × skills with a rated level per cell, used to find gaps and single points of knowledge.' },
      { term: 'Dreyfus model', def: 'A five-stage model of how people move from rule-following novices to intuitive experts.' },
      { term: 'Bus factor', def: 'How many people would have to leave before nobody can maintain a skill or system.' },
      { term: 'T-shaped skills', def: 'Broad working knowledge across many areas plus deep expertise in one.' },
      { term: 'Code kata', def: 'A small programming exercise repeated deliberately to build fluency (term from Dave Thomas).' },
      { term: 'Mob programming', def: 'The whole team works on one thing at one computer, rotating the typist (Woody Zuill).' },
      { term: 'Community of practice', def: 'People who share a concern and deepen their expertise by interacting regularly (Wenger); a guild is one.' },
      { term: 'Spaced practice', def: 'Repeating practice over several sessions spread in time, which retains far better than one long session.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Start from the architecture</b>: derive the required skills and target levels from the target design and its runbooks',
      '<b>Measure before teaching</b>: a skills matrix with evidence-based levels (what someone has done, not what they feel)',
      '<b>Write learning objectives</b> as observable behaviour ("can roll back a failed deploy unaided"), mapped to Bloom levels',
      '<b>Learn on real work</b>: pairing, mob programming and runbook drills on actual tickets, not only classroom time',
      '<b>Space the practice</b>: short sessions every week beat one long event; repeat before the skill decays',
      '<b>Spread the knowledge</b>: every critical skill reaches 3+ competent people; experts teach as part of their job'
    ],
    nonFunctional: [
      '<b>Bus factor</b> ≥ 3 at "competent" or above for every critical skill (rule of thumb)',
      '<b>Escalations</b> to the top expert down by half within two quarters (measured from incident tickets)',
      '<b>Time-to-first-change</b> for new hires (first merged, deployed change) under 2 weeks',
      '<b>Protected learning time</b> of 5–10% of capacity, visible in planning (rule of thumb)',
      'DORA outcomes such as <b>change failure rate</b> and <b>time to restore</b> stable or improving on the new stack',
      '<b>Matrix refreshed</b> every quarter; stale cells are flagged'
    ],
    outOfScope: [
      '<b>Training without practice</b>: courses with no follow-up work on the skill within days',
      '<b>Attendance as the KPI</b>: counting seats instead of behaviour change',
      '<b>Skills matrix as a performance ranking</b>: people inflate scores and stop admitting gaps',
      '<b>Hero culture</b>: rewarding the one person who fixes everything instead of the one who teaches others',
      'A <b>mandatory guild</b>: communities of practice die when they are compulsory'
    ]
  },

  calculator: {
    inputs: [
      { id: 'team', label: 'People in the team(s)', min: 2, max: 200, value: 24, log: true },
      { id: 'skills', label: 'Critical skills in the matrix', min: 1, max: 20, value: 6 },
      { id: 'cur', label: 'Current average level (Dreyfus 1–5)', min: 1, max: 5, step: 0.1, value: 2.0 },
      { id: 'tgt', label: 'Target average level', min: 1, max: 5, step: 0.1, value: 3.0 },
      { id: 'hpl', label: 'Practice hours per level step', min: 5, max: 200, value: 40, unit: 'h' },
      { id: 'hpw', label: 'Learning hours per person per week', min: 0.5, max: 16, step: 0.5, value: 4, unit: 'h' }
    ],
    outputs: [
      { label: 'Level steps per person (skills × gap)', f: (v) => Math.round(Math.max(0, v.tgt - v.cur) * v.skills * 10) / 10 },
      { label: 'Total learning hours (whole team)', fmt: 'num', unit: 'h', f: (v) => Math.round(v.team * v.skills * Math.max(0, v.tgt - v.cur) * v.hpl) },
      { label: 'Weeks to target (people learn in parallel)', unit: 'weeks', f: (v) => Math.ceil(v.skills * Math.max(0, v.tgt - v.cur) * v.hpl / v.hpw) },
      { label: 'Share of a 40 h week spent learning', fmt: 'pct', f: (v) => v.hpw / 40 },
      { label: 'People at ≥ competent (level 3) per skill: now', f: (v) => { const p = (m) => 1 / (1 + Math.exp(-1.702 * (m - 2.5))); return (v.team * p(v.cur)).toFixed(1); } },
      { label: 'People at ≥ competent per skill: at target (bus factor)', f: (v) => { const p = (m) => 1 / (1 + Math.exp(-1.702 * (m - 2.5))); return (v.team * p(v.tgt)).toFixed(1); } }
    ],
    note: 'Weeks = skills × level gap × hours per step ÷ weekly hours, assuming people learn in parallel and practise every week. Hours per level step is an <em>estimate</em>: early steps are fast, the move to proficient and expert takes far longer (often years). Bus factor assumes levels in a skill are spread around the average with a standard deviation of about one level (a <em>normal approximation</em>), counting people at 3 or above. If the average is high but one person holds it all, the real bus factor is lower: check the matrix, not the average.'
  },

  api: [
    { m: 'YAML', p: 'skills-matrix.yaml', d: 'People × skills with a Dreyfus level, the <b>evidence</b> for it (incident handled, PR, design), and a date. Lists which skills are <b>critical</b> for the target architecture and the target level for each.' },
    { m: 'DOC', p: 'Learning path / curriculum', d: 'Per skill: learning objectives written as observable behaviour, the Bloom level each targets, the formats (pair, kata, workshop), the practice schedule and the <b>proof of skill</b> (e.g. "led a failover drill").' },
    { m: 'DOC', p: 'Runbooks and playbooks', d: 'Step-by-step operational procedures that double as teaching material: every step says <b>what</b>, <b>why</b>, and how to verify. Drilled in game days and pairing sessions.' },
    { m: 'DOC', p: 'Onboarding path', d: 'Week-by-week plan for a new hire: environment set-up, a buddy, a first small change to production in week 1–2, shadowing on-call, then reverse shadowing.' },
    { m: 'POLICY', p: 'Learning time and budget', d: 'How much capacity is protected for learning (e.g. a fixed half-day a week), the per-person budget, and who approves it. Visible in sprint planning so it is not the first thing cut.' },
    { m: 'SLO', p: 'Capability goals', d: 'Measurable goals per quarter: bus factor ≥ 3 for each critical skill, escalations to experts halved, time-to-first-change for new hires &lt; 2 weeks.' }
  ],
  dataModel: [
    { name: 'skill', store: 'Skills catalog', fields: [['skill_id', 'text', 'pk'], ['name', 'text'], ['critical', 'bool', 'idx'], ['target_level', 'smallint'], ['min_competent', 'smallint'], ['architecture_ref', 'text']], note: '<code>architecture_ref</code> links each skill to the ADR or component that needs it, so the matrix tracks the architecture.' },
    { name: 'skill_assessment', store: 'Skills matrix', fields: [['person_id', 'text', 'pk'], ['skill_id', 'text', 'pk'], ['level', 'smallint 1–5'], ['evidence', 'text'], ['assessed_on', 'date', 'idx'], ['last_practised', 'date', 'idx']], note: '<code>last_practised</code> lets you flag skills that are decaying from disuse.' },
    { name: 'learning_activity', store: 'Learning log', fields: [['activity_id', 'uuid', 'pk'], ['kind', 'pair | mob | kata | workshop | guild | talk'], ['skill_id', 'text', 'fk'], ['participants', 'text[]'], ['hours', 'numeric'], ['held_on', 'date', 'idx']] },
    { name: 'impact_measure', store: 'Outcome tracker', fields: [['skill_id', 'text', 'pk'], ['quarter', 'text', 'pk'], ['bus_factor', 'smallint'], ['expert_escalations', 'int'], ['change_failure_rate', 'numeric'], ['time_to_restore_h', 'numeric']], note: 'Kirkpatrick levels 3–4: behaviour and results, joined to the activities that preceded them.' }
  ],

  architecture: {
    title: 'The upskilling loop: from target architecture to measured capability',
    nodes: [
      { id: 'lead', label: 'Eng manager', sub: 'protects time', kind: 'person', wide: [120, 40], tall: [70, 0], tip: 'Funds the plan: a fixed share of capacity and a learning budget, defended in planning.' },
      { id: 'arch', label: 'Architect', sub: 'target architecture', kind: 'person', wide: [400, 40], tall: [210, 0], tip: 'Derives which skills the new design needs, at what level, and owns the learning plan with the managers.' },
      { id: 'mx', label: 'Skills matrix', sub: 'people × skills', kind: 'store', wide: [680, 40], tall: [350, 0], tip: 'Dreyfus levels 1–5 with evidence. Shows gaps and the bus factor per critical skill.' },
      { id: 'cur', label: 'Learning path', sub: 'objectives · Bloom', kind: 'policy', wide: [260, 150], tall: [210, 110], tip: 'Observable objectives, the format for each, and a spaced practice schedule.' },
      { id: 'gap', label: 'Gap analysis', sub: 'target − current', kind: 'policy', wide: [680, 150], tall: [350, 110], tip: 'Which skills are below target, and which have fewer than three competent people.' },
      { id: 'rb', label: 'Runbooks', sub: 'teach + operate', kind: 'store', wide: [880, 150], tall: [70, 110], tip: 'Operational procedures written so a competent engineer can follow them and learn why each step exists.' },
      { id: 'ws', label: 'Workshops · katas', sub: 'teach, then drill', kind: 'team', wide: [120, 260], tall: [70, 220], tip: 'Short teaching sessions followed by weekly katas so the new skill is practised, not just heard.' },
      { id: 'pair', label: 'Pairing · mob', sub: 'learn on real work', kind: 'team', wide: [330, 260], tall: [210, 220], tip: 'Expert and learner on a real ticket; the whole team on one hard problem.' },
      { id: 'guild', label: 'Guild', sub: 'community of practice', kind: 'team', wide: [540, 260], tall: [350, 220], tip: 'Voluntary, cross-team. Keeps a skill alive after the project and spreads patterns.' },
      { id: 'team', label: 'Product teams', sub: 'apply on the job', kind: 'team', wide: [330, 370], tall: [210, 330], tip: 'The skill only counts when it shows up in normal work: designs, reviews, on-call.' },
      { id: 'prod', label: 'New platform', sub: 'built + operated', kind: 'service', wide: [600, 370], tall: [70, 440], tip: 'The target architecture, now feasible because the people can build and run it.' },
      { id: 'meas', label: 'Impact', sub: 'Kirkpatrick · DORA', kind: 'policy', wide: [860, 370], tall: [350, 440], tip: 'Behaviour and results: escalations, time to restore, change failure rate, bus factor.' }
    ],
    edges: [
      { from: 'arch', to: 'mx', label: 'needs' },
      { from: 'mx', to: 'gap' },
      { from: 'gap', to: 'cur' },
      { from: 'lead', to: 'cur', dashed: true, label: 'time' },
      { from: 'cur', to: 'ws' },
      { from: 'cur', to: 'pair' },
      { from: 'cur', to: 'guild' },
      { from: 'rb', to: 'pair', dashed: true },
      { from: 'ws', to: 'team' },
      { from: 'pair', to: 'team' },
      { from: 'guild', to: 'team' },
      { from: 'team', to: 'prod' },
      { from: 'prod', to: 'meas' },
      { from: 'meas', to: 'gap', dashed: true, bend: 0.2, label: 're-assess' }
    ]
  },

  scenarios: [
    {
      id: 'plan', title: 'From vision to learning plan', tone: 'ok',
      steps: [
        { text: 'The architect lists what the event-driven target needs: <b>Kafka, Kubernetes, observability, DDD</b>, each with a target level and a "critical" flag.', flow: ['arch>mx'], badges: { arch: 'target' } },
        { text: 'The <b>skills matrix</b> is filled with evidence: "ran a partition reassignment" counts, "watched a video" does not. Gap analysis shows Kafka at bus factor 1.', flow: ['mx>gap'], err: ['gap'], badges: { gap: ['Kafka: 1 person', 'err'] } },
        { text: 'The learning path sets objectives such as "can diagnose consumer lag unaided" (Bloom: <b>apply / analyse</b>) and picks formats per skill. The manager protects <b>half a day a week</b>.', flow: ['gap>cur', 'lead>cur'], badges: { cur: '4 h/week' } },
        { text: 'The expert <b>pairs</b> with two engineers on real tickets; a workshop is followed by weekly <b>katas</b>; a guild starts for the whole org.', flow: [['cur>ws', 'cur>pair', 'cur>guild']], ok: ['pair'] },
        { text: 'The skill shows up in normal work. After a quarter, three people handle Kafka incidents and the matrix is re-assessed.', flow: ['pair>team', 'team>prod', 'prod>meas', 'meas>gap'], ok: ['team', 'prod'], badges: { meas: ['bus factor 3', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'decay', title: 'Training without practice', tone: 'err',
      steps: [
        { text: 'A two-day workshop on Kubernetes for 30 people. Feedback forms are excellent (Kirkpatrick <b>level 1</b>: reaction).', flow: ['cur>ws', 'ws>team'], badges: { ws: '4.7 / 5' } },
        { text: 'No ticket in the next six weeks needs the skill. Nothing is scheduled to <b>practise</b> it. The forgetting curve does the rest.', nodes: ['team'], warn: ['team'], badges: { team: ['unused', 'warn'] } },
        { text: 'The first real cluster incident goes straight to the one platform expert. <b>Behaviour did not change</b> (level 3), so results (level 4) did not either.', flow: ['team>prod'], err: ['prod', 'team'], badges: { prod: ['escalated', 'err'] }, tone: 'err' },
        { text: 'Fix: tie every workshop to <b>follow-up practice within days</b>: a kata the next week, a paired ticket, a runbook drill. Measure behaviour, not attendance.', flow: ['rb>pair', 'pair>team'], ok: ['pair', 'team'], tone: 'ok' }
      ]
    },
    {
      id: 'bus', title: 'Under pressure: the expert resigns', tone: 'warn',
      steps: [
        { text: 'The only person at <b>expert</b> level in the payment ledger gives notice: four weeks left.', nodes: ['mx'], err: ['mx'], badges: { mx: ['bus factor 1', 'err'] }, tone: 'err' },
        { text: 'Emergency plan: the expert stops feature work and <b>pairs full time</b>, with the learner typing (driver) so the skill moves to their hands.', flow: ['cur>pair', 'pair>team'], warn: ['pair'], badges: { pair: 'full time' } },
        { text: 'Every incident they handle together becomes a <b>runbook</b>, reviewed by someone who did not write it. Tacit knowledge becomes explicit.', flow: ['rb>pair'], ok: ['rb'] },
        { text: 'Two people reach competent before the last day. Lesson: run this plan <b>before</b> the resignation; a bus factor of 1 is a risk-register item.', flow: ['meas>gap'], ok: ['team'], badges: { gap: ['bus factor 2', 'warn'] }, tone: 'warn' }
      ]
    },
    {
      id: 'scale', title: 'At scale: 20 teams, one new stack', tone: 'info',
      steps: [
        { text: 'Twenty teams must adopt the new platform. One architect cannot pair with 160 engineers.', nodes: ['arch', 'team'], warn: ['arch'], badges: { arch: ['1 : 160', 'warn'] } },
        { text: 'Train-the-trainer: a small <b>enabling group</b> teaches one champion per team through mob sessions; champions then pair inside their teams.', flow: ['cur>pair', 'pair>team'], badges: { pair: 'champions' } },
        { text: 'A <b>guild</b> (community of practice) meets every two weeks: show-and-tell, a kata, an incident review. It is voluntary and peer-led.', flow: ['cur>guild', 'guild>team'], ok: ['guild'] },
        { text: '<b>Runbooks</b> and an onboarding path carry the knowledge to new hires without a meeting. The platform team tracks adoption and incident escalations.', flow: ['rb>pair', 'team>prod', 'prod>meas'], ok: ['rb', 'meas'], tone: 'ok' }
      ]
    },
    {
      id: 'measure', title: 'Measuring impact with Kirkpatrick', tone: 'info',
      steps: [
        { text: '<b>Level 1, reaction</b>: did people find it useful? Cheap to collect, weakly linked to results.', nodes: ['ws'], badges: { ws: 'L1' } },
        { text: '<b>Level 2, learning</b>: can they do it in a controlled setting? A kata or a runbook drill in a sandbox.', nodes: ['pair'], badges: { pair: 'L2' } },
        { text: '<b>Level 3, behaviour</b>: do they do it on the job? Count PRs, reviews and on-call incidents handled without escalation.', flow: ['pair>team'], badges: { team: 'L3' } },
        { text: '<b>Level 4, results</b>: did the organisation improve? Time to restore, change failure rate, lead time on the new stack, fewer escalations.', flow: ['team>prod', 'prod>meas'], ok: ['meas'], badges: { meas: ['L4', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real choice for a 40-engineer group adopting a new architecture over two quarters. Numbers are <em>illustrative</em>, built from the reasoning above: practice beats exposure, spacing beats cramming, and measured behaviour beats attendance.',
    controls: [
      { id: 'fmt', label: 'Format mix', type: 'seg', value: 'mix', options: [
        { v: 'talks', l: 'Talks / courses only' }, { v: 'ws', l: 'Workshops + katas' }, { v: 'mix', l: 'Pairing + mob + guild' }] },
      { id: 'time', label: 'Protected learning time', type: 'range', min: 0, max: 20, step: 1, value: 10, unit: '%', fmt: (v) => v + '% of capacity' },
      { id: 'meas', label: 'What you measure', type: 'seg', value: 'applied', options: [
        { v: 'attend', l: 'Attendance / satisfaction' }, { v: 'applied', l: 'Applied outcomes' }] },
      { id: 'own', label: 'Who owns the plan', type: 'seg', value: 'arch', options: [
        { v: 'central', l: 'Central L&D' }, { v: 'arch', l: 'Architect-led' }, { v: 'peer', l: 'Peer-led' }] }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const t = s.time / 100;
      const practice = { talks: 0.15, ws: 0.55, mix: 0.9 }[s.fmt];             // share of learning that is hands-on
      const relevance = { central: 0.5, arch: 0.9, peer: 0.75 }[s.own];         // tied to the target architecture?
      const timeF = clamp(t / 0.1);                                              // saturates at 10 %
      let growth = clamp(0.1 + 0.75 * practice * relevance * (0.3 + 0.7 * timeF) + (s.meas === 'applied' ? 0.08 : 0));
      let retention = clamp(0.15 + 0.7 * practice + (s.meas === 'applied' ? 0.1 : -0.05) + (s.own === 'peer' ? 0.05 : 0) - (t === 0 ? 0.15 : 0));
      let delivery = clamp(growth * retention * 1.3 - Math.max(0, t - 0.1) * 2.5 - (s.fmt === 'mix' ? 0.03 : 0));
      const costPct = Math.round(s.time + { talks: 2, ws: 3, mix: 4 }[s.fmt] + (s.own === 'central' ? 2 : 0));
      let engage = clamp({ talks: 0.35, ws: 0.6, mix: 0.75 }[s.fmt] + { central: -0.1, arch: 0.05, peer: 0.15 }[s.own] + (s.meas === 'attend' ? -0.05 : 0) - (t === 0 ? 0.25 : 0));
      const bus = Math.max(1, Math.round(1 + 4 * growth * retention * (s.fmt === 'mix' ? 1.2 : s.fmt === 'ws' ? 0.8 : 0.4)));
      const lvl = (x) => (x >= 0.7 ? 'high' : x >= 0.45 ? 'medium' : 'low');
      const metrics = [
        { k: 'Skill growth (2 quarters)', v: '+' + (growth * 1.5).toFixed(1) + ' levels', s: growth, hint: 'illustrative' },
        { k: 'Retention after 3 months', v: Math.round(retention * 100) + '%', s: retention },
        { k: 'Delivery impact', v: lvl(delivery), s: delivery, hint: 'Kirkpatrick L4' },
        { k: 'Cost (capacity spent)', v: '≈ ' + costPct + '%', s: clamp(1 - costPct / 25) },
        { k: 'Engagement', v: lvl(engage), s: engage },
        { k: 'Bus factor (critical skill)', v: String(bus), s: clamp((bus - 1) / 3) }
      ];
      const notes = [];
      if (s.fmt === 'talks') notes.push('Talks and courses build awareness (Bloom: remember, understand) but not the ability to <b>apply</b>. Without practice it fades within weeks.');
      if (s.fmt === 'ws') notes.push('Workshops followed by <b>weekly katas</b> give spaced practice. Add paired real tickets to reach the apply / analyse levels.');
      if (s.fmt === 'mix') notes.push('Pairing and mob programming are learning <b>on real work</b>: knowledge spreads as a side effect of delivery, and the guild keeps it alive.');
      if (s.time === 0) notes.push('With <b>no protected time</b>, learning is the first thing cut every sprint. Expect the plan to stall.');
      if (s.time > 15) notes.push('Above ~15% the time comes straight out of delivery; it pays only if the gap blocks the roadmap.');
      if (s.meas === 'attend') notes.push('Attendance is Kirkpatrick level 1. It tells you people showed up, not that <b>behaviour</b> changed. Track escalations and incidents handled.');
      if (s.own === 'central') notes.push('Central L&amp;D scales logistics but rarely knows the target architecture; content drifts towards generic courses.');
      if (s.own === 'peer') notes.push('Peer-led (like g2g or guilds) is engaging and cheap, but needs an architect to keep it pointed at the <b>critical</b> gaps.');
      let verdict;
      if (s.fmt === 'talks' && s.meas === 'attend') verdict = '❌ <b>Training theatre</b>: high seat counts, little lasting skill. Add practice and measure behaviour.';
      else if (s.time === 0) verdict = '❌ <b>No time, no learning.</b> Protect at least a few hours a week before choosing formats.';
      else if (s.fmt === 'talks') verdict = '⚠ <b>Awareness only.</b> Courses alone rarely move people past advanced beginner; add pairing or katas.';
      else if (s.meas === 'attend') verdict = '⚠ <b>Good formats, blind measurement.</b> Switch to applied outcomes so you can prove impact and adjust.';
      else if (s.time > 15) verdict = '⚠ <b>Effective but expensive.</b> Fine for a short push; drop to 5–10% once the critical gaps close.';
      else if (s.fmt === 'mix' && s.own !== 'central') verdict = '✅ <b>Practice on real work, owned close to the architecture, measured by outcomes.</b> This is the shape that raises the floor.';
      else verdict = '👍 <b>Solid plan.</b> Tie the content to the target architecture and keep spacing the practice.';
      const flow = (s.fmt === 'talks' ? ['cur>ws', 'ws>team'] : s.fmt === 'ws' ? ['cur>ws', 'ws>team'] : [['cur>pair', 'cur>guild'], 'pair>team']).concat(['team>prod', 'prod>meas']);
      return {
        metrics, verdict, notes, flow,
        labels: {
          ws: { label: s.fmt === 'talks' ? 'Talks · courses' : 'Workshops · katas', sub: s.fmt === 'talks' ? 'listen only' : 'teach, then drill' },
          cur: { label: 'Learning path', sub: { central: 'central L&D', arch: 'architect-led', peer: 'peer-led' }[s.own] },
          lead: { label: 'Eng manager', sub: s.time + '% time' },
          meas: { label: 'Impact', sub: s.meas === 'attend' ? 'attendance only' : 'Kirkpatrick L3–L4' }
        },
        hot: s.fmt === 'mix' ? ['pair', 'guild'] : s.fmt === 'ws' ? ['ws'] : [],
        warn: (s.meas === 'attend' ? ['meas'] : []).concat(s.own === 'central' ? ['cur'] : []),
        err: (s.time === 0 ? ['lead'] : []).concat(s.fmt === 'talks' ? ['ws'] : []),
        ok: s.fmt === 'mix' && s.meas === 'applied' ? ['team', 'prod'] : [],
        badges: { mx: ['bus factor ' + bus, bus >= 3 ? 'ok' : bus === 2 ? 'warn' : 'err'], team: ['retain ' + Math.round(retention * 100) + '%', retention > 0.6 ? 'ok' : 'warn'] }
      };
    }
  },

  widget: {
    title: 'Team skills heat-map: practice, forgetting and bus factor',
    caption: 'Rows are people, columns are skills, colour is the <b>Dreyfus level</b> (1 novice → 5 expert). <b>Tap a cell</b> to choose a learner and skill, apply a training plan, then <b>advance weeks</b>. Practised cells grow along a learning curve; skills that are not used <b>decay</b>. The bottom row is the bus factor: people at level 3 or above.'
  },

  realWorld: {
    intro: 'The ideas are older than software: skill stages from 1980, communities of practice from 1991, and a forgetting curve from 1885 that was replicated in 2015. Each item links to its source.',
    timeline: [
      { when: '1980', who: 'Stuart & Hubert Dreyfus', title: 'A five-stage model of skill acquisition', text: 'An 18-page report for the US Air Force Office of Scientific Research, UC Berkeley. As people gain skill they depend <b>less on abstract rules and more on concrete experience</b>. The report named novice, competence, proficiency, expertise and mastery; the later book <i>Mind over Machine</i> (1986) uses novice, advanced beginner, competent, proficient, expert.', src: 0 },
      { when: '1885 → 2015', who: 'Murre & Dros', title: 'The forgetting curve, replicated', text: 'Ebbinghaus measured how fast memorised material is lost. Murre and Dros repeated the experiment (one subject, about 70 hours of learning, relearning after 20 minutes up to 31 days) and found results <b>similar to the original</b>, with an upward jump at the 24-hour point (<i>PLOS ONE</i>, 2015).', src: 1 },
      { when: '2006', who: 'Cepeda, Pashler, Vul, Wixted, Rohrer', title: 'Spaced practice, quantified', text: 'A meta-analysis of <b>839 assessments in 317 experiments</b> (<i>Psychological Bulletin</i>). Spacing study sessions improves retention, and the best gap between sessions <b>grows with how long you need to remember</b>. This is the research behind weekly katas instead of one long course.', src: 2 },
      { when: '1991 → 2015', who: 'Lave & Wenger · Wenger-Trayner', title: 'Communities of practice', text: '"Groups of people who share a concern or a passion for something they do and learn how to do it better as they interact regularly." Three elements: a <b>domain</b>, a <b>community</b> and a <b>practice</b>; a community of interest alone is not one.', src: 3 },
      { when: '1999 → 2014', who: 'Dave Thomas · Ted Neward', title: 'Code katas and architectural katas', text: 'Thomas, co-author of <i>The Pragmatic Programmer</i>, coined <b>code kata</b> for small exercises repeated to build fluency. Neward adapted it as <b>architectural katas</b>: small groups design a system from a short brief and present it for critique, because architects get few chances to practise designing. Neal Ford maintains a public set.', src: 4 },
      { when: '2014', who: 'Woody Zuill, Hunter Industries', title: 'Mob programming: a whole-team approach', text: 'Experience report at Agile2014. The practice grew out of the team\'s <b>coding dojo</b> learning sessions: the whole team works on the same thing, at the same time, at one computer, rotating the driver. Learning spreads as a side effect of delivery.', src: 5 },
      { when: '2014', who: 'Spotify', title: 'Guilds as cross-team learning', text: 'Kniberg\'s "Spotify Engineering Culture" describes guilds as communities of interest across the whole company that anyone can join. Treat it as a snapshot of one company in 2014, not a template.', src: 6 },
      { when: 'Ongoing', who: 'Google', title: 'g2g: Googlers teaching Googlers', text: 'Google\'s re:Work guide describes employee-led learning where employees teach each other voluntarily, supported by a culture that values learning, with teachers recognised for it. Third-party write-ups quote larger figures that Google itself does not publish there.', src: 7 },
      { when: 'Ongoing', who: 'Kirkpatrick Partners · DORA', title: 'Measure behaviour and results', text: 'The Kirkpatrick model evaluates training at four levels: <b>reaction, learning, behaviour, results</b>; the New World version adds "required drivers" that reinforce behaviour on the job. DORA lists <b>learning culture</b> among the capabilities that predict software delivery performance.', src: 8 }
    ],
    lessons: [
      'Skill is built by <b>practice with feedback</b>, and lost by disuse. Plan the practice, not just the teaching.',
      '<b>Spread practice out</b>: weekly short sessions beat one long course for anything you need in months.',
      'Peer-led and voluntary formats (g2g, guilds) are engaging, but someone must keep them aimed at the <b>critical gaps</b>.',
      'Evaluate at Kirkpatrick levels 3–4: did <b>behaviour on the job</b> change, and did delivery improve?'
    ],
    sources: [
      { title: 'A Five-Stage Model of the Mental Activities Involved in Directed Skill Acquisition', url: 'https://apps.dtic.mil/sti/pdfs/ADA084551.pdf', pub: 'S. E. Dreyfus & H. L. Dreyfus, UC Berkeley ORC, 1980' },
      { title: 'Replication and Analysis of Ebbinghaus\' Forgetting Curve', url: 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0120644', pub: 'Murre & Dros, PLOS ONE, 2015' },
      { title: 'Distributed practice in verbal recall tasks: A review and quantitative synthesis', url: 'https://pubmed.ncbi.nlm.nih.gov/16719566/', pub: 'Cepeda et al., Psychological Bulletin, 2006' },
      { title: 'Introduction to communities of practice', url: 'https://www.wenger-trayner.com/introduction-to-communities-of-practice/', pub: 'Wenger-Trayner, 2015' },
      { title: 'Architectural Katas', url: 'https://nealford.com/katas/about.html', pub: 'Neal Ford (after Ted Neward)' },
      { title: 'Mob Programming: A Whole Team Approach (experience report)', url: 'https://agilealliance.org/resources/experience-reports/mob-programming-agile2014', pub: 'Woody Zuill, Agile Alliance, 2014' },
      { title: 'Spotify Engineering Culture (part 1)', url: 'https://engineering.atspotify.com/spotify-engineering-culture-part-1/', pub: 'Spotify Engineering, 2014' },
      { title: 'Employee-led learning: principles and practice', url: 'https://rework.withgoogle.com/intl/en/guides/employee-led-learning-principles-and-practice', pub: 'Google re:Work' },
      { title: 'The Kirkpatrick Model', url: 'https://www.kirkpatrickpartners.com/the-kirkpatrick-model/', pub: 'Kirkpatrick Partners' },
      { title: 'DevOps capabilities (DORA)', url: 'https://docs.cloud.google.com/architecture/devops', pub: 'Google Cloud Architecture Center' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Format', '<b>Courses and talks</b>: cheap per head, broad awareness', '<b>Pairing, mob, katas</b>: hands-on, slower to scale', 'Talks to introduce; practice formats for every <b>critical</b> skill'],
      ['Who teaches', '<b>External trainers</b>: polished, generic', '<b>Internal experts</b>: your stack, your runbooks, costs their time', 'External for foundations; internal for how <i>we</i> build and run it'],
      ['Timing', '<b>Bootcamp</b>: one intense week', '<b>Spaced</b>: a few hours every week for a quarter', 'Spaced for retention; a bootcamp only to kick off, followed by weekly practice'],
      ['Ownership', '<b>Central L&amp;D</b>: logistics and budget at scale', '<b>Architect / peer-led</b>: relevant, engaging', 'Architect defines what and why; peers run it; L&amp;D supports logistics'],
      ['Depth vs breadth', '<b>T-shaped</b>: everyone broad, a few deep', '<b>Specialists</b>: deep silos', 'T-shaped for product teams; keep a few deep experts, but never only one per critical skill'],
      ['Measurement', '<b>Attendance, satisfaction</b> (L1)', '<b>Behaviour and results</b> (L3–L4)', 'Always aim for L3–L4; use L1 only to fix the session itself']
    ]
  },
  failures: [
    { f: 'Training without practice', detect: 'Course completed, but the skill does not appear in PRs or on-call within weeks', fix: 'Pair every session with follow-up work within days: a kata, a paired ticket, a runbook drill.' },
    { f: 'Bus factor of one', detect: 'All incidents for a system escalate to one person; their holiday blocks releases', fix: 'Make teaching part of the expert\'s job: pair with the learner driving, write runbooks, rotate on-call.' },
    { f: 'Matrix used for ranking', detect: 'Self-ratings rise every quarter while incidents do not fall; people hide gaps', fix: 'Separate it from performance reviews; base levels on evidence; use it for planning only.' },
    { f: 'Learning time always cut', detect: 'Learning hours planned vs spent drop below 50% for two sprints', fix: 'Make it a visible line in capacity planning, owned by the manager; protect a fixed slot.' },
    { f: 'Guild as a mandatory meeting', detect: 'Attendance falls; no one volunteers to present', fix: 'Keep it voluntary and practical: katas, incident reviews, show-and-tell; rotate coordinators.' },
    { f: 'Content not tied to the architecture', detect: 'Popular courses, but critical skills in the matrix do not move', fix: 'Start from the gap analysis: each activity names the critical skill and target level it serves.' },
    { f: 'Runbooks nobody can follow', detect: 'Game-day drills stall; people still call the author', fix: 'Have someone who did not write it run it; add the why and a verification check to each step.' }
  ],

  interview: [
    { q: 'Why is upskilling an architect\'s job and not only the manager\'s?', a: '<p>Because <b>feasibility is a quality of the architecture</b>. A design the team cannot build, operate or debug is not a real option. The architect knows which skills the target design needs and at what level, and owns the risk if they are missing.</p><p>The manager owns time and budget; the architect owns <b>what</b> must be learned and <b>why</b>, and is often the best first teacher.</p>', lvl: 'core' },
    { q: 'Describe the Dreyfus model and how you would use it in a skills matrix.', a: '<p>Stuart and Hubert Dreyfus (1980 report, later <i>Mind over Machine</i>): <b>novice → advanced beginner → competent → proficient → expert</b>. Novices follow context-free rules; experts act from experience and intuition.</p><p>In a matrix, define each level by <b>observable evidence</b> for that skill, e.g. Kafka level 3 = "diagnosed consumer lag and fixed it unaided". Misreading: it is not years of experience, and people are at different levels in different skills.</p>', fu: 'How do you stop self-ratings inflating? (Evidence per level, peer calibration, never tie it to pay.)', lvl: 'core' },
    { q: 'How do you compute and improve the bus factor of a skill?', a: '<p>Count people at <b>competent or above</b> who could handle the work without the expert. For a codebase you can approximate from authorship: how many top authors must leave before most files are orphaned.</p><p>Improve it with <b>pairing with the learner driving</b>, rotating on-call with shadowing, runbooks reviewed by non-authors, and making teaching part of the expert\'s goals. Target at least 3 for critical skills (rule of thumb).</p>', lvl: 'core' },
    { q: 'How would you design a curriculum for a team moving to event-driven architecture?', a: '<ol><li>Derive skills from the target: Kafka operations, schema evolution, idempotent consumers, sagas, observability.</li><li>Write <b>objectives as behaviour</b> mapped to Bloom (revised 2001: remember, understand, apply, analyse, evaluate, create): "can design an idempotent consumer" is <i>create</i>.</li><li>Sequence: short workshop → weekly katas → paired real tickets → lead a design review.</li><li>Space practice over a quarter; re-assess the matrix at the end.</li></ol>', lvl: 'deep' },
    { q: 'Pairing, mob programming, katas, guilds: when would you use each?', a: '<ul><li><b>Pairing</b>: move a skill from an expert to one learner on real work.</li><li><b>Mob/ensemble</b> (Zuill, 2014): a hard or new problem the whole team must understand; spreads knowledge fast but costs the whole team\'s time.</li><li><b>Katas / dojos</b>: deliberate practice in a safe setting, good for TDD and refactoring skills.</li><li><b>Guild / community of practice</b> (Wenger): keep a skill alive across teams over years.</li><li><b>Architecture katas</b> (Neward): practise design trade-offs.</li></ul>', lvl: 'core' },
    { q: 'How do you measure whether upskilling worked?', a: '<p>Use <b>Kirkpatrick</b>: L1 reaction, L2 learning, L3 behaviour, L4 results. Most programmes stop at L1. Aim at L3–L4:</p><ul><li>L3: incidents handled without escalation, PRs and reviews on the new stack, people leading drills.</li><li>L4: DORA outcomes on the new stack (time to restore, change failure rate, lead time), fewer expert escalations, bus factor per critical skill.</li></ul><p>Compare against a baseline taken before the plan starts.</p>', lvl: 'core' },
    { q: 'How much time should a team spend learning, and how do you protect it?', a: '<p>A common rule of thumb is <b>5–10% of capacity</b>, more for a short push before a big migration. Make it a visible line in capacity planning, in a fixed slot (e.g. a weekly half-day), owned by the manager.</p><p>Better still, make learning part of delivery: pair on real tickets so the learning time also ships work. Avoid "20% time" promises that are never honoured.</p>', lvl: 'deep' },
    { q: 'What makes a runbook a good teaching tool?', a: '<p>Each step has <b>what to do, why, and how to verify</b>; it starts with symptoms and links to dashboards; it is drilled in game days by someone who did not write it. Over time the reader learns the system\'s model, not just the commands.</p><p>Runbooks turn tacit expert knowledge into explicit knowledge, which directly raises the bus factor.</p>', lvl: 'deep' },
    { q: 'Behavioural: Tell me about a time you raised a team\'s skills to make an architecture change possible.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> We chose Kafka for order events, but only one engineer of 18 had run it; every incident escalated to him.</p><p><b>T:</b> As architect, make the design operable by the teams within two quarters.</p><p><b>A:</b> Built a skills matrix with evidence-based levels; Kafka bus factor was 1. Wrote a learning path with three objectives, got 4 hours a week protected, ran a workshop followed by weekly katas, and had the expert pair with two engineers on real tickets with the learner driving. Every incident became a reviewed runbook.</p><p><b>R:</b> After two quarters 4 people were at competent, expert escalations fell from about 12 to 3 a month, and time to restore halved. Lesson: start the pairing before the platform goes live.</p>', lvl: 'deep' },
    { q: 'Behavioural: Describe a training initiative that did not work and what you changed.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> We sent 30 engineers on a two-day Kubernetes course; satisfaction was 4.6 out of 5.</p><p><b>T:</b> Three months later I was asked why the platform was still barely used.</p><p><b>A:</b> Checked the matrix and incident tickets: almost nobody had touched a cluster since. Replaced further courses with a monthly mob session on a real migration, weekly 1-hour katas, and an onboarding path where each team moved one service with a platform engineer pairing.</p><p><b>R:</b> 9 services migrated in the next quarter versus 1 before. I now never approve training without a scheduled application within two weeks.</p>', lvl: 'deep' },
    { q: 'Behavioural: How did you convince leadership to fund learning time during a delivery crunch?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Roadmap pressure; learning time was being cut every sprint.</p><p><b>T:</b> Keep the upskilling plan alive without missing the quarter.</p><p><b>A:</b> Framed it as <b>risk and cost</b>: one person held three critical skills, and his last holiday had blocked two releases. Showed incident escalations and lead-time data, proposed halving dedicated time to 5% but moving most learning into paired real tickets, and agreed to report bus factor monthly.</p><p><b>R:</b> Approved; the quarter shipped, and bus factor for the three skills went from 1 to 3. Lesson: speak in delivery risk, not in "training".</p>', lvl: 'core' },
    { q: 'Behavioural: Tell me about mentoring someone from beginner to independent.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> A mid-level engineer wanted to own our payment reconciliation service, which only I understood.</p><p><b>T:</b> Make her independent within a quarter without slowing the team.</p><p><b>A:</b> Agreed observable goals (run a reconciliation, debug a mismatch, review a schema change). Paired twice a week with her driving, moved from "I show" to "you do, I watch" to "you do, I review", and had her rewrite the runbook in her own words.</p><p><b>R:</b> She took the on-call rota after 10 weeks and led the next schema change. I learned to hand over decisions, not just tasks.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'skills-matrix.yaml: levels with evidence', lang: 'yaml',
      code: `# Dreyfus levels: 1 novice, 2 advanced beginner, 3 competent,
#                 4 proficient, 5 expert. Evidence beats self-rating.
skills:
  kafka:   { critical: true,  target: 3, min_competent: 3, adr: ADR-014 }
  k8s:     { critical: true,  target: 3, min_competent: 3, adr: ADR-011 }
  otel:    { critical: true,  target: 3, min_competent: 2, adr: ADR-017 }
  ddd:     { critical: false, target: 3, min_competent: 2 }
people:
  ana:
    kafka: { level: 5, evidence: "ran partition reassignment in prod", on: 2026-09-02 }
    k8s:   { level: 3, evidence: "led cluster upgrade drill", on: 2026-08-15 }
    otel:  { level: 2, on: 2026-07-01 }
  ben:
    kafka: { level: 2, evidence: "paired on consumer-lag ticket", on: 2026-10-01 }
    k8s:   { level: 4, evidence: "owns ingress runbook", on: 2026-09-20 }
    ddd:   { level: 3, on: 2026-06-11 }
  chen:
    kafka: { level: 1, on: 2026-10-01 }
    otel:  { level: 4, evidence: "built tracing pipeline", on: 2026-08-30 }
    ddd:   { level: 2, on: 2026-06-11 }
  dana:
    k8s:   { level: 2, on: 2026-09-20 }
    otel:  { level: 1, on: 2026-07-01 }
    ddd:   { level: 4, evidence: "facilitated event storming", on: 2026-05-04 }`,
      note: 'Missing cells mean level 1. Link each critical skill to the ADR that created the need, so the matrix changes when the architecture does.'
    },
    {
      title: 'Python: gaps, bus factor and a pairing plan', lang: 'python',
      code: `"""Read skills-matrix.yaml; print gaps, bus factor, pairings. Python 3.11+, PyYAML."""
import sys
import yaml

COMPETENT = 3

def main(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    skills, people = doc["skills"], doc["people"]
    level = lambda p, s: people[p].get(s, {}).get("level", 1)
    busy: set[str] = set()                       # one pairing per learner
    for s, meta in sorted(skills.items(), key=lambda kv: not kv[1]["critical"]):
        lv = {p: level(p, s) for p in people}
        avg = sum(lv.values()) / len(lv)
        bus = sum(1 for v in lv.values() if v >= COMPETENT)
        flag = "RISK" if meta["critical"] and bus < meta["min_competent"] else "ok"
        print(f"{s:6} avg {avg:.1f}/{meta['target']}  bus factor {bus}  {flag}")
        if bus >= meta["min_competent"]:
            continue
        mentors = sorted((p for p, v in lv.items() if v >= 4), key=lv.get, reverse=True)
        learners = sorted((p for p, v in lv.items() if v < COMPETENT and p not in busy),
                          key=lv.get, reverse=True)   # closest to competent first
        need = meta["min_competent"] - bus
        for mentor, learner in zip(mentors * need, learners[:need]):
            busy.add(learner)
            print(f"  pair {mentor} -> {learner} ({lv[learner]} -> {COMPETENT}), learner drives")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "skills-matrix.yaml")`,
      note: 'With the YAML above, Kafka has bus factor 1 and the plan pairs ana with ben, then chen. Run it each quarter in CI and chart the bus factor per critical skill next to escalations.'
    },
    {
      title: 'Runbook template that teaches (markdown)', lang: 'bash',
      code: `# Runbook: Kafka consumer lag on orders-events
# Owner: payments-team   Reviewed by a non-author: 2026-10-14
# Skill: kafka (level 3 objective: diagnose and fix lag unaided)

## Symptoms
# - Alert ConsumerLagHigh > 10k messages for 10 min
# - Dashboard: grafana/d/kafka-consumers  (links, not screenshots)

## 1. Check whether the consumer group is alive
kafka-consumer-groups.sh --bootstrap-server "$BROKER" \\
  --describe --group orders-projector
# WHY: lag with no active members means the app is down, not slow.
# VERIFY: CONSUMER-ID column is filled for every partition.

## 2. Is one partition hot, or are all lagging?
# WHY: one hot partition = key skew; all lagging = throughput.
# VERIFY: compare LAG per partition in the output above.

## 3. Scale out (only if partitions > running consumers)
kubectl -n orders scale deploy/orders-projector --replicas=6
# WHY: consumers beyond the partition count sit idle.
# VERIFY: lag trend falls within 15 min.

## Escalate if
# - lag still rising after step 3, or poison message suspected
## After the incident
# - add what surprised you here; next game day: run this blind`,
      note: 'Every step has <b>what, why, verify</b>. The "run this blind" game day is a level-2 check (Kirkpatrick); handling the next real alert alone is level 3.'
    }
  ],

  related: ['conways-law', 'platform-engineering', 'architecture-governance', 'rfcs-adrs', 'documenting-architecture', 'tech-debt']
});
