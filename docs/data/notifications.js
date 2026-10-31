SD.register({
  slug: 'notifications',
  domain: 5,
  title: 'Notification Gateway',
  examples: 'APNs, FCM, Uber RAMEN',
  tagline: 'Accept notifications from every team, respect each user\'s preferences, and get an <b>OTP through in seconds</b> even while a 50-million-message marketing blast is draining.',
  tldr: {
    problem: 'Many producers, several channels (push, SMS, email) and external providers with hard rate limits. A slow or throttled provider must not delay urgent messages or lose them.',
    idea: 'Validate and <b>deduplicate</b> at the API, apply <b>preferences</b> once, then route into <b>separate priority queues</b> per channel. Workers send through <b>per-provider rate limiters</b> and retry with <b>exponential backoff and jitter</b>; failures go to a DLQ.',
    insight: 'The provider\'s quota is the real bottleneck. Priority is decided by <i>which queue you are in</i>, not by how fast workers run. Netflix RENO routes events to priority-specific queues and clusters for exactly this reason.',
    numbers: [
      { v: '600K/min', l: 'default FCM send quota per project (Firebase docs)' },
      { v: '4 KB', l: 'max payload for APNs alerts and FCM messages (vendor docs)' },
      { v: '~150K/s', l: 'peak events through Netflix RENO (Netflix, 2022)' }
    ]
  },

  intro: {
    what: 'A notification gateway is the one place every team in a company uses to message users: <b>phone push alerts, SMS and email</b>. It checks what each user agreed to receive, picks the channel, and hands the message to outside delivery services such as Apple\'s and Google\'s push networks or an SMS company.',
    analogy: {
      icon: '📮',
      title: 'A post office with an express counter',
      text: 'Every department drops its letters at one post office instead of driving them around itself. The clerk throws away letters to people who said "no junk mail", and puts urgent letters in an <b>express tray</b> that never waits behind the bulk flyers. The trucks (outside providers) only take so many bags per hour, so the office paces the bulk mail and keeps room on each truck for express. Unlike real mail, the office cannot see whether a letter reached the doorstep once the truck has it.'
    },
    problem: 'You try to log in and wait for a one-time code by SMS. At that same moment, marketing is sending a promotion to millions of users. The SMS company only accepts so many messages per second and starts refusing extras. Without care, <b>your code waits behind the promotion</b> and arrives after it has expired. The question is: <b>how do you deliver urgent messages fast, respect each user\'s choices, and never overload the outside providers?</b>',
    story: [
      {
        stage: 'naive',
        title: 'One queue, send everything as fast as possible',
        text: 'Every service drops its messages into <b>one shared queue</b>. Workers take them in order and call the SMS or push provider as fast as they can. Easy to build, and fine while volumes are small.',
        scene: {
          nodes: [
            { id: 'prod', label: 'Services', sub: 'login · promos', kind: 'client', at: [70, 0] },
            { id: 'q', label: 'One queue', sub: 'in arrival order', kind: 'queue', at: [210, 0] },
            { id: 'wk', label: 'Workers', sub: 'send at once', kind: 'compute', at: [350, 0] },
            { id: 'sms', label: 'Providers', sub: 'SMS · push', kind: 'external', at: [350, 110] }
          ],
          edges: [{ from: 'prod', to: 'q' }, { from: 'q', to: 'wk' }, { from: 'wk', to: 'sms' }],
          flow: ['prod>q', 'q>wk', 'wk>sms']
        }
      },
      {
        stage: 'breaks',
        title: 'The OTP waits behind a promo blast',
        text: 'A promotion puts millions of messages in the queue. The provider hits its limit and answers <b>"too many requests"</b>. Workers retry all at once, which makes it worse. A login code queued behind the promotion arrives <b>minutes late</b>. Retries also send some messages twice, and users who opted out still get promos.',
        scene: {
          nodes: [
            { id: 'prod', label: 'Services', sub: 'promo blast', kind: 'client', at: [70, 0] },
            { id: 'q', label: 'One queue', sub: 'huge backlog', kind: 'queue', at: [210, 0] },
            { id: 'wk', label: 'Workers', sub: 'retry together', kind: 'compute', at: [350, 0] },
            { id: 'otp', label: 'Login code', sub: 'stuck in line', kind: 'client', at: [70, 110] },
            { id: 'sms', label: 'Providers', sub: 'rejecting', kind: 'external', at: [350, 110] }
          ],
          edges: [{ from: 'prod', to: 'q' }, { from: 'otp', to: 'q' }, { from: 'q', to: 'wk' }, { from: 'wk', to: 'sms' }],
          flow: [['prod>q', 'otp>q'], 'q>wk', ['wk>sms', 'wk>sms']],
          err: ['sms', 'otp'],
          warn: ['q'],
          badges: { sms: ['429 too many', 'err'], otp: ['expired ⏳', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Check once, split into lanes, pace each provider',
        text: 'A single <b>API</b> drops duplicates using an <b>idempotency key</b> and applies each user\'s <b>preferences</b> up front. Messages then go into <b>separate queues by priority</b>, each with its own workers, so a promo backlog cannot block a login code. Workers send at the provider\'s allowed rate and retry with growing, randomized waits.',
        scene: {
          nodes: [
            { id: 'prod', label: 'Services', sub: 'login · promos', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'Notify API', sub: 'dedup · prefs', kind: 'edge', at: [210, 0] },
            { id: 'q', label: 'Urgent lane', sub: 'login codes', kind: 'queue', at: [70, 110] },
            { id: 'qp', label: 'Promo lane', sub: 'paced', kind: 'queue', at: [350, 110] },
            { id: 'wk', label: 'Workers', sub: 'rate-limited', kind: 'compute', at: [210, 220] },
            { id: 'sms', label: 'Providers', sub: 'SMS · push', kind: 'external', at: [350, 220] }
          ],
          edges: [{ from: 'prod', to: 'api' }, { from: 'api', to: 'q' }, { from: 'api', to: 'qp' }, { from: 'q', to: 'wk' }, { from: 'qp', to: 'wk' }, { from: 'wk', to: 'sms' }],
          flow: ['prod>api', ['api>q', 'api>qp'], 'q>wk', 'wk>sms'],
          ok: ['q', 'wk'],
          badges: { q: ['code in ~1 s', 'ok'] }
        }
      }
    ],
    usedBy: ['Apple Push (APNs)', 'Firebase Cloud Messaging', 'Amazon SNS', 'Twilio', 'Uber trip updates', 'Netflix (RENO)'],
    whenToUse: [
      'Many teams need to message users over <b>push, SMS or email</b>',
      'Some messages are urgent (login codes, receipts) and some are bulk (promotions)',
      'Outside providers impose rate limits you must respect'
    ],
    whenNot: [
      'Two people chatting live in an open app (see <a href="chat.html">Real-Time Chat &amp; Messaging</a>)',
      'Service-to-service events with no human reader (see <a href="message-queue.html">Distributed Message Queue</a>)',
      'A small app sending a few hundred emails a day: call the email provider\'s API directly'
    ],
    glossary: [
      { term: 'Push provider (APNs / FCM)', def: 'Apple\'s and Google\'s services that actually deliver push alerts to phones; you hand them the message and they deliver it.' },
      { term: 'Device token', def: 'An address for one app install on one device, issued by the push provider; it can change, so apps re-register it often.' },
      { term: 'Idempotency key', def: 'A unique id the sender attaches to a request, so repeating the request does not create a second notification.' },
      { term: 'Transactional vs promotional', def: 'Messages the user needs right now (codes, receipts) versus marketing that can wait or be dropped.' },
      { term: 'Priority lane', def: 'A separate queue with its own workers for one kind of message, so a backlog in one lane never delays another.' },
      { term: 'Token bucket', def: 'A rate limiter that refills "permission to send" at a fixed speed; a send happens only when a token is available.' },
      { term: 'Backoff with jitter', def: 'Waiting longer after each failed try, plus a random amount, so retries do not all hit the provider at the same instant.' },
      { term: 'Dead-letter queue (DLQ)', def: 'A holding queue for messages that failed too many times or expired, kept for alerts and later re-sending.' }
    ]
  },

  requirements: {
    functional: [
      'One API for every team to send a notification',
      'Channels: mobile push, SMS, email (and in-app)',
      'User preferences, opt-outs, quiet hours',
      'Templates and localisation',
      'Priorities: transactional (OTP, receipts) vs promotional',
      'Delivery status and open tracking'
    ],
    nonFunctional: [
      'OTP / transactional p95 ≲ a few seconds end to end',
      'At-least-once delivery to the provider, with dedup',
      'Respect every provider\'s rate limit (no 429 storms)',
      'Promotional blasts of tens of millions per hour',
      'No sends to opted-out users (compliance)',
      'A failed provider or channel does not affect the others'
    ],
    outOfScope: ['Campaign authoring UI', 'ML send-time optimisation', 'In-app chat (see Chat)', 'Building our own push network']
  },

  calculator: {
    inputs: [
      { id: 'users', label: 'Users reachable', min: 1000000, max: 1000000000, value: 100000000, log: true },
      { id: 'per', label: 'Notifications per user per day', min: 0.5, max: 50, step: 0.5, value: 5 },
      { id: 'dev', label: 'Devices / endpoints per user', min: 1, max: 4, step: 0.1, value: 1.5 },
      { id: 'peak', label: 'Peak-to-average (blasts)', min: 1, max: 30, value: 8, unit: '×' },
      { id: 'bytes', label: 'Request size to provider', min: 200, max: 4096, step: 100, value: 1000, fmt: 'bytes' },
      { id: 'ret', label: 'Delivery-log retention', min: 1, max: 365, value: 30, unit: 'days' }
    ],
    outputs: [
      { label: 'Notifications / second (average)', f: (v) => (v.users * v.per) / 86400 },
      { label: 'Provider sends / second (peak)', f: (v) => (v.users * v.per * v.dev / 86400) * v.peak },
      { label: 'Peak vs one FCM project quota (600K/min)', fmt: 'raw', f: (v) => ((v.users * v.per * v.dev / 86400) * v.peak * 60 / 600000).toFixed(1) + '×' },
      { label: 'Egress to providers (peak)', fmt: 'bytesps', f: (v) => (v.users * v.per * v.dev / 86400) * v.peak * v.bytes },
      { label: 'Delivery log (~200 B per send)', fmt: 'bytes', f: (v) => v.users * v.per * v.dev * 200 * v.ret },
      { label: 'Idempotency keys in Redis (24 h, ~100 B)', fmt: 'bytes', f: (v) => v.users * v.per * 100 }
    ],
    note: 'Volumes and sizes are <em>estimates</em>. The 600K messages/minute default FCM quota and the 4096-byte payload limits come from the Firebase and Apple docs. If the quota ratio is above 1×, you must smooth the blast over time or request a higher quota in advance.'
  },

  api: [
    { m: 'POST', p: '/v1/notifications', d: 'Body <code>{user_id, category, template_id, data, priority, idempotency_key}</code>. Returns <b>202</b> with a notification id; delivery is asynchronous.' },
    { m: 'POST', p: '/v1/devices', d: 'Register or refresh a device token <code>{token, platform, app_version}</code>. Called on every app start because tokens rotate.' },
    { m: 'PUT', p: '/v1/users/{id}/preferences', d: 'Per-category channel opt-ins, quiet hours with a time zone, and frequency caps.' },
    { m: 'GET', p: '/v1/notifications/{id}', d: 'Status per channel: <code>queued → sent → delivered / failed / suppressed</code>.' },
    { m: 'POST', p: '/v1/callbacks/{provider}', d: 'Webhook for delivery receipts and bounces from SMS and email providers. Verify the provider\'s signature.' }
  ],
  dataModel: [
    { name: 'notifications', store: 'Cassandra / sharded Postgres', fields: [['user_id', 'int64', 'pk'], ['notification_id', 'timeuuid', 'sk'], ['category', 'text'], ['priority', 'enum'], ['status', 'enum'], ['idempotency_key', 'text', 'idx']], note: 'Partition by user, so "my notifications" is one partition read.' },
    { name: 'device_tokens', store: 'Postgres', fields: [['user_id', 'int64', 'pk'], ['token', 'text', 'sk'], ['platform', 'ios | android | web'], ['last_seen', 'ts'], ['invalid_at', 'ts']], note: 'Delete a token when APNs answers 410 or FCM answers UNREGISTERED.' },
    { name: 'preferences', store: 'Postgres + cache', fields: [['user_id', 'int64', 'pk'], ['category', 'text', 'pk'], ['channels', 'push,sms,email'], ['quiet_hours', 'tz + range']], note: 'Read on every send, so cache it.' },
    { name: 'idem:{key}', store: 'Redis', fields: [['key', 'idempotency key', 'pk'], ['value', 'notification_id'], ['ttl', '24 h']], note: '<code>SET NX EX</code>: the first writer wins.' }
  ],

  architecture: {
    title: 'Notification gateway architecture',
    nodes: [
      { id: 'prod', label: 'Producers', sub: 'auth · orders · marketing', kind: 'client', wide: [90, 220], tall: [210, 0], tip: 'Internal services that want to notify a user. They call one API instead of talking to providers.' },
      { id: 'api', label: 'Notification API', sub: 'validate · dedup', kind: 'edge', wide: [280, 220], tall: [210, 105], tip: 'Validates the request, checks the idempotency key, renders the template and assigns a priority.' },
      { id: 'idem', label: 'Idempotency store', sub: 'Redis SET NX · 24 h', kind: 'cache', wide: [280, 330], tall: [70, 105], tip: 'The first request with a key wins. Retries return the original notification id.' },
      { id: 'pref', label: 'Preferences', sub: 'opt-out · caps · quiet', kind: 'service', wide: [470, 110], tall: [350, 105], tip: 'Drops opted-out users, applies frequency caps and delays promos into the user\'s local daytime.' },
      { id: 'q', label: 'Priority queues', sub: 'txn / promo topics', kind: 'queue', wide: [470, 220], tall: [210, 210], tip: 'Separate topics (and consumer pools) per priority and channel. A promo backlog cannot block an OTP.' },
      { id: 'dlq', label: 'Dead-letter queue', sub: 'retries exhausted', kind: 'queue', wide: [470, 330], tall: [70, 210], tip: 'Messages that failed after N attempts or expired. Alert on its size and redrive after a fix.' },
      { id: 'wpush', label: 'Push workers', sub: 'rate-limited', kind: 'compute', wide: [660, 110], tall: [70, 315], tip: 'Hold HTTP/2 connections to APNs and FCM, send with a token-bucket limiter, and clean up dead tokens.' },
      { id: 'wsms', label: 'SMS workers', sub: 'backoff + jitter', kind: 'compute', wide: [660, 220], tall: [210, 315], tip: 'Send through one or more SMS aggregators, with retries and failover between providers.' },
      { id: 'wmail', label: 'Email workers', sub: 'batched', kind: 'compute', wide: [660, 330], tall: [350, 315], tip: 'Batch recipients per API call and keep sender reputation healthy (bounces, complaints).' },
      { id: 'apns', label: 'APNs / FCM', sub: 'push providers', kind: 'external', wide: [850, 110], tall: [70, 420], tip: 'Apple and Google deliver to the device. Payloads up to 4 KB; FCM\'s default quota is 600K messages/min per project.' },
      { id: 'sms', label: 'SMS provider', sub: 'Twilio etc.', kind: 'external', wide: [850, 220], tall: [210, 420], tip: 'Carrier aggregator with its own throughput limits. Returns 429 when you exceed them.' },
      { id: 'ses', label: 'Email provider', sub: 'SES / SendGrid', kind: 'external', wide: [850, 330], tall: [350, 420], tip: 'Sends email and reports bounces and complaints through webhooks.' },
      { id: 'track', label: 'Delivery log', sub: 'status · receipts', kind: 'store', wide: [850, 0], tall: [70, 525], tip: 'Per-send status from provider responses and receipts. Powers support tools, analytics and open tracking.' }
    ],
    edges: [
      { from: 'prod', to: 'api' },
      { from: 'api', to: 'idem' },
      { from: 'api', to: 'pref' },
      { from: 'pref', to: 'q' },
      { from: 'q', to: 'wpush' },
      { from: 'q', to: 'wsms' },
      { from: 'q', to: 'wmail' },
      { from: 'wpush', to: 'apns' },
      { from: 'wsms', to: 'sms' },
      { from: 'wmail', to: 'ses' },
      { from: 'apns', to: 'track', label: 'receipts' },
      { from: 'wsms', to: 'dlq' },
      { from: 'dlq', to: 'q', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'otp', title: 'OTP skips the promo backlog', tone: 'ok',
      steps: [
        { text: 'The auth service sends a login OTP with <code>priority=transactional</code> and an idempotency key.', flow: ['prod>api', 'api>idem'], badges: { idem: 'SET NX ✓' } },
        { text: 'Preferences: OTP is a <b>required</b> category, so opt-outs and quiet hours do not apply.', flow: ['api>pref'], badges: { pref: 'required' } },
        { text: 'It lands on the <b>transactional SMS topic</b>. The promo topic holds a 20M backlog, but that is a different queue with different consumers.', flow: ['pref>q'], badges: { q: 'txn 0 · promo 20M' } },
        { text: 'Dedicated SMS workers pick it up at once. Capacity is reserved for this lane in the rate limiter.', flow: ['q>wsms', 'wsms>sms'], badges: { sms: 'sent ~1 s' }, tone: 'ok' }
      ]
    },
    {
      id: 'blast', title: 'Hot spot: 50M-message marketing blast', tone: 'warn',
      steps: [
        { text: 'Marketing enqueues a campaign for <b>50M users</b>.', flow: ['prod>api', 'api>pref'], badges: { api: '50M' } },
        { text: 'Preferences remove opted-out users, apply <b>frequency caps</b> and move sends into each user\'s local daytime.', nodes: ['pref'], badges: { pref: '−30% capped' } },
        { text: 'The rest goes to the promo topic, and the backlog grows far faster than it can drain.', flow: ['pref>q'], warn: ['q'], badges: { q: ['promo 35M', 'warn'] }, tone: 'warn' },
        { text: 'Push workers drain at the provider\'s pace. At FCM\'s default <b>600K/min</b> per project, 35M sends take about an hour, so the blast is spread out on purpose.', flow: ['q>wpush', 'wpush>apns'], badges: { apns: '600K/min' } },
        { text: 'Transactional topics keep their own consumers, so OTPs and receipts are still on time.', nodes: ['q', 'wsms'], ok: ['wsms'], tone: 'ok' }
      ]
    },
    {
      id: 'throttle', title: 'Provider throttles (429)', tone: 'err',
      steps: [
        { text: 'The SMS provider answers <b>429 Too Many Requests</b>: we exceeded its throughput.', flow: ['q>wsms', 'wsms>sms'], err: ['sms'], badges: { sms: ['429', 'err'] }, tone: 'err' },
        { text: 'The worker retries with <b>exponential backoff and full jitter</b> (a random wait up to 1 s, 2 s, 4 s…) and honours <code>Retry-After</code>. Synchronized retries would cause another spike.', nodes: ['wsms'], warn: ['wsms'], badges: { wsms: ['backoff', 'warn'] }, tone: 'warn' },
        { text: 'The token-bucket limiter lowers the send rate, and a <b>circuit breaker</b> can fail over to a second SMS provider.', nodes: ['wsms', 'sms'], badges: { wsms: 'rate ↓' } },
        { text: 'After N attempts, or once the message is too old to matter (an OTP after 5 minutes), it goes to the <b>DLQ</b> and an alert fires.', flow: ['wsms>dlq'], badges: { dlq: ['+1', 'warn'] } },
        { text: 'When the provider recovers, still-valid messages are <b>redriven</b> from the DLQ into the queue.', flow: ['dlq>q', 'q>wsms', 'wsms>sms'], ok: ['sms'], tone: 'ok' }
      ]
    },
    {
      id: 'optout', title: 'User opted out: suppressed', tone: 'info',
      steps: [
        { text: 'A promo push is requested for a user who turned off marketing notifications.', flow: ['prod>api', 'api>pref'] },
        { text: 'The preference check <b>drops it before any queue</b>. Nothing reaches a provider.', nodes: ['pref'], warn: ['pref'], badges: { pref: ['opted out', 'warn'] } },
        { text: 'The status <code>suppressed</code> is recorded, so support can answer "why didn\'t I get it?" and compliance has an audit trail.', nodes: ['track'], badges: { track: 'suppressed' }, tone: 'ok' }
      ]
    },
    {
      id: 'dedup', title: 'Duplicate event from a retrying producer', tone: 'warn',
      steps: [
        { text: 'The order service times out and retries "order shipped" three times with the <b>same idempotency key</b>.', flow: [['prod>api', 'prod>api']], badges: { prod: '×3' }, tone: 'warn' },
        { text: 'First call: <code>SET idem:{key} {id} NX EX 86400</code> succeeds, so the notification proceeds.', flow: ['api>idem'], badges: { idem: 'NX ✓' } },
        { text: 'The retries fail the <code>NX</code> and get back the original id. Nothing new is enqueued.', flow: ['api>idem'], badges: { idem: ['dup ×2', 'warn'] } },
        { text: 'If a duplicate still slips through (a worker crashes after sending), a <b>collapse id</b> (<code>apns-collapse-id</code> / FCM <code>collapse_key</code>) makes the device show one notification.', flow: ['pref>q', 'q>wpush', 'wpush>apns'], badges: { apns: 'collapse' }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Run a promo blast while OTPs keep arriving. The push drain rate is one FCM project\'s default quota (600K/min). The other numbers are illustrative.',
    controls: [
      { id: 'prio', label: 'Queues', type: 'seg', value: 'on', options: [
        { v: 'on', l: 'Separate priority lanes' }, { v: 'off', l: 'One shared FIFO' }] },
      { id: 'retry', label: 'Retry policy', type: 'seg', value: 'jitter', options: [
        { v: 'none', l: 'No retry' }, { v: 'fixed', l: 'Fixed 1 s × 5' }, { v: 'jitter', l: 'Exp. backoff + jitter' }] },
      { id: 'caps', label: 'Frequency caps + quiet hours', type: 'seg', value: 'on', options: [
        { v: 'on', l: 'On' }, { v: 'off', l: 'Off' }] },
      { id: 'batch', label: 'Email batching', type: 'seg', value: 'on', options: [
        { v: 'off', l: '1 recipient / call' }, { v: 'on', l: 'Batch per call' }] },
      { id: 'promo', label: 'Promo blast size', type: 'range', min: 0, max: 100000000, step: 5000000, value: 20000000, fmt: (v) => SD.fmt.num(v) + ' msgs' }
    ],
    evaluate(s) {
      const DRAIN = 600000 / 60;                       // msgs/s, one FCM project default quota
      const sent = s.promo * (s.caps === 'on' ? 0.7 : 1); // caps/opt-outs drop ~30% (illustrative)
      const drain = sent / DRAIN;                        // seconds
      const otp = s.prio === 'on' ? 1.5 : 1.5 + drain;   // shared FIFO: OTP waits behind the backlog
      const lost = { none: 0.03, fixed: 0.002, jitter: 0.0005 }[s.retry]; // of a 3% transient failure rate
      const pressure = { none: 1, fixed: 5, jitter: 1.6 }[s.retry];       // load multiplier during an outage
      const emailRate = 2000;                            // emails/s, illustrative
      const calls = s.batch === 'on' ? emailRate / 50 : emailRate;
      const annoy = Math.min(1, (s.promo / 1e8) * (s.caps === 'on' ? 0.35 : 1));
      const metrics = [
        { k: 'OTP latency during blast', v: SD.fmt.dur(otp * 1000), s: otp < 5 ? 0.95 : otp < 60 ? 0.5 : 0.05, hint: 'p95' },
        { k: 'Promo drain time', v: sent ? SD.fmt.dur(drain * 1000) : '—', s: drain < 1800 ? 0.85 : drain < 7200 ? 0.6 : 0.35, hint: SD.fmt.num(sent) + ' sends' },
        { k: 'Lost on transient errors', v: (lost * 100).toFixed(2) + '%', s: lost < 0.001 ? 0.95 : lost < 0.01 ? 0.7 : 0.15 },
        { k: 'Provider load in an outage', v: pressure + '× normal', s: pressure <= 1.6 ? 0.85 : 0.2, hint: s.retry === 'fixed' ? 'synchronized' : 'spread' },
        { k: 'Email API calls/s', v: SD.fmt.num(calls) + '/s', s: s.batch === 'on' ? 0.9 : 0.4, hint: SD.fmt.num(emailRate) + ' emails/s' },
        { k: 'Opt-out / uninstall risk', v: annoy < 0.2 ? 'low' : annoy < 0.5 ? 'medium' : 'high', s: 1 - annoy }
      ];
      const notes = [];
      if (s.prio === 'off' && sent) notes.push('With one FIFO, an OTP enqueued after the blast waits for <b>' + SD.fmt.num(sent) + '</b> promos ahead of it. Most OTPs expire within 5–10 minutes.');
      if (s.prio === 'on') notes.push('Each priority has its own topic and consumer pool, and the rate limiter reserves part of the provider quota for transactional traffic.');
      if (s.retry === 'fixed') notes.push('Every failed message retries at the same moment, so a provider that just recovered gets hit by a synchronized wave and returns 429 again.');
      if (s.retry === 'none') notes.push('Transient 5xx and 429 responses are common at scale. Without retries those notifications silently vanish.');
      if (s.retry === 'jitter') notes.push('Full jitter: wait a random time in <code>[0, base·2ⁿ]</code>. Retries spread out and the provider recovers.');
      if (s.batch === 'on') notes.push('Batching many recipients into one templated API call cuts request overhead (about 50 per call here, an illustrative value).');
      if (s.caps === 'off' && s.promo >= 5e7) notes.push('Without caps, heavy users get every campaign. Users disable notifications at the OS level, and you can\'t win those users back.');
      let verdict;
      if (s.prio === 'off' && sent >= 5e6) verdict = '❌ <b>OTPs are stuck behind the blast.</b> Split transactional and promotional traffic into separate lanes.';
      else if (s.retry === 'none') verdict = '⚠ <b>Fast but lossy.</b> Add retries with backoff and a DLQ.';
      else if (s.retry === 'fixed') verdict = '⚠ <b>Retries will cause storms</b> when a provider wobbles. Use exponential backoff with jitter.';
      else if (s.caps === 'off' && s.promo >= 5e7) verdict = '⚠ <b>Technically fine, bad for users.</b> Turn on caps and quiet hours.';
      else verdict = '✅ <b>Production-grade:</b> priority lanes (as in Netflix RENO), jittered retries with a DLQ, and preference checks before anything is queued.';
      return {
        metrics, verdict, notes,
        flow: ['prod>api', 'api>idem', 'api>pref', 'pref>q', ['q>wsms', 'q>wpush'], ['wsms>sms', 'wpush>apns']],
        labels: {
          q: s.prio === 'on' ? { label: 'Priority queues', sub: 'txn / promo topics' } : { label: 'Shared queue', sub: 'one FIFO for all' },
          wsms: { label: 'SMS workers', sub: { none: 'no retry', fixed: 'fixed retry', jitter: 'backoff + jitter' }[s.retry] },
          wmail: { label: 'Email workers', sub: s.batch === 'on' ? 'batched calls' : '1 call per email' },
          pref: { label: 'Preferences', sub: s.caps === 'on' ? 'opt-out · caps · quiet' : 'opt-out only' }
        },
        hot: sent && s.prio === 'on' ? ['wpush'] : [],
        warn: (s.retry === 'fixed' ? ['sms'] : []).concat(s.caps === 'off' ? ['pref'] : []),
        err: s.prio === 'off' && sent >= 5e6 ? ['q'] : [],
        badges: { q: [s.prio === 'on' ? 'OTP ≈ 1.5 s' : 'OTP wait ' + SD.fmt.dur(otp * 1000), s.prio === 'on' ? 'ok' : 'err'] }
      };
    }
  },

  widget: {
    title: 'Priority lanes vs a throttled provider',
    caption: 'OTPs arrive about once a second while you <b>drag up the promo rate</b>. The provider token bucket allows 40 sends/s. Switch to a shared FIFO, or turn off the client-side limiter to see <b>429s</b> and jittered retries.'
  },

  realWorld: {
    intro: 'Large apps keep their own gateway between product teams and the APNs/FCM/SMS/email providers. What they published:',
    timeline: [
      { when: '2020', who: 'Uber', title: 'RAMEN replaces polling', text: 'Uber\'s apps used to poll; at one point <b>80% of API gateway requests were polling calls</b>. RAMEN (Realtime Asynchronous MEssaging Network) pushes updates instead. Its Fireball component decides <i>when</i> to push, and messages carry a TTL and are retried until it expires.', src: 0 },
      { when: '2021', who: 'Airbnb', title: 'One platform for promos and transactional', text: 'Airbnb\'s communications platform serves marketing and transactional messages through one delivery service across email, SMS and push, instead of each team building its own.', src: 3 },
      { when: '2022', who: 'Netflix', title: 'RENO: priority queues', text: 'RENO receives events from Netflix\'s Manhattan framework and routes them to <b>priority-specific SQS queues</b> and matching compute clusters, so a failing lane does not affect the others. It peaks at about <b>150K events/s</b>; old events are dropped by a staleness filter.', src: 2 },
      { when: '2022', who: 'Uber', title: 'RAMEN moves to gRPC streams', text: 'RAMEN moved from Server-Sent Events over HTTP/1.1 to <b>gRPC bidirectional streaming</b>. Acks used to be sent in batches, so a message\'s delivery state could be unknown for up to 30 s; now each ack goes back on the same stream. The old protocol sent a heartbeat every 4 s and reconnected after 7 s of silence.', src: 1 },
      { when: '2024', who: 'Pinterest', title: 'NEP: relevance before sending', text: 'Pinterest\'s Notification Event Processor makes send decisions in near real time, controlling how many notifications a user gets and when, to cut irrelevant ones.', src: 4 },
      { when: 'Today', who: 'Apple · Google', title: 'Provider limits you design around', text: 'FCM: a default of <b>600K messages/min per project</b> (429 <code>QUOTA_EXCEEDED</code> when exceeded) and 4096-byte payloads. APNs: 4 KB payloads, <code>apns-priority</code> 10 or 5, <code>apns-collapse-id</code> up to 64 bytes, 410 for dead tokens.', src: 5 }
    ],
    lessons: [
      'Separate <b>lanes per priority</b>; never let a blast share a queue with OTPs.',
      'The provider quota is the bottleneck: <b>rate-limit on your side</b> rather than waiting for 429s.',
      'Retries need <b>backoff, jitter, a TTL and a DLQ</b>. A stale notification is worse than none.',
      'Apply <b>preferences and caps</b> before queueing. Users who switch off OS notifications rarely come back.'
    ],
    sources: [
      { title: 'Uber\'s Real-Time Push Platform', url: 'https://www.uber.com/blog/real-time-push-platform/', pub: 'Uber Engineering, 2020' },
      { title: 'Uber\'s Next Gen Push Platform on gRPC', url: 'https://eng.uber.com/blog/ubers-next-gen-push-platform-on-grpc/', pub: 'Uber Engineering, 2022' },
      { title: 'Netflix RENO: Rapid Event Notification System (news coverage)', url: 'https://www.infoq.com/news/2022/03/netflix-reno', pub: 'InfoQ, 2022' },
      { title: 'Airbnb\'s Promotions and Communications Platform', url: 'https://medium.com/airbnb-engineering/airbnbs-promotions-and-communications-platform-6266f1ffe2bd', pub: 'Airbnb Tech Blog, 2021' },
      { title: 'NEP: Notification System and Relevance', url: 'https://medium.com/pinterest-engineering/nep-notification-system-and-relevance-a7fff21986c7', pub: 'Pinterest Engineering, 2024' },
      { title: 'FCM Throttling and Quotas', url: 'https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas', pub: 'Firebase docs' },
      { title: 'Handling error responses from APNs', url: 'https://developer.apple.com/documentation/usernotifications/handling-error-responses-from-apns', pub: 'Apple Developer docs' },
      { title: 'Rapid Event Notification System at Netflix', url: 'https://netflixtechblog.com/rapid-event-notification-system-at-netflix-6deb1d2b57d1', pub: 'Netflix Tech Blog, 2022' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Queues', '<b>One queue</b>: simple', '<b>Lanes per priority / channel</b>: isolation', 'Always separate transactional from promotional'],
      ['Delivery guarantee', '<b>At-most-once</b>: no duplicates, some loss', '<b>At-least-once + dedup</b>: rare duplicates', 'At-least-once with idempotency keys and collapse ids'],
      ['Rate limiting', '<b>React to 429s</b>: no coordination', '<b>Shared token bucket</b> (Redis): stays under quota', 'Token bucket once you run more than a few workers'],
      ['Queue tech', '<b>Kafka</b>: high throughput, replay, ordered partitions', '<b>SQS / RabbitMQ</b>: per-message ack, delay and DLQ built in', 'Kafka for big fan-out, SQS-style for per-message retry semantics'],
      ['Device connection', '<b>Provider push (APNs/FCM)</b>: works in background', '<b>Own socket (RAMEN-style)</b>: real-time while app is open', 'Both: own stream in the foreground, provider push otherwise']
    ]
  },
  failures: [
    { f: 'Provider returns 429 / 5xx', detect: 'Error rate per provider', fix: 'Backoff with jitter, honour Retry-After, lower the token-bucket rate, fail over to a second provider.' },
    { f: 'Promo blast delays OTPs', detect: 'Per-lane queue age (oldest message)', fix: 'Separate lanes and consumers; reserve quota for transactional traffic.' },
    { f: 'Duplicate notifications', detect: 'Same idempotency key seen twice; user reports', fix: 'SET NX on the key at the API; collapse ids on the device.' },
    { f: 'Dead device tokens', detect: 'APNs 410 Unregistered, FCM UNREGISTERED', fix: 'Delete the token immediately; refresh tokens on app start.' },
    { f: 'Stale notification delivered late', detect: 'Message age at send time', fix: 'TTL per category (apns-expiration, FCM ttl); drop expired messages to the DLQ.' },
    { f: 'Worker crash mid-batch', detect: 'Uncommitted offsets, lag', fix: 'Commit after send; dedup handles the replay.' }
  ],

  interview: [
    { q: 'Can you guarantee a notification is delivered?', a: '<p>Only <b>to the provider</b>. Once APNs or FCM accepts it, delivery to the device is best-effort. The phone may be off, the app uninstalled, or the OS may throttle. You can guarantee <b>at-least-once hand-off</b> with retries and a DLQ, and you can measure delivery with receipts and opens.</p>', lvl: 'core' },
    { q: 'How do you avoid sending the same notification twice?', a: '<ul><li>The producer sends an <b>idempotency key</b>; the API does <code>SET key NX EX 86400</code>, and only the first request proceeds.</li><li>Workers commit offsets only after sending; a replay is caught by the same key.</li><li>On the device, a <b>collapse id</b> replaces an earlier notification instead of stacking a new one.</li></ul>', lvl: 'core' },
    { q: 'How do you handle provider rate limits?', a: '<p>Keep a <b>token bucket per provider</b> (and per FCM project) shared by all workers, for example in Redis, and send only when a token is available. If a 429 still comes back, retry with <b>exponential backoff and jitter</b> and honour <code>Retry-After</code>. Reserve part of the quota for transactional lanes.</p>', lvl: 'core' },
    { q: 'How do you make sure OTPs are never stuck behind a marketing blast?', a: '<p>Use <b>separate queues and consumer pools per priority</b>. Priority is about isolation, not ordering inside one queue. Netflix RENO, for example, routes events to priority-specific queues and clusters.</p>', lvl: 'core' },
    { q: 'How do you manage device tokens?', a: '<p>Register the token on every app start (tokens rotate) with platform and app version. Keep multiple tokens per user. Delete a token when APNs returns <b>410</b> or FCM returns <b>UNREGISTERED</b>, and expire tokens not seen for months.</p>', lvl: 'core' },
    { q: 'How do you track opens and clicks?', a: '<p>Push: the app reports an "opened" event with the notification id when the user taps. Email: a tracking pixel and redirecting links (pixel opens are unreliable because of image proxies). SMS: shortened tracked links. Join these events with the delivery log.</p>', lvl: 'core' },
    { q: 'Why retry with jitter instead of a fixed delay?', a: '<p>With a fixed delay, every message that failed at the same moment retries at the same moment, so the recovering provider gets a synchronized spike and fails again. <b>Full jitter</b> picks a random delay in <code>[0, base·2ⁿ]</code>, which spreads retries and lets the provider recover.</p>', lvl: 'core' },
    { q: 'How do quiet hours and frequency caps work at scale?', a: '<p>Check them in the preference step, <b>before</b> queueing. Caps use a per-user counter with a TTL (e.g. promos sent today). Quiet hours need the user\'s time zone: delayed messages go to a <b>delay queue</b> or scheduler keyed by send time.</p>', lvl: 'deep' },
    { q: 'A 50M push campaign must finish within an hour. Is that feasible?', a: '<p>50M/hour ≈ 833K/min, which is above FCM\'s default 600K/min per project. Options: request a quota increase well in advance (Firebase asks for at least 15 days for events), spread the campaign over a longer window, or use topic or multicast sends where the targeting allows it.</p>', lvl: 'deep' },
    { q: 'What happens to a notification that is no longer relevant?', a: '<p>Give every category a <b>TTL</b>: an OTP after 5 minutes or a "driver arriving" after the trip started is harmful. Set provider expiry (<code>apns-expiration</code>, FCM <code>ttl</code>) and drop expired messages before sending. Uber\'s RAMEN retries until TTL; Netflix RENO filters stale events.</p>', lvl: 'deep' },
    { q: 'Kafka or SQS for the queues?', a: '<p><b>Kafka</b> gives high throughput, replay and partition ordering, but retries and delays need extra retry topics. <b>SQS</b> has per-message visibility timeouts, delay queues and DLQs built in. Many systems use Kafka for ingestion and fan-out, and SQS-style queues per channel.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring: SMS sender + Resilience4j', lang: 'java',
      code: `// resilience4j-spring-boot3; application.yml configures the "sms" instances:
// resilience4j.retry.instances.sms: max-attempts 5, wait-duration 500ms,
//   enable-exponential-backoff true, enable-randomized-wait true,
//   retry-exceptions: org.springframework.web.client.HttpClientErrorException$TooManyRequests
// resilience4j.ratelimiter.instances.sms: limit-for-period 50, limit-refresh-period 1s
@Service
public class SmsSender {
  private final RestClient client;
  private final DeadLetters dlq;

  public SmsSender(RestClient.Builder b, DeadLetters dlq) {
    this.client = b.baseUrl("https://sms.example.com").build();
    this.dlq = dlq;
  }

  @RateLimiter(name = "sms")
  @Retry(name = "sms", fallbackMethod = "toDlq")
  public void send(SmsJob job) {
    client.post().uri("/v1/messages")
        .header("Idempotency-Key", job.idempotencyKey())
        .body(Map.of("to", job.phone(), "text", job.text()))
        .retrieve()
        .toBodilessEntity();              // 429 -> TooManyRequests -> retried
  }

  private void toDlq(SmsJob job, Throwable t) {
    dlq.publish(job, t.getMessage());     // after the last attempt
  }
}`,
      note: 'Annotation order matters: with default aspect order, Retry wraps the RateLimiter, so every retry also waits for a permit.'
    },
    {
      title: 'Kafka: one topic per lane', lang: 'java',
      code: `@Component
public class Lanes {
  private final SmsSender sms;
  public Lanes(SmsSender sms) { this.sms = sms; }

  // transactional lane: many consumers, never shares a backlog
  @KafkaListener(topics = "notify.sms.txn", groupId = "sms-txn", concurrency = "12")
  public void txn(SmsJob job) { if (!job.expired()) sms.send(job); }

  // promotional lane: fewer consumers, so it can only use part of the quota
  @KafkaListener(topics = "notify.sms.promo", groupId = "sms-promo", concurrency = "2")
  public void promo(SmsJob job) { if (!job.expired()) sms.send(job); }
}`
    },
    {
      title: 'Python: full-jitter backoff', lang: 'python',
      code: `import random, time

def send_with_backoff(send, msg, base=0.5, cap=30.0, attempts=6, ttl_s=300):
    start = time.monotonic()
    for n in range(attempts):
        status, retry_after = send(msg)
        if status < 400:
            return True
        if status not in (429, 500, 502, 503, 504):
            return False                       # permanent: bad token, bad number
        delay = random.uniform(0, min(cap, base * 2 ** n))   # full jitter
        if retry_after:
            delay = max(delay, retry_after)
        if time.monotonic() - start + delay > ttl_s:
            break                              # too stale to be useful
        time.sleep(delay)
    return False                               # caller sends to the DLQ`
    }
  ],

  related: ['newsfeed', 'chat', 'rate-limiter', 'message-queue', 'job-scheduler', 'ride-sharing']
});
