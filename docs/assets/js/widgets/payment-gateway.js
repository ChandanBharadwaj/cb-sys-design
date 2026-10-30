/* Idempotency key state machine + double-entry T-accounts (every posting must net to zero). */
SD.widget('payment-gateway', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 360, H = 388;
  const POINTS = ['started', 'payment_created', 'PSP call', 'finished'];
  const ACCTS = [
    { id: 'rec', name: 'PSP receivable', type: 'asset' },
    { id: 'mer', name: 'Merchant payable', type: 'liability' },
    { id: 'fee', name: 'Fee revenue', type: 'revenue' }
  ];

  let idemOn = true, crashNext = false, busy = false;
  let keySeq = 0, chargeSeq = 0, txnSeq = 0, lastKey = null, intents = 0;
  const keys = new Map();      // key -> { point, charge }
  const pspByKey = new Map();  // PSP-side idempotency: pspKey -> charge id
  const card = [];             // charges on the customer's card { id, key, dup }
  const entries = [];          // { acct, dr, amt, txn }
  const booked = new Set();    // charge ids that have ledger entries

  const payBtn = el('button', { class: 'btn primary', text: '▶ Charge ₹100 (new key)' });
  const retryBtn = el('button', { class: 'btn', text: '↻ Retry same key' });
  const crashBtn = el('button', { class: 'btn', text: '💥 Crash after PSP: off' });
  const idemBtn = el('button', { class: 'btn', text: '🔑 Idempotency: on' });
  const resetBtn = el('button', { class: 'btn', text: 'Reset' });
  root.append(el('div', { class: 'w-controls' }, payBtn, retryBtn, crashBtn, idemBtn, resetBtn));

  const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Idempotency key state and ledger T-accounts', style: 'max-width:460px;margin:0 auto' });
  const gKey = svg('g'), gCard = svg('g'), gT = svg('g');
  S.append(gKey, gCard, gT);
  root.append(el('div', { class: 'w-stage' }, S));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);

  const T = (x, y, text, o) => svg('text', Object.assign({ x, y, text, fill: 'var(--text)', style: 'font:600 12px var(--sans)' }, o || {}));
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));

  /* ---- key state machine pills ---- */
  let keyView = { key: null, at: -1, tone: 'accent' };
  function drawKey() {
    gKey.innerHTML = '';
    gKey.append(T(4, 14, keyView.key ? `Idempotency key ${keyView.key}` : (idemOn ? 'Idempotency key: none yet' : 'Idempotency OFF: every request is new'), { fill: 'var(--text-2)', style: 'font:600 12px var(--sans)' }));
    const pw = 166, gap = 20;
    POINTS.forEach((p, i) => {
      const x = 4 + (i % 2) * (pw + gap), y = 22 + Math.floor(i / 2) * 36;
      const done = idemOn && i <= keyView.at;
      const cur = idemOn && i === keyView.at;
      const col = cur ? `var(--${keyView.tone})` : done ? 'var(--ok)' : 'var(--border)';
      gKey.append(svg('rect', { x, y, width: pw, height: 30, rx: 15, fill: done ? `color-mix(in srgb, ${col} 18%, var(--surface))` : 'var(--surface-2)', stroke: col, 'stroke-width': cur ? 2.5 : 1.2 }));
      gKey.append(T(x + pw / 2, y + 19, p, { 'text-anchor': 'middle', style: `font:${cur ? 700 : 500} 11.5px var(--mono)`, fill: done ? 'var(--text)' : 'var(--text-3)' }));
      if (i % 2 === 0) gKey.append(T(x + pw + gap / 2, y + 19, '›', { 'text-anchor': 'middle', fill: 'var(--text-3)' }));
    });
  }

  /* ---- customer card statement ---- */
  function drawCard() {
    gCard.innerHTML = '';
    gCard.append(T(4, 112, 'Customer card (latest charges)', { fill: 'var(--text-2)' }));
    const shown = card.slice(-5);
    shown.forEach((c, i) => {
      const x = 4 + i * 71, y = 120;
      const col = c.dup ? 'var(--err)' : booked.has(c.id) ? 'var(--ok)' : 'var(--warn)';
      gCard.append(svg('rect', { x, y, width: 66, height: 22, rx: 6, fill: `color-mix(in srgb, ${col} 16%, var(--surface))`, stroke: col }));
      gCard.append(T(x + 33, y + 15, c.id, { 'text-anchor': 'middle', style: 'font:600 10.5px var(--mono)' }));
    });
    if (!card.length) gCard.append(T(4, 135, 'no charges yet', { fill: 'var(--text-3)', style: 'font:500 12px var(--sans)' }));
    gCard.append(T(4, 158, 'green booked · amber not in ledger · red duplicate', { fill: 'var(--text-3)', style: 'font:500 10.5px var(--sans)' }));
  }

  /* ---- T-accounts ---- */
  function drawT() {
    gT.innerHTML = '';
    const tw = 112, top = 168, th = 190;
    ACCTS.forEach((a, i) => {
      const x = 4 + i * (tw + 8);
      const mine = entries.filter((e) => e.acct === a.id);
      const dr = mine.filter((e) => e.dr).reduce((s, e) => s + e.amt, 0);
      const cr = mine.filter((e) => !e.dr).reduce((s, e) => s + e.amt, 0);
      gT.append(svg('rect', { x, y: top, width: tw, height: th, rx: 8, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      gT.append(T(x + tw / 2, top + 17, a.name, { 'text-anchor': 'middle' }));
      gT.append(T(x + tw / 2, top + 31, a.type, { 'text-anchor': 'middle', fill: 'var(--text-3)', style: 'font:500 10px var(--sans)' }));
      gT.append(svg('line', { x1: x + 8, x2: x + tw - 8, y1: top + 40, y2: top + 40, stroke: 'var(--text-2)', 'stroke-width': 1.5 }));
      gT.append(svg('line', { x1: x + tw / 2, x2: x + tw / 2, y1: top + 40, y2: top + th - 30, stroke: 'var(--text-2)', 'stroke-width': 1.5 }));
      gT.append(T(x + 10, top + 54, 'Dr', { fill: 'var(--text-3)', style: 'font:600 10px var(--sans)' }));
      gT.append(T(x + tw - 10, top + 54, 'Cr', { 'text-anchor': 'end', fill: 'var(--text-3)', style: 'font:600 10px var(--sans)' }));
      mine.slice(-6).forEach((e, j) => {
        const y = top + 70 + j * 15;
        const tx = e.dr ? x + tw / 2 - 8 : x + tw - 10;
        gT.append(T(tx, y, `${e.amt} ·t${e.txn}`, { 'text-anchor': 'end', style: 'font:500 10.5px var(--mono)', fill: e.fresh ? 'var(--accent)' : 'var(--text-2)' }));
      });
      const bal = a.type === 'asset' ? dr - cr : cr - dr;
      gT.append(T(x + tw / 2, top + th - 10, `balance ₹${bal}`, { 'text-anchor': 'middle', style: 'font:700 11.5px var(--mono)' }));
    });
    const sDr = entries.filter((e) => e.dr).reduce((s, e) => s + e.amt, 0);
    const sCr = entries.filter((e) => !e.dr).reduce((s, e) => s + e.amt, 0);
    const ok = sDr === sCr;
    gT.append(T(W / 2, H - 6, `Σ Dr ₹${sDr} − Σ Cr ₹${sCr} = ${sDr - sCr} ${ok ? '✓' : '✗'}`, { 'text-anchor': 'middle', fill: ok ? 'var(--ok)' : 'var(--err)', style: 'font:700 12.5px var(--mono)' }));
  }

  function setStats() {
    const total = card.length * 100;
    const over = Math.max(0, total - intents * 100);
    const unbooked = card.filter((c) => !booked.has(c.id)).length;
    stats.innerHTML = '';
    [['payment intents', intents], ['card charges', card.length + ' (₹' + total + ')'], ['overcharged', '₹' + over], ['charged, not booked', unbooked], ['ledger txns', txnSeq]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function paint() { drawKey(); drawCard(); drawT(); setStats(); }

  function post(chargeId) {
    entries.forEach((e) => { e.fresh = false; });
    txnSeq++;
    // charge ₹100, merchant gets ₹97, platform fee ₹3: Σ Dr = Σ Cr
    entries.push({ acct: 'rec', dr: true, amt: 100, txn: txnSeq, fresh: true },
      { acct: 'mer', dr: false, amt: 97, txn: txnSeq, fresh: true },
      { acct: 'fee', dr: false, amt: 3, txn: txnSeq, fresh: true });
    booked.add(chargeId);
  }
  function pspCharge(pspKey, key) {
    if (pspByKey.has(pspKey)) return { id: pspByKey.get(pspKey), replay: true };
    const id = 'ch_' + (++chargeSeq);
    pspByKey.set(pspKey, id);
    const dup = card.some((c) => c.key === key);
    card.push({ id, key, dup });
    return { id, replay: false };
  }

  async function run(key, isRetry) {
    if (busy) return;
    busy = true; [payBtn, retryBtn].forEach((b) => { b.disabled = true; });
    const crash = crashNext;
    if (!idemOn) {
      keyView = { key: null, at: -1, tone: 'accent' }; paint();
      const c = pspCharge('attempt-' + Math.random(), key);
      say(`${isRetry ? 'Retry' : 'Request'} has no key → PSP charges again: <b>${c.id}</b>`);
      await sleep(500);
      if (crash) { say('💥 Crash before the ledger write: card charged, ledger empty.'); }
      else post(c.id);
      if (card.filter((x) => x.key === key).length > 1) say('❌ <b>Double charge.</b> The server could not tell the retry from a new payment.');
    } else {
      let rec = keys.get(key);
      if (!rec) { rec = { at: 0 }; keys.set(key, rec); say(`Key <b>${key}</b> inserted at <code>started</code>.`); }
      keyView = { key, at: rec.at, tone: 'accent' }; paint();
      await sleep(450);
      if (rec.at === 3) {
        say(`Key ${key} is <code>finished</code> → replaying the stored <b>201</b> (${rec.charge}). Nothing re-runs.`);
        keyView.tone = 'ok'; paint();
      } else {
        if (rec.at === 0) { rec.at = 1; keyView.at = 1; say('Phase 1 committed: payment row + recovery point <code>payment_created</code>.'); paint(); await sleep(500); }
        else say(`Resuming from recovery point <code>${POINTS[rec.at]}</code>.`);
        keyView.at = 2; paint();
        const c = pspCharge('pay-' + key, key);
        rec.charge = c.id;
        say(c.replay ? `PSP sees its key <code>pay-${key}</code> again → returns the <b>same</b> ${c.id}. No new charge.` : `PSP call with key <code>pay-${key}</code> → charged <b>${c.id}</b>.`);
        await sleep(550);
        if (crash) {
          keyView = { key, at: 1, tone: 'err' };
          say('💥 Worker crashed before phase 3. Card charged, ledger empty, key stuck at <code>payment_created</code>. Press <b>Retry same key</b>.');
        } else {
          post(c.id); rec.at = 3; keyView = { key, at: 3, tone: 'ok' };
          say('Phase 3 committed in one transaction: 3 balanced entries + outbox row + key <code>finished</code> with response.');
        }
      }
    }
    if (crash) { crashNext = false; crashBtn.textContent = '💥 Crash after PSP: off'; }
    paint();
    busy = false; [payBtn, retryBtn].forEach((b) => { b.disabled = false; });
  }

  payBtn.addEventListener('click', () => { if (busy) return; lastKey = 'k' + (++keySeq); intents++; run(lastKey, false); });
  retryBtn.addEventListener('click', () => { if (!lastKey) { say('Charge something first.'); return; } run(lastKey, true); });
  crashBtn.addEventListener('click', () => { crashNext = !crashNext; crashBtn.textContent = '💥 Crash after PSP: ' + (crashNext ? 'on' : 'off'); });
  idemBtn.addEventListener('click', () => { idemOn = !idemOn; idemBtn.textContent = '🔑 Idempotency: ' + (idemOn ? 'on' : 'off'); keyView = { key: null, at: -1, tone: 'accent' }; paint(); });
  resetBtn.addEventListener('click', () => {
    if (busy) return;
    keys.clear(); pspByKey.clear(); card.length = 0; entries.length = 0; booked.clear();
    keySeq = chargeSeq = txnSeq = intents = 0; lastKey = null; keyView = { key: null, at: -1, tone: 'accent' };
    log.innerHTML = ''; paint(); say('Reset.');
  });

  paint();
  say('Tip: charge once, then <b>Retry same key</b>. Next, turn the crash on, charge, and retry.');
});
