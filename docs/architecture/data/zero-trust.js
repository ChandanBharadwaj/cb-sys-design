SD.register({
  slug: 'zero-trust',
  domain: 7,
  title: 'Zero Trust Architecture',
  examples: 'NIST 800-207, BeyondCorp, SPIFFE',
  tagline: 'Stop granting trust because a packet came from <b>inside the network</b>. Every request, from a person or a service, proves <b>who</b> it is, from <b>what device or workload</b>, and is checked against <b>policy</b> before it reaches anything.',
  tldr: {
    problem: 'Classic networks are a hard shell with a soft centre: once an attacker is inside (a phished laptop, a vendor login, one vulnerable service) every internal system trusts them, and they move sideways to the data.',
    idea: 'Remove <b>implicit trust from network location</b>. Each access request is authenticated (user <i>and</i> device, or workload identity via mTLS), authorised per resource by a <b>Policy Engine</b>, and enforced at a <b>Policy Enforcement Point</b> in front of that resource, again and again, not once at the VPN.',
    insight: 'Zero trust is <b>a strategy, not a product</b>. Say "identity for every user, device and workload; default-deny segmentation; mTLS plus an <b>authorisation</b> policy between services; context-aware access through an identity-aware proxy instead of a VPN; and logs of every decision. Migrate one protect surface at a time."',
    numbers: [
      { v: '7 tenets', l: 'of zero trust in NIST SP 800-207 (Aug 2020)' },
      { v: '5 pillars', l: 'identity, devices, networks, apps &amp; workloads, data (CISA ZTMM v2.0, Apr 2023)' },
      { v: 'FY 2024', l: 'end of fiscal year by which US agencies had to meet M-22-09 goals (OMB, Jan 2022)' }
    ]
  },

  intro: {
    what: 'Zero trust is a way of designing security where <b>no request is trusted because of where it comes from</b>. A call from an office desk or from a pod in the same cluster is treated like a call from the internet: it must prove identity and be allowed by policy, every time, for that one resource.',
    analogy: {
      icon: '🏢',
      title: 'Badge readers on every door, not one guard at the gate',
      text: 'An old office has one guard at the front gate; past him, every door is open. A zero trust office has a <b>badge reader on every door</b>. Your badge says who you are, the reader checks a central rulebook (this person, this room, this hour), and the door logs every swipe. A thief who sneaks past reception still cannot open the server room. The analogy breaks in one way: in software the "badges" are cryptographic certificates and tokens that expire in minutes or hours, so they are re-issued constantly.'
    },
    problem: 'A contractor\'s laptop is phished and the attacker uses its VPN login. Inside, the network is flat: the HR server, the build system and the payments database all answer anyone on the internal network. Within days the attacker reaches card data. <b>How do you make one stolen credential or one compromised service open only the few things it really needs, and make every step visible?</b>',
    story: [
      {
        stage: 'naive',
        title: 'A strong wall, a trusted inside',
        text: 'Users connect through a <b>VPN</b>; a firewall guards the edge. Inside, services talk to each other on a flat network with no authentication, because "only our machines are in here". Simple and fast.',
        scene: {
          nodes: [
            { id: 'u', label: 'Employee', sub: 'VPN login', kind: 'person', at: [70, 0] },
            { id: 'fw', label: 'Firewall + VPN', sub: 'the perimeter', kind: 'edge', at: [210, 0] },
            { id: 'a', label: 'Web app', sub: 'trusts network', kind: 'service', at: [70, 110] },
            { id: 'b', label: 'HR service', sub: 'no auth', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Card DB', sub: 'open port', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'u', to: 'fw' }, { from: 'fw', to: 'a' }, { from: 'a', to: 'b' }, { from: 'a', to: 'db' }],
          flow: ['u>fw', 'fw>a', ['a>b', 'a>db']]
        }
      },
      {
        stage: 'breaks',
        title: 'One foothold reaches everything',
        text: 'An attacker gets in with a <b>vendor\'s stolen password</b>. The VPN lets them onto the network, and nothing inside asks again. They scan, find the card database port open, and move sideways: <b>lateral movement</b>.',
        scene: {
          nodes: [
            { id: 'x', label: 'Attacker', sub: 'vendor login', kind: 'person', at: [70, 0] },
            { id: 'fw', label: 'Firewall + VPN', sub: 'login OK', kind: 'edge', at: [210, 0] },
            { id: 'a', label: 'Web app', sub: 'trusts network', kind: 'service', at: [70, 110] },
            { id: 'b', label: 'HR service', sub: 'no auth', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Card DB', sub: 'open port', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'x', to: 'fw' }, { from: 'fw', to: 'a' }, { from: 'fw', to: 'b' }, { from: 'fw', to: 'db' }],
          flow: ['x>fw', ['fw>a', 'fw>b', 'fw>db']],
          err: ['a', 'b', 'db'],
          badges: { db: ['data stolen', 'err'], fw: ['trusted inside', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Check identity and policy at every door',
        text: 'Users reach apps through an <b>identity-aware proxy</b> that checks user, device health and policy per request. Each service has a <b>workload identity</b> (a short-lived certificate), talks over mutual TLS, and accepts only callers a policy names. The stolen login opens one app at most.',
        scene: {
          nodes: [
            { id: 'x', label: 'Attacker', sub: 'vendor login', kind: 'person', at: [70, 0] },
            { id: 'fw', label: 'Identity proxy', sub: 'user+device+policy', kind: 'policy', at: [210, 0] },
            { id: 'a', label: 'Web app', sub: 'mTLS + authz', kind: 'service', at: [70, 110] },
            { id: 'b', label: 'HR service', sub: 'mTLS + authz', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'Card DB', sub: 'payments only', kind: 'store', at: [350, 110] }
          ],
          edges: [{ from: 'x', to: 'fw' }, { from: 'fw', to: 'a' }, { from: 'a', to: 'db' }],
          flow: ['x>fw', 'fw>a', 'a>db'],
          ok: ['fw', 'b', 'db'],
          err: ['x'],
          badges: { fw: ['unmanaged device: deny', 'ok'], db: ['web not allowed', 'ok'] }
        }
      }
    ],
    usedBy: ['Google BeyondCorp and BeyondProd', 'US federal agencies (OMB M-22-09)', 'Istio and Linkerd service meshes (automatic mTLS)', 'SPIFFE / SPIRE workload identity', 'Cloudflare Access, Google IAP, Zscaler (identity-aware access)', 'Kubernetes NetworkPolicy and Cilium'],
    whenToUse: [
      'Users work from anywhere and apps live in several clouds, so there is no single "inside" to defend',
      'Many services share a network and one compromised service must not reach the rest',
      'You must prove to auditors who accessed what, from which device, under which policy'
    ],
    whenNot: [
      'As a product purchase that replaces design work: no vendor sells "zero trust in a box"',
      'User login and delegated API access as such: that is <a href="iam-oauth-oidc.html">Identity &amp; Access: OAuth, OIDC, JWT</a>',
      'Only moving mTLS and retries out of code, with no policy work: that is a <a href="service-mesh.html">Service Mesh</a> project, and only one piece of zero trust'
    ],
    glossary: [
      { term: 'Perimeter security', def: 'Trusting everything inside a network boundary (firewall, VPN) and defending only the edge.' },
      { term: 'Lateral movement', def: 'An attacker hopping from the first compromised machine or service to others inside the network.' },
      { term: 'Micro-segmentation', def: 'Default-deny network rules per workload, so each one can reach only the few peers it needs.' },
      { term: 'mTLS', def: 'Mutual TLS: both client and server present certificates, so each side knows the other\'s identity.' },
      { term: 'SPIFFE ID / SVID', def: 'A workload identity URI such as <code>spiffe://acme.com/ns/pay/sa/api</code>, and the short-lived X.509 or JWT document that proves it.' },
      { term: 'PDP / PEP', def: 'Policy Decision Point (decides allow/deny) and Policy Enforcement Point (the proxy or gateway that applies the decision).' },
      { term: 'Device posture', def: 'Signals about the device making a request: managed or not, disk encrypted, OS patched, EDR running.' },
      { term: 'Blast radius', def: 'How much an attacker can reach or damage from one compromised identity, device or service.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Never trust, always verify</b>: no access is granted because of network location (NIST 800-207 tenet 2: "all communication is secured regardless of network location")',
      'Access is granted <b>per session, per resource</b>, by dynamic policy over identity, device and context (tenets 3 and 4)',
      '<b>Least privilege</b>: default-deny networks and authorisation; each workload reaches only the calls it needs',
      '<b>Assume breach</b>: design so one compromised user, device or service has a small, measurable blast radius',
      'Every workload has a <b>cryptographic identity</b> (SPIFFE SVID, cloud IAM) and services speak <b>mTLS plus authorisation</b>',
      '<b>Continuous verification and monitoring</b>: re-evaluate trust as signals change, log every decision (tenets 5–7)'
    ],
    nonFunctional: [
      'Blast radius of one compromised service: <b>its declared callees only</b>, not the whole cluster',
      'Workload certificates live <b>hours, not years</b> (SPIRE default X.509 SVID TTL: 1 h; Istio workload certs: 24 h) and rotate automatically',
      'Added latency per hop from mTLS + policy: <b>~1 ms or less</b> at p99 with session reuse and local policy (<em>rule of thumb</em>; measure yours)',
      'Revoking a user or device takes effect on the <b>next request</b>, not the next VPN reconnect',
      '<b>100%</b> of access decisions logged with subject, device, resource, decision and policy version',
      'Users reach internal apps <b>without a VPN</b>, with fewer prompts on healthy managed devices'
    ],
    outOfScope: [
      '<b>"Zero trust" as a product</b>: buying a ZTNA box while the internal network stays flat',
      '<b>mTLS without authorisation</b>: every service with a valid cert may call every other service',
      'Network segments named by IP ranges that nobody keeps up to date, with "temporary" any-any rules',
      'One-time login at the VPN, then hours of unchecked access',
      'Long-lived shared API keys between services, copied into config files'
    ]
  },

  calculator: {
    inputs: [
      { id: 'n', label: 'Services in the estate', min: 5, max: 2000, value: 60, log: true },
      { id: 'k', label: 'Callees each service really needs (average)', min: 1, max: 30, value: 4 },
      { id: 'pods', label: 'Replicas per service', min: 1, max: 50, value: 6 },
      { id: 'ttl', label: 'Workload certificate lifetime', min: 1, max: 720, value: 24, unit: 'h', log: true },
      { id: 'rot', label: 'Rotate at this share of lifetime', min: 20, max: 90, value: 50, unit: '%' }
    ],
    outputs: [
      { label: 'Possible service-to-service paths, flat network N×(N−1)', f: (v) => v.n * (v.n - 1) },
      { label: 'Paths allowed by default-deny policy N×k', f: (v) => v.n * Math.min(v.k, v.n - 1) },
      { label: 'Attack-surface reduction (paths removed)', fmt: 'raw', f: (v) => (100 * (1 - Math.min(v.k, v.n - 1) / (v.n - 1))).toFixed(1) + ' %' },
      { label: 'Blast radius of one compromised service: flat vs segmented (1 hop)', fmt: 'raw', f: (v) => (v.n - 1) + ' vs ' + Math.min(v.k, v.n - 1) + ' services' },
      { label: 'Certificates issued per day (every replica rotates)', f: (v) => v.n * v.pods * 24 / (v.ttl * v.rot / 100) },
      { label: 'Max use window of a stolen workload key', fmt: 'raw', f: (v) => v.ttl >= 48 ? (v.ttl / 24).toFixed(1) + ' days' : v.ttl + ' h' }
    ],
    note: 'The point of the model: on a flat network one compromised service can open <b>N−1</b> connections; with default-deny segmentation or an authorisation policy it can open only its <b>k</b> declared callees, so the surface shrinks by <b>1 − k/(N−1)</b>. Transitive pivots (hop 2, 3…) can still grow the real blast radius; the widget below shows that. Shorter certificates cut the window a stolen key is useful, but raise issuance load linearly: at 1 h lifetime and 50% rotation each replica gets 48 certs a day. Path counts are exact; the "one hop" blast radius is a lower bound, an <em>estimate</em>.'
  },

  api: [
    { m: 'POLICY', p: 'Access policy (PDP input)', d: 'Per resource: which <b>subjects</b> (user groups, SPIFFE IDs), from which <b>device posture</b> (managed, patched, EDR on), under which <b>context</b> (location, time, risk score) may do which <b>action</b>. Versioned in Git, reviewed like code.' },
    { m: 'YAML', p: 'NetworkPolicy / security groups', d: 'Default-deny ingress and egress per namespace, then one allow rule per real call path (by pod label, port). In the cloud, security groups referencing other groups, not CIDR ranges.' },
    { m: 'YAML', p: 'AuthorizationPolicy (mesh)', d: 'L7 rule at the callee\'s sidecar: allowed <b>principals</b> (SPIFFE IDs), methods and paths. Pair with <code>PeerAuthentication mode: STRICT</code> so plaintext is refused.' },
    { m: 'DOC', p: 'Protect surface & transaction flow map', d: 'Kindervag\'s method: pick a protect surface (data, assets, apps, services), map who and what calls it, place the PEP, write the policy, monitor. One surface at a time.' },
    { m: 'HTTP', p: 'Identity-aware proxy headers', d: 'After the proxy authenticates the user and device, it forwards a <b>signed assertion</b> (e.g. a JWT header) to the app. The app must verify that signature, not trust a plain <code>X-User</code> header.' },
    { m: 'SLO', p: 'Zero trust scorecard', d: 'Share of services with workload identity, share of traffic on mTLS, share of call paths covered by an explicit allow policy, apps behind the proxy instead of VPN, median cert lifetime. Mapped to the CISA ZTMM stages.' }
  ],
  dataModel: [
    { name: 'access_decision_log', store: 'SIEM / log pipeline', fields: [['decision_id', 'uuid', 'pk'], ['ts', 'timestamptz', 'idx'], ['subject', 'user or spiffe id', 'idx'], ['device_id', 'string'], ['resource', 'service + path'], ['decision', 'allow | deny'], ['reason', 'text'], ['policy_version', 'git sha']], note: 'NIST 800-207 tenet 7: collect as much information as possible about assets, network traffic and requests, and use it to improve posture.' },
    { name: 'workload_registration', store: 'SPIRE server datastore', fields: [['entry_id', 'uuid', 'pk'], ['spiffe_id', 'spiffe://td/ns/x/sa/y', 'idx'], ['parent_id', 'node agent id', 'fk'], ['selectors', 'k8s:ns, k8s:sa, image'], ['x509_svid_ttl', 'seconds']], note: 'Selectors are attested facts about the workload (namespace, service account, image), not secrets it presents.' },
    { name: 'device_posture', store: 'MDM / EDR inventory', fields: [['device_id', 'cert serial', 'pk'], ['owner', 'user id', 'idx'], ['managed', 'bool'], ['os_patch_age_days', 'int'], ['disk_encrypted', 'bool'], ['edr_healthy', 'bool'], ['last_seen', 'ts']], note: 'BeyondCorp\'s device inventory: access depends on what is known about the device, not only who the user is.' },
    { name: 'service_call_graph', store: 'Git (policy repo)', fields: [['caller', 'spiffe id', 'pk'], ['callee', 'spiffe id', 'pk'], ['methods', 'GET /x, POST /y'], ['owner_team', 'string'], ['reviewed_at', 'date']], note: 'The source of truth that generates NetworkPolicies and AuthorizationPolicies. Observed traffic is compared against it.' }
  ],

  architecture: {
    title: 'NIST 800-207 logical components: PDP (Policy Engine + Administrator) and PEPs for users and workloads',
    nodes: [
      { id: 'user', label: 'Employee', sub: 'subject', kind: 'person', wide: [90, 0], tall: [70, 0], tip: 'A person requesting access. In zero trust the user is only one input: the device and the context matter too.' },
      { id: 'idp', label: 'Identity provider', sub: 'SSO + MFA', kind: 'external', wide: [290, 0], tall: [210, 0], tip: 'Okta, Entra ID, Google: authenticates the user (phishing-resistant MFA per M-22-09) and supplies group membership to the Policy Engine.' },
      { id: 'pe', label: 'Policy Engine', sub: 'decides (PDP)', kind: 'policy', wide: [490, 0], tall: [210, 105], tip: 'NIST 800-207: the component that makes the grant/deny decision, using enterprise policy plus inputs such as identity, device posture and threat intelligence (the "trust algorithm").' },
      { id: 'pa', label: 'Policy Admin', sub: 'configures PEPs', kind: 'policy', wide: [690, 0], tall: [350, 105], tip: 'NIST 800-207: establishes or shuts down the path between subject and resource by commanding the PEPs, e.g. issuing session tokens or pushing proxy config. PE + PA together form the Policy Decision Point.' },
      { id: 'sig', label: 'Signals', sub: 'MDM · EDR · threat intel', kind: 'external', wide: [890, 0], tall: [350, 0], tip: 'Policy inputs: device inventory and posture, continuous diagnostics (CDM), threat intelligence, activity logs, SIEM. These make access context-aware.' },
      { id: 'dev', label: 'Managed laptop', sub: 'device cert', kind: 'client', wide: [90, 110], tall: [70, 105], tip: 'The device presents its own certificate, so the proxy can look up its posture: managed, encrypted, patched, EDR healthy.' },
      { id: 'iap', label: 'Identity proxy', sub: 'PEP for users', kind: 'edge', wide: [290, 110], tall: [70, 210], tip: 'Identity-aware proxy (BeyondCorp access proxy, Google IAP, Cloudflare Access). Replaces the VPN: every request is checked against user, device and policy before it reaches the app.' },
      { id: 'spire', label: 'SPIRE server', sub: 'issues SVIDs', kind: 'compute', wide: [890, 110], tall: [350, 210], tip: 'Attests each workload (namespace, service account, image) and issues short-lived X.509 SVIDs. Istio\'s istiod plays the same CA role inside a mesh.' },
      { id: 'web', label: 'Orders service', sub: 'spiffe://…/orders', kind: 'service', wide: [290, 220], tall: [70, 315], tip: 'Receives the user request from the proxy, then calls Payments over mTLS with its own workload identity.' },
      { id: 'pep', label: 'Envoy sidecar', sub: 'PEP: mTLS + authz', kind: 'edge', wide: [490, 220], tall: [210, 315], tip: 'The workload PEP in front of Payments. Terminates mTLS, reads the caller\'s SPIFFE ID from its certificate and evaluates the AuthorizationPolicy (or asks OPA) before forwarding.' },
      { id: 'pay', label: 'Payments service', sub: 'protect surface', kind: 'service', wide: [690, 220], tall: [350, 315], tip: 'The resource being protected. Only Orders, with method POST /charge, is allowed.' },
      { id: 'db', label: 'Card vault', sub: 'payments only', kind: 'store', wide: [690, 330], tall: [350, 420], tip: 'Reachable only from Payments\' identity; network policy blocks everything else even at L3/L4.' },
      { id: 'legacy', label: 'Report job', sub: 'compromised', kind: 'compute', wide: [290, 330], tall: [70, 420], tip: 'A legacy batch job with an old library. It has a valid workload identity, so mTLS alone would let it in. Authorisation policy is what stops it.' }
    ],
    edges: [
      { from: 'user', to: 'dev' },
      { from: 'dev', to: 'iap', label: 'HTTPS' },
      { from: 'user', to: 'idp', dashed: true },
      { from: 'idp', to: 'pe', dashed: true },
      { from: 'sig', to: 'pe', dashed: true, bend: -0.25 },
      { from: 'pe', to: 'pa' },
      { from: 'iap', to: 'pe', bidi: true },
      { from: 'pa', to: 'pep', dashed: true },
      { from: 'iap', to: 'web' },
      { from: 'web', to: 'pep', label: 'mTLS' },
      { from: 'pep', to: 'pay' },
      { from: 'pay', to: 'db' },
      { from: 'spire', to: 'pay', dashed: true },
      { from: 'spire', to: 'web', dashed: true, bend: -0.2 },
      { from: 'legacy', to: 'pep', label: 'mTLS' }
    ]
  },

  scenarios: [
    {
      id: 'user', title: 'User access without a VPN', tone: 'ok',
      steps: [
        { text: 'An employee opens <code>orders.corp.example</code> from a laptop at home. There is <b>no VPN</b>: the app\'s DNS name points at the <b>identity-aware proxy</b>, the PEP for users.', flow: ['user>dev', 'dev>iap'] },
        { text: 'The proxy redirects to SSO. The <b>IdP</b> authenticates the user with phishing-resistant MFA (FIDO2 / passkey).', flow: ['user>idp', 'idp>pe'], badges: { idp: 'MFA ✓' } },
        { text: 'The <b>Policy Engine</b> combines user groups, the device certificate\'s <b>posture</b> from MDM/EDR (managed, disk encrypted, patched) and risk signals.', flow: ['iap>pe', 'sig>pe'], badges: { sig: 'patched · EDR on' } },
        { text: 'Decision: allow <b>this user, on this device, to this app</b>. The proxy forwards with a signed identity assertion; the app verifies it.', flow: ['pe>iap', 'iap>web'], ok: ['iap', 'web'], badges: { iap: ['allow', 'ok'] }, tone: 'ok' },
        { text: 'Access is per app, not per network: the same session cannot reach Payments or the card vault because no policy grants it.', nodes: ['pay', 'db'], ok: ['pay', 'db'], tone: 'ok' }
      ]
    },
    {
      id: 's2s', title: 'Service to service: SVID, mTLS, authorisation', tone: 'info',
      steps: [
        { text: 'At startup the Orders pod\'s SPIRE agent <b>attests</b> it (namespace <code>shop</code>, service account <code>orders</code>) and SPIRE issues an <b>X.509 SVID</b> for <code>spiffe://acme.com/ns/shop/sa/orders</code>, valid about an hour.', flow: ['spire>web'], badges: { web: 'SVID · 1 h' } },
        { text: 'Orders calls Payments. The sidecars perform <b>mutual TLS</b>: each side proves its SPIFFE ID with its certificate; no API key or password crosses the wire.', flow: ['web>pep'], badges: { pep: 'mTLS ✓' } },
        { text: 'The sidecar is the <b>PEP</b>. It checks the AuthorizationPolicy pushed by the control plane (the Policy Administrator role): principal <code>…/sa/orders</code> may <code>POST /charge</code>.', flow: ['pa>pep'], ok: ['pep'], badges: { pep: ['allow', 'ok'] } },
        { text: 'Payments reaches the card vault, which a NetworkPolicy also restricts at L3/L4: <b>defence in depth</b>, two independent controls.', flow: ['pep>pay', 'pay>db'], ok: ['pay', 'db'], tone: 'ok' }
      ]
    },
    {
      id: 'breach', title: 'Failure: compromised job, mTLS but no authorisation', tone: 'err',
      steps: [
        { text: 'A legacy report job is exploited through an old library. The attacker now runs code <b>with the job\'s valid workload identity</b>.', nodes: ['legacy'], err: ['legacy'], badges: { legacy: ['RCE', 'err'] }, tone: 'err' },
        { text: 'The mesh has <b>mTLS everywhere</b>, so the team felt safe. But mTLS only proves <i>who</i> is calling. With no AuthorizationPolicy, any authenticated peer is allowed.', flow: ['legacy>pep'], warn: ['pep'], badges: { pep: ['mTLS ✓ · no policy', 'warn'] }, tone: 'warn' },
        { text: 'The attacker calls <code>POST /refund</code> on Payments and reads the card vault through it. Encryption in transit did nothing against an <b>authenticated insider</b>.', flow: ['pep>pay', 'pay>db'], err: ['pay', 'db'], badges: { db: ['data exfiltrated', 'err'] }, tone: 'err' },
        { text: 'Fix: <b>default-deny</b> AuthorizationPolicy on Payments allowing only <code>…/sa/orders</code> for <code>POST /charge</code>. The next attempt gets <b>403 RBAC: access denied</b>, and the denial is logged and alerted.', flow: ['legacy>pep'], ok: ['pep', 'pay'], err: ['legacy'], badges: { pep: ['deny: principal not allowed', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'posture', title: 'Continuous verification: device posture changes', tone: 'warn',
      steps: [
        { text: 'An hour into a session, EDR on the laptop reports <b>malware detected</b>; MDM marks the device non-compliant.', flow: ['sig>pe'], warn: ['dev'], badges: { dev: ['EDR alert', 'warn'] }, tone: 'warn' },
        { text: 'Because trust is evaluated <b>per request</b>, the next call from that laptop is re-scored by the Policy Engine. Risk now exceeds the threshold for the orders app.', flow: ['dev>iap', 'iap>pe'], badges: { pe: 'risk ↑' } },
        { text: 'The Policy Administrator tells the proxy to <b>end the session</b>. The user is asked to remediate; access from a healthy device still works.', flow: ['pe>pa', 'pe>iap'], err: ['dev'], ok: ['iap'], badges: { iap: ['session revoked', 'ok'] }, tone: 'ok' },
        { text: 'With a VPN, the tunnel would have stayed up until it timed out, often for a whole working day.', nodes: ['iap'], tone: 'info' }
      ]
    },
    {
      id: 'scale', title: 'At scale: certificates for 3,600 workloads', tone: 'warn',
      steps: [
        { text: '600 services × 6 replicas = 3,600 workloads. With 1-hour SVIDs rotated at half-life, SPIRE issues about <b>173,000 certificates a day</b>; with 24 h certs, about 7,200. (Illustrative arithmetic, see Model it.)', nodes: ['spire'], hot: ['spire'], badges: { spire: '≈ 2 certs/s' } },
        { text: 'Signing is cheap, but the CA is now <b>tier-0</b>: if it is down longer than the remaining cert lifetime, workloads cannot renew and mTLS starts failing.', nodes: ['spire', 'web', 'pay'], warn: ['spire'], badges: { spire: ['tier-0', 'warn'] }, tone: 'warn' },
        { text: 'Mitigate: run SPIRE servers highly available, renew at 50% of lifetime so there is slack, alert on SVIDs near expiry, and use an upstream CA or HSM-backed root.', nodes: ['spire'], ok: ['spire'], tone: 'ok' },
        { text: 'Policy scale: generate NetworkPolicies and AuthorizationPolicies from the reviewed <b>call graph</b> in Git, and diff observed traffic against it before switching from audit to enforce.', nodes: ['pa', 'pep'], ok: ['pa'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick the network model, how services authenticate, how users get in, and the workload certificate lifetime. Scores are illustrative judgements based on NIST 800-207 and CISA ZTMM v2.0, not measurements.',
    diagram: null,
    controls: [
      { id: 'net', label: 'Network model', type: 'seg', value: 'micro', options: [
        { v: 'flat', l: 'Flat perimeter' }, { v: 'vlan', l: 'VLAN segments' }, { v: 'micro', l: 'Micro-segmentation' }] },
      { id: 'svc', label: 'Service-to-service auth', type: 'seg', value: 'authz', options: [
        { v: 'none', l: 'None' }, { v: 'key', l: 'Shared API key' }, { v: 'mtls', l: 'mTLS' }, { v: 'authz', l: 'mTLS + authz policy' }] },
      { id: 'usr', label: 'User access', type: 'seg', value: 'iap', options: [
        { v: 'vpn', l: 'VPN' }, { v: 'iap', l: 'Identity proxy + device posture' }] },
      { id: 'ttl', label: 'Workload cert lifetime', type: 'range', min: 1, max: 720, step: 1, value: 24, unit: 'h' }
    ],
    evaluate(s) {
      const c01 = (x) => Math.max(0, Math.min(1, x));
      const netScore = { flat: 0.1, vlan: 0.4, micro: 0.8 }[s.net];
      const svcScore = { none: 0, key: 0.25, mtls: 0.45, authz: 0.95 }[s.svc];
      const usrScore = s.usr === 'iap' ? 0.9 : 0.3;
      const ttlPen = s.svc === 'mtls' || s.svc === 'authz' ? Math.min(0.25, Math.log10(s.ttl) / 12) : 0;
      // lateral movement: best of network or identity controls stops a path; both = defence in depth
      const block = 1 - (1 - netScore) * (1 - svcScore);
      const lat = c01(block * 0.75 + usrScore * 0.25 - ttlPen);
      const ops = c01(1 - ({ flat: 0, vlan: 0.15, micro: 0.35 }[s.net] + { none: 0, key: 0.15, mtls: 0.25, authz: 0.4 }[s.svc] + (s.usr === 'iap' ? 0.1 : 0.05) + (s.ttl < 6 ? 0.1 : 0)));
      const ms = { none: 0, key: 0.05, mtls: 0.5, authz: 0.8 }[s.svc] + (s.net === 'micro' ? 0.05 : 0);
      const friction = s.usr === 'iap' ? 0.8 : 0.35;
      const audit = c01({ none: 0.05, key: 0.25, mtls: 0.55, authz: 0.9 }[s.svc] * 0.6 + (s.usr === 'iap' ? 0.4 : 0.1) + (s.net === 'micro' ? 0.05 : 0));
      const certsPerPodDay = 24 / (s.ttl * 0.5);
      const metrics = [
        { k: 'Lateral movement risk', v: lat > 0.75 ? 'low' : lat > 0.5 ? 'medium' : lat > 0.3 ? 'high' : 'very high', s: lat, hint: s.net === 'flat' && s.svc !== 'authz' ? 'one foothold reaches most services' : 'blast radius ≈ declared callees' },
        { k: 'Ops complexity', v: ops > 0.7 ? 'low' : ops > 0.45 ? 'moderate' : 'high', s: ops, hint: s.svc === 'authz' ? 'call graph + policies to own' : '' },
        { k: 'Latency per hop', v: { none: '+0 ms', key: '+0 ms', mtls: '≈ +0.5 ms (sidecar)', authz: '≈ +1 ms (sidecar + policy)' }[s.svc], s: c01(1 - ms), hint: 'rule of thumb, with session reuse' },
        { k: 'User friction', v: s.usr === 'iap' ? 'SSO per app, no tunnel' : 'connect VPN, hairpin traffic', s: friction },
        { k: 'Auditability', v: audit > 0.75 ? 'who → what, per request' : audit > 0.4 ? 'partial (IPs, some identities)' : 'IP addresses only', s: audit },
        { k: 'Cert rotations / pod / day', v: (s.svc === 'mtls' || s.svc === 'authz') ? certsPerPodDay.toFixed(certsPerPodDay < 1 ? 2 : 1) + ' (renew at 50%)' : 'n/a', s: (s.svc === 'mtls' || s.svc === 'authz') ? c01(1 - ttlPen * 4) : 0.2 }
      ];
      const notes = [];
      if (s.svc === 'mtls') notes.push('<b>mTLS without authorisation</b> authenticates and encrypts, but any service with a valid certificate may call any other. A compromised service keeps its identity, so lateral movement is barely reduced.');
      if (s.svc === 'key') notes.push('A <b>shared API key</b> is a long-lived bearer secret: copied into configs, rarely rotated, and it identifies "someone who has the key", not a workload.');
      if (s.svc === 'none' && s.net !== 'micro') notes.push('No service authentication on a ' + (s.net === 'flat' ? 'flat network' : 'VLAN') + ': this is the "chewy centre" Kindervag described in 2010.');
      if (s.net === 'vlan') notes.push('VLANs cut the network into a few large zones, but everything inside one zone still trusts everything else, and inter-VLAN firewall rules drift.');
      if (s.net === 'micro' && s.svc !== 'authz') notes.push('Micro-segmentation alone limits <b>which pods can connect</b>, by label and port; it cannot tell <code>GET /orders</code> from <code>POST /refund</code>. Add L7 authorisation for sensitive services.');
      if (s.usr === 'vpn') notes.push('A <b>VPN</b> authenticates once and then grants network-level access. NIST 800-207 and OMB M-22-09 move access decisions to the application, per request.');
      if (s.ttl > 168 && (s.svc === 'mtls' || s.svc === 'authz')) notes.push('A ' + Math.round(s.ttl / 24) + '-day certificate is a long window for a stolen key, and usually means rotation is manual. SPIRE defaults to 1 h, Istio to 24 h.');
      if (s.ttl < 6 && (s.svc === 'mtls' || s.svc === 'authz')) notes.push('Very short certs need a highly available CA: an outage longer than the remaining lifetime breaks every connection.');
      let verdict;
      if (s.svc === 'authz' && s.net === 'micro' && s.usr === 'iap' && s.ttl <= 48) verdict = '✅ <b>Zero trust in depth:</b> default-deny network, workload identity with authorisation, per-request user access and short certs.';
      else if (s.svc === 'authz' && s.usr === 'iap') verdict = '👍 <b>Identity-based controls are strong.</b> Add network micro-segmentation as a second, independent layer' + (s.ttl > 48 ? ' and shorten certificates.' : '.');
      else if (s.svc === 'mtls' && s.net !== 'micro') verdict = '⚠ <b>mTLS is not zero trust on its own.</b> Encrypted and authenticated, but every service still trusts every other. Add authorisation policy.';
      else if (s.net === 'flat' && (s.svc === 'none' || s.svc === 'key')) verdict = '❌ <b>Perimeter security.</b> One compromised service or VPN login reaches almost everything, as in the Target breach.';
      else if (s.usr === 'vpn') verdict = '⚠ <b>Workloads improved, users still on a VPN.</b> One phished login still lands on the network; move apps behind an identity-aware proxy.';
      else verdict = '👍 <b>Partly there.</b> Check the lateral movement meter and close the weakest layer next.';
      const svcSub = { none: 'no caller check', key: 'shared API key', mtls: 'mTLS, allow all', authz: 'mTLS + authz' }[s.svc];
      const labels = {
        pep: { label: s.svc === 'none' ? 'No PEP' : 'Envoy sidecar', sub: svcSub },
        iap: { label: s.usr === 'iap' ? 'Identity proxy' : 'VPN gateway', sub: s.usr === 'iap' ? 'user + device per req' : 'network access' },
        db: { label: 'Card vault', sub: { flat: 'reachable by all', vlan: 'same VLAN reachable', micro: 'payments only' }[s.net] },
        spire: { label: 'SPIRE server', sub: (s.svc === 'mtls' || s.svc === 'authz') ? 'SVID TTL ' + (s.ttl >= 48 ? Math.round(s.ttl / 24) + ' d' : s.ttl + ' h') : 'not used' }
      };
      const err = [], warn = [], ok = [];
      const breach = s.svc !== 'authz' && s.net !== 'micro';
      if (breach) err.push('pay', 'db'); else if (s.svc !== 'authz') warn.push('pay'); else ok.push('pep', 'pay');
      if (s.usr === 'vpn') warn.push('iap'); else ok.push('iap');
      const hide = (s.svc === 'mtls' || s.svc === 'authz') ? [] : ['spire'];
      return {
        metrics, verdict, notes: notes.slice(0, 4), labels, hide, err, warn, ok, hot: ['legacy'],
        flow: ['user>dev', 'dev>iap', 'iap>web', 'web>pep', 'legacy>pep', 'pep>pay', 'pay>db'],
        badges: { legacy: ['compromised', 'err'], pep: s.svc === 'authz' ? ['deny legacy', 'ok'] : s.svc === 'none' ? ['open', 'err'] : ['allows legacy', 'warn'] }
      };
    }
  },

  widget: {
    title: 'Lateral movement: perimeter vs zero trust',
    caption: 'Pick the foothold and the controls, then press <b>Attack</b>. The attacker probes every service; each attempt passes or is stopped by the <b>network policy</b> (L3/L4), the <b>mTLS handshake</b> or the <b>authorisation policy</b> at the callee\'s PEP. Any service it reaches becomes a new foothold (worst case). Watch the blast radius and the PEP\'s deny reasons.'
  },

  realWorld: {
    intro: 'Zero trust grew from an analyst\'s critique of perimeter security into Google\'s production practice and then into US federal policy.',
    timeline: [
      { when: 'Sep 2010', who: 'Forrester', title: '"No More Chewy Centers" (John Kindervag)', text: 'Kindervag named the <b>Zero Trust Model</b>: networks should not have a crunchy shell and a chewy, trusted centre. A follow-up the same year urged that security professionals "stop trusting packets as if they were people".', src: 0 },
      { when: 'Dec 2014', who: 'Google', title: 'BeyondCorp paper in USENIX ;login:', text: 'Rory Ward and Betsy Beyer described moving Google\'s employees off a privileged corporate network: access depends on <b>user and device credentials</b>, not on network location, through an access proxy.', src: 1 },
      { when: 'Dec 2013 / Mar 2014', who: 'US Senate Commerce Committee', title: 'Target breach "kill chain" analysis', text: 'Attackers entered with credentials stolen from an <b>HVAC vendor</b>, then moved from less sensitive parts of the network to systems with payment data. The report said vendor two-factor authentication and better segmentation could have stopped it.', src: 2 },
      { when: 'Dec 2019', who: 'Google', title: 'BeyondProd whitepaper', text: 'Extended BeyondCorp to workloads: no implicit trust between services, mutually authenticated service identities, isolation, and only centrally built code deployed.', src: 3 },
      { when: 'Aug 2020', who: 'NIST', title: 'SP 800-207 Zero Trust Architecture', text: 'Rose, Borchert, Mitchell and Connelly defined the <b>seven tenets</b> and the logical components: <b>Policy Engine</b> and <b>Policy Administrator</b> (together the PDP) and the <b>Policy Enforcement Point</b>.', src: 4 },
      { when: 'Jan 2022', who: 'US OMB', title: 'M-22-09 federal zero trust strategy', text: 'Required agencies to meet specific goals by the end of fiscal year 2024, including phishing-resistant MFA, device inventory, encrypted DNS and HTTP traffic, and treating internal applications as internet-accessible.', src: 5 },
      { when: 'Sep 2022', who: 'CNCF', title: 'SPIFFE and SPIRE graduate', text: 'The workload identity standard (SPIFFE IDs, SVIDs) and its reference implementation became CNCF graduated projects, used by companies such as Bloomberg, ByteDance, Pinterest and Twilio per the announcement.', src: 6 },
      { when: 'Apr 2023', who: 'CISA', title: 'Zero Trust Maturity Model v2.0', text: 'Five pillars (identity, devices, networks, applications and workloads, data), three cross-cutting capabilities (visibility and analytics, automation and orchestration, governance) and a new <b>Initial</b> stage between Traditional and Advanced.', src: 7 },
      { when: 'Sep 2023', who: 'NIST', title: 'SP 800-207A for cloud-native apps', text: 'Applies the model to multi-cloud microservices: identity-tier policies on workload identities, enforced by service mesh proxies, alongside network-tier policies.', src: 8 }
    ],
    lessons: [
      'Zero trust is a <b>strategy</b> (Kindervag): start from a protect surface and its real call flows, not from a product catalogue.',
      'Google\'s path was <b>users first (BeyondCorp), then workloads (BeyondProd)</b>; both replace network location with identity plus context.',
      'Breaches like Target\'s show the cost of a <b>flat inside</b>: the first credential is rarely the one that reaches the data.',
      'Measure progress with a maturity model (CISA ZTMM) per pillar, not as a single yes/no.'
    ],
    sources: [
      { title: 'No More Chewy Centers: Introducing The Zero Trust Model Of Information Security', url: 'https://www.forrester.com/report/No-More-Chewy-Centers/RES56682', pub: 'Forrester, John Kindervag, Sep 2010' },
      { title: 'BeyondCorp: A New Approach to Enterprise Security', url: 'https://research.google/pubs/pub43231/', pub: 'Ward & Beyer, ;login: Vol. 39 No. 6, Dec 2014' },
      { title: 'A "Kill Chain" Analysis of the 2013 Target Data Breach', url: 'https://commerce.senate.gov/services/files/6E528123-41FC-4C22-A696-A224BBADB6B5', pub: 'US Senate Committee on Commerce, Mar 2014' },
      { title: 'BeyondProd: How Google moved from perimeter-based to cloud-native security', url: 'https://cloud.google.com/blog/products/identity-security/beyondprod-whitepaper-discusses-cloud-native-security-at-google', pub: 'Google Cloud blog, Dec 2019' },
      { title: 'SP 800-207, Zero Trust Architecture', url: 'https://csrc.nist.gov/pubs/sp/800/207/final', pub: 'NIST, Aug 2020' },
      { title: 'M-22-09: Moving the U.S. Government Toward Zero Trust Cybersecurity Principles', url: 'https://www.whitehouse.gov/wp-content/uploads/2022/01/M-22-09.pdf', pub: 'OMB, Jan 2022' },
      { title: 'SPIFFE and SPIRE Projects Graduate from Cloud Native Computing Foundation Incubator', url: 'https://www.cncf.io/announcements/2022/09/20/spiffe-and-spire-projects-graduate-from-cloud-native-computing-foundation-incubator', pub: 'CNCF, Sep 2022' },
      { title: 'Zero Trust Maturity Model', url: 'https://cisa.gov/zero-trust-maturity-model', pub: 'CISA, v2.0 Apr 2023' },
      { title: 'NIST publishes SP 800-207A', url: 'https://csrc.nist.gov/News/2023/nist-publishes-sp-800-207a', pub: 'NIST, 2023' },
      { title: 'Istio Authorization Policy reference', url: 'https://istio.io/v1.17/docs/reference/config/security/authorization-policy', pub: 'Istio docs' },
      { title: 'Securing Spring Boot Applications With SSL', url: 'https://spring.io/blog/2023/06/07/securing-spring-boot-applications-with-ssl', pub: 'Spring blog, Jun 2023' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['User access', '<b>VPN</b>: familiar, network-level, one login per session', '<b>Identity-aware proxy</b>: per-app, per-request, user + device posture', 'Proxy for web apps and SSH/RDP via connectors; keep VPN only for the few protocols the proxy cannot carry, and shrink what it reaches'],
      ['Segmentation layer', '<b>Network</b> (NetworkPolicy, security groups): L3/L4, cheap, works for any protocol', '<b>Identity</b> (mesh AuthorizationPolicy, OPA): L7, knows caller ID, method, path', 'Both: network default-deny as the coarse backstop, identity policy for sensitive services. Neither alone is enough'],
      ['Workload identity', '<b>Mesh CA</b> (istiod, Linkerd): automatic, inside one mesh', '<b>SPIRE</b>: attested, works across clusters, VMs and clouds', 'Mesh CA for a single Kubernetes platform; SPIRE (or SPIRE as the mesh CA) when identity must span VMs, clouds or non-mesh workloads'],
      ['Certificate lifetime', '<b>Short</b> (1–24 h): small theft window, no revocation lists needed', '<b>Long</b> (months): fewer moving parts, but needs CRL/OCSP and manual rotation', 'Short and automated wherever a CA agent runs; long-lived only for roots and intermediates, kept offline or in an HSM'],
      ['Where policy is decided', '<b>Central PDP</b> (OPA service, ext_authz): one place, network hop', '<b>Local</b> (sidecar policy, embedded OPA): sub-ms, policy distributed as bundles', 'Distribute policy, centralise authoring and logs. A central PDP on every hop becomes a single point of failure'],
      ['Rollout', '<b>Big bang</b> enforce everywhere', '<b>Audit mode first</b>, then enforce per protect surface', 'Always audit first: log would-be denials for a week, fix the call graph, then enforce, starting with the crown-jewel data']
    ]
  },

  failures: [
    { f: '<b>Zero trust as a product</b>: a ZTNA licence bought, internal network still flat', detect: 'Scorecard: share of east-west paths with an explicit allow policy stays near 0%', fix: 'Define protect surfaces and call graphs first; buy tools to enforce them. Track CISA ZTMM stages per pillar.' },
    { f: '<b>mTLS without authorisation</b>: every certificate is accepted everywhere', detect: 'Mesh shows 100% mTLS but no AuthorizationPolicy, or policies with <code>principals: ["*"]</code>', fix: 'Default-deny AuthorizationPolicy per namespace, then explicit allows by SPIFFE principal, method and path.' },
    { f: 'Policy enforced too early: outage from a missing allow rule', detect: 'Spike in 403s / connection resets right after rollout', fix: 'Audit (dry-run) mode, compare observed traffic to the declared call graph, enforce per service with a fast rollback.' },
    { f: 'CA or SPIRE outage: certificates expire, mTLS fails everywhere', detect: 'Alerts on SVIDs with &lt; 25% lifetime left, CA error rate', fix: 'HA SPIRE servers, renew at 50% of lifetime, lifetime longer than your worst plausible CA outage, runbook for root rotation.' },
    { f: 'App trusts a forgeable identity header from the proxy', detect: 'Pen test: direct request to the app with <code>X-User: admin</code> succeeds', fix: 'App verifies the proxy\'s signed assertion (JWT), and the network only allows the proxy to reach the app.' },
    { f: 'Policy sprawl: thousands of rules nobody owns', detect: 'Rules with no owner, allow rules never hit in 90 days', fix: 'Generate policies from a reviewed call graph in Git, owner per rule, prune unused allows automatically.' },
    { f: 'Device posture checked only at login', detect: 'Sessions stay valid after MDM marks a device non-compliant', fix: 'Re-evaluate on every request or short session, subscribe the PDP to posture-change events.' }
  ],

  interview: [
    { q: 'What is zero trust, and what does NIST SP 800-207 actually say?', a: '<p>NIST SP 800-207 (Rose, Borchert, Mitchell, Connelly, <b>August 2020</b>) describes zero trust as moving defences from static, network-based perimeters to <b>users, assets and resources</b>: no implicit trust is granted based on physical or network location.</p><p>Its seven tenets, in short: all data sources and services are resources; all communication is secured <b>regardless of network location</b>; access is granted <b>per session</b>; access is decided by <b>dynamic policy</b> (identity, device, behaviour, environment); the enterprise monitors the integrity and posture of all assets; authentication and authorisation are dynamic and strictly enforced before access; and it collects as much information as possible to improve its posture.</p><p>Common misreading: "zero trust means no trust". It means <b>no implicit trust</b>; trust is earned per request and continuously re-evaluated.</p>', lvl: 'core' },
    { q: 'Name the logical components of a zero trust architecture.', a: '<ul><li><b>Policy Engine (PE)</b>: makes the grant/deny decision with a trust algorithm over policy and inputs.</li><li><b>Policy Administrator (PA)</b>: executes the decision by setting up or tearing down the path, e.g. issuing session credentials, configuring the PEP.</li><li>PE + PA together form the <b>Policy Decision Point (PDP)</b>.</li><li><b>Policy Enforcement Point (PEP)</b>: the gateway, proxy or sidecar in front of the resource that enables, monitors and terminates connections.</li></ul><p>Inputs include the IdP, device inventory and posture, threat intelligence, CDM, SIEM and activity logs. In practice: Google IAP or Cloudflare Access as user PEP, Envoy sidecars as workload PEPs, istiod or an OPA bundle server playing the PA role.</p>', lvl: 'core' },
    { q: 'Where did zero trust come from? Who coined it and what did Google add?', a: '<p><b>John Kindervag</b>, then at Forrester, introduced the Zero Trust Model in <b>2010</b> ("No More Chewy Centers"): stop treating the internal network as trusted. He describes it as a strategy, not a product.</p><p><b>Google BeyondCorp</b> (Ward and Beyer, USENIX ;login:, <b>December 2014</b>) showed it at scale for employees: no privileged corporate network; access via an access proxy based on user and <b>device</b> credentials and inventory. <b>BeyondProd</b> (2019) applied the same ideas to service-to-service traffic. NIST 800-207 (2020) and OMB M-22-09 (2022) turned it into a reference architecture and US federal policy.</p>', lvl: 'core' },
    { q: 'Why does perimeter security fail? Give a real example.', a: '<p>Perimeters assume that what is inside is friendly. Reality: phished laptops, vendor accounts, vulnerable internet-facing apps and malicious insiders all start <b>inside</b>. Once there, a flat network lets an attacker move laterally.</p><p>The <b>Target 2013 breach</b>: the US Senate Commerce Committee\'s 2014 kill-chain analysis says attackers used credentials stolen from an <b>HVAC vendor</b>, then moved from less sensitive areas to systems holding customer payment data. Vendor MFA and segmentation between the vendor portal and payment systems were missed chances. Also: cloud and remote work mean there is no single inside any more.</p>', lvl: 'core' },
    { q: 'mTLS is on everywhere in our mesh. Are we zero trust?', a: '<p>No, not by itself. mTLS gives <b>authentication</b> (each side proves a workload identity) and <b>encryption</b>. It does not say <b>who may call what</b>. If every service with a valid certificate can call every other, a compromised service keeps its valid certificate and moves laterally unchanged.</p><p>You need <b>authorisation</b> on top: default-deny AuthorizationPolicy (or OPA via ext_authz) per service allowing only named SPIFFE principals, methods and paths; plus PeerAuthentication STRICT so plaintext cannot bypass it; plus network policy as a second layer.</p>', fu: 'How do you roll out default-deny without an outage? (Audit/dry-run mode, compare observed traffic with the call graph, enforce one namespace at a time.)', lvl: 'deep' },
    { q: 'What are SPIFFE and SPIRE, and why short-lived certificates?', a: '<p><b>SPIFFE</b> is a standard for workload identity: a <b>SPIFFE ID</b> URI (<code>spiffe://trust-domain/path</code>) and an <b>SVID</b>, the verifiable document proving it, as an X.509 certificate (ID in the URI SAN) or a JWT. The Workload API delivers SVIDs to a process without it holding any bootstrap secret.</p><p><b>SPIRE</b> is the reference implementation: agents <b>attest</b> the node and the workload (Kubernetes namespace, service account, image, AWS instance identity) and the server issues SVIDs matching registration entries. Both graduated in the CNCF in 2022.</p><p>Short lifetimes (SPIRE\'s default X.509 SVID TTL is one hour) mean a stolen key is useful briefly and you rarely need revocation lists; the cost is a CA that must be highly available.</p>', lvl: 'deep' },
    { q: 'How would you replace a VPN with zero trust user access?', a: '<ol><li>Inventory apps and users; put an <b>identity-aware proxy</b> (BeyondCorp-style: Google IAP, Cloudflare Access, Zscaler, Pomerium) in front of the web apps first.</li><li>Require <b>phishing-resistant MFA</b> at the IdP and issue <b>device certificates</b> via MDM, so policy can check posture.</li><li>Write per-app policy: group + device managed + patched; step-up for admin apps.</li><li>Move SSH/RDP and thick clients through connectors; keep a small VPN for the rest and shrink its reach.</li><li>Log every decision; measure share of apps no longer needing VPN.</li></ol><p>Google\'s own migration ran over years; plan in waves, not a cut-over.</p>', lvl: 'core' },
    { q: 'Design service-to-service security for 300 microservices on Kubernetes.', a: '<ul><li><b>Identity</b>: one Kubernetes service account per service; SPIFFE IDs from the mesh CA or SPIRE; certs ≤ 24 h, auto-rotated.</li><li><b>Transport</b>: mesh-wide <code>PeerAuthentication STRICT</code>.</li><li><b>Network</b>: default-deny NetworkPolicy per namespace, allows generated from the call graph (egress too, incl. DNS).</li><li><b>Authorisation</b>: default-deny AuthorizationPolicy, allows by principal + method + path; OPA for richer rules (tenant, data class).</li><li><b>User context</b>: propagate the end user as a signed token (token exchange), so callees can check both caller service and user.</li><li><b>Observability</b>: decision logs to the SIEM, alerts on denies from unexpected principals.</li></ul><p>Roll out in audit mode, crown-jewel services first.</p>', lvl: 'deep' },
    { q: 'What is the CISA Zero Trust Maturity Model and how would you use it?', a: '<p>CISA ZTMM <b>v2.0 (April 2023)</b> has <b>five pillars</b>: identity, devices, networks, applications and workloads, data; <b>three cross-cutting capabilities</b>: visibility and analytics, automation and orchestration, governance; and <b>four stages</b>: Traditional, Initial (new in v2), Advanced, Optimal.</p><p>Use it as a <b>scorecard</b>: rate each pillar today, pick the next stage for the pillar with the biggest risk, and report progress to leadership. Misreading: it is not a checklist to finish; pillars can and do sit at different stages.</p>', lvl: 'core' },
    { q: 'Network micro-segmentation or identity-based authorisation: which first?', a: '<p>They protect different layers. <b>Network segmentation</b> (NetworkPolicy, security groups) is L3/L4: cheap, protocol-agnostic, and stops port scans and non-mesh traffic, but knows only labels and ports. <b>Identity authorisation</b> is L7: knows the caller\'s cryptographic identity, method and path, but only for traffic through the PEP.</p><p>If you already run a mesh, start with <b>identity authorisation on the crown jewels</b> (highest value per rule) and add default-deny networking namespace by namespace. Without a mesh, start with network default-deny: it needs no app changes. End state: both.</p>', lvl: 'deep' },
    { q: 'What are the common pitfalls of zero trust programmes?', a: '<ul><li>Treating it as a <b>product</b> purchase instead of an architecture change.</li><li><b>mTLS without authorisation</b>, or <code>principals: ["*"]</code>.</li><li>Big-bang enforcement causing outages, and then "temporary" allow-all rules forever.</li><li>Apps trusting unsigned identity headers behind the proxy.</li><li>Ignoring <b>devices</b> and data: only doing identity.</li><li>A CA or PDP that is a single point of failure.</li><li>No owner for policies, so they rot.</li></ul>', lvl: 'core' },
    { q: 'Leadership asks: "Why spend a year on zero trust? We have a firewall." How do you convince them?', a: '<p>Start from <b>their risk</b>, not the standard. Draw the blast radius today: from one phished laptop or one exposed service, list what is reachable (usually "almost everything"). Point to the Target case: the entry point was a vendor login, the loss was payment data.</p><p>Then propose a small, measurable first step: one protect surface (payments), call graph mapped, default-deny + mTLS + authorisation, apps behind an identity proxy. Report the blast radius before and after, and fewer VPN tickets. Tie it to obligations they already have (PCI DSS segmentation, M-22-09 for US federal suppliers, cyber insurance questionnaires). Record the decision in an ADR.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Kubernetes NetworkPolicy: default-deny, then allow orders → payments', lang: 'yaml',
      code: `# 1) Default-deny all ingress and egress for every pod in the namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: payments
spec:
  podSelector: {}            # selects every pod in the namespace
  policyTypes: ["Ingress", "Egress"]
---
# 2) Allow only pods labelled app=orders in namespace "shop" to reach payments on 8443
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-orders-to-payments
  namespace: payments
spec:
  podSelector:
    matchLabels: { app: payments }
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: shop }
          podSelector:
            matchLabels: { app: orders }   # same list item: AND, not OR
      ports:
        - { protocol: TCP, port: 8443 }
# Remember egress: payments also needs DNS (kube-dns :53) and its DB.
# Requires a CNI that enforces NetworkPolicy (Calico, Cilium, ...).`,
      note: 'Labels are not identities: anyone who can create a pod with <code>app: orders</code> in <code>shop</code> passes this rule. That is why it is paired with mTLS and an identity-based policy below.'
    },
    {
      title: 'Istio: STRICT mTLS and authorisation by SPIFFE principal', lang: 'yaml',
      code: `apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: payments
spec:
  mtls:
    mode: STRICT                 # refuse plaintext to any pod in the namespace
---
# An ALLOW policy on a workload means: anything not matched is denied.
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: payments-allow-orders
  namespace: payments
spec:
  selector:
    matchLabels: { app: payments }
  action: ALLOW
  rules:
    - from:
        - source:
            # trust-domain/ns/<namespace>/sa/<service-account> from the peer cert
            principals: ["cluster.local/ns/shop/sa/orders"]
      to:
        - operation:
            methods: ["POST"]
            paths: ["/charge", "/charge/*"]
# A request from cluster.local/ns/reports/sa/report-job now gets
# HTTP 403 "RBAC: access denied" from the sidecar (the PEP).`,
      note: 'Principals come from the caller\'s mTLS certificate (its SPIFFE ID), so they cannot be forged by a header. Use <code>security.istio.io/v1</code> on Istio 1.22+; older meshes use <code>v1beta1</code>.'
    },
    {
      title: 'Spring Boot 3.1+: mTLS client with an SSL bundle', lang: 'java',
      code: `// application.yml (Spring Boot 3.1+ SSL bundles)
// spring:
//   ssl:
//     bundle:
//       pem:
//         payments-client:
//           reload-on-update: true            # Boot 3.2+: pick up rotated certs
//           keystore:
//             certificate: file:/run/svid/svid.pem   # this workload's cert chain
//             private-key: file:/run/svid/svid.key
//           truststore:
//             certificate: file:/run/svid/bundle.pem # trust bundle (CA)
@Configuration
class PaymentsClientConfig {

  @Bean
  RestClient paymentsClient(RestClient.Builder builder, RestClientSsl ssl) {
    return builder
        .baseUrl("https://payments.payments.svc:8443")
        .apply(ssl.fromBundle("payments-client"))   // presents client cert = mTLS
        .build();
  }
}

@Service
class ChargeService {
  private final RestClient payments;
  ChargeService(RestClient paymentsClient) { this.payments = paymentsClient; }

  ChargeResult charge(ChargeRequest req) {
    return payments.post().uri("/charge")
        .body(req)
        .retrieve()
        .body(ChargeResult.class);
  }
}`,
      note: '<code>spring.ssl.bundle.pem.*</code> arrived in Spring Boot 3.1; <code>RestClientSsl</code> with <code>RestClient</code> in 3.2, as does <code>reload-on-update</code> for hot reload when a SPIFFE helper or cert-manager rewrites the files. Without a mesh this is how the app itself does mTLS; the server side still needs an authorisation check on the caller\'s SPIFFE ID.'
    }
  ],

  related: ['iam-oauth-oidc', 'service-mesh', 'secrets-kms', 'threat-modeling', 'devsecops', 'sd:api-gateway']
});
