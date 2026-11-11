(function () {
/* rolling deploy + disposability model for the calculator */
function calc(v) {
  const surge = Math.max(1, Math.ceil(0.25 * v.N));
  const waves = Math.ceil(v.N / surge);
  const deployS = waves * (v.S + 10) + v.G;                 // +10 s readiness checks per wave (estimate)
  const D = v.D / 1000, LAG = 2;                            // ~2 s for endpoint removal to reach every proxy (estimate)
  const risk = v.R * (D + LAG);                             // in-flight + misrouted, summed over all pods
  const pre = Math.min(v.G, 5), drain = Math.max(0, v.G - pre);
  const lost = v.G <= 0 ? risk : v.R * Math.max(0, LAG - pre) + v.R * D * Math.max(0, 1 - drain / D);
  const scaleOut = 15 + 10 + v.S + 10;                      // HPA sync + schedule/pull + start + readiness
  return { waves, deployS, risk, lost, scaleOut };
}

SD.register({
  slug: 'twelve-factor',
  domain: 4,
  title: 'The 12-Factor App',
  examples: 'Heroku, Spring Boot, Kubernetes',
  tagline: 'Twelve rules from Heroku (2011) that make a service <b>portable, disposable and easy to scale</b>: one codebase, config in the environment, stateless processes, fast start, graceful stop, logs as streams.',
  tldr: {
    problem: 'Apps written for one hand-tended server break when a platform starts, stops, copies and moves them: config is baked in, sessions live in memory, logs go to local files, and a deploy drops in-flight requests.',
    idea: 'Build <b>one immutable artefact</b> from one codebase, combine it with <b>config from the environment</b> to make a release, and run it as <b>stateless, disposable processes</b> that bind a port, keep state in <b>backing services</b>, and write logs to <b>stdout</b>.',
    insight: 'The factors are a <b>contract between the app and the platform</b>. Kubernetes can only scale, heal and roll out what it is allowed to kill at any moment. Most "Kubernetes problems" in interviews are really 12-factor violations.',
    numbers: [
      { v: '2011', l: 'Adam Wiggins publishes 12factor.net, based on Heroku’s experience (12factor.net)' },
      { v: '30 s', l: 'Kubernetes default terminationGracePeriodSeconds before SIGKILL' },
      { v: '15', l: 'factors in Kevin Hoffman’s Beyond the Twelve-Factor App (O’Reilly, 2016)' }
    ]
  },

  intro: {
    what: 'The Twelve-Factor App is a <b>checklist for building web services that run well on a cloud platform</b>. It was written by Adam Wiggins, a co-founder of Heroku, in 2011. Each factor is one rule, such as "store config in the environment" or "treat logs as event streams". Together they make an app that a platform can <b>build once, configure per environment, copy, kill and replace</b> without anyone logging in to a server.',
    analogy: {
      icon: '🚚',
      title: 'Shipping containers instead of hand-loaded cargo',
      text: 'Before standard containers, every ship was loaded by hand and every port needed to know the cargo. A standard box with labels on the outside (<b>config</b>) can be moved by any crane, on any ship. The box carries nothing that depends on the ship (<b>no local state</b>), and it can be swapped if damaged (<b>disposable</b>). The analogy stops at state: a real app still needs a database, which is simply kept <b>outside</b> the box.'
    },
    problem: 'Your Spring Boot service runs on one VM. Config is in a file someone edited on the box, users’ sessions live in server memory, and logs go to <code>/var/log/app.log</code>. You move it to Kubernetes with three replicas. Now users are logged out whenever the load balancer picks another pod, staging behaves differently from prod, every deploy shows a burst of 502 errors, and when a pod dies its logs die with it. The question 12-factor answers is: <b>what must an app promise so that a platform can run many copies of it safely?</b>',
    story: [
      {
        stage: 'naive',
        title: 'A pet server',
        text: 'One VM, built by hand. The JAR reads <code>/etc/app/prod.properties</code>, keeps the HTTP <b>session in memory</b>, writes uploads and logs to local disk. Deploys are "copy the new JAR and restart". It works, as long as there is exactly one copy.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'browser', kind: 'client', at: [70, 0] },
            { id: 'app', label: 'App VM', sub: 'session in RAM', kind: 'service', at: [210, 0] },
            { id: 'disk', label: 'Local disk', sub: 'logs + uploads', kind: 'store', at: [350, 0] },
            { id: 'cfg', label: 'prod.properties', sub: 'edited by hand', kind: 'policy', at: [210, 110] },
            { id: 'db', label: 'Postgres', sub: 'db01:5432', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'u', to: 'app' }, { from: 'app', to: 'disk' }, { from: 'cfg', to: 'app' }, { from: 'app', to: 'db' }],
          flow: ['u>app', ['app>disk', 'app>db']]
        }
      },
      {
        stage: 'breaks',
        title: 'Three copies, a scale-in and a deploy',
        text: 'On Kubernetes the platform <b>adds, removes and replaces</b> copies at will. The next request lands on another pod, which has no session. A scale-in deletes a pod with its uploads and logs. The pod is killed mid-request, so users see <b>502</b>. Staging was built with a different properties file, so it never tested what prod runs.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'logged out', kind: 'client', at: [70, 0] },
            { id: 'lb', label: 'Load balancer', sub: 'round robin', kind: 'edge', at: [210, 0] },
            { id: 'p1', label: 'Pod 1', sub: 'has session', kind: 'service', at: [70, 110] },
            { id: 'p2', label: 'Pod 2', sub: 'no session', kind: 'service', at: [210, 110] },
            { id: 'p3', label: 'Pod 3', sub: 'killed', kind: 'service', at: [350, 110] },
            { id: 'disk', label: 'Pod disk', sub: 'logs gone', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'u', to: 'lb' }, { from: 'lb', to: 'p1' }, { from: 'lb', to: 'p2' }, { from: 'lb', to: 'p3' }, { from: 'p3', to: 'disk' }],
          flow: ['u>lb', ['lb>p2', 'lb>p3']],
          err: ['p3', 'disk'], warn: ['p2', 'u'],
          badges: { p3: ['502', 'err'], p2: ['login again', 'warn'], disk: ['lost', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Disposable copies, state outside',
        text: 'One image is built once and promoted. Config arrives as <b>environment variables</b> and secrets. Sessions and files go to <b>backing services</b> (Redis, object storage). Pods start fast, stop <b>gracefully</b>, and print logs to <b>stdout</b>, where a collector picks them up. Any pod can now die at any time.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'stay logged in', kind: 'client', at: [70, 0] },
            { id: 'lb', label: 'Load balancer', sub: 'ready pods only', kind: 'edge', at: [210, 0] },
            { id: 'p1', label: 'Pod 1', sub: 'stateless', kind: 'service', at: [70, 110] },
            { id: 'p2', label: 'Pod 2', sub: 'stateless', kind: 'service', at: [210, 110] },
            { id: 'p3', label: 'Pod 3', sub: 'draining', kind: 'service', at: [350, 110] },
            { id: 'redis', label: 'Redis', sub: 'sessions', kind: 'cache', at: [70, 220] },
            { id: 'log', label: 'Log collector', sub: 'stdout stream', kind: 'queue', at: [350, 220] }
          ],
          edges: [{ from: 'u', to: 'lb' }, { from: 'lb', to: 'p1' }, { from: 'lb', to: 'p2' }, { from: 'p1', to: 'redis' }, { from: 'p2', to: 'redis' }, { from: 'p3', to: 'log' }],
          flow: ['u>lb', 'lb>p2', 'p2>redis', 'p3>log'],
          ok: ['p1', 'p2', 'redis', 'log'], warn: ['p3'],
          badges: { p3: ['graceful stop', 'ok'], redis: ['session kept', 'ok'] }
        }
      }
    ],
    usedBy: ['Heroku (origin of the method)', 'Spring Boot and Spring Cloud', 'Kubernetes Deployments', 'Cloud Foundry', 'Google Cloud Run', 'AWS (maintainer since 2024)'],
    whenToUse: [
      'Any <b>stateless web service or worker</b> that will run as several replicas on Kubernetes, a PaaS or serverless containers',
      'You want <b>one artefact promoted</b> through dev, staging and prod, with automatic rollouts and rollbacks',
      'You need <b>autoscaling</b> or frequent deploys, so instances must start fast and die without losing work'
    ],
    whenNot: [
      'The <b>database itself</b> or other stateful systems (Kafka, Elasticsearch): they need stable identity and disks, so use StatefulSets or a managed service (see <a href="container-patterns.html">Advanced Container Patterns</a>)',
      'Desktop, mobile or embedded software: the factors assume a server platform that runs your processes',
      'As a <b>reason for a rewrite</b>: fix the violations that hurt (state, config, shutdown) first; the rest can wait'
    ],
    glossary: [
      { term: 'Build, release, run', def: 'Build turns code into an artefact; release combines that artefact with one environment’s config; run starts processes from a release.' },
      { term: 'Backing service', def: 'Any service the app reaches over the network (database, cache, queue, SMTP), attached by a URL in config and swappable without code changes.' },
      { term: 'Stateless process', def: 'A process that keeps nothing it needs for the next request in memory or on local disk; all durable state is in a backing service.' },
      { term: 'Disposability', def: 'Processes start fast and shut down gracefully on SIGTERM, so the platform can kill or move them at any time.' },
      { term: 'Graceful shutdown', def: 'On SIGTERM, stop accepting new requests, finish the in-flight ones within a time limit, then exit.' },
      { term: 'Readiness probe', def: 'A Kubernetes check that decides whether a pod receives traffic; failing it removes the pod from Service endpoints without restarting it.' },
      { term: 'Dev/prod parity', def: 'Keeping the gaps in time, people and tools between development and production small, e.g. the same Postgres version everywhere.' },
      { term: 'Admin process', def: 'A one-off task, such as a database migration, run with the same image and config as the app, not from someone’s laptop.' }
    ]
  },

  requirements: {
    functional: [
      '<b>I Codebase, II Dependencies:</b> one repo per deployable, many deploys; every dependency declared and isolated (Maven/Gradle lockfile, nothing assumed on the host)',
      '<b>III Config, IV Backing services:</b> everything that differs between deploys comes from the environment; databases and queues are attached resources named by URL',
      '<b>V Build, release, run:</b> build once into an immutable, versioned image; a release = image digest + config; never change code at run time',
      '<b>VI Processes, VII Port binding, VIII Concurrency:</b> stateless, share-nothing processes that export HTTP by binding a port and scale out by adding process types and replicas',
      '<b>IX Disposability, X Dev/prod parity:</b> fast start, graceful SIGTERM; same backing-service types and versions from laptop to prod, deployed often',
      '<b>XI Logs, XII Admin processes:</b> write an unbuffered event stream to stdout; run one-off tasks as separate processes from the same release'
    ],
    nonFunctional: [
      '<b>Portability:</b> the same image runs in every environment; promotion changes config only (target: zero rebuilds between staging and prod)',
      '<b>Deploy safety:</b> rolling deploys drop <b>0</b> requests; rollback = re-run the previous release in minutes',
      '<b>Elasticity:</b> a new replica is ready in seconds, not minutes (rule of thumb: start + readiness < 30 s for a JVM service)',
      '<b>Resilience:</b> any single pod can be killed at any time with no lost session or data',
      '<b>Observability:</b> every log line reaches central storage even if the pod dies a second later',
      '<b>Security:</b> no secret in the image or the repo; the litmus test is "could we open-source this codebase right now without leaking credentials?"'
    ],
    outOfScope: [
      '<b>Environment-specific builds</b> (<code>mvn -Pprod</code> produces a different JAR than staging tested)',
      '<b>Sticky sessions</b> used to hide in-memory state, and files written to the container filesystem',
      '<b>Migrations at startup in every replica</b>, or run by hand from a laptop',
      '<b>Log files inside the container</b> with in-app rotation',
      '<b>Treating 12-factor as dogma</b> for databases, brokers and other stateful systems'
    ]
  },

  calculator: {
    inputs: [
      { id: 'N', label: 'Replicas', min: 2, max: 60, value: 10 },
      { id: 'S', label: 'Startup to ready', min: 1, max: 120, value: 30, unit: 's' },
      { id: 'G', label: 'Shutdown budget (preStop + drain; 0 = kill at once)', min: 0, max: 60, value: 0, unit: 's' },
      { id: 'D', label: 'Typical request duration', min: 20, max: 30000, value: 400, unit: 'ms', log: true },
      { id: 'R', label: 'Traffic across the service', min: 10, max: 20000, value: 1000, unit: 'req/s', log: true },
      { id: 'F', label: 'Deploys per week', min: 1, max: 100, value: 10 }
    ],
    outputs: [
      { label: 'Rolling deploy time (maxSurge 25%, maxUnavailable 0)', fmt: 'raw', f: (v) => SD.fmt.dur(calc(v).deployS * 1000) + ' · ' + calc(v).waves + ' waves' },
      { label: 'Requests at risk per deploy if pods die instantly: R × (duration + 2 s endpoint lag)', fmt: 'num', f: (v) => Math.round(calc(v).risk) },
      { label: 'Failed requests per deploy with this shutdown budget', fmt: 'num', f: (v) => Math.round(calc(v).lost) },
      { label: 'Failed requests per year from deploys alone', fmt: 'num', f: (v) => Math.round(calc(v).lost * v.F * 52) },
      { label: 'Time to add capacity for a spike (HPA + schedule + start + ready)', fmt: 'raw', f: (v) => SD.fmt.dur(calc(v).scaleOut * 1000) },
      { label: 'Extra requests to queue or shed during a 2× spike before new pods help', fmt: 'num', f: (v) => Math.round(v.R * calc(v).scaleOut) }
    ],
    note: 'Model: every pod is replaced once per deploy. Without a graceful shutdown, a killed pod loses its in-flight requests (R/N × duration) and keeps getting new ones until endpoint removal reaches every proxy, assumed <em>≈ 2 s</em> (an <em>estimate</em>; it varies by cluster and ingress). With a budget, up to 5 s goes to a <code>preStop</code> sleep that covers that lag, and the rest drains in-flight work; requests longer than the drain time are cut. Readiness checks (+10 s per wave), scheduling and image pull (+10 s) and the HPA sync period (15 s, the Kubernetes default) are <em>estimates</em>. Deploy time ignores the rule that terminating pods may overlap the next wave.'
  },

  api: [
    { m: 'YAML', p: 'Deployment + Service (k8s)', d: 'Image by <b>digest</b>, <code>envFrom</code> ConfigMap and Secret, <code>readinessProbe</code>/<code>livenessProbe</code> on the Actuator groups, <code>preStop</code> sleep and <code>terminationGracePeriodSeconds</code> larger than preStop + drain.' },
    { m: 'YAML', p: 'application.yml', d: 'Only defaults and <code>${ENV_VAR}</code> placeholders. <code>server.shutdown: graceful</code>, <code>spring.lifecycle.timeout-per-shutdown-phase</code>, probes enabled, logs to console. No profile per environment.' },
    { m: 'DOC', p: 'Dockerfile / buildpack config', d: 'Multi-stage build, layered JAR or Cloud Native Buildpacks, non-root user, exec-form <code>ENTRYPOINT</code> so the JVM receives SIGTERM as PID 1.' },
    { m: 'POLICY', p: 'Config & secrets policy', d: 'What is config (varies per deploy) versus code (same everywhere); which values are secrets and must come from a secrets manager; who can change each; how changes roll out.' },
    { m: 'HTTP', p: 'GET /actuator/health/readiness', d: 'Returns 200 when the app can take traffic. Spring sets it to OUT_OF_SERVICE on shutdown; Kubernetes stops routing to the pod.' },
    { m: 'ADR', p: 'Exception: stateful workload', d: 'When a component legitimately breaks a factor (a cache with local disk, a WebSocket hub), record why, the blast radius and how it is operated.' }
  ],
  dataModel: [
    { name: 'release', store: 'CD system / Git (GitOps)', fields: [['release_id', 'text', 'pk'], ['service', 'text', 'idx'], ['image_digest', 'text'], ['git_sha', 'text'], ['config_version', 'text'], ['env', 'enum'], ['created_at', 'timestamptz']], note: 'Factor V made concrete: a release is immutable. Rollback means deploying an older row, not rebuilding.' },
    { name: 'factor_audit', store: 'Architecture repo', fields: [['service', 'text', 'pk'], ['factor', 'smallint', 'pk'], ['status', 'enum'], ['evidence', 'text'], ['exception_adr', 'text', 'fk'], ['reviewed_at', 'date']], note: 'One row per service per factor (pass / partial / fail / exempt). Exceptions must link an ADR.' },
    { name: 'config_var', store: 'ConfigMap / secrets manager', fields: [['service', 'text', 'pk'], ['env', 'enum', 'pk'], ['key', 'text', 'pk'], ['is_secret', 'bool'], ['source', 'text'], ['rotated_at', 'timestamptz']], note: 'Values are never stored here for secrets, only a reference (e.g. a Vault path).' }
  ],

  architecture: {
    title: 'The twelve factors on Kubernetes',
    nodes: [
      { id: 'git', label: 'Git repo', sub: 'I · one codebase', kind: 'service', wide: [90, 50], tall: [210, 0], tip: 'Factor I: one codebase tracked in version control, many deploys. Shared code goes into libraries, not copies.' },
      { id: 'ci', label: 'CI build', sub: 'II · V build', kind: 'compute', wide: [280, 50], tall: [350, 0], tip: 'Factors II and V: dependencies come from the lockfile; the build produces one image. No environment-specific builds.' },
      { id: 'reg', label: 'Image registry', sub: 'immutable digest', kind: 'store', wide: [470, 50], tall: [350, 105], tip: 'Every image is addressed by digest. The same digest is promoted from staging to prod.' },
      { id: 'k8s', label: 'Deployment', sub: 'V · release + run', kind: 'policy', wide: [660, 50], tall: [210, 210], tip: 'A release is image digest + config. The Deployment rolls it out with readiness gates; rollback re-applies an older release.' },
      { id: 'cfg', label: 'ConfigMap/Secret', sub: 'III · config in env', kind: 'policy', wide: [850, 50], tall: [210, 105], tip: 'Factor III: config that varies per deploy, injected as env vars or mounted files; secrets from a secrets manager.' },
      { id: 'users', label: 'Users', sub: 'HTTPS', kind: 'client', wide: [90, 160], tall: [70, 0], tip: 'Clients never know which pod served them.' },
      { id: 'ing', label: 'Ingress/Service', sub: 'VII · port binding', kind: 'edge', wide: [280, 160], tall: [70, 105], tip: 'Factor VII: the app is self-contained and exports HTTP on a port; the platform routes to it.' },
      { id: 'pod', label: 'Web pods ×N', sub: 'VI · IX stateless', kind: 'service', wide: [470, 160], tall: [70, 210], tip: 'Factors VI and IX: share-nothing processes, fast start, graceful SIGTERM.' },
      { id: 'worker', label: 'Worker pods', sub: 'VIII · concurrency', kind: 'compute', wide: [660, 160], tall: [350, 210], tip: 'Factor VIII: scale out by process type. Web and workers scale independently.' },
      { id: 'job', label: 'Migration Job', sub: 'XII · admin', kind: 'compute', wide: [850, 160], tall: [350, 315], tip: 'Factor XII: one-off tasks run from the same release image and config, as a Job or init step, once.' },
      { id: 'logs', label: 'Log collector', sub: 'XI · stdout stream', kind: 'queue', wide: [280, 270], tall: [70, 315], tip: 'Factor XI: the app writes to stdout; a node agent ships the stream. The app never manages log files.' },
      { id: 'redis', label: 'Redis', sub: 'IV · sessions', kind: 'cache', wide: [470, 270], tall: [210, 315], tip: 'Factor IV/VI: session state lives in a backing service, attached by URL.' },
      { id: 'db', label: 'Postgres', sub: 'IV · X same version', kind: 'store', wide: [660, 270], tall: [210, 420], tip: 'Factor IV: an attached resource; swapping it is a config change. Factor X: the same major version in dev (Testcontainers) and prod.' }
    ],
    edges: [
      { from: 'git', to: 'ci' },
      { from: 'ci', to: 'reg' },
      { from: 'reg', to: 'k8s' },
      { from: 'cfg', to: 'k8s' },
      { from: 'k8s', to: 'pod' },
      { from: 'k8s', to: 'worker' },
      { from: 'k8s', to: 'job' },
      { from: 'users', to: 'ing', bidi: true },
      { from: 'ing', to: 'pod' },
      { from: 'pod', to: 'redis' },
      { from: 'pod', to: 'db', bend: 0.15 },
      { from: 'worker', to: 'db', bend: 0.2 },
      { from: 'job', to: 'db', dashed: true },
      { from: 'pod', to: 'logs', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'deploy', title: 'Build once, release, run', tone: 'info',
      steps: [
        { text: 'A merge to main triggers CI. Dependencies come from the lockfile and the build produces <b>one image</b>, pushed by digest.', flow: ['git>ci', 'ci>reg'], badges: { reg: 'sha256:9f3…' } },
        { text: 'A <b>release</b> = that digest + the prod ConfigMap and Secret. Staging ran the very same digest with its own config.', flow: ['reg>k8s', 'cfg>k8s'], badges: { k8s: 'release r42' } },
        { text: 'A <b>migration Job</b> runs once from the same image and config before the rollout (factor XII).', flow: ['k8s>job', 'job>db'], ok: ['job'], badges: { job: ['once', 'ok'] } },
        { text: 'The Deployment rolls pods. A new pod gets traffic only after <code>/actuator/health/readiness</code> returns 200.', flow: ['k8s>pod', 'users>ing', 'ing>pod'], ok: ['pod'], badges: { pod: ['ready', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'kill', title: 'Pod killed mid-request (violations)', tone: 'err',
      steps: [
        { text: 'A rolling deploy deletes an old pod. Kubernetes sends <b>SIGTERM</b> and, in parallel, removes the pod from the Service endpoints. Both take time to propagate.', flow: ['k8s>pod'], warn: ['pod'], badges: { pod: ['SIGTERM', 'warn'] } },
        { text: 'The app exits at once (no graceful shutdown). <b>In-flight requests are cut</b>, and the ingress still routes new ones for a second or two: users see <b>502</b>.', flow: ['users>ing', 'ing>pod'], err: ['pod', 'ing'], badges: { ing: ['502', 'err'] } },
        { text: 'Sessions were in pod memory: those users are <b>logged out</b>. The logback file in the container is gone with the pod, so nobody can see what happened.', nodes: ['pod', 'logs'], err: ['pod', 'logs'], badges: { logs: ['nothing shipped', 'err'] }, labels: { pod: { label: 'Web pods ×N', sub: 'state in RAM' } } },
        { text: 'Fix: sessions in Redis, logs to stdout, <code>server.shutdown=graceful</code>, a <b>preStop sleep</b> longer than endpoint lag, and a grace period larger than preStop + drain.', flow: ['pod>redis', 'pod>logs'], ok: ['pod', 'redis', 'logs'], badges: { pod: ['drains, then exits', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'spike', title: 'Traffic spike: concurrency and startup time', tone: 'warn',
      steps: [
        { text: 'Traffic triples. The HorizontalPodAutoscaler sees CPU above target and asks for more web replicas.', flow: [['users>ing', 'users>ing'], 'ing>pod'], warn: ['pod'], badges: { pod: ['CPU 90%', 'warn'] } },
        { text: 'With a fat JVM start of 60–90 s, existing pods stay overloaded for well over a minute. With a tuned start (CDS, lazy init off the hot path) it is seconds.', nodes: ['pod'], badges: { pod: ['+6 pods starting', 'warn'] } },
        { text: '<b>Process types</b> scale independently: the queue backlog scales worker pods, not web pods (factor VIII).', flow: ['k8s>worker', 'worker>db'], ok: ['worker'], badges: { worker: ['2 → 8', 'ok'] } },
        { text: 'New pods are useful immediately because they are <b>stateless</b>: any request can go to any pod, no warm sessions to move.', flow: ['ing>pod', 'pod>redis'], ok: ['pod', 'redis'], tone: 'ok' }
      ]
    },
    {
      id: 'drift', title: 'Config drift between environments', tone: 'err',
      steps: [
        { text: 'The team builds with <code>-Pstaging</code> and <code>-Pprod</code>. Each profile bakes a different <code>application-*.yml</code> into a <b>different image</b>.', flow: ['git>ci', 'ci>reg'], warn: ['ci'], badges: { reg: ['2 images', 'warn'] } },
        { text: 'Prod gets a pool size and a timeout that staging never ran with. The first peak exhausts DB connections.', flow: ['reg>k8s', 'k8s>pod', 'pod>db'], err: ['pod', 'db'], badges: { db: ['pool exhausted', 'err'] } },
        { text: 'Rotating the DB password needs a rebuild of every image, because the secret is inside the JAR.', nodes: ['reg', 'cfg'], err: ['reg'], badges: { reg: ['secret in image', 'err'] }, tone: 'err' },
        { text: 'Fix: one image, values from ConfigMap and Secret (or a config server). Promotion changes only config, and the diff between environments is visible in Git.', flow: ['cfg>k8s', 'reg>k8s'], ok: ['cfg', 'reg'], badges: { cfg: ['diff in Git', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'admin', title: 'Admin process done right', tone: 'info',
      steps: [
        { text: 'A data fix is needed. The anti-pattern is <code>kubectl exec</code> into a pod and pasting SQL, or running a script from a laptop with local config.', nodes: ['pod'], warn: ['pod'], badges: { pod: ['exec + paste?', 'warn'] } },
        { text: 'Instead, the fix is a versioned script in the same repo, shipped in the <b>same image</b>, run as a Kubernetes <b>Job</b> with the release’s config.', flow: ['git>ci', 'ci>reg', 'k8s>job'], ok: ['job'] },
        { text: 'The Job runs once, logs to stdout like everything else, and leaves an audit trail in Git and the cluster.', flow: ['job>db'], ok: ['job', 'db'], badges: { job: ['completed', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Service: a Spring Boot API on Kubernetes, 10 replicas, deployed daily. Choose how it handles config, state, startup and logs. Scores are an <em>illustrative model</em>; the directions are what matter.',
    controls: [
      { id: 'cfg', label: 'Config style', type: 'seg', value: 'baked', options: [
        { v: 'baked', l: 'Baked into image per env' }, { v: 'env', l: 'Env vars from ConfigMap/Secret' }, { v: 'server', l: 'Config server + secrets manager' }] },
      { id: 'state', label: 'Session and file state', type: 'seg', value: 'local', options: [
        { v: 'local', l: 'In memory / local disk (sticky)' }, { v: 'ext', l: 'External store (Redis, S3)' }] },
      { id: 'start', label: 'Startup', type: 'seg', value: 'fat', options: [
        { v: 'fat', l: 'Fat JVM, ~60 s' }, { v: 'tuned', l: 'Tuned + CDS, ~10 s' }, { v: 'native', l: 'GraalVM native, < 1 s' }] },
      { id: 'logs', label: 'Logs', type: 'seg', value: 'files', options: [
        { v: 'files', l: 'Files in the container' }, { v: 'stdout', l: 'stdout → collector' }] }
    ],
    evaluate(s) {
      const startS = { fat: 60, tuned: 10, native: 1 }[s.start];
      const scaleOut = 15 + 10 + startS + 5;
      const local = s.state === 'local';
      const scal = Math.max(0.05, (local ? 0.35 : 0.9) - (s.start === 'fat' ? 0.3 : s.start === 'tuned' ? 0.05 : 0));
      const safety = Math.max(0.05, 0.95 - (s.cfg === 'baked' ? 0.4 : 0) - (local ? 0.3 : 0) - (s.start === 'fat' ? 0.1 : 0));
      const port = Math.max(0.05, ({ baked: 0.3, env: 0.95, server: 0.75 }[s.cfg]) - (s.logs === 'files' ? 0.15 : 0) - (local ? 0.15 : 0) - (s.start === 'native' ? 0.05 : 0));
      const ops = Math.max(0.05, 0.85 - (s.cfg === 'server' ? 0.2 : 0) - (s.cfg === 'baked' ? 0.15 : 0) - (s.logs === 'files' ? 0.25 : 0) - (s.start === 'native' ? 0.2 : 0) - (local ? 0.1 : 0));
      const sec = { baked: 0.1, env: 0.55, server: 0.9 }[s.cfg] - (s.logs === 'files' ? 0.05 : 0);
      const metrics = [
        { k: 'Scalability', v: scal > 0.7 ? 'scale out freely' : scal > 0.4 ? 'limited' : 'scale-in hurts users', s: scal },
        { k: 'Time to add a pod', v: '≈ ' + scaleOut + ' s', s: scaleOut <= 35 ? 0.9 : scaleOut <= 45 ? 0.7 : 0.25, hint: 'HPA + schedule + start' },
        { k: 'Deploy safety', v: safety > 0.75 ? 'boring deploys' : safety > 0.45 ? 'some risk' : 'every deploy hurts', s: safety },
        { k: 'Portability', v: port > 0.75 ? 'same image anywhere' : port > 0.45 ? 'needs extra infra' : 'tied to one env', s: port },
        { k: 'Ops effort', v: ops > 0.7 ? 'low' : ops > 0.45 ? 'medium' : 'high', s: ops },
        { k: 'Security', v: sec > 0.8 ? 'rotatable, audited' : sec > 0.4 ? 'OK, watch env leaks' : 'secrets in image', s: Math.max(0.05, sec) }
      ];
      const notes = [];
      if (s.cfg === 'baked') notes.push('Each environment runs a <b>different artefact</b>, so staging never tests what prod runs, and a password rotation means a rebuild. Anyone who can pull the image can read the secrets.');
      if (s.cfg === 'env') notes.push('Env vars are the 12-factor default and portable. Watch out: they show up in <code>kubectl describe</code>, crash dumps and child processes, and changes need a pod restart.');
      if (s.cfg === 'server') notes.push('A config server (Spring Cloud Config, or Kubernetes plus a secrets manager such as Vault) adds rotation, audit and dynamic refresh, at the cost of <b>another critical dependency</b> at startup.');
      if (local) notes.push('Sticky sessions hide the state until a <b>scale-in or deploy</b> kills a pod: those users lose their session and any files on its disk. Autoscaling becomes something to fear.');
      if (s.start === 'fat') notes.push('A 60 s start makes rolling deploys slow and autoscaling late; the spike is over before help arrives. Spring Boot 3.3+ <b>CDS</b> support or trimming startup work are cheap first steps.');
      if (s.start === 'native') notes.push('GraalVM native starts in well under a second but builds take minutes, reflection needs hints, and peak throughput can be lower than a warmed-up JIT. Worth it for scale-to-zero, less so for long-lived pods.');
      if (s.logs === 'files') notes.push('Files inside the container vanish with the pod and can fill its ephemeral storage, which gets the pod <b>evicted</b>. Write to stdout and let the node agent ship it.');
      let verdict;
      if (s.cfg !== 'baked' && !local && s.start !== 'fat' && s.logs === 'stdout') verdict = '✅ <b>Twelve-factor where it matters:</b> one image, config outside, stateless, fast start and stdout logs. Pods are truly disposable.';
      else if (local && s.cfg === 'baked') verdict = '❌ <b>A pet server in a container.</b> Kubernetes will scale and replace these pods, and users will notice every time.';
      else if (local) verdict = '⚠ <b>State is the blocker:</b> move sessions and files to a backing service before tuning anything else.';
      else if (s.cfg === 'baked') verdict = '⚠ <b>Different images per environment:</b> config drift and secrets in the image. Externalise config next.';
      else verdict = '👍 <b>Mostly there.</b> Fix the remaining items (startup time, log handling) to make scaling and deploys boring.';
      return {
        metrics, verdict, notes,
        labels: {
          cfg: { label: 'ConfigMap/Secret', sub: { baked: 'unused: in image', env: 'III · env vars', server: 'config srv + vault' }[s.cfg] },
          pod: { label: 'Web pods ×N', sub: (local ? 'sticky · state in RAM' : 'stateless') + ' · ' + startS + ' s' },
          logs: { label: 'Log collector', sub: s.logs === 'files' ? 'nothing to collect' : 'stdout stream' },
          reg: { label: 'Image registry', sub: s.cfg === 'baked' ? 'one image per env' : 'one digest, promoted' }
        },
        hide: local ? ['redis'] : [],
        err: (local ? ['pod'] : []).concat(s.logs === 'files' ? ['logs'] : []).concat(s.cfg === 'baked' ? ['reg'] : []),
        warn: s.start === 'fat' ? ['pod'] : [],
        ok: (s.cfg !== 'baked' ? ['cfg'] : []).concat(local ? [] : ['redis']),
        badges: { pod: ['ready in ' + startS + ' s', s.start === 'fat' ? 'warn' : 'ok'], cfg: [s.cfg === 'baked' ? 'drift' : 'one image', s.cfg === 'baked' ? 'err' : 'ok'] },
        flow: ['users>ing', 'ing>pod'].concat(local ? ['pod>db'] : ['pod>redis']).concat(s.logs === 'stdout' ? ['pod>logs'] : [])
      };
    }
  },

  widget: {
    title: 'Audit an app, then kill its pods',
    caption: '<b>Part 1:</b> toggle each factor off to see the concrete failure it causes in a running cluster. <b>Part 2:</b> a real rolling update of 4 pods (maxSurge 1, maxUnavailable 0) with round-robin routing and an endpoint-removal lag of 0.5–2.5 s per pod. Turn graceful shutdown (preStop sleep + <code>server.shutdown=graceful</code>) and the readiness probe on and off and count the failed requests.'
  },

  realWorld: {
    intro: 'The method came from one platform company, was extended by the Pivotal / Cloud Foundry world, and was handed to the community in 2024. Spring Boot and Kubernetes added the hooks that make the factors easy.',
    timeline: [
      { when: '2011', who: 'Adam Wiggins · Heroku', title: 'The Twelve-Factor App published', text: 'Heroku co-founder Adam Wiggins writes up the practices Heroku saw across many apps on its platform, as twelve factors from <b>Codebase</b> to <b>Admin processes</b>. Factor III reads: "<b>Store config in the environment</b>", with the litmus test of whether the codebase could be made open source at any moment without compromising credentials.', src: 0 },
      { when: '2016', who: 'Kevin Hoffman · O’Reilly', title: 'Beyond the Twelve-Factor App', text: 'Hoffman, then at Pivotal, revisits the factors for cloud-native apps and proposes <b>15</b>: he adds <b>API first</b>, <b>telemetry</b> and <b>authentication and authorization</b>, and reworks others (for example "build, release, run" becomes "design, build, release, run").', src: 4 },
      { when: '2020', who: 'Spring team', title: 'Liveness, readiness and graceful shutdown in Spring Boot 2.3', text: 'Spring Boot 2.3 exposes <code>/actuator/health/liveness</code> and <code>/actuator/health/readiness</code> as health groups backed by <code>ApplicationAvailability</code>, so the app can tell Kubernetes when it is ready and when it is shutting down.', src: 5 },
      { when: 'Boot 3.x', who: 'Spring Boot docs', title: 'Graceful shutdown on all embedded servers', text: 'With <code>server.shutdown=graceful</code> the embedded Tomcat, Jetty, Undertow or Reactor Netty stops accepting requests and waits for active ones, up to <code>spring.lifecycle.timeout-per-shutdown-phase</code>. The docs warn that an IDE may kill the app without a proper SIGTERM.', src: 6 },
      { when: '2024', who: 'Spring Boot 3.3', title: 'CDS support and the tools jar mode', text: 'Boot 3.3 documents a <b>Class Data Sharing</b> training run to cut JVM startup time and memory, and the <code>-Djarmode=tools extract</code> layout for efficient, layered container images. Both target factor IX (fast startup) and factor V (cacheable, immutable builds).', src: 8 },
      { when: 'Nov 2024', who: 'Heroku · Salesforce', title: 'Twelve-Factor goes open source', text: 'Heroku announces the methodology is now an <b>open source project</b> with community governance, aimed at modernising it for containers and Kubernetes. Press coverage at KubeCon named maintainers from outside Heroku, including people from <b>AWS and Google</b>.', src: 2 },
      { when: '2025', who: 'Kubernetes v1.33', title: 'Native sidecars are stable', text: 'Sidecar containers (init containers with <code>restartPolicy: Always</code>) start before and stop after the app container. Log shippers and proxies no longer die before the app finishes draining, which closes a long-standing gap for factors IX and XI.', src: 7 }
    ],
    lessons: [
      '<b>The factors are a contract</b>: the platform promises to route, scale and restart; the app promises to be stateless, configurable and killable.',
      '<b>Config vs secrets</b>: env vars are fine for config, weaker for secrets (they leak into dumps and describe output). Use a secrets manager or mounted files, and still keep them out of the image.',
      '<b>Disposability needs both sides</b>: graceful shutdown in the app is not enough without a preStop delay that covers endpoint propagation.',
      '<b>Stdout is the interface, not the pipeline</b>: at scale the collector, buffering and structure (JSON) decide whether logs survive.',
      '<b>Stateful systems are exempt by design</b>: databases and brokers need StatefulSets or managed services; the app attaches to them as backing services.'
    ],
    sources: [
      { title: 'The Twelve-Factor App', url: 'https://12factor.net/', pub: '12factor.net (Adam Wiggins), 2011' },
      { title: 'Twelve-Factor App Methodology is now Open Source', url: 'https://12factor.net/blog/open-source-announcement', pub: '12factor.net blog, 2024' },
      { title: 'Heroku Open Sources the Twelve-Factor App Definition', url: 'https://www.heroku.com/blog/heroku-open-sources-twelve-factor-app-definition/', pub: 'Heroku blog, Nov 2024' },
      { title: 'Twelve-Factor project goes open source (KubeCon)', url: 'https://siliconangle.com/2024/11/15/twelve-factor-project-open-source-salesforce-kubecon', pub: 'SiliconANGLE, Nov 2024' },
      { title: 'Beyond the Twelve-Factor App', url: 'https://oreilly.com/library/view/beyond-the-twelve-factor/9781492042631', pub: 'Kevin Hoffman, O’Reilly, 2016' },
      { title: 'Liveness and Readiness Probes with Spring Boot', url: 'https://spring.io/blog/2020/03/25/liveness-and-readiness-probes-with-spring-boot/', pub: 'Spring blog, 2020' },
      { title: 'Graceful Shutdown', url: 'https://docs.spring.io/spring-boot/reference/web/graceful-shutdown.html', pub: 'Spring Boot reference' },
      { title: 'Sidecar Containers', url: 'https://kubernetes.io/docs/concepts/workloads/Pods/sidecar-containers/', pub: 'Kubernetes documentation' },
      { title: 'Class Data Sharing', url: 'https://docs.spring.io/spring-boot/3.3/reference/packaging/class-data-sharing.html', pub: 'Spring Boot 3.3 reference' },
      { title: 'Dockerfiles (efficient container images)', url: 'https://docs.spring.io/spring-boot/reference/packaging/container-images/dockerfiles.html', pub: 'Spring Boot reference' }
    ]
  },

  tradeoffs: {
    headers: ['Choice', 'What you get', 'What it costs', 'Pick it when'],
    rows: [
      ['<b>Env vars from ConfigMap / Secret</b>', 'Portable, simple, the 12-factor default; visible diff per environment', 'Changes need a restart; secrets visible to anyone with pod/describe access; flat key space', 'Most services; non-secret config'],
      ['<b>Config server + secrets manager</b>', 'Rotation, audit, dynamic refresh, central policy', 'Another critical dependency at startup; more moving parts', 'Many services, regulated data, frequent secret rotation'],
      ['<b>Sticky sessions instead of external state</b>', 'No Redis to run; fast local reads', 'Uneven load; sessions lost on every scale-in and deploy', 'Almost never; at most as a temporary migration step'],
      ['<b>Fat JVM vs CDS vs native image</b>', 'JIT peak throughput / faster start with the same code / sub-second start', 'Slow scale-out / a training run in the build / long builds, reflection hints', 'Long-lived pods / most services / scale-to-zero, CLIs, functions'],
      ['<b>Logs to stdout vs app-side shipping</b>', 'Decoupled, works on any platform', 'Collector must handle volume, multiline and back-pressure', 'Default; ship directly only for audit logs that must not be dropped']
    ]
  },

  failures: [
    { f: '<b>502s on every deploy</b>: app exits on SIGTERM while endpoints still route to it', detect: 'Error spikes aligned with rollouts; ingress logs show upstream connection refused/reset', fix: '<code>server.shutdown=graceful</code>, preStop sleep (5–10 s), grace period > preStop + drain, exec-form ENTRYPOINT so the JVM gets the signal' },
    { f: '<b>Users logged out on scale-in</b>: session in memory with sticky routing', detect: 'Login/cart complaints after autoscale events; uneven pod load', fix: 'Spring Session with Redis or JDBC; stateless tokens; files to object storage' },
    { f: '<b>Config drift</b>: per-environment builds or hand-edited files', detect: 'Image digests differ between staging and prod; "works in staging"', fix: 'One image per commit; config in ConfigMaps/Secrets under Git; promote by digest' },
    { f: '<b>Secrets leak</b> through the image or env dumps', detect: 'Secret scanning on images and repos; Actuator <code>/env</code> exposed', fix: 'Secrets manager or mounted secret files; never expose <code>/env</code>; rotate on leak' },
    { f: '<b>Lost or evicted logs</b>: files inside the container', detect: 'Gaps in central logs after crashes; pods evicted for ephemeral-storage', fix: 'Console appender, JSON format; node-level collector; native sidecar for special cases' },
    { f: '<b>Racing migrations</b>: every replica runs Flyway on startup, or someone runs SQL from a laptop', detect: 'Lock waits at deploy time; schema changes with no commit', fix: 'One Job or init step per release; migrations in the repo; expand/contract for zero downtime' },
    { f: '<b>Liveness probe kills a healthy app</b>: liveness checks the database', detect: 'Restart storms during a DB blip', fix: 'Liveness = process is alive; readiness may include dependencies; use a startupProbe for slow starts' }
  ],

  interview: [
    { q: 'What is the Twelve-Factor App and where does it come from?', a: 'A methodology published by <b>Adam Wiggins of Heroku in 2011</b> on 12factor.net: twelve rules for building services that run well on a cloud platform. It distils what Heroku saw across many apps: one codebase, declared dependencies, config in the environment, backing services as attached resources, strict build/release/run, stateless processes, port binding, concurrency via processes, disposability, dev/prod parity, logs as streams, and admin processes as one-offs. In November 2024 Heroku made it an <b>open source project</b> to update it for containers and Kubernetes.', lvl: 'core' },
    { q: 'Name the factors you consider most important in Kubernetes, and why.', a: '<b>VI processes (stateless)</b>, <b>IX disposability</b>, <b>III config</b> and <b>XI logs</b>. Kubernetes reschedules, scales and replaces pods all the time, so anything stored in a pod (sessions, files, logs) is lost and any pod that does not stop cleanly drops requests. Config outside the image is what lets one image be promoted across environments. The others (codebase, dependencies, port binding) are mostly enforced by containers already.', fu: 'Which factor do containers make obsolete?', lvl: 'core' },
    { q: '"Store config in the environment." What counts as config, and are env vars enough for secrets?', a: 'Config is <b>everything that varies between deploys</b>: resource URLs, credentials, hostnames, feature limits. Internal wiring that is the same everywhere (Spring bean setup) is not config. Env vars are portable and language-neutral, but for <b>secrets</b> they are weak: they show up in <code>kubectl describe</code>, process listings, crash dumps and child processes, and cannot be rotated without a restart. I keep the principle (not in code, not in the image) but deliver secrets from a <b>secrets manager</b> or mounted files, with rotation and audit.', lvl: 'core' },
    { q: 'Walk through what happens when Kubernetes terminates a Spring Boot pod, and how you avoid dropped requests.', a: 'The pod is marked Terminating. In parallel, the endpoints controller removes it from the Service and every kube-proxy and ingress must catch up. The kubelet runs the <b>preStop</b> hook, then sends <b>SIGTERM</b>, then waits up to <code>terminationGracePeriodSeconds</code> (default 30 s) before <b>SIGKILL</b>. Without care, the JVM exits on SIGTERM while traffic still arrives. Fix: a short <b>preStop sleep</b> to cover endpoint lag, <code>server.shutdown=graceful</code> so Tomcat stops accepting and finishes in-flight work, <code>spring.lifecycle.timeout-per-shutdown-phase</code> under the grace period, and an exec-form ENTRYPOINT so the JVM is PID 1 and receives the signal.', fu: 'Why is graceful shutdown in Spring alone not enough?', lvl: 'deep' },
    { q: 'Liveness versus readiness probes: what should each check?', a: '<b>Readiness</b>: can this pod take traffic right now? It may consider warm-up and critical dependencies; failing it removes the pod from endpoints. <b>Liveness</b>: is the process stuck beyond repair? It should check only the app itself; if it checked the database, a DB blip would restart every pod at once. Spring Boot exposes both as <code>/actuator/health/readiness</code> and <code>/liveness</code>. For slow starts add a <b>startupProbe</b> rather than a long initial delay.', lvl: 'core' },
    { q: 'How do you implement build, release, run with a CI/CD pipeline?', a: 'CI builds <b>one image per commit</b> from the lockfile and pushes it by <b>digest</b>. A release is that digest plus one environment’s config, recorded immutably (for example a GitOps commit). Deploying to staging and prod uses the <b>same digest</b>; only config differs. Rollback re-applies an older release; nothing is rebuilt. No <code>-Pprod</code> builds, no patching in a running container.', lvl: 'core' },
    { q: 'An app keeps HTTP sessions in memory and uses sticky sessions. The team says it is fine. How do you respond?', a: 'It works until the platform does what it is designed to do: <b>scale in, reschedule or roll out</b>. Each of those logs out the users on that pod and loses files on its disk. Sticky routing also skews load. Options: Spring Session with Redis or JDBC, stateless signed tokens for auth, object storage for uploads. Cost is a Redis to run and a few ms per request, which is cheap compared with deploys that users notice.', lvl: 'core' },
    { q: 'Where does 12-factor not apply, or need adapting?', a: '<b>Stateful workloads</b> (databases, Kafka, search) need stable identity and disks: StatefulSets or managed services. <b>Secrets</b> in plain env vars are a weak spot. <b>Logs to stdout</b> is the right interface, but at scale you need structured JSON, a robust collector, back-pressure and sometimes direct shipping for audit logs. Long-lived connections (WebSockets) make disposability harder and need draining logic. And the factors say little about <b>APIs, telemetry and security</b>, which is why Hoffman’s 2016 book added API first, telemetry and authentication and authorization.', lvl: 'deep' },
    { q: 'How should database migrations run in a 12-factor app on Kubernetes?', a: 'As an <b>admin process</b> from the same release: a Kubernetes Job (or a pre-deploy step / init container that runs once) using the same image and config. Not in every replica at startup (they race, and startup gets slow) and not from a laptop. Migrations must be <b>backward compatible</b> during a rolling deploy, so use expand and contract: add the column, deploy code that writes both, backfill, then drop the old one later.', lvl: 'deep' },
    { q: 'How does startup time affect autoscaling and deploys, and how would you reduce it for a Spring Boot service?', a: 'Time to add capacity is roughly HPA reaction + scheduling and image pull + app start + readiness. A 60–90 s JVM start means a spike is often over before new pods help, and rolling deploys take minutes. Steps: measure with the startup actuator endpoint, remove startup work (eager caches, remote calls), use a layered image so pulls are small, use <b>CDS</b> (documented since Boot 3.3) or AOT, and use <b>GraalVM native</b> only where scale-to-zero matters, since it costs build time and reflection hints.', lvl: 'deep' },
    { q: 'Dev/prod parity: what gaps does it target, and how do you close them for a Java team?', a: 'Wiggins names three gaps: <b>time</b> (code waits weeks to reach prod), <b>personnel</b> (devs write, ops deploy) and <b>tools</b> (H2 locally, Postgres in prod). Close them with continuous deployment, teams owning their deploys, and the <b>same backing services</b> everywhere, for example Testcontainers running the same Postgres major version as prod.', lvl: 'core' },
    { q: 'You own the platform for 80 services with very mixed maturity. How do you drive 12-factor adoption without a rewrite?', a: 'Start with impact, not purity. Score each service on a <b>factor audit</b> (pass / partial / fail / exempt with an ADR) and fix the factors that cause incidents first: graceful shutdown, external state, config out of images, stdout logs. Make the right thing the default in the <b>golden path</b>: a base Helm chart with probes, preStop and grace period, a Spring Boot starter with graceful shutdown and JSON console logging, a pipeline that promotes by digest. Then track deploy failure rate and 5xx during rollouts, so teams see the payoff.', lvl: 'deep' }
  ],

  code: [
    {
      title: 'application.yml: config from env, graceful shutdown, probes', lang: 'yaml',
      code: `server:
  port: \${PORT:8080}                   # VII: bind the port the platform gives us
  shutdown: graceful                   # IX: stop accepting, finish in-flight requests

spring:
  application:
    name: orders
  lifecycle:
    timeout-per-shutdown-phase: 20s    # must fit inside terminationGracePeriodSeconds
  datasource:                          # III + IV: backing service attached via env
    url: \${DB_URL}
    username: \${DB_USER}
    password: \${DB_PASSWORD}          # from a Secret / secrets manager, never in Git
    hikari:
      maximum-pool-size: \${DB_POOL_SIZE:10}
  data:
    redis:
      url: \${REDIS_URL}               # VI: sessions live outside the process
  session:
    redis:
      namespace: orders:session        # with spring-session-data-redis on the classpath

management:
  endpoint:
    health:
      probes:
        enabled: true                  # /actuator/health/liveness and /readiness
  endpoints:
    web:
      exposure:
        include: health,info,prometheus

logging:
  structured:
    format:
      console: ecs                     # XI: JSON lines to stdout (Boot 3.4+)`,
      note: 'No <code>application-prod.yml</code>: the same file is used everywhere and only environment values change. <code>logging.structured</code> exists from Spring Boot 3.4; on older versions use a JSON encoder in <code>logback-spring.xml</code> with a console appender. Spring Session needs the <code>spring-session-data-redis</code> dependency.'
    },
    {
      title: 'Kubernetes Deployment: probes, preStop, grace period', lang: 'yaml',
      code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders
spec:
  replicas: 4
  strategy:
    rollingUpdate: { maxSurge: 25%, maxUnavailable: 0 }
  selector:
    matchLabels: { app: orders }
  template:
    metadata:
      labels: { app: orders }
    spec:
      terminationGracePeriodSeconds: 40     # > preStop (10) + Spring drain (20) + margin
      containers:
        - name: app
          image: registry.example.com/orders@sha256:9f3c...   # V: promote by digest
          ports: [{ containerPort: 8080 }]
          envFrom:
            - configMapRef: { name: orders-config }     # III: non-secret config
            - secretRef: { name: orders-secrets }       # synced from a secrets manager
          startupProbe:
            httpGet: { path: /actuator/health/liveness, port: 8080 }
            periodSeconds: 2
            failureThreshold: 60                        # up to 120 s to start
          livenessProbe:
            httpGet: { path: /actuator/health/liveness, port: 8080 }
            periodSeconds: 10
          readinessProbe:
            httpGet: { path: /actuator/health/readiness, port: 8080 }
            periodSeconds: 5
          lifecycle:
            preStop:
              sleep: { seconds: 10 }   # let endpoint removal propagate before SIGTERM
          resources:
            requests: { cpu: 500m, memory: 768Mi }
            limits: { memory: 768Mi }`,
      note: 'The <code>sleep</code> preStop action is built into Kubernetes from v1.30 (beta, on by default); on older clusters use <code>exec: { command: ["sh", "-c", "sleep 10"] }</code>, which needs a shell in the image. The preStop time counts against the grace period.'
    },
    {
      title: 'Dockerfile: multi-stage build with layered JAR', lang: 'bash',
      code: `# syntax=docker/dockerfile:1
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN ./mvnw -B -q dependency:go-offline          # II: dependencies from the lockfile/pom
COPY src src
RUN ./mvnw -B -q package -DskipTests && \\
    cp target/*.jar application.jar && \\
    java -Djarmode=tools -jar application.jar extract --layers --launcher --destination extracted

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 1001 app
USER 1001
WORKDIR /app
# least-changing layers first, so a code change re-pushes only the last layer
COPY --from=build /src/extracted/dependencies/ ./
COPY --from=build /src/extracted/spring-boot-loader/ ./
COPY --from=build /src/extracted/snapshot-dependencies/ ./
COPY --from=build /src/extracted/application/ ./
EXPOSE 8080
# exec form: the JVM is PID 1 and receives SIGTERM directly
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "org.springframework.boot.loader.launch.JarLauncher"]`,
      note: 'The <code>tools</code> jar mode with <code>--launcher</code> is Spring Boot 3.3+; older versions use <code>-Djarmode=layertools ... extract</code>. Alternative with no Dockerfile at all: <code>./mvnw spring-boot:build-image</code> (Cloud Native Buildpacks), which also produces a layered, non-root image. No config and no secrets are copied into the image.'
    }
  ],

  related: ['container-patterns', 'deployment-strategies', 'infrastructure-as-code', 'secrets-kms', 'observability-pillars', 'gitops']
});
})();
