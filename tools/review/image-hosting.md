# image-hosting review

- **New page: Image Hosting & Thumbnails** (domain 4, slug `image-hosting`). It answers "Design an image hosting / serving system with thumbnails". It covers:
  - direct-to-storage upload with a presigned PUT, plus two completion signals (storage `ObjectCreated` event and client `/complete`) made idempotent by a conditional `PENDING → PROCESSING` claim;
  - the processing worker: magic-byte sniffing, a pixel limit, EXIF orientation baked into the pixels, metadata stripped (keeping the ICC profile), a moderation hook, and SHA-256 + perceptual-hash dedup;
  - eager vs lazy vs hybrid derivatives, allow-listed widths vs signed transform URLs vs unsigned `?w=`;
  - Accept-based WebP/AVIF negotiation with `Vary: Accept` and a normalised format bucket in the cache key; `srcset`/`sizes`;
  - request collapsing at the resizer; immutable versioned URLs with a one-year TTL;
  - hot / warm EC / archive tiers for originals; private images on signed URLs; delete propagation by surrogate-key purge.
- **Not duplicated, linked instead:** erasure coding and durability go to `object-storage`, anycast / tiered cache / CDN coalescing to `cdn`, video to `video-streaming`, sync and dedup side channels to `file-sync`. Object-storage already has a presigned multipart Spring snippet and CDN already has a Python single-flight, so this page's code is different: a signed, allow-listed resize endpoint in Java, band-indexed perceptual-hash lookup in SQL, and a Pillow cleaning step in Python.
- **Our design vs documented fact:** these are all labelled as our design or as a recommendation, not as any company's documented architecture:
  - quarantine bucket, two completion signals and the reconciler;
  - the 6-width allow-list, the hybrid strategy, and the HMAC path format `/i/{sig}/{id}/{ver}/w{w}`;
  - surrogate-key purge on delete, and the 90-day tiering threshold.
  
  The knob and widget byte and CPU constants (JPEG 0.20 / WebP 0.14 / AVIF 0.10 bytes per pixel, AVIF ≈ 8× JPEG encode cost, 25 ms per 1080-px JPEG encode, 60 ms decode, 25% lazy share, ×1.4 for signed sizes, cost index 100/55/25) are all marked *estimate*. The calculator inputs are generic estimates, not company figures.
- **Facts used (sources in `realWorld.sources`):**
  - **Facebook 2009 blog:** 4 sizes per upload, 60 B images, 1.5 PB.
  - **Haystack OSDI 2010:** ~260 B images, >20 PB, ~1 M images/s at peak; metadata kept in memory; NFS needed several disk operations for metadata.
  - **Facebook photo-caching SOSP 2013 (+ 2014 blog):** 65.5% browser / 20.0% edge / 4.6% origin / 9.9% Haystack; 77 M+ requests traced; edge S4LRU 59.2% → 67.7%; ~90% absorbed by caches.
  - **f4 OSDI 2014:** 3.6× → 2.8× or 2.1×, >65 PB, >400 B photos as of Feb 2014.
  - **Facebook iOS progressive JPEG (2015):** ~10% less data, a good image 15% faster.
  - **Pinterest PinLater (2014):** thumbnails of all sizes generated as async jobs after Pin It.
  - **PDQ:** open-sourced Aug 2019, 256-bit, Hamming distance (AFP arXiv paper).
  - **Dropbox Cannes (2021):** ML pre-warming, $1.7 M a year.
  - **Thumbor:** HMAC `SECURITY_KEY`; the docs' quote that a user "can easily ask for other sizes in loops".
  - **imgix:** `s=` signature and `expires`.
  - **Cloudflare:** `format=auto` serves WebP/AVIF to supporting browsers; by default transforms only images from your own zone.
  - **AWS Dynamic Image Transformation:** Lambda + Sharp behind CloudFront, optional Rekognition moderation and smart crop.
  - **MDN:** `srcset` / `sizes` behaviour.
  - **Wolt:** a slow AVIF speed setting took up to 3–4 s, too slow for on-demand encoding.
- **Hedged / dropped:**
  - The f4 "Haystack → f4 after ~3 months" migration age came only from a secondary summary, so it was not used as a fact; the 90-day threshold is labelled our design.
  - I could not find a primary Instagram or Pinterest post on their image-serving or format pipeline (searches returned only third-party content), so the page has no Instagram/Pinterest serving internals or format-savings numbers.
  - Whether the 2013 Facebook paper describes on-the-fly "resizers" could not be confirmed from search snippets, so it was dropped.
  - The Wolt post's year was not visible in search results, so it is cited without a year.
  - The imgix hash algorithm (MD5 per imgix's own docs vs HMAC-SHA256 in a third-party lib) conflicted, so the page says only "signature `s=`".
  - The web-search budget ran out before I could get primary AWS docs on presigned URLs and S3 event delivery semantics. The page states general behaviour only ("at-least-once, make the worker idempotent") without citing AWS numbers.
- **Knobs:** 5 controls, and every option changes the meters or the verdict (checker 14/14). The baseline (hybrid, signed, AVIF, collapsing on, warm EC) gives the ✅ verdict. Unsigned `?w=` with lazy/hybrid gives ❌. Archive + lazy, or collapsing off, give ⚠. For eager, the size policy changes only the verdict and the abuse meter (eager snaps sizes), which is stated in the verdict text. The cold node is hidden for "all hot".
- **Widget:** one request stream (600 req/s, 20 uploads/s, 2000 live popularity slots with Zipf(1.0); each upload replaces a random slot so most photos are rarely viewed) drives three systems in parallel:
  - **Eager:** all 6 widths × 3 formats encoded at upload;
  - **Lazy:** snap up to the allow-list, resize on miss;
  - **Any size:** exact width.
  
  Each system has a real Map-based LRU edge cache, a derivative store and an in-flight map. With collapsing on, concurrent misses wait for the leader's completion time; with it off, each miss starts its own resize. Before showing numbers, it warms with 120 s of simulated traffic in chunks.
  - Node calibration (same code), steady state: eager ≈ 39 cores and 14.7 GB, lazy ≈ 25 cores and 3.4 GB, any-size ≈ 41 cores with an edge hit ratio of 19% vs 44%.
  - Viral burst (50% of requests for 2 s to a new photo): lazy made 18 resizes with collapsing vs 496 without; any-size 90 vs 237.
  - Attack (25% random widths): any-size CPU goes from ~40 to ~98 cores and its store from 3.9 to 9.9 GB; eager and lazy are unaffected.
  - Layouts: two via `ctx.onResize`. Phone: viewBox 360, one column of 4 panels, 14.5/13.5-unit text. Desktop: 2×2, viewBox 640. Phone fonts measured min 12.7 / p25 12.7 px.
  - Fixed during review: the caption claimed "new posts are hottest" and an LRU derivative cache; it now describes the slot model and the derivative store accurately.
- **Diagram:** 12 nodes. Desktop has no edges through boxes. On the phone the "purge" edge label sat in the 12-unit gap between Image API and CDN edge and overlapped the borders, so I removed the label (the edge is still dashed, and scenario 5 explains it).
- **Code:**
  - **SQL:** ran on a throwaway Postgres 16.15 (port 5441) with 200,005 rows. The claim UPDATE returned 1 row and then 0. The near-duplicate query returned exactly ids 2/3/4/5 (distance 0/1/3/3, including the "3 bits in 3 different bands" case), excluded the 4-bit one, and EXPLAIN shows a BitmapOr over the four band indexes. Generated band columns were checked for negative bigints.
  - **Java:** compiled with `javac --release 21 -parameters` against Spring Boot 3.5.6 / Spring 6.2.11 (jars fetched with Maven). I ran it in embedded Tomcat with a fake 300 ms Resizer:
    - 50 concurrent requests made 1 render and all got 200;
    - a WebP Accept made a separate key and returned `image/webp`, `Cache-Control: max-age=31536000, public, immutable` and `Vary: Accept`;
    - a tampered width, an off-list width and bad base64 all returned 403;
    - no Accept returned JPEG.
    
    Without `-parameters`, `@PathVariable` name resolution fails; Spring Boot's build plugins set it by default. The page snippet omits imports.
  - **Python:** ran on Python 3.13 with Pillow 12.3:
    - Orientation = 6 + GPS input came out rotated (400×300 → 300×400) with empty EXIF;
    - the dHash had Hamming distance 0 after a resize plus a q60 re-encode;
    - PDF → UnidentifiedImageError, GIF → ValueError, 108 MP → DecompressionBombError, 56 MP → DecompressionBombWarning raised as an error by the `simplefilter` line.
    
    That warning filter was added after I found that Pillow only *warns* between 1× and 2× `MAX_IMAGE_PIXELS`.
- **Checker:** `node tools/check.js --require-intro --fonts image-hosting` gives ✓ phone and ✓ desk (5 scenarios, knobs 14/14, 12 interview questions, 17 sources, phone font min 12.7 / p25 12.7). Screenshots checked: desk and phone architecture, phone knobs, phone and desk deep dive, and phone intro.
- **Suggested cross-links (for the coordinator):** add `image-hosting` to `related` in `object-storage` (f4/Haystack use case), `cdn` (image transforms at the edge), `video-streaming` and `file-sync`.
