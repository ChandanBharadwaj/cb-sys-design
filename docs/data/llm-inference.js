SD.register({
  slug: 'llm-inference',
  domain: 8,
  title: 'LLM Inference Engine',
  examples: 'vLLM, TensorRT-LLM',
  tagline: 'Serve a 70B-parameter model to thousands of concurrent users and stream tokens quickly. The scarce resource is not FLOPs but <b>GPU memory for the KV cache</b>.',
  tldr: {
    problem: 'Each generated token needs a full pass over the model weights plus the KV cache of every earlier token. GPUs are expensive, output lengths are unpredictable, and requests arrive at random.',
    idea: '<b>Continuous batching</b> (iteration-level scheduling) keeps the GPU full by letting requests join and leave the batch every step. <b>PagedAttention</b> stores the KV cache in fixed-size blocks behind a per-sequence block table, so memory is not wasted on reservations. <b>Prefix caching</b> reuses shared prompts.',
    insight: '<b>Prefill</b> (whole prompt in one pass) is compute-bound. <b>Decode</b> (one token per step) is memory-bandwidth-bound: every step re-reads the weights and the KV cache. A bigger batch amortizes that read, and batch size is limited by KV memory. So <b>KV memory ≈ throughput</b>.',
    numbers: [
      { v: '320 KiB', l: 'KV cache per token for a typical 70B model with grouped-query attention, FP16 (2 × 80 × 8 × 128 × 2 B)' },
      { v: '2–4×', l: 'throughput of vLLM vs FasterTransformer / Orca at the same latency (SOSP \'23)' },
      { v: '36.9×', l: 'Orca vs FasterTransformer throughput on a 175B-parameter model (OSDI \'22)' }
    ]
  },

  intro: {
    what: 'An LLM inference engine is the software that runs a trained large language model on GPUs and answers requests. It reads a prompt, writes the reply <b>one token (a small piece of a word) at a time</b>, and streams each token back as soon as it exists. Its job is to serve <b>many users at once</b> on as few expensive GPUs as possible.',
    analogy: {
      icon: '👨‍🍳',
      title: 'A chef who rereads the recipe book before every stir',
      text: 'Picture a chef who has to read the entire recipe book before each stir of any pan. Reading the book is slow, but one read can guide fifty pans as easily as one. So a smart chef keeps as many pans on the stove as the counter space allows, and slides a new pan in the moment one is done. The GPU is the chef, the model weights are the book, each pan is one user\'s reply, and the counter is GPU memory.'
    },
    problem: 'A chat assistant gets thousands of questions a minute. Every reply is built in many small steps, one per token, and nobody knows in advance how long a reply will be. GPUs are very expensive, so an idle GPU or wasted GPU memory costs real money. The core question is <b>how to keep every GPU busy with many replies at once, while each user still sees words appear quickly</b>.',
    story: [
      {
        stage: 'naive',
        title: 'Run one request at a time',
        text: 'Load the model onto a GPU (a chip built for fast parallel math). Take the next prompt from a queue, generate the full reply token by token, send it back, then start the next one. It is easy to build and fine for one developer testing.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'send prompts', kind: 'client', at: [70, 0] },
            { id: 'q', label: 'Queue', sub: 'first come', kind: 'queue', at: [350, 0] },
            { id: 'gpu', label: 'GPU + model', sub: 'one reply at once', kind: 'ml', at: [210, 110] }
          ],
          edges: [{ from: 'u', to: 'q' }, { from: 'q', to: 'gpu' }, { from: 'gpu', to: 'u' }],
          flow: ['u>q', 'q>gpu', 'gpu>u']
        }
      },
      {
        stage: 'breaks',
        title: 'The GPU idles while the line grows',
        text: 'Every step makes one token, but first it must <b>read all the model weights</b> from memory. With one reply in flight, the GPU spends most of its time waiting on memory, not doing math. Running a fixed group together helps a little, but short replies wait for the longest one, and memory reserved for each reply\'s <b>maximum length</b> sits mostly empty. The queue grows and the first word takes seconds.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users ×1000', sub: 'waiting', kind: 'client', at: [70, 0] },
            { id: 'q', label: 'Queue', sub: 'growing', kind: 'queue', at: [350, 0] },
            { id: 'gpu', label: 'GPU + model', sub: 'mostly idle', kind: 'ml', at: [210, 110] },
            { id: 'mem', label: 'GPU memory', sub: 'reserved, unused', kind: 'cache', at: [210, 220] }
          ],
          edges: [{ from: 'u', to: 'q' }, { from: 'q', to: 'gpu' }, { from: 'gpu', to: 'mem' }, { from: 'gpu', to: 'u' }],
          flow: [['u>q', 'u>q'], 'q>gpu', 'gpu>mem'],
          err: ['q'],
          warn: ['gpu', 'mem'],
          badges: { q: ['backlog', 'err'], u: ['slow ⏳', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Batch every step, hand out memory in blocks',
        text: 'A <b>scheduler</b> rebuilds the batch at <b>every step</b>: finished replies leave and waiting ones join at once. Each reply\'s saved work for earlier tokens (the <b>KV cache</b>) lives in small fixed-size blocks handed out only as needed, so many more replies fit in memory. One read of the weights now serves the whole batch.',
        scene: {
          nodes: [
            { id: 'u', label: 'Users', sub: 'send prompts', kind: 'client', at: [70, 0] },
            { id: 'q', label: 'Scheduler', sub: 'batch every step', kind: 'compute', at: [350, 0] },
            { id: 'gpu', label: 'GPU + model', sub: 'one big batch', kind: 'ml', at: [210, 110] },
            { id: 'mem', label: 'KV blocks', sub: 'small, on demand', kind: 'cache', at: [210, 220] }
          ],
          edges: [{ from: 'u', to: 'q' }, { from: 'q', to: 'gpu' }, { from: 'gpu', to: 'mem', bidi: true }, { from: 'gpu', to: 'u' }],
          flow: ['u>q', 'q>gpu', 'gpu>mem', 'gpu>u'],
          ok: ['gpu', 'mem'],
          badges: { gpu: ['full batch', 'ok'] }
        }
      }
    ],
    usedBy: ['vLLM (open source)', 'NVIDIA TensorRT-LLM', 'SGLang', 'Hugging Face Text Generation Inference', 'Hosted chat assistants and model APIs'],
    whenToUse: [
      'You run open-weight models on <b>your own GPUs</b> and pay for every GPU-hour',
      'Many users or agents call the model <b>at the same time</b>',
      'Replies must stream back quickly, word by word'
    ],
    whenNot: [
      'You only call hosted model APIs: put an <a href="llm-gateway.html">LLM Gateway</a> in front of them instead',
      'A few requests per hour: a hosted API or one simple server is cheaper than a tuned GPU fleet',
      'The model must answer from your own documents: that is retrieval (see <a href="rag-agent-platform.html">RAG &amp; AI Agent Platform</a>)'
    ],
    glossary: [
      { term: 'Token', def: 'A small piece of text, often part of a word. Models read and write text as tokens.' },
      { term: 'Prefill', def: 'The first phase: the model reads the whole prompt in one pass and produces the first token.' },
      { term: 'Decode', def: 'The second phase: the model produces one new token per step until the reply ends.' },
      { term: 'KV cache', def: 'Saved intermediate results (keys and values) for every earlier token, so each step does not redo the whole conversation.' },
      { term: 'Continuous batching', def: 'Rebuilding the batch at every step, so finished requests leave and new ones join right away.' },
      { term: 'PagedAttention', def: 'Storing the KV cache in small fixed-size blocks, like memory pages in an operating system, so little memory is wasted.' },
      { term: 'Prefix caching', def: 'Reusing the KV cache for a prompt start that many requests share, such as a common system prompt.' },
      { term: 'TTFT / TPOT', def: 'Time to first token and time per output token: how long until the first word appears, and how fast the rest follow.' }
    ]
  },

  requirements: {
    functional: [
      'OpenAI-compatible chat/completions API with streaming (SSE)',
      'Multiple models and LoRA adapters per cluster',
      'Sampling params: temperature, top-p, max_tokens, stop',
      'Long contexts (32K–128K tokens)',
      'Per-tenant quotas and priorities',
      'Usage accounting: prompt + completion tokens'
    ],
    nonFunctional: [
      'TTFT p95 < ~1 s for chat',
      'TPOT (time per output token) < ~50 ms, so streaming reads smoothly',
      'Maximize tokens/s per GPU: GPUs are the dominant cost',
      'No OOM crashes: degrade by queueing or preempting',
      'Survive a GPU / node failure without dropping the fleet',
      'Scale replicas with traffic (minutes, not hours)'
    ],
    outOfScope: ['Model training / fine-tuning', 'Prompt routing between providers (see LLM Gateway)', 'Retrieval (see RAG platform)', 'Safety classifiers']
  },

  calculator: {
    inputs: [
      { id: 'L', label: 'Layers', min: 1, max: 128, value: 80 },
      { id: 'H', label: 'KV heads (after GQA/MQA)', min: 1, max: 128, value: 8 },
      { id: 'D', label: 'Head dimension', min: 64, max: 256, step: 16, value: 128 },
      { id: 'B', label: 'Bytes per element (1 = FP8, 2 = FP16/BF16)', min: 1, max: 4, step: 1, value: 2, unit: 'B' },
      { id: 'ctx', label: 'Tokens per sequence (prompt + output)', min: 512, max: 131072, value: 8192, log: true },
      { id: 'seqs', label: 'Concurrent sequences', min: 1, max: 1024, value: 64, log: true }
    ],
    outputs: [
      { label: 'KV per token = 2 × L × H × D × B', fmt: 'bytes', f: (v) => 2 * v.L * v.H * v.D * v.B },
      { label: 'KV per sequence', fmt: 'bytes', f: (v) => 2 * v.L * v.H * v.D * v.B * v.ctx },
      { label: 'KV for the whole batch', fmt: 'bytes', f: (v) => 2 * v.L * v.H * v.D * v.B * v.ctx * v.seqs },
      { label: 'Sequences that fit in 40 GB of KV space', f: (v) => Math.floor(40e9 / (2 * v.L * v.H * v.D * v.B * v.ctx)) },
      { label: 'Decode step lower bound: read batch KV at ~3.35 TB/s', fmt: 'ms', f: (v) => (2 * v.L * v.H * v.D * v.B * v.ctx * v.seqs) / 3.35e12 * 1000 },
      { label: '80 GB GPUs needed just for this KV', f: (v) => Math.ceil((2 * v.L * v.H * v.D * v.B * v.ctx * v.seqs) / 80e9) }
    ],
    note: 'Defaults are a typical open 70B-parameter config (80 layers, 8 KV heads via grouped-query attention, head_dim 128). Per token: 2 × 80 × 8 × 128 × 2 B = <b>327,680 B = 320 KiB</b>, so one 8K-token sequence holds <b>2.5 GiB</b>. The factor 2 is K <i>and</i> V. With 64 query heads and no GQA it would be 8× more. ~3.35 TB/s HBM bandwidth is an <em>estimate</em> for one high-end GPU; weights are read every step on top of this.'
  },

  api: [
    { m: 'POST', p: '/v1/chat/completions', d: '<code>{model, messages, max_tokens, temperature, stream: true}</code>. Streams <code>data: {choices:[{delta}]}</code> chunks over SSE and ends with <code>data: [DONE]</code>.' },
    { m: 'POST', p: '/v1/completions', d: 'Raw prompt in, text out. Same streaming and usage fields.' },
    { m: 'GET', p: '/v1/models', d: 'Models and adapters loaded on this deployment.' },
    { m: 'GET', p: '/metrics', d: 'Prometheus: queue depth, running sequences, KV-cache usage %, TTFT / TPOT histograms, preemptions. The autoscaler and router read these.' },
    { m: 'RPC', p: 'router → engine: add_request / abort', d: 'Internal. <code>abort(request_id)</code> on client disconnect frees KV blocks immediately.' }
  ],
  dataModel: [
    { name: 'request', store: 'Scheduler (in memory)', fields: [['request_id', 'uuid', 'pk'], ['status', 'WAITING | RUNNING | PREEMPTED | DONE'], ['prompt_ids', 'int[]'], ['output_ids', 'int[]'], ['sampling', 'params'], ['priority, arrival', 'int, ts', 'idx']] },
    { name: 'block_table', store: 'Per sequence (CPU → GPU)', fields: [['seq_id', 'int', 'pk'], ['logical_block', 'int', 'sk'], ['physical_block', 'int', 'fk'], ['filled', '0..16 tokens']], note: 'Like a page table: logical blocks are contiguous, physical ones need not be.' },
    { name: 'kv_block', store: 'GPU HBM pool', fields: [['block_id', 'int', 'pk'], ['ref_count', 'int'], ['prefix_hash', 'hash(parent, tokens)', 'idx'], ['last_used', 'ts']], note: 'Shape per layer: [2, block_size, kv_heads, head_dim]. Shared blocks are copy-on-write.' }
  ],

  architecture: {
    title: 'LLM serving architecture',
    nodes: [
      { id: 'client', label: 'Apps / agents', sub: 'OpenAI-style API', kind: 'client', wide: [90, 110], tall: [70, 0], tip: 'Chat UIs, agents and batch jobs. They stream tokens and may disconnect mid-generation.' },
      { id: 'gw', label: 'API gateway', sub: 'auth · quotas · SSE', kind: 'edge', wide: [280, 110], tall: [210, 0], tip: 'AuthN, per-tenant token quotas, request size limits, and SSE streaming back to clients.' },
      { id: 'auto', label: 'Autoscaler', sub: 'queue & KV pressure', kind: 'service', wide: [280, 0], tall: [350, 0], tip: 'Adds or removes model replicas based on queue depth, KV usage and TTFT, not CPU. New replicas take minutes because the weights must load.' },
      { id: 'router', label: 'Router', sub: 'prefix + load aware', kind: 'service', wide: [470, 110], tall: [210, 105], tip: 'Chooses a replica. Sends requests that share a prefix to the same replica (cache hits) while avoiding overloaded ones.' },
      { id: 'mon', label: 'Metrics', sub: 'TTFT · TPOT · KV %', kind: 'store', wide: [470, 0], tall: [350, 105], tip: 'Time series of queue depth, running batch, KV-cache usage, preemptions and latency histograms.' },
      { id: 'sched', label: 'Scheduler', sub: 'continuous batching', kind: 'compute', wide: [660, 110], tall: [210, 210], tip: 'Each step it picks which sequences run: all running decodes plus prefill chunks that fit the token budget and the free KV blocks.' },
      { id: 'weights', label: 'Model weights', sub: '140 GB FP16 (70B)', kind: 'store', wide: [660, 0], tall: [350, 315], tip: 'Loaded from object storage or local NVMe at start-up. This is why cold starts take minutes.' },
      { id: 'gpu', label: 'GPU workers', sub: 'tensor parallel × 4', kind: 'ml', wide: [850, 110], tall: [210, 315], tip: 'The model sharded across GPUs (tensor parallel within a node, pipeline parallel across nodes). One forward pass per step for the whole batch.' },
      { id: 'kvm', label: 'KV block manager', sub: 'paged · 16-tok blocks', kind: 'cache', wide: [850, 220], tall: [70, 315], tip: 'Allocates fixed-size KV blocks from a GPU pool and keeps a block table per sequence. Ref-counts shared prefix blocks.' },
      { id: 'swap', label: 'CPU memory', sub: 'swap / offload', kind: 'store', wide: [850, 330], tall: [70, 420], tip: 'When GPU blocks run out, a preempted sequence\'s blocks can be swapped here, or simply dropped and recomputed later.' }
    ],
    edges: [
      { from: 'client', to: 'gw', bidi: true },
      { from: 'gw', to: 'router', bidi: true },
      { from: 'router', to: 'sched', bidi: true },
      { from: 'sched', to: 'gpu', bidi: true },
      { from: 'sched', to: 'kvm' },
      { from: 'gpu', to: 'kvm', bidi: true },
      { from: 'kvm', to: 'swap', bidi: true },
      { from: 'weights', to: 'gpu' },
      { from: 'sched', to: 'mon', dashed: true },
      { from: 'mon', to: 'auto', dashed: true },
      { from: 'auto', to: 'router', dashed: true, label: 'replicas' }
    ]
  },

  scenarios: [
    {
      id: 'gen', title: 'Request → prefill → decode loop', tone: 'info',
      steps: [
        { text: 'An agent sends <code>POST /v1/chat/completions</code> with <code>stream: true</code>. The gateway checks the tenant\'s token quota and opens an SSE stream.', flow: ['client>gw', 'gw>router'] },
        { text: 'The router picks a replica. The scheduler admits the request once there are enough <b>free KV blocks</b> for its 2,000-token prompt (125 blocks of 16).', flow: ['router>sched', 'sched>kvm'], badges: { kvm: '+125 blocks' } },
        { text: '<b>Prefill</b>: all 2,000 prompt tokens go through the model in one pass. Large matrix multiplies make this <b>compute-bound</b>. K and V for every layer are written into the blocks. The first token marks <b>TTFT</b>.', flow: ['sched>gpu', 'gpu>kvm'], badges: { gpu: 'prefill' } },
        { text: '<b>Decode</b>: each step produces one token per sequence by re-reading all weights plus the whole KV cache. That makes it <b>memory-bandwidth-bound</b>. Every token streams back immediately.', flow: ['gpu>sched', 'sched>router', 'router>gw', 'gw>client'], badges: { client: 'tok tok tok' } },
        { text: 'EOS or <code>max_tokens</code> ends the sequence. Its blocks return to the free pool at once, and the next step can admit someone else.', flow: ['sched>kvm'], badges: { kvm: ['−131 blocks', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'cb', title: 'New request joins mid-batch', tone: 'ok',
      steps: [
        { text: '32 sequences are decoding together. One finishes at step 37 while others need 400 more tokens.', nodes: ['sched', 'gpu'], badges: { sched: 'batch 32' } },
        { text: 'With <b>static batching</b> that slot would sit idle until the longest sequence in the batch finishes. GPU time is wasted and new requests wait.', nodes: ['sched'], warn: ['sched'], badges: { sched: ['idle slot', 'warn'] }, tone: 'warn' },
        { text: '<b>Iteration-level scheduling</b> (Orca): the scheduler re-decides <i>every step</i>. A waiting request is admitted at the next iteration.', flow: ['router>sched', 'sched>kvm'], badges: { sched: ['+1 joins', 'ok'] } },
        { text: 'With <b>chunked prefill</b>, the newcomer\'s prompt is split into chunks and mixed with the ongoing decodes under a per-step token budget, so running streams do not stall.', flow: ['sched>gpu'], badges: { gpu: 'decode + chunk' }, tone: 'ok' }
      ]
    },
    {
      id: 'preempt', title: 'KV memory full → preempt', tone: 'err',
      steps: [
        { text: 'Many sequences produce long answers. Each step some need a new block, and the free pool hits <b>zero</b>.', flow: ['gpu>kvm'], err: ['kvm'], badges: { kvm: ['0 free', 'err'] }, tone: 'err' },
        { text: 'The scheduler <b>preempts</b> the most recently admitted sequence and releases its blocks. The others keep generating.', flow: ['sched>kvm'], warn: ['sched'], badges: { sched: ['preempt #57', 'warn'] }, tone: 'warn' },
        { text: 'The victim\'s KV is either <b>swapped</b> to CPU memory or <b>dropped and recomputed</b> later (one prefill over prompt + generated tokens). Both are described in the PagedAttention paper.', flow: ['kvm>swap'], badges: { swap: 'swap out' } },
        { text: 'When blocks free up, it resumes. Users see a pause in that one stream. Watch the <b>preemption rate</b>: if it is high, lower max sequences, quantize the KV cache, or add GPUs.', flow: ['swap>kvm', 'sched>gpu'], ok: ['kvm'], tone: 'ok' }
      ]
    },
    {
      id: 'prefix', title: 'Shared system prompt → prefix cache', tone: 'ok',
      steps: [
        { text: '1,000 agent calls share the same 3,000-token system prompt and tool list. Only the last user turn differs.', flow: [['client>gw', 'client>gw'], 'gw>router'], badges: { client: 'same prefix' } },
        { text: 'The router hashes the prefix and sends these requests to the <b>same replica</b>, where the KV for that prefix is likely already cached.', flow: ['router>sched'], badges: { router: 'hash(prefix)' } },
        { text: 'Each full block is keyed by <code>hash(parent_hash, its tokens)</code>. The first 187 blocks <b>hit</b>, so only the new tokens need prefill and TTFT drops sharply.', flow: ['sched>kvm'], ok: ['kvm'], badges: { kvm: ['187 blocks hit', 'ok'] }, tone: 'ok' },
        { text: 'Shared blocks are <b>ref-counted</b>. When no running sequence uses them they stay cached and are evicted LRU-first under memory pressure.', nodes: ['kvm'], badges: { kvm: 'ref=212' } }
      ]
    },
    {
      id: 'scale', title: 'Traffic spike → scale GPUs', tone: 'warn',
      steps: [
        { text: 'A launch triples traffic. Queue depth and KV usage climb, and <b>TTFT p99</b> breaks its SLO while TPOT still looks fine.', flow: ['sched>mon'], warn: ['sched', 'mon'], badges: { mon: ['TTFT p99 4 s', 'warn'] }, tone: 'warn' },
        { text: 'The autoscaler reacts to <b>queue depth and KV usage</b>, not CPU, which is idle on GPU boxes. It requests 3 more replicas.', flow: ['mon>auto', 'auto>router'], badges: { auto: '+3 replicas' } },
        { text: 'Each new replica must load <b>140 GB of weights</b> and warm up, which takes minutes. Meanwhile the gateway sheds low-priority traffic and caps <code>max_tokens</code>.', flow: ['weights>gpu'], warn: ['gw'], badges: { gw: ['shed batch tier', 'warn'] } },
        { text: 'Replicas register with the router and load spreads. Keep a <b>warm pool</b> or pre-scale for known peaks, because GPUs are slow to add and expensive to keep idle.', flow: ['router>sched', 'sched>gpu'], ok: ['gpu'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Model: a 70B-parameter model in FP16 (140 GB of weights) on 80 GB GPUs; prompts ~1,500 tokens, answers ~300, max length 8K. Numbers come from a simple bandwidth model and are <em>illustrative</em>. The <b>relationships</b> are what matter.',
    diagram: null,
    controls: [
      { id: 'batch', label: 'Batching', type: 'seg', value: 'continuous', options: [
        { v: 'static', l: 'Static' }, { v: 'dynamic', l: 'Dynamic (timer)' }, { v: 'continuous', l: 'Continuous' }] },
      { id: 'kv', label: 'KV-cache memory', type: 'seg', value: 'paged', options: [
        { v: 'contig', l: 'Contiguous (reserve max_len)' }, { v: 'paged', l: 'Paged (PagedAttention)' }] },
      { id: 'prefix', label: 'Prefix caching (70% of prompt shared)', type: 'seg', value: 'on', options: [
        { v: 'off', l: 'Off' }, { v: 'on', l: 'On' }] },
      { id: 'tp', label: 'GPUs per replica (tensor parallel)', type: 'seg', value: 4, options: [
        { v: 1, l: 'TP=1' }, { v: 2, l: 'TP=2' }, { v: 4, l: 'TP=4' }, { v: 8, l: 'TP=8' }] },
      { id: 'mode', label: 'Extra technique', type: 'seg', value: 'plain', options: [
        { v: 'plain', l: 'None' }, { v: 'spec', l: 'Speculative decoding' }, { v: 'disagg', l: 'Disaggregated prefill/decode' }] }
    ],
    evaluate(s) {
      const tp = +s.tp, Wt = 140e9, KVT = 327680, HBM = 3.35e12, PROMPT = 1500, OUT = 300, MAXLEN = 8192, LIVE = PROMPT + OUT / 2;
      const budget = tp * (80e9 * 0.9 - 3e9) - Wt; // KV bytes after weights + per-GPU overhead (estimates)
      const fits = budget > 0;
      const capTok = fits ? budget / KVT : 0;
      const paged = s.kv === 'paged';
      const maxSeqs = fits ? Math.min(256, Math.floor(capTok / (paged ? LIVE + 8 : MAXLEN))) : 0;
      const waste = paged ? 8 / (LIVE + 8) : 1 - LIVE / MAXLEN;
      const util = { static: 0.45, dynamic: 0.55, continuous: 0.95 }[s.batch];
      const B = Math.max(1, maxSeqs * util);
      const step = ((Wt / tp + B * LIVE * KVT / tp) / HBM) + (tp > 1 ? 0.0016 : 0);
      const specTPOT = s.mode === 'spec' ? (B <= 32 ? 2.0 : B <= 128 ? 1.4 : 1.1) : 1;
      const specThru = s.mode === 'spec' ? (B <= 32 ? 1.8 : B <= 128 ? 1.2 : 0.95) : 1;
      const tps = fits ? (B / step) * specThru : 0;
      const promptEff = s.prefix === 'on' ? PROMPT * 0.3 : PROMPT;
      const prefill = (2 * 70e9 * promptEff) / (tp * 400e12);
      const wait = { static: 2.0, dynamic: 0.5, continuous: step }[s.batch];
      const ttft = prefill + wait + (s.mode === 'disagg' ? (PROMPT * KVT) / 50e9 : (s.batch === 'continuous' ? step : 0));
      const tpotP99 = (step / specTPOT) * (s.mode === 'disagg' ? 1.05 : s.batch === 'continuous' ? 1.6 : 1.1);
      const gpus = tp * (s.mode === 'disagg' ? 1.5 : 1);
      const cost = fits ? (gpus * 3) / (tps * 3600) * 1e6 : Infinity; // $3 per GPU-hour (estimate)
      const clamp01 = (x) => Math.max(0, Math.min(1, x));
      const ms = (x) => SD.fmt.dur(x * 1000);
      const metrics = fits ? [
        { k: 'KV cache capacity', v: SD.fmt.num(capTok) + ' tokens (' + SD.fmt.bytes(budget) + ')', s: clamp01(capTok / 5e5), hint: tp + ' GPUs' },
        { k: 'Max concurrent seqs', v: String(maxSeqs) + (maxSeqs === 256 ? ' (capped)' : ''), s: clamp01(maxSeqs / 256) },
        { k: 'KV memory wasted', v: (waste * 100).toFixed(1) + '%', s: clamp01(1 - waste * 1.2), hint: paged ? '< 1 block / seq' : 'reserved, unused' },
        { k: 'Decode throughput', v: SD.fmt.num(tps) + ' tok/s per replica', s: clamp01(Math.log10(tps / 500) / 1.8) },
        { k: 'TTFT', v: ms(ttft), s: clamp01(1 - ttft / 2.5) },
        { k: 'TPOT (p99)', v: ms(tpotP99), s: clamp01(1 - (tpotP99 - 0.01) / 0.06) },
        { k: 'Cost / 1M output tokens', v: '≈ $' + cost.toFixed(2), s: clamp01(1 - Math.log10(cost / 0.15) / 1.3), hint: '$3/GPU-h est.' }
      ] : [
        { k: 'KV cache capacity', v: 'none: weights alone need ' + SD.fmt.bytes(Wt / tp) + '/GPU', s: 0, hint: 'does not fit' },
        { k: 'Max concurrent seqs', v: '0', s: 0 },
        { k: 'KV memory wasted', v: '—', s: 0 },
        { k: 'Decode throughput', v: '0 tok/s', s: 0 },
        { k: 'TTFT', v: '∞ (cannot load)', s: 0 },
        { k: 'TPOT (p99)', v: '—', s: 0 },
        { k: 'Cost / 1M output tokens', v: '—', s: 0 }
      ];
      const notes = [];
      if (!fits) notes.push(tp + '× 80 GB = ' + (tp * 80) + ' GB, but the FP16 weights alone are 140 GB, plus activations and runtime buffers. Use more GPUs or quantize the weights (FP8 ≈ 70 GB, INT4 ≈ 35 GB).');
      if (fits && !paged) notes.push('Contiguous allocation reserves <b>max_len = 8K tokens (2.5 GiB)</b> per sequence up front. Most requests use ~1.6K, so about ' + Math.round(waste * 100) + '% of KV memory sits reserved but empty, and the batch shrinks to ' + maxSeqs + '.');
      if (fits && paged) notes.push('Paged KV allocates 16-token blocks on demand, so waste is under one block per sequence. Batch size, and therefore throughput, goes up.');
      if (s.batch === 'static') notes.push('Static batches run until the <b>longest</b> sequence ends: short answers leave slots idle and new arrivals wait for the next batch, which inflates TTFT.');
      if (s.batch === 'dynamic') notes.push('Dynamic batching groups requests that arrive within a time window, but the batch still runs to completion. TTFT improves, utilization barely does.');
      if (s.prefix === 'on') notes.push('70% of each prompt hits cached blocks, so prefill compute drops ~3×. Route requests with the same prefix to the same replica to keep the hit rate.');
      if (s.mode === 'spec') notes.push('A small draft model proposes k tokens and the big model verifies them in <b>one</b> pass. The output distribution is unchanged. It helps most at <b>small batch</b>, where decode is memory-bound and spare compute exists.');
      if (s.mode === 'disagg') notes.push('Separate prefill and decode pools remove prefill/decode interference (steady TPOT). The KV must be shipped across: ' + SD.fmt.bytes(PROMPT * KVT) + ' per 1.5K-token prompt, so you need a fast interconnect.');
      if (tp === 8 && fits) notes.push('TP=8 gives more KV room, but all-reduce runs every layer. Throughput per GPU is not better than TP=4. Prefer more TP=4 replicas unless contexts are long.');
      let verdict;
      if (!fits) verdict = '❌ <b>The model does not fit.</b> Weights need ' + SD.fmt.bytes(Wt / tp) + ' per GPU before any KV cache. Add GPUs (TP=4) or quantize.';
      else if (s.batch !== 'continuous') verdict = '⚠ <b>GPU time is being wasted.</b> Without iteration-level scheduling, finished sequences hold slots and new requests wait for the batch to drain.';
      else if (!paged) verdict = '⚠ <b>Memory-limited batch.</b> Reserving max_len per request wastes ~' + Math.round(waste * 100) + '% of KV memory. Paged KV would roughly ' + Math.round((Math.min(256, Math.floor(capTok / (LIVE + 8)))) / Math.max(1, maxSeqs)) + '× the batch.';
      else if (s.mode === 'spec') verdict = '👍 <b>Speculative decoding</b> trims TPOT, but at a batch of ~' + Math.round(B) + ' the GPU has little spare compute, so throughput gains are small. It shines at low concurrency.';
      else if (s.mode === 'disagg') verdict = '👍 <b>Disaggregated prefill/decode</b> keeps TPOT steady under prompt bursts, at the price of ~1.5× GPUs and shipping KV between pools. Worth it at large scale with strict TPOT SLOs.';
      else if (s.prefix === 'on' && tp === 4) verdict = '✅ <b>What vLLM / TensorRT-LLM / SGLang do by default:</b> continuous batching, paged KV, prefix caching, and a TP size that just fits the model with room for KV.';
      else verdict = '👍 Good setup. Check TTFT vs TPOT vs cost to see which way this choice leans.';
      const flow = ['client>gw', 'gw>router'].concat(s.mode === 'disagg' ? ['router>pre', 'pre>kvm', 'kvm>gpu'] : ['router>sched', 'sched>kvm', 'sched>gpu']).concat(s.mode === 'spec' ? ['draft>gpu'] : []).concat(['gpu>sched', 'sched>router']);
      return {
        metrics, verdict, notes, flow,
        labels: {
          sched: { label: 'Scheduler', sub: { static: 'static batches', dynamic: 'dynamic batching', continuous: 'continuous batching' }[s.batch] },
          kvm: paged ? { label: 'KV block manager', sub: s.prefix === 'on' ? 'paged + prefix cache' : 'paged · 16-tok blocks' } : { label: 'KV allocator', sub: 'contiguous · max_len' },
          gpu: { label: tp + '× GPU (TP=' + tp + ')', sub: SD.fmt.bytes(Wt / tp) + ' weights each' },
          router: { label: 'Router', sub: s.prefix === 'on' ? 'prefix-aware routing' : 'least-loaded' }
        },
        hide: [].concat(s.mode === 'spec' ? [] : ['draft']).concat(s.mode === 'disagg' ? [] : ['pre']),
        hot: s.mode === 'spec' ? ['draft'] : s.mode === 'disagg' ? ['pre'] : [],
        err: fits ? [] : ['gpu'],
        warn: fits && (!paged || s.batch !== 'continuous') ? ['kvm'] : [],
        badges: fits ? { kvm: [maxSeqs + ' seqs', paged ? 'ok' : 'warn'], gpu: [SD.fmt.num(tps) + ' tok/s', 'info'] } : { gpu: ['OOM', 'err'] }
      };
    }
  },

  widget: {
    title: 'Paged KV cache and continuous batching',
    caption: 'Each square is a <b>KV block</b> (4 tokens here) in GPU memory, coloured by the sequence that owns it. Sequences arrive, prefill, grow one token per step, and finish. Compare <b>paged vs contiguous</b> allocation (hatched = reserved but empty) and <b>continuous vs static</b> batching. <b>Tap a block</b> to see that sequence\'s block table.'
  },

  realWorld: {
    intro: 'The modern serving stack came together between 2022 and 2024, mostly from systems papers that are now defaults in open-source engines.',
    timeline: [
      { when: '2022', who: 'Seoul National Univ. / FriendliAI', title: 'Orca: iteration-level scheduling', text: 'Schedule per model <b>iteration</b> instead of per request, so new requests join after one step. <b>Selective batching</b> batches every operation except attention. <b>36.9×</b> throughput vs FasterTransformer at the same latency on a 175B-parameter GPT-style model (OSDI \'22).', src: 0 },
      { when: 'Jun 2023', who: 'UC Berkeley (LMSYS)', title: 'vLLM released', text: 'Launch post: <b>14–24×</b> throughput vs Hugging Face Transformers and 2.2–2.5× vs TGI on their benchmarks. It served LMSYS\'s Chatbot Arena demo and <b>cut the GPUs used by 50%</b>.', src: 1 },
      { when: 'Oct 2023', who: 'UC Berkeley', title: 'PagedAttention (SOSP \'23)', text: 'KV cache in fixed-size blocks behind a block table, inspired by OS virtual memory. <b>Near-zero waste</b>, sharing across sequences, and <b>2–4×</b> throughput vs FasterTransformer and Orca at the same latency.', src: 2 },
      { when: '2023', who: 'Google', title: 'Speculative decoding (ICML \'23)', text: 'A small model drafts several tokens and the big one verifies them in parallel, with a sampling scheme that keeps the output distribution <b>identical</b>. <b>2–3×</b> faster on their benchmark model with no retraining or architecture change.', src: 3 },
      { when: '2023', who: 'NVIDIA', title: 'TensorRT-LLM in-flight batching', text: 'The batch manager provides <b>in-flight</b> (continuous / iteration-level) batching with a paged KV cache and options for block reuse across requests.', src: 4 },
      { when: 'Jan 2024', who: 'LMSYS', title: 'SGLang RadixAttention', text: 'Keeps KV cache in a <b>radix tree</b> keyed by token sequences for automatic reuse across calls, with LRU eviction and <b>cache-aware scheduling</b>. Ideal for agents and few-shot prompts.', src: 5 },
      { when: '2024', who: 'Microsoft / UW', title: 'Splitwise (ISCA \'24)', text: 'Runs prompt (prefill) and token phases on <b>different machines</b>, moving KV state over fast interconnects. <b>1.4×</b> throughput at 20% lower cost, or 2.35× throughput at equal cost and power.', src: 6 },
      { when: '2024', who: 'Peking Univ. / UCSD', title: 'DistServe (OSDI \'24)', text: 'Disaggregates prefill and decode to remove interference and tunes parallelism per phase for <b>goodput</b> under TTFT/TPOT SLOs: <b>7.4×</b> more requests or 12.6× tighter SLOs.', src: 7 }
    ],
    lessons: [
      '<span>Schedule <b>per iteration</b>, never per request. Idle batch slots are the biggest waste.</span>',
      '<span>Treat KV memory like <b>virtual memory</b>: fixed blocks, a block table, ref-counted sharing.</span>',
      '<span>Prefill and decode have <b>different bottlenecks</b>, so chunk prefill or disaggregate it when TPOT matters.</span>',
      '<span>Reuse work: <b>prefix caching</b> plus cache-aware routing turns shared system prompts into free TTFT.</span>'
    ],
    sources: [
      { title: 'Orca: A Distributed Serving System for Transformer-Based Generative Models', url: 'https://www.usenix.org/conference/osdi22/presentation/yu', pub: 'USENIX OSDI 2022' },
      { title: 'vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention', url: 'https://vllm.ai/blog/2023-06-20-vllm', pub: 'vLLM blog, June 2023' },
      { title: 'Efficient Memory Management for Large Language Model Serving with PagedAttention', url: 'https://arxiv.org/abs/2309.06180', pub: 'Kwon et al., SOSP 2023' },
      { title: 'Fast Inference from Transformers via Speculative Decoding', url: 'https://proceedings.mlr.press/v202/leviathan23a.html', pub: 'Leviathan et al., ICML 2023' },
      { title: 'The Batch Manager in TensorRT-LLM', url: 'https://nvidia.github.io/TensorRT-LLM/advanced/batch-manager.html', pub: 'NVIDIA docs' },
      { title: 'Fast and Expressive LLM Inference with RadixAttention and SGLang', url: 'https://lmsys.org/blog/2024-01-17-sglang', pub: 'LMSYS blog, Jan 2024' },
      { title: 'Splitwise: Efficient generative LLM inference using phase splitting', url: 'https://www.microsoft.com/en-us/research/publication/splitwise-efficient-generative-llm-inference-using-phase-splitting/', pub: 'Microsoft Research, ISCA 2024' },
      { title: 'DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving', url: 'https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin', pub: 'USENIX OSDI 2024' },
      { title: 'vLLM design: Automatic Prefix Caching', url: 'https://docs.vllm.ai/en/latest/design/prefix_caching/', pub: 'vLLM docs' },
      { title: 'vLLM: Optimization and Tuning (chunked prefill)', url: 'https://docs.vllm.ai/en/latest/configuration/optimization/', pub: 'vLLM docs' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Batching', '<b>Static / dynamic</b>: simple, predictable', '<b>Continuous</b>: join/leave every step', 'Continuous for any interactive serving; static only for offline jobs with equal lengths'],
      ['KV memory', '<b>Contiguous per request</b>: simple kernels', '<b>Paged blocks</b>: near-zero waste, sharing', 'Paged; it is the default in vLLM, TensorRT-LLM and SGLang'],
      ['Parallelism', '<b>Tensor parallel</b>: lower latency, needs NVLink', '<b>Pipeline parallel</b>: spans nodes, adds bubbles', 'TP within a node until the model fits with KV headroom; PP only across nodes'],
      ['Prefill vs decode', '<b>Colocated + chunked prefill</b>: one pool', '<b>Disaggregated pools</b>: no interference, KV transfer', 'Disaggregate at large scale with strict TPOT SLOs and RDMA-class networking'],
      ['Speculative decoding', '<b>Off</b>: simplest, best at large batch', '<b>On</b> (draft model / n-gram / heads): lower TPOT', 'On for latency-sensitive, low-concurrency traffic'],
      ['Precision', '<b>FP16/BF16</b>: reference quality', '<b>FP8 / INT4 weights, FP8 KV</b>: 2–4× less memory', 'Quantize when memory-bound; validate quality on your own evals']
    ]
  },
  failures: [
    { f: 'KV exhaustion → preemption storm', detect: 'Preemption counter, KV usage pinned at ~100%', fix: 'Lower max concurrent sequences, FP8 KV cache, shorter max_model_len, more replicas.' },
    { f: 'Long prompt blocks everyone (head-of-line)', detect: 'TPOT spikes when big prompts arrive', fix: 'Chunked prefill with a per-step token budget; separate long-context pool.' },
    { f: 'Client disconnects but generation continues', detect: 'Tokens generated ≫ tokens delivered', fix: 'Propagate disconnect → abort(request_id) to free blocks immediately.' },
    { f: 'Cold start during a spike', detect: 'Replica Pending/Loading for minutes while TTFT climbs', fix: 'Warm pool, pre-scaling for known events, weights on local NVMe, priority shedding.' },
    { f: 'One GPU fails in a TP group', detect: 'NCCL timeout / Xid errors, replica health check', fix: 'Whole replica restarts; router drains it; keep N+1 replicas.' },
    { f: 'Prefix cache thrash', detect: 'Low hit rate despite shared prompts', fix: 'Prefix-aware (consistent-hash) routing, keep the system prompt byte-identical, more cache memory.' },
    { f: 'Cross-tenant cache side channel', detect: 'Security review: shared prefix blocks across tenants', fix: 'Per-tenant cache salt in the block hash (vLLM\'s <code>cache_salt</code>), so only requests with the same salt can reuse blocks.' }
  ],

  interview: [
    { q: 'Why is decode memory-bound while prefill is compute-bound?', a: '<p><b>Prefill</b> processes thousands of prompt tokens at once: big matrix–matrix multiplies, so FLOPs dominate.</p><p><b>Decode</b> produces one token per sequence per step: matrix–vector work. Each step must stream <b>all weights</b> (140 GB for 70B FP16) plus the KV cache from HBM, with little arithmetic per byte. The fix is batching: one weight read serves every sequence in the batch.</p>', lvl: 'core' },
    { q: 'TTFT vs TPOT: what drives each?', a: '<p><b>TTFT</b> (time to first token) = queueing + prefill time. It grows with prompt length and with waiting for batch slots or KV memory. Prefix caching and chunked prefill help.</p><p><b>TPOT</b> (time per output token) = decode step time. It grows with batch size and context length (more KV to read) and with prefill interference. Disaggregation and speculative decoding help.</p>', lvl: 'core' },
    { q: 'How big is the KV cache? Give the formula.', a: '<p><b>bytes/token = 2 × layers × kv_heads × head_dim × bytes_per_element</b> (2 = K and V).</p><p>A typical 70B model with GQA: 2 × 80 × 8 × 128 × 2 = <b>327,680 B ≈ 320 KiB/token</b>. An 8K-token sequence is 2.5 GiB, and 64 of them need 160 GiB, more than the 140 GB of weights.</p><p>GQA (8 KV heads instead of 64) is what keeps this 8× smaller than full multi-head attention.</p>', fu: 'How would FP8 KV cache change the batch size?', lvl: 'core' },
    { q: 'Why continuous batching?', a: '<p>Output lengths vary wildly. With static batching, a batch runs until its longest sequence ends, so finished slots sit idle and new requests wait.</p><p><b>Iteration-level scheduling</b> (Orca) re-forms the batch every step: finished sequences leave and waiting ones join. GPU utilization stays high and TTFT drops.</p>', lvl: 'core' },
    { q: 'What problem does PagedAttention solve?', a: '<p>Naive engines reserve a contiguous KV region of max_len per request. Most of it stays empty (internal fragmentation) and the gaps between reservations fragment memory further.</p><p>PagedAttention stores KV in <b>fixed-size blocks</b> (e.g. 16 tokens) mapped by a <b>block table</b>, like OS paging. Allocation happens on demand, waste is under one block per sequence, and blocks can be <b>shared</b> (prefixes, parallel samples) with copy-on-write. Bigger batches mean higher throughput.</p>', lvl: 'core' },
    { q: 'How does prefix caching work, and how do you route for it?', a: '<p>Each full KV block gets a hash of (parent block hash, its tokens). A new request walks its prompt block by block and reuses every hit, so only the uncached tail needs prefill.</p><p>Routing matters: send requests with the same prefix to the same replica (consistent hashing on the prefix) but fall back when that replica is overloaded. SGLang uses a radix tree for the same purpose.</p>', lvl: 'deep' },
    { q: 'What happens when KV memory runs out mid-generation?', a: '<p>The scheduler <b>preempts</b> a sequence (usually the newest) and frees its blocks. Its KV is either <b>swapped</b> to CPU memory or <b>recomputed</b> later with a prefill over prompt + generated tokens. Recompute is often cheaper than PCIe transfers for short sequences.</p><p>Frequent preemption means the replica is over-admitted.</p>', lvl: 'deep' },
    { q: 'Tensor vs pipeline parallelism for inference?', a: '<p><b>Tensor parallel</b> splits each layer\'s matrices across GPUs. Every layer needs all-reduces, so it needs NVLink-class bandwidth, but it lowers per-token latency.</p><p><b>Pipeline parallel</b> splits layers into stages across GPUs or nodes, with little communication. A single request flows through stages sequentially, and micro-batches are needed to avoid bubbles. Typical: TP within a node, PP across nodes.</p>', lvl: 'deep' },
    { q: 'How does speculative decoding give the same output faster?', a: '<p>A cheap draft proposes k tokens. The target model scores all k in <b>one forward pass</b>, accepting tokens left to right with a rejection-sampling rule that provably preserves the target distribution. Expected accepted tokens per pass > 1.</p><p>It wins when decode is memory-bound with spare compute (small batches). At large batch the extra compute competes with real work.</p>', lvl: 'deep' },
    { q: 'When is prefill/decode disaggregation worth it?', a: '<p>When prefill bursts hurt TPOT for running streams, and you have the scale to keep two pools busy. Each pool gets its own parallelism and hardware.</p><p>The cost is <b>shipping KV</b>: about 470 MiB for a 1.5K-token prompt on a 70B model. That needs RDMA/NVLink-class networking and a smart scheduler (Splitwise, DistServe).</p>', lvl: 'deep' },
    { q: 'How do you autoscale GPU inference?', a: '<p>Scale on <b>queue depth, KV-cache usage and TTFT</b>, not CPU. Replicas take minutes to start (weight loading), so keep a warm pool, pre-scale for known peaks, and shed or degrade low-priority traffic in the meantime. Scale in slowly to protect running streams.</p>', lvl: 'core' },
    { q: 'How do you serve many fine-tuned variants (LoRA adapters) cheaply?', a: '<p>A <b>LoRA</b> adapter is a pair of small low-rank matrices added to some weight matrices, often well under 1% of the base model. Keep <b>one copy of the base weights</b> on the GPU and load adapters on demand, with an LRU cache of hot adapters in GPU memory and the rest in CPU memory or on disk.</p><p>Batch requests for <b>different adapters together</b>: the base matmul is shared, and a custom kernel applies each row\'s own adapter. vLLM supports this with <code>--enable-lora</code> and a cap on adapters per batch. Include the adapter id in the prefix-cache key, because the same tokens give different KV under different adapters.</p>', fu: 'When would you merge an adapter into the weights instead? (One very hot variant: merging removes the extra matmul, but that replica then serves only that variant.)', lvl: 'deep' },
    { q: 'What are the trade-offs of quantization?', a: '<p><b>Weights</b> in FP8 or INT4 cut memory 2–4× and speed up memory-bound decode. Quality loss is usually small for FP8, and INT4 needs careful methods (e.g. AWQ / GPTQ).</p><p><b>KV cache</b> in FP8 halves KV memory, so batches can double. Always validate on your own evals, especially for long context and reasoning.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'FastAPI streaming proxy → vLLM', lang: 'python',
      code: `# vllm serve $MODEL --max-model-len 8192 \\
#   --gpu-memory-utilization 0.90 --enable-prefix-caching
# pip install fastapi uvicorn openai
import asyncio, json, os
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

MODEL = os.environ["MODEL"]                     # same name vLLM was started with
app = FastAPI()
llm = AsyncOpenAI(base_url="http://vllm:8000/v1", api_key="unused")
slots = asyncio.Semaphore(256)                  # in-flight streams per proxy

class Ask(BaseModel):
    messages: list[dict]
    max_tokens: int = 512

@app.post("/chat")
async def chat(body: Ask, request: Request):
    if slots.locked():                          # shed load instead of queueing forever
        raise HTTPException(429, "busy, retry later")

    async def events():
        async with slots:
            stream = await llm.chat.completions.create(
                model=MODEL, messages=body.messages, max_tokens=body.max_tokens,
                stream=True, stream_options={"include_usage": True})
            try:
                async for chunk in stream:
                    if await request.is_disconnected():
                        return
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield f"data: {json.dumps({'t': chunk.choices[0].delta.content})}\\n\\n"
                    elif chunk.usage:           # final chunk: token accounting
                        yield f"data: {json.dumps({'usage': chunk.usage.model_dump()})}\\n\\n"
                yield "data: [DONE]\\n\\n"
            finally:                            # done, client gone, or cancelled:
                await stream.close()            # vLLM aborts the request, KV blocks freed

    return StreamingResponse(events(), media_type="text/event-stream")`,
      note: 'Prefix caching is on by default in recent vLLM versions; the flag makes it explicit. Closing the upstream stream in <code>finally</code> also covers the case where the server cancels the generator on disconnect. Keep the system prompt <b>byte-identical</b> across calls to get cache hits.'
    },
    {
      title: 'KV sizing + paged block table', lang: 'python',
      code: `from dataclasses import dataclass, field
from math import ceil

def kv_bytes_per_token(layers: int, kv_heads: int, head_dim: int, dtype_bytes: int = 2) -> int:
    return 2 * layers * kv_heads * head_dim * dtype_bytes   # K and V, every layer

# typical 70B config: 80 layers, 8 KV heads (GQA), head_dim 128, FP16
assert kv_bytes_per_token(80, 8, 128) == 327_680          # 320 KiB per token
print(8192 * 327_680 / 2**30, "GiB per 8K-token sequence")  # 2.5

BLOCK = 16                                                # tokens per KV block

@dataclass
class BlockManager:
    free: list[int]                                       # physical block ids in HBM
    tables: dict[str, list[int]] = field(default_factory=dict)  # seq -> block table
    lens: dict[str, int] = field(default_factory=dict)

    def can_admit(self, prompt_len: int) -> bool:
        return len(self.free) >= ceil(prompt_len / BLOCK)

    def admit(self, seq: str, prompt_len: int) -> None:
        self.tables[seq] = [self.free.pop() for _ in range(ceil(prompt_len / BLOCK))]
        self.lens[seq] = prompt_len

    def append_token(self, seq: str) -> bool:
        """One decode step. False = pool exhausted, so the caller must preempt someone."""
        if self.lens[seq] % BLOCK == 0:                   # last block is full
            if not self.free:
                return False
            self.tables[seq].append(self.free.pop())      # any free block, no contiguity
        self.lens[seq] += 1
        return True

    def release(self, seq: str) -> None:                  # finished or preempted
        self.free.extend(self.tables.pop(seq))
        del self.lens[seq]`,
      note: 'Real engines add ref counts and prefix hashes per block, so identical prefixes share physical blocks with copy-on-write.'
    }
  ],

  related: ['llm-gateway', 'rag-agent-platform', 'vector-db', 'recommendation', 'api-gateway']
});

/* knobs diagram = architecture + optional draft model and prefill pool */
(function () {
  const d = SD.data;
  const a = d.architecture;
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes.concat([
      { id: 'draft', label: 'Draft model', sub: 'proposes k tokens', kind: 'ml', wide: [850, 0], tall: [350, 210], tip: 'A small model (or n-gram / extra heads) that guesses the next few tokens for the big model to verify in one pass.' },
      { id: 'pre', label: 'Prefill pool', sub: 'compute-bound GPUs', kind: 'ml', wide: [660, 220], tall: [70, 210], tip: 'Dedicated GPUs that only run prefill, then ship the KV cache to the decode pool.' }
    ]),
    edges: a.edges.concat([
      { from: 'draft', to: 'gpu', dashed: true },
      { from: 'router', to: 'pre' },
      { from: 'pre', to: 'kvm', label: 'KV xfer' }
    ])
  };
})();
