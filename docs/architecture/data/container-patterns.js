SD.register({
  slug: 'container-patterns',
  domain: 6,
  title: 'Advanced Container Patterns',
  examples: 'Kubernetes, Dapr, Envoy',
  tagline: 'Sidecar, ambassador, adapter, init container, leader election, work queue, scatter/gather. A Pod is a <b>small group of containers that share a network and a lifecycle</b>; the art is deciding what goes in the same Pod, what goes in a library, and what becomes its own service.',
  tldr: {
    problem: 'Every service needs the same plumbing (TLS, retries, log shipping, metrics, config, ML inference in another language). Copying it into every codebase as a library ties it to one language and one release train. Putting it in a separate service adds a network hop and another thing to scale.',
    idea: 'Package each concern as its <b>own container</b> and compose them. Containers in one <b>Pod</b> share <code>localhost</code>, volumes and a lifecycle, so a <b>sidecar</b> can extend the app, an <b>ambassador</b> can proxy its outbound calls, an <b>adapter</b> can normalise its output and an <b>init container</b> can prepare the ground. Pick sidecar vs library vs separate service by <b>latency, scaling coupling, language and upgrade blast radius</b>.',
    insight: 'A sidecar is <b>scaled, scheduled and restarted with the app</b>. That is the whole trade: free co-location and a sub-millisecond loopback hop in exchange for paying the sidecar\'s CPU and memory on every replica. When the helper scales differently from the app (a GPU model, a heavy cache) it should usually be its own service.',
    numbers: [
      { v: '2016', l: 'Burns & Oppenheimer publish the container design patterns paper (HotCloud)' },
      { v: 'v1.33', l: 'Kubernetes native sidecars (init containers with restartPolicy: Always) reach stable (2025)' },
      { v: '~0.1–1 ms', l: 'added per loopback hop to a sidecar (rule of thumb; measure your own)' }
    ]
  },

  intro: {
    what: 'A <b>container pattern</b> is a reusable way to combine several small containers into one working unit. In Kubernetes that unit is a <b>Pod</b>: containers that are always placed on the same machine, share one network address and can share files. Instead of building every feature into the application, you add helper containers next to it, each doing one job.',
    analogy: {
      icon: '🏍️',
      title: 'A motorbike with a sidecar',
      text: 'The <b>sidecar</b> is bolted to the bike: it goes wherever the bike goes, at the same speed, and it carries something the bike cannot (a passenger, luggage). You can swap the sidecar without rebuilding the engine. But every bike in the fleet now carries the extra weight, and if you need ten times more luggage capacity than riders you are buying ten times more bikes. The analogy breaks in one place: a software sidecar can run in a completely different language from the app, which a real sidecar has no equivalent for.'
    },
    problem: 'A Java checkout service needs a fraud score from a Python model, TLS to a payment provider, and logs in the company format. Writing all of it in Java means porting the model and re-implementing TLS rotation in every service. Calling a separate fraud service adds a network hop and a dependency to page on. <b>Where should each helper run: inside the process, next to it in the Pod, or as its own service?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Everything inside the app',
        text: 'The team embeds the model through a Java binding, writes its own TLS and retry code, and formats logs by hand. One container, one deploy. It works until the model team wants to ship a new Python version, or a second service in Go needs the same features.',
        scene: {
          nodes: [
            { id: 'u', label: 'Client', sub: 'checkout call', kind: 'client', at: [70, 0] },
            { id: 'app', label: 'App container', sub: 'Java + model + TLS', kind: 'service', at: [210, 110] },
            { id: 'ext', label: 'Payments API', sub: 'external', kind: 'external', at: [350, 220] }
          ],
          edges: [{ from: 'u', to: 'app' }, { from: 'app', to: 'ext' }],
          flow: ['u>app', 'app>ext']
        }
      },
      {
        stage: 'breaks',
        title: 'One language, one release train',
        text: 'The model needs Python libraries with no Java port. A TLS bug fix means rebuilding and redeploying 40 services in 3 languages. A memory leak in the model code crashes the whole app, because they share one process.',
        scene: {
          nodes: [
            { id: 'u', label: 'Client', sub: 'checkout call', kind: 'client', at: [70, 0] },
            { id: 'app', label: 'App container', sub: 'OOM: model leak', kind: 'service', at: [210, 110] },
            { id: 'ext', label: 'Payments API', sub: 'external', kind: 'external', at: [350, 220] },
            { id: 'go', label: 'Go service', sub: 'needs same libs', kind: 'service', at: [70, 220] }
          ],
          edges: [{ from: 'u', to: 'app' }, { from: 'app', to: 'ext' }],
          flow: ['u>app'],
          err: ['app'], warn: ['go'],
          badges: { app: ['OOMKilled', 'err'], go: ['re-implement?', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Compose small containers in one Pod',
        text: 'The model runs in a <b>Python sidecar</b> on <code>localhost</code>, outbound TLS goes through an <b>ambassador</b> proxy, and an <b>init container</b> runs migrations first. Each piece has its own image, memory limit and owner, and any language can reuse it.',
        scene: {
          nodes: [
            { id: 'u', label: 'Client', sub: 'checkout call', kind: 'client', at: [70, 0] },
            { id: 'app', label: 'App container', sub: 'Java only', kind: 'service', at: [210, 110] },
            { id: 'ml', label: 'Model sidecar', sub: 'Python, :8000', kind: 'ml', at: [70, 220] },
            { id: 'amb', label: 'Ambassador', sub: 'TLS + retries', kind: 'edge', at: [350, 110] },
            { id: 'ext', label: 'Payments API', sub: 'external', kind: 'external', at: [350, 220] }
          ],
          edges: [{ from: 'u', to: 'app' }, { from: 'app', to: 'ml' }, { from: 'app', to: 'amb' }, { from: 'amb', to: 'ext' }],
          flow: ['u>app', ['app>ml', 'app>amb'], 'amb>ext'],
          ok: ['app', 'ml', 'amb'],
          badges: { ml: ['localhost', 'ok'] }
        }
      }
    ],
    usedBy: ['Kubernetes (Pods, init and sidecar containers)', 'Istio and Linkerd (proxy sidecars)', 'Envoy (Lyft)', 'Dapr (sidecar runtime)', 'Fluent Bit / OpenTelemetry Collector (adapter and agent)', 'KEDA (event-driven autoscaling)'],
    whenToUse: [
      'A cross-cutting concern (TLS, telemetry, log shipping, config reload) must work the <b>same way across many languages</b>',
      'A helper must share the app\'s <b>local network or files</b> and live and die with it, such as a model sidecar or a log adapter',
      'Something must happen <b>before</b> the app starts: migrations, fetching secrets, warming a cache (init container)'
    ],
    whenNot: [
      'The helper needs very different resources or scale (GPUs, large caches): run it as a <b>separate service</b> and scale it on its own',
      'Every service is in one language and latency is critical: a <b>shared library</b> is cheaper and faster',
      'You want mTLS and retries everywhere with less per-Pod cost: look at a node-level or ambient <a href="service-mesh.html">Service Mesh</a> instead of one proxy per Pod'
    ],
    glossary: [
      { term: 'Pod', def: 'The smallest Kubernetes unit: one or more containers scheduled together on one node, sharing a network namespace (one IP, one localhost) and volumes.' },
      { term: 'Sidecar', def: 'A helper container in the same Pod that extends or enhances the main container, such as a log shipper, proxy or model server.' },
      { term: 'Ambassador', def: 'A sidecar that proxies the app\'s outbound connections, so the app talks to localhost and the ambassador handles discovery, TLS, retries or sharding.' },
      { term: 'Adapter', def: 'A sidecar that translates the app\'s output (logs, metrics) into a standard format other systems expect.' },
      { term: 'Init container', def: 'A container that runs to completion before the app containers start; init containers run one at a time in order.' },
      { term: 'Native sidecar', def: 'An init container with <code>restartPolicy: Always</code>: it starts before the app, keeps running, and is stopped after the app.' },
      { term: 'QoS class', def: 'Guaranteed, Burstable or BestEffort, derived from requests and limits; decides who is evicted first under node memory pressure.' },
      { term: 'HPA / VPA / KEDA', def: 'Horizontal Pod Autoscaler (more replicas), Vertical Pod Autoscaler (bigger requests), and KEDA, which drives scaling from event sources such as queue lag.' }
    ]
  },

  requirements: {
    functional: [
      '<b>One concern per container</b>: each container has one job, one image, one owner and its own resource limits',
      '<b>Co-locate only what must share fate</b>: localhost, a volume, or the same lifecycle. Everything else is a separate Deployment',
      '<b>Explicit startup order</b>: init containers for "run once before", native sidecars for "run alongside, start first, stop last"',
      '<b>Every container has requests, limits and probes</b>: a sidecar without a memory limit can get the whole Pod killed',
      '<b>Scale on the right signal</b>: CPU for the app, queue lag or concurrency for workers (KEDA), and never HPA and VPA on the same CPU metric',
      '<b>Spread for failure</b>: PodDisruptionBudgets, topology spread and anti-affinity so one node or zone loss does not take all replicas'
    ],
    nonFunctional: [
      '<b>Latency</b>: sidecar hop adds &lt; 1 ms p99 on loopback (target; measure with your payloads)',
      '<b>Overhead</b>: sidecars use &lt; 15–20 % of Pod CPU and memory requests (rule of thumb), or move them out',
      '<b>Startup</b>: Pod Ready in under the HPA reaction window (e.g. &lt; 60 s), including model load',
      '<b>Availability</b>: at least N−1 replicas during voluntary disruptions (PDB <code>minAvailable</code>)',
      '<b>Isolation</b>: a crashing helper restarts on its own without killing the app (separate container, own limit)',
      '<b>Upgrade blast radius</b>: a helper change rolls out once through its own pipeline, not 40 app rebuilds'
    ],
    outOfScope: [
      '<b>Fat sidecar</b>: a 2 GiB model sidecar on every replica of an app that only needs 5 % of requests scored',
      '<b>Startup race</b>: app starts before its proxy or model is ready and fails its first requests',
      '<b>Sidecar sprawl</b>: five helpers per Pod, nobody owns their versions or resource limits',
      '<b>Tight CPU limits on latency-sensitive containers</b>: CFS throttling inflates p99 even at low average CPU',
      '<b>Distributed monolith in a Pod</b>: two business services co-located because they call each other a lot'
    ]
  },

  calculator: {
    inputs: [
      { id: 'pods', label: 'Replicas (Pods)', min: 1, max: 500, value: 40, log: true },
      { id: 'acpu', label: 'App CPU request per Pod', min: 50, max: 4000, step: 50, value: 500, unit: 'm' },
      { id: 'amem', label: 'App memory request per Pod', min: 64, max: 8192, step: 64, value: 768, unit: 'MiB' },
      { id: 'scpu', label: 'Sidecar CPU request (sum of sidecars)', min: 0, max: 4000, step: 50, value: 1000, unit: 'm' },
      { id: 'smem', label: 'Sidecar memory request (sum)', min: 0, max: 8192, step: 64, value: 2048, unit: 'MiB' },
      { id: 'node', label: 'Node size (vCPU, 4 GiB per vCPU)', min: 2, max: 64, step: 2, value: 8, unit: 'vCPU' }
    ],
    outputs: [
      { label: 'Sidecar share of Pod CPU requests', fmt: 'pct', f: (v) => (v.scpu / (v.acpu + v.scpu)) * 100 },
      { label: 'Sidecar share of Pod memory requests', fmt: 'pct', f: (v) => (v.smem / (v.amem + v.smem)) * 100 },
      { label: 'Nodes needed without sidecars', f: (v) => { const c = v.node * 1000 * 0.9, m = v.node * 4096 * 0.85; return Math.ceil(Math.max(v.pods * v.acpu / c, v.pods * v.amem / m)); } },
      { label: 'Nodes needed with sidecars', f: (v) => { const c = v.node * 1000 * 0.9, m = v.node * 4096 * 0.85; return Math.ceil(Math.max(v.pods * (v.acpu + v.scpu) / c, v.pods * (v.amem + v.smem) / m)); } },
      { label: 'Extra cost per month (estimate, $0.04 per vCPU-hour)', f: (v) => { const c = v.node * 1000 * 0.9, m = v.node * 4096 * 0.85; const a = Math.ceil(Math.max(v.pods * v.acpu / c, v.pods * v.amem / m)); const b = Math.ceil(Math.max(v.pods * (v.acpu + v.scpu) / c, v.pods * (v.amem + v.smem) / m)); return '$' + Math.round((b - a) * v.node * 0.04 * 730).toLocaleString('en-US'); } },
      { label: 'Latency added per sidecar hop (estimate)', f: (v) => v.scpu === 0 ? '0 ms (no sidecar)' : '≈ 0.1–1 ms loopback · 1–5 ms if remote' }
    ],
    note: 'Nodes are bin-packed on <b>requests</b>, not usage: the scheduler reserves what you ask for. Allocatable is assumed to be <em>90 % of CPU and 85 % of memory</em> (kubelet, system reserve and eviction threshold; an <em>estimate</em>, check <code>kubectl describe node</code>). Price is an <em>illustrative</em> on-demand rate. Hop latency is a <em>rule of thumb</em> for HTTP/gRPC over loopback or a Unix domain socket versus a cross-node call through a Service; serialisation of large payloads can dominate it. Try 1000m / 2048 MiB sidecar on a 500m app: the "small helper" is two thirds of the bill.'
  },

  api: [
    { m: 'YAML', p: 'Deployment with native sidecar', d: 'Pod spec: <code>initContainers</code> for migrations, a sidecar as an init container with <code>restartPolicy: Always</code> and a <code>startupProbe</code>, then the app. Requests, limits and probes on every container.' },
    { m: 'YAML', p: 'PodDisruptionBudget + topology spread', d: '<code>minAvailable</code> or <code>maxUnavailable</code> for drains and upgrades; topology spread constraints on the zone label with <code>maxSkew: 1</code>.' },
    { m: 'YAML', p: 'HPA / KEDA ScaledObject', d: 'Scaling target and signal: CPU utilisation for the app, or queue lag / requests in flight for workers through KEDA, with min/max replicas and a stabilisation window.' },
    { m: 'ADR', p: 'ADR: library vs sidecar vs service for inference', d: 'Latency budget, request share that needs the model, model memory, GPU need, language, team ownership, upgrade cadence. Decision and the triggers that would move it (e.g. "scoring traffic diverges from app traffic by 3×").' },
    { m: 'RPC', p: 'localhost:8000 /v1/score (sidecar contract)', d: 'Versioned request/response schema, timeout budget the caller enforces, health endpoints (<code>/healthz</code>, <code>/ready</code> once the model is loaded), and the port or Unix socket path.' },
    { m: 'POLICY', p: 'Resource and sidecar policy', d: 'Admission rules (Kyverno / OPA Gatekeeper): every container must set memory requests and limits, approved sidecar images only, no privileged sidecars, max sidecars per Pod.' }
  ],

  dataModel: [
    { name: 'pod_spec_container', store: 'Kubernetes API (etcd)', fields: [['name', 'string', 'pk'], ['kind', 'enum (init|sidecar|app)'], ['restartPolicy', 'Always | (unset)'], ['requests', '{cpu, memory}'], ['limits', '{cpu?, memory}'], ['startupProbe', 'probe?']], note: 'Order inside <code>initContainers</code> is the start order. Containers with <code>restartPolicy: Always</code> are sidecars; the others must exit 0 before the next one runs.' },
    { name: 'pod_qos', store: 'derived by kubelet', fields: [['pod', 'string', 'pk'], ['qosClass', 'Guaranteed|Burstable|BestEffort', 'idx'], ['oom_score_adj', 'int'], ['effective_request', 'sum or max rule']], note: 'Guaranteed only if <b>every</b> container (sidecars included) sets limits equal to requests for CPU and memory. One sidecar without limits makes the whole Pod Burstable.' },
    { name: 'scaled_object', store: 'KEDA CRD', fields: [['name', 'string', 'pk'], ['scaleTargetRef', 'Deployment'], ['triggers', '[{type, metadata}]'], ['minReplicaCount', 'int (0 allowed)'], ['maxReplicaCount', 'int'], ['cooldownPeriod', 'seconds']], note: 'KEDA creates and drives an HPA under the hood and adds scale-to-zero, using an external metric such as Kafka consumer lag.' },
    { name: 'container_metrics', store: 'Prometheus (cAdvisor)', fields: [['container', 'label', 'pk'], ['cpu_cfs_throttled_periods_total', 'counter'], ['memory_working_set_bytes', 'gauge'], ['restarts_total', 'counter'], ['last_terminated_reason', 'OOMKilled | Error']], note: 'Throttled periods divided by total periods shows CPU-limit pain; <code>OOMKilled</code> names which container hit its memory limit.' }
  ],

  architecture: {
    title: 'One Pod, many helpers: app, sidecars, init container and autoscaler',
    nodes: [
      { id: 'client', label: 'Client', sub: 'checkout request', kind: 'client', wide: [90, 90], tall: [70, 0], tip: 'Calls the checkout API through the ingress.' },
      { id: 'ing', label: 'Ingress / LB', sub: 'Service → Pod IP', kind: 'edge', wide: [280, 90], tall: [210, 0], tip: 'Routes to a ready Pod. A Pod receives traffic only when its readiness probe passes.' },
      { id: 'app', label: 'Spring Boot app', sub: 'main container', kind: 'service', wide: [470, 90], tall: [210, 105], tip: 'The business logic. Talks to its helpers on localhost because all containers in a Pod share one network namespace.' },
      { id: 'amb', label: 'Ambassador', sub: 'Envoy, outbound', kind: 'edge', wide: [660, 90], tall: [70, 105], tip: 'Ambassador pattern: the app calls localhost; the proxy does discovery, mTLS, retries and timeouts to the outside.' },
      { id: 'ext', label: 'Payments API', sub: 'external', kind: 'external', wide: [850, 90], tall: [70, 210], tip: 'A third-party dependency reached only through the ambassador.' },
      { id: 'init', label: 'Init: migrate', sub: 'runs once, exits 0', kind: 'compute', wide: [90, 210], tall: [350, 0], tip: 'Init container: runs to completion before any app container starts. Here: Flyway schema migration.' },
      { id: 'hpa', label: 'HPA / KEDA', sub: 'replicas from signal', kind: 'policy', wide: [280, 210], tall: [350, 315], tip: 'Scales the Deployment. Every replica carries all its sidecars, so sidecars scale with the app.' },
      { id: 'ml', label: 'Inference sidecar', sub: 'Python, :8000', kind: 'ml', wide: [470, 210], tall: [210, 210], tip: 'Sidecar pattern: a FastAPI model server next to the app, called over loopback HTTP/gRPC or a Unix socket.' },
      { id: 'log', label: 'Log adapter', sub: 'Fluent Bit', kind: 'service', wide: [660, 210], tall: [70, 315], tip: 'Adapter pattern: reads the app log files from a shared volume and ships them in the standard format.' },
      { id: 'obs', label: 'Logs / metrics', sub: 'central backend', kind: 'store', wide: [850, 210], tall: [70, 420], tip: 'The shared observability backend the adapter writes to.' },
      { id: 'q', label: 'Kafka topic', sub: 'scoring backlog', kind: 'queue', wide: [90, 330], tall: [350, 210], tip: 'A work queue. KEDA reads its consumer lag to scale workers, including to zero.' },
      { id: 'db', label: 'Postgres', sub: 'orders schema', kind: 'store', wide: [280, 330], tall: [350, 105], tip: 'The app database; the init container migrates it before the app starts.' },
      { id: 'remote', label: 'Model service', sub: 'separate Deployment', kind: 'ml', wide: [660, 330], tall: [210, 315], tip: 'The alternative to a sidecar: the model as its own service with its own replicas, GPUs and autoscaler.' }
    ],
    edges: [
      { from: 'client', to: 'ing', bidi: true },
      { from: 'ing', to: 'app' },
      { from: 'app', to: 'amb', label: 'localhost' },
      { from: 'amb', to: 'ext', label: 'mTLS' },
      { from: 'app', to: 'ml', label: 'loopback' },
      { from: 'app', to: 'log', dashed: true },
      { from: 'log', to: 'obs' },
      { from: 'init', to: 'db' },
      { from: 'app', to: 'db' },
      { from: 'app', to: 'remote', bend: 0.25, dashed: true },
      { from: 'q', to: 'hpa', dashed: true },
      { from: 'hpa', to: 'app', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'start', title: 'Pod startup with native sidecars', tone: 'ok',
      steps: [
        { text: 'The scheduler places the Pod on a node with enough <b>requested</b> CPU and memory for all containers. Init containers run first, <b>one at a time</b>: Flyway migrates the schema and exits 0.', flow: ['init>db'], ok: ['init'], badges: { init: ['exit 0', 'ok'] } },
        { text: 'Next come <b>native sidecars</b>: init containers with <code>restartPolicy: Always</code>. The kubelet starts each one and waits for its <b>startupProbe</b> before starting the next.', nodes: ['amb', 'log'], ok: ['amb', 'log'], badges: { amb: ['started', 'ok'], log: ['started', 'ok'] } },
        { text: 'The inference sidecar loads a 1.5 GB model (~20 s). Its startup probe passes only when the model is in memory, so the app <b>cannot start early</b> and hit a closed port.', nodes: ['ml'], warn: ['ml'], badges: { ml: ['loading model', 'warn'] } },
        { text: 'Only now does the Spring Boot container start. When its readiness probe passes, the Service adds the Pod and traffic flows.', flow: ['client>ing', 'ing>app', ['app>ml', 'app>amb']], ok: ['app', 'ml'], badges: { app: ['Ready', 'ok'] }, tone: 'ok' },
        { text: 'On shutdown the order reverses: the app gets SIGTERM first and drains; sidecars are stopped <b>after</b> it, so the log adapter flushes the last lines and the proxy serves the final outbound calls.', nodes: ['app', 'log', 'amb'], badges: { log: ['flushed', 'ok'] } }
      ]
    },
    {
      id: 'path', title: 'Request path: sidecar vs separate service', tone: 'info',
      steps: [
        { text: 'A checkout request arrives. The app needs a fraud score from the Python model.', flow: ['client>ing', 'ing>app'] },
        { text: '<b>Sidecar</b>: the call goes to <code>localhost:8000</code>. No DNS, no load balancer, no cross-node network: typically <b>well under a millisecond</b> of transport on top of inference (estimate).', flow: ['app>ml'], badges: { ml: ['+0.3 ms hop', 'ok'] } },
        { text: '<b>Separate service</b>: the call goes through a Service to another node. Transport is a few ms and can fail on its own, so it needs a timeout, retries and a breaker.', flow: ['app>remote'], badges: { remote: ['+2–5 ms hop', 'warn'] }, hidden: [] },
        { text: '<b>Library</b>: no hop at all, but the model must run in the JVM (e.g. ONNX Runtime for Java), its memory sits in the app heap and process, and a model upgrade is an app release.', nodes: ['app'], labels: { app: { label: 'App + model lib', sub: 'one process' } }, badges: { app: ['0 hops', 'info'] } },
        { text: 'Outbound payment calls go through the <b>ambassador</b>. The app speaks plain HTTP to localhost; Envoy adds mTLS, retries with budgets and timeouts.', flow: ['app>amb', 'amb>ext'], ok: ['amb'] }
      ]
    },
    {
      id: 'oom', title: 'Sidecar OOMKilled and CPU throttled', tone: 'err',
      steps: [
        { text: 'A new model version is 30 % larger. The sidecar\'s memory <b>limit</b> was not raised. Working set crosses the limit and the kernel OOM killer stops that container: <code>OOMKilled</code>, exit 137.', nodes: ['ml'], err: ['ml'], badges: { ml: ['OOMKilled', 'err'] }, tone: 'err' },
        { text: 'The kubelet restarts only the sidecar (with back-off). Meanwhile every scoring call fails fast on a refused connection; the app must time out and fall back.', flow: ['app>ml'], err: ['ml'], warn: ['app'], badges: { app: ['fallback score', 'warn'] }, tone: 'err' },
        { text: 'The app container also has a CPU <b>limit</b> of 500m. During GC bursts it uses its 50 ms of quota early in each 100 ms CFS period and is <b>throttled</b> for the rest: p99 jumps although average CPU is 30 %.', nodes: ['app'], err: ['app'], badges: { app: ['throttled 40 %', 'err'] }, tone: 'err' },
        { text: 'Fix: raise the sidecar memory request = limit with headroom and alert on working set; remove or loosen CPU limits on latency-critical containers and size requests from real usage (VPA recommendations).', nodes: ['ml', 'app'], ok: ['ml', 'app'], badges: { ml: ['limit 3Gi', 'ok'], app: ['no CPU limit', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'scale', title: 'Load spike: coupled scaling and KEDA', tone: 'warn',
      steps: [
        { text: 'Traffic triples. The HPA targets 70 % CPU and adds replicas. Each new Pod brings <b>all</b> its sidecars, including the 2 GiB model server.', flow: ['hpa>app'], warn: ['hpa'], badges: { hpa: ['10 → 30 Pods', 'warn'] }, tone: 'warn' },
        { text: 'Only 10 % of requests need a score, yet 30 model copies now sit in memory. Nodes fill on <b>memory requests</b> and the cluster autoscaler adds nodes.', nodes: ['ml'], warn: ['ml'], badges: { ml: ['30 × 2 GiB', 'warn'] } },
        { text: 'Better: move scoring to a <b>separate model service</b> with its own replicas, or make it async: the app writes to a Kafka topic and <b>KEDA</b> scales scoring workers on consumer lag, down to zero at night.', flow: ['app>remote', 'q>hpa'], ok: ['remote', 'q'], badges: { remote: ['4 replicas', 'ok'], q: ['lag-driven', 'ok'] }, tone: 'ok' },
        { text: 'A <b>PodDisruptionBudget</b> and zone <b>topology spread</b> keep enough replicas up when nodes are drained for the upgrade that follows.', nodes: ['app', 'remote'], ok: ['app'], badges: { app: ['PDB minAvailable 80 %', 'ok'] } }
      ]
    },
    {
      id: 'race', title: 'Old-style sidecar: the startup race', tone: 'err',
      steps: [
        { text: 'Before native sidecars, the proxy was just another entry in <code>containers</code>. All regular containers start <b>together</b>, in no guaranteed ready order.', nodes: ['app', 'amb', 'ml'], labels: { amb: { label: 'Ambassador', sub: 'regular container' } } },
        { text: 'The JVM is up in 8 s; the model needs 20 s. The app passes readiness (it never checked the sidecar) and serves requests whose scores all fail.', flow: ['ing>app', 'app>ml'], err: ['ml'], warn: ['app'], badges: { ml: ['connection refused', 'err'] }, tone: 'err' },
        { text: 'For a Job, the proxy never exits, so the Job never completes. On shutdown, the proxy may die before the app finishes its last outbound call.', nodes: ['amb'], err: ['amb'], badges: { amb: ['blocks Job exit', 'err'] }, tone: 'err' },
        { text: 'Native sidecars fix all three: start first and gate on a startup probe, do not block Pod completion, and stop after the main containers.', nodes: ['amb', 'ml', 'app'], ok: ['amb', 'ml', 'app'], labels: { amb: { label: 'Ambassador', sub: 'restartPolicy: Always' } }, badges: { app: ['clean start/stop', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose where the Python fraud model runs for a Spring Boot checkout service, whether the helper is in the app\'s language, and how its load relates to the app\'s. Numbers are <em>illustrative</em>; the direction of each change is the point.',
    controls: [
      { id: 'mode', label: 'Integration', type: 'seg', value: 'sidecar', options: [
        { v: 'lib', l: 'Shared library' }, { v: 'sidecar', l: 'Sidecar' }, { v: 'remote', l: 'Separate service' }, { v: 'ds', l: 'DaemonSet agent' }] },
      { id: 'lang', label: 'Helper language vs app', type: 'seg', value: 'diff', options: [
        { v: 'same', l: 'Same (Java)' }, { v: 'diff', l: 'Different (Python)' }] },
      { id: 'scale', label: 'Scaling profile', type: 'seg', value: 'coupled', options: [
        { v: 'coupled', l: 'Every request needs it' }, { v: 'divergent', l: 'Few requests / GPU' }] },
      { id: 'rep', label: 'App replicas', type: 'range', min: 2, max: 200, step: 1, value: 30 }
    ],
    evaluate(s) {
      const R = s.rep, clamp = (x) => Math.max(0.05, Math.min(1, x));
      const diff = s.lang === 'diff', div = s.scale === 'divergent';
      const nodes = Math.ceil(R / 6);
      const copies = { lib: R, sidecar: R, remote: div ? Math.max(2, Math.ceil(R / 8)) : Math.max(2, Math.ceil(R / 2)), ds: nodes }[s.mode];
      const memPer = s.mode === 'lib' ? (diff ? 2.0 : 1.5) : 2.0;
      const mem = copies * memPer;
      const latMs = { lib: diff ? 0.05 : 0.01, sidecar: 0.3, ds: 0.5, remote: 3 }[s.mode];
      const metrics = [
        { k: 'Latency added', v: s.mode === 'lib' ? (diff ? 'in-process via binding / FFI' : 'in-process call') : '≈ ' + latMs + ' ms per call' + (s.mode === 'remote' ? ' + new failure point' : ''), s: clamp(1 - latMs / 4) },
        { k: 'Memory overhead', v: copies + ' model copies ≈ ' + mem.toFixed(0) + ' GiB', s: clamp(1 - mem / (R * 2.2)) },
        { k: 'Independent scaling', v: s.mode === 'remote' ? 'own replicas + autoscaler' : s.mode === 'ds' ? 'one per node, scales with nodes' : 'scales with every app Pod', s: s.mode === 'remote' ? 0.95 : s.mode === 'ds' ? 0.5 : (div ? 0.15 : 0.6) },
        { k: 'Upgrade blast radius', v: s.mode === 'lib' ? 'rebuild + redeploy the app' : s.mode === 'sidecar' ? 'rolls every app Pod' : s.mode === 'ds' ? 'node by node, all tenants on it' : 'one service rollout', s: { lib: 0.2, sidecar: 0.5, ds: 0.45, remote: 0.9 }[s.mode] },
        { k: 'Polyglot freedom', v: s.mode === 'lib' ? (diff ? 'needs a port or native binding' : 'only Java callers') : 'any language over HTTP/gRPC', s: s.mode === 'lib' ? (diff ? 0.1 : 0.4) : 0.95 },
        { k: 'Ops complexity', v: { lib: 'one container', sidecar: 'probes + limits per container', ds: 'node agent, host access, multi-tenant', remote: 'service, SLO, breaker, autoscaler' }[s.mode], s: { lib: 0.9, sidecar: 0.65, ds: 0.45, remote: 0.4 }[s.mode] }
      ];
      const notes = [];
      if (s.mode === 'lib' && diff) notes.push('A Python model in a JVM means ONNX export, a JNI/FFI binding, or a subprocess. All three tie model releases to app releases.');
      if (s.mode === 'sidecar' && div) notes.push('Only a few requests need the model, but every one of ' + R + ' replicas pays for a copy. That is the classic case for a <b>separate service</b>.');
      if (s.mode === 'sidecar' && !div) notes.push('Model load and app traffic move together, so coupled scaling is fine. Use a native sidecar with a startup probe so the app never starts before the model is loaded.');
      if (s.mode === 'remote') notes.push('Add a timeout below the latency budget, a circuit breaker and a fallback score. Scale it on concurrency or GPU utilisation, not app CPU.');
      if (s.mode === 'ds') notes.push('One agent per node fits <b>node-level</b> concerns (log collection, metrics, CNI, ambient mesh ztunnel). For per-request model calls it mixes tenants and the per-node load is uneven.');
      if (s.mode === 'lib' && !diff) notes.push('Same language and every request needs it: a library is the cheapest option. Keep it behind an interface so you can move it out later.');
      let verdict;
      if (s.mode === 'lib') verdict = diff ? '⚠ <b>Library across languages</b> buys zero hops but costs a port or binding and couples releases.' : (div ? '👍 <b>Library is cheap</b>, but every replica pays the model memory for few calls.' : '✅ <b>Library</b>: same language, every request needs it, lowest latency and ops.');
      else if (s.mode === 'sidecar') verdict = div ? '⚠ <b>Fat sidecar.</b> ' + R + ' model copies for a minority of requests. Move it to its own service.' : '✅ <b>Sidecar fits</b>: different language, shares fate with each request, sub-millisecond hop.';
      else if (s.mode === 'remote') verdict = div ? '✅ <b>Separate service fits</b>: scale and upgrade the model on its own; pay a few ms and a breaker.' : '👍 <b>Works</b>, but every request now crosses the network. Consider a sidecar if latency is tight.';
      else verdict = '⚠ <b>DaemonSet agent</b> is right for node-level plumbing, rarely for per-request business logic.';
      return {
        metrics, verdict, notes,
        labels: {
          ml: s.mode === 'lib' ? { label: 'Model in app', sub: diff ? 'binding / FFI' : 'Java library' } : s.mode === 'ds' ? { label: 'Node agent', sub: 'DaemonSet, 1 per node' } : { label: 'Inference sidecar', sub: diff ? 'Python, :8000' : 'Java, :8000' },
          app: s.mode === 'lib' ? { label: 'App + model', sub: 'one process' } : { label: 'Spring Boot app', sub: 'main container' }
        },
        hide: s.mode === 'remote' ? ['ml'] : ['remote'],
        ok: s.mode === 'remote' && div ? ['remote'] : [],
        warn: s.mode === 'sidecar' && div ? ['ml'] : [],
        err: [],
        badges: s.mode === 'remote' ? { remote: [copies + ' replicas', 'info'] } : { ml: [copies + ' copies', div && s.mode !== 'ds' ? 'warn' : 'info'] },
        flow: s.mode === 'remote' ? ['client>ing', 'ing>app', 'app>remote'] : ['client>ing', 'ing>app', 'app>ml']
      };
    }
  },

  widget: {
    title: 'Pod builder: startup order, packing and where the model runs',
    caption: 'Add containers to the Pod and watch the <b>startup timeline</b> follow Kubernetes rules (init containers in sequence, native sidecars gated on their startup probe, then the app). Switch the model between <b>library</b>, <b>sidecar</b> and <b>separate service</b>, drag the load, and see replicas, model copies, nodes and request latency change.'
  },

  realWorld: {
    intro: 'The patterns were named in 2016 by the people who built Borg and Kubernetes; the platform took until 2025 to make sidecars first-class. Meanwhile the industry moved some sidecars back out of the Pod (ambient mesh) when their per-Pod cost stopped paying.',
    timeline: [
      { when: 'Jun 2016', who: 'Brendan Burns & David Oppenheimer (Google)', title: '"Design patterns for container-based distributed systems"', text: 'HotCloud \'16 paper. Containers are to distributed systems what objects were to OO software. Three groups: <b>single-container</b> management patterns, <b>single-node</b> patterns of co-operating containers (sidecar, ambassador, adapter), and <b>multi-node</b> patterns (leader election, work queue, scatter/gather).', src: 0 },
      { when: 'Jun 2016', who: 'Kubernetes blog', title: 'Container Design Patterns', text: 'Burns summarises the paper and points out that the <b>Pod</b> abstraction is what makes the single-node and multi-node patterns possible: a group of containers scheduled together sharing network and volumes.', src: 1 },
      { when: 'Sep 2016', who: 'Lyft', title: 'Envoy released as open source', text: 'A C++ L7 proxy built to run next to every service, any language, during Lyft\'s move from a monolith to services. It became the sidecar data plane for Istio and many other meshes.', src: 2 },
      { when: 'Aug 2023', who: 'CNCF', title: 'KEDA graduates', text: 'Kubernetes Event-Driven Autoscaling becomes a CNCF graduated project: scale Deployments and Jobs on queue lag and other event sources, including <b>to zero</b>, by feeding the HPA external metrics.', src: 3 },
      { when: 'Nov 2024', who: 'Istio', title: 'Ambient mode GA in 1.24', text: 'A service mesh <b>without per-Pod sidecars</b>: a per-node ztunnel for L4/mTLS and optional waypoint proxies for L7. Sidecar mode stays supported. The trade: less per-Pod overhead and no app restarts for proxy upgrades.', src: 4 },
      { when: 'Nov 2024', who: 'CNCF', title: 'Dapr graduates', text: 'Dapr, a <b>sidecar runtime</b> that gives any language building blocks (state, pub/sub, service invocation, workflows) over HTTP/gRPC on localhost, becomes a CNCF graduated project.', src: 5 },
      { when: 'Apr 2025', who: 'Kubernetes (SIG Node)', title: 'Native sidecar containers stable in v1.33', text: 'KEP-753: sidecars are <b>init containers with <code>restartPolicy: Always</code></b>. They start before the app, keep running, do not block Pod completion and are stopped after the main containers. First available in 1.28 (alpha); stable in 1.33.', src: 6 },
      { when: 'Sep 2025', who: 'Kubernetes', title: 'Pod-level resources beta in v1.34', text: 'Requests and limits can be set for the <b>Pod as a whole</b>, so containers (sidecars included) share one budget instead of each needing a tight limit.', src: 7 }
    ],
    lessons: [
      '<b>The Pod is the unit of co-scheduling and co-scaling.</b> Put containers together only when they must share fate.',
      'Sidecars were a convention for years; the startup and shutdown races were real until <b>native sidecars</b> fixed them in the platform.',
      'Per-Pod helpers multiply cost by replica count. Meshes moved to <b>per-node</b> designs (ambient) once that bill got large.',
      'Scale on the <b>right signal</b>: CPU for request handlers, queue lag for workers (KEDA), and keep big helpers on their own scaling curve.'
    ],
    sources: [
      { title: 'Design patterns for container-based distributed systems (HotCloud \'16)', url: 'https://www.usenix.org/conference/hotcloud16/workshop-program/presentation/burns', pub: 'Burns & Oppenheimer, USENIX, 2016' },
      { title: 'Container Design Patterns', url: 'https://kubernetes.io/blog/2016/06/container-design-patterns/', pub: 'Kubernetes blog, 2016' },
      { title: 'Envoy Project Journey Report', url: 'https://www.cncf.io/reports/envoy-project-journey-report/', pub: 'CNCF, 2020' },
      { title: 'CNCF announces graduation of Kubernetes autoscaler KEDA', url: 'https://www.cncf.io/announcements/2023/08/22/cloud-native-computing-foundation-announces-graduation-of-kubernetes-autoscaler-keda/', pub: 'CNCF, 2023' },
      { title: 'Istio\'s Ambient Mode Reaches General Availability in v1.24', url: 'https://istio.io/blog/2024/ambient-reaches-ga/', pub: 'Istio, 2024' },
      { title: 'CNCF announces Dapr graduation', url: 'https://cncf.io/announcements/2024/11/12/cloud-native-computing-foundation-announces-dapr-graduation', pub: 'CNCF, 2024' },
      { title: 'Kubernetes v1.33: Octarine (release blog)', url: 'https://kubernetes.io/blog/2025/04/23/kubernetes-v1-33-release/', pub: 'Kubernetes, 2025' },
      { title: 'Kubernetes v1.34: Pod Level Resources Graduated to Beta', url: 'https://kubernetes.io/blog/2025/09/22/kubernetes-v1-34-pod-level-resources/', pub: 'Kubernetes, 2025' },
      { title: 'Sidecar Containers (docs)', url: 'https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/', pub: 'Kubernetes documentation' },
      { title: 'KEP-753: Sidecar Containers', url: 'https://www.k8s.dev/resources/keps/753/', pub: 'Kubernetes SIG Node' }
    ]
  },

  tradeoffs: {
    headers: ['Option', 'Latency', 'Scaling', 'Language', 'Upgrade', 'Best for'],
    rows: [
      ['<b>Shared library</b>', 'In-process, none added', 'Coupled to app', 'Same language (or binding)', 'Rebuild every consumer', 'Small, hot, same-language logic'],
      ['<b>Sidecar</b>', '~0.1–1 ms loopback (estimate)', 'Coupled: one per replica', 'Any', 'Rolls every Pod', 'Per-request helpers that share fate: proxy, model, adapter'],
      ['<b>Separate service</b>', '~1–5 ms + failure modes (estimate)', 'Independent', 'Any', 'One rollout', 'Heavy, GPU, or rarely used capabilities'],
      ['<b>DaemonSet agent</b>', 'Node-local hop', 'One per node', 'Any', 'Node by node', 'Node-level plumbing: logs, metrics, CNI, ztunnel'],
      ['<b>Init container</b>', 'Startup time only', 'n/a, runs once per Pod start', 'Any', 'With the Pod', 'Migrations, secrets fetch, config render, warm-up']
    ]
  },

  failures: [
    { f: 'Startup race (legacy sidecar)', detect: 'Errors spike in the first seconds after each rollout; connection refused to localhost', fix: 'Native sidecar (init container with restartPolicy: Always) plus startupProbe; or app readiness that checks the dependency' },
    { f: 'Sidecar OOMKilled', detect: 'last terminated reason <code>OOMKilled</code> on one container; restart count rising', fix: 'Size memory from working set + headroom, request = limit for memory, alert at 80 % of limit' },
    { f: 'CPU throttling at low utilisation', detect: 'throttled periods / total CFS periods &gt; ~5 %; p99 up while average CPU is low', fix: 'Remove CPU limits on latency-critical containers (keep requests), or raise them; tune thread pools to the CPU request' },
    { f: 'Fat sidecar multiplied by replicas', detect: 'Sidecar requests are a large share of Pod requests; nodes full on memory, not CPU', fix: 'Move the helper to its own Deployment or a DaemonSet; consider ambient-style per-node designs' },
    { f: 'HPA and VPA fighting', detect: 'Replica count and requests oscillate; VPA evictions during scale-out', fix: 'Do not use both on CPU/memory for the same workload; VPA in recommend-only mode, or HPA on a custom metric' },
    { f: 'All replicas on one node or zone', detect: 'A node drain or zone outage drops the service to zero ready Pods', fix: 'topologySpreadConstraints across zones, pod anti-affinity across nodes, a PDB with minAvailable' },
    { f: 'Init container blocks forever', detect: 'Pods stuck in <code>Init:0/1</code> or <code>Init:CrashLoopBackOff</code>', fix: 'Make init steps idempotent with timeouts; run long migrations as a separate Job, not in every Pod start' }
  ],

  interview: [
    { q: 'What are the sidecar, ambassador and adapter patterns?', a: '<p>All three are <b>single-node patterns</b> from Burns and Oppenheimer (HotCloud 2016): co-operating containers in one Pod sharing network and volumes.</p><ul><li><b>Sidecar</b>: extends or enhances the main container (log shipper, config reloader, model server).</li><li><b>Ambassador</b>: proxies the app\'s <b>outbound</b> connections; the app talks to localhost and the ambassador does discovery, sharding, TLS, retries.</li><li><b>Adapter</b>: presents a <b>standard interface outward</b>, such as converting app-specific metrics or logs into a common format.</li></ul><p>Common misreading: "sidecar" is used loosely for all three. In an interview, name the direction: ambassador = outbound, adapter = what others read from you.</p>', lvl: 'core' },
    { q: 'What are the multi-node patterns in the paper?', a: '<ul><li><b>Leader election</b>: replicas compete for a lease (e.g. a Kubernetes Lease object); only the leader does the singleton work. Can be packaged as a sidecar so any language gets it.</li><li><b>Work queue</b>: a generic queue plus a user-supplied container that processes one item; the framework handles distribution and retries.</li><li><b>Scatter/gather</b>: a root fans a request out to many leaves (shards) and merges the results, as in search.</li></ul><p>The point of the paper is that containers make these <b>reusable, language-neutral building blocks</b>, like objects did for OO.</p>', lvl: 'core' },
    { q: 'What is a native sidecar in Kubernetes and what problem does it solve?', a: '<p>Since KEP-753 (alpha 1.28, on by default from 1.29, stable in <b>v1.33</b>, 2025), a sidecar is an <b>init container with <code>restartPolicy: Always</code></b>.</p><ul><li>It starts in init order, and the next container waits until it has <b>started</b> (startup probe passed), so the app never races its proxy.</li><li>It keeps running and is restarted if it exits.</li><li>It does <b>not block Pod completion</b>, so Jobs with a mesh proxy finish.</li><li>It is <b>stopped after</b> the main containers on termination, so logs flush and outbound calls drain.</li></ul><p>Before this, teams used hacks: <code>postStart</code> hooks that wait, shell wrappers, or the proxy\'s "quit" endpoint at the end of a Job.</p>', lvl: 'core' },
    { q: 'Spring Boot app needs a Python ML model. Library, sidecar or separate service?', a: '<p>Decide on five questions:</p><ul><li><b>Language</b>: Python-only model → a library means ONNX export or a native binding. Sidecar or service keep it in Python.</li><li><b>Latency budget</b>: sidecar adds roughly sub-millisecond loopback transport (measure); a remote service adds a few ms and a new failure mode.</li><li><b>Scaling coupling</b>: if every request needs a score, coupled scaling is fine. If 5 % do, or it needs a GPU, a sidecar wastes a model copy per replica: use a separate service.</li><li><b>Memory</b>: model size × replicas for library/sidecar vs × model replicas for a service.</li><li><b>Upgrade blast radius and ownership</b>: a sidecar change rolls every app Pod; a service rolls once and can be owned by the ML team.</li></ul><p>My default: sidecar for small CPU models on the hot path, separate service for big or GPU models, library only if it is the same language and tiny.</p>', fu: 'How would you call the sidecar safely from Java?', lvl: 'deep' },
    { q: 'How do requests and limits translate into QoS classes, and why does it matter for sidecars?', a: '<ul><li><b>Guaranteed</b>: every container in the Pod has CPU and memory limits equal to requests.</li><li><b>Burstable</b>: at least one container has a request or limit, but not Guaranteed.</li><li><b>BestEffort</b>: no container sets any.</li></ul><p>Under node memory pressure the kubelet evicts BestEffort first, then Burstable Pods using more than their requests. A single sidecar with no limits makes the whole Pod Burstable. Memory limits are enforced by the OOM killer per container (<code>OOMKilled</code>, exit 137); CPU limits are enforced by throttling, never by killing.</p>', lvl: 'core' },
    { q: 'Why do some teams remove CPU limits?', a: '<p>CPU limits use the CFS quota: per 100 ms period a container may use <code>limit × 100 ms</code> of CPU time. A multi-threaded JVM can burn its quota in the first few ms of a period (GC, JIT, request burst) and is then <b>throttled</b> until the next period, adding tens of ms to p99 even at low average usage.</p><p>Many teams keep <b>CPU requests</b> (they drive scheduling and fair share under contention) and drop CPU limits on latency-sensitive services, while <b>keeping memory limits</b>. Watch the cAdvisor throttled-periods counter. Trade-off: without limits a noisy neighbour can use idle CPU, but requests still guarantee each container its share.</p>', lvl: 'deep' },
    { q: 'HPA vs VPA vs KEDA: when do you use each?', a: '<ul><li><b>HPA</b>: changes replica count from CPU, memory or custom/external metrics. Good for stateless request handlers.</li><li><b>VPA</b>: recommends or sets requests/limits per container. Good for right-sizing, and for workloads that cannot scale out. Do not run it in auto mode on the same CPU/memory metric as an HPA.</li><li><b>KEDA</b> (CNCF graduated 2023): event-driven scaling from queue lag, stream offsets, cron and many others, including <b>scale to zero</b>; it feeds an HPA underneath.</li></ul><p>Remember the HPA scales the <b>whole Pod</b>: sidecars come along. Pod startup time (model load) sets how fast scale-out can react.</p>', lvl: 'core' },
    { q: 'How do you keep a service available during node drains and zone failures?', a: '<ul><li><b>PodDisruptionBudget</b> (<code>minAvailable</code> or <code>maxUnavailable</code>) limits <b>voluntary</b> disruptions such as drains and cluster upgrades. It does nothing for node crashes.</li><li><b>topologySpreadConstraints</b> over the zone and hostname labels with <code>maxSkew: 1</code> spread replicas evenly.</li><li><b>Pod anti-affinity</b> (preferred) keeps replicas off the same node; required anti-affinity can make Pods unschedulable at scale.</li></ul><p>Pitfall: a PDB with <code>minAvailable</code> equal to replicas blocks every drain.</p>', lvl: 'core' },
    { q: 'What is Dapr, and when would you choose it over a library?', a: '<p>Dapr is a <b>sidecar runtime</b> (CNCF graduated 2024): the app calls <code>localhost</code> over HTTP or gRPC for building blocks such as state, pub/sub, service invocation, secrets, bindings and workflows; components (Redis, Kafka, a cloud store) are configured in YAML.</p><p>Choose it for <b>polyglot</b> estates that want the same patterns in every language, and to swap infrastructure without code changes. Cost: an extra process per Pod, one more hop, and a lowest-common-denominator API. A Java-only shop with Spring Cloud Stream and Resilience4j may not need it.</p>', lvl: 'deep' },
    { q: 'Startup ordering pitfalls: what goes wrong and how do you fix them?', a: '<ul><li><b>App before proxy/model</b>: first requests fail. Fix with native sidecars + startupProbe.</li><li><b>Migrations in every Pod</b>: an init container running Flyway in 30 replicas at once relies on a DB lock and slows every rollout. Fix: run migrations as a one-off Job (or Helm hook / Argo sync wave) and keep init containers fast and idempotent.</li><li><b>Readiness that lies</b>: readiness passes before caches or models are warm. Use a startupProbe for slow starts and readiness for "can serve now".</li><li><b>Shutdown order</b>: proxy killed before app drains. Native sidecars stop after the main containers; add a <code>preStop</code> sleep so endpoints update before SIGTERM handling.</li></ul>', lvl: 'deep' },
    { q: 'Sidecar mesh vs ambient / node-level mesh?', a: '<p>A per-Pod proxy costs CPU and memory times replica count, needs a Pod restart to upgrade, and adds two proxy hops per call. Istio ambient (GA in 1.24, 2024) moves L4 mTLS into a per-node ztunnel and L7 into optional waypoint proxies. Trade: lower overhead and independent upgrades vs a shared multi-tenant node component and a newer operating model. Many shops keep sidecars where they need per-workload L7 policy.</p>', lvl: 'deep' },
    { q: 'Tell me about a time you moved a component in or out of a Pod.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a checkout service ran a 2 GiB fraud-model sidecar on all 40 replicas; nodes were full on memory and only ~10 % of calls needed a score.<br><b>Task</b>: cut cost without hurting the 150 ms p99 budget.<br><b>Action</b>: measured sidecar share of requests (≈ 70 % of Pod memory), wrote an ADR comparing sidecar vs service, moved the model to its own Deployment with 6 replicas and KEDA on in-flight requests, and added a 40 ms timeout, breaker and fallback score in the app.<br><b>Result</b>: memory requests down by more than half, ~30 % fewer nodes, p99 rose ~3 ms and stayed within budget, and the ML team now ships models without an app release.', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Deployment: init migration, native inference sidecar, resources and probes', lang: 'yaml',
      code: `apiVersion: apps/v1
kind: Deployment
metadata: { name: checkout }
spec:
  replicas: 6
  selector: { matchLabels: { app: checkout } }
  template:
    metadata: { labels: { app: checkout } }
    spec:
      initContainers:
        - name: migrate                      # runs once, must exit 0
          image: registry.example.com/checkout-migrate:1.8.0
          resources: { requests: { cpu: 100m, memory: 128Mi }, limits: { memory: 128Mi } }
        - name: fraud-model                  # native sidecar (K8s >= 1.29, stable 1.33)
          image: registry.example.com/fraud-model:3.2.0
          restartPolicy: Always
          ports: [{ containerPort: 8000 }]
          resources: { requests: { cpu: "1", memory: 2Gi }, limits: { memory: 2Gi } }
          startupProbe:                      # app starts only after the model is loaded
            httpGet: { path: /ready, port: 8000 }
            periodSeconds: 2
            failureThreshold: 30
      containers:
        - name: app
          image: registry.example.com/checkout:4.11.0
          env: [{ name: FRAUD_URL, value: "http://localhost:8000" }]
          resources: { requests: { cpu: 500m, memory: 768Mi }, limits: { memory: 768Mi } }
          readinessProbe: { httpGet: { path: /actuator/health/readiness, port: 8080 } }
          livenessProbe:  { httpGet: { path: /actuator/health/liveness,  port: 8080 } }
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector: { matchLabels: { app: checkout } }`,
      note: 'No CPU limits on purpose (requests still drive scheduling); memory request = limit per container. The Pod is <b>Burstable</b>; it would be Guaranteed only if every container set CPU and memory limits equal to requests. Add a <code>PodDisruptionBudget</code> with <code>minAvailable: 5</code> for drains.'
    },
    {
      title: 'Spring Boot 3: RestClient to the localhost sidecar with timeouts and fallback', lang: 'java',
      code: `@Configuration
class FraudClientConfig {
  @Bean
  RestClient fraudRestClient(@Value("\${FRAUD_URL}") String baseUrl) {
    var settings = ClientHttpRequestFactorySettings.defaults()   // org.springframework.boot.http.client, Boot 3.4+
        .withConnectTimeout(Duration.ofMillis(50))
        .withReadTimeout(Duration.ofMillis(80));                  // below the p99 budget
    return RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(ClientHttpRequestFactoryBuilder.detect().build(settings))
        .build();
  }
}

record ScoreRequest(String orderId, BigDecimal amount, String country) {}
record ScoreResponse(double score, String modelVersion) {}

@Service
class FraudScorer {
  private static final Logger log = LoggerFactory.getLogger(FraudScorer.class);
  private final RestClient client;
  FraudScorer(RestClient fraudRestClient) { this.client = fraudRestClient; }

  double score(ScoreRequest req) {
    try {
      ScoreResponse r = client.post().uri("/v1/score")
          .contentType(MediaType.APPLICATION_JSON)
          .body(req)
          .retrieve()
          .body(ScoreResponse.class);
      return r.score();
    } catch (RestClientException e) {          // refused (sidecar restarting) or timed out
      log.warn("fraud sidecar unavailable, using rules fallback: {}", e.getMessage());
      return 0.5;                              // route to manual review rather than fail checkout
    }
  }
}`,
      note: 'Even on localhost, set timeouts: an OOMKilled or throttled sidecar must not hold request threads. The settings and builder classes are the Boot 3.4+ API in the <code>http.client</code> package; older 3.x versions use <code>ClientHttpRequestFactories</code>. Wrap with a Resilience4j circuit breaker if failures are frequent.'
    },
    {
      title: 'Python 3.11 FastAPI inference sidecar + KEDA ScaledObject for the async path', lang: 'python',
      code: `# app.py  -  run: uvicorn app:app --host 127.0.0.1 --port 8000 --workers 1
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response
from pydantic import BaseModel
import onnxruntime as ort, numpy as np

state: dict = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    state["sess"] = ort.InferenceSession("/models/fraud.onnx")   # slow: startupProbe waits
    yield
    state.clear()

app = FastAPI(lifespan=lifespan)

class ScoreRequest(BaseModel):
    orderId: str
    amount: float
    country: str

@app.get("/ready")
def ready(resp: Response):
    if "sess" not in state:
        resp.status_code = 503
    return {"ready": "sess" in state}

@app.post("/v1/score")
def score(req: ScoreRequest):
    x = np.array([[req.amount, hash(req.country) % 1000]], dtype=np.float32)
    out = state["sess"].run(None, {state["sess"].get_inputs()[0].name: x})
    return {"score": float(out[0].ravel()[0]), "modelVersion": "3.2.0"}

# keda-scaledobject.yaml (async scoring workers, separate Deployment)
# apiVersion: keda.sh/v1alpha1
# kind: ScaledObject
# metadata: { name: fraud-workers }
# spec:
#   scaleTargetRef: { name: fraud-workers }
#   minReplicaCount: 0
#   maxReplicaCount: 20
#   triggers:
#     - type: kafka
#       metadata: { bootstrapServers: kafka:9092, consumerGroup: fraud, topic: score-requests, lagThreshold: "100" }`,
      note: 'Bind to <code>127.0.0.1</code>: only containers in the same Pod can reach it. <code>hash()</code> on strings is salted per process in Python, so a real model would use a stable encoding; it is kept here only to show the shape. Sync <code>def</code> endpoints run in FastAPI\'s thread pool, so CPU-bound inference does not block the event loop.'
    }
  ],

  related: ['service-mesh', 'twelve-factor', 'ai-architecture', 'platform-engineering', 'deployment-strategies', 'sd:llm-inference']
});
