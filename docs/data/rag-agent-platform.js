SD.register({
  slug: 'rag-agent-platform',
  domain: 8,
  title: 'RAG & AI Agent Platform',
  examples: 'Enterprise copilots, MCP',
  tagline: 'Answer questions from <b>your own documents</b> with citations, and let an agent <b>call tools</b> in a loop, without leaking data the user may not see.',
  tldr: {
    problem: 'An LLM does not know your private, changing documents, and it will happily invent an answer. Agents that call tools can loop, fail half-way or do the wrong thing.',
    idea: '<b>Retrieve, then generate.</b> Index chunks with both <b>vectors and BM25</b>, fuse the two rankings, <b>rerank</b> the top few, and make the model answer only from those chunks. Agents wrap this in a loop: think → call tool → observe.',
    insight: 'Most answer quality is decided <b>before the LLM runs</b>: by chunking, hybrid retrieval and permission filters. Start with a fixed <b>workflow</b>, and only reach for an autonomous agent when the steps truly cannot be predicted.',
    numbers: [
      { v: '−49%', l: 'failed retrievals: contextual embeddings + BM25 (Anthropic, 2024)' },
      { v: '−67%', l: 'failed retrievals when reranking is added (Anthropic, 2024)' },
      { v: 'k = 60', l: 'reciprocal rank fusion constant (Cormack et al., 2009)' }
    ]
  },

  intro: {
    what: 'A RAG platform lets an AI assistant answer questions from <b>your own documents</b>. RAG means retrieval-augmented generation: first find the relevant passages, then have a large language model (LLM) write the answer using only those passages, with citations. The agent part lets the model also <b>call tools</b>, such as looking up an order, in a loop until the task is done.',
    analogy: {
      icon: '📖',
      title: 'An open-book exam with a helper who fetches the pages',
      text: 'A student answering from memory may confidently make things up. In an open-book exam, a helper first finds the right pages, and the student answers only from them and notes the page numbers. The helper checks the student\'s badge, so restricted pages are never handed over. An agent is a student who may also make phone calls to look things up or get things done, but only to numbers you have approved.'
    },
    problem: 'An employee asks the company assistant "How many vacation days do we get in Germany?". A plain LLM has never seen your internal policy, so it guesses, and the guess sounds sure of itself. Pasting every document into each prompt is far too big and slow, and some documents are private to HR. The core question is <b>how to give the model the few right passages that this user is allowed to see, so it answers correctly and cites its sources</b>.',
    story: [
      {
        stage: 'naive',
        title: 'Just ask the model',
        text: 'Send the user\'s question straight to the LLM and stream back its answer. It is one API call, and it works well for general knowledge such as "what is a mutex?".',
        scene: {
          nodes: [
            { id: 'user', label: 'Employee', sub: 'asks a question', kind: 'client', at: [210, 0] },
            { id: 'llm', label: 'LLM', sub: 'general knowledge', kind: 'ml', at: [350, 0] },
            { id: 'orch', label: 'Chat app', sub: 'one API call', kind: 'service', at: [210, 110] }
          ],
          edges: [{ from: 'user', to: 'orch', bidi: true }, { from: 'orch', to: 'llm', bidi: true }],
          flow: ['user>orch', 'orch>llm', 'llm>orch', 'orch>user']
        }
      },
      {
        stage: 'breaks',
        title: 'Confident guesses and leaked secrets',
        text: 'The model has never seen your private, ever-changing documents, so it <b>invents</b> a plausible answer with no source. Pasting all documents into the prompt is far too large, slow and costly. And if you paste the HR folder, an intern can now read salary data, because <b>a prompt cannot enforce permissions</b>.',
        scene: {
          nodes: [
            { id: 'user', label: 'Employee', sub: 'asks a question', kind: 'client', at: [210, 0] },
            { id: 'llm', label: 'LLM', sub: 'makes things up', kind: 'ml', at: [350, 0] },
            { id: 'docs', label: 'All documents', sub: 'incl. HR-only', kind: 'store', at: [70, 0] },
            { id: 'orch', label: 'Chat app', sub: 'pastes it all', kind: 'service', at: [210, 110] }
          ],
          edges: [{ from: 'user', to: 'orch', bidi: true }, { from: 'orch', to: 'llm', bidi: true }, { from: 'docs', to: 'orch' }],
          flow: [['user>orch', 'docs>orch'], 'orch>llm', 'llm>orch', 'orch>user'],
          err: ['llm'],
          warn: ['docs', 'user'],
          badges: { llm: ['made up', 'err'], docs: ['leaks HR', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Retrieve the right passages, then generate',
        text: 'An <b>ingest pipeline</b> splits documents into small <b>chunks</b> and indexes them by meaning and by keyword, with each document\'s permissions attached. At question time an <b>orchestrator</b> retrieves the best chunks this user may see, <b>reranks</b> them, and asks the LLM to answer only from them, with citations. For agents, the same loop can also call <b>tools</b>.',
        scene: {
          nodes: [
            { id: 'user', label: 'Employee', sub: 'asks a question', kind: 'client', at: [210, 0] },
            { id: 'llm', label: 'LLM', sub: 'answers + cites', kind: 'ml', at: [350, 0] },
            { id: 'docs', label: 'Documents', sub: 'with permissions', kind: 'store', at: [70, 0] },
            { id: 'orch', label: 'Orchestrator', sub: 'retrieve → ask', kind: 'service', at: [210, 110] },
            { id: 'tools', label: 'Tools', sub: 'orders · tickets', kind: 'external', at: [350, 220] },
            { id: 'ingest', label: 'Ingest', sub: 'chunk + index', kind: 'compute', at: [70, 110] },
            { id: 'retr', label: 'Retrieval', sub: 'meaning + words', kind: 'service', at: [70, 220] }
          ],
          edges: [{ from: 'user', to: 'orch', bidi: true }, { from: 'orch', to: 'llm', bidi: true }, { from: 'orch', to: 'tools', bidi: true }, { from: 'orch', to: 'retr', bidi: true }, { from: 'docs', to: 'ingest' }, { from: 'ingest', to: 'retr' }],
          flow: ['user>orch', 'orch>retr', 'retr>orch', 'orch>llm', 'llm>orch'],
          ok: ['retr', 'llm'],
          badges: { llm: ['cites [2][4]', 'ok'] }
        }
      }
    ],
    usedBy: ['Microsoft 365 Copilot', 'Perplexity', 'Glean', 'Support bots that answer from help-center articles', 'Coding assistants that search your codebase', 'Model Context Protocol (MCP) tool servers'],
    whenToUse: [
      'Answers must come from <b>private or fast-changing</b> documents, with citations',
      'Different users are allowed to see <b>different documents</b>',
      'The assistant must look things up or take actions in other systems'
    ],
    whenNot: [
      'Only a handful of short documents: put them straight into the prompt',
      'Users want a list of matching documents, not a written answer (see <a href="search-engine.html">Distributed Search Engine</a>)',
      'The model must learn a new style or skill rather than new facts: that is fine-tuning'
    ],
    glossary: [
      { term: 'Chunk', def: 'A small passage cut from a document, a few hundred tokens long, that is indexed and retrieved on its own.' },
      { term: 'Embedding', def: 'A list of numbers that captures a text\'s meaning, so similar passages can be found even with different words.' },
      { term: 'BM25', def: 'A classic keyword-ranking formula that scores documents by how often, and how rarely, the query words appear.' },
      { term: 'Reciprocal rank fusion (RRF)', def: 'A simple way to merge two ranked lists by adding 1 / (k + rank) for each item.' },
      { term: 'Reranker', def: 'A slower, more accurate model that rescores the top few dozen chunks and keeps the best handful.' },
      { term: 'ACL', def: 'Access control list: which users or groups may open a document, copied onto its chunks.' },
      { term: 'Agent loop', def: 'The model proposes a tool call, the system runs it, and the result goes back to the model, until it gives a final answer.' },
      { term: 'MCP', def: 'Model Context Protocol: an open standard for exposing tools and data to AI assistants through one interface.' }
    ]
  },

  requirements: {
    functional: [
      'Ingest docs from many sources, re-index on change',
      'Answer questions with citations to source chunks',
      'Respect each user\'s document permissions',
      'Agents call tools (APIs, SQL, tickets) via MCP',
      'Keep conversation memory across turns',
      'Trace every step; collect feedback for evals'
    ],
    nonFunctional: [
      'First token in ≲ 2 s for a simple question',
      'Never show a chunk the user cannot open',
      'Index freshness: minutes after a doc changes',
      'Bounded cost per query and per agent run',
      'Agents stop: step and token budgets',
      'Swap LLM or embedding model without a rewrite'
    ],
    outOfScope: ['Training or fine-tuning models', 'The LLM serving stack (see LLM Inference)', 'Provider routing and quotas (see LLM Gateway)']
  },

  calculator: {
    inputs: [
      { id: 'docs', label: 'Documents in the corpus', min: 10000, max: 100000000, value: 1000000, log: true },
      { id: 'tpd', label: 'Average tokens per document', min: 200, max: 20000, value: 2000, log: true },
      { id: 'chunk', label: 'Chunk size', min: 128, max: 2048, step: 64, value: 512, unit: 'tokens' },
      { id: 'overlap', label: 'Chunk overlap', min: 0, max: 50, step: 5, value: 10, unit: '%' },
      { id: 'dims', label: 'Embedding dimensions', min: 256, max: 3072, step: 128, value: 1024 },
      { id: 'qpd', label: 'Questions per day', min: 1000, max: 50000000, value: 500000, log: true }
    ],
    outputs: [
      { label: 'Chunks to index', f: (v) => v.docs * v.tpd / (v.chunk * (1 - v.overlap / 100)) },
      { label: 'Vector index (float32, +50% graph overhead)', fmt: 'bytes', f: (v) => v.docs * v.tpd / (v.chunk * (1 - v.overlap / 100)) * v.dims * 4 * 1.5 },
      { label: 'Tokens to embed for a full re-index', f: (v) => v.docs * v.tpd / (1 - v.overlap / 100) },
      { label: 'Peak questions per second (3× average)', f: (v) => v.qpd / 86400 * 3 },
      { label: 'Prompt tokens per answer (8 chunks + 1.5K)', f: (v) => 8 * v.chunk + 1500 },
      { label: 'Prompt tokens per day', f: (v) => v.qpd * (8 * v.chunk + 1500) }
    ],
    note: 'The +50% for the HNSW graph and the 1.5K tokens of system prompt and history are <em>estimates</em>. Two levers dominate: <b>chunk size × chunks injected</b> drives LLM cost on every question, while <b>dimensions × chunks</b> drives index RAM. Halving dimensions (or quantizing) halves the index; it does not change LLM cost.'
  },

  api: [
    { m: 'POST', p: '/v1/ingest', d: '<code>{source, doc_id, version, uri, acl_groups}</code>. Async: parse → chunk → contextualize → embed → upsert. Idempotent per <code>(doc_id, version)</code>.' },
    { m: 'SSE', p: '/v1/ask', d: 'Question in, streamed answer out, with <code>citations: [{chunk_id, doc_id, uri}]</code>. The caller\'s identity decides which chunks are searchable.' },
    { m: 'POST', p: '/v1/agents/{id}/runs', d: 'Starts an agent run. Events stream back: <code>llm</code>, <code>tool_call</code>, <code>tool_result</code>, <code>final</code>. Has <code>max_steps</code> and a token budget.' },
    { m: 'RPC', p: 'MCP tools/list · tools/call', d: 'JSON-RPC to MCP servers that expose tools (tickets, SQL, CRM) with JSON-schema inputs. One protocol instead of N custom connectors.' },
    { m: 'POST', p: '/v1/runs/{id}/feedback', d: 'Thumbs up/down plus a comment. Bad runs become regression cases in the eval set.' }
  ],
  dataModel: [
    { name: 'chunks', store: 'Postgres + pgvector', fields: [['id', 'bigint', 'pk'], ['doc_id, doc_version', 'text, int', 'fk'], ['content, context', 'text'], ['embedding', 'vector(1024)', 'idx'], ['tsv', 'tsvector', 'idx'], ['acl_groups', 'text[]', 'idx']], note: 'HNSW on the embedding, GIN on the text and on the ACL array. <code>context</code> is the short generated prefix used by contextual retrieval.' },
    { name: 'documents', store: 'Postgres', fields: [['doc_id', 'text', 'pk'], ['source, uri', 'text'], ['version', 'int'], ['content_hash', 'sha256', 'idx'], ['acl_groups', 'text[]'], ['indexed_at', 'timestamptz']], note: 'The hash skips re-embedding unchanged docs. ACLs are copied from the source system on every sync.' },
    { name: 'run_steps', store: 'Postgres / trace store', fields: [['run_id', 'uuid', 'pk'], ['step', 'int', 'sk'], ['kind', 'llm | tool | retrieval'], ['input, output', 'jsonb'], ['tokens_in, tokens_out', 'int'], ['latency_ms', 'int']], note: 'Every step is traced, so a bad answer can be replayed and turned into an eval case.' },
    { name: 'memory', store: 'Postgres + pgvector', fields: [['user_id', 'text', 'pk'], ['summary', 'text'], ['fact', 'text', 'sk'], ['fact_embedding', 'vector', 'idx']], note: 'Short-term: the running conversation summary. Long-term: facts retrieved like any other chunk.' }
  ],

  architecture: {
    title: 'RAG and agent platform',
    nodes: [
      { id: 'user', label: 'User / app', sub: 'chat · copilot · API', kind: 'client', wide: [90, 160], tall: [105, 0], tip: 'Sends a question with the caller\'s identity, which decides which documents are searchable.' },
      { id: 'guard', label: 'Guardrails', sub: 'injection · PII · policy', kind: 'edge', wide: [280, 160], tall: [315, 0], tip: 'Checks input (prompt injection, PII) and output (policy, missing citations) before anything reaches the user.' },
      { id: 'orch', label: 'Orchestrator', sub: 'think → act → observe', kind: 'service', wide: [470, 160], tall: [210, 105], tip: 'Runs the workflow or agent loop: calls the LLM, executes the tool calls it asks for, feeds results back, and enforces step and token budgets.' },
      { id: 'llm', label: 'LLM (via gateway)', sub: 'tool calling · streaming', kind: 'ml', wide: [470, 50], tall: [350, 105], tip: 'Any provider behind the LLM gateway. It never touches data directly: it only proposes tool calls.' },
      { id: 'evals', label: 'Evals + tracing', sub: 'RAGAS · golden sets', kind: 'compute', wide: [660, 160], tall: [70, 210], tip: 'Every step is traced. Offline golden sets and online feedback measure retrieval recall, faithfulness and answer relevance.' },
      { id: 'mem', label: 'Memory', sub: 'summary + long-term', kind: 'cache', wide: [280, 50], tall: [70, 105], tip: 'Short-term conversation summary plus long-term facts stored as vectors.' },
      { id: 'retr', label: 'Retrieval tool', sub: 'hybrid · RRF · ACL', kind: 'service', wide: [470, 270], tall: [210, 210], tip: 'Runs dense and keyword search in parallel with the user\'s ACL filter, then fuses the rankings with reciprocal rank fusion.' },
      { id: 'rerank', label: 'Reranker', sub: 'cross-encoder · top 5', kind: 'ml', wide: [660, 270], tall: [350, 315], tip: 'Scores each (question, chunk) pair jointly. Slower than vector search, so it only sees the fused top ~50.' },
      { id: 'tools', label: 'MCP servers', sub: 'tickets · SQL · APIs', kind: 'external', wide: [660, 50], tall: [350, 210], tip: 'Tools exposed through the Model Context Protocol. Side-effecting tools need approval and idempotency keys.' },
      { id: 'vdb', label: 'Vector index', sub: 'pgvector HNSW', kind: 'store', wide: [375, 380], tall: [70, 315], tip: 'Chunk embeddings for semantic matches: paraphrases, synonyms, other languages.' },
      { id: 'bm25', label: 'Keyword index', sub: 'BM25 · exact terms', kind: 'store', wide: [565, 380], tall: [210, 315], tip: 'Exact matches: error codes, product names, IDs that embeddings blur.' },
      { id: 'src', label: 'Sources', sub: 'Drive · Confluence · DB', kind: 'external', wide: [280, 490], tall: [70, 420], tip: 'Systems of record. Webhooks or change feeds tell the pipeline what changed, along with each doc\'s permissions.' },
      { id: 'ingest', label: 'Ingest pipeline', sub: 'parse · chunk · embed', kind: 'compute', wide: [470, 490], tall: [210, 420], tip: 'Parses, chunks, adds a short context to each chunk, embeds it, and upserts into both indexes with the doc\'s ACLs.' }
    ],
    edges: [
      { from: 'user', to: 'guard', bidi: true },
      { from: 'guard', to: 'orch', bidi: true },
      { from: 'orch', to: 'llm', bidi: true },
      { from: 'orch', to: 'retr', bidi: true },
      { from: 'orch', to: 'mem', bidi: true },
      { from: 'orch', to: 'tools', bidi: true },
      { from: 'orch', to: 'evals', dashed: true },
      { from: 'retr', to: 'rerank', bidi: true },
      { from: 'retr', to: 'vdb', bidi: true },
      { from: 'retr', to: 'bm25', bidi: true },
      { from: 'src', to: 'ingest' },
      { from: 'ingest', to: 'vdb' },
      { from: 'ingest', to: 'bm25' }
    ]
  },

  scenarios: [
    {
      id: 'ask', title: 'Grounded answer with citations', tone: 'info',
      steps: [
        { text: 'A user asks <i>"How many vacation days do we get in Germany?"</i>. Guardrails scan the input for prompt injection and PII.', flow: ['user>guard', 'guard>orch'] },
        { text: 'The orchestrator calls the retrieval tool with the question and the user\'s <b>ACL groups</b>.', flow: ['orch>retr'], badges: { retr: 'groups: de-staff' } },
        { text: '<b>Dense</b> and <b>BM25</b> search run in parallel, both filtered by ACL. Each returns its own top 50.', flow: [['retr>vdb', 'retr>bm25']], badges: { vdb: 'top 50 dense', bm25: 'top 50 BM25' } },
        { text: '<b>Reciprocal rank fusion</b> merges the lists: <code>score = Σ 1/(60 + rank)</code>. A cross-encoder <b>reranks</b> the fused top 50 and keeps 5.', flow: ['vdb>retr', 'bm25>retr', 'retr>rerank', 'rerank>retr'], badges: { rerank: 'keep 5' } },
        { text: 'The LLM answers <b>only from those 5 chunks</b> and cites them. If they do not contain the answer, it must say so.', flow: ['retr>orch', 'orch>llm', 'llm>orch'], badges: { llm: 'cites [2][4]' }, tone: 'ok' },
        { text: 'Output guardrails check that every claim has a citation. The answer streams back and the whole trace is logged for evals.', flow: ['orch>guard', 'guard>user', 'orch>evals'], ok: ['user'], tone: 'ok' }
      ]
    },
    {
      id: 'agent', title: 'Agent loop with tool calls', tone: 'info',
      steps: [
        { text: '<i>"Refund order 1182 if it arrived damaged."</i> The LLM cannot know the answer, so it replies with a <b>tool call</b>: <code>get_order(1182)</code>.', flow: ['user>guard', 'guard>orch', 'orch>llm', 'llm>orch'], badges: { llm: 'tool_use: get_order' } },
        { text: 'The orchestrator (not the model) runs the tool through an <b>MCP server</b> and appends the result to the conversation as an observation.', flow: ['orch>tools', 'tools>orch'], badges: { tools: 'damaged = true' } },
        { text: 'Next turn: the model asks for the refund policy. That is just another tool: retrieval.', flow: ['orch>llm', 'llm>orch', 'orch>retr', 'retr>orch'], badges: { retr: 'policy §4.2' } },
        { text: 'It now asks for <code>issue_refund</code>. That tool has side effects, so it needs <b>human approval</b> and an idempotency key.', flow: ['orch>llm', 'llm>orch'], warn: ['tools'], badges: { tools: ['needs approval', 'warn'] }, tone: 'warn' },
        { text: 'Approved and executed. The model writes the final answer (no more tool calls), which ends the loop. A summary goes to memory.', flow: ['orch>tools', 'tools>orch', 'orch>mem', 'orch>guard', 'guard>user'], ok: ['user', 'tools'], tone: 'ok' }
      ]
    },
    {
      id: 'toolfail', title: 'Tool fails → retry, then replan', tone: 'err',
      steps: [
        { text: 'The CRM MCP server times out on <code>get_customer</code>.', flow: ['orch>tools'], err: ['tools'], badges: { tools: ['timeout', 'err'] }, tone: 'err' },
        { text: 'It is a <b>read</b>, so the orchestrator retries twice with backoff. It is still down.', flow: ['orch>tools', 'orch>tools'], err: ['tools'], badges: { orch: ['retry 2/2', 'warn'] }, tone: 'warn' },
        { text: 'The error goes back to the model as a tool result marked <code>is_error</code>, not as an exception. The model <b>replans</b>: it searches the docs instead, or asks the user.', flow: ['orch>llm', 'llm>orch', 'orch>retr'], badges: { llm: 'replan' } },
        { text: 'A <b>step budget</b> (for example 8 steps) stops a model that keeps retrying. The run is flagged in tracing so it shows up in the eval review.', flow: ['orch>evals'], warn: ['evals'], badges: { evals: ['flagged run', 'warn'] }, tone: 'ok' }
      ]
    },
    {
      id: 'reindex', title: 'Doc changed: re-index at scale', tone: 'warn',
      steps: [
        { text: 'The leave policy changes in Confluence. A webhook tells the pipeline which doc changed, with its new <b>version</b> and permissions.', flow: ['src>ingest'], badges: { src: 'doc 77 → v8' } },
        { text: 'Only that doc is re-chunked. Each chunk gets a short <b>generated context</b> ("This is from the 2025 German leave policy…") before it is embedded.', nodes: ['ingest'], badges: { ingest: 'contextualize' } },
        { text: 'New chunks are upserted into <b>both</b> indexes and old versions deleted in one transaction, so search never sees a half-updated doc.', flow: [['ingest>vdb', 'ingest>bm25']], badges: { vdb: 'v7 → v8', bm25: 'v7 → v8' }, tone: 'ok' },
        { text: 'Changing the <b>embedding model</b> is different: every vector must be recomputed. Build a new index in parallel, compare on the eval set, then switch an alias.', nodes: ['ingest', 'vdb', 'evals'], warn: ['vdb'], badges: { vdb: ['full re-embed', 'warn'] }, tone: 'warn' }
      ]
    },
    {
      id: 'acl', title: 'Permission leak through retrieval', tone: 'err',
      steps: [
        { text: 'An intern asks about <i>"salary bands for senior engineers"</i>. A naive index has no permissions, so retrieval returns an HR-only chunk.', flow: ['user>guard', 'guard>orch', 'orch>retr', 'retr>vdb'], err: ['vdb'], badges: { vdb: ['HR-only chunk', 'err'] }, tone: 'err' },
        { text: 'The LLM faithfully summarizes it. <b>Prompting the model to "respect permissions" does not work</b>: once text is in the context, it can leak.', flow: ['retr>orch', 'orch>llm'], err: ['llm'], badges: { llm: ['leaks bands', 'err'] }, tone: 'err' },
        { text: 'Fix: copy each source doc\'s ACL onto its chunks at ingest, and filter <b>inside the search query</b> (<code>acl_groups &amp;&amp; :user_groups</code>) for both indexes.', flow: ['orch>retr', ['retr>vdb', 'retr>bm25']], ok: ['vdb', 'bm25'], badges: { retr: ['ACL filter', 'ok'] }, tone: 'ok' },
        { text: 'Filter before top-k, not after: post-filtering a top 50 can leave nothing. The model then answers "I can\'t find that in documents you can access."', flow: ['retr>orch', 'orch>llm', 'orch>guard', 'guard>user'], ok: ['user'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Five choices that decide retrieval quality, latency and cost. The first three come from published retrieval experiments; the agent numbers are illustrative.',
    controls: [
      { id: 'chunk', label: 'Chunking', type: 'seg', value: 'fixed', options: [
        { v: 'fixed', l: 'Fixed size' }, { v: 'semantic', l: 'Semantic (by section)' }, { v: 'ctx', l: 'Contextual (+ generated prefix)' }] },
      { id: 'ret', label: 'Retrieval', type: 'seg', value: 'hybrid', options: [
        { v: 'dense', l: 'Dense only' }, { v: 'bm25', l: 'BM25 only' }, { v: 'hybrid', l: 'Hybrid (RRF)' }, { v: 'rerank', l: 'Hybrid + rerank' }] },
      { id: 'k', label: 'Chunks given to the LLM (top-k)', type: 'range', min: 2, max: 40, step: 1, value: 8 },
      { id: 'pattern', label: 'Agent pattern', type: 'seg', value: 'workflow', options: [
        { v: 'single', l: 'Single call' }, { v: 'workflow', l: 'Workflow' }, { v: 'agent', l: 'Autonomous agent' }, { v: 'multi', l: 'Multi-agent' }] },
      { id: 'mem', label: 'Memory', type: 'seg', value: 'summary', options: [
        { v: 'none', l: 'None' }, { v: 'summary', l: 'Running summary' }, { v: 'vector', l: 'Summary + vector facts' }] }
    ],
    evaluate(s) {
      // top-20 retrieval failure rates (%). Anthropic 2024: dense 5.7, contextual dense 3.7,
      // contextual hybrid 2.9, contextual hybrid + rerank 1.9. Every other cell is an estimate.
      const F20 = {
        dense: { fixed: 5.7, semantic: 5.0, ctx: 3.7 },
        bm25: { fixed: 7.5, semantic: 7.0, ctx: 5.8 },
        hybrid: { fixed: 4.6, semantic: 4.1, ctx: 2.9 },
        rerank: { fixed: 3.1, semantic: 2.8, ctx: 1.9 }
      }[s.ret][s.chunk] / 100;
      const fail = Math.min(0.6, F20 * Math.pow(20 / s.k, 0.7));
      const recall = 1 - fail;
      const chunkTok = 400 + (s.chunk === 'ctx' ? 80 : 0);
      const memTok = { none: 0, summary: 300, vector: 700 }[s.mem];
      const ctxTok = s.k * chunkTok + 1500 + memTok;
      const P = {
        single: { calls: 1, rcalls: 1, rel: 0.95, dbg: ['one call: trivial to trace', 0.95] },
        workflow: { calls: 3, rcalls: 1, rel: 0.88, dbg: ['fixed code path: easy to trace', 0.85] },
        agent: { calls: 6, rcalls: 2, rel: 0.7, dbg: ['model picks the path: needs tracing', 0.5] },
        multi: { calls: 14, rcalls: 4, rel: 0.55, dbg: ['many agents: hard to reproduce', 0.3] }
      }[s.pattern];
      const retMs = { dense: 40, bm25: 25, hybrid: 50, rerank: 200 }[s.ret];
      const memMs = { none: 0, summary: 0, vector: 40 }[s.mem];
      const latency = P.calls * (700 + ctxTok * 0.03) + P.rcalls * retMs + memMs;
      const tokens = P.calls * (ctxTok + 300);
      const cost = tokens * 3e-6 + (s.ret === 'rerank' ? 0.0005 * P.rcalls : 0); // illustrative $3 per 1M tokens
      const dilution = s.k > 20 && s.ret !== 'rerank' ? (s.k - 20) * 0.012 : 0;
      const ground = Math.max(0, recall - dilution - (s.mem === 'none' ? 0.05 : 0));
      const metrics = [
        { k: 'Retrieval recall@k', v: (recall * 100).toFixed(1) + '% (miss ' + (fail * 100).toFixed(1) + '%)', s: clamp01((recall - 0.6) / 0.4), hint: 'k = ' + s.k },
        { k: 'Answer groundedness', v: ground >= 0.95 ? 'high' : ground >= 0.88 ? 'good' : ground >= 0.8 ? 'patchy' : 'poor', s: clamp01((ground - 0.6) / 0.4) },
        { k: 'Latency (end to end)', v: '≈ ' + (latency / 1000).toFixed(1) + ' s', s: clamp01(1 - latency / 15000) },
        { k: 'Cost per question', v: '≈ $' + cost.toFixed(3), s: clamp01(1 - cost / 0.4), hint: 'illustrative' },
        { k: 'Context tokens per call', v: SD.fmt.num(ctxTok), s: clamp01(1 - ctxTok / 20000) },
        { k: 'Reliability', v: { single: 'very high', workflow: 'high', agent: 'medium: errors compound', multi: 'low: hand-offs drop context' }[s.pattern], s: P.rel },
        { k: 'Debuggability', v: P.dbg[0], s: P.dbg[1] }
      ];
      const notes = [];
      if (s.ret === 'dense') notes.push('Embeddings blur rare exact strings: error codes, SKUs, names. BM25 catches those, which is why hybrid wins.');
      if (s.ret === 'bm25') notes.push('BM25 misses paraphrases: "time off for new parents" shares no words with "parental leave".');
      if (s.ret === 'rerank') notes.push('A cross-encoder reads question and chunk together. It is too slow for the whole corpus, so it only reorders the fused top ~50.');
      if (s.chunk === 'ctx') notes.push('Anthropic\'s <b>contextual retrieval</b> prepends a short, generated context to every chunk before embedding and BM25 indexing. With hybrid + rerank they report 67% fewer failed retrievals.');
      if (s.chunk === 'fixed') notes.push('Fixed windows cut tables and sections in half. A chunk saying "the limit is 30 days" may no longer say <i>which</i> limit.');
      if (s.k > 20 && s.ret !== 'rerank') notes.push('Stuffing ' + s.k + ' chunks adds noise and cost. Rerank and pass fewer, better chunks.');
      if (s.pattern === 'multi') notes.push('Multi-agent setups multiply LLM calls. Use them for broad, parallel research tasks, not for Q&amp;A.');
      if (s.pattern === 'agent') notes.push('An agent is the right call when you cannot predict the steps. Give it a step budget, tool schemas with clear descriptions, and tracing.');
      if (s.mem === 'vector') notes.push('Long-term facts are retrieved like chunks, so they need the same ACL and staleness rules.');
      let verdict;
      if (s.pattern === 'multi') verdict = '⚠ <b>Expensive and hard to debug for Q&amp;A.</b> Keep multi-agent for open-ended research that splits into parallel parts.';
      else if (s.ret === 'bm25' && s.chunk !== 'ctx') verdict = '⚠ <b>Keyword-only search misses paraphrases.</b> Add a dense index and fuse the two.';
      else if (s.k > 25 && s.ret !== 'rerank') verdict = '⚠ <b>Context stuffing.</b> More chunks raise cost and bury the right one. Rerank and keep about 5–10.';
      else if (s.chunk === 'ctx' && s.ret === 'rerank' && (s.pattern === 'workflow' || s.pattern === 'single')) verdict = '✅ <b>Strong production setup:</b> contextual chunks, hybrid search, reranking, and a predictable workflow.';
      else if (s.ret === 'dense') verdict = '👍 <b>Fine for prose.</b> Expect misses on exact identifiers until you add BM25.';
      else if (s.pattern === 'agent') verdict = '👍 <b>Flexible but costlier.</b> Worth it when steps depend on what tools return.';
      else verdict = '👍 <b>Solid baseline.</b> Check recall and cost; reranking and contextual chunks are the next upgrades.';
      const hide = [];
      if (s.ret !== 'rerank') hide.push('rerank');
      if (s.ret === 'bm25') hide.push('vdb');
      if (s.ret === 'dense') hide.push('bm25');
      if (s.pattern === 'single') hide.push('tools');
      if (s.mem === 'none') hide.push('mem');
      const flow = ['user>guard', 'guard>orch'];
      if (s.mem !== 'none') flow.push('orch>mem');
      flow.push('orch>retr');
      const par = []; if (s.ret !== 'bm25') par.push('retr>vdb'); if (s.ret !== 'dense') par.push('retr>bm25');
      flow.push(par.length > 1 ? par : par[0]);
      if (s.ret === 'rerank') flow.push('retr>rerank');
      flow.push('orch>llm');
      if (s.pattern !== 'single') flow.push('orch>tools', 'orch>llm');
      flow.push('orch>guard', 'guard>user');
      return {
        metrics, verdict, notes, hide, flow,
        labels: {
          ingest: { label: 'Ingest pipeline', sub: { fixed: 'fixed 512-token windows', semantic: 'split by headings', ctx: 'chunk + LLM context' }[s.chunk] },
          retr: { label: 'Retrieval tool', sub: { dense: 'dense only', bm25: 'BM25 only', hybrid: 'hybrid · RRF', rerank: 'hybrid → rerank' }[s.ret] + ' · k=' + s.k },
          orch: { label: 'Orchestrator', sub: { single: 'one LLM call', workflow: 'fixed steps', agent: 'loop until done', multi: 'lead + sub-agents' }[s.pattern] },
          llm: { label: 'LLM (via gateway)', sub: '≈ ' + P.calls + ' call' + (P.calls > 1 ? 's' : '') + ' / question' }
        },
        hot: s.ret === 'rerank' ? ['rerank'] : [],
        warn: s.pattern === 'multi' ? ['llm'] : s.k > 25 && s.ret !== 'rerank' ? ['llm'] : [],
        badges: { retr: ['miss ' + (fail * 100).toFixed(1) + '%', fail > 0.1 ? 'warn' : 'info'] }
      };
      function clamp01(x) { return Math.max(0.03, Math.min(1, x)); }
    }
  },

  widget: {
    title: 'Hybrid retrieval: BM25 + dense → RRF → rerank',
    caption: 'A 10-chunk mini corpus. <b>BM25 is real</b> (k1 = 1.2, b = 0.75). The "embedding" is a <b>toy</b> concept vector (synonyms map to the same dimension), and the reranker is a toy stand-in for a cross-encoder. Try the three questions: each one is won by a different retriever, and fusion catches all of them.'
  },

  realWorld: {
    intro: 'The core recipe was published in 2020. Most progress since then is in retrieval quality, evaluation and tool access.',
    timeline: [
      { when: '2009', who: 'Univ. of Waterloo', title: 'Reciprocal rank fusion', text: 'Cormack, Clarke and Büttcher show that summing <code>1/(k + rank)</code> across rankings beats Condorcet and learned fusion. <b>k = 60</b> was fixed in a pilot and not tuned further. Today it is the default way to merge dense and keyword results.', src: 1 },
      { when: '2020', who: 'Facebook AI', title: 'Retrieval-augmented generation', text: 'Lewis et al. pair a seq2seq generator (parametric memory) with a <b>dense vector index of Wikipedia</b> (non-parametric memory) behind a neural retriever. Answers were more specific and factual than the generator alone.', src: 0 },
      { when: '2023', who: 'Es et al.', title: 'RAGAS', text: 'A framework for <b>reference-free</b> evaluation of RAG pipelines: did the retriever find relevant context, did the model stay faithful to it, and is the answer relevant, without human labels for every case.', src: 2 },
      { when: 'Sep 2024', who: 'Anthropic', title: 'Contextual retrieval', text: 'Prepend a generated, chunk-specific context before embedding and BM25 indexing. Contextual embeddings cut top-20 retrieval failures from <b>5.7% to 3.7%</b>; adding contextual BM25 reached <b>2.9% (−49%)</b>; adding reranking reached <b>1.9% (−67%)</b>.', src: 3 },
      { when: 'Nov 2024', who: 'Anthropic', title: 'Model Context Protocol', text: 'An open protocol that connects assistants to tools and data, replacing one custom connector per (app, tool) pair. OpenAI adopted it in March 2025.', src: 5 },
      { when: 'Dec 2024', who: 'Anthropic', title: 'Building effective agents', text: 'Separates <b>workflows</b> (LLMs and tools on predefined code paths) from <b>agents</b> (the model directs its own steps). Advice: start with the simplest pattern and add complexity only when it clearly pays off.', src: 4 }
    ],
    lessons: [
      'Measure <b>retrieval recall</b> separately from answer quality. Most bad answers start with a missed chunk.',
      '<b>Hybrid + rerank</b> is the default. Pure vector search loses exact identifiers.',
      'Enforce permissions <b>in the query</b>, never in the prompt.',
      'Prefer a <b>workflow</b>. Use an agent when the path depends on what tools return, and give it budgets.'
    ],
    sources: [
      { title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', url: 'https://arxiv.org/abs/2005.11401', pub: 'Lewis et al., 2020' },
      { title: 'Reciprocal rank fusion outperforms Condorcet and individual rank learning methods', url: 'https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf', pub: 'SIGIR 2009' },
      { title: 'Ragas: Automated Evaluation of Retrieval Augmented Generation', url: 'https://arxiv.org/abs/2309.15217', pub: 'arXiv, 2023' },
      { title: 'Introducing Contextual Retrieval', url: 'https://www.anthropic.com/news/contextual-retrieval', pub: 'Anthropic, Sep 2024' },
      { title: 'Building effective agents', url: 'https://www.anthropic.com/research/building-effective-agents', pub: 'Anthropic, Dec 2024' },
      { title: 'Model Context Protocol', url: 'https://en.wikipedia.org/wiki/Model_Context_Protocol', pub: 'Wikipedia' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Chunk size', '<b>Small (128–256 tokens)</b>: precise matches, less context', '<b>Large (512–1024)</b>: more context, noisier embeddings', 'Small chunks plus a parent-section lookup, or contextual prefixes'],
      ['Retrieval', '<b>Dense</b>: paraphrases, multilingual', '<b>BM25</b>: exact codes and names, no model', 'Both, fused with RRF. It costs one extra index'],
      ['Reranking', '<b>None</b>: fast and cheap', '<b>Cross-encoder</b>: adds roughly 100–300 ms (<em>estimate</em>), better top 5', 'Rerank whenever answer quality matters more than a fraction of a second'],
      ['Control flow', '<b>Workflow</b>: fixed steps, predictable', '<b>Agent</b>: model chooses steps', 'Agents only when the path depends on tool results'],
      ['Long context vs RAG', '<b>Put the whole doc in the prompt</b>: simple', '<b>Retrieve</b>: cheaper, scales to millions of docs', 'Whole-doc for a few small docs; RAG beyond that'],
      ['Memory', '<b>Running summary</b>: cheap', '<b>Vector facts</b>: recalls old details', 'Summary by default; facts for long-lived assistants']
    ]
  },
  failures: [
    { f: 'Answer invented when retrieval misses', detect: 'Faithfulness eval; answers without citations', fix: 'Require citations, allow "not found", measure recall@k, add BM25 and reranking.' },
    { f: 'Chunk shown to the wrong user', detect: 'ACL audit tests on the eval set', fix: 'Store ACLs on chunks, filter in the query, re-sync permissions with the source.' },
    { f: 'Prompt injection in a retrieved doc', detect: 'Guardrail classifier; tool calls that do not match the task', fix: 'Treat retrieved text as data, restrict tools per task, require approval for side effects.' },
    { f: 'Agent loops or burns tokens', detect: 'Step count and token spend per run', fix: 'Step and token budgets, repeated-call detection, fall back to a workflow.' },
    { f: 'Stale answers after a doc change', detect: 'Index lag metric (source updated_at vs indexed_at)', fix: 'Change feeds or webhooks, versioned upserts, delete old chunks in the same transaction.' },
    { f: 'Quality drops after an embedding model change', detect: 'Recall@k on a golden set', fix: 'Build a new index side by side, compare, switch an alias. Never mix vectors from two models.' },
    { f: 'Tool or MCP server down', detect: 'Tool error rate and latency', fix: 'Retry reads with backoff, return errors to the model as tool results, let it replan.' }
  ],

  interview: [
    { q: 'Why hybrid search instead of only vectors?', a: '<p>Dense embeddings match <b>meaning</b> (paraphrases, synonyms, other languages) but blur rare exact strings such as error codes, SKUs and names. BM25 matches <b>exact terms</b> but misses paraphrases.</p><p>Running both and fusing with <b>reciprocal rank fusion</b> (<code>Σ 1/(60 + rank)</code>) needs no score calibration, because it uses only ranks.</p>', lvl: 'core' },
    { q: 'How do you choose chunk size?', a: '<p>Smaller chunks give sharper embeddings and less noise in the prompt, but lose surrounding context ("the limit is 30 days": which limit?). Larger chunks keep context but dilute the embedding and cost more tokens.</p><p>Common fixes: split on document structure, keep a small overlap, add a <b>contextual prefix</b>, or retrieve small chunks and expand to the parent section.</p>', lvl: 'core' },
    { q: 'What is contextual retrieval?', a: '<p>Before indexing, an LLM writes a short context for each chunk using the whole document ("This chunk is from ACME\'s 2025 German leave policy, section on carry-over"). That prefix is embedded <b>and</b> added to the BM25 index.</p><p>Anthropic reported 49% fewer failed retrievals with contextual embeddings plus contextual BM25, and 67% fewer with reranking added.</p>', lvl: 'deep' },
    { q: 'How do you reduce hallucination in RAG?', a: '<ul><li>Improve retrieval first: most hallucinations follow a miss.</li><li>Tell the model to answer <b>only</b> from the given chunks and to say when they do not contain the answer.</li><li>Require <b>citations</b> and check them in an output guardrail.</li><li>Measure <b>faithfulness</b> on an eval set and track it per release.</li></ul>', lvl: 'core' },
    { q: 'Agent or workflow: how do you decide?', a: '<p>A <b>workflow</b> runs LLM calls and tools on code paths you wrote: classify → retrieve → answer → check. It is predictable, cheap and testable.</p><p>An <b>agent</b> lets the model choose the next step in a loop. Use it when the steps depend on what the tools return and cannot be listed ahead of time. Add step and token budgets, and tracing.</p>', lvl: 'core' },
    { q: 'How do you evaluate a RAG system?', a: '<p>Split it in two. <b>Retrieval</b>: recall@k and MRR against a labelled set of question → relevant chunks. <b>Generation</b>: faithfulness to the context, answer relevance and correctness, often scored by an LLM judge (as in RAGAS) that you spot-check against humans.</p><p>Add online signals: thumbs, citation clicks, escalations. Every bad trace becomes a regression case.</p>', lvl: 'core' },
    { q: 'How do you enforce document permissions in a multi-tenant system?', a: '<p>Copy ACLs from the source onto every chunk at ingest and keep them in sync. Filter <b>inside the search query</b> for every index (<code>WHERE acl_groups &amp;&amp; :groups</code>), before taking the top k.</p><p>Never rely on the prompt to hide text: anything in the context can leak. For large tenants, use a separate index or partition per tenant.</p>', fu: 'What breaks with post-filtering? (Top 50 minus forbidden chunks can be empty, so recall collapses.)', lvl: 'deep' },
    { q: 'Why add a reranker if you already have vector search?', a: '<p>Vector search uses a <b>bi-encoder</b>: question and chunk are embedded separately, which makes it fast enough for millions of chunks. A <b>cross-encoder</b> reads question and chunk together and scores relevance much better, but is too slow for the whole corpus.</p><p>So retrieve ~50 cheaply, then rerank to the best ~5.</p>', lvl: 'core' },
    { q: 'What is MCP and why use it?', a: '<p>The <b>Model Context Protocol</b> is an open, JSON-RPC-based protocol where servers expose tools, resources and prompts, and any compatible client (an agent or IDE) can list and call them.</p><p>It turns N apps × M tools of custom glue into N + M implementations, and puts a clear boundary where you enforce auth and approvals.</p>', lvl: 'core' },
    { q: 'How do you defend against prompt injection?', a: '<p>Treat retrieved documents and tool outputs as <b>untrusted data</b>. Limit which tools each task can call, require human approval for side effects, run input and output classifiers, and never give the agent credentials broader than the user\'s.</p><p>No filter is perfect, so design for <b>least privilege</b>.</p>', lvl: 'deep' },
    { q: 'How do you control cost and latency?', a: '<ul><li>Fewer, better chunks (rerank) instead of stuffing.</li><li>Small model for routing and query rewriting, large model only for the answer.</li><li>Prompt caching for the stable system prompt.</li><li>Stream tokens; run dense and BM25 in parallel.</li><li>Budgets per run, and caching of repeated questions.</li></ul>', lvl: 'deep' },
    { q: 'How do you keep the index fresh?', a: '<p>Use change feeds or webhooks from the sources. Re-chunk only changed docs, skip unchanged ones by content hash, and replace a doc\'s chunks in <b>one transaction</b> keyed by <code>(doc_id, version)</code>.</p><p>An embedding model upgrade needs a full re-embed into a new index, compared on the eval set, then switched with an alias.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Python: pgvector + full-text hybrid search with RRF', lang: 'python',
      code: `# pip install "psycopg[binary]" pgvector numpy
import numpy as np, psycopg
from pgvector.psycopg import register_vector

HYBRID = """
WITH dense AS (
  SELECT id, RANK() OVER (ORDER BY embedding <=> %(qvec)s) AS r
  FROM chunks WHERE acl_groups && %(groups)s
  ORDER BY embedding <=> %(qvec)s LIMIT 50
), keyword AS (
  SELECT id, RANK() OVER (ORDER BY ts_rank_cd(tsv, q) DESC) AS r
  FROM chunks, websearch_to_tsquery('english', %(qtext)s) q
  WHERE tsv @@ q AND acl_groups && %(groups)s
  ORDER BY ts_rank_cd(tsv, q) DESC LIMIT 50
)
SELECT c.id, c.doc_id, c.content,
       COALESCE(1.0 / (60 + d.r), 0) + COALESCE(1.0 / (60 + k.r), 0) AS rrf
FROM dense d FULL OUTER JOIN keyword k ON d.id = k.id
JOIN chunks c ON c.id = COALESCE(d.id, k.id)
ORDER BY rrf DESC LIMIT %(top)s
"""

def retrieve(conn: psycopg.Connection, question: str, groups: list[str],
             embed, top: int = 20) -> list[tuple]:
    qvec = np.asarray(embed(question), dtype=np.float32)   # same model as ingest
    with conn.cursor() as cur:
        cur.execute("SET LOCAL hnsw.ef_search = 100")
        cur.execute(HYBRID, {"qvec": qvec, "qtext": question,
                             "groups": groups, "top": top})
        return cur.fetchall()

with psycopg.connect("postgresql://rag@localhost/rag") as conn:
    register_vector(conn)
    candidates = retrieve(conn, "vacation days in Germany", ["de-staff"], embed)
    # then: rerank candidates with a cross-encoder and keep the best ~5`,
      note: 'Postgres <code>ts_rank_cd</code> is not true BM25. RRF only uses ranks, so it works either way, but for real BM25 use an extension such as ParadeDB <code>pg_search</code> or a search engine. With selective ACL filters, enable pgvector\'s iterative index scans (0.8+) so filtering does not starve the top 50.'
    },
    {
      title: 'Python: provider-agnostic tool-calling agent loop', lang: 'python',
      code: `import json
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

@dataclass
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]

@dataclass
class Reply:
    text: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)

class ChatModel(Protocol):          # adapt any provider SDK to this shape
    def chat(self, messages: list[dict], tools: list[dict]) -> Reply: ...

def run_agent(model: ChatModel, tools: dict[str, Callable[..., Any]],
              schemas: list[dict], question: str, max_steps: int = 8) -> str:
    messages = [{"role": "user", "content": question}]
    for _ in range(max_steps):
        reply = model.chat(messages, schemas)
        messages.append({"role": "assistant", "content": reply.text,
                         "tool_calls": [vars(c) for c in reply.tool_calls]})
        if not reply.tool_calls:            # no tool requested: final answer
            return reply.text or ""
        for call in reply.tool_calls:
            try:
                result, is_error = tools[call.name](**call.args), False
            except Exception as exc:        # unknown tool, bad args, timeout...
                result, is_error = f"{type(exc).__name__}: {exc}", True
            messages.append({"role": "tool", "tool_call_id": call.id,
                             "content": json.dumps(result, default=str),
                             "is_error": is_error})
    return "Stopped: step budget exhausted. Here is what I found so far."`,
      note: 'The model only <i>proposes</i> calls; your code executes them. Errors go back to the model as tool results so it can replan. Each provider adapter maps these neutral messages to its own tool-use format.'
    },
    {
      title: 'SQL: chunk table with HNSW, full-text and ACL indexes', lang: 'sql',
      code: `CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
  id          bigserial PRIMARY KEY,
  doc_id      text  NOT NULL,
  doc_version int   NOT NULL,
  content     text  NOT NULL,
  context     text,                                 -- generated prefix
  embedding   vector(1024) NOT NULL,
  tsv         tsvector GENERATED ALWAYS AS
              (to_tsvector('english', coalesce(context, '') || ' ' || content)) STORED,
  acl_groups  text[] NOT NULL
);
CREATE INDEX chunks_hnsw ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX chunks_tsv ON chunks USING gin (tsv);
CREATE INDEX chunks_acl ON chunks USING gin (acl_groups);
CREATE INDEX chunks_doc ON chunks (doc_id, doc_version);

-- replace one document atomically: readers never see a mix of versions
BEGIN;
DELETE FROM chunks WHERE doc_id = 'policy-77' AND doc_version < 8;
-- INSERT INTO chunks (...) VALUES (...);   -- the v8 chunks
COMMIT;

-- keep scanning the graph when filters remove candidates (pgvector 0.8+)
SET hnsw.iterative_scan = relaxed_order;`
    }
  ],

  related: ['vector-db', 'llm-gateway', 'llm-inference', 'search-engine', 'recommendation']
});
