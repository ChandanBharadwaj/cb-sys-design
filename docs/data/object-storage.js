SD.register({
  slug: 'object-storage',
  domain: 9,
  title: 'Object Storage',
  examples: 'Amazon S3, GFS, HDFS',
  tagline: 'Store trillions of blobs behind a flat <code>bucket/key</code> namespace, with <b>eleven nines of durability</b> at a cost per byte that 3× replication cannot reach. The trick is <b>erasure coding</b> plus fast repair.',
  tldr: {
    problem: 'At this scale disks fail every day, and keeping three full copies of exabytes is very expensive. Clients still expect a simple PUT / GET / LIST API, objects from bytes to terabytes, and reads that see the latest write.',
    idea: 'Split the system in two. <b>Metadata</b> (bucket/key → version → where the bytes are) lives in a sharded, strongly consistent index. <b>Data</b> is cut into stripes, and each stripe is <b>erasure-coded</b> into k data + m parity fragments spread over disks, racks and zones. Front ends are stateless. Big objects use <b>multipart upload</b>, and background <b>scrubbing</b> finds and repairs lost fragments.',
    insight: 'RS(k, m) survives <b>any m lost fragments</b> for (k+m)/k storage. RS(6,3) stores 1.5× and survives 3 losses, while 3× replication stores 3× and survives only 2. Durability then depends on <b>how quickly you repair</b> compared with how often disks fail, so repair is spread over many disks in parallel.',
    numbers: [
      { v: '11 nines', l: 'S3 durability design target, 99.999999999% (AWS)' },
      { v: '3.6 → 2.1', l: 'effective replication factor, Haystack → f4 with RS(10,4) + XOR (Facebook, 2014)' },
      { v: 'Dec 2020', l: 'S3 became strongly read-after-write consistent, LIST included (AWS)' }
    ]
  },

  intro: {
    what: 'Object storage keeps files, called <b>objects</b>, under a name such as <code>photos/cat.jpg</code> inside a <b>bucket</b>. You upload, download or delete whole objects over HTTP. There are no disks to manage and no space to run out of: it holds anything from a few bytes to terabytes, and is built so that <b>stored data is practically never lost</b>.',
    analogy: {
      icon: '🧩',
      title: 'A warehouse that stores every box as puzzle pieces',
      text: 'You hand a box to the warehouse desk and get back only a label; you never learn which shelf it sits on. Behind the desk, the warehouse cuts the contents into 6 pieces, makes 3 extra "spare" pieces, and stores all 9 in different buildings. <b>Any 6 of the 9</b> rebuild the original, so even losing a whole building loses nothing. Unlike real spares, these extra pieces are computed with math (erasure codes), not copied.'
    },
    problem: 'A photo app stores every user\'s pictures and videos: billions of files and petabytes (millions of gigabytes) of data, growing every day. With that many disks, some fail every single day, yet users expect a photo from ten years ago to still be there. Keeping three full copies of everything triples the bill. The core question is <b>how to store huge amounts of data so that nothing is lost, at the lowest cost per byte</b>.',
    story: [
      {
        stage: 'naive',
        title: 'Save uploads as files on one server',
        text: 'Put every upload on a file server with big disks and save it as a normal file, such as <code>/photos/123.jpg</code>. A web server reads and writes those files. It is easy and fine for a small app.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Photo app', sub: 'upload / view', kind: 'client', at: [70, 0] },
            { id: 'fe', label: 'Web server', sub: 'save as file', kind: 'service', at: [210, 110] },
            { id: 'enc', label: 'File server', sub: 'one big disk', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'cli', to: 'fe', bidi: true }, { from: 'fe', to: 'enc', bidi: true }],
          flow: ['cli>fe', 'fe>enc', 'enc>fe', 'fe>cli']
        }
      },
      {
        stage: 'breaks',
        title: 'Disks fill up, disks die, copies cost a fortune',
        text: 'One server runs out of space, so you add more and must track <b>which server holds which file</b>. With thousands of disks, some die every day, and a file on a dead disk is <b>gone</b>. Three full copies of everything fix that but <b>triple</b> the storage bill, and folders with millions of files get slow to list.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Photo app', sub: 'photo missing', kind: 'client', at: [70, 0] },
            { id: 'fe', label: 'Web server', sub: 'which server?', kind: 'service', at: [210, 110] },
            { id: 'enc', label: 'File server', sub: 'disk died', kind: 'store', at: [210, 220] },
            { id: 'copy', label: 'Full copies', sub: '3× the disks', kind: 'store', at: [350, 0] }
          ],
          edges: [{ from: 'cli', to: 'fe', bidi: true }, { from: 'fe', to: 'enc', bidi: true }, { from: 'fe', to: 'copy' }],
          flow: ['cli>fe', 'fe>enc', 'fe>copy'],
          err: ['enc'],
          warn: ['copy', 'cli'],
          badges: { enc: ['data lost', 'err'], copy: ['3× cost', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Separate the index, store coded pieces',
        text: 'A sharded <b>metadata index</b> maps each bucket and key to where its bytes live, and answers every lookup and listing. The bytes are cut into pieces and <b>erasure-coded</b>: for example 6 data pieces plus 3 parity pieces, spread across disks, racks and zones. Any 6 of the 9 rebuild the data, for only <b>1.5×</b> the space. Background <b>repair</b> rebuilds lost pieces before more failures pile up.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Photo app', sub: 'upload / view', kind: 'client', at: [70, 0] },
            { id: 'fe', label: 'Front end', sub: 'codes 6 + 3 pieces', kind: 'edge', at: [210, 110] },
            { id: 'meta', label: 'Metadata', sub: 'key → pieces', kind: 'store', at: [350, 0] },
            { id: 'z1', label: 'Zone A', sub: 'pieces 1, 4, 7', kind: 'store', at: [70, 220] },
            { id: 'z2', label: 'Zone B', sub: 'pieces 2, 5, 8', kind: 'store', at: [210, 220] },
            { id: 'z3', label: 'Zone C', sub: 'pieces 3, 6, 9', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'cli', to: 'fe', bidi: true }, { from: 'fe', to: 'meta', bidi: true }, { from: 'fe', to: 'z1' }, { from: 'fe', to: 'z2' }, { from: 'fe', to: 'z3' }],
          flow: ['cli>fe', ['fe>z1', 'fe>z2', 'fe>z3'], 'fe>meta', 'fe>cli'],
          ok: ['z1', 'z2', 'z3'],
          badges: { fe: ['1.5× space', 'ok'] }
        }
      }
    ],
    usedBy: ['Amazon S3', 'Google Cloud Storage', 'Azure Blob Storage', 'MinIO and Ceph (self-hosted)', 'Backups and data lakes', 'Photo and video storage behind apps'],
    whenToUse: [
      'Lots of files: photos, videos, backups, logs, data-lake tables',
      'Data is <b>written once and read many times</b>, as whole files or byte ranges',
      'You want to pay per byte stored and <b>never think about disks</b>'
    ],
    whenNot: [
      'Small records updated in place many times a second: use a database or a <a href="kv-store.html">Distributed Key-Value Store</a>',
      'Users edit and sync files across their devices: see <a href="file-sync.html">Cloud Storage &amp; File Sync</a>',
      'The same popular files must load fast worldwide: put a <a href="cdn.html">Content Delivery Network</a> in front'
    ],
    glossary: [
      { term: 'Bucket and key', def: 'A bucket is a named container; the key is the object\'s full name inside it, such as photos/2024/cat.jpg.' },
      { term: 'Metadata index', def: 'The strongly consistent table that maps each key and version to where its pieces are stored.' },
      { term: 'Erasure coding', def: 'Splitting data into k pieces and computing m extra parity pieces, so any k of the k + m can rebuild it.' },
      { term: 'RS(k, m)', def: 'Reed-Solomon code with k data and m parity pieces. RS(6,3) uses 1.5× the space and survives any 3 lost pieces.' },
      { term: 'Durability', def: 'The chance that stored data is never lost, often quoted in "nines" such as 99.999999999%.' },
      { term: 'Multipart upload', def: 'Uploading a big file as many parts in parallel, each retried on its own, then joining them into one object.' },
      { term: 'Scrubbing', def: 'Background re-reading of stored pieces to check their checksums and catch silent corruption early.' },
      { term: 'Read-after-write consistency', def: 'Once an upload succeeds, every later read or listing sees it, never an older version.' }
    ]
  },

  requirements: {
    functional: [
      'PUT / GET / DELETE an object by bucket + key, including range GET',
      'Multipart upload: parallel, resumable parts for large objects',
      'LIST by prefix with pagination',
      'Versioning and delete markers',
      'Lifecycle rules: tier to infrequent-access or archive, expire',
      'Presigned URLs for direct client upload and download'
    ],
    nonFunctional: [
      'Durability: 11 nines per object per year (design target)',
      'Availability 99.9–99.99% depending on tier',
      'Strong read-after-write and list-after-write consistency',
      'Throughput that scales with keys and prefixes',
      'Low cost per GB: HDDs plus erasure coding',
      'Objects from a few bytes to terabytes'
    ],
    outOfScope: ['POSIX semantics (rename, append, locks)', 'Edge delivery (see CDN)', 'Desktop sync clients (see File Sync)', 'Query engines over the data']
  },

  calculator: {
    inputs: [
      { id: 'data', label: 'Logical data stored', min: 1e12, max: 1e19, value: 1e16, fmt: 'bytes', log: true },
      { id: 'obj', label: 'Average object size', min: 1000, max: 1e9, value: 1e6, fmt: 'bytes', log: true },
      { id: 'k', label: 'Data fragments k (1 = replication)', min: 1, max: 20, value: 10 },
      { id: 'm', label: 'Parity fragments m (extra copies if k = 1)', min: 0, max: 6, value: 4 },
      { id: 'disk', label: 'Disk size', min: 4, max: 30, value: 20, unit: 'TB' },
      { id: 'afr', label: 'Annual disk failure rate', min: 0.5, max: 8, step: 0.5, value: 2, unit: '%' }
    ],
    outputs: [
      { label: 'Raw capacity ((k + m) / k ×)', fmt: 'bytes', f: (v) => v.data * (v.k + v.m) / v.k },
      { label: 'Storage overhead', fmt: 'raw', f: (v) => ((v.k + v.m) / v.k).toFixed(2) + '×  (survives any ' + v.m + ' lost)' },
      { label: 'Disks (80% full)', f: (v) => Math.ceil(v.data * (v.k + v.m) / v.k / (v.disk * 1e12 * 0.8)) },
      { label: 'Objects to index (metadata rows)', f: (v) => v.data / v.obj },
      { label: 'Expected disk failures per day', f: (v) => Math.ceil(v.data * (v.k + v.m) / v.k / (v.disk * 1e12 * 0.8)) * v.afr / 100 / 365 },
      { label: 'Repair reads per day (k per lost fragment)', fmt: 'bytes', f: (v) => Math.ceil(v.data * (v.k + v.m) / v.k / (v.disk * 1e12 * 0.8)) * v.afr / 100 / 365 * v.disk * 1e12 * 0.8 * v.k }
    ],
    note: 'Erasure coding saves space but makes <b>repair k times more expensive</b>: rebuilding one lost fragment means reading k surviving ones. Replication (k = 1) just copies. A 2% annual failure rate is an <em>estimate</em>; real fleets vary by drive model and age. Notice that at 10 PB you replace a disk most days.'
  },

  api: [
    { m: 'PUT', p: '/{bucket}/{key}', d: 'Single upload. The object becomes visible <b>atomically</b> once its data is durable and the metadata commit succeeds. A later GET or LIST sees it (strong consistency).' },
    { m: 'POST', p: '/{bucket}/{key}?uploads', d: 'Start a <b>multipart upload</b> and get an <code>uploadId</code>. Parts are then uploaded in parallel and retried independently. S3: 5 MiB to 5 GiB per part (the last part may be smaller), up to 10,000 parts.' },
    { m: 'PUT', p: '/{bucket}/{key}?partNumber=N&uploadId=…', d: 'Upload one part (often through a <b>presigned URL</b> straight from the browser). Returns an ETag per part.' },
    { m: 'POST', p: '/{bucket}/{key}?uploadId=…', d: 'Complete: send the list of (partNumber, ETag). Metadata stitches the parts into one object version in a single commit.' },
    { m: 'GET', p: '/{bucket}/{key}  Range: bytes=0-1048575', d: 'Look up the version → stripes → fragment locations, read the fragments needed, and stream. Range reads touch only the stripes that cover the range.' },
    { m: 'GET', p: '/{bucket}?list-type=2&prefix=photos/&continuation-token=…', d: 'LIST is a <b>range scan</b> over the sorted key index, up to 1,000 keys per page, continued with a token.' }
  ],
  dataModel: [
    { name: 'object_version', store: 'Metadata index (sharded by bucket + key range)', fields: [['bucket_id, key', 'composite', 'pk'], ['version_id', 'uuid', 'pk'], ['is_latest / delete_marker', 'bool', 'idx'], ['size, etag, storage_class', ''], ['layout', 'stripes → fragment locations']], note: 'Key-ordered so LIST by prefix is a range scan. Hot ranges split automatically.' },
    { name: 'stripe', store: 'Part of layout', fields: [['stripe_id', 'uuid', 'pk'], ['k, m', 'e.g. 6, 3'], ['fragments', '[(disk_id, checksum)] × (k+m)'], ['length', 'bytes']], note: 'Every fragment of one stripe goes to a different disk and rack, spread across availability zones.' },
    { name: 'fragment (on disk)', store: 'Storage node, append-only extents', fields: [['fragment_id', 'uuid', 'pk'], ['bytes', 'k-th of the stripe'], ['crc32c', 'checked on every read and scrub']], note: 'Storage nodes know nothing about keys, only fragments. S3\'s node software is ShardStore (Rust).' },
    { name: 'multipart_upload', store: 'Metadata', fields: [['upload_id', 'uuid', 'pk'], ['bucket_id, key', '', 'idx'], ['parts', '[(n, etag, size, layout)]'], ['initiated_at', 'ts']], note: 'Abandoned uploads keep using storage until a lifecycle rule aborts them.' }
  ],

  architecture: {
    title: 'Object storage architecture',
    nodes: [
      { id: 'cli', label: 'Client / SDK', sub: 'multipart · presigned', kind: 'client', wide: [90, 180], tall: [105, 0], tip: 'SDKs split big files into parts and upload them in parallel. Browsers can PUT parts directly with presigned URLs.' },
      { id: 'fe', label: 'Front end', sub: 'auth · stateless', kind: 'edge', wide: [290, 180], tall: [70, 105], tip: 'Authenticates (SigV4), applies bucket policy, and streams data to the encoder. Holds no state, so it scales out freely.' },
      { id: 'meta', label: 'Metadata index', sub: 'key → version → layout', kind: 'store', wide: [490, 60], tall: [210, 105], tip: 'Sharded by key range and strongly consistent. The commit point for every PUT and the source for every LIST.' },
      { id: 'life', label: 'Lifecycle', sub: 'rules · tiering', kind: 'service', wide: [690, 60], tall: [350, 105], tip: 'Scans metadata against bucket rules: move to infrequent access after 30 days, archive after 90, expire after 365, abort stale multipart uploads.' },
      { id: 'arch', label: 'Archive tier', sub: 'cold · hours to restore', kind: 'store', wide: [890, 60], tall: [315, 0], tip: 'Cheapest per GB. Reads need a restore step that takes minutes to hours.' },
      { id: 'enc', label: 'Erasure coder', sub: 'k data + m parity', kind: 'compute', wide: [490, 180], tall: [210, 210], tip: 'Splits each stripe into k data fragments and computes m parity fragments (Reed-Solomon). It is systematic: data fragments are the original bytes.' },
      { id: 'place', label: 'Placement', sub: 'disks · racks · AZs', kind: 'service', wide: [290, 310], tall: [70, 210], tip: 'Picks k+m disks in different failure domains, balancing fill level and heat (busy disks get fewer new writes).' },
      { id: 'az1', label: 'Storage AZ-a', sub: 'fragments 1, 4, 7', kind: 'store', wide: [690, 170], tall: [70, 315], tip: 'Storage nodes with many HDDs. Each disk holds fragments from millions of different stripes.' },
      { id: 'az2', label: 'Storage AZ-b', sub: 'fragments 2, 5, 8', kind: 'store', wide: [690, 280], tall: [210, 315], tip: 'A second availability zone: separate power, cooling and network.' },
      { id: 'az3', label: 'Storage AZ-c', sub: 'fragments 3, 6, 9', kind: 'store', wide: [690, 390], tall: [350, 315], tip: 'With RS(6,3), each AZ holds 3 of the 9 fragments, so losing a whole AZ still leaves the 6 needed to decode.' },
      { id: 'scrub', label: 'Scrub + repair', sub: 'checksums · rebuild', kind: 'compute', wide: [890, 280], tall: [210, 420], tip: 'Continuously re-reads fragments to catch silent corruption, and rebuilds fragments of failed disks onto healthy ones. Many disks share the work.' }
    ],
    edges: [
      { from: 'cli', to: 'fe', bidi: true },
      { from: 'fe', to: 'meta' },
      { from: 'fe', to: 'enc' },
      { from: 'enc', to: 'place', dashed: true },
      { from: 'enc', to: 'az1' },
      { from: 'enc', to: 'az2' },
      { from: 'enc', to: 'az3' },
      { from: 'scrub', to: 'az1', dashed: true, bidi: true },
      { from: 'scrub', to: 'az2', dashed: true, bidi: true },
      { from: 'scrub', to: 'az3', dashed: true, bidi: true },
      { from: 'meta', to: 'life', dashed: true },
      { from: 'life', to: 'arch' }
    ]
  },

  scenarios: [
    {
      id: 'put', title: 'PUT a large object: multipart + erasure coding', tone: 'info',
      steps: [
        { text: 'The client starts a <b>multipart upload</b> for a 2 GB video and gets an <code>uploadId</code>. It will send 32 parts of 64 MB in parallel, each retried on its own.', flow: ['cli>fe', 'fe>meta'], badges: { meta: 'uploadId' } },
        { text: 'Each part is cut into stripes. The coder writes 6 data fragments and computes 3 <b>Reed-Solomon parity</b> fragments: <b>RS(6,3), 1.5× storage</b>.', flow: ['cli>fe', 'fe>enc'], badges: { enc: '6 + 3' } },
        { text: '<b>Placement</b> picks 9 disks on 9 different racks, 3 in each zone, avoiding hot or nearly full disks.', flow: ['enc>place'], badges: { place: '3 per AZ' } },
        { text: 'Fragments are written with checksums. The part is acknowledged only once its fragments are durable.', flow: [['enc>az1', 'enc>az2', 'enc>az3']], ok: ['az1', 'az2', 'az3'], tone: 'ok' },
        { text: '<b>Complete</b>: one metadata commit turns 32 parts into one object version. Before this moment no reader sees the object; after it, every GET and LIST does.', flow: ['cli>fe', 'fe>meta'], ok: ['meta'], badges: { meta: ['v1 visible', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'get', title: 'GET: read fragments, decode if needed', tone: 'ok',
      steps: [
        { text: 'GET <code>videos/cat.mp4</code>. Metadata returns the latest version and, for each stripe, where its 9 fragments live.', flow: ['cli>fe', 'fe>meta'] },
        { text: 'Fast path: the code is <b>systematic</b>, so the 6 data fragments are the original bytes. Read them in parallel. No decoding is needed.', flow: ['fe>enc', ['enc>az1', 'enc>az2', 'enc>az3']], badges: { az1: 'D1 D4', az2: 'D2 D5', az3: 'D3 D6' } },
        { text: 'One disk is slow. The front end also asks for a parity fragment and uses the <b>first 6 of 7</b> that arrive. Any 6 of the 9 can rebuild the stripe, which cuts tail latency.', nodes: ['az2', 'enc'], warn: ['az2'], badges: { az2: ['slow disk', 'warn'], enc: 'decode with P1' } },
        { text: 'Range GETs read only the stripes covering the requested bytes. That is how video players seek without downloading everything.', flow: ['fe>cli'], tone: 'ok' }
      ]
    },
    {
      id: 'loss', title: 'Disk and AZ loss → repair from parity', tone: 'err',
      steps: [
        { text: 'A disk in AZ-a dies. It held one fragment from <b>millions of stripes</b>. Each of those stripes now has 8 of 9 fragments, still readable.', nodes: ['az1'], err: ['az1'], badges: { az1: ['disk lost', 'err'] }, tone: 'err' },
        { text: 'Repair: for each affected stripe, read any 6 surviving fragments, recompute the lost one and write it to a new disk. Hundreds of disks share the work, so it takes hours, not days.', flow: [['scrub>az2', 'scrub>az3'], 'scrub>az1'], ok: ['az1'], badges: { scrub: '6 reads per fragment' }, tone: 'ok' },
        { text: 'A whole AZ goes dark. RS(6,3) with 3 fragments per AZ leaves exactly 6, so data is <b>still readable</b>, but with zero margin. Repair gets top priority.', nodes: ['az1', 'az2', 'az3'], err: ['az1'], warn: ['az2', 'az3'], badges: { az1: ['AZ down', 'err'], az2: ['3 left', 'warn'], az3: ['3 left', 'warn'] }, tone: 'warn' },
        { text: 'Compare RS(10,4) over 3 AZs: 5 + 5 + 4 fragments, so losing one AZ removes 5 > 4. The data is <b>unreadable</b> until the AZ returns. Facebook\'s f4 used RS(10,4) <i>within</i> a datacenter and an XOR copy <i>across</i> datacenters.', nodes: ['az1'], err: ['az1'], tone: 'err' },
        { text: 'Meanwhile <b>scrubbing</b> keeps re-reading fragments and checking CRCs, to find silent corruption before a second failure hits the same stripe.', flow: [['scrub>az1', 'scrub>az2', 'scrub>az3']], tone: 'ok' }
      ]
    },
    {
      id: 'consistency', title: 'Read-after-write and list consistency', tone: 'warn',
      steps: [
        { text: 'Before December 2020, S3 overwrites and deletes were <b>eventually consistent</b>: a GET right after an overwrite could return the old version, and LIST could miss a new key.', flow: ['cli>fe', 'fe>meta'], warn: ['meta'], badges: { meta: ['old version?', 'warn'] }, tone: 'warn' },
        { text: 'Since then S3 gives <b>strong read-after-write consistency</b> for every PUT and DELETE, including LIST, automatically and at no extra cost.', flow: ['cli>fe', 'fe>meta'], ok: ['meta'], badges: { meta: ['latest ✓', 'ok'] }, tone: 'ok' },
        { text: 'In your own design: the metadata partition that owns a key is the <b>single point of truth</b>. Any cache in front must check the entry\'s version with the owner before serving it.', nodes: ['meta', 'fe'], badges: { fe: 'validate version' } },
        { text: 'Two writers on the same key: last writer wins. To avoid lost updates, use <b>conditional requests</b> (<code>If-None-Match: *</code>, <code>If-Match: etag</code>) where the store supports them.', flow: [['cli>fe', 'cli>fe'], 'fe>meta'], badges: { meta: '412 for one' }, tone: 'ok' }
      ]
    },
    {
      id: 'small', title: 'Small files and hot prefixes', tone: 'warn',
      steps: [
        { text: 'A team stores <b>2 billion 4 KB thumbnails</b>. Per object you pay a metadata row, a request and stripe overhead. Erasure-coding 4 KB into 9 fragments of ~700 B wastes I/O.', flow: ['cli>fe', 'fe>meta'], warn: ['meta'], badges: { meta: ['2B rows', 'warn'] }, tone: 'warn' },
        { text: '<b>Pack</b> small objects into large append-only volumes (Haystack, f4) and keep only <code>key → (volume, offset, length)</code> in the index. Erasure-code the <i>volume</i> once it is sealed.', flow: ['fe>enc', 'enc>az1'], ok: ['enc'], badges: { enc: 'pack → 1 GB' }, tone: 'ok' },
        { text: 'A burst of writes under one prefix (<code>logs/2026-10-30/</code>) lands on one metadata key range, which runs hot.', flow: [['cli>fe', 'cli>fe'], 'fe>meta'], err: ['meta'], badges: { meta: ['hot range', 'err'] }, tone: 'err' },
        { text: 'The index <b>splits hot ranges</b> automatically. Clients help by spreading keys across prefixes (for example a short hash prefix). Lifecycle later moves cold logs to the archive tier.', flow: ['meta>life', 'life>arch'], ok: ['meta'], badges: { meta: ['split', 'ok'], arch: '−90% cost' }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose the redundancy scheme, the consistency model, the storage tier, the chunk size, and how fast a lost disk is rebuilt. The durability meter uses a simple independent-failure model with a 2% annual disk failure rate.',
    controls: [
      { id: 'scheme', label: 'Redundancy', type: 'seg', value: 'rs63', options: [
        { v: 'rep3', l: '3× replication' }, { v: 'rs63', l: 'RS(6,3)' }, { v: 'rs104', l: 'RS(10,4)' }] },
      { id: 'cons', label: 'Consistency', type: 'seg', value: 'strong', options: [
        { v: 'eventual', l: 'Eventual (S3 before 2020)' }, { v: 'strong', l: 'Strong read-after-write' }] },
      { id: 'tier', label: 'Storage tier', type: 'seg', value: 'hot', options: [
        { v: 'hot', l: 'Standard (hot)' }, { v: 'ia', l: 'Infrequent access' }, { v: 'archive', l: 'Archive' }] },
      { id: 'chunk', label: 'Chunk / part size', type: 'seg', value: '64', options: [
        { v: '4', l: '4 MB' }, { v: '64', l: '64 MB (GFS)' }, { v: '256', l: '256 MB' }] },
      { id: 'rep', label: 'Time to rebuild a lost disk', type: 'range', min: 1, max: 72, step: 1, value: 24, unit: 'h' }
    ],
    evaluate(s) {
      const sc = { rep3: { k: 1, m: 2, n: 'replicas' }, rs63: { k: 6, m: 3 }, rs104: { k: 10, m: 4 } }[s.scheme];
      const n = sc.k + sc.m, lam = 0.02 / 8766;
      let ff = 1; for (let i = n - sc.m; i <= n; i++) ff *= i;          // n(n-1)…(n-m)
      const pLoss = ff * Math.pow(lam, sc.m + 1) * Math.pow(s.rep, sc.m) * 8766;
      const nines = -Math.log10(pLoss);
      const perAz = Math.ceil(n / 3);                                    // fragments in the fullest AZ
      const azOk = perAz <= sc.m;
      const over = n / sc.k;
      const tierCost = { hot: 1, ia: 0.55, archive: 0.1 }[s.tier];      // relative, illustrative
      const metaRows = 1e15 / (+s.chunk * 1e6);
      const metrics = [
        { k: 'Storage overhead', v: over.toFixed(1) + '× raw per logical byte', s: over <= 1.5 ? 0.9 : 0.3 },
        { k: 'Durability (model)', v: '≈ ' + nines.toFixed(1) + ' nines / object-year', s: Math.max(0.05, Math.min(1, (nines - 7) / 7)), hint: 'independent failures' },
        { k: 'Survives losing an AZ?', v: azOk ? 'yes: ' + perAz + ' of ' + n + ' fragments per AZ ≤ m = ' + sc.m : 'no: ' + perAz + ' fragments per AZ > m = ' + sc.m, s: azOk ? 0.9 : 0.15 },
        { k: 'Repair reads per lost TB', v: sc.k + ' TB' + (sc.k === 1 ? ' (copy)' : ' (read k fragments)'), s: sc.k === 1 ? 0.95 : sc.k <= 6 ? 0.6 : 0.4 },
        { k: 'Metadata rows per PB', v: SD.fmt.num(metaRows) + ' chunks', s: metaRows < 2e7 ? 0.85 : metaRows < 1e8 ? 0.6 : 0.3 },
        { k: 'Read after write', v: s.cons === 'strong' ? 'always the latest version' : 'may return the old version briefly', s: s.cons === 'strong' ? 0.9 : 0.35 },
        { k: 'Cost and first byte', v: tierCost + '× cost · ' + { hot: 'milliseconds', ia: 'ms + per-GB retrieval fee', archive: 'minutes to hours (restore)' }[s.tier], s: { hot: 0.55, ia: 0.75, archive: 0.6 }[s.tier] }
      ];
      const notes = [];
      if (s.scheme === 'rep3') notes.push('3× replication: cheapest repair (just copy) and simplest reads, at double the raw bytes of RS(6,3). Common for hot, small or frequently rewritten data.');
      if (s.scheme === 'rs63') notes.push('RS(6,3) is HDFS\'s default erasure-coding policy. 9 fragments over 3 AZs gives 3 per AZ, so a whole AZ can go and the data stays readable.');
      if (s.scheme === 'rs104') notes.push('RS(10,4) is the cheapest (1.4×), but 14 fragments over 3 AZs puts 5 in one AZ. f4 kept RS(10,4) inside one datacenter and added cross-datacenter XOR for an effective 2.1×.');
      if (s.rep >= 48) notes.push('Slow rebuilds leave a long window in which more failures can stack up. Parallel repair across many disks matters as much as the code you choose.');
      notes.push('The model assumes independent disk failures. In practice <b>correlated</b> failures (a rack, power, a bad firmware batch) dominate, which is why placement across failure domains matters.');
      if (s.chunk === '4') notes.push('Small chunks multiply metadata rows. GFS chose 64 MB so the master could keep all metadata in RAM.');
      if (s.tier === 'archive') notes.push('Archive tiers are cheap to store but need a restore before reading. Never put data your app reads synchronously there.');
      let verdict;
      if (!azOk) verdict = '⚠ <b>Cheapest, but an AZ outage makes data unreadable.</b> Add parity, use more AZs, or add a cross-AZ copy.';
      else if (s.cons === 'eventual') verdict = '⚠ <b>Durable, but surprising to apps:</b> read-your-writes failures cause subtle bugs. Make the metadata path strongly consistent.';
      else if (nines < 11) verdict = '⚠ <b>Below 11 nines in this model.</b> Rebuild faster or add parity.';
      else if (s.scheme === 'rs63') verdict = '✅ <b>Balanced:</b> 1.5× storage, survives a whole AZ, and 11+ nines with fast repair.';
      else verdict = '👍 Durable and consistent. The meters show what you pay in bytes and repair traffic.';
      const fr = (az) => { const ids = []; for (let i = az; i < n; i += 3) ids.push(i < sc.k ? 'D' + (i + 1) : (sc.k === 1 ? 'R' : 'P') + (i - sc.k + 1)); return ids; };
      return {
        metrics, verdict, notes,
        flow: ['cli>fe', ['fe>enc', 'fe>meta'], ['enc>az1', 'enc>az2', 'enc>az3']].concat(s.tier !== 'hot' ? ['meta>life', 'life>arch'] : []),
        labels: {
          enc: { label: s.scheme === 'rep3' ? 'Replicator' : 'Erasure coder', sub: s.scheme === 'rep3' ? '3 full copies' : 'RS(' + sc.k + ',' + sc.m + ') · ' + s.chunk + ' MB' },
          az1: { label: 'Storage AZ-a', sub: fr(0).join(' ') }, az2: { label: 'Storage AZ-b', sub: fr(1).join(' ') }, az3: { label: 'Storage AZ-c', sub: fr(2).join(' ') },
          meta: { label: 'Metadata index', sub: s.cons === 'strong' ? 'strongly consistent' : 'cached · eventual' },
          life: { label: 'Lifecycle', sub: s.tier === 'hot' ? 'rules · tiering' : 'moving → ' + (s.tier === 'ia' ? 'IA' : 'archive') }
        },
        hot: s.tier !== 'hot' ? ['life', 'arch'] : [],
        warn: (azOk ? [] : ['az1', 'az2', 'az3']).concat(s.cons === 'eventual' ? ['meta'] : []),
        badges: { enc: [over.toFixed(1) + '×', over <= 1.5 ? 'ok' : 'warn'], scrub: [nines.toFixed(1) + ' nines', nines >= 11 ? 'ok' : 'warn'] }
      };
    }
  },

  widget: {
    title: 'Reed-Solomon: fail disks, read, repair',
    caption: 'A sentence is split into k data fragments, and m parity fragments are computed with real <b>Reed-Solomon over GF(2⁸)</b> (Cauchy matrix). Fragments are spread over 3 AZs. <b>Tap a disk</b> or fail a whole AZ, then <b>Read</b> (decode from any k survivors) or <b>Repair</b>. The durability model below updates live.'
  },

  realWorld: {
    intro: 'Object storage went from replicated chunks with one master to erasure-coded fragments behind sharded metadata.',
    timeline: [
      { when: '2003', who: 'Google', title: 'GFS (SOSP)', text: 'A single master keeps all metadata in memory. Files are split into <b>64 MB chunks</b>, each stored <b>3 times</b> by default, and data flows directly between clients and chunkservers, never through the master.', src: 0 },
      { when: '2010', who: 'AWS', title: '11 nines, stated', text: 'When introducing Reduced Redundancy Storage, AWS restated that an object in standard S3 is designed for <b>99.999999999% durability</b>. It remains the headline S3 durability target.', src: 1 },
      { when: '2014', who: 'Facebook', title: 'f4: warm BLOB storage (OSDI)', text: 'Haystack used 3 replicas on RAID-6, an effective <b>3.6×</b>. f4 stores sealed warm volumes with <b>RS(10,4)</b> (1.4×) in each datacenter, and an XOR across 3 datacenters brings it to <b>2.1×</b> (2.8× without the XOR).', src: 2 },
      { when: '2017', who: 'Apache Hadoop', title: 'HDFS erasure coding (Hadoop 3)', text: 'Default policy <b>RS-6-3-1024k</b>. The docs compare 3× replication\'s <b>200% overhead</b> with no more than 50% for typical EC setups, and note that RS(6,3) needs at least 3 racks.', src: 3 },
      { when: 'Dec 2020', who: 'AWS', title: 'S3 strong consistency', text: 'All GET, PUT and LIST operations became <b>strongly consistent</b> for all objects in all regions, automatically and at no extra cost. Before that, overwrites and deletes were eventually consistent.', src: 4 },
      { when: '2021', who: 'AWS', title: 'ShardStore (SOSP)', text: 'S3\'s new storage-node software, written in <b>Rust</b>, checked with <b>lightweight formal methods</b>: executable reference models plus property-based testing. The paper reports it kept 16 issues, including crash-consistency bugs, out of production.', src: 5 },
      { when: '2023', who: 'AWS', title: 'Building a "pretty big" storage system', text: 'Andy Warfield\'s FAST keynote and post: S3 runs on huge fleets of hard drives whose random-I/O rate has barely improved for decades. Spreading each customer\'s data over very many drives is what turns slow disks into high aggregate throughput.', src: 6 },
      { when: 'Dec 2025', who: 'AWS', title: 'S3 objects up to 50 TB', text: 'The maximum object size rose <b>tenfold, from 5 TB to 50 TB</b>. Multipart limits stayed at 10,000 parts of at most 5 GiB, so big uploads must pick a larger part size.', src: 8 }
    ],
    lessons: [
      'Separate <b>metadata</b> (small, strongly consistent, sharded) from <b>data</b> (huge, immutable fragments).',
      'Erasure coding cuts bytes by half or more compared with 3×, but costs <b>CPU, repair reads and tail latency</b>.',
      'Durability is a race between failures and <b>parallel repair</b>. Place fragments across real failure domains.',
      'Correctness of the storage node itself matters: S3 invested in formal methods for ShardStore.'
    ],
    sources: [
      { title: 'The Google File System (paper)', url: 'https://courses.cs.washington.edu/courses/cse490h/11wi/CSE490H_files/gfs.pdf', pub: 'SOSP 2003 (course copy)' },
      { title: 'New Amazon S3 Reduced Redundancy Storage (RRS)', url: 'https://aws.amazon.com/blogs/aws/new-amazon-s3-reduced-redundancy-storage-rrs', pub: 'AWS News Blog, 2010' },
      { title: 'f4: Facebook\'s Warm BLOB Storage System', url: 'https://www.usenix.org/conference/osdi14/technical-sessions/presentation/muralidhar', pub: 'USENIX OSDI 2014' },
      { title: 'HDFS Erasure Coding', url: 'https://hadoop.apache.org/docs/r3.4.0/hadoop-project-dist/hadoop-hdfs/HDFSErasureCoding.html', pub: 'Apache Hadoop docs' },
      { title: 'Amazon S3 now delivers strong read-after-write consistency automatically for all applications', url: 'https://aws.amazon.com/about-aws/whats-new/2020/12/amazon-s3-now-delivers-strong-read-after-write-consistency-automatically-for-all-applications', pub: 'AWS What\'s New, Dec 2020' },
      { title: 'Using Lightweight Formal Methods to Validate a Key-Value Storage Node in Amazon S3', url: 'https://www.cs.utexas.edu/~bornholt/papers/shardstore-sosp21.pdf', pub: 'SOSP 2021' },
      { title: 'Building and operating a pretty big storage system called S3', url: 'https://www.allthingsdistributed.com/2023/07/building-and-operating-a-pretty-big-storage-system.html', pub: 'All Things Distributed, 2023' },
      { title: 'Amazon S3 multipart upload limits', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html', pub: 'Amazon S3 user guide' },
      { title: 'Amazon S3 increases the maximum object size to 50 TB', url: 'https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-s3-maximum-object-size-50-tb/', pub: 'AWS What\'s New, Dec 2025' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Redundancy', '<b>3× replication</b>: 3.0×, survives 2 losses, cheap repair, fast reads', '<b>RS(6,3)</b> 1.5× (survives 3) / <b>RS(10,4)</b> 1.4× (survives 4)', 'Replication for hot or small objects; EC for large, warm or cold data'],
      ['Code width', '<b>Narrow</b> (6+3): spreads over 3 AZs evenly, cheaper repair', '<b>Wide</b> (10+4 or wider): less overhead', 'Narrow across zones; wide within a zone plus cross-zone protection'],
      ['Metadata', '<b>Single master in RAM</b> (GFS): simple', '<b>Sharded, replicated index</b>: scales to trillions of keys', 'A master for millions of files; a sharded index for object-store scale'],
      ['Consistency', '<b>Eventual</b>: caches anywhere, simple', '<b>Strong read-after-write</b>: no surprises for apps', 'Strong. Apps assume it, and S3 made it the default in 2020'],
      ['Small objects', '<b>One object = one stripe</b>: simple', '<b>Pack into volumes</b> (Haystack, f4): fewer files and I/Os', 'Pack when the median object is a few KB'],
      ['Upload path', '<b>Through your service</b>: easy to inspect', '<b>Presigned multipart direct to storage</b>: no proxy bandwidth', 'Presigned for user uploads; your service only signs and records metadata']
    ]
  },
  failures: [
    { f: 'Disk failure', detect: 'I/O errors, heartbeats, SMART', fix: 'Rebuild its fragments from k survivors per stripe, spread across many disks for speed.' },
    { f: 'Silent corruption (bit rot)', detect: 'CRC mismatch on read or scrub', fix: 'Treat the fragment as lost and rebuild it from the others. Scrub continuously.' },
    { f: 'AZ outage', detect: 'Zone health, mass node loss', fix: 'Place ≤ m fragments per AZ so reads still decode, then repair with top priority once you have spare capacity.' },
    { f: 'Hot key range in metadata', detect: 'Partition latency and throttling', fix: 'Split ranges automatically. Clients add a hash prefix to spread keys.' },
    { f: 'Abandoned multipart uploads', detect: 'Storage growth with no visible objects', fix: 'A lifecycle rule <code>AbortIncompleteMultipartUpload</code> after N days.' },
    { f: 'Repair storm after a big outage', detect: 'Repair backlog and network saturation', fix: 'Prioritise stripes with the fewest surviving fragments and throttle the rest.' },
    { f: 'Orphaned fragments', detect: 'Raw bytes on disk exceed what metadata references (a PUT wrote data, then its metadata commit failed)', fix: 'Background mark-and-sweep: delete fragments no metadata version references, after a grace period longer than any in-flight upload.' },
    { f: 'Accidental delete or overwrite', detect: 'Audit logs, user report', fix: 'Versioning plus object lock / retention; restore the previous version.' }
  ],

  interview: [
    { q: 'Where does "11 nines" come from?', a: '<p>99.999999999% annual durability means an expected loss of about 1 in 10¹¹ objects per year. If you store 10 million objects, you might lose one every 10,000 years on average.</p><p>You get there by modelling disk failure rate λ, repair time T and the code: a stripe is lost only if m + 1 of its n fragments fail within overlapping repair windows. Roughly, P(loss per year) ≈ hours per year × n(n−1)…(n−m) · λ<sup>m+1</sup> · T<sup>m</sup>. Shorter T or larger m adds nines quickly. Real systems also budget for correlated failures, software bugs and operator error.</p>', lvl: 'core' },
    { q: 'Erasure coding vs replication?', a: '<ul><li><b>3× replication</b>: 3.0× bytes, survives 2 lost copies, repair = copy 1×, reads hit one disk.</li><li><b>RS(6,3)</b>: 1.5× bytes, survives <i>any</i> 3 lost fragments, repair reads 6 fragments per lost one, reads touch 6 disks.</li><li><b>RS(10,4)</b>: 1.4×, survives 4.</li></ul><p>EC wins on cost for big, cold data. Replication wins on latency, repair cost and small objects.</p>', lvl: 'core' },
    { q: 'How do you scale the metadata?', a: '<p>Separate it from data. Store <code>(bucket, key) → version → layout</code> in a sorted, <b>range-sharded</b>, replicated index (Raft or Paxos per shard). Sorted order makes LIST-by-prefix a range scan. Hot ranges split. GFS\'s single in-memory master only worked because chunks were 64 MB and files were few.</p>', lvl: 'core' },
    { q: 'What is the small-file problem, and how do you fix it?', a: '<p>Billions of tiny objects mean billions of metadata rows, per-object request overhead and wasteful stripes (4 KB cut into 9 fragments).</p><p>Fix: <b>pack</b> small objects into large append-only volumes and index <code>key → (volume, offset, length)</code>, as Haystack and f4 do. Erasure-code whole sealed volumes, and compact them to reclaim deleted space.</p>', lvl: 'core' },
    { q: 'How does multipart upload work, and why use it?', a: '<p>Initiate to get an uploadId, upload parts (5 MiB to 5 GiB each in S3, at most 10,000 of them) in parallel with independent retries, then <b>complete</b> with the list of part ETags. The object appears atomically at complete.</p><p>Benefits: throughput, resumability, and uploading before you know the final size. Presigned part URLs let browsers upload directly, without your servers proxying the bytes.</p>', lvl: 'core' },
    { q: 'How can you put 9 fragments in 3 AZs and survive an AZ loss?', a: '<p>Put at most m fragments in each AZ. RS(6,3) puts 3 in each, so an AZ loss leaves exactly 6 = k and the data stays readable. RS(10,4) has 14 fragments, 5 in at least one AZ, so it cannot survive that AZ without extra cross-zone protection.</p>', lvl: 'deep' },
    { q: 'Why is repair the hard part of erasure coding?', a: '<p>Rebuilding one lost fragment reads <b>k</b> others, so a 20 TB disk failure under RS(10,4) causes ~200 TB of reads across the cluster. Mitigations: parallel repair across many disks, prioritising stripes with the fewest survivors, local reconstruction codes (LRC) that repair from a smaller group, and throttling so repair does not starve user traffic.</p>', lvl: 'deep' },
    { q: 'How would you provide strong read-after-write consistency?', a: '<p>Make the metadata commit the linearization point: data fragments are written first, then one atomic metadata update makes the new version visible. Every read resolves the key through the owning metadata partition, or validates any cached entry against it.</p><p>S3 has done this for all operations, including LIST, since December 2020.</p>', lvl: 'deep' },
    { q: 'How do you detect silent data corruption?', a: '<p>Store a checksum (e.g. CRC32C) per fragment, plus an end-to-end checksum of the object from the client (ETag or Content-MD5 / CRC headers). Verify on every read, and run a background <b>scrubber</b> that re-reads everything periodically. A bad fragment counts as lost and is rebuilt from parity.</p>', lvl: 'core' },
    { q: 'Object storage vs a file system vs block storage?', a: '<ul><li><b>Block</b>: raw volumes for one host (databases).</li><li><b>File</b>: hierarchy with POSIX semantics (rename, append, locks), harder to scale.</li><li><b>Object</b>: flat keys, whole-object PUT, HTTP API, near-infinite scale and cheap durability.</li></ul><p>Rename in an object store is copy + delete. Do not treat it like a file system.</p>', lvl: 'core' },
    { q: 'How do storage tiers and lifecycle rules cut cost?', a: '<p>Access frequency drops with age. Lifecycle rules move objects to infrequent-access classes (cheaper storage, retrieval fee) and then to archive classes (much cheaper, restore takes minutes to hours), and finally expire them. The metadata stays in the index; only the bytes move.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Spring Boot: presigned multipart upload (AWS SDK v2)', lang: 'java',
      code: `// software.amazon.awssdk:s3 2.x. For MinIO: S3Client.builder().endpointOverride(uri).forcePathStyle(true)
@Service
public class UploadService {
  private static final String BUCKET = "media";
  private static final long MIN_PART = 64L * 1024 * 1024;  // S3: 5 MiB..5 GiB per part, max 10,000 parts
  private final S3Client s3;
  private final S3Presigner presigner;

  public UploadService(S3Client s3, S3Presigner presigner) { this.s3 = s3; this.presigner = presigner; }

  public record Started(String uploadId, long partSize, List<URL> partUrls) {}

  public Started start(String key, long size) {
    long part = Math.max(MIN_PART, (size + 9_999) / 10_000);  // grow parts so ≤ 10,000 of them
    int parts = (int) ((size + part - 1) / part);
    String uploadId = s3.createMultipartUpload(b -> b.bucket(BUCKET).key(key)).uploadId();
    List<URL> urls = IntStream.rangeClosed(1, parts)
        .mapToObj(n -> presigner.presignUploadPart(p -> p
                .signatureDuration(Duration.ofMinutes(30))
                .uploadPartRequest(u -> u.bucket(BUCKET).key(key).uploadId(uploadId).partNumber(n)))
            .url())
        .toList();
    return new Started(uploadId, part, urls);    // the browser PUTs each part straight to S3
  }

  /** etags: partNumber → ETag header returned by each part PUT. */
  public void complete(String key, String uploadId, Map<Integer, String> etags) {
    List<CompletedPart> parts = etags.entrySet().stream()
        .sorted(Map.Entry.comparingByKey())
        .map(e -> CompletedPart.builder().partNumber(e.getKey()).eTag(e.getValue()).build())
        .toList();
    s3.completeMultipartUpload(b -> b.bucket(BUCKET).key(key).uploadId(uploadId)
        .multipartUpload(m -> m.parts(parts)));    // object becomes visible atomically here
  }
}`,
      note: 'The bucket\'s CORS rule must expose the <code>ETag</code> header to the browser. Add a lifecycle rule that aborts incomplete multipart uploads after a few days.'
    },
    {
      title: 'Python: the durability model behind "nines"', lang: 'python',
      code: `from math import log10, prod

HOURS_PER_YEAR = 8766

def annual_loss_prob(k: int, m: int, afr: float, repair_h: float) -> float:
    """P(a k+m stripe loses data in a year): one fragment fails, then m more of the
    others fail before repair finishes. Assumes independent failures (optimistic)."""
    n = k + m
    lam = afr / HOURS_PER_YEAR                       # per-disk failure rate per hour
    rate = prod(range(n - m, n + 1)) * lam ** (m + 1) * repair_h ** m   # n(n-1)…(n-m)
    return rate * HOURS_PER_YEAR

for name, k, m in [("3x replication", 1, 2), ("RS(6,3)", 6, 3), ("RS(10,4)", 10, 4)]:
    p = annual_loss_prob(k, m, afr=0.02, repair_h=24)
    print(f"{name:15} {(k + m) / k:.1f}x  survives {m}  ~{-log10(p):.1f} nines")

# 3x replication  3.0x  survives 2  ~9.4 nines
# RS(6,3)         1.5x  survives 3  ~11.0 nines
# RS(10,4)        1.4x  survives 4  ~13.4 nines
# With repair_h=1 replication reaches ~12.2 nines: repair speed matters as much as the code.`
    },
    {
      title: 'Postgres: versioned metadata + LIST by prefix', lang: 'sql',
      code: `CREATE TABLE objects (
  bucket_id     bigint      NOT NULL,
  key           text        COLLATE "C" NOT NULL,   -- byte order: prefixes are ranges
  version_id    uuid        NOT NULL DEFAULT gen_random_uuid(),
  is_latest     boolean     NOT NULL,
  delete_marker boolean     NOT NULL DEFAULT false,
  size          bigint      NOT NULL,
  etag          text        NOT NULL,
  layout        jsonb       NOT NULL,                 -- stripes → fragment → disk
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_id, key, version_id)
);
CREATE UNIQUE INDEX one_latest ON objects (bucket_id, key) WHERE is_latest;

-- Commit point of a PUT (fragments are already durable). A concurrent PUT of the
-- same key hits one_latest and retries: last writer wins.
BEGIN;
UPDATE objects SET is_latest = false WHERE bucket_id = $1 AND key = $2 AND is_latest;
INSERT INTO objects (bucket_id, key, is_latest, size, etag, layout) VALUES ($1, $2, true, $3, $4, $5);
COMMIT;

-- LIST prefix 'photos/2026/' with keyset pagination ('/' + 1 = '0')
SELECT key, size, etag
  FROM objects
 WHERE bucket_id = $1 AND is_latest AND NOT delete_marker
   AND key >= 'photos/2026/' AND key < 'photos/20260'
   AND key > $2                                     -- continuation token = last key
 ORDER BY key
 LIMIT 1000;`
    }
  ],

  related: ['file-sync', 'cdn', 'kv-store', 'video-streaming', 'distributed-sql', 'web-crawler']
});
