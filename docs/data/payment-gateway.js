SD.register({
  slug: 'payment-gateway',
  domain: 3,
  title: 'Payment Gateway & Wallet',
  examples: 'Stripe, Airbnb, PayPal',
  tagline: 'Move money <b>exactly once</b> over networks that time out, retry and crash halfway, and keep books that <b>always add up to zero</b>.',
  tldr: {
    problem: 'A charge crosses your API, your database and a card network you do not control. Any hop can fail <i>after</i> the money moved, and the client cannot tell. A naive retry charges the customer twice.',
    idea: 'Every mutating request carries an <b>idempotency key</b>. The server splits the work into <b>atomic phases</b> with saved <b>recovery points</b>, so a retry resumes instead of repeating. Money is recorded in an <b>append-only double-entry ledger</b>, and events leave through a <b>transactional outbox</b>.',
    insight: 'You cannot make the network reliable, but you can make every step <b>safe to repeat</b>. Then "retry until it works" is a correct strategy, and nightly <b>reconciliation</b> against the PSP catches whatever still slips through.',
    numbers: [
      { v: '24 h', l: 'minimum age before Stripe may prune an idempotency key (Stripe API docs)' },
      { v: 'Σ = 0', l: 'every ledger transaction nets to zero (double-entry invariant)' },
      { v: '~1.2 PB', l: 'compressed ledger records Uber moved to LedgerStore (Uber, 2024)' }
    ]
  },

  intro: {
    what: 'A payment gateway takes money from a customer\'s card or wallet and moves it to the seller. It talks to banks and card networks for you. It also keeps a <b>ledger</b>, a permanent record of every amount that moved, so <b>the books always add up</b>.',
    analogy: {
      icon: '🧾',
      title: 'A bank teller with a numbered receipt book',
      text: 'A careful teller gives every request a numbered slip. If you come back and ask "did my deposit go through?", they look up the slip and show you the stamped receipt instead of taking your money again. Every transfer is written twice in the bank\'s book: taken from one account and added to another, so the columns always balance. The gateway does the same, with an idempotency key as the slip number and a double-entry ledger as the book.'
    },
    problem: 'You tap <b>Pay</b> for a ₹2,000 order. The bank approves the charge, but your phone loses signal before the answer arrives. Did it work? If the app simply tries again, you may be <b>charged twice</b>. If it gives up, the shop may never record your payment. The system answers <b>"how do we move money exactly once, and prove where every rupee went?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'Call the bank, then update a balance',
        text: 'The app sends "charge this card". The server calls the card network, waits for "approved", then adds the amount to the shop\'s <b>balance</b> column. If anything times out, the app just tries again.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Customer app', sub: 'Pay ₹2,000', kind: 'client', at: [70, 0] },
            { id: 'net', label: 'Card network', sub: 'customer\'s bank', kind: 'external', at: [350, 0] },
            { id: 'pay', label: 'Payment server', sub: 'charge, then save', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Balances DB', sub: 'shop += ₹2,000', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'cli', to: 'pay' }, { from: 'pay', to: 'net' }, { from: 'pay', to: 'db' }],
          flow: ['cli>pay', 'pay>net', 'net>pay', 'pay>db']
        }
      },
      {
        stage: 'breaks',
        title: 'A lost reply turns one payment into two',
        text: 'The bank approves, but the reply is lost on the way back. The app sees a timeout and retries, so the bank <b>charges the card again</b>. If the server crashes between the bank call and the save, the money moved but your records show nothing. A balance that is simply overwritten cannot tell you which one happened.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Customer app', sub: 'timeout → retry', kind: 'client', at: [70, 0] },
            { id: 'net', label: 'Card network', sub: 'charged again', kind: 'external', at: [350, 0] },
            { id: 'pay', label: 'Payment server', sub: 'no memory', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Balances DB', sub: 'does not match', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'cli', to: 'pay' }, { from: 'pay', to: 'net' }, { from: 'pay', to: 'db' }],
          flow: ['cli>pay', 'pay>net', 'cli>pay', 'pay>net'],
          err: ['net'],
          warn: ['cli', 'db'],
          badges: { net: ['2 charges', 'err'], cli: ['timeout', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Number every payment and write money in a ledger',
        text: 'The app sends an <b>idempotency key</b>, a unique id for this one payment, and reuses it on every retry. The server saves its progress under that key, so a retry <b>picks up where it stopped</b> or returns the saved answer. Money is written as balanced entries in an append-only <b>ledger</b>, and a daily check compares it with the bank\'s own report.',
        scene: {
          nodes: [
            { id: 'cli', label: 'Customer app', sub: 'same key on retry', kind: 'client', at: [70, 0] },
            { id: 'net', label: 'Card network', sub: 'same key = once', kind: 'external', at: [350, 0] },
            { id: 'pay', label: 'Payment server', sub: 'resumes by key', kind: 'service', at: [210, 110] },
            { id: 'keys', label: 'Key store', sub: 'progress + reply', kind: 'store', at: [70, 220] },
            { id: 'ledger', label: 'Ledger', sub: 'debits = credits', kind: 'store', at: [210, 220] },
            { id: 'recon', label: 'Daily check', sub: 'ledger vs bank', kind: 'compute', at: [350, 220] }
          ],
          edges: [{ from: 'cli', to: 'pay' }, { from: 'pay', to: 'keys' }, { from: 'pay', to: 'net' }, { from: 'pay', to: 'ledger' }, { from: 'net', to: 'recon', dashed: true }, { from: 'recon', to: 'ledger', dashed: true }],
          flow: ['cli>pay', 'pay>keys', 'pay>net', 'pay>ledger'],
          ok: ['keys', 'ledger'],
          badges: { ledger: ['charged once ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['Stripe', 'PayPal', 'Adyen', 'Razorpay', 'Square', 'Airbnb (in-house payments)'],
    whenToUse: [
      'Your product moves <b>real money</b>: charges, refunds, payouts or wallet balances',
      'You call outside providers that can time out <b>after</b> doing the work',
      'You must show auditors where every amount came from and where it went'
    ],
    whenNot: [
      'You only sell a few things online: use a hosted checkout from an existing provider instead of building one',
      'You need the order around the payment, such as stock and shipping (see <a href="ecommerce-orders.html">E-commerce Orders</a>)',
      'Game points or loyalty scores that are not real money: a simple counter will do'
    ],
    glossary: [
      { term: 'PSP', def: 'Payment service provider: the company that connects you to card networks and banks.' },
      { term: 'Authorize / capture', def: 'Authorize reserves the money on the card; capture actually takes it, possibly later.' },
      { term: 'Idempotency key', def: 'A unique id the client sends with a request, so repeating the request has the same effect as sending it once.' },
      { term: 'Recovery point', def: 'A saved marker of how far a request got, so a retry can resume from there instead of starting over.' },
      { term: 'Double-entry ledger', def: 'A record where every transaction is a set of entries that sum to zero: money taken from one account is added to another.' },
      { term: 'Minor units', def: 'Storing money as whole numbers of the smallest unit (paise, cents) to avoid rounding errors.' },
      { term: 'Transactional outbox', def: 'Saving an event in the same database transaction as the change, then publishing it later, so neither is lost.' },
      { term: 'Reconciliation', def: 'Comparing your ledger with the provider\'s settlement report to find any payment that is missing or different.' }
    ]
  },

  requirements: {
    functional: [
      'Create a payment (authorize + capture) against a card or wallet',
      'Refunds and partial refunds',
      'Wallet top-up and wallet-to-wallet transfers',
      'Show balance and transaction history per account',
      'Notify merchants with webhooks when a payment changes state',
      'Daily settlement and reconciliation with each PSP'
    ],
    nonFunctional: [
      'Never charge twice for one intent (at-most-once money movement)',
      'Never lose a successful charge (durable before acknowledging)',
      'Ledger is immutable and auditable for years',
      'Books always balance: Σ debits = Σ credits',
      'p99 API latency dominated by the PSP (~hundreds of ms), not by us',
      'Degrade gracefully when one PSP is down'
    ],
    outOfScope: ['Card network internals (issuer auth, 3-D Secure UX)', 'Fraud model training', 'FX rate sourcing', 'Tax computation']
  },

  calculator: {
    inputs: [
      { id: 'tx', label: 'Payments per day', min: 100000, max: 1000000000, value: 20000000, log: true },
      { id: 'peak', label: 'Peak-to-average ratio (sale days)', min: 1, max: 10, step: 0.5, value: 4, unit: '×' },
      { id: 'entries', label: 'Ledger entries per payment', min: 2, max: 8, value: 3 },
      { id: 'bytes', label: 'Bytes per ledger entry (row + index)', min: 100, max: 600, step: 10, value: 200, fmt: 'bytes' },
      { id: 'ttl', label: 'Idempotency key retention', min: 1, max: 168, value: 24, unit: 'h' },
      { id: 'years', label: 'Ledger retention', min: 1, max: 10, value: 7, unit: 'years' }
    ],
    outputs: [
      { label: 'Peak payments / second', f: (v) => (v.tx / 86400) * v.peak },
      { label: 'Peak ledger inserts / second', f: (v) => (v.tx / 86400) * v.peak * v.entries },
      { label: 'Ledger growth per year', fmt: 'bytes', f: (v) => v.tx * v.entries * v.bytes * 365 },
      { label: 'Ledger over retention (RF = 3)', fmt: 'bytes', f: (v) => v.tx * v.entries * v.bytes * 365 * v.years * 3 },
      { label: 'Live idempotency keys', f: (v) => v.tx * (v.ttl / 24) },
      { label: 'Idempotency store (~2 KB/key incl. cached response)', fmt: 'bytes', f: (v) => v.tx * (v.ttl / 24) * 2000 }
    ],
    note: 'Volumes, byte sizes and the 2 KB per key are <em>estimates</em>. The 24 h key window matches Stripe\'s documented pruning. A 3-entry payment is e.g. PSP receivable / merchant payable / fee revenue. Notice that even 20M payments/day is only ~1K ledger inserts/s at peak: a well-indexed Postgres primary can take that. The hard part is <b>correctness</b>, not throughput.'
  },

  api: [
    { m: 'POST', p: '/v1/payments', d: 'Header <code>Idempotency-Key: &lt;uuid&gt;</code>. Body <code>{amount_minor, currency, source, merchant_id}</code>. A retry with the same key returns the <b>stored response</b>; the same key with a different body returns <code>409</code>.' },
    { m: 'POST', p: '/v1/payments/{id}/capture', d: 'Capture a previous authorization (also idempotent). Posts the ledger entries.' },
    { m: 'POST', p: '/v1/refunds', d: '<code>{payment_id, amount_minor}</code>. A refund is a <b>new</b> balanced transaction, never an edit of the old one.' },
    { m: 'POST', p: '/v1/transfers', d: 'Wallet A → wallet B. One transaction with a debit and a credit entry, committed together.' },
    { m: 'GET', p: '/v1/accounts/{id}/balance', d: 'Read from the balance projection. <code>?as_of=</code> recomputes from ledger entries for audits.' },
    { m: 'POST', p: '/webhooks/psp', d: 'Asynchronous PSP events (capture settled, chargeback). Deduplicated by the PSP\'s event id.' }
  ],
  dataModel: [
    { name: 'idempotency_keys', store: 'Postgres', fields: [['(user_id, idem_key)', 'unique', 'pk'], ['request_hash', 'bytea'], ['recovery_point', 'text'], ['locked_at', 'timestamptz'], ['response_code / body', 'int / jsonb'], ['created_at', 'timestamptz', 'idx']], note: 'Recovery point moves started → payment_created → psp_charged → finished. A reaper deletes rows older than the retention window.' },
    { name: 'ledger_entries', store: 'Postgres (append-only)', fields: [['entry_id', 'bigserial', 'pk'], ['txn_id', 'uuid', 'idx'], ['account_id', 'bigint', 'idx'], ['amount_minor', 'bigint (signed)'], ['currency', 'char(3)'], ['created_at', 'timestamptz']], note: 'Integer minor units, never floats. Σ amount per (txn_id, currency) = 0, checked at commit. No UPDATE or DELETE.' },
    { name: 'account_balances', store: 'Postgres / cache', fields: [['account_id', 'bigint', 'pk'], ['balance_minor', 'bigint'], ['last_entry_id', 'bigint'], ['version', 'int']], note: 'A projection derived from entries. It can always be rebuilt.' },
    { name: 'outbox', store: 'Postgres (same DB)', fields: [['id', 'bigserial', 'pk'], ['aggregate_id', 'uuid', 'idx'], ['event_type', 'text'], ['payload', 'jsonb'], ['published_at', 'timestamptz', 'idx']], note: 'Written in the same transaction as the ledger entries. A relay (poller or CDC) publishes to Kafka.' }
  ],

  architecture: {
    title: 'Payment gateway architecture',
    nodes: [
      { id: 'cli', label: 'Client / merchant', sub: 'sends Idempotency-Key', kind: 'client', wide: [90, 220], tall: [105, 0], tip: 'Generates a UUID per payment intent and reuses it on every retry of that intent.' },
      { id: 'api', label: 'Payments API', sub: 'auth · validation', kind: 'edge', wide: [280, 220], tall: [315, 0], tip: 'Authenticates, validates and checks the idempotency key before any work happens.' },
      { id: 'idem', label: 'Idempotency keys', sub: 'recovery points', kind: 'store', wide: [280, 330], tall: [350, 105], tip: 'One row per (user, key): request hash, current recovery point, lock and the stored response.' },
      { id: 'pay', label: 'Payment service', sub: 'state machine', kind: 'service', wide: [470, 220], tall: [210, 105], tip: 'Runs the payment as atomic phases. Each phase commits its local state together with the next recovery point.' },
      { id: 'risk', label: 'Risk / fraud', sub: 'score before charge', kind: 'ml', wide: [470, 110], tall: [70, 105], tip: 'Scores the payment synchronously (velocity, device, amount). Can block or require step-up auth.' },
      { id: 'psp', label: 'PSP adapter', sub: 'acquirer connectors', kind: 'service', wide: [660, 110], tall: [350, 210], tip: 'Talks to acquirers / PSPs. Passes its own idempotency key downstream, maps errors to retryable vs final, and has a circuit breaker per provider.' },
      { id: 'net', label: 'Card network', sub: 'issuer bank', kind: 'external', wide: [850, 110], tall: [350, 315], tip: 'Outside your control. It may approve the charge and still time out on the way back.' },
      { id: 'ledger', label: 'Ledger DB', sub: 'double-entry · append', kind: 'store', wide: [660, 330], tall: [70, 210], tip: 'Immutable entries in integer minor units. The payment row, ledger entries and outbox row commit in one transaction.' },
      { id: 'kfk', label: 'Kafka', sub: 'payment events', kind: 'queue', wide: [660, 440], tall: [70, 315], tip: 'Events relayed from the outbox. At-least-once, so every consumer dedupes by event id.' },
      { id: 'wal', label: 'Wallet balances', sub: 'derived projection', kind: 'cache', wide: [850, 440], tall: [70, 420], tip: 'Balance per account folded from ledger events. Rebuildable at any time from the ledger.' },
      { id: 'recon', label: 'Reconciliation', sub: 'daily vs PSP files', kind: 'compute', wide: [850, 250], tall: [210, 315], tip: 'Compares the PSP settlement file with the ledger: missing on either side, or amounts that differ.' }
    ],
    edges: [
      { from: 'cli', to: 'api', bidi: true },
      { from: 'api', to: 'idem', bidi: true },
      { from: 'api', to: 'pay' },
      { from: 'pay', to: 'risk' },
      { from: 'pay', to: 'psp', bidi: true },
      { from: 'psp', to: 'net', bidi: true },
      { from: 'pay', to: 'ledger' },
      { from: 'ledger', to: 'kfk', label: 'outbox' },
      { from: 'kfk', to: 'wal' },
      { from: 'psp', to: 'recon', dashed: true },
      { from: 'recon', to: 'ledger', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'charge', title: 'Charge with an idempotency key', tone: 'ok',
      steps: [
        { text: 'The client creates a UUID for this payment intent and sends <code>POST /v1/payments</code> with <code>Idempotency-Key</code>. It will reuse that key on every retry.', flow: ['cli>api'], badges: { cli: 'key k_7f3' } },
        { text: 'The API <b>inserts the key row</b> and locks it in one transaction: recovery point <code>started</code>, plus a hash of the request body.', flow: ['api>idem'], badges: { idem: 'started' } },
        { text: 'Phase 1 commits a <code>payments</code> row (status <code>PENDING</code>) and moves the key to <code>payment_created</code>. Risk scores the payment before any money moves.', flow: ['api>pay', 'pay>risk'], badges: { risk: 'score 0.02', idem: 'payment_created' } },
        { text: 'The PSP call happens <b>outside</b> any DB transaction, with the PSP\'s own idempotency key. The issuer approves.', flow: ['pay>psp', 'psp>net', 'net>psp'], badges: { net: ['approved', 'ok'] } },
        { text: 'Phase 2 commits <b>in one transaction</b>: payment = SUCCEEDED, three balanced ledger entries, an outbox row, and the key = <code>finished</code> with the response stored.', flow: ['psp>pay', 'pay>ledger', 'api>idem'], badges: { ledger: 'Σ = 0', idem: ['finished', 'ok'] }, tone: 'ok' },
        { text: 'The relay publishes the outbox row to Kafka. The wallet projection and merchant webhooks consume it. The client gets <code>201</code>.', flow: ['ledger>kfk', 'kfk>wal', 'api>cli'], ok: ['wal'] }
      ]
    },
    {
      id: 'retry', title: 'Timeout → retry returns the cached result', tone: 'warn',
      steps: [
        { text: 'The charge succeeds, but the response is lost on the way back (mobile network drop). The client sees a timeout and cannot know whether it was charged.', flow: ['cli>api', 'api>pay', 'pay>psp', 'psp>net'], err: ['cli'], badges: { cli: ['timeout', 'err'] }, tone: 'warn' },
        { text: 'The client retries after a backoff with jitter, using the <b>same key</b>.', flow: ['cli>api'], badges: { cli: 'retry #1 · same key' } },
        { text: 'The API finds the key at <code>finished</code> and the request hash matches. It returns the <b>stored response</b>. Nothing else runs.', flow: ['api>idem', 'idem>api', 'api>cli'], ok: ['idem'], badges: { idem: ['replay', 'ok'] }, tone: 'ok' },
        { text: 'If the retry had a <b>different body</b> with the same key, the API would answer <code>409</code>: a key names one intent, not one URL.', nodes: ['api', 'idem'], warn: ['api'], badges: { api: ['409 if body differs', 'warn'] } }
      ]
    },
    {
      id: 'crash', title: 'PSP charged, then our server crashed', tone: 'err',
      steps: [
        { text: 'The PSP approves the charge, and then our payment worker <b>crashes</b> before phase 2 commits. Money moved, but our ledger has nothing.', flow: ['pay>psp', 'psp>net'], err: ['pay'], badges: { pay: ['crashed', 'err'], net: ['charged', 'warn'] }, tone: 'err' },
        { text: 'The key row is still at <code>payment_created</code> with a stale lock. The client\'s retry (or a background <b>completer</b>) takes the lock after it expires.', flow: ['cli>api', 'api>idem'], warn: ['idem'], badges: { idem: ['payment_created · lock expired', 'warn'] } },
        { text: 'It resumes from the recovery point and calls the PSP again with the <b>same PSP idempotency key</b>. The PSP returns the original charge; nothing is charged twice.', flow: ['api>pay', 'pay>psp', 'psp>pay'], badges: { psp: 'same charge id' } },
        { text: 'Phase 2 now commits the ledger entries and finishes the key. The client gets the same answer as if nothing had failed.', flow: ['pay>ledger', 'api>idem'], ok: ['ledger', 'idem'], tone: 'ok' },
        { text: 'Safety net: the daily <b>reconciliation</b> compares the PSP settlement file with the ledger and flags any charge that still has no entries.', flow: ['psp>recon', 'recon>ledger'], badges: { recon: '0 mismatches' }, tone: 'ok' }
      ]
    },
    {
      id: 'wallet', title: 'Wallet transfer: balanced entries', tone: 'info',
      steps: [
        { text: 'Alice sends ₹500 to Bob from her wallet. The request carries an idempotency key like any other money movement.', flow: ['cli>api', 'api>idem', 'api>pay'] },
        { text: 'One DB transaction inserts <b>two entries</b>: Alice <code>+500</code> (debit: what we owe her goes down) and Bob <code>−500</code> (credit: what we owe him goes up). The pair sums to zero.', flow: ['pay>ledger'], badges: { ledger: '+500 / −500' } },
        { text: 'A deferred constraint checks Σ = 0 per transaction at <b>COMMIT</b>. An unbalanced transaction is rejected, so a bug cannot create or destroy money.', nodes: ['ledger'], ok: ['ledger'], badges: { ledger: ['Σ = 0 ✓', 'ok'] }, tone: 'ok' },
        { text: 'The outbox event updates both balances in the projection. Balances are a <b>cache of the ledger</b>, so they can be recomputed for any point in time.', flow: ['ledger>kfk', 'kfk>wal'], badges: { wal: 'A −500 · B +500' } }
      ]
    },
    {
      id: 'spike', title: 'Sale-day spike + PSP brown-out', tone: 'warn',
      steps: [
        { text: 'Traffic jumps 5× on a sale day. One large merchant takes most of the payments, so its account becomes a <b>hot row</b>.', flow: [['cli>api', 'cli>api'], 'api>pay', 'pay>ledger'], warn: ['ledger'], badges: { ledger: ['hot account', 'warn'] }, tone: 'warn' },
        { text: 'An <code>UPDATE balance = balance + x</code> would serialize every payment on that row lock. Append-only <b>inserts</b> do not contend; the balance is folded asynchronously or in batches.', nodes: ['ledger', 'wal'], ok: ['ledger'], badges: { wal: 'batched fold' } },
        { text: 'One acquirer starts timing out. The adapter\'s <b>circuit breaker</b> opens and new payments route to a second PSP. In-flight ones resume by key later.', flow: ['pay>psp', 'psp>net'], err: ['net'], badges: { psp: ['breaker open', 'warn'], net: ['timeouts', 'err'] }, tone: 'warn' },
        { text: 'Clients back off with <b>exponential delay + jitter</b>, so retries do not arrive in synchronized waves and the provider can recover.', flow: ['cli>api'], ok: ['psp'], badges: { cli: '1s · 2s · 4s ± jitter' }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Each control is a real design decision in a payments system. Set the timeout rate and watch double charges, audit quality and event safety change.',
    diagram: null, // built below: adds an outbox relay node
    controls: [
      { id: 'idem', label: 'Idempotency', type: 'seg', value: 'phases', options: [
        { v: 'off', l: 'None' }, { v: 'key', l: 'Key + cached response' }, { v: 'phases', l: 'Key + atomic phases' }] },
      { id: 'ledger', label: 'How money is recorded', type: 'seg', value: 'double', options: [
        { v: 'balance', l: 'Mutable balance column' }, { v: 'double', l: 'Double-entry ledger' }, { v: 'events', l: 'Event-sourced' }] },
      { id: 'publish', label: 'Publishing events', type: 'seg', value: 'outbox', options: [
        { v: 'dual', l: 'Dual write (DB, then Kafka)' }, { v: 'outbox', l: 'Transactional outbox' }] },
      { id: 'retry', label: 'Client retry policy', type: 'seg', value: 'backoff', options: [
        { v: 'none', l: 'No auto-retry' }, { v: 'immediate', l: '3 immediate retries' }, { v: 'backoff', l: 'Exp. backoff + jitter' }] },
      { id: 'timeout', label: 'Requests that time out', type: 'range', min: 0, max: 10, step: 0.5, value: 2, fmt: (v) => v + ' %' }
    ],
    evaluate(s) {
      const t = s.timeout / 100;
      // Illustrative model: half of timed-out requests actually completed at the PSP.
      const retried = { none: 0.25, immediate: 1, backoff: 1 }[s.retry]; // 'none' = users re-click
      const leak = { off: 1, key: 0.05, phases: 0 }[s.idem];           // 'key' leaks on crash mid-flight
      const dup = 1e6 * t * 0.5 * retried * leak;
      const userFail = t * { none: 1, immediate: 0.35, backoff: 0.05 }[s.retry];
      const load = { none: 1, immediate: 1 + 3 * Math.min(1, t * 10), backoff: 1 + 0.6 * Math.min(1, t * 10) }[s.retry];
      const L = {
        balance: { book: 'unprovable: no history', bs: 0.2, aud: 'overwritten in place', as: 0.15, hot: 'row lock per payment', hs: 0.3 },
        double: { book: 'Σ = 0 per txn, enforced', bs: 0.95, aud: 'immutable entries', as: 0.9, hot: 'inserts only, no lock', hs: 0.85 },
        events: { book: 'replayable, if events balance', bs: 0.75, aud: 'full event history', as: 0.95, hot: 'appends; reads fold', hs: 0.75 }
      }[s.ledger];
      const metrics = [
        { k: 'Double charges / 1M payments', v: dup < 0.5 ? '0' : '≈ ' + SD.fmt.num(dup), s: dup < 0.5 ? 1 : dup < 50 ? 0.5 : 0.1, hint: s.idem === 'off' ? 'no dedupe' : '' },
        { k: 'Payments failing for the user', v: (userFail * 100).toFixed(2) + ' %', s: userFail < 0.002 ? 0.95 : userFail < 0.01 ? 0.6 : 0.25 },
        { k: 'PSP load during a brown-out', v: load.toFixed(1) + '× normal', s: load < 1.3 ? 0.9 : load < 2 ? 0.6 : 0.2 },
        { k: 'Books provably balance', v: L.book, s: L.bs },
        { k: 'Audit trail', v: L.aud, s: L.as },
        { k: 'Hot-account throughput', v: L.hot, s: L.hs },
        { k: 'Events vs database', v: s.publish === 'dual' ? 'can diverge on crash' : 'never lost (at-least-once)', s: s.publish === 'dual' ? 0.25 : 0.9 }
      ];
      const notes = [];
      if (s.idem === 'off') notes.push('Without a key the server cannot tell a retry from a new payment. Every timeout that the client retries is a potential <b>double charge</b>.');
      if (s.idem === 'key') notes.push('Caching the final response fixes lost replies, but a crash <i>between</i> the PSP call and storing the response leaves the key half-done. Recovery points plus a PSP-side key close that gap.');
      if (s.idem === 'phases') notes.push('This is the pattern from Brandur Leach\'s post on Stripe-style keys: each phase is one DB transaction that also advances the recovery point.');
      if (s.ledger === 'balance') notes.push('<code>UPDATE balance</code> loses history. You cannot answer "what was the balance on 3 March, and why?" without a separate log, which is a ledger by another name.');
      if (s.ledger === 'events') notes.push('Event sourcing gives full history, but balances are folds over events. You still need snapshots and a balanced-transaction rule for every money event.');
      if (s.publish === 'dual') notes.push('If the process dies after the DB commit and before the Kafka send, the event is lost. Sending first and then failing the commit creates a <b>phantom</b> event.');
      if (s.retry === 'immediate') notes.push('Immediate retries multiply load exactly when the provider is struggling. Add exponential backoff, jitter and a retry budget.');
      let verdict;
      if (s.idem === 'off' && dup >= 0.5) verdict = '❌ <b>Customers will be charged twice.</b> Add idempotency keys before anything else.';
      else if (s.ledger === 'balance') verdict = '⚠ <b>Money moves once, but you cannot prove where it went.</b> Use a double-entry ledger.';
      else if (s.publish === 'dual') verdict = '⚠ <b>Ledger and downstream events can disagree.</b> Use a transactional outbox.';
      else if (s.idem === 'phases' && s.ledger === 'double' && s.retry === 'backoff') verdict = '✅ <b>Close to what Stripe and Airbnb describe:</b> keyed atomic phases, a balanced append-only ledger, outbox events and polite retries.';
      else verdict = '👍 Workable. Check the meters to see which risk you are still carrying.';
      const flow = ['cli>api'].concat(s.idem === 'off' ? [] : ['api>idem']).concat(['api>pay', 'pay>psp', 'psp>net', 'pay>ledger'])
        .concat(s.publish === 'outbox' ? ['ledger>relay', 'relay>kfk'] : ['pay>kfk']).concat(['kfk>wal']);
      return {
        metrics, verdict, notes, flow,
        hide: [].concat(s.idem === 'off' ? ['idem'] : []).concat(s.publish === 'dual' ? ['relay'] : []),
        labels: {
          ledger: { balance: { label: 'Balances table', sub: 'UPDATE balance += x' }, double: { label: 'Ledger DB', sub: 'double-entry · append' }, events: { label: 'Event store', sub: 'append · fold to balance' } }[s.ledger],
          idem: { label: 'Idempotency keys', sub: s.idem === 'phases' ? 'recovery points' : 'cached response only' }
        },
        hot: s.publish === 'outbox' ? ['relay'] : [],
        warn: [].concat(s.ledger === 'balance' ? ['ledger'] : []).concat(s.publish === 'dual' ? ['kfk'] : []),
        err: s.idem === 'off' && dup >= 0.5 ? ['cli'] : [],
        badges: Object.assign({ psp: [load.toFixed(1) + '× load', load < 1.3 ? 'info' : load < 2 ? 'warn' : 'err'] }, dup >= 0.5 ? { cli: ['2× charged', 'err'] } : {})
      };
    }
  },

  widget: {
    title: 'Ledger T-accounts + idempotency key',
    caption: 'Press <b>Charge ₹100</b>. Each charge posts a balanced transaction to the T-accounts. Turn on <b>crash after PSP</b>, then <b>Retry same key</b> to watch the key resume from its recovery point. Turn idempotency <b>off</b> and retry to see a double charge.'
  },

  realWorld: {
    intro: 'The core ideas (keys, recovery points, balanced append-only ledgers, reconciliation) show up across Stripe, Airbnb, Square and Uber.',
    timeline: [
      { when: '2017', who: 'Stripe', title: 'Idempotency keys in the public API', text: 'Stripe explains why clients must retry and why retries are only safe with an <code>Idempotency-Key</code> header. The server stores the result of the first request and replays it. Clients should back off <b>exponentially with jitter</b>.', src: 0 },
      { when: 'Oct 2017', who: 'Brandur Leach', title: 'Atomic phases and recovery points', text: 'A reference design in Postgres: split a request into <b>atomic phases</b>, each one transaction that also advances a <b>recovery point</b> on the key row. Commit local state <i>before</i> calling a foreign service, so a retry resumes where it stopped.', src: 1 },
      { when: 'Ongoing', who: 'Stripe', title: 'Key rules in the API docs', text: 'Keys go in the <code>Idempotency-Key</code> header (up to 255 characters, V4 UUID suggested). Stripe saves the status code and body of the first request, <b>even if it failed</b>. Reusing a key with different parameters is an error. Keys can be pruned once they are at least <b>24 hours</b> old.', src: 2 },
      { when: '2019', who: 'Airbnb', title: 'Orpheus: avoiding double payments', text: 'Airbnb\'s idempotency library splits each request into <b>Pre-RPC, RPC and Post-RPC</b> phases, keeps network calls out of DB transactions, and classifies errors as retryable or not. It commits its own writes together with the service\'s writes using Java lambdas.', src: 3 },
      { when: 'Oct 2019', who: 'Square', title: 'Books: immutable double-entry service', text: 'Square describes <b>Books</b>, an <b>immutable double-entry accounting database service</b> for tracking financial transactions at scale.', src: 4 },
      { when: '2024', who: 'Uber', title: 'LedgerStore: trillions of indexes', text: 'Uber\'s <b>immutable</b> ledger store gives verifiable completeness. It uses strongly consistent indexes (two-phase commit writes) and eventually consistent ones built in the background. Uber migrated ledger data since 2017 (~<b>1.2 PB</b> compressed) off DynamoDB; InfoQ reports about <b>$6M a year</b> saved.', src: 5 }
    ],
    lessons: [
      'Treat every money-moving call as <b>retryable</b>, then make retries safe with keys.',
      'Never hold a DB transaction open across a network call. <b>Commit, call, commit</b>.',
      'Store money as <b>integers in minor units</b> in an append-only, balanced ledger.',
      'Balances are a <b>projection</b>. The entries are the truth.',
      'Reconcile with every external party, every day. Bugs you did not think of show up there.'
    ],
    sources: [
      { title: 'Designing robust and predictable APIs with idempotency', url: 'https://stripe.com/blog/idempotency', pub: 'Stripe Blog (Brandur Leach), 2017' },
      { title: 'Implementing Stripe-like Idempotency Keys in Postgres', url: 'https://brandur.org/idempotency-keys', pub: 'brandur.org, Oct 2017' },
      { title: 'Idempotent requests (API reference)', url: 'https://docs.stripe.com/api/idempotent_requests', pub: 'Stripe Docs' },
      { title: 'Avoiding Double Payments in a Distributed Payments System', url: 'https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb', pub: 'Airbnb Engineering, 2019' },
      { title: 'Books, an immutable double-entry accounting database service', url: 'https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/', pub: 'Square Developer Blog, Oct 2019' },
      { title: 'How LedgerStore Supports Trillions of Indexes at Uber', url: 'https://www.uber.com/us/en/blog/how-ledgerstore-supports-trillions-of-indexes/', pub: 'Uber Engineering, 2024' },
      { title: 'Uber migrates ledger data from DynamoDB to LedgerStore', url: 'https://www.infoq.com/news/2024/05/uber-dynamodb-ledgerstore', pub: 'InfoQ, May 2024' },
      { title: 'rocket-rides-atomic (reference implementation)', url: 'https://github.com/brandur/rocket-rides-atomic', pub: 'GitHub' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Retry safety', '<b>Cached response only</b>: simple', '<b>Atomic phases + recovery points</b>: survives crashes mid-flight', 'Phases whenever a foreign call (PSP, bank) sits in the middle'],
      ['Recording money', '<b>Balance column</b>: one row, easy reads', '<b>Double-entry ledger</b>: history, invariant, audit', 'Ledger for anything regulated; a balance column only as a cache'],
      ['Ledger shape', '<b>Double-entry rows</b> in SQL', '<b>Event sourcing</b>: domain events, folded', 'Rows for most teams; events when many projections need the history'],
      ['Publishing events', '<b>Dual write</b>: simple code', '<b>Transactional outbox</b> + relay/CDC', 'Outbox whenever the event matters (webhooks, balances)'],
      ['Cross-service consistency', '<b>2PC / XA</b>: atomic, blocking', '<b>Saga + compensation</b>: refunds, reversals', 'Sagas: a PSP will never join your 2PC anyway'],
      ['PSP strategy', '<b>Single PSP</b>: simple', '<b>Multi-PSP routing</b>: resilience, cost', 'Multi-PSP at scale or in markets with flaky acquirers']
    ]
  },
  failures: [
    { f: 'Client times out after a successful charge', detect: 'Retry arrives with an existing key', fix: 'Replay the stored response; never re-run a finished key.' },
    { f: 'Worker crashes between PSP call and commit', detect: 'Key stuck at a recovery point with an expired lock', fix: 'Completer resumes from the recovery point; PSP call is idempotent via its own key.' },
    { f: 'PSP and ledger disagree', detect: 'Daily reconciliation against settlement files', fix: 'Auto-post missing entries for known cases; route the rest to a finance ops queue.' },
    { f: 'Event lost between DB and Kafka', detect: 'Outbox rows with <code>published_at IS NULL</code> growing', fix: 'Outbox relay retries; consumers dedupe by event id.' },
    { f: 'Unbalanced transaction from a bug', detect: 'Deferred Σ = 0 constraint fails at commit', fix: 'Transaction is rejected; nothing is written. Alert and fix the posting rule.' },
    { f: 'Retry storm during PSP outage', detect: 'Error rate and latency per provider', fix: 'Circuit breaker, failover PSP, exponential backoff with jitter and a retry budget.' },
    { f: 'Hot merchant account', detect: 'Lock waits on one balance row', fix: 'Append entries only; fold balances in batches or shard sub-accounts.' }
  ],

  interview: [
    { q: 'How do you guarantee a customer is charged exactly once?', a: '<p>You can\'t get exactly-once delivery over a network, so aim for <b>at-most-once effect with at-least-once attempts</b>.</p><ul><li>The client sends an <b>idempotency key</b> per intent and retries with the same key.</li><li>The server stores the key with a request hash and, once done, the response.</li><li>Work is split into <b>atomic phases</b>; each commits local state and a recovery point.</li><li>The PSP call carries its own idempotency key, so repeating it is harmless.</li></ul><p>Reconciliation catches anything left over.</p>', fu: 'What if two retries with the same key arrive at once? (Row lock or <code>locked_at</code>: the second gets 409 and retries later.)', lvl: 'core' },
    { q: 'Why double-entry instead of a balance column?', a: '<p>Every transaction is a set of entries that <b>sums to zero</b>, so money is never created or lost by a bug: the database rejects unbalanced writes.</p><p>Entries are <b>immutable</b>, which gives a full audit trail and lets you compute any balance at any point in time. A balance column is just a cache of the ledger.</p>', lvl: 'core' },
    { q: 'Can you use floating point for money?', a: '<p>No. <code>0.1 + 0.2 ≠ 0.3</code> in binary floating point, and the errors add up over millions of rows.</p><p>Store <b>integer minor units</b> (<code>bigint</code> paise or cents) plus a currency code. Use <code>BigDecimal</code> / <code>Decimal</code> with explicit rounding only when computing fees or FX, then round once to minor units.</p>', lvl: 'core' },
    { q: 'Why not wrap the PSP call in a database transaction?', a: '<p>A remote call inside a transaction holds locks and a connection for hundreds of milliseconds, and a rollback cannot undo a charge that the PSP already made.</p><p>Instead: <b>commit, call, commit</b>. Record intent, call the PSP outside any transaction, then record the result. The recovery point tells a retry which step comes next.</p>', lvl: 'core' },
    { q: 'What is the transactional outbox pattern?', a: '<p>Write the event to an <code>outbox</code> table <b>in the same transaction</b> as the business change. A relay (poller or CDC such as Debezium) publishes outbox rows to Kafka and marks them sent.</p><p>The DB and the event stream can no longer disagree. Delivery is at-least-once, so consumers dedupe by event id.</p>', lvl: 'core' },
    { q: 'How does reconciliation work?', a: '<p>Each day, load the PSP\'s <b>settlement file</b> and join it with your ledger on the PSP charge id. Classify rows:</p><ul><li>at PSP, missing in ledger (crash after charge);</li><li>in ledger, missing at PSP (declined late, or never captured);</li><li>amount or currency mismatch;</li><li>fees that differ from contract.</li></ul><p>Auto-fix known patterns with new balanced entries; send the rest to a human queue.</p>', lvl: 'core' },
    { q: 'How do you handle a distributed transaction across your service and the PSP?', a: '<p>You can\'t run 2PC with a card network. Use a <b>saga</b>: a sequence of local steps, each with a <b>compensating</b> action (void an authorization, issue a refund).</p><p>An orchestrator (state machine) drives the steps, persists progress, and retries idempotently. Correctness comes from idempotent steps plus reconciliation.</p>', lvl: 'deep' },
    { q: 'How long do you keep idempotency keys, and what goes in them?', a: '<p>Long enough to cover realistic retries: Stripe documents pruning after at least <b>24 hours</b>. Store user/merchant scope, a hash of the request body, the recovery point, a lock timestamp, and the final status code and body.</p><p>A key reused with a different body is a client bug: return 409/422.</p>', lvl: 'deep' },
    { q: 'How do you make the ledger immutable, and how do you fix a mistake?', a: '<p>Revoke <code>UPDATE</code>/<code>DELETE</code> for the app role, and append only. A mistake is fixed with a <b>reversing transaction</b> plus a correct one, so the history shows both.</p><p>For tamper evidence, chain entry hashes or sign batches (Uber describes verifiable immutability in LedgerStore).</p>', lvl: 'deep' },
    { q: 'How do you scale the ledger when one merchant is very hot?', a: '<p>Inserts don\'t contend, so append entries without touching a balance row. Then:</p><ul><li>fold balances asynchronously or in micro-batches;</li><li>split a hot account into N sub-accounts and sum them for reads;</li><li>shard the ledger by account id; a transfer across shards becomes a saga with a clearing account.</li></ul>', lvl: 'deep' },
    { q: 'How do wallets check "sufficient funds" without races?', a: '<p>Debit with a <b>conditional write</b> inside the posting transaction, for example <code>UPDATE account_balances SET balance = balance - :x WHERE account_id = :a AND balance &gt;= :x</code>, and insert the entries in the same transaction. Zero rows updated means insufficient funds.</p><p>Or serialize per account with a row lock (<code>SELECT … FOR UPDATE</code>), which is simpler but limits a single hot wallet.</p>', lvl: 'deep' },
    { q: 'What retry policy should clients use?', a: '<p><b>Exponential backoff with jitter</b>, a cap on attempts, and only for retryable errors (timeouts, 5xx, 429). Never retry 4xx validation errors.</p><p>Jitter stops thousands of clients retrying in sync and knocking a recovering provider over again.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Postgres: keys + balanced, append-only ledger', lang: 'sql',
      code: `CREATE TABLE idempotency_keys (
  id             bigserial   PRIMARY KEY,
  user_id        bigint      NOT NULL,
  idem_key       text        NOT NULL CHECK (length(idem_key) <= 255),
  request_hash   bytea       NOT NULL,
  recovery_point text        NOT NULL DEFAULT 'started',
  locked_at      timestamptz,
  response_code  int,
  response_body  jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idem_key)
);

CREATE TABLE ledger_entries (
  entry_id    bigserial   PRIMARY KEY,
  txn_id      uuid        NOT NULL,
  account_id  bigint      NOT NULL,
  amount      bigint      NOT NULL CHECK (amount <> 0), -- minor units: +debit / -credit
  currency    char(3)     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ledger_entries (txn_id);
CREATE INDEX ON ledger_entries (account_id, entry_id);

-- every transaction must net to zero per currency, checked at COMMIT
CREATE FUNCTION check_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT sum(amount) FROM ledger_entries
       WHERE txn_id = NEW.txn_id AND currency = NEW.currency) <> 0 THEN
    RAISE EXCEPTION 'ledger txn % does not balance', NEW.txn_id;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER balanced AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_balanced();

REVOKE UPDATE, DELETE ON ledger_entries FROM payments_app;  -- append-only`,
      note: 'The constraint trigger runs at COMMIT, after all entries of the transaction are inserted.'
    },
    {
      title: 'Spring Boot: idempotent charge in atomic phases', lang: 'java',
      code: `@Service
public class ChargeService {
  private final JdbcClient jdbc;            // Spring Framework 6.1+
  private final TransactionTemplate tx;
  private final PspClient psp;
  private final LedgerPoster ledger;        // inserts balanced entries + outbox row
  // constructor injection omitted

  public StoredResponse charge(long userId, String key, ChargeRequest req) {
    // Phase 0: insert the key, or take its lock if it is free / stale
    IdemKey k = jdbc.sql("""
        INSERT INTO idempotency_keys (user_id, idem_key, request_hash, locked_at)
        VALUES (:u, :k, :h, now())
        ON CONFLICT (user_id, idem_key) DO UPDATE SET locked_at = now()
         WHERE idempotency_keys.locked_at IS NULL
            OR idempotency_keys.locked_at < now() - interval '60 seconds'
        RETURNING id, request_hash, recovery_point, response_code, response_body""")
      .param("u", userId).param("k", key).param("h", req.sha256())
      .query(IdemKey.class).optional()
      .orElseThrow(() -> new ConflictException("request in progress"));
    if (!Arrays.equals(k.requestHash(), req.sha256())) throw new ConflictException("key reused");
    if (k.at("finished")) return k.storedResponse();               // replay

    if (k.at("started")) tx.executeWithoutResult(s -> {            // Phase 1
      ledger.createPendingPayment(k.id(), req);
      jdbc.sql("UPDATE idempotency_keys SET recovery_point = 'payment_created' WHERE id = :id")
          .param("id", k.id()).update();
    });
    // Phase 2: foreign call OUTSIDE any transaction; PSP dedupes on its own key
    PspCharge c = psp.charge(req.amountMinor(), req.currency(), "pay-" + k.id());
    tx.executeWithoutResult(s -> {                                  // Phase 3
      ledger.postCharge(k.id(), c);       // balanced entries + outbox, same txn
      jdbc.sql("""
          UPDATE idempotency_keys SET recovery_point = 'finished', locked_at = NULL,
                 response_code = 201, response_body = CAST(:b AS jsonb) WHERE id = :id""")
        .param("b", c.toJson()).param("id", k.id()).update();
    });
    return new StoredResponse(201, c.toJson());
  }
}`,
      note: 'Error paths are trimmed: a final PSP decline should also store its response and finish the key, so retries get the same decline.'
    },
    {
      title: 'Python: daily reconciliation vs the PSP file', lang: 'python',
      code: `import csv
from decimal import Decimal
import psycopg  # psycopg 3

def reconcile(settlement_csv: str, day: str, dsn: str):
    psp: dict[str, int] = {}
    with open(settlement_csv, newline="") as f:
        for row in csv.DictReader(f):
            # "12.34" -> 1234 minor units, no floats anywhere
            psp[row["charge_id"]] = int(Decimal(row["amount"]) * 100)

    with psycopg.connect(dsn) as conn:
        ours = dict(conn.execute(
            """SELECT psp_charge_id, amount_minor FROM payments
                WHERE status = 'SUCCEEDED' AND settlement_date = %s""",
            (day,)).fetchall())

    return {
        "charged_not_booked": sorted(psp.keys() - ours.keys()),   # crash after PSP call
        "booked_not_charged": sorted(ours.keys() - psp.keys()),
        "amount_mismatch": sorted(k for k in psp.keys() & ours.keys()
                                  if psp[k] != ours[k]),
    }`,
      note: 'Assumes a two-decimal currency. Use the currency\'s exponent (e.g. 0 for JPY) in real code.'
    }
  ],

  related: ['upi-payments', 'ecommerce-orders', 'ticket-booking', 'message-queue', 'distributed-sql', 'rate-limiter']
});

/* knobs diagram = architecture + an outbox relay between the ledger and Kafka */
(function () {
  const d = SD.data;
  const a = d.architecture;
  const move = { kfk: { tall: [70, 420] }, wal: { tall: [210, 420] } };
  d.knobs.diagram = {
    title: a.title,
    nodes: a.nodes.map((n) => (move[n.id] ? Object.assign({}, n, move[n.id]) : n)).concat([
      { id: 'relay', label: 'Outbox relay', sub: 'poller / CDC', kind: 'service', wide: [470, 440], tall: [70, 315], tip: 'Reads committed outbox rows and publishes them to Kafka, then marks them sent.' }
    ]),
    edges: a.edges.filter((e) => !(e.from === 'ledger' && e.to === 'kfk')).concat([
      { from: 'ledger', to: 'relay' }, { from: 'relay', to: 'kfk' }
    ])
  };
})();
