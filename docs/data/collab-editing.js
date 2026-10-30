SD.register({
  slug: 'collab-editing',
  domain: 2,
  title: 'Collaborative Editing',
  examples: 'Google Docs, Figma',
  tagline: 'Let many people edit one document at once, see each other\'s cursors live, and <b>always end up with the same text</b>, even after someone edits offline on a plane.',
  tldr: {
    problem: 'Every keystroke is applied locally first, so the editor feels instant. Two people editing the same spot at the same time then hold different versions of the document. Without a merge rule, the copies drift apart for good.',
    idea: 'Send every editor of a document to <b>one session server</b> that puts operations in order and <b>transforms</b> concurrent ones (OT, as in Google Docs). Or use a <b>CRDT</b> (Yjs, Automerge), where operations commute and any order converges. Persist an <b>append-only op log</b> plus periodic <b>snapshots</b>.',
    insight: 'Choose the merge model from the data. Text needs OT or a sequence CRDT. Figma\'s objects-with-properties model only needs <b>last-writer-wins per property</b>, because its server decides the order.',
    numbers: [
      { v: '1 / doc', l: 'Figma runs each document in its own server process (Figma, 2019)' },
      { v: '95% < 600 ms', l: 'Figma edits saved durably after adding a journal (Figma blog)' },
      { v: '0.5 s vs 60 s', l: 'Figma journal vs checkpoint write cadence (Figma blog)' }
    ]
  },

  requirements: {
    functional: [
      'Real-time co-editing of rich text',
      'Live cursors, selections and avatars (presence)',
      'Offline edits that merge on reconnect',
      'Version history and restore',
      'Per-user undo that only undoes your own edits',
      'Comments and sharing permissions'
    ],
    nonFunctional: [
      'Local keystrokes apply instantly (optimistic)',
      'Remote edits visible within ~100–500 ms',
      'All replicas converge to the same document',
      'No acknowledged edit is ever lost',
      'Open a doc with a long history in under 1–2 s',
      'Millions of docs; tens to hundreds of editors on a hot doc'
    ],
    outOfScope: ['Spreadsheet formula engine', 'Full-text search across docs', 'Image and file storage (see Object Storage)', 'Fine-grained ACL design']
  },

  calculator: {
    inputs: [
      { id: 'docs', label: 'Docs open at peak', min: 10000, max: 10000000, value: 1000000, log: true },
      { id: 'eds', label: 'Editors per open doc', min: 1, max: 50, value: 3 },
      { id: 'ops', label: 'Ops per second per active editor', min: 0.5, max: 10, step: 0.5, value: 2 },
      { id: 'bytes', label: 'Bytes per op (with metadata)', min: 20, max: 500, step: 10, value: 80, fmt: 'bytes' },
      { id: 'pres', label: 'Presence updates per second per user', min: 1, max: 30, value: 10, unit: 'Hz' },
      { id: 'snap', label: 'Snapshot every N ops', min: 100, max: 20000, value: 1000, log: true }
    ],
    outputs: [
      { label: 'WebSocket connections', f: (v) => v.docs * v.eds },
      { label: 'Ops/s into session servers', f: (v) => v.docs * v.eds * v.ops },
      { label: 'Op fan-out messages/s', f: (v) => v.docs * v.eds * v.ops * (v.eds - 1) },
      { label: 'Presence fan-out messages/s', f: (v) => v.docs * v.eds * v.pres * (v.eds - 1) },
      { label: 'Op-log growth per hour', fmt: 'bytes', f: (v) => v.docs * v.eds * v.ops * v.bytes * 3600 },
      { label: 'Ops replayed on open (average)', f: (v) => v.snap / 2 }
    ],
    note: 'All inputs are <em>estimates</em>. Two things stand out. <b>Presence</b> (cursor moves) produces more messages than edits do, so throttle it and never write it to the log. The <b>snapshot interval</b> sets how many ops a cold open must replay.'
  },

  api: [
    { m: 'WS', p: '/v1/docs/{id}/session', d: 'Join a doc. The server sends a snapshot and its revision, then the client sends <code>{op, base_rev, client_id, seq}</code>. The server acks with the new rev and broadcasts the op, transformed if needed.' },
    { m: 'WS', p: '/v1/docs/{id}/presence', d: 'Cursor, selection and avatar. Ephemeral, throttled to ~10–20 Hz, sent through pub/sub, never persisted.' },
    { m: 'GET', p: '/v1/docs/{id}?rev=', d: 'Load a document at a revision (latest snapshot ≤ rev plus the ops after it). Used for opening and history.' },
    { m: 'POST', p: '/v1/docs/{id}/ops:batch', d: 'Upload ops queued while offline, with their <code>base_rev</code>. Idempotent on <code>(client_id, seq)</code>, so a retry never applies an op twice.' },
    { m: 'GET', p: '/v1/docs/{id}/ops?from=', d: 'Stream ops after a revision, for catching up after a reconnect or rendering history.' },
    { m: 'POST', p: '/v1/docs/{id}/versions', d: 'Name a version. It only stores a pointer to a revision, so it is cheap.' }
  ],
  dataModel: [
    { name: 'doc_ops', store: 'Postgres (partition by doc)', fields: [['doc_id', 'uuid', 'pk'], ['rev', 'bigint', 'pk'], ['client_id', 'uuid', 'idx'], ['seq', 'int', 'idx'], ['op', 'jsonb'], ['created_at', 'timestamptz']], note: 'The primary key on <code>(doc_id, rev)</code> also acts as a fence: two servers cannot both write rev 101.' },
    { name: 'doc_snapshots', store: 'Object store + index row', fields: [['doc_id', 'uuid', 'pk'], ['rev', 'bigint', 'sk'], ['blob_key', 'text'], ['bytes', 'int']], note: 'Written every N ops or minutes. Opening a doc = newest snapshot + ops after it.' },
    { name: 'doc_owner', store: 'Redis / etcd lease', fields: [['doc_id', 'uuid', 'pk'], ['server', 'host:port'], ['lease_ttl', '10 s']], note: 'Which session server owns the doc. Gateways route by it.' },
    { name: 'presence', store: 'Memory + pub/sub', fields: [['doc_id', 'uuid', 'pk'], ['user_id', 'uuid', 'sk'], ['cursor', 'rel. position'], ['ts', 'ms']], note: 'Lost on restart, and that is fine.' }
  ],

  architecture: {
    title: 'Collaborative editing architecture',
    nodes: [
      { id: 'ca', label: 'Client A', sub: 'local op buffer', kind: 'client', wide: [90, 60], tall: [105, 0], tip: 'Applies its own edits instantly, keeps unacknowledged ops, and transforms or merges incoming ones.' },
      { id: 'cb', label: 'Client B', sub: 'offline queue', kind: 'client', wide: [90, 280], tall: [315, 0], tip: 'Can keep editing offline. Queued ops are uploaded with their base revision when it reconnects.' },
      { id: 'gw', label: 'WS gateway', sub: 'sticky by doc_id', kind: 'edge', wide: [290, 170], tall: [210, 105], tip: 'Holds WebSockets and forwards each doc\'s traffic to the server that owns it.' },
      { id: 'route', label: 'Doc router', sub: 'doc → owner lease', kind: 'cache', wide: [290, 60], tall: [70, 105], tip: 'A lease in Redis or etcd says which session server owns each doc. Leases expire if the owner dies.' },
      { id: 'pres', label: 'Presence', sub: 'cursors · pub/sub', kind: 'cache', wide: [290, 280], tall: [350, 105], tip: 'Cursor and selection updates go here, not through the op log. Throttled and never persisted.' },
      { id: 'sess', label: 'Session server', sub: 'one owner per doc', kind: 'service', wide: [490, 170], tall: [105, 210], tip: 'Holds the doc in memory, orders every op, assigns revisions and transforms concurrent ops.' },
      { id: 'sess2', label: 'Standby server', sub: 'takes over on failover', kind: 'service', wide: [490, 0], tall: [315, 210], tip: 'Any server can become the owner once the old lease expires. It rebuilds state from snapshot + log.' },
      { id: 'log', label: 'Op log', sub: 'append-only · by rev', kind: 'store', wide: [690, 170], tall: [105, 315], tip: 'Every accepted op with its revision. The source of truth for history and recovery.' },
      { id: 'snap', label: 'Snapshotter', sub: 'every N ops', kind: 'compute', wide: [890, 170], tall: [210, 420], tip: 'Folds ops into a compact snapshot so opening a doc does not replay its whole history.' },
      { id: 'blob', label: 'Snapshot store', sub: 'S3 / object store', kind: 'store', wide: [890, 60], tall: [315, 315], tip: 'Snapshot blobs keyed by doc and revision.' },
      { id: 'feed', label: 'Change feed', sub: 'Kafka → search, notifs', kind: 'queue', wide: [690, 280], tall: [70, 420], tip: 'Downstream consumers (search indexing, mentions, notifications, exports) read committed ops asynchronously.' }
    ],
    edges: [
      { from: 'ca', to: 'gw', bidi: true },
      { from: 'cb', to: 'gw', bidi: true },
      { from: 'gw', to: 'route' },
      { from: 'gw', to: 'pres', bidi: true },
      { from: 'gw', to: 'sess', bidi: true },
      { from: 'gw', to: 'sess2', dashed: true },
      { from: 'sess', to: 'log' },
      { from: 'sess2', to: 'log', dashed: true },
      { from: 'sess', to: 'blob', label: 'load', bend: -0.12 },
      { from: 'sess2', to: 'blob', dashed: true },
      { from: 'log', to: 'snap' },
      { from: 'snap', to: 'blob' },
      { from: 'log', to: 'feed' }
    ]
  },

  scenarios: [
    {
      id: 'concurrent', title: 'Two users type at the same spot', tone: 'ok',
      steps: [
        { text: 'The doc is <code>abc</code> at rev 7. A inserts <code>X</code> at position 1; at the same moment B deletes position 2 (the <code>c</code>). Each sees its own edit instantly.', flow: [['ca>gw', 'cb>gw']], badges: { ca: 'aXbc', cb: 'ab' } },
        { text: 'A\'s op arrives first and becomes <b>rev 8</b>. B\'s op was based on rev 7, so the server <b>transforms</b> it past A\'s insert: delete@2 becomes <b>delete@3</b>.', flow: ['gw>sess'], badges: { sess: 'T(del@2, ins@1) = del@3' } },
        { text: 'Both ops are appended to the log as rev 8 and rev 9. Each sender gets an ack with its revision.', flow: ['sess>log', 'sess>gw'], badges: { log: 'rev 8, 9' } },
        { text: 'A receives del@3 and applies it. B receives ins@1, transforms it against its own pending delete (no change), and applies it.', flow: [['gw>ca', 'gw>cb']] },
        { text: 'Both show <code>aXb</code>. That is <b>convergence</b>, and both users\' intentions survived.', nodes: ['ca', 'cb'], ok: ['ca', 'cb'], badges: { ca: ['aXb', 'ok'], cb: ['aXb', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'offline', title: 'Offline edits, then reconnect', tone: 'warn',
      steps: [
        { text: 'B boards a plane at rev 120 and keeps editing. Ops queue locally with <code>base_rev = 120</code>.', nodes: ['cb'], warn: ['cb'], badges: { cb: ['offline · 40 ops', 'warn'] }, tone: 'warn' },
        { text: 'Meanwhile A makes 300 edits. The doc reaches rev 420.', flow: ['ca>gw', 'gw>sess', 'sess>log'], badges: { log: 'rev 420' } },
        { text: 'B lands and uploads its 40 ops. With <b>OT</b> the server transforms each one past 300 concurrent ops; with a <b>CRDT</b> the ops merge directly. Ops are idempotent on <code>(client_id, seq)</code>.', flow: ['cb>gw', 'gw>sess'], badges: { sess: 'merge 40 vs 300' } },
        { text: 'B downloads ops 121–420 and rebases its view. Both converge. Long offline gaps are where CRDTs shine; OT can do it, but it is costly and needs the server.', flow: ['sess>gw', 'gw>cb'], ok: ['cb'], badges: { cb: ['in sync', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'open', title: 'Opening a doc: snapshot + replay', tone: 'info',
      steps: [
        { text: 'A user opens a doc. The gateway asks the router who owns it.', flow: ['ca>gw', 'gw>route'], badges: { route: 'doc → sess-3' } },
        { text: 'Nobody has it loaded, so a session server takes the lease and loads the newest <b>snapshot</b> (rev 5,000).', flow: ['gw>sess', 'sess>blob'], badges: { blob: 'snap @5000' } },
        { text: 'It replays the ops after the snapshot (5,001–5,230) from the log. 230 ops replay in milliseconds.', flow: ['sess>log'], badges: { sess: '+230 ops' } },
        { text: 'The client gets the document at rev 5,230 and starts receiving live ops. The snapshotter keeps replay short by folding ops every N revisions.', flow: ['sess>gw', 'gw>ca', 'log>snap', 'snap>blob'], ok: ['ca'], tone: 'ok' }
      ]
    },
    {
      id: 'failover', title: 'Failure: session server crashes', tone: 'err',
      steps: [
        { text: 'The session server dies. Every WebSocket for its docs drops and clients start reconnecting with backoff.', nodes: ['sess'], err: ['sess'], badges: { sess: ['down', 'err'] }, tone: 'err' },
        { text: 'Its lease expires (~10 s). The gateway asks the router again and the doc moves to the standby server.', flow: ['gw>route', 'gw>sess2'], warn: ['route'], badges: { route: ['lease expired', 'warn'] }, tone: 'warn' },
        { text: 'The new owner loads snapshot + log tail. Ops the old server never acked are not in the log, so clients <b>resend</b> them with the same <code>(client_id, seq)</code>.', flow: ['sess2>blob', 'sess2>log'], badges: { sess2: 'rebuilt' } },
        { text: '<b>Fencing</b>: if the old server comes back, its insert of rev 101 fails on the primary key because rev 101 already exists. Figma notes that contending instances can otherwise corrupt the history.', nodes: ['log'], ok: ['log', 'sess2'], tone: 'ok' }
      ]
    },
    {
      id: 'hot', title: 'Hot doc: 200 people in an all-hands doc', tone: 'warn',
      steps: [
        { text: '200 people open the same doc. Every cursor move fans out to 199 others: at 10 Hz that is ~400K presence messages per second for one doc.', flow: [['ca>gw', 'cb>gw'], 'gw>pres'], warn: ['pres'], badges: { pres: ['400K msg/s', 'warn'] }, tone: 'warn' },
        { text: 'Throttle and batch presence (e.g. one frame per 100 ms), drop updates nobody can see, and show only avatars past ~50 users.', nodes: ['pres'], ok: ['pres'], badges: { pres: ['batched', 'ok'] } },
        { text: 'Edits still go through <b>one ordered stream</b> on one session server. That is fine: even a busy doc is only tens of ops per second.', flow: ['gw>sess', 'sess>log'], badges: { sess: '~40 ops/s' } },
        { text: 'Read-only viewers can get ops in small batches from the change feed or a fan-out tier, so the owner only talks to editors.', flow: ['log>feed'], ok: ['sess'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick a merge model and a document type. Load and timing numbers are rough <em>estimates</em>.',
    controls: [
      { id: 'model', label: 'Merge model', type: 'seg', value: 'ot', options: [
        { v: 'ot', l: 'OT on a central server' }, { v: 'crdt', l: 'CRDT (Yjs / Automerge)' }, { v: 'lww', l: 'LWW per property (Figma)' }] },
      { id: 'doc', label: 'Document type', type: 'seg', value: 'text', options: [
        { v: 'text', l: 'Rich text' }, { v: 'canvas', l: 'Design canvas (objects)' }] },
      { id: 'snap', label: 'Snapshot every', type: 'range', min: 100, max: 20000, step: 100, value: 1000, fmt: (v) => SD.fmt.num(v) + ' ops' },
      { id: 'hz', label: 'Presence rate', type: 'range', min: 1, max: 30, step: 1, value: 10, unit: 'Hz' },
      { id: 'eds', label: 'Editors in the doc', type: 'range', min: 2, max: 200, step: 1, value: 8 }
    ],
    evaluate(s) {
      const text = s.doc === 'text';
      const conv = s.model === 'lww' && text
        ? { v: 'one keystroke wins, the other is lost', s: 0.15 }
        : s.model === 'ot' && !text ? { v: 'yes, but heavy for objects', s: 0.7 } : { v: 'yes: all replicas converge', s: 0.95 };
      const off = { ot: { v: 'needs the server; long gaps are costly', s: 0.4 }, crdt: { v: 'native: merge any time, even P2P', s: 0.95 }, lww: { v: 'server reorders; conflicting props: last wins', s: 0.55 } }[s.model];
      const meta = { ot: { v: 'ops only; history on the server', s: 0.85 }, crdt: { v: 'ids + tombstones per item', s: 0.5 }, lww: { v: 'one value per property', s: 0.9 } }[s.model];
      const srv = { ot: { v: 'stateful: transforms every op', s: 0.5 }, crdt: { v: 'relay + persist updates', s: 0.8 }, lww: { v: 'orders + validates', s: 0.8 } }[s.model];
      const replayMs = 40 + (s.snap / 2) * (s.model === 'crdt' ? 0.05 : 0.02);   // snapshot fetch + replay (illustrative)
      const pres = s.eds * (s.eds - 1) * s.hz;
      const metrics = [
        { k: 'Converges correctly?', v: conv.v, s: conv.s },
        { k: 'Offline merge', v: off.v, s: off.s },
        { k: 'Metadata overhead', v: meta.v, s: meta.s },
        { k: 'Server role', v: srv.v, s: srv.s },
        { k: 'Cold open time', v: '≈ ' + SD.fmt.dur(replayMs), s: replayMs < 100 ? 0.9 : replayMs < 300 ? 0.6 : 0.25, hint: SD.fmt.num(s.snap / 2) + ' ops replayed' },
        { k: 'Presence fan-out', v: SD.fmt.num(pres) + ' msg/s', s: pres < 2e4 ? 0.9 : pres < 2e5 ? 0.55 : 0.15, hint: s.eds + ' users × ' + s.hz + ' Hz' }
      ];
      const notes = [];
      if (s.model === 'ot') notes.push('OT needs one place that orders ops: Jupiter (1995) and Google Docs both use a central server, which keeps the transform rules simple.');
      if (s.model === 'crdt') notes.push('Each character gets a unique id (client, counter). Deletes leave <b>tombstones</b>, so a CRDT doc carries more metadata than its text; Yjs and Automerge compress it heavily.');
      if (s.model === 'lww') notes.push('Figma\'s server orders every change, so a property simply takes the last value it received. No timestamps or transforms needed.');
      if (s.model === 'lww' && text) notes.push('Two people typing in the same text box both change one "text" property. LWW keeps one version and silently drops the other.');
      if (s.snap >= 10000) notes.push('Rare snapshots make every cold open replay thousands of ops. Snapshot by op count <i>and</i> by time.');
      if (pres >= 2e5) notes.push('Presence dominates traffic. Batch at ~100 ms, drop off-screen cursors and switch to avatars for big audiences.');
      let verdict;
      if (s.model === 'lww' && text) verdict = '❌ <b>LWW loses concurrent typing.</b> Use OT or a sequence CRDT for text; keep LWW for object properties.';
      else if (pres >= 2e5) verdict = '⚠ <b>Presence will swamp the servers</b> before edits do. Throttle and batch cursor updates.';
      else if (replayMs >= 300) verdict = '⚠ <b>Slow cold opens.</b> Snapshot more often.';
      else if (s.model === 'lww') verdict = '✅ <b>Figma\'s design:</b> one process per doc, server-ordered, last-writer-wins per property.';
      else if (s.model === 'ot' && text) verdict = '✅ <b>Google Docs-style:</b> a central server orders and transforms ops. Simple clients, but offline and P2P are hard.';
      else if (s.model === 'crdt' && text) verdict = '✅ <b>Yjs / Automerge-style:</b> converges in any order, works offline and peer-to-peer. Watch metadata growth.';
      else verdict = '👍 <b>Works, but heavier than needed</b> for independent object properties. LWW per property is simpler.';
      const sub = { ot: 'OT · transform vs history', crdt: 'relay · merge CRDT updates', lww: 'orders · LWW per property' }[s.model];
      return {
        metrics, verdict, notes,
        flow: ['ca>gw', 'gw>sess', 'sess>log', 'sess>gw', 'gw>cb', 'gw>pres'],
        labels: {
          sess: { label: s.model === 'crdt' ? 'Sync server' : s.model === 'lww' ? 'Multiplayer server' : 'Session server', sub },
          ca: { label: 'Client A', sub: { ot: 'pending + buffered ops', crdt: 'full CRDT replica', lww: 'optimistic props' }[s.model] },
          snap: { label: 'Snapshotter', sub: 'every ' + SD.fmt.num(s.snap) + ' ops' }
        },
        hot: pres >= 2e5 ? ['pres'] : [],
        err: s.model === 'lww' && text ? ['sess'] : [],
        warn: replayMs >= 300 ? ['blob'] : [],
        badges: { pres: [SD.fmt.num(pres) + '/s', pres >= 2e5 ? 'err' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Two editors, one document: OT vs CRDT',
    caption: 'Tap a letter to move that user\'s caret, then type or delete. Messages take the <b>network delay</b> you set, so edits cross in flight. Press <b>⚡ Conflict</b> to make both users type at the same spot at once. In OT mode the server transforms ops; in CRDT mode every character has an id and deletes leave tombstones.'
  },

  realWorld: {
    intro: 'Two families of algorithms, and one pragmatic shortcut, run most real products.',
    timeline: [
      { when: '1995', who: 'Xerox PARC', title: 'Jupiter: OT with a central server', text: 'Jupiter\'s clients and server exchange high-level operations instead of raw graphics, suited to slow links. Its centralized design simplified the concurrency algorithm, the model Google later followed.', src: 3 },
      { when: '2010', who: 'Google', title: 'The new Google Docs is built on OT', text: 'Google\'s three-part series explains conflict resolution with <b>operational transformation</b>: each edit is an operation that is shifted past concurrent edits. A separate <b>collaboration protocol</b> sends ops to the server and gets them acknowledged.', src: 2 },
      { when: '2016', who: 'Yjs', title: 'YATA: a CRDT for shared editing', text: 'The YATA paper (GROUP \'16) describes a CRDT that converges, preserves user intent, supports offline editing and works for arbitrary data types in the browser. Yjs is its open-source implementation.', src: 4 },
      { when: '2019', who: 'Figma', title: 'Server-ordered, LWW per property', text: 'Each document runs in its <b>own server process</b> that every editor connects to over WebSockets. Two changes to the same property keep the last one the server received. No OT: the object model did not need it. Reparenting that would create a cycle is rejected.', src: 0 },
      { when: '2019', who: 'Ink & Switch', title: 'Local-first software', text: 'Kleppmann and co-authors argue that CRDTs can be the foundation for apps that work offline, sync across devices and keep users in control of their data. Automerge came out of this work.', src: 5 },
      { when: '2023', who: 'Automerge', title: 'Automerge 2.0', text: 'A ground-up rewrite, described as the first production-ready release, with major performance and reliability improvements.', src: 6 },
      { when: 'Later', who: 'Figma', title: 'A journal for durability', text: 'Figma added a write-ahead <b>journal</b> written about every 0.5 s, versus checkpoints about every 60 s. <b>95% of edits are saved within 600 ms.</b> Journal entries carry sequence-number ranges that must be stitched onto a checkpoint when loading.', src: 1 }
    ],
    lessons: [
      'Route all editors of a doc to <b>one owner</b>; it makes ordering, transforms and validation simple.',
      'Pick the merge model from the data: <b>OT or a sequence CRDT for text</b>, <b>LWW per property</b> for object models.',
      'Persist an <b>op log plus snapshots</b>, and fence writes so two owners can never both commit.',
      'Treat <b>presence</b> as ephemeral, throttled traffic, separate from edits.'
    ],
    sources: [
      { title: 'How Figma\'s multiplayer technology works', url: 'https://www.figma.com/blog/how-figmas-multiplayer-technology-works/', pub: 'Figma Blog, 2019' },
      { title: 'Making multiplayer more reliable', url: 'https://www.figma.com/blog/making-multiplayer-more-reliable/', pub: 'Figma Blog' },
      { title: 'What\'s different about the new Google Docs: Conflict resolution', url: 'https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs_22.html', pub: 'Google Drive Blog, 2010' },
      { title: 'High-Latency, Low-Bandwidth Windowing in the Jupiter Collaboration System', url: 'https://uist.acm.org/uist1995/abstracts/Nichols.html', pub: 'Nichols et al., UIST 1995' },
      { title: 'Near Real-Time Peer-to-Peer Shared Editing on Extensible Data Types (YATA)', url: 'https://dl.eusset.eu/handle/20.500.12015/4549', pub: 'Nicolaescu et al., GROUP 2016' },
      { title: 'Local-first software (Onward! 2019)', url: 'https://martin.kleppmann.com/2019/10/23/local-first-at-onward.html', pub: 'Martin Kleppmann, 2019' },
      { title: 'Introducing Automerge 2.0', url: 'https://automerge.org/blog/automerge-2/', pub: 'Automerge Blog' },
      { title: 'What\'s different about the new Google Docs: Making collaboration fast', url: 'https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs.html', pub: 'Google Drive Blog, 2010' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Merge model', '<b>OT</b>: compact ops, proven in Google Docs', '<b>CRDT</b>: any order converges, offline and P2P', 'OT with a central server; CRDT for local-first or P2P'],
      ['Object properties', '<b>LWW per property</b>: trivial, server-ordered', '<b>Full CRDT</b>: no server needed', 'LWW when you already have one server per doc (Figma)'],
      ['Ownership', '<b>One server per doc</b>: simple ordering', '<b>Shared stateless servers</b>: easy scaling, hard ordering', 'One owner per doc with a lease and fencing'],
      ['Persistence', '<b>Op log only</b>: full history, slow opens', '<b>Log + snapshots</b>: fast opens', 'Snapshot every N ops or minutes; keep the log for history'],
      ['Presence', '<b>Same channel as ops</b>: simple', '<b>Separate pub/sub, throttled</b>: protects edits', 'Separate once docs have more than a handful of users']
    ]
  },
  failures: [
    { f: 'Session server crashes', detect: 'Lease expiry; WebSocket disconnects', fix: 'New owner loads snapshot + log; clients resend unacked ops idempotently.' },
    { f: 'Two servers think they own a doc', detect: 'Duplicate rev insert errors', fix: 'Fence with the (doc_id, rev) primary key or a lease epoch in every write.' },
    { f: 'Replicas diverge (bug in transform)', detect: 'Periodic checksum of doc state from clients vs server', fix: 'Force a resync from the server snapshot; add property tests for TP1 on the transform functions.' },
    { f: 'Slow cold opens', detect: 'Ops replayed per open; p95 open time', fix: 'Snapshot more often; snapshot asynchronously off the hot path.' },
    { f: 'Presence storm on a hot doc', detect: 'Presence msgs/s per doc', fix: 'Batch at ~100 ms, drop off-screen cursors, cap visible cursors.' },
    { f: 'Offline client returns after weeks', detect: 'base_rev far behind', fix: 'Transform in batches or rebase on a snapshot; with CRDTs, garbage-collect tombstones only after all peers have seen them.' }
  ],

  interview: [
    { q: 'OT vs CRDT: what is the difference?', a: '<p><b>OT</b> sends plain operations (insert at 5) and <b>transforms</b> each incoming op against the concurrent ops it missed, so its position still means the same thing. It works best with a central server that defines one order.</p><p>A <b>CRDT</b> gives every element a unique id and designs operations to <b>commute</b>, so any replica can apply them in any order and still converge. It handles offline and peer-to-peer naturally, at the cost of more metadata (ids, tombstones).</p>', lvl: 'core' },
    { q: 'Why route every editor of a doc to one server?', a: '<p>One owner gives a single, total order of ops, so assigning revisions and transforming is simple and cheap. It also holds the doc in memory, validates edits and batches writes. The cost is a per-doc bottleneck, which is fine because one human document rarely sees more than tens of ops per second.</p>', lvl: 'core' },
    { q: 'Walk through transforming two concurrent inserts.', a: '<p>Doc <code>abc</code>. A does <code>ins(1,\'X\')</code>, B does <code>ins(1,\'Y\')</code>, both from rev 7. The server applies A first. For B: same position, so use a tie-breaker (e.g. lower site id goes first). B becomes <code>ins(2,\'Y\')</code>. A then receives B\'s transformed op and gets <code>aXYbc</code>, like the server. The tie-breaker must be the same everywhere.</p>', lvl: 'core' },
    { q: 'How does undo work in a collaborative doc?', a: '<p>Undo must undo <b>only your own</b> last edit, not someone else\'s. Store the inverse of each of your ops; when undoing, <b>transform the inverse</b> past every op applied since, then send it as a new op. Figma keeps deleted objects in the client\'s undo buffer so undo can restore them.</p>', lvl: 'deep' },
    { q: 'How do offline edits merge?', a: '<p>The client queues ops with the <code>base_rev</code> they were made on. On reconnect it uploads them; the server transforms them past everything committed since (OT) or merges directly (CRDT). Ops carry <code>(client_id, seq)</code> so a retried upload is idempotent. The client then downloads the missed ops and rebases its local view.</p>', lvl: 'core' },
    { q: 'How do you show cursors for many users efficiently?', a: '<p>Keep presence <b>off the op path</b>: a separate pub/sub channel, ephemeral and never persisted. Throttle to 10–20 Hz and batch. Store cursors as positions relative to document elements, so they move correctly with edits. For large audiences show avatars only.</p>', lvl: 'core' },
    { q: 'How do you store a document with a long edit history?', a: '<p>An append-only <b>op log</b> keyed by <code>(doc_id, rev)</code>, plus <b>snapshots</b> every N ops or minutes in object storage. Open = newest snapshot + replay ops after it. History = replay from an older snapshot. Old ops can be compacted once no history view needs them.</p>', lvl: 'core' },
    { q: 'What happens if the session server dies?', a: '<p>Its lease expires, another server takes the doc and rebuilds from snapshot + log. Ops never acknowledged were never committed, so clients resend them; idempotency keys make that safe. Use <b>fencing</b> (unique <code>(doc_id, rev)</code> or a lease epoch) so a zombie owner cannot write.</p>', lvl: 'deep' },
    { q: 'Why did Figma not use OT?', a: '<p>Figma documents are trees of objects with properties. Concurrent edits to <i>different</i> properties never conflict, and for the same property it is acceptable to keep the last value. Since its server already orders all changes, a <b>last-writer-wins register per property</b> is enough, with special handling for object creation, deletion and reparenting cycles.</p>', lvl: 'deep' },
    { q: 'What is a tombstone and why does it matter?', a: '<p>In a sequence CRDT a deleted character is marked deleted but kept, because a concurrent insert may reference it as its neighbour. These <b>tombstones</b> grow the document. You can garbage-collect them only once every replica has seen the delete, which is hard when clients can stay offline for weeks.</p>', lvl: 'deep' },
    { q: 'How do you check that replicas really converged?', a: '<p>Clients periodically send a hash of their document at a known revision; the server compares with its own. A mismatch triggers a full resync from the server and an alert, because it means a transform or merge bug. Property-based tests that apply random concurrent ops in different orders catch most of these early.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Java: OT session for one doc', lang: 'java',
      code: `sealed interface Op permits Ins, Del, Noop {}
record Ins(int pos, char ch, int site) implements Op {}
record Del(int pos) implements Op {}
record Noop() implements Op {}        // a delete that lost to the same delete

final class Ot {
  // transform(a, b): rewrite a so it applies after b
  static Op transform(Op a, Op b) {
    if (a instanceof Noop || b instanceof Noop) return a;
    if (a instanceof Ins x && b instanceof Ins y)
      return (x.pos() < y.pos() || (x.pos() == y.pos() && x.site() < y.site())) ? x
          : new Ins(x.pos() + 1, x.ch(), x.site());
    if (a instanceof Ins x && b instanceof Del y)
      return x.pos() <= y.pos() ? x : new Ins(x.pos() - 1, x.ch(), x.site());
    if (a instanceof Del x && b instanceof Ins y)
      return x.pos() < y.pos() ? x : new Del(x.pos() + 1);
    Del x = (Del) a, y = (Del) b;
    return x.pos() < y.pos() ? x : x.pos() > y.pos() ? new Del(x.pos() - 1) : new Noop();
  }
}

final class DocSession {                // one instance per doc, on its owner
  private final StringBuilder text = new StringBuilder();
  private final List<Op> history = new ArrayList<>();   // index = rev - 1

  synchronized long receive(long baseRev, Op op) {
    Op cur = op;
    for (int i = (int) baseRev; i < history.size(); i++)
      cur = Ot.transform(cur, history.get(i));          // past every concurrent op
    if (cur instanceof Ins in) text.insert(in.pos(), in.ch());
    else if (cur instanceof Del d) text.deleteCharAt(d.pos());
    history.add(cur);
    return history.size();              // new rev: persist, ack, broadcast
  }
}`,
      note: 'Java 17 pattern matching. The site id breaks ties between inserts at the same position; every replica must use the same rule.'
    },
    {
      title: 'Postgres: op log with idempotency + fencing', lang: 'sql',
      code: `CREATE TABLE doc_ops (
  doc_id     uuid        NOT NULL,
  rev        bigint      NOT NULL,
  client_id  uuid        NOT NULL,
  seq        int         NOT NULL,
  op         jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, rev),               -- fence: one rev, one writer
  UNIQUE (doc_id, client_id, seq)          -- idempotent client retries
);

-- owner appends the transformed op; a zombie owner fails on the PK
INSERT INTO doc_ops (doc_id, rev, client_id, seq, op)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (doc_id, client_id, seq) DO NOTHING
RETURNING rev;            -- no row and no error: duplicate retry, re-ack

-- open: newest snapshot, then the ops after it
SELECT rev, op FROM doc_ops
 WHERE doc_id = $1 AND rev > $2           -- $2 = snapshot rev
 ORDER BY rev;`,
      note: '<code>ON CONFLICT</code> names only the idempotency key, so a clash on the primary key (another owner wrote that rev) still raises an error and the stale owner steps down.'
    },
    {
      title: 'JS: Yjs client with offline + presence', lang: 'js',
      code: `import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

const doc = new Y.Doc();
const body = doc.getText('body');

// offline: edits persist locally and sync when the socket returns
new IndexeddbPersistence('doc-42', doc);
const ws = new WebsocketProvider('wss://collab.example.com', 'doc-42', doc);

// presence lives in "awareness": ephemeral, never stored in the doc
ws.awareness.setLocalStateField('user', { name: 'Asha', color: '#6366f1' });
ws.awareness.on('change', () => renderCursors([...ws.awareness.getStates().values()]));

body.observe((event) => render(body.toString()));
body.insert(0, 'Hello');                     // applied locally at once

// server side: persist the merged state as a snapshot
const snapshot = Y.encodeStateAsUpdate(doc); // Uint8Array`,
      note: 'Yjs updates commute, so the server can be a relay that stores updates and periodic snapshots without transforming anything.'
    }
  ],

  related: ['chat', 'file-sync', 'distributed-cache', 'lock-manager', 'message-queue', 'multiplayer-game']
});
