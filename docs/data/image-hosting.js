SD.register({
  slug: 'image-hosting',
  domain: 4,
  title: 'Image Hosting & Thumbnails',
  examples: 'Instagram, Pinterest, Imgix',
  tagline: 'Take a 12 MB phone photo, strip what must not leak, and serve it at <b>the right width and format for every screen</b> from a cache, without storing or computing a thousand copies.',
  tldr: {
    problem: 'One upload is viewed at a dozen sizes on hundreds of device types, in three formats. Pre-making every copy wastes storage on photos nobody opens. Making copies on request costs CPU, adds first-view latency, and invites anyone to request a million odd sizes.',
    idea: 'Upload <b>straight to object storage</b> with a presigned URL, clean the image once in a worker, then serve <b>immutable, versioned URLs</b> through a CDN. Small thumbnails are pre-generated; other sizes are <b>resized on the first miss</b> from an allow-list (or signed URLs), with request collapsing and a derivative cache.',
    insight: 'The original is the only thing you must never lose. Every thumbnail is a <i>cache entry</i> you can rebuild, so the real decisions are <b>which ones to keep</b>, <b>which sizes to allow</b>, and <b>who pays the first resize</b>.',
    numbers: [
      { v: '4 sizes', l: 'stored per uploaded photo at Facebook (Haystack, 2009 post)' },
      { v: '65.5%', l: 'of photo requests served by the browser cache (Facebook trace, SOSP 2013)' },
      { v: '3.6× → 2.1×', l: 'effective replication, hot Haystack → warm f4 (Facebook, OSDI 2014)' }
    ]
  },

  intro: {
    what: 'An image hosting system takes photos people upload and serves them back to everyone who looks at them. It keeps the <b>original safely</b>, makes <b>smaller copies</b> (thumbnails) for small screens, and delivers each viewer the right size and file format quickly from a server near them.',
    analogy: {
      icon: '🖼️',
      title: 'A photo lab that keeps the negative in a vault',
      text: 'A photo lab stores your negative in a vault and makes prints on request: wallet size, postcard, poster. Popular sizes are printed ahead of time and kept on the counter, and rare sizes are printed when someone asks. The vault is the original, the prints are thumbnails, and the counter is the cache. Unlike paper prints, digital copies cost nothing to duplicate once made, so the expensive part is the first print of each size.'
    },
    problem: 'A phone uploads a 12-megapixel photo. A feed shows it 360 pixels wide, a laptop shows it 1,080 pixels wide, and older browsers cannot decode the newest formats. If you send everyone the original, phones download megabytes for a tiny tile and the photo\'s hidden GPS location goes with it. <b>How do you give every screen a small, correct, private copy, fast, without storing or computing every possible copy?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Upload to the app server, serve the one file',
        text: 'The phone sends the photo to your <b>app server</b>, which writes it to disk. Every viewer downloads that same file, and the browser scales it down. It is one file, one URL, and simple code.',
        scene: {
          nodes: [
            { id: 'ph', label: 'Phone', sub: 'uploads 12 MB', kind: 'client', at: [70, 0] },
            { id: 'viewer', label: 'Viewer', sub: 'feed tile 360 px', kind: 'client', at: [350, 0] },
            { id: 'app', label: 'App server', sub: 'store + serve', kind: 'service', at: [210, 110] },
            { id: 'disk', label: 'Disk', sub: 'one big file', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'ph', to: 'app' }, { from: 'viewer', to: 'app', bidi: true }, { from: 'app', to: 'disk' }],
          flow: ['ph>app', 'app>disk', 'viewer>app']
        }
      },
      {
        stage: 'breaks',
        title: 'Slow feeds, busy servers, leaked locations',
        text: 'Uploads tie up app servers for seconds each. A feed of 30 photos becomes <b>hundreds of megabytes</b> on a phone. Resizing on every request melts the CPU. Worse, the file still carries <b>EXIF metadata</b>: the GPS spot where it was taken.',
        scene: {
          nodes: [
            { id: 'ph', label: 'Phone', sub: 'uploads 12 MB', kind: 'client', at: [70, 0] },
            { id: 'viewer', label: 'Viewer', sub: 'feed tile 360 px', kind: 'client', at: [350, 0] },
            { id: 'app', label: 'App server', sub: 'store + serve', kind: 'service', at: [210, 110] },
            { id: 'disk', label: 'Disk', sub: 'one big file', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'ph', to: 'app' }, { from: 'viewer', to: 'app', bidi: true }, { from: 'app', to: 'disk' }],
          flow: [['ph>app', 'viewer>app'], 'app>disk', ['ph>app', 'viewer>app']],
          err: ['app'],
          warn: ['viewer'],
          badges: { app: ['overloaded', 'err'], viewer: ['12 MB per tile', 'warn'], disk: ['GPS inside', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Upload direct, clean once, resize at the edge',
        text: 'The phone uploads <b>directly to storage</b> using a short-lived signed link. A worker fixes rotation and <b>removes the metadata</b>. Viewers ask a CDN for the exact width and format they need. A resizer makes each copy <b>once</b>, and after that it comes from cache.',
        scene: {
          nodes: [
            { id: 'ph', label: 'Phone', sub: 'upload direct', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'Upload API', sub: 'signs upload link', kind: 'service', at: [210, 0] },
            { id: 'viewer', label: 'Viewer', sub: 'feed tile 360 px', kind: 'client', at: [350, 0] },
            { id: 'store', label: 'Storage', sub: 'clean originals', kind: 'store', at: [70, 110] },
            { id: 'work', label: 'Worker', sub: 'rotate, strip EXIF', kind: 'compute', at: [210, 110] },
            { id: 'cdn', label: 'CDN', sub: 'size + format', kind: 'edge', at: [350, 110] },
            { id: 'rsz', label: 'Resizer', sub: 'once per size', kind: 'compute', at: [350, 220] }
          ],
          edges: [{ from: 'ph', to: 'api' }, { from: 'ph', to: 'store' }, { from: 'store', to: 'work', bidi: true }, { from: 'viewer', to: 'cdn' }, { from: 'cdn', to: 'rsz' }, { from: 'rsz', to: 'store' }],
          flow: ['ph>api', 'ph>store', ['store>work', 'viewer>cdn'], 'cdn>rsz', 'rsz>store'],
          ok: ['cdn', 'work'],
          badges: { cdn: ['640 w AVIF', 'ok'], work: ['EXIF gone', 'ok'] }
        }
      }
    ],
    usedBy: ['Instagram', 'Facebook', 'Pinterest', 'Imgix', 'Cloudinary', 'Cloudflare Images'],
    whenToUse: [
      'Users upload photos that many other people view, on many screen sizes',
      'You need thumbnails, crops or format conversion without editing every file by hand',
      'Images must stay private or be deletable, yet still load fast from a CDN'
    ],
    whenNot: [
      'Video: it needs segmenting and adaptive bitrate (see <a href="video-streaming.html">Video Streaming</a>)',
      'A few dozen images on a static site: resize them at build time and ship the files',
      'Keeping a user\'s own files in sync across devices (see <a href="file-sync.html">Cloud Storage & File Sync</a>)'
    ],
    glossary: [
      { term: 'Presigned URL', def: 'A URL signed by your server that lets one client upload (or download) one object directly from storage for a few minutes, with no other credentials.' },
      { term: 'Derivative (variant)', def: 'A copy of the original made by resizing, cropping or re-encoding it, such as the 320-pixel-wide WebP.' },
      { term: 'EXIF', def: 'Metadata inside a photo file: camera model, rotation, time and often the GPS location where it was taken.' },
      { term: 'Perceptual hash', def: 'A short fingerprint of what an image looks like, so near-identical copies (resized, recompressed) have hashes that differ in only a few bits.' },
      { term: 'srcset', def: 'An HTML attribute that lists several widths of one image so the browser can download the smallest one that looks sharp.' },
      { term: 'Content negotiation', def: 'The browser says which formats it can decode in the Accept header, and the server picks one; Vary: Accept tells caches the response depends on it.' },
      { term: 'Request collapsing', def: 'When many requests for the same missing item arrive at once, only one does the work and the others wait for its result.' },
      { term: 'Immutable URL', def: 'A URL whose content never changes (it contains a version), so caches can keep it for a year without checking back.' }
    ]
  },

  requirements: {
    functional: [
      'Upload photos up to ~50 MB from mobile and web, with resume',
      'Validate, fix orientation and strip private metadata before anything is public',
      'Serve any allowed width in the best format the client supports',
      'Moderation and duplicate detection before a photo is published',
      'Private / unlisted photos via expiring links',
      'Delete or hide a photo everywhere, including CDN copies'
    ],
    nonFunctional: [
      'Cached image p95 &lt; 50 ms; a new size &lt; 500 ms on first view',
      'Upload to visible in a few seconds',
      'Originals never lost (eleven-nines object storage)',
      '≥ 90% of image requests served by browser or CDN caches',
      'Resize cost bounded: nobody can force unlimited CPU',
      'Storage cost per photo falls as the photo ages'
    ],
    outOfScope: ['Video and animated formats (see Video Streaming)', 'Feed ranking (see Newsfeed)', 'Erasure coding internals (see Object Storage)', 'In-app photo editing UI']
  },

  calculator: {
    inputs: [
      { id: 'uploads', label: 'Photos uploaded per day', min: 100000, max: 1000000000, value: 100000000, log: true },
      { id: 'orig', label: 'Average original size', min: 500000, max: 20000000, step: 100000, value: 3000000, fmt: 'bytes' },
      { id: 'variants', label: 'Derivatives kept per photo', min: 1, max: 40, value: 8 },
      { id: 'vsize', label: 'Average derivative size', min: 10000, max: 400000, step: 5000, value: 80000, fmt: 'bytes' },
      { id: 'views', label: 'Image requests per day', min: 10000000, max: 1000000000000, value: 20000000000, log: true },
      { id: 'hit', label: 'Browser + CDN hit ratio', min: 50, max: 99.9, step: 0.1, value: 95, unit: '%' }
    ],
    outputs: [
      { label: 'Uploads / second (average)', f: (v) => v.uploads / 86400 },
      { label: 'Upload ingress', fmt: 'bytesps', f: (v) => (v.uploads * v.orig) / 86400 },
      { label: 'New bytes per day (originals + derivatives, 1 copy)', fmt: 'bytes', f: (v) => v.uploads * (v.orig + v.variants * v.vsize) },
      { label: 'Image requests / second (average)', f: (v) => v.views / 86400 },
      { label: 'Requests reaching resizer / storage per second', f: (v) => (v.views / 86400) * (1 - v.hit / 100) },
      { label: 'CDN egress (average)', fmt: 'bytesps', f: (v) => (v.views * v.vsize) / 86400 }
    ],
    note: 'All inputs are <em>estimates</em> for a large photo app, not any company\'s figures. Two things stand out. Derivatives are a <b>small share of bytes</b> next to the originals, so the storage argument for lazy resizing is mostly about the long tail of sizes and formats. And even at a 95% hit ratio, the <b>miss stream</b> is tens of thousands of requests per second, which is why collapsing and a derivative cache matter. Facebook measured about 90% of photo traffic absorbed by browser, edge and origin caches in 2013.'
  },

  api: [
    { m: 'POST', p: '/v1/uploads', d: 'Body <code>{content_type, size, sha256?}</code>. Creates an image row in <code>PENDING</code> and returns <code>{image_id, put_url}</code>: a presigned PUT valid ~10 min for one key, bound to the type and a size limit (a presigned POST policy can enforce <code>content-length-range</code>).' },
    { m: 'PUT', p: '{put_url} (object storage)', d: 'The client sends the bytes <b>directly to the quarantine bucket</b>. Large files use multipart parts so a dropped connection resumes, not restarts.' },
    { m: 'POST', p: '/v1/uploads/{id}/complete', d: 'Client callback. The bucket\'s <code>ObjectCreated</code> event is the backup signal. Both enqueue the same job; a conditional <code>PENDING → PROCESSING</code> update makes it idempotent.' },
    { m: 'GET', p: '/v1/images/{id}', d: 'Status (<code>PROCESSING / READY / BLOCKED</code>), width, height, version, dominant colour (placeholder), and ready-made <code>srcset</code> URLs.' },
    { m: 'GET', p: 'img.cdn/i/{sig}/{id}/{ver}/w{width}', d: 'The image. <code>sig</code> = HMAC of the path; width must be on the allow-list. The format comes from <code>Accept</code> (AVIF → WebP → JPEG). Response: <code>Cache-Control: public, max-age=31536000, immutable</code> and <code>Vary: Accept</code>.' },
    { m: 'DELETE', p: '/v1/images/{id}', d: 'Marks <code>DELETED</code>, bumps the version, purges the CDN by surrogate key <code>img-{id}</code>, and queues deletion of derivatives and the original.' }
  ],
  dataModel: [
    { name: 'images', store: 'Postgres (sharded by image_id)', fields: [['image_id', 'int64 (Snowflake)', 'pk'], ['owner_id', 'int64', 'idx'], ['status', 'enum'], ['version', 'int'], ['sha256', 'bytea', 'idx'], ['dhash / pdq', 'bigint / 256 bit', 'idx'], ['width, height', 'int'], ['visibility', 'public | private'], ['orig_key, tier', 'text, hot|warm|cold']], note: 'The source of truth for URLs: <code>version</code> is in every URL, so an edit (crop, rotate) creates new URLs instead of invalidating caches.' },
    { name: 'originals', store: 'Object storage (content-addressed)', fields: [['key', 'sha256 of clean bytes', 'pk'], ['bytes', 'blob'], ['refcount', 'int'], ['storage class', 'hot → warm (EC) → cold']], note: 'Cleaned originals only (EXIF stripped). The raw upload in the quarantine bucket is deleted after processing.' },
    { name: 'derivatives', store: 'Object store or KV with LRU / TTL', fields: [['key', 'id/ver/w/format', 'pk'], ['bytes', 'blob'], ['last_hit', 'ts'], ['created_by', 'eager | lazy']], note: 'A cache, not a record: anything here can be rebuilt from the original, so it can be evicted freely.' }
  ],

  architecture: {
    title: 'Image hosting: upload, process, serve',
    nodes: [
      { id: 'client', label: 'App / browser', sub: 'upload · srcset', kind: 'client', wide: [90, 110], tall: [210, 0], tip: 'Uploads directly to storage with a presigned URL. Renders images with srcset/sizes so the browser picks the width.' },
      { id: 'raw', label: 'Quarantine bucket', sub: 'raw uploads, private', kind: 'store', wide: [290, 0], tall: [350, 105], tip: 'Receives untrusted bytes. Nothing here is ever served. Objects are deleted after processing or after a short lifecycle TTL.' },
      { id: 'q', label: 'Upload events', sub: 'ObjectCreated + /complete', kind: 'queue', wide: [490, 0], tall: [350, 210], tip: 'Both the storage event and the client callback land here. At-least-once, so the worker must be idempotent.' },
      { id: 'proc', label: 'Image workers', sub: 'validate · EXIF · hash', kind: 'compute', wide: [700, 0], tall: [350, 315], tip: 'Sniff magic bytes, decode with a pixel limit in a sandbox, apply EXIF orientation, strip metadata, compute SHA-256 and a perceptual hash, encode eager thumbnails.' },
      { id: 'mod', label: 'Moderation', sub: 'hash match + classifier', kind: 'ml', wide: [900, 0], tall: [350, 420], tip: 'Exact-hash and perceptual-hash matching against known bad content, then ML classifiers. Can block before the image is ever public.' },
      { id: 'api', label: 'Image API', sub: 'presign · metadata', kind: 'service', wide: [290, 110], tall: [70, 105], tip: 'Issues presigned upload URLs, owns image state, signs transform URLs, handles delete and privacy changes.' },
      { id: 'meta', label: 'Image metadata', sub: 'Postgres · version', kind: 'store', wide: [600, 110], tall: [70, 210], tip: 'image_id, owner, status, version, hashes, dimensions, storage tier.' },
      { id: 'cdn', label: 'CDN edge', sub: 'key: path + format', kind: 'edge', wide: [290, 220], tall: [210, 105], tip: 'Caches each derivative under its immutable URL plus a normalised format bucket from Accept. Tiered caching and anycast are covered on the CDN page.' },
      { id: 'rsz', label: 'Resizer', sub: 'resize on miss', kind: 'compute', wide: [490, 220], tall: [210, 210], tip: 'Verifies the URL signature and width allow-list, collapses concurrent requests for the same key, fetches the original, resizes and encodes.' },
      { id: 'deriv', label: 'Derivative cache', sub: 'LRU, regenerable', kind: 'cache', wide: [490, 330], tall: [70, 315], tip: 'Stores generated variants so a CDN eviction does not cost another resize. Safe to lose: everything here can be rebuilt.' },
      { id: 'orig', label: 'Original store', sub: 'clean, content hash', kind: 'store', wide: [900, 220], tall: [210, 420], tip: 'The only data that must never be lost. Object storage with erasure coding (see Object Storage).' },
      { id: 'cold', label: 'Warm / cold tier', sub: 'EC after ~90 days', kind: 'store', wide: [900, 330], tall: [70, 420], tip: 'Older originals move to cheaper erasure-coded or archive storage. Facebook moved cooled BLOBs from Haystack to f4.' }
    ],
    edges: [
      { from: 'client', to: 'api', bidi: true },
      { from: 'client', to: 'raw' },
      { from: 'raw', to: 'q' },
      { from: 'q', to: 'proc' },
      { from: 'proc', to: 'mod', bidi: true },
      { from: 'proc', to: 'meta' },
      { from: 'proc', to: 'orig' },
      { from: 'api', to: 'meta' },
      { from: 'client', to: 'cdn', bidi: true },
      { from: 'cdn', to: 'rsz' },
      { from: 'rsz', to: 'deriv', bidi: true },
      { from: 'rsz', to: 'orig' },
      { from: 'orig', to: 'cold' },
      { from: 'api', to: 'cdn', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'upload', title: 'Upload: presigned PUT → clean → ready', tone: 'info',
      steps: [
        { text: '<code>POST /uploads</code>. The API writes a <b>PENDING</b> row and returns a <b>presigned PUT URL</b>: valid ~10 minutes, for one key, one content type and a size cap.', flow: ['client>api', 'api>meta'], badges: { meta: 'PENDING' } },
        { text: 'The phone sends the bytes <b>straight to the quarantine bucket</b>. App servers never hold a 12 MB body; a dropped connection retries only the failed part.', flow: ['client>raw'], badges: { raw: '12 MB' } },
        { text: 'Two "done" signals: the bucket\'s <b>ObjectCreated event</b> and the client\'s <code>/complete</code>. Both are queued; <code>UPDATE … WHERE status = \'PENDING\'</code> lets only the first one start work.', flow: [['raw>q', 'client>api'], 'q>proc'], badges: { q: '2 signals → 1 job' } },
        { text: 'The worker sniffs <b>magic bytes</b> (not the file name), decodes under a <b>pixel limit</b>, bakes the <b>EXIF rotation</b> into the pixels, then re-encodes <b>without metadata</b>. The GPS location is gone.', nodes: ['proc'], badges: { proc: ['EXIF stripped', 'ok'] } },
        { text: '<b>Moderation hook.</b> The exact SHA-256 and a <b>perceptual hash</b> are matched against known bad images; a classifier scores the rest. A block sets <b>BLOCKED</b>, and no URL is ever issued.', flow: ['proc>mod', 'mod>proc'], badges: { mod: 'pass' } },
        { text: 'The clean original is stored under its <b>content hash</b> (an identical re-upload is stored once). The small grid thumbnails are encoded <b>eagerly</b>, and the row flips to <b>READY</b>, version 1.', flow: [['proc>orig', 'proc>meta']], ok: ['orig', 'meta'], badges: { meta: ['READY v1', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'serve', title: 'First view of a new size', tone: 'ok',
      steps: [
        { text: 'The page lists <code>srcset</code> widths 320…1440. A 360 px slot on a 2× screen needs ~720 px, so the browser asks for <code>w1080</code> with <code>Accept: image/avif,…</code>.', flow: ['client>cdn'], badges: { cdn: 'MISS' } },
        { text: 'The edge key is <b>path + format bucket</b> (avif / webp / jpeg) normalised from Accept, not the raw header. Otherwise every browser version would split the cache.', flow: ['cdn>rsz'] },
        { text: 'The resizer checks the <b>HMAC signature</b> and the <b>width allow-list</b>, then the <b>derivative cache</b>: miss.', flow: ['rsz>deriv'], badges: { deriv: 'miss' } },
        { text: 'It fetches the original, decodes, resizes with a good filter, sharpens a little and encodes AVIF. That costs <b>tens to hundreds of ms of CPU</b>, once per key.', flow: ['rsz>orig'], badges: { rsz: 'resize ×1' }, warn: ['rsz'] },
        { text: 'The derivative is stored and returned with <code>Cache-Control: public, max-age=31536000, immutable</code> and <code>Vary: Accept</code>. The next million views are edge or browser hits.', flow: ['rsz>deriv', 'rsz>cdn', 'cdn>client'], ok: ['cdn'], badges: { cdn: ['HIT from now on', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'viral', title: 'Hot spot: a viral photo, seconds old', tone: 'warn',
      steps: [
        { text: 'A celebrity posts. Tens of thousands of phones open it within seconds, from hundreds of PoPs, <b>before any derivative of the new photo exists</b>.', flow: [['client>cdn', 'client>cdn']], warn: ['cdn'], badges: { cdn: ['MISS everywhere', 'warn'] }, tone: 'warn' },
        { text: 'Tiered caching shrinks this to a few shield fetches (see the CDN page), but the resizer still gets a <b>burst of identical misses</b> for <code>42/1/w1080.avif</code>.', flow: ['cdn>rsz'], warn: ['rsz'], badges: { rsz: ['burst', 'warn'] } },
        { text: '<b>Request collapsing:</b> the first request for the key becomes the leader. The others wait on its result. Without it, each one decodes the same 12 MP original.', nodes: ['rsz'], ok: ['rsz'], badges: { rsz: ['1 resize, 299 wait', 'ok'] } },
        { text: 'The leader stores the derivative and every waiter gets the same bytes. For accounts with huge followings, you can also <b>pre-warm</b> the 2–3 feed sizes at upload time.', flow: ['rsz>deriv', 'rsz>cdn', 'cdn>client'], ok: ['cdn', 'deriv'], tone: 'ok' }
      ]
    },
    {
      id: 'abuse', title: 'Failure: arbitrary sizes as a DoS', tone: 'err',
      steps: [
        { text: 'An attacker loops <code>?w=1, 2, 3 … 5000</code> on an <b>unsigned</b> transform URL. Every URL is a new cache key, so every request misses the CDN.', flow: ['client>cdn', 'cdn>rsz'], err: ['cdn'], badges: { cdn: ['0% hit', 'err'] }, tone: 'err' },
        { text: 'Each miss fetches and decodes a 12 MP original. The resizer pool hits <b>100% CPU</b>, and real users\' first views time out.', flow: ['rsz>orig'], err: ['rsz'], badges: { rsz: ['CPU 100%', 'err'] }, tone: 'err' },
        { text: 'Collateral damage: the derivative cache fills with junk sizes and <b>evicts the real ones</b>, so even popular images need resizing again.', nodes: ['deriv'], err: ['deriv'], badges: { deriv: ['evicting', 'err'] }, tone: 'err' },
        { text: 'Fix: <b>sign every transform URL</b> (HMAC over the path, checked in constant time) and keep a <b>width allow-list</b>. Forged or off-list requests get a <b>403</b> before any CPU is spent.', flow: ['client>cdn', 'cdn>rsz'], ok: ['rsz', 'cdn'], badges: { rsz: ['403 forged', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'delete', title: 'Delete or make private', tone: 'warn',
      steps: [
        { text: 'The owner deletes photo 42 (or makes it private). The API sets <b>DELETED</b> and bumps the <b>version</b> in one transaction, so no new page will contain the old URL.', flow: ['client>api', 'api>meta'], badges: { meta: 'DELETED v2' } },
        { text: 'One <b>purge by surrogate key</b> (<code>img-42</code>) removes every width × format from the CDN, without listing them.', flow: ['api>cdn'], badges: { cdn: ['purged', 'ok'] } },
        { text: 'A sweeper deletes the derivatives and then the original (dropping a refcount if it was deduplicated). Warm, sealed volumes reclaim the space later, during compaction.', nodes: ['deriv', 'orig', 'cold'], badges: { deriv: 'deleted', orig: 'refcount −1' } },
        { text: 'A purge cannot pull back <b>browser caches, downloads or screenshots</b>. That is why private images use <b>short-lived signed URLs</b> with <code>Cache-Control: private</code>, never the public immutable URL.', nodes: ['client'], warn: ['client'], badges: { client: ['copies remain', 'warn'] }, tone: 'warn' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real design decision. The numbers use one illustrative model: a 6-width allow-list (160…2048 px), JPEG ≈ 0.20, WebP ≈ 0.14 and AVIF ≈ 0.10 bytes per pixel, and AVIF encoding ≈ 8× the CPU of JPEG. All of these are <em>estimates</em>.',
    controls: [
      { id: 'strategy', label: 'When derivatives are made', type: 'seg', value: 'hybrid', options: [
        { v: 'eager', l: 'Eager: all at upload' }, { v: 'hybrid', l: 'Hybrid: thumbs eager, rest lazy' }, { v: 'lazy', l: 'Lazy: resize on first miss' }] },
      { id: 'sizes', label: 'Which sizes may be requested', type: 'seg', value: 'signed', options: [
        { v: 'allow', l: 'Allow-list (6 widths)' }, { v: 'signed', l: 'Signed transform URLs' }, { v: 'any', l: 'Any ?w= (unsigned)' }] },
      { id: 'formats', label: 'Formats served', type: 'seg', value: 'avif', options: [
        { v: 'jpeg', l: 'JPEG only' }, { v: 'webp', l: '+ WebP' }, { v: 'avif', l: '+ WebP + AVIF (Accept)' }] },
      { id: 'collapse', label: 'Request collapsing at the resizer', type: 'seg', value: 'on', options: [
        { v: 'off', l: 'Off' }, { v: 'on', l: 'On (single-flight)' }] },
      { id: 'tiers', label: 'Originals storage', type: 'seg', value: 'warm', options: [
        { v: 'hot', l: 'All hot (3 replicas)' }, { v: 'warm', l: 'Hot → warm EC after 90 d' }, { v: 'cold', l: 'Hot → archive after 90 d' }] }
    ],
    evaluate(s) {
      const W = [160, 320, 640, 1080, 1440, 2048];
      const BPP = { jpeg: 0.20, webp: 0.14, avif: 0.10 };
      const CPU = { jpeg: 1, webp: 2, avif: 8 };
      const fm = { jpeg: ['jpeg'], webp: ['jpeg', 'webp'], avif: ['jpeg', 'webp', 'avif'] }[s.formats];
      const best = fm[fm.length - 1];
      const bytes = (w, f) => 0.75 * w * w * BPP[f];
      const encMs = (w, f) => 25 * (w / 1080) * (w / 1080) * CPU[f];
      const sum = (ws, g) => ws.reduce((a, w) => a + fm.reduce((b, f) => b + g(w, f), 0), 0);
      const small = W.slice(0, 2), large = W.slice(2);
      const LAZY = 0.25;                       // share of possible variant bytes ever requested (estimate)
      const eager = s.strategy === 'eager';
      const sizeF = eager ? 1 : { allow: 1, signed: 1.4, any: Infinity }[s.sizes];
      let deriv, upCpu;
      if (eager) { deriv = sum(W, bytes); upCpu = 30 + sum(W, encMs); }
      else if (s.strategy === 'hybrid') { deriv = sum(small, bytes) + LAZY * sum(large, bytes) * sizeF; upCpu = 30 + sum(small, encMs); }
      else { deriv = LAZY * sum(W, bytes) * sizeF; upCpu = 30; }
      const kb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(2) + ' MB' : Math.round(b / 1e3) + ' KB');
      const resizeMs = Math.round(40 + 30 + encMs(1080, best) + 30);
      const coldLazy = !eager && s.tiers === 'cold';
      const nVar = W.length * fm.length;
      const exact = !eager && s.sizes !== 'allow';
      const perView = bytes(1080, best) * (exact ? 1 : 1.3);
      const costIdx = { hot: 100, warm: 55, cold: 25 }[s.tiers];
      const metrics = [
        { k: 'Derivative bytes / photo', v: isFinite(deriv) ? kb(deriv) + (eager ? ' (all ' + nVar + ' variants)' : ' (expected)') : 'unbounded', s: !isFinite(deriv) ? 0.05 : deriv > 2e6 ? 0.35 : deriv > 1e6 ? 0.55 : 0.85, hint: eager ? 'paid for every photo' : 'only what is viewed' },
        { k: 'Encode CPU at upload', v: '≈ ' + Math.round(upCpu) + ' ms / photo', s: upCpu > 1000 ? 0.25 : upCpu > 300 ? 0.55 : 0.9, hint: eager ? 'even for never-viewed photos' : 'validation + few thumbs' },
        { k: 'First view of a new size', v: eager ? '≈ 70 ms (stored variant)' : coldLazy ? resizeMs + ' ms; old photos: hours' : '≈ ' + resizeMs + ' ms (resize)', s: eager ? 0.9 : coldLazy ? 0.1 : resizeMs > 250 ? 0.5 : 0.7, hint: coldLazy ? 'archive restore' : '' },
        { k: 'Viral burst, 200 misses', v: s.collapse === 'on' ? (eager ? '1 store read' : '1 resize') : (eager ? '≈ 200 store reads' : '≈ 200 resizes'), s: s.collapse === 'on' ? 0.92 : eager ? 0.55 : 0.12, hint: 'per key, per region' },
        { k: 'Bytes per view (1080 slot)', v: kb(perView) + ' ' + best.toUpperCase(), s: perView < 110e3 ? 0.9 : perView < 160e3 ? 0.65 : 0.35, hint: exact ? 'exact width' : 'snapped up to allow-list' },
        { k: 'Size-abuse exposure', v: eager ? 'none: no resize on read' : { allow: 'bounded: ' + nVar + ' keys / photo', signed: 'none: forged URL → 403', any: 'unbounded: attacker picks w' }[s.sizes], s: eager || s.sizes === 'signed' ? 0.95 : s.sizes === 'allow' ? 0.85 : 0.05 },
        { k: 'Originals storage cost', v: 'index ' + costIdx + { hot: ' (3 full copies)', warm: ' (RS 10+4 when cold)', cold: ' (archive class)' }[s.tiers], s: costIdx / 100 > 0.9 ? 0.35 : costIdx > 40 ? 0.7 : 0.9, hint: 'hot = 100, estimate' }
      ];
      const notes = [];
      if (eager) notes.push('Facebook\'s 2009 design stored <b>4 sizes</b> of every photo at upload. Eager is simple and has no first-view penalty, but it pays storage and encode CPU for photos nobody opens, and adding a new size later means a backfill job over every photo.');
      if (s.strategy === 'hybrid') notes.push('Hybrid: the grid thumbnails every photo needs are made at upload (≈ ' + Math.round(sum(small, encMs)) + ' ms). Larger sizes are made on first request, and only for the photos people actually open.');
      if (s.strategy === 'lazy') notes.push('Lazy keeps upload fast and storage minimal, but the <b>first viewer of every size pays the resize</b>. The feed size for a brand-new post is almost always requested, so it is usually worth making that one eagerly.');
      if (s.sizes === 'any' && !eager) notes.push('Thumbor\'s docs describe this exact attack: a user "can easily ask for other sizes in loops". Use signed URLs (Thumbor <code>SECURITY_KEY</code>, imgix <code>s=</code>) or an allow-list.');
      if (s.sizes === 'signed') notes.push('Signing lets designers pick any width in templates without a deploy, because only your servers can mint URLs. The cost: more distinct sizes cached (×1.4 here, an estimate), and you must handle signing-key rotation.');
      if (s.formats === 'avif') notes.push('AVIF is about 2× smaller than JPEG here but ~8× the encode CPU (estimate). Wolt\'s engineering blog reports a slow AVIF speed setting took up to 3–4 s per image, too slow for on-demand encoding, so pick a fast encoder speed for lazy resizes.');
      if (s.formats === 'jpeg') notes.push('One format means no <code>Vary: Accept</code> and one cache key per width, but every view is about twice the bytes of AVIF.');
      if (s.collapse === 'off' && !eager) notes.push('Without collapsing, every concurrent miss for the same key decodes the same original. The CDN\'s own coalescing helps per PoP, but not across PoPs or shields.');
      if (s.tiers === 'warm') notes.push('Facebook\'s f4 moved cooled BLOBs out of Haystack, cutting effective replication from 3.6× to 2.1×. Warm reads are still fast enough for an occasional resize.');
      if (s.tiers === 'cold') notes.push('Archive classes can take minutes to hours to restore. With lazy resizing, a new size of an old photo cannot be made in time, so keep the common derivatives warm or keep originals in warm storage.');
      let verdict;
      if (!eager && s.sizes === 'any') verdict = '❌ <b>Unsigned arbitrary sizes are a DoS hole.</b> Anyone can loop over widths, miss every cache and burn resizer CPU. Sign the URLs or use an allow-list.';
      else if (coldLazy) verdict = '⚠ <b>Lazy resizing on archived originals breaks.</b> The first request for a new size of an old photo would wait for an archive restore.';
      else if (s.collapse === 'off' && !eager) verdict = '⚠ <b>A viral new photo will stampede the resizer.</b> Turn on request collapsing so each key is resized once.';
      else if (eager && s.formats === 'avif') verdict = '⚠ <b>Eager with three formats</b> pays ≈ ' + Math.round(upCpu) + ' ms of encode CPU and ' + kb(deriv) + ' of storage per photo, mostly for variants nobody will request.';
      else if (s.strategy === 'hybrid' && s.sizes === 'signed' && s.formats === 'avif' && s.collapse === 'on' && s.tiers === 'warm') verdict = '✅ <b>A strong default:</b> thumbnails made eagerly, everything else resized on the first miss behind signed URLs, with collapsing, modern formats via Accept, and originals cooled to erasure-coded storage.';
      else if (eager && s.sizes !== 'allow') verdict = '👍 Eager already bounds the sizes, so ' + (s.sizes === 'any' ? 'an unknown <code>?w=</code> just snaps to the nearest stored variant.' : 'signing adds little here beyond hiding URLs.') + ' Clients never get an exact width.';
      else verdict = '👍 Workable. Check the meters to see which trade-off you are paying for.';
      const fmtSub = s.formats === 'jpeg' ? 'JPEG only' : 'Vary: Accept';
      return {
        metrics, verdict, notes,
        labels: {
          rsz: eager ? { label: 'Variant fetch', sub: 'no resize on read' } : { label: 'Resizer', sub: s.collapse === 'on' ? 'resize once · collapse' : 'resize every miss' },
          deriv: eager ? { label: 'Variant store', sub: nVar + ' variants / photo' } : { label: 'Derivative cache', sub: 'LRU, regenerable' },
          proc: { label: 'Image workers', sub: eager ? 'decode + ' + nVar + ' encodes' : s.strategy === 'hybrid' ? 'clean + ' + 2 * fm.length + ' thumbs' : 'validate + strip only' },
          cdn: { label: 'CDN edge', sub: fmtSub },
          cold: s.tiers === 'cold' ? { label: 'Archive tier', sub: 'restore: hours' } : { label: 'Warm EC tier', sub: 'RS(10,4) after 90 d' }
        },
        hide: s.tiers === 'hot' ? ['cold'] : [],
        flow: eager ? ['client>cdn', 'cdn>rsz', 'rsz>deriv'] : ['client>cdn', 'cdn>rsz', 'rsz>deriv', 'rsz>orig'],
        hot: eager ? ['proc', 'deriv'] : ['rsz'],
        err: !eager && s.sizes === 'any' ? ['rsz'] : [],
        warn: coldLazy ? ['cold'] : (s.collapse === 'off' && !eager ? ['rsz'] : []),
        badges: eager ? { proc: [Math.round(upCpu) + ' ms / upload', upCpu > 1000 ? 'warn' : 'info'] } : { rsz: s.collapse === 'on' ? ['1 resize / key', 'ok'] : ['N resizes / key', 'err'] }
      };
    }
  },

  widget: {
    title: 'Eager vs lazy vs any-size, on the same Zipf traffic',
    caption: 'One request stream drives three systems side by side. Each request picks an image by Zipf popularity (every new upload lands in a random popularity slot, so most photos are rarely viewed), a slot width × screen density, and a format from Accept. <b>Eager</b> makes all 6 widths × 3 formats at upload. <b>Lazy</b> snaps to the allow-list and resizes on a miss. <b>Any size</b> resizes the exact width asked for. All three have the same real LRU edge cache; resized copies are kept in a derivative store. Try <b>Viral post</b> with collapsing off, then on, and turn on <b>Attack</b>.'
  },

  realWorld: {
    intro: 'Facebook published the most detail on serving photos at scale, from storage format to cache layers. Image CDNs and open-source resizers documented the on-the-fly side and its security model.',
    timeline: [
      { when: '2009', who: 'Facebook', title: 'Haystack: four sizes per upload', text: 'Each uploaded photo was scaled to <b>4 sizes</b> (large, medium, small, thumbnail) at upload, all kept in Haystack. At the time that was <b>60 billion images and 1.5 PB</b>.', src: 1 },
      { when: '2010', who: 'Facebook', title: 'Haystack paper (OSDI)', text: 'About <b>260 billion images, over 20 PB</b>, and about <b>1 million images served per second</b> at peak. Per-photo metadata is kept small enough to sit <b>in memory</b>, so disk operations go to reading photo data. The old NFS design needed several disk operations per photo just for file-system metadata.', src: 0 },
      { when: '2013', who: 'Facebook', title: 'Where photo requests are served', text: 'A trace of 77M+ requests found <b>65.5%</b> served by browser caches, <b>20.0%</b> by edge caches, <b>4.6%</b> by the origin cache and <b>9.9%</b> by Haystack. Switching the edge to S4LRU was estimated to raise its hit ratio from 59.2% to 67.7%.', src: 2 },
      { when: '2014', who: 'Pinterest', title: 'Thumbnails as background jobs', text: 'Pinterest\'s PinLater post lists generating <b>thumbnails of all sizes</b> among the asynchronous jobs that run after someone clicks Pin It, outside the request path.', src: 6 },
      { when: '2014', who: 'Facebook', title: 'f4: warm BLOB storage (OSDI)', text: 'Cooled photos move from Haystack to f4, which uses erasure coding to cut effective replication from <b>3.6× to 2.8× or 2.1×</b> while storing over 65 PB. Facebook reported more than 400 billion photos in February 2014. (Coding details: see Object Storage.)', src: 4 },
      { when: '2015', who: 'Facebook', title: 'Progressive JPEG on iOS', text: 'Instead of fetching several sizes, the iOS app moved to <b>progressive JPEG</b>, which shows a usable image early from one URL. Facebook reported about <b>10% less data</b> and a good image <b>15% faster</b>.', src: 5 },
      { when: '2019', who: 'Facebook', title: 'PDQ perceptual hash open-sourced', text: 'Facebook released <b>PDQ</b>, a <b>256-bit</b> perceptual image hash compared by Hamming distance, along with a video variant. These are the kind of hashes a moderation hook matches against known bad content.', src: 12 },
      { when: '2021', who: 'Dropbox', title: 'Predict which previews to pre-make', text: 'Dropbox\'s Cannes uses ML to decide which previews to <b>pre-warm</b> instead of making all of them eagerly. Dropbox says it saves <b>$1.7M a year</b>. The middle ground between eager and lazy can be learned.', src: 13 },
      { when: 'Today', who: 'Thumbor · imgix · Cloudflare · AWS', title: 'On-the-fly transforms, with guard rails', text: 'Thumbor signs URLs with an HMAC <code>SECURITY_KEY</code> because a malicious user "can easily ask for other sizes in loops". imgix appends a signature <code>s=</code> parameter (optionally with <code>expires</code>). Cloudflare\'s <code>format=auto</code> serves WebP or AVIF to browsers that support them and, by default, transforms only images from your own zone. AWS\'s solution runs Sharp in Lambda behind CloudFront, with optional Rekognition moderation.', src: 7 }
    ],
    lessons: [
      'Keep <b>one clean original</b> durable. Treat every derivative as a <b>cache entry</b> you may rebuild.',
      'Never let the URL alone decide how much CPU you spend: use an <b>allow-list or a signature</b>.',
      'Put the <b>version in the URL</b> and cache for a year. Purge only for deletes and privacy changes.',
      'Most bytes are in old, rarely read originals: <b>tier them down</b>, and keep the derivatives people still view warm.'
    ],
    sources: [
      { title: 'Finding a Needle in Haystack: Facebook\'s Photo Storage', url: 'https://www.usenix.org/conference/osdi10/finding-needle-haystack-facebooks-photo-storage', pub: 'USENIX OSDI 2010' },
      { title: 'Needle in a haystack: efficient storage of billions of photos', url: 'https://engineering.fb.com/core-data/needle-in-a-haystack-efficient-storage-of-billions-of-photos/', pub: 'Facebook Engineering, 2009' },
      { title: 'An Analysis of Facebook Photo Caching', url: 'https://www.cs.princeton.edu/~wlloyd/papers/fb-photo-caching-sosp13.pdf', pub: 'SOSP 2013 (paper PDF)' },
      { title: 'An analysis of Facebook photo caching', url: 'https://engineering.fb.com/2014/02/27/web/an-analysis-of-facebook-photo-caching-2/', pub: 'Facebook Engineering, 2014' },
      { title: 'f4: Facebook\'s Warm BLOB Storage System', url: 'https://www.usenix.org/conference/osdi14/technical-sessions/presentation/muralidhar', pub: 'USENIX OSDI 2014' },
      { title: 'Adopting Progressive JPEG in Facebook for iOS', url: 'https://engineering.fb.com/2015/01/28/ios/faster-photos-in-facebook-for-ios/', pub: 'Facebook Engineering, 2015' },
      { title: 'PinLater: An asynchronous job execution system', url: 'https://medium.com/@Pinterest_Engineering/pinlater-an-asynchronous-job-execution-system-b8664cb8aa7d', pub: 'Pinterest Engineering, 2014' },
      { title: 'Thumbor security (signed URLs)', url: 'https://thumbor.readthedocs.io/en/latest/security.html', pub: 'Thumbor documentation' },
      { title: 'Securing assets (signed URLs)', url: 'https://docs.imgix.com/setup/securing-assets', pub: 'imgix documentation' },
      { title: 'Transform via URL (format=auto)', url: 'https://developers.cloudflare.com/images/transform-images/transform-via-url', pub: 'Cloudflare Images docs' },
      { title: 'Control origin access', url: 'https://developers.cloudflare.com/images/transform-images/control-origin-access/', pub: 'Cloudflare Images docs' },
      { title: 'Dynamic Image Transformation for Amazon CloudFront: architecture overview', url: 'https://docs.aws.amazon.com/solutions/latest/dynamic-image-transformation-for-amazon-cloudfront/architecture-overview.html', pub: 'AWS Solutions' },
      { title: 'PDQ & TMK + PDQF: A Test Drive of Facebook\'s Perceptual Hashing Algorithms', url: 'https://arxiv.org/abs/1912.07745', pub: 'arXiv, 2019' },
      { title: 'Cannes: How ML saves us $1.7M a year on document previews', url: 'https://dropbox.tech/machine-learning/cannes--how-ml-saves-us--1-7m-a-year-on-document-previews', pub: 'Dropbox Tech, 2021' },
      { title: 'Improving Dropbox Performance: Retrieving Thumbnails', url: 'https://dropbox.tech/infrastructure/retrieving-thumbnails', pub: 'Dropbox Tech' },
      { title: 'Using responsive images in HTML', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images', pub: 'MDN Web Docs' },
      { title: 'Enhancing user experience with advanced image formats', url: 'https://careers.wolt.com/blog/engineering/enhancing-user-experience-with-advanced-image-formats', pub: 'Wolt Engineering' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['When to make derivatives', '<b>Eager</b> at upload: no first-view cost, simple CDN', '<b>Lazy</b> on first miss: stores only what is viewed', 'Eager for the 1–3 sizes every photo needs; lazy for the long tail'],
      ['Which sizes', '<b>Allow-list</b> of widths: bounded keys, better hit ratio', '<b>Signed</b> arbitrary transforms: flexible for designers', 'Allow-list by default; signing when templates change often or crops are per-use'],
      ['Format selection', '<b>Accept negotiation</b>: one URL, needs <code>Vary</code> and a normalised key', '<b>Explicit</b> in URL via <code>&lt;picture&gt;</code>: no Vary, more markup', 'Accept behind a CDN that normalises it; <code>&lt;picture&gt;</code> if your CDN cannot'],
      ['Where to resize', '<b>Own resizer</b> service near origin', '<b>Edge image product</b> (Cloudflare, CloudFront + Lambda, imgix)', 'Buy until egress and transform bills justify running your own'],
      ['Original storage', '<b>Replicated hot</b>: fast reads and resizes', '<b>Erasure-coded warm</b> / archive: much cheaper', 'Tier by age; never lazily resize from an archive class'],
      ['Small-file layout', '<b>One object per image</b> in S3-like storage', '<b>Packed volumes</b> + in-memory index (Haystack)', 'Object store unless you run your own disks at Facebook scale']
    ]
  },
  failures: [
    { f: 'Arbitrary-size requests exhaust resizer CPU', detect: 'Unique cache keys per minute, edge hit ratio drop, resizer CPU', fix: 'HMAC-signed transform URLs and a width allow-list; reject at the edge; rate-limit per client.' },
    { f: 'Decompression bomb or malicious file crashes workers', detect: 'Worker OOM kills, decode time outliers', fix: 'Sniff magic bytes, cap pixels before decoding, decode in a sandbox with memory limits, and keep image libraries patched (e.g. ImageTragick, CVE-2016-3714).' },
    { f: 'Upload finished but the image stays PENDING', detect: 'Age of the oldest PENDING row; queue dead letters', fix: 'Two signals (storage event + client callback), an idempotent claim, and a reconciler that checks the bucket for stale rows.' },
    { f: 'Wrong format served (AVIF to a browser that cannot decode it)', detect: 'Client decode-error reports by user agent', fix: 'Normalise Accept into a format bucket in the cache key, send <code>Vary: Accept</code>, and fall back to JPEG.' },
    { f: 'Viral photo stampedes the resizer', detect: 'Many in-flight resizes for one key; p99 first-view spikes', fix: 'Single-flight per key, tiered cache in front, pre-warm feed sizes for high-follower accounts.' },
    { f: 'Deleted or private photo still loads', detect: 'Privacy audit probes against CDN URLs after delete', fix: 'Purge by surrogate key, bump the version, use short-lived signed URLs for private images, and alert if a purge fails.' },
    { f: 'Location leaked through EXIF', detect: 'Scan published bytes for GPS tags', fix: 'Re-encode without metadata in the worker (keep only the colour profile) and never serve the raw upload bucket.' }
  ],

  interview: [
    { q: 'Why upload directly to object storage instead of through your API servers?', a: '<p>A photo is megabytes and phone uploads are slow. Streaming it through app servers ties up a thread and memory per upload and doubles your bandwidth.</p><p>With a <b>presigned URL</b> the API only authorises: it signs a PUT for one key, one content type, a size cap and a short expiry. The bytes go straight to storage, which already handles multipart and retries. The API learns of completion from a storage event or a client callback.</p>', fu: 'What stops a client from uploading a 5 GB file to that URL? (A size cap in a presigned POST policy, plus the worker re-checks the size.)', lvl: 'core' },
    { q: 'How do you know an upload finished, exactly once?', a: '<p>Use two signals, because either can be lost: the bucket\'s <b>ObjectCreated event</b> and the client\'s <code>POST /complete</code>. Both enqueue the same job.</p><p>The worker claims it with <code>UPDATE images SET status=\'PROCESSING\' WHERE id=? AND status=\'PENDING\'</code>. Zero rows means someone else has it. A reconciler sweeps PENDING rows older than a few minutes and checks whether the object exists.</p>', lvl: 'core' },
    { q: 'Eager thumbnails or resize on the fly?', a: '<ul><li><b>Eager:</b> no first-view latency, and the serving path is just "fetch a file". But you pay storage and CPU for every variant of every photo, including the many never opened, and a new size means backfilling billions of photos.</li><li><b>Lazy:</b> you store only what is requested, and new sizes cost nothing up front. But the first viewer pays the resize, you need collapsing, and arbitrary sizes become a DoS risk.</li></ul><p>Most systems do a <b>hybrid</b>: eager for the 1–3 sizes every photo needs (grid, feed), lazy for the rest.</p>', lvl: 'core' },
    { q: 'How do you stop the resizer from being used as a DoS amplifier?', a: '<p>Each unique size is a new cache key, so a loop over widths misses every cache and costs a full decode each time.</p><ul><li><b>Allow-list</b> widths, and snap or reject anything else.</li><li><b>Sign</b> transform URLs: HMAC(secret, path + params), compared in constant time; unsigned requests get a 403 before any work.</li><li>Cap input pixels, output dimensions and per-client rate.</li><li>Only fetch originals from your own storage, never arbitrary remote URLs.</li></ul>', lvl: 'core' },
    { q: 'How do you serve AVIF or WebP only to clients that support them?', a: '<p>Read the <code>Accept</code> header (<code>image/avif</code>, <code>image/webp</code>) and pick the best format. The response must carry <code>Vary: Accept</code>.</p><p>Don\'t key the CDN on the raw header, which has many spellings. <b>Normalise</b> it to a bucket (avif / webp / jpeg) and add that to the cache key, so there are at most three entries per URL. Alternatively, use <code>&lt;picture&gt;&lt;source type="image/avif"&gt;</code> and put the format in the URL, which needs no Vary.</p>', lvl: 'core' },
    { q: 'How does the client pick the right width?', a: '<p>The page gives <code>srcset="…w320 320w, …w640 640w, …w1080 1080w"</code> plus <code>sizes="(max-width: 600px) 100vw, 600px"</code>. The browser knows the slot width from <code>sizes</code> and its device pixel ratio, so a 360 px slot at 2× picks the 1080 candidate (the 640 would be too small).</p><p>Native apps do the same calculation themselves and ask for the nearest allowed width.</p>', lvl: 'core' },
    { q: 'How can images be cached for a year if users can edit them?', a: '<p>Make URLs <b>immutable</b>: include a version (or content hash) in the path, e.g. <code>/i/sig/42/3/w640</code>. An edit creates version 4 and new URLs. Old URLs stay valid but are no longer referenced.</p><p>Then <code>Cache-Control: public, max-age=31536000, immutable</code> is safe. Purging is only needed for deletes and privacy changes.</p>', lvl: 'core' },
    { q: 'A brand-new photo goes viral. What happens at the resizer?', a: '<p>Hundreds of PoPs miss at once for the same few keys. A tiered cache or shield cuts this to a handful of fetches, but those still hit the resizer together.</p><p><b>Request collapsing</b> (single-flight): keep a map of in-flight keys to futures. The first request does the work and the rest await it. One decode and one encode per key per resizer region. Pre-warming the feed sizes for big accounts removes even that first wait.</p>', lvl: 'deep' },
    { q: 'What do you do with EXIF metadata?', a: '<p>Two jobs. <b>Orientation:</b> phones often save pixels sideways plus a "rotate 90°" tag. Apply it to the pixels (<code>exif_transpose</code>), because once you strip the tag the image would otherwise display sideways.</p><p><b>Privacy:</b> EXIF can hold GPS location, time and camera serial. Re-encode the clean original without it. Keep only what rendering needs, such as the ICC colour profile. Never serve the raw upload.</p>', lvl: 'core' },
    { q: 'How do you detect duplicates, and why use two kinds of hash?', a: '<p><b>SHA-256</b> of the bytes finds exact copies, so you can store one blob with a refcount. It misses a copy that was resized or recompressed.</p><p>A <b>perceptual hash</b> (dHash 64-bit, PDQ 256-bit) changes by only a few bits for such copies. Compare by Hamming distance. To search it, split the hash into bands and index each band: with 4 bands of 16 bits, any hash within distance 3 shares at least one band exactly.</p><p>Be careful with <b>cross-user</b> dedup: if uploads are skipped when a file "already exists", that leaks whether someone else has the file.</p>', lvl: 'deep' },
    { q: 'How do you store billions of small images efficiently?', a: '<p>One file per image on a POSIX file system costs several disk seeks for metadata per read. Facebook\'s <b>Haystack</b> packs many photos into large volume files and keeps a small in-memory index (id → offset, size), so a read spends its disk operation on the photo data.</p><p>As photos cool, move them to <b>erasure-coded warm storage</b> (Facebook\'s f4 cut effective replication from 3.6× to 2.1×). Today most teams get both from a managed object store with storage classes.</p>', lvl: 'deep' },
    { q: 'A user deletes a photo or makes it private. How do you make it disappear?', a: '<ul><li>Flip the row (DELETED or private) and bump the version, so no new page renders the old URL.</li><li>Purge the CDN by a <b>surrogate key</b> per image, which covers every width and format.</li><li>Delete derivatives, then the original (or drop its refcount).</li></ul><p>You cannot recall browser caches or screenshots. That is why private images should only ever be served on <b>short-lived signed URLs</b> with <code>Cache-Control: private</code>.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot: signed, allow-listed resize with single-flight', lang: 'java',
      code: `@RestController
public class ImageController {
  private static final Set<Integer> WIDTHS = Set.of(160, 320, 640, 1080, 1440, 2048);
  private final ConcurrentHashMap<String, CompletableFuture<byte[]>> inflight = new ConcurrentHashMap<>();
  private final SecretKeySpec key;
  private final Resizer resizer;   // fetch original, decode, resize, encode, store derivative

  public ImageController(@Value("\${img.sign-key}") String k, Resizer resizer) {
    this.key = new SecretKeySpec(k.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    this.resizer = resizer;
  }

  @GetMapping("/i/{sig}/{id}/{ver}/w{w}")
  public ResponseEntity<byte[]> get(@PathVariable String sig, @PathVariable long id,
      @PathVariable int ver, @PathVariable int w,
      @RequestHeader(value = HttpHeaders.ACCEPT, defaultValue = "") String accept) throws Exception {
    String path = id + "/" + ver + "/w" + w;
    if (!WIDTHS.contains(w) || !validSig(sig, path)) return ResponseEntity.status(403).build();
    String fmt = accept.contains("image/avif") ? "avif" : accept.contains("image/webp") ? "webp" : "jpeg";
    String k = path + "." + fmt;                       // format is part of the key
    CompletableFuture<byte[]> mine = new CompletableFuture<>();
    CompletableFuture<byte[]> f = inflight.putIfAbsent(k, mine);
    if (f == null) {                                   // leader: the only resize for k
      f = mine;
      try { mine.complete(resizer.render(id, ver, w, fmt)); }
      catch (Exception e) { mine.completeExceptionally(e); }
      finally { inflight.remove(k, mine); }
    }
    byte[] body = f.get(10, TimeUnit.SECONDS);         // followers wait for the leader
    return ResponseEntity.ok().contentType(MediaType.parseMediaType("image/" + fmt))
        .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
        .varyBy(HttpHeaders.ACCEPT).body(body);
  }

  private boolean validSig(String sig, String path) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(key);
      byte[] want = mac.doFinal(path.getBytes(StandardCharsets.UTF_8));
      return MessageDigest.isEqual(want, Base64.getUrlDecoder().decode(sig)); // constant time
    } catch (Exception e) { return false; }            // bad base64 = bad signature
  }

  public interface Resizer { byte[] render(long id, int ver, int w, String fmt) throws Exception; }
}`,
      note: 'Imports omitted. The page server signs with the same key: <code>base64url(HMAC-SHA256(key, "42/3/w640"))</code>. Collapsing here is per instance; route by key (consistent hashing) so one resizer owns each key. <code>contains("image/avif")</code> ignores <code>q=0</code>; parse q-values if you care. Private images need a signature that includes an expiry and <code>Cache-Control: private</code> instead of public/immutable.'
    },
    {
      title: 'Postgres: idempotent claim + near-duplicate lookup', lang: 'sql',
      code: `CREATE TABLE images (
  image_id   bigint PRIMARY KEY,
  owner_id   bigint NOT NULL,
  status     text   NOT NULL DEFAULT 'PENDING'
             CHECK (status IN ('PENDING','PROCESSING','READY','BLOCKED','DELETED')),
  version    int    NOT NULL DEFAULT 1,      -- part of every URL: edits bump it
  sha256     bytea,                          -- exact duplicate key
  dhash      bigint,                         -- 64-bit perceptual hash
  -- 4 bands of 16 bits: distance <= 3 means at least one band is identical
  b0 int GENERATED ALWAYS AS ((dhash >> 48) & 65535) STORED,
  b1 int GENERATED ALWAYS AS ((dhash >> 32) & 65535) STORED,
  b2 int GENERATED ALWAYS AS ((dhash >> 16) & 65535) STORED,
  b3 int GENERATED ALWAYS AS (dhash & 65535) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON images (sha256);
CREATE INDEX ON images (b0); CREATE INDEX ON images (b1);
CREATE INDEX ON images (b2); CREATE INDEX ON images (b3);

-- Client callback and storage event both fire: only the first one wins.
UPDATE images SET status = 'PROCESSING'
 WHERE image_id = $1 AND status = 'PENDING'
RETURNING image_id;                 -- 0 rows: already claimed, ack and drop

-- Near-duplicates (Hamming distance <= 3) via the band indexes.
SELECT image_id, bit_count((dhash # $1)::bit(64)) AS dist
  FROM images
 WHERE status = 'READY'
   AND (b0 = ($1 >> 48) & 65535 OR b1 = ($1 >> 32) & 65535
     OR b2 = ($1 >> 16) & 65535 OR b3 = $1 & 65535)
   AND bit_count((dhash # $1)::bit(64)) <= 3
 ORDER BY dist
 LIMIT 20;`,
      note: 'The pigeonhole trick: if two 64-bit hashes differ in at most 3 bits spread over 4 bands, at least one band matches exactly, so a BitmapOr over four B-tree indexes finds every candidate. For a looser threshold, use more, narrower bands. <code>bit_count</code> on bit strings needs Postgres 14+.'
    },
    {
      title: 'Python (Pillow): validate, fix orientation, strip EXIF, hash', lang: 'python',
      code: `import hashlib, io, warnings
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 50_000_000                 # decompression-bomb guard:
warnings.simplefilter("error", Image.DecompressionBombWarning)  # 1-2x only warns
ALLOWED = {"JPEG", "PNG", "WEBP"}
WIDTHS = (160, 320, 640, 1080, 1440, 2048)

def dhash64(im: Image.Image) -> int:
    """Difference hash: is each pixel brighter than its right neighbour?"""
    g = im.convert("L").resize((9, 8), Image.Resampling.LANCZOS).tobytes()
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (g[row * 9 + col] > g[row * 9 + col + 1])
    return bits - (1 << 64) if bits >= 1 << 63 else bits   # fit Postgres bigint

def process(raw: bytes) -> dict:
    with Image.open(io.BytesIO(raw)) as probe:          # sniffs magic bytes, not the
        if probe.format not in ALLOWED:                  # file name or Content-Type
            raise ValueError(f"unsupported format {probe.format}")
        probe.verify()                                   # structural check only
    with Image.open(io.BytesIO(raw)) as im:              # verify() consumes the file
        icc = im.info.get("icc_profile")                 # keep colour, drop the rest
        im = ImageOps.exif_transpose(im).convert("RGB")  # bake rotation into pixels
    clean = io.BytesIO()
    im.save(clean, "JPEG", quality=92, icc_profile=icc)  # no exif=: GPS, serial gone
    return {
        "sha256": hashlib.sha256(raw).hexdigest(),       # exact duplicate of upload
        "dhash": dhash64(im),                            # survives resize/recompress
        "width": im.width, "height": im.height,
        "clean_original": clean.getvalue(),
        "widths": [w for w in WIDTHS if w <= im.width],  # never upscale
    }`,
      note: 'Tested with Pillow 12: a JPEG with Orientation = 6 and GPS tags came out rotated with no EXIF at all, and the dHash was unchanged after a resize and re-encode at quality 60. PDFs, GIFs and a 56 MP PNG were rejected. <code>convert("RGB")</code> drops transparency; keep PNG/WebP with alpha as-is in a real pipeline. Run this in a sandboxed worker, not in the API process.'
    }
  ],

  related: ['object-storage', 'cdn', 'video-streaming', 'file-sync', 'unique-id', 'rate-limiter']
});
