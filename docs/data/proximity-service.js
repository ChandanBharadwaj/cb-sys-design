SD.register({
  slug: 'proximity-service',
  domain: 2,
  title: 'Proximity Service',
  examples: 'Yelp, Tinder, Google Maps',
  tagline: 'Answer <b>"what is near me?"</b> over hundreds of millions of places in tens of milliseconds. Places barely move, so this is a <b>read-path</b> problem: pick the right spatial index and replicate it.',
  tldr: {
    problem: 'A plain <code>WHERE lat BETWEEN … AND lng BETWEEN …</code> can only use one B-tree range at a time, so it scans a whole latitude stripe. You need an index that keeps <b>nearby points close together</b>.',
    idea: 'Map 2-D space to <b>cells with sortable ids</b> (geohash, S2, quadtree leaves). A radius query becomes "look up a handful of cells, then filter by true distance". Keep that index <b>in memory, read-only, and replicated</b>.',
    insight: 'Businesses change rarely, so the index can be rebuilt or patched from CDC and served from <b>read replicas</b>. Moving users (Tinder) are the opposite case: the write path becomes the hard part.',
    numbers: [
      { v: '52-bit', l: 'interleaved geohash stored as a sorted-set score by Redis GEO (redis.io)' },
      { v: '0 – 30', l: 'S2 cell levels; a level-30 leaf is about 1 cm (s2geometry.io)' },
      { v: '40 – 100', l: 'geoshards Tinder\'s load tests pointed to (Tinder, 2019)' }
    ]
  },
  intro: {
    what: 'A proximity service answers <b>"what is near me?"</b>. Given a location and a distance, it returns nearby places, such as cafés, petrol stations or hotels, ranked by how close and how good they are. It searches a huge list of places and still replies in a fraction of a second.',
    analogy: {
      icon: '🗺️',
      title: 'A street atlas with a grid of numbered squares',
      text: 'A paper street atlas splits the city into squares like "page 12, C4". To find cafés near you, you look in your own square and the eight squares around it, instead of reading every listing in the book. Then you measure the real distance to each café you found and drop the ones that are too far. The real system does exactly this with digital grid cells, and keeps the grid in memory.'
    },
    problem: 'You open a maps app and search "coffee near me". The world has hundreds of millions of places. Measuring the distance to every one is far too slow, and an ordinary database index on latitude still leaves a thin stripe that circles the whole planet. The question is <b>"which places are within 2 km of this point?"</b>, answered in tens of milliseconds, thousands of times a second. Luckily, places almost never move.',
    story: [
      {
        stage: 'naive',
        title: 'Ask the database for a box around the user',
        text: 'Store places in a table with <code>lat</code> and <code>lng</code> columns, each with an ordinary index. A search asks for rows where latitude <b>and</b> longitude both fall in a small box around the user. It is one SQL query, and for a city\'s worth of places it is fast enough.',
        scene: {
          nodes: [
            { id: 'usr', label: 'User', sub: 'coffee near me', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'Search', sub: 'builds a box', kind: 'service', at: [70, 110] },
            { id: 'db', label: 'Places table', sub: 'index on lat, lng', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'usr', to: 'api' }, { from: 'api', to: 'db' }],
          flow: ['usr>api', 'api>db']
        }
      },
      {
        stage: 'breaks',
        title: 'The index finds a stripe, not a square',
        text: 'An ordinary index sorts on one column, so it can narrow the search to only one range. The latitude range is a <b>thin stripe around the whole Earth</b>. The database must then check the longitude of every place in that stripe, one row at a time. With hundreds of millions of places and thousands of searches a second, it cannot keep up.',
        scene: {
          nodes: [
            { id: 'usr', label: 'Users', sub: 'thousands/s', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'Search', sub: 'waiting', kind: 'service', at: [70, 110] },
            { id: 'db', label: 'Places table', sub: 'scans a stripe', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'usr', to: 'api' }, { from: 'api', to: 'db' }],
          flow: [['usr>api', 'api>db'], ['usr>api', 'api>db']],
          err: ['db'],
          warn: ['api'],
          badges: { db: ['overloaded', 'err'], usr: ['slow ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Cut the map into cells and keep copies in memory',
        text: 'Split the map into <b>cells</b> whose ids sort so that nearby cells sit close together (a <b>geohash</b> or S2 cell). A search reads the user\'s cell and its <b>8 neighbours</b>, then keeps only places within the true distance. Because places rarely change, the whole index is read-only, fits in memory, and is <b>copied to many servers</b>: more searches, add more copies.',
        scene: {
          nodes: [
            { id: 'usr', label: 'Users', sub: 'thousands/s', kind: 'client', at: [70, 0] },
            { id: 'api', label: 'Search', sub: 'my cell + 8', kind: 'service', at: [70, 110] },
            { id: 'g1', label: 'Geo index', sub: 'copy 1 · RAM', kind: 'cache', at: [350, 0] },
            { id: 'g2', label: 'Geo index', sub: 'copy 2 · RAM', kind: 'cache', at: [350, 110] },
            { id: 'g3', label: 'Geo index', sub: 'copy 3 · RAM', kind: 'cache', at: [350, 220] },
            { id: 'db', label: 'Places DB', sub: 'rebuilds index', kind: 'store', at: [70, 220] }
          ],
          edges: [{ from: 'usr', to: 'api' }, { from: 'api', to: 'g1' }, { from: 'api', to: 'g2' }, { from: 'api', to: 'g3' }, { from: 'db', to: 'g3', dashed: true }],
          flow: ['usr>api', 'api>g2', 'usr>api', 'api>g1'],
          ok: ['g1', 'g2', 'g3'],
          badges: { g2: ['9 cells · fast', 'ok'] }
        }
      }
    ],
    usedBy: ['Yelp', 'Google Maps "near me" search', 'Tinder', 'Foursquare', 'Airbnb map search'],
    whenToUse: [
      'Users search for <b>fixed places</b> near a point: shops, restaurants, hotels',
      'Searches far outnumber edits, and an edit may take minutes to show up',
      'Results are filtered and ranked by distance plus other things, such as rating or opening hours'
    ],
    whenNot: [
      'The things move every few seconds, like drivers or couriers (see <a href="ride-sharing.html">Ride-Sharing Location &amp; Dispatch</a>)',
      'Only a few thousand places: one Postgres table with PostGIS is plenty',
      'You need routes or travel times on real roads: that is a routing engine, not a proximity search'
    ],
    glossary: [
      { term: 'Geohash', def: 'A short string for a grid cell, built so that cells sharing a longer prefix are usually close together.' },
      { term: 'Neighbouring cells', def: 'The 8 cells around the user\'s cell; they must be searched too, because a place 20 m away can sit just across a cell border.' },
      { term: 'Quadtree', def: 'A tree that splits the map into four squares, and splits each square again only where it holds many places.' },
      { term: 'S2 cells', def: 'Google\'s open-source system of cells on a sphere, numbered along a curve so nearby cells get nearby ids.' },
      { term: 'Great-circle distance', def: 'The true shortest distance between two points on the Earth\'s surface, used to filter the final candidates.' },
      { term: 'PostGIS', def: 'An extension that adds map data types and spatial indexes to the Postgres database.' },
      { term: 'Read replica', def: 'A read-only copy of data on another server, added to serve more reads.' },
      { term: 'CDC (change data capture)', def: 'Streaming every change from the database\'s log, so other systems such as the index can update within seconds.' }
    ]
  },

  requirements: {
    functional: [
      'Search places near a lat/lng within a radius',
      'Filter by category, open now, price',
      'Rank by distance, rating and relevance',
      'View a place\'s details',
      'Owners add or edit a place (visible within minutes, or next day)',
      'Variant: find nearby <i>people</i> who move (Tinder-style)'
    ],
    nonFunctional: [
      'Search p99 ≲ 100 ms (<em>estimate</em> target)',
      'Read-heavy: thousands of searches/s, few writes',
      'Highly available; stale-by-minutes is acceptable',
      'Correct at cell edges (no missed neighbours)',
      'Works in dense cities and empty countryside',
      'User locations are private and short-lived'
    ],
    outOfScope: ['Reviews and photos', 'Routing / turn-by-turn', 'Ads ranking', 'Map tile rendering']
  },

  calculator: {
    inputs: [
      { id: 'dau', label: 'Daily active users', min: 1000000, max: 500000000, value: 100000000, log: true },
      { id: 'q', label: 'Searches per user per day', min: 1, max: 20, value: 5 },
      { id: 'places', label: 'Places in the index', min: 1000000, max: 1000000000, value: 200000000, log: true },
      { id: 'rec', label: 'Bytes per full place record', min: 200, max: 5000, step: 100, value: 1000, fmt: 'bytes' },
      { id: 'peak', label: 'Peak-to-average ratio', min: 1, max: 6, step: 0.5, value: 3, unit: '×' },
      { id: 'node', label: 'Searches/s one index replica can serve', min: 500, max: 20000, step: 500, value: 5000 }
    ],
    outputs: [
      { label: 'Average search QPS', f: (v) => (v.dau * v.q) / 86400 },
      { label: 'Peak search QPS', f: (v) => (v.dau * v.q / 86400) * v.peak },
      { label: 'Geo index in RAM (~40 B/place: id + lat/lng + cell)', fmt: 'bytes', f: (v) => v.places * 40 },
      { label: 'Place table size (one copy)', fmt: 'bytes', f: (v) => v.places * v.rec },
      { label: 'Index replicas at peak (+1 spare)', f: (v) => Math.ceil((v.dau * v.q / 86400) * v.peak / v.node) + 1 },
      { label: 'Writes/s if 1% of places change daily', f: (v) => (v.places * 0.01) / 86400 }
    ],
    note: 'All inputs are <em>estimates</em> for a Yelp-scale service. The point to notice: the whole geo index fits in a few GB of RAM on every replica, and writes are a rounding error next to reads. Scale by <b>adding replicas</b>, not by sharding the writes.'
  },

  api: [
    { m: 'GET', p: '/v1/search/nearby?lat&lng&radius_m&category&limit&cursor', d: 'Returns ids, distance and a short summary. Safe to cache for a minute keyed on <code>(cell, radius, filters)</code>.' },
    { m: 'GET', p: '/v1/places/{id}', d: 'Full details. Served from a read-through cache in front of the place DB.' },
    { m: 'POST', p: '/v1/places', d: 'Owner creates a place. Written to the primary DB; the index picks it up via CDC or the nightly build.' },
    { m: 'PATCH', p: '/v1/places/{id}', d: 'Edit hours, location or category. Location edits move the place to a new cell.' },
    { m: 'PUT', p: '/v1/me/location', d: 'Moving-user variant only: <code>{lat,lng}</code> on app open or significant move. Stored with a TTL, never as history.' }
  ],
  dataModel: [
    { name: 'places', store: 'Postgres + PostGIS (primary)', fields: [['place_id', 'bigint', 'pk'], ['name, category', 'text', 'idx'], ['geog', 'geography(Point)', 'idx'], ['rating, review_count', 'numeric'], ['updated_at', 'timestamptz']], note: 'Source of truth. GiST index on <code>geog</code>.' },
    { name: 'geo_index', store: 'In-memory on every LBS replica', fields: [['cell', 'geohash / S2 id', 'pk'], ['place_ids', 'sorted array'], ['lat, lng', 'float32 ×2']], note: 'Read-only snapshot, rebuilt from the DB and patched from CDC.' },
    { name: 'user_location', store: 'Redis (moving users only)', fields: [['user_id', 'bigint', 'pk'], ['s2_cell', 'uint64', 'idx'], ['lat, lng', 'float'], ['expires', 'TTL ~ hours']], note: 'Ephemeral and privacy-sensitive.' }
  ],

  architecture: {
    title: 'Proximity service architecture',
    nodes: [
      { id: 'usr', label: 'User app', sub: 'lat/lng + radius', kind: 'client', wide: [90, 160], tall: [105, 0], tip: 'Sends the current position and a radius or viewport. Usually rounds the location before sending.' },
      { id: 'own', label: 'Owner app', sub: 'add / edit place', kind: 'client', wide: [90, 400], tall: [315, 0], tip: 'Business owners create and edit places. Rare writes compared with searches.' },
      { id: 'gw', label: 'API gateway', sub: 'auth · rate limit', kind: 'edge', wide: [270, 280], tall: [210, 105], tip: 'Routes read traffic to the LBS and write traffic to the place service.' },
      { id: 'lbs', label: 'Location search', sub: 'stateless LBS', kind: 'service', wide: [470, 160], tall: [210, 215], tip: 'Turns (lat, lng, radius) into a set of cells, reads candidates from the geo index, filters by true distance, ranks and hydrates.' },
      { id: 'rc', label: 'Result cache', sub: 'cell · radius · filter', kind: 'cache', wide: [470, 40], tall: [350, 105], tip: 'Short-TTL cache of search results. Rounding the location to a cell makes the key shareable across nearby users.' },
      { id: 'rank', label: 'Ranker', sub: 'distance · rating', kind: 'compute', wide: [690, 40], tall: [70, 105], tip: 'Scores candidates on distance, rating, open-now and text relevance.' },
      { id: 'geo', label: 'Geo index', sub: 'in-memory · replicas', kind: 'cache', wide: [690, 160], tall: [70, 325], tip: 'Cell id → place ids. Read-only snapshot held in RAM on every replica, so reads scale by adding replicas.' },
      { id: 'dc', label: 'Detail cache', sub: 'place_id → summary', kind: 'cache', wide: [690, 280], tall: [210, 325], tip: 'Read-through cache for names, ratings and hours. Invalidated on update.' },
      { id: 'biz', label: 'Place service', sub: 'CRUD + validation', kind: 'service', wide: [470, 400], tall: [350, 215], tip: 'Validates and geocodes owner edits, then writes to the primary DB.' },
      { id: 'bdb', label: 'Place DB', sub: 'Postgres + PostGIS', kind: 'store', wide: [690, 400], tall: [350, 325], tip: 'Source of truth with read replicas. Also answers ad-hoc ST_DWithin queries for small regions.' },
      { id: 'cdc', label: 'CDC stream', sub: 'Debezium → Kafka', kind: 'queue', wide: [890, 400], tall: [350, 435], tip: 'Row changes from the WAL. Lets the index catch up in seconds instead of waiting for a nightly rebuild.' },
      { id: 'idx', label: 'Index builder', sub: 'snapshot + patches', kind: 'compute', wide: [890, 160], tall: [70, 435], tip: 'Builds a full index snapshot (nightly) and applies CDC patches to the live replicas in between.' }
    ],
    edges: [
      { from: 'usr', to: 'gw', bidi: true },
      { from: 'own', to: 'gw' },
      { from: 'gw', to: 'lbs' },
      { from: 'lbs', to: 'rc' },
      { from: 'lbs', to: 'geo' },
      { from: 'lbs', to: 'rank' },
      { from: 'lbs', to: 'dc' },
      { from: 'gw', to: 'biz' },
      { from: 'biz', to: 'bdb' },
      { from: 'dc', to: 'bdb', dashed: true },
      { from: 'bdb', to: 'cdc' },
      { from: 'cdc', to: 'idx' },
      { from: 'idx', to: 'geo' }
    ]
  },

  scenarios: [
    {
      id: 'search', title: 'Search nearby (2 km)', tone: 'ok',
      steps: [
        { text: 'The app sends <code>{lat, lng, radius: 2 km, category: "coffee"}</code>. The gateway routes it to any <b>stateless</b> LBS replica.', flow: ['usr>gw', 'gw>lbs'] },
        { text: 'The LBS picks a cell size at least as big as the radius (geohash length 5 ≈ 4.9 km) and checks the <b>result cache</b> keyed on <code>(cell, radius, filter)</code>. Miss.', flow: ['lbs>rc'], badges: { rc: ['miss', 'warn'] } },
        { text: 'It reads the user\'s cell <b>plus its 8 neighbours</b> from the in-memory index. Neighbours matter: a café 20 m away can sit in the next cell with a different prefix.', flow: ['lbs>geo'], badges: { geo: '9 cells' } },
        { text: 'Candidates are filtered by <b>true great-circle distance</b> (most of the 9-cell box is outside the circle), then ranked on distance + rating.', flow: ['lbs>rank'], badges: { rank: 'top 20' } },
        { text: 'Names and ratings come from the <b>detail cache</b>. The result is cached for ~60 s and returned in tens of ms.', flow: ['lbs>dc', 'lbs>rc', 'lbs>gw', 'gw>usr'], tone: 'ok', badges: { usr: ['20 results', 'ok'] } }
      ]
    },
    {
      id: 'density', title: 'Dense city vs empty countryside', tone: 'warn',
      steps: [
        { text: '<b>Downtown:</b> a 2 km circle holds thousands of places. Scanning 9 big cells pulls far more candidates than needed.', flow: ['usr>gw', 'gw>lbs', 'lbs>geo'], warn: ['geo'], badges: { geo: ['12K cand.', 'warn'] }, tone: 'warn' },
        { text: 'Fix: use a <b>finer cell</b> for dense areas (or a quadtree, whose leaves split where data is dense) and stop once you have enough ranked results.', nodes: ['lbs', 'geo'], labels: { geo: { sub: 'finer cells downtown' } }, ok: ['geo'] },
        { text: '<b>Countryside:</b> the same 2 km search returns nothing. The LBS <b>expands the radius</b> (coarser cell, shorter prefix) until it has enough results or hits a cap.', flow: ['lbs>geo', 'lbs>geo'], badges: { geo: '2 → 8 → 30 km' } },
        { text: 'The ranker then trades distance for quality, so a 4.8★ place 12 km away can beat a 3★ place 9 km away. Results are returned with the radius actually used.', flow: ['lbs>rank', 'lbs>gw', 'gw>usr'], tone: 'ok' }
      ]
    },
    {
      id: 'update', title: 'Owner edits a place', tone: 'info',
      steps: [
        { text: 'An owner moves their shop across the street. The place service validates and geocodes it, then commits to the <b>primary</b> DB.', flow: ['own>gw', 'gw>biz', 'biz>bdb'], badges: { bdb: 'committed' } },
        { text: 'Option A (classic): wait for the <b>nightly snapshot</b>. Simple, and fine for most edits, but the place shows up in the wrong cell until tomorrow.', nodes: ['idx'], labels: { idx: { sub: 'nightly full rebuild' } }, warn: ['idx'] },
        { text: 'Option B: <b>CDC</b> streams the row change from the WAL. The index builder removes the id from the old cell and adds it to the new one on every replica.', flow: ['bdb>cdc', 'cdc>idx', 'idx>geo'], badges: { geo: 'patched' } },
        { text: 'The <b>detail cache</b> entry is invalidated and the next read repopulates it. Search results cached for 60 s simply age out.', flow: ['dc>bdb'], ok: ['dc', 'geo'], tone: 'ok' }
      ]
    },
    {
      id: 'moving', title: 'Moving users (Tinder-style)', tone: 'warn',
      steps: [
        { text: 'Now the "places" are <b>people</b> who move. Every app open sends a new location, so the index takes a steady stream of writes.', flow: ['usr>gw', 'gw>lbs', 'lbs>geo'], labels: { geo: { label: 'Geoshards', sub: 'S2 cells → shards' } }, badges: { geo: 'writes!' } },
        { text: 'Tinder\'s answer: <b>shard by S2 cell</b>. The Hilbert curve keeps nearby cells next to each other, so one shard covers one compact region.', nodes: ['geo'], labels: { geo: { label: 'Geoshards', sub: 'S2 · Hilbert order' } }, ok: ['geo'] },
        { text: 'A search covers its circle with S2 cells and queries <b>only the shards</b> that own them, not the whole fleet.', flow: ['lbs>geo'], labels: { geo: { label: 'Geoshards', sub: '2 of ~50 shards hit' } } },
        { text: 'Load is uneven: one region\'s evening peak is another\'s night. Tinder saw &gt;10× differences between shards and <b>co-located shards from different time zones</b> on the same nodes.', nodes: ['geo'], warn: ['geo'], labels: { geo: { label: 'Geoshards', sub: 'mix time zones / node' } }, tone: 'warn' }
      ]
    },
    {
      id: 'replica-down', title: 'Index replica dies mid-peak', tone: 'err',
      steps: [
        { text: 'One geo-index replica crashes during the lunch peak. Requests routed to it time out.', nodes: ['geo'], err: ['geo'], badges: { geo: ['replica down', 'err'] }, tone: 'err' },
        { text: 'Health checks pull it out of rotation. Because every replica holds the <b>whole read-only index</b>, any other replica can answer any query.', nodes: ['lbs', 'geo'], warn: ['geo'], badges: { geo: ['N-1 replicas', 'warn'] }, tone: 'warn' },
        { text: 'A replacement boots from the latest <b>snapshot</b> (minutes, not hours) and replays CDC changes since the snapshot\'s WAL position.', flow: ['bdb>cdc', 'cdc>idx', 'idx>geo'], badges: { geo: 'warming' } },
        { text: 'It joins only after it has caught up, so it never serves stale cells. No data was lost: the DB is the source of truth.', nodes: ['geo'], ok: ['geo'], badges: { geo: ['healthy', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick an index, a radius and a workload. Watch how many cells are probed, how much of the scan is wasted, and what the write path costs. Numbers are illustrative.',
    controls: [
      { id: 'index', label: 'Spatial index', type: 'seg', value: 'geohash', options: [
        { v: 'geohash', l: 'Geohash' }, { v: 'quadtree', l: 'Quadtree' }, { v: 's2', l: 'S2 cells' }, { v: 'postgis', l: 'PostGIS GiST' }] },
      { id: 'radius', label: 'Search radius', type: 'range', min: 0.5, max: 25, step: 0.5, value: 2, unit: 'km' },
      { id: 'density', label: 'Area density', type: 'seg', value: 'city', options: [
        { v: 'city', l: 'Dense city', hint: '~1,000 places/km² (estimate)' }, { v: 'suburb', l: 'Suburb', hint: '~50 places/km²' }, { v: 'rural', l: 'Rural', hint: '~1 place/km²' }] },
      { id: 'work', label: 'What is indexed', type: 'seg', value: 'static', options: [
        { v: 'static', l: 'Static places (Yelp)' }, { v: 'moving', l: 'Moving users (Tinder)' }] },
      { id: 'fresh', label: 'Index updates', type: 'seg', value: 'cdc', options: [
        { v: 'nightly', l: 'Nightly rebuild' }, { v: 'cdc', l: 'CDC stream' }] }
    ],
    evaluate(s) {
      const r = s.radius;
      const circle = Math.PI * r * r;
      const dens = { city: 1000, suburb: 50, rural: 1 }[s.density];
      // geohash cell sizes at the equator (km): length → [w, h]
      const GH = [[3, 156, 156], [4, 39.1, 19.5], [5, 4.89, 4.89], [6, 1.22, 0.61], [7, 0.153, 0.153]];
      let gh = GH[0];
      GH.forEach((g) => { if (Math.min(g[1], g[2]) >= r) gh = g; });
      let probes, scanned, sub, latBase, writeCost, writeS;
      if (s.index === 'geohash') {
        probes = 9; scanned = 9 * gh[1] * gh[2]; sub = 'length ' + gh[0] + ' · cell + 8 nbrs';
        latBase = 1; writeCost = 'move id between 2 cell sets'; writeS = 0.85;
      } else if (s.index === 's2') {
        probes = 8; scanned = circle * 1.6; sub = 'covering ≤ 8 cells';
        latBase = 1; writeCost = 'new cell id, move id'; writeS = 0.85;
      } else if (s.index === 'quadtree') {
        const leafArea = 100 / dens; // leaves hold ≤ 100 places
        scanned = Math.pow(Math.sqrt(circle) + Math.sqrt(leafArea), 2);
        probes = Math.max(1, Math.round(scanned / leafArea)) + Math.round(Math.log(Math.max(2, 2e8 / 100)) / Math.log(4));
        sub = 'leaves ≤ 100 places'; latBase = 1.5; writeCost = 'split / merge nodes'; writeS = 0.45;
      } else {
        probes = Math.round(Math.log(2e8) / Math.log(50)) + 2; scanned = 4 * r * r; sub = 'GiST · ST_DWithin';
        latBase = 4; writeCost = 'WAL + GiST update + vacuum'; writeS = s.work === 'moving' ? 0.2 : 0.75;
      }
      const cand = scanned * dens;
      const found = circle * dens;
      const useful = Math.min(1, circle / scanned);
      const latency = latBase + cand * (s.index === 'postgis' ? 0.004 : 0.0005);
      const wps = s.work === 'moving' ? 20e6 / 300 : 2e8 * 0.01 / 86400;
      const stale = s.fresh === 'nightly' ? (s.work === 'moving' ? 'hours (useless for people)' : '≤ 24 h') : 'seconds';
      const metrics = [
        { k: 'Cells / nodes probed', v: String(probes), s: probes <= 10 ? 0.85 : probes <= 30 ? 0.6 : 0.35 },
        { k: 'Candidates scanned', v: SD.fmt.num(Math.max(cand, 0.1)) + ' for ~' + SD.fmt.num(Math.max(found, 0.1)) + ' hits', s: cand < 2e3 ? 0.9 : cand < 2e4 ? 0.6 : 0.25 },
        { k: 'Scan precision', v: Math.round(useful * 100) + '% of scanned area in circle', s: useful },
        { k: 'Search latency (est.)', v: '≈ ' + SD.fmt.dur(latency), s: latency < 20 ? 0.9 : latency < 80 ? 0.6 : 0.25 },
        { k: 'Write path', v: SD.fmt.num(wps) + ' updates/s · ' + writeCost, s: s.work === 'moving' ? writeS : Math.max(0.7, writeS) },
        { k: 'Index freshness', v: stale, s: s.fresh === 'cdc' ? 0.85 : s.work === 'moving' ? 0.05 : 0.5 }
      ];
      const notes = [];
      if (s.index === 'geohash') notes.push('Geohash length ' + gh[0] + ' cells are ~' + gh[1] + ' × ' + gh[2] + ' km. You must always read the <b>8 neighbours</b>: two points a metre apart can have different prefixes at a cell edge.');
      if (s.index === 's2') notes.push('S2 projects the sphere onto a cube and numbers cells along a <b>Hilbert curve</b>, so a covering of a circle maps to a few contiguous id ranges with little wasted area.');
      if (s.index === 'quadtree') notes.push('A quadtree <b>adapts to density</b>: leaves are tiny downtown and huge in the desert, so each leaf holds a similar number of places. Great for static data, awkward for moving points.');
      if (s.index === 'postgis') notes.push('<code>ST_DWithin(geog, point, m)</code> uses the GiST index for a bounding-box pass, then checks exact distance. Perfect up to millions of rows; every search is a DB query, so add read replicas.');
      if (s.density === 'city' && cand > 2e4) notes.push('Dense area + big radius: stop after the top N by distance, or switch to a finer cell. Users never scroll through thousands of results.');
      if (s.density === 'rural' && found < 5) notes.push('Fewer than 5 hits expected: the LBS should <b>expand the radius</b> automatically rather than show an empty list.');
      if (s.work === 'moving') notes.push('Moving users mean ~' + SD.fmt.num(wps) + ' location writes/s (20M online, one update per 5 min: <em>estimate</em>). Tinder handled this by <b>sharding on S2 cells</b>.');
      let verdict;
      if (s.work === 'moving' && s.fresh === 'nightly') verdict = '❌ <b>A nightly index cannot track people.</b> Moving users need a live, write-friendly index (S2 or geohash sets, sharded by cell).';
      else if (s.work === 'moving' && (s.index === 'postgis' || s.index === 'quadtree')) verdict = '⚠ <b>Write path will hurt.</b> ' + (s.index === 'postgis' ? 'Constant UPDATEs churn the GiST index and WAL.' : 'Moving points keep splitting and merging tree nodes.') + ' Prefer S2 or geohash cells.';
      else if (s.work === 'moving' && s.index === 's2') verdict = '✅ <b>Close to Tinder\'s published design:</b> S2 cells, shards made of Hilbert-contiguous cells, and queries that touch only the shards covering the circle.';
      else if (cand > 5e4) verdict = '⚠ <b>Too many candidates.</b> The cells are much bigger than the circle. Use a finer cell, a quadtree, or cap results early.';
      else if (s.index === 'postgis') verdict = '👍 <b>Simplest correct answer.</b> PostGIS + GiST + read replicas is plenty for one country. Move to an in-memory index when the DB becomes the bottleneck.';
      else if (s.index === 'quadtree' && s.work === 'static') verdict = '✅ <b>Strong choice for static places:</b> an in-memory quadtree rebuilt from the DB and replicated; leaves adapt to density.';
      else verdict = '👍 Workable. Check scan precision and freshness to see which trade-off you are paying for.';
      const labels = { geo: { label: { geohash: 'Geohash index', quadtree: 'Quadtree', s2: 'S2 cell index', postgis: 'PostGIS replicas' }[s.index], sub } };
      labels.idx = { label: 'Index builder', sub: s.fresh === 'nightly' ? 'nightly full rebuild' : 'snapshot + CDC patches' };
      if (s.work === 'moving') labels.usr = { label: 'User app', sub: 'location on app open' };
      const flow = s.work === 'moving' ? ['usr>gw', 'gw>lbs', 'lbs>geo', 'lbs>rank'] : ['usr>gw', 'gw>lbs', 'lbs>rc', 'lbs>geo', 'lbs>rank', 'lbs>dc'];
      return {
        metrics, verdict, notes, labels, flow,
        hide: s.fresh === 'nightly' ? ['cdc'] : [],
        hot: ['geo'],
        warn: cand > 5e4 || (s.work === 'moving' && writeS < 0.5) ? ['geo'] : [],
        err: s.work === 'moving' && s.fresh === 'nightly' ? ['idx'] : [],
        badges: { geo: [SD.fmt.num(Math.max(cand, 0.1)) + ' cand.', cand > 5e4 ? 'err' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Geohash cells vs quadtree, on a real map grid',
    caption: 'Points are places in a 14 × 9 km box of San Francisco. <b>Geohash:</b> tap the map to search; the real geohash of your point is shown with its 8 neighbours. Make the cells smaller than the radius to see results go missing. <b>Quadtree:</b> add places and watch leaves split where it is dense.'
  },

  realWorld: {
    intro: 'Proximity search shows up as "businesses near me" (Yelp, Maps) and "people near me" (Tinder). The published designs differ mainly in how often the data moves.',
    timeline: [
      { when: '2016 · ES 5.0', who: 'Lucene / Elastic', title: 'Points indexed in block k-d trees', text: 'Lucene 6 added <b>BKD trees</b> for numeric and 2-D <code>geo_point</code> fields, which Elasticsearch 5.0 used for large indexing and search speedups. Before that, shapes were turned into many quadtree/geohash terms in the inverted index.', src: 3 },
      { when: '2017', who: 'Yelp', title: 'Core business search moves to Elasticsearch', text: 'Yelp\'s core search had run on a custom Lucene backend with its own <b>two-tier sharding</b>. It moved to Elasticsearch while keeping ranking code free of any hard dependency on ES or Lucene.', src: 0 },
      { when: '2019', who: 'Tinder', title: 'Geosharded recommendations on S2', text: 'After comparing geo libraries Tinder chose <b>Google S2</b>. Cells are grouped into shards; the <b>Hilbert curve</b> keeps a shard\'s cells geographically together. Load tests pointed to <b>40–100 geoshards</b> worldwide, and a query only hits the shards whose cells cover its circle.', src: 1 },
      { when: '2019', who: 'Tinder', title: 'Time zones break load balance', text: 'Requests per second could differ by <b>more than 10×</b> between shards at any moment. Tinder placed several shards on the same nodes so their daily peaks average out.', src: 2 },
      { when: '2021', who: 'Yelp', title: 'Nrtsearch replaces Elasticsearch', text: 'Elasticsearch costs did not scale as Yelp wanted, so it built <b>Nrtsearch</b>, a Lucene-based engine that reuses its Java ranking code, and open-sourced it under Apache 2.0.', src: 4 },
      { when: 'Redis 6.2+', who: 'Redis', title: 'GEOSEARCH on a sorted set', text: 'Redis GEO stores each member as a <b>52-bit interleaved geohash</b> score in an ordinary sorted set. GEOSEARCH computes the bounding area and turns it into a few score ranges, then filters by distance.', src: 5 }
    ],
    lessons: [
      '<span>Static places: <b>read-only in-memory index + replicas</b>. Moving entities: <b>shard by cell</b> and design the write path.</span>',
      '<span>Always query <b>neighbouring cells</b>; prefixes lie at cell edges.</span>',
      '<span>Space-filling curves (Hilbert in S2, Z-order in geohash) turn 2-D search into a few 1-D range scans.</span>',
      '<span>Balance shards by <b>load</b>, not by area: one downtown cell can outweigh a whole country.</span>',
    ],
    sources: [
      { title: 'Moving Yelp\'s Core Business Search to Elasticsearch', url: 'https://engineeringblog.yelp.com/2017/06/moving-yelps-core-business-search-to-elasticsearch.html', pub: 'Yelp Engineering, 2017' },
      { title: 'Geosharded Recommendations Part 1: Sharding Approach', url: 'https://medium.com/tinder/geosharded-recommendations-part-1-sharding-approach-d5d54e0ec77a', pub: 'Tinder Tech Blog, 2019' },
      { title: 'Geosharded Recommendations Part 2: Architecture', url: 'https://medium.com/tinder/geosharded-recommendations-part-2-architecture-3396a8a7efb', pub: 'Tinder Tech Blog, 2019' },
      { title: 'BKD-backed geo_shapes in Elasticsearch: precision + efficiency + speed', url: 'https://www.elastic.co/blog/bkd-backed-geo-shapes-in-elasticsearch-precision-efficiency-speed', pub: 'Elastic blog' },
      { title: 'Nrtsearch: Yelp\'s Fast, Scalable and Cost Effective Search Engine', url: 'https://engineeringblog.yelp.com/2021/09/nrtsearch-yelps-fast-scalable-and-cost-effective-search-engine.html', pub: 'Yelp Engineering, 2021' },
      { title: 'GEOSEARCH command', url: 'https://redis.io/docs/latest/commands/geosearch/', pub: 'redis.io' },
      { title: 'S2 cell hierarchy', url: 'https://s2geometry.io/devguide/s2cell_hierarchy', pub: 's2geometry.io' },
      { title: 'Geosharded Recommendations Part 3: Consistency', url: 'https://medium.com/tinder/geosharded-recommendations-part-3-consistency-2d2cb2f0594b', pub: 'Tinder Tech Blog, 2019' },
      { title: 'ST_DWithin', url: 'https://postgis.net/docs/ST_DWithin.html', pub: 'PostGIS manual' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Index type', '<b>Geohash</b>: string prefixes, trivial to shard and cache', '<b>Quadtree</b>: adapts to density, in memory', 'Geohash for simplicity and moving points; quadtree for static places with very uneven density'],
      ['Cell system', '<b>Geohash</b> (Z-order, rectangles)', '<b>S2</b> (Hilbert, near-uniform cells on a sphere)', 'S2 when you need good coverings, shards of contiguous cells, or global data near the poles'],
      ['Where the index lives', '<b>PostGIS</b> GiST on replicas', '<b>In-memory</b> index in the LBS', 'PostGIS until query rate or latency forces RAM; in-memory when you serve thousands of QPS'],
      ['Freshness', '<b>Nightly rebuild</b>: simple, consistent snapshot', '<b>CDC patches</b>: seconds, more moving parts', 'Nightly for business listings; CDC when owners expect edits to show quickly'],
      ['Scaling reads', '<b>Replicate</b> the full index', '<b>Shard</b> by region / cell', 'Replicate while the index fits in RAM (it usually does); shard when writes or size force it']
    ]
  },
  failures: [
    { f: 'Missed results at cell edges', detect: 'Test queries next to known places on boundaries', fix: 'Always query the 8 neighbours (geohash) or use a proper covering (S2), then filter by exact distance.' },
    { f: 'Hot cell (downtown, event)', detect: 'Per-cell candidate counts and latency', fix: 'Finer cells or quadtree leaves where dense, cap results early, cache by (cell, radius, filter).' },
    { f: 'Index replica out of date', detect: 'CDC consumer lag, snapshot age', fix: 'Gate readiness on catching up; alert on lag; fall back to PostGIS for a single region.' },
    { f: 'Empty results in rural areas', detect: 'Zero-result rate by region', fix: 'Expand radius in steps up to a cap, and return the radius used.' },
    { f: 'Unbalanced geoshards', detect: 'Per-shard QPS over the day', fix: 'Assign cells to shards by load score; co-locate shards from different time zones (Tinder).' },
    { f: 'Location leakage (people search)', detect: 'Privacy review, trilateration tests', fix: 'Round distances, add jitter, never return raw coordinates of other users.' }
  ],

  interview: [
    { q: 'Why not just put a B-tree on lat and lng?', a: '<p>A B-tree can serve one range efficiently. <code>lat BETWEEN a AND b</code> gives a whole <b>stripe around the globe</b>, which is then filtered by lng. Two separate indexes need an intersection of two huge sets.</p><p>Spatial indexes (geohash, S2, R-tree/GiST) keep points that are close in 2-D close in the index.</p>', lvl: 'core' },
    { q: 'How does geohash work, and what is the boundary problem?', a: '<p>Geohash alternately halves longitude and latitude and interleaves the bits, then writes them in base32. Longer prefix = smaller cell (length 6 ≈ 1.2 × 0.6 km).</p><p><b>Boundary problem:</b> the Z-order curve jumps, so two points 1 m apart across an edge can share no prefix at all. Always query the cell <b>plus its 8 neighbours</b>, then filter by real distance.</p>', lvl: 'core' },
    { q: 'Quadtree vs geohash: when would you pick each?', a: '<ul><li><b>Geohash:</b> fixed grid, stateless to compute, easy to cache and shard by prefix, cheap to update. Uneven density means some cells are huge and some empty.</li><li><b>Quadtree:</b> splits a node when it has more than K points, so leaves adapt to density. Built in memory from the DB; updates of moving points cause splits/merges.</li></ul><p>Static businesses: quadtree or geohash both fine. Moving users: geohash/S2 cells.</p>', lvl: 'core' },
    { q: 'Why are read replicas enough for Yelp-style search?', a: '<p>Writes are tiny (a few hundred place edits per second at most) and can be minutes stale. The index is a few GB, so <b>every replica can hold all of it</b>. Reads scale linearly with replicas and any replica can answer any query. Sharding only becomes necessary for huge or write-heavy data.</p>', lvl: 'core' },
    { q: 'How do you rank by distance and rating together?', a: '<p>Fetch candidates inside the radius, then score, for example <code>score = w1·relevance + w2·rating_bayes − w3·log(1 + distance)</code>. Use a <b>Bayesian average</b> for rating so a single 5★ review does not win. Take the top N with a heap. Learn the weights later from clicks.</p>', lvl: 'core' },
    { q: 'How would you handle moving entities, like Tinder users?', a: '<p>Writes dominate, so: store only the latest position with a TTL, map it to an <b>S2 or geohash cell</b>, and <b>shard by cell</b>. A search covers its circle with cells and queries only the shards that own them. Tinder grouped Hilbert-contiguous S2 cells into shards and balanced them by load.</p>', fu: 'How do you stop a user being trilaterated? (Round or bucket distances.)', lvl: 'deep' },
    { q: 'What does S2 give you that geohash does not?', a: '<p>S2 projects the sphere onto a <b>cube</b> and orders cells along a <b>Hilbert curve</b> (levels 0–30, 64-bit ids). Hilbert has no long jumps, so neighbouring cells usually have close ids. Cells are closer to equal-area, and a region covering uses a mix of cell sizes with little waste. Geohash is a Z-order on lat/lng rectangles, which distort towards the poles.</p>', lvl: 'deep' },
    { q: 'What does the search do in a sparse area?', a: '<p>Expand the radius in steps (coarser cell, or more rings) until there are at least N results or a maximum radius is hit. Return the radius used so the UI can say "nearest results are 12 km away".</p>', lvl: 'core' },
    { q: 'How do business updates reach the index?', a: '<p>Write to the primary DB. Then either rebuild the snapshot nightly, or stream changes with <b>CDC</b> (Debezium on the WAL) and patch each replica: remove the id from the old cell, add it to the new one. New replicas load the latest snapshot and replay CDC from its position.</p>', lvl: 'core' },
    { q: 'How would you cache search results?', a: '<p>Round the location to a cell and key on <code>(cell, radius, filters, page)</code>. Nearby users then share entries. TTL of about a minute bounds staleness. Do not key on raw lat/lng: every request would be unique.</p>', lvl: 'core' },
    { q: 'When is plain PostGIS the right answer?', a: '<p>Up to tens of millions of rows and a few thousand QPS with replicas. <code>ST_DWithin(geog, point, meters)</code> uses the <b>GiST</b> index for a bounding-box pass and then checks exact distance; <code>ORDER BY geog &lt;-&gt; point</code> gives index-assisted nearest-neighbour. Start here and move to an in-memory index when you measure the need.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Postgres + PostGIS: radius search with a GiST index', lang: 'sql',
      code: `CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE places (
  place_id  bigserial PRIMARY KEY,
  name      text NOT NULL,
  category  text NOT NULL,
  rating    numeric(2,1),
  geog      geography(Point, 4326) NOT NULL
);
CREATE INDEX places_geog_gix ON places USING gist (geog);
CREATE INDEX places_cat_idx  ON places (category);

-- coffee within 2 km, nearest first (lng first, then lat!)
SELECT place_id, name, rating,
       ST_Distance(geog, me.pt) AS meters
FROM   places,
       (SELECT ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography AS pt) me
WHERE  category = 'coffee'
  AND  ST_DWithin(geog, me.pt, 2000)      -- uses the GiST index
ORDER  BY geog <-> me.pt                  -- index-assisted KNN
LIMIT  20;`,
      note: 'For <code>geography</code>, distances are in metres. Put <b>longitude first</b> in <code>ST_MakePoint</code>.'
    },
    {
      title: 'Spring Boot: Redis GEO search (Redis 6.2+)', lang: 'java',
      code: `// spring-boot-starter-data-redis (Spring Data Redis 3.x)
@Service
public class NearbyService {
  private static final String KEY = "places:coffee";
  private final GeoOperations<String, String> geo;

  public NearbyService(StringRedisTemplate redis) {
    this.geo = redis.opsForGeo();
  }

  public void upsert(long placeId, double lng, double lat) {
    geo.add(KEY, new Point(lng, lat), String.valueOf(placeId)); // GEOADD
  }

  public List<Nearby> search(double lng, double lat, double km) {
    var args = RedisGeoCommands.GeoSearchCommandArgs.newGeoSearchArgs()
        .includeDistance().sortAscending().limit(50);
    GeoResults<RedisGeoCommands.GeoLocation<String>> res = geo.search(
        KEY, GeoReference.fromCoordinate(lng, lat),
        new Distance(km, Metrics.KILOMETERS), args);          // GEOSEARCH
    return res.getContent().stream()
        .map(r -> new Nearby(Long.parseLong(r.getContent().getName()),
                             r.getDistance().getValue()))
        .toList();
  }

  public record Nearby(long placeId, double km) {}
}`,
      note: 'One key per category keeps candidate sets small. For a global dataset, shard keys by region (for example <code>places:{9q8}:coffee</code>).'
    },
    {
      title: 'Python: geohash encode + the 8 neighbours', lang: 'python',
      code: `B32 = "0123456789bcdefghjkmnpqrstuvwxyz"

def encode(lat: float, lng: float, length: int = 6) -> str:
    lat_r, lng_r = [-90.0, 90.0], [-180.0, 180.0]
    bits, even, out, ch = 0, True, [], 0
    while len(out) < length:
        rng, val = (lng_r, lng) if even else (lat_r, lat)   # lng bit first
        mid = (rng[0] + rng[1]) / 2
        if val >= mid:
            ch = (ch << 1) | 1; rng[0] = mid
        else:
            ch = ch << 1;       rng[1] = mid
        even, bits = not even, bits + 1
        if bits == 5:
            out.append(B32[ch]); bits, ch = 0, 0
    return "".join(out)

def cell_size(length: int) -> tuple[float, float]:
    n = 5 * length
    return 360 / 2 ** ((n + 1) // 2), 180 / 2 ** (n // 2)   # (dlng, dlat)

def search_cells(lat: float, lng: float, length: int) -> set[str]:
    dlng, dlat = cell_size(length)
    return {encode(lat + i * dlat, lng + j * dlng, length)
            for i in (-1, 0, 1) for j in (-1, 0, 1)}        # cell + 8 nbrs`
    }
  ],

  related: ['ride-sharing', 'food-delivery', 'search-engine', 'distributed-cache', 'typeahead']
});
