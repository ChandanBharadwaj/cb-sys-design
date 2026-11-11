/* RFC lifecycle simulator: four stakeholders with hidden concerns review a proposal.
   Actions change their stance; outcome = accepted / stalled; an ADR is generated from what happened. */
SD.widget('rfcs-adrs', function (root, ctx) {
  const { el, svg } = ctx;
  const ST = [
    { id: 'sec', role: 'Security', concern: 'shared tokens across tenants', needs: 'address', fix: 'per-tenant credentials, threat model reviewed' },
    { id: 'fin', role: 'Finance', concern: 'will it double the bill?', needs: 'bench', fix: 'cost model from the benchmark' },
    { id: 'ops', role: 'SRE', concern: 'who is on call, p99 at peak?', needs: 'bench', fix: 'load test at 2x peak, runbook added' },
    { id: 'prod', role: 'Product', concern: 'migration steals roadmap time', needs: 'prewire', fix: 'migration phased behind Q2 launch' }
  ];
  // stance: -2 public objection, -1 concern, 0 neutral, 1 supports, 2 signed off; 'commit' = disagree & commit
  let S, day, sel, bench, deadline, escalated, done, outcome, log0;
  const LBL = { '-2': 'Objects (public)', '-1': 'Has concern', '0': 'Undecided', '1': 'Supportive', '2': 'Signed off', c: 'Disagree & commit' };
  const TONE = { '-2': 'var(--err)', '-1': 'var(--warn)', '0': 'var(--text-3)', '1': 'var(--accent)', '2': 'var(--ok)', c: '#a855f7' };

  function reset() {
    S = ST.map((s) => ({ ...s, stance: 0, known: false, met: false, pre: false, commit: false }));
    day = 0; sel = 0; bench = false; deadline = null; escalated = false; done = false; outcome = null; log0 = [];
    log.innerHTML = '';
    say('A proposal: <b>replace three job queues with one standard</b>. Each stakeholder has a hidden concern. Tap a card, then act.');
    render();
  }

  // ---- controls
  const B = {};
  const mk = (k, t, fn, primary) => (B[k] = el('button', { class: 'btn' + (primary ? ' primary' : ''), text: t, onclick: () => { if (done) return; fn(); if (!done && deadline && fn !== review && fn !== escalate) { finishIfReady(); render(); } } }));
  const ctlA = el('div', { class: 'w-controls' },
    mk('pre', '🤝 Pre-wire (2 d)', prewire), mk('bench', '📊 Add benchmark (4 d)', addBench), mk('addr', '✍ Address objection (2 d)', address));
  const ctlB = el('div', { class: 'w-controls' },
    mk('review', '📣 Publish for review (5 d)', review, true), mk('dl', '⏱ Set deadline (+10 d)', setDeadline), mk('esc', '⬆ Escalate to decider', escalate),
    el('button', { class: 'btn', text: '↺ Reset', onclick: () => reset() }));
  root.append(ctlA, ctlB);
  const stage = el('div', { class: 'w-stage', style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px' } });
  root.append(stage);
  const stats = el('div', { class: 'w-stats' });
  const detail = el('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '14px' } });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  const adr = el('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '13px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', margin: '10px 0 0', overflowX: 'auto' } });
  root.append(detail, stats, log, el('p', { style: { margin: '10px 0 0', fontSize: '13px', fontWeight: '600' }, text: 'Generated ADR (updates as you act)' }), adr);
  function say(t) { log.prepend(el('div', { html: `<b>Day ${day}</b> · ${t}` })); while (log.children.length > 30) log.lastChild.remove(); }

  const key = (s) => (s.commit ? 'c' : String(s.stance));
  const cur = () => S[sel];

  // ---- actions (the mechanism)
  function prewire() {
    const s = cur(); day += 2;
    if (s.pre) { say(`Already met ${s.role}. Repeated meetings add days, not support.`); return render(); }
    s.pre = true; s.known = true;
    if (s.needs === 'prewire') { s.stance = Math.max(s.stance, 1); s.met = true; say(`🤝 ${s.role} shares the concern privately: "${s.concern}". You agree a fix: <b>${s.fix}</b>. Supportive.`); }
    else { s.stance = s.stance === -2 ? -1 : Math.max(s.stance, 0); say(`🤝 ${s.role} tells you privately: "${s.concern}". Now you can answer it in the doc before anyone objects in public.`); }
    render();
  }
  function addBench() {
    if (bench) { say('The benchmark is already in the doc.'); return; }
    bench = true; day += 4;
    S.forEach((s) => { if (s.needs === 'bench' && (s.known || s.stance < 0)) { s.met = true; s.stance = Math.max(s.stance + 2, 1); } });
    say('📊 Spike + load test added: p99 within target at 2x peak, cost model attached. Data answers <b>cost and ops</b> questions, not security ones.');
    render();
  }
  function address() {
    const s = cur(); day += 2;
    if (!s.known) { say(`You do not know ${s.role}\'s concern yet. Pre-wire or publish first.`); return render(); }
    if (s.needs === 'bench' && !bench) { say(`${s.role} wants <b>numbers</b>, not reassurance. Add a benchmark.`); return render(); }
    if (s.met && s.stance >= 1) { s.stance = 2; say(`✍ ${s.role}\'s concern is answered in the doc: <b>${s.fix}</b>. Signed off.`); }
    else { s.met = true; s.stance = Math.min(2, s.stance + (s.stance === -2 ? 2 : 3)); say(`✍ Wrote a section answering ${s.role}: <b>${s.fix}</b>. ${s.stance >= 2 ? 'Signed off.' : 'Softened, but public objections take longer to withdraw.'}`); }
    render();
  }
  function review() {
    day += 5;
    S.forEach((s) => {
      if (!s.known && s.needs === 'bench' && bench) { s.known = true; s.met = true; s.stance = 1; say(`📣 ${s.role} reads the benchmark first; their question is already answered. Supportive.`); }
      else if (!s.known) { s.known = true; s.stance = -2; say(`📣 ${s.role} sees the design for the first time and <b>objects in the thread</b>: "${s.concern}".`); }
      else if (s.met && s.stance >= 1) { s.stance = 2; }
      else if (!s.met) { s.stance = Math.min(s.stance, -1); }
    });
    say('📣 Review round complete. ' + (S.every((s) => s.stance === 2) ? 'Everyone signed off.' : 'Unresolved concerns remain.'));
    finishIfReady(); render();
  }
  function setDeadline() {
    if (deadline) { say('A deadline is already set.'); return; }
    deadline = day + 10; say(`⏱ Comment period closes on <b>day ${deadline}</b>; the decider will call it then.`);
    render();
  }
  function escalate() {
    escalated = true; day += 3;
    const blockers = S.filter((s) => s.stance < 1);
    if (blockers.filter((s) => s.stance === -2 && !s.met).length >= 2) {
      done = true; outcome = 'stalled';
      say('⬆ The decider will not overrule <b>two unanswered public objections</b>: "come back with answers". <b>Stalled.</b>');
    } else {
      blockers.forEach((s) => { s.commit = true; });
      done = true; outcome = 'accepted';
      say(`⬆ Decider accepts. ${blockers.length ? blockers.map((s) => s.role).join(', ') + ' record <b>disagree and commit</b>; buy-in is lower.' : 'No one needed overruling.'}`);
    }
    render();
  }
  function finishIfReady() {
    if (S.every((s) => s.stance === 2)) { done = true; outcome = 'accepted'; }
    else if (deadline && day >= deadline) {
      const open = S.filter((s) => s.stance < 1);
      if (open.length <= 1) { open.forEach((s) => { s.commit = true; }); done = true; outcome = 'accepted'; say(`⏱ Deadline reached. Decider accepts${open.length ? '; ' + open[0].role + ' disagrees and commits' : ''}.`); }
      else { done = true; outcome = 'stalled'; say(`⏱ Deadline reached with <b>${open.length} unresolved objections</b>. The decider rejects for now. <b>Stalled.</b>`); }
    } else if (day > 45) { done = true; outcome = 'stalled'; say('⌛ Six weeks with no decision: people stop reading the thread. <b>Stalled</b> (analysis paralysis).'); }
  }

  // ---- drawing
  function draw() {
    const n = ctx.narrow, W = n ? 360 : 760, cw = n ? 170 : 176, ch = n ? 128 : 140, H = n ? 2 * ch + 70 : ch + 66;
    const s0 = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Stakeholder sign-off cards' });
    S.forEach((s, i) => {
      const x = n ? 6 + (i % 2) * (cw + 8) : 8 + i * (cw + 10), y = n ? 6 + Math.floor(i / 2) * (ch + 8) : 6;
      const k = key(s), c = TONE[k], on = i === sel;
      const g = svg('g', { style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-label': 'Select ' + s.role });
      g.append(svg('rect', { x, y, width: cw, height: ch, rx: 10, fill: `color-mix(in srgb, ${c} 14%, var(--surface))`, stroke: on ? 'var(--text)' : c, 'stroke-width': on ? 3.5 : 2 }));
      g.append(svg('text', { x: x + 12, y: y + 26, fill: 'var(--text)', style: 'font:700 17px var(--sans)', text: s.role }));
      if (s.pre) g.append(svg('text', { x: x + cw - 12, y: y + 26, 'text-anchor': 'end', style: 'font:600 15px var(--sans)', text: '🤝' }));
      g.append(svg('text', { x: x + 12, y: y + 52, fill: 'var(--text-2)', style: 'font:500 14px var(--sans)', text: s.known ? 'Concern known' : 'Concern hidden' }));
      // stance bar −2..+2
      const bx = x + 12, bw = cw - 24, by = y + 68;
      g.append(svg('rect', { x: bx, y: by, width: bw, height: 12, rx: 6, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
      g.append(svg('line', { x1: bx + bw / 2, y1: by - 3, x2: bx + bw / 2, y2: by + 15, stroke: 'var(--text-3)' }));
      const v = s.commit ? 0.5 : s.stance, px = bx + bw / 2 + (v / 2) * (bw / 2);
      g.append(svg('circle', { cx: px, cy: by + 6, r: 8, fill: c }));
      g.append(svg('text', { x: x + 12, y: y + ch - 18, fill: c, style: 'font:700 15px var(--sans)', text: LBL[k] }));
      g.addEventListener('click', () => { sel = i; render(); });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel = i; render(); } });
      s0.append(g);
    });
    // timeline: day 0..45
    const ty = H - 34, tx = 14, tw = W - 28, X = (d) => tx + Math.min(d, 45) / 45 * tw;
    s0.append(svg('rect', { x: tx, y: ty, width: tw, height: 10, rx: 5, fill: 'var(--surface)', stroke: 'var(--border)' }));
    s0.append(svg('rect', { x: tx, y: ty, width: Math.max(0, X(day) - tx), height: 10, rx: 5, fill: outcome === 'stalled' ? 'var(--err)' : outcome ? 'var(--ok)' : 'var(--accent)' }));
    if (deadline) s0.append(svg('line', { x1: X(deadline), y1: ty - 8, x2: X(deadline), y2: ty + 18, stroke: 'var(--warn)', 'stroke-width': 3 }));
    s0.append(svg('text', { x: tx, y: ty + 28, fill: 'var(--text-2)', style: 'font:600 14px var(--sans)', text: 'Day ' + day + (deadline ? ' · deadline ' + deadline : '') }));
    s0.append(svg('text', { x: tx + tw, y: ty + 28, 'text-anchor': 'end', fill: outcome === 'stalled' ? 'var(--err)' : outcome ? 'var(--ok)' : 'var(--text-2)', style: 'font:700 14px var(--sans)', text: outcome ? outcome.toUpperCase() : 'In review' }));
    stage.innerHTML = ''; stage.append(s0);
  }

  function genADR() {
    const signed = S.filter((s) => s.stance === 2 && !s.commit).map((s) => s.role);
    const commits = S.filter((s) => s.commit).map((s) => s.role);
    const status = outcome === 'accepted' ? 'Accepted' : outcome === 'stalled' ? 'Rejected (stalled, may be re-proposed)' : 'Proposed';
    const cons = S.filter((s) => s.met).map((s) => `* ${s.role}: ${s.fix}`);
    const open = S.filter((s) => s.known && !s.met).map((s) => `* OPEN (${s.role}): ${s.concern}`);
    return [`# 42. Use one standard job queue`, ``, `Date: day ${day} of review`, `Deciders: platform director` + (escalated ? ' (escalated)' : ''),
      `Consulted: ${S.map((s) => s.role).join(', ')}`, ``, `## Status`, status, ``, `## Context`,
      `Three queue technologies across four teams; incidents are slow to debug.` + (bench ? ` Spike: p99 within target at 2x peak.` : ` No benchmark attached.`), ``,
      `## Decision`, `We will migrate background jobs to one managed queue, using a paved-road template and a codemod.`, ``,
      `## Consequences`, ...(cons.length ? cons : ['* (no stakeholder concerns addressed yet)']), ...open,
      ...(commits.length ? [`* Disagree and commit: ${commits.join(', ')}`] : []), ...(signed.length ? [`* Signed off: ${signed.join(', ')}`] : [])].join('\n');
  }

  function render() {
    draw();
    const s = cur();
    detail.innerHTML = `<b>${s.role}</b>: ` + (s.known ? `concern "<i>${s.concern}</i>". Needs: <b>${{ address: 'a written answer (address objection)', bench: 'data (benchmark) then a written answer', prewire: 'a private conversation (pre-wire)' }[s.needs]}</b>.` : 'concern unknown. Pre-wire to learn it privately, or publish and hear it in public.');
    const signed = S.filter((x) => x.stance === 2 && !x.commit).length, commits = S.filter((x) => x.commit).length;
    const buy = Math.max(0, Math.round((S.reduce((a, x) => a + (x.commit ? 0.3 : (x.stance + 2) / 4), 0) / 4) * 100));
    stats.innerHTML = '';
    [['Day', day], ['Signed off', signed + ' / 4'], ['Disagree & commit', commits], ['Buy-in', buy + '%'], ['Outcome', outcome || 'in review']]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    Object.values(B).forEach((b) => { b.disabled = done; });
    B.bench.disabled = done || bench; B.dl.disabled = done || !!deadline;
    adr.textContent = genADR();
    if (done && !log0.includes('end')) { log0.push('end'); say(outcome === 'accepted' ? `✅ <b>Accepted</b> in ${day} days with ${buy}% buy-in. ADR-0042 written below.` : `❌ <b>Stalled</b> after ${day} days. Try pre-wiring before you publish.`); }
  }

  ctx.onResize(() => draw());
  reset();
});
