/* Message rewriter (Minto pyramid: answer, 3 supports, ask, per audience vocabulary)
   + draggable Mendelow power/interest grid with a suggested communication plan. */
SD.widget('stakeholder-communication', function (root, ctx) {
  const { el, svg } = ctx;
  const SIT = {
    shard: { l: 'Shard the monolith DB', facts: '3 months · 4 engineers · ~$400K · cut-over may need downtime' },
    api: { l: 'Retire API v1', facts: '6 weeks · 40 client integrations · breaking change' },
    delay: { l: 'Launch slips 3 weeks', facts: 'security finding · fix needs 3 weeks · marketing booked' }
  };
  const AUD = { exec: 'Executive', pm: 'Product', eng: 'Engineers', ops: 'Ops / SRE' };
  // [answer headline, answer sentence], 3 × [short, long], [ask short, ask long]
  const MSG = {
    shard: {
      exec: [['Approve $400K, 3 months', 'Approve ~$400K and 3 months to split the orders database; without it we expect peak-season outages.'],
        [['Protects revenue', 'One hour of checkout downtime ≈ $50K in lost orders; doing nothing risks ~$240K a year (estimate).'], ['Risk is bounded', '10% chance of a short outage at cut-over, in a Sunday window with rollback.'], ['Pays back in ~9 mo', 'Risk-adjusted ROI ≈ 300% over 3 years; it also lets us grow 5× without re-platforming.']],
        ['Decision by Friday', 'Approve budget and a 2-hour Sunday window by Friday 14 March.']],
      pm: [['Two features slip 1 sprint', 'Sharding takes 3 months; two roadmap items move one sprint each, and checkout stays fast through Q4.'],
        [['Checkout stays fast', 'Peak latency stays under target, so conversion is protected in the busiest quarter.'], ['Small roadmap impact', 'Only the orders team pauses; search and onboarding continue as planned.'], ['One announced window', 'One announced 2-hour Sunday window; support gets a script a week ahead.']],
        ['Re-order the backlog', 'Agree which two items move, and own the customer announcement.']],
      eng: [['Shard orders by tenant_id', 'We will shard the orders schema by tenant_id across 8 Postgres shards with a routing layer.'],
        [['Primary at 80% CPU', 'Write load grows 6% a month; vertical scaling buys ~6 months only.'], ['Dual-write, then flip', 'Backfill with logical replication, dual-write, verify checksums, flip reads per tenant.'], ['Cross-shard joins go', 'Three reports move to the warehouse; we list every query that breaks.']],
        ['Review the design doc', 'Review the RFC by Wednesday; orders team owns the routing layer.']],
      ops: [['2-hour freeze, Sunday', 'Cut-over needs a 2-hour write freeze on Sunday 02:00–04:00, with a tested rollback.'],
        [['8 new primaries', 'Each shard has a replica and its own alerts; dashboards per shard.'], ['Rollback in 15 min', 'Flip routing back to the old primary; rehearsed twice in staging.'], ['On-call changes', 'Runbooks for shard failover and rebalancing; two extra pages a month expected.']],
        ['Staff the window', 'Two SREs on the Sunday window; sign off the runbooks by the 1st.']]
    },
    api: {
      exec: [['Retire v1 by June', 'Retire API v1 by June to cut ~$150K a year of support and security cost (estimate).'],
        [['Lower cost', 'v1 needs its own patching and on-call; one stack instead of two.'], ['Less security risk', 'v1 lacks the new auth model; it was in last year\'s audit findings.'], ['Churn risk is small', '40 integrations; top 10 customers already migrated, others get 6 weeks and help.']],
        ['Back the deadline', 'Support a firm sunset date if a large customer pushes back.']],
      pm: [['Sunset v1 in 6 weeks', 'v1 stops on 30 June; every remaining client gets a migration guide and a named contact.'],
        [['Customers get a guide', 'Step-by-step mapping v1 → v2, with code samples.'], ['Faster features after', 'New features ship once, on v2 only.'], ['Tracked per customer', 'Dashboard of v1 traffic per client; outreach weekly.']],
        ['Own the comms', 'Send the announcement and chase the last 10 clients.']],
      eng: [['Delete v1 after 30 June', 'v1 endpoints return 410 Gone after 30 June; code removed in July.'],
        [['Sunset headers now', 'Add Deprecation and Sunset headers (RFC 8594) to every v1 response.'], ['Traffic by client', 'Log client_id on v1 calls to drive outreach.'], ['Brownouts first', 'Two short planned brownouts flush out forgotten clients.']],
        ['Ship headers this sprint', 'Platform team adds headers and the per-client dashboard this sprint.']],
      ops: [['Brownouts in May', 'Two 1-hour v1 brownouts in May, then shutdown on 30 June.'],
        [['Expect support tickets', 'Brownouts will raise tickets; support has the script.'], ['Alerts change', 'v1 alerts removed after shutdown; v2 capacity +10%.'], ['Rollback possible', 'Shutdown is a routing flag; can be reversed for 2 weeks.']],
        ['Schedule brownouts', 'Pick brownout windows and own the routing flag.']]
    },
    delay: {
      exec: [['Launch moves 3 weeks', 'We recommend moving the launch 3 weeks to fix a security finding; shipping now risks a breach on day one.'],
        [['Breach costs far more', 'A data exposure would mean notification, fines and churn; the delay costs ~$60K of campaign rebooking (estimate).'], ['Known, contained fix', 'The fix is understood; 3 weeks includes a re-test by the external pen-testers.'], ['Can ship partially', 'We can launch on the original date without the affected feature.']],
        ['Choose today', 'Choose: 3-week delay (recommended) or partial launch, by end of day.']],
      pm: [['New date: 3 weeks later', 'Launch moves 3 weeks; or we ship on time without file sharing.'],
        [['Customers protected', 'Shipping now could expose other customers\' files.'], ['Partial launch option', 'Everything except file sharing can go on the original date.'], ['Marketing needs 2 days', 'Campaign can be rebooked if we decide today.']],
        ['Pick the option', 'Pick delay or partial launch and tell marketing today.']],
      eng: [['Fix access check first', 'Fix the authorisation check on file links before launch; 3 weeks including re-test.'],
        [['IDOR on file links', 'Signed links do not check tenant; any user can guess another tenant\'s file.'], ['Fix + tests', 'Tenant check in the service, plus property tests on link generation.'], ['Pen-test re-run', 'External testers re-test in week 3.']],
        ['Swarm on the fix', 'Two engineers from search join the files team for 2 weeks.']],
      ops: [['Launch week moves', 'Launch-week on-call shifts 3 weeks later; extra WAF rules now.'],
        [['Temporary WAF rule', 'Block cross-tenant link patterns until the fix ships.'], ['Audit logging on', 'Turn on file-access audit logs to check for past abuse.'], ['Capacity plan holds', 'No change to scaling; only the date moves.']],
        ['Deploy the WAF rule', 'Deploy the WAF rule today and confirm logs are flowing.']]
    }
  };
  const VOC = { exec: 'revenue · cost · risk in $ · time', pm: 'roadmap · customers · conversion', eng: 'design · effort · trade-offs', ops: 'windows · runbooks · on-call' };
  const people = [
    { id: 'CEO', p: 0.9, i: 0.4 }, { id: 'CFO', p: 0.85, i: 0.2 }, { id: 'VP Prod', p: 0.75, i: 0.85 },
    { id: 'SRE', p: 0.35, i: 0.85 }, { id: 'Support', p: 0.2, i: 0.6 }, { id: 'Sales', p: 0.4, i: 0.15 }
  ];
  const QUAD = {
    mc: { l: 'Manage closely', plan: 'weekly 1:1, pre-wire every decision, options + recommendation, involve in trade-offs' },
    ks: { l: 'Keep satisfied', plan: 'monthly one-page BLUF memo in money / risk / time; escalate only exceptions' },
    ki: { l: 'Keep informed', plan: 'fortnightly status with RAG reasons, invite feedback, demos' },
    mo: { l: 'Monitor', plan: 'changelog or newsletter; re-check interest at milestones' }
  };
  const quad = (o) => o.p >= 0.5 ? (o.i >= 0.5 ? 'mc' : 'ks') : (o.i >= 0.5 ? 'ki' : 'mo');
  const st = { sit: 'shard', aud: 'exec' };
  let gen = 0;

  function build(narrow) {
    const my = ++gen;
    root.innerHTML = '';
    const VW = narrow ? 360 : 560, FS = narrow ? 14 : 14;
    // controls
    const c1 = el('div', { class: 'w-controls' }, el('b', { text: 'Situation:' }));
    const sb = Object.keys(SIT).map((k) => { const b = el('button', { class: 'btn' + (st.sit === k ? ' primary' : ''), text: SIT[k].l }); b.addEventListener('click', () => { st.sit = k; sb.forEach((x) => x.classList.toggle('primary', x === b)); draw(); }); c1.append(b); return b; });
    const c2 = el('div', { class: 'w-controls' }, el('b', { text: 'Audience:' }));
    const ab = Object.keys(AUD).map((k) => { const b = el('button', { class: 'btn' + (st.aud === k ? ' primary' : ''), text: AUD[k] }); b.addEventListener('click', () => { st.aud = k; ab.forEach((x) => x.classList.toggle('primary', x === b)); draw(); }); c2.append(b); return b; });
    root.append(c1, c2);
    const facts = el('p', { class: 'muted', style: { margin: '4px 0', fontSize: '13px' } });
    const VH = narrow ? 300 : 250;
    const P = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': 'Message pyramid', style: narrow ? '' : 'max-width:720px;display:block;margin:0 auto' });
    const msg = el('div', { style: { fontSize: '14px', lineHeight: '1.5' } });
    root.append(facts, el('div', { class: 'w-stage' }, P), msg);

    function box(g, x, y, w, h, fill, t1, t2) {
      g.append(svg('rect', { x, y, width: w, height: h, rx: 8, fill, stroke: 'var(--border)' }));
      g.append(svg('text', { x: x + w / 2, y: y + (t2 ? h / 2 - 3 : h / 2 + 5), 'text-anchor': 'middle', 'font-size': FS, 'font-weight': 700, fill: 'var(--text)' }, t1));
      if (t2) g.append(svg('text', { x: x + w / 2, y: y + h / 2 + 15, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--text-3)' }, t2));
    }
    function draw() {
      if (my !== gen) return;
      const m = MSG[st.sit][st.aud];
      facts.innerHTML = '<b>Facts:</b> ' + SIT[st.sit].facts + ' · <b>Vocabulary for ' + AUD[st.aud] + ':</b> ' + VOC[st.aud];
      P.innerHTML = '';
      const g = svg('g'); P.append(g);
      if (narrow) {
        box(g, 40, 6, 280, 54, 'color-mix(in srgb, var(--accent) 22%, var(--surface-2))', m[0][0], '1 · Answer');
        m[1].forEach((s, i) => box(g, 10, 72 + i * 58, 340, 48, 'var(--surface-2)', s[0], 'Support ' + (i + 1)));
        box(g, 40, 248, 280, 46, 'color-mix(in srgb, var(--ok) 22%, var(--surface-2))', m[2][0], '3 · Ask');
      } else {
        box(g, 150, 8, 260, 56, 'color-mix(in srgb, var(--accent) 22%, var(--surface-2))', m[0][0], '1 · Answer (governing idea)');
        m[1].forEach((s, i) => { box(g, 10 + i * 184, 96, 172, 56, 'var(--surface-2)', s[0], 'Support ' + (i + 1)); g.append(svg('line', { x1: 280, y1: 64, x2: 96 + i * 184, y2: 96, stroke: 'var(--border)' })); });
        box(g, 150, 186, 260, 56, 'color-mix(in srgb, var(--ok) 22%, var(--surface-2))', m[2][0], '3 · The ask');
      }
      msg.innerHTML = '<p style="margin:8px 0"><b>' + m[0][1] + '</b></p><ol style="margin:0 0 6px 18px;padding:0">' + m[1].map((s) => '<li><b>' + s[0] + '.</b> ' + s[1] + '</li>').join('') + '</ol><p style="margin:4px 0"><b>Ask:</b> ' + m[2][1] + '</p>';
      say('Rewrote <b>' + SIT[st.sit].l + '</b> for <b>' + AUD[st.aud] + '</b>: same facts, ' + VOC[st.aud] + '.');
    }

    // power / interest grid
    const GW = narrow ? 360 : 520, GH = narrow ? 340 : 320, L = narrow ? 30 : 40, T = 10, PW = GW - L - 10, PH = GH - T - 34;
    const G = svg('svg', { viewBox: `0 0 ${GW} ${GH}`, role: 'img', 'aria-label': 'Power interest grid', style: (narrow ? '' : 'max-width:640px;display:block;margin:0 auto;') + 'touch-action:none' });
    const X = (i) => L + i * PW, Y = (p) => T + (1 - p) * PH;
    [['ks', 0, 1], ['mc', 1, 1], ['mo', 0, 0], ['ki', 1, 0]].forEach(([q, cx, cy]) => {
      G.append(svg('rect', { x: X(cx * 0.5), y: Y(cy ? 1 : 0.5), width: PW / 2, height: PH / 2, fill: q === 'mc' ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface-2)', stroke: 'var(--border)' }));
      G.append(svg('text', { x: X(cx * 0.5 + 0.25), y: Y(cy ? 0.56 : 0.06), 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--text-3)' }, QUAD[q].l));
    });
    G.append(svg('text', { x: L + PW / 2, y: GH - 8, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--text-3)' }, 'Interest →'));
    G.append(svg('text', { x: 14, y: T + PH / 2, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--text-3)', transform: `rotate(-90 14 ${T + PH / 2})` }, 'Power →'));
    const plan = el('div', { style: { fontSize: '14px', lineHeight: '1.45', marginTop: '6px' } });
    const dots = people.map((o) => {
      const g = svg('g', { style: 'cursor:grab' });
      const c = svg('circle', { r: narrow ? 16 : 14, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 });
      const t = svg('text', { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: 'var(--text)' }, o.id);
      g.append(c, t); G.append(g);
      const place = () => { const x = X(o.i), y = Y(o.p); c.setAttribute('cx', x); c.setAttribute('cy', y); t.setAttribute('x', x); t.setAttribute('y', y - (narrow ? 21 : 19)); };
      place();
      g.addEventListener('pointerdown', (e) => {
        g.setPointerCapture(e.pointerId); e.preventDefault();
        const mv = (ev) => {
          const r = G.getBoundingClientRect(), sx = GW / r.width;
          o.i = Math.max(0.03, Math.min(0.97, ((ev.clientX - r.left) * sx - L) / PW));
          o.p = Math.max(0.03, Math.min(0.97, 1 - ((ev.clientY - r.top) * sx - T) / PH));
          place(); showPlan();
        };
        const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); say('<b>' + o.id + '</b> is now <b>' + QUAD[quad(o)].l + '</b>: ' + QUAD[quad(o)].plan + '.'); };
        g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
      });
      return { o, c };
    });
    function showPlan() {
      dots.forEach(({ o, c }) => c.setAttribute('fill', { mc: 'var(--accent)', ks: 'var(--warn)', ki: 'var(--ok)', mo: 'var(--text-3)' }[quad(o)]));
      plan.innerHTML = '<b>Suggested communication plan</b><ul style="margin:4px 0 0 18px;padding:0">' + people.map((o) => {
        const q = quad(o), a = o.p >= 0.5 ? (o.i >= 0.5 ? 'options + recommendation' : 'business impact, BLUF') : (o.i >= 0.5 ? 'detail + timeline' : 'headline only');
        return '<li><b>' + o.id + '</b> · ' + QUAD[q].l + ': ' + QUAD[q].plan + ' <span class="muted">(framing: ' + a + ')</span></li>';
      }).join('') + '</ul>';
    }
    root.append(el('div', { style: { marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '10px' } },
      el('b', { text: 'Power / interest grid (Mendelow) · drag a stakeholder' }), el('div', { class: 'w-stage' }, G), plan));
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(log);
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 12) log.lastChild.remove(); }
    showPlan();
    draw();
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
