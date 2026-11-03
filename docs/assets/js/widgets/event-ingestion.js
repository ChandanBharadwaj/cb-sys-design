/* Schema evolution + validation router.
   Compatibility uses Avro's schema-resolution rules (match by name or reader alias, reader default fills a
   missing field, writer-only fields are skipped, int→long→float→double and string↔bytes promotion, every
   writer union branch must resolve). BACKWARD = new reads old, FORWARD = old reads new, FULL = both.
   Events from an old and a new app are validated against their writer schema (bad → ingest DLQ), then each
   sink decodes them with its own reader schema (cannot resolve → that sink's DLQ, replayable later). */
SD.widget('event-ingestion', function (root, ctx) {
  const { el, svg } = ctx;
  /*CORE*/
  const PROMO = { int: ['int', 'long', 'float', 'double'], long: ['long', 'float', 'double'], float: ['float', 'double'], double: ['double'], string: ['string', 'bytes'], bytes: ['bytes', 'string'], null: ['null'] };
  const br = (t) => (Array.isArray(t) ? t : [t]);
  const tname = (t) => br(t).join('|');
  const typeOk = (w, r) => br(w).every((wb) => br(r).some((rb) => (PROMO[wb] || [wb]).includes(rb)));
  function canRead(W, R) {                 // can a reader with schema R decode data written with W?
    for (const rf of R.fields) {
      const wf = W.fields.find((f) => f.name === rf.name || (rf.aliases || []).includes(f.name));
      if (!wf) { if (rf.def) continue; return { ok: false, why: `reader needs '${rf.name}', writer lacks it, no default` }; }
      if (!typeOk(wf.type, rf.type)) return { ok: false, why: `'${rf.name}': ${tname(wf.type)} can't be read as ${tname(rf.type)}` };
    }
    return { ok: true };
  }
  const BACK = (nw, old) => canRead(old, nw), FWD = (nw, old) => canRead(nw, old);
  function check(mode, nw, vers) {         // what a registry does on POST /subjects/{s}/versions
    if (mode === 'NONE') return { ok: true };
    const against = mode.endsWith('TRANSITIVE') ? vers : vers.slice(-1);
    for (let i = against.length - 1; i >= 0; i--) {
      const old = against[i], v = vers.indexOf(old) + 1;
      const b = mode.startsWith('FORWARD') ? { ok: true } : BACK(nw, old);
      if (!b.ok) return { ok: false, why: `not BACKWARD vs v${v}: ${b.why}` };
      const f = mode.startsWith('BACKWARD') ? { ok: true } : FWD(nw, old);
      if (!f.ok) return { ok: false, why: `not FORWARD vs v${v}: ${f.why}` };
    }
    return { ok: true };
  }
  function validate(ev, S) {               // JSON payload vs its writer schema, at the validator
    for (const f of S.fields) {
      const v = ev[f.name];
      if (v === undefined) { if (f.def) continue; return `missing required '${f.name}'`; }
      const ok = br(f.type).some((t) => (t === 'null' ? v === null : t === 'string' ? typeof v === 'string'
        : t === 'int' ? Number.isInteger(v) && Math.abs(v) < 2 ** 31 : t === 'long' ? Number.isInteger(v) : false));
      if (!ok) return `'${f.name}' = ${JSON.stringify(v)} is not ${tname(f.type)}`;
    }
    return null;
  }
  /*END CORE*/
  const fld = (name, type, def) => ({ name, type, def: !!def });
  const V1 = { fields: [fld('event_id', 'string'), fld('user_id', 'string'), fld('ts', 'long'), fld('page', 'string'), fld('duration_ms', 'int'), fld('referrer', ['null', 'string'], true)] };
  const clone = (s) => JSON.parse(JSON.stringify(s));
  const OPS = [
    ['+ optional', 'add a field with a default', (d) => { const n = ['campaign', 'coupon', 'theme'].find((x) => !has(d, x)); if (!n) return 0; d.fields.push(fld(n, ['null', 'string'], true)); return 'added ' + n; }],
    ['+ required', 'add a field with no default', (d) => { const n = ['country', 'plan', 'device'].find((x) => !has(d, x)); if (!n) return 0; d.fields.push(fld(n, 'string')); return 'added required ' + n; }],
    ['− optional', 'remove a field that has a default', (d) => { const i = lastIdx(d, (f) => f.def); if (i < 0) return 0; return 'removed ' + d.fields.splice(i, 1)[0].name; }],
    ['− required', 'remove a field with no default', (d) => { const i = lastIdx(d, (f) => !f.def && f.name !== 'event_id'); if (i < 0) return 0; return 'removed ' + d.fields.splice(i, 1)[0].name; }],
    ['rename', 'rename, old name kept as alias', (d) => { const m = { page: 'url', user_id: 'uid', ts: 'event_ts' }; const f = d.fields.find((x) => m[x.name]); if (!f) return 0; f.aliases = [f.name]; const o = f.name; f.name = m[o]; return `renamed ${o} → ${f.name} (alias ${o})`; }],
    ['int → long', 'widen a type', (d) => { const f = d.fields.find((x) => x.type === 'int'); if (!f) return 0; f.type = 'long'; return f.name + ': int → long'; }],
    ['make optional', 'string → null|string', (d) => { const f = d.fields.find((x) => x.type === 'string' && x.name !== 'event_id'); if (!f) return 0; f.type = ['null', 'string']; f.def = true; return f.name + ' is now optional'; }]
  ];
  function has(d, n) { return d.fields.some((f) => f.name === n); }
  function lastIdx(d, p) { for (let i = d.fields.length - 1; i >= 0; i--) if (p(d.fields[i])) return i; return -1; }

  // ---------- state (survives layout rebuilds) ----------
  let vers, draft, edits, mode = 'BACKWARD', whVer, cnt, whDLQ, seq;
  function resetAll() { vers = [clone(V1)]; draft = clone(V1); edits = []; whVer = 1; cnt = { ok: 0, bad: 0, topic: 0, whOk: 0, whBad: 0, seOk: 0, seBad: 0 }; whDLQ = []; seq = 0; }
  resetAll();
  const latest = () => vers[vers.length - 1];

  // ---------- controls ----------
  const opBtns = OPS.map(([l, hint, fn]) => el('button', { class: 'btn', text: l, title: hint, onclick: () => { const r = fn(draft); if (!r) { say(`Nothing to ${l} in the draft.`); return; } edits.push(r); say('Draft: ' + r + '.'); paintSchema(); } }));
  const undoBtn = el('button', { class: 'btn', text: '↺ Clear draft', onclick: () => { draft = clone(latest()); edits = []; paintSchema(); } });
  const modeSel = el('select', { 'aria-label': 'Compatibility mode' });
  ['BACKWARD', 'BACKWARD_TRANSITIVE', 'FORWARD', 'FORWARD_TRANSITIVE', 'FULL', 'FULL_TRANSITIVE', 'NONE'].forEach((m) => modeSel.append(el('option', { value: m, text: m })));
  modeSel.value = mode;
  modeSel.addEventListener('change', () => { mode = modeSel.value; stats(); });
  const regBtn = el('button', { class: 'btn primary', text: 'Register', onclick: register });
  const sendBtn = el('button', { class: 'btn primary', text: '▶ Send 12 events', onclick: () => send(12) });
  const upBtn = el('button', { class: 'btn', text: '⬆ Upgrade warehouse', onclick: () => { whVer = vers.length; say(`Warehouse loader redeployed with reader schema v${whVer}.`); draw(); stats(); } });
  const repBtn = el('button', { class: 'btn', text: '↻ Replay its DLQ', onclick: replay });
  const lab = (t) => el('span', { class: 'muted', style: { fontSize: '13px', fontWeight: 600 }, text: t });
  const schemaBox = el('div', { style: { flex: '1 1 220px', fontFamily: 'var(--mono)', fontSize: '13px', lineHeight: '1.55' } });
  const compatBox = el('div', { style: { flex: '1 1 220px', fontSize: '13px' } });
  root.append(
    el('div', { class: 'w-controls' }, lab('1 · Edit the schema:'), ...opBtns, undoBtn),
    el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px' } }, schemaBox, compatBox),
    el('div', { class: 'w-controls' }, lab('2 · Registry mode'), modeSel, regBtn),
    el('div', { class: 'w-controls' }, lab('3 · Run:'), sendBtn, upBtn, repBtn, el('button', { class: 'btn', text: 'Reset', onclick: () => { dots.length = 0; resetAll(); draw(); paintSchema(); say('Reset: only v1 is registered.'); } })));
  const stage = el('div', { class: 'w-stage' });
  const statEl = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
  root.append(stage, statEl, log);
  const say = (t) => { log.prepend(el('div', { html: t })); while (log.children.length > 40) log.lastChild.remove(); };
  const esc = (s) => String(s).replace(/</g, '&lt;');

  function paintSchema() {
    const L = latest(), rows = [];
    draft.fields.forEach((f) => {
      const o = L.fields.find((x) => x.name === f.name || (f.aliases || []).includes(x.name));
      const tag = !o ? ['+', 'var(--ok)'] : (o.name !== f.name || tname(o.type) !== tname(f.type) || o.def !== f.def) ? ['~', 'var(--warn)'] : [' ', 'var(--text-2)'];
      rows.push(`<div style="color:${tag[1]}">${tag[0]} ${f.name}: ${tname(f.type)}${f.def ? ' = null' : ''}</div>`);
    });
    L.fields.filter((x) => !draft.fields.some((f) => f.name === x.name || (f.aliases || []).includes(x.name))).forEach((x) => rows.push(`<div style="color:var(--err);text-decoration:line-through">− ${x.name}: ${tname(x.type)}</div>`));
    schemaBox.innerHTML = `<div style="font-family:var(--sans);font-weight:700;margin-bottom:4px">Draft v${vers.length + 1} vs v${vers.length}</div>` + rows.join('');
    if (!edits.length) { compatBox.innerHTML = '<b>No change yet.</b><br>Pick an edit above. Each one is checked with Avro\'s reader/writer rules.'; regBtn.disabled = true; return; }
    regBtn.disabled = false; regBtn.textContent = 'Register v' + (vers.length + 1);
    const cell = (r) => `<td style="padding:3px 8px;font-weight:700;color:${r.ok ? 'var(--ok)' : 'var(--err)'}">${r.ok ? '✓' : '✗'}</td>`;
    const all = (fn) => { for (let i = vers.length - 1; i >= 0; i--) { const r = fn(draft, vers[i]); if (!r.ok) return r; } return { ok: true }; };
    const full = (a, b) => (a.ok ? b : a);
    const bL = BACK(draft, L), fL = FWD(draft, L), bA = all(BACK), fA = all(FWD);
    const rowsT = [['BACKWARD', bL, bA], ['FORWARD', fL, fA], ['FULL', full(bL, fL), full(bA, fA)]];
    compatBox.innerHTML = `<table style="border-collapse:collapse;font-family:var(--mono)"><tr><th></th><th style="padding:3px 8px;font-weight:600">latest</th><th style="padding:3px 8px;font-weight:600">all</th></tr>` +
      rowsT.map(([k, a, b]) => `<tr><td style="padding:3px 8px 3px 0">${k}</td>${cell(a)}${cell(b)}</tr>`).join('') + '</table>' +
      [['new reads old', bL], ['old reads new', fL]].filter((x) => !x[1].ok).map(([k, r]) => `<div style="margin-top:4px"><b>${k}:</b> ${esc(r.why)}</div>`).join('');
  }
  function register() {
    const r = check(mode, draft, vers);
    if (!r.ok) { say(`<b style="color:var(--err)">409 Conflict</b> under ${mode}: ${esc(r.why)}.`); return; }
    vers.push(clone(draft)); edits = [];
    say(`<b style="color:var(--ok)">Registered v${vers.length}</b> (${mode}). New app now writes v${vers.length}; Search reads v${vers.length}; Warehouse still reads v${whVer}.`);
    paintSchema(); draw(); stats();
  }

  // ---------- pipeline drawing ----------
  const GEO = {
    narrow: { W: 360, H: 350, f: 15, s: 13.5, R: 6, box: { old: [12, 6, 160, 52], nw: [188, 6, 160, 52], val: [12, 92, 220, 58], dlq: [248, 92, 100, 58], top: [12, 184, 336, 50], wh: [12, 268, 160, 74], se: [188, 268, 160, 74] } },
    wide: { W: 640, H: 236, f: 14, s: 12.5, R: 5.5, box: { old: [8, 20, 140, 54], nw: [8, 150, 140, 54], val: [196, 60, 150, 62], dlq: [196, 162, 150, 54], top: [384, 72, 100, 50], wh: [512, 14, 124, 82], se: [512, 140, 124, 82] } }
  };
  let G, S_, gDots, txt = {};
  const C = (k) => { const b = G.box[k]; return [b[0] + b[2] / 2, b[1] + b[3] / 2]; };
  function path(a, b) {                     // polyline from box a to box b, centre to centre via an elbow
    const [x1, y1] = C(a), [x2, y2] = C(b);
    return G === GEO.narrow ? [[x1, y1], [x1, (y1 + y2) / 2], [x2, (y1 + y2) / 2], [x2, y2]] : [[x1, y1], [(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2], [x2, y2]];
  }
  function draw() {
    G = ctx.narrow ? GEO.narrow : GEO.wide;
    stage.innerHTML = '';
    S_ = svg('svg', { viewBox: `0 0 ${G.W} ${G.H}`, role: 'img', 'aria-label': 'Producers, validator, topic and two sinks', style: G === GEO.wide ? 'max-width:700px;margin:0 auto;display:block' : '' });
    const gE = svg('g'); gDots = svg('g'); const gB = svg('g');
    [['old', 'val'], ['nw', 'val'], ['val', 'dlq'], ['val', 'top'], ['top', 'wh'], ['top', 'se']].forEach(([a, b]) =>
      gE.append(svg('polyline', { points: path(a, b).map((p) => p.join(',')).join(' '), fill: 'none', stroke: 'var(--border)', 'stroke-width': 2 })));
    const T = (x, y, s, w, c) => { const t = svg('text', { x, y, 'text-anchor': 'middle', fill: c || 'var(--text)', style: `font:${w} ${s}px var(--sans)` }); gB.append(t); return t; };
    const box = (k, l1, tone) => {
      const [x, y, w, h] = G.box[k];
      gB.append(svg('rect', { x, y, width: w, height: h, rx: 9, fill: 'var(--surface)', stroke: tone || 'var(--border)', 'stroke-width': 1.6 }));
      const lines = h > 70 ? 3 : 2, top = y + h / 2 - (lines - 1) * G.s * 0.62;
      txt[k] = [T(x + w / 2, top + G.f * 0.35, G.f, 700), T(x + w / 2, top + G.s * 1.25 + G.f * 0.35, G.s, 500, 'var(--text-2)')];
      if (lines === 3) txt[k].push(T(x + w / 2, top + G.s * 2.5 + G.f * 0.35, G.s, 600, 'var(--text-2)'));
      txt[k][0].textContent = l1;
    };
    box('old', 'Old app', 'var(--text-3)'); box('nw', 'New app', 'var(--accent)'); box('val', 'Validator', 'var(--accent)');
    box('dlq', 'Ingest DLQ', 'var(--err)'); box('top', 'Kafka topic', 'var(--warn)'); box('wh', 'Warehouse'); box('se', 'Search');
    S_.append(gE, gDots, gB); stage.append(S_);   // dots run under the boxes, visible only on the wires
    paintCounts();
  }
  function paintCounts() {
    const set = (k, i, v) => { if (txt[k] && txt[k][i]) txt[k][i].textContent = v; };
    set('old', 1, 'writes v1'); set('nw', 1, 'writes v' + vers.length);
    set('val', 1, `✓ ${cnt.ok} · ✗ ${cnt.bad}`); set('dlq', 1, String(cnt.bad)); set('top', 1, cnt.topic + ' events');
    set('wh', 1, 'reads v' + whVer); set('wh', 2, `✓ ${cnt.whOk} · DLQ ${cnt.whBad}`);
    set('se', 1, 'reads v' + vers.length); set('se', 2, `✓ ${cnt.seOk} · DLQ ${cnt.seBad}`);
  }
  function stats() {
    statEl.innerHTML = '';
    [['versions', vers.length], ['mode', mode], ['ingest DLQ', cnt.bad], ['warehouse DLQ', cnt.whBad], ['search DLQ', cnt.seBad]].forEach(([k, v]) => statEl.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    paintCounts();
  }

  // ---------- events ----------
  const dots = [];
  let instant = false;
  function fly(a, b, color, cb) {
    if (ctx.reduced || instant) { cb(); return; }
    const pts = path(a, b), c = svg('circle', { r: G.R, fill: color, stroke: 'var(--surface)', 'stroke-width': 1.5 });
    gDots.append(c); dots.push({ pts, c, t: 0, cb });
  }
  ctx.loop((dt) => {
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i]; d.t = Math.min(1, d.t + dt / 700);
      const n = d.pts.length - 1, u = d.t * n, k = Math.min(n - 1, Math.floor(u)), f = u - k;
      const [x1, y1] = d.pts[k], [x2, y2] = d.pts[k + 1];
      d.c.setAttribute('cx', x1 + (x2 - x1) * f); d.c.setAttribute('cy', y1 + (y2 - y1) * f);
      if (d.t >= 1) { d.c.remove(); dots.splice(i, 1); d.cb(); }
    }
  });
  function makeEvent(S) {
    const ev = {};
    S.fields.forEach((f) => { const t = br(f.type); ev[f.name] = t.includes('null') && Math.random() < 0.4 ? null : f.name === 'event_id' ? 'e' + (++seq) : t.includes('long') ? 1730000000000 + seq : t.includes('int') ? 1200 + seq : 'x'; });
    if (Math.random() < 0.12) {            // buggy client: drop a required field or send a string number
      const req = S.fields.filter((f) => !f.def && f.name !== 'event_id'), num = S.fields.filter((f) => ['int', 'long'].includes(f.type));
      if (num.length && Math.random() < 0.5) ev[num[0].name] = '1.2s'; else if (req.length) delete ev[req[req.length - 1].name];
    }
    return ev;
  }
  function send(n) {
    for (let i = 0; i < n; i++) setTimeout(() => one(), ctx.reduced ? 0 : i * 160);
  }
  function one() {
    const fromOld = Math.random() < 0.5, wv = fromOld ? 1 : vers.length, W = vers[wv - 1], ev = makeEvent(W), id = ev.event_id;
    fly(fromOld ? 'old' : 'nw', 'val', fromOld ? 'var(--text-3)' : 'var(--accent)', () => {
      const err = validate(ev, W);
      if (err) { fly('val', 'dlq', 'var(--err)', () => { cnt.bad++; stats(); }); say(`${id} (v${wv}) ✗ ingest DLQ: ${esc(err)}`); return; }
      cnt.ok++; paintCounts();
      fly('val', 'top', 'var(--warn)', () => {
        cnt.topic++; paintCounts();
        const sinks = [['wh', 'Warehouse', vers[whVer - 1]], ['se', 'Search', latest()]];
        sinks.forEach(([k, name, R]) => fly('top', k, 'var(--ok)', () => {
          const r = canRead(W, R);
          if (r.ok) cnt[k + 'Ok']++; else { cnt[k + 'Bad']++; if (k === 'wh') whDLQ.push(wv); say(`${id} (v${wv}) → ${name} DLQ: ${esc(r.why)}`); }
          stats();
        }));
      });
    });
  }
  function replay() {
    if (!whDLQ.length) { say('Warehouse DLQ is empty.'); return; }
    const R = vers[whVer - 1], keep = whDLQ.filter((wv) => !canRead(vers[wv - 1], R).ok), fixed = whDLQ.length - keep.length;
    cnt.whOk += fixed; cnt.whBad -= fixed; whDLQ = keep;
    say(`Replayed warehouse DLQ with reader v${whVer}: <b>${fixed}</b> decoded, <b>${keep.length}</b> still failing.`);
    stats();
  }

  draw(); paintSchema(); stats();
  say('Try: “− required”, register under BACKWARD, send events. Search is fine; the old Warehouse reader breaks on new events. That is why BACKWARD means <b>upgrade consumers first</b>.');
  ctx.onResize(() => { instant = true; dots.splice(0).forEach((d) => d.cb()); instant = false; draw(); });
});
