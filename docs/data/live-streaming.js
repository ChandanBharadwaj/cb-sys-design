SD.register({
  slug: 'live-streaming',
  domain: 4,
  title: 'Live Event Streaming',
  examples: 'Hotstar, JioCinema, YouTube Live',
  tagline: 'Stream one cricket match to <b>25 million people at once</b>. The video is the easy part. The hard part is the <b>login, home page and API wave</b> that hits when the toss happens or a star batter walks out.',
  tldr: {
    problem: 'Live audiences arrive in waves of millions within minutes: the toss, a wicket, the last over. Video segments are identical for everyone and cache well. The API tier (login, entitlement, home page, ads) does not, and autoscaling reacts too late.',
    idea: 'Encode once into an <b>ABR ladder</b>, package short <b>HLS/DASH segments</b>, and serve them through an <b>origin shield</b> and <b>several CDNs</b>. Pre-scale the API tier on a <b>ladder keyed to forecast concurrency</b>, and keep <b>panic switches</b> that shed non-critical features before playback suffers.',
    insight: 'Hotstar\'s engineers wrote that, given how long it takes, autoscaling is "a useless strategy" for spikes. They scale <i>ahead</i> of the event and keep headroom, then step capacity up or down a ladder as concurrency moves.',
    numbers: [
      { v: '25.3M', l: 'concurrent viewers, India v NZ World Cup semi-final (Hotstar, July 2019)' },
      { v: '18.6M', l: 'concurrent viewers, IPL final (Akamai press release, 2019)' },
      { v: '108K CPUs', l: 'load-generation fleet of Hotstar\'s Project HULK (re:Invent 2019 talk)' }
    ]
  },

  requirements: {
    functional: [
      'Ingest the venue feed over redundant paths',
      'Transcode to an ABR ladder and package HLS / DASH',
      'Play on phones, web and TVs, with a short DVR window',
      'Login, subscription and geo-rights checks before playback',
      'Live concurrency count and score overlays',
      'Ad breaks inserted for millions of viewers at once'
    ],
    nonFunctional: [
      '25M+ concurrent viewers; joins of ~1M/min in a spike (estimate)',
      'Glass-to-glass latency of 5–30 s depending on the mode',
      'Rebuffering well under 1% of watch time',
      'The API tier survives a 10× surge within minutes',
      'Degrade features gracefully; never stop playback',
      'Survive the loss of one encoder, one region or one CDN'
    ],
    outOfScope: ['VOD encoding pipeline (see Video Streaming)', 'DRM licence servers in detail', 'Recommendations', 'Chat and social features']
  },

  calculator: {
    inputs: [
      { id: 'viewers', label: 'Peak concurrent viewers', min: 100000, max: 60000000, value: 25000000, log: true },
      { id: 'mbps', label: 'Average delivered bitrate', min: 0.3, max: 8, step: 0.1, value: 1.5, unit: 'Mbps' },
      { id: 'seg', label: 'Segment (or LL-HLS part) duration', min: 1, max: 10, value: 4, unit: 's' },
      { id: 'rungs', label: 'ABR ladder rungs', min: 3, max: 10, value: 6 },
      { id: 'joins', label: 'Peak joins per minute (toss, wicket)', min: 10000, max: 5000000, value: 1000000, log: true },
      { id: 'calls', label: 'API calls per join (auth, entitlement, home, session)', min: 3, max: 30, value: 10 }
    ],
    outputs: [
      { label: 'CDN egress at peak', fmt: 'bits', f: (v) => v.viewers * v.mbps * 1e6 },
      { label: 'Edge requests/s (segment + playlist)', f: (v) => (2 * v.viewers) / v.seg },
      { label: 'Origin requests/s (5 shields, coalesced)', f: (v) => (5 * v.rungs * 2) / v.seg },
      { label: 'API requests/s in the join wave', f: (v) => (v.joins / 60) * v.calls },
      { label: 'API pods to pre-warm (1K req/s each, +30%)', f: (v) => Math.ceil(((v.joins / 60) * v.calls / 1000) * 1.3) },
      { label: 'Concurrency heartbeats/s (1 per viewer per 30 s)', f: (v) => v.viewers / 30 }
    ],
    note: 'The 25.3M and 18.6M peaks are published figures. Bitrate, join rate, calls per join and pod capacity are <em>estimates</em>. Compare the rows: the CDN carries tens of Tbps, yet a shield keeps the origin at a few requests per second. The <b>API join wave</b> is the number that needs pre-scaling.'
  },

  api: [
    { m: 'UDP', p: 'srt://ingest-a · ingest-b', d: 'Contribution feed from the venue over <b>SRT</b> (UDP with retransmission) or RTMP, sent to two ingest points so either can fail.' },
    { m: 'POST', p: '/v1/playback/sessions', d: 'Body <code>{content_id, device, drm, abr_caps}</code>. Checks login, subscription and geo-rights, then returns a <b>signed manifest URL</b> on the chosen CDN.' },
    { m: 'GET', p: '/live/{event}/master.m3u8', d: 'Multivariant playlist from the CDN. Rendition playlists refresh every target duration. LL-HLS uses <b>blocking reloads</b> with <code>_HLS_msn</code> and <code>_HLS_part</code>.' },
    { m: 'GET', p: '/live/{event}/{rung}/{n}.m4s', d: 'CMAF media segment or part. Immutable once written, so every CDN layer can cache it.' },
    { m: 'POST', p: '/v1/heartbeat', d: 'Every ~30 s: <code>{session_id, bitrate, buffer_ms, rebuffers, cdn}</code>. Feeds the concurrency counter, QoE dashboards and CDN steering.' },
    { m: 'GET', p: '/v1/config', d: 'Feature flags and <b>panic switches</b>. Short TTL and served from the CDN, so flipping a switch reaches every client within seconds.' }
  ],
  dataModel: [
    { name: 'playback_session', store: 'Redis (TTL 90 s)', fields: [['session_id', 'uuid', 'pk'], ['user_id', 'int64', 'idx'], ['event_id', 'text', 'idx'], ['cdn', 'text'], ['last_beat', 'ts']], note: 'Expires when heartbeats stop. Also enforces the devices-per-account limit.' },
    { name: 'cc:{event}:{minute}', store: 'Redis HyperLogLog', fields: [['key', 'event + minute', 'pk'], ['members', 'session ids'], ['ttl', '3 min']], note: '<code>PFADD</code> per heartbeat, <code>PFCOUNT</code> for concurrency. 12 KB per key, about 0.81% standard error.' },
    { name: 'entitlements', store: 'Postgres + cache', fields: [['user_id', 'int64', 'pk'], ['plan', 'enum'], ['region', 'text'], ['valid_until', 'ts']], note: 'Read on every join. Pre-warm the cache before the match.' },
    { name: 'flags', store: 'Config service', fields: [['flag', 'text', 'pk'], ['state', 'on | off | %'], ['ladder_level', 'int'], ['updated_by', 'text']], note: 'Panic switches are flags too. Test every one before the event.' }
  ],

  architecture: {
    title: 'Live event streaming architecture',
    nodes: [
      { id: 'venue', label: 'Stadium feed', sub: 'contribution encoder', kind: 'external', wide: [90, 0], tall: [70, 0], tip: 'The broadcast truck produces a high-bitrate mezzanine feed and sends it over two independent links.' },
      { id: 'ingest', label: 'Ingest A / B', sub: 'SRT · RTMP, redundant', kind: 'edge', wide: [290, 0], tall: [210, 0], tip: 'Two ingest points in different regions. The transcoder fails over from A to B without the viewer noticing.' },
      { id: 'trans', label: 'Live transcoder', sub: 'ABR ladder · 6 rungs', kind: 'compute', wide: [490, 0], tall: [350, 0], tip: 'Encodes each rung (e.g. 240p to 1080p) with keyframes aligned to segment boundaries, so players can switch rungs at any segment.' },
      { id: 'pack', label: 'Packager', sub: 'HLS / DASH · CMAF', kind: 'service', wide: [690, 0], tall: [350, 105], tip: 'Cuts fMP4/CMAF segments (or LL-HLS parts), writes them, then updates the playlists.' },
      { id: 'origin', label: 'Origin', sub: 'segments + playlists', kind: 'store', wide: [890, 0], tall: [210, 105], tip: 'Holds the live window. Only the shields talk to it.' },
      { id: 'shield', label: 'Origin shield', sub: 'request coalescing', kind: 'cache', wide: [890, 115], tall: [70, 105], tip: 'A mid-tier cache in front of the origin. Many identical misses collapse into one upstream request.' },
      { id: 'cdn', label: 'Multi-CDN edge', sub: 'steered by QoE', kind: 'edge', wide: [690, 115], tall: [70, 210], tip: 'Two or more CDNs. New sessions go to whichever is performing best in that region and ISP.' },
      { id: 'player', label: 'Players', sub: 'phones · web · TVs', kind: 'client', wide: [290, 115], tall: [70, 315], tip: 'Picks a rung from measured throughput and buffer level, and sends a heartbeat every ~30 s.' },
      { id: 'api', label: 'Playback API', sub: 'auth · rights · CDN pick', kind: 'service', wide: [290, 230], tall: [210, 315], tip: 'Login, entitlement, home page and playback session. This tier takes the join wave, so it is pre-scaled.' },
      { id: 'flags', label: 'Panic switches', sub: 'shed recs · cap bitrate', kind: 'service', wide: [90, 230], tall: [350, 315], tip: 'Feature flags that turn off non-critical features (recommendations, personalisation) or cap the top bitrate when load beats the forecast.' },
      { id: 'ent', label: 'Entitlements', sub: 'Postgres + cache', kind: 'store', wide: [490, 230], tall: [350, 420], tip: 'Subscriptions and rights. The cache is warmed before the match so the database never sees the full join wave.' },
      { id: 'cc', label: 'Concurrency', sub: 'heartbeats · Redis HLL', kind: 'cache', wide: [690, 230], tall: [70, 420], tip: 'Counts unique sessions per minute from heartbeats. Also aggregates QoE per CDN for steering.' },
      { id: 'scaler', label: 'Ladder scaler', sub: 'pre-warm by concurrency', kind: 'compute', wide: [490, 345], tall: [210, 420], tip: 'Steps capacity to the next rung of a pre-planned ladder when the headroom above current concurrency shrinks.' }
    ],
    edges: [
      { from: 'venue', to: 'ingest' },
      { from: 'ingest', to: 'trans' },
      { from: 'trans', to: 'pack' },
      { from: 'pack', to: 'origin' },
      { from: 'origin', to: 'shield', bidi: true },
      { from: 'shield', to: 'cdn', bidi: true },
      { from: 'player', to: 'cdn', bidi: true, label: 'segments' },
      { from: 'player', to: 'api', bidi: true },
      { from: 'flags', to: 'api', dashed: true },
      { from: 'api', to: 'ent' },
      { from: 'player', to: 'cc', label: 'heartbeat', bend: -0.12 },
      { from: 'cc', to: 'scaler' },
      { from: 'scaler', to: 'api' }
    ]
  },

  scenarios: [
    {
      id: 'pipeline', title: 'Steady state: one segment\'s journey', tone: 'info',
      steps: [
        { text: 'The venue sends a mezzanine feed over <b>SRT</b> to two ingest points. If link A drops, the transcoder switches to B.', flow: ['venue>ingest'], badges: { ingest: 'A ✓ · B ✓' } },
        { text: 'The transcoder encodes every rung of the <b>ABR ladder</b> with aligned keyframes, so a player can switch quality at any segment boundary.', flow: ['ingest>trans'], badges: { trans: '240p…1080p' } },
        { text: 'The packager cuts a <b>4 s CMAF segment</b>, writes it to the origin, and only then adds it to the playlist.', flow: ['trans>pack', 'pack>origin'], badges: { origin: 'seg #1042' } },
        { text: 'Players reload the playlist, see segment 1042 and fetch it from the CDN. Everyone wants the <b>same bytes</b>, so nearly every request is an edge hit.', flow: ['player>cdn', 'cdn>player'], badges: { cdn: ['HIT', 'ok'] }, tone: 'ok' },
        { text: 'Every ~30 s each player sends a heartbeat with bitrate, buffer and rebuffer count. That is the live concurrency number and the QoE signal.', flow: ['player>cc'], badges: { cc: '25.3M' } }
      ]
    },
    {
      id: 'toss', title: 'Hot spot: the toss brings millions in minutes', tone: 'warn',
      steps: [
        { text: 'The toss happens and a push notification goes out. <b>Millions open the app</b> within a few minutes. Each join makes ~10 API calls (estimate).', flow: [['player>api', 'player>api']], warn: ['api'], badges: { api: ['join wave', 'warn'] }, tone: 'warn' },
        { text: 'Entitlement reads hit a <b>cache warmed before the match</b>, so Postgres sees a trickle, not the wave.', flow: ['api>ent'], badges: { ent: 'cache hit' } },
        { text: 'The video tier barely notices: a new viewer wants the same segments as everyone else, and the edge already has them.', flow: ['player>cdn', 'cdn>player'], ok: ['cdn'] },
        { text: 'The API tier was <b>pre-scaled</b> 30–60 minutes before the toss, to a ladder level picked from the forecast plus headroom.', flow: ['scaler>api'], ok: ['api'], badges: { api: ['ladder L7', 'ok'] }, tone: 'ok' },
        { text: 'Heartbeats show concurrency climbing. When headroom drops below the threshold, the scaler steps to the next level <i>before</i> it is needed.', flow: ['player>cc', 'cc>scaler', 'scaler>api'], badges: { scaler: 'L7 → L8' } }
      ]
    },
    {
      id: 'autoscale', title: 'Failure: reactive autoscaling is too slow', tone: 'err',
      steps: [
        { text: 'No pre-scaling. A star batter walks out and a few million people join within two minutes.', flow: [['player>api', 'player>api']], err: ['api'], badges: { api: ['CPU 100%', 'err'] }, tone: 'err' },
        { text: 'A CPU alarm fires after a 1–3 minute metric delay. New nodes then need to boot, pull images and warm up, so capacity arrives <b>minutes after</b> the spike.', nodes: ['scaler'], warn: ['scaler'], badges: { scaler: ['+5 min', 'warn'] }, tone: 'warn' },
        { text: 'Requests time out and clients retry, so load multiplies. Logins fail and people see an error screen just as the moment they came for happens.', flow: ['player>api'], err: ['api', 'player'], tone: 'err' },
        { text: 'Hotstar\'s fix: scale <b>ahead</b> of the event from pessimistic traffic models, keep headroom, and step a ladder by concurrency. Their re:Invent talk also cited ASG step limits and insufficient-capacity errors.', flow: ['cc>scaler', 'scaler>api'], ok: ['api'], badges: { api: ['pre-warmed', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'herd', title: 'Thundering herd on a new segment', tone: 'warn',
      steps: [
        { text: 'Segment 1043 is published. Millions of players want it within the same second, and every CDN edge server misses at once.', flow: [['player>cdn', 'player>cdn'], 'cdn>shield'], warn: ['cdn'], badges: { cdn: ['MISS ×N', 'warn'] }, tone: 'warn' },
        { text: 'Without a shield, every edge server asks the origin directly. Thousands of identical requests can knock it over.', nodes: ['origin'], err: ['origin'], badges: { origin: ['overload', 'err'] }, tone: 'err' },
        { text: 'With a shield and <b>request coalescing</b>, only the first miss goes upstream. The others wait on that same fetch.', flow: ['shield>origin', 'origin>shield'], ok: ['origin'], badges: { shield: ['1 upstream', 'ok'] }, tone: 'ok' },
        { text: 'The response streams back to every waiting edge server and on to the players. With LL-HLS <b>blocking playlist reloads</b>, requests arrive in sync, so coalescing is not optional.', flow: ['shield>cdn', 'cdn>player'], ok: ['cdn'], tone: 'ok' }
      ]
    },
    {
      id: 'panic', title: 'A CDN degrades during the final over', tone: 'err',
      steps: [
        { text: 'Heartbeats from one region show rebuffering rising on <b>CDN-X</b>.', flow: ['player>cc'], err: ['cdn'], badges: { cdn: ['CDN-X rebuffer ↑', 'err'] }, tone: 'err' },
        { text: 'The playback API steers <b>new sessions</b> to CDN-Y for that region and ISP. Existing players switch at their next session refresh or on errors.', flow: ['cc>scaler', 'player>api'], badges: { api: 'route → CDN-Y' }, tone: 'warn' },
        { text: 'Load is above the forecast, so on-call flips <b>panic switches</b>: recommendations and personalisation turn off, and the top bitrate is capped.', flow: ['flags>api'], warn: ['flags'], badges: { flags: ['panic: on', 'warn'] }, tone: 'warn' },
        { text: 'Playback keeps going. Lower bitrates also cut CDN egress (Hotstar describes this as progressive degradation). Features come back as the crowd thins out.', flow: ['player>cdn', 'cdn>player'], ok: ['cdn', 'player'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'A 25M-viewer match. Each control is a real design decision; latency and capacity numbers are rough, illustrative <em>estimates</em>.',
    diagram: null, // filled below to add the optional SSAI stitcher
    controls: [
      { id: 'mode', label: 'Latency mode', type: 'seg', value: 'll', options: [
        { v: 'hls', l: 'Classic HLS (6 s segments)' }, { v: 'll', l: 'LL-HLS (1 s parts)' }, { v: 'webrtc', l: 'WebRTC' }] },
      { id: 'scale', label: 'API scaling', type: 'seg', value: 'ladder', options: [
        { v: 'reactive', l: 'Reactive autoscale' }, { v: 'ladder', l: 'Pre-warmed ladder' }] },
      { id: 'cdn', label: 'Delivery', type: 'seg', value: 'multi', options: [
        { v: 'single', l: 'Single CDN' }, { v: 'multi', l: 'Multi-CDN + steering' }] },
      { id: 'degrade', label: 'Graceful degradation', type: 'seg', value: 'on', options: [
        { v: 'off', l: 'Off' }, { v: 'on', l: 'Panic switches' }] },
      { id: 'ads', label: 'Ad insertion', type: 'seg', value: 'client', options: [
        { v: 'client', l: 'Client-side ads' }, { v: 'ssai', l: 'Server-side (SSAI)' }] }
    ],
    evaluate(s) {
      const V = 25e6;
      const m = {
        hls: { lat: '≈ 20–30 s', ls: 0.35, cv: 'segments + playlists cache well', cs: 0.95, cost: '1× (baseline)', cos: 0.85, part: 6 },
        ll: { lat: '≈ 3–6 s', ls: 0.75, cv: 'cacheable, but many small parts', cs: 0.8, cost: '≈ 1.1–1.3×', cos: 0.7, part: 1 },
        webrtc: { lat: '< 1 s', ls: 0.95, cv: 'none: stateful media servers', cs: 0.1, cost: '≈ several ×', cos: 0.2, part: 0 }
      }[s.mode];
      let err = s.scale === 'reactive' ? 0.12 : 0.005;          // share of joins failing in the wave (illustrative)
      if (s.degrade === 'on') err *= 0.4;
      const ssaiRps = m.part ? V / m.part : 0;
      const metrics = [
        { k: 'Glass-to-glass latency', v: m.lat, s: m.ls },
        { k: 'Edge cacheability', v: m.cv, s: m.cs },
        { k: 'Delivery cost / viewer', v: m.cost, s: m.cos, hint: 'estimate' },
        { k: 'Failed joins in the wave', v: (err * 100).toFixed(1) + '%', s: err < 0.01 ? 0.92 : err < 0.06 ? 0.5 : 0.12, hint: s.scale === 'reactive' ? 'capacity arrives late' : 'headroom ready' },
        { k: 'CDN incident impact', v: s.cdn === 'multi' ? 'steer away in ~1 heartbeat' : 'region rebuffers until fixed', s: s.cdn === 'multi' ? 0.85 : 0.25 },
        { k: 'Ad delivery', v: s.ads === 'client' ? 'blockable; breaks drift by device' : m.part ? SD.fmt.num(ssaiRps) + ' personal playlists/s' : 'stitched in media servers', s: s.ads === 'client' ? 0.5 : m.part === 1 ? 0.35 : 0.65, hint: s.ads === 'ssai' && m.part ? 'not cacheable' : '' },
        { k: 'Safety valve under overload', v: s.degrade === 'on' ? 'shed recs · cap bitrate' : 'none: all or nothing', s: s.degrade === 'on' ? 0.85 : 0.2 }
      ];
      const notes = [];
      if (s.mode === 'hls') notes.push('Latency is about 3 segments of buffer plus encode and CDN time. Viewers hear the crowd from a neighbour\'s TV before they see the wicket.');
      if (s.mode === 'll') notes.push('LL-HLS publishes <b>partial segments</b> (<code>EXT-X-PART</code>) and holds playlist requests until the next part exists. Apple recommends a <code>PART-HOLD-BACK</code> of at least 3 part targets.');
      if (s.mode === 'webrtc') notes.push('WebRTC sends media over UDP from SFU servers that keep per-viewer state. There is no shared HTTP cache, so cost grows with every viewer.');
      if (s.scale === 'reactive') notes.push('Metric delay plus boot and warm-up adds up to minutes. A toss wave peaks in less time than that.');
      if (s.scale === 'ladder') notes.push('Ladder levels come from the forecast (fixture, teams, time of day) plus headroom. Step up when headroom shrinks; step down slowly.');
      if (s.ads === 'ssai') notes.push('SSAI rewrites each viewer\'s playlist to point at ad segments. The ad segments themselves are cached, but the playlists are per viewer.');
      if (s.cdn === 'multi') notes.push('Steering uses the QoE from heartbeats, per region and ISP, and keeps each CDN\'s capacity commitment in mind.');
      let verdict;
      if (s.mode === 'webrtc') verdict = '⚠ <b>Sub-second, but WebRTC for 25M viewers</b> means a huge fleet of stateful media servers and no CDN caching. Use it for interactive streams, not a national broadcast.';
      else if (s.scale === 'reactive') verdict = '❌ <b>Autoscaling reacts minutes after the spike.</b> The toss wave hits a cold API tier. Pre-scale on a ladder.';
      else if (s.cdn === 'single') verdict = '⚠ <b>One CDN is a single point of failure</b> for 25M viewers. Add a second and steer by QoE.';
      else if (s.degrade === 'off') verdict = '⚠ <b>No safety valve.</b> When load beats the forecast, everything degrades at once. Add panic switches and test each one.';
      else if (s.mode === 'll' && s.ads === 'ssai') verdict = '👍 <b>Strong setup; watch the ad stitcher.</b> Personal LL-HLS playlists mean tens of millions of uncacheable requests per second.';
      else if (s.mode === 'll') verdict = '✅ <b>Close to what large broadcasters run:</b> LL-HLS for a few seconds of latency, a pre-warmed ladder, multi-CDN and panic switches.';
      else verdict = '✅ <b>Most robust and cheapest delivery.</b> The cost is sitting 20–30 s behind live TV.';
      const flow = ['venue>ingest', 'ingest>trans', 'trans>pack', 'pack>origin', 'origin>shield', 'shield>cdn']
        .concat(s.ads === 'ssai' ? ['player>cdn', 'cdn>ads', 'ads>shield'] : ['player>cdn', 'cdn>player'])
        .concat(['player>api', 'player>cc', 'cc>scaler', 'scaler>api']);
      return {
        metrics, verdict, notes, flow,
        labels: {
          pack: { label: 'Packager', sub: { hls: 'HLS · 6 s segments', ll: 'LL-HLS · 1 s parts', webrtc: 'RTP · WebRTC' }[s.mode] },
          cdn: s.mode === 'webrtc' ? { label: 'SFU fleet', sub: 'stateful media servers' } : s.cdn === 'multi' ? { label: 'Multi-CDN edge', sub: 'steered by QoE' } : { label: 'Single CDN', sub: 'one vendor' },
          scaler: s.scale === 'ladder' ? { label: 'Ladder scaler', sub: 'pre-warm by concurrency' } : { label: 'Autoscaler', sub: 'CPU alarm → add nodes' },
          flags: s.degrade === 'on' ? { label: 'Panic switches', sub: 'shed recs · cap bitrate' } : { label: 'Feature flags', sub: 'no panic mode' }
        },
        hide: s.ads === 'ssai' ? [] : ['ads'],
        hot: s.ads === 'ssai' ? ['ads'] : [],
        warn: (s.cdn === 'single' || s.mode === 'webrtc' ? ['cdn'] : []).concat(s.degrade === 'off' ? ['flags'] : []),
        err: s.scale === 'reactive' ? ['api'] : [],
        ok: s.scale === 'ladder' ? ['api'] : [],
        badges: { api: [(err * 100).toFixed(1) + '% joins fail', err < 0.01 ? 'ok' : 'err'] }
      };
    }
  },

  widget: {
    title: 'A match night: reactive autoscaling vs a pre-warmed ladder',
    caption: 'An <b>illustrative</b> concurrency curve for a cricket match (toss, wickets, innings break, last-over finish). Both strategies see the same demand. Press <b>⚡ Star batter walks out</b> to add a surprise wave, and change the provisioning delay or headroom to see who drops users.'
  },

  realWorld: {
    intro: 'Hotstar (now JioHotstar) has written the most about this problem. Later JioHotstar records of 50M+ appear only in unofficial blogs, so they are not used here.',
    timeline: [
      { when: '2017', who: 'Hotstar', title: '"Scaling is not an accident"', text: 'Hotstar rejected autoscaling for spikes because provisioning takes too long. It built <b>pessimistic traffic models</b> that produced <b>ladders</b>: server-farm sizes for each level of estimated concurrency. Client-server calls were reviewed so the system could signal high load gracefully, or use <b>panic switches</b>.', src: 1 },
      { when: 'Pre-2019', who: 'Hotstar', title: 'Progressive degradation', text: 'Because bandwidth is hard-limited, bitrates are stepped down as concurrency rises. Every panic scenario was tested against its stated behaviour before the event.', src: 2 },
      { when: 'May 2019', who: 'Hotstar · Akamai', title: '18.6M concurrent for the IPL final', text: 'Akamai announced that Hotstar streamed the VIVO IPL final to <b>18.6 million simultaneous viewers</b>, a record at the time.', src: 0 },
      { when: 'Jul 2019', who: 'Hotstar', title: '25.3M concurrent and the re:Invent talk', text: 'The India v New Zealand semi-final reached <b>25.3M</b>. At re:Invent (CMY302) Hotstar explained why AWS autoscaling groups failed them (insufficient capacity errors, one instance type per group, step-size limits). It described pre-warming before matches, scaling on request rate or platform concurrency, and its <b>Project HULK</b> load tests and chaos engineering on ~108K CPUs across 8 regions.', src: 4 },
      { when: '2019', who: 'Hotstar', title: 'Kubernetes and a custom scaler', text: 'Hotstar described static ladders stepped up or down "basis the amount of headroom left", a bet on Kubernetes for 2019, and a custom autoscaling engine that ran in shadow mode until there was enough data to trust it.', src: 3 },
      { when: '2019–20', who: 'Apple', title: 'Low-Latency HLS', text: 'LL-HLS adds <b>partial segments</b> (<code>EXT-X-PART</code>), <b>preload hints</b>, <b>blocking playlist reload</b> (<code>_HLS_msn</code>, <code>_HLS_part</code>) and <code>EXT-X-SERVER-CONTROL</code>. It keeps HTTP caching while cutting latency to a few seconds.', src: 5 },
      { when: '2022', who: 'Twitch', title: 'Intelligest ingest routing', text: 'Twitch replaced static HAProxy routing from ingest PoPs to one origin with a media proxy plus a routing controller, so live streams can move to any origin that has transcoding capacity.', src: 6 }
    ],
    lessons: [
      'Separate <b>cacheable video</b> from the <b>uncacheable API</b>. Plan capacity for the API join wave.',
      '<b>Pre-scale</b> from a forecast, keep headroom, and step a ladder. Do not wait for CPU alarms.',
      'Protect the origin with <b>shields and request coalescing</b>, and keep more than one CDN.',
      'Decide in advance <b>what you shed first</b>, and test every panic switch with load tests.'
    ],
    sources: [
      { title: 'With 18.6 Million Simultaneous Viewers Streaming VIVO IPL, Hotstar Shatters Viewership Record Again', url: 'https://www.akamai.com/newsroom/press-release/with-18.6-million-simultaneous-viewers-streaming-vivo-ipl-hotstar-shatters-viewership-record-again', pub: 'Akamai press release, 2019' },
      { title: 'Scaling Is Not An Accident', url: 'https://blog.hotstar.com/scaling-is-not-an-accident-895140ac84c0', pub: 'Hotstar Tech Blog' },
      { title: 'T For Tsunami: Dealing with traffic spikes', url: 'https://blog.hotstar.com/t-for-tsunami-dealing-with-traffic-spikes-c22443bcdd3e', pub: 'Hotstar Tech Blog' },
      { title: 'Scaling the Hotstar Platform for 50M', url: 'https://blog.hotstar.com/scaling-the-hotstar-platform-for-50m-a7f96a019add', pub: 'Hotstar Tech Blog, 2019' },
      { title: 'How Hotstar.com dealt with 25 million concurrent viewers (re:Invent 2019, CMY302)', url: 'https://dev.classmethod.jp/articles/reinvent-2019-cmy302/', pub: 'Classmethod session report, 2019' },
      { title: 'Enabling Low-Latency HTTP Live Streaming (HLS)', url: 'https://developer.apple.com/documentation/http-live-streaming/enabling-low-latency-http-live-streaming-hls', pub: 'Apple Developer docs' },
      { title: 'Ingesting Live Video Streams at Global Scale', url: 'https://blog.twitch.com/en/2022/04/26/ingesting-live-video-streams-at-global-scale/', pub: 'Twitch Blog, 2022' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Latency mode', '<b>Classic HLS/DASH</b>: cheapest and most robust, 20–30 s behind', '<b>LL-HLS / LL-DASH</b>: 3–6 s, still HTTP-cacheable', 'LL for sports where spoilers matter; WebRTC only for interactive use'],
      ['Scaling', '<b>Reactive autoscale</b>: no idle cost', '<b>Pre-warmed ladder</b>: pays for headroom', 'Ladder for scheduled events with known spikes'],
      ['Delivery', '<b>Single CDN</b>: simpler contracts and logs', '<b>Multi-CDN + steering</b>: survives a vendor incident', 'Multi-CDN once one outage would be front-page news'],
      ['Ads', '<b>Client-side</b>: simple, cacheable playlists', '<b>SSAI</b>: seamless and harder to block, but per-viewer playlists', 'SSAI for TV-like experiences; size the stitcher for the peak'],
      ['Segment length', '<b>Short (1–2 s)</b>: lower latency, faster rung switches', '<b>Long (4–6 s)</b>: fewer requests, better compression', '2–4 s, or LL-HLS parts under 6 s segments']
    ]
  },
  failures: [
    { f: 'Join wave beats capacity', detect: 'Login and session error rate; headroom below threshold', fix: 'Pre-warm a ladder level above forecast; queue joins with a waiting screen; shed non-critical calls.' },
    { f: 'Origin hit by every edge at once', detect: 'Origin request rate and latency on new segments', fix: 'Origin shield with request coalescing; long TTL for segments; short TTL for playlists only.' },
    { f: 'One CDN degrades', detect: 'Rebuffer ratio per CDN, region and ISP from heartbeats', fix: 'Steer new sessions to another CDN; switch existing players on errors.' },
    { f: 'Encoder or ingest link dies', detect: 'Missing segments or a stalled playlist', fix: 'Redundant A/B ingest and encoders; switch to the backup within one segment.' },
    { f: 'Retry storm from clients', detect: 'Requests per user rising while success rate falls', fix: 'Exponential backoff with jitter in the app, plus server-sent "retry after" hints.' },
    { f: 'Ad break for millions at once', detect: 'Ad decision latency and stitcher errors', fix: 'Pre-fetch ad decisions before the break; fall back to a slate if the ad server is slow.' }
  ],

  interview: [
    { q: 'Why can\'t autoscaling handle a live spike?', a: '<p>Autoscaling needs a metric to cross a threshold (often a 1–3 minute delay), then nodes must boot, pull images and warm caches. That takes minutes. A toss or wicket wave peaks faster than that, and on top of it, timeouts trigger retries that multiply the load.</p><p>So <b>scale ahead</b>: forecast the peak per match, pre-warm a ladder level with headroom, and step up when headroom shrinks. Hotstar described exactly this.</p>', lvl: 'core' },
    { q: 'How do you count concurrent viewers?', a: '<p>Each player sends a <b>heartbeat</b> every ~30 s with its session id. Count unique session ids per minute bucket. A <b>HyperLogLog</b> in Redis (<code>PFADD</code> / <code>PFCOUNT</code>) does this in 12 KB per key with ~0.81% error, and keys merge across shards. A session that misses two heartbeats has left.</p>', fu: 'Why not count TCP connections at the CDN? (HTTP segment fetches are not persistent sessions, and you would need every CDN\'s logs in real time.)', lvl: 'core' },
    { q: 'LL-HLS vs WebRTC?', a: '<p><b>LL-HLS</b> keeps plain HTTP: partial segments and blocking playlist reloads give a few seconds of latency, and every CDN can cache it. <b>WebRTC</b> gives sub-second latency over UDP, but each viewer needs a stateful connection to a media server (SFU), so there is no shared cache and cost grows with viewers.</p><p>For a 25M broadcast use LL-HLS; WebRTC is for interactive streams.</p>', lvl: 'core' },
    { q: 'How do you protect the origin from a thundering herd?', a: '<ul><li>Put an <b>origin shield</b> (mid-tier cache) between CDN edges and the origin.</li><li>Turn on <b>request coalescing</b>, so one miss goes upstream and the rest wait.</li><li>Cache segments for a long time (they are immutable) and playlists for about one target duration.</li><li>Use several shields, one per region, for redundancy.</li></ul>', lvl: 'core' },
    { q: 'How would you insert ads for 25M viewers?', a: '<p><b>SSAI</b>: a stitcher rewrites each viewer\'s playlist so the break points at ad segments, which are themselves cacheable. Ask the ad server for decisions <i>before</i> the break, because 25M decisions in the same second is a spike of its own. Fall back to a house slate if a decision is late.</p><p>Client-side ads are simpler, but ad blockers and device timing make them less reliable.</p>', lvl: 'deep' },
    { q: 'What do you shed first under overload?', a: '<p>Rank features by how much they matter to <b>playback</b>. Shed recommendations, personalised rails, social features and analytics first. Then cap the top bitrate, which also cuts CDN egress. Keep login, entitlement and the playback session to the end.</p><p>Make each step a tested <b>panic switch</b> that clients read from a cached config.</p>', lvl: 'core' },
    { q: 'How does a player choose its bitrate?', a: '<p>ABR logic measures throughput of recent segment downloads and the buffer level. If the buffer is healthy and throughput is high, it moves up a rung; if the buffer drains, it drops. It can switch only at segment boundaries, so the encoder aligns keyframes across rungs.</p>', lvl: 'core' },
    { q: 'How do you steer traffic across several CDNs?', a: '<p>Make the choice at <b>session start</b> in the playback API, from live QoE per CDN, region and ISP (rebuffer rate, start time, errors), plus each contract\'s committed capacity. Players can also fail over to a backup CDN URL on repeated errors. DNS-only steering is coarse and slow because resolvers cache answers.</p>', lvl: 'deep' },
    { q: 'How do you load-test for 25M viewers?', a: '<p>Generate traffic that looks like a real match: the join wave, browsing, heartbeats and segment fetches. Hotstar built <b>Project HULK</b> for this, plus "tsunami" tests and chaos engineering. Run tests well before the event, from several regions, and verify every panic switch.</p>', lvl: 'deep' },
    { q: 'What latency budget does classic HLS give you, and why?', a: '<p>Players usually buffer about <b>three segments</b> before playing. With 6 s segments that alone is ~18 s, plus encode, packaging and CDN time, so 20–30 s glass to glass. Shorter segments or LL-HLS parts cut the buffer, at the cost of more requests.</p>', lvl: 'core' },
    { q: 'What happens if the primary encoder fails mid-match?', a: '<p>Run <b>A/B ingest and encoders</b> in different regions, both producing the same segment numbering from the same timecode. The packager or origin switches to B\'s output; players see at most one segment of glitch. Test the failover during rehearsals.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot: panic switch + Resilience4j bulkhead', lang: 'java',
      code: `// resilience4j-spring-boot3. application.yml:
// resilience4j.bulkhead.instances.recs:
//   max-concurrent-calls: 200
//   max-wait-duration: 0ms      # fail fast, never queue
@Service
public class HomePageService {
  private final FeatureFlags flags;          // polled from the config service every 5 s
  private final PersonalRails rails;
  private final StaticRails popular;         // pre-rendered "popular now" rail

  public HomePageService(FeatureFlags flags, PersonalRails rails, StaticRails popular) {
    this.flags = flags; this.rails = rails; this.popular = popular;
  }

  public HomePage home(long userId, String matchId) {
    var page = new HomePage(matchId);
    page.add(page.liveCard());               // critical: always served
    page.add(flags.isOn("panic.recs")        // on-call flipped the switch
        ? popular.rail()
        : rails.forUser(userId));            // goes through the Spring proxy
    return page;
  }
}

@Service
class PersonalRails {
  private final RecsClient recs;
  private final StaticRails popular;
  PersonalRails(RecsClient recs, StaticRails popular) { this.recs = recs; this.popular = popular; }

  @Bulkhead(name = "recs", fallbackMethod = "fallback")
  public Rail forUser(long userId) {
    return recs.forUser(userId);             // saturated -> BulkheadFullException
  }

  private Rail fallback(long userId, Throwable t) {
    return popular.rail();
  }
}`,
      note: 'The bulkhead lives in a separate bean because Spring AOP annotations are skipped on calls inside the same class. A semaphore bulkhead caps concurrent calls, so a slow recommender can\'t take every request thread.'
    },
    {
      title: 'Python: concurrency with HyperLogLog + ladder', lang: 'python',
      code: `import math, time
import redis

r = redis.Redis()
LADDER = [2, 4, 6, 10, 15, 20, 25, 30, 40]   # millions of viewers per level

def heartbeat(event: str, session_id: str) -> None:
    minute = int(time.time() // 60)
    key = f"cc:{event}:{minute}"
    pipe = r.pipeline()
    pipe.pfadd(key, session_id)
    pipe.expire(key, 180)
    pipe.execute()

def concurrency(event: str) -> int:
    minute = int(time.time() // 60)
    # union of the current and previous minute: every 30 s heartbeat lands in it
    return r.pfcount(f"cc:{event}:{minute}", f"cc:{event}:{minute - 1}")

def target_level(viewers: int, headroom: float = 0.3) -> int:
    need = viewers * (1 + headroom) / 1e6
    for i, cap in enumerate(LADDER):
        if cap >= need:
            return i
    return len(LADDER) - 1                     # top of the ladder: shed load`,
      note: '<code>PFCOUNT</code> with several keys returns the cardinality of their union. A viewer who leaves drops out after about two minutes.'
    },
    {
      title: 'ffmpeg: live ABR ladder to HLS (CMAF)', lang: 'bash',
      code: `# 3-rung ladder from an SRT feed. 25 fps, GOP = 2 s, so a 4 s segment
# always starts on a keyframe and players can switch rungs at any segment.
ffmpeg -i "srt://0.0.0.0:9000?mode=listener" \\
  -filter_complex "[0:v]split=3[a][b][c];[a]scale=-2:1080[v0];[b]scale=-2:720[v1];[c]scale=-2:480[v2]" \\
  -map "[v0]" -map "[v1]" -map "[v2]" -map 0:a -map 0:a -map 0:a \\
  -c:v libx264 -preset veryfast -g 50 -keyint_min 50 -sc_threshold 0 \\
  -b:v:0 5000k -maxrate:v:0 5350k -bufsize:v:0 7500k \\
  -b:v:1 2800k -maxrate:v:1 3000k -bufsize:v:1 4200k \\
  -b:v:2 1400k -maxrate:v:2 1500k -bufsize:v:2 2100k \\
  -c:a aac -b:a 128k -ac 2 \\
  -f hls -hls_time 4 -hls_list_size 10 -hls_segment_type fmp4 \\
  -hls_flags independent_segments+delete_segments \\
  -master_pl_name master.m3u8 \\
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" out/stream_%v/index.m3u8`,
      note: 'Needs an ffmpeg build with libsrt. In production the transcoder is usually a managed service or GPU fleet, but the ladder, GOP alignment and variant map are the same ideas.'
    }
  ],

  related: ['video-streaming', 'cdn', 'rate-limiter', 'notifications', 'stream-analytics', 'distributed-cache']
});

/* knobs diagram = architecture + an optional SSAI stitcher */
(function () {
  const d = SD.data;
  const a = d.architecture;
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes.concat([{ id: 'ads', label: 'SSAI stitcher', sub: 'per-viewer playlists', kind: 'service', wide: [890, 230], tall: [210, 210], tip: 'Rewrites each viewer\'s playlist so ad breaks point at ad segments. The playlists are per viewer and cannot be cached.' }]),
    edges: a.edges.concat([{ from: 'cdn', to: 'ads', bidi: true }, { from: 'ads', to: 'shield', bidi: true }])
  };
})();
