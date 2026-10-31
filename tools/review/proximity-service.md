# proximity-service review

- Widget: on phones (`ctx.narrow`) geohash labels, dots, the search pin and the radius ring are scaled ×1.9 / ×1.35 so the 500-unit map stays readable at ~340px; redraws on `ctx.onResize`. Font check went from min 6.8 / p25 6.8px (0% ≥12px) to min 12.9 / p25 12.9px. Geohash and quadtree logic unchanged; desktop identical.
- Fixed an inconsistency: the "Dense city" scenario badge said "12K cand." (that is the number of *hits* in a 2 km circle at 1,000 places/km²). Nine length-5 cells cover ~215 km², so it now says ~215K candidates, which matches the knob meters; the caption explains the ~17× over-scan.
- Elasticsearch timeline item cited a 2019 geo_shape blog post for a 2016 ES 5.0 claim. Added the ES 5.0.0 release post (it appeared in search) as the source and stated what it says: geo_point moved to Lucene `LatLonPoint`, about 2× faster geo-point queries.
- Checked the Tinder "40–100 geoshards" figure against search snippets of Tinder's Part 1 post: confirmed, left as is.
- Added one interview question: radius search on a plain SQL/KV store with a geohash column (9 prefix range scans + haversine filter), with the "why not the common prefix" follow-up.
- Defined "LBS" (location-based service) on first use in the search scenario. Noted that geohash cell sizes are at the equator.
- Ran the Python geohash snippet: `encode(57.64911, 10.40744, 11)` gives the canonical `u4pruydqqvj`; neighbour set is correct. Left the SQL and the Spring Data Redis `GeoOperations.search(...)` snippet as is (APIs exist in Spring Data Redis 2.6+/3.x; no Spring jars to compile against).
- Left alone: calculator (sensible units, labelled estimates), the knob model (illustrative and says so), Redis 52-bit geohash and S2 level facts.
- **Compile check:** The Redis GEO snippet compiles cleanly against Spring Data Redis 3.5. I ran it against a local Redis 7.0: GEOADD + GEOSEARCH returned the two places inside 5 km, nearest first, with distances in km. No changes.
