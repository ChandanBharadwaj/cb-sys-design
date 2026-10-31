SD.register({
  slug: 'newsfeed',
  domain: 5,
  title: 'Newsfeed & Timeline',
  examples: 'X/Twitter, Instagram',
  tagline: 'Show every user a fresh home timeline in tens of milliseconds while a single post may have to reach <b>tens of millions of followers</b>.',
  tldr: {
    problem: 'Reads outnumber posts by orders of magnitude, but one post must appear in every follower\'s feed. Building the feed at read time is slow; copying every post to every follower is expensive.',
    idea: '<b>Fan out on write</b> for normal accounts: push the post id into each follower\'s cached timeline (a Redis list). <b>Fan out on read</b> for celebrities: store their post once and merge it in when a follower opens the app.',
    insight: 'A timeline is a <i>cache of ids</i>, not data. It can be trimmed, evicted for inactive users and rebuilt from the post store and the follow graph at any time.',
    numbers: [
      { v: '800', l: 'tweet ids kept per home timeline in Redis (Twitter, 2013)' },
      { v: '300K', l: 'timeline reads per second (Twitter, 2013)' },
      { v: '~1B/s', l: 'social-graph reads served by TAO (Facebook, 2013 paper)' }
    ]
  },

  intro: {
    what: 'A newsfeed system builds your <b>home timeline</b>: the scrolling list of recent posts from the accounts you follow. When someone posts, it makes sure the post shows up for their followers. When you open the app, it hands you a ready page of posts in a blink.',
    analogy: {
      icon: '📬',
      title: 'Mailboxes versus a celebrity notice board',
      text: 'A local club photocopies each member\'s newsletter and drops it in every follower\'s mailbox, so reading is just opening your own box. That is fine for a member with 50 friends. For a celebrity with millions of fans, photocopying takes forever, so their notice is pinned on one board instead, and you glance at it when you check your mailbox. The real system does the same, except it copies only a short <b>post id</b>, not the whole post.'
    },
    problem: 'You open a social app and expect your feed in a fraction of a second, from hundreds of accounts you follow. Meanwhile, a pop star with tens of millions of followers just posted. People read feeds far more often than they post. So the question is: <b>do you do the work when someone posts, or when someone reads, and how do you handle accounts with huge followings?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Build the feed when the reader opens the app',
        text: 'When you open the app, the server looks up <b>who you follow</b>, fetches their recent posts from the database, sorts them by time and returns the top 20. Nothing is stored ahead of time. Simple, and fine for a small app.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Reader', sub: 'opens the app', kind: 'client', at: [70, 0] },
            { id: 'tls', label: 'Feed service', sub: 'query + sort', kind: 'service', at: [210, 110] },
            { id: 'graph', label: 'Follows', sub: 'who I follow', kind: 'store', at: [70, 220] },
            { id: 'pdb', label: 'Posts DB', sub: 'all posts', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'cli', to: 'tls' }, { from: 'tls', to: 'graph' }, { from: 'tls', to: 'pdb' }],
          flow: ['cli>tls', ['tls>graph', 'tls>pdb']]
        }
      },
      {
        stage: 'breaks',
        title: 'Every page load gathers hundreds of authors',
        text: 'Each feed load now touches posts from hundreds of authors, and feeds are loaded far more often than posts are written. The database drowns in these big merge queries and pages get slow. Flipping it around, copying every post into every follower\'s list, makes reads cheap, but one celebrity post then means <b>millions of writes</b>.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Readers', sub: 'many loads/s', kind: 'client', at: [70, 0] },
            { id: 'tls', label: 'Feed service', sub: '300 authors/load', kind: 'service', at: [210, 110] },
            { id: 'graph', label: 'Follows', sub: 'who I follow', kind: 'store', at: [70, 220] },
            { id: 'pdb', label: 'Posts DB', sub: 'huge merges', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'cli', to: 'tls' }, { from: 'tls', to: 'graph' }, { from: 'tls', to: 'pdb' }],
          flow: [['cli>tls', 'cli>tls'], ['tls>graph', 'tls>pdb'], ['tls>pdb', 'tls>pdb']],
          err: ['pdb'],
          warn: ['tls'],
          badges: { pdb: ['overloaded', 'err'], cli: ['slow ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Push ids for most, pull celebrities at read time',
        text: 'When a normal user posts, background <b>fan-out</b> workers push the post\'s <b>id</b> into a short cached list for each follower. Celebrity posts are stored <b>once</b>, in the author\'s own list. When you read, the timeline service takes your cached list, merges in the few celebrities you follow, then <b>hydrates</b> the page with the actual post text.',
        scene: {
          nodes: [
            { id: 'src', label: 'New post', sub: 'normal or celeb', kind: 'client', at: [70, 0] },
            { id: 'kfk', label: 'Queue', sub: 'post events', kind: 'queue', at: [210, 0] },
            { id: 'fan', label: 'Fan-out', sub: 'push id to fans', kind: 'compute', at: [350, 0] },
            { id: 'auth', label: 'Celeb posts', sub: 'stored once', kind: 'cache', at: [70, 110] },
            { id: 'tls', label: 'Timeline svc', sub: 'merge + rank', kind: 'service', at: [210, 110] },
            { id: 'tl', label: 'Home lists', sub: 'ids per user', kind: 'cache', at: [350, 110] },
            { id: 'cli', label: 'Reader', sub: 'opens the app', kind: 'client', at: [210, 220] }
          ],
          edges: [{ from: 'src', to: 'kfk' }, { from: 'kfk', to: 'fan' }, { from: 'fan', to: 'tl' }, { from: 'src', to: 'auth' }, { from: 'cli', to: 'tls' }, { from: 'tls', to: 'tl' }, { from: 'tls', to: 'auth' }],
          flow: ['src>kfk', 'kfk>fan', 'fan>tl', 'cli>tls', ['tls>tl', 'tls>auth']],
          ok: ['tl', 'tls'],
          badges: { tls: ['fast page ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['X / Twitter home timeline', 'Facebook News Feed', 'Instagram Feed', 'LinkedIn Feed', 'Mastodon home timelines'],
    whenToUse: [
      'Users follow many accounts and want <b>one merged, recent list</b> of their posts',
      'Feeds are read much more often than posts are written',
      'A few seconds of delay before a post reaches every follower is fine'
    ],
    whenNot: [
      'Messages must arrive in strict order and never be missed, like a chat (see <a href="chat.html">Real-Time Chat &amp; Messaging</a>)',
      'The list is picked by a model from everything, not from who you follow (see <a href="recommendation.html">Recommendation System</a>)',
      'A small community: one SQL query over follows and posts is enough'
    ],
    glossary: [
      { term: 'Home timeline', def: 'The feed of recent posts from accounts a user follows, as opposed to one author\'s own profile timeline.' },
      { term: 'Fan-out', def: 'Delivering one post to many followers; on write means copying it to each follower\'s list, on read means gathering it when they load the feed.' },
      { term: 'Hybrid fan-out', def: 'Push posts from normal accounts, but pull posts from accounts above a follower threshold at read time.' },
      { term: 'Social graph', def: 'The stored set of follow relationships: who follows whom.' },
      { term: 'Hydration', def: 'Turning a list of post ids into full posts by fetching text, author and like counts from caches.' },
      { term: 'Cursor pagination', def: 'Asking for "the next 20 after this post id" instead of "page 3", so new posts do not shift the pages.' },
      { term: 'Hot key', def: 'One cache entry read so often (like a celebrity\'s post list) that the single server holding it gets overloaded.' },
      { term: 'Ranking', def: 'Ordering candidate posts by predicted interest instead of just by time.' }
    ]
  },

  requirements: {
    functional: [
      'Post text and media',
      'Follow and unfollow accounts',
      'Home timeline: posts from accounts you follow',
      'Infinite scroll with stable pagination',
      'Chronological or ranked ordering',
      'Delete a post and have it disappear from feeds'
    ],
    nonFunctional: [
      'Timeline read p99 ≲ 100–200 ms',
      'New post visible to most followers within seconds',
      'Reads ≫ writes (≈ 50–100 : 1)',
      'Eventual consistency is acceptable for feeds',
      'Posts themselves are durable; timelines are rebuildable',
      'Survive the loss of a cache node with no user-visible outage'
    ],
    outOfScope: ['Media upload and transcoding (see Video Streaming)', 'Search', 'Ads insertion', 'Direct messages (see Chat)']
  },

  calculator: {
    inputs: [
      { id: 'dau', label: 'Daily active users', min: 1000000, max: 1000000000, value: 150000000, log: true },
      { id: 'ppu', label: 'Posts per user per day', min: 0.05, max: 10, step: 0.05, value: 2 },
      { id: 'fol', label: 'Average followers per poster', min: 10, max: 2000, step: 10, value: 200 },
      { id: 'reads', label: 'Timeline loads per user per day', min: 1, max: 100, value: 20 },
      { id: 'len', label: 'Cached timeline length (entries)', min: 100, max: 3200, step: 100, value: 800 },
      { id: 'bytes', label: 'Bytes per cached entry (id + author + flags)', min: 8, max: 64, step: 4, value: 16, fmt: 'bytes' }
    ],
    outputs: [
      { label: 'Posts / second (average)', f: (v) => (v.dau * v.ppu) / 86400 },
      { label: 'Fan-out writes / second (pure push)', f: (v) => (v.dau * v.ppu / 86400) * v.fol },
      { label: 'Timeline reads / second (average)', f: (v) => (v.dau * v.reads) / 86400 },
      { label: 'Read : post ratio', fmt: 'raw', f: (v) => Math.round(v.reads / v.ppu) + ' : 1' },
      { label: 'Timeline cache RAM (3 replicas)', fmt: 'bytes', f: (v) => v.dau * v.len * v.bytes * 3 },
      { label: 'Post store growth / year (~1 KB per post)', fmt: 'bytes', f: (v) => v.dau * v.ppu * 365 * 1000 }
    ],
    note: 'User counts, posting rates and byte sizes are <em>estimates</em>. The 800-entry cap and keeping each timeline on 3 machines come from Twitter\'s 2013 talk. Notice how the fan-out line, not the post rate, dominates the write load. That is why celebrities are handled differently.'
  },

  api: [
    { m: 'POST', p: '/v1/posts', d: 'Create a post with <code>{text, media_ids, idempotency_key}</code>. Returns the post id at once; fan-out happens asynchronously.' },
    { m: 'GET', p: '/v1/timeline/home?limit=20&cursor=', d: 'Home timeline page. The cursor is the <b>last post id seen</b> (<code>max_id</code>), not an offset, so new posts do not shift pages.' },
    { m: 'GET', p: '/v1/users/{id}/posts?cursor=', d: 'Author timeline (profile page). This is also the source used to merge celebrity posts at read time.' },
    { m: 'PUT', p: '/v1/users/{id}/following/{target}', d: 'Follow. Idempotent. Optionally backfills the target\'s recent posts into your cached timeline.' },
    { m: 'DELETE', p: '/v1/posts/{id}', d: 'Soft-delete (tombstone). Feeds filter it during hydration; caches are cleaned lazily.' }
  ],
  dataModel: [
    { name: 'posts', store: 'Sharded SQL / KV, by post_id', fields: [['post_id', 'int64 (Snowflake)', 'pk'], ['author_id', 'int64', 'idx'], ['body', 'text'], ['media', 'json'], ['deleted', 'bool']], note: 'Time-ordered 64-bit ids let you sort and paginate by id alone.' },
    { name: 'follows', store: 'Postgres / graph store', fields: [['follower_id', 'int64', 'pk'], ['followee_id', 'int64', 'pk'], ['created_at', 'ts']], note: 'Needs two indexes: who I follow (read path) and who follows me (fan-out).' },
    { name: 'tl:{user_id}', store: 'Redis list', fields: [['entries', 'post_id + author_id', 'pk'], ['max length', '800 (LTRIM)'], ['ttl', 'evict if inactive']], note: 'Ids only. Bodies come from post and user caches at read time.' },
    { name: 'ut:{author_id}', store: 'Redis list / post store', fields: [['entries', 'post_id', 'pk'], ['readers', 'profile + celebrity merge']], note: 'Celebrity author timelines are hot keys: replicate them.' }
  ],

  architecture: {
    title: 'Newsfeed architecture (hybrid fan-out)',
    nodes: [
      { id: 'cli', label: 'Client app', sub: 'post · scroll feed', kind: 'client', wide: [90, 220], tall: [210, 0], tip: 'Posts content and pages through the home timeline with a cursor.' },
      { id: 'gw', label: 'API gateway', sub: 'auth · routing', kind: 'edge', wide: [280, 220], tall: [210, 105], tip: 'Authenticates and routes writes to the post service and reads to the timeline service.' },
      { id: 'post', label: 'Post service', sub: 'write path', kind: 'service', wide: [470, 110], tall: [70, 105], tip: 'Assigns a time-ordered id, stores the post durably, appends it to the author timeline and emits a PostCreated event.' },
      { id: 'pdb', label: 'Post store', sub: 'sharded by post_id', kind: 'store', wide: [470, 0], tall: [70, 0], tip: 'Source of truth for post bodies. Timelines only hold ids that point here.' },
      { id: 'kfk', label: 'Kafka', sub: 'PostCreated events', kind: 'queue', wide: [660, 110], tall: [70, 210], tip: 'Decouples posting from fan-out. A slow fan-out never slows down the author.' },
      { id: 'fan', label: 'Fan-out workers', sub: 'push ids to followers', kind: 'compute', wide: [850, 110], tall: [70, 315], tip: 'Page through followers, skip inactive and celebrity cases, and LPUSH + LTRIM into each follower\'s timeline.' },
      { id: 'graph', label: 'Social graph', sub: 'followers · following', kind: 'store', wide: [850, 0], tall: [70, 420], tip: 'Follow edges with indexes in both directions. Facebook serves its graph through TAO, a read-optimised cache over MySQL.' },
      { id: 'auth', label: 'Author timelines', sub: 'recent posts per author', kind: 'cache', wide: [660, 220], tall: [210, 210], tip: 'Each author\'s own recent post ids. Used for profiles and to merge celebrity posts at read time.' },
      { id: 'tls', label: 'Timeline service', sub: 'merge · paginate', kind: 'service', wide: [470, 330], tall: [350, 105], tip: 'Reads the cached home timeline, merges in posts from followed celebrities, then ranks and hydrates a page.' },
      { id: 'tl', label: 'Home timelines', sub: 'Redis lists · 800 ids', kind: 'cache', wide: [850, 330], tall: [210, 315], tip: 'One list of post ids per active user, replicated. Trimmed to a fixed length; evicted for inactive users.' },
      { id: 'rank', label: 'Ranker', sub: 'chronological / ML', kind: 'ml', wide: [470, 440], tall: [350, 315], tip: 'Orders candidates. Chronological is a sort by id; ranked feeds score each candidate with an engagement model.' },
      { id: 'hyd', label: 'Hydration', sub: 'post · user · counts', kind: 'cache', wide: [660, 440], tall: [350, 420], tip: 'Multi-get post bodies, author profiles and like counts from caches. Drops deleted or blocked posts.' }
    ],
    edges: [
      { from: 'cli', to: 'gw', bidi: true },
      { from: 'gw', to: 'post' },
      { from: 'gw', to: 'tls' },
      { from: 'post', to: 'pdb' },
      { from: 'post', to: 'kfk' },
      { from: 'post', to: 'auth' },
      { from: 'kfk', to: 'fan' },
      { from: 'fan', to: 'graph' },
      { from: 'fan', to: 'tl' },
      { from: 'tls', to: 'tl' },
      { from: 'tls', to: 'auth' },
      { from: 'tls', to: 'rank' },
      { from: 'rank', to: 'hyd' }
    ]
  },

  scenarios: [
    {
      id: 'push', title: 'Normal user posts (fan-out on write)', tone: 'info',
      steps: [
        { text: 'A user with 300 followers posts. The post service assigns a <b>time-ordered id</b> and stores the post durably.', flow: ['cli>gw', 'gw>post', 'post>pdb'], badges: { pdb: 'id 1789…' } },
        { text: 'It appends the id to the author\'s own timeline and publishes <code>PostCreated</code> to Kafka, then returns <b>201</b>. The author never waits for fan-out.', flow: [['post>auth', 'post>kfk']], badges: { kfk: '+1 event' } },
        { text: 'A fan-out worker pages through the author\'s followers, 1,000 at a time, and <b>skips inactive users</b> (Twitter used a 30-day cut-off).', flow: ['kfk>fan', 'fan>graph'], badges: { graph: '300 followers' } },
        { text: 'For each active follower: <code>LPUSH tl:{id}</code> then <code>LTRIM 0 799</code>, pipelined per Redis shard. 300 small writes, no post body copied.', flow: ['fan>tl'], badges: { tl: '+300 ids' }, tone: 'ok' },
        { text: 'Followers see the post on their next refresh, usually within seconds. Reads stay a single list lookup.', nodes: ['tl', 'tls'], ok: ['tl'], tone: 'ok' }
      ]
    },
    {
      id: 'celeb', title: 'Hot spot: a celebrity posts', tone: 'warn',
      steps: [
        { text: 'An account with <b>50M followers</b> posts. Pure push means 50M list writes for one post. Twitter reported that a tweet could take <b>up to 5 minutes</b> to reach 31M followers this way.', flow: ['cli>gw', 'gw>post', 'post>pdb'], warn: ['fan'], badges: { fan: ['50M writes?', 'warn'] }, tone: 'warn' },
        { text: '<b>Hybrid:</b> the author is above the follower threshold, so fan-out is skipped. The post goes only to the author timeline: <b>one write</b>.', flow: ['post>auth'], ok: ['auth'], badges: { auth: '1 write', fan: ['skipped', 'ok'] } },
        { text: 'When a follower opens the app, the timeline service reads their cached list <b>and</b> the author timelines of the few celebrities they follow, in parallel.', flow: ['cli>gw', 'gw>tls', ['tls>tl', 'tls>auth']], badges: { tls: '1 + k reads' } },
        { text: 'A <b>k-way merge by id</b> (ids are time-ordered) interleaves both sources, then the page is ranked and hydrated.', flow: ['tls>rank', 'rank>hyd'], tone: 'ok', badges: { rank: 'merged' } },
        { text: 'The cost moved to reads. Celebrity author timelines become <b>hot keys</b>, so keep extra replicas or an in-process cache of them.', nodes: ['auth'], warn: ['auth'], badges: { auth: ['hot key', 'warn'] }, tone: 'warn' }
      ]
    },
    {
      id: 'read', title: 'Read the home timeline', tone: 'ok',
      steps: [
        { text: '<code>GET /timeline/home?limit=20</code>. The gateway routes it to the timeline service.', flow: ['cli>gw', 'gw>tls'] },
        { text: '<code>LRANGE tl:{user} 0 199</code> returns up to 200 candidate ids. Each entry is a few bytes, so this is one fast call.', flow: ['tls>tl'], badges: { tl: '200 ids' } },
        { text: 'Merge in posts from followed celebrities. Drop muted, blocked and deleted ids.', flow: ['tls>auth'], badges: { auth: '+12 ids' } },
        { text: 'The ranker orders candidates: by id for a chronological feed, or by predicted engagement for a ranked one.', flow: ['tls>rank'], badges: { rank: 'top 20' } },
        { text: '<b>Hydration</b> multi-gets bodies, authors and counts from caches. The response carries <code>next_cursor = last id</code>.', flow: ['rank>hyd'], tone: 'ok', badges: { hyd: '20 posts' } }
      ]
    },
    {
      id: 'inactive', title: 'Inactive user comes back', tone: 'warn',
      steps: [
        { text: 'Fan-out workers skip users who have not logged in recently, and their timelines are evicted from Redis. This saves a lot of RAM and writes.', flow: ['kfk>fan', 'fan>graph'], badges: { fan: 'skip inactive' } },
        { text: 'Months later the user logs in. <code>LRANGE</code> returns nothing: a <b>cache miss</b>.', flow: ['cli>gw', 'gw>tls', 'tls>tl'], warn: ['tl'], badges: { tl: ['miss', 'warn'] }, tone: 'warn' },
        { text: 'The timeline service rebuilds it like a pull: read who they follow, fetch each followee\'s recent posts, and merge. This is slower, but it only happens once.', flow: ['tls>auth'], nodes: ['graph'], badges: { tls: 'rebuild', graph: 'following' } },
        { text: 'The rebuilt list is written back to Redis and the user counts as active again, so normal fan-out resumes.', flow: ['tls>tl'], ok: ['tl'], badges: { tl: ['warm', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'cache-loss', title: 'Timeline cache node dies', tone: 'err',
      steps: [
        { text: 'A Redis node holding millions of home timelines crashes.', nodes: ['tl'], err: ['tl'], badges: { tl: ['node down', 'err'] }, tone: 'err' },
        { text: 'Each timeline is <b>replicated</b> (Twitter kept 3 copies on different machines), so reads switch to a surviving replica.', flow: ['tls>tl'], warn: ['tl'], badges: { tl: ['replica', 'warn'] }, tone: 'warn' },
        { text: 'Fan-out writes for that shard back up in <b>Kafka</b>. Nothing is lost; consumer lag grows and alarms fire.', flow: ['post>kfk', 'kfk>fan'], warn: ['kfk'], badges: { kfk: ['lag ↑', 'warn'] } },
        { text: 'If every copy is gone, timelines are rebuilt on demand from the post store and the graph. They are derived data, so this costs latency, not correctness.', flow: ['tls>auth', 'tls>tl'], ok: ['tl'], badges: { tl: ['rebuilt', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick a fan-out strategy and move the celebrity threshold. Watch write load, read cost and how long a celebrity post takes to reach everyone. Numbers are illustrative, scaled to Twitter\'s published 2013 load.',
    controls: [
      { id: 'mode', label: 'Fan-out strategy', type: 'seg', value: 'hybrid', options: [
        { v: 'push', l: 'Push (on write)' }, { v: 'pull', l: 'Pull (on read)' }, { v: 'hybrid', l: 'Hybrid' }] },
      { id: 'thr', label: 'Celebrity threshold (hybrid only)', type: 'range', min: 3, max: 7, step: 0.5, value: 5, fmt: (v) => SD.fmt.num(Math.pow(10, v)) + ' followers' },
      { id: 'order', label: 'Feed ordering', type: 'seg', value: 'chrono', options: [
        { v: 'chrono', l: 'Chronological' }, { v: 'ranked', l: 'Ranked (ML)' }] },
      { id: 'len', label: 'Cached timeline length', type: 'range', min: 100, max: 3200, step: 100, value: 800, unit: 'ids' }
    ],
    evaluate(s) {
      const P = 6000, F = 200, R = 300000, ACTIVE = 150e6, BIG = 1e8, RATE = 1e5; // illustrative
      const T = Math.pow(10, s.thr);
      // share of an average user's followees with more than T followers (illustrative power-law fit)
      const pts = [[3, 0.5], [4, 0.25], [5, 0.1], [6, 0.04], [7, 0.01]];
      const lt = Math.log10(T); let share = 0.01;
      for (let i = 0; i < pts.length - 1; i++) if (lt >= pts[i][0] && lt <= pts[i + 1][0]) {
        const f = (lt - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
        share = Math.pow(10, Math.log10(pts[i][1]) * (1 - f) + Math.log10(pts[i + 1][1]) * f);
      }
      const pulled = s.mode === 'push' ? 0 : s.mode === 'pull' ? F : Math.round(F * share);
      const writes = s.mode === 'push' ? P * F : s.mode === 'pull' ? 0 : P * F * (1 - share);
      const lookups = R * (1 + pulled);
      const lat = (s.mode === 'pull' ? 4 : 5) + 0.35 * pulled + 8 + (s.order === 'ranked' ? 30 : 0);
      const lag = s.mode === 'push' ? BIG / RATE : s.mode === 'pull' ? 0 : T / RATE;
      const ram = s.mode === 'pull' ? 0 : ACTIVE * s.len * 16 * 3;
      const pages = Math.floor(s.len / 20);
      const metrics = [
        { k: 'Fan-out writes/s', v: SD.fmt.num(writes) + '/s', s: writes === 0 ? 0.95 : writes < 1.15e6 ? 0.6 : 0.45, hint: 'average' },
        { k: 'Largest single fan-out', v: s.mode === 'pull' ? 'none' : SD.fmt.num(s.mode === 'push' ? BIG : T) + ' writes', s: s.mode === 'pull' ? 0.95 : s.mode === 'push' ? 0.1 : T <= 1e5 ? 0.9 : T <= 1e6 ? 0.65 : 0.35, hint: 'one post' },
        { k: 'Read lookups/s', v: SD.fmt.num(lookups) + '/s', s: pulled <= 25 ? 0.85 : pulled <= 60 ? 0.55 : 0.2, hint: '1 + ' + pulled + ' per load' },
        { k: 'Timeline read p99', v: '≈ ' + Math.round(lat) + ' ms', s: lat < 40 ? 0.9 : lat < 80 ? 0.6 : 0.3 },
        { k: 'Worst celebrity delivery', v: lag === 0 ? 'instant (read time)' : SD.fmt.dur(lag * 1000), s: lag <= 10 ? 0.9 : lag <= 120 ? 0.55 : 0.15, hint: 'largest fan-out' },
        { k: 'Timeline cache RAM', v: ram ? SD.fmt.bytes(ram) : 'none', s: ram === 0 ? 0.9 : ram < 4e12 ? 0.75 : ram < 1e13 ? 0.5 : 0.25, hint: '3 replicas' },
        { k: 'Scroll depth from cache', v: s.mode === 'pull' ? 'computed per read' : pages + ' pages of 20', s: s.mode === 'pull' ? 0.5 : pages >= 30 ? 0.85 : pages >= 15 ? 0.6 : 0.3 }
      ];
      const notes = [];
      if (s.mode === 'push') notes.push('Every post costs one write per follower. For a 100M-follower account that is minutes of fan-out, during which followers see the post at different times.');
      if (s.mode === 'pull') notes.push('Each load must read ~' + F + ' author timelines and merge them. At 300K loads/s that is tens of millions of lookups per second, and the slowest shard sets your p99.');
      if (s.mode === 'hybrid') notes.push('Authors above <b>' + SD.fmt.num(T) + '</b> followers are merged at read time. The average reader then pulls ≈ ' + pulled + ' author timelines.');
      if (s.mode === 'hybrid') notes.push('The average write load barely drops, because few accounts are above the threshold. What hybrid removes is the <b>giant single fan-out</b> and its delivery delay.');
      if (s.order === 'ranked') notes.push('Ranking scores a larger candidate pool, then cuts to a page. Twitter\'s 2023 open-sourced pipeline starts from about <b>1,500 candidates</b>, roughly half from accounts you follow.');
      if (s.len > 1600) notes.push('Long lists cost RAM for every active user, yet most sessions read only the first few pages.');
      if (s.len < 300) notes.push('Short lists make deep scrolling fall off the cache onto a slow rebuild path.');
      let verdict;
      if (s.mode === 'pull') verdict = '❌ <b>Pull-only does not survive read-heavy load.</b> It works for small apps or as the fallback path, not as the main path.';
      else if (s.mode === 'push') verdict = '⚠ <b>Push-only is simple and fast to read</b>, but celebrity posts cause write storms and long delivery delays.';
      else if (T < 1e4) verdict = '⚠ <b>Threshold too low:</b> too many accounts are pulled, so reads get expensive again.';
      else if (T > 1e6) verdict = '⚠ <b>Threshold too high:</b> big accounts still fan out, so the delivery delay is long.';
      else verdict = '✅ <b>Hybrid with a mid threshold</b>, which is what Twitter described: cheap reads for most posts, with celebrity posts merged in at read time.';
      const flow = s.mode === 'pull'
        ? ['cli>gw', 'gw>post', 'post>auth', 'gw>tls', 'tls>auth', 'tls>rank', 'rank>hyd']
        : s.mode === 'push'
          ? ['cli>gw', 'gw>post', 'post>kfk', 'kfk>fan', 'fan>tl', 'gw>tls', 'tls>tl', 'tls>rank', 'rank>hyd']
          : ['cli>gw', 'gw>post', 'post>kfk', 'kfk>fan', 'fan>tl', 'gw>tls', ['tls>tl', 'tls>auth'], 'tls>rank', 'rank>hyd'];
      return {
        metrics, verdict, notes, flow,
        hide: s.mode === 'pull' ? ['fan', 'tl'] : [],
        labels: {
          rank: s.order === 'ranked' ? { label: 'ML ranker', sub: 'score ~1.5K candidates' } : { label: 'Chronological', sub: 'sort by id' },
          tl: { label: 'Home timelines', sub: 'Redis · ' + s.len + ' ids' },
          tls: { label: 'Timeline service', sub: s.mode === 'push' ? 'read 1 list' : 'merge 1 + ' + pulled + ' lists' }
        },
        hot: s.mode === 'hybrid' ? ['auth'] : [],
        warn: (s.mode === 'push' ? ['fan'] : []).concat(s.mode === 'pull' ? ['tls', 'auth'] : []),
        badges: s.mode === 'pull' ? { tls: [pulled + ' reads/load', 'err'] } : { fan: [SD.fmt.num(writes) + ' w/s', s.mode === 'push' ? 'warn' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Fan-out simulator on a real follow graph',
    caption: 'A 240-user graph where popularity follows a power law. <b>Post</b> from any account to watch push fan-out or celebrity storage, then <b>read</b> a random timeline to see the merge. Move the threshold and compare the write and read counters.'
  },

  realWorld: {
    intro: 'Twitter and Facebook published the two extremes of this design; most feeds today combine them and add ranking.',
    timeline: [
      { when: '2012', who: 'Facebook', title: 'Multifeed: fan-out on read', text: 'Facebook\'s News Feed backend (Multifeed) keeps recent actions in memory and gathers them <b>when the feed is requested</b>, rather than writing to every friend\'s feed. The team called it more flexible and manageable than the push alternative.', src: 2 },
      { when: '2013', who: 'Twitter', title: 'Timelines at Scale', text: 'Raffi Krikorian\'s talk: about <b>150M active users</b> and <b>300K QPS</b> of timeline reads. Each home timeline is a <b>Redis list capped at 800 tweets</b>, kept on 3 machines. Fan-out skips users inactive for 30 days.', src: 0 },
      { when: '2013', who: 'Twitter', title: 'Celebrities merged at read time', text: 'Fan-out to huge accounts was slow: a Lady Gaga tweet could take <b>up to 5 minutes</b> to reach 31M followers. For such accounts, Twitter described merging their tweets into the timeline when it is read (talk: InfoQ).', src: 0 },
      { when: '2013', who: 'Facebook', title: 'TAO for the social graph', text: 'TAO is a geographically distributed, read-optimised graph cache over MySQL with an objects-and-associations API. The paper reports about <b>a billion reads per second</b> on a data set of many petabytes.', src: 3 },
      { when: '2023', who: 'Twitter', title: 'Ranking pipeline open-sourced', text: 'The "For You" feed gathers about <b>1,500 candidates</b>, on average about <b>half in-network</b> (people you follow) and half out-of-network, then ranks them with a neural network.', src: 4 },
      { when: '2023', who: 'Instagram', title: 'One ranker per surface', text: 'Instagram explains that Feed, Stories, Explore and Reels each have their own ranking system. Feed starts from recent posts by accounts you follow and ranks them with signals about the post, the author and your history.', src: 6 }
    ],
    lessons: [
      'Store <b>ids</b> in timelines, never copies of posts. Hydrate at read time.',
      'Treat home timelines as a <b>rebuildable cache</b>: trim them, evict inactive users, replicate active ones.',
      'Use a <b>hybrid</b>: push for the long tail, pull for the few accounts with huge follower counts.',
      'Ranking changes the shape of the problem: you need a larger <b>candidate pool</b>, not just the newest 20 ids.'
    ],
    sources: [
      { title: 'The Architecture Twitter Uses to Deal with 150M Active Users, 300K QPS, a 22 MB/S Firehose', url: 'https://highscalability.com/the-architecture-twitter-uses-to-deal-with-150m-active-users/', pub: 'High Scalability, 2013 (summary of Raffi Krikorian\'s talk)' },
      { title: 'Timelines at Scale (Raffi Krikorian)', url: 'https://www.infoq.com/presentations/Twitter-Timeline-Scalability', pub: 'InfoQ / QCon, 2013' },
      { title: 'Facebook News Feed (QCon New York 2012 slides)', url: 'https://qconnewyork.com/ny2016/ny2012/dl/qcon-newyork-2012/slides/facebook%20news-feed%20qcon%202012.pdf', pub: 'QCon New York, 2012' },
      { title: 'TAO: Facebook\'s Distributed Data Store for the Social Graph', url: 'https://usenix.org/system/files/conference/atc13/atc13-bronson.pdf', pub: 'USENIX ATC, 2013' },
      { title: 'Twitter\'s Recommendation Algorithm', url: 'https://blog.twitter.com/engineering/en_us/topics/open-source/2023/twitter-recommendation-algorithm', pub: 'Twitter Engineering, 2023' },
      { title: 'Twitter Open-Sources Recommendation Algorithm', url: 'https://www.infoq.com/news/2023/04/twitter-algorithm', pub: 'InfoQ, 2023' },
      { title: 'Instagram Ranking Explained', url: 'https://about.instagram.com/blog/announcements/instagram-ranking-explained', pub: 'Instagram (Adam Mosseri), 2023' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Fan-out', '<b>Push (on write)</b>: reads are one list lookup', '<b>Pull (on read)</b>: no write amplification', 'Hybrid: push below a follower threshold, pull above it'],
      ['Timeline contents', '<b>Ids only</b>: small, edits and deletes stay correct', '<b>Full post copies</b>: no hydration step', 'Almost always ids; hydrate from caches'],
      ['Ordering', '<b>Chronological</b>: simple, predictable, cheap', '<b>Ranked</b>: more engagement, needs ML and features', 'Ranked when the follow graph is too dense to read everything'],
      ['Timeline store', '<b>Redis lists</b>: very fast, RAM-bound', '<b>Wide-column (Cassandra)</b>: cheaper per GB, slower', 'Redis for active users; rebuild others from durable data'],
      ['Pagination', '<b>Offset</b>: easy, but new posts shift pages', '<b>Cursor (max_id)</b>: stable under inserts', 'Always cursors for feeds']
    ]
  },
  failures: [
    { f: 'Celebrity post triggers a write storm', detect: 'Fan-out queue lag and per-post fan-out size', fix: 'Skip fan-out above a follower threshold and merge at read time.' },
    { f: 'Hot celebrity author timeline', detect: 'Per-key QPS on the author-timeline cache', fix: 'Extra replicas, a short in-process cache in the timeline service, request coalescing.' },
    { f: 'Timeline cache node lost', detect: 'Redis health checks and error rates', fix: 'Read from replicas; rebuild missing timelines on demand from the post store and graph.' },
    { f: 'Deleted post still shows in feeds', detect: 'User reports, audit of tombstones', fix: 'Filter tombstoned ids during hydration; remove from lists lazily or with a background job.' },
    { f: 'Fan-out falls behind', detect: 'Kafka consumer lag', fix: 'Scale workers by partition; fan out to recently active users first.' },
    { f: 'Mass rebuild after a cache flush', detect: 'Miss rate spike, DB load', fix: 'Rate-limit rebuilds, warm the most active users first, serve a degraded (shorter) feed meanwhile.' }
  ],

  interview: [
    { q: 'Fan-out on write vs fan-out on read: explain the trade-off.', a: '<p><b>On write (push):</b> when someone posts, append the post id to each follower\'s cached timeline. Reads are a single list read, but one post costs one write per follower.</p><p><b>On read (pull):</b> store the post once. On every feed load, fetch recent posts from everyone you follow and merge them. Writes are cheap, reads are expensive.</p><p>Feeds are read far more than written, so push is the default, with pull for exceptions.</p>', lvl: 'core' },
    { q: 'How do you handle celebrities with tens of millions of followers?', a: '<p>Use a <b>hybrid</b>. Accounts above a follower threshold are not fanned out. Their posts live in their author timeline. At read time the timeline service fetches the reader\'s cached list plus the author timelines of the celebrities they follow, and merges them by id.</p><p>Cache the celebrity timelines heavily, because they are hot keys.</p>', fu: 'How would you pick the threshold? (Balance fan-out cost against the number of extra reads per load; measure both.)', lvl: 'core' },
    { q: 'How do you paginate a feed that changes while the user scrolls?', a: '<p>Use a <b>cursor</b>, not an offset. Return <code>next_cursor = id of the last item</code>; the next page asks for items with <code>id &lt; cursor</code>. Because ids are time-ordered (Snowflake-style), new posts at the top do not shift the pages below.</p>', lvl: 'core' },
    { q: 'A user deletes a post that was already fanned out. What happens?', a: '<p>Mark the post as deleted (a <b>tombstone</b>) in the post store. Hydration drops any id whose post is deleted, so it disappears from feeds right away. Removing the id from millions of lists can happen lazily or in a background job; it is not on the critical path.</p>', lvl: 'core' },
    { q: 'Why not fan out to every follower, including inactive ones?', a: '<p>Most accounts have many followers who rarely log in. Writing to their timelines wastes writes and RAM. Skip users inactive for N days and let their timeline be <b>rebuilt on demand</b> (a one-off pull) when they return. Twitter described exactly this with a 30-day window.</p>', lvl: 'core' },
    { q: 'What do you store in each timeline entry?', a: '<p>Just the <b>post id</b>, plus maybe the author id and a few flag bits. Bodies, like counts and author profiles are fetched at read time from caches. Entries stay tiny (tens of bytes), edits and deletes stay correct, and you avoid copying media metadata millions of times.</p>', lvl: 'core' },
    { q: 'How does ranking change the design?', a: '<p>A chronological feed only needs the newest ids. A ranked feed needs a <b>candidate pool</b> (hundreds to thousands of items from followed accounts, and often recommended ones), <b>features</b> per candidate, and a model that predicts engagement. A cheap first-stage scorer cuts the pool, and a heavier model orders the final page.</p>', fu: 'How do you avoid showing the same post twice across pages? (Keep a seen set or a ranked snapshot per session.)', lvl: 'deep' },
    { q: 'I post and immediately refresh. Why might I not see my post, and how do you fix it?', a: '<p>Fan-out is asynchronous, so your own timeline may not have it yet. Fix it with <b>read-your-own-writes</b>: the timeline service always merges your own author timeline (which is written synchronously), or the client inserts the new post locally.</p>', lvl: 'core' },
    { q: 'What happens on follow and unfollow?', a: '<p><b>Follow:</b> write the edge, then optionally backfill the followee\'s recent posts into your cached timeline so the change is visible at once.</p><p><b>Unfollow:</b> delete the edge and filter that author at read time. Purge their ids from your list lazily.</p>', lvl: 'deep' },
    { q: 'How would you shard the data?', a: '<ul><li><b>Posts</b> by post id.</li><li><b>Home timelines</b> by the reader\'s user id, so one feed load hits one shard.</li><li><b>Follow edges</b> stored twice: by follower (who do I follow) and by followee (who follows me), because the read path and the fan-out path need different indexes.</li></ul>', lvl: 'deep' },
    { q: 'How do you scale the fan-out workers?', a: '<p>Partition the <code>PostCreated</code> topic in Kafka and run a consumer group. Each worker pages through followers in batches and <b>pipelines</b> Redis commands per shard. Large fan-outs can be split into chunks so many workers share one post. Monitor consumer lag as the key health signal.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Spring Boot: fan-out worker (Kafka → Redis lists)', lang: 'java',
      code: `@Component
public class FanoutWorker {
  private static final int MAX = 800, PAGE = 1000;
  private static final long CELEBRITY = 100_000;
  private final StringRedisTemplate redis;
  private final JdbcTemplate jdbc;

  public FanoutWorker(StringRedisTemplate redis, JdbcTemplate jdbc) {
    this.redis = redis; this.jdbc = jdbc;
  }

  public record PostCreated(long postId, long authorId, long followers) {}

  @KafkaListener(topics = "post-created", groupId = "fanout")
  public void onPost(PostCreated e) {
    if (e.followers() > CELEBRITY) return;           // merged at read time
    long after = 0;
    while (true) {
      List<Long> page = jdbc.queryForList("""
          SELECT f.follower_id FROM follows f
          JOIN users u ON u.id = f.follower_id
          WHERE f.followee_id = ? AND f.follower_id > ?
            AND u.last_active > now() - interval '30 days'
          ORDER BY f.follower_id LIMIT ?""",
          Long.class, e.authorId(), after, PAGE);
      if (page.isEmpty()) return;
      byte[] val = Long.toString(e.postId()).getBytes(StandardCharsets.UTF_8);
      redis.executePipelined((RedisCallback<Object>) conn -> {
        for (Long f : page) {
          byte[] key = ("tl:" + f).getBytes(StandardCharsets.UTF_8);
          conn.listCommands().lPush(key, val);
          conn.listCommands().lTrim(key, 0, MAX - 1);
        }
        return null;
      });
      after = page.get(page.size() - 1);
    }
  }
}`,
      note: 'Keyset pagination over followers avoids large OFFSETs. An index on <code>follows(followee_id, follower_id)</code> makes each page an index range scan.'
    },
    {
      title: 'Postgres: follow graph and cursor pagination', lang: 'sql',
      code: `CREATE TABLE follows (
  follower_id bigint NOT NULL,
  followee_id bigint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)          -- who do I follow
);
CREATE INDEX follows_by_followee
  ON follows (followee_id, follower_id);           -- who follows me (fan-out)

-- author timeline page: ids are time-ordered, so the cursor is just an id
SELECT post_id, body
FROM posts
WHERE author_id = $1 AND post_id < $2 AND NOT deleted
ORDER BY post_id DESC
LIMIT 20;`
    },
    {
      title: 'Python: hybrid read (k-way merge by id)', lang: 'python',
      code: `import heapq

def home_page(redis, user_id, celeb_ids, cursor=None, limit=20):
    """Merge the pushed timeline with pulled celebrity timelines."""
    def ids(key):
        raw = redis.lrange(key, 0, 199)            # newest first
        return [int(x) for x in raw if cursor is None or int(x) < cursor]

    streams = [ids(f"tl:{user_id}")]
    streams += [ids(f"ut:{c}") for c in celeb_ids]  # one read per celebrity
    merged = heapq.merge(*streams, reverse=True)    # each list is sorted desc
    page, seen = [], set()
    for pid in merged:
        if pid not in seen:
            seen.add(pid)
            page.append(pid)
        if len(page) == limit:
            break
    next_cursor = page[-1] if page else None
    return page, next_cursor                        # hydrate ids afterwards`
    }
  ],

  related: ['notifications', 'chat', 'recommendation', 'distributed-cache', 'message-queue', 'unique-id']
});
