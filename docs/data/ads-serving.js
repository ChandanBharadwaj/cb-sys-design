SD.register({
  slug: 'ads-serving',
  domain: 8,
  title: 'Ads Serving: Targeting, Pacing & Auction',
  examples: 'Google Ads, Meta Ads, Amazon Ads',
  tagline: 'For every page view, find the few ads that may show, predict how likely each one is to be clicked, run an <b>auction</b> and charge a fair price, all in <b>tens of milliseconds</b>. Meanwhile, spread each advertiser\'s budget evenly across the day.',
  tldr: {
    problem: 'Millions of campaigns, each with targeting rules, a bid and a daily budget. Every ad request needs a winner within a tight deadline. The winner must be the ad that is <b>worth most</b> (not simply the highest bid), the price must be fair, and no campaign may <b>spend its whole budget by breakfast</b> or go far over it.',
    idea: 'A funnel: <b>boolean-expression inverted index</b> over targeting → cheap <b>filters</b> (budget, pacing, frequency cap, policy) → <b>pCTR / pCVR models</b> → rank by <b>expected value = bid × pCTR × quality</b> → <b>auction</b> (GSP, VCG or first price, with reserve). A separate <b>pacing service</b> watches live spend against a target curve and sets each campaign\'s participation probability or bid multiplier every few seconds.',
    insight: 'The serving path never does a strongly consistent budget check. Spend is <b>counted asynchronously</b> and pacing is a <b>feedback controller</b>, so overspend is <i>bounded</i> (by feedback delay, or by pre-allocated <b>budget leases</b>) instead of prevented with a global lock.',
    numbers: [
      { v: '~100 ms', l: 'a whole RTB transaction, from page visit to ad (Google, 2014)' },
      { v: '10 s', l: 'how often Twitter\'s pacing service recomputes every campaign (2021)' },
      { v: '2×', l: 'max a Google Ads campaign may spend on one day vs its average daily budget' }
    ]
  },

  intro: {
    what: 'An ads serving system decides <b>which ad to show</b> each time a page, feed or app has an empty ad slot. It picks from millions of advertisers\' ads, runs a quick <b>auction</b> to set the price, and makes sure each advertiser\'s money lasts the whole day.',
    analogy: {
      icon: '🔨',
      title: 'A very fast auction house with a strict accountant',
      text: 'Picture an auctioneer who sells one billboard view at a time, thousands of times a second. Bidders left sealed instructions in advance: "only show me to cyclists in Pune, pay up to ₹20". The auctioneer picks the bid most likely to pay off, not just the biggest number. An accountant at the back hands each bidder their day\'s money in small portions, so nobody spends it all in the first hour. One difference from a real auction house: bidders are not in the room. Their rules and models bid for them.'
    },
    problem: 'A shoe brand sets a $500 daily budget and targets "runners in Mumbai". If every eligible request gets the ad, the budget is gone by 10 a.m. and the evening, when runners shop, gets nothing. If the server checks one shared budget row on every request, that row becomes the bottleneck for every ad server. <b>How do you pick the best ad and a fair price in a few milliseconds, and spend each budget smoothly across the day without a global lock?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Highest bid wins, serve until the money runs out',
        text: 'The ad server scans all campaigns that match the request, picks the <b>highest bid</b>, and charges it. It also subtracts the price from the campaign\'s budget row in the database. When the row reaches zero, the campaign stops. Simple and correct for a handful of advertisers.',
        scene: {
          nodes: [
            { id: 'usr', label: 'User', sub: 'opens a page', kind: 'client', at: [70, 0] },
            { id: 'srv', label: 'Ad server', sub: 'max(bid)', kind: 'service', at: [210, 0] },
            { id: 'db', label: 'Campaign DB', sub: 'budget -= price', kind: 'store', at: [350, 0] }
          ],
          edges: [{ from: 'usr', to: 'srv', bidi: true }, { from: 'srv', to: 'db' }],
          flow: ['usr>srv', 'srv>db', 'srv>usr']
        }
      },
      {
        stage: 'breaks',
        title: 'Bad ads win, budgets die early, one row is hot',
        text: 'A high bid on an ad nobody clicks <b>wins and earns nothing</b>. Every popular campaign\'s budget row is updated thousands of times a second from every server, so it becomes a <b>hot lock</b>. And with no pacing, morning traffic eats the whole budget, so the campaign is <b>dark all evening</b>.',
        scene: {
          nodes: [
            { id: 'usr', label: 'Users ×1M/s', sub: 'peak traffic', kind: 'client', at: [70, 0] },
            { id: 'srv', label: 'Ad servers', sub: 'max(bid)', kind: 'service', at: [210, 0] },
            { id: 'db', label: 'Campaign DB', sub: 'hot budget rows', kind: 'store', at: [350, 0] },
            { id: 'eve', label: 'Evening', sub: 'no ads to show', kind: 'client', at: [210, 110] }
          ],
          edges: [{ from: 'usr', to: 'srv' }, { from: 'srv', to: 'db' }, { from: 'srv', to: 'eve' }],
          flow: [['usr>srv', 'usr>srv'], ['srv>db', 'srv>db'], 'srv>eve'],
          err: ['db'],
          warn: ['eve'],
          badges: { db: ['lock waits', 'err'], eve: ['budget gone 10am', 'warn'], srv: ['low-CTR ad wins', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Index, predict, auction, and pace with feedback',
        text: 'An <b>inverted index</b> over targeting rules finds the few hundred ads that match. A model predicts each ad\'s <b>click chance</b>, and the auction ranks by <b>bid × click chance</b>. Spend is counted <b>in the background</b>, and a pacing service tells servers how often each campaign may take part, so budgets last until midnight.',
        scene: {
          nodes: [
            { id: 'usr', label: 'User', sub: 'opens a page', kind: 'client', at: [70, 0] },
            { id: 'srv', label: 'Ad server', sub: 'index→model→auction', kind: 'service', at: [210, 0] },
            { id: 'idx', label: 'Target index', sub: '~500 matches', kind: 'cache', at: [350, 0] },
            { id: 'log', label: 'Event log', sub: 'impressions', kind: 'queue', at: [70, 110] },
            { id: 'cnt', label: 'Spend counter', sub: 'async totals', kind: 'cache', at: [210, 110] },
            { id: 'pace', label: 'Pacing', sub: 'p = 0.4 now', kind: 'compute', at: [350, 110] }
          ],
          edges: [{ from: 'usr', to: 'srv', bidi: true }, { from: 'srv', to: 'idx' }, { from: 'srv', to: 'log' }, { from: 'log', to: 'cnt' }, { from: 'cnt', to: 'pace' }, { from: 'pace', to: 'srv' }],
          flow: ['usr>srv', 'srv>idx', 'srv>usr', 'srv>log', 'log>cnt', 'cnt>pace', 'pace>srv'],
          ok: ['srv', 'pace'],
          badges: { pace: ['lasts all day', 'ok'] }
        }
      }
    ],
    usedBy: ['Google Ads', 'Meta Ads', 'Amazon Ads', 'LinkedIn Ads', 'X (Twitter) Ads', 'Pinterest Ads'],
    whenToUse: [
      'Many advertisers compete for the <b>same slot</b> and you need a price-setting rule',
      'Campaigns have <b>budgets and targeting</b> that must be honoured per request',
      'Ad choice must happen <b>inline</b> on a page or feed load, in tens of milliseconds'
    ],
    whenNot: [
      'Counting clicks for billing after the ad is shown: see <a href="ad-click-aggregation.html">Ad Click Aggregation</a>',
      'Ranking organic content with no bids or budgets: see <a href="recommendation.html">Recommendation System</a>',
      'A few direct-sold sponsorships with fixed placements: a simple schedule table is enough'
    ],
    glossary: [
      { term: 'Campaign / ad group / creative', def: 'The advertiser\'s hierarchy: budget and dates on the campaign, bid and targeting on the ad group, the actual image or text on the creative.' },
      { term: 'pCTR', def: 'Predicted click-through rate: the model\'s probability that this user clicks this ad in this slot.' },
      { term: 'eCPM', def: 'Expected revenue per 1,000 impressions, e.g. bid per click × pCTR × 1,000. The common currency for ranking ads that bid in different ways.' },
      { term: 'GSP auction', def: 'Generalized second price: ads ranked by score, each pays just enough to keep its position above the next ad.' },
      { term: 'Reserve price', def: 'The minimum score or price an ad must clear to be shown at all.' },
      { term: 'Pacing', def: 'Spreading a campaign\'s budget over the day by skipping some auctions or lowering its bid.' },
      { term: 'Frequency cap', def: 'A limit such as "at most 3 impressions per user per day" for one campaign.' },
      { term: 'RTB / OpenRTB', def: 'Real-time bidding: an exchange asks outside bidders for a price on each impression, using the OpenRTB message format.' }
    ]
  },

  requirements: {
    functional: [
      'Advertisers create campaigns → ad groups → creatives with budgets, bids and targeting',
      'For each ad request, return 1–N eligible ads for the slot(s)',
      'Rank by expected value and price via an auction with reserve prices',
      'Enforce daily / lifetime budgets with smooth pacing',
      'Enforce frequency caps, brand-safety and policy rules',
      'Log impressions and clicks for billing, reporting and model training'
    ],
    nonFunctional: [
      'p99 ≲ 50–100 ms per request end to end (RTB deadline is set by the exchange)',
      'Peak hundreds of thousands to millions of requests/s, globally',
      'Overspend bounded (e.g. ≤ 1–2% of budget) without a global lock',
      'Targeting and budget edits take effect within seconds to minutes',
      'Degrade gracefully: show a cheaper ranking or no ad, never block the page',
      'Billing-grade event accuracy downstream (exactly-once counting)'
    ],
    outOfScope: ['Click counting and billing pipeline (see Ad Click Aggregation)', 'Advertiser UI and creative review workflow', 'Model training infrastructure', 'Attribution of conversions across devices']
  },

  calculator: {
    inputs: [
      { id: 'req', label: 'Ad requests per day', min: 1e8, max: 5e10, value: 5e9, log: true },
      { id: 'peak', label: 'Peak-to-average ratio', min: 1, max: 5, step: 0.5, value: 2.5, unit: '×' },
      { id: 'cand', label: 'Candidates scored by the model per request', min: 50, max: 5000, value: 500, log: true },
      { id: 'us', label: 'Model cost per candidate (CPU)', min: 2, max: 200, value: 20, unit: 'µs', log: true },
      { id: 'fill', label: 'Fill rate (requests that show an ad)', min: 10, max: 100, value: 80, unit: '%' },
      { id: 'evb', label: 'Bytes per impression event', min: 100, max: 2000, step: 50, value: 500, fmt: 'bytes' }
    ],
    outputs: [
      { label: 'Peak ad requests / second', f: (v) => v.req / 86400 * v.peak },
      { label: 'pCTR predictions / second (peak)', f: (v) => v.req / 86400 * v.peak * v.cand },
      { label: 'CPU cores just for scoring (peak)', f: (v) => v.req / 86400 * v.peak * v.cand * v.us / 1e6 },
      { label: 'Impressions per day', f: (v) => v.req * v.fill / 100 },
      { label: 'Impression log per day', fmt: 'bytes', f: (v) => v.req * v.fill / 100 * v.evb },
      { label: 'Spend + frequency counter updates / s (peak)', f: (v) => v.req / 86400 * v.peak * v.fill / 100 * 2 }
    ],
    note: 'All inputs are <em>estimates</em> for a large platform. The scoring line is why the funnel exists: scoring every one of millions of ads per request would need orders of magnitude more CPU, so retrieval and filters cut the set to hundreds before the model runs. Counter updates assume one spend and one frequency increment per impression, batched in practice.'
  },

  api: [
    { m: 'RPC', p: 'AdServer.GetAds(slot, user, context)', d: 'Called by the page, feed or SSP with slot size, placement, user id and context. Returns ranked ads with a <b>signed impression id</b> and tracking URLs. Hard deadline, e.g. 60 ms.' },
    { m: 'GET', p: '/imp?iid=…&sig=…', d: 'Impression beacon fired when the ad actually renders. Increments the frequency cap and (for CPM campaigns) spend.' },
    { m: 'GET', p: '/click?iid=…&sig=… → 302', d: 'Redirects to the landing page and logs the click with the impression id, so <a href="ad-click-aggregation.html">aggregation</a> can dedupe it.' },
    { m: 'POST', p: 'openrtb/bid (OpenRTB 2.6 BidRequest)', d: 'External integration: an exchange sends <code>imp</code>, <code>site/app</code>, <code>device</code>, <code>user</code> and <code>tmax</code>. A bidder replies with a BidResponse (price, creative) or HTTP 204 for no bid.' },
    { m: 'PUT', p: '/v1/adgroups/{id}', d: 'Advertiser edits bid, targeting or creative. Written to the campaign DB, then streamed to the serving index within seconds.' },
    { m: 'GET', p: '/v1/campaigns/{id}/delivery', d: 'Spend today, pacing rate, impressions and the target curve, for the advertiser dashboard.' }
  ],
  dataModel: [
    { name: 'campaign', store: 'Sharded SQL (source of truth)', fields: [['campaign_id', 'int64', 'pk'], ['advertiser_id', 'int64', 'idx'], ['daily_budget_micros', 'int64'], ['start, end', 'date'], ['pacing', 'enum std|accel'], ['status', 'enum']], note: 'Money in integer micros, never floats.' },
    { name: 'ad_group', store: 'Sharded SQL', fields: [['ad_group_id', 'int64', 'pk'], ['campaign_id', 'int64', 'fk'], ['bid_type', 'enum CPC|CPM|tCPA'], ['max_bid_micros', 'int64'], ['targeting', 'boolean expr (DNF)'], ['freq_cap', 'n per period']], note: 'Targeting is compiled into the in-memory boolean-expression index on every serving host.' },
    { name: 'creative', store: 'Sharded SQL + CDN', fields: [['creative_id', 'int64', 'pk'], ['ad_group_id', 'int64', 'fk'], ['format', 'enum'], ['policy_status', 'enum', 'idx'], ['landing_url', 'text']], note: 'Only <code>APPROVED</code> creatives reach the index.' },
    { name: 'live counters', store: 'In-memory / Redis-like', fields: [['spend:{campaign}:{day}', 'int64 micros', 'pk'], ['freq:{user}:{ad_group}', 'int + TTL', 'pk'], ['pace:{campaign}', 'p or bid multiplier']], note: 'Fast, approximate, rebuilt from the event log. Billing uses the exactly-once pipeline instead.' }
  ],

  architecture: {
    title: 'Ads serving architecture',
    nodes: [
      { id: 'cli', label: 'Page / app / SSP', sub: 'empty ad slot', kind: 'client', wide: [90, 210], tall: [70, 0], tip: 'A web page, feed, app or supply-side platform asks for an ad, with slot size, placement, user and context.' },
      { id: 'adx', label: 'Ad server', sub: 'orchestrates, ≤ 60 ms', kind: 'edge', wide: [280, 210], tall: [70, 105], tip: 'Stateless front: parses the request, enriches it with user features, runs the funnel under a deadline and returns ads with signed impression ids.' },
      { id: 'rtb', label: 'RTB bidders', sub: 'OpenRTB · tmax', kind: 'external', wide: [280, 315], tall: [350, 0], tip: 'Optional: external demand bids through an exchange using OpenRTB. Bids that miss tmax are dropped.' },
      { id: 'cdb', label: 'Campaign DB', sub: 'budgets, bids, rules', kind: 'store', wide: [470, 0], tall: [210, 0], tip: 'Source of truth for campaigns, ad groups and creatives. Changes stream to the serving index.' },
      { id: 'tgt', label: 'Targeting index', sub: 'boolean-expr inverted', kind: 'cache', wide: [470, 105], tall: [210, 105], tip: 'In-memory inverted index over targeting attributes (geo, age, interest, device, keyword). Matches DNF expressions and returns a few hundred to a few thousand candidates.' },
      { id: 'flt', label: 'Filters', sub: 'budget · cap · policy', kind: 'service', wide: [660, 105], tall: [210, 210], tip: 'Drops candidates with no budget left, that lose the pacing coin flip, that hit a frequency cap, or that fail brand-safety / policy rules for this page.' },
      { id: 'freq', label: 'Freq-cap store', sub: 'user × ad group counts', kind: 'cache', wide: [850, 0], tall: [350, 105], tip: 'Fast key-value counters with TTLs. One batched multi-get per request.' },
      { id: 'ml', label: 'pCTR / pCVR', sub: 'model server', kind: 'ml', wide: [850, 105], tall: [210, 315], tip: 'Predicts click and conversion probabilities for each surviving candidate. Must be calibrated, because prices depend on the probability itself.' },
      { id: 'auc', label: 'Auction', sub: 'rank eCPM · GSP', kind: 'compute', wide: [850, 210], tall: [70, 210], tip: 'Ranks by bid × pCTR × quality, applies reserve prices, picks winners for the slots and computes each price.' },
      { id: 'pace', label: 'Pacing service', sub: 'p / bid× every ~10 s', kind: 'compute', wide: [660, 315], tall: [350, 210], tip: 'Compares each campaign\'s spend with its target curve and publishes a participation probability or bid multiplier to all ad servers.' },
      { id: 'log', label: 'Event log', sub: 'Kafka: imps, clicks', kind: 'queue', wide: [470, 315], tall: [70, 315], tip: 'Every auction outcome, impression and click, keyed by impression id. Feeds spend counters, billing and model training.' },
      { id: 'agg', label: 'Click aggregation', sub: 'dedupe → billing', kind: 'compute', wide: [660, 420], tall: [210, 420], tip: 'Exactly-once counting of impressions and clicks per campaign and minute. See the Ad Click Aggregation page.' },
      { id: 'spend', label: 'Spend counter', sub: 'live, per campaign', kind: 'store', wide: [850, 315], tall: [350, 315], tip: 'Near-real-time spend totals per campaign and day, fed by the event stream. Approximate on purpose; billing uses the reconciled numbers.' }
    ],
    edges: [
      { from: 'cli', to: 'adx', bidi: true },
      { from: 'adx', to: 'rtb', bidi: true },
      { from: 'adx', to: 'tgt' },
      { from: 'cdb', to: 'tgt', dashed: true },
      { from: 'tgt', to: 'flt' },
      { from: 'flt', to: 'freq' },
      { from: 'flt', to: 'ml' },
      { from: 'ml', to: 'auc' },
      { from: 'auc', to: 'adx' },
      { from: 'auc', to: 'log' },
      { from: 'log', to: 'agg' },
      { from: 'agg', to: 'spend' },
      { from: 'spend', to: 'pace' },
      { from: 'pace', to: 'flt', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'serve', title: 'Ad request → winner in ~50 ms', tone: 'info',
      steps: [
        { text: 'A feed needs an ad. The request carries slot size, placement, user id, device, geo and page context. The ad server starts a <b>deadline timer</b> (say 60 ms).', flow: ['cli>adx'], badges: { adx: '⏱ 60 ms' } },
        { text: 'The <b>targeting index</b> turns the user into attributes (<code>geo=Pune, age=25-34, interest=running</code>) and returns every ad group whose boolean rule is satisfied: a few hundred out of millions.', flow: ['adx>tgt', 'tgt>flt'], badges: { tgt: '5M → 800' } },
        { text: '<b>Filters</b>: budget left, pacing coin flip (<code>rand() &lt; p</code>), one batched read of frequency counters, brand-safety and policy for this page. Cheap checks first.', flow: ['flt>freq'], nodes: ['pace'], badges: { flt: '800 → 300', freq: 'MGET' } },
        { text: 'The <b>pCTR / pCVR model</b> scores the 300 survivors in a batch. Each gets <b>eCPM = bid × pCTR × 1000</b> (or value per conversion × pCVR for conversion bids).', flow: ['flt>ml', 'ml>auc'], badges: { ml: '300 scores' } },
        { text: 'The <b>auction</b> applies reserves, ranks by eCPM, picks winners for the slots and sets GSP prices. The response carries a signed impression id, and the outcome is logged.', flow: ['auc>adx', 'adx>cli', 'auc>log'], ok: ['auc'], badges: { auc: 'A @ $1.76', adx: '41 ms' }, tone: 'ok' }
      ]
    },
    {
      id: 'pacing', title: 'Pacing keeps a budget alive until midnight', tone: 'ok',
      steps: [
        { text: 'A campaign has a $3,500 daily budget. Without pacing it would win every auction it qualifies for and run dry by late morning.', nodes: ['flt', 'pace'], warn: ['flt'], badges: { flt: ['would spend all by 11:00', 'warn'] } },
        { text: 'Impressions flow into the event log. A stream job keeps a <b>live spend total</b> per campaign, seconds behind reality.', flow: ['auc>log', 'log>agg', 'agg>spend'], badges: { spend: '$812 at 09:40' } },
        { text: 'Every ~10 s the <b>pacing service</b> compares spend with a <b>target curve</b> that follows forecast traffic. Spend is ahead of target, so it lowers the campaign\'s participation probability <code>p</code>.', flow: ['spend>pace'], badges: { pace: 'p 0.62 → 0.41' } },
        { text: 'Ad servers pick up the new <code>p</code>. The campaign now enters only ~41% of its eligible auctions. In the evening, when spend falls behind, <code>p</code> rises again.', flow: ['pace>flt'], ok: ['pace'], badges: { flt: 'rand() < 0.41' }, tone: 'ok' },
        { text: 'Meta\'s standard pacing works the other way: it enters every auction and <b>adjusts the bid</b>. Try both in the deep-dive widget.', nodes: ['auc', 'pace'], badges: { auc: 'bid × 0.7' } }
      ]
    },
    {
      id: 'click', title: 'Impression → click → billing and learning', tone: 'info',
      steps: [
        { text: 'The ad renders and the client fires the impression beacon with the signed impression id. The frequency counter for (user, ad group) goes up by one.', flow: ['cli>adx', 'adx>log'], nodes: ['freq'], badges: { freq: '2 of 3 today' } },
        { text: 'The user clicks. <code>/click</code> redirects to the landing page at once and logs the click with the same impression id.', flow: ['cli>adx', 'adx>log'], badges: { log: 'click iid=9f3…' } },
        { text: 'The <a href="ad-click-aggregation.html">click aggregation</a> pipeline dedupes by id, filters invalid traffic and counts exactly once per campaign and minute.', flow: ['log>agg'], badges: { agg: 'exactly-once' } },
        { text: 'For a CPC campaign the click is what costs money, so spend rises only now, <b>minutes after the auction</b>. That delay is a source of overspend that pacing must allow for.', flow: ['agg>spend', 'spend>pace'], warn: ['spend'], badges: { spend: ['+ $1.76', 'warn'] } },
        { text: 'The same joined impression and click events become training labels for the pCTR model, closing the learning loop.', nodes: ['log', 'ml'], badges: { ml: 'retrain' }, tone: 'ok' }
      ]
    },
    {
      id: 'overspend', title: 'Spend pipeline lags → overspend', tone: 'err',
      steps: [
        { text: 'The stream job that feeds the spend counter in one datacenter falls 20 minutes behind.', nodes: ['agg', 'spend'], err: ['agg'], badges: { agg: ['lag 20 min', 'err'] }, tone: 'err' },
        { text: 'Ad servers there still see yesterday\'s view of today: plenty of budget left. A campaign that is in fact exhausted keeps winning auctions.', flow: ['adx>tgt', 'tgt>flt', 'flt>ml', 'ml>auc'], warn: ['flt'], badges: { flt: ['budget looks OK', 'warn'] } },
        { text: 'Those impressions <b>cannot be billed</b>: Twitter calls this overspend, and it wastes slots other advertisers would have paid for. The bound is spend rate × feedback delay.', nodes: ['spend', 'auc'], err: ['spend'], badges: { spend: ['+$420 over', 'err'] }, tone: 'err' },
        { text: 'Fixes: alert on counter lag and <b>slow campaigns near their limit</b> (Pinterest predicts upcoming spend); give each server a pre-reserved <b>budget lease</b> so it cannot spend more than it holds; refund anything over the documented cap.', nodes: ['pace', 'spend', 'flt'], ok: ['pace'], badges: { pace: ['predict + lease', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'spike', title: 'Hot spot: big-event traffic spike', tone: 'warn',
      steps: [
        { text: 'A final starts and requests triple in a minute. Every ad server is busy and p99 latency climbs toward the deadline.', flow: [['cli>adx', 'cli>adx']], warn: ['adx'], badges: { adx: ['p99 85 ms', 'warn'] }, tone: 'warn' },
        { text: '<b>Degrade quality, not availability</b>: score fewer candidates per request (Twitter\'s 2016 "quality factor" was a control knob of exactly this kind) and skip the heavy ranking model if time is short.', nodes: ['ml', 'tgt'], badges: { ml: '300 → 120', tgt: 'top-N only' } },
        { text: 'External bidders that miss the <code>tmax</code> deadline are simply left out of this auction. Never wait for a slow bidder.', flow: ['adx>rtb'], err: ['rtb'], badges: { rtb: ['timeout → no bid', 'err'] } },
        { text: 'Pacing sees spend racing ahead of the target curve and lowers <code>p</code> for big campaigns, so the spike does not drain the day\'s budgets in ten minutes.', flow: ['spend>pace', 'pace>flt'], ok: ['pace', 'adx'], badges: { adx: ['p99 55 ms', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real design decision. Watch the auction and pacing labels, the request path and the meters. Numbers are illustrative.',
    controls: [
      { id: 'auction', label: 'Auction pricing', type: 'seg', value: 'gsp', options: [
        { v: 'gsp', l: 'GSP' }, { v: 'vcg', l: 'VCG' }, { v: 'fp', l: 'First price' }] },
      { id: 'pacing', label: 'Budget pacing', type: 'seg', value: 'throttle', options: [
        { v: 'none', l: 'None (ASAP)' }, { v: 'throttle', l: 'Throttling (p)' }, { v: 'bid', l: 'Bid modifier' }] },
      { id: 'ledger', label: 'Spend accounting', type: 'seg', value: 'async', options: [
        { v: 'sync', l: 'Sync DB row per impression' }, { v: 'async', l: 'Async counter' }, { v: 'lease', l: 'Per-server leases' }] },
      { id: 'delay', label: 'Spend feedback delay', type: 'range', min: 1, max: 1800, step: 1, value: 30, unit: 's' },
      { id: 'cand', label: 'Candidates scored per request', type: 'range', min: 100, max: 5000, step: 100, value: 500 }
    ],
    evaluate(s) {
      const clamp01 = (x) => Math.max(0, Math.min(1, x));
      // latency: ~30 ms retrieval + filters + network, scoring 0.1 ms/candidate on 8 parallel threads (estimate)
      const lat = 30 + s.cand * 0.1 / 8 + (s.ledger === 'sync' ? 15 : 0);
      // hot campaign: $10k/day. Peak spend rate: unpaced spends it in ~4 h; paced peak ≈ 2× average.
      const rate = s.pacing === 'none' ? 10000 / (4 * 3600) : 2 * 10000 / 86400;
      const over = s.ledger === 'async' ? rate * s.delay : 0;
      const overPct = over / 10000 * 100;
      const auc = {
        gsp: { rev: 'baseline; ≥ VCG for the same bids', rs: 0.75, bid: 'not truthful: must guess', bs: 0.5 },
        vcg: { rev: 'lower for the same bids', rs: 0.6, bid: 'bid your true value (dominant)', bs: 0.9 },
        fp: { rev: '≈ similar once bids are shaded', rs: 0.7, bid: 'must shade bids', bs: 0.45 }
      }[s.auction];
      const metrics = [
        { k: 'Serve latency p99', v: '≈ ' + Math.round(lat) + ' ms', s: lat <= 60 ? 0.9 : lat <= 100 ? 0.55 : 0.2, hint: 'budget ~100 ms (RTB)' },
        { k: 'Publisher revenue', v: auc.rev, s: auc.rs },
        { k: 'Advertiser bidding', v: auc.bid, s: auc.bs },
        { k: 'Budget lasts until', v: s.pacing === 'none' ? '≈ 11:00 (then dark)' : 'end of day', s: s.pacing === 'none' ? 0.15 : 0.9 },
        { k: 'Impressions per $', v: s.pacing === 'bid' ? '≈ 1.4× (cheaper auctions)' : s.pacing === 'throttle' ? '1× (market price)' : '1×, all in the morning', s: s.pacing === 'bid' ? 0.9 : s.pacing === 'throttle' ? 0.6 : 0.35, hint: 'widget sim, 2nd price' },
        { k: 'Overspend bound', v: s.ledger === 'sync' ? '≈ 0' : s.ledger === 'lease' ? '0 (pre-reserved)' : '≈ $' + Math.round(over) + ' (' + overPct.toFixed(overPct < 1 ? 2 : 1) + '% of $10k)', s: s.ledger === 'async' ? clamp01(1 - overPct / 3) : 0.95 },
        { k: 'Write hot spot', v: s.ledger === 'sync' ? '1 row per campaign, every server' : s.ledger === 'lease' ? '1 lease call per server per chunk' : 'stream aggregation', s: s.ledger === 'sync' ? 0.15 : 0.85 }
      ];
      const notes = [];
      if (s.auction === 'gsp') notes.push('GSP: each winner pays the <b>next ad\'s eCPM ÷ its own pCTR</b> (+ one cent). Edelman, Ostrovsky and Schwarz (2007) showed truthful bidding is not an equilibrium.');
      if (s.auction === 'vcg') notes.push('VCG charges each winner the value it takes away from the others. Truthful, but harder to explain, and revenue is lower than GSP for the same bids. Facebook used VCG (Varian & Harris, 2014).');
      if (s.auction === 'fp') notes.push('First price: pay what you bid. Simple and transparent across many exchanges, which is why Google Ad Manager switched in 2019. Bidders must <b>shade</b> bids, often with a model.');
      if (s.pacing === 'none') notes.push('ASAP delivery wins every eligible auction until the money is gone, missing the evening peak. Only right for one-off live events.');
      if (s.pacing === 'throttle') notes.push('Throttling: a controller sets <code>p</code> per campaign and servers enter with probability <code>p</code>. Simple and bid-neutral, but it pays full market price when it does enter.');
      if (s.pacing === 'bid') notes.push('Bid modifier: enter every auction with bid × m. A lower bid drops the priciest auctions first, so a fixed budget buys more. This is how Meta describes standard pacing.');
      if (s.ledger === 'sync') notes.push('A synchronous decrement on one budget row per impression serializes every server on that row. It is exact, but it adds a DB round trip to the hot path.');
      if (s.ledger === 'async') notes.push('Overspend ≈ spend rate × feedback delay. At ' + s.delay + ' s that is about $' + Math.round(over) + ' on a $10k campaign' + (s.pacing === 'none' ? ' running unpaced.' : '.'));
      if (s.ledger === 'lease') notes.push('Each server holds a small pre-reserved chunk of budget and refills from the ledger. It can never spend more than it holds; unused leases expire and return.');
      if (s.cand > 2000) notes.push('Scoring ' + s.cand + ' candidates per request eats the latency budget. Add a cheap first-stage ranker before the heavy model.');
      let verdict;
      if (lat > 100) verdict = '❌ <b>Too slow for RTB.</b> Score fewer candidates or add a light first-stage ranker.';
      else if (s.pacing === 'none') verdict = '❌ <b>Budgets die by late morning.</b> Add pacing unless this is a one-off live event.';
      else if (s.ledger === 'sync') verdict = '⚠ <b>Correct but slow:</b> every impression waits on a hot budget row. Use async counters or leases.';
      else if (s.ledger === 'async' && overPct > 2) verdict = '⚠ <b>Overspend too large.</b> Shorten the feedback loop, slow campaigns near their cap, or use leases.';
      else if (s.auction === 'gsp' && s.ledger !== 'sync') verdict = '✅ <b>Classic search-ads design:</b> quality-weighted GSP, paced budgets and an eventually consistent spend counter with a bounded overspend.';
      else verdict = '👍 <b>Solid.</b> Check the meters to see which trade-off you are paying for.';
      const flow = ['cli>adx', 'adx>tgt', 'tgt>flt', 'flt>freq', 'flt>ml', 'ml>auc', 'auc>adx', 'auc>log', 'log>agg', 'agg>spend'].concat(s.pacing === 'none' ? [] : ['spend>pace', 'pace>flt']);
      return {
        metrics, verdict, notes, flow,
        labels: {
          auc: { label: 'Auction', sub: { gsp: 'rank eCPM · GSP', vcg: 'rank eCPM · VCG', fp: 'first price + floor' }[s.auction] },
          pace: { label: 'Pacing service', sub: { none: 'off (ASAP)', throttle: 'sets p every ~10 s', bid: 'sets bid× every ~10 s' }[s.pacing] },
          spend: { label: s.ledger === 'lease' ? 'Budget ledger' : 'Spend counter', sub: { sync: 'sync row per imp', async: 'async · ' + s.delay + ' s behind', lease: 'leases per server' }[s.ledger] }
        },
        hide: s.pacing === 'none' ? ['pace'] : [],
        warn: (s.ledger === 'sync' ? ['spend'] : []).concat(lat > 100 ? ['ml'] : []),
        err: s.ledger === 'async' && overPct > 2 ? ['spend'] : [],
        hot: s.pacing === 'none' ? [] : ['pace'],
        badges: { spend: [s.ledger === 'async' ? 'over ≈ $' + Math.round(over) : 'bounded', s.ledger === 'async' && overPct > 2 ? 'err' : 'ok'], adx: ['p99 ' + Math.round(lat) + ' ms', lat > 100 ? 'err' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Run the auction, then pace a day',
    caption: '<b>① Auction:</b> six bidders, ranked by <b>eCPM = bid × pCTR × 1000</b>. Tap a row to select it, change its bid or pCTR, and compare what each winner pays under <b>GSP, VCG and first price</b> for 1–3 slots and a reserve. <b>② Budget pacing:</b> a 24-hour day in 10-minute steps against a second-price market. Compare no pacing, a PI controller on participation probability, and a PI controller on the bid. Then add an unforecast evening spike or a lagging spend counter.'
  },

  realWorld: {
    intro: 'Ad auctions and pacing are among the best-documented parts of the industry: economics papers, ML papers and engineering blogs. In order:',
    timeline: [
      { when: '2007', who: 'Edelman · Ostrovsky · Schwarz', title: 'The GSP auction analysed', text: 'Their American Economic Review paper studies the <b>generalized second-price</b> auction that search engines use. It looks like VCG, but <b>truth-telling is not an equilibrium</b> and there is no dominant strategy. A related English-auction version has a unique equilibrium with the <b>same payoffs as VCG</b>.', src: 0 },
      { when: '2009', who: 'Yahoo! Research · Stanford', title: 'Indexing Boolean Expressions', text: 'Advertisers\' targeting rules are DNF / CNF boolean expressions, and a user is an attribute assignment. The paper indexes arbitrary expressions (including NOT, multi-valued attributes) with <b>inverted lists</b> and returns the top-N matches, tested on online-advertising data.', src: 1 },
      { when: '2013', who: 'Google', title: 'Ad Click Prediction: a View from the Trenches', text: 'Case studies from the system that predicts CTR for sponsored search: <b>logistic regression trained online with FTRL-Proximal</b>, per-coordinate learning rates, and L1 regularization for sparse models, plus lessons on memory and calibration.', src: 2 },
      { when: '2014', who: 'Facebook', title: 'Practical Lessons from Predicting Clicks on Ads', text: 'Boosted decision trees turn raw features into leaf indexes that feed a <b>linear (logistic) classifier</b>. The hybrid beat either model alone by over 3%, and <b>historical user and ad features</b> mattered most.', src: 3 },
      { when: '2014', who: 'Google (Varian & Harris)', title: 'VCG in practice', text: 'The authors note that search ads use GSP, display exchanges generally use a second-price (Vickrey) auction, and <b>Facebook uses VCG</b>, and they discuss practical issues of running VCG.', src: 4 },
      { when: '2014–15', who: 'LinkedIn · Yahoo', title: 'Budget pacing papers at KDD', text: 'LinkedIn presented <b>budget pacing for targeted online ads</b> (KDD 2014). Yahoo\'s <b>Smart Pacing</b> (KDD 2015) is a control system that adjusts pacing rates by group of predicted response rate using online feedback. In A/B tests on three campaigns it cut eCPC by 72%, 67% and 79%.', src: 6 },
      { when: '2016', who: 'Twitter', title: 'Resilient ad serving', text: 'The serving pipeline is a funnel. A <b>quality factor</b> learned by an adaptive controller trades ad quality against latency and CPU, so the system degrades gracefully under load instead of failing requests.', src: 7 },
      { when: '2017', who: 'Pinterest', title: 'Predictive budgeting with Kafka Streams', text: 'To prevent <b>overdelivery</b>, recent spend is not enough: the system <b>predicts spend</b> that is about to happen and slows campaigns close to their budget. Kafka Streams was chosen for its low latency and light footprint.', src: 8 },
      { when: '2019', who: 'Google Ad Manager', title: 'Move to a unified first-price auction', text: 'Google announced that Ad Manager would move programmatic display and video to a <b>first-price auction</b>, replacing a setup in which an ad could pass through two auctions. Second-price-only pricing rules gave way to unified pricing rules, and the full rollout began in September 2019.', src: 9 },
      { when: '2020–21', who: 'Twitter', title: 'Live spend counter and a sharded pacing service', text: 'A <b>Live Spend Counter</b> per datacenter aggregates engagement events into a spend cache, and lag there causes overspend. In 2021 pacing became its own sharded service, replicated in every datacenter, that recomputes pacing for <b>every campaign every 10 seconds</b>.', src: 11 },
      { when: '2022', who: 'IAB Tech Lab', title: 'OpenRTB 2.6', text: 'The current 2.x protocol between exchanges and bidders. Version 2.6 adds <b>ad pods</b> for connected TV and a structured user agent. A bid request carries <code>tmax</code>, the time the bidder has to answer.', src: 13 }
    ],
    lessons: [
      'Rank by <b>expected value</b> (bid × pCTR × quality), never by bid alone, and keep pCTR <b>calibrated</b> because prices are computed from it.',
      'Treat pacing as a <b>feedback control loop</b> with a forecast target curve, not as a stop switch at zero budget.',
      'Accept <b>eventual consistency</b> on spend, then bound the overspend (short feedback loops, spend prediction, leases) and make the advertiser whole above a documented cap.',
      'Design the request path as a <b>funnel with a deadline</b>: cheap retrieval and filters first, expensive models last, and degrade quality before availability.'
    ],
    sources: [
      { title: 'Internet Advertising and the Generalized Second Price Auction', url: 'https://www.benedelman.org/internet-advertising-and-the-generalized-second-price-auction-selling-billions-of-dollars-worth-of-keywords/', pub: 'Edelman, Ostrovsky, Schwarz, American Economic Review, 2007' },
      { title: 'Indexing Boolean Expressions', url: 'https://theory.stanford.edu/~sergei/papers/vldb09-indexing.pdf', pub: 'Whang et al., VLDB 2009' },
      { title: 'Ad Click Prediction: a View from the Trenches', url: 'https://research.google/pubs/ad-click-prediction-a-view-from-the-trenches/', pub: 'Google, KDD 2013' },
      { title: 'Practical Lessons from Predicting Clicks on Ads at Facebook', url: 'https://ai.meta.com/research/publications/practical-lessons-from-predicting-clicks-on-ads-at-facebook/', pub: 'Facebook, ADKDD 2014' },
      { title: 'The VCG Auction in Theory and Practice', url: 'https://econpapers.repec.org/RePEc:aea:aecrev:v:104:y:2014:i:5:p:442-45', pub: 'Varian & Harris, AER 2014' },
      { title: 'Budget Pacing for Targeted Online Advertisements at LinkedIn (talk)', url: 'https://videolectures.net/kdd2014_ghosh_budget_pacing', pub: 'LinkedIn, KDD 2014' },
      { title: 'Smart Pacing for Effective Online Ad Campaign Optimization', url: 'https://arxiv.org/pdf/1506.05851', pub: 'Yahoo, KDD 2015' },
      { title: 'Resilient ad serving at Twitter-scale', url: 'https://blog.x.com/engineering/en_us/a/2016/resilient-ad-serving-at-twitter-scale', pub: 'Twitter Engineering, 2016' },
      { title: 'Using Kafka Streams API for Predictive Budgeting', url: 'https://medium.com/@Pinterest_Engineering/using-kafka-streams-api-for-predictive-budgeting-9f58d206c996', pub: 'Pinterest Engineering, 2017' },
      { title: 'An update on first price auctions for Google Ad Manager', url: 'https://blog.google/products/admanager/update-first-price-auctions-google-ad-manager/', pub: 'Google, May 2019' },
      { title: 'Rolling out first price auctions to Google Ad Manager partners', url: 'https://www.blog.google/products/admanager/rolling-out-first-price-auctions-google-ad-manager-partners/', pub: 'Google, Sep 2019' },
      { title: 'How we built Twitter\'s highly reliable ads pacing service', url: 'https://blog.x.com/engineering/en_us/topics/infrastructure/2021/how-we-built-twitter-s-highly-reliable-ads-pacing-service', pub: 'Twitter Engineering, 2021' },
      { title: 'How we fortified Twitter\'s real time ad spend architecture', url: 'https://blog.x.com/engineering/en_us/topics/infrastructure/2020/how_we_fortified_twitters_real_time_ad_spend_architecture', pub: 'Twitter Engineering, 2020' },
      { title: 'OpenRTB 2.x specification (2.6)', url: 'https://github.com/InteractiveAdvertisingBureau/openrtb2.x/releases/tag/2.6-202210', pub: 'IAB Tech Lab' },
      { title: 'Optimizations to Google Cloud Platform for real-time bidding on DoubleClick Ad Exchange', url: 'https://cloudplatform.googleblog.com/2014/03/optimizations-to-google-cloud-platform-for-real-time-bidding-on-doubleclick-ad-exchange.html', pub: 'Google Cloud, 2014' },
      { title: 'About overdelivery and your average daily budget', url: 'https://support.google.com/google-ads/answer/1704443?hl=en', pub: 'Google Ads Help' },
      { title: 'Ad Rank thresholds: Definition', url: 'https://support.google.com/google-ads/answer/7634668?hl=en', pub: 'Google Ads Help' },
      { title: 'Pacing and scheduling', url: 'https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/overview/pacing-and-scheduling', pub: 'Meta Marketing API docs' },
      { title: 'SplitNet architecture for ad candidate ranking', url: 'https://blog.twitter.com/engineering/en_us/topics/infrastructure/2019/splitnet-architecture-for-ad-candidate-ranking', pub: 'Twitter Engineering, 2019' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Auction rule', '<b>GSP</b>: easy to explain, higher revenue for the same bids, not truthful', '<b>VCG</b>: truthful, charges each ad its harm to others', 'GSP for search-style slots; VCG when you want bidders (or auto-bidding) to bid true value'],
      ['Second vs first price', '<b>Second price / GSP</b>: winners pay the runner-up', '<b>First price</b>: pay your bid; bidders shade', 'First price when many exchanges and header bidding chain auctions together (Google Ad Manager, 2019)'],
      ['Pacing method', '<b>Throttling</b>: enter with probability p, bid unchanged', '<b>Bid modification</b>: always enter, bid × m', 'Throttle when the bid must stay as set (fixed CPC); bid-modify for auto-bid goals, since it buys cheaper impressions'],
      ['Spend accounting', '<b>Async counter</b>: fast, overspend ≈ rate × delay', '<b>Budget leases</b>: no overspend, but stranded chunks and refill calls', 'Async plus prediction for most campaigns; leases for small budgets or strict caps'],
      ['Targeting retrieval', '<b>Boolean-expression index</b>: exact rule matching', '<b>Embedding retrieval</b> (two-tower): finds relevant ads beyond explicit rules', 'Both: rules for eligibility, embeddings for audience expansion (see Recommendation)'],
      ['Frequency caps', '<b>Exact counters</b> per user × ad group with TTL', '<b>Approximate</b> (sketch or sampled), or client-side', 'Exact for contractual caps; approximate for soft "avoid fatigue" caps']
    ]
  },
  failures: [
    { f: 'Spend counter lags → overspend', detect: 'Counter lag vs event time; spend vs target-curve alarms', fix: 'Slow campaigns near their cap using predicted spend; leases for small budgets; credit the advertiser above the documented limit.' },
    { f: 'pCTR model miscalibrated after a deploy', detect: 'Predicted vs observed CTR per bucket; revenue per 1k views drops', fix: 'Shadow-score before rollout, calibration layer, automatic rollback on calibration drift.' },
    { f: 'Pacing controller oscillates', detect: 'p or bid multiplier swinging between bounds; spend saw-tooths around target', fix: 'Shorter feedback loop, lower gains, clamp the step size, use a forecast target curve.' },
    { f: 'Request path over its deadline under load', detect: 'p99 vs deadline; timeouts at the exchange', fix: 'Score fewer candidates, skip the heavy model, drop slow RTB bidders at tmax, shed traffic as "no ad".' },
    { f: 'Targeting index stale after an edit', detect: 'Index version lag vs campaign DB; advertiser reports "paused ad still showing"', fix: 'Stream changes into the index (CDC); a pause/stop is a high-priority tombstone applied before other updates.' },
    { f: 'Frequency-cap store down', detect: 'Error rate on multi-get', fix: 'Fail closed for strict contractual caps (skip those campaigns); fail open for soft caps.' }
  ],

  interview: [
    { q: 'Walk me through serving one ad request within ~100 ms.', a: '<ul><li><b>Parse and enrich</b>: user features, context, page category (a few ms).</li><li><b>Retrieve</b>: boolean-expression index over targeting → hundreds or thousands of candidates.</li><li><b>Filter</b>: budget left, pacing coin flip, frequency caps (one batched read), brand safety, policy.</li><li><b>Score</b>: pCTR / pCVR in a batch, maybe a light ranker first, then a heavy one.</li><li><b>Auction</b>: reserve, rank by eCPM, price winners.</li><li><b>Respond and log</b>: signed impression id, async log write.</li></ul><p>Every stage runs against a <b>deadline</b>. If time runs short, return the best result so far.</p>', lvl: 'core' },
    { q: 'Why rank by bid × pCTR instead of by bid?', a: '<p>For a cost-per-click ad, the platform is paid only on a click. Expected revenue per impression is <b>bid × pCTR</b>, and × 1000 that is the <b>eCPM</b>. A $5 bid with 0.5% pCTR is worth $25 per 1000 views, while a $2 bid with 3% is worth $60.</p><p>It also helps users: ads people click are more relevant. Platforms add quality factors (landing page, negative feedback) on top.</p>', lvl: 'core' },
    { q: 'How does GSP pricing work with quality scores?', a: '<p>Rank by score <code>s = bid × pCTR</code>. The ad in position k pays per click the <b>least it could bid and still beat the next ad</b>:</p><p><code>price_k = s_(k+1) / pCTR_k + $0.01</code></p><p>It never exceeds its own bid. The last winner pays against the reserve. GSP is <b>not truthful</b>: bidding your true value is not always best (Edelman, Ostrovsky, Schwarz, 2007).</p>', fu: 'Why can shading pay off in GSP? (Dropping to a lower slot can be worth it if the price falls more than the clicks.)', lvl: 'core' },
    { q: 'GSP vs VCG vs first price: compare them.', a: '<ul><li><b>VCG</b>: each winner pays the harm it causes everyone else. Truth-telling is a dominant strategy. Revenue is ≤ GSP for the same bids. Facebook used it (Varian &amp; Harris, 2014).</li><li><b>GSP</b>: each pays the next ad\'s score. Simple and familiar from search ads, but not truthful.</li><li><b>First price</b>: pay your bid. Transparent, and works when auctions are chained (header bidding), but bidders must <b>shade</b>. Google Ad Manager moved to it in 2019.</li></ul><p>With one slot, VCG and GSP both reduce to a second-price auction.</p>', lvl: 'core' },
    { q: 'Why did Google Ad Manager move to first price in 2019?', a: '<p>Google said the old setup could send one ad request through <b>two different auctions</b>, and that one <b>unified first-price auction</b> would simplify this and make it more transparent. The wider context (our reading, not Google\'s wording) was <b>header bidding</b>: publishers chaining several auctions, most of them first price, so a second-price result was hard to compare. It replaced second-price-only pricing rules with <b>unified pricing rules</b>.</p><p>Consequence for buyers: they now need <b>bid shading</b> to avoid overpaying.</p>', lvl: 'deep' },
    { q: 'How do you find the ads whose targeting matches a user, fast?', a: '<p>Targeting rules are boolean expressions: <code>(geo ∈ {Pune, Mumbai}) ∧ (age ∈ 25-34) ∧ ¬(interest = gambling)</code>. Turn them into DNF conjunctions and build an <b>inverted index</b> from <code>attribute=value</code> to the conjunctions that contain it, grouped by conjunction size.</p><p>For a user, read the posting lists for their attributes. A conjunction of size K matches if it appears in K of those lists and no NOT term fires. This is the approach of "Indexing Boolean Expressions" (VLDB 2009). Keep the index in memory on every serving host.</p>', lvl: 'deep' },
    { q: 'Why does naive serving spend the whole budget by mid-morning?', a: '<p>If a campaign enters every auction it qualifies for, it spends at the rate traffic arrives. Morning traffic alone can exceed the daily budget, so the campaign goes <b>dark for the evening</b>. It also wins the most expensive auctions first.</p><p>Pacing sets a <b>target spend curve</b> (often proportional to forecast traffic) and holds the campaign to it.</p>', lvl: 'core' },
    { q: 'Throttling vs bid-modification pacing: how do they differ?', a: '<ul><li><b>Throttling</b>: enter each auction with probability <code>p</code>, keep the bid. Simple and bid-neutral. It pays full market price when it enters.</li><li><b>Bid modification</b>: enter every auction with <code>bid × m</code>. Lower bids drop the most expensive auctions first, so the same budget buys more impressions (Meta\'s standard pacing adjusts the bid).</li></ul><p>Both are driven by a <b>feedback controller</b> on spend vs target, usually recomputed every few seconds.</p>', lvl: 'core' },
    { q: 'Design the pacing controller.', a: '<p>Every Δt (say 10 s), for each campaign:</p><ul><li><b>Target</b>: budget × forecast share of today\'s traffic seen so far.</li><li><b>Error</b>: target − actual spend, normalized by budget per interval.</li><li><b>Update</b>: PI on log(p) or log(m): <code>u += Kp·Δe + Ki·e</code>, then clamp.</li></ul><p>Add a <b>lookahead</b> (predicted spend from in-flight impressions and late clicks), a floor so p never hits 0 too early, and a catch-up limit near midnight. Publish p to all servers. They only read it.</p>', fu: 'What happens if the spend signal lags 30 minutes? (The controller over-reacts and oscillates; try it in the widget.)', lvl: 'deep' },
    { q: 'How do you keep spend accounting consistent across 1,000 ad servers?', a: '<p>Don\'t lock one row per impression. Options:</p><ul><li><b>Async counter</b>: servers log events, a stream job sums spend per campaign, servers read totals. Overspend ≈ spend rate × feedback delay.</li><li><b>Budget leases</b>: each server reserves a small chunk (e.g. 1% of remaining) from a ledger with an atomic update, spends locally, and refills or returns. It cannot overspend more than it holds.</li><li><b>Predictive slowdown</b> near the cap (Pinterest).</li></ul><p>For CPC, clicks arrive minutes after the impression, so count <b>expected cost of in-flight impressions</b> too. Google Ads documents up to 2× daily overdelivery, with a monthly cap and credits above it.</p>', lvl: 'deep' },
    { q: 'How do you enforce a frequency cap at this scale?', a: '<p>Keep counters <code>freq:{user}:{ad_group}</code> in a fast key-value store with a TTL equal to the cap window. On each request, read all candidate counters in <b>one multi-get</b>, and increment on the impression beacon, not on the auction win (some wins never render).</p><p>Shard by user so one request hits one shard. Accept small races: two parallel requests can both pass a cap of 3.</p>', lvl: 'core' },
    { q: 'How would your system bid on an external exchange via OpenRTB?', a: '<p>The exchange POSTs a BidRequest with <code>imp</code>, <code>site/app</code>, <code>device</code>, <code>user</code> and <code>tmax</code> (milliseconds to respond). Run the same funnel against your own campaigns, then bid your value (shaded if the exchange is first-price) or return 204 (no bid).</p><p>Budget for network round-trip time: answer well inside <code>tmax</code>, because a late bid is ignored. Log the win notice (<code>nurl</code>/<code>burl</code>) as the billable event.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Python: GSP, VCG and first-price prices for K slots', lang: 'python',
      code: `from dataclasses import dataclass

@dataclass
class Bid:
    ad: str
    cpc: float      # max $ per click
    pctr: float     # predicted click probability in slot 1

def price(bids, alphas, reserve_ecpm=0.0, eps=0.01):
    """alphas[k] = position CTR multiplier of slot k; returns per-click prices."""
    r = reserve_ecpm / 1000                       # reserve as $ per impression
    ranked = sorted((b for b in bids if b.cpc * b.pctr >= r),
                    key=lambda b: b.cpc * b.pctr, reverse=True)
    K = len(alphas)
    s = lambda j: ranked[j].cpc * ranked[j].pctr if j < len(ranked) else r
    a = lambda j: alphas[j] if j < K else 0.0
    out = []
    for k in range(min(K, len(ranked))):
        w = ranked[k]
        gsp = min(w.cpc, s(k + 1) / w.pctr + eps)
        vcg_imp = sum((a(j) - a(j + 1)) * s(j + 1) for j in range(k, K))
        vcg = vcg_imp / (a(k) * w.pctr)
        out.append((k + 1, w.ad, round(gsp, 2), round(vcg, 2), w.cpc))
    return out

bids = [Bid("A", 2.0, .03), Bid("B", 4.0, .012), Bid("C", 1.5, .035),
        Bid("D", 3.0, .01), Bid("E", 0.8, .025), Bid("F", 5.0, .005)]
for row in price(bids, alphas=[1.0, 0.6], reserve_ecpm=10):
    print(row)
# (1, 'A', 1.76, 1.66, 2.0)
# (2, 'C', 1.38, 1.37, 1.5)`,
      note: 'Same numbers as the widget\'s default view. B has the highest bid but ranks third. GSP ≥ VCG in every slot for the same bids.'
    },
    {
      title: 'Spring Boot: PI pacing controller (throttling)', lang: 'java',
      code: `@Component
public class PacingController {
  // widget gains (tuned on 10-min steps); Ki / 60 because this runs every 10 s
  private static final double KP = 0.2, KI = 0.05 / 60, P_MIN = 0.01;
  private final SpendClient spend;          // live spend counter (approximate)
  private final TrafficForecast forecast;   // share of today's traffic so far, 0..1
  private final Map<Long, double[]> state = new ConcurrentHashMap<>(); // id -> {p, prevErr}

  public PacingController(SpendClient spend, TrafficForecast forecast) {
    this.spend = spend; this.forecast = forecast;
  }

  @Scheduled(fixedRate = 10_000)            // every 10 s
  public void recompute() {
    Instant now = Instant.now();
    double share = forecast.cumulativeShare(now);
    for (Campaign c : spend.activeCampaigns()) {
      double unit = c.dailyBudgetMicros() / 144.0;       // 10 minutes of budget
      double target = c.dailyBudgetMicros() * share;
      double err = (target - spend.spentTodayMicros(c.id())) / unit;
      double[] s = state.computeIfAbsent(c.id(), k -> new double[] {0.5, 0});
      double u = Math.log(s[0]) + KP * (err - s[1]) + KI * err; // velocity-form PI
      s[0] = Math.min(1.0, Math.max(P_MIN, Math.exp(u)));
      s[1] = err;
    }
  }

  /** Called on the hot path by every ad server thread. */
  public boolean participate(long campaignId) {
    double[] s = state.get(campaignId);
    return s == null || ThreadLocalRandom.current().nextDouble() < s[0];
  }
}`,
      note: 'Needs <code>@EnableScheduling</code>. In production the controller runs as its own sharded service and publishes p to every server; here one bean does both to keep it short. Gains must be retuned when the step length changes.'
    },
    {
      title: 'Postgres: budget leases with no overspend', lang: 'sql',
      code: `CREATE TABLE budget_day (
  campaign_id  bigint,
  day          date,
  budget_micros bigint NOT NULL,
  leased_micros bigint NOT NULL DEFAULT 0,   -- handed to servers, not yet settled
  spent_micros  bigint NOT NULL DEFAULT 0,   -- settled
  PRIMARY KEY (campaign_id, day),
  CHECK (spent_micros + leased_micros <= budget_micros)
);

-- A server asks for a chunk: at most :chunk, never more than what is left.
UPDATE budget_day b
   SET leased_micros = b.leased_micros + g.amt
  FROM (SELECT LEAST(:chunk, budget_micros - spent_micros - leased_micros) AS amt
          FROM budget_day
         WHERE campaign_id = :cid AND day = :'day'
           FOR UPDATE) g          -- row lock: concurrent grants queue here
 WHERE b.campaign_id = :cid AND b.day = :'day' AND g.amt > 0
RETURNING g.amt AS granted;       -- 0 rows = budget fully leased or spent

-- Settle a lease: :used was spent, the rest goes back to the pool.
UPDATE budget_day
   SET spent_micros  = spent_micros + :used,
       leased_micros = leased_micros - :granted
 WHERE campaign_id = :cid AND day = :'day';`,
      note: 'Row lock is taken once per chunk, not per impression. A server that dies holds its lease until a sweeper settles it after a TTL, so pick chunks small enough (e.g. 1% of what is left) that stranded leases don\'t starve the campaign.'
    }
  ],

  related: ['ad-click-aggregation', 'recommendation', 'search-engine', 'rate-limiter', 'stream-analytics', 'distributed-cache']
});
