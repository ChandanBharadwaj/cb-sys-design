#!/usr/bin/env python3
"""Set `one:` (what-problem-it-solves line) for catalog entries.
usage: python3 tools/set_oneliners.py < lines   (each line: slug: text)"""
import pathlib, re, sys
p = pathlib.Path(__file__).resolve().parent.parent / "docs/assets/js/catalog.js"
s = p.read_text()
for line in sys.stdin:
    if ":" not in line: continue
    slug, text = line.split(":", 1)
    slug, text = slug.strip().strip('-* `'), text.strip().replace("\\", "\\\\").replace("'", "\\'")
    pat = re.compile(r"(\{ slug: '" + re.escape(slug) + r"', domain: \d+, title: '[^']+',)( one: '(?:[^'\\]|\\.)*',)?")
    s, n = pat.subn(lambda m: m.group(1) + " one: '" + text + "',", s)
    print(("ok   " if n else "MISS ") + slug)
p.write_text(s)
