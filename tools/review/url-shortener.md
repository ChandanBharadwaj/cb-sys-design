# url-shortener review

- **Widget, phone:** narrow mode uses a 360-wide viewBox with 14-unit division rows (24-unit spacing) and a 14-unit keyspace footer. The scramble line ("× P mod 62^L = …") is split over two lines so it fits. It is redrawn via `ctx.onResize`. Fonts went from min 10.2 / p25 11.0 px to min 13.2 / p25 13.2 px. The Base62 division, the multiplicative bijection and the decode check are unchanged, and desktop is unchanged.
- **Interaction:** on a phone, set Scramble on and pressed Random id. The two-line scramble header, 7 division rows, code boxes and the "decode → id ✓" stat all fit with no overflow.
- **Flagged item, RFC 9110 301 caching:**
  - Searched again. Only mirrors of §15.4.2 came back, but they quote it verbatim ("heuristically cacheable … unless otherwise indicated by the method definition or explicit cache controls"). The source stays the canonical rfc-editor.org URL.
  - The timeline text now cites §15.4.2, and says 302 is "not on the heuristically cacheable list" (RFC 9110 §15.1). That is from my knowledge of the spec; the search did not show the 302 section.
- **Interview:** added one deep question on surviving a region loss: async global replication of the link table, region-local id-block ranges, fallback to the home region on a miss, and propagating disables.
- **Code note:** the Java redirect cached every URL for 24 h regardless of `expires_at`, which contradicts the expiry interview answer. The note now says to cap the TTL at the remaining lifetime and delete the key on disable.
- **Clarity:** replaced "SPOF" with "single point of failure" in the counter verdict.
- **Code tests:**
  - Ran the Python scrambled Base62 with a 20K-sample round-trip and uniqueness test. Its output (`XpXE7cr` for 125,000,000,123) matches the widget.
  - Ran the SQL on a temporary PG 16. The sequence hands out 1000, 2000…, and the alias conflict returns 0 rows.
  - Compiled and ran Java `Base62.encode` (gives `2crtgef`, matching the scenario). The Spring parts were not compiled.
- **Checked, left alone:** keyspace maths (62⁶ ≈ 57B, 62⁷ ≈ 3.5T), the knob numbers (2.3K redirects/s and 230 creates/s from Bitly's 6B/600M per month, the Zipf hit-ratio approximation), the Bitly 2014 figures (High Scalability), Flickr and Instagram ids, and the calculator note's estimate labels.
- **Compile check:** The id-block/Base62/redirect snippet compiles cleanly. **Fixed:** `Base62.encode` did not pad, and the sequence starts at 1000, so the first ~237K ids encoded to 2–3 chars (1000 → `g8`). Spring's `PathPatternParser` confirmed the `{4,12}` route rejects such codes, so those links would 404. It now left-pads to a fixed 7 chars, like the Python snippet: 1000 → `00000g8` and 125,000,000,123 → `2crtgef`, both matching the route. IdBlock hands out [1000, 2000) and then 2000.
