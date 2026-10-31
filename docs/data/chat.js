SD.register({
  slug: 'chat',
  domain: 2,
  title: 'Real-Time Chat & Messaging',
  examples: 'WhatsApp, Discord, Slack',
  tagline: 'Keep <b>millions of sockets</b> open, deliver every message <b>once, in order</b>, to every device of every member, and catch up anyone who was offline.',
  tldr: {
    problem: 'Messages must arrive in well under a second, in the same order for everyone, with nothing lost or shown twice, even though phones drop off networks all the time.',
    idea: 'Long-lived <b>WebSocket gateways</b> hold connections. A <b>session registry</b> maps user → gateway. Each conversation has one owner that assigns a <b>sequence number</b>, persists to a store partitioned by <code>(channel, time bucket)</code>, then fans out.',
    insight: 'Delivery is <b>at-least-once</b>; the client makes it look exactly-once by deduplicating on a <code>client_msg_id</code> and ordering by server sequence. Offline users are not a special path: they just <b>sync from their last cursor</b>.',
    numbers: [
      { v: '2M+', l: 'TCP connections on one server (WhatsApp blog, 2012)' },
      { v: '177 → 72', l: 'nodes: Discord\'s largest Cassandra cluster vs ScyllaDB (2022–23)' },
      { v: '~16M', l: 'channels served per Slack channel-server host at peak (2023)' }
    ]
  },
  intro: {
    what: 'A chat system delivers short messages between people <b>in real time</b>: one-to-one, in groups, or in big channels. It keeps a connection open to every online phone and browser so new messages show up instantly. It also stores every message, so anyone who was offline can <b>catch up later</b>, in the right order, on any of their devices.',
    analogy: {
      icon: '🛎️',
      title: 'A hotel front desk with a logbook and room phones',
      text: 'When a message arrives for a guest, the desk writes it in a logbook with the next number. If the guest is in their room, the desk rings the room phone and reads it out. If the guest is out, the message waits, and when they return they ask for "everything after number 41". The desk always knows which room each guest is in. Unlike a real desk, the system also has to cope with guests who hang up mid-sentence and ask for the same message twice.'
    },
    problem: 'Alice sends "running 5 min late" to a group of friends. One friend is on fast Wi-Fi, one is in a tunnel, and one has both a phone and a laptop. Each should see the message within a second, <b>exactly once</b>, and in the same order as every other message in the group. Phones lose their connection all the time, so sends and confirmations get lost and retried. The question is <b>"how do I get every message to every device of every member, fast and in order, without losing or duplicating any?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'Save messages in a database, apps ask for news',
        text: 'Alice\'s app sends the message to a server, which saves it in a database. Every few seconds, Bob\'s app <b>polls</b> the server: "anything new for me?" It is plain request and response, easy to build, and fine for a small team chat.',
        scene: {
          nodes: [
            { id: 'a', label: 'Alice', sub: 'sends', kind: 'client', at: [70, 0] },
            { id: 'chat', label: 'Chat server', sub: 'one box', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Messages DB', sub: 'all chats', kind: 'store', at: [210, 220] },
            { id: 'b', label: 'Bob', sub: 'asks every 5 s', kind: 'client', at: [350, 0] }
          ],
          edges: [{ from: 'a', to: 'chat' }, { from: 'chat', to: 'db' }, { from: 'b', to: 'chat' }],
          flow: ['a>chat', 'chat>db', 'b>chat']
        }
      },
      {
        stage: 'breaks',
        title: 'Polling floods the server; messages come late or twice',
        text: 'Millions of phones asking every few seconds means a flood of requests, and almost every answer is "nothing new". Each message still waits up to one poll interval. When Alice\'s confirmation is lost on a bad network, her app resends and the message is <b>stored twice</b>. Add more servers that each stamp messages with their own clock, and friends can see the same messages in different orders.',
        scene: {
          nodes: [
            { id: 'a', label: 'Alice', sub: 'resends', kind: 'client', at: [70, 0] },
            { id: 'chat', label: 'Chat server', sub: 'polled nonstop', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Messages DB', sub: 'duplicates', kind: 'store', at: [210, 220] },
            { id: 'b', label: 'Bobs ×1M', sub: 'ask every 5 s', kind: 'client', at: [350, 0] }
          ],
          edges: [{ from: 'a', to: 'chat' }, { from: 'chat', to: 'db' }, { from: 'b', to: 'chat' }],
          flow: [['a>chat', 'b>chat'], ['chat>db', 'b>chat'], ['a>chat', 'b>chat']],
          err: ['chat'],
          warn: ['db', 'b'],
          badges: { chat: ['overloaded', 'err'], b: ['late ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Open connections, one owner per chat, catch up by number',
        text: 'Each device keeps one <b>WebSocket</b> (a connection that stays open both ways) to a <b>gateway</b> server. A registry records which gateway each user is on. One chat service <b>owns each conversation</b>: it gives every message the next <b>sequence number</b>, saves it, then pushes it to the right gateways. Each message carries an id made on the phone, so a resend is spotted and dropped. A device that was offline asks for everything after the last number it saw.',
        scene: {
          nodes: [
            { id: 'a', label: 'Alice', sub: 'msg id c42', kind: 'client', at: [70, 0] },
            { id: 'b', label: 'Bob', sub: 'after #1080', kind: 'client', at: [350, 0] },
            { id: 'gw1', label: 'Gateway A', sub: 'WebSocket', kind: 'edge', at: [70, 110] },
            { id: 'db', label: 'Message store', sub: 'per chat, in order', kind: 'store', at: [210, 110] },
            { id: 'gw2', label: 'Gateway B', sub: 'WebSocket', kind: 'edge', at: [350, 110] },
            { id: 'chat', label: 'Chat service', sub: 'owner · seq #', kind: 'service', at: [210, 220] }
          ],
          edges: [{ from: 'a', to: 'gw1' }, { from: 'gw1', to: 'chat' }, { from: 'chat', to: 'db' }, { from: 'chat', to: 'gw2' }, { from: 'gw2', to: 'b' }],
          flow: ['a>gw1', 'gw1>chat', 'chat>db', 'chat>gw2', 'gw2>b'],
          ok: ['chat', 'db', 'b'],
          badges: { db: ['#1081 saved', 'ok'], b: ['✓✓', 'ok'] }
        }
      }
    ],
    usedBy: ['WhatsApp', 'Discord', 'Slack', 'Facebook Messenger', 'Telegram', 'In-app support chat'],
    whenToUse: [
      'People talk to each other and expect replies <b>within a second</b>',
      'Each conversation needs one stable order and a full history',
      'Users switch devices or go offline and must catch up <b>without gaps</b>'
    ],
    whenNot: [
      'One-way alerts such as "your order shipped": use a <a href="notifications.html">Notification Gateway</a>',
      'Posts broadcast to many followers with no conversation: see <a href="newsfeed.html">Newsfeed &amp; Timeline</a>',
      'Several people editing the same document at once: see <a href="collab-editing.html">Collaborative Editing</a>'
    ],
    glossary: [
      { term: 'WebSocket', def: 'A network connection that stays open, so the server can push messages to the app the moment they arrive.' },
      { term: 'Gateway', def: 'A server whose only job is to hold many open device connections and pass messages in and out.' },
      { term: 'Session registry', def: 'A fast lookup table of which gateway each user\'s device is connected to right now; it also tells who is online.' },
      { term: 'Sequence number', def: 'The position of a message within its conversation, assigned by the server so every member sees the same order.' },
      { term: 'Client message id', def: 'A unique id the phone creates once per message, so the server can recognise a resend and not store it twice.' },
      { term: 'At-least-once delivery', def: 'The system resends until it gets a confirmation, so a message may arrive twice but is never lost.' },
      { term: 'Sync cursor', def: 'The last sequence number a device has received; on reconnect it asks for everything after it.' },
      { term: 'Fan-out', def: 'Copying one message out to every member, or every gateway, that needs to receive it.' }
    ]
  },

  requirements: {
    functional: [
      '1:1 and group conversations',
      'Sent ✓, delivered ✓✓ and read receipts',
      'Offline users get a push and catch up on reconnect',
      'History, paging and multi-device sync',
      'Presence (online / last seen) and typing indicators',
      'Large channels / communities with many readers'
    ],
    nonFunctional: [
      'Send → deliver p99 ≲ 300 ms when both online (<em>estimate</em>)',
      'Per-conversation total order',
      'No message loss: durable before the sender\'s ✓',
      'No duplicates shown despite retries',
      'Millions of concurrent connections',
      'Survive gateway and node failures without user action'
    ],
    outOfScope: ['Voice / video calls', 'Media transcoding (see Video Streaming)', 'Spam and abuse ML', 'E2E key verification UX']
  },

  calculator: {
    inputs: [
      { id: 'dau', label: 'Daily active users', min: 1000000, max: 2000000000, value: 200000000, log: true },
      { id: 'msgs', label: 'Messages sent per user per day', min: 1, max: 200, value: 40, log: true },
      { id: 'bytes', label: 'Stored bytes per message (body + metadata)', min: 50, max: 2000, step: 50, value: 250, fmt: 'bytes' },
      { id: 'online', label: 'Share of DAU online at peak', min: 5, max: 60, value: 20, unit: '%' },
      { id: 'conn', label: 'Connections per gateway server', min: 10000, max: 2000000, value: 250000, log: true },
      { id: 'peak', label: 'Peak-to-average ratio', min: 1, max: 6, step: 0.5, value: 3, unit: '×' }
    ],
    outputs: [
      { label: 'Messages / second (average)', f: (v) => v.dau * v.msgs / 86400 },
      { label: 'Messages / second (peak)', f: (v) => v.dau * v.msgs / 86400 * v.peak },
      { label: 'Concurrent connections at peak', f: (v) => v.dau * v.online / 100 },
      { label: 'Gateway servers (+25% headroom)', f: (v) => Math.ceil(v.dau * v.online / 100 / v.conn * 1.25) },
      { label: 'New storage per day (RF = 3)', fmt: 'bytes', f: (v) => v.dau * v.msgs * v.bytes * 3 },
      { label: 'Storage per year (RF = 3)', fmt: 'bytes', f: (v) => v.dau * v.msgs * v.bytes * 3 * 365 }
    ],
    note: 'Inputs are <em>estimates</em>. WhatsApp published <b>over 2M TCP connections on one FreeBSD box</b> in 2012, but that took heavy kernel and Erlang VM tuning; a few hundred thousand per server is a more typical planning number. Storage, not connections, is what grows forever.'
  },

  api: [
    { m: 'WS', p: 'client ⇄ /v1/connect', d: 'One socket per device. Frames: <code>send{client_msg_id, conv_id, body}</code>, <code>ack{client_msg_id, seq}</code>, <code>msg{conv_id, seq, …}</code>, <code>receipt</code>, <code>presence</code>, heartbeats.' },
    { m: 'POST', p: '/v1/conversations/{id}/messages', d: 'HTTP fallback for send. Idempotent on <code>client_msg_id</code>: a retry returns the same <code>seq</code>.' },
    { m: 'GET', p: '/v1/sync?cursor=…', d: 'Per-device catch-up after reconnect: everything after the device\'s last acknowledged position, per conversation.' },
    { m: 'GET', p: '/v1/conversations/{id}/messages?before&limit', d: 'History paging, newest first, served from the time-bucketed partition.' },
    { m: 'POST', p: '/v1/receipts', d: '<code>{conv_id, up_to_seq, kind: delivered|read}</code>. One receipt covers everything up to a sequence number.' }
  ],
  dataModel: [
    { name: 'messages', store: 'ScyllaDB / Cassandra', fields: [['(channel_id, bucket)', 'partition key', 'pk'], ['message_id', 'Snowflake int64', 'sk'], ['author_id', 'int64'], ['client_msg_id', 'uuid'], ['body', 'text / ciphertext']], note: 'Discord\'s key: a bucket is a fixed time window, so one busy channel never grows one giant partition.' },
    { name: 'read_states', store: 'ScyllaDB (per user)', fields: [['user_id', 'int64', 'pk'], ['channel_id', 'int64', 'sk'], ['last_delivered_id', 'int64'], ['last_read_id', 'int64']], note: 'The cursor a device syncs from; drives ✓✓ and unread badges.' },
    { name: 'sessions', store: 'Redis (TTL)', fields: [['user_id', 'int64', 'pk'], ['device_id', 'text', 'sk'], ['gateway_node', 'text'], ['last_heartbeat', 'ts']], note: 'Expires if heartbeats stop: that is the presence signal.' }
  ],

  architecture: {
    title: 'Chat architecture',
    nodes: [
      { id: 'a', label: 'Alice', sub: 'sender device', kind: 'client', wide: [90, 110], tall: [70, 0], tip: 'Keeps one WebSocket open. Generates a client_msg_id for every message so retries are safe.' },
      { id: 'b', label: 'Bob', sub: 'recipient device', kind: 'client', wide: [90, 330], tall: [350, 0], tip: 'May be online (socket open), in the background, or offline. Acks every message it shows.' },
      { id: 'gw1', label: 'Gateway A', sub: 'WebSocket · Alice', kind: 'edge', wide: [280, 110], tall: [70, 105], tip: 'Stateful connection server. Holds sockets, heartbeats and per-socket send buffers. No business logic.' },
      { id: 'gw2', label: 'Gateway B', sub: 'WebSocket · Bob', kind: 'edge', wide: [280, 330], tall: [350, 105], tip: 'Another connection server. Messages for Bob must be routed to whichever gateway holds his socket.' },
      { id: 'reg', label: 'Session registry', sub: 'user → gateway · TTL', kind: 'cache', wide: [480, 0], tall: [70, 215], tip: 'Redis-style map of user/device → gateway node, refreshed by heartbeats. Also the source of presence.' },
      { id: 'chat', label: 'Chat service', sub: 'owner of a channel', kind: 'service', wide: [480, 220], tall: [210, 215], tip: 'Each conversation is owned by one node (consistent hashing on channel id, like Slack\'s channel servers). The owner assigns order, persists, then fans out.' },
      { id: 'ds', label: 'Data service', sub: 'request coalescing', kind: 'service', wide: [690, 220], tall: [210, 325], tip: 'Thin layer in front of the DB (Discord wrote theirs in Rust). Many identical reads for one hot channel become a single DB query.' },
      { id: 'db', label: 'Message store', sub: 'ScyllaDB · chan+bucket', kind: 'store', wide: [890, 220], tall: [350, 325], tip: 'Wide-column store, partition key (channel_id, time bucket), clustering by Snowflake message_id.' },
      { id: 'fan', label: 'Fan-out queue', sub: 'Kafka · per member', kind: 'queue', wide: [480, 330], tall: [350, 215], tip: 'Group messages are written once, then delivery jobs fan out to gateways and to push for offline members.' },
      { id: 'push', label: 'Push service', sub: 'offline members', kind: 'service', wide: [280, 440], tall: [210, 105], tip: 'Builds notifications for members with no live socket, with per-user rate limits and collapse keys.' },
      { id: 'apns', label: 'APNs / FCM', sub: 'OS push', kind: 'external', wide: [90, 440], tall: [210, 0], tip: 'Apple and Google push services wake the app. They carry a hint, not the message history.' }
    ],
    edges: [
      { from: 'a', to: 'gw1', bidi: true },
      { from: 'b', to: 'gw2', bidi: true },
      { from: 'gw1', to: 'chat' },
      { from: 'gw1', to: 'reg' },
      { from: 'chat', to: 'reg' },
      { from: 'chat', to: 'ds' },
      { from: 'ds', to: 'db' },
      { from: 'chat', to: 'gw2' },
      { from: 'chat', to: 'fan' },
      { from: 'fan', to: 'gw2' },
      { from: 'fan', to: 'push' },
      { from: 'push', to: 'apns' },
      { from: 'apns', to: 'b', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'one', title: '1:1 send → ✓ → ✓✓', tone: 'ok',
      steps: [
        { text: 'Alice sends <code>{client_msg_id: c42, body}</code> over her open socket. Gateway A forwards it to the chat node that <b>owns this conversation</b>.', flow: ['a>gw1', 'gw1>chat'] },
        { text: 'The owner assigns the next <b>sequence number</b> (and a Snowflake id) and persists it. Only after the write is durable does Alice get <b>✓ sent</b>.', flow: ['chat>ds', 'ds>db', 'chat>gw1', 'gw1>a'], badges: { db: 'seq 1081', a: ['✓', 'ok'] } },
        { text: 'The owner looks up Bob in the <b>session registry</b>: he is connected to Gateway B.', flow: ['chat>reg'], badges: { reg: 'bob → B' } },
        { text: 'The message is pushed to Gateway B and down Bob\'s socket. Bob\'s app shows it and sends <b>ack(seq 1081)</b>.', flow: ['chat>gw2', 'gw2>b', 'b>gw2', 'gw2>chat'], badges: { b: 'ack 1081' } },
        { text: 'The delivered cursor moves to 1081 and Alice sees <b>✓✓</b>. A read receipt later does the same with <code>last_read</code>.', flow: ['chat>gw1', 'gw1>a'], badges: { a: ['✓✓', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'offline', title: 'Recipient offline → push → sync', tone: 'warn',
      steps: [
        { text: 'Alice sends; the message is persisted and acked ✓ exactly as before. Durability never depends on Bob being online.', flow: ['a>gw1', 'gw1>chat', 'chat>ds', 'ds>db'], badges: { a: '✓' } },
        { text: 'The registry has <b>no live session</b> for Bob: his phone is on a train.', flow: ['chat>reg'], warn: ['b'], badges: { reg: ['bob: none', 'warn'] }, tone: 'warn' },
        { text: 'A delivery job goes to the <b>push service</b>, which asks APNs/FCM to wake Bob\'s app. The push is a hint; it is not the source of truth.', flow: ['chat>fan', 'fan>push', 'push>apns', 'apns>b'], badges: { apns: 'notify' } },
        { text: 'Bob reconnects, possibly to a different gateway, and calls <b>sync from his last cursor</b>. Everything after it comes back in order from the store.', flow: ['b>gw2', 'gw2>chat', 'chat>ds', 'ds>db'], badges: { ds: 'after 1080' } },
        { text: 'Bob acks, his cursor advances, and Alice\'s message flips to ✓✓. Same code path as a reconnect after any network blip.', flow: ['chat>gw1', 'gw1>a'], badges: { a: ['✓✓', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'group', title: 'Big channel: fan-out + hot reads', tone: 'warn',
      steps: [
        { text: 'An announcement lands in a channel with <b>100,000 members</b>. It is still <b>written once</b> to the channel\'s partition, never copied 100,000 times.', flow: ['a>gw1', 'gw1>chat', 'chat>ds', 'ds>db'], badges: { db: '1 write' } },
        { text: 'Fan-out goes to <b>gateways, not users</b>: each gateway that has subscribers for this channel gets one copy and writes it to its local sockets.', flow: ['chat>fan', 'fan>gw2', 'gw2>b'], badges: { fan: '~ #gateways' }, warn: ['fan'] },
        { text: 'Offline members get nothing pushed per message. They see an unread badge and <b>pull</b> history when they open the channel.', nodes: ['push'], labels: { push: { sub: 'mentions only' } } },
        { text: 'Thousands of clients open the channel at once and ask for the same latest page. The <b>data service coalesces</b> identical reads into one DB query.', flow: ['gw2>chat', 'chat>ds', 'ds>db'], badges: { ds: ['5,000 → 1 query', 'ok'] }, tone: 'ok' },
        { text: 'If one channel is still too hot, its partition is the limit: buckets bound partition <b>size</b>, but reads of the newest bucket all hit the same replicas. Cache the latest page.', nodes: ['db'], warn: ['db'], badges: { db: ['hot partition', 'warn'] }, tone: 'warn' }
      ]
    },
    {
      id: 'crash', title: 'Gateway crashes', tone: 'err',
      steps: [
        { text: 'Gateway B dies. Every socket it held, Bob\'s included, drops at the same moment.', nodes: ['gw2'], err: ['gw2'], badges: { gw2: ['down', 'err'] }, tone: 'err' },
        { text: 'Heartbeats stop, so Bob\'s registry entry <b>expires</b> (TTL). Messages sent meanwhile are persisted and queued for push; nothing is lost.', flow: ['chat>ds', 'ds>db', 'chat>reg'], badges: { reg: ['bob expired', 'warn'] }, tone: 'warn' },
        { text: 'All clients reconnect at once. <b>Exponential backoff with jitter</b> spreads the reconnect storm; Slack serves boot data from an edge cache (Flannel) so it does not hammer the backend.', flow: ['b>gw2'], labels: { gw2: { label: 'Gateway C', sub: 'replacement' } }, warn: ['gw2'] },
        { text: 'Bob resumes from his <b>last acked sequence</b>. Anything the old gateway sent but Bob never acked is simply resent; the client drops duplicates by id.', flow: ['gw2>chat', 'chat>ds', 'ds>db', 'chat>gw2', 'gw2>b'], labels: { gw2: { label: 'Gateway C', sub: 'replacement' } }, ok: ['gw2', 'b'], tone: 'ok' }
      ]
    },
    {
      id: 'retry', title: 'Lost ack → retry → no duplicate', tone: 'info',
      steps: [
        { text: 'Alice\'s message reaches the server and is persisted, but the ✓ ack is lost when her network switches from Wi-Fi to 4G.', flow: ['a>gw1', 'gw1>chat', 'chat>ds', 'ds>db'], err: ['a'], badges: { a: ['no ✓', 'err'] } },
        { text: 'Her app retries with the <b>same</b> <code>client_msg_id = c42</code>. That is the whole trick: the id is created once, on the device, before the first attempt.', flow: ['a>gw1', 'gw1>chat'], badges: { chat: 'c42 again' } },
        { text: 'The owner finds c42 already stored (unique key or a short-lived dedup cache) and returns the <b>original seq</b>. No second row, no second fan-out.', nodes: ['chat', 'db'], ok: ['chat'], badges: { chat: ['dup → seq 1081', 'ok'] } },
        { text: 'If a duplicate does slip through to a recipient (say, resent after a gateway crash), the client ignores any seq it has already shown. <b>At-least-once + idempotent apply = exactly-once display.</b>', flow: ['chat>gw1', 'gw1>a'], badges: { a: ['✓', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Change group size, delivery model, storage, presence and encryption. The numbers assume 50M users online and are illustrative.',
    controls: [
      { id: 'group', label: 'Group size', type: 'seg', value: '100', options: [
        { v: '2', l: '1:1' }, { v: '100', l: '100 members' }, { v: '100k', l: '100,000 members' }] },
      { id: 'delivery', label: 'Delivery model', type: 'seg', value: 'push', options: [
        { v: 'push', l: 'Push to socket' }, { v: 'pull', l: 'Pull / poll every 5 s' }] },
      { id: 'store', label: 'Message store', type: 'seg', value: 'scylla', options: [
        { v: 'cassandra', l: 'Cassandra' }, { v: 'scylla', l: 'ScyllaDB' }, { v: 'pg', l: 'Sharded Postgres' }] },
      { id: 'hb', label: 'Presence heartbeat', type: 'range', min: 5, max: 120, step: 5, value: 30, unit: 's' },
      { id: 'e2e', label: 'End-to-end encryption', type: 'seg', value: 'off', options: [
        { v: 'off', l: 'Off (server can read)' }, { v: 'on', l: 'On (server sees ciphertext)' }] }
    ],
    evaluate(s) {
      const online = 50e6;
      const n = { '2': 2, '100': 100, '100k': 100000 }[s.group];
      const onlineFrac = s.group === '100k' ? 0.05 : 0.3;
      const recipients = Math.max(1, Math.round((n - 1) * onlineFrac));
      const devices = 1.6; // devices per user (estimate)
      const perDeviceCipher = s.e2e === 'on' && s.group !== '100k';
      const fanout = s.delivery === 'push' ? (s.group === '100k' ? Math.ceil(recipients / 2000) + ' gateway copies' : Math.round(recipients * devices) + ' socket writes') : '0 (clients poll)';
      const lat = s.delivery === 'push' ? 0.15 : 2.6;
      const pollQps = s.delivery === 'pull' ? online / 5 : 0;
      const hbQps = online / s.hb;
      const store = {
        cassandra: { v: 'p99 tens–100s ms under GC / compaction', s: 0.5, ops: 'JVM tuning, many nodes' },
        scylla: { v: 'low, steady p99 (shard-per-core, no GC)', s: 0.85, ops: 'fewer, bigger nodes' },
        pg: { v: 'fast until a shard fills; resharding is manual', s: 0.55, ops: 'familiar, but you own sharding' }
      }[s.store];
      const metrics = [
        { k: 'Deliver latency (both online)', v: s.delivery === 'push' ? '≈ 100–300 ms' : '≈ 2.5 s average (half the poll)', s: lat < 1 ? 0.9 : 0.3 },
        { k: 'Work per message', v: '1 durable write + ' + fanout, s: s.delivery === 'pull' ? 0.7 : s.group === '100k' ? 0.6 : s.group === '100' ? 0.75 : 0.95 },
        { k: 'Idle load', v: s.delivery === 'pull' ? SD.fmt.num(pollQps) + ' polls/s (mostly empty)' : 'heartbeats only', s: s.delivery === 'pull' ? 0.15 : 0.85 },
        { k: 'Store tail latency', v: store.v, s: store.s, hint: store.ops },
        { k: 'Presence accuracy', v: 'offline detected in ≈ ' + (2 * s.hb) + ' s', s: s.hb <= 30 ? 0.85 : s.hb <= 60 ? 0.6 : 0.3 },
        { k: 'Presence load', v: SD.fmt.num(hbQps) + ' heartbeats/s', s: hbQps > 5e6 ? 0.25 : hbQps > 1.5e6 ? 0.55 : 0.85 },
        { k: 'Server-side features', v: s.e2e === 'on' ? 'no search, moderation or previews on server' : 'search, moderation, link previews', s: s.e2e === 'on' ? 0.45 : 0.9, hint: s.e2e === 'on' ? 'privacy ↑' : 'privacy ↓' }
      ];
      const notes = [];
      if (s.group === '100k') notes.push('Large channels: persist once, fan out to <b>gateways</b> that have subscribers, and let offline members <b>pull</b>. Per-member pushes for every message would be 100K writes per post.');
      if (s.group === '100') notes.push('Small groups: the owner pushes to each online member\'s gateway; ✓✓ in a group means <b>every</b> member\'s delivered cursor passed this seq.');
      if (s.delivery === 'pull') notes.push('Polling is simple and stateless, but 50M clients polling every 5 s is ~10M requests/s that mostly return nothing.');
      if (s.store === 'scylla') notes.push('Discord moved trillions of messages from Cassandra to ScyllaDB in 2022–23 and shrank its largest cluster from 177 to 72 nodes.');
      if (s.store === 'cassandra') notes.push('Cassandra fits the access pattern well; Discord\'s pain was hot partitions plus GC pauses and compaction backlogs at very large scale.');
      if (s.store === 'pg') notes.push('Postgres works for chat if you shard by conversation id early. Use <code>(conv_id, seq)</code> as the key and partition tables by time.');
      if (s.hb <= 10) notes.push('Very short heartbeats drain phone batteries and multiply load. Many apps send presence only while in the foreground.');
      if (perDeviceCipher) notes.push('With E2E each message is encrypted for each recipient <b>device</b> (or with a shared sender key), so the server only routes ciphertext and cannot index it.');
      if (s.e2e === 'on' && s.group === '100k') notes.push('E2E for 100K members means key distribution to every device and no server-side moderation; large public communities usually choose server-readable messages instead.');
      let verdict;
      if (s.delivery === 'pull' && s.group !== '100k') verdict = '❌ <b>Polling makes chat feel slow and wastes millions of requests/s.</b> Use persistent sockets with push; keep pull for history and catch-up.';
      else if (s.group === '100k' && s.e2e === 'on') verdict = '⚠ <b>E2E across 100K members is expensive and blocks moderation.</b> Typical for private groups, not for public communities.';
      else if (s.hb >= 90) verdict = '⚠ <b>Presence is stale.</b> Users look online for minutes after leaving. Shorten the heartbeat or mark idle on app background.';
      else if (s.delivery === 'pull' && s.group === '100k') verdict = '👍 <b>Reasonable for huge channels:</b> readers pull pages when they look. Still keep a socket for mentions and DMs.';
      else if (s.store === 'scylla' && s.delivery === 'push') verdict = '✅ <b>Close to what Discord describes:</b> socket gateways, (channel, bucket) partitions in ScyllaDB, and a data service that coalesces hot reads.';
      else verdict = '👍 Solid design. Check the store and presence meters for the trade-off you are making.';
      const labels = {
        db: { label: 'Message store', sub: { cassandra: 'Cassandra · chan+bucket', scylla: 'ScyllaDB · chan+bucket', pg: 'Postgres · conv+seq' }[s.store] },
        fan: { label: 'Fan-out queue', sub: s.group === '100k' ? 'per gateway, not member' : s.group === '2' ? 'single recipient' : 'per member device' },
        reg: { label: 'Session registry', sub: 'heartbeat ' + s.hb + ' s · TTL ' + (2 * s.hb) + ' s' }
      };
      if (s.e2e === 'on') labels.a = { label: 'Alice', sub: 'encrypts per device' };
      const flow = s.delivery === 'push'
        ? ['a>gw1', 'gw1>chat', 'chat>ds', 'ds>db'].concat(s.group === '2' ? ['chat>reg', 'chat>gw2', 'gw2>b'] : ['chat>fan', 'fan>gw2', 'gw2>b'])
        : ['a>gw1', 'gw1>chat', 'chat>ds', 'ds>db', 'b>gw2', 'gw2>chat', 'chat>ds'];
      return {
        metrics, verdict, notes, labels, flow,
        hot: s.group === '100k' ? ['fan', 'ds'] : [],
        warn: (s.store === 'cassandra' ? ['db'] : []).concat(s.hb >= 90 || hbQps > 5e6 ? ['reg'] : []),
        err: s.delivery === 'pull' && s.group !== '100k' ? ['gw2'] : [],
        badges: { fan: [s.delivery === 'push' ? fanout.split(' ')[0] + '×' : 'pull', s.group === '100k' ? 'warn' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Ordering, ticks and dedup in a group of four',
    caption: 'Alice sends to a group. The server assigns a <b>sequence number</b>; each recipient\'s app shows messages <b>only in sequence order</b>, holding any that arrive early (amber). Turn on jitter to see reordering, take members offline, and lose acks to watch retries get deduplicated.'
  },

  realWorld: {
    intro: 'Three companies, three published angles: connections per box (WhatsApp), message storage (Discord), and edge caching plus channel routing (Slack).',
    timeline: [
      { when: 'Oct 2011', who: 'WhatsApp', title: 'One billion messages in a day', text: 'WhatsApp\'s blog put the milestone in perspective: about <b>11,574 messages per second</b> averaged over the day.', src: 0 },
      { when: '2012', who: 'WhatsApp', title: '"1 million is so 2011"', text: 'A few months after reporting 1M TCP connections on one server, WhatsApp showed a box holding <b>over 2 million</b>. A 2015 FreeBSD Foundation testimonial says they ran <b>2–3 million</b> concurrent connections per FreeBSD server.', src: 1 },
      { when: '2017', who: 'Discord', title: 'MongoDB → Cassandra, (channel, bucket) keys', text: 'Discord moved messages to Cassandra on <b>12 nodes</b>. Primary key <code>((channel_id, bucket), message_id)</code>; buckets of about <b>10 days</b> keep the largest channels\' partitions under ~100 MB. Snowflake ids sort by time.', src: 2 },
      { when: '2017', who: 'Slack', title: 'Flannel edge cache', text: 'Slack put an application-level cache in its edge PoPs that serves boot data (users, channels) lazily and absorbs <b>reconnect storms</b>. At launch: <b>4M simultaneous connections</b> and <b>600K client queries/s</b> at peak.', src: 3 },
      { when: '2022–23', who: 'Discord', title: 'Trillions of messages → ScyllaDB', text: 'By early 2022 the Cassandra cluster had <b>177 nodes</b> and hot partitions. Discord added <b>Rust data services</b> that coalesce identical requests, then migrated to ScyllaDB; the largest cluster dropped to <b>72 nodes</b>.', src: 4 },
      { when: '2023', who: 'Slack', title: 'Channel servers and gateway servers', text: 'Stateful <b>channel servers</b> own channels by consistent hashing (about <b>16M channels per host</b> at peak). Stateful <b>gateway servers</b> hold user sockets and subscribe to the channel servers for that user\'s channels.', src: 6 }
    ],
    lessons: [
      '<span>Separate <b>connection holding</b> (gateways) from <b>message logic</b> (channel owners) so each scales on its own axis.</span>',
      '<span>Partition history by <b>(channel, time bucket)</b>; never let one channel become one unbounded partition.</span>',
      '<span>Put a coalescing or caching layer in front of the store for hot channels and reconnect storms.</span>',
      '<span>Design for <b>reconnect</b> as the normal case: cursors, idempotent ids, backoff with jitter.</span>',
    ],
    sources: [
      { title: 'One billion messages', url: 'https://blog.whatsapp.com/one-billion-messages', pub: 'WhatsApp blog, 2011' },
      { title: '1 million is so 2011', url: 'https://blog.whatsapp.com/1-million-is-so-2011', pub: 'WhatsApp blog, 2012' },
      { title: 'How Discord Stores Billions of Messages', url: 'https://discord.com/blog/how-discord-stores-billions-of-messages', pub: 'Discord, 2017' },
      { title: 'Flannel: An Application-Level Edge Cache to Make Slack Scale', url: 'https://slack.engineering/flannel-an-application-level-edge-cache-to-make-slack-scale', pub: 'Slack Engineering, 2017' },
      { title: 'How Discord Stores Trillions of Messages', url: 'https://discord.com/blog/how-discord-stores-trillions-of-messages', pub: 'Discord, 2023' },
      { title: 'Discord migrates from Cassandra to ScyllaDB', url: 'https://www.infoq.com/news/2023/06/discord-cassandra-scylladb/', pub: 'InfoQ, 2023' },
      { title: 'Real-time Messaging', url: 'https://slack.engineering/real-time-messaging/', pub: 'Slack Engineering, 2023' },
      { title: 'WhatsApp testimonial', url: 'https://freebsdfoundation.org/testimonial/whatsapp/', pub: 'FreeBSD Foundation, 2015' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Transport', '<b>WebSocket</b>: bidirectional, low overhead per message', '<b>Long-poll / SSE</b>: plain HTTP, easier through proxies', 'WebSocket for chat; long-poll as a fallback on hostile networks'],
      ['Group delivery', '<b>Fan-out on write</b>: push to every member\'s inbox/socket', '<b>Fan-out on read</b>: store once, members pull', 'Push for small groups and DMs; pull (plus gateway fan-out) for huge channels'],
      ['Ordering id', '<b>Per-channel sequence</b>: gap detection, needs one owner', '<b>Snowflake id</b>: no coordination, time-sortable', 'Sequence when clients must detect gaps; Snowflake for history keys (or both)'],
      ['Message store', '<b>Wide-column</b> (Cassandra / ScyllaDB)', '<b>Sharded SQL</b> (Postgres / MySQL)', 'Wide-column for huge append-heavy history; SQL when you need transactions and are below a few TB per shard'],
      ['Encryption', '<b>E2E</b>: server sees ciphertext', '<b>TLS + at rest</b>: server can read', 'E2E for private messaging; server-readable for searchable, moderated workspaces and communities']
    ]
  },
  failures: [
    { f: 'Gateway crash', detect: 'Health checks; heartbeat timeouts', fix: 'Clients reconnect with jittered backoff to another gateway and resume from the last acked cursor.' },
    { f: 'Reconnect storm after an outage', detect: 'Connect rate and boot-API QPS spikes', fix: 'Jitter, server-advertised retry-after, edge-cached boot data (Slack Flannel), admission control.' },
    { f: 'Duplicate messages', detect: 'Same client_msg_id stored twice', fix: 'Unique key on (conv, client_msg_id) or dedup cache; client ignores already-shown seqs.' },
    { f: 'Out-of-order display', detect: 'Client sees a seq gap', fix: 'Buffer until the gap fills; after a timeout, fetch the missing range from the store.' },
    { f: 'Hot channel partition', detect: 'Per-partition latency, coordinator hot spots', fix: 'Time buckets, request coalescing, cache the latest page, rate-limit history scans.' },
    { f: 'Stale presence', detect: 'Users shown online long after leaving', fix: 'TTL tied to heartbeat; explicit offline on clean disconnect; background ⇒ away.' },
    { f: 'Push provider throttling', detect: 'APNs/FCM error codes, latency', fix: 'Collapse keys, per-user rate limits, retry with backoff; the message is safe in the store anyway.' }
  ],

  interview: [
    { q: 'How do you guarantee message ordering?', a: '<p>Total order is only needed <b>per conversation</b>. Route every message of a conversation to <b>one owner</b> (consistent hashing on channel id), which assigns a monotonically increasing <code>seq</code> before persisting. Clients display in <code>seq</code> order and buffer early arrivals.</p><p>Timestamps from devices cannot be trusted for order: clocks skew.</p>', fu: 'What if the owner node fails? (Ownership moves; the new owner reads the last seq from the store before accepting writes.)', lvl: 'core' },
    { q: 'How do you get exactly-once display with at-least-once delivery?', a: '<ul><li>The device creates a <code>client_msg_id</code> <b>once</b>, before the first send, and reuses it on every retry.</li><li>The server dedups on <code>(conv_id, client_msg_id)</code> and returns the original <code>seq</code>.</li><li>Recipients ignore any <code>seq</code> they already showed.</li></ul><p>Exactly-once <i>delivery</i> over a lossy network is impossible; exactly-once <i>effect</i> is easy with idempotent apply.</p>', lvl: 'core' },
    { q: 'How does the server know where to send a message for Bob?', a: '<p>A <b>session registry</b> (Redis or similar) maps <code>user/device → gateway node</code>, written on connect and refreshed by heartbeats with a TTL. The message owner looks it up and forwards to that gateway (direct RPC or a per-node pub/sub topic). No entry means offline: persist and push.</p>', lvl: 'core' },
    { q: 'What happens when a recipient is offline?', a: '<p>Nothing special for durability: the message is already stored. A delivery job sends a <b>push notification</b> via APNs/FCM. When the app reconnects it calls <b>sync</b> with its last cursor and gets everything after it, in order.</p>', lvl: 'core' },
    { q: 'How do you handle a channel with 100,000 members?', a: '<p>Write the message <b>once</b>. Fan out to <b>gateways</b> that have subscribed sockets (Slack\'s gateways subscribe to channel servers), not to 100K per-user inboxes. Offline members get an unread count and pull history when they open the channel. Push notifications only for mentions. Coalesce and cache reads of the latest page.</p>', lvl: 'deep' },
    { q: 'Design the schema for message history.', a: '<p>Wide-column, partition key <code>(channel_id, bucket)</code>, clustering key <code>message_id DESC</code> where message_id is a time-sortable Snowflake and bucket is a fixed time window derived from it. Reads of "latest 50" hit one partition; older pages walk back bucket by bucket. This is Discord\'s published design.</p>', fu: 'Why not partition by channel_id alone? (One busy channel becomes an unbounded, hot partition.)', lvl: 'core' },
    { q: 'How does multi-device sync work?', a: '<p>Each <b>device</b> has its own session and its own cursor. All devices of a user receive the message (fan-out per device). Read state is per user: reading on the laptop moves <code>last_read</code>, which is pushed to the phone to clear its badge.</p>', lvl: 'core' },
    { q: 'How would you implement presence at scale?', a: '<p>Presence = "has a live session". Gateways refresh a TTL key per user on heartbeat (say every 30 s, TTL 60 s). Do <b>not</b> broadcast every change to every contact: publish presence only to users who are currently looking (open chat, visible contact list), and batch updates. For huge groups show approximate counts.</p>', lvl: 'deep' },
    { q: 'How do ✓ and ✓✓ work, especially in groups?', a: '<p>✓ = the server persisted it. ✓✓ = the recipient\'s device acked it. Receipts are <b>cumulative</b>: "delivered up to seq N" covers all earlier messages, so one small update replaces thousands. In a group, ✓✓ means every member\'s delivered cursor ≥ N.</p>', lvl: 'core' },
    { q: 'How many connections can one gateway hold, and what limits it?', a: '<p>Memory per socket (kernel buffers + app state), file descriptors, and CPU for TLS and heartbeats. WhatsApp reported over 2M on one tuned FreeBSD/Erlang box in 2012; a few hundred thousand is a safer plan. Keep gateways free of business logic so they can be dense and restart cheaply.</p>', lvl: 'deep' },
    { q: 'What does end-to-end encryption change in the design?', a: '<p>The server becomes a router of ciphertext. It can no longer search, moderate, generate link previews or show message text in pushes. Each message is encrypted per recipient device (or with a group sender key), so device lists and key distribution become part of the system. Ordering, dedup and receipts work the same, since they use metadata.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'CQL: Discord-style message table', lang: 'sql',
      code: `-- bucket = (snowflake_ms(message_id) - EPOCH) / (10 days in ms)
CREATE TABLE chat.messages (
  channel_id    bigint,
  bucket        int,
  message_id    bigint,          -- Snowflake: unique, time-sortable
  author_id     bigint,
  client_msg_id uuid,            -- for dedup of retries
  content       text,
  PRIMARY KEY ((channel_id, bucket), message_id)
) WITH CLUSTERING ORDER BY (message_id DESC);

-- latest page of a channel (newest bucket first, walk back if short)
SELECT message_id, author_id, content
FROM   chat.messages
WHERE  channel_id = ? AND bucket = ?
LIMIT  50;

-- older page: keyset pagination, never OFFSET
SELECT message_id, author_id, content
FROM   chat.messages
WHERE  channel_id = ? AND bucket = ? AND message_id < ?
LIMIT  50;

-- one row per (user, channel): drives ✓✓, unread counts and sync
CREATE TABLE chat.read_states (
  user_id bigint, channel_id bigint,
  last_delivered_id bigint, last_read_id bigint,
  PRIMARY KEY (user_id, channel_id)
);`
    },
    {
      title: 'Spring Boot: WebSocket gateway + Redis routing', lang: 'java',
      code: `@Component
public class ChatSocketHandler extends TextWebSocketHandler implements MessageListener {
  private final Map<String, WebSocketSession> local = new ConcurrentHashMap<>();
  private final String nodeId = UUID.randomUUID().toString();
  private final StringRedisTemplate redis;
  private final MessageStore store;          // persists, dedups on client_msg_id
  private final ObjectMapper json = new ObjectMapper();

  public ChatSocketHandler(StringRedisTemplate redis, MessageStore store,
                           RedisMessageListenerContainer container) {
    this.redis = redis; this.store = store;
    container.addMessageListener(this, ChannelTopic.of("node:" + nodeId));
  }

  @Override public void afterConnectionEstablished(WebSocketSession s) {
    String user = (String) s.getAttributes().get("userId");  // set at handshake
    // sendMessage is not thread-safe: wrap it
    local.put(user, new ConcurrentWebSocketSessionDecorator(s, 5_000, 512 * 1024));
    redis.opsForValue().set("session:" + user, nodeId, Duration.ofSeconds(60));
  }

  @Override protected void handleTextMessage(WebSocketSession s, TextMessage m) throws Exception {
    Envelope in = json.readValue(m.getPayload(), Envelope.class);
    Stored saved = store.persist(in);          // idempotent: retry returns same seq
    s.sendMessage(new TextMessage(json.writeValueAsString(Ack.of(saved))));
    for (String member : store.members(in.convId())) {
      String node = redis.opsForValue().get("session:" + member);
      if (node == null) { store.enqueuePush(member, saved); continue; }
      redis.convertAndSend("node:" + node, json.writeValueAsString(saved.to(member)));
    }
  }

  @Override public void onMessage(Message msg, byte[] pattern) {   // from Redis
    try {
      Delivery d = json.readValue(msg.getBody(), Delivery.class);
      WebSocketSession s = local.get(d.recipient());
      if (s != null && s.isOpen()) s.sendMessage(new TextMessage(json.writeValueAsString(d)));
    } catch (IOException e) { /* client will resync from its cursor */ }
  }

  @Override public void afterConnectionClosed(WebSocketSession s, CloseStatus st) {
    local.remove((String) s.getAttributes().get("userId"));
  }
}`,
      note: 'Heartbeats refresh the <code>session:</code> TTL. For production, route by consistent hashing to a channel owner first so per-conversation order is assigned in one place.'
    },
    {
      title: 'Python: client-side ordering + dedup', lang: 'python',
      code: `class ChannelView:
    """Show each message once, in server seq order, despite retries and jitter."""

    def __init__(self, last_seq: int = 0) -> None:
        self.next_seq = last_seq + 1          # cursor persisted on the device
        self.pending: dict[int, dict] = {}    # arrived early, waiting for a gap

    def on_message(self, msg: dict) -> list[dict]:
        seq = msg["seq"]
        if seq < self.next_seq or seq in self.pending:
            return []                         # duplicate (at-least-once): drop
        self.pending[seq] = msg
        shown = []
        while self.next_seq in self.pending:  # release the contiguous run
            shown.append(self.pending.pop(self.next_seq))
            self.next_seq += 1
        return shown                          # ack up to next_seq - 1

    def missing_range(self) -> tuple[int, int] | None:
        """Called on a timer; if stuck, fetch the gap from /sync."""
        if not self.pending:
            return None
        return self.next_seq, min(self.pending) - 1`
    }
  ],

  related: ['notifications', 'message-queue', 'kv-store', 'unique-id', 'newsfeed', 'collab-editing']
});
