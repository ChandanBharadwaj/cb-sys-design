SD.register({
  slug: 'iam-oauth-oidc',
  domain: 7,
  title: 'Identity & Access: OAuth, OIDC, JWT',
  examples: 'Keycloak, Okta, Spring Security, Zanzibar',
  tagline: 'Prove <b>who</b> the user is once, hand apps a <b>short-lived, narrow token</b> instead of a password, and let every service check that token and its own <b>policy</b> on every call.',
  tldr: {
    problem: 'Many apps and services need to know who is calling and what they may do. Sharing passwords, or letting each service invent its own login, leaks credentials and makes "disable this user" impossible.',
    idea: 'One <b>authorization server</b> authenticates the user (<b>OIDC</b>) and issues <b>scoped, short-lived access tokens</b> (<b>OAuth 2.0</b>), usually signed <b>JWTs</b>. Each API validates the token locally with the published keys (JWKS), then a <b>policy</b> (RBAC, ABAC or ReBAC) decides the action.',
    insight: 'OAuth is <b>delegated authorisation</b>, not login. OIDC adds the login (the ID token). Say "Authorization Code + PKCE for every user-facing client, client credentials for machines, tokens out of the browser with a BFF, 5–15 minute JWTs, and authorisation enforced in the service, not only at the gateway".',
    numbers: [
      { v: '4 roles', l: 'resource owner, client, authorization server, resource server (RFC 6749, 2012)' },
      { v: '43–128', l: 'characters in a PKCE code_verifier (RFC 7636, 2015)' },
      { v: '< 10 ms', l: 'Zanzibar p95 check latency, trillions of ACLs (Google, USENIX ATC 2019)' }
    ]
  },

  intro: {
    what: 'Identity and access management is how a system answers two questions on every request: <b>who is this?</b> (authentication) and <b>are they allowed to do this?</b> (authorisation). OAuth 2.0, OpenID Connect and JSON Web Tokens are the open standards almost every login button and API uses to answer them.',
    analogy: {
      icon: '🏨',
      title: 'A hotel key card',
      text: 'At check-in the <b>front desk</b> checks your passport once (authentication). It gives you a <b>key card</b> that opens your room and the gym, and stops working at checkout (an access token with scopes and an expiry). Each <b>door checks the card itself</b> without phoning the desk (local token validation). The analogy breaks in one important way: a lost card keeps working until it expires unless the desk can reach every lock, which is exactly the revocation problem with self-contained tokens.'
    },
    problem: 'A photo-printing app wants your pictures from a cloud drive. The naive way is to give it your drive password. Now it can read your mail too, it keeps working forever, and you cannot cut off just that one app without changing your password everywhere. <b>How do you let an app act for a user with limited, revocable rights, without ever seeing the password?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Give the app your password',
        text: 'The app asks for your <b>username and password</b>, stores them, and sends them with every API call. Each API checks the password against the user database. It works on day one and needs no extra servers.',
        scene: {
          nodes: [
            { id: 'user', label: 'You', sub: 'type password', kind: 'person', at: [70, 0] },
            { id: 'app', label: 'Printing app', sub: 'stores password', kind: 'client', at: [210, 110] },
            { id: 'api', label: 'Photos API', sub: 'checks password', kind: 'service', at: [350, 220] }
          ],
          edges: [{ from: 'user', to: 'app' }, { from: 'app', to: 'api' }],
          flow: ['user>app', 'app>api']
        }
      },
      {
        stage: 'breaks',
        title: 'Full access, forever, everywhere',
        text: 'The app can now do <b>anything you can</b>, in every service that accepts that password. A breach of the app leaks your password. Multi-factor login cannot work, and the only way to revoke one app is to change your password for all of them.',
        scene: {
          nodes: [
            { id: 'user', label: 'You', sub: 'cannot revoke', kind: 'person', at: [70, 0] },
            { id: 'app', label: 'Printing app', sub: 'breached', kind: 'client', at: [210, 110] },
            { id: 'api', label: 'Photos API', sub: 'full access', kind: 'service', at: [350, 220] },
            { id: 'mail', label: 'Mail API', sub: 'also opens!', kind: 'service', at: [70, 220] }
          ],
          edges: [{ from: 'user', to: 'app' }, { from: 'app', to: 'api' }, { from: 'app', to: 'mail' }],
          flow: [['app>api', 'app>mail']],
          err: ['app', 'mail'],
          badges: { app: ['password leaked', 'err'], mail: ['not intended', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'A trusted desk issues narrow tokens',
        text: 'The app sends you to the <b>authorization server</b>. You log in there (with MFA), approve "read photos", and the app gets a <b>short-lived token</b> limited to that scope. The API checks the token\'s signature and scope. The app never sees your password, and you can revoke it alone.',
        scene: {
          nodes: [
            { id: 'user', label: 'You', sub: 'log in + consent', kind: 'person', at: [70, 0] },
            { id: 'as', label: 'Auth server', sub: 'issues tokens', kind: 'policy', at: [350, 0] },
            { id: 'app', label: 'Printing app', sub: 'holds token', kind: 'client', at: [210, 110] },
            { id: 'api', label: 'Photos API', sub: 'checks token', kind: 'service', at: [350, 220] }
          ],
          edges: [{ from: 'user', to: 'as' }, { from: 'as', to: 'app' }, { from: 'app', to: 'api' }],
          flow: ['user>as', 'as>app', 'app>api'],
          ok: ['api', 'as'],
          badges: { app: ['photos:read · 10 min', 'ok'] }
        }
      }
    ],
    usedBy: ['"Sign in with Google" and "Sign in with Apple"', 'GitHub and Slack app integrations', 'Keycloak (open source)', 'Okta, Auth0, Microsoft Entra ID', 'Spring Security resource servers', 'Kubernetes API server OIDC login'],
    whenToUse: [
      'More than one app or service needs to know who the user is (single sign-on)',
      'Third-party or mobile apps call your APIs on a user\'s behalf',
      'Services call each other and each must check the caller, not trust the network'
    ],
    whenNot: [
      'One server-rendered app with one database: a plain session cookie is simpler and easy to revoke',
      'Network-level identity between workloads is the real need (see <a href="zero-trust.html">Zero Trust Architecture</a>: mTLS and SPIFFE)',
      'Storing secrets or encryption keys: that is <a href="secrets-kms.html">Secrets &amp; Key Management</a>, not OAuth'
    ],
    glossary: [
      { term: 'Access token', def: 'A credential an app sends to an API. It says which user, which app, which scopes, and until when.' },
      { term: 'ID token', def: 'An OpenID Connect JWT that tells the app who logged in. It is for the app, never for calling APIs.' },
      { term: 'Scope', def: 'A named slice of access the user granted to the app, such as <code>orders:read</code>.' },
      { term: 'PKCE', def: 'Proof Key for Code Exchange: a one-time secret that stops a stolen authorization code being swapped for tokens.' },
      { term: 'JWT', def: 'JSON Web Token: base64url header, claims and signature joined by dots, verifiable without a database lookup.' },
      { term: 'JWKS', def: 'JSON Web Key Set: the public keys an authorization server publishes so APIs can verify its token signatures.' },
      { term: 'Refresh token', def: 'A longer-lived credential the client uses to get new access tokens without asking the user to log in again.' },
      { term: 'Policy engine', def: 'A component (OPA, Cedar, OpenFGA) that answers "may subject S do action A on resource R?" from rules and data.' }
    ]
  },

  requirements: {
    functional: [
      'Authenticate <b>once</b>, at the authorization server; apps never handle the user\'s password',
      '<b>Authorization Code + PKCE</b> for every client that acts for a user (web, SPA, mobile, CLI)',
      '<b>Client credentials</b> (with a private-key or mTLS client secret) for machine-to-machine calls',
      'Every resource server <b>validates the token itself</b>: signature, <code>iss</code>, <code>aud</code>, <code>exp</code>, allowed <code>alg</code>',
      '<b>Least privilege</b>: narrow scopes and audiences; exchange tokens (RFC 8693) when crossing services',
      'Coarse checks at the edge, <b>fine-grained authorisation in the service</b> from one policy model'
    ],
    nonFunctional: [
      'Local token check <b>&lt; 1 ms</b> p99 with the JWKS cached (<em>rule of thumb</em>)',
      'A stolen access token is useful for at most its TTL: <b>5–15 min</b> (<em>rule of thumb</em>)',
      'Disabling a user stops new tokens at once and old access tokens within one TTL',
      'Authorization server availability at least the product\'s login SLO (it is on every sign-in)',
      'Signing-key rotation with <b>zero downtime</b>: old and new keys overlap in the JWKS',
      'Every allow/deny is <b>auditable</b>: subject, action, resource, policy version'
    ],
    outOfScope: [
      '<b>Implicit</b> or <b>resource-owner password</b> grants in new apps (deprecated by RFC 9700)',
      'Hours-long JWTs with no revocation story',
      'Access or refresh tokens in <code>localStorage</code>',
      'Using the <b>ID token</b> as an API access token',
      'Role checks hard-coded and copy-pasted through every service'
    ]
  },

  calculator: {
    inputs: [
      { id: 'rps', label: 'API requests per second (all services)', min: 100, max: 1000000, value: 20000, log: true },
      { id: 'users', label: 'Concurrently signed-in sessions', min: 1000, max: 10000000, value: 200000, log: true },
      { id: 'ttl', label: 'Access-token lifetime', min: 1, max: 60, value: 10, unit: 'min' },
      { id: 'jwks', label: 'JWKS cache TTL per instance', min: 1, max: 60, value: 10, unit: 'min' },
      { id: 'pods', label: 'Instances validating tokens', min: 1, max: 1000, value: 80, log: true },
      { id: 'intro', label: 'Introspection round trip (opaque tokens)', min: 1, max: 50, value: 8, unit: 'ms' }
    ],
    outputs: [
      { label: 'Refresh-token grants / s at the auth server', f: (v) => v.users / (v.ttl * 60) },
      { label: 'Introspection calls / s if tokens are opaque and uncached', f: (v) => v.rps },
      { label: 'Introspection calls in flight (Little\'s law: rate × latency)', f: (v) => v.rps * v.intro / 1000 },
      { label: 'JWKS fetches / hour across all instances', f: (v) => v.pods * 60 / v.jwks },
      { label: 'CPU for local RS256 verifies (~30 µs each, estimate)', fmt: 'raw', f: (v) => (v.rps * 30e-6).toFixed(v.rps * 30e-6 < 1 ? 2 : 1) + ' cores' },
      { label: 'Max use window of a stolen JWT (no denylist)', fmt: 'raw', f: (v) => v.ttl + ' min' }
    ],
    note: 'The point of the model: with <b>JWTs</b> the auth server only sees <b>refreshes</b> (sessions ÷ TTL) and a trickle of JWKS fetches, while every API check is a local signature verify. With <b>opaque tokens</b> every API call becomes an <b>introspection call</b> (RFC 7662), unless you cache results, and a cache brings back a revocation delay. Halving the TTL halves the stolen-token window and doubles refresh load. The RSA verify cost is an <em>estimate</em> for 2048-bit keys on one modern core; measure your own.'
  },

  api: [
    { m: 'HTTP', p: 'GET /authorize', d: '<code>response_type=code</code>, <code>client_id</code>, exact <code>redirect_uri</code>, <code>scope=openid orders:read</code>, <code>state</code>, <code>nonce</code>, <code>code_challenge</code>, <code>code_challenge_method=S256</code>.' },
    { m: 'POST', p: '/token (authorization_code)', d: '<code>code</code>, <code>redirect_uri</code>, <code>code_verifier</code>, plus client authentication for confidential clients. Returns <code>access_token</code>, <code>id_token</code>, <code>refresh_token</code>, <code>expires_in</code>.' },
    { m: 'GET', p: '/.well-known/\u200bopenid-configuration', d: 'OIDC Discovery: <code>issuer</code>, <code>authorization_endpoint</code>, <code>token_endpoint</code>, <code>jwks_uri</code>, supported algs. Resource servers read <code>jwks_uri</code> from here.' },
    { m: 'POST', p: '/introspect (RFC 7662)', d: 'For opaque tokens: the API (authenticated) sends the token and gets <code>{active, sub, scope, aud, exp}</code>. Inactive means revoked or expired.' },
    { m: 'POST', p: '/token (token-exchange, RFC 8693)', d: '<code>grant_type=urn:ietf:params:<wbr>oauth:grant-type:<wbr>token-exchange</code>, <code>subject_token</code>, <code>audience=billing-api</code>. Returns a narrower token for the next hop, optionally with an <code>act</code> (actor) claim.' },
    { m: 'POLICY', p: 'authz.rego / policy.cedar', d: 'Versioned, code-reviewed authorisation rules: who may do which action on which resource, under which conditions. Tested in CI like code.' }
  ],
  dataModel: [
    { name: 'access_token (JWT claims)', store: 'Signed JWT (RFC 9068 profile)', fields: [['iss', 'issuer URL', 'pk'], ['sub', 'user or client id', 'idx'], ['aud', 'target API'], ['exp / iat / nbf', 'epoch seconds'], ['scope', 'space-separated'], ['client_id', 'string'], ['jti', 'unique id']], note: 'Header carries <code>alg</code> and <code>kid</code>. Keep claims small: they ride on every request.' },
    { name: 'oauth_client', store: 'Auth server DB', fields: [['client_id', 'string', 'pk'], ['type', 'public | confidential'], ['redirect_uris', 'exact strings'], ['grant_types', 'set'], ['auth_method', 'private_key_jwt | tls'], ['allowed_scopes', 'set']], note: 'Exact redirect URI matching is required by RFC 9700. No wildcards.' },
    { name: 'refresh_token', store: 'Auth server DB', fields: [['token_hash', 'sha256', 'pk'], ['family_id', 'uuid', 'idx'], ['user_id', 'uuid', 'idx'], ['client_id', 'string', 'fk'], ['expires_at', 'ts'], ['used_at', 'ts nullable']], note: 'Rotation: each use issues a new token in the same family. Reuse of a used token revokes the whole family.' },
    { name: 'relation_tuple', store: 'ReBAC store (OpenFGA / SpiceDB)', fields: [['object', 'doc:42', 'pk'], ['relation', 'viewer', 'pk'], ['subject', 'user:ana | group:eng#member', 'pk']], note: 'Zanzibar-style: "user:ana is viewer of doc:42". Checks walk these edges.' }
  ],

  architecture: {
    title: 'OAuth 2.0 + OIDC with a BFF, gateway and policy engine',
    nodes: [
      { id: 'user', label: 'Resource owner', sub: 'the human user', kind: 'person', wide: [90, 0], tall: [70, 0], tip: 'The person who owns the data and grants the app access. Logs in and consents only at the authorization server.' },
      { id: 'idp', label: 'Enterprise IdP', sub: 'SAML 2.0 / OIDC', kind: 'external', wide: [290, 0], tall: [210, 0], tip: 'A customer\'s corporate identity provider (Entra ID, Okta, ADFS). The authorization server federates to it so employees use company SSO.' },
      { id: 'as', label: 'Auth server', sub: 'OAuth 2.0 + OIDC', kind: 'policy', wide: [490, 0], tall: [210, 105], tip: 'Keycloak, Okta, Auth0, Entra ID. Authenticates users, records consent, issues ID, access and refresh tokens, publishes discovery and JWKS.' },
      { id: 'jwks', label: 'JWKS', sub: 'public keys by kid', kind: 'cache', wide: [690, 0], tall: [350, 0], tip: 'The /certs (jwks_uri) document. Resource servers cache it and select the key by the token header kid. Private keys never leave the auth server (or its HSM/KMS).' },
      { id: 'spa', label: 'Browser SPA', sub: 'public client', kind: 'client', wide: [90, 110], tall: [70, 105], tip: 'JavaScript cannot keep a secret. With a BFF it only holds an HttpOnly, SameSite session cookie, never a token.' },
      { id: 'bff', label: 'BFF', sub: 'cookie ↔ tokens', kind: 'edge', wide: [290, 110], tall: [70, 210], tip: 'Backend-for-frontend: a confidential OAuth client. Runs the code flow with PKCE, keeps tokens server-side, and attaches the access token to API calls.' },
      { id: 'batch', label: 'Billing job', sub: 'client credentials', kind: 'compute', wide: [890, 110], tall: [350, 315], tip: 'A backend with no user. Authenticates as itself (private_key_jwt or mTLS) and gets a token for a specific audience.' },
      { id: 'gw', label: 'API gateway', sub: 'verify JWT + scope', kind: 'edge', wide: [290, 220], tall: [350, 105], tip: 'Rejects bad tokens early (signature, iss, aud, exp) and enforces coarse scopes and rate limits. Never the only check.' },
      { id: 'api', label: 'Orders API', sub: 'resource server', kind: 'service', wide: [490, 220], tall: [210, 315], tip: 'Validates the token again (defence in depth) and asks the policy engine about the specific resource: may Ana cancel order 42?' },
      { id: 'pdp', label: 'Policy engine', sub: 'OPA · Cedar · FGA', kind: 'policy', wide: [690, 220], tall: [70, 315], tip: 'Policy decision point. RBAC, ABAC (Rego, Cedar) or ReBAC (Zanzibar-style OpenFGA, SpiceDB). Often a local sidecar for sub-millisecond decisions.' },
      { id: 'db', label: 'Orders DB', sub: 'row-level security', kind: 'store', wide: [490, 330], tall: [210, 420], tip: 'Last line of defence: tenant and owner filters in every query, or Postgres RLS keyed on a session variable set from the token.' },
      { id: 'inv', label: 'Billing API', sub: 'aud = billing-api', kind: 'service', wide: [690, 330], tall: [350, 420], tip: 'A downstream resource server. Accepts only tokens whose aud is billing-api, so a token minted for the Orders API is rejected here.' }
    ],
    edges: [
      { from: 'user', to: 'spa', bidi: true },
      { from: 'spa', to: 'bff', bidi: true, label: 'cookie' },
      { from: 'bff', to: 'as', bidi: true, label: 'code + PKCE' },
      { from: 'as', to: 'idp', bidi: true, dashed: true },
      { from: 'as', to: 'jwks' },
      { from: 'bff', to: 'gw', label: 'Bearer' },
      { from: 'gw', to: 'jwks', dashed: true },
      { from: 'gw', to: 'api' },
      { from: 'api', to: 'pdp' },
      { from: 'api', to: 'db' },
      { from: 'api', to: 'as', dashed: true },
      { from: 'api', to: 'inv' },
      { from: 'batch', to: 'as' },
      { from: 'batch', to: 'inv' }
    ]
  },

  scenarios: [
    {
      id: 'login', title: 'Login: Authorization Code + PKCE', tone: 'ok',
      steps: [
        { text: 'The user clicks <b>Sign in</b>. The BFF creates a random <code>code_verifier</code>, <code>state</code> and <code>nonce</code>, and computes <code>code_challenge = BASE64URL(SHA256(verifier))</code>.', flow: ['user>spa', 'spa>bff'], badges: { bff: 'verifier kept' } },
        { text: 'The browser is redirected to <code>/authorize</code> with the <b>challenge</b>, never the verifier. The user logs in at the auth server, here federated to the company IdP over SAML or OIDC.', flow: ['bff>as', 'as>idp', 'idp>as'], badges: { idp: 'MFA ✓' } },
        { text: 'The auth server redirects back to the exact <code>redirect_uri</code> with a one-time <b>code</b> and the same <code>state</code>. The BFF checks <code>state</code> to block CSRF.', flow: ['as>bff'], badges: { bff: 'code + state' } },
        { text: 'The BFF posts <code>code</code> + <code>code_verifier</code> (plus its client credential) to <code>/token</code>. The server hashes the verifier and compares it to the stored challenge. A thief holding only the code fails here.', flow: ['bff>as', 'as>bff'], ok: ['as'], badges: { as: ['S256 match', 'ok'] }, tone: 'ok' },
        { text: 'The BFF validates the <b>ID token</b> (signature, <code>iss</code>, <code>aud</code> = its client_id, <code>nonce</code>), stores the tokens server-side, and gives the browser only an <b>HttpOnly, Secure, SameSite</b> session cookie.', flow: ['bff>spa'], ok: ['bff'], badges: { spa: ['cookie only', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'call', title: 'API call: validate locally, decide per resource', tone: 'info',
      steps: [
        { text: 'The SPA calls <code>/orders/42/cancel</code> with its cookie. The BFF looks up the session and attaches <code>Authorization: Bearer &lt;access token&gt;</code>.', flow: ['spa>bff', 'bff>gw'] },
        { text: 'The gateway reads <code>kid</code> from the JWT header and verifies the signature with the cached <b>JWKS</b> key. No call to the auth server.', flow: ['gw>jwks'], badges: { jwks: 'cache hit' } },
        { text: 'It checks <code>iss</code>, <code>aud</code> = orders-api, <code>exp</code>/<code>nbf</code> with small clock skew, an <b>alg allow-list</b> (RS256/ES256) and the coarse scope <code>orders:write</code>.', nodes: ['gw'], ok: ['gw'], badges: { gw: ['valid · 0.1 ms', 'ok'] } },
        { text: 'The Orders API validates again (never trust the network) and asks the <b>policy engine</b>: may <code>sub=ana</code> cancel order 42, owned by ana, status open, tenant acme?', flow: ['gw>api', 'api>pdp'], badges: { pdp: ['allow', 'ok'] } },
        { text: 'The query still carries the tenant filter (or Postgres <b>row-level security</b>), so a bug in the policy cannot leak another tenant\'s rows.', flow: ['api>db'], ok: ['db'], tone: 'ok' }
      ]
    },
    {
      id: 'm2m', title: 'Service to service: client credentials and token exchange', tone: 'info',
      steps: [
        { text: 'The nightly billing job has no user. It authenticates <b>as itself</b> with <code>grant_type=client_credentials</code>, using a signed JWT assertion (<code>private_key_jwt</code>) or mTLS instead of a shared secret.', flow: ['batch>as', 'as>batch'], badges: { batch: 'aud=billing-api' } },
        { text: 'It calls the Billing API, which accepts the token because <code>aud</code> matches and the client has scope <code>billing:run</code>.', flow: ['batch>inv'], ok: ['inv'] },
        { text: 'Separately, the Orders API must call Billing <b>for Ana</b>. Forwarding Ana\'s orders-api token would fail the <code>aud</code> check, and that is the point.', nodes: ['api', 'inv'], warn: ['inv'], badges: { inv: ['aud mismatch', 'warn'] }, tone: 'warn' },
        { text: '<b>Token exchange (RFC 8693)</b>: Orders sends Ana\'s token as <code>subject_token</code> and asks for <code>audience=billing-api</code>. It gets a new, narrower token with <code>sub=ana</code> and <code>act={sub: orders-api}</code>.', flow: ['api>as', 'as>api'], badges: { as: 'exchange' } },
        { text: 'Billing sees <b>who the user is and who is acting</b>, can apply its own policy, and audit logs show the full delegation chain.', flow: ['api>inv'], ok: ['inv'], tone: 'ok' }
      ]
    },
    {
      id: 'rotate', title: 'Signing-key rotation at 20K req/s', tone: 'warn',
      steps: [
        { text: 'Security policy says rotate the signing key. The auth server <b>publishes the new public key in the JWKS first</b>, while still signing with the old one.', flow: ['as>jwks'], badges: { jwks: 'kid A + kid B' } },
        { text: 'After at least one JWKS cache TTL, it starts signing with key B. Gateways see an <b>unknown kid</b> only if their cache is older than the pre-publish window.', nodes: ['gw', 'jwks'], warn: ['gw'], badges: { gw: ['kid B?', 'warn'] }, tone: 'warn' },
        { text: 'On an unknown kid, a validator refetches the JWKS <b>once, rate-limited and single-flight</b>. Without that, 80 instances × thousands of requests would stampede the auth server.', flow: ['gw>jwks'], badges: { jwks: 'refetch ×1' } },
        { text: 'Key A stays in the JWKS until every token it signed has expired (one access-token TTL), then is removed. Zero failed requests.', nodes: ['jwks', 'gw', 'api'], ok: ['gw', 'api'], badges: { jwks: ['kid B only', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'stolen', title: 'Failure: stolen token, user disabled', tone: 'err',
      steps: [
        { text: 'An XSS bug in a page that kept tokens in <code>localStorage</code> sends an access token and refresh token to an attacker.', nodes: ['spa'], err: ['spa'], badges: { spa: ['tokens stolen', 'err'] }, tone: 'err' },
        { text: 'The admin disables the account at the auth server. But the gateway validates <b>self-contained JWTs locally</b>, so the stolen access token keeps working until <code>exp</code>.', flow: ['gw>api'], err: ['gw'], badges: { gw: ['still valid', 'err'] }, tone: 'err' },
        { text: 'The attacker tries the stolen <b>refresh token</b>. It was already rotated, so the auth server detects <b>reuse</b> and revokes the whole token family. No new access tokens.', flow: ['bff>as'], ok: ['as'], badges: { as: ['family revoked', 'ok'] }, tone: 'warn' },
        { text: 'Exposure is bounded by the access-token TTL (5–15 min). For high-risk APIs, add <b>introspection</b> or a short <code>jti</code>/<code>sub</code> denylist, or sender-constrain tokens with <b>DPoP</b> or mTLS so a copy is useless.', nodes: ['gw', 'as'], warn: ['gw'], tone: 'warn' },
        { text: 'Root cause fix: a <b>BFF</b> so tokens never reach JavaScript, plus a strict Content Security Policy.', nodes: ['bff', 'spa'], ok: ['bff', 'spa'], badges: { bff: ['tokens server-side', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick the client, the grant, the token format, the authorisation model and the token lifetime. Watch the request path and the meters. Scores are illustrative judgements grounded in RFC 9700, not measurements.',
    diagram: null,
    controls: [
      { id: 'client', label: 'Client type', type: 'seg', value: 'spa', options: [
        { v: 'spa', l: 'Browser SPA (+BFF)' }, { v: 'mobile', l: 'Mobile app' }, { v: 'web', l: 'Server web app' }, { v: 'svc', l: 'Backend service' }] },
      { id: 'grant', label: 'Grant type', type: 'seg', value: 'pkce', options: [
        { v: 'pkce', l: 'Auth code + PKCE' }, { v: 'cc', l: 'Client credentials' }, { v: 'implicit', l: 'Implicit (legacy)' }, { v: 'password', l: 'Password (legacy)' }] },
      { id: 'format', label: 'Access-token format', type: 'seg', value: 'jwt', options: [
        { v: 'jwt', l: 'JWT (local verify)' }, { v: 'opaque', l: 'Opaque + introspection' }] },
      { id: 'model', label: 'Authorisation model', type: 'seg', value: 'rbac', options: [
        { v: 'rbac', l: 'RBAC (roles)' }, { v: 'abac', l: 'ABAC (attributes)' }, { v: 'rebac', l: 'ReBAC (relationships)' }] },
      { id: 'ttl', label: 'Access-token lifetime', type: 'range', min: 1, max: 60, step: 1, value: 10, unit: 'min' }
    ],
    evaluate(s) {
      const c01 = (x) => Math.max(0, Math.min(1, x));
      const user = s.client !== 'svc';
      const mismatch = (s.grant === 'cc' && user) || (s.grant !== 'cc' && !user);
      const legacy = s.grant === 'implicit' || s.grant === 'password';
      const jwt = s.format === 'jwt';
      // security: grant, client fit, ttl exposure
      let sec = { pkce: 0.9, cc: 0.85, implicit: 0.2, password: 0.15 }[s.grant];
      if (mismatch) sec = Math.min(sec, 0.2);
      if (s.client === 'mobile' && s.grant === 'pkce') sec -= 0.05;
      if (!jwt) sec += 0.05;
      sec -= jwt ? (s.ttl - 5) / 120 : 0;
      const ux = !user ? 0.9 : { pkce: 0.8, cc: 0.1, implicit: 0.65, password: 0.6 }[s.grant] - (s.ttl < 3 ? 0.1 : 0);
      const refreshPerSessHr = 60 / s.ttl;
      const asLoad = jwt ? c01(1 - refreshPerSessHr / 70) : 0.2;
      const revoke = jwt ? c01(1 - s.ttl / 45) : 0.92;
      const expr = { rbac: 0.4, abac: 0.8, rebac: 0.85 }[s.model];
      const metrics = [
        { k: 'Security', v: sec >= 0.75 ? 'strong' : sec >= 0.5 ? 'adequate' : sec >= 0.3 ? 'weak' : 'unsafe', s: c01(sec), hint: legacy ? 'deprecated grant' : mismatch ? 'grant does not fit client' : 'PKCE / BCP aligned' },
        { k: 'User experience', v: !user ? 'no user involved' : s.grant === 'pkce' ? 'redirect once, then SSO' : s.grant === 'password' ? 'own form, no SSO/MFA' : s.grant === 'cc' ? 'cannot log a user in' : 'redirect, frequent re-auth', s: c01(ux) },
        { k: 'Validation latency', v: jwt ? '≈ 0.05 ms local verify' : '+ 5–10 ms introspection', s: jwt ? 0.95 : 0.45, hint: jwt ? 'JWKS cached' : 'per request, unless cached' },
        { k: 'Revocation speed', v: jwt ? '≤ ' + s.ttl + ' min (token TTL)' : 'next call (seconds)', s: revoke },
        { k: 'Auth-server load', v: jwt ? SD.fmt.num(refreshPerSessHr) + ' refresh/session/h' : '1 call per API request', s: asLoad },
        { k: 'Policy expressiveness', v: { rbac: 'roles only; explodes', abac: 'attributes + context', rebac: 'sharing graphs, nesting' }[s.model], s: expr }
      ];
      const notes = [];
      if (s.grant === 'implicit') notes.push('<b>Implicit</b> returns the access token in the URL fragment: it leaks via history, logs and Referer, cannot be sender-bound, and cannot use PKCE. RFC 9700 says clients <b>should not</b> use it; the OAuth 2.1 draft removes it.');
      if (s.grant === 'password') notes.push('<b>Password grant</b> hands the user\'s password to the app. It breaks MFA, passkeys and federated SSO, and trains users to type passwords into apps. RFC 9700 says it <b>must not</b> be used.');
      if (s.grant === 'cc' && user) notes.push('Client credentials has <b>no user</b> in it. A public client (SPA, mobile) cannot keep the client secret, so anyone could extract it and mint tokens.');
      if (s.grant !== 'cc' && !user) notes.push('A backend job has no browser and no user to redirect. Use <b>client credentials</b>; if it acts for a user, use <b>token exchange</b> (RFC 8693).');
      if (s.client === 'spa' && s.grant === 'pkce') notes.push('With a <b>BFF</b>, the browser holds only an HttpOnly cookie. A pure SPA with PKCE is allowed, but its tokens are readable by any XSS on the page.');
      if (s.client === 'mobile' && s.grant === 'pkce') notes.push('Mobile: use the system browser (ASWebAuthenticationSession / Custom Tabs, RFC 8252), not an embedded WebView; prefer claimed https redirect URIs.');
      if (!jwt) notes.push('Opaque tokens give instant revocation but put the auth server on <b>every request path</b>. Caching introspection results for N seconds brings back an N-second revocation delay.');
      if (jwt && s.ttl > 30) notes.push('A ' + s.ttl + '-minute JWT is a ' + s.ttl + '-minute window for a stolen copy. Keep 5–15 min and lean on silent refresh.');
      if (s.model === 'rbac') notes.push('RBAC is easy to audit, but rules like "owner may edit, only in their region, before shipping" become roles like <code>editor_eu_unshipped</code>: <b>role explosion</b>.');
      if (s.model === 'rebac') notes.push('ReBAC (Zanzibar, OpenFGA, SpiceDB) stores tuples like <code>doc:42#viewer@user:ana</code>; great for sharing and folders, but it is a new, consistency-sensitive service to run.');
      let verdict;
      if (s.grant === 'password') verdict = '❌ <b>Password grant is forbidden by the OAuth 2.0 Security BCP (RFC 9700).</b> Use Authorization Code + PKCE.';
      else if (s.grant === 'implicit') verdict = '❌ <b>Implicit grant is deprecated.</b> Tokens in the URL leak. Switch to Authorization Code + PKCE.';
      else if (mismatch) verdict = '❌ <b>Grant does not match the client.</b> Users get Authorization Code + PKCE; machines get client credentials.';
      else if (jwt && s.ttl > 30) verdict = '⚠ <b>Right flow, but long-lived JWTs.</b> Shorten to 5–15 min or add introspection for sensitive APIs.';
      else if (!jwt && s.ttl <= 15) verdict = '👍 <b>Safe and instantly revocable</b>, at the cost of an auth-server call per request. Fine for high-risk or low-volume APIs.';
      else if (s.client === 'spa' && s.model !== 'rbac') verdict = '✅ <b>Current best practice:</b> BFF + code flow with PKCE, short JWTs, and fine-grained policy in the service.';
      else verdict = '✅ <b>Sound design.</b> Check the policy-model meter against how complex your sharing rules really are.';
      const grantSub = { pkce: 'code + PKCE (S256)', cc: 'client_credentials', implicit: 'implicit: token in URL', password: 'password grant' }[s.grant];
      const labels = {
        as: { label: 'Auth server', sub: grantSub },
        gw: { label: 'API gateway', sub: jwt ? 'verify JWT (JWKS)' : 'introspect (RFC 7662)' },
        pdp: { label: 'Policy engine', sub: { rbac: 'roles → permissions', abac: 'OPA / Cedar rules', rebac: 'Zanzibar tuples' }[s.model] },
        spa: { label: { spa: 'Browser SPA', mobile: 'Mobile app', web: 'Browser', svc: 'Browser' }[s.client], sub: { spa: 'cookie only', mobile: 'public client', web: 'session cookie', svc: 'not used' }[s.client] },
        bff: { label: s.client === 'web' ? 'Web app server' : 'BFF', sub: s.client === 'web' ? 'confidential client' : 'cookie ↔ tokens' }
      };
      let flow;
      if (!user) flow = ['batch>as', 'as>batch', 'batch>inv'];
      else if (s.client === 'mobile') flow = ['user>spa', 'spa>as', 'as>spa', 'spa>gw', jwt ? 'gw>jwks' : 'gw>as', 'gw>api', 'api>pdp'];
      else flow = ['user>spa', 'spa>bff', 'bff>as', 'bff>gw', jwt ? 'gw>jwks' : 'gw>as', 'gw>api', 'api>pdp'];
      const hide = [];
      if (s.client === 'mobile') hide.push('bff');
      const err = [], warn = [], ok = [];
      if (legacy || mismatch) err.push(user ? 'spa' : 'batch', 'as');
      else ok.push('api');
      if (jwt && s.ttl > 30) warn.push('gw');
      if (!jwt) warn.push('as');
      return {
        metrics, verdict, notes: notes.slice(0, 4), labels, flow, hide, err, warn, ok,
        hot: user ? ['as'] : ['batch'],
        badges: { gw: [jwt ? 'local · ' + s.ttl + ' min' : 'introspect', jwt && s.ttl > 30 ? 'warn' : 'info'], pdp: [s.model.toUpperCase(), 'info'] }
      };
    }
  },

  widget: {
    title: 'PKCE flow, JWT validator and RBAC vs ABAC',
    caption: 'Three real mechanisms. <b>PKCE</b>: generate a verifier and compute the actual S256 challenge with the browser\'s SHA-256. <b>JWT</b>: decode a token, check its claims and verify a real HS256 signature, then tamper with it. <b>Policy</b>: pick a user, a resource and an action and see which RBAC and ABAC rules allow or deny.'
  },

  realWorld: {
    intro: 'Identity is built on open standards plus a few published production systems. Here is the path from the original OAuth framework to today\'s best practice.',
    timeline: [
      { when: 'Oct 2012', who: 'IETF', title: 'OAuth 2.0 framework (RFC 6749)', text: 'Defines the four roles and four grants: authorization code, implicit, resource owner password credentials and client credentials. It replaced OAuth 1.0 (RFC 5849).', src: 0 },
      { when: 'Feb 2014', who: 'OpenID Foundation', title: 'OpenID Connect Core 1.0', text: 'Adds authentication on top of OAuth 2.0: the <b>ID token</b> (a JWT about the login), <code>nonce</code>, the UserInfo endpoint, and with the Discovery spec, <code>.well-known/openid-configuration</code> and JWKS.', src: 1 },
      { when: 'May / Sep 2015', who: 'IETF', title: 'JWT (RFC 7519) and PKCE (RFC 7636)', text: 'JWT standardises compact, URL-safe signed claims. PKCE, designed first for mobile apps, binds the authorization code to a one-time <code>code_verifier</code> so an intercepted code is useless.', src: 2 },
      { when: '2019', who: 'Google', title: 'Zanzibar paper (USENIX ATC)', text: 'One authorisation system for Calendar, Cloud, Drive, Maps, Photos and YouTube. The paper reports <b>trillions of ACLs</b>, <b>millions of checks per second</b>, p95 latency <b>under 10 ms</b> and availability <b>above 99.999%</b> over three years.', src: 4 },
      { when: 'Feb 2021', who: 'CNCF', title: 'Open Policy Agent graduates', text: 'OPA, a general-purpose policy engine with the Rego language, became a CNCF graduated project, a sign that "policy as code" outside the application was mainstream.', src: 5 },
      { when: '2021', who: 'Netflix', title: 'Edge authentication and Passport', text: 'Netflix moved token handling to the edge. The edge validates the many client token types and passes an <b>integrity-protected, token-agnostic identity object</b> ("Passport") to internal services, so tokens do not travel deep into the system.', src: 6 },
      { when: 'Apr 2021', who: 'Airbnb', title: 'Himeji, a Zanzibar-style service', text: 'Airbnb described Himeji, a central authorisation system based on Zanzibar and called from its data layer, as the single source of truth for permission checks.', src: 7 },
      { when: 'May 2023', who: 'AWS', title: 'Cedar open-sourced', text: 'AWS open-sourced the Cedar policy language and engine under Apache 2.0. It is the language of Amazon Verified Permissions and is designed for analysable, fast authorisation policies.', src: 8 },
      { when: 'Jan 2025', who: 'IETF', title: 'OAuth 2.0 Security BCP (RFC 9700)', text: 'Requires PKCE (or equivalent) for code flows, exact redirect URI matching, says the implicit grant should not be used and the password grant must not be used, and recommends sender-constrained and rotated refresh tokens.', src: 9 },
      { when: '2025–26', who: 'IETF', title: 'OAuth 2.1 (Internet-Draft)', text: 'Consolidates OAuth 2.0 and the BCP: PKCE for all code flows, no implicit or password grant, no bearer tokens in query strings. Still a draft, not yet an RFC.', src: 10 }
    ],
    lessons: [
      'OAuth is <b>delegation</b>; use OIDC when you need <b>login</b>. Never treat an access token as proof of who logged in.',
      'One flow for every user-facing client: <b>Authorization Code + PKCE</b>. Keep browser tokens server-side with a BFF.',
      'Validate tokens <b>locally and fully</b> (kid, alg allow-list, iss, aud, exp), keep them short, and design revocation explicitly.',
      'Separate authorisation <b>policy</b> from code: Rego, Cedar or Zanzibar-style tuples, and choose the model by how your sharing rules really look.'
    ],
    sources: [
      { title: 'RFC 6749: The OAuth 2.0 Authorization Framework', url: 'https://www.rfc-editor.org/info/rfc6749', pub: 'IETF, Oct 2012' },
      { title: 'OpenID Connect Core 1.0', url: 'https://openid.net/specs/openid-connect-core-1_0.html', pub: 'OpenID Foundation' },
      { title: 'RFC 7519: JSON Web Token (JWT)', url: 'https://www.rfc-editor.org/info/rfc7519', pub: 'IETF, May 2015' },
      { title: 'RFC 7636: Proof Key for Code Exchange by OAuth Public Clients', url: 'https://www.rfc-editor.org/rfc/rfc7636', pub: 'IETF, Sep 2015' },
      { title: 'Zanzibar: Google\'s Consistent, Global Authorization System', url: 'https://www.usenix.org/conference/atc19/presentation/pang', pub: 'USENIX ATC 2019' },
      { title: 'Cloud Native Computing Foundation announces Open Policy Agent graduation', url: 'https://www.cncf.io/announcements/2021/02/04/cloud-native-computing-foundation-announces-open-policy-agent-graduation/', pub: 'CNCF, Feb 2021' },
      { title: 'Edge Authentication and Token-Agnostic Identity Propagation', url: 'https://netflixtechblog.com/edge-authentication-and-token-agnostic-identity-propagation-514e47e0b602', pub: 'Netflix Technology Blog, 2021' },
      { title: 'Himeji: A Scalable Centralized System for Authorization at Airbnb', url: 'https://medium.com/airbnb-engineering/himeji-a-scalable-centralized-system-for-authorization-at-airbnb-341664924574', pub: 'Airbnb Engineering, 2021' },
      { title: 'Introducing Cedar, an open-source language for access control', url: 'https://aws.amazon.com/about-aws/whats-new/2023/05/cedar-open-source-language-access-control', pub: 'AWS, May 2023' },
      { title: 'RFC 9700: Best Current Practice for OAuth 2.0 Security', url: 'https://www.rfc-editor.org/rfc/rfc9700.html', pub: 'IETF, Jan 2025' },
      { title: 'The OAuth 2.1 Authorization Framework (draft-ietf-oauth-v2-1)', url: 'https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/', pub: 'IETF OAuth WG, Internet-Draft' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Access-token format', '<b>JWT</b>: local verify, no auth-server hop, revocation waits for <code>exp</code>', '<b>Opaque + introspection</b>: instant revocation, auth server on every call', 'JWT with 5–15 min TTL by default; opaque (or JWT + introspection) for payments, admin and other high-risk APIs'],
      ['Tokens for browser apps', '<b>SPA holds tokens</b> (PKCE, in memory): simple, no server', '<b>BFF</b>: tokens server-side, HttpOnly cookie in the browser', 'BFF for anything handling personal or financial data; in-SPA tokens only for low-risk apps with a strict CSP'],
      ['Authorisation model', '<b>RBAC</b>: roles map to permissions; easy to audit', '<b>ABAC / ReBAC</b>: attributes or relationships; fine-grained', 'RBAC for admin consoles and internal tools; ABAC for context rules (region, time, risk); ReBAC for sharing, folders and orgs'],
      ['Where to enforce', '<b>Gateway</b>: one place, coarse (valid token, scope)', '<b>Service + data layer</b>: knows the resource, owner, tenant', 'Both: authenticate and coarse-filter at the edge, decide per resource in the service, and back it with tenant filters or RLS'],
      ['Enterprise SSO', '<b>SAML 2.0</b>: XML assertions, browser POST, mature in enterprises', '<b>OIDC</b>: JSON/JWT, works for SPAs, mobile and APIs', 'Speak SAML to customers\' IdPs where they require it, but issue OIDC/OAuth tokens inside your platform'],
      ['Build or buy the auth server', '<b>Self-host</b> (Keycloak): control, data residency, ops burden', '<b>SaaS</b> (Okta, Auth0, Entra ID): fast, compliant, per-user cost', 'Never write your own token server; choose by residency, cost per MAU and enterprise federation needs']
    ]
  },
  failures: [
    { f: '<code>alg</code> confusion or <code>alg: none</code> accepted', detect: 'Security tests that send unsigned tokens, or HS256 tokens signed with the public RSA key', fix: 'Fixed allow-list of algorithms per issuer; take the key from the JWKS by kid and check its type; use a maintained library (RFC 8725 JWT BCP).' },
    { f: 'Missing <code>aud</code> check: token for API A replayed to API B', detect: 'Pen test, audit logs with tokens from unexpected clients', fix: 'Every resource server requires its own audience; use token exchange to mint per-hop tokens.' },
    { f: 'Tokens stolen from <code>localStorage</code> via XSS', detect: 'Refresh-token reuse alerts, logins from new devices or ASNs', fix: 'BFF with HttpOnly cookies, strict CSP, refresh-token rotation with reuse detection, sender-constrained tokens (DPoP, mTLS).' },
    { f: 'Key rotation breaks every API (unknown <code>kid</code>)', detect: 'Spike in 401s right after rotation', fix: 'Pre-publish the new key for ≥ one JWKS cache TTL; single-flight refetch on unknown kid; keep the old key for one token TTL.' },
    { f: 'Auth server outage', detect: 'Login and refresh error rate, synthetic logins', fix: 'Run it multi-AZ as a tier-0 service. JWT validation keeps working from cached keys; introspection-based APIs need a fallback plan.' },
    { f: '<b>Role explosion</b> and forgotten permissions', detect: 'Hundreds of roles, users with dozens of roles, failed access reviews', fix: 'Move context rules into ABAC policy or relationships; periodic access reviews; roles for jobs, attributes for conditions.' },
    { f: 'Open redirect / code injection on the callback', detect: 'Unexpected redirect_uri values in auth-server logs', fix: 'Exact redirect URI matching, PKCE, <code>state</code> and <code>nonce</code> checks, and <code>iss</code> in the response (RFC 9207).' }
  ],

  interview: [
    { q: 'What is the difference between authentication and authorisation, and between OAuth 2.0 and OpenID Connect?', a: '<p><b>Authentication</b> proves who you are; <b>authorisation</b> decides what you may do. OAuth 2.0 (RFC 6749) is a <b>delegated authorisation</b> framework: it gives a client an access token to call an API on a user\'s behalf. It says nothing standard about who the user is.</p><p><b>OpenID Connect</b> is an identity layer on top: the <code>openid</code> scope makes the server also return an <b>ID token</b>, a signed JWT with <code>sub</code>, <code>iss</code>, <code>aud</code>, <code>nonce</code>, <code>auth_time</code>, plus a UserInfo endpoint and discovery.</p>', fu: 'Why is "log in with an OAuth access token" dangerous? (An access token for another audience can be replayed to your app: the confused-deputy problem.)', lvl: 'core' },
    { q: 'Walk me through the Authorization Code flow with PKCE. What exactly does PKCE protect against?', a: '<ul><li>Client makes a random <code>code_verifier</code> (43–128 chars) and sends <code>code_challenge = BASE64URL(SHA256(verifier))</code> with <code>/authorize</code>, plus <code>state</code> and <code>nonce</code>.</li><li>User authenticates and consents at the auth server; it redirects back to the exact <code>redirect_uri</code> with a short-lived code.</li><li>Client posts the code and the <b>verifier</b> to <code>/token</code>; the server recomputes the hash and compares.</li></ul><p>PKCE defeats <b>authorization code interception and injection</b>: an attacker who steals the code (malicious app on the same custom scheme, logs, Referer) lacks the verifier. RFC 9700 asks for it for all clients, including confidential ones.</p>', lvl: 'core' },
    { q: 'Why are the implicit and password grants deprecated?', a: '<p><b>Implicit</b> returns the access token in the URL fragment: it leaks via browser history, logs and Referer, cannot use PKCE or refresh tokens safely, and cannot be sender-constrained. It existed because browsers could not do cross-origin POSTs in 2012; CORS fixed that.</p><p><b>Password</b> (ROPC) makes the app collect the user\'s password: it breaks MFA, passkeys and federation, and widens the blast radius. RFC 9700 (2025) says implicit <b>should not</b> and password <b>must not</b> be used; the OAuth 2.1 draft removes both.</p>', lvl: 'core' },
    { q: 'How does a resource server validate a JWT access token?', a: '<ol><li>Parse the header; reject if <code>alg</code> is not on your <b>allow-list</b> (never <code>none</code>, never HS* for an RS issuer).</li><li>Find the key by <code>kid</code> in the cached <b>JWKS</b> from the issuer\'s discovery document; refetch once on a miss.</li><li>Verify the signature.</li><li>Check <code>iss</code> equals the expected issuer and <code>aud</code> contains <b>this API</b>.</li><li>Check <code>exp</code>, <code>nbf</code>, <code>iat</code> with a small clock skew (30–60 s).</li><li>Check <code>typ</code> (<code>at+jwt</code> per RFC 9068) and required scopes.</li></ol>', fu: 'How do you rotate keys without downtime? (Pre-publish, single-flight refetch, keep the old key for one TTL.)', lvl: 'core' },
    { q: 'JWT or opaque tokens? How do you revoke a JWT?', a: '<p>A <b>JWT</b> is self-contained: zero network hops to validate, so it scales well, but it stays valid until <code>exp</code>. An <b>opaque</b> token is a reference: every check is an introspection call (RFC 7662), so revocation is instant but the auth server sits on the hot path.</p><p>Revoking JWTs: keep them short (5–15 min), rotate refresh tokens and revoke the family, and for sensitive APIs add a small denylist of <code>jti</code>/<code>sub</code> pushed to validators, or introspect. Sender-constrained tokens (DPoP, mTLS) make a stolen copy useless.</p>', lvl: 'deep' },
    { q: 'Where should a single-page app keep its tokens?', a: '<p>Preferably <b>nowhere in the browser</b>. A <b>BFF</b> (backend-for-frontend) is a confidential client: it runs the code flow, keeps tokens server-side and gives the browser an <code>HttpOnly; Secure; SameSite</code> cookie. XSS can then make requests while the page is open, but cannot exfiltrate long-lived tokens.</p><p>If there is no BFF: PKCE, tokens in memory only (not <code>localStorage</code>), short TTLs, refresh-token rotation and a strict CSP.</p>', lvl: 'core' },
    { q: 'How do services authenticate to each other, and how do you keep the user\'s identity across hops?', a: '<p>A service with no user uses <b>client credentials</b>, authenticating with <code>private_key_jwt</code> or mTLS rather than a shared secret, and asks for a token with a specific <code>aud</code>. Workload identity (SPIFFE, cloud IAM) can replace stored secrets.</p><p>To call downstream <b>for a user</b>, do not forward the same token everywhere. Use <b>token exchange (RFC 8693)</b> to mint a narrower token for the next audience, with <code>act</code> showing who is acting. Netflix instead converts tokens at the edge into an internal signed identity object (Passport).</p>', lvl: 'deep' },
    { q: 'RBAC, ABAC or ReBAC: how do you choose?', a: '<ul><li><b>RBAC</b>: users get roles, roles get permissions. Simple and auditable; breaks down when rules depend on context (<b>role explosion</b>).</li><li><b>ABAC</b>: rules over attributes of subject, resource, action and environment (region, owner, time, risk score). Expressed in Rego or Cedar.</li><li><b>ReBAC</b>: permissions follow relationships (owner of folder → viewer of every doc in it). Zanzibar, OpenFGA, SpiceDB.</li></ul><p>Most real systems mix them: RBAC for staff, ReBAC for sharing, ABAC conditions on top.</p>', lvl: 'deep' },
    { q: 'Where do you enforce authorisation: gateway, service or database?', a: '<p><b>All three, with different jobs.</b> The gateway authenticates, rejects invalid tokens and checks coarse scopes. The service makes the <b>resource-level decision</b> because only it knows the order\'s owner, tenant and status (often via a local OPA or Cedar call). The data layer adds tenant filters or Postgres RLS as a backstop against bugs (broken object-level authorisation is OWASP API #1).</p>', lvl: 'deep' },
    { q: 'An enterprise customer insists on SAML. How does that fit with OIDC?', a: '<p><b>SAML 2.0</b> (2005) passes signed XML assertions through browser redirects and POSTs; it is entrenched in enterprise IdPs but awkward for mobile apps and APIs. <b>OIDC</b> uses JSON and JWT over OAuth 2.0 and fits SPAs, mobile and APIs.</p><p>Federate: your auth server acts as a SAML service provider to the customer\'s IdP, then issues your own OIDC and OAuth tokens to your apps. Apps never parse SAML.</p>', lvl: 'core' },
    { q: 'Teams want to keep issuing their own long-lived JWTs with a shared HS256 secret. How do you convince them to move?', a: '<p>Start from risk, not standards: a shared HMAC secret means <b>every verifier can also mint tokens</b>, so one leaked config file forges admin tokens for every service. Show the blast radius on their own architecture diagram.</p><p>Offer a paved road: a central OIDC provider, a 10-line resource-server config (Spring <code>issuer-uri</code>), asymmetric keys from a JWKS, short TTLs. Migrate behind the gateway by accepting both issuers for a deadline, measure, then remove the old one. Record it as an ADR.</p>', lvl: 'deep' },
    { q: 'Scopes vs permissions: what is the difference?', a: '<p>A <b>scope</b> is what the <b>user allowed the client</b> to do (<code>orders:read</code>), an upper bound decided at consent time. A <b>permission</b> is what the <b>user is allowed</b> to do on a particular resource, decided by your policy at request time.</p><p>The effective right is the <b>intersection</b>: a token with <code>orders:write</code> still cannot cancel someone else\'s order. Do not encode per-resource permissions as scopes.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'Spring Boot 3: resource server with roles and method security', lang: 'java',
      code: `// application.yml
//   spring.security.oauth2.resourceserver.jwt.issuer-uri: https://login.example.com/realms/shop
//   spring.security.oauth2.resourceserver.jwt.audiences: orders-api   # aud check (Boot 3.1+)
// issuer-uri -> discovery -> jwks_uri; iss, exp and nbf are validated automatically.
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

  @Bean
  SecurityFilterChain api(HttpSecurity http) throws Exception {
    http.authorizeHttpRequests(a -> a
            .requestMatchers("/actuator/health").permitAll()
            .requestMatchers(HttpMethod.GET, "/orders/**").hasAuthority("SCOPE_orders:read")
            .anyRequest().authenticated())
        .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(jwtAuth())))
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .csrf(c -> c.disable());                 // bearer tokens only, no cookies here
    return http.build();
  }

  @Bean
  JwtAuthenticationConverter jwtAuth() {
    JwtGrantedAuthoritiesConverter scopes = new JwtGrantedAuthoritiesConverter(); // scope -> SCOPE_x
    JwtAuthenticationConverter conv = new JwtAuthenticationConverter();
    conv.setJwtGrantedAuthoritiesConverter(jwt -> {
      List<GrantedAuthority> out = new ArrayList<>(scopes.convert(jwt));
      Map<String, Object> realm = jwt.getClaimAsMap("realm_access");          // Keycloak layout
      if (realm != null && realm.get("roles") instanceof Collection<?> roles)
        roles.forEach(r -> out.add(new SimpleGrantedAuthority("ROLE_" + r)));
      return out;
    });
    return conv;
  }
}

@RestController
class OrderController {
  @PostMapping("/orders/{id}/cancel")
  @PreAuthorize("hasAuthority('SCOPE_orders:write') and (hasRole('support') or @orderAuthz.isOwner(#id, authentication))")
  void cancel(@PathVariable String id) { /* ... */ }
}`,
      note: 'Scopes (what the user let the client do) and roles (what the user may do) are both checked. <code>@orderAuthz</code> is your bean that loads the order and compares its owner to <code>authentication.getName()</code> (the <code>sub</code>). Spring Boot compiles with <code>-parameters</code>, so <code>#id</code> resolves.'
    },
    {
      title: 'Python: validate a JWT with PyJWT and the issuer JWKS', lang: 'python',
      code: `# pip install "pyjwt[crypto]>=2.8"
import jwt
from jwt import PyJWKClient

ISSUER = "https://login.example.com/realms/shop"
AUDIENCE = "orders-api"
# jwks_uri comes from f"{ISSUER}/.well-known/openid-configuration"
jwks = PyJWKClient(f"{ISSUER}/protocol/openid-connect/certs",
                   cache_jwk_set=True, lifespan=600)   # cache the key set 10 min

def verify(token: str, needed_scope: str) -> dict:
    signing_key = jwks.get_signing_key_from_jwt(token)  # by 'kid'; refetches on a miss
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256", "ES256"],      # allow-list: never "none", never HS* here
        audience=AUDIENCE,                  # aud must contain this API
        issuer=ISSUER,                      # iss must match exactly
        leeway=30,                          # clock skew for exp / nbf / iat
        options={"require": ["exp", "iat", "iss", "aud", "sub"]},
    )
    if needed_scope not in claims.get("scope", "").split():
        raise PermissionError(f"missing scope {needed_scope}")
    return claims`,
      note: '<code>jwt.decode</code> raises <code>ExpiredSignatureError</code>, <code>InvalidAudienceError</code>, <code>InvalidIssuerError</code> or <code>InvalidSignatureError</code>; map all of them to HTTP 401, and a missing scope to 403.'
    },
    {
      title: 'OPA Rego: RBAC plus ABAC rules for orders', lang: 'js',
      code: `package orders.authz

# OPA 1.x (Rego v1 syntax). Input: {subject, action, resource}
default allow := false

# RBAC: tenant admins may do anything inside their own tenant
allow if {
    "admin" in input.subject.roles
    input.subject.tenant == input.resource.tenant
}

# ABAC: support reads orders in their own region, 08:00-20:00 UTC
allow if {
    input.action == "read"
    "support" in input.subject.roles
    input.subject.region == input.resource.region
    [hour, _, _] := time.clock([time.now_ns(), "UTC"])
    hour >= 8
    hour < 20
}

# Owner may read or cancel their own order until it ships
allow if {
    input.action in {"read", "cancel"}
    input.subject.id == input.resource.owner
    input.resource.status != "shipped"
}

# Explain denials for audit logs
reasons contains "cross-tenant" if input.subject.tenant != input.resource.tenant`,
      note: 'The service calls OPA (sidecar or library) with <code>POST /v1/data/orders/authz</code> and the input built from the verified token claims plus the loaded resource. Policies live in Git, are unit-tested with <code>opa test</code>, and are shipped as signed bundles.'
    }
  ],

  related: ['zero-trust', 'secrets-kms', 'threat-modeling', 'api-design', 'multi-tenancy', 'sd:api-gateway']
});
