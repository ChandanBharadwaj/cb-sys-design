SD.register({
  slug: 'message-queue',
  domain: 1,
  title: 'Distributed Message Queue',
  examples: 'Kafka, Pulsar',
  tagline: 'Turn a firehose of events into a <b>replicated, append-only log</b> that many consumers can read at their own pace, in order, and replay days later.',
  tldr: {
    problem: 'Services need to hand off millions of events per second without losing them, without coupling to each other, and without the slowest consumer slowing everyone down.',
    idea: 'Split each topic into <b>partitions</b>. Each partition is an <b>append-only log</b> on disk, replicated to followers. Consumers <b>pull</b> and keep their own <b>offset</b>, so the broker does not track per-message state.',
    insight: 'Sequential appends plus the OS page cache make disks fast. Order is guaranteed <i>per partition</i>, and <code>acks=all</code> + <code>min.insync.replicas</code> decide how many broker losses an acknowledged write survives.',
    numbers: [
      { v: '7 trillion', l: 'messages/day across LinkedIn\'s Kafka (LinkedIn, 2019)' },
      { v: '4,000+', l: 'brokers in 100+ clusters at LinkedIn (LinkedIn, 2019)' },
      { v: '4.0', l: 'first Kafka release without ZooKeeper (Apache, March 2025)' }
    ]
  },

  requirements: {
    functional: [
      'Producers publish records (key, value, headers) to a topic',
      'Consumers in a <b>group</b> share partitions; different groups each get every record',
      'Per-key ordering',
      'Replay from any retained offset',
      'Retention by time/size, or log compaction by key',
      'Transactions: atomic writes across partitions'
    ],
    nonFunctional: [
      'Millions of records/s per cluster',
      'Acked writes survive a broker loss',
      'p99 produce latency of a few ms to tens of ms',
      'Horizontal scale by adding partitions/brokers',
      'Consumers isolated: one slow group does not block others',
      'Days of retention at low cost (tiered storage)'
    ],
    outOfScope: ['Per-message routing rules (RabbitMQ-style exchanges)', 'Delayed / scheduled delivery', 'Stream processing logic (see Stream Analytics)']
  },

  calculator: {
    inputs: [
      { id: 'mps', label: 'Messages / second (peak)', min: 1000, max: 20000000, value: 1000000, log: true },
      { id: 'size', label: 'Average message size', min: 100, max: 100000, value: 1000, log: true, fmt: 'bytes' },
      { id: 'rf', label: 'Replication factor', min: 1, max: 5, value: 3 },
      { id: 'ret', label: 'Retention', min: 1, max: 30, value: 7, unit: 'days' },
      { id: 'groups', label: 'Consumer groups reading everything', min: 1, max: 20, value: 3 },
      { id: 'ppart', label: 'Throughput one partition sustains (MB/s)', min: 1, max: 50, value: 10, unit: 'MB/s' }
    ],
    outputs: [
      { label: 'Produce ingress', fmt: 'bytesps', f: (v) => v.mps * v.size },
      { label: 'Broker egress (replication + consumers)', fmt: 'bytesps', f: (v) => v.mps * v.size * (v.rf - 1 + v.groups) },
      { label: 'Disk for retention (× RF)', fmt: 'bytes', f: (v) => v.mps * v.size * 86400 * v.ret * v.rf },
      { label: 'Minimum partitions for throughput', fmt: 'raw', f: (v) => String(Math.max(1, Math.ceil((v.mps * v.size) / (v.ppart * 1e6)))) },
      { label: 'Messages per day', f: (v) => v.mps * 86400 },
      { label: 'Replication share of egress', fmt: 'pct', f: (v) => (v.rf - 1) / (v.rf - 1 + v.groups) }
    ],
    note: 'Per-partition throughput is an <em>estimate</em>; measure it on your hardware. Peak rate is used for bandwidth, which overstates disk; scale by your peak-to-average ratio. With tiered storage only recent segments stay on broker disks.'
  },

  api: [
    { m: 'RPC', p: 'Produce(topic, partition, records[], acks)', d: 'Batched and compressed. The partition is <code>hash(key) % N</code>, or sticky round-robin when the key is null. With idempotence each batch carries <code>(producerId, epoch, sequence)</code>.' },
    { m: 'RPC', p: 'Fetch(topic, partition, offset, maxBytes)', d: 'Consumers <b>pull</b> from an offset. Followers use the same request to replicate. Only records below the <b>high watermark</b> are returned to consumers.' },
    { m: 'RPC', p: 'OffsetCommit(group, partition → offset)', d: 'Stored in the internal <code>__consumer_offsets</code> topic. Commit <i>after</i> processing for at-least-once.' },
    { m: 'RPC', p: 'ConsumerGroupHeartbeat(group, member)', d: 'Kafka 4.0\'s new group protocol (KIP-848): the broker-side coordinator assigns partitions incrementally, so members no longer stop the world on every rebalance.' },
    { m: 'RPC', p: 'InitProducerId · AddPartitionsToTxn · EndTxn', d: 'Transactions: write to several partitions plus the consumer offsets, then commit or abort atomically. Readers use <code>isolation.level=read_committed</code>.' }
  ],
  dataModel: [
    { name: 'Partition log', store: 'Broker disk (segment files)', fields: [['offset', 'int64', 'pk'], ['key', 'bytes', 'idx'], ['value', 'bytes'], ['timestamp', 'int64', 'idx'], ['headers', 'kv[]']], note: 'Rolled into segments (<code>.log</code> + <code>.index</code> + <code>.timeindex</code>). Whole old segments are deleted or moved to tiered storage.' },
    { name: '__consumer_offsets', store: 'Internal compacted topic', fields: [['group, topic, partition', 'key', 'pk'], ['committed_offset', 'int64'], ['metadata', 'string']], note: 'Compaction keeps only the latest offset per key.' },
    { name: 'Producer state', store: 'Per partition, on the leader', fields: [['producer_id', 'int64', 'pk'], ['epoch', 'int16'], ['last_seq', 'int32']], note: 'Lets the leader drop a retried batch it has already written: that is the idempotent producer.' }
  ],

  architecture: {
    title: 'Kafka-style distributed log',
    nodes: [
      { id: 'prod', label: 'Producers', sub: 'idempotent · acks=all', kind: 'client', wide: [280, 40], tall: [70, 0], tip: 'Batch records per partition, compress them, and send to the partition leader. Retries are safe because of producer id + sequence numbers.' },
      { id: 'ctrl', label: 'KRaft controllers', sub: 'Raft metadata quorum', kind: 'compute', wide: [660, 40], tall: [210, 0], tip: 'A small Raft quorum (often 3) that owns cluster metadata: topics, partition leaders and ISR. It replaced ZooKeeper (KIP-500); Kafka 4.0 has no ZooKeeper mode.' },
      { id: 'tier', label: 'Tiered storage', sub: 'S3 / GCS segments', kind: 'store', wide: [860, 160], tall: [350, 0], tip: 'Closed segments are copied to object storage (KIP-405, production-ready in Kafka 3.9). Brokers keep only recent data locally.' },
      { id: 'b1', label: 'Broker 1', sub: 'P0 leader', kind: 'queue', wide: [280, 160], tall: [70, 105], tip: 'Leader for partition 0, follower for P1 and P2. Appends to the active segment and serves reads mostly from the page cache.' },
      { id: 'b2', label: 'Broker 2', sub: 'P1 leader', kind: 'queue', wide: [470, 160], tall: [210, 105], tip: 'Leader for partition 1, follower for the others. Followers fetch from leaders exactly like consumers do.' },
      { id: 'b3', label: 'Broker 3', sub: 'P2 leader', kind: 'queue', wide: [660, 160], tall: [350, 105], tip: 'Leader for partition 2. Leadership is spread so each broker does a fair share of the writes.' },
      { id: 'cA1', label: 'Consumer A-1', sub: 'group A · P0', kind: 'service', wide: [280, 280], tall: [70, 210], tip: 'Group A has two members. Each partition is owned by exactly one member of a group, which is what keeps per-partition order.' },
      { id: 'cA2', label: 'Consumer A-2', sub: 'group A · P1, P2', kind: 'service', wide: [470, 280], tall: [210, 210], tip: 'Owns two partitions. Adding a third member to group A would let each own one; a fourth would sit idle.' },
      { id: 'cB', label: 'Consumer B-1', sub: 'group B · billing', kind: 'service', wide: [660, 280], tall: [350, 210], tip: 'A different group reads the same records independently with its own offsets. Shown reading P2; in practice it owns all partitions of its group.' },
      { id: 'dlq', label: 'DLQ topic', sub: 'poison messages', kind: 'queue', wide: [860, 280], tall: [350, 315], tip: 'A record that keeps failing is written here with error headers, and the offset moves on so the partition is not blocked.' },
      { id: 'offs', label: '__consumer_offsets', sub: 'committed offsets', kind: 'store', wide: [470, 390], tall: [210, 315], tip: 'Per (group, partition) committed offset, in a compacted internal topic. After a crash, a consumer resumes from here.' },
      { id: 'mon', label: 'Lag monitor', sub: 'log end − committed', kind: 'external', wide: [660, 390], tall: [70, 315], tip: 'Consumer lag per partition = log end offset − committed offset. The single most useful Kafka alert.' }
    ],
    edges: [
      { from: 'prod', to: 'b1' },
      { from: 'prod', to: 'b2' },
      { from: 'prod', to: 'b3' },
      { from: 'ctrl', to: 'b1', dashed: true },
      { from: 'ctrl', to: 'b2', dashed: true },
      { from: 'ctrl', to: 'b3', dashed: true },
      { from: 'b1', to: 'b2', bidi: true },
      { from: 'b2', to: 'b3', bidi: true },
      { from: 'b1', to: 'b3', bidi: true, bend: 0.3 },
      { from: 'b3', to: 'tier' },
      { from: 'b1', to: 'cA1' },
      { from: 'b2', to: 'cA2' },
      { from: 'b3', to: 'cA2' },
      { from: 'b3', to: 'cB' },
      { from: 'cB', to: 'dlq' },
      { from: 'cA1', to: 'offs' },
      { from: 'cA2', to: 'offs' },
      { from: 'cB', to: 'offs' },
      { from: 'mon', to: 'offs', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'produce', title: 'Produce with acks=all', tone: 'ok',
      steps: [
        { text: 'The producer hashes the key (<code>order-42</code>) to <b>partition 0</b> and sends a compressed batch to its leader, broker 1. The batch carries producer id + sequence number.', flow: ['prod>b1'], badges: { b1: 'append @ 1041' } },
        { text: 'Broker 1 appends to the active segment: a sequential write into the <b>page cache</b>. The <b>log end offset</b> (LEO) moves to 1042.', nodes: ['b1'], badges: { b1: 'LEO 1042' } },
        { text: 'Followers on brokers 2 and 3 <b>fetch</b> from the leader, the same way consumers do, and append the batch.', flow: [['b1>b2', 'b1>b3']], badges: { b2: 'LEO 1042', b3: 'LEO 1042' } },
        { text: 'All in-sync replicas (ISR) now have offset 1041, so the <b>high watermark</b> advances. Only now does the leader ack, because <code>acks=all</code>.', flow: ['b1>prod'], ok: ['b1'], badges: { b1: ['HW 1042 · ack', 'ok'] }, tone: 'ok' },
        { text: 'Consumers only see records below the high watermark, so nobody reads a record that could still be lost.', flow: ['b1>cA1'], ok: ['cA1'], tone: 'ok' }
      ]
    },
    {
      id: 'rebalance', title: 'Consumer joins → rebalance', tone: 'warn',
      steps: [
        { text: 'Group A has two members. A-2 owns P1 and P2 and is falling behind. We start a third instance.', nodes: ['cA1', 'cA2'], warn: ['cA2'], badges: { cA2: ['2 partitions', 'warn'] } },
        { text: 'With the <b>classic eager</b> protocol, every member gives up all partitions and waits for a new assignment: the whole group pauses.', nodes: ['cA1', 'cA2'], warn: ['cA1', 'cA2'], badges: { cA1: ['paused', 'warn'], cA2: ['paused', 'warn'] }, tone: 'warn' },
        { text: '<b>Cooperative sticky</b> assignment (and Kafka 4.0\'s broker-driven protocol, KIP-848) moves only what must move: A-2 hands over P2, A-1 keeps working.', nodes: ['cA1', 'cA2'], ok: ['cA1'], badges: { cA2: 'revoke P2' } },
        { text: 'A-2 commits its P2 offset first, so the new owner resumes exactly there. Duplicates are limited to anything processed but not yet committed.', flow: ['cA2>offs'], badges: { offs: 'P2 @ 880' }, tone: 'ok' },
        { text: 'The new member reads the committed offset and starts fetching P2. Max parallelism of a group = number of partitions.', flow: ['b3>cA2'], ok: ['cA2'], badges: { cA2: ['1 partition each', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'leader-dies', title: 'Leader broker dies', tone: 'err',
      steps: [
        { text: 'Broker 1, leader of P0, crashes. Producers get errors and consumers lose their fetch connection.', nodes: ['b1'], err: ['b1'], badges: { b1: ['down', 'err'] }, tone: 'err' },
        { text: 'The <b>KRaft controller</b> notices the missed heartbeats and picks a new leader <b>from the ISR</b> (here broker 2). It bumps the <b>leader epoch</b>.', flow: ['ctrl>b2'], warn: ['b2'], badges: { b2: ['new P0 leader', 'warn'] }, tone: 'warn' },
        { text: 'Producers refresh metadata and resend unacked batches to broker 2. Idempotence (producer id + sequence) makes the retries safe: no duplicates.', flow: ['prod>b2'], badges: { b2: 'dedupe retries' } },
        { text: 'Every acked record is on broker 2, because acks=all waited for the whole ISR. Records written with <code>acks=1</code> that broker 2 never fetched are <b>gone</b>.', nodes: ['b2', 'b3'], ok: ['b2'], badges: { b2: ['no acked loss', 'ok'] }, tone: 'ok' },
        { text: 'When broker 1 returns it is a follower. It <b>truncates</b> its log to match the new leader\'s epoch, then catches up and rejoins the ISR.', flow: ['b2>b1'], ok: ['b1'], badges: { b1: ['truncate · catch up', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'lag', title: 'Hot partition & consumer lag', tone: 'warn',
      steps: [
        { text: 'A flash sale: 80% of events have key <code>merchant-7</code>, so they all hash to <b>P2</b>. One partition, one consumer, one CPU.', flow: [['prod>b3', 'prod>b3']], warn: ['b3'], badges: { b3: ['hot partition', 'warn'] }, tone: 'warn' },
        { text: 'The lag monitor sees <b>log end − committed</b> on P2 growing by thousands per second while P0 and P1 are near zero.', flow: ['mon>offs'], warn: ['cB'], badges: { mon: ['P2 lag 2.1M', 'warn'] }, tone: 'warn' },
        { text: 'Adding consumers does not help: a group can never use more consumers than partitions, and P2 is one partition.', nodes: ['cB', 'cA2'], badges: { cB: '1 owner max' } },
        { text: 'Fixes: a better key (<code>merchant-7#shard</code>) if per-merchant order is not needed, or process P2 records in parallel <b>per key</b> inside the consumer. Repartitioning changes key → partition mapping, so plan it.', nodes: ['prod', 'b3'], ok: ['b3'], tone: 'ok' }
      ]
    },
    {
      id: 'poison', title: 'Poison message → DLQ', tone: 'info',
      steps: [
        { text: 'Consumer B reads offset 5520 from P2. The payload has a field it cannot parse, and processing throws.', flow: ['b3>cB'], err: ['cB'], badges: { cB: ['parse error', 'err'] } },
        { text: 'If it retries forever, the partition is <b>stuck</b>: nothing after 5520 is processed and lag climbs.', nodes: ['cB', 'mon'], warn: ['mon'], badges: { mon: ['P2 stuck', 'warn'] }, tone: 'warn' },
        { text: 'After a few retries with backoff, the consumer writes the record to a <b>dead-letter topic</b> with the error and source offset in headers.', flow: ['cB>dlq'], badges: { dlq: '+1 · 5520' } },
        { text: 'Then it commits 5521 and moves on. A separate tool inspects, fixes and replays DLQ records.', flow: ['cB>offs'], ok: ['cB'], badges: { offs: 'P2 @ 5521' }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real producer, topic or platform setting. Watch the write path, the broker labels and the durability meters.',
    controls: [
      { id: 'acks', label: 'Producer acks', type: 'seg', value: 'all', options: [
        { v: '0', l: 'acks=0' }, { v: '1', l: 'acks=1' }, { v: 'all', l: 'acks=all' }] },
      { id: 'isr', label: 'min.insync.replicas (RF = 3)', type: 'seg', value: '2', options: [
        { v: '1', l: '1' }, { v: '2', l: '2' }, { v: '3', l: '3' }] },
      { id: 'sem', label: 'Delivery semantics', type: 'seg', value: 'alo', options: [
        { v: 'amo', l: 'At-most-once' }, { v: 'alo', l: 'At-least-once' }, { v: 'eos', l: 'Exactly-once' }] },
      { id: 'plat', label: 'Platform', type: 'seg', value: 'kafka', options: [
        { v: 'kafka', l: 'Kafka (brokers store data)' }, { v: 'pulsar', l: 'Pulsar (BookKeeper)' }] },
      { id: 'parts', label: 'Partitions per topic', type: 'range', min: 1, max: 200, step: 1, value: 12 }
    ],
    evaluate(s) {
      const P = s.parts, isr = +s.isr, pulsar = s.plat === 'pulsar';
      const lat = { '0': ['lowest: no wait', 0.95], '1': ['leader append only', 0.8], all: ['slowest in-sync follower', 0.6] }[s.acks];
      let latV = lat[0], latS = lat[1];
      if (s.sem === 'eos') { latV += ' + txn commit'; latS -= 0.12; }
      let dur, durS;
      if (s.acks === '0') { dur = 'can lose writes even without a failure'; durS = 0.08; }
      else if (s.acks === '1') { dur = 'loses the unreplicated tail'; durS = 0.35; }
      else if (isr === 1) { dur = 'safe only while ISR > 1'; durS = 0.55; }
      else { dur = 'no acked write lost (' + (isr - 1) + ' broker' + (isr > 2 ? 's' : '') + ')'; durS = isr === 3 ? 1 : 0.92; }
      const blocked = s.acks === 'all' && isr === 3;
      const avail = blocked ? ['writes rejected: NotEnoughReplicas', 0.1] : ['writes continue', 0.9];
      const par = P === 1 ? ['1 consumer per group', 0.2] : P > 100 ? [P + ' (more files, slower recovery)', 0.55] : [P + ' consumers per group', P < 4 ? 0.45 : 0.9];
      const ord = P === 1 ? ['total order (one partition)', 1] : ['per key (per partition)', 0.75];
      const dup = { amo: ['may lose, never duplicates', 0.35], alo: ['no loss, may duplicate', 0.7], eos: ['exactly once (Kafka → Kafka)', 0.95] }[s.sem];
      const scale = pulsar ? ['brokers stateless: reassign instantly', 0.85] : ['moving a partition copies its data', 0.5];
      const metrics = [
        { k: 'Produce latency', v: latV, s: Math.max(0.1, latS) },
        { k: 'Leader loss', v: dur, s: durS },
        { k: 'With 1 broker down', v: avail[0], s: avail[1] },
        { k: 'Consumer parallelism', v: par[0], s: par[1] },
        { k: 'Ordering scope', v: ord[0], s: ord[1] },
        { k: 'Duplicates / loss', v: dup[0], s: dup[1] },
        { k: 'Scale-out cost', v: scale[0], s: scale[1] }
      ];
      const notes = [];
      if (s.acks === 'all' && isr === 1) notes.push('With <code>min.insync.replicas=1</code> the ISR can shrink to the leader alone, and <code>acks=all</code> then means "the leader has it". Use RF=3, min ISR=2.');
      if (blocked) notes.push('min ISR = RF means one broker restart blocks every <code>acks=all</code> write. Keep min ISR ≤ RF − 1.');
      if (s.acks !== 'all' && s.isr !== '2') notes.push('<code>min.insync.replicas</code> only applies to <code>acks=all</code> producers. With acks=' + s.acks + ' it does nothing.');
      if (s.sem === 'eos') notes.push('Exactly-once = <b>idempotent producer</b> (producer id + sequence, dedupes retries) + <b>transactions</b> (output records and consumer offsets commit atomically) + consumers with <code>read_committed</code>. Side effects outside Kafka still need idempotency.');
      if (s.sem === 'amo') notes.push('At-most-once: commit the offset <i>before</i> processing. A crash mid-processing skips the record.');
      if (s.sem === 'alo') notes.push('At-least-once: process, then commit. A crash between the two replays the record, so make handlers idempotent.');
      if (pulsar) notes.push('Pulsar brokers are stateless. Each topic is a chain of <b>BookKeeper ledgers</b> (segments) striped over bookies, so a new broker can take a topic without copying data. The cost: more tiers to run.');
      if (P > 100) notes.push('Each partition is a set of open files and one leader election on failover. Partitions are cheap to add and impossible to remove, so size for the next couple of years, not forever.');
      let verdict;
      if (s.sem === 'eos' && s.acks !== 'all') verdict = '❌ <b>Invalid config:</b> idempotence and transactions require <code>acks=all</code>. The producer refuses to start.';
      else if (s.acks === '0') verdict = '⚠ <b>Fire and forget.</b> Fine for metrics you can afford to drop, never for orders or payments.';
      else if (blocked) verdict = '⚠ <b>Durable but fragile:</b> any single broker restart stops all writes to this topic.';
      else if (s.acks === 'all' && isr === 2 && s.sem !== 'amo') verdict = '✅ <b>The standard durable setup:</b> RF=3, min ISR=2, acks=all, idempotent producer. Survives one broker loss with no acked data lost and writes keep flowing.';
      else if (s.acks === '1') verdict = '⚠ <b>Fast, but a leader crash can drop acked writes.</b> Kafka 3.0+ defaults to acks=all for a reason.';
      else verdict = '👍 Workable. Check the durability and duplicates meters.';
      const write = pulsar ? ['prod>b1', 'b1>tier'] : s.acks === 'all' ? ['prod>b1', ['b1>b2', 'b1>b3']] : ['prod>b1'];
      return {
        metrics, verdict, notes,
        flow: write.concat(['b1>cA1', 'cA1>offs']),
        labels: pulsar ? {
          b1: { label: 'Broker 1', sub: 'stateless · owns P0' }, b2: { label: 'Broker 2', sub: 'stateless · owns P1' }, b3: { label: 'Broker 3', sub: 'stateless · owns P2' },
          tier: { label: 'BookKeeper bookies', sub: 'ledgers (segments)' }, ctrl: { label: 'Metadata store', sub: 'cluster metadata' }
        } : { b1: { label: 'Broker 1', sub: 'P0 · acks=' + s.acks } },
        hot: pulsar ? ['tier', 'b1'] : ['b1'],
        warn: s.acks !== 'all' ? ['b2', 'b3'] : [],
        err: blocked || (s.sem === 'eos' && s.acks !== 'all') ? ['prod'] : [],
        badges: { b1: [pulsar ? 'write quorum → bookies' : 'min ISR ' + s.isr, durS >= 0.9 ? 'ok' : durS >= 0.5 ? 'warn' : 'err'], cA1: [P + ' partitions', 'info'] }
      };
    }
  },

  widget: {
    title: 'One partition, three replicas',
    caption: 'Produce records and watch the <b>log end offset</b> (LEO) on each replica and the <b>high watermark</b> (HW). The consumer only reads below the HW. Switch to <b>acks=1</b>, produce, then <b>kill the leader</b> before followers catch up: acked records disappear.'
  },

  realWorld: {
    intro: 'Kafka started at LinkedIn as a log-aggregation system and became the default event backbone. These are the milestones its authors and maintainers published.',
    timeline: [
      { when: '2011', who: 'LinkedIn', title: 'The Kafka paper (NetDB \'11)', text: 'Kreps, Narkhede and Rao describe a log split into partitions, stored as segment files, served from the <b>OS page cache</b> with <b>sendfile</b> zero-copy, and read by <b>pull</b>-based consumers that track their own offset. At the time LinkedIn moved hundreds of GB of new data per day through it.', src: 0 },
      { when: '2017', who: 'Apache Kafka 0.11', title: 'Exactly-once semantics', text: 'KIP-98 adds the <b>idempotent producer</b> (producer id + sequence numbers per partition) and <b>transactions</b> across partitions, with <code>read_committed</code> consumers.', src: 1 },
      { when: '2017', who: 'Confluent', title: 'How exactly-once works', text: 'Before 0.11 Kafka offered at-least-once with per-partition order. The post explains how idempotence plus transactions let Kafka Streams do read-process-write exactly once.', src: 2 },
      { when: '2019', who: 'LinkedIn', title: '7 trillion messages a day', text: 'LinkedIn reports more than <b>100 clusters</b>, <b>4,000+ brokers</b>, 100,000+ topics and 7 million partitions, handling over <b>7 trillion messages per day</b>.', src: 3 },
      { when: '2024', who: 'Apache Kafka 3.9', title: 'Tiered storage production-ready', text: 'KIP-405, in development since 3.6, lets brokers move closed segments to object storage, so retention is no longer bounded by local disks.', src: 4 },
      { when: '2025', who: 'Apache Kafka 4.0', title: 'ZooKeeper removed; new group protocol GA', text: 'The first release without ZooKeeper: metadata lives in the <b>KRaft</b> Raft quorum proposed in KIP-500. It also makes the KIP-848 consumer group protocol generally available to cut rebalance pauses.', src: 5 },
      { when: 'Design', who: 'Apache Pulsar', title: 'Separate serving from storage', text: 'Pulsar brokers are stateless. Data lives in Apache BookKeeper as a sequence of <b>ledgers</b> replicated across bookies, so brokers scale and fail over without moving data.', src: 6 }
    ],
    lessons: [
      '<span>A log with consumer-owned offsets scales better than a broker that tracks every message.</span>',
      '<span>Durability is a <b>combination</b>: replication factor 3, min in-sync replicas 2, and acks = all.</span>',
      '<span>Order exists only <b>per partition</b>. Choose the key for the order you need.</span>',
      '<span>Consumer lag is the health metric. Alert on it.</span>'
    ],
    sources: [
      { title: 'Kafka: a Distributed Messaging System for Log Processing', url: 'https://people.csail.mit.edu/matei/courses/2015/6.S897/readings/kafka.pdf', pub: 'Kreps, Narkhede, Rao · NetDB \'11 (course mirror)' },
      { title: 'KIP-98: Exactly Once Delivery and Transactional Messaging', url: 'https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging', pub: 'Apache Kafka wiki' },
      { title: 'Exactly-once Semantics are Possible: Here\'s How Apache Kafka Does it', url: 'https://confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it', pub: 'Confluent, 2017' },
      { title: 'How LinkedIn customizes Apache Kafka for 7 trillion messages per day', url: 'https://engineering.linkedin.com/blog/2019/apache-kafka-trillion-messages', pub: 'LinkedIn Engineering, 2019' },
      { title: 'Apache Kafka 3.9.0 Release Announcement', url: 'https://kafka.apache.org/blog/2024/11/06/apache-kafka-3.9.0-release-announcement/', pub: 'Apache Kafka, 2024' },
      { title: 'Apache Kafka 4.0.0 Release Announcement', url: 'https://kafka.apache.org/blog/2025/03/18/apache-kafka-4.0.0-release-announcement/', pub: 'Apache Kafka, 2025' },
      { title: 'Pulsar architecture overview', url: 'https://pulsar.apache.org/docs/concepts-architecture-overview', pub: 'Apache Pulsar docs' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Producer acks', '<b>acks=1</b>: lower latency', '<b>acks=all</b> + min ISR 2: no acked loss', 'acks=all for business data (the default since Kafka 3.0); acks=1/0 for droppable telemetry'],
      ['Partitions', '<b>Few</b>: cheap, strong order', '<b>Many</b>: parallelism, more overhead', 'Partitions ≥ peak consumers needed; you can add but not remove them'],
      ['Delivery', '<b>At-least-once</b> + idempotent handlers', '<b>Exactly-once</b> transactions', 'EOS for Kafka→Kafka pipelines; idempotent handlers when writing to external DBs'],
      ['Platform', '<b>Kafka</b>: one tier, huge ecosystem', '<b>Pulsar</b>: stateless brokers + BookKeeper', 'Kafka by default; Pulsar for many tenants/topics or fast broker elasticity'],
      ['Retention', '<b>Local disks</b>: simple, fast replay', '<b>Tiered storage</b>: long, cheap retention', 'Tiered once you keep more than a few days'],
      ['Log vs queue', '<b>Log</b> (Kafka): replay, order, groups', '<b>Queue</b> (SQS/RabbitMQ): per-message ack, delays', 'Log for event streams; queue for task distribution with per-message retry']
    ]
  },
  failures: [
    { f: 'Leader broker crashes', detect: 'Controller misses broker heartbeats', fix: 'New leader elected from the ISR; idempotent producers retry safely; no acked loss with acks=all + min ISR 2.' },
    { f: 'Follower falls behind', detect: 'ISR shrink metric / under-replicated partitions', fix: 'It leaves the ISR after <code>replica.lag.time.max.ms</code>, so writes continue; fix disk/network, it rejoins after catching up.' },
    { f: 'Unclean leader election', detect: 'All ISR replicas lost', fix: 'Keep <code>unclean.leader.election.enable=false</code> (default): stay unavailable rather than elect a stale replica and lose data.' },
    { f: 'Consumer lag grows', detect: 'Lag = log end − committed, per partition', fix: 'Add consumers (up to the partition count), speed up processing, or fix a hot key.' },
    { f: 'Rebalance storms', detect: 'Frequent group generation changes', fix: 'Cooperative / KIP-848 protocol, static membership (<code>group.instance.id</code>), and keep <code>max.poll.interval.ms</code> above worst processing time.' },
    { f: 'Poison message blocks a partition', detect: 'Same offset failing repeatedly', fix: 'Bounded retries, then dead-letter topic with error headers; commit and move on.' },
    { f: 'Disk full on brokers', detect: 'Disk usage alerts', fix: 'Retention by size and time, tiered storage, quotas on noisy producers.' }
  ],

  interview: [
    { q: 'How does Kafka guarantee ordering?', a: '<p>Only <b>within a partition</b>. A partition is an append-only log, and one consumer in a group reads it sequentially.</p><p>Records with the same key go to the same partition (<code>hash(key) % N</code>), so per-key order holds. With retries, the <b>idempotent producer</b> keeps order even with up to 5 in-flight batches.</p>', fu: 'What breaks per-key order? (Adding partitions changes the key → partition mapping.)', lvl: 'core' },
    { q: 'How does exactly-once actually work?', a: '<ul><li><b>Idempotent producer</b>: each batch carries producer id, epoch and sequence; the leader drops duplicates from retries.</li><li><b>Transactions</b>: a producer writes output records <i>and</i> the consumer offsets to several partitions, then commits atomically via a transaction coordinator.</li><li><b>read_committed</b> consumers skip aborted data.</li></ul><p>It covers Kafka → Kafka. Writes to an external DB still need idempotency keys or a transactional outbox.</p>', lvl: 'deep' },
    { q: 'Why is Kafka fast if it writes everything to disk?', a: '<p>Appends are <b>sequential</b>, which disks and SSDs handle very well. Writes land in the <b>OS page cache</b> and are flushed by the OS. Recent data is read back from that cache.</p><p>Reads to consumers use <b>sendfile</b> zero-copy (page cache → socket), and producers send <b>compressed batches</b>, so per-record overhead is tiny.</p>', lvl: 'core' },
    { q: 'What are the ISR and the high watermark?', a: '<p>The <b>ISR</b> (in-sync replicas) is the set of replicas caught up with the leader within <code>replica.lag.time.max.ms</code>. The <b>high watermark</b> is the highest offset every ISR member has.</p><p>Consumers only read below the HW, and <code>acks=all</code> acks once the HW passes the record. A slow follower is dropped from the ISR instead of blocking writes.</p>', lvl: 'core' },
    { q: 'What do acks and min.insync.replicas do together?', a: '<p><code>acks=all</code> waits for the current ISR. <code>min.insync.replicas</code> says how small the ISR may get before writes are refused.</p><p>RF=3, min ISR=2, acks=all: one broker can be down, writes continue, and every acked write is on ≥ 2 brokers. With min ISR=1, acks=all can degrade to "only the leader has it".</p>', lvl: 'core' },
    { q: 'What triggers a consumer rebalance, and how do you make it cheaper?', a: '<p>Triggers: a member joins or leaves, misses heartbeats (<code>session.timeout.ms</code>), exceeds <code>max.poll.interval.ms</code>, or the topic gains partitions.</p><ul><li><b>Cooperative sticky</b> assignor: only moved partitions are revoked.</li><li><b>Static membership</b> (<code>group.instance.id</code>): restarts do not trigger a rebalance.</li><li>Kafka 4.0\'s <b>KIP-848</b> protocol makes assignment incremental and broker-driven.</li></ul>', lvl: 'deep' },
    { q: 'How many partitions is too many?', a: '<p>Partitions give parallelism, but each one costs open files, memory, replication fetches and a leader election on failover. Very high counts per broker slow recovery.</p><p>Rule of thumb: enough for the <b>peak consumer parallelism</b> and throughput you expect in a year or two. You can add partitions later, but that remaps keys, and you cannot remove them.</p>', lvl: 'deep' },
    { q: 'How do you handle a poison message?', a: '<p>Retry a few times with backoff. If it still fails, publish it to a <b>dead-letter topic</b> with the error, source topic, partition and offset in headers, then <b>commit and move on</b>.</p><p>Without this, one bad record blocks its whole partition forever.</p>', lvl: 'core' },
    { q: 'At-least-once vs at-most-once: where do you commit?', a: '<p><b>At-most-once</b>: commit, then process. A crash loses the record.</p><p><b>At-least-once</b>: process, then commit. A crash replays it, so the handler must be idempotent (e.g. upsert by event id).</p><p>Disable auto-commit if you need control: auto-commit can commit before processing finishes.</p>', lvl: 'core' },
    { q: 'Why did Kafka remove ZooKeeper?', a: '<p>Metadata lived in a separate system with its own ops and scaling limits, and a new controller had to load all state from ZooKeeper on failover, slow with many partitions.</p><p><b>KRaft</b> (KIP-500) stores metadata in an internal Raft-replicated log on a controller quorum. Standby controllers already have it in memory, so failover is fast. Kafka 4.0 (2025) is KRaft-only.</p>', lvl: 'deep' },
    { q: 'Kafka vs Pulsar: what is the architectural difference?', a: '<p><b>Kafka</b>: brokers own partition data on local disks. Simple, one tier, but moving a partition copies its data.</p><p><b>Pulsar</b>: stateless brokers serve, <b>BookKeeper bookies</b> store topics as a chain of ledgers. Brokers can take over topics instantly; you run more components.</p>', lvl: 'deep' },
    { q: 'When would you use a queue (SQS, RabbitMQ) instead of a log?', a: '<p>When you want <b>per-message</b> acknowledgement, retries and visibility timeouts for independent tasks, delayed delivery, or competing consumers without partition planning.</p><p>Use a log when you need replay, many independent readers, and ordered streams of events. Kafka 4.0 adds an early-access "share group" queue mode (KIP-932).</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Spring Kafka: durable, idempotent producer', lang: 'yaml',
      code: `# application.yml (Spring Boot 3, spring-kafka)
spring:
  kafka:
    bootstrap-servers: kafka-1:9092,kafka-2:9092,kafka-3:9092
    producer:
      acks: all
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      properties:
        enable.idempotence: true          # producer id + sequence numbers
        max.in.flight.requests.per.connection: 5
        delivery.timeout.ms: 120000
        linger.ms: 5                      # small batching delay
        compression.type: zstd
    consumer:
      group-id: billing
      enable-auto-commit: false           # commit after processing
      auto-offset-reset: earliest
      isolation-level: read_committed
      properties:
        partition.assignment.strategy: org.apache.kafka.clients.consumer.CooperativeStickyAssignor
    listener:
      ack-mode: manual
# topic: replication factor 3, min.insync.replicas=2`
    },
    {
      title: 'Spring Kafka: listener with manual ack + DLQ', lang: 'java',
      code: `@Configuration
class KafkaErrorConfig {
  @Bean
  DefaultErrorHandler errorHandler(KafkaTemplate<String, Object> template) {
    var recoverer = new DeadLetterPublishingRecoverer(template,
        (rec, ex) -> new TopicPartition(rec.topic() + ".DLT", rec.partition()));
    return new DefaultErrorHandler(recoverer, new FixedBackOff(500L, 3)); // 3 retries
  }
}

@Component
class OrderListener {
  private final OrderService orders;
  OrderListener(OrderService orders) { this.orders = orders; }

  @KafkaListener(topics = "orders", concurrency = "3")   // ≤ partition count
  void onOrder(ConsumerRecord<String, OrderEvent> rec, Acknowledgment ack) {
    orders.applyIdempotently(rec.value().eventId(), rec.value()); // upsert by event id
    ack.acknowledge();                    // commit only after processing
  }
}`,
      note: 'Spring Boot auto-configuration picks up a single <code>CommonErrorHandler</code> bean for the default listener container factory. The DLT needs as many partitions as the source topic for this resolver.'
    },
    {
      title: 'Python: idempotent consumer (confluent-kafka)', lang: 'python',
      code: `from confluent_kafka import Consumer

c = Consumer({
    "bootstrap.servers": "kafka-1:9092",
    "group.id": "billing",
    "enable.auto.commit": False,
    "auto.offset.reset": "earliest",
    "isolation.level": "read_committed",
})
c.subscribe(["orders"])

while True:
    msg = c.poll(1.0)
    if msg is None:
        continue
    if msg.error():
        print("consumer error:", msg.error())
        continue
    event_id = msg.key().decode()
    with db.transaction():                       # your Postgres helper
        db.execute("INSERT INTO processed(event_id) VALUES (%s) "
                   "ON CONFLICT DO NOTHING", (event_id,))
        # ... apply the business change in the same transaction ...
    c.commit(message=msg, asynchronous=False)    # at-least-once`,
      note: 'The <code>processed</code> table turns at-least-once delivery into effectively-once side effects.'
    }
  ],

  related: ['stream-analytics', 'job-scheduler', 'notifications', 'ad-click-aggregation', 'observability', 'kv-store']
});
