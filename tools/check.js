// Smoke-test every page at phone and desktop sizes with Playwright.
// Serve docs/ first:  cd docs && python3 -m http.server 8765 --bind 127.0.0.1
// usage: node tools/check.js [--noshot] [slug ...]
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const DOCS = path.join(__dirname, '..', 'docs');
const BASE = 'http://127.0.0.1:8765/';
const OUT = path.join(__dirname, '..', '.shots'); fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const full = args.includes('--full'); const requireIntro = args.includes('--require-intro'); const slugs0 = args.filter(a => !a.startsWith('--'));
const slugs = slugs0.length ? slugs0 : fs.readdirSync(path.join(DOCS, 'data')).map(f => f.replace('.js', ''));
(async () => {
  const browser = await chromium.launch();
  const sizes = [['phone', 390, 844], ['desk', 1440, 900]];
  const report = [];
  for (const [name, w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    for (const slug of ['__index__', ...slugs]) {
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
      page.on('requestfailed', r => { if (!r.url().includes('fonts.')) errs.push('reqfail: ' + r.url()); });
      const url = slug === '__index__' ? BASE + 'index.html' : BASE + 'systems/' + slug + '.html';
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(600);
      const info = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth, iw = window.innerWidth;
        // find elements overflowing horizontally
        const wide = [];
        document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > iw + 1 && r.width > 0 && getComputedStyle(e).position !== 'fixed') { if (!e.closest('.tscroll,.secnav-inner,.scen-tabs,pre,.ix-net,.w-log')) wide.push(e.tagName + '.' + e.className); } });
        return { sw, iw, wide: wide.slice(0, 6), sections: [...document.querySelectorAll('section.section')].map(s => s.id) };
      });
      let interact = {};
      if (slug !== '__index__') {
        interact = await page.evaluate(async () => {
          const out = { scen: 0, knobs: 0, knobChanges: 0 };
          const tabs = document.querySelectorAll('#architecture .tab');
          out.scen = tabs.length;
          // click through all scenario steps quickly via next button
          for (const t of tabs) { t.click(); await new Promise(r => setTimeout(r, 80)); const dots = t.closest('.card').querySelectorAll('.dot'); for (const d of dots) { d.click(); await new Promise(r => setTimeout(r, 40)); } }
          const v0 = document.querySelector('#knobs .verdict')?.innerHTML;
          const btns = document.querySelectorAll('#knobs .seg button');
          out.knobs = btns.length;
          let prev = document.querySelector('#knobs .outcome')?.innerText;
          for (const b of btns) { b.click(); await new Promise(r => setTimeout(r, 30)); const now = document.querySelector('#knobs .outcome').innerText; if (now !== prev) out.knobChanges++; prev = now; }
          document.querySelectorAll('#knobs input[type=range]').forEach(r => { r.value = r.max; r.dispatchEvent(new Event('input')); r.value = r.min; r.dispatchEvent(new Event('input')); });
          document.querySelectorAll('#capacity input[type=range]').forEach(r => { r.value = r.max; r.dispatchEvent(new Event('input')); });
          out.calcBad = [...document.querySelectorAll('#capacity .calc-out .v')].map(v => v.textContent).filter(t => /NaN|undefined|Infinity|—/.test(t));
          out.widget = !!document.querySelector('#deep-dive .widget-body')?.children.length;
          out.iq = document.querySelectorAll('#interview .qa').length;
          out.theme = document.documentElement.getAttribute('data-theme');
          const intro = document.querySelector('#intro');
          out.intro = !!intro;
          if (intro) {
            out.storyFrames = intro.querySelectorAll('.story-step').length;
            for (const b of intro.querySelectorAll('.story-step')) { b.click(); await new Promise(r => setTimeout(r, 120)); }
            out.storySvgs = intro.querySelectorAll('.story-pane svg').length;
            out.gloss = intro.querySelectorAll('.glossary .term').length;
            out.what = (intro.querySelector('.intro-what .lead')?.textContent || '').trim().length;
            out.problem = (intro.querySelector('.problem-callout p')?.textContent || '').trim().length;
          }
          const sw = document.querySelectorAll('.theme-switch button');
          if (sw.length === 3) { sw[1].click(); out.darkOk = document.documentElement.getAttribute('data-theme') === 'dark'; sw[0].click(); out.lightBack = document.documentElement.getAttribute('data-theme') === 'light'; }
          out.src = document.querySelectorAll('#real-world .sources a').length;
          return out;
        });
        // reset scroll+reload for clean screenshot
        await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(400);
      }
      if (!args.includes('--noshot') && (full || slugs0.length)) {
        // scroll through to trigger reveals then shoot
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); } window.scrollTo({ top: 0, behavior: 'instant' }); });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `${slug}-${name}.png`), fullPage: true });
        for (const sec of ['intro', 'architecture', 'knobs', 'deep-dive']) {
          const loc = page.locator('#' + sec);
          if (await loc.count()) { await loc.scrollIntoViewIfNeeded(); await page.waitForTimeout(2200); await loc.screenshot({ path: path.join(OUT, `${slug}-${name}-${sec}.png`) }); }
        }
      }
      report.push({ slug, size: name, overflow: info.sw > info.iw ? info.sw - info.iw : 0, wide: info.wide, errs: errs.slice(0, 5), ...interact });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  let bad = 0;
  for (const r of report) {
    const problems = [];
    if (r.overflow) problems.push('overflow ' + r.overflow + 'px ' + r.wide.join(','));
    if (r.errs.length) problems.push('errors: ' + r.errs.join(' | '));
    if (r.slug !== '__index__') {
      if (!r.scen) problems.push('no scenarios');
      if (r.knobs && r.knobChanges < Math.min(2, r.knobs - 1)) problems.push('knobs do not change outcome');
      if (r.calcBad && r.calcBad.length) problems.push('calc: ' + r.calcBad.join(','));
      if (!r.widget) problems.push('no widget');
      if ((r.iq || 0) < 8) problems.push('only ' + r.iq + ' interview qs');
      if ((r.src || 0) < 3) problems.push('only ' + r.src + ' sources');
      if (r.theme !== 'light') problems.push('default theme is ' + r.theme);
      if (!r.darkOk || !r.lightBack) problems.push('theme switch broken');
      if (requireIntro && !r.intro) problems.push('no intro');
      if (r.intro && (r.storyFrames !== 3 || r.storySvgs !== 3 || r.gloss < 5 || r.what < 40 || r.problem < 40)) problems.push(`intro incomplete (frames ${r.storyFrames}, svgs ${r.storySvgs}, glossary ${r.gloss}, what ${r.what}, problem ${r.problem})`);
    }
    if (problems.length) bad++;
    console.log((problems.length ? '✗ ' : '✓ ') + r.slug + ' [' + r.size + ']' + (problems.length ? ' — ' + problems.join(' ; ') : ` scen=${r.scen ?? '-'} knobs=${r.knobs ?? '-'}/${r.knobChanges ?? '-'} iq=${r.iq ?? '-'} src=${r.src ?? '-'}`));
  }
  console.log(bad ? `${bad} page-size combos with problems` : 'ALL OK');
})();
