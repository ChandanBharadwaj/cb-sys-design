/* UPI sequence diagram: ReqPay → resolve → debit → credit → RespPay, with failure injection, retry policy and a per-bank circuit breaker. */
SD.widget('upi-payments', function (root, ctx) {
  const { el, svg } = ctx;
  const W = 440, LANE = [46, 133, 220, 307, 394], ROW = 27, TOP = 62;
  const HEADS = [['Payer', 'PSP'], ['Payer', 'bank'], ['NPCI', 'switch'], ['Payee', 'bank'], ['Payee', 'PSP']];
  let fail = 'none', retry = 'status', breaker = true, script = [], shown = 0, anim = 0, timer = null;

  // ---------- controls ----------
  const FAILS = [['none', 'No failure'], ['vpa', 'Bad UPI ID'], ['bank', 'Payer bank down'], ['credit', 'Credit timeout'], ['resp', 'Response lost']];
  const failBtns = FAILS.map(([v, l]) => {
    const b = el('button', { class: 'btn' + (v === fail ? ' primary' : ''), text: l });
    b.addEventListener('click', () => { fail = v; failBtns.forEach((x) => x.classList.toggle('primary', x === b)); start(); });
    return b;
  });
  const retryBtn = el('button', { class: 'btn', text: '' });
  const paintRetry = () => { retryBtn.textContent = retry === 'status' ? 'Retry: check status (same id)' : 'Retry: new ReqPay (new id)'; };
  retryBtn.addEventListener('click', () => { retry = retry === 'status' ? 'newid' : 'status'; paintRetry(); start(); });
  const cbBtn = el('button', { class: 'btn', text: '' });
  const paintCb = () => { cbBtn.textContent = 'Breaker per bank: ' + (breaker ? 'on' : 'off'); };
  cbBtn.addEventListener('click', () => { breaker = !breaker; paintCb(); start(); });
  const payBtn = el('button', { class: 'btn primary', text: '▶ Pay ₹500' });
  payBtn.addEventListener('click', start);
  paintRetry(); paintCb();
  root.append(el('div', { class: 'w-controls' }, ...failBtns), el('div', { class: 'w-controls' }, payBtn, retryBtn, cbBtn));

  const S_ = svg('svg', { viewBox: `0 0 ${W} 300`, role: 'img', 'aria-label': 'UPI message sequence diagram' });
  const gHead = svg('g'), gMsg = svg('g'), gDot = svg('g');
  S_.append(gHead, gMsg, gDot);
  root.append(el('div', { class: 'w-stage' }, S_));
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stats, log);

  // ---------- scripts: [from, to, label, tone, explanation, effect] ; to = -1 means "lost / timed out" ----------
  const M = (f, t, l, tone, txt, fx, dest) => ({ f, t, l, tone, txt, fx, dest });
  function build() {
    const head = [M(0, 2, 'ReqPay T1 ₹500', '', 'Payer PSP stores <b>T1 INITIATED</b>, then sends ReqPay. The PIN block was encrypted on the phone.')];
    const resolve = [M(2, 4, 'ReqAuthDetails', '', 'Switch asks the payee\'s PSP to resolve <code>shop@bank</code>.'), M(4, 2, 'account + IFSC', 'ok', 'Resolved to an account and IFSC.')];
    const debit = (id) => [M(2, 1, 'Debit ₹500', '', `Payer bank verifies the PIN and debits (${id}).`), M(1, 2, 'Debit OK', 'ok', 'Debited.', { payer: -500 })];
    const credit = (id) => [M(2, 3, 'Credit ₹500', '', `Payee bank credits (${id}).`), M(3, 2, 'Credit OK', 'ok', 'Credited.', { payee: 500 })];
    const done = (id) => [M(2, 0, `RespPay ${id} OK`, 'ok', `Switch returns <b>SUCCESS</b> for ${id}.`, { status: 'SUCCESS' }), M(2, 4, 'Notify payee', '', 'Payee app shows "received ₹500".')];
    if (fail === 'none') return [...head, ...resolve, ...debit('T1'), ...credit('T1'), ...done('T1')];
    if (fail === 'vpa') return [...head, M(2, 4, 'ReqAuthDetails', '', 'Switch asks the payee\'s PSP to resolve the UPI ID.'), M(4, 2, 'UPI ID not found', 'err', 'No such UPI ID. <b>Nothing was debited.</b>'), M(2, 0, 'RespPay FAILED', 'err', 'Clean failure before any money moved.', { status: 'FAILED' })];
    if (fail === 'bank') {
      if (breaker) return [M(0, 0, 'breaker OPEN for Bank X: declined in ms', 'warn', 'Recent calls to Bank X failed, so the PSP\'s <b>circuit breaker is open</b>. The payment is declined instantly, nothing is sent, and the app suggests another account.', { status: 'FAILED (fast)' })];
      return [...head, ...resolve, M(2, 1, 'Debit ₹500', '', 'Debit request to Bank X…'), M(1, -1, 'no reply', 'err', 'Bank X\'s core system does not answer before the deadline. The user stares at a spinner; a PSP thread is blocked the whole time.', null, 2),
        M(2, 1, 'Reverse T1', 'warn', 'The debit outcome is unknown, so the switch asks Bank X to <b>reverse</b> in case it went through.'), M(2, 0, 'RespPay FAILED', 'err', 'FAILED after the full deadline. With many such payments, pools fill and healthy banks slow down too.', { status: 'FAILED (slow)' })];
    }
    if (fail === 'credit') return [...head, ...resolve, ...debit('T1'), M(2, 3, 'Credit ₹500', '', 'Credit request to the payee bank…'), M(3, -1, 'no reply', 'err', 'Payee bank times out. The money has <b>left the payer</b> but the credit is unknown.', null, 2),
      M(2, 0, 'RespPay PENDING', 'warn', 'App shows <b>"Pending. Do not pay again."</b>', { status: 'PENDING' }), M(0, 2, 'ReqChkTxn T1', '', 'After a delay, the PSP checks the status of the <b>same id</b>.'), M(2, 3, 'status T1?', '', 'Switch asks the payee bank.'),
      M(3, 2, 'credit FAILED', 'err', 'Payee bank confirms it could not credit.'), M(2, 1, 'Reverse ₹500', 'warn', 'Reversal to the payer\'s bank. RBI rule: by <b>T+1</b>, or ₹100/day compensation.'), M(1, 2, 'Reversed', 'ok', 'Money is back.', { payer: 500 }), M(2, 0, 'T1 REVERSED', 'ok', 'Final state: reversed. No money lost, no double debit.', { status: 'REVERSED' })];
    // response lost
    const lost = [...head, ...resolve, ...debit('T1'), ...credit('T1'), M(2, -1, 'RespPay lost', 'err', 'Payment <b>succeeded</b>, but the response never reaches the app. The user sees a timeout.', null, 0)];
    if (retry === 'status') return [...lost, M(0, 2, 'ReqChkTxn T1', '', 'App asks the PSP; the PSP checks status for <b>T1</b>, the same id.'), M(2, 0, 'T1 SUCCESS', 'ok', 'It already succeeded. Show success. Nothing is sent twice.', { status: 'SUCCESS' })];
    return [...lost, M(0, 2, 'ReqPay T2 ₹500', 'err', 'App "retries" with a <b>new transaction id T2</b>. To the switch this is a brand-new payment.'), ...debit('T2'), ...credit('T2'), M(2, 0, 'RespPay T2 OK', 'err', '<b>Double debit:</b> T1 and T2 both succeeded. The payer paid ₹1,000 for one purchase.', { status: 'DOUBLE DEBIT' })];
  }

  // ---------- drawing ----------
  let H = 300;
  function frame() {
    H = TOP + Math.max(script.length, 6) * ROW + 10;
    S_.setAttribute('viewBox', `0 0 ${W} ${H}`);
    gHead.innerHTML = '';
    HEADS.forEach(([a, b], i) => {
      const x = LANE[i], hot = (i === 1 && fail === 'bank') || (i === 3 && fail === 'credit');
      gHead.append(svg('line', { x1: x, y1: 50, x2: x, y2: H - 6, stroke: 'var(--border)', 'stroke-dasharray': '4 4' }),
        svg('rect', { x: x - 41, y: 4, width: 82, height: 44, rx: 8, fill: hot ? 'color-mix(in srgb, var(--err) 18%, var(--surface))' : i === 2 ? 'color-mix(in srgb, var(--accent) 16%, var(--surface))' : 'var(--surface-2)', stroke: hot ? 'var(--err)' : 'var(--border)' }),
        svg('text', { x, y: 23, 'text-anchor': 'middle', style: 'font:700 13.5px var(--sans)', fill: 'var(--text)', text: a }),
        svg('text', { x, y: 40, 'text-anchor': 'middle', style: 'font:13px var(--sans)', fill: 'var(--text-2)', text: b }));
    });
  }
  const toneColor = (t) => ({ ok: 'var(--ok)', err: 'var(--err)', warn: 'var(--warn)' }[t] || 'var(--accent)');
  function drawMsg(m, i) {
    const y = TOP + i * ROW + 12, c = toneColor(m.tone), g = svg('g');
    if (m.f === m.t) {   // local note (breaker)
      g.append(svg('rect', { x: 6, y: y - 15, width: W - 12, height: 24, rx: 6, fill: 'color-mix(in srgb, var(--warn) 18%, var(--surface))', stroke: c }),
        svg('text', { x: W / 2, y: y + 2, 'text-anchor': 'middle', style: 'font:700 13px var(--sans)', fill: 'var(--text)', text: '⚡ ' + m.l }));
      gMsg.append(g); return;
    }
    const lostTo = m.t < 0, xs = LANE[m.f], xd = LANE[lostTo ? m.dest : m.t];
    const xe = lostTo ? (xs + xd) / 2 : xd;          // a lost message stops halfway with a cross
    const dir = Math.sign(xe - xs) || 1;
    g.append(svg('line', { x1: xs, y1: y, x2: xe - (lostTo ? 0 : dir * 3), y2: y, stroke: c, 'stroke-width': 2, 'stroke-dasharray': lostTo ? '5 4' : '' }));
    if (lostTo) g.append(svg('text', { x: xe, y: y + 5, 'text-anchor': 'middle', style: 'font:700 15px var(--sans)', fill: 'var(--err)', text: '✕' }));
    else g.append(svg('path', { d: `M${xe},${y} l${-dir * 8},-5 l0,10 z`, fill: c }));
    const lx = (xs + xe) / 2;
    g.append(svg('text', { x: lx, y: y - 5, 'text-anchor': 'middle', style: 'font:600 12.5px var(--sans);paint-order:stroke;stroke:var(--surface);stroke-width:3px', fill: m.tone ? c : 'var(--text)', text: m.l }));
    m.geom = { xs, xe, y };
    gMsg.append(g);
  }
  function paintStats(upto) {
    let payer = 0, payee = 0, status = '…';
    script.slice(0, upto).forEach((m) => { if (m.fx) { payer += m.fx.payer || 0; payee += m.fx.payee || 0; if (m.fx.status) status = m.fx.status; } });
    stats.innerHTML = '';
    const tone = /DOUBLE|FAILED \(slow\)/.test(status) ? 'var(--err)' : /PENDING/.test(status) ? 'var(--warn)' : 'var(--text)';
    [['payer balance', (payer < 0 ? '−₹' : payer > 0 ? '+₹' : '₹') + Math.abs(payer)], ['payee balance', (payee > 0 ? '+₹' : '₹') + payee], ['messages', upto], ['status', `<span style="color:${tone}">${status}</span>`]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  function step() {
    if (shown >= script.length) { clearTimeout(timer); return; }
    const m = script[shown];
    drawMsg(m, shown);
    log.prepend(el('div', { html: `<span style="color:var(--text-3)">${shown + 1}.</span> ${m.txt}` }));
    shown++; anim = 0; paintStats(shown);
    if (!ctx.reduced) timer = setTimeout(step, m.t < 0 ? 1300 : 750);
  }
  function start() {
    clearTimeout(timer);
    script = build(); shown = 0; gMsg.innerHTML = ''; gDot.innerHTML = ''; log.innerHTML = '';
    frame(); paintStats(0);
    if (ctx.reduced) { while (shown < script.length) step(); return; }
    timer = setTimeout(step, 250);
  }

  start();
  if (!ctx.reduced) ctx.loop((dt) => {
    gDot.innerHTML = '';
    const m = script[shown - 1];
    if (!m || !m.geom || anim >= 1) return;
    anim = Math.min(1, anim + dt / 450);
    const { xs, xe, y } = m.geom;
    gDot.append(svg('circle', { cx: xs + (xe - xs) * anim, cy: y, r: 5, fill: toneColor(m.tone), stroke: 'var(--surface)', 'stroke-width': 1.5 }));
  });
  ctx.onVisible((v) => { clearTimeout(timer); if (v && shown < script.length && !ctx.reduced) timer = setTimeout(step, 400); });
});
