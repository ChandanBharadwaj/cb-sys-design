SD.register({
  slug: 'ecommerce-orders',
  domain: 3,
  title: 'E-commerce Orders & Inventory',
  examples: 'Amazon, Flipkart, Shopify',
  tagline: 'Take an order, hold the stock, charge the card and tell the warehouse, <b>without overselling the last unit</b> when a sale sends ten thousand people after it.',
  tldr: {
    problem: 'Checkout touches four systems that can each fail: cart, inventory, payment and fulfilment. There is no global transaction across them, and on sale day one product row gets hammered by everyone at once.',
    idea: 'Run checkout as a <b>saga</b>: create the order, <b>reserve stock with a TTL</b> using a conditional update, charge, then confirm. Each step has a <b>compensation</b> (release, refund). Every state change writes an <b>outbox</b> row in the same transaction, so events are never lost.',
    insight: 'Inventory has two numbers: <b>on hand</b> and <b>reserved</b>. Oversell is prevented by one line of SQL (<code>WHERE on_hand - reserved &gt;= qty</code>), not by locks in application code. <i>When</i> you reserve decides who suffers: the buyer (oversell) or the shop (stock stuck in idle carts).',
    numbers: [
      { v: 'AP', l: 'Amazon\'s cart: "always writeable" (Dynamo, SOSP 2007)' },
      { v: '100+', l: 'isolated pods at Shopify (Shopify Engineering)' },
      { v: '10–15 min', l: 'typical checkout hold TTL (estimate)' }
    ]
  },

  intro: {
    what: 'An order system is what runs after you press <b>Place order</b> in an online shop. It checks the item is in stock, sets it aside for you, charges your card and tells the warehouse to ship it. It must <b>never sell more units than exist</b>.',
    analogy: {
      icon: '🛒',
      title: 'A shop clerk with a "set aside" shelf',
      text: 'In a busy shop, when you say "I\'ll take the last one", the clerk puts it on a shelf behind the counter with your name on it. You go to the till and pay. If your card fails, the item goes back on the shop floor. If you pay, the stockroom is told to send it out. Online, each of those people is a separate service, and any of them can be slow or fail at the worst moment.'
    },
    problem: 'A phone goes on sale with 500 units, and ten thousand people press <b>Buy</b> in the same minute. Checkout touches the cart, the stock count, the payment provider and the warehouse, and any of them can fail halfway. Without care, the shop sells unit 501, or charges a card for an order it then loses. The system answers <b>"how do we take an order across several services so stock, money and shipping always agree?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'One function does every step in a row',
        text: 'The checkout code reads the stock count, checks it is above zero, charges the card, subtracts one, then calls the warehouse. It is all one request, one step after another. On a quiet day this works.',
        scene: {
          nodes: [
            { id: 'web', label: 'Shopper', sub: 'Place order', kind: 'client', at: [70, 0] },
            { id: 'pay', label: 'Payment', sub: 'charge card', kind: 'external', at: [350, 0] },
            { id: 'app', label: 'Checkout code', sub: 'read, charge, ship', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Stock DB', sub: 'count = 1', kind: 'store', at: [70, 220] },
            { id: 'wh', label: 'Warehouse', sub: 'ship it', kind: 'compute', at: [350, 220] }
          ],
          edges: [{ from: 'web', to: 'app' }, { from: 'app', to: 'db' }, { from: 'app', to: 'pay' }, { from: 'app', to: 'wh' }],
          flow: ['web>app', 'app>db', 'app>pay', 'app>wh']
        }
      },
      {
        stage: 'breaks',
        title: 'The last unit sells twice, and orders get half done',
        text: 'Two shoppers both read "1 left" before either one subtracts, so <b>both buy the last unit</b>. If the warehouse call fails after the card was charged, the customer has paid for an order nobody ships. No single transaction covers the database, the bank and the warehouse.',
        scene: {
          nodes: [
            { id: 'web', label: 'Shoppers', sub: 'both see "1 left"', kind: 'client', at: [70, 0] },
            { id: 'pay', label: 'Payment', sub: 'card charged', kind: 'external', at: [350, 0] },
            { id: 'app', label: 'Checkout code', sub: 'crashed midway', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Stock DB', sub: 'count = −1', kind: 'store', at: [70, 220] },
            { id: 'wh', label: 'Warehouse', sub: 'never told', kind: 'compute', at: [350, 220] }
          ],
          edges: [{ from: 'web', to: 'app' }, { from: 'app', to: 'db' }, { from: 'app', to: 'pay' }, { from: 'app', to: 'wh' }],
          flow: [['web>app', 'web>app'], 'app>db', 'app>pay', 'app>wh'],
          err: ['db', 'wh'],
          warn: ['app', 'pay'],
          badges: { db: ['oversold', 'err'], wh: ['lost order', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Reserve, pay, confirm, and undo on failure',
        text: 'Checkout becomes a <b>saga</b>: a list of steps, each with an undo step. First <b>reserve</b> the unit with one database update that only succeeds if stock is left. Then charge the card. If payment fails, release the unit; if it succeeds, confirm. The order change and an event are saved together, and the warehouse is told through that event.',
        scene: {
          nodes: [
            { id: 'web', label: 'Shopper', sub: 'Place order', kind: 'client', at: [70, 0] },
            { id: 'pay', label: 'Payment', sub: 'charge or refund', kind: 'external', at: [350, 0] },
            { id: 'saga', label: 'Checkout saga', sub: 'step + undo', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Stock DB', sub: 'reserve if left', kind: 'store', at: [70, 220] },
            { id: 'ord', label: 'Orders DB', sub: 'order + event', kind: 'store', at: [210, 220] },
            { id: 'wh', label: 'Warehouse', sub: 'ships on event', kind: 'compute', at: [350, 220] }
          ],
          edges: [{ from: 'web', to: 'saga' }, { from: 'saga', to: 'db' }, { from: 'saga', to: 'pay' }, { from: 'saga', to: 'ord' }, { from: 'ord', to: 'wh' }],
          flow: ['web>saga', 'saga>db', 'saga>pay', 'saga>ord', 'ord>wh'],
          ok: ['db', 'ord'],
          badges: { db: ['no oversell ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['Amazon', 'Flipkart', 'Shopify', 'Walmart', 'eBay'],
    whenToUse: [
      'Physical or limited stock that <b>must not be oversold</b>',
      'Checkout spans several services (stock, payment, shipping) that can each fail',
      'Sales and launches send huge bursts of buyers at a few products'
    ],
    whenNot: [
      'Unique seats with an announced on-sale time (see <a href="ticket-booking.html">Ticket Booking</a>)',
      'Digital goods with unlimited copies: there is no stock to reserve',
      'You only need the money movement itself (see <a href="payment-gateway.html">Payment Gateway</a>)'
    ],
    glossary: [
      { term: 'SKU', def: 'Stock keeping unit: one specific sellable product, such as "blue shirt, size M".' },
      { term: 'On hand / reserved', def: 'Units physically in stock, and how many of those are set aside for unpaid orders.' },
      { term: 'Reservation with TTL', def: 'A hold on stock that expires after a set time (time to live) if the order is not paid.' },
      { term: 'Conditional update', def: 'A database write that only happens if a condition is true, such as "enough stock is left".' },
      { term: 'Saga', def: 'A long process split into local steps, where each step has a compensation that undoes it.' },
      { term: 'Compensation', def: 'The undo action for a saga step, such as releasing stock or refunding a payment.' },
      { term: 'Transactional outbox', def: 'Writing an event in the same database transaction as the order change, then publishing it, so no event is lost.' },
      { term: 'Idempotency key', def: 'A unique id sent with checkout so that a double-tap or retry creates only one order.' }
    ]
  },

  requirements: {
    functional: [
      'Browse catalog and search; add, update and remove cart items',
      'Checkout: address, price and stock check, payment',
      'Never sell more units than are in stock',
      'Order lifecycle: pending → paid → packed → shipped → delivered',
      'Cancel before shipping, with refund and restock',
      'Notify warehouse, shopper and seller on every change'
    ],
    nonFunctional: [
      'Cart writes always succeed (availability first)',
      'Inventory and orders strongly consistent',
      'Checkout p99 ≲ 1–2 s, excluding the payment provider',
      'Survive 10–50× traffic on sale days',
      'Exactly-once effect for charges and stock moves',
      'No lost events between services'
    ],
    outOfScope: ['Payment processing internals (see Payment Gateway)', 'Search ranking and recommendations', 'Warehouse picking and routing', 'Seller onboarding and pricing']
  },

  calculator: {
    inputs: [
      { id: 'orders', label: 'Orders per day', min: 100000, max: 50000000, value: 5000000, log: true },
      { id: 'peak', label: 'Sale-hour peak vs daily average', min: 1, max: 50, value: 10, unit: '×' },
      { id: 'items', label: 'Line items per order', min: 1, max: 10, step: 0.5, value: 2.5 },
      { id: 'c2o', label: 'Carts created per order placed', min: 1, max: 20, value: 5 },
      { id: 'hold', label: 'Average reservation hold', min: 1, max: 30, value: 8, unit: 'min' },
      { id: 'row', label: 'Bytes per order (order + lines + events)', min: 500, max: 20000, value: 4000, fmt: 'bytes', log: true }
    ],
    outputs: [
      { label: 'Peak orders / second', f: (v) => v.orders / 86400 * v.peak },
      { label: 'Peak inventory writes/s (reserve + commit per line)', f: (v) => v.orders / 86400 * v.peak * v.items * 2 },
      { label: 'Peak cart writes/s (~3 writes per cart)', f: (v) => v.orders * v.c2o * 3 / 86400 * v.peak },
      { label: 'Units held in reservations at peak (Little\'s law, 1.3 attempts/order)', f: (v) => v.orders / 86400 * v.peak * v.items * 1.3 * v.hold * 60 },
      { label: 'Outbox events/s at peak (~4 per checkout)', f: (v) => v.orders / 86400 * v.peak * 4 },
      { label: 'Order storage per year', fmt: 'bytes', f: (v) => v.orders * 365 * v.row }
    ],
    note: 'All inputs are <em>estimates</em>. The hot spot is not the average: a sale concentrates thousands of reserves per second on <b>one SKU row</b>, and a row can only take one writer at a time. That is why flash sales need admission control even when the database as a whole is idle. Little\'s law: <b>units held = reserve rate × hold time</b>, so a long TTL hides real stock from buyers.'
  },

  api: [
    { m: 'PUT', p: '/v1/carts/{cartId}/items/{sku}', d: 'Set <code>{qty}</code>. Setting a quantity (rather than "add one") is idempotent and merges cleanly across devices.' },
    { m: 'POST', p: '/v1/checkout', d: '<code>{cart_id, address_id, idempotency_key}</code>. Creates the order as <code>PENDING_PAYMENT</code>, reserves stock and returns <code>order_id</code> plus <code>hold_expires_at</code>.' },
    { m: 'POST', p: '/v1/payments/webhook', d: 'Signed PSP callback. Deduplicated by the PSP event id, then moves the order <code>PENDING_PAYMENT → PAID</code>.' },
    { m: 'POST', p: '/v1/orders/{id}/cancel', d: 'Allowed only from <code>PENDING_PAYMENT</code> or <code>PAID</code>. Triggers compensations: release or restock, then refund.' },
    { m: 'GET', p: '/v1/orders/{id}', d: 'Status and timeline, built from the order\'s state transitions.' },
    { m: 'GET', p: '/v1/skus/{sku}/availability', d: 'Cached "in stock / few left" badge. Approximate on purpose; checkout is the authoritative check.' }
  ],
  dataModel: [
    { name: 'inventory', store: 'Postgres (source of truth)', fields: [['sku', 'text', 'pk'], ['on_hand', 'int'], ['reserved', 'int'], ['CHECK', '0 ≤ reserved ≤ on_hand'], ['updated_at', 'timestamptz']], note: 'available = on_hand − reserved. The CHECK constraint makes oversell impossible even if application code is wrong. With several warehouses the key becomes (sku, warehouse_id).' },
    { name: 'reservations', store: 'Postgres', fields: [['reservation_id', 'bigserial', 'pk'], ['order_id, sku', 'unique', 'idx'], ['qty', 'int'], ['status', 'HELD|COMMITTED|RELEASED'], ['expires_at', 'timestamptz', 'idx']], note: 'A reaper releases HELD rows past expires_at, so a crashed checkout never strands stock.' },
    { name: 'orders', store: 'Postgres (sharded by user or order id)', fields: [['order_id', 'uuid', 'pk'], ['user_id', 'bigint', 'idx'], ['status', 'enum'], ['idempotency_key', 'text unique', 'idx'], ['total, currency', 'numeric, char(3)'], ['version', 'int']], note: 'State changes are conditional: <code>WHERE status = :from</code>.' },
    { name: 'outbox', store: 'Postgres → Kafka', fields: [['id', 'bigserial', 'pk'], ['aggregate_id', 'uuid', 'idx'], ['type', 'OrderPlaced|OrderPaid|…'], ['payload', 'jsonb'], ['published_at', 'timestamptz']], note: 'Written in the same transaction as the state change. A relay or CDC (Debezium) publishes it.' }
  ],

  architecture: {
    title: 'E-commerce order & inventory architecture',
    nodes: [
      { id: 'web', label: 'Shopper app', sub: 'web · mobile', kind: 'client', wide: [90, 110], tall: [210, 0], tip: 'Browses, edits the cart and checks out. Sends an idempotency key with every checkout attempt.' },
      { id: 'gw', label: 'API gateway', sub: 'auth · routing', kind: 'edge', wide: [290, 110], tall: [210, 105], tip: 'Authenticates and routes. On sale days it also runs the checkout queue or throttle, admitting buyers at a rate the inventory row can absorb.' },
      { id: 'cat', label: 'Catalog + search', sub: 'read-heavy · cached', kind: 'cache', wide: [290, 0], tall: [70, 105], tip: 'Product pages and search, served mostly from cache and CDN. The stock badge here is approximate.' },
      { id: 'cart', label: 'Cart service', sub: 'durable KV', kind: 'service', wide: [500, 0], tall: [350, 105], tip: 'Carts favour availability: a write must succeed even during failures (Amazon built Dynamo for this). Conflicting versions are merged.' },
      { id: 'orch', label: 'Checkout saga', sub: 'orchestrator', kind: 'service', wide: [500, 110], tall: [210, 210], tip: 'Runs the steps create order → reserve → pay → confirm and their compensations. Its own state is persisted so it can resume after a crash.' },
      { id: 'pay', label: 'Payment', sub: 'PSP · idempotency key', kind: 'external', wide: [710, 110], tall: [350, 210], tip: 'Authorise and capture through a payment provider. The checkout idempotency key is passed through so a retry never charges twice.' },
      { id: 'inv', label: 'Inventory', sub: 'reserve with TTL', kind: 'service', wide: [500, 220], tall: [70, 315], tip: 'Reserves stock with a conditional update and a hold that expires. Commits on payment, releases on failure or expiry.' },
      { id: 'invdb', label: 'Inventory DB', sub: 'on_hand · reserved', kind: 'store', wide: [500, 330], tall: [70, 420], tip: 'One row per SKU (per warehouse), with a CHECK (reserved ≤ on_hand). The hot row of a flash sale lives here.' },
      { id: 'ord', label: 'Order service', sub: 'state machine', kind: 'service', wide: [710, 220], tall: [210, 315], tip: 'Owns order status. Every transition is checked against an allowed-transitions table and applied with WHERE status = :from.' },
      { id: 'odb', label: 'Orders DB', sub: 'orders + outbox', kind: 'store', wide: [710, 330], tall: [210, 420], tip: 'The order row and its outbox event are written in one local transaction, so they can never disagree.' },
      { id: 'kfk', label: 'Kafka', sub: 'order events', kind: 'queue', wide: [910, 330], tall: [350, 420], tip: 'The outbox relay or CDC publishes OrderPlaced, OrderPaid, OrderCancelled. Consumers deduplicate by event id.' },
      { id: 'wh', label: 'Fulfilment', sub: 'warehouse · shipping', kind: 'compute', wide: [910, 220], tall: [210, 525], tip: 'Picks, packs and ships on OrderPaid. Reports PACKED and SHIPPED back as events.' },
      { id: 'notif', label: 'Notifications', sub: 'email · SMS · push', kind: 'service', wide: [910, 440], tall: [350, 525], tip: 'Order confirmations and shipping updates, driven by the same events.' }
    ],
    edges: [
      { from: 'web', to: 'gw', bidi: true },
      { from: 'gw', to: 'cat' },
      { from: 'gw', to: 'cart' },
      { from: 'gw', to: 'orch' },
      { from: 'orch', to: 'cart' },
      { from: 'orch', to: 'pay', bidi: true },
      { from: 'orch', to: 'inv' },
      { from: 'orch', to: 'ord' },
      { from: 'inv', to: 'invdb' },
      { from: 'ord', to: 'odb' },
      { from: 'odb', to: 'kfk' },
      { from: 'kfk', to: 'wh' },
      { from: 'kfk', to: 'notif' }
    ]
  },

  scenarios: [
    {
      id: 'happy', title: 'Cart → reserve → pay → confirm', tone: 'ok',
      steps: [
        { text: 'The shopper browses cached product pages and adds two items. The cart write goes to a <b>durable KV store</b> that accepts writes even while a replica is down.', flow: ['web>gw', ['gw>cat', 'gw>cart']], badges: { cart: '2 items' } },
        { text: 'Checkout carries an <b>idempotency key</b>. The saga reads the cart and creates the order as <code>PENDING_PAYMENT</code>. A double-tap returns the same order.', flow: ['web>gw', 'gw>orch', 'orch>cart', 'orch>ord', 'ord>odb'], badges: { odb: 'PENDING_PAYMENT' } },
        { text: '<b>Reserve</b>: <code>UPDATE inventory SET reserved = reserved + 1 WHERE sku = ? AND on_hand - reserved &gt;= 1</code>, plus a hold row that expires in 15 min. One row changed means the unit is yours.', flow: ['orch>inv', 'inv>invdb'], badges: { invdb: 'reserved +1' } },
        { text: 'The saga authorises payment with the same idempotency key, so a retry after a timeout cannot charge twice.', flow: ['orch>pay', 'pay>orch'], badges: { pay: ['authorised', 'ok'] }, tone: 'ok' },
        { text: '<b>Confirm</b>: the order moves to <code>PAID</code> and an <code>OrderPaid</code> outbox row is written <b>in the same transaction</b>. The hold is committed (on_hand −1, reserved −1).', flow: [['orch>ord', 'orch>inv'], ['ord>odb', 'inv>invdb']], badges: { odb: ['PAID + outbox', 'ok'] }, tone: 'ok' },
        { text: 'The relay publishes the outbox row to Kafka. Fulfilment starts picking and the shopper gets a confirmation. Both consumers dedupe by event id.', flow: ['odb>kfk', ['kfk>wh', 'kfk>notif']], ok: ['wh', 'notif'] }
      ]
    },
    {
      id: 'payfail', title: 'Payment fails → compensate', tone: 'err',
      steps: [
        { text: 'The order is <code>PENDING_PAYMENT</code> and one unit is reserved.', nodes: ['ord', 'inv'], badges: { inv: 'held 15 min' } },
        { text: 'The card is <b>declined</b>. The outcome is known, so it is safe to undo.', flow: ['orch>pay', 'pay>orch'], err: ['pay'], badges: { pay: ['declined', 'err'] }, tone: 'err' },
        { text: '<b>Compensations run in reverse</b>: release the hold (<code>reserved − 1</code>), then move the order to <code>PAYMENT_FAILED</code> with an outbox event. Each step is idempotent, so a retry is harmless.', flow: [['orch>inv', 'orch>ord'], ['inv>invdb', 'ord>odb']], err: ['pay'], ok: ['invdb'], badges: { invdb: ['released', 'ok'] } },
        { text: 'A <b>timeout</b> is different: the outcome is <i>unknown</i>. Do not release yet. Query the PSP by idempotency key or wait for the webhook, otherwise you can release stock for an order that was actually paid.', flow: ['orch>pay'], warn: ['pay'], badges: { pay: ['timeout ?', 'warn'] }, tone: 'warn' },
        { text: 'If the orchestrator itself dies mid-saga, the <b>reservation reaper</b> still frees the unit when <code>expires_at</code> passes, and the persisted saga resumes on another node.', nodes: ['inv', 'invdb', 'orch'], warn: ['orch'], ok: ['invdb'], badges: { orch: ['crashed', 'warn'], invdb: ['TTL expired → freed', 'ok'] } }
      ]
    },
    {
      id: 'flash', title: 'Flash sale: 10,000 buyers, 500 units', tone: 'warn',
      steps: [
        { text: 'The sale opens. Checkout traffic for <b>one SKU</b> jumps 50×. Every reserve targets the <b>same inventory row</b>, and a row takes one writer at a time.', flow: [['web>gw', 'web>gw'], 'gw>orch', 'orch>inv', 'inv>invdb'], warn: ['invdb'], badges: { invdb: ['row lock queue', 'warn'] }, tone: 'warn' },
        { text: 'The gateway turns on a <b>checkout queue</b>: buyers wait in line and are admitted at a fixed rate, in arrival order (Shopify moved its throttle from a lottery to first-come fairness).', nodes: ['gw'], labels: { gw: { label: 'Checkout queue', sub: 'admit N/s · FIFO' } }, badges: { gw: 'queue 9,500' } },
        { text: 'The conditional update does the rest: exactly <b>500 reserves succeed</b>. Request 501 changes 0 rows and gets "sold out" immediately. No oversell, no refunds.', flow: ['orch>inv', 'inv>invdb'], ok: ['invdb'], badges: { invdb: ['500 / 500', 'ok'] }, tone: 'ok' },
        { text: 'To spread row contention, split the stock into <b>buckets</b> (<code>sku, bucket 0..7</code>) and reserve from a random one, or gate with an atomic Redis <code>DECR</code> and keep Postgres as the truth.', nodes: ['inv', 'invdb'], labels: { invdb: { label: 'Inventory DB', sub: '8 buckets per hot SKU' } } },
        { text: 'Unpaid holds expire and return to stock, so the queue keeps draining until every unit is <b>paid for</b>, not just reserved. The product page badge catches up from events.', flow: ['odb>kfk'], nodes: ['cat'], badges: { cat: 'sold out' } }
      ]
    },
    {
      id: 'cancel', title: 'Cancel races the warehouse', tone: 'info',
      steps: [
        { text: 'The order is <code>PAID</code>. The shopper taps <b>Cancel</b> at the same moment the warehouse scans the box as packed.', flow: [['web>gw', 'kfk>wh']], badges: { ord: 'PAID' } },
        { text: 'Both try a transition. Each is a conditional write: <code>UPDATE orders SET status = \'CANCELLED\' WHERE id = ? AND status = \'PAID\'</code>.', flow: [['gw>orch', 'wh>kfk'], 'orch>ord', 'ord>odb'], warn: ['odb'], badges: { odb: ['2 writers', 'warn'] } },
        { text: 'Only one can match <code>status = \'PAID\'</code>. Here PACKED commits first, so the cancel changes <b>0 rows</b> and the shopper sees "already packed, request a return instead".', nodes: ['ord', 'odb'], ok: ['odb'], badges: { odb: ['PACKED wins', 'ok'] }, tone: 'ok' },
        { text: 'If the cancel had won, its outbox event (<code>OrderCancelled</code>) would trigger the compensations: refund via the PSP and <b>restock</b> (on_hand + 1).', flow: ['odb>kfk', ['kfk>wh', 'kfk>notif']], badges: { notif: 'status update' } }
      ]
    },
    {
      id: 'cart', title: 'Cart write during a partition', tone: 'warn',
      steps: [
        { text: 'A replica of the cart store is unreachable. The shopper adds a phone case anyway.', flow: ['web>gw', 'gw>cart'], warn: ['cart'], badges: { cart: ['1 replica down', 'warn'] }, tone: 'warn' },
        { text: '<b>Sloppy quorum + hinted handoff</b> (Dynamo): another node accepts the write and hands it back later. The add is never rejected.', nodes: ['cart'], ok: ['cart'], badges: { cart: ['write accepted', 'ok'] } },
        { text: 'Meanwhile, on a laptop, the shopper removed a charger. Now there are <b>two versions</b> of the cart, with vector clocks that do not order each other.', nodes: ['cart'], warn: ['cart'], badges: { cart: ['v1 ∥ v2', 'warn'] } },
        { text: 'On read, the app <b>merges by union</b>. The case is kept, but the deleted charger may <b>reappear</b>. Amazon accepted that: a lost "add to cart" costs more than a resurrected item.', flow: ['orch>cart'], ok: ['cart'], badges: { cart: ['merged', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose when stock is taken, how the saga is coordinated, where carts live and whether the sale is throttled. Watch who pays for each choice.',
    controls: [
      { id: 'deduct', label: 'Take stock at…', type: 'seg', value: 'checkout', options: [
        { v: 'cart', l: 'Add to cart' }, { v: 'checkout', l: 'Checkout (hold + TTL)' }, { v: 'payment', l: 'Payment capture' }] },
      { id: 'saga', label: 'Saga coordination', type: 'seg', value: 'orch', options: [
        { v: 'orch', l: 'Orchestration' }, { v: 'chor', l: 'Choreography (events)' }] },
      { id: 'cart', label: 'Cart storage', type: 'seg', value: 'kv', options: [
        { v: 'session', l: 'Browser session' }, { v: 'redis', l: 'Redis with TTL' }, { v: 'kv', l: 'Durable replicated KV' }] },
      { id: 'surge', label: 'Sale-day admission', type: 'seg', value: 'queue', options: [
        { v: 'none', l: 'Autoscale only' }, { v: 'queue', l: 'Checkout queue + throttle' }] },
      { id: 'ttl', label: 'Hold TTL', type: 'range', min: 1, max: 30, step: 1, value: 12, unit: 'min' }
    ],
    evaluate(s) {
      const pay = s.deduct === 'payment', cartM = s.deduct === 'cart';
      // P(shopper still paying when the hold expires): exponential time-to-pay, mean 3 min after checkout, ~12 min after add-to-cart (illustrative)
      const expP = pay ? 0 : Math.exp(-s.ttl / (cartM ? 12 : 3));
      // share of stock hidden in holds that will never convert: grows with TTL (illustrative)
      const idle = pay ? 0 : cartM ? Math.min(0.6, 0.7 * s.ttl / 20) : Math.min(0.25, 0.3 * s.ttl / 30);
      const metrics = [
        { k: 'Oversell risk', v: pay ? 'high: paid orders cancelled for no stock' : 'none: conditional reserve', s: pay ? 0.15 : 0.95 },
        { k: 'Stock hidden in idle holds', v: pay ? 'none' : '≈ ' + Math.round(idle * 100) + '% at peak', s: 1 - idle * 1.4 },
        { k: 'Hold expires mid-payment', v: pay ? 'n/a' : '≈ ' + (expP * 100).toFixed(expP < 0.01 ? 1 : 0) + '% of buyers', s: Math.max(0.05, 1 - expP * 4) },
        { k: 'Checkout at sale peak', v: s.surge === 'queue' ? 'steady: admitted at DB pace' : 'timeouts: lock queue on hot row', s: s.surge === 'queue' ? 0.85 : 0.2 },
        { k: 'Cart durability', v: { session: 'lost on device switch', redis: 'lost on eviction / failover', kv: 'replicated, always writeable' }[s.cart], s: { session: 0.3, redis: 0.6, kv: 0.92 }[s.cart] },
        { k: 'Saga visibility', v: s.saga === 'orch' ? 'one place holds saga state' : 'state spread over services', s: s.saga === 'orch' ? 0.85 : 0.45 },
        { k: 'Service coupling', v: s.saga === 'orch' ? 'orchestrator knows every step' : 'services only know events', s: s.saga === 'orch' ? 0.6 : 0.85 }
      ];
      const notes = [];
      if (pay) notes.push('Checking stock at checkout but decrementing only at capture leaves a gap: two buyers both see 1 left, both pay, one gets a refund email. It works for deep stock, never for a sale.');
      if (cartM) notes.push('Holding stock from add-to-cart means abandoned carts hide real units for the whole TTL. Shoppers see "sold out" while ' + Math.round(idle * 100) + '% of stock sits in carts that will never buy (illustrative).');
      if (s.deduct === 'checkout') notes.push('A hold at checkout covers only buyers who are actively paying. Keep the TTL a little above the payment p99 (3-D Secure and UPI approval can take minutes).');
      if (!pay && expP > 0.05) notes.push('TTL ' + s.ttl + ' min is short: about ' + Math.round(expP * 100) + '% of buyers would still be paying when their hold expires. Extend the hold while the payment is in flight.');
      if (s.saga === 'chor') notes.push('Choreography: Order emits <code>OrderPlaced</code>, Inventory reacts and emits <code>StockReserved</code>, Payment reacts… Nice decoupling, but nobody can answer "where is order 42 stuck?" without tracing.');
      if (s.cart === 'session') notes.push('A browser-only cart vanishes when the shopper switches device or logs in elsewhere. Merging guest and user carts needs a server-side copy.');
      if (s.surge === 'none') notes.push('Autoscaling adds app servers, but the bottleneck is <b>one SKU row</b>. More servers just mean more transactions waiting on the same lock.');
      let verdict;
      if (pay && s.surge === 'none') verdict = '❌ <b>Sale day will oversell and time out.</b> Reserve at checkout with a conditional update, and queue buyers in front of the hot SKU.';
      else if (pay) verdict = '⚠ <b>Oversell by design.</b> Fine for long-tail items with deep stock; for anything scarce, reserve at checkout.';
      else if (s.surge === 'none') verdict = '⚠ <b>Correct, but the hot row will melt.</b> Add a checkout queue or throttle in front of inventory.';
      else if (cartM && s.ttl > 10) verdict = '⚠ <b>Carts hoard stock.</b> Real units are hidden from paying buyers. Hold at checkout instead, or use a very short cart TTL.';
      else if (s.deduct === 'checkout' && s.saga === 'orch' && s.cart === 'kv' && expP <= 0.05) verdict = '✅ <b>Solid default:</b> durable cart, checkout hold with a sane TTL, orchestrated saga with an outbox, and a queue on sale day.';
      else verdict = '👍 Workable. Check the meters to see which side (buyer or shop) is paying for the trade-off.';
      const labels = {
        inv: { label: 'Inventory', sub: pay ? 'decrement on capture' : cartM ? 'hold on add · ' + s.ttl + ' min' : 'hold on checkout · ' + s.ttl + ' min' },
        orch: s.saga === 'orch' ? { label: 'Checkout saga', sub: 'orchestrator' } : { label: 'Checkout API', sub: 'emits OrderPlaced' },
        cart: { label: 'Cart service', sub: { session: 'browser session', redis: 'Redis · TTL', kv: 'durable KV' }[s.cart] },
        gw: s.surge === 'queue' ? { label: 'Checkout queue', sub: 'admit N/s · FIFO' } : { label: 'API gateway', sub: 'auth · autoscale' }
      };
      const flow = s.saga === 'orch'
        ? ['web>gw', 'gw>orch', 'orch>inv', 'inv>invdb', 'orch>pay', 'orch>ord', 'ord>odb', 'odb>kfk']
        : ['web>gw', 'gw>orch', 'orch>ord', 'ord>odb', 'odb>kfk', 'kfk>inv', 'inv>invdb', 'kfk>wh'];
      return {
        metrics, verdict, notes, labels, flow,
        hot: s.surge === 'queue' ? ['gw'] : [],
        warn: (cartM && s.ttl > 10 ? ['cart'] : []).concat(s.surge === 'none' ? ['invdb'] : []),
        err: pay ? ['inv'] : [],
        badges: { invdb: [pay ? 'oversell risk' : 'WHERE avail ≥ qty', pay ? 'err' : 'ok'], gw: s.surge === 'queue' ? ['FIFO queue', 'info'] : ['50× spike', 'warn'] }
      };
    }
  },

  widget: {
    title: 'Order state machine + inventory holds',
    caption: 'Twelve units, a stream of shoppers. Each dot is an order moving through the <b>state machine</b>. Pick <b>when stock is taken</b> and the <b>hold TTL</b>, then watch the stock bar: held units (amber) expire back to stock, and <b>Deduct at payment</b> produces refunds when two buyers pay for one unit.'
  },

  realWorld: {
    intro: 'The big lessons came from carts that must never refuse a write, sale days that broke sites, and patterns for keeping services consistent without a global transaction.',
    timeline: [
      { when: '2007', who: 'Amazon', title: 'Dynamo: the cart must always accept writes', text: 'The SOSP paper uses the <b>shopping cart</b> as its motivating example: customers must be able to add items even when disks, networks or whole datacenters fail. Dynamo trades consistency for availability with <b>sloppy quorums, hinted handoff and vector clocks</b>, and the cart merges conflicting versions, so an add is never lost but a deleted item can resurface.', src: 0 },
      { when: 'Oct 2014', who: 'Flipkart', title: 'The first Big Billion Day buckles', text: 'Flipkart\'s first Big Billion Day drew traffic far beyond plan. The founders sent customers a public apology for the site struggling, items going out of stock and cancelled orders. It became the industry\'s reference case for preparing inventory and checkout for a sale spike.', src: 1 },
      { when: '2010s', who: 'Shopify', title: 'Pods: isolate shops from each other', text: 'Shopify groups shops into <b>pods</b>: each pod is an isolated MySQL shard plus its own Redis and Memcached. A routing layer ("Sorting Hat") sends each request to its shop\'s pod, so a flash sale on one pod cannot take down the platform. Shopify reports more than a hundred pods.', src: 3 },
      { when: '2010s', who: 'Shopify', title: 'Checkout throttle in the load balancer', text: 'For flash sales Shopify throttles checkout in <b>scriptable Nginx + Lua load balancers</b>. The first version let waiting buyers poll at random, which felt like a lottery. A later version added <b>fairness</b>, preferring buyers by when they first tried to check out.', src: 4 },
      { when: '2019', who: 'microservices.io', title: 'Sagas: orchestration vs choreography, plus the outbox', text: 'Chris Richardson\'s saga series describes the two coordination styles and the <b>transactional outbox</b>: insert the message into an OUTBOX table in the same database transaction, and let a separate relay or CDC process publish it.', src: 6 }
    ],
    lessons: [
      'Split <b>available</b> into on_hand and reserved, and reserve with a <b>conditional update</b>. Back it with a CHECK constraint.',
      'Every saga step needs a <b>compensation</b>, and an <i>unknown</i> payment outcome is not a failure.',
      'Write state and event together with an <b>outbox</b>. Never "save, then publish".',
      'On sale day the bottleneck is <b>one row</b>. Queue buyers in front of it; do not just add servers.'
    ],
    sources: [
      { title: 'Dynamo: Amazon\'s Highly Available Key-value Store (SOSP 2007)', url: 'https://www.cs.princeton.edu/courses/archive/fall15/cos518/papers/dynamo.pdf', pub: 'DeCandia et al., SOSP 2007' },
      { title: 'We Are Really & Truly Sorry, Says Flipkart Founders After The #BigBillionDay Mess', url: 'https://inc42.com/buzz/flipkart-sorry/', pub: 'Inc42, Oct 2014' },
      { title: 'Flipkart gets a billion hits, sells goods worth $100 million', url: 'https://www.thenewsminute.com/article/flipkart-gets-billion-hits-sells-goods-worth-100-million-27999', pub: 'The News Minute, Oct 2014' },
      { title: 'A Pods Architecture To Allow Shopify To Scale', url: 'https://shopify.engineering/a-pods-architecture-to-allow-shopify-to-scale', pub: 'Shopify Engineering' },
      { title: 'Surviving Flashes of High-Write Traffic Using Scriptable Load Balancers (Part I)', url: 'https://shopify.engineering/surviving-flashes-of-high-write-traffic-using-scriptable-load-balancers-part-i', pub: 'Shopify Engineering' },
      { title: 'Surviving Flashes of High-Write Traffic Using Scriptable Load Balancers (Part II)', url: 'https://shopify.engineering/blogs/engineering/surviving-flashes-of-high-write-traffic-using-scriptable-load-balancers-part-ii', pub: 'Shopify Engineering' },
      { title: 'Managing data consistency in a microservice architecture using Sagas, part 2: coordinating sagas', url: 'https://microservices.io/post/sagas/2019/08/04/developing-sagas-part-2.html', pub: 'Chris Richardson, microservices.io, 2019' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['When to take stock', '<b>Hold at checkout</b> (TTL): no oversell, little hoarding', '<b>Decrement at payment</b>: no holds, risk of oversell', 'Hold for scarce or sale items; payment-time for deep, long-tail stock'],
      ['Saga style', '<b>Orchestration</b>: one place to see and resume state', '<b>Choreography</b>: loose coupling via events', 'Orchestrate checkout (many steps, compensations); choreograph simple fan-out like notifications'],
      ['Cart store', '<b>Durable replicated KV</b>: always writeable, merge conflicts', '<b>Redis / session</b>: simple, fast, can lose carts', 'Durable once carts drive revenue and span devices'],
      ['Inventory truth', '<b>Postgres row</b> + conditional update: simple, strongly consistent', '<b>Redis DECR gate</b> + async DB: absorbs spikes, needs reconciliation', 'Postgres by default; add a Redis gate only for extreme hot SKUs'],
      ['Sale-day load', '<b>Queue / throttle</b> in front of checkout', '<b>Let it rip</b> with autoscaling', 'Queue whenever demand for one SKU exceeds what one row can serialise']
    ]
  },
  failures: [
    { f: 'Oversell on a hot SKU', detect: 'reserved > on_hand or negative available in reconciliation', fix: 'Conditional reserve (WHERE on_hand − reserved ≥ qty) plus a CHECK constraint; never read-then-write.' },
    { f: 'Orchestrator dies mid-saga', detect: 'Orders stuck in PENDING_PAYMENT past the hold TTL', fix: 'Persist saga state and resume; the reservation reaper frees stock regardless.' },
    { f: 'Event lost or phantom (dual write)', detect: 'Order PAID but warehouse never heard; or event for a rolled-back order', fix: 'Transactional outbox or CDC; never publish outside the DB transaction.' },
    { f: 'Duplicate events downstream', detect: 'Same order packed or emailed twice', fix: 'Consumers store processed event ids (or use idempotent upserts).' },
    { f: 'Payment webhook lost', detect: 'Ageing PENDING orders with a captured charge at the PSP', fix: 'Poll the PSP by idempotency key before expiring; nightly reconciliation against PSP reports.' },
    { f: 'Lock queue on one inventory row', detect: 'Lock-wait p99 and checkout timeouts spike at sale start', fix: 'Checkout queue, stock buckets per SKU, or a Redis pre-gate.' },
    { f: 'Stock leaked in holds', detect: '"Sold out" while paid units are far below stock', fix: 'Shorter TTL, hold at checkout not cart, release on explicit abandon.' }
  ],

  interview: [
    { q: 'How do you prevent overselling the last unit?', a: '<p>Never do read-then-write in the application. Let the database decide in <b>one statement</b>:</p><p><code>UPDATE inventory SET reserved = reserved + :q WHERE sku = :s AND on_hand - reserved &gt;= :q</code></p><p>If it changes 1 row you got the unit; 0 rows means sold out. Add <code>CHECK (reserved &lt;= on_hand)</code> as a safety net. Row-level locking serialises concurrent writers on that row.</p>', fu: 'What isolation level do you need? (Read Committed is enough: the WHERE is re-evaluated on the latest row version after the lock wait.)', lvl: 'core' },
    { q: 'When should stock be reserved: add to cart, checkout or payment?', a: '<ul><li><b>Add to cart</b>: buyers are never disappointed, but abandoned carts hide stock (most carts never convert).</li><li><b>Checkout with a TTL</b>: holds only active buyers. The usual default.</li><li><b>Payment</b>: no holds, but two buyers can pay for one unit, so you need refunds or backorders.</li></ul><p>Scarce or sale items: checkout. Deep long-tail stock: payment time is fine.</p>', lvl: 'core' },
    { q: 'Walk me through the order state machine.', a: '<p><code>PENDING_PAYMENT → PAID → PACKED → SHIPPED → DELIVERED</code>, with <code>CANCELLED</code> from PENDING or PAID, and <code>PAYMENT_FAILED</code> from PENDING.</p><p>Store allowed transitions explicitly and apply each with <code>UPDATE … WHERE status = :from</code>. Concurrent actors (shopper cancel vs warehouse pack) cannot both win, and every transition writes an outbox event.</p>', lvl: 'core' },
    { q: 'What is a saga, and how do you compensate when payment fails?', a: '<p>A saga is a sequence of <b>local transactions</b>, each with a <b>compensating</b> action: reserve ↔ release, charge ↔ refund, create order ↔ cancel. If step k fails, run the compensations for steps k−1 … 1.</p><p>Compensations must be idempotent and retried until they succeed. They are business undo, not a rollback; for example a refund is a new transaction.</p>', lvl: 'core' },
    { q: 'Orchestration or choreography?', a: '<p><b>Orchestration</b>: a coordinator tells each participant what to do and persists saga state. Easy to see where an order is stuck, easy to add timeouts.</p><p><b>Choreography</b>: services react to each other\'s events. Looser coupling, but the flow is implicit and hard to debug once there are more than 3–4 steps.</p><p>Checkout usually gets orchestration; notifications and analytics just subscribe to events.</p>', lvl: 'deep' },
    { q: 'Why do you need a transactional outbox?', a: '<p>"Update the DB, then publish to Kafka" is a <b>dual write</b>. A crash between the two loses the event, and publishing first can announce something that then rolls back.</p><p>Insert the event into an <code>outbox</code> table <b>in the same transaction</b> as the state change. A relay (polling with SKIP LOCKED, or CDC like Debezium) publishes it at least once, and consumers deduplicate by event id.</p>', lvl: 'core' },
    { q: 'The payment call timed out. Do you release the stock?', a: '<p>No. A timeout means <b>unknown</b>, not failed. The charge may have succeeded.</p><p>Keep the hold (extend it if needed), then query the PSP with the same idempotency key or wait for the webhook. Release only on a definite failure. A reconciliation job against PSP reports catches the rest.</p>', lvl: 'deep' },
    { q: 'How do you handle a flash sale on one SKU?', a: '<ul><li><b>Admission control</b>: a waiting room or checkout queue admits buyers at the rate inventory can serialise (Shopify throttles in its load balancers).</li><li><b>Bucketed stock</b>: split 500 units into 8 rows and reserve from a random bucket.</li><li><b>Redis DECR pre-gate</b> with Postgres as the truth.</li><li>Short holds, so unpaid units return quickly.</li><li>Isolate the sale (Shopify pods) so other shops are unaffected.</li></ul>', lvl: 'deep' },
    { q: 'How do you merge a guest cart into the user\'s cart on login?', a: '<p>Keep the guest cart server-side, keyed by an anonymous id. On login, merge into the user cart: union of SKUs, and for duplicates take the <b>max</b> quantity (or ask). Then delete the guest cart idempotently.</p><p>It is the same rule Dynamo used for divergent replicas: favour keeping adds over losing them.</p>', lvl: 'core' },
    { q: 'Why did Amazon build the cart on an AP store?', a: '<p>A cart that refuses "add to cart" loses money directly. Dynamo accepts writes during failures (sloppy quorum, hinted handoff), tracks divergence with <b>vector clocks</b>, and lets the application merge versions.</p><p>The cost: a deleted item can reappear. Orders and inventory are the opposite: they need strong consistency, so they live in a CP store.</p>', lvl: 'deep' },
    { q: 'How accurate must the "in stock" badge on the product page be?', a: '<p>Not very. It is served from cache and updated from inventory events, so it can lag by seconds. The authoritative check is the <b>conditional reserve at checkout</b>.</p><p>Show "only a few left" thresholds instead of exact counts, which also hides small inaccuracies.</p>', lvl: 'core' },
    { q: 'How do you prepare for a sale day?', a: '<ul><li>Load-test at several times the expected peak on production-like data, including the hot-SKU path.</li><li>Pre-scale stateless tiers and warm caches; do not rely on reactive autoscaling.</li><li>Turn on the checkout queue and feature flags that shed non-essential work (recommendations, reviews).</li><li>Freeze deploys, rehearse failover, and watch lock waits, queue depth and payment success rate.</li></ul>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Java: enum state machine with conditional transitions', lang: 'java',
      code: `public enum OrderStatus {
  PENDING_PAYMENT, PAID, PAYMENT_FAILED, PACKED, SHIPPED, DELIVERED, CANCELLED;

  private static final Map<OrderStatus, Set<OrderStatus>> NEXT = Map.of(
      PENDING_PAYMENT, EnumSet.of(PAID, PAYMENT_FAILED, CANCELLED),
      PAID,            EnumSet.of(PACKED, CANCELLED),
      PACKED,          EnumSet.of(SHIPPED),
      SHIPPED,         EnumSet.of(DELIVERED));

  public boolean canMoveTo(OrderStatus to) {
    return NEXT.getOrDefault(this, Set.of()).contains(to);
  }
}

@Service
public class OrderTransitions {
  private final JdbcTemplate jdbc;
  private final ObjectMapper json;
  public OrderTransitions(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }

  @Transactional
  public void move(UUID orderId, OrderStatus from, OrderStatus to) {
    if (!from.canMoveTo(to)) throw new IllegalStateException(from + " -> " + to);
    int n = jdbc.update("""
        UPDATE orders SET status = ?, version = version + 1, updated_at = now()
         WHERE order_id = ? AND status = ?""", to.name(), orderId, from.name());
    if (n == 0) throw new StaleTransitionException(orderId, from);  // someone else moved it first
    jdbc.update("INSERT INTO outbox(aggregate_id, type, payload) VALUES (?, ?, ?::jsonb)",
        orderId, "Order" + to.name(), toJson(Map.of("orderId", orderId, "status", to)));
  }

  private String toJson(Object o) {
    try { return json.writeValueAsString(o); }
    catch (JsonProcessingException e) { throw new IllegalArgumentException(e); }
  }
}`,
      note: '<code>StaleTransitionException</code> extends <code>RuntimeException</code>, so the transaction rolls back. The state change and its outbox event always commit together. Spring Statemachine adds guards and actions on top of the same idea, but a table of allowed transitions plus a conditional UPDATE is usually enough.'
    },
    {
      title: 'Java: idempotent checkout that reserves stock', lang: 'java',
      code: `record Line(String sku, int qty) {}

@Transactional
public UUID checkout(String idemKey, long userId, List<Line> lines) {
  UUID orderId = UUID.randomUUID();
  int created = jdbc.update("""
      INSERT INTO orders(order_id, user_id, status, idempotency_key)
      VALUES (?, ?, 'PENDING_PAYMENT', ?)
      ON CONFLICT (idempotency_key) DO NOTHING""", orderId, userId, idemKey);
  if (created == 0)                                   // retry or double-tap: same order back
    return jdbc.queryForObject("SELECT order_id FROM orders WHERE idempotency_key = ?",
        UUID.class, idemKey);

  for (Line l : lines.stream().sorted(Comparator.comparing(Line::sku)).toList()) { // fixed lock order
    int ok = jdbc.update("""
        UPDATE inventory SET reserved = reserved + ?
         WHERE sku = ? AND on_hand - reserved >= ?""", l.qty(), l.sku(), l.qty());
    if (ok == 0) throw new OutOfStockException(l.sku());       // rolls back order + earlier holds
    jdbc.update("""
        INSERT INTO reservations(order_id, sku, qty, status, expires_at)
        VALUES (?, ?, ?, 'HELD', now() + interval '15 minutes')""", orderId, l.sku(), l.qty());
  }
  jdbc.update("INSERT INTO outbox(aggregate_id, type, payload) VALUES (?, 'OrderPlaced', ?::jsonb)",
      orderId, "{\\"orderId\\":\\"" + orderId + "\\"}");
  return orderId;
}`,
      note: 'Sorting lines by SKU makes every transaction lock rows in the same order, which prevents deadlocks between two carts that share items. Single-database version: if inventory is its own service, this becomes the saga\'s "reserve" step.'
    },
    {
      title: 'Postgres: schema, reaper and outbox relay', lang: 'sql',
      code: `CREATE TABLE inventory (
  sku       text PRIMARY KEY,           -- one warehouse shown; else (sku, warehouse_id)
  on_hand   int  NOT NULL,
  reserved  int  NOT NULL DEFAULT 0,
  CHECK (reserved >= 0 AND reserved <= on_hand)    -- oversell is impossible
);
CREATE INDEX holds_due ON reservations (expires_at) WHERE status = 'HELD';

-- reaper, every few seconds: release expired holds in one statement
WITH expired AS (
  UPDATE reservations SET status = 'RELEASED'
   WHERE status = 'HELD' AND expires_at < now()
  RETURNING sku, qty
), per_sku AS (
  SELECT sku, sum(qty) AS qty FROM expired GROUP BY sku
)
UPDATE inventory i SET reserved = i.reserved - p.qty
  FROM per_sku p WHERE i.sku = p.sku;

-- payment captured: commit the hold (stock leaves the building)
UPDATE inventory i SET on_hand = on_hand - r.qty, reserved = reserved - r.qty
  FROM reservations r
 WHERE r.order_id = :order AND r.status = 'HELD' AND i.sku = r.sku;
UPDATE reservations SET status = 'COMMITTED' WHERE order_id = :order AND status = 'HELD';

-- outbox relay: claim a batch without blocking other relays
SELECT id, type, payload FROM outbox
 WHERE published_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED;`,
      note: 'The reaper groups by SKU because an <code>UPDATE … FROM</code> applies at most one joined row to each target row. Run the commit as one transaction, and only after checking that the hold has not expired.'
    }
  ],

  related: ['payment-gateway', 'ticket-booking', 'message-queue', 'kv-store', 'job-scheduler', 'food-delivery']
});
