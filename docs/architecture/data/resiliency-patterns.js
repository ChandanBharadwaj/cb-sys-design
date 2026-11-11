(function () {
/* expected calls on the failing dependency and end-to-end success, for the calculator */
function calc(v) {
  const q = v.p / 100;
  let f = q, load = 1;
  for (let k = 0; k < v.L; k++) {
    load *= f >= 1 ? v.r + 1 : (1 - Math.pow(f, v.r + 1)) / (1 - f);
    f = Math.pow(f, v.r + 1);
  }
  return { load, ok: 1 - f };
}

SD.register({
  slug: 'resiliency-patterns',
  domain: 6,
  title: 'Resiliency Patterns',
  examples: 'Resilience4j, Hystrix, AWS Builders’ Library',
  tagline: 'Timeouts, retries with <b>backoff and jitter</b>, circuit breakers, bulkheads and load shedding: the small, boring mechanisms that stop <b>one slow dependency</b> from becoming a site-wide outage.',
  tldr: {
    problem: 'Every service call can hang, fail or slow down. Naive clients wait forever and retry at every layer, so one sick dependency drains threads everywhere and gets hit even harder while it is down.',
    idea: '<b>Bound everything</b>: a timeout (and a propagated deadline) on every call, <b>few retries at one layer</b> with capped exponential backoff and <b>full jitter</b>, a <b>retry budget</b>, a <b>circuit breaker</b> to fail fast, <b>bulkheads</b> to isolate pools, and a planned <b>fallback</b>.',
    insight: 'Retries are a <i>load multiplier</i>, not a free fix: 3 attempts at each of 5 layers is 3<sup>5</sup> = 243 calls on the bottom dependency. Resilience is mostly about <b>not adding load to something that is already failing</b>.',
    numbers: [
      { v: '243×', l: 'load on a database from 3 tries at each of 5 layers (AWS Builders’ Library)' },
      { v: '≈ 1.1×', l: 'traffic growth with a 10% per-client retry budget, vs ≈ 3× without (Google SRE book)' },
      { v: '50%', l: 'Resilience4j default failure-rate threshold to open a breaker' }
    ]
  },

  intro: {
    what: 'Resiliency patterns are small pieces of client and server logic that decide <b>what happens when a call to another service goes wrong</b>. How long do we wait? Do we try again, and when? When do we stop calling a broken service altogether? What do we show the user instead? Together they keep a system <b>partly working</b> when one of its parts is not.',
    analogy: {
      icon: '⚡',
      title: 'The fuse box and the redial button',
      text: 'When an appliance shorts, a <b>fuse</b> (circuit breaker) cuts that one circuit so the rest of the house keeps its lights. Separate circuits for the kitchen and the bedrooms are <b>bulkheads</b>. When a phone line is busy, you do not redial every second with the whole office; you wait a little longer each time and at a slightly random moment (<b>backoff with jitter</b>). Where it breaks down: a house fuse needs a person to reset it, while a software breaker tests the line by itself and closes again.'
    },
    problem: 'Your checkout calls a payment provider. One afternoon the provider gets slow: calls that took 200 ms now hang for 30 s. Every checkout thread is stuck waiting, the gateway and the checkout service both retry three times, and the provider now gets <b>9× its normal traffic</b> just as it is struggling. Even product pages fail, because they share the same thread pool. The question these patterns answer is: <b>how do we stop one failing dependency from taking everything down, and let it recover?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Call it, and retry if it fails',
        text: 'The obvious code: call the payment API with the HTTP client\'s default timeout and, on any error, <b>retry straight away</b> up to three times. Every layer (gateway, checkout) does the same. On a good day it hides the occasional blip.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'tap Pay', kind: 'client', at: [70, 0] },
            { id: 'gw', label: 'Gateway', sub: 'retry ×3', kind: 'edge', at: [210, 0] },
            { id: 'app', label: 'Checkout', sub: 'retry ×3', kind: 'service', at: [210, 110] },
            { id: 'reco', label: 'Recommender', sub: 'same pool', kind: 'service', at: [350, 110] },
            { id: 'pay', label: 'Payment API', sub: '200 ms', kind: 'external', at: [210, 220] }
          ],
          edges: [{ from: 'u', to: 'gw' }, { from: 'gw', to: 'app' }, { from: 'app', to: 'pay' }, { from: 'app', to: 'reco' }],
          flow: ['u>gw', 'gw>app', 'app>pay'],
          ok: ['pay']
        }
      },
      {
        stage: 'breaks',
        title: 'The dependency slows down and everything piles on',
        text: 'The payment API starts to hang. Threads wait for the long default timeout, then retry, and the gateway retries the whole thing too: <b>3 × 3 = 9 calls</b> per click. The shared thread pool fills, so recommendations and product pages fail as well. The provider never gets the breathing room to recover.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'spinning…', kind: 'client', at: [70, 0] },
            { id: 'gw', label: 'Gateway', sub: 'retry ×3', kind: 'edge', at: [210, 0] },
            { id: 'app', label: 'Checkout', sub: 'all threads stuck', kind: 'service', at: [210, 110] },
            { id: 'reco', label: 'Recommender', sub: 'no threads left', kind: 'service', at: [350, 110] },
            { id: 'pay', label: 'Payment API', sub: 'hangs 30 s', kind: 'external', at: [210, 220] }
          ],
          edges: [{ from: 'u', to: 'gw' }, { from: 'gw', to: 'app' }, { from: 'app', to: 'pay' }, { from: 'app', to: 'reco' }],
          flow: [['u>gw', 'u>gw'], ['gw>app', 'gw>app'], ['app>pay', 'app>pay', 'app>pay']],
          err: ['pay', 'app', 'reco'],
          warn: ['gw'],
          badges: { pay: ['9× load', 'err'], app: ['pool full', 'err'], u: ['timeout', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Bound the wait, stop calling, degrade gracefully',
        text: 'Each call gets a <b>short timeout</b>. Only checkout retries, with growing random waits. A <b>circuit breaker</b> notices that most payment calls fail and stops sending them for a while. Payments get <b>their own small pool</b>, so recommendations keep working. The user sees "order received, confirming payment" instead of a spinner.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'order received', kind: 'client', at: [70, 0] },
            { id: 'gw', label: 'Gateway', sub: 'no retries', kind: 'edge', at: [210, 0] },
            { id: 'app', label: 'Checkout', sub: 'timeout 800 ms', kind: 'service', at: [210, 110] },
            { id: 'reco', label: 'Recommender', sub: 'own pool', kind: 'service', at: [350, 110] },
            { id: 'pay', label: 'Payment API', sub: 'recovering', kind: 'external', at: [210, 220] },
            { id: 'fb', label: 'Pay-later queue', sub: 'fallback', kind: 'queue', at: [70, 220] }
          ],
          edges: [{ from: 'u', to: 'gw' }, { from: 'gw', to: 'app' }, { from: 'app', to: 'pay', dashed: true }, { from: 'app', to: 'reco' }, { from: 'app', to: 'fb' }],
          flow: ['u>gw', 'gw>app', ['app>fb', 'app>reco']],
          ok: ['app', 'reco', 'fb'],
          warn: ['pay'],
          badges: { pay: ['breaker open', 'warn'], fb: ['queued', 'ok'] }
        }
      }
    ],
    usedBy: ['Netflix (Hystrix)', 'Amazon / AWS SDKs', 'Google (SRE practices)', 'Resilience4j in Spring Cloud', 'Envoy, Istio and Linkerd', 'Stripe-style idempotency keys'],
    whenToUse: [
      'Any <b>synchronous call over a network</b>: another service, a database, a third-party API',
      'A request fans out to several dependencies and some of them are <b>optional</b> for the user',
      'Clients you do not control (mobile apps, partners) will retry, so you must <b>survive retry storms</b>'
    ],
    whenNot: [
      'Work that can be made <b>asynchronous</b>: put it on a queue with its own retry and DLQ instead (see <a href="../../system-design/systems/message-queue.html">Message Queue</a>)',
      'Calls inside one process: an in-memory call does not need a breaker, it needs a bug fix',
      'As a replacement for capacity: patterns buy time and limit blast radius, they do not make an undersized service big enough: add capacity or shed load first'
    ],
    glossary: [
      { term: 'Timeout / deadline', def: 'A timeout bounds one call; a deadline is an absolute "answer by" time passed down so every hop knows how much time is left.' },
      { term: 'Exponential backoff', def: 'Waiting longer before each retry, typically base × 2^attempt, up to a cap.' },
      { term: 'Jitter', def: 'Randomising the wait so that clients which failed together do not all retry at the same instant.' },
      { term: 'Retry budget', def: 'A limit on retries as a share of traffic (for example 10%), usually kept in a token bucket per client.' },
      { term: 'Circuit breaker', def: 'A client-side switch that stops calling a dependency after too many failures, then lets a few test calls through to see if it has recovered.' },
      { term: 'Bulkhead', def: 'A separate, bounded pool of threads or permits per dependency, so one slow dependency cannot use up every worker.' },
      { term: 'Load shedding', def: 'Deliberately rejecting some requests early and cheaply when overloaded, so the rest still finish on time.' },
      { term: 'Metastable failure', def: 'A bad state that keeps itself going (often through retries) even after the original trigger has gone away.' }
    ]
  },

  requirements: {
    functional: [
      'Every remote call has a <b>timeout</b>, and the caller\'s <b>deadline propagates</b> to every hop',
      'Retry only <b>transient</b> errors on <b>idempotent</b> operations, at <b>one layer</b>, with capped exponential backoff and jitter',
      'Bound retries with a <b>retry budget</b> (a share of traffic), not just a per-request count',
      '<b>Fail fast</b> when a dependency is known to be failing (circuit breaker), and probe it to recover',
      '<b>Isolate</b> resources per dependency (bulkheads), so a slow one cannot consume every worker',
      '<b>Degrade, don\'t die</b>: decide each dependency\'s fallback before the outage, and shed load early and cheaply'
    ],
    nonFunctional: [
      'Core flow stays available when an <b>optional</b> dependency is fully down (target: no user-visible error)',
      'p99 latency is bounded by the deadline (e.g. ≤ 2 s end to end) even when a dependency hangs',
      'Retry load on a failing dependency ≤ <b>1.1×</b> per caller (10% budget)',
      'Automatic recovery within <b>breaker wait + probe time</b> after the dependency heals, with no manual action',
      'Blast radius: a failing dependency affects only the features that need it',
      'Every breaker transition, rejected call and fallback is a metric with an alert'
    ],
    outOfScope: [
      '<b>Retries at every layer</b> ("3 tries everywhere" multiplies to 3<sup>depth</sup>)',
      '<b>No timeout</b>, or the library default, which for many HTTP clients is unbounded or very long',
      'Retrying a <b>non-idempotent write</b> (a charge, an order) without an idempotency key',
      'A <b>fallback that calls the same failing dependency</b>, or one that was never tested',
      'A circuit breaker <b>shared across shards or hosts</b>, so one bad node blocks all of them'
    ]
  },

  calculator: {
    inputs: [
      { id: 'p', label: 'Dependency failure rate per attempt', min: 0, max: 100, value: 60, unit: '%' },
      { id: 'r', label: 'Retries per layer (attempts = retries + 1)', min: 0, max: 5, value: 2 },
      { id: 'L', label: 'Layers that retry (call depth)', min: 1, max: 6, value: 3 },
      { id: 'base', label: 'Base backoff (doubles each retry)', min: 10, max: 1000, step: 10, value: 100, unit: 'ms' },
      { id: 't', label: 'Timeout per attempt', min: 100, max: 10000, step: 100, value: 1000, unit: 'ms' }
    ],
    outputs: [
      { label: 'Worst case: calls on the bottom dependency per user request, (r+1)^L', f: (v) => SD.fmt.num(Math.pow(v.r + 1, v.L)) + '×' },
      { label: 'Expected calls on the dependency at this failure rate', f: (v) => calc(v).load.toFixed(2) + '×' },
      { label: 'Extra load on the failing dependency', fmt: 'pct', f: (v) => calc(v).load - 1 },
      { label: 'End-to-end success probability (independent failures)', fmt: 'pct', f: (v) => calc(v).ok },
      { label: 'Worst-case wait at the top layer: (r+1)·timeout + backoffs', fmt: 'ms', f: (v) => (v.r + 1) * v.t + v.base * (Math.pow(2, v.r) - 1) },
      { label: 'Same stack with a 10% retry budget per layer (cap ≈ 1.1^L)', f: (v) => Math.min(calc(v).load, Math.pow(1.1, v.L)).toFixed(2) + '×' }
    ],
    note: 'Model: only the bottom dependency fails, each attempt independently with probability p. A layer\'s call fails only if all of its r+1 attempts fail, so the failure rate seen by layer k+1 is f<sub>k</sub><sup>r+1</sup>, and expected calls multiply layer by layer: Π (1 − f<sub>k</sub><sup>r+1</sup>)/(1 − f<sub>k</sub>). Real outages are <b>correlated</b> (the dependency is down for everyone), which pushes you toward the worst case. The latency line assumes every layer uses the same timeout, so the top layer gives up while inner layers are still retrying: that <b>orphaned work</b> is why deadlines must propagate. Backoff sum is without jitter or cap; jitter keeps the expected wait at roughly half.'
  },

  api: [
    { m: 'POLICY', p: 'Dependency resilience policy', d: 'One row per dependency: <b>criticality</b> (critical / degradable / optional), timeout, max attempts, retry budget, breaker thresholds, bulkhead size and the <b>fallback</b>. Reviewed like code.' },
    { m: 'YAML', p: 'resilience4j.* in application.yml', d: 'Named instances for <code>circuitbreaker</code>, <code>retry</code>, <code>bulkhead</code> and <code>timelimiter</code>, one per dependency, so tuning needs no code change.' },
    { m: 'HTTP', p: 'Idempotency-Key: &lt;uuid&gt;', d: 'Client generates the key once per logical operation and reuses it on every retry. The server stores <code>key → result</code> and returns the stored result for duplicates.' },
    { m: 'HTTP', p: '503 / 429 + Retry-After', d: 'How a server says "back off". Clients must honour <code>Retry-After</code>, and must not retry 4xx errors other than 408/429.' },
    { m: 'RPC', p: 'grpc-timeout / x-request-deadline', d: 'The remaining deadline travels with the request. Each hop subtracts its own time and refuses work that cannot finish in time.' },
    { m: 'DOC', p: 'Runbook: "breaker open" alert', d: 'Which dependency, what users see in fallback mode, how to check the dependency, and when <b>not</b> to force-close the breaker.' }
  ],
  dataModel: [
    { name: 'dependency_policy', store: 'Config repo / table', fields: [['dependency', 'text', 'pk'], ['criticality', 'enum'], ['timeout_ms', 'int'], ['max_attempts', 'int'], ['retry_budget_pct', 'numeric'], ['breaker_failure_pct', 'int'], ['breaker_min_calls', 'int'], ['open_wait_ms', 'int'], ['bulkhead_max_concurrent', 'int'], ['fallback', 'text']], note: 'The architect\'s artefact. Generated into application.yml or mesh config so the documented policy and the running one cannot drift.' },
    { name: 'idempotency_keys', store: 'Postgres', fields: [['idem_key', 'uuid', 'pk'], ['request_hash', 'bytea'], ['status', 'enum'], ['response', 'jsonb'], ['created_at', 'timestamptz'], ['expires_at', 'timestamptz', 'idx']], note: 'Makes retries of writes safe. A different request body with the same key is rejected (422), not replayed.' },
    { name: 'breaker_events', store: 'Metrics / time series', fields: [['ts', 'timestamp', 'pk'], ['dependency', 'text', 'idx'], ['from_state', 'enum'], ['to_state', 'enum'], ['failure_rate', 'float'], ['slow_call_rate', 'float']], note: 'Resilience4j publishes these via Micrometer. Alert on OPEN, and on a breaker that flaps between states.' }
  ],

  architecture: {
    title: 'Where each resiliency pattern lives',
    nodes: [
      { id: 'users', label: 'Users', sub: 'web · mobile', kind: 'client', wide: [90, 150], tall: [210, 0], tip: 'Clients you do not control. Mobile SDKs retry too, so the server side must be safe against retry storms.' },
      { id: 'gw', label: 'API gateway', sub: 'deadline · shedding', kind: 'edge', wide: [280, 150], tall: [210, 105], tip: 'Sets the end-to-end deadline, applies rate limits and sheds low-priority traffic first when overloaded. Does not retry non-idempotent calls.' },
      { id: 'svc', label: 'Checkout service', sub: 'timeouts · retry', kind: 'service', wide: [480, 150], tall: [210, 210], tip: 'The one layer that retries, with capped exponential backoff, full jitter and a retry budget.' },
      { id: 'inv', label: 'Inventory', sub: 'critical dep', kind: 'service', wide: [480, 40], tall: [70, 210], tip: 'Critical: no fallback, so a short timeout and a fast, clear error are the best we can do.' },
      { id: 'db', label: 'Orders DB', sub: 'idempotency keys', kind: 'store', wide: [480, 260], tall: [350, 210], tip: 'Stores idempotency keys, so a retried "place order" returns the first result instead of creating a second order.' },
      { id: 'bh', label: 'Bulkheads', sub: 'pool per dependency', kind: 'compute', wide: [680, 150], tall: [210, 315], tip: 'A bounded semaphore or thread pool per dependency. When full, extra calls are rejected at once instead of queueing.' },
      { id: 'reco', label: 'Recommendations', sub: 'optional dep', kind: 'service', wide: [680, 40], tall: [70, 315], tip: 'Optional: if it is slow or down, checkout continues without it.' },
      { id: 'fb', label: 'Fallback cache', sub: 'stale but safe', kind: 'cache', wide: [880, 40], tall: [70, 420], tip: 'Last good answer or a static default, served when a bulkhead rejects or a breaker is open.' },
      { id: 'q', label: 'Pay-later queue', sub: 'async retry · DLQ', kind: 'queue', wide: [680, 260], tall: [350, 315], tip: 'Graceful degradation for payments: accept the order and charge later, with the same idempotency key.' },
      { id: 'cb', label: 'Circuit breaker', sub: 'closed · open · half', kind: 'policy', wide: [880, 150], tall: [210, 420], tip: 'Counts outcomes in a sliding window. Opens above the failure-rate or slow-call threshold, rejects calls while open, then lets a few probes through.' },
      { id: 'pay', label: 'Payment provider', sub: 'flaky dependency', kind: 'external', wide: [880, 260], tall: [210, 525], tip: 'Third-party API. It is the one we expect to fail, and the one we must not hammer while it does.' }
    ],
    edges: [
      { from: 'users', to: 'gw', bidi: true },
      { from: 'gw', to: 'svc' },
      { from: 'svc', to: 'inv' },
      { from: 'svc', to: 'db' },
      { from: 'svc', to: 'bh' },
      { from: 'bh', to: 'reco' },
      { from: 'bh', to: 'fb', dashed: true, label: 'fallback' },
      { from: 'bh', to: 'cb' },
      { from: 'cb', to: 'pay' },
      { from: 'svc', to: 'q', dashed: true },
      { from: 'q', to: 'pay' }
    ]
  },

  scenarios: [
    {
      id: 'happy', title: 'Normal call with a deadline', tone: 'info',
      steps: [
        { text: 'The gateway stamps the request with a <b>2 s deadline</b> and forwards it. Every hop can now compute how much time is left.', flow: ['users>gw', 'gw>svc'], badges: { gw: 'deadline 2 s' } },
        { text: 'Checkout writes the client\'s <b>idempotency key</b> first, so any retry of this order maps to the same row.', flow: ['svc>db'], badges: { db: 'key reserved' } },
        { text: 'Inventory answers in 15 ms. The recommendations call goes through its own <b>bulkhead</b> (3 of 10 permits in use).', flow: ['svc>inv', 'svc>bh', 'bh>reco'], badges: { bh: 'reco 3/10' } },
        { text: 'The payment call gets a timeout of <b>min(800 ms, time left)</b>. The breaker is <b>CLOSED</b> and records a success in its sliding window.', flow: ['bh>cb', 'cb>pay'], ok: ['cb', 'pay'], badges: { cb: ['CLOSED', 'ok'], pay: '180 ms' }, tone: 'ok' }
      ]
    },
    {
      id: 'storm', title: 'Retry storm → cascading failure', tone: 'err',
      steps: [
        { text: 'The payment provider slows from 200 ms to 10 s. With no breaker and a long timeout, each call <b>holds a thread</b> for the whole wait.', flow: ['svc>bh', 'bh>cb', 'cb>pay'], warn: ['pay'], badges: { pay: ['10 s', 'warn'] }, labels: { cb: { label: 'No breaker', sub: 'calls pass through' } } },
        { text: 'Checkout retries 3 times, and the gateway retries the whole request 3 times: <b>9 calls per click</b>. Retries arrive in lock-step because nobody adds jitter.', flow: [['users>gw', 'users>gw'], ['gw>svc', 'gw>svc', 'gw>svc'], ['cb>pay', 'cb>pay', 'cb>pay']], err: ['pay'], badges: { pay: ['9× load', 'err'], gw: ['retry ×3', 'warn'] }, labels: { cb: { label: 'No breaker', sub: 'calls pass through' } } },
        { text: 'The <b>shared thread pool</b> fills with calls waiting on payments. Inventory and recommendation calls queue behind them, so pages that never touch payments fail too.', nodes: ['svc', 'inv', 'reco'], err: ['svc', 'reco'], warn: ['inv'], badges: { svc: ['pool 200/200', 'err'], reco: ['starved', 'err'] }, tone: 'err' },
        { text: 'The provider fixes its problem, but it is still receiving 9× traffic and stays overloaded. This is a <b>metastable failure</b>: the retries now sustain the outage that the slowdown started.', nodes: ['pay', 'gw', 'svc'], err: ['pay', 'svc', 'gw'], badges: { pay: ['still down', 'err'] }, tone: 'err' },
        { text: 'The way out is to <b>remove load</b>: turn retries off at the gateway, shed traffic, or open breakers by hand. Then put the patterns in the next scenarios in place so it cannot recur.', nodes: ['gw'], ok: ['gw'], badges: { gw: ['shed + no retry', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'breaker', title: 'Circuit breaker trips and recovers', tone: 'warn',
      steps: [
        { text: 'Payments start failing. After the <b>minimum number of calls</b> (say 20), the breaker sees a failure rate of 70%, above its <b>50% threshold</b>.', flow: ['bh>cb', 'cb>pay'], err: ['pay'], badges: { cb: ['70% fail', 'warn'] } },
        { text: 'The breaker goes <b>OPEN</b>. Calls are rejected in microseconds with <code>CallNotPermittedException</code>, and threads are freed at once.', nodes: ['cb'], err: ['cb'], badges: { cb: ['OPEN', 'err'] }, labels: { cb: { label: 'Circuit breaker', sub: 'OPEN · fast fail' } }, tone: 'warn' },
        { text: 'The fallback runs: the order is accepted and its charge goes to the <b>pay-later queue</b> with the same idempotency key. The user sees "order received, confirming payment".', flow: ['svc>q'], ok: ['q', 'svc'], badges: { q: ['+1 queued', 'ok'], cb: ['OPEN', 'err'] } },
        { text: 'After the <b>open wait</b> (say 10 s) the breaker goes <b>HALF-OPEN</b> and lets a few probe calls through (say 5).', flow: ['bh>cb', 'cb>pay'], warn: ['cb'], badges: { cb: ['HALF-OPEN 5 probes', 'warn'] }, labels: { cb: { label: 'Circuit breaker', sub: 'HALF-OPEN · probing' } } },
        { text: 'The probes succeed, so the breaker <b>CLOSES</b> and traffic resumes. The queue drains the deferred charges at a controlled rate.', flow: ['cb>pay', 'q>pay'], ok: ['cb', 'pay', 'q'], badges: { cb: ['CLOSED', 'ok'], q: 'draining' }, tone: 'ok' }
      ]
    },
    {
      id: 'bulkhead', title: 'Slow optional dependency, bulkhead holds', tone: 'warn',
      steps: [
        { text: 'Recommendations become slow (2 s). Their bulkhead has <b>10 permits</b>, and all 10 are soon taken by slow calls.', flow: ['svc>bh', 'bh>reco'], warn: ['reco'], badges: { bh: ['reco 10/10', 'warn'], reco: ['2 s', 'warn'] } },
        { text: 'The 11th call is <b>rejected immediately</b> (<code>BulkheadFullException</code>) instead of queueing behind the slow ones.', nodes: ['bh'], warn: ['bh'], badges: { bh: ['full → reject', 'warn'] } },
        { text: 'Checkout serves the <b>fallback</b>: yesterday\'s popular items from cache. The page renders on time.', flow: ['bh>fb'], ok: ['fb'], badges: { fb: ['stale list', 'ok'] } },
        { text: 'Payments and inventory use <b>other pools</b>, so checkout is unaffected. The blast radius is one widget on the page.', flow: ['svc>inv', 'bh>cb', 'cb>pay'], ok: ['inv', 'pay', 'svc'], badges: { svc: ['checkout OK', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'overload', title: 'Traffic spike: shed load, keep the core', tone: 'warn',
      steps: [
        { text: 'A flash sale sends <b>4× normal traffic</b>. Queues grow, and every request starts waiting longer than its deadline.', flow: [['users>gw', 'users>gw', 'users>gw'], 'gw>svc'], warn: ['gw', 'svc'], badges: { gw: ['4× traffic', 'warn'] } },
        { text: 'The gateway <b>sheds load</b> early and cheaply: browse and recommendation traffic first, then anything whose deadline has already passed. It returns <b>503 + Retry-After</b>.', nodes: ['gw'], warn: ['gw'], badges: { gw: ['shed 30%', 'warn'], users: ['503 Retry-After', 'warn'] } },
        { text: 'The checkout <b>retry budget</b> (≤ 10% of calls) runs out, so new failures are returned at once instead of being retried. Load on dependencies stays below about 1.1× normal.', nodes: ['svc'], badges: { svc: ['budget 10% used', 'warn'] } },
        { text: 'Accepted checkouts still finish within their deadline. Goodput stays near capacity instead of falling to zero, which is what the <b>AWS load-shedding</b> article is about.', flow: ['gw>svc', 'svc>db', 'svc>bh', 'bh>cb', 'cb>pay'], ok: ['svc', 'db', 'pay'], badges: { svc: ['goodput ≈ capacity', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Scenario: the payment provider fails <b>70% of calls for 60 s</b> (failures hang until the timeout). Checkout sends 50 payment calls/s, and the service has one 200-thread pool. Numbers are an <em>illustrative model</em>, but the directions are real.',
    controls: [
      { id: 'retry', label: 'Retry policy', type: 'seg', value: 'immediate', options: [
        { v: 'none', l: 'No retries' }, { v: 'immediate', l: 'Immediate ×3, every layer' }, { v: 'backoff', l: 'Exp. backoff ×3, every layer' }, { v: 'budget', l: 'Backoff + full jitter + 10% budget' }] },
      { id: 'cb', label: 'Circuit breaker', type: 'seg', value: 'off', options: [
        { v: 'off', l: 'Off' }, { v: 'std', l: 'On: 50% of ≥ 20 calls' }, { v: 'twitchy', l: 'On: 20% of ≥ 5 calls' }] },
      { id: 'bh', label: 'Thread isolation', type: 'seg', value: 'shared', options: [
        { v: 'shared', l: 'One shared pool' }, { v: 'per', l: 'Bulkhead per dependency' }] },
      { id: 't', label: 'Timeout per attempt', type: 'range', min: 100, max: 10000, step: 100, value: 3000, kind: 'ms' },
      { id: 'fb', label: 'Fallback', type: 'seg', value: 'none', options: [
        { v: 'none', l: 'None (500 error)' }, { v: 'msg', l: 'Friendly "try later"' }, { v: 'queue', l: 'Accept order, charge later' }] }
    ],
    evaluate(s) {
      const F = 0.7, L = 3, RPS = 50, POOL = 200, HEAD = 2, HEALTHY_P999 = 450;
      const breaker = s.cb !== 'off';
      const n = s.retry === 'none' ? 1 : 3;
      // expected calls on the failing dependency per user request (independent failures, L retrying layers)
      let mult = 1;
      if (s.retry === 'budget') mult = Math.pow(1.1, L);
      else if (n > 1) { let f = F; for (let k = 0; k < L; k++) { mult *= (1 - Math.pow(f, n)) / (1 - f); f = Math.pow(f, n); } }
      const effMult = breaker ? 0.08 : mult;                          // open breaker: only half-open probes reach the dependency
      const metastable = !breaker && mult > HEAD;                     // retries keep the dependency above its headroom
      const backoffMs = s.retry === 'backoff' || s.retry === 'budget' ? 300 : 0;
      // threads held by calls waiting on payments
      const held = RPS * effMult * s.t / 1000;
      const poolCap = s.bh === 'per' ? 20 : POOL;
      const saturated = held >= poolCap * 0.9;
      const falseTimeouts = s.t < 300 ? 0.15 : s.t < HEALTHY_P999 ? 0.01 : 0.001;
      // success of checkout requests during the outage
      let ok = s.retry === 'none' ? 1 - F : s.retry === 'budget' ? (1 - F) + 0.1 * (1 - F) : 1 - Math.pow(F, n);
      if (metastable) ok = 0.05;
      if (breaker) ok = 0.04;                                         // most calls are rejected while open
      if (saturated && s.bh === 'shared') ok *= 0.5;
      ok *= 1 - falseTimeouts;
      const served = s.fb === 'queue' ? ok + (1 - ok) * 0.95 * (saturated && s.bh === 'shared' ? 0.4 : 1) : ok;   // queued orders are charged after recovery; a saturated pool cannot even run the fallback
      // latency
      let p99 = breaker ? (s.fb === 'queue' ? 40 : 10) : (s.retry === 'budget' ? 2 * s.t + backoffMs : n * s.t + backoffMs);
      if (saturated && !breaker) p99 += 2000;                         // queueing for a thread
      // recovery after the dependency is fixed
      const rec = metastable ? (s.retry === 'immediate' ? 'stuck until load is cut by hand' : 'slow: synchronized waves keep it busy') : s.cb === 'twitchy' ? '≈ 10–15 s, then flaps on noise' : breaker ? '≈ open wait + probes (≈ 10–15 s)' : 'seconds';
      const recS = metastable ? (s.retry === 'immediate' ? 0.05 : 0.2) : s.cb === 'twitchy' ? 0.55 : breaker ? 0.85 : 0.9;
      const blast = saturated && s.bh === 'shared' ? 'whole service (browse fails too)' : saturated ? 'payments only (bulkhead full)' : 'payments only';
      const blastS = saturated && s.bh === 'shared' ? 0.1 : s.bh === 'per' ? 0.9 : 0.6;
      const ux = s.fb === 'queue' ? 'order placed, payment confirming' : s.fb === 'msg' ? 'clear message, user retries later' : p99 > 5000 ? 'long spinner, then 500' : 'error page';
      const uxS = (s.fb === 'queue' ? 0.9 : s.fb === 'msg' ? 0.55 : 0.15) * (p99 > 5000 ? 0.7 : 1);
      const metrics = [
        { k: 'Checkout success (outage)', v: Math.round(served * 100) + '%', s: served, hint: s.fb === 'queue' ? 'incl. charged later' : 'answered with a result' },
        { k: 'p99 latency (outage)', v: SD.fmt.dur(p99), s: p99 <= 1000 ? 0.9 : p99 <= 3000 ? 0.6 : p99 <= 8000 ? 0.3 : 0.08 },
        { k: 'Load on failing dependency', v: breaker ? '≈ probes only' : mult.toFixed(1) + '× (worst ' + (s.retry === 'budget' ? mult.toFixed(1) : Math.pow(n, L)) + '×)', s: breaker ? 0.95 : mult <= 1.4 ? 0.8 : mult <= HEAD ? 0.5 : 0.1, hint: s.retry === 'immediate' ? 'synchronized bursts' : s.retry === 'backoff' ? 'waves' : '' },
        { k: 'Recovery after fix', v: rec, s: recS },
        { k: 'Blast radius', v: blast, s: blastS, hint: Math.round(held) + ' threads waiting' },
        { k: 'User experience', v: ux, s: uxS }
      ];
      const notes = [];
      if (s.retry === 'immediate') notes.push('3 attempts at each of 3 layers is up to <b>27 calls</b> per click, all in the same instant. The AWS Builders\' Library gives the 5-layer version: <b>243×</b>.');
      if (s.retry === 'backoff') notes.push('Backoff without jitter spaces the retries out but keeps them <b>in lock-step</b>: clients that failed together retry together. The widget below shows the spikes.');
      if (s.retry === 'budget') notes.push('Full jitter spreads retries over the whole backoff window, and the budget turns retries off once they exceed 10% of calls. That trades a little success for a dependency that can recover.');
      if (s.cb === 'twitchy') notes.push('20% of 5 calls trips on <b>normal noise</b> (one slow call in five). Expect false trips on healthy days; Resilience4j\'s defaults are a 50% threshold over 100 calls.');
      if (breaker && s.fb === 'none') notes.push('A breaker protects the dependency and your threads, <b>not your success rate</b>: with no fallback, users simply get a faster error.');
      if (s.t >= 5000) notes.push('A ' + SD.fmt.dur(s.t) + ' timeout holds ' + Math.round(RPS * (breaker ? 0.08 : mult) * s.t / 1000) + ' threads on a dead dependency. Set timeouts from the dependency\'s healthy p99.9, not from "what feels safe".');
      if (s.t < HEALTHY_P999) notes.push('The timeout is below the healthy p99.9 (~450 ms here), so <b>' + (falseTimeouts * 100) + '% of calls time out on a good day</b>, and those timeouts become retries.');
      if (s.bh === 'per' && !breaker) notes.push('The bulkhead caps payments at 20 concurrent calls, so browse and inventory keep their threads even though payments are stuck.');
      let verdict;
      if (metastable && s.bh === 'shared') verdict = '❌ <b>Cascading, metastable failure.</b> Retries multiply load on the sick dependency and the shared pool takes the whole service down with it.';
      else if (metastable) verdict = '⚠ <b>Contained but stuck.</b> The bulkhead saves the rest of the service, yet retries keep the dependency overloaded after the trigger is gone.';
      else if (breaker && s.retry === 'budget' && s.bh === 'per' && s.fb === 'queue' && s.t <= 2000 && s.t >= HEALTHY_P999) verdict = '✅ <b>Textbook setup:</b> one retrying layer with jittered backoff and a budget, a breaker, a bulkhead, a tight timeout and a real fallback. Users barely notice the outage.';
      else if (breaker && s.fb === 'queue') verdict = '👍 <b>Good:</b> the breaker sheds load and the fallback keeps orders flowing. Check the timeout and isolation meters for the remaining risk.';
      else if (breaker) verdict = '👍 <b>The dependency is protected and threads are freed,</b> but users still see errors. Add a fallback.';
      else if (saturated) verdict = '⚠ <b>Threads are exhausted.</b> Shorten the timeout, add a breaker or isolate payments in a bulkhead.';
      else verdict = '⚠ <b>Survives, but blindly:</b> every user still waits on a failing dependency. A breaker plus fallback turns waiting into a fast, useful answer.';
      const flow = ['users>gw', 'gw>svc', 'svc>bh', 'bh>cb'].concat(breaker ? (s.fb === 'queue' ? ['svc>q'] : []) : ['cb>pay']);
      return {
        metrics, verdict, notes, flow,
        labels: {
          cb: breaker ? { label: 'Circuit breaker', sub: s.cb === 'std' ? 'OPEN · 50% / 20 calls' : 'OPEN · 20% / 5 calls' } : { label: 'No breaker', sub: 'calls pass through' },
          bh: s.bh === 'per' ? { label: 'Bulkheads', sub: 'pay 20 · reco 10' } : { label: 'Shared pool', sub: '200 threads, all deps' },
          svc: { label: 'Checkout service', sub: { none: 'no retries', immediate: 'retry ×3 now', backoff: 'retry ×3 backoff', budget: 'jitter + 10% budget' }[s.retry] }
        },
        hide: s.fb === 'queue' ? [] : ['q'],
        err: (metastable ? ['pay'] : []).concat(saturated && s.bh === 'shared' ? ['svc', 'inv', 'reco'] : []),
        warn: breaker ? ['cb'] : saturated ? ['bh'] : [],
        ok: s.fb === 'queue' ? ['q'] : [],
        badges: { pay: [breaker ? 'probes' : mult.toFixed(1) + '× load', metastable ? 'err' : 'info'], bh: [Math.round(Math.min(held, poolCap)) + '/' + poolCap, saturated ? 'err' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Breaker state machine and a retry storm, simulated',
    caption: 'Press <b>Run outage</b>. Top: a steady stream of calls to a dependency that goes down for a few seconds, with a real count-based <b>circuit breaker</b> (window of 20, min 10 calls, 50% threshold, 2 s open, 4 probes). Bottom: <b>200 clients fail at the same instant</b> and retry with capped exponential backoff, <code>sleep = min(cap, base·2^attempt)</code> versus <b>full jitter</b>, <code>sleep = random(0, min(cap, base·2^attempt))</code>.'
  },

  realWorld: {
    intro: 'The patterns were named in a book, popularised by Netflix, and refined by Amazon and Google writing about their own outages. Every card links to its source.',
    timeline: [
      { when: '2007 · 2018', who: 'Michael Nygard', title: 'Release It! names the stability patterns', text: 'Nygard\'s book describes <b>Timeouts, Circuit Breaker and Bulkheads</b> as stability patterns, next to anti-patterns such as cascading failures and integration points. The second edition (Pragmatic Bookshelf, 2018) adds cloud-native and chaos-engineering material.', src: 12 },
      { when: '2012', who: 'Netflix', title: 'Hystrix open-sourced', text: 'Hystrix grew out of resilience work the Netflix API team began in 2011: thread-pool or semaphore isolation per dependency, circuit breakers and fallbacks, plus a live dashboard. Netflix reported running <b>tens of billions of thread-isolated and hundreds of billions of semaphore-isolated calls a day</b> through it.', src: 4 },
      { when: '2014', who: 'Martin Fowler', title: 'CircuitBreaker bliki entry', text: 'Fowler\'s short write-up of the pattern (closed, open and half-open, with a reset timeout) became the standard reference people link to in design docs.', src: 11 },
      { when: '2015', who: 'AWS · Marc Brooker', title: 'Exponential Backoff and Jitter', text: 'A simulation of clients contending for one resource compares <b>no jitter, full jitter, equal jitter and decorrelated jitter</b>. Plain exponential backoff did worst, because clients stay clustered. The post was updated in 2023, noting that the approach still underpins how Amazon builds remote client libraries.', src: 0 },
      { when: '2016', who: 'Google SRE book', title: 'Cascading failures and retry budgets', text: 'Chapter 22 says the most common cause of cascading failure is <b>overload</b> and warns that retries amplify it. Chapter 21 combines a per-request cap of <b>3 attempts</b> with a <b>per-client retry budget of 10%</b>, which cuts traffic growth in their example from about 3× to about <b>1.1×</b>.', src: 8 },
      { when: '2018', who: 'Netflix', title: 'Hystrix enters maintenance mode', text: 'The README says Hystrix is no longer in active development and that version <b>1.5.18</b> is stable enough for Netflix\'s existing apps. For new projects Netflix pointed to actively maintained libraries such as <b>Resilience4j</b>.', src: 5 },
      { when: '2019', who: 'AWS Builders’ Library', title: 'Timeouts, retries, shedding, backlogs', text: 'A five-deep call stack with 3 tries per layer makes a struggling database see <b>243×</b> its load. Amazon\'s guidance: retry at <b>a single point</b> in the stack, cap retries with a token bucket, and use jitter. Companion articles cover <b>load shedding</b> and <b>queue backlogs</b> that make recovery slow.', src: 1 },
      { when: '2021', who: 'Bronson et al., HotOS', title: 'Metastable failures', text: 'Bronson, Aghayev, Charapko and Zhu describe failures where a trigger pushes a system into a bad state that a <b>sustaining effect</b>, often retries, keeps going after the trigger is gone. A 2022 OSDI follow-up studied <b>22 such incidents from 11 organizations</b>.', src: 9 },
      { when: '2026', who: 'AWS SDKs', title: 'Retry quota on by default', text: 'AWS announced that all SDKs and the CLI move to standard retry mode with a <b>retry quota</b> (a token bucket that retries spend and successes refill) by default in November 2026. A retry after a transient error now costs <b>14 tokens</b> (up from 5), and one after throttling costs 5.', src: 13 }
    ],
    lessons: [
      'Retries are a <b>load multiplier</b>: allow them at one layer, with a budget, and with jitter.',
      'A timeout without a <b>propagated deadline</b> still leaves inner layers doing work nobody is waiting for.',
      'A circuit breaker protects the dependency and your threads; only a <b>fallback</b> protects the user.',
      'Watch for <b>metastable</b> states: if the system does not recover when the trigger is gone, cut load first and debug second.'
    ],
    sources: [
      { title: 'Exponential Backoff And Jitter', url: 'https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/', pub: 'AWS Architecture Blog, Marc Brooker, 2015 (updated 2023)' },
      { title: 'Timeouts, retries, and backoff with jitter', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/', pub: 'Amazon Builders’ Library, Marc Brooker' },
      { title: 'Using load shedding to avoid overload', url: 'https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/', pub: 'Amazon Builders’ Library, David Yanacek' },
      { title: 'Avoiding insurmountable queue backlogs', url: 'https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/', pub: 'Amazon Builders’ Library, David Yanacek' },
      { title: 'Netflix Releases Hystrix, A Service For Making Apps In The Cloud More Resilient', url: 'https://techcrunch.com/2012/11/26/netflix-releases-hystrix-a-service-for-making-apps-in-the-cloud-more-resilient/', pub: 'TechCrunch, Nov 2012 (quotes the Netflix Tech Blog)' },
      { title: 'Netflix/Hystrix (README: maintenance mode)', url: 'https://github.com/Netflix/Hystrix', pub: 'GitHub, Netflix' },
      { title: 'Resilience4j CircuitBreaker documentation', url: 'https://resilience4j.readme.io/docs/circuitbreaker', pub: 'Resilience4j' },
      { title: 'Chapter 22: Addressing Cascading Failures', url: 'https://sre.google/sre-book/addressing-cascading-failures/', pub: 'Site Reliability Engineering, Google, 2016' },
      { title: 'Chapter 21: Handling Overload', url: 'https://sre.google/sre-book/handling-overload/', pub: 'Site Reliability Engineering, Google, 2016' },
      { title: 'Metastable Failures in Distributed Systems', url: 'https://doi.org/10.1145/3458336.3465286', pub: 'Bronson, Aghayev, Charapko, Zhu, HotOS 2021' },
      { title: 'Metastable Failures in the Wild', url: 'https://www.usenix.org/conference/osdi22/presentation/huang-lexiang', pub: 'Huang et al., OSDI 2022' },
      { title: 'CircuitBreaker', url: 'https://www.martinfowler.com/bliki/CircuitBreaker.html', pub: 'Martin Fowler, 2014' },
      { title: 'Release It!, 2nd Edition', url: 'https://www.oreilly.com/library/view/release-it-2nd/9781680504552/', pub: 'Michael T. Nygard, Pragmatic Bookshelf, 2018' },
      { title: 'Announcing updated retry behavior for AWS SDKs and tools', url: 'https://aws.amazon.com/blogs/developer/announcing-updated-retry-behavior-for-aws-sdks-and-tools/', pub: 'AWS Developer Tools Blog, 2026' },
      { title: 'Metastability and Distributed Systems', url: 'https://brooker.co.za/blog/2021/05/24/metastable/', pub: 'Marc Brooker\'s blog, 2021' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Where to retry', '<b>One layer</b> (closest to the user that knows the op is idempotent)', '<b>Every layer</b>: each hop hides its own blips', 'Almost always one layer. Inner layers fail fast and pass the error up.'],
      ['Backoff', '<b>Full jitter</b>: <code>rand(0, min(cap, b·2^n))</code>, least total work', '<b>Decorrelated / equal jitter</b>: never retries almost instantly', 'Full jitter by default; equal jitter if a near-zero first retry is a problem.'],
      ['Retry limit', '<b>Per-request max attempts</b>: simple, local', '<b>Retry budget / token bucket</b>: bounds load fleet-wide', 'Both: 2–3 attempts per request, plus a ~10% budget per client.'],
      ['Bulkhead type', '<b>Semaphore</b>: cheap, runs on the caller\'s thread', '<b>Thread pool</b>: can abandon a hung call and enforce a timeout', 'Semaphore for non-blocking or virtual-thread code; thread pool for blocking libraries you cannot time out.'],
      ['Breaker window', '<b>Count-based</b> (last N calls)', '<b>Time-based</b> (last N seconds)', 'Time-based for bursty or low traffic; count-based when traffic is steady and high.'],
      ['On overload', '<b>Shed</b> early (503 + Retry-After)', '<b>Queue</b> and serve later', 'Shed for interactive traffic (deadlines pass anyway); queue for async work with its own backlog limits.']
    ]
  },
  failures: [
    { f: 'Retry storm / amplification', detect: 'Dependency QPS far above user QPS; retry metrics per layer; bursts at fixed intervals', fix: 'Retry at one layer, add full jitter, add a retry budget, honour Retry-After.' },
    { f: 'Metastable failure (does not recover)', detect: 'Trigger gone (deploy rolled back, dependency healthy) but errors stay high', fix: 'Cut load (shed, disable retries, open breakers), let queues drain, then restore traffic gradually.' },
    { f: 'Thread-pool exhaustion from one slow dependency', detect: 'Busy threads at max, rising queue time, unrelated endpoints slowing down', fix: 'Per-dependency bulkheads, shorter timeouts, a breaker with a slow-call threshold.' },
    { f: 'Timeouts not nested (orphaned work)', detect: 'Inner services still processing requests whose caller already gave up', fix: 'Propagate deadlines; each hop uses min(own timeout, time left) and drops expired work.' },
    { f: 'Duplicate side effects on retry', detect: 'Double charges or orders with the same client request', fix: 'Idempotency keys with a unique constraint; retry only idempotent operations.' },
    { f: 'Breaker flapping or false trips', detect: 'Many OPEN↔HALF-OPEN transitions; trips at low traffic', fix: 'Raise minimum calls, use a time-based window, separate breakers per shard or host.' },
    { f: 'Fallback that fails too', detect: 'Fallback error rate rises with the primary; fallback never exercised', fix: 'Fallbacks must not call the failing dependency; test them with fault injection and game days.' }
  ],

  interview: [
    { q: 'Why are retries dangerous? Show me the math.', a: '<p>Each retrying layer multiplies the attempts below it. With <code>a</code> attempts per layer and depth <code>d</code>, a fully failing dependency sees <b>a<sup>d</sup></b> calls per user request: 3 attempts at 5 layers is <b>243×</b> (the AWS Builders\' Library example).</p><p>That extra load arrives exactly when the dependency is weakest, so retries can turn a short blip into an outage. Rules: retry at one layer, cap attempts, use a retry budget, and add jitter.</p>', fu: 'What if the failures are independent, like 1% packet loss? (Then a retry is cheap and very effective: success goes from 99% to 99.99%.)', lvl: 'core' },
    { q: 'Explain exponential backoff with jitter. Which jitter would you use?', a: '<p><b>Exponential backoff</b> waits <code>min(cap, base·2^attempt)</code>. On its own, clients that failed together retry together, so you get synchronized spikes.</p><ul><li><b>Full jitter</b>: <code>random(0, min(cap, base·2^attempt))</code></li><li><b>Equal jitter</b>: half fixed, half random</li><li><b>Decorrelated</b>: <code>min(cap, random(base, prev·3))</code></li></ul><p>Brooker\'s 2015 AWS simulation found plain backoff worst, with full and decorrelated jitter close to each other. I default to <b>full jitter</b>.</p>', lvl: 'core' },
    { q: 'Walk me through a circuit breaker\'s states.', a: '<ul><li><b>CLOSED</b>: calls pass; outcomes go into a sliding window (count- or time-based).</li><li>Once the window has at least <i>minimum calls</i> and the <b>failure rate</b> or <b>slow-call rate</b> passes the threshold → <b>OPEN</b>.</li><li><b>OPEN</b>: calls fail immediately (Resilience4j throws <code>CallNotPermittedException</code>) for the wait duration.</li><li><b>HALF-OPEN</b>: a few probe calls are allowed. If they succeed → CLOSED; if they fail → OPEN again.</li></ul><p>Resilience4j defaults: 50% failure threshold, window of 100 calls, minimum 100 calls, 60 s open, 10 calls in half-open.</p>', lvl: 'core' },
    { q: 'How do you choose a timeout value?', a: '<p>From <b>data</b>, not instinct: start from the dependency\'s healthy latency at a high percentile (p99.9) plus some margin, so a good day does not produce timeouts. AWS describes picking an acceptable false-timeout rate and reading the matching percentile.</p><p>Then make it fit the <b>caller\'s deadline</b>: the per-attempt timeout times attempts, plus backoff, must fit inside the time the user will wait. Propagate the remaining deadline so inner hops use <code>min(own, remaining)</code>.</p>', lvl: 'core' },
    { q: 'What is a retry budget and why is it better than "max 3 retries"?', a: '<p>A per-request cap limits one request; it does nothing when <b>every</b> request is failing, so load still triples. A <b>budget</b> limits retries to a share of traffic, for example retries ≤ 10% of requests, usually as a token bucket: successes add a fraction of a token and each retry spends one.</p><p>When the dependency is healthy, nearly every retry is allowed. When it is down, the bucket empties and retries stop. Google\'s SRE book reports the growth falling from about 3× to about 1.1×. AWS SDKs use the same idea as a "retry quota".</p>', lvl: 'deep' },
    { q: 'Thread-pool bulkhead vs semaphore bulkhead?', a: '<p><b>Semaphore</b>: a counter of concurrent calls; the call runs on the caller\'s thread. Cheap, but it cannot interrupt a call that hangs in a library without its own timeout.</p><p><b>Thread pool</b>: a fixed pool and queue per dependency; the caller can stop waiting and move on. It costs context switches and threads. Hystrix defaulted to thread isolation; with virtual threads and non-blocking clients, semaphores plus proper client timeouts are usually enough.</p>', lvl: 'deep' },
    { q: 'How do you make retries of a payment safe?', a: '<p>Use an <b>idempotency key</b>: the client generates a UUID per logical charge and sends it on every attempt. The server inserts it with a unique constraint before doing work. A duplicate returns the stored result; a different body with the same key is rejected.</p><p>Also retry only errors where the outcome is known to be "not done" or the operation is idempotent; an ambiguous timeout on a non-idempotent call needs the key, or a status check, before retrying.</p>', lvl: 'core' },
    { q: 'What is a metastable failure? Give an example.', a: '<p>Bronson et al. (HotOS 2021): a system in a <b>vulnerable</b> state is pushed by a <b>trigger</b> (a load spike, a slow deploy, a cache flush) into a bad state that a <b>sustaining effect</b> keeps going after the trigger is gone.</p><p>Example: a database slows briefly, clients time out and retry, the retries keep it overloaded, more timeouts follow. Fixing the trigger does nothing; you must <b>remove the sustaining load</b> (shed, disable retries, warm caches before admitting traffic).</p>', lvl: 'deep' },
    { q: 'Load shedding vs rate limiting vs backpressure?', a: '<ul><li><b>Rate limiting</b>: a fairness or contract limit per client, enforced even when the server has spare capacity (see the <a href="../../system-design/systems/rate-limiter.html">rate limiter</a> page).</li><li><b>Load shedding</b>: the server rejects work because <i>it</i> is overloaded, cheapest and lowest-priority first, so accepted work still meets its deadline.</li><li><b>Backpressure</b>: the consumer signals the producer to slow down (bounded queues, flow control, 429/503 + Retry-After).</li></ul>', lvl: 'core' },
    { q: 'Design: checkout calls payment, inventory, fraud and recommendations. What policies do you set?', a: '<p>First I classify dependencies: <b>inventory and payment are critical</b>, <b>fraud is degradable</b> (fall back to rules plus manual review for small amounts), and <b>recommendations are optional</b>.</p><ul><li>One deadline from the gateway, e.g. 2 s.</li><li>Checkout is the only layer that retries; payments use an idempotency key.</li><li>A bulkhead per dependency, with a breaker on each.</li><li>Fallbacks: payment → accept and charge later; recommendations → cached list.</li><li>Shed browse traffic before checkout traffic.</li></ul><p>I write this as a policy table and generate config from it.</p>', lvl: 'deep' },
    { q: 'Should resilience live in a library (Resilience4j) or in the service mesh?', a: '<p><b>Mesh</b> (Envoy, Istio, Linkerd): uniform timeouts, retries, outlier detection and retry budgets for every language, changeable without a deploy. But it sees only HTTP status codes; it does not know what is idempotent or what the fallback is.</p><p><b>Library</b>: knows the business semantics, so it can do fallbacks, idempotency and per-operation breakers.</p><p>In practice: the mesh does timeouts and outlier ejection with <b>retries off or budgeted</b>, and the app owns retries and fallbacks, so you never retry in both.</p>', lvl: 'deep' },
    { q: 'Your team wants "retry 3 times everywhere" as a standard. How do you convince them otherwise?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a platform guild proposed a shared HTTP client with 3 retries by default. <b>Task</b>: keep the reliability gain without building in a retry storm.</p><p><b>Action</b>: I put the multiplication on one slide (3 tries × 4 hops = 81 calls when the bottom fails), replayed a past incident in a load test with and without layered retries, and proposed a default of <b>0 retries in shared clients</b>, with retries opt-in at the edge service, full jitter and a 10% budget.</p><p><b>Result</b>: the default shipped, and in the next dependency outage the failing service saw roughly 1.1× load instead of a spike, and recovered on its own.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Spring Boot 3: Resilience4j annotations + RestClient timeouts', lang: 'java',
      code: `// io.github.resilience4j:resilience4j-spring-boot3:2.3.0 + spring-boot-starter-aop
@Service
public class PaymentClient {
  private final RestClient rest;

  public PaymentClient(RestClient.Builder builder) {
    var http = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(300)).build();
    var factory = new JdkClientHttpRequestFactory(http);
    factory.setReadTimeout(Duration.ofMillis(800));       // per-attempt timeout
    this.rest = builder.baseUrl("https://psp.example.com").requestFactory(factory).build();
  }

  // Default aspect order: Retry( CircuitBreaker( Bulkhead( call ) ) )
  @Retry(name = "payments", fallbackMethod = "payLater")  // outermost: fallback after retries
  @CircuitBreaker(name = "payments")
  @Bulkhead(name = "payments")                            // semaphore type by default
  public ChargeResult charge(ChargeRequest req, UUID idemKey) {
    return rest.post().uri("/v1/charges")
        .header("Idempotency-Key", idemKey.toString())    // same key on every retry
        .body(req)
        .retrieve()
        .body(ChargeResult.class);
  }

  // Same parameters + the exception. Runs on failure, breaker OPEN or bulkhead full.
  private ChargeResult payLater(ChargeRequest req, UUID idemKey, Throwable t) {
    deferredCharges.enqueue(req, idemKey);                // drained when the PSP is healthy
    return ChargeResult.pending(idemKey);
  }
}`,
      note: 'Put the fallback on the <b>outermost</b> aspect (Retry). On <code>@CircuitBreaker</code> it would turn every failed attempt into a success, so Retry would never retry. Configure <code>ignore-exceptions</code> so <code>CallNotPermittedException</code> and <code>BulkheadFullException</code> go straight to the fallback instead of being retried.'
    },
    {
      title: 'application.yml (resilience4j-spring-boot3)', lang: 'yaml',
      code: `resilience4j:
  circuitbreaker:
    instances:
      payments:
        sliding-window-type: COUNT_BASED
        sliding-window-size: 50
        minimum-number-of-calls: 20
        failure-rate-threshold: 50          # percent
        slow-call-duration-threshold: 700ms
        slow-call-rate-threshold: 80        # percent of calls slower than above
        wait-duration-in-open-state: 10s
        permitted-number-of-calls-in-half-open-state: 5
        automatic-transition-from-open-to-half-open-enabled: true
        record-exceptions:
          - java.io.IOException
          - org.springframework.web.client.ResourceAccessException
          - org.springframework.web.client.HttpServerErrorException
  retry:
    instances:
      payments:
        max-attempts: 3                     # includes the first call
        wait-duration: 100ms
        enable-exponential-backoff: true
        exponential-backoff-multiplier: 2
        exponential-max-wait-duration: 2s
        enable-randomized-wait: true        # jitter around each interval
        randomized-wait-factor: 0.5
        retry-exceptions:
          - org.springframework.web.client.ResourceAccessException
        ignore-exceptions:
          - io.github.resilience4j.circuitbreaker.CallNotPermittedException
          - io.github.resilience4j.bulkhead.BulkheadFullException
  bulkhead:
    instances:
      payments:
        max-concurrent-calls: 20
        max-wait-duration: 0                # reject at once when full`,
      note: 'Resilience4j\'s randomized wait is <code>interval ± factor·interval</code> (factor 0.5 gives 50–150%), which is close to <b>equal jitter</b>, not full jitter. It has no fleet-wide retry budget, so keep max-attempts low and retry at only one layer.'
    },
    {
      title: 'Python: full-jitter backoff with a token-bucket retry budget', lang: 'python',
      code: `import random, threading, time

class RetryBudget:
    """Retries may use at most ~ratio of successful traffic (plus a small floor)."""
    def __init__(self, ratio=0.1, max_tokens=10.0):
        self.ratio, self.max = ratio, max_tokens
        self.tokens, self.lock = max_tokens, threading.Lock()

    def on_success(self):
        with self.lock:
            self.tokens = min(self.max, self.tokens + self.ratio)

    def try_spend(self) -> bool:
        with self.lock:
            if self.tokens >= 1:
                self.tokens -= 1
                return True
            return False

def call_with_retry(fn, budget, attempts=3, base=0.1, cap=2.0, deadline=None):
    for attempt in range(attempts):
        try:
            result = fn()
            budget.on_success()
            return result
        except TransientError:                     # timeouts, 503, connection reset
            if attempt == attempts - 1 or not budget.try_spend():
                raise                              # budget empty: fail fast
            sleep = random.uniform(0, min(cap, base * 2 ** attempt))   # full jitter
            if deadline and time.monotonic() + sleep >= deadline:
                raise                              # would miss the caller's deadline
            time.sleep(sleep)`,
      note: 'Each success earns 0.1 token and each retry costs 1, so in steady state retries stay below about 10% of successful calls. Share one <code>RetryBudget</code> per dependency per process. <code>TransientError</code> is your own exception class for retryable failures.'
    }
  ],

  related: ['chaos-engineering', 'service-mesh', 'reliability-math', 'slo-error-budgets', 'sd:rate-limiter', 'sd:api-gateway', 'sd:payment-gateway']
});
})();
