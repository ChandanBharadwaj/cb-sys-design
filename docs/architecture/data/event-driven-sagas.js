(function () {
  // One saga step: each attempt fails with p; a share `perm` of failures is a business rejection (no retry).
  // Transient failures are retried up to r times.
  function step(v) {
    const p = v.fail / 100, perm = v.perm / 100, r = Math.round(v.retries);
    const b = p * (1 - perm);                               // transient failure per attempt
    let succ = 0, att = 0;
    for (let k = 0; k <= r; k++) { const reach = Math.pow(b, k); succ += reach * (1 - p); att += reach; }
    return { S: succ, F: 1 - succ, attempts: att, b };
  }
  function saga(v) {
    const n = Math.round(v.steps), s = step(v);
    let comp = 0, failed = 0;
    for (let i = 1; i <= n; i++) { const pf = Math.pow(s.S, i - 1) * s.F; failed += pf; comp += pf * (i - 1); }
    return { n, s, ok: Math.pow(s.S, n), failed, comp };
  }
  const per = (x) => (x >= 100 ? Math.round(x).toLocaleString('en-US') : x >= 1 ? x.toFixed(1) : x.toFixed(2));

  SD.register({
    slug: 'event-driven-sagas',
    domain: 5,
    title: 'Event-Driven Architecture & Sagas',
    examples: 'Temporal, Camunda, outbox',
    tagline: 'Keep an order consistent across Order, Payment, Inventory and Shipping <b>without a distributed transaction</b>: local commits, events published through an <b>outbox</b>, idempotent consumers, and <b>compensations</b> that undo the earlier steps when a later one fails.',
    tldr: {
      problem: 'Each service owns its database, so one business action ("place order") spans several databases. A distributed transaction (2PC/XA) would lock all of them and stall if the coordinator dies; doing the writes one after another with no plan leaves a <b>charged card with no stock</b>.',
      idea: 'Model the action as a <b>saga</b>: a sequence of local transactions, each with a <b>compensating transaction</b>. Each step commits locally and publishes an event (via a <b>transactional outbox</b>); consumers are <b>idempotent</b>; on failure the saga runs the compensations in reverse.',
      insight: 'A saga gives you <b>ACD without the I</b>: other requests can see half-finished state. The design work is choosing the order of steps (put the <b>pivot</b> late), adding <b>semantic locks</b> such as <code>PENDING</code>, and deciding between <b>choreography</b> and <b>orchestration</b>.',
      numbers: [
        { v: '1987', l: 'Garcia-Molina & Salem publish "Sagas" (ACM SIGMOD)' },
        { v: '4 patterns', l: 'Fowler (2017): notification, state transfer, event sourcing, CQRS' },
        { v: '0.99⁵ ≈ 95%', l: 'five 99% steps with no retries: 1 order in 20 needs compensating (math)' }
      ]
    },

    intro: {
      what: 'In an <b>event-driven architecture</b>, services tell each other "this happened" (an <b>event</b>) instead of calling each other and waiting. A <b>saga</b> is how such services complete one business action that touches several of them: each does its own small commit, and if a later step fails, the earlier ones are <b>undone by new actions</b> (a refund, a stock release), not by a database rollback.',
      analogy: {
        icon: '✈️',
        title: 'Booking a trip with separate agencies',
        text: 'You book a flight, then a hotel, then a car, each with a different company. Nobody can lock all three at once. If the car is unavailable, you do not "roll back" the flight: you <b>cancel</b> it, maybe paying a fee. The cancellation is a new action with its own record. That is a compensating transaction. Unlike the trip, software can retry automatically and must cope with hearing the same confirmation twice.'
      },
      problem: 'A shop charges the card, then asks Inventory to reserve the item. Inventory says "out of stock", or the process crashes between the two calls. Now money is taken for an order that will never ship, and no single database knows. The question this page answers is <b>how do you keep several services consistent for one action when you cannot use one transaction?</b>',
      story: [
        {
          stage: 'naive',
          title: 'Call each service in a row',
          text: 'The Order service calls Payment, then Inventory, then Shipping over HTTP, one after another, and writes "confirmed" at the end. It reads like normal code and works in the demo.',
          scene: {
            nodes: [
              { id: 'o', label: 'Order svc', sub: 'calls in a row', kind: 'service', at: [210, 0] },
              { id: 'p', label: 'Payment', sub: 'charge card', kind: 'service', at: [70, 110] },
              { id: 'i', label: 'Inventory', sub: 'reserve item', kind: 'service', at: [210, 110] },
              { id: 's', label: 'Shipping', sub: 'book courier', kind: 'service', at: [350, 110] }
            ],
            edges: [{ from: 'o', to: 'p' }, { from: 'o', to: 'i' }, { from: 'o', to: 's' }],
            flow: ['o>p', 'o>i', 'o>s'],
            badges: { o: ['sync chain', 'info'] }
          }
        },
        {
          stage: 'breaks',
          title: 'Step 2 fails after step 1 committed',
          text: 'Payment committed the charge. Inventory is out of stock, or the Order service crashes before calling it. There is no rollback across services, so the customer is <b>charged with no order</b>, and a retry might charge them twice.',
          scene: {
            nodes: [
              { id: 'o', label: 'Order svc', sub: 'crashed', kind: 'service', at: [210, 0] },
              { id: 'p', label: 'Payment', sub: 'charged $40', kind: 'service', at: [70, 110] },
              { id: 'i', label: 'Inventory', sub: 'out of stock', kind: 'service', at: [210, 110] },
              { id: 's', label: 'Shipping', sub: 'never called', kind: 'service', at: [350, 110] }
            ],
            edges: [{ from: 'o', to: 'p' }, { from: 'o', to: 'i' }, { from: 'o', to: 's', dashed: true }],
            flow: ['o>p', 'o>i'],
            err: ['i', 'o'], warn: ['p'],
            badges: { p: ['money taken', 'warn'], i: ['✖', 'err'] }
          }
        },
        {
          stage: 'fix',
          title: 'Local commits + events + compensations',
          text: 'Each step commits locally and publishes an event through an <b>outbox</b>. When Inventory fails, the saga runs the <b>compensation</b> for every step already done, in reverse: refund the payment, cancel the order. The end state is consistent, just not instantly.',
          scene: {
            nodes: [
              { id: 'o', label: 'Order svc', sub: 'PENDING → CANCELLED', kind: 'service', at: [210, 0] },
              { id: 'b', label: 'Event broker', sub: 'outbox → Kafka', kind: 'queue', at: [210, 110] },
              { id: 'p', label: 'Payment', sub: 'refund issued', kind: 'service', at: [70, 220] },
              { id: 'i', label: 'Inventory', sub: 'out of stock', kind: 'service', at: [350, 220] }
            ],
            edges: [{ from: 'o', to: 'b', bidi: true }, { from: 'b', to: 'p', bidi: true }, { from: 'b', to: 'i', bidi: true }],
            flow: ['o>b', 'b>p', 'b>i', 'i>b', 'b>p', 'b>o'],
            ok: ['p', 'o'], warn: ['i'],
            badges: { p: ['refunded', 'ok'], o: ['consistent', 'ok'] }
          }
        }
      ],
      usedBy: ['Uber (Cadence workflow engine)', 'Netflix (Conductor orchestrator)', 'Temporal (fork of Cadence)', 'AWS Step Functions saga samples', 'Debezium outbox event router', 'Camunda BPMN compensation events'],
      whenToUse: [
        'One business action spans <b>several services that each own their data</b>',
        'The action can be undone by a <b>business-level counter-action</b> (refund, release, cancel)',
        'Users can tolerate <b>seconds of "pending"</b> before the final result'
      ],
      whenNot: [
        'All the data lives in one database: just use a <b>local ACID transaction</b>',
        'Steps cannot be compensated and must be invisible until done (e.g. a ledger transfer between two accounts): keep them in <b>one service</b> (see <a href="consistency-models.html">consistency models</a>)',
        'Your service boundaries are wrong and every action needs four services: <a href="ddd.html">redraw the bounded contexts</a> first'
      ],
      glossary: [
        { term: 'Event vs command vs query', def: 'An event says something happened (past tense, many listeners); a command asks one receiver to do something; a query asks for data and changes nothing.' },
        { term: 'Saga', def: 'A sequence of local transactions where each step has a compensating transaction that semantically undoes it if a later step fails.' },
        { term: 'Compensating transaction', def: 'A new, forward action that cancels the business effect of an earlier committed step, such as a refund.' },
        { term: 'Pivot transaction', def: 'The go/no-go step of a saga: once it commits, the saga must run to completion; steps after it must be retriable.' },
        { term: 'Transactional outbox', def: 'Writing the event to an outbox table in the same database transaction as the business change, then publishing it from there.' },
        { term: 'Idempotent consumer', def: 'A consumer that records which message ids it has processed so a redelivered message has no extra effect.' },
        { term: 'Choreography vs orchestration', def: 'Services react to each other\'s events, or a central coordinator tells each service what to do next.' },
        { term: 'Dead-letter queue (DLQ)', def: 'A side queue for messages that keep failing (poison messages) so they stop blocking the ones behind them.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Local transactions only</b>: each service commits to its own database; no cross-service locks',
        '<b>Every step has a compensation</b>, or is the pivot, or comes after it and is retriable',
        '<b>Atomic state change + publish</b>: outbox or CDC, never "commit then send"',
        '<b>Idempotent handlers</b>: at-least-once delivery means every message may arrive twice',
        '<b>Order per entity</b>: events for one order key go to one partition, processed in sequence',
        '<b>Countermeasures for missing isolation</b>: semantic locks, commutative updates, re-reading values'
      ],
      nonFunctional: [
        'No lost events: outbox lag p99 &lt; 1 s (<em>example target</em>)',
        'Zero double effects from duplicates (charges, emails) under redelivery tests',
        'Every saga ends in a terminal state (done or compensated) within a deadline, e.g. 15 min',
        'Stuck or failed sagas visible on one dashboard, alert on age &gt; deadline',
        'DLQ depth alerted at &gt; 0 and drained or replayed within a working day',
        'Event schemas backward compatible; breaking changes go to a new event type or version'
      ],
      outOfScope: [
        '<b>Dual write</b>: commit the DB, then publish to Kafka from the same code path',
        '<b>2PC/XA across microservices</b>: blocking, couples availability of all participants',
        '<b>Event soup</b>: dozens of choreographed events nobody can trace end to end',
        '<b>Passive-aggressive events</b>: an "event" that is really a command the sender expects someone to obey',
        '<b>Compensation as rollback</b>: assuming you can erase an email or a shipped parcel'
      ]
    },

    calculator: {
      inputs: [
        { id: 'steps', label: 'Saga steps (services touched)', min: 2, max: 10, value: 4 },
        { id: 'fail', label: 'Failure rate per attempt, per step', min: 0.1, max: 20, value: 2, step: 0.1, unit: '%', log: true },
        { id: 'perm', label: 'Share of failures that are business rejections (no retry)', min: 0, max: 100, value: 25, unit: '%' },
        { id: 'retries', label: 'Retries per step for transient failures', min: 0, max: 8, value: 3 },
        { id: 'lat', label: 'Step latency (service work)', min: 5, max: 2000, value: 80, unit: 'ms', log: true },
        { id: 'orders', label: 'Sagas started per day', min: 1000, max: 50000000, value: 1000000, log: true, fmt: 'num' }
      ],
      outputs: [
        { label: 'Saga success probability', fmt: 'pct', f: (v) => saga(v).ok },
        { label: 'Failed sagas per day (each needs compensating)', fmt: 'raw', f: (v) => per(saga(v).failed * v.orders) + ' / day' },
        { label: 'Compensating actions per day', fmt: 'raw', f: (v) => per(saga(v).comp * v.orders) + ' / day' },
        { label: 'End-to-end latency: happy path · with expected retries', fmt: 'raw', f: (v) => {
          const x = saga(v), hop = 15, back = 200;
          const happy = x.n * (v.lat + hop);
          let extra = 0; for (let k = 1; k <= Math.round(v.retries); k++) extra += Math.pow(x.s.b, k) * (v.lat + hop + back * Math.pow(2, k - 1));
          return Math.round(happy) + ' ms · ' + Math.round(happy + x.n * extra) + ' ms';
        } },
        { label: 'Messages per order: orchestration · choreography', fmt: 'raw', f: (v) => { const n = Math.round(v.steps), a = step(v).attempts; return Math.round(2 * n * a * 10) / 10 + ' · ' + Math.round((n + 1) * a * 10) / 10; } },
        { label: 'Retry attempts per day (extra load on services)', fmt: 'raw', f: (v) => per((step(v).attempts - 1) * Math.round(v.steps) * v.orders) + ' / day' }
      ],
      note: 'Failures are assumed independent. Transient failures are retried; a business rejection (card declined, out of stock) ends the step at once. A saga failing at step <i>i</i> runs <i>i − 1</i> compensations (the failed step committed nothing). Latency adds a 15 ms broker/outbox hop per step and exponential backoff from 200 ms: both <em>estimates</em>. Orchestration sends a command and a reply per step; choreography sends one event per step plus the initial one. Notice how retries hide almost all transient failures, but business rejections cannot be retried away: <b>that is why compensations exist</b>.'
    },

    api: [
      { m: 'EVENT', p: 'OrderCreated v1 (CloudEvents envelope)', d: '<code>specversion</code>, <code>id</code> (dedupe key), <code>source</code>, <code>type</code> = <code>com.shop.order.created.v1</code>, <code>subject</code> = order id (partition key), <code>time</code>, <code>data</code>. Past tense, immutable, owned by the Order team.' },
      { m: 'EVENT', p: 'ReserveStock (command message)', d: 'Imperative, <b>one receiver</b>: <code>orderId</code>, <code>sku</code>, <code>qty</code>, <code>replyTo</code>, <code>sagaId</code>. Inventory answers <code>StockReserved</code> or <code>StockRejected</code>.' },
      { m: 'YAML', p: 'asyncapi.yaml (AsyncAPI 3.0)', d: 'Channels, operations (send/receive) and message schemas for every topic, with owners. Generates docs and contract tests; the event equivalent of OpenAPI.' },
      { m: 'ADR', p: 'ADR-047: Checkout saga orchestrated in Temporal', d: 'Steps in order, the <b>pivot</b> (payment capture), each compensation, semantic lock states, timeouts, what goes to a human queue, and why not choreography or 2PC.' },
      { m: 'POLICY', p: 'Schema evolution rules', d: 'Add optional fields only; never rename or change a type; consumers ignore unknown fields; breaking change = new <code>type</code> with <code>.v2</code>, both published during migration. Enforced by a schema registry compatibility check (BACKWARD).' },
      { m: 'SLO', p: 'Saga health', d: 'Outbox lag p99 &lt; 1 s; 99.9% of sagas terminal within 15 min; DLQ depth = 0 at end of day; compensation failure rate tracked separately.' }
    ],
    dataModel: [
      { name: 'outbox', store: 'Postgres (same DB as orders)', fields: [['id', 'uuid', 'pk'], ['aggregate_type', 'text'], ['aggregate_id', 'text', 'idx'], ['type', 'text'], ['payload', 'jsonb'], ['created_at', 'timestamptz']], note: 'Inserted in the same transaction as the order row. Debezium\'s outbox event router reads it from the WAL: <code>aggregate_type</code> picks the topic, <code>aggregate_id</code> becomes the Kafka key.' },
      { name: 'processed_messages (inbox)', store: 'Postgres (each consumer\'s DB)', fields: [['consumer', 'text', 'pk'], ['message_id', 'uuid', 'pk'], ['processed_at', 'timestamptz', 'idx']], note: 'Insert-on-conflict-do-nothing in the same transaction as the side effect. If the insert affects 0 rows, the message is a duplicate: skip it. Purge after the broker\'s max redelivery window.' },
      { name: 'saga_instance', store: 'Postgres or workflow engine', fields: [['saga_id', 'uuid', 'pk'], ['order_id', 'uuid', 'idx'], ['state', 'STARTED|PAYMENT_OK|STOCK_OK|DONE|COMPENSATING|COMPENSATED|FAILED'], ['step', 'smallint'], ['deadline', 'timestamptz', 'idx'], ['version', 'int']], note: 'Only for a hand-rolled orchestrator. Temporal or Step Functions keep this history for you.' },
      { name: 'orders', store: 'Postgres', fields: [['id', 'uuid', 'pk'], ['status', 'PENDING|APPROVED|REJECTED|CANCELLED'], ['customer_id', 'uuid', 'idx'], ['total', 'numeric(12,2)'], ['version', 'int']], note: '<code>PENDING</code> is a <b>semantic lock</b>: other actions (cancel, edit) check it and wait or refuse until the saga ends.' }
    ],

    architecture: {
      title: 'Order saga: outbox, broker, orchestrator, idempotent consumers',
      nodes: [
        { id: 'client', label: 'Client', sub: 'POST /orders', kind: 'client', wide: [90, 110], tall: [70, 0], tip: 'Gets 202 Accepted and an order id with status PENDING, then polls or receives a push when the saga ends.' },
        { id: 'order', label: 'Order service', sub: 'starts the saga', kind: 'service', wide: [280, 110], tall: [210, 0], tip: 'Writes the order as PENDING and the OrderCreated event to the outbox in one local transaction.' },
        { id: 'orch', label: 'Saga orchestrator', sub: 'Temporal · Step Fns', kind: 'compute', wide: [490, 0], tall: [350, 0], tip: 'In orchestration, a durable workflow sends each command, waits for the reply, and runs compensations in reverse on failure. In choreography this box does not exist.' },
        { id: 'odb', label: 'Orders DB', sub: 'orders + outbox', kind: 'store', wide: [280, 230], tall: [210, 105], tip: 'The business row and the outbox row commit together, so an event exists if and only if the change happened.' },
        { id: 'relay', label: 'Outbox relay', sub: 'Debezium CDC', kind: 'compute', wide: [280, 340], tall: [70, 210], tip: 'Tails the WAL (or polls the outbox) and publishes rows to Kafka. May publish a row twice after a crash, so consumers must be idempotent.' },
        { id: 'broker', label: 'Kafka', sub: 'topic per aggregate', kind: 'queue', wide: [490, 230], tall: [210, 210], tip: 'Events keyed by order id go to the same partition, so they stay in order for that order. Delivery is at-least-once.' },
        { id: 'dlq', label: 'Dead-letter topic', sub: 'poison messages', kind: 'queue', wide: [490, 340], tall: [350, 210], tip: 'After N failed attempts a message is parked here with the error, so the partition keeps moving. Alert on depth; fix and replay.' },
        { id: 'pay', label: 'Payment', sub: 'charge · refund', kind: 'service', wide: [700, 110], tall: [70, 315], tip: 'Step 2 and the pivot: once the capture succeeds, later steps must be retried until they succeed. Compensation: refund.' },
        { id: 'inv', label: 'Inventory', sub: 'reserve · release', kind: 'service', wide: [700, 230], tall: [210, 315], tip: 'Reserves stock. Compensation: release the reservation. Business rejection: out of stock.' },
        { id: 'ship', label: 'Shipping', sub: 'book · cancel', kind: 'service', wide: [700, 340], tall: [350, 315], tip: 'Books a courier. After the pivot, so it is retried rather than compensated.' },
        { id: 'inbox', label: 'Processed msgs', sub: 'per-consumer inbox', kind: 'store', wide: [900, 230], tall: [210, 420], tip: 'Each consumer records message ids it handled, in the same transaction as its effect, so duplicates are skipped.' }
      ],
      edges: [
        { from: 'client', to: 'order' },
        { from: 'order', to: 'odb' },
        { from: 'odb', to: 'relay' },
        { from: 'relay', to: 'broker' },
        { from: 'order', to: 'orch', dashed: true },
        { from: 'orch', to: 'broker', bidi: true, bend: 0.25 },
        { from: 'broker', to: 'pay', bidi: true },
        { from: 'broker', to: 'inv', bidi: true },
        { from: 'broker', to: 'ship', bidi: true },
        { from: 'broker', to: 'dlq', dashed: true },
        { from: 'pay', to: 'inbox', dashed: true },
        { from: 'inv', to: 'inbox', dashed: true },
        { from: 'ship', to: 'inbox', dashed: true }
      ]
    },

    scenarios: [
      {
        id: 'happy', title: 'Happy path (choreography)', tone: 'ok',
        steps: [
          { text: 'Client posts an order. Order service writes the order as <b>PENDING</b> and an <code>OrderCreated</code> row in the outbox, in <b>one</b> local transaction. Client gets <b>202 Accepted</b>.', flow: ['client>order', 'order>odb'], badges: { order: 'PENDING' } },
          { text: 'The relay reads the outbox from the WAL and publishes to Kafka, keyed by order id so all events for this order land on one partition, in order.', flow: ['odb>relay', 'relay>broker'], badges: { broker: 'key = order-42' } },
          { text: 'Payment consumes <code>OrderCreated</code>, charges the card, records the message id in its inbox and emits <code>PaymentCaptured</code> through its own outbox.', flow: ['broker>pay', 'pay>inbox', 'pay>broker'], ok: ['pay'], badges: { pay: ['captured', 'ok'] } },
          { text: 'Inventory reacts to <code>PaymentCaptured</code> and reserves stock; Shipping reacts to <code>StockReserved</code> and books a courier. Nobody calls anybody.', flow: ['broker>inv', 'inv>broker', 'broker>ship', 'ship>broker'], ok: ['inv', 'ship'] },
          { text: 'Order service consumes <code>ShipmentBooked</code> and flips the order to <b>APPROVED</b>. The semantic lock is released. Total: a handful of events, no distributed lock.', flow: ['broker>order'], ok: ['order'], badges: { order: ['APPROVED', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'compensate', title: 'Inventory fails → compensations', tone: 'err',
        steps: [
          { text: 'Same saga, run by an <b>orchestrator</b> this time. It sends <code>CapturePayment</code>; Payment succeeds.', flow: ['order>orch', 'orch>broker', 'broker>pay', 'pay>broker', 'broker>orch'], ok: ['pay'], badges: { orch: 'step 1 ✓' } },
          { text: 'It sends <code>ReserveStock</code>. Inventory answers <code>StockRejected</code>: out of stock. That is a <b>business rejection</b>; retrying will not help.', flow: ['orch>broker', 'broker>inv', 'inv>broker', 'broker>orch'], err: ['inv'], badges: { inv: ['out of stock', 'err'] }, tone: 'err' },
          { text: 'The orchestrator walks back through the completed steps <b>in reverse</b>: send <code>RefundPayment</code>. A refund is a new transaction, not an undo: the customer sees a charge and a refund.', flow: ['orch>broker', 'broker>pay'], warn: ['pay'], badges: { pay: ['refund', 'warn'], orch: 'compensating' }, tone: 'warn' },
          { text: 'Compensations must themselves be <b>idempotent and retriable</b>: if the refund call times out, the orchestrator retries until it succeeds. A compensation that can fail for good goes to a human queue.', flow: ['pay>inbox', 'pay>broker', 'broker>orch'], ok: ['pay'], badges: { pay: ['refunded', 'ok'] } },
          { text: 'Finally the order becomes <b>REJECTED</b> and the customer is told. The system is consistent again: <b>eventually</b>, and visibly.', flow: ['orch>order', 'order>odb'], ok: ['order'], badges: { order: ['REJECTED', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'dualwrite', title: 'Dual write loses an event', tone: 'err',
        steps: [
          { text: 'Without an outbox, the Order service commits the order and <b>then</b> calls <code>kafkaTemplate.send()</code>. Two systems, no shared transaction.', flow: ['client>order', 'order>odb'], hidden: ['relay'], badges: { order: 'commit, then send' } },
          { text: 'The pod is killed between the two (deploy, OOM). The order row exists; the event never does. Payment never hears about it: the order is <b>stuck PENDING forever</b>.', nodes: ['order', 'broker'], hidden: ['relay'], err: ['order'], badges: { broker: ['no event', 'err'] }, tone: 'err' },
          { text: 'Swap the order and it is just as bad: send first, then the DB commit fails, and Payment charges for an order that does not exist.', nodes: ['broker', 'pay'], hidden: ['relay'], warn: ['pay'], badges: { pay: ['ghost order', 'warn'] }, tone: 'warn' },
          { text: 'Fix: write the event to the <b>outbox table in the same transaction</b>. The relay publishes it later, after any crash. Either both exist or neither does.', flow: ['order>odb', 'odb>relay', 'relay>broker'], ok: ['odb', 'relay'], badges: { odb: ['atomic', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'dupe', title: 'Duplicate delivery & idempotency', tone: 'warn',
        steps: [
          { text: 'Payment processes <code>OrderCreated</code> and charges the card, but crashes before committing its Kafka offset.', flow: ['broker>pay'], warn: ['pay'], badges: { pay: 'charged, offset not committed' } },
          { text: 'On restart Kafka redelivers the same message. This is normal <b>at-least-once</b> behaviour; "exactly-once delivery" across a network and a database does not exist.', flow: ['broker>pay'], warn: ['pay'], badges: { pay: ['same msg again', 'warn'] }, tone: 'warn' },
          { text: 'Without dedupe it charges <b>twice</b>. With an inbox, it inserts <code>(consumer, message_id)</code> in the same transaction as the charge record: the insert conflicts, so it skips.', flow: ['pay>inbox'], ok: ['pay', 'inbox'], badges: { inbox: ['duplicate → skip', 'ok'] }, tone: 'ok' },
          { text: 'External calls need the same guarantee: pass the message id as the PSP\'s <b>idempotency key</b>, so a retry after a timeout cannot create a second charge.', nodes: ['pay'], badges: { pay: ['Idempotency-Key', 'info'] } }
        ]
      },
      {
        id: 'poison', title: 'Peak load: poison message & DLQ', tone: 'warn',
        steps: [
          { text: 'Black Friday: 20× normal orders. Partitions are keyed by order id, so load spreads across consumers and per-order ordering still holds.', flow: ['relay>broker', ['broker>pay', 'broker>inv']], hot: ['broker'], badges: { broker: ['20× traffic', 'warn'] } },
          { text: 'One event has a malformed address. Shipping throws on it, every time. Kafka keeps redelivering it, and every order behind it on that partition <b>waits</b>.', flow: ['broker>ship'], err: ['ship'], badges: { ship: ['poison msg', 'err'] }, tone: 'err' },
          { text: 'After 5 attempts with backoff, the consumer parks it on the <b>dead-letter topic</b> with the error and headers, commits the offset and moves on.', flow: ['broker>dlq'], warn: ['dlq'], badges: { dlq: ['1 parked', 'warn'] }, tone: 'warn' },
          { text: 'The saga for that order is now stuck, so the orchestrator\'s <b>deadline</b> fires: alert, fix the data, replay from the DLQ. Every other order kept flowing.', flow: ['dlq>broker', 'broker>ship'], ok: ['ship'], badges: { ship: ['replayed', 'ok'] }, tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Each control is a real design decision for the order saga. Meter values are <em>illustrative</em> judgements for a 4-step saga at about 100 orders/s, not benchmarks.',
      controls: [
        { id: 'coord', label: 'Coordination', type: 'seg', value: 'orch', options: [
          { v: 'choreo', l: 'Choreography (events)' }, { v: 'orch', l: 'Orchestration (workflow)' }, { v: 'tpc', l: '2PC / XA' }] },
        { id: 'pub', label: 'Publish method', type: 'seg', value: 'cdc', options: [
          { v: 'dual', l: 'Dual write' }, { v: 'outbox', l: 'Outbox (polling)' }, { v: 'cdc', l: 'Outbox via CDC' }] },
        { id: 'idem', label: 'Consumer idempotency', type: 'seg', value: 'inbox', options: [
          { v: 'none', l: 'None' }, { v: 'inbox', l: 'Processed-messages table' }, { v: 'natural', l: 'Natural (upsert / keys)' }] },
        { id: 'fail', label: 'Failure handling', type: 'seg', value: 'both', options: [
          { v: 'dlq', l: 'Retry + DLQ only' }, { v: 'comp', l: 'Compensate only' }, { v: 'both', l: 'Retry, then compensate' }] }
      ],
      evaluate(s) {
        const clamp = (x) => Math.max(0.03, Math.min(0.97, x));
        const C = s.coord, P = s.pub, I = s.idem, F = s.fail, tpc = C === 'tpc';
        let cons = tpc ? 0.9 : 0.75;
        cons += { dual: -0.4, outbox: 0, cdc: 0.05 }[P] * (tpc ? 0.3 : 1);
        cons += { none: -0.3, inbox: 0.1, natural: 0.05 }[I];
        if (!tpc) cons += { dlq: -0.25, comp: -0.05, both: 0.1 }[F];
        const coup = { choreo: [0.75, 'low: services only know events'], orch: [0.6, 'medium: orchestrator knows every step'], tpc: [0.12, 'very high: all must be up and lock together'] }[C];
        let obs = { choreo: 0.3, orch: 0.88, tpc: 0.55 }[C] + (F === 'dlq' ? -0.08 : 0);
        let lat = { choreo: 0.7, orch: 0.62, tpc: 0.3 }[C] + { dual: 0.05, outbox: -0.12, cdc: -0.03 }[P];
        const latV = tpc ? '2 round trips + locks held' : P === 'outbox' ? '+ poll interval per hop' : P === 'cdc' ? '+ ~10–100 ms per hop' : 'fastest, but lossy';
        let avail = tpc ? 0.2 : 0.8 + (C === 'orch' ? -0.05 : 0) + (P === 'dual' ? 0 : 0.05);
        let cx = { choreo: 0.55, orch: 0.65, tpc: 0.4 }[C] + { dual: 0.15, outbox: 0, cdc: -0.12 }[P] + { none: 0.1, inbox: -0.05, natural: 0 }[I] + { dlq: 0.05, comp: -0.05, both: -0.1 }[F];
        const metrics = [
          { k: 'Consistency risk', v: cons >= 0.8 ? 'low: no lost or double effects' : cons >= 0.55 ? 'medium: gaps to cover' : 'high: lost or duplicated effects', s: clamp(cons) },
          { k: 'Coupling', v: coup[1], s: coup[0] },
          { k: 'Observability', v: obs >= 0.8 ? 'one history per saga' : obs >= 0.5 ? 'coordinator logs only' : 'stitch traces across services', s: clamp(obs) },
          { k: 'Latency', v: latV, s: clamp(lat) },
          { k: 'Availability under failure', v: tpc ? 'blocked if any participant or coordinator is down' : 'steps queue and resume', s: clamp(avail) },
          { k: 'Build & run complexity', v: cx >= 0.55 ? 'moderate' : cx >= 0.3 ? 'significant' : 'high', s: clamp(cx), hint: 'lower bar = harder' }
        ];
        const notes = [];
        if (tpc) notes.push('2PC is a <b>blocking</b> protocol: a participant that voted yes holds its locks until the coordinator says commit or abort. Kafka, most NoSQL stores and HTTP APIs do not take part in XA at all.');
        if (C === 'choreo') notes.push('Choreography is simple for 2–4 steps. Beyond that the flow exists only in people\'s heads; that is the problem orchestrators such as Netflix Conductor were built to solve.');
        if (C === 'orch') notes.push('A durable workflow engine (Temporal, Step Functions, Camunda) persists each step, so the saga survives crashes and you can query where every order is.');
        if (P === 'dual') notes.push('A crash between the DB commit and the publish <b>loses the event</b>. Retrying the publish can still fail; nothing reconciles it.');
        if (P === 'outbox') notes.push('Polling is easy to start with but adds the poll interval to every hop and puts query load on the primary.');
        if (P === 'cdc') notes.push('Log tailing (Debezium) publishes in commit order with low lag, but the relay can still send a row twice: consumers must be idempotent.');
        if (I === 'none') notes.push('At-least-once delivery + non-idempotent handlers = <b>double charges</b> after any consumer restart.');
        if (I === 'natural') notes.push('Natural idempotency (upsert by order id, "set status = X") is the cheapest when the effect allows it; counters and external calls usually do not.');
        if (F === 'dlq' && !tpc) notes.push('Retry + DLQ handles transient errors and poison messages, but a <b>business rejection</b> (out of stock) leaves earlier steps committed: money taken, nothing shipped.');
        if (F === 'comp' && !tpc) notes.push('Compensating on the first timeout refunds orders that would have succeeded a second later. Retry transient errors first.');
        let verdict;
        if (tpc) verdict = '❌ <b>2PC across microservices</b>: correct on paper, but it locks every participant and stalls when one is down. Keep it inside one database.';
        else if (P === 'dual' || I === 'none') verdict = '❌ <b>Lost or duplicated effects are guaranteed at scale.</b> Fix publishing (outbox) and make consumers idempotent before anything else.';
        else if (F === 'dlq') verdict = '⚠ <b>No compensations:</b> business failures leave the saga half done. Add a compensation for every step before the pivot.';
        else if (C === 'orch' && F === 'both') verdict = '✅ <b>The textbook saga:</b> outbox, idempotent consumers, retries for transient errors, compensations in reverse for business failures, one place to see every saga.';
        else if (C === 'choreo' && F === 'both') verdict = '👍 <b>Solid choreographed saga.</b> Fine for a few steps; invest in tracing and consider an orchestrator as the flow grows.';
        else verdict = '👍 <b>Workable.</b> Check the weakest meter: it is where the next incident comes from.';
        const hide = [];
        if (C !== 'orch') hide.push('orch');
        if (P === 'dual') hide.push('relay');
        if (I === 'none') hide.push('inbox');
        if (F === 'comp') hide.push('dlq');
        const flow = ['client>order', 'order>odb'];
        if (P !== 'dual') flow.push('odb>relay', 'relay>broker');
        if (C === 'orch') flow.push('order>orch', 'orch>broker');
        flow.push('broker>pay', 'broker>inv', 'broker>ship');
        if (I !== 'none') flow.push(['pay>inbox', 'inv>inbox']);
        const labels = {
          relay: { label: 'Outbox relay', sub: P === 'cdc' ? 'Debezium CDC' : 'polling publisher' },
          broker: tpc ? { label: 'XA coordinator', sub: 'prepare → commit' } : { label: 'Kafka', sub: 'topic per aggregate' },
          inbox: { label: I === 'natural' ? 'Upsert by key' : 'Processed msgs', sub: I === 'natural' ? 'naturally idempotent' : 'per-consumer inbox' }
        };
        const badges = {};
        if (P === 'dual') badges.order = ['commit + send', 'err'];
        if (tpc) badges.broker = ['locks held', 'err'];
        if (I === 'none') badges.pay = ['double charge?', 'err'];
        if (C === 'orch') badges.orch = ['durable history', 'ok'];
        return {
          metrics, verdict, notes: notes.slice(0, 4), labels, hide, flow, badges,
          err: (P === 'dual' ? ['order'] : []).concat(tpc ? ['broker'] : []),
          warn: I === 'none' ? ['pay'] : [],
          ok: !tpc && P !== 'dual' && I !== 'none' ? ['odb'] : [],
          hot: C === 'choreo' ? ['broker'] : []
        };
      }
    },

    widget: {
      title: 'Order saga lab: fail a step, lose an event, deliver twice',
      caption: 'Run the saga Order → Payment → Inventory → Shipping. <b>Inject a failure</b> at any step and watch compensations run in reverse in the <b>choreography</b> or <b>orchestration</b> view. Switch to <b>dual write</b> and crash the publisher to lose an event, or <b>deliver a message twice</b> with idempotency off to see a double charge.'
    },

    realWorld: {
      intro: 'The idea is older than microservices: a 1987 database paper. What changed is that each service now owns a database, so the saga became the default way to span them.',
      timeline: [
        { when: '1987', who: 'Garcia-Molina & Salem', title: 'Sagas (ACM SIGMOD)', text: 'Defined a <b>saga</b> as a long-lived transaction written as a sequence of transactions T1…Tn, each with a compensating transaction Ci, so that the system guarantees either T1…Tn or T1…Tj, Cj…C1. The aim was to avoid holding locks for a long time; sagas give up isolation to get there.', src: 0 },
        { when: '2007', who: 'Pat Helland', title: 'Life beyond Distributed Transactions', text: 'A CIDR position paper arguing that systems which scale almost-infinitely cannot rely on distributed transactions, and that applications must instead manage uncertainty between <b>entities</b> with messages and business-level workflows.', src: 1 },
        { when: '2016', who: 'Netflix', title: 'Conductor open-sourced', text: 'Netflix released Conductor, a JSON-DSL microservices orchestrator InfoQ reported it had run in production for about a year. It is an early example of choosing a central <b>orchestrator</b> over peer-to-peer choreography for long business flows.', src: 2 },
        { when: '2017', who: 'Martin Fowler', title: 'What do you mean by "Event-Driven"?', text: 'After a Thoughtworks workshop, Fowler separated four patterns that all get called event-driven: <b>event notification</b>, <b>event-carried state transfer</b>, <b>event sourcing</b> and <b>CQRS</b>. Each has different coupling and failure trade-offs.', src: 3 },
        { when: '2017 → 2019', who: 'Uber → Temporal', title: 'Cadence, then Temporal', text: 'Maxim Fateev and Samar Abbas built <b>Cadence</b> at Uber (open-sourced 2017) to run durable workflows; they founded Temporal in 2019 to continue it as a fork. Its Java SDK ships a <code>Saga</code> helper that records compensations and runs them in reverse.', src: 4 },
        { when: '2018 →', who: 'Chris Richardson', title: 'microservices.io saga & outbox patterns', text: 'Catalogued saga coordination (choreography vs orchestration), the <b>transactional outbox</b> (with polling publisher or log tailing) and the countermeasures for lack of isolation: <b>semantic lock</b>, commutative updates, pessimistic view, reread value, version file, by value.', src: 5 },
        { when: '2019 · 2024', who: 'CNCF', title: 'CloudEvents 1.0, graduated 2024', text: 'CloudEvents, a common envelope for event metadata (<code>id</code>, <code>source</code>, <code>type</code>, <code>time</code>…), reached 1.0 in October 2019 and became a CNCF Graduated project in January 2024.', src: 8 },
        { when: '2023', who: 'AsyncAPI Initiative', title: 'AsyncAPI 3.0', text: 'The OpenAPI-style spec for message-driven APIs released 3.0 in December 2023, separating operations from channels and adding request-reply.', src: 9 },
        { when: 'today', who: 'Debezium · AWS · Camunda', title: 'Off-the-shelf building blocks', text: 'Debezium\'s <b>outbox event router</b> turns outbox rows into Kafka events keyed by aggregate id. AWS publishes a Step Functions saga sample with compensating Lambdas; Camunda models compensation as BPMN compensation events.', src: 7 }
      ],
      lessons: [
        'A saga is <b>ACD without I</b>: design for other requests seeing half-finished state.',
        'Never <b>dual write</b>: outbox or CDC so state change and event are atomic.',
        'Assume <b>at-least-once</b>: every consumer and every compensation must be idempotent.',
        'Put the <b>pivot</b> late and make everything after it retriable.',
        'Choreography for a few steps; an <b>orchestrator</b> once the flow needs to be seen and changed.'
      ],
      sources: [
        { title: 'Sagas (SIGMOD 1987)', url: 'https://bibtex.github.io/SIGMOD-1987-Garcia-MolinaS.html', pub: 'Hector Garcia-Molina, Kenneth Salem, ACM SIGMOD 1987' },
        { title: 'Life beyond Distributed Transactions: an Apostate\'s Opinion', url: 'https://ics.uci.edu/~cs223/papers/cidr07p15', pub: 'Pat Helland, CIDR 2007' },
        { title: 'Netflix open sources microservices orchestration engine (Conductor)', url: 'https://www.infoq.com/news/2016/12/netflix-conductor', pub: 'InfoQ, December 2016' },
        { title: 'What do you mean by "Event-Driven"?', url: 'https://www.martinfowler.com/articles/201701-event-driven.html', pub: 'Martin Fowler, February 2017' },
        { title: 'Building resilient Workflows: from Azure to Cadence to Temporal', url: 'https://temporal.io/blog/building-resilient-workflows-from-azure-to-cadence-to-temporal', pub: 'Temporal blog' },
        { title: 'Pattern: Saga', url: 'https://microservices.io/patterns/data/saga', pub: 'Chris Richardson, microservices.io' },
        { title: 'Pattern: Transactional outbox', url: 'https://microservices.io/patterns/data/transactional-outbox', pub: 'Chris Richardson, microservices.io' },
        { title: 'Outbox Event Router', url: 'https://debezium.io/documentation/reference/2.4/transformations/outbox-event-router.html', pub: 'Debezium documentation' },
        { title: 'CNCF announces the graduation of CloudEvents', url: 'https://cncf.io/announcements/2024/01/25/cloud-native-computing-foundation-announces-the-graduation-of-cloudevents', pub: 'CNCF, January 2024' },
        { title: 'AsyncAPI 3.0.0 Release Notes', url: 'https://www.asyncapi.com/blog/release-notes-3.0.0', pub: 'AsyncAPI Initiative, 2023' },
        { title: 'Conducting Better Business with Uber\'s Open Source Orchestration Tool, Cadence', url: 'https://www.uber.com/blog/open-source-orchestration-tool-cadence-overview', pub: 'Uber Engineering, 2019' },
        { title: 'Saga Pattern (Temporal design patterns)', url: 'https://docs.temporal.io/design-patterns/saga-pattern', pub: 'Temporal documentation' },
        { title: 'Implement the serverless saga pattern by using AWS Step Functions', url: 'https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/implement-the-serverless-saga-pattern-by-using-aws-step-functions', pub: 'AWS Prescriptive Guidance' },
        { title: 'Saga orchestration and choreography patterns', url: 'https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga.html', pub: 'AWS Prescriptive Guidance' },
        { title: 'BPMN and microservices orchestration, part 2: graphical models', url: 'https://camunda.com/blog/2018/08/bpmn-microservices-orchestration-part-2-graphical-models/', pub: 'Camunda blog, 2018' }
      ]
    },

    tradeoffs: {
      headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
      rows: [
        ['Coordination', '<b>Choreography</b>: services react to events; no central component', '<b>Orchestration</b>: one workflow sends commands and owns the state', 'Choreography for 2–4 steps owned by few teams; orchestration when the flow is long, changes often or must be visible'],
        ['Cross-service consistency', '<b>Saga</b>: local commits + compensations, eventually consistent', '<b>2PC / XA</b>: atomic and isolated, but blocking', '2PC only inside one database cluster or a single vendor that supports it; sagas between services'],
        ['Publishing', '<b>Polling outbox</b>: simple, works on any SQL DB', '<b>CDC outbox</b> (Debezium): low lag, commit order, no polling load', 'Start with polling at low volume; move to CDC when lag or DB load matters'],
        ['Event style', '<b>Event notification</b>: small event, consumer calls back for data', '<b>Event-carried state transfer</b>: event holds the data consumers need', 'Notification when data is sensitive or big; state transfer to cut runtime coupling and callback load'],
        ['Duplicate handling', '<b>Inbox table</b>: generic, works for any effect', '<b>Natural idempotency</b>: upserts, conditional updates, idempotency keys', 'Natural when the operation allows it; inbox for counters, emails and anything with side effects'],
        ['Failure', '<b>Retry + DLQ</b>: for transient and poison failures', '<b>Compensate</b>: for business rejections before the pivot', 'Both: retry with backoff first, compensate on a business "no" or when the deadline passes']
      ]
    },
    failures: [
      { f: 'Lost event from dual write', detect: 'Orders stuck in PENDING; reconciliation finds rows with no matching event', fix: 'Transactional outbox (polling or CDC); a sweeper that alerts on PENDING older than the saga deadline.' },
      { f: 'Double effect from redelivery', detect: 'Duplicate charges/emails after consumer restarts or rebalances', fix: 'Inbox table in the same transaction as the effect; idempotency keys on external calls; test by replaying a topic.' },
      { f: 'Poison message blocks a partition', detect: 'Consumer lag grows on one partition only; the same offset errors repeatedly', fix: 'Bounded retries with backoff, then dead-letter with the error; alert on DLQ depth; replay tooling.' },
      { f: 'Compensation fails or is impossible', detect: 'Sagas stuck in COMPENSATING; refunds rejected by the PSP', fix: 'Make compensations retriable and idempotent; route permanent failures to a human queue; move irreversible steps after the pivot.' },
      { f: 'Dirty reads from missing isolation', detect: 'Cancel or edit hits an order mid-saga; stock oversold between reserve and release', fix: 'Semantic locks (PENDING states), commutative updates, reread value before the pivot, version checks.' },
      { f: 'Out-of-order events', detect: 'OrderCancelled processed before OrderCreated; state flips back', fix: 'Partition by aggregate id; carry a version and ignore older ones; avoid parallel consumers per key.' },
      { f: 'Breaking schema change', detect: 'Consumers fail deserialising after a producer deploy', fix: 'Schema registry with BACKWARD compatibility in CI; additive changes only; new versioned type for breaking ones.' }
    ],

    interview: [
      { q: 'What is the difference between an event, a command and a query?', a: '<p>An <b>event</b> states a fact in the past tense (<code>OrderPlaced</code>); the sender does not know or care who listens, and there can be many listeners. A <b>command</b> asks one specific receiver to do something (<code>ReserveStock</code>) and can be rejected. A <b>query</b> asks for data and has no side effects.</p><p>A common smell is the "passive-aggressive event": an event the sender actually needs a specific service to act on. That is a command and should be modelled as one.</p>', lvl: 'core' },
      { q: 'Fowler lists several meanings of "event-driven". What are they and why does it matter?', a: '<ul><li><b>Event notification</b>: a small event says something changed; consumers call back for details. Low coupling, but the overall flow is hard to see.</li><li><b>Event-carried state transfer</b>: the event carries the data, so consumers keep a local copy and need no callback. Better availability, but data is duplicated and eventually consistent.</li><li><b>Event sourcing</b>: the event log is the source of truth; state is rebuilt by replaying it.</li><li><b>CQRS</b>: separate models for writes and reads, often fed by events.</li></ul><p>They matter because "we are going event-driven" can mean any of these, with very different costs.</p>', lvl: 'core' },
      { q: 'What is a saga, and who defined it?', a: '<p>Hector Garcia-Molina and Kenneth Salem, ACM SIGMOD <b>1987</b>: a long-lived transaction split into a sequence of transactions T1…Tn, each with a <b>compensating transaction</b> Ci. The system guarantees either all of T1…Tn run, or T1…Tj followed by Cj…C1.</p><p>In microservices each Ti is a local transaction in one service. The common misreading is that compensation is a rollback: it is a <b>new business action</b> (refund, release), and intermediate states are visible to others.</p>', fu: 'Which ACID property does a saga give up?', lvl: 'core' },
      { q: 'Why not use two-phase commit across the services?', a: '<ul><li>2PC is <b>blocking</b>: after voting yes, a participant holds locks until the coordinator decides. If the coordinator dies, they wait.</li><li>Availability multiplies: every participant must be up for any transaction to commit.</li><li>Most of the stack (Kafka, many NoSQL stores, third-party HTTP APIs such as a payment provider) cannot participate in XA at all.</li><li>Locks across services kill throughput and couple teams\' deploys.</li></ul><p>Keep ACID transactions inside one service; use sagas between them.</p>', lvl: 'core' },
      { q: 'Choreography or orchestration: how do you choose?', a: '<p><b>Choreography</b>: each service listens for events and emits its own. No single point of control, low coupling, good for 2–4 steps. Downsides: the flow lives nowhere, cyclic dependencies creep in, and debugging means stitching traces.</p><p><b>Orchestration</b>: a coordinator (Temporal, Step Functions, Camunda) sends commands and keeps the saga\'s state. The flow is explicit, testable and observable; the cost is a component that knows every step. I default to orchestration for anything business-critical with more than a few steps or with deadlines, and choreography for loose fan-out such as "notify analytics".</p>', lvl: 'core' },
      { q: 'Explain the transactional outbox. What problem does it solve and what does it not solve?', a: '<p>Problem: the <b>dual write</b>. Committing to the DB and publishing to Kafka are two systems; a crash between them loses or invents events.</p><p>Fix: insert the event into an <code>outbox</code> table <b>in the same local transaction</b> as the business change. A relay (polling publisher, or log tailing with Debezium) publishes it afterwards.</p><p>It does <b>not</b> give exactly-once: the relay can publish a row twice after a crash. Consumers still need to be idempotent. The inbox pattern is the mirror image on the consumer side.</p>', fu: 'Polling vs CDC relay: trade-offs?', lvl: 'core' },
      { q: 'How do you make a consumer idempotent?', a: '<ul><li><b>Natural idempotency</b>: upsert by key, conditional update (<code>WHERE status = \'PENDING\'</code>), "set" rather than "add".</li><li><b>Inbox / processed-messages table</b>: insert <code>(consumer, message_id)</code> with ON CONFLICT DO NOTHING in the same transaction as the effect; 0 rows inserted means duplicate.</li><li><b>Idempotency keys</b> for external side effects, e.g. pass the message id to the PSP.</li></ul><p>The id must be stable across redeliveries: use the event id from the producer, not the broker offset.</p>', lvl: 'deep' },
      { q: 'Sagas lack isolation. What anomalies happen and how do you counter them?', a: '<p>Without isolation you get <b>lost updates</b>, <b>dirty reads</b> (another saga sees a reservation that will be compensated) and <b>fuzzy reads</b>.</p><p>Countermeasures (Richardson, after Lars Frank\'s work): <b>semantic lock</b> (a <code>PENDING</code> flag other requests respect), <b>commutative updates</b> (debit/credit that work in any order), <b>pessimistic view</b> (reorder steps to reduce risk), <b>reread value</b> before overwriting, <b>version file</b> (record operations to reorder them) and <b>by value</b> (pick the mechanism by business risk).</p>', lvl: 'deep' },
      { q: 'What is the pivot transaction and how does it shape step order?', a: '<p>Richardson splits saga steps into <b>compensatable</b> transactions (before the pivot, can be undone), the <b>pivot</b> (the go/no-go point), and <b>retriable</b> transactions (after the pivot, guaranteed to succeed eventually).</p><p>Design rule: put steps that are likely to be rejected and easy to undo <b>first</b> (validate, reserve stock), the irreversible or costly one as the pivot (capture payment), and only steps that cannot fail for business reasons after it (send email, book shipping with retries).</p>', lvl: 'deep' },
      { q: 'How do you keep events in order, and what do you do with a poison message?', a: '<p>Kafka orders messages <b>within a partition</b>. Key events by aggregate id (order id), so all events for one order are processed in sequence; carry a version so a consumer can ignore stale events.</p><p>A <b>poison message</b> fails every time and blocks its partition. Use bounded retries with backoff, then publish to a <b>dead-letter topic</b> with the error and original headers, commit the offset and continue. Alert on DLQ depth and have replay tooling. Note the trade-off: dead-lettering one event can break ordering for that key, so the saga deadline must catch it.</p>', lvl: 'deep' },
      { q: 'How do you evolve event schemas without breaking consumers?', a: '<ul><li>Use a schema registry (Avro/Protobuf/JSON Schema) with a compatibility mode, typically <b>BACKWARD</b>, checked in CI.</li><li>Additive, optional fields only; consumers must ignore unknown fields (tolerant reader).</li><li>Breaking change = new event type or version (<code>order.created.v2</code>), publish both during migration, retire v1 when no consumer reads it.</li><li>Standardise the envelope with <b>CloudEvents</b> and document topics with <b>AsyncAPI</b>.</li></ul>', lvl: 'core' },
      { q: 'Your teams built a choreographed checkout with 9 services and nobody can explain a stuck order. How do you lead the change?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: checkout spanned 9 services via events; about 40 orders a day ended stuck and support needed two engineers to trace each. <b>Task</b>: make the flow visible and recoverable without a big rewrite. <b>Action</b>: mapped the real flow in an event-storming session with every team, wrote an ADR proposing one orchestrated workflow (Temporal) for the core payment–stock–shipping saga while keeping fan-out notifications choreographed; added outbox + inbox to the three services that dual-wrote; introduced a saga deadline alert and a DLQ replay tool; migrated behind a feature flag one region at a time. <b>Result</b>: stuck orders dropped to a few per week, each with a full history in the workflow UI, and mean time to resolve went from hours to minutes.</p>', lvl: 'core' }
    ],

    code: [
      {
        title: 'Spring Boot: order + outbox row in one @Transactional', lang: 'java',
        code: `// Spring Boot 3.3+, Java 21, Spring Data JPA, Postgres 15+
// CREATE TABLE outbox (id uuid PRIMARY KEY, aggregate_type text NOT NULL,
//   aggregate_id text NOT NULL, type text NOT NULL, payload jsonb NOT NULL,
//   created_at timestamptz NOT NULL DEFAULT now());
@Entity @Table(name = "outbox")
public class OutboxEvent {
  @Id UUID id;
  String aggregateType, aggregateId, type;
  @JdbcTypeCode(SqlTypes.JSON) String payload;
  Instant createdAt;
  protected OutboxEvent() {}
  OutboxEvent(String aggType, String aggId, String type, String payload) {
    this.id = UUID.randomUUID(); this.aggregateType = aggType; this.aggregateId = aggId;
    this.type = type; this.payload = payload; this.createdAt = Instant.now();
  }
}

public record OrderCreated(UUID orderId, UUID customerId, BigDecimal total) {}

@Service
public class OrderService {
  private final OrderRepository orders;
  private final OutboxRepository outbox;   // JpaRepository<OutboxEvent, UUID>
  private final ObjectMapper json;
  public OrderService(OrderRepository o, OutboxRepository ob, ObjectMapper j) {
    this.orders = o; this.outbox = ob; this.json = j;
  }

  @Transactional   // one local transaction: both rows commit, or neither does
  public UUID placeOrder(PlaceOrder cmd) throws JsonProcessingException {
    Order order = orders.save(Order.pending(cmd.customerId(), cmd.total()));
    var event = new OrderCreated(order.getId(), cmd.customerId(), cmd.total());
    outbox.save(new OutboxEvent("order", order.getId().toString(),
        "com.shop.order.created.v1", json.writeValueAsString(event)));
    return order.getId();  // no kafkaTemplate.send() here: Debezium publishes the row
  }
}`,
        note: 'Debezium\'s <code>EventRouter</code> SMT reads the outbox from the WAL, routes by <code>aggregate_type</code> and uses <code>aggregate_id</code> as the Kafka key, so events for one order stay ordered. Delete old outbox rows on a schedule (or delete right after insert: CDC still sees the INSERT).'
      },
      {
        title: 'Spring Kafka: idempotent consumer with a processed_messages table', lang: 'java',
        code: `// CREATE TABLE processed_messages (consumer text, message_id uuid,
//   processed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (consumer, message_id));
@Component
public class PaymentConsumer {
  private static final String ME = "payment-service";
  private final JdbcClient jdbc;
  private final PaymentService payments;
  public PaymentConsumer(JdbcClient jdbc, PaymentService payments) {
    this.jdbc = jdbc; this.payments = payments;
  }

  @KafkaListener(topics = "outbox.event.order", groupId = "payment-service")
  @Transactional  // DB transaction; the offset is committed after the method returns
  public void on(@Payload OrderCreated evt, @Header("id") String messageId) {
    int inserted = jdbc.sql("""
        INSERT INTO processed_messages (consumer, message_id) VALUES (?, ?)
        ON CONFLICT DO NOTHING""")
        .params(ME, UUID.fromString(messageId)).update();
    if (inserted == 0) return;                      // duplicate delivery: already done

    // The PSP call uses messageId as its idempotency key, so a retry is safe too.
    payments.capture(evt.orderId(), evt.total(), messageId);
    // capture() writes the payment row + a PaymentCaptured outbox row in this txn.
  }
}

@Configuration
class KafkaErrorConfig {
  @Bean DefaultErrorHandler errorHandler(KafkaTemplate<Object, Object> template) {
    var recoverer = new DeadLetterPublishingRecoverer(template);   // -> <topic>-dlt
    var backoff = new ExponentialBackOffWithMaxRetries(4);
    backoff.setInitialInterval(500); backoff.setMultiplier(2.0);
    var handler = new DefaultErrorHandler(recoverer, backoff);
    handler.addNotRetryableExceptions(DeserializationException.class);  // poison: DLT now
    return handler;
  }
}`,
        note: 'Debezium puts the outbox row id in the <code>id</code> header by default, giving a stable dedupe key across redeliveries. If the external call succeeds but the DB transaction rolls back, the idempotency key at the PSP prevents a second charge on retry.'
      },
      {
        title: 'Temporal Java: orchestrated order saga with compensation', lang: 'java',
        code: `// io.temporal:temporal-sdk 1.2x, Java 21
@WorkflowInterface
public interface OrderSaga { @WorkflowMethod OrderResult run(OrderRequest req); }

public class OrderSagaImpl implements OrderSaga {
  private final OrderActivities acts = Workflow.newActivityStub(OrderActivities.class,
      ActivityOptions.newBuilder()
          .setStartToCloseTimeout(Duration.ofSeconds(30))
          .setRetryOptions(RetryOptions.newBuilder()
              .setMaximumAttempts(5)
              .setDoNotRetry(OutOfStockException.class.getName(),
                             CardDeclinedException.class.getName())
              .build())
          .build());
  // After the pivot: no business "no" is possible, so retry until it succeeds.
  private final OrderActivities afterPivot = Workflow.newActivityStub(OrderActivities.class,
      ActivityOptions.newBuilder()
          .setStartToCloseTimeout(Duration.ofSeconds(30))
          .setRetryOptions(RetryOptions.newBuilder().setMaximumAttempts(0).build()) // 0 = unlimited
          .build());

  @Override
  public OrderResult run(OrderRequest req) {
    Saga saga = new Saga(new Saga.Options.Builder().setParallelCompensation(false).build());
    try {
      // Register each compensation before its step; compensations must tolerate
      // being called for a step that never actually took effect.
      saga.addCompensation(acts::releaseStock, req.orderId());
      acts.reserveStock(req.orderId(), req.items());      // compensatable

      saga.addCompensation(acts::refundPayment, req.orderId());
      acts.capturePayment(req.orderId(), req.total());    // pivot
    } catch (ActivityFailure e) {
      Workflow.newDetachedCancellationScope(saga::compensate).run(); // reverse order
      acts.markRejected(req.orderId(), e.getCause().getMessage());
      return OrderResult.rejected(req.orderId());
    }
    afterPivot.bookShipment(req.orderId(), req.address()); // retriable, never compensated
    afterPivot.markApproved(req.orderId());
    return OrderResult.approved(req.orderId());
  }
}`,
        note: 'Temporal persists every step in the workflow history, so a worker crash resumes where it stopped and compensations run in reverse order of registration. Activities must still be idempotent: Temporal guarantees at-least-once activity execution. Steps after the pivot use a second stub with unlimited retries, so a shipping hiccup is retried rather than compensated.'
      }
    ],

    related: ['ddd', 'cdc-pipelines', 'data-architecture', 'consistency-models', 'api-design', 'sd:ecommerce-orders', 'sd:message-queue', 'sd:payment-gateway']
  });
})();
