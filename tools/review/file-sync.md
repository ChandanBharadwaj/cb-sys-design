# file-sync review

- Widget: added a phone layout (360-wide viewBox, 14–14.5-unit titles and messages, 40-unit bars, hash labels only where a chunk is wide enough) switched via `ctx.narrow` / `ctx.onResize`; the colour legend moves to HTML on phones. Chunking algorithm, seeds and buttons unchanged; desktop layout identical. Fonts on phone: min 7.7 / p25 7.7 px → min 12.3 / p25 13.2 px.
- Widget label fix: the CDC bar said "avg ≈ 512 B", but with MIN = 128 and a 1/512 cut probability the measured average is ≈ 615 B; label and code comment now say ≈ 600 B.
- Real world: added the LBFS paper (SOSP 2001, Rabin-fingerprint content-defined chunking), Harnik/Pinkas/Shulman-Peleg 2010 (dedup side channel, via its DOI) and Dropbox's Edgestore post (Aug 2016, metadata store on sharded MySQL). These were the flagged missing citations.
- Conflicted copy: the scenario now names the file the way Dropbox does (editor name + "conflicted copy" + date), and the Dropbox Help Center page is cited as a source.
- Dropbox 2014 "~25% faster" claim checked: it was a two-machine test (best case up to 2×); the card now says so. Broccoli numbers (~33% upload bandwidth, ~35% median latency) verified and left alone.
- Removed the InfoQ "testing sync" source, which duplicated Dropbox's own post and was not referenced; timeline src indices renumbered.
- Glossary "Block" now covers both fixed-size and content-defined chunks, matching the knobs and widget.
- Interview: added "rename a 10 GB folder: what gets uploaded?" (metadata-only commit, move detection, cross-namespace moves); the dedup-security answer now cites the 2010 paper, proofs of ownership, and convergent encryption vs E2E. CDC answer credits LBFS.
- Code: Python CDC snippet run (prints "1 new chunks"); the Java blocklist method was compiled and run with JDK 17+ in isolation (the Spring RestClient part needs Spring, so it was not run). No bugs found.
- Left alone: knobs (every option already moves a meter; numbers consistent), calculator (all inputs labelled estimates), architecture and other scenarios.
