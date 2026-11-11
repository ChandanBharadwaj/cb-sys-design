/* Incident timeline simulator: a bad deploy breaks checkout at 14:02. The user picks actions at four decision points;
   each choice adds minutes to a phase (detect, ack, diagnose, mitigate). Bars compare the run with ad-hoc and structured
   presets, and a postmortem skeleton is generated from the recorded timeline. */
SD.widget('incident-management', function (root, ctx) {
  const { el, svg } = ctx;
  const START = 14 * 60 + 2, ERR = 0.3, USERS = 20000, BUDGET = 43.2;   // 99.9% over 30 days = 43.2 min
  const PH = [
    { k: 'det', l: 'Detect', c: 'var(--err)' }, { k: 'ack', l: 'Mobilise', c: 'var(--warn)' },
    { k: 'dia', l: 'Diagnose', c: '#a855f7' }, { k: 'mit', l: 'Mitigate', c: 'var(--accent)' }
  ];
  // Each option: phase minutes it adds, timeline text, and the action item it implies in the postmortem.
  const STEPS = [
    { q: 'How do you find out that checkout is failing?', opts: [
      { id: 'slo', l: 'SLO burn-rate alert pages on-call', add: { det: 4 }, ev: 'Burn-rate alert fires on checkout error rate' },
      { id: 'cause', l: 'CPU alert, among 30 others tonight', add: { det: 11, ack: 6 }, ev: 'Noisy cause alert; on-call snoozes it once, then notices', ai: 'Replace cause alerts with SLO burn-rate paging (detect)' },
      { id: 'tickets', l: 'Customers complain to support', add: { det: 22 }, ev: 'Support escalates customer complaints', ai: 'Add SLO burn-rate alert on checkout success rate (detect)' }] },
    { q: 'Who do you bring in?', opts: [
      { id: 'ic', l: 'Declare SEV1: IC + checkout on-call', add: { ack: 3 }, ev: 'SEV1 declared; IC named; checkout on-call is Ops lead' },
      { id: 'all', l: 'Page everyone in engineering', add: { ack: 2, dia: 10 }, ev: '40 people join the bridge; parallel debugging', ai: 'Severity matrix: who is paged per SEV (mobilise)' },
      { id: 'chan', l: 'Post in #engineering and wait', add: { ack: 14, dia: 6 }, ev: 'Message in channel; people trickle in, no one in charge', ai: 'Create IC rota and "declare an incident" command (mobilise)' }] },
    { q: 'A deploy went out at 14:02. What now?', opts: [
      { id: 'rb', l: 'Roll back the 14:02 deploy now', add: { dia: 5, mit: 6 }, ev: 'IC decides to roll back; rollback completes' },
      { id: 'dbg', l: 'Debug to find the root cause', add: { dia: 38, mit: 12 }, ev: 'Root cause found in config; hot-fix built and deployed', ai: 'One-click rollback + "roll back first" in the IC checklist (mitigate)' }] },
    { q: 'Executives and customers are asking. Do you…', opts: [
      { id: 'status', l: 'Comms lead: status page every 30 min', add: {}, ev: 'Status page posted; updates every 30 min' },
      { id: 'quiet', l: 'Stay quiet until it is fixed', add: { dia: 8 }, ev: 'Execs and support DM responders for updates', ai: 'Comms lead role + status-page template (communicate)' }] }
  ];
  const PRESET = { adhoc: ['tickets', 'chan', 'dbg', 'quiet'], structured: ['slo', 'ic', 'rb', 'status'] };

  function run(ids) {
    const t = { det: 0, ack: 0, dia: 0, mit: 0 }, events = [], items = [];
    ids.forEach((id, i) => {
      const o = STEPS[i].opts.find((x) => x.id === id);
      PH.forEach((p) => { t[p.k] += o.add[p.k] || 0; });
      const at = [t.det, t.det + t.ack, t.det + t.ack + t.dia, t.det + t.ack + 3][i];
      events.push({ at, text: o.ev });
      if (o.ai) items.push(o.ai);
    });
    const total = t.det + t.ack + t.dia + t.mit;
    return { t, total, events, items, ids, status: ids[3] === 'status' };
  }
  const hhmm = (m) => { const x = START + Math.round(m); return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };

  // ---- controls and layout
  let picks = [], busy = false;
  const ctl = el('div', { class: 'w-controls' });
  const bAd = el('button', { class: 'btn', text: 'Ad-hoc preset', onclick: () => play(PRESET.adhoc) });
  const bSt = el('button', { class: 'btn', text: 'Structured preset', onclick: () => play(PRESET.structured) });
  const bRe = el('button', { class: 'btn', text: 'Reset', onclick: () => { if (!busy) { picks = []; pmBox.style.display = 'none'; render(); } } });
  const bPm = el('button', { class: 'btn primary', text: '📝 Generate postmortem', onclick: () => postmortem() });
  ctl.append(bAd, bSt, bRe, bPm);
  const qBox = el('div', { style: { margin: '10px 0', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface-2)' } });
  const S = svg('svg', { role: 'img', 'aria-label': 'Incident timeline bars' });
  const legend = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' } });
  legend.innerHTML = PH.map((p) => `<span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${p.c};margin:0 4px 0 8px;vertical-align:-1px"></span>${p.l}`).join('') + ' · ● status update';
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  const pmBox = el('pre', { style: { display: 'none', whiteSpace: 'pre-wrap', fontSize: '13px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px', marginTop: '10px', overflowX: 'auto' } });
  root.append(ctl, qBox, el('div', { class: 'w-stage' }, S), legend, stats, log, pmBox);

  function say(h) { log.prepend(el('div', { html: h })); while (log.children.length > 20) log.lastChild.remove(); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));

  function draw(narrow, grow) {
    const W = narrow ? 360 : 640, L = narrow ? 12 : 120, R = W - 14, fs = narrow ? 14 : 13.5;
    const rows = [['Your run', picks.length ? run(picks) : null], ['Ad hoc', run(PRESET.adhoc)], ['Structured', run(PRESET.structured)]];
    const max = 100, x = (m) => L + (R - L) * Math.min(m, max) / max;
    const rowH = narrow ? 64 : 48, top = 10, H = top + rows.length * rowH + 34;
    S.setAttribute('viewBox', `0 0 ${W} ${H}`); S.innerHTML = '';
    rows.forEach(([name, r], i) => {
      const y0 = top + i * rowH, by = narrow ? y0 + 20 : y0 + 6, bh = narrow ? 26 : 28;
      const lx = narrow ? L : 6, ly = narrow ? y0 + 14 : y0 + 25;
      S.append(svg('text', { x: lx, y: ly, fill: 'var(--text)', style: `font:${i ? 500 : 700} ${fs}px var(--sans)`, text: name + (r ? ` · ${r.total} min` : ' · choose below') }));
      S.append(svg('rect', { x: L, y: by, width: R - L, height: bh, rx: 5, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      if (!r) return;
      let acc = 0;
      PH.forEach((p) => {
        const m = r.t[p.k] * (i === 0 && grow != null ? grow : 1);
        if (m > 0) S.append(svg('rect', { x: x(acc), y: by, width: Math.max(0, x(acc + m) - x(acc)), height: bh, fill: p.c, opacity: i ? 0.55 : 0.9 }));
        acc += m;
      });
      if (r.status) for (let m = 8; m < r.total; m += 30) S.append(svg('circle', { cx: x(m), cy: by + bh / 2, r: 5, fill: 'var(--surface)', stroke: 'var(--text)', 'stroke-width': 2 }));
      if (r.total > max) S.append(svg('text', { x: R - 4, y: by + bh / 2 + 5, 'text-anchor': 'end', fill: '#fff', style: `font:700 ${fs}px var(--sans)`, text: '→' }));
    });
    const ay = top + rows.length * rowH + 8;
    [0, 25, 50, 75, 100].forEach((m) => {
      S.append(svg('line', { x1: x(m), y1: top, x2: x(m), y2: ay, stroke: 'var(--border)', 'stroke-dasharray': '3 4' }));
      S.append(svg('text', { x: x(m), y: ay + 18, 'text-anchor': m === 0 ? 'start' : m === 100 ? 'end' : 'middle', fill: 'var(--text-3)', style: `font:500 ${fs - 0.5}px var(--mono)`, text: m + (m === 100 ? ' min' : '') }));
    });
  }

  function render(grow) {
    draw(ctx.narrow, grow);
    qBox.innerHTML = '';
    const done = picks.length === STEPS.length;
    if (!done) {
      const st = STEPS[picks.length];
      qBox.append(el('p', { style: { margin: '0 0 8px', fontWeight: '600' }, html: `Decision ${picks.length + 1} of ${STEPS.length} · ${hhmm(picks.length ? run(picks).total : 0)}: ${st.q}` }));
      const opts = el('div', { class: 'w-controls', style: { margin: 0 } });
      st.opts.forEach((o) => opts.append(el('button', { class: 'btn', text: o.l, onclick: () => choose(o.id) })));
      qBox.append(opts);
    } else qBox.append(el('p', { style: { margin: 0 }, html: '✅ Incident mitigated. Compare the bars, then press <b>Generate postmortem</b>.' }));
    bPm.disabled = !done;
    stats.innerHTML = '';
    if (picks.length) {
      const r = run(picks);
      [['Time to mitigate', r.total + ' min'], ['Customer-minutes', Math.round(r.total * USERS * ERR).toLocaleString()], ['Error budget used (99.9%)', Math.round(100 * r.total * ERR / BUDGET) + '%'], ['Waiting (detect + mobilise)', Math.round(100 * (r.t.det + r.t.ack) / Math.max(1, r.total)) + '%']]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
  }

  async function choose(id) {
    if (busy) return;
    busy = true;
    const before = picks.length ? run(picks).total : 0;
    picks.push(id);
    const r = run(picks), o = STEPS[picks.length - 1].opts.find((x) => x.id === id);
    const gain = r.total - before;
    say(`${hhmm(r.total)} · <b>${o.l}</b>: +${gain} min${o.ai ? ' <span style="color:var(--warn)">(postmortem item)</span>' : ''}`);
    if (!ctx.reduced) for (let g = 0.2; g < 1; g += 0.2) { render(g); await sleep(70); }
    render();
    if (picks.length === STEPS.length) say(r.total <= 25 ? `✅ Mitigated in <b>${r.total} min</b>, close to the structured response.` : `⚠ Mitigated after <b>${r.total} min</b>. Most of the extra time is waiting and uncoordinated debugging, not the fix.`);
    busy = false;
  }

  async function play(ids) {
    if (busy) return;
    picks = []; pmBox.style.display = 'none'; render();
    for (const id of ids) { await choose(id); await sleep(250); }
  }

  function postmortem() {
    const r = run(picks);
    const lines = ['# Checkout errors after 14:02 deploy (SEV1)', '', '## Impact',
      `~30% of checkout requests failed for ${r.total} min; ~${Math.round(r.total * USERS * ERR).toLocaleString()} customer-minutes; ${Math.round(100 * r.total * ERR / BUDGET)}% of the monthly 99.9% error budget.`,
      '', '## Timeline', '14:02  Deploy of checkout config starts failing payments'];
    r.events.slice().sort((a, b) => a.at - b.at).forEach((e) => lines.push(`${hhmm(e.at)}  ${e.text}`));
    lines.push(`${hhmm(r.total)}  Error rate back to normal; incident mitigated`, '', '## Where the time went');
    PH.forEach((p) => lines.push(`- ${p.l}: ${r.t[p.k]} min`));
    lines.push('', '## Contributing factors (no single root cause)', '- Config change shipped to 100% with no canary', '- Config not validated in CI');
    if (r.items.length) r.items.forEach((a) => lines.push(`- Response gap → ${a.split(' (')[0]}`));
    lines.push('', '## Action items (owner · priority · due)', '- Canary + automatic rollback for config (prevent) · checkout · P1', '- Schema validation for config in CI (prevent) · platform · P1');
    r.items.forEach((a) => lines.push(`- ${a} · TBD · P2`));
    lines.push('', '## What went well / where we got lucky', '- ');
    pmBox.textContent = lines.join('\n'); pmBox.style.display = 'block';
    say('📝 Postmortem skeleton generated below from your timeline. Note: it names <b>no person</b>.');
  }

  ctx.onResize(() => render());
  render();
  say('Answer the four decisions, or play a preset. The faded rows are the reference runs.');
});
