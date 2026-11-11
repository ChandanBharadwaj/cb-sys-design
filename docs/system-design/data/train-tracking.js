SD.register({
  slug: 'train-tracking',
  domain: 2,
  title: 'Live Train Tracking (Offline)',
  examples: 'Where Is My Train (Google)',
  tagline: 'Tell a passenger where their train is and when it reaches the next station, from inside a coach with <b>no internet and no GPS fix</b>, using only the timetable on the phone and the <b>ID of the cell tower</b> it is connected to.',
  tldr: {
    problem: 'On Indian trains mobile data comes and goes, GPS inside a steel coach is slow and drains the battery, and official running status is only as fresh as the last report. A server-centric "live status" app is blank exactly when you need it.',
    idea: 'Ship the <b>timetable and a tower→track-segment map</b> to the phone ahead of time. On board, read the <b>serving cell ID</b> (free: the modem already knows it), look it up locally and combine it with the previous few cells and the timetable to get a <b>position with an error band</b>. Build that map by <b>crowdsourcing</b> GPS traces from opted-in riders.',
    insight: 'Cell IDs are noisy, but a <i>train</i> is the easiest thing to locate: it is stuck on a known line and moves forward. Constrain the guess to the route and filter over time, and a few-km cell becomes a usable fix.',
    numbers: [
      { v: '10M+', l: 'Play Store downloads when Google acquired Sigmoid Labs (reported, Dec 2018)' },
      { v: 'a few km', l: 'cell-mode accuracy the founders call good enough; near stations close to GPS (founder interview)' },
      { v: '30 s', l: 'mid-section update interval of Indian Railways\' RTIS loco units (Ministry, 2022)' }
    ]
  },

  intro: {
    what: 'A live train tracker shows where your train is right now and when it will reach each upcoming station. The <b>offline</b> kind does this from inside a moving coach with no internet, using what the phone already has: a timetable downloaded earlier, and the ID of the <b>cell tower</b> the phone is connected to.',
    analogy: {
      icon: '🚉',
      title: 'A regular passenger counting landmarks',
      text: 'Someone who rides the same line every week knows where they are without a map: "we just passed the big water tank, so my station is about ten minutes away". They learned which landmarks sit beside which stretch of track by riding it many times. The app does the same with cell towers, learning from many earlier trips which tower IDs show up on which stretch. Unlike a landmark, one tower covers several kilometres, so the answer is a <b>range</b>, not a point.'
    },
    problem: 'You are on an overnight train through farmland. Mobile data drops every few minutes, GPS inside the coach takes ages to find satellites, and the official status was last updated two stations ago. You want to know <b>"where exactly is my train, and when do we reach my station?"</b> The answer has to come from the phone itself, without asking a server.',
    story: [
      {
        stage: 'naive',
        title: 'Ask a server for the live status',
        text: 'The app sends the train number to a <b>server</b>, which returns the latest official running status: last station passed and expected times. Easy to build, and it works at home on Wi-Fi.',
        scene: {
          nodes: [
            { id: 'phone', label: 'Your phone', sub: 'asks every minute', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'Status server', sub: 'train lookup', kind: 'service', at: [210, 0] },
            { id: 'feed', label: 'Official feed', sub: 'station reports', kind: 'external', at: [350, 0] }
          ],
          edges: [{ from: 'phone', to: 'api', bidi: true }, { from: 'feed', to: 'api' }],
          flow: ['phone>api', 'feed>api', 'api>phone']
        }
      },
      {
        stage: 'breaks',
        title: 'On the train there is no signal',
        text: 'Between towns the phone has <b>no data</b>, so the request never arrives. Turning on GPS does not help much: inside a coach it may take minutes to get a fix, and it drains the battery on a 20-hour journey. The screen shows a spinner or an old answer.',
        scene: {
          nodes: [
            { id: 'phone', label: 'Your phone', sub: 'no data', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'Status server', sub: 'unreachable', kind: 'service', at: [210, 0] },
            { id: 'feed', label: 'Official feed', sub: 'station reports', kind: 'external', at: [350, 0] },
            { id: 'gps', label: 'GPS', sub: 'no fix in coach', kind: 'external', at: [70, 110] }
          ],
          edges: [{ from: 'phone', to: 'api', bidi: true }, { from: 'feed', to: 'api' }, { from: 'gps', to: 'phone' }],
          flow: ['phone>api', 'gps>phone'],
          err: ['phone'],
          warn: ['gps'],
          badges: { phone: ['no data', 'err'], gps: ['battery 🔋↓', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Carry the map, read the towers',
        text: 'Download the timetable and a <b>map from tower IDs to track positions</b> in advance. That map is built from GPS traces that past riders chose to share. On board, the phone reads which tower it is connected to (free, no data) and looks it up locally. The last few towers and the timetable narrow it down.',
        scene: {
          nodes: [
            { id: 'tower', label: 'Cell tower', sub: 'broadcasts its ID', kind: 'external', at: [70, 0] },
            { id: 'crowd', label: 'Past riders', sub: 'shared GPS traces', kind: 'client', at: [350, 0] },
            { id: 'phone', label: 'Your phone', sub: 'locates itself', kind: 'client', at: [70, 110] },
            { id: 'pack', label: 'Offline pack', sub: 'timetable + map', kind: 'cache', at: [210, 110] },
            { id: 'build', label: 'Map builder', sub: 'tower → track km', kind: 'compute', at: [350, 110] }
          ],
          edges: [{ from: 'tower', to: 'phone' }, { from: 'pack', to: 'phone' }, { from: 'crowd', to: 'build' }, { from: 'build', to: 'pack' }],
          flow: ['crowd>build', 'build>pack', 'tower>phone', 'pack>phone'],
          ok: ['phone', 'pack'],
          badges: { phone: ['km 213 ± 1.5', 'ok'] }
        }
      }
    ],
    usedBy: ['Where Is My Train (Google)', 'Google Maps train status in India', 'Indian Railways NTES', 'Offline timetable apps for metros and buses', 'Cell-ID positioning in phone location services'],
    whenToUse: [
      'Users are <b>moving along a fixed path</b> (rail, metro, a ferry route) and are often offline',
      'GPS is weak or too costly in battery, but a <b>coarse, constant signal</b> (cell, Wi-Fi, beacons) is always there',
      'Enough users travel the same path to <b>crowdsource</b> the signal map'
    ],
    whenNot: [
      'Vehicles move freely on roads and you have a data connection (see <a href="ride-sharing.html">Ride-Sharing Location &amp; Dispatch</a>)',
      'You need metre-level or safety-grade positions: signalling uses track circuits, axle counters and on-board units, not phones',
      'You are finding places near the user rather than tracking motion (see <a href="proximity-service.html">Proximity Service</a>)'
    ],
    glossary: [
      { term: 'Cell ID', def: 'The identifier of the tower sector a phone is connected to; written in full as country code, network code, area code and cell number (MCC-MNC-LAC-CID).' },
      { term: 'Serving cell', def: 'The one cell the phone is currently attached to; the phone hands over to a new one as the train moves.' },
      { term: 'Track segment', def: 'A short, fixed piece of a railway line (say 0.5 km) used as the unit of position.' },
      { term: 'Tower→segment map', def: 'A table saying, for each cell ID, which track segments it was heard on and how often.' },
      { term: 'Map matching', def: 'Snapping a noisy GPS fix onto the nearest point of the known track.' },
      { term: 'Dead reckoning', def: 'Estimating position from the last known position plus expected speed and elapsed time, with no new measurement.' },
      { term: 'Running status', def: 'The railway\'s official record of when a train arrived at or passed each station and how late it is.' },
      { term: 'HMM / Viterbi', def: 'A hidden Markov model treats the true segment as hidden and the cell IDs as clues; Viterbi finds the most likely sequence of segments.' }
    ]
  },

  requirements: {
    functional: [
      'Search a train and see where it is now, plus the next stations',
      'Works fully offline once the region pack is downloaded',
      'ETA and expected delay at each upcoming station',
      'Destination alarm: wake me before my stop',
      'Opt-in sharing of anonymised traces to improve the map',
      'Platform numbers and halts where known'
    ],
    nonFunctional: [
      'Position within a few km on open line, tighter near stations',
      'Extra battery ≲ 1–2 %/h in cell mode (target, estimate)',
      'Map updates as small deltas: a few MB a month (target)',
      'Runs on low-end Android with little storage',
      'No raw location leaves the phone without opt-in',
      'New or changed cells usable within days'
    ],
    outOfScope: ['Ticket booking (see Railway Ticketing)', 'Signalling and train control', 'Indoor navigation in stations', 'Freight train tracking']
  },

  calculator: {
    inputs: [
      { id: 'riders', label: 'Phones on trains using the app (peak)', min: 100000, max: 20000000, value: 2000000, log: true },
      { id: 'share', label: 'Share contributing GPS traces (opt-in)', min: 0.5, max: 30, step: 0.5, value: 5, unit: '%' },
      { id: 'interval', label: 'Contributor sample interval', min: 10, max: 120, step: 5, value: 30, unit: 's' },
      { id: 'bytes', label: 'Bytes per sample (cell key, fix, time)', min: 24, max: 200, step: 4, value: 48, fmt: 'bytes' },
      { id: 'km', label: 'Track to map (route km)', min: 5000, max: 100000, step: 1000, value: 68000, unit: 'km' },
      { id: 'seg', label: 'Segment length', min: 200, max: 2000, step: 100, value: 500, unit: 'm' }
    ],
    outputs: [
      { label: 'Crowd samples / second (peak)', f: (v) => v.riders * v.share / 100 / v.interval },
      { label: 'Raw ingest per day (peak rate for 24 h, upper bound)', fmt: 'bytes', f: (v) => v.riders * v.share / 100 / v.interval * v.bytes * 86400 },
      { label: 'Track segments', f: (v) => v.km * 1000 / v.seg },
      { label: 'Tower→segment rows (~6 cells per segment)', f: (v) => v.km * 1000 / v.seg * 6 },
      { label: 'Whole-network map on a phone (~8 B per row)', fmt: 'bytes', f: (v) => v.km * 1000 / v.seg * 6 * 8 },
      { label: 'Status polls/s avoided (every phone polling each 60 s)', f: (v) => v.riders / 60 }
    ],
    note: 'All inputs are <em>estimates</em>, not Google figures. About 68K route km is a rounded <em>estimate</em> of India\'s network. The point: the whole tower map is <b>a few MB</b>, so it fits on any phone, while making every rider poll a server would cost tens of thousands of requests per second for answers the phone can compute itself.'
  },

  api: [
    { m: 'GET', p: '/v1/packs/{region}?have=42', d: 'Offline pack: timetables, stations, platforms and the tower map. Returns <b>304</b>, a <b>delta</b> from the version the phone has, or the full pack. Immutable and cached by the CDN.' },
    { m: 'RPC', p: 'on-device locate(cells[], t)', d: 'Runs on the phone, no network. Last few cell IDs + timetable → <code>{segment, km, band_km}</code>.' },
    { m: 'POST', p: '/v1/traces:batch', d: 'Opt-in only. <code>{trip_token, samples: [{t, cell, lat, lng, acc}]}</code>. Uploaded later on Wi-Fi, with jitter. No account id.' },
    { m: 'GET', p: '/v1/trains/{no}/status?date', d: 'Online extra: official running status merged with crowd positions, cached per train for ~30 s.' },
    { m: 'GET', p: '/v1/trains/{no}/delays', d: 'Delay history per station (p50 / p90 by weekday), small enough to ship inside the pack.' }
  ],
  dataModel: [
    { name: 'tower_segment', store: 'Postgres → packed into files', fields: [['map_version', 'int', 'pk'], ['cell_key', 'mcc-mnc-lac-cid', 'pk'], ['segment_id', 'int', 'pk'], ['p', 'P(cell | segment)'], ['trips', 'int']], note: 'Built nightly from anonymised pings. Rows seen on fewer than k trips are dropped.' },
    { name: 'segment', store: 'Postgres (reference)', fields: [['segment_id', 'int', 'pk'], ['line_id', 'int', 'idx'], ['km_from, km_to', 'float'], ['station_code', 'text?'], ['next_ids', 'int[]']], note: 'The railway graph, cut into fixed lengths. Junctions have several next segments.' },
    { name: 'timetable', store: 'Pack file (on device)', fields: [['train_no', 'text', 'pk'], ['seq', 'int', 'sk'], ['station_code', 'text'], ['km', 'float'], ['arr, dep', 'time'], ['platform', 'text?']], note: 'The route fixes which segments a train can be on: the strongest constraint the locator has.' },
    { name: 'ping', store: 'Kafka → object store (TTL 90 d)', fields: [['trip_token', 'uuid', 'pk'], ['ts', 'timestamptz', 'sk'], ['cell_key', 'text'], ['segment_id', 'int?'], ['gps_acc_m', 'real']], note: 'No user id. The token is random per trip. The raw data is kept only long enough to rebuild the map.' }
  ],

  architecture: {
    title: 'Offline train tracking architecture (our design)',
    nodes: [
      { id: 'tower', label: 'Cell towers', sub: 'serving cell ID', kind: 'external', wide: [90, 0], tall: [70, 0], tip: 'Operators\' base stations. The phone always knows its serving cell, so reading it costs no data and little power. Operators publish no tower locations.' },
      { id: 'phone', label: 'Phone app', sub: 'on-device locator', kind: 'client', wide: [90, 220], tall: [70, 105], tip: 'Runs the locator: last few cell IDs + route + timetable → segment and error band. Uses GPS when it has a fix, and official status when online.' },
      { id: 'pack', label: 'Offline pack', sub: 'timetable + tower map', kind: 'cache', wide: [90, 440], tall: [70, 210], tip: 'Versioned files on the device: timetables, stations, platforms, the tower→segment table and delay history.' },
      { id: 'status', label: 'Status API', sub: 'online merge', kind: 'service', wide: [290, 0], tall: [210, 105], tip: 'Only when online: merges official running status, crowd positions and the delay model. Caches one answer per train.' },
      { id: 'ntes', label: 'Official status', sub: 'NTES · RTIS', kind: 'external', wide: [490, 0], tall: [350, 0], tip: 'Indian Railways\' running status (NTES). RTIS units on locomotives report positions through CRIS.' },
      { id: 'eta', label: 'Delay model', sub: 'history per station', kind: 'ml', wide: [490, 110], tall: [350, 105], tip: 'Learns how late each train usually is at each station, by weekday and season, and how delays recover.' },
      { id: 'ingest', label: 'Trace ingest', sub: 'opt-in · batched', kind: 'edge', wide: [290, 220], tall: [210, 210], tip: 'Accepts batched samples uploaded later on Wi-Fi with random jitter. Validates and rate-limits per install.' },
      { id: 'anon', label: 'Anonymiser', sub: 'strip ids · trim ends', kind: 'service', wide: [490, 220], tall: [210, 315], tip: 'Drops account and device ids, uses a random token per trip, cuts the first and last km of each trace, and coarsens timestamps.' },
      { id: 'kafka', label: 'Ping stream', sub: 'Kafka', kind: 'queue', wide: [690, 220], tall: [350, 315], tip: 'Durable buffer for anonymised samples. Feeds the map builder and the delay model.' },
      { id: 'builder', label: 'Map builder', sub: 'map-match · count', kind: 'compute', wide: [890, 220], tall: [350, 420], tip: 'Snaps each GPS fix to a track segment and counts (cell, segment) pairs over many trips. Drops pairs seen on fewer than k trips.' },
      { id: 'mapdb', label: 'Tower map DB', sub: 'cell → segments · v43', kind: 'store', wide: [890, 330], tall: [210, 420], tip: 'P(cell | segment) per map version. Old cells fade out of the window; new cells appear once enough trips see them.' },
      { id: 'packer', label: 'Pack builder', sub: 'versions + deltas', kind: 'compute', wide: [690, 440], tall: [70, 420], tip: 'Writes an immutable pack per region and version, plus binary deltas from recent versions.' },
      { id: 'cdn', label: 'CDN', sub: 'immutable packs', kind: 'edge', wide: [390, 440], tall: [70, 315], tip: 'Serves packs and deltas from cache. One origin fetch per (region, version) pair, not one per phone.' }
    ],
    edges: [
      { from: 'tower', to: 'phone', dashed: true, label: 'cell ID' },
      { from: 'pack', to: 'phone', bidi: true },
      { from: 'cdn', to: 'pack' },
      { from: 'phone', to: 'status', bidi: true },
      { from: 'ntes', to: 'status' },
      { from: 'eta', to: 'status' },
      { from: 'ntes', to: 'eta', dashed: true },
      { from: 'kafka', to: 'eta' },
      { from: 'phone', to: 'ingest' },
      { from: 'ingest', to: 'anon' },
      { from: 'anon', to: 'kafka' },
      { from: 'kafka', to: 'builder' },
      { from: 'builder', to: 'mapdb' },
      { from: 'mapdb', to: 'packer' },
      { from: 'packer', to: 'cdn' }
    ]
  },

  scenarios: [
    {
      id: 'offline', title: 'Offline: locate from cell IDs', tone: 'ok',
      steps: [
        { text: 'Before the trip, on Wi-Fi, the app fetched its region\'s <b>pack</b>: timetables plus the <b>tower→segment map</b>, as a small delta from the version it had.', flow: ['packer>cdn', 'cdn>pack'], badges: { pack: 'v43' } },
        { text: 'On board there is no data. The modem is already attached to a cell, so reading its <b>cell ID</b> costs no data and almost no battery.', flow: ['tower>phone'], badges: { phone: 'cell C17' } },
        { text: 'Local lookup: C17 was heard on km 212–219 of this route. The earlier cells (C15 › C16) and forward motion on the timetable leave km 212–214 as the best fit.', flow: ['phone>pack', 'pack>phone'], badges: { pack: 'km 212–219' } },
        { text: 'The app shows <b>km 213 ± 1.5</b> and an ETA from the remaining distance, the section speed and this train\'s usual delay here. Nothing left the phone.', nodes: ['phone'], ok: ['phone'], badges: { phone: ['km 213 ± 1.5', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'crowd', title: 'A shared trip improves the map', tone: 'info',
      steps: [
        { text: 'A rider who opted in has a GPS fix. Every 30 s the app logs <code>{cell, lat, lng, accuracy, time}</code>, then uploads the batch later on Wi-Fi.', flow: ['phone>ingest'], badges: { ingest: 'batch ✓' } },
        { text: 'The <b>anonymiser</b> drops account and device ids, gives the trip a random token, trims the first and last km, and coarsens timestamps.', flow: ['ingest>anon'], badges: { anon: 'no ids' } },
        { text: 'The map builder <b>map-matches</b> each fix to a track segment and counts (cell, segment) pairs over many trips. Pairs seen on fewer than 5 trips are dropped.', flow: ['anon>kafka', 'kafka>builder', 'builder>mapdb'], badges: { mapdb: '+3 cells' } },
        { text: 'The pack builder writes version 43 and a small <b>delta</b> from 42. Phones pick it up from the CDN the next time they are online.', flow: ['mapdb>packer', 'packer>cdn', 'cdn>pack'], badges: { cdn: ['Δ 42→43', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'junction', title: 'One cell covers two lines', tone: 'warn',
      steps: [
        { text: 'Near a junction, cell C40 serves both the main line and a branch. The table maps C40 to <b>two</b> stretches of track.', flow: ['tower>phone', 'phone>pack'], warn: ['pack'], badges: { pack: ['2 matches', 'warn'] }, tone: 'warn' },
        { text: 'One reading cannot decide. A last-cell lookup would jump the dot onto the branch for a minute.', nodes: ['phone'], warn: ['phone'], badges: { phone: ['main or branch?', 'warn'] } },
        { text: 'Constraints decide it. The chosen train\'s <b>route</b> uses only the main line, the earlier cells were on the main line, and trains only move <b>forward</b> along their route.', flow: ['pack>phone'], badges: { phone: 'route filter' } },
        { text: 'The filter (HMM / Viterbi) keeps both hypotheses briefly and drops the branch at the next handover. The band is wider for a minute, then shrinks.', nodes: ['phone'], ok: ['phone'], badges: { phone: ['main line ✓', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'rush', title: 'Hot spot: festival rush', tone: 'warn',
      steps: [
        { text: 'Before a festival, millions of travellers open the app on the same evening. Most only need the <b>static pack</b>.', flow: [['cdn>pack', 'cdn>pack']], warn: ['cdn'], badges: { cdn: ['spike', 'warn'] }, tone: 'warn' },
        { text: 'Packs are <b>immutable, versioned files</b>, so the CDN answers from cache. The origin sees one fetch per (region, version) pair, not one per phone.', flow: ['packer>cdn', 'cdn>pack'], ok: ['cdn'], badges: { cdn: ['cache hit', 'ok'] } },
        { text: 'Online users poll live status. The API caches one answer <b>per train</b> for ~30 s and collapses concurrent misses, so 50,000 people watching one train cost one upstream fetch.', flow: ['phone>status', 'ntes>status'], badges: { status: 'per-train cache' } },
        { text: 'Locating the train runs <b>on each phone</b>, so server load grows with the number of trains (thousands), not riders (millions). Trace uploads wait for Wi-Fi and are jittered.', flow: ['phone>ingest', 'ingest>anon'], ok: ['phone'], badges: { ingest: 'jittered' }, tone: 'ok' }
      ]
    },
    {
      id: 'deadzone', title: 'Failure: dead zone, then an unknown cell', tone: 'err',
      steps: [
        { text: 'The train enters a ghat section with <b>no coverage</b>. The phone sees no cell at all.', nodes: ['tower', 'phone'], err: ['tower'], badges: { tower: ['no service', 'err'] }, tone: 'err' },
        { text: '<b>Dead reckoning</b>: advance the estimate at the timetable speed for this stretch, corrected by history. The band grows every minute, because the real train may be slower or held at a signal.', flow: ['pack>phone'], warn: ['phone'], badges: { phone: ['± grows', 'warn'] }, tone: 'warn' },
        { text: 'Coverage returns, but the operator has re-planned its cells. The phone reports <b>C91</b>, which the pack does not know. The locator ignores it and keeps predicting: <b>never guess from an unknown cell</b>.', flow: ['tower>phone', 'phone>pack'], err: ['pack'], badges: { pack: ['unknown cell', 'err'] }, tone: 'err' },
        { text: 'The next known cell snaps the estimate back. Opted-in phones report C91 with GPS fixes. After enough trips it enters the map and the next delta.', flow: ['phone>ingest', 'ingest>anon', 'anon>kafka', 'kafka>builder', 'builder>mapdb'], ok: ['mapdb'], badges: { mapdb: ['C91 learned', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose how the phone finds its position, how the map gets to it, and how many riders share traces. Battery and data figures are <em>illustrative</em>, not measurements of any app.',
    controls: [
      { id: 'loc', label: 'Position source', type: 'seg', value: 'hybrid', options: [
        { v: 'gps', l: 'GPS only' }, { v: 'ntes', l: 'Official status (online)' }, { v: 'cell', l: 'Cell-tower map' }, { v: 'hybrid', l: 'Cell map + GPS when free' }] },
      { id: 'match', label: 'Tower matching', type: 'seg', value: 'hmm', options: [
        { v: 'last', l: 'Last cell lookup' }, { v: 'vote', l: 'Vote over last 5' }, { v: 'hmm', l: 'HMM on the route' }] },
      { id: 'sync', label: 'Map updates', type: 'seg', value: 'delta', options: [
        { v: 'none', l: 'Shipped with app' }, { v: 'full', l: 'Full pack weekly' }, { v: 'delta', l: 'Daily deltas' }] },
      { id: 'crowd', label: 'Riders sharing GPS traces', type: 'range', min: 0, max: 20, step: 1, value: 5, unit: '%', fmt: (v) => v + ' %' }
    ],
    evaluate(s) {
      const towers = s.loc === 'cell' || s.loc === 'hybrid';
      const learnDays = s.crowd > 0 ? 20 / (200 * s.crowd / 100) : Infinity;   // 20 trips needed; quiet line with 200 app users a day (illustrative)
      const publish = { delta: 1, full: 3.5, none: Infinity }[s.sync];        // average wait until phones have it
      const usable = learnDays + publish;
      const sparse = s.crowd > 0 ? 1 + 0.8 * Math.exp(-s.crowd / 2) : 2;       // thin map → wider bands
      const cellErr = { last: 3, vote: 1.6, hmm: 0.9 }[s.match] * sparse;
      const err = { gps: 0.04, ntes: 0.8, cell: cellErr, hybrid: 0.6 * cellErr + 0.4 * 0.04 }[s.loc];
      const data = { none: 0, full: 80, delta: 3 }[s.sync] + (s.loc === 'ntes' ? 6 : s.loc === 'hybrid' ? 0.5 : 0);
      const junction = s.loc === 'gps' ? ['rare', 0.9] : s.loc === 'ntes' ? ['none (official)', 0.95] : { last: ['often', 0.2], vote: ['sometimes', 0.55], hmm: ['rare (route + history)', 0.9] }[s.match];
      const dayStr = (d) => !isFinite(d) ? 'never' : d < 1 ? '< 1 day' : '≈ ' + Math.round(d) + ' days';
      const metrics = [
        { k: 'Typical position error', v: s.loc === 'gps' ? '≈ 20–50 m (with a fix)' : s.loc === 'ntes' ? '≈ 1 km, online only' : '≈ ' + err.toFixed(1) + ' km', s: err < 0.2 ? 0.95 : err < 1 ? 0.8 : err < 2 ? 0.55 : 0.25, hint: towers ? '± band' : '' },
        { k: 'Works with no internet', v: s.loc === 'ntes' ? 'no' : s.loc === 'gps' ? 'only with sky view' : 'yes', s: s.loc === 'ntes' ? 0.05 : s.loc === 'gps' ? 0.45 : 0.95 },
        { k: 'Extra battery per hour', v: { gps: '≈ 5–8 %', ntes: '≈ 1–3 % (radio)', cell: '< 1 %', hybrid: '≈ 1–2 %' }[s.loc], s: { gps: 0.15, ntes: 0.6, cell: 0.95, hybrid: 0.8 }[s.loc] },
        { k: 'Data per month', v: '≈ ' + (data < 1 ? data.toFixed(1) : Math.round(data)) + ' MB', s: data <= 5 ? 0.95 : data <= 20 ? 0.7 : 0.3, hint: { none: 'no updates', full: '4 × full pack', delta: 'small diffs' }[s.sync] },
        { k: 'New cell usable after', v: towers ? dayStr(usable) : 'n/a', s: !towers ? 0.6 : !isFinite(usable) ? 0.05 : usable <= 2 ? 0.95 : usable <= 7 ? 0.7 : 0.4, hint: s.crowd + ' % sharing' },
        { k: 'Wrong line at junctions', v: junction[0], s: junction[1] }
      ];
      const notes = [];
      if (s.loc === 'gps') notes.push('GPS inside a coach often has no fix at all, and keeping it on for a long journey drains the battery. Use it when it is <b>already on</b> (a crowd contributor, or the user checking speed), not as the only source.');
      if (s.loc === 'ntes') notes.push('Official running status is accurate where it is reported, but the phone needs data to see it. Offline, the screen is blank, which is the problem this design exists to solve.');
      if (towers) notes.push({ last: 'A last-cell lookup returns the whole coverage of one cell (several km) and jumps when a cell also covers a nearby line.', vote: 'Voting over the last 5 cells narrows the range to where their coverages overlap, but it ignores order and speed.', hmm: 'The HMM treats the segment as hidden and moves only forward along the train\'s own route, so a handover between two cells pins the position to their boundary.' }[s.match]);
      if (s.sync === 'none') notes.push('A map frozen at install never learns new or re-planned cells. Every re-plan by an operator turns a stretch of track into "unknown cell".');
      if (s.sync === 'full') notes.push('Re-downloading the full pack every week costs most users far more data than the few rows that changed. Deltas keep it in single-digit MB.');
      if (s.crowd === 0) notes.push('<b>Cold start:</b> with nobody sharing traces, the map has no way to learn. The founders describe building theirs from GPS traces collected by an early speedometer feature.');
      let verdict;
      if (s.loc === 'ntes') verdict = '❌ <b>Not offline.</b> Fine as an online extra; it cannot be the core of an app meant for trains with no signal.';
      else if (towers && s.crowd === 0) verdict = '❌ <b>Cold start never ends:</b> with no shared traces the tower map cannot be built or kept current.';
      else if (towers && s.sync === 'none') verdict = '⚠ <b>The map goes stale.</b> It works at launch and gets worse every month as operators change cells.';
      else if (s.loc === 'gps') verdict = '⚠ <b>Accurate, but costly and often blank in a coach.</b> Keep GPS as an extra signal, not the only one.';
      else if (s.match === 'last') verdict = '⚠ <b>Works, but jumpy.</b> The dot hops between cells and onto nearby lines. Filter over the route and the history.';
      else if (s.loc === 'hybrid' && s.match === 'hmm' && s.sync === 'delta') verdict = '✅ <b>Our recommended design:</b> an on-device cell map with a route-constrained filter, GPS when it is free, and daily deltas, consistent with what the app\'s founders describe in public.';
      else verdict = '👍 <b>Workable.</b> Check the meters to see what this combination costs you.';
      const flow = ({ gps: ['pack>phone'], ntes: ['ntes>status', 'status>phone'], cell: ['tower>phone', 'pack>phone'], hybrid: ['tower>phone', 'pack>phone', 'phone>status'] }[s.loc])
        .concat(s.sync === 'none' ? [] : ['mapdb>packer', 'packer>cdn', 'cdn>pack'])
        .concat(s.crowd > 0 ? ['phone>ingest', 'ingest>anon', 'anon>kafka', 'kafka>builder', 'builder>mapdb'] : []);
      return {
        metrics, verdict, notes, flow,
        labels: {
          phone: { label: 'Phone app', sub: { gps: 'GPS locator', ntes: 'online status only', cell: 'cell-ID locator', hybrid: 'cell + GPS fusion' }[s.loc] },
          pack: { label: 'Offline pack', sub: { last: 'cell → coverage', vote: 'cell → segments · vote', hmm: 'cell → P(segment) · HMM' }[s.match] },
          cdn: { label: 'CDN', sub: { none: 'not used', full: 'full packs weekly', delta: 'daily deltas' }[s.sync] },
          ingest: { label: 'Trace ingest', sub: s.crowd + ' % of riders' }
        },
        hot: s.loc === 'gps' ? ['phone'] : [],
        warn: (s.sync === 'none' ? ['pack'] : []).concat(s.match === 'last' && towers ? ['phone'] : []),
        err: (s.loc === 'ntes' ? ['phone'] : []).concat(s.crowd === 0 ? ['ingest', 'builder'] : []),
        badges: { phone: [s.loc === 'ntes' ? 'offline: blank' : '± ' + (s.loc === 'gps' ? '50 m' : err.toFixed(1) + ' km'), s.loc === 'ntes' ? 'err' : err < 1 ? 'ok' : 'warn'] }
      };
    }
  },

  widget: {
    title: 'Cell IDs → track position, with an error band',
    caption: 'A train runs a fictional 120 km line. Its real speeds differ from the timetable, and it makes one unplanned halt. In <b>cell mode</b> the phone sees only the serving cell ID. A filter over 0.5 km segments combines the crowdsourced <b>P(cell | segment)</b> table with forward motion along the timetable. Switch to <b>No signal</b> to watch the band grow, or cut the map to <b>2 crowd trips</b> to see the cold start.'
  },

  realWorld: {
    intro: 'Where Is My Train is the best-known product of this kind. Google has not published how its locator works. Below is only what the sources say; the architecture on this page is <b>our design</b> for building something similar.',
    timeline: [
      { when: 'Jun 2015', who: 'Sigmoid Labs', title: 'Where Is My Train launches on Android', text: 'A small Bengaluru team launches the app. Wikipedia credits it with using cell-tower data to work offline, and notes that it collects <b>anonymised location data</b> from users on trains to improve accuracy.', src: 5 },
      { when: 'Early years', who: 'Sigmoid Labs', title: 'Speedometer traces become the tower map', text: 'In an interview, the founders say an early <b>speedometer</b> feature collected GPS traces, which they later used to build the cell-tower mode, because there was no official tower-location data. They describe cell-mode accuracy as a <b>few km</b>, good enough for a train about half a km long, and <b>comparable to GPS near stations</b>.', src: 4 },
      { when: 'Nov 2018', who: 'YourStory', title: 'Works without internet or GPS', text: 'A review describes the app finding the train from <b>cell-tower information</b> with no GPS or internet, with timetables stored on the phone. Data is needed mainly when you are not on the train.', src: 3 },
      { when: 'Dec 2018', who: 'Google', title: 'Google acquires Sigmoid Labs', text: 'Google buys the company, and the team joins Google to keep working on the app. The app had <b>10M+ Play Store downloads</b>. The price was not disclosed; some reports said $30–40M, which Google did not confirm.', src: 0 },
      { when: 'Jun 2019', who: 'Google Maps', title: 'Live train status in Google Maps (India)', text: 'Google Maps adds live running status for Indian Railways trains, built with Sigmoid Labs, alongside bus travel times in 10 cities.', src: 6 },
      { when: 'Sep 2022', who: 'Indian Railways · ISRO', title: 'RTIS on locomotives', text: 'RTIS (Real-Time Train Information System) units were on <b>2,700 locomotives</b> in 21 electric loco sheds, with 6,000 more planned. They report position with <b>mid-section updates every 30 s</b> to a CRIS server that feeds NTES. Official data gets fresher, but it still reaches you only with data.', src: 7 },
      { when: '2025', who: 'Google', title: 'iOS version by Google', text: 'The App Store lists "Where is My Train" published by Google LLC, highlighting that it <b>works offline</b>. Reports differ on the exact launch month.', src: 8 }
    ],
    lessons: [
      'For a vehicle on rails, <b>the route is the best sensor</b>: constrain every guess to the track and to forward motion.',
      'Do the work <b>on the phone</b>. The server only builds and ships maps, so its load scales with trains, not riders.',
      'A signal map can be <b>crowdsourced</b> from a few riders who share traces, but it needs privacy rules from day one.',
      'Show <b>uncertainty</b> honestly. A band that grows in a dead zone earns more trust than a confident wrong dot.'
    ],
    sources: [
      { title: 'Google acquires Sigmoid Labs, developer of popular Indian app Where Is My Train', url: 'https://venturebeat.com/business/google-acquires-sigmoid-labs-developer-of-popular-indian-app-where-is-my-train', pub: 'VentureBeat, Dec 2018' },
      { title: 'Google acquires Sigmoid Labs, the startup behind train app Where is my Train', url: 'https://yourstory.com/2018/12/google-acquires-sigmoid-labs-train-app', pub: 'YourStory, Dec 2018' },
      { title: 'Google acquires Sigmoid Labs, maker of popular Where is My Train app', url: 'https://business-standard.com/article/companies/google-acquires-sigmoid-labs-maker-of-popular-where-is-my-train-app-118121000938_1.html', pub: 'Business Standard, Dec 2018' },
      { title: 'App Fridays: access IRCTC timetable, check live train status, set station alarms without internet', url: 'https://yourstory.com/2018/11/app-fridays-access-irctc-timetable-check-live-train-status-set-station-alarms-without-internet', pub: 'YourStory, Nov 2018' },
      { title: 'The untold story of Where Is My Train', url: 'https://newsletter.theindianotes.com/p/the-untold-story-of-where-is-my-trains', pub: 'The Indian Notes (founder interview)' },
      { title: 'Where Is My Train', url: 'https://en.wikipedia.org/wiki/Where_Is_My_Train', pub: 'Wikipedia' },
      { title: 'Google Maps launches 3 India-first features, including real-time train status', url: 'https://www.medianama.com/2019/06/223-google-maps-launches-3-india-first-features-including-accurate-bus-timings-real-time-train-status/', pub: 'MediaNama, Jun 2019' },
      { title: 'Indian Railways installs ISRO-developed RTIS system for real-time train tracking', url: 'https://theprint.in/india/indian-railways-installs-isro-developed-rtis-system-for-real-time-train-tracking/1140876', pub: 'ThePrint (Ministry statement), Sep 2022' },
      { title: 'Where is My Train - by Google', url: 'https://apps.apple.com/in/app/where-is-my-train-by-google/id6738965857', pub: 'Apple App Store listing' },
      { title: 'A Hidden Markov Model for Localization Using Low-End GSM Cell Phones', url: 'https://arxiv.org/pdf/1010.3411', pub: 'arXiv (research on HMM cell-based localization)' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Position signal', '<b>GPS</b>: metres, but slow to fix in a coach and costly in battery', '<b>Serving cell ID</b>: free and always there, but km-level', 'Cell as the default; GPS whenever it is already on'],
      ['Where to compute', '<b>On the phone</b>: works offline, private, no server load', '<b>On the server</b>: one place to fix bugs, but needs data', 'Phone for locating; server for building maps and delay models'],
      ['Locator', '<b>Vote over recent cells</b>: simple, explainable', '<b>HMM / Viterbi on the route</b>: uses order, speed and junctions', 'Start with voting; move to an HMM once junction errors show up'],
      ['Map delivery', '<b>Full pack</b>: simple, no version chain', '<b>Deltas from recent versions</b>: tiny downloads', 'Deltas for the last N versions; full pack for older installs'],
      ['Crowd data', '<b>Keep raw traces</b>: can rebuild with new algorithms', '<b>Keep only aggregates</b>: far less privacy risk', 'Raw with a short TTL and no ids; aggregates kept long term'],
      ['Online status', '<b>Official feed only</b>: authoritative', '<b>Merge with crowd positions</b>: fresher between reports', 'Merge, but label the source and prefer official data at stations']
    ]
  },
  failures: [
    { f: 'Dead zone (ghat, tunnel, remote stretch)', detect: 'No serving cell for N steps', fix: 'Dead-reckon along the timetable and history; widen the band each minute; snap back at the next known cell.' },
    { f: 'Operator re-plans cells (new IDs)', detect: 'Rising share of unknown cells on a stretch', fix: 'Ignore unknown cells, never guess. Learn them from opted-in traces and ship them in the next delta.' },
    { f: 'One cell covers two lines', detect: 'Two separate peaks in the belief', fix: 'Constrain to the chosen train\'s route, use cell history, and show a wider band until the next handover.' },
    { f: 'Bad crowd data (wrong train, fake GPS)', detect: 'Trace does not fit any timetabled run; speed impossible', fix: 'Drop traces that do not match a route; require k distinct trips per (cell, segment).' },
    { f: 'Corrupt or partial pack download', detect: 'Checksum mismatch on the pack', fix: 'Apply deltas atomically to a copy, verify the hash, and keep the old version until the new one passes.' },
    { f: 'Official feed down or late', detect: 'Feed freshness per train', fix: 'Fall back to crowd positions and the delay model, and show "estimated" in the UI.' },
    { f: 'Battery complaints', detect: 'Per-version energy telemetry', fix: 'No continuous GPS; sample cell changes passively; upload traces only on Wi-Fi while charging.' }
  ],

  interview: [
    { q: 'Why not just use GPS?', a: '<p>Inside a steel coach GPS often has no fix, the first fix can take minutes, and keeping it on for a 20-hour journey drains the battery. Many users also refuse the location permission.</p><p>The <b>serving cell ID</b> is already known to the modem, so reading it is essentially free. Use it as the default and treat GPS as a bonus when it happens to be on.</p>', lvl: 'core' },
    { q: 'Operators don\'t publish tower locations. How do you build the tower→track map?', a: '<p><b>Crowdsource it.</b> Riders who opt in log <code>(cell ID, GPS fix, time)</code>. On the server, <b>map-match</b> each fix to a track segment and count <code>(cell, segment)</code> pairs over many trips. Then <code>P(cell | segment) = count(cell, segment) / count(segment)</code>.</p><p>Drop pairs seen on fewer than k distinct trips, both for privacy and to filter noise. Where Is My Train\'s founders say they bootstrapped theirs from GPS traces collected by an early speedometer feature.</p>', fu: 'How many trips per stretch before the map is usable?', lvl: 'core' },
    { q: 'Walk me through locating the train from a sequence of cell IDs.', a: '<ul><li>The <b>hidden state</b> is the track segment. The route of the selected train limits which segments are allowed.</li><li><b>Transition</b>: each step, the train moves forward 0–k segments, centred on the timetable speed for that stretch, with some chance of being stopped.</li><li><b>Emission</b>: P(cell | segment) from the crowdsourced table.</li><li>Run a <b>forward filter</b> live (or Viterbi over the last few cells) and report the median and a 90% interval.</li></ul><p>A handover from one cell to the next is the most informative moment: it pins the train to the boundary between the two coverages.</p>', lvl: 'core' },
    { q: 'What do you do when one cell covers two lines near a junction?', a: '<p>Do not decide from one reading. Use the <b>route constraint</b> (the user chose a train, and its route uses only one of the lines), the <b>history</b> (the earlier cells were on one line) and <b>forward motion</b>. The HMM keeps both hypotheses with their probabilities until the next handover separates them. Meanwhile, show a wider band rather than a jumping dot.</p>', lvl: 'deep' },
    { q: 'How does the app behave in a dead zone?', a: '<p>Run only the <b>predict</b> step: dead reckoning along the timetable, at the historical speed for that stretch. The uncertainty grows every step, because the real train may be slower or stopped at a signal. The UI shows the growing band and says the position is estimated. The first known cell after the gap snaps the estimate back.</p>', lvl: 'core' },
    { q: 'How do you predict the ETA and the delay?', a: '<p>Start from the current position and the <b>remaining scheduled run time</b>. Add the train\'s <b>historical delay profile</b>: per train and station, p50/p90 by weekday and season, and how delays usually recover (timetables have slack before big stations).</p><p>Online, blend in official running status. Show a range, such as "arrives 14:20–14:35", rather than a single minute.</p>', fu: 'How would you evaluate the predictor? (Backtest against official arrival times.)', lvl: 'deep' },
    { q: 'How do you ship maps to millions of phones that are mostly offline?', a: '<p>Build an immutable <b>pack per region and version</b>, plus binary <b>deltas</b> from the last N versions. Phones call <code>GET /packs/{region}?have=v</code> and get a 304, a delta or the full pack. All of these are cacheable by a CDN, so the origin sees one fetch per (region, version).</p><p>Apply each delta to a copy and verify a checksum before swapping, so a half-finished download never breaks the app.</p>', lvl: 'core' },
    { q: 'What are the privacy risks, and how do you handle them?', a: '<ul><li>Location traces identify homes and workplaces, so sharing must be <b>opt-in</b>, with a clear explanation.</li><li>Drop account and device ids, and use a <b>random token per trip</b>.</li><li><b>Trim</b> the first and last km of every trace, and coarsen timestamps.</li><li>Publish only <b>aggregates</b> with a k-trip floor, and keep raw traces for a short TTL.</li><li>The locator runs on the phone, so normal use sends <b>no location</b> at all.</li></ul>', lvl: 'core' },
    { q: 'How do you cold-start a brand-new route?', a: '<p>Ship the timetable and track geometry first. The app then works in <b>timetable plus GPS</b> mode (and official status when online), while the first opted-in riders\' traces fill the cell map. Mark segments with too few trips as <b>low confidence</b>, so the locator falls back to dead reckoning there instead of trusting a sparse table. Prioritise contribution prompts on new or sparse routes.</p>', lvl: 'deep' },
    { q: 'Several trains share the same track. Does that confuse the system?', a: '<p>Not the locator: each phone locates <b>itself</b>, and the cell map describes the <b>track</b>, not a train. It matters for crowd data. A trace must be attributed to the right train before it feeds delay statistics or live crowd positions. Use the train the user selected, then check that the trace fits that train\'s timetable. Reject traces that fit a different train or no train at all.</p>', lvl: 'deep' },
    { q: 'How do you scale the online part during a festival rush?', a: '<p>Most of the work is on the phone. Packs are static and CDN-cached. Live status is cached <b>per train</b> for ~30 s, with request coalescing, so load scales with the number of trains rather than riders. Trace uploads are deferred to Wi-Fi with random jitter, and ingest is buffered in Kafka, so a spike never reaches the map builder.</p>', lvl: 'core' },
    { q: 'Cell IDs change over time. How does the map stay correct?', a: '<p>Use the full key (MCC-MNC-LAC/TAC-CID), because a bare cell number is reused across areas. Build each map version from a <b>sliding window</b> (say 90 days), so retired cells fade out. Monitor the <b>unknown-cell rate</b> per stretch, a direct signal that an operator re-planned, and add cells as soon as k trips have seen them.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Python: Viterbi locator over track segments', lang: 'python',
      code: `import math
from collections import Counter

def build_table(pings):
    """pings: (cell, segment) pairs from opt-in GPS trips -> P(cell | segment)."""
    pair, seg = Counter(pings), Counter(s for _, s in pings)
    table = {}
    for (cell, s), n in pair.items():
        table.setdefault(cell, {})[s] = n / seg[s]
    return table

def locate(cells, table, n_seg, max_step=2, floor=1e-3):
    """Viterbi over track segments. cells = serving-cell IDs, oldest first,
    one per 30 s. The train moves forward 0..max_step segments per step."""
    lg = lambda p: math.log(max(p, floor))
    def emit(cell, s):                       # unknown cell -> no evidence
        return 0.0 if cell not in table else lg(table[cell].get(s, 0))
    score = [emit(cells[0], s) for s in range(n_seg)]
    back = []
    for cell in cells[1:]:
        ptr = [max(range(max(0, s - max_step), s + 1), key=score.__getitem__)
               for s in range(n_seg)]
        score = [score[p] + emit(cell, s) for s, p in zip(range(n_seg), ptr)]
        back.append(ptr)
    s = max(range(n_seg), key=score.__getitem__)
    path = [s]
    for ptr in reversed(back):
        s = ptr[s]
        path.append(s)
    return path[::-1]                        # segment per observation; last = now

# 10 one-km segments. Cell X is heard at km 1-2 AND km 8-9 (two lines pass close).
cover = {'A': (0, 1, 2), 'X': (1, 2, 8, 9), 'B': (3, 4, 5), 'D': (5, 6, 7), 'E': (7, 8, 9)}
t = build_table([(c, s) for c, segs in cover.items() for s in segs])
print(locate(['X'], t, 10))                  # [1]: alone, km 1 and km 8 tie
print(locate(['B', 'D', 'E', 'X'], t, 10))   # [4, 6, 7, 8]: history settles it`,
      note: 'Tested with Python 3.12; both prints match the comments. A real locator runs the same model as a forward filter on every new cell and reports a 90% interval, as the widget does. The segments are those of the selected train\'s route, so the branch line never enters the state space.'
    },
    {
      title: 'Postgres: crowd pings → tower→segment table', lang: 'sql',
      code: `-- Anonymised pings: no user id; trip_token is random per trip.
CREATE TABLE ping (
  trip_token uuid        NOT NULL,
  ts         timestamptz NOT NULL,
  cell_key   text        NOT NULL,     -- 'mcc-mnc-lac-cid'
  segment_id int,                      -- map-matched GPS fix; NULL = no fix
  gps_acc_m  real
);
CREATE TABLE tower_segment (
  map_version int, cell_key text, segment_id int,
  p real,                              -- P(cell | segment)
  trips int,
  PRIMARY KEY (map_version, cell_key, segment_id)
);

-- Nightly build of map version 43 from the last 90 days of pings
INSERT INTO tower_segment (map_version, cell_key, segment_id, p, trips)
SELECT 43, cell_key, segment_id, p, trips
FROM (
  SELECT cell_key, segment_id,
         count(DISTINCT trip_token) AS trips,
         count(*)::real / sum(count(*)) OVER (PARTITION BY segment_id) AS p,
         count(*)::real / sum(count(*)) OVER (PARTITION BY cell_key)   AS share
  FROM ping
  WHERE segment_id IS NOT NULL
    AND gps_acc_m <= 50                     -- drop poor fixes
    AND ts > now() - interval '90 days'     -- old cells fade out
  GROUP BY cell_key, segment_id
) agg
WHERE trips >= 5          -- seen on 5+ separate trips: privacy floor + noise filter
  AND share >= 0.01;      -- drop the long tail of rare (cell, segment) pairs

-- Cells that phones report but the map does not know yet (cold start / re-planned)
SELECT p.cell_key, count(DISTINCT p.trip_token) AS trips
FROM ping p
WHERE NOT EXISTS (SELECT 1 FROM tower_segment t
                  WHERE t.map_version = 43 AND t.cell_key = p.cell_key)
GROUP BY p.cell_key
ORDER BY trips DESC;`,
      note: 'Run on Postgres 16 with seeded pings. A stray one-off pair, a 400 m fix and a cell seen on only 2 trips were all excluded, and that cell showed up in the unknown-cells report. The window functions run after <code>GROUP BY</code>, so <code>sum(count(*)) OVER (PARTITION BY segment_id)</code> is the total number of pings on that segment.'
    },
    {
      title: 'Spring Boot: versioned packs with deltas', lang: 'java',
      code: `interface PackStore {
  int latest(String region);
  Optional<byte[]> delta(String region, int from, int to);   // precomputed binary diff
  byte[] full(String region, int version);
}

@RestController
@RequestMapping("/v1/packs")
public class PackController {
  private static final int MAX_CHAIN = 8;   // older clients get the full pack
  private final PackStore store;

  public PackController(PackStore store) { this.store = store; }

  /** GET /v1/packs/south?have=41 -> 304, a delta 41->43, or the full pack. */
  @GetMapping("/{region}")
  public ResponseEntity<byte[]> pack(@PathVariable String region,
                                     @RequestParam(required = false) Integer have) {
    int latest = store.latest(region);
    String etag = "\\"" + region + "-v" + latest + "\\"";
    CacheControl cc = CacheControl.maxAge(Duration.ofHours(6)).cachePublic(); // CDN keys on ?have
    if (have != null && have == latest) {
      return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cc).build();
    }
    boolean deltaOk = have != null && have < latest && latest - have <= MAX_CHAIN;
    Optional<byte[]> delta = deltaOk ? store.delta(region, have, latest) : Optional.empty();
    return ResponseEntity.ok()
        .eTag(etag)
        .cacheControl(cc)
        .header("X-Pack-Base", delta.isPresent() ? String.valueOf(have) : "full")
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .body(delta.orElseGet(() -> store.full(region, latest)));
  }
}`,
      note: 'Compiles with <code>javac --release 21</code> against Spring Boot 3.5. A phone that is several versions behind, or that reports a version newer than the server\'s (after a rollback), gets the full pack. The client applies a delta to a copy and checks a hash before swapping it in.'
    }
  ],

  related: ['ride-sharing', 'proximity-service', 'irctc-booking', 'notifications', 'cdn', 'stream-analytics']
});
