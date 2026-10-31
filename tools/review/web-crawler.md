# web-crawler review

- **Widget, phone:** added a 360-wide layout chosen by `ctx.narrow` and rebuilt via `ctx.onResize`. It has 16 Bloom-bit columns of 21 units instead of 32 × 15, 15-unit titles, and two-line host lanes: host plus queue head on one line, the queued/fetched count on the next. The desktop layout is unchanged. Fonts went from min 8.2 / p25 8.8 px to min 13.2 / p25 13.2 px. The hashing, FP formula and politeness timing are untouched.
- **Interaction:** drove it on a phone with m = 64 and 6 s of auto-crawl. The filter saturates to about 88% of bits set and false positives appear in the log, as intended.
- **Calculator note:** it said the 150 KB default "comes from" Common Crawl's ~185 KB per record. It now says the default is a rounded-down estimate, and that the 185 KB includes HTTP headers.
- **Knobs:** the fleet cap was 1.5K pages/s per server, while the calculator default is 1K/s. Aligned the knobs to 1,000/s and labelled both as estimates in the knobs intro.
- **Interview:** added one deep question on per-IP politeness when many hosts share an IP (shared hosting or CDN). This is a classic follow-up that per-host back queues alone do not answer.
- **Verified by search:** Common Crawl Aug 2026 has 2.14B pages and 360 TiB uncompressed, per the official blog. Left as is.
- **Checked from memory, left alone:** RFC 9309 details (24 h cache, 4xx allow, 5xx disallow, 500 KiB), IRLbot (6.3B pages / 41 days / 1,789 pages/s / 319 Mb/s), Manku et al. SimHash (64-bit, k = 3, 8B pages), Brin & Page (~300 connections, DNS cache), and the Bloom sizing answer (9.6 bits/URL, k ≈ 7, ~12 GB).
- **Code:** ran the Bloom filter. Its measured FP rate is 0.99% against a theoretical 1.0%. Ran the asyncio crawler skeleton end to end against the local server with aiohttp 3.14 in a temp venv. It also checks how `RobotFileParser` behaves with empty and disallow-all files. The Java SimHash needs Guava, so it was not compiled; the logic was reviewed by hand.
- **Compile check:** The Guava SimHash snippet compiles cleanly. On a 400-word page, one changed word moved the fingerprint 3 bits (near-duplicate), while an unrelated page was 27 bits away. No changes.
