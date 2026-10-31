SD.register({
  slug: 'llm-gateway',
  domain: 8,
  title: 'LLM Gateway',
  examples: 'LiteLLM, Portkey, Cloudflare AI GW',
  tagline: 'One front door for every LLM call: <b>per-team token budgets</b>, PII redaction, caching, and <b>routing with fallbacks</b> across providers, while responses stream straight through.',
  tldr: {
    problem: 'Dozens of teams call several LLM providers with their own keys. Nobody knows who spends what, one batch job can eat the whole provider quota, and a provider outage takes every feature down.',
    idea: 'Put a thin, stateless <b>proxy</b> in front of all providers. It authenticates, charges a <b>token bucket</b> per team, redacts PII, checks a cache, picks a model, <b>falls back</b> on 429/5xx, and meters tokens as the stream passes.',
    insight: 'Providers limit you in <b>tokens per minute</b>, not just requests. A gateway that counts requests lets one long-prompt job starve everyone. Count <b>tokens</b>, reserve <code>max_tokens</code> up front, and refund what was not used.',
    numbers: [
      { v: 'RPM · ITPM · OTPM', l: 'Anthropic API limit dimensions per usage tier' },
      { v: 'up to −98%', l: 'cost cut reported for an LLM cascade on its benchmarks (FrugalGPT, 2023)' },
      { v: '429 + retry-after', l: 'what a provider returns when a limit is hit (Anthropic docs)' }
    ]
  },

  intro: {
    what: 'An LLM gateway is a single front door that every app in a company uses to call large language models (LLMs). Apps send requests to the gateway instead of straight to a model provider. The gateway checks <b>who is calling and how much they may spend</b>, removes private data, picks a model, and <b>switches providers</b> when one fails, while the answer streams straight back.',
    analogy: {
      icon: '🧳',
      title: 'A company travel desk',
      text: 'Instead of every employee booking flights on a personal card, a company travel desk books everything. It checks each team\'s budget, picks a suitable airline, rebooks you on another airline if a flight is cancelled, and sends finance one clear bill per team. An LLM gateway does the same for model calls. Unlike a travel desk, it must decide in a few milliseconds.'
    },
    problem: 'Ten teams each call model providers with their own API keys. One night a team runs a big batch job that uses up the company\'s whole provider quota, and the customer support bot starts failing. Then the provider has an outage and every AI feature goes down at once. At month end, nobody can say which team spent what. The core question is <b>how to share model access fairly, control cost, and keep working when a provider fails</b>.',
    story: [
      {
        stage: 'naive',
        title: 'Every app calls the provider directly',
        text: 'Each team signs up with a provider, puts the API key in its app, and calls the model directly. It is the fastest way to ship the first AI feature.',
        scene: {
          nodes: [
            { id: 'a1', label: 'Support bot', sub: 'own API key', kind: 'client', at: [70, 0] },
            { id: 'pA', label: 'Provider A', sub: 'shared quota', kind: 'external', at: [350, 0] },
            { id: 'a2', label: 'Batch job', sub: 'own API key', kind: 'client', at: [70, 220] }
          ],
          edges: [{ from: 'a1', to: 'pA', bidi: true }, { from: 'a2', to: 'pA', bidi: true }],
          flow: [['a1>pA', 'a2>pA'], ['pA>a1', 'pA>a2']]
        }
      },
      {
        stage: 'breaks',
        title: 'One big job or one outage breaks everyone',
        text: 'Providers cap each company at so many <b>tokens per minute</b> (a token is a small piece of text). The batch job sends huge prompts, uses up the shared cap, and the support bot gets <b>429 "too many requests"</b> errors. When the provider has an outage, every feature fails together. Keys are scattered across apps, and no one knows which team spent what.',
        scene: {
          nodes: [
            { id: 'a1', label: 'Support bot', sub: 'gets errors', kind: 'client', at: [70, 0] },
            { id: 'pA', label: 'Provider A', sub: 'quota used up', kind: 'external', at: [350, 0] },
            { id: 'a2', label: 'Batch job', sub: 'huge prompts', kind: 'client', at: [70, 220] }
          ],
          edges: [{ from: 'a1', to: 'pA', bidi: true }, { from: 'a2', to: 'pA', bidi: true }],
          flow: [['a2>pA', 'a1>pA'], 'a2>pA', 'pA>a1'],
          err: ['pA'],
          warn: ['a1'],
          badges: { pA: ['429', 'err'], a1: ['failing', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Put one gateway in front of every provider',
        text: 'Every app calls the <b>gateway</b> with its team\'s key. A <b>token bucket</b> per team caps how fast each team spends tokens, so the batch job slows down alone. A cache answers repeated prompts for free. A <b>router</b> picks the model and <b>falls back</b> to another provider on errors. Every call is metered, so each team sees its own bill.',
        scene: {
          nodes: [
            { id: 'a1', label: 'Support bot', sub: 'team key', kind: 'client', at: [70, 0] },
            { id: 'pA', label: 'Provider A', sub: '429 → wait', kind: 'external', at: [350, 0] },
            { id: 'gw', label: 'Gateway', sub: 'budgets · cache', kind: 'edge', at: [210, 110] },
            { id: 'a2', label: 'Batch job', sub: 'team key', kind: 'client', at: [70, 220] },
            { id: 'meter', label: 'Usage meter', sub: 'cost per team', kind: 'store', at: [210, 220] },
            { id: 'pB', label: 'Provider B', sub: 'fallback', kind: 'external', at: [350, 220] }
          ],
          edges: [{ from: 'a1', to: 'gw', bidi: true }, { from: 'a2', to: 'gw', bidi: true }, { from: 'gw', to: 'pA', bidi: true }, { from: 'gw', to: 'pB', bidi: true }, { from: 'gw', to: 'meter' }],
          flow: [['a1>gw', 'a2>gw'], 'gw>pA', 'gw>pB', 'pB>gw', ['gw>a1', 'gw>meter']],
          warn: ['pA'],
          ok: ['gw', 'pB'],
          badges: { a1: ['served', 'ok'], a2: ['slowed', 'warn'] }
        }
      }
    ],
    usedBy: ['LiteLLM', 'Portkey', 'Cloudflare AI Gateway', 'Kong AI Gateway', 'Internal AI platform teams at large companies'],
    whenToUse: [
      'Many teams or apps share the <b>same model providers and quotas</b>',
      'You need cost per team, budgets, and one place to stop a runaway job',
      'Features must keep working when one provider slows down or fails'
    ],
    whenNot: [
      'One app, one provider, small spend: call the provider\'s SDK directly',
      'You host the model yourself and need it to be fast: see <a href="llm-inference.html">LLM Inference Engine</a>',
      'Ordinary REST traffic between services: a general <a href="api-gateway.html">API Gateway</a> fits'
    ],
    glossary: [
      { term: 'Tokens per minute (TPM)', def: 'How many tokens (small pieces of text) a caller may send or receive per minute; the main limit providers enforce.' },
      { term: 'Token bucket', def: 'A counter that refills at a steady rate; each request takes tokens from it and is rejected when it is empty.' },
      { term: 'Virtual key', def: 'A key the gateway issues to one team, mapped to that team\'s budget and limits, so real provider keys stay hidden.' },
      { term: 'Model alias', def: 'A stable name such as "large-model" that the gateway maps to one or more real provider models.' },
      { term: 'Fallback', def: 'Retrying a failed or rate-limited call on another provider or model that can do the same job.' },
      { term: 'Semantic cache', def: 'A cache that returns a stored answer when a new prompt means nearly the same thing as an old one.' },
      { term: 'PII redaction', def: 'Replacing personal data such as emails or card numbers with placeholders before the prompt leaves the company.' },
      { term: 'Cascade', def: 'Trying a small, cheap model first and escalating to a larger one only when the answer looks unsure.' }
    ]
  },

  requirements: {
    functional: [
      'One OpenAI-style API in front of many providers',
      'Virtual keys per team, with token budgets',
      'Route by cost, latency or capability; fall back on errors',
      'Exact and semantic response caching',
      'PII redaction and policy guardrails',
      'Stream tokens through; meter usage and cost'
    ],
    nonFunctional: [
      'Adds ≲ 10–20 ms before the first token',
      'Stateless and horizontally scalable',
      'Fair share: one team cannot starve others',
      'Survives a provider outage transparently',
      'No prompts or PII in plain-text logs',
      'Usage accurate enough for chargeback'
    ],
    outOfScope: ['Hosting the models (see LLM Inference)', 'Retrieval and agents (see RAG & Agent Platform)', 'Fine-tuning']
  },

  calculator: {
    inputs: [
      { id: 'rps', label: 'Peak LLM requests per second', min: 1, max: 20000, value: 300, log: true },
      { id: 'tin', label: 'Average input tokens per request', min: 100, max: 100000, value: 2000, log: true },
      { id: 'tout', label: 'Average output tokens per request', min: 20, max: 4000, value: 400, log: true },
      { id: 'pin', label: 'Price per 1M input tokens', min: 0.05, max: 20, step: 0.05, value: 3, unit: '$' },
      { id: 'pout', label: 'Price per 1M output tokens', min: 0.2, max: 80, step: 0.2, value: 15, unit: '$' },
      { id: 'hit', label: 'Cache hit rate', min: 0, max: 60, step: 1, value: 10, unit: '%' }
    ],
    outputs: [
      { label: 'Input tokens per minute (provider TPM needed)', f: (v) => v.rps * 60 * v.tin * (1 - v.hit / 100) },
      { label: 'Output tokens per minute', f: (v) => v.rps * 60 * v.tout * (1 - v.hit / 100) },
      { label: 'Concurrent open streams (≈ 60 tok/s decode)', f: (v) => v.rps * (v.tout / 60) * (1 - v.hit / 100) },
      { label: 'Cost per day', fmt: 'raw', f: (v) => '$' + SD.fmt.num(v.rps * 86400 * (1 - v.hit / 100) * (v.tin * v.pin + v.tout * v.pout) / 1e6) },
      { label: 'Saved per day by the cache', fmt: 'raw', f: (v) => '$' + SD.fmt.num(v.rps * 86400 * (v.hit / 100) * (v.tin * v.pin + v.tout * v.pout) / 1e6) },
      { label: 'Usage events to meter per day', f: (v) => v.rps * 86400 }
    ],
    note: 'Prices, decode speed and hit rate are <em>illustrative inputs</em>, not quotes. Concurrency follows Little\'s law: streams = arrival rate × stream duration. Output tokens usually cost several times more than input tokens, so a long answer can cost more than a long prompt.'
  },

  api: [
    { m: 'POST', p: '/v1/chat/completions', d: 'OpenAI-compatible request. <code>model</code> is an <b>alias</b> ("large-model"), not a provider id. Auth with a team\'s virtual key.' },
    { m: 'SSE', p: '/v1/chat/completions (stream: true)', d: 'Tokens stream straight through. The gateway counts them on the way and adds a final usage event.' },
    { m: 'POST', p: '/admin/keys', d: 'Create a virtual key: <code>{team, budget_usd_month, tpm, rpm, allowed_models, guardrails}</code>.' },
    { m: 'GET', p: '/admin/usage?team&from&to', d: 'Tokens, cost, cache hits and errors by team, model and feature tag, for chargeback.' },
    { m: 'POST', p: '/admin/routes', d: 'Alias → ordered deployments, weights, fallbacks and retry policy. Hot-reloaded without a deploy.' }
  ],
  dataModel: [
    { name: 'token bucket', store: 'Redis hash per key', fields: [['tb:{team}:{model}', 'key', 'pk'], ['tokens', 'float'], ['ts', 'unix seconds'], ['rate, burst', 'from key config']], note: 'Refilled lazily inside a Lua script, so check-and-take is atomic across all gateway pods.' },
    { name: 'virtual_keys', store: 'Postgres', fields: [['key_hash', 'sha256', 'pk'], ['team_id', 'text', 'idx'], ['budget_usd_month', 'numeric'], ['tpm, rpm', 'int'], ['allowed_models', 'text[]'], ['guardrails', 'jsonb']], note: 'Only a hash of the key is stored. Config is cached in each pod for a few seconds.' },
    { name: 'usage_events', store: 'Kafka → ClickHouse', fields: [['request_id', 'uuid', 'pk'], ['team_id, feature', 'text', 'idx'], ['provider, model', 'text'], ['tokens_in, tokens_out', 'int'], ['cost_usd', 'decimal'], ['cache', 'none | exact | semantic'], ['ts', 'timestamp', 'sk']], note: 'Append-only. Cost is computed with the price table that was valid at request time.' },
    { name: 'semantic_cache', store: 'Vector index + KV', fields: [['id', 'uuid', 'pk'], ['scope', 'model + system prompt hash', 'idx'], ['embedding', 'vector', 'idx'], ['response', 'text'], ['expires_at', 'ts']], note: 'Scoped so that two different system prompts can never share an answer.' }
  ],

  architecture: {
    title: 'LLM gateway',
    nodes: [
      { id: 'apps', label: 'Apps / agents', sub: 'virtual key per team', kind: 'client', wide: [90, 200], tall: [210, 0], tip: 'Call one OpenAI-style endpoint with a model alias and their team\'s virtual key.' },
      { id: 'gw', label: 'Gateway', sub: 'auth · budgets · stream', kind: 'edge', wide: [280, 200], tall: [210, 105], tip: 'Stateless proxy pods. Authenticate the key, enforce limits, run guardrails, then proxy the stream.' },
      { id: 'rl', label: 'Token limiter', sub: 'Redis token buckets', kind: 'cache', wide: [280, 80], tall: [70, 105], tip: 'One bucket per team and model, refilled at the team\'s tokens-per-minute rate. A Lua script makes check-and-take atomic.' },
      { id: 'guard', label: 'Guardrails', sub: 'PII redact · policy', kind: 'compute', wide: [470, 80], tall: [350, 105], tip: 'Regex and NER redaction for emails, cards and IDs; optional classifier for jailbreaks and policy. Adds latency, so keep the fast checks inline.' },
      { id: 'cache', label: 'Response cache', sub: 'exact + semantic', kind: 'cache', wide: [470, 200], tall: [210, 210], tip: 'Exact: hash of (model, params, messages). Semantic: nearest past prompt above a similarity threshold, scoped by model and system prompt.' },
      { id: 'router', label: 'Router', sub: 'pick model · fallback', kind: 'service', wide: [660, 200], tall: [210, 315], tip: 'Maps an alias to deployments. Picks by cost, latency or a cascade, retries, and fails over on 429/5xx with cooldowns.' },
      { id: 'pA', label: 'Provider A', sub: 'hosted API', kind: 'external', wide: [860, 90], tall: [70, 420], tip: 'A hosted model API with its own RPM and TPM limits per organization.' },
      { id: 'pB', label: 'Provider B', sub: 'hosted API', kind: 'external', wide: [860, 200], tall: [210, 420], tip: 'A second provider with a comparable model, used for fallback and load balancing.' },
      { id: 'self', label: 'Self-hosted', sub: 'vLLM on own GPUs', kind: 'ml', wide: [860, 310], tall: [350, 420], tip: 'Open-weight small model on your own GPUs: cheap for easy requests and for data that may not leave.' },
      { id: 'meter', label: 'Usage metering', sub: 'tokens → $ per team', kind: 'queue', wide: [470, 320], tall: [350, 210], tip: 'Every request emits a usage event (tokens, model, cost, cache) to Kafka.' },
      { id: 'obs', label: 'Billing + traces', sub: 'ClickHouse · alerts', kind: 'store', wide: [280, 320], tall: [350, 315], tip: 'Chargeback dashboards, budget alerts, latency and error tracing per provider.' }
    ],
    edges: [
      { from: 'apps', to: 'gw', bidi: true },
      { from: 'gw', to: 'rl', bidi: true },
      { from: 'gw', to: 'guard', bidi: true },
      { from: 'guard', to: 'cache', bidi: true },
      { from: 'cache', to: 'router', bidi: true },
      { from: 'router', to: 'pA', bidi: true },
      { from: 'router', to: 'pB', bidi: true },
      { from: 'router', to: 'self', bidi: true },
      { from: 'router', to: 'meter' },
      { from: 'meter', to: 'obs' }
    ]
  },

  scenarios: [
    {
      id: 'hit', title: 'Request served from cache', tone: 'ok',
      steps: [
        { text: 'The support bot sends a request with the <b>support</b> team\'s virtual key and <code>model: "large-model"</code>.', flow: ['apps>gw'], badges: { gw: 'key → team support' } },
        { text: 'The token limiter reserves <b>input estimate + max_tokens</b> from the team\'s bucket. There is room.', flow: ['gw>rl', 'rl>gw'], badges: { rl: '−2.4K tokens' } },
        { text: 'Guardrails replace the customer\'s email with a placeholder. The cache key is built from the <i>redacted</i> prompt.', flow: ['gw>guard'], badges: { guard: 'email → [EMAIL_1]' } },
        { text: 'No exact match, but a past prompt is <b>0.97 similar</b>, above the 0.95 threshold, with the same model and system prompt. Cache hit.', flow: ['guard>cache'], ok: ['cache'], badges: { cache: ['semantic hit 0.97', 'ok'] }, tone: 'ok' },
        { text: 'The cached answer returns in tens of ms. No provider is called; the reservation is refunded except a small cache fee.', flow: ['cache>guard', 'guard>gw', 'gw>apps'], badges: { apps: '≈ 40 ms' }, tone: 'ok' }
      ]
    },
    {
      id: 'fallback', title: 'Provider 429 / 5xx → fallback', tone: 'warn',
      steps: [
        { text: 'Cache miss. The router sends the request to provider A, the cheapest deployment for this alias.', flow: ['apps>gw', 'gw>guard', 'guard>cache', 'cache>router', 'router>pA'] },
        { text: 'Provider A answers <b>429</b> with a <code>retry-after</code> header: the organization hit its tokens-per-minute limit.', flow: ['pA>router'], warn: ['pA'], badges: { pA: ['429 · retry-after 12s', 'warn'] }, tone: 'warn' },
        { text: 'The router puts A on <b>cooldown</b> for that window instead of hammering it, and retries on provider B, which serves the same capability tier.', flow: ['router>pB'], badges: { router: 'A cooling 12 s' } },
        { text: 'B streams the answer back. Apps never see the 429. Usage is logged against B\'s price table.', flow: ['pB>router', 'router>cache', 'cache>guard', 'guard>gw', 'gw>apps', 'router>meter'], ok: ['pB'], tone: 'ok' },
        { text: 'Mid-stream failures are different: tokens were already sent. Retrying would duplicate text, so the gateway ends the stream with an error event instead.', nodes: ['router', 'pB'], warn: ['pB'], badges: { pB: ['drop at token 180', 'warn'] } }
      ]
    },
    {
      id: 'budget', title: 'Batch job hits its token budget', tone: 'err',
      steps: [
        { text: 'The analytics team launches a backfill: hundreds of requests with <b>10K-token prompts</b>, all on the shared provider quota.', flow: [['apps>gw', 'apps>gw'], 'gw>rl'], warn: ['rl'], badges: { rl: ['analytics: draining', 'warn'] }, tone: 'warn' },
        { text: 'Its token bucket empties. The gateway returns <b>429</b> with <code>retry-after</code> to <i>that team only</i>, before any provider call.', flow: ['rl>gw', 'gw>apps'], err: ['rl'], badges: { apps: ['429 analytics', 'err'] }, tone: 'err' },
        { text: 'The support team has its own bucket, so its traffic keeps flowing at normal latency. A request-count limit would have let the backfill through.', flow: ['gw>rl', 'gw>guard', 'guard>cache', 'cache>router', 'router>pA'], ok: ['pA'], badges: { rl: ['support: ok', 'ok'] }, tone: 'ok' },
        { text: 'Metering shows analytics at 100% of its monthly budget. An alert fires, and the job is moved to a cheaper model or a batch API.', flow: ['router>meter', 'meter>obs'], badges: { obs: ['budget 100%', 'err'] } }
      ]
    },
    {
      id: 'stream', title: 'Streaming with token counting', tone: 'info',
      steps: [
        { text: 'A chat request with <code>stream: true</code>. The gateway opens an upstream stream and an SSE response to the app. It must <b>not buffer</b>.', flow: ['apps>gw', 'gw>guard', 'guard>cache', 'cache>router', 'router>pB'] },
        { text: 'Each chunk is forwarded as it arrives. The gateway counts output tokens as they pass, so it can cut the stream if a hard budget runs out.', flow: ['pB>router', 'router>cache', 'cache>guard', 'guard>gw', 'gw>apps'], badges: { gw: '312 tokens…' } },
        { text: 'The provider\'s final event carries exact <b>usage</b>. The gateway refunds <code>max_tokens − used</code> to the bucket.', flow: ['gw>rl'], badges: { rl: '+700 refund' }, tone: 'ok' },
        { text: 'A usage event (team, model, tokens in/out, cost, cache status, latency) goes to Kafka for billing and dashboards.', flow: ['router>meter', 'meter>obs'], ok: ['obs'] }
      ]
    },
    {
      id: 'pii', title: 'PII redacted before it leaves', tone: 'warn',
      steps: [
        { text: 'A prompt contains a customer\'s card number and phone number.', flow: ['apps>gw', 'gw>guard'], warn: ['guard'], badges: { guard: ['2 PII spans', 'warn'] }, tone: 'warn' },
        { text: 'Guardrails replace them with stable placeholders (<code>[CARD_1]</code>, <code>[PHONE_1]</code>) and keep the mapping in memory for this request only.', nodes: ['guard'], ok: ['guard'], badges: { guard: ['redacted', 'ok'] } },
        { text: 'Only the redacted prompt reaches the provider and the logs. The self-hosted model is allowed for prompts that must not leave at all.', flow: ['guard>cache', 'cache>router', 'router>self'], ok: ['self'] },
        { text: 'On the way back, placeholders in the answer can be restored for the user. The trade-off: inline checks add latency, and regexes miss some PII.', flow: ['self>router', 'router>cache', 'cache>guard', 'guard>gw', 'gw>apps'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Route a typical workload (illustrative: 1.5K tokens in, 300 out, 30% of requests truly need the large model). Watch cost, latency, cache correctness and fairness.',
    controls: [
      { id: 'route', label: 'Routing', type: 'seg', value: 'fixed', options: [
        { v: 'fixed', l: 'Fixed: large model' }, { v: 'cost', l: 'Cost-aware classifier' }, { v: 'latency', l: 'Latency-based' }, { v: 'cascade', l: 'Cascade small → large' }] },
      { id: 'cache', label: 'Cache', type: 'seg', value: 'exact', options: [
        { v: 'none', l: 'None' }, { v: 'exact', l: 'Exact match' }, { v: 'semantic', l: 'Semantic' }] },
      { id: 'th', label: 'Semantic similarity threshold', type: 'range', min: 0.8, max: 0.99, step: 0.01, value: 0.95, fmt: (v) => v.toFixed(2) },
      { id: 'unit', label: 'Rate-limit unit', type: 'seg', value: 'tokens', options: [
        { v: 'req', l: 'Requests / min' }, { v: 'tokens', l: 'Tokens / min' }] },
      { id: 'guard', label: 'Guardrails', type: 'seg', value: 'regex', options: [
        { v: 'off', l: 'Off' }, { v: 'regex', l: 'Regex / NER redaction' }, { v: 'llm', l: '+ LLM policy classifier' }] }
    ],
    evaluate(s) {
      const LARGE = 1500 * 3e-6 + 300 * 15e-6, SMALL = 1500 * 0.25e-6 + 300 * 1.25e-6;   // $ per request, illustrative prices
      const LAT_L = 2.0, LAT_S = 0.7;                                                 // s, illustrative
      const R = {
        fixed: { cost: LARGE, lat: LAT_L, q: 1.0, sub: 'all → large' },
        cost: { cost: 0.62 * SMALL + 0.38 * LARGE, lat: 0.62 * LAT_S + 0.38 * LAT_L, q: 0.95, sub: 'classifier picks tier' },
        latency: { cost: LARGE, lat: LAT_L * 0.8, q: 1.0, sub: 'fastest healthy one' },
        cascade: { cost: SMALL + 0.3 * LARGE, lat: LAT_S + 0.3 * LAT_L, q: 0.98, sub: 'small → large if unsure' }
      }[s.route];
      const span = (0.99 - s.th) / 0.19;                       // 0 at 0.99, 1 at 0.80
      const hit = { none: 0, exact: 0.08, semantic: 0.08 + 0.35 * span }[s.cache];
      const wrong = s.cache === 'semantic' ? 0.12 * span * span : 0;   // share of all requests answered with a wrong cached reply
      const gLat = { off: 0, regex: 0.005, llm: 0.25 }[s.guard];
      const gCost = s.guard === 'llm' ? SMALL * 0.6 : 0;
      const cost = (1 - hit) * R.cost + gCost + (s.cache === 'semantic' ? 0.00002 : 0);
      const lat = (1 - hit) * R.lat + hit * 0.04 + gLat;
      const metrics = [
        { k: 'Cost per 1K requests', v: '$' + (cost * 1000).toFixed(2), s: clamp01(1 - cost / (LARGE * 1.15)), hint: 'illustrative prices' },
        { k: 'Latency p50', v: '≈ ' + lat.toFixed(2) + ' s', s: clamp01(1 - lat / 2.6) },
        { k: 'Cache hit rate', v: (hit * 100).toFixed(0) + '%', s: clamp01(hit / 0.45) },
        { k: 'Wrong cached answers', v: s.cache === 'semantic' ? (wrong * 100).toFixed(1) + '% of requests' : 'none', s: clamp01(1 - wrong / 0.06) },
        { k: 'Answer quality vs large', v: Math.round(R.q * 100) + '%', s: clamp01((R.q - 0.85) / 0.15) },
        { k: 'Fair share under load', v: s.unit === 'tokens' ? 'a 10K-token job pays for 10K tokens' : 'a 10K-token request counts as 1', s: s.unit === 'tokens' ? 0.92 : 0.3 },
        { k: 'PII exposure', v: { off: 'raw prompts reach providers and logs', regex: 'common patterns redacted', llm: 'redacted + policy checks' }[s.guard], s: { off: 0.1, regex: 0.75, llm: 0.92 }[s.guard] }
      ];
      const notes = [];
      if (s.route === 'cascade') notes.push('A cascade tries the small model first and escalates when a check (confidence, validator, judge) fails. FrugalGPT reported large savings this way, but escalations pay for <b>both</b> calls.');
      if (s.route === 'cost') notes.push('A classifier routes up front, so there is no double call, but misrouted hard prompts get a weaker answer.');
      if (s.route === 'latency') notes.push('Latency-based routing tracks recent time-to-first-token per deployment and prefers the fastest healthy one. Cost does not change.');
      if (s.cache === 'semantic' && s.th < 0.9) notes.push('At ' + s.th.toFixed(2) + ' "refund <i>status</i>" and "refund <i>policy</i>" start to match. A cheap wrong answer is worse than an expensive right one.');
      if (s.cache === 'semantic' && s.th >= 0.97) notes.push('Very strict threshold: almost only near-identical prompts hit, so the cache barely beats exact match.');
      if (s.cache === 'exact') notes.push('Exact caching is safe but only hits identical (model, params, messages). Most useful for deterministic calls (temperature 0) and repeated system tasks.');
      if (s.unit === 'req') notes.push('Providers enforce input and output <b>tokens</b> per minute. Counting requests lets a few huge prompts drain the shared quota and cause 429s for everyone.');
      if (s.guard === 'llm') notes.push('An LLM classifier on every request adds a model call (~' + Math.round(gLat * 1000) + ' ms here). Run it async or only on risky routes when latency matters.');
      let verdict;
      if (s.cache === 'semantic' && wrong > 0.02) verdict = '❌ <b>The cache is answering the wrong questions</b> (' + (wrong * 100).toFixed(1) + '% of requests). Raise the threshold or scope the cache more tightly.';
      else if (s.unit === 'req') verdict = '⚠ <b>Request limits are unfair for LLMs.</b> Switch to token buckets that reserve max_tokens and refund the rest.';
      else if (s.guard === 'off') verdict = '⚠ <b>Raw PII flows to third parties and into logs.</b> Add at least regex/NER redaction inline.';
      else if (s.route === 'cascade' && s.cache !== 'none') verdict = '✅ <b>Big savings, small quality loss:</b> cascade routing plus caching cuts cost by about ' + Math.round((1 - cost / LARGE) * 100) + '% versus always calling the large model.';
      else if (s.route === 'fixed') verdict = '👍 <b>Simple and safe, but the most expensive.</b> Most traffic does not need the large model.';
      else verdict = '👍 <b>Reasonable.</b> Check the meters to see what you trade between cost, latency and quality.';
      const hide = [];
      if (s.cache === 'none') hide.push('cache');
      if (s.guard === 'off') hide.push('guard');
      if (s.route === 'fixed' || s.route === 'latency') hide.push('self');
      const flow = ['apps>gw', 'gw>rl'];
      if (s.guard !== 'off') flow.push('gw>guard');
      if (s.cache !== 'none') flow.push(s.guard !== 'off' ? 'guard>cache' : 'gw>cache', 'cache>router');
      else flow.push(s.guard !== 'off' ? 'guard>router' : 'gw>router');
      if (s.route === 'cascade') flow.push('router>self', 'router>pA');
      else if (s.route === 'cost') flow.push(['router>self', 'router>pA']);
      else if (s.route === 'latency') flow.push(['router>pA', 'router>pB']);
      else flow.push('router>pA');
      flow.push('router>meter');
      return {
        metrics, verdict, notes, hide, flow,
        labels: {
          router: { label: 'Router', sub: R.sub },
          cache: { label: 'Response cache', sub: s.cache === 'semantic' ? 'semantic ≥ ' + s.th.toFixed(2) : 'exact hash' },
          rl: { label: 'Rate limiter', sub: s.unit === 'tokens' ? 'token buckets / team' : 'requests / min / team' },
          self: { label: 'Small model', sub: 'self-hosted vLLM' },
          pA: { label: 'Large model', sub: 'provider A' },
          pB: { label: 'Large model', sub: 'provider B' }
        },
        hot: s.cache === 'semantic' && wrong > 0.02 ? [] : hit > 0.2 ? ['cache'] : [],
        err: s.cache === 'semantic' && wrong > 0.02 ? ['cache'] : [],
        warn: s.unit === 'req' ? ['rl'] : [],
        badges: { router: ['$' + (cost * 1000).toFixed(2) + ' / 1K', 'info'] }
      };
      function clamp01(x) { return Math.max(0.03, Math.min(1, x)); }
    }
  },

  widget: {
    title: 'Route a live workload: cache, cascade and token buckets',
    caption: 'Two teams send requests: <b>support</b> (short prompts, some of them repeated FAQs) and a <b>batch</b> job (one-off 10K-token prompts). Each request has a real embedding, so the <b>semantic cache</b> really compares cosine similarity, and near-duplicate intents can collide at low thresholds. Rate limits are real <b>token buckets</b>, per team and at the provider. Prices and speeds are illustrative.'
  },

  realWorld: {
    intro: 'Open-source proxies, managed edge gateways and API-gateway plugins all converged on the same feature set.',
    timeline: [
      { when: '2023', who: 'Zilliz', title: 'GPTCache', text: 'An open-source semantic cache: embed the prompt, search a vector store for similar past prompts, and return the cached answer once a similarity check passes a threshold. Zilliz notes it can produce false positives and negatives.', src: 4 },
      { when: 'May 2023', who: 'Stanford', title: 'FrugalGPT: LLM cascades', text: 'Chen, Zaharia and Zou describe prompt adaptation, LLM approximation and <b>LLM cascades</b>. On their benchmarks a learned cascade matched the best single model with <b>up to 98% lower cost</b>.', src: 6 },
      { when: 'Docs', who: 'LiteLLM', title: 'Retries, fallbacks, load balancing', text: 'Deployments listed under the same <code>model_name</code> are load-balanced. After <code>num_retries</code> fail, the router <b>falls back</b> to another model group, configured in <code>router_settings</code>.', src: 0 },
      { when: 'Docs', who: 'Portkey', title: 'Open-source AI gateway', text: 'Fallbacks triggered on chosen status codes, weighted load balancing, conditional routing and guardrail checks, configured as JSON.', src: 1 },
      { when: 'Docs', who: 'Cloudflare', title: 'AI Gateway at the edge', text: 'Caching with configurable TTL, rate limiting by requests per window (sliding or fixed), and retries plus model fallbacks through a universal endpoint that takes an ordered list of providers.', src: 2 },
      { when: 'Docs', who: 'Kong', title: 'AI rate limiting and semantic cache', text: 'Kong\'s AI Rate Limiting Advanced plugin limits LLM traffic. Its changelog includes a fix so that <b>semantic-cache hits no longer decrement token counters</b>: an easy bug when caching and limiting interact.', src: 3 },
      { when: 'Docs', who: 'Anthropic', title: 'Provider limits are in tokens', text: 'Limits are measured in <b>requests per minute, input tokens per minute and output tokens per minute</b>, by usage tier. Exceeding one returns a 429 with a <code>retry-after</code> header.', src: 5 }
    ],
    lessons: [
      'Limit and bill in <b>tokens</b>. Requests are the wrong unit for LLMs.',
      'Treat providers as <b>interchangeable deployments</b> behind an alias, with cooldowns and fallbacks.',
      'A semantic cache is a <b>correctness</b> risk, not just a performance feature. Scope it and keep the threshold high.',
      'Keep the gateway <b>stateless</b>: counters in Redis, config cached, usage to a log.'
    ],
    sources: [
      { title: 'Proxy: fallbacks, retries, load balancing (reliability)', url: 'https://docs.litellm.ai/docs/proxy/reliability', pub: 'LiteLLM docs' },
      { title: 'AI Gateway', url: 'https://portkey.ai/docs/product/ai-gateway', pub: 'Portkey docs' },
      { title: 'AI Gateway features', url: 'https://developers.cloudflare.com/ai-gateway/features/', pub: 'Cloudflare docs' },
      { title: 'AI Rate Limiting Advanced: changelog', url: 'https://developer.konghq.com/plugins/ai-rate-limiting-advanced/changelog/', pub: 'Kong docs' },
      { title: 'What is GPTCache?', url: 'https://zilliz.com/what-is-gptcache', pub: 'Zilliz' },
      { title: 'Our approach to API rate limits', url: 'https://support.anthropic.com/en/articles/8243635-our-approach-to-api-rate-limits', pub: 'Anthropic support' },
      { title: 'FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance', url: 'https://arxiv.org/abs/2305.05176', pub: 'arXiv, 2023' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Limit unit', '<b>Requests/min</b>: simple, familiar', '<b>Tokens/min</b>: matches provider limits and cost', 'Tokens for LLM traffic; keep a request limit only as abuse protection'],
      ['Cache', '<b>Exact</b>: always correct, low hit rate', '<b>Semantic</b>: more hits, can return wrong answers', 'Exact by default; semantic only for FAQ-like traffic with a high threshold'],
      ['Routing', '<b>Classifier up front</b>: one call', '<b>Cascade</b>: small first, escalate on doubt', 'Cascade when most prompts are easy and you can check answers cheaply'],
      ['Guardrails', '<b>Inline</b>: blocks before it leaves', '<b>Async</b>: no latency, detect after the fact', 'Inline regex/NER always; heavy classifiers async or on risky routes'],
      ['Redis down', '<b>Fail open</b>: traffic flows unmetered', '<b>Fail closed</b>: safe spend, outage for users', 'Fail open with local per-pod limits and an alert'],
      ['Build or buy', '<b>Self-hosted proxy</b> (LiteLLM, Portkey OSS)', '<b>Managed</b> (Cloudflare, Kong)', 'Self-host when prompts must stay in your network']
    ]
  },
  failures: [
    { f: 'Provider outage or 5xx', detect: 'Error rate per deployment', fix: 'Cooldown the deployment, fall back to another provider for the same alias, alert.' },
    { f: '429 retry storm', detect: 'Rising 429s and retries per second', fix: 'Honor retry-after, add jitter, cap retries, and shed load with per-team buckets.' },
    { f: 'Semantic cache returns wrong answers', detect: 'Sampled audits; thumbs-down on cache hits', fix: 'Raise the threshold, scope by model + system prompt + tenant, add TTLs.' },
    { f: 'Redis (limiter) unavailable', detect: 'Script errors and timeouts', fix: 'Fail open with conservative in-pod buckets; alert; reconcile spend from usage logs.' },
    { f: 'Stream breaks mid-response', detect: 'Upstream disconnect after first byte', fix: 'Do not retry silently; send an error event, bill tokens already produced.' },
    { f: 'Runaway agent spend', detect: 'Budget burn rate alerts', fix: 'Hard monthly budgets per key, per-request max_tokens caps, kill switch per key.' },
    { f: 'PII in logs', detect: 'Log scanning', fix: 'Redact before logging, log hashes and token counts, not prompts, by default.' }
  ],

  interview: [
    { q: 'Why rate-limit by tokens instead of requests?', a: '<p>Cost, GPU time and provider quotas all scale with <b>tokens</b>. Providers enforce input and output tokens per minute. A request limit treats a 50-token prompt and a 50K-token prompt the same, so one batch job with huge prompts can drain the shared provider quota and cause 429s for every team.</p>', lvl: 'core' },
    { q: 'You do not know the output length up front. How do you charge tokens?', a: '<p>Reserve <b>input estimate + max_tokens</b> from the bucket before calling the provider. When the stream ends, read the exact usage and <b>refund</b> the difference. Cap <code>max_tokens</code> per key so reservations stay sane.</p><p>Alternative: charge after the fact and let a bucket go negative (debt), which blocks the next requests instead.</p>', lvl: 'deep' },
    { q: 'What are the risks of a semantic cache?', a: '<ul><li><b>Wrong answers</b>: "cancel my order" ≈ "cancel my subscription".</li><li><b>Data leaks</b> across users or tenants if the scope is too wide.</li><li><b>Stale</b> answers after facts change.</li></ul><p>Mitigate with a high threshold, a scope key (model, system prompt, tenant), TTLs, no caching of personalized or tool-using requests, and audits of hits.</p>', lvl: 'core' },
    { q: 'How do you stream responses through a proxy?', a: '<p>Use a non-blocking server (WebFlux, Netty, Go) and forward each SSE chunk as it arrives: <b>no buffering</b> in the gateway or any load balancer in front of it, long idle timeouts, and heartbeats. Propagate client cancellation upstream so you stop paying for tokens nobody reads.</p><p>Count tokens on the way through, and use the provider\'s final usage event as the source of truth.</p>', lvl: 'core' },
    { q: 'How do you fail over between providers safely?', a: '<p>Map an alias to several <b>equivalent</b> deployments. On 429 or 5xx, put that deployment on cooldown (respecting retry-after) and retry on the next one.</p><p>Watch for differences: prompt formats, tool-calling schemas, context limits, tokenizers and output quality. Never retry after tokens have streamed, and keep retries bounded.</p>', lvl: 'core' },
    { q: 'How do you attribute cost to teams and features?', a: '<p>Give each team a <b>virtual key</b> and let callers add tags (feature, user). For every request, log tokens in/out from the provider\'s usage field, the model, cache status and the <b>price valid at that time</b>. Aggregate in a column store for chargeback and budget alerts.</p>', lvl: 'core' },
    { q: 'Cascade or classifier routing?', a: '<p>A <b>classifier</b> picks the model up front: one call, but a misrouted hard prompt gets a weak answer. A <b>cascade</b> always tries the small model and escalates when a check fails (confidence, a validator, a judge): better quality, but escalated requests pay for two calls and more latency.</p><p>Cascades win when most traffic is easy and answers are cheap to verify.</p>', lvl: 'deep' },
    { q: 'What goes into an exact-cache key?', a: '<p>Everything that changes the output: model id, system prompt, messages, tools, temperature and other sampling parameters, and the tenant. Hash the canonical JSON.</p><p>Only cache deterministic calls (temperature 0) or calls where any valid answer is fine. Skip requests with tool calls or user-specific data.</p>', lvl: 'core' },
    { q: 'Where should PII redaction happen, and what does it cost?', a: '<p>In the gateway, <b>before</b> caching, logging and the provider call, so no path sees raw PII. Use fast regex/NER inline (a few ms). LLM-based classifiers are more accurate but add a model call, so run them async or only on risky routes.</p><p>Use reversible placeholders if the answer must refer back to the data.</p>', lvl: 'deep' },
    { q: 'What if Redis, which holds the buckets, goes down?', a: '<p>Decide up front: <b>fail open</b> (traffic flows, spend unmetered for a while) or <b>fail closed</b> (safe, but an outage). Most teams fail open with a conservative <b>local, per-pod bucket</b> as a backstop, alert, and reconcile spend from usage logs afterwards.</p>', lvl: 'deep' },
    { q: 'How does provider prompt caching relate to a gateway cache?', a: '<p>A <b>gateway cache</b> skips the model call entirely, but only for repeated or similar prompts. <b>Provider prompt caching</b> reuses the computed prefix (a long system prompt or document) inside the provider, so every call still runs but the shared prefix is cheaper and faster.</p><p>They complement each other: keep stable prefixes identical so the provider cache hits.</p>', lvl: 'deep' },
    { q: 'Which metrics would you put on the gateway dashboard?', a: '<ul><li>Time to first token and total latency per deployment.</li><li>429 and 5xx rates per provider, fallbacks per minute.</li><li>Tokens and dollars per team, budget burn rate.</li><li>Cache hit rate and audited wrong-hit rate.</li><li>Guardrail blocks and redactions.</li></ul>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Spring WebFlux: SSE proxy with token-bucket accounting', lang: 'java',
      code: `@RestController
public class LlmProxy {
  private static final ParameterizedTypeReference<ServerSentEvent<String>> SSE = new ParameterizedTypeReference<>() {};
  private final WebClient provider;                 // baseUrl + auth header set in config
  private final ReactiveStringRedisTemplate redis;
  private final RedisScript<Long> take = RedisScript.of(new ClassPathResource("token_bucket.lua"), Long.class);

  public LlmProxy(WebClient provider, ReactiveStringRedisTemplate redis) {
    this.provider = provider; this.redis = redis;
  }

  @PostMapping(path = "/v1/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public Flux<ServerSentEvent<String>> chat(@RequestHeader("X-Team") String team,
                                            @RequestBody ChatRequest req) {
    String key = "tb:" + team;
    long reserve = req.inputTokenEstimate() + req.maxTokens();      // worst case
    AtomicLong produced = new AtomicLong();
    return redis.execute(take, List.of(key), List.of(String.valueOf(reserve), "3000", "180000"))
        .next()                                                     // args: cost, tokens/s, burst
        .flatMapMany(granted -> granted == 1L
            ? provider.post().uri("/v1/chat").bodyValue(req.withStream(true))
                .retrieve().bodyToFlux(SSE)                         // forwarded chunk by chunk
                .doOnNext(ev -> produced.addAndGet(Usage.outputTokens(ev)))
                .doFinally(sig -> {                                 // complete, error or cancel
                  long unused = req.maxTokens() - produced.get();
                  if (unused > 0) redis.opsForHash().increment(key, "tokens", (double) unused).subscribe();
                })
            : Flux.<ServerSentEvent<String>>error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "team token budget exhausted")));
  }
}`,
      note: 'Client cancellation propagates upstream automatically, so a closed tab stops the provider stream. The refund uses <code>HINCRBYFLOAT</code> (the bucket holds a float); the script caps the bucket at its burst on the next call. Production code also sets <code>Retry-After</code> on the 429.'
    },
    {
      title: 'Redis Lua: atomic token bucket (check-and-take)', lang: 'lua',
      code: `-- KEYS[1] = bucket hash; ARGV = cost, rate (tokens/s), burst (max tokens)
local t = redis.call('TIME')
local now = tonumber(t[1]) + tonumber(t[2]) / 1e6
local cost  = tonumber(ARGV[1])
local rate  = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])

local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or burst
local ts     = tonumber(b[2]) or now

tokens = math.min(burst, tokens + math.max(0, now - ts) * rate)   -- lazy refill
local granted = 0
if tokens >= cost then
  tokens = tokens - cost
  granted = 1
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', KEYS[1], math.ceil(burst / rate) * 2)
return granted`,
      note: 'Using the Redis server\'s clock avoids skew between gateway pods. One script call = one round trip, and it is atomic, so two pods can never spend the same tokens.'
    },
    {
      title: 'LiteLLM proxy config: aliases, fallbacks, semantic cache', lang: 'yaml',
      code: `model_list:
  - model_name: large-model                  # alias the apps call
    litellm_params:
      model: anthropic/<large-model>
      api_key: os.environ/ANTHROPIC_API_KEY
      tpm: 400000                            # this deployment's limits
      rpm: 2000
  - model_name: large-model                  # same alias = load-balanced
    litellm_params:
      model: openai/<large-model>
      api_key: os.environ/OPENAI_API_KEY
  - model_name: small-model
    litellm_params:
      model: openai/<small-model>            # OpenAI-compatible vLLM server
      api_base: http://vllm.internal:8000/v1
      api_key: os.environ/VLLM_API_KEY

router_settings:
  num_retries: 2
  timeout: 60
  allowed_fails: 3                           # then cool the deployment down
  cooldown_time: 30
  fallbacks: [{"large-model": ["small-model"]}]

litellm_settings:
  cache: true
  cache_params:
    type: redis-semantic
    similarity_threshold: 0.95
    redis_semantic_cache_embedding_model: <embedding-model-alias>

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY  # virtual keys + budgets need a DB
  database_url: os.environ/DATABASE_URL`,
      note: 'Start with <code>litellm --config config.yaml</code>. Key names change between releases, so check them against the docs for your version.'
    }
  ],

  related: ['rate-limiter', 'api-gateway', 'llm-inference', 'rag-agent-platform', 'distributed-cache']
});
