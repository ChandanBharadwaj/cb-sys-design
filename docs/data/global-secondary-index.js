SD.register({
  slug: 'global-secondary-index',
  domain: 9,
  title: 'Global Secondary Index',
  examples: 'DynamoDB GSI, Spanner, Vitess',
  tagline: 'Query a sharded table by something other than its key. Either every shard indexes its own rows and you <b>ask every shard</b>, or the index is <b>sharded by the indexed value</b> and every write lands in two places.',
  tldr: {
    problem: 'Orders are sharded by <code>order_id</code>. "All orders of customer 42", "all PAID orders" or "is this email taken?" has no shard to go to, so the naive query asks every shard and waits for the slowest one.',
    idea: 'Build a <b>secondary index</b>. A <b>local</b> index lives next to the rows on each shard: writes stay on one shard, reads <b>scatter-gather</b>. A <b>global</b> index is partitioned by the <i>indexed value</i>: reads hit one partition, writes touch the row\'s shard <b>plus</b> one or two index partitions, kept in step by a <b>distributed transaction</b> (sync) or by <b>replaying the change log</b> (async).',
    insight: 'You choose where the fan-out goes: <b>reads</b> (local) or <b>writes</b> (global). A global index is a second copy of the data, so it inherits every replica problem: it can <b>lag</b>, hold <b>stale entries</b>, go <b>hot</b> on a popular value, and needs an <b>online backfill</b> to be born.',
    numbers: [
      { v: 'eventual', l: 'every read from a DynamoDB GSI (AWS docs)' },
      { v: '10 GB', l: 'cap per partition-key value once a DynamoDB table has a local index (AWS docs)' },
      { v: 'mins → hours', l: 'Spanner background index backfill (Google Cloud docs)' }
    ]
  },

  intro: {
    what: 'A secondary index lets you look rows up by a column that is <b>not</b> the key the data is split by. In a sharded database, rows are spread over many machines by their key, so the index itself must also be split. A <b>global secondary index</b> splits the index by the value being looked up, so one lookup goes to one place.',
    analogy: {
      icon: '📚',
      title: 'A library spread over many rooms, with a card catalogue',
      text: 'Books are shelved by ID number across 50 rooms. To find every book by one author, you can walk into all 50 rooms and check each room\'s own author list: that is a <b>local index</b>. Or you can keep one author catalogue, itself split by surname over a few rooms (A–F here, G–M there): you look in one place, but shelving a new book now means a trip to its shelf <b>and</b> a trip to the catalogue room. If the librarian updates the catalogue at the end of the day instead, the catalogue can briefly be wrong, which is exactly an <b>asynchronous</b> index.'
    },
    problem: 'A shop stores 2 billion orders across 64 database shards, split by order ID. The "My orders" page needs every order of one customer, and sign-up must reject an email that already exists. Neither question names an order ID, so neither knows which shard to ask. The core question is <b>how to find rows by a non-key column without asking every machine, and without making every write slow or wrong</b>.',
    story: [
      {
        stage: 'naive',
        title: 'Ask every shard',
        text: 'Each shard keeps an index on <code>customer_id</code> for <b>its own</b> rows. The router sends "orders of customer 42" to all shards, each answers from its local index, and the router merges the lists. Writes are simple: the row and its index entry sit on the same machine.',
        scene: {
          nodes: [
            { id: 'r', label: 'Router', sub: 'customer 42?', kind: 'edge', at: [210, 0] },
            { id: 'a', label: 'Shard 1', sub: 'local index', kind: 'store', at: [70, 110] },
            { id: 'b', label: 'Shard 2', sub: 'local index', kind: 'store', at: [210, 110] },
            { id: 'c', label: 'Shard 3', sub: 'local index', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'r', to: 'a' }, { from: 'r', to: 'b' }, { from: 'r', to: 'c' }],
          flow: [['r>a', 'r>b', 'r>c']]
        }
      },
      {
        stage: 'breaks',
        title: 'The slowest shard sets the speed',
        text: 'With 64 shards, every lookup costs 64 requests, and the answer waits for the <b>slowest</b> one. If 1 call in 100 hits a pause, a 64-shard query hits at least one pause about <b>half the time</b> (1 − 0.99<sup>64</sup> ≈ 47%). Load grows with the shard count, not with the work done.',
        scene: {
          nodes: [
            { id: 'r', label: 'Router', sub: 'waits for all 64', kind: 'edge', at: [210, 0] },
            { id: 'a', label: 'Shard 1', sub: '2 ms', kind: 'store', at: [70, 110] },
            { id: 'b', label: 'Shard 2', sub: '3 ms', kind: 'store', at: [210, 110] },
            { id: 'c', label: 'Shard 64', sub: 'GC pause', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'r', to: 'a' }, { from: 'r', to: 'b' }, { from: 'r', to: 'c' }],
          flow: [['r>a', 'r>b', 'r>c']],
          err: ['c'],
          warn: ['r'],
          badges: { c: ['45 ms', 'err'], r: ['p99 ↑', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Split the index by the value you search for',
        text: 'Keep a separate index table, partitioned by <code>hash(customer_id)</code>. A lookup goes to <b>one</b> index partition, gets the order keys (and maybe copies of a few columns), then reads only the shards that hold those orders. The price moves to writes: a new order updates its shard <b>and</b> an index partition.',
        scene: {
          nodes: [
            { id: 'r', label: 'Router', sub: 'customer 42?', kind: 'edge', at: [210, 0] },
            { id: 'ix', label: 'Index part 7', sub: 'cust 42 → 3 keys', kind: 'store', at: [350, 0] },
            { id: 'a', label: 'Shard 1', sub: 'order 18', kind: 'store', at: [70, 110] },
            { id: 'b', label: 'Shard 2', sub: 'orders 4, 31', kind: 'store', at: [210, 110] },
            { id: 'c', label: 'Shard 64', sub: 'not asked', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'r', to: 'ix' }, { from: 'r', to: 'a' }, { from: 'r', to: 'b' }],
          flow: ['r>ix', ['r>a', 'r>b']],
          ok: ['ix', 'a', 'b'],
          badges: { ix: ['1 call', 'ok'] }
        }
      }
    ],
    usedBy: ['Amazon DynamoDB (global secondary indexes)', 'Google Cloud Spanner', 'CockroachDB', 'Vitess (lookup vindexes)', 'Apache Cassandra (storage-attached indexes)', 'Elasticsearch / OpenSearch fed from a database change stream'],
    whenToUse: [
      'A frequent, <b>selective</b> query filters on a column that is not the shard key ("orders of customer X")',
      'A value must be <b>unique across all shards</b> (email, username, external payment id)',
      'Users search or filter on many fields at once: keep an <b>external search index</b> fed from the change log'
    ],
    whenNot: [
      'All data fits one Postgres primary: an ordinary B-tree index is synchronous, strongly consistent and free of fan-out',
      'The column has a handful of values (status, country) and you want <b>counts</b>: use a counter or an analytics store, not an index',
      'You need full-text ranking: that is a search engine (see <a href="search-engine.html">Search Engine</a>), fed by the pattern on this page'
    ],
    glossary: [
      { term: 'Secondary index', def: 'A lookup structure on a column other than the primary key, mapping a value to the keys of matching rows.' },
      { term: 'Local index', def: 'Each shard indexes only its own rows (document-partitioned). Writes stay local; reads must ask every shard.' },
      { term: 'Global index', def: 'The index is partitioned by the indexed value itself (term-partitioned), so a lookup goes to one partition but a write may touch several.' },
      { term: 'Scatter-gather', def: 'Send the same query to every shard in parallel, then merge the answers.' },
      { term: 'Projection / covering index', def: 'Extra columns copied into the index so a query can be answered without reading the base row.' },
      { term: 'Backfill', def: 'Filling a new index from the rows that already exist, while new writes keep arriving.' },
      { term: 'CDC (change data capture)', def: 'Reading the database\'s own change log (WAL / binlog) as a stream of row changes for other systems to consume.' },
      { term: 'LSN', def: 'Log sequence number: a row change\'s position in the write-ahead log. Later changes have larger numbers, so it works as a version.' }
    ]
  },

  requirements: {
    functional: [
      'Query by a non-key attribute (equality, and range on an index sort key)',
      'Enforce uniqueness of a non-key column across all shards',
      'Project chosen columns into the index for index-only reads',
      'Create and drop indexes online, without blocking writes',
      'Feed an external search index from the primary database',
      'Per-index choice: strongly consistent (sync) or eventually consistent (async)'
    ],
    nonFunctional: [
      'Index lookup p99 independent of the number of shards',
      'Bounded write amplification: ≤ 1 + 2 × (global indexes) partition writes per update',
      'Async index lag typically under a second (<em>estimate</em>), and alarmed',
      'No permanently stale or missing entries: the index must converge',
      'Backfill runs at low priority and never starves live traffic',
      'Losing one index partition never loses base data'
    ],
    outOfScope: ['Full-text relevance and BM25 (see Search Engine)', 'Raft, 2PC and clock internals (see Distributed SQL)', 'Partitioning and quorums of the base table (see Key-Value Store)', 'Analytical aggregations over all rows']
  },

  calculator: {
    inputs: [
      { id: 'shards', label: 'Shards (N)', min: 4, max: 1024, value: 64, log: true },
      { id: 'qps', label: 'Index queries / second', min: 100, max: 1000000, value: 20000, log: true },
      { id: 'wps', label: 'Base-table writes / second', min: 100, max: 500000, value: 10000, log: true },
      { id: 'gsi', label: 'Global indexes on the table', min: 1, max: 10, value: 3 },
      { id: 'chg', label: 'Writes that change an indexed value', min: 0, max: 100, value: 30, unit: '%' },
      { id: 'slow', label: 'Chance one shard call is slow (GC, compaction)', min: 0.1, max: 5, step: 0.1, value: 1, unit: '%' }
    ],
    outputs: [
      { label: 'Local index: shard requests / s (Q × N)', f: (v) => v.qps * v.shards },
      { label: 'Local index: queries that wait on ≥ 1 slow shard', fmt: 'pct', f: (v) => 1 - Math.pow(1 - v.slow / 100, v.shards) },
      { label: 'Global index: base-shard fetches / s (keys-only, 10 hits)', f: (v) => v.qps * v.shards * (1 - Math.pow(1 - 1 / v.shards, 10)) },
      { label: 'Global index: index-entry writes / s', f: (v) => v.wps * v.gsi * (1 + v.chg / 100) },
      { label: 'Write amplification (partition writes per base write)', fmt: 'raw', f: (v) => (1 + v.gsi * (1 + v.chg / 100)).toFixed(1) + '×' },
      { label: 'Sync index: writes that need a distributed commit', f: (v) => v.wps * (1 - Math.pow(1 / v.shards, v.gsi)) }
    ],
    note: 'Formulas: a scatter-gather is slow if <i>any</i> shard is slow, so P = 1 − (1 − p)<sup>N</sup>. Ten hits spread over N shards touch N·(1 − (1 − 1/N)<sup>10</sup>) distinct shards on average. A value change costs two index writes (remove the old entry, add the new one). The slow-call rate and the 10 hits are <em>estimates</em>. A covering (projected) index removes the base-shard fetches.'
  },

  api: [
    { m: 'SQL', p: 'CREATE INDEX orders_by_cust ON orders(customer_id) STORING (status, total)', d: 'Spanner and CockroachDB syntax (Postgres-dialect Spanner uses <code>INCLUDE</code>). Builds online: the index is maintained for new writes while a backfill fills in old rows.' },
    { m: 'RPC', p: 'Query(IndexName=by_customer, KeyCondition customer_id = :c)', d: 'DynamoDB style. Returns only projected attributes. <code>ConsistentRead=true</code> is rejected on a GSI: every GSI read is eventually consistent.' },
    { m: 'GET', p: '/v1/orders?customer_id=42&limit=50', d: 'The router picks the plan: one global-index partition, or a scatter-gather to all shards when only local indexes exist.' },
    { m: 'POST', p: '/v1/orders', d: 'Writes the row. Returns <code>{order_id, commit_lsn}</code> so the client can ask for read-your-writes later.' },
    { m: 'GET', p: '/v1/search?q=…&min_lsn=…', d: 'External search index. If the indexer has not applied <code>min_lsn</code> yet, wait briefly or answer this user from the database.' },
    { m: 'POST', p: '/admin/indexes/orders:reindex', d: 'Create <code>orders_v8</code>, backfill it, catch up from the log, verify, then swap the <code>orders</code> alias in one atomic call.' }
  ],
  dataModel: [
    { name: 'orders', store: 'Base table · sharded by hash(order_id)', fields: [['order_id', 'uuid', 'pk'], ['customer_id', 'int64'], ['status', 'enum'], ['total', 'numeric'], ['email', 'text'], ['updated_lsn', 'int64']], note: 'The source of truth. Every index on this page is derived from it and can be rebuilt from it.' },
    { name: 'orders_by_customer', store: 'Global index · partitioned by hash(customer_id)', fields: [['customer_id', 'int64', 'pk'], ['created_at', 'ts', 'sk'], ['order_id', 'uuid', 'fk'], ['status, total', 'projected'], ['src_lsn', 'int64']], note: 'Usually on a different machine from the row it points to. <code>src_lsn</code> lets an async applier ignore replayed or late events.' },
    { name: 'email_lookup', store: 'Unique lookup table (Vitess-style)', fields: [['email', 'text', 'pk'], ['user_id', 'int64'], ['keyspace_id', 'bytes']], note: 'The primary key <i>is</i> the uniqueness check. It must be written in the same commit path as the row, never asynchronously.' },
    { name: 'orders (search doc)', store: 'OpenSearch index orders_v7, alias orders', fields: [['_id', 'order_id', 'pk'], ['_version', 'source LSN (external)'], ['customer, status, items…', 'text / keyword']], note: 'A derived read model. External versioning rejects any write older than what the index already holds.' }
  ],

  architecture: {
    title: 'Secondary indexes over a sharded table',
    nodes: [
      { id: 'app', label: 'App', sub: 'reads + writes', kind: 'client', wide: [90, 70], tall: [70, 0], tip: 'Calls the router. Keeps the commit LSN of its last write if it needs read-your-writes on an async index.' },
      { id: 'router', label: 'Query router', sub: 'plan · 2PC coord', kind: 'edge', wide: [300, 70], tall: [210, 0], tip: 'Like Vitess vtgate or a Spanner/CockroachDB gateway. Picks scatter-gather vs index lookup, and coordinates the commit when a write must also update a sync global index.' },
      { id: 's0', label: 'Shard 1', sub: 'rows + local index', kind: 'store', wide: [300, 200], tall: [70, 105], tip: 'Rows placed by hash(order_id). A local index here covers only this shard\'s rows, updated in the same local transaction.' },
      { id: 's1', label: 'Shards 2…N', sub: 'hash(order_id) % N', kind: 'store', wide: [520, 200], tall: [210, 105], tip: 'The rest of the base table. A scatter-gather query visits all of them.' },
      { id: 'gidx', label: 'Global index', sub: 'partitioned by value', kind: 'store', wide: [700, 70], tall: [350, 105], tip: 'Its own partitions, keyed by hash(indexed value). One lookup = one partition. Holds keys, plus projected columns if covering.' },
      { id: 'cdc', label: 'Change log', sub: 'WAL / CDC · LSN', kind: 'queue', wide: [410, 330], tall: [70, 210], tip: 'Every shard\'s committed changes in order, with before and after images and a log position (LSN). Kafka or the DB\'s own replication stream.' },
      { id: 'applier', label: 'Index applier', sub: 'async · versioned', kind: 'compute', wide: [700, 330], tall: [350, 210], tip: 'Consumes the log. For a value change it removes the old entry and adds the new one, each guarded by "only if my LSN is newer".' },
      { id: 'search', label: 'Search index', sub: 'OpenSearch · ext ver', kind: 'external', wide: [910, 330], tall: [350, 315], tip: 'A derived read model for full-text and multi-field filters. Written with version_type=external = source LSN; queried through an alias.' },
      { id: 'backfill', label: 'Backfill job', sub: 'snapshot chunks', kind: 'compute', wide: [410, 450], tall: [70, 315], tip: 'Reads existing rows in chunks at low priority and feeds them through the same versioned path, so a live write is never overwritten by an older snapshot row.' }
    ],
    edges: [
      { from: 'app', to: 'router', bidi: true },
      { from: 'router', to: 's0' },
      { from: 'router', to: 's1' },
      { from: 'router', to: 'gidx', label: '1 partition' },
      { from: 's0', to: 'cdc' },
      { from: 's1', to: 'cdc' },
      { from: 'cdc', to: 'applier' },
      { from: 'applier', to: 'gidx' },
      { from: 'applier', to: 'search' },
      { from: 'backfill', to: 'cdc' }
    ]
  },

  scenarios: [
    {
      id: 'scatter', title: 'Local index: scatter-gather', tone: 'warn',
      steps: [
        { text: 'The app asks for the orders of customer 42. Orders are placed by <code>hash(order_id)</code>, so customer 42\'s orders can sit on <b>any</b> shard.', flow: ['app>router'], badges: { router: 'which shard?' } },
        { text: 'The router sends the query to <b>every</b> shard. Each one answers from its <b>local index</b>, which covers only its own rows.', flow: [['router>s0', 'router>s1']], badges: { s0: '2 hits', s1: '1 hit · 63 shards' } },
        { text: 'The router must wait for the <b>slowest</b> shard. With a 1% chance of a slow call per shard, a 64-shard query hits one about 47% of the time, so the fan-out sets the p99.', nodes: ['s1'], warn: ['s1', 'router'], badges: { s1: ['GC pause 45 ms', 'warn'] }, tone: 'warn' },
        { text: 'Merge, sort, apply the limit, answer. The upside: the write path stayed simple. A new order wrote its row and index entry in <b>one local transaction</b>.', flow: ['router>app'], badges: { app: '3 orders' } },
        { text: 'Mitigations inside this design: <b>hedge</b> slow shard calls to a replica, set a deadline and return partial results, or co-locate by choosing a shard key that includes the customer.', nodes: ['router'], ok: ['router'], badges: { router: ['hedge + deadline', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'global', title: 'Global index: read one, write two', tone: 'ok',
      steps: [
        { text: 'Same question with a global index. The router hashes <code>customer_id = 42</code> to <b>one</b> index partition and gets back three order keys.', flow: ['app>router', 'router>gidx'], badges: { gidx: 'cust 42 → 3 keys' } },
        { text: 'A <b>keys-only</b> index then reads the rows from the shards that hold them (here 2 of 64). With a projection (<code>STORING</code> / <code>INCLUDE</code>) this second hop is skipped.', flow: [['router>s0', 'router>s1']], badges: { s0: 'order 18', s1: 'orders 4, 31' }, tone: 'ok' },
        { text: 'Now a write: a new order for customer 42. The row goes to <code>hash(order_id)</code>, the index entry to <code>hash(42)</code>. These are usually <b>different machines</b>.', flow: ['app>router', ['router>s1', 'router>gidx']], badges: { s1: '+row', gidx: '+entry' } },
        { text: '<b>Sync</b> (Spanner, CockroachDB): both writes are one transaction, so the router runs a <b>two-phase commit</b>. The index is never stale, but every write waits for the slower participant plus an extra round.', nodes: ['router', 's1', 'gidx'], badges: { router: ['2PC', 'warn'], gidx: 'prepared' }, tone: 'warn' },
        { text: 'Both commit or neither does. Reads of the index are as consistent as reads of the table, and a <b>unique</b> index can reject a duplicate inside the same transaction.', nodes: ['s1', 'gidx'], ok: ['s1', 'gidx'], badges: { gidx: ['committed', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'async', title: 'Async index: lag and a stale read', tone: 'warn',
      steps: [
        { text: 'Order 7 moves from <b>PAID</b> to <b>SHIPPED</b>. The shard commits and acknowledges at once. Only <b>one partition</b> is on the write path, which is how DynamoDB GSIs work.', flow: ['app>router', 'router>s0'], badges: { s0: 'SHIPPED · LSN 812' } },
        { text: 'The change reaches the log with before and after images. The applier turns it into <b>two</b> index operations: remove (PAID, 7) on one partition, add (SHIPPED, 7) on another.', flow: ['s0>cdc', 'cdc>applier'], badges: { applier: 'lag 400 ms' } },
        { text: 'Meanwhile a query for <code>status = PAID</code> reads the index and still finds order 7. This is the <b>stale read window</b>.', flow: ['router>gidx'], warn: ['gidx'], badges: { gidx: ['#7 still PAID', 'warn'] }, tone: 'warn' },
        { text: 'The reader defends itself: it fetches the row anyway and <b>re-checks the predicate</b> against the base row, dropping order 7. Missing <i>new</i> entries cannot be caught this way; only waiting fixes those.', flow: ['router>s0'], badges: { router: 'drop #7' } },
        { text: 'The applier writes with a <b>version guard</b>: each entry stores the LSN that wrote it, and an older event never overwrites a newer one. Replays and reordering become harmless.', flow: ['applier>gidx'], ok: ['gidx'], badges: { gidx: ['LSN 812 ✓', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'hot', title: 'Hot index key throttles the table', tone: 'err',
      steps: [
        { text: 'An index on <code>status</code>. Base writes are spread evenly by <code>order_id</code>, but every new order adds an entry under <b>PENDING</b>, and that value hashes to <b>one</b> index partition.', flow: [['s0>cdc', 's1>cdc'], 'cdc>applier', 'applier>gidx'], warn: ['gidx'], badges: { gidx: ['PENDING: 1 partition', 'warn'] }, tone: 'warn' },
        { text: 'That partition hits its write limit. In DynamoDB, a GSI that cannot keep up <b>throttles writes to the base table</b> (back pressure), even when the table has spare capacity.', flow: ['app>router', 'router>s0'], err: ['gidx', 's0'], badges: { s0: ['writes throttled', 'err'], gidx: ['over capacity', 'err'] }, tone: 'err' },
        { text: '<b>Write sharding:</b> index on <code>status#(hash(order_id) % 8)</code>. Writes now spread over 8 keys; a read asks all 8 and merges them. You trade one read for eight.', nodes: ['gidx'], ok: ['gidx'], labels: { gidx: { label: 'Global index', sub: 'PENDING#0 … #7' } }, badges: { gidx: ['spread ×8', 'ok'] }, tone: 'ok' },
        { text: 'Better still, ask whether you need it: a <b>sparse index</b> holds only rows that carry the attribute (e.g. <code>needs_review</code>), and "how many PENDING?" is a counter, not an index scan. Give a GSI at least the base table\'s write capacity.', nodes: ['gidx'], ok: ['gidx', 's0'], tone: 'ok' }
      ]
    },
    {
      id: 'backfill', title: 'Online index build and reindex', tone: 'info',
      steps: [
        { text: '<code>CREATE INDEX</code> on a live table. The new index starts <b>write-only</b>: every new write maintains it, but no query may read it yet (the F1 schema-change states).', flow: ['app>router', 'router>s0', 's0>cdc', 'cdc>applier', 'applier>gidx'], labels: { gidx: { label: 'Global index', sub: 'WRITE-ONLY' } } },
        { text: 'The <b>backfill</b> reads existing rows in chunks at low priority and pushes them through the <b>same versioned path</b>. A snapshot row older than a live write loses the version check, so it cannot undo it.', flow: ['backfill>cdc', 'cdc>applier', 'applier>gidx'], badges: { backfill: 'chunk 41 / 300' }, labels: { gidx: { label: 'Global index', sub: 'WRITE-ONLY' } } },
        { text: 'When the backfill reaches the end and lag is near zero, verify (row counts per range, sampled checks against the table), then mark the index <b>readable</b>. The planner may now use it.', nodes: ['gidx'], ok: ['gidx'], labels: { gidx: { label: 'Global index', sub: 'PUBLIC' } }, badges: { gidx: ['readable', 'ok'] }, tone: 'ok' },
        { text: 'For a search mapping change: build <code>orders_v8</code> next to <code>v7</code> from a snapshot plus the log, then move the <code>orders</code> alias in <b>one atomic</b> <code>_aliases</code> call. Rollback is swapping it back.', flow: ['applier>search'], ok: ['search'], labels: { search: { label: 'Search index', sub: 'alias → orders_v8' } }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose the index type, the column, the projection and the shard count. Latencies come from a Monte Carlo of 1,500 queries using an <em>illustrative</em> per-partition latency (median 2 ms, plus a 0.2% chance of a ~40 ms pause), so the p99 really is a max over the partitions each query touches.',
    controls: [
      { id: 'idx', label: 'Index type', type: 'seg', value: 'gasync', options: [
        { v: 'none', l: 'None (scan)' }, { v: 'local', l: 'Local per shard' }, { v: 'gsync', l: 'Global · sync' }, { v: 'gasync', l: 'Global · async' }] },
      { id: 'key', label: 'Indexed column', type: 'seg', value: 'customer', options: [
        { v: 'customer', l: 'customer_id' }, { v: 'status', l: 'status (5 values)' }, { v: 'email', l: 'email (unique)' }] },
      { id: 'proj', label: 'Projection', type: 'seg', value: 'keys', options: [
        { v: 'keys', l: 'Keys only' }, { v: 'cover', l: 'Covering' }] },
      { id: 'salt', label: 'Index key sharding', type: 'seg', value: 'off', options: [
        { v: 'off', l: 'Plain key' }, { v: 'on', l: 'key#suffix ×8' }] },
      { id: 'shards', label: 'Shards (N)', type: 'range', min: 4, max: 256, step: 4, value: 64 }
    ],
    evaluate(s) {
      const N = s.shards, global = s.idx === 'gsync' || s.idx === 'gasync';
      // seeded PRNG so the meters do not jitter between renders
      let seed = 12345;
      const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
      const one = (scale) => (rnd() < 0.002 ? 40 * Math.exp(0.3 * gauss()) : 2 * scale * Math.exp(0.5 * gauss()));
      function p99(rounds) { // each round waits for the max of k parallel partition calls
        const T = 1500, xs = new Float64Array(T);
        for (let i = 0; i < T; i++) {
          let tot = 0;
          for (const r of rounds) { let m = 0; for (let j = 0; j < r.k; j++) { const x = one(r.scale || 1); if (x > m) m = x; } tot += m + (r.add || 0); }
          xs[i] = tot;
        }
        xs.sort(); return xs[Math.floor(T * 0.99)];
      }
      const ms = (x) => (x < 10 ? x.toFixed(1) : Math.round(x)) + ' ms';
      const m = { customer: 10, status: 100, email: 1 }[s.key];           // hits per query (status: one page)
      const distinct = (k) => Math.max(1, Math.round(N * (1 - Math.pow(1 - 1 / N, k))));
      const idxParts = s.salt === 'on' ? Math.min(8, N) : 1;
      let readRounds, partsQ;
      if (s.idx === 'none') { readRounds = [{ k: N, scale: 15 }]; partsQ = N; }
      else if (s.idx === 'local') { readRounds = [{ k: N, add: s.proj === 'keys' ? 0.5 : 0 }]; partsQ = N; }
      else {
        readRounds = [{ k: idxParts }];
        if (s.proj === 'keys') readRounds.push({ k: distinct(m) });
        partsQ = idxParts + (s.proj === 'keys' ? distinct(m) : 0);
      }
      const qp99 = p99(readRounds);
      const idxWrites = s.key === 'status' ? 2 : 1;                        // a status change removes one entry and adds another
      const partsW = global ? 1 + idxWrites : 1;
      const wp99 = s.idx === 'gsync' ? p99([{ k: partsW }, { k: partsW }]) : p99([{ k: 1, add: s.idx === 'local' ? 0.3 : 0 }]);
      // hottest index partition: order lifecycle PENDING→PAID→SHIPPED→DELIVERED = 7 index writes, 2 of them on PENDING
      const hot = s.key === 'status' ? (2 / 7) / idxParts : 1 / N;
      const hotRatio = hot * N;
      const uniqueOK = s.idx === 'gsync' && s.salt === 'off';
      const metrics = [
        { k: 'Partitions per query', v: partsQ + (s.idx === 'none' ? ' (full scans)' : ''), s: Math.max(0.05, Math.min(1, 3 / partsQ)), hint: global ? idxParts + ' index + ' + (partsQ - idxParts) + ' base' : 'every shard' },
        { k: 'Query p99', v: ms(qp99), s: Math.max(0.05, Math.min(1, 8 / qp99)), hint: '1,500 simulated queries' },
        { k: 'Partitions per write', v: String(partsW), hint: s.idx === 'gasync' ? '1 on the write path' : s.idx === 'gsync' ? 'all in one commit' : 'same shard', s: s.idx === 'gsync' ? (partsW > 2 ? 0.35 : 0.5) : s.idx === 'gasync' ? 0.75 : 0.95 },
        { k: 'Write p99', v: ms(wp99) + (s.idx === 'gsync' ? ' (2PC)' : ''), s: Math.max(0.05, Math.min(1, 8 / wp99)) },
        { k: 'Index freshness', v: s.idx === 'gasync' ? 'eventual' : s.idx === 'none' ? 'n/a' : 'strong', hint: s.idx === 'gasync' ? 'lag: ms to seconds' : s.idx === 'none' ? 'reads the table' : 'same transaction', s: s.idx === 'gasync' ? 0.45 : 0.95 },
        { k: 'Hottest index partition', v: !global ? 'none' : (hot * 100).toFixed(hot < 0.1 ? 1 : 0) + '% of writes', s: !global ? 0.9 : Math.max(0.05, Math.min(1, 2 / hotRatio)), hint: global ? 'fair share ' + (100 / N).toFixed(1) + '%' : 'follows the rows' },
        { k: 'Unique constraint', v: uniqueOK ? 'enforceable in the txn' : s.idx === 'gsync' ? 'no: suffix splits the key' : s.idx === 'gasync' ? 'no: index lags' : s.idx === 'local' ? 'no: needs every shard, racy' : 'no', s: uniqueOK ? 0.95 : 0.15 }
      ];
      const notes = [];
      if (s.idx === 'local') notes.push('Each shard answers from its own index, so a query costs <b>' + N + ' calls</b> and waits for the slowest. Doubling the shards doubles query load without adding any answers.');
      if (s.idx === 'none') notes.push('No index: every shard scans its rows. Fine for a nightly batch job, never for a page a user waits on.');
      if (s.idx === 'gsync') notes.push('Spanner and CockroachDB update secondary indexes in the writing transaction. When the entry lives in another range or split, that is a <b>distributed commit</b>; Spanner\'s interleaved indexes avoid it by keeping index rows next to their parent row.');
      if (s.idx === 'gasync') notes.push('DynamoDB GSIs are updated asynchronously and only support eventually consistent reads. If a GSI lacks write capacity, <b>writes to the base table are throttled</b>.');
      if (global && s.proj === 'keys') notes.push('Keys-only: after the index lookup, the router fetches the rows from ' + distinct(m) + ' shard(s). Projecting the columns the page shows makes it one round.');
      if (global && s.proj === 'cover') notes.push('Covering: the answer comes from the index alone. Each projected column is copied, so it costs storage and an index write whenever it changes.');
      if (s.idx === 'local' && s.proj === 'cover') notes.push('On a local index a covering index only saves the row lookup on the same machine (an index-only scan); it does not reduce fan-out.');
      if (global && s.key === 'status' && s.salt === 'off') notes.push('Five values cannot spread over ' + N + ' partitions: the busiest gets about ' + Math.round(hot * 100) + '% of index writes.');
      if (s.salt === 'on') notes.push(global ? 'The suffix spreads one value over 8 keys; every read now asks all 8.' + (s.key === 'email' ? ' For a <b>unique</b> column it breaks the check: two rows with the same email can land on different suffixes.' : '') : 'Key sharding only applies to a global index; a local index already follows the rows.');
      let verdict;
      if (s.idx === 'none') verdict = '❌ <b>Every query scans every shard.</b> Add an index.';
      else if (s.key === 'email' && !uniqueOK) verdict = '❌ <b>This cannot enforce a unique email.</b> Use a sync global index (or a Vitess-style consistent lookup) with a plain key.';
      else if (global && s.key === 'status' && s.salt === 'off') verdict = '⚠ <b>Hot index partition.</b> A low-cardinality key funnels writes to one partition. Add a suffix, use a sparse index, or keep counters instead.';
      else if (s.idx === 'local' && N >= 32) verdict = '⚠ <b>Scatter-gather to ' + N + ' shards.</b> p99 is set by the slowest shard. Fine for rare queries, costly for a hot path.';
      else if (s.idx === 'local') verdict = '👍 <b>Local index is fine at this fan-out.</b> Cheap writes, strongly consistent, and a few shards keep the tail small.';
      else if (s.salt === 'on' && s.key !== 'status') verdict = '👍 Works, but the suffix only costs you here: ' + idxParts + ' index reads per query for a key that was never hot.';
      else if (s.idx === 'gsync') verdict = '✅ <b>Spanner / CockroachDB style.</b> One-partition, strongly consistent reads, paid for with a distributed commit on writes.';
      else verdict = '✅ <b>DynamoDB GSI style.</b> Cheap writes and one-partition reads. Design for lag: re-check rows, and never use it for uniqueness.';
      const flow = ['app>router'].concat(global ? ['router>gidx'].concat(s.proj === 'keys' ? [['router>s0', 'router>s1']] : []) : [['router>s0', 'router>s1']]);
      if (s.idx === 'gasync') flow.push('s0>cdc', 'cdc>applier', 'applier>gidx');
      return {
        metrics, verdict, notes, flow,
        hide: global ? (s.idx === 'gsync' ? ['applier'] : []) : ['gidx', 'applier'],
        labels: {
          gidx: { label: 'Idx: ' + { customer: 'customer_id', status: 'status', email: 'email' }[s.key], sub: s.salt === 'on' ? 'value#0…7' : s.idx === 'gsync' ? 'sync · same txn' : 'async · from log' },
          s0: { label: 'Shard 1', sub: s.idx === 'local' ? 'rows + local index' : 'rows' },
          router: { label: 'Query router', sub: s.idx === 'gsync' ? '2PC coordinator' : global ? '1 index partition' : 'scatter to ' + N }
        },
        warn: s.idx === 'local' && N >= 32 ? ['router'] : [],
        err: global && s.key === 'status' && s.salt === 'off' ? ['gidx'] : s.idx === 'none' ? ['s0', 's1'] : [],
        badges: global ? { gidx: [(hot * 100).toFixed(hot < 0.1 ? 1 : 0) + '% writes', hotRatio > 4 ? 'err' : 'info'] } : { router: [partsQ + ' calls', N >= 32 ? 'warn' : 'info'] }
      };
    }
  },

  widget: {
    title: 'A sharded orders table with a real index',
    caption: 'Rows sit on <code>hash(order_id) % N</code>; a global index entry sits on <code>hash(value) % N</code>. Pick an index type, then <b>Query</b>, <b>Update 1 order</b> or <b>Add 24 orders</b>. Lit boxes are the partitions each operation touched, bars count writes. In <b>Global · async</b>, update an order and query its old status at once to see a stale entry caught by the row re-check. Query by <b>status</b> after adding orders to see the hot partition, then turn on the suffix.'
  },

  realWorld: {
    intro: 'Every big sharded store has made this choice, and most offer both kinds of index. The history is mostly about making the global kind safe to build and safe to read.',
    timeline: [
      { when: '2013', who: 'Google F1', title: 'Online schema change with intermediate states', text: 'F1 (on Spanner) adds an index without downtime by moving it through <b>delete-only</b> and <b>write-only</b> states before it becomes readable, with servers at most one schema version apart. This is the backfill-then-publish recipe used since.', src: 0 },
      { when: '2013', who: 'Amazon', title: 'DynamoDB launches global secondary indexes', text: 'GSIs are partitioned by their own key, are <b>eventually consistent</b>, and return only <b>projected</b> attributes. Local secondary indexes, by contrast, share the table\'s partition key.', src: 1 },
      { when: 'docs', who: 'Amazon', title: 'GSI back pressure and the 10 GB local limit', text: 'GSI reads cannot be strongly consistent. A GSI short of write capacity <b>throttles writes to the base table</b>; AWS advises giving each GSI at least the table\'s write capacity. With a local index, data per partition-key value is capped at <b>10 GB</b>.', src: 2 },
      { when: 'docs', who: 'Amazon', title: 'Write sharding and sparse indexes', text: 'For hot keys, append a random or calculated suffix and merge on read. GSIs are <b>sparse</b>: only items that carry the index key appear, so a GSI over a rare flag stays small and cheap.', src: 5 },
      { when: 'docs', who: 'Google Cloud', title: 'Spanner: global vs interleaved indexes', text: 'Secondary indexes are strongly consistent. A plain index is its own table split independently; an <b>interleaved</b> index sits with its parent row, so updates stay local instead of crossing splits. Adding an index backfills in the background and can take <b>minutes to many hours</b>. <code>STORING</code> makes it covering.', src: 7 },
      { when: 'docs', who: 'Cockroach Labs', title: 'STORING and hash-sharded indexes', text: 'A <code>STORING</code> column turns an index into a <b>covering</b> index and removes the index join. Sequential index keys create a hot range, so CockroachDB adds <b>hash-sharded indexes</b> with a hidden shard column, which is write sharding built in.', src: 10 },
      { when: '2017', who: 'Apache Cassandra', title: 'Materialized views marked experimental', text: 'The project reclassified MVs as <b>experimental and not recommended for new production use</b> (CASSANDRA-13959), because view and base table can silently drift apart.', src: 13 },
      { when: '2018', who: 'Airbnb', title: 'SpinalTap change data capture', text: 'A general CDC service that turns MySQL binlogs into standardized change events for downstream consumers such as search and caches, instead of each service dual-writing.', src: 18 },
      { when: '2019', who: 'Netflix', title: 'Delta: sync and enrich from the log', text: 'Delta reads change events from a store\'s transaction log and dumps, enriches them by calling other services, and writes the result to other stores; search indexing is a named use case. Netflix chose it over dual writes, log tables and distributed transactions.', src: 19 },
      { when: '2020', who: 'Netflix', title: 'DBLog: full-state backfill without locks', text: 'DBLog interleaves <b>chunked table selects</b> with live log events using low and high <b>watermarks</b>, so a backfill and the change stream can run at once, with no table locks.', src: 20 },
      { when: '2020', who: 'Slack', title: 'Vitess with lookup tables', text: 'Slack moved to Vitess, which by 2020 served <b>99% of its query load</b>. Before Vitess, Slack already kept a metadata cluster as a <b>lookup table</b> from workspace to shard. Vitess generalizes this as <b>lookup vindexes</b>.', src: 15 },
      { when: 'docs', who: 'Vitess', title: 'Consistent lookup vindexes', text: 'A lookup vindex maps a column value to a keyspace id so a query goes to one shard instead of all. <code>consistent_lookup_unique</code> <b>orders the commits</b> so a partial failure cannot leave an inconsistent entry, avoiding 2PC. Adding one to a populated table needs a backfill (<code>CreateLookupVindex</code>).', src: 14 },
      { when: '5.0', who: 'Apache Cassandra', title: 'Storage-attached indexes (CEP-7)', text: 'SAI attaches index segments to each SSTable and is the recommended index in Cassandra 5.0, with legacy 2i and SASI planned for removal. It is still a <b>local</b> index: a query without the partition key asks many nodes.', src: 17 }
    ],
    lessons: [
      'Decide per query: <b>local</b> for rare or partition-scoped queries, <b>global</b> for hot, selective lookups.',
      'An async index is a replica. <b>Version every entry</b> by the source log position and <b>re-check rows</b> on read.',
      'Uniqueness needs a <b>synchronous</b> global index or lookup table, never an eventually consistent one.',
      'Build indexes as <b>write-only → backfill → verify → readable</b>, and swap derived search indexes with an <b>alias</b>.'
    ],
    sources: [
      { title: 'Online, Asynchronous Schema Change in F1', url: 'https://research.google/pubs/online-asynchronous-schema-change-in-f1/', pub: 'Google Research, VLDB 2013' },
      { title: 'Now Available: Global Secondary Indexes for Amazon DynamoDB', url: 'https://aws.amazon.com/blogs/aws/now-available-global-secondary-indexes-for-amazon-dynamodb', pub: 'AWS News Blog, 2013' },
      { title: 'Understanding GSI write throttling and back pressure', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/gsi-throttling.html', pub: 'Amazon DynamoDB Developer Guide' },
      { title: 'DynamoDB read consistency', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html', pub: 'Amazon DynamoDB Developer Guide' },
      { title: 'How does throttling on my GSI affect my DynamoDB table?', url: 'https://repost.aws/knowledge-center/dynamodb-gsi-throttling-table', pub: 'AWS Knowledge Center' },
      { title: 'Using write sharding to distribute workloads evenly', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-sharding.html', pub: 'Amazon DynamoDB Developer Guide' },
      { title: 'General guidelines for secondary indexes (10 GB item collections)', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-indexes-general.html', pub: 'Amazon DynamoDB Developer Guide' },
      { title: 'Spanner: Secondary indexes', url: 'https://cloud.google.com/spanner/docs/secondary-indexes', pub: 'Google Cloud docs' },
      { title: 'Spanner for non-relational workloads', url: 'https://cloud.google.com/spanner/docs/non-relational/overview', pub: 'Google Cloud docs' },
      { title: 'Optimizing schema design for Spanner', url: 'https://cloud.google.com/spanner/docs/whitepapers/optimizing-schema-design', pub: 'Google Cloud whitepaper' },
      { title: 'CockroachDB: Indexes (STORING / covering)', url: 'https://cockroachlabs.com/docs/v24.1/indexes', pub: 'Cockroach Labs docs' },
      { title: 'Index sequential keys with hash-sharded indexes', url: 'https://www.cockroachlabs.com/docs/stable/hash-sharded-indexes', pub: 'Cockroach Labs docs' },
      { title: 'Take advantage of sparse indexes', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-indexes-general-sparse-indexes.html', pub: 'Amazon DynamoDB Developer Guide' },
      { title: 'Materialized views reclassified as experimental (CASSANDRA-13959)', url: 'https://www.mail-archive.com/user@cassandra.apache.org/msg54073.html', pub: 'Cassandra user mailing list, 2017' },
      { title: 'Unique Lookup Vindexes', url: 'https://vitess.io/docs/user-guides/vschema-guide/unique-lookup/', pub: 'Vitess docs' },
      { title: 'Scaling Datastores at Slack with Vitess', url: 'https://slack.engineering/scaling-datastores-at-slack-with-vitess/', pub: 'Slack Engineering, 2020' },
      { title: 'Storage-Attached Indexing (SAI) overview', url: 'https://cassandra.apache.org/doc/latest/cassandra/developing/cql/indexing/sai/sai-overview.html', pub: 'Apache Cassandra docs' },
      { title: 'CEP-7: Storage Attached Index', url: 'https://cwiki.apache.org/confluence/display/CASSANDRA/CEP-7%3A+Storage+Attached+Index', pub: 'Apache Cassandra wiki' },
      { title: 'Capturing Data Evolution in a Service-Oriented Architecture (SpinalTap)', url: 'https://medium.com/airbnb-engineering/capturing-data-evolution-in-a-service-oriented-architecture-72f7c643ee6f', pub: 'Airbnb Engineering, 2018' },
      { title: 'Netflix Delta: data synchronization and enrichment platform', url: 'https://www.infoq.com/news/2019/11/data-synchronization-netflix', pub: 'InfoQ, 2019 (summary of the Netflix TechBlog post)' },
      { title: 'DBLog: A Watermark Based Change-Data-Capture Framework', url: 'https://arxiv.org/abs/2010.12597', pub: 'Netflix, arXiv 2020' },
      { title: 'Elasticsearch Index API (version_type=external)', url: 'https://www.elastic.co/guide/en/elasticsearch/reference/8.3/docs-index_.html', pub: 'Elastic docs' },
      { title: 'Elasticsearch aliases (atomic swap, reindex without downtime)', url: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/aliases.html', pub: 'Elastic docs' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Index partitioning', '<b>Local</b> (by row key): writes on one shard, reads ask every shard', '<b>Global</b> (by value): reads ask one partition, writes touch 2–3', 'Local when the query is rare or already names the partition key; global for hot, selective lookups'],
      ['Maintenance', '<b>Sync</b>: same transaction, 2PC across partitions', '<b>Async</b>: from the change log, eventually consistent', 'Sync for uniqueness and read-after-write; async when write latency and availability matter more'],
      ['Projection', '<b>Keys only</b>: small index, second hop to the rows', '<b>Covering</b> (STORING / INCLUDE / ALL): one hop, more bytes and writes', 'Cover the few columns the hot query returns; keys-only for rare queries'],
      ['Hot index key', '<b>Plain key</b>: one read, one hot partition', '<b>key#suffix</b>: spread writes, merge N reads', 'Suffix only when a value is truly hot; prefer a sparse index or a counter for status-like columns'],
      ['Search', '<b>Database index</b>: consistent, limited queries', '<b>External search index</b> from CDC: rich queries, lag', 'Search engine for full text and many-field filters; keep the DB as the source of truth'],
      ['Cassandra', '<b>SAI / 2i</b>: local, any column, fan-out reads', '<b>Denormalized query table</b> written by the app', 'SAI with the partition key in the query; a hand-built table for hot global lookups (avoid MVs)']
    ]
  },
  failures: [
    { f: 'Stale index entry (async)', detect: 'Rows returned by the index fail the predicate on re-check; reconcile job counts mismatches', fix: 'Always re-check against the base row, drop mismatches, enqueue a repair. Alarm on applier lag.' },
    { f: 'Old event overwrites a newer entry', detect: 'Index value differs from the row even though lag is zero', fix: 'Store the source LSN on every entry and apply only if newer; keep tombstones for deletes long enough to outlast reordering.' },
    { f: 'Hot index partition throttles the table', detect: 'Throttle metrics name the index (DynamoDB: <code>IndexWrite<wbr>Provisioned<wbr>Throughput<wbr>Exceeded</code>); one partition at its limit', fix: 'Give the index ≥ the table\'s write capacity, shard the key with a suffix, or make the index sparse.' },
    { f: 'Duplicate "unique" values', detect: 'Two rows share an email; nightly uniqueness audit', fix: 'Enforce uniqueness only in a synchronous global index or lookup table written before the row commits.' },
    { f: 'Scatter-gather tail latency', detect: 'Query p99 grows with shard count while per-shard p99 is flat', fix: 'Move hot queries to a global index; hedge to replicas; deadlines with partial results.' },
    { f: 'Backfill hurts live traffic', detect: 'Base-table latency rises during CREATE INDEX', fix: 'Chunked, rate-limited backfill at low priority; pause and resume from the last chunk.' },
    { f: 'Search index drifted after a bad deploy', detect: 'Count or checksum per id range differs from the DB', fix: 'Rebuild into a new index from a snapshot plus the log, verify, then swap the alias.' }
  ],

  interview: [
    { q: 'Local vs global secondary index: what is the difference?', a: '<p>A <b>local</b> (document-partitioned) index lives on each shard and covers only that shard\'s rows. A write updates the row and its index entry in one local transaction. A read by the indexed column must ask <b>every</b> shard and merge.</p><p>A <b>global</b> (term-partitioned) index is partitioned by the indexed value. A read goes to <b>one</b> partition. A write touches the row\'s shard plus one index partition, or two when the value changes (remove old, add new).</p>', fu: 'Which one does DynamoDB call "local"? (LSI: same partition key as the table, different sort key.)', lvl: 'core' },
    { q: 'Why does scatter-gather get slower as you add shards?', a: '<p>The query waits for the <b>maximum</b> of N shard latencies. If one call in 100 is slow, a query is slow with probability <code>1 − 0.99^N</code>: about 10% at N = 10 and 63% at N = 100. So the query p99 approaches the per-shard p99.9 or worse.</p><p>Load also grows: every query costs N requests, so adding shards adds query work without adding answers.</p>', fu: 'How do you cut the tail without a global index? (Hedged requests to replicas, deadlines with partial results.)', lvl: 'core' },
    { q: 'Sync or async maintenance for a global index?', a: '<ul><li><b>Sync</b> (Spanner, CockroachDB): the index write is part of the transaction. Reads are strongly consistent and unique constraints work, but the write needs a distributed commit across partitions, adding a round trip and coupling availability.</li><li><b>Async</b> (DynamoDB GSIs, CDC-fed indexes): the base write commits alone and the index catches up from the log. Writes are fast and independent, but reads can be stale and uniqueness cannot be enforced.</li></ul>', lvl: 'core' },
    { q: 'How do you enforce a unique email across 64 shards?', a: '<p>Uniqueness must be checked in <b>one place</b>, so you need a global index or lookup table keyed by email, written <b>synchronously</b> with the row. Its primary key is the check: a second insert of the same email fails.</p><p>In Spanner or CockroachDB, a <code>UNIQUE</code> index does this inside the transaction. Vitess uses a <code>consistent_lookup_unique</code> vindex and orders the commits so a partial failure leaves no wrong entry, avoiding 2PC. An async index or a scan of all shards is racy: two sign-ups can both see "free".</p>', lvl: 'core' },
    { q: 'What happens when a DynamoDB GSI is under-provisioned?', a: '<p>GSIs are updated asynchronously, but the table still has to hand every index update to the GSI. If the GSI lacks write capacity, DynamoDB applies <b>back pressure</b>: writes to the <b>base table</b> are throttled, even though the table itself has spare capacity.</p><p>Fixes: give each GSI at least the table\'s write capacity (or use on-demand), project fewer attributes, make the index sparse, and avoid low-cardinality index keys.</p>', lvl: 'deep' },
    { q: 'You index on status (5 values). What goes wrong, and how do you fix it?', a: '<p>All entries for one value hash to one index partition, so <b>PENDING</b> takes a large share of all index writes no matter how many partitions you have, and a query for it returns a huge result.</p><ul><li><b>Write sharding:</b> key the index on <code>status#(hash(order_id) % k)</code> and merge k reads.</li><li><b>Sparse index:</b> index only the rows a job must find (e.g. set <code>needs_review</code> only while true).</li><li>For dashboards, keep <b>counters</b> or use an analytics store.</li></ul>', lvl: 'core' },
    { q: 'What is a covering index, and when is it worth it?', a: '<p>An index that also stores the columns a query returns (<code>STORING</code> in Spanner and CockroachDB, <code>INCLUDE</code> in Postgres, projections in DynamoDB). The query is answered from the index alone, with no second hop to the base shards.</p><p>The cost: more storage, and every change to a projected column is another index write. Cover the few columns of a hot query, not the whole row.</p>', lvl: 'core' },
    { q: 'How do you add an index to a live 10 TB table without downtime?', a: '<ol><li>Create the index in a <b>write-only</b> state: all new writes maintain it, but no query reads it (F1\'s delete-only → write-only states make this safe while servers switch schema versions).</li><li><b>Backfill</b> existing rows in chunks at low priority, through a path that cannot overwrite a newer live write (version check, or DBLog-style watermarks).</li><li>When the backfill is done and lag is zero, <b>verify</b>, then mark the index readable.</li></ol>', fu: 'What if a row changes while its chunk is being copied? (The live write carries a newer version and wins.)', lvl: 'deep' },
    { q: 'An async index has stale entries. How do readers cope?', a: '<p>Treat index hits as <b>candidates</b>. Fetch each row (or a projected version) and <b>re-check the predicate</b> against the base row, dropping mismatches. Optionally enqueue a repair (read repair).</p><p>This catches entries that should be gone. It cannot catch entries that are not there yet, so for "my own new order" use read-your-writes tricks instead.</p>', lvl: 'deep' },
    { q: 'How do you keep Elasticsearch in sync with Postgres without out-of-order overwrites?', a: '<ul><li>No dual writes from the app. Read the WAL with CDC (Debezium) or an outbox table into Kafka, <b>keyed by the row id</b> so one row\'s events stay in order.</li><li>Write with <code>version_type=external</code> and <code>version = source LSN</code>. Elasticsearch rejects any write whose version is not higher than the stored one, so replays and retries are harmless.</li><li>Deletes also carry the version. For mapping changes, build a new index and <b>swap the alias</b> atomically.</li></ul><p>Inverted-index internals are on the <a href="search-engine.html">Search Engine</a> page.</p>', lvl: 'core' },
    { q: 'A user creates an order and the search page does not show it. Fix it.', a: '<p>The search index lags the database, so offer <b>read-your-writes</b> for that user only:</p><ul><li>Return the commit LSN with the write; the search API waits until the indexer has applied that LSN, or reads that user\'s recent rows from the database and merges them.</li><li>Or have the client add the new item to its own list.</li><li>Elasticsearch\'s <code>refresh=wait_for</code> only helps once the document has reached the index; it does not cover CDC lag.</li></ul>', lvl: 'deep' },
    { q: 'Cassandra: secondary index, SAI, or materialized view?', a: '<p><b>2i and SAI</b> are <b>local</b> indexes: each node indexes its own data, so a query without the partition key fans out across the cluster. SAI (Cassandra 5.0, CEP-7) attaches the index to SSTables and is the recommended one; legacy 2i and SASI are deprecated.</p><p><b>Materialized views</b> are a server-maintained global index, but they are <b>experimental</b>: view and base can drift with no easy repair. Most teams write a second, query-specific table from the application instead.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Postgres: async index partition with versioned upserts and tombstones', lang: 'sql',
      code: `-- One partition of a global index on orders(status), written by an async applier.
-- Deletes leave a tombstone so a late, older event cannot bring an entry back.
CREATE TABLE orders_by_status (
  status   text    NOT NULL,
  order_id bigint  NOT NULL,
  total    numeric(12,2),              -- projected column: covering reads
  src_lsn  bigint  NOT NULL,           -- log position of the change that wrote it
  deleted  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (status, order_id)
);

-- Change event: order $2 moved from status $1 to $3 (new total $4) at LSN $5.
PREPARE drop_old(text, bigint, text, numeric, bigint) AS   -- on OLD value's partition
INSERT INTO orders_by_status AS e (status, order_id, src_lsn, deleted)
VALUES ($1, $2, $5, true)
ON CONFLICT (status, order_id) DO UPDATE
   SET src_lsn = EXCLUDED.src_lsn, deleted = true, total = NULL
 WHERE e.src_lsn < EXCLUDED.src_lsn;

PREPARE put_new(text, bigint, text, numeric, bigint) AS    -- on NEW value's partition
INSERT INTO orders_by_status AS e (status, order_id, total, src_lsn)
VALUES ($3, $2, $4, $5)
ON CONFLICT (status, order_id) DO UPDATE
   SET total = EXCLUDED.total, src_lsn = EXCLUDED.src_lsn, deleted = false
 WHERE e.src_lsn < EXCLUDED.src_lsn;

-- Events may arrive late or twice: any order of these gives the same result.
EXECUTE put_new (NULL,      7, 'PENDING', 40.00, 100);           -- insert
EXECUTE drop_old('PENDING', 7, 'PAID',    40.00, 120);
EXECUTE put_new ('PENDING', 7, 'PAID',    40.00, 120);

-- Read: candidates only. The caller re-checks each row on its shard.
SELECT order_id, total FROM orders_by_status
 WHERE status = 'PAID' AND NOT deleted ORDER BY order_id DESC LIMIT 50;`,
      note: 'Tested on Postgres 16 with the events in order, reversed, and with duplicates: every order ends with one live (PAID, 7) row and a PENDING tombstone. In production each partition is a separate database; purge tombstones older than the longest possible reorder window.'
    },
    {
      title: 'Spring Boot: CDC → OpenSearch/Elasticsearch with external versions', lang: 'java',
      code: `// spring-kafka 3.x + co.elastic.clients:elasticsearch-java 8.x
@Component
public class OrderSearchIndexer {
  private final ElasticsearchClient es;
  private final ObjectMapper json = new ObjectMapper();

  public OrderSearchIndexer(ElasticsearchClient es) { this.es = es; }

  // Debezium topic, keyed by order_id: one order's events stay in order.
  @KafkaListener(topics = "pg.public.orders", groupId = "orders-search")
  public void onChange(ConsumerRecord<String, String> rec) throws IOException {
    if (rec.value() == null) return;                    // Kafka tombstone after a delete
    JsonNode root = json.readTree(rec.value());
    JsonNode p = root.has("payload") ? root.get("payload") : root;
    long lsn = p.path("source").path("lsn").asLong();   // WAL position = version
    boolean delete = "d".equals(p.path("op").asText());
    JsonNode row = delete ? p.path("before") : p.path("after");
    String id = row.path("order_id").asText();
    try {
      if (delete) {
        es.delete(d -> d.index("orders").id(id)
            .version(lsn).versionType(VersionType.External));
      } else {
        Map<String, Object> doc = json.convertValue(row, new TypeReference<>() {});
        es.index(i -> i.index("orders").id(id).document(doc)
            .version(lsn).versionType(VersionType.External));
      }
    } catch (ElasticsearchException e) {
      if (e.status() != 409) throw e;                   // 409: index already has newer data
    }
  }
}`,
      note: 'Compiled with <code>javac --release 21</code> against spring-kafka 3.3.10 and elasticsearch-java 8.18.8. <code>orders</code> is a write alias pointing at one index. Elasticsearch keeps delete versions only for <code>index.gc_deletes</code>, so a very late event after a delete can still re-create the doc; the periodic reconcile catches that. Use the bulk API for throughput.'
    },
    {
      title: 'Python: scatter-gather with hedging and a deadline', lang: 'python',
      code: `import asyncio, random

async def query_shard(shard: int, cid: int) -> list[int]:
    """Stand-in for SELECT ... WHERE customer_id = $1 on one shard's local index."""
    slow = random.random() < 0.01                       # GC pause, compaction, noisy neighbour
    await asyncio.sleep(0.040 if slow else random.uniform(0.001, 0.003))
    return [shard * 1000 + cid] if shard % 8 == cid % 8 else []

async def hedged(shard: int, cid: int, after: float = 0.005) -> list[int]:
    first = asyncio.create_task(query_shard(shard, cid))
    done, _ = await asyncio.wait({first}, timeout=after)
    if done:
        return first.result()
    second = asyncio.create_task(query_shard(shard, cid))  # a replica, in real life
    done, pending = await asyncio.wait({first, second}, return_when=asyncio.FIRST_COMPLETED)
    for t in pending:
        t.cancel()
    return done.pop().result()

async def scatter_gather(cid: int, shards: int = 64, deadline: float = 0.1, hedge: bool = True):
    call = hedged if hedge else query_shard
    tasks = [asyncio.create_task(call(s, cid)) for s in range(shards)]
    done, pending = await asyncio.wait(tasks, timeout=deadline)
    for t in pending:
        t.cancel()                                      # answer with what we have
    return sorted(r for t in done for r in t.result()), len(pending)

async def main() -> None:
    loop = asyncio.get_running_loop()
    for hedge in (False, True):
        times = []
        for q in range(200):
            t0 = loop.time()
            await scatter_gather(q, hedge=hedge)
            times.append(loop.time() - t0)
        times.sort()
        print(f"hedge={hedge}: p50 {times[100]*1e3:.1f} ms  p99 {times[198]*1e3:.1f} ms")

asyncio.run(main())`,
      note: 'With 64 shards and a 1% slow-call rate, 1 − 0.99<sup>64</sup> ≈ 47% of unhedged queries hit a 40 ms call. Two runs on Python 3.13 printed p99 ≈ 43 ms without hedging and ≈ 11 ms with a hedge after 5 ms. The hedge doubles load only for the ~1% of calls that are slow.'
    }
  ],

  related: ['kv-store', 'distributed-sql', 'search-engine', 'message-queue', 'ecommerce-orders', 'distributed-cache']
});
