SD.register({
  slug: 'ticket-booking',
  domain: 3,
  title: 'Ticket Booking & Flash Sales',
  examples: 'Ticketmaster, BookMyShow',
  tagline: 'Sell 50,000 seats to two million people in minutes without selling any seat twice: <b>queue the crowd, hold seats briefly, commit atomically</b>.',
  tldr: {
    problem: 'Demand is 10–100× supply and arrives in the same second. Everyone wants the same front rows, bots hammer the API, and a seat must never go to two buyers.',
    idea: 'A <b>virtual waiting room</b> admits users at a rate the origin can take. Admitted users place a short <b>hold</b> with an atomic conditional write (<code>UPDATE … WHERE status = \'AVAILABLE\'</code>). A <b>saga</b> takes payment and either confirms the seats or releases them.',
    insight: 'The database is not the bottleneck you fix with more servers. Contention is on a few thousand <b>rows</b>, so you <b>limit who reaches them</b> (queue) and make every write a <b>single atomic predicate</b> that fails fast.',
    numbers: [
      { v: '3.5B', l: 'system requests in the Eras Tour presale, 4× Ticketmaster\'s previous peak (Nov 2022)' },
      { v: '3.5M', l: 'Verified Fan registrations for that sale: 1.5M invited, 2M wait-listed' },
      { v: '~3×', l: 'the most bot traffic Ticketmaster had ever seen (Live Nation testimony to the US Senate, 2023)' }
    ]
  },

  intro: {
    what: 'A ticket booking system sells seats for concerts, sports and shows. It shows which seats are free, lets you <b>hold</b> a few while you pay, and makes sure <b>no seat is ever sold twice</b>, even when a huge crowd arrives in the same minute.',
    analogy: {
      icon: '🎟️',
      title: 'A box office with a doorman and reserved tags',
      text: 'When a popular show opens, a theatre does not let the whole crowd rush the counter. A doorman lets people in a few at a time. At the counter, the clerk puts a "reserved" tag on your seat while you find your card, and removes it if you walk away. The online system does the same: a waiting room at the door, a short hold on each seat, and one ledger that cannot sell a seat twice.'
    },
    problem: 'A big star announces a tour. At 10:00 sharp, fans and bots all click on the same front-row seats in the same second. Two fans may both see seat A-12 as free and both pay for it, and the flood of clicks can knock the whole site over. The system answers <b>"who gets this seat, exactly once, without crashing under the rush?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'Check the seat, then sell it',
        text: 'The app reads the seat row: is it free? If yes, it takes the payment and then marks the seat <b>sold</b>. Every fan goes straight to the app and the database. This works for a small theatre on a quiet day.',
        scene: {
          nodes: [
            { id: 'f1', label: 'Fan 1', sub: 'clicks A-12', kind: 'client', at: [70, 0] },
            { id: 'f2', label: 'Fan 2', sub: 'clicks A-12', kind: 'client', at: [350, 0] },
            { id: 'api', label: 'Booking app', sub: 'check, then sell', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Seats DB', sub: 'one row per seat', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'f1', to: 'api' }, { from: 'f2', to: 'api' }, { from: 'api', to: 'db' }],
          flow: [['f1>api', 'f2>api'], 'api>db']
        }
      },
      {
        stage: 'breaks',
        title: 'Two buyers for one seat, and a crowd at the door',
        text: 'Both fans read "free" in the same instant, both pay, and <b>seat A-12 is sold twice</b>. Meanwhile millions of clicks and bots arrive at once. More app servers do not help, because they all fight over the same few thousand seat rows. The site slows down and falls over.',
        scene: {
          nodes: [
            { id: 'f1', label: 'Fan 1', sub: 'paid for A-12', kind: 'client', at: [70, 0] },
            { id: 'f2', label: 'Fan 2', sub: 'paid for A-12', kind: 'client', at: [350, 0] },
            { id: 'api', label: 'Booking app', sub: 'flooded', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Seats DB', sub: 'A-12 sold twice', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'f1', to: 'api' }, { from: 'f2', to: 'api' }, { from: 'api', to: 'db' }],
          flow: [['f1>api', 'f2>api'], ['f1>api', 'f2>api'], 'api>db'],
          err: ['db'],
          warn: ['api'],
          badges: { db: ['double sale', 'err'], api: ['overloaded', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Queue the crowd, hold the seat, then pay',
        text: 'A <b>virtual waiting room</b> lets fans in at a steady rate the system was tested for. An admitted fan places a short <b>hold</b> with one atomic database update that only succeeds if the seat is still free, so the second fan is told "taken" at once. Payment then confirms the seats, or the hold expires and the seats go back on sale.',
        scene: {
          nodes: [
            { id: 'f1', label: 'Fan 1', sub: 'clicks A-12', kind: 'client', at: [70, 0] },
            { id: 'wr', label: 'Waiting room', sub: 'steady rate', kind: 'edge', at: [210, 0] },
            { id: 'f2', label: 'Fan 2', sub: 'clicks A-12', kind: 'client', at: [350, 0] },
            { id: 'api', label: 'Booking app', sub: 'hold if free', kind: 'service', at: [210, 110] },
            { id: 'pay', label: 'Payment', sub: 'confirm or free', kind: 'external', at: [350, 110] },
            { id: 'db', label: 'Seats DB', sub: 'A-12 → HELD', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'f1', to: 'wr' }, { from: 'f2', to: 'wr' }, { from: 'wr', to: 'api' }, { from: 'api', to: 'db' }, { from: 'api', to: 'pay' }],
          flow: [['f1>wr', 'f2>wr'], 'wr>api', 'api>db', 'api>pay'],
          ok: ['api', 'db'],
          badges: { db: ['one winner ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['Ticketmaster', 'BookMyShow', 'SeatGeek', 'Eventbrite', 'Queue-it (virtual waiting rooms)'],
    whenToUse: [
      'Each item is unique (row A, seat 12) and must go to <b>exactly one</b> buyer',
      'Demand can be many times the supply and arrives at one announced moment',
      'Buyers need a few minutes to pay, so items must be reserved briefly'
    ],
    whenNot: [
      'Plenty of stock and no rush: an ordinary shop checkout is enough (see <a href="ecommerce-orders.html">E-commerce Orders</a>)',
      'The spike is abuse, not real buyers: start with a <a href="rate-limiter.html">Distributed Rate Limiter</a>',
      'Bookings trickle in with little competition, like appointment slots: a unique constraint will do'
    ],
    glossary: [
      { term: 'Virtual waiting room', def: 'A queue page in front of the site that admits visitors at a fixed rate and gives each a signed pass.' },
      { term: 'Outflow', def: 'How many people per minute the waiting room lets through to the booking system.' },
      { term: 'Hold', def: 'A temporary reservation on a seat that expires after a few minutes if the buyer does not pay.' },
      { term: 'Conditional UPDATE', def: 'One database statement that changes a row only if a condition is still true, such as "status is AVAILABLE".' },
      { term: 'Double booking', def: 'Selling the same seat to two people, the one failure this system must never allow.' },
      { term: 'Saga', def: 'A multi-step process (hold, pay, confirm) where each step has an undo step if a later one fails.' },
      { term: 'Idempotency key', def: 'A unique id sent with a request so that retrying it does not create a second hold or charge.' },
      { term: 'Bot', def: 'A script that pretends to be a fan to grab tickets faster than humans can.' }
    ]
  },

  requirements: {
    functional: [
      'Browse events and a live seat map',
      'Join a waiting room and get an access token',
      'Hold selected seats for a few minutes',
      'Pay and confirm; issue e-tickets',
      'Release seats on expiry, cancel or payment failure',
      'Pre-registration / presale codes for high-demand events'
    ],
    nonFunctional: [
      '<b>Zero double-selling</b>, ever',
      'Holds expire reliably (5–10 min)',
      'Origin protected from 10–100× normal traffic',
      'Fair ordering; bots should not win',
      'Idempotent hold, pay and confirm',
      'Seat map p99 ≲ 200 ms (<em>estimate</em> target)'
    ],
    outOfScope: ['Dynamic pricing', 'Resale marketplace', 'Refund policy', 'Venue mapping tools']
  },

  calculator: {
    inputs: [
      { id: 'users', label: 'Fans arriving for the on-sale', min: 10000, max: 20000000, value: 2000000, log: true },
      { id: 'seats', label: 'Seats on sale', min: 1000, max: 1000000, value: 50000, log: true },
      { id: 'outflow', label: 'Waiting-room outflow (users admitted / min)', min: 100, max: 100000, value: 5000, log: true },
      { id: 'per', label: 'Tickets per order', min: 1, max: 8, step: 0.5, value: 2.5 },
      { id: 'ttl', label: 'Hold TTL', min: 1, max: 20, value: 8, unit: 'min' },
      { id: 'conv', label: 'Admitted users who complete an order', min: 10, max: 100, value: 70, unit: '%' }
    ],
    outputs: [
      { label: 'Time to admit everyone', fmt: 'ms', f: (v) => v.users / v.outflow * 60000 },
      { label: 'Orders until sold out', f: (v) => v.seats / v.per },
      { label: 'Time until sold out', fmt: 'ms', f: (v) => (v.seats / v.per) / (v.outflow * v.conv / 100) * 60000 },
      { label: 'Fans who leave without tickets', f: (v) => Math.max(0, v.users - (v.seats / v.per) / (v.conv / 100)) },
      { label: 'Seats held at any moment (Little\'s law)', f: (v) => Math.min(v.seats, v.outflow * v.per * ((v.conv / 100) * Math.min(v.ttl, 3) + (1 - v.conv / 100) * v.ttl)) },
      { label: 'Booking API req/s (~10 per admitted user)', f: (v) => v.outflow * 10 / 60 }
    ],
    note: 'All inputs are <em>estimates</em>. Held seats use Little\'s law (arrival rate × time held), assuming buyers finish within ~3 minutes and abandoned holds sit for the full TTL. Notice how the <b>outflow rate</b>, not the crowd size, sets the load on the booking API. The crowd size only decides how long the queue is and how many people go home disappointed.'
  },

  api: [
    { m: 'GET', p: '/v1/events/{id}/seatmap', d: 'Sections and availability. Served from CDN / cache with a 1–2 s TTL; it is a hint, not a promise.' },
    { m: 'POST', p: '/v1/queue/{event}/join', d: 'Returns a queue id and position. In a pre-queue, positions are assigned randomly at sale start.' },
    { m: 'GET', p: '/v1/queue/{event}/status', d: 'Polled by the waiting page. When your turn comes, returns a <b>signed access token</b> (event, visitor, expiry).' },
    { m: 'POST', p: '/v1/holds', d: '<code>{event_id, seat_ids, idempotency_key}</code> + access token. Returns <code>hold_id, expires_at</code> or <code>409</code> with the seats that were taken.' },
    { m: 'POST', p: '/v1/orders', d: '<code>{hold_id, payment_method, idempotency_key}</code>. Starts the saga: authorize → confirm seats → capture → issue tickets.' },
    { m: 'DELETE', p: '/v1/holds/{id}', d: 'User abandons checkout; seats return to inventory immediately.' }
  ],
  dataModel: [
    { name: 'seats', store: 'Postgres (partitioned by event)', fields: [['(event_id, seat_id)', 'bigint, text', 'pk'], ['status', 'AVAILABLE | HELD | SOLD'], ['hold_id', 'uuid', 'fk'], ['hold_until', 'timestamptz', 'idx'], ['version', 'int']], note: 'One row per seat. Every state change is a conditional UPDATE.' },
    { name: 'holds', store: 'Postgres', fields: [['hold_id', 'uuid', 'pk'], ['user_id', 'bigint', 'idx'], ['idempotency_key', 'uuid', 'idx'], ['expires_at', 'timestamptz'], ['state', 'ACTIVE | CONFIRMED | RELEASED']] },
    { name: 'orders', store: 'Postgres', fields: [['order_id', 'uuid', 'pk'], ['hold_id', 'uuid', 'fk'], ['payment_intent', 'text', 'idx'], ['saga_state', 'enum'], ['idempotency_key', 'uuid', 'idx']], note: 'Unique on <code>hold_id</code>: one order per hold.' },
    { name: 'queue', store: 'Redis / DynamoDB', fields: [['event_id', 'text', 'pk'], ['position', 'int', 'sk'], ['visitor_id', 'uuid'], ['admitted_at', 'ts']] }
  ],

  architecture: {
    title: 'Ticket booking architecture',
    nodes: [
      { id: 'fan', label: 'Fan\'s browser', sub: 'seat map · checkout', kind: 'client', wide: [90, 220], tall: [210, 0], tip: 'Arrives early, waits in the queue page, then picks seats and pays within the hold window.' },
      { id: 'cdn', label: 'CDN / edge', sub: 'WAF · bot score · token', kind: 'edge', wide: [280, 220], tall: [210, 105], tip: 'Serves static pages and the cached seat map, scores bots, and checks the waiting-room token at the edge so unadmitted traffic never reaches origin.' },
      { id: 'wr', label: 'Waiting room', sub: 'random → FIFO', kind: 'service', wide: [280, 110], tall: [70, 105], tip: 'Holds the crowd and admits users at a fixed outflow rate, issuing signed access tokens.' },
      { id: 'api', label: 'Booking API', sub: 'token-gated', kind: 'service', wide: [480, 220], tall: [210, 215], tip: 'Only requests with a valid access token get here. Rate-limited per user and per token.' },
      { id: 'inv', label: 'Inventory service', sub: 'hold · confirm · release', kind: 'service', wide: [690, 220], tall: [210, 325], tip: 'Owns seat state transitions. Every transition is a single conditional write.' },
      { id: 'hold', label: 'Seat-map cache', sub: 'Redis · availability', kind: 'cache', wide: [890, 110], tall: [70, 325], tip: 'Fast availability for the seat map, and optionally an atomic Redis hold layer (SET NX PX) in front of the DB.' },
      { id: 'pg', label: 'Booking DB', sub: 'Postgres · row per seat', kind: 'store', wide: [890, 220], tall: [210, 435], tip: 'Source of truth for seats, holds and orders.' },
      { id: 'sweep', label: 'Hold sweeper', sub: 'expire stale holds', kind: 'compute', wide: [690, 110], tall: [70, 435], tip: 'Periodically releases holds past hold_until using FOR UPDATE SKIP LOCKED batches.' },
      { id: 'saga', label: 'Order saga', sub: 'orchestrator', kind: 'service', wide: [690, 330], tall: [350, 325], tip: 'Runs authorize → confirm seats → capture → issue tickets, with a compensating step for each.' },
      { id: 'pay', label: 'Payment provider', sub: 'authorize · capture', kind: 'external', wide: [890, 330], tall: [350, 435], tip: 'External PSP. Calls carry an idempotency key; results arrive synchronously or by webhook.' },
      { id: 'notif', label: 'Tickets & notify', sub: 'e-ticket · email', kind: 'service', wide: [690, 440], tall: [350, 215], tip: 'Issues rotating e-tickets and sends confirmations after the saga commits.' }
    ],
    edges: [
      { from: 'fan', to: 'cdn', bidi: true },
      { from: 'cdn', to: 'wr', bidi: true },
      { from: 'cdn', to: 'api' },
      { from: 'api', to: 'inv' },
      { from: 'inv', to: 'hold' },
      { from: 'inv', to: 'pg' },
      { from: 'sweep', to: 'pg' },
      { from: 'api', to: 'saga' },
      { from: 'saga', to: 'inv' },
      { from: 'saga', to: 'pay', bidi: true },
      { from: 'saga', to: 'notif' }
    ]
  },

  scenarios: [
    {
      id: 'queue', title: 'On-sale: waiting room admission', tone: 'info',
      steps: [
        { text: 'Fans arrive before 10:00 and land on a <b>pre-queue</b> page served from the CDN. Nobody has a position yet, so refreshing early gives no advantage.', flow: ['fan>cdn', 'cdn>wr'], badges: { wr: '1.8M waiting' } },
        { text: 'At 10:00 everyone in the pre-queue gets a <b>random position</b>. Later arrivals join at the back (FIFO). Randomizing stops the fastest scripts from taking the front.', nodes: ['wr'], badges: { wr: 'shuffled' }, ok: ['wr'] },
        { text: 'The room admits users at a fixed <b>outflow</b> (say 5,000/min) that the booking API was load-tested for. Each admitted user gets a <b>signed, short-lived access token</b>.', flow: ['wr>cdn', 'cdn>fan'], badges: { fan: 'token ✓' } },
        { text: 'The edge <b>validates the token</b> itself (SeatGeek does this on Fastly), so only admitted users ever reach origin. Everyone else costs a CDN hit.', flow: ['fan>cdn', 'cdn>api'], badges: { api: '≈ 830 req/s' }, tone: 'ok' }
      ]
    },
    {
      id: 'book', title: 'Hold → pay → confirm', tone: 'ok',
      steps: [
        { text: 'The fan picks seats A-12 and A-13. The booking API sends a hold request with an <b>idempotency key</b>.', flow: ['fan>cdn', 'cdn>api', 'api>inv'] },
        { text: 'One atomic statement: <code>UPDATE seats SET status=\'HELD\', hold_until=now()+8 min WHERE seat_id IN (…) AND status=\'AVAILABLE\'</code>. 2 rows updated = success.', flow: ['inv>pg', 'inv>hold'], badges: { pg: ['2 rows', 'ok'] } },
        { text: 'Checkout starts the <b>saga</b>: authorize the card with the PSP using the order\'s idempotency key.', flow: ['fan>cdn', 'cdn>api', 'api>saga', 'saga>pay'], badges: { pay: 'authorized' } },
        { text: 'Confirm: <code>UPDATE … SET status=\'SOLD\' WHERE hold_id=? AND hold_until &gt; now()</code>. Only then capture the payment.', flow: ['saga>inv', 'inv>pg', 'saga>pay'], badges: { pg: ['SOLD', 'ok'] } },
        { text: 'Tickets are issued and the fan is notified. The seat-map cache picks up the change within a second or two.', flow: ['saga>notif'], ok: ['notif'], badges: { notif: '2 tickets' }, tone: 'ok' }
      ]
    },
    {
      id: 'race', title: 'Two fans click the same seat', tone: 'warn',
      steps: [
        { text: 'Both fans saw A-12 as available on a cached seat map and click at the same moment. Both requests reach the inventory service.', flow: [['fan>cdn', 'fan>cdn'], 'cdn>api', 'api>inv'], badges: { inv: '2 requests' }, warn: ['inv'] },
        { text: 'Both run the conditional UPDATE. Postgres row-locks A-12 for the first; the second <b>waits</b> for that commit, then re-checks <code>status = \'AVAILABLE\'</code>: now false.', flow: ['inv>pg'], badges: { pg: ['1 row · 0 rows', 'warn'] }, tone: 'warn' },
        { text: 'Winner gets the hold. Loser gets <b>409 Conflict</b> immediately, with nearby alternatives. No retry loop, no deadlock, no double sale.', flow: ['inv>pg', 'api>cdn', 'cdn>fan'], badges: { fan: ['A-14 instead?', 'info'] }, tone: 'ok' }
      ]
    },
    {
      id: 'fail', title: 'Payment fails / hold expires', tone: 'err',
      steps: [
        { text: 'The card is declined. The saga runs the <b>compensating step</b> for the hold: release the seats.', flow: ['api>saga', 'saga>pay'], err: ['pay'], badges: { pay: ['declined', 'err'] }, tone: 'err' },
        { text: '<code>UPDATE seats SET status=\'AVAILABLE\', hold_id=NULL WHERE hold_id=?</code>. The seats are back on the map within seconds.', flow: ['saga>inv', 'inv>pg', 'inv>hold'], badges: { pg: 'released' } },
        { text: 'Another fan simply walked away. Their hold is still there, so the <b>sweeper</b> releases holds past <code>hold_until</code> in small <code>FOR UPDATE SKIP LOCKED</code> batches. (Holds also count as free once expired, so the sweeper is only cleanup.)', flow: ['sweep>pg'], badges: { sweep: '312 expired' }, warn: ['sweep'] },
        { text: 'Edge case: the payment succeeds <b>after</b> the hold expired and the seat was resold. The confirm UPDATE matches 0 rows, so the saga <b>voids or refunds</b> the payment instead of selling a seat twice.', flow: ['saga>inv', 'inv>pg', 'saga>pay'], badges: { pay: ['refund', 'warn'] }, tone: 'ok' }
      ]
    },
    {
      id: 'bots', title: 'Mega on-sale + bot surge', tone: 'warn',
      steps: [
        { text: 'A superstar tour goes on sale. Traffic is many times any previous peak, and a large share is <b>bots</b> and people without presale codes.', flow: [['fan>cdn', 'fan>cdn', 'fan>cdn']], err: ['cdn'], badges: { cdn: ['4× peak', 'err'] }, tone: 'err' },
        { text: '<b>Before</b> the sale: pre-registration (like Verified Fan) screens accounts and texts unique codes in batches, so demand is known and bots are filtered early.', nodes: ['wr'], labels: { wr: { label: 'Presale codes', sub: 'pre-registered fans' } }, ok: ['wr'] },
        { text: 'At the edge: bot scoring, rate limits per IP/device, and token checks drop junk before it costs origin anything.', nodes: ['cdn'], warn: ['cdn'], badges: { cdn: ['WAF', 'warn'] } },
        { text: 'Behind it, the waiting room keeps the booking path at its tested rate. If something still breaks, <b>lower the outflow</b> rather than letting the database fall over.', flow: ['cdn>wr', 'wr>cdn', 'cdn>api', 'api>inv', 'inv>pg'], ok: ['api', 'pg'], badges: { api: 'steady' }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Five decisions that decide whether on-sale day is boring or front-page news. Numbers are illustrative (origin capacity ≈ 10K req/s, 50,000 seats).',
    controls: [
      { id: 'cc', label: 'Concurrency control on a seat', type: 'seg', value: 'cond', options: [
        { v: 'pess', l: 'SELECT … FOR UPDATE' }, { v: 'opt', l: 'Optimistic @Version' }, { v: 'cond', l: 'Conditional UPDATE' }, { v: 'redis', l: 'Redis SET NX hold' }] },
      { id: 'wr', label: 'Virtual waiting room', type: 'seg', value: 'on', options: [
        { v: 'on', l: 'On (5,000 admitted/min)' }, { v: 'off', l: 'Off' }] },
      { id: 'ttl', label: 'Hold TTL', type: 'range', min: 1, max: 20, step: 1, value: 8, unit: 'min' },
      { id: 'saga', label: 'Order saga style', type: 'seg', value: 'orch', options: [
        { v: 'orch', l: 'Orchestration' }, { v: 'chor', l: 'Choreography (events)' }] },
      { id: 'demand', label: 'Demand', type: 'seg', value: 'mega', options: [
        { v: 'normal', l: 'Regular show' }, { v: 'mega', l: 'Mega on-sale' }] }
    ],
    evaluate(s) {
      const arrivals = s.demand === 'mega' ? 500000 : 2000;          // users / min trying to buy
      const admitted = s.wr === 'on' ? Math.min(arrivals, 5000) : arrivals;
      const rps = admitted * 10 / 60;
      const load = rps / 10000;
      const seats = 50000;
      const held = Math.min(seats, admitted * 2.5 * 0.1 * s.ttl); // ~10% of holds abandoned (estimate)
      const complete = 1 - Math.exp(-s.ttl / 2.5);
      const hot = s.demand === 'mega';
      const cc = {
        pess: { ds: 'none: row lock serializes buyers', dss: 0.95, cont: hot ? 'losers queue on hot rows; lock held across app round-trips' : 'short waits, then "taken"', cs: hot ? 0.3 : 0.75, sub: 'SELECT … FOR UPDATE' },
        opt: { ds: 'none: version check at commit', dss: 0.95, cont: hot ? 'most attempts fail at commit and retry' : 'rare conflicts, cheap retry', cs: hot ? 0.45 : 0.8, sub: '@Version check' },
        cond: { ds: 'none: one atomic predicate', dss: 0.95, cont: 'loser sees 0 rows right after the winner commits', cs: 0.85, sub: 'conditional UPDATE' },
        redis: { ds: 'none if the DB confirm is also conditional', dss: 0.8, cont: 'SET NX fails in microseconds; DB untouched', cs: 0.95, sub: 'SET NX PX hold' }
      }[s.cc];
      const metrics = [
        { k: 'Origin load', v: SD.fmt.num(rps) + ' req/s (' + Math.round(load * 100) + '% of capacity)', s: load < 0.6 ? 0.9 : load < 1 ? 0.55 : 0.05 },
        { k: 'Double-sell risk', v: cc.ds, s: cc.dss },
        { k: 'Losing clicks', v: cc.cont, s: cc.cs },
        { k: 'Seats locked by abandoned carts', v: SD.fmt.num(held) + ' (' + Math.round(held / seats * 100) + '% of inventory)', s: held / seats < 0.15 ? 0.9 : held / seats < 0.35 ? 0.55 : 0.2 },
        { k: 'Checkouts finished in time', v: Math.round(complete * 100) + '%', s: complete },
        { k: 'Failure handling', v: s.saga === 'orch' ? 'one state machine; stuck orders are queryable' : 'services react to events; harder to trace', s: s.saga === 'orch' ? 0.85 : 0.6 },
        { k: 'Fairness', v: s.wr === 'on' ? 'random pre-queue, then FIFO' : 'fastest client wins (bots)', s: s.wr === 'on' ? 0.85 : hot ? 0.1 : 0.5 }
      ];
      const notes = [];
      if (s.cc === 'pess') notes.push('<code>SELECT … FOR UPDATE</code> then <code>UPDATE</code> holds the row lock for the whole transaction, including any app logic in between. Lock seats in a <b>consistent order</b> (by seat_id) or multi-seat holds can deadlock.');
      if (s.cc === 'opt') notes.push('JPA <code>@Version</code> adds <code>WHERE version = ?</code> to the UPDATE and throws <code>OptimisticLockException</code> on 0 rows. Great when conflicts are rare; on hot seats most transactions do the work and then lose.');
      if (s.cc === 'cond') notes.push('One statement does check-and-set. Under READ COMMITTED a concurrent UPDATE waits for the first to commit, then <b>re-evaluates the WHERE</b> on the new row version and matches 0 rows.');
      if (s.cc === 'redis') notes.push('Redis absorbs the stampede: a Lua script does all-or-nothing <code>SET NX PX</code> for the seats. The DB still confirms with a conditional UPDATE, so a Redis failover can never cause a double sale.');
      if (s.wr === 'off' && hot) notes.push('Without a queue, ' + SD.fmt.num(arrivals) + ' users/min hit origin directly. Autoscaling app servers does not help: contention is on the same few thousand seat rows.');
      if (s.ttl <= 3) notes.push('Short holds punish slow payers (3-D Secure, typing card numbers) and cause churn as seats bounce back and forth.');
      if (s.ttl >= 12) notes.push('Long holds lock inventory for abandoned carts, so the event looks <b>sold out</b> and then seats reappear later.');
      if (s.saga === 'chor') notes.push('Choreography: inventory, payment and ticketing react to each other\'s events on a bus. Fewer moving parts, but no single place shows where an order is stuck.');
      let verdict;
      if (s.wr === 'off' && hot) verdict = '❌ <b>Origin melts.</b> ' + SD.fmt.num(rps) + ' req/s against ~10K capacity, and bots get the best seats. Put a waiting room in front.';
      else if (s.cc === 'pess' && hot) verdict = '⚠ <b>Correct but slow under a stampede:</b> buyers queue on row locks for the hottest seats. Prefer a single conditional UPDATE or a Redis hold layer.';
      else if (s.ttl <= 2) verdict = '⚠ <b>Holds are too short</b> for real checkouts; many buyers lose seats mid-payment.';
      else if (s.ttl >= 15 && hot) verdict = '⚠ <b>Phantom sell-out:</b> abandoned holds lock a big share of seats. Use 5–10 minutes.';
      else if (s.cc === 'redis' && s.wr === 'on') verdict = '✅ <b>Built for flash sales:</b> queue at the edge, atomic Redis holds for the stampede, and a conditional UPDATE in Postgres as the source of truth.';
      else if (s.cc === 'cond' && s.wr === 'on') verdict = '✅ <b>Simple and correct:</b> waiting room + one conditional UPDATE per transition + an orchestrated saga. A strong interview answer.';
      else verdict = '👍 Works. Check the meters to see which trade-off you are paying for.';
      const labels = {
        inv: { label: 'Inventory service', sub: cc.sub },
        hold: s.cc === 'redis' ? { label: 'Redis holds', sub: 'Lua · SET NX PX' } : { label: 'Seat-map cache', sub: 'Redis · availability' },
        saga: s.saga === 'orch' ? { label: 'Order saga', sub: 'orchestrator' } : { label: 'Event bus', sub: 'choreography' },
        sweep: { label: 'Hold sweeper', sub: 'TTL ' + s.ttl + ' min' }
      };
      const flow = (s.wr === 'on' ? ['fan>cdn', 'cdn>wr', 'wr>cdn', 'cdn>api'] : ['fan>cdn', 'cdn>api'])
        .concat(['api>inv'], s.cc === 'redis' ? ['inv>hold', 'inv>pg'] : ['inv>pg'], ['api>saga', 'saga>pay']);
      return {
        metrics, verdict, notes, labels, flow,
        hide: s.wr === 'on' ? [] : ['wr'],
        hot: s.cc === 'redis' ? ['hold'] : [],
        warn: (s.cc === 'pess' && hot ? ['pg'] : []).concat(s.ttl >= 15 ? ['sweep'] : []),
        err: load >= 1 ? ['api', 'cdn'] : [],
        badges: { api: [SD.fmt.num(rps) + ' req/s', load >= 1 ? 'err' : load >= 0.6 ? 'warn' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Seat race: three buyers, one seat',
    caption: 'Pick a concurrency strategy, then <b>tap a seat</b> (or press Race). Ann, Ben and Cy try to hold it within milliseconds. The lanes show <b>reads, lock waits, writes, conflicts and commits</b>. Try "No locking" to see a double sale, then watch held seats expire when nobody pays.'
  },

  realWorld: {
    intro: 'The best-documented flash sale is also the most famous failure. The fixes the industry converged on are queues, pre-registration and atomic holds.',
    timeline: [
      { when: '2017–18', who: 'Ticketmaster', title: 'Verified Fan', text: 'Fans register before the sale; accounts are screened and selected fans get unique codes, <b>texted in batches</b> to spread server load. Ticketmaster claimed about a <b>90%</b> success rate at blocking bots at the time.', src: 0 },
      { when: 'Queue-it docs', who: 'Queue-it', title: 'Pre-queue randomization, then FIFO', text: 'Visitors who arrive before the sale wait without a position. At sale start everyone in the pre-queue gets a <b>random</b> place; later arrivals queue FIFO. Outflow is set in visitors per minute and can change live; users return with a <b>signed token</b>.', src: 1 },
      { when: 'by 2022', who: 'SeatGeek', title: 'Own virtual waiting room', text: 'SeatGeek replaced a third-party queue with its own, on <b>AWS Lambda + DynamoDB</b> for queue state, with token validation and routing at the <b>Fastly</b> edge to cut origin load and latency.', src: 2 },
      { when: 'Nov 15, 2022', who: 'Ticketmaster', title: 'Eras Tour presale', text: '<b>3.5M</b> fans registered for Verified Fan; <b>1.5M</b> were invited and 2M wait-listed. Bots and fans without codes drove <b>3.5B system requests</b>, 4× the previous peak. Over 2M tickets still sold that day; Ticketmaster said about 15% of interactions had issues, and the general on-sale was cancelled.', src: 3 },
      { when: 'Jan 2023', who: 'Live Nation', title: 'Senate testimony', text: 'Live Nation\'s president said the presale saw <b>three times</b> more bot traffic than Ticketmaster had ever experienced and, for the first time in some 400 Verified Fan sales, bots attacked the Verified Fan servers themselves. The company had to slow and pause the sale.', src: 4 }
    ],
    lessons: [
      '<span><b>Shape demand before it arrives</b>: pre-registration, codes and randomized pre-queues.</span>',
      '<span>The origin should see a <b>constant, tested rate</b>; the queue absorbs everything else.</span>',
      '<span>Make every seat transition <b>one atomic conditional write</b>, and treat expired holds as free.</span>',
      '<span>Payments and seats are a <b>saga</b>: every step needs a compensation, including "paid after the hold expired".</span>'
    ],
    sources: [
      { title: 'Verified Fan', url: 'https://www.sportsbusinessdaily.com/Journal/Issues/2018/01/15/In-Depth/Verified-Fan.aspx', pub: 'Sports Business Journal, 2018' },
      { title: 'First-in-first-out vs randomization in a virtual waiting room', url: 'https://www.queue-it.com/blog/first-in-first-out-randomization', pub: 'Queue-it' },
      { title: 'Build a virtual waiting room with Amazon DynamoDB and AWS Lambda at SeatGeek', url: 'https://aws.amazon.com/blogs/architecture/build-a-virtual-waiting-room-with-amazon-dynamodb-and-aws-lambda-at-seatgeek/', pub: 'AWS Architecture Blog' },
      { title: 'The Taylor Swift Onsale Explained (Ticketmaster blog, archived copy)', url: 'https://www.ticketnews.com/wp-content/uploads/The-Taylor-Swift-Onsale-Explained-Ticketmaster-Blog.pdf', pub: 'Ticketmaster, Nov 2022' },
      { title: 'Here\'s how Ticketmaster explained the Taylor Swift tour debacle to Congress', url: 'https://www.semafor.com/article/01/24/2023/heres-how-ticketmaster-explained-the-taylor-swift-tour-debacle-to-congress', pub: 'Semafor, 2023' },
      { title: 'How SeatGeek successfully handles high-demand ticket sales (slides)', url: 'https://archive.qconlondon.com/system/files/presentation-slides/qcon_london_seatgeek.pdf', pub: 'QCon London' },
      { title: 'Ticketmaster extends presale period for Taylor Swift Eras tour', url: 'https://www.cnbc.com/2022/11/15/taylor-swift-eras-tour-presale-extended-by-ticketmaster.html', pub: 'CNBC, 2022' },
      { title: 'Postgres 9.5 feature highlight: SKIP LOCKED for row-level locking', url: 'https://paquier.xyz/postgresql-2/postgres-9-5-feature-highlight-skip-locked-row-level/', pub: 'Michael Paquier' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Seat locking', '<b>Pessimistic</b> <code>FOR UPDATE</code>: simple reasoning', '<b>Conditional UPDATE</b> / optimistic version', 'Conditional UPDATE for single-step transitions; FOR UPDATE only when you must read, decide in code, then write'],
      ['Hold store', '<b>Postgres only</b>: one source of truth', '<b>Redis holds</b> + Postgres confirm', 'Postgres alone for normal events; add Redis when a few thousand rows take a stampede'],
      ['Admission', '<b>Waiting room</b>: fixed outflow, fair', '<b>Autoscale</b> and hope', 'Waiting room for any sale where demand can exceed inventory by 10×'],
      ['Queue order', '<b>Randomized pre-queue</b>', '<b>Strict FIFO</b>', 'Randomize for scheduled on-sales; FIFO when the queue is a safety valve for unplanned spikes'],
      ['Saga', '<b>Orchestration</b>: one coordinator', '<b>Choreography</b>: events between services', 'Orchestrate money flows that need visibility and timeouts; choreograph simple notifications'],
      ['Hold TTL', '<b>Short (2–3 min)</b>: inventory flows', '<b>Long (15+ min)</b>: relaxed checkout', '5–10 minutes, with a visible countdown']
    ]
  },
  failures: [
    { f: 'Double sale', detect: 'Two SOLD tickets for one seat (reconciliation job)', fix: 'Single conditional UPDATE per transition; unique (event, seat) on tickets; confirm only WHERE hold_id matches.' },
    { f: 'Origin overload at on-sale', detect: 'Error rate, p99, DB connections', fix: 'Waiting room with a tested outflow; lower outflow live; serve the seat map from cache.' },
    { f: 'Bots take inventory', detect: 'Velocity per account / card / device', fix: 'Pre-registration codes, edge bot scoring, per-account limits, signed queue tokens bound to the visitor.' },
    { f: 'Holds never released', detect: 'Count of HELD past hold_until', fix: 'Treat expired holds as available in the hold query; sweeper with SKIP LOCKED batches.' },
    { f: 'Paid but hold expired', detect: 'Confirm UPDATE returns 0 rows', fix: 'Saga voids the authorization or refunds; try equivalent seats first if policy allows.' },
    { f: 'Duplicate checkout clicks', detect: 'Same idempotency key twice', fix: 'Unique idempotency key on holds and orders; return the stored result.' },
    { f: 'Hot rows (front sections)', detect: 'Lock wait time per seat range', fix: 'Redis hold layer; short transactions; general-admission counters instead of per-seat rows.' }
  ],

  interview: [
    { q: 'How do you prevent double booking?', a: '<p>Make each transition a <b>single atomic conditional write</b> on the seat row:</p><p><code>UPDATE seats SET status=\'HELD\', hold_id=?, hold_until=now()+interval \'8 min\' WHERE seat_id=? AND status=\'AVAILABLE\'</code></p><p>1 row = you got it, 0 rows = someone else did. Confirm the same way (<code>WHERE hold_id=? AND hold_until &gt; now()</code>). Add a unique constraint on issued tickets per (event, seat) as a last line of defence.</p>', lvl: 'core' },
    { q: 'Pessimistic lock, optimistic version, or conditional UPDATE?', a: '<ul><li><b>FOR UPDATE:</b> read-lock-decide-write; losers wait on the lock. Fine at low contention; queues up on hot seats.</li><li><b>Optimistic @Version:</b> no locks while thinking; conflicts detected at commit. Wasteful when conflicts are common.</li><li><b>Conditional UPDATE:</b> the check is in the WHERE clause, one statement, shortest lock. Best for "AVAILABLE → HELD".</li></ul>', lvl: 'core' },
    { q: 'Why a waiting room instead of autoscaling?', a: '<p>The bottleneck is not CPU on app servers; it is <b>contention on a few thousand seat rows</b> and on downstream systems like payment. More servers only add more concurrent losers. A queue turns a spike into a constant, load-tested rate, adds fairness, and gives a place to filter bots.</p>', lvl: 'core' },
    { q: 'How do you implement hold expiry?', a: '<p>Store <code>hold_until</code> on the seat. Make the hold query treat <code>status=\'HELD\' AND hold_until &lt; now()</code> as available, so correctness never depends on a timer. A sweeper then resets expired holds in small batches with <code>FOR UPDATE SKIP LOCKED</code> so several workers do not block each other. With Redis holds, the key TTL (<code>PX</code>) does it.</p>', lvl: 'core' },
    { q: 'How do you make booking idempotent?', a: '<p>The client sends an <b>idempotency key</b> per hold and per order. Store it with a unique constraint; a retry returns the stored result instead of creating a second hold or charge. Pass the order\'s key to the PSP too, so a retried authorization is not charged twice.</p>', lvl: 'core' },
    { q: 'Saga or two-phase commit for seats + payment?', a: '<p>The PSP will not join your 2PC, and holding seat locks across a slow external call is exactly what you must avoid. Use a <b>saga</b>: hold (local tx) → authorize → confirm seats (local tx) → capture → issue tickets. Each step has a compensation: release seats, void authorization, refund.</p>', fu: 'Why authorize first and capture last? (So a failed confirm can void instead of refunding.)', lvl: 'deep' },
    { q: 'How do you fight bots?', a: '<ul><li>Pre-registration with screened accounts and unique codes (Verified Fan).</li><li>Randomized pre-queue so speed at 10:00:00 does not matter.</li><li>Edge bot scoring, device and IP rate limits, CAPTCHA on suspicion.</li><li>Queue tokens bound to the visitor and short-lived; per-account ticket limits.</li></ul>', lvl: 'core' },
    { q: 'How do you serve the seat map to a million viewers?', a: '<p>Treat it as a <b>hint</b>: cache availability per section in Redis/CDN with a 1–2 s TTL, or push section-level deltas. The hold request is the real check. Never read the seat table for every map render.</p>', lvl: 'core' },
    { q: 'What if payment succeeds after the hold expired?', a: '<p>The confirm UPDATE matches 0 rows because the seat moved on. The saga must <b>void or refund</b>, and can offer equivalent seats. Authorize-then-capture keeps this cheap: you void an authorization instead of refunding a capture.</p>', lvl: 'deep' },
    { q: 'FIFO or randomized queue: which is fairer?', a: '<p>For a scheduled on-sale, pure FIFO rewards whoever refreshed fastest at the exact second, which favours scripts and fast connections. Randomizing everyone who arrived before the start, then FIFO for later arrivals, is what Queue-it describes. For unplanned spikes, plain FIFO is fine.</p>', lvl: 'core' },
    { q: 'How do you scale inventory writes for a huge stadium?', a: '<p>Partition seats by event (and section). Different sections rarely conflict, so the DB scales with them. For <b>general admission</b>, do not create rows per ticket: use a counter per tier with <code>UPDATE tiers SET sold = sold + :n WHERE id = ? AND sold + :n &lt;= capacity</code>, or split the counter into shards for very hot tiers.</p>', lvl: 'deep' },
    { q: 'What is in the waiting-room token, and who checks it?', a: '<p>A signed (HMAC/JWT) token with event id, visitor id, issue time and short expiry. The <b>edge</b> verifies the signature without calling origin (SeatGeek validates at Fastly), and the booking API verifies it again. Binding it to the visitor stops token sharing and resale.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Postgres: hold, confirm and sweep', lang: 'sql',
      code: `CREATE TABLE seats (
  event_id   bigint,
  seat_id    text,
  status     text NOT NULL DEFAULT 'AVAILABLE',   -- AVAILABLE | HELD | SOLD
  hold_id    uuid,
  hold_until timestamptz,
  PRIMARY KEY (event_id, seat_id)
);
CREATE INDEX seats_expiring ON seats (hold_until) WHERE status = 'HELD';

-- HOLD (inside a tx): app checks row count == seats requested, else ROLLBACK
UPDATE seats
   SET status = 'HELD', hold_id = :hold_id, hold_until = now() + interval '8 minutes'
 WHERE event_id = :event_id AND seat_id = ANY(:seat_ids)
   AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_until < now()))
RETURNING seat_id;

-- CONFIRM after payment authorization: 0 rows => hold expired, void payment
UPDATE seats SET status = 'SOLD'
 WHERE hold_id = :hold_id AND status = 'HELD' AND hold_until > now()
RETURNING seat_id;

-- SWEEP expired holds in small batches; workers skip each other's rows
UPDATE seats SET status = 'AVAILABLE', hold_id = NULL, hold_until = NULL
 WHERE (event_id, seat_id) IN (
   SELECT event_id, seat_id FROM seats
    WHERE status = 'HELD' AND hold_until < now()
    ORDER BY hold_until
    LIMIT 500
    FOR UPDATE SKIP LOCKED);`
    },
    {
      title: 'Spring Boot: idempotent, all-or-nothing hold', lang: 'java',
      code: `public interface SeatRepository extends JpaRepository<Seat, SeatId> {
  @Modifying
  @Query(value = """
      UPDATE seats
         SET status = 'HELD', hold_id = :holdId,
             hold_until = now() + make_interval(mins => :ttl)
       WHERE event_id = :eventId AND seat_id IN (:seatIds)
         AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_until < now()))
      """, nativeQuery = true)
  int hold(@Param("eventId") long eventId, @Param("seatIds") List<String> seatIds,
           @Param("holdId") UUID holdId, @Param("ttl") int ttlMinutes);
}

@Service
public class HoldService {
  private static final int TTL_MIN = 8;
  private final SeatRepository seats;
  private final HoldRepository holds;   // unique index on idempotency_key

  public HoldService(SeatRepository seats, HoldRepository holds) {
    this.seats = seats; this.holds = holds;
  }

  @Transactional
  public Hold hold(long eventId, List<String> seatIds, long userId, UUID idemKey) {
    Optional<Hold> existing = holds.findByIdempotencyKey(idemKey);
    if (existing.isPresent()) return existing.get();          // client retry

    UUID holdId = UUID.randomUUID();
    int updated = seats.hold(eventId, seatIds, holdId, TTL_MIN);
    if (updated != seatIds.size()) {
      // RuntimeException => @Transactional rolls back the partial hold
      throw new SeatsUnavailableException(eventId, seatIds);
    }
    return holds.save(new Hold(holdId, userId, eventId, idemKey,
        Instant.now().plus(TTL_MIN, ChronoUnit.MINUTES)));
  }
}`,
      note: 'Two concurrent retries with the same key can both miss <code>findByIdempotencyKey</code>; the unique index makes the second <code>save</code> fail, and the caller then returns the stored hold. With JPA entities, <code>@Version</code> gives the optimistic variant of the same check.'
    },
    {
      title: 'Redis Lua: atomic multi-seat hold', lang: 'lua',
      code: `-- KEYS: seat keys with one hash tag, e.g. hold:{evt42}:A-12, hold:{evt42}:A-13
-- ARGV[1] = hold_id, ARGV[2] = ttl in ms
-- All or nothing: Redis runs the whole script atomically.
for _, key in ipairs(KEYS) do
  if redis.call('EXISTS', key) == 1 then
    return {0, key}                     -- taken: nothing was changed
  end
end
for _, key in ipairs(KEYS) do
  redis.call('SET', key, ARGV[1], 'PX', ARGV[2])
end
return {1}

-- release.lua: only the owner may release (compare-and-delete)
-- if redis.call('GET', KEYS[1]) == ARGV[1] then
--   return redis.call('DEL', KEYS[1])
-- end
-- return 0`,
      note: 'The <code>{evt42}</code> hash tag puts all of an event\'s seat keys in one Redis Cluster slot, which multi-key scripts require. Redis is the fast filter; Postgres stays the source of truth.'
    }
  ],

  related: ['payment-gateway', 'ecommerce-orders', 'rate-limiter', 'lock-manager', 'cdn', 'notifications']
});
