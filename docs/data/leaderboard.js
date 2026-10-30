SD.register({
  slug: 'leaderboard',
  domain: 2,
  title: 'Live Leaderboard',
  examples: 'Gaming, Peloton',
  tagline: 'Update a score and answer <b>"what rank am I?"</b> for any of tens of millions of players in about a millisecond. The trick is a data structure that keeps <b>order and counts</b> at the same time.',
  tldr: {
    problem: 'A SQL <code>ORDER BY score</code> is fine for the top 100, but "what is player #50,000,000\'s rank?" means counting every row above them, and scores change constantly.',
    idea: 'Keep each board in a <b>Redis sorted set</b>: a <b>skip list</b> whose forward pointers store <b>spans</b> (how many nodes they jump), plus a hash of member → score. Insert, update and rank are all <b>O(log N)</b>.',
    insight: 'Rank = sum of the spans you cross on the way down. Sharding a board is the hard part: one sorted set lives on one Redis shard, so huge boards are split <b>by score range</b> and global rank becomes "players in higher shards + local rank".',
    numbers: [
      { v: 'O(log N)', l: 'ZADD and ZREVRANK cost; ZRANGE is O(log N + M) for M results (redis.io)' },
      { v: '2 structures', l: 'per sorted set: skip list (order, rank) + hash table (member → score)' },
      { v: '27,556', l: 'riders in one Peloton class, ranked live (2023, AWS blog)' }
    ]
  },

  requirements: {
    functional: [
      'Submit a score or add points after a match / workout',
      'Top N (top 10, top 100)',
      'My rank and score',
      'Players around me (± k ranks)',
      'Friends leaderboard',
      'Daily / weekly / all-time boards that reset on schedule'
    ],
    nonFunctional: [
      'Rank read p99 ≲ 10 ms (<em>estimate</em> target)',
      'Peak score updates in the 100K/s range (<em>estimate</em>)',
      'Live boards fresh within ~1 s',
      'Deterministic tie-breaking',
      'Rebuildable after a cache loss (scores are durable elsewhere)',
      'Server-authoritative scores (no client-submitted totals)'
    ],
    outOfScope: ['Matchmaking / skill rating (Elo, TrueSkill)', 'Anti-cheat ML', 'Rewards and payouts']
  },

  calculator: {
    inputs: [
      { id: 'n', label: 'Players on the largest board', min: 100000, max: 1000000000, value: 50000000, log: true },
      { id: 'u', label: 'Score updates per player per day', min: 1, max: 500, value: 20, log: true },
      { id: 'peak', label: 'Peak-to-average ratio', min: 1, max: 10, step: 0.5, value: 4, unit: '×' },
      { id: 'boards', label: 'Boards each update touches (global, weekly, daily, region…)', min: 1, max: 10, value: 3 },
      { id: 'bytes', label: 'Bytes per ZSET entry incl. overhead', min: 40, max: 300, step: 10, value: 110, fmt: 'bytes' }
    ],
    outputs: [
      { label: 'Score events / s (average)', f: (v) => v.n * v.u / 86400 },
      { label: 'Score events / s (peak)', f: (v) => v.n * v.u / 86400 * v.peak },
      { label: 'Redis writes / s at peak (all boards)', f: (v) => v.n * v.u / 86400 * v.peak * v.boards },
      { label: 'Memory for one board', fmt: 'bytes', f: (v) => v.n * v.bytes },
      { label: 'Memory, all boards × replica', fmt: 'bytes', f: (v) => v.n * v.bytes * v.boards * 2 },
      { label: 'Skip-list steps per rank lookup (≈ log₂ N)', f: (v) => Math.round(Math.log2(v.n)) }
    ],
    note: 'All inputs are <em>estimates</em>; bytes per entry depends on member length and Redis version (small sets use a compact encoding). Memory is rarely the problem: even 50M players fit in a few GB. The real limit is that <b>one sorted set lives on one shard</b>, so its write rate is bounded by one Redis node.'
  },

  api: [
    { m: 'POST', p: '/v1/boards/{id}/scores', d: '<code>{player_id, points, match_id}</code> from a <b>game server</b>, not the client. <code>match_id</code> makes it idempotent.' },
    { m: 'GET', p: '/v1/boards/{id}/top?n=100', d: '<code>ZREVRANGE 0 99 WITHSCORES</code> plus names from a profile hash. Cache for ~1 s; every viewer gets the same answer.' },
    { m: 'GET', p: '/v1/boards/{id}/players/{pid}', d: 'Rank and score: <code>ZREVRANK</code> + <code>ZSCORE</code>. Rank is 0-based in Redis; add 1.' },
    { m: 'GET', p: '/v1/boards/{id}/players/{pid}/around?k=5', d: 'Find my rank r, then <code>ZREVRANGE r-5 r+5</code>.' },
    { m: 'GET', p: '/v1/boards/{id}/friends/{pid}', d: '<code>ZMSCORE</code> for ~200 friend ids, sort in the service. No extra sorted set per user.' },
    { m: 'WS', p: '/v1/boards/{id}/live', d: 'Pushes top-10 diffs about once a second, plus "you moved to #482".' }
  ],
  dataModel: [
    { name: 'lb:{board}:{period}', store: 'Redis sorted set', fields: [['member', 'player_id', 'pk'], ['score', 'float64 (points + tie-break)', 'idx']], note: 'e.g. <code>lb:global</code>, <code>lb:weekly:2026-W44</code> with EXPIRE.' },
    { name: 'player:{id}', store: 'Redis hash', fields: [['player_id', 'bigint', 'pk'], ['name, avatar, country', 'strings']], note: 'Keeps the sorted set lean; fetched for the rows actually shown.' },
    { name: 'score_events', store: 'Kafka → Postgres', fields: [['event_id / match_id', 'uuid', 'pk'], ['player_id', 'bigint', 'idx'], ['board_id', 'text'], ['points', 'int'], ['created_at', 'timestamptz']], note: 'Source of truth. A lost Redis is rebuilt by replaying these.' },
    { name: 'board_snapshots', store: 'Postgres', fields: [['(board, period)', 'text', 'pk'], ['rank', 'int', 'sk'], ['player_id', 'bigint'], ['score', 'bigint']], note: 'Frozen final standings for history and rewards.' }
  ],

  architecture: {
    title: 'Live leaderboard architecture',
    nodes: [
      { id: 'game', label: 'Game servers', sub: 'match results', kind: 'client', wide: [90, 110], tall: [105, 0], tip: 'Authoritative source of scores. Clients never submit their own totals.' },
      { id: 'app', label: 'Player app', sub: 'views boards', kind: 'client', wide: [90, 330], tall: [315, 0], tip: 'Reads top N, my rank, around me and friends; subscribes to live updates.' },
      { id: 'ingest', label: 'Score ingest', sub: 'validate · dedup', kind: 'service', wide: [280, 110], tall: [105, 105], tip: 'Checks signatures and plausibility, dedups on match_id, then publishes an event.' },
      { id: 'gw', label: 'API gateway', sub: 'REST + WebSocket', kind: 'edge', wide: [280, 330], tall: [315, 105], tip: 'Terminates HTTP and WebSocket connections from players.' },
      { id: 'kfk', label: 'Kafka', sub: 'score events', kind: 'queue', wide: [480, 110], tall: [70, 215], tip: 'Durable log of every score event, keyed by board. The source of truth for rebuilds.' },
      { id: 'upd', label: 'Score updater', sub: 'batch → ZINCRBY', kind: 'compute', wide: [690, 110], tall: [70, 325], tip: 'Consumes events, aggregates over a short window, pipelines ZINCRBY/ZADD to every board the event touches.' },
      { id: 'zset', label: 'Redis ZSETs', sub: 'skip list + hash', kind: 'cache', wide: [890, 220], tall: [210, 325], tip: 'One sorted set per board and period. Primary + replica per shard.' },
      { id: 'rank', label: 'Rank API', sub: 'top · me · around', kind: 'service', wide: [480, 330], tall: [350, 215], tip: 'ZREVRANGE for top N, ZREVRANK for my rank, plus profile hydration. Caches top N for ~1 s.' },
      { id: 'friends', label: 'Social graph', sub: 'friend ids', kind: 'store', wide: [690, 440], tall: [350, 325], tip: 'Friend lists. The friends board is computed on read with ZMSCORE over the friend ids.' },
      { id: 'ws', label: 'Live pusher', sub: 'top-10 diffs / 1 s', kind: 'service', wide: [480, 440], tall: [210, 215], tip: 'Reads the top of each hot board once a second and pushes only what changed to subscribed sockets.' },
      { id: 'snap', label: 'Snapshot / reset', sub: 'end of period', kind: 'compute', wide: [890, 0], tall: [210, 435], tip: 'At period end, copies final standings to Postgres. New periods simply use a new key; old keys expire.' },
      { id: 'pg', label: 'Postgres', sub: 'history · rewards', kind: 'store', wide: [690, 0], tall: [70, 435], tip: 'Durable snapshots of final standings, used for rewards and history pages.' }
    ],
    edges: [
      { from: 'game', to: 'ingest' },
      { from: 'ingest', to: 'kfk' },
      { from: 'kfk', to: 'upd' },
      { from: 'upd', to: 'zset' },
      { from: 'app', to: 'gw', bidi: true },
      { from: 'gw', to: 'rank' },
      { from: 'rank', to: 'zset' },
      { from: 'rank', to: 'friends' },
      { from: 'zset', to: 'ws' },
      { from: 'ws', to: 'gw' },
      { from: 'zset', to: 'snap' },
      { from: 'snap', to: 'pg' }
    ]
  },

  scenarios: [
    {
      id: 'update', title: 'Score update → ZINCRBY', tone: 'ok',
      steps: [
        { text: 'A match ends. The <b>game server</b> (not the client) reports <code>{player, +120, match_id}</code>.', flow: ['game>ingest'] },
        { text: 'Ingest validates it and drops duplicates by <code>match_id</code>, then appends the event to <b>Kafka</b>, keyed by board.', flow: ['ingest>kfk'], badges: { kfk: 'offset 9,204,551' } },
        { text: 'The updater pipelines <code>ZINCRBY lb:global 120 p42</code> and the same for the weekly board. Each is <b>O(log N)</b>: walk down the skip list and splice the node.', flow: ['kfk>upd', 'upd>zset'], badges: { zset: 'O(log N)' } },
        { text: 'The new rank exists immediately; nothing is recomputed for the other 50M players. The Kafka log stays the durable record.', nodes: ['zset', 'kfk'], ok: ['zset'], tone: 'ok' }
      ]
    },
    {
      id: 'rank', title: 'My rank and players around me', tone: 'info',
      steps: [
        { text: 'A player opens the board. The app asks for <b>my rank</b> and the five players above and below.', flow: ['app>gw', 'gw>rank'] },
        { text: '<code>ZREVRANK lb:global p42</code> walks down the skip list and <b>adds up the spans</b> it crosses: rank in O(log N) without counting rows.', flow: ['rank>zset'], badges: { zset: 'rank 1,204,377' } },
        { text: 'Then <code>ZREVRANGE lb:global r-5 r+5 WITHSCORES</code> returns the neighbourhood. Names come from <code>player:{id}</code> hashes.', flow: ['rank>zset'], badges: { rank: '11 rows' } },
        { text: 'Friends view: fetch ~200 friend ids, <code>ZMSCORE</code> them in one call, sort in the service. No per-user sorted set to keep in sync.', flow: ['rank>friends', 'rank>zset', 'rank>gw', 'gw>app'], tone: 'ok' }
      ]
    },
    {
      id: 'live', title: 'Live top-10 broadcast', tone: 'info',
      steps: [
        { text: 'A live event: tens of thousands of participants update every few seconds and <b>everyone watches the same top 10</b>.', flow: ['game>ingest', 'ingest>kfk', 'kfk>upd', 'upd>zset'], warn: ['zset'] },
        { text: 'The pusher reads <code>ZREVRANGE 0 9</code> <b>once per second per board</b>, not once per viewer, and diffs it with the previous second.', flow: ['zset>ws'], badges: { ws: '1 read/s' } },
        { text: 'Only the diff goes out over the sockets. Each viewer also gets their own rank, computed on change, not on every frame.', flow: ['ws>gw', 'gw>app'], badges: { app: '#3 ↑2' }, tone: 'ok' },
        { text: 'If writes outpace one shard, the updater <b>coalesces</b> a player\'s updates within the batch window: 10 increments become one ZINCRBY of the sum.', nodes: ['upd'], labels: { upd: { sub: 'coalesce 250 ms' } }, ok: ['upd'] }
      ]
    },
    {
      id: 'scale', title: '500M players: shard by score range', tone: 'warn',
      steps: [
        { text: 'One sorted set lives on <b>one</b> Redis shard, and Redis executes commands on one thread. At hundreds of thousands of writes/s on one key, that shard is the ceiling.', flow: ['upd>zset'], warn: ['zset'], badges: { zset: ['hot key', 'warn'] }, tone: 'warn' },
        { text: 'Split the board <b>by score range</b>: <code>lb:s0</code> = 1M+, <code>lb:s1</code> = 100K–1M, <code>lb:s2</code> = below 100K. A player moves shards only when crossing a boundary.', nodes: ['zset'], labels: { zset: { label: 'ZSET range shards', sub: 's0 · s1 · s2' } } },
        { text: 'Global rank = <code>ZCARD</code> of every higher shard (O(1) each) + <code>ZREVRANK</code> inside your own shard.', flow: ['rank>zset'], labels: { zset: { label: 'ZSET range shards', sub: 'Σ ZCARD + local rank' } }, badges: { rank: '3 calls' } },
        { text: 'Top N only ever touches the highest shard. Hashing players across shards instead would spread writes evenly but make <b>every</b> rank query a scatter-gather.', flow: ['rank>zset', 'rank>gw', 'gw>app'], labels: { zset: { label: 'ZSET range shards', sub: 'top N = s0 only' } }, ok: ['zset'], tone: 'ok' }
      ]
    },
    {
      id: 'failover', title: 'Redis primary dies', tone: 'err',
      steps: [
        { text: 'The primary for <code>lb:global</code> crashes. Replication is <b>asynchronous</b>, so the replica is missing the last few hundred milliseconds of updates.', nodes: ['zset'], err: ['zset'], badges: { zset: ['primary down', 'err'] }, tone: 'err' },
        { text: 'The replica is promoted. Reads continue at once; ranks may be very slightly behind.', nodes: ['zset', 'rank'], warn: ['zset'], badges: { zset: ['replica promoted', 'warn'] }, tone: 'warn' },
        { text: 'The updater rewinds its Kafka offset a little and <b>replays</b>. Replays must be idempotent: dedup on event id, or write absolute totals with <code>ZADD</code> instead of increments.', flow: ['kfk>upd', 'upd>zset'], badges: { upd: 'replay from offset' } },
        { text: 'If everything is lost, rebuild the board from the event log or the last snapshot. The sorted set is a <b>cache of a computation</b>, not the source of truth.', flow: ['zset>snap', 'snap>pg'], ok: ['zset'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real design choice. Numbers are illustrative and assume ~0.002 score events per player per second at peak.',
    controls: [
      { id: 'n', label: 'Players on the board', type: 'seg', value: '10m', options: [
        { v: '1m', l: '1 M' }, { v: '10m', l: '10 M' }, { v: '100m', l: '100 M' }] },
      { id: 'mode', label: 'Rank precision', type: 'seg', value: 'exact', options: [
        { v: 'exact', l: 'Exact (sorted set)' }, { v: 'approx', l: 'Approximate (histogram + exact top 10K)' }] },
      { id: 'win', label: 'Write-behind batch window', type: 'range', min: 0, max: 2000, step: 50, value: 100, unit: 'ms', kind: 'num', fmt: (v) => v === 0 ? 'off (write-through)' : v + ' ms' },
      { id: 'scope', label: 'Board type', type: 'seg', value: 'global', options: [
        { v: 'global', l: 'Global all-time' }, { v: 'weekly', l: '+ Weekly (time-windowed)' }, { v: 'friends', l: '+ Friends' }] },
      { id: 'ties', label: 'Tie-breaking', type: 'seg', value: 'member', options: [
        { v: 'member', l: 'Redis default (by member id)' }, { v: 'time', l: 'First to reach wins' }, { v: 'dense', l: 'Shared rank' }] }
    ],
    evaluate(s) {
      const N = { '1m': 1e6, '10m': 1e7, '100m': 1e8 }[s.n];
      const events = N * 0.002;
      const boards = s.scope === 'weekly' ? 2 : 1;
      const writes = events * boards;
      const batch = s.win === 0 ? 1 : Math.max(1, writes * (s.win / 1000) / 32); // 32 updater partitions
      const roundTrips = writes / batch;
      const shardCap = 150e3; // illustrative per-shard ops/s ceiling for one key
      const pressure = writes / shardCap;
      const exactMem = N * 110 * boards;
      const mem = s.mode === 'exact' ? exactMem : (1e4 * 110 + 1e4 * 16) * boards;
      const metrics = [
        { k: 'Rank read latency', v: s.mode === 'exact' ? '≈ 1 ms (O(log N) ≈ ' + Math.round(Math.log2(N)) + ' steps)' : '≈ 1 ms (prefix sum over buckets)', s: 0.9 },
        { k: 'Memory (all boards)', v: SD.fmt.bytes(mem), s: mem < 2e9 ? 0.9 : mem < 2e10 ? 0.65 : 0.35 },
        { k: 'Redis round-trips/s', v: SD.fmt.num(roundTrips) + ' (' + SD.fmt.num(writes) + ' updates)', s: roundTrips < 2e4 ? 0.9 : roundTrips < 1e5 ? 0.6 : 0.3 },
        { k: 'Score freshness', v: s.win === 0 ? 'immediate' : '≤ ' + s.win + ' ms behind', s: s.win <= 250 ? 0.9 : s.win <= 1000 ? 0.65 : 0.4 },
        { k: 'Rank accuracy', v: s.mode === 'exact' ? 'exact for everyone' : 'exact top 10K; others ± bucket width', s: s.mode === 'exact' ? 0.95 : 0.6 },
        { k: 'Hot-key pressure', v: Math.round(pressure * 100) + '% of one shard', s: pressure < 0.5 ? 0.9 : pressure < 1 ? 0.55 : 0.15 },
        { k: 'Tie fairness', v: { member: 'ties ordered by member id (arbitrary)', time: 'earliest to reach wins', dense: 'equal scores share a rank' }[s.ties], s: s.ties === 'member' ? 0.35 : 0.9 }
      ];
      const notes = [];
      if (s.mode === 'approx') notes.push('Approximate: keep a count per score bucket (e.g. 10K buckets) and an exact sorted set for the top 10K only. Rank = players in higher buckets + an estimate inside your bucket. Players outside the top rarely care about rank #1,204,377 vs #1,204,401.');
      if (s.scope === 'weekly') notes.push('Time-windowed boards: write to <code>lb:weekly:2026-W44</code> as well, with <code>EXPIRE</code> a few weeks out. "Reset" is just a new key, so there is no big delete at midnight.');
      if (s.scope === 'friends') notes.push('Friends board on read: <code>ZMSCORE lb:global f1 f2 … f200</code> then sort 200 numbers. Cheaper than maintaining a sorted set per user.');
      if (s.ties === 'member') notes.push('Redis orders equal scores <b>lexicographically by member</b>, and ZREVRANGE / ZREVRANK reverse that too. Deterministic but arbitrary: with the same points, "zoe" ranks above "aaron".');
      if (s.ties === 'time') notes.push('Encode <code>score = points × 2³² + (2³² − 1 − reached_at)</code>. A double is exact only up to 2⁵³, so points must stay below 2²¹ (~2M) with this layout.');
      if (s.ties === 'dense') notes.push('Shared rank = 1 + number of players with a strictly higher score = <code>ZCOUNT key (score +inf</code>, which is O(log N).');
      if (s.win === 0 && writes > 5e4) notes.push('Write-through at this rate sends one network round trip per update. Even a 50–100 ms window lets the updater pipeline thousands of commands per round trip.');
      if (pressure >= 1) notes.push('A single sorted set cannot absorb this write rate on one shard. Split the board <b>by score range</b> (see the scenario) or coalesce harder.');
      let verdict;
      if (pressure >= 1 && s.mode === 'exact') verdict = '❌ <b>One shard cannot take ' + SD.fmt.num(writes) + ' writes/s on one key.</b> Shard by score range, coalesce per player, or use approximate ranks below the top.';
      else if (s.mode === 'approx' && N <= 1e7) verdict = '⚠ <b>Approximation is unnecessary here.</b> An exact sorted set of ' + SD.fmt.num(N) + ' players is only ~' + SD.fmt.bytes(exactMem) + '.';
      else if (s.ties === 'member') verdict = '⚠ <b>Ties are broken by player id.</b> Players notice. Encode time into the score or show shared ranks.';
      else if (s.win > 1000) verdict = '⚠ <b>The board lags more than a second.</b> Fine for daily boards, not for a live race.';
      else if (s.mode === 'approx') verdict = '✅ <b>Good at very large scale:</b> exact where people look (the top), cheap estimates everywhere else.';
      else verdict = '✅ <b>Standard design:</b> Kafka for durability, a short write-behind window, and Redis sorted sets for O(log N) rank.';
      const labels = {
        zset: s.mode === 'exact' ? { label: 'Redis ZSETs', sub: boards > 1 ? 'global + weekly keys' : 'skip list + hash' } : { label: 'Histogram + ZSET', sub: 'buckets + exact top 10K' },
        upd: { label: 'Score updater', sub: s.win === 0 ? 'write-through' : 'batch ' + s.win + ' ms' }
      };
      const flow = ['game>ingest', 'ingest>kfk', 'kfk>upd', 'upd>zset', 'app>gw', 'gw>rank'].concat(s.scope === 'friends' ? ['rank>friends', 'rank>zset'] : ['rank>zset']);
      return {
        metrics, verdict, notes, labels, flow,
        hot: s.scope === 'friends' ? ['friends'] : [],
        warn: pressure >= 0.5 && pressure < 1 ? ['zset'] : [],
        err: pressure >= 1 && s.mode === 'exact' ? ['zset'] : [],
        badges: { zset: [SD.fmt.num(writes) + ' w/s', pressure >= 1 ? 'err' : pressure >= 0.5 ? 'warn' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Skip list with spans: insert and rank in O(log n)',
    caption: 'This is the structure inside a Redis sorted set, ordered high score → low. Each arrow stores a <b>span</b>: how many players it jumps. <b>Tap a player</b> to compute their rank by adding spans on the way down. Insert or bump a score to watch the search path and the new tower.'
  },

  realWorld: {
    intro: 'Most published leaderboards are Redis sorted sets with a durable log behind them. The interesting parts are the data structure and how teams handle peaks.',
    timeline: [
      { when: '1990 → Redis', who: 'Redis', title: 'Pugh\'s skip list, extended', text: 'Redis\'s sorted set code describes itself as almost a C translation of William Pugh\'s skip list paper, changed to allow <b>repeated scores</b>, to compare by <b>score and then member</b>, and to keep a backward pointer. Each forward pointer also stores a <b>span</b>, which is what makes <b>ZRANK O(log N)</b>.', src: 0 },
      { when: 'Redis docs', who: 'Redis', title: 'Leaderboard pattern', text: 'One sorted set per board, member = player id, score = points. <b>ZADD and ZREVRANK are O(log N)</b>, and ZRANGE is O(log N + M) for M returned members; names and avatars go in a companion hash so the set stays lean.', src: 1 },
      { when: '2018', who: 'Peloton', title: 'Real-time messaging for classes', text: 'Peloton described a publish/subscribe setup with <b>one channel per member</b>; the leaderboard team used it to connect members to friends taking the same class.', src: 2 },
      { when: '2024', who: 'AWS', title: 'Gaming leaderboard on ElastiCache', text: 'AWS\'s reference moves leaderboard storage and queries out of a relational database into <b>Redis sorted sets</b>, which keep members ordered as scores are inserted or updated.', src: 3 },
      { when: '2023–26', who: 'Peloton', title: 'Turkey Burn: the largest live class', text: 'For its biggest live events Peloton runs the leaderboard on <b>ElastiCache sorted sets</b> with replicas, plus MSK, SQS and OpenSearch, keeping <b>tens of thousands</b> of participants in sync with sub-second latency. The 2023 class had <b>27,556</b> simultaneous riders. Capacity is pre-warmed and tier-0 services are isolated.', src: 4 }
    ],
    lessons: [
      '<span>The sorted set is a <b>cache of a computation</b>; keep the event log durable and make replays idempotent.</span>',
      '<span>Read the top N <b>once per second per board</b> and push diffs, instead of once per viewer.</span>',
      '<span>Plan the <b>shard key</b> early: score ranges keep rank queries cheap; hashing spreads writes but makes rank a scatter-gather.</span>',
      '<span>For live events, <b>pre-warm and isolate</b> the leaderboard path from the rest of the platform.</span>'
    ],
    sources: [
      { title: 'redis/src/t_zset.c (Redis 6.2)', url: 'https://github.com/redis/redis/blob/6.2/src/t_zset.c', pub: 'Redis source' },
      { title: 'Redis leaderboard', url: 'https://redis.io/docs/latest/develop/use-cases/leaderboard/', pub: 'redis.io' },
      { title: 'Using Real-time Messaging at Peloton', url: 'https://medium.com/peloton-engineering/using-real-time-messaging-at-peloton-933e18867867', pub: 'Peloton Engineering, 2018' },
      { title: 'Building a real-time gaming leaderboard with Amazon ElastiCache for Redis', url: 'https://aws.amazon.com/blogs/database/building-a-real-time-gaming-leaderboard-with-amazon-elasticache-for-redis/', pub: 'AWS Database Blog (updated 2024)' },
      { title: 'How Peloton engineers the world\'s largest live fitness events on AWS', url: 'https://aws.amazon.com/blogs/industries/how-peloton-engineers-the-worlds-largest-live-fitness-events-on-aws/', pub: 'AWS for Industries, 2026' },
      { title: 'Player profiles to leaderboards: choosing the right AWS database, part 2', url: 'https://aws.amazon.com/blogs/gametech/player-profiles-to-leaderboards-choosing-the-right-aws-database-part-2/', pub: 'AWS for Games' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Rank store', '<b>Redis sorted set</b>: O(log N) rank, in memory', '<b>SQL + index</b>: <code>ORDER BY … LIMIT</code>, durable', 'SQL for top-N only or small boards; sorted sets when you need "my rank" for millions'],
      ['Precision', '<b>Exact</b> for all players', '<b>Approximate</b> below the top (histogram)', 'Approximate only when boards reach hundreds of millions or memory is tight'],
      ['Sharding', '<b>By score range</b>: cheap global rank', '<b>By player hash</b>: even writes', 'Score range when rank queries dominate; hash when writes dominate and top-K merge is enough'],
      ['Writes', '<b>Write-through</b> per event', '<b>Write-behind</b> batch / coalesce', 'Batch 50–250 ms once events exceed tens of thousands per second'],
      ['Periods', '<b>New key per period</b> + EXPIRE', '<b>Reset job</b> that deletes / zeroes', 'Always a new key: no midnight thundering delete, and the old board stays readable']
    ]
  },
  failures: [
    { f: 'Redis primary lost', detect: 'Sentinel / cluster failover events', fix: 'Promote replica; replay recent Kafka events idempotently; rebuild from the log if needed.' },
    { f: 'Hot key (one huge board)', detect: 'Per-shard CPU and command latency', fix: 'Coalesce per player in the batch window; shard by score range; cache top N for 1 s.' },
    { f: 'Duplicate score events', detect: 'Same match_id seen twice', fix: 'Dedup at ingest; prefer absolute <code>ZADD GT</code> over blind increments where possible.' },
    { f: 'Cheated scores', detect: 'Outliers vs. historical distribution', fix: 'Server-authoritative scoring, signed results, quarantine board for review.' },
    { f: 'Ties look unfair', detect: 'Support tickets, identical scores in top N', fix: 'Encode first-to-reach time into the score, or show shared ranks.' },
    { f: 'Period rollover spike', detect: 'Latency at midnight UTC', fix: 'New keys per period with EXPIRE instead of mass deletes; snapshot asynchronously.' }
  ],

  interview: [
    { q: 'Why not compute rank with SQL?', a: '<p><code>ORDER BY score DESC LIMIT 100</code> is cheap with an index. But "my rank" is <code>SELECT count(*) WHERE score &gt; mine</code>, which reads <b>every row above you</b>: O(rank). For player #50M that is 50M index entries per request, while scores change thousands of times a second.</p>', fu: 'Could RANK() OVER help? (It still has to sort or scan all rows up to you.)', lvl: 'core' },
    { q: 'How does a sorted set return a rank in O(log N)?', a: '<p>Each forward pointer in the skip list stores a <b>span</b>: how many level-0 nodes it skips. To rank a member, walk from the top level down, moving right while the next node is still before the target, and <b>add the spans you cross</b>. The sum when you land on the target is its rank.</p>', lvl: 'core' },
    { q: 'Why does Redis use a skip list rather than a balanced tree?', a: '<ul><li>Much <b>simpler</b> code to implement and debug; adding span counts for rank was a small patch.</li><li>Range scans (ZRANGE) walk level 0 like a linked list.</li><li>Expected O(log N) with tunable memory (the level probability).</li></ul><p>A B-tree shines on disk pages; for an in-memory structure the skip list is competitive and easier to augment.</p>', lvl: 'deep' },
    { q: 'Why does a sorted set also need a hash table?', a: '<p>The hash maps <b>member → score</b> in O(1), so <code>ZSCORE</code> is instant and an update can find the existing node (by score + member) without scanning. The skip list keeps the order. Each member is therefore referenced from both structures.</p>', lvl: 'core' },
    { q: 'What is the rank of player #50,000,000, and how fast?', a: '<p><code>ZREVRANK</code> on a 50M-member set is about log₂(50M) ≈ 26 levels of pointer chasing: microseconds inside Redis, ~1 ms with the network. Add 1 because Redis ranks are 0-based.</p>', lvl: 'core' },
    { q: 'How would you shard a leaderboard with 500M players?', a: '<p><b>By score range:</b> each shard holds a band of scores. Global rank = sum of <code>ZCARD</code> of higher shards + local <code>ZREVRANK</code>; top N reads only the top shard. Players move shards when they cross a boundary; pick boundaries from the score distribution and rebalance occasionally.</p><p><b>By hash:</b> even writes, but rank needs <code>ZCOUNT</code> on every shard and top N needs a k-way merge.</p>', lvl: 'deep' },
    { q: 'How do you break ties?', a: '<p>Redis orders equal scores by member, lexicographically (reversed in ZREVRANGE): deterministic, but arbitrary. Better: <b>first to reach wins</b>, by packing time into the score, e.g. <code>points × 2³² + (2³² − 1 − ts)</code>. Mind float64 precision (exact up to 2⁵³). Or show <b>shared ranks</b>: 1 + <code>ZCOUNT (score +inf</code>.</p>', lvl: 'core' },
    { q: 'How do daily and weekly resets work?', a: '<p>Do not delete anything at midnight. Write each event to <code>lb:daily:2026-10-30</code> and <code>lb:weekly:2026-W44</code> as well as the all-time key, with <code>EXPIRE</code> a few periods out. At period end a job snapshots the final top N to Postgres for rewards. Watch time zones: one global UTC reset, or per-region keys.</p>', lvl: 'core' },
    { q: 'How do you show "players around me"?', a: '<p><code>r = ZREVRANK key me</code>, then <code>ZREVRANGE key max(0, r−5) r+5 WITHSCORES</code>. Two O(log N + k) calls. Hydrate names from hashes with one pipelined <code>HMGET</code> batch.</p>', lvl: 'core' },
    { q: 'How would you build a friends leaderboard?', a: '<p>On read: get ~200 friend ids from the social graph, <code>ZMSCORE lb:global …ids</code> in one call, sort in the service. Do not maintain a sorted set per user: one score change would have to update every friend\'s set (fan-out on write).</p>', lvl: 'core' },
    { q: 'What if Redis loses data?', a: '<p>Treat Redis as a cache of the event log. Kafka (or a Postgres table) keeps every score event. After a failover, replay from a safe offset with idempotent writes; after total loss, rebuild from the log or the last snapshot. Replicas plus AOF reduce how often you need it.</p>', lvl: 'deep' },
    { q: 'When are approximate ranks acceptable?', a: '<p>For very large boards, nobody distinguishes #1,204,377 from #1,204,401. Keep a histogram of players per score bucket (prefix sums give rank) and an exact sorted set only for the top K. Memory and write load drop by orders of magnitude; error is bounded by bucket width.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot: Redis sorted-set leaderboard', lang: 'java',
      code: `@Service
public class LeaderboardService {
  private final StringRedisTemplate redis;
  private final ZSetOperations<String, String> z;

  public LeaderboardService(StringRedisTemplate redis) {
    this.redis = redis;
    this.z = redis.opsForZSet();
  }

  private static String weeklyKey() {
    LocalDate d = LocalDate.now(ZoneOffset.UTC);
    return "lb:weekly:" + d.get(IsoFields.WEEK_BASED_YEAR) + "-W"
        + d.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
  }

  public void addPoints(String player, double points) {
    String weekly = weeklyKey();
    redis.executePipelined((RedisCallback<Object>) conn -> {     // 1 round trip
      conn.zSetCommands().zIncrBy("lb:global".getBytes(), points, player.getBytes());
      conn.zSetCommands().zIncrBy(weekly.getBytes(), points, player.getBytes());
      conn.keyCommands().expire(weekly.getBytes(), Duration.ofDays(21).toSeconds());
      return null;
    });
  }

  public Long rank(String board, String player) {                // 1-based
    Long r = z.reverseRank(board, player);                       // ZREVRANK O(log N)
    return r == null ? null : r + 1;
  }

  public Set<ZSetOperations.TypedTuple<String>> top(String board, int n) {
    return z.reverseRangeWithScores(board, 0, n - 1);            // ZREVRANGE … WITHSCORES
  }

  public Set<ZSetOperations.TypedTuple<String>> around(String board, String player, int k) {
    Long r = z.reverseRank(board, player);
    if (r == null) return Set.of();
    return z.reverseRangeWithScores(board, Math.max(0, r - k), r + k);
  }
}`
    },
    {
      title: 'Postgres: why rank is expensive in SQL', lang: 'sql',
      code: `CREATE TABLE scores (
  player_id  bigint PRIMARY KEY,
  score      bigint NOT NULL,
  reached_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scores_rank_idx ON scores (score DESC, reached_at);

-- top 100: an index scan that stops early. Cheap.
SELECT player_id, score,
       RANK() OVER (ORDER BY score DESC) AS rnk
FROM   scores
ORDER  BY score DESC, reached_at
LIMIT  100;

-- one player's rank: counts every row above them. O(rank), not O(log n).
SELECT 1 + count(*) AS rank
FROM   scores s,
       (SELECT score, reached_at FROM scores WHERE player_id = :p) me
WHERE  s.score > me.score
   OR (s.score = me.score AND s.reached_at < me.reached_at);`,
      note: 'Fine for small boards and for durable snapshots. For "my rank" across millions of players, use a sorted set.'
    },
    {
      title: 'Python: tie-break encoding + score-range shards', lang: 'python',
      code: `import redis

r = redis.Redis(decode_responses=True)
T = 2**32                                    # seconds field, good until 2106

def composite(points: int, reached_at: int) -> int:
    """More points first; equal points -> earlier time first."""
    assert 0 <= points < 2**21               # 21 + 32 bits <= 53: exact in a double
    return points * T + (T - 1 - reached_at)

# score-range shards, highest band first
BANDS = [("lb:s0", 1_000_000), ("lb:s1", 100_000), ("lb:s2", 0)]

def shard_for(points: int) -> int:
    return next(i for i, (_, low) in enumerate(BANDS) if points >= low)

def global_rank(player: str, points: int) -> int:
    i = shard_for(points)
    higher = sum(r.zcard(key) for key, _ in BANDS[:i])        # O(1) each
    local = r.zrevrank(BANDS[i][0], player)                   # O(log n)
    return higher + local + 1`
    }
  ],

  related: ['top-k', 'distributed-cache', 'stream-analytics', 'multiplayer-game', 'message-queue']
});
