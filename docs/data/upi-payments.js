SD.register({
  slug: 'upi-payments',
  domain: 3,
  title: 'UPI Real-Time Payments',
  examples: 'NPCI UPI, PhonePe, GPay',
  tagline: 'Move money between <b>any two of hundreds of banks</b> in a few seconds, around the clock, at billions of payments a month, and know what to do when a bank goes quiet halfway.',
  tldr: {
    problem: 'The payer\'s bank, the payee\'s bank and two apps all have to agree within seconds. Bank core systems are slow and sometimes down, and a timeout after the debit leaves money in an <b>unknown</b> state.',
    idea: 'A <b>central switch</b> (NPCI) routes every payment: it resolves the payee\'s address through the payee\'s app provider, asks the payer\'s bank to verify the PIN and debit, asks the payee\'s bank to credit, then returns one final status. Every hop carries the same <b>globally unique transaction id</b>.',
    insight: 'A timeout is not a failure. Never "retry" by sending a new payment: <b>check status on the same id</b>. If a debit has no matching credit, it is reversed (RBI: by T+1), and daily <b>reconciliation</b> against the switch\'s files catches anything left.',
    numbers: [
      { v: '24.07 B', l: 'UPI transactions in Sep 2026 (NPCI data, via DD News)' },
      { v: '15 s', l: 'pay API response limit since Jun 2025 (NPCI)' },
      { v: 'T+1', l: 'auto-reversal deadline if payee is not credited (RBI, 2019)' }
    ]
  },

  intro: {
    what: 'UPI (Unified Payments Interface) is India\'s system for sending money instantly from one bank account to another with a phone app. You pay to a simple address like <code>name@bank</code> or a QR code. A central <b>switch</b> run by NPCI connects all the apps and banks, so <b>any app can pay into any bank</b>, day or night.',
    analogy: {
      icon: '📮',
      title: 'One central sorting office every bank trusts',
      text: 'Imagine every bank agreed to send all transfer slips through one central sorting office. You hand your slip to any counter (your app). The office finds out where the receiver banks, asks your bank to take the money out and the receiver\'s bank to put it in, then stamps the slip "done" for both sides. The banks settle the totals between themselves later. Unlike a real post office, the whole trip has to finish in seconds.'
    },
    problem: 'You pay ₹500 at a tea stall by scanning a QR code. Your money is in one bank, the stall owner\'s is in another, and you each use a different app. Without a shared switch, every app would need a direct link to every bank. And if the stall owner\'s bank goes quiet after your bank has taken the money, you must neither lose it nor pay twice. The system answers <b>"how does money move between any two banks in seconds, and what happens when one of them does not answer?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'Each app talks to each bank directly',
        text: 'The payer\'s app calls the payer\'s bank to take the money out, then calls the payee\'s bank to put it in. If a call times out, it tries again. With two or three banks this seems fine.',
        scene: {
          nodes: [
            { id: 'payer', label: 'Payer app', sub: 'pays ₹500', kind: 'client', at: [70, 0] },
            { id: 'payee', label: 'Payee app', sub: 'tea stall', kind: 'client', at: [350, 0] },
            { id: 'rem', label: 'Payer bank', sub: 'debit', kind: 'external', at: [70, 220] },
            { id: 'ben', label: 'Payee bank', sub: 'credit', kind: 'external', at: [350, 220] }
          ],
          edges: [{ from: 'payer', to: 'rem' }, { from: 'payer', to: 'ben' }, { from: 'payee', to: 'rem' }, { from: 'payee', to: 'ben' }],
          flow: ['payer>rem', 'payer>ben']
        }
      },
      {
        stage: 'breaks',
        title: 'A tangle of links, and money stuck halfway',
        text: 'Hundreds of banks times dozens of apps means <b>thousands of separate links</b>, each with its own rules. Worse, the debit can succeed while the credit times out. A blind retry <b>takes the money twice</b>; giving up leaves ₹500 missing. Nobody has the final word on what happened.',
        scene: {
          nodes: [
            { id: 'payer', label: 'Payer app', sub: 'retries ₹500', kind: 'client', at: [70, 0] },
            { id: 'payee', label: 'Payee app', sub: 'not paid', kind: 'client', at: [350, 0] },
            { id: 'rem', label: 'Payer bank', sub: '−₹500 twice', kind: 'external', at: [70, 220] },
            { id: 'ben', label: 'Payee bank', sub: 'no reply', kind: 'external', at: [350, 220] }
          ],
          edges: [{ from: 'payer', to: 'rem' }, { from: 'payer', to: 'ben' }, { from: 'payee', to: 'rem' }, { from: 'payee', to: 'ben' }],
          flow: ['payer>rem', 'payer>ben', 'payer>rem'],
          err: ['rem', 'ben'],
          warn: ['payer', 'payee'],
          badges: { rem: ['double debit', 'err'], ben: ['timeout', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'One central switch and one id per payment',
        text: 'Every app and bank connects once, to a <b>central switch</b>. The payment gets one <b>transaction id</b> that every hop carries. The switch asks the payer\'s bank to check the PIN and debit, asks the payee\'s bank to credit, then gives both sides one final answer. On a timeout, the app <b>checks status on the same id</b> instead of paying again, and a debit with no credit is reversed.',
        scene: {
          nodes: [
            { id: 'payer', label: 'Payer app', sub: 'txn id T1', kind: 'client', at: [70, 0] },
            { id: 'payee', label: 'Payee app', sub: 'gets ₹500', kind: 'client', at: [350, 0] },
            { id: 'npci', label: 'UPI switch', sub: 'routes T1', kind: 'edge', at: [210, 110] },
            { id: 'rem', label: 'Payer bank', sub: 'PIN + debit', kind: 'external', at: [70, 220] },
            { id: 'recon', label: 'Reconcile', sub: 'match every id', kind: 'compute', at: [210, 220] },
            { id: 'ben', label: 'Payee bank', sub: 'credit', kind: 'external', at: [350, 220] }
          ],
          edges: [{ from: 'payer', to: 'npci' }, { from: 'npci', to: 'payee' }, { from: 'npci', to: 'rem' }, { from: 'npci', to: 'ben' }, { from: 'npci', to: 'recon', dashed: true }],
          flow: ['payer>npci', 'npci>rem', 'npci>ben', ['npci>payer', 'npci>payee']],
          ok: ['npci', 'rem', 'ben'],
          badges: { npci: ['one answer ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['PhonePe', 'Google Pay (India)', 'Paytm', 'BHIM', 'Indian banks\' own mobile apps'],
    whenToUse: [
      'Many independent banks and apps must all be able to pay <b>each other</b>',
      'Payments must complete for the user in <b>seconds</b>, at any hour',
      'Each payment crosses systems you do not control, so every timeout needs a defined outcome'
    ],
    whenNot: [
      'One company moving money inside its own wallet: one ledger is enough (see <a href="payment-gateway.html">Payment Gateway</a>)',
      'Card payments, which run on card networks with their own rules',
      'Large business transfers that can wait for a scheduled batch'
    ],
    glossary: [
      { term: 'UPI ID (VPA)', def: 'A payment address like name@bank that stands in for an account number. VPA means virtual payment address.' },
      { term: 'PSP', def: 'Payment service provider: the app company and its partner bank that connect a user to UPI.' },
      { term: 'NPCI switch', def: 'The central system run by the National Payments Corporation of India that routes every UPI payment.' },
      { term: 'Debit / credit leg', def: 'The two halves of a payment: taking money from the payer\'s bank, and adding it at the payee\'s bank.' },
      { term: 'Transaction id', def: 'One unique id for a payment that every app, bank and the switch use to refer to it.' },
      { term: 'Status check', def: 'Asking the switch for the outcome of an existing transaction id, instead of sending a new payment.' },
      { term: 'Reversal', def: 'Returning a debit to the payer when the credit failed. RBI rules require it within one day of the payment (T+1).' },
      { term: 'Settlement', def: 'Banks paying each other the net totals of many UPI payments in periodic cycles, not one by one.' }
    ]
  },

  requirements: {
    functional: [
      'Pay to a UPI ID (VPA), QR code or mobile number',
      'Merchant collect requests, approved with the UPI PIN',
      'Link bank accounts; set and change the UPI PIN',
      'Transaction status and history',
      'Automatic reversal of failed debits; in-app disputes',
      'Notify payer and payee'
    ],
    nonFunctional: [
      'End-to-end in a few seconds, with hard per-API deadlines',
      'No double debit: one final state per transaction id',
      '24×7; one bank\'s outage must not hurt others',
      'Peak tens of thousands of TPS (festivals, salary days)',
      'Every rupee reconciled across PSP, switch and banks daily',
      'Fraud scoring inside the latency budget'
    ],
    outOfScope: ['Bank core-banking internals', 'Card and wallet rails', 'Interbank settlement mechanics at RBI', 'Merchant onboarding and KYC']
  },

  calculator: {
    inputs: [
      { id: 'monthly', label: 'Transactions per month', min: 1, max: 60, step: 0.5, value: 24, unit: 'billion' },
      { id: 'peak', label: 'Peak-to-average ratio', min: 1, max: 6, step: 0.5, value: 2.5, unit: '×' },
      { id: 'hops', label: 'Switch messages per payment (req + resp)', min: 4, max: 16, value: 10 },
      { id: 'chk', label: 'Payments that need a status check', min: 0, max: 20, step: 0.5, value: 2, unit: '%' },
      { id: 'bytes', label: 'Bytes per message (signed XML)', min: 1000, max: 8000, step: 500, value: 3000, fmt: 'bytes' },
      { id: 'row', label: 'Bytes per stored transaction (with audit)', min: 300, max: 5000, step: 100, value: 1200, fmt: 'bytes' }
    ],
    outputs: [
      { label: 'Average transactions / second', f: (v) => v.monthly * 1e9 / (30 * 86400) },
      { label: 'Peak transactions / second', f: (v) => v.monthly * 1e9 / (30 * 86400) * v.peak },
      { label: 'Switch messages / second at peak', f: (v) => v.monthly * 1e9 / (30 * 86400) * v.peak * v.hops },
      { label: 'Status-check calls / second at peak (≤ 3 each)', f: (v) => v.monthly * 1e9 / (30 * 86400) * v.peak * v.chk / 100 * 3 },
      { label: 'Switch traffic at peak', fmt: 'bytesps', f: (v) => v.monthly * 1e9 / (30 * 86400) * v.peak * v.hops * v.bytes },
      { label: 'Transaction storage per year (whole network)', fmt: 'bytes', f: (v) => v.monthly * 1e9 * 12 * v.row }
    ],
    note: 'The default of 24 billion a month is close to the 24.07 billion NPCI reported for September 2026, which averages about <b>9,300 TPS</b>. The peak ratio, hop count, message size and status-check rate are <em>estimates</em>. For comparison, PhonePe reported its own peak at about 22,000 TPS in the first half of FY26 (press report). Status checks look small, but if every PSP polls aggressively during an incident they become the incident.'
  },

  api: [
    { m: 'POST', p: 'app → PSP /v1/pay', d: '<code>{payee_vpa, amount, note, client_req_id, pin_block}</code>. The PIN block is encrypted on the device by NPCI\'s common library; the PSP never sees the PIN.' },
    { m: 'RPC', p: 'ReqValAdd / RespValAdd', d: 'Validate a UPI ID before paying and show the payee\'s registered name.' },
    { m: 'RPC', p: 'ReqPay / RespPay', d: 'The payment itself, carrying the transaction id end to end. NPCI fans it out as debit and credit legs to the two banks.' },
    { m: 'RPC', p: 'ReqAuthDetails / RespAuthDetails', d: 'Switch → payee\'s PSP: resolve the UPI ID to an account and IFSC.' },
    { m: 'RPC', p: 'ReqChkTxn / RespChkTxn', d: 'Status of an <b>existing</b> transaction id. Rate-limited by NPCI; never a substitute for idempotency.' },
    { m: 'GET', p: 'app → PSP /v1/txns/{client_req_id}', d: 'What the app polls after a spinner or app restart. Served from the PSP\'s transaction table.' }
  ],
  dataModel: [
    { name: 'upi_txn', store: 'PSP · Postgres (partitioned by day)', fields: [['txn_id', 'varchar(35)', 'pk'], ['client_req_id', 'text unique', 'idx'], ['payer_vpa, payee_vpa', 'text'], ['amount_paise', 'bigint'], ['status', 'INITIATED|PENDING|SUCCESS|FAILED|REVERSED'], ['rrn', 'varchar(12)', 'idx'], ['checks, next_check_at', 'int, timestamptz']], note: 'One row per payment. The unique client_req_id makes the app\'s retries harmless.' },
    { name: 'txn_events', store: 'PSP · append-only', fields: [['txn_id', 'varchar(35)', 'fk'], ['seq', 'int', 'pk'], ['type', 'ReqPay|RespPay|ChkTxn|Reversal'], ['payload_ref', 'object key'], ['ts', 'timestamptz']], note: 'Every message sent and received, for audit and disputes.' },
    { name: 'vpa_directory', store: 'Payee PSP', fields: [['vpa', 'text', 'pk'], ['account_ref', 'tokenised'], ['ifsc', 'text'], ['display_name', 'text'], ['status', 'active|blocked']], note: 'Answers ReqAuthDetails and ReqValAdd.' },
    { name: 'settlement_file', store: 'From NPCI per cycle', fields: [['txn_id', 'varchar(35)', 'idx'], ['rrn', 'varchar(12)'], ['amount_paise', 'bigint'], ['status', 'text'], ['cycle', 'date + cycle no.']], note: 'Joined against upi_txn to find mismatches.' }
  ],

  architecture: {
    title: 'UPI payment architecture',
    nodes: [
      { id: 'payer', label: 'Payer app', sub: 'PIN entry · QR scan', kind: 'client', wide: [90, 110], tall: [210, 0], tip: 'The UPI app. Encrypts the PIN on the device with NPCI\'s common library and sends a client request id with every attempt.' },
      { id: 'risk', label: 'Fraud / risk', sub: 'score in the budget', kind: 'ml', wide: [290, 0], tall: [70, 105], tip: 'Device, velocity and payee-reputation checks. Must answer in tens of milliseconds because the whole payment has a deadline.' },
      { id: 'ppsp', label: 'Payer PSP', sub: 'txn table · breakers', kind: 'service', wide: [290, 110], tall: [210, 105], tip: 'The payer\'s app provider with its sponsor bank. Creates the transaction id, stores it idempotently, talks to NPCI, polls status on timeouts.' },
      { id: 'pdb', label: 'PSP txn DB', sub: 'Postgres · unique ids', kind: 'store', wide: [290, 220], tall: [350, 105], tip: 'upi_txn and txn_events. The source of truth the app reads after a spinner.' },
      { id: 'npci', label: 'NPCI UPI switch', sub: 'route · debit · credit', kind: 'edge', wide: [500, 110], tall: [210, 210], tip: 'The central switch. Resolves the payee, orders the debit and credit legs, enforces deadlines, and returns one final status to both sides.' },
      { id: 'pepsp', label: 'Payee PSP', sub: 'resolves UPI ID', kind: 'service', wide: [710, 0], tall: [350, 210], tip: 'Owns the payee\'s UPI ID. Answers address resolution and receives the credit notification.' },
      { id: 'payee', label: 'Payee app', sub: 'merchant · friend', kind: 'client', wide: [910, 0], tall: [350, 315], tip: 'Gets the "received ₹500" notification, or raises merchant collect requests.' },
      { id: 'rem', label: 'Payer bank', sub: 'verify PIN · debit', kind: 'external', wide: [710, 110], tall: [70, 210], tip: 'The remitter bank. Verifies the encrypted PIN and debits the account in its core banking system.' },
      { id: 'ben', label: 'Payee bank', sub: 'credit', kind: 'external', wide: [710, 220], tall: [210, 315], tip: 'The beneficiary bank. Credits the account. If it cannot, RBI rules require a reversal by T+1.' },
      { id: 'recon', label: 'Recon & disputes', sub: 'files · reversals', kind: 'compute', wide: [500, 330], tall: [70, 315], tip: 'Matches every transaction across PSP, switch and banks per settlement cycle; drives reversals and dispute handling.' },
      { id: 'set', label: 'Settlement', sub: 'net, in cycles', kind: 'external', wide: [710, 330], tall: [70, 420], tip: 'Customers see money move instantly, but banks settle net positions with each other in periodic cycles through their RBI accounts.' }
    ],
    edges: [
      { from: 'payer', to: 'ppsp', bidi: true },
      { from: 'ppsp', to: 'risk' },
      { from: 'ppsp', to: 'pdb' },
      { from: 'ppsp', to: 'npci', bidi: true },
      { from: 'npci', to: 'pepsp', bidi: true },
      { from: 'pepsp', to: 'payee' },
      { from: 'npci', to: 'rem', bidi: true },
      { from: 'npci', to: 'ben', bidi: true },
      { from: 'npci', to: 'recon' },
      { from: 'recon', to: 'set' }
    ]
  },

  scenarios: [
    {
      id: 'push', title: 'Pay ₹500 to a UPI ID', tone: 'ok',
      steps: [
        { text: 'The payer enters <code>shop@bank</code> and ₹500, then the UPI PIN, which is encrypted <b>on the device</b>. The PSP scores risk and stores the transaction as <code>INITIATED</code> with a unique id.', flow: ['payer>ppsp', ['ppsp>risk', 'ppsp>pdb']], badges: { pdb: 'T1 INITIATED' } },
        { text: '<b>ReqPay</b> goes to the NPCI switch. The switch asks the payee\'s PSP to resolve the UPI ID to an account and IFSC.', flow: ['ppsp>npci', 'npci>pepsp', 'pepsp>npci'], badges: { pepsp: 'resolved' } },
        { text: '<b>Debit leg</b>: the payer\'s bank verifies the PIN and debits ₹500 in its core banking system.', flow: ['npci>rem', 'rem>npci'], badges: { rem: ['−₹500', 'ok'] } },
        { text: '<b>Credit leg</b>: the payee\'s bank credits ₹500.', flow: ['npci>ben', 'ben>npci'], badges: { ben: ['+₹500', 'ok'] }, tone: 'ok' },
        { text: 'The switch returns <b>SUCCESS</b> to the payer\'s PSP and notifies the payee\'s PSP. Both apps show the result within seconds.', flow: [['npci>ppsp', 'npci>pepsp'], ['ppsp>pdb', 'pepsp>payee'], 'ppsp>payer'], ok: ['payer', 'payee'], badges: { pdb: ['T1 SUCCESS', 'ok'] } },
        { text: 'Banks do <b>not</b> move money to each other per payment. NPCI nets positions and settles them in cycles; reconciliation matches every transaction id.', flow: ['npci>recon', 'recon>set'], badges: { set: 'net settle' } }
      ]
    },
    {
      id: 'collect', title: 'Merchant collect request', tone: 'info',
      steps: [
        { text: 'A merchant\'s PSP sends a <b>collect request</b> for ₹799 to the customer\'s UPI ID. (NPCI switched off <b>person-to-person</b> collect from 1 Oct 2025 to curb fraud; merchant collect remains.)', flow: ['payee>pepsp', 'pepsp>npci', 'npci>ppsp', 'ppsp>payer'], badges: { payer: 'approve ₹799?' } },
        { text: 'The customer sees the merchant\'s verified name and approves with the UPI PIN.', flow: ['payer>ppsp', 'ppsp>risk', 'ppsp>npci'], ok: ['risk'] },
        { text: 'From here it is the same as a push: debit leg, credit leg, final status to both sides.', flow: ['npci>rem', 'rem>npci', 'npci>ben', 'ben>npci', ['npci>ppsp', 'npci>pepsp']], ok: ['rem', 'ben'], tone: 'ok' },
        { text: 'If the customer ignores the request, it <b>expires</b>. Nothing was debited, so there is nothing to undo.', nodes: ['payer'], badges: { payer: 'expired' } }
      ]
    },
    {
      id: 'timeout', title: 'Credit times out after the debit', tone: 'err',
      steps: [
        { text: 'The debit succeeds, but the payee\'s bank does not answer the credit request before the deadline.', flow: ['ppsp>npci', 'npci>rem', 'rem>npci', 'npci>ben'], err: ['ben'], badges: { rem: '−₹500', ben: ['no reply', 'err'] }, tone: 'err' },
        { text: 'The switch tells the payer\'s PSP the outcome is <b>pending</b>. The app says "Payment pending. Do not pay again." It does <b>not</b> say failed: the credit may have happened.', flow: ['npci>ppsp', ['ppsp>pdb', 'ppsp>payer']], err: ['ben'], warn: ['payer'], badges: { pdb: ['T1 PENDING', 'warn'] } },
        { text: 'After a delay, the PSP sends <b>ReqChkTxn for the same T1</b>, a limited number of times with back-off. A new ReqPay would risk a second debit.', flow: ['ppsp>npci', 'npci>ppsp'], warn: ['ppsp'], badges: { ppsp: 'check 1 of 3' } },
        { text: 'The payee\'s bank confirms the credit failed. The ₹500 is <b>reversed</b> to the payer. RBI\'s rule: reverse by <b>T+1</b>, or pay ₹100 per day of delay.', flow: ['npci>rem', 'rem>npci', 'npci>ppsp', 'ppsp>payer'], ok: ['rem'], badges: { rem: ['+₹500 reversed', 'ok'] }, tone: 'ok' },
        { text: 'Anything still unresolved is caught by <b>reconciliation</b> against NPCI\'s settlement files, and the customer can raise an in-app dispute.', flow: ['npci>recon'], badges: { recon: 'exceptions: 0' } }
      ]
    },
    {
      id: 'bankdown', title: 'Payer bank down → fail fast', tone: 'warn',
      steps: [
        { text: 'Bank X\'s core banking system is degraded. Debit requests to it start timing out after many seconds.', flow: ['ppsp>npci', 'npci>rem'], err: ['rem'], badges: { rem: ['timeouts', 'err'] }, tone: 'warn' },
        { text: 'Without protection, every payment from a Bank X account holds a thread for the full deadline. Thread and connection pools fill, and payments to <b>healthy</b> banks slow down too.', nodes: ['ppsp', 'npci', 'rem'], err: ['rem'], warn: ['ppsp'], badges: { ppsp: ['pool 98%', 'warn'] } },
        { text: 'The PSP\'s <b>per-bank circuit breaker</b> opens after the failure rate crosses its threshold. New Bank X payments are declined in milliseconds: "Bank X is not responding, try another account".', flow: ['payer>ppsp', 'ppsp>payer'], err: ['rem'], ok: ['ppsp'], badges: { ppsp: ['X: OPEN', 'ok'] }, tone: 'ok' },
        { text: 'After a cool-down the breaker goes <b>half-open</b> and lets a few trial payments through. When they succeed it closes again.', flow: ['ppsp>npci', 'npci>rem', 'rem>npci'], ok: ['rem'], badges: { rem: ['recovered', 'ok'] } }
      ]
    },
    {
      id: 'festival', title: 'Festival peak and status-check storms', tone: 'warn',
      steps: [
        { text: 'Festival evening: traffic runs at several times the daily average across every bank and app.', flow: [['payer>ppsp', 'payer>ppsp', 'payer>ppsp'], 'ppsp>npci'], warn: ['npci'], badges: { npci: ['peak', 'warn'] }, tone: 'warn' },
        { text: 'PSPs pre-scale stateless tiers and keep the transaction table partitioned by day, so inserts stay on hot, small indexes.', nodes: ['ppsp', 'pdb'], ok: ['pdb'], badges: { pdb: 'partition today' } },
        { text: 'A slow bank causes pending transactions. If every PSP polls status aggressively, <b>status checks themselves</b> overload the switch. Press reports said NPCI traced 2025 disruptions to excessive check-status calls and tightened limits.', flow: [['ppsp>npci', 'ppsp>npci', 'ppsp>npci']], err: ['npci'], badges: { npci: ['ChkTxn flood', 'err'] } },
        { text: 'Fix: poll with <b>back-off and jitter</b>, respect the per-transaction limits, and leave the long tail to reconciliation. Faster deadlines (pay 30 → 15 s since June 2025) also free capacity sooner.', nodes: ['ppsp', 'npci', 'recon'], ok: ['npci'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'These are the choices a PSP (the app side) controls. One bank carries about 10% of traffic and you set how broken it is. Rates are illustrative.',
    controls: [
      { id: 'flow', label: 'Flow', type: 'seg', value: 'push', options: [
        { v: 'push', l: 'Push (pay to UPI ID / QR)' }, { v: 'collect', l: 'Collect (merchant request)' }] },
      { id: 'retry', label: 'On timeout, the app…', type: 'seg', value: 'status', options: [
        { v: 'newid', l: 'Sends a new ReqPay' }, { v: 'status', l: 'Checks status (same txn id)' }, { v: 'wait', l: 'Only waits for reconciliation' }] },
      { id: 'confirm', label: 'Final answer to the payer', type: 'seg', value: 'sync', options: [
        { v: 'sync', l: 'After credit confirmed' }, { v: 'async', l: 'After debit (credit later)' }] },
      { id: 'cb', label: 'Per-bank circuit breaker', type: 'seg', value: 'on', options: [
        { v: 'off', l: 'Off (timeouts only)' }, { v: 'on', l: 'On (Resilience4j)' }] },
      { id: 'outage', label: 'Bank X failure rate', type: 'range', min: 0, max: 100, step: 5, value: 40, unit: '%' }
    ],
    evaluate(s) {
      const o = s.outage / 100, share = 0.1, cb = s.cb === 'on';
      const collateral = cb ? 0 : share * o * 0.4;                       // pool exhaustion spills onto healthy banks
      const success = Math.max(0, 0.995 - share * o - collateral);
      const pendingPer10k = Math.round((s.confirm === 'async' ? 25 : 8) + o * (cb ? 10 : 60));
      const metrics = [
        { k: 'Success rate (all banks)', v: (success * 100).toFixed(1) + '%', s: Math.max(0, (success - 0.85) / 0.15) },
        { k: 'Time to fail on Bank X', v: cb && o >= 0.5 ? 'milliseconds (circuit open)' : o > 0 ? 'up to the 15 s deadline' : 'n/a', s: cb && o >= 0.5 ? 0.9 : o > 0 ? 0.25 : 0.9 },
        { k: 'Duplicate-debit risk', v: { newid: 'high: every retry is a new payment', status: 'none: same txn id', wait: 'none' }[s.retry], s: { newid: 0.05, status: 0.95, wait: 0.9 }[s.retry] },
        { k: 'User waiting on "pending"', v: { newid: 'short (but may pay twice)', status: 'minutes: resolved by status check', wait: 'hours: until reconciliation' }[s.retry], s: { newid: 0.6, status: 0.75, wait: 0.2 }[s.retry] },
        { k: 'Pending txns to resolve', v: '≈ ' + pendingPer10k + ' per 10K', s: Math.max(0.05, 1 - pendingPer10k / 70) },
        { k: 'Switch load from retries', v: { newid: 'full payments re-sent', status: '≤ 3 ChkTxn per pending txn', wait: 'none' }[s.retry], s: { newid: 0.2, status: 0.7, wait: 0.95 }[s.retry] },
        { k: 'Fraud exposure', v: s.flow === 'collect' ? 'higher: users tricked into approving' : 'lower: payer initiates', s: s.flow === 'collect' ? 0.45 : 0.85 }
      ];
      const notes = [];
      if (s.retry === 'newid') notes.push('A timeout after the debit means the money may already have moved. A new ReqPay with a new transaction id is a <b>second payment</b>; both can succeed.');
      if (s.retry === 'status') notes.push('ReqChkTxn on the <b>original</b> id is safe to repeat. Use back-off with jitter and stay within NPCI\'s limits on status checks.');
      if (s.retry === 'wait') notes.push('Safe, but the user stares at "pending" until the settlement cycle is reconciled. They will often pay again by another route.');
      if (s.confirm === 'async') notes.push('Answering after the debit feels faster, but every credit failure becomes a visible "paid but not received" case that needs a reversal (RBI: within T+1).');
      if (!cb && o > 0.2) notes.push('Without a breaker, Bank X payments hold threads for the full deadline. Pools fill and <b>healthy banks</b> fail too: about ' + (collateral * 100).toFixed(1) + ' points of collateral loss here.');
      if (cb && o > 0 && o < 0.5) notes.push('At ' + s.outage + '% failures the breaker (threshold 50%) stays <b>closed</b>, so Bank X payments still wait for the deadline. A slow-call threshold can open it earlier.');
      if (cb) notes.push('One breaker <b>per bank</b>, not one global breaker: Bank X opening must not block Bank Y. Ignore business declines (wrong PIN, low balance) when counting failures.');
      if (s.flow === 'collect') notes.push('NPCI stopped <b>person-to-person</b> collect from 1 Oct 2025 because scammers sent requests that victims approved by mistake. Merchant collect is still allowed.');
      let verdict;
      if (s.retry === 'newid') verdict = '❌ <b>Double debits on every ambiguous timeout.</b> Retry with a status check on the same transaction id.';
      else if (!cb && o >= 0.3) verdict = '⚠ <b>One sick bank is hurting everyone.</b> Add a per-bank circuit breaker so payments fail fast.';
      else if (s.retry === 'wait') verdict = '⚠ <b>Safe but painful.</b> Users wait hours. Add bounded status checks.';
      else if (s.confirm === 'async') verdict = '⚠ <b>Fast replies, more "paid but not received".</b> Prefer answering after the credit leg within the deadline.';
      else if (s.flow === 'push') verdict = '✅ <b>Robust PSP:</b> idempotent transaction table, status checks on the same id, a breaker per bank, and a final answer only after both legs.';
      else verdict = '👍 <b>Fine for merchants.</b> Show the verified merchant name prominently; collect is where social engineering happens.';
      const xOpen = cb && o >= 0.5;
      const labels = {
        rem: { label: 'Payer bank (X)', sub: o === 0 ? 'healthy' : xOpen ? 'circuit OPEN' : s.outage + '% failing' },
        ppsp: { label: 'Payer PSP', sub: { newid: 'retry = new ReqPay', status: 'retry = ChkTxn', wait: 'no retry' }[s.retry] }
      };
      const flow = s.flow === 'push'
        ? ['payer>ppsp', 'ppsp>npci', 'npci>pepsp', 'npci>rem', 'npci>ben', 'npci>ppsp']
        : ['payee>pepsp', 'pepsp>npci', 'npci>ppsp', 'ppsp>payer', 'payer>ppsp', 'ppsp>npci', 'npci>rem', 'npci>ben'];
      return {
        metrics, verdict, notes, labels, flow,
        hot: cb ? ['ppsp'] : [],
        warn: o > 0 && !xOpen ? ['rem'] : [],
        err: (s.retry === 'newid' ? ['pdb'] : []).concat(xOpen ? ['rem'] : []),
        badges: { rem: [xOpen ? 'fail fast' : s.outage + '% fail', o >= 0.5 ? 'err' : o > 0 ? 'warn' : 'ok'], pdb: [s.retry === 'newid' ? 'T1 + T2 !' : 'unique txn_id', s.retry === 'newid' ? 'err' : 'info'] }
      };
    }
  },

  widget: {
    title: 'UPI sequence diagram with failure injection',
    caption: 'Five parties, one ₹500 payment. Press <b>Pay</b> and watch each message hop. Then inject a failure: a bad UPI ID, a dead payer bank, a <b>credit timeout after the debit</b>, or a <b>lost response</b>. Switch the retry policy to see how "send a new payment" causes a double debit while "check status on the same id" does not.'
  },

  realWorld: {
    intro: 'UPI\'s rules come from the regulator and the switch operator; the engineering lessons come from apps running it at population scale.',
    timeline: [
      { when: 'Since 2016', who: 'NPCI', title: 'Pay and collect over a central switch', text: 'UPI connects many bank accounts behind one interface. A <b>pay request</b> pushes money to a payee; a <b>collect request</b> lets a payee pull money after the payer approves, using a virtual payment address instead of account details.', src: 6 },
      { when: 'Sep 2019', who: 'RBI', title: 'Turnaround times for failed transactions', text: 'RBI harmonised TATs across payment systems. For a UPI transfer where the account is debited but the beneficiary is not credited, the beneficiary bank must <b>auto-reverse by T+1</b>, or pay <b>₹100 per day</b> of delay, without waiting for a complaint. Merchant cases get T+5.', src: 0 },
      { when: 'Jun 2025', who: 'NPCI', title: 'Faster API deadlines', text: 'From 16 June 2025 NPCI cut the response time for pay requests from <b>30 s to 15 s</b>, and for check-status and reversal from 30 s to 10 s, so stuck transactions resolve sooner.', src: 1 },
      { when: 'Oct 2025', who: 'NPCI', title: 'Person-to-person collect switched off', text: 'An NPCI circular dated 29 July 2025 said P2P collect would no longer be processed from <b>1 October 2025</b>, closing a channel long abused for fraud. Merchant collect requests continue.', src: 2 },
      { when: 'H1 FY26', who: 'PhonePe', title: 'Peak of ~22K TPS for one app', text: 'Press coverage of PhonePe\'s IPO filing reported a platform peak of <b>22,369 transactions per second</b> in the first half of FY26, on an in-house stack.', src: 3 },
      { when: 'Aug 2026', who: 'NPCI', title: 'Record month: 24.51 billion', text: 'UPI processed a record <b>24.51 billion</b> transactions in August 2026.', src: 5 },
      { when: 'Sep 2026', who: 'NPCI', title: '24.07 billion, over 800 million a day', text: 'September 2026: <b>24.07 billion</b> transactions worth about <b>₹29.37 lakh crore</b>, roughly 23% more than a year earlier, and the first month averaging more than <b>800 million a day</b>.', src: 4 }
    ],
    lessons: [
      'A <b>globally unique transaction id</b> travels through every hop; retries reuse it.',
      'Model <b>pending</b> as a first-class state, resolved by status checks, reversal and reconciliation.',
      'Isolate each bank with its own <b>circuit breaker</b> and pools; one slow bank must not starve others.',
      'Retries and status checks are load too. <b>Back off</b>, or they become the outage.'
    ],
    sources: [
      { title: 'Harmonisation of Turn Around Time (TAT) and customer compensation for failed transactions using authorised Payment Systems', url: 'https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=11693&Mode=0', pub: 'Reserve Bank of India, Sep 2019' },
      { title: 'NPCI changes UPI transaction speed and fraud-prevention rules', url: 'https://www.medianama.com/2025/06/223-npci-upi-changes-transaction-speed-fraud-prevention/', pub: 'MediaNama, Jun 2025' },
      { title: 'NPCI to tighten UPI rules: peer-to-peer collect feature to end in October', url: 'https://www.businesstoday.in/personal-finance/banking/story/npci-to-tighten-upi-rules-peer-to-peer-collect-feature-to-end-in-october-489244-2025-08-13', pub: 'Business Today, Aug 2025' },
      { title: 'How PhonePe is using in-house technology stack to fix the profit puzzle as it prepares for IPO', url: 'https://indianstartupnews.com/news/how-phonepe-is-using-in-house-technology-stack-to-fix-the-profit-puzzle-as-it-prepares-for-ipo-11077019', pub: 'Indian Startup News' },
      { title: 'UPI transactions surge 23% to 24.07 billion in September: NPCI', url: 'https://ddindia.co.in/2026/10/upi-transactions-surge-23-to-24-07-billion-in-september-npci/', pub: 'DD News, Oct 2026' },
      { title: 'UPI hits highest-ever monthly volume: 24.51 billion transactions in August 2026', url: 'https://startuptalky.com/india-upi-transactions-august-2026-record-volume/', pub: 'StartupTalky, Sep 2026' },
      { title: 'UPI product overview', url: 'https://www.npci.org.in/what-we-do/upi/product-overview', pub: 'NPCI' },
      { title: 'UPI processes 24.07 billion transactions worth ₹29.37 lakh crore in September', url: 'https://www.outlookmoney.com/banking/upi-processes-2407-billion-transactions-worth-rs-2937-lakh-crore-in-september', pub: 'Outlook Money, Oct 2026' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Topology', '<b>Central switch</b>: N connections, one rulebook, netting', '<b>Bilateral bank links</b>: no central dependency, N² links', 'Central switch for a national retail system; it also hosts the address directory'],
      ['On timeout', '<b>Check status on the same id</b>: safe, adds load', '<b>New payment</b>: fast, risks double debit', 'Always status check; never re-pay on an unknown outcome'],
      ['Answer to payer', '<b>After the credit leg</b>: honest final state', '<b>After the debit</b>: faster, more reversals', 'After credit, within the deadline; pending if it expires'],
      ['Bank failures', '<b>Breaker per bank</b>: fail fast, isolated pools', '<b>Timeouts only</b>: simple, cascades under load', 'Per-bank breakers once you route to dozens of banks'],
      ['Pull payments', '<b>Collect</b>: good for bills and merchants', '<b>Push only</b>: far less social-engineering risk', 'Collect for verified merchants only (as UPI now does)'],
      ['Txn store', '<b>Postgres partitioned by day</b>: simple, fast inserts', '<b>Sharded by txn id hash</b>: more write capacity', 'Partition first; shard when one primary cannot take peak inserts']
    ]
  },
  failures: [
    { f: 'Credit times out after debit', detect: 'RespPay pending / deemed', fix: 'Status check on the same id; beneficiary reverses by T+1; reconciliation catches the rest.' },
    { f: 'Response lost on the way to the app', detect: 'App spinner times out; PSP has a final status', fix: 'App polls the PSP by client_req_id; never sends a new payment.' },
    { f: 'Payer bank CBS down', detect: 'Per-bank failure and slow-call rate', fix: 'Circuit breaker opens, fail fast with "try another account", half-open probes.' },
    { f: 'Status-check storm', detect: 'ChkTxn share of switch traffic spikes', fix: 'Back-off with jitter, hard per-txn limits, rely on reconciliation for the tail.' },
    { f: 'Duplicate tap / app retry', detect: 'Same client_req_id twice', fix: 'UNIQUE(client_req_id); return the original transaction.' },
    { f: 'Recon mismatch', detect: 'Row present on one side only, or status differs', fix: 'Exception queue, automatic reversal or adjustment, dispute workflow.' },
    { f: 'Collect-request fraud', detect: 'Complaints, unusual collect patterns', fix: 'P2P collect disabled; verified merchant names; risk scoring before PIN entry.' }
  ],

  interview: [
    { q: 'Why does UPI use a central switch instead of banks talking directly?', a: '<p>With N banks, bilateral links mean about N²/2 integrations, each with its own rules. A switch needs N connections, one message standard, one set of deadlines and dispute rules, a shared <b>address directory</b> (UPI IDs), and <b>net settlement</b> between banks.</p><p>The cost: the switch is critical infrastructure and must be extremely available.</p>', lvl: 'core' },
    { q: 'Walk through a push payment end to end.', a: '<ol><li>App: payee UPI ID, amount, PIN encrypted on device.</li><li>Payer PSP: risk score, store <code>INITIATED</code> with a unique id, send <b>ReqPay</b>.</li><li>Switch: resolve the UPI ID via the payee\'s PSP.</li><li>Payer bank: verify PIN, debit.</li><li>Payee bank: credit.</li><li>Switch: final status to both PSPs; apps update.</li><li>Later: net settlement and reconciliation.</li></ol>', lvl: 'core' },
    { q: 'How do you prevent a double debit across all these parties?', a: '<p>One <b>transaction id</b> created once by the payer\'s PSP and carried through every hop; each participant treats a repeat of the same id as the same payment. The app sends a <code>client_req_id</code> that is unique in the PSP\'s table, so a double tap returns the original.</p><p>On a timeout the PSP sends <b>ReqChkTxn</b> for that id, never a fresh ReqPay.</p>', fu: 'What if the app crashes after the PSP sent ReqPay? (The PSP owns the state; the app reads it back by client_req_id on restart.)', lvl: 'core' },
    { q: 'A payment is pending. What exactly happens next?', a: '<ul><li>Show "pending, do not pay again".</li><li>Poll status on the same id after a delay, a few times with back-off.</li><li>If the credit failed, the debit is reversed (RBI: by T+1, else ₹100/day compensation).</li><li>Anything still open is resolved in reconciliation against the switch\'s settlement file; the user can raise a dispute in-app.</li></ul>', lvl: 'core' },
    { q: 'How does reconciliation work?', a: '<p>Each settlement cycle the switch publishes a file of transactions and statuses. The PSP does a <b>full outer join</b> with its own table on transaction id and flags rows missing on either side, with different status, or different amount. Exceptions trigger reversals, adjustments or manual review. Banks do the same on their side.</p>', lvl: 'deep' },
    { q: 'One bank\'s core system is down. How do you protect everything else?', a: '<p>A <b>circuit breaker per bank</b> (e.g. Resilience4j): count failures and slow calls in a sliding window; above a threshold, open and reject instantly. After a cool-down, half-open lets a few probes through.</p><p>Also give each bank its own <b>bulkhead</b> (connection pool / thread limit), so a slow bank cannot exhaust shared resources.</p>', lvl: 'core' },
    { q: 'How do you scale for a festival peak?', a: '<ul><li>Pre-scale stateless services; do not wait for autoscaling.</li><li>Partition the transaction table by day; keep hot indexes small.</li><li>Move non-critical work (rewards, analytics, notifications) to async queues and shed it first.</li><li>Cap retries and status checks; they multiply load in exactly the moment you cannot afford it.</li></ul>', lvl: 'deep' },
    { q: 'How do you run fraud checks inside a seconds-long budget?', a: '<p>Most work happens <b>before</b> the payment: device binding, precomputed risk features and payee reputation in a fast store. At pay time, one in-memory model call with a strict timeout (tens of ms). If the scorer is slow, apply a conservative rule set rather than block the payment. Heavier analysis runs asynchronously and can freeze future payments.</p>', lvl: 'deep' },
    { q: 'Push vs collect: why did NPCI switch off P2P collect?', a: '<p>In a collect flow the <b>payee</b> starts the request and the payer only has to enter a PIN. Scammers sent requests ("enter PIN to receive money") that victims approved. From 1 Oct 2025 NPCI stopped processing person-to-person collect; merchant collect, with verified names, remains.</p>', lvl: 'core' },
    { q: 'Where is the UPI PIN checked, and why can the app not see it?', a: '<p>The PIN is captured and encrypted on the device by NPCI\'s common library, travels as an encrypted block through the PSP and switch, and is verified by the <b>payer\'s bank</b>, which owns the credential. The PSP never handles the clear PIN, which limits the damage if an app is compromised.</p>', lvl: 'deep' },
    { q: 'If credits are instant, how do banks actually pay each other?', a: '<p>The customer\'s account is credited in real time, but banks settle <b>net positions</b> with each other in periodic cycles through their accounts at the central bank. Between cycles, banks carry exposure to each other, which is why settlement cycles, limits and reconciliation matter.</p>', lvl: 'deep' },
    { q: 'Why are check-status calls rate-limited?', a: '<p>Each check is a request to the switch and often to a bank. During an incident, thousands of PSPs polling every few seconds multiply load on the very systems that are struggling. Press reports linked 2025 UPI disruptions to excessive status checks, after which NPCI tightened limits. Poll with back-off, cap attempts, and let reconciliation handle the tail.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Spring Boot: idempotent pay with a breaker per bank', lang: 'java',
      code: `// io.github.resilience4j:resilience4j-circuitbreaker:2.2.0
@Service
public class UpiPayService {
  private final JdbcTemplate jdbc;
  private final NpciClient npci;                      // signs and sends ReqPay; 15 s read timeout
  private final CircuitBreakerRegistry breakers = CircuitBreakerRegistry.of(CircuitBreakerConfig.custom()
      .slidingWindowSize(100).minimumNumberOfCalls(20)
      .failureRateThreshold(50)
      .slowCallDurationThreshold(Duration.ofSeconds(5)).slowCallRateThreshold(60)
      .waitDurationInOpenState(Duration.ofSeconds(30))
      .permittedNumberOfCallsInHalfOpenState(5)
      .ignoreExceptions(BusinessDeclineException.class)   // wrong PIN, low balance: bank is healthy
      .build());

  public UpiPayService(JdbcTemplate jdbc, NpciClient npci) { this.jdbc = jdbc; this.npci = npci; }

  public TxnStatus pay(String clientReqId, PayRequest r) {
    String txnId = "PSPX" + UUID.randomUUID().toString().replace("-", "").substring(0, 31); // 35 chars
    int created = jdbc.update("""
        INSERT INTO upi_txn(txn_id, client_req_id, payer_vpa, payee_vpa, payer_bank, amount_paise, status)
        VALUES (?, ?, ?, ?, ?, ?, 'INITIATED') ON CONFLICT (client_req_id) DO NOTHING""",
        txnId, clientReqId, r.payerVpa(), r.payeeVpa(), r.payerBank(), r.amountPaise());
    if (created == 0)                                     // app retried: report the original, never re-pay
      return TxnStatus.valueOf(jdbc.queryForObject(
          "SELECT status FROM upi_txn WHERE client_req_id = ?", String.class, clientReqId));

    CircuitBreaker cb = breakers.circuitBreaker("bank-" + r.payerBank());   // one breaker per bank
    try {
      RespPay resp = cb.executeSupplier(() -> npci.reqPay(txnId, r));
      return finish(txnId, resp.status());                // SUCCESS, FAILED or PENDING from the switch
    } catch (CallNotPermittedException open) {            // breaker open: nothing was sent, safe to fail
      return finish(txnId, TxnStatus.FAILED);
    } catch (BusinessDeclineException declined) {
      return finish(txnId, TxnStatus.FAILED);
    } catch (RuntimeException timeoutOrIo) {              // UNKNOWN: money may have moved
      return finish(txnId, TxnStatus.PENDING);            // resolved by ReqChkTxn on the same id
    }
  }

  private TxnStatus finish(String txnId, TxnStatus s) {
    jdbc.update("UPDATE upi_txn SET status = ?, updated_at = now() WHERE txn_id = ? AND status IN ('INITIATED', 'PENDING')",
        s.name(), txnId);
    return s;
  }
}`,
      note: '<code>NpciClient</code>, <code>PayRequest</code>, <code>RespPay</code>, <code>TxnStatus</code> and <code>BusinessDeclineException</code> (a <code>RuntimeException</code>) are your own types. Real PSPs also add a bulkhead per bank so a slow bank cannot use up every thread.'
    },
    {
      title: 'Spring Boot: bounded status checks with SKIP LOCKED', lang: 'java',
      code: `@Scheduled(fixedDelay = 5_000)
public void resolvePending() {
  // claim due PENDING rows; each claim schedules the next check with exponential back-off
  List<String> due = jdbc.queryForList("""
      UPDATE upi_txn
         SET checks = checks + 1,
             next_check_at = now() + make_interval(secs => 60 * power(2, checks))
       WHERE txn_id IN (SELECT txn_id FROM upi_txn
                         WHERE status = 'PENDING' AND checks < 3 AND next_check_at <= now()
                         ORDER BY next_check_at LIMIT 100
                         FOR UPDATE SKIP LOCKED)
      RETURNING txn_id""", String.class);

  for (String txnId : due) {
    try {
      RespChkTxn r = npci.checkStatus(txnId);             // same id as the original ReqPay
      if (r.isFinal())
        jdbc.update("UPDATE upi_txn SET status = ?, updated_at = now() WHERE txn_id = ? AND status = 'PENDING'",
            r.status().name(), txnId);
    } catch (RuntimeException stillUnknown) {
      // leave it PENDING; the next attempt follows the back-off, then reconciliation takes over
    }
  }
}`,
      note: 'Set <code>next_check_at</code> on insert to the first-check delay required by the current NPCI circular (reports describe a delay of roughly a minute or more and a cap of a few checks). After the cap, the transaction is settled by reconciliation and the T+1 reversal rule.'
    },
    {
      title: 'Postgres: transaction table and reconciliation', lang: 'sql',
      code: `CREATE TABLE upi_txn (
  txn_id        varchar(35) PRIMARY KEY,           -- unique end to end, PSP prefix
  client_req_id text        NOT NULL UNIQUE,       -- the app's idempotency key
  payer_vpa     text        NOT NULL,
  payee_vpa     text        NOT NULL,
  payer_bank    text        NOT NULL,
  amount_paise  bigint      NOT NULL CHECK (amount_paise > 0),
  status        text        NOT NULL,              -- INITIATED|PENDING|SUCCESS|FAILED|REVERSED
  rrn           varchar(12),
  checks        int         NOT NULL DEFAULT 0,
  next_check_at timestamptz NOT NULL DEFAULT now() + interval '90 seconds',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX upi_pending_due ON upi_txn (next_check_at) WHERE status = 'PENDING';

-- per settlement cycle: every row that disagrees with NPCI's file
WITH ours AS (
  SELECT txn_id, status, amount_paise FROM upi_txn
   WHERE created_at >= :from AND created_at < :to
), theirs AS (
  SELECT txn_id, status, amount_paise FROM npci_settlement_file WHERE cycle_id = :cycle
)
SELECT txn_id, o.status AS ours, t.status AS npci, o.amount_paise, t.amount_paise
  FROM ours o FULL JOIN theirs t USING (txn_id)
 WHERE o.txn_id IS NULL OR t.txn_id IS NULL
    OR o.status IS DISTINCT FROM t.status
    OR o.amount_paise IS DISTINCT FROM t.amount_paise;`,
      note: 'Rows missing on one side are usually timing (a transaction near the cycle boundary). Re-run with a wider window before raising an exception. At scale, declare the table <code>PARTITION BY RANGE (created_at)</code> per day; the primary key must then include <code>created_at</code>.'
    }
  ],

  related: ['payment-gateway', 'ecommerce-orders', 'rate-limiter', 'message-queue', 'stock-exchange', 'notifications']
});
