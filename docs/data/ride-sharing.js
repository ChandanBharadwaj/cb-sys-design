SD.register({
  slug: 'ride-sharing',
  domain: 2,
  title: 'Ride-Sharing Location & Dispatch',
  examples: 'Uber, Lyft',
  tagline: 'Track millions of moving drivers and match a rider to the right one in about a second, while location updates arrive at <b>a million writes per second</b>.',
  tldr: {
    problem: 'Driver positions change every few seconds. You need a "who is near this point" query that is fresh, fast and spread across many machines.',
    idea: 'Keep driver locations in an <b>in-memory geo index sharded by map cell</b> (H3/S2), not in a database. Search outward ring by ring from the rider\'s cell, then <b>rank by road ETA</b>.',
    insight: 'Location is <i>ephemeral</i>. If a shard dies, the next round of pings rebuilds it within seconds. Only <i>trips</i> need durable storage.',
    numbers: [
      { v: '~4 s', l: 'driver location ping interval (Uber, 2015 talk)' },
      { v: '1M/s', l: 'geo-index write design target (Uber, 2015 talk)' },
      { v: '122 · 16', l: 'H3 base cells · resolutions' }
    ]
  },

  intro: {
    what: 'A ride-sharing dispatch system is the brain behind a ride-hailing app. It knows where every available driver is <b>right now</b>. When someone taps <b>Request</b>, it decides which driver should go and pick them up.',
    analogy: {
      icon: '🚕',
      title: 'A taxi radio dispatcher with a live wall map',
      text: 'Old taxi companies had a dispatcher with a radio and a map covered in pins, one per cab. When a customer called, the dispatcher looked at the pins near the caller and radioed the closest free cab. This system does the same job automatically, for a million cabs at once, and moves the pins every few seconds.'
    },
    problem: 'Drivers never stop moving, so the answer to "where is everyone?" changes every few seconds. Thousands of times per second you must answer <b>"which free drivers are near this spot?"</b> using fresh positions. You must never send one driver to two riders, and you must keep working when a server dies.',
    story: [
      {
        stage: 'naive',
        title: 'Store every position in one database table',
        text: 'Each driver app <b>updates its row</b> every few seconds. To find a driver, the rider\'s request runs a query like <code>WHERE distance &lt; 2 km</code> over the whole table. Simple, and it works for a small fleet.',
        scene: {
          nodes: [
            { id: 'd', label: 'Drivers', sub: 'GPS every 4 s', kind: 'client', at: [70, 0] },
            { id: 'r', label: 'Rider', sub: 'taps Request', kind: 'client', at: [350, 0] },
            { id: 'db', label: 'One SQL table', sub: 'all drivers', kind: 'store', at: [210, 120] }
          ],
          edges: [{ from: 'd', to: 'db' }, { from: 'r', to: 'db' }],
          flow: [['d>db', 'r>db']]
        }
      },
      {
        stage: 'breaks',
        title: 'Writes pile up and every search scans the city',
        text: 'A million drivers each sending a ping every 4 s is about <b>250,000 writes per second</b>, and each one also updates indexes and the database log. Every rider search scans the whole city. The database falls behind, positions go stale, and riders wait.',
        scene: {
          nodes: [
            { id: 'd', label: 'Drivers ×1M', sub: '250K writes/s', kind: 'client', at: [70, 0] },
            { id: 'r', label: 'Riders', sub: 'thousands/s', kind: 'client', at: [350, 0] },
            { id: 'db', label: 'One SQL table', sub: 'overloaded', kind: 'store', at: [210, 120] }
          ],
          edges: [{ from: 'd', to: 'db' }, { from: 'r', to: 'db' }],
          flow: [['d>db', 'r>db'], ['d>db', 'r>db']],
          err: ['db'],
          badges: { db: ['overloaded', 'err'], r: ['slow ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Cut the map into cells and keep them in memory',
        text: 'Split the map into small <b>hexagon cells</b>. Each server keeps the drivers in its own cells <b>in RAM</b>. A ride request searches only the rider\'s cell and the ring of cells around it, then ranks those drivers by <b>drive time</b>.',
        scene: {
          nodes: [
            { id: 'd', label: 'Drivers', sub: 'GPS every 4 s', kind: 'client', at: [70, 0] },
            { id: 'r', label: 'Rider', sub: 'taps Request', kind: 'client', at: [350, 0] },
            { id: 'loc', label: 'Location svc', sub: 'lat/lng → cell', kind: 'service', at: [70, 110] },
            { id: 'disp', label: 'Dispatch', sub: 'nearby + ETA', kind: 'service', at: [350, 110] },
            { id: 'c1', label: 'Cells A–F', sub: 'server 1 · RAM', kind: 'cache', at: [70, 220] },
            { id: 'c2', label: 'Cells G–M', sub: 'server 2 · RAM', kind: 'cache', at: [210, 220] },
            { id: 'c3', label: 'Cells N–T', sub: 'server 3 · RAM', kind: 'cache', at: [350, 220] }
          ],
          edges: [{ from: 'd', to: 'loc' }, { from: 'loc', to: 'c1' }, { from: 'r', to: 'disp' }, { from: 'disp', to: 'c3' }, { from: 'disp', to: 'c2' }],
          flow: ['d>loc', 'loc>c1', 'r>disp', ['disp>c3', 'disp>c2']],
          ok: ['c1', 'c2', 'c3'],
          badges: { disp: ['best: 3 min', 'ok'] }
        }
      }
    ],
    usedBy: ['Uber', 'Lyft', 'Ola', 'Grab', 'Didi', 'Food-delivery courier dispatch'],
    whenToUse: [
      'Many <b>moving</b> things (cars, couriers, scooters) must be found by location in real time',
      'Supply has to be matched to demand within seconds',
      'Location updates far outnumber reads of location history'
    ],
    whenNot: [
      'The places do not move, such as restaurants or shops (see <a href="proximity-service.html">Proximity Service</a>)',
      'Only a few hundred vehicles: one Postgres + PostGIS table is plenty',
      'Trips are booked hours ahead: an ordinary booking system works'
    ],
    glossary: [
      { term: 'Geospatial index', def: 'A data structure that answers "what is near this point?" without checking every item.' },
      { term: 'H3 cell', def: 'One hexagon in Uber\'s open-source grid that covers the Earth. Every lat/lng falls in exactly one cell at each size.' },
      { term: 'k-ring', def: 'A cell plus all cells within k steps of it. k = 1 is the cell and its 6 neighbours.' },
      { term: 'ETA', def: 'Estimated time of arrival: how long the driver needs to reach the rider on real roads.' },
      { term: 'Dispatch / matching', def: 'Deciding which driver gets which ride request.' },
      { term: 'Soft lock', def: 'A short reservation on a driver while an offer is pending, so no one else is offered the same driver.' },
      { term: 'Surge pricing', def: 'Raising prices in an area when demand exceeds supply, to balance the two.' },
      { term: 'Ephemeral state', def: 'Data that is only useful briefly and can be rebuilt (like current positions), so it does not need a durable database.' }
    ]
  },

  requirements: {
    functional: [
      'Drivers stream their GPS location while online',
      'Rider sees nearby cars on the map',
      'Rider requests a ride → matched to a driver',
      'Driver can accept / decline an offer',
      'Trip lifecycle: requested → accepted → arrived → in-trip → completed',
      'Surge pricing per area'
    ],
    nonFunctional: [
      'Match in ≲ 1–2 s (p99)',
      '~1M location writes/s, many more reads',
      'Never assign one driver to two riders',
      'Availability over strict consistency for locations',
      'Trips are durable and never lost',
      'Survive a node or datacenter loss'
    ],
    outOfScope: ['Payments (see Payment Gateway)', 'Turn-by-turn navigation', 'Driver onboarding', 'Pool / shared rides']
  },

  calculator: {
    inputs: [
      { id: 'drivers', label: 'Online drivers (peak)', min: 10000, max: 5000000, value: 1000000, log: true },
      { id: 'interval', label: 'Ping interval', min: 1, max: 15, value: 4, unit: 's' },
      { id: 'bytes', label: 'Bytes per ping (id, lat, lng, heading, speed, ts)', min: 40, max: 400, step: 10, value: 100, fmt: 'bytes' },
      { id: 'trips', label: 'Trips per day', min: 1000000, max: 60000000, value: 30000000, log: true },
      { id: 'peak', label: 'Peak-to-average ratio', min: 1, max: 6, step: 0.5, value: 3, unit: '×' },
      { id: 'ret', label: 'Kafka retention for raw pings', min: 1, max: 30, value: 7, unit: 'days' }
    ],
    outputs: [
      { label: 'Location writes / second', f: (v) => v.drivers / v.interval },
      { label: 'Ingress bandwidth', fmt: 'bytesps', f: (v) => (v.drivers / v.interval) * v.bytes },
      { label: 'Ride requests / second (peak)', f: (v) => (v.trips / 86400) * v.peak },
      { label: 'Hot geo state in RAM (~64 B/driver)', fmt: 'bytes', f: (v) => v.drivers * 64 },
      { label: 'Kafka raw-ping storage (RF = 3)', fmt: 'bytes', f: (v) => (v.drivers / v.interval) * v.bytes * 86400 * v.ret * 3 },
      { label: 'Pings per driver in an 8-hour shift', f: (v) => (8 * 3600) / v.interval }
    ],
    note: 'Trip volume and byte sizes are <em>estimates</em>. The 4 s interval and the 1M writes/s target come from Uber\'s 2015 QCon talk. Notice that the geo state fits in a few hundred MB of RAM. The hard part is the <b>write rate</b>, not the size.'
  },

  api: [
    { m: 'WS', p: 'driver ⇄ /v1/driver/stream', d: 'Persistent connection. The driver sends <code>{lat,lng,heading,speed,ts}</code> every ~4 s and the server pushes offers back.' },
    { m: 'GET', p: '/v1/supply/nearby?lat&lng&product', d: 'Cars shown on the rider\'s map. Served from the geo index and safe to cache for ~1 s.' },
    { m: 'POST', p: '/v1/rides', d: 'Request a ride with <code>{pickup, dropoff, product, idempotency_key}</code>. Returns <code>ride_id</code>.' },
    { m: 'POST', p: '/v1/offers/{id}/accept', d: 'Driver accepts. A conditional state change makes sure only one acceptance wins.' },
    { m: 'GET', p: '/v1/rides/{id}', d: 'Ride status and driver ETA, which the client polls or streams.' }
  ],
  dataModel: [
    { name: 'driver_location', store: 'In-memory geo index', fields: [['driver_id', 'int64', 'pk'], ['cell_id', 'H3 res 9', 'idx'], ['lat, lng', 'float32'], ['status', 'enum'], ['updated_at', 'ts']], note: 'Never on disk on the hot path. Rebuilt from the next round of pings.' },
    { name: 'trips', store: 'Sharded SQL / Schemaless', fields: [['trip_id', 'uuid', 'pk'], ['rider_id', 'int64', 'idx'], ['driver_id', 'int64', 'idx'], ['status', 'enum'], ['pickup, dropoff', 'geo'], ['version', 'int']], note: 'Append-only cells, like Uber\'s Schemaless.' },
    { name: 'location_pings', store: 'Kafka topic', fields: [['key', 'driver_id', 'pk'], ['value', 'ping'], ['partition', 'hash(driver_id)']], note: 'Keyed by driver, so one driver\'s pings stay in order. Feeds surge, ETA training and analytics.' }
  ],

  architecture: {
    title: 'Ride-sharing architecture',
    nodes: [
      { id: 'drv', label: 'Driver app', sub: 'GPS every ~4 s', kind: 'client', wide: [90, 110], tall: [80, 0], tip: 'Sends location over a persistent connection and receives trip offers on the same connection.' },
      { id: 'rdr', label: 'Rider app', sub: 'request ride', kind: 'client', wide: [90, 330], tall: [340, 0], tip: 'Shows nearby cars, requests rides and tracks the assigned driver.' },
      { id: 'gw', label: 'Gateway', sub: 'WebSocket / API', kind: 'edge', wide: [270, 220], tall: [210, 105], tip: 'Terminates TLS and long-lived sockets, authenticates, and routes by service.' },
      { id: 'loc', label: 'Location service', sub: 'lat/lng → cell id', kind: 'service', wide: [470, 110], tall: [70, 215], tip: 'Stateless. Converts each ping to an H3 cell and writes it to the shard that owns the cell.' },
      { id: 'kfk', label: 'Kafka', sub: 'location stream', kind: 'queue', wide: [470, 0], tall: [210, 215], tip: 'Every ping is also published asynchronously for surge, ETA models and analytics. It never blocks matching.' },
      { id: 'geo', label: 'Geo index', sub: 'in-memory · sharded by cell', kind: 'cache', wide: [690, 110], tall: [70, 325], tip: 'Driver supply held in memory and sharded by cell id across nodes (Uber used Ringpop: SWIM gossip + consistent hashing).' },
      { id: 'price', label: 'Surge pricing', sub: 'supply vs demand / cell', kind: 'compute', wide: [690, 0], tall: [210, 325], tip: 'Aggregates open requests and free drivers per cell and publishes a price multiplier.' },
      { id: 'disp', label: 'Dispatch', sub: 'matching (DISCO)', kind: 'service', wide: [470, 330], tall: [350, 215], tip: 'Finds candidates in the rings around the pickup cell, ranks them by ETA, sends the offer, and handles accept, decline and timeout.' },
      { id: 'eta', label: 'ETA service', sub: 'road-network time', kind: 'compute', wide: [690, 330], tall: [350, 325], tip: 'Real drive time on the road graph, not straight-line distance.' },
      { id: 'map', label: 'Road graph', sub: 'live traffic', kind: 'store', wide: [890, 220], tall: [350, 435], tip: 'Map data plus live speed estimates.' },
      { id: 'trip', label: 'Trip service', sub: 'state machine', kind: 'service', wide: [890, 330], tall: [210, 435], tip: 'Owns the trip lifecycle. A conditional update (version check) prevents double assignment.' },
      { id: 'tdb', label: 'Trip store', sub: 'sharded, durable', kind: 'store', wide: [890, 440], tall: [210, 545], tip: 'The durable part of the system. Uber built Schemaless, an append-only layer on sharded MySQL.' }
    ],
    edges: [
      { from: 'drv', to: 'gw', bidi: true },
      { from: 'rdr', to: 'gw', bidi: true },
      { from: 'gw', to: 'loc' },
      { from: 'loc', to: 'geo' },
      { from: 'loc', to: 'kfk' },
      { from: 'kfk', to: 'price' },
      { from: 'gw', to: 'disp' },
      { from: 'disp', to: 'geo' },
      { from: 'disp', to: 'eta' },
      { from: 'eta', to: 'map' },
      { from: 'disp', to: 'trip', bend: 0.18 },
      { from: 'trip', to: 'tdb' },
      { from: 'price', to: 'disp', dashed: true, bend: 0.2 }
    ]
  },

  scenarios: [
    {
      id: 'ping', title: 'Driver location ping', tone: 'info',
      steps: [
        { text: 'Every ~4 s each online driver sends <code>{lat, lng, heading, speed}</code> over an already-open connection, so there is no TCP or TLS handshake per ping.', flow: ['drv>gw'] },
        { text: 'The gateway forwards to the <b>stateless location service</b>, which turns lat/lng into an <b>H3 cell id</b> (one cell is about a city block at res 9).', flow: ['gw>loc'], badges: { loc: 'cell 89…ff' } },
        { text: 'The geo-index shard that <b>owns that cell</b> moves the driver from the old cell to the new one, entirely in memory. No database write happens on the hot path.', flow: ['loc>geo'], badges: { geo: '+1 driver' }, tone: 'ok' },
        { text: 'The same ping goes to <b>Kafka</b> asynchronously. Surge pricing, ETA model training and analytics consume it without slowing ingestion.', flow: ['loc>kfk', 'kfk>price'] }
      ]
    },
    {
      id: 'request', title: 'Rider requests a ride', tone: 'ok',
      steps: [
        { text: 'The rider taps <b>Request</b>. The ride is created with an idempotency key, so a retry on a flaky network does not create two rides.', flow: ['rdr>gw', 'gw>disp'] },
        { text: 'Dispatch looks up the rider\'s cell, then expands the <b>k-ring</b> (k = 1, 2, …) until it has enough free drivers. One ring adds 6k cells.', flow: ['disp>geo'], badges: { geo: 'k=2 · 19 cells' } },
        { text: 'Candidates are ranked by <b>road ETA</b>, not straight-line distance. A driver just across a river can be 10 minutes away.', flow: ['disp>eta', 'eta>map'], badges: { eta: 'best 3 min' } },
        { text: 'An <b>offer</b> goes to the best driver over their open socket. The driver is <i>soft-locked</i> so no other rider is offered the same driver.', flow: ['disp>gw', 'gw>drv'], badges: { drv: 'offer ⏱' }, tone: 'warn' },
        { text: 'The driver accepts. The trip service applies a <b>conditional update</b> (status = REQUESTED and version = n), persists it, and marks the driver busy.', flow: ['drv>gw', 'gw>disp', 'disp>trip', 'trip>tdb'], badges: { tdb: 'committed' }, tone: 'ok' }
      ]
    },
    {
      id: 'decline', title: 'Driver declines / times out', tone: 'warn',
      steps: [
        { text: 'An offer is sent to driver #1 with a short countdown.', flow: ['disp>gw', 'gw>drv'], badges: { drv: 'offer ⏱' } },
        { text: 'No answer before the timeout, or the driver declines. Dispatch releases the soft lock.', nodes: ['drv', 'disp'], warn: ['drv'], badges: { drv: ['timeout', 'warn'] }, tone: 'warn' },
        { text: 'Dispatch takes the <b>next candidate</b> from the ranked list, after re-checking that the driver is still free. No new geo search is needed.', flow: ['disp>geo', 'disp>eta'], badges: { disp: 'next: #2' } },
        { text: 'The offer goes to driver #2, who accepts. The rider only notices a slightly longer "finding your driver" spinner.', flow: ['disp>gw', 'gw>drv', 'drv>gw', 'gw>disp', 'disp>trip'], tone: 'ok', badges: { trip: 'matched' } }
      ]
    },
    {
      id: 'hotspot', title: 'Hot spot: stadium empties', tone: 'warn',
      steps: [
        { text: 'A concert ends. Thousands of requests land in a <b>handful of cells</b>, all owned by the same geo shard.', flow: [['rdr>gw', 'rdr>gw'], 'gw>disp', 'disp>geo'], warn: ['geo'], badges: { geo: ['hot shard', 'warn'] }, tone: 'warn' },
        { text: 'The Kafka stream shows demand ≫ supply in those cells, so surge pricing raises the multiplier. That lowers demand and pulls drivers toward the area.', flow: ['loc>kfk', 'kfk>price', 'price>disp'], badges: { price: '1.8×' } },
        { text: '<b>Batched matching</b>: instead of greedily taking the nearest driver for each request, dispatch gathers requests for a short window and solves an assignment for the whole batch, which lowers total ETA.', nodes: ['disp', 'geo', 'eta'], badges: { disp: 'batch' }, tone: 'ok' },
        { text: 'If needed, the hot cells move to finer-grained shards. The ring rebalances cell ownership without touching the trip store.', nodes: ['geo'], ok: ['geo'], tone: 'ok' }
      ]
    },
    {
      id: 'shard-down', title: 'Geo shard node dies', tone: 'err',
      steps: [
        { text: 'A geo-index node crashes. Every driver location it held is gone.', nodes: ['geo'], err: ['geo'], badges: { geo: ['down', 'err'] }, tone: 'err' },
        { text: '<b>Gossip (SWIM)</b> marks the node as dead within seconds. Consistent hashing gives its cells to neighbouring nodes.', nodes: ['geo', 'disp', 'loc'], warn: ['geo'], badges: { geo: ['rehash', 'warn'] }, tone: 'warn' },
        { text: 'Nothing is restored from disk. Within ~4 s every driver pings again and the new owners rebuild the state.', flow: ['drv>gw', 'gw>loc', 'loc>geo'], ok: ['geo'], badges: { geo: ['rebuilt', 'ok'] }, tone: 'ok' },
        { text: 'In-flight trips are safe in the durable trip store. Uber also used <b>driver phones as a backup</b>: the server sends them an encrypted state digest, which they replay to a new datacenter after failover.', nodes: ['trip', 'tdb', 'drv'], ok: ['tdb'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real design decision. Watch the geo-index label, the request path and the meters change.',
    diagram: null, // filled below to add the optional batch optimizer node
    controls: [
      { id: 'index', label: 'Spatial index', type: 'seg', value: 'h3', options: [
        { v: 'geohash', l: 'Geohash' }, { v: 'quadtree', l: 'Quadtree' }, { v: 's2', l: 'S2' }, { v: 'h3', l: 'H3 hexagons' }] },
      { id: 'store', label: 'Where the index lives', type: 'seg', value: 'mem', options: [
        { v: 'mem', l: 'Sharded in-memory (custom)' }, { v: 'redis', l: 'Redis GEO cluster' }, { v: 'db', l: 'PostGIS table' }] },
      { id: 'match', label: 'Matching strategy', type: 'seg', value: 'greedy', options: [
        { v: 'greedy', l: 'Greedy nearest-ETA' }, { v: 'batch', l: 'Batched (global)' }] },
      { id: 'interval', label: 'Ping interval', type: 'range', min: 1, max: 15, step: 1, value: 4, unit: 's' }
    ],
    evaluate(s) {
      const drivers = 1e6;
      const wps = drivers / s.interval;
      const idx = {
        geohash: { sub: 'geohash prefixes', s: 0.5, v: 'prefix + 8 neighbours; edge effects' },
        quadtree: { sub: 'quadtree', s: 0.4, v: 'adaptive, but moving points churn the tree' },
        s2: { sub: 'S2 cells (Hilbert)', s: 0.78, v: 'cell covering; quad cells' },
        h3: { sub: 'H3 cells · k-ring', s: 0.9, v: 'k-ring; one neighbour distance' }
      }[s.index];
      const storeCap = { mem: 2e6, redis: 1.2e6, db: 1.5e5 }[s.store]; // illustrative cluster ceilings
      const headroom = storeCap / wps;
      const metrics = [
        { k: 'Location writes/s', v: SD.fmt.num(wps) + '/s', s: wps <= 3e5 ? 0.9 : wps <= 6e5 ? 0.6 : 0.3, hint: s.interval + ' s ping' },
        { k: 'Position staleness', v: '≤ ' + s.interval + ' s ≈ ' + Math.round(s.interval * 11) + ' m @40 km/h', s: s.interval <= 4 ? 0.85 : s.interval <= 8 ? 0.55 : 0.25 },
        { k: 'Neighbour search', v: idx.v, s: s.store === 'redis' ? 0.55 : idx.s },
        { k: 'Write headroom', v: headroom >= 1 ? headroom.toFixed(1) + '× capacity' : 'overloaded (' + headroom.toFixed(2) + '×)', s: clamp01(headroom / 3), hint: 'illustrative cluster ceilings' },
        { k: 'Avg pickup ETA', v: s.match === 'batch' ? 'lower in aggregate' : 'baseline', s: s.match === 'batch' ? 0.85 : 0.55 },
        { k: 'Decision delay', v: s.match === 'batch' ? '+ batch window (seconds)' : '≈ immediate', s: s.match === 'batch' ? 0.6 : 0.9 },
        { k: 'Ops complexity', v: { mem: 'custom sharding + gossip', redis: 'managed, familiar', db: 'simple, but disk on hot path' }[s.store], s: { mem: 0.45, redis: 0.75, db: 0.8 }[s.store] }
      ];
      const labels = { geo: { label: { mem: 'Geo index', redis: 'Redis GEO', db: 'PostGIS' }[s.store], sub: s.store === 'redis' ? 'GEOADD · GEOSEARCH' : s.store === 'db' ? 'GiST index · UPDATE' : idx.sub } };
      const notes = [];
      if (s.store === 'redis') notes.push('Redis GEO stores each member as a <b>52-bit geohash score in a sorted set</b>. To use H3 or S2 you would keep your own <code>cell → set</code> keys instead.');
      if (s.store === 'db') notes.push('One UPDATE every ' + s.interval + ' s per driver creates heavy WAL, index churn and vacuum load. This works at city scale, not at 1M drivers.');
      if (s.index === 'quadtree') notes.push('Quadtrees are great for <i>static</i> points (businesses). With moving points every update can split or merge nodes.');
      if (s.index === 'geohash') notes.push('Two points a metre apart can have completely different prefixes at a cell edge, so you must always query the 8 neighbours too.');
      if (s.index === 'h3') notes.push('Hexagons have one distance to every neighbour, so k-rings approximate circles. This is why Uber built H3 for pricing and dispatch.');
      if (s.match === 'batch') notes.push('A batch window of a few seconds lets the optimizer avoid sending one driver past a closer rider (Lyft and Didi describe the same idea).');
      if (s.interval <= 2) notes.push('Halving the interval doubles the write load for a small gain in freshness. Client-side dead-reckoning between pings is cheaper.');
      let verdict;
      if (s.store === 'db' && wps > 1e5) verdict = '❌ <b>Disk-backed index at this write rate will fall over.</b> Move live locations to memory and keep the DB for trips.';
      else if (headroom < 1) verdict = '⚠ <b>Over capacity.</b> Add shards or lengthen the ping interval.';
      else if (s.index === 'h3' && s.store === 'mem' && s.match === 'batch') verdict = '✅ <b>Close to what Uber describes:</b> H3 cells, an in-memory sharded index, and batched matching. It is the most efficient option and also the most complex to run.';
      else if (s.store === 'redis') verdict = '👍 <b>Good interview default:</b> a Redis cluster sharded by region, using GEOSEARCH. Mention its geohash edge effects and how you would move to H3 cells.';
      else verdict = '👍 Workable. Check the meters to see which trade-off you are paying for.';
      const flow = ['rdr>gw', 'gw>disp'].concat(s.match === 'batch' ? ['disp>batch', 'batch>geo'] : ['disp>geo']).concat(['disp>eta']);
      return {
        metrics, verdict, notes, labels, flow,
        hide: s.match === 'batch' ? [] : ['batch'],
        hot: s.match === 'batch' ? ['batch'] : [],
        warn: headroom < 1 || s.store === 'db' ? ['geo'] : [],
        badges: { geo: [SD.fmt.num(wps) + ' w/s', headroom < 1 ? 'err' : 'info'] }
      };
      function clamp01(x) { return Math.max(0, Math.min(1, x)); }
    }
  },

  widget: {
    title: 'H3 k-ring search, ranked by ETA',
    caption: 'Drivers (dots) wander the hex grid. <b>Tap any hex</b> to request a ride. Rings expand until enough free drivers are found, then candidates are ranked by <b>ETA</b>. Turn on the river to see why straight-line distance misleads.'
  },

  realWorld: {
    intro: 'Uber has published a lot about this problem. Here is how the design changed over time.',
    timeline: [
      { when: '2014–15', who: 'Uber', title: 'DISCO dispatch + S2 cells + Ringpop', text: 'Matt Ranney\'s QCon talk describes the dispatch system (DISCO). Supply and demand are indexed with <b>Google S2 cells</b>, and the geo index aimed for <b>a million writes per second</b> because drivers send updates <b>every 4 seconds</b>. State is spread across Node.js workers with <b>Ringpop</b>.', src: 0 },
      { when: '2015', who: 'Uber', title: 'Ringpop open-sourced', text: 'Ringpop combines a <b>SWIM gossip</b> membership protocol with <b>consistent hashing</b>. Requests use a "handle or forward" pattern, so any node can receive a request for any key.', src: 1 },
      { when: '2015', who: 'Uber', title: 'Datacenter failover using driver phones', text: 'The server periodically sends driver phones an encrypted state digest. If a datacenter fails, the phone sends that digest to the new datacenter, which restores in-flight trip state.', src: 2 },
      { when: '2016', who: 'Uber', title: 'Schemaless for trips', text: 'Trip growth outgrew a single Postgres. Uber built <b>Schemaless</b>, an append-only, Bigtable-like layer on <b>sharded MySQL</b> with buffered writes and triggers.', src: 3 },
      { when: '2018', who: 'Uber', title: 'H3 hexagonal grid open-sourced', text: 'Built for <b>pricing and dispatch</b>. It has 122 base cells, 16 resolutions and a 64-bit index. Hexagons have a single neighbour distance and <code>kRing</code> approximates a circle.', src: 4 },
      { when: '2020s', who: 'Uber · Lyft · Didi', title: 'Batched / global matching', text: 'Instead of greedily matching each request, platforms collect requests for a few seconds and solve a bipartite assignment that minimises total ETA. Lyft\'s paper describes this setup and improves it with reinforcement learning.', src: 5 }
    ],
    lessons: [
      'Separate <b>ephemeral state</b> (locations, in memory, rebuildable) from <b>durable state</b> (trips, in a DB).',
      'Shard by <b>geography</b>, and plan for hot cells such as stadiums and airports.',
      'Rank by <b>ETA on the road graph</b>; distance is only a pre-filter.',
      'Treat the client as part of the system: open sockets, idempotent requests, and even state backup on the phone.'
    ],
    sources: [
      { title: 'How Uber Scales Their Real-time Market Platform', url: 'https://highscalability.com/how-uber-scales-their-real-time-market-platform/', pub: 'High Scalability (summary of Matt Ranney, QCon 2015)' },
      { title: 'Ringpop: open-source library for scalable, fault-tolerant applications', url: 'https://www.uber.com/blog/ringpop-open-source-nodejs-library/', pub: 'Uber Engineering' },
      { title: 'Uber Unveils its Realtime Market Platform', url: 'https://www.infoq.com/news/2015/03/uber-realtime-market-platform', pub: 'InfoQ, 2015' },
      { title: 'Designing Schemaless, Uber Engineering\'s Scalable Datastore Using MySQL', url: 'https://www.uber.com/blog/schemaless-part-one-mysql-datastore/', pub: 'Uber Engineering, 2016' },
      { title: 'H3: Uber\'s Hexagonal Hierarchical Spatial Index', url: 'https://www.uber.com/blog/h3/', pub: 'Uber Engineering, 2018' },
      { title: 'A Better Match for Drivers and Riders: Reinforcement Learning at Lyft', url: 'https://arxiv.org/abs/2310.13810', pub: 'arXiv, 2023' },
      { title: 'H3 documentation', url: 'https://h3geo.org/docs/', pub: 'h3geo.org' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Spatial index', '<b>Geohash</b>: simple string prefixes, native in Redis/ES', '<b>H3 / S2</b>: uniform cells and clean neighbour rings', 'Geohash for an MVP; H3 when you need ring search, surge cells and analytics'],
      ['Location store', '<b>In-memory sharded</b>: fastest, rebuildable', '<b>Redis GEO</b>: managed, with familiar ops', 'Redis until you hit the write ceiling or need custom cells'],
      ['Matching', '<b>Greedy</b>: instant, simple', '<b>Batched</b>: better global ETA', 'Batch in dense markets, greedy in sparse ones'],
      ['Ping interval', '<b>Short (1–2 s)</b>: fresher', '<b>Longer (4–5 s)</b>: half the writes and battery', '~4 s plus client-side interpolation'],
      ['Trip store', '<b>Single Postgres</b>: ACID, simple', '<b>Sharded SQL / Schemaless</b>: scales writes', 'Shard by trip_id when one primary can\'t keep up']
    ]
  },
  failures: [
    { f: 'Geo shard crashes', detect: 'Gossip failure detector (SWIM) or health checks', fix: 'Rehash its cells to other nodes. The next ~4 s of pings rebuilds the state.' },
    { f: 'Same driver offered to two riders', detect: 'Conflicting accept attempts', fix: 'Soft lock on offer, plus a conditional UPDATE / version check at accept.' },
    { f: 'Hot cell (stadium, airport)', detect: 'Per-shard QPS and latency alarms', fix: 'Split cells to a finer resolution, add surge, use a batch window, and queue riders at airports.' },
    { f: 'Driver app on a flaky network', detect: 'Missing heartbeats', fix: 'Mark the driver unavailable after N missed pings, use idempotent requests, and reconnect with backoff.' },
    { f: 'Datacenter failover', detect: 'Global health checks', fix: 'Route to the other DC and restore trip state from the replicated store or the phone digest.' },
    { f: 'Kafka backlog', detect: 'Consumer lag', fix: 'Only surge and analytics lag; matching never waits on Kafka.' }
  ],

  interview: [
    { q: 'Why not just store driver locations in Postgres and query with a radius?', a: '<p>The problem is the <b>write rate</b>. At 1M drivers / 4 s you get ~250K updates/s, and every UPDATE causes WAL writes, index churn and vacuum work. The data is also only valid for a few seconds.</p><p>Keep it in memory, sharded by cell. Use the database only for trips.</p>', fu: 'At what scale would PostGIS be fine? (A single city with thousands of drivers.)', lvl: 'core' },
    { q: 'Why hexagons (H3) instead of squares (geohash)?', a: '<p>A hexagon has <b>one distance to all 6 neighbours</b>. A square has two (edge and diagonal). That makes k-rings a good approximation of circles and reduces quantization error for moving things.</p><p>Geohash also has <b>edge effects</b>: two points a metre apart can have different prefixes, so you must always query the neighbours.</p>', lvl: 'core' },
    { q: 'Walk me through finding the nearest drivers.', a: '<ul><li>Convert the pickup to a cell at the matching resolution.</li><li>Collect drivers in ring k = 0, then k = 1, 2, … until you have N candidates or hit a max k.</li><li>Filter by status, product and vehicle.</li><li>Call the ETA service in batch.</li><li>Rank and offer to the best driver.</li></ul>', lvl: 'core' },
    { q: 'How do you prevent a driver being assigned to two riders?', a: '<p>Use a <b>soft lock</b> when the offer goes out (in-memory, with a TTL equal to the offer timeout). At accept time, do a <b>conditional write</b> on the trip and driver state:</p><p><code>UPDATE … WHERE status = \'OFFERED\' AND version = n</code></p><p>Only one transition can win. Make accept idempotent so retries are safe.</p>', lvl: 'core' },
    { q: 'How do you shard the geo index, and what about hot spots?', a: '<p>Shard by <b>cell id</b> with consistent hashing, so neighbouring cells may live on different nodes and a ring query fans out to several shards.</p><p>For hot spots: use finer cells, split hot shards, add read replicas for "nearby cars" views, and use surge pricing and batch windows to smooth demand.</p>', lvl: 'deep' },
    { q: 'What happens when a geo-index node dies?', a: '<p>The failure detector (SWIM gossip in Ringpop) removes it and its cells are rehashed. The state is <b>not restored from disk</b>: the next round of pings (≤ 4 s) rebuilds it.</p><p>That is the payoff from treating location as ephemeral.</p>', lvl: 'core' },
    { q: 'Greedy vs batched matching: what is the trade-off?', a: '<p><b>Greedy</b> gives each rider the best driver right now. It is fast but can be globally bad, for example taking a driver from a rider who had no other option.</p><p><b>Batched</b> collects requests for a few seconds and solves a min-cost bipartite assignment (e.g. Hungarian). Total ETA drops, but each decision is delayed slightly.</p>', lvl: 'deep' },
    { q: 'How would you compute surge pricing?', a: '<p>Consume the location and request streams from Kafka. Per cell (or cluster of cells) and short window, compute demand (open requests) vs supply (free drivers). Map the ratio to a multiplier with smoothing, publish it to a fast store, and let dispatch and pricing read it.</p><p>It must never block matching.</p>', lvl: 'deep' },
    { q: 'How do clients show smooth car movement with 4 s pings?', a: '<p><b>Dead reckoning</b>: interpolate between pings using heading and speed, and snap to the road. This is far cheaper than doubling the ping rate.</p>', lvl: 'core' },
    { q: 'How do you make the request endpoint safe to retry?', a: '<p>The client sends an <b>idempotency key</b>. The server stores <code>key → ride_id</code> and returns the same ride on retry. Combine this with a unique constraint on <code>(rider_id, active)</code> so a rider has only one active request.</p>', lvl: 'core' },
    { q: 'How do you get road ETAs for 20 candidates in a few milliseconds?', a: '<p>Don\'t run a plain Dijkstra per candidate. Use a routing engine with a <b>precomputed road graph</b> (e.g. contraction hierarchies or a partitioned graph) and ask for a <b>one-to-many</b> query: one pickup, many drivers, in a single call.</p><p>Add live traffic as edge weights, and correct the route time with a model trained on past trips. Use straight-line or cell distance only as the cheap <b>pre-filter</b> that picks which candidates get a real ETA.</p>', lvl: 'deep' },
    { q: 'How does this survive a whole datacenter failing?', a: '<p>Trips are in a replicated store. Uber also periodically sends drivers an <b>encrypted state digest</b>, so after a failover the phone can replay it to the new DC. Location state simply rebuilds from the next pings.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot: ping → H3 → Redis', lang: 'java',
      code: `// build.gradle: implementation 'com.uber:h3:4.1.1', spring-boot-starter-data-redis
@Service
public class LocationService {
  private static final int RES = 9;                 // ~0.1 km² cells
  private final H3Core h3;
  private final StringRedisTemplate redis;

  public LocationService(StringRedisTemplate redis) throws IOException {
    this.h3 = H3Core.newInstance();
    this.redis = redis;
  }

  public void onPing(long driverId, double lat, double lng) {
    String cell = h3.latLngToCellAddress(lat, lng, RES);
    String prev = redis.opsForValue().getAndSet("drv:" + driverId + ":cell", cell);
    if (!cell.equals(prev)) {                       // moved to a new cell
      if (prev != null) redis.opsForSet().remove("cell:" + prev, String.valueOf(driverId));
      redis.opsForSet().add("cell:" + cell, String.valueOf(driverId));
    }
    redis.expire("cell:" + cell, Duration.ofSeconds(30)); // stale cells vanish
  }

  public List<String> candidates(double lat, double lng, int need) {
    String origin = h3.latLngToCellAddress(lat, lng, RES);
    for (int k = 0; k <= 4; k++) {
      List<String> ring = h3.gridDisk(origin, k);   // k-ring
      List<String> found = ring.stream()
          .flatMap(c -> redis.opsForSet().members("cell:" + c).stream())
          .toList();
      if (found.size() >= need) return found;
    }
    return List.of();
  }
}`,
      note: 'Each <code>cell:&lt;id&gt;</code> set is a single key, so it lives on one Redis Cluster slot; a k-ring read touches several slots. The 30 s TTL only clears cells nobody pings, so also remove a driver on logout or after missed heartbeats. Rank the result with the ETA service before offering.'
    },
    {
      title: 'Postgres: idempotent, race-free accept', lang: 'sql',
      code: `-- one active ride per rider
CREATE UNIQUE INDEX one_active_ride ON rides(rider_id)
  WHERE status IN ('REQUESTED','ACCEPTED','IN_TRIP');

-- driver accepts: only one transition can win
UPDATE rides
   SET status = 'ACCEPTED', driver_id = :driver, version = version + 1
 WHERE ride_id = :ride
   AND status  = 'REQUESTED'
   AND version = :expected_version
RETURNING ride_id;   -- 0 rows  =>  someone else won, tell driver "trip taken"`
    },
    {
      title: 'Python: batched matching', lang: 'python',
      code: `# Every ~2 s: assign waiting riders to free drivers minimising total ETA
import numpy as np
from scipy.optimize import linear_sum_assignment

def match_batch(riders, drivers, eta):          # eta(r, d) -> seconds
    cost = np.array([[eta(r, d) for d in drivers] for r in riders])
    cost[cost > 15 * 60] = 1e9                   # forbid very far pickups
    rows, cols = linear_sum_assignment(cost)     # Hungarian algorithm
    return [(riders[i], drivers[j]) for i, j in zip(rows, cols)
            if cost[i, j] < 1e9]`
    }
  ],

  related: ['proximity-service', 'food-delivery', 'chat', 'message-queue', 'distributed-cache', 'notifications', 'train-tracking']
});

/* knobs diagram = architecture + an optional batch optimizer node */
(function () {
  const d = SD.data;
  const a = d.architecture;
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes.concat([{ id: 'batch', label: 'Batch optimizer', sub: 'min-cost assignment', kind: 'compute', wide: [270, 440], tall: [70, 435], tip: 'Collects requests for a short window and solves a bipartite assignment across all of them.' }]),
    edges: a.edges.concat([{ from: 'disp', to: 'batch' }, { from: 'batch', to: 'geo', bend: -0.25 }])
  };
})();
