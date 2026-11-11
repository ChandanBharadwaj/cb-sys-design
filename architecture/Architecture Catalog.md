# Architecture Catalog & Reference Guide

The Architecture track of the Design Atlas: 49 topics in 9 pillars for software-architect interview prep and real architecture decisions. Each topic gets an animated page on the site (topics marked _planned_ are being written in batches).

Live site: https://chandanbharadwaj.github.io/cb-sys-design/architecture/

---

## 1. Laws, Theorems & Principles
_The theory interviewers expect you to quote, and apply correctly._

### CAP & PACELC ✅
* **What it is:** When the network splits you must pick consistency or availability; when it does not, you still trade latency for consistency.
* **Key references:** Brewer, Gilbert–Lynch, Abadi
* **Core ideas:** CP vs AP, partitions, latency
* **Subtopics:**
  * CAP (Brewer 2000, Gilbert–Lynch 2002 proof); what "partition" really means; CP vs AP choices; why "CA" is not a real option.
  * PACELC (Abadi 2012): latency vs consistency when there is no partition.
  * Product mapping: Spanner, Cassandra, DynamoDB, MongoDB, Postgres with replicas.
* **Interactive deep dive:** a 3-replica cluster. You cut the network, write to both sides, and watch CP refuse while AP diverges and later reconciles. A PACELC slider shows latency vs read freshness.
* **Page:** `docs/architecture/topics/cap-pacelc.html`

### Consistency Models & Isolation _(planned)_
* **What it is:** What a read is allowed to return: from linearizable to eventual, and which anomalies each isolation level lets through.
* **Key references:** Jepsen, Postgres SSI
* **Core ideas:** linearizable, causal, write skew
* **Subtopics:**
  * Linearizability, sequential, causal, read-your-writes, monotonic reads, eventual consistency.
  * Snapshot isolation vs serializable; transaction anomalies (dirty read, lost update, write skew, phantom).
  * Postgres isolation levels.
* **Interactive deep dive:** interleave two clients' operations and see which models allow each history.
* **Page:** `docs/architecture/topics/consistency-models.html`

### Consensus & Impossibility Results _(planned)_
* **What it is:** Why agreement over an unreliable network is hard, and how quorums, Raft and fencing make it practical.
* **Key references:** FLP, Two Generals, Raft
* **Core ideas:** quorum, byzantine, fallacies
* **Subtopics:**
  * Laws: FLP impossibility, Two Generals, Byzantine Generals (3f+1).
  * Quorums (R+W>N); Paxos and Raft intuition; leases and fencing tokens.
  * The Fallacies of Distributed Computing (Deutsch); "exactly-once" as idempotency plus dedup.
* **Interactive deep dive:** quorum overlap calculator plus a Raft leader election.
* **Page:** `docs/architecture/topics/consensus-theory.html`

### Scalability Laws _(planned)_
* **What it is:** How much faster more machines really make you, and how queues explode as utilisation climbs.
* **Key references:** Amdahl, Gunther's USL, Little
* **Core ideas:** speed-up, queueing, tail latency
* **Subtopics:**
  * Amdahl's Law, Gustafson's Law, the Universal Scalability Law (Gunther: contention plus coherency).
  * Little's Law (L = λW), queueing theory basics (M/M/1, the utilisation "knee" around 70–80%), tail-latency amplification under fan-out.
* **Interactive deep dive:** add nodes and see speed-up curves for Amdahl vs USL; a Little's Law sizing calculator.
* **Page:** `docs/architecture/topics/scalability-laws.html`

### Design Principles _(planned)_
* **What it is:** SOLID, coupling and cohesion: the rules that keep code and modules easy to change.
* **Key references:** SOLID, Demeter, Gall
* **Core ideas:** coupling, cohesion, YAGNI
* **Subtopics:**
  * SOLID, DRY vs WET/AHA, KISS, YAGNI, Law of Demeter, separation of concerns.
  * Cohesion and coupling (afferent/efferent, instability, Martin's abstractness vs instability "main sequence").
  * Postel's Law (and its critique), the Principle of Least Astonishment, Gall's Law ("a complex system that works evolved from a simple one").
* **Interactive deep dive:** a dependency graph where you move classes between modules and watch the coupling metrics.
* **Page:** `docs/architecture/topics/design-principles.html`

### Socio-technical Laws _(planned)_
* **What it is:** The laws about people and software: why adding engineers slows you down and every behaviour becomes a contract.
* **Key references:** Conway, Brooks, Hyrum, Goodhart
* **Core ideas:** teams, metrics, evolution
* **Subtopics:**
  * Conway's Law and the Inverse Conway Manoeuvre, Brooks's Law, Hyrum's Law, Goodhart's Law, Parkinson's Law.
  * Lehman's laws of software evolution, Kernighan's Law, Hofstadter's Law, the second-system effect, the Lindy effect for tech choices.
* **Interactive deep dive:** Brooks's Law: adding people to a late project, with communication paths n(n−1)/2 against ramp-up time.
* **Page:** `docs/architecture/topics/socio-technical-laws.html`

### Reliability Math _(planned)_
* **What it is:** Turning nines into minutes, and working out the availability of a chain of dependencies.
* **Key references:** Nines, MTBF/MTTR, cells
* **Core ideas:** availability, blast radius, shuffle sharding
* **Subtopics:**
  * Availability in nines (per year, month and day).
  * Serial vs parallel availability (A₁·A₂ vs 1−(1−A)²); MTBF, MTTR and MTTD.
  * Blast radius, cell-based architecture and shuffle sharding (Amazon).
  * Static stability; correlated failures.
* **Interactive deep dive:** build a dependency chain or redundancy block diagram and read off the composite availability.
* **Page:** `docs/architecture/topics/reliability-math.html`

---

## 2. Architecture Foundations
_Styles, quality attributes and how to write architecture down._

### Architectural Styles ✅
* **What it is:** Layered, hexagonal, modular monolith, microservices, serverless, event-driven: what each costs and when to pick it.
* **Key references:** Spring Modulith, Shopify, Prime Video
* **Core ideas:** hexagonal, modular monolith, microservices
* **Subtopics:**
  * Layered/n-tier, Hexagonal (ports & adapters), Clean/Onion, modular monolith, microservices, SOA, serverless/FaaS, event-driven, space-based, micro-kernel/plugin.
  * Choosing by quality attributes; the "distributed monolith" anti-pattern; Spring Modulith.
* **Interactive deep dive:** one feature change ripples through each style. It counts the modules touched, deploys needed, network hops and team handoffs.
* **Page:** `docs/architecture/topics/architectural-styles.html`

### Quality Attributes & ATAM _(planned)_
* **What it is:** Making "fast, secure, scalable" measurable and finding which decisions trade one against another.
* **Key references:** ISO 25010, SEI ATAM
* **Core ideas:** utility tree, scenarios, trade-off points
* **Subtopics:**
  * ISO 25010 attributes and quality-attribute scenarios (stimulus/response/measure).
  * Utility trees, sensitivity points vs trade-off points, ATAM steps, fitness criteria, architecturally significant requirements.
* **Interactive deep dive:** build a utility tree; rank scenarios by importance × difficulty.
* **Page:** `docs/architecture/topics/quality-attributes.html`

### Documenting Architecture _(planned)_
* **What it is:** Diagrams and docs people actually read: C4 levels, arc42 sections and diagrams as code.
* **Key references:** C4, arc42, Structurizr
* **Core ideas:** C4, diagrams as code, 4+1
* **Subtopics:**
  * The C4 model (context/container/component/code), arc42 sections, 4+1 views, diagrams as code (Structurizr, Mermaid, PlantUML).
  * Living documentation; keeping documents next to the code.
* **Interactive deep dive:** zoom through C4 levels of one system.
* **Page:** `docs/architecture/topics/documenting-architecture.html`

---

## 3. Business Strategy & Finance
_Build vs buy, cloud economics, risk and turning OKRs into NFRs._

### Build vs Buy vs Rent ✅
* **What it is:** Deciding whether to build it, buy a product, rent SaaS or adopt open source, based on what makes you different.
* **Key references:** Wardley maps, TCO, decision matrix
* **Core ideas:** core vs context, TCO, lock-in
* **Subtopics:**
  * Core vs context (Wardley mapping, evolution: genesis → commodity), differentiation test, weighted decision matrix.
  * Open-source adoption risk (licence changes such as BSL/SSPL, bus factor, CVE cadence); SaaS exit cost; integration cost; hidden build costs (on-call, upgrades).
* **Interactive deep dive:** 5-year TCO curves for build, buy and OSS with sliders, plus a weighted decision matrix with a break-even year.
* **Page:** `docs/architecture/topics/build-vs-buy.html`

### FinOps & Cloud Economics _(planned)_
* **What it is:** Knowing what each feature costs to run, and designing so the cloud bill grows slower than the business.
* **Key references:** FinOps Foundation, AWS CUR
* **Core ideas:** TCO, unit cost, spot/RI
* **Subtopics:**
  * TCO (capex vs opex, people cost), unit economics (cost per transaction or per tenant).
  * FinOps lifecycle (Inform/Optimize/Operate), tagging and showback/chargeback.
  * Reserved instances, savings plans, spot; rightsizing, autoscaling, storage tiering, egress traps; budget alerts and anomaly detection.
* **Interactive deep dive:** a workload cost model where you toggle spot, RI, tiering and caching and watch the monthly bill and unit cost.
* **Page:** `docs/architecture/topics/finops.html`

### Risk Management & Lock-in _(planned)_
* **What it is:** Listing what could go wrong (technical, operational, vendor) and choosing to avoid, reduce, transfer or accept each risk.
* **Key references:** Risk register, pre-mortem
* **Core ideas:** heat map, vendor lock-in, mitigation
* **Subtopics:**
  * Risk register; likelihood × impact matrix.
  * Technical, operational, security, vendor lock-in and key-person risks.
  * Mitigation types (avoid/transfer/mitigate/accept); lock-in mitigation (abstraction layers, open standards, data portability).
  * Pre-mortems, risk storming.
* **Interactive deep dive:** a risk heat-map where mitigations move risks between cells.
* **Page:** `docs/architecture/topics/risk-management.html`

### Translating OKRs to Tech _(planned)_
* **What it is:** Turning a business goal like "increase retention" into a measurable target like "p95 page load under 200 ms".
* **Key references:** Impact mapping, latency budgets
* **Core ideas:** OKR, NFR, traceability
* **Subtopics:**
  * OKRs, mapping objective → key result → capability → NFR → architecture tactic, impact mapping.
  * Example chains: retention → p95 latency < 200 ms → edge caching; revenue → availability 99.95% → multi-AZ.
  * Measuring outcome vs output.
* **Interactive deep dive:** pick an OKR and trace the chain; a latency budget split across tiers.
* **Page:** `docs/architecture/topics/okrs-to-nfrs.html`

---

## 4. Modern Architectural Paradigms
_DDD, evolution, data architecture, CDC, migrations and AI systems._

### Domain-Driven Design _(planned)_
* **What it is:** Finding the right service boundaries by modelling the business: bounded contexts, a shared language and aggregates.
* **Key references:** Evans, Event Storming
* **Core ideas:** bounded context, aggregate, ACL
* **Subtopics:**
  * Strategic design: subdomains (core/supporting/generic), bounded contexts, ubiquitous language, context mapping (partnership, customer–supplier, conformist, anti-corruption layer, open host, published language).
  * Tactical design: entities, value objects, aggregates and invariants, domain events, repositories.
  * Event Storming; finding microservice boundaries.
* **Interactive deep dive:** an Event Storming board where you cluster events into bounded contexts and see coupling scores.
* **Page:** `docs/architecture/topics/ddd.html`

### Evolutionary Architecture & Strangler Fig ✅
* **What it is:** Replacing a legacy monolith piece by piece behind a facade, with no big-bang rewrite and no downtime.
* **Key references:** Fowler, Shopify, fitness functions
* **Core ideas:** facade, shadow traffic, branch by abstraction
* **Subtopics:**
  * Fitness functions, incremental change, the strangler fig facade/proxy, branch by abstraction, parallel run / shadow traffic.
  * Anti-corruption layer, data migration and dual writes, when to stop strangling.
* **Interactive deep dive:** migrate route by route behind a facade, shift traffic, and track shadow-compare mismatches and rollback.
* **Page:** `docs/architecture/topics/strangler-fig.html`

### Data Architecture: Mesh, Lake, CQRS, ES _(planned)_
* **What it is:** Where analytical data lives and who owns it, and when to split reads from writes or store events instead of state.
* **Key references:** Data mesh, lakehouse, Axon
* **Core ideas:** data mesh, CQRS, event sourcing
* **Subtopics:**
  * Data warehouse vs lake vs lakehouse (Delta, Iceberg) vs data mesh (domain ownership, data as a product, self-serve platform, federated governance).
  * CQRS, Event Sourcing (snapshots, upcasting, projections), polyglot persistence.
* **Interactive deep dive:** an event-sourced account that replays events into different projections.
* **Page:** `docs/architecture/topics/data-architecture.html`

### Change Data Capture & Change Data Feed _(planned)_
* **What it is:** Streaming every database change to other systems in order, so caches, search and warehouses stay in sync.
* **Key references:** Debezium, Delta CDF, outbox
* **Core ideas:** WAL, Kafka Connect, outbox
* **Subtopics:**
  * Log-based vs query-based CDC, Debezium + Kafka Connect, Postgres logical replication (WAL, replication slots).
  * Databricks/Delta Change Data Feed, the transactional outbox.
  * Ordering and idempotent sinks, schema evolution (registry), backfills/snapshots; triggering batch vs streaming jobs.
* **Interactive deep dive:** rows change in Postgres, the WAL streams to Kafka, and you watch consumer lag and how replay works after a sink failure.
* **Page:** `docs/architecture/topics/cdc-pipelines.html`

### Zero-Downtime State Migrations _(planned)_
* **What it is:** Changing schemas and moving billions of rows in parallel waves while users keep working.
* **Key references:** Expand/contract, gh-ost, pg_repack
* **Core ideas:** backfill, waves, dual write
* **Subtopics:**
  * Expand/contract (parallel change), online schema change (gh-ost, pg_repack, `CREATE INDEX CONCURRENTLY`), backfill in batches.
  * Wave-based parallel migration with stored procedures and checkpoints, throttling on replica lag, dual-write/dual-read verification, cut-over and rollback.
  * Lock-timeouts in Postgres.
* **Interactive deep dive:** a wave scheduler migrating tenants in parallel while live traffic latency and lock waits are shown.
* **Page:** `docs/architecture/topics/zero-downtime-migrations.html`

### AI System Architecture _(planned)_
* **What it is:** Designing around non-deterministic models: RAG pipelines, embedding choices, evals, guardrails and MCP tool access.
* **Key references:** RAG, MCP, local embeddings
* **Core ideas:** RAG, agents, guardrails
* **Subtopics:**
  * Designing for non-determinism (evals, guardrails, fallbacks), RAG pipelines (chunking, hybrid search, re-ranking).
  * Embedding model choice: cloud API vs CPU-only local models (cost, latency, privacy).
  * Agent architectures and tool calling, MCP servers connecting to enterprise APIs (auth, scopes, least privilege, audit), prompt-injection defence, LLMOps and observability.
* **Interactive deep dive:** a RAG pipeline cost/latency/quality calculator plus an agent-tool permission boundary.
* **Page:** `docs/architecture/topics/ai-architecture.html`

### The 12-Factor App _(planned)_
* **What it is:** Twelve rules that make a service portable, disposable and easy to scale on any cloud.
* **Key references:** Heroku, Spring Boot, Kubernetes
* **Core ideas:** config, stateless, disposability
* **Subtopics:**
  * All 12 factors with Spring Boot examples, plus beyond-12 (API first, telemetry, security), and how they map to Kubernetes.
* **Interactive deep dive:** a checklist audit of a sample app; each violation lights up the failure it causes.
* **Page:** `docs/architecture/topics/twelve-factor.html`

---

## 5. Integration & APIs
_Events, sagas, API contracts and multi-tenant SaaS._

### Event-Driven Architecture & Sagas _(planned)_
* **What it is:** Keeping data consistent across services without distributed transactions: events, outbox and compensations.
* **Key references:** Temporal, Camunda, outbox
* **Core ideas:** choreography, orchestration, outbox
* **Subtopics:**
  * Events vs commands, notification vs event-carried state transfer, choreography vs orchestration.
  * Saga compensations, transactional outbox/inbox, idempotent consumers, ordering, dead-letter queues; Temporal and Camunda.
* **Interactive deep dive:** an order saga where you inject a failure at any step and watch compensations.
* **Page:** `docs/architecture/topics/event-driven-sagas.html`

### API Design & Governance _(planned)_
* **What it is:** Designing REST, gRPC and GraphQL APIs that evolve without breaking the teams that depend on them.
* **Key references:** OpenAPI, Pact, Google AIP
* **Core ideas:** versioning, contract tests, idempotency
* **Subtopics:**
  * REST maturity, gRPC, GraphQL (N+1, federation), async APIs.
  * Versioning strategies, backward compatibility, pagination, idempotency keys, consumer-driven contract testing (Pact, Spring Cloud Contract), API style guides and linting.
* **Interactive deep dive:** a schema-change checker that flags whether each change breaks consumers.
* **Page:** `docs/architecture/topics/api-design.html`

### Multi-tenancy Architecture _(planned)_
* **What it is:** Serving many customers from one platform while keeping their data, performance and costs isolated.
* **Key references:** AWS SaaS Lens, Postgres RLS
* **Core ideas:** silo/pool/bridge, RLS, noisy neighbour
* **Subtopics:**
  * Silo, pool and bridge models; tenant isolation (row-level security in Postgres, schema-per-tenant, DB-per-tenant).
  * Noisy neighbour, tenant-aware routing and throttling, per-tenant cost, onboarding automation.
* **Interactive deep dive:** pick an isolation model and watch cost, isolation and ops-load meters, plus a noisy-neighbour demo.
* **Page:** `docs/architecture/topics/multi-tenancy.html`

---

## 6. Infrastructure, DevOps & Delivery
_Containers, deployments, IaC, resilience and platforms._

### Advanced Container Patterns _(planned)_
* **What it is:** Sidecars, ambassadors and init containers, and when a sidecar beats a shared library or a separate service.
* **Key references:** Kubernetes, Dapr, Envoy
* **Core ideas:** sidecar, pod design, autoscaling
* **Subtopics:**
  * Kubernetes pod patterns: sidecar, ambassador, adapter, init containers.
  * Sidecar vs shared library vs separate service (for example an AI/ML inference sidecar next to a Spring app).
  * Resource requests/limits, HPA/VPA/KEDA, pod disruption budgets.
* **Interactive deep dive:** compare sidecar, library and remote service by latency, memory, upgrade blast radius and language coupling.
* **Page:** `docs/architecture/topics/container-patterns.html`

### Deployment Strategies & Feature Flags _(planned)_
* **What it is:** Shipping safely: blue-green, canary with automatic rollback, dark launches and flags at scale.
* **Key references:** Argo Rollouts, LaunchDarkly
* **Core ideas:** canary, blue-green, flags
* **Subtopics:**
  * Rolling, blue-green, canary (automated analysis with Argo Rollouts or Flagger), dark launch / shadow traffic, A/B.
  * Feature flags at scale (flag types, flag debt, kill switches); database changes during deploys; rollback vs roll-forward.
* **Interactive deep dive:** a canary that ramps traffic while you inject an error rate and watch automated rollback.
* **Page:** `docs/architecture/topics/deployment-strategies.html`

### Infrastructure as Code & Drift _(planned)_
* **What it is:** Describing every environment in code so it can be rebuilt identically, and catching manual drift.
* **Key references:** Terraform, Pulumi, OPA
* **Core ideas:** immutable, state, drift
* **Subtopics:**
  * Declarative vs imperative, Terraform state/locking/modules, Pulumi.
  * Immutable infrastructure, configuration drift (detection and reconciliation), policy as code (OPA, Sentinel), environments and promotion.
* **Interactive deep dive:** plan/apply with a drift event; compare reconcile vs ignore.
* **Page:** `docs/architecture/topics/infrastructure-as-code.html`

### Resiliency Patterns ✅
* **What it is:** Timeouts, retries with backoff and jitter, circuit breakers and bulkheads that stop one failure becoming an outage.
* **Key references:** Resilience4j, Hystrix, AWS Builders’ Library
* **Core ideas:** circuit breaker, jitter, bulkhead
* **Subtopics:**
  * Timeouts, retries with exponential backoff and jitter, retry budgets, circuit breaker (closed/open/half-open), bulkheads.
  * Distributed rate limiting, load shedding, fallbacks, idempotency, backpressure; Resilience4j.
* **Interactive deep dive:** a failing dependency with breaker states, a retry storm with and without jitter, and bulkhead thread pools.
* **Page:** `docs/architecture/topics/resiliency-patterns.html`

### Platform Engineering _(planned)_
* **What it is:** Building self-service golden paths so product teams ship without filing tickets or learning every tool.
* **Key references:** Backstage, Spotify, DORA
* **Core ideas:** IDP, golden path, cognitive load
* **Subtopics:**
  * Internal developer platforms, Backstage portals, golden paths and templates, self-service infrastructure.
  * Platform as a product, cognitive load, DORA metrics and SPACE.
* **Interactive deep dive:** a lead-time model comparing ticket-ops with a self-service platform.
* **Page:** `docs/architecture/topics/platform-engineering.html`

### Service Mesh _(planned)_
* **What it is:** Moving mTLS, retries and traffic shifting out of every service and into a shared network layer.
* **Key references:** Istio, Linkerd, ambient mesh
* **Core ideas:** data plane, mTLS, traffic split
* **Subtopics:**
  * Data plane vs control plane, Istio/Linkerd, sidecar vs ambient/eBPF.
  * Traffic shifting, mTLS, retries in the mesh vs in the app, cost.
* **Interactive deep dive:** request path with and without a mesh, showing latency overhead and policy enforcement.
* **Page:** `docs/architecture/topics/service-mesh.html`

### GitOps _(planned)_
* **What it is:** Making Git the single source of truth for what runs, with agents that keep the cluster matching it.
* **Key references:** Argo CD, Flux
* **Core ideas:** reconcile, pull deploy, promotion
* **Subtopics:**
  * Pull vs push deploys, Argo CD/Flux reconciliation loops, environment promotion, secrets in GitOps (Sealed Secrets, External Secrets).
* **Interactive deep dive:** a reconciler loop healing manual drift.
* **Page:** `docs/architecture/topics/gitops.html`

---

## 7. Security & Compliance
_Zero trust, identity, supply chain, privacy and keys._

### Zero Trust Architecture _(planned)_
* **What it is:** Never trusting the network: every service call is authenticated, authorised and encrypted, even inside the perimeter.
* **Key references:** NIST 800-207, BeyondCorp, SPIFFE
* **Core ideas:** mTLS, micro-segmentation, workload identity
* **Subtopics:**
  * NIST SP 800-207 principles, never trust/always verify, micro-segmentation, mTLS between services.
  * Workload identity (SPIFFE/SPIRE), policy decision and enforcement points, BeyondCorp, device posture.
* **Interactive deep dive:** perimeter vs zero trust when one service is compromised (lateral movement paths).
* **Page:** `docs/architecture/topics/zero-trust.html`

### Identity & Access: OAuth, OIDC, JWT ✅
* **What it is:** Who the user is, what the app may do on their behalf, and how every service checks it: OAuth 2.0, OIDC, JWT, RBAC vs ABAC.
* **Key references:** Keycloak, Okta, Spring Security, Zanzibar
* **Core ideas:** PKCE, JWT, RBAC/ABAC
* **Subtopics:**
  * OAuth 2.0 grant types (Authorization Code + PKCE, client credentials, device flow; why implicit and password grants are gone), OIDC ID tokens.
  * JWT structure, signing (RS256/ES256) and validation, token lifetimes and refresh, opaque vs JWT, revocation.
  * SAML vs OIDC; RBAC vs ABAC vs ReBAC (Zanzibar), OPA/Cedar; Spring Security resource server.
* **Interactive deep dive:** a step-through of the Auth Code + PKCE flow, a JWT decoder/validator, and an RBAC vs ABAC policy evaluator.
* **Page:** `docs/architecture/topics/iam-oauth-oidc.html`

### DevSecOps & Supply Chain Security _(planned)_
* **What it is:** Catching vulnerable or malicious code before it ships: scanning, SBOMs, signed builds and safe registries.
* **Key references:** SLSA, Sigstore, CycloneDX
* **Core ideas:** SAST/DAST, SBOM, dependency confusion
* **Subtopics:**
  * Shift-left, SAST/DAST/SCA/IAST, secrets scanning, container scanning.
  * SBOMs (SPDX, CycloneDX), SLSA levels, Sigstore/cosign signing, provenance.
  * Dependency confusion and typosquatting defences (scoped registries, pinning).
* **Interactive deep dive:** a pipeline with gates; inject a vulnerable or malicious dependency and see which gate catches it.
* **Page:** `docs/architecture/topics/devsecops.html`

### Data Privacy & Regulation _(planned)_
* **What it is:** Designing for GDPR and DPDP: data residency, right to be forgotten, masking and encryption everywhere.
* **Key references:** GDPR, DPDP Act, PCI-DSS
* **Core ideas:** erasure, crypto-shredding, residency
* **Subtopics:**
  * GDPR, CCPA, India DPDP Act 2023, HIPAA and PCI-DSS basics; data residency.
  * Right to be forgotten across services, backups and logs (crypto-shredding); data classification.
  * Masking and tokenisation; encryption at rest, in transit and in use (confidential computing); consent management.
* **Interactive deep dive:** an erasure request flowing through services, warehouse and backups, with crypto-shredding.
* **Page:** `docs/architecture/topics/data-privacy.html`

### Threat Modeling _(planned)_
* **What it is:** Finding how a design can be attacked before it is built, element by element, with STRIDE.
* **Key references:** STRIDE, OWASP, attack trees
* **Core ideas:** DFD, trust boundary, STRIDE
* **Subtopics:**
  * STRIDE per element, data-flow diagrams and trust boundaries, attack trees, DREAD/CVSS scoring, OWASP Top 10 and API Top 10.
* **Interactive deep dive:** click DFD elements to list STRIDE threats and mitigations.
* **Page:** `docs/architecture/topics/threat-modeling.html`

### Secrets & Key Management _(planned)_
* **What it is:** Keeping passwords and keys out of code, rotating them safely, and encrypting data with envelope keys.
* **Key references:** Vault, AWS KMS, HSM
* **Core ideas:** envelope encryption, rotation, dynamic secrets
* **Subtopics:**
  * Vault, cloud KMS, envelope encryption (DEK/KEK), key rotation, dynamic secrets, HSMs.
  * Secret sprawl; Kubernetes secrets pitfalls.
* **Interactive deep dive:** envelope encryption and rotation without re-encrypting data.
* **Page:** `docs/architecture/topics/secrets-kms.html`

---

## 8. Observability & Operations
_Telemetry, SLOs, disaster recovery, chaos and incidents._

### Three Pillars of Observability _(planned)_
* **What it is:** Metrics, logs and traces tied together with OpenTelemetry, so you can explain any slow request.
* **Key references:** OpenTelemetry, Dapper, Honeycomb
* **Core ideas:** tracing, structured logs, sampling
* **Subtopics:**
  * Metrics, logs and traces, plus profiles and events.
  * OpenTelemetry (SDK, collector, context propagation, W3C traceparent), structured logging and correlation IDs.
  * RED/USE/golden signals, cardinality, head vs tail sampling.
* **Interactive deep dive:** a request trace across services with sampling choices.
* **Page:** `docs/architecture/topics/observability-pillars.html`

### SRE: SLIs, SLOs & Error Budgets ✅
* **What it is:** Agreeing how reliable is reliable enough, and using the leftover error budget to decide when to ship.
* **Key references:** Google SRE book & workbook
* **Core ideas:** SLO, burn rate, error budget
* **Subtopics:**
  * Choosing SLIs, SLO targets and windows, error budgets and policies, multi-window multi-burn-rate alerts.
  * Toil budgets, SLAs vs SLOs, balancing features and reliability.
* **Interactive deep dive:** error-budget burn with multi-window burn-rate alerts, using the Google SRE workbook formula.
* **Page:** `docs/architecture/topics/slo-error-budgets.html`

### Disaster Recovery: RTO & RPO _(planned)_
* **What it is:** Surviving the loss of a whole region, and choosing how much downtime and data loss you can afford.
* **Key references:** AWS DR strategies, Patroni
* **Core ideas:** RTO/RPO, active-active, failover
* **Subtopics:**
  * RTO/RPO, the four strategies (backup/restore, pilot light, warm standby, multi-site active-active).
  * Sync vs async replication, multi-region Postgres, split-brain, DNS/global load-balancer failover, DR drills.
* **Interactive deep dive:** pick a strategy and fail a region; the RTO and RPO clocks run against cost.
* **Page:** `docs/architecture/topics/disaster-recovery.html`

### Chaos Engineering _(planned)_
* **What it is:** Breaking things on purpose, in a controlled way, to prove the system survives real failures.
* **Key references:** Chaos Monkey, Gremlin, AWS FIS
* **Core ideas:** hypothesis, blast radius, game day
* **Subtopics:**
  * Steady-state hypothesis, blast radius, game days, Chaos Monkey/Gremlin/LitmusChaos/AWS FIS.
  * Fault types (latency, kill, partition, resource exhaustion), running chaos safely in production.
* **Interactive deep dive:** run an experiment and check whether the hypothesis holds, with an auto-abort.
* **Page:** `docs/architecture/topics/chaos-engineering.html`

### Incident Management & Postmortems _(planned)_
* **What it is:** Running an outage calmly with clear roles, and learning from it without blame.
* **Key references:** PagerDuty, Google SRE
* **Core ideas:** incident commander, MTTR, blameless
* **Subtopics:**
  * Severity levels, incident commander roles, communication cadence, MTTA/MTTR, blameless postmortems, the 5 whys vs contributing factors, action-item tracking.
* **Interactive deep dive:** an incident timeline that shows where detection, response and recovery time goes.
* **Page:** `docs/architecture/topics/incident-management.html`

---

## 9. Leadership & Human Architecture
_Influence, teams, communication, debt and governance._

### Leading Without Authority: RFCs & ADRs _(planned)_
* **What it is:** Getting a technical decision made and adopted through writing and influence, not rank.
* **Key references:** Nygard ADRs, Uber/Google RFCs
* **Core ideas:** ADR, RFC, consensus
* **Subtopics:**
  * RFC structure and review process, ADRs (Nygard format, MADR), decision logs.
  * Building consensus (pre-wiring, disagree and commit), influence tactics, driving adoption of standards.
* **Interactive deep dive:** an RFC lifecycle with stakeholder sign-off states.
* **Page:** `docs/architecture/topics/rfcs-adrs.html`

### Structured Upskilling _(planned)_
* **What it is:** Raising the whole team's skill floor with skills matrices, learning paths, runbooks and workshops.
* **Key references:** Skills matrix, katas, guilds
* **Core ideas:** curriculum, runbooks, pairing
* **Subtopics:**
  * Skills matrix and gap analysis, learning paths, runbooks, workshops, katas, pairing/mob programming, guilds, measuring impact.
* **Interactive deep dive:** a team skills heat-map moved by training plans.
* **Page:** `docs/architecture/topics/structured-upskilling.html`

### Conway's Law & Team Topologies ✅
* **What it is:** Your system ends up shaped like your org chart, so design the teams and the architecture together.
* **Key references:** Conway 1968, Team Topologies
* **Core ideas:** stream-aligned, platform team, inverse Conway
* **Subtopics:**
  * Conway's Law, Inverse Conway Manoeuvre.
  * The four team types (stream-aligned, platform, enabling, complicated-subsystem) and three interaction modes (collaboration, X-as-a-service, facilitating); cognitive load; team APIs.
* **Interactive deep dive:** a team communication graph against the service dependency graph. A reorg shows the change in coupling and cross-team handoffs.
* **Page:** `docs/architecture/topics/conways-law.html`

### Stakeholder Communication _(planned)_
* **What it is:** Explaining technical trade-offs to executives in terms of money, risk and time, and getting a decision.
* **Key references:** Pyramid principle, one-pagers
* **Core ideas:** exec summary, framing, buy-in
* **Subtopics:**
  * Audience-tailored messaging, framing in business impact (cost, risk, revenue, time), one-pagers, the pyramid principle, trade-off slides, risk language, saying no.
* **Interactive deep dive:** rewrite a technical message for different audiences (exec, PM, engineer).
* **Page:** `docs/architecture/topics/stakeholder-communication.html`

### Technical Debt Management _(planned)_
* **What it is:** Measuring tech debt, showing its interest, and negotiating real time to pay it down.
* **Key references:** Fowler quadrant, hotspots
* **Core ideas:** hotspots, debt register, cost of delay
* **Subtopics:**
  * Fowler's tech debt quadrant, measuring debt (hotspots = churn × complexity, SQALE, DORA impact), the interest analogy.
  * Debt registers, the 20% rule vs debt sprints, negotiating with product.
* **Interactive deep dive:** a hotspot map showing the cost of delay as interest compounds.
* **Page:** `docs/architecture/topics/tech-debt.html`

### Conflict Resolution _(planned)_
* **What it is:** Turning a heated "Kafka vs RabbitMQ" style argument between senior engineers into a decision everyone commits to.
* **Key references:** Thomas–Kilmann, DACI
* **Core ideas:** mediation, disagree & commit, spikes
* **Subtopics:**
  * Thomas–Kilmann modes, separating people from problems, decision frameworks (DACI/RAPID), spikes and prototypes to settle disputes, escalation paths.
* **Interactive deep dive:** a decision-matrix walkthrough of a "Kafka vs RabbitMQ" style dispute.
* **Page:** `docs/architecture/topics/conflict-resolution.html`

### Architecture Governance _(planned)_
* **What it is:** Keeping many teams aligned with review forums, fitness functions, a tech radar and golden paths, without becoming a bottleneck.
* **Key references:** ArchUnit, Thoughtworks Radar
* **Core ideas:** fitness functions, tech radar, guardrails
* **Subtopics:**
  * Architecture review boards vs advisory forums, fitness functions in CI (ArchUnit), Tech Radar (adopt/trial/assess/hold), golden paths, guardrails vs gates, standards lifecycle.
* **Interactive deep dive:** ArchUnit-style rule checks failing on a bad dependency.
* **Page:** `docs/architecture/topics/architecture-governance.html`

---

## Laws you must know

### Distributed systems
* **CAP theorem** — During a network partition, a replicated store must give up either consistency or availability.
* **PACELC** — Else (no partition), you still trade latency against consistency.
* **FLP impossibility** — No deterministic consensus algorithm can guarantee termination in a fully asynchronous network if even one process may crash.
* **Two Generals** — Over a lossy link, two parties can never be certain they agree. Hence idempotency and retries.
* **Byzantine Generals** — Tolerating f lying nodes needs at least 3f + 1 nodes.
* **Quorum: R + W > N** — Read and write quorums that overlap guarantee a read sees the latest acknowledged write.
* **Fallacies of distributed computing** — The network is not reliable, latency is not zero, bandwidth is not infinite, topology changes…
* **End-to-end argument** — Correctness checks belong at the endpoints; the network can only help performance.

### Performance & scale
* **Amdahl's Law** — Speed-up is capped by the serial fraction: 5% serial means at most 20× faster, however many cores.
* **Gustafson's Law** — With more machines we usually grow the problem, so scaled speed-up keeps rising.
* **Universal Scalability Law** — Contention and coherency (crosstalk) make throughput peak and then fall as you add nodes.
* **Little's Law** — Items in system = arrival rate × time in system (L = λW). Sizes pools, queues and concurrency.
* **Queueing knee** — Waiting time grows like ρ / (1 − ρ): past ~70–80% utilisation, latency explodes.
* **Tail at scale** — Fan out to 100 servers and the slowest one (p99) sets your typical latency.

### Design
* **SOLID** — Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion.
* **High cohesion, low coupling** — Things that change together live together; modules talk through narrow, stable interfaces.
* **Law of Demeter** — Talk only to your immediate collaborators, not to their internals.
* **DRY, KISS, YAGNI** — One source of truth; the simplest thing that works; do not build for imagined futures.
* **Postel's Law** — Be conservative in what you send, liberal in what you accept, and know why it is now debated.
* **Gall's Law** — A complex system that works evolved from a simple system that worked.

### People & organisations
* **Conway's Law** — Systems mirror the communication structure of the organisation that builds them.
* **Inverse Conway Manoeuvre** — Shape the teams first to get the architecture you want.
* **Brooks's Law** — Adding people to a late software project makes it later.
* **Hyrum's Law** — With enough users, every observable behaviour of your API will be depended on.
* **Goodhart's Law** — When a measure becomes a target, it stops being a good measure.
* **Lehman's Laws** — A system in use must keep changing, and its complexity grows unless work is done to reduce it.

### Reliability & data
* **The nines** — 99.9% = 43.8 min/month of downtime; 99.99% = 4.4 min/month.
* **Serial vs parallel availability** — Dependencies in series multiply (A₁·A₂); redundant copies combine as 1 − (1 − A)².
* **MTBF & MTTR** — Availability ≈ MTBF / (MTBF + MTTR): recovering faster counts as much as failing less.
* **Error budget** — 1 − SLO is the unreliability you are allowed to spend on change.
* **ACID vs BASE** — Strict transactions vs basically-available, soft-state, eventually-consistent systems.
* **Exactly-once = at-least-once + idempotency** — Delivery cannot be exactly once; processing effects can be, through dedup.
