/* GitOps reconciler: Git desired state vs live state for 3 envs × 5 fields; drift, self-heal, promote by PR, git revert. */
SD.widget('gitops', function (root, ctx) {
  const { el, svg } = ctx;
  const ENVS = ['dev', 'staging', 'prod'];
  const FIELDS = [
    { k: 'image', kind: 'Deployment' }, { k: 'replicas', kind: 'Deployment' }, { k: 'LOG_LEVEL', kind: 'ConfigMap' },
    { k: 'port', kind: 'Service' }, { k: 'maxPods', kind: 'HPA' }
  ];
  const DRIFT = { image: 'hotfix', replicas: '8', LOG_LEVEL: 'debug', port: '9090', maxPods: '50' };
  const BASE = { dev: { replicas: '1', LOG_LEVEL: 'debug', port: '8080', maxPods: '3' }, staging: { replicas: '2', LOG_LEVEL: 'info', port: '8080', maxPods: '6' }, prod: { replicas: '3', LOG_LEVEL: 'info', port: '8080', maxPods: '30' } };
  const SYNC_MS = 6000; // simulated "3 min" interval
  let shaN = 0x3a1;
  const sha = () => (shaN = (shaN * 7 + 0x51) % 0xfff).toString(16).padStart(3, '0');
  const st = { sel: 0, heal: true, ver: 4, pr: null, next: SYNC_MS, envs: {} };
  ENVS.forEach((e) => {
    const vals = Object.assign({ image: '1.7.' + (e === 'dev' ? 4 : 4) }, BASE[e]);
    st.envs[e] = { commits: [{ sha: sha(), msg: 'initial', vals }], live: Object.assign({}, vals), synced: null, flash: {} };
    st.envs[e].synced = st.envs[e].commits[0].sha;
  });
  const head = (e) => st.envs[e].commits[st.envs[e].commits.length - 1];
  const commit = (e, msg, patch) => { const vals = Object.assign({}, head(e).vals, patch); st.envs[e].commits.push({ sha: sha(), msg, vals }); };

  let gen = 0, timer = null;
  function build(narrow) {
    const my = ++gen; clearInterval(timer); root.innerHTML = '';
    const W = narrow ? 360 : 640, F = narrow ? 14 : 14, F2 = 13;
    const PH = 58, TOP = PH + 26, RH = narrow ? 46 : 38, H = TOP + RH * 5 + 30;
    const C = narrow ? { name: 6, git: 140, live: 232, st: 352 } : { name: 10, git: 250, live: 400, st: 628 };

    const bEdit = el('button', { class: 'btn', text: '✋ kubectl edit' });
    const bCommit = el('button', { class: 'btn primary', text: '⬆ Commit to dev' });
    const bProm = el('button', { class: 'btn', text: '⇢ Open PR: promote' });
    const bMerge = el('button', { class: 'btn primary', text: '✓ Merge PR' });
    const bRevert = el('button', { class: 'btn', text: '↶ git revert' });
    const bSync = el('button', { class: 'btn', text: '⟳ Sync now' });
    const bHeal = el('button', { class: 'btn', text: '' });
    root.append(el('div', { class: 'w-controls' }, bEdit, bCommit, bProm, bMerge, bRevert, bSync, bHeal));

    const stage = el('div', { class: 'w-stage' });
    const S_ = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Desired vs live state' });
    stage.append(S_); root.append(stage);
    const stats = el('div', { class: 'w-stats' });
    const log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);
    const T = (x, y, txt, o) => svg('text', { x, y, text: txt, fill: (o && o.fill) || 'var(--text)', 'text-anchor': (o && o.a) || 'start', style: `font:${(o && o.w) || 600} ${(o && o.f) || F}px var(${o && o.mono ? '--mono' : '--sans'})` });

    // env pills (click to select)
    const pw = (W - 8 * 4) / 3;
    const pills = ENVS.map((e, i) => {
      const x = 8 + i * (pw + 8);
      const g = svg('g', { style: 'cursor:pointer' });
      const r = svg('rect', { x, y: 4, width: pw, height: PH - 8, rx: 10, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 1.5 });
      const t1 = T(x + pw / 2, 24, e, { a: 'middle', w: 700 });
      const t2 = T(x + pw / 2, 43, '', { a: 'middle', f: F2, mono: true });
      g.append(r, t1, t2); g.addEventListener('click', () => { st.sel = i; paint(); });
      S_.append(g); return { r, t2 };
    });
    S_.append(T(C.name, TOP - 6, 'field', { f: F2, fill: 'var(--text-3)' }), T(C.git, TOP - 6, 'Git', { f: F2, fill: 'var(--text-3)' }), T(C.live, TOP - 6, 'Live', { f: F2, fill: 'var(--text-3)' }), T(C.st, TOP - 6, 'sync', { f: F2, fill: 'var(--text-3)', a: 'end' }));
    const rows = FIELDS.map((f, i) => {
      const y = TOP + i * RH;
      const bg = svg('rect', { x: 2, y: y + 2, width: W - 4, height: RH - 4, rx: 6, fill: 'transparent' });
      const n = T(C.name, narrow ? y + 20 : y + RH / 2 + 5, f.k, { mono: true, w: 700 });
      const kd = narrow ? T(C.name, y + 38, f.kind, { f: F2, fill: 'var(--text-3)' }) : T(C.name + 120, y + RH / 2 + 5, f.kind, { f: F2, fill: 'var(--text-3)' });
      const ty = narrow ? y + 28 : y + RH / 2 + 5;
      const g = T(C.git, ty, '', { mono: true }), l = T(C.live, ty, '', { mono: true }), s = T(C.st, ty, '', { a: 'end', w: 800, f: 16 });
      S_.append(bg, n, kd, g, l, s);
      return { bg, g, l, s };
    });
    const barBg = svg('rect', { x: 8, y: H - 18, width: W - 16, height: 8, rx: 4, fill: 'var(--surface-2)' });
    const bar = svg('rect', { x: 8, y: H - 18, width: 0, height: 8, rx: 4, fill: 'var(--accent)' });
    S_.append(barBg, bar);

    const env = () => ENVS[st.sel];
    function say(t) { if (my !== gen) return; log.prepend(el('div', { html: t })); while (log.children.length > 30) log.lastChild.remove(); }
    const diffs = (e) => FIELDS.filter((f) => head(e).vals[f.k] !== st.envs[e].live[f.k]).map((f) => f.k);

    function reconcile(manual) {
      ENVS.forEach((e) => {
        const E = st.envs[e], h = head(e), d = diffs(e);
        const newCommit = h.sha !== E.synced;
        if (newCommit || (d.length && (st.heal || manual))) {
          d.forEach((k) => { E.flash[k] = 1; });
          E.live = Object.assign({}, h.vals); E.synced = h.sha;
          if (newCommit) say(`⟳ <b>${e}</b>: new commit <code>${h.sha}</code> (${h.msg}) applied → Synced.`);
          else say(`🩹 <b>${e}</b>: drift on <code>${d.join(', ')}</code> ${manual ? 'overwritten by manual sync' : '<b>self-healed</b>'} from Git.`);
        } else if (d.length) say(`⚠ <b>${e}</b>: OutOfSync on <code>${d.join(', ')}</code>. Self-heal is off, so the drift stays.`);
      });
      st.next = SYNC_MS; paint();
    }

    bEdit.onclick = () => {
      const e = env(), E = st.envs[e];
      const cand = FIELDS.filter((f) => E.live[f.k] === head(e).vals[f.k]);
      if (!cand.length) { say('Every field already drifted here.'); return; }
      const f = cand[Math.floor(Math.random() * cand.length)];
      E.live[f.k] = f.k === 'image' ? DRIFT.image : DRIFT[f.k];
      say(`✋ On-call ran <code>kubectl edit</code> on <b>${e}</b>: ${f.k} → <code>${E.live[f.k]}</code>. Git did not change.`);
      paint();
    };
    bCommit.onclick = () => { st.ver++; commit('dev', 'bump image 1.7.' + st.ver, { image: '1.7.' + st.ver }); say(`⬆ CI built <code>1.7.${st.ver}</code>; image updater committed it to <code>overlays/dev</code>.`); paint(); };
    bProm.onclick = () => {
      if (st.pr) { say('A PR is already open. Merge it first.'); return; }
      const i = st.sel === 2 ? 1 : st.sel, from = ENVS[i], to = ENVS[i + 1];
      const img = head(from).vals.image;
      if (head(to).vals.image === img) { say(`${to} already runs ${img}. Commit something new to dev first.`); return; }
      st.pr = { from, to, img }; say(`⇢ PR opened: <code>overlays/${to}</code> newTag ${head(to).vals.image} → <b>${img}</b>. Checks green; waiting for approval.`); paint();
    };
    bMerge.onclick = () => { const p = st.pr; if (!p) return; commit(p.to, `promote ${p.img} from ${p.from}`, { image: p.img }); st.pr = null; st.sel = ENVS.indexOf(p.to); say(`✓ Merged. Git for <b>${p.to}</b> now says ${p.img}; the agent will pick it up on the next sync.`); paint(); };
    bRevert.onclick = () => {
      const e = env(), E = st.envs[e];
      if (E.commits.length < 2) { say(`Nothing to revert on ${e}.`); return; }
      const last = head(e), prev = E.commits[E.commits.length - 2];
      E.commits.push({ sha: sha(), msg: 'revert ' + last.sha, vals: Object.assign({}, prev.vals) });
      say(`↶ <code>git revert ${last.sha}</code> on <b>${e}</b>: a new commit restoring ${prev.vals.image}. History keeps both.`); paint();
    };
    bSync.onclick = () => reconcile(true);
    bHeal.onclick = () => { st.heal = !st.heal; say(`Self-heal <b>${st.heal ? 'on' : 'off'}</b>. New commits still auto-sync either way.`); paint(); };

    function paint() {
      const e = env(), E = st.envs[e], h = head(e);
      ENVS.forEach((x, i) => {
        const d = diffs(x).length || head(x).sha !== st.envs[x].synced;
        pills[i].r.setAttribute('stroke', i === st.sel ? 'var(--accent)' : d ? 'var(--warn)' : 'var(--border)');
        pills[i].r.setAttribute('stroke-width', i === st.sel ? 3 : 1.5);
        pills[i].t2.textContent = head(x).vals.image + (d ? ' ≠' : ' ✓');
        pills[i].t2.setAttribute('fill', d ? 'var(--warn)' : 'var(--ok)');
      });
      FIELDS.forEach((f, i) => {
        const R = rows[i], same = h.vals[f.k] === E.live[f.k];
        R.g.textContent = h.vals[f.k]; R.l.textContent = E.live[f.k];
        R.l.setAttribute('fill', same ? 'var(--text)' : 'var(--err)');
        R.s.textContent = same ? '✓' : '≠'; R.s.setAttribute('fill', same ? 'var(--ok)' : 'var(--err)');
        R.bg.setAttribute('fill', E.flash[f.k] ? 'color-mix(in srgb, var(--ok) 22%, transparent)' : same ? 'transparent' : 'color-mix(in srgb, var(--err) 10%, transparent)');
      });
      bHeal.textContent = '🩹 Self-heal: ' + (st.heal ? 'on' : 'off');
      bMerge.disabled = !st.pr; bProm.disabled = !!st.pr;
      bProm.textContent = st.sel === 2 ? '⇢ PR: staging → prod' : `⇢ PR: ${ENVS[st.sel]} → ${ENVS[st.sel + 1]}`;
      const drifted = ENVS.reduce((a, x) => a + diffs(x).length, 0);
      stats.innerHTML = '';
      [['env', e], ['Git HEAD', h.sha], ['synced rev', E.synced], ['drifted fields (all envs)', drifted], ['next sync', Math.ceil(st.next / 1000) + ' s (≈ 3 min)'], ['open PR', st.pr ? st.pr.from + '→' + st.pr.to : 'none']]
        .forEach(([k, v]) => stats.append(el('span', { class: 'w-stat', html: `${k}: <b>${v}</b>` })));
      bar.setAttribute('width', (W - 16) * (1 - st.next / SYNC_MS));
    }

    let visible = true; ctx.onVisible((v) => { visible = v; });
    let last = Date.now();
    timer = setInterval(() => {
      const now = Date.now(), dt = now - last; last = now;
      if (my !== gen || !root.isConnected || !visible) return;
      ENVS.forEach((x) => { const F_ = st.envs[x].flash; Object.keys(F_).forEach((k) => { F_[k] -= dt / 1500; if (F_[k] <= 0) delete F_[k]; }); });
      st.next -= dt;
      if (st.next <= 0) reconcile(false); else paint();
    }, ctx.reduced ? 1000 : 250);
    paint();
    say('Try: <b>✋ kubectl edit</b> on prod, wait for the sync bar. Then turn self-heal off and repeat. Then <b>⬆ commit</b>, open a PR to staging, merge, and promote to prod.');
  }
  build(ctx.narrow);
  ctx.onResize(build);
});
