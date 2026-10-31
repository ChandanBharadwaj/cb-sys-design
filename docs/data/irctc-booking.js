SD.register({
  slug: 'irctc-booking',
  domain: 3,
  title: 'Railway Ticketing (IRCTC)',
  examples: 'IRCTC, CRIS PRS',
  tagline: 'Sell one berth to several passengers for <b>different legs of the same journey</b>, keep a fair waitlist behind it, and survive the <b>10:00 Tatkal rush</b> without selling any seat-segment twice.',
  tldr: {
    problem: 'A train is not a concert hall. A berth from Delhi to Chennai can be sold Delhi→Bhopal to one person and Bhopal→Chennai to another. On top of that sit quotas, RAC, several kinds of waitlist, and a crowd of people and bots that all click at exactly 10:00 for Tatkal.',
    idea: 'Model each berth as a <b>bitmask of route segments</b>. A booking for stations i→j needs bits i…j−1 free, and takes them in one atomic update. Past the berths come <b>RAC</b> (two passengers share a side-lower berth) and an <b>ordered waitlist</b> that is promoted on every cancellation. In front, an edge with bot filtering and an admission gate. Enquiries are served from replicas, so they never steal booking capacity.',
    insight: 'A "full" train is usually only full on <b>some legs</b>. Segment-aware allocation decides how many berth-km you sell and whether long-distance travellers still find a berth. A <b>separate</b> problem is the money: a paid booking must end in <b>exactly one PNR or a refund</b>, even when the confirmation times out.',
    numbers: [
      { v: '30,155/min', l: 'peak e-tickets booked in one minute (IRCTC, 12 Mar 2025, 10:01 AM)' },
      { v: '1.5 lakh/min', l: 'tickets/min target for the new PRS, about 5× the current ~32K (Ministry, 2025)' },
      { v: '~50%', l: 'of logins in the first 5 minutes of Tatkal were bots (Indian Railways, Jun 2025)' }
    ]
  },

  intro: {
    what: 'Railway ticketing sells reserved berths on long-distance trains. You pick a train, a class and the two stations you travel between. The system either <b>confirms a berth</b> for exactly those stations, gives you a shared half-berth, or puts you on a <b>waiting list</b> that moves up when other people cancel.',
    analogy: {
      icon: '🏨',
      title: 'A hotel room sold night by night',
      text: 'A hotel can sell room 12 to one guest for Monday and Tuesday, and to another guest for Wednesday and Thursday. A train berth is the same, except the "nights" are the stretches of track between stations. One berth can carry one passenger from the first station to the third, and another from the third to the last. The analogy breaks in one place: a hotel can move you to another room halfway through your stay, but on a train you <b>keep the same berth for your whole journey</b>. So the system must find one berth that is free on every stretch you need.'
    },
    problem: 'Imagine the booking site marks a berth "sold" as soon as anyone books it, for any distance. Someone travels only the first three hours, and the berth then rolls empty for the next twenty, while people who wanted those later stretches are told the train is full. At the same time, hundreds of thousands of people and scripts open the site at the same second for last-minute tickets. The system answers <b>"which berth, for which stretch, goes to whom, exactly once, and in a fair order?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'One berth, one buyer, one database',
        text: 'Each berth is one row with a status: <b>free</b> or <b>sold</b>. Every visitor goes straight to that one reservation database, both to look at availability and to book. It is simple, and it is how most seat-booking systems start.',
        scene: {
          nodes: [
            { id: 'p1', label: 'Passenger 1', sub: 'wants A → C', kind: 'client', at: [70, 0] },
            { id: 'p2', label: 'Passenger 2', sub: 'wants C → F', kind: 'client', at: [350, 0] },
            { id: 'app', label: 'Booking site', sub: 'check, then sell', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Berths DB', sub: 'row: free / sold', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'p1', to: 'app' }, { from: 'p2', to: 'app' }, { from: 'app', to: 'db' }],
          flow: ['p1>app', 'app>db', 'p2>app', 'app>db']
        }
      },
      {
        stage: 'breaks',
        title: 'Empty berths on a "full" train, and a crowd at 10:00',
        text: 'Passenger 1 books A→C and the whole berth becomes <b>sold</b>, so passenger 2 is told "full" for C→F while the berth rolls empty. Then the daily last-minute window opens: a huge crowd plus <b>bots</b> refresh availability and book in the same second, and the one database chokes on both.',
        scene: {
          nodes: [
            { id: 'p1', label: 'Passenger 1', sub: 'booked A → C', kind: 'client', at: [70, 0] },
            { id: 'bots', label: 'Bots + crowd', sub: 'refresh at 10:00', kind: 'client', at: [210, 0] },
            { id: 'p2', label: 'Passenger 2', sub: 'told: FULL', kind: 'client', at: [350, 0] },
            { id: 'app', label: 'Booking site', sub: 'flooded', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Berths DB', sub: 'empty after C', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'p1', to: 'app' }, { from: 'bots', to: 'app' }, { from: 'p2', to: 'app' }, { from: 'app', to: 'db' }],
          flow: [['p1>app', 'bots>app', 'p2>app'], ['bots>app'], 'app>db'],
          err: ['db', 'p2'],
          warn: ['app', 'bots'],
          badges: { db: ['wasted berth', 'err'], app: ['overloaded', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Sell stretches, not berths, and guard the door',
        text: 'Each berth keeps a <b>list of stretches it is sold for</b>, so A→C and C→F share one berth. At the door, an edge layer drops bots and lets people in at a steady rate. Availability is answered from a <b>copy</b> of the data, so only real bookings reach the reservation engine.',
        scene: {
          nodes: [
            { id: 'p1', label: 'Passenger 1', sub: 'wants A → C', kind: 'client', at: [70, 0] },
            { id: 'bots', label: 'Bots', sub: 'blocked', kind: 'client', at: [210, 0] },
            { id: 'p2', label: 'Passenger 2', sub: 'wants C → F', kind: 'client', at: [350, 0] },
            { id: 'edge', label: 'Edge + gate', sub: 'bot filter · pace', kind: 'edge', at: [210, 110] },
            { id: 'cache', label: 'Seat copy', sub: 'answers enquiries', kind: 'cache', at: [70, 220] },
            { id: 'db', label: 'Booking engine', sub: 'stretch-by-stretch', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'p1', to: 'edge' }, { from: 'bots', to: 'edge' }, { from: 'p2', to: 'edge' }, { from: 'edge', to: 'cache' }, { from: 'edge', to: 'db' }],
          flow: [['p1>edge', 'p2>edge'], 'edge>cache', 'edge>db'],
          ok: ['edge', 'db'],
          err: ['bots'],
          badges: { db: ['A→C + C→F ✓', 'ok'], bots: ['dropped', 'err'] }
        }
      }
    ],
    usedBy: ['IRCTC (Indian Railways e-ticketing)', 'CRIS Passenger Reservation System', 'Indian Railways counter (PRS) terminals', 'Long-distance rail and coach operators that sell intermediate stops'],
    whenToUse: [
      'One physical unit (a berth, a seat, a bus seat) can be sold for <b>several non-overlapping legs</b> of a route',
      'Demand is far above supply and people accept a <b>queue position</b> (waitlist) instead of a flat "sold out"',
      'A fixed release time (like Tatkal at 10:00) creates a predictable spike you can plan for'
    ],
    whenNot: [
      'Every seat is sold for one whole event, like a concert or a cinema show: use <a href="ticket-booking.html">Ticket Booking &amp; Flash Sales</a>',
      'The rush is a short time-slot release with no route segments, like temple darshan: see <a href="ttd-darshan-booking.html">Temple Darshan Booking Queue</a>',
      'You only need to tell people where the train is: see <a href="train-tracking.html">Live Train Tracking</a>'
    ],
    glossary: [
      { term: 'PRS', def: 'Passenger Reservation System: the Indian Railways booking engine, built and run by CRIS, that owns berths and issues PNRs for both counters and IRCTC.' },
      { term: 'PNR', def: 'Passenger Name Record: the 10-digit booking number that identifies one ticket and its passengers.' },
      { term: 'Segment', def: 'One stretch of track between two consecutive stations on the train\'s route.' },
      { term: 'Segment bitmask', def: 'Our way of storing a berth: one bit per segment, set when that stretch is sold.' },
      { term: 'Quota', def: 'A share of berths kept for one group, such as General, Tatkal, Ladies or Senior Citizens.' },
      { term: 'Tatkal', def: 'Last-minute quota that opens the day before travel: 10:00 for AC classes, 11:00 for non-AC.' },
      { term: 'RAC', def: 'Reservation Against Cancellation: you may board and share a side-lower berth with one other RAC passenger until a berth frees up.' },
      { term: 'Charting', def: 'Freezing the passenger list before departure: waitlist and RAC are promoted one last time, and still-waitlisted e-tickets are cancelled and refunded.' }
    ]
  },

  requirements: {
    functional: [
      'Search trains and show availability per class, quota and <b>station pair</b>',
      'Book up to a few passengers per PNR; allocate a berth free on every segment, else RAC, else waitlist',
      'Pay by card, net banking or UPI through a gateway; issue PNR and e-ticket',
      'Cancel with refund; promote RAC → CNF and WL → RAC in order',
      'Prepare charts before departure; auto-cancel still-waitlisted e-tickets',
      'Enforce quotas and Tatkal rules (opening times, Aadhaar-verified users, agent windows)'
    ],
    nonFunctional: [
      '<b>Never sell one berth-segment twice</b>',
      'Paid ⇒ exactly one PNR <b>or</b> an automatic refund',
      'Absorb the 10:00 / 11:00 Tatkal spike at a tested booking rate',
      'Enquiry traffic must not starve bookings',
      'Fair to humans: bots and agents filtered in the Tatkal window',
      'Availability may be seconds stale; the booking itself never is'
    ],
    outOfScope: ['Fare rules and dynamic-fare formulas', 'Catering, tourism and other IRCTC services', 'Live train position (see Train Tracking)', 'Counter-terminal hardware']
  },

  calculator: {
    inputs: [
      { id: 'att', label: 'Booking attempts per minute at 10:00 (humans + bots)', min: 10000, max: 1000000, value: 120000, log: true },
      { id: 'bot', label: 'Share of attempts that are bots', min: 0, max: 90, value: 50, unit: '%' },
      { id: 'cap', label: 'Booking capacity (tickets / min)', min: 5000, max: 200000, value: 32000, log: true },
      { id: 'pax', label: 'Passengers per ticket (PNR)', min: 1, max: 6, step: 0.5, value: 2 },
      { id: 'enq', label: 'Availability enquiries per booking attempt', min: 1, max: 50, value: 15 },
      { id: 'tq', label: 'Tatkal berths released at 10:00 (all AC trains)', min: 10000, max: 1000000, value: 200000, log: true }
    ],
    outputs: [
      { label: 'Human booking attempts / min', f: (v) => v.att * (1 - v.bot / 100) },
      { label: 'Share of human attempts served each minute', fmt: 'pct', f: (v) => Math.min(1, v.cap / Math.max(1, v.att * (1 - v.bot / 100))) },
      { label: 'Berths consumed per minute', f: (v) => Math.min(v.cap, v.att * (1 - v.bot / 100)) * v.pax },
      { label: 'Time until Tatkal berths sell out', fmt: 'ms', f: (v) => v.tq / (Math.min(v.cap, v.att * (1 - v.bot / 100)) * v.pax) * 60000 },
      { label: 'Enquiries / s if nothing is filtered', f: (v) => v.att * v.enq / 60 },
      { label: 'Bot attempts to drop at the edge / min', f: (v) => v.att * v.bot / 100 }
    ],
    note: 'The 32K tickets/min default is the Ministry\'s figure for the current PRS. The official IRCTC peak is 30,155 tickets in one minute. The 50% bot share is the Railways\' figure for <b>logins</b> in the first 5 minutes of Tatkal. Everything else (attempts, enquiries per attempt, Tatkal berths) is an <em>estimate</em>. Notice that when attempts far exceed capacity, the sell-out time depends only on <b>capacity × passengers per PNR</b>. Adding more people only lowers everyone\'s chance.'
  },

  api: [
    { m: 'POST', p: '/v1/session/login', d: 'User id + password + captcha → OTP challenge. Tatkal booking online needs an <b>Aadhaar-authenticated</b> account (since 1 Jul 2025).' },
    { m: 'GET', p: '/v1/availability?train&date&class&quota&from&to', d: 'Served from <b>read replicas / cache</b> with a short TTL. It is a hint: <code>AVAILABLE-12</code>, <code>RAC 4</code>, <code>GNWL 37</code>. The booking decides.' },
    { m: 'POST', p: '/v1/bookings', d: '<code>{train, date, class, quota, from, to, passengers[], idempotency_key}</code> → <code>intent_id</code>, fare and a payment redirect. Same key ⇒ same intent.' },
    { m: 'POST', p: '/v1/payments/callback', d: 'Signed gateway / UPI callback. Moves the intent to PAID once (conditional update), then calls PRS to allocate and issue the PNR.' },
    { m: 'GET', p: '/v1/pnr/{pnr}', d: 'Booking status and current status per passenger (<code>CNF B3/21</code>, <code>RAC 2</code>, <code>GNWL 5</code>) and chart status.' },
    { m: 'POST', p: '/v1/pnr/{pnr}/cancel', d: 'Frees the passenger\'s segments, triggers in-order promotion (RAC → CNF, WL → RAC), and starts the refund.' }
  ],
  dataModel: [
    { name: 'berth_inventory', store: 'PRS DB · partitioned by (train, date)', fields: [['(train_no, journey_date, coach, berth)', 'int, date, text, int', 'pk'], ['class, quota', 'text', 'idx'], ['occupied', 'int bitmask (bit k = segment k)'], ['berth_type', 'LB | MB | UB | SL | SU']], note: '<b>Our design.</b> CRIS internals are not public. A booking for i→j needs <code>occupied &amp; mask(i,j) = 0</code>.' },
    { name: 'booking_intent', store: 'IRCTC DB', fields: [['intent_id', 'uuid', 'pk'], ['idempotency_key', 'uuid (unique)', 'idx'], ['user_id', 'bigint', 'idx'], ['state', 'CREATED | PAID | UNKNOWN | CONFIRMED | REFUND_PENDING | REFUNDED'], ['gateway_txn', 'text', 'idx'], ['pnr', 'char(10)']], note: 'The bridge between money and tickets. The reconciler scans PAID / UNKNOWN rows.' },
    { name: 'passenger', store: 'PRS DB', fields: [['(pnr, pax_no)', 'char(10), int', 'pk'], ['from_idx, to_idx', 'smallint'], ['booking_status', 'CNF | RAC n | GNWL n | TQWL n …'], ['current_status', 'same, updated on promotion'], ['berth_ref', 'fk', 'fk']] },
    { name: 'waitlist', store: 'PRS DB', fields: [['(train_no, journey_date, class, wl_type)', 'key', 'pk'], ['position', 'int', 'sk'], ['pnr, pax_no', 'fk', 'fk'], ['from_idx, to_idx', 'smallint']], note: 'Promotion scans in position order but only promotes passengers whose segments fit the freed space.' }
  ],

  architecture: {
    title: 'IRCTC front end + CRIS PRS booking engine',
    nodes: [
      { id: 'user', label: 'Passenger app/web', sub: 'search · book · pay', kind: 'client', wide: [90, 220], tall: [210, 0], tip: 'IRCTC website and Rail Connect app. At Tatkal time, many users open several tabs and refresh; agents and bots do the same.' },
      { id: 'cdn', label: 'Edge CDN + bot', sub: 'Akamai · WAF · bot score', kind: 'edge', wide: [280, 220], tall: [210, 105], tip: 'Static pages from the edge; anti-bot scoring (the Ministry says Akamai anti-bot is deployed) drops scripted logins before they reach origin.' },
      { id: 'auth', label: 'Login & identity', sub: 'captcha · OTP · Aadhaar', kind: 'service', wide: [280, 0], tall: [350, 105], tip: 'Captcha and OTP at login. Since 1 Jul 2025 only Aadhaar-authenticated users may book Tatkal online; suspicious IDs are deactivated.' },
      { id: 'enq', label: 'Enquiry service', sub: 'trains · fares · seats', kind: 'service', wide: [470, 110], tall: [70, 210], tip: 'Read-only: train lists, fares and availability. Kept apart from the booking path so a flood of refreshes cannot slow bookings.' },
      { id: 'cache', label: 'Availability cache', sub: 'read replicas · TTL', kind: 'cache', wide: [660, 110], tall: [70, 315], tip: 'Our design: per (train, date, class, quota) counters and WL tails, refreshed from PRS replicas every few seconds.' },
      { id: 'gate', label: 'Admission gate', sub: 'rate limit · queue', kind: 'edge', wide: [470, 330], tall: [350, 210], tip: 'Our design: per-user and per-IP limits plus a paced queue so the booking path sees a tested rate, whatever the crowd size.' },
      { id: 'book', label: 'Booking service', sub: 'IRCTC · idempotent', kind: 'service', wide: [660, 330], tall: [350, 315], tip: 'Creates a booking intent with an idempotency key, redirects to payment, and calls PRS once the payment is confirmed.' },
      { id: 'prs', label: 'CRIS PRS', sub: 'bitmask · RAC · WL · PNR', kind: 'store', wide: [880, 220], tall: [210, 420], tip: 'The Passenger Reservation System (CRIS). Owns the berth inventory for counters and internet alike, allocates CNF / RAC / WL and issues the PNR.' },
      { id: 'chart', label: 'Charting', sub: 'final promote · T−8 h', kind: 'compute', wide: [880, 0], tall: [70, 525], tip: 'First chart about 8 hours before departure (from Jul 2025), final chart about 30 minutes before. Promotes WL/RAC; cancels still-waitlisted e-tickets.' },
      { id: 'pay', label: 'Payment gateway', sub: 'cards · UPI · netbank', kind: 'external', wide: [660, 440], tall: [350, 420], tip: 'Banks, card networks and UPI. Callbacks can arrive late, twice, or not at all.' },
      { id: 'recon', label: 'Reconciliation', sub: 'payment ↔ PNR · refund', kind: 'compute', wide: [880, 440], tall: [350, 525], tip: 'Matches gateway settlements against PNRs. Paid without a PNR ⇒ ask PRS by intent id; if nothing was booked, refund automatically.' },
      { id: 'notify', label: 'SMS / e-ticket', sub: 'PNR · status alerts', kind: 'service', wide: [470, 440], tall: [70, 420], tip: 'Sends the e-ticket and PNR, then status changes (RAC → CNF, chart prepared, refund).' }
    ],
    edges: [
      { from: 'user', to: 'cdn', bidi: true },
      { from: 'cdn', to: 'auth' },
      { from: 'cdn', to: 'enq' },
      { from: 'enq', to: 'cache' },
      { from: 'prs', to: 'cache', dashed: true, label: 'replicate' },
      { from: 'cdn', to: 'gate' },
      { from: 'gate', to: 'book' },
      { from: 'book', to: 'prs' },
      { from: 'book', to: 'pay', bidi: true },
      { from: 'book', to: 'notify' },
      { from: 'recon', to: 'pay' },
      { from: 'recon', to: 'prs' },
      { from: 'chart', to: 'prs' }
    ]
  },

  scenarios: [
    {
      id: 'tatkal', title: 'Tatkal opens at 10:00 (AC)', tone: 'warn',
      steps: [
        { text: 'At 09:59 a huge crowd logs in for tomorrow\'s AC Tatkal. The Railways said about <b>half of all logins</b> in the first 5 minutes came from bots.', flow: [['user>cdn', 'user>cdn', 'user>cdn']], warn: ['cdn'], badges: { cdn: ['50% bots', 'warn'] }, tone: 'warn' },
        { text: 'The edge scores every request (Akamai anti-bot) and drops scripted traffic before it costs origin anything. Static pages are served from the CDN.', nodes: ['cdn'], ok: ['cdn'], badges: { cdn: ['bots dropped', 'ok'] } },
        { text: 'Login needs captcha + OTP, and online Tatkal needs an <b>Aadhaar-authenticated</b> account. Authorised agents are kept out for the first <b>30 minutes</b>.', flow: ['cdn>auth'], badges: { auth: 'Aadhaar ✓' } },
        { text: 'Everyone refreshes availability. Those reads go to the <b>enquiry service</b> and a replica-fed cache, never to the booking engine.', flow: ['cdn>enq', 'enq>cache'], badges: { cache: 'TTL few s' } },
        { text: 'Bookings pass the <b>admission gate</b>, which holds the booking path at a tested rate. PRS has peaked at <b>30,155 tickets in one minute</b> (10:01 AM, 12 Mar 2025).', flow: ['cdn>gate', 'gate>book', 'book>prs'], ok: ['prs'], badges: { prs: '30K/min' }, tone: 'ok' }
      ]
    },
    {
      id: 'book', title: 'Search → pay → PNR', tone: 'ok',
      steps: [
        { text: 'The passenger searches NDLS → BPL, 3A, General quota. The answer comes from the cache: <code>AVAILABLE-7</code>. It is a hint, a few seconds old.', flow: ['user>cdn', 'cdn>enq', 'enq>cache'] },
        { text: 'They add passengers and press Book. The booking service creates an <b>intent</b> keyed by an idempotency key, then redirects to the gateway.', flow: ['user>cdn', 'cdn>gate', 'gate>book'], badges: { book: 'intent #81' } },
        { text: 'Payment by UPI succeeds. The gateway\'s signed callback moves the intent <code>CREATED → PAID</code> with a conditional update, so a second callback does nothing.', flow: ['book>pay', 'pay>book'], badges: { pay: ['paid', 'ok'] } },
        { text: 'PRS allocates from the berth bitmasks for segments NDLS…BPL. If a berth fits, it is <b>CNF</b>; else RAC; else WL. It returns a PNR.', flow: ['book>prs'], badges: { prs: ['CNF B2/34', 'ok'] } },
        { text: 'The e-ticket and PNR go out by SMS and email. The booking status is fixed now; the current status can still change if the ticket was RAC or WL.', flow: ['book>notify', 'notify>user'], ok: ['notify'], tone: 'ok' }
      ]
    },
    {
      id: 'segment', title: 'Why a "full" train still sells short legs', tone: 'info',
      steps: [
        { text: 'Route A→B→C→D→E→F has 5 segments. Berth B4 is sold A→C, so its mask is <code>11000</code> (one bit per segment, left = first).', nodes: ['prs'], badges: { prs: 'B4 = 11000' } },
        { text: 'Someone asks for C→F (<code>00111</code>). <code>11000 &amp; 00111 = 0</code>: no overlap, so <b>B4 is sold again</b> and becomes <code>11111</code>.', flow: ['book>prs'], ok: ['prs'], badges: { prs: ['B4 = 11111', 'ok'] }, tone: 'ok' },
        { text: 'An enquiry for A→F says "WL" because no berth is free on <i>all five</i> segments, while A→B or D→F may still show seats. The cache keeps availability per station pair, not per train.', flow: ['user>cdn', 'cdn>enq', 'enq>cache'], badges: { cache: 'A→F: WL · D→F: 1' } },
        { text: 'For waitlisted passengers, position is not the whole story: a freed C→F segment can confirm <b>WL 5 (C→E)</b> before <b>WL 1 (A→F)</b>, because only one of them fits.', nodes: ['prs'], warn: ['prs'], badges: { prs: ['WL5 before WL1', 'warn'] } }
      ]
    },
    {
      id: 'cancel', title: 'Cancellation, promotion and charting', tone: 'info',
      steps: [
        { text: 'A confirmed passenger on berth B2 cancels. Their segments are cleared from B2\'s mask and the refund starts.', flow: ['user>cdn', 'cdn>gate', 'gate>book', 'book>prs'], badges: { prs: 'B2 freed' } },
        { text: '<b>Promotion in order</b>: the first RAC passenger whose segments fit B2 moves to CNF. Their half of the side-lower berth is now free.', nodes: ['prs'], ok: ['prs'], badges: { prs: ['RAC1 → CNF', 'ok'] } },
        { text: 'The first waitlisted passenger who fits that RAC half moves <b>WL → RAC</b>. Status alerts go out.', flow: ['prs>cache', 'book>notify'], badges: { prs: 'WL1 → RAC' } },
        { text: 'About <b>8 hours before departure</b> (since Jul 2025) the first chart is prepared. At charting, <b>GNWL is preferred over TQWL</b> for vacancies.', flow: ['chart>prs'], nodes: ['chart'], badges: { chart: 'T − 8 h' } },
        { text: 'E-tickets still fully waitlisted after charting are <b>cancelled automatically</b> and refunded. RAC passengers may board and share a berth.', flow: ['chart>prs', 'recon>pay'], badges: { pay: 'auto-refund' }, tone: 'ok' }
      ]
    },
    {
      id: 'timeout', title: 'Paid, but the PNR call timed out', tone: 'err',
      steps: [
        { text: 'The UPI payment succeeds, but the call from the booking service to PRS times out at 10:00:41. Did a berth get allocated or not? <b>Nobody knows yet.</b>', flow: ['book>pay', 'pay>book', 'book>prs'], err: ['prs'], badges: { prs: ['timeout', 'err'] }, tone: 'err' },
        { text: 'The intent moves <code>PAID → UNKNOWN</code>. The user sees "booking in progress", <b>not</b> a Pay button. Pressing Back and Book again reuses the same idempotency key.', nodes: ['book'], warn: ['book'], badges: { book: ['same intent', 'warn'] } },
        { text: 'The <b>reconciler</b> asks PRS by intent id. PRS de-duplicates on that id (our design), so asking again can never allocate a second berth.', flow: ['recon>prs'], badges: { recon: 'lookup #81' } },
        { text: 'Found a PNR? Mark CONFIRMED and send the ticket. No PNR? Issue a refund with the intent id as the gateway idempotency key: <b>one refund</b>, however often it runs.', flow: ['recon>pay', 'book>notify'], ok: ['recon'], badges: { pay: ['refund ×1', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Four design decisions plus the demand level. Load numbers are illustrative: a booking path that handles about 32K tickets/min, a Tatkal minute of about 1.2 lakh attempts, half of them bots. The allocation numbers come from our own toy simulation: 72 berths, 7 segments, 110 short trips followed by 40 end-to-end requests.',
    controls: [
      { id: 'adm', label: 'Admission at 10:00', type: 'seg', value: 'queue', options: [
        { v: 'none', l: 'Open door' }, { v: 'rate', l: 'Bot filter + rate limits' }, { v: 'queue', l: 'Bot filter + paced queue' }] },
      { id: 'enq', label: 'Availability enquiries', type: 'seg', value: 'replica', options: [
        { v: 'prs', l: 'Ask PRS directly' }, { v: 'replica', l: 'Replicas + cache' }] },
      { id: 'alloc', label: 'Berth allocation', type: 'seg', value: 'best', options: [
        { v: 'whole', l: 'One passenger per berth' }, { v: 'spread', l: 'Emptiest berth first' }, { v: 'first', l: 'First-fit bitmask' }, { v: 'best', l: 'Best-fit bitmask' }] },
      { id: 'pay', label: 'Payment ↔ PNR', type: 'seg', value: 'recon', options: [
        { v: 'retry', l: 'Client just retries' }, { v: 'idem', l: 'Idempotency key' }, { v: 'recon', l: 'Key + reconciler + auto-refund' }] },
      { id: 'demand', label: 'Demand', type: 'seg', value: 'tatkal', options: [
        { v: 'normal', l: 'Ordinary hour' }, { v: 'tatkal', l: 'Tatkal 10:00' }] }
    ],
    evaluate(s) {
      const tk = s.demand === 'tatkal';
      const attempts = tk ? 120000 : 10000;           // booking attempts / min (estimate)
      const bots = tk ? 0.5 : 0.1;                     // share of attempts (Tatkal: Railways figure for logins)
      const humans = attempts * (1 - bots);
      const CAP = 32000;                               // tickets / min, current PRS (Ministry figure)
      const reachRaw = { none: attempts, rate: humans * 0.6 + attempts * bots * 0.1, queue: Math.min(humans + attempts * bots * 0.1, 28000) }[s.adm];
      const botsIn = { none: attempts * bots, rate: attempts * bots * 0.1, queue: Math.min(attempts * bots * 0.1, 28000 * 0.1) }[s.adm];
      const enqRate = attempts * 20;                   // enquiries / min (estimate)
      const enqOnPrs = s.enq === 'prs' ? enqRate / 1500000 : 0;   // assumed PRS enquiry headroom 15 lakh/min (estimate)
      const load = reachRaw / CAP * (s.enq === 'prs' && tk ? 1.3 : 1) * (s.pay === 'retry' ? 1.1 : 1);
      const al = {
        whole: { u: 0.26, e2e: 0, sub: 'whole berth per PNR' },
        spread: { u: 0.40, e2e: 0, sub: 'emptiest berth first' },
        first: { u: 0.88, e2e: 35, sub: 'first-fit · bitmask' },
        best: { u: 0.88, e2e: 35, sub: 'best-fit · bitmask' }
      }[s.alloc];
      const metrics = [
        { k: 'Booking path load', v: SD.fmt.num(reachRaw) + '/min → ' + Math.round(load * 100) + '% of PRS', s: load < 0.8 ? 0.9 : load < 1 ? 0.6 : 0.05, hint: 'capacity ≈ 32K tickets/min' },
        { k: 'Enquiries on PRS', v: s.enq === 'prs' ? SD.fmt.num(enqRate) + '/min (' + Math.round(enqOnPrs * 100) + '% of headroom)' : '≈ 0: replicas answer, seconds stale', s: s.enq === 'prs' ? (enqOnPrs < 0.5 ? 0.6 : 0.05) : 0.85 },
        { k: 'Bots reaching booking', v: SD.fmt.num(botsIn) + '/min', s: botsIn < 1000 ? 0.9 : botsIn < 10000 ? 0.5 : 0.05 },
        { k: 'Berth-km sold', v: Math.round(al.u * 100) + '%' + (s.alloc === 'best' ? ' (+1% after cancellations)' : ''), s: al.u, hint: 'toy sim: 72 berths × 7 legs' },
        { k: 'End-to-end travellers served', v: al.e2e + ' of 40' + (s.alloc === 'best' ? ' (34.5 vs 33.8 after cancels)' : s.alloc === 'first' ? ' (drops after cancels)' : ''), s: al.e2e / 40 },
        { k: 'Paid but no ticket', v: { retry: 'possible double PNR or stuck debit', idem: 'no duplicates; timeouts wait for a human', recon: 'none: PNR found or auto-refund' }[s.pay], s: { retry: 0.1, idem: 0.5, recon: 0.92 }[s.pay] },
        { k: 'Fairness', v: { none: tk ? 'fastest scripts win' : 'fine at low demand', rate: 'bots throttled; fastest humans win', queue: 'paced, verified humans' }[s.adm], s: { none: tk ? 0.1 : 0.6, rate: 0.55, queue: 0.85 }[s.adm] }
      ];
      const notes = [];
      if (s.adm === 'none' && tk) notes.push('With an open door, every bot and every refresh hits origin. More app servers do not help: they all contend for the same berths of the same trains.');
      if (s.adm === 'rate') notes.push('Per-user and per-IP limits cut repeat clicks (we assume 40%) and the edge drops ~90% of bots (estimate), but nothing caps the <b>total</b>. At Tatkal the booking path is still over capacity.');
      if (s.adm === 'queue') notes.push('A paced queue admits about 28K/min, just under capacity, so PRS sees a flat, tested rate. The crowd size only changes how long people wait.');
      if (s.enq === 'prs') notes.push('Every refresh becomes a PRS query. Enquiries outnumber bookings by an order of magnitude, so they eat the capacity bookings need. The Ministry sized the new PRS for > 40 lakh enquiries/min for this reason.');
      if (s.enq === 'replica') notes.push('Availability can lag by a few seconds, so "AVAILABLE-2" may turn into RAC or WL at booking time. That is acceptable because the booking re-checks inside PRS.');
      if (s.alloc === 'whole') notes.push('Selling the whole berth to a short-trip passenger leaves it empty for the rest of the run: only ~26% of berth-km earn money in our simulation.');
      if (s.alloc === 'spread') notes.push('"Emptiest berth first" feels like load balancing, but it puts a short trip into every clean berth, so <b>no berth is left free end to end</b> for long-distance travellers.');
      if (s.alloc === 'first') notes.push('First-fit on berths in a fixed order already packs well. After random cancellations punch holes in early berths, it leaves slightly more fragmentation.');
      if (s.alloc === 'best') notes.push('Best-fit takes the <b>fullest berth that still fits</b> (<code>ORDER BY bit_count(occupied) DESC</code>) and keeps clean berths for long journeys. In our simulation it ties first-fit on a fresh train and wins slightly after cancellations.');
      if (s.pay === 'retry') notes.push('A user who sees a timeout and books again can get a second PNR and a second debit, or the first payment can sit with no ticket at all.');
      if (s.pay === 'idem') notes.push('The key stops duplicate intents and duplicate PRS calls, but a PAID intent whose PRS call timed out needs someone to decide: is there a PNR, or should we refund?');
      if (s.pay === 'recon') notes.push('The reconciler asks PRS by intent id, then either confirms or refunds with the intent id as the refund\'s idempotency key. Money and tickets always end up agreeing.');
      let verdict;
      const loadNoEnq = load / (s.enq === 'prs' && tk ? 1.3 : 1);
      if (loadNoEnq >= 1 && tk) verdict = '❌ <b>The booking path melts at 10:00:</b> ' + Math.round(load * 100) + '% of PRS capacity. Filter bots at the edge and pace admissions with a queue.';
      else if (s.enq === 'prs' && tk) verdict = '❌ <b>Enquiries starve bookings.</b> Serve availability from replicas and a cache, and keep PRS for allocation.';
      else if (s.alloc === 'whole') verdict = '⚠ <b>Correct but wasteful:</b> about three quarters of the berth-km run empty. Track berths per segment.';
      else if (s.alloc === 'spread') verdict = '⚠ <b>Fragmentation:</b> short trips are spread over every berth, and end-to-end travellers end up waitlisted on a half-empty train.';
      else if (s.pay === 'retry') verdict = '❌ <b>Money and tickets drift apart:</b> retries can double-book and timeouts leave paid users without a ticket. Add an idempotency key and a reconciler.';
      else if (s.pay === 'idem') verdict = '⚠ <b>No duplicates, but stuck payments:</b> timeouts need an automatic reconciler that confirms or refunds.';
      else if (s.adm === 'queue' && s.enq === 'replica' && s.alloc === 'best') verdict = '✅ <b>Strong design:</b> bots stopped at the edge, a paced booking path, enquiries on replicas, segment best-fit, and every payment ends in a PNR or a refund.';
      else if (s.alloc === 'first') verdict = '👍 <b>Good:</b> first-fit is a fine default. Best-fit keeps a little more room for long journeys after cancellations.';
      else verdict = '👍 Works at this demand. Switch to Tatkal 10:00 to stress it.';
      const flow = ['user>cdn'].concat(s.adm === 'none' ? ['cdn>book'] : ['cdn>gate', 'gate>book'], ['book>pay', 'book>prs'], s.pay === 'recon' ? ['recon>prs'] : []);
      return {
        metrics, verdict, notes, flow,
        labels: {
          gate: s.adm === 'queue' ? { label: 'Waiting room', sub: 'paced · ~28K/min' } : { label: 'Rate limiter', sub: 'per user · per IP' },
          prs: { label: 'CRIS PRS', sub: al.sub },
          cdn: s.adm === 'none' ? { label: 'CDN', sub: 'static only · no bot check' } : { label: 'Edge CDN + bot', sub: 'Akamai · WAF · bot score' }
        },
        hide: [].concat(s.adm === 'none' ? ['gate'] : [], s.enq === 'prs' ? ['cache'] : [], s.pay === 'recon' ? [] : ['recon']),
        hot: s.adm === 'queue' ? ['gate'] : [],
        warn: (s.alloc === 'whole' || s.alloc === 'spread' ? ['prs'] : []).concat(s.pay === 'idem' ? ['pay'] : []),
        err: (load >= 1 ? ['book', 'prs'] : []).concat(s.pay === 'retry' ? ['pay'] : []),
        badges: { book: [SD.fmt.num(reachRaw) + '/min', load >= 1 ? 'err' : load >= 0.8 ? 'warn' : 'info'], enq: s.enq === 'prs' ? ['→ PRS', tk ? 'err' : 'warn'] : ['→ replicas', 'ok'] }
      };
    }
  },

  widget: {
    title: 'One coach, six stations: segment bitmasks, RAC and waitlist',
    caption: 'Six berths (B1–B6) and two side-lower RAC berths (two passengers each) on route A→F. Each row\'s <b>mask</b> has one bit per segment (left = A–B). Pick a journey and <b>Book</b>: watch PRS test <code>mask &amp; request = 0</code> berth by berth. When no berth fits, you get RAC, then WL. <b>Tap a bar or a WL chip to cancel</b> and watch in-order promotion. Try: Reset, book A→F and C→F, tap <b>#1</b> to cancel it, then book A→C. First-fit spends the clean berth B1; Best-fit fills B2 exactly.'
  },

  realWorld: {
    intro: 'IRCTC is the internet front end; the berths, quotas and PNRs live in the Passenger Reservation System built and run by CRIS. Internals are not public, so the bitmask and reconciler on this page are <b>our design</b>. These are the published facts.',
    timeline: [
      { when: 'mid-1980s', who: 'CRIS / Indian Railways', title: 'Computerised PRS', text: 'Computerised reservation started with a pilot in Delhi in the mid-1980s (sources say 1985 or 1986). Its application, <b>CONCERT</b>, is developed and maintained by <b>CRIS</b> and links the regional PRS centres into one countrywide system.', src: 10 },
      { when: '2002 → 2016', who: 'IRCTC', title: 'From 29 tickets a day', text: 'IRCTC\'s online booking started small, at <b>29 tickets in a day</b> in its early days, and had grown to about <b>13 lakh tickets a day</b> by 2016, as Newslaundry recounts.', src: 9 },
      { when: 'Aug 2014', who: 'IRCTC', title: 'Next Generation e-Ticketing (NGeT)', text: 'The new e-ticketing system was reported to raise capacity from about <b>2,000 to 7,200 tickets per minute</b>, aimed largely at the Tatkal-hour crunch.', src: 8 },
      { when: '2024 – 2025', who: 'IRCTC', title: 'Official peaks', text: 'Peak hour: <b>1,85,513</b> bookings in the 10–11 AM Tatkal hour on 21 Mar 2024. Peak minute: <b>30,155 tickets</b> at 10:01 AM on 12 Mar 2025. In FY 2024-25, e-tickets were <b>86.38%</b> of all reserved tickets.', src: 0 },
      { when: 'Jun 2025', who: 'Indian Railways', title: 'Anti-bot drive', text: 'The Railways said bots made up about <b>50% of login attempts</b> in the first five minutes of Tatkal, and reported deactivating about 2.5 crore suspect user IDs after deploying anti-bot measures with a CDN partner.', src: 4 },
      { when: '1 Jul 2025', who: 'Ministry of Railways', title: 'Aadhaar-only online Tatkal', text: 'Only <b>Aadhaar-authenticated</b> users may book Tatkal online. Authorised agents may not book in the <b>first 30 minutes</b> of the AC (10:00) and non-AC (11:00) windows. Counter and agent Tatkal bookings need an OTP from 15 Jul 2025.', src: 2 },
      { when: 'Jun 2025', who: 'Railway Board', title: 'Waitlist cap', text: 'A cap of 25% of capacity on waitlisted tickets per class was applied in June, then <b>revised to 60% for AC and 30% for non-AC</b> classes after criticism. The design lesson: a waitlist should only be as long as it can realistically clear.', src: 13 },
      { when: 'Jul 2025', who: 'Railway Board', title: 'Chart 8 hours before departure', text: 'The first reservation chart moved from about 4 to <b>8 hours</b> before departure, and trains leaving 05:00–14:00 get their chart the previous evening. Waitlisted passengers learn their fate earlier. The Ministry also said the new PRS will handle <b>&gt; 1.5 lakh tickets/min</b> (about 5× the current ~32K) and <b>&gt; 40 lakh enquiries/min</b>.', src: 1 },
      { when: 'Dec 2025', who: 'Ministry of Railways', title: '3.02 crore IDs deactivated', text: 'The Minister told Parliament that about <b>3.02 crore suspicious user IDs</b> had been deactivated since January 2025, and that anti-bot tools such as <b>Akamai</b> filter non-genuine users.', src: 5 }
    ],
    lessons: [
      '<span>The unit of inventory is a <b>berth × segment</b>, not a berth. Everything else (availability, RAC, waitlist promotion) follows from that.</span>',
      '<span>A known release time is a gift: pre-scale, filter bots at the edge, and <b>pace</b> the booking path instead of hoping it holds.</span>',
      '<span>Identity is the strongest anti-bot tool you have: Aadhaar-verified accounts and agent windows did what captchas alone could not.</span>',
      '<span>Every rupee needs an end state: <b>a PNR or a refund</b>, decided by a reconciler, not by the user pressing Back.</span>'
    ],
    sources: [
      { title: 'Internet Ticketing', url: 'https://www.irctc.com/internet-ticketing.php', pub: 'IRCTC (official)' },
      { title: 'Railway Board to prepare reservation charts 8 hours prior to train departure', url: 'https://www.newsonair.gov.in/railway-board-to-prepare-reservation-charts-8-hours-prior-to-train-departure', pub: 'All India Radio News, 2025' },
      { title: 'Only Aadhaar-authenticated users can book Tatkal tickets from July 1', url: 'https://www.tribuneindia.com/news/india/only-aadhaar-authenticated-users-can-book-tatkal-tickets-from-july-1', pub: 'The Tribune, 2025' },
      { title: 'Aadhaar verification mandatory for IRCTC Tatkal bookings from July 2025', url: 'https://www.business-standard.com/india-news/aadhaar-verification-mandatory-irctc-tatkal-bookings-july-2025-125061101001_1.html', pub: 'Business Standard, 2025' },
      { title: 'Indian Railways tackles Tatkal booking problems with anti-bot system', url: 'https://www.medianama.com/2025/06/223-indian-railways-tackles-tatkal-booking-problems-with-anti-bot-system/', pub: 'MediaNama, Jun 2025' },
      { title: 'Over 3 crore suspicious user IDs deactivated by Indian Railways in less than 12 months', url: 'https://www.angelone.in/news/economy/over-3-crore-suspicious-user-ids-deactivated-by-indian-railways-in-less-than-12-months-here-s-why', pub: 'Angel One, Dec 2025' },
      { title: 'Indian Railways to prepare reservation chart 8 hours before departure', url: 'https://www.freepressjournal.in/india/indian-railways-to-prepare-reservation-chart-8-hours-before-departure', pub: 'Free Press Journal, 2025' },
      { title: 'Now, reservation charts at 9 pm for next day 5 am-2 pm trains, 8 hours in advance for others', url: 'https://theprint.in/india/now-reservation-charts-at-9-pm-for-next-day-5-am-2-pm-trains-8-hours-in-advance-for-others/2677685', pub: 'ThePrint, 2025' },
      { title: 'IRCTC\'s new e-ticketing system can book 7,200 tickets per minute', url: 'https://www.deccanchronicle.com/140815/business-latest/article/irctcs-new-e-ticketing-system-can-book-7200-ticket-minute', pub: 'Deccan Chronicle, Aug 2014' },
      { title: 'From 29 tickets booked in a day to 13 lakh tickets a day, IRCTC has come a long way', url: 'https://www.newslaundry.com/2016/01/20/from-29-tickets-booked-in-a-day-to-13-lakh-tickets-a-day-irctc-has-come-a-long-way', pub: 'Newslaundry, 2016' },
      { title: 'Centre for Railway Information Systems', url: 'https://en.wikipedia.org/wiki/Centre_for_Railway_Information_Systems', pub: 'Wikipedia' },
      { title: 'Reservation against Cancellation', url: 'https://en.wikipedia.org/wiki/Reservation_against_Cancellation', pub: 'Wikipedia' },
      { title: 'Got money? Buy your berth right (Premium Tatkal)', url: 'https://governancenow.com/news/regular-story/got-money-buy-your-berth-right', pub: 'Governance Now' },
      { title: 'Railway Ministry enhances passengers waiting list cap from 25 to 60 per cent for AC classes', url: 'https://www.theweek.in/wire-updates/national/2025/06/29/del48-rail-enhances-waiting-list.html', pub: 'The Week (PTI), Jun 2025' },
      { title: 'Lower berth to senior citizens: Railway Minister Ashwini Vaishnaw', url: 'https://www.deccanherald.com/india/lower-berth-to-senior-citizens-railway-minister-ashwini-vaishnaw-3821562', pub: 'Deccan Herald' },
      { title: 'Tatkal ticket booking: TQWL (Tatkal waiting list)', url: 'https://erail.in/info/tatkal-ticket-booking-tqwl-tatkal-waiting/106', pub: 'erail.in (explainer)' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Inventory unit', '<b>Berth</b>: one status per berth', '<b>Berth × segment</b>: bitmask per berth', 'Segments whenever passengers board and leave at intermediate stations, which is every long-distance train'],
      ['Allocation', '<b>First-fit</b>: fixed berth order, cheapest', '<b>Best-fit</b>: fullest berth that fits', 'First-fit for a fresh train; best-fit once cancellations fragment berths (small but real gain)'],
      ['Availability reads', '<b>Ask PRS</b>: always exact', '<b>Replicas + cache</b>: seconds stale', 'Replicas always for browsing; the booking call re-checks inside PRS'],
      ['Admission', '<b>Rate limits</b> per user / IP', '<b>Paced queue</b> with fixed outflow', 'Both at Tatkal: limits stop abuse, the queue caps the total'],
      ['Quota pools', '<b>Hard partitions</b> per quota', '<b>Pooled</b>, released to General near charting', 'Hard partitions to honour policy; release unsold quota late so berths do not go empty (our design)'],
      ['Payment order', '<b>Pay first, then allocate</b>: no holds', '<b>Hold berth, then pay</b>: no surprise WL', 'Pay-first keeps PRS free of holds in a stampede, at the cost of "paid but WL / refund" outcomes the reconciler must handle']
    ]
  },
  failures: [
    { f: 'Booking path overload at 10:00', detect: 'PRS latency, error rate, intent backlog', fix: 'Edge bot filtering, paced admission queue, lower the outflow live; pre-scale before the window.' },
    { f: 'Enquiry flood starves bookings', detect: 'PRS CPU spent on reads, enquiry:booking ratio', fix: 'Separate enquiry service on replicas + short-TTL cache; never let refreshes reach the allocator.' },
    { f: 'Same segment sold twice', detect: 'Audit: two passengers on one berth with overlapping masks', fix: 'One atomic <code>UPDATE … SET occupied = occupied | m WHERE occupied &amp; m = 0</code> (or a row lock) per allocation.' },
    { f: 'Paid, PRS call timed out', detect: 'Intents in PAID / UNKNOWN past a deadline', fix: 'Reconciler asks PRS by intent id; confirm if a PNR exists, else refund once (idempotent refund key).' },
    { f: 'Bots and fake accounts win Tatkal', detect: 'Login velocity, device / IP clusters, booking speed', fix: 'Aadhaar-verified accounts for Tatkal, OTP, agent 30-minute window, edge bot scoring, deactivate suspicious IDs.' },
    { f: 'Waitlist that never clears', detect: 'Share of WL that ends cancelled at chart', fix: 'Cap the waitlist per class; chart earlier (8 h) so people can re-plan; auto-cancel and refund at charting.' },
    { f: 'Fragmented berths, long journeys waitlisted', detect: 'Many berths with small free gaps; A→F shows WL', fix: 'Best-fit packing; keep some berths for end-to-end quota (our design); show per-pair availability.' }
  ],

  interview: [
    { q: 'How do you model a berth that can be sold for different legs?', a: '<p>Number the stations on the train\'s route 0…n. Segment k is the stretch from station k to k+1. Store each berth as an <b>n-bit mask</b>: bit k set means segment k is sold.</p><p>A journey i→j needs <code>mask(i,j) = ((1 &lt;&lt; (j−i)) − 1) &lt;&lt; i</code>. The berth fits if <code>occupied &amp; mask = 0</code>, and booking is <code>occupied |= mask</code>. Cancelling is <code>occupied &amp;= ~mask</code>. One integer column holds up to 64 segments; use a bit string for longer routes.</p>', lvl: 'core' },
    { q: 'How do you allocate a berth without races between concurrent bookings?', a: '<p>Do the check and the set in <b>one transaction on the berth row</b>:</p><ul><li><code>SELECT … WHERE occupied &amp; :m = 0 ORDER BY … LIMIT 1 FOR UPDATE SKIP LOCKED</code>, then <code>UPDATE … SET occupied = occupied | :m</code>.</li><li>Or a single conditional <code>UPDATE … WHERE berth = ? AND occupied &amp; :m = 0</code>; 0 rows means try the next candidate.</li></ul><p>SKIP LOCKED lets parallel bookings take <i>different</i> berths instead of queueing on the same one. If it returns nothing, retry once without SKIP LOCKED before falling back to RAC, because a skipped berth may still have had room.</p>', fu: 'Why shard by (train, date)? Every allocation touches one train-date, so it is the natural unit of locking and partitioning.', lvl: 'core' },
    { q: 'First-fit or best-fit: does it matter?', a: '<p>It matters most against the naive choices. In our toy simulation (72 berths, 7 segments, short trips then end-to-end requests), giving each passenger a whole berth sold ~26% of berth-km. "Emptiest berth first" sold ~40% and left <b>no berth</b> for end-to-end travellers. First-fit and best-fit both sold ~88% and served ~35 of 40 long journeys.</p><p>Best-fit (fullest berth that fits) pulled slightly ahead once cancellations had punched holes in berths. The general rule: <b>pack short trips together and keep clean berths for long ones.</b></p>', lvl: 'deep' },
    { q: 'Why can a "full" train still show seats for a short trip?', a: '<p>"Full" means no berth is free on <i>every</i> segment of the asked journey. A berth sold A→C and D→F is still free on C→D. So availability is a property of the <b>station pair</b>, not of the train. That is why enquiries are computed per (from, to) and why short-leg availability often appears on trains that are waitlisted end to end.</p>', lvl: 'core' },
    { q: 'What is RAC and how does promotion work on cancellation?', a: '<p><b>Reservation Against Cancellation</b>: once berths run out, a few side-lower berths are sold to two passengers each. Both may board and sit; at night one gets the berth when it frees up.</p><p>On a cancellation, free the segments, then scan in order: the first RAC passenger whose segments fit moves to CNF; the RAC half they leave goes to the first waitlisted passenger who fits. Repeat until nothing moves. Because of segments, the order is "first <i>who fits</i>", not strictly first.</p>', lvl: 'core' },
    { q: 'What happens at charting, and why is the waitlist split into types?', a: '<p>Charting freezes the list: final promotions, then <b>still-waitlisted e-tickets are cancelled automatically</b> and refunded. RAC passengers may travel. The first chart moved to about <b>8 hours</b> before departure in Jul 2025, so people learn earlier.</p><p>Waitlists are per quota (for example GNWL for General, TQWL for Tatkal, and others for intermediate or pooled quotas). Each queue promotes from its own pool, and at charting <b>GNWL is preferred over TQWL</b> for vacancies. Model each as its own ordered list keyed by (train, date, class, type).</p>', lvl: 'core' },
    { q: 'Payment succeeded but the call to PRS timed out. What now?', a: '<ol><li>The intent is <code>PAID</code>; mark it <code>UNKNOWN</code>. Do not let the user pay again: a retry with the same idempotency key returns this intent.</li><li>A reconciler asks PRS <b>by intent id</b>. PRS stores the id with the PNR, so the lookup is exact and a retried booking call cannot create a second PNR.</li><li>PNR found → CONFIRMED, send the ticket. Not found → refund through the gateway with the intent id as its idempotency key.</li><li>Nightly, match gateway settlement files against intents to catch anything the callbacks missed.</li></ol>', fu: 'Why not just retry the booking? You can, inside a short deadline, but only if PRS de-duplicates on the intent id. After the deadline, refunding is safer than confirming a journey the user may have already re-booked.', lvl: 'deep' },
    { q: 'How do you survive the 10:00 Tatkal spike?', a: '<ul><li><b>Edge first:</b> CDN for static pages, anti-bot scoring (the Ministry cites Akamai), WAF.</li><li><b>Identity:</b> captcha, OTP and Aadhaar-verified accounts for Tatkal; agents locked out for 30 minutes.</li><li><b>Split reads from writes:</b> enquiries on replicas and caches; bookings on their own path.</li><li><b>Pace the booking path</b> with a queue at a tested rate; pre-scale before 10:00 and 11:00.</li><li><b>Short transactions</b> in PRS: one row update per passenger allocation.</li></ul>', lvl: 'core' },
    { q: 'How do you stop bots and touts from taking Tatkal?', a: '<p>Layer it. Bot scoring and rate limits at the edge catch scripts. Captcha and OTP slow automation. The strongest control is <b>identity</b>: online Tatkal is limited to Aadhaar-authenticated users (since Jul 2025), agents cannot book in the first 30 minutes, and suspicious IDs are deactivated in bulk (about 3.02 crore since Jan 2025). Limits must key on the person, not only the account, because touts hold many accounts.</p>', lvl: 'core' },
    { q: 'How fresh must availability be?', a: '<p>Only the booking needs exact data. Availability is a <b>hint</b>: per (train, date, class, quota, station pair), cached for a few seconds and fed from PRS replicas. A stale "AVAILABLE-2" that becomes "RAC 3" at booking is acceptable, provided the user sees the final status before paying or is refunded if the outcome is unacceptable.</p>', lvl: 'core' },
    { q: 'How would you model quotas like Tatkal, Ladies and Senior Citizen?', a: '<p>Tag each berth (or a count of berths per coach) with a quota. Allocation for a request searches only berths of its quota, and each quota has its own waitlist. Some quotas are policy-driven and vary by train: for example, the Ministry describes a combined lower-berth quota for senior citizens, women aged 45+ and pregnant women of about 6–7 berths per sleeper coach. Tatkal opens separately at 10:00 (AC) and 11:00 (non-AC). <b>Our design:</b> release unsold quota to the general pool near charting so berths do not run empty.</p>', lvl: 'deep' },
    { q: 'Premium Tatkal uses dynamic fares. How would you price under contention?', a: '<p>Premium Tatkal sells part of the Tatkal quota at fares that rise as it fills. It is widely reported as non-refundable and does not issue RAC or waitlist. Compute the price from the <b>fill level at allocation time</b> inside the same transaction, and show the user a quote with a short validity. If the price moved by the time payment returns, re-quote or refund. Never charge a price the user did not see.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Postgres: segment bitmask allocation with SKIP LOCKED', lang: 'sql',
      code: `-- One row per berth per train-date. bit k of occupied = segment k (station k -> k+1).
CREATE TABLE berth (
  train_no     int,
  journey_date date,
  coach        text,
  berth_no     int,
  quota        text NOT NULL DEFAULT 'GN',      -- GN | TQ | LD | SS ...
  occupied     int  NOT NULL DEFAULT 0,
  PRIMARY KEY (train_no, journey_date, coach, berth_no)
);

-- Request from station :f to :t  =>  :m = ((1 << (:t - :f)) - 1) << :f
-- e.g. A->C on A..F is f=0, t=2  =>  m = 3  (binary 00011, bit 0 = A-B)
WITH pick AS (
  SELECT coach, berth_no
    FROM berth
   WHERE train_no = :train AND journey_date = :date AND quota = :quota
     AND occupied & :m = 0                          -- free on every needed segment
   ORDER BY bit_count(occupied::bit(32)) DESC,      -- best-fit: fullest berth first
            coach, berth_no
   LIMIT 1
   FOR UPDATE SKIP LOCKED                           -- parallel bookers take other berths
)
UPDATE berth b
   SET occupied = b.occupied | :m
  FROM pick
 WHERE b.train_no = :train AND b.journey_date = :date
   AND b.coach = pick.coach AND b.berth_no = pick.berth_no
RETURNING b.coach, b.berth_no, b.occupied::bit(5) AS mask;

-- 0 rows: retry once without SKIP LOCKED, then try the RAC slots, then append to WL.
-- Cancel:  UPDATE berth SET occupied = occupied & ~:m WHERE ... ;  then promote.`,
      note: '<b>Our design</b>, run on Postgres 16 (<code>bit_count(bit)</code> needs 14+). Best-fit picked the berth already sold C→F for an A→C request, and a full train returned 0 rows. With two concurrent sessions, the second skipped the berth the first had locked and took another. When that locked berth was the <i>only</i> fit, the second session got 0 rows, which is why a 0-row result is retried without SKIP LOCKED before going to RAC. A <code>bit(n)</code> column with <code>&amp;</code> and <code>|</code> works the same way for routes with more than 32 segments.',
    },
    {
      title: 'Java 21 / Spring: idempotent booking + reconciliation hook', lang: 'java',
      code: `@Service
public class BookingService {
  private final JdbcTemplate jdbc;
  private final PrsClient prs;          // book(intentId) -> PNR; findPnr(intentId)
  private final GatewayClient gateway;  // refund(txn, amount, idempotencyKey)

  public BookingService(JdbcTemplate jdbc, PrsClient prs, GatewayClient gateway) {
    this.jdbc = jdbc; this.prs = prs; this.gateway = gateway;
  }

  /** Gateway callback or client retry: only the first PAID transition calls PRS. */
  public void onPaymentSuccess(UUID intentId, String gatewayTxn) {
    int won = jdbc.update("""
        UPDATE booking_intent SET state = 'PAID', gateway_txn = ?, updated_at = now()
         WHERE intent_id = ? AND state = 'CREATED'""", gatewayTxn, intentId);
    if (won == 0) return;                                  // duplicate callback
    try {
      confirm(intentId, prs.book(intentId));               // PRS dedupes on intentId
    } catch (PrsTimeoutException e) {
      move(intentId, "UNKNOWN");                           // reconciler decides
    }
  }

  /** Every 30 s: settle intents stuck in PAID / UNKNOWN for over 2 minutes. */
  @Scheduled(fixedDelay = 30_000)
  public void reconcile() {
    for (Map<String, Object> row : jdbc.queryForList("""
        SELECT intent_id, gateway_txn, amount FROM booking_intent
         WHERE state IN ('PAID', 'UNKNOWN') AND updated_at < now() - interval '2 minutes'
         ORDER BY updated_at LIMIT 100""")) {
      UUID id = (UUID) row.get("intent_id");
      Optional<String> pnr = prs.findPnr(id);
      if (pnr.isPresent()) confirm(id, pnr.get());
      else if (move(id, "REFUND_PENDING"))                 // only one worker wins
        gateway.refund((String) row.get("gateway_txn"), (BigDecimal) row.get("amount"), id.toString());
    }
  }

  private boolean move(UUID id, String to) {
    return jdbc.update("UPDATE booking_intent SET state = ?, updated_at = now() "
        + "WHERE intent_id = ? AND state IN ('PAID', 'UNKNOWN')", to, id) == 1;
  }
  private void confirm(UUID id, String pnr) {
    jdbc.update("UPDATE booking_intent SET state = 'CONFIRMED', pnr = ?, updated_at = now() "
        + "WHERE intent_id = ? AND state IN ('PAID', 'UNKNOWN')", pnr, id);
  }
}`,
      note: 'Compiled with <code>javac --release 21</code> against Spring Boot 3.5 (spring-jdbc, spring-context), with small stub types for <code>PrsClient</code>, <code>GatewayClient</code> and <code>PrsTimeoutException</code>. The PRS client sends the journey stored on the intent. It needs <code>@EnableScheduling</code>. Run against Postgres 16 with a fake PRS and gateway: duplicate callbacks made no second PRS call, a timed-out call that PRS had in fact booked became CONFIRMED, and one that it had not was refunded <b>once</b> across two service instances and three reconcile runs. Every state change is a conditional UPDATE, so two reconcilers cannot both refund. If a refund call fails after <code>REFUND_PENDING</code>, a separate retry job resends it with the same key.'
    },
    {
      title: 'Python: allocation, RAC/WL and in-order promotion', lang: 'python',
      code: `def mask(f, t):                          # bit k = segment k (station k -> k+1)
    return ((1 << (t - f)) - 1) << f

def fit(slots, m, best=True):            # best-fit: fullest slot still free on m
    ok = [i for i, o in enumerate(slots) if o & m == 0]
    if not ok: return None
    return max(ok, key=lambda i: (bin(slots[i]).count('1'), -i)) if best else ok[0]

class Coach:
    def __init__(self, berths=6, rac_slots=4):   # 2 RAC slots per side-lower berth
        self.cnf, self.rac = [0] * berths, [0] * rac_slots
        self.where, self.racq, self.wl = {}, [], []

    def _place(self, pnr, m):
        for kind, slots in (('CNF', self.cnf), ('RAC', self.rac)):
            i = fit(slots, m)
            if i is not None:
                slots[i] |= m; self.where[pnr] = (kind, i, m)
                if kind == 'RAC': self.racq.append(pnr)
                return f'{kind} {"B" if kind == "CNF" else "S"}{i + 1}'

    def book(self, pnr, f, t):
        got = self._place(pnr, mask(f, t))
        if not got: self.wl.append((pnr, mask(f, t))); got = f'WL {len(self.wl)}'
        return got

    def cancel(self, pnr):
        kind, i, m = self.where.pop(pnr)
        (self.cnf if kind == 'CNF' else self.rac)[i] &= ~m
        if kind == 'RAC': self.racq.remove(pnr)
        moved = []
        for p in list(self.racq):              # RAC first, in order: first who fits
            _, i, m = self.where[p]; b = fit(self.cnf, m)
            if b is None: continue
            self.rac[i] &= ~m; self.cnf[b] |= m; self.racq.remove(p)
            self.where[p] = ('CNF', b, m); moved.append(f'{p} RAC->CNF B{b + 1}')
        for p, m in list(self.wl):             # then the waitlist, in order
            got = self._place(p, m)
            if got: self.wl.remove((p, m)); moved.append(f'{p} WL->{got}')
        return moved

c = Coach(berths=2, rac_slots=2)
print([c.book(p, f, t) for p, f, t in [('P1', 0, 5), ('P2', 0, 2), ('P3', 2, 5),
       ('P4', 0, 5), ('P5', 1, 4), ('P6', 0, 5), ('P7', 3, 5)]])
print(c.cancel('P1'))`,
      note: 'Run on Python 3.11. Output: <code>[\'CNF B1\', \'CNF B2\', \'CNF B2\', \'RAC S1\', \'RAC S2\', \'WL 1\', \'WL 2\']</code>, then <code>[\'P4 RAC-&gt;CNF B1\', \'P6 WL-&gt;RAC S1\']</code>. P3 (C→F) re-used B2 after P2 (A→C). The real PRS also tracks quotas, waitlist types and multi-passenger PNRs; this shows only the segment mechanics.'
    }
  ],

  related: ['ticket-booking', 'ttd-darshan-booking', 'upi-payments', 'payment-gateway', 'rate-limiter', 'train-tracking']
});
