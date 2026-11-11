SD.register({
  slug: 'platform-engineering',
  domain: 6,
  title: 'Platform Engineering',
  examples: 'Backstage, Spotify, DORA',
  tagline: 'Turn the tickets product teams file for databases, services and pipelines into a <b>self-service product</b> with <b>golden paths</b>, so shipping does not require learning every tool.',
  tldr: {
    problem: 'Every new service needs a database, a repo, a pipeline, DNS, secrets and dashboards. In a <b>ticket-ops</b> organisation each one is a ticket in another team\'s queue, so a two-day feature takes three weeks, and each team rebuilds the same plumbing differently.',
    idea: 'Build an <b>internal developer platform (IDP)</b>: a curated set of self-service capabilities behind a portal, APIs and templates. Run it <b>as a product</b>: developers are its users, it has a roadmap and earns <b>adoption</b> instead of mandating it. Start with the <b>Thinnest Viable Platform</b>.',
    insight: 'The goal is not more tools; it is <b>less cognitive load and fewer hand-offs</b>. Measure it like a product: DORA lead time, time to first deploy, adoption rate and developer satisfaction. A platform that is mandatory and painful is just a slower ticket queue.',
    numbers: [
      { v: '2020', l: 'Spotify open-sourced Backstage (March); CNCF Sandbox in September, Incubation in 2022' },
      { v: '5 · 4', l: 'aspects · maturity levels in the CNCF Platform Engineering Maturity Model (v1, October 2023)' },
      { v: '−8%', l: 'throughput associated with IDP use in the 2024 DORA report, next to +8% individual productivity (a J-curve, not a verdict)' }
    ]
  },

  intro: {
    what: 'Platform engineering is the practice of building and running an <b>internal developer platform</b>: the shared tools, templates and self-service infrastructure that product teams use to build, deploy and operate their software. Instead of asking another team for a database or a pipeline, a developer picks a <b>golden path</b>, the supported, opinionated way to do the task, and gets it in minutes.',
    analogy: {
      icon: '🍳',
      title: 'A restaurant kitchen with a stocked pass',
      text: 'In a badly run kitchen every cook walks to the stores, asks the storekeeper for ingredients and waits in line. In a good one, a prep team keeps <b>stations stocked</b> with standard ingredients and well-tested recipes, so cooks spend their time cooking. Cooks can still bring special ingredients, but the standard dish is fast. The analogy has a limit: a software platform must also be <b>discoverable and documented</b>, because developers cannot see the shelf the way a cook can.'
    },
    problem: 'A team wants to launch a small "price alerts" service. It files a ticket for a Postgres database, another for a Kubernetes namespace, another for a CI pipeline and a fourth to open production access. Each queue is busy, so the two days of coding wait <b>two to three weeks</b> for infrastructure. The question this topic answers: <b>how do you let product teams get standard infrastructure safely, without a ticket and without becoming experts in every tool?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Ask the ops team by ticket',
        text: 'It feels safe and controlled: one central team owns all infrastructure and every change goes through its <b>ticket queue</b>. Specialists do the work and nothing is created without review.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Feature team', sub: 'needs DB + svc', kind: 'team', at: [70, 0] },
            { id: 'q', label: 'Ticket queue', sub: '4 tickets', kind: 'queue', at: [210, 110] },
            { id: 'ops', label: 'Ops team', sub: 'does it by hand', kind: 'team', at: [350, 0] },
            { id: 'prod', label: 'Production', sub: 'new service', kind: 'service', at: [350, 220] }
          ],
          edges: [{ from: 'dev', to: 'q' }, { from: 'q', to: 'ops' }, { from: 'ops', to: 'prod' }],
          flow: ['dev>q', 'q>ops', 'ops>prod']
        }
      },
      {
        stage: 'breaks',
        title: 'The queue grows with every team',
        text: 'With 30 teams the ops team is <b>always busy</b>, and in a busy queue waiting time explodes. Each request waits days, a new service needs four of them in sequence, and teams start building their own scripts to escape, so <b>every service is set up differently</b>.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Feature team', sub: 'waiting 3 weeks', kind: 'team', at: [70, 0] },
            { id: 'q', label: 'Ticket queue', sub: '120 open', kind: 'queue', at: [210, 110] },
            { id: 'ops', label: 'Ops team', sub: '95% busy', kind: 'team', at: [350, 0] },
            { id: 'sh', label: 'Shadow scripts', sub: 'every team its own', kind: 'compute', at: [70, 220] },
            { id: 'prod', label: 'Production', sub: 'snowflakes', kind: 'service', at: [350, 220] }
          ],
          edges: [{ from: 'dev', to: 'q' }, { from: 'q', to: 'ops' }, { from: 'ops', to: 'prod' }, { from: 'dev', to: 'sh' }, { from: 'sh', to: 'prod', dashed: true }],
          flow: ['dev>q', 'q>ops', 'dev>sh', 'sh>prod'],
          err: ['q'], warn: ['ops', 'sh'],
          badges: { q: ['overloaded', 'err'], prod: ['inconsistent', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'A platform team builds the golden path',
        text: 'The ops team becomes a <b>platform team</b>. It turns the four tickets into one <b>self-service template</b>: pick "Spring Boot service with Postgres", and the repo, database, pipeline and dashboards are created in minutes, already secure and standard.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Feature team', sub: 'self-service', kind: 'team', at: [70, 0] },
            { id: 'q', label: 'Developer portal', sub: 'golden path', kind: 'edge', at: [210, 110] },
            { id: 'ops', label: 'Platform team', sub: 'builds the product', kind: 'team', at: [350, 0] },
            { id: 'prod', label: 'Production', sub: 'standard service', kind: 'service', at: [350, 220] }
          ],
          edges: [{ from: 'dev', to: 'q' }, { from: 'ops', to: 'q', dashed: true }, { from: 'q', to: 'prod' }],
          flow: ['dev>q', 'q>prod'],
          ok: ['dev', 'q', 'prod'],
          badges: { prod: ['minutes, 0 tickets', 'ok'] }
        }
      }
    ],
    usedBy: ['Spotify (Backstage, Golden Paths)', 'Netflix (the paved road)', 'Backstage adopters in the CNCF community', 'Team Topologies platform teams', 'Most large cloud-native engineering organisations'],
    whenToUse: [
      'Several product teams keep <b>waiting on another team</b> for standard infrastructure',
      'Each team has built its own pipelines and Terraform, and they have <b>drifted apart</b>',
      'Onboarding a new engineer or creating a new service takes <b>weeks</b>, not hours'
    ],
    whenNot: [
      'One or two teams: a shared README and a template repo is the whole platform (the Thinnest Viable Platform)',
      'You have no clear users yet: a platform built for imagined needs becomes shelfware',
      'The real problem is ownership or team boundaries: fix those first with <a href="conways-law.html">Conway\'s Law & Team Topologies</a>'
    ],
    glossary: [
      { term: 'Internal developer platform (IDP)', def: 'The integrated set of self-service capabilities (infra, pipelines, observability, docs) that product teams use to build and run software.' },
      { term: 'Developer portal', def: 'The user interface of the platform, such as Backstage: a catalog, templates and docs in one place.' },
      { term: 'Golden path / paved road', def: 'The opinionated, supported way to do a common task; optional, but so easy that most teams choose it.' },
      { term: 'Thinnest Viable Platform', def: 'Team Topologies\' term for the smallest platform that speeds teams up, which may be just a wiki page and a few templates.' },
      { term: 'Software catalog', def: 'A registry of every service, API, resource and its owning team.' },
      { term: 'Scaffolder', def: 'Backstage\'s template engine that creates a repo, pipeline and resources from a form.' },
      { term: 'Cognitive load', def: 'How much a team must keep in its head to do its work; the platform should remove the extraneous part.' },
      { term: 'Lead time for changes', def: 'A DORA metric: the time from a code commit to that code running in production.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Platform as a product</b>: developers are the customers; do user research, keep a public roadmap, publish SLOs',
      '<b>Self-service by default</b>: the common requests (new service, database, environment, secret) need no ticket and no human',
      '<b>Golden paths</b> for the top use cases, opinionated but <b>optional</b>; teams may leave the path and own the result',
      'Start with the <b>Thinnest Viable Platform</b> and grow only where teams pull for more',
      '<b>Guardrails over gates</b>: security, cost and compliance policies built into templates and checked automatically',
      'One <b>software catalog</b> with an owner for every component, API and resource'
    ],
    nonFunctional: [
      '<b>Time to first deploy</b> of a new service &lt; 1 day, self-service (common target, rule of thumb)',
      '<b>DORA lead time for changes</b> falling for teams on the golden path; compare on-path vs off-path',
      '<b>Adoption</b>: share of new services created from templates; aim for a voluntary majority, not 100% by decree',
      '<b>Developer satisfaction</b> with the platform measured quarterly (survey, NPS-style or SPACE dimensions)',
      '<b>Ticket rate</b> to the platform team flat or falling while the number of teams grows',
      '<b>Onboarding</b>: a new engineer ships to production in the first week (rule of thumb)'
    ],
    outOfScope: [
      '<b>Ticket-ops platform</b>: a portal form that only opens a ticket for a human',
      '<b>Mandatory platform with poor UX</b>: adoption by decree hides the problems users would have shown you',
      '<b>Building everything in-house</b>, including a custom portal, CI system and service mesh, before using open source',
      '<b>Platform team as bottleneck</b>: every change, even inside the golden path, needs its approval',
      '<b>Platform built for imagined users</b>: no discovery, a roadmap of technology, not of problems'
    ]
  },

  calculator: {
    inputs: [
      { id: 'teams', label: 'Product teams', min: 2, max: 200, value: 30, log: true },
      { id: 'tix', label: 'Infra tickets per team per month', min: 1, max: 40, value: 8 },
      { id: 'wait', label: 'Average ticket wait (queue + work)', min: 0.5, max: 20, step: 0.5, value: 4, unit: 'days' },
      { id: 'auto', label: 'Requests covered by self-service', min: 0, max: 95, value: 60, unit: '%' },
      { id: 'plat', label: 'Platform team size', min: 1, max: 40, value: 6, unit: 'people' }
    ],
    outputs: [
      { label: 'Infra requests per month', f: (v) => v.teams * v.tix },
      { label: 'Requests now self-served per month', f: (v) => Math.round(v.teams * v.tix * v.auto / 100) },
      { label: 'Average wait per request after automation', unit: 'days', f: (v) => Math.round(((1 - v.auto / 100) * v.wait + (v.auto / 100) * 0.05) * 10) / 10 },
      { label: 'Team-days of waiting removed per month', unit: 'days', f: (v) => Math.round(v.teams * v.tix * (v.auto / 100) * (v.wait - 0.05)) },
      { label: 'Engineer-hours saved per month (5 h per automated ticket)', f: (v) => Math.round(v.teams * v.tix * (v.auto / 100) * 5) },
      { label: 'ROI of the platform team (hours saved ÷ hours spent − 1)', fmt: 'pct', f: (v) => (v.teams * v.tix * (v.auto / 100) * 5) / (v.plat * 140) - 1 }
    ],
    note: 'All of this is a <em>labelled estimate</em>. Assumptions: an automated request completes in about 0.05 days (an hour); each ticket costs about <b>2 h of requester time</b> (writing, chasing, context switching) and <b>3 h of operator time</b>, so automation saves 5 h; one platform engineer gives about <b>140 h per month</b>. Waiting days are lead time, not effort, so they are not in the ROI: they show up as faster delivery. The ROI ignores licence and cloud costs and the build-up period (the DORA 2024 "J-curve"). Replace the defaults with your own ticket data.'
  },

  api: [
    { m: 'YAML', p: 'catalog-info.yaml (per repo)', d: 'Registers the component in the software catalog: name, type, <b>owner</b>, system, lifecycle, APIs provided and consumed, and the resources it depends on.' },
    { m: 'YAML', p: 'Scaffolder template (golden path)', d: 'The form a developer fills in (name, owner, database size) and the steps it runs: fetch skeleton, publish repo, register in catalog, request infrastructure. Versioned like code.' },
    { m: 'HTTP', p: 'Platform API (self-service resources)', d: 'A declarative interface, for example a Crossplane claim or a Terraform module, such as <code>PostgresInstance{size: small}</code>. Same contract for the portal, the CLI and CI.' },
    { m: 'SLO', p: 'Platform SLOs', d: 'Published like a product: "new service to production &lt; 1 day", "CI p50 &lt; 10 min", "portal availability 99.5%", "template provisioning success 99%".' },
    { m: 'DOC', p: 'Platform roadmap + changelog', d: 'Problems to solve, ranked by user research and ticket data; deprecations with migration guides and dates. Public to every engineer.' },
    { m: 'POLICY', p: 'Guardrail policies', d: 'Policy as code (OPA/Kyverno, cloud org policies) enforcing encryption, tagging, cost limits and approved regions on everything the templates create.' }
  ],
  dataModel: [
    { name: 'catalog_entity', store: 'Backstage catalog', fields: [['entity_ref', 'text', 'pk'], ['kind', 'Component | API | Resource | System', 'idx'], ['owner', 'text', 'fk'], ['lifecycle', 'text'], ['template_ref', 'text', 'idx'], ['template_version', 'text']], note: 'template_ref shows which golden path created it: the basis of the adoption metric and of upgrade campaigns.' },
    { name: 'deployment', store: 'CI/CD events', fields: [['deploy_id', 'uuid', 'pk'], ['service', 'text', 'idx'], ['commit_sha', 'text', 'fk'], ['deployed_at', 'timestamptz', 'idx'], ['env', 'text'], ['status', 'ok | failed | rolled_back']], note: 'Joined with commits to compute DORA lead time and change failure rate.' },
    { name: 'platform_request', store: 'Ticket system + portal logs', fields: [['request_id', 'uuid', 'pk'], ['team', 'text', 'idx'], ['type', 'db | env | secret | pipeline', 'idx'], ['channel', 'ticket | self_service'], ['opened_at', 'timestamptz'], ['done_at', 'timestamptz']], note: 'The best backlog for the platform: the most frequent ticket types with the longest waits are what to automate next.' },
    { name: 'devex_survey', store: 'Survey tool', fields: [['response_id', 'uuid', 'pk'], ['team', 'text', 'idx'], ['quarter', 'text', 'idx'], ['satisfaction', 'int 1-5'], ['top_friction', 'text']], note: 'Perception data (the S in SPACE). Pair it with system data; neither alone tells the truth.' }
  ],

  architecture: {
    title: 'An internal developer platform and its golden path',
    nodes: [
      { id: 'dev', label: 'Feature team', sub: 'platform user', kind: 'team', wide: [100, 40], tall: [70, 0], tip: 'A stream-aligned team. It wants a running service, not to learn Terraform, Helm and the CI system.' },
      { id: 'portal', label: 'Developer portal', sub: 'Backstage', kind: 'edge', wide: [480, 40], tall: [210, 0], tip: 'One front door: catalog, templates, docs and plugins. Also reachable by CLI and API.' },
      { id: 'plat', label: 'Platform team', sub: 'runs it as a product', kind: 'team', wide: [860, 40], tall: [350, 0], tip: 'Builds and operates the platform, with a roadmap, SLOs and user research. Not a ticket queue.' },
      { id: 'cat', label: 'Software catalog', sub: 'owners · APIs · deps', kind: 'store', wide: [290, 150], tall: [70, 110], tip: 'Every component, API and resource with exactly one owner, loaded from catalog-info.yaml files.' },
      { id: 'scaf', label: 'Scaffolder', sub: 'golden-path templates', kind: 'compute', wide: [480, 150], tall: [210, 110], tip: 'Runs a template: create repo from skeleton, register in catalog, request infrastructure.' },
      { id: 'docs', label: 'TechDocs', sub: 'docs-as-code', kind: 'service', wide: [670, 150], tall: [350, 110], tip: 'Markdown next to the code, built and shown in the portal.' },
      { id: 'repo', label: 'Git repo', sub: 'service skeleton', kind: 'service', wide: [100, 260], tall: [70, 220], tip: 'A Spring Boot skeleton with tests, Dockerfile, pipeline and catalog file already in place.' },
      { id: 'ci', label: 'CI/CD pipeline', sub: 'build · test · deploy', kind: 'compute', wide: [290, 260], tall: [210, 220], tip: 'Shared pipeline templates: security scans and progressive delivery built in.' },
      { id: 'iac', label: 'Infra API', sub: 'Terraform / Crossplane', kind: 'compute', wide: [670, 260], tall: [350, 220], tip: 'Self-service resources behind a small, versioned interface with guardrails.' },
      { id: 'k8s', label: 'Runtime', sub: 'Kubernetes', kind: 'compute', wide: [290, 370], tall: [70, 330], tip: 'Where the service runs: namespaces, quotas and network policy pre-configured.' },
      { id: 'obs', label: 'Observability', sub: 'dashboards · alerts', kind: 'service', wide: [480, 370], tall: [210, 330], tip: 'Default dashboards, SLO alerts and logs wired up by the template.' },
      { id: 'db', label: 'Postgres DB', sub: 'managed, encrypted', kind: 'store', wide: [670, 370], tall: [350, 330], tip: 'Created through the infra API with backups, encryption and tags by default.' }
    ],
    edges: [
      { from: 'dev', to: 'portal' },
      { from: 'plat', to: 'portal', dashed: true },
      { from: 'portal', to: 'cat' },
      { from: 'portal', to: 'scaf' },
      { from: 'portal', to: 'docs' },
      { from: 'scaf', to: 'repo' },
      { from: 'scaf', to: 'iac' },
      { from: 'scaf', to: 'cat', dashed: true },
      { from: 'repo', to: 'ci' },
      { from: 'ci', to: 'k8s' },
      { from: 'iac', to: 'db' },
      { from: 'k8s', to: 'obs' },
      { from: 'k8s', to: 'db', bend: 0.25 },
      { from: 'plat', to: 'iac', dashed: true, bend: -0.35 }
    ]
  },

  scenarios: [
    {
      id: 'golden', title: 'New service on the golden path', tone: 'ok',
      steps: [
        { text: 'A feature team needs a new "price alerts" service. It opens the <b>developer portal</b> and picks the template "Spring Boot service + Postgres".', flow: ['dev>portal', 'portal>scaf'], badges: { scaf: 'template v3' } },
        { text: 'The scaffolder creates a <b>repo from the skeleton</b> (code, tests, Dockerfile, pipeline) and registers it in the <b>catalog</b> with the team as owner.', flow: ['scaf>repo', 'scaf>cat'], ok: ['repo', 'cat'] },
        { text: 'It calls the <b>infra API</b> to claim a small Postgres instance; guardrails add encryption, backups and cost tags automatically.', flow: ['scaf>iac', 'iac>db'], ok: ['db'] },
        { text: 'The first commit runs the shared pipeline and deploys to the runtime with dashboards and alerts already wired.', flow: ['repo>ci', 'ci>k8s', 'k8s>obs'], ok: ['k8s', 'obs'] },
        { text: 'Time to first deploy: <b>under an hour</b>, zero tickets, zero hand-offs. The team spends its time on the alerts logic.', nodes: ['dev'], ok: ['dev'], badges: { dev: ['0 tickets', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'ticketops', title: 'Failure: ticket-ops behind a portal', tone: 'err',
      steps: [
        { text: 'The same request, but the "self-service" portal form <b>only opens a ticket</b> for the platform team.', flow: ['dev>portal', 'portal>scaf'], labels: { scaf: { label: 'Request form', sub: 'creates a ticket' } }, warn: ['scaf'] },
        { text: 'The platform team is 95% busy. In a busy queue, waiting grows sharply: the <b>DB ticket waits 5 days</b>.', flow: ['scaf>iac'], labels: { iac: { label: 'Ops queue', sub: '120 open tickets' } }, err: ['iac'], badges: { iac: ['5 days', 'err'] } },
        { text: 'The pipeline and the production access tickets queue <b>in sequence</b> behind it: four hand-offs before the first deploy.', flow: ['iac>db', 'repo>ci'], labels: { iac: { label: 'Ops queue', sub: '120 open tickets' } }, err: ['iac'], warn: ['ci'], badges: { ci: ['+4 days', 'warn'] } },
        { text: 'Lead time is <b>~3 weeks</b> for a 2-day change. Teams start writing their own scripts to escape the queue. Fix: automate the most frequent ticket types first.', nodes: ['dev', 'plat'], err: ['dev'], badges: { dev: ['3 weeks', 'err'], plat: ['burnt out', 'warn'] }, tone: 'err' }
      ]
    },
    {
      id: 'mandate', title: 'Mandated platform, poor UX', tone: 'warn',
      steps: [
        { text: 'Leadership <b>mandates</b> the new platform for all services by Q3. Nobody asked the teams what hurt.', flow: ['plat>portal', 'dev>portal'], warn: ['portal'], badges: { portal: ['mandatory', 'warn'] } },
        { text: 'The template does not support the event-driven services half the teams build. They fork it and patch it by hand.', flow: ['portal>scaf', 'scaf>repo'], warn: ['repo'], badges: { repo: ['forked', 'warn'] } },
        { text: 'Adoption says 100%, but satisfaction drops and lead time does not move: the <b>mandate hid the signal</b>.', nodes: ['dev'], err: ['dev'], badges: { dev: ['unhappy', 'err'] }, tone: 'warn' },
        { text: 'Fix: make it <b>opt-in</b>, interview the teams who forked it, add an event-driven path, and track voluntary adoption as the product metric.', flow: ['dev>portal', 'portal>scaf'], ok: ['scaf', 'portal'], tone: 'ok' }
      ]
    },
    {
      id: 'scale', title: 'At scale: upgrading 300 services', tone: 'info',
      steps: [
        { text: 'A critical CVE lands in the base image. The organisation has <b>300 services</b> across 40 teams.', nodes: ['cat'], warn: ['k8s'], badges: { k8s: ['CVE', 'warn'] } },
        { text: 'The catalog knows which services came from which <b>template version</b> and who owns each one.', flow: ['portal>cat'], badges: { cat: '240 on path' } },
        { text: 'The platform team updates the template and opens automated pull requests to the 240 golden-path services; pipelines test and roll them out.', flow: ['plat>portal', 'portal>scaf', 'scaf>repo', 'repo>ci', 'ci>k8s'], ok: ['ci', 'k8s'] },
        { text: 'The 60 off-path services must be fixed by their owners by hand. This is the real <b>price of leaving the paved road</b>, and a strong reason to stay on it.', nodes: ['dev'], warn: ['dev'], badges: { dev: ['60 manual', 'warn'] } }
      ]
    },
    {
      id: 'tvp', title: 'Growing from a Thinnest Viable Platform', tone: 'info',
      steps: [
        { text: 'Month 1: the platform is a <b>wiki page and one template repo</b>. Teams copy it. No portal yet.', nodes: ['docs', 'repo'], labels: { docs: { label: 'Wiki page', sub: 'how we deploy' } }, hidden: ['portal', 'scaf', 'cat'] },
        { text: 'Ticket data shows databases are the top request with the longest wait. The team builds <b>one Terraform module</b> behind a pipeline.', flow: ['plat>iac', 'iac>db'], hidden: ['portal', 'scaf', 'cat'], ok: ['iac'] },
        { text: 'With 15 teams, finding "who owns this?" becomes painful. Now a <b>catalog and portal</b> earn their cost.', flow: ['dev>portal', 'portal>cat'], ok: ['cat'] },
        { text: 'Each step was pulled by a measured user problem. The platform grew <b>only as thick as needed</b>.', nodes: ['plat'], ok: ['plat'], badges: { plat: ['pulled, not pushed', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose how a 30-team organisation provides infrastructure. Meters are <em>illustrative</em>, built from hand-off counts, queueing behaviour and the adoption reasoning above, not from a survey.',
    diagram: {
      title: 'How a new service gets its infrastructure',
      nodes: [
        { id: 'dev', label: 'Feature team', sub: 'needs DB + svc', kind: 'team', wide: [100, 150], tall: [210, 0], tip: 'The platform user.' },
        { id: 'tq', label: 'Ticket queue', sub: 'ops team', kind: 'queue', wide: [330, 60], tall: [70, 110], tip: 'Each request waits for a human.' },
        { id: 'sc', label: 'Shared scripts', sub: 'wiki + repo', kind: 'compute', wide: [330, 150], tall: [210, 110], tip: 'Copy-paste automation each team runs itself.' },
        { id: 'portal', label: 'Portal', sub: 'golden paths', kind: 'edge', wide: [330, 250], tall: [350, 110], tip: 'Self-service templates.' },
        { id: 'plat', label: 'Platform team', sub: '6 people', kind: 'team', wide: [580, 60], tall: [70, 220], tip: 'Builds and runs the platform.' },
        { id: 'iac', label: 'Infra API', sub: 'modules', kind: 'compute', wide: [580, 250], tall: [350, 220], tip: 'Terraform modules or Crossplane claims.' },
        { id: 'cat', label: 'Catalog', sub: 'owners + scorecards', kind: 'store', wide: [580, 150], tall: [210, 220], tip: 'Full IDP only.' },
        { id: 'prod', label: 'Production', sub: 'running service', kind: 'service', wide: [850, 150], tall: [210, 330], tip: 'Where value is delivered.' }
      ],
      edges: [
        { from: 'dev', to: 'tq' }, { from: 'tq', to: 'plat' }, { from: 'plat', to: 'prod', bend: 0.15 },
        { from: 'dev', to: 'sc' }, { from: 'sc', to: 'prod' },
        { from: 'dev', to: 'portal' }, { from: 'portal', to: 'iac' }, { from: 'iac', to: 'prod' },
        { from: 'portal', to: 'cat', dashed: true }, { from: 'plat', to: 'cat', dashed: true }
      ]
    },
    controls: [
      { id: 'model', label: 'Platform model', type: 'seg', value: 'portal', options: [
        { v: 'tickets', l: 'Ticket-ops' }, { v: 'scripts', l: 'Shared scripts' }, { v: 'portal', l: 'Self-service + golden paths' }, { v: 'idp', l: 'Full IDP' }] },
      { id: 'adopt', label: 'Adoption strategy', type: 'seg', value: 'optin', options: [
        { v: 'mandate', l: 'Mandate' }, { v: 'optin', l: 'Opt-in product' }] },
      { id: 'size', label: 'Platform team size', type: 'range', min: 1, max: 30, step: 1, value: 6, unit: 'people' },
      { id: 'cov', label: 'Golden path coverage of common requests', type: 'range', min: 0, max: 100, step: 5, value: 60, unit: '%' }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const c = s.model === 'tickets' || s.model === 'scripts' ? Math.min(s.cov, s.model === 'scripts' ? 40 : 0) / 100 : s.cov / 100;
      const need = { tickets: 10, scripts: 3, portal: 5, idp: 10 }[s.model];
      const staff = s.size / need;                                      // staffing ratio vs what the model needs for 30 teams
      const rho = s.model === 'tickets' ? clamp(0.97 - (s.size - 6) * 0.025) : clamp(0.8 - (s.size - need) * 0.03);
      const queueWait = 0.5 * rho / Math.max(0.03, 1 - rho);            // M/M/1-style wait, 0.5-day service
      const manualTicks = 4 * (1 - c);                                   // 4 requests per new service
      const selfDays = s.model === 'scripts' ? 0.5 : 0.05;
      let lead = 2 + manualTicks * (queueWait + 0.5) + 4 * c * selfDays;
      const mandatePain = s.adopt === 'mandate' && (s.cov < 60 || s.model === 'tickets' || s.model === 'scripts');
      if (mandatePain) lead *= 1.15;
      let load = { tickets: 0.5, scripts: 0.8, portal: 0.45, idp: 0.3 }[s.model] - c * 0.2 + (mandatePain ? 0.1 : 0);
      let std = { tickets: 0.6, scripts: 0.25, portal: 0.7, idp: 0.85 }[s.model] * (0.6 + 0.4 * c) + (s.adopt === 'mandate' ? 0.12 : 0);
      const costPeople = s.size;
      let sat = { tickets: 0.2, scripts: 0.4, portal: 0.65, idp: 0.75 }[s.model] + (c - 0.5) * 0.3 + (s.adopt === 'optin' ? 0.08 : (mandatePain ? -0.25 : -0.05)) - (staff < 0.6 && s.model !== 'scripts' ? 0.15 : 0);
      if (s.model === 'idp' && staff < 0.6) { lead *= 1.2; sat -= 0.1; }
      const adoption = s.model === 'tickets' ? 1 : s.adopt === 'mandate' ? 1 : clamp(0.15 + c * 0.75 + (s.model === 'idp' ? 0.05 : 0));
      [load, std, sat] = [load, std, sat].map(clamp);
      const lvl = (x) => (x >= 0.7 ? 'high' : x >= 0.45 ? 'medium' : 'low');
      const metrics = [
        { k: 'Lead time, new service', v: '≈ ' + lead.toFixed(1) + ' days', s: clamp(1 - (lead - 2) / 18), hint: 'illustrative' },
        { k: 'Hand-offs per new service', v: manualTicks.toFixed(1), s: clamp(1 - manualTicks / 4) },
        { k: 'Cognitive load (feature team)', v: lvl(load), s: clamp(1 - load) },
        { k: 'Standardisation', v: lvl(std), s: std },
        { k: 'Platform cost', v: costPeople + ' FTE', s: clamp(1 - costPeople / 30), hint: s.size < need * 0.6 ? 'understaffed' : '' },
        { k: 'Developer satisfaction', v: lvl(sat), s: sat },
        { k: 'Voluntary adoption', v: s.adopt === 'mandate' || s.model === 'tickets' ? 'unknown (forced)' : Math.round(adoption * 100) + '%', s: s.adopt === 'mandate' || s.model === 'tickets' ? 0.3 : adoption }
      ];
      const notes = [];
      if (s.model === 'tickets') notes.push('Every request is a hand-off. At ' + Math.round(rho * 100) + '% utilisation the queue wait is about <b>' + queueWait.toFixed(1) + ' days per ticket</b>; queues grow sharply above ~80% busy.');
      if (s.model === 'scripts') notes.push('Shared scripts remove the queue but push the work (and the Terraform knowledge) onto every team: <b>high cognitive load and drift</b>. Coverage is capped at 40% here.');
      if (s.model === 'portal' || s.model === 'idp') notes.push('Golden paths cover ' + s.cov + '% of requests; the other ' + (100 - s.cov) + '% still go to a human. Automate the <b>most frequent, longest-waiting</b> ticket type next.');
      if (s.model === 'idp' && staff < 0.6) notes.push('A full IDP (portal, catalog, scorecards, plugins) with ' + s.size + ' people is <b>under-staffed</b>; it will be half-built. Start thinner.');
      if (mandatePain) notes.push('A <b>mandate on a weak platform</b> hides the signal: adoption reads 100% while teams fork templates and satisfaction falls.');
      if (s.adopt === 'optin' && (s.model === 'portal' || s.model === 'idp')) notes.push('Opt-in makes <b>voluntary adoption</b> your product metric: if teams do not choose it, the platform is not good enough yet.');
      let verdict;
      if (s.model === 'tickets') verdict = '❌ <b>Ticket-ops makes the ops team the bottleneck</b>: lead time ≈ ' + lead.toFixed(0) + ' days for a 2-day change. Automate the top requests.';
      else if (s.model === 'scripts') verdict = '⚠ <b>Fast but fragmented.</b> Teams self-serve, but each owns its own copy of the plumbing. Turn the scripts into supported golden paths.';
      else if (mandatePain) verdict = '⚠ <b>A mandate is covering for a platform users do not want yet.</b> Raise coverage and make it opt-in before enforcing.';
      else if (s.model === 'idp' && staff < 0.6) verdict = '⚠ <b>Too thick for the team you have.</b> A Thinnest Viable Platform with golden paths would deliver more.';
      else if (s.cov >= 60 && s.adopt === 'optin') verdict = '✅ <b>Platform as a product:</b> self-service golden paths, voluntary adoption, low cognitive load. Keep measuring lead time and satisfaction.';
      else verdict = '👍 <b>Right direction.</b> Raise golden-path coverage so most new services never need a ticket.';
      const hide = { tickets: ['sc', 'portal', 'iac', 'cat'], scripts: ['tq', 'portal', 'iac', 'cat'], portal: ['sc', 'cat'], idp: ['sc'] }[s.model];
      const flow = s.model === 'tickets' ? ['dev>tq', 'tq>plat', 'plat>prod'] : s.model === 'scripts' ? ['dev>sc', 'sc>prod'] :
        ['dev>portal', 'portal>iac', 'iac>prod'].concat(s.model === 'idp' ? ['portal>cat'] : []).concat(c < 1 ? ['dev>tq', 'tq>plat'] : []);
      if (s.model !== 'tickets' && s.model !== 'scripts' && c >= 1) hide.push('tq');
      return {
        metrics, verdict, notes, hide, flow,
        labels: { plat: { label: 'Platform team', sub: s.size + ' people' }, portal: { label: s.model === 'idp' ? 'Backstage IDP' : 'Portal', sub: s.cov + '% golden path' }, tq: { label: 'Ticket queue', sub: Math.round(rho * 100) + '% busy' } },
        warn: (s.model === 'scripts' ? ['sc'] : []).concat(mandatePain ? ['portal'] : []),
        err: s.model === 'tickets' ? ['tq'] : [],
        ok: (s.model === 'portal' || s.model === 'idp') && c >= 0.6 ? ['portal', 'iac'] : [],
        badges: { dev: ['≈ ' + lead.toFixed(0) + ' days', lead > 10 ? 'err' : lead > 5 ? 'warn' : 'ok'] }
      };
    }
  },

  widget: {
    title: 'Lead-time simulator: ticket queue vs golden path',
    caption: 'A feature team needs a <b>database</b>, a <b>service</b> and a <b>pipeline</b>, then writes two days of code and deploys. Top: each step is a ticket in a busy queue (waits follow the M/M/1 queueing formula). Bottom: one golden-path template. Press <b>Run</b> and change the ops utilisation to see why busy queues explode.'
  },

  realWorld: {
    intro: 'From Netflix\'s paved road and Spotify\'s golden paths to a CNCF definition and DORA data. Every item links to its source.',
    timeline: [
      { when: '2017–2018', who: 'Netflix', title: 'The paved road and full-cycle developers', text: 'Netflix described central teams that build a <b>paved road</b> of frameworks and tools so that developers can <b>operate what they build</b>. Netflix stresses that the paved road is <b>not mandatory</b>: teams may leave it, and then own the extra work.', src: 0 },
      { when: '2020', who: 'Spotify', title: 'Golden Paths against fragmentation', text: 'Spotify explained that golden paths, "the opinionated and supported path" to build something, began as a Hack Week tutorial for backend engineers and grew into one path per discipline, to fight fragmentation in tools and practices.', src: 1 },
      { when: 'March 2020', who: 'Spotify', title: 'Backstage open-sourced', text: 'Spotify released its internal developer portal, <b>Backstage</b>, as open source: a software catalog, software templates (the scaffolder) and TechDocs, extensible with plugins. The CNCF accepted it into the <b>Sandbox in September 2020</b>.', src: 2 },
      { when: 'March 2022', who: 'CNCF', title: 'Backstage moves to Incubation', text: 'The CNCF Technical Oversight Committee voted to accept Backstage as an <b>incubating project</b>.', src: 3 },
      { when: '2019 →', who: 'Skelton & Pais', title: 'Thinnest Viable Platform', text: 'Team Topologies frames the platform team as one of four team types and argues for the <b>Thinnest Viable Platform</b>: it can be as small as a wiki page; do not make it thicker than necessary.', src: 4 },
      { when: '2021', who: 'Forsgren, Storey et al.', title: 'The SPACE of developer productivity', text: 'ACM Queue 19(1): productivity cannot be reduced to one metric. Five dimensions: <b>Satisfaction and well-being, Performance, Activity, Communication and collaboration, Efficiency and flow</b>. Use several, across at least three dimensions.', src: 5 },
      { when: 'April / Oct 2023', who: 'CNCF TAG App Delivery', title: 'Platforms white paper and maturity model', text: 'The Platforms Working Group published a white paper on what platforms are and why, then (v1, October 2023) a <b>maturity model with 5 aspects and 4 levels</b>. It warns that each aspect should be assessed separately and that each level costs more funding and people.', src: 6 },
      { when: '2024', who: 'DORA (Google Cloud)', title: 'Platforms: gains and a J-curve', text: 'The 2024 Accelerate State of DevOps report associated internal platforms with higher individual productivity but also an <b>8% decrease in throughput and 14% in change stability</b>, and described a J-curve: early gains, a dip, then recovery as the platform matures.', src: 7 }
    ],
    lessons: [
      'Golden paths work because they are <b>optional and better</b>, not because they are enforced (Netflix and Spotify both say so).',
      'Start thin: a documented template and one automated request beat a half-built portal.',
      'Measure with <b>more than one lens</b>: DORA for delivery, SPACE and surveys for experience, adoption for product fit.',
      'Expect a <b>J-curve</b>: a platform adds change before it removes it. Plan for the dip and measure through it.'
    ],
    sources: [
      { title: 'Full Cycle Developers at Netflix (InfoQ summary of the Netflix Tech Blog post)', url: 'https://www.infoq.com/news/2018/06/netflix-full-cycle-developers/', pub: 'InfoQ, 2018' },
      { title: 'How We Use Golden Paths to Solve Fragmentation in Our Software Ecosystem', url: 'https://engineering.atspotify.com/2020/8/how-we-use-golden-paths-to-solve-fragmentation-in-our-software-ecosystem', pub: 'Spotify Engineering, 2020' },
      { title: 'Cloud Native Computing Foundation Accepts Backstage as a Sandbox Project', url: 'https://engineering.atspotify.com/2020/9/cloud-native-computing-foundation-accepts-backstage-as-a-sandbox-project', pub: 'Spotify Engineering, 2020' },
      { title: 'Backstage project joins the CNCF Incubator', url: 'https://cncf.io/blog/2022/03/15/backstage-project-joins-the-cncf-incubator', pub: 'CNCF blog, 2022' },
      { title: 'What is a Thinnest Viable Platform (TVP)?', url: 'https://teamtopologies.com/key-concepts-content/what-is-a-thinnest-viable-platform-tvp', pub: 'teamtopologies.com' },
      { title: 'The SPACE of Developer Productivity', url: 'https://queue.acm.org/detail.cfm?id=3454124', pub: 'Forsgren et al., ACM Queue, 2021' },
      { title: 'Platform Engineering Maturity Model', url: 'https://tag-app-delivery.cncf.io/whitepapers/platform-eng-maturity-model/', pub: 'CNCF TAG App Delivery, 2023' },
      { title: 'Announcing the 2024 DORA report', url: 'https://cloud.google.com/blog/products/devops-sre/announcing-the-2024-dora-report', pub: 'Google Cloud, 2024' },
      { title: 'Accelerate State of DevOps Report 2024 (PDF)', url: 'https://services.google.com/fh/files/misc/2024_final_dora_report.pdf', pub: 'DORA, 2024' },
      { title: 'Platforms Working Group (white paper and maturity model)', url: 'https://tag-app-delivery.cncf.io/wgs/platforms', pub: 'CNCF TAG App Delivery' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Adoption', '<b>Mandate</b>: fast standardisation, one way to do things', '<b>Opt-in product</b>: adoption is earned and measured', 'Opt-in for golden paths; mandate only <b>guardrails</b> (security, compliance) that every path must meet'],
      ['Portal', '<b>Build on Backstage</b> (OSS): flexible, large plugin ecosystem, needs a team to run it', '<b>Commercial portal</b> (SaaS): faster start, less control', 'Backstage when you have 3+ people to own it; SaaS when the platform team is small'],
      ['Infra interface', '<b>Terraform modules</b> run by pipelines: familiar, plan/apply review', '<b>Crossplane / Kubernetes APIs</b>: continuous reconciliation, one API style', 'Terraform if teams already know it; Crossplane if Kubernetes is already your control plane'],
      ['Scope', '<b>Thinnest Viable Platform</b>: docs, templates, a few automations', '<b>Full IDP</b>: portal, catalog, scorecards, environments on demand', 'Start thin; add each layer when ticket data or surveys show the pull'],
      ['Golden path flexibility', '<b>Rigid</b>: one stack, easier to support and upgrade', '<b>Extensible</b>: escape hatches and multiple paths', 'Rigid for the 80% case, with an explicit, documented off-road option']
    ]
  },
  failures: [
    { f: 'Ticket-ops platform', detect: 'Portal forms create tickets; request lead time measured in days', fix: 'Automate the most frequent, longest-waiting ticket type end to end; publish the ticket-to-self-service ratio.' },
    { f: 'Mandatory platform with poor UX', detect: '100% "adoption" but forked templates, low survey scores, workarounds', fix: 'Make paths opt-in, run user interviews, treat forks as feature requests, track voluntary adoption.' },
    { f: 'Building everything in-house', detect: 'Platform team maintains a custom portal, CI and deploy tool; roadmap is all plumbing', fix: 'Buy or adopt OSS for commodity parts (Backstage, managed CI); build only the glue that is specific to you.' },
    { f: 'Platform team as bottleneck', detect: 'Platform approvals in every change; its backlog grows with the number of teams', fix: 'Replace approvals with policy-as-code guardrails; X-as-a-Service interaction, not collaboration by default.' },
    { f: 'Shelfware: built for imagined users', detect: 'Features with no usage after months; nobody can name the top developer pain', fix: 'Product discovery: survey, shadow teams, mine ticket data; a roadmap of problems, not technologies.' },
    { f: 'Golden path rot', detect: 'Services created from template v1 never upgraded; many template versions live', fix: 'Record template version in the catalog; automated upgrade PRs; deprecate old paths with dates.' },
    { f: 'Vanity metrics', detect: 'Reporting portal page views or number of templates', fix: 'Report DORA lead time, time to first deploy, adoption and satisfaction, on-path vs off-path.' }
  ],

  interview: [
    { q: 'What is platform engineering, and how is it different from DevOps?', a: '<p>Platform engineering builds an <b>internal developer platform</b>: self-service capabilities and golden paths that let product teams build and run software with less cognitive load. DevOps is a culture of shared ownership between dev and ops ("you build it, you run it").</p><p>Platform engineering is one way to make DevOps <b>scale</b>: rather than every team learning every tool, a platform team turns the common needs into a product.</p>', lvl: 'core' },
    { q: 'What does "platform as a product" mean in practice?', a: '<ul><li><b>Users</b>: developers; do discovery (interviews, ticket mining, surveys).</li><li><b>Roadmap</b> of problems ranked by impact, public changelog and deprecations.</li><li><b>SLOs</b> for the platform itself.</li><li><b>Adoption, not mandate</b>: voluntary use is the proof of value.</li><li>A <b>product manager</b> or owner for the platform.</li></ul>', lvl: 'core' },
    { q: 'What is a golden path? Should it be mandatory?', a: '<p>Spotify (2020): the <b>opinionated and supported</b> way to build something, for example a Spring Boot service with Postgres, pipeline and dashboards. Netflix calls it the <b>paved road</b> and says explicitly that it is not mandatory.</p><p>Make the path optional but so good that most teams choose it; teams that leave it own the extra work. Mandate only the <b>guardrails</b> (encryption, identity, audit) that any path must meet.</p>', lvl: 'core' },
    { q: 'What is the Thinnest Viable Platform?', a: '<p>Team Topologies (Skelton and Pais, 2019): the smallest platform that speeds up the stream-aligned teams. It can be just a <b>wiki page</b> of standard practices and a template. Grow it only where teams pull, because every layer has to be run, documented and supported.</p>', lvl: 'core' },
    { q: 'How do you measure whether the platform is working?', a: '<p>Use several lenses, as SPACE (Forsgren et al., 2021) recommends:</p><ul><li><b>DORA</b>: lead time for changes, deployment frequency, change failure rate, time to restore, compared on-path vs off-path.</li><li><b>Time to first deploy</b> of a new service, onboarding time.</li><li><b>Adoption</b>: share of new services from templates (voluntary).</li><li><b>Satisfaction</b>: quarterly survey with top friction points.</li><li><b>Ticket rate</b> to the platform team per team.</li></ul><p>Avoid vanity metrics such as page views.</p>', fu: 'What did DORA 2024 find? (Higher individual productivity, but lower throughput and stability on average: a J-curve as platforms mature.)', lvl: 'core' },
    { q: 'Why do ticket queues make lead time explode as the ops team gets busier?', a: '<p>Queueing theory: in a simple M/M/1 queue the average wait is <b>ρ/(1−ρ) × service time</b>. At 50% busy the wait equals the service time; at 90% it is 9×; at 95% it is 19×. A team kept "fully utilised" guarantees long waits, and a new service needs several tickets in sequence.</p><p>Self-service removes the human from the queue, so the wait drops to the automation\'s run time.</p>', lvl: 'deep' },
    { q: 'Backstage: what are its core parts and what does it not do?', a: '<p>Open-sourced by Spotify in 2020, a CNCF incubating project. Core: the <b>software catalog</b> (entities from catalog-info.yaml), <b>software templates</b> (the scaffolder) and <b>TechDocs</b> (docs-as-code), plus plugins.</p><p>It is a <b>portal, not a platform</b>: it does not provision infrastructure or deploy anything by itself. Behind it you still need CI/CD, an infra API and runtime. It also needs a team to own it; it is a framework, not a finished product.</p>', lvl: 'core' },
    { q: 'Design the self-service interface for "give me a Postgres database".', a: '<ol><li>A small, declarative contract: name, owner, size (S/M/L), environment. Hide engine version, networking, backups.</li><li>Implement it as a <b>Terraform module</b> run by a pipeline, or a <b>Crossplane</b> composite resource.</li><li>Guardrails baked in: encryption, backups, tags, private network, approved regions.</li><li>Register the resource in the catalog with the owner.</li><li>Expose it through the template, the CLI and GitOps, all using the same API.</li></ol>', lvl: 'deep' },
    { q: 'You join a company where the platform is mandatory and teams hate it. What do you do?', a: '<ol><li><b>Listen</b>: survey and interview teams; look at forks and workarounds.</li><li>Find the top three frictions and fix them visibly.</li><li>Separate <b>guardrails</b> (stay mandatory) from <b>paths</b> (become opt-in).</li><li>Publish a roadmap and satisfaction scores; track voluntary adoption.</li><li>Report lead time on-path vs off-path to prove value.</li></ol>', lvl: 'deep' },
    { q: 'Behavioural: Tell me about a time you made a platform team stop being a ticket queue.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> A 7-person infra team got about 250 tickets a month from 30 teams; a new service took around three weeks.</p><p><b>T:</b> As architect, cut that without adding headcount.</p><p><b>A:</b> Mined three months of tickets: databases, namespaces and pipelines were 60% of volume. Built one golden-path template (repo, Postgres via a Terraform module, pipeline, dashboards) with two pilot teams, then opened it to all as opt-in. Published time-to-first-deploy weekly.</p><p><b>R:</b> In two quarters new services went from weeks to under a day, tickets fell by about half, and 70% of new services used the template voluntarily.</p>', lvl: 'deep' },
    { q: 'Behavioural: How did you convince leadership to fund a platform team?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Twelve teams each kept their own pipelines and Terraform; audit found inconsistent encryption.</p><p><b>T:</b> Get funding for a platform team in a tight budget.</p><p><b>A:</b> Estimated the cost from survey and ticket data (engineer-hours on undifferentiated infra), framed risk in audit terms, and proposed a two-quarter pilot of 4 people moved from existing teams with three measurable goals: new service in a day, one pipeline template, encryption by default.</p><p><b>R:</b> Pilot approved; two of three goals met and the team was made permanent. Lesson: lead with the cost of not doing it.</p>', lvl: 'deep' },
    { q: 'Behavioural: Describe a platform feature that failed and what you learned.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> We built ephemeral preview environments for every pull request; after three months only two teams used them.</p><p><b>T:</b> Decide whether to invest more or stop.</p><p><b>A:</b> Interviewed eight teams: environments took 20 minutes to start and lacked test data, so teams kept using staging. We had built for an imagined need without discovery.</p><p><b>R:</b> We paused it, fixed seeded test data for the two teams that cared, and introduced a rule: no new capability without three committed pilot teams. Lesson: discovery before delivery, even for internal products.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Backstage scaffolder template.yaml: Spring Boot golden path', lang: 'yaml',
      code: `apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: spring-boot-postgres
  title: Spring Boot service with Postgres
  tags: [java, spring-boot, golden-path]
spec:
  owner: group:platform-team
  type: service
  parameters:
    - title: Service details
      required: [name, owner]
      properties:
        name: { type: string, pattern: '^[a-z][a-z0-9-]{2,30}$' }
        owner:
          type: string
          ui:field: OwnerPicker
          ui:options: { catalogFilter: { kind: Group } }
        dbSize: { type: string, enum: [small, medium], default: small }
  steps:
    - id: fetch
      name: Fetch skeleton
      action: fetch:template
      input:
        url: ./skeleton            # Java 21, Spring Boot 3, Dockerfile, CI, catalog-info.yaml
        values: { name: '\${{ parameters.name }}', owner: '\${{ parameters.owner }}', dbSize: '\${{ parameters.dbSize }}' }
    - id: publish
      name: Publish repo
      action: publish:github
      input:
        repoUrl: github.com?owner=acme&repo=\${{ parameters.name }}
        defaultBranch: main
    - id: register
      name: Register in catalog
      action: catalog:register
      input:
        repoContentsUrl: \${{ steps.publish.output.repoContentsUrl }}
        catalogInfoPath: /catalog-info.yaml
  output:
    links:
      - { title: Repository, url: '\${{ steps.publish.output.remoteUrl }}' }
      - { title: Open in catalog, icon: catalog, entityRef: '\${{ steps.register.output.entityRef }}' }`,
      note: 'The skeleton also contains a <code>catalog-info.yaml</code> (<code>kind: Component</code>, <code>spec.owner: \${{ values.owner }}</code>, <code>dependsOn: [resource:\${{ values.name }}-db]</code>) and a Terraform file that calls the module below, so the database is created by the repo\'s own pipeline.'
    },
    {
      title: 'Terraform module as a self-service product interface', lang: 'bash',
      code: `# modules/postgres/variables.tf  -- the whole public contract
variable "name"  { type = string }
variable "owner" { type = string }                 # catalog group, becomes a tag
variable "size" {
  type    = string
  default = "small"
  validation {
    condition     = contains(["small", "medium"], var.size)
    error_message = "size must be small or medium; ask #platform for more."
  }
}

# modules/postgres/main.tf  -- guardrails the user cannot turn off
locals {
  class = { small = "db.t4g.medium", medium = "db.r6g.large" }[var.size]
}
resource "aws_db_instance" "this" {
  identifier                  = var.name
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = local.class
  allocated_storage           = var.size == "small" ? 20 : 100
  storage_encrypted           = true
  backup_retention_period     = 7
  deletion_protection         = true
  username                    = "app_admin"
  manage_master_user_password = true               # secret lives in Secrets Manager
  db_subnet_group_name        = "private-data"
  publicly_accessible         = false
  tags = { owner = var.owner, service = var.name, managed_by = "platform" }
}

output "endpoint"   { value = aws_db_instance.this.address }
output "secret_arn" { value = aws_db_instance.this.master_user_secret[0].secret_arn }`,
      note: 'Shown as HCL. Three inputs, everything else is the platform\'s opinion. Version the module (<code>source = "...//postgres?ref=v2.3.0"</code>) so you can change the internals without breaking users, exactly like a public API.'
    },
    {
      title: 'Python: DORA lead time for changes from commits and deploys', lang: 'python',
      code: `"""Lead time for changes = commit time -> time that commit runs in production.  (Python 3.11+)"""
from datetime import datetime
from statistics import median, quantiles

commits = {   # sha -> commit timestamp (from git log)
    "a1": "2026-11-02T09:10", "b2": "2026-11-02T15:40",
    "c3": "2026-11-03T11:05", "d4": "2026-11-04T16:20",
}
deploys = [   # production deploys: (time, head sha, shas included since the last deploy)
    ("2026-11-03T10:00", "b2", ["a1", "b2"]),
    ("2026-11-05T09:30", "d4", ["c3", "d4"]),
]

def ts(s: str) -> datetime:
    return datetime.fromisoformat(s)

def lead_times_hours() -> list[float]:
    out = []
    for when, _head, shas in deploys:
        for sha in shas:                       # every commit shipped by this deploy
            out.append((ts(when) - ts(commits[sha])).total_seconds() / 3600)
    return out

lt = lead_times_hours()
p50 = median(lt)
p90 = quantiles(lt, n=10)[-1] if len(lt) >= 2 else lt[0]
print(f"changes: {len(lt)}  median lead time: {p50:.1f} h  p90: {p90:.1f} h")
print("deployment frequency:", len(deploys), "per period")`,
      note: 'DORA measures from <b>commit</b> to running in production, per change, and reports the median. Count every commit a deploy ships, not just the head. Compare teams on and off the golden path, never individuals.'
    }
  ],

  related: ['conways-law', 'infrastructure-as-code', 'gitops', 'deployment-strategies', 'architecture-governance', 'structured-upskilling']
});
