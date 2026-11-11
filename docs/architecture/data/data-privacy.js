(function () {
  const r1 = (x) => (x >= 100 ? Math.round(x).toLocaleString('en-US') : x.toFixed(1));

  SD.register({
    slug: 'data-privacy',
    domain: 7,
    title: 'Data Privacy & Regulation',
    examples: 'GDPR, DPDP Act, PCI-DSS',
    tagline: 'Design so that personal data is <b>known, minimised, protected and erasable</b>. Know where every copy lives, keep it in the right region, mask it in logs, and make "delete me" a workflow (or a destroyed key), not a ticket.',
    tldr: {
      problem: 'Personal data leaks into everything: service DBs, search indexes, caches, the warehouse, logs and backups. Laws such as <b>GDPR</b> and India\'s <b>DPDP Act</b> give people the right to have it erased and punish breaches and unlawful transfers. Nobody can erase what nobody has mapped.',
      idea: 'Treat privacy as an architecture property (GDPR <b>Art. 25</b>, "data protection by design and by default"): a <b>data inventory</b> with classification, <b>minimisation</b> at collection, <b>masking</b> and <b>tokenisation</b> at the edges, <b>regional cells</b> for residency, and an <b>erasure orchestrator</b> with an audit trail. Encrypt each subject\'s data with its own key so erasure can be <b>crypto-shredding</b>.',
      insight: 'Interviewers want to hear that deletion is a <b>distributed systems problem</b>: fan-out, retries, idempotency, lagging stores and backups that cannot be edited. And that <b>pseudonymised data is still personal data</b> (Recital 26); only truly anonymous data leaves GDPR scope.',
      numbers: [
        { v: '4% / €20M', l: 'GDPR Art. 83(5) cap: whichever is higher, of worldwide annual turnover' },
        { v: '72 h', l: 'GDPR Art. 33: notify the authority of a breach, where feasible' },
        { v: '€1.2B', l: 'Meta fine for EU→US transfers (Irish DPC, May 2023)' }
      ]
    },

    intro: {
      what: '<b>Data privacy engineering</b> is designing systems so that personal data is collected only for a stated purpose, kept only as long as needed, protected everywhere it goes, and removed when the person or the law asks. <b>Regulations</b> such as the EU\'s GDPR, California\'s CCPA/CPRA and India\'s DPDP Act turn those ideas into legal duties with fines.',
      analogy: {
        icon: '🏦',
        title: 'Safe-deposit boxes with one key each',
        text: 'A bank keeps each customer\'s valuables in a separate box with its own key. If a customer leaves, the bank does not hunt through every photocopy of the box list: it destroys that customer\'s key, and the box can never be opened again. Crypto-shredding works the same way: each person\'s data is encrypted with their own key, and destroying the key makes every copy unreadable, including copies in backups. The analogy breaks in one place: data that was ever copied <b>in plain text</b> (a log line, a search index, a spreadsheet export) is not in the box, so it must be found and deleted separately.'
      },
      problem: 'A user of a shopping app asks to be forgotten. Support deletes her row in the customer DB and closes the ticket. Her name is still in the search index, in last month\'s analytics tables, in 90 days of application logs and in 35 days of nightly backups. A year later a backup is restored after an incident and her account comes back. The question this page answers is <b>how do you design a system where "delete me" really means deleted, everywhere, provably and on time?</b>',
      story: [
        {
          stage: 'naive',
          title: 'Delete the row and close the ticket',
          text: 'Erasure is a <b>manual ticket</b>. An engineer runs <code>DELETE FROM customers WHERE id = 42</code> in the main database. It feels done: the profile page is gone.',
          scene: {
            nodes: [
              { id: 'u', label: 'Data subject', sub: '"forget me"', kind: 'client', at: [70, 0] },
              { id: 'op', label: 'Support ticket', sub: 'manual', kind: 'person', at: [210, 0] },
              { id: 'db', label: 'Customer DB', sub: 'row deleted', kind: 'store', at: [210, 110] },
              { id: 'idx', label: 'Search index', sub: 'still has her', kind: 'store', at: [70, 220] },
              { id: 'bk', label: 'Backups', sub: '35 days', kind: 'store', at: [350, 220] }
            ],
            edges: [{ from: 'u', to: 'op' }, { from: 'op', to: 'db' }, { from: 'db', to: 'idx', dashed: true }, { from: 'db', to: 'bk', dashed: true }],
            flow: ['u>op', 'op>db'],
            ok: ['db'],
            badges: { db: ['deleted', 'ok'] }
          }
        },
        {
          stage: 'breaks',
          title: 'Copies everywhere, and a backup brings her back',
          text: 'Her data was copied to search, the warehouse, logs and backups. Nobody had a <b>map of the copies</b>, so they survive. A backup restore after an outage silently <b>resurrects</b> the deleted row, and the regulator asks for proof of erasure you cannot give.',
          scene: {
            nodes: [
              { id: 'u', label: 'Data subject', sub: 'complains', kind: 'client', at: [70, 0] },
              { id: 'op', label: 'Support ticket', sub: 'closed ✓', kind: 'person', at: [210, 0] },
              { id: 'db', label: 'Customer DB', sub: 'row is back', kind: 'store', at: [210, 110] },
              { id: 'idx', label: 'Search index', sub: 'name + email', kind: 'store', at: [70, 220] },
              { id: 'bk', label: 'Backups', sub: 'restored', kind: 'store', at: [350, 220] }
            ],
            edges: [{ from: 'u', to: 'op' }, { from: 'op', to: 'db' }, { from: 'db', to: 'idx', dashed: true }, { from: 'bk', to: 'db' }],
            flow: ['bk>db', 'db>idx'],
            err: ['db', 'idx'], warn: ['bk'],
            badges: { db: ['resurrected', 'err'], bk: ['restore', 'warn'] }
          }
        },
        {
          stage: 'fix',
          title: 'Orchestrate the delete, shred the key',
          text: 'An <b>erasure orchestrator</b> looks up every store in the <b>data inventory</b>, sends an idempotent delete to each, and records each step in an <b>audit log</b>. Her fields were encrypted with a <b>per-subject key</b>; destroying it makes every remaining copy, backups included, unreadable at once.',
          scene: {
            nodes: [
              { id: 'u', label: 'Data subject', sub: 'request id', kind: 'client', at: [70, 0] },
              { id: 'op', label: 'Orchestrator', sub: 'fan-out + audit', kind: 'service', at: [210, 0] },
              { id: 'kms', label: 'Key vault', sub: 'key 42 destroyed', kind: 'policy', at: [350, 0] },
              { id: 'db', label: 'Customer DB', sub: 'ciphertext only', kind: 'store', at: [210, 110] },
              { id: 'idx', label: 'Search index', sub: 'doc deleted', kind: 'store', at: [70, 220] },
              { id: 'bk', label: 'Backups', sub: 'unreadable', kind: 'store', at: [350, 220] }
            ],
            edges: [{ from: 'u', to: 'op' }, { from: 'op', to: 'kms' }, { from: 'op', to: 'db' }, { from: 'op', to: 'idx' }, { from: 'kms', to: 'bk', dashed: true }],
            flow: ['u>op', ['op>kms', 'op>db', 'op>idx']],
            ok: ['db', 'idx', 'bk', 'kms'],
            badges: { kms: ['shredded', 'ok'], bk: ['no key', 'ok'] }
          }
        }
      ],
      usedBy: ['EU GDPR (applies to anyone offering services to people in the EU)', 'California CCPA / CPRA', 'India DPDP Act 2023', 'US HIPAA (health data)', 'PCI DSS (card payments)', 'Cloud KMS products (AWS KMS, Google Cloud KMS, Azure Key Vault)'],
      whenToUse: [
        'You store data about <b>identifiable people</b>: customers, employees, patients, card holders',
        'You serve users in jurisdictions with privacy law (EU, UK, California, India, …) or handle card or health data',
        'You are designing a platform where copies multiply: microservices, search, caches, a warehouse, ML features'
      ],
      whenNot: [
        'Data that is truly <b>anonymous</b> (cannot reasonably be linked to a person) is outside GDPR, but prove it first: most "anonymised" data is only pseudonymised',
        'Pure security hardening (patching, network policy) belongs to <a href="zero-trust.html">Zero Trust</a> and <a href="threat-modeling.html">Threat Modeling</a>',
        'Key rotation and secret storage details live in <a href="secrets-kms.html">Secrets & Key Management</a>'
      ],
      glossary: [
        { term: 'Personal data', def: 'Any information relating to an identified or identifiable natural person (GDPR Art. 4(1)); DPDP and CCPA use similar definitions.' },
        { term: 'Controller / Data Fiduciary', def: 'The organisation that decides why and how personal data is processed (GDPR "controller", DPDP "Data Fiduciary").' },
        { term: 'Pseudonymisation', def: 'Replacing identifiers so data cannot be tied to a person without extra information kept separately (Art. 4(5)); the data is still personal data.' },
        { term: 'Anonymisation', def: 'Processing so that a person is no longer identifiable by any means reasonably likely to be used (Recital 26); the result is outside GDPR.' },
        { term: 'Tokenisation', def: 'Swapping a sensitive value (a card number) for a random token, with the real value kept only in a secured vault.' },
        { term: 'Crypto-shredding', def: 'Encrypting data with a key and later destroying the key, so every copy of the ciphertext becomes unreadable.' },
        { term: 'Data residency', def: 'Keeping data stored (and often processed) inside a given country or region, by law, contract or choice.' },
        { term: 'Tombstone', def: 'A record that says "subject X was erased", replayed after restores so deleted data stays deleted.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Know your data</b>: an inventory of every store and field holding personal data, classified and with an owner and lineage',
        '<b>Minimise by default</b> (Art. 5(1)(c), Art. 25(2)): collect only what the purpose needs, default to the least sharing',
        '<b>Purpose and lawful basis</b> recorded per processing activity (Art. 6, Art. 30 records)',
        '<b>Protect everywhere</b>: TLS in transit, encryption at rest, masking in logs, tokens instead of raw card numbers',
        '<b>Rights as workflows</b>: access, correction, erasure and opt-out run through an orchestrator with an audit trail',
        '<b>Residency by design</b>: route and store each user\'s data in the region the law or contract requires'
      ],
      nonFunctional: [
        'Answer a data subject request within <b>one month</b> (GDPR Art. 12(3), extendable by two months for complex cases)',
        'Live systems erased in &lt; 7 days; backups unreadable or expired within the stated retention (<em>target, not law</em>)',
        'Breach assessed and authority notified within <b>72 h</b> where feasible (Art. 33)',
        '0 raw PII values in logs and traces (measured by a scanner in CI and on log samples)',
        'Card data environment shrunk to the tokenisation vault and payment edge (PCI DSS scope)',
        'Every erasure step auditable: who, what, when, result, without re-storing the erased data'
      ],
      outOfScope: [
        '<b>"Delete the main row"</b> erasure that ignores search, caches, analytics, logs and backups',
        '<b>Pseudonymised = anonymous</b>: hashing an email and calling the table out of scope',
        '<b>Log everything, scrub later</b>: raw request bodies with PII in log pipelines and third-party tools',
        '<b>Consent theatre</b>: banners that set tracking cookies before the user chooses',
        '<b>Region by accident</b>: replicating EU data to a US analytics cluster because it was the default'
      ]
    },

    calculator: {
      inputs: [
        { id: 'stores', label: 'Data stores holding PII', min: 3, max: 200, value: 25, log: true },
        { id: 'req', label: 'Erasure requests per month', min: 10, max: 100000, value: 2000, log: true, fmt: 'num' },
        { id: 'manual', label: 'Engineer minutes per store, manual', min: 2, max: 60, value: 10, unit: 'min' },
        { id: 'auto', label: 'Engineer minutes per store, automated (exceptions only)', min: 0, max: 5, value: 0.2, step: 0.1, unit: 'min' },
        { id: 'backup', label: 'Backup retention', min: 0, max: 400, value: 35, unit: 'days' },
        { id: 'team', label: 'Engineers available for erasure work', min: 0.5, max: 20, value: 2, step: 0.5, unit: 'FTE' }
      ],
      outputs: [
        { label: 'Engineer-hours / month, manual tickets', fmt: 'raw', f: (v) => r1(v.stores * v.req * v.manual / 60) + ' h (' + (v.stores * v.req * v.manual / 60 / 140).toFixed(1) + ' FTE)' },
        { label: 'Engineer-hours / month, orchestrated', fmt: 'raw', f: (v) => r1(v.stores * v.req * v.auto / 60) + ' h (' + (v.stores * v.req * v.auto / 60 / 140).toFixed(2) + ' FTE)' },
        { label: 'Manual: days to clear one month of requests', fmt: 'raw', f: (v) => { const d = v.stores * v.req * v.manual / 60 / (v.team * 140) * 30; return d > 999 ? 'never (backlog grows)' : Math.ceil(d) + ' days'; } },
        { label: 'GDPR one-month deadline (manual · orchestrated)', fmt: 'raw', f: (v) => { const m = v.stores * v.req * v.manual / 60 / (v.team * 140); const a = v.stores * v.req * v.auto / 60 / (v.team * 140); const t = (x) => (x <= 1 ? '✓ met' : '✗ backlog ' + Math.round((x - 1) * 100) + '%/mo'); return t(m) + ' · ' + t(a); } },
        { label: 'Worst case until gone from backups (delete · shred)', fmt: 'raw', f: (v) => v.backup + ' days · 0 days (key destroyed)' },
        { label: 'Subject copies alive in backups at any moment', fmt: 'raw', f: (v) => '≈ ' + Math.round(v.req * v.backup / 30).toLocaleString('en-US') + ' erased subjects still restorable' }
      ],
      note: 'Hours = stores × requests × minutes per store; one FTE ≈ 140 focused hours a month (<em>estimate</em>). "Manual" means a person checks and deletes in each store; "automated" counts only the human time to handle failed steps. With delete-based erasure a nightly full backup keeps a copy until it expires, so the worst case equals the retention. Regulators generally accept backups that are <b>put beyond use</b> and expire on schedule, provided restores replay the erasure ledger (<em>guidance varies by authority</em>). Crypto-shredding makes copies unreadable the moment the key is destroyed, as long as the key store itself is not kept in long-lived backups.'
    },

    api: [
      { m: 'DOC', p: 'Record of processing activities (Art. 30) + data inventory', d: 'Per dataset: purpose, lawful basis, categories of data and subjects, recipients, transfers, <b>retention</b>, security measures, owner, and the stores and fields where it lives (lineage).' },
      { m: 'POLICY', p: 'Data classification standard', d: 'Levels such as Public · Internal · Confidential · Restricted (special category, card, health, government IDs). Each level fixes encryption, masking, residency, retention and who may access.' },
      { m: 'HTTP', p: 'POST /privacy/requests  {type: "erasure", subject}', d: 'Verifies identity, records the request, starts the workflow, returns a request id and the legal deadline. Idempotent on <code>(subject, type, open)</code>.' },
      { m: 'EVENT', p: 'privacy.erasure.requested.v1', d: 'Published by the orchestrator; every service that owns personal data subscribes, deletes or anonymises, and replies with <code>erasure.step.completed</code> including counts, never the data.' },
      { m: 'YAML', p: 'retention.yaml (per dataset)', d: 'TTL per table, topic, index and log stream (e.g. app logs 30 d, backups 35 d, invoices 10 y for tax law). Enforced by jobs and storage lifecycle rules, checked in CI.' },
      { m: 'ADR', p: 'ADR-014: Crypto-shredding for customer PII', d: 'Per-subject data keys wrapped by a KMS key; which fields are encrypted; why search and caches still need explicit deletes; key-store backup policy; break-glass and recovery.' }
    ],
    dataModel: [
      { name: 'subject_key', store: 'Postgres (key schema, short backup retention)', fields: [['subject_id', 'uuid', 'pk'], ['wrapped_dek', 'bytea'], ['kek_id', 'text', 'idx'], ['created_at', 'timestamptz'], ['shredded_at', 'timestamptz']], note: 'One data-encryption key per person, stored wrapped by a KMS key. Crypto-shred = delete the row (and keep only the shredded marker).' },
      { name: 'erasure_request', store: 'Postgres (orchestrator)', fields: [['id', 'uuid', 'pk'], ['subject_ref', 'text (hashed)', 'idx'], ['received_at', 'timestamptz'], ['due_at', 'timestamptz', 'idx'], ['state', 'OPEN|IN_PROGRESS|DONE|EXEMPT|FAILED']], note: 'The deadline is computed at intake (one month under GDPR, 45 days under CCPA). Store a keyed hash of the subject, not the email.' },
      { name: 'erasure_step', store: 'Postgres (orchestrator)', fields: [['request_id', 'uuid', 'pk'], ['store', 'text', 'pk'], ['status', 'PENDING|DONE|RETRY|NOT_FOUND'], ['attempts', 'int'], ['rows_affected', 'int'], ['finished_at', 'timestamptz']], note: 'One row per (request, store). The primary key makes each step idempotent and the table is the audit evidence.' },
      { name: 'erasure_tombstone', store: 'Postgres / object store (append-only)', fields: [['subject_ref', 'text', 'pk'], ['erased_at', 'timestamptz'], ['request_id', 'uuid']], note: 'Replayed after any restore so resurrected rows are deleted again before the system reopens.' }
    ],

    architecture: {
      title: 'Privacy by design: erasure, keys, residency',
      nodes: [
        { id: 'user', label: 'Data subject', sub: 'app · privacy portal', kind: 'client', wide: [90, 60], tall: [70, 0], tip: 'The person the data is about. Requests access, correction, erasure, or withdraws consent.' },
        { id: 'gw', label: 'Edge + consent', sub: 'region router · CMP', kind: 'edge', wide: [280, 60], tall: [210, 0], tip: 'Routes each user to their home region cell and enforces the consent state (consent management platform) before any tracking or optional processing.' },
        { id: 'orch', label: 'Erasure orchestrator', sub: 'workflow · deadlines', kind: 'service', wide: [490, 60], tall: [210, 105], tip: 'Reads the data inventory, fans out one idempotent step per store, retries, tracks the legal deadline and writes the audit trail.' },
        { id: 'audit', label: 'Audit log', sub: 'append-only · no PII', kind: 'policy', wide: [700, 60], tall: [350, 0], tip: 'Evidence for the regulator: request id, store, timestamp, result, row counts. Never the erased data itself.' },
        { id: 'kms', label: 'Key vault', sub: 'per-subject DEKs', kind: 'policy', wide: [900, 175], tall: [350, 105], tip: 'Holds one data key per subject, wrapped by a KMS master key. Destroying a subject\'s key is crypto-shredding.' },
        { id: 'svc', label: 'Service DBs', sub: 'orders · profile', kind: 'store', wide: [90, 190], tall: [70, 210], tip: 'Systems of record. PII columns encrypted with the subject key; non-PII columns in clear.' },
        { id: 'search', label: 'Search index', sub: 'OpenSearch', kind: 'store', wide: [280, 190], tall: [210, 210], tip: 'Derived copy. Encrypted fields cannot be searched, so documents must be deleted by id (or indexed on tokens).' },
        { id: 'cache', label: 'Cache', sub: 'Redis · TTL', kind: 'cache', wide: [490, 190], tall: [350, 210], tip: 'Holds decrypted values for speed. Evict on erasure and keep TTLs short.' },
        { id: 'wh', label: 'Warehouse', sub: 'pseudonymised', kind: 'store', wide: [700, 190], tall: [210, 315], tip: 'Analytics with a pseudonymous key instead of email or name. Still personal data; deletes run as batch jobs.' },
        { id: 'bus', label: 'Event bus', sub: 'Kafka · CDC', kind: 'queue', wide: [90, 320], tall: [70, 315], tip: 'Carries changes to search and the warehouse. Topics have retention; compacted topics need tombstones (null values) for the key.' },
        { id: 'logs', label: 'Logs & traces', sub: 'masked at source', kind: 'store', wide: [490, 320], tall: [350, 315], tip: 'Mask PII before it leaves the process. Logs that are append-only can only expire, not be edited.' },
        { id: 'backup', label: 'Backups', sub: '35-day retention', kind: 'store', wide: [700, 320], tall: [210, 420], tip: 'Immutable snapshots. Rows inside cannot be deleted one by one; they expire, or become unreadable when the key is shredded.' }
      ],
      edges: [
        { from: 'user', to: 'gw' },
        { from: 'gw', to: 'svc' },
        { from: 'gw', to: 'orch' },
        { from: 'orch', to: 'audit' },
        { from: 'orch', to: 'kms' },
        { from: 'orch', to: 'search' },
        { from: 'orch', to: 'cache' },
        { from: 'orch', to: 'wh' },
        { from: 'orch', to: 'svc' },
        { from: 'kms', to: 'backup', dashed: true },
        { from: 'svc', to: 'bus' },
        { from: 'bus', to: 'search', dashed: true },
        { from: 'bus', to: 'logs', dashed: true, bend: 0.15 },
        { from: 'svc', to: 'backup', dashed: true, bend: -0.25 }
      ]
    },

    scenarios: [
      {
        id: 'erase', title: 'Erasure request, orchestrated', tone: 'info',
        steps: [
          { text: 'A user asks to be forgotten. The edge verifies identity and the orchestrator records the request with a <b>due date one month out</b> (GDPR Art. 12(3)).', flow: ['user>gw', 'gw>orch', 'orch>audit'], badges: { orch: 'due in 30 d', audit: 'OPEN' } },
          { text: 'It reads the <b>data inventory</b> and fans out one step per store: service DBs, search, cache, warehouse. Each step is keyed by <code>(request, store)</code> so retries are safe.', flow: [['orch>svc', 'orch>search', 'orch>cache', 'orch>wh']], badges: { orch: '4 steps' } },
          { text: 'Service DB and cache finish in seconds. Search deletes the doc. The warehouse job runs nightly, so its step stays <b>PENDING</b> until tomorrow.', nodes: ['svc', 'cache', 'search', 'wh'], ok: ['svc', 'cache', 'search'], warn: ['wh'], badges: { wh: ['nightly', 'warn'] } },
          { text: 'Logs were <b>masked at source</b>, so there is nothing to find there. Backups cannot be edited: the user is told they expire in 35 days and are never used for normal processing.', nodes: ['logs', 'backup'], warn: ['backup'], badges: { logs: ['no PII', 'ok'], backup: ['expires d+35', 'warn'] } },
          { text: 'All live steps <b>DONE</b>. The orchestrator writes a tombstone and closes the request with evidence: stores, timestamps, row counts, no personal data.', flow: ['orch>audit'], ok: ['audit'], badges: { audit: ['DONE · 2 d', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'shred', title: 'Crypto-shredding', tone: 'ok',
        steps: [
          { text: 'At sign-up the service asks the key vault for a <b>data key</b> for this subject. PII columns are encrypted with it; the key itself is stored only <b>wrapped</b> by a KMS master key.', flow: ['gw>svc', 'orch>kms'], badges: { kms: 'DEK #42' } },
          { text: 'Ciphertext flows on to CDC, the warehouse and nightly backups. None of them ever sees the key.', flow: ['svc>bus', 'svc>backup'], badges: { backup: 'ciphertext' } },
          { text: 'Erasure: the orchestrator <b>destroys key #42</b>. Every encrypted copy, in the DB, on the bus and in all 35 backups, is now unreadable noise.', flow: ['orch>kms', 'kms>backup'], ok: ['kms', 'backup', 'svc'], badges: { kms: ['shredded', 'ok'], backup: ['unreadable', 'ok'] }, tone: 'ok' },
          { text: 'It still deletes <b>plaintext</b> derivatives: the search document (you cannot full-text search ciphertext) and the cache entry. Shredding only covers what was encrypted.', flow: [['orch>search', 'orch>cache']], ok: ['search', 'cache'], badges: { search: 'deleted', cache: 'evicted' } },
          { text: 'Caveat: if the key table sits in the same 35-day backups, restoring it brings the key back. Keep keys in a KMS or a key store with <b>short, separate backups</b>.', nodes: ['kms', 'backup'], warn: ['kms'], badges: { kms: ['own backup policy', 'warn'] }, tone: 'warn' }
        ]
      },
      {
        id: 'resurrect', title: 'Backup restore resurrects data', tone: 'err',
        steps: [
          { text: 'An incident corrupts the orders DB. On-call restores the snapshot from <b>12 days ago</b>.', flow: ['backup>svc'], warn: ['svc'], badges: { backup: ['restore d-12', 'warn'] }, tone: 'warn' },
          { text: '300 people erased in the last 12 days are back in the DB, and CDC immediately pushes them into search and the warehouse again.', flow: ['svc>bus', 'bus>search'], err: ['svc', 'search'], badges: { svc: ['300 resurrected', 'err'] }, tone: 'err' },
          { text: 'Fix: the restore runbook <b>replays the tombstone ledger</b> before the DB is reopened to traffic and before CDC restarts.', flow: ['orch>audit', 'orch>svc'], ok: ['svc'], badges: { orch: 'replay tombstones' } },
          { text: 'With crypto-shredding the restored rows are harmless: their keys are gone. You still replay to remove the now-orphaned rows.', nodes: ['kms', 'svc'], ok: ['kms', 'svc'], badges: { kms: ['keys gone', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'scale', title: 'At scale: 50k requests a month', tone: 'warn',
        steps: [
          { text: 'After a news story, requests jump from 2k to <b>50k a month</b>. With 25 stores and manual tickets that is tens of thousands of engineer-hours: impossible.', nodes: ['orch'], hot: ['orch'], badges: { orch: ['50k / mo', 'warn'] }, tone: 'warn' },
          { text: 'The orchestrator batches: one warehouse <code>DELETE … WHERE subject_key IN (…)</code> per night, bulk delete-by-query in search, per-subject key deletes in the vault.', flow: [['orch>wh', 'orch>search', 'orch>kms']], badges: { wh: 'batch 1/night' } },
          { text: 'One downstream (a legacy CRM) fails for two days. Its steps go to <b>RETRY</b> with backoff; the dashboard shows requests at risk of missing the deadline.', nodes: ['orch', 'audit'], warn: ['orch'], badges: { audit: ['412 at risk', 'warn'] }, tone: 'warn' },
          { text: 'It recovers, retries succeed idempotently, and every request closes inside the month. Human time is spent only on the failed steps.', flow: ['orch>audit'], ok: ['audit', 'orch'], badges: { audit: ['SLA 100%', 'ok'] }, tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Four real design choices. Meters are an <em>illustrative</em> model for a consumer product with ~25 PII stores, EU and Indian users, and a few thousand rights requests a month.',
      controls: [
        { id: 'erase', label: 'Erasure approach', type: 'seg', value: 'orch', options: [
          { v: 'manual', l: 'Manual tickets' }, { v: 'orch', l: 'Orchestrated deletes' }, { v: 'shred', l: 'Crypto-shredding + deletes' }] },
        { id: 'ana', label: 'PII in analytics', type: 'seg', value: 'pseudo', options: [
          { v: 'raw', l: 'Raw' }, { v: 'pseudo', l: 'Pseudonymised' }, { v: 'agg', l: 'Aggregated only' }] },
        { id: 'res', label: 'Residency', type: 'seg', value: 'single', options: [
          { v: 'single', l: 'Single region' }, { v: 'cells', l: 'Per-region cells' }] },
        { id: 'log', label: 'Logging', type: 'seg', value: 'masked', options: [
          { v: 'raw', l: 'Raw PII in logs' }, { v: 'masked', l: 'Masked at source' }] }
      ],
      evaluate(s) {
        const c = (x) => Math.max(0.03, Math.min(0.97, x));
        const E = s.erase, A = s.ana, R = s.res, L = s.log;
        let risk = { manual: 0.2, orch: 0.6, shred: 0.75 }[E] + { raw: -0.2, pseudo: 0.05, agg: 0.15 }[A] + (R === 'cells' ? 0.12 : -0.05) + (L === 'masked' ? 0.12 : -0.2);
        let effort = { manual: 0.15, orch: 0.6, shred: 0.5 }[E] + (R === 'cells' ? -0.2 : 0.1) + (A === 'pseudo' ? -0.05 : 0) + (L === 'masked' ? -0.03 : 0.05);
        const value = { raw: [0.95, 'full detail, joins on email'], pseudo: [0.8, 'per-user funnels, no names'], agg: [0.45, 'counts only, no cohorts'] }[A];
        let cost = 0.75 + (E === 'shred' ? -0.15 : 0) + (R === 'cells' ? -0.25 : 0) + (A === 'pseudo' ? -0.03 : 0);
        let blast = 0.3 + (E === 'shred' ? 0.25 : 0) + (R === 'cells' ? 0.2 : 0) + { raw: -0.15, pseudo: 0.1, agg: 0.2 }[A] + (L === 'masked' ? 0.15 : -0.15);
        const days = { manual: ['2–6 weeks, backups 35 d', 0.15], orch: ['~1–2 d live, backups 35 d', 0.6], shred: ['minutes, incl. backups', 0.95] }[E];
        const metrics = [
          { k: 'Compliance risk', v: risk >= 0.85 ? 'low' : risk >= 0.55 ? 'medium' : 'high', s: c(risk) },
          { k: 'Erasure completeness', v: days[0], s: days[1] },
          { k: 'Engineering effort', v: E === 'manual' ? 'grows with every request' : effort >= 0.55 ? 'moderate, one-off build' : 'high: platform work', s: c(effort) },
          { k: 'Analytics value', v: value[1], s: value[0] },
          { k: 'Latency & cost', v: (E === 'shred' ? '+decrypt per read · ' : '') + (R === 'cells' ? 'N regions to run' : 'one region'), s: c(cost) },
          { k: 'Breach blast radius', v: blast >= 0.75 ? 'small: one region, little plaintext' : blast >= 0.45 ? 'medium' : 'large: plaintext everywhere', s: c(blast) }
        ];
        const notes = [];
        if (E === 'manual') notes.push('Manual erasure scales linearly with requests × stores and depends on someone remembering every copy. It fails exactly when request volume spikes.');
        if (E === 'orch') notes.push('Orchestrated deletes cover live stores, but <b>backups keep the data until expiry</b>. Document that, keep backups beyond use, and replay tombstones on restore.');
        if (E === 'shred') notes.push('Crypto-shredding reaches backups and replicas instantly, but costs a decrypt per read and a key lookup. Search and caches holding plaintext still need explicit deletes.');
        if (A === 'raw') notes.push('Raw PII in the warehouse makes every analyst a potential leak and every table an erasure target.');
        if (A === 'pseudo') notes.push('Pseudonymised data is <b>still personal data</b> (Recital 26). It lowers risk and must still be erased, but only by key, not by email.');
        if (A === 'agg') notes.push('Aggregates with small cells suppressed (e.g. k ≥ 10) can be anonymous, but you lose per-user funnels and ML features.');
        if (R === 'single') notes.push('One region is simple, but serving EU or Indian users from elsewhere relies on transfer mechanisms (adequacy, SCCs) that courts have struck down before.');
        if (R === 'cells') notes.push('Per-region cells keep data and access local and limit a breach to one region, at the cost of running N stacks and harder global features.');
        if (L === 'raw') notes.push('Raw PII in logs spreads to every log vendor and cannot be edited out of append-only storage.');
        let verdict;
        if (E === 'manual' && L === 'raw') verdict = '❌ <b>Not defensible:</b> erasure by hand and PII in logs. You cannot prove deletion and every log is a breach.';
        else if (E === 'manual') verdict = '⚠ <b>Fine for a startup with a few requests</b>, but it will not survive growth or an audit. Automate the fan-out next.';
        else if (L === 'raw' || A === 'raw') verdict = '⚠ <b>The workflow is good, the copies are not.</b> Mask logs and pseudonymise analytics, or erasure never really finishes.';
        else if (E === 'shred' && R === 'cells' && A !== 'raw') verdict = '✅ <b>Privacy by design:</b> regional cells, minimised analytics, masked logs and keys you can shred. Say this in the interview, and mention the cost.';
        else verdict = '👍 <b>Solid baseline.</b> The weakest meter shows the next investment: backups (shred), residency (cells) or analytics value.';
        const hide = [];
        if (E === 'manual') hide.push('orch');
        if (E !== 'shred') hide.push('kms');
        const flow = ['user>gw'];
        if (E !== 'manual') flow.push('gw>orch', ['orch>svc', 'orch>search', 'orch>cache', 'orch>wh'], 'orch>audit');
        else flow.push('gw>svc');
        if (E === 'shred') flow.push('orch>kms', 'kms>backup');
        return {
          metrics, verdict, notes: notes.slice(0, 4), hide, flow,
          labels: {
            wh: { label: 'Warehouse', sub: { raw: 'raw PII', pseudo: 'pseudonymised', agg: 'aggregates only' }[A] },
            logs: { label: 'Logs & traces', sub: L === 'raw' ? 'raw PII' : 'masked at source' },
            gw: { label: 'Edge + consent', sub: R === 'cells' ? 'routes to home cell' : 'one region' },
            backup: { label: 'Backups', sub: E === 'shred' ? 'ciphertext only' : '35-day retention' }
          },
          badges: Object.assign({ gw: [R === 'cells' ? 'EU · IN · US' : 'us-east only', R === 'cells' ? 'ok' : 'warn'] },
            E === 'shred' ? { backup: ['unreadable', 'ok'] } : { backup: ['readable 35 d', 'warn'] }),
          err: (L === 'raw' ? ['logs'] : []).concat(A === 'raw' ? ['wh'] : []),
          warn: E === 'manual' ? ['svc', 'search', 'wh'] : [],
          ok: E === 'shred' ? ['kms', 'backup'] : []
        };
      }
    },

    widget: {
      title: 'Erasure fan-out: orchestrated deletes vs crypto-shredding',
      caption: 'Submit an erasure request and watch the days tick. With <b>orchestrated deletes</b> each store finishes on its own schedule, the warehouse can fail and retry, and backups keep the data until they expire. Switch to <b>crypto-shredding</b> and destroying the subject\'s key makes every encrypted copy unreadable at once. Try <b>Restore backup</b> in both modes. The audit log records each step.'
    },

    realWorld: {
      intro: 'Laws first, then the enforcement that shaped how architects design.',
      timeline: [
        { when: '27 Apr 2016 → 25 May 2018', who: 'European Union', title: 'GDPR adopted, then applies', text: 'Regulation (EU) 2016/679 (OJ L 119, 4.5.2016). Art. 5 principles, Art. 17 erasure, Art. 25 data protection by design and by default, Art. 32 security, Art. 33 72-hour breach notice, Chapter V transfers, Art. 83 fines up to €20M or 4% of worldwide annual turnover.', src: 0 },
        { when: '3 Nov 2020', who: 'California voters', title: 'CPRA (Proposition 24) amends the CCPA', text: 'Expanded the 2018 CCPA (rights to delete, correct, opt out of sale and <b>sharing</b>, limit use of sensitive data) and created the California Privacy Protection Agency. Most provisions became operative on 1 January 2023.', src: 5 },
        { when: '16 Jul 2020', who: 'CJEU', title: 'Schrems II (C-311/18)', text: 'The Court invalidated the EU-US Privacy Shield because of US surveillance access (FISA 702) and the lack of effective redress. SCCs stayed valid only if the exporter checks that protection is essentially equivalent, adding supplementary measures where needed.', src: 2 },
        { when: '7 Dec 2020', who: 'CNIL (France)', title: '€135M for cookies without consent', text: 'Google (€100M) and Amazon (€35M) were fined because advertising cookies were set on their French sites <b>before</b> visitors consented. A lesson for consent management: check the default state, not the banner.', src: 9 },
        { when: '31 Mar 2022', who: 'PCI SSC', title: 'PCI DSS v4.0 published', text: 'v3.2.1 retired on 31 March 2024; future-dated requirements became effective 31 March 2025. Tokenisation reduces the systems in scope, but the vault and every system that can detokenise stay in scope.', src: 6 },
        { when: '22 May 2023', who: 'Irish DPC · EDPB', title: 'Meta fined €1.2 billion', text: 'Following an EDPB binding decision of 13 April 2023, Meta Platforms Ireland was fined €1.2B for transferring Facebook users\' data to the US under SCCs after Schrems II, and ordered to suspend future transfers. The largest GDPR fine to date at the time.', src: 1 },
        { when: '10 Jul 2023', who: 'European Commission', title: 'EU-US Data Privacy Framework', text: 'A new adequacy decision for US organisations that self-certify with the Department of Commerce, backed by new US redress mechanisms. It replaced Privacy Shield; SCCs remain the fallback for non-certified recipients.', src: 3 },
        { when: 'Aug 2023 → 13 Nov 2025', who: 'Government of India', title: 'DPDP Act 2023 and DPDP Rules 2025', text: 'The Act defines Data Fiduciaries, Data Principals, consent managers and a right to erasure; penalties reach ₹250 crore for failing to take reasonable security safeguards. The Rules were notified in November 2025 with a <b>phased</b> commencement: Board provisions at once, most fiduciary duties later.', src: 4 },
        { when: 'Sep 2025', who: 'NIST', title: 'SP 800-88 Rev. 2: cryptographic erase', text: 'The media sanitisation guideline keeps a dedicated section on <b>cryptographic erase</b> (key types, key sanitisation, traceability): the same principle crypto-shredding applies per subject.', src: 7 },
        { when: 'Feb 2026', who: 'EDPB', title: 'Coordinated enforcement on the right to erasure', text: '32 authorities and 764 controllers took part in the 2025 action. Recurring problems included erasure procedures, retention, anonymisation and <b>backups</b>.', src: 8 }
      ],
      lessons: [
        'Erasure is a <b>fan-out</b> over every copy; you need the inventory before the workflow.',
        'Backups and logs cannot be edited: <b>expire, mask or shred</b> instead.',
        'Transfers are fragile: two EU-US frameworks were struck down in five years. <b>Residency by design</b> is insurance.',
        'Consent is checked by regulators in the <b>default state</b> of your product.',
        'Tokenise and pseudonymise to shrink scope, but remember what remains in scope.'
      ],
      sources: [
        { title: 'Regulation (EU) 2016/679 (GDPR), Official Journal text', url: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng', pub: 'EUR-Lex' },
        { title: '1.2 billion euro fine for Facebook as a result of EDPB binding decision', url: 'https://www.edpb.europa.eu/node/6052_en', pub: 'EDPB, 22 May 2023' },
        { title: 'Schrems II: CJEU invalidates Privacy Shield, SCCs remain valid', url: 'https://www.hunton.com/privacy-and-cybersecurity-law-blog/2020/07/16/breaking-unexpected-outcome-of-schrems-ii-case-cjeu-invalidates-eu-u-s-privacy-shield-framework-but-standard-contractual-clauses-remain-valid/', pub: 'Hunton Andrews Kurth, 16 Jul 2020' },
        { title: 'European Commission adopts adequacy decision for EU-US Data Privacy Framework', url: 'https://www.mayerbrown.com/en/insights/publications/2023/07/eu-commission-adopts-adequacy-decision-for-euus-data-privacy-framework', pub: 'Mayer Brown, Jul 2023' },
        { title: 'MeitY notified Digital Personal Data Protection Rules 2025', url: 'https://www.scconline.com/blog/post/2025/11/14/meity-notified-digital-personal-data-protection-rules-2025/', pub: 'SCC Online, 14 Nov 2025' },
        { title: 'California\'s Prop 24, the CPRA, passed. What\'s next?', url: 'https://fpf.org/blog/californias-prop-24-the-california-privacy-rights-act-passed-whats-next/', pub: 'Future of Privacy Forum, Nov 2020' },
        { title: 'PCI SSC publishes PCI Data Security Standard v4.0', url: 'https://www.pcisecuritystandards.org/about_us/press_releases/securing-the-future-of-payments-pci-ssc-publishes-pci-data-security-standard-v4-0/', pub: 'PCI Security Standards Council, 31 Mar 2022' },
        { title: 'SP 800-88 Rev. 2, Guidelines for Media Sanitization', url: 'https://csrc.nist.gov/pubs/sp/800/88/r2/final', pub: 'NIST, Sep 2025' },
        { title: 'CEF 2025 report: implementation of the right to erasure', url: 'https://www.edpb.europa.eu/system/files/2026-02/edpb_cef-report_2025_right-to-erasure_en.pdf', pub: 'EDPB, Feb 2026' },
        { title: 'CNIL fines Google and Amazon for unlawful use of cookies', url: 'https://privacyinternational.org/news-analysis/4347/cnil-fines-google-and-amazon-unlawful-use-cookies', pub: 'Privacy International, Dec 2020' },
        { title: 'Is the use of encryption mandatory in the Security Rule?', url: 'https://hhs.gov/hipaa/for-professionals/faq/2001/is-the-use-of-encryption-mandatory-in-the-security-rule', pub: 'US HHS (HIPAA FAQ)' }
      ]
    },

    tradeoffs: {
      headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
      rows: [
        ['Erasure mechanism', '<b>Orchestrated deletes</b>: simple reads, no crypto on the hot path', '<b>Crypto-shredding</b>: reaches backups and replicas instantly', 'Deletes when backups are short and stores few; shred when copies are many, backups long or immutable (WORM)'],
        ['Protecting analytics', '<b>Pseudonymise</b>: per-user analysis, still personal data', '<b>Aggregate / anonymise</b>: out of scope if truly anonymous', 'Pseudonymise for product analytics and ML; aggregate for anything shared outside the team or region'],
        ['Hiding values', '<b>Masking</b> (static for test data, dynamic at query time)', '<b>Tokenisation / FPE</b>: reversible by an authorised service', 'Mask when nobody downstream needs the value; tokenise when one system must recover it (card, Aadhaar, SSN)'],
        ['Residency', '<b>Single region</b> + transfer mechanisms', '<b>Per-region cells</b>', 'Single region early on with adequacy or SCCs; cells once local law (localisation), big customers or risk demand it'],
        ['Encryption', '<b>At rest + in transit</b> (storage and TLS)', '<b>Field-level / in use</b> (app-level keys, TEEs)', 'Storage encryption is table stakes; field-level for Restricted data; confidential computing when the operator itself must not see plaintext']
      ]
    },
    failures: [
      { f: 'Erasure misses derived copies', detect: 'Periodic canary: create a synthetic subject, erase it, then scan every store in the inventory for its markers', fix: 'Inventory-driven orchestrator; new stores cannot ship without registering an erasure handler (CI check).' },
      { f: 'Backup restore resurrects erased people', detect: 'Post-restore job counts rows whose subject is in the tombstone ledger', fix: 'Restore runbook replays tombstones before reopening traffic and CDC; crypto-shred keys so resurrected rows stay unreadable.' },
      { f: 'Keys restored with the data', detect: 'Key table found in the same backup set as the data it protects', fix: 'Keep DEKs in a KMS or a separate key store with short backup retention; shredded keys must not be recoverable.' },
      { f: 'PII leaks into logs and traces', detect: 'Regex and ML scanners on log samples; alerts on emails, phone numbers, card numbers (Luhn)', fix: 'Mask at source (logging converter, structured fields), deny-list request bodies, short log retention.' },
      { f: '"Anonymised" data is re-identifiable', detect: 'Uniqueness tests: how many rows are unique on (zip, birth date, gender)?', fix: 'Treat as pseudonymised; generalise, suppress small cells, or use aggregation or differential privacy.' },
      { f: 'Unlawful transfer by default', detect: 'Data-flow map shows EU or Indian data in a foreign region, vendor or support tool', fix: 'Region pinning in IaC, transfer register with legal basis, regional cells for restricted data.' },
      { f: 'Breach notice misses 72 hours', detect: 'Time from detection to DPO decision in incident drills', fix: 'Privacy steps in the incident runbook, pre-drafted notices, data inventory to answer "whose data, how much" quickly.' }
    ],

    interview: [
      { q: 'What does GDPR actually require of a system architect?', a: '<p>The <b>Art. 5 principles</b>: lawfulness, fairness and transparency; purpose limitation; data minimisation; accuracy; storage limitation; integrity and confidentiality; and <b>accountability</b> (you must be able to prove compliance).</p><p>Then concrete duties: a <b>lawful basis</b> per processing (Art. 6: consent, contract, legal obligation, vital interests, public task, legitimate interests); rights (access, rectification, <b>erasure</b> Art. 17, portability, objection); <b>Art. 25</b> data protection by design and by default; <b>Art. 32</b> security appropriate to risk (it names pseudonymisation and encryption); <b>Art. 33</b> breach notice to the authority within 72 h where feasible; Chapter V rules for transfers.</p>', lvl: 'core' },
      { q: 'Design the right to be forgotten for a system with 30 microservices, search, a cache, a warehouse, logs and backups.', a: '<ol><li><b>Inventory</b>: every store that holds personal data, keyed by a stable subject id.</li><li><b>Orchestrator</b>: one request, one step per store, idempotent on <code>(request, store)</code>, retries with backoff, deadline tracking (one month).</li><li>Services subscribe to <code>erasure.requested</code> and reply with counts; search deletes by id; caches evict; the warehouse runs a batch delete by pseudonymous key.</li><li><b>Logs</b>: masked at source, so nothing to delete; short retention.</li><li><b>Backups</b>: crypto-shred per-subject keys, or let them expire and replay a <b>tombstone ledger</b> on restore.</li><li><b>Audit</b>: per-step evidence without the erased data.</li></ol>', fu: 'How do you know a new service did not add a copy?', lvl: 'core' },
      { q: 'What is crypto-shredding, and what are its limits?', a: '<p>Encrypt each subject\'s personal fields with a <b>per-subject data key</b> (envelope encryption: the data key is wrapped by a KMS key). To erase, destroy the data key; every ciphertext copy, including replicas and backups, becomes unreadable.</p><p>Limits: <b>plaintext copies</b> (search indexes, caches, exports, logs) are not covered; you cannot index or range-query ciphertext; each read needs a key lookup and decrypt; if the key store is backed up for 35 days you have only moved the problem. And it relies on the cipher staying strong: it is an argument regulators may accept as "beyond use", not a legal safe harbour by name.</p>', lvl: 'deep' },
      { q: 'Pseudonymisation vs anonymisation: what is the difference, legally and technically?', a: '<p><b>Pseudonymisation</b> (Art. 4(5)): data can no longer be attributed to a person <b>without additional information</b> kept separately (e.g. a hashed or tokenised id with a lookup table). <b>Recital 26</b>: it is still personal data, so all duties apply, though it counts as a security measure.</p><p><b>Anonymisation</b>: the person is no longer identifiable taking account of all means <b>reasonably likely to be used</b>; then GDPR does not apply. A hashed email is pseudonymous (anyone with the email can recompute it). Real anonymisation needs aggregation, generalisation, noise or differential privacy, and a re-identification risk test.</p>', fu: 'Is a salted hash of an email anonymous?', lvl: 'core' },
      { q: 'Masking, tokenisation and format-preserving encryption: when do you use each?', a: '<ul><li><b>Static masking</b>: irreversible substitution when copying production data to test or analytics.</li><li><b>Dynamic masking</b>: the store shows <code>****1234</code> to roles that do not need the full value; the data underneath is unchanged.</li><li><b>Tokenisation</b>: replace the value with a random token; only the vault maps back. Ideal for card numbers: systems holding only tokens can leave PCI DSS scope; the vault and detokenising systems stay in scope.</li><li><b>Format-preserving encryption</b> (NIST FF1): ciphertext keeps the format (16 digits stay 16 digits) so legacy schemas and validations still work; reversible with the key.</li></ul>', lvl: 'core' },
      { q: 'How do you handle backups for erasure requests?', a: '<p>You usually <b>cannot</b> edit an immutable backup. Options:</p><ol><li><b>Short retention</b> and document it: data is "put beyond use" (not used for any purpose) and expires on schedule.</li><li><b>Tombstone replay</b>: every restore re-applies erasures before the system reopens.</li><li><b>Crypto-shredding</b>: destroy the subject key so backed-up ciphertext is useless immediately.</li></ol><p>Tell the user in the response how and when backup copies disappear. The EDPB\'s 2025 coordinated action listed backups among the recurring weak spots.</p>', lvl: 'deep' },
      { q: 'What did Schrems II change, and how does it affect architecture?', a: '<p>On 16 July 2020 the CJEU (C-311/18) invalidated the <b>Privacy Shield</b> and said SCCs are valid only if the exporter verifies the destination gives essentially equivalent protection, adding <b>supplementary measures</b> (e.g. encryption where the importer has no key) if not.</p><p>In July 2023 the Commission adopted the <b>EU-US Data Privacy Framework</b> for certified US recipients. Architecturally: know your transfers, prefer <b>regional storage and access</b>, encrypt with keys held in the EU, and design so a future court ruling does not stop the business. Meta\'s €1.2B fine (2023) was for continuing transfers under SCCs.</p>', lvl: 'deep' },
      { q: 'Data residency vs data localisation vs transfer rules: how would you design for EU, India and the US?', a: '<p><b>Residency</b> = where data is stored; <b>localisation</b> = a legal mandate to keep it (or a copy) in-country; <b>transfer rules</b> = conditions for sending it abroad. GDPR restricts transfers rather than mandating localisation. India\'s DPDP Act s.16 allows transfers except to countries the government restricts by notification; sector rules (e.g. RBI\'s payment data storage) can require local storage.</p><p>Design: <b>per-region cells</b> keyed by a home region on the account, region-pinned storage and KMS keys in IaC, global services that see only pseudonymous ids or aggregates, and support access controlled by region.</p>', lvl: 'deep' },
      { q: 'A breach is discovered on Friday night. What has to happen in the next 72 hours?', a: '<ol><li>Contain, preserve evidence, start the incident.</li><li>Use the <b>data inventory</b> to answer: which data, whose, how many, was it encrypted (and were keys exposed)?</li><li>DPO assesses risk. GDPR Art. 33: notify the lead authority <b>without undue delay and, where feasible, within 72 h of becoming aware</b>; late notices must explain the delay; information can be given in phases.</li><li>Art. 34: tell affected people without undue delay if <b>high risk</b> (not needed if data was encrypted and unintelligible).</li><li>Check other regimes: DPDP Rules (report to the Board), HIPAA (individuals within 60 days of discovery), state laws, contracts.</li></ol>', lvl: 'core' },
      { q: 'How do PCI DSS v4.0 and tokenisation shape a payments architecture?', a: '<p>PCI DSS applies to every system that stores, processes or transmits cardholder data, or can affect its security. Put a <b>tokenisation vault</b> (or a PSP\'s hosted fields) at the edge so the card number never reaches your services; they store only tokens and fall out of the cardholder data environment.</p><p>The vault, the detokenising services and their network segment remain in scope. Combine with network segmentation, Requirement 3 (protect stored account data) for anything left, and keep CVV out of storage entirely after authorisation.</p>', lvl: 'deep' },
      { q: 'Your product team wants to keep raw user events forever "for ML". How do you push back?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a 4 TB raw events table with emails and IPs, no retention, 40 people with access. <b>Task</b>: keep ML useful while meeting storage limitation and erasure duties. <b>Action</b>: showed that 90% of features used the last 13 months; proposed pseudonymous user keys with the mapping held by the privacy service, IP truncated at ingest, 13-month raw retention and aggregated history beyond that; ran a model back-test on the reduced data. <b>Result</b>: model quality within noise, warehouse erasure became one key delete per user, access list dropped to 6, and the DPO signed off the retention ADR.</p>', lvl: 'core' },
      { q: 'How do you decide, and what do you say in the interview?', a: '<p>Start from the <b>data inventory and classification</b>: you cannot protect or erase what you have not mapped. Then: minimise at collection; mask logs at source; pseudonymise analytics; tokenise card and ID numbers; pick <b>orchestrated deletes</b> for live stores and <b>crypto-shredding</b> when copies and backups are many; choose <b>regional cells</b> when localisation or transfer risk is real.</p><p>Say it in one breath: <i>"Privacy by design: inventory, minimise, encrypt per subject, erase by orchestration with audit, shred for backups, and keep data in its home region. Pseudonymised is still personal data."</i></p>', lvl: 'core' }
    ],

    code: [
      {
        title: 'Postgres: per-subject keys with pgcrypto, and a crypto-shred', lang: 'sql',
        code: `CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Keys live in their own schema with a short, separate backup policy.
CREATE TABLE keys.subject_key (
  subject_id  uuid PRIMARY KEY,
  dek         bytea NOT NULL,        -- in production: wrapped by a KMS key, unwrapped in the app
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer (
  id          uuid PRIMARY KEY,
  country     text NOT NULL,         -- not PII on its own: stays in clear
  email_enc   bytea NOT NULL,        -- PII: encrypted with the subject's key
  phone_enc   bytea
);

-- Write: generate a 256-bit key for a new subject, encrypt with it.
INSERT INTO keys.subject_key (subject_id, dek)
VALUES ($1, gen_random_bytes(32));

INSERT INTO customer (id, country, email_enc)
SELECT $1, 'DE', pgp_sym_encrypt($2, encode(k.dek, 'hex'), 'cipher-algo=aes256')
FROM keys.subject_key k WHERE k.subject_id = $1;

-- Read: decrypt only while the key exists.
SELECT c.id, pgp_sym_decrypt(c.email_enc, encode(k.dek, 'hex')) AS email
FROM customer c JOIN keys.subject_key k ON k.subject_id = c.id
WHERE c.id = $1;

-- Crypto-shred: destroy the key. Every copy of email_enc, in replicas
-- and backups, is now unreadable. Then remove the orphaned row too.
BEGIN;
DELETE FROM keys.subject_key WHERE subject_id = $1;
DELETE FROM customer WHERE id = $1;
INSERT INTO erasure_tombstone (subject_ref, erased_at, request_id)
VALUES (encode(hmac($1::text, current_setting('app.tombstone_salt'), 'sha256'), 'hex'), now(), $2);
COMMIT;`,
        note: 'For production keep the DEK wrapped by a KMS key and decrypt in the application, so keys never sit in Postgres memory, statement logs or <code>pg_stat_statements</code>. The pattern only works if the key table is <b>not</b> retained in the same long-lived backups as the data.'
      },
      {
        title: 'Spring Boot 3: Logback converter that masks PII at source', lang: 'java',
        code: `// src/main/java/com/acme/logging/PiiMaskingConverter.java
package com.acme.logging;

import ch.qos.logback.classic.pattern.ClassicConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class PiiMaskingConverter extends ClassicConverter {
  private static final Pattern EMAIL = Pattern.compile("([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\\\\.[A-Za-z]{2,})");
  private static final Pattern CARD  = Pattern.compile("\\\\b(?:\\\\d[ -]?){12,15}(\\\\d{4})\\\\b");
  private static final Pattern PHONE = Pattern.compile("\\\\+?\\\\d[\\\\d -]{7,}(\\\\d{2})\\\\b");

  @Override
  public String convert(ILoggingEvent event) {
    String msg = event.getFormattedMessage();
    if (msg == null || msg.isEmpty()) return msg;
    msg = EMAIL.matcher(msg).replaceAll("$1***$2");               // j***@example.com
    msg = CARD.matcher(msg).replaceAll("****-****-****-$1");      // keep last 4 only
    Matcher m = PHONE.matcher(msg);
    return m.replaceAll(r -> "***" + r.group(1));
  }
}

/* src/main/resources/logback-spring.xml
<configuration>
  <conversionRule conversionWord="maskedMsg"
                  converterClass="com.acme.logging.PiiMaskingConverter"/>
  <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
      <pattern>%d{ISO8601} %-5level [%X{traceId}] %logger{36} - %maskedMsg%n</pattern>
    </encoder>
  </appender>
  <root level="INFO"><appender-ref ref="CONSOLE"/></root>
</configuration> */`,
        note: 'Regex masking is a safety net, not the design: prefer structured logging where PII fields are never logged (or are logged as a token), and never log request bodies. Exception messages and stack traces also pass through <code>%ex</code>, which this converter does not touch.'
      },
      {
        title: 'Python 3.11: idempotent erasure orchestrator with audit', lang: 'python',
        code: `import asyncio, datetime as dt
from dataclasses import dataclass
from typing import Awaitable, Callable, Protocol

class StepStore(Protocol):      # backed by the erasure_step table
    async def status(self, req: str, store: str) -> str | None: ...
    async def record(self, req: str, store: str, status: str, rows: int, attempts: int) -> None: ...

Handler = Callable[[str], Awaitable[int]]   # subject_ref -> rows affected (0 = nothing found)

@dataclass(frozen=True)
class Request:
    id: str
    subject_ref: str            # pseudonymous id, never the email
    received_at: dt.datetime

    @property
    def due_at(self) -> dt.datetime:          # GDPR Art. 12(3): one month (simplified)
        return self.received_at + dt.timedelta(days=30)

async def run_step(steps: StepStore, req: Request, store: str, handler: Handler,
                   max_attempts: int = 5) -> str:
    if await steps.status(req.id, store) in ("DONE", "NOT_FOUND"):
        return "SKIPPED"                       # idempotent: safe to re-run the whole request
    for attempt in range(1, max_attempts + 1):
        try:
            rows = await handler(req.subject_ref)   # each handler must itself be idempotent
            status = "DONE" if rows else "NOT_FOUND"
            await steps.record(req.id, store, status, rows, attempt)
            return status
        except Exception:
            await steps.record(req.id, store, "RETRY", 0, attempt)
            await asyncio.sleep(min(2 ** attempt, 60))
    return "FAILED"                             # surfaces on the at-risk dashboard

async def erase(steps: StepStore, req: Request, handlers: dict[str, Handler]) -> dict[str, str]:
    # handlers come from the data inventory: one per store that holds personal data,
    # e.g. {"kms": shred_key, "orders_db": ..., "search": ..., "cache": ..., "warehouse": ...}
    async with asyncio.TaskGroup() as tg:
        tasks = {s: tg.create_task(run_step(steps, req, s, h)) for s, h in handlers.items()}
    result = {s: t.result() for s, t in tasks.items()}
    if any(v == "FAILED" for v in result.values()) and dt.datetime.now(dt.UTC) > req.due_at:
        raise RuntimeError(f"erasure {req.id} missed its deadline")
    return result`,
        note: 'Run the key shred first if you use crypto-shredding, so a partial failure still leaves the data unreadable. In production run this on a durable workflow engine (Temporal, Step Functions) so steps survive restarts.'
      }
    ],

    related: ['secrets-kms', 'multi-tenancy', 'threat-modeling', 'data-architecture', 'zero-trust', 'sd:payment-gateway']
  });

  SD.data.knobs.diagram = SD.data.architecture;
})();
