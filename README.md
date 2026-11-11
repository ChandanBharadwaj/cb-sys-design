# cb-sys-design: Design Atlas

**Live site:** https://chandanbharadwaj.github.io/cb-sys-design/

Interview prep you can watch, tweak and break. The site has two tracks that share one engine, one look and the same interactive page format:

| Track | What it covers | Where |
|---|---|---|
| **System Design** | 44 system designs: the 25 from [`Modern System Design Catalog.md`](system-design/Modern%20System%20Design%20Catalog.md) plus 19 more, including India-scale case studies (IRCTC, TTD darshan booking, Where Is My Train). | [`/system-design/`](https://chandanbharadwaj.github.io/cb-sys-design/system-design/) |
| **Architecture** | 49 architect topics in 9 pillars: laws and theorems (CAP, PACELC, Amdahl, Little, Conway…), architectural styles, business strategy and FinOps, DDD and data architecture, integration, DevOps and delivery, security, SRE, and technical leadership. The full list with subtopics is in [`Architecture Catalog.md`](architecture/Architecture%20Catalog.md). Topics marked *planned* are being written in batches. | [`/architecture/`](https://chandanbharadwaj.github.io/cb-sys-design/architecture/) |

Each page has the same sections. Architecture pages rename a few of them, shown in brackets:

| # | Section | What you get |
|---|---|---|
| 1 | Overview | Problem, core idea, interview hook, three headline numbers |
| 2 | Start here | Plain-English intro, analogy and a 3-frame animated story (naive → breaks → fix) |
| 3 | Requirements *(Principles)* | Functional / non-functional / out of scope *(core principles / quality goals / anti-patterns)* |
| 4 | Capacity *(Model it)* | Live calculator with sliders |
| 5 | API & data model *(Artefacts)* | Endpoints and tables *(ADRs, policies, SLO specs, registers)* |
| 6 | Architecture in motion | Animated diagram with step-through scenarios, including failures |
| 7 | Design knobs *(Decide)* | Change a decision and watch the diagram, path and outcome meters change |
| 8 | Deep dive | Interactive simulation of the core mechanism |
| 9 | Real world | What companies, papers and standards actually say, with links |
| 10 | Trade-offs & failure modes | What to pick when, and what breaks |
| 11 | Interview questions | 10–12 per page with answers, follow-ups and a quiz mode (behavioural STAR answers on leadership topics) |
| 12 | Build it in your stack | Java / Spring Boot, Postgres, Python, plus Terraform / YAML where relevant |

Diagrams switch to a vertical layout on phones. Animations respect `prefers-reduced-motion`. Light and dark themes are included.

## Enable GitHub Pages (one time)
1. Go to **Settings → Pages**.
2. Under **Source**, choose **Deploy from a branch**.
3. Pick the branch with this work (`main` after merging) and the folder **`/docs`**. Click **Save**.
4. After about a minute the site is live at the URL above.

Old links such as `/systems/cdn.html` still work: they redirect to `/system-design/systems/cdn.html`.

## Run locally
```bash
cd docs && python3 -m http.server 8000
# open http://localhost:8000
```
No build step and no dependencies: plain HTML, CSS, JS and SVG.

## Layout
```
system-design/Modern System Design Catalog.md   source list for the System Design track
architecture/Architecture Catalog.md            every architecture topic, subtopic and law
docs/
  index.html                       hub: pick a track
  assets/css/site.css              design tokens, light/dark, responsive layout (shared)
  assets/js/engine.js              diagram renderer, scenario player, knobs, calculator, quiz, index pages (shared)
  assets/js/catalog.js             System Design domains and systems
  assets/js/arch-catalog.js        Architecture pillars, topics and the "laws you must know" list
  system-design/index.html         System Design home (search, filters, visited ticks)
  system-design/data/*.js          one content file per system
  system-design/widgets/*.js       one interactive simulation per system
  system-design/systems/*.html     generated page shells
  architecture/index.html          Architecture home (laws strip, pillars, search)
  architecture/data/*.js           one content file per topic
  architecture/widgets/*.js        one interactive simulation per topic
  architecture/topics/*.html       generated page shells
  systems/*.html                   redirects from the old URLs
tools/
  gen_shells.py                    regenerates both tracks' shells and the redirects from the catalogs
  check.js                         Playwright smoke test (phone + desktop) for every page
  AUTHORING.md                     schema and rules for adding or editing a page (both tracks)
```

## Add a page
1. Add or update the entry in `catalog.js` or `arch-catalog.js`. For an architecture topic, remove `status: 'planned'`.
2. Write `data/<slug>.js` and `widgets/<slug>.js` in the track folder, following [`tools/AUTHORING.md`](tools/AUTHORING.md).
3. Run `python3 tools/gen_shells.py`, then `node tools/check.js [--track arch] <slug>` with the site served on port 8765.
