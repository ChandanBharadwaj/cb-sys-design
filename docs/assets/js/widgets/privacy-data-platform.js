/* Real PII scan (regex + Luhn + name hints) → column-level tag propagation (worklist BFS) → tag/purpose policy
   evaluation with masks and row filters → erasure fan-out from tags, checked against the actual rows. */
SD.widget('privacy-data-platform', function (root, ctx) {
  const { el, svg } = ctx;
  const USERS = [
    { user_id: 'u17', email: 'asha.k@mail.in', phone: '+91 98201 44512', dob: '1991-04-02' },
    { user_id: 'u42', email: 'leo.m@post.de', phone: '+49 1512 3456789', dob: '1985-11-23' },
    { user_id: 'u63', email: 'kim.j@corp.kr', phone: '+82 10 2345 6789', dob: '2001-07-19' }];
  const ORDERS = [
    { user_id: 'u17', card_no: '4111 1111 1111 1111', tracking_no: '9400 1112 0255 6342', amount: 49.9, day: '03-11' },
    { user_id: 'u42', card_no: '5500 0000 0000 0004', tracking_no: '9400 2208 7716 0428', amount: 120, day: '03-11' },
    { user_id: 'u42', card_no: '5500 0000 0000 0004', tracking_no: '9400 1112 0255 6343', amount: 15.5, day: '04-11' },
    { user_id: 'u63', card_no: '4012 8888 8888 1881', tracking_no: '9400 2208 7716 0427', amount: 8, day: '04-11' }];
  const CONSENT = { u17: true, u42: true, u63: false }; // marketing consent gates crm_export
  const DS = [
    { id: 'users', k: 'table', g: [0, 0], src: 1, cols: ['user_id', 'email', 'phone', 'dob'] },
    { id: 'backups', k: 'backup', g: [1, 0], cols: ['user_rows', 'order_rows'] },
    { id: 'orders', k: 'table', g: [2, 0], src: 1, cols: ['user_id', 'card_no', 'tracking_no', 'amount', 'day'] },
    { id: 'support_idx', k: 'index', g: [0, 1], cols: ['user_id', 'email', 'phone'] },
    { id: 'user_orders', k: 'table', g: [1, 1], cols: ['user_id', 'email', 'card_tok', 'amount', 'day'] },
    { id: 'order_cache', k: 'cache', g: [2, 1], cols: ['user_id', 'tracking_no', 'amount'] },
    { id: 'daily_rev', k: 'dashboard', g: [0, 2], cols: ['day', 'revenue', 'buyers'] },
    { id: 'features', k: 'features', g: [1, 2], cols: ['user_key', 'spend', 'orders'] },
    { id: 'crm_export', k: 'export', g: [2, 2], cols: ['email', 'spend'] }];
  const E = [];  // column-level lineage: [src, dst, transform]
  const add = (s, d, t) => E.push([s, d, t]);
  ['user_id', 'email', 'phone', 'dob'].forEach((c) => add('users.' + c, 'backups.user_rows', 'copy'));
  ['user_id', 'card_no', 'tracking_no', 'amount', 'day'].forEach((c) => add('orders.' + c, 'backups.order_rows', 'copy'));
  ['user_id', 'email', 'phone'].forEach((c) => add('users.' + c, 'support_idx.' + c, 'identity'));
  ['user_id', 'tracking_no', 'amount'].forEach((c) => add('orders.' + c, 'order_cache.' + c, 'identity'));
  add('users.user_id', 'user_orders.user_id', 'join'); add('orders.user_id', 'user_orders.user_id', 'join');
  add('users.email', 'user_orders.email', 'identity'); add('orders.card_no', 'user_orders.card_tok', 'tokenize');
  add('orders.amount', 'user_orders.amount', 'identity'); add('orders.day', 'user_orders.day', 'identity');
  add('user_orders.day', 'daily_rev.day', 'group by'); add('user_orders.amount', 'daily_rev.revenue', 'agg');
  add('user_orders.user_id', 'daily_rev.buyers', 'agg'); add('user_orders.user_id', 'features.user_key', 'hash');
  add('user_orders.amount', 'features.spend', 'per-user sum'); add('user_orders.amount', 'features.orders', 'per-user count');
  add('user_orders.email', 'crm_export.email', 'identity'); add('features.spend', 'crm_export.spend', 'identity');
  const OUT = {}, IN = {}; E.forEach((e) => { (OUT[e[0]] ||= []).push(e); (IN[e[1]] ||= []).push(e); });
  const ACTION = { table: 'DELETE rows', backup: 'crypto-shred key', index: 'delete docs', cache: 'evict keys', dashboard: 'recompute aggregate', features: 'delete by user_key', export: 'delete + suppress + tell processor' };
  const ROLE_PURPOSES = { analyst: ['analytics'], support: ['support'], ml: ['training', 'analytics'], privacy: ['dsr'] };
  const POLICIES = [  // first match wins; tagged + no match → deny
    { id: 'P1', tag: 'PII', role: 'privacy', purpose: 'dsr', eff: 'clear' },
    { id: 'P2', tag: 'PII', role: 'support', purpose: 'support', eff: 'mask' },
    { id: 'P3', tag: 'PII', purpose: 'analytics', eff: 'mask' },
    { id: 'P4', tag: 'PSEUDO', purpose: 'support', eff: 'mask' },
    { id: 'P5', tag: 'PSEUDO', eff: 'clear' }];
  const fnv = (s) => { let h = 0x811c9dc5; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  const luhn = (d) => { let s = 0; [...d].reverse().forEach((c, i) => { let x = +c; if (i % 2) { x *= 2; if (x > 9) x -= 9; } s += x; }); return s % 10 === 0; };
  const rank = (t) => (t === 'PII' || t === 'REV' ? 2 : t === 'PSEUDO' ? 1 : 0);
  function materialize() {
    const em = {}; USERS.forEach((u) => { em[u.user_id] = u.email; });
    const uo = ORDERS.map((o) => ({ _uid: o.user_id, user_id: o.user_id, email: em[o.user_id], card_tok: 'tok_' + fnv(o.card_no).slice(0, 6), amount: o.amount, day: o.day }));
    const per = {}, days = {};
    uo.forEach((r) => {
      const p = per[r.user_id] ||= { _uid: r.user_id, user_key: 'k' + fnv('salt:' + r.user_id).slice(0, 6), spend: 0, orders: 0 };
      p.spend = +(p.spend + r.amount).toFixed(2); p.orders++;
      const d = days[r.day] ||= { day: r.day, revenue: 0, b: new Set() }; d.revenue = +(d.revenue + r.amount).toFixed(2); d.b.add(r.user_id);
    });
    const feats = Object.values(per); return {
      users: USERS.map((u) => ({ _uid: u.user_id, ...u })), orders: ORDERS.map((o) => ({ _uid: o.user_id, ...o })),
      backups: USERS.map((u) => ({ _uid: u.user_id, user_rows: [u.user_id, u.email, u.dob].join('|'), order_rows: '—' }))
        .concat(ORDERS.map((o) => ({ _uid: o.user_id, user_rows: '—', order_rows: [o.user_id, o.card_no, o.amount].join('|') }))),
      support_idx: USERS.map((u) => ({ _uid: u.user_id, user_id: u.user_id, email: u.email, phone: u.phone })),
      order_cache: ORDERS.map((o) => ({ _uid: o.user_id, user_id: o.user_id, tracking_no: o.tracking_no, amount: o.amount })),
      user_orders: uo, features: feats,
      daily_rev: Object.values(days).map((d) => ({ day: d.day, revenue: d.revenue, buyers: d.b.size })),
      crm_export: feats.filter((f) => CONSENT[f._uid]).map((f) => ({ _uid: f._uid, email: em[f._uid], spend: f.spend }))
    };
  }
  let data = materialize(), srcTags = {}, tags = {}, declass = true, busy = false, mark = {};
  // ---- controls ----
  const sel = (label, opts, v) => { const s = el('select', { 'aria-label': label }); opts.forEach(([val, t]) => s.append(el('option', { value: val, text: t }))); s.value = v; return s; };
  const scanBtn = el('button', { class: 'btn primary', text: '🔍 Scan sources' });
  const decBtn = el('button', { class: 'btn', text: 'Declassifiers: on' });
  const resetBtn = el('button', { class: 'btn', text: '↺ Reset' });
  const roleSel = sel('Role', [['analyst', 'Analyst'], ['support', 'Support agent'], ['ml', 'ML engineer'], ['privacy', 'Privacy officer']], 'analyst');
  const purpSel = sel('Purpose', [['analytics', 'analytics'], ['support', 'support'], ['training', 'model training'], ['dsr', 'DSR fulfilment']], 'analytics');
  const dsSel = sel('Dataset', DS.map((d) => [d.id, d.id]), 'user_orders');
  const runBtn = el('button', { class: 'btn primary', text: '▶ Run query' });
  const subjSel = sel('Subject', USERS.map((u) => [u.user_id, 'user ' + u.user_id]), 'u42');
  const eraseBtn = el('button', { class: 'btn', text: '🗑 Erase user' });
  root.append(el('div', { class: 'w-controls' }, scanBtn, decBtn, resetBtn),
    el('div', { class: 'w-controls' }, el('label', null, 'as ', roleSel), el('label', null, 'for ', purpSel), el('label', null, 'on ', dsSel), runBtn),
    el('div', { class: 'w-controls' }, subjSel, eraseBtn));
  const stage = el('div', { class: 'w-stage' });
  const legend = el('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' }, html: 'Rows: <b style="color:var(--err)">!</b> PII · <b style="color:var(--warn)">#</b> pseudonymous (hash/token) · <b style="color:var(--err)">?</b> PII pending review. Tap a source column to tag/untag it; tap any other column for its upstream lineage. Edges turn red/amber when they carry a tag.' });
  const result = el('div', { style: { overflowX: 'auto', marginTop: '8px' } });
  const stats = el('div', { class: 'w-stats' });
  const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stage, legend, result, stats, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ctx.reduced ? 0 : ms));
  // ---- drawing (two layouts) ----
  let R = {};
  function draw(narrow) {
    const W = narrow ? 360 : 600, BW = narrow ? 116 : 180, GX = narrow ? 4 : 24, HD = narrow ? 24 : 26, RH = narrow ? 21 : 22;
    const FT = narrow ? 14 : 15, FC = narrow ? 13.5 : 14, GAP = narrow ? 36 : 40;
    const x0 = (W - 3 * BW - 2 * GX) / 2;
    const rowH = [0, 1, 2].map((r) => Math.max(...DS.filter((d) => d.g[1] === r).map((d) => HD + d.cols.length * RH + 6)));
    const rowY = [4, 4 + rowH[0] + GAP, 4 + rowH[0] + rowH[1] + 2 * GAP];
    const H = rowY[2] + rowH[2] + 30;
    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Column-level lineage graph', style: { maxWidth: narrow ? '100%' : '640px', display: 'block', margin: '0 auto' } });
    const gE = svg('g'), gB = svg('g'); S.append(gE, gB);
    R = { box: {}, row: {}, sym: {}, edges: [] }; const pos = {};
    DS.forEach((d) => {
      const x = x0 + d.g[0] * (BW + GX), y = rowY[d.g[1]], h = HD + d.cols.length * RH + 4;
      pos[d.id] = { x, y, w: BW, h }; const g = svg('g');
      R.box[d.id] = svg('rect', { x, y, width: BW, height: h, rx: 7, fill: 'var(--surface)', stroke: 'var(--border)', 'stroke-width': 1.5 });
      g.append(R.box[d.id], svg('text', { x: x + 7, y: y + HD - 8, fill: 'var(--text)', style: `font:700 ${FT}px var(--mono)`, text: d.id }));
      d.cols.forEach((c, i) => {
        const key = d.id + '.' + c, ry = y + HD + i * RH;
        const rr = svg('rect', { x: x + 3, y: ry, width: BW - 6, height: RH - 2, rx: 4, fill: 'transparent', style: 'cursor:pointer' });
        const sym = svg('text', { x: x + BW - 9, y: ry + RH - 7, 'text-anchor': 'end', style: `font:800 ${FC}px var(--mono);pointer-events:none`, text: '' });
        R.row[key] = rr; R.sym[key] = sym;
        g.append(rr, svg('text', { x: x + 8, y: ry + RH - 7, fill: 'var(--text-2, var(--text))', style: `font:500 ${FC}px var(--mono);pointer-events:none`, text: c }), sym);
        rr.addEventListener('click', () => clickCol(d, key));
      });
      gB.append(g);
    });
    const pairs = {};
    E.forEach((e) => { const a = e[0].split('.')[0], b = e[1].split('.')[0]; (pairs[a + '>' + b] ||= []).push(e); });
    Object.entries(pairs).forEach(([k, es]) => {
      const [a, b] = k.split('>'), A = pos[a], B = pos[b]; let dPath;
      if (Math.abs(A.y - B.y) < 1) { const x1 = A.x + A.w / 2, y1 = A.y + A.h, x2 = B.x + B.w / 2, y2 = B.y + B.h, yl = Math.max(y1, y2) + 22; dPath = `M${x1},${y1} C${x1},${yl} ${x2},${yl} ${x2},${y2}`; }
      else { const x1 = A.x + A.w / 2, y1 = A.y + A.h, x2 = B.x + B.w / 2, y2 = B.y, my = (y1 + y2) / 2; dPath = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`; }
      const p = svg('path', { d: dPath, fill: 'none', stroke: 'var(--border)', 'stroke-width': 2 });
      gE.append(p); R.edges.push({ p, es });
    });
    stage.innerHTML = ''; stage.append(S); paint();
  }
  function paint() {
    Object.entries(R.row).forEach(([key, rr]) => {
      const t = tags[key];
      rr.setAttribute('fill', t === 'PII' ? 'color-mix(in srgb, var(--err) 22%, var(--surface))' : t === 'REV' ? 'color-mix(in srgb, var(--err) 11%, var(--surface))' : t === 'PSEUDO' ? 'color-mix(in srgb, var(--warn) 26%, var(--surface))' : 'transparent');
      R.sym[key].textContent = t === 'PII' ? '!' : t === 'REV' ? '?' : t === 'PSEUDO' ? '#' : '';
      R.sym[key].setAttribute('fill', t === 'PSEUDO' ? 'var(--warn)' : 'var(--err)');
    });
    R.edges.forEach(({ p, es }) => {
      const r = Math.max(0, ...es.filter((e) => tags[e[0]]).map((e) => rank(tags[e[1]])));
      p.setAttribute('stroke', r === 2 ? 'var(--err)' : r === 1 ? 'var(--warn)' : 'var(--border)');
      p.setAttribute('stroke-width', r ? 3 : 1.8);
    });
    DS.forEach((d) => {
      const m = mark[d.id];
      R.box[d.id].setAttribute('stroke', m === 'fan' ? 'var(--accent)' : m === 'miss' ? 'var(--err)' : 'var(--border)');
      R.box[d.id].setAttribute('stroke-width', m ? 3 : 1.5);
      R.box[d.id].setAttribute('stroke-dasharray', m === 'miss' ? '6 4' : '');
    });
    const vals = Object.values(tags);
    stats.innerHTML = '';
    [['tagged columns', vals.length], ['PII', vals.filter((t) => rank(t) === 2).length], ['pseudonymous', vals.filter((t) => t === 'PSEUDO').length],
      ['datasets with personal data', new Set(Object.keys(tags).map((k) => k.split('.')[0])).size + ' / ' + DS.length]]
      .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
  }
  // ---- 1. scan + propagate ----
  const NAME = [[/email/, 'EMAIL'], [/phone|mobile/, 'PHONE'], [/dob|birth/, 'DATE_OF_BIRTH'], [/card/, 'CARD'], [/^(user_id|uid)$/, 'PERSON_ID']];
  function detect(col, vals) {
    const n = vals.length, dig = vals.map((v) => v.replace(/[ -]/g, ''));
    const cardLike = dig.filter((d) => /^\d{13,19}$/.test(d)), cardOk = cardLike.filter(luhn);
    const tests = [['EMAIL', vals.filter((v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)).length / n], ['PHONE', vals.filter((v) => /^\+\d[\d ]{7,16}\d$/.test(v)).length / n],
      ['CARD', cardOk.length / n], ['DATE', vals.filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)).length / n]];
    const best = tests.sort((a, b) => b[1] - a[1])[0], hint = NAME.find(([re]) => re.test(col));
    let conf = best[1] > 0 ? 0.7 * best[1] + (hint ? 0.3 : best[0] === 'DATE' ? -0.4 : 0.15) : hint ? 0.55 : 0;
    conf = Math.max(0, Math.min(1, conf));
    const why = best[1] > 0 ? `${best[0]} on ${Math.round(best[1] * 100)}% of ${n} values${hint ? ' + name' : ''}` : hint ? 'column name only' : 'no detector matched';
    const note = cardLike.length && !cardOk.length ? ' (16 digits, but Luhn fails: not a card)' : '';
    return { conf, type: hint ? hint[1] : best[0], why: why + note, lvl: conf >= 0.85 ? 'VERY_LIKELY' : conf >= 0.5 ? 'POSSIBLE' : 'UNLIKELY' };
  }
  async function scan() {
    if (busy) return; busy = true;
    for (const d of DS.filter((x) => x.src)) {
      for (const c of d.cols) {
        const vals = data[d.id].map((r) => String(r[c]));
        if (!vals.length) { say(`${d.id}.${c}: no rows left to sample`); continue; }
        const r = detect(c, vals), key = d.id + '.' + c;
        srcTags[key] = r.lvl === 'VERY_LIKELY' ? 'PII' : r.lvl === 'POSSIBLE' ? 'REV' : null;
        say(`<b>${key}</b>: ${r.why} → ${r.conf.toFixed(2)} <b>${r.lvl}</b>${r.lvl === 'VERY_LIKELY' ? ' → tag PII' : r.lvl === 'POSSIBLE' ? ' → review queue (treated as PII)' : ''}`);
      }
    }
    busy = false; await propagate(true);
  }
  function apply(t, tag) {
    const base = tag === 'REV' ? 'PII' : tag;
    if (!declass) return base;
    if ((t === 'hash' || t === 'tokenize') && base === 'PII') return 'PSEUDO';
    return t === 'agg' ? null : base;
  }
  async function propagate(animate) {
    busy = true; mark = {}; tags = {};
    Object.entries(srcTags).forEach(([c, t]) => { if (t) tags[c] = t; });
    const final = Object.assign({}, tags), levels = [];
    let frontier = Object.keys(final);
    while (frontier.length) {  // worklist BFS; tags only rise, so it terminates
      const next = [], lvl = [];
      frontier.forEach((c) => (OUT[c] || []).forEach((e) => {
        const t = apply(e[2], final[c]);
        if (rank(t) > rank(final[e[1]]) || (t === 'PII' && final[e[1]] === 'REV')) { final[e[1]] = t; next.push(e[1]); lvl.push([e[1], t]); }
      }));
      if (lvl.length) levels.push(lvl);
      frontier = next;
    }
    paint();
    for (const lvl of levels) { if (animate) await sleep(380); lvl.forEach(([c, t]) => { tags[c] = t; }); paint(); }
    tags = final; paint();
    const n = Object.keys(final).length - Object.keys(srcTags).filter((k) => srcTags[k]).length;
    say(`Propagated along ${levels.length} lineage hop(s): <b>${n}</b> derived columns inherited a tag${declass ? ' (hash/token → pseudonymous, group aggregates declassified)' : ' (no declassifiers: every derived column keeps PII)'}.`);
    busy = false;
  }
  function clickCol(d, key) {
    if (busy) return;
    if (d.src) { srcTags[key] = srcTags[key] === 'PII' ? null : 'PII'; say(`${srcTags[key] ? 'Tagged' : 'Untagged'} <b>${key}</b> by hand.`); propagate(false); return; }
    const seen = new Set(), out = [], q = [key];
    while (q.length) { const c = q.shift(); (IN[c] || []).forEach((e) => { if (!seen.has(e[0])) { seen.add(e[0]); out.push(`${e[0]} <i>(${e[2]})</i>`); q.push(e[0]); } }); }
    say(`<b>${key}</b> [${tags[key] || 'untagged'}] is built from: ${out.join(', ')}`);
  }
  // ---- 2. policy evaluation ----
  const maskFn = (c, v) => {
    v = String(v);
    if (/email/.test(c)) return v[0] + '***@' + v.split('@')[1];
    if (/phone|card|tok/.test(c)) return '•••• ' + v.replace(/\s/g, '').slice(-4);
    if (/dob/.test(c)) return v.slice(0, 4) + '-**-**';
    if (/user_id|user_key/.test(c)) return v.slice(0, 2) + '***';
    return '••••';
  };
  function runQuery() {
    const role = roleSel.value, purpose = purpSel.value, ds = DS.find((d) => d.id === dsSel.value);
    result.innerHTML = '';
    if (!ROLE_PURPOSES[role].includes(purpose)) { say(`❌ <b>Denied</b>: purpose "${purpose}" is not granted to role ${role} (allowed: ${ROLE_PURPOSES[role].join(', ')}).`); return; }
    const dec = ds.cols.map((c) => {
      const t = tags[ds.id + '.' + c], tg = rank(t) === 2 ? 'PII' : t;
      if (!tg) return { c, eff: 'clear', why: 'untagged' };
      const p = POLICIES.find((x) => x.tag === tg && (!x.role || x.role === role) && (!x.purpose || x.purpose === purpose));
      return p ? { c, eff: p.eff, why: p.id } : { c, eff: 'deny', why: 'default deny' };
    });
    let rows = data[ds.id], filt = '';
    if (purpose === 'support' || purpose === 'dsr') {
      const who = purpose === 'support' ? 'u42' /* open ticket */ : subjSel.value;
      rows = rows.filter((r) => r._uid === who); filt = ` · row filter: subject = ${who}` + (data[ds.id].length && !('_uid' in data[ds.id][0]) ? ' (no subject key → 0 rows)' : '');
    }
    const col = { clear: 'var(--ok)', mask: 'var(--warn)', deny: 'var(--err)' };
    const th = dec.map((d) => el('th', { style: { padding: '4px 6px', textAlign: 'left', borderBottom: '2px solid ' + col[d.eff], whiteSpace: 'nowrap' }, html: `${d.c}<br><span style="font-weight:500;color:${col[d.eff]}">${d.eff}</span>` }));
    const trs = rows.slice(0, 3).map((r) => el('tr', null, ...dec.map((d) => el('td', { style: { padding: '4px 6px', wordBreak: 'break-all', color: d.eff === 'deny' ? 'var(--text-3)' : 'var(--text)' }, text: d.eff === 'deny' ? '—' : d.eff === 'mask' ? maskFn(d.c, r[d.c]) : String(r[d.c]) }))));
    result.append(el('table', { style: { borderCollapse: 'collapse', font: '500 13px var(--mono)', width: '100%' } }, el('tr', null, ...th), ...trs));
    if (!trs.length) result.append(el('p', { class: 'muted', style: { fontSize: '13px', margin: '4px 0' }, text: '0 rows returned.' }));
    say(`▶ <b>${role}</b> / ${purpose} on <b>${ds.id}</b>: ` + dec.map((d) => `${d.c}=${d.eff} (${d.why})`).join(', ') + filt + '. Logged to audit.');
  }
  // ---- 3. erasure fan-out ----
  function erase() {
    if (busy) return;
    const s = subjSel.value;
    const fan = DS.filter((d) => d.cols.some((c) => tags[d.id + '.' + c]));
    const holds = DS.filter((d) => data[d.id].some((r) => r._uid === s));
    mark = {};
    if (!fan.length) say('No tagged columns, so lineage finds <b>nothing</b> to erase. Scan or tag first.');
    fan.forEach((d, i) => {
      const n = data[d.id].filter((r) => r._uid === s).length;
      mark[d.id] = 'fan';
      say(`${i + 1}. <b>${d.id}</b> → ${ACTION[d.k]}${d.k === 'features' && n ? ` (key ${data.features.find((r) => r._uid === s).user_key})` : ''}: ${d.k === 'dashboard' ? 'no per-user rows' : n + ' row(s)'}`);
      data[d.id] = data[d.id].filter((r) => r._uid !== s);
    });
    const missed = holds.filter((d) => !fan.includes(d));
    missed.forEach((d) => { mark[d.id] = 'miss'; say(`⚠ <b>${d.id}</b> still holds ${s}: its columns are untagged, so lineage never reached it.`); });
    say(`🗑 Erasure of <b>${s}</b>: ${fan.length} dataset(s) from lineage, ${missed.length ? '<b>' + missed.length + ' missed</b>' : 'none missed'}. Verify: ${missed.length ? 'FAILED' : DS.every((d) => !data[d.id].some((r) => r._uid === s)) ? 'zero rows left ✅' : 'rows remain'}.`);
    paint();
  }
  scanBtn.onclick = scan;
  decBtn.onclick = () => { if (busy) return; declass = !declass; decBtn.textContent = 'Declassifiers: ' + (declass ? 'on' : 'off'); propagate(true); };
  resetBtn.onclick = () => { if (busy) return; data = materialize(); srcTags = {}; tags = {}; mark = {}; result.innerHTML = ''; paint(); say('Reset: data restored, all tags cleared.'); };
  runBtn.onclick = runQuery;
  eraseBtn.onclick = erase;
  draw(ctx.narrow);
  ctx.onResize(draw);
  say('Start with <b>🔍 Scan sources</b>. Nothing is tagged yet, so every query returns raw values and an erasure finds nothing.');
});
