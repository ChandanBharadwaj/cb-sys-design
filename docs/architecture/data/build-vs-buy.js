(function () {
  /* Shared 5-year cost model (monthly steps). Used by the calculator outputs. All $ amounts.
     Estimates: infra ≈ $1 per user per month when you run it yourself, SaaS integration ≈ 4 engineer-months,
     SaaS admin ≈ 0.25 FTE, OSS setup ≈ 30% of the custom build effort, OSS run ≈ 80% of the custom run team. */
  function tco(v) {
    const cost = v.cost * 1000, g = v.growth / 100, INFRA = 1;
    const out = { build: [], saas: [], oss: [], users: [] };
    let b = 0, s = 0, o = 0;
    const ossSetup = Math.max(1, Math.round(v.months * 0.3));
    for (let m = 1; m <= 60; m++) {
      const u = v.users * Math.pow(1 + g, (m - 1) / 12);
      b += m <= v.months ? v.team * cost / 12 : v.runFte * cost / 12 + u * INFRA;
      s += v.price * u + 0.25 * cost / 12 + (m === 1 ? cost * 4 / 12 : 0);
      o += m <= ossSetup ? v.team * cost * v.months * 0.3 / 12 / ossSetup : Math.max(0.5, v.runFte * 0.8) * cost / 12 + u * INFRA;
      out.build.push(b); out.saas.push(s); out.oss.push(o); out.users.push(u);
    }
    return out;
  }
  const $ = (n) => '$' + SD.fmt.num(n);
  const yearCost = (arr, y) => arr[y * 12 - 1] - (y > 1 ? arr[(y - 1) * 12 - 1] : 0);

  SD.register({
    slug: 'build-vs-buy',
    domain: 3,
    title: 'Build vs Buy vs Rent',
    examples: 'Wardley maps, TCO, decision matrix',
    tagline: 'Spend your engineers on what makes customers choose you. For everything else, <b>buy, rent or adopt</b>, and keep a door open to leave.',
    tldr: {
      problem: 'Every capability (login, feature flags, search, billing, pricing) can be built in-house, bought as a licensed product, rented as SaaS or adopted as open source. Teams usually decide by taste, then pay for years.',
      idea: 'Sort capabilities into <b>core</b> (differentiating) and <b>context</b> (necessary but generic). Place each on a <b>Wardley map</b> by how evolved it is. Build what is core and novel; rent what is commodity. Check with a <b>5-year TCO</b> and a <b>weighted decision matrix</b>, then write an <b>ADR with an exit plan</b>.',
      insight: 'The licence or subscription is rarely the biggest number. <b>Run cost</b> (on-call, upgrades, patching) and <b>opportunity cost</b> (what your engineers did not build) usually decide it, and the <b>exit cost</b> decides how bad a wrong choice is.',
      numbers: [
        { v: '4 stages', l: 'Wardley evolution: genesis → custom → product → commodity' },
        { v: '3 in 4 yrs', l: 'major OSS relicensings: Elastic 2021, HashiCorp 2023, Redis 2024' },
        { v: '3–5 yrs', l: 'usual TCO horizon for the decision (rule of thumb)' }
      ]
    },

    intro: {
      what: 'Build vs buy is the decision about <b>who makes and runs</b> a piece of your system. You can <b>build</b> it yourself, <b>buy</b> a product and run it, <b>rent</b> it as a service someone else runs (SaaS or a managed cloud service), or <b>adopt open source</b> and run or support it yourself. The architect\'s job is to pick per capability, not once for the whole company.',
      analogy: {
        icon: '🍽️',
        title: 'A restaurant decides what to cook from scratch',
        text: 'A good restaurant makes its <b>signature dishes</b> in-house, because that is why people come. It buys bread from a bakery, rents the dishwasher on a service contract, and uses the city\'s water supply. Nobody chooses a restaurant because it generates its own electricity. The analogy breaks in one place: switching bakeries is easy, while switching software suppliers can take months.'
      },
      problem: 'A team of eight spends a year building its own feature-flag service, login system and job scheduler. Each works, but each needs upgrades, security patches and an on-call rota. The product roadmap slips because half the team now <b>runs utilities</b>. The question this page answers is <b>"which capabilities deserve our scarce engineers, and what does each option really cost over five years?"</b>',
      story: [
        {
          stage: 'naive',
          title: 'Build everything ourselves',
          text: 'Engineers can build anything, and building feels cheaper than a subscription: <b>"it\'s just a few weeks of work"</b>. So the team builds flags, login and billing in-house, alongside the product.',
          scene: {
            nodes: [
              { id: 'need', label: 'New needs', sub: 'flags, login, bill', kind: 'client', at: [210, 0] },
              { id: 'team', label: 'Our engineers', sub: 'build it all', kind: 'team', at: [210, 110] },
              { id: 'a', label: 'Flags (ours)', sub: 'custom', kind: 'service', at: [70, 220] },
              { id: 'b', label: 'Login (ours)', sub: 'custom', kind: 'service', at: [210, 220] },
              { id: 'c', label: 'Billing (ours)', sub: 'custom', kind: 'service', at: [350, 220] }
            ],
            edges: [{ from: 'need', to: 'team' }, { from: 'team', to: 'a' }, { from: 'team', to: 'b' }, { from: 'team', to: 'c' }],
            flow: ['need>team', ['team>a', 'team>b', 'team>c']]
          }
        },
        {
          stage: 'breaks',
          title: 'The build was the cheap part',
          text: 'A year later each system needs upgrades, CVE patches and someone on call. The engineers who wrote them are the only ones who understand them. The <b>product</b>, the thing customers pay for, gets the time that is left over.',
          scene: {
            nodes: [
              { id: 'need', label: 'Product work', sub: 'roadmap slips', kind: 'client', at: [210, 0] },
              { id: 'team', label: 'Our engineers', sub: '50% running utils', kind: 'team', at: [210, 110] },
              { id: 'a', label: 'Flags (ours)', sub: 'upgrade due', kind: 'service', at: [70, 220] },
              { id: 'b', label: 'Login (ours)', sub: 'CVE to patch', kind: 'service', at: [210, 220] },
              { id: 'c', label: 'Billing (ours)', sub: 'on-call page', kind: 'service', at: [350, 220] }
            ],
            edges: [{ from: 'need', to: 'team' }, { from: 'team', to: 'a' }, { from: 'team', to: 'b' }, { from: 'team', to: 'c' }],
            flow: [['a>team', 'b>team', 'c>team'], 'team>need'],
            err: ['b', 'need'], warn: ['a', 'c', 'team'],
            badges: { team: ['overloaded', 'err'], need: ['late ⏳', 'warn'] }
          }
        },
        {
          stage: 'fix',
          title: 'Build the core, rent the context',
          text: 'Ask one question per capability: <b>"does this make customers choose us?"</b> Only the pricing engine passes, so the team builds it. Login is rented as a service, flags come from SaaS behind a small interface, and billing uses a product. Each choice has an <b>exit plan</b>.',
          scene: {
            nodes: [
              { id: 'need', label: 'Capability', sub: 'differentiates?', kind: 'policy', at: [210, 0] },
              { id: 'team', label: 'Our engineers', sub: 'core only', kind: 'team', at: [70, 110] },
              { id: 'p', label: 'Pricing engine', sub: 'BUILD · core', kind: 'service', at: [70, 220] },
              { id: 'a', label: 'Flags', sub: 'RENT · SaaS', kind: 'external', at: [210, 220] },
              { id: 'b', label: 'Login', sub: 'RENT · managed', kind: 'external', at: [350, 220] },
              { id: 'c', label: 'Billing', sub: 'BUY · product', kind: 'external', at: [350, 110] }
            ],
            edges: [{ from: 'need', to: 'team' }, { from: 'team', to: 'p' }, { from: 'need', to: 'a' }, { from: 'need', to: 'b' }, { from: 'need', to: 'c' }],
            flow: ['need>team', 'team>p', ['need>a', 'need>b', 'need>c']],
            ok: ['p', 'team'],
            badges: { p: ['why customers stay', 'ok'] }
          }
        }
      ],
      usedBy: ['Netflix (runs on AWS, builds its own streaming and recommendation stack)', 'Airbnb (moved observability from a vendor to in-house)', '37signals (left the public cloud for owned hardware)', 'Thoughtworks clients (bounded-buy vendor selection)', 'Every startup choosing Stripe, Auth0 or Okta over building'],
      whenToUse: [
        'A new capability is needed and there is a credible product, service or open-source project for it',
        'An existing in-house system costs more to run than it is worth (or a vendor bill is growing faster than revenue)',
        'A contract renewal, licence change or end-of-life forces a decision anyway'
      ],
      whenNot: [
        'Nothing comparable exists yet (Wardley <i>genesis</i>): you have to build, so spend the effort on learning fast',
        'The decision is cheap to reverse and small: pick the obvious default and move on rather than run a big evaluation',
        'The real question is cloud cost or vendor risk alone: see <a href="finops.html">FinOps</a> and <a href="risk-management.html">Risk Management</a>'
      ],
      glossary: [
        { term: 'Core vs context', def: 'Geoffrey Moore\'s split: core is what differentiates you to customers; context is everything else you must still do well.' },
        { term: 'Wardley map', def: 'A map of the components behind a user need, placed by visibility (y) and evolution (x: genesis, custom, product, commodity).' },
        { term: 'TCO', def: 'Total cost of ownership: every cost over a fixed horizon, including people, run, integration and exit, not just the price.' },
        { term: 'Opportunity cost', def: 'The value of the work your engineers could have done instead of building and running this.' },
        { term: 'Vendor lock-in', def: 'When leaving a supplier is so costly (data, APIs, skills, contracts) that you effectively cannot.' },
        { term: 'Exit cost', def: 'What it would cost to migrate away: data export, re-integration, retraining and running two systems in parallel.' },
        { term: 'Source-available licence', def: 'A licence (BSL, SSPL, RSAL) that publishes the code but restricts some uses, so it is not open source by the OSI definition.' },
        { term: 'Bus factor', def: 'How many key people could leave before a project (yours or an open-source one) stalls.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Build what differentiates</b>: only capabilities that make customers choose you get custom engineering',
        '<b>Decide per capability</b>, not per company or per platform',
        '<b>Match the option to evolution</b>: genesis → build, custom → build or partner, product → buy/OSS, commodity → rent',
        '<b>Compare full TCO</b> over the same horizon, including run, integration, opportunity and exit costs',
        '<b>Isolate every supplier</b> behind your own interface (port + adapter, bounded buy)',
        '<b>Write it down</b>: an ADR with the matrix, assumptions, an exit plan and a review date'
      ],
      nonFunctional: [
        'Time to first value ≤ 1 quarter for context capabilities',
        '≥ 70% of engineering hours on core capabilities (team target, not a law)',
        'Exit plan tested: data export runs at least once a year',
        'No single supplier sits inside more than one bounded context',
        'Renewal price caps in contract (e.g. ≤ CPI + a few % per year)',
        'Every OSS dependency has licence, CVE and maintainer health tracked'
      ],
      outOfScope: [
        '<b>Not-invented-here</b>: building a commodity because "ours will be better"',
        '<b>Vendor King</b>: one suite spreading into every part of the business',
        '<b>Customise until stuck</b>: heavy changes to a product that block its upgrades',
        '<b>Free = cheap</b>: adopting open source with no budget to run, patch or support it',
        '<b>Spreadsheet theatre</b>: tuning matrix weights until the favourite wins'
      ]
    },

    calculator: {
      inputs: [
        { id: 'team', label: 'Engineers to build it', min: 1, max: 20, value: 4 },
        { id: 'cost', label: 'Loaded cost per engineer ($K / year)', min: 60, max: 400, step: 10, value: 180, unit: 'K' },
        { id: 'months', label: 'Months to build v1', min: 1, max: 24, value: 6, unit: 'mo' },
        { id: 'runFte', label: 'People to run & maintain it after launch', min: 0.25, max: 5, step: 0.25, value: 1.5, unit: 'FTE' },
        { id: 'price', label: 'SaaS price per user per month ($)', min: 1, max: 100, value: 10, unit: '$' },
        { id: 'users', label: 'Users today', min: 100, max: 200000, value: 1000, log: true },
        { id: 'growth', label: 'User growth per year', min: 0, max: 150, step: 5, value: 40, unit: '%' }
      ],
      outputs: [
        { label: '5-year TCO: build in-house', f: (v) => $(tco(v).build[59]) },
        { label: '5-year TCO: rent (SaaS)', f: (v) => $(tco(v).saas[59]) },
        { label: '5-year TCO: open source, self-hosted', f: (v) => $(tco(v).oss[59]) },
        { label: 'Build becomes cheaper than SaaS', f: (v) => {
          const t = tco(v);
          if (t.build[59] > t.saas[59]) return 'not within 5 years';
          let last = -1;
          for (let m = 0; m < 60; m++) if (t.build[m] > t.saas[m]) last = m;
          if (last < 0) return 'from day one';
          return 'year ' + (Math.floor((last + 1) / 12) + 1) + ' (month ' + (last + 2) + ')';
        } },
        { label: 'Year-5 cost per user / month (build · SaaS · OSS)', f: (v) => {
          const t = tco(v), u = t.users.slice(48).reduce((a, b) => a + b, 0);
          return ['build', 'saas', 'oss'].map((k) => '$' + (yearCost(t[k], 5) / u).toFixed(2)).join(' · ');
        } },
        { label: 'Cheapest over 5 years', f: (v) => {
          const t = tco(v), r = [['Build', t.build[59]], ['SaaS', t.saas[59]], ['OSS', t.oss[59]]].sort((a, b) => a[1] - b[1]);
          return r[0][0] + ' by ' + $(r[1][1] - r[0][1]);
        } }
      ],
      note: 'Cash only, no discounting (see the Python NPV snippet below). <em>Estimates</em> built into the model: self-run infrastructure ≈ $1 per user per month, SaaS integration ≈ 4 engineer-months plus 0.25 FTE of admin, OSS setup ≈ 30% of the custom build, OSS run team ≈ 80% of the custom run team. SaaS cost grows <b>with users</b>; build cost grows <b>with people</b>. That is why growth flips the answer. What this ignores is the <b>opportunity cost</b>: those build months were not spent on your product.'
    },

    api: [
      { m: 'DOC', p: 'Weighted decision matrix', d: 'Criteria (time to value, 5-yr TCO, control, lock-in, ops burden, strategic fit, compliance) with <b>weights agreed before scoring</b>, a 1–5 score per option with evidence, and the weighted total. Include a sensitivity check: which weight change flips the winner?' },
      { m: 'DOC', p: 'TCO / NPV model', d: '3–5 year cash flows per option: build, run (infra, on-call, upgrades, patching), licence or subscription, integration, customisation, training, exit. State the discount rate and growth assumptions. Mark hidden costs explicitly.' },
      { m: 'ADR', p: 'ADR-0042: Feature flags: rent', d: 'Context, options considered, decision, consequences, <b>exit plan</b>, review trigger (e.g. "revisit at 50K MAU or a renewal +20%"). Status: proposed → accepted → superseded.' },
      { m: 'DOC', p: 'Vendor evaluation scorecard', d: 'Security (SOC 2, ISO 27001, pen tests), data residency, SLA and credits, API completeness, export formats, roadmap, financial health, references, and for OSS: licence, governance, maintainers, CVE response time.' },
      { m: 'POLICY', p: 'Exit plan', d: 'How data gets out (format, volume, time), which adapter replaces the supplier, parallel-run period, cost estimate, owner, and the <b>tested</b> date of the last export drill.' },
      { m: 'POLICY', p: 'Contract terms checklist', d: 'SLA with real credits, price escalation cap, termination assistance, data-return clause, notice period, source escrow for critical on-prem products, no auto-renewal surprises.' }
    ],

    dataModel: [
      { name: 'capability_map', store: 'Architecture repo (YAML) / Postgres', fields: [['capability_id', 'text', 'pk'], ['name', 'text'], ['evolution', 'genesis|custom|product|commodity', 'idx'], ['core_or_context', 'enum', 'idx'], ['current_option', 'build|buy|rent|oss'], ['owner_team', 'text', 'fk'], ['review_due', 'date']], note: 'One row per capability on the Wardley map. Re-evaluated as components drift right.' },
      { name: 'tco_line_item', store: 'Postgres / spreadsheet', fields: [['decision_id', 'text', 'fk'], ['option', 'enum', 'idx'], ['category', 'build|run|licence|integration|exit|opportunity'], ['year', 'int'], ['amount_usd', 'numeric'], ['hidden', 'bool'], ['assumption', 'text']], note: 'The <code>hidden</code> flag forces people to list on-call, patching and exit costs, not just the price.' },
      { name: 'vendor_assessment', store: 'Postgres', fields: [['decision_id', 'text', 'fk'], ['option', 'text', 'pk'], ['criterion', 'text', 'pk'], ['weight', 'int'], ['score', 'int 1–5'], ['evidence_url', 'text']], note: 'Weights are stored before scores so nobody can tune them afterwards.' },
      { name: 'exit_plan', store: 'Postgres / ADR appendix', fields: [['supplier', 'text', 'pk'], ['data_export', 'text'], ['fallback_option', 'text'], ['est_exit_cost_usd', 'numeric'], ['last_drill', 'date', 'idx'], ['contract_end', 'date', 'idx']] }
    ],

    architecture: {
      title: 'From business need to a reversible sourcing decision',
      nodes: [
        { id: 'need', label: 'Business need', sub: 'capability request', kind: 'person', wide: [90, 165], tall: [210, 0], tip: 'Start from the user need, not a technology. "We need gradual rollouts", not "we need LaunchDarkly".' },
        { id: 'diff', label: 'Differentiation', sub: 'do customers care?', kind: 'policy', wide: [280, 55], tall: [70, 105], tip: 'The core vs context test. If doing this better would not win or keep a customer, it is context.' },
        { id: 'map', label: 'Wardley map', sub: 'genesis → commodity', kind: 'policy', wide: [280, 165], tall: [210, 105], tip: 'Place the component by evolution. Novel things must be built; products and commodities should be bought or rented.' },
        { id: 'tco', label: 'TCO model', sub: '5 yr · run · exit', kind: 'compute', wide: [280, 275], tall: [350, 105], tip: 'Build + run + opportunity cost vs licence or subscription + integration + customisation + exit cost.' },
        { id: 'matrix', label: 'Decision matrix', sub: 'weighted criteria', kind: 'policy', wide: [470, 165], tall: [210, 215], tip: 'Weights agreed before scores. Run a sensitivity check: what would have to change for another option to win?' },
        { id: 'exec', label: 'Exec sponsor', sub: 'CTO / CFO sign-off', kind: 'person', wide: [470, 0], tall: [70, 215], tip: 'Present one recommendation, the cost, the risk and the reversal plan. Not the whole spreadsheet.' },
        { id: 'adr', label: 'ADR + exit plan', sub: 'review trigger', kind: 'store', wide: [470, 330], tall: [350, 215], tip: 'The record future engineers will read: why this option, what we gave up, and how we would leave.' },
        { id: 'build', label: 'Build', sub: 'in-house team', kind: 'team', wide: [680, 0], tall: [70, 325], tip: 'Full control and fit. You pay for every hour of design, build, on-call, upgrades and patching, forever.' },
        { id: 'buy', label: 'Buy', sub: 'licensed / on-prem', kind: 'external', wide: [680, 110], tall: [350, 325], tip: 'A commercial product you run yourself. Licence plus support fees; you still own hosting and upgrades.' },
        { id: 'rent', label: 'Rent', sub: 'SaaS / managed', kind: 'external', wide: [680, 220], tall: [70, 435], tip: 'Someone else builds and runs it. Fastest to value; cost scales with usage; your data lives with them.' },
        { id: 'oss', label: 'Adopt OSS', sub: 'self-host or supported', kind: 'service', wide: [680, 330], tall: [350, 435], tip: 'No licence fee, but you run, patch and upgrade it, and the licence can change on future versions.' },
        { id: 'port', label: 'Port + adapter', sub: 'our interface', kind: 'service', wide: [890, 165], tall: [210, 435], tip: 'Your own interface in front of the supplier SDK. Swapping suppliers becomes a new adapter, not a rewrite.' }
      ],
      edges: [
        { from: 'need', to: 'diff' },
        { from: 'diff', to: 'map' },
        { from: 'map', to: 'tco' },
        { from: 'tco', to: 'matrix' },
        { from: 'matrix', to: 'exec' },
        { from: 'matrix', to: 'adr' },
        { from: 'matrix', to: 'build' },
        { from: 'matrix', to: 'buy' },
        { from: 'matrix', to: 'rent', bend: -0.28 },
        { from: 'matrix', to: 'oss', bend: 0.28 },
        { from: 'buy', to: 'port' },
        { from: 'rent', to: 'port' },
        { from: 'oss', to: 'port' }
      ]
    },

    scenarios: [
      {
        id: 'flags', title: 'CTO wants in-house feature flags', tone: 'ok',
        steps: [
          { text: 'The CTO proposes building an in-house <b>feature-flag service</b>: "it\'s a key-value lookup, two engineers, six weeks".', flow: ['need>diff'], badges: { need: 'flags' } },
          { text: '<b>Differentiation test:</b> would a customer ever choose us because our flag system is better? No. It is <b>context</b>: necessary, not differentiating.', nodes: ['diff'], warn: ['diff'], badges: { diff: ['context', 'warn'] } },
          { text: 'On the Wardley map, feature flagging sits at <b>product → commodity</b>: several SaaS products and open-source projects exist, plus the OpenFeature standard API.', flow: ['diff>map'], badges: { map: 'product' } },
          { text: 'The TCO shows the hidden part: targeting rules, audit log, SDKs for every language, a UI, and <b>99.99% availability</b> because every request reads flags. That is a run team, not six weeks.', flow: ['map>tco', 'tco>matrix'], badges: { tco: 'run cost ≫ build' } },
          { text: 'The matrix picks <b>rent</b>, isolated behind our own <code>FeatureFlags</code> interface so we can move to self-hosted OSS later.', flow: ['matrix>rent', 'rent>port'], ok: ['rent', 'port'], badges: { rent: ['winner', 'ok'] } },
          { text: 'The ADR records the decision, the exit plan and a review trigger. The CTO gets a one-page summary: cost, time saved, risk, and how we would reverse it.', flow: ['matrix>adr', 'matrix>exec'], ok: ['adr'], tone: 'ok' }
        ]
      },
      {
        id: 'core', title: 'Core capability: build it', tone: 'info',
        steps: [
          { text: 'A marketplace needs a <b>dynamic pricing engine</b>. Better prices win more bookings, so this is directly why customers choose us.', flow: ['need>diff'], badges: { diff: ['core', 'ok'] }, ok: ['diff'] },
          { text: 'The Wardley map puts it at <b>custom-built</b>: the algorithms are ours, and generic products only cover the basics.', flow: ['diff>map'], badges: { map: 'custom' } },
          { text: 'TCO says building costs more than a product licence. The matrix still picks <b>build</b>, because <b>strategic fit</b> and control carry the most weight for a core capability.', flow: ['map>tco', 'tco>matrix', 'matrix>build'], ok: ['build'], badges: { build: ['winner', 'ok'] } },
          { text: 'Build does not mean build <i>everything</i>: the engine still rents its database, queue and compute. Only the differentiating logic is custom.', nodes: ['build', 'rent'], badges: { rent: 'infra' }, tone: 'ok' }
        ]
      },
      {
        id: 'licence', title: 'OSS licence change (Terraform 2023)', tone: 'err',
        steps: [
          { text: 'You self-host an open-source tool. In August 2023 <b>HashiCorp moves Terraform from MPL 2.0 to the Business Source License</b> for future releases.', nodes: ['oss'], err: ['oss'], badges: { oss: ['licence changed', 'err'] }, tone: 'err' },
          { text: 'Legal asks: does the new licence restrict <i>our</i> use? For most end users it does not, but if you offer a competing hosted product it might. Upgrades now carry legal review.', nodes: ['oss', 'adr'], warn: ['adr'], badges: { adr: ['re-review', 'warn'] } },
          { text: 'Options: stay on the last MPL version (no new fixes), buy the commercial product, or move to the <b>OpenTofu</b> fork the Linux Foundation announced in September 2023.', flow: ['oss>port'], nodes: ['buy', 'oss'], badges: { buy: 'commercial', oss: 'fork?' } },
          { text: 'Because the team kept a thin interface and its state in a portable format, the switch is a <b>planned migration</b>, not an emergency. The ADR is superseded by a new one.', flow: ['port>oss'], ok: ['port', 'oss'], tone: 'ok', badges: { port: ['adapter swap', 'ok'] } }
        ]
      },
      {
        id: 'renewal', title: 'Scale: SaaS bill outgrows the business', tone: 'warn',
        steps: [
          { text: 'Users grew 10× in three years. The SaaS bill is <b>per user</b>, so it grew 10× too, and the renewal quote adds a price increase on top.', nodes: ['rent'], warn: ['rent'], badges: { rent: ['bill ×10', 'warn'] }, tone: 'warn' },
          { text: 'Re-run the TCO with today\'s numbers. A <b>run team of two</b> now costs less than the subscription: the curves have crossed.', flow: ['rent>port', 'need>diff', 'diff>map', 'map>tco'], badges: { tco: 'crossed ✕' } },
          { text: 'Before moving: negotiate. A credible <b>exit plan</b> (tested export, adapter ready) is your strongest lever for a volume discount or price cap.', flow: ['tco>matrix', 'matrix>exec'], badges: { exec: 'negotiate' } },
          { text: 'If the vendor will not move, migrate to self-hosted OSS behind the same port, with a parallel run. Write a new ADR and set the next review trigger.', flow: ['matrix>oss', 'oss>port', 'matrix>adr'], ok: ['oss', 'adr'], tone: 'ok' }
        ]
      },
      {
        id: 'deadline', title: 'Pressure: launch in 8 weeks', tone: 'warn',
        steps: [
          { text: 'Sales needs <b>enterprise single sign-on</b> for a big deal closing in 8 weeks. Building SAML/OIDC properly would take a quarter.', flow: ['need>diff'], warn: ['need'], badges: { need: ['8 weeks', 'warn'] } },
          { text: 'SSO is context. Time to value dominates the weights for this decision, so the matrix picks <b>rent</b>.', flow: ['diff>map', 'map>tco', 'tco>matrix', 'matrix>rent'], ok: ['rent'] },
          { text: 'Use a <b>bounded buy</b>: the identity service owns login only. Your user and permission model stays in your own service behind your own interface.', flow: ['rent>port'], badges: { port: 'bounded' }, ok: ['port'] },
          { text: 'The ADR states the trade honestly: "rented for speed; revisit at 100K users or if per-user pricing exceeds X". The deal closes on time.', flow: ['matrix>adr', 'matrix>exec'], ok: ['adr', 'exec'], tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Describe the capability and your situation, then pick an option. The meters show what that option buys and costs <i>for this capability</i>. Numbers are an illustrative model, not a benchmark.',
      controls: [
        { id: 'cap', label: 'Capability type', type: 'seg', value: 'generic', options: [
          { v: 'core', l: 'Core differentiator', hint: 'why customers choose you' }, { v: 'generic', l: 'Important but generic', hint: 'billing, search, SSO' }, { v: 'commodity', l: 'Commodity', hint: 'email, storage, DNS' }] },
        { id: 'skill', label: 'Team skill in this area', type: 'seg', value: 'med', options: [
          { v: 'low', l: 'Low' }, { v: 'med', l: 'Medium' }, { v: 'high', l: 'High (have experts)' }] },
        { id: 'ttm', label: 'Time-to-market pressure', type: 'seg', value: 'normal', options: [
          { v: 'relaxed', l: 'Relaxed' }, { v: 'normal', l: 'Normal' }, { v: 'urgent', l: 'Urgent (weeks)' }] },
        { id: 'comp', label: 'Compliance needs', type: 'seg', value: 'std', options: [
          { v: 'std', l: 'Standard' }, { v: 'strict', l: 'Strict (residency, audit)' }] },
        { id: 'opt', label: 'Option chosen', type: 'seg', value: 'rent', options: [
          { v: 'build', l: 'Build' }, { v: 'buy', l: 'Buy (licensed)' }, { v: 'rent', l: 'Rent (SaaS)' }, { v: 'oss', l: 'Adopt OSS' }] }
      ],
      evaluate(s) {
        const clamp = (x) => Math.max(0.03, Math.min(1, x));
        const skillK = { low: 1.5, med: 1, high: 0.75 }[s.skill];
        function model(o) {
          const months = { build: (s.cap === 'core' ? 9 : 7) * skillK, buy: (s.comp === 'strict' ? 4 : 3) * (0.6 + 0.4 * skillK), rent: (s.comp === 'strict' ? 2.5 : 1) * (0.6 + 0.4 * skillK), oss: 3 * skillK }[o];
          const tcoX = { build: 1.7 * skillK, buy: 1.15, rent: s.comp === 'strict' ? 1.25 : 1, oss: 0.65 + 0.35 * skillK }[o];
          const control = { build: 0.95, oss: 0.8, buy: 0.5, rent: 0.3 }[o];
          const lock = { build: 0.85, oss: 0.7, buy: 0.4, rent: s.comp === 'strict' ? 0.2 : 0.35 }[o];
          const ops = { build: 0.2, oss: s.skill === 'low' ? 0.15 : 0.35, buy: 0.45, rent: 0.9 }[o];
          let fit = { core: { build: 0.95, oss: 0.6, buy: 0.35, rent: 0.25 }, generic: { build: 0.35, oss: 0.65, buy: 0.7, rent: 0.85 }, commodity: { build: 0.08, oss: 0.55, buy: 0.6, rent: 0.95 } }[s.cap][o];
          if (s.comp === 'strict' && o === 'rent') fit -= 0.2;
          if (s.comp === 'strict' && (o === 'build' || o === 'buy')) fit += 0.08;
          const ttv = clamp(1 - months / (s.ttm === 'urgent' ? 6 : s.ttm === 'normal' ? 12 : 18));
          const w = { ttv: s.ttm === 'urgent' ? 3 : s.ttm === 'normal' ? 1.5 : 0.8, tco: 1.2, control: s.cap === 'core' ? 1.5 : 0.6, lock: s.comp === 'strict' ? 1.2 : 0.8, ops: s.skill === 'low' ? 1.4 : 1, fit: s.cap === 'core' ? 3 : 2.2 };
          const score = (w.ttv * ttv + w.tco * clamp(1.6 - tcoX) + w.control * control + w.lock * lock + w.ops * ops + w.fit * clamp(fit)) / (w.ttv + w.tco + w.control + w.lock + w.ops + w.fit);
          return { months, tcoX, control, lock, ops, fit: clamp(fit), ttv, score };
        }
        const all = ['build', 'buy', 'rent', 'oss'].map((o) => [o, model(o)]).sort((a, b) => b[1].score - a[1].score);
        const best = all[0][0], m = model(s.opt), name = { build: 'Build', buy: 'Buy', rent: 'Rent (SaaS)', oss: 'Adopt OSS' };
        const gap = all[0][1].score - m.score;
        const metrics = [
          { k: 'Time to value', v: '≈ ' + (m.months < 1.5 ? '1' : Math.round(m.months)) + ' month' + (m.months < 1.5 ? '' : 's'), s: m.ttv, hint: s.ttm + ' pressure · ' + s.skill + ' skill' },
          { k: '5-yr TCO (SaaS = 1.0×)', v: m.tcoX.toFixed(2) + '×', s: clamp(1.6 - m.tcoX), hint: 'illustrative' },
          { k: 'Control / flexibility', v: m.control >= 0.8 ? 'high' : m.control >= 0.5 ? 'medium' : 'low (vendor roadmap)', s: m.control },
          { k: 'Lock-in risk', v: m.lock >= 0.8 ? 'low (but key-person risk)' : m.lock >= 0.6 ? 'medium (licence can change)' : m.lock >= 0.35 ? 'high (contract + data)' : 'very high', s: m.lock },
          { k: 'Ops burden on you', v: m.ops >= 0.8 ? 'vendor runs it' : m.ops >= 0.4 ? 'upgrades + hosting' : 'on-call, patching, upgrades', s: m.ops },
          { k: 'Strategic fit', v: m.fit >= 0.8 ? 'strong' : m.fit >= 0.5 ? 'acceptable' : 'poor', s: m.fit, hint: s.cap }
        ];
        const notes = [];
        if (s.cap === 'core' && s.opt !== 'build') notes.push('This is your differentiator. Renting it means your competitors can rent the <b>same</b> thing, and your roadmap follows the vendor\'s.');
        if (s.cap === 'commodity' && s.opt === 'build') notes.push('Building a commodity is <b>not-invented-here</b>: you pay a run team to match what a utility already does better and cheaper.');
        if (s.opt === 'oss') notes.push('Check the licence (OSI-approved?), governance (foundation or single vendor?), maintainer count and CVE response time. Elastic (2021), HashiCorp (2023) and Redis (2024) all relicensed future versions.');
        if (s.opt === 'rent') notes.push('Put the SDK behind your own interface, negotiate a renewal price cap, and test a data export before you depend on it.');
        if (s.opt === 'buy') notes.push('A licensed product gives you data control, but you still host, upgrade and patch it. Avoid customisations that block upgrades.');
        if (s.opt === 'build' && s.skill === 'low') notes.push('Low team skill stretches the build and raises the run cost: a 1.5× factor in this model.');
        if (s.skill === 'low' && s.opt !== 'build' && s.opt !== 'oss') notes.push('Low in-house skill is a good reason to let a vendor\'s experts run this, but keep one person who understands it well enough to judge the vendor.');
        if (s.comp === 'strict' && s.opt === 'rent') notes.push('Strict residency or audit needs often mean an enterprise tier, a dedicated region or a DPA negotiation: slower and pricier.');
        if (s.ttm === 'urgent' && s.opt === 'build') notes.push('With weeks to deliver, building puts the date at risk. Rent now and record a review trigger in the ADR.');
        let verdict;
        if (s.cap === 'commodity' && s.opt === 'build') verdict = '❌ <b>Building a commodity.</b> High cost, no differentiation. Rent it and spend the team on your core.';
        else if (s.opt === best) verdict = '✅ <b>' + name[s.opt] + ' is the best fit</b> for a ' + { core: 'core differentiator', generic: 'generic capability', commodity: 'commodity' }[s.cap] + ' in this situation. Write the ADR with an exit plan.';
        else if (gap < 0.06) verdict = '👍 <b>Close call.</b> ' + name[best] + ' scores slightly higher; ' + name[s.opt] + ' is defensible if you state the trade-off.';
        else if (gap < 0.14) verdict = '⚠ <b>' + name[best] + ' fits better.</b> Choosing ' + name[s.opt] + ' costs you on ' + metrics.filter((x) => x.s < 0.4).map((x) => x.k.toLowerCase()).join(', ') + '.';
        else verdict = '❌ <b>Poor fit.</b> ' + name[best] + ' wins clearly for this capability and situation.';
        const flow = ['need>diff', 'diff>map', 'map>tco', 'tco>matrix', 'matrix>' + s.opt].concat(s.opt === 'build' ? [] : [s.opt + '>port']);
        const tone = s.opt === best ? 'ok' : gap < 0.14 ? 'warn' : 'err';
        return {
          metrics, verdict, notes, flow,
          labels: { matrix: { label: 'Decision matrix', sub: 'best: ' + name[best] }, diff: { label: 'Differentiation', sub: { core: 'core', generic: 'context', commodity: 'context · commodity' }[s.cap] }, map: { label: 'Wardley map', sub: { core: 'genesis / custom', generic: 'product', commodity: 'commodity' }[s.cap] } },
          hot: [s.opt], ok: tone === 'ok' ? [s.opt] : [], warn: tone === 'warn' ? [s.opt] : [], err: tone === 'err' ? [s.opt] : [],
          badges: { [s.opt]: [s.opt === best ? 'best fit' : 'chosen', tone], tco: [m.tcoX.toFixed(1) + '× SaaS', 'info'] }
        };
      }
    },

    widget: {
      title: '5-year TCO curves and a live decision matrix',
      caption: 'Drag the sliders to change scale, price and effort. The curves are <b>cumulative cost</b> per month for Build, Rent (SaaS) and self-hosted OSS; the dot marks where build overtakes SaaS. Toggle the hidden costs. Then drag the <b>weights</b> in the matrix: the TCO score comes from the curves, and the winner changes live.'
    },

    realWorld: {
      intro: 'The thinking tools come from Moore, Fowler, Wardley and Thoughtworks. The licence changes and the cloud exit show that every option, including open source and the cloud itself, carries risk you must price in.',
      timeline: [
        { when: '2005', who: 'Geoffrey Moore', title: 'Core vs context', text: 'In <i>Dealing with Darwin</i> Moore separates <b>core</b> (what differentiates you) from <b>context</b> (everything else), and argues companies must take resources out of context to fund core.', src: 0 },
        { when: '2010', who: 'Martin Fowler', title: 'Utility vs strategic dichotomy', text: 'Fowler argues software is either <b>utility</b> (necessary, not differentiating: buy it or keep it cheap) or <b>strategic</b> (a competitive advantage: build it as well as you can), and that the two need different staffing and management.', src: 1 },
        { when: '2016', who: 'Simon Wardley', title: 'Wardley Maps published openly', text: 'Wardley publishes his book chapter by chapter on Medium (Creative Commons). Components on a map evolve from <b>genesis → custom-built → product → commodity</b>, and the right sourcing choice changes as they move.', src: 2 },
        { when: '2018', who: 'Thoughtworks', title: 'Bounded buy', text: 'The Technology Radar recommends a target capability model and only buying products that fit inside <b>one bounded context</b>, with modularity written into the vendor acceptance criteria.', src: 3 },
        { when: 'Jan 2021', who: 'Elastic → AWS', title: 'Elasticsearch moves to SSPL / Elastic License', text: 'From 7.11, Elastic dual-licenses Elasticsearch and Kibana under SSPL and the Elastic License instead of Apache 2.0. In April 2021 AWS launches <b>OpenSearch</b>, an Apache 2.0 fork of 7.10.2.', src: 4 },
        { when: 'Aug–Sep 2023', who: 'HashiCorp → Linux Foundation', title: 'Terraform to BSL; OpenTofu fork', text: 'HashiCorp moves future releases of Terraform, Vault and others from MPL 2.0 to the <b>Business Source License 1.1</b>. On 20 September 2023 the Linux Foundation announces <b>OpenTofu</b>, a fork of the last MPL Terraform.', src: 5 },
        { when: 'Mar 2024', who: 'Redis → Valkey', title: 'Redis to RSALv2 / SSPLv1; Valkey fork', text: 'Redis announces dual source-available licensing for future versions (20 March). On 28 March the Linux Foundation launches <b>Valkey</b>, a BSD-licensed fork of Redis 7.2.4.', src: 7 },
        { when: '2024–25', who: 'Elastic · Redis', title: 'AGPL added back', text: 'Elastic adds <b>AGPLv3</b> as an option in August 2024, and Redis 8 adds AGPLv3 in May 2025. The forks continue. Lesson: licence direction can change in both directions, so model it as a risk, not a constant.', src: 9 },
        { when: '2023–24', who: '37signals', title: 'Renting reversed: cloud exit', text: 'After moving Basecamp and HEY off AWS onto owned hardware, DHH reports that the projected savings rose from $7M to <b>over $10M over five years</b>. The flip side: it needs a dedicated operations team.', src: 11 },
        { when: '2026', who: 'Airbnb', title: 'From observability vendor to in-house', text: 'Airbnb describes moving from a vendor-managed observability platform to an in-house stack built on open-source components, because as the company matured its needs diverged from the vendor\'s incentives.', src: 12 }
      ],
      lessons: [
        'Decide <b>per capability</b> and revisit as components evolve: what you built in genesis should often be rented once it is a commodity.',
        'Open source is a sourcing option with its own risk: <b>licence, governance and maintainer health</b> matter as much as features.',
        'Forks appear when a licence change hurts a large ecosystem. An <b>adapter and portable data</b> make following a fork a migration, not a crisis.',
        'Renting can be reversed at scale, but only with a team that can run the alternative. Put the <b>exit cost</b> in the TCO from day one.'
      ],
      sources: [
        { title: 'Interviewing Geoffrey Moore: Core Versus Context', url: 'https://www.inc.com/tech-blog/interviewing-geoffrey-moore-core-versus-context.html', pub: 'Inc.' },
        { title: 'Utility Vs Strategic Dichotomy', url: 'https://www.martinfowler.com/bliki/UtilityVsStrategicDichotomy.html', pub: 'Martin Fowler, 2010' },
        { title: 'On being lost (Wardley Maps, Chapter 1)', url: 'https://medium.com/wardleymaps/on-being-lost-2ef5f05eb1ec', pub: 'Simon Wardley, 2016' },
        { title: 'Bounded buy', url: 'https://www.thoughtworks.com/radar/techniques/bounded-buy', pub: 'Thoughtworks Technology Radar, 2018' },
        { title: 'Elastic license update (Doubling down on open, Part II)', url: 'https://www.elastic.co/blog/elastic-license-update', pub: 'Elastic, Jan 2021' },
        { title: 'HashiCorp adopts the Business Source License', url: 'https://www.hashicorp.com/blog/hashicorp-adopts-business-source-license', pub: 'HashiCorp, Aug 2023' },
        { title: 'Linux Foundation Launches OpenTofu', url: 'https://www.linuxfoundation.org/press/announcing-opentofu', pub: 'Linux Foundation, Sep 2023' },
        { title: 'Redis adopts dual source-available licensing', url: 'https://redis.io/blog/redis-adopts-dual-source-available-licensing/', pub: 'Redis, Mar 2024' },
        { title: 'Forking Ahead: A Year of Valkey', url: 'https://www.linuxfoundation.org/blog/a-year-of-valkey', pub: 'Linux Foundation, 2025' },
        { title: 'Elastic Announces Open Source License for Elasticsearch and Kibana', url: 'https://www.businesswire.com/news/home/20240829537786/en/Elastic-Announces-Open-Source-License-Elasticsearch-Kibana', pub: 'Business Wire, Aug 2024' },
        { title: 'Introducing OpenSearch', url: 'https://aws.amazon.com/blogs/opensource/introducing-opensearch', pub: 'AWS Open Source Blog, 2021' },
        { title: 'Our cloud-exit savings will now top ten million over five years', url: 'https://world.hey.com/dhh/our-cloud-exit-savings-will-now-top-ten-million-over-five-years-c7d9b5bd', pub: 'David Heinemeier Hansson' },
        { title: 'From vendors to vanguard: Airbnb\'s hard-won lessons in observability ownership', url: 'https://airbnb.tech/infrastructure/from-vendors-to-vanguard-airbnbs-hard-won-lessons-in-observability-ownership/', pub: 'Airbnb Engineering' },
        { title: 'Redis is open source again', url: 'https://thenewstack.io/redis-is-open-source-again/', pub: 'The New Stack, May 2025' },
        { title: 'Documenting Architecture Decisions', url: 'https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions', pub: 'Michael Nygard, 2011' }
      ]
    },

    tradeoffs: {
      headers: ['Option', 'You get', 'You pay', 'Pick when…'],
      rows: [
        ['<b>Build</b> custom', 'Exact fit, full control, a capability competitors cannot rent', 'Every hour of build, on-call, upgrades and patching, forever; key-person risk; slowest start', 'It is <b>core</b> and at genesis/custom, and you have (or will hire) the skills'],
        ['<b>Buy</b> licensed / on-prem', 'Proven features, your data stays in your estate', 'Licence + support fees, hosting and upgrades, customisation debt', 'Generic capability with strict data control or air-gap needs'],
        ['<b>Rent</b> SaaS / managed', 'Fastest time to value, vendor runs it, continuous updates', 'Per-user/usage price that grows with you, data with a third party, roadmap not yours', '<b>Context</b> or <b>commodity</b>, standard compliance, speed matters'],
        ['<b>Adopt OSS</b> self-hosted', 'No licence fee, source access, community, can fork', 'You run, patch and upgrade it; licence of future versions can change; maintainer risk', 'Strong ops team, healthy foundation-governed project, cost at scale matters'],
        ['<b>OSS + vendor support</b> or managed OSS', 'Open standard and exit path, plus someone else on call', 'Subscription, and a vendor who may also be the licensor', 'You want rent-like ops with an open-source exit path']
      ]
    },
    failures: [
      { f: 'Not-invented-here: building a commodity', detect: 'Teams on call for auth, queues or schedulers; "ours is better" with no customer evidence', fix: 'Run the differentiation test per capability; require a TCO including run and opportunity cost before any build.' },
      { f: 'Vendor King: a suite spreads everywhere', detect: 'One vendor\'s data model appears in many services; every change needs the vendor', fix: 'Bounded buy: one capability per product, your own interfaces and canonical data model at the boundary.' },
      { f: 'Run cost forgotten', detect: 'Build estimate in weeks, no line for on-call, upgrades, CVEs; year-2 velocity drops', fix: 'TCO line items flagged <code>hidden</code>; budget run FTE explicitly; review actuals at 12 months.' },
      { f: 'OSS licence change on a critical dependency', detect: 'Licence scanning in CI; watch project announcements; legal flags on upgrade', fix: 'Pin the last compatible version, evaluate forks (OpenTofu, OpenSearch, Valkey) or a commercial licence; adapter makes the switch routine.' },
      { f: 'Renewal price shock', detect: 'Spend per user trending up; renewal quote above the model', fix: 'Price caps and multi-year terms in the contract; a tested exit plan as negotiating leverage; re-run TCO.' },
      { f: 'Customised until it cannot upgrade', detect: 'Product stuck several major versions behind; forked vendor code', fix: 'Configure, do not modify; put custom logic in your own services around the product.' },
      { f: 'Data held hostage', detect: 'No bulk export API, proprietary formats, export never tested', fix: 'Make export a selection criterion and a contract clause; run an export drill yearly.' }
    ],

    interview: [
      { q: 'How do you decide whether to build or buy a capability?', a: '<ol><li><b>Differentiation test</b>: does doing this better make customers choose us? If not, it is context.</li><li><b>Evolution</b>: where is it on a Wardley map? Genesis → build; product/commodity → buy, rent or OSS.</li><li><b>5-year TCO</b> for each realistic option, including run, integration and exit.</li><li><b>Weighted matrix</b> with weights agreed up front, plus a sensitivity check.</li><li>Record it in an <b>ADR</b> with an exit plan and a review trigger.</li></ol>', fu: 'What if the TCO says build but the differentiation test says context? (Usually rent anyway: opportunity cost is not in the TCO.)', lvl: 'core' },
      { q: 'Your CTO wants to build an in-house feature-flag system: "two engineers, six weeks". What do you say?', a: '<p>Agree on the need, then reframe the cost. Flag evaluation sits on <b>every request</b>, so it needs very high availability, SDKs for every language, targeting rules, audit logs, a UI and kill switches. Six weeks buys a prototype; the <b>run cost</b> is a permanent fraction of a team.</p><p>It is <b>context</b>, and the market has mature SaaS and open-source options plus the vendor-neutral OpenFeature API. My recommendation: rent (or self-host OSS) behind our own interface, with a review trigger if cost or requirements change. If the CTO has a genuinely unusual need (e.g. offline evaluation on devices), that is the part we build.</p>', fu: 'How would you get the CTO to agree without making it a fight? (Show the TCO and the opportunity cost in roadmap items; offer the review trigger.)', lvl: 'core' },
      { q: 'Explain core vs context and the utility vs strategic dichotomy.', a: '<p><b>Moore</b> (core vs context, <i>Dealing with Darwin</i>, 2005): core is what creates differentiation that customers reward; everything else is context. Shift resources from context to core.</p><p><b>Fowler</b> (2010): utility software must work but gives no advantage, so minimise its cost (usually buy); strategic software is a competitive edge, so build it with your best people. A common misreading is "context = unimportant": payroll is context, and it must never fail.</p>', lvl: 'core' },
      { q: 'What goes into a TCO comparison, and what do people forget?', a: '<ul><li><b>Build</b>: design, build, testing, security review.</li><li><b>Run</b>: infrastructure, on-call, upgrades, CVE patching, compliance audits, documentation, onboarding.</li><li><b>Buy/rent</b>: licence or subscription and its escalation, integration, customisation, training, admin, premium support tiers.</li><li><b>Exit</b>: data export, re-integration, parallel run.</li><li><b>Opportunity cost</b>: roadmap items not built.</li></ul><p>Forgotten most often: run cost for builds, usage growth for SaaS, and exit cost for both.</p>', lvl: 'core' },
      { q: 'How do you use a Wardley map in this decision?', a: '<p>Start from a user need, list the components that serve it, and place each by <b>visibility</b> (y) and <b>evolution</b> (x: genesis, custom-built, product, commodity).</p><p>Sourcing follows evolution: build or experiment in genesis, build or partner in custom, buy or adopt in product, rent in commodity. Components <b>move right over time</b>, so a good "build" decision five years ago can be a bad one today. The map also shows inertia: teams protecting something that has become a commodity.</p>', lvl: 'deep' },
      { q: 'What risks come with adopting open source, and how do you assess a project?', a: '<p>Risks: <b>licence change</b> on future versions (Elastic 2021, HashiCorp Terraform to BSL in 2023, Redis 2024), <b>bus factor</b> (few maintainers), slow <b>CVE response</b>, abandonment, and the run cost you now own.</p><p>Assess: OSI-approved licence and whether a single company owns the copyright (CLA), foundation governance, active maintainers from several companies, release and CVE-fix cadence, and whether a fork or alternative could take over. Pin versions and scan licences in CI.</p>', fu: 'Is a licence like BSL or SSPL a problem for you as an end user? (Usually not for internal use; it targets competing hosted offerings. Have legal confirm.)', lvl: 'deep' },
      { q: 'How do you limit vendor lock-in when you do rent?', a: '<ul><li><b>Port and adapter</b>: your own interface in front of the vendor SDK; no vendor types in domain code.</li><li><b>Bounded buy</b>: the product owns one capability.</li><li><b>Data portability</b>: open formats, export API, a yearly export drill.</li><li><b>Contract</b>: price caps, termination assistance, data-return clause, notice periods.</li><li>Prefer <b>open standards</b> (OIDC, OpenTelemetry, OpenFeature, SQL).</li></ul><p>Accept some lock-in deliberately: the goal is a known, affordable exit cost, not zero lock-in.</p>', lvl: 'core' },
      { q: 'Weighted decision matrices are easy to game. How do you make one trustworthy?', a: '<p>Agree <b>criteria and weights before</b> anyone scores. Score with evidence (a PoC result, a quote, a reference call). Have several people score independently and discuss outliers.</p><p>Then run a <b>sensitivity check</b>: what weight change would flip the winner? If a small change flips it, it is a close call and you should say so, or use a cheap reversible option.</p>', lvl: 'deep' },
      { q: 'A SaaS bill has grown 10× with users. Do you rebuild in-house?', a: '<p>Re-run the TCO with real numbers, including a run team, migration and parallel running. Often the first move is to <b>negotiate</b>: volume tiers, price caps, a multi-year deal. A credible, tested exit plan is the leverage.</p><p>If the curves have truly crossed, migrate behind the existing interface, starting with one segment, and keep the vendor until parity. 37signals\' cloud exit is a public example of renting reversed at scale, but it relied on an experienced ops team.</p>', lvl: 'deep' },
      { q: 'How would you present a build-vs-buy recommendation to executives?', a: '<p>One page, answer first (pyramid principle):</p><ul><li><b>Recommendation</b> in one sentence.</li><li><b>Why</b>: differentiation and time to value in business terms.</li><li><b>Cost</b>: 5-year TCO range for the top two options, plus what the engineers will build instead.</li><li><b>Risks</b> and mitigations: lock-in, licence, vendor health.</li><li><b>Reversibility</b>: exit plan and the trigger that makes us revisit.</li><li><b>Ask</b>: budget, contract approval, a date.</li></ul><p>Keep the full matrix in the appendix.</p>', lvl: 'core' },
      { q: 'Tell me about a time you pushed back on building something in-house. (STAR)', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a team planned to build its own job scheduler for a data platform. <b>Task</b>: as the architect, I owned the recommendation.</p><p><b>Action</b>: I mapped it as a commodity, built a 3-year TCO with on-call and upgrades, and ran a two-week spike with a managed workflow service and an open-source alternative. I shared the matrix with the team before scoring, so the weights were theirs.</p><p><b>Result</b>: we adopted the open-source scheduler behind a thin interface; the team shipped the two product features it had planned to delay, and the ADR set a review at 10× job volume.</p>', lvl: 'core' },
      { q: 'When is building the right answer even though a product exists?', a: '<ul><li>It is your <b>differentiator</b> and products only cover the generic part.</li><li>Products cannot meet a hard constraint (latency, offline use, residency, scale) and will not soon.</li><li>At your scale the run team is <b>cheaper than the usage-based bill</b>, and you have the skills.</li><li>Integration cost exceeds build cost because your domain is unusual.</li></ul><p>Even then, build the narrow differentiating part and rent the rest.</p>', lvl: 'deep' }
    ],

    code: [
      {
        title: 'Python: 5-year TCO and NPV for each option', lang: 'python',
        code: `# Discounted 5-year cost per option. Python 3.11+, no dependencies.
from dataclasses import dataclass

@dataclass
class Option:
    name: str
    upfront: float              # build cost or integration + setup
    run_per_year: float         # people + infra you pay regardless of users
    per_user_month: float = 0   # subscription or per-user infra
    exit_cost: float = 0        # cost to leave at end of horizon (optional)

def npv_cost(o: Option, users: int, growth: float, years=5, rate=0.08) -> float:
    total = o.upfront
    for y in range(1, years + 1):
        u = users * (1 + growth) ** (y - 1)
        cash = o.run_per_year + o.per_user_month * 12 * u
        total += cash / (1 + rate) ** y           # discount future spend
    return total + o.exit_cost / (1 + rate) ** years

def break_even_year(a: Option, b: Option, users, growth, years=5):
    ca, cb = a.upfront, b.upfront
    for y in range(1, years + 1):
        u = users * (1 + growth) ** (y - 1)
        ca += a.run_per_year + a.per_user_month * 12 * u
        cb += b.run_per_year + b.per_user_month * 12 * u
        if ca <= cb:
            return y
    return None

eng = 180_000
options = [
    Option("build", upfront=4 * eng * 0.5, run_per_year=1.5 * eng, per_user_month=1),
    Option("saas",  upfront=eng / 3, run_per_year=0.25 * eng, per_user_month=12,
           exit_cost=2 * eng / 4),
    Option("oss",   upfront=4 * eng * 0.15, run_per_year=1.2 * eng, per_user_month=1),
]
for o in options:
    print(f"{o.name:5} NPV 5y: \${npv_cost(o, 3_000, 0.40):,.0f}")
print("build beats saas in year", break_even_year(options[0], options[1], 3_000, 0.40))`,
        note: 'Discounting matters when one option is front-loaded (build) and the other spreads cost over time (SaaS). Add the exit cost so a cheap but sticky option does not look free.'
      },
      {
        title: 'ADR + weighted scoring config (YAML, kept in the repo)', lang: 'yaml',
        code: `# docs/adr/0042-feature-flags.yaml  (Nygard ADR fields + a scored matrix)
id: ADR-0042
title: Rent feature flags behind our own FeatureFlags interface
status: accepted            # proposed | accepted | superseded by ADR-xxxx
date: 2026-03-02
context: >
  Gradual rollouts and kill switches for 40 services. Not a differentiator
  (core vs context). Wardley stage: product/commodity. Launch in 1 quarter.
criteria:                   # weights agreed BEFORE scoring (1-5)
  time_to_value: 4
  tco_5y: 3
  control: 2
  lock_in: 3
  ops_burden: 4
  strategic_fit: 4
options:                    # scores 1-5, with evidence links
  build: { time_to_value: 1, tco_5y: 2, control: 5, lock_in: 4, ops_burden: 1, strategic_fit: 1 }
  saas:  { time_to_value: 5, tco_5y: 4, control: 2, lock_in: 2, ops_burden: 5, strategic_fit: 4 }
  oss:   { time_to_value: 3, tco_5y: 4, control: 4, lock_in: 4, ops_burden: 2, strategic_fit: 4 }
decision: saas
consequences:
  - Flag SDK only behind com.acme.flags.FeatureFlags (no vendor types elsewhere)
  - Per-seat cost grows with engineers; budgeted in FinOps forecast
exit_plan:
  fallback: self-hosted OSS adapter (OpenFeature provider)
  data_export: nightly flag definitions to git as JSON
  est_cost_usd: 45000
  last_drill: 2026-02-20
review_triggers:
  - renewal price increase > 15%
  - flag evaluations > 50k/s or offline evaluation needed`,
        note: 'Nygard\'s ADR (2011) has title, status, context, decision and consequences. Adding the scored matrix and the exit plan keeps the evidence next to the decision, and CI can recompute the weighted totals.'
      },
      {
        title: 'Java 21 / Spring Boot 3: port + adapter around a vendor SDK', lang: 'java',
        code: `// Domain code depends only on this port. No vendor types leak past the adapter.
public interface FeatureFlags {
  boolean isEnabled(String flag, String userId, boolean fallback);
}

// Adapter 1: rented SaaS (LaunchDarkly Java server SDK v7)
@Component @ConditionalOnProperty(name = "flags.provider", havingValue = "launchdarkly")
class LaunchDarklyFlags implements FeatureFlags, AutoCloseable {
  private final LDClient client;
  LaunchDarklyFlags(@Value("\${flags.sdk-key}") String key) { this.client = new LDClient(key); }

  public boolean isEnabled(String flag, String userId, boolean fallback) {
    return client.boolVariation(flag, LDContext.create(userId), fallback);
  }
  public void close() throws IOException { client.close(); }
}

// Adapter 2: the exit plan, a simple Postgres-backed implementation
@Component @ConditionalOnProperty(name = "flags.provider", havingValue = "db")
class DbFlags implements FeatureFlags {
  private final JdbcClient jdbc;
  DbFlags(JdbcClient jdbc) { this.jdbc = jdbc; }

  public boolean isEnabled(String flag, String userId, boolean fallback) {
    return jdbc.sql("""
        SELECT enabled AND (abs(hashtext(:u)) % 100) < rollout_pct
          FROM feature_flag WHERE name = :f""")
      .param("u", userId).param("f", flag)
      .query(Boolean.class).optional().orElse(fallback);
  }
}

// Usage: if (flags.isEnabled("new-checkout", user.id(), false)) { ... }`,
        note: 'Switching supplier is a config change plus one new adapter, and a contract test suite runs against every adapter. The CNCF OpenFeature API standardises this port across vendors; you can implement it instead of writing your own interface.'
      }
    ],

    related: ['finops', 'risk-management', 'okrs-to-nfrs', 'stakeholder-communication', 'rfcs-adrs', 'sd:llm-gateway']
  });
})();
