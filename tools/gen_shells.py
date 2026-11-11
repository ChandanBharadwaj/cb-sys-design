#!/usr/bin/env python3
"""Generate the page shells for both tracks, plus redirect stubs for the old URLs.

  docs/system-design/systems/<slug>.html   from docs/assets/js/catalog.js       (track 'sd')
  docs/architecture/topics/<slug>.html     from docs/assets/js/arch-catalog.js  (track 'arch'; planned topics are skipped)
  docs/systems/<slug>.html                 redirect stubs to the system-design pages (old URLs keep working)

Each shell only loads the shared engine, both catalogs, the page's data file and its widget.
Run from the repo root:  python3 tools/gen_shells.py   (needs node to read the catalogs)
"""
import html
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

READ_CATALOGS = """
global.window = {};
require(process.argv[1] + '/assets/js/catalog.js');
require(process.argv[1] + '/assets/js/arch-catalog.js');
const out = {};
for (const [id, c] of Object.entries(window.SD_TRACKS)) out[id] = { track: c.track, systems: c.systems };
console.log(JSON.stringify(out));
"""
tracks = json.loads(subprocess.check_output(["node", "-e", READ_CATALOGS, str(DOCS)], text=True))

TEMPLATE = """<!doctype html>
<html lang="en" data-track="{track}" data-root="../../">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — {brand}</title>
<meta name="description" content="{desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/css/site.css">
<script>try{{var t=JSON.parse(localStorage.getItem('sd-theme')||'"light"');if(t!=='auto')document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}}catch(e){{document.documentElement.setAttribute('data-theme','light')}}</script>
</head>
<body>
<div id="app"><noscript>This page needs JavaScript for its diagrams and animations.</noscript></div>
<script src="../../assets/js/catalog.js"></script>
<script src="../../assets/js/arch-catalog.js"></script>
<script src="../../assets/js/engine.js"></script>
<script src="../data/{slug}.js"></script>
<script src="../widgets/{slug}.js"></script>
</body>
</html>
"""

DESC = {
    "sd": "Animated, research-backed system design: {title} ({examples}). Architecture, scenarios, design knobs, real-world implementation and interview questions.",
    "arch": "Software architecture, explained and animated: {title} ({examples}). Principles, decision knobs, real-world cases and architect interview questions.",
}

REDIRECT = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved: {title}</title>
<link rel="canonical" href="../system-design/systems/{slug}.html">
<meta http-equiv="refresh" content="0; url=../system-design/systems/{slug}.html">
<script>location.replace('../system-design/systems/{slug}.html' + location.search + location.hash);</script>
</head>
<body>
<p>This page moved to <a href="../system-design/systems/{slug}.html">{title}</a>.</p>
</body>
</html>
"""

counts = {}
for tid, c in tracks.items():
    t = c["track"]
    out = DOCS / t["dir"] / t["pageDir"]
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    for s in c["systems"]:
        if s.get("status") == "planned":
            continue
        title = html.escape(s["title"])
        examples = html.escape(s.get("examples", ""))
        (out / f"{s['slug']}.html").write_text(TEMPLATE.format(
            track=tid, slug=s["slug"], title=title, brand=html.escape(t["brand"]),
            desc=DESC.get(tid, DESC["sd"]).format(title=title, examples=examples)))
        n += 1
    counts[tid] = n

legacy = DOCS / "systems"
legacy.mkdir(exist_ok=True)
for s in tracks["sd"]["systems"]:
    (legacy / f"{s['slug']}.html").write_text(REDIRECT.format(slug=s["slug"], title=html.escape(s["title"])))

print("wrote shells:", ", ".join(f"{k}={v}" for k, v in counts.items()), f"+ {len(tracks['sd']['systems'])} redirects")
