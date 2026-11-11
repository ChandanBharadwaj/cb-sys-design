SD.register({
  slug: 'multiplayer-game',
  domain: 2,
  title: 'Multiplayer Game Backend',
  examples: 'Valorant, Agones',
  tagline: 'Match ten players, start a server near them in seconds, simulate the world <b>128 times a second</b>, and make a shot that hit on your screen count on the server, even with 40 ms of ping.',
  tldr: {
    problem: 'Players are tens of milliseconds apart, packets get lost, some players cheat, and thousands of matches start and end every minute. Yet every player must see one shared world that feels instant.',
    idea: 'A <b>matchmaker</b> groups players by skill and ping, an <b>allocator</b> hands the match a ready <b>dedicated server</b> (an Agones-style fleet), and that server runs an <b>authoritative fixed tick loop</b> over UDP. Clients <b>predict</b> their own movement, <b>interpolate</b> other players a little in the past, and the server <b>rewinds</b> to check hits.',
    insight: 'Never trust the client: it sends <i>inputs</i>, not results. Latency is hidden, not removed, by prediction, interpolation and lag compensation. The tick rate sets how much buffering you need, which is why Riot chose 128 Hz for Valorant.',
    numbers: [
      { v: '128 Hz', l: 'Valorant server tick rate (Riot, 2020)' },
      { v: '≈ 7.8 ms', l: 'per-frame server budget at 128 Hz (Riot tech blog)' },
      { v: '100 ms', l: 'default entity interpolation delay in Source (Valve wiki)' }
    ]
  },

  intro: {
    what: 'A multiplayer game backend is everything behind the <b>Play</b> button of an online game. It finds fair opponents, starts a game server close to them, and runs the match so every player sees <b>the same world at the same moment</b>.',
    analogy: {
      icon: '⚽',
      title: 'A referee whose call is final',
      text: 'In a park football game, every player sees the ball from a different spot, so arguments start over whether a goal counted. A referee ends the arguments: they watch everything and their call is final. The game server is that referee for an online match. Unlike a real referee, it sees each player\'s view a little late, so it must judge each shot by what that player could see at the time.'
    },
    problem: 'Ten friends in different cities join the same shooting match. Every connection adds a delay, some packets get lost, and one player runs a cheat. Without one fair judge, two screens disagree about who fired first, and the cheater wins every argument. The system answers <b>"what really happened in this match?"</b> and makes the answer <b>feel instant</b> for everyone.',
    story: [
      {
        stage: 'naive',
        title: 'Each game reports where it is and what it hit',
        text: 'Each player\'s game sends <b>its own position and its own hits</b> to one central server. The server passes them on to everyone else. It is easy to build and works fine for two friends testing on the same network.',
        scene: {
          nodes: [
            { id: 'a', label: 'Player A', sub: '"I am here"', kind: 'client', at: [70, 0] },
            { id: 'b', label: 'Player B', sub: '"I hit A"', kind: 'client', at: [350, 0] },
            { id: 'srv', label: 'Central server', sub: 'passes it on', kind: 'service', at: [210, 110] }
          ],
          edges: [{ from: 'a', to: 'srv' }, { from: 'b', to: 'srv' }],
          flow: [['a>srv', 'b>srv'], ['srv>a', 'srv>b']]
        }
      },
      {
        stage: 'breaks',
        title: 'Cheaters lie and far-away players lag',
        text: 'A hacked game simply says "I teleported" or "headshot", and the server believes it. Players far from the one server wait a long round trip before anything moves. Every action waits for that trip, so the game feels sluggish, and one server for every match soon runs out of power.',
        scene: {
          nodes: [
            { id: 'a', label: 'Hacked client', sub: '"headshot!"', kind: 'client', at: [70, 0] },
            { id: 'b', label: 'Far player', sub: 'long round trip', kind: 'client', at: [350, 0] },
            { id: 'srv', label: 'Central server', sub: 'trusts clients', kind: 'service', at: [210, 110] }
          ],
          edges: [{ from: 'a', to: 'srv' }, { from: 'b', to: 'srv' }],
          flow: ['a>srv', 'srv>b'],
          err: ['a', 'srv'],
          warn: ['b'],
          badges: { srv: ['fooled', 'err'], b: ['laggy ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'One referee server per match, close to the players',
        text: 'A <b>matchmaker</b> groups players of similar skill who have a good connection to the same region. It hands the match a ready server nearby. Players send only their <b>inputs</b> (keys pressed, where they aim). The server simulates the world in small fixed steps and <b>decides every hit</b>. Each game still moves your own character at once, so it feels instant.',
        scene: {
          nodes: [
            { id: 'a', label: 'Player A', sub: 'sends inputs', kind: 'client', at: [70, 0] },
            { id: 'b', label: 'Player B', sub: 'sends inputs', kind: 'client', at: [350, 0] },
            { id: 'mm', label: 'Matchmaker', sub: 'skill + ping', kind: 'service', at: [70, 110] },
            { id: 'fleet', label: 'Ready servers', sub: 'nearby region', kind: 'compute', at: [70, 220] },
            { id: 'srv', label: 'Game server', sub: 'decides hits', kind: 'compute', at: [210, 110] }
          ],
          edges: [{ from: 'a', to: 'mm' }, { from: 'mm', to: 'fleet' }, { from: 'fleet', to: 'srv' }, { from: 'a', to: 'srv' }, { from: 'b', to: 'srv' }],
          flow: ['a>mm', 'mm>fleet', 'fleet>srv', ['a>srv', 'b>srv']],
          ok: ['srv'],
          badges: { srv: ['fair ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['Valorant', 'Counter-Strike', 'Overwatch', 'Fortnite', 'Agones (open-source game-server hosting)'],
    whenToUse: [
      'Many players share <b>one fast-changing world</b> in real time',
      'Fairness matters, as in ranked or competitive play where cheating must be blocked',
      'Matches are short and frequent, so servers start and stop all day'
    ],
    whenNot: [
      'Turn-based games like chess: an ordinary web API and database is enough',
      'People edit a shared thing and every change should be merged (see <a href="collab-editing.html">Collaborative Editing</a>)',
      'Two friends in a co-op or fighting game: peer-to-peer with rollback is cheaper'
    ],
    glossary: [
      { term: 'Matchmaking', def: 'Grouping waiting players into a match by skill rating, party and connection quality.' },
      { term: 'Dedicated server', def: 'A server process that runs one match and is not one of the players\' own machines.' },
      { term: 'Authoritative server', def: 'The server owns the true game state; players send inputs and the server decides the results.' },
      { term: 'Tick rate', def: 'How many times per second the server advances the game world, such as 64 or 128 times.' },
      { term: 'Client-side prediction', def: 'Your game applies your own input right away, then corrects itself if the server disagrees.' },
      { term: 'Interpolation', def: 'Drawing other players slightly in the past, smoothly between two received updates.' },
      { term: 'Lag compensation', def: 'The server rewinds other players to where the shooter saw them, to check if a shot hit.' },
      { term: 'UDP', def: 'A network protocol that sends packets without waiting for lost ones to be resent, so old data never blocks new data.' }
    ]
  },

  requirements: {
    functional: [
      'Matchmaking by skill, region ping and party',
      'Allocate a dedicated server per match',
      'Real-time state sync: movement, shots, abilities',
      'Hit registration that is fair across pings',
      'Reconnect to a match in progress',
      'Post-match results: rating, stats, rewards'
    ],
    nonFunctional: [
      'Ping ≤ ~35–50 ms for most players (regional servers)',
      'Tick 20–128 Hz; every frame fits in its budget',
      'Tolerate a few % packet loss (estimate)',
      'Server-authoritative: clients cannot set state',
      'Start thousands of servers in minutes at peak',
      'A crash ends at most one match'
    ],
    outOfScope: ['Voice chat', 'Store and payments', 'Kernel anti-cheat drivers', 'Replay storage']
  },

  calculator: {
    inputs: [
      { id: 'players', label: 'Concurrent players', min: 10000, max: 10000000, value: 1000000, log: true },
      { id: 'per', label: 'Players per match', min: 2, max: 100, value: 10 },
      { id: 'tick', label: 'Tick rate', min: 10, max: 128, value: 64, unit: 'Hz' },
      { id: 'bytes', label: 'Bytes per player per snapshot (delta-compressed)', min: 10, max: 300, step: 5, value: 40, fmt: 'bytes' },
      { id: 'mpc', label: 'Matches per vCPU', min: 0.5, max: 8, step: 0.5, value: 2 }
    ],
    outputs: [
      { label: 'Active matches', f: (v) => v.players / v.per },
      { label: 'Server frame budget', fmt: 'raw', f: (v) => (1000 / v.tick).toFixed(1) + ' ms' },
      { label: 'Downstream per player', fmt: 'bits', f: (v) => v.tick * v.per * v.bytes * 8 },
      { label: 'Total server egress', fmt: 'bits', f: (v) => v.players * v.tick * v.per * v.bytes * 8 },
      { label: 'Input packets/s into servers', f: (v) => v.players * v.tick },
      { label: 'vCPUs for game servers', f: (v) => Math.ceil(v.players / v.per / v.mpc) }
    ],
    note: 'Snapshot size and matches per vCPU are <em>estimates</em>. They depend on the game, on delta compression and on how much each server frame costs. Doubling the tick rate doubles packets, bandwidth and CPU, which is why Riot spent so much effort fitting a 128-tick frame into ~7.8 ms.'
  },

  api: [
    { m: 'POST', p: '/v1/matchmaking/tickets', d: 'Body <code>{party, mode, region_pings: {euw: 18, eune: 42}}</code>. Returns <code>ticket_id</code>. Rating is read on the server, never sent by the client.' },
    { m: 'WS', p: '/v1/matchmaking/tickets/{id}', d: 'Pushes queue status, then <code>{server: ip:port, token}</code> when a match is found.' },
    { m: 'RPC', p: 'Allocate(GameServerAllocation)', d: 'Matchmaker → allocator. Picks a <b>Ready</b> server with matching labels (region, build) and marks it <b>Allocated</b> atomically.' },
    { m: 'UDP', p: 'client → server: input', d: '<code>{seq, tick, buttons, aim}</code> every tick, with the last few inputs repeated to survive packet loss.' },
    { m: 'UDP', p: 'server → client: snapshot', d: '<code>{tick, last_seq_processed, entity deltas}</code>, delta-compressed against the last snapshot the client acked.' },
    { m: 'POST', p: '/v1/matches/{id}/result', d: 'Server → backend, signed. Scores and stats go into a queue that updates ratings, progress and leaderboards.' }
  ],
  dataModel: [
    { name: 'mm:{mode}:{region}', store: 'Redis sorted set', fields: [['member', 'ticket_id', 'pk'], ['score', 'rating', 'idx'], ['ticket:{id}', 'hash: party, pings, t0']], note: 'Range queries by rating; the window widens as tickets wait.' },
    { name: 'matches', store: 'Postgres', fields: [['match_id', 'uuid', 'pk'], ['server_id', 'text'], ['region', 'text', 'idx'], ['started_at', 'ts'], ['result', 'jsonb']] },
    { name: 'players', store: 'Postgres', fields: [['player_id', 'uuid', 'pk'], ['rating_mu', 'float'], ['rating_sigma', 'float'], ['level', 'int'], ['inventory', 'jsonb']], note: 'TrueSkill-style ratings keep a mean and an uncertainty.' },
    { name: 'history ring', store: 'Game-server memory', fields: [['tick', 'int', 'pk'], ['entity_id', 'int', 'pk'], ['pos, hitbox', 'vec3']], note: 'About 1 s of past positions for lag compensation (Source keeps 1 s by default).' }
  ],

  architecture: {
    title: 'Multiplayer game backend architecture',
    nodes: [
      { id: 'pl', label: 'Players', sub: 'client · predicts', kind: 'client', wide: [90, 110], tall: [210, 0], tip: 'Sends inputs, predicts its own movement, and draws other players slightly in the past.' },
      { id: 'api', label: 'Platform API', sub: 'auth · party · lobby', kind: 'edge', wide: [290, 0], tall: [350, 0], tip: 'Login, parties and lobby. Creates matchmaking tickets on the player\'s behalf.' },
      { id: 'mm', label: 'Matchmaker', sub: 'skill + ping buckets', kind: 'service', wide: [490, 0], tall: [350, 105], tip: 'Groups tickets with similar ratings and good ping to a common region, and widens the window as they wait.' },
      { id: 'q', label: 'Ticket queues', sub: 'Redis sorted sets', kind: 'cache', wide: [290, 110], tall: [210, 105], tip: 'One sorted set per mode and region, scored by rating.' },
      { id: 'prof', label: 'Profiles + rating', sub: 'Postgres', kind: 'store', wide: [690, 0], tall: [350, 420], tip: 'Rating (mean, uncertainty), level and inventory.' },
      { id: 'alloc', label: 'Allocator', sub: 'GameServerAllocation', kind: 'service', wide: [490, 110], tall: [210, 210], tip: 'Atomically moves one Ready server to Allocated, so two matches can never share a server.' },
      { id: 'fleet', label: 'Server fleet', sub: 'Ready buffer · k8s', kind: 'compute', wide: [690, 110], tall: [210, 315], tip: 'Pods with a game server already running and waiting. An autoscaler keeps a buffer of Ready servers.' },
      { id: 'gs', label: 'Game server', sub: 'authoritative tick loop', kind: 'compute', wide: [690, 220], tall: [70, 210], tip: 'Runs the simulation at a fixed tick, validates inputs, keeps a history ring for rewinds, and sends snapshots.' },
      { id: 'relay', label: 'Edge relay', sub: 'private backbone', kind: 'edge', wide: [290, 220], tall: [70, 105], tip: 'Gets player packets off the public internet early and onto a private network (Riot Direct is an example).' },
      { id: 'res', label: 'Results queue', sub: 'Kafka → rating, stats', kind: 'queue', wide: [890, 220], tall: [70, 420], tip: 'Match results are processed asynchronously: ratings, progress, anti-cheat signals.' },
      { id: 'lb', label: 'Leaderboard', sub: 'see Live Leaderboard', kind: 'cache', wide: [890, 330], tall: [210, 525], tip: 'Ranked standings, updated from the results stream.' }
    ],
    edges: [
      { from: 'pl', to: 'api', bidi: true },
      { from: 'api', to: 'mm', bidi: true },
      { from: 'mm', to: 'q', bidi: true },
      { from: 'mm', to: 'prof', label: 'rating' },
      { from: 'mm', to: 'alloc' },
      { from: 'alloc', to: 'fleet' },
      { from: 'fleet', to: 'gs' },
      { from: 'pl', to: 'relay', bidi: true, label: 'UDP' },
      { from: 'relay', to: 'gs', bidi: true },
      { from: 'gs', to: 'res' },
      { from: 'res', to: 'prof', bend: 0.15 },
      { from: 'res', to: 'lb' }
    ]
  },

  scenarios: [
    {
      id: 'match', title: 'Queue → match → server allocated', tone: 'info',
      steps: [
        { text: 'A party of two presses Play. The platform API creates a ticket with their <b>pings to each region</b>; the matchmaker reads their ratings from the profile store.', flow: ['pl>api', 'api>mm', 'mm>prof'], badges: { mm: 'ticket #7731' } },
        { text: 'The ticket goes into a sorted set for (ranked, EU) <b>scored by rating</b>.', flow: ['mm>q'], badges: { q: 'rating 1540' } },
        { text: 'The matchmaker pulls 10 tickets within a rating window that <b>widens the longer they wait</b>, and balances the two teams.', flow: ['q>mm'], badges: { mm: '10 players ✓' } },
        { text: 'It asks for a server in the region with the best ping for everyone. Allocation moves one <b>Ready</b> server to <b>Allocated</b> in one atomic step.', flow: ['mm>alloc', 'alloc>fleet', 'fleet>gs'], badges: { fleet: 'Ready → Allocated' } },
        { text: 'Players get <code>ip:port</code> plus a join token and connect over UDP through the nearest relay. Queue to first tick took seconds, not minutes.', flow: ['mm>api', 'api>pl', 'pl>relay', 'relay>gs'], ok: ['gs'], tone: 'ok' }
      ]
    },
    {
      id: 'tick', title: 'One tick: predict, simulate, reconcile', tone: 'ok',
      steps: [
        { text: 'Each tick the client sends its input <code>{seq 812, move, aim}</code> and <b>applies it locally at once</b>. This is client-side prediction, so your own movement has no lag.', flow: ['pl>relay', 'relay>gs'], badges: { pl: 'predict #812' } },
        { text: 'The server simulates the world in fixed steps (1/128 s in Valorant): it applies every player\'s inputs, then physics and game rules.', nodes: ['gs'], badges: { gs: 'tick 40211' } },
        { text: 'It sends a <b>snapshot</b>, delta-compressed, including the last input it processed for you (#812).', flow: ['gs>relay', 'relay>pl'], badges: { pl: 'ack #812' } },
        { text: '<b>Reconciliation</b>: the client resets to the server\'s state and re-applies its unacked inputs #813–815. If they agree, you see nothing; if not, it smooths the correction.', nodes: ['pl'], ok: ['pl'], badges: { pl: ['replay 3', 'ok'] }, tone: 'ok' },
        { text: 'Other players are drawn by <b>interpolating</b> between two snapshots, slightly in the past (Source\'s default is 100 ms), so they move smoothly even if a packet is lost.', nodes: ['pl'], badges: { pl: 'render −2 ticks' } }
      ]
    },
    {
      id: 'lagcomp', title: 'Lag compensation: was it a hit?', tone: 'warn',
      steps: [
        { text: 'You have 60 ms ping and fire at an enemy exactly where your screen shows them. Your screen is in the past: half your RTT plus the interpolation delay.', flow: ['pl>relay', 'relay>gs'], badges: { pl: 'fire @ tick T' } },
        { text: 'The server knows your latency and interpolation delay, so it <b>rewinds</b> the other players\' hitboxes to where you saw them, using its history ring.', nodes: ['gs'], warn: ['gs'], badges: { gs: ['rewind ~9 ticks', 'warn'] }, tone: 'warn' },
        { text: 'It ray-casts against the rewound hitboxes: <b>hit</b>. Then it restores the present and applies damage.', nodes: ['gs'], ok: ['gs'], badges: { gs: ['hit ✓', 'ok'] }, tone: 'ok' },
        { text: 'The cost: the target may already be behind cover on <i>their</i> screen and still take the hit ("shot around the corner"). Games cap how far back the server rewinds.', flow: ['gs>relay', 'relay>pl'], tone: 'warn' }
      ]
    },
    {
      id: 'cheat', title: 'Failure: a modified client cheats', tone: 'err',
      steps: [
        { text: 'A hacked client sends "I am 50 m away now" and "headshot on player 7".', flow: ['pl>relay', 'relay>gs'], err: ['pl'], badges: { pl: ['hacked', 'err'] }, tone: 'err' },
        { text: 'The server is <b>authoritative</b>: clients may only send inputs. Positions come from the server\'s own simulation, and shots are checked against its own (rewound) world.', nodes: ['gs'], ok: ['gs'], badges: { gs: ['rejected', 'ok'] } },
        { text: 'It also validates rates and limits: max speed, fire rate, line of sight. It sends each client only what it may see, which blunts wallhacks (Valorant calls this fog of war).', nodes: ['gs'], badges: { gs: 'speed ✗ · LOS ✗' }, tone: 'warn' },
        { text: 'Suspicious events go into the results stream for anti-cheat review and bans, away from the tick loop.', flow: ['gs>res'], badges: { res: 'flag player' }, tone: 'ok' }
      ]
    },
    {
      id: 'peak', title: 'Evening peak and a server crash', tone: 'warn',
      steps: [
        { text: 'At 8 pm tickets surge. Matches need servers faster than VMs can boot.', flow: [['pl>api', 'pl>api'], 'api>mm', 'mm>q'], warn: ['mm'], badges: { q: ['queue ↑', 'warn'] }, tone: 'warn' },
        { text: 'A fleet autoscaler keeps a <b>buffer of Ready servers</b> (say 10%). Allocation stays instant while the cluster autoscaler adds nodes behind it.', flow: ['mm>alloc', 'alloc>fleet'], ok: ['fleet'], badges: { fleet: ['buffer 10%', 'ok'] } },
        { text: 'One game server process crashes mid-round. Only <b>that match</b> is affected.', nodes: ['gs'], err: ['gs'], badges: { gs: ['crash', 'err'] }, tone: 'err' },
        { text: 'The match is recorded as no contest, so nobody loses rating. Players go back to the queue with priority. A new pod replaces the dead one.', flow: ['res>prof', 'fleet>gs'], ok: ['gs'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'A 10-player competitive shooter. Latency and bandwidth figures are rough, illustrative <em>estimates</em>.',
    controls: [
      { id: 'tick', label: 'Server tick rate', type: 'seg', value: '128', options: [
        { v: '20', l: '20 Hz' }, { v: '64', l: '64 Hz' }, { v: '128', l: '128 Hz' }] },
      { id: 'net', label: 'Netcode model', type: 'seg', value: 'auth', options: [
        { v: 'lockstep', l: 'Deterministic lockstep' }, { v: 'auth', l: 'Authoritative server' }, { v: 'rollback', l: 'Rollback (P2P)' }] },
      { id: 'mm', label: 'Matchmaking strictness', type: 'seg', value: 'balanced', options: [
        { v: 'strict', l: 'Strict rating window' }, { v: 'balanced', l: 'Widens with wait' }, { v: 'loose', l: 'First 10 players' }] },
      { id: 'region', label: 'Server placement', type: 'seg', value: 'edge', options: [
        { v: 'one', l: 'One global region' }, { v: 'regional', l: 'Regional DCs' }, { v: 'edge', l: 'Regional + private backbone' }] }
    ],
    evaluate(s) {
      const hz = +s.tick, tickMs = 1000 / hz;
      const ping = { one: 120, regional: 45, edge: 30 }[s.region];          // typical RTT, illustrative
      const interp = 2 * tickMs;                                            // two snapshots of buffer
      const bw = hz * 10 * 40 * 8;                                          // 10 players × 40 B per snapshot
      const peek = s.net === 'lockstep' ? ping + 2 * tickMs : ping + interp + tickMs; // rough peeker's advantage
      const cpu = hz / 64;
      const metrics = [
        { k: 'Server CPU per match', v: '≈ ' + cpu.toFixed(1) + '× a 64-tick server', s: cpu <= 0.5 ? 0.9 : cpu <= 1 ? 0.7 : 0.45, hint: tickMs.toFixed(1) + ' ms frame' },
        { k: 'Downstream per player', v: '≈ ' + Math.round((s.net === 'auth' ? bw : 2 * hz * 16 * 8) / 1000) + ' kbps', s: s.net !== 'auth' ? 0.9 : bw < 1e5 ? 0.85 : bw < 2.5e5 ? 0.65 : 0.45, hint: s.net === 'auth' ? 'snapshots' : 'inputs only' },
        { k: 'Typical ping', v: ping + ' ms', s: ping <= 35 ? 0.9 : ping <= 60 ? 0.7 : 0.2 },
        { k: 'Peeker\'s advantage (est.)', v: '≈ ' + Math.round(peek) + ' ms', s: peek < 60 ? 0.85 : peek < 100 ? 0.55 : 0.2 },
        { k: 'Cheat resistance', v: { lockstep: 'low: every client has full state', auth: 'high: server decides', rollback: 'medium: peers trust each other' }[s.net], s: { lockstep: 0.25, auth: 0.9, rollback: 0.45 }[s.net] },
        { k: 'Queue time', v: { strict: 'long (minutes off-peak)', balanced: 'short, then widens', loose: 'instant' }[s.mm], s: { strict: 0.35, balanced: 0.8, loose: 0.95 }[s.mm] },
        { k: 'Match fairness', v: { strict: 'very even', balanced: 'even most of the time', loose: 'frequent stomps' }[s.mm], s: { strict: 0.95, balanced: 0.8, loose: 0.25 }[s.mm] }
      ];
      const notes = [];
      if (s.tick === '128') notes.push('Riot picked 128 Hz to give defenders more time to react, and had to fit each server frame into ~7.8 ms to make it affordable.');
      if (s.tick === '20') notes.push('20 Hz is common for large battle royales and mobile games. Fine for 100 players, mushy for a 1v1 duel.');
      if (s.net === 'lockstep') notes.push('Lockstep sends only inputs, which is why RTS games with thousands of units use it. Every client must wait for the slowest player\'s input.');
      if (s.net === 'rollback') notes.push('Rollback predicts the remote player\'s input and re-simulates when the real one arrives. Ideal for 1v1 fighting games; costly with 10 players.');
      if (s.region === 'edge') notes.push('A private backbone (like Riot Direct) moves packets off the public internet near the player. Riot\'s 2020 goal was 35 ms ping for 70% of players.');
      if (s.region === 'one') notes.push('One region puts many players 100+ ms away. Lag compensation then rewinds far, and "shot behind cover" complaints rise.');
      let verdict;
      if (s.net === 'lockstep') verdict = '⚠ <b>Great for RTS, wrong for a shooter:</b> the slowest connection sets everyone\'s input delay, and full state on every client invites map hacks.';
      else if (s.net === 'rollback') verdict = '👍 <b>Right for 1v1 fighting games.</b> For a 10-player shooter, use an authoritative server.';
      else if (s.region === 'one') verdict = '❌ <b>Too far from players.</b> Put servers in each region before tuning anything else.';
      else if (s.mm === 'loose') verdict = '⚠ <b>Fast queues, unfair matches.</b> Widen the rating window gradually instead.';
      else if (s.tick === '128' && s.region === 'edge' && s.mm === 'balanced') verdict = '✅ <b>Valorant-style:</b> authoritative 128-tick servers, regional placement with a private backbone, and a window that widens with wait.';
      else if (s.mm === 'strict') verdict = '👍 <b>Fairest matches, slowest queues:</b> off-peak and at the rating extremes players wait minutes. Widen the window with wait time.';
      else if (s.tick === '20') verdict = '👍 <b>Cheapest servers:</b> about 1/6 the CPU and bandwidth of 128 Hz, but a ~100 ms interpolation buffer adds to peeker\'s advantage. Fine for big battle royales, mushy for duels.';
      else if (s.tick === '64') verdict = '👍 <b>The common middle ground:</b> half the CPU and bandwidth of 128 Hz, for a ~31 ms buffer instead of ~16 ms.';
      else if (s.region === 'regional') verdict = '👍 <b>Good placement:</b> ~45 ms typical ping. A private backbone trims the public-internet hops further (Riot aimed for 35 ms for 70% of players).';
      else verdict = '👍 <b>Solid.</b> Check the meters for what this tick rate and placement cost you.';
      return {
        metrics, verdict, notes,
        flow: s.net === 'auth' ? ['pl>relay', 'relay>gs', 'gs>relay', 'relay>pl'] : ['pl>relay', 'relay>pl'],
        labels: {
          gs: { label: s.net === 'auth' ? 'Game server' : 'Session host', sub: s.net === 'auth' ? 'authoritative · ' + hz + ' Hz' : s.net === 'lockstep' ? 'relays inputs only' : 'P2P sync, not authority' },
          relay: s.region === 'edge' ? { label: 'Edge relay', sub: 'private backbone' } : { label: 'Public internet', sub: s.region === 'one' ? 'one global region' : 'regional DCs' },
          mm: { label: 'Matchmaker', sub: { strict: 'tight rating window', balanced: 'window widens with wait', loose: 'first come, first served' }[s.mm] }
        },
        warn: (s.net === 'lockstep' || s.net === 'rollback' ? ['gs'] : []).concat(s.mm === 'loose' ? ['mm'] : []),
        err: s.region === 'one' ? ['relay'] : [],
        hot: s.tick === '128' && s.net === 'auth' ? ['gs'] : [],
        badges: { relay: [ping + ' ms RTT', ping <= 35 ? 'ok' : ping <= 60 ? 'info' : 'err'] }
      };
    }
  },

  widget: {
    title: 'Prediction, interpolation and lag compensation',
    caption: 'B strafes in and out of cover. The top lane is the <b>server\'s truth</b>; the bottom is <b>A\'s screen</b>, where B is shown in the past. Hold <b>◀ ▶</b> to move A, and press <b>Fire</b>: the shot reaches the server half an RTT later. Turn <b>lag compensation</b> off to see why shots "miss" that clearly hit.'
  },

  realWorld: {
    intro: 'The core techniques are 20 years old and well documented by Valve. What changed is the scale of fleets and how far studios go to cut latency.',
    timeline: [
      { when: '2004+', who: 'Valve', title: 'Source multiplayer networking', text: 'Source documents the model most shooters still use: an authoritative server, client prediction, and <b>entity interpolation</b> with a <b>100 ms default delay</b> (two snapshots buffered, so one lost packet does not stall the view).', src: 0 },
      { when: '2004+', who: 'Valve', title: 'Lag compensation', text: 'The server rewinds players to where the shooter saw them, accounting for latency and interpolation. By default only players are rewound, and up to one second of history is kept (<code>sv_maxunlag</code>).', src: 1 },
      { when: '2017', who: 'Blizzard', title: 'Overwatch gameplay architecture and netcode', text: 'Tim Ford\'s GDC talk explains how Overwatch\'s networked simulation works and how it uses <b>determinism</b> for responsiveness and precision, with client prediction corrected by the server.', src: 6 },
      { when: '2018', who: 'Google · Ubisoft', title: 'Agones', text: 'An open-source way to host and scale dedicated game servers on <b>Kubernetes</b>, using custom resources and a controller. A <code>GameServerAllocation</code> atomically picks a Ready server from a fleet.', src: 5 },
      { when: '2020', who: 'Riot Games', title: 'Peeking into Valorant\'s netcode', text: 'Riot explains that buffering smooths network jitter but acts as <b>extra latency</b>, and that buffering time depends directly on tick rate. Its developers put Valorant\'s peeker\'s advantage at roughly <b>40–70 ms</b>.', src: 2 },
      { when: '2020', who: 'Riot Games', title: '128-tick servers', text: 'Riot chose <b>128 Hz</b> to give defenders more time to react, which meant fitting each server frame into about <b>7.8 ms</b>. Running one game per full CPU core would have been too expensive.', src: 3 },
      { when: '2020', who: 'Riot Games', title: 'Riot Direct and ping targets', text: 'Riot said it aimed for <b>35 ms ping for 70% of players</b> at launch, using Riot Direct, its private network, plus data centres spread around the world.', src: 4 }
    ],
    lessons: [
      '<b>Authoritative servers</b>: clients send inputs, the server decides.',
      'Hide latency with <b>prediction, interpolation and rewind</b>, and be honest about the trade-offs.',
      'Latency is mostly <b>geography and routing</b>: regional servers and good networks beat clever code.',
      'Treat servers as <b>cattle</b>: a ready buffer, atomic allocation, one match per failure domain.'
    ],
    sources: [
      { title: 'Source Multiplayer Networking', url: 'https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking', pub: 'Valve Developer Community' },
      { title: 'Lag Compensation', url: 'https://developer.valvesoftware.com/wiki/Lag_Compensation', pub: 'Valve Developer Community' },
      { title: 'Peeking into VALORANT\'s Netcode', url: 'https://technology.riotgames.com/node/111', pub: 'Riot Games Technology, 2020' },
      { title: 'VALORANT\'s 128-Tick Servers', url: 'https://technology.riotgames.com/node/112', pub: 'Riot Games Technology, 2020' },
      { title: 'Riot is on a crusade to eradicate "peeker\'s advantage" in Valorant', url: 'https://www.pcgamer.com/valorant-peekers-advantage-interview', pub: 'PC Gamer, 2020' },
      { title: 'Introducing Agones: open-source, multiplayer, dedicated game-server hosting built on Kubernetes', url: 'https://cloud.google.com/blog/products/containers-kubernetes/introducing-agones-open-source-multiplayer-dedicated-game-server-hosting-built-on-kubernetes', pub: 'Google Cloud Blog, 2018' },
      { title: '\'Overwatch\' Gameplay Architecture and Netcode', url: 'https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and', pub: 'GDC 2017' },
      { title: 'On Peeker\'s Advantage & Ranked', url: 'https://playvalorant.com/en-gb/news/game-updates/04-on-peeker-s-advantage-ranked/', pub: 'VALORANT dev update, 2020' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Topology', '<b>Dedicated authoritative server</b>: fair, cheat-resistant', '<b>Peer-to-peer / host</b>: no server cost', 'Dedicated for competitive games; P2P for co-op and 1v1'],
      ['Tick rate', '<b>20–30 Hz</b>: cheap, scales to 100 players', '<b>64–128 Hz</b>: precise, costly', 'High tick for small competitive shooters'],
      ['Netcode', '<b>Snapshot + interpolation</b>: robust to loss', '<b>Lockstep</b>: tiny bandwidth, needs determinism', 'Lockstep for RTS; snapshots for shooters; rollback for fighting games'],
      ['Transport', '<b>UDP</b> + custom reliability', '<b>TCP / WebSocket</b>: simple', 'UDP for real-time state; TCP for lobby, chat and store'],
      ['Matchmaking', '<b>Strict rating</b>: fair games', '<b>Wide window</b>: fast queues', 'Start strict and widen with wait time and population']
    ]
  },
  failures: [
    { f: 'Game server crashes', detect: 'Pod health and heartbeat to the allocator', fix: 'No contest without rating loss; requeue players; replace the pod from the Ready buffer.' },
    { f: 'Frame overruns its tick budget', detect: 'Frame-time histogram per server', fix: 'Profile hot systems, pack fewer matches per core, or lower the tick rate for that mode.' },
    { f: 'Packet loss and jitter', detect: 'Client-reported loss and RTT variance', fix: 'Redundant inputs in each packet, interpolation buffer, delta snapshots against acked state.' },
    { f: 'Allocation runs dry at peak', detect: 'Ready-buffer size and allocation latency', fix: 'Fleet autoscaler buffer, cluster autoscaling, overflow to a nearby region.' },
    { f: 'Queue times explode off-peak', detect: 'Queue time by rating band and region', fix: 'Widen rating and region windows with wait time; merge queues.' },
    { f: 'Cheating clients', detect: 'Server-side validation, statistics on aim and movement', fix: 'Authoritative simulation, send only visible state, ban pipeline fed by match events.' }
  ],

  interview: [
    { q: 'Why UDP rather than TCP for game state?', a: '<p>TCP delivers everything in order. One lost packet blocks every later one until it is resent (<b>head-of-line blocking</b>), so a 1% loss turns into stalls. In a game, an old position is useless once a newer one exists. UDP lets you drop stale state and add reliability only for what needs it (e.g. "you died"), usually by repeating unacked data in later packets.</p>', lvl: 'core' },
    { q: 'Authoritative server vs peer-to-peer?', a: '<p><b>Authoritative</b>: clients send inputs, one server simulates and decides. Fair and hard to cheat, but you pay for servers. <b>P2P</b>: peers exchange state or inputs directly. Cheap and low latency for two players, but someone must be trusted, NAT traversal is painful, and a player can see others\' IPs.</p>', lvl: 'core' },
    { q: 'Explain client-side prediction and reconciliation.', a: '<p>The client applies its own input immediately instead of waiting a round trip. Each input has a sequence number. Snapshots tell the client the last input the server processed; the client resets to that authoritative state and <b>re-applies the unacked inputs</b>. If prediction was right nothing changes; if not, the correction is smoothed over a few frames.</p>', lvl: 'core' },
    { q: 'What is lag compensation?', a: '<p>The server keeps a short history of every player\'s hitbox. When a shot arrives it rewinds the others to the time the shooter saw (now − latency − interpolation delay), tests the hit, then restores. Shooters can aim where targets appear. The side effect is that targets can be hit after reaching cover on their own screen.</p>', fu: 'How far back should you rewind? (Cap it, e.g. a few hundred ms, so very high pings cannot reach far into the past.)', lvl: 'core' },
    { q: 'Why does tick rate matter?', a: '<p>The server only updates the world every 1/tick seconds, and clients buffer about two snapshots to interpolate. At 20 Hz that buffer is ~100 ms; at 128 Hz it is ~16 ms. Higher tick means less delay and more precise hit timing, but CPU, packets and bandwidth all grow linearly.</p>', lvl: 'core' },
    { q: 'How would you design matchmaking?', a: '<ul><li>Tickets in a store keyed by mode and region, scored by rating (e.g. a Redis sorted set).</li><li>Every second, for the oldest tickets, search a rating window that <b>widens with wait time</b>.</li><li>Respect parties, roles and ping to a common region.</li><li>Balance teams by total rating.</li><li>Use one matchmaker per (mode, region) shard so two workers never grab the same ticket.</li></ul>', lvl: 'core' },
    { q: 'How do you scale game servers per match?', a: '<p>Run servers as pods in a <b>fleet</b>. Keep a buffer of <b>Ready</b> servers (already started and waiting) so allocation takes milliseconds. Allocation atomically marks one as <b>Allocated</b>. A fleet autoscaler maintains the buffer; the cluster autoscaler adds nodes. When the match ends, the pod shuts down and a fresh one replaces it. Agones does exactly this on Kubernetes.</p>', lvl: 'deep' },
    { q: 'What is peeker\'s advantage?', a: '<p>The player moving around a corner sees the defender before the defender sees them, because the peeker\'s movement must travel to the server and then to the defender, plus buffering on both ends. Riot estimated it at roughly 40–70 ms in Valorant and reduced it with 128-tick servers, less buffering and low-ping routing.</p>', lvl: 'deep' },
    { q: 'How do you reduce bandwidth per player?', a: '<p><b>Delta-compress</b> each snapshot against the last one the client acknowledged, quantize positions and angles, send only entities relevant to that player (interest management, also limits wallhacks), and send far-away entities less often.</p>', lvl: 'deep' },
    { q: 'How do you handle a player who disconnects?', a: '<p>Keep their slot and character for a grace period. The client reconnects with its join token; the server sends a full snapshot, then deltas. If the server itself died, the match usually cannot be recovered: record no contest and requeue players.</p>', lvl: 'core' },
    { q: 'How do you ship a new server build without killing live matches?', a: '<p>Never restart a server that is running a match. Roll the fleet so only <b>Ready</b> (idle) servers are replaced with the new build; <b>Allocated</b> ones keep running and exit when their match ends. Agones fleets do this by default with a rolling update. The matchmaker allocates by a <code>build</code> label, and clients must be on a matching version, so a release usually means a short window in which both builds run side by side.</p>', fu: 'What if the new build has a crash bug? (Allocate only a small share to it first, like a canary, and watch crash and frame-time metrics.)', lvl: 'deep' },
    { q: 'When would you choose rollback netcode?', a: '<p>For 1v1 or small games where every frame matters (fighting games). Each peer predicts the opponent\'s input, and when the real input arrives late it <b>rolls back</b> and re-simulates the missed frames. That needs a deterministic, cheap-to-resimulate game state.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Java: fixed-timestep server loop with history', lang: 'java',
      code: `public final class GameLoop implements Runnable {
  static final int HZ = 128;
  static final long TICK_NS = 1_000_000_000L / HZ;       // ~7.8 ms
  static final int HISTORY = HZ;                          // keep ~1 s for rewinds

  private final World world = new World();
  private final InputQueue inputs = new InputQueue();     // filled by the UDP reader thread
  private final Snapshot[] history = new Snapshot[HISTORY];
  private volatile boolean running = true;
  private long tick;

  @Override public void run() {
    long next = System.nanoTime();
    while (running) {
      for (Input in : inputs.drain()) world.apply(in);   // validated, never trusted
      world.step(1.0 / HZ);                              // physics + rules
      history[(int) (tick % HISTORY)] = world.snapshot(tick);
      if (tick % 2 == 0) world.broadcastDeltas();        // send at 64 Hz
      tick++;
      next += TICK_NS;
      long sleep = next - System.nanoTime();
      if (sleep > 0) LockSupport.parkNanos(sleep);
      else if (-sleep > 4 * TICK_NS) next = System.nanoTime(); // overran: don't spiral
    }
  }

  /** Lag compensation: state as the shooter saw it. */
  Snapshot rewindFor(long shotTick, double latencyMs, double interpMs) {
    long back = Math.round((latencyMs + interpMs) / 1000.0 * HZ);
    back = Math.min(back, HISTORY - 1);                  // cap the rewind
    Snapshot s = history[(int) Math.floorMod(shotTick - back, HISTORY)];
    return s != null ? s : world.snapshot(tick);
  }
}`,
      note: 'Simulation runs on one thread at a fixed step; networking threads only enqueue inputs. Sending snapshots less often than the simulation tick is a common bandwidth trade.'
    },
    {
      title: 'Python: rating window that widens with wait', lang: 'python',
      code: `import time
import redis

r = redis.Redis(decode_responses=True)
KEY = "mm:ranked:eu"            # one matchmaker owns this shard (lease elsewhere)

def enqueue(ticket_id: str, rating: float) -> None:
    pipe = r.pipeline()
    pipe.zadd(KEY, {ticket_id: rating})
    pipe.hset(f"ticket:{ticket_id}", mapping={"rating": rating, "t0": time.time()})
    pipe.execute()

def try_match(size: int = 10) -> list[str] | None:
    oldest = min(r.zrange(KEY, 0, -1), default=None,
                 key=lambda t: float(r.hget(f"ticket:{t}", "t0")))
    if oldest is None:
        return None
    t = r.hgetall(f"ticket:{oldest}")
    waited = time.time() - float(t["t0"])
    window = 50 + 25 * waited                        # rating points; widens each second
    rating = float(t["rating"])
    group = r.zrangebyscore(KEY, rating - window, rating + window)
    if len(group) < size:
        return None
    group = sorted(group, key=lambda x: abs(r.zscore(KEY, x) - rating))[:size]
    pipe = r.pipeline()
    pipe.zrem(KEY, *group)                           # safe: single owner per shard
    pipe.delete(*(f"ticket:{g}" for g in group))
    pipe.execute()
    return group                                     # -> balance teams, allocate server`,
      note: 'Fine for a sketch; at scale you would keep enqueue time in a second sorted set instead of scanning every ticket.'
    },
    {
      title: 'Agones: fleet, Ready buffer and allocation', lang: 'yaml',
      code: `apiVersion: agones.dev/v1
kind: Fleet
metadata: { name: shooter-eu }
spec:
  replicas: 50
  template:
    metadata: { labels: { region: eu, build: "1.42" } }
    spec:
      ports: [{ name: game, containerPort: 7777, protocol: UDP }]
      template:
        spec:
          containers:
            - name: server
              image: registry.example.com/shooter-server:1.42
              resources: { requests: { cpu: "500m", memory: 512Mi } }
---
apiVersion: autoscaling.agones.dev/v1
kind: FleetAutoscaler
metadata: { name: shooter-eu-autoscaler }
spec:
  fleetName: shooter-eu
  policy:
    type: Buffer
    buffer: { bufferSize: "10%", minReplicas: 20, maxReplicas: 2000 }
---
apiVersion: allocation.agones.dev/v1
kind: GameServerAllocation
spec:
  selectors:
    - matchLabels: { agones.dev/fleet: shooter-eu, build: "1.42" }`,
      note: 'The matchmaker creates the <code>GameServerAllocation</code> (or calls the allocator service) and gets back the address and port of a server that just moved from Ready to Allocated.'
    }
  ],

  related: ['leaderboard', 'chat', 'collab-editing', 'distributed-cache', 'message-queue', 'job-scheduler']
});
