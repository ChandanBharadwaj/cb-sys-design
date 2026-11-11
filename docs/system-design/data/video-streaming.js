SD.register({
  slug: 'video-streaming',
  domain: 4,
  title: 'Video Streaming & Encoding',
  examples: 'Netflix, YouTube',
  tagline: 'Turn one uploaded file into dozens of <b>small, cacheable segments</b> at many bitrates, push them <b>close to viewers</b>, and let each player pick the best quality its network can sustain, segment by segment.',
  tldr: {
    problem: 'A 2-hour 4K master is tens of GB. Viewers sit on networks that swing from fibre to a congested train Wi-Fi within seconds, and millions of them start the same new show at the same time.',
    idea: '<b>Split</b> the video into chunks and encode them <b>in parallel</b> into a bitrate <b>ladder</b>. Package as HLS/DASH segments, cache them in a <b>CDN placed inside ISPs</b>, and let the player run <b>adaptive bitrate (ABR)</b>: it picks a rung for every next segment.',
    insight: 'Video streaming is mostly <b>plain HTTP GETs of static files</b>. All the intelligence sits at the two ends: the encoder decides how few bits each scene needs, and the player decides which bits to fetch next.',
    numbers: [
      { v: '20–33×', l: 'compute efficiency of YouTube\'s Argos VCU vs its prior software encoders (Google, 2021)' },
      { v: '~90%', l: 'of Netflix traffic delivered over direct connections between Open Connect and residential ISPs (Netflix, 2016)' },
      { v: '10–20%', l: 'fewer rebuffers with buffer-based ABR in Netflix A/B tests (SIGCOMM 2014)' }
    ]
  },

  intro: {
    what: 'A video streaming system takes an uploaded film or clip and lets huge numbers of people watch it smoothly on phones, TVs and laptops. It prepares the video in many sizes and qualities, keeps copies <b>close to viewers</b>, and lets each player <b>switch quality on the fly</b> as its network changes.',
    analogy: {
      icon: '🎞️',
      title: 'A film cut into short reels, stocked on your street',
      text: 'Imagine a film cut into thousands of short reels, each printed in several sizes, from a pocket version to a big-screen version. Copies of every reel sit in a shop on your street, not at the studio. You fetch one reel at a time, and if the road gets busy you grab a smaller version of the next reel so you never run out. A streaming player does exactly that every few seconds, with video segments.'
    },
    problem: 'A new episode comes out at midnight, and millions of people press <b>Play</b> at once. One is on home fibre; another is on a train whose signal keeps dropping. Sending everyone the same huge file from one data centre would clog the network and leave the train viewer staring at a spinning wheel. The system answers <b>"how do we give each viewer the best picture their connection can carry, without stalls, to millions at once?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'One big file on one server',
        text: 'Store the uploaded video as one high-quality file on a central server. When someone presses Play, the player downloads that file from start to finish. It works fine on a fast office network.',
        scene: {
          nodes: [
            { id: 'up', label: 'Uploader', sub: 'one 4K file', kind: 'client', at: [70, 0] },
            { id: 'org', label: 'Central server', sub: 'one big file', kind: 'store', at: [210, 110] },
            { id: 'ply1', label: 'TV on fibre', sub: 'downloads it all', kind: 'client', at: [70, 220] },
            { id: 'ply2', label: 'Phone on train', sub: 'weak signal', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'up', to: 'org' }, { from: 'org', to: 'ply1' }, { from: 'org', to: 'ply2' }],
          flow: ['up>org', ['org>ply1', 'org>ply2']]
        }
      },
      {
        stage: 'breaks',
        title: 'Spinning wheels and a swamped server',
        text: 'The phone on the train cannot download 4K as fast as it plays, so the video <b>freezes to buffer</b>. At midnight, millions of viewers pull the same huge file from one place, across the whole internet. The server and its network links run out of capacity, so even the TV on fibre starts slowly.',
        scene: {
          nodes: [
            { id: 'up', label: 'Uploader', sub: 'one 4K file', kind: 'client', at: [70, 0] },
            { id: 'org', label: 'Central server', sub: 'millions of pulls', kind: 'store', at: [210, 110] },
            { id: 'ply1', label: 'TV on fibre', sub: 'slow to start', kind: 'client', at: [70, 220] },
            { id: 'ply2', label: 'Phone on train', sub: 'buffering…', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'up', to: 'org' }, { from: 'org', to: 'ply1' }, { from: 'org', to: 'ply2' }],
          flow: [['org>ply1', 'org>ply2'], ['org>ply1', 'org>ply2']],
          err: ['org', 'ply2'],
          warn: ['ply1'],
          badges: { org: ['overloaded', 'err'], ply2: ['stalled ⏳', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Small segments, many qualities, cached nearby',
        text: 'Cut the video into <b>segments</b> of a few seconds and encode each one at several qualities (a <b>bitrate ladder</b>), many at the same time. Copies sit in <b>edge caches</b> inside or near viewers\' internet providers. The player measures its speed and picks the quality of <b>each next segment</b>: high on fibre, lower on the train, so playback never stops.',
        scene: {
          nodes: [
            { id: 'up', label: 'Uploader', sub: 'one 4K file', kind: 'client', at: [70, 0] },
            { id: 'enc', label: 'Encoders', sub: 'chunks × qualities', kind: 'compute', at: [210, 0] },
            { id: 'org', label: 'Origin', sub: 'all segments', kind: 'store', at: [350, 0] },
            { id: 'cdn', label: 'Edge cache', sub: 'near viewers', kind: 'cache', at: [210, 110] },
            { id: 'ply1', label: 'TV on fibre', sub: '4K segments', kind: 'client', at: [70, 220] },
            { id: 'ply2', label: 'Phone on train', sub: 'lower quality', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'up', to: 'enc' }, { from: 'enc', to: 'org' }, { from: 'org', to: 'cdn' }, { from: 'cdn', to: 'ply1' }, { from: 'cdn', to: 'ply2' }],
          flow: ['up>enc', 'enc>org', 'org>cdn', ['cdn>ply1', 'cdn>ply2']],
          ok: ['cdn', 'ply1', 'ply2'],
          badges: { ply2: ['no stall ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['Netflix', 'YouTube', 'Disney+', 'Amazon Prime Video', 'Apple TV+'],
    whenToUse: [
      'Recorded video watched by many people on <b>very different networks</b>',
      'The same popular files are requested again and again, so caching near viewers pays off',
      'Viewers care more about a quick start and no freezing than about perfect quality'
    ],
    whenNot: [
      'Live events where a few seconds of delay matter (see <a href="live-streaming.html">Live Event Streaming</a>)',
      'Video calls between a few people: use real-time protocols such as WebRTC',
      'A handful of internal training videos: one file behind a <a href="cdn.html">Content Delivery Network</a> is enough'
    ],
    glossary: [
      { term: 'Encoding (transcoding)', def: 'Compressing the original video into a smaller format at a chosen resolution and quality.' },
      { term: 'Bitrate', def: 'How many bits of data one second of video uses. Higher bitrate usually means better picture.' },
      { term: 'Bitrate ladder', def: 'The set of versions (rungs) a video is encoded into, from small and blurry to large and sharp.' },
      { term: 'Segment', def: 'A short piece of video, usually a few seconds long, stored as its own small file.' },
      { term: 'Manifest (HLS / DASH)', def: 'A small file that lists every segment and every quality, so the player knows what it can fetch.' },
      { term: 'ABR', def: 'Adaptive bitrate: the player\'s logic for choosing which quality to download next, based on speed and buffer.' },
      { term: 'Edge cache / CDN', def: 'Servers placed close to viewers that keep copies of popular segments, so requests do not travel far.' },
      { term: 'Rebuffering', def: 'When playback stops because the player ran out of downloaded video.' }
    ]
  },

  requirements: {
    functional: [
      'Upload large videos reliably (resumable, chunked)',
      'Transcode into a ladder of resolutions, bitrates and codecs',
      'Package for HLS and DASH, with DRM where needed',
      'Start playback quickly on any device and network',
      'Switch quality smoothly as bandwidth changes',
      'Record views and playback quality (QoE) telemetry'
    ],
    nonFunctional: [
      'Startup in ~1–2 s; rebuffering as rare as possible',
      'Peak egress of many Tbps, mostly served from the edge',
      'Encoding scales horizontally; a new upload is playable in minutes',
      'Durable masters; renditions can be regenerated',
      'Cost per GB delivered keeps falling',
      'Survive an edge node or region failure mid-stream'
    ],
    outOfScope: ['Live streaming (see Live Event Streaming)', 'Recommendations', 'Comments and social features', 'Content moderation']
  },

  calculator: {
    inputs: [
      { id: 'up', label: 'Hours of video uploaded per day', min: 10, max: 1000000, value: 30000, log: true },
      { id: 'rungs', label: 'Renditions per video (rungs × codecs)', min: 4, max: 40, value: 12 },
      { id: 'ladder', label: 'Sum of all rendition bitrates', min: 5, max: 80, value: 25, unit: 'Mbps' },
      { id: 'viewers', label: 'Peak concurrent streams', min: 10000, max: 100000000, value: 10000000, log: true },
      { id: 'br', label: 'Average delivered bitrate', min: 0.5, max: 16, step: 0.5, value: 5, unit: 'Mbps' },
      { id: 'hit', label: 'Edge cache hit ratio', min: 50, max: 99.5, step: 0.5, value: 95, unit: '%' }
    ],
    outputs: [
      { label: 'Encoded storage added per day', fmt: 'bytes', f: (v) => v.up * 3600 * v.ladder * 1e6 / 8 },
      { label: 'Encode tasks per day (1-min chunks × renditions)', f: (v) => v.up * 60 * v.rungs },
      { label: 'Peak egress from the edge', fmt: 'bits', f: (v) => v.viewers * v.br * 1e6 },
      { label: 'Peak fill traffic from origin (misses)', fmt: 'bits', f: (v) => v.viewers * v.br * 1e6 * (1 - v.hit / 100) },
      { label: 'Segment requests / s (6 s segments; audio adds more)', f: (v) => v.viewers / 6 },
      { label: 'Edge servers at ~100 Gbps each', f: (v) => Math.ceil(v.viewers * v.br * 1e6 / 100e9) }
    ],
    note: 'All inputs are <em>estimates</em> you can change; the 100 Gbps per edge server is also an <em>estimate</em>. Look at the gap between edge egress and origin fill: the <b>hit ratio</b> decides your backbone bill. Each point of hit ratio you gain removes a large slice of origin traffic.'
  },

  api: [
    { m: 'POST', p: '/v1/uploads', d: 'Returns an upload id and <b>presigned part URLs</b> (S3 multipart). The client uploads parts in parallel and can resume by re-sending only missing parts.' },
    { m: 'POST', p: '/v1/uploads/{id}/complete', d: 'Body: part numbers + ETags. Assembles the object and emits <code>VideoUploaded</code>, which starts the encoding DAG.' },
    { m: 'GET', p: '/v1/videos/{id}/playback', d: 'Returns the manifest URL, a <b>ranked list of edge hosts</b> for this client, and the DRM license URL.' },
    { m: 'GET', p: '{edge}/v/{id}/{rendition}/seg_{n}.m4s', d: 'A plain, immutable, cacheable segment. This is ~all of the traffic.' },
    { m: 'POST', p: '/v1/license/{id}', d: 'DRM license exchange (Widevine / FairPlay / PlayReady) before encrypted segments can play.' },
    { m: 'POST', p: '/v1/events/playback', d: 'Batched QoE telemetry: startup time, bitrate switches, rebuffers, errors. Feeds views and popularity.' }
  ],
  dataModel: [
    { name: 'videos', store: 'Postgres', fields: [['video_id', 'uuid', 'pk'], ['owner_id', 'bigint', 'idx'], ['status', 'UPLOADING|ENCODING|READY'], ['duration_s', 'int'], ['ladder', 'jsonb']], note: 'The ladder is chosen per title (or per shot) after complexity analysis.' },
    { name: 'encode_tasks', store: 'Workflow DB (Temporal / Postgres)', fields: [['task_id', 'uuid', 'pk'], ['video_id', 'uuid', 'idx'], ['chunk_no, rendition', 'int, text'], ['status, attempts', 'enum, int'], ['output_key', 'text']], note: 'One row per chunk × rendition. Idempotent: re-running a task overwrites the same output key.' },
    { name: 'segments', store: 'Object store + CDN', fields: [['key', 'v/{id}/{rend}/seg_{n}.m4s', 'pk'], ['bytes', 'int'], ['duration', '~2–6 s']], note: 'Immutable, so they can be cached forever. New encodes get new keys.' },
    { name: 'playback_events', store: 'Kafka → warehouse', fields: [['session_id', 'uuid', 'pk'], ['video_id', 'uuid', 'idx'], ['event', 'start|switch|rebuffer|stop'], ['bitrate, buffer_s', 'int, float']], note: 'View counts are aggregated from here, not incremented per request.' }
  ],

  architecture: {
    title: 'Video upload, encoding and delivery',
    nodes: [
      { id: 'up', label: 'Uploader', sub: 'resumable, chunked', kind: 'client', wide: [90, 0], tall: [70, 0], tip: 'Uploads the master file in parts directly to object storage using presigned URLs.' },
      { id: 'ing', label: 'Upload API', sub: 'presigned multipart', kind: 'edge', wide: [280, 0], tall: [210, 0], tip: 'Authenticates the creator, issues presigned part URLs, and completes the multipart upload.' },
      { id: 'raw', label: 'Master store', sub: 'object storage', kind: 'store', wide: [470, 0], tall: [350, 0], tip: 'Durable copy of the original (mezzanine) file. Everything else can be regenerated from it.' },
      { id: 'orch', label: 'Encode DAG', sub: 'split → fan-out → join', kind: 'service', wide: [660, 0], tall: [350, 105], tip: 'Analyzes complexity, splits at keyframes/shots, schedules chunk × rendition tasks, retries failures and joins the results.' },
      { id: 'enc', label: 'Encoder fleet', sub: 'chunk × rendition', kind: 'compute', wide: [850, 0], tall: [210, 105], tip: 'Thousands of parallel encodes (CPU, GPU or ASICs such as YouTube\'s VCU). Each task is small and retryable.' },
      { id: 'pkg', label: 'Packager + DRM', sub: 'CMAF → HLS / DASH', kind: 'compute', wide: [850, 115], tall: [70, 105], tip: 'Writes segments and manifests (m3u8 / mpd), encrypts with CENC for DRM.' },
      { id: 'org', label: 'Origin', sub: 'segments + manifests', kind: 'store', wide: [660, 115], tall: [70, 210], tip: 'The source of truth for edge caches. Shielded by a mid-tier so a cold title does not stampede it.' },
      { id: 'pre', label: 'Fill planner', sub: 'popularity forecast', kind: 'ml', wide: [470, 115], tall: [350, 210], tip: 'Predicts tomorrow\'s demand per region and tells edge caches what to pre-load during off-peak hours.' },
      { id: 'cdn', label: 'Edge cache', sub: 'in-ISP appliance / PoP', kind: 'cache', wide: [660, 230], tall: [70, 315], tip: 'Serves segments from inside or near the viewer\'s ISP. Netflix\'s Open Connect appliances are placed inside ISP networks.' },
      { id: 'ctl', label: 'Playback API', sub: 'steering · license', kind: 'service', wide: [280, 230], tall: [350, 315], tip: 'Picks the best edge hosts for this client, returns the manifest and license URLs, and collects QoE events.' },
      { id: 'ply', label: 'Player', sub: 'ABR · buffer', kind: 'client', wide: [470, 345], tall: [210, 420], tip: 'Downloads the next segment at the rung chosen by its ABR algorithm from measured throughput and buffer level.' }
    ],
    edges: [
      { from: 'up', to: 'ing' },
      { from: 'ing', to: 'raw' },
      { from: 'raw', to: 'orch' },
      { from: 'orch', to: 'enc' },
      { from: 'enc', to: 'pkg' },
      { from: 'pkg', to: 'org' },
      { from: 'org', to: 'cdn', bidi: true, label: 'fill' },
      { from: 'pre', to: 'cdn', dashed: true },
      { from: 'ply', to: 'ctl', bidi: true },
      { from: 'ply', to: 'cdn', bidi: true },
      { from: 'ctl', to: 'pre', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'upload', title: 'Upload → parallel encode → publish', tone: 'ok',
      steps: [
        { text: 'The creator\'s app asks for an upload and gets <b>presigned part URLs</b>. Parts go straight to object storage, in parallel. A dropped connection only re-sends the missing parts.', flow: ['up>ing', 'ing>raw'], badges: { raw: '38 GB master' } },
        { text: 'The DAG runs <b>complexity analysis</b>, then splits the video at keyframes or shot boundaries into chunks of seconds to minutes.', flow: ['raw>orch'], badges: { orch: '120 chunks' } },
        { text: 'Each <b>chunk × rendition</b> becomes an independent task. 120 chunks × 12 renditions = 1,440 small jobs running at the same time instead of one 10-hour job.', flow: [['orch>enc', 'orch>enc']], badges: { enc: '1,440 tasks' }, tone: 'ok' },
        { text: 'Encoded chunks are joined, then packaged into CMAF segments with <b>HLS and DASH manifests</b>, and encrypted for DRM.', flow: ['enc>pkg', 'pkg>org'], badges: { org: 'm3u8 + mpd' } },
        { text: 'The video flips to <code>READY</code>. Edge caches will fill on first request or during the next pre-positioning window.', flow: ['org>cdn'], ok: ['org'], tone: 'ok' }
      ]
    },
    {
      id: 'play', title: 'Playback start and a bandwidth drop', tone: 'info',
      steps: [
        { text: 'The player calls the playback API and gets the manifest, a DRM license URL and a <b>ranked list of edge hosts</b> close to it.', flow: ['ply>ctl', 'ctl>ply'], badges: { ctl: '3 edge URLs' } },
        { text: 'To start fast, ABR picks a <b>low rung</b> for the first segments, then climbs as it measures throughput and the buffer fills.', flow: ['ply>cdn', 'cdn>ply'], badges: { ply: '750 kbps → 3 Mbps' } },
        { text: 'The viewer walks onto weak Wi-Fi. The last segments took longer than their duration to download, so the <b>buffer starts draining</b>.', nodes: ['ply'], warn: ['ply'], badges: { ply: ['buffer 30 s → 18 s', 'warn'] }, tone: 'warn' },
        { text: 'ABR <b>steps down</b> a rung before the buffer empties. The picture gets softer, but it never freezes. When bandwidth recovers it steps back up.', flow: ['ply>cdn', 'cdn>ply'], ok: ['ply'], badges: { ply: ['1.75 Mbps', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'miss', title: 'Edge miss → fill from origin', tone: 'warn',
      steps: [
        { text: 'A viewer asks for an old, rarely watched episode. The edge cache does not have that segment.', flow: ['ply>cdn'], warn: ['cdn'], badges: { cdn: ['MISS', 'warn'] }, tone: 'warn' },
        { text: 'The edge fetches it from the origin (often through a mid-tier shield, so many edges share one fetch), stores it and serves it.', flow: ['cdn>org', 'org>cdn', 'cdn>ply'], badges: { org: 'fill' } },
        { text: 'The next segments are fetched ahead by the edge, so only the first one paid the extra round trip. Segments are immutable, so no invalidation is ever needed.', flow: ['ply>cdn', 'cdn>ply'], ok: ['cdn'], badges: { cdn: ['HIT', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'premiere', title: 'Hot spot: a global premiere at 00:00', tone: 'warn',
      steps: [
        { text: 'A new season drops at midnight. Millions of players will ask for the <b>same first segments</b> within minutes. Pure on-demand caching would stampede the origin.', nodes: ['ply', 'cdn', 'org'], warn: ['org'], badges: { org: ['stampede risk', 'warn'] }, tone: 'warn' },
        { text: 'The day before, the fill planner forecasts demand per region from QoE and viewing data.', flow: ['ctl>pre'], badges: { pre: 'forecast' } },
        { text: 'During <b>off-peak hours</b> the edges pre-load the new episodes in every rendition likely to be used. Open Connect fills on a schedule agreed with each ISP.', flow: ['org>cdn', 'pre>cdn'], ok: ['cdn'], badges: { cdn: ['pre-positioned', 'ok'] } },
        { text: 'At 00:00 nearly every request is an <b>edge hit</b> inside the viewer\'s ISP. Origin and transit links stay quiet.', flow: [['ply>cdn', 'ply>cdn'], 'cdn>ply'], ok: ['cdn', 'org'], badges: { cdn: ['hit ≈ 99%', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'edge-down', title: 'Edge appliance dies mid-stream', tone: 'err',
      steps: [
        { text: 'The edge serving this viewer loses power. The next segment request <b>times out</b>.', flow: ['ply>cdn'], err: ['cdn'], badges: { cdn: ['down', 'err'] }, tone: 'err' },
        { text: 'The player still has ~20 s of video in its <b>buffer</b>, so the viewer sees nothing yet.', nodes: ['ply'], warn: ['ply'], badges: { ply: ['playing from buffer', 'warn'] }, tone: 'warn' },
        { text: 'It retries the <b>next URL</b> from the ranked list it got at startup (or asks steering again). Any healthy edge can serve the same immutable segment.', flow: ['ply>ctl', 'ctl>ply', 'ply>cdn'], badges: { ctl: 'next host' } },
        { text: 'Playback continues. Health checks remove the dead appliance from steering for all other clients.', flow: ['cdn>ply'], ok: ['ply', 'ctl'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Four big levers in a streaming system. Set your viewer bandwidth and watch quality, startup, rebuffering and cost move.',
    controls: [
      { id: 'ladder', label: 'Encoding ladder', type: 'seg', value: 'pertitle', options: [
        { v: 'fixed', l: 'Fixed ladder' }, { v: 'pertitle', l: 'Per-title' }, { v: 'shot', l: 'Per-shot (dynamic optimizer)' }] },
      { id: 'seg', label: 'Segment length', type: 'seg', value: 6, options: [
        { v: 2, l: '2 s' }, { v: 6, l: '6 s' }, { v: 10, l: '10 s' }] },
      { id: 'abr', label: 'ABR algorithm', type: 'seg', value: 'hybrid', options: [
        { v: 'tput', l: 'Throughput-based' }, { v: 'buffer', l: 'Buffer-based (BBA)' }, { v: 'hybrid', l: 'Hybrid' }] },
      { id: 'cdn', label: 'Delivery', type: 'seg', value: 'own', options: [
        { v: 'third', l: 'Third-party CDN' }, { v: 'own', l: 'Own ISP-embedded caches' }] },
      { id: 'bw', label: 'Typical viewer bandwidth', type: 'range', min: 1, max: 40, step: 1, value: 6, fmt: (v) => v + ' Mbps' }
    ],
    evaluate(s) {
      // Illustrative bits-per-quality factors relative to a fixed ladder (not published constants).
      const fac = { fixed: 1, pertitle: 0.8, shot: 0.6 }[s.ladder];
      const segOverhead = { 2: 1.06, 6: 1.02, 10: 1.0 }[s.seg]; // more keyframes with shorter segments
      const needs = [['4K', 16], ['1080p', 5.8], ['720p', 3], ['480p', 1.05], ['360p', 0.56]]; // fixed-ladder Mbps, illustrative
      const usable = s.bw * 0.8;
      const best = needs.find(([, m]) => m * fac * segOverhead <= usable) || ['240p', 0.24];
      const qS = { '4K': 1, '1080p': 0.85, '720p': 0.6, '480p': 0.35, '360p': 0.2, '240p': 0.1 }[best[0]];
      const startup = 0.4 + s.seg * 0.5 * Math.min(1, 1.5 / s.bw) + (s.abr === 'buffer' ? 0.2 : 0);
      const rebufBase = { tput: 1.0, buffer: 0.8, hybrid: 0.7 }[s.abr] * { 2: 0.9, 6: 1, 10: 1.25 }[s.seg] * (s.bw < 3 ? 1.6 : 1);
      const compute = { fixed: '1× (baseline)', pertitle: '≈ 2–3× (trial encodes)', shot: '≈ 5–10× (per-shot search)' }[s.ladder];
      const metrics = [
        { k: 'Bits for the same quality', v: Math.round(fac * segOverhead * 100) + '% of fixed', s: Math.max(0.05, Math.min(1, (1.1 - fac * segOverhead) / 0.5)) },
        { k: 'Best sustainable quality', v: best[0] + ' at ' + s.bw + ' Mbps', s: qS },
        { k: 'Startup time', v: '≈ ' + startup.toFixed(1) + ' s', s: startup < 1.2 ? 0.9 : startup < 2.5 ? 0.6 : 0.3 },
        { k: 'Rebuffer risk (relative)', v: rebufBase.toFixed(2) + '×', s: Math.max(0.05, 1.1 - rebufBase * 0.6) },
        { k: 'Segment requests / stream-min', v: String(60 / s.seg), s: s.seg === 2 ? 0.45 : s.seg === 6 ? 0.8 : 0.9 },
        { k: 'Encode compute per title', v: compute, s: { fixed: 0.9, pertitle: 0.7, shot: 0.45 }[s.ladder] },
        { k: 'Delivery cost & hit ratio', v: s.cdn === 'own' ? 'capex; proactive fill, high hit' : 'pay per GB; reactive cache', s: s.cdn === 'own' ? 0.8 : 0.5 }
      ];
      const notes = [];
      if (s.ladder === 'fixed') notes.push('A fixed ladder gives a cartoon the same bits as an action film. Netflix\'s 2015 per-title work showed simple titles look the same at much lower bitrates.');
      if (s.ladder === 'shot') notes.push('Per-shot encoding picks resolution and quantizer per shot to sit on the quality/bitrate <b>convex hull</b>. It costs many trial encodes, so it pays off for titles watched millions of times. The 40% saving shown is illustrative.');
      if (s.ladder === 'pertitle') notes.push('Per-title runs trial encodes per title and keeps the ladder points on the quality/bitrate convex hull. The 20% saving here is illustrative; real savings depend on how simple the content is.');
      if (s.abr === 'hybrid') notes.push('Hybrid ABR uses throughput while the buffer is nearly empty (startup, after a seek) and switches to buffer-based logic once there is a cushion.');
      if (s.cdn === 'own') notes.push('Own caches inside ISPs are filled ahead of demand during off-peak hours, so the peak is served locally. Hit ratios shown are <em>estimates</em>.');
      if (s.seg === 2) notes.push('2 s segments react fast and start fast, but triple the request rate and add keyframe overhead. Common in live and low-latency setups.');
      if (s.seg === 10) notes.push('10 s segments are efficient to serve, but the player can only change bitrate every 10 s, so a sudden drop drains the buffer before ABR can react.');
      if (s.abr === 'buffer') notes.push('Buffer-based ABR maps buffer level to a rung, ignoring noisy throughput estimates in steady state. Netflix\'s A/B tests found 10–20% fewer rebuffers.');
      if (s.abr === 'tput') notes.push('Throughput estimates are noisy and lag behind reality, so pure throughput ABR tends to oscillate or overshoot.');
      if (s.cdn === 'third') notes.push('A third-party CDN is the right start: no hardware, global reach. At very large scale, owning caches inside ISPs cuts transit cost and improves hit ratio.');
      let verdict;
      if (s.seg === 10 && s.abr === 'tput') verdict = '⚠ <b>Slow to react.</b> Long segments plus a noisy throughput estimate mean frequent rebuffers on mobile.';
      else if (qS < 0.35) verdict = '⚠ <b>Viewers see low resolution.</b> At this bandwidth a more efficient ladder (or codec) is the biggest win.';
      else if (s.ladder === 'shot' && s.seg <= 6 && s.abr !== 'tput' && s.cdn === 'own') verdict = '✅ <b>Close to what Netflix describes:</b> optimized per-shot encodes, short segments, buffer-aware ABR and caches inside ISPs.';
      else if (s.cdn === 'third' && s.ladder !== 'shot') verdict = '👍 <b>Great default for a new service:</b> per-title or fixed ladder, 6 s segments, a commercial CDN.';
      else verdict = '👍 Workable. The meters show where your bits and dollars go.';
      return {
        metrics, verdict, notes,
        labels: {
          enc: { label: 'Encoder fleet', sub: { fixed: 'fixed ladder', pertitle: 'per-title ladder', shot: 'per-shot optimizer' }[s.ladder] },
          cdn: s.cdn === 'own' ? { label: 'ISP-embedded cache', sub: 'proactive nightly fill' } : { label: 'Third-party CDN', sub: 'reactive cache' },
          ply: { label: 'Player', sub: { tput: 'ABR: throughput', buffer: 'ABR: buffer-based', hybrid: 'ABR: hybrid' }[s.abr] + ' · ' + s.seg + ' s' }
        },
        hide: s.cdn === 'own' ? [] : ['pre'],
        hot: s.ladder === 'shot' ? ['enc'] : [],
        warn: qS < 0.35 ? ['ply'] : [],
        badges: { cdn: [s.cdn === 'own' ? 'hit ~95%+ (est.)' : 'hit ~85–90% (est.)', 'info'], ply: [best[0], qS < 0.35 ? 'warn' : 'ok'] },
        flow: ['ply>ctl', 'ply>cdn', 'cdn>ply'].concat(s.cdn === 'own' ? ['pre>cdn'] : ['cdn>org'])
      };
    }
  },

  widget: {
    title: 'ABR player: buffer vs bitrate',
    caption: 'Press <b>Play</b>, then drag the <b>bandwidth</b> slider or hit <b>Network drop</b>. Each bar is one segment, coloured by the rung the ABR picked. Compare <b>throughput-based</b> and <b>buffer-based (BBA-0)</b> logic and count the rebuffers.'
  },

  realWorld: {
    intro: 'Netflix and YouTube have published a lot about both ends of the pipe: squeezing bits out of encodes, and getting the bits close to the viewer.',
    timeline: [
      { when: '2014', who: 'Netflix · Stanford', title: 'Buffer-based rate adaptation', text: 'Huang et al. tested ABR that picks the bitrate from <b>buffer level</b> rather than throughput estimates, in A/B tests with more than half a million users each. It cut rebuffers by about <b>10–20%</b> vs Netflix\'s default while keeping or improving video rate.', src: 5 },
      { when: 'Dec 2015', who: 'Netflix', title: 'Per-title encode optimization', text: 'Instead of one fixed ladder for every title, Netflix encodes each title at many resolution/bitrate points and builds its ladder from the points closest to the <b>convex hull</b>. Simple content (their example: animation such as <i>BoJack Horseman</i>) gets higher resolution at the same bitrate.', src: 0 },
      { when: '2016', who: 'Netflix', title: 'Traffic over direct ISP connections', text: 'Netflix says close to <b>90%</b> of its traffic is delivered via direct connections between Open Connect and the residential ISPs its members use.', src: 4 },
      { when: '2018', who: 'Netflix', title: 'Dynamic optimizer (shot-based)', text: 'A codec-agnostic framework that chooses resolution and quantizer <b>per shot</b>, optimizing the VMAF perceptual metric. At equal quality it needed fewer bits than fixed-QP encoding, and Netflix reported the saving <b>separately for each codec</b> it tested (x264, x265 and VP9) rather than as one number; summaries put it at roughly 28–38%.', src: 1 },
      { when: '2020', who: 'Netflix', title: 'Optimized shot-based 4K encodes', text: 'Shot-based encoding reached 4K streams. Netflix reported an average BD-rate gain of about <b>50%</b> across the 4K ladder (roughly half the bits for comparable quality) versus the previous fixed 4K ladder, as summarized in press coverage.', src: 2 },
      { when: 'Apr 2021', who: 'YouTube', title: 'Argos video coding unit (VCU)', text: 'YouTube built its own transcoding chip and the software to run it at warehouse scale, reporting <b>20–33×</b> better compute efficiency than its previous optimized software encoders. The details are in Google\'s ASPLOS \'21 paper.', src: 6 },
      { when: 'Ongoing', who: 'Netflix', title: 'Open Connect appliances in ISPs', text: 'Netflix gives qualifying ISPs Open Connect Appliances free of charge; the ISP supplies power, space and connectivity. Caching is <b>proactive and directed</b>: content is filled ahead of demand during off-peak hours rather than on first request.', src: 3 }
    ],
    lessons: [
      'Make the unit of work <b>small and independent</b> (chunk × rendition), and encoding becomes an embarrassingly parallel batch job.',
      'Spend encoder compute once to <b>save bits on every view</b>. It pays off for popular titles.',
      'Segments are <b>immutable files</b>: cache them forever and never invalidate.',
      'Put caches <b>inside the ISP</b> and fill them ahead of demand.',
      'Let the <b>client</b> decide quality. Only it sees its own network in real time.'
    ],
    sources: [
      { title: 'Per-Title Encode Optimization', url: 'https://netflixtechblog.com/per-title-encode-optimization-7e99442b62a2', pub: 'Netflix Technology Blog, 2015' },
      { title: 'Dynamic optimizer: a perceptual video encoding optimization framework', url: 'https://netflixtechblog.com/dynamic-optimizer-a-perceptual-video-encoding-optimization-framework-e19f1e3a277f', pub: 'Netflix Technology Blog, 2018' },
      { title: 'Decoding the Netflix announcement: optimized shot-based encoding for 4K', url: 'https://hackaday.com/2020/09/16/decoding-the-netflix-announcement-explaining-optimized-shot-based-encoding-for-4k', pub: 'Hackaday, Sep 2020' },
      { title: 'Open Connect Overview', url: 'https://openconnect.netflix.com/Open-Connect-Overview.pdf', pub: 'Netflix Open Connect' },
      { title: 'How Netflix works with ISPs around the globe to deliver a great viewing experience', url: 'https://about.netflix.com/en/news/how-netflix-works-with-isps-around-the-globe-to-deliver-a-great-viewing-experience', pub: 'Netflix, 2016' },
      { title: 'A Buffer-Based Approach to Rate Adaptation: Evidence from a Large Video Streaming Service', url: 'https://web.stanford.edu/class/cs244/papers/sigcomm2014-video.pdf', pub: 'SIGCOMM 2014' },
      { title: 'Reimagining video infrastructure to empower YouTube', url: 'https://blog.youtube/inside-youtube/new-era-video-infrastructure/', pub: 'YouTube Official Blog, Apr 2021' },
      { title: 'Warehouse-Scale Video Acceleration: Co-design and Deployment in the Wild', url: 'https://research.google/pubs/warehouse-scale-video-acceleration-co-design-and-deployment-in-the-wild/', pub: 'Google, ASPLOS 2021' },
      { title: 'HTTP Live Streaming (HLS) authoring specification for Apple devices', url: 'https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices', pub: 'Apple Developer Documentation' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Ladder', '<b>Fixed</b>: one ladder, cheap to encode', '<b>Per-title / per-shot</b>: fewer bits for equal quality', 'Optimize when a title is watched enough to repay the extra compute'],
      ['Protocol', '<b>HLS</b>: required on Apple devices', '<b>DASH</b>: open standard, common elsewhere', 'Both, from one set of <b>CMAF</b> segments with two manifests'],
      ['Segment length', '<b>2 s</b>: fast start and switching', '<b>6 s</b>: fewer requests, better compression', '6 s for VOD (Apple\'s guidance), 2 s or less for live / low latency'],
      ['ABR', '<b>Throughput-based</b>: simple, quick at startup', '<b>Buffer-based</b>: stable, fewer rebuffers', 'Hybrid: throughput while the buffer is empty, buffer-based in steady state'],
      ['Delivery', '<b>Commercial CDN</b>: no capex, global', '<b>Own edge in ISPs</b>: lower cost per GB, higher hit ratio', 'Own edge only at very large, steady volume'],
      ['Encoding hardware', '<b>CPU software encoders</b>: flexible', '<b>GPU / ASIC (VCU)</b>: far cheaper per frame', 'ASICs at YouTube scale; CPUs/GPUs for everyone else']
    ]
  },
  failures: [
    { f: 'Encode task fails or hangs', detect: 'Task heartbeat / timeout in the workflow engine', fix: 'Retry the single chunk × rendition task; outputs are idempotent by key.' },
    { f: 'Upload interrupted', detect: 'Missing parts on <code>complete</code>', fix: 'Client lists uploaded parts and re-sends only missing ones; abort stale multipart uploads with a lifecycle rule.' },
    { f: 'Edge node dies mid-stream', detect: 'Segment request timeout on the client; health checks', fix: 'Player retries the next ranked host; buffer hides the gap; steering drops the node.' },
    { f: 'Premiere stampede on origin', detect: 'Origin request rate and miss ratio spike', fix: 'Pre-position popular titles; mid-tier shield with request coalescing.' },
    { f: 'ABR oscillation', detect: 'QoE telemetry: many switches per minute', fix: 'Buffer-based logic with hysteresis; smooth throughput estimates.' },
    { f: 'Bad encode shipped (artifacts)', detect: 'Automated quality checks (e.g. VMAF thresholds) per rendition', fix: 'Block publish below threshold; re-encode with new settings under new keys.' }
  ],

  interview: [
    { q: 'Why split a video into chunks before encoding?', a: '<p>Encoding a 2-hour 4K film on one machine takes hours. Split at keyframes (or shot boundaries) into chunks and encode <b>chunk × rendition</b> tasks in parallel across a fleet; latency drops from hours to minutes.</p><p>Small tasks also fail and retry cheaply, and per-shot chunks let you choose settings per scene.</p>', fu: 'What goes wrong at chunk boundaries? (Rate control and GOP structure; use closed GOPs and align keyframes so segments line up across renditions.)', lvl: 'core' },
    { q: 'HLS vs DASH?', a: '<p>Both are <b>HTTP adaptive streaming</b>: a manifest lists renditions and segment URLs, and the player fetches segments over plain HTTP.</p><ul><li><b>HLS</b> (Apple): <code>.m3u8</code> playlists, required for native playback on Apple devices.</li><li><b>DASH</b> (MPEG standard): XML <code>.mpd</code>, codec-agnostic, common on Android, smart TVs and the web.</li></ul><p>With <b>CMAF</b> you store fMP4 segments once and publish both manifests.</p>', lvl: 'core' },
    { q: 'How does an ABR algorithm decide which bitrate to fetch?', a: '<p><b>Throughput-based:</b> estimate bandwidth from recent segment downloads (e.g. a harmonic mean) and pick the highest rung below ~80% of it.</p><p><b>Buffer-based (BBA):</b> map the current buffer level to a rung: a small reservoir means lowest, a full buffer means highest, linear in between.</p><p>Production players mix both and add hysteresis to avoid oscillating.</p>', lvl: 'core' },
    { q: 'What is per-title (and per-shot) encoding?', a: '<p>Run trial encodes at many resolution/bitrate points, measure quality (e.g. VMAF), and keep the points on the <b>convex hull</b> of quality vs bitrate. That becomes the ladder for <i>this</i> title.</p><p>Per-shot does the same per shot and stitches the best choice per shot together. More compute up front, fewer bits on every view.</p>', fu: 'Which codec do you encode first? (H.264 for universal device support; add HEVC/AV1 ladders for popular titles and capable devices: fewer bits per view, but much more encode compute.)', lvl: 'deep' },
    { q: 'How does CDN pre-positioning work?', a: '<p>Forecast tomorrow\'s demand per region (new releases, trending titles), then push those files to edge caches during <b>off-peak hours</b> when links are idle. Netflix\'s Open Connect works this way rather than filling only on cache misses.</p><p>At peak, almost everything is a local hit and transit links stay quiet.</p>', lvl: 'core' },
    { q: 'How do you make uploads of 50 GB files reliable?', a: '<p>Use <b>multipart / resumable upload</b>: split the file into parts (e.g. 16 MB), upload them in parallel to presigned URLs, and complete with the list of part ETags. On failure, list which parts arrived and resend only the missing ones.</p><p>The API server never streams the bytes itself.</p>', lvl: 'core' },
    { q: 'How do you count views at scale?', a: '<p>Don\'t increment a DB row per view. Send <b>playback events</b> to Kafka, dedupe by session, apply the "counts as a view" rule (e.g. watched N seconds), and aggregate in a stream job into time buckets.</p><p>Show an approximate live count, and a reconciled exact count from the batch pipeline.</p>', lvl: 'core' },
    { q: 'What is the trade-off in segment length?', a: '<p>Short segments (2 s) mean faster startup, faster ABR reaction and lower live latency, but more requests, more manifest churn and more keyframes (worse compression).</p><p>Longer segments (6–10 s) are cheaper to serve and compress better. Apple\'s HLS authoring specification says target durations <b>should be 6 s</b> (a recommendation, not a hard rule).</p>', lvl: 'core' },
    { q: 'Why does the player start at a low bitrate?', a: '<p>At startup the buffer is empty and there is no throughput history. A small first segment downloads fast, so playback begins sooner and the player can measure the network. It then ramps up.</p>', lvl: 'core' },
    { q: 'How would you store all these renditions cheaply?', a: '<p>Keep the master in durable storage. Keep popular renditions hot; move rarely watched long-tail renditions to colder tiers, or drop rarely used ones and <b>re-encode on demand</b> (just-in-time packaging can also generate HLS/DASH from one CMAF set).</p>', lvl: 'deep' },
    { q: 'How does DRM fit in?', a: '<p>Segments are encrypted once with <b>Common Encryption (CENC)</b>. The player gets a license from a DRM service (Widevine, FairPlay, PlayReady) after the backend checks entitlement. The CDN only ever sees encrypted bytes, so caching is unaffected.</p>', lvl: 'deep' },
    { q: 'What changes for live streaming?', a: '<p>You can\'t pre-encode or pre-position. Encoding must be real-time, segments are short (≤ 2 s, or partial segments in LL-HLS), the manifest updates constantly, and the whole audience requests the <b>same newest segment</b> at once, so request coalescing at the edge is critical.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot: presigned S3 multipart upload', lang: 'java',
      code: `// software.amazon.awssdk:s3 (SDK v2)
@RestController
@RequestMapping("/v1/uploads")
public class UploadController {
  private static final String BUCKET = "video-masters";
  private static final long PART = 16L * 1024 * 1024;      // 16 MiB (min 5 MiB, max 10,000 parts)
  private final S3Client s3;
  private final S3Presigner presigner;
  public UploadController(S3Client s3, S3Presigner presigner) { this.s3 = s3; this.presigner = presigner; }

  @PostMapping
  public UploadPlan start(@RequestBody NewUpload req) {
    String key = "masters/" + UUID.randomUUID() + "/" + req.fileName();
    String uploadId = s3.createMultipartUpload(b -> b.bucket(BUCKET).key(key)).uploadId();
    int parts = (int) Math.ceil((double) req.sizeBytes() / PART);
    List<String> urls = IntStream.rangeClosed(1, parts).mapToObj(n ->
        presigner.presignUploadPart(UploadPartPresignRequest.builder()
            .signatureDuration(Duration.ofHours(6))
            .uploadPartRequest(UploadPartRequest.builder()
                .bucket(BUCKET).key(key).uploadId(uploadId).partNumber(n).build())
            .build()).url().toString())
      .toList();
    return new UploadPlan(key, uploadId, PART, urls);
  }

  @PostMapping("/complete")
  public void complete(@RequestBody CompleteUpload req) {
    List<CompletedPart> parts = req.parts().stream()
        .sorted(Comparator.comparingInt(p -> p.number()))      // S3 wants ascending part order
        .map(p -> CompletedPart.builder().partNumber(p.number()).eTag(p.etag()).build())
        .toList();
    s3.completeMultipartUpload(b -> b.bucket(BUCKET).key(req.key()).uploadId(req.uploadId())
        .multipartUpload(CompletedMultipartUpload.builder().parts(parts).build()));
    // publish VideoUploaded(key) -> starts the encoding workflow
  }
}`,
      note: 'The browser PUTs each part to its URL and keeps the returned <code>ETag</code>. To resume, call <code>listParts</code> and upload only what is missing.'
    },
    {
      title: 'Python: split → parallel encode (ffmpeg)', lang: 'python',
      code: `import subprocess
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

# (height, video kbps): illustrative ladder; per-title encoding would pick these per video
LADDER = [(1080, 4500), (720, 2500), (480, 1000), (360, 550)]

def split(src: str, out: Path, seconds: int = 60) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    # stream copy cuts only at keyframes, so chunks start with an IDR frame
    subprocess.run(["ffmpeg", "-y", "-i", src, "-map", "0:v:0", "-c", "copy",
                    "-f", "segment", "-segment_time", str(seconds),
                    "-reset_timestamps", "1", str(out / "chunk_%04d.mp4")], check=True)
    return sorted(out.glob("chunk_*.mp4"))

def encode(chunk: Path, height: int, kbps: int) -> Path:
    dst = chunk.with_name(f"{chunk.stem}_{height}p.mp4")
    subprocess.run(["ffmpeg", "-y", "-i", str(chunk), "-vf", f"scale=-2:{height}",
                    "-c:v", "libx264", "-preset", "medium",
                    "-b:v", f"{kbps}k", "-maxrate", f"{kbps * 3 // 2}k", "-bufsize", f"{kbps * 2}k",
                    "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",  # fixed 2 s GOP @24fps
                    "-an", str(dst)], check=True)                          # audio encoded once, separately
    return dst

def encode_all(src: str, work: Path) -> list[Path]:
    chunks = split(src, work)
    with ProcessPoolExecutor() as pool:   # one machine here; a task queue fans out in production
        jobs = [pool.submit(encode, c, h, k) for c in chunks for h, k in LADDER]
        return [j.result() for j in jobs]  # next: concat per rung, then package HLS/DASH`,
      note: 'Fixed, aligned GOPs mean every rendition has keyframes at the same timestamps, so the packager can cut segments that line up across rungs.'
    },
    {
      title: 'Python: BBA-0 buffer-based rate selection', lang: 'python',
      code: `def bba0(buf_s: float, ladder: list[int], prev: int,
         reservoir: float = 10.0, cushion: float = 30.0) -> int:
    """Huang et al., SIGCOMM 2014. ladder = sorted bitrates (kbps)."""
    r_min, r_max = ladder[0], ladder[-1]
    if buf_s <= reservoir:
        return r_min
    if buf_s >= reservoir + cushion:
        return r_max
    # linear map from buffer level to a target rate
    f = r_min + (r_max - r_min) * (buf_s - reservoir) / cushion
    higher = next((r for r in ladder if r > prev), r_max)
    lower = next((r for r in reversed(ladder) if r < prev), r_min)
    if f >= higher:                       # buffer clearly supports going up
        return max(r for r in ladder if r < f) if f > r_min else r_min
    if f <= lower:                        # buffer clearly says go down
        return min(r for r in ladder if r > f)
    return prev                           # hysteresis: stay put`
    }
  ],

  related: ['live-streaming', 'cdn', 'object-storage', 'job-scheduler', 'recommendation', 'file-sync']
});
