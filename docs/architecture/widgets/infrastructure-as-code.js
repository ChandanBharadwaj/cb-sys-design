/* Plan/apply simulator: code vs state vs cloud, console drift, plan diff, revert/codify, state lock race, in-place vs immutable update. */
SD.widget('infrastructure-as-code', function (root, ctx) {
  const { el, svg } = ctx;
  const BASE = [
    { id: 'sg', addr: 'aws_security_group.web', short: 'sg.web', key: 'ssh from', v: '10.0.0.0/8', bad: '0.0.0.0/0', mode: 'update' },
    { id: 's3', addr: 'aws_s3_bucket_public_access_block.logs', short: 's3.logs', key: 'public', v: 'blocked', bad: 'ALLOWED', mode: 'update' },
    { id: 'ec2', addr: 'aws_instance.web', short: 'ec2.web', key: 'type', v: 't3.small', bad: 't3.xlarge', mode: 'type' },
    { id: 'db', addr: 'aws_db_instance.main', short: 'rds.main', key: 'multi_az', v: 'true', bad: 'false', mode: 'update' }
  ];
  let gen = 0, timers = [];
  const st = { rows: [], serial: 12, lock: null, locking: true, immutable: false, lastExit: '–', downtime: '–', planned: null };

  function reset() {
    st.rows = BASE.map((r) => ({ ...r, code: r.v, state: r.v, cloud: r.v }));
    st.serial = 12; st.lock = null; st.lastExit = '–'; st.downtime = '–'; st.planned = null;
  }

  function build(narrow) {
    const my = ++gen;
    timers.forEach(clearTimeout); timers = [];
    root.innerHTML = '';
    if (!st.rows.length) reset();
    const W = narrow ? 360 : 640, F = narrow ? 14 : 15, F2 = 13;
    const NX = 4, C0 = narrow ? 96 : 220, CW = narrow ? 87 : 138, RH = narrow ? 50 : 44, TOP = 58;
    const cols = ['code', 'state', 'cloud'], heads = ['Code (Git)', 'State', 'Cloud'];

    const bClick = el('button', { class: 'btn', text: '🖱 Console click' });
    const bPlan = el('button', { class: 'btn primary', text: '▶ terraform plan' });
    const bRevert = el('button', { class: 'btn', text: '⟲ Apply (revert)' });
    const bCodify = el('button', { class: 'btn', text: '✎ Codify in PR' });
    const bEdit = el('button', { class: 'btn', text: '✍ PR: resize ec2' });
    const bMode = el('button', { class: 'btn', text: '' });
    const bRace = el('button', { class: 'btn', text: '👥 Alice + Bob apply' });
    const bLock = el('button', { class: 'btn', text: '' });
    const bReset = el('button', { class: 'btn', text: 'Reset' });
    root.append(el('div', { class: 'w-controls' }, bClick, bPlan, bRevert, bCodify, bEdit, bMode, bRace, bLock, bReset));

    const stage = el('div', { class: 'w-stage' });
    const H = TOP + RH * 5 + 10;
    const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Code, state and cloud for each resource' });
    stage.append(S_); root.append(stage);
    const planBox = el('pre', { class: 'w-log', style: { fontFamily: 'var(--mono)', fontSize: '13px', whiteSpace: 'pre-wrap', margin: '8px 0 0', minHeight: '3em' } });
    const stats = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(planBox, stats, log);

    const T = (x, y, txt, o) => svg('text', { x, y, 'text-anchor': (o && o.a) || 'start', fill: (o && o.fill) || 'var(--text)', style: `font:${(o && o.w) || 600} ${(o && o.f) || F}px var(${o && o.mono ? '--mono' : '--sans'})`, text: txt });
    const lockT = T(W - 6, 20, '', { a: 'end', f: F2, w: 700 });
    S_.append(T(NX, 20, narrow ? 'resource' : 'resource · attribute', { f: F2, fill: 'var(--text-3)' }), lockT);
    heads.forEach((h, j) => S_.append(T(C0 + j * CW + CW / 2, 46, h, { a: 'middle', f: F2, w: 700, fill: 'var(--text-3)' })));
    const cells = [];
    for (let i = 0; i < 5; i++) {
      const y = TOP + i * RH;
      const name = T(NX, y + (narrow ? 20 : RH / 2 + 2), '', { mono: true, w: 700, f: narrow ? F2 : F });
      const key = T(NX, y + (narrow ? 38 : RH / 2 + 18), '', { f: F2, fill: 'var(--text-3)' });
      const boxes = cols.map((c, j) => {
        const r = svg('rect', { x: C0 + j * CW + 3, y: y + 5, width: CW - 6, height: RH - 10, rx: 6, fill: 'var(--surface-2)', stroke: 'var(--border)' });
        const t = T(C0 + j * CW + CW / 2, y + RH / 2 + 5, '', { a: 'middle', mono: true, f: F2, w: 700 });
        S_.append(r, t); return { r, t };
      });
      S_.append(name, key);
      cells.push({ name, key, boxes });
    }

    function paint() {
      cells.forEach((c, i) => {
        const r = st.rows[i];
        c.name.textContent = r ? (narrow ? r.short : r.addr.replace('aws_', '').replace('_public_access_block', '_pab')) : '';
        c.key.textContent = r ? (r.untracked ? 'created in console' : r.key) : '';
        c.boxes.forEach((b, j) => {
          const v = r ? r[cols[j]] : null;
          b.r.setAttribute('opacity', r ? 1 : 0);
          b.t.textContent = r ? (v === null ? '—' : v) : '';
          const drift = r && v !== null && j === 2 && r.cloud !== r.code;
          const stale = r && j === 1 && r.state !== r.cloud;
          b.r.setAttribute('stroke', drift ? 'var(--err)' : stale ? 'var(--warn)' : 'var(--border)');
          b.r.setAttribute('stroke-width', drift || stale ? 2.5 : 1);
          b.t.setAttribute('fill', drift ? 'var(--err)' : v === null ? 'var(--text-3)' : 'var(--text)');
        });
      });
      lockT.textContent = st.lock ? '🔒 ' + st.lock : (st.locking ? 'lock: free' : 'locking OFF');
      lockT.setAttribute('fill', st.lock ? 'var(--warn)' : st.locking ? 'var(--ok)' : 'var(--err)');
      bMode.textContent = st.immutable ? '♻ Updates: immutable' : '🔧 Updates: in-place';
      bLock.textContent = st.locking ? '🔒 Locking: on' : '🔓 Locking: off';
      const drifted = st.rows.filter((r) => !r.untracked && r.cloud !== r.code).length;
      const unmanaged = st.rows.filter((r) => r.untracked && r.code === null).length;
      stats.innerHTML = '';
      [['drifted resources', drifted], ['unmanaged (invisible to plan)', unmanaged], ['last plan exit code', st.lastExit], ['state serial', st.serial], ['downtime of last ec2 change', st.downtime]]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
    }
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 25) log.lastChild.remove(); }
    const later = (ms, f) => timers.push(setTimeout(() => { if (my === gen) f(); }, ctx.reduced ? 0 : ms));

    function plan() {
      // refresh: state learns what the cloud really has (managed resources only)
      const lines = [];
      st.rows.forEach((r) => {
        if (r.untracked && r.code === null) return;
        r.state = r.cloud;
        if (r.cloud === r.code) return;
        if (r.mode === 'type' && st.immutable) lines.push(`-/+ ${r.addr} (replace: new instance from image)\n      ${r.key}: "${r.cloud}" → "${r.code}"`);
        else lines.push(`  ~ ${r.addr} (update in-place)\n      ${r.key}: "${r.cloud}" → "${r.code}"`);
      });
      const n = lines.length;
      st.lastExit = n ? '2 (changes)' : '0 (clean)';
      st.planned = n ? lines : null;
      planBox.textContent = n ? lines.join('\n') + `\n\nPlan: 0 to add, ${lines.filter((l) => l.startsWith('  ~')).length} to change, 0 to destroy` + (lines.some((l) => l.startsWith('-/+')) ? ' (+1 replace)' : '') + '.\nexit code 2'
        : 'No changes. Your infrastructure matches the configuration.\nexit code 0';
      const hidden = st.rows.filter((r) => r.untracked && r.code === null);
      if (hidden.length) say(`⚠ Plan is clean about <b>${hidden.map((r) => r.short).join(', ')}</b> because it is not in state at all. Only an <code>import</code> block (Codify) brings it under management.`);
      say(n ? `Plan found <b>${n}</b> difference(s). Refresh updated the state column to reality; apply would change the cloud back to the code.` : 'Plan: no changes (exit 0).');
      paint();
    }

    bClick.onclick = () => {
      const managed = st.rows.filter((r) => !r.untracked && r.cloud === r.code);
      const room = st.rows.length < 5 && !st.rows.some((r) => r.id === 'dbg');
      if (room && (!managed.length || Math.random() < 0.25)) {
        st.rows.push({ id: 'dbg', addr: 'aws_security_group.debug', short: 'sg.debug', key: 'created in console', untracked: true, code: null, state: null, cloud: '22 open', mode: 'update' });
        say('🖱 Someone created <b>sg.debug</b> in the console. It is in the cloud only: no code, no state.'); paint(); return;
      }
      if (!managed.length) { say('Everything is already drifted. Run plan.'); return; }
      const r = managed[Math.floor(Math.random() * managed.length)];
      r.cloud = r.bad;
      say(`🖱 Console click: <b>${r.short}</b> ${r.key} set to <b>${r.bad}</b>. The state file still says ${r.state}: nobody told Terraform.`);
      paint();
    };
    bPlan.onclick = plan;
    bRevert.onclick = () => {
      if (!st.planned) { say('Run <b>plan</b> first: apply executes the reviewed plan, nothing else.'); return; }
      if (st.locking && st.lock) { say('State is locked by ' + st.lock + '. Wait.'); return; }
      const ec2 = st.rows.find((r) => r.id === 'ec2' && r.cloud !== r.code);
      st.lock = st.locking ? 'ci (apply)' : null; paint();
      later(700, () => {
        st.rows.forEach((r) => { if (!(r.untracked && r.code === null)) { r.cloud = r.code; r.state = r.code; } });
        if (ec2) st.downtime = st.immutable ? '0 s (new up, then old destroyed)' : '≈ 60 s (stop → resize → start)';
        st.serial++; st.lock = null; st.planned = null; st.lastExit = '–';
        planBox.textContent = 'Apply complete. State serial ' + st.serial + '.';
        say(ec2 ? (st.immutable ? '♻ ec2 <b>replaced</b>: create_before_destroy started a new instance from the image, waited for health, then destroyed the old one.' : '🔧 ec2 resized <b>in place</b>: the instance was stopped, changed and restarted. Same box, now with history.') : '⟲ Applied: reality reverted to the code.');
        paint();
      });
    };
    bCodify.onclick = () => {
      let n = 0;
      st.rows.forEach((r) => {
        if (r.untracked && r.code === null) { r.code = r.cloud; r.state = r.cloud; r.key = 'imported'; n++; say(`✎ Added <code>import { to = ${r.addr} }</code> and generated config. Now managed; serial +1.`); st.serial++; }
        else if (r.cloud !== r.code) { r.code = r.cloud; r.state = r.cloud; n++; }
      });
      st.planned = null;
      if (!n) { say('Nothing to codify: code already matches the cloud.'); return; }
      say(`✎ PR merged: code now matches reality for ${n} resource(s). Use this only when the console change was <b>wanted</b>.`);
      planBox.textContent = 'Code updated. Run plan: it should be clean.'; paint();
    };
    bEdit.onclick = () => {
      const r = st.rows.find((x) => x.id === 'ec2');
      r.code = r.code === 't3.small' ? 't3.medium' : 't3.small';
      say(`✍ PR changes ec2 type in code to <b>${r.code}</b>. Plan will show ${st.immutable ? '<b>-/+ replace</b>' : '<b>~ update in-place</b>'}.`); st.planned = null; paint();
    };
    bMode.onclick = () => { st.immutable = !st.immutable; st.planned = null; say(st.immutable ? '♻ Immutable: compute changes become replacements from a new image (create_before_destroy).' : '🔧 In-place: compute changes patch the existing instance.'); paint(); };
    bLock.onclick = () => { st.locking = !st.locking; paint(); };
    bReset.onclick = () => { reset(); planBox.textContent = ''; log.innerHTML = ''; paint(); };
    bRace.onclick = () => {
      if (st.lock) return;
      const s0 = st.serial;
      say(`👥 Alice (adds a subnet) and Bob (changes a tag) both run apply. Both read state <b>serial ${s0}</b>.`);
      if (st.locking) {
        st.lock = 'alice'; paint();
        later(500, () => say(`❌ Bob: <code>Error acquiring the state lock</code>. Lock Info: ID 9f2c…, Who alice@laptop, Operation OperationTypeApply. Bob waits.`));
        later(1500, () => { st.serial = s0 + 1; st.lock = 'bob'; say(`✅ Alice done (serial ${s0 + 1}), lock released. Bob re-plans against the new state and applies.`); paint(); });
        later(2500, () => { st.serial = s0 + 2; st.lock = null; say(`✅ Bob done (serial ${s0 + 2}). Both changes are in state.`); paint(); });
      } else {
        later(900, () => {
          st.serial = s0 + 1;
          if (st.rows.length < 5) st.rows.push({ id: 'subnet', addr: 'aws_subnet.alice', short: 'subnet.c', key: 'orphaned', untracked: true, code: null, state: null, cloud: '10.0.9.0/24', v: '', mode: 'update' });
          say(`💥 Both wrote serial ${s0 + 1}. Bob wrote last and <b>overwrote</b> Alice\'s state: her subnet exists in the cloud but in no state (an orphan). Codify it with an import block.`);
          paint();
        });
      }
    };

    paint();
    if (!log.children.length) say('Try: 🖱 console click → ▶ plan (exit 2) → ⟲ revert or ✎ codify. Then 👥 race with locking off.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
