# ride-sharing review

- Widget (flagged: check the SVG labels): the checker reported `font(min 0 p25 0)` because the SVG has no text until you request a ride. After a request, the "R" pin and the ETA labels were 10 units in a ~486-wide viewBox, about 7 px on a phone. The widget is now built by `build(narrow)` and rebuilt from `ctx.onResize`.
  - Phones get a 7×10 hex grid (viewBox ≈ 320 wide) with 16 drivers instead of 11×8 with 22, bigger dots, a 13.5-unit ETA label and a 12-unit pin.
  - The k-ring search, ETA ranking, river penalty and offer loop are unchanged; desktop keeps the 11×8 grid.
  - Measured during a request: ETA labels 14.3 px, "R" 12.8 px on a 390 px phone (desktop 17.7 px).
- Added an HTML legend under the grid for both layouts. The dot colours (free / candidate / offered / on a trip), "R" and the ETA labels were not explained anywhere.
- Data model bug: `location_pings` was keyed by `driver_id` but listed `partition: hash(cell)`, which contradicts how Kafka partitions (by key hash). It is now `hash(driver_id)`, with the reason (per-driver ordering).
- Java note fix: "Hashing on `{cell}` keeps a cell's set on one slot" was misleading, because each set is one key and hash tags only matter for multi-key operations. The note now says a k-ring read touches several slots, and that the 30 s TTL only clears idle cells, so drivers must also be removed on logout or missed heartbeats.
- Knobs: the "Write headroom" meter now carries an "illustrative cluster ceilings" hint; the store capacities were only commented in code before.
- Interview: added "road ETAs for 20 candidates in milliseconds" (precomputed road graph, one-to-many query, live traffic plus learned correction, distance only as a pre-filter). This was a classic follow-up missing from the page.
- Shortened the shard-down scenario's last caption from 226 to under 220 characters.
- Code: ran the scipy batched-matching snippet on a 3×2 case. It picks the globally cheaper assignment and drops the forbidden > 15-minute pair. Ran the Postgres accept SQL: the first accept wins, the second returns 0 rows, and the partial unique index blocks a second active ride. The Java/H3 snippet needs h3-java and Spring Data Redis, so it was not run; the H3 v4 method names were checked.
- Left alone: the 2015 talk figures (4 s pings, 1M writes/s), the H3 facts (122 base cells, 16 resolutions, res 9 ≈ 0.1 km²), the Redis GEO 52-bit geohash note and the timeline.
