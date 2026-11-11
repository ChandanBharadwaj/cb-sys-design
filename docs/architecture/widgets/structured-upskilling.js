/* Team skills heat-map: people x skills at Dreyfus levels 1-5.
   Training plans add weekly practice; practised cells follow a learning curve, unpractised
   cells above the person's "daily use" level decay (forgetting). Bus factor = people at >= 3. */
SD.widget('structured-upskilling', function (root, ctx) {
  const { el, svg } = ctx;
  const SK = ['Kafka', 'K8s', 'OTel', 'DDD', 'Go'];
  const CRIT = [true, true, true, false, false];
  const PEOPLE = ['Ana', 'Ben', 'Chen', 'Dana', 'Eli', 'Fay'];
  const START = [[5, 3, 2, 2, 1], [2, 4, 1, 3, 3], [1, 2, 4, 2, 2], [1, 2, 1, 4, 1], [1, 1, 2, 1, 4], [1, 1, 1, 2, 1]];
  const RATE = 0.22;        // growth per week at full practice, scaled by headroom (learning curve)
  const DECAY = 0.07;       // share of the "unused" surplus lost per week (forgetting curve)
  let L, base, plans, week, hours, sel, log0;

  function reset() {
    L = START.map((r) => r.slice());
    base = START.map((r) => r.slice());   // levels sustained by daily work: no decay below these
    plans = []; week = 0; hours = 0; sel = { p: 5, s: 0 };
  }

  // ---- controls
  const info = el('div', { class: 'muted', style: { fontSize: '13px', margin: '0 0 6px' } });
  const mk = (t, f, primary) => el('button', { class: 'btn' + (primary ? ' primary' : ''), text: t, onclick: f });
  const ctlA = el('div', { class: 'w-controls' },
    el('span', { class: 'muted', style: { fontSize: '13px' }, text: 'Plan:' }),
    mk('Pair with expert (6 wk)', () => addPlan('pair')),
    mk('Workshop only', () => addPlan('ws')),
    mk('Workshop + katas (6 wk)', () => addPlan('kata')),
    mk('Start guild', () => addPlan('guild')));
  const ctlB = el('div', { class: 'w-controls' },
    mk('▶ +1 week', () => advance(1), true), mk('▶▶ +4 weeks', () => advance(4), true), mk('Reset', () => { reset(); log.innerHTML = ''; say('Reset to week 0.'); render(); }));
  const svgEl = svg('svg', { viewBox: '0 0 360 352', role: 'img', 'aria-label': 'Skills heat-map' });
  const stats = el('div', { class: 'w-stats' });
  const planBox = el('div', { class: 'muted', style: { fontSize: '13px', margin: '6px 0 0' } });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(info, ctlA, ctlB, el('div', { class: 'w-stage', style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px' } }, svgEl), planBox, stats, log);

  const X0 = 74, CW = 56, Y0 = 34, RH = 42;
  const colour = (v) => {   // novice -> expert
    const t = (v - 1) / 4;
    return `color-mix(in srgb, var(--ok) ${Math.round(12 + t * 78)}%, var(--surface))`;
  };

  function expertFor(s, not) {
    let best = -1, bi = -1;
    L.forEach((r, i) => { if (i !== not && r[s] > best) { best = r[s]; bi = i; } });
    return best >= 4 ? bi : -1;
  }

  function addPlan(kind) {
    const { p, s } = sel;
    if (kind === 'pair') {
      const m = expertFor(s, p);
      if (m < 0) { say(`⚠ Nobody is at level 4+ in <b>${SK[s]}</b> to pair with. Try a workshop + katas or a guild first.`); return; }
      if (plans.some((x) => x.kind === 'pair' && x.m === m)) { say(`⚠ ${PEOPLE[m]} is already pairing. Experts can mentor one person at a time without stopping delivery.`); return; }
      plans.push({ kind, p, s, m, left: 6 });
      say(`Pair <b>${PEOPLE[m]}</b> (level ${L[m][s].toFixed(1)}) with <b>${PEOPLE[p]}</b> on real ${SK[s]} tickets, learner driving, for 6 weeks.`);
    } else if (kind === 'ws') {
      plans.push({ kind, s, left: 1 });
      say(`One-day workshop on <b>${SK[s]}</b> for everyone below level 3 next week. No follow-up practice scheduled.`);
    } else if (kind === 'kata') {
      plans.push({ kind, s, left: 6 });
      say(`Workshop on <b>${SK[s]}</b> followed by a 1-hour kata every week for 6 weeks.`);
    } else {
      if (plans.some((x) => x.kind === 'guild' && x.s === s)) { say(`A ${SK[s]} guild already exists.`); return; }
      plans.push({ kind, s, left: Infinity });
      say(`<b>${SK[s]} guild</b> started: voluntary, 1 hour a week, show-and-tell and incident reviews. Runs until you reset.`);
    }
    render();
  }

  function step() {
    week++;
    const prac = L.map((r) => r.map(() => 0));        // practice intensity this week, 0..1
    const boost = L.map((r) => r.map(() => 0));       // one-off jumps (workshop)
    plans.forEach((pl) => {
      if (pl.left <= 0) return;
      if (pl.kind === 'pair') { prac[pl.p][pl.s] = Math.max(prac[pl.p][pl.s], 1); prac[pl.m][pl.s] = Math.max(prac[pl.m][pl.s], 0.5); hours += 8; }
      else if (pl.kind === 'ws' || (pl.kind === 'kata' && pl.left === 6)) {
        L.forEach((r, i) => { if (r[pl.s] < 3) { boost[i][pl.s] += 0.6; hours += 7; } });
      }
      if (pl.kind === 'kata') L.forEach((r, i) => { if (r[pl.s] < 4) { prac[i][pl.s] = Math.max(prac[i][pl.s], 0.45); hours += 1; } });
      if (pl.kind === 'guild') L.forEach((r, i) => { prac[i][pl.s] = Math.max(prac[i][pl.s], 0.3); hours += 1; });
      pl.left--;
    });
    L.forEach((r, i) => r.forEach((v, s) => {
      const mentor = plans.some((pl) => pl.kind === 'pair' && pl.left >= 0 && pl.p === i && pl.s === s) ? 1.4 : 1;
      let nv = Math.min(3, v + boost[i][s]) > v ? Math.min(3, v + boost[i][s]) : v;   // workshops lift to 3 at most
      if (prac[i][s] > 0) nv += RATE * mentor * prac[i][s] * (5 - nv) / 4;         // learning curve: slower near expert
      else if (nv > base[i][s]) nv -= DECAY * (nv - base[i][s]);                   // forgetting without practice
      if (prac[i][s] >= 0.45 && nv >= 3) base[i][s] = Math.max(base[i][s], Math.floor(nv) - 0.5); // applied skill sticks
      r[s] = Math.min(5, nv);
    }));
    plans = plans.filter((pl) => pl.left > 0);
  }

  function advance(n) {
    const before = busFactors();
    for (let k = 0; k < n; k++) step();
    const after = busFactors();
    const ch = SK.map((s, i) => after[i] !== before[i] ? `${s} ${before[i]}→${after[i]}` : '').filter(Boolean);
    say(`Week ${week}: ${ch.length ? 'bus factor ' + ch.join(', ') : 'no bus-factor change'}. ` + (plans.length ? '' : 'No active plans: unpractised gains are decaying.'));
    render();
  }

  const busFactors = () => SK.map((_, s) => L.filter((r) => r[s] >= 3).length);

  function draw() {
    svgEl.innerHTML = '';
    SK.forEach((s, j) => svgEl.append(svg('text', { x: X0 + CW * j + CW / 2, y: 22, 'text-anchor': 'middle', fill: CRIT[j] ? 'var(--text)' : 'var(--text-3)', style: `font:${CRIT[j] ? 700 : 500} 14px var(--sans)`, text: s + (CRIT[j] ? '*' : '') })));
    const training = new Set(); plans.forEach((pl) => { if (pl.kind === 'pair') training.add(pl.p + ':' + pl.s); });
    PEOPLE.forEach((name, i) => {
      const y = Y0 + RH * i;
      svgEl.append(svg('text', { x: 8, y: y + RH / 2 + 5, fill: i === sel.p ? 'var(--accent)' : 'var(--text)', style: `font:${i === sel.p ? 700 : 500} 15px var(--sans)`, text: name }));
      SK.forEach((_, j) => {
        const v = L[i][j], x = X0 + CW * j, on = sel.p === i && sel.s === j;
        const g = svg('g', { style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-label': `${name} ${SK[j]} level ${v.toFixed(1)}` });
        g.append(svg('rect', { x: x + 2, y: y + 2, width: CW - 4, height: RH - 4, rx: 6, fill: colour(v), stroke: on ? 'var(--accent)' : training.has(i + ':' + j) ? 'var(--warn)' : 'var(--border)', 'stroke-width': on ? 3.5 : training.has(i + ':' + j) ? 2.5 : 1 }));
        g.append(svg('text', { x: x + CW / 2, y: y + RH / 2 + 5, 'text-anchor': 'middle', fill: 'var(--text)', style: `font:${v >= 3 ? 700 : 500} 15px var(--mono)`, text: v.toFixed(1) }));
        const pick = () => { sel = { p: i, s: j }; render(); };
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        svgEl.append(g);
      });
    });
    const yb = Y0 + RH * PEOPLE.length + 8, bf = busFactors();
    svgEl.append(svg('text', { x: 8, y: yb + 24, fill: 'var(--text-2)', style: 'font:700 14px var(--sans)', text: 'Bus f.' }));
    bf.forEach((n, j) => {
      const tone = n >= 3 ? 'var(--ok)' : n === 2 ? 'var(--warn)' : 'var(--err)';
      svgEl.append(svg('rect', { x: X0 + CW * j + 6, y: yb + 4, width: CW - 12, height: 30, rx: 15, fill: `color-mix(in srgb, ${tone} 22%, var(--surface))`, stroke: tone, 'stroke-width': 2 }));
      svgEl.append(svg('text', { x: X0 + CW * j + CW / 2, y: yb + 24, 'text-anchor': 'middle', fill: tone, style: 'font:700 15px var(--mono)', text: n }));
    });
  }

  function render() {
    draw();
    const m = expertFor(sel.s, sel.p);
    info.innerHTML = `Selected: <b>${PEOPLE[sel.p]}</b> · <b>${SK[sel.s]}</b> (level ${L[sel.p][sel.s].toFixed(1)}). Pairing mentor: ${m >= 0 ? '<b>' + PEOPLE[m] + '</b>' : 'none at level 4+'}. * = critical skill.`;
    planBox.innerHTML = plans.length ? 'Active: ' + plans.map((pl) => ({ pair: `pair ${PEOPLE[pl.m]}→${PEOPLE[pl.p]} ${SK[pl.s]}`, ws: `workshop ${SK[pl.s]}`, kata: `katas ${SK[pl.s]}`, guild: `${SK[pl.s]} guild` }[pl.kind]) + (pl.left !== Infinity ? ` (${pl.left} wk)` : '')).join(' · ') : 'No active plans.';
    const bf = busFactors(), avg = L.flat().reduce((a, b) => a + b, 0) / (L.length * SK.length);
    const critOk = bf.filter((n, j) => CRIT[j] && n >= 3).length;
    stats.innerHTML = '';
    [['Week', week], ['Average level', avg.toFixed(2)], ['Critical skills with bus factor ≥ 3', critOk + ' / ' + CRIT.filter(Boolean).length], ['Learning hours spent', Math.round(hours)]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }

  function say(t) { log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }

  reset(); render();
  say('Try: select Fay · Kafka, run "Workshop only" and advance 8 weeks (gains fade). Then reset and "Pair with expert": the skill sticks because it is used.');
});
