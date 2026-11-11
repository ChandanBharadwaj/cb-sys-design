SD.register({
  slug: 'secrets-kms',
  domain: 7,
  title: 'Secrets & Key Management',
  examples: 'Vault, AWS KMS, HSM',
  tagline: 'Keep passwords and keys <b>out of code</b>, hand workloads <b>short-lived credentials</b> they never have to store, and encrypt data with <b>data keys wrapped by a master key</b> that never leaves the KMS.',
  tldr: {
    problem: 'Every service needs database passwords, API keys and encryption keys. Pasted into code, <code>.env</code> files or CI logs, they leak, live for years, and nobody knows who else has a copy.',
    idea: 'Store secrets in a <b>secrets manager</b> (Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault), authenticate workloads by <b>identity</b> instead of a stored key, prefer <b>dynamic, leased credentials</b>, and encrypt data with <b>envelope encryption</b>: a per-object <b>DEK</b> encrypts the data, a <b>KEK</b> held in a KMS or HSM encrypts the DEK.',
    insight: 'Say "no static long-lived secrets: workload identity to log in, dynamic credentials with a TTL, envelope encryption with KMS so rotating or revoking the master key touches 32-byte DEKs, not terabytes, and a rehearsed revoke-rotate-audit playbook for the leak that will still happen".',
    numbers: [
      { v: '12.8 M', l: 'new secrets leaked on public GitHub in 2023, +28% on 2022 (GitGuardian, 2024)' },
      { v: '> 90%', l: 'of those leaked secrets still valid 5 days later (GitGuardian, 2024)' },
      { v: '~5 years', l: 'Toyota T-Connect access key sat in a public GitHub repo, Dec 2017 to Sep 2022' }
    ]
  },

  intro: {
    what: 'A <b>secret</b> is anything that grants access: a database password, an API key, a TLS private key, a cloud access key. <b>Secrets management</b> is storing, handing out, rotating and auditing them. <b>Key management</b> is the same job for encryption keys, usually inside a Key Management Service (KMS) backed by tamper-resistant hardware (an HSM).',
    analogy: {
      icon: '🏦',
      title: 'Bank safe-deposit boxes and a vault master key',
      text: 'Each customer box has its own key (a <b>data key</b>). Those box keys are kept in a cabinet locked with the bank\'s <b>master key</b>, which never leaves the vault room (the <b>KMS</b>). Changing the master key means re-locking the small cabinet, not re-locking every box. Visitors get a <b>day pass</b> (a dynamic credential) at the desk after showing ID, rather than copying a permanent key. The analogy breaks in one place: a copied digital key leaves no trace, so you only know it leaked if you look.'
    },
    problem: 'A developer commits <code>AWS_SECRET_ACCESS_KEY=...</code> to a repository "just for the demo". The repo becomes public, bots scan GitHub within minutes, and the key still works months later because nobody rotates it. Worse, nobody can say which ten services use the same key. <b>How do apps get the credentials they need without anyone storing a long-lived copy, and how do we limit the damage when one leaks anyway?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Password in the code',
        text: 'The database password sits in <code>application.yml</code> or a <code>.env</code> file. Every deploy has it, every developer laptop has it, and the CI log prints it on a failed step. It is simple and it works on day one.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Developer', sub: 'commits .env', kind: 'person', at: [70, 0] },
            { id: 'repo', label: 'Git repo', sub: 'DB_PASS=hunter2', kind: 'store', at: [210, 110] },
            { id: 'app', label: 'Orders app', sub: 'reads the file', kind: 'service', at: [350, 220] },
            { id: 'db', label: 'Database', sub: 'same password', kind: 'store', at: [70, 220] }
          ],
          edges: [{ from: 'dev', to: 'repo' }, { from: 'repo', to: 'app' }, { from: 'app', to: 'db' }],
          flow: ['dev>repo', 'repo>app', 'app>db']
        }
      },
      {
        stage: 'breaks',
        title: 'One leak, years of access',
        text: 'The repo is forked, made public, or a laptop is stolen. The password is <b>valid forever</b>, shared by many apps, and rotating it means a coordinated outage, so nobody does. An attacker logs in as the app and nothing looks unusual.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Developer', sub: 'public fork', kind: 'person', at: [70, 0] },
            { id: 'repo', label: 'Git repo', sub: 'scraped by bots', kind: 'store', at: [210, 110] },
            { id: 'atk', label: 'Attacker', sub: 'valid password', kind: 'external', at: [350, 0] },
            { id: 'app', label: 'Orders app', sub: 'cannot rotate', kind: 'service', at: [350, 220] },
            { id: 'db', label: 'Database', sub: 'dumped', kind: 'store', at: [70, 220] }
          ],
          edges: [{ from: 'dev', to: 'repo' }, { from: 'repo', to: 'atk' }, { from: 'atk', to: 'db', dashed: true }, { from: 'app', to: 'db' }],
          flow: ['dev>repo', 'repo>atk', 'atk>db'],
          err: ['repo', 'db'],
          badges: { atk: ['works for years', 'err'] }
        }
      },
      {
        stage: 'fix',
        title: 'Identity in, short-lived credential out',
        text: 'The app proves <b>what it is</b> with its platform identity (a Kubernetes service account token or cloud role). The <b>secrets manager</b> creates a database user just for it, valid for one hour, and deletes it afterwards. Nothing long-lived is stored anywhere, and every issue is logged.',
        scene: {
          nodes: [
            { id: 'app', label: 'Orders app', sub: 'pod identity', kind: 'service', at: [70, 0] },
            { id: 'vault', label: 'Secrets manager', sub: 'Vault / cloud', kind: 'policy', at: [350, 0] },
            { id: 'db', label: 'Database', sub: 'user v-orders-x7', kind: 'store', at: [210, 220] },
            { id: 'audit', label: 'Audit log', sub: 'who got what', kind: 'store', at: [350, 220] }
          ],
          edges: [{ from: 'app', to: 'vault', bidi: true }, { from: 'vault', to: 'db' }, { from: 'app', to: 'db' }, { from: 'vault', to: 'audit' }],
          flow: ['app>vault', 'vault>db', 'vault>app', 'app>db', 'vault>audit'],
          ok: ['vault', 'db'],
          badges: { app: ['TTL 1 h', 'ok'] }
        }
      }
    ],
    usedBy: ['HashiCorp Vault / OpenBao', 'AWS Secrets Manager and AWS KMS', 'Google Cloud Secret Manager and Cloud KMS', 'Azure Key Vault', 'Kubernetes External Secrets Operator', 'GitHub secret scanning and push protection'],
    whenToUse: [
      'Any service that talks to a database, a cloud API or a third party with a credential',
      'Regulated data (cards, health, personal data) that must be encrypted with keys you can rotate, audit and destroy',
      'Many teams and environments, where "who has the prod password?" has no answer today'
    ],
    whenNot: [
      'Authenticating users and delegating access to apps: that is <a href="iam-oauth-oidc.html">Identity &amp; Access: OAuth, OIDC, JWT</a>',
      'Non-sensitive configuration (feature flags, URLs, timeouts): keep it in plain config, see <a href="twelve-factor.html">The Twelve-Factor App</a>',
      'Network-level identity between workloads (mTLS certificates, SPIFFE): see <a href="zero-trust.html">Zero Trust Architecture</a>'
    ],
    glossary: [
      { term: 'Secrets manager', def: 'A service that stores secrets encrypted, hands them out after authentication and policy checks, versions them and logs every read.' },
      { term: 'Dynamic secret', def: 'A credential created on request for one client (for example a new database user) that expires and is deleted when its lease ends.' },
      { term: 'Lease', def: 'The TTL attached to a dynamic secret. The client may renew it up to a maximum; on expiry or revoke the credential is destroyed.' },
      { term: 'KMS', def: 'Key Management Service: holds master keys inside HSMs and performs encrypt, decrypt and generate-data-key operations without exporting them.' },
      { term: 'HSM', def: 'Hardware security module: tamper-resistant hardware that generates and uses keys, validated against FIPS 140-2 or 140-3.' },
      { term: 'DEK / KEK', def: 'Data encryption key (encrypts the data) and key encryption key (encrypts, or "wraps", the DEK). Envelope encryption uses both.' },
      { term: 'Workload identity', def: 'A platform-issued identity for a pod or VM (IRSA, EKS Pod Identity, GKE Workload Identity) exchanged for short-lived cloud credentials.' },
      { term: 'Crypto-shredding', def: 'Making data permanently unreadable by destroying the key that encrypts it, instead of finding and deleting every copy.' }
    ]
  },

  requirements: {
    functional: [
      '<b>No secrets in code, images, env files or CI logs</b>; scan every commit and block pushes that contain one',
      'One <b>secrets manager</b> as the source of truth, with per-app policies and versioning',
      'Workloads authenticate with <b>workload identity</b> (Kubernetes service account, IAM role), not a stored bootstrap key',
      'Prefer <b>dynamic credentials with a lease</b>; static secrets get <b>automatic rotation</b>',
      '<b>Envelope encryption</b>: per-object or per-tenant DEKs, KEKs that never leave the KMS/HSM',
      'A written <b>leak playbook</b>: revoke, rotate, audit usage, then find the root cause'
    ],
    nonFunctional: [
      'Exposure window of a leaked credential <b>≤ its TTL</b>: minutes to hours, not years',
      'Time from leak detection to revoked credential <b>&lt; 15 min</b> (<em>target, rule of thumb</em>)',
      '<b>100%</b> of secret reads and key uses in an audit log with caller identity',
      'Rotation causes <b>zero downtime</b>: two valid versions overlap during the switch',
      'KMS on the hot path adds <b>&lt; 10 ms</b> p99, or is off it via DEK caching (<em>estimate</em>)',
      'Keys in <b>FIPS 140-2/140-3</b> validated modules where regulation demands (PCI DSS, FedRAMP)'
    ],
    outOfScope: [
      '<b>base64 in a Kubernetes Secret</b> treated as encryption',
      'One shared "god" credential used by every service and every environment',
      'Writing your own crypto, or one AES key for all data that can never be rotated',
      'Secrets passed as CLI arguments or printed in logs and stack traces',
      'Rotation "planned for next quarter" with no automation'
    ]
  },

  calculator: {
    inputs: [
      { id: 'secrets', label: 'Static secrets in the estate', min: 10, max: 20000, value: 400, log: true },
      { id: 'days', label: 'Rotation interval', min: 1, max: 365, value: 90, unit: 'days', log: true },
      { id: 'apps', label: 'Apps consuming each secret', min: 1, max: 20, value: 3 },
      { id: 'mins', label: 'Manual effort per app per rotation', min: 1, max: 120, value: 20, unit: 'min' },
      { id: 'auto', label: 'Rotations automated', min: 0, max: 100, value: 40, unit: '%' },
      { id: 'objs', label: 'Objects encrypted per month (millions)', min: 0.01, max: 10000, value: 50, log: true },
      { id: 'reuse', label: 'Objects per data key (DEK reuse)', min: 1, max: 100000, value: 1000, log: true }
    ],
    outputs: [
      { label: 'Rotation events per month', f: (v) => v.secrets * 30 / v.days },
      { label: 'Manual rotation effort per month', fmt: 'raw', f: (v) => { const h = v.secrets * 30 / v.days * v.apps * v.mins * (1 - v.auto / 100) / 60; return (h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString('en-US')) + ' h (' + (h / 140).toFixed(1) + ' FTE)'; } },
      { label: 'Average exposure window of an undetected leak (half the interval)', fmt: 'raw', f: (v) => (v.days / 2 < 1 ? Math.round(v.days * 12) + ' h' : (v.days / 2).toFixed(v.days < 20 ? 1 : 0) + ' days') },
      { label: 'KMS GenerateDataKey calls per month', f: (v) => Math.ceil(v.objs * 1e6 / v.reuse) },
      { label: 'KMS request cost per month (illustrative $0.03 / 10k)', fmt: 'raw', f: (v) => '$' + (Math.ceil(v.objs * 1e6 / v.reuse) / 1e4 * 0.03).toFixed(2) },
      { label: 'Objects readable with one leaked plaintext DEK', f: (v) => v.reuse }
    ],
    note: 'Two models in one. <b>Rotation toil</b> grows with secrets × consumers ÷ interval: halving the interval doubles the work unless it is automated, which is why short rotation only becomes realistic with automation or dynamic secrets. An undetected leak stays usable until the next rotation, on average <b>half the interval</b>. <b>Envelope</b>: each DEK costs one KMS call; reusing a DEK for N objects cuts calls N-fold but means one leaked plaintext DEK exposes N objects. The $0.03 per 10,000 requests is an <em>illustrative</em> list price for symmetric KMS calls; check current pricing. 140 working hours per FTE-month is an <em>estimate</em>.'
  },

  api: [
    { m: 'POLICY', p: 'vault policy: orders-app.hcl', d: '<code>path "database/creds/orders-rw" { capabilities = ["read"] }</code>. One policy per app, bound to a Kubernetes service account through the Kubernetes auth method.' },
    { m: 'POST', p: 'kms:GenerateDataKey', d: '<code>KeyId</code> (alias of the KEK), <code>KeySpec=AES_256</code>, <code>EncryptionContext={"tenant":"acme"}</code>. Returns a <b>plaintext DEK</b> (use, then wipe) and the same DEK <b>encrypted under the KEK</b> (store next to the data).' },
    { m: 'POST', p: 'kms:Decrypt / ReEncrypt', d: '<code>Decrypt</code> unwraps a stored DEK; the encryption context must match. <code>ReEncrypt</code> re-wraps a DEK under a new key inside KMS, never exposing plaintext: this is the <b>re-wrap</b> step.' },
    { m: 'GET', p: 'database/creds/orders-rw', d: 'Vault dynamic secret. Returns <code>username</code>, <code>password</code>, <code>lease_id</code>, <code>lease_duration</code>. Renew with <code>sys/leases/renew</code>; revoke with <code>sys/leases/revoke</code>.' },
    { m: 'YAML', p: 'EncryptionConfiguration (kube-apiserver)', d: 'Resources <code>secrets</code> with providers <code>kms</code> (apiVersion v2, plugin socket) then <code>identity</code> for reading old data. Makes etcd hold only envelope-encrypted Secrets.' },
    { m: 'DOC', p: 'Leaked-secret runbook', d: 'Who is paged, how to <b>revoke</b> (not just delete from Git), rotate order for consumers, which audit logs to search (CloudTrail, Vault audit), and the disclosure decision.' }
  ],
  dataModel: [
    { name: 'secret (secrets manager)', store: 'Vault KV v2 / Secrets Manager', fields: [['path', 'prod/orders/stripe', 'pk'], ['version', 'int', 'pk'], ['value', 'encrypted blob'], ['created_by', 'identity'], ['rotation_lambda', 'arn nullable'], ['stage', 'AWSCURRENT | AWSPREVIOUS']], note: 'Two staged versions let consumers switch over with no downtime.' },
    { name: 'lease', store: 'Vault', fields: [['lease_id', 'database/creds/orders-rw/abc', 'pk'], ['issued_to', 'k8s sa orders/default', 'idx'], ['db_user', 'v-k8s-orders-x7Q'], ['ttl', '1h'], ['max_ttl', '24h'], ['expires_at', 'ts', 'idx']], note: 'Revoking the lease drops the DB user. <code>revoke -prefix</code> kills every credential a role issued.' },
    { name: 'encrypted_object', store: 'App DB / S3 object metadata', fields: [['object_id', 'uuid', 'pk'], ['ciphertext', 'AES-256-GCM bytes'], ['nonce', '12 bytes'], ['wrapped_dek', 'KMS CiphertextBlob'], ['kek_id', 'key ARN / version', 'idx'], ['enc_context', 'tenant=acme']], note: 'The wrapped DEK travels with the data. Rotating the KEK only rewrites <code>wrapped_dek</code>.' },
    { name: 'kms_key', store: 'KMS (in HSMs)', fields: [['key_id', 'uuid', 'pk'], ['alias', 'alias/orders-data', 'idx'], ['versions', 'key material v1..vN'], ['rotation', 'enabled, 365 d'], ['policy', 'who may Encrypt / Decrypt'], ['state', 'Enabled | Disabled | PendingDeletion']], note: 'Old versions stay for decrypt; new encryptions use the newest.' }
  ],

  architecture: {
    title: 'Workload identity, a secrets manager, dynamic credentials and envelope encryption',
    nodes: [
      { id: 'dev', label: 'Developer', sub: 'pushes code', kind: 'person', wide: [90, 0], tall: [70, 0], tip: 'Writes code. Never needs the production password: secrets are referenced by path, not value.' },
      { id: 'git', label: 'Git + scanner', sub: 'push protection', kind: 'store', wide: [290, 0], tall: [210, 0], tip: 'Secret scanning (GitHub push protection, gitleaks, GitGuardian) blocks commits containing key-shaped strings before they land.' },
      { id: 'ci', label: 'CI pipeline', sub: 'OIDC, no stored keys', kind: 'compute', wide: [490, 0], tall: [350, 0], tip: 'CI logs in to the cloud and Vault with its own OIDC token (for example GitHub Actions OIDC), so there is no long-lived deploy key to leak from CI settings.' },
      { id: 'eso', label: 'ESO / CSI driver', sub: 'sync into the pod', kind: 'edge', wide: [690, 0], tall: [350, 210], tip: 'External Secrets Operator copies values into Kubernetes Secrets; the Secrets Store CSI driver mounts them as files without (by default) creating a Secret.' },
      { id: 'etcd', label: 'etcd', sub: 'KMS v2 encrypted', kind: 'store', wide: [890, 0], tall: [350, 315], tip: 'Kubernetes Secrets are only base64 in the API. Encryption at rest needs an EncryptionConfiguration with a KMS provider; access needs tight RBAC on get/list secrets.' },
      { id: 'wi', label: 'Workload identity', sub: 'IRSA · Pod Identity', kind: 'policy', wide: [90, 110], tall: [70, 105], tip: 'The platform signs a short-lived identity token for the pod (projected service account token). AWS STS, GCP or Vault exchange it for credentials. This solves "secret zero".' },
      { id: 'app', label: 'Orders service', sub: 'no stored secrets', kind: 'service', wide: [290, 110], tall: [210, 105], tip: 'Logs in with its identity, receives a leased DB credential, renews it, and asks KMS for data keys to encrypt records.' },
      { id: 'vault', label: 'Secrets manager', sub: 'Vault / cloud SM', kind: 'policy', wide: [490, 110], tall: [350, 105], tip: 'Authenticates the workload, checks policy, issues dynamic credentials with leases or returns a static secret version. Its own storage is encrypted with a key from KMS (auto-unseal).' },
      { id: 'audit', label: 'Audit log', sub: 'Vault audit · CloudTrail', kind: 'store', wide: [890, 110], tall: [70, 315], tip: 'Every login, secret read, lease and KMS call, with caller identity. The first place you look after a leak: what did the key do?' },
      { id: 'db', label: 'Postgres', sub: 'per-lease users', kind: 'store', wide: [290, 220], tall: [70, 210], tip: 'Vault holds a privileged connection and creates a role per lease (VALID UNTIL the expiry), dropping it on revoke.' },
      { id: 'blob', label: 'Encrypted data', sub: 'ciphertext + wrapped DEK', kind: 'store', wide: [490, 220], tall: [210, 210], tip: 'Each record or object stores AES-GCM ciphertext, its nonce and the DEK wrapped by the KEK. Useless without a KMS Decrypt call.' },
      { id: 'kms', label: 'KMS / HSM', sub: 'KEK never leaves', kind: 'external', wide: [690, 220], tall: [210, 315], tip: 'AWS KMS, Cloud KMS, Azure Key Vault, or an on-prem HSM. Holds key-encryption keys with versions, enforces key policy, and is FIPS 140 validated.' }
    ],
    edges: [
      { from: 'dev', to: 'git' },
      { from: 'git', to: 'ci' },
      { from: 'ci', to: 'vault', dashed: true, label: 'OIDC' },
      { from: 'app', to: 'wi', bidi: true, label: 'SA token' },
      { from: 'app', to: 'vault', bidi: true, label: 'login' },
      { from: 'vault', to: 'db', label: 'CREATE ROLE' },
      { from: 'app', to: 'db' },
      { from: 'app', to: 'blob', bend: 0.25 },
      { from: 'app', to: 'kms', bend: 0.3 },
      { from: 'vault', to: 'kms', dashed: true },
      { from: 'vault', to: 'audit', bend: 0.15 },
      { from: 'eso', to: 'vault' },
      { from: 'eso', to: 'etcd' }
    ]
  },

  scenarios: [
    {
      id: 'dyn', title: 'Startup: workload identity → dynamic DB credential', tone: 'ok',
      steps: [
        { text: 'A new pod starts with <b>no secret in its image or env</b>. Kubernetes mounts a short-lived, audience-bound <b>service account token</b> signed by the cluster.', flow: ['app>wi', 'wi>app'], badges: { wi: 'JWT · 1 h' } },
        { text: 'The app logs in to Vault with that token. Vault checks it with the cluster (TokenReview or JWKS) and maps <code>sa=orders</code> to policy <code>orders-app</code>. This is how <b>secret zero</b> disappears.', flow: ['app>vault'], ok: ['vault'], badges: { vault: ['policy orders-app', 'ok'] } },
        { text: 'The app reads <code>database/creds/orders-rw</code>. Vault runs <code>CREATE ROLE "v-orders-x7Q" ... VALID UNTIL</code> in Postgres and returns user, password and a <b>1-hour lease</b>.', flow: ['vault>db', 'vault>app'], badges: { db: 'new user' } },
        { text: 'The app connects with its own unique user, so the DB log names exactly which pod did what. Every step is in the <b>audit log</b>.', flow: ['app>db', 'vault>audit'], ok: ['db', 'audit'] },
        { text: 'Before expiry the client <b>renews</b> the lease (up to <code>max_ttl</code>) or fetches a new credential. When the pod dies the lease lapses and Vault drops the user.', nodes: ['app', 'vault'], ok: ['app'], badges: { app: ['renew ✓', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'env', title: 'Envelope encryption: write and read a record', tone: 'info',
      steps: [
        { text: 'To store a customer document, the app calls <code>GenerateDataKey</code> on the KEK with <code>EncryptionContext={tenant: acme}</code>.', flow: ['app>kms'], badges: { kms: 'GenerateDataKey' } },
        { text: 'KMS returns a 256-bit DEK twice: <b>plaintext</b> and <b>wrapped</b> by the KEK. The KEK itself never leaves the HSM boundary.', flow: ['kms>app'], badges: { app: 'DEK + wrapped DEK' } },
        { text: 'The app encrypts locally with <b>AES-256-GCM</b> (fast, any size), stores ciphertext + nonce + wrapped DEK, and <b>wipes the plaintext DEK</b> from memory.', flow: ['app>blob'], ok: ['blob'], badges: { blob: 'ciphertext' } },
        { text: 'Reading: fetch the record, send only the <b>wrapped DEK</b> (a few hundred bytes) to KMS <code>Decrypt</code> with the same context, then decrypt the data locally. The data never goes to KMS.', flow: ['app>blob', 'app>kms', 'kms>app'], ok: ['app'], tone: 'ok' }
      ]
    },
    {
      id: 'rotate', title: 'Rotating the KEK across 2 PB of data', tone: 'warn',
      steps: [
        { text: 'Compliance asks for yearly key rotation. Naively that means <b>decrypting and re-encrypting every byte</b>: petabytes of reads and writes and weeks of I/O.', nodes: ['blob'], warn: ['blob'], badges: { blob: ['2 PB to rewrite?', 'warn'] }, tone: 'warn' },
        { text: 'With envelope encryption, KMS automatic rotation simply adds <b>key material v2</b>. New <code>GenerateDataKey</code> calls use v2; v1 is <b>kept for Decrypt</b> of old wrapped DEKs.', nodes: ['kms'], ok: ['kms'], badges: { kms: 'v1 + v2' } },
        { text: 'If policy also wants old data under the new version, a batch job calls <code>ReEncrypt</code> on each <b>wrapped DEK</b> (hundreds of bytes). The data blobs are untouched.', flow: ['app>blob', 'app>kms', 'app>blob'], badges: { blob: ['DEKs re-wrapped', 'ok'] } },
        { text: 'Rotating the <b>DEK</b> itself (re-encrypting data) is only needed if a DEK may have leaked, or a GCM key nears its safe usage limit. That is a targeted job, not a yearly ritual.', nodes: ['blob', 'kms'], ok: ['blob', 'kms'], tone: 'ok' }
      ]
    },
    {
      id: 'leak', title: 'Failure: static key leaked on GitHub', tone: 'err',
      steps: [
        { text: 'A contractor pushes a test script with a <b>long-lived cloud access key</b> to a public repo. The scanner on the company org never saw it: it was a personal repo.', nodes: ['git'], err: ['git'], badges: { git: ['key public', 'err'] }, tone: 'err' },
        { text: 'Automated scrapers find new keys on public GitHub within minutes and start using them. The key is <b>still valid</b>, and it can read the data bucket.', nodes: ['blob'], err: ['blob'], badges: { blob: ['downloaded', 'err'] }, tone: 'err' },
        { text: '<b>1. Revoke first</b>: deactivate the key at the provider. Deleting the commit is not enough; forks, caches and clones keep it.', nodes: ['vault'], warn: ['vault'], badges: { vault: ['key disabled', 'warn'] }, tone: 'warn' },
        { text: '<b>2. Rotate</b> every consumer onto a new credential, and <b>3. audit</b>: search CloudTrail and Vault logs for every call the key made since it leaked, to scope the breach.', flow: ['vault>audit'], badges: { audit: 'what did it touch?' } },
        { text: '<b>4. Root cause</b>: replace the static key with workload identity and dynamic credentials so the next leak is worth an hour, not years.', nodes: ['wi', 'app'], ok: ['wi', 'app'], badges: { wi: ['no static key', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'k8s', title: 'Kubernetes Secrets: base64 is not encryption', tone: 'warn',
      steps: [
        { text: 'The team syncs secrets from Vault into the cluster with the <b>External Secrets Operator</b>, so apps read normal Kubernetes Secrets.', flow: ['eso>vault', 'eso>etcd'] },
        { text: 'By default a Secret is stored in etcd only <b>base64-encoded</b>. Anyone with an etcd backup, or RBAC <code>get/list secrets</code> in the namespace, reads it in clear.', nodes: ['etcd'], warn: ['etcd'], badges: { etcd: ['base64 only', 'warn'] }, tone: 'warn' },
        { text: 'Fix at rest: an <code>EncryptionConfiguration</code> with the <b>KMS v2 provider</b>, so the API server envelope-encrypts each Secret with a KMS-held KEK.', flow: ['vault>kms'], nodes: ['etcd', 'kms'], ok: ['etcd'], badges: { etcd: ['KMS v2', 'ok'] } },
        { text: 'Fix in use: narrow RBAC, no <code>list secrets</code> for humans, and where possible the <b>Secrets Store CSI driver</b> to mount values as files without creating a Secret at all.', nodes: ['eso', 'app'], ok: ['eso'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick where secrets live, how they rotate and how data is encrypted. The meters are illustrative judgements from the mechanisms on this page, not measurements.',
    diagram: null,
    controls: [
      { id: 'store', label: 'Where secrets live', type: 'seg', value: 'sm', options: [
        { v: 'code', l: 'Code / .env files' }, { v: 'k8s', l: 'Kubernetes Secrets' }, { v: 'sm', l: 'Secrets manager' }, { v: 'dyn', l: 'Dynamic + workload identity' }] },
      { id: 'rot', label: 'Rotation', type: 'seg', value: 'auto', options: [
        { v: 'never', l: 'Never' }, { v: 'manual', l: 'Manual' }, { v: 'auto', l: 'Automatic' }] },
      { id: 'enc', label: 'Data encryption', type: 'seg', value: 'env', options: [
        { v: 'none', l: 'None in the app' }, { v: 'tde', l: 'DB / disk (TDE)' }, { v: 'env', l: 'Envelope with KMS' }] },
      { id: 'days', label: 'Rotation interval / credential TTL', type: 'range', min: 1, max: 365, step: 1, value: 30, unit: 'days' }
    ],
    evaluate(s) {
      const c01 = (x) => Math.max(0, Math.min(1, x));
      const dyn = s.store === 'dyn';
      // exposure window in days
      let win;
      if (dyn) win = 1 / 24;
      else if (s.rot === 'never') win = 3650;
      else win = s.days / 2 * (s.rot === 'manual' ? 1.5 : 1);
      const winTxt = win < 1 ? '≈ 1 h (lease TTL)' : win >= 3650 ? 'until noticed (years)' : '≈ ' + Math.round(win) + ' days avg';
      const winS = c01(1 - Math.log10(win * 24 + 1) / Math.log10(3650 * 24));
      const blast = { code: 0.1, k8s: 0.35, sm: 0.65, dyn: 0.9 }[s.store] + (s.enc === 'env' ? 0.1 : s.enc === 'tde' ? 0.02 : -0.05);
      const rotPerMonth = 30 / s.days;
      let ops = dyn ? 0.75 : s.rot === 'never' ? 0.8 : s.rot === 'auto' ? 0.85 : c01(0.9 - rotPerMonth * 0.25);
      if (s.store === 'code' && s.rot !== 'never') ops -= 0.25;
      if (s.enc === 'env') ops -= 0.1;
      const lat = s.enc === 'env' ? 0.7 : 0.95;
      let comp = { code: 0.05, k8s: 0.35, sm: 0.7, dyn: 0.85 }[s.store] + (s.rot === 'auto' || dyn ? 0.1 : s.rot === 'never' ? -0.2 : 0) + { none: -0.2, tde: 0.05, env: 0.15 }[s.enc];
      const metrics = [
        { k: 'Leak blast radius', v: blast >= 0.8 ? 'one app, one hour' : blast >= 0.55 ? 'one app, scoped' : blast >= 0.3 ? 'namespace / cluster' : 'every copy, everywhere', s: c01(blast) },
        { k: 'Exposure window', v: winTxt, s: winS },
        { k: 'Ops effort', v: dyn ? 'platform setup, then none' : s.rot === 'auto' ? 'rotation lambdas' : s.rot === 'manual' ? SD.fmt.num(rotPerMonth) + ' rotations/secret/mo by hand' : 'none (until the breach)', s: c01(ops) },
        { k: 'Latency added', v: s.enc === 'env' ? '+1 KMS call per DEK (cache it)' : s.enc === 'tde' ? '≈ 0 (storage layer)' : 'none', s: lat, hint: dyn ? 'plus login at startup' : '' },
        { k: 'Compliance posture', v: comp >= 0.8 ? 'audit-ready' : comp >= 0.5 ? 'defensible' : comp >= 0.25 ? 'findings likely' : 'fails audit', s: c01(comp) },
        { k: 'Stolen backup readable?', v: s.enc === 'env' ? 'no: needs KMS Decrypt' : s.enc === 'tde' ? 'no for disk, yes via SQL' : 'yes', s: s.enc === 'env' ? 0.9 : s.enc === 'tde' ? 0.55 : 0.1 }
      ];
      const notes = [];
      if (s.store === 'code') notes.push('Secrets in code or <code>.env</code> files are copied to every clone, image layer, CI cache and laptop. You cannot revoke a copy you do not know exists.');
      if (s.store === 'k8s') notes.push('Kubernetes Secrets are <b>base64</b>, not encrypted, unless the API server has an <code>EncryptionConfiguration</code> (KMS v2 provider). Anyone with <code>get secrets</code> in the namespace reads them.');
      if (s.store === 'sm' && s.rot !== 'auto') notes.push('A secrets manager without rotation is a safer box for the same <b>forever password</b>. Turn on its rotation (for example Secrets Manager rotation functions).');
      if (dyn) notes.push('Dynamic credentials: each pod gets its own DB user with a lease, so a leak is worth one TTL and the audit log names the pod. The rotation setting barely matters: the TTL is the rotation.');
      if (s.rot === 'manual' && s.days < 30 && !dyn) notes.push('Manual rotation every ' + s.days + ' days does not survive contact with reality: teams skip it, or rotate and break consumers. Automate before shortening.');
      if (s.enc === 'tde') notes.push('TDE protects stolen disks and backups, but anyone who can run SQL (including an attacker with the app\'s password) sees plaintext.');
      if (s.enc === 'env') notes.push('Envelope encryption: rotating the KEK re-wraps DEKs only; revoking it crypto-shreds everything under it. Cache plaintext DEKs briefly to keep KMS off the hot path.');
      let verdict;
      if (s.store === 'code') verdict = '❌ <b>Secrets in code leak; it is a question of when.</b> Move them to a secrets manager and scan every push.';
      else if (s.rot === 'never' && !dyn) verdict = '❌ <b>Never-rotated secrets turn one leak into years of access.</b> Turn on automatic rotation or dynamic credentials.';
      else if (s.store === 'k8s' && s.enc === 'none') verdict = '⚠ <b>base64 in etcd is not protection.</b> Enable KMS encryption at rest and narrow RBAC, or source from a secrets manager.';
      else if (s.enc === 'none') verdict = '⚠ <b>Credentials handled, data still in clear.</b> Add envelope encryption for sensitive fields so a dump or backup is useless.';
      else if (dyn && s.enc === 'env') verdict = '✅ <b>Current best practice:</b> no static secrets, leased credentials, and data keys wrapped by a KMS key you can rotate or destroy.';
      else if (s.rot === 'manual') verdict = '👍 <b>Right place, fragile process.</b> Manual rotation will slip; automate it.';
      else verdict = '👍 <b>Sound baseline.</b> Next step: replace static secrets with workload identity and dynamic credentials.';
      const labels = {
        vault: { label: dyn ? 'Vault (dynamic)' : s.store === 'sm' ? 'Secrets manager' : s.store === 'k8s' ? 'K8s Secret' : '.env file', sub: dyn ? 'leases · 1 h TTL' : s.rot === 'auto' ? 'auto-rotate ' + s.days + ' d' : s.rot === 'manual' ? 'manual rotation' : 'never rotated' },
        blob: { label: 'Stored data', sub: { none: 'plaintext rows', tde: 'disk-encrypted', env: 'ciphertext + wrapped DEK' }[s.enc] },
        db: { label: 'Postgres', sub: dyn ? 'per-lease users' : 'one shared user' }
      };
      const hide = [];
      if (s.enc !== 'env') hide.push('kms');
      if (!dyn) hide.push('wi');
      if (s.store !== 'k8s') hide.push('eso', 'etcd');
      let flow;
      if (dyn) flow = ['app>wi', 'app>vault', 'vault>db', 'app>db'];
      else if (s.store === 'k8s') flow = ['eso>etcd', 'app>vault', 'app>db'];
      else if (s.store === 'code') flow = ['dev>git', 'git>ci', 'app>db'];
      else flow = ['app>vault', 'app>db'];
      if (s.enc === 'env') flow.push('app>kms', 'app>blob');
      else flow.push('app>blob');
      const err = [], warn = [], ok = [];
      if (s.store === 'code') err.push('git', 'vault');
      if (s.rot === 'never' && !dyn) err.push('vault');
      if (s.store === 'k8s' && s.enc === 'none') warn.push('etcd');
      if (s.enc === 'none') warn.push('blob'); else ok.push('blob');
      if (dyn) ok.push('wi', 'db');
      return {
        metrics, verdict, notes: notes.slice(0, 4), labels, flow, hide, err, warn, ok,
        hot: ['app'],
        badges: { vault: [dyn ? 'TTL 1 h' : s.rot === 'never' ? 'forever' : s.days + ' d', dyn ? 'ok' : s.rot === 'never' ? 'err' : 'info'] }
      };
    }
  },

  widget: {
    title: 'Envelope encryption lab and leaked-secret timeline',
    caption: '<b>Envelope</b>: real AES-256-GCM in your browser. Each record gets its own DEK, wrapped by KEK v1 with AES-KW. Rotate the KEK and only the 40-byte wrapped DEKs are rewritten; compare bytes with naive re-encryption. Revoke the KEK and every record becomes unreadable (crypto-shredding). <b>Timeline</b>: drag the leak and detection times to compare a static key with a 1-hour dynamic credential.'
  },

  realWorld: {
    intro: 'Most secret incidents are not clever crypto attacks: a key sat somewhere public and kept working. The standards and platform features below are the industry\'s response.',
    timeline: [
      { when: 'Nov 2016', who: 'Uber', title: 'AWS key on GitHub, 2016 breach', text: 'The FTC\'s revised complaint (2018) says intruders used an <b>AWS access key posted in a GitHub repository</b> to reach Uber\'s S3 data, downloading files with about <b>25 million names and emails</b>. Uber paid the intruders $100,000 through its bug bounty and did not disclose until Nov 2017.', src: 0 },
      { when: 'Mar 2019', who: 'NIST', title: 'FIPS 140-3 approved', text: 'FIPS 140-3, "Security Requirements for Cryptographic Modules", was approved on 22 March 2019 and took effect on 22 September 2019, superseding FIPS 140-2 and aligning with ISO/IEC 19790. Both define <b>security levels 1–4</b>; cloud KMS HSMs are typically validated at level 2 or 3.', src: 1 },
      { when: 'Sep 2022', who: 'Toyota', title: 'T-Connect access key public for ~5 years', text: 'A subcontractor uploaded T-Connect source code containing an <b>access key to a customer data server</b> to public GitHub in Dec 2017. Toyota closed the repo on 15 Sep 2022 and changed the key two days later; <b>296,019</b> email addresses and customer numbers were potentially exposed.', src: 2 },
      { when: 'May 2023', who: 'Kubernetes', title: 'KMS v2 moves to beta', text: 'KMS v2 for encrypting Secrets at rest went beta in v1.27 and later GA; v1 is deprecated since v1.28. The API server envelope-encrypts with locally derived DEKs and calls the KMS plugin far less often than v1.', src: 3 },
      { when: 'Nov 2023', who: 'AWS', title: 'EKS Pod Identity', text: 'A second way, alongside IRSA, for pods to get <b>short-lived IAM credentials</b> from their service account, through a node agent, with no keys stored in the pod.', src: 4 },
      { when: 'Mar 2024', who: 'GitGuardian', title: 'State of Secrets Sprawl 2024', text: 'Reported <b>12.8 million</b> new secret occurrences on public GitHub in 2023, up 28% on 2022, and that over 90% of exposed secrets were still valid five days after the leak. Vendor research: the trend matters more than the exact count.', src: 5 },
      { when: 'ongoing', who: 'AWS', title: 'KMS automatic rotation keeps old material', text: 'With rotation enabled, KMS generates new key material on schedule and <b>keeps all previous versions</b> to decrypt existing ciphertext; it does not re-encrypt data. This is why envelope rotation is cheap.', src: 6 },
      { when: 'ongoing', who: 'Google Cloud', title: 'Envelope encryption guidance', text: 'Cloud KMS documents the DEK/KEK pattern: generate a DEK locally, encrypt data, wrap the DEK with a KEK that never leaves KMS, store the wrapped DEK with the data; KMS encrypt calls are size-limited (64 KiB), which is part of the reason.', src: 7 },
      { when: 'ongoing', who: 'HashiCorp', title: 'Vault dynamic secrets', text: 'Vault\'s validated design describes dynamic secrets: credentials generated on request, tied to a <b>lease</b> that sets their lifetime, and revoked by Vault when the lease ends.', src: 8 }
    ],
    lessons: [
      'Assume secrets <b>will</b> leak. Design for a small blast radius and a short life, then detect fast.',
      'Remove the static secret rather than guarding it better: <b>workload identity + dynamic credentials</b>.',
      'A leak response is <b>revoke → rotate → audit</b>. Deleting the commit is not a response.',
      'Envelope encryption makes key rotation and deletion cheap: rotate KEKs, re-wrap DEKs, crypto-shred by destroying keys.'
    ],
    sources: [
      { title: 'FTC: Uber agrees to expanded settlement (revised complaint on the 2016 breach)', url: 'https://www.ftc.gov/node/45780', pub: 'US Federal Trade Commission, Apr 2018' },
      { title: 'Announcing Approval and Issuance of FIPS 140-3', url: 'https://csrc.nist.gov/News/2019/approval-and-issuance-of-fips-140-3', pub: 'NIST CSRC, 2019' },
      { title: 'Toyota says customer email addresses exposed for five years', url: 'https://techcrunch.com/2022/10/12/toyota-customer-email-addresses-exposed/', pub: 'TechCrunch, Oct 2022' },
      { title: 'Kubernetes 1.27: KMS V2 Moves to Beta', url: 'https://kubernetes.io/blog/2023/05/16/kms-v2-moves-to-beta/', pub: 'Kubernetes blog, May 2023' },
      { title: 'Amazon EKS Pod Identity: a new way for applications on EKS to obtain IAM credentials', url: 'https://aws.amazon.com/blogs/containers/amazon-eks-pod-identity-a-new-way-for-applications-on-eks-to-obtain-iam-credentials', pub: 'AWS Containers Blog, Nov 2023' },
      { title: 'The State of Secrets Sprawl 2024', url: 'https://blog.gitguardian.com/the-state-of-secrets-sprawl-2024/', pub: 'GitGuardian, Mar 2024' },
      { title: 'Rotate AWS KMS keys', url: 'https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html', pub: 'AWS KMS Developer Guide' },
      { title: 'Envelope encryption', url: 'https://docs.cloud.google.com/kms/docs/envelope-encryption', pub: 'Google Cloud KMS documentation' },
      { title: 'Dynamic secrets management', url: 'https://developer.hashicorp.com/validated-designs/vault/administration-guide/dynamic-secrets-management', pub: 'HashiCorp Validated Designs' },
      { title: 'Using a KMS provider for data encryption', url: 'https://www.kubernetes.io/docs/tasks/administer-cluster/kms-provider/', pub: 'Kubernetes documentation' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Secret type', '<b>Static</b> secret, rotated on a schedule: works with anything', '<b>Dynamic</b> credential per client with a lease: tiny blast radius', 'Dynamic for databases and cloud APIs that support it; static + automatic rotation for third-party API keys that cannot be minted on demand'],
      ['Secrets manager', '<b>Vault / OpenBao</b>: multi-cloud, dynamic engines, PKI; you run it (HA, unseal, upgrades)', '<b>Cloud native</b> (AWS SM, GCP SM, Azure KV): managed, IAM-integrated, per-secret price', 'Cloud native when you live in one cloud; Vault when you span clouds and on-prem or need many dynamic engines'],
      ['Delivery to pods', '<b>External Secrets Operator</b>: syncs into K8s Secrets, apps unchanged', '<b>CSI driver / SDK</b>: mounted files or direct API calls, no Secret object', 'ESO for compatibility (env vars, existing charts) with etcd KMS encryption; CSI or SDK for the most sensitive values'],
      ['Data encryption', '<b>TDE / disk encryption</b>: transparent, protects media and backups', '<b>Application envelope encryption</b>: per-field or per-tenant keys, survives SQL access', 'TDE everywhere as a baseline; envelope for PII, payment and per-tenant data that needs crypto-shredding'],
      ['Key custody', '<b>Cloud KMS</b> (multi-tenant HSMs, FIPS 140 L3 for the HSMs in major clouds)', '<b>Dedicated HSM / external key store</b>: your hardware, your control', 'Cloud KMS by default; dedicated or external keys only when regulation or sovereignty demands it, accepting cost and availability risk'],
      ['DEK granularity', '<b>Per object</b>: one KMS call each, smallest blast radius', '<b>Cached / per tenant</b>: few KMS calls, a leaked DEK opens many objects', 'Per object for low volume; cache DEKs for minutes or per tenant for high throughput, bounded by count and time']
    ]
  },
  failures: [
    { f: 'Secret committed to Git (or baked into an image layer)', detect: 'Push protection and scanners on every repo, including personal forks; provider alerts (AWS, GitHub secret scanning partners)', fix: 'Revoke at the provider first, then rotate, then audit usage; rewriting history is cleanup, not remediation.' },
    { f: 'Secrets printed in CI or app logs', detect: 'Log scanning for key patterns; masked-variable warnings in CI', fix: 'CI OIDC instead of stored keys; masking; never pass secrets as CLI args; structured logging with redaction.' },
    { f: 'Rotation breaks production', detect: 'Auth-failure spike right after a rotation', fix: 'Two valid versions during the switch (AWSCURRENT / AWSPREVIOUS, dual DB users); consumers re-read on auth failure; test rotation in staging.' },
    { f: 'Secrets manager or KMS outage stops the fleet', detect: 'Login and Decrypt error rates; startup failures', fix: 'HA cluster or multi-region keys; cache leases and DEKs with bounded TTL; lease renewal well before expiry.' },
    { f: 'Kubernetes Secrets readable in etcd backups or via broad RBAC', detect: 'Audit who can <code>get/list secrets</code>; inspect an etcd snapshot', fix: 'KMS v2 encryption at rest; least-privilege RBAC; CSI driver for sensitive values.' },
    { f: 'KEK deleted or disabled by mistake', detect: 'Decrypt failures; KMS key state alarms', fix: 'Deletion waiting period (AWS: 7–30 days), key policy that limits who can schedule deletion, alarms on DisableKey/ScheduleKeyDeletion.' },
    { f: 'Secret zero: a bootstrap token stored next to the app', detect: 'Long-lived Vault tokens or AppRole secret IDs in config', fix: 'Platform identity (Kubernetes auth, IAM auth, IRSA / Pod Identity, GKE Workload Identity) so nothing has to be stored.' }
  ],

  interview: [
    { q: 'What is envelope encryption and why does every KMS use it?', a: '<p>Data is encrypted with a <b>data encryption key (DEK)</b>, usually AES-256-GCM, locally in the app. The DEK is then encrypted ("wrapped") by a <b>key encryption key (KEK)</b> that lives in the KMS/HSM and never leaves it. You store the ciphertext with the wrapped DEK.</p><ul><li><b>Performance</b>: bulk data is encrypted locally; only a small DEK goes to KMS (KMS APIs cap input size, e.g. 4 KB on AWS, 64 KiB on GCP).</li><li><b>Rotation</b>: a new KEK version only needs DEKs re-wrapped, not data re-encrypted.</li><li><b>Blast radius and deletion</b>: per-object or per-tenant DEKs; destroying a KEK crypto-shreds everything under it.</li></ul>', lvl: 'core' },
    { q: 'How does KMS key rotation work, and does it re-encrypt my data?', a: '<p>Automatic rotation in AWS KMS creates <b>new key material</b> under the same key ID on a schedule (yearly by default) and <b>keeps every old version</b> so existing ciphertext still decrypts; the ciphertext records which version was used. New encryptions use the newest material. It does <b>not</b> re-encrypt existing data.</p><p>If policy requires old data under new material, re-wrap the DEKs (<code>ReEncrypt</code>). Re-encrypting the data itself is needed only if a DEK is suspected compromised.</p>', fu: 'Why is rotation then still useful? (It limits how much data any one key version protects and the cryptoperiod, per NIST SP 800-57.)', lvl: 'core' },
    { q: 'What are dynamic secrets? Walk through Vault\'s database secrets engine.', a: '<p>Vault holds a privileged connection to Postgres. A <b>role</b> defines SQL creation statements and TTLs. When an authenticated client reads <code>database/creds/role</code>, Vault creates a <b>unique user</b> with a random password and returns it with a <b>lease</b> (for example 1 h, renewable to 24 h). On expiry or revoke, Vault drops the user.</p><p>Benefits: every pod has its own credential (attributable in DB logs), a leak is worth one TTL, and <code>vault lease revoke -prefix</code> kills them all at once in an incident.</p>', lvl: 'core' },
    { q: 'What is the "secret zero" problem and how do you solve it?', a: '<p>To fetch secrets from a secrets manager, the app must authenticate, and that credential is itself a secret: who protects it? Storing a Vault token in an env var just moves the problem.</p><p>Solve it with <b>platform identity</b>: the platform already knows the workload. Kubernetes projects a signed service-account token; AWS (IRSA, EKS Pod Identity), GCP Workload Identity and Azure workload identity exchange it for short-lived cloud credentials; Vault\'s Kubernetes or JWT auth accepts it. Nothing long-lived is ever written to the pod.</p>', lvl: 'core' },
    { q: 'Are Kubernetes Secrets secure?', a: '<p>Not by default. Values are <b>base64-encoded, not encrypted</b>, stored in etcd, readable by anyone with <code>get</code> or <code>list</code> on secrets in the namespace, and by anyone who can create a pod that mounts them.</p><p>Hardening: an <code>EncryptionConfiguration</code> with the <b>KMS v2</b> provider (envelope encryption in the API server), least-privilege RBAC, no human <code>list secrets</code>, and External Secrets Operator or the Secrets Store CSI driver to source values from a real secrets manager.</p>', lvl: 'core' },
    { q: 'An AWS access key was just pushed to a public GitHub repo. What do you do, in order?', a: '<ol><li><b>Revoke</b>: deactivate the key in IAM immediately. Assume it was scraped within minutes.</li><li><b>Rotate</b>: issue a replacement (better: move the consumer to a role) and redeploy consumers.</li><li><b>Audit</b>: search CloudTrail for every call by that key ID since the commit time; look for new IAM users, keys, instances, data reads.</li><li><b>Contain</b>: remove anything the attacker created; consider disclosure obligations if data was read.</li><li><b>Fix the cause</b>: push protection, pre-commit scanning, and no static keys.</li></ol><p>Removing the commit comes last: forks and clones already have it.</p>', lvl: 'core' },
    { q: 'What do FIPS 140-2 / 140-3 levels mean, and when do you need an HSM?', a: '<p>FIPS 140 (NIST) validates cryptographic modules at <b>four levels</b>: L1 approved algorithms; L2 adds tamper evidence and role-based authentication; L3 adds tamper resistance/response and identity-based authentication; L4 protects against environmental attacks. FIPS 140-3 (effective Sep 2019) replaced 140-2 and aligns with ISO/IEC 19790.</p><p>Need an HSM when regulation demands a validated module (FedRAMP, PCI for some keys) or keys must be non-exportable. Cloud KMS already runs on validated HSMs; a dedicated HSM is for single-tenant control.</p>', lvl: 'deep' },
    { q: 'How do you rotate a database password without downtime?', a: '<p>Use <b>two valid credentials</b> during the switch. Pattern: create the new password (or a second DB user), store it as the pending version, test it, promote it to current, let consumers pick it up (they re-read on auth failure or on a schedule), then retire the old one after the longest consumer refresh interval. AWS Secrets Manager rotation functions follow createSecret → setSecret → testSecret → finishSecret with <code>AWSCURRENT</code>/<code>AWSPREVIOUS</code> labels.</p><p>Better: dynamic credentials, where every pod already has its own user and rotation is just expiry.</p>', lvl: 'deep' },
    { q: 'What is crypto-shredding and where does it help?', a: '<p>Encrypt data with keys scoped to a tenant or a person, then <b>destroy the key</b> to make every copy (including backups and replicas) unreadable. It is a practical answer to GDPR erasure across immutable backups and logs, and to tenant off-boarding.</p><p>Caveats: the key must be truly destroyed (KMS deletion after its waiting period), plaintext must never have been copied elsewhere, and regulators may still expect primary data deleted.</p>', lvl: 'deep' },
    { q: 'Design secrets for 300 microservices across two clouds.', a: '<p>One control plane, local delivery: <b>Vault</b> (or OpenBao) clusters per region with performance replication, auto-unseal via each cloud\'s KMS. Workloads authenticate with Kubernetes or cloud IAM auth. Databases use the <b>database engine</b>; cloud APIs use the cloud secrets engines or native workload identity directly. Third-party keys live in KV v2 with rotation jobs.</p><p>Data: envelope encryption with per-tenant KEKs in each cloud\'s KMS. Push protection on every repo, CI via OIDC, Vault audit logs to the SIEM, and a quarterly leak drill.</p>', fu: 'What breaks if Vault is down? (New pods cannot start; cache leases, renew early, run HA, and keep break-glass procedures.)', lvl: 'deep' },
    { q: 'Teams resist moving off <code>.env</code> files. How do you convince them?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S</b>: 40 services kept secrets in <code>.env</code> files; a scan found 120 secrets in Git history, 30 still valid. <b>T</b>: move to a secrets manager without stalling delivery. <b>A</b>: showed each team its own findings, revoked the live ones, built a paved road (a Helm value that wires Vault Kubernetes auth plus a Spring config import, 10 lines), enabled push protection, migrated the payment path first. <b>R</b>: in two quarters 90% of services used it, leaked-valid secrets dropped to zero in scans, and rotation became a config change.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Python: envelope encryption with AWS KMS GenerateDataKey + AES-GCM', lang: 'python',
      code: `# pip install boto3 cryptography      (Python 3.11+)
import os, boto3
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

kms = boto3.client("kms")
KEK = "alias/orders-data"                      # KMS key; never leaves the HSM

def encrypt(plaintext: bytes, tenant: str) -> dict:
    ctx = {"tenant": tenant}                   # bound to the wrapped DEK, logged in CloudTrail
    dk = kms.generate_data_key(KeyId=KEK, KeySpec="AES_256", EncryptionContext=ctx)
    dek = dk["Plaintext"]                      # 32 bytes, use then drop
    nonce = os.urandom(12)                     # 96-bit nonce, never reuse with the same DEK
    aad = tenant.encode()
    ct = AESGCM(dek).encrypt(nonce, plaintext, aad)
    del dek                                    # best effort: Python cannot truly zero bytes
    return {"ciphertext": ct, "nonce": nonce, "tenant": tenant,
            "wrapped_dek": dk["CiphertextBlob"], "kek": dk["KeyId"]}

def decrypt(rec: dict, tenant: str) -> bytes:
    dek = kms.decrypt(CiphertextBlob=rec["wrapped_dek"],
                      EncryptionContext={"tenant": tenant})["Plaintext"]
    return AESGCM(dek).decrypt(rec["nonce"], rec["ciphertext"], tenant.encode())

def rewrap(rec: dict, new_kek: str) -> dict:
    """Move a DEK under another key. Data bytes are untouched."""
    out = kms.re_encrypt(CiphertextBlob=rec["wrapped_dek"],
                         SourceEncryptionContext={"tenant": rec["tenant"]},
                         DestinationKeyId=new_kek,
                         DestinationEncryptionContext={"tenant": rec["tenant"]})
    return {**rec, "wrapped_dek": out["CiphertextBlob"], "kek": out["KeyId"]}`,
      note: 'For high throughput, use the AWS Encryption SDK (or Google Tink) which caches DEKs with limits on age and message count, instead of one KMS call per object. AES-GCM nonces must be unique per key: random 96-bit nonces are fine up to about 2<sup>32</sup> messages per DEK (NIST SP 800-38D). The record keeps <code>tenant</code> so <code>rewrap</code> can rebuild the encryption context.'
    },
    {
      title: 'Spring Boot 3: secrets via config import (AWS Secrets Manager or Vault)', lang: 'yaml',
      code: `# Option A: AWS Secrets Manager
# dependency: io.awspring.cloud:spring-cloud-aws-starter-secrets-manager (3.x)
# credentials come from the pod's IAM role (EKS Pod Identity / IRSA), not a key.
spring:
  config:
    import: "aws-secretsmanager:prod/orders/db;optional:aws-secretsmanager:prod/orders/stripe"
  # a JSON secret {"username": "...", "password": "..."} becomes the properties
  # username / password; map them explicitly:
  datasource:
    url: jdbc:postgresql://orders-db:5432/orders
    username: \${username}
    password: \${password}
---
# Option B: HashiCorp Vault dynamic DB credentials
# dependencies: spring-cloud-starter-vault-config, spring-cloud-vault-config-databases
spring:
  config:
    import: "vault://"
  cloud:
    vault:
      uri: https://vault.internal:8200
      authentication: KUBERNETES          # service-account token, no stored Vault token
      kubernetes:
        role: orders-app
      database:
        enabled: true
        role: orders-rw                    # sets spring.datasource.username/password
        backend: database
      config:
        lifecycle:
          enabled: true                    # renews the lease before it expires`,
      note: 'Pick one option per application. Spring Cloud Vault renews leases, but a credential that reaches <code>max_ttl</code> is not swapped into an existing Hikari pool by itself: size <code>max_ttl</code> above your pod lifetime or rotate pods. Secrets named in <code>spring.config.import</code> are resolved before the context starts, so a missing required secret fails fast.'
    },
    {
      title: 'Vault: a Postgres dynamic-secret role bound to a Kubernetes service account', lang: 'bash',
      code: `# 1. Database secrets engine with a privileged connection Vault owns
vault secrets enable database
vault write database/config/orders \\
    plugin_name=postgresql-database-plugin \\
    connection_url="postgresql://{{username}}:{{password}}@orders-db:5432/orders" \\
    allowed_roles="orders-rw" username="vault_admin" password="bootstrap-only"
vault write -force database/rotate-root/orders     # now only Vault knows it

# 2. Role: SQL run for every lease
cat > create.sql <<'SQL'
CREATE ROLE "{{name}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO "{{name}}";
SQL
vault write database/roles/orders-rw db_name=orders \\
    creation_statements=@create.sql default_ttl=1h max_ttl=24h

# 3. Policy + Kubernetes auth: no secret zero
vault policy write orders-app - <<'HCL'
path "database/creds/orders-rw" { capabilities = ["read"] }
HCL
vault auth enable kubernetes
vault write auth/kubernetes/config kubernetes_host="https://kubernetes.default.svc"
vault write auth/kubernetes/role/orders-app \\
    bound_service_account_names=orders bound_service_account_namespaces=shop \\
    token_policies=orders-app token_ttl=1h

# 4. Use and, in an incident, kill every credential the role issued
vault read database/creds/orders-rw
vault lease revoke -prefix database/creds/orders-rw`,
      note: '<code>rotate-root</code> means the bootstrap password in step 1 stops working immediately. Running Vault inside the same cluster lets <code>auth/kubernetes/config</code> use the pod\'s own service account to call TokenReview.'
    }
  ],

  related: ['zero-trust', 'iam-oauth-oidc', 'data-privacy', 'devsecops', 'gitops', 'twelve-factor']
});
