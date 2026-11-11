/* Three real mechanisms: PKCE (S256 via WebCrypto), a JWT decoder/validator (real HS256 verify), RBAC vs ABAC evaluator. */
SD.widget('iam-oauth-oidc', function (root, ctx) {
  const { el, svg } = ctx;
  const subtle = window.crypto && window.crypto.subtle;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64u = (bytes) => { let s = ''; new Uint8Array(bytes).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (str) => { const s = str.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
  const rand = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));
  const sha256 = async (str) => b64u(await subtle.digest('SHA-256', enc.encode(str)));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mono = { fontFamily: 'var(--mono)', fontSize: '12.5px', wordBreak: 'break-all', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', margin: '8px 0 0', whiteSpace: 'pre-wrap' };
  let tab = 'pkce';
  const tabsBar = el('div', { class: 'seg', role: 'tablist', style: { marginBottom: '12px' } });
  const body = el('div');
  root.append(tabsBar, body);
  const TABS = [['pkce', '① Code + PKCE flow'], ['jwt', '② JWT validator'], ['policy', '③ RBAC vs ABAC']];
  function renderTabs() {
    tabsBar.innerHTML = '';
    TABS.forEach(([id, l]) => tabsBar.append(el('button', { class: tab === id ? 'on' : '', role: 'tab', text: l, onclick: () => { tab = id; show(); } })));
  }
  function show() { renderTabs(); body.innerHTML = ''; ({ pkce: pkceTab, jwt: jwtTab, policy: policyTab })[tab](ctx.narrow); }
  if (!subtle) { root.append(el('p', { class: 'muted', text: 'This demo needs WebCrypto (crypto.subtle), which browsers only expose on HTTPS or localhost.' })); }

  /* ---------- ① Authorization Code + PKCE ---------- */
  let pk = null; // flow state survives re-layout
  function pkceTab(narrow) {
    const st = pk || (pk = { i: 0, verifier: '', challenge: '', state: rand(9), code: '', attack: null });
    const W = narrow ? 360 : 620, LX = narrow ? [52, 180, 308] : [90, 310, 530], F = 14, FL = narrow ? 13.5 : 13.5, ROW = narrow ? 34 : 32, TOP = 48;
    const STEPS = [
      { a: [[0, 0, 'make verifier']], t: () => `<b>1 · Client</b> makes a random <code>code_verifier</code> (32 random bytes → base64url = 43 chars) and keeps it secret.<div style="${css(mono)}">code_verifier = ${st.verifier}</div>` },
      { a: [[0, 0, 'SHA-256 → b64url']], t: () => `<b>2 · Client</b> computes <code>code_challenge = BASE64URL(SHA256(verifier))</code> with your browser's real SHA-256.<div style="${css(mono)}">code_challenge = ${st.challenge}</div>` },
      { a: [[0, 1, '302 redirect'], [1, 2, 'GET /authorize']], t: () => `<b>3 · Redirect.</b> Only the <b>challenge</b> travels through the browser, with <code>state</code> against CSRF.<div style="${css(mono)}">GET https://login.example.com/authorize?response_type=code&amp;client_id=shop-bff&amp;redirect_uri=https://shop.example.com/callback&amp;scope=openid%20orders:read&amp;state=${st.state}&amp;code_challenge=${st.challenge}&amp;code_challenge_method=S256</div>` },
      { a: [[1, 2, 'login + consent'], [2, 2, 'store challenge']], t: () => '<b>4 · User authenticates</b> at the auth server (password, passkey, MFA, or federated SAML/OIDC). The server stores the challenge with the code it is about to issue.' },
      { a: [[2, 1, '302 ?code=…'], [1, 0, 'GET /callback']], t: () => `<b>5 · Code returns</b> via the browser to the exact <code>redirect_uri</code>. Anything on this path (a malicious app, a log, a proxy) might see the code. The client checks <code>state</code>.<div style="${css(mono)}">GET /callback?code=${st.code}&amp;state=${st.state}</div>` },
      { a: [[0, 2, 'POST /token + verifier']], t: () => `<b>6 · Back channel.</b> The client sends <code>code</code> + <code>code_verifier</code>. The server hashes the verifier and compares it with the stored challenge.<div style="${css(mono)}">SHA256(verifier) → ${st.recomputed}\nstored challenge → ${st.challenge}\n${st.recomputed === st.challenge ? '✓ match' : '✗ mismatch'}</div>` },
      { a: [[2, 0, 'tokens (JSON)']], t: () => `<b>7 · Tokens.</b> The client validates the ID token (signature, iss, aud, nonce) and keeps tokens server-side (BFF).<div style="${css(mono)}">{ "access_token": "eyJhbGciOi… (JWT, see tab ②)",\n  "id_token": "eyJhbGciOi…",\n  "refresh_token": "${rand(12)}…",\n  "token_type": "Bearer", "expires_in": 600 }</div>` }
    ];
    function css(o) { return Object.entries(o).map(([k, v]) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + v).join(';'); }
    const next = el('button', { class: 'btn primary', text: '▶ Next step' });
    const reset = el('button', { class: 'btn', text: '↺ Restart' });
    const att = el('button', { class: 'btn', text: '🕵 Attacker uses stolen code' });
    body.append(el('div', { class: 'w-controls' }, next, reset, att));
    const H = TOP + STEPS.reduce((n, x) => n + x.a.length, 0) * ROW + 4;
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Authorization code with PKCE sequence' });
    const stage = el('div', { class: 'w-stage' }, S);
    const detail = el('div', { class: 'w-log', 'aria-live': 'polite', style: { maxHeight: 'none', fontFamily: 'var(--sans)', fontSize: '14px', lineHeight: '1.5' } });
    const stats = el('div', { class: 'w-stats' });
    body.append(stage, detail, stats);
    ['Client (BFF)', 'Browser', 'Auth server'].forEach((l, k) => {
      S.append(svg('rect', { x: LX[k] - (narrow ? 50 : 70), y: 4, width: narrow ? 100 : 140, height: 30, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      S.append(svg('text', { x: LX[k], y: 24, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:700 ${F}px var(--sans)`, text: l }));
      S.append(svg('line', { x1: LX[k], y1: 34, x2: LX[k], y2: H - 4, stroke: 'var(--border)', 'stroke-dasharray': '4 4' }));
    });
    const gArrows = svg('g');
    S.append(gArrows);
    // each arrow gets its own row, so two-arrow steps never overlap
    const rowOf = []; let nrow = 0;
    STEPS.forEach((stp) => { rowOf.push(stp.a.map(() => nrow++)); });
    function arrow(i, [a, b, label], k, animate) {
      const y = TOP + rowOf[i][k] * ROW + 14;
      const color = st.attack && i === 5 ? 'var(--err)' : 'var(--accent)';
      const g = svg('g');
      if (a === b) {
        g.append(svg('circle', { cx: LX[a], cy: y, r: 6, fill: color }));
        const right = a < 2;
        g.append(svg('text', { x: LX[a] + (right ? 12 : -12), y: y + 5, 'text-anchor': right ? 'start' : 'end', fill: 'var(--text)', style: `font:600 ${FL}px var(--sans)`, text: label }));
      } else {
        const dir = b > a ? 1 : -1, x1 = LX[a] + dir * 6, x2 = LX[b] - dir * 6;
        const ln = svg('line', { x1, y1: y, x2, y2: y, stroke: color, 'stroke-width': 2.5 });
        const head = svg('path', { d: `M${x2},${y} l${-dir * 9},-5 l0,10 z`, fill: color });
        g.append(ln, head, svg('text', { x: (x1 + x2) / 2, y: y - 7, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:600 ${FL}px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:3px`, text: label }));
        if (animate && !ctx.reduced) {
          const len = Math.abs(x2 - x1);
          ln.setAttribute('stroke-dasharray', len); ln.setAttribute('stroke-dashoffset', len); head.style.opacity = 0;
          ln.style.transition = 'stroke-dashoffset .6s ease'; head.style.transition = 'opacity .2s .55s';
          requestAnimationFrame(() => requestAnimationFrame(() => { ln.setAttribute('stroke-dashoffset', 0); head.style.opacity = 1; }));
        }
      }
      gArrows.append(g);
    }
    function paint(animateLast) {
      gArrows.innerHTML = '';
      for (let i = 0; i < st.i; i++) STEPS[i].a.forEach((x, k) => arrow(i, x, k, animateLast && i === st.i - 1));
      detail.innerHTML = st.i ? STEPS[st.i - 1].t() : 'Press <b>Next step</b> to run the flow. Every value below is computed live in your browser.';
      if (st.attack) detail.innerHTML += `<p style="margin:8px 0 0;color:var(--err)"><b>Attack:</b> the attacker intercepted the code but not the verifier, so it sends its own guess. SHA256(guess) = <code>${st.attack.slice(0, 22)}…</code> ≠ stored challenge → <b>invalid_grant</b>. Without PKCE this code alone would have bought tokens.</p>`;
      stats.innerHTML = '';
      [['step', st.i + ' / ' + STEPS.length], ['verifier', st.verifier ? st.verifier.length + ' chars' : '–'], ['challenge', st.challenge ? 'S256' : '–'], ['code', st.code ? 'one-time, ~60 s' : '–']].forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
      next.disabled = st.i >= STEPS.length; att.disabled = st.i < 5;
    }
    next.onclick = async () => {
      if (!subtle || st.i >= STEPS.length) return;
      if (st.i === 0) st.verifier = rand(32);
      if (st.i === 1) st.challenge = await sha256(st.verifier);
      if (st.i === 4) st.code = rand(16);
      if (st.i === 5) st.recomputed = await sha256(st.verifier);
      st.i++; paint(true);
    };
    reset.onclick = () => { pk = null; show(); };
    att.onclick = async () => { st.attack = await sha256(rand(32)); paint(false); };
    paint(false);
  }

  /* ---------- ② JWT decoder / validator ---------- */
  const KEY = 'demo-secret-only-for-this-page', ISS = 'https://login.example.com', AUD = 'orders-api';
  let jw = { mode: 'valid' };
  async function hmac(secret, data) {
    const k = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64u(await subtle.sign('HMAC', k, enc.encode(data)));
  }
  async function makeToken(mode) {
    const now = Math.floor(Date.now() / 1000);
    const h = { alg: 'HS256', typ: 'JWT', kid: 'demo-1' };
    const p = { iss: ISS, sub: 'ana', aud: AUD, scope: 'openid orders:read', iat: now, nbf: now, exp: now + 600, jti: rand(6) };
    if (mode === 'expired') { p.iat = now - 900; p.nbf = now - 900; p.exp = now - 300; }
    if (mode === 'aud') p.aud = 'billing-api';
    if (mode === 'none') h.alg = 'none';
    const part = (o) => b64u(enc.encode(JSON.stringify(o)));
    const signing = part(h) + '.' + part(p);
    if (mode === 'none') return signing + '.';
    const sig = await hmac(mode === 'wrongkey' ? 'attacker-guess' : KEY, signing);
    if (mode === 'tamper') { const p2 = Object.assign({}, p, { sub: 'admin', scope: 'openid orders:admin' }); return part(h) + '.' + part(p2) + '.' + sig; }
    return signing + '.' + sig;
  }
  async function verify(token) {
    const [hs, ps, ss] = token.split('.');
    const h = JSON.parse(dec.decode(unb64u(hs))), p = JSON.parse(dec.decode(unb64u(ps)));
    const now = Math.floor(Date.now() / 1000), skew = 30;
    const algOk = ['HS256'].includes(h.alg);
    let sigOk = false;
    if (algOk && ss) {
      const k = await subtle.importKey('raw', enc.encode(KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      sigOk = await subtle.verify('HMAC', k, unb64u(ss), enc.encode(hs + '.' + ps));
    }
    const aud = [].concat(p.aud || []);
    const checks = [
      ['alg on the allow-list', algOk, algOk ? h.alg + ' (this demo issuer)' : `"${h.alg}" rejected before anything else`],
      ['signature verifies (HMAC-SHA256)', sigOk, !algOk ? 'not attempted: never trust alg "none"' : sigOk ? 'computed with crypto.subtle.verify' : 'bytes changed or wrong key'],
      ['iss = ' + ISS, p.iss === ISS, p.iss],
      ['aud contains ' + AUD, aud.includes(AUD), aud.join(', ')],
      ['exp in the future (±30 s skew)', p.exp + skew > now, (p.exp - now) + ' s left'],
      ['nbf / iat not in the future', (p.nbf || 0) - skew <= now && (p.iat || 0) - skew <= now, 'issued ' + (now - p.iat) + ' s ago']
    ];
    return { h, p, checks, ok: checks.every((c) => c[1]) };
  }
  function jwtTab() {
    const modes = [['valid', '✓ Valid token'], ['expired', 'Expired'], ['aud', 'Wrong aud'], ['tamper', 'Edit payload (sub → admin)'], ['wrongkey', 'Signed with wrong key'], ['none', 'alg: none']];
    const ctl = el('div', { class: 'seg', style: { marginBottom: '10px' } });
    const tokenBox = el('div', { style: Object.assign({}, mono, { fontSize: '13px' }) });
    const parts = el('div', { style: { display: 'grid', gridTemplateColumns: ctx.narrow ? '1fr' : '1fr 1fr', gap: '8px' } });
    const list = el('div', { style: { marginTop: '10px', display: 'grid', gap: '6px' } });
    const verdict = el('div', { class: 'w-stats' });
    const note = el('p', { class: 'muted', style: { fontSize: '13.5px', margin: '10px 0 0' }, html: 'Demo key is a shared <b>HS256</b> secret so your browser can verify it. Real issuers sign with <b>RS256/ES256</b> private keys; your API picks the <b>public</b> key from the issuer\'s <b>JWKS</b> by <code>kid</code> and verifies with it. With a shared HMAC secret, every verifier could also mint tokens.' });
    body.append(ctl, tokenBox, parts, list, verdict, note);
    function renderCtl() { ctl.innerHTML = ''; modes.forEach(([m, l]) => ctl.append(el('button', { class: jw.mode === m ? 'on' : '', text: l, onclick: () => { jw.mode = m; run(); } }))); }
    async function run() {
      renderCtl();
      if (!subtle) return;
      const tok = await makeToken(jw.mode);
      const [a, b, c] = tok.split('.');
      tokenBox.innerHTML = `<span style="color:var(--err)">${a}</span>.<span style="color:var(--accent)">${b}</span>.<span style="color:var(--ok)">${c || ''}</span>`;
      const r = await verify(tok);
      parts.innerHTML = '';
      parts.append(el('div', { style: mono, html: '<b>header</b>\n' + esc(JSON.stringify(r.h, null, 1)) }), el('div', { style: mono, html: '<b>payload</b>\n' + esc(JSON.stringify(r.p, null, 1)) }));
      list.innerHTML = '';
      r.checks.forEach(([k, ok, why]) => list.append(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'baseline', fontSize: '14px' } },
        el('b', { text: ok ? '✓' : '✗', style: { color: ok ? 'var(--ok)' : 'var(--err)', minWidth: '14px' } }),
        el('span', { html: `<b>${esc(k)}</b> <span class="muted">· ${esc(why)}</span>` }))));
      verdict.innerHTML = '';
      verdict.append(el('span', { class: 'w-stat', html: r.ok ? 'result: <b style="color:var(--ok)">200 · accepted</b>' : 'result: <b style="color:var(--err)">401 · rejected</b>' }),
        el('span', { class: 'w-stat', html: `decoding needs: <b>no key</b>` }), el('span', { class: 'w-stat', html: 'claims are <b>signed, not encrypted</b>' }));
    }
    run();
  }

  /* ---------- ③ RBAC vs ABAC ---------- */
  const USERS = {
    ana: { id: 'ana', roles: ['customer'], tenant: 'acme', region: 'EU', l: 'Ana · customer · acme · EU' },
    sam: { id: 'sam', roles: ['support'], tenant: 'acme', region: 'EU', l: 'Sam · support · acme · EU' },
    lee: { id: 'lee', roles: ['support'], tenant: 'acme', region: 'US', l: 'Lee · support · acme · US' },
    kim: { id: 'kim', roles: ['admin'], tenant: 'globex', region: 'EU', l: 'Kim · admin · globex · EU' }
  };
  const RES = {
    o42: { id: 'o42', owner: 'ana', tenant: 'acme', region: 'EU', status: 'open', amount: 80, l: 'Order 42 · owner ana · EU · open · €80' },
    o77: { id: 'o77', owner: 'bob', tenant: 'acme', region: 'US', status: 'shipped', amount: 450, l: 'Order 77 · owner bob · US · shipped · €450' }
  };
  const ROLE_PERMS = { customer: ['read', 'cancel'], support: ['read', 'refund'], admin: ['read', 'cancel', 'refund'] };
  let pol = { u: 'ana', r: 'o77', a: 'cancel', hour: 10 };
  function abac(s, r, a, hour) {
    const rules = [
      { n: 'DENY cross-tenant (overrides all)', deny: true, c: [[s.tenant !== r.tenant, `tenant ${s.tenant} ≠ ${r.tenant}`, 'same tenant']] },
      { n: 'admin: anything in own tenant', c: [[s.roles.includes('admin'), 'is admin', 'not admin'], [s.tenant === r.tenant, 'same tenant', 'other tenant']] },
      { n: 'owner: read or cancel until shipped', c: [[s.id === r.owner, 'is owner', 'not the owner'], [['read', 'cancel'].includes(a), 'action ok', 'action not read/cancel'], [a === 'read' || r.status !== 'shipped', 'not shipped', 'already shipped']] },
      { n: 'support: read in own region, 08–20 UTC', c: [[s.roles.includes('support'), 'is support', 'not support'], [a === 'read', 'read', 'action is not read'], [s.region === r.region, 'same region', 'other region'], [hour >= 8 && hour < 20, 'business hours', 'outside 08–20']] },
      { n: 'support: refund ≤ €100 in own region', c: [[s.roles.includes('support'), 'is support', 'not support'], [a === 'refund', 'refund', 'action is not refund'], [r.amount <= 100, '≤ €100', 'amount > €100'], [s.region === r.region, 'same region', 'other region']] }
    ];
    rules.forEach((x) => { const fail = x.c.find((c) => !c[0]); x.match = !fail; x.why = fail ? fail[2] : x.c.map((c) => c[1]).join(' · '); });
    const denied = rules[0].match, allowed = !denied && rules.slice(1).some((x) => x.match);
    return { rules, allowed };
  }
  function policyTab() {
    const sel = (opts, key) => {
      const s = el('select', { 'aria-label': key, style: { font: 'inherit', fontSize: '14px', padding: '6px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', maxWidth: '100%' } });
      opts.forEach(([v, l]) => { const o = el('option', { value: v, text: l }); if (String(pol[key]) === String(v)) o.selected = true; s.append(o); });
      s.addEventListener('change', () => { pol[key] = key === 'hour' ? +s.value : s.value; run(); });
      return s;
    };
    const row = (l, s) => el('label', { style: { display: 'grid', gap: '4px', fontSize: '13px', color: 'var(--text-2)' } }, l, s);
    body.append(el('div', { style: { display: 'grid', gridTemplateColumns: ctx.narrow ? '1fr' : '1fr 1fr', gap: '8px', marginBottom: '10px' } },
      row('Subject (from token claims)', sel(Object.values(USERS).map((u) => [u.id, u.l]), 'u')),
      row('Resource (loaded by the service)', sel(Object.values(RES).map((r) => [r.id, r.l]), 'r')),
      row('Action', sel([['read', 'read'], ['cancel', 'cancel'], ['refund', 'refund']], 'a')),
      row('Environment: time now', sel([[10, '10:00 UTC'], [22, '22:00 UTC']], 'hour'))));
    const out = el('div', { style: { display: 'grid', gridTemplateColumns: ctx.narrow ? '1fr' : '1fr 1.4fr', gap: '10px' } });
    const verdict = el('div', { class: 'w-log', style: { fontFamily: 'var(--sans)', fontSize: '14px', maxHeight: 'none' } });
    body.append(out, verdict);
    function card(title, inner) { return el('div', { style: { border: '1px solid var(--border)', borderRadius: '10px', padding: '10px', background: 'var(--surface)' } }, el('b', { text: title }), inner); }
    function run() {
      const s = USERS[pol.u], r = RES[pol.r], a = pol.a;
      const grants = s.roles.filter((ro) => ROLE_PERMS[ro].includes(a));
      const rbacAllow = grants.length > 0;
      const A = abac(s, r, a, pol.hour);
      out.innerHTML = '';
      const rb = el('div', { style: { fontSize: '14px', marginTop: '6px' } });
      Object.entries(ROLE_PERMS).forEach(([ro, ps]) => rb.append(el('div', { style: { opacity: s.roles.includes(ro) ? 1 : 0.45 }, html: `${s.roles.includes(ro) ? '▶' : '·'} <b>${ro}</b>: ${ps.map((p) => p === a ? `<u>${p}</u>` : p).join(', ')}` })));
      rb.append(el('div', { style: { marginTop: '8px', fontWeight: 700, color: rbacAllow ? 'var(--ok)' : 'var(--err)' }, text: rbacAllow ? `ALLOW (role ${grants[0]} has "${a}")` : `DENY (no role has "${a}")` }));
      const ab = el('div', { style: { fontSize: '14px', marginTop: '6px', display: 'grid', gap: '5px' } });
      A.rules.forEach((x) => ab.append(el('div', { html: `<b style="color:${x.match ? (x.deny ? 'var(--err)' : 'var(--ok)') : 'var(--text-3)'}">${x.match ? '●' : '○'}</b> ${esc(x.n)}<br><span class="muted" style="font-size:12.5px">${esc(x.why)}</span>` })));
      ab.append(el('div', { style: { marginTop: '4px', fontWeight: 700, color: A.allowed ? 'var(--ok)' : 'var(--err)' }, text: A.allowed ? 'ALLOW' : (A.rules[0].match ? 'DENY (deny overrides)' : 'DENY (default deny)') }));
      out.append(card('RBAC: roles → permissions', rb), card('ABAC: rules over subject, resource, action, time', ab));
      let msg;
      if (rbacAllow && !A.allowed) {
        const role = grants[0];
        const ruleIdx = A.rules[0].match ? 0 : role === 'admin' ? 1 : role === 'customer' ? 2 : a === 'refund' ? 4 : 3;
        const why = ruleIdx === 0 ? 'the order belongs to another tenant' : A.rules[ruleIdx].why;
        const ex = { customer: 'customer_own_unshipped', support: 'support_eu_business_hours', admin: 'admin_tenant_acme' }[role];
        msg = `<b style="color:var(--err)">RBAC over-grants.</b> The role only says "${role} may ${a}". It cannot see the attribute that matters here: <b>${esc(why)}</b>. Encoding that in RBAC means roles like <code>${ex}</code>: role explosion.`;
      }
      else if (!rbacAllow && A.allowed) msg = '<b style="color:var(--warn)">RBAC under-grants.</b> ABAC allows it from attributes no role captures.';
      else if (A.allowed) msg = '<b style="color:var(--ok)">Both allow.</b> Try another user, Order 77, or 22:00 to see where they disagree.';
      else msg = '<b>Both deny.</b> ' + (A.rules[0].match ? 'The cross-tenant deny rule wins regardless of role.' : 'No rule matches, so the default is deny.');
      verdict.innerHTML = msg + '<br><span class="muted">ReBAC (Zanzibar) would instead ask: is there a path <code>user:' + s.id + ' → owner → order:' + r.id.slice(1) + '</code> in the relationship graph?</span>';
    }
    run();
  }

  show();
  ctx.onResize(() => show());
});
