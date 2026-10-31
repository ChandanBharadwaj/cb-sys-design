SD.register({
  slug: 'vector-db',
  domain: 8,
  title: 'Distributed Vector Database',
  examples: 'Milvus, Qdrant, Pinecone',
  tagline: 'Find the 10 nearest of <b>100 million 768-dimensional vectors</b> in a few milliseconds, with metadata filters, while new vectors keep arriving. The answer is approximate on purpose.',
  tldr: {
    problem: 'Exact nearest-neighbour search compares the query with every vector. For 100M × 768-d that is ~77 billion multiply-adds and 307 GB read per query. RAG and recommendations need ~10 ms, with filters, inserts and deletes.',
    idea: 'Build an <b>approximate index</b> per immutable <b>segment</b>: an <b>HNSW</b> graph (greedy walk down a layered small-world graph), <b>IVF</b> clusters (scan only the nearest few), or <b>PQ</b> codes (compress each vector to ~100 bytes). Writes go to a <b>log</b>; query nodes search their segments in parallel and a proxy <b>merges top-K</b>.',
    insight: 'Every index trades <b>recall ↔ latency ↔ memory</b>, with one knob each (ef, nprobe, code size). Measure recall against brute force on your own data. And treat <b>filters</b> as a first-class part of search, not an afterthought.',
    numbers: [
      { v: '307 GB', l: 'raw size of 100M × 768-d float32 vectors (100M × 768 × 4 B)' },
      { v: '64 GB', l: 'RAM for DiskANN to search 1B points on one node with an SSD (NeurIPS \'19)' },
      { v: '2 billion', l: 'vectors used to validate IVFADC / product quantization (TPAMI 2011)' }
    ]
  },

  intro: {
    what: 'A vector database stores <b>embeddings</b>: lists of numbers that capture the meaning of a piece of text, an image or a product. Given a new embedding, it quickly finds the stored ones that are <b>closest in meaning</b>. It also keeps metadata such as owner or language, so results can be filtered.',
    analogy: {
      icon: '📚',
      title: 'A library shelved by topic, not by title',
      text: 'In a library sorted by topic, you walk to the shelf for your subject and look only there, instead of reading every spine in the building. A vector database places every item at a point in a "meaning space", so similar items sit close together. A search jumps to the right neighbourhood and checks only nearby items. Like a quick shelf scan, it can now and then miss a good book shelved elsewhere: the answer is <b>approximate on purpose</b>.'
    },
    problem: 'A support bot must find the five help articles that best match "my card was charged twice", even when no article uses those exact words. Embeddings place "charged twice" and "duplicate payment" close together. But comparing the question with every one of many millions of stored vectors takes far too long. The core question is <b>how to find the nearest vectors among millions in a few milliseconds, with filters, while new ones keep arriving</b>.',
    story: [
      {
        stage: 'naive',
        title: 'Compare the query with every vector',
        text: 'Turn the question into a vector with an <b>embedding model</b>. Keep all stored vectors in one table. For each search, compute the distance from the query to <b>every</b> row, sort, and return the top 10. It is exact and simple, and fine for a few thousand items.',
        scene: {
          nodes: [
            { id: 'app', label: 'App', sub: 'user question', kind: 'client', at: [70, 0] },
            { id: 'emb', label: 'Embed model', sub: 'text → numbers', kind: 'ml', at: [350, 0] },
            { id: 'db', label: 'Vector table', sub: 'check every row', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'app', to: 'emb', bidi: true }, { from: 'app', to: 'db', bidi: true }],
          flow: ['app>emb', 'emb>app', 'app>db', 'db>app']
        }
      },
      {
        stage: 'breaks',
        title: 'Every search reads everything',
        text: 'Each vector has hundreds of numbers. With 100 million of them, one search means tens of billions of multiplications and <b>hundreds of gigabytes</b> of memory to read. That takes seconds, not milliseconds. One machine cannot hold it all in memory, and new vectors keep arriving while you search.',
        scene: {
          nodes: [
            { id: 'app', label: 'App', sub: 'waiting…', kind: 'client', at: [70, 0] },
            { id: 'emb', label: 'Embed model', sub: 'text → numbers', kind: 'ml', at: [350, 0] },
            { id: 'ins', label: 'New vectors', sub: 'keep arriving', kind: 'client', at: [70, 220] },
            { id: 'db', label: 'Vector table', sub: 'full scan', kind: 'store', at: [210, 110] }
          ],
          edges: [{ from: 'app', to: 'emb', bidi: true }, { from: 'app', to: 'db', bidi: true }, { from: 'ins', to: 'db' }],
          flow: [['app>db', 'ins>db'], 'db>app'],
          err: ['db'],
          warn: ['app'],
          badges: { db: ['seconds ⏳', 'err'], app: ['slow', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Use an approximate index, split across machines',
        text: 'Build an <b>approximate index</b>, such as a graph that links each vector to its near neighbours. A search hops through the graph toward the query and checks only a few thousand vectors. Split the data into <b>segments</b> spread over several query nodes. Each node returns its local top 10 and a <b>proxy</b> merges them. New writes land in a <b>log</b> first, so they are safe and searchable within about a second.',
        scene: {
          nodes: [
            { id: 'app', label: 'App', sub: 'user question', kind: 'client', at: [70, 0] },
            { id: 'emb', label: 'Embed model', sub: 'text → numbers', kind: 'ml', at: [350, 0] },
            { id: 'log', label: 'Write log', sub: 'new vectors', kind: 'queue', at: [70, 110] },
            { id: 'proxy', label: 'Proxy', sub: 'merge top 10', kind: 'edge', at: [210, 110] },
            { id: 'q1', label: 'Query node 1', sub: 'graph index', kind: 'compute', at: [70, 220] },
            { id: 'q2', label: 'Query node 2', sub: 'graph index', kind: 'compute', at: [210, 220] },
            { id: 'q3', label: 'Query node 3', sub: 'graph index', kind: 'compute', at: [350, 220] }
          ],
          edges: [{ from: 'app', to: 'emb', bidi: true }, { from: 'app', to: 'proxy', bidi: true }, { from: 'app', to: 'log' }, { from: 'log', to: 'q1', dashed: true }, { from: 'proxy', to: 'q1', bidi: true }, { from: 'proxy', to: 'q2', bidi: true }, { from: 'proxy', to: 'q3', bidi: true }],
          flow: ['app>proxy', ['proxy>q1', 'proxy>q2', 'proxy>q3'], ['q1>proxy', 'q2>proxy', 'q3>proxy'], 'proxy>app'],
          ok: ['q1', 'q2', 'q3'],
          badges: { proxy: ['top 10 in ms', 'ok'] }
        }
      }
    ],
    usedBy: ['Milvus', 'Qdrant', 'Pinecone', 'pgvector for Postgres', 'Chatbots that answer from documents (RAG)', 'Image and product similarity search'],
    whenToUse: [
      'You search by <b>meaning</b>, not exact words: questions, images, similar products',
      'Millions of embeddings or more, with answers needed <b>in milliseconds</b>',
      'Results must be filtered by metadata such as tenant, language or date'
    ],
    whenNot: [
      'Users search for exact words, ids or phrases: a keyword index fits better (see <a href="search-engine.html">Distributed Search Engine</a>)',
      'Up to a few million vectors next to rows you already have: the pgvector extension in Postgres is enough',
      'You need exact answers such as "all orders over $100": that is an ordinary database query'
    ],
    glossary: [
      { term: 'Embedding', def: 'A list of numbers (a vector) produced by a model, where similar meanings get nearby vectors.' },
      { term: 'Approximate nearest neighbour (ANN)', def: 'Search that finds almost the closest vectors while checking only a tiny fraction of them.' },
      { term: 'HNSW', def: 'Hierarchical Navigable Small World: a layered graph index where search greedily hops toward the query.' },
      { term: 'IVF', def: 'Inverted file index: vectors are grouped into clusters, and a search scans only the few clusters nearest the query.' },
      { term: 'Product quantization (PQ)', def: 'Compressing each vector into a short code so far more vectors fit in memory, at some cost in accuracy.' },
      { term: 'Recall', def: 'The share of the true top results that the approximate search actually returned, such as 95 of 100.' },
      { term: 'Segment', def: 'A chunk of the collection that is sealed (made read-only) once full and then gets its own index.' },
      { term: 'Metadata filter', def: 'A condition on stored fields, such as tenant_id = 42, applied together with the vector search.' }
    ]
  },

  requirements: {
    functional: [
      'Upsert / delete vectors with an id and metadata (tenant, doc, tags)',
      'Top-K similarity search (cosine, dot product, L2)',
      'Metadata filters combined with vector search',
      'Hybrid search: vector + keyword (BM25), fused',
      'Collections, partitions / namespaces per tenant',
      'Index choice per collection (HNSW, IVF-PQ, DiskANN)'
    ],
    nonFunctional: [
      'p99 search < ~50 ms at 1K+ QPS',
      'Recall@10 ≥ 0.95 vs exact search (tunable)',
      'New vectors searchable within ~1 s',
      'Scale storage and query independently',
      'Memory cost under control (quantization, disk indexes)',
      'Durable writes; node loss does not lose data'
    ],
    outOfScope: ['Embedding model training', 'Answer generation (see RAG platform / LLM inference)', 'Full-text relevance tuning (see Search Engine)', 'Recommendation ranking models']
  },

  calculator: {
    inputs: [
      { id: 'n', label: 'Vectors', min: 100000, max: 10000000000, value: 100000000, log: true },
      { id: 'd', label: 'Dimensions', min: 64, max: 4096, step: 64, value: 768 },
      { id: 'b', label: 'Bytes per dimension (4 = float32, 2 = half, 1 = int8)', min: 1, max: 4, step: 1, value: 4, unit: 'B' },
      { id: 'm', label: 'HNSW M (links per node; layer 0 keeps 2M)', min: 4, max: 64, step: 4, value: 16 },
      { id: 'pq', label: 'PQ code size per vector', min: 8, max: 256, step: 8, value: 96, unit: 'B' },
      { id: 'rep', label: 'Replicas (for QPS and availability)', min: 1, max: 3, value: 2 }
    ],
    outputs: [
      { label: 'Raw vectors', fmt: 'bytes', f: (v) => v.n * v.d * v.b },
      { label: 'HNSW graph links (≈ 2M × 4 B per node)', fmt: 'bytes', f: (v) => v.n * 2 * v.m * 4 * 1.05 },
      { label: 'HNSW in RAM × replicas', fmt: 'bytes', f: (v) => (v.n * v.d * v.b + v.n * 2 * v.m * 4 * 1.05) * v.rep },
      { label: 'IVF-PQ in RAM × replicas (codes + 8 B id)', fmt: 'bytes', f: (v) => v.n * (v.pq + 8) * v.rep },
      { label: 'PQ compression vs raw', f: (v) => (v.d * v.b) / v.pq, unit: '×' },
      { label: 'Query nodes for HNSW (64 GB usable each)', f: (v) => Math.ceil(((v.n * v.d * v.b + v.n * 2 * v.m * 4 * 1.05) * v.rep) / 64e9) }
    ],
    note: 'HNSW keeps <b>full vectors + graph</b> in RAM, so its size is dominated by the raw vectors. The graph adds only ~5%. PQ with 96-byte codes is 32× smaller than 3 KB float32 vectors but loses precision, so it usually re-ranks the top candidates with full vectors. 64 GB usable per node is an <em>estimate</em>.'
  },

  api: [
    { m: 'POST', p: '/v1/collections', d: '<code>{name, dim: 768, metric: "COSINE", index: {type: "HNSW", M: 16, efConstruction: 200}, partition_key: "tenant_id"}</code>' },
    { m: 'POST', p: '/v1/collections/{c}/upsert', d: 'Batch of <code>{id, vector, tenant_id, doc_id, text}</code>. Acknowledged once written to the log; searchable about a second later.' },
    { m: 'POST', p: '/v1/collections/{c}/search', d: '<code>{vector, topK: 10, filter: "tenant_id == 42 and lang == \'en\'", params: {ef: 64}}</code> → <code>[{id, score, fields}]</code>' },
    { m: 'DELETE', p: '/v1/collections/{c}/entities', d: 'By ids or filter. Writes tombstones (delete markers); compaction rewrites segments later.' },
    { m: 'SQL', p: 'ORDER BY embedding <=> $1 LIMIT 10', d: 'The pgvector way: vectors live next to your rows in Postgres, with HNSW or IVFFlat indexes.' }
  ],
  dataModel: [
    { name: 'collection', store: 'Metadata (etcd)', fields: [['collection_id', 'int64', 'pk'], ['dim, metric', 'int, enum'], ['index params', 'json'], ['shards (channels)', 'int'], ['partition_key', 'field']] },
    { name: 'segment', store: 'Metadata + object storage', fields: [['segment_id', 'int64', 'pk'], ['collection_id', 'int64', 'fk'], ['state', 'growing | sealed | indexed'], ['rows', 'int'], ['binlog / index paths', 's3://…'], ['channel', 'shard', 'idx']], note: 'Immutable once sealed. Indexes are built per segment.' },
    { name: 'entity', store: 'Segment (columnar)', fields: [['id', 'int64', 'pk'], ['vector', 'float32[768]'], ['tenant_id', 'int64', 'idx'], ['doc_id, text', 'scalar fields'], ['ts', 'MVCC timestamp']] },
    { name: 'log entry', store: 'WAL (Kafka / Pulsar)', fields: [['channel', 'shard', 'pk'], ['ts', 'hybrid timestamp', 'sk'], ['op', 'insert | delete'], ['payload', 'rows']], note: 'The log is the source of truth (Manu / Milvus 2.0).' }
  ],

  architecture: {
    title: 'Vector database architecture',
    nodes: [
      { id: 'client', label: 'App / RAG service', sub: 'upsert · search', kind: 'client', wide: [90, 110], tall: [70, 0], tip: 'Embeds text, upserts vectors with metadata, and searches with a query vector plus filters.' },
      { id: 'embed', label: 'Embedding model', sub: 'text → 768-d vector', kind: 'ml', wide: [90, 0], tall: [210, 0], tip: 'Must be the same model (and normalization) for documents and queries.' },
      { id: 'coord', label: 'Coordinators', sub: 'metadata · etcd', kind: 'service', wide: [660, 0], tall: [350, 0], tip: 'Own collection schemas, segment lifecycle (growing → sealed → indexed) and which query node serves which segment.' },
      { id: 'proxy', label: 'Proxy', sub: 'route · merge top-K', kind: 'edge', wide: [280, 110], tall: [70, 105], tip: 'Stateless. Validates and timestamps writes, fans searches out to query nodes, and merges their partial top-K.' },
      { id: 'log', label: 'Log broker (WAL)', sub: 'Kafka / Pulsar', kind: 'queue', wide: [470, 110], tall: [210, 105], tip: 'Every insert/delete is a log entry. Data nodes and query nodes subscribe. The log is the backbone.' },
      { id: 'data', label: 'Data nodes', sub: 'growing segments', kind: 'compute', wide: [660, 110], tall: [350, 105], tip: 'Consume the log, build segments, seal them at a size threshold, and flush binlogs to object storage.' },
      { id: 'index', label: 'Index nodes', sub: 'build HNSW / IVF-PQ', kind: 'compute', wide: [850, 110], tall: [350, 315], tip: 'CPU/GPU-heavy, scaled separately. Build an index for each sealed segment and write the index files back to object storage.' },
      { id: 'query', label: 'Query nodes', sub: 'segments in RAM · ANN', kind: 'compute', wide: [470, 220], tall: [70, 210], tip: 'Load sealed segments and indexes, tail the log for fresh (growing) data, and search both. Add replicas to scale QPS.' },
      { id: 'obj', label: 'Object storage', sub: 'binlogs · index files', kind: 'store', wide: [850, 220], tall: [210, 315], tip: 'Durable, cheap storage for sealed segments and indexes. A replacement query node reloads from here.' }
    ],
    edges: [
      { from: 'client', to: 'embed', bidi: true },
      { from: 'client', to: 'proxy', bidi: true },
      { from: 'proxy', to: 'log' },
      { from: 'log', to: 'data' },
      { from: 'log', to: 'query', dashed: true, label: 'tail' },
      { from: 'data', to: 'obj' },
      { from: 'obj', to: 'index', bidi: true },
      { from: 'obj', to: 'query', label: 'load' },
      { from: 'proxy', to: 'query', bidi: true },
      { from: 'coord', to: 'data', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'insert', title: 'Insert → growing → sealed + indexed', tone: 'info',
      steps: [
        { text: 'The RAG service embeds a new document chunk into a 768-d vector and upserts <code>{id, vector, tenant_id, doc_id}</code>.', flow: ['client>embed', 'embed>client', 'client>proxy'] },
        { text: 'The proxy assigns a timestamp and appends the row to a WAL <b>channel</b> chosen by hash(id). The write is acknowledged once the log has it.', flow: ['proxy>log'], badges: { log: 'ts 4471…' } },
        { text: 'Data nodes append it to a <b>growing segment</b>. Query nodes also tail the log, so it is searchable in about a second, by brute force over the small growing segment.', flow: [['log>data', 'log>query']], badges: { query: 'growing: flat scan' } },
        { text: 'At the size threshold the segment is <b>sealed</b> (immutable) and flushed to object storage as binlogs.', flow: ['data>obj'], badges: { data: 'sealed' } },
        { text: 'An index node builds <b>HNSW</b> for the sealed segment and writes the index files back. Query nodes then load it and drop the growing copy.', flow: ['obj>index', 'index>obj', 'obj>query'], badges: { index: 'HNSW built' }, tone: 'ok' }
      ]
    },
    {
      id: 'search', title: 'Search: scatter → ANN → merge', tone: 'ok',
      steps: [
        { text: 'The question is embedded with the <b>same model</b> as the documents. The proxy checks which query nodes hold which segments.', flow: ['client>embed', 'embed>client', 'client>proxy'], nodes: ['coord'] },
        { text: 'The proxy <b>fans out</b> to every query node of the collection. Each searches its sealed segments (HNSW, ef=64) plus its growing data.', flow: ['proxy>query'], badges: { query: '12 segments' } },
        { text: 'Each segment returns its local top-10. HNSW computed ~2,000 distances per segment instead of 1M, a few milliseconds.', nodes: ['query'], badges: { query: ['local top-10', 'ok'] } },
        { text: 'The proxy <b>merges</b> the partial lists into the global top-10 by score and returns ids, scores and fields. Optionally a cross-encoder <b>re-ranks</b> them.', flow: ['query>proxy', 'proxy>client'], badges: { proxy: 'merge k × n' }, tone: 'ok' }
      ]
    },
    {
      id: 'filter', title: 'Metadata filter: pre vs post', tone: 'warn',
      steps: [
        { text: 'Query: top-10 chunks <b>where tenant_id = 42</b>. Tenant 42 owns just <b>0.5%</b> of all vectors.', flow: ['client>proxy', 'proxy>query'] },
        { text: '<b>Post-filter</b>: take HNSW\'s top-40, then drop other tenants. Expected survivors: 40 × 0.5% = 0.2. The user gets <b>nothing</b>.', nodes: ['query'], err: ['query'], badges: { query: ['0 of 10', 'err'] }, tone: 'err' },
        { text: '<b>Filter during traversal</b>: walk the graph through all nodes but only collect matches. It works until the filter is very selective, then the walk wanders and recall drops.', nodes: ['query'], warn: ['query'], badges: { query: ['slow + lossy', 'warn'] }, tone: 'warn' },
        { text: '<b>Pre-filter</b>: a scalar index yields the 500K matching ids, then brute force over just those is exact and cheap. Better still, make <code>tenant_id</code> the <b>partition key</b> so the filter becomes routing.', nodes: ['query', 'coord'], ok: ['query'], badges: { query: ['10 of 10', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'scale', title: 'Hot collection: scale query nodes', tone: 'warn',
      steps: [
        { text: 'A product launch sends search QPS up 10×. Query nodes hit 100% CPU and p99 latency climbs.', flow: ['client>proxy', 'proxy>query'], warn: ['query'], badges: { query: ['CPU 100%', 'warn'] }, tone: 'warn' },
        { text: 'Because writes go through the log and data nodes, <b>reads scale independently</b>. Add query nodes and raise the <b>replica count</b> of the collection.', nodes: ['coord', 'query'], badges: { coord: 'replicas 1 → 3' } },
        { text: 'The coordinator assigns segment replicas to the new nodes, and they <b>load segments from object storage</b>, not from other nodes.', flow: ['obj>query'], nodes: ['coord'], badges: { query: 'loading…' } },
        { text: 'The proxy spreads searches across replicas. Ingest throughput was never affected.', flow: ['proxy>query', 'query>proxy'], ok: ['query'], tone: 'ok' }
      ]
    },
    {
      id: 'nodefail', title: 'Query node dies', tone: 'err',
      steps: [
        { text: 'A query node holding 12 segments crashes. Searches that fanned out to it time out.', nodes: ['query'], err: ['query'], badges: { query: ['down', 'err'] }, tone: 'err' },
        { text: 'With <b>replicas = 1</b> the proxy must either fail the search or return a <b>partial</b> top-K. With 2+ replicas it simply retries the other copy.', flow: ['proxy>query'], warn: ['proxy'], badges: { proxy: ['partial?', 'warn'] }, tone: 'warn' },
        { text: 'The coordinator reassigns the lost segments. Survivors reload them from object storage. Big HNSW indexes can take minutes to load.', flow: ['obj>query'], nodes: ['coord'], badges: { coord: 'reassign 12' } },
        { text: 'No data was lost: the log and object storage are the durable truth. Query nodes are just <b>caches with compute</b>.', nodes: ['log', 'obj'], ok: ['log', 'obj', 'query'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Model: 100M vectors × 768-d float32 (307 GB raw), top-10, a 16-node query cluster. Recall and latency curves are <em>illustrative</em> shapes, not benchmarks. Measure on your data.',
    diagram: null,
    controls: [
      { id: 'index', label: 'Index', type: 'seg', value: 'hnsw', options: [
        { v: 'flat', l: 'Flat (exact)' }, { v: 'ivf', l: 'IVF-Flat' }, { v: 'ivfpq', l: 'IVF-PQ' }, { v: 'hnsw', l: 'HNSW' }, { v: 'diskann', l: 'DiskANN' }] },
      { id: 'effort', label: 'Search effort (HNSW ef / DiskANN L; IVF nprobe = effort ÷ 4)', type: 'range', min: 8, max: 512, step: 8, value: 128 },
      { id: 'filter', label: 'Metadata filtering', type: 'seg', value: 'ingraph', options: [
        { v: 'post', l: 'Post-filter (top-40, then filter)' }, { v: 'pre', l: 'Pre-filter + brute force' }, { v: 'ingraph', l: 'Filter during traversal' }, { v: 'partition', l: 'Partition key' }] },
      { id: 'sel', label: 'Share of vectors matching the filter', type: 'range', min: 0, max: 5, step: 1, value: 2, fmt: (v) => ['0.1%', '1%', '5%', '20%', '50%', '100%'][v] }
    ],
    evaluate(s) {
      const N = 1e8, RAW = N * 768 * 4, sel = [0.001, 0.01, 0.05, 0.2, 0.5, 1][s.sel], e = s.effort, nprobe = Math.max(1, Math.round(e / 4));
      const clamp01 = (x) => Math.max(0, Math.min(1, x));
      const ix = {
        flat: { recall: 1, lat: RAW / (16 * 10e9) * 1000, ram: RAW, ssd: 0, build: ['none', 1], upd: ['trivial', 0.95], sub: 'exact scan' },
        ivf: { recall: 1 - 0.5 * Math.exp(-nprobe / 6), lat: 1 + (N * nprobe / 16384) * 3072 / (16 * 10e9) * 1000, ram: RAW + N * 8, ssd: 0, build: ['k-means: fast', 0.8], upd: ['append to list', 0.85], sub: 'nprobe ' + nprobe + ' of 16384' },
        ivfpq: { recall: 0.88 * (1 - 0.5 * Math.exp(-nprobe / 6)), lat: 0.5 + nprobe * 0.05, ram: N * (96 + 8), ssd: 0, build: ['k-means + PQ training', 0.7], upd: ['append codes', 0.85], sub: 'PQ 96 B · nprobe ' + nprobe },
        hnsw: { recall: 1 - 0.4 * Math.exp(-e / 45), lat: 1 + e * 0.04, ram: RAW + N * 2 * 16 * 4 * 1.05, ssd: 0, build: ['slow (graph inserts)', 0.4], upd: ['inserts ok; deletes = tombstones', 0.5], sub: 'M=16 · ef=' + e },
        diskann: { recall: 1 - 0.35 * Math.exp(-e / 40), lat: 1.5 + e * 0.05, ram: N * 32 + 4e9, ssd: RAW + N * 64 * 4, build: ['slow, partitioned', 0.4], upd: ['needs fresh/merge index', 0.35], sub: 'Vamana · L=' + e + ' · SSD' }
      }[s.index];
      let recall = ix.recall, lat = ix.lat, found = 10;
      if (sel < 1) {
        if (s.filter === 'post') { found = Math.min(10, 40 * sel); }
        else if (s.filter === 'pre') { recall = 1; lat = 1 + sel * N * 3072 / (16 * 10e9) * 1000; }
        else if (s.filter === 'ingraph') { if (s.index === 'hnsw' || s.index === 'diskann') { recall *= sel >= 0.05 ? 1 : sel >= 0.01 ? 0.9 : 0.6; lat *= Math.min(10, Math.sqrt(1 / Math.max(sel, 0.01))); } else { lat *= 1.2; } }
        else if (s.filter === 'partition') { lat = Math.max(0.5, lat * 0.6); }
      }
      const fmtMs = (x) => SD.fmt.dur(x);
      const metrics = [
        { k: 'Recall@10', v: (recall * 100).toFixed(1) + '%', s: clamp01((recall - 0.6) / 0.38) },
        { k: 'Query latency (p50)', v: fmtMs(lat), s: clamp01(1 - Math.log10(Math.max(1, lat)) / 2.5) },
        { k: 'RAM', v: SD.fmt.bytes(ix.ram), s: clamp01(1 - ix.ram / 4e11) },
        { k: 'SSD', v: ix.ssd ? SD.fmt.bytes(ix.ssd) : 'n/a (RAM-resident)', s: ix.ssd ? 0.75 : 0.6, hint: ix.ssd ? 'cheap per GB' : '' },
        { k: 'Filtered results (k=10)', v: sel === 1 ? '10 (no filter)' : (found >= 10 ? '10' : '≈ ' + found.toFixed(1)) + ' of 10', s: clamp01(found / 10) },
        { k: 'Index build', v: ix.build[0], s: ix.build[1] },
        { k: 'Updates & deletes', v: ix.upd[0], s: ix.upd[1] }
      ];
      const notes = [];
      if (s.index === 'flat') notes.push('Exact search reads all 307 GB per query: about 2 s even on 16 nodes. Use it for small collections (< ~1M) and to compute <b>ground truth</b> when measuring recall.');
      if (s.index === 'hnsw') notes.push('HNSW: greedy descent through sparse upper layers, then a beam search (width <b>ef</b>) on layer 0. Raising ef buys recall with latency. RAM holds full vectors + ~' + SD.fmt.bytes(N * 2 * 16 * 4 * 1.05) + ' of links.');
      if (s.index === 'ivf') notes.push('IVF: k-means into 16,384 lists, then scan only the <b>nprobe</b> nearest lists (' + nprobe + '). Cheap to build and update. Recall drops for queries near list boundaries.');
      if (s.index === 'ivfpq') notes.push('PQ compresses 3,072 B → 96 B per vector (32×), so 100M vectors fit in ~10 GB. Distances become approximate, which <b>caps recall</b>. Re-rank the top ~100 with full vectors to recover it.');
      if (s.index === 'diskann') notes.push('DiskANN keeps compressed vectors in RAM and the Vamana graph + full vectors on <b>SSD</b>. A few SSD reads per query, at a fraction of the RAM cost.');
      if (s.filter === 'post' && sel < 1) notes.push('Post-filtering keeps only ' + (sel * 100) + '% of the 40 candidates. Selective filters return <b>too few results</b> unless you over-fetch by 1/selectivity.');
      if (s.filter === 'pre' && sel < 1) notes.push('Pre-filter + brute force is <b>exact</b>. Its cost grows with the number of matching vectors (' + SD.fmt.num(sel * N) + '), so it is great for tiny selections and slow for broad ones.');
      if (s.filter === 'ingraph' && sel < 0.05) notes.push('Very selective filters break the graph\'s connectivity: most neighbours are filtered out and the walk stalls. Engines switch to brute force below some selectivity threshold.');
      if (s.filter === 'partition') notes.push('Partition (namespace) per tenant turns the filter into <b>routing</b>: only that tenant\'s segments are searched. It works only for that one field.');
      let verdict;
      if (s.filter === 'post' && sel <= 0.05) verdict = '❌ <b>Post-filtering a selective filter returns almost nothing.</b> Pre-filter, filter in-graph, or partition by the field.';
      else if (s.index === 'flat') verdict = '⚠ <b>Exact but ~2 s per query.</b> Fine for ground truth and small sets, not for 100M vectors.';
      else if (recall < 0.85) verdict = '⚠ <b>Recall is low (' + (recall * 100).toFixed(0) + '%).</b> RAG answers will miss relevant chunks. Raise effort, re-rank, or pick a different filter strategy.';
      else if (s.index === 'hnsw' && recall >= 0.95 && (s.filter === 'ingraph' || s.filter === 'partition')) verdict = '✅ <b>Common production default:</b> HNSW with ef tuned to ≥ 95% recall, filters applied during traversal, and a partition key for tenants.';
      else if (s.index === 'ivfpq') verdict = '👍 <b>Memory-cheap at scale.</b> Pair it with exact re-ranking of the top candidates to win back recall.';
      else if (s.index === 'diskann') verdict = '👍 <b>Best cost per vector</b> when the dataset outgrows RAM, if you have fast NVMe and few updates.';
      else verdict = '👍 Workable. Check recall vs latency vs memory in the meters.';
      return {
        metrics, verdict, notes,
        labels: {
          query: { label: 'Query nodes', sub: ix.sub },
          index: { label: 'Index nodes', sub: 'build ' + { flat: 'nothing (flat)', ivf: 'IVF lists', ivfpq: 'IVF-PQ codes', hnsw: 'HNSW graph', diskann: 'Vamana on SSD' }[s.index] },
          proxy: { label: 'Proxy', sub: { post: 'post-filter top-40', pre: 'bitmap pre-filter', ingraph: 'filter in traversal', partition: 'route by partition' }[s.filter] }
        },
        hide: s.index === 'diskann' ? [] : ['ssd'],
        hot: s.index === 'diskann' ? ['ssd'] : [],
        err: s.filter === 'post' && sel <= 0.05 ? ['proxy'] : [],
        warn: s.index === 'flat' || recall < 0.85 ? ['query'] : [],
        badges: { query: ['recall ' + (recall * 100).toFixed(0) + '%', recall >= 0.95 ? 'ok' : recall >= 0.85 ? 'info' : 'warn'] },
        flow: ['client>embed', 'client>proxy', 'proxy>query'].concat(s.index === 'diskann' ? ['query>ssd'] : []).concat(['query>proxy'])
      };
    }
  },

  widget: {
    title: 'HNSW greedy descent vs IVF probing (2-D)',
    caption: 'A real HNSW graph and a real k-means IVF index, built over 2-D points. <b>Tap anywhere</b> to search. HNSW: watch the greedy walk drop through the layers (big dots = higher layers), then a beam search of width <b>ef</b> on layer 0. IVF: only the <b>nprobe</b> nearest clusters are scanned. Compare distance computations and recall against brute force.'
  },

  realWorld: {
    intro: 'The core algorithms come from research papers. Production systems wrapped them in log-based, cloud-native architectures.',
    timeline: [
      { when: '2011', who: 'INRIA (Jégou, Douze, Schmid)', title: 'Product quantization + IVFADC', text: 'Split each vector into sub-vectors and quantize each one, so a vector becomes a short code of centroid ids. Distances are estimated from codes (asymmetric to the raw query). Combined with an inverted file over residuals and validated on <b>two billion</b> vectors. It is the basis of IVF-PQ in libraries such as FAISS.', src: 0 },
      { when: '2016–18', who: 'Malkov & Yashunin', title: 'HNSW', text: 'A hierarchy of proximity graphs over nested subsets, like a <b>skip list</b> for graphs. Search starts at the sparse top layer and greedily descends, giving <b>logarithmic-like scaling</b>. arXiv 2016, IEEE TPAMI 2018.', src: 1 },
      { when: '2019', who: 'Microsoft Research', title: 'DiskANN (NeurIPS)', text: 'A Vamana graph with smaller diameter, plus compressed vectors in RAM and full data on SSD. It indexes <b>1B points with 64 GB RAM</b> and serves &gt;5,000 QPS at &lt;3 ms mean latency with 95%+ 1-recall@1 on SIFT1B (16 cores).', src: 2 },
      { when: '2022', who: 'Zilliz', title: 'Manu / Milvus 2.0 (VLDB)', text: 'A cloud-native vector DB where the <b>log is the backbone</b>: WAL for incremental data, binlog for the base. Four layers (access, coordinator, worker, storage), tunable consistency, and independently scalable components.', src: 3 },
      { when: '2022', who: 'Zilliz', title: 'Anatomy of a cloud-native vector DB', text: 'Explains the write path (proxy → log → data nodes → object storage), sealed segments, and index nodes building per-segment indexes that query nodes load.', src: 4 }
    ],
    lessons: [
      '<span><b>Approximate on purpose</b>, then measure recall@k against brute force on your own queries.</span>',
      '<span>Make segments <b>immutable</b> and index them asynchronously. Fresh data is brute-forced while it is small.</span>',
      '<span><b>Filters are part of search.</b> Pick pre, in-graph or partitioning based on selectivity.</span>',
      '<span>Below ~10M vectors, <b>pgvector</b> in your existing Postgres is often enough (a rule of thumb, not a benchmark), with joins and transactions for free.</span>'
    ],
    sources: [
      { title: 'Product Quantization for Nearest Neighbor Search', url: 'https://hal.univ-grenoble-alpes.fr/inria-00514462v1', pub: 'Jégou, Douze, Schmid, IEEE TPAMI 2011' },
      { title: 'Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs', url: 'https://arxiv.org/abs/1603.09320v2', pub: 'Malkov & Yashunin, arXiv 2016 / TPAMI 2018' },
      { title: 'DiskANN: Fast Accurate Billion-point Nearest Neighbor Search on a Single Node', url: 'https://papers.nips.cc/paper/2019/hash/09853c7fb1d3f8ee67a61b6bf4a7f8e6-Abstract.html', pub: 'NeurIPS 2019' },
      { title: 'Manu: A Cloud Native Vector Database Management System', url: 'https://arxiv.org/abs/2206.13843', pub: 'PVLDB 15(12), 2022' },
      { title: 'Anatomy of A Cloud Native Vector Database Management System', url: 'https://zilliz.com/blog/anatomy-of-a-cloud-native-vector-database-management-system', pub: 'Zilliz blog' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Index', '<b>HNSW</b>: high recall, low latency, RAM-heavy', '<b>IVF-PQ</b>: 10–30× less memory, lower recall', 'HNSW while the vectors fit in RAM; IVF-PQ (+ re-rank) or DiskANN beyond that'],
      ['Memory vs disk', '<b>In-memory</b> (HNSW / IVF)', '<b>SSD-resident</b> (DiskANN)', 'DiskANN when RAM cost dominates and the data changes slowly'],
      ['Filtering', '<b>Pre-filter / partition</b>: exact, needs a scalar index', '<b>In-graph / post</b>: fast for broad filters', 'Partition by tenant; in-graph for broad filters; brute force for tiny selections'],
      ['Distance', '<b>Cosine / dot on normalized vectors</b>', '<b>L2</b>', 'Whatever the embedding model was trained with; normalize so all three rank the same'],
      ['Where', '<b>pgvector</b>: one database, SQL joins, ACID', '<b>Dedicated DB</b> (Milvus / Qdrant / Pinecone)', 'pgvector up to ~10M vectors (rule of thumb); dedicated once scale, QPS or features demand it'],
      ['Consistency', '<b>Strong</b>: wait for the log to catch up', '<b>Bounded / eventual</b>: search what is loaded', 'Bounded staleness for RAG; strong only when the user must see their own write']
    ]
  },
  failures: [
    { f: 'Recall silently drops', detect: 'Offline recall@k job vs brute force on sampled queries', fix: 'Raise ef/nprobe, rebuild indexes after heavy deletes, monitor recall as an SLO.' },
    { f: 'Selective filter returns nothing', detect: 'Result count < k; per-tenant zero-result rate', fix: 'Pre-filter or partition key; brute-force fallback below a selectivity threshold.' },
    { f: 'Deletes degrade HNSW', detect: 'Tombstone ratio per segment, recall drift', fix: 'Compaction rewrites segments without deleted rows and rebuilds their index.' },
    { f: 'Query node OOM after growth', detect: 'Memory per node vs loaded segments', fix: 'Capacity plan from the sizing formula; quantize (PQ / int8 / half) or move to DiskANN.' },
    { f: 'Embedding model changed', detect: 'Version mismatch between query and stored vectors', fix: 'Store model version per collection; re-embed into a new collection and switch with an alias.' },
    { f: 'Node loss → partial results', detect: 'Search timeouts, missing segment coverage', fix: 'Replicas ≥ 2, reload from object storage, return a partial-results flag rather than silently lying.' },
    { f: 'Slow index build blocks freshness', detect: 'Growing segment backlog', fix: 'Scale index nodes independently; growing data stays searchable by brute force.' }
  ],

  interview: [
    { q: 'Why approximate nearest neighbour instead of exact?', a: '<p>Exact top-K compares the query with every vector: 100M × 768-d is ~77 billion multiply-adds and 307 GB of memory traffic per query, seconds even on a cluster. Tree indexes stop helping in high dimensions (curse of dimensionality).</p><p>ANN indexes visit a tiny fraction of the vectors and give ~95–99% recall in milliseconds. That is fine for retrieval, which is followed by re-ranking anyway.</p>', lvl: 'core' },
    { q: 'How does HNSW search work?', a: '<p>Each vector gets a random max layer (geometric distribution), so upper layers are sparse, like a skip list. Search starts at the entry point on the top layer, <b>greedily</b> moves to the closest neighbour until no improvement, then drops a layer.</p><p>On layer 0 it runs a <b>beam search</b> keeping the <code>ef</code> best candidates. Build parameters: <code>M</code> (links per node; 2M on layer 0) and <code>efConstruction</code>.</p>', fu: 'What happens to recall as ef grows?', lvl: 'core' },
    { q: 'HNSW vs IVF-PQ: when do you pick which?', a: '<ul><li><b>HNSW</b>: best recall/latency, but needs full vectors + graph in RAM (~1.05× raw). Slow to build; deletes are awkward.</li><li><b>IVF-PQ</b>: clusters + compressed codes, 10–30× less memory, fast to build. Recall is capped by quantization error, so re-rank with full vectors.</li></ul><p>Rule of thumb: HNSW if it fits in RAM; IVF-PQ or DiskANN at billion scale.</p>', lvl: 'core' },
    { q: 'How do you measure recall?', a: '<p>Sample real queries, compute the <b>exact</b> top-k with brute force (offline, e.g. a flat index), then run the ANN index. <b>recall@k = |ANN ∩ exact| / k</b>, averaged over queries.</p><p>Track it per index config and over time. Also measure end-task quality (answer accuracy for RAG), since higher recall is not always visible to users.</p>', lvl: 'core' },
    { q: 'What goes wrong with filtered vector search?', a: '<p><b>Post-filtering</b> the top-K throws away most candidates when the filter is selective, so you return fewer than K. <b>In-graph filtering</b> loses connectivity when few nodes match, so the walk stalls and recall drops.</p><p>Fixes: pre-filter with a scalar index plus brute force for small selections, <b>partition</b> by common filters (tenant), or over-fetch by 1/selectivity.</p>', lvl: 'deep' },
    { q: 'How do updates and deletes work in an HNSW-based system?', a: '<p>Inserts can be added to a graph incrementally, but many systems make <b>segments immutable</b>: new data goes to a growing segment that is searched by brute force, then sealed and indexed.</p><p>Deletes become <b>tombstones</b> filtered at query time. Too many tombstones hurt recall and latency, so <b>compaction</b> rewrites segments and rebuilds their indexes.</p>', lvl: 'deep' },
    { q: 'Size the memory for 100M × 768-d vectors.', a: '<p>Raw float32: 100M × 768 × 4 B = <b>307 GB</b>. HNSW with M=16 adds ~32 links × 4 B ≈ 128 B per vector ≈ <b>13 GB</b>, so ~320 GB per replica. Two replicas need ~640 GB of RAM, about 10 nodes with 64 GB usable each.</p><p>Alternatives: half precision (154 GB), PQ at 96 B/vector (<b>9.6 GB</b>) + re-rank, or DiskANN (RAM for compressed vectors, the rest on SSD).</p>', lvl: 'core' },
    { q: 'pgvector or a dedicated vector database?', a: '<p><b>pgvector</b>: vectors next to relational data, SQL filters and joins, transactions, backups you already run. HNSW and IVFFlat indexes. Great up to millions to low tens of millions of vectors.</p><p><b>Dedicated</b> (Milvus, Qdrant, Pinecone): horizontal sharding, separate scaling of ingest, index and query, quantization and disk indexes, hybrid search, and multi-tenancy at scale.</p>', lvl: 'core' },
    { q: 'Cosine, dot product or L2?', a: '<p>Use what the embedding model was trained for. If vectors are <b>L2-normalized</b>, all three rank identically: ‖a−b‖² = 2 − 2·cos(a, b) and dot = cos.</p><p>Unnormalized dot product favours long vectors (sometimes intended, e.g. popularity). Normalize at write time and use dot or cosine.</p>', lvl: 'core' },
    { q: 'How do you shard and merge results?', a: '<p>Shard by id hash (even load) or by tenant/partition (filter = routing). A query fans out to every relevant shard, each returns its local top-K with scores, and the proxy merges with a heap into the global top-K.</p><p>Each shard must return K (not K/shards), and scores must be comparable (same metric and normalization).</p>', lvl: 'deep' },
    { q: 'What is hybrid search and how do you fuse results?', a: '<p>Run keyword (BM25) and vector search in parallel. Keywords catch exact terms (ids, names, rare words) and vectors catch meaning.</p><p>Fuse with <b>Reciprocal Rank Fusion</b>: score = Σ 1/(k + rank), commonly k = 60. It needs no score calibration. Then optionally re-rank the top 50 with a cross-encoder.</p>', lvl: 'deep' },
    { q: 'Explain product quantization in one minute.', a: '<p>Split a 768-d vector into m = 96 sub-vectors of 8 dims. For each sub-space, train 256 centroids with k-means. Store each sub-vector as its nearest centroid id (1 byte): <b>96 bytes per vector</b> instead of 3,072.</p><p>At query time, precompute a 96 × 256 table of distances from the query\'s sub-vectors to all centroids. Each code\'s distance is then 96 table lookups and adds (<b>asymmetric distance</b>).</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Postgres + pgvector: HNSW', lang: 'sql',
      code: `CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
  id         bigserial PRIMARY KEY,
  tenant_id  int    NOT NULL,
  doc_id     bigint NOT NULL,
  content    text   NOT NULL,
  embedding  vector(768) NOT NULL
);

-- HNSW over cosine distance (operator <=>); m / ef_construction trade build time for recall
CREATE INDEX chunks_embedding_hnsw ON chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ON chunks (tenant_id);

-- per transaction: wider beam = better recall, slower
BEGIN;
SET LOCAL hnsw.ef_search = 100;
SET LOCAL hnsw.iterative_scan = relaxed_order;   -- pgvector 0.8+: keep scanning when WHERE filters rows out

SELECT id, doc_id, content, 1 - (embedding <=> $1) AS cosine_similarity
FROM chunks
WHERE tenant_id = $2
ORDER BY embedding <=> $1
LIMIT 10;
COMMIT;`,
      note: '<code>&lt;=&gt;</code> is cosine distance, <code>&lt;-&gt;</code> L2, <code>&lt;#&gt;</code> negative inner product. The index is used only when ORDER BY uses the operator that matches its opclass.'
    },
    {
      title: 'Python RAG retrieval (psycopg 3)', lang: 'python',
      code: `# pip install "psycopg[binary]" pgvector sentence-transformers
import psycopg
from pgvector.psycopg import register_vector
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("sentence-transformers/all-mpnet-base-v2")   # 768-d

def embed(texts: list[str]):
    return model.encode(texts, normalize_embeddings=True)   # unit length: cosine == dot

conn = psycopg.connect("postgresql://app@localhost/rag", autocommit=True)
register_vector(conn)                                        # numpy array <-> vector

def ingest(tenant: int, doc_id: int, chunks: list[str]) -> None:
    vecs = embed(chunks)
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO chunks (tenant_id, doc_id, content, embedding) VALUES (%s, %s, %s, %s)",
            [(tenant, doc_id, c, v) for c, v in zip(chunks, vecs)])

def retrieve(tenant: int, question: str, k: int = 5) -> list[tuple]:
    q = embed([question])[0]
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("SET LOCAL hnsw.ef_search = 100")
        cur.execute("SET LOCAL hnsw.iterative_scan = relaxed_order")
        cur.execute(
            """SELECT doc_id, content, 1 - (embedding <=> %s) AS score
               FROM chunks WHERE tenant_id = %s
               ORDER BY embedding <=> %s LIMIT %s""",
            (q, tenant, q, k))
        return cur.fetchall()`,
      note: 'Embed queries and documents with the <b>same model and normalization</b>. Feed the retrieved chunks to the LLM with their <code>doc_id</code> for citations.'
    },
    {
      title: 'Measure recall@10 (FAISS)', lang: 'python',
      code: `# pip install faiss-cpu numpy
import faiss, numpy as np

d, n = 768, 200_000
rng = np.random.default_rng(0)
xb = rng.standard_normal((n, d), dtype=np.float32); faiss.normalize_L2(xb)
xq = rng.standard_normal((1_000, d), dtype=np.float32); faiss.normalize_L2(xq)

exact = faiss.IndexFlatIP(d)                 # brute force = ground truth
exact.add(xb)
_, gt = exact.search(xq, 10)

hnsw = faiss.IndexHNSWFlat(d, 16, faiss.METRIC_INNER_PRODUCT)   # M = 16
hnsw.hnsw.efConstruction = 64
hnsw.add(xb)

for ef in (16, 32, 64, 128, 256):
    hnsw.hnsw.efSearch = ef
    _, ids = hnsw.search(xq, 10)
    recall = np.mean([len(set(a) & set(b)) / 10 for a, b in zip(ids, gt)])
    print(f"efSearch={ef:4d}  recall@10={recall:.3f}")`,
      note: 'Random Gaussian vectors are a worst case. Run this on a sample of <b>your real embeddings and queries</b>, then pick the smallest ef that meets your recall target.'
    }
  ],

  related: ['rag-agent-platform', 'llm-inference', 'search-engine', 'recommendation', 'kv-store', 'object-storage']
});

/* knobs diagram = architecture + local NVMe used by DiskANN */
(function () {
  const d = SD.data;
  const a = d.architecture;
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes.concat([{ id: 'ssd', label: 'Local NVMe', sub: 'graph + full vectors', kind: 'store', wide: [280, 220], tall: [70, 315], tip: 'DiskANN keeps the Vamana graph and full-precision vectors on SSD; only compressed vectors live in RAM.' }]),
    edges: a.edges.concat([{ from: 'query', to: 'ssd', bidi: true }])
  };
})();
