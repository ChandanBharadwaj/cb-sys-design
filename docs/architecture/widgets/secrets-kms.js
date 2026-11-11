/* Envelope encryption lab (real AES-256-GCM DEKs wrapped with AES-KW KEKs via WebCrypto) + leaked-secret timeline. */
SD.widget('secrets-kms', function (root, ctx) {
  const { el, svg } = ctx;
  const subtle = window.crypto && window.crypto.subtle;
  const enc = new TextEncoder(), dec = new TextDecoder();
  let tab = 'env';
  const tabsBar = el('div', { class: 'seg', role: 'tablist', style: { marginBottom: '12px' } });
  const body = el('div');
  root.append(tabsBar, body);
  const TABS = [['env', '① Envelope encryption'], ['leak', '② Leaked-secret timeline']];
  function show() {
    tabsBar.innerHTML = '';
    TABS.forEach(([id, l]) => tabsBar.append(el('button', { class: tab === id ? 'on' : '', role: 'tab', text: l, onclick: () => { tab = id; show(); } })));
    body.innerHTML = '';
    (tab === 'env' ? envTab : leakTab)(ctx.narrow);
  }
  if (!subtle) root.append(el('p', { class: 'muted', text: 'This demo needs WebCrypto (crypto.subtle), available on HTTPS or localhost.' }));

  /* ---------- ① Envelope encryption ---------- */
  const SIZES = [2048, 5120, 1536, 8192, 3072, 4096];
  const st = { recs: [], keks: [], log: [], naive: 0, wrapBytes: 0, ready: false };
  async function newKek(v) {
    const key = await subtle.generateKey({ name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']); // non-extractable, like an HSM key
    return { v, key, state: 'active' };
  }
  async function encryptAll() {
    st.recs = []; st.keks = [await newKek(1)]; st.naive = 0; st.wrapBytes = 0; st.log = [];
    for (let i = 0; i < SIZES.length; i++) {
      const dek = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const pt = enc.encode(('customer ' + (i + 1) + ' record ').padEnd(SIZES[i], '.'));
      const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, dek, pt));
      const wrapped = new Uint8Array(await subtle.wrapKey('raw', dek, st.keks[0].key, 'AES-KW'));
      st.recs.push({ i, iv, ct, wrapped, kv: 1, ok: null }); // plaintext DEK is dropped here
    }
    st.ready = true;
    log(`Encrypted ${st.recs.length} records: each with its own AES-256-GCM DEK, DEK wrapped by KEK v1 (AES-KW → ${st.recs[0].wrapped.length} bytes).`);
  }
  const cur = () => st.keks[st.keks.length - 1];
  const kekOf = (v) => st.keks.find((k) => k.v === v);
  async function rotate() {
    const nk = await newKek(cur().v + 1);
    st.keks.forEach((k) => { if (k.state === 'active') k.state = 'retained'; });
    st.keks.push(nk);
    let bytes = 0;
    for (const r of st.recs) {
      const old = kekOf(r.kv);
      if (!old || old.state === 'destroyed') continue;
      const dek = await subtle.unwrapKey('raw', r.wrapped, old.key, 'AES-KW', 'AES-GCM', true, ['encrypt', 'decrypt']);
      r.wrapped = new Uint8Array(await subtle.wrapKey('raw', dek, nk.key, 'AES-KW'));
      r.kv = nk.v; bytes += r.wrapped.length;
    }
    st.wrapBytes += bytes;
    const data = st.recs.reduce((n, r) => n + r.ct.length, 0);
    st.naive += data;
    log(`Rotated to KEK v${nk.v}: re-wrapped ${st.recs.length} DEKs = <b>${bytes} bytes</b>. Naive re-encryption would rewrite <b>${data.toLocaleString('en-US')} bytes</b> of data (${Math.round(data / Math.max(bytes, 1))}×). Ciphertext untouched.`);
  }
  async function decryptAll() {
    let good = 0;
    for (const r of st.recs) {
      const k = kekOf(r.kv);
      try {
        if (!k || k.state === 'destroyed') throw new Error('KEK destroyed');
        const dek = await subtle.unwrapKey('raw', r.wrapped, k.key, 'AES-KW', 'AES-GCM', false, ['decrypt']);
        const pt = dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: r.iv }, dek, r.ct));
        r.ok = pt.startsWith('customer'); good++;
      } catch (e) { r.ok = false; }
    }
    log(good === st.recs.length ? `Decrypted all ${good} records: unwrap DEK with its KEK version, then AES-GCM decrypt locally (tag verified).` : `<span style="color:var(--err)">Decrypted ${good} / ${st.recs.length}. Without the KEK the wrapped DEKs cannot be opened: the data is <b>crypto-shredded</b>, including every backup copy.</span>`);
  }
  function revoke() {
    st.keks.forEach((k) => { k.state = 'destroyed'; k.key = null; });
    st.recs.forEach((r) => { r.ok = null; });
    log('<span style="color:var(--err)">All KEK versions destroyed (in AWS KMS: ScheduleKeyDeletion, 7–30 day wait).</span> Try <b>Decrypt all</b>.');
  }
  function log(h) { st.log.unshift(h); st.log = st.log.slice(0, 5); }

  function envTab(narrow) {
    const btn = (t, f, p) => el('button', { class: 'btn' + (p ? ' primary' : ''), text: t, onclick: async () => { if (!subtle) return; await f(); paint(); } });
    const bEnc = btn('🔐 Encrypt records', encryptAll, true), bRot = btn('🔄 Rotate KEK', rotate), bDec = btn('🔓 Decrypt all', decryptAll), bRev = btn('🗑 Destroy KEK', revoke);
    body.append(el('div', { class: 'w-controls' }, bEnc, bRot, bDec, bRev));
    const n = narrow ? 5 : 6, W = narrow ? 360 : 600, F = narrow ? 14 : 14, ROW = narrow ? 44 : 40, TOP = 66;
    const S = svg('svg', { viewBox: `0 0 ${W} ${TOP + n * ROW + 6}`, role: 'img', 'aria-label': 'Records with wrapped data keys' });
    const stats = el('div', { class: 'w-stats' });
    const lg = el('div', { class: 'w-log', 'aria-live': 'polite', style: { fontFamily: 'var(--sans)', fontSize: '14px', lineHeight: '1.5', maxHeight: 'none' } });
    body.append(el('div', { class: 'w-stage' }, S), stats, lg);
    const T = (x, y, t, o = {}) => svg('text', Object.assign({ x, y, fill: 'var(--text)', style: `font:${o.w || 600} ${o.f || F}px var(--sans)`, text: t }, o.a ? { 'text-anchor': o.a } : {}));
    function paint() {
      S.innerHTML = '';
      bRot.disabled = bDec.disabled = bRev.disabled = !st.ready || !st.keks.some((k) => k.state !== 'destroyed');
      if (st.ready && st.keks.every((k) => k.state === 'destroyed')) bDec.disabled = false;
      // KMS box with KEK versions
      S.append(svg('rect', { x: 2, y: 2, width: W - 4, height: 48, rx: 10, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      S.append(T(12, 31, 'KMS', { w: 700 }));
      const shown = st.keks.slice(-(narrow ? 3 : 4));
      const kw = narrow ? 92 : 120;
      shown.forEach((k, j) => {
        const x = (narrow ? 58 : 80) + j * (kw + 6);
        const col = k.state === 'active' ? 'var(--ok)' : k.state === 'retained' ? 'var(--accent)' : 'var(--err)';
        S.append(svg('rect', { x, y: 10, width: kw, height: 32, rx: 7, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-dasharray': k.state === 'destroyed' ? '4 3' : '' }));
        S.append(T(x + kw / 2, 31, 'KEK v' + k.v + (k.state === 'active' ? ' ✓' : k.state === 'retained' ? ' (old)' : ' ✗'), { a: 'middle', f: 13 }));
      });
      if (!st.ready) S.append(T(W / 2, 31, 'press Encrypt', { a: 'middle', f: 13, w: 500 }));
      const recs = st.recs.slice(0, n);
      const maxC = Math.max(...SIZES) + 16;
      const dataX = narrow ? 74 : 110, dataW = narrow ? 170 : 330, chipX = dataX + dataW + 8, chipW = W - chipX - 4;
      recs.forEach((r, j) => {
        const y = TOP + j * ROW;
        S.append(T(4, y + 22, 'rec ' + (r.i + 1), { f: 13 }));
        const w = Math.min(dataW, Math.max(30, r.ct.length / maxC * dataW));
        const col = r.ok === false ? 'var(--err)' : r.ok ? 'var(--ok)' : 'var(--text-3)';
        S.append(svg('rect', { x: dataX, y: y + 6, width: w, height: 24, rx: 5, fill: col, opacity: 0.35 }));
        S.append(T(dataX + 6, y + 23, (r.ct.length / 1024).toFixed(1) + ' KB' + (r.ok === false ? ' locked' : r.ok ? ' ✓' : ''), { f: 13 }));
        const k = kekOf(r.kv), dead = !k || k.state === 'destroyed';
        S.append(svg('rect', { x: chipX, y: y + 6, width: chipW, height: 24, rx: 12, fill: 'none', stroke: dead ? 'var(--err)' : 'var(--accent)', 'stroke-width': 2 }));
        S.append(T(chipX + chipW / 2, y + 23, 'DEK·v' + r.kv, { a: 'middle', f: 13 }));
      });
      const data = st.recs.reduce((s2, r) => s2 + r.ct.length, 0);
      stats.innerHTML = '';
      [['records', st.recs.length], ['data', (data / 1024).toFixed(1) + ' KB'], ['wrapped DEK', st.recs[0] ? st.recs[0].wrapped.length + ' B' : '–'], ['bytes re-wrapped', st.wrapBytes.toLocaleString('en-US')], ['naive re-encrypt', st.naive.toLocaleString('en-US')]].forEach(([a, b]) => stats.append(el('span', { class: 'w-stat', html: `${a}: <b>${b}</b>` })));
      lg.innerHTML = st.log.length ? st.log.map((h) => `<div style="margin-bottom:6px">${h}</div>`).join('') : 'Press <b>Encrypt records</b>. Keys are real WebCrypto keys; the KEKs are non-extractable, like keys inside an HSM.' + (narrow ? ' (Phone view shows 5 of 6 records.)' : '');
    }
    paint();
    if (subtle && !st.ready) encryptAll().then(paint);
  }

  /* ---------- ② Leaked-secret timeline ---------- */
  const tl = { leak: 20, detect: 25, rot: 90 };
  function leakTab(narrow) {
    const W = narrow ? 360 : 600, D = 120, L = 10, R = W - 10, F = 14;
    const x = (d) => L + (R - L) * d / D;
    const ctrls = el('div', { class: 'w-controls', style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px' } });
    const S = svg('svg', { viewBox: `0 0 ${W} 210`, role: 'img', 'aria-label': 'Exposure timeline' });
    const stats = el('div', { class: 'w-stats' });
    const note = el('div', { class: 'w-log', style: { fontFamily: 'var(--sans)', fontSize: '14px', lineHeight: '1.5', maxHeight: 'none' } });
    const slider = (k, label, min, max) => {
      const out = el('b', { text: tl[k] + ' d' });
      const inp = el('input', { type: 'range', min, max, value: tl[k], style: { width: '100%' } });
      inp.oninput = () => { tl[k] = +inp.value; out.textContent = tl[k] + ' d'; paint(); };
      return el('label', { style: { fontSize: '14px' } }, label + ': ', out, inp);
    };
    ctrls.append(slider('leak', 'Key leaks on day', 0, 110), slider('detect', 'Days until someone notices', 0, 120), slider('rot', 'Static key rotation interval', 7, 365));
    body.append(ctrls, el('div', { class: 'w-stage' }, S), stats, note);
    const T = (x0, y, t, a, c) => svg('text', { x: x0, y, fill: c || 'var(--text)', 'text-anchor': a || 'start', style: `font:600 ${F}px var(--sans)`, text: t });
    function paint() {
      S.innerHTML = '';
      const nextRot = Math.ceil((tl.leak + 0.001) / tl.rot) * tl.rot;
      const detectAt = tl.leak + tl.detect;
      const staticEnd = Math.min(nextRot, detectAt);
      const remaining = 1 / 24 / 2; // leaked mid-lease: on average half of a 1 h TTL remains
      const dynEnd = tl.leak + Math.min(remaining, tl.detect);
      // axis
      S.append(svg('line', { x1: L, y1: 180, x2: R, y2: 180, stroke: 'var(--border)', 'stroke-width': 2 }));
      for (let d = 0; d <= D; d += narrow ? 30 : 15) { S.append(svg('line', { x1: x(d), y1: 176, x2: x(d), y2: 184, stroke: 'var(--border)' })); S.append(T(x(d), 202, d + 'd', d === 0 ? 'start' : d === D ? 'end' : 'middle', 'var(--text-3)')); }
      for (let d = tl.rot; d <= D; d += tl.rot) S.append(svg('line', { x1: x(d), y1: 30, x2: x(d), y2: 176, stroke: 'var(--accent)', 'stroke-dasharray': '3 4', opacity: 0.6 }));
      // leak + detect markers
      S.append(svg('line', { x1: x(tl.leak), y1: 22, x2: x(tl.leak), y2: 180, stroke: 'var(--err)', 'stroke-width': 2 }));
      S.append(T(Math.min(x(tl.leak) + 4, R - 50), 18, 'leak', 'start', 'var(--err)'));
      if (detectAt <= D) { S.append(svg('line', { x1: x(detectAt), y1: 22, x2: x(detectAt), y2: 180, stroke: 'var(--warn)', 'stroke-width': 2 })); S.append(T(Math.max(x(detectAt) - 4, 60), 18, 'revoked', 'end', 'var(--warn)')); }
      // bars
      const bar = (y, a, b, col, lbl) => {
        S.append(T(L, y - 8, lbl));
        S.append(svg('rect', { x: x(a), y, width: Math.max(4, x(Math.min(b, D)) - x(a)), height: 26, rx: 5, fill: col, opacity: 0.75 }));
      };
      bar(62, tl.leak, staticEnd, 'var(--err)', 'Static key (rotated every ' + tl.rot + ' d)');
      bar(132, tl.leak, dynEnd, 'var(--ok)', 'Dynamic credential (1 h lease)');
      const sh = (staticEnd - tl.leak) * 24, dh = (dynEnd - tl.leak) * 24;
      stats.innerHTML = '';
      [['static exposure', sh >= 48 ? (sh / 24).toFixed(1) + ' days' : sh.toFixed(1) + ' h'], ['ended by', staticEnd === detectAt ? 'detection' : 'scheduled rotation'], ['dynamic exposure', dh.toFixed(1) + ' h'], ['ratio', Math.round(sh / Math.max(dh, 0.01)) + '×']].forEach(([a, b]) => stats.append(el('span', { class: 'w-stat', html: `${a}: <b>${b}</b>` })));
      note.innerHTML = `A copied static key works until it is <b>revoked</b> or the <b>next rotation</b> (dashed lines), whichever comes first. A dynamic credential leaked mid-lease dies on its own after the remaining TTL (on average half of 1 h), even if nobody notices. The leaked-secret playbook is the same for both: <b>revoke → rotate → audit</b> what the credential did between the red and amber lines.`;
    }
    paint();
  }

  ctx.onResize(() => show());
  show();
});
