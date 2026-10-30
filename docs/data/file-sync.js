SD.register({
  slug: 'file-sync',
  domain: 4,
  title: 'Cloud Storage & File Sync',
  examples: 'Dropbox, Google Drive',
  tagline: 'Keep every device\'s folder identical by moving <b>only the blocks that changed</b>, storing each unique block <b>once</b>, and never silently losing an edit.',
  tldr: {
    problem: 'Users edit big files on laptops that sleep, go offline for days and share folders with thousands of people. Re-uploading a 1 GB file for a one-line change, or letting one device overwrite another\'s edit, is not acceptable.',
    idea: 'Split files into <b>blocks</b> named by their <b>SHA-256 hash</b>. A file version is just an ordered <b>blocklist</b>. Upload only blocks the server lacks, then <b>commit</b> the blocklist to a metadata journal with an optimistic version check. Other devices learn about it through a <b>long-lived notification</b> channel.',
    insight: 'Separate <b>bytes</b> (immutable, content-addressed, deduplicated, huge) from <b>metadata</b> (small, mutable, strongly consistent). Each side then gets the store that suits it, and sync becomes a <b>tree-diff</b> problem.',
    numbers: [
      { v: '4 MB', l: 'Dropbox block size; each block is identified by its SHA-256 hash (Dropbox, 2014)' },
      { v: '500 PB', l: 'user data Dropbox moved into its own Magic Pocket store (Dropbox, 2016)' },
      { v: '3 trees', l: 'Remote, Local and Synced trees in Dropbox\'s Nucleus sync engine (Dropbox, 2020)' }
    ]
  },

  requirements: {
    functional: [
      'Upload and download files of any size, resumably',
      'Sync changes to all of a user\'s devices automatically',
      'Delta sync: transfer only changed blocks',
      'Version history and restore',
      'Shared folders across users',
      'Offline edits, with conflicts surfaced (never lost)'
    ],
    nonFunctional: [
      'Durability above everything: never lose a committed block',
      'Changes appear on other devices within seconds',
      'Bandwidth-efficient on slow or metered links',
      'Exabytes of blocks and billions of files',
      'Metadata commits are strongly consistent (no lost update)',
      'Clients can be offline for days and catch up'
    ],
    outOfScope: ['Real-time co-editing inside a document (see Collaborative Editing)', 'Full-text search over content', 'Virus scanning', 'Billing and quotas']
  },

  calculator: {
    inputs: [
      { id: 'users', label: 'Users', min: 100000, max: 1000000000, value: 100000000, log: true },
      { id: 'gb', label: 'Stored per user', min: 0.1, max: 2000, value: 20, unit: 'GB', log: true },
      { id: 'dedup', label: 'Space saved by dedup', min: 0, max: 60, value: 20, unit: '%' },
      { id: 'edits', label: 'File edits per user per day', min: 1, max: 200, value: 20 },
      { id: 'fmb', label: 'Average size of an edited file', min: 0.1, max: 2000, value: 30, unit: 'MB', log: true },
      { id: 'chg', label: 'Bytes changed per edit (in place)', min: 1000, max: 50000000, value: 100000, fmt: 'bytes', log: true }
    ],
    outputs: [
      { label: 'Logical data stored', fmt: 'bytes', f: (v) => v.users * v.gb * 1e9 },
      { label: 'Unique data after dedup (before replication / EC)', fmt: 'bytes', f: (v) => v.users * v.gb * 1e9 * (1 - v.dedup / 100) },
      { label: 'Unique 4 MB blocks to index', f: (v) => v.users * v.gb * 1e9 * (1 - v.dedup / 100) / 4e6 },
      { label: 'Block index (~100 B per hash entry)', fmt: 'bytes', f: (v) => v.users * v.gb * 1e9 * (1 - v.dedup / 100) / 4e6 * 100 },
      { label: 'Uploads/day, whole-file sync', fmt: 'bytes', f: (v) => v.users * v.edits * v.fmb * 1e6 },
      { label: 'Uploads/day, 4 MB block sync', fmt: 'bytes', f: (v) => v.users * v.edits * Math.min(v.fmb * 1e6, Math.ceil(v.chg / 4e6) * 4e6) }
    ],
    note: 'All inputs are <em>estimates</em>, including the dedup ratio (it depends heavily on the user base). The block-sync row assumes an <b>in-place</b> edit that touches ⌈changed / 4 MB⌉ blocks; an <b>insertion</b> near the start of a file breaks fixed-size blocks (try the knobs and the widget).'
  },

  api: [
    { m: 'POST', p: '/v1/blocks/check', d: 'Body: list of SHA-256 hashes. Returns the ones the server does <b>not</b> have. Everything else is already stored (dedup).' },
    { m: 'PUT', p: '/v1/blocks/{sha256}', d: 'Upload one block (≤ 4 MB). The server re-hashes it. Idempotent: the same hash always means the same bytes.' },
    { m: 'POST', p: '/v1/commit', d: '<code>{path, blocklist, parent_rev}</code>. Succeeds only if the file is still at <code>parent_rev</code>; otherwise <code>409</code> → conflict handling.' },
    { m: 'GET', p: '/v1/changes?cursor=…', d: 'Journal entries after the cursor for every namespace the device can see. Returns a new cursor.' },
    { m: 'GET', p: '/v1/notify?cursor=…', d: '<b>Long-poll</b>: held open up to ~60 s and returns as soon as there is something new. Carries no data, just "changes available".' },
    { m: 'GET', p: '/v1/blocks/{sha256}', d: 'Download a block. Immutable, so it can be cached anywhere.' }
  ],
  dataModel: [
    { name: 'journal', store: 'Sharded SQL (by namespace)', fields: [['(ns_id, journal_id)', 'bigint, bigint', 'pk'], ['path', 'text', 'idx'], ['file_id', 'uuid', 'fk'], ['rev', 'bigint'], ['blocklist', 'bytea[] (hashes)'], ['deleted', 'bool']], note: 'Append-only log per namespace (a user\'s root or a shared folder). A device\'s cursor is just a journal_id.' },
    { name: 'files', store: 'Sharded SQL', fields: [['file_id', 'uuid', 'pk'], ['ns_id', 'bigint', 'idx'], ['path', 'text', 'idx'], ['current_rev', 'bigint'], ['size', 'bigint']], note: 'Latest state per file; commits use <code>UPDATE … WHERE current_rev = :parent</code>.' },
    { name: 'blocks', store: 'Block index (KV)', fields: [['sha256', 'bytes(32)', 'pk'], ['size', 'int'], ['location', 'cell / volume'], ['refcount', 'int']], note: 'Hash → where the encrypted bytes live. Knows nothing about users or files.' },
    { name: 'client state', store: 'SQLite on device', fields: [['remote tree', 'last seen server state'], ['local tree', 'what is on disk'], ['synced tree', 'last agreed state']], note: 'Diffing local vs synced finds uploads; remote vs synced finds downloads; changes on both sides are conflicts.' }
  ],

  architecture: {
    title: 'File sync: blocks and metadata, separated',
    nodes: [
      { id: 'dA', label: 'Desktop client', sub: 'watcher · chunker', kind: 'client', wide: [90, 110], tall: [70, 0], tip: 'Watches the folder, splits changed files into blocks, hashes them, and reconciles local, remote and synced state.' },
      { id: 'ldb', label: 'Local state', sub: 'SQLite: 3 trees', kind: 'store', wide: [90, 0], tall: [70, 105], tip: 'Remote tree, local tree and synced tree (the last state both sides agreed on). Survives crashes and restarts.' },
      { id: 'dB', label: 'Other device', sub: 'laptop · phone', kind: 'client', wide: [90, 330], tall: [350, 0], tip: 'Another device of the same user, or a member of a shared folder.' },
      { id: 'api', label: 'Sync API', sub: 'auth · routing', kind: 'edge', wide: [280, 220], tall: [210, 105], tip: 'Authenticates the device and routes block traffic and metadata traffic to different services.' },
      { id: 'blk', label: 'Block service', sub: 'hash → bytes', kind: 'service', wide: [470, 110], tall: [70, 210], tip: 'Checks which hashes exist, verifies uploads by re-hashing, encrypts and writes blocks. Has no idea which file a block belongs to.' },
      { id: 'bs', label: 'Block store', sub: 'Magic Pocket / S3', kind: 'store', wide: [660, 110], tall: [70, 315], tip: 'Immutable blob storage for blocks of up to 4 MB, replicated or erasure-coded across zones.' },
      { id: 'meta', label: 'Metadata service', sub: 'commit · journal', kind: 'service', wide: [470, 330], tall: [350, 210], tip: 'Validates commits (all blocks present, parent revision matches), appends to the namespace journal, and notifies watchers.' },
      { id: 'mdb', label: 'Metadata DB', sub: 'sharded by namespace', kind: 'store', wide: [660, 330], tall: [350, 315], tip: 'Journal, files and revisions. Strong consistency within a namespace shard.' },
      { id: 'notif', label: 'Notifier', sub: 'long-poll / socket', kind: 'service', wide: [280, 440], tall: [210, 315], tip: 'Holds millions of idle connections and wakes the ones whose namespaces changed.' },
      { id: 'pre', label: 'Indexers', sub: 'previews · search', kind: 'compute', wide: [850, 330], tall: [350, 420], tip: 'Consume the journal to build thumbnails, previews and search indexes, off the sync path.' }
    ],
    edges: [
      { from: 'dA', to: 'ldb', bidi: true },
      { from: 'dA', to: 'api', bidi: true },
      { from: 'dB', to: 'api', bidi: true },
      { from: 'api', to: 'blk' },
      { from: 'blk', to: 'bs' },
      { from: 'api', to: 'meta' },
      { from: 'meta', to: 'mdb' },
      { from: 'meta', to: 'blk', dashed: true, label: 'blocks exist?' },
      { from: 'meta', to: 'notif' },
      { from: 'notif', to: 'dB', dashed: true },
      { from: 'mdb', to: 'pre', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'edit', title: 'Edit a 1 GB file → upload 2 blocks', tone: 'ok',
      steps: [
        { text: 'You change a few bytes in a 1 GB video project. The watcher fires; the client splits the file into <b>256 × 4 MB blocks</b> and hashes each with SHA-256.', flow: ['dA>ldb'], badges: { dA: '256 hashes' } },
        { text: 'Diffing against the synced tree shows only <b>2 blocks</b> changed. The client asks the block service which of those hashes it is missing.', flow: ['dA>api', 'api>blk'], badges: { blk: 'missing: 2' } },
        { text: 'It uploads <b>8 MB instead of 1 GB</b>. The block service re-hashes each block to verify it, then writes it to the block store.', flow: ['dA>api', 'api>blk', 'blk>bs'], badges: { bs: ['+2 blocks', 'ok'] }, tone: 'ok' },
        { text: 'The client <b>commits</b> the new blocklist with <code>parent_rev = 41</code>. Metadata checks the blocks exist and the revision still matches, then appends to the journal.', flow: ['dA>api', 'api>meta', 'meta>blk', 'meta>mdb'], badges: { mdb: 'rev 42' } },
        { text: 'The notifier wakes the other device\'s long-poll. It pulls the journal entry and downloads just the 2 new blocks.', flow: ['meta>notif', 'notif>dB', 'dB>api', 'api>blk'], ok: ['dB'], badges: { dB: ['2 blocks ↓', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'dedup', title: 'Dedup: a file the service already has', tone: 'info',
      steps: [
        { text: 'A user adds a 700 MB installer that thousands of others have already stored.', flow: ['dA>ldb'], badges: { dA: '175 blocks' } },
        { text: '<code>blocks/check</code> answers: <b>none missing</b>. Zero bytes are uploaded; the commit only writes metadata.', flow: ['dA>api', 'api>blk'], ok: ['blk'], badges: { blk: ['0 missing', 'ok'] }, tone: 'ok' },
        { text: 'The block store keeps one copy; the index refcount goes up. Storage grows by a journal row, not by 700 MB.', flow: ['api>meta', 'meta>mdb'], badges: { mdb: '+1 row' } },
        { text: '<b>Privacy catch:</b> "instant upload" tells the client that someone already has these bytes, which leaks file existence. Mitigations: dedup per user or team, or require a proof of ownership before skipping the upload.', nodes: ['blk'], warn: ['blk'], badges: { blk: ['existence leak', 'warn'] }, tone: 'warn' }
      ]
    },
    {
      id: 'conflict', title: 'Offline edits on two devices', tone: 'warn',
      steps: [
        { text: 'Both devices are offline. Each edits <code>plan.docx</code>, starting from <b>rev 7</b>.', nodes: ['dA', 'dB'], warn: ['dA', 'dB'], badges: { dA: 'edit from rev 7', dB: 'edit from rev 7' }, tone: 'warn' },
        { text: 'The laptop reconnects first and commits with <code>parent_rev = 7</code>. It matches, so it becomes <b>rev 8</b>.', flow: ['dA>api', 'api>meta', 'meta>mdb'], ok: ['mdb'], badges: { mdb: ['rev 8', 'ok'] } },
        { text: 'The phone commits with <code>parent_rev = 7</code>, but the file is at 8. The conditional update matches 0 rows, so the server returns <b>409 conflict</b>.', flow: ['dB>api', 'api>meta'], err: ['meta'], badges: { meta: ['409: rev is 8', 'err'] }, tone: 'err' },
        { text: 'The phone saves its version as <b>"plan (conflicted copy).docx"</b> and downloads rev 8. Both edits survive; a human merges them.', flow: ['dB>api', 'api>meta', 'meta>mdb'], ok: ['dB'], badges: { dB: ['2 files kept', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'crash', title: 'Client crashes mid-upload', tone: 'err',
      steps: [
        { text: 'Halfway through uploading 300 new blocks, the laptop loses power.', nodes: ['dA'], err: ['dA'], badges: { dA: ['crash @150/300', 'err'] }, tone: 'err' },
        { text: 'No commit happened, so <b>no other device ever sees a half-written file</b>. The 150 uploaded blocks are stored but unreferenced.', nodes: ['bs', 'mdb'], ok: ['mdb'], badges: { bs: '150 orphan blocks', mdb: ['still rev 12', 'ok'] } },
        { text: 'On restart the client reloads its trees from SQLite, re-hashes and calls <code>blocks/check</code> again: <b>150 missing</b>. It uploads only those.', flow: ['dA>ldb', 'dA>api', 'api>blk', 'blk>bs'], badges: { blk: 'missing: 150' } },
        { text: 'The commit succeeds atomically. Orphan blocks from abandoned uploads are garbage-collected later when their refcount stays at zero past a grace period.', flow: ['api>meta', 'meta>mdb', 'meta>notif'], ok: ['mdb'], tone: 'ok' }
      ]
    },
    {
      id: 'fanout', title: 'Hot spot: 10K-member shared folder', tone: 'warn',
      steps: [
        { text: 'A file in a company-wide shared folder changes. <b>10,000 devices</b> watch that namespace.', flow: ['dA>api', 'api>meta', 'meta>mdb'], badges: { meta: '1 commit' } },
        { text: 'The notifier wakes all 10,000 long-polls. The message is tiny ("namespace X changed"), not the data.', flow: ['meta>notif', 'notif>dB'], warn: ['notif'], badges: { notif: ['10K wake-ups', 'warn'] }, tone: 'warn' },
        { text: 'Devices fetch the journal with <b>jittered</b> delays, so the metadata shard sees a spread-out wave rather than a spike. The journal read is cacheable by cursor.', flow: ['dB>api', 'api>meta'], badges: { dB: '+ jitter' } },
        { text: 'Everyone downloads the <b>same</b> new blocks. They are immutable and addressed by hash, so caches and CDNs absorb most of the reads.', flow: ['dB>api', 'api>blk', 'blk>bs'], ok: ['blk', 'bs'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Four core decisions. The file-size slider drives the "insert 1 KB near the start of the file" test.',
    controls: [
      { id: 'chunk', label: 'Chunking', type: 'seg', value: 'fixed', options: [
        { v: 'whole', l: 'Whole file' }, { v: 'fixed', l: 'Fixed 4 MB blocks' }, { v: 'cdc', l: 'Content-defined (rolling hash)' }] },
      { id: 'dedup', label: 'Dedup scope', type: 'seg', value: 'user', options: [
        { v: 'none', l: 'None' }, { v: 'user', l: 'Per user / team' }, { v: 'global', l: 'Global' }] },
      { id: 'conflict', label: 'Concurrent edits', type: 'seg', value: 'copy', options: [
        { v: 'lww', l: 'Last writer wins' }, { v: 'copy', l: 'Conflicted copy' }, { v: 'merge', l: 'Auto-merge (OT/CRDT)' }] },
      { id: 'notify', label: 'Change notification', type: 'seg', value: 'long', options: [
        { v: 'poll', l: 'Poll every 30 s' }, { v: 'long', l: 'Long-poll' }, { v: 'ws', l: 'WebSocket' }] },
      { id: 'size', label: 'File size', type: 'range', min: 4, max: 4096, step: 4, value: 512, fmt: (v) => v >= 1024 ? (v / 1024).toFixed(1) + ' GB' : v + ' MB' }
    ],
    evaluate(s) {
      const size = s.size * 1e6;
      // insert 1 KB at ~5% into the file
      const up = { whole: size, fixed: size * 0.95 + 4e6, cdc: 2 * 4e6 }[s.chunk];
      const upB = Math.min(size, up);
      const secs = upB * 8 / 20e6; // 20 Mbps uplink
      const saved = { none: 0, user: 0.08, global: 0.25 }[s.dedup]; // illustrative
      const idle = 1e6; // idle connected devices
      const load = { poll: idle / 30, long: idle / 60, ws: idle / 30 * 0.05 }[s.notify];
      const lag = { poll: '≈ 15 s avg (30 s worst)', long: '≈ 1 s', ws: '< 1 s' }[s.notify];
      const metrics = [
        { k: 'Re-upload after 1 KB insert', v: SD.fmt.bytes(upB) + ' of ' + SD.fmt.bytes(size), s: Math.max(0.05, 1 - upB / size) },
        { k: 'Upload time @ 20 Mbps', v: SD.fmt.dur(secs * 1000), s: secs < 5 ? 0.9 : secs < 60 ? 0.6 : 0.2 },
        { k: 'Storage saved by dedup (est.)', v: Math.round(saved * 100) + '%', s: 0.3 + saved * 2.5 },
        { k: 'Privacy / side-channel risk', v: { none: 'none', user: 'low: only your own files', global: 'leaks "someone has this file"' }[s.dedup], s: { none: 0.95, user: 0.85, global: 0.3 }[s.dedup] },
        { k: 'Edits lost on conflict', v: { lww: 'one edit silently lost', copy: 'none (user merges)', merge: 'none, only for known formats' }[s.conflict], s: { lww: 0.1, copy: 0.8, merge: 0.75 }[s.conflict] },
        { k: 'Change reaches other devices', v: lag, s: { poll: 0.35, long: 0.85, ws: 0.95 }[s.notify] },
        { k: 'Server requests / s per 1M idle devices', v: SD.fmt.num(load) + '/s', s: { poll: 0.3, long: 0.75, ws: 0.7 }[s.notify], hint: s.notify === 'ws' ? 'heartbeats + held sockets' : '' }
      ];
      const notes = [];
      if (s.chunk === 'fixed') notes.push('Fixed blocks are cheap and handle in-place edits (databases, VM images) well, but an <b>insertion</b> shifts every later byte, so every later block hash changes.');
      if (s.chunk === 'cdc') notes.push('A rolling hash over a small window picks boundaries from the <b>content</b>, so after an insert the boundaries re-align and only 1–2 chunks change. Costs CPU and gives variable-size chunks.');
      if (s.chunk === 'whole') notes.push('Whole-file sync is fine for small files, and terrible for large ones. It also gives up resumability and cross-file dedup.');
      if (s.dedup === 'global') notes.push('Cross-user dedup saves the most, but a skipped upload proves the file already exists somewhere. Mitigate with proof-of-ownership or per-tenant scope; client-side encryption makes global dedup impossible anyway.');
      if (s.conflict === 'merge') notes.push('Auto-merge needs to understand the format (text, a doc model). For arbitrary binary files there is no safe merge, so fall back to a conflicted copy.');
      if (s.conflict === 'lww') notes.push('Last-writer-wins with clock timestamps can drop the <i>newer</i> edit when device clocks disagree. Never acceptable for user files.');
      if (s.notify === 'poll') notes.push('Polling every 30 s from 1M idle devices is ~33K requests/s that almost always return "nothing new".');
      let verdict;
      if (s.conflict === 'lww') verdict = '❌ <b>Silent data loss.</b> Concurrent offline edits will overwrite each other.';
      else if (s.chunk === 'whole' && s.size >= 64) verdict = '⚠ <b>Bandwidth hog.</b> Every small edit re-uploads the whole file.';
      else if (s.notify === 'poll') verdict = '⚠ <b>Slow and wasteful.</b> Changes arrive late and idle clients still hammer the API.';
      else if (s.dedup === 'global') verdict = '👍 Maximum storage savings, but think hard about the <b>existence side-channel</b> before shipping it.';
      else if (s.chunk === 'cdc') verdict = '✅ <b>Bandwidth-optimal design:</b> content-defined chunks, scoped dedup, conflicted copies and push notifications.';
      else verdict = '✅ <b>Solid classic design:</b> fixed 4 MB SHA-256 blocks with separate block and metadata services (as Dropbox describes), push-style notifications and conflicted copies.';
      return {
        metrics, verdict, notes,
        labels: {
          dA: { label: 'Desktop client', sub: { whole: 'whole-file upload', fixed: 'fixed 4 MB chunks', cdc: 'rolling-hash chunks' }[s.chunk] },
          blk: { label: 'Block service', sub: { none: 'no dedup', user: 'dedup per user', global: 'global dedup' }[s.dedup] },
          notif: { label: 'Notifier', sub: { poll: 'clients poll / 30 s', long: 'long-poll', ws: 'WebSocket push' }[s.notify] }
        },
        hot: s.chunk === 'cdc' ? ['dA'] : [],
        warn: [].concat(s.dedup === 'global' ? ['blk'] : []).concat(s.notify === 'poll' ? ['notif'] : []),
        err: s.conflict === 'lww' ? ['meta'] : [],
        badges: { dA: [SD.fmt.bytes(upB) + ' ↑', upB / size > 0.5 ? 'warn' : 'ok'] },
        flow: ['dA>api', 'api>blk', 'blk>bs', 'api>meta', 'meta>mdb'].concat(s.notify === 'poll' ? ['dB>api'] : ['meta>notif', 'notif>dB'])
      };
    }
  },

  widget: {
    title: 'Fixed blocks vs content-defined chunks',
    caption: 'A file split two ways. <b>Insert bytes</b> near the start: fixed-size blocks all shift, so every later block gets a new hash and must be uploaded (red). A <b>Gear rolling hash</b> picks boundaries from the content, so they re-align right after the edit.'
  },

  realWorld: {
    intro: 'Dropbox has written in detail about its block format, its own storage system and its rewritten sync engine.',
    timeline: [
      { when: 'Jul 2014', who: 'Dropbox', title: 'Streaming sync and the blocklist', text: 'Every file is split into <b>4 MB blocks</b> (the last may be smaller). Each block is hashed with <b>SHA-256</b> and a file is identified by its ordered list of hashes, the <b>blocklist</b>. A block server maps hash → encrypted contents and knows nothing about users or files; a separate metadata server ties blocks to files. Streaming sync improved sync time by ~25%.', src: 0 },
      { when: '2016', who: 'Dropbox', title: '500 PB moved into Magic Pocket', text: 'Dropbox moved about <b>500 PB</b> of user data off third-party storage into its own system, Magic Pocket.', src: 2 },
      { when: 'May 2016', who: 'Dropbox', title: 'Inside the Magic Pocket', text: 'An <b>immutable</b> block store for encrypted chunks of up to <b>4 MB</b>; blocks never change once written. Built on spinning disks for cost and density, at <b>multi-exabyte</b> scale.', src: 1 },
      { when: 'Mar 2020', who: 'Dropbox', title: 'Nucleus: rewriting the sync engine', text: 'Dropbox rewrote the desktop sync engine, one of its oldest pieces of code, and shipped the new engine (Nucleus) to all users.', src: 3 },
      { when: 'Apr 2020', who: 'Dropbox', title: 'Three trees and randomized testing', text: 'Nucleus keeps a <b>Remote</b> tree, a <b>Local</b> tree and a <b>Synced</b> tree (the last fully synced state); the goal is for all three to converge. Rust\'s type system was used to "design away invalid states", and a test tool (CanopyCheck) generates random trees and checks the planner converges.', src: 4 },
      { when: 'Aug 2020', who: 'Dropbox', title: 'Broccoli: syncing less', text: 'Blocks are compressed with a modified <b>Brotli</b> that compresses ~3× faster than stock by working on chunks across cores. Hashes stay on the <b>uncompressed</b> block. Dropbox reported ~33% average daily bandwidth savings on uploads and ~35% lower median latency.', src: 6 },
      { when: '2022', who: 'Dropbox', title: 'Magic Pocket operations', text: 'A QCon talk describes Magic Pocket spread across three zones in the US and growing by adding new storage cells when capacity runs low.', src: 7 }
    ],
    lessons: [
      'Name bytes by their <b>hash</b>: dedup, integrity checks, caching and idempotent uploads come for free.',
      'Keep <b>metadata</b> (small, mutable, consistent) away from <b>blocks</b> (huge, immutable).',
      'Commit with an <b>optimistic version check</b>; on conflict, keep both copies.',
      'Model sync as converging <b>trees</b> and test it with randomized inputs.',
      'Push "something changed", then let clients pull the details.'
    ],
    sources: [
      { title: 'Streaming File Synchronization', url: 'https://dropbox.tech/infrastructure/streaming-file-synchronization', pub: 'Dropbox Tech Blog, 2014' },
      { title: 'Inside the Magic Pocket', url: 'https://dropbox.tech/infrastructure/inside-the-magic-pocket', pub: 'Dropbox Tech Blog, 2016' },
      { title: 'Scaling to exabytes and beyond: moving 500 petabytes of user data into our Magic Pocket', url: 'https://blog.dropbox.com/topics/technology/moving-500-petabytes-of-user-data-into-our-magic-pocket', pub: 'Dropbox Blog, 2016' },
      { title: 'Rewriting the heart of our sync engine', url: 'https://dropbox.tech/infrastructure/rewriting-the-heart-of-our-sync-engine', pub: 'Dropbox Tech Blog, Mar 2020' },
      { title: 'Testing sync at Dropbox', url: 'https://dropbox.tech/infrastructure/-testing-our-new-sync-engine', pub: 'Dropbox Tech Blog, Apr 2020' },
      { title: 'Dropbox testing its new sync engine', url: 'https://www.infoq.com/news/2020/04/dropbox-testing-sync-engine', pub: 'InfoQ, Apr 2020' },
      { title: 'Broccoli: Syncing faster by syncing less', url: 'https://dropbox.tech/infrastructure/-broccoli--syncing-faster-by-syncing-less', pub: 'Dropbox Tech Blog, Aug 2020' },
      { title: 'Magic Pocket: Dropbox\'s exabyte-scale blob storage system', url: 'https://www.infoq.com/articles/dropbox-magic-pocket-exabyte-storage', pub: 'InfoQ (QCon SF 2022 talk)' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Chunking', '<b>Fixed-size blocks</b>: cheap, simple, good for in-place edits', '<b>Content-defined chunks</b>: survive insertions, better dedup', 'Fixed for a first version; CDC when users edit large files with insertions'],
      ['Dedup scope', '<b>Per user / team</b>: no cross-tenant leaks', '<b>Global</b>: maximum savings', 'Per tenant unless you can prove ownership before skipping uploads'],
      ['Conflicts', '<b>Conflicted copy</b>: never loses data, works for any file', '<b>Auto-merge</b>: seamless, only for known formats', 'Copies for generic files; OT/CRDT inside docs editors'],
      ['Notifications', '<b>Long-poll</b>: plain HTTP, proxy-friendly', '<b>WebSocket</b>: lowest latency, stateful servers', 'Long-poll for desktop sync; sockets when you also need live presence'],
      ['Block storage', '<b>Cloud object store</b>: no hardware', '<b>Own blob store</b>: lower cost at EB scale', 'Own store only at very large, predictable scale (Dropbox\'s Magic Pocket)'],
      ['Metadata', '<b>Single SQL primary</b>: simple, consistent', '<b>Sharded by namespace</b>: scales out', 'Shard by namespace once one primary is saturated; cross-namespace moves become two-step']
    ]
  },
  failures: [
    { f: 'Client crashes mid-upload', detect: 'Commit never arrives', fix: 'Uploads are idempotent by hash; on restart, re-check and upload only missing blocks. Others never see partial files.' },
    { f: 'Concurrent offline edits', detect: 'Commit with stale <code>parent_rev</code> → 409', fix: 'Keep both: save a conflicted copy, download the winner.' },
    { f: 'Corrupted block on disk or in transit', detect: 'Re-hash on upload and on read; background scrubbing', fix: 'Reject on upload; repair from another replica or erasure-coded fragments.' },
    { f: 'Orphaned blocks', detect: 'Refcount zero after a grace period', fix: 'Garbage-collect, after the grace period, so in-flight commits are not broken.' },
    { f: 'Notification storm on a huge shared folder', detect: 'Fan-out size and metadata QPS spikes', fix: 'Small "changed" pings, jittered pulls, cursor-cacheable journal reads.' },
    { f: 'Metadata shard failover', detect: 'Replica health checks', fix: 'Promote a replica; clients retry commits (idempotent by parent rev + blocklist).' }
  ],

  interview: [
    { q: 'Why separate metadata from block storage?', a: '<p>They have opposite shapes. <b>Blocks</b> are huge, immutable and write-once, so they suit cheap blob storage and caching. <b>Metadata</b> (paths, revisions, journal) is tiny, mutable and needs strong consistency and transactions.</p><p>Separating them lets each scale independently and makes blocks safe to deduplicate and cache.</p>', lvl: 'core' },
    { q: 'How does delta sync work?', a: '<ul><li>Split the file into blocks and hash each.</li><li>Compare with the last synced blocklist to find changed blocks.</li><li>Ask the server which hashes it lacks (<code>blocks/check</code>).</li><li>Upload only those, then commit the new blocklist.</li></ul><p>A one-byte edit to a 1 GB file uploads one 4 MB block.</p>', lvl: 'core' },
    { q: 'Fixed-size blocks break on insertions. What is the fix?', a: '<p><b>Content-defined chunking</b>: slide a rolling hash (Rabin or Gear) over the bytes and cut a chunk where the hash matches a bit pattern, with min/max sizes. Boundaries depend on nearby content, so after an insertion they re-align and only 1–2 chunks change.</p>', lvl: 'core' },
    { q: 'How do you resolve conflicts?', a: '<p>Use <b>optimistic concurrency</b>: each commit carries <code>parent_rev</code>; the server applies it only if the file is still at that revision. The loser gets 409.</p><p>For generic files, keep both: save the loser as a <b>conflicted copy</b>. Only formats you understand (text, structured docs) can be auto-merged with OT/CRDTs.</p>', lvl: 'core' },
    { q: 'What are the security concerns with deduplication?', a: '<p>If the server skips an upload because it already has the hash, the client learns that <b>someone</b> stored that exact file: a side channel to test whether a known document exists. Holding a hash could also act as a key to download the file.</p><p>Mitigations: dedup only within a user or team, require proof of ownership, and authorize every block download through file metadata.</p>', lvl: 'deep' },
    { q: 'How do you upload a 50 GB file reliably?', a: '<p>Blocks are the unit of resumability. Upload them in parallel; each PUT is idempotent by hash. After a crash, call <code>blocks/check</code> again and continue. Only the final commit makes the new version visible, so no one ever sees a half-uploaded file.</p>', lvl: 'core' },
    { q: 'How do other devices learn about changes quickly?', a: '<p>Each device keeps a <b>cursor</b> into the journal and holds a <b>long-poll</b> (or socket) open. When a namespace changes, the notifier answers "changes available"; the device then calls <code>/changes?cursor</code> and downloads the needed blocks.</p><p>Polling every N seconds wastes requests and adds latency.</p>', lvl: 'core' },
    { q: 'How would you shard the metadata?', a: '<p>By <b>namespace</b> (a user\'s root or a shared folder): all files and the journal of one namespace live on one shard, so commits and cursors stay single-shard and strongly consistent. Moving a file between namespaces becomes a two-step operation.</p>', lvl: 'deep' },
    { q: 'How does the client know what to upload vs download after being offline?', a: '<p>Keep three trees: <b>remote</b> (server state), <b>local</b> (disk) and <b>synced</b> (last agreed state). Local ≠ synced means upload; remote ≠ synced means download; both changed means conflict. Dropbox\'s Nucleus engine uses this model.</p>', lvl: 'deep' },
    { q: 'How do you garbage-collect blocks?', a: '<p>Track references from file versions (refcount or periodic mark-and-sweep over blocklists). Delete only blocks that stayed unreferenced past a grace period, so uploads whose commit is still in flight are not broken. Version history retention determines when old blocks become unreferenced.</p>', lvl: 'deep' },
    { q: 'Should the client compress blocks?', a: '<p>Yes, for compressible data: less upload and storage. Hash the <b>uncompressed</b> bytes so dedup and integrity checks do not depend on the compressor version. Dropbox described doing this with a modified Brotli (Broccoli).</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Postgres: journal, versions and block index', lang: 'sql',
      code: `CREATE TABLE blocks (
  sha256    bytea  PRIMARY KEY CHECK (length(sha256) = 32),
  size      int    NOT NULL CHECK (size <= 4194304),
  location  text   NOT NULL,            -- cell / volume in the block store
  refcount  bigint NOT NULL DEFAULT 0
);

CREATE TABLE files (
  file_id      uuid    PRIMARY KEY,
  ns_id        bigint  NOT NULL,
  path         text    NOT NULL,
  current_rev  bigint  NOT NULL,
  UNIQUE (ns_id, path)
);

CREATE TABLE journal (                  -- append-only, per namespace
  ns_id       bigint  NOT NULL,
  journal_id  bigint  NOT NULL,         -- device cursor = last journal_id seen
  file_id     uuid    NOT NULL REFERENCES files,
  rev         bigint  NOT NULL,
  blocklist   bytea[] NOT NULL,         -- ordered SHA-256 hashes
  deleted     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ns_id, journal_id)
);

-- commit: succeeds only if nobody committed since parent_rev
UPDATE files SET current_rev = :parent_rev + 1
 WHERE file_id = :file_id AND current_rev = :parent_rev;
-- 1 row  -> INSERT INTO journal (...) in the same transaction
-- 0 rows -> 409 Conflict: client keeps a "conflicted copy"`,
      note: 'Allocate <code>journal_id</code> per namespace inside the commit transaction (e.g. from a per-namespace counter row) so cursors are gap-free.'
    },
    {
      title: 'Java: 4 MiB blocklist + delta upload', lang: 'java',
      code: `public record Block(long offset, int length, String sha256) {}

@Service
public class BlockUploader {
  static final int BLOCK = 4 * 1024 * 1024;
  private final RestClient api;                       // Spring Framework 6.1+
  public BlockUploader(RestClient api) { this.api = api; }

  public static List<Block> blocklist(Path file) throws IOException, NoSuchAlgorithmException {
    List<Block> out = new ArrayList<>();
    byte[] buf = new byte[BLOCK];
    try (InputStream in = new BufferedInputStream(Files.newInputStream(file))) {
      long off = 0;
      int n;
      while ((n = in.readNBytes(buf, 0, BLOCK)) > 0) {   // full blocks except the last
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        sha.update(buf, 0, n);
        out.add(new Block(off, n, HexFormat.of().formatHex(sha.digest())));
        off += n;
      }
    }
    return out;
  }

  public List<String> sync(Path file) throws Exception {
    List<Block> blocks = blocklist(file);
    List<String> hashes = blocks.stream().map(Block::sha256).toList();
    Set<String> missing = new HashSet<>(api.post().uri("/v1/blocks/check").body(hashes)
        .retrieve().body(new ParameterizedTypeReference<List<String>>() {}));
    try (RandomAccessFile raf = new RandomAccessFile(file.toFile(), "r")) {
      for (Block b : blocks) {
        if (!missing.remove(b.sha256())) continue;     // known (or already sent): skip
        byte[] data = new byte[b.length()];
        raf.seek(b.offset());
        raf.readFully(data);
        api.put().uri("/v1/blocks/{h}", b.sha256()).body(data)
           .retrieve().toBodilessEntity();              // idempotent: safe to retry
      }
    }
    return hashes;                                      // next: POST /v1/commit with parent_rev
  }
}`,
      note: 'Real clients hash from a stable snapshot (or re-check the file\'s mtime/size after reading), because a file can change while it is being chunked.'
    },
    {
      title: 'Python: content-defined chunking (Gear rolling hash)', lang: 'python',
      code: `import hashlib, random

_rng = random.Random(42)                       # same table on every client
GEAR = [_rng.getrandbits(64) for _ in range(256)]
M64 = (1 << 64) - 1

def cdc_chunks(data: bytes, avg=1 << 20, min_size=256 << 10, max_size=4 << 20):
    """FastCDC-style boundaries: cut where the top bits of the hash are zero."""
    bits = avg.bit_length() - 1
    mask = ((1 << bits) - 1) << (64 - bits)    # high bits mix the last ~64 bytes
    start, h = 0, 0
    for i, b in enumerate(data):
        h = ((h << 1) + GEAR[b]) & M64         # Gear: shift out old bytes, add new
        size = i - start + 1
        if (size >= min_size and (h & mask) == 0) or size >= max_size:
            yield data[start:i + 1]
            start, h = i + 1, 0
    if start < len(data):
        yield data[start:]

def blocklist(data: bytes) -> list[str]:
    return [hashlib.sha256(c).hexdigest() for c in cdc_chunks(data)]

# Insert bytes near the start: only the first chunk or two get new hashes.
a = random.randbytes(8 << 20)
b = a[:1000] + b"hello" + a[1000:]
print(len(set(blocklist(b)) - set(blocklist(a))), "new chunks")`,
      note: 'Pure Python is slow per byte; this shows the algorithm. Use a native implementation (e.g. a FastCDC library) in production.'
    }
  ],

  related: ['object-storage', 'collab-editing', 'notifications', 'kv-store', 'video-streaming', 'distributed-sql']
});
