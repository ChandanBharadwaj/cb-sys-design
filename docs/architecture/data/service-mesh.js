(function () {
/* calculator model: sidecar fleet vs ambient (per-node ztunnel) */
const ZT_MEM = 40, ZT_CPU = 60, WP_SHARE = 0.25;           // MiB, millicores per node; share of traffic needing a waypoint (estimates)
const PRICE_GIB = 3.5, PRICE_CORE = 25;                    // USD per month, list-price-ish estimate
function calc(v) {
  const memGiB = v.pods * v.mem / 1024, cores = v.pods * v.cpu / 1000;
  const p50 = v.hops * 2 * v.lat;                          // two proxy passes per hop (client side + server side)
  const ambMem = v.nodes * ZT_MEM / 1024 + memGiB * WP_SHARE * 0.1;
  const ambCores = v.nodes * ZT_CPU / 1000 + cores * WP_SHARE * 0.3;
  const cost = memGiB * PRICE_GIB + cores * PRICE_CORE, ambCost = ambMem * PRICE_GIB + ambCores * PRICE_CORE;
  return { memGiB, cores, p50, p99: p50 * 3, ambMem, ambCores, cost, ambCost, ambP50: v.hops * 2 * v.lat * 0.4 };
}

SD.register({
  slug: 'service-mesh',
  domain: 6,
  title: 'Service Mesh',
  examples: 'Istio, Linkerd, ambient mesh',
  tagline: 'A dedicated infrastructure layer that gives every service-to-service call <b>mutual TLS, identity, retries, traffic splitting and golden metrics</b> without touching application code, at the price of <b>a proxy on every hop</b>.',
  tldr: {
    problem: 'Fifty services in five languages each need encryption in transit, caller identity, timeouts, retries, canary routing and metrics. Re-implementing that in every library drifts, and a security fix means redeploying every service.',
    idea: 'Split the job: a <b>data plane</b> of proxies (Envoy sidecars, Linkerd micro-proxies, or per-node <b>ztunnel</b> plus optional <b>waypoints</b>) sits on every request path, and a <b>control plane</b> (istiod, Linkerd control plane) hands them certificates and routing config. Policy lives in YAML, not in code.',
    insight: 'A mesh moves network behaviour from <i>libraries you compile</i> to <i>infrastructure you operate</i>. That buys uniform mTLS and traffic control, but adds latency on every hop, memory on every pod (in sidecar mode) and a new tier-0 system to upgrade. The interview answer is <b>when the mesh earns its cost</b>, not how Istio works.',
    numbers: [
      { v: '0.20 vCPU · 60 MB', l: 'one Istio sidecar at 1,000 req/s with 1 KB payloads (Istio 1.24 performance docs)' },
      { v: '> 90%', l: 'memory and CPU cut by ambient mode vs sidecars "in many cases" (Istio maintainers, 2024)' },
      { v: '2 proxies / hop', l: 'a sidecar mesh traverses the caller\'s and the callee\'s proxy on every call' }
    ]
  },

  intro: {
    what: 'A service mesh is a layer of small network proxies that carry <b>all traffic between your services</b>, plus a control plane that tells those proxies what to do. The proxies encrypt calls, check who is calling, retry and time out requests, split traffic between versions and record metrics. Your application code just makes a plain HTTP or gRPC call to a service name.',
    analogy: {
      icon: '🛂',
      title: 'Border posts on every road between towns',
      text: 'Picture every road between towns having a <b>border post at both ends</b> (the proxies). Each post checks passports (mTLS identity), applies the rules sent from the capital (control plane), reroutes 10% of trucks to a new bridge (canary) and counts every vehicle (metrics). Drivers do not need to know the rules. The analogy breaks in one place: real border posts slow traffic by minutes; a proxy adds well under a millisecond per pass, but you pay it on <b>every</b> call.'
    },
    problem: 'Your security team asks for <b>encryption and caller authentication on every internal call</b> by next quarter. You have Java, Go, Node and Python services, three HTTP clients and two RPC frameworks. Doing it in libraries means four implementations, certificate rotation code in each, and a year of redeploys. The question a mesh answers is: <b>how do we give every call the same security and traffic rules without changing every service?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Every service does its own networking',
        text: 'Each team picks an HTTP client, adds its own retry loop, maybe TLS with a shared certificate, and its own metrics names. It works for five services written by one team.',
        scene: {
          nodes: [
            { id: 'a', label: 'Frontend', sub: 'Node · own retry', kind: 'service', at: [70, 0] },
            { id: 'b', label: 'Orders', sub: 'Java · Resilience4j', kind: 'service', at: [210, 110] },
            { id: 'c', label: 'Payments', sub: 'Go · no TLS', kind: 'service', at: [350, 220] },
            { id: 'r', label: 'Reports', sub: 'Python', kind: 'service', at: [70, 220] }
          ],
          edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'r', to: 'c' }],
          flow: ['a>b', 'b>c']
        }
      },
      {
        stage: 'breaks',
        title: 'Policy drifts, plaintext leaks, retries multiply',
        text: 'Payments never got TLS, so traffic is <b>plaintext</b> inside the cluster. Any pod (Reports, or an attacker) can call it. Frontend and Orders both retry, so one bad deploy turns into a <b>retry storm</b>. Nobody can answer "who calls payments?" because metrics differ per language.',
        scene: {
          nodes: [
            { id: 'a', label: 'Frontend', sub: 'retry ×3', kind: 'service', at: [70, 0] },
            { id: 'b', label: 'Orders', sub: 'retry ×3', kind: 'service', at: [210, 110] },
            { id: 'c', label: 'Payments', sub: 'plaintext', kind: 'service', at: [350, 220] },
            { id: 'r', label: 'Reports', sub: 'should not call', kind: 'service', at: [70, 220] }
          ],
          edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'r', to: 'c' }],
          flow: [['a>b', 'a>b'], ['b>c', 'b>c', 'r>c']],
          err: ['c'], warn: ['r', 'b'],
          badges: { c: ['9× load', 'err'], r: ['no authz', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Move the network rules into the mesh',
        text: 'A proxy next to each service (or on each node) does <b>mutual TLS</b> with a per-workload identity, enforces "only Orders may call Payments", applies one retry policy and emits the same metrics everywhere. The rules are pushed by a <b>control plane</b>, so changing them is a config change, not a redeploy.',
        scene: {
          nodes: [
            { id: 'a', label: 'Frontend', sub: '+ proxy', kind: 'service', at: [70, 0] },
            { id: 'b', label: 'Orders', sub: '+ proxy', kind: 'service', at: [210, 110] },
            { id: 'c', label: 'Payments', sub: '+ proxy · mTLS', kind: 'service', at: [350, 220] },
            { id: 'r', label: 'Reports', sub: '+ proxy', kind: 'service', at: [70, 220] },
            { id: 'cp', label: 'Control plane', sub: 'certs · policy', kind: 'policy', at: [350, 0] }
          ],
          edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'r', to: 'c', dashed: true }, { from: 'cp', to: 'b', dashed: true }],
          flow: ['cp>b', 'a>b', 'b>c'],
          ok: ['c', 'b', 'a'], err: ['r'],
          badges: { c: ['mTLS ✓', 'ok'], r: ['403 denied', 'err'] }
        }
      }
    ],
    usedBy: ['Lyft (Envoy)', 'Airbnb (Istio)', 'Google Cloud Service Mesh', 'Microsoft, Expedia, Nordstrom (Linkerd)', 'AWS App Mesh users (Envoy)', 'Cilium users (eBPF dataplane)'],
    whenToUse: [
      'Many services in <b>several languages</b> need the same mTLS, authorization and traffic policy, and libraries would drift',
      'Security requires <b>encryption and workload identity</b> on every internal call (a zero-trust programme)',
      'You need <b>fine-grained traffic control</b> (weighted canaries, header routing, mirroring, fault injection) across many teams'
    ],
    whenNot: [
      'A handful of services in one language: a shared library (Resilience4j, gRPC interceptors) is cheaper; see <a href="resiliency-patterns.html">Resiliency Patterns</a>',
      'No platform team to own it: a mesh is a <b>tier-0 dependency</b> whose upgrades can break every call',
      'Ultra-low-latency paths (sub-millisecond budgets, trading, high-rate UDP) where even one extra pass hurts, or you only need edge routing (an <a href="../../system-design/systems/api-gateway.html">API Gateway</a>)'
    ],
    glossary: [
      { term: 'Data plane', def: 'The proxies that sit on the request path and actually move, encrypt and observe every packet or request.' },
      { term: 'Control plane', def: 'The service that configures the proxies: it watches Kubernetes, issues certificates and pushes routes and policies (istiod in Istio).' },
      { term: 'Sidecar', def: 'A proxy container injected into every Pod, which intercepts the Pod\'s inbound and outbound traffic.' },
      { term: 'ztunnel / waypoint', def: 'Istio ambient mode: ztunnel is a per-node L4 proxy for mTLS; a waypoint is an optional Envoy that adds L7 features for a namespace or service.' },
      { term: 'mTLS', def: 'Mutual TLS: both client and server present certificates, so the call is encrypted and each side knows who the other is.' },
      { term: 'SPIFFE ID', def: 'A standard workload identity URI such as <code>spiffe://td/ns/shop/sa/orders</code>, carried in the certificate.' },
      { term: 'Outlier detection', def: 'Passive health checking: the proxy ejects an endpoint from the load-balancing pool after consecutive errors.' },
      { term: 'GAMMA', def: 'The Kubernetes Gateway API initiative for service mesh: HTTPRoutes attached to a Service configure east-west traffic.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Separate data plane and control plane</b>: proxies on the path, configuration and identity pushed from a central API',
      '<b>Identity per workload</b> (service account → SPIFFE ID) with short-lived, automatically rotated certificates',
      '<b>Secure by default</b>: STRICT mTLS and a default-deny authorization policy, with explicit allows per caller',
      '<b>One owner per network concern</b>: retries and timeouts live in the mesh <i>or</i> the app, never both blindly',
      '<b>Declarative traffic policy</b> (weights, timeouts, outlier detection) reviewed and deployed like code (GitOps)',
      '<b>Uniform telemetry</b>: golden metrics for every hop, while apps still propagate trace headers'
    ],
    nonFunctional: [
      'Added latency per hop ≤ <b>1 ms p50 / 3 ms p99</b> (target; measure with your payloads)',
      'Mesh overhead ≤ <b>10–15% of cluster CPU and memory</b> (rule of thumb)',
      '<b>100%</b> of in-mesh service-to-service traffic encrypted, measured by the proxies\' connection security metric',
      'Config propagation to all proxies in <b>seconds</b>, with an alert on stale proxies',
      'Mesh upgrade with <b>zero dropped requests</b> using canary control-plane revisions',
      'Control-plane outage does not stop traffic: proxies keep the last known config'
    ],
    outOfScope: [
      '<b>Mesh as a hammer</b>: installing Istio for three services because "microservices need a mesh"',
      '<b>PERMISSIVE forever</b>: migration mode left on, so plaintext calls still succeed and mTLS is optional',
      '<b>Double retries</b>: app retries 3× and mesh retries 3× on the same call, 9 attempts on a sick service',
      '<b>Mesh replaces app code</b>: assuming tracing works without the app forwarding trace headers',
      '<b>Big-bang upgrades</b>: upgrading the control plane and every proxy at once, with no revision canary'
    ]
  },

  calculator: {
    inputs: [
      { id: 'pods', label: 'Pods in the mesh', min: 10, max: 20000, value: 2000, log: true, fmt: 'num' },
      { id: 'nodes', label: 'Kubernetes nodes', min: 2, max: 2000, value: 100, log: true, fmt: 'num' },
      { id: 'mem', label: 'Memory per sidecar', min: 20, max: 500, step: 5, value: 80, unit: 'MiB' },
      { id: 'cpu', label: 'CPU per sidecar (average use)', min: 10, max: 1000, step: 10, value: 100, unit: 'm' },
      { id: 'hops', label: 'Service hops per user request', min: 1, max: 20, value: 5 },
      { id: 'lat', label: 'Added latency per proxy pass (p50)', min: 0.05, max: 3, step: 0.05, value: 0.4, unit: 'ms' }
    ],
    outputs: [
      { label: 'Sidecar fleet memory', f: (v) => calc(v).memGiB.toFixed(1) + ' GiB' },
      { label: 'Sidecar fleet CPU', f: (v) => calc(v).cores.toFixed(1) + ' cores' },
      { label: 'Added latency per user request: p50 ≈ hops × 2 × per-pass, p99 ≈ 3× that', f: (v) => { const c = calc(v); return c.p50.toFixed(1) + ' ms p50 · ≈ ' + c.p99.toFixed(1) + ' ms p99'; } },
      { label: 'Sidecar overhead cost per month (estimate)', f: (v) => '$' + SD.fmt.num(Math.round(calc(v).cost)) },
      { label: 'Ambient instead: ztunnel per node + waypoints for 25% of traffic', f: (v) => { const c = calc(v); return c.ambMem.toFixed(1) + ' GiB · ' + c.ambCores.toFixed(1) + ' cores · $' + SD.fmt.num(Math.round(c.ambCost)); } },
      { label: 'Ambient saving vs sidecars (resources) · added p50', f: (v) => { const c = calc(v); return Math.round(100 * (1 - c.ambCost / Math.max(c.cost, 1e-9))) + '% · ≈ ' + c.ambP50.toFixed(1) + ' ms'; } }
    ],
    note: 'Sidecar model: every Pod pays its proxy\'s memory and CPU, and every hop crosses <b>two</b> proxies. Istio\'s 1.24 docs measured about <b>0.20 vCPU and 60 MB per sidecar at 1,000 req/s</b> and about 0.06 vCPU for ztunnel; memory grows with how much config each proxy holds, so scope it with the <code>Sidecar</code> resource or discovery selectors. Ambient model: <em>estimate</em> of 40 MiB and 60 m per node for ztunnel, plus waypoints sized at a share of the sidecar fleet for the 25% of traffic that needs L7. The p99 multiplier, ambient latency factor (0.4×) and prices ($3.5 per GiB-month, $25 per core-month) are <em>rules of thumb</em>; benchmark your own payloads.'
  },

  api: [
    { m: 'YAML', p: 'PeerAuthentication (mesh-wide STRICT)', d: 'In the root namespace: <code>mtls.mode: STRICT</code>. Start in <b>PERMISSIVE</b> during migration, watch the connection security metric until plaintext is zero, then flip.' },
    { m: 'POLICY', p: 'AuthorizationPolicy per service', d: 'Default deny, then ALLOW rules by <b>source principal</b> (SPIFFE ID), method and path: "only <code>sa/orders</code> may POST <code>/charges</code>".' },
    { m: 'YAML', p: 'HTTPRoute (GAMMA) / VirtualService', d: 'Weighted backends for canaries, request timeout, retries with a per-try timeout. HTTPRoute attaches to a <b>Service</b> as its parentRef for east-west traffic.' },
    { m: 'YAML', p: 'DestinationRule', d: 'Subsets (v1, v2), connection pool limits and <b>outlierDetection</b> (eject after N consecutive 5xx for a base ejection time).' },
    { m: 'ADR', p: 'ADR: mesh adoption and data-plane mode', d: 'Why a mesh (or not), sidecar vs ambient vs eBPF, who owns it, upgrade cadence, and the <b>retry ownership rule</b> (mesh or app, per route).' },
    { m: 'SLO', p: 'Mesh platform SLO', d: 'Added p99 per hop, config propagation time, certificate rotation success, and control-plane availability, with alerts.' }
  ],
  dataModel: [
    { name: 'workload_identity', store: 'Mesh CA / certificates', fields: [['spiffe_id', 'text', 'pk'], ['namespace', 'text', 'idx'], ['service_account', 'text'], ['cert_serial', 'text'], ['not_after', 'timestamptz', 'idx'], ['trust_domain', 'text']], note: 'Certificates are short-lived (Istio defaults to 24 h) and rotated by the proxy agent. Identity comes from the Kubernetes service account, not the IP address.' },
    { name: 'route_policy', store: 'Git → Kubernetes CRDs', fields: [['service', 'text', 'pk'], ['owner_team', 'text'], ['weights', 'jsonb'], ['timeout_ms', 'int'], ['retry_owner', 'enum(app,mesh)'], ['mesh_attempts', 'int'], ['outlier_5xx', 'int'], ['allowed_principals', 'text[]']], note: 'The architect\'s artefact: one row per service, rendered into HTTPRoute, DestinationRule and AuthorizationPolicy by CI, so nobody hand-edits YAML in prod.' },
    { name: 'hop_metrics', store: 'Prometheus', fields: [['ts', 'timestamp', 'pk'], ['source_workload', 'text', 'idx'], ['destination_workload', 'text', 'idx'], ['response_code', 'int'], ['connection_security_policy', 'text'], ['latency_bucket', 'histogram']], note: 'Golden metrics per edge (Istio: <code>istio_requests_total</code>, <code>istio_request_<wbr>duration_<wbr>milliseconds</code>). The security label proves mTLS coverage.' }
  ],

  architecture: {
    title: 'Sidecar mesh: data plane on the path, control plane beside it',
    nodes: [
      { id: 'client', label: 'Users', sub: 'web · mobile', kind: 'client', wide: [90, 50], tall: [70, 0], tip: 'External traffic enters through the ingress gateway, which is itself an Envoy managed by the mesh.' },
      { id: 'gw', label: 'Ingress gateway', sub: 'Envoy · TLS edge', kind: 'edge', wide: [280, 50], tall: [210, 0], tip: 'North-south entry. Configured with Gateway API Gateway + HTTPRoute. Hands traffic into the mesh with mTLS.' },
      { id: 'cp', label: 'istiod', sub: 'control plane · xDS', kind: 'policy', wide: [470, 50], tall: [350, 105], tip: 'Watches Kubernetes, translates routes and policies into Envoy config and pushes it over xDS. Not on the request path: if it dies, proxies keep their last config.' },
      { id: 'ca', label: 'Mesh CA', sub: 'SPIFFE certs · 24 h', kind: 'policy', wide: [680, 50], tall: [350, 210], tip: 'Signs short-lived workload certificates whose SAN is a SPIFFE ID derived from the service account. Can be backed by an external CA.' },
      { id: 'obs', label: 'Telemetry', sub: 'Prometheus · traces', kind: 'store', wide: [880, 50], tall: [350, 0], tip: 'Proxies emit golden metrics and spans for every hop. Apps must still forward trace headers or spans will not join into one trace.' },
      { id: 'a', label: 'Frontend', sub: 'app container', kind: 'service', wide: [90, 170], tall: [70, 105], tip: 'The app calls http://orders. It has no TLS code and no retry loop for mesh-owned routes.' },
      { id: 'pa', label: 'Sidecar A', sub: 'Envoy · outbound', kind: 'compute', wide: [280, 170], tall: [210, 105], tip: 'Intercepts the call (iptables or CNI redirect), picks an endpoint, applies timeout and retry policy, and opens an mTLS connection.' },
      { id: 'pb', label: 'Sidecar B', sub: 'Envoy · in + out', kind: 'compute', wide: [470, 170], tall: [210, 210], tip: 'Terminates mTLS, checks the AuthorizationPolicy against the caller\'s SPIFFE ID, then forwards to the app on localhost.' },
      { id: 'b', label: 'Orders', sub: 'app container', kind: 'service', wide: [660, 170], tall: [70, 210], tip: 'Business logic only. It forwards traceparent / x-b3 headers on its outbound call to Payments.' },
      { id: 'pol', label: 'AuthorizationPolicy', sub: 'allow sa/orders only', kind: 'policy', wide: [880, 170], tall: [350, 315], tip: 'Default deny for payments; only the orders service account may POST /charges. Enforced by the server-side proxy.' },
      { id: 'pc', label: 'Sidecar C', sub: 'Envoy · 90/10 split', kind: 'compute', wide: [470, 290], tall: [210, 315], tip: 'Sidecar B\'s outbound config does the weighted split; drawn here as the payments-side proxy for clarity. Outlier detection ejects bad endpoints.' },
      { id: 'c1', label: 'Payments v1', sub: 'stable · 90%', kind: 'service', wide: [660, 290], tall: [70, 420], tip: 'Stable version, receives 90% of traffic.' },
      { id: 'c2', label: 'Payments v2', sub: 'canary · 10%', kind: 'service', wide: [660, 400], tall: [350, 420], tip: 'Canary version. If its error rate rises, shift the weight back to 0 with one config change.' }
    ],
    edges: [
      { from: 'client', to: 'gw' },
      { from: 'gw', to: 'pa' },
      { from: 'pa', to: 'a', bidi: true },
      { from: 'pa', to: 'pb', label: 'mTLS' },
      { from: 'pb', to: 'b', bidi: true },
      { from: 'pb', to: 'pc', label: 'mTLS' },
      { from: 'pc', to: 'c1' },
      { from: 'pc', to: 'c2' },
      { from: 'cp', to: 'pa', dashed: true, label: 'xDS' },
      { from: 'cp', to: 'pb', dashed: true },
      { from: 'cp', to: 'pc', dashed: true, bend: 0.35 },
      { from: 'ca', to: 'cp', dashed: true },
      { from: 'cp', to: 'pol', dashed: true, bend: -0.2 },
      { from: 'pa', to: 'obs', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'mtls', title: 'Identity and an mTLS call', tone: 'info',
      steps: [
        { text: 'When a Pod starts, its proxy agent asks the <b>mesh CA</b> for a certificate, proving who it is with the Pod\'s service-account token. It receives a short-lived cert whose SPIFFE ID ends in <code>ns/shop/sa/orders</code>.', flow: ['ca>cp', 'cp>pb'], badges: { pb: 'cert 24 h' } },
        { text: 'istiod pushes routes, endpoints and policies to every proxy over <b>xDS</b>. The control plane is <b>not</b> on the request path.', flow: [['cp>pa', 'cp>pb', 'cp>pc']], badges: { cp: 'xDS push' } },
        { text: 'A user request enters at the gateway. Frontend calls <code>http://orders</code> in plain HTTP on localhost; <b>Sidecar A</b> intercepts it.', flow: ['client>gw', 'gw>pa', 'pa>a', 'a>pa'] },
        { text: 'Sidecar A opens <b>mutual TLS</b> to Sidecar B. Both sides verify certificates; B now knows the caller is <code>sa/frontend</code>, not just an IP.', flow: ['pa>pb'], ok: ['pa', 'pb'], badges: { pb: ['mTLS ✓ sa/frontend', 'ok'] } },
        { text: 'B forwards to Orders on localhost. Both proxies emit the same <b>golden metrics</b> (rate, errors, duration) for this edge.', flow: ['pb>b', 'pa>obs'], ok: ['b'], badges: { obs: 'req · 5xx · p99' }, tone: 'ok' }
      ]
    },
    {
      id: 'canary', title: 'Canary 90/10 with outlier detection', tone: 'ok',
      steps: [
        { text: 'A route change sets Payments to <b>90% v1 / 10% v2</b>. No redeploy: istiod pushes the new weights within seconds.', flow: ['cp>pc'], badges: { pc: '90 / 10' } },
        { text: 'Orders calls Payments. The proxy picks a backend <b>per request</b> by weight, so about one call in ten reaches v2.', flow: ['b>pb', 'pb>pc', ['pc>c1', 'pc>c2']], badges: { c2: '10%' } },
        { text: 'One v2 Pod starts returning 503s. After 5 consecutive errors, <b>outlier detection</b> ejects that endpoint for 30 s; traffic flows to its healthy peers.', nodes: ['c2'], warn: ['c2'], badges: { c2: ['1 pod ejected', 'warn'] } },
        { text: 'The canary\'s error rate is still above the SLO, so the rollout tool (Argo Rollouts, Flagger) sets the weight back to <b>100 / 0</b>. Rollback is a config push, measured in seconds.', flow: ['cp>pc', 'pc>c1'], ok: ['c1'], badges: { pc: ['100 / 0', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'double', title: 'Double retries: app and mesh both retry', tone: 'err',
      steps: [
        { text: 'Payments slows down and fails 50% of calls. Orders\' code retries <b>3 attempts</b> with Resilience4j.', flow: ['b>pb', 'pb>pc', 'pc>c1'], warn: ['c1'], badges: { c1: ['50% 5xx', 'warn'] } },
        { text: 'The mesh route <i>also</i> retries 3 attempts on 5xx. Each app attempt becomes up to 3 proxy attempts: <b>3 × 3 = 9 calls</b> per request.', flow: [['pc>c1', 'pc>c1', 'pc>c1'], ['pc>c1', 'pc>c1', 'pc>c1']], err: ['c1'], badges: { c1: ['9× load', 'err'], pb: ['retry ×3', 'warn'], b: ['retry ×3', 'warn'] } },
        { text: 'The ingress gateway has a retry policy too. Load on Payments is now well past its capacity and it fails <b>everything</b>, a classic retry storm.', nodes: ['gw', 'c1', 'c2'], err: ['c1', 'c2'], warn: ['gw'], badges: { gw: ['retry ×2', 'warn'] }, tone: 'err' },
        { text: 'Fix: <b>one owner per route</b>. Mesh retries 2 attempts with a per-try timeout and a retry budget; the app sets <code>maxAttempts: 1</code>. Outlier detection removes bad Pods instead of retrying into them.', flow: ['pb>pc', 'pc>c1'], ok: ['c1', 'pb'], badges: { pb: ['mesh owns retries', 'ok'], b: ['app: 1 attempt', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'authz', title: 'Unauthorized call blocked', tone: 'warn',
      steps: [
        { text: 'A compromised Pod in another namespace tries <code>POST /charges</code> on Payments. With <b>PERMISSIVE</b> mTLS and no policy, plaintext is accepted: the call would succeed.', flow: ['a>pa', 'pa>pc'], warn: ['pc'], badges: { pc: ['PERMISSIVE', 'warn'] }, labels: { a: { label: 'Rogue pod', sub: 'ns/batch' } } },
        { text: 'The platform turns on <b>STRICT</b> mTLS mesh-wide. Plaintext connections are now refused at the handshake.', flow: ['cp>pc'], badges: { pc: ['STRICT', 'ok'] }, labels: { a: { label: 'Rogue pod', sub: 'ns/batch' } } },
        { text: 'An attacker using an in-mesh workload still has a valid identity. mTLS alone authenticates, it does not <b>authorize</b>. The <b>AuthorizationPolicy</b> allows only <code>sa/orders</code>.', flow: ['cp>pol', 'pa>pc'], err: ['a'], badges: { pc: ['403 RBAC denied', 'err'] }, labels: { a: { label: 'Rogue pod', sub: 'sa/batch-job' } } },
        { text: 'The denial shows up as a 403 with the source principal in access logs and metrics. That is the audit trail the security team asked for.', flow: ['pa>obs'], ok: ['pol', 'obs'], badges: { obs: ['denied: sa/batch-job', 'ok'] }, tone: 'ok', labels: { a: { label: 'Rogue pod', sub: 'sa/batch-job' } } }
      ]
    },
    {
      id: 'scale', title: 'At scale: config push and upgrade blast radius', tone: 'warn',
      steps: [
        { text: 'The mesh now has <b>tens of thousands of Pods</b>. Every Service change makes istiod push config to every proxy that might call it.', flow: [['cp>pa', 'cp>pb', 'cp>pc']], warn: ['cp'], badges: { cp: ['push storm', 'warn'] } },
        { text: 'Each sidecar holds endpoints for the whole mesh, so memory per proxy grows with cluster size. <b>Scope</b> it with the <code>Sidecar</code> resource or discovery selectors so each proxy only learns what it calls.', nodes: ['pa', 'pb'], warn: ['pa', 'pb'], badges: { pa: ['config 200 MB?', 'warn'] } },
        { text: 'Upgrading the mesh touches <b>every call path</b>. Run a new control-plane <b>revision</b> side by side and move namespaces to it gradually; sidecars only upgrade when Pods restart.', nodes: ['cp'], badges: { cp: ['rev 1-24 + 1-25', 'info'] } },
        { text: 'Ambient mode removes the restart: ztunnel upgrades per node, waypoints per namespace. The blast radius moves from "every Pod" to "every Pod on this node", so roll nodes slowly.', nodes: ['pa', 'pb', 'pc'], ok: ['pa', 'pb', 'pc'], labels: { pa: { label: 'ztunnel node 1', sub: 'L4 · mTLS' }, pb: { label: 'Waypoint', sub: 'L7 for orders' }, pc: { label: 'ztunnel node 2', sub: 'L4 · mTLS' } }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Scenario: <b>300 services, 3,000 Pods on 150 nodes</b>, 5 hops per user request, a security mandate for encryption in transit. Numbers are an <em>illustrative model</em> built on Istio\'s published per-proxy costs; the directions are real.',
    controls: [
      { id: 'mesh', label: 'Data plane', type: 'seg', value: 'sidecar', options: [
        { v: 'none', l: 'No mesh (libraries)' }, { v: 'sidecar', l: 'Sidecar mesh' }, { v: 'ambient', l: 'Ambient (ztunnel + waypoint)' }, { v: 'ebpf', l: 'eBPF (Cilium)' }] },
      { id: 'mtls', label: 'mTLS mode', type: 'seg', value: 'permissive', options: [
        { v: 'permissive', l: 'PERMISSIVE' }, { v: 'strict', l: 'STRICT' }] },
      { id: 'retry', label: 'Who retries', type: 'seg', value: 'both', options: [
        { v: 'app', l: 'App only' }, { v: 'mesh', l: 'Mesh only' }, { v: 'both', l: 'Both (3 × 3)' }] },
      { id: 'l7', label: 'L7 features needed', type: 'seg', value: 'split', options: [
        { v: 'l4', l: 'mTLS only (L4)' }, { v: 'split', l: '+ canary split, retries' }, { v: 'full', l: '+ path authz, header routing' }] }
    ],
    evaluate(s) {
      const PODS = 3000, NODES = 150, HOPS = 5;
      const none = s.mesh === 'none', side = s.mesh === 'sidecar', amb = s.mesh === 'ambient', ebpf = s.mesh === 'ebpf';
      const needL7 = s.l7 !== 'l4';
      // resources (GiB, cores)
      let mem = 0, cpu = 0;
      if (side) { mem = PODS * 80 / 1024; cpu = PODS * 0.1; }
      if (amb) { mem = NODES * 40 / 1024 + (needL7 ? (s.l7 === 'full' ? 60 : 30) * 0.12 : 0); cpu = NODES * 0.06 + (needL7 ? (s.l7 === 'full' ? 60 : 30) * 0.25 : 0); }
      if (ebpf) { mem = NODES * 60 / 1024 + (needL7 ? NODES * 80 / 1024 : 0); cpu = NODES * 0.05 + (needL7 ? NODES * 0.1 : 0); }
      const cost = mem * 3.5 + cpu * 25;
      // latency per user request (ms, p50)
      let lat = 0;
      if (side) lat = HOPS * 2 * 0.4;
      if (amb) lat = HOPS * 2 * 0.15 + (needL7 ? HOPS * 0.4 : 0);
      if (ebpf) lat = HOPS * 0.1 + (needL7 ? HOPS * 2 * 0.3 : 0);
      if (none) lat = 0;
      // security
      let sec, secS;
      if (none) { sec = s.mtls === 'strict' ? 'library TLS where teams added it' : 'mostly plaintext'; secS = s.mtls === 'strict' ? 0.35 : 0.15; }
      else if (s.mtls === 'permissive') { sec = 'mTLS optional: plaintext accepted'; secS = 0.4; }
      else if (ebpf && !needL7) { sec = 'encrypted (WireGuard/IPsec or mTLS), L3/L4 policy'; secS = 0.7; }
      else { sec = 'STRICT mTLS + identity-based authz'; secS = s.l7 === 'full' ? 0.95 : 0.85; }
      // retries
      const att = s.retry === 'both' ? 9 : 3;
      const retryV = s.retry === 'both' ? '9 attempts worst case' : s.retry === 'mesh' && none ? 'no mesh: falls back to app' : '3 attempts, one owner';
      const retryS = s.retry === 'both' ? 0.1 : 0.85;
      // ops
      const ops = none ? 'libraries per language' : side ? 'high: injection, restarts to upgrade' : amb ? 'medium: node DaemonSet + waypoints' : 'medium: kernel and CNI coupling';
      const opsS = none ? (s.l7 === 'l4' ? 0.6 : 0.3) : side ? 0.3 : amb ? 0.6 : 0.5;
      const l7ok = none ? 'per-language code' : s.l7 === 'l4' ? 'not needed' : amb ? 'via waypoint' : ebpf ? 'via per-node Envoy' : 'native in sidecar';
      const metrics = [
        { k: 'Security', v: sec, s: secS },
        { k: 'Added latency (5 hops, p50)', v: none ? '≈ 0 ms' : '≈ ' + lat.toFixed(1) + ' ms', s: lat <= 1 ? 0.9 : lat <= 3 ? 0.7 : lat <= 5 ? 0.45 : 0.2 },
        { k: 'Resource cost', v: none ? 'none (in-process)' : mem.toFixed(0) + ' GiB · ' + cpu.toFixed(0) + ' cores · $' + SD.fmt.num(Math.round(cost)) + '/mo', s: none ? 0.95 : cost < 1000 ? 0.85 : cost < 5000 ? 0.6 : 0.25 },
        { k: 'Ops complexity', v: ops, s: opsS },
        { k: 'Retry amplification', v: retryV, s: retryS, hint: att + '× on a failing service' },
        { k: 'L7 features', v: l7ok, s: none ? 0.3 : s.l7 === 'l4' ? 0.8 : side ? 0.9 : 0.7 }
      ];
      const notes = [];
      if (side) notes.push('3,000 sidecars × ~80 MiB ≈ <b>' + mem.toFixed(0) + ' GiB</b> of RAM that does no business work. Istio measured ~0.20 vCPU and 60 MB per sidecar at 1,000 req/s; idle sidecars use far less CPU but still hold config in memory.');
      if (amb) notes.push('ztunnel runs once per node (150 instances, not 3,000). ' + (needL7 ? 'L7 features need a <b>waypoint</b>, which adds one extra Envoy hop for those services.' : 'With L4 only, no waypoint is deployed.'));
      if (ebpf) notes.push('eBPF handles L3/L4 in the kernel; L7 work (retries, HTTP routing) still goes to an <b>Envoy per node</b>. Cilium\'s mutual authentication differs from per-connection mTLS; check it meets your compliance wording.');
      if (s.mtls === 'permissive' && !none) notes.push('PERMISSIVE accepts plaintext <i>and</i> mTLS. It is a migration mode: watch the connection-security metric reach 100% mTLS, then flip to STRICT.');
      if (s.retry === 'both') notes.push('App 3 attempts × mesh 3 attempts = <b>9 calls</b> on a failing service per request. Pick one owner: disable app retries for mesh-owned routes, or set mesh <code>retries.attempts: 0</code>.');
      if (none && s.l7 !== 'l4') notes.push('Without a mesh, canaries and retries live in each language\'s library and your deploy tool. Fine for one language; painful for five.');
      let verdict;
      if (s.retry === 'both') verdict = '❌ <b>Retry amplification:</b> app and mesh both retry, so a sick dependency gets up to 9× load. Fix ownership before anything else.';
      else if (none && s.l7 === 'l4' && s.mtls === 'permissive') verdict = '⚠ <b>Cheap but open:</b> no mesh and no enforced encryption. Acceptable only for a small system with no in-transit mandate.';
      else if (none) verdict = '👍 <b>Libraries can work</b> for a few services in one language; with 300 services the mandate will be hard to prove.';
      else if (s.mtls === 'permissive') verdict = '⚠ <b>You pay for a mesh but plaintext still works.</b> Finish the migration: flip to STRICT and add AuthorizationPolicies.';
      else if (side && s.l7 === 'l4') verdict = '⚠ <b>Overpaying:</b> sidecars on every Pod just for mTLS. Ambient or eBPF gives L4 mTLS at a fraction of the memory.';
      else if (amb) verdict = '✅ <b>Strong default for 2025+:</b> STRICT mTLS everywhere from per-node ztunnels, waypoints only where L7 is needed, one retry owner.';
      else if (side) verdict = '👍 <b>Battle-tested and full-featured,</b> at the highest memory and upgrade cost. Right when most services need L7 policy.';
      else verdict = '👍 <b>Lean L4 with eBPF.</b> Good if you already run Cilium as CNI; verify L7 needs and the authentication model.';
      const lbl = none ? {
        pa: { label: 'HTTP client lib', sub: 'in-process' }, pb: { label: 'HTTP client lib', sub: 'in-process' }, pc: { label: 'HTTP client lib', sub: 'in-process' }
      } : amb ? {
        pa: { label: 'ztunnel node 1', sub: 'L4 · HBONE mTLS' }, pb: { label: needL7 ? 'Waypoint (Envoy)' : 'ztunnel node 2', sub: needL7 ? 'L7 for payments' : 'L4 · HBONE mTLS' }, pc: { label: 'ztunnel node 3', sub: 'L4 · HBONE mTLS' }
      } : ebpf ? {
        pa: { label: 'eBPF (kernel)', sub: 'L3/L4 policy' }, pb: { label: needL7 ? 'Envoy per node' : 'eBPF (kernel)', sub: needL7 ? 'L7 routing' : 'L3/L4 policy' }, pc: { label: 'eBPF (kernel)', sub: 'L3/L4 policy' }
      } : {
        pa: { label: 'Sidecar A', sub: 'Envoy · outbound' }, pb: { label: 'Sidecar B', sub: 'Envoy · in + out' }, pc: { label: 'Sidecar C', sub: s.l7 === 'l4' ? 'Envoy · L4 only' : 'Envoy · 90/10 split' }
      };
      lbl.cp = none ? { label: 'Shared libraries', sub: 'per language' } : { label: ebpf ? 'Cilium agent' : 'istiod', sub: 'control plane · ' + s.mtls };
      return {
        metrics, verdict, notes,
        labels: lbl,
        hide: (none ? ['ca', 'pol', 'gw'] : []).concat(s.l7 === 'l4' ? ['c2'] : []),
        err: s.retry === 'both' ? ['c1'] : [],
        warn: s.mtls === 'permissive' && !none ? ['pb'] : [],
        ok: s.mtls === 'strict' && !none ? ['pb', 'pol'] : [],
        badges: { c1: [s.retry === 'both' ? '9× on failure' : '3× max', s.retry === 'both' ? 'err' : 'ok'], pb: [none ? 'plaintext?' : s.mtls, s.mtls === 'strict' && !none ? 'ok' : 'warn'] },
        flow: none ? ['a>pa', 'pa>pb', 'pb>b', 'b>pb', 'pb>pc', 'pc>c1'] : ['client>gw', 'gw>pa', 'pa>a', 'a>pa', 'pa>pb', 'pb>b', 'b>pb', 'pb>pc', s.l7 === 'l4' ? 'pc>c1' : ['pc>c1', 'pc>c2']]
      };
    }
  },

  widget: {
    title: 'A request through three services, with and without a mesh',
    caption: 'Requests flow Frontend → Orders → Payments. Switch the data plane between <b>none</b>, <b>sidecar</b> and <b>ambient</b> to see where proxies sit and what each pass adds. Toggle <b>STRICT mTLS</b> and an <b>AuthorizationPolicy</b>, then fire calls from a plaintext legacy Pod and from an in-mesh <code>sa/reports</code>. Drag the <b>canary weight</b>, make Payments flaky, and compare retries in the app, the mesh, or both.'
  },

  realWorld: {
    intro: 'The mesh grew out of one company\'s proxy, got its name from a startup, and is now moving away from the sidecar. Every card links to its source.',
    timeline: [
      { when: '2016', who: 'Lyft', title: 'Envoy open-sourced', text: 'Lyft built Envoy, led by Matt Klein, to make the network transparent to applications while it moved off a monolith. CNCF\'s journey report dates the open-source release to <b>September 2016</b>; CNCF accepted it as a hosted project in September 2017.', src: 0 },
      { when: '2017', who: 'Buoyant · William Morgan', title: '"What\'s a service mesh?"', text: 'Buoyant, makers of Linkerd (the project that coined the term), defined the service mesh as a dedicated infrastructure layer for making service-to-service communication safe, fast and reliable. The post was republished on the CNCF blog in April 2017.', src: 1 },
      { when: '2017', who: 'Google, IBM, Lyft', title: 'Istio launched', text: 'Istio launched in <b>May 2017</b> as a control plane for Envoy sidecars, adding mTLS, policy and telemetry. The project marked its seventh birthday in May 2024.', src: 2 },
      { when: '2019', who: 'Airbnb', title: 'AirMesh on Istio', text: 'After running its own Smartstack discovery system, Airbnb invested in 2019 in a service mesh called <b>AirMesh</b>, built on Istio, and later wrote about reducing Istio\'s config propagation delay.', src: 3 },
      { when: '2021', who: 'CNCF', title: 'Linkerd graduates first', text: 'On <b>28 July 2021</b> Linkerd became the first service mesh to graduate in the CNCF. The announcement lists production users including Expedia, JPMC, Microsoft and Nordstrom.', src: 4 },
      { when: '2021 · 2022', who: 'Cilium / Isovalent', title: 'Sidecar-free eBPF mesh', text: 'Cilium announced a beta of <b>Cilium Service Mesh</b> in December 2021: L3/L4 in eBPF, with L7 falling back to an Envoy per node. It became stable in <b>Cilium 1.12</b> (July 2022), offering sidecar or sidecar-less modes.', src: 5 },
      { when: '2022', who: 'Istio', title: 'Ambient mesh introduced', text: 'Istio announced <b>ambient mesh</b>: a shared per-node <b>ztunnel</b> for L4 mTLS and optional <b>waypoint</b> proxies for L7, so users can forgo sidecars and get fewer, more predictable resources.', src: 6 },
      { when: '2023', who: 'CNCF', title: 'Istio graduates', text: 'Istio graduated in the CNCF on <b>12 July 2023</b>, joining Envoy, Kubernetes and Prometheus at the top maturity level.', src: 7 },
      { when: '2024', who: 'Kubernetes SIG Network', title: 'Gateway API for mesh (GAMMA) GA', text: 'Gateway API <b>v1.1</b> (May 2024) moved service-mesh support to the Standard channel: an HTTPRoute can use a <b>Service</b> as its parentRef to configure east-west traffic, with no new resources.', src: 8 },
      { when: '2024', who: 'Istio', title: 'Ambient mode GA in 1.24', text: 'In November 2024 Istio 1.24 marked ztunnel, waypoints and the ambient APIs <b>Stable</b>. The maintainers say sidecar mode remains supported. The 1.22 beta post said ambient cut memory and CPU overhead by <b>over 90% in many cases</b>.', src: 9 },
      { when: '2025', who: 'Airbnb', title: 'Seamless Istio upgrades at scale', text: 'Airbnb described upgrading Istio across <b>tens of thousands of Pods</b> on dozens of clusters using side-by-side control-plane revisions and gradual rollout, and said it plans to explore ambient mode.', src: 10 }
    ],
    lessons: [
      'The proxy (Envoy) came first; the mesh is the <b>control plane</b> that makes a fleet of proxies manageable.',
      'Sidecars made adoption easy and operations expensive; the industry is moving to <b>per-node L4 plus optional L7</b>.',
      'Upgrades are the long-term cost: plan for <b>revisioned, gradual</b> control-plane rollouts from day one.',
      'Standard APIs (Gateway API / GAMMA) reduce lock-in between Istio, Linkerd and Cilium.'
    ],
    sources: [
      { title: 'Envoy Project Journey Report', url: 'https://www.cncf.io/cncf-envoy-project-journey/', pub: 'CNCF, 2019' },
      { title: 'What\'s a service mesh? And why do I need one?', url: 'https://www.cncf.io/blog/2017/04/26/service-mesh-critical-component-cloud-native-stack/', pub: 'William Morgan (Buoyant), CNCF blog, April 2017' },
      { title: 'Happy 7th Birthday, Istio!', url: 'https://cncf.io/blog/2024/05/24/happy-7th-birthday-istio', pub: 'Lin Sun for the Istio Steering Committee, CNCF blog, May 2024' },
      { title: 'Improving Istio Propagation Delay', url: 'https://airbnb.tech/?p=284', pub: 'The Airbnb Tech Blog' },
      { title: 'Announcing Linkerd\'s Graduation', url: 'https://linkerd.io/2021/07/28/announcing-cncf-graduation/', pub: 'Linkerd blog, July 2021' },
      { title: 'Cilium 1.12 GA: Cilium Service Mesh and other major new features', url: 'https://www.cncf.io/blog/2022/07/20/cilium-1-12-ga-cilium-service-mesh-and-other-major-new-features-for-enterprise-kubernetes/', pub: 'CNCF blog, July 2022' },
      { title: 'Introducing Ambient Mesh', url: 'https://istio.io/latest/blog/2022/introducing-ambient-mesh/', pub: 'Istio blog, September 2022' },
      { title: 'Istio has graduated within the CNCF', url: 'https://istio.io/latest/blog/2023/istio-graduates-within-cncf/', pub: 'Craig Box, Istio blog, July 2023' },
      { title: 'Gateway API v1.1: Service mesh, GRPCRoute, and a whole lot more', url: 'https://kubernetes.io/blog/2024/05/09/gateway-api-v1-1/', pub: 'Kubernetes blog, May 2024' },
      { title: 'Fast, Secure, and Simple: Istio\'s Ambient Mode Reaches General Availability in v1.24', url: 'https://istio.io/blog/2024/ambient-reaches-ga/', pub: 'Istio blog, November 2024' },
      { title: 'Seamless Istio Upgrades at Scale', url: 'https://airbnb.tech/uncategorized/seamless-istio-upgrades-at-scale/', pub: 'The Airbnb Tech Blog, 2025' },
      { title: 'Performance and Scalability', url: 'https://istio.io/docs/ops/performance-and-scalability', pub: 'Istio documentation' },
      { title: 'Say goodbye to your sidecars: Istio\'s ambient mode reaches Beta in v1.22', url: 'https://istio.io/latest/blog/2024/ambient-reaches-beta/', pub: 'Istio blog, 2024' },
      { title: 'Gateway API for Service Mesh (GAMMA)', url: 'https://gateway-api.sigs.k8s.io/docs/mesh/', pub: 'Kubernetes SIG Network' },
      { title: 'Cilium Service Mesh: everything you need to know', url: 'https://isovalent.com/blog/post/cilium-service-mesh/', pub: 'Isovalent blog' },
      { title: 'Envoy Proxy', url: 'https://www.envoyproxy.io/', pub: 'envoyproxy.io' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Mesh or libraries', '<b>Libraries</b> (Resilience4j, gRPC interceptors, Spring Cloud): no extra hop, debuggable in-process', '<b>Mesh</b>: one policy for every language, enforced outside the app', 'Libraries for a few services in one language; mesh when many teams, many languages, or a hard mTLS mandate.'],
      ['Data-plane mode', '<b>Sidecar</b>: per-Pod isolation, full L7 everywhere, battle-tested', '<b>Ambient</b> (ztunnel + waypoint) or <b>eBPF</b>: per-node cost, no Pod restarts', 'Ambient/eBPF for mTLS-first adoption and big fleets; sidecar when nearly every service needs L7 policy or you need per-Pod tenancy isolation.'],
      ['Istio vs Linkerd', '<b>Istio</b>: Envoy, widest feature set, ambient mode', '<b>Linkerd</b>: Rust micro-proxy, fewer knobs, simpler operations', 'Linkerd when "mTLS + golden metrics + retries" is the whole list; Istio when you need rich L7, multi-cluster or VM support.'],
      ['Retry owner', '<b>Mesh</b>: uniform, config-only, per-try timeouts', '<b>App</b>: knows idempotency and business context', 'Mesh for idempotent reads and connection errors; app for writes with idempotency keys. Never both on the same call.'],
      ['mTLS rollout', '<b>PERMISSIVE</b> first: nothing breaks', '<b>STRICT</b> immediately: secure from day one', 'PERMISSIVE per namespace during migration with a deadline, STRICT as soon as the plaintext metric reads zero.'],
      ['Config API', '<b>Istio CRDs</b> (VirtualService, DestinationRule): every feature', '<b>Gateway API / GAMMA</b> HTTPRoute: portable', 'Gateway API for new routes; vendor CRDs only for features it lacks yet (outlier detection, some retry settings).']
    ]
  },
  failures: [
    { f: 'Double retries (app + mesh + gateway)', detect: 'Upstream request rate a multiple of user rate; <code>x-envoy-<wbr>attempt-count</code> > 1 alongside app retry metrics', fix: 'One retry owner per route; app <code>maxAttempts: 1</code> for mesh-owned routes; mesh retry budget and per-try timeout.' },
    { f: 'PERMISSIVE left on forever', detect: 'Connection security metric still shows plaintext; no STRICT PeerAuthentication in root namespace', fix: 'Dashboard plaintext edges per namespace, set a deadline, flip to STRICT, alert on regression.' },
    { f: 'Sidecar memory bloat at scale', detect: 'Proxy RSS grows with cluster size; OOMKilled istio-proxy containers', fix: 'Scope config with the <code>Sidecar</code> resource or discovery selectors; consider ambient mode.' },
    { f: 'Startup / shutdown races', detect: 'App fails its first calls on boot; Jobs never finish because the sidecar keeps running', fix: 'Native sidecars (Kubernetes 1.29+ <code>restartPolicy: Always</code> init containers) or <code>holdApplication<wbr>UntilProxyStarts</code>; ambient avoids it.' },
    { f: 'Broken traces despite the mesh', detect: 'Each hop appears as a separate one-span trace', fix: 'Apps must copy trace headers (traceparent or x-b3-*) from inbound to outbound calls; use OpenTelemetry or Micrometer Tracing auto-instrumentation.' },
    { f: 'Upgrade breaks every call path', detect: 'Errors across all services right after a control-plane or proxy upgrade', fix: 'Revision-based canary upgrades, namespace by namespace; keep proxy and control-plane versions within the supported skew.' },
    { f: 'Control plane overload / stale config', detect: 'istiod push latency and rejected configs rise; proxies route to deleted endpoints', fix: 'Scale istiod, reduce churn, scope config, alert on push time and proxy convergence.' }
  ],

  interview: [
    { q: 'What is a service mesh, and what are the data plane and control plane?', a: 'A <b>dedicated infrastructure layer</b> for service-to-service traffic. The <b>data plane</b> is the set of proxies on the request path (Envoy sidecars, Linkerd2-proxy, ztunnel, waypoints) that encrypt, route, retry and measure every call. The <b>control plane</b> (istiod, Linkerd control plane) watches the platform, issues workload certificates and pushes config to the proxies via APIs such as xDS. Key property: the control plane is <b>not</b> on the request path, so if it fails, traffic keeps flowing on the last config.', lvl: 'core' },
    { q: 'Does mTLS in a mesh give you zero trust?', a: 'It gives you two of the pieces: <b>encryption in transit</b> and <b>authenticated workload identity</b> (a SPIFFE ID in a short-lived certificate). It does <b>not</b> authorize anything: an attacker who compromises an in-mesh workload has a valid identity. You also need <b>AuthorizationPolicies</b> (default deny, allow by principal, method and path), STRICT mode so plaintext is refused, and end-user auth (JWT) at the edge. Common misreading: "mTLS on = secure".', fu: 'How do you migrate from PERMISSIVE to STRICT safely?', lvl: 'core' },
    { q: 'Sidecar, ambient or eBPF: how do they differ?', a: '<b>Sidecar</b>: an Envoy per Pod; full L7 everywhere, per-Pod isolation, but memory on every Pod, two proxy passes per hop, and Pod restarts to upgrade. <b>Istio ambient</b> (GA in 1.24, Nov 2024): a per-node <b>ztunnel</b> does L4 mTLS (HBONE tunnels); an optional <b>waypoint</b> Envoy per namespace or service adds L7. <b>eBPF (Cilium)</b>: L3/L4 policy in the kernel, with an Envoy per node for L7. Choose by how much traffic needs L7 and how much you care about per-Pod cost and upgrade friction.', lvl: 'core' },
    { q: 'Where should retries live: the app or the mesh?', a: 'In <b>one</b> place per call. Retries multiply: 3 app attempts × 3 mesh attempts = 9 calls on a failing service, more with a gateway retry. Rule of thumb: the <b>mesh owns</b> retries for idempotent reads and connection-level failures (connect-failure, reset, 503 with no response), with a per-try timeout; the <b>app owns</b> retries for writes, because only it knows the idempotency key. Turn the other side off explicitly, e.g. Resilience4j <code>maxAttempts: 1</code>.', fu: 'What is x-envoy-attempt-count used for?', lvl: 'core' },
    { q: 'How does a mesh do a canary release?', a: 'The route has weighted backends (HTTPRoute <code>backendRefs</code> weights or VirtualService weights), e.g. 90/10. The client-side proxy chooses per request, so the split is by <b>requests</b>, not by Pods, and is independent of replica counts. A controller (Argo Rollouts, Flagger) shifts weights based on golden metrics and rolls back by setting weight 0. Header-based routing lets testers reach v2 at 0% public weight.', lvl: 'core' },
    { q: 'What is outlier detection and how does it relate to circuit breaking?', a: '<b>Outlier detection</b> is passive health checking: after N consecutive 5xx (or gateway errors) an endpoint is <b>ejected</b> from the load-balancing pool for a base ejection time that grows on repeat, capped by <code>maxEjectionPercent</code>. Envoy\'s "circuit breaking" is different: <b>connection-pool limits</b> (max connections, pending requests) that fail fast when exceeded. Neither is the same as an app-level breaker that knows business fallbacks.', lvl: 'deep' },
    { q: 'If the mesh gives tracing for free, why do apps still need code?', a: 'The proxies create a span per hop, but they cannot know that the <b>outbound</b> call Orders makes to Payments belongs to the <b>inbound</b> request it is serving. The app must copy trace context (<code>traceparent</code> or <code>x-b3-*</code>, plus <code>x-request-id</code>) from inbound to outbound requests. Instrumentation libraries (OpenTelemetry, Micrometer Tracing in Spring Boot 3) do it automatically if you use their clients.', lvl: 'core' },
    { q: 'What does a mesh cost? How would you size it?', a: 'Four costs: <b>latency</b> (two proxy passes per hop in sidecar mode; often sub-millisecond each at p50, more at p99), <b>resources</b> (Istio measured ~0.20 vCPU and 60 MB per sidecar at 1,000 req/s; memory grows with config size), <b>operations</b> (a tier-0 system with its own upgrades, CRDs and on-call) and <b>upgrade blast radius</b>. I size it with pods × per-proxy memory and CPU, compare to per-node ambient, and benchmark p99 with real payloads before committing.', lvl: 'deep' },
    { q: 'When would you NOT use a service mesh?', a: 'Few services or one language (libraries are cheaper and easier to debug); no platform team to own upgrades; latency budgets where a millisecond matters; workloads the mesh handles poorly (heavy UDP, some stateful protocols). Also when the actual need is <b>north-south</b> routing or auth: an API gateway or ingress solves that. Say: "I start from the requirement (mTLS mandate, multi-language policy, canaries) and adopt the smallest data plane that meets it."', lvl: 'core' },
    { q: 'How do you upgrade a mesh across hundreds of services safely?', a: 'Run the new control plane as a <b>revision</b> alongside the old one, label one low-risk namespace to the new revision, restart its Pods (sidecar mode) and watch golden metrics, then move namespaces in waves. Keep proxy versions within the supported skew, and keep a rollback path (relabel and restart). Ambient mode changes the unit to nodes (ztunnel) and namespaces (waypoints). Airbnb described this revision-based approach for tens of thousands of Pods.', lvl: 'deep' },
    { q: 'What is Gateway API / GAMMA and why should an architect care?', a: 'Gateway API is the Kubernetes successor to Ingress, with role-oriented resources (GatewayClass, Gateway, HTTPRoute). <b>GAMMA</b> extends it to mesh traffic: an HTTPRoute whose <code>parentRef</code> is a <b>Service</b> configures east-west routing; it went GA in v1.1 (May 2024). Writing routes against a standard API reduces lock-in to one mesh\'s CRDs and lets the same skills cover ingress and mesh.', lvl: 'deep' },
    { q: 'You must convince leadership to adopt (or not adopt) a mesh. How?', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> 120 services in four languages; an audit required encryption in transit within two quarters. <b>T:</b> recommend an approach with cost and risk. <b>A:</b> compared libraries (four implementations, ~9 months) with Istio ambient (L4 mTLS without restarts, waypoints only for 15 services needing canaries); ran a two-week pilot on two namespaces measuring added p99 (+0.6 ms) and per-node memory; wrote an ADR naming the platform team as owner, a retry-ownership rule and a revisioned upgrade plan. <b>R:</b> 100% mTLS in 10 weeks, verified by the connection-security metric; double-retry incidents dropped because ownership was explicit.', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Istio: STRICT mTLS mesh-wide + default-deny AuthorizationPolicy', lang: 'yaml',
      code: `# Mesh-wide: refuse plaintext between workloads
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system        # root namespace = mesh-wide
spec:
  mtls:
    mode: STRICT
---
# Payments: an ALLOW policy denies everything it does not match
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: payments-allow-orders
  namespace: shop
spec:
  selector:
    matchLabels:
      app: payments
  action: ALLOW
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/shop/sa/orders"]
    to:
    - operation:
        methods: ["POST"]
        paths: ["/charges", "/charges/*"]`,
      note: 'Principals come from the caller\'s mTLS certificate, so this only works with mTLS on; a plaintext caller has no principal and is denied. Path rules need L7: in ambient mode they require a <b>waypoint</b> for payments (ztunnel enforces only L4 rules).'
    },
    {
      title: 'Canary 90/10 with timeout, retries and outlier detection', lang: 'yaml',
      code: `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata: { name: payments, namespace: shop }
spec:
  hosts: [payments]
  http:
  - timeout: 2s                       # whole request, all attempts
    retries:
      attempts: 2                     # mesh owns retries for this route
      perTryTimeout: 600ms
      retryOn: connect-failure,refused-stream,reset,unavailable,503
    route:
    - destination: { host: payments, subset: v1 }
      weight: 90
    - destination: { host: payments, subset: v2 }
      weight: 10
---
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata: { name: payments, namespace: shop }
spec:
  host: payments
  trafficPolicy:
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
  subsets:
  - { name: v1, labels: { version: v1 } }
  - { name: v2, labels: { version: v2 } }`,
      note: 'Portable alternative (GAMMA): an <code>HTTPRoute</code> with <code>parentRefs: [{group: "", kind: Service, name: payments}]</code>, two <code>backendRefs</code> with weights 90/10 pointing at <code>payments-v1</code> / <code>payments-v2</code> Services, and <code>timeouts.request: 2s</code>. HTTPRoute retries are still experimental in Gateway API, so many teams keep retries in vendor CRDs for now.'
    },
    {
      title: 'Spring Boot 3: let the mesh retry, keep trace headers flowing', lang: 'yaml',
      code: `# application.yml (Spring Boot 3.x, Resilience4j 2.x, Micrometer Tracing)
resilience4j:
  retry:
    instances:
      payments:
        max-attempts: 1               # mesh owns retries for this route: no app retry
  timelimiter:
    instances:
      payments:
        timeout-duration: 2500ms      # slightly above the mesh's 2s route timeout
  circuitbreaker:
    instances:
      payments:                       # app breaker kept: it owns the business fallback
        failure-rate-threshold: 50
        minimum-number-of-calls: 20
        wait-duration-in-open-state: 10s

management:
  tracing:
    sampling:
      probability: 0.1
    propagation:
      type: w3c,b3                    # read and write traceparent and x-b3-* headers
# Build clients from the auto-configured RestClient.Builder / WebClient.Builder,
# so Micrometer copies trace context from the inbound request to outbound calls.`,
      note: 'Requires <code>micrometer-tracing-<wbr>bridge-otel</code> (or <code>-brave</code>) on the classpath. A <code>new RestTemplate()</code> created by hand is <b>not</b> instrumented and breaks the trace at that hop. The app timeout sits just above the mesh timeout so the mesh decides first.'
    }
  ],

  related: ['zero-trust', 'container-patterns', 'resiliency-patterns', 'observability-pillars', 'deployment-strategies', 'sd:api-gateway']
});
})();
