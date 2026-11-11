/* CI/CD pipeline with gates. Inject threats; each runs through real checks and stops at the first gate that catches it. */
SD.widget('devsecops', function (root, ctx) {
  const { el, svg } = ctx;
  const STAGES = [
    { id: 'commit', l: 'Commit', s: 'secrets scan' },
    { id: 'resolve', l: 'Resolve deps', s: 'registry' },
    { id: 'build', l: 'Build', s: 'SAST · SCA' },
    { id: 'image', l: 'Image', s: 'image scan' },
    { id: 'sign', l: 'Sign', s: 'cosign + SLSA' },
    { id: 'admit', l: 'Admit', s: 'Kyverno' },
    { id: 'prod', l: 'Production', s: '' }
  ];
  const POPULAR = ['requests', 'lodash', 'express', 'react', 'jackson-databind', 'urllib3', 'colors'];
  const INTERNAL = { 'acme-auth': '1.4.2' };
  const THREATS = [
    { id: 'cve', l: 'Vulnerable lib (CVE)', sev: 3, pkg: 'jackson-databind', ver: '2.9.8' },
    { id: 'secret', l: 'Leaked secret', sev: 3, text: 'aws_secret = "AKIAIOSFODNN7EXAMPLE"' },
    { id: 'typo', l: 'Typosquat package', sev: 4, pkg: 'reqeusts' },
    { id: 'conf', l: 'Dependency confusion', sev: 4, pkg: 'acme-auth', pubVer: '99.0.0' },
    { id: 'unsigned', l: 'Unsigned image', sev: 3 },
    { id: 'tamper', l: 'Tampered artefact', sev: 4 }
  ];
  const ADVISORIES = { 'jackson-databind': { below: '2.9.10.8', sev: 'HIGH' } };
  let gates = 'sca', policy = 'warn', proxy = false, loopH = null, gen = 0;
  const results = {};

  // ---- real mechanisms ----
  function dl(a, b) {                       // Damerau-Levenshtein (optimal string alignment)
    const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  const cmpVer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
  function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); }
  const SECRET_RE = /(AKIA[0-9A-Z]{16})|(-----BEGIN [A-Z ]*PRIVATE KEY-----)|(ghp_[A-Za-z0-9]{36})/;

  const G = () => ({ none: 0, sca: 1, full: 2, signed: 3 }[gates]);
  const blocks = (sev) => sev >= ({ warn: 99, crit: 4, high: 3 }[policy]);

  /* returns { stage index where it stops, verdict: blocked|warned|missed, why } */
  function evaluate(t) {
    const g = G(), warns = [], info = [];
    const scanner = (stage, hit, why) => { if (!hit) return null; if (blocks(t.sev)) return { at: stage, v: 'blocked', why }; warns.push(why); return null; };
    let r;
    // 0 commit: pre-commit / PR secrets scanning (full+)
    if (t.id === 'secret' && g >= 2 && (r = scanner(0, SECRET_RE.test(t.text), 'secrets regex matched an AWS access key id (AKIA…)'))) return r;
    // 1 resolve: registry
    if (t.id === 'conf') {
      const internal = INTERNAL[t.pkg], chosen = proxy ? internal : (cmpVer(t.pubVer, internal) > 0 ? t.pubVer : internal);
      if (proxy) return { at: 1, v: 'blocked', why: `scope rule: ${t.pkg} served only from internal (${internal}); public ${t.pubVer} never fetched` };
      info.push(`resolver saw internal ${internal} and public ${t.pubVer}, picked highest: <b>${chosen}</b> (attacker\'s)`);
    }
    if (t.id === 'typo') {
      const near = POPULAR.map((p) => [p, dl(t.pkg, p)]).filter(([p, d]) => d > 0 && d <= 2).sort((a, b) => a[1] - b[1])[0];
      if (proxy && near) return { at: 1, v: 'blocked', why: `proxy quarantine: "${t.pkg}" is ${near[1]} edit from "${near[0]}" and first published 2 days ago` };
      if (g >= 1 && near && (r = scanner(2, true, `SCA malware feed: "${t.pkg}" flagged as typosquat of "${near[0]}" (distance ${near[1]})`))) return r;
    }
    // 2 build: SCA advisory match
    if (t.id === 'cve' && g >= 1) {
      const adv = ADVISORIES[t.pkg];
      if ((r = scanner(2, adv && cmpVer(t.ver, adv.below) < 0, `SCA: ${t.pkg} ${t.ver} &lt; ${adv.below} (${adv.sev}: known polymorphic deserialisation CVEs)`))) return r;
    }
    // 3 image scan (full+) re-checks the CVE in the image layers
    if (t.id === 'cve' && g >= 2 && (r = scanner(3, true, 'image scan: same jar found in /app/lib'))) return r;
    // 5 admit: signature + provenance digest (signed)
    if (g >= 3 && (t.id === 'unsigned' || t.id === 'tamper')) {
      if (t.id === 'unsigned') return { at: 5, v: 'blocked', why: 'no signature from release.yml@refs/heads/main in Rekor for this digest' };
      const built = 'sha256:' + fnv('api-1.4-layers'), pushed = 'sha256:' + fnv('api-1.4-layers+implant');
      return { at: 5, v: 'blocked', why: `provenance subject ${built} ≠ deployed ${pushed}` };
    }
    if (t.id === 'conf' || (t.id === 'typo' && g < 1)) info.push('package has no CVE: an advisory match finds nothing');
    if (warns.length) return { at: 6, v: 'warned', why: warns.concat(info).join('; ') + ' (policy: warn only, shipped)' };
    return { at: 6, v: 'missed', why: info.join('; ') || 'no active gate checks this' };
  }

  function build(narrow) {
    const my = ++gen;
    if (loopH) { loopH.stop(); loopH = null; }
    root.innerHTML = '';
    const F = narrow ? 15 : 13, FS = narrow ? 13 : 12;
    const W = narrow ? 360 : 740, H = narrow ? 520 : 170;
    const seg = (label, opts, get, set) => {
      const wrap = el('div', { class: 'seg', role: 'group', 'aria-label': label });
      opts.forEach(([v, l]) => { const b = el('button', { class: 'btn' + (get() === v ? ' primary' : ''), text: l }); b.addEventListener('click', () => { set(v); rebuildKeepScore(); }); wrap.append(b); });
      return el('label', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' } }, el('span', { class: 'muted', text: label + ' ' }), wrap);
    };
    root.append(el('div', { class: 'w-controls' },
      seg('Gates', [['none', 'None'], ['sca', 'SCA'], ['full', 'Full scan'], ['signed', '+ Signing']], () => gates, (v) => { gates = v; }),
      seg('Policy', [['warn', 'Warn'], ['crit', 'Block crit'], ['high', 'Block high+']], () => policy, (v) => { policy = v; }),
      seg('Registry', [[false, 'Public direct'], [true, 'Private proxy']], () => proxy, (v) => { proxy = v; })));
    const inj = el('div', { class: 'w-controls' });
    THREATS.forEach((t) => { const b = el('button', { class: 'btn', text: '＋ ' + t.l }); b.addEventListener('click', () => run([t])); inj.append(b); });
    const all = el('button', { class: 'btn primary', text: '▶ Inject all 6' }); all.addEventListener('click', () => run(THREATS));
    inj.append(all); root.append(inj);

    const S = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Pipeline stages with gates' });
    root.append(el('div', { class: 'w-stage' }, S));
    const stats = el('div', { class: 'w-stats' }), log = el('div', { class: 'w-log', 'aria-live': 'polite' });
    root.append(stats, log);

    const g = G();
    const active = [g >= 2, proxy, g >= 1, g >= 2, g >= 3, g >= 3, true];
    const pos = STAGES.map((s, i) => narrow ? [180, 34 + i * 72] : [55 + i * 105, 70]);
    const BW = narrow ? 230 : 96, BH = narrow ? 52 : 58;
    for (let i = 0; i < STAGES.length - 1; i++) {
      const [x1, y1] = pos[i], [x2, y2] = pos[i + 1];
      S.append(svg('line', narrow ? { x1, y1: y1 + BH / 2, x2, y2: y2 - BH / 2, stroke: 'var(--border)', 'stroke-width': 2 } : { x1: x1 + BW / 2, y1, x2: x2 - BW / 2, y2, stroke: 'var(--border)', 'stroke-width': 2 }));
    }
    const boxes = STAGES.map((s, i) => {
      const [x, y] = pos[i], on = active[i], last = i === STAGES.length - 1;
      const r = svg('rect', { x: x - BW / 2, y: y - BH / 2, width: BW, height: BH, rx: 9, fill: on ? 'var(--surface-2)' : 'transparent', stroke: last ? 'var(--accent)' : on ? 'var(--ok)' : 'var(--border)', 'stroke-width': 2, 'stroke-dasharray': on ? '' : '5 4' });
      S.append(r);
      S.append(svg('text', { x, y: y - (narrow ? 3 : 4), 'text-anchor': 'middle', fill: on ? 'var(--text)' : 'var(--text-3)', style: `font:700 ${F}px var(--sans)`, text: s.l }));
      if (!last) S.append(svg('text', { x, y: y + (narrow ? 15 : 15), 'text-anchor': 'middle', fill: 'var(--text-3)', style: `font:500 ${FS}px var(--sans)`, text: on ? s.s : 'off' }));
      return r;
    });
    const dot = svg('circle', { r: 9, cx: pos[0][0], cy: pos[0][1], fill: 'var(--accent)', opacity: 0 });
    const mark = svg('text', { 'text-anchor': 'middle', style: `font:800 ${F + 4}px var(--sans)`, opacity: 0 });
    S.append(dot, mark);

    function say(h) { if (my !== gen) return; log.prepend(el('div', { html: h })); while (log.children.length > 30) log.lastChild.remove(); }
    function score() {
      stats.innerHTML = '';
      const vals = Object.values(results);
      const c = (v) => vals.filter((x) => x === v).length;
      [['blocked', c('blocked'), 'ok'], ['warned, shipped', c('warned'), 'warn'], ['missed', c('missed'), 'err']].forEach(([k, n, tone]) =>
        stats.append(el('span', { class: 'w-stat', html: `${k}: <b style="color:var(--${tone})">${n}</b>` })));
      THREATS.forEach((t) => { if (results[t.id]) stats.append(el('span', { class: 'w-stat', html: `${t.l}: <b style="color:var(--${results[t.id] === 'blocked' ? 'ok' : results[t.id] === 'warned' ? 'warn' : 'err'})">${results[t.id]}</b>` })); });
      const mins = [0, 1.5, 5, 6][g] - (proxy ? 0.5 : 0);
      stats.append(el('span', { class: 'w-stat', html: `build time added: <b>+${Math.max(0, mins).toFixed(1)} min</b>` }));
    }
    function run(list) {
      if (my !== gen) return;
      if (loopH) { loopH.stop(); loopH = null; }
      const queue = list.slice();
      const next = () => {
        if (my !== gen) return;
        const t = queue.shift(); if (!t) return;
        const r = evaluate(t);
        const finish = () => {
          results[t.id] = r.v;
          const tone = r.v === 'blocked' ? 'ok' : r.v === 'warned' ? 'warn' : 'err';
          boxes[r.at].setAttribute('stroke', `var(--${tone})`);
          mark.setAttribute('x', pos[r.at][0] + (narrow ? BW / 2 + 16 : 0)); mark.setAttribute('y', pos[r.at][1] + (narrow ? 6 : -BH / 2 - 8));
          mark.textContent = r.v === 'blocked' ? '✕' : '!'; mark.setAttribute('fill', `var(--${tone})`); mark.setAttribute('opacity', 1);
          say(`<b style="color:var(--${tone})">${r.v.toUpperCase()}</b> · ${t.l} at <b>${STAGES[r.at].l}</b>: ${r.why}`);
          score();
          setTimeout(() => { boxes.forEach((b, i) => b.setAttribute('stroke', i === 6 ? 'var(--accent)' : active[i] ? 'var(--ok)' : 'var(--border)')); next(); }, ctx.reduced ? 0 : 500);
        };
        if (ctx.reduced) { finish(); return; }
        dot.setAttribute('opacity', 1); mark.setAttribute('opacity', 0);
        let p = 0;
        loopH = ctx.loop((dt) => {
          p += Math.min(dt, 100) / 260;
          const k = Math.min(p, r.at), i = Math.floor(k), f = k - i, j = Math.min(i + 1, 6);
          dot.setAttribute('cx', pos[i][0] + (pos[j][0] - pos[i][0]) * f); dot.setAttribute('cy', pos[i][1] + (pos[j][1] - pos[i][1]) * f);
          if (p >= r.at) { loopH.stop(); loopH = null; dot.setAttribute('opacity', 0); finish(); }
        });
      };
      next();
    }
    score();
    say('Inject a threat, or press <b>Inject all 6</b>. Dashed stages are off. Then change gates, policy or registry and inject again.');
  }
  function rebuildKeepScore() { Object.keys(results).forEach((k) => delete results[k]); build(ctx.narrow); }
  build(ctx.narrow);
  ctx.onResize(build);
});
