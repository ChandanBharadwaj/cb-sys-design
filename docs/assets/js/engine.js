/* ==========================================================================
   System Design Atlas — page engine
   A data file calls SD.register({...}); an optional widget file calls
   SD.widget(slug, fn). On DOMContentLoaded the engine renders the page.
   ========================================================================== */
(function () {
  'use strict';

  const SD = (window.SD = window.SD || {});
  SD.widgets = SD.widgets || {};
  SD.register = (d) => { SD.data = d; };
  SD.widget = (id, fn) => { SD.widgets[id] = fn; };

  const NS = 'http://www.w3.org/2000/svg';
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  SD.reduced = reduced;

  /* ---------------- helpers ---------------- */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  }
  function svg(tag, attrs, ...kids) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.setAttribute('class', v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
    return n;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  function fmtNum(n, digits) {
    if (typeof n !== 'number' || !isFinite(n)) return String(n);
    const a = Math.abs(n);
    const d = digits == null ? (a >= 100 ? 0 : a >= 10 ? 1 : 2) : digits;
    const units = [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [v, u] of units) if (a >= v) { const x = n / v; return trim(x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)) + u; }
    return trim(n.toFixed(a >= 100 ? 0 : d));
  }
  function trim(s) { return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; }
  function fmtBytes(n) {
    if (!isFinite(n)) return String(n);
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB'];
    let i = 0; let x = Math.abs(n);
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return trim(x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)) + ' ' + u[i];
  }
  function fmtBits(n) {
    if (!isFinite(n)) return String(n);
    const u = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'];
    let i = 0; let x = Math.abs(n);
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return trim(x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)) + ' ' + u[i];
  }
  function fmtDur(ms) {
    if (!isFinite(ms)) return String(ms);
    if (ms < 1) return trim((ms * 1000).toFixed(0)) + ' µs';
    if (ms < 1000) return trim(ms.toFixed(ms < 10 ? 1 : 0)) + ' ms';
    const s = ms / 1000; if (s < 120) return trim(s.toFixed(1)) + ' s';
    const m = s / 60; if (m < 120) return trim(m.toFixed(1)) + ' min';
    const h = m / 60; if (h < 48) return trim(h.toFixed(1)) + ' h';
    const d = h / 24; if (d < 730) return trim(d.toFixed(0)) + ' days';
    return trim((d / 365).toFixed(1)) + ' years';
  }
  function fmt(v, kind, unit) {
    if (typeof v === 'string') return v;
    let s;
    switch (kind) {
      case 'bytes': s = fmtBytes(v); break;
      case 'bytesps': s = fmtBytes(v) + '/s'; break;
      case 'bits': s = fmtBits(v); break;
      case 'ms': s = fmtDur(v); break;
      case 'pct': s = trim((v * 100).toFixed(v < 0.01 ? 3 : 1)) + '%'; break;
      case 'raw': s = String(v); break;
      default: s = fmtNum(v);
    }
    return unit ? s + ' ' + unit : s;
  }
  SD.fmt = { num: fmtNum, bytes: fmtBytes, bits: fmtBits, dur: fmtDur, any: fmt };
  SD.h = { el, svg, esc, clamp, sleep, cssVar, store };

  /* ---------------- theme ---------------- */
  function initTheme() {
    const t = store.get('sd-theme', null);
    if (t) document.documentElement.setAttribute('data-theme', t);
  }
  function currentTheme() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function themeButton() {
    const b = el('button', { class: 'icon-btn', 'aria-label': 'Toggle theme', title: 'Toggle light/dark' });
    const paint = () => { b.textContent = currentTheme() === 'dark' ? '☀' : '☾'; };
    b.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      store.set('sd-theme', next); paint();
      document.dispatchEvent(new CustomEvent('sd-theme'));
    });
    paint();
    return b;
  }
  SD.themeButton = themeButton;
  initTheme();

  /* ---------------- visibility helpers ---------------- */
  function onVisible(node, cb, opts) {
    if (!('IntersectionObserver' in window)) { cb(true); return () => {}; }
    const io = new IntersectionObserver((ents) => ents.forEach((e) => cb(e.isIntersecting)), opts || { threshold: 0.15 });
    io.observe(node);
    return () => io.disconnect();
  }
  function revealAll(root) {
    const items = root.querySelectorAll('.reveal');
    if (reduced || !('IntersectionObserver' in window)) { items.forEach((i) => i.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    items.forEach((i) => io.observe(i));
  }
  // frame loop that only runs while `node` is on-screen
  function makeLoop(node, cb) {
    let visible = false; let raf = 0; let last = 0; let stopped = false;
    const tick = (t) => {
      if (stopped || !visible) { raf = 0; return; }
      const dt = last ? Math.min(64, t - last) : 16; last = t;
      cb(dt, t);
      raf = requestAnimationFrame(tick);
    };
    const off = onVisible(node, (v) => {
      visible = v;
      if (v && !raf && !stopped) { last = 0; raf = requestAnimationFrame(tick); }
    }, { threshold: 0.05 });
    return { stop() { stopped = true; off(); if (raf) cancelAnimationFrame(raf); } };
  }
  SD.onVisible = onVisible;
  SD.loop = makeLoop;

  /* ======================================================================
     Diagram — renders nodes/edges from a spec, with wide & tall layouts
     ====================================================================== */
  const KIND_LABEL = {
    client: 'Client', edge: 'Edge / Gateway', service: 'Service', store: 'Database / Store',
    queue: 'Queue / Log', cache: 'Cache / In-memory', compute: 'Worker / Compute', external: 'External', ml: 'ML / GPU'
  };
  const SIZE = { wide: { W: 1000, w: 150, h: 58 }, tall: { W: 420, w: 128, h: 50 } };

  class Diagram {
    constructor(host, spec, opts) {
      this.host = host;
      this.spec = spec;
      this.opts = opts || {};
      this.stage = el('div', { class: 'diagram-stage' });
      this.tip = el('div', { class: 'tip', role: 'tooltip' });
      this.stage.append(this.tip);
      host.append(this.stage);
      this.mode = null;
      this.state = {};
      this.runId = 0;
      this.ambient = null;
      this.render();
      if ('ResizeObserver' in window) {
        this.ro = new ResizeObserver(() => {
          const m = this.pickMode();
          if (m !== this.mode) { this.render(); if (this.onRerender) this.onRerender(); }
        });
        this.ro.observe(host);
      }
      this.stage.addEventListener('click', (e) => { if (!e.target.closest('.node')) this.hideTip(); });
    }
    pickMode() {
      const hasTall = this.spec.nodes.every((n) => n.tall);
      const w = this.host.clientWidth || window.innerWidth;
      return hasTall && w < 640 ? 'tall' : 'wide';
    }
    pos(n) { return this.mode === 'tall' ? n.tall : n.wide; }
    dims(n) {
      const s = SIZE[this.mode];
      const w = (this.mode === 'tall' ? n.tw : n.w) || n.w || s.w;
      const h = (this.mode === 'tall' ? n.th : n.h) || n.h || s.h;
      return { w: this.mode === 'tall' && !n.tw && n.w ? Math.min(n.w, s.w + 20) : w, h };
    }
    render() {
      this.mode = this.pickMode();
      const spec = this.spec;
      const S = SIZE[this.mode];
      if (this.svg) this.svg.remove();
      // bounds
      let minY = Infinity; let maxY = -Infinity;
      spec.nodes.forEach((n) => { const p = this.pos(n); const d = this.dims(n); minY = Math.min(minY, p[1] - d.h / 2); maxY = Math.max(maxY, p[1] + d.h / 2); });
      (spec.groups || []).forEach((g) => { const r = this.mode === 'tall' ? g.tall : g.wide; if (r) { minY = Math.min(minY, r[1]); maxY = Math.max(maxY, r[1] + r[3]); } });
      const pad = 26;
      const vb = [0, Math.floor(minY - pad), S.W, Math.ceil(maxY - minY + pad * 2)];
      this.vb = vb;
      const root = svg('svg', { viewBox: vb.join(' '), class: this.mode, role: 'img', 'aria-label': (spec.title || 'Architecture diagram') });
      const defs = svg('defs');
      const mk = (id, cls) => svg('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
        svg('path', { d: 'M0,0 L10,5 L0,10 z', class: cls }));
      this.uid = 'd' + Math.random().toString(36).slice(2, 8);
      defs.append(mk(this.uid + 'a', 'arrow'), mk(this.uid + 'b', 'arrow-on'));
      const style = svg('style', { text: `.arrow{fill:var(--edge)}.arrow-on{fill:var(--edge-active)}` });
      root.append(style, defs);
      this.gGroups = svg('g'); this.gEdges = svg('g'); this.gNodes = svg('g'); this.gFx = svg('g'); this.gBadges = svg('g');
      root.append(this.gGroups, this.gEdges, this.gNodes, this.gFx, this.gBadges);

      (spec.groups || []).forEach((g) => {
        const r = this.mode === 'tall' ? g.tall : g.wide; if (!r) return;
        this.gGroups.append(svg('g', { class: 'group' },
          svg('rect', { x: r[0], y: r[1], width: r[2], height: r[3], rx: 14 }),
          svg('text', { x: r[0] + 12, y: r[1] + 16, text: g.label })));
      });

      this.nodeEls = {};
      this.nodeById = {};
      spec.nodes.forEach((n) => { this.nodeById[n.id] = n; });
      this.edgeEls = [];
      spec.edges.forEach((e, i) => {
        const a = this.nodeById[e.from]; const b = this.nodeById[e.to];
        if (!a || !b) { console.warn('edge refers to unknown node', e); return; }
        const d = this.edgePath(a, b, e.bend || 0);
        const p = svg('path', { d: d.path, 'marker-end': e.bidi ? `url(#${this.uid}a)` : `url(#${this.uid}a)`, 'marker-start': e.bidi ? `url(#${this.uid}a)` : null });
        const g = svg('g', { class: 'edge' + (e.dashed ? ' dashed' : '') }, p);
        if (e.label) g.append(svg('text', { x: d.mid[0], y: d.mid[1] - 4, 'text-anchor': 'middle', text: e.label }));
        this.gEdges.append(g);
        this.edgeEls.push({ e, g, p, i });
      });

      spec.nodes.forEach((n) => this.gNodes.append(this.drawNode(n)));
      this.svg = root;
      this.stage.insertBefore(root, this.tip);
      this.applyState(this.state, true);
    }
    drawNode(n) {
      const p = this.pos(n); const d = this.dims(n);
      const x = p[0] - d.w / 2; const y = p[1] - d.h / 2;
      const kind = n.kind || 'service';
      const color = `var(--k-${kind})`;
      const g = svg('g', { class: 'node', 'data-id': n.id, tabindex: 0, role: 'button', 'aria-label': n.label + (n.tip ? ': ' + n.tip : '') });
      g.style.setProperty('--glow', color);
      let box;
      const fill = `color-mix(in srgb, ${color} 10%, var(--surface))`;
      if (kind === 'store') {
        const e = 7;
        box = svg('path', {
          class: 'box',
          d: `M${x},${y + e} a${d.w / 2},${e} 0 0 1 ${d.w},0 v${d.h - 2 * e} a${d.w / 2},${e} 0 0 1 ${-d.w},0 z`
        });
        g.append(box, svg('path', { d: `M${x},${y + e} a${d.w / 2},${e} 0 0 0 ${d.w},0`, fill: 'none', stroke: color, 'stroke-width': 1.2, opacity: .8 }));
      } else {
        box = svg('rect', { class: 'box', x, y, width: d.w, height: d.h, rx: kind === 'client' ? 16 : 10 });
        if (kind === 'external') box.setAttribute('stroke-dasharray', '5 4');
        g.append(box);
        if (kind === 'queue') {
          for (let i = 0; i < 3; i++) g.append(svg('line', { x1: x + d.w - 10 - i * 6, x2: x + d.w - 10 - i * 6, y1: y + 9, y2: y + d.h - 9, stroke: color, 'stroke-width': 2, opacity: .45 - i * .1 }));
        }
        if (kind === 'cache') g.append(svg('text', { x: x + d.w - 13, y: y + 15, 'text-anchor': 'middle', class: 'kicon', fill: color, text: '⚡' }));
      }
      box.style.stroke = color; box.style.fill = fill;
      const hasSub = !!n.sub;
      const ty = hasSub ? p[1] - 2 : p[1] + 4.5;
      const t1 = svg('text', { x: p[0], y: ty, 'text-anchor': 'middle', class: 'ttl', text: n.label });
      g.append(t1);
      let t2 = null;
      if (hasSub) { t2 = svg('text', { x: p[0], y: p[1] + 13, 'text-anchor': 'middle', class: 'sub', text: n.sub }); g.append(t2); }
      g.addEventListener('mouseenter', () => this.showTip(n, g));
      g.addEventListener('mouseleave', () => this.hideTip());
      g.addEventListener('focus', () => this.showTip(n, g));
      g.addEventListener('blur', () => this.hideTip());
      g.addEventListener('click', (ev) => { ev.stopPropagation(); this.showTip(n, g); });
      this.nodeEls[n.id] = { g, t1, t2, box, w: d.w };
      // shrink text that overflows after it is in the DOM
      requestAnimationFrame(() => this.fitText(n.id));
      return g;
    }
    fitText(id) {
      const ne = this.nodeEls[id]; if (!ne) return;
      [ne.t1, ne.t2].forEach((t) => {
        if (!t) return;
        t.removeAttribute('textLength'); t.removeAttribute('lengthAdjust');
        try {
          const max = ne.w - 14;
          const len = t.getComputedTextLength();
          if (len > max) { t.setAttribute('textLength', max); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
        } catch (e) { /* not rendered */ }
      });
    }
    clipToBox(c, toward, n) {
      const d = this.dims(n);
      const dx = toward[0] - c[0]; const dy = toward[1] - c[1];
      if (!dx && !dy) return c;
      const sx = (d.w / 2 + 3) / Math.abs(dx || 1e-9); const sy = (d.h / 2 + 3) / Math.abs(dy || 1e-9);
      const s = Math.min(sx, sy);
      return [c[0] + dx * s, c[1] + dy * s];
    }
    edgePath(a, b, bend) {
      const pa = this.pos(a); const pb = this.pos(b);
      const mx = (pa[0] + pb[0]) / 2; const my = (pa[1] + pb[1]) / 2;
      const dx = pb[0] - pa[0]; const dy = pb[1] - pa[1];
      const len = Math.hypot(dx, dy) || 1;
      const cx = mx - (dy / len) * bend * len; const cy = my + (dx / len) * bend * len;
      const ctrl = [cx, cy];
      const s = this.clipToBox(pa, bend ? ctrl : pb, a);
      const e = this.clipToBox(pb, bend ? ctrl : pa, b);
      if (!bend) return { path: `M${s[0]},${s[1]} L${e[0]},${e[1]}`, mid: [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2] };
      const mid = [0.25 * s[0] + 0.5 * cx + 0.25 * e[0], 0.25 * s[1] + 0.5 * cy + 0.25 * e[1]];
      return { path: `M${s[0]},${s[1]} Q${cx},${cy} ${e[0]},${e[1]}`, mid };
    }
    showTip(n, g) {
      if (!n.tip) return;
      this.tip.innerHTML = `<b>${esc(n.label)}</b>${esc(n.tip)}`;
      const sr = this.stage.getBoundingClientRect(); const r = g.getBoundingClientRect();
      this.tip.classList.add('show');
      const tw = this.tip.offsetWidth; const th = this.tip.offsetHeight;
      let left = r.left - sr.left + r.width / 2 - tw / 2;
      left = clamp(left, 6, sr.width - tw - 6);
      let top = r.top - sr.top - th - 8;
      if (top < 4) top = r.bottom - sr.top + 8;
      this.tip.style.left = left + 'px'; this.tip.style.top = top + 'px';
    }
    hideTip() { this.tip.classList.remove('show'); }

    findEdge(a, b) {
      for (const x of this.edgeEls) {
        if (x.e.from === a && x.e.to === b) return { x, rev: false };
        if (x.e.from === b && x.e.to === a) return { x, rev: true };
      }
      return null;
    }
    /* state: {hot:[], err:[], warn:[], ok:[], hidden:[], dim:bool, active:[[a,b]], labels:{id:{label,sub}}, badges:{id:[text,tone]}} */
    applyState(st, instant) {
      this.state = st || {};
      const s = this.state;
      const hidden = new Set(s.hidden || []);
      const hot = new Set(s.hot || []);
      const tones = {};
      ['err', 'warn', 'ok'].forEach((t) => (s[t] || []).forEach((id) => { tones[id] = t; hot.add(id); }));
      for (const id in this.nodeEls) {
        const ne = this.nodeEls[id]; const n = this.nodeById[id];
        ne.g.classList.toggle('hidden', hidden.has(id));
        ne.g.classList.toggle('hot', hot.has(id));
        ne.g.classList.toggle('dim', !!s.dim && hot.size > 0 && !hot.has(id));
        ne.g.classList.remove('err', 'warn', 'ok');
        if (tones[id]) ne.g.classList.add(tones[id]);
        const lab = (s.labels || {})[id];
        const L = lab && lab.label != null ? lab.label : n.label;
        const Sb = lab && lab.sub != null ? lab.sub : n.sub;
        if (ne.t1.textContent !== L) { ne.t1.textContent = L; this.fitText(id); }
        if (ne.t2 && Sb != null && ne.t2.textContent !== Sb) { ne.t2.textContent = Sb; this.fitText(id); }
      }
      const active = new Set((s.active || []).map((p) => p.join('>')));
      this.edgeEls.forEach(({ e, g, p }) => {
        const hid = hidden.has(e.from) || hidden.has(e.to) || (s.hiddenEdges || []).includes(e.from + '>' + e.to);
        g.classList.toggle('hidden', hid);
        const on = active.has(e.from + '>' + e.to) || active.has(e.to + '>' + e.from);
        g.classList.toggle('active', on);
        g.classList.toggle('dim', !!s.dim && hot.size > 0 && !on);
        const m = `url(#${this.uid}${on ? 'b' : 'a'})`;
        p.setAttribute('marker-end', m);
        if (e.bidi) p.setAttribute('marker-start', m);
      });
      this.drawBadges(s.badges || {});
    }
    drawBadges(badges) {
      this.gBadges.innerHTML = '';
      for (const id in badges) {
        const n = this.nodeById[id]; if (!n) continue;
        let b = badges[id]; if (typeof b === 'string') b = [b, 'info'];
        const [text, tone] = b;
        const p = this.pos(n); const d = this.dims(n);
        const color = tone === 'err' ? 'var(--err)' : tone === 'warn' ? 'var(--warn)' : tone === 'ok' ? 'var(--ok)' : 'var(--accent)';
        const w = Math.max(26, text.length * 7 + 14);
        let bx = p[0] + d.w / 2 - w + 10; const by = p[1] - d.h / 2 - 22;
        bx = clamp(bx, 4, this.vb[2] - w - 4);
        const g = svg('g', { class: 'badge-bubble' });
        g.style.transformOrigin = `${bx + w / 2}px ${by + 10}px`;
        g.append(svg('rect', { x: bx, y: by, width: w, height: 20, rx: 10, fill: color, stroke: 'var(--surface)' }),
          svg('text', { x: bx + w / 2, y: by + 14, 'text-anchor': 'middle', fill: '#fff', text }));
        this.gBadges.append(g);
      }
    }
    pathFor(a, b) {
      const f = this.findEdge(a, b);
      if (f && !f.x.g.classList.contains('hidden')) return { p: f.x.p, rev: f.rev, temp: null };
      const na = this.nodeById[a]; const nb = this.nodeById[b];
      if (!na || !nb) return null;
      const d = this.edgePath(na, nb, 0.12);
      const tp = svg('path', { d: d.path, fill: 'none', stroke: 'var(--edge-active)', 'stroke-width': 1.6, 'stroke-dasharray': '4 5', opacity: .8 });
      this.gFx.append(tp);
      return { p: tp, rev: false, temp: tp };
    }
    /* animate a packet over a->b. Resolves when done (or immediately if cancelled). */
    packet(a, b, opts) {
      opts = opts || {};
      const run = opts.run == null ? this.runId : opts.run;
      const route = this.pathFor(a, b);
      if (!route) return Promise.resolve();
      const tone = opts.tone || 'info';
      const color = tone === 'err' ? 'var(--err)' : tone === 'warn' ? 'var(--warn)' : tone === 'ok' ? 'var(--ok)' : opts.color || 'var(--accent)';
      const len = route.p.getTotalLength();
      const r = opts.r || 6;
      const dot = svg('circle', { r, class: 'packet', fill: color, opacity: opts.opacity || 1 });
      dot.style.color = color;
      this.gFx.append(dot);
      const dur = opts.dur || 650;
      return new Promise((res) => {
        const t0 = performance.now();
        const step = (t) => {
          if (run !== this.runId && !opts.free) { dot.remove(); if (route.temp) route.temp.remove(); return res(); }
          const k = clamp((t - t0) / dur, 0, 1);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const pt = route.p.getPointAtLength((route.rev ? 1 - e : e) * len);
          dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
          if (k < 1) requestAnimationFrame(step);
          else {
            dot.remove(); if (route.temp) setTimeout(() => route.temp.remove(), 250);
            res();
          }
        };
        requestAnimationFrame(step);
      });
    }
    cancel() { this.runId++; this.gFx.innerHTML = ''; }
    /* run a flow: array of 'a>b' or arrays of them for parallel hops */
    async flow(hops, opts) {
      opts = opts || {};
      const run = this.runId;
      for (const hop of hops) {
        if (run !== this.runId) return;
        const list = Array.isArray(hop) ? hop : [hop];
        await Promise.all(list.map((h) => {
          const [a, b] = h.split('>');
          return this.packet(a.trim(), b.trim(), Object.assign({}, opts, { run }));
        }));
      }
    }
    startAmbient() {
      if (reduced || this.ambient) return;
      let vis = false;
      const off = onVisible(this.stage, (v) => { vis = v; }, { threshold: 0.1 });
      const timer = setInterval(() => {
        if (!vis || this.busy || document.hidden) return;
        const live = this.edgeEls.filter((x) => !x.g.classList.contains('hidden'));
        if (!live.length) return;
        const x = live[Math.floor(Math.random() * live.length)];
        const rev = x.e.bidi && Math.random() < 0.5;
        this.packet(rev ? x.e.to : x.e.from, rev ? x.e.from : x.e.to, { free: true, r: 3.5, opacity: 0.55, dur: 1100 });
      }, 420);
      this.ambient = () => { clearInterval(timer); off(); };
    }
  }
  SD.Diagram = Diagram;

  function legend(spec) {
    const kinds = [...new Set(spec.nodes.map((n) => n.kind || 'service'))];
    return el('div', { class: 'legend' }, kinds.map((k) => el('span', null, el('i', { style: { background: `var(--k-${k})` } }), KIND_LABEL[k] || k)));
  }

  /* ======================================================================
     Scenario player
     ====================================================================== */
  function scenarioPlayer(card, diagram, scenarios) {
    const tabs = el('div', { class: 'scen-tabs', role: 'tablist' });
    const caption = el('div', { class: 'caption', 'aria-live': 'polite' });
    const dots = el('div', { class: 'dots' });
    const bPrev = el('button', { class: 'icon-btn', 'aria-label': 'Previous step', text: '⏮' });
    const bPlay = el('button', { class: 'icon-btn', 'aria-label': 'Play', text: '▶' });
    const bNext = el('button', { class: 'icon-btn', 'aria-label': 'Next step', text: '⏭' });
    const speeds = [0.5, 1, 1.5, 2];
    let speedIx = 1;
    const bSpeed = el('button', { class: 'icon-btn speed', 'aria-label': 'Playback speed', text: '1×' });
    const player = el('div', { class: 'player' }, el('div', { class: 'ctrl' }, bPrev, bPlay, bNext), dots, bSpeed);
    card.prepend(tabs);
    card.append(player, caption);

    let sc = null; let ix = 0; let playing = false; let timer = 0; let started = false;
    const toneColor = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)', info: 'var(--accent)' };

    scenarios.forEach((s, i) => {
      const t = el('button', { class: 'tab', role: 'tab', 'data-i': i },
        el('span', { class: 'tone', style: { background: toneColor[s.tone || 'info'] } }), s.title);
      t.addEventListener('click', () => { select(i); play(); });
      tabs.append(t);
    });

    function select(i) {
      stop();
      sc = scenarios[i]; ix = 0;
      [...tabs.children].forEach((t, j) => { t.classList.toggle('active', j === i); t.setAttribute('aria-selected', j === i); });
      dots.innerHTML = '';
      sc.steps.forEach((_, j) => {
        const d = el('button', { class: 'dot', 'aria-label': 'Step ' + (j + 1) });
        d.addEventListener('click', () => { stop(); show(j); });
        dots.append(d);
      });
      show(0, true);
    }
    function stepDuration(st) {
      const hops = (st.flow || []).length;
      return (hops * 700 + Math.max(1700, (st.text || '').length * 30)) / speeds[speedIx];
    }
    async function show(j, quiet) {
      clearTimeout(timer);
      ix = clamp(j, 0, sc.steps.length - 1);
      const st = sc.steps[ix];
      diagram.cancel();
      diagram.busy = true;
      const run = diagram.runId;
      const flowPairs = (st.flow || []).flat().map((h) => h.split('>').map((x) => x.trim()));
      const hot = new Set(st.nodes || []);
      flowPairs.forEach(([a, b]) => { hot.add(a); hot.add(b); });
      diagram.applyState({
        hot: [...hot], dim: hot.size > 0, err: st.err, warn: st.warn, ok: st.ok,
        hidden: st.hidden || sc.hidden, active: flowPairs, labels: st.labels, badges: reduced || !(st.flow || []).length ? st.badges : {}
      });
      caption.className = 'caption ' + (st.tone || sc.tone || '');
      caption.innerHTML = `<span class="n">${ix + 1}/${sc.steps.length}</span><span class="t">${st.text}</span>`;
      [...dots.children].forEach((d, k) => {
        d.classList.toggle('done', k < ix);
        d.classList.toggle('cur', k === ix);
        d.classList.toggle('paused', !playing);
      });
      const cur = dots.children[ix];
      if (cur) {
        cur.style.setProperty('--dur', stepDuration(st) + 'ms');
        cur.classList.remove('cur'); void cur.offsetWidth; cur.classList.add('cur');
        cur.classList.toggle('paused', !playing);
      }
      if (!reduced && st.flow && st.flow.length) {
        await diagram.flow(st.flow, { tone: st.tone, dur: 650 / speeds[speedIx] });
        if (run !== diagram.runId) return;
        diagram.state.badges = st.badges || {};
        diagram.drawBadges(st.badges || {});
      }
      if (playing) {
        const rest = Math.max(1700, (st.text || '').length * 30) / speeds[speedIx];
        timer = setTimeout(() => {
          if (!playing) return;
          if (ix < sc.steps.length - 1) show(ix + 1);
          else { stop(); [...dots.children].forEach((d) => d.classList.add('done')); }
        }, rest);
      }
    }
    function play() {
      if (!sc) select(0);
      if (ix >= sc.steps.length - 1 && dots.children[ix] && dots.children[ix].classList.contains('done')) ix = 0;
      playing = true; started = true;
      bPlay.textContent = '⏸'; bPlay.setAttribute('aria-label', 'Pause');
      show(ix);
    }
    function stop() {
      playing = false; clearTimeout(timer);
      bPlay.textContent = '▶'; bPlay.setAttribute('aria-label', 'Play');
      diagram.busy = false;
      [...dots.children].forEach((d) => d.classList.add('paused'));
    }
    bPlay.addEventListener('click', () => (playing ? stop() : play()));
    bPrev.addEventListener('click', () => { const was = playing; stop(); show(ix - 1); if (was) play(); });
    bNext.addEventListener('click', () => { const was = playing; stop(); show(ix + 1); if (was) play(); });
    bSpeed.addEventListener('click', () => { speedIx = (speedIx + 1) % speeds.length; bSpeed.textContent = speeds[speedIx] + '×'; });
    card.addEventListener('keydown', (e) => {
      if (e.target.closest('input,textarea')) return;
      if (e.key === 'ArrowRight') { bNext.click(); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { bPrev.click(); e.preventDefault(); }
    });
    diagram.onRerender = () => { if (sc) show(ix, true); };
    select(0);
    stop();
    // auto-play once when first scrolled into view
    if (!reduced) {
      const off = onVisible(card, (v) => { if (v && !started) { started = true; play(); off(); } }, { threshold: 0.45 });
    }
    return { select, play, stop };
  }

  /* ======================================================================
     Knobs — controls → evaluate(state) → diagram + meters + verdict
     ====================================================================== */
  function knobsSection(host, data) {
    const K = data.knobs;
    const spec = K.diagram || data.architecture;
    const card = el('div', { class: 'card diagram-card' });
    const wrap = el('div', { class: 'knobs' });
    const panel = el('div', { class: 'knob-panel' });
    const out = el('div', { class: 'knob-out' });
    const dhost = el('div');
    const outcome = el('div', { class: 'outcome' });
    const meters = el('div', { class: 'meters' });
    const verdict = el('div', { class: 'verdict' });
    const notes = el('ul', { class: 'notes' });
    outcome.append(meters, verdict, notes);
    out.append(dhost, outcome);
    wrap.append(panel, out);
    card.append(wrap);
    host.append(card);
    const diagram = new Diagram(dhost, spec);
    const state = {};
    const meterEls = {};
    let loopFlow = null; let loopTimer = 0; let visible = false;
    onVisible(card, (v) => { visible = v; }, { threshold: 0.1 });

    K.controls.forEach((c) => {
      state[c.id] = c.value != null ? c.value : (c.options ? c.options[0].v : c.min);
      const box = el('div', { class: 'knob' });
      if (c.type === 'range') {
        const o = el('output');
        const inp = el('input', { type: 'range', min: c.min, max: c.max, step: c.step || 1, value: state[c.id], 'aria-label': c.label });
        const paint = () => { o.textContent = c.fmt ? c.fmt(+inp.value) : fmt(+inp.value, c.kind, c.unit); };
        inp.addEventListener('input', () => { state[c.id] = +inp.value; paint(); update(); });
        paint();
        box.append(el('div', { class: 'kl' }, el('span', { text: c.label }), o), inp);
      } else {
        const seg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': c.label });
        c.options.forEach((op) => {
          const b = el('button', { class: state[c.id] === op.v ? 'on' : '', role: 'radio', 'aria-checked': state[c.id] === op.v, text: op.l, title: op.hint || '' });
          b.addEventListener('click', () => {
            state[c.id] = op.v;
            [...seg.children].forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
            update(true);
          });
          seg.append(b);
        });
        box.append(el('div', { class: 'kl' }, el('span', { text: c.label })), seg);
      }
      if (c.hint) box.append(el('div', { class: 'tiny', text: c.hint }));
      panel.append(box);
    });
    const reset = el('button', { class: 'btn', text: '↺ Reset to baseline' });
    reset.addEventListener('click', () => {
      // re-render panel quickly by reloading values
      K.controls.forEach((c) => { state[c.id] = c.value != null ? c.value : (c.options ? c.options[0].v : c.min); });
      panel.querySelectorAll('.knob').forEach((box, i) => {
        const c = K.controls[i];
        if (c.type === 'range') { const inp = box.querySelector('input'); inp.value = state[c.id]; inp.dispatchEvent(new Event('input')); }
        else [...box.querySelectorAll('.seg button')].forEach((b, j) => { const on = c.options[j].v === state[c.id]; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
      });
      update(true);
    });
    panel.append(reset);

    function meterColor(s) { return s < 0.4 ? 'var(--err)' : s < 0.7 ? 'var(--warn)' : 'var(--ok)'; }
    function update(flash) {
      let r;
      try { r = K.evaluate(Object.assign({}, state)) || {}; } catch (e) { console.error(e); r = {}; }
      (r.metrics || []).forEach((m) => {
        let me = meterEls[m.k];
        if (!me) {
          const v = el('div', { class: 'mv' }); const i = el('i'); const hint = el('span');
          const box = el('div', { class: 'meter' }, el('div', { class: 'mh' }, el('span', { text: m.k }), hint), v, el('div', { class: 'bar' }, i));
          meters.append(box); me = meterEls[m.k] = { v, i, hint };
        }
        me.v.textContent = m.v;
        const s = clamp(m.s == null ? 0.5 : m.s, 0, 1);
        me.i.style.width = Math.max(4, s * 100) + '%';
        me.i.style.background = meterColor(s);
        me.hint.textContent = m.hint || (s >= 0.7 ? 'good' : s >= 0.4 ? 'ok' : 'poor');
      });
      verdict.innerHTML = r.verdict || '';
      if (flash) { verdict.classList.remove('flash'); void verdict.offsetWidth; verdict.classList.add('flash'); }
      notes.innerHTML = (r.notes || []).map((n) => `<li>${n}</li>`).join('');
      diagram.applyState({ hidden: r.hide, hot: r.hot, warn: r.warn, err: r.err, ok: r.ok, labels: r.labels, badges: r.badges, active: (r.flow || []).flat().map((h) => h.split('>').map((x) => x.trim())) });
      loopFlow = r.flow || null;
      if (flash && loopFlow && !reduced) { diagram.cancel(); diagram.flow(loopFlow, { tone: r.tone }); }
    }
    function tick() {
      clearTimeout(loopTimer);
      loopTimer = setTimeout(async () => {
        if (visible && loopFlow && !reduced && !document.hidden) { await diagram.flow(loopFlow, { tone: 'info' }); }
        tick();
      }, 1600);
    }
    diagram.onRerender = () => update(false);
    update(false);
    tick();
  }

  /* ======================================================================
     Capacity calculator
     ====================================================================== */
  function calculator(host, C) {
    const card = el('div', { class: 'card' });
    const grid = el('div', { class: 'calc' });
    const left = el('div'); const right = el('div', { class: 'calc-out' });
    grid.append(left, right); card.append(grid);
    if (C.note) card.append(el('div', { class: 'calc-note', html: C.note }));
    host.append(card);
    const vals = {};
    const outs = C.outputs.map((o) => {
      const v = el('div', { class: 'v', text: '—' });
      right.append(el('div', { class: 'stat' }, v, el('div', { class: 'l', text: o.label })));
      return v;
    });
    C.inputs.forEach((inp) => {
      vals[inp.id] = inp.value;
      const o = el('output');
      const toSlider = (v) => (inp.log ? Math.round(1000 * Math.log(v / inp.min) / Math.log(inp.max / inp.min)) : v);
      const fromSlider = (s) => {
        if (!inp.log) return +s;
        const raw = inp.min * Math.pow(inp.max / inp.min, s / 1000);
        const mag = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
        return Math.round(raw / mag) * mag;
      };
      const r = el('input', { type: 'range', min: inp.log ? 0 : inp.min, max: inp.log ? 1000 : inp.max, step: inp.log ? 1 : (inp.step || 1), value: toSlider(inp.value), 'aria-label': inp.label });
      const paint = () => { o.textContent = fmt(vals[inp.id], inp.fmt, inp.unit); };
      r.addEventListener('input', () => { vals[inp.id] = fromSlider(r.value); paint(); compute(); });
      paint();
      left.append(el('div', { class: 'slider-row' }, el('label', null, el('span', { text: inp.label }), o), r));
    });
    function compute() {
      C.outputs.forEach((o, i) => {
        let v; try { v = o.f(vals); } catch (e) { v = '—'; }
        outs[i].textContent = fmt(v, o.fmt, o.unit);
      });
    }
    compute();
  }

  /* ======================================================================
     Code highlighting (tiny, dependency-free)
     ====================================================================== */
  const KW = {
    java: 'abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch synchronized this throw throws try void volatile while var record true false',
    python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
    sql: 'select from where insert into values update set delete create table index primary key references not null unique default on conflict do nothing returning begin commit rollback for skip locked limit order by group having as and or in is join left inner using with alter add constraint check bigint int integer text varchar numeric timestamptz timestamp boolean uuid serial bigserial jsonb sequence function language plpgsql returns declare end if then else case when exists interval now coalesce count sum over partition rank',
    lua: 'local function end if then else elseif return and or not nil true false for do while in',
    yaml: 'true false null',
    js: 'const let var function return if else for while new class extends import from export default async await true false null undefined this',
    go: 'func package import return if else for range go chan select defer type struct interface map var const nil true false',
    bash: 'if then fi for do done echo export'
  };
  function highlight(code, lang) {
    const kw = new Set((KW[lang] || KW.java).split(' '));
    const ci = lang === 'sql';
    const cm = lang === 'python' || lang === 'yaml' || lang === 'bash' ? '#[^\\n]*' : lang === 'sql' || lang === 'lua' ? '--[^\\n]*' : '\\/\\/[^\\n]*';
    const re = new RegExp(`(\\/\\*[\\s\\S]*?\\*\\/|${cm})|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')|(\\b\\d+(?:\\.\\d+)?[LlFf]?\\b)|(@[A-Za-z_]\\w*)|([A-Za-z_]\\w*)`, 'g');
    let out = ''; let last = 0; let m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      const [t] = m;
      if (m[1]) out += `<span class="tok-c">${esc(t)}</span>`;
      else if (m[2]) out += `<span class="tok-s">${esc(t)}</span>`;
      else if (m[3]) out += `<span class="tok-n">${esc(t)}</span>`;
      else if (m[4]) out += `<span class="tok-a">${esc(t)}</span>`;
      else out += kw.has(ci ? t.toLowerCase() : t) ? `<span class="tok-k">${esc(t)}</span>` : esc(t);
      last = m.index + t.length;
    }
    return out + esc(code.slice(last));
  }

  /* ======================================================================
     Page assembly
     ====================================================================== */
  function section(id, num, title, sub) {
    const s = el('section', { class: 'section', id });
    s.append(el('div', { class: 'section-head' },
      el('span', { class: 'section-num', text: String(num).padStart(2, '0') }),
      el('h2', { text: title }), sub ? el('div', { class: 'section-sub', html: sub }) : null));
    return s;
  }

  function buildPage(D) {
    const cat = window.SD_CATALOG || { domains: [], systems: [] };
    const meta = cat.systems.find((s) => s.slug === D.slug) || {};
    const dom = cat.domains.find((d) => d.id === (D.domain || meta.domain)) || {};
    document.title = `${D.title} — System Design Atlas`;
    const visited = store.get('sd-visited', []);
    if (!visited.includes(D.slug)) { visited.push(D.slug); store.set('sd-visited', visited); }

    const app = document.getElementById('app');
    app.innerHTML = '';
    const top = el('header', { class: 'topbar' },
      el('a', { class: 'brand', href: '../index.html' }, el('span', { class: 'brand-mark', text: '◇' }), el('span', { text: 'Design Atlas' })),
      el('span', { class: 'crumb', text: `${dom.name || ''} › ${D.title}` }),
      el('span', { class: 'spacer' }),
      themeButton());
    const nav = el('nav', { class: 'secnav', 'aria-label': 'Sections' });
    const navInner = el('div', { class: 'secnav-inner' }); nav.append(navInner);
    const main = el('main', { class: 'wrap' });
    app.append(top, nav, main);

    const secs = [];
    let num = 0;
    const add = (id, title, label, sub) => { const s = section(id, ++num, title, sub); secs.push([id, label]); main.append(s); return s; };

    /* hero */
    const hero = el('section', { class: 'hero', id: 'overview' });
    secs.push(['overview', 'Overview']);
    hero.append(el('div', { class: 'eyebrow' },
      el('span', { class: 'pill accent', text: dom.name || '' }),
      D.examples || meta.examples ? el('span', { class: 'pill', text: 'e.g. ' + (D.examples || meta.examples) }) : null,
      meta.added ? el('span', { class: 'pill new', text: '★ added beyond catalog' }) : null));
    hero.append(el('h1', { text: D.title }));
    if (D.tagline) hero.append(el('p', { class: 'tagline', html: D.tagline }));
    if (D.tldr) {
      const t = D.tldr;
      const box = el('div', { class: 'card tldr-box' },
        el('div', { class: 'tldr-item' }, el('span', { class: 'ic', text: '?' }), el('div', null, el('b', { text: 'Problem' }), el('span', { html: t.problem }))),
        el('div', { class: 'tldr-item' }, el('span', { class: 'ic', text: '!' }), el('div', null, el('b', { text: 'Core idea' }), el('span', { html: t.idea }))),
        t.insight ? el('div', { class: 'tldr-item' }, el('span', { class: 'ic', text: '★' }), el('div', null, el('b', { text: 'Interview hook' }), el('span', { html: t.insight }))) : null);
      const stats = el('div', { class: 'stats' }, (t.numbers || []).map((n) => el('div', { class: 'stat' }, el('div', { class: 'v', text: n.v }), el('div', { class: 'l', html: n.l }))));
      hero.append(el('div', { class: 'tldr' }, box, stats));
    }
    main.append(hero);

    /* requirements */
    if (D.requirements) {
      const s = add('requirements', 'Requirements', 'Requirements', 'What we must build, how well, and what we deliberately skip.');
      const R = D.requirements;
      const col = (title, items, cls) => el('div', { class: 'req-col card reveal' }, el('h3', { text: title }),
        el('div', { class: 'chips' }, (items || []).map((x, i) => { const c = el('span', { class: 'chip ' + cls, html: x }); c.style.transitionDelay = (i * 60) + 'ms'; return c; })));
      s.append(el('div', { class: 'grid g3' }, col('Functional', R.functional, 'fr'), col('Non-functional', R.nonFunctional, 'nfr'), col('Out of scope', R.outOfScope, 'oos')));
    }

    /* capacity */
    if (D.calculator) {
      const s = add('capacity', 'Back-of-the-envelope', 'Capacity', 'Drag the sliders — every number recomputes live.');
      calculator(s, D.calculator);
    }

    /* API + data model */
    if (D.api || D.dataModel) {
      const s = add('api', 'API & Data Model', 'API & Data');
      const g = el('div', { class: 'grid g2' });
      if (D.api) g.append(el('div', { class: 'card reveal' }, el('div', { class: 'api-list' },
        D.api.map((a) => el('div', { class: 'api' }, el('span', { class: 'm ' + a.m, text: a.m }), el('span', { class: 'p', text: a.p }), el('span', { class: 'd', html: a.d }))))));
      if (D.dataModel) g.append(el('div', { class: 'card reveal' }, el('div', { class: 'tables' },
        D.dataModel.map((t) => el('div', { class: 'tbl' },
          el('div', { class: 'tbl-h' }, el('b', { text: t.name }), el('span', { text: t.store })),
          t.fields.map(([f, ty, k]) => el('div', { class: 'tbl-r' },
            el('span', null, el('span', { class: 'f', text: f }), k ? el('span', { class: 'k ' + k, text: k.toUpperCase() }) : null),
            el('span', { class: 't', text: ty }))),
          t.note ? el('div', { class: 'tbl-r tiny', html: t.note }) : null)))));
      s.append(g);
    }

    /* architecture + scenarios */
    if (D.architecture) {
      const s = add('architecture', 'Architecture in motion', 'Architecture', 'Pick a scenario. Packets show the request path; tap any box for details. ← → keys step through.');
      const card = el('div', { class: 'card diagram-card' });
      const body = el('div');
      card.append(body);
      s.append(card);
      const dg = new Diagram(body, D.architecture);
      const tb = el('div', { class: 'diagram-toolbar' }, legend(D.architecture));
      card.insertBefore(tb, body);
      if (D.scenarios && D.scenarios.length) scenarioPlayer(card, dg, D.scenarios);
      else dg.startAmbient();
    }

    /* knobs */
    if (D.knobs) {
      const s = add('knobs', 'Design knobs: tweak it, see what changes', 'Knobs', D.knobs.intro || 'Change one decision at a time. The diagram, the request path and the outcome meters update instantly.');
      knobsSection(s, D);
    }

    /* widget */
    if (D.widget && SD.widgets[D.slug]) {
      const s = add('deep-dive', 'Interactive deep dive', 'Deep dive', 'A small simulation of the core mechanism. Play with it.');
      const card = el('div', { class: 'card widget-card' });
      const body = el('div', { class: 'widget-body' });
      card.append(el('div', { class: 'widget-head' }, el('h3', { text: D.widget.title }), D.widget.caption ? el('p', { html: D.widget.caption }) : null), body);
      s.append(card);
      try {
        SD.widgets[D.slug](body, { el, svg, esc, fmt: SD.fmt, reduced, loop: (cb) => makeLoop(body, cb), onVisible: (cb) => onVisible(body, cb), css: cssVar, Diagram });
      } catch (e) { console.error(e); body.append(el('p', { class: 'muted', text: 'Widget failed to load.' })); }
    }

    /* real world */
    if (D.realWorld) {
      const R = D.realWorld;
      const s = add('real-world', 'How it is actually built', 'Real world', R.intro || 'What the companies themselves have published, in order. Every card links to its source.');
      const srcLink = (i) => {
        const src = (R.sources || [])[i];
        return src ? el('a', { class: 'src', href: src.url, target: '_blank', rel: 'noopener', text: '↗ ' + src.title }) : null;
      };
      const tl = el('div', { class: 'timeline' }, (R.timeline || []).map((t, i) => {
        const it = el('div', { class: 'tl-item card' },
          el('div', { class: 'yr', text: [t.when, t.who].filter(Boolean).join(' · ') }),
          el('h4', { text: t.title }), el('p', { html: t.text }),
          t.src != null ? srcLink(t.src) : null);
        it.style.transitionDelay = (i * 90) + 'ms';
        return it;
      }));
      const tlw = el('div', { class: 'reveal' }, tl);
      s.append(tlw);
      if (R.lessons && R.lessons.length) s.append(el('div', { class: 'card reveal', style: { marginTop: '14px' } },
        el('h3', { text: 'What to steal for your design', style: { fontSize: '15px', marginBottom: '10px' } }),
        el('div', { class: 'lessons' }, R.lessons.map((l) => el('div', { class: 'lesson' }, el('span', { html: l }))))));
      if (R.sources && R.sources.length) s.append(el('div', { class: 'card reveal', style: { marginTop: '14px' } },
        el('h3', { text: 'Sources', style: { fontSize: '15px', marginBottom: '8px' } }),
        el('ol', { class: 'sources' }, R.sources.map((x) => el('li', null,
          el('a', { href: x.url, target: '_blank', rel: 'noopener', text: x.title }), x.pub ? el('span', { class: 'pub', text: ' — ' + x.pub }) : null)))));
    }

    /* trade-offs + failures */
    if (D.tradeoffs || D.failures) {
      const s = add('tradeoffs', 'Trade-offs & failure modes', 'Trade-offs');
      if (D.tradeoffs) {
        const T = D.tradeoffs;
        s.append(el('div', { class: 'tscroll reveal' }, el('table', { class: 't' },
          el('thead', null, el('tr', null, T.headers.map((h) => el('th', { text: h })))),
          el('tbody', null, T.rows.map((r) => el('tr', null, r.map((c) => el('td', { html: c }))))))));
      }
      if (D.failures) {
        s.append(el('div', { class: 'fm-cards reveal', style: { marginTop: '14px' } }, D.failures.map((f) => el('div', { class: 'fm' },
          el('h4', null, '⚠ ', f.f),
          el('dl', null, el('dt', { text: 'Detect' }), el('dd', { html: f.detect }), el('dt', { text: 'Mitigate' }), el('dd', { html: f.fix }))))));
      }
    }

    /* interview */
    if (D.interview) {
      const s = add('interview', 'Interview questions', 'Interview', 'Answer out loud first, then open the card. Turn on quiz mode to blur answers.');
      const list = el('div');
      const quizBtn = el('button', { class: 'btn', text: '◐ Quiz mode: off' });
      const openAll = el('button', { class: 'btn', text: 'Expand all' });
      let quiz = false; let all = false;
      quizBtn.addEventListener('click', () => {
        quiz = !quiz; list.classList.toggle('quiz', quiz);
        quizBtn.textContent = '◐ Quiz mode: ' + (quiz ? 'on' : 'off');
        list.querySelectorAll('.qa').forEach((q) => q.classList.remove('revealed'));
      });
      openAll.addEventListener('click', () => {
        all = !all; list.querySelectorAll('details').forEach((d) => { d.open = all; });
        openAll.textContent = all ? 'Collapse all' : 'Expand all';
      });
      s.append(el('div', { class: 'qa-bar' }, quizBtn, openAll, el('span', { class: 'tiny', text: `${D.interview.length} questions` })));
      D.interview.forEach((q, i) => {
        const ans = el('div', { class: 'ans', html: q.a + (q.fu ? `<div class="fu"><b>Follow-up:</b> ${q.fu}</div>` : '') });
        ans.addEventListener('click', () => ans.parentElement.classList.add('revealed'));
        list.append(el('details', { class: 'qa' },
          el('summary', null, el('span', { class: 'chev', text: '▸' }), el('span', { class: 'qn', text: 'Q' + (i + 1) }), el('span', { html: q.q }),
            el('span', { class: 'lvl ' + (q.lvl || 'core'), text: q.lvl === 'deep' ? 'deep dive' : (q.lvl || 'core') })),
          ans));
      });
      s.append(list);
    }

    /* code */
    if (D.code && D.code.length) {
      const s = add('code', 'Build it in your stack', 'Code', 'Small, real snippets in Java / Spring Boot, Postgres and Python.');
      const tabs = el('div', { class: 'code-tabs' });
      const box = el('div');
      const showCode = (i) => {
        const c = D.code[i];
        [...tabs.children].forEach((t, j) => t.classList.toggle('active', i === j));
        const pre = el('pre'); pre.innerHTML = highlight(c.code.replace(/^\n/, ''), c.lang);
        const copy = el('button', { class: 'icon-btn', text: 'Copy' });
        copy.addEventListener('click', () => {
          const done = () => { copy.textContent = 'Copied ✓'; setTimeout(() => (copy.textContent = 'Copy'), 1400); };
          try { navigator.clipboard.writeText(c.code).then(done, () => {}); } catch (e) { /* ignore */ }
        });
        box.innerHTML = '';
        box.append(el('div', { class: 'codebox' }, el('div', { class: 'ch' }, el('span', { text: `${c.title} · ${c.lang}` }), copy), pre, c.note ? el('div', { class: 'note', html: c.note }) : null));
      };
      D.code.forEach((c, i) => { const t = el('button', { class: 'tab', text: c.title }); t.addEventListener('click', () => showCode(i)); tabs.append(t); });
      s.append(tabs, box);
      showCode(0);
    }

    /* related + pager */
    const rel = (D.related || []).map((slug) => cat.systems.find((x) => x.slug === slug)).filter(Boolean);
    if (rel.length) {
      const s = add('related', 'Related designs', 'Related');
      s.append(el('div', { class: 'related' }, rel.map((r) => el('a', { href: r.slug + '.html', text: r.title }))));
    }
    const order = cat.systems;
    const i = order.findIndex((x) => x.slug === D.slug);
    if (i >= 0) {
      const prev = order[i - 1]; const next = order[i + 1];
      main.append(el('div', { class: 'pager' },
        prev ? el('a', { href: prev.slug + '.html' }, el('div', { class: 'dir', text: '← Previous' }), prev.title) : el('span'),
        next ? el('a', { class: 'next', href: next.slug + '.html' }, el('div', { class: 'dir', text: 'Next →' }), next.title) : null));
    }
    main.append(el('footer', { class: 'foot', html: 'System Design Atlas · numbers labelled <em>estimate</em> are back-of-envelope; everything attributed to a company links to its source.' }));

    /* section nav + scrollspy */
    const links = {};
    secs.forEach(([id, label]) => { const a = el('a', { href: '#' + id, text: label }); links[id] = a; navInner.append(a); });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((ents) => {
        ents.forEach((e) => {
          if (e.isIntersecting) {
            Object.values(links).forEach((a) => a.classList.remove('active'));
            const a = links[e.target.id]; if (a) { a.classList.add('active'); a.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' }); }
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      secs.forEach(([id]) => { const n = document.getElementById(id); if (n) io.observe(n); });
    }
    revealAll(main);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (SD.data && document.getElementById('app')) {
      try { buildPage(SD.data); } catch (e) { console.error(e); }
    }
  });
})();
