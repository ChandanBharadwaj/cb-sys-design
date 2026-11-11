SD.register({
  slug: 'recommendation',
  domain: 8,
  title: 'Recommendation System',
  examples: 'YouTube, Netflix, TikTok',
  tagline: 'Pick the best ~20 items out of <b>hundreds of millions</b> for each user in a fraction of a second, using a <b>funnel</b> of cheaper-to-costlier models, and react to what they did a minute ago.',
  tldr: {
    problem: 'Scoring every item for every request with your best model is impossible: millions of items × thousands of requests per second. Yet users expect the feed to reflect what they just watched.',
    idea: 'A <b>multi-stage funnel</b>: a <b>two-tower</b> model plus ANN search pulls a few hundred candidates per source, filters drop ineligible ones, a heavy <b>ranking model</b> scores what is left with rich features, and a <b>re-ranker</b> adds diversity and business rules.',
    insight: 'Each stage trades model cost for item count. The two classic failure points are <b>freshness</b> (models and features lag behind the user) and <b>training-serving skew</b> (features computed differently offline and online).',
    numbers: [
      { v: '~80%', l: 'of Netflix hours streamed influenced by recommendations (2015 paper)' },
      { v: 'hundreds', l: 'YouTube candidates left after the first stage (Covington et al., 2016)' },
      { v: '3B · 18B', l: 'nodes · edges in Pinterest\'s PinSage graph (KDD 2018)' }
    ]
  },

  intro: {
    what: 'A recommendation system decides which items to show each person: videos, products, songs or posts. It learns from what people watched, clicked, liked or skipped. Then it picks the <b>handful most likely to interest this user right now</b> out of a huge catalog.',
    analogy: {
      icon: '📼',
      title: 'A video-store clerk who knows your taste',
      text: 'A good clerk does not walk you past every shelf. They first grab a small pile of likely titles from the sections you enjoy, then think harder about which few you will love, and make sure the pile is not all one genre. A recommender works the same way in steps: <b>cheap models first, expensive ones last</b>. Unlike the clerk, it serves millions of people at once and updates its picture of you as you click.'
    },
    problem: 'You open a video app and expect a feed of things you want to watch, in the blink of an eye. The catalog holds many millions of videos, and your taste may have shifted in the last few minutes. Scoring every video with a smart model, for every user, is far too slow and costly. The core question is <b>how to pick the best 20 items out of millions, for each person, in a fraction of a second</b>.',
    story: [
      {
        stage: 'naive',
        title: 'Score every item with one model',
        text: 'Train one model that predicts how much a user will like an item. When the feed loads, score <b>every item</b> in the catalog for this user, sort, and show the top 20. It is simple and works for a shop with a few hundred products.',
        scene: {
          nodes: [
            { id: 'user', label: 'User app', sub: 'opens feed', kind: 'client', at: [70, 0] },
            { id: 'feed', label: 'Feed service', sub: 'score, sort', kind: 'service', at: [70, 110] },
            { id: 'cat', label: 'Catalog', sub: 'every item', kind: 'store', at: [210, 0] },
            { id: 'rank', label: 'Ranking model', sub: 'scores each item', kind: 'ml', at: [350, 110] }
          ],
          edges: [{ from: 'user', to: 'feed', bidi: true }, { from: 'feed', to: 'cat', bidi: true }, { from: 'feed', to: 'rank', bidi: true }],
          flow: ['user>feed', 'feed>cat', 'feed>rank', 'rank>feed', 'feed>user']
        }
      },
      {
        stage: 'breaks',
        title: 'Too many items, too little time',
        text: 'A catalog of 100 million items times thousands of feed requests per second means <b>hundreds of billions of model scores every second</b>. Every request blows its time budget. And if the model only learns once a day, the feed ignores the cooking videos you watched five minutes ago.',
        scene: {
          nodes: [
            { id: 'user', label: 'User app', sub: 'spinner…', kind: 'client', at: [70, 0] },
            { id: 'feed', label: 'Feed service', sub: 'timing out', kind: 'service', at: [70, 110] },
            { id: 'cat', label: 'Catalog', sub: '100M items', kind: 'store', at: [210, 0] },
            { id: 'rank', label: 'Ranking model', sub: 'overloaded', kind: 'ml', at: [350, 110] }
          ],
          edges: [{ from: 'user', to: 'feed', bidi: true }, { from: 'feed', to: 'cat', bidi: true }, { from: 'feed', to: 'rank', bidi: true }],
          flow: ['user>feed', 'feed>cat', ['feed>rank', 'feed>rank']],
          err: ['rank'],
          warn: ['feed', 'user'],
          badges: { rank: ['100M scores', 'err'], user: ['slow ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'A funnel: cheap filters first, the smart model last',
        text: 'A cheap <b>candidate generation</b> step uses item embeddings and nearest-neighbour search to pull about a thousand likely items from millions. A heavier <b>ranking model</b> scores only those, using fresh signals from a <b>feature store</b>. A <b>re-ranker</b> adds variety and business rules and keeps the top 20. Your clicks stream back within seconds, so the next scroll already reflects them.',
        scene: {
          nodes: [
            { id: 'user', label: 'User app', sub: 'opens feed', kind: 'client', at: [70, 0] },
            { id: 'feed', label: 'Feed service', sub: 'runs the funnel', kind: 'service', at: [70, 110] },
            { id: 'cg', label: 'Candidates', sub: 'millions → 1,000', kind: 'ml', at: [210, 0] },
            { id: 'rank', label: 'Ranking model', sub: 'scores 1,000', kind: 'ml', at: [350, 110] },
            { id: 'rerank', label: 'Re-ranker', sub: 'top 20, varied', kind: 'service', at: [210, 220] },
            { id: 'ann', label: 'Item index', sub: 'nearest items', kind: 'store', at: [210, 110] },
            { id: 'fs', label: 'Feature store', sub: 'fresh signals', kind: 'cache', at: [350, 220] }
          ],
          edges: [{ from: 'user', to: 'feed', bidi: true }, { from: 'feed', to: 'cg' }, { from: 'cg', to: 'ann', bidi: true }, { from: 'cg', to: 'rank' }, { from: 'rank', to: 'fs', bidi: true }, { from: 'rank', to: 'rerank' }, { from: 'rerank', to: 'feed' }],
          flow: ['feed>cg', 'cg>rank', 'rank>rerank', 'rerank>feed', 'feed>user'],
          ok: ['cg', 'rank', 'rerank'],
          badges: { user: ['20 picks', 'ok'] }
        }
      }
    ],
    usedBy: ['YouTube home feed and Up next', 'Netflix home rows', 'TikTok For You feed', 'Amazon "customers also bought"', 'Spotify Discover Weekly', 'Pinterest related pins'],
    whenToUse: [
      'The catalog is <b>far too big</b> for people to browse',
      'Users come back often, so their history shows what they like',
      'Engagement or sales depend on showing the <b>right few items first</b>'
    ],
    whenNot: [
      'Users know exactly what they want and type it: that is search (see <a href="search-engine.html">Distributed Search Engine</a>)',
      'A small catalog of a few hundred items: sort by popularity or let editors choose',
      'A time-ordered list of posts from accounts a user follows: see <a href="newsfeed.html">Newsfeed &amp; Timeline</a>'
    ],
    glossary: [
      { term: 'Candidate generation', def: 'The first, cheap stage that narrows millions of items to a few hundred or thousand worth scoring.' },
      { term: 'Two-tower model', def: 'Two networks that turn a user and an item into embeddings (lists of numbers), so a close pair means a good match.' },
      { term: 'ANN search', def: 'Approximate nearest-neighbour search: quickly finding the item embeddings closest to the user\'s, without checking them all.' },
      { term: 'Ranking model', def: 'A heavier model that scores each candidate using many user and item features, predicting clicks, watch time and more.' },
      { term: 'Re-ranker', def: 'The last step that reorders the top results for variety, freshness and business rules.' },
      { term: 'Feature store', def: 'A shared store of model inputs, such as "last 50 items watched", served fast online and kept as history for training.' },
      { term: 'Cold start', def: 'The problem of recommending for a brand-new user or item that has no history yet.' },
      { term: 'Training-serving skew', def: 'When the model sees features computed differently in production than in training, so its predictions quietly get worse.' }
    ]
  },

  requirements: {
    functional: [
      'Personalized home feed with infinite scroll',
      '"Up next" and similar-item recommendations',
      'React to in-session actions within seconds',
      'Handle new users and new items (cold start)',
      'Business rules: no repeats, rights, blocks, freshness',
      'Log impressions and outcomes; run A/B tests'
    ],
    nonFunctional: [
      'Feed latency p99 ≲ 200 ms (estimate)',
      '100K+ feed requests per second at peak',
      'Features fresh within seconds, models within hours or less',
      'Same feature code offline and online',
      'Degrade to popular items instead of failing',
      'Diverse results; avoid filter bubbles'
    ],
    outOfScope: ['Ads auctions', 'Search ranking (see Search Engine)', 'Content moderation']
  },

  calculator: {
    inputs: [
      { id: 'dau', label: 'Daily active users', min: 1000000, max: 2000000000, value: 100000000, log: true },
      { id: 'rpu', label: 'Feed requests per user per day', min: 1, max: 50, value: 10 },
      { id: 'items', label: 'Items in the catalog', min: 100000, max: 10000000000, value: 100000000, log: true },
      { id: 'dims', label: 'Embedding dimensions', min: 32, max: 512, step: 32, value: 128 },
      { id: 'cand', label: 'Candidates sent to the ranker', min: 100, max: 5000, step: 100, value: 1000 },
      { id: 'feats', label: 'Features per candidate', min: 10, max: 1000, value: 200, log: true }
    ],
    outputs: [
      { label: 'Peak feed requests/s (3× average)', f: (v) => v.dau * v.rpu / 86400 * 3 },
      { label: 'Item embeddings in RAM (float32)', fmt: 'bytes', f: (v) => v.items * v.dims * 4 },
      { label: 'Ranking model scores per second', f: (v) => v.dau * v.rpu / 86400 * 3 * v.cand },
      { label: 'Feature values read per second', f: (v) => v.dau * v.rpu / 86400 * 3 * v.cand * v.feats },
      { label: 'Impressions logged per day (20 per request)', f: (v) => v.dau * v.rpu * 20 },
      { label: 'Impression log per day (~200 B each)', fmt: 'bytes', f: (v) => v.dau * v.rpu * 20 * 200 }
    ],
    note: 'Peak factor, 20 items per page and 200 B per impression are <em>estimates</em>. Look at the ranking line: it is the request rate <b>times</b> the candidate count. That multiplication is why the ranker only sees hundreds or thousands of items, never the catalog. Quantizing embeddings (int8, PQ) cuts the ANN RAM 4–30×.'
  },

  api: [
    { m: 'GET', p: '/v1/feed?user_id&surface&cursor', d: 'Returns ~20 items plus a <code>request_id</code>. Every later event refers to it, so outcomes can be joined to what was served.' },
    { m: 'POST', p: '/v1/events', d: '<code>{request_id, item_id, type: impression | click | watch | like | skip, watch_ms, position}</code>. Feeds real-time features and training.' },
    { m: 'GET', p: '/v1/items/{id}/similar', d: 'Item-to-item: ANN search around the item\'s embedding, then filtered and lightly ranked.' },
    { m: 'RPC', p: 'Retrieval.Search(user_vec, k, filters)', d: 'ANN over item embeddings (HNSW / ScaNN / pgvector). One call per candidate source.' },
    { m: 'RPC', p: 'Ranker.Score(user, candidates[], features)', d: 'Batched inference on a model server (GPU). Returns several predicted objectives per item.' }
  ],
  dataModel: [
    { name: 'events', store: 'Kafka → data lake', fields: [['request_id', 'uuid', 'fk'], ['user_id', 'bigint', 'idx'], ['item_id', 'bigint'], ['type', 'enum'], ['watch_ms, position', 'int'], ['ts', 'timestamp', 'sk']], note: 'The labels for training. Position is logged so the model can correct for position bias.' },
    { name: 'online features', store: 'KV (Redis / Bigtable)', fields: [['user:{id} / item:{id}', 'key', 'pk'], ['last_50_items', 'int64[]'], ['category_affinity', 'map'], ['ctr_1h, views_1h', 'float'], ['updated_at', 'ts']], note: 'Written by stream jobs within seconds. The offline store holds the same features as point-in-time history for training.' },
    { name: 'item_embeddings', store: 'ANN index', fields: [['item_id', 'bigint', 'pk'], ['embedding', 'vector(128)', 'idx'], ['model_version', 'text'], ['region, category', 'filters']], note: 'Rebuilt or refreshed whenever the item tower is retrained. Never mix vectors from two model versions.' },
    { name: 'served_log', store: 'Kafka → lake', fields: [['request_id', 'uuid', 'pk'], ['user_id', 'bigint'], ['items, scores', 'arrays'], ['feature_snapshot', 'bytes'], ['model_version', 'text']], note: 'Log the features exactly as served, then train on them: the simplest cure for training-serving skew.' }
  ],

  architecture: {
    title: 'Recommendation funnel with real-time feedback',
    nodes: [
      { id: 'user', label: 'User app', sub: 'home feed · up next', kind: 'client', wide: [90, 60], tall: [210, 0], tip: 'Requests a feed page and streams back impressions, clicks, watch time and skips.' },
      { id: 'feed', label: 'Feed service', sub: 'orchestrates the funnel', kind: 'service', wide: [280, 60], tall: [210, 105], tip: 'Calls each stage under a latency budget, applies filters, logs what was served, and falls back to popular items on timeouts.' },
      { id: 'cg', label: 'Candidate gen', sub: 'two-tower + sources', kind: 'ml', wide: [470, 60], tall: [70, 210], tip: 'Computes the user embedding (user tower) and gathers candidates from several sources: ANN, subscriptions, trending, graph neighbours.' },
      { id: 'ann', label: 'ANN index', sub: 'item embeddings', kind: 'store', wide: [660, 60], tall: [70, 315], tip: 'Approximate nearest-neighbour search over the item tower\'s embeddings: millions of items to a few hundred in milliseconds.' },
      { id: 'rerank', label: 'Re-ranker', sub: 'diversity · rules', kind: 'service', wide: [280, 180], tall: [70, 105], tip: 'Reorders the top results: diversity (MMR), freshness, no repeats, creator caps, exploration slots.' },
      { id: 'rank', label: 'Ranking model', sub: 'multi-task DNN · GPU', kind: 'ml', wide: [470, 180], tall: [210, 210], tip: 'A heavy model with user × item cross features. Predicts several objectives (click, watch time, like, skip) and combines them into one score.' },
      { id: 'fs', label: 'Feature store', sub: 'online KV + offline', kind: 'cache', wide: [470, 300], tall: [350, 210], tip: 'Online: low-latency KV for serving. Offline: point-in-time history for training. Same feature definitions for both.' },
      { id: 'kafka', label: 'Event stream', sub: 'Kafka · impressions', kind: 'queue', wide: [90, 300], tall: [350, 0], tip: 'Every impression and interaction, keyed by request_id.' },
      { id: 'stream', label: 'Stream features', sub: 'Flink · last-N, counts', kind: 'compute', wide: [280, 300], tall: [350, 105], tip: 'Updates real-time features (recent items, category counts, item CTR) within seconds.' },
      { id: 'train', label: 'Training', sub: 'batch or online', kind: 'compute', wide: [660, 300], tall: [350, 315], tip: 'Trains the two-tower and ranking models from logged features and outcomes. Online training (TikTok\'s Monolith) syncs parameters to serving in minutes.' },
      { id: 'reg', label: 'Model registry', sub: 'versions · A/B arms', kind: 'store', wide: [660, 180], tall: [210, 420], tip: 'Versioned models. A/B experiments route a share of users to a candidate model.' }
    ],
    edges: [
      { from: 'user', to: 'feed', bidi: true },
      { from: 'user', to: 'kafka' },
      { from: 'feed', to: 'cg', bidi: true },
      { from: 'cg', to: 'ann', bidi: true },
      { from: 'feed', to: 'rank', bidi: true },
      { from: 'rank', to: 'fs', bidi: true },
      { from: 'feed', to: 'rerank', bidi: true },
      { from: 'kafka', to: 'stream' },
      { from: 'stream', to: 'fs' },
      { from: 'fs', to: 'train' },
      { from: 'train', to: 'reg' },
      { from: 'reg', to: 'ann', dashed: true },
      { from: 'reg', to: 'rank', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'home', title: 'Home feed through the funnel', tone: 'info',
      steps: [
        { text: 'A user opens the app. The feed service starts a <b>~200 ms budget</b> and gives the request an id.', flow: ['user>feed'], badges: { feed: 'budget 200 ms' } },
        { text: '<b>Candidate generation</b>: the user tower turns recent history into a vector, and ANN search returns the nearest items. Other sources (subscriptions, trending) add more.', flow: ['feed>cg', 'cg>ann', 'ann>cg', 'cg>feed'], badges: { ann: '100M → 500', cg: '~1.5K total' } },
        { text: '<b>Filters</b> remove already-watched, blocked and not-licensed-here items. About a thousand candidates remain.', nodes: ['feed'], badges: { feed: '1.5K → 1K' } },
        { text: 'The <b>ranking model</b> scores each candidate with hundreds of user × item features from the feature store, predicting click, watch time and like.', flow: ['feed>rank', 'rank>fs', 'fs>rank', 'rank>feed'], badges: { rank: '1K scored' } },
        { text: 'The <b>re-ranker</b> keeps the best 20 but spreads creators and topics, adds a fresh item and an exploration slot. The page and its request id go back.', flow: ['feed>rerank', 'rerank>feed', 'feed>user'], ok: ['user'], badges: { rerank: '1K → 20' }, tone: 'ok' }
      ]
    },
    {
      id: 'realtime', title: 'Real-time interest update', tone: 'ok',
      steps: [
        { text: 'The user, normally into gaming, watches three cooking videos to the end. Each watch event goes to the stream.', flow: ['user>kafka'], badges: { kafka: '3 × watch' } },
        { text: 'A stream job updates <b>last-N items</b> and <b>category affinity</b> in the online feature store within seconds.', flow: ['kafka>stream', 'stream>fs'], badges: { fs: 'cooking ↑' } },
        { text: 'On the next scroll, the user tower and the ranker read those fresh features. Cooking videos appear without any retraining.', flow: ['user>feed', 'feed>cg', 'cg>ann', 'feed>rank', 'rank>fs'], ok: ['rank'], badges: { user: 'cooking in feed' }, tone: 'ok' },
        { text: '<b>Online training</b> goes further: model parameters update from the stream and sync to serving in minutes. Monolith found shorter sync intervals gave better models.', flow: ['fs>train', 'train>reg', 'reg>rank'], badges: { train: 'minutes, not days' } }
      ]
    },
    {
      id: 'cold', title: 'Cold start: new user, new item', tone: 'warn',
      steps: [
        { text: 'A brand-new user has <b>no history</b>, so collaborative signals are empty.', flow: ['user>feed'], warn: ['cg'], badges: { cg: ['no history', 'warn'] }, tone: 'warn' },
        { text: 'The user tower falls back to <b>context</b> (country, language, device, time) plus onboarding picks. A <b>popular-in-region</b> source fills the rest.', flow: ['feed>cg', 'cg>ann', 'cg>feed'], badges: { cg: 'context + popular' } },
        { text: 'A new video has <b>no interactions</b>. Its item-tower embedding comes from content features (title, topic, creator), so ANN can still find it.', flow: ['reg>ann'], badges: { ann: 'content embedding' } },
        { text: 'An <b>exploration</b> slot shows new items to a small share of matching users. Their reactions flow back and the item warms up within hours.', flow: ['feed>rerank', 'rerank>feed', 'feed>user', 'user>kafka', 'kafka>stream', 'stream>fs'], ok: ['fs'], badges: { rerank: 'explore slot' }, tone: 'ok' }
      ]
    },
    {
      id: 'viral', title: 'Hot spot: a video goes viral', tone: 'warn',
      steps: [
        { text: 'One video is suddenly in a large share of all candidate sets. Its feature-store key is read on almost every ranking call: a <b>hot key</b>.', flow: ['feed>rank', 'rank>fs'], warn: ['fs'], badges: { fs: ['hot key', 'warn'] }, tone: 'warn' },
        { text: 'Fix: replicate hot item features and cache them in the ranker process for a few seconds. Small staleness on a view count is harmless.', nodes: ['rank', 'fs'], ok: ['rank'], badges: { rank: ['local cache 5 s', 'ok'] } },
        { text: 'Traffic peaks push ranking latency up. The feed service <b>shrinks the funnel</b> (fewer candidates to rank) to stay inside the budget.', flow: ['feed>rank'], warn: ['rank'], badges: { rank: ['1K → 400', 'warn'] } },
        { text: 'If ranking still times out, serve a cached <b>popular-for-you</b> list. A slightly worse feed beats an error page.', flow: ['feed>user'], ok: ['user'], badges: { feed: ['fallback', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'skew', title: 'Training-serving skew', tone: 'err',
      steps: [
        { text: 'A new ranking model beats the old one offline. In the A/B test, engagement <b>drops</b>.', flow: ['reg>rank', 'feed>rank'], err: ['rank'], badges: { rank: ['A/B: −2%', 'err'] }, tone: 'err' },
        { text: 'Cause: "watch time last 7 days" is computed in a Spark job (UTC days) for training but in Flink (sliding window) for serving. Same name, <b>different values</b>.', nodes: ['stream', 'fs', 'train'], err: ['fs'], badges: { fs: ['2 definitions', 'err'] } },
        { text: 'Detect it by <b>logging the features as served</b> and comparing their distributions with the training data.', flow: ['rank>fs', 'fs>train'], warn: ['train'], badges: { train: ['drift alert', 'warn'] }, tone: 'warn' },
        { text: 'Fix: one feature definition for both paths, and train on the <b>logged serving features</b>. Roll back the model while you retrain.', flow: ['stream>fs', 'fs>train', 'train>reg', 'reg>rank'], ok: ['rank', 'fs'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Shape the funnel. The engagement and latency numbers are illustrative, but the direction of every trade-off follows the published systems.',
    controls: [
      { id: 'src', label: 'Candidate sources', type: 'seg', value: 'cf', options: [
        { v: 'cf', l: 'Collaborative (two-tower)' }, { v: 'cfc', l: '+ content-based' }, { v: 'all', l: '+ content + trending' }] },
      { id: 'fresh', label: 'Model freshness', type: 'seg', value: 'daily', options: [
        { v: 'daily', l: 'Daily batch' }, { v: 'hourly', l: 'Hourly incremental' }, { v: 'online', l: 'Online training' }] },
      { id: 'cand', label: 'Candidates sent to the ranker', type: 'range', min: 100, max: 5000, step: 100, value: 1000 },
      { id: 'div', label: 'Diversity weight (re-ranker)', type: 'range', min: 0, max: 1, step: 0.05, value: 0.3, kind: 'pct' },
      { id: 'exp', label: 'Exploration share', type: 'range', min: 0, max: 0.2, step: 0.01, value: 0.05, kind: 'pct' }
    ],
    evaluate(s) {
      const ann = 10, feats = 4 + s.cand * 0.008, rank = 8 + s.cand * 0.045, rr = 4 + (s.src === 'all' ? 3 : s.src === 'cfc' ? 2 : 0);
      const p99 = 1.6 * (ann * (s.src === 'cf' ? 1 : 1.2) + feats + rank + rr);
      const recallGain = 0.16 * (1 - Math.exp(-s.cand / 900));
      const srcGain = { cf: 0, cfc: 0.025, all: 0.04 }[s.src];
      const freshGain = { daily: 0, hourly: 0.03, online: 0.055 }[s.fresh];
      const engage = 0.55 + recallGain + srcGain + freshGain - 0.08 * s.div * s.div - 0.6 * s.exp;
      const satisfaction = engage + 0.12 * Math.min(s.div, 0.5) + 0.3 * Math.min(s.exp, 0.08) - (s.div > 0.6 ? 0.1 * (s.div - 0.6) : 0);
      const coverage = Math.min(1, 0.25 + { cf: 0, cfc: 0.15, all: 0.2 }[s.src] + 0.4 * s.div + 2.5 * s.exp);
      const cold = Math.min(1, 0.2 + { cf: 0, cfc: 0.35, all: 0.45 }[s.src] + 2 * s.exp);
      const costU = (s.cand / 1000) * 1 + { daily: 0.3, hourly: 0.45, online: 0.8 }[s.fresh] + { cf: 0, cfc: 0.1, all: 0.15 }[s.src]; // extra sources = extra retrieval calls
      const metrics = [
        { k: 'Feed latency p99', v: '≈ ' + Math.round(p99) + ' ms', s: clamp01(1 - p99 / 400), hint: 'budget ~200 ms' },
        { k: 'Short-term engagement', v: idx(engage), s: clamp01((engage - 0.45) / 0.35) },
        { k: 'Long-term satisfaction', v: idx(satisfaction), s: clamp01((satisfaction - 0.45) / 0.4) },
        { k: 'Model freshness lag', v: { daily: '~1 day', hourly: '~1 hour', online: 'minutes' }[s.fresh], s: { daily: 0.3, hourly: 0.65, online: 0.95 }[s.fresh] },
        { k: 'Catalog coverage', v: Math.round(coverage * 100) + '% of items ever shown', s: coverage },
        { k: 'Cold-start handling', v: cold > 0.7 ? 'good' : cold > 0.45 ? 'fair' : 'poor', s: cold },
        { k: 'Serving + training cost', v: costU.toFixed(1) + '× baseline', s: clamp01(1 - (costU - 0.4) / 5) }
      ];
      const notes = [];
      if (s.cand >= 3000) notes.push('Ranking cost grows linearly with candidates, while recall flattens out. Past a few thousand, you mostly buy latency.');
      if (s.cand <= 300) notes.push('A tiny funnel misses good items the first stage ranked a bit low. The ranker can only reorder what it is given.');
      if (s.src === 'cf') notes.push('Collaborative signals alone cannot find new items or serve new users. Add content-based and popular sources.');
      if (s.fresh === 'online') notes.push('Online training (as in ByteDance\'s Monolith) updates parameters from the event stream and syncs them to serving. It costs more infrastructure and needs guards against bad data spikes.');
      if (s.div >= 0.7) notes.push('Heavy diversity pushes weaker items into the top slots. Users notice less relevant feeds.');
      if (s.div === 0) notes.push('No diversity: the top 20 can be 20 near-identical videos from one creator.');
      if (s.exp >= 0.12) notes.push('Exploration has a short-term cost on every exposed impression. Keep it small and targeted.');
      if (s.exp === 0) notes.push('Without exploration, the model only learns about items it already shows: a feedback loop that starves new items.');
      let verdict;
      if (p99 > 250) verdict = '❌ <b>Over the latency budget.</b> Send fewer candidates to the ranker or use a lighter pre-ranking stage.';
      else if (s.exp === 0 && s.src === 'cf') verdict = '⚠ <b>A closed feedback loop.</b> New items and new users get almost nothing. Add content sources and some exploration.';
      else if (s.div >= 0.7 || s.exp >= 0.15) verdict = '⚠ <b>Too much medicine.</b> Diversity and exploration are now costing more engagement than they return.';
      else if (s.src === 'all' && s.fresh === 'online' && s.cand >= 500 && s.cand <= 2000 && s.div > 0 && s.exp > 0) verdict = '✅ <b>Close to modern practice:</b> several candidate sources, a mid-sized funnel, real-time model updates, plus diversity and exploration.';
      else if (s.fresh === 'daily') verdict = '👍 <b>Works, but the model is a day behind the user.</b> Real-time features help; online or hourly training helps more.';
      else verdict = '👍 <b>Reasonable.</b> Check the meters to see what you are trading between latency, engagement and coverage.';
      return {
        metrics, verdict, notes,
        labels: {
          cg: { label: 'Candidate gen', sub: { cf: 'two-tower ANN', cfc: 'two-tower + content', all: 'ANN · content · trending' }[s.src] },
          rank: { label: 'Ranking model', sub: SD.fmt.num(s.cand) + ' items / request' },
          train: { label: 'Training', sub: { daily: 'daily batch', hourly: 'hourly incremental', online: 'online · minutes' }[s.fresh] },
          rerank: { label: 'Re-ranker', sub: 'div ' + Math.round(s.div * 100) + '% · explore ' + Math.round(s.exp * 100) + '%' }
        },
        flow: ['user>feed', 'feed>cg', 'cg>ann', 'feed>rank', 'rank>fs', 'feed>rerank', 'feed>user'].concat(s.fresh === 'online' ? ['user>kafka', 'kafka>stream', 'stream>fs', 'fs>train', 'train>reg', 'reg>rank'] : []),
        hot: s.fresh === 'online' ? ['train'] : [],
        warn: p99 > 250 ? ['rank'] : [],
        badges: { rank: ['p99 ≈ ' + Math.round(p99) + ' ms', p99 > 250 ? 'err' : 'info'] }
      };
      function idx(x) { return Math.round(x * 100) + ' (index)'; }
      function clamp01(x) { return Math.max(0.03, Math.min(1, x)); }
    }
  },

  widget: {
    title: 'The funnel, live: retrieve → filter → rank → diversify',
    caption: 'A 5,000-item catalog with real 8-d embeddings in six topics. Candidate generation is an exact dot-product top-K (what ANN approximates), ranking adds popularity and freshness, and the re-ranker runs real <b>MMR</b>. Drag the funnel size and diversity, or <b>watch a cooking video</b> to shift the user vector and see the feed change. Stage latencies are illustrative.'
  },

  realWorld: {
    intro: 'The big platforms published remarkably similar designs: a funnel of models, embeddings for retrieval, and a push toward real-time updates.',
    timeline: [
      { when: '2015', who: 'Netflix', title: 'The business value of recommendations', text: 'Gomez-Uribe and Hunt write that the recommender influences choice for about <b>80% of hours streamed</b>, with the rest coming from search, and that the homepage is where most viewing is discovered.', src: 0 },
      { when: '2016', who: 'YouTube', title: 'Deep neural networks for recommendations', text: 'A two-stage design: a deep <b>candidate generation</b> model winnows the corpus to <b>hundreds</b> of videos, then a separate deep <b>ranking</b> model scores each impression, which also lets it combine candidate sources whose scores are not comparable. The ranker predicts <b>expected watch time</b>, not click probability.', src: 1 },
      { when: '2018', who: 'Pinterest', title: 'PinSage', text: 'A graph convolutional network that uses random walks to pick neighbours. Trained on <b>7.5 billion examples</b> over a graph with <b>3 billion nodes and 18 billion edges</b>, with embeddings generated by a MapReduce inference job.', src: 2 },
      { when: '2019', who: 'Google', title: 'Sampling-bias-corrected two-tower', text: 'Two-tower retrieval trained with in-batch negatives over-penalizes popular items. Yi et al. estimate item frequency from <b>streaming data</b> and correct the logits by the log sampling probability.', src: 3 },
      { when: '2022', who: 'ByteDance', title: 'Monolith: real-time training', text: 'A <b>collisionless embedding table</b> (cuckoo hashmap) with expiring embeddings and frequency filtering, plus real-time parameter sync between training and serving. Shorter sync intervals gave better models.', src: 4 }
    ],
    lessons: [
      'Use a <b>funnel</b>: cheap models on many items, expensive models on few.',
      'Embeddings make retrieval a <b>nearest-neighbour search</b>, so the ANN index is part of the model.',
      'Freshness wins: <b>real-time features</b> first, then faster model updates.',
      'Log what you served (items, positions, features) or you cannot train or evaluate honestly.'
    ],
    sources: [
      { title: 'The Netflix Recommender System: Algorithms, Business Value, and Innovation', url: 'https://doi.org/10.1145/2843948', pub: 'ACM TMIS 6(4), Dec 2015 (DOI)' },
      { title: 'Deep Neural Networks for YouTube Recommendations', url: 'https://research.google/pubs/pub45530', pub: 'RecSys 2016' },
      { title: 'PinSage: a new graph convolutional neural network for web-scale recommender systems', url: 'https://medium.com/pinterest-engineering/pinsage-a-new-graph-convolutional-neural-network-for-web-scale-recommender-systems-88795a107f48', pub: 'Pinterest Engineering, 2018' },
      { title: 'Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations', url: 'https://research.google/pubs/pub48840/', pub: 'RecSys 2019' },
      { title: 'Monolith: Real Time Recommendation System With Collisionless Embedding Table', url: 'https://arxiv.org/abs/2209.07663', pub: 'arXiv, 2022' },
      { title: 'Graph Convolutional Neural Networks for Web-Scale Recommender Systems', url: 'https://arxiv.org/abs/1806.01973', pub: 'KDD 2018' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Retrieval model', '<b>Two-tower</b>: item vectors precomputed, ANN-friendly', '<b>Cross features</b>: far more accurate, no precompute', 'Two-tower for candidates; cross features only in the ranker'],
      ['Funnel size', '<b>Small</b> (hundreds): fast, cheap', '<b>Large</b> (thousands): better recall, slower ranking', 'Grow until recall gains flatten; add a light pre-ranker if needed'],
      ['Model updates', '<b>Daily batch</b>: simple, reproducible', '<b>Online training</b>: minutes behind the user', 'Online for fast-moving catalogs (short video, news)'],
      ['Objective', '<b>Clicks</b>: easy, plentiful', '<b>Watch time / satisfaction</b>: harder, better long-term', 'Multi-task: predict several, combine with tuned weights'],
      ['Exploration', '<b>None</b>: best short-term metrics', '<b>Some %</b>: learns about new items', 'Always a little, targeted at likely-interested users'],
      ['ANN index', '<b>pgvector / single node</b>: simple', '<b>Sharded ANN</b> (ScaNN, FAISS, Milvus)', 'Single node to tens of millions of items; shard beyond']
    ]
  },
  failures: [
    { f: 'Training-serving skew', detect: 'Feature distribution checks; offline wins, online losses', fix: 'One feature definition; train on logged serving features.' },
    { f: 'Feedback loop / filter bubble', detect: 'Falling catalog coverage and diversity', fix: 'Exploration slots, diversity in re-ranking, debias training data.' },
    { f: 'Ranker timeout at peak', detect: 'Stage latency p99 vs budget', fix: 'Shrink the funnel dynamically; fall back to cached popular feed.' },
    { f: 'Hot item key', detect: 'Per-key QPS in the feature store', fix: 'Replicate and cache hot item features in-process for seconds.' },
    { f: 'Embedding version mismatch', detect: 'Recall drop after a deploy', fix: 'Version user and item towers together; rebuild the index before switching.' },
    { f: 'Bad data spike poisons online model', detect: 'Online metric guardrails, sudden weight changes', fix: 'Validate streams, rate-limit updates, keep a rollback snapshot.' },
    { f: 'Position bias in labels', detect: 'CTR strongly tied to slot', fix: 'Log position; add it as a training-only feature or use inverse propensity weights.' }
  ],

  interview: [
    { q: 'Why a multi-stage funnel instead of one model?', a: '<p>Cost. A strong ranking model with cross features may cost tens of microseconds per item. Scoring a 100M-item catalog per request is impossible. Each stage cuts the item count by orders of magnitude so the next, more expensive model can afford to look: <b>millions → thousands → hundreds → tens</b>.</p>', lvl: 'core' },
    { q: 'Two-tower model vs a model with user × item cross features?', a: '<p>A <b>two-tower</b> model encodes user and item separately, so all item vectors can be precomputed and searched with ANN. Fast, but the only interaction is a dot product.</p><p>A <b>cross-feature</b> model sees user and item together (e.g. "user watched this creator before") and is much more accurate, but must run per (user, item) pair. So: two-tower to retrieve, cross features to rank.</p>', lvl: 'core' },
    { q: 'How do you handle cold start?', a: '<ul><li><b>New users</b>: context features (country, language, device, time), onboarding choices, popular-in-segment sources, then fast real-time features as soon as they act.</li><li><b>New items</b>: content-based embeddings from metadata, text or frames, so the item tower can place them; plus a small exploration budget.</li></ul>', lvl: 'core' },
    { q: 'What is training-serving skew and how do you prevent it?', a: '<p>The model sees different feature values in production than in training: different code paths, time windows, timezones, or missing values handled differently. Offline metrics look great and online metrics drop.</p><p>Prevent it with one feature definition used by both paths, point-in-time correct training data, and by <b>logging features at serving time</b> and training on those logs.</p>', lvl: 'core' },
    { q: 'Offline vs online evaluation?', a: '<p><b>Offline</b> (recall@k, NDCG, AUC on logged data) is cheap and fast but biased: you only have labels for items you showed. <b>Online</b> A/B tests measure real outcomes (watch time, retention) but are slow and expensive.</p><p>Use offline metrics to filter candidates and A/B tests to decide, with guardrail metrics and long enough runs to see novelty effects fade.</p>', lvl: 'core' },
    { q: 'Why does a two-tower model need sampling-bias correction?', a: '<p>Training with <b>in-batch negatives</b> uses other items in the batch as negatives. Popular items appear in batches far more often, so they are over-penalized. Yi et al. (2019) subtract the <b>log of each item\'s sampling probability</b> from its logit, estimating that probability from streaming data.</p>', lvl: 'deep' },
    { q: 'How do you add diversity without hurting relevance too much?', a: '<p>Re-rank the top results with <b>maximal marginal relevance</b>: repeatedly pick the item maximizing <code>λ·relevance − (1 − λ)·max similarity to items already picked</code>. Add hard rules too (max 2 per creator). Tune λ with A/B tests on long-term metrics, not just clicks.</p>', lvl: 'core' },
    { q: 'How does the feed react to what I did a minute ago?', a: '<p>Interaction events stream through Kafka into a stream processor that updates online features (last-N items, topic affinities) within seconds. The next request\'s user tower and ranker read them. Online training (Monolith) also updates model weights within minutes.</p>', lvl: 'core' },
    { q: 'What objective should the ranker optimize?', a: '<p>Clicks alone reward clickbait. Production rankers are usually <b>multi-task</b>: predict click, watch time, like, share and skip, then combine them with tuned weights.</p><p>YouTube\'s 2016 ranker is a neat trick: a <b>weighted logistic regression</b> where clicked impressions are weighted by their watch time and unclicked ones by 1. The learned odds then approximate <b>expected watch time</b>, so serving uses <code>e<sup>x</sup></code> as the final activation and sorts by it.</p>', lvl: 'deep' },
    { q: 'What is position bias and why does it matter?', a: '<p>Items in the top slots get clicked more just because they are on top. If you train on raw clicks, the model learns "whatever we showed first is good" and reinforces itself.</p><p>Log the position, use it as a feature during training (set to a constant at serving), or weight examples by inverse propensity.</p>', lvl: 'deep' },
    { q: 'How would you scale the ANN index to billions of items?', a: '<p>Quantize vectors (int8, product quantization), shard the index by item id range or cluster, query shards in parallel and merge the top-k. Keep a hot index for recent items and rebuild the full index whenever the item tower changes. pgvector is fine to tens of millions; beyond that use a dedicated vector system.</p>', lvl: 'deep' },
    { q: 'How do you avoid showing items the user has already seen?', a: '<p>Keep a per-user <b>seen set</b> in the online store and filter candidates against it before ranking. Exact sets get big for heavy users, so many feeds use a per-user <b>Bloom filter</b>: no false negatives (a seen item is always caught) and a small, tunable false-positive rate (an unseen item is occasionally skipped, which is harmless).</p><p>Decide what "seen" means per surface: an impression that scrolled past is not the same as a finished watch. Expire old entries so evergreen items can come back.</p>', fu: 'Why not filter after ranking? (You waste ranker capacity on items you will drop, and the page can come up short.)', lvl: 'core' },
    { q: 'How do you run A/B tests on a recommender safely?', a: '<p>Randomize by user, not by request. Run long enough for novelty effects to fade, watch guardrails (latency, crash rate, creator-side metrics), and remember that recommenders interact: a model that changes what is shown also changes tomorrow\'s training data.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Python (PyTorch): two-tower with logQ correction', lang: 'python',
      code: `import torch, torch.nn as nn, torch.nn.functional as F

class Tower(nn.Module):
    def __init__(self, n_ids: int, n_feats: int, dim: int = 64):
        super().__init__()
        self.emb = nn.Embedding(n_ids, dim)
        self.mlp = nn.Sequential(nn.Linear(dim + n_feats, 256), nn.ReLU(), nn.Linear(256, dim))
    def forward(self, ids, feats):
        return F.normalize(self.mlp(torch.cat([self.emb(ids), feats], -1)), dim=-1)

class FreqEstimator:
    """Yi et al. 2019: estimate how many steps pass between sightings of an item."""
    def __init__(self, size: int = 2**20, alpha: float = 0.01):
        self.A = torch.zeros(size)            # last step the hashed item was seen
        self.B = torch.full((size,), 100.0)   # estimated steps between sightings
        self.size, self.alpha = size, alpha
    def update(self, step: int, item_ids):
        h = item_ids % self.size
        self.B[h] = (1 - self.alpha) * self.B[h] + self.alpha * (step - self.A[h])
        self.A[h] = float(step)
    def log_q(self, item_ids):                # log sampling probability ≈ log(1 / B)
        return -torch.log(self.B[item_ids % self.size].clamp(min=1.0))

def two_tower_loss(user_t, item_t, u_ids, u_feats, i_ids, i_feats, log_q, temp=0.05):
    u, v = user_t(u_ids, u_feats), item_t(i_ids, i_feats)        # [B, d] each
    logits = u @ v.T / temp                                       # in-batch negatives
    logits = logits - log_q.to(logits.device).unsqueeze(0)        # correct popularity bias
    return F.cross_entropy(logits, torch.arange(len(u), device=u.device))`,
      note: 'Rows are (user, item they engaged with). After training, run the item tower over the whole catalog and load the vectors into the ANN index; serve the user tower online.'
    },
    {
      title: 'SQL (pgvector): candidate retrieval with filters', lang: 'sql',
      code: `CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE item_embeddings (
  item_id       bigint PRIMARY KEY,
  category      text   NOT NULL,
  regions       text[] NOT NULL,
  model_version text   NOT NULL,
  embedding     vector(64) NOT NULL          -- L2-normalized item-tower output
);
CREATE INDEX item_emb_hnsw ON item_embeddings USING hnsw (embedding vector_ip_ops);

-- top 500 candidates for one user; <#> is the NEGATIVE inner product
SET hnsw.ef_search = 200;
SET hnsw.iterative_scan = relaxed_order;   -- pgvector 0.8+: keep going when filters drop rows

SELECT e.item_id, -(e.embedding <#> $1) AS score
FROM item_embeddings e
WHERE e.model_version = $2
  AND e.regions @> ARRAY[$3]
  AND NOT EXISTS (SELECT 1 FROM watched w WHERE w.user_id = $4 AND w.item_id = e.item_id)
ORDER BY e.embedding <#> $1
LIMIT 500;`,
      note: '<code>$1</code> is the user-tower vector. With normalized vectors, inner product equals cosine similarity. Past tens of millions of items, move to a sharded vector system.'
    },
    {
      title: 'Spring Boot: feed endpoint with a latency budget and fallback', lang: 'java',
      code: `@RestController
@RequestMapping("/v1/feed")
public class FeedController {
  private final CandidateService candidates;   // ANN + other sources
  private final FeatureStore features;         // online KV, batched reads
  private final RankerClient ranker;           // async call to the model server
  private final ReRanker reRanker;             // MMR + business rules
  private final ServedLog servedLog;           // Kafka producer
  private final PopularFeed popular;           // precomputed fallback

  public FeedController(CandidateService c, FeatureStore f, RankerClient r,
                        ReRanker rr, ServedLog log, PopularFeed p) {
    candidates = c; features = f; ranker = r; reRanker = rr; servedLog = log; popular = p;
  }

  @GetMapping
  public FeedPage feed(@RequestParam long userId, @RequestParam(defaultValue = "20") int size) {
    String requestId = UUID.randomUUID().toString();
    try {
      List<Long> cands = candidates.retrieve(userId, 1_000);            // ~1K items
      FeatureBatch feats = features.fetch(userId, cands);
      List<Scored> ranked = ranker.score(userId, feats)                  // CompletableFuture
          .orTimeout(80, TimeUnit.MILLISECONDS)
          .join();
      List<Scored> page = reRanker.diversify(ranked, size, 0.7);        // λ = 0.7
      servedLog.send(requestId, userId, page, feats);                    // log what was served
      return new FeedPage(requestId, page, false);
    } catch (CompletionException e) {                                    // timeout or ranker error
      return new FeedPage(requestId, popular.forUser(userId, size), true);
    }
  }
}`,
      note: '<code>orTimeout</code> completes the future exceptionally, so <code>join()</code> throws a <code>CompletionException</code> and the user still gets a page. Mark fallback pages so they are excluded from training data.'
    }
  ],

  related: ['vector-db', 'newsfeed', 'search-engine', 'stream-analytics', 'rag-agent-platform', 'video-streaming']
});
