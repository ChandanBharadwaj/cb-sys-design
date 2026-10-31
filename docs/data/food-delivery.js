SD.register({
  slug: 'food-delivery',
  domain: 3,
  title: 'Food Delivery Platform',
  examples: 'Swiggy, Zomato, DoorDash',
  tagline: 'Coordinate an eater, a kitchen and a rider so that the rider walks in <b>just as the food is packed</b>, and do it for every order in the city every few seconds.',
  tldr: {
    problem: 'Three parties, one deadline you do not control: the kitchen. Prep time is uncertain, riders are scarce at dinner peak, and every minute a rider waits at a counter is a minute not delivering.',
    idea: 'Predict <b>prep time</b> and <b>travel times</b> with ML. Every few seconds, per zone, solve a <b>batched assignment</b> of open orders to riders (Hungarian or MIP) that minimises lateness and rider idle time, and <b>stack</b> compatible orders onto one trip.',
    insight: 'Delivery time = <b>max(assignment delay + first mile, prep time) + last mile</b>. Assignment runs <i>in parallel</i> with cooking, so the best rider is not the nearest one; it is the one who arrives when the food is ready.',
    numbers: [
      { v: '34×', l: 'Gurobi vs open-source CBC on DoorDash\'s dispatch MIP (2020)' },
      { v: '≤ 10×', l: 'commercial solver vs Hungarian on the same matching (DoorDash, 2020)' },
      { v: '3 legs', l: 'assign + first mile ∥ prep, then last mile (Swiggy)' }
    ]
  },

  intro: {
    what: 'A food delivery platform connects three people: a hungry customer, a restaurant kitchen and a delivery rider. It takes the order, tells the kitchen, and chooses which rider should collect the food, so the meal arrives <b>hot and on time</b>.',
    analogy: {
      icon: '🍱',
      title: 'A head waiter who times the pickups',
      text: 'In a busy restaurant, the head waiter does not send a waiter to the kitchen the moment an order goes in. They know roughly how long each dish takes and call a waiter just as the plate is ready. Too early wastes a waiter; too late and the food goes cold. The platform does the same across a whole city, except its "waiters" are riders spread over many streets, and it has to guess the cooking time.'
    },
    problem: 'You order biryani at 8 pm on a rainy Friday. The kitchen says 15 minutes, but it is busy. Send a rider too early and they stand at the counter while other orders wait. Send one too late and your food sits getting cold. The system answers <b>"which rider should take which order, and when, so the food is picked up just as it is ready?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'Send the nearest free rider right away',
        text: 'As soon as an order is placed, find the closest idle rider and send them to the restaurant. Each order is handled alone, the moment it arrives. It is simple and feels fast.',
        scene: {
          nodes: [
            { id: 'cust', label: 'Customer', sub: 'orders biryani', kind: 'client', at: [70, 0] },
            { id: 'rest', label: 'Restaurant', sub: 'cooking 15 min', kind: 'client', at: [350, 0] },
            { id: 'ord', label: 'Order service', sub: 'grab nearest', kind: 'service', at: [210, 110] },
            { id: 'rider', label: 'Rider', sub: 'sent at once', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'cust', to: 'ord' }, { from: 'ord', to: 'rest' }, { from: 'ord', to: 'rider' }, { from: 'rider', to: 'rest' }],
          flow: ['cust>ord', ['ord>rest', 'ord>rider'], 'rider>rest']
        }
      },
      {
        stage: 'breaks',
        title: 'Riders wait at counters while orders pile up',
        text: 'The rider arrives in 5 minutes and <b>waits 10 more</b> for the food. At dinner peak there are more orders than free riders, and many riders are stuck at counters. Deciding one order at a time also misses better pairings, such as one rider taking two orders to the same street.',
        scene: {
          nodes: [
            { id: 'cust', label: 'Customers', sub: 'orders piling up', kind: 'client', at: [70, 0] },
            { id: 'rest', label: 'Restaurant', sub: 'food not ready', kind: 'client', at: [350, 0] },
            { id: 'ord', label: 'Order service', sub: 'no rider free', kind: 'service', at: [210, 110] },
            { id: 'rider', label: 'Rider', sub: 'waiting 10 min', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'cust', to: 'ord' }, { from: 'ord', to: 'rest' }, { from: 'ord', to: 'rider' }, { from: 'rider', to: 'rest' }],
          flow: [['cust>ord', 'cust>ord'], 'ord>rider', 'rider>rest'],
          err: ['ord', 'rider'],
          warn: ['cust', 'rest'],
          badges: { ord: ['no riders', 'err'], rider: ['idle ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Predict when food is ready, and match in batches',
        text: 'A model predicts <b>when the food will be ready</b> and how long each ride takes. Every few seconds, for each area of the city, a <b>dispatch</b> service looks at all open orders and nearby riders together and picks the best pairing. The rider is timed to arrive as the food is packed, and nearby orders can share one trip.',
        scene: {
          nodes: [
            { id: 'cust', label: 'Customer', sub: 'orders biryani', kind: 'client', at: [70, 0] },
            { id: 'rest', label: 'Restaurant', sub: 'ready in 17 min', kind: 'client', at: [350, 0] },
            { id: 'ord', label: 'Order service', sub: 'tracks order', kind: 'service', at: [70, 110] },
            { id: 'disp', label: 'Dispatch', sub: 'batch per area', kind: 'compute', at: [210, 110] },
            { id: 'eta', label: 'Prep + ETA ML', sub: 'ready + travel', kind: 'ml', at: [350, 110] },
            { id: 'geo', label: 'Rider map', sub: 'live positions', kind: 'cache', at: [70, 220] },
            { id: 'rider', label: 'Rider', sub: 'arrives on time', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'cust', to: 'ord' }, { from: 'ord', to: 'disp' }, { from: 'rest', to: 'eta' }, { from: 'disp', to: 'eta' }, { from: 'disp', to: 'geo' }, { from: 'disp', to: 'rider' }],
          flow: ['cust>ord', 'ord>disp', ['disp>eta', 'disp>geo'], 'disp>rider'],
          ok: ['disp', 'geo', 'rider'],
          badges: { rider: ['on time ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['DoorDash', 'Swiggy', 'Zomato', 'Uber Eats', 'Deliveroo'],
    whenToUse: [
      'Three parties must meet: a customer, a place that <b>prepares</b> something, and a courier',
      'Prep time is uncertain, so timing the pickup matters as much as distance',
      'Couriers are scarce at peaks, so batching and sharing trips pays off'
    ],
    whenNot: [
      'A ride from A to B with no kitchen to wait for (see <a href="ride-sharing.html">Ride-Sharing</a>)',
      'Parcels collected once a day for next-day delivery: plan routes overnight in a batch',
      'You only need to list nearby restaurants (see <a href="proximity-service.html">Proximity Service</a>)'
    ],
    glossary: [
      { term: 'Dispatch', def: 'Deciding which rider gets which order, and sending them the offer.' },
      { term: 'Prep time', def: 'How long the kitchen needs to cook and pack an order, predicted from its history and current load.' },
      { term: 'First mile / last mile', def: 'The rider\'s trip to the restaurant, and the trip from the restaurant to the customer.' },
      { term: 'Batched assignment', def: 'Collecting open orders and riders for a few seconds, then matching them all at once instead of one by one.' },
      { term: 'Stacking', def: 'Giving one rider two or more orders on the same trip when it does not make anyone too late.' },
      { term: 'Zone', def: 'A small area of the city that dispatch solves on its own, to keep each problem small.' },
      { term: 'ETA', def: 'Estimated time of arrival: when the rider or the food is expected to arrive.' },
      { term: 'Offer', def: 'A job sent to a rider\'s phone with a short countdown to accept or decline.' }
    ]
  },

  requirements: {
    functional: [
      'Show restaurants that can deliver to an address, with an ETA',
      'Place and pay for an order; restaurant accepts and sets prep time',
      'Assign a rider; rider accepts, picks up and delivers',
      'Stack two or more orders onto one rider when it helps',
      'Live map tracking and ETA updates for the eater',
      'Cancel, reassign and refund flows'
    ],
    nonFunctional: [
      'Assignment decisions every few seconds per zone',
      'Promised ETA accurate to a few minutes',
      'Reassign within seconds when a rider declines',
      'Rider location ingest: riders ÷ ping interval writes/s',
      'Dinner and rain peaks of 2–3× (estimate)',
      'Order state durable; tracking pings may be lossy'
    ],
    outOfScope: ['Payments and rider payouts (see Payment Gateway)', 'Restaurant menus and search ranking', 'Turn-by-turn navigation', 'Grocery / quick-commerce dark stores']
  },

  calculator: {
    inputs: [
      { id: 'orders', label: 'Orders per day', min: 100000, max: 30000000, value: 3000000, log: true },
      { id: 'peak', label: 'Share of daily orders in the peak hour', min: 5, max: 25, value: 12, unit: '%' },
      { id: 'dur', label: 'Average order-to-door time', min: 15, max: 60, value: 32, unit: 'min' },
      { id: 'riders', label: 'Riders online at peak', min: 5000, max: 1000000, value: 150000, log: true },
      { id: 'ping', label: 'Rider ping interval', min: 2, max: 15, value: 5, unit: 's' },
      { id: 'win', label: 'Assignment round interval', min: 2, max: 60, value: 10, unit: 's' }
    ],
    outputs: [
      { label: 'Peak orders / minute', f: (v) => v.orders * v.peak / 100 / 60 },
      { label: 'Orders in flight at peak (Little\'s law)', f: (v) => v.orders * v.peak / 100 / 60 * v.dur },
      { label: 'In-flight orders per online rider', fmt: 'raw', f: (v) => (v.orders * v.peak / 100 / 60 * v.dur / v.riders).toFixed(2) },
      { label: 'Rider location writes / second', f: (v) => v.riders / v.ping },
      { label: 'New orders per assignment round (city-wide)', f: (v) => v.orders * v.peak / 100 / 3600 * v.win },
      { label: 'Tracking pushes / second (1 watcher per order)', f: (v) => v.orders * v.peak / 100 / 60 * v.dur / v.ping }
    ],
    note: 'All inputs are <em>estimates</em>. When <b>in-flight orders per rider</b> goes above about 1, you cannot deliver one order per trip at peak: you must <b>stack</b>, slow down promises, or shrink the delivery radius. Each round\'s problem is split by <b>zone</b>, so a single solve is tens to hundreds of orders, not the whole city.'
  },

  api: [
    { m: 'GET', p: '/v1/restaurants?lat&lng', d: 'Restaurants that are serviceable for this address right now, each with a predicted ETA. Radius shrinks when riders are scarce.' },
    { m: 'POST', p: '/v1/orders', d: '<code>{restaurant_id, items, address_id, idempotency_key}</code> → <code>order_id</code> plus the promised ETA window.' },
    { m: 'POST', p: '/v1/merchant/orders/{id}/accept', d: 'Restaurant accepts with <code>{prep_minutes}</code>. The prep model blends this with the kitchen\'s history.' },
    { m: 'WS', p: 'rider ⇄ /v1/rider/stream', d: 'Rider sends <code>{lat, lng, ts}</code> every few seconds; the server pushes offers with an expiry.' },
    { m: 'POST', p: '/v1/offers/{id}/accept', d: 'Conditional: succeeds only if the offer is still open and the order unassigned. A late accept gets "offer expired".' },
    { m: 'SSE', p: '/v1/orders/{id}/track', d: 'Rider position and refreshed ETA for the eater, pushed only while someone is watching.' }
  ],
  dataModel: [
    { name: 'orders', store: 'Postgres (sharded by city)', fields: [['order_id', 'uuid', 'pk'], ['restaurant_id, zone_id', 'bigint', 'idx'], ['status', 'PLACED|ACCEPTED|OFFERED|ASSIGNED|PICKED_UP|DELIVERED|CANCELLED'], ['food_ready_at', 'timestamptz (predicted)'], ['rider_id', 'bigint', 'fk'], ['promised_eta, version', 'timestamptz, int']], note: 'Transitions are conditional updates, so an order can never get two riders.' },
    { name: 'rider_state', store: 'Redis / in-memory geo index', fields: [['rider_id', 'bigint', 'pk'], ['cell', 'H3 res 8–9', 'idx'], ['status', 'idle|to_pickup|waiting|delivering'], ['orders', 'list (stack)'], ['lat, lng, updated_at', 'float, ts']], note: 'Ephemeral. Rebuilt from the next round of pings.' },
    { name: 'offers', store: 'Postgres', fields: [['offer_id', 'uuid', 'pk'], ['round_id, zone_id', 'bigint', 'idx'], ['rider_id', 'bigint', 'idx'], ['order_ids', 'uuid[]'], ['expires_at, status', 'ts, enum']], note: 'One offer may carry a stacked pair of orders.' },
    { name: 'order_events', store: 'Kafka → data lake', fields: [['order_id', 'key', 'pk'], ['type', 'placed|accepted|ready|picked|delivered'], ['ts', 'timestamp']], note: 'The labels for prep-time and ETA models.' }
  ],

  architecture: {
    title: 'Food delivery architecture',
    nodes: [
      { id: 'cust', label: 'Customer app', sub: 'order · track', kind: 'client', wide: [90, 0], tall: [70, 0], tip: 'Places orders and watches the rider on a map. Tracking is pushed only while the screen is open.' },
      { id: 'rest', label: 'Restaurant app', sub: 'accept · mark ready', kind: 'client', wide: [90, 165], tall: [210, 0], tip: 'The kitchen tablet: accept or reject, set a prep estimate, mark food ready.' },
      { id: 'rider', label: 'Rider app', sub: 'pings · offers', kind: 'client', wide: [90, 330], tall: [350, 0], tip: 'Streams GPS every few seconds over an open socket and receives offers with a countdown.' },
      { id: 'gw', label: 'Gateway', sub: 'REST + WebSocket', kind: 'edge', wide: [290, 165], tall: [210, 105], tip: 'Terminates long-lived sockets for riders and tracking screens; routes REST calls.' },
      { id: 'ord', label: 'Order service', sub: 'order state machine', kind: 'service', wide: [490, 0], tall: [70, 210], tip: 'Owns the order lifecycle across all three parties. Every transition is a conditional update.' },
      { id: 'odb', label: 'Orders DB', sub: 'Postgres · by city', kind: 'store', wide: [690, 0], tall: [70, 315], tip: 'Durable order and offer state.' },
      { id: 'mer', label: 'Restaurant svc', sub: 'accept · prep time', kind: 'service', wide: [490, 110], tall: [210, 210], tip: 'Talks to the kitchen tablet, tracks load and passes prep estimates to dispatch.' },
      { id: 'disp', label: 'Dispatch', sub: 'batched assignment', kind: 'compute', wide: [690, 110], tall: [210, 315], tip: 'Every few seconds per zone: gather open orders and nearby riders, build a cost matrix, solve, send offers.' },
      { id: 'eta', label: 'ETA + prep ML', sub: 'ready time · travel', kind: 'ml', wide: [900, 110], tall: [210, 420], tip: 'Predicts food-ready time per order and travel times per rider-restaurant-customer leg.' },
      { id: 'loc', label: 'Location svc', sub: 'pings → cells', kind: 'service', wide: [490, 220], tall: [350, 210], tip: 'Stateless. Converts pings to cells, updates the geo index, forwards to tracking and Kafka.' },
      { id: 'geo', label: 'Rider geo index', sub: 'Redis / H3 cells', kind: 'cache', wide: [690, 220], tall: [350, 315], tip: 'Idle and busy riders by cell, in memory. Dispatch reads candidates from here.' },
      { id: 'kfk', label: 'Kafka', sub: 'events → model training', kind: 'queue', wide: [490, 330], tall: [350, 105], tip: 'Order timestamps and rider pings feed the prep and ETA models offline.' }
    ],
    edges: [
      { from: 'cust', to: 'gw', bidi: true },
      { from: 'rest', to: 'gw', bidi: true },
      { from: 'rider', to: 'gw', bidi: true },
      { from: 'gw', to: 'ord' },
      { from: 'gw', to: 'mer', bidi: true },
      { from: 'gw', to: 'loc', bidi: true },
      { from: 'ord', to: 'odb' },
      { from: 'ord', to: 'mer' },
      { from: 'ord', to: 'disp' },
      { from: 'mer', to: 'disp' },
      { from: 'disp', to: 'geo' },
      { from: 'disp', to: 'eta' },
      { from: 'loc', to: 'geo' },
      { from: 'loc', to: 'kfk' }
    ]
  },

  scenarios: [
    {
      id: 'order', title: 'Order → kitchen → rider at food-ready', tone: 'ok',
      steps: [
        { text: 'The eater orders a biryani. The order is stored as <code>PLACED</code> with an idempotency key and a <b>promised ETA</b> (prep + travel predictions).', flow: ['cust>gw', 'gw>ord', 'ord>odb'], badges: { cust: 'ETA 32 min' } },
        { text: 'The kitchen tablet rings. The restaurant accepts and says 15 min; the <b>prep model</b> adjusts it using this kitchen\'s history and current load.', flow: ['ord>mer', 'mer>gw', 'gw>rest', 'rest>gw', 'gw>mer'], badges: { mer: 'ready ≈ 17 min' } },
        { text: 'Dispatch does <b>not</b> grab a rider now. The order joins the zone\'s pool and is scheduled so the rider arrives near food-ready time.', flow: [['ord>disp', 'mer>disp']], badges: { disp: 'hold 8 min' } },
        { text: 'In a later round, dispatch reads idle riders near the restaurant and asks the ML service for first-mile and last-mile times, then <b>solves the whole zone at once</b>.', flow: [['disp>geo', 'disp>eta']], badges: { disp: '42 orders × 57 riders' } },
        { text: 'The chosen rider gets an offer over the open socket and accepts. The order becomes <code>ASSIGNED</code> with a conditional update.', flow: ['disp>ord', 'ord>gw', 'gw>rider', 'rider>gw', 'gw>ord', 'ord>odb'], badges: { rider: ['accepted', 'ok'] }, tone: 'ok' },
        { text: 'Rider pings flow into the geo index and Kafka, and the eater\'s map is pushed the new position and a refreshed ETA.', flow: ['rider>gw', 'gw>loc', ['loc>geo', 'loc>kfk'], 'loc>gw', 'gw>cust'], ok: ['cust'], badges: { cust: ['4 min away', 'ok'] } }
      ]
    },
    {
      id: 'stack', title: 'Stacking two orders on one trip', tone: 'info',
      steps: [
        { text: 'Two orders arrive 3 min apart from neighbouring restaurants, going to the same neighbourhood.', flow: [['cust>gw', 'cust>gw'], 'gw>ord', 'ord>disp'], badges: { disp: 'A + B' } },
        { text: 'The solver prices both options: <b>two riders</b>, or <b>one rider</b> on route R1 → R2 → A → B. Stacking makes B about 6 min later but frees a rider for ~25 min (illustrative).', flow: [['disp>eta', 'disp>geo']], badges: { eta: 'B +6 min' } },
        { text: 'Constraints decide: B must still beat its promise, and food may not sit in the bag beyond a limit. Both hold, so the stack wins.', nodes: ['disp'], ok: ['disp'], badges: { disp: ['stack OK', 'ok'] } },
        { text: 'One offer with two pickups goes to one rider. Swiggy exposes batching to eaters as an opt-in "Ecosaver" delivery mode.', flow: ['disp>ord', 'ord>gw', 'gw>rider'], badges: { rider: '2 pickups' }, tone: 'ok' }
      ]
    },
    {
      id: 'decline', title: 'Rider declines or goes silent', tone: 'warn',
      steps: [
        { text: 'The offer goes out with a 30 s countdown.', flow: ['disp>ord', 'ord>gw', 'gw>rider'], badges: { rider: 'offer ⏱ 30 s' } },
        { text: 'No answer. The offer expires and the order returns to the pool. A late "accept" fails the conditional check.', nodes: ['rider', 'disp'], warn: ['rider'], badges: { rider: ['expired', 'warn'] }, tone: 'warn' },
        { text: 'The next round includes the order with a <b>higher urgency weight</b> (it has already lost time) and excludes that rider for this order.', flow: ['disp>geo', 'disp>eta'], badges: { disp: 'urgent ↑' } },
        { text: 'A different rider accepts. The eater\'s ETA is adjusted honestly instead of silently slipping.', flow: ['disp>ord', 'ord>gw', 'gw>rider', 'rider>gw', 'gw>ord'], ok: ['ord'], badges: { cust: '+3 min' }, tone: 'ok' }
      ]
    },
    {
      id: 'rain', title: 'Rain: demand up, riders slower', tone: 'warn',
      steps: [
        { text: 'It starts to rain. Orders in the zone roughly double while riders slow down and some log off.', flow: [['cust>gw', 'cust>gw', 'cust>gw'], 'gw>ord'], warn: ['disp'], badges: { disp: ['orders 2×', 'warn'] }, tone: 'warn' },
        { text: 'The ETA model sees slower live speeds and <b>raises promises</b>; the restaurant list <b>shrinks its radius</b> so far-away kitchens drop out.', nodes: ['eta', 'mer'], badges: { eta: 'travel +30%' } },
        { text: 'Dispatch stacks more aggressively and the bigger matrices take longer to solve. Each zone has a <b>time budget</b> and falls back to greedy if the solver overruns.', nodes: ['disp', 'geo'], warn: ['disp'], badges: { disp: 'budget 1 s' } },
        { text: 'Rider pings keep flowing; Kafka records the episode so tomorrow\'s rain model is better.', flow: ['rider>gw', 'gw>loc', 'loc>kfk'], ok: ['kfk'] }
      ]
    },
    {
      id: 'late', title: 'Kitchen runs late: rider stuck at the counter', tone: 'err',
      steps: [
        { text: 'The prep model said 12 min. A big party order hits the kitchen and the food is not ready.', nodes: ['mer', 'rest'], err: ['rest'], badges: { rest: ['backed up', 'err'] }, tone: 'err' },
        { text: 'The rider arrives on time and waits. Dispatch sees it from the pings: inside the restaurant <b>geofence</b>, order not marked ready.', flow: ['rider>gw', 'gw>loc', 'loc>geo'], warn: ['rider'], badges: { rider: ['waiting 9 min', 'warn'] } },
        { text: 'Options: keep waiting, or <b>release the rider</b> to another order and re-plan this one for the new ready time. The eater gets an updated ETA.', flow: ['disp>geo', 'disp>ord', 'ord>gw', 'gw>cust'], badges: { cust: '+10 min' } },
        { text: 'The actual ready time goes to Kafka. The prep model learns this kitchen\'s bias under load, so the next estimate is better.', flow: ['rest>gw', 'gw>mer', 'mer>disp'], ok: ['eta'], badges: { eta: ['bias updated', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a dispatch decision that real platforms have written about. The numbers are illustrative; watch which way the meters move.',
    diagram: null,
    controls: [
      { id: 'assign', label: 'Assignment', type: 'seg', value: 'batch', options: [
        { v: 'greedy', l: 'Greedy: nearest rider on arrival' }, { v: 'batch', l: 'Batched optimisation' }] },
      { id: 'stack', label: 'Order stacking', type: 'seg', value: 'on', options: [
        { v: 'off', l: 'One order per trip' }, { v: 'on', l: 'Stack when it fits' }] },
      { id: 'timing', label: 'When to assign', type: 'seg', value: 'ready', options: [
        { v: 'early', l: 'Immediately' }, { v: 'ready', l: 'Just in time for food-ready' }] },
      { id: 'eta', label: 'Prep / ETA model', type: 'seg', value: 'ml', options: [
        { v: 'static', l: 'Static averages' }, { v: 'ml', l: 'ML per order' }] },
      { id: 'win', label: 'Round interval', type: 'range', min: 2, max: 60, step: 1, value: 10, unit: 's' }
    ],
    evaluate(s) {
      const batch = s.assign === 'batch', stack = s.stack === 'on', jit = s.timing === 'ready', ml = s.eta === 'ml';
      const winMin = batch ? s.win / 60 : 0;
      const riderWait = jit ? (ml ? 2 : 4.5) : (ml ? 6 : 8);           // minutes at the counter (illustrative)
      const foodWait = jit ? (ml ? 1 : 3.5) : 0.5;                      // minutes food sits waiting for a rider
      const door = 31 + (batch ? -2 : 0) + winMin + (stack ? 1.5 : 0) + foodWait * 0.8 + (ml ? 0 : 1);
      const oph = 1.6 + (batch ? 0.15 : 0) + (stack ? 0.5 : 0) + (jit ? 0.3 : 0) + (ml ? 0.1 : 0);
      const metrics = [
        { k: 'Avg order-to-door', v: '≈ ' + door.toFixed(1) + ' min', s: Math.max(0.05, Math.min(1, (40 - door) / 12)) },
        { k: 'Rider wait at restaurant', v: '≈ ' + riderWait + ' min / order', s: 1 - riderWait / 9 },
        { k: 'Food waiting for rider', v: '≈ ' + foodWait + ' min', s: 1 - foodWait / 4.5 },
        { k: 'Orders per rider-hour', v: '≈ ' + oph.toFixed(2), s: Math.min(1, (oph - 1.4) / 1.4) },
        { k: 'ETA promise error', v: ml ? '± ~3 min' : '± ~7 min', s: ml ? 0.85 : 0.3 },
        { k: 'Decision delay', v: batch ? 'up to ' + s.win + ' s + solve' : 'instant', s: batch ? Math.max(0.1, 1 - s.win / 60) : 0.95 },
        { k: 'Solver complexity', v: batch ? (stack ? 'MIP per zone (routes + stacks)' : 'assignment per zone (Hungarian)') : 'argmin per order', s: batch ? (stack ? 0.4 : 0.6) : 0.9 }
      ];
      const notes = [];
      if (!batch) notes.push('Greedy gives each order the nearest free rider the moment it arrives. It can send a rider past a closer order that arrives two seconds later, and it ignores when the food will be ready.');
      if (batch) notes.push('Batched: every ' + s.win + ' s per zone, build an orders × riders cost matrix and solve it. DoorDash moved this to a MIP with a commercial solver (2020) and pairs it with ML predictions (DeepRed, 2021).');
      if (batch && s.win > 30) notes.push('A ' + s.win + ' s round means some orders wait half a minute for any decision, and rider positions in the matrix are already stale.');
      if (stack) notes.push('Stacking raises rider throughput at the cost of a few minutes for the second order. Constrain it: the promise must still hold and food must not sit too long in the bag.');
      if (jit && !ml) notes.push('Just-in-time assignment is only as good as the prep prediction. With static averages, riders arrive late for fast kitchens and food goes cold.');
      if (!jit) notes.push('Assigning immediately means riders arrive long before the food and wait. Swiggy\'s decomposition shows assignment and first mile run <i>in parallel</i> with prep, so there is time to wait.');
      if (ml) notes.push('Prep-time models use kitchen history, items and current load (Zomato and DoorDash both describe this).');
      let verdict;
      if (!batch && !jit && !ml) verdict = '⚠ <b>Classic v1:</b> fast decisions, but riders idle at counters and ETAs drift. Fine for a small city, wasteful at scale.';
      else if (batch && s.win > 30) verdict = '⚠ <b>Round interval too long.</b> Orders wait for a decision and positions go stale. Keep rounds to a few seconds per zone.';
      else if (jit && !ml) verdict = '⚠ <b>JIT without good predictions</b> makes the food wait. Invest in the prep model first.';
      else if (batch && stack && jit && ml) verdict = '✅ <b>Close to what DoorDash describes:</b> ML predicts ready and travel times, an optimiser assigns and stacks every few seconds per zone.';
      else if (!batch) verdict = '👍 <b>Greedy is instant and simple</b>, but myopic: about 2 min slower to the door and fewer orders per rider-hour than batching, because it never trades one order\'s rider for a better global match.';
      else if (!jit) verdict = '👍 <b>Riders are never late to the counter</b>, but they idle there ≈ ' + riderWait + ' min per order instead of delivering. Assign just in time once prep predictions are good.';
      else if (!stack) verdict = '👍 <b>Fastest per order</b>, but each rider carries one bag: about 0.5 fewer orders per rider-hour. Stack at peak, under a lateness cap.';
      else verdict = '👍 Workable. Check rider wait vs food wait: that is the core trade-off.';
      const labels = {
        disp: { label: 'Dispatch', sub: batch ? 'solve every ' + s.win + ' s' : 'nearest rider now' },
        eta: { label: ml ? 'ETA + prep ML' : 'ETA tables', sub: ml ? 'per-order prediction' : 'historical averages' }
      };
      const flow = ['cust>gw', 'gw>ord', 'ord>disp'].concat(batch ? ['disp>geo', 'disp>eta'] : ['disp>geo']).concat(stack ? ['disp>stk'] : []).concat(['disp>ord', 'ord>gw', 'gw>rider']);
      return {
        metrics, verdict, notes, labels, flow,
        hide: stack ? [] : ['stk'],
        hot: stack ? ['stk'] : [],
        warn: (batch && s.win > 30 ? ['disp'] : []).concat(jit && !ml ? ['eta'] : []),
        badges: { rider: [jit ? 'wait ' + riderWait + ' min' : 'idle ' + riderWait + ' min', riderWait > 5 ? 'warn' : 'info'], disp: [batch ? 'round ' + s.win + ' s' : 'greedy', 'info'] }
      };
    }
  },

  widget: {
    title: 'Greedy vs batched assignment (Hungarian)',
    caption: 'Five orders, seven riders on a city grid. Each order has a <b>prep time left</b>. Cost per pair = <b>max(first mile, prep left) + last mile</b>. Compare <b>greedy</b> (each order takes the nearest free rider, in arrival order) with the <b>Hungarian</b> optimum for the whole batch. Turn on <b>rider-wait penalty</b> to see just-in-time assignment.'
  },

  realWorld: {
    intro: 'Swiggy, Zomato and DoorDash have each published how they think about the clock: prep time, assignment and travel.',
    timeline: [
      { when: 'c. 2019', who: 'Swiggy', title: 'The delivery-time equation', text: 'Swiggy\'s engineering blog breaks delivery time into <b>max(assignment delay + first mile, prep time) + last mile</b>: rider assignment and the trip to the restaurant run in parallel with cooking. Last-mile time is estimated partly from live travel data of riders on active orders.', src: 0 },
      { when: 'c. 2019', who: 'Swiggy', title: 'What drives each leg', text: 'A follow-up post says assignment delay depends mostly on how many delivery partners are free nearby, and first-mile time on the partner\'s location, traffic and familiarity with the restaurant.', src: 1 },
      { when: 'Feb 2020', who: 'Zomato', title: 'Predicting food preparation time', text: 'Zomato describes a food-preparation-time model using item-level and restaurant-level features, with a learned embedding per restaurant. Better prep predictions improve delivery estimates and <b>rider allocation</b>.', src: 2 },
      { when: 'Feb 2020', who: 'DoorDash', title: 'Dispatch as a MIP with a commercial solver', text: 'DoorDash reformulated Dasher dispatch as a <b>mixed-integer program</b> and licensed Gurobi, which its benchmarks found about <b>34× faster than CBC</b> on average and up to <b>10× faster than the Hungarian algorithm</b> on the matching problem.', src: 3 },
      { when: '2020', who: 'Research', title: 'Batching and matching on road networks', text: 'An academic paper splits the problem into <b>batching</b> (which orders can share a vehicle) and <b>assignment</b> (which batch goes to which vehicle), and stresses that each round must finish faster than new orders arrive.', src: 5 },
      { when: 'Aug 2021', who: 'DoorDash', title: 'DeepRed: ML + optimisation', text: 'DeepRed, at the centre of DoorDash\'s logistics platform, uses <b>ML layers</b> for per-order estimates (ready time, travel time, offer acceptance) and an <b>optimisation layer</b> for marketplace-wide decisions, including whether to dispatch now or wait.', src: 4 },
      { when: 'Jul 2025', who: 'Swiggy', title: 'Batching as a product: Ecosaver', text: 'Swiggy\'s Q1 FY26 shareholder letter lists <b>"Ecosaver"</b> mode: batching of orders on an <b>opt-in</b> basis. Swiggy has not published how its batching algorithm works, so the mechanics on this page follow DoorDash and the academic literature.', src: 6 }
    ],
    lessons: [
      'Treat dispatch as <b>prediction + optimisation</b>: ML for ready and travel times, a solver for the decision.',
      'The nearest rider is not the best rider. <b>Arrive when the food is ready.</b>',
      'Solve in <b>batches per zone</b> every few seconds, with a time budget and a greedy fallback.',
      'Every delivered order is a <b>training label</b>; feed actual ready and travel times back.'
    ],
    sources: [
      { title: 'The Swiggy Delivery Challenge (Part One)', url: 'https://bytes.swiggy.com/the-swiggy-delivery-challenge-part-one-6a2abb4f82f6', pub: 'Swiggy Bytes' },
      { title: 'How ML Powers — When is my order coming? — Part II', url: 'https://bytes.swiggy.com/how-ml-powers-when-is-my-order-coming-part-ii-eae83575e3a9', pub: 'Swiggy Bytes' },
      { title: 'The Deep Tech Behind Estimating Food Preparation Time', url: 'https://medium.com/zomato-technology/the-deep-tech-behind-estimating-food-preparation-time-e5068807acb0', pub: 'Zomato Technology, 2020' },
      { title: 'Next-Generation Optimization for Dasher Dispatch at DoorDash', url: 'https://careersatdoordash.com/blog/next-generation-optimization-for-dasher-dispatch-at-doordash/', pub: 'DoorDash Engineering, Feb 2020' },
      { title: 'Using ML and Optimization to Solve DoorDash\'s Dispatch Problem', url: 'https://careersatdoordash.com/blog/using-ml-and-optimization-to-solve-doordashs-dispatch-problem/', pub: 'DoorDash Engineering, Aug 2021' },
      { title: 'Batching and Matching for Food Delivery in Dynamic Road Networks', url: 'https://arxiv.org/pdf/2008.12905', pub: 'arXiv, 2020' },
      { title: 'Swiggy Q1 FY2026 Shareholder Letter', url: 'https://www.swiggy.com/corporate/wp-content/uploads/2025/07/Q1-FY2026-Shareholder-letter.pdf', pub: 'Swiggy, Jul 2025' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Assignment', '<b>Greedy</b> on arrival: instant, simple', '<b>Batched</b> per zone: better global outcome', 'Greedy in sparse markets; batch where many orders and riders overlap'],
      ['Timing', '<b>Assign immediately</b>: no risk of a late rider', '<b>Just in time</b> for food-ready: less rider idle', 'JIT once prep predictions are good enough'],
      ['Stacking', '<b>One order per trip</b>: fastest per order', '<b>Stack</b>: more orders per rider-hour', 'Stack at peak or for low-value orders, under a lateness cap'],
      ['Solver', '<b>Hungarian</b>: exact 1:1 matching, O(n³)', '<b>MIP</b>: stacks, routes, side constraints', 'Hungarian for pure matching; MIP once stacking and constraints matter'],
      ['Rider locations', '<b>Redis / in-memory H3</b>: high write rate', '<b>PostGIS</b>: SQL, simple ops', 'PostGIS for one city; in-memory beyond tens of thousands of riders'],
      ['ETA model', '<b>Static averages</b>: easy, explainable', '<b>ML per order</b>: accurate, needs data and MLOps', 'ML as soon as you have a few months of timestamps']
    ]
  },
  failures: [
    { f: 'Kitchen late, rider idle at counter', detect: 'Rider inside restaurant geofence while order not ready', fix: 'Release and re-plan, update the eater\'s ETA, feed actual ready time to the prep model.' },
    { f: 'Rider declines or ignores offers', detect: 'Offer expiries per order', fix: 'Re-offer next round with higher urgency; exclude that rider; adjust incentives.' },
    { f: 'Same order offered to two riders', detect: 'Two accepts for one order', fix: 'Conditional update on order status and rider status; only one accept can win.' },
    { f: 'Solver overruns its round', detect: 'Round duration > interval', fix: 'Partition by zone, cap matrix size, time-box the solver, fall back to greedy.' },
    { f: 'Rider app offline mid-delivery', detect: 'Missed pings for N intervals', fix: 'Mark location stale on the map, contact the rider, reassign if not yet picked up.' },
    { f: 'ETAs drift in rain or traffic', detect: 'Promise-miss rate per zone', fix: 'Live speed features, wider promises, smaller serviceable radius, more stacking.' },
    { f: 'Tracking fan-out overload', detect: 'Gateway CPU and socket counts', fix: 'Push only to active watchers, throttle updates, interpolate on the client.' }
  ],

  interview: [
    { q: 'How is food delivery dispatch different from ride-hailing?', a: '<ul><li><b>Pickup has a deadline you do not control</b>: the kitchen. A rider who arrives early wastes time; late means cold food.</li><li><b>Three parties</b> (eater, restaurant, rider), not two.</li><li><b>Stacking</b>: one rider can carry several orders; a car rarely carries several riders.</li><li>There is time to wait: assignment can run in parallel with cooking.</li></ul>', lvl: 'core' },
    { q: 'Break down the delivery time.', a: '<p><code>delivery = max(assignment delay + first mile, prep time) + last mile</code> (Swiggy\'s framing).</p><p>Assignment and the ride to the restaurant overlap with cooking. If prep dominates, a faster assignment buys nothing; you should instead pick a rider who arrives right at ready time and keep closer riders free.</p>', lvl: 'core' },
    { q: 'Why not assign the nearest free rider immediately?', a: '<p>Two reasons. First, it is <b>myopic</b>: the nearest rider for this order may be the only good rider for an order that arrives two seconds later. Second, it ignores <b>prep time</b>: the rider waits at the counter for 10 minutes.</p><p>Batching orders over a short window and solving them together, timed against predicted ready times, beats greedy on both.</p>', lvl: 'core' },
    { q: 'How does batched assignment work?', a: '<ul><li>Every few seconds, per zone, collect unassigned orders and candidate riders (from the geo index, within a radius).</li><li>Build a cost matrix: predicted delivery time, lateness vs promise, rider idle time.</li><li>Solve min-cost assignment: Hungarian for 1:1, a MIP when stacking and constraints matter.</li><li>Send offers, re-solve next round with whatever is left.</li></ul>', fu: 'How do you keep it fast? (Partition by zone, prune candidate pairs, time-box, greedy fallback.)', lvl: 'core' },
    { q: 'When should two orders be stacked on one rider?', a: '<p>When the combined route still meets both promises, food holding time stays under a limit, and the rider-time saved is worth the extra minutes for the second order.</p><p>Typical candidates: same or nearby restaurants, similar ready times, drops in the same direction. Swiggy productised it as an opt-in "Ecosaver" mode, so the eater agrees to the extra minutes.</p>', lvl: 'deep' },
    { q: 'How do you predict food preparation time?', a: '<p>Features: restaurant identity (an embedding), items and quantities, time of day, current kitchen load (open orders), the restaurant\'s own estimate, and historical bias. Labels come from "food ready" events or rider arrival-to-pickup times.</p><p>Labels are noisy (restaurants mark ready late), so measure with downstream outcomes like rider wait too.</p>', lvl: 'deep' },
    { q: 'How do you build live tracking at scale?', a: '<p>Riders stream pings over WebSocket every few seconds. The location service updates the geo index and publishes to the order\'s channel. Only eaters with the screen open hold a socket or SSE stream. The client <b>interpolates</b> between pings so the icon moves smoothly.</p><p>Tracking is lossy by design: dropping a ping is fine; order state is not.</p>', lvl: 'core' },
    { q: 'A rider declines. What happens?', a: '<p>The offer expires or is declined, the soft hold is released, and the order returns to the pool with a higher urgency weight. The next round excludes that rider for this order. Accepts are conditional updates, so a late accept on an expired offer fails cleanly.</p>', lvl: 'core' },
    { q: 'How do you handle a rainstorm?', a: '<ul><li>ETA model sees slower live speeds, so promises rise honestly.</li><li><b>Serviceability</b> shrinks: far restaurants disappear from the list.</li><li>More stacking, surge fees and rider incentives.</li><li>Dispatch keeps its time budget per zone; if the solver is slow, fall back to greedy.</li></ul>', lvl: 'deep' },
    { q: 'How do you keep order state consistent across three apps?', a: '<p>One order service owns a <b>state machine</b>. Every transition (accept, assign, pick up, deliver) is a conditional update on the current status and version, emitted as an event through an outbox. Apps retry with idempotency keys and read state back rather than trusting their local view.</p>', lvl: 'core' },
    { q: 'Why not broadcast each order to every nearby rider and let the first accept win?', a: '<p>Broadcast is simple and fills orders fast, but the <b>fastest tapper</b> wins, not the best-placed rider. Riders get spammed with offers they lose, and the platform cannot plan stacks or just-in-time arrivals.</p><p>A <b>targeted offer</b> from the solver, with a short expiry and a fallback to the next-best rider, keeps the global plan. Broadcast is a reasonable fallback for orders that have already been declined several times.</p>', lvl: 'core' },
    { q: 'How do you test a new dispatch algorithm safely?', a: '<p>Offline: replay historical days in a <b>simulator</b>. Online: experiments. Per-order A/B tests are biased because both arms share the same riders, so dispatch teams often use <b>switchback</b> tests that flip a whole zone between algorithms in time slices. DoorDash describes relying on simulation and experimentation for DeepRed.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Python: one assignment round with the Hungarian algorithm', lang: 'python',
      code: `import numpy as np
from scipy.optimize import linear_sum_assignment

BIG = 1e6

def plan_round(orders, riders, travel_min, now_min, wait_weight=0.5, max_first_mile=20):
    """orders: {id, restaurant, drop, ready_at}; riders: {id, pos}. Times in minutes."""
    cost = np.full((len(orders), len(riders)), BIG)
    for i, o in enumerate(orders):
        prep_left = max(0.0, o["ready_at"] - now_min)
        last_mile = travel_min(o["restaurant"], o["drop"])
        for j, r in enumerate(riders):
            first_mile = travel_min(r["pos"], o["restaurant"])
            if first_mile > max_first_mile:
                continue                                    # forbidden pair
            rider_wait = max(0.0, prep_left - first_mile)   # idle at the counter
            door = max(first_mile, prep_left) + last_mile   # Swiggy-style decomposition
            cost[i, j] = door + wait_weight * rider_wait
    rows, cols = linear_sum_assignment(cost)                # rectangular matrices are fine
    return [(orders[i]["id"], riders[j]["id"], round(float(cost[i, j]), 1))
            for i, j in zip(rows, cols) if cost[i, j] < BIG]`,
      note: '<code>wait_weight</code> is the just-in-time knob: higher values keep riders free until they are needed. Orders whose best rider would wait a long time can simply be deferred to a later round.'
    },
    {
      title: 'Spring Boot: per-zone round with race-free offers', lang: 'java',
      code: `@Component
public class AssignmentRound {
  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;
  private final CostModel cost;     // calls the ETA / prep ML service
  private final Solver solver;      // Hungarian or MIP wrapper -> int[][] {orderIdx, riderIdx}

  AssignmentRound(JdbcTemplate jdbc, TransactionTemplate tx, CostModel cost, Solver solver) {
    this.jdbc = jdbc; this.tx = tx; this.cost = cost; this.solver = solver;
  }

  @Scheduled(fixedDelayString = "\${dispatch.round-ms:5000}")
  public void run() {
    for (long zone : jdbc.queryForList("SELECT id FROM zones WHERE active", Long.class))
      tx.executeWithoutResult(s -> runZone(zone));
  }

  void runZone(long zone) {
    Boolean mine = jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(?)", Boolean.class, zone);
    if (!Boolean.TRUE.equals(mine)) return;                 // another node owns this zone now
    List<Order> orders = jdbc.query(Order.OPEN_IN_ZONE, Order.MAPPER, zone);
    List<Rider> riders = jdbc.query(Rider.IDLE_NEAR_ZONE, Rider.MAPPER, zone);
    if (orders.isEmpty() || riders.isEmpty()) return;
    double[][] c = cost.matrix(orders, riders);
    for (int[] p : solver.minCostAssignment(c)) {
      Order o = orders.get(p[0]); Rider r = riders.get(p[1]);
      int rider = jdbc.update("UPDATE riders SET status = 'OFFERED' WHERE id = ? AND status = 'IDLE'", r.id());
      int order = jdbc.update("""
          UPDATE orders SET status = 'OFFERED', rider_id = ?, version = version + 1
           WHERE id = ? AND status = 'ACCEPTED' AND rider_id IS NULL""", r.id(), o.id());
      if (rider == 1 && order == 1)                         // offer is sent by the outbox relay
        jdbc.update("INSERT INTO outbox(aggregate_id, type, payload) VALUES (?, 'OfferCreated', ?::jsonb)",
            o.id(), "{\\"rider\\":" + r.id() + "}");
      else throw new IllegalStateException("lost race; retry next round");   // rolls back the zone
    }
  }
}`,
      note: 'One transaction per zone. The advisory lock means two dispatch nodes never solve the same zone at once; the conditional updates still guard against any other writer. <code>Order</code>, <code>Rider</code>, <code>CostModel</code> and <code>Solver</code> are your own types.'
    },
    {
      title: 'PostGIS: idle riders near a restaurant (city scale)', lang: 'sql',
      code: `CREATE TABLE riders (
  id         bigint PRIMARY KEY,
  status     text   NOT NULL,                  -- IDLE | OFFERED | BUSY
  geog       geography(Point, 4326) NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX riders_geog ON riders USING gist (geog);

-- 20 closest idle riders within 3 km of the restaurant, fresh pings only
SELECT id, ST_Distance(geog, :rest) AS metres
  FROM riders
 WHERE status = 'IDLE'
   AND updated_at > now() - interval '30 seconds'
   AND ST_DWithin(geog, :rest, 3000)
 ORDER BY geog <-> :rest
 LIMIT 20;`,
      note: '<code>:rest</code> is <code>ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography</code>. Straight-line distance is only a pre-filter; rank with road travel times from the ETA service. Beyond one city, move live locations to an in-memory index (see Ride-Sharing).'
    }
  ],

  related: ['ride-sharing', 'proximity-service', 'ecommerce-orders', 'notifications', 'message-queue', 'payment-gateway']
});

/* knobs diagram = architecture + an optional stacking planner */
(function () {
  const d = SD.data;
  const a = d.architecture;
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes.concat([{ id: 'stk', label: 'Stacking planner', sub: 'pairs orders · routes', kind: 'compute', wide: [900, 220], tall: [70, 420], tip: 'Generates candidate stacked routes (two pickups, two drops) that the solver can choose instead of single orders.' }]),
    edges: a.edges.concat([{ from: 'disp', to: 'stk' }])
  };
})();
