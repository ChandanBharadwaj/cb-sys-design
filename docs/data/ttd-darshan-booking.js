SD.register({
  slug: 'ttd-darshan-booking',
  domain: 3,
  title: 'Temple Darshan Booking Queue',
  examples: 'TTD Tirumala (Tirupati)',
  tagline: 'Give a fixed monthly quota of darshan slots to lakhs of devotees who all arrive in the same minute: <b>pre-scale for a known T0, queue the crowd fairly, hold per slot, and draw sevas by lot</b>.',
  tldr: {
    problem: 'A temple releases a month of darshan and seva tickets at an announced time. Demand is many times the quota, it arrives in one minute, bots and agents join the rush, and payments go through banks that sometimes fail or stall.',
    idea: 'Serve everything static from a <b>CDN</b> and <b>pre-scale</b> the booking path before T0. A <b>virtual queue</b> gives each devotee a position (shuffled for everyone already waiting at T0) and admits them at a paced rate with <b>signed tokens</b>. Each date × time slot is a <b>counter</b> with an atomic conditional decrement, a <b>hold with a TTL</b> covers payment, and a <b>per-ID limit</b> stops one person booking ten times. Sevas use a <b>seeded, auditable lucky dip</b> instead of a race.',
    insight: 'Supply is fixed and known. Engineering cannot create more darshan slots; it can only decide <b>who</b> gets them, <b>how fairly</b>, and whether the site stays up while saying "quota full". So the design is about <b>admission, fairness and honest status</b>, not raw throughput.',
    numbers: [
      { v: '~6 lakh', l: 'devotees online at the same time for a ₹300 darshan release (TTD statement, Sep 2026)' },
      { v: '~9×', l: '≈24 lakh tickets wanted (≈4 per user) vs ≈2.69 lakh in the quota (TTD, Sep 2026)' },
      { v: '1.10 lakh', l: 'concurrent hits against a normal 30–40K capacity when the sites froze (Aug 2021)' }
    ]
  },

  intro: {
    what: 'A darshan booking system sells a <b>fixed number of entry slots</b> to a temple, by date and time, weeks in advance. Once a month a new quota opens at an announced minute. The system has to let a huge crowd in without crashing, sell <b>no slot beyond its quota</b>, and spread the tickets fairly among real devotees.',
    analogy: {
      icon: '🛕',
      title: 'Festival tokens at the temple gate',
      text: 'On a festival day, volunteers do not let the crowd rush the sanctum. They hand out numbered tokens, let people in a batch at a time, and give each family one token. For a special puja with few places, they put names in a box and draw. The online system does the same: a virtual queue hands out positions, admits a steady batch, checks one booking per person, and runs a lottery for sevas. Unlike a real gate, one bot can stand in the online line many times, so the identity check matters far more.'
    },
    problem: 'The month\'s darshan quota opens at 10:00. Lakhs of devotees refresh at 9:59, scripts fire requests in milliseconds, and everyone wants the same weekend slots. Without a plan, the site freezes, a few agents take most tickets, and devotees see errors they cannot tell apart from "sold out". The system answers <b>"who gets the limited slots, fairly, while the site stays up and tells everyone the truth?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'Open the booking page at 10:00',
        text: 'The obvious design: at the release minute, switch the booking page on. Every devotee loads it, picks a date, and the server checks the slot count and sells. It works on a normal day, when a few thousand people book across the whole month.',
        scene: {
          nodes: [
            { id: 'd1', label: 'Devotee', sub: 'clicks at 10:00', kind: 'client', at: [70, 0] },
            { id: 'd2', label: 'Devotee', sub: 'clicks at 10:00', kind: 'client', at: [350, 0] },
            { id: 'site', label: 'Booking site', sub: 'check, then sell', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Slot quota', sub: 'per date and time', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'd1', to: 'site' }, { from: 'd2', to: 'site' }, { from: 'site', to: 'db' }],
          flow: [['d1>site', 'd2>site'], 'site>db']
        }
      },
      {
        stage: 'breaks',
        title: 'Everyone at once, and bots first',
        text: 'Lakhs of devotees arrive in the same minute, many times what the servers handle on a normal day. Pages time out, people retry, and retries make it worse. <b>Scripts click faster than any human</b> and book again and again under different logins. Devotees see errors, then "sold out", and cannot tell which is which.',
        scene: {
          nodes: [
            { id: 'd1', label: 'Devotee', sub: 'page times out', kind: 'client', at: [70, 0] },
            { id: 'bot', label: 'Bot script', sub: '50 logins', kind: 'client', at: [350, 0] },
            { id: 'site', label: 'Booking site', sub: 'flooded', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Slot quota', sub: 'gone to agents', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'd1', to: 'site' }, { from: 'bot', to: 'site' }, { from: 'site', to: 'db' }],
          flow: [['d1>site', 'bot>site'], ['bot>site', 'd1>site'], 'site>db'],
          err: ['site'],
          warn: ['db'],
          badges: { site: ['overloaded', 'err'], db: ['bots won', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Queue fairly, one booking per person, draw sevas',
        text: 'Servers are <b>warmed up before 10:00</b> because the time is known. A <b>virtual queue</b> gives everyone already waiting a place by lot, then lets people in at a steady rate. Each devotee proves who they are with a one-time code, and <b>one ID gets one booking</b>. A slot is held briefly while the bank pays. Scarce sevas skip the race entirely: register for a few days, then a recorded draw picks the winners.',
        scene: {
          nodes: [
            { id: 'd1', label: 'Devotee', sub: 'place by lot', kind: 'client', at: [70, 0] },
            { id: 'wr', label: 'Virtual queue', sub: 'steady rate', kind: 'edge', at: [210, 0] },
            { id: 'bot', label: 'Bot script', sub: '50 logins', kind: 'client', at: [350, 0] },
            { id: 'site', label: 'Booking API', sub: 'pre-warmed', kind: 'service', at: [210, 110] },
            { id: 'id', label: 'ID check', sub: 'OTP · 1 per ID', kind: 'service', at: [350, 110] },
            { id: 'db', label: 'Slot quota', sub: 'hold, then sell', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'd1', to: 'wr' }, { from: 'bot', to: 'wr' }, { from: 'wr', to: 'site' }, { from: 'site', to: 'id' }, { from: 'site', to: 'db' }],
          flow: [['d1>wr', 'bot>wr'], 'wr>site', 'site>id', 'site>db'],
          ok: ['site', 'db'],
          warn: ['bot'],
          badges: { bot: ['1 booking', 'warn'], db: ['fair share ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['Tirumala Tirupati Devasthanams (darshan and sevas)', 'IRCTC Tatkal', 'Sabarimala Virtual-Q', 'Ticketmaster', 'Queue-it waiting rooms'],
    whenToUse: [
      'Supply is <b>fixed in advance</b> (slots per day) and released in batches at an <b>announced time</b>',
      'Demand at release is many times the quota, so <b>fairness</b> matters as much as uptime',
      'Each person should get a bounded share, so bookings must be tied to a <b>verified identity</b>'
    ],
    whenNot: [
      'Unique seats with a seat map and resale (concerts, stadiums): see <a href="ticket-booking.html">Ticket Booking &amp; Flash Sales</a>',
      'One berth sold for different parts of a route, with waitlists: see <a href="irctc-booking.html">Railway Ticketing (IRCTC)</a>',
      'The spike is viewers watching, not buyers competing for stock: see <a href="live-streaming.html">Live Event Streaming</a>'
    ],
    glossary: [
      { term: 'Quota release (T0)', def: 'The announced minute when a new month of slots goes on sale.' },
      { term: 'Virtual queue', def: 'A waiting page that gives each visitor a position and admits them at a fixed rate.' },
      { term: 'Admission rate', def: 'How many devotees per minute the queue lets through to the booking system.' },
      { term: 'Signed token', def: 'A pass with an expiry and a cryptographic signature, so the edge can check it without asking the server.' },
      { term: 'Slot counter', def: 'One row per date and time slot that counts tickets held and booked against its quota.' },
      { term: 'Hold (TTL)', def: 'Tickets reserved for a few minutes while the devotee pays; they return to the pool if payment fails or time runs out.' },
      { term: 'Per-ID limit', def: 'A rule that one verified identity can book only once in a period, whatever login it uses.' },
      { term: 'Lucky dip', def: 'A lottery: devotees register over several days, then a recorded random draw picks who may pay for a seva.' }
    ]
  },

  requirements: {
    functional: [
      'Publish the release time and a month calendar of slot availability',
      'Hold devotees in a virtual queue and admit them at a paced rate',
      'Verify identity (OTP and photo ID) and enforce per-ID and group-size limits',
      'Hold tickets in a date × time slot for a short TTL while payment runs',
      'Confirm on payment; release on failure or expiry; send the ticket by SMS and email',
      'Run the seva lucky dip: registration window, draw, pay by deadline, waitlist'
    ],
    nonFunctional: [
      '<b>Never exceed a slot\'s quota</b>, under any retry or race',
      'Origin load stays at the tested admission rate, however many arrive',
      'Fair: click speed and scripts should not decide who books',
      'Honest status: queue position, "quota full", "payment pending", never a blank error',
      'Idempotent holds and payments across bank timeouts and retries',
      'Draws are reproducible by anyone from published inputs'
    ],
    outOfScope: ['Accommodation (room) booking', 'Physical queue complexes at the temple', 'Donation and trust accounting', 'Refund timelines set by banks']
  },

  calculator: {
    inputs: [
      { id: 'users', label: 'Devotees online at T0', min: 10000, max: 2000000, value: 600000, log: true },
      { id: 'quota', label: 'Tickets in the monthly quota', min: 10000, max: 1000000, value: 269000, log: true },
      { id: 'per', label: 'Tickets wanted per devotee (group size)', min: 1, max: 6, step: 0.5, value: 4 },
      { id: 'rate', label: 'Queue admission rate (devotees / min)', min: 1000, max: 200000, value: 30000, log: true },
      { id: 'pay', label: 'Holds that end in a successful payment', min: 40, max: 100, value: 80, unit: '%' },
      { id: 'ttl', label: 'Hold TTL', min: 2, max: 20, value: 10, unit: 'min' }
    ],
    outputs: [
      { label: 'Tickets demanded', f: (v) => v.users * v.per },
      { label: 'Demand ÷ quota', fmt: 'raw', f: (v) => (v.users * v.per / v.quota).toFixed(1) + '×' },
      { label: 'Time until "quota full"', fmt: 'ms', f: (v) => (v.quota / v.per) / (v.rate * v.pay / 100) * 60000 },
      { label: 'Time to admit the whole crowd', fmt: 'ms', f: (v) => v.users / v.rate * 60000 },
      { label: 'Devotees who leave without a ticket', f: (v) => Math.max(0, v.users - v.quota / v.per) },
      { label: 'Tickets parked in unpaid holds before "quota full" (Little\'s law)', f: (v) => { const drain = (v.quota / v.per) / (v.rate * v.pay / 100); return Math.min(v.quota, v.rate * (1 - v.pay / 100) * v.per * Math.min(v.ttl, drain)); } }
    ],
    note: 'The defaults use TTD\'s Sep 2026 figures: about <b>6 lakh</b> simultaneous users, about <b>4 tickets</b> each and a quota of about <b>2.69 lakh</b>, which gives the ~9× it quoted. The admission rate, payment success and TTL are <em>estimates</em>. Two things stand out. The quota is gone in minutes even at a modest admission rate, so a faster site does not help most devotees. And a long TTL parks a large share of tickets in unpaid holds, which is why tickets "come back" after the site says quota full.'
  },

  api: [
    { m: 'GET', p: '/v1/calendar/{month}', d: 'Pre-rendered JSON on the CDN: dates, slots and a coarse availability colour, refreshed every few seconds. A <b>hint</b>, never the check.' },
    { m: 'POST', p: '/v1/queue/{release}/join', d: 'Returns a queue id. Anyone who joins before T0 gets a <b>random position at T0</b>; later arrivals go to the back in order.' },
    { m: 'GET', p: '/v1/queue/{release}/status', d: 'Position and ETA while waiting. When admitted, returns a <b>signed admission token</b> (release, session, expiry). "Quota full" closes the queue for everyone.' },
    { m: 'POST', p: '/v1/holds', d: '<code>{slot_id, devotees[], idempotency_key}</code> + token + OTP-verified session. Returns <code>hold_id, expires_at</code>, or <code>409 SLOT_UNAVAILABLE</code> / <code>409 ID_LIMIT</code>.' },
    { m: 'POST', p: '/v1/payments/callback', d: 'Gateway webhook keyed by <code>hold_id</code>. Success confirms the hold; failure releases it at once; a late success after expiry triggers a refund.' },
    { m: 'POST', p: '/v1/seva-dip/{month}/register', d: 'One registration per <b>ID hash</b> per seva per month, up to the allowed devotees. Results are published after the draw with the seed.' }
  ],
  dataModel: [
    { name: 'slot_inventory', store: 'Postgres', fields: [['(release_id, darshan_date, slot_start)', 'int, date, time', 'pk'], ['quota', 'int'], ['held', 'int'], ['booked', 'int'], ['CHECK', 'held + booked ≤ quota']], note: 'One counter row per date × slot, not one row per ticket. Every change is a conditional UPDATE.' },
    { name: 'holds', store: 'Postgres', fields: [['hold_id', 'uuid', 'pk'], ['slot', '(release, date, slot)', 'fk'], ['id_hash', 'bytea', 'idx'], ['tickets', 'smallint'], ['expires_at', 'timestamptz', 'idx'], ['idempotency_key', 'uuid', 'idx']], note: 'Unique on <code>idempotency_key</code>, so a retried click returns the same hold.' },
    { name: 'bookings', store: 'Postgres', fields: [['booking_id', 'uuid', 'pk'], ['hold_id', 'uuid', 'fk'], ['id_hash', 'bytea', 'idx'], ['period', 'text', 'idx'], ['gateway_txn', 'text', 'idx']], note: 'Unique on <code>(id_hash, period)</code>: the per-ID limit is a constraint, not an <code>if</code> in code.' },
    { name: 'seva_draws', store: 'Postgres + public file', fields: [['(month, seva)', 'text', 'pk'], ['seed_commitment', 'sha256 hex'], ['seed', 'text (revealed after)'], ['registrations_digest', 'sha256 hex'], ['ranked_ids', 'bytea[]']], note: 'Commit, close registrations, reveal, draw. Anyone can recompute the ranking.' }
  ],

  architecture: {
    title: 'Darshan booking architecture',
    nodes: [
      { id: 'bot', label: 'Bots & agents', sub: 'scripted sessions', kind: 'client', wide: [90, 110], tall: [70, 0], tip: 'Scripts that click within milliseconds of T0 and spread bookings across many logins.' },
      { id: 'dev', label: 'Devotee', sub: 'web · mobile app', kind: 'client', wide: [90, 220], tall: [210, 0], tip: 'Arrives before T0, waits on the queue page, then verifies OTP, picks a slot and pays.' },
      { id: 'cdn', label: 'CDN / edge', sub: 'static · token · WAF', kind: 'edge', wide: [280, 220], tall: [210, 105], tip: 'Serves static pages, the pre-rendered calendar and the queue page. Scores bots and verifies admission tokens so unadmitted traffic never reaches origin.' },
      { id: 'wr', label: 'Virtual queue', sub: 'random at T0 · paced', kind: 'service', wide: [280, 110], tall: [70, 105], tip: 'Holds the crowd, shuffles everyone waiting at T0, then admits a fixed number per minute with signed tokens.' },
      { id: 'scaler', label: 'Pre-scaler', sub: 'warm before T0', kind: 'compute', wide: [280, 330], tall: [350, 105], tip: 'The release time is known, so capacity, connection pools and caches are warmed in advance instead of waiting for autoscaling alarms.' },
      { id: 'api', label: 'Booking API', sub: 'token-gated', kind: 'service', wide: [480, 220], tall: [210, 210], tip: 'Accepts only requests with a valid admission token, bound to the session. Rate-limited per session and per ID.' },
      { id: 'idp', label: 'Identity & OTP', sub: 'ID hash · limits', kind: 'service', wide: [480, 110], tall: [70, 210], tip: 'OTP to a registered mobile, photo ID details, and a hashed identity used for per-ID and group limits.' },
      { id: 'dip', label: 'Lucky-dip draw', sub: 'seeded · auditable', kind: 'compute', wide: [480, 330], tall: [350, 210], tip: 'Collects seva registrations over a window, removes duplicates by ID, publishes a seed commitment, then ranks everyone with a reproducible shuffle.' },
      { id: 'inv', label: 'Slot inventory', sub: 'date × slot counters', kind: 'service', wide: [690, 220], tall: [210, 315], tip: 'Owns holds and confirmations. Every change is one conditional UPDATE on the slot counter.' },
      { id: 'pg', label: 'Booking DB', sub: 'Postgres · holds', kind: 'store', wide: [890, 220], tall: [210, 420], tip: 'Source of truth: slot counters, holds, bookings with a unique per-ID key, and draw records.' },
      { id: 'sweep', label: 'Hold sweeper', sub: 'expire unpaid holds', kind: 'compute', wide: [890, 110], tall: [70, 315], tip: 'Returns expired holds to their slot counters in small SKIP LOCKED batches.' },
      { id: 'saga', label: 'Pay orchestrator', sub: 'hold → pay → confirm', kind: 'service', wide: [690, 330], tall: [350, 315], tip: 'Starts the payment with an idempotency key, waits for the gateway, then confirms or releases. Handles late and pending results.' },
      { id: 'pay', label: 'Payment gateway', sub: 'UPI · cards · banks', kind: 'external', wide: [890, 330], tall: [350, 420], tip: 'External. Banks can time out or answer late, so results arrive by webhook and are reconciled.' }
    ],
    edges: [
      { from: 'bot', to: 'cdn' },
      { from: 'dev', to: 'cdn', bidi: true },
      { from: 'cdn', to: 'wr', bidi: true },
      { from: 'cdn', to: 'api' },
      { from: 'scaler', to: 'cdn' },
      { from: 'scaler', to: 'api' },
      { from: 'api', to: 'idp' },
      { from: 'api', to: 'inv' },
      { from: 'api', to: 'dip' },
      { from: 'inv', to: 'pg' },
      { from: 'sweep', to: 'pg' },
      { from: 'api', to: 'saga' },
      { from: 'dip', to: 'saga' },
      { from: 'saga', to: 'inv' },
      { from: 'saga', to: 'pay', bidi: true }
    ]
  },

  scenarios: [
    {
      id: 'release', title: 'T0: the monthly quota opens', tone: 'info',
      steps: [
        { text: 'The release time is announced days ahead, so nobody waits for an alarm. The <b>pre-scaler</b> warms the booking API, DB pools and CDN caches to the planned peak an hour before T0.', flow: ['scaler>cdn', 'scaler>api'], ok: ['api'], badges: { api: ['pre-warmed', 'ok'] } },
        { text: 'Devotees arrive early. Static pages and the <b>pre-rendered slot calendar</b> come from the CDN, and the queue page holds everyone. Origin sees almost nothing yet.', flow: ['dev>cdn', 'cdn>wr'], badges: { wr: 'waiting' } },
        { text: 'At T0, everyone already waiting gets a <b>random position</b>; later arrivals join the back in order. A script that clicks 3 ms after T0 gains nothing over a devotee on a slow phone.', nodes: ['wr'], ok: ['wr'], badges: { wr: ['shuffled', 'ok'] } },
        { text: 'The queue admits a fixed number per minute and gives each a <b>signed token</b> (release, session, expiry). The edge checks the signature itself, so only admitted devotees reach origin.', flow: ['wr>cdn', 'cdn>dev', 'dev>cdn', 'cdn>api'], badges: { dev: 'token ✓', api: 'steady rate' } },
        { text: 'A script skips the queue page and calls the booking URL directly. With no valid token, the <b>edge rejects it</b> before it costs origin anything. This is the gap that turns a queue into decoration.', flow: ['bot>cdn'], err: ['bot'], badges: { cdn: ['403 no token', 'warn'] }, tone: 'ok' }
      ]
    },
    {
      id: 'book', title: 'OTP, hold, pay, confirm', tone: 'ok',
      steps: [
        { text: 'The admitted devotee verifies an <b>OTP</b> and enters photo ID details for each person. The identity service hashes the ID and checks the <b>per-ID limit</b> and group size.', flow: ['dev>cdn', 'cdn>api', 'api>idp'], badges: { idp: ['1 per ID ✓', 'ok'] } },
        { text: 'Hold 4 tickets on Sat 7–8 AM with one statement: <code>UPDATE slot_inventory SET held = held + 4 WHERE … AND held + booked + 4 &lt;= quota</code>. One row = held; zero rows = slot full.', flow: ['api>inv', 'inv>pg'], badges: { pg: ['held 4', 'ok'] } },
        { text: 'The orchestrator starts payment with an <b>idempotency key</b> tied to the hold. The hold expires in a few minutes, long enough for a UPI or bank redirect.', flow: ['api>saga', 'saga>pay'], badges: { pay: 'UPI / card' } },
        { text: 'The gateway confirms. In one transaction: <code>held − 4, booked + 4</code> on the slot and a booking row that is <b>unique per (ID, period)</b>. The ticket goes out by SMS and email.', flow: ['pay>saga', 'saga>inv', 'inv>pg'], ok: ['pg'], badges: { pg: ['booked', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'soldout', title: '"Slot Unavailable" and the hold bounce', tone: 'warn',
      steps: [
        { text: 'Weekend slots go first. New holds match zero rows and return <b>SLOT_UNAVAILABLE</b>. TTD says this message means the quota is full, not that the system failed. The UI must say so plainly.', flow: ['api>inv', 'inv>pg'], warn: ['inv'], badges: { inv: ['Sat: 0 left', 'warn'] } },
        { text: 'But thousands of holds are still unpaid. Bank failures release tickets at once; abandoned checkouts wait for the TTL and the <b>sweeper</b> returns them.', flow: ['pay>saga', 'saga>inv', 'sweep>pg'], warn: ['pg'], badges: { pg: ['+1,240 back', 'warn'] } },
        { text: 'Tickets <b>reappear minutes after "sold out"</b>. Devotees who gave up miss them; scripts that poll catch them. Shorter TTLs and showing "N tickets in pending payments" reduce both effects.', nodes: ['bot', 'dev'], warn: ['bot'], badges: { bot: ['polling', 'warn'] } },
        { text: 'When free and held are both zero for the release, the queue <b>closes</b> and everyone still waiting gets one clear message: quota full, next release date. No one is left refreshing.', flow: ['wr>cdn', 'cdn>dev'], ok: ['wr'], badges: { dev: ['quota full', 'info'] }, tone: 'ok' }
      ]
    },
    {
      id: 'fail', title: 'Bank timeout, retry and double booking', tone: 'err',
      steps: [
        { text: 'The devotee pays by UPI. The bank does not answer in time and the gateway reports <b>pending</b>. TTD notes that payment failures can come from banks and gateways, not only from its own site.', flow: ['saga>pay'], err: ['pay'], badges: { pay: ['timeout', 'err'] }, tone: 'err' },
        { text: 'The devotee taps <b>Pay</b> again. Without an idempotency key, that is a second order: <b>two debits</b>, and a second hold that takes 4 more tickets from the same slot.', flow: ['dev>cdn', 'cdn>api', 'api>saga', 'saga>pay'], err: ['saga'], badges: { saga: ['2 orders', 'err'] }, tone: 'err' },
        { text: 'Fix: the hold id is the idempotency key. The retry returns the <b>existing hold and payment</b>; the gateway sees the same key and does not charge twice; <code>UNIQUE (id_hash, period)</code> blocks a second booking.', flow: ['api>saga', 'saga>pay'], ok: ['saga'], badges: { saga: ['same hold', 'ok'] } },
        { text: 'The bank finally says <b>success after the hold expired</b> and the tickets were resold. Confirm matches zero rows, so the orchestrator refunds automatically and the page says "refund started" instead of a blank error.', flow: ['pay>saga', 'saga>inv', 'inv>pg', 'saga>pay'], warn: ['pay'], badges: { pay: ['refund', 'warn'] }, tone: 'ok' }
      ]
    },
    {
      id: 'dip', title: 'Seva lucky dip: a lottery, not a race', tone: 'info',
      steps: [
        { text: 'Sevas have very few places, so racing for them would repeat the T0 stampede. Instead a <b>registration window</b> stays open for days. Load is spread out and click speed does not matter.', flow: ['dev>cdn', 'cdn>api', 'api>dip'], badges: { dip: 'registrations' } },
        { text: 'Each registration is keyed by <b>ID hash, seva and month</b>. Duplicates from other logins or devices collapse into one entry, so a broker gains nothing by registering fifty times.', flow: ['api>idp', 'api>dip'], badges: { dip: ['dedup by ID', 'ok'] } },
        { text: 'Before registration closes, publish <b>SHA-256(seed)</b>. After it closes, publish a digest of the entries, then reveal the seed. Anyone can rerun the shuffle and get the same winners.', nodes: ['dip'], ok: ['dip'], badges: { dip: ['seed committed', 'ok'] } },
        { text: 'Winners are told by SMS and email and must <b>pay by a deadline</b>. Payment goes through the same orchestrator, with the same idempotency rules.', flow: ['dip>saga', 'saga>pay', 'saga>inv'], badges: { pay: 'pay by deadline' } },
        { text: 'Unpaid places go to the <b>next names in the ranked list</b>. The draw already ordered everyone, so there is no second race and no new randomness to argue about.', nodes: ['dip', 'inv'], ok: ['inv'], badges: { inv: ['waitlist filled', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Five decisions for release day. The crowd and quota follow TTD\'s Sep 2026 figures (≈6 lakh users, ≈2.69 lakh tickets, ≈4 per user). Capacities, bot share (10% of sessions) and payment behaviour (75% of holds pay, 15% fail at the bank and free in ~1 min, 10% are abandoned for the full TTL; payment time averages 2 min) are <em>illustrative estimates</em>.',
    controls: [
      { id: 'adm', label: 'Admission at T0', type: 'seg', value: 'random', options: [
        { v: 'none', l: 'No queue' }, { v: 'fifo', l: 'FIFO queue' }, { v: 'random', l: 'Queue, random at T0' }] },
      { id: 'cap', label: 'Capacity plan', type: 'seg', value: 'pre', options: [
        { v: 'auto', l: 'Autoscale on CPU' }, { v: 'pre', l: 'Pre-scale before T0' }] },
      { id: 'lim', label: 'Booking limit keyed on', type: 'seg', value: 'id', options: [
        { v: 'login', l: 'Login only' }, { v: 'id', l: 'Verified ID + OTP' }] },
      { id: 'ttl', label: 'Hold TTL', type: 'range', min: 2, max: 20, step: 1, value: 8, unit: 'min' },
      { id: 'seva', label: 'Seva allotment', type: 'seg', value: 'dip', options: [
        { v: 'race', l: 'First come, first served' }, { v: 'dip', l: 'Lucky dip' }] }
    ],
    evaluate(s) {
      const U = 600000, Q = 269000, PER = 4, BOT = 0.10;     // TTD Sep 2026 figures; bot share is an estimate
      const B = Q / PER;                                     // bookings until the quota is gone
      const capPre = 120000, capAuto = 40000;               // concurrent booking sessions origin can serve (estimates)
      const SESSION = 3;                                     // minutes an admitted devotee spends booking (estimate)
      // hold outcomes (estimates): 75% would pay, 15% fail at the bank (released in ~1 min), 10% abandon (full TTL)
      const late = Math.exp(-s.ttl / 2);                     // payment time ~ exponential, mean 2 min (estimate)
      const succ = 0.75 * (1 - late);
      // origin load and the effective admission rate (devotees / min)
      let load, rate;
      if (s.adm === 'none') {
        const cap = s.cap === 'pre' ? capPre : capAuto;
        load = U / cap;                                      // everyone hits origin together
        rate = (cap / SESSION) / load;                       // overload: timeouts and retries waste capacity
      } else {
        const want = 30000;                                  // planned outflow per minute
        const cap0 = s.cap === 'pre' ? capPre : capAuto;
        rate = Math.min(want, cap0 / SESSION);
        load = rate * SESSION / cap0;
      }
      let mins = B / (rate * succ);
      if (s.adm !== 'none' && s.cap === 'auto') {            // autoscaling catches up ~8 min after T0
        const first = rate * succ * 8;
        mins = first >= B ? B / (rate * succ) : 8 + (B - first) / (Math.min(30000, capPre / SESSION) * succ);
      }
      const adv = { none: 6, fifo: 4, random: 1 }[s.adm];   // how much faster bots reach the front
      const rep = s.lim === 'login' ? 3 : 1;                 // bookings per bot identity
      const bw = BOT * adv * rep, botShare = Math.min(0.9, bw / (bw + (1 - BOT)));
      const drainRate = s.adm === 'none' ? rate : Math.min(30000, rate);
      // Little's law during the drain: holds per minute × tickets × minutes each one stays parked
      const parked = Math.min(Q, drainRate * PER * (0.15 * Math.min(1, mins) + (0.10 + 0.75 * late) * Math.min(s.ttl, mins)));
      const lateShare = late / (1 - late);                   // paid-too-late per successful booking
      const refunds = Math.round(B * lateShare);
      const fmtMin = (m) => m < 1 ? '< 1 min' : m < 90 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' h';
      const exp = {
        none: ['freezes, timeouts, retry storms; errors look like "sold out"', 0.1],
        fifo: ['a real position and ETA, but a slow click at T0 puts you behind scripts', 0.55],
        random: ['a position by lot among everyone waiting at T0, then FIFO, with an ETA', 0.9]
      }[s.adm];
      const metrics = [
        { k: 'Origin load at T0', v: Math.round(load * 100) + '% of capacity', s: load < 0.8 ? 0.9 : load < 1.05 ? 0.6 : 0.05, hint: 'sessions ÷ capacity' },
        { k: 'Time until "quota full"', v: fmtMin(mins) + (s.adm === 'none' ? ' (mostly errors)' : ''), s: s.adm === 'none' ? 0.1 : mins < 15 ? 0.85 : 0.5, hint: 'orderly beats fast' },
        { k: 'Tickets taken by bots / agents', v: Math.round(botShare * 100) + '% (bots: 10% of sessions)', s: botShare < 0.15 ? 0.9 : botShare < 0.35 ? 0.5 : 0.1 },
        { k: 'Tickets parked in unpaid holds', v: SD.fmt.num(parked) + ' (' + Math.round(parked / Q * 100) + '%), back ≤ ' + s.ttl + ' min after full', s: s.ttl >= 14 ? 0.2 : s.ttl <= 3 ? 0.3 : parked / Q < 0.35 ? 0.65 : 0.4, hint: 'estimate' },
        { k: 'Paid after the hold expired', v: SD.fmt.num(refunds) + ' refunds (' + (lateShare * 100).toFixed(lateShare < 0.1 ? 1 : 0) + '% of bookings)', s: lateShare < 0.03 ? 0.9 : lateShare < 0.1 ? 0.55 : 0.15, hint: 'pay time mean 2 min' },
        { k: 'Seva allotment', v: s.seva === 'dip' ? 'equal chance per registered ID; load spread over days' : 'a second stampede that scripts win again', s: s.seva === 'dip' ? 0.9 : 0.2 },
        { k: 'What devotees see', v: exp[0], s: exp[1] }
      ];
      const notes = [];
      if (s.adm === 'none') notes.push('Without a queue, origin load is the <b>crowd size</b>, not a rate you chose. The Aug 2021 freeze had about 1.10 lakh concurrent hits against a normal 30–40K capacity.');
      if (s.adm === 'fifo') notes.push('FIFO from T0 orders people by <b>who clicked first</b>, which mostly measures network latency and scripts. Shuffle everyone already waiting, then go FIFO.');
      if (s.adm === 'random') notes.push('Randomising the pre-queue is what Queue-it describes for scheduled sales: arriving at 9:59:59.9 gives no edge, so bots must compete as ordinary entries.');
      if (s.cap === 'auto') notes.push('CPU-based autoscaling reacts minutes after the spike; a release spike peaks in seconds. With a queue you survive by admitting fewer people at first, so the release drags. See <a href="live-streaming.html">Live Event Streaming</a> for ladder pre-scaling.');
      if (s.lim === 'login') notes.push('Limits keyed on a login or mobile are easy to multiply. Reports described <b>807 reservations on one mobile number</b> and 926 on one email in TTD bookings.');
      if (s.ttl <= 3) notes.push('A ' + s.ttl + '-minute hold is shorter than many UPI and bank redirects, so good payers time out, pay late and need refunds.');
      if (s.ttl >= 14) notes.push('Long holds park tickets for abandoned checkouts. The site shows "quota full", then tickets reappear later for whoever is still polling.');
      if (s.seva === 'race') notes.push('A first-come seva release rewards the same scripts. TTD itself runs an electronic lucky dip for Arjitha sevas, and has reportedly considered one for Srivani tickets after bulk bookings.');
      let verdict;
      if (s.adm === 'none') verdict = '❌ <b>Origin melts at T0.</b> Load is ' + Math.round(load * 100) + '% of capacity, devotees see errors for a long time, and scripts take ' + Math.round(botShare * 100) + '% of tickets.';
      else if (s.lim === 'login') verdict = '⚠ <b>Brokers multiply bookings.</b> The queue keeps the site up, but limits on logins let one operator book many times. Key limits on a verified ID.';
      else if (s.ttl <= 3) verdict = '⚠ <b>Holds are shorter than payments.</b> Real devotees lose tickets mid-payment and get refunds instead of darshan.';
      else if (s.ttl >= 14) verdict = '⚠ <b>Phantom sell-out:</b> abandoned holds keep tickets for ' + s.ttl + ' minutes, so they reappear long after "quota full" for whoever is still polling. Use 5–10 minutes.';
      else if (s.cap === 'auto') verdict = '⚠ <b>Up, but slow:</b> the queue protects a cold origin by admitting fewer devotees until autoscaling catches up. For a known T0, pre-scale.';
      else if (s.seva === 'race') verdict = '👍 <b>Darshan release is solid</b>, but the seva race repeats the stampede for the scarcest places. Use the lucky dip.';
      else if (s.adm === 'fifo') verdict = '👍 <b>Stable and honest</b>, but FIFO from T0 still rewards the fastest clicks. Shuffle the pre-queue.';
      else verdict = '✅ <b>Fair and boring on release day:</b> pre-scaled origin, shuffled queue at a paced rate, verified-ID limits, short holds, and a seeded draw for sevas.';
      const labels = {
        wr: s.adm === 'fifo' ? { label: 'FIFO queue', sub: 'first click first' } : { label: 'Virtual queue', sub: 'random at T0 · paced' },
        scaler: s.cap === 'pre' ? { label: 'Pre-scaler', sub: 'warm before T0' } : { label: 'Autoscaler', sub: 'CPU alarm → add nodes' },
        idp: s.lim === 'id' ? { label: 'Identity & OTP', sub: '1 booking per ID' } : { label: 'Login check', sub: 'per account only' },
        dip: s.seva === 'dip' ? { label: 'Lucky-dip draw', sub: 'seeded · auditable' } : { label: 'Seva release', sub: 'first come' },
        sweep: { label: 'Hold sweeper', sub: 'TTL ' + s.ttl + ' min' }
      };
      const flow = (s.adm === 'none' ? ['dev>cdn', 'bot>cdn', 'cdn>api'] : ['dev>cdn', 'cdn>wr', 'wr>cdn', 'cdn>api'])
        .concat(['api>idp', 'api>inv', 'inv>pg', 'api>saga', 'saga>pay'], s.seva === 'dip' ? ['api>dip'] : []);
      const overloaded = load >= 1.05;
      return {
        metrics, verdict, notes, labels, flow,
        hide: s.adm === 'none' ? ['wr'] : [],
        hot: s.adm === 'random' ? ['wr'] : [],
        warn: [].concat(s.lim === 'login' ? ['idp', 'bot'] : [], s.ttl >= 14 || s.ttl <= 3 ? ['sweep'] : [], s.seva === 'race' ? ['dip'] : [], s.cap === 'auto' && !overloaded ? ['scaler'] : []),
        err: overloaded ? ['api', 'cdn'] : [],
        ok: s.cap === 'pre' && !overloaded ? ['api'] : [],
        badges: { api: [Math.round(load * 100) + '% load', overloaded ? 'err' : load >= 0.8 ? 'warn' : 'ok'], bot: [Math.round(botShare * 100) + '% of tickets', botShare >= 0.35 ? 'err' : botShare >= 0.15 ? 'warn' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Release-day simulator: queue, holds and bots',
    caption: '600 sessions (each dot ≈ 1,000 devotees) chase a 270-ticket quota (≈ 2.69 lakh scaled 1:1,000). 60 sessions are <b>bots</b> run by 12 identities (5 sessions each); they wait in the pre-queue and click within 0.25 s of T0. The per-ID limit caps them at 12 × 4 tickets; random order removes their speed edge over the devotees waiting with them. The queue admits <b>R per second</b> with a token bucket. Toggle <b>FIFO vs random at T0</b> and the <b>per-ID limit</b>, then watch tickets drain, bounce back from failed or expired holds, and where <b>you</b> (an ordinary devotee who joined 30 s early) end up. The same crowd is replayed until you press New crowd. Times are simulated seconds; all rates are illustrative.'
  },

  realWorld: {
    intro: 'TTD is the largest public example of this problem in India. What follows is what TTD and Indian newspapers reported. Internal details such as the queue algorithm, admission rate and data store are not published, so the architecture above is <b>our design</b>.',
    timeline: [
      { when: 'Feb 2015', who: 'TTD', title: 'TCS as technology partner', text: 'Business Standard reported that TTD picked <b>TCS</b> as the technology partner for its online services, including e-darshan and advance booking.', src: 7 },
      { when: 'Jun 2017', who: 'TTD', title: 'Arjitha sevas by online dip', text: 'Arjitha seva tickets began to be allotted through an <b>online lucky dip</b>: register, a computerised draw, and pay by the deadline if selected. The profile carries an ID (Aadhaar or passport), with up to <b>2 devotees</b> per application.', src: 6 },
      { when: 'Aug 2021', who: 'TTD', title: 'Websites freeze at release', text: 'The sites froze when about <b>1.10 lakh</b> concurrent hits arrived, against a normal capacity of <b>30–40K</b>.', src: 3 },
      { when: '2021', who: 'TTD · Jio', title: 'A new portal on a JioMart domain', text: 'TTD moved ticketing to a portal built by <b>Jio free of cost</b> and hosted on a JioMart web domain, which drew criticism.', src: 4 },
      { when: 'Sep 2021', who: 'TTD', title: '2.4 lakh tickets in about an hour', text: 'On the new portal, about <b>2.4 lakh</b> ₹300 tickets were booked within about <b>one hour</b> and total hits touched about <b>one crore</b>, per Zee News. Deccan Chronicle put it at about two hours, so treat the timing as approximate.', src: 5 },
      { when: 'Undated report', who: 'TTD', title: 'Bulk booking on one identity', text: 'Deccan Chronicle reported irregularities with <b>807 reservations tied to one mobile number</b> and 926 to one email id. Later, online Srivani (donation-linked) tickets required <b>Aadhaar and a registered mobile</b>.', src: 8 },
      { when: 'Undated report', who: 'TTD', title: 'Bots on Srivani; lucky dip considered', text: 'A vigilance check found alleged <b>software-assisted bulk booking</b> of Srivani tickets. TTD said it was considering replacing first-come booking with a <b>lucky dip</b>; details were still being worked out.', src: 11 },
      { when: 'Sep 2026', who: 'TTD', title: '6 lakh users, 2.69 lakh tickets', text: 'TTD said about <b>6 lakh users</b> were on the platform at once for ≈<b>2.69 lakh</b> ₹300 tickets, and at about 4 tickets each that is ≈24 lakh wanted. A <b>Virtual Queue</b> regulates traffic; "Slot Unavailable" means the quota is full; payment failures can come from banks or gateways. TTD also said the platform is supported by <b>Google Cloud Platform</b>, load balancing, auto-scaling and a distributed architecture, and that anti-bot and payment work continues. That is TTD\'s own description, as UNI reported it.', src: 2 }
    ],
    lessons: [
      '<span>A known T0 is a gift: <b>pre-scale</b> and pre-render instead of waiting for autoscaling to notice.</span>',
      '<span>Load on origin should be a <b>rate you chose</b> (the queue outflow), never the size of the crowd.</span>',
      '<span>Limits keyed on a login are not limits. Key them on a <b>verified identity</b> and enforce them with a unique constraint.</span>',
      '<span>For the scarcest items, a <b>lottery with a published seed</b> is fairer and cheaper than a race.</span>',
      '<span>Say what is happening: <b>"quota full"</b>, "payment pending", "refund started". Silence turns every sell-out into a reported crash.</span>'
    ],
    sources: [
      { title: 'Heavy demand drives competition for Rs 300 darshan tickets: TTD', url: 'https://telanganatoday.com/heavy-demand-drives-competition-for-rs-300-darshan-tickets-ttd', pub: 'Telangana Today, Sep 2026' },
      { title: 'Tirumala: TTD says booking failure does not mean system glitch', url: 'https://www.deccanchronicle.com/southern-states/andhra-pradesh/tirumala-ttd-says-booking-failure-does-not-mean-system-glitch-1990938', pub: 'Deccan Chronicle, Sep 2026' },
      { title: 'Tirumala special entry darshan tickets (TTD statement)', url: 'https://www.uniindia.com/south-india/religion-tirumala-spl-entry-darshan-tickets/193608', pub: 'UNI, Sep 2026' },
      { title: 'TTD websites freeze, upset devotees', url: 'https://www.deccanchronicle.com/nation/current-affairs/240821/ttd-websites-freeze-upset-devotees.html', pub: 'Deccan Chronicle, Aug 2021' },
      { title: 'TTD faces flak for selling Tirupati temple tickets using JioMart web domain', url: 'https://www.deccanherald.com/india/ttd-faces-flak-for-selling-tirupati-temple-tickets-using-jiomart-web-domain-1033925', pub: 'Deccan Herald, 2021' },
      { title: 'TTD gets good response to online booking, over 2 lakh Tirupati tickets booked within 1 hour', url: 'https://zeenews.india.com/india/ttd-gets-good-response-to-online-booking-over-2-lakh-tirupati-tickets-booked-within-1-hour-2396965.html', pub: 'Zee News, Sep 2021' },
      { title: 'Arjitha seva tickets allotted through online dip', url: 'https://thehansindia.com/posts/index/Andhra-Pradesh/2017-06-24/Arjitha-seva-tickets-allotted-through-online-dip/308352', pub: 'The Hans India, Jun 2017' },
      { title: 'Tirumala temple to use TCS services', url: 'https://www.business-standard.com/article/current-affairs/tirumala-temple-to-use-tcs-services-115022701064_1.html', pub: 'Business Standard, Feb 2015' },
      { title: 'Massive fraud in TTD bookings', url: 'https://www.deccanchronicle.com/southern-states/andhra-pradesh/massive-fraud-in-ttd-bookings-1848455', pub: 'Deccan Chronicle' },
      { title: 'TTD shifts offline Srivani darshan ticketing to online mode', url: 'https://www.deccanchronicle.com/southern-states/andhra-pradesh/ttd-shifts-offline-srivani-darshan-ticketing-to-online-mode-1928782', pub: 'Deccan Chronicle' },
      { title: 'Vigilance probe finds bulk booking of Srivani tickets', url: 'https://www.deccanchronicle.com/southern-states/andhra-pradesh/vigilance-probe-finds-bulk-booking-of-srivani-tickets-1956526', pub: 'Deccan Chronicle' },
      { title: 'TTD planning replacing first-come-first-served Srivani tickets with lucky dip', url: 'https://www.deccanchronicle.com/southern-states/andhra-pradesh/ttd-planning-replacing-first-come-first-served-srivani-tickets-with-lucky-dip-1956765', pub: 'Deccan Chronicle' },
      { title: 'Special drive to streamline online booking has helped: TTD official', url: 'https://www.deccanchronicle.com/nation/in-other-news/250921/special-drive-to-streamline-online-booking-has-helped-ttd-official.html', pub: 'Deccan Chronicle, Sep 2021' },
      { title: 'First-in-first-out vs randomization in a virtual waiting room', url: 'https://www.queue-it.com/blog/first-in-first-out-randomization', pub: 'Queue-it' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Queue order', '<b>FIFO from T0</b>: simple, easy to explain', '<b>Random among everyone waiting at T0</b>, then FIFO', 'Randomise for any announced release; plain FIFO only as a safety valve for unplanned spikes'],
      ['Capacity', '<b>Autoscale</b> on CPU or requests', '<b>Pre-scale</b> to a planned level before T0', 'Pre-scale whenever the spike time is known; keep autoscaling for the long tail after it'],
      ['Allocation', '<b>Race</b> (first come, first served)', '<b>Lottery</b> (register, then draw)', 'Lottery when demand is many times supply and places are scarce (sevas); race with a queue for the big darshan quota'],
      ['Limit key', '<b>Login / mobile / email</b>: no extra data', '<b>Verified ID hash</b> + OTP', 'ID hash when bulk booking is a real problem; store only a keyed hash, not the raw ID number'],
      ['Inventory', '<b>Postgres counters</b> with a conditional UPDATE', '<b>Redis counters</b> in front, Postgres confirms', 'Postgres alone at a paced admission rate; add Redis or split counters if one slot row becomes a hot spot'],
      ['Hold TTL', '<b>Short (2–3 min)</b>: tickets flow back fast', '<b>Long (15+ min)</b>: relaxed payment', '5–10 minutes with a visible countdown; longer only for lucky-dip payment deadlines measured in days']
    ]
  },
  failures: [
    { f: 'Origin overload when the queue is bypassed', detect: 'Booking API requests without a valid token; origin RPS above the admission rate', fix: 'Verify signed tokens at the edge and again at the API; bind tokens to the session; short expiry; lower the admission rate live if the DB runs hot.' },
    { f: '"Slot Unavailable" read as a crash', detect: 'Spike in support calls and social posts while error rates are normal', fix: 'Separate messages for quota full, queue position, and server error; publish remaining counts per date; close the queue with one clear notice.' },
    { f: 'Hold bounce after "quota full"', detect: 'Tickets returning to free after the first zero', fix: 'TTL of 5–10 min; release immediately on gateway failure; keep the queue open until holds settle, and show "N in pending payments".' },
    { f: 'Bank or gateway failure mid-payment', detect: 'Pending or failed callbacks by bank; reconciliation mismatches', fix: 'Webhook plus polling reconciliation; release on definite failure; refund late successes automatically; route around a failing bank.' },
    { f: 'Double booking or double debit on retry', detect: 'Two holds or orders with the same session and slot; two debits per hold', fix: 'Idempotency key per hold, passed to the gateway; <code>UNIQUE (id_hash, period)</code> on bookings; the retry returns the stored result.' },
    { f: 'Hold expires while the bank is still paying', detect: 'Confirm matches 0 rows after a success callback', fix: 'Choose a TTL longer than typical UPI/bank flows; extend once when the gateway reports "in progress"; otherwise refund automatically and say so.' },
    { f: 'Bulk booking by agents and bots', detect: 'Many bookings per mobile, email, device or payment instrument', fix: 'Verified-ID limits, OTP, device and IP rate limits, randomised pre-queue, lucky dip for scarce sevas, and audits of booking clusters.' }
  ],

  interview: [
    { q: 'Why put a virtual queue in front instead of just scaling up?', a: '<p>The quota is fixed: more servers cannot create more darshan slots. Without a queue, origin load equals the <b>crowd size</b>; with a queue it equals the <b>outflow rate you chose</b> and tested. The queue also gives a place to be fair (randomised positions), to filter bots, and to tell people their position honestly.</p>', lvl: 'core' },
    { q: 'FIFO or randomised positions at T0?', a: '<p>For an announced release, FIFO from T0 orders people by who clicked first, which mostly measures <b>network latency and scripts</b>. Give everyone who joined before T0 a random position, then append later arrivals FIFO. This is what Queue-it documents for scheduled sales. Bots must then compete as ordinary entries, and their count is capped by the ID limit.</p>', fu: 'What stops a bot from joining the pre-queue a thousand times? (Positions are per session, but bookings are per verified ID, so extra entries do not convert into extra tickets.)', lvl: 'core' },
    { q: 'How do you choose the admission rate?', a: '<p>Work back from the tightest downstream system, often the DB or the payment gateway. If each admitted devotee spends about 3 minutes booking, <b>Little\'s law</b> gives concurrent sessions = rate × 3 min. Load-test that number with headroom, start a little below it at T0, and raise or lower it live from DB latency and gateway error rates. A slower rate only lengthens the queue; it never causes errors.</p>', lvl: 'deep' },
    { q: 'Why pre-scale rather than autoscale for the release?', a: '<p>Autoscaling reacts to a metric that lags by a minute or more, then needs boot and warm-up time. A release spike peaks within seconds. Because T0 is announced, provision the planned capacity, warm caches, connection pools and the CDN beforehand, and treat autoscaling as a backstop. The <a href="live-streaming.html">live-streaming</a> page shows the same idea as a capacity ladder.</p>', lvl: 'core' },
    { q: 'How do you model slot inventory?', a: '<p>Darshan tickets in a slot are interchangeable, so use a <b>counter row per date × slot</b>, not a row per ticket. A hold is one statement: <code>UPDATE slot_inventory SET held = held + :n WHERE … AND held + booked + :n &lt;= quota</code>. One row means success; zero means full. A <code>CHECK (held + booked &lt;= quota)</code> backs it up. Under READ COMMITTED, a concurrent update waits for the first commit, then re-evaluates the WHERE on the new row.</p>', lvl: 'core' },
    { q: 'How do you enforce "one booking per person per period" under concurrency?', a: '<p>Make it a <b>database constraint</b>: <code>UNIQUE (id_hash, period)</code> on bookings (and on active holds). Two parallel requests for the same ID cannot both insert. Use a keyed hash (HMAC) of the normalised ID number so the raw ID is not stored. Apply it to every devotee in a group, not only the account holder, or a group booking becomes the loophole.</p>', fu: 'Why is a check in application code not enough? (Two requests can both read "no booking yet" before either writes.)', lvl: 'core' },
    { q: 'How long should a hold last, and what is the "bounce"?', a: '<p>Long enough for a UPI or bank redirect, short enough that abandoned holds do not lock much of the quota: 5–10 minutes is typical. By Little\'s law, tickets parked in unpaid holds ≈ failed-or-abandoned holds per minute × tickets per hold × TTL. Those tickets come back after the site first says "quota full", so release immediately on a definite payment failure and tell users that pending payments may free tickets.</p>', lvl: 'deep' },
    { q: 'The bank times out and the devotee taps Pay again. What happens?', a: '<p>The hold id acts as the <b>idempotency key</b> for the order and is passed to the gateway, so the retry returns the existing payment instead of creating a second debit. If the bank later reports success after the hold expired and the tickets were resold, the confirm updates 0 rows and the orchestrator <b>refunds</b> automatically. Reconcile with gateway reports, because webhooks can be lost.</p>', lvl: 'core' },
    { q: 'What is in the admission token, and who verifies it?', a: '<p>Release id, session id, issue time and a short expiry, signed with <b>HMAC-SHA256</b> using a key shared by the queue and the edge. The CDN verifies it without calling origin, and the booking API verifies it again. Binding it to the session stops a token being shared or sold. Compare signatures in constant time, and rotate keys with a key id in the token.</p>', lvl: 'deep' },
    { q: 'How do you make a seva lucky dip auditable?', a: '<p>Use <b>commit and reveal</b>. Before registration closes, publish <code>SHA-256(seed)</code>. After it closes, publish a digest of the deduplicated entries, then reveal the seed. Rank each entry by <code>SHA-256(seed ‖ entry_id)</code> and take the first k as winners and the rest as the waitlist. Anyone can recompute the ranking, and the operator cannot pick a seed after seeing the entries.</p>', fu: 'Why not just call random() on the server? (Nobody outside can check it, and the operator could rerun it until it liked the result.)', lvl: 'deep' },
    { q: 'How do you fight bots without hurting real devotees?', a: '<ul><li>Randomise the pre-queue so speed at T0 does not matter.</li><li>Verified identity with OTP, and limits per <b>ID</b>, not per login. Reports of 807 bookings on one mobile show why.</li><li>Edge bot scoring, device and IP rate limits, CAPTCHA only on suspicion.</li><li>Tokens bound to the session with short expiry.</li><li>Lucky dip for the scarcest sevas, which removes the reward for speed.</li></ul>', lvl: 'core' },
    { q: 'One weekend slot gets most of the attempts. How do you avoid a hot row?', a: '<p>First, the queue already caps total attempts per second. If one counter is still hot, split its quota into <b>N sub-counters</b> and pick one at random, falling back to others when it is empty. Or put an atomic Redis counter (<code>DECRBY</code> in a Lua script) in front and confirm in Postgres. Fail fast with a 409; never retry in a loop against a full slot.</p>', lvl: 'deep' },
    { q: 'How should the system talk to devotees during a release?', a: '<p>Separate states the user can act on: <b>waiting (position and ETA)</b>, admitted (time left on the token), held (countdown), payment pending, <b>quota full</b> (with the next release date), and refund started. TTD had to say publicly that "Slot Unavailable" means the quota is full, not a glitch. When status is vague, every sell-out looks like an outage.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Java 21 / Spring: HMAC-signed admission token', lang: 'java',
      code: `@Service
public class AdmissionTokens {
  private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
  private final SecretKeySpec key;
  private final Clock clock;

  public AdmissionTokens(@Value("\${queue.token-secret}") String secret, Clock clock) {
    this.key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    this.clock = clock;
  }

  /** release.session.expiry.signature — verifiable at the edge without a DB call */
  public String issue(String releaseId, String sessionId, Duration ttl) {
    long exp = clock.instant().plus(ttl).getEpochSecond();
    String body = releaseId + "." + sessionId + "." + exp;
    return body + "." + B64.encodeToString(mac(body));
  }

  public boolean verify(String token, String releaseId, String sessionId) {
    int cut = token.lastIndexOf('.');
    if (cut < 0) return false;
    String body = token.substring(0, cut);
    byte[] sig;
    try { sig = Base64.getUrlDecoder().decode(token.substring(cut + 1)); }
    catch (IllegalArgumentException e) { return false; }
    if (!MessageDigest.isEqual(mac(body), sig)) return false;    // constant time
    String[] p = body.split("\\\\.");
    return p.length == 3 && p[0].equals(releaseId) && p[1].equals(sessionId)
        && clock.instant().getEpochSecond() < Long.parseLong(p[2]);
  }

  private byte[] mac(String body) {
    try {
      Mac m = Mac.getInstance("HmacSHA256");
      m.init(key);
      return m.doFinal(body.getBytes(StandardCharsets.UTF_8));
    } catch (GeneralSecurityException e) { throw new IllegalStateException(e); }
  }
}`,
      note: 'Release and session ids must not contain dots (use UUIDs or base64url). Binding the token to the session stops it being shared; the short expiry means a leaked token is useless within minutes. For key rotation, add a key id as the first field.'
    },
    {
      title: 'Postgres: slot counters, holds and the per-ID limit', lang: 'sql',
      code: `CREATE TABLE slot_inventory (
  release_id int, darshan_date date, slot_start time,
  quota  int NOT NULL,
  held   int NOT NULL DEFAULT 0,
  booked int NOT NULL DEFAULT 0,
  PRIMARY KEY (release_id, darshan_date, slot_start),
  CHECK (held >= 0 AND booked >= 0 AND held + booked <= quota)
);
CREATE TABLE holds (
  hold_id uuid PRIMARY KEY, release_id int, darshan_date date, slot_start time,
  id_hash bytea NOT NULL, tickets smallint NOT NULL,
  expires_at timestamptz NOT NULL, idem_key uuid UNIQUE NOT NULL
);
CREATE TABLE bookings (
  hold_id uuid PRIMARY KEY REFERENCES holds,
  id_hash bytea NOT NULL, period text NOT NULL,
  UNIQUE (id_hash, period)                -- one booking per ID per period
);

-- HOLD (one tx): 0 rows from the UPDATE => slot full, ROLLBACK
UPDATE slot_inventory SET held = held + :n
 WHERE (release_id, darshan_date, slot_start) = (:r, :d, :s)
   AND held + booked + :n <= quota;
INSERT INTO holds VALUES (:hold, :r, :d, :s, :idh, :n, now() + interval '8 min', :idem)
ON CONFLICT (idem_key) DO NOTHING;        -- retry: 0 rows => ROLLBACK, return stored hold

-- CONFIRM after payment (one tx); unique violation => already booked this period
INSERT INTO bookings SELECT hold_id, id_hash, :period FROM holds
 WHERE hold_id = :hold AND expires_at > now();
UPDATE slot_inventory i SET held = held - h.tickets, booked = booked + h.tickets
  FROM holds h WHERE h.hold_id = :hold AND h.expires_at > now()
   AND (i.release_id, i.darshan_date, i.slot_start) = (h.release_id, h.darshan_date, h.slot_start);`,
      note: 'Tested on Postgres 16: a quota of 8 accepts two holds of 4 and rejects a third; a retried idempotency key inserts nothing; a second booking for the same ID and period fails on the unique key, and a confirm after expiry changes 0 rows (so refund). The constraint fires at confirm, so one ID can still <b>park</b> a second hold until it expires; to stop that, also keep one claim row per <code>(id_hash, period)</code> inserted in the hold transaction. A sweeper returns expired holds with <code>held = held - tickets</code> in <code>SKIP LOCKED</code> batches (as on the <a href="ticket-booking.html">ticket booking</a> page).'
    },
    {
      title: 'Python: seeded, auditable lucky dip', lang: 'python',
      code: `import hashlib, hmac, secrets

def commit(seed: str) -> str:
    """Publish this BEFORE registration closes."""
    return hashlib.sha256(seed.encode()).hexdigest()

def draw(seed: str, commitment: str, registrations, places: int):
    """registrations: iterable of (id_hash, devotees). Returns winners, waitlist."""
    if not hmac.compare_digest(commit(seed), commitment):
        raise ValueError("seed does not match the published commitment")
    entries = {}
    for id_hash, devotees in registrations:      # one entry per ID (first wins)
        entries.setdefault(id_hash, min(devotees, 2))
    digest = hashlib.sha256("\\n".join(
        f"{e}:{n}" for e, n in sorted(entries.items())).encode()).hexdigest()
    ranked = sorted(entries, key=lambda e: hashlib.sha256(
        f"{seed}|{e}".encode()).hexdigest())
    winners, used = [], 0
    for e in ranked:
        if used + entries[e] > places:
            break
        winners.append(e); used += entries[e]
    return {"entries_digest": digest, "winners": winners,
            "waitlist": ranked[len(winners):]}

seed = secrets.token_hex(32)
c = commit(seed)                                 # 1. publish c
regs = [(f"id{i:03d}", 1 + i % 2) for i in range(500)] + [("id007", 2)]
r1 = draw(seed, c, regs, places=60)              # 2. close, reveal seed, draw
r2 = draw(seed, c, list(reversed(regs)), places=60)
print(len(r1["winners"]), r1["winners"] == r2["winners"])   # anyone can re-run`
    }
  ],

  related: ['ticket-booking', 'irctc-booking', 'live-streaming', 'rate-limiter', 'cdn', 'payment-gateway']
});
