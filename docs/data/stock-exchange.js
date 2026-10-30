SD.register({
  slug: 'stock-exchange',
  domain: 3,
  title: 'Stock Exchange Matching Engine',
  examples: 'LMAX, NASDAQ',
  tagline: 'Match every buy and sell in strict <b>price-time priority</b>, in microseconds, and be able to <b>replay the whole day</b> and get exactly the same trades.',
  tldr: {
    problem: 'Thousands of firms send orders at once. Every order must be matched fairly (best price first, then first come), acknowledged in microseconds, and never lost, and the result must be auditable after the fact.',
    idea: 'A <b>sequencer</b> stamps every incoming message with one global sequence number. The input is <b>journaled and replicated</b>, then a <b>single thread per order book</b> applies it to an in-memory book: a sorted map of price levels, each a FIFO queue.',
    insight: 'One thread + one input order = <b>no locks and deterministic replay</b>. A hot standby fed the same sequence ends up with the identical book. Concurrency lives at the edges (gateways, journaling, market data), joined by lock-free ring buffers.',
    numbers: [
      { v: '6M/s', l: 'orders/s on one Java thread (LMAX, via Martin Fowler, 2011)' },
      { v: '1', l: 'thread per order book: no locks, exact replay' },
      { v: 'ns', l: 'timestamp resolution in Nasdaq TotalView-ITCH' }
    ]
  },

  requirements: {
    functional: [
      'New, cancel and replace orders (limit, market, IOC)',
      'Match by price-time priority, with partial fills',
      'Execution reports to both sides of every trade',
      'Public market data: book changes and trades',
      'Pre-trade risk checks: credit limits, price bands, max size',
      'Send trades to clearing'
    ],
    nonFunctional: [
      'Matching latency in microseconds, low jitter at p99.9',
      'Deterministic: the same input always gives the same output',
      'No acknowledged order is ever lost',
      'One fair total order across all participants',
      'Fail over to a hot standby in seconds with identical state',
      'Absorb open and close bursts many times the average (estimate)'
    ],
    outOfScope: ['Opening and closing auctions', 'Clearing and settlement internals', 'Broker order management and smart routing', 'Regulatory reporting']
  },

  calculator: {
    inputs: [
      { id: 'msgs', label: 'Peak inbound messages / second', min: 10000, max: 10000000, value: 1000000, log: true },
      { id: 'bytes', label: 'Bytes per message (binary)', min: 32, max: 256, value: 64, fmt: 'bytes' },
      { id: 'hot', label: 'Share of traffic on the busiest symbol', min: 1, max: 40, value: 5, unit: '%' },
      { id: 'md', label: 'Market-data messages per inbound message', min: 1, max: 3, step: 0.1, value: 1.5, unit: '×' },
      { id: 'burst', label: 'Burst to absorb without blocking', min: 1, max: 100, value: 10, unit: 'ms' },
      { id: 'hours', label: 'Trading hours per day', min: 1, max: 24, step: 0.5, value: 6.5, unit: 'h' }
    ],
    outputs: [
      { label: 'Journal write bandwidth', fmt: 'bytesps', f: (v) => v.msgs * v.bytes },
      { label: 'Journal per day (if sustained at peak: upper bound)', fmt: 'bytes', f: (v) => v.msgs * v.bytes * v.hours * 3600 },
      { label: 'Time budget per message on the busiest book\'s thread', fmt: 'ms', f: (v) => 1000 / (v.msgs * v.hot / 100) },
      { label: 'Market-data messages / second', f: (v) => v.msgs * v.md },
      { label: 'Market-data bandwidth (one multicast stream)', fmt: 'bytesps', f: (v) => v.msgs * v.md * v.bytes },
      { label: 'Ring-buffer slots for the burst (next power of 2)', f: (v) => Math.pow(2, Math.ceil(Math.log2(Math.max(2, v.msgs * v.burst / 1000)))) }
    ],
    note: 'All inputs are <em>estimates</em>. The key number is the <b>per-message budget on the busiest book</b>: a single thread works as long as one message takes less than that. Since books are independent, you scale by giving each symbol (or group of symbols) its own thread, but you can never split one symbol. Multicast means market-data bandwidth does not grow with the number of subscribers.'
  },

  api: [
    { m: 'RPC', p: 'FIX NewOrderSingle (35=D) / OUCH Enter', d: '<code>{clOrdId, symbol, side, qty, price, type, timeInForce}</code>. Binary protocols such as OUCH avoid FIX text parsing on the hot path.' },
    { m: 'RPC', p: 'FIX OrderCancelRequest (35=F)', d: 'Cancel by order id. Cancels are sequenced like orders, so a cancel can lose the race to a fill.' },
    { m: 'RPC', p: 'FIX OrderCancelReplaceRequest (35=G)', d: 'Change price or size. A price change or size increase normally loses time priority.' },
    { m: 'RPC', p: 'FIX ExecutionReport (35=8)', d: 'Ack, partial fill, fill, cancel or reject, back to the order owner.' },
    { m: 'UDP', p: 'ITCH over MoldUDP64 multicast', d: 'Order-level public feed: Add Order (type <code>A</code>/<code>F</code>), executions, cancels, trades. Every packet carries a sequence number.' },
    { m: 'RPC', p: 'Retransmit / snapshot (e.g. GLIMPSE)', d: 'A subscriber that sees a gap requests the missing sequence range, or takes a snapshot and resumes.' }
  ],
  dataModel: [
    { name: 'order_book (per symbol)', store: 'In-memory, one thread', fields: [['bids', 'TreeMap<price ↓, FIFO queue>'], ['asks', 'TreeMap<price ↑, FIFO queue>'], ['by_id', 'HashMap<orderId, Order>', 'idx'], ['price', 'long ticks (never double)']], note: 'Best bid and ask are the first keys. Price levels are FIFO, which is time priority.' },
    { name: 'journal', store: 'Append-only file, replicated', fields: [['seq', 'int64', 'pk'], ['ts_ns', 'int64 (from sequencer)'], ['session_id', 'int'], ['payload', 'raw binary message']], note: 'The single source of truth. The book is just a function of this log.' },
    { name: 'trades', store: 'Post-trade store → clearing', fields: [['trade_id', 'int64', 'pk'], ['seq', 'int64', 'idx'], ['symbol', 'text', 'idx'], ['buy_order, sell_order', 'int64'], ['price, qty', 'long'], ['ts_ns', 'int64']], note: 'Written asynchronously from the engine\'s output stream.' }
  ],

  architecture: {
    title: 'Matching engine architecture',
    nodes: [
      { id: 'brk', label: 'Brokers', sub: 'FIX / OUCH sessions', kind: 'client', wide: [90, 110], tall: [70, 0], tip: 'Member firms and their algorithms, often co-located in the exchange\'s data centre.' },
      { id: 'gw', label: 'Order gateway', sub: 'session · validate', kind: 'edge', wide: [290, 110], tall: [70, 105], tip: 'Terminates sessions, checks message format and per-session throttles, converts to the internal binary format.' },
      { id: 'risk', label: 'Pre-trade risk', sub: 'limits · price bands', kind: 'service', wide: [490, 0], tall: [70, 210], tip: 'Credit limits per member, fat-finger price bands, maximum order size. Must be fast: it sits on the critical path.' },
      { id: 'seq', label: 'Sequencer', sub: 'one global order', kind: 'service', wide: [690, 0], tall: [70, 315], tip: 'Assigns every message a sequence number and timestamp. This is the definition of "who came first".' },
      { id: 'jrnl', label: 'Journal', sub: 'append + replicate', kind: 'store', wide: [900, 0], tall: [210, 315], tip: 'Sequential writes of the raw input, replicated to the standby. A message is acknowledged only after it is durable.' },
      { id: 'me', label: 'Matching engine', sub: 'one thread per book', kind: 'compute', wide: [690, 110], tall: [210, 210], tip: 'Applies sequenced messages to the in-memory order book. No locks, no clocks, no randomness inside.' },
      { id: 'repl', label: 'Hot standby', sub: 'replays same input', kind: 'compute', wide: [900, 110], tall: [210, 420], tip: 'Runs the same engine on the same sequenced input, so its book is identical. Takes over in seconds.' },
      { id: 'md', label: 'Market data', sub: 'ITCH · UDP multicast', kind: 'service', wide: [690, 220], tall: [350, 105], tip: 'Publishes every book change and trade as a sequenced feed. One multicast packet reaches every subscriber.' },
      { id: 'feed', label: 'Data subscribers', sub: 'firms · vendors', kind: 'client', wide: [900, 220], tall: [350, 0], tip: 'Rebuild the full order book from the feed. On a sequence gap they ask for a retransmission.' },
      { id: 'clr', label: 'Clearing', sub: 'post-trade · CCP', kind: 'external', wide: [490, 220], tall: [350, 210], tip: 'Receives trades for netting and settlement, away from the latency-critical path.' },
      { id: 'db', label: 'Trade store', sub: 'audit · reporting', kind: 'store', wide: [290, 220], tall: [350, 315], tip: 'Durable record of executions for audit and reporting, written asynchronously.' }
    ],
    edges: [
      { from: 'brk', to: 'gw', bidi: true },
      { from: 'gw', to: 'risk' },
      { from: 'risk', to: 'seq' },
      { from: 'seq', to: 'jrnl' },
      { from: 'seq', to: 'me' },
      { from: 'jrnl', to: 'repl' },
      { from: 'me', to: 'gw', label: 'exec reports' },
      { from: 'me', to: 'md' },
      { from: 'md', to: 'feed' },
      { from: 'me', to: 'clr' },
      { from: 'clr', to: 'db' }
    ]
  },

  scenarios: [
    {
      id: 'rest', title: 'Limit order rests in the book', tone: 'info',
      steps: [
        { text: 'A broker sends <b>BUY 100 @ 100.00</b>. The gateway checks the session and format and converts it to a compact binary message.', flow: ['brk>gw'], badges: { gw: 'BUY 100 @ 100.00' } },
        { text: '<b>Pre-trade risk</b>: is the member within its credit limit, and is the price inside the allowed band? A fat-finger order stops here.', flow: ['gw>risk'], ok: ['risk'], badges: { risk: ['pass', 'ok'] } },
        { text: 'The <b>sequencer</b> stamps it <code>seq = 1,000,001</code>. From now on, that number <i>is</i> its place in line.', flow: ['risk>seq'], badges: { seq: '#1,000,001' } },
        { text: 'The message is <b>journaled and replicated</b> to the standby. Only durable messages are acknowledged.', flow: [['seq>jrnl', 'seq>me'], 'jrnl>repl'], badges: { jrnl: 'durable' } },
        { text: 'The engine looks at the best ask: 100.05, above 100.00, so nothing crosses. The order joins the <b>back of the 100.00 bid queue</b>.', nodes: ['me'], badges: { me: 'rests · 3rd at 100.00' } },
        { text: 'An execution report ("New") goes back to the broker and an ITCH <b>Add Order</b> goes out to every subscriber.', flow: [['me>gw', 'me>md'], ['gw>brk', 'md>feed']], ok: ['feed'] }
      ]
    },
    {
      id: 'cross', title: 'Market order sweeps the book', tone: 'ok',
      steps: [
        { text: '<b>SELL 250 at market</b> arrives and is sequenced behind everything that came before it.', flow: ['brk>gw', 'gw>risk', 'risk>seq', 'seq>me'], badges: { seq: '#1,000,002' } },
        { text: 'Best bid is 100.00 with two orders: A (100, older) and B (50). <b>Time priority</b>: A fills first, then B.', nodes: ['me'], badges: { me: 'A 100 · B 50 @ 100.00' } },
        { text: 'Still 100 left, so the engine moves to the next level, 99.95, and fills 100 there. Trades print at the <b>resting order\'s price</b>.', nodes: ['me'], badges: { me: '100 @ 99.95' }, tone: 'ok' },
        { text: 'Execution reports go to all four parties, ITCH "Order Executed" messages update everyone\'s book, and the trades go to clearing.', flow: [['me>gw', 'me>md', 'me>clr'], ['gw>brk', 'md>feed', 'clr>db']], ok: ['clr'] }
      ]
    },
    {
      id: 'crash', title: 'Primary engine dies → standby takes over', tone: 'err',
      steps: [
        { text: 'The primary matching engine\'s host fails in the middle of the trading day.', nodes: ['me'], err: ['me'], badges: { me: ['down', 'err'] }, tone: 'err' },
        { text: 'The standby has been consuming the <b>same journaled sequence</b> all day and applying it with the same code. Its book is identical, down to queue positions.', flow: ['seq>jrnl', 'jrnl>repl'], err: ['me'], badges: { repl: 'seq 1,000,002' } },
        { text: 'It is promoted and continues at the next sequence number. Outputs are numbered by input sequence, so subscribers drop anything already seen.', nodes: ['repl', 'md'], err: ['me'], ok: ['repl'], badges: { repl: ['primary', 'ok'] }, tone: 'ok' },
        { text: 'Cold recovery works the same way: load the last <b>snapshot</b>, replay the journal from there. This only works because the engine reads <b>no wall clock, no randomness and no thread timing</b>.', nodes: ['jrnl', 'repl'], ok: ['jrnl'] }
      ]
    },
    {
      id: 'open', title: 'Market open: one hot symbol', tone: 'warn',
      steps: [
        { text: 'At the open, message rates jump many times over, and most of it lands on a handful of symbols.', flow: [['brk>gw', 'brk>gw', 'brk>gw'], 'gw>risk', 'risk>seq'], warn: ['seq'], badges: { gw: ['burst', 'warn'] }, tone: 'warn' },
        { text: 'Books are independent, so symbols are <b>spread over engine threads</b>. But one symbol has exactly one thread, and its per-message time budget is now tiny.', nodes: ['me'], warn: ['me'], badges: { me: ['hot book', 'warn'] } },
        { text: 'The <b>ring buffer</b> absorbs the burst. The consumer processes whatever has accumulated in one go (batching), which amortises the cost and lets it catch up.', nodes: ['seq', 'me'], badges: { seq: 'ring 64K slots' } },
        { text: 'Gateways enforce per-session message limits, so a runaway algorithm is throttled at the edge instead of slowing everyone in the queue.', nodes: ['gw'], ok: ['gw', 'me'], badges: { gw: ['throttle', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'md', title: 'Market data fan-out and gap recovery', tone: 'info',
      steps: [
        { text: 'Every book change becomes an ITCH message in a <b>sequenced UDP multicast</b> packet (MoldUDP64). One send reaches all subscribers.', flow: ['me>md', 'md>feed'], badges: { md: 'pkt seq 88,410' } },
        { text: 'UDP can drop packets. A subscriber sees seq 88,412 right after 88,410 and knows exactly what it missed.', nodes: ['feed'], warn: ['feed'], badges: { feed: ['gap: 88,411', 'warn'] }, tone: 'warn' },
        { text: 'It requests the missing range from a retransmission server, or takes a snapshot of the book and resumes from its sequence number.', flow: ['feed>md', 'md>feed'], ok: ['feed'], badges: { feed: ['recovered', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'The classic matching-engine decisions. Latency figures are order-of-magnitude <em>estimates</em> to show direction, not benchmarks.',
    controls: [
      { id: 'thread', label: 'Concurrency model', type: 'seg', value: 'single', options: [
        { v: 'locks', l: 'Thread pool + locks on the book' }, { v: 'single', l: 'One thread per book + ring buffer' }] },
      { id: 'persist', label: 'Durability', type: 'seg', value: 'journal', options: [
        { v: 'none', l: 'Memory only' }, { v: 'db', l: 'DB commit per order' }, { v: 'journal', l: 'Journal + replicate, replay' }] },
      { id: 'net', label: 'Network stack', type: 'seg', value: 'kernel', options: [
        { v: 'kernel', l: 'Kernel TCP/UDP' }, { v: 'bypass', l: 'Kernel bypass' }] },
      { id: 'md', label: 'Market data', type: 'seg', value: 'mcast', options: [
        { v: 'tcp', l: 'TCP per subscriber' }, { v: 'mcast', l: 'UDP multicast + retransmit' }] },
      { id: 'load', label: 'Peak load on the busiest book', type: 'range', min: 0.1, max: 8, step: 0.1, value: 1, fmt: (v) => v.toFixed(1) + ' M msg/s' }
    ],
    evaluate(s) {
      const single = s.thread === 'single';
      const cap = s.persist === 'db' ? 0.005 : single ? 6 : 0.6;           // M msg/s per book (illustrative; 6M from LMAX)
      const util = s.load / cap;
      const engineUs = single ? 2 : 15;
      const persistUs = { none: 0, db: 1000, journal: 20 }[s.persist];
      const netUs = s.net === 'bypass' ? 4 : 30;
      const p50 = engineUs + persistUs + netUs;
      const tail = (single ? 3 : 25) * (s.net === 'bypass' ? 1 : 2);
      const q = util >= 1 ? Infinity : 1 / (1 - util);
      const p999 = p50 * tail * Math.min(q, 1e6);
      const us = (x) => !isFinite(x) || x > 1e6 ? 'unbounded (queue grows)' : x >= 1000 ? (x / 1000).toFixed(1) + ' ms' : Math.round(x) + ' µs';
      const metrics = [
        { k: 'Order-to-ack p50', v: '≈ ' + us(p50), s: p50 < 40 ? 0.9 : p50 < 100 ? 0.65 : 0.15 },
        { k: 'Order-to-ack p99.9', v: util >= 1 ? 'unbounded (overloaded)' : '≈ ' + us(p999), s: util >= 1 ? 0.02 : p999 < 200 ? 0.9 : p999 < 2000 ? 0.5 : 0.15 },
        { k: 'Book capacity vs load', v: cap >= 1 ? cap + ' M/s · ' + Math.round(util * 100) + '% used' : Math.round(cap * 1e6).toLocaleString('en-US') + '/s · ' + (util >= 1 ? 'overloaded' : Math.round(util * 100) + '% used'), s: util >= 1 ? 0.05 : 1 - util * 0.9 },
        { k: 'Crash recovery', v: { none: 'state lost: every order gone', db: 'restart from DB (minutes)', journal: 'hot standby, seconds, zero loss' }[s.persist], s: { none: 0.02, db: 0.55, journal: 0.95 }[s.persist] },
        { k: 'Deterministic replay', v: single ? 'exact: same input → same trades' : 'no: depends on thread interleaving', s: single ? 0.95 : 0.2 },
        { k: 'Market-data fairness', v: s.md === 'mcast' ? 'same packet to everyone' : 'N sends; last subscriber is late', s: s.md === 'mcast' ? 0.9 : 0.25 },
        { k: 'Ops complexity', v: (s.net === 'bypass' ? 'NIC + CPU pinning tuning' : 'standard stack') + (s.persist === 'journal' ? ' · replication' : ''), s: 0.85 - (s.net === 'bypass' ? 0.3 : 0) - (s.persist === 'journal' ? 0.15 : 0) }
      ];
      const notes = [];
      if (!single) notes.push('Locks on the book serialise matching anyway, and add context switches and cache-line ping-pong. Worse, two threads can apply orders in a different order than they arrived, which breaks <b>price-time priority</b> and replay.');
      if (single) notes.push('LMAX ran all business logic for all markets on <b>one thread</b> and reported 6 million orders/s; input is journaled and replicated by separate consumers of the same ring buffer.');
      if (s.persist === 'db') notes.push('A database commit per order puts a disk flush and a network round trip inside every match. Throughput falls to thousands per second per book.');
      if (s.persist === 'none') notes.push('Without a journal, a crash loses every resting order and every acknowledgement you sent. No exchange can accept that.');
      if (s.persist === 'journal') notes.push('Journal + replicate the <i>input</i>, not the output. The book is a pure function of the input log, so a standby or a restart reaches the same state by replay.');
      if (s.net === 'bypass') notes.push('Kernel bypass hands packets from the NIC straight to user space, removing system calls and interrupts from the path. Big win at microsecond scale, pointless if a DB commit dominates.');
      if (s.md === 'tcp') notes.push('With TCP per subscriber, the exchange sends the same update N times, and whoever is last in the loop always sees prices later. Multicast plus sequence numbers and retransmission is the standard answer.');
      let verdict;
      if (s.persist === 'none') verdict = '❌ <b>A crash loses the order book.</b> Journal and replicate every input before acknowledging it.';
      else if (util >= 1) verdict = '❌ <b>The busiest book is overloaded.</b> Latency grows without bound. Remove the DB from the hot path or move symbols off this thread.';
      else if (s.persist === 'db') verdict = '⚠ <b>Durable but slow.</b> Per-order commits cap you at thousands of orders per second. Use a sequential journal and replay instead.';
      else if (!single) verdict = '⚠ <b>Fast-ish, but not fair or replayable.</b> Thread interleaving decides who is first. Use one thread per book.';
      else if (s.md === 'tcp') verdict = '⚠ <b>Matching is right, distribution is unfair.</b> Use multicast so everyone sees updates at the same time.';
      else if (s.net === 'bypass') verdict = '✅ <b>Exchange-grade:</b> sequencer, journaled input, one thread per book, kernel bypass and a multicast feed (the LMAX / INET family of designs).';
      else verdict = '👍 <b>Correct and fast.</b> Kernel bypass is the next step if you need lower tail latency.';
      const labels = {
        me: { label: 'Matching engine', sub: single ? 'one thread per book' : 'thread pool + locks' },
        jrnl: s.persist === 'db' ? { label: 'Order DB', sub: 'commit per order' } : { label: 'Journal', sub: 'append + replicate' },
        gw: { label: 'Order gateway', sub: s.net === 'bypass' ? 'kernel-bypass NIC' : 'kernel network stack' },
        md: { label: 'Market data', sub: s.md === 'mcast' ? 'ITCH · UDP multicast' : 'TCP per subscriber' }
      };
      const hide = s.persist === 'none' ? ['jrnl', 'repl'] : s.persist === 'db' ? ['repl'] : [];
      const flow = ['brk>gw', 'gw>risk', 'risk>seq'].concat(s.persist === 'none' ? [] : ['seq>jrnl']).concat(s.persist === 'journal' ? ['jrnl>repl'] : []).concat(['seq>me', 'me>md', 'md>feed', 'me>gw']);
      return {
        metrics, verdict, notes, labels, hide, flow,
        hot: single ? ['me'] : [],
        warn: (!single ? ['me'] : []).concat(s.md === 'tcp' ? ['md'] : []),
        err: (util >= 1 ? ['me'] : []).concat(s.persist === 'db' ? ['jrnl'] : []),
        badges: { me: [Math.round(util * 100) + '% busy', util >= 1 ? 'err' : util > 0.7 ? 'warn' : 'info'], gw: ['p50 ' + us(p50), 'info'] }
      };
    }
  },

  widget: {
    title: 'Live order book: price-time priority',
    caption: 'Bids (green) and asks (red) by price level. Each block is one resting order, oldest on the inside. <b>Tap a row</b> to set a price, choose side, type and size, and submit. Watch the engine walk the opposite side, fill the <b>oldest order at the best price first</b>, and print trades at the resting price. Turn on <b>random flow</b> to let the book churn.'
  },

  realWorld: {
    intro: 'Modern exchanges descend from a few influential systems. Island\'s engine became Nasdaq\'s INET, and LMAX made the single-threaded, event-sourced design famous.',
    timeline: [
      { when: '2002', who: 'Instinet · Island', title: 'Island ECN merges into Instinet', text: 'Instinet bought the Island ECN in an all-stock deal reported at about $500 million. The combined electronic market was branded <b>INET</b>.', src: 3 },
      { when: 'Apr 2005', who: 'Nasdaq', title: 'Nasdaq buys Instinet and keeps INET', text: 'Nasdaq agreed to acquire Instinet for about <b>$1.88 billion</b>, keeping the INET ECN. The Inet name lives on in Nasdaq trading platforms.', src: 4 },
      { when: 'Jul 2011', who: 'LMAX', title: 'The LMAX Architecture', text: 'Martin Fowler describes LMAX\'s <b>Business Logic Processor</b>: all trading logic for all markets on <b>one thread</b>, in memory and event-sourced, at <b>6 million orders per second</b> on a 3 GHz dual-socket quad-core Nehalem server. Input and output <b>Disruptors</b> handle journaling, replication and marshalling around it.', src: 0 },
      { when: '2011', who: 'LMAX', title: '"6M is the matching engine"', text: 'In the Hacker News discussion (Oct 2011), a commenter from LMAX clarified that the 6M figure is the matching engine\'s business-logic event processor, and that order matching and broker risk each run on their own <b>single business-logic thread</b>, on separate servers, connected by messaging.', src: 1 },
      { when: '2011 →', who: 'LMAX', title: 'Disruptor open-sourced', text: 'The Disruptor is a ring buffer for inter-thread messaging built around the <b>single-writer principle</b>. Consumers wait on <b>sequence barriers</b>, and a pluggable <b>wait strategy</b> trades CPU for latency.', src: 2 },
      { when: 'Today', who: 'Nasdaq', title: 'TotalView-ITCH order-level feed', text: 'Nasdaq publishes every order event (Add Order, executions, cancels) with a day-unique order reference number and <b>nanosecond timestamps</b>, over <b>MoldUDP64</b> multicast or SoupBinTCP. Subscribers rebuild the full book themselves.', src: 5 }
    ],
    lessons: [
      'Get <b>one total order</b> of events (a sequencer), then everything downstream can be deterministic.',
      'Keep the book in memory on <b>one thread</b>; durability comes from journaling the <i>input</i>.',
      'Replicate input to a <b>hot standby</b> that replays it; failover is just promotion.',
      'Publish market data as a <b>sequenced multicast</b> feed with gap recovery.'
    ],
    sources: [
      { title: 'The LMAX Architecture', url: 'https://www.martinfowler.com/articles/lmax.html', pub: 'Martin Fowler, 2011' },
      { title: 'Hacker News discussion of the LMAX architecture', url: 'https://news.ycombinator.com/item?id=3173993', pub: 'Hacker News, 2011' },
      { title: 'LMAX Disruptor User Guide', url: 'https://lmax-exchange.github.io/disruptor/user-guide', pub: 'LMAX Exchange' },
      { title: 'Instinet buys Island ECN in $500M deal', url: 'https://www.computerworld.com/article/1328588/instinet-buys-island-ecn-in-500m-deal.html', pub: 'Computerworld, 2002' },
      { title: 'Instinet in $1.88 Billion Merger with NASDAQ', url: 'https://www.clearygottlieb.com/news-and-insights/news-listing/instinet-in-%24188-billion-merger-with-nasdaq3', pub: 'Cleary Gottlieb, 2005' },
      { title: 'Nasdaq TotalView-ITCH specification', url: 'https://nasdaqtrader.com/content/technicalsupport/specifications/dataproducts/NQTVITCHspecification.pdf', pub: 'Nasdaq Trader' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Concurrency', '<b>One thread per book</b>: no locks, deterministic', '<b>Thread pool + locks</b>: familiar, uses more cores per book', 'Single thread for matching; parallelism across books and at the edges'],
      ['Durability', '<b>Journal input + replay</b>: sequential, fast', '<b>DB commit per order</b>: simple, slow', 'Journal for the hot path; DB for post-trade records'],
      ['Failover', '<b>Hot standby</b> replaying the same input', '<b>Cold restart</b> from snapshot + journal', 'Hot standby when downtime is measured in seconds'],
      ['Market data', '<b>UDP multicast</b> + retransmit: fair, scales to any number of subscribers', '<b>TCP per subscriber</b>: reliable, unfair, O(N) sends', 'Multicast for the public feed; TCP for snapshots and retransmits'],
      ['Price type', '<b>long ticks</b>: exact, fast compares', '<b>double</b>: convenient, rounding errors', 'Always integers for prices and quantities'],
      ['Network', '<b>Kernel bypass</b>: microseconds less per hop', '<b>Kernel stack</b>: simpler ops', 'Bypass only after everything else on the path is microsecond-scale']
    ]
  },
  failures: [
    { f: 'Engine host crashes', detect: 'Heartbeat loss from primary', fix: 'Promote the hot standby that replayed the same input; resume at the next sequence number.' },
    { f: 'Non-determinism creeps in', detect: 'Standby state hash differs from primary', fix: 'No wall clock, random or hash-iteration order in the engine; timestamps come from the sequencer.' },
    { f: 'Hot symbol saturates its thread', detect: 'Ring-buffer occupancy and per-book latency', fix: 'Move other symbols off that thread; per-session throttles at gateways.' },
    { f: 'Runaway algorithm floods orders', detect: 'Per-session message rate', fix: 'Gateway rate limits, kill switch per member, price bands in risk.' },
    { f: 'Market-data packet loss', detect: 'Sequence gaps at subscribers', fix: 'Retransmission service and snapshots; A/B redundant feeds.' },
    { f: 'Journal disk or replica slow', detect: 'Journal latency and replication lag', fix: 'Ack only after replication; fast sequential storage; alert before the ring fills.' }
  ],

  interview: [
    { q: 'Why run the matching engine on a single thread?', a: '<p>Matching on one book is inherently sequential: each order changes the book the next one sees. With locks, threads take turns anyway, but you also pay for contention, context switches and cache-line ping-pong.</p><p>One thread with all data in its own cache is faster, has <b>much lower jitter</b>, and is <b>deterministic</b>, which makes replay and hot standby possible. Scale by running different books on different threads.</p>', fu: 'What if one symbol needs more than one thread can do? (You cannot split one book; optimise the hot path and throttle at the edge.)', lvl: 'core' },
    { q: 'Explain price-time priority.', a: '<p>Better price wins first: highest bid, lowest ask. At the same price, the <b>earliest</b> order wins. A trade happens at the <b>resting</b> order\'s price.</p><p>Data structure: a sorted map of price levels (bids descending, asks ascending), each level a FIFO queue, plus a hash map from order id to order for O(1) cancel lookup.</p>', lvl: 'core' },
    { q: 'How do you survive a crash without losing determinism?', a: '<p>Make the engine a pure function of its input: <code>state = fold(apply, initial, sequenced_input)</code>. Journal and replicate the input <b>before</b> acknowledging it. A standby applying the same input reaches the same state. A restart loads a snapshot and replays from its sequence number.</p><p>Inside the engine: no wall-clock reads, no randomness, no iteration over unordered hash maps.</p>', lvl: 'deep' },
    { q: 'What does the sequencer give you?', a: '<p>A single <b>total order</b> of all events, with one timestamp source. It defines fairness (who was first), makes replay possible, lets every downstream consumer (engine, standby, market data, audit) agree, and gives subscribers sequence numbers to detect gaps.</p>', lvl: 'core' },
    { q: 'What is the LMAX Disruptor and why is it fast?', a: '<p>A pre-allocated <b>ring buffer</b> shared by producers and consumers. Each consumer tracks its own sequence; dependencies are expressed with <b>sequence barriers</b> (e.g. the matcher waits until the journaler and replicator have passed a slot).</p><p>It is fast because there are no locks on the main path, no allocation per message, padded counters avoid false sharing, and consumers process <b>batches</b> when they fall behind.</p>', lvl: 'deep' },
    { q: 'How do you distribute market data to thousands of subscribers fairly?', a: '<p><b>UDP multicast</b>: one packet, replicated by switches, reaches everyone at the same time. Each packet has a sequence number. On a gap, the subscriber asks a retransmission server for the missing range or takes a snapshot. Exchanges often send two identical feeds over separate paths (A/B) to reduce gaps.</p>', lvl: 'core' },
    { q: 'Where do pre-trade risk checks go, and how do you keep them fast?', a: '<p>Before the sequencer, on the critical path. Keep per-member limits <b>in memory</b>, and check price bands against a reference price. Credit usage must be updated in the same order as matching, so many designs run risk in the same deterministic, sequenced pipeline.</p>', lvl: 'deep' },
    { q: 'Market order, limit order, IOC: how does the engine treat them?', a: '<ul><li><b>Limit</b>: match while the opposite best price crosses, rest the remainder.</li><li><b>Market</b>: match at any price; the remainder is cancelled (exchanges usually add price protection).</li><li><b>IOC</b>: like limit but never rests; the remainder is cancelled.</li></ul>', lvl: 'core' },
    { q: 'Why store prices as integers?', a: '<p>Floating point cannot represent most decimal prices exactly, so 0.1 + 0.2 ≠ 0.3 and two "equal" prices can land on different levels. Use <code>long</code> ticks (e.g. price × 10,000) for prices and quantities. It is also faster to compare and hash.</p>', lvl: 'core' },
    { q: 'How do you test a matching engine?', a: '<p>Deterministic replay: record production input, replay it against a new build, and diff every output message. Add property tests (book never crossed after matching, quantities conserved, FIFO within a level) and latency tests with realistic bursts.</p>', lvl: 'deep' },
    { q: 'What does kernel bypass buy you?', a: '<p>Packets go from the NIC to user-space memory without system calls, interrupts or kernel copies. That removes microseconds and, more importantly, jitter from each hop. It only matters once the rest of the path is already microsecond-scale.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Java: order book with TreeMap and FIFO levels', lang: 'java',
      code: `public final class OrderBook {
  public record Fill(long takerId, long makerId, long price, long qty) {}
  private static final class Order {
    final long id, price; final boolean buy; long qty;
    Order(long id, boolean buy, long price, long qty) { this.id = id; this.buy = buy; this.price = price; this.qty = qty; }
  }
  // best price first; each level is FIFO = time priority. Prices are long ticks, never double.
  private final TreeMap<Long, ArrayDeque<Order>> bids = new TreeMap<>(Comparator.reverseOrder());
  private final TreeMap<Long, ArrayDeque<Order>> asks = new TreeMap<>();
  private final Map<Long, Order> byId = new HashMap<>();

  /** Called by the single engine thread, in sequence order. Market orders ignore price. */
  public List<Fill> submit(long id, boolean buy, long price, long qty, boolean market) {
    List<Fill> fills = new ArrayList<>();
    TreeMap<Long, ArrayDeque<Order>> other = buy ? asks : bids;
    while (qty > 0 && !other.isEmpty()) {
      Map.Entry<Long, ArrayDeque<Order>> best = other.firstEntry();
      if (!market && (buy ? best.getKey() > price : best.getKey() < price)) break;  // no cross
      ArrayDeque<Order> level = best.getValue();
      Order maker = level.peekFirst();                       // oldest order at the best price
      long q = Math.min(qty, maker.qty);
      fills.add(new Fill(id, maker.id, best.getKey(), q));    // trade at the resting price
      qty -= q; maker.qty -= q;
      if (maker.qty == 0) { level.pollFirst(); byId.remove(maker.id); }
      if (level.isEmpty()) other.pollFirstEntry();
    }
    if (qty > 0 && !market) {                                 // rest the remainder at the back
      Order o = new Order(id, buy, price, qty);
      (buy ? bids : asks).computeIfAbsent(price, p -> new ArrayDeque<>()).addLast(o);
      byId.put(id, o);
    }
    return fills;                                             // unfilled market remainder is dropped (IOC)
  }

  public boolean cancel(long id) {
    Order o = byId.remove(id);
    if (o == null) return false;                              // already filled: the fill won the race
    TreeMap<Long, ArrayDeque<Order>> side = o.buy ? bids : asks;
    ArrayDeque<Order> level = side.get(o.price);
    level.remove(o);                                          // O(level); real engines use intrusive lists
    if (level.isEmpty()) side.remove(o.price);
    return true;
  }
}`,
      note: 'Production engines replace <code>TreeMap</code> and boxed <code>Long</code> keys with arrays indexed by tick and object pools, so nothing allocates on the hot path. The logic stays the same.'
    },
    {
      title: 'Java: Disruptor pipeline (journal ∥ replicate → match)', lang: 'java',
      code: `// com.lmax:disruptor:4.0.0
public final class OrderEvent { long seq; byte[] payload; }

public final class EnginePipeline {
  private final Disruptor<OrderEvent> disruptor = new Disruptor<>(
      OrderEvent::new, 1 << 16,                       // pre-allocated slots, power of two
      DaemonThreadFactory.INSTANCE,
      ProducerType.SINGLE,                            // one sequencer thread publishes
      new BusySpinWaitStrategy());                    // lowest latency, burns a core

  public EnginePipeline(Journal journal, Replicator replicator, OrderBook book) {
    EventHandler<OrderEvent> journaler = (e, seq, endOfBatch) -> {
      journal.append(e.seq, e.payload);
      if (endOfBatch) journal.flush();                // one flush per batch, not per message
    };
    EventHandler<OrderEvent> replicate = (e, seq, endOfBatch) -> replicator.send(e.seq, e.payload);
    EventHandler<OrderEvent> matcher = (e, seq, endOfBatch) -> book.apply(Codec.decode(e.payload));

    disruptor.handleEventsWith(journaler, replicate)  // run in parallel...
             .then(matcher);                          // ...matcher waits for both (sequence barrier)
    disruptor.start();
  }

  public void publish(long seq, byte[] msg) {
    disruptor.getRingBuffer().publishEvent((e, s, m) -> { e.seq = seq; e.payload = m; }, msg);
  }
}`,
      note: '<code>Journal</code>, <code>Replicator</code> and <code>Codec</code> are your own classes, and <code>book.apply</code> is a decoded wrapper around <code>OrderBook.submit/cancel</code>. The matcher only sees a slot after it is durable and replicated, which is the LMAX ordering. Real systems copy the payload into the pre-allocated slot instead of storing a reference.'
    },
    {
      title: 'Python: detect gaps in a MoldUDP64 feed', lang: 'python',
      code: `import socket, struct

HDR = struct.Struct(">10sQH")        # session (10 bytes), sequence number, message count

def listen(group: str, port: int, on_message, request_retransmit):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("", port))
    mreq = struct.pack("4s4s", socket.inet_aton(group), socket.inet_aton("0.0.0.0"))
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
    expected = None
    while True:
        pkt = sock.recv(65535)
        session, seq, count = HDR.unpack_from(pkt)
        if expected is not None and seq > expected:
            request_retransmit(session, expected, seq - expected)   # missing range
        if expected is not None and seq + count <= expected:
            continue                                              # duplicate (A/B feed)
        off = HDR.size
        for i in range(count):
            (length,) = struct.unpack_from(">H", pkt, off)
            if expected is None or seq + i >= expected:
                on_message(seq + i, pkt[off + 2: off + 2 + length])
            off += 2 + length
        expected = seq + count`,
      note: 'Each message in a MoldUDP64 packet is prefixed by a 2-byte length, and the header sequence number is that of the first message. A real client buffers out-of-order packets until the retransmission arrives.'
    }
  ],

  related: ['message-queue', 'payment-gateway', 'upi-payments', 'unique-id', 'stream-analytics', 'distributed-cache']
});
