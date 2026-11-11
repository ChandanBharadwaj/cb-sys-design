# Authoring a page

The site has two tracks that share one engine (`docs/assets/js/engine.js`) and one stylesheet:

| Track | Catalog | Data file | Widget file | Generated shell |
|---|---|---|---|---|
| System Design | `docs/assets/js/catalog.js` | `docs/system-design/data/<slug>.js` | `docs/system-design/widgets/<slug>.js` | `docs/system-design/systems/<slug>.html` |
| Architecture | `docs/assets/js/arch-catalog.js` | `docs/architecture/data/<slug>.js` | `docs/architecture/widgets/<slug>.js` | `docs/architecture/topics/<slug>.html` |

Each page is **one data file plus one widget file**. The data file calls `SD.register({...})`; the widget calls `SD.widget('<slug>', (root, ctx) => {...})`. Shells are generated: `python3 tools/gen_shells.py` (it also writes the redirect stubs in `docs/systems/`).

The reference implementation is `docs/system-design/data/ride-sharing.js` and `docs/system-design/widgets/ride-sharing.js`. Read both before writing a page and match their depth and tone. Architecture pages follow the extra rules in **Architecture topic pages** at the end of this file.

Do **not** edit `engine.js`, `site.css`, the catalogs, the shells, or another page's files. If the engine can't do something you need, work around it inside your widget and mention it in your report.

---

## Data schema (`SD.register`)

```js
SD.register({
  slug, domain, title, examples,          // same as catalog.js
  tagline: 'one sentence, HTML ok',
  tldr: { problem, idea, insight, numbers: [{ v: '~4 s', l: 'what it is (source/estimate)' } ×3] },
  requirements: { functional: [..6], nonFunctional: [..6], outOfScope: [..3-4] },
  calculator: {
    inputs:  [{ id, label, min, max, value, step?, unit?, log?: true, fmt?: 'bytes'|'num' }],   // 4–6
    outputs: [{ label, f: (v) => number|string, fmt?: 'num'|'bytes'|'bytesps'|'bits'|'ms'|'pct'|'raw', unit? }], // 5–6
    note: 'HTML. Mark assumptions as <em>estimate</em>.'
  },
  api:       [{ m: 'GET|POST|PUT|PATCH|DELETE|WS|SSE|RPC|UDP|SQL', p: '/path', d: 'HTML' }],      // 4–6
  dataModel: [{ name, store, fields: [['col', 'type', 'pk'|'sk'|'idx'|'fk'|undefined]], note? }],  // 2–4
  architecture: { title, nodes: [...], edges: [...], groups?: [...] },
  scenarios: [{ id, title, tone: 'info'|'ok'|'warn'|'err', steps: [step...] }],                 // 4–5
  knobs: { intro?, diagram?, controls: [...], evaluate(state) { return {...} } },
  widget: { title, caption },
  realWorld: { intro?, timeline: [{ when, who, title, text, src: <index into sources> }], lessons: [...], sources: [{ title, url, pub }] },
  tradeoffs: { headers: [...], rows: [[...]] },           // 4–6 rows, HTML allowed in cells
  failures: [{ f, detect, fix }],                         // 5–7
  interview: [{ q, a: 'HTML', fu?: 'follow-up', lvl: 'core'|'deep' }],   // 10–12
  code: [{ title, lang: 'java'|'sql'|'python'|'lua'|'yaml'|'js'|'go'|'bash', code: `...`, note? }], // 2–3
  related: ['slug', ...]                                  // 3–6 slugs from catalog.js
});
```

### Diagram nodes and edges
```js
{ id: 'gw', label: 'Gateway', sub: 'WebSocket / API', kind: 'edge', wide: [x, y], tall: [x, y], tip: 'tooltip text' }
// kind: client | edge | service | store | queue | cache | compute | external | ml
{ from: 'a', to: 'b', bidi?: true, dashed?: true, bend?: 0.2, label?: 'short' }
```

**Coordinates are box centres.**
- **Wide canvas:** 1000 units wide. Default node size is 150×58.
  - Keep centres in a row **≥ 190 apart**, and rows **≥ 105 apart**.
  - Usable x range is 85–915.
- **Tall canvas (phones, <640px):** 420 units wide. Default node size is 128×50.
  - Use columns **x = 70 / 210 / 350** (3 per row) or **105 / 315** (2 per row).
  - Rows **≥ 105 apart**.
  - The tall layout is a vertical story, top → bottom.
- Every node needs both `wide` and `tall` positions.
- Aim for 8–13 nodes.
- Keep `label` ≤ 18 characters and `sub` ≤ 24 characters. Longer text is squeezed.
- Avoid edges that pass through other boxes. Reposition the boxes, or use `bend`.

### Scenario steps
```js
{ text: 'HTML, ≤ 220 chars, one idea per step',
  flow: ['a>b', 'b>c', ['c>d', 'c>e']],   // sequential hops; an inner array runs hops in parallel
  nodes: ['x'],                            // extra nodes to highlight
  ok: [], warn: [], err: [],               // node tones
  badges: { nodeId: 'text' | ['text', 'ok'|'warn'|'err'|'info'] },  // bubbles shown after the flow
  labels: { nodeId: { label?, sub? } },    // temporary relabel
  hidden: ['nodeId'],                      // hide nodes for this step
  tone: 'ok'|'warn'|'err' }
```
- Write 4–5 scenarios, each with 3–6 steps.
- At least one scenario must be a failure (`tone: 'err'`), and at least one must cover scale or a hot spot.
- Hops should follow existing edges. A hop without an edge is drawn as a temporary dashed line.

### Knobs
```js
controls: [
  { id, label, type: 'seg', value, options: [{ v, l, hint? }] },
  { id, label, type: 'range', min, max, step, value, unit?, kind?: 'num'|'ms'|'bytes'|'pct', fmt?: (v) => string }
],
evaluate(s) {   // s = { id: value } for every control
  return {
    metrics: [{ k: 'Latency p99', v: '≈ 40 ms', s: 0..1 /* goodness: 1 = good */, hint?: 'short' }], // 5–7, same k every time
    verdict: 'HTML. One sentence starting with ✅ / 👍 / ⚠ / ❌',
    notes: ['HTML bullet', ...],             // 1–4, specific to the current choice
    labels: { nodeId: { label, sub } },      // e.g. show the chosen algorithm on its node
    hide: ['nodeId'],                        // optional nodes that only exist for some choices
    hot: [], warn: [], err: [], ok: [],
    badges: { nodeId: ['text', 'tone'] },
    flow: ['a>b', ...]                       // request path for this configuration (looped)
  };
}
```
- Write 3–5 controls. **Every option must change the meters or the verdict.**
- Base the numbers on real reasoning. When they are illustrative, say so in a note.
- If a choice adds a component, put it in `knobs.diagram`, a copy of the architecture with extra nodes. See the IIFE at the end of `ride-sharing.js`, which builds this after `SD.register`. Then hide that component in `hide` when it is unused.
- Use the same metric keys every time, because meters are created once and reused.

### Widget (`SD.widget(slug, (root, ctx) => {...})`)
`ctx` provides:
- `el(tag, attrs, ...kids)` and `svg(tag, attrs, ...kids)`: DOM helpers. `attrs` supports `class`, `text`, `html`, `style` (object), and `onclick`.
- `loop(cb(dt, t))`: an rAF loop that runs only while the widget is on screen. It returns `{ stop }`.
- `onVisible(cb(bool))`, `reduced` (prefers-reduced-motion), `fmt.num/bytes/dur`, and `css('--var')`.

Rules:
- Implement the **real** mechanism: real Count-Min hashing, the real Bloom false-positive formula, real Snowflake bit packing, real BM25, and so on.
- Draw in an SVG with a `viewBox` about 500 wide so it scales from 360px to 1100px. Put controls in `.w-controls`. Use `.btn` / `.btn.primary`, `.w-stats > .w-stat`, `.w-log`, and theme colours via CSS vars (`var(--accent)`, `--ok`, `--warn`, `--err`, `--surface-2`, `--border`, `--text-3`).
- Keep it to about 120–260 lines. No external libraries. No globals besides `SD.widget`.
- If `ctx.reduced` is true, skip motion but keep the widget interactive.

---

## Research and correctness rules (most important)
- Use **WebSearch** to find what real companies published: engineering blogs, papers and talks. **WebFetch is blocked** in this environment; search results include the snippets you need.
- Each `realWorld.timeline` item must link to a source (`src` index). Sources must be **real URLs that appeared in search results**. Prefer the canonical URL (for example `https://www.uber.com/blog/h3/` rather than regional copies) and official or primary sources over aggregators.
- A **number attributed to a company must appear in a source.** Otherwise drop it or label it `estimate`.
- Hedge where sources disagree, and give the year of each figure ("in 2015", "as of 2023").
- Interview answers must be technically correct. Choose clear, standard explanations over clever ones.
- Code must be correct for current library versions (Spring Boot 3, Java 17+, Postgres 15+, Python 3.11+). Keep each snippet to 15–45 lines.

## Style
- Visual first, words second. Use short sentences and **bold** key terms.
- HTML is allowed in text fields (`<b> <i> <code> <em> <br> <ul><li>`).
- Write strings with single quotes and escape apostrophes (`\'`), or use template literals for long text.

## Verify before you finish
1. Make sure the local server is running: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8765/index.html`. If it isn't, start it with `cd docs && python3 -m http.server 8765 --bind 127.0.0.1 &`.
2. Run `node tools/check.js <slug> [<slug>...]` (add `--track arch` for architecture pages). Every line must start with ✓, at both phone and desktop sizes: no console errors, no horizontal overflow, scenarios and knobs work, and there are ≥ 8 interview questions and ≥ 3 sources.
3. **Look at the screenshots** with the Read tool: `.shots/<slug>-phone-architecture.png`, `-desk-architecture.png`, `-phone-knobs.png` and `-phone-deep-dive.png`. Fix overlapping boxes, cramped tall layouts and unreadable widgets.
4. Do not run git commands. The coordinator commits.

---

## The `intro` block ("Start here" section)

Every page starts with a beginner-friendly section. Put `intro` right after `tldr` in the data file. The reference is `docs/system-design/data/ride-sharing.js`; read its `intro` first and match its tone and depth.

```js
intro: {
  what: 'Plain-English definition. 2–3 short sentences. Say what the system IS and what it DOES for its users.',
  analogy: { icon: '🚕', title: 'A short everyday comparison', text: '3–4 sentences mapping the analogy onto the real system.' },
  problem: 'What goes wrong without it. Use one concrete scenario. 2–4 sentences. Bold the core question it answers.',
  story: [   // exactly 3 frames, in this order
    { stage: 'naive',  title: '…', text: 'The obvious first design and why people try it.', scene: {...} },
    { stage: 'breaks', title: '…', text: 'What breaks at scale or under failure, concretely.', scene: {...} },
    { stage: 'fix',    title: '…', text: 'The key idea of the real design, in plain words.', scene: {...} }
  ],
  usedBy: ['Well-known product or company', ...],   // 4–7 items; only well-known, uncontroversial public uses
  whenToUse: ['…', '…', '…'],                       // exactly 3
  whenNot:   ['…', '…', '…'],                       // exactly 3; link related pages: <a href="slug.html">Title</a>
  glossary: [{ term: '…', def: 'One sentence.' }]  // 6–8 terms that appear later on the page
}
```

### Story scenes (mini animated diagrams)
- `scene: { nodes, edges, flow, err?, warn?, ok?, badges?, hot? }`, using the same node/edge/flow/badge format as the architecture diagram.
- Nodes use **`at: [x, y]`** on a single compact canvas **420 units wide**. Node size is 128×50.
  - **Columns:** x = **70 / 210 / 350**.
  - **Rows:** y = 0, 110, 220 (max 3 rows).
  - **Nodes:** at most **7**, ideally 3–5.
  - **Text:** labels ≤ 14 chars, subs ≤ 18 chars.
- **Tone:** the `breaks` frame should show the failure (`err` / `warn` nodes, red badges such as `['overloaded', 'err']`). The `fix` frame should show the remedy (`ok` nodes, a green badge).
- **Flow:** the `flow` loops while the frame is visible, so keep it to 2–5 hops. Use an inner array for parallel hops: `[['a>b', 'c>b']]`.
- **Continuity:** reuse node ids across frames so the reader sees the same picture evolve.

### Writing style for the intro
- Write for a smart developer who has **never** studied this system. Define every term the first time it appears, and avoid acronyms there.
- Short sentences, active voice. Bold only the 2–3 phrases that matter.
- **No company-specific numbers in the intro.** Those live in "Real world" with sources. The intro is conceptual, so it needs little or no web search.
- Be accurate. The analogy must not imply something technically false. If the analogy breaks down somewhere important, say so in one clause.

---

## Widget readability on phones (required)

`node tools/check.js --fonts <slug>` measures the **on-screen** size of every SVG text in the deep-dive widget at 390px. It fails when:
- any text is below **11px**, or
- fewer than **75%** of texts are at least **12px**.

On a phone the widget body is only about **340px wide**. On-screen size is `font units × (340 / viewBox width)`, so:
- a 360-wide viewBox needs **≥ 13-unit** text (about 12.3px), and 14–15 units is better;
- a 500-wide viewBox would need about 18-unit text, so do not use one on phones.

Use the engine helpers:
- `ctx.narrow` is true when the widget body is < 520px wide (phones and small tablets).
- `ctx.onResize(cb)` calls `cb(narrow)` when the width crosses that threshold, so you can rebuild the layout.

Patterns that work:
- **Two layouts.** Build the SVG from a function `draw(narrow)`. Use a viewBox about 360 wide on phones with larger fonts, and the wider desktop layout otherwise. Call it again from `ctx.onResize`.
- **Stack on phones.** Put side-by-side panels (e.g. "naive vs correct") one above the other.
- **Move long text out of the SVG.** Put long labels, legends and explanations in HTML (`.w-stats`, `.w-log`, a caption). HTML text is never scaled down.
- **Fewer, bigger cells.** Reduce how many items you draw on phones rather than shrinking them, e.g. 6 grid rows instead of 12, or 8 bars instead of 20.
- Keep every control reachable with no horizontal scroll. The `.w-controls` row wraps.

---

## Architecture topic pages

Architecture topics use the **same schema and the same quality bar** as system pages. A topic is a concept (CAP, strangler fig, OAuth, SLOs, Conway's Law), so some fields are reinterpreted. The engine already renames the sections for the architecture track (see `track.sections` in `arch-catalog.js`); you only fill the data.

| Field | On an architecture page it holds |
|---|---|
| `tldr` | Problem, core idea, interview hook, 3 headline numbers (sourced or marked *estimate* / *rule of thumb*). |
| `intro` | Exactly as for system pages: plain-English definition, analogy, problem, 3-frame story (naive → breaks → fix), when/when-not, glossary. |
| `requirements` | Rendered as **Principles & quality attributes**. `functional` = core principles (6), `nonFunctional` = quality goals this buys, with measurable targets where possible (6), `outOfScope` = **anti-patterns** (3–5). |
| `calculator` | **Model it**: the topic's real math (TCO break-even, error budget minutes, burn rate, quorum overlap, availability of a chain, migration waves…). 4–6 inputs, 5–6 outputs. |
| `api` | **Contracts & artefacts**: the things an architect writes. Use `m` as a short type badge: `ADR`, `RFC`, `POLICY`, `SLO`, `YAML`, `HTTP`, `GET`/`POST`, `SQL`, `EVENT`, `DOC`. `p` = artefact name, `d` = what goes in it. 4–6 entries. |
| `dataModel` | 2–4 tables: the records behind the practice (risk register, decision log, SLO definition, token claims, migration checkpoint table…). |
| `architecture` + `scenarios` | Animated diagram of the mechanism or the organisation. Node kinds `team`, `person` and `policy` are available for people, roles and decision points. Same layout rules (wide + tall positions). 4–5 scenarios, ≥ 1 failure, ≥ 1 at scale or under pressure. |
| `knobs` | **Decision knobs**: the real choices (e.g. build/buy/OSS, CP/AP, breaker thresholds, team topology). Meters are outcomes such as cost, time to market, risk, coupling, latency, availability, cognitive load. Every option must move the meters or the verdict. |
| `widget` | An interactive simulation of the real mechanism, same readability rules as system pages. |
| `realWorld` | What real organisations published (engineering blogs, papers, books, standards: Google SRE book, NIST, RFCs, Thoughtworks, Martin Fowler, AWS Builders' Library…). Real URLs from search results only. |
| `tradeoffs`, `failures` | Trade-off table; `failures` = anti-patterns and failure modes, each with *Detect* and *Mitigate*. |
| `interview` | 10–12 questions an **architect** interview asks: definitions, "what would you choose and why", scenario/design questions, and how you would convince others. For leadership topics, include 3–4 **behavioural** questions answered in a STAR outline (Situation, Task, Action, Result) with concrete, realistic detail. |
| `code` | 2–3 snippets in the reader's stack: Java 21 / Spring Boot 3, Postgres, Python 3.11+, plus Terraform, Kubernetes YAML, Rego or an ADR/markdown template where that is the real artefact (`lang: 'yaml'`, `'bash'`, `'sql'`, `'java'`, `'python'`, `'js'`). |
| `related` | Same-track slugs from `arch-catalog.js` (**planned topics are fine**, they are hidden until written) and system-design pages as `'sd:<slug>'`, e.g. `'sd:rate-limiter'`. 4–7 entries. |

Rules specific to architecture pages:
- Quote laws and definitions **precisely**, with who and when (e.g. "Gilbert and Lynch proved CAP in 2002"). Point out common misreadings.
- Prefer primary sources: the original paper, the RFC, the NIST publication, the book's own site, the company's own engineering blog.
- Numbers that are rules of thumb must say so. Do not invent survey statistics.
- Keep the tone practical: always end with **how you would decide** and **what you would say in the interview**.
- Run `node tools/check.js --track arch --fonts <slug>` and look at the screenshots, same as system pages.
