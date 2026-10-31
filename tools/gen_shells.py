#!/usr/bin/env python3
"""Generate docs/systems/<slug>.html shells from docs/assets/js/catalog.js.

Each shell only loads the shared engine, the system's data file and its widget.
Run from the repo root:  python3 tools/gen_shells.py
"""
import html
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
cat = (DOCS / "assets/js/catalog.js").read_text()

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — System Design Atlas</title>
<meta name="description" content="Animated, research-backed system design: {title} ({examples}). Architecture, scenarios, design knobs, real-world implementation and interview questions.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/site.css">
<script>try{{var t=JSON.parse(localStorage.getItem('sd-theme')||'"light"');if(t!=='auto')document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}}catch(e){{document.documentElement.setAttribute('data-theme','light')}}</script>
</head>
<body>
<div id="app"><noscript>This page needs JavaScript for its diagrams and animations.</noscript></div>
<script src="../assets/js/catalog.js"></script>
<script src="../assets/js/engine.js"></script>
<script src="../data/{slug}.js"></script>
<script src="../assets/js/widgets/{slug}.js"></script>
</body>
</html>
"""

pat = re.compile(r"slug: '([^']+)', domain: (\d+), title: '([^']+)',(?: one: '(?:[^'\\]|\\.)*',)? examples: '([^']+)'")
out = DOCS / "systems"
out.mkdir(parents=True, exist_ok=True)
n = 0
for slug, _dom, title, examples in pat.findall(cat):
    (out / f"{slug}.html").write_text(
        TEMPLATE.format(slug=slug, title=html.escape(title), examples=html.escape(examples))
    )
    n += 1
print(f"wrote {n} shells")
