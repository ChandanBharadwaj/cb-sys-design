# cb-sys-design: System Design Atlas

**Live site:** https://chandanbharadwaj.github.io/cb-sys-design/

The site contains 41 system designs: the 25 from [`Modern System Design Catalog.md`](Modern%20System%20Design%20Catalog.md) plus 16 more. Each one is an animated page you can interact with. Every page has the same 11 sections:

| # | Section | What you get |
|---|---|---|
| 1 | Overview | Problem, core idea, interview hook, three headline numbers |
| 2 | Requirements | Functional, non-functional and out-of-scope items |
| 3 | Capacity | Live back-of-the-envelope calculator with sliders |
| 4 | API & data model | Endpoints and table/key layouts |
| 5 | Architecture in motion | Animated diagram with step-through scenarios, including failures |
| 6 | Design knobs | Change a decision and watch the diagram, request path and outcome meters change |
| 7 | Deep dive | Interactive simulation of the core algorithm (H3 k-ring, Count-Min, HNSW, PagedAttention…) |
| 8 | Real world | How Uber, Netflix, Stripe, Discord and others built it, with links to their papers and blogs |
| 9 | Trade-offs & failure modes | What to pick when, and what breaks |
| 10 | Interview questions | 10–12 per system, with answers, follow-ups and a quiz mode |
| 11 | Build it in your stack | Short Java / Spring Boot, Postgres and Python snippets |

Diagrams switch to a vertical layout on phones. Animations respect `prefers-reduced-motion`. Light and dark themes are included.

## Enable GitHub Pages (one time)
1. Go to **Settings → Pages**.
2. Under **Source**, choose **Deploy from a branch**.
3. Pick the branch with this work (`ccr-2d4f1161-gbi54h`, or `main` after merging) and the folder **`/docs`**. Click **Save**.
4. After about a minute the site is live at the URL above.

## Run locally
```bash
cd docs && python3 -m http.server 8000
# open http://localhost:8000
```
No build step and no dependencies: plain HTML, CSS, JS and SVG.

## Layout
```
docs/
  index.html                 landing page (search, filters, visited ticks)
  assets/css/site.css        design tokens, light/dark, responsive layout
  assets/js/engine.js        diagram renderer, scenario player, knobs, calculator, quiz
  assets/js/catalog.js       list of domains and systems
  assets/js/widgets/*.js     one interactive simulation per system
  data/*.js                  one content file per system
  systems/*.html             generated page shells
tools/
  gen_shells.py              regenerates docs/systems/*.html from catalog.js
  AUTHORING.md               schema and rules for adding or editing a system page
```
