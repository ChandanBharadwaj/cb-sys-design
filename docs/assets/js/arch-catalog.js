/* Architecture track: pillars (domains) and topics. Used by the index pages, the nav drawer and cross-links.
   A topic with status: 'planned' is listed but has no page yet. */
(window.SD_TRACKS = window.SD_TRACKS || {}).arch = {
  track: {
    id: 'arch', name: 'Architecture', brand: 'Architecture Atlas', icon: '⬡',
    unit: 'topic', units: 'topics', group: 'pillar', groups: 'pillars',
    dir: 'architecture', pageDir: 'topics', visitedKey: 'arch-visited', relatedTitle: 'Related topics',
    examplesPrefix: '↳ ', filterReady: true, addedLabel: '★ added topic',
    sections: {
      requirements: { title: 'Principles & quality attributes', label: 'Principles', sub: 'The rules this approach lives by, the qualities it buys, and the anti-patterns to avoid.', cols: ['Core principles', 'Quality goals', 'Anti-patterns'] },
      capacity: { title: 'Model it', label: 'Model it', sub: 'Drag the sliders. Every number recomputes live.' },
      api: { title: 'Contracts & artefacts', label: 'Artefacts', sub: 'What an architect actually writes down for this topic.' },
      architecture: { title: 'Architecture in motion', label: 'In motion', sub: 'Pick a scenario and step through it. Tap any box for details. ← → keys step through.' },
      knobs: { title: 'Decision knobs: change a choice, see the impact', label: 'Decide' },
      realWorld: { title: 'How real organisations did it', label: 'Real world' },
      tradeoffs: { title: 'Trade-offs, anti-patterns & failure modes', label: 'Trade-offs' },
      interview: { title: 'Architect interview questions', label: 'Interview' },
      code: { title: 'Build it in your stack', label: 'Code', sub: 'Small, real snippets: Java / Spring Boot, Postgres, Python, Terraform, YAML.' }
    }
  },
  domains: [
    { id: 1, name: 'Laws, Theorems & Principles', icon: '∑', blurb: 'The theory interviewers expect you to quote, and apply correctly.' },
    { id: 2, name: 'Architecture Foundations', icon: '⌂', blurb: 'Styles, quality attributes and how to write architecture down.' },
    { id: 3, name: 'Business Strategy & Finance', icon: '₹', blurb: 'Build vs buy, cloud economics, risk and turning OKRs into NFRs.' },
    { id: 4, name: 'Modern Architectural Paradigms', icon: '◈', blurb: 'DDD, evolution, data architecture, CDC, migrations and AI systems.' },
    { id: 5, name: 'Integration & APIs', icon: '⇄', blurb: 'Events, sagas, API contracts and multi-tenant SaaS.' },
    { id: 6, name: 'Infrastructure, DevOps & Delivery', icon: '⚙', blurb: 'Containers, deployments, IaC, resilience and platforms.' },
    { id: 7, name: 'Security & Compliance', icon: '⛨', blurb: 'Zero trust, identity, supply chain, privacy and keys.' },
    { id: 8, name: 'Observability & Operations', icon: '◉', blurb: 'Telemetry, SLOs, disaster recovery, chaos and incidents.' },
    { id: 9, name: 'Leadership & Human Architecture', icon: '☺', blurb: 'Influence, teams, communication, debt and governance.' }
  ],
  systems: [
    { slug: 'cap-pacelc', domain: 1, title: 'CAP & PACELC', one: 'When the network splits you must pick consistency or availability; when it does not, you still trade latency for consistency.', examples: 'Brewer, Gilbert–Lynch, Abadi', tags: ['CP vs AP', 'partitions', 'latency'] },
    { slug: 'consistency-models', domain: 1, title: 'Consistency Models & Isolation', one: 'What a read is allowed to return: from linearizable to eventual, and which anomalies each isolation level lets through.', examples: 'Jepsen, Postgres SSI', tags: ['linearizable', 'causal', 'write skew'] },
    { slug: 'consensus-theory', domain: 1, title: 'Consensus & Impossibility Results', one: 'Why agreement over an unreliable network is hard, and how quorums, Raft and fencing make it practical.', examples: 'FLP, Two Generals, Raft', tags: ['quorum', 'byzantine', 'fallacies'] },
    { slug: 'scalability-laws', domain: 1, title: 'Scalability Laws', one: 'How much faster more machines really make you, and how queues explode as utilisation climbs.', examples: "Amdahl, Gunther's USL, Little", tags: ['speed-up', 'queueing', 'tail latency'] },
    { slug: 'design-principles', domain: 1, title: 'Design Principles', one: 'SOLID, coupling and cohesion: the rules that keep code and modules easy to change.', examples: 'SOLID, Demeter, Gall', tags: ['coupling', 'cohesion', 'YAGNI'] },
    { slug: 'socio-technical-laws', domain: 1, title: 'Socio-technical Laws', one: 'The laws about people and software: why adding engineers slows you down and every behaviour becomes a contract.', examples: 'Conway, Brooks, Hyrum, Goodhart', tags: ['teams', 'metrics', 'evolution'] },
    { slug: 'reliability-math', domain: 1, title: 'Reliability Math', one: 'Turning nines into minutes, and working out the availability of a chain of dependencies.', examples: 'Nines, MTBF/MTTR, cells', tags: ['availability', 'blast radius', 'shuffle sharding'] },

    { slug: 'architectural-styles', domain: 2, title: 'Architectural Styles', one: 'Layered, hexagonal, modular monolith, microservices, serverless, event-driven: what each costs and when to pick it.', examples: 'Spring Modulith, Shopify, Prime Video', tags: ['hexagonal', 'modular monolith', 'microservices'], added: true },
    { slug: 'quality-attributes', domain: 2, title: 'Quality Attributes & ATAM', one: 'Making "fast, secure, scalable" measurable and finding which decisions trade one against another.', examples: 'ISO 25010, SEI ATAM', tags: ['utility tree', 'scenarios', 'trade-off points'], added: true },
    { slug: 'documenting-architecture', domain: 2, title: 'Documenting Architecture', one: 'Diagrams and docs people actually read: C4 levels, arc42 sections and diagrams as code.', examples: 'C4, arc42, Structurizr', tags: ['C4', 'diagrams as code', '4+1'], added: true },

    { slug: 'build-vs-buy', domain: 3, title: 'Build vs Buy vs Rent', one: 'Deciding whether to build it, buy a product, rent SaaS or adopt open source, based on what makes you different.', examples: 'Wardley maps, TCO, decision matrix', tags: ['core vs context', 'TCO', 'lock-in'] },
    { slug: 'finops', domain: 3, title: 'FinOps & Cloud Economics', one: 'Knowing what each feature costs to run, and designing so the cloud bill grows slower than the business.', examples: 'FinOps Foundation, AWS CUR', tags: ['TCO', 'unit cost', 'spot/RI'], status: 'planned' },
    { slug: 'risk-management', domain: 3, title: 'Risk Management & Lock-in', one: 'Listing what could go wrong (technical, operational, vendor) and choosing to avoid, reduce, transfer or accept each risk.', examples: 'Risk register, pre-mortem', tags: ['heat map', 'vendor lock-in', 'mitigation'], status: 'planned' },
    { slug: 'okrs-to-nfrs', domain: 3, title: 'Translating OKRs to Tech', one: 'Turning a business goal like "increase retention" into a measurable target like "p95 page load under 200 ms".', examples: 'Impact mapping, latency budgets', tags: ['OKR', 'NFR', 'traceability'], status: 'planned' },

    { slug: 'ddd', domain: 4, title: 'Domain-Driven Design', one: 'Finding the right service boundaries by modelling the business: bounded contexts, a shared language and aggregates.', examples: 'Evans, Event Storming', tags: ['bounded context', 'aggregate', 'ACL'] },
    { slug: 'strangler-fig', domain: 4, title: 'Evolutionary Architecture & Strangler Fig', one: 'Replacing a legacy monolith piece by piece behind a facade, with no big-bang rewrite and no downtime.', examples: 'Fowler, Shopify, fitness functions', tags: ['facade', 'shadow traffic', 'branch by abstraction'] },
    { slug: 'data-architecture', domain: 4, title: 'Data Architecture: Mesh, Lake, CQRS, ES', one: 'Where analytical data lives and who owns it, and when to split reads from writes or store events instead of state.', examples: 'Data mesh, lakehouse, Axon', tags: ['data mesh', 'CQRS', 'event sourcing'], status: 'planned' },
    { slug: 'cdc-pipelines', domain: 4, title: 'Change Data Capture & Change Data Feed', one: 'Streaming every database change to other systems in order, so caches, search and warehouses stay in sync.', examples: 'Debezium, Delta CDF, outbox', tags: ['WAL', 'Kafka Connect', 'outbox'], status: 'planned' },
    { slug: 'zero-downtime-migrations', domain: 4, title: 'Zero-Downtime State Migrations', one: 'Changing schemas and moving billions of rows in parallel waves while users keep working.', examples: 'Expand/contract, gh-ost, pg_repack', tags: ['backfill', 'waves', 'dual write'], status: 'planned' },
    { slug: 'ai-architecture', domain: 4, title: 'AI System Architecture', one: 'Designing around non-deterministic models: RAG pipelines, embedding choices, evals, guardrails and MCP tool access.', examples: 'RAG, MCP, local embeddings', tags: ['RAG', 'agents', 'guardrails'] },
    { slug: 'twelve-factor', domain: 4, title: 'The 12-Factor App', one: 'Twelve rules that make a service portable, disposable and easy to scale on any cloud.', examples: 'Heroku, Spring Boot, Kubernetes', tags: ['config', 'stateless', 'disposability'], status: 'planned' },

    { slug: 'event-driven-sagas', domain: 5, title: 'Event-Driven Architecture & Sagas', one: 'Keeping data consistent across services without distributed transactions: events, outbox and compensations.', examples: 'Temporal, Camunda, outbox', tags: ['choreography', 'orchestration', 'outbox'], added: true, status: 'planned' },
    { slug: 'api-design', domain: 5, title: 'API Design & Governance', one: 'Designing REST, gRPC and GraphQL APIs that evolve without breaking the teams that depend on them.', examples: 'OpenAPI, Pact, Google AIP', tags: ['versioning', 'contract tests', 'idempotency'], added: true, status: 'planned' },
    { slug: 'multi-tenancy', domain: 5, title: 'Multi-tenancy Architecture', one: 'Serving many customers from one platform while keeping their data, performance and costs isolated.', examples: 'AWS SaaS Lens, Postgres RLS', tags: ['silo/pool/bridge', 'RLS', 'noisy neighbour'], added: true, status: 'planned' },

    { slug: 'container-patterns', domain: 6, title: 'Advanced Container Patterns', one: 'Sidecars, ambassadors and init containers, and when a sidecar beats a shared library or a separate service.', examples: 'Kubernetes, Dapr, Envoy', tags: ['sidecar', 'pod design', 'autoscaling'], status: 'planned' },
    { slug: 'deployment-strategies', domain: 6, title: 'Deployment Strategies & Feature Flags', one: 'Shipping safely: blue-green, canary with automatic rollback, dark launches and flags at scale.', examples: 'Argo Rollouts, LaunchDarkly', tags: ['canary', 'blue-green', 'flags'], status: 'planned' },
    { slug: 'infrastructure-as-code', domain: 6, title: 'Infrastructure as Code & Drift', one: 'Describing every environment in code so it can be rebuilt identically, and catching manual drift.', examples: 'Terraform, Pulumi, OPA', tags: ['immutable', 'state', 'drift'], status: 'planned' },
    { slug: 'resiliency-patterns', domain: 6, title: 'Resiliency Patterns', one: 'Timeouts, retries with backoff and jitter, circuit breakers and bulkheads that stop one failure becoming an outage.', examples: 'Resilience4j, Hystrix, AWS Builders’ Library', tags: ['circuit breaker', 'jitter', 'bulkhead'] },
    { slug: 'platform-engineering', domain: 6, title: 'Platform Engineering', one: 'Building self-service golden paths so product teams ship without filing tickets or learning every tool.', examples: 'Backstage, Spotify, DORA', tags: ['IDP', 'golden path', 'cognitive load'], status: 'planned' },
    { slug: 'service-mesh', domain: 6, title: 'Service Mesh', one: 'Moving mTLS, retries and traffic shifting out of every service and into a shared network layer.', examples: 'Istio, Linkerd, ambient mesh', tags: ['data plane', 'mTLS', 'traffic split'], added: true, status: 'planned' },
    { slug: 'gitops', domain: 6, title: 'GitOps', one: 'Making Git the single source of truth for what runs, with agents that keep the cluster matching it.', examples: 'Argo CD, Flux', tags: ['reconcile', 'pull deploy', 'promotion'], added: true, status: 'planned' },

    { slug: 'zero-trust', domain: 7, title: 'Zero Trust Architecture', one: 'Never trusting the network: every service call is authenticated, authorised and encrypted, even inside the perimeter.', examples: 'NIST 800-207, BeyondCorp, SPIFFE', tags: ['mTLS', 'micro-segmentation', 'workload identity'], status: 'planned' },
    { slug: 'iam-oauth-oidc', domain: 7, title: 'Identity & Access: OAuth, OIDC, JWT', one: 'Who the user is, what the app may do on their behalf, and how every service checks it: OAuth 2.0, OIDC, JWT, RBAC vs ABAC.', examples: 'Keycloak, Okta, Spring Security, Zanzibar', tags: ['PKCE', 'JWT', 'RBAC/ABAC'] },
    { slug: 'devsecops', domain: 7, title: 'DevSecOps & Supply Chain Security', one: 'Catching vulnerable or malicious code before it ships: scanning, SBOMs, signed builds and safe registries.', examples: 'SLSA, Sigstore, CycloneDX', tags: ['SAST/DAST', 'SBOM', 'dependency confusion'], status: 'planned' },
    { slug: 'data-privacy', domain: 7, title: 'Data Privacy & Regulation', one: 'Designing for GDPR and DPDP: data residency, right to be forgotten, masking and encryption everywhere.', examples: 'GDPR, DPDP Act, PCI-DSS', tags: ['erasure', 'crypto-shredding', 'residency'], status: 'planned' },
    { slug: 'threat-modeling', domain: 7, title: 'Threat Modeling', one: 'Finding how a design can be attacked before it is built, element by element, with STRIDE.', examples: 'STRIDE, OWASP, attack trees', tags: ['DFD', 'trust boundary', 'STRIDE'], added: true, status: 'planned' },
    { slug: 'secrets-kms', domain: 7, title: 'Secrets & Key Management', one: 'Keeping passwords and keys out of code, rotating them safely, and encrypting data with envelope keys.', examples: 'Vault, AWS KMS, HSM', tags: ['envelope encryption', 'rotation', 'dynamic secrets'], added: true, status: 'planned' },

    { slug: 'observability-pillars', domain: 8, title: 'Three Pillars of Observability', one: 'Metrics, logs and traces tied together with OpenTelemetry, so you can explain any slow request.', examples: 'OpenTelemetry, Dapper, Honeycomb', tags: ['tracing', 'structured logs', 'sampling'], status: 'planned' },
    { slug: 'slo-error-budgets', domain: 8, title: 'SRE: SLIs, SLOs & Error Budgets', one: 'Agreeing how reliable is reliable enough, and using the leftover error budget to decide when to ship.', examples: 'Google SRE book & workbook', tags: ['SLO', 'burn rate', 'error budget'] },
    { slug: 'disaster-recovery', domain: 8, title: 'Disaster Recovery: RTO & RPO', one: 'Surviving the loss of a whole region, and choosing how much downtime and data loss you can afford.', examples: 'AWS DR strategies, Patroni', tags: ['RTO/RPO', 'active-active', 'failover'], status: 'planned' },
    { slug: 'chaos-engineering', domain: 8, title: 'Chaos Engineering', one: 'Breaking things on purpose, in a controlled way, to prove the system survives real failures.', examples: 'Chaos Monkey, Gremlin, AWS FIS', tags: ['hypothesis', 'blast radius', 'game day'], status: 'planned' },
    { slug: 'incident-management', domain: 8, title: 'Incident Management & Postmortems', one: 'Running an outage calmly with clear roles, and learning from it without blame.', examples: 'PagerDuty, Google SRE', tags: ['incident commander', 'MTTR', 'blameless'], added: true, status: 'planned' },

    { slug: 'rfcs-adrs', domain: 9, title: 'Leading Without Authority: RFCs & ADRs', one: 'Getting a technical decision made and adopted through writing and influence, not rank.', examples: 'Nygard ADRs, Uber/Google RFCs', tags: ['ADR', 'RFC', 'consensus'], status: 'planned' },
    { slug: 'structured-upskilling', domain: 9, title: 'Structured Upskilling', one: 'Raising the whole team\'s skill floor with skills matrices, learning paths, runbooks and workshops.', examples: 'Skills matrix, katas, guilds', tags: ['curriculum', 'runbooks', 'pairing'], status: 'planned' },
    { slug: 'conways-law', domain: 9, title: "Conway's Law & Team Topologies", one: 'Your system ends up shaped like your org chart, so design the teams and the architecture together.', examples: 'Conway 1968, Team Topologies', tags: ['stream-aligned', 'platform team', 'inverse Conway'] },
    { slug: 'stakeholder-communication', domain: 9, title: 'Stakeholder Communication', one: 'Explaining technical trade-offs to executives in terms of money, risk and time, and getting a decision.', examples: 'Pyramid principle, one-pagers', tags: ['exec summary', 'framing', 'buy-in'], status: 'planned' },
    { slug: 'tech-debt', domain: 9, title: 'Technical Debt Management', one: 'Measuring tech debt, showing its interest, and negotiating real time to pay it down.', examples: 'Fowler quadrant, hotspots', tags: ['hotspots', 'debt register', 'cost of delay'], status: 'planned' },
    { slug: 'conflict-resolution', domain: 9, title: 'Conflict Resolution', one: 'Turning a heated "Kafka vs RabbitMQ" style argument between senior engineers into a decision everyone commits to.', examples: 'Thomas–Kilmann, DACI', tags: ['mediation', 'disagree & commit', 'spikes'], status: 'planned' },
    { slug: 'architecture-governance', domain: 9, title: 'Architecture Governance', one: 'Keeping many teams aligned with review forums, fitness functions, a tech radar and golden paths, without becoming a bottleneck.', examples: 'ArchUnit, Thoughtworks Radar', tags: ['fitness functions', 'tech radar', 'guardrails'], added: true, status: 'planned' }
  ],

  /* "Laws you must know" strip on the architecture index. `to` = topic slug that explains it. */
  laws: [
    { g: 'Distributed systems', items: [
      ['CAP theorem', 'During a network partition, a replicated store must give up either consistency or availability.', 'cap-pacelc'],
      ['PACELC', 'Else (no partition), you still trade latency against consistency.', 'cap-pacelc'],
      ['FLP impossibility', 'No deterministic consensus algorithm can guarantee termination in a fully asynchronous network if even one process may crash.', 'consensus-theory'],
      ['Two Generals', 'Over a lossy link, two parties can never be certain they agree. Hence idempotency and retries.', 'consensus-theory'],
      ['Byzantine Generals', 'Tolerating f lying nodes needs at least 3f + 1 nodes.', 'consensus-theory'],
      ['Quorum: R + W > N', 'Read and write quorums that overlap guarantee a read sees the latest acknowledged write.', 'consensus-theory'],
      ['Fallacies of distributed computing', 'The network is not reliable, latency is not zero, bandwidth is not infinite, topology changes…', 'consensus-theory'],
      ['End-to-end argument', 'Correctness checks belong at the endpoints; the network can only help performance.', 'consensus-theory']
    ] },
    { g: 'Performance & scale', items: [
      ["Amdahl's Law", 'Speed-up is capped by the serial fraction: 5% serial means at most 20× faster, however many cores.', 'scalability-laws'],
      ["Gustafson's Law", 'With more machines we usually grow the problem, so scaled speed-up keeps rising.', 'scalability-laws'],
      ['Universal Scalability Law', 'Contention and coherency (crosstalk) make throughput peak and then fall as you add nodes.', 'scalability-laws'],
      ["Little's Law", 'Items in system = arrival rate × time in system (L = λW). Sizes pools, queues and concurrency.', 'scalability-laws'],
      ['Queueing knee', 'Waiting time grows like ρ / (1 − ρ): past ~70–80% utilisation, latency explodes.', 'scalability-laws'],
      ['Tail at scale', 'Fan out to 100 servers and the slowest one (p99) sets your typical latency.', 'scalability-laws']
    ] },
    { g: 'Design', items: [
      ['SOLID', 'Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion.', 'design-principles'],
      ['High cohesion, low coupling', 'Things that change together live together; modules talk through narrow, stable interfaces.', 'design-principles'],
      ['Law of Demeter', 'Talk only to your immediate collaborators, not to their internals.', 'design-principles'],
      ['DRY, KISS, YAGNI', 'One source of truth; the simplest thing that works; do not build for imagined futures.', 'design-principles'],
      ["Postel's Law", 'Be conservative in what you send, liberal in what you accept, and know why it is now debated.', 'design-principles'],
      ["Gall's Law", 'A complex system that works evolved from a simple system that worked.', 'design-principles']
    ] },
    { g: 'People & organisations', items: [
      ["Conway's Law", 'Systems mirror the communication structure of the organisation that builds them.', 'conways-law'],
      ['Inverse Conway Manoeuvre', 'Shape the teams first to get the architecture you want.', 'conways-law'],
      ["Brooks's Law", 'Adding people to a late software project makes it later.', 'socio-technical-laws'],
      ["Hyrum's Law", 'With enough users, every observable behaviour of your API will be depended on.', 'socio-technical-laws'],
      ["Goodhart's Law", 'When a measure becomes a target, it stops being a good measure.', 'socio-technical-laws'],
      ["Lehman's Laws", 'A system in use must keep changing, and its complexity grows unless work is done to reduce it.', 'socio-technical-laws']
    ] },
    { g: 'Reliability & data', items: [
      ['The nines', '99.9% = 43.8 min/month of downtime; 99.99% = 4.4 min/month.', 'reliability-math'],
      ['Serial vs parallel availability', 'Dependencies in series multiply (A₁·A₂); redundant copies combine as 1 − (1 − A)².', 'reliability-math'],
      ['MTBF & MTTR', 'Availability ≈ MTBF / (MTBF + MTTR): recovering faster counts as much as failing less.', 'reliability-math'],
      ['Error budget', '1 − SLO is the unreliability you are allowed to spend on change.', 'slo-error-budgets'],
      ['ACID vs BASE', 'Strict transactions vs basically-available, soft-state, eventually-consistent systems.', 'consistency-models'],
      ['Exactly-once = at-least-once + idempotency', 'Delivery cannot be exactly once; processing effects can be, through dedup.', 'consensus-theory']
    ] }
  ]
};
