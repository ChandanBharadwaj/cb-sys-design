# cdn review

- **Widget, phone:** the 380-wide map stays, but every SVG text now registers a desktop and a phone size. On phones these are PoP codes 15, meters 15 and tier/origin 14.5 units; the "upper tier" and "origin" boxes widen to fit. They are reapplied via `ctx.onResize`, and desktop sizes are unchanged. Fonts went from min 11.6 / p25 11.6 px to min 13.0 / p25 13.4 px. The LRU+TTL caches, Zipf traffic, tier coalescing and purge logic are untouched.
- **Interaction:** on a phone, with the upper tier off and `?utm=` in the key, edge hit fell to about 19% and origin load to about 218 of 300 req/s. The red fan-out lines go straight to origin, and everything stays legible.
- **Code bug fixed (Python SingleFlight):** if the leading request was cancelled, `CancelledError` (a BaseException) skipped `set_exception`, so every waiter hung forever. A test confirmed waiters timed out. Added `except asyncio.CancelledError: fut.cancel(); raise` and updated the note. Re-tested: 50 concurrent callers make 1 fetch, errors reach all callers, and cancellation now propagates instead of hanging.
- **Failures:** added "cache poisoning via an unkeyed header" (e.g. `X-Forwarded-Host`). It is a classic CDN security failure and fits the page's cache-key theme.
- **Interview:** added one deep question on serving HTTPS for millions of customer domains: SNI-based certificate selection, a lazily loaded certificate store, resumption and TLS 1.3, OCSP stapling, and keyless signing.
- **Sources:** searched for a primary Cloudflare post on the 22.2 Tbps / 10.6 Bpps / ~40 s attack (Sept 2025). Results were press coverage only, so the Security Affairs source is kept; it matches the other reports.
- **Checked, left alone:**
  - Akamai 2010 paper (61,000+ servers, ~70 countries), Pingora (1T+ req/day, 87.1% → 99.92% reuse, 160× fewer connections), Instant Purge (<150 ms P50), and Smart vs generic tiered cache.
  - Knob maths: hit, shield and origin RPS; every option changes the meters.
  - Calculator (labelled estimates), and the Spring `CacheControl` builder methods, which exist in Spring 6.
  - The cURL and Cloudflare purge API shape. The Spring Java was not compiled because it needs Spring.
