# Review log: page-by-page readability and content pass

Each page was reviewed on its own, one after another. Every page had:
- its deep-dive simulation reworked so its text is readable on a 390px phone;
- its content checked for correctness, consistency, gaps, clarity, knobs, calculator and code.

Each entry lists what changed and what was deliberately left as it was.

## Follow-up verification

- **Chubby grace period:** confirmed in the OSDI'06 paper itself (§2.8: jeopardy, then a grace period of 45 s by default). The lock-manager page now cites the paper rather than course notes.
- **UPI status-check limits:** now attributed to **NPCI circular UPI OC No. 214 (26 Apr 2025)**, as quoted in Business Standard and TeamLease RegTech coverage. The rules are: first check no sooner than 90 s, at most 3 checks, preferably within 2 hours, and stop on a final error code. The balance-enquiry caps come from the May 2025 follow-up circular, OC 215A. NPCI's own site cannot be reached from the build environment, so the PDF itself was not opened.
- **Library-dependent Java snippets (36):** all compiled with `javac 21 -Xlint:deprecation,removal` against the real libraries (Spring Boot 3.5.16, Spring Cloud Gateway 2025.0, Spring Data Elasticsearch/Cassandra, Spring Kafka, Spring Integration JDBC, Resilience4j, Flink 1.20.5, AWS SDK v2, Jedis, H3, Disruptor 4, Guava). Most were also run against local Postgres 16 / Redis 7, or a local Flink cluster. Only three were not run, because they need services that are not available locally: the Cassandra and Redis Top-K snippets, and the stream-analytics Flink job, which reads from Kafka.
  - **Bugs found and fixed:**
    - payment idempotency replay re-locked finished keys;
    - URL shortener codes were not padded, so the route rejected them;
    - S3 multipart parts were not sorted;
    - food-delivery zone loop aborted on the first lost race.
  - **Config fixed:** the Spring Kafka YAML was missing its JSON value deserializer.
  - **Note corrected:** ticket-booking's concurrent retry fails as "seats unavailable", not at the unique index.
- **Config files:**
  - The Spring Boot, Spring Cloud Gateway and Spring Kafka YAML keys were checked against the jars' configuration metadata.
  - The OpenTelemetry Collector pipeline was checked for structure.
  - The Agones Fleet, FleetAutoscaler and GameServerAllocation were checked against the v1 spec.
  - The LiteLLM config was loaded with the real LiteLLM proxy loader. Its comment now says the semantic cache needs Redis credentials.

---

## Distributed Rate Limiter (`rate-limiter`)

- Widget: the phone viewBox was already 360 wide, but the text was 11–13 units and the width was only measured once. The lanes are now built by `build(narrow)`: 13–14-unit lane names, peak, gauge and footer text, slightly taller lanes, and "Window counter" instead of "Sliding-window counter" on phones so it does not collide with the peak readout. It is rebuilt on `ctx.onResize` and keeps the event history. The four algorithms and the request stream are untouched, and desktop geometry is identical. Font check went from min 10.4 / p25 10.4px (29% ≥12px) to min 12.3 / p25 12.3px. Ran "Boundary attack" on phone: fixed window peak 12/2s in red, sliding log 6, window counter 6, token bucket 7. This matches the knob text ("up to bucket size").
- Ran every runnable snippet against a local redis-server. The Lua token bucket allowed 3, then rejected with retry ≈ 977 ms at 1 token/s, and set the TTL. The Python sliding-window counter allowed 3 of 5 calls at limit 3. Both are correct. The Spring `HandlerInterceptor` (RedisScript<List>, fail-open on `DataAccessException`) was checked by reading only; it needs Spring jars.
- Verified the IETF RateLimit header draft is still not an RFC (draft-ietf-httpapi-ratelimit-headers-11, May 2026) and added the revision and date to the timeline item.
- Added the classic follow-up "How is a leaky bucket different?" to the token-bucket question. The knobs already include leaky bucket, but no answer explained it.
- Checked and left alone: Stripe's four limiter types and token buckets in Redis; Cloudflare's 0.003% on 400M requests from 270K sources; GitHub's 2021 move from Memcached to sharded Redis with stored reset times; and Envoy/Lyft ratelimit. Terms match across intro, glossary, knobs and interview (token bucket = rate + capacity; window counter formula `prev × (1 − elapsed/window) + curr`).
- Knobs: when counters are local, the "If Redis fails" option has no effect. That is inherent to the design (no Redis). The default (central Redis) shows the open/closed difference in both the meter and the verdict. Calculator units and estimate labels are fine.
- **Compile check:** The interceptor compiles cleanly (Boot 3.5, Spring Data Redis 3.5). I ran it with the page's Lua script against a local Redis 7.0: 20 allowed, then 429 with `Retry-After: 1` and remaining 0. After 1.1 s the bucket refilled to 10. With Redis unreachable it fails open. No changes.


---

## Distributed Message Queue (`message-queue`)

- Widget: the phone layout already used a 360 viewBox, but its text was 9–12 units. It now has proper phone sizing: 8 offset cells per row instead of 10, so each cell can hold 14-unit numbers; 13–14-unit labels for broker, role, LEO, HW and consumer; taller rows; and a rebuild on `ctx.onResize` instead of a one-time width check. The replication logic (ISR, HW, acks, failover truncation) is unchanged, and the desktop layout matches the old one. Font check went from min 9.4 / p25 9.4px (23% ≥12px) to min 12.3 / p25 12.3px. Driven on phone with acks=1, produce, slow follower, produce ×2, kill leader: 6 acked-but-lost records show in red, and the ISR and HW update.
- Flagged source (Kafka paper via MIT course mirror): searches found only university mirrors and odbms.org, no ACM or LinkedIn copy. I switched the source to the Apache Kafka wiki's "Kafka papers and presentations" page, the project's own index of the NetDB '11 paper, rather than keep a course reading list.
- Python consumer had two real bugs. (1) It applied the business change even when `INSERT … ON CONFLICT DO NOTHING` inserted nothing, so the dedup did nothing. (2) It used the record key as the event id; the key is the partition key (e.g. order id) and repeats across events. The fix: check `rowcount` and skip, read `event_id` from a header, and use a psycopg 3 transaction with autocommit=True outside it. Tested on a temporary Postgres 16 (first apply = True, redelivery = False, balance applied once). Building the real `confluent_kafka.Consumer` (2.x) with the snippet's config raised no errors.
- Updated an outdated fact: the interview answer said share groups (KIP-932) were early access in Kafka 4.0. The Apache Kafka 4.2.0 release announcement (2026) says Queues for Kafka are production-ready. I added a 2026 timeline item and a source, and updated the "queue vs log" answer.
- Checked and left alone: LinkedIn 2019 figures (7T msgs/day, 100+ clusters, 4,000+ brokers), Kafka 3.9 tiered storage GA, Kafka 4.0 KRaft-only, acks=all default since 3.0, and the knob logic (min ISR = RF blocks writes on one broker loss; EOS requires acks=all). The knob meters and verdicts are consistent with the interview answers.
- Calculator is sound (bytes/s, retention × RF, partitions from per-partition MB/s marked as an estimate). Left as is. YAML and the Spring Kafka DLQ Java (`DefaultErrorHandler`, `DeadLetterPublishingRecoverer`, `FixedBackOff`) use current spring-kafka 3.x APIs. Not compiled (needs Spring jars).
- **Compile check (spring-kafka 3.3, Boot 3.5.16):** the DLQ/listener Java compiled clean. YAML keys were checked against Boot metadata and Kafka `ProducerConfig`/`ConsumerConfig` names, then bound into `KafkaProperties`. **Fixed a real bug:** the consumer had no `value-deserializer`, so it defaulted to `StringDeserializer` and `rec.value().eventId()` in the listener would throw `ClassCastException`. Added `JsonDeserializer` and `spring.json.trusted.packages`. A JsonSerializer → JsonDeserializer round trip with type headers was verified.


---

## Distributed Cache (`distributed-cache`)

- Widget: the phone layout (ring above the bar chart, 360 viewBox) existed, but its text was 12–15 units and it was laid out only once at load. Layout now lives in `geom(narrow)` + `placeRing()`. Phones get 14–17-unit text for the centre readout, vnode labels, chart title, bar labels and counts, plus taller bar rows. The layout rebuilds on `ctx.onResize`. Ring hashing (FNV-1a + avalanche), vnode placement and owner computation are unchanged, and the desktop renders as before. Font check went from min 11.3 / p25 11.3px (45% ≥12px) to min 13.2 / p25 13.2px. On phone I set vnodes = 4 and added node E: 30% of keys moved against an ideal of 20%, moved keys are outlined, and labels are readable.
- Flagged weak item, now cited. Karger et al., "Consistent Hashing and Random Trees" (STOC '97): added a 1997 timeline item and a source. The URL is the Brown University PDF that appeared in search, with the ACM DOI given in the pub line. Vattani, Chierichetti, Lowenstein, "Optimal Probabilistic Cache Stampede Prevention" (PVLDB 8(8), 2015): added a 2015 timeline item and a source (VLDB page from search). The XFetch snippet and knob note now have a citable origin.
- The stampede interview answer now names probabilistic early refresh (XFetch) alongside leases and single-flight. The vnode answer credits Karger '97 and gained a "how many vnodes?" follow-up ("low hundreds; ketama uses 160", which matches the widget's top slider value).
- Bug fix in the Python lease snippet: `finally: r.delete(lease)` could delete a lease that had expired and been taken by another loader. It now stores a random token and releases with a compare-and-delete Lua script. Tested against a local redis-server: 8 concurrent threads → 1 DB load, no lease left behind, and a stale holder cannot delete someone else's lease.
- Ran the XFetch snippet with an in-memory cache: no early recomputes far from expiry, and about 44% of reads refresh when 10 ms from expiry with delta ≈ 10 ms. This matches the expected exp(−gap/(δ·β)) behaviour. The Spring `RedisCacheManager.transactionAware()` + `@Cacheable(sync = true)` Java uses current Spring Data Redis 3 APIs; it was not compiled because it needs Spring jars.
- Checked and left alone: the Facebook NSDI '13 figures (leases cut peak DB queries from 17K/s to 1.3K/s), mcrouter ~5B req/s (2014), Redis Cluster's CRC16 mod 16384 with MOVED/ASK, and Redis's default `noeviction`. Knob meters are consistent with the widget (`hash % N` moves N/(N+1) of keys; the ring and slots move 1/(N+1)). The calculator note "a 1-point hit-ratio drop *can* double DB load" holds at 99% hit, so it was left as is.
- **Compile check (Spring Boot 3.5.16, Spring Data Redis):** compiled clean, with no deprecation warnings for `GenericJackson2JsonRedisSerializer`. Ran it with a real Redis and a transaction manager. The second `get` was a cache hit, the record round-tripped as JSON with `@class` and a 600 s TTL, the key was still cached inside the `@Transactional` update, and it was gone after commit. No change.


---

## Distributed Lock Manager (`lock-manager`)

- Widget: the phone layout already used a 360 viewBox, but its text was 10–11 units, which is too small. It now has its own phone sizes: 13–14-unit row, axis, bar, mark and write labels; taller rows (56); a wider label column; rows labelled "A"/"B" to save width; and edge-clamped "lease expired" and write labels. It is rebuilt on `ctx.onResize`, so it no longer measures once at load. The lease/KeepAlive/fencing schedule logic is unchanged. Desktop sizes are the same as before. Font check went from min 9.4 / p25 9.4px (0% ≥12px) to min 12.3 / p25 12.3px. I drove it on phone with fencing off, a 16 s pause and Run, and got the "Lost update" ending with "final value from A".
- Flagged claim (etcd lease refresh on a new leader): search found etcd's own integration test ("newly elected leader can promote itself to the primary lessor, refresh the leases") and PR #17642 ("lease remaining TTL will be reset after leader changed"). I kept the claim, made it precise ("resets the remaining TTL, so a failover can extend a lease, never shorten it") and added the PR as a source.
- Flagged claim (Chubby sessions survive master failover): the old wording ("failover protocol keeps sessions alive") was vague. It now describes the mechanism that course notes on the OSDI'06 paper consistently report: when the lease runs out the client enters jeopardy and waits a 45 s default grace period, and the session and locks survive if it reaches the new master in time. I also added the line "the old leader's view of time is gone, which is one more reason to fence".
- Added a classic follow-up to "Why is a lease alone not enough?": re-checking the lease right before writing does not help, because the pause can fall between the check and the write.
- Ran the code: the SQL snippet on a temporary Postgres 16 (advisory xact lock returns true; fenced UPDATE with token 34 updates 1 row, a stale token 33 updates 0). The Python SET NX PX + compare-and-delete lock ran against a local redis-server (second acquire fails, foreign release refused, owner release works). The Spring Integration `JdbcLockRegistry` Java needs Spring jars and was not compiled; its API calls match Spring Integration 6.
- Checked and left alone: Chubby's 5 replicas and 12 s default lease, the Jepsen etcd 3.4.3 summary, Redlock/Kleppmann/antirez framing, the knob model (every option moves Safety, Latency, Failure or Ops meters), and the calculator (Little's law, KeepAlive every TTL/3, (n−1)/2 failures tolerated).
- **Compile check (Spring Integration JDBC 6.5):** compiled clean. Ran two Spring contexts ("nodes") on Postgres 16 with the `schema-postgresql.sql` shipped in the jar. Node 1 ran the batch, node 2's `tryLock(2 s)` returned after about 2 s without running it, and `INT_LOCK` was empty after unlock. No change.


---

## Ride-Sharing Location & Dispatch (`ride-sharing`)

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
- **Compile check:** The H3 + Redis snippet compiles cleanly against h3 4.5.1 and Spring Data Redis 3.5. I ran it against a local Redis: moving a driver between cells updates the sets, and the k-ring search returns the nearest drivers first. No changes.


---

## Proximity Service (`proximity-service`)

- Widget: on phones (`ctx.narrow`) geohash labels, dots, the search pin and the radius ring are scaled ×1.9 / ×1.35 so the 500-unit map stays readable at ~340px; redraws on `ctx.onResize`. Font check went from min 6.8 / p25 6.8px (0% ≥12px) to min 12.9 / p25 12.9px. Geohash and quadtree logic unchanged; desktop identical.
- Fixed an inconsistency: the "Dense city" scenario badge said "12K cand." (that is the number of *hits* in a 2 km circle at 1,000 places/km²). Nine length-5 cells cover ~215 km², so it now says ~215K candidates, which matches the knob meters; the caption explains the ~17× over-scan.
- Elasticsearch timeline item cited a 2019 geo_shape blog post for a 2016 ES 5.0 claim. Added the ES 5.0.0 release post (it appeared in search) as the source and stated what it says: geo_point moved to Lucene `LatLonPoint`, about 2× faster geo-point queries.
- Checked the Tinder "40–100 geoshards" figure against search snippets of Tinder's Part 1 post: confirmed, left as is.
- Added one interview question: radius search on a plain SQL/KV store with a geohash column (9 prefix range scans + haversine filter), with the "why not the common prefix" follow-up.
- Defined "LBS" (location-based service) on first use in the search scenario. Noted that geohash cell sizes are at the equator.
- Ran the Python geohash snippet: `encode(57.64911, 10.40744, 11)` gives the canonical `u4pruydqqvj`; neighbour set is correct. Left the SQL and the Spring Data Redis `GeoOperations.search(...)` snippet as is (APIs exist in Spring Data Redis 2.6+/3.x; no Spring jars to compile against).
- Left alone: calculator (sensible units, labelled estimates), the knob model (illustrative and says so), Redis 52-bit geohash and S2 level facts.
- **Compile check:** The Redis GEO snippet compiles cleanly against Spring Data Redis 3.5. I ran it against a local Redis 7.0: GEOADD + GEOSEARCH returned the two places inside 5 km, nearest first, with distances in km. No changes.


---

## Real-Time Chat & Messaging (`chat`)

- Widget: added a phone layout (`ctx.narrow`): viewBox 360 wide, 5 rows instead of 6, 13–16-unit text, re-spaced lanes (Alice / Server / Bob / Carol / Dan), and "retrying…" shown as "↻" on phones. Layout rebuilds on `ctx.onResize`. Sequencing, hold-back, dedup and tick logic unchanged; desktop layout is the same as before. Font check went from min 7.5 / p25 8.8px (0% ≥12px) to min 12.3 / p25 14.2px. Drove it on phone with lost-ack + Dan offline + "Send 3 fast": dup, held and queued (🔔) states all render.
- Flagged weak item (WhatsApp on Erlang): found the primary source, Rick Reed's Erlang Factory SF 2012 slides. Added a timeline item: Erlang on FreeBSD, bottlenecks around 425K, BEAM/kernel patches reached 1M per box. The 2M figure stays sourced to WhatsApp's own "1 million is so 2011" post. Reworded the interview answer to "FreeBSD box running Erlang, after patching the VM and kernel".
- Flagged weak item (Discord Elixir gateway): added a 2017 timeline item from Discord's own "How Discord Scaled Elixir to 5,000,000 Concurrent Users" post: guild events fan out to every connected session, fan-out and reconnect stampedes were the bottlenecks, and Discord built Manifold. Updated the realWorld intro to match.
- Java snippet bug: the ack was sent on the raw `WebSocketSession` while Redis listener threads write through `ConcurrentWebSocketSessionDecorator`. Concurrent sends on one session can throw `IllegalStateException`, so the ack now goes through the decorator too.
- Gap: added one interview question on draining stateful gateways (deploys and scale-down without a reconnect storm), with the "gateway dies instead" follow-up.
- Ran the Python ordering/dedup snippet (hold-back, duplicate drop, gap range): correct. The Java needs Spring jars and was not compiled; the API calls were checked by reading them.
- Checked for consistency and left alone: the heartbeat/TTL numbers (30 s / 60 s, TTL = 2× heartbeat) match across knobs, interview and glossary; Discord 177 → 72 nodes, 10-day buckets, and the Slack 4M connections / 16M channels per host figures match their cited posts. Calculator units are fine and labelled as estimates.
- **Compile check (Spring Boot 3.5.16: websocket + data-redis):** compiled clean with stub types (`MessageStore`, `Envelope`, `Stored`, `Ack`, `Delivery`). Ran two handler "nodes" against a local Redis with fake sessions. The sender got its ack, an online member on the other node got the delivery over pub/sub, and the offline member was queued for push. A client retry re-sent the same seq, which the client dedups. No change.


---

## Live Leaderboard (`leaderboard`)

- Widget: added a phone layout. On narrow widths the skip list is turned 90°: players run top to bottom, levels L1–L4 are columns, and span labels sit beside the vertical arrows. The viewBox is 360 wide with 14–16-unit text. The desktop horizontal layout is unchanged. Insert, delete and rank code (zslInsert / zslDelete / zslGetRank) is untouched; only the drawing changed. Font check went from min 8.8 / p25 8.8px (0% ≥12px) to min 13.2 / p25 14.2px. On phone I drove two inserts plus a tap-to-rank: the search path, Σ readout and trimming to 9 players all render.
- Peloton figure: "27,556 riders (2023)" could not be found in search. The cited AWS for Industries post (2026) is shown in search snippets as reporting **34.6K simultaneous participants in the 2025 Turkey Burn ride**, ElastiCache with replicas, MSK and SQS, and production load tests at up to 2.5× peak. I updated the tldr number, the timeline item and the matching lesson. I dropped the "pre-warmed, tier-0 isolated" claim because it was not verifiable.
- Correctness: the interview answer said a rank lookup in 50M is "log₂(50M) ≈ 26 levels". With Redis's p = ¼ there are about log₄ N ≈ 13 levels, and the expected search cost is about (1/p)·log₁/ₚ N ≈ 50 pointer hops. I fixed the answer, the calculator output (now "≈ 2·log₂ N, estimate") and the knob meter so all three agree. I also softened the glossary ("doubling adds a step or two").
- Gap: replay idempotency. ZINCRBY is not replay-safe, so the "What if Redis loses data?" answer now covers recording the applied offset or writing absolute values, and `ZADD GT` (Redis 6.2+) for best-score boards. I folded this into the existing answer to stay at 12 questions.
- Java: the weekly key now zero-pads the ISO week (`%d-W%02d`), so it matches `lb:weekly:2026-W44` everywhere and sorts correctly. Not compiled, because it needs Spring jars.
- Python: I ran the tie-break plus score-range-shard snippet against a local redis-server (redis-py in a temp dir). Ranks across bands come out correct, and the 2²¹ precision bound holds. I added a guard so a missing player raises `KeyError` instead of a `TypeError` on `None + int`.
- Checked and left alone: Redis t_zset.c description (Pugh's paper, repeated scores, span), the O(log N + M) ZRANGE cost, the ZCOUNT shared-rank formula, and the knob model (illustrative and labelled as such).
- **Compile check (Spring Data Redis, Boot 3.5.16):** compiled clean. Ran it against a local Redis. The pipelined `ZINCRBY` updated both boards, rank is 1-based with null for unknown players, `top` and `around` returned the right members, and the weekly key `lb:weekly:2026-W44` got a 21-day TTL. No change.


---

## Collaborative Editing (`collab-editing`)

- Knobs (flagged: "only 3 of 5 options change the outcome"): checked every option against the default with a script. All five segmented options, and the min, default and max of each range, already changed the meters or the verdict. The checker counted 3 because it clicks buttons in order, so clicking an option that is already selected counts as "no change" (OT first, Rich text first). Reordered the options to LWW, OT, CRDT and Canvas, Rich text, with the defaults unchanged. The checker now reports 5/5.
- Knobs: OT + canvas and CRDT + canvas shared one generic verdict ("Works, but heavier than needed"). Each now has its own verdict: OT's transforms are overkill for independent properties; CRDT works offline, but per-object ids and history are more than the data needs unless you need offline or P2P.
- Widget: it already passed the phone font check (min 12.5 / p25 14.3 px) and was left unchanged. Checked the phone screenshot and a driven CRDT "⚡ Conflict" state on phone: lanes, chips, ids and in-flight ops are all readable.
- Code, Java: compiled and ran the OT session. It reproduces the page's scenario (`abc`, ins X@1 ∥ del@2 → `aXb`) and the two-insert answer (`aXYbc`). A 20,000-case random test found 0 TP1 violations. Added to the note that `receive` is only correct with one op in flight per client (Jupiter / ot.js style); otherwise a client's own unacked op would sit in the history it is transformed against.
- Code, SQL: ran it on Postgres 16. A retry is a silent no-op, and a different owner reusing the same rev raises a PK error (fencing), exactly as the note says. The Yjs snippet uses current APIs and was not run, because it needs a browser.
- Gaps: added the interview question "Why does OT almost always run through a central server?" (TP1 vs TP2, and why CRDTs avoid it), with a property-test follow-up. Clarified that A holds the lower site id in the concurrent-inserts answer.
- Checked and left alone: Figma's journal claims (95% of edits saved within 600 ms; ~0.5 s journal vs ~60 s checkpoints), confirmed against Figma's own post. Also Figma's one process per doc, Google Docs 2010 OT, Jupiter 1995, YATA 2016 and Automerge 2.0.


---

## Multiplayer Game Backend (`multiplayer-game`)

- Widget: the 380-wide geometry already fits a phone, so the widget keeps it. On a phone (`ctx.narrow`, re-applied through `ctx.onResize`), the small labels are made bigger: "cover" and "now" go 12 → 13.5, the timeline labels and middle readout 13 → 14, and the lane titles 14 → 14.5. Phone fonts went from min 10.7 / p25 11.6 px (3 under 11px, 50% ≥ 12px) to min 12.1 / p25 12.5 px. Desktop rendering is unchanged, and so is the simulation (prediction, 2-tick interpolation, rewind).
- Knobs: 20 Hz, 64 Hz, Strict window and Regional DCs all ended on the generic "👍 Solid. Check the meters". Each now has a verdict that states its trade-off: 20 Hz costs about 1/6 of the CPU but needs a ~100 ms buffer; 64 Hz costs half the CPU for a ~31 ms buffer instead of ~16 ms; a strict window means minutes-long queues off-peak; regional DCs give ~45 ms vs Riot's 35 ms target. The default meter values (peeker's advantage ≈ 53 ms) are consistent with Riot's stated 40–70 ms.
- Gaps: added an interview question on shipping a new server build without killing live matches. The answer covers rolling only Ready servers, letting Allocated ones drain, build labels on allocation, and a canary as the follow-up.
- Code, Python: the matchmaker removed matched tickets from the sorted set but left their `ticket:{id}` hashes behind forever. They are now deleted in the same pipeline. Ran it against a local redis-server with redis-py: a group of 10 is matched, and the far-off ticket and leftovers stay queued.
- Code, Java: compiled and ran the fixed-timestep loop with stub types. The rewind maths is correct: 60 ms + 15.6 ms at 128 Hz gives 10 ticks back. The Agones YAML was checked by reading only, against current `agones.dev/v1` Fleet, Buffer FleetAutoscaler and `selectors`-based GameServerAllocation.
- Checked and left alone: Valorant 128 Hz / ~7.8 ms frame, 35 ms for 70% of players, Source's 100 ms interpolation and 1 s `sv_maxunlag`, and the Agones 2018 launch. All are sourced to Riot, Valve and Google pages.
- **Compile check:** The Agones YAML (item 2) parses as 3 documents: `agones.dev/v1` Fleet (replicas, GameServer template with a UDP port and pod template), `autoscaling.agones.dev/v1` FleetAutoscaler (Buffer policy with a percentage `bufferSize` plus `minReplicas`/`maxReplicas`), and `allocation.agones.dev/v1` GameServerAllocation using `selectors[].matchLabels` on `agones.dev/fleet` and the propagated `build` label. All fields match the Agones v1 spec. No changes.


---

## Live Train Tracking (Offline) (`train-tracking`)

- **New page:** Live Train Tracking (Offline), modelled on Where Is My Train. It has 11 sections and a "Start here" intro (3 frames: server status → no signal → offline pack plus cell IDs), 5 scenarios, 4 knobs, 12 interview questions, 3 snippets and 10 sources. Related pages: ride-sharing, proximity-service, irctc-booking, notifications, cdn, stream-analytics.
- **Fact vs our design:** Google has not published the locator. The page attributes only these points to sources:
  - offline cell-tower tracking with timetables on the phone (YourStory 2018, Wikipedia);
  - anonymised location data from users (Wikipedia);
  - the speedometer GPS traces reused to build the cell mode, with no official tower data (founder interview, Indian Notes);
  - cell-mode accuracy of "a few km", near-GPS close to stations (same interview);
  - the acquisition in Dec 2018 with 10M+ downloads; the price was undisclosed, and the $30–40M figure is reported only as unconfirmed (VentureBeat, YourStory, Business Standard);
  - Google Maps live train status in Jun 2019, built with Sigmoid Labs (MediaNama);
  - RTIS in Sep 2022: 2,700 locos in 21 sheds, 6,000 more planned, 30 s mid-section updates, data to NTES through CRIS (ThePrint, Ministry statement);
  - the iOS listing by Google LLC (App Store). The launch month is hedged because reports say both Jun and Nov 2025.

  Everything else is labelled **our design**: the tower→segment table, the HMM/Viterbi locator, the anonymiser rules, versioned packs with deltas, the k-trip floor and the per-train status cache. The architecture title says "(our design)".
- **Estimates:** All calculator inputs are labelled estimates, including about 68K route km. Knob battery, data and learn-time figures are labelled illustrative in the knob intro.
- **Widget (real mechanism):**
  - Crowd trips (random sub-journeys, GPS fixes about 35% of the time) are map-matched to 0.5 km segments and counted into a P(cell | segment) table.
  - The phone runs an HMM forward filter. Prediction is forward motion around the timetable section speed, with extra stop mass near stations. The emission comes from the table; unknown cells and no service mean predict only.
  - The page shows the median and a 90% band, the true train, the serving cell plus the stretch the learned map links to it, the last 4 cells, the ETA to the next station (estimate vs true), and the delay vs the timetable.
  - Modes are GPS / cell / no signal. The map can be built from 2, 20 or 200 trips (cold start), and a "+5 min" button keeps it usable with reduced motion.
- **Widget results (Node harness, 5 runs each):**

  | Mode / map | Median error | p90 error | Median band |
  |---|---|---|---|
  | Cell mode, 20 trips | 0.35 km | 0.8 km | 2.5 km |
  | Cell mode, 2 trips | 0.95 km | 2.9 km | 8 km |
  | GPS | ≈ 10 m | – | – |

  In no-signal mode the band grows by about 1 km per 10 min.
- **Phone:** `draw(narrow)` uses a 360-wide viewBox with 14-unit text and no km labels, and is rebuilt through `ctx.onResize`. The checker reports min 13.2 px and p25 13.2 px. In the first screenshot the serving-cell label overlapped the belief baseline; it now sits below the baseline.
- **Code checks:**
  - **Python** Viterbi: run with Python 3.12, and the output matches the comments ([1] alone; [4, 6, 7, 8] with history).
  - **SQL:** run on a throwaway Postgres 16 with seeded pings. The stray pair, the 400 m fix and the 2-trip cell were excluded, and the unknown-cell report listed that cell.
  - **Java** PackController: compiles cleanly with `javac --release 21 -proc:none -Xlint:deprecation,removal` against the Spring Boot 3.5.16 classpath. Only imports and a package were added for the compile.
- **Not verified:** the founder interview text is used as given in the research brief, because the article did not surface in my searches. The 30 s RTIS interval comes from PIB-based coverage in search snippets.


---

## Ticket Booking & Flash Sales (`ticket-booking`)

- Widget: added a phone layout (`ctx.onResize`). viewBox is 360 wide with 8×4 seats at 42-unit pitch and 14–15-unit text. The lane legend moved into HTML on both layouts. Seat state now survives a resize because positions come from the row/column, not stored x/y. Phone fonts went from min 7.5 / p25 9.5 px to min 12.3 / p25 13.2 px. The race simulation and strategies are unchanged.
- Knobs: with Choreography chosen, the verdict still praised "an orchestrated saga". There is now a separate 👍 verdict for conditional UPDATE + choreography that names the trade-off (no single owner times out a stuck paid order).
- Knobs: added hints that say where the illustrative numbers come from: 10% of admitted users abandon a hold, and checkout time is exponential with a 2.5 min mean.
- Real world: added a Sep 2025 FTC lawsuit card. It says the suit *alleges* that brokers beat per-customer limits with thousands of accounts and proxy IPs. It cites the primary ftc.gov press release, and the bots interview answer and failure row now key limits on card, phone or device rather than only the account.
- Tl;dr: the "~3× bot traffic" figure is now worded as Live Nation's claim to the Senate. Senators questioned the testimony again in 2025, so it should not read as an established fact.
- Clarity: shortened the "sweeper" scenario step to under 220 characters.
- Code: ran the SQL snippet (hold, confirm, SKIP LOCKED sweep, `make_interval(mins => …)`) on Postgres 16. Ran the Lua hold script on redis-server, checking all-or-nothing and that an overlapping hold is rejected. Both are correct. The Spring snippet needs Spring Data, so it was not compiled. It was reviewed by eye and is fine.
- Checked and left alone: the Eras Tour figures (3.5B requests, 4× peak, 3.5M registered / 1.5M invited, ~15% of interactions with issues), the Queue-it pre-queue randomisation, SeatGeek's Lambda + DynamoDB + Fastly design, and the READ COMMITTED re-check explanation. All are correct as written.
- **Compile check:** The JPA repository + hold service compile cleanly (Spring Data JPA 3.5) with only imports and stub types added. I tested the native UPDATE with `make_interval(mins => ?)` on Postgres 16. **Fixed the note:** a two-session test showed that a concurrent retry with the same key blocks on the seat row locks and then updates 0 rows. So it usually fails with `SeatsUnavailableException`, not at the unique index. The note now says to re-read the hold by key on either error.


---

## Payment Gateway & Wallet (`payment-gateway`)

- Widget: the viewBox was already 360 wide, but its text was 10–12 units (9.4 px on a phone). Added a phone layout through `ctx.narrow` / `ctx.onResize`: 13–14-unit text, short account names (Receivable / Merchant / Fees, with the type line underneath), ledger rows show the amount only (no `·tN`), 5 rows instead of 6, and the colour legend moves to an HTML line. The state machine, the PSP-side key and the posting logic are untouched; desktop is unchanged. Phone fonts: min 9.4 / p25 9.4 px → min 12.3 / p25 12.3 px.
- Square Books (flagged: title and date only): the card now says what is known, namely a shared, immutable, double-entry service other teams post to, with a book-level balance kept next to the entries. That last point comes from the public discussion of the post, so the HN thread is added as a source. Square's post body did not surface in search, so nothing more specific is claimed (for example, the Spanner backend stays out).
- Uber: split the LedgerStore card. The 1.2 PB / 0.5 PB-index / double-write-and-compare migration now cites Uber's own migration post (canonical uber.com/blog URL), and the $6M/yr figure is attributed to InfoQ. tl;dr wording now says "migrated from DynamoDB".
- Stripe idempotency docs: re-verified 255 chars, the 24 h pruning, and "saves the first result even on failure, 500s included". Added the documented exception: validation failures and concurrent-conflict requests are not saved and can be retried.
- Knobs: the "key + cached response" note now says its 5% crash-leak rate is illustrative. The other meters were already consistent, and every option moves a meter or the verdict.
- Gap filled: a follow-up on the reconciliation question about the PSP webhook racing the synchronous response (one forward-only state machine keyed by PSP charge id), without adding a 13th question.
- Code: ran the ledger DDL on a scratch Postgres 16. A balanced 3-entry transaction commits and an unbalanced one is rejected at COMMIT by the deferred trigger. Ran the Python reconciliation against that DB with psycopg 3, and it classifies missing, extra and mismatched charges correctly. The Spring `JdbcClient` snippet needs Spring, so it was not run; its API calls (`optional()`, `ON CONFLICT … DO UPDATE … WHERE … RETURNING`) were checked by reading.
- Left alone: architecture, scenarios (the wallet debit/credit sign convention is correct for liability accounts), calculator (estimates already labelled) and the interview answers.
- **Compile check:** The JdbcClient charge snippet compiles cleanly (Spring 6.2). Only imports, stub types and the constructor the snippet says it omits were added. **Fixed:** running Phase 0 against Postgres 16 showed that a replay of a *finished* key re-locked it (`locked_at IS NULL` matched), so a second replay within 60 s got 409 "request in progress". The upsert now sets `locked_at = CASE WHEN recovery_point = 'finished' THEN NULL ELSE now() END`. Re-tested: concurrent request → 409, replays → stored response, every time.


---

## E-commerce Orders & Inventory (`ecommerce-orders`)

- Widget: added a phone layout through `ctx.onResize`. It uses a 340-wide viewBox drawn at about 1:1. The 4 + 3 state-machine nodes are 80 wide, titles are 12.5-unit and counts 14-unit. The stock-bar legend moved into HTML on both layouts, which also removed an empty band in the SVG on desktop. Phone fonts went from min 10 / p25 10.8 px to min 12.5 / p25 12.5 px. On desktop the stage is capped at 640px. The simulation (hold / expire / oversell logic and timings) is unchanged.
- Code bug (SQL): the payment-commit step updated `inventory` from a non-locking read of `reservations`, then flipped the reservation status in a second statement. A concurrent reaper could therefore release the same hold, and `reserved` would be decremented twice. It is now one CTE that flips the reservation row first (HELD → COMMITTED, with `expires_at > now()`) and then updates inventory from `RETURNING`. Reaper and commit now serialise on the reservation row. The note was rewritten to match.
- Code: the SQL snippet created an index on `reservations` without ever creating the table. Added the table, matching the data model. Ran the whole snippet on Postgres 16 with one live hold and one expired hold: the commit and reaper results are correct. Compiled and ran the `OrderStatus` enum on the JDK. The Spring snippets were checked by reading only.
- Knobs: Choreography, Browser-session cart, Redis cart, a 1-min TTL and a 30-min TTL all fell through to a generic "👍 Workable" or a ✅ that said "sane TTL" even at 30 min. Each now has a verdict that states its trade-off: hold expiring mid-payment (≈72% at 1 min), ≈25% of stock hidden at 30 min, carts lost on device switch or Redis eviction, no single owner for a stuck order.
- Gaps: added the failure row "hold expires while the payment commits", with its detection and fix. It ties the SQL fix to the widget's "hold expired while paying" case.
- Correctness: the "100+ pods at Shopify" figure could not be found in Shopify's pods post or elsewhere in search, so it was removed from the tl;dr and the timeline. The pods, Sorting Hat (Lua in the load balancer) and checkout-throttle claims are verified and were kept.
- Checked and left alone: the Dynamo cart (sloppy quorum, hinted handoff, vector clocks, resurrected deletes), Flipkart's 2014 Big Billion Day apology, and the microservices.io saga and outbox description. The calculator's Little's-law hold estimate is labelled as an estimate.
- **Compile check (Spring Boot 3.5.16 JDBC, Jackson):** both Java snippets compiled clean, with stub types `StaleTransitionException` and `OutOfStockException`. The transition table matches the page. On Postgres 16 with this page's schema: a retried checkout returned the same order, an out-of-stock line rolled back the order and the earlier holds, a stale `move` threw `StaleTransitionException`, and the order change and its outbox row committed together. No change.


---

## Food Delivery Platform (`food-delivery`)

- Widget: added a phone layout through `ctx.onResize`. It uses a 7×7 grid of 50-unit blocks (366-wide viewBox), larger restaurant, rider and pin markers, and 14–15-unit labels. Crossing the width threshold regenerates the batch, because the grid size changes. Phone fonts went from min 9.7 / p25 10.1 px to min 13 / p25 13.9 px. On desktop the grid is capped at 620px; it had been stretching to 2×. Greedy, Hungarian and the cost function are unchanged.
- Swiggy batching (flagged as having no primary source): searched Swiggy Bytes and found no engineering write-up of their batching. The Q1 FY26 shareholder letter (primary) only describes "Ecosaver" as opt-in batching. The claim that it is "used mainly for low order-value deliveries" could not be verified, so it was removed from the timeline, the stacking scenario and the interview answer. The timeline now says plainly that the batching mechanics on the page follow DoorDash and the academic paper, not Swiggy.
- Knobs: Greedy, One order per trip and Assign immediately all fell through to the same generic "👍 Workable" verdict. Each now has its own verdict that states the trade-off with the meter numbers: greedy is ~2 min slower to the door, assigning immediately leaves riders idle ≈ 6 min, and no stacking gives ~0.5 fewer orders per rider-hour.
- Gaps: added an interview question on broadcast offers ("first accept wins") vs. targeted solver offers. This is a classic follow-up the page had not covered.
- Code: ran the scipy Hungarian round (Python 3.12, scipy 1.18) with a forbidden pair and a rectangular matrix. Results are correct, and a forbidden order is dropped without stealing a useful rider. The Spring snippet (advisory lock per zone plus conditional updates) was checked by reading only. PostGIS is not installed here, so the KNN query was checked by reading only. The `<->` ordering on geography with a GiST index is valid.
- Checked and left alone: Swiggy's max(assignment + first mile, prep) + last mile decomposition, Zomato's prep-time model, and DoorDash's 2020 MIP/Gurobi (34× CBC, ≤10× Hungarian) and 2021 DeepRed. The calculator formulas (Little's law, ping writes/s) are consistent and labelled as estimates.
- **Compile check (Spring Boot 3.5.16 JDBC):** compiled clean with stub types (`Order`, `Rider`, `CostModel`, `Solver`). **Fixed a logic bug:** the "lost race" `IllegalStateException` escaped the `for` loop in `run()`, so one contested zone skipped every zone after it that round. The loop now catches it per zone. Verified on Postgres 16: the contested zone rolled back, and the next zone still got its offer and outbox row.


---

## Stock Exchange Matching Engine (`stock-exchange`)

- Widget: added a phone ladder through `ctx.onResize`. It uses a 340-wide viewBox, 10 price levels and 30-unit rows. Prices are 15-unit text and order sizes 14-unit. The "bids" header is shorter on phones; the caption already says "oldest on the inside". Phone fonts went from min 9.7 / p25 9.7 px to min 14 / p25 14 px. Matching logic is untouched.
- Widget: the order area on each side is a little narrower, so the "+N hidden orders" marker no longer overlaps the outermost order block. On desktop the stage is capped at 560px, so the ladder no longer grows to 2× scale.
- Knobs: with "Thread pool + locks" at the default load, the overload verdict said "Remove the DB from the hot path" even though no DB was selected. The verdict now names the real cause: a DB commit per order, lock contention, or the limit of a single thread.
- NASDAQ INET latency (flagged earlier as dropped): restored from Nasdaq's own page (nasdaqtrader.com/snippets/inet2.html). The page claims "more than 1M messages/s at sub-40 µs" and defines that as a port-to-port round trip in co-location over a full trading day. It now appears in a timeline card, a tl;dr number (it replaced the non-number "1 thread"), and the knobs intro. The 37 µs and 99.9% figures came from the SIX rollout (A-Team, a press source) and were left out on purpose.
- Gaps: added a split-brain failure row and an interview question on failover fencing (arbiter, epoch numbers, ack only after replication).
- Code, Python: the MoldUDP64 gap detector would crash on the end-of-session packet (count `0xFFFF`), because it tried to parse 65,535 messages. Added that check, plus a note on heartbeats. Tested with a fake socket covering a gap, a duplicate, a heartbeat and end of session.
- Code, Java: compiled and ran the OrderBook on JDK 17+ (price-time fills, trade at the resting price, cancel). The output is correct. The Disruptor snippet needs the LMAX jar and was not compiled. Its API calls match Disruptor 4.x by inspection.
- Checked and left alone: LMAX's 6M orders/s on one thread (Fowler), the HN clarification, the Island/Instinet/Nasdaq deal figures, and ITCH nanosecond timestamps over MoldUDP64. The knob meters are internally consistent, and every option changes the meters or the verdict.
- **Compile check:** Both Java snippets compile cleanly. The order book was run through crosses, FIFO within a level, partial fill + cancel, and an IOC market order, all as the comments describe. The Disruptor 4.0 pipeline compiles; its public classes were put in separate files, and `Journal`/`Replicator`/`Codec` were stubbed as the note says. Over 1M events the matcher never ran ahead of the journal or the replicator, and flushes were batched (about 19K flushes for 1M events). No changes.


---

## UPI Real-Time Payments (`upi-payments`)

- Widget: added a phone sequence diagram through `ctx.onResize`. It uses a 360-wide viewBox with lanes 71.5 apart, 31-unit rows and 14–15-unit text. On a width change, the messages already shown are redrawn. Phone fonts went from min 9.7 / p25 10 px to min 13.2 / p25 13.2 px. On desktop the stage is capped at 640px, because the 440-wide viewBox was stretching to about 2× and the lifelines filled the screen. The scripts and failure cases are unchanged.
- Status-check limits (flagged as press-sourced): found the rule in several press and law-firm summaries. NPCI's May 2025 circular, effective 1 Aug 2025, sets the first check ≥ 90 s after the payment and at most 3 checks in 2 hours. Searching npci.org.in did not surface the circular itself, so the new timeline card and interview answer say "reportedly" and cite Outlook Money.
- 2025 rules: the Jun 2025 "pay 30 → 15 s" deadline is still sourced only from MediaNama. The tl;dr and timeline now say "as reported". The P2P-collect shutdown (circular 29 Jul 2025, effective 1 Oct 2025) is left as is, with Business Today as its source.
- Code: the status-check back-off was 60 s × 2^n, which could put a second check only 60 s after the first. It is now 90 s × 2^n, so checks fall at about 90 s, 180 s and 360 s, all inside 2 hours. The code note now states the rule it follows. Ran the table DDL, idempotent insert (`ON CONFLICT DO NOTHING`), SKIP LOCKED claim and the reconciliation FULL JOIN on Postgres 16. All behave as described. The Spring/Resilience4j snippets need their libraries, so they were checked by reading only. The API calls exist in Resilience4j 2.x.
- Calculator: renamed the status-check output to "worst case: 3 each", because the formula multiplies by 3.
- Clarity: shortened the status-check-storm scenario caption to under 220 characters. Added a follow-up on what the app shows during the 90 s wait.
- Checked and left alone: the RBI 2019 TAT (UPI credit not received means reversal by T+1, else ₹100/day; T+5 for merchant cases). Also the Sep 2026 volume of 24.07B (≈ 9,300 TPS average and > 800M/day) and the Aug 2026 record of 24.51B, which are consistent. The knob breaker threshold (50%) matches the Resilience4j config in the code. Every knob option changes the meters or the verdict.
- **Compile check:** Both Java snippets compile cleanly (Resilience4j 2.2, Spring JDBC 6.2). The `@Scheduled` method was wrapped in a class. Both were run against Postgres 16 using the page's table. A client retry returned the original status without calling NPCI again. Business declines were ignored by the breaker. After 20 timeouts the breaker opened, and later payments were marked FAILED without being sent. Txn ids are 35 chars. The resolver backed off 90 s → 180 s → 360 s and stopped at 3 checks. No changes.


---

## Railway Ticketing (IRCTC) (`irctc-booking`)

- New page: Railway Ticketing (IRCTC). It covers IRCTC as the internet front end with booking done by CRIS's PRS, segment inventory, quotas, CNF / RAC / WL, charting, PNR, the payment ↔ PNR idempotency and auto-refund path, and the Tatkal surge. It goes deeper than `ticket-booking` (segments, RAC/WL promotion, charting, pay-first reconciliation) and links to it from `whenNot` and `related`.
- **Our design vs documented fact:** the berth bitmask, best-fit ordering, SKIP LOCKED allocation, booking-intent table, PRS de-duplication on intent id, reconciler, availability cache keyed by station pair, admission queue and "release unsold quota near charting" are all labelled as our design. CRIS internals are not public. The pay-first-then-allocate order is inferred from what users see ("paid but WL / refunded"), not from published internals. It is presented as a trade-off, not as a fact.
- **Facts used (sources in `realWorld.sources`):** peak 30,155 tickets/min (12 Mar 2025, 10:01) and 1,85,513 bookings in the peak hour (21 Mar 2024), and e-tickets at 86.38% of reserved tickets in FY 2024-25 (irctc.com). The new PRS target of > 1.5 lakh tickets/min (about 5× the current ~32K) and > 40 lakh enquiries/min, plus the 8 h chart (AIR News, FPJ, ThePrint). Tatkal at 10:00 AC / 11:00 non-AC, Aadhaar-only online Tatkal from 1 Jul 2025, agents barred for 30 min, and OTP for counter and agent bookings from 15 Jul 2025 (Tribune, Business Standard). About 50% bot logins in the first 5 min, and 2.5 crore IDs deactivated by Jun 2025 (MediaNama). About 3.02 crore IDs deactivated since Jan 2025, plus Akamai anti-bot (Angel One, Dec 2025). NGeT capacity of 2,000 → 7,200 tickets/min in Aug 2014 (Deccan Chronicle). 29 tickets a day in the early days → about 13 lakh a day by 2016 (Newslaundry). CONCERT developed by CRIS (Wikipedia). Two RAC passengers per side-lower berth (Wikipedia RAC). The waitlist cap went 25% → 60% AC / 30% non-AC in Jun 2025 (The Week / PTI). The combined lower-berth quota is about 6–7 per sleeper coach (Deccan Herald, Minister's reply). GNWL is preferred over TQWL at charting (erail.in explainer, not primary). Premium Tatkal uses dynamic fares on part of the Tatkal quota (Governance Now).
- **Hedged / not used:** the "37K/min" figures (unofficial) were not used. The PRS start date is given as "mid-1980s (1985 or 1986)" because sources disagree. The 2015 "15,000/min" NGeT upgrade appeared in a search summary with no clear source, so it was dropped. Premium Tatkal being non-refundable with no RAC/WL is worded as "widely reported" (secondary sites only). The Dec 2025 "previous day chart" change was not used.
- **Knobs:** every option changes the outcome (checker: 14/14). Load numbers are labelled illustrative. The allocation numbers come from my own simulation (72 berths, 7 segments, 110 short trips of 1–3 legs and then 40 end-to-end requests, 200 seeds):
  - one passenger per berth: 26% of berth-km sold, 0/40 long journeys served;
  - emptiest berth first: 40%, 0/40;
  - first-fit: 88%, ~35/40;
  - best-fit: 88%, ~35/40.
  - After 40 random cancellations, best-fit served 34.5/40 vs first-fit 33.8/40. The page says the two tie on a fresh train and best-fit wins only slightly after cancellations.
- **Widget:** a real bitmask allocator for 6 berths plus 2 side-lower RAC berths (4 slots) across 5 segments. It has first-fit / best-fit, RAC, then WL, in-order promotion (RAC → CNF, then WL → CNF/RAC for the first passenger who fits, with a note when a later WL jumps ahead), and charting that auto-cancels and refunds WL. The scan animates `mask & request` berth by berth, and a footer shows free berths per segment. There are two layouts via `ctx.onResize`: phone viewBox 360 with 13.5–15-unit text, and desktop viewBox 560 capped at 640px. Phone fonts are min 12.7 / p25 12.7 px.
  - Fixed during testing: the caption's first suggested demo showed no difference between the strategies. It now uses A→F + C→F, cancels #1, then books A→C: first-fit takes B1, best-fit takes B2.
  - Fixed during testing: a cancel during a burst was silently ignored. It now logs a message.
- **Code:**
  - SQL: ran on a throwaway Postgres 16. Best-fit picks the fuller berth, and a full train returns 0 rows. In a two-session test the second session skipped the locked berth and took another; when the locked berth was the only fit it got 0 rows, which is why the note says to retry without SKIP LOCKED.
  - Java: compiled with `javac --release 21 -proc:none -Xlint:deprecation,removal` against Spring Boot 3.5.16 with stubs for PrsClient / GatewayClient / PrsTimeoutException. It was also run against Postgres with fakes: duplicate callbacks made no second PRS call, a booked-but-timed-out intent became CONFIRMED, and an unbooked one got exactly one refund across 2 instances × 3 reconcile runs.
  - Python: ran on 3.11, and the output matches the note.
- Checker: `node tools/check.js --require-intro --fonts irctc-booking` passes on phone and desk (5 scenarios, 12 interview questions, 16 sources).


---

## Temple Darshan Booking Queue (`ttd-darshan-booking`)

- **New page.** It covers TTD's monthly darshan and seva release: a known T0, CDN and a pre-rendered calendar, pre-scaling, a virtual queue with signed tokens, FIFO vs randomised-at-T0 positions, date × slot counters, holds with a TTL, per-ID limits, OTP, the hold bounce after "quota full", and a seeded seva lucky dip. It links to `ticket-booking` (generic seat-level flash sale) and `live-streaming` (ladder pre-scaling) rather than repeating them.
- **Research:** 10 WebSearches.
  - Brief facts used and cited:
    - TTD Sep 2026: ≈6 lakh simultaneous users, ≈2.69 lakh quota, ≈4 per user (≈24 lakh, ≈9×), Virtual Queue, "Slot Unavailable" = quota full, and payment failures from banks or gateways. Sources: Telangana Today, Deccan Chronicle, UNI.
    - 2021: the Jio-built portal on a JioMart domain (Deccan Herald), and 1.10 lakh concurrent hits vs a normal 30–40K capacity (Deccan Chronicle, Aug 2021).
    - 2017: the Arjitha seva online dip (Hans India).
  - New and cited:
    - TCS as technology partner (Business Standard, Feb 2015).
    - About 2.4 lakh tickets in about 1 hour with about 1 crore hits (Zee News, Sep 2021). Deccan Chronicle said about 2 hours, and the page says the timing is approximate.
    - 807 reservations on one mobile and 926 on one email (Deccan Chronicle, undated).
    - Srivani online booking needs Aadhaar and a registered mobile (Deccan Chronicle).
    - A vigilance finding of software-assisted Srivani bulk booking, and TTD considering a lucky dip for Srivani (Deccan Chronicle; the year is not confirmed, so labelled "Undated report").
  - **Google Cloud:** two searches now show that UNI's report of the Sep 2026 statement quotes TTD saying the platform is "supported by technologies such as Google Cloud Platform, load balancing, auto-scaling and distributed architecture". The page includes it, attributed as TTD's own description via UNI. It was not independently verified.
- **Not used (unverified):**
  - A "once in 90 days" per-person rule and a "6 per booking" cap. These come only from booking-agency blogs, so the page presents per-ID and group limits as our design and gives no TTD numbers.
  - The 300/day Srivani donor quota, which appeared only on forums and agency blogs.
  - The official portal domain. Results disagreed between `ttdevasthanams.ap.gov.in` and `tirupatibalaji.ap.gov.in`, so neither is named.
  - The release day of the month. Reports differ, so none is hard-coded. The intro's "10:00" is a conceptual example.
- **Our design vs fact:** the architecture, queue algorithm (random pre-queue then FIFO), token format, counter schema, TTLs, admission rate and the commit-reveal draw are all our design. The real-world intro says that TTD has not published its internals.
- **Knobs:** the crowd and quota use TTD's figures. Capacities, the 10% bot share, payment outcomes (75% pay, 15% bank failures freed in about 1 min, 10% abandoned) and a 2-min mean payment time are labelled as estimates in the knobs intro. The 2021 freeze roughly matches the "no queue + autoscale" case: about 1.7 h to quota full, mostly errors. Every option changes a meter or the verdict (checker: 9/9).
- **Widget:**
  - 600 sessions and a 270-ticket quota, scaled 1:1,000.
  - 60 bot sessions under 12 identities, all in the pre-queue, clicking within 0.25 s.
  - A token bucket admits R/s. Holds are an atomic counter decrement per slot, with TTL expiry, immediate release on bank failure, and refunds for payments that arrive after expiry. The per-ID check frees the identity when a hold is released.
  - The same seeded crowd is replayed for each policy.
  - Typical run (seed 0): FIFO with no limit gives bots ≈89% of tickets; FIFO with the limit ≈18%; random with no limit ≈35%; random with the limit ≈17%.
  - Phone: a 360-wide viewBox with 13–13.5-unit text (min 12.3 px, p25 12.7 px). The legend and stats are in HTML.
- **Code:**
  - Java token issuer: compiled clean with `javac --release 21 -proc:none -Xlint:deprecation,removal` against `/tmp/snipbuild/cp.txt`. It was run with a fixed `Clock`: valid → true; wrong session, tampered signature, garbage, and expired after 11 min → false.
  - SQL: ran on a throwaway Postgres 16.15.
    - With quota 8, two holds of 4 commit and the third updates 0 rows.
    - A retried idempotency key inserts 0 rows, so the app rolls back.
    - A second confirm for the same ID and period fails on `bookings_id_hash_period_key`.
    - A confirm after expiry changes 0 rows.
    - The test showed that the same ID can still park a second *hold* until it expires, because the constraint fires at confirm. The note now says this and suggests a claim row per `(id_hash, period)`.
  - Python lucky dip: ran on Python 3.13. 36 entries win against 60 places (mixed 1- and 2-devotee entries), and the ranking is identical when the input order is reversed.
- **Checker:** `node tools/check.js --require-intro --fonts ttd-darshan-booking` → all ✓ (phone and desk). I looked at the screenshots of the intro, architecture, knobs and deep dive at both sizes. I shortened the knob hints, which had squeezed the meter labels, and renamed "Payment orchestrator" to "Pay orchestrator" so it fits the 18-character label limit.


---

## Video Streaming & Encoding (`video-streaming`)

- Widget: added a phone layout (360-wide viewBox, 13.5-unit axis and buffer labels, 15-unit status, 20 bars instead of 32, rung labels only from 1750 kbps up so they do not collide). The "next / net" readout moves into the HTML stats on phones. Rebuilt via `ctx.onResize`. ABR logic (throughput harmonic mean, BBA-0), timing and controls are unchanged, and the desktop layout is identical. Phone fonts: min 8.9 / p25 9.3 px → min 12.7 / p25 12.7 px.
- Apple's 6 s guidance: the Radiant Media Player summary was replaced by Apple's own "HLS authoring specification for Apple devices" (developer.apple.com). The segment-length answer now says the spec says target durations *should* be 6 s, which is a recommendation, not a rule. The exact wording was confirmed only through quotes of section 7.5.
- Netflix dynamic optimizer: the timeline now says the savings were reported per codec (x264, x265, VP9) rather than as one "~30%". The 28–38% range is attributed to summaries, because I could not see the primary per-codec figures.
- tl;dr: replaced the shaky "~30% dynamic optimizer" number with the primary-sourced "~90% of Netflix traffic over direct ISP connections (2016)", which is already in the timeline.
- 4K shot-based card: restated as "average BD-rate gain of about 50% across the 4K ladder", as reported in press coverage. The Netflix post itself did not surface in search, so Hackaday stays as the source.
- Calculator: segment requests/s now assume 6 s segments, in line with the knob default, the trade-offs table and Apple's guidance (it was 4 s), and the label notes that audio requests come on top.
- Knobs: the per-shot note now says its 40% saving is illustrative, as the per-title note already did. All options still move meters.
- Interview: added a codec-choice follow-up (H.264 first; HEVC/AV1 ladders for popular titles and capable devices) to the per-title question, rather than adding a 13th question.
- Code: ran the BBA-0 snippet against a 7-rung ladder; it matches the paper's rules and the widget. Ran the ffmpeg split/encode snippet on a generated 8 s test clip with ffmpeg; it works. The Java S3 presign snippet needs the AWS SDK, so it was not compiled; the API calls were checked by reading.
- Left alone: BBA "10–20% fewer rebuffers" (matches the SIGCOMM 2014 abstract), the Open Connect and VCU cards, the architecture and the scenarios.
- **Compile check:** The presigned multipart controller compiles cleanly against AWS SDK v2 2.57, and presigning a part URL works offline. **Fixed:** `complete` passed the client's part list to S3 unsorted, and S3 rejects parts that are not in ascending order (`InvalidPartOrder`). It now sorts by part number first.


---

## Top-K / Heavy Hitters (`top-k`)

- Widget: added a stacked phone layout (360-wide viewBox, `ctx.narrow` / `ctx.onResize`). The event line is split in two, the sketch grid spans the full width, the top-5 heap sits below it in full-width rows, and text is 13.5–15 units. Cell numbers are drawn only when a cell is ≥ 26 units wide (w ≤ 13); wider sketches show colour only on phones. Hashing (Carter-Wegman with p = 2³¹−1), the heap logic and the controls are unchanged, and the desktop layout is pixel-equivalent. Phone fonts: min 8.5 / p25 9.7 px → min 12.7 / p25 12.7 px.
- Redis Top-K: the "sizing guide: width ≈ k·log k, depth ≈ log k, min 5" claim could not be confirmed in Redis's docs (search showed different command defaults), so it is softened to "decay defaults to 0.9; width and depth are set when you reserve the key". The 0.9 decay default (tl;dr number) is consistent across sources and left alone.
- Interview: added "How big should the Count-Min Sketch be?", worked against the K-th item with the page's own numbers: 300K/s × 1 h ≈ 1.1 B events, #10 ≈ 540K, w = 2¹⁶ → εN ≈ 45K (≈ 8% of #10), d = 5 → 1.3 MB. These match the calculator defaults and the knob model (kth = 0.05% of N); all figures checked numerically.
- Checked and left: the CMS bounds (w = ⌈e/ε⌉, d = ⌈ln 1/δ⌉, never under-counts), the Space-Saving N/m bound and mergeability, HeavyKeeper's b^−count decay, the "trending = velocity vs baseline" framing and the 2010 Twitter post (its blog.twitter.com URL is the one that still surfaces in search).
- Knobs: every option moves a meter; the εN-vs-#10 percentages are consistent with the calculator. No change.
- Code: ran the Python CMS + top-K on a 50K-event Zipf stream; it recovers the exact top 5 and never under-counts (asserted). The w × d = 27,183 × 7 comment is correct. Ran the batch SQL twice on scratch Postgres 16: it is idempotent via ON CONFLICT and ranks correctly. The Jedis Top-K snippet needs Jedis and Redis 8, so it was not run; the method names (`topkReserve`, `topkIncrBy` with a map, `topkListWithCount`) were checked by reading.
- Not changed: architecture, scenarios (all ≤ 220 chars), glossary and calculator (estimates already labelled).
- **Compile check:** The Jedis Top-K snippet compiles cleanly against Jedis 6.0. The `topkReserve(key,k,width,depth,decay)`, `topkIncrBy(key, Map)` and `topkListWithCount` signatures match. It was not run, because no RedisBloom/Redis 8 module is available locally. No changes.


---

## Cloud Storage & File Sync (`file-sync`)

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
- **Compile check (Spring Framework 6.2 `RestClient`, JDK 21):** compiled clean. Ran it on a 4 MiB + 4 MiB + 100 B file against a fake HTTP server: it produced 3 blocks, and two identical blocks were uploaded only once. No change.


---

## Live Event Streaming (`live-streaming`)

- Widget: already passed the phone font check (380-wide viewBox, 14-unit text: min 12.5 / p25 12.5 px). I looked at the phone screenshots before and after "Star batter walks out" and the desktop shot; the labels are readable and nothing overlaps badly, so the widget was deliberately left unchanged.
- Hotstar dates (flagged as inferred):
  - "T for Tsunami" was labelled "Pre-2019". It is now "After Jun 2017", because the post itself refers to beating the 3M-concurrent record at the Champions Trophy (June 2017). The card now uses that context: the fleet was sized for 7M but not for the "tsunami" arrival shape.
  - "Scaling is not an accident" was labelled "2017". It is now "Undated", because no date could be confirmed; the card says it was written after 6+ months of IPL preparation.
- The tl;dr insight quoted autoscaling as "a useless strategy". The exact wording could not be confirmed, so it is now a paraphrase ("useless for spikes, because new capacity arrives too late") without quote marks.
- "Scaling Is Not An Accident" card: added the confirmed recommendation that clients add jitter to requests and retries.
- Gap filled: new interview question on a self-inflicted spike from your own push notification (batch the sends, client-side jitter, cheap deep-link target, pre-step the ladder). This links the push system to capacity planning.
- Code:
  - ffmpeg ladder: ran with a lavfi test source in place of SRT; it produces master.m3u8 plus three fMP4 renditions. Added `-pix_fmt yuv420p` so the output stays in a widely playable H.264 profile (a 4:4:4 source otherwise yields High 4:4:4).
  - Python HLL + ladder: ran against a scratch redis-server (5,000 sessions counted as 4,988, ladder levels correct).
  - Spring/Resilience4j snippet: needs Spring, so not run; the bulkhead/fallback signature was checked.
- Checked and left: the 25.3M and 18.6M figures (Akamai press release, re:Invent session report), the LL-HLS details (PART-HOLD-BACK ≥ 3 part targets), the 12 KB / 0.81% figures for Redis HLL, the calculator formulas, and the knobs (every option moves a meter or the verdict).
- **Compile check (resilience4j-spring-boot3 2.4.0):** compiled clean. Ran it in a minimal Spring context with the bulkhead and AOP auto-config and `max-concurrent-calls: 2`, `max-wait-duration: 0ms`. Two calls got personal rails, and the other three got the private `fallback` result straight away. The bulkhead keys in the comment match `InstanceProperties`. (The shared classpath mixes resilience4j 2.4.0 and 2.2.0; the run used aligned 2.4.0 jars.) No change.


---

## Newsfeed & Timeline (`newsfeed`)

- Widget: the 500-wide viewBox drew its subtitle at 8.8 px on a phone. Added a phone layout (`ctx.narrow` / `ctx.onResize`): a 360-wide viewBox with the 240 users in 12 columns instead of 16, the legend split over two lines in 13.5-unit mono, a 17-unit title, and dot radii scaled by 0.9 so the large top-row dots do not overlap. The same seeded power-law graph, push/pull logic, threshold slider and counters are used, and desktop is unchanged. Phone fonts: min 8.8 / p25 8.8 px → min 12.7 / p25 12.7 px.
- Interview: added "a reader follows 400 celebrities". The threshold is tuned for the average reader, so heavy readers blow up the pull side. Fixes: cap pulled sources per read, short-lived merged cache, or push celebrity posts to their most active followers. This is the classic follow-up to the hybrid answer.
- Java fan-out note: the worker stores only the post id, while the data model and calculator describe "post_id + author_id" entries. The note now says so and explains why packing the author id helps (muted-author filtering without hydration).
- Consistency checked: the knob default threshold (10⁵) matches the Java `CELEBRITY = 100_000`. The 800-id cap, 3 replicas, 30-day inactivity cut-off, 150M users / 300K QPS and the "5 minutes to 31M followers" figure are all attributed to Twitter's 2013 talk, consistently across tl;dr, calculator, scenarios and timeline.
- Left alone: Facebook Multifeed (2012), TAO (≈ 1B reads/s), Twitter's 2023 ranking pipeline (~1,500 candidates, ~half in-network) and Instagram's per-surface rankers. These are standard, well-sourced figures, so no web searches were spent on them.
- Code: ran the Python hybrid merge against a scratch redis-server. It merges pushed and pulled lists newest-first, deduplicates, and paginates correctly by cursor. Ran the follow-graph DDL and the cursor query on scratch Postgres 16; it skips tombstoned posts and pages by id. The Spring Kafka/Redis worker needs Spring, so it was not run; `queryForList(sql, Long.class, …)`, `executePipelined` and `listCommands()` were checked by reading.
- Scenarios are all ≤ 220 chars. The knobs already move every meter and label their numbers as illustrative; no change.
- **Compile check (spring-kafka, Spring Data Redis, JDBC):** compiled clean. Ran it on Postgres 16 and Redis with 2,500 followers, 10% of them inactive. Keyset pages of 1000 wrote 2,250 timelines, a celebrity post was skipped, and 805 posts trimmed a timeline to 800 (newest first). No change.


---

## Notification Gateway (`notifications`)

- **Widget, phone:** added a `build(narrow)` that redraws the SVG for phones, rebuilt via `ctx.onResize`. It is 360 wide and stacked: three full-width lanes with 15-unit labels and counts above each bar, a horizontal provider token bar with "PROVIDER · 40/s", "429!" and the token count, and a full-width OTP p95 sparkline. The desktop layout (lanes left, vertical bucket right) is unchanged. Fonts went from min 10.2 / p25 10.2 px to min 13.2 / p25 13.2 px. The simulation (token bucket, lanes, full-jitter retries) is untouched.
- **Interaction:** on a phone, set FIFO, promo 80/s and the limiter off. 429s, a growing retry lane and OTP p95 climbing above 2 s are all visible.
- **Flagged item, Netflix RENO ~150K events/s:** search again found the figure only in secondary coverage, not in Netflix's post excerpts. The timeline card now cites Netflix's own Tech Blog post for the design (priority-specific SQS queues and clusters, staleness filter) and attributes the 150K/s peak explicitly to InfoQ's coverage. The tldr label now reads "(InfoQ coverage, 2022)" instead of "(Netflix, 2022)".
- **Flagged item, APNs limits:** search surfaced Apple's "Sending notification requests to APNs" page, which is now added as a source. It confirms storage for up to 30 days via `apns-expiration` and that priorities 5 and 1 may be batched. The card now says `apns-priority` 10, 5 or 1 instead of "10 or 5". The 64-byte collapse-id and 4 KB payload limits are consistent across Apple-derived references (AWS Pinpoint docs, client libraries) and are kept.
- **Code fixes:**
  - The Python full-jitter helper slept once more after the final failed attempt. It now breaks on the last attempt; tested with 503 → 429(Retry-After) → 200, a permanent 400, and exhausted retries.
  - The Resilience4j note said "annotation order matters". Nesting is actually set by Resilience4j's aspect order (Retry wraps RateLimiter by default), so the note now says that.
- **Interview:** added one deep question on when to fall back from push to SMS or email. Escalate critical categories only, on a missing app-level ack, reusing the notification id; APNs and FCM give no device-delivery receipt.
- **Checked, left alone:** the FCM 600K/min default quota and 4096-byte payload (Firebase docs), the knob maths (FIFO OTP wait = drain time of the backlog at 10K/s), the calculator (labelled estimates), and the Uber RAMEN and Airbnb/Pinterest cards. The Spring/Kafka Java needs Spring and Resilience4j, so it was not compiled.
- **Compile check:** Both Java snippets (SMS sender + Resilience4j, Kafka lanes) compile cleanly with javac 21 (`--release 21 -Xlint:deprecation,removal`) against Spring Boot 3.5.16, spring-kafka 3.3 and Resilience4j 2.2. Only imports and stub `SmsJob`/`DeadLetters` types were added. I checked the commented `resilience4j.retry` keys against the starter's metadata. Turning on both exponential backoff and randomized wait gives `ofExponentialRandomBackoff` in 2.x. No changes.


---

## Autocomplete / Typeahead (`typeahead`)

- **Widget, phone:** added a 360-wide geometry chosen by `ctx.narrow` and rebuilt via `ctx.onResize`. It has 14–15-unit text, a 44-unit path and child spacing, 30-unit result rows, and a shorter scan header ("scan 202 nodes, sort 24"). The 400-wide desktop layout is unchanged. Fonts went from min 10.2 / p25 10.2 px to min 13.2 / p25 13.2 px. The trie, top-k maintenance and boost logic are untouched.
- **Interaction:** with the top-k cache off and prefix "s" on a phone, the orange subtree scan is visible and the stats show 203 nodes visited against 3 with the cache on.
- **Flagged item, Twitter backend typeahead:** the page makes no claim about Twitter's server-side typeahead. Twitter appears only as the author of the client library typeahead.js. Search confirmed the 2013 Twitter blog post (MIT-licensed, jQuery plugin) at the URL already cited, so nothing needed softening.
- **Interview:** added one deep question on multi-word, out-of-order matching ("design sys" → "system design"). It uses an inverted index over word prefixes and posting-list intersection, ties to LinkedIn Cleo's partial and out-of-order matching already on the page, and explains when to prefer it over the trie.
- **Code:**
  - Compiled and ran the Java trie (JDK 21). The top-k order is correct, lookup is case-insensitive, and a miss returns an empty list.
  - Ran the Postgres snippet on a temporary PG 16 with pg_trgm. The prefix query and the "sytem desing" fuzzy query both return "system design".
  - Ran the Python decay scorer. The 7-day half-life halves the score, rare and denylisted queries are dropped, and whitespace is normalised.
- **Checked, left alone:** the calculator formulas (labelled estimates), the knob maths (debounce → requests per search, the perceived-delay formula), and the 54·L edit-distance-1 variant count (Norvig's 54n+25). LinkedIn Cleo (2012, 150M members, ~20 ms), Pinterest 2014 and Google's prediction policies are attributed as before. Every knob option changes the meters.


---

## URL Shortener (`url-shortener`)

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


---

## Unique ID Generator (`unique-id`)

- **Widget, phone:** added a `build(narrow)` layout. Phones get a 360-wide viewBox, 8 rows × 8 bits, 15-unit bit text and a two-column legend; desktop keeps 4 × 16 rows. Rebuilt via `ctx.onResize`. Fonts went from min 6.9 / p25 9.0 px to min 12.3 / p25 14.2 px. The generator, burst and decode logic are unchanged.
- **Widget epochs:** replaced the placeholder 2024 epoch with real ones. Instagram uses `1314220021721` (24 Aug 2011), the `our_epoch` in its 2011 post's PL/pgSQL, as quoted in copies of the code. Sonyflake uses the v1 default StartTime of 2014-09-01 UTC; the v2 docs say the default is now 2025-01-01, and a code comment notes this.
- **Sources:** the Twitter "Announcing Snowflake" link now points at the canonical `blog.x.com` URL that appeared in search, not the old blog.twitter.com one. A search confirmed the post is by Ryan King, Jun 2010, but its full text was still not readable (WebFetch is blocked). The bit layout therefore keeps citing the GitHub README.
- **Real world:** added a Sonyflake timeline card: 39-bit 10 ms time, 8-bit sequence, 16-bit machine id from the private IP, and the v1/v2 default epochs. Previously the Sonyflake source was listed but unused. Added the sonyflake v2 docs as a source.
- **Instagram timeline:** now mentions the post's 2011 custom epoch constant.
- **Interview:** the Snowflake layout answer now notes that Twitter's code split the 10 machine bits into 5 datacenter + 5 worker bits (seen in several copies of `IdWorker.scala`). Added one question on running the generator across several datacenters (per-region id ranges, no failover of live ids).
- **Clarity:** replaced "SPOF" with "single point of failure" in the knob meter and the trade-off table.
- **Code:** ran the Python snippet: the UUIDv7 version and variant are correct, and the decoder works. Compiled and ran the Java Snowflake with a 200K-ID uniqueness and monotonicity test, which passed. The SQL is unchanged; it is Instagram's function with a 2024 epoch, and Postgres was not available to run it.
- **Checked, left alone:** bit maths (69.7 yrs, 174 yrs, 4,096/ms), the Discord layout and epoch, Flickr odd/even ticket servers, RFC 9562, PG18 `uuidv7()`, Python 3.14 `uuid.uuid7()`, the calculator formulas, and that every knob option changes the verdict.


---

## Job Queue & Task Scheduler (`job-scheduler`)

- **Widget, phone:** added a 360-wide layout chosen by `ctx.narrow` and rebuilt via `ctx.onResize`. The jobs column is 148 wide and the workers column 178, with all text at 14 units (about 13.2 px). Waiter counts shrink to `+3`, and "lock error, retry" becomes "lock error". The desktop geometry is unchanged. Fonts went from min 8.8 / p25 9.5 px to min 13.2 / p25 13.2 px. The locking semantics (FOR UPDATE, SKIP LOCKED, NOWAIT, kill and rollback) are untouched.
- **Interaction:** drove plain FOR UPDATE on a phone. All three waiters are visibly blocked on row #3 and the log shows the "0 rows, retry" re-check.
- **Code bug fixed (Java):** Spring's default `@Scheduled` pool has one thread, so `heartbeat()` could never run while `poll()` was processing jobs. Leases would expire, and long jobs would be duplicated. Added `spring.task.scheduling.pool.size >= 2` to the header comment and explained it in the note.
- **Calculator:** "Rows retained" and "Job-store size" multiplied by the retry rate, but the data model keeps one row per job and retries only bump `attempts`. Dropped the retry factor from those two outputs and labelled the size as an estimate.
- **Interview:** added one deep question on cron time zones and daylight-saving gaps or overlaps. It is a classic follow-up, and the `schedules` table already stores `tz`.
- **Clarity:** replaced "SPOF" in a knob verdict with "single point of failure".
- **Code tests:** ran the Postgres SQL (table, partial index, reaper, DAG readiness) on a temporary PG 16. The DAG query returns `clean_a`, `clean_b`. Also ran the Java claim and backoff statements verbatim. Imported the Celery snippet with celery in a temp venv; config and task options resolve. Spring Java was not compiled because it needs Spring on the classpath.
- **Checked, left alone:** PG 9.5 SKIP LOCKED (Jan 2016), Airflow 2.0 active-active schedulers, Cadence (2017) → Temporal (2019), Dropbox ATF guarantees and the InfoQ 9,000 tasks/s figure, FOQS. Every knob option changes the meters or the verdict.
- **Compile check (Spring Boot 3.5.16 JDBC):** compiled clean, with a `JobHandler` stub. Ran it on Postgres 16 with this page's `jobs` table. The `UPDATE … SKIP LOCKED … RETURNING` claim worked, and success marked the job `done`. A failure re-queued it with backoff (`run_at` in the future), and a stale attempt's ack updated 0 rows. `spring.task.scheduling.pool.size` exists in the Boot metadata. No change.


---

## Distributed Web Crawler (`web-crawler`)

- **Widget, phone:** added a 360-wide layout chosen by `ctx.narrow` and rebuilt via `ctx.onResize`. It has 16 Bloom-bit columns of 21 units instead of 32 × 15, 15-unit titles, and two-line host lanes: host plus queue head on one line, the queued/fetched count on the next. The desktop layout is unchanged. Fonts went from min 8.2 / p25 8.8 px to min 13.2 / p25 13.2 px. The hashing, FP formula and politeness timing are untouched.
- **Interaction:** drove it on a phone with m = 64 and 6 s of auto-crawl. The filter saturates to about 88% of bits set and false positives appear in the log, as intended.
- **Calculator note:** it said the 150 KB default "comes from" Common Crawl's ~185 KB per record. It now says the default is a rounded-down estimate, and that the 185 KB includes HTTP headers.
- **Knobs:** the fleet cap was 1.5K pages/s per server, while the calculator default is 1K/s. Aligned the knobs to 1,000/s and labelled both as estimates in the knobs intro.
- **Interview:** added one deep question on per-IP politeness when many hosts share an IP (shared hosting or CDN). This is a classic follow-up that per-host back queues alone do not answer.
- **Verified by search:** Common Crawl Aug 2026 has 2.14B pages and 360 TiB uncompressed, per the official blog. Left as is.
- **Checked from memory, left alone:** RFC 9309 details (24 h cache, 4xx allow, 5xx disallow, 500 KiB), IRLbot (6.3B pages / 41 days / 1,789 pages/s / 319 Mb/s), Manku et al. SimHash (64-bit, k = 3, 8B pages), Brin & Page (~300 connections, DNS cache), and the Bloom sizing answer (9.6 bits/URL, k ≈ 7, ~12 GB).
- **Code:** ran the Bloom filter. Its measured FP rate is 0.99% against a theoretical 1.0%. Ran the asyncio crawler skeleton end to end against the local server with aiohttp 3.14 in a temp venv. It also checks how `RobotFileParser` behaves with empty and disallow-all files. The Java SimHash needs Guava, so it was not compiled; the logic was reviewed by hand.
- **Compile check:** The Guava SimHash snippet compiles cleanly. On a 400-word page, one changed word moved the fingerprint 3 bits (near-duplicate), while an unrelated page was 27 bits away. No changes.


---

## Content Delivery Network (`cdn`)

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
- **Compile check (Spring Boot 3.5.16):** the controller compiled clean, with stub types `ProductDto` and `ProductService`. Ran it in embedded Tomcat: the 200 response sends `ETag`, `Cache-Control: max-age=60, public, s-maxage=86400, stale-while-revalidate=60` and `Cache-Tag`, and `If-None-Match` returns 304 with no body. All four `spring.web.resources.*` keys in the comment exist in the Boot metadata. No change.


---

## API Gateway (`api-gateway`)

- Widget: it already used a 360-wide viewBox with 14-unit text and passed (min 12.8 / p25 13.2px, unchanged). On a phone I drove backend "slow" plus a 40-request burst: the breaker row turns red (OPEN), 429 and 503 counts show up, and everything is readable. No change was needed.
- Flagged item, Zuul 2 numbers: replaced the Packt Hub summary with the primary Netflix Tech Blog post "Open Sourcing Zuul 2" (2018), which appeared in search. 80+ clusters, ~100 backend clusters and >1M req/s are confirmed. Added that WebSockets and rate limiting were listed as coming later in that release.
- Flagged item, Spring Cloud Gateway property prefix: verified against the Spring Cloud 2025.0 release notes (added as a source). The YAML now uses the real nested `spring.cloud.gateway.server.webflux.httpclient.*` keys and keeps the old prefix in a comment. The Java comment names the renamed starter `spring-cloud-starter-gateway-server-webflux`.
- Knobs: the default configuration (edge, async, gateway-only auth, no aggregation) used to get the bland "Workable" verdict. Verdicts now state the trade-off for: gateway-only auth (services trust headers, so lock down the network path), blocking I/O at very low latency (only works while backends answer within 20 ms), and a single edge with defence in depth. Every option changes the meters and/or the verdict.
- Gaps: added the interview question "How does the gateway handle WebSockets and other long-lived connections?" (connections as the capacity unit, Upgrade/idle timeouts, draining and jittered reconnects on deploy), with a cross-node delivery follow-up.
- Code: ran the PyJWT snippet in a temp venv with a generated RSA key and a stubbed JWKS fetch. A valid token decodes to sub/scopes, and a wrong audience is rejected. The Spring Java snippet was reviewed only, since there are no Spring jars: `RedisRateLimiter(10,20,1)`, `weight(group, n)`, `requestRateLimiter`/`circuitBreaker` config setters, and RedisRateLimiter failing open are all correct.
- Checked and left alone: Tomcat 200 default threads, AWS 10,000 rps / 5,000 burst per account per Region, Envoy (Sept 2016), the Zuul 2 2016 "connection scaling" lesson, the Little's-law calculator (estimates labelled) and Resilience4j config keys.
- **Compile check (Spring Cloud Gateway 4.3.5 / Cloud 2025.0.3, Boot 3.5.16):** the Java route config compiled clean with no deprecation warnings. Every YAML key was checked against the jars' config metadata and Resilience4j `InstanceProperties` setters, then bound with Boot's `Binder`. The breaker opens after 20 failures, because `minimumNumberOfCalls` is capped at the window size. `spring.cloud.gateway.server.webflux.httpclient.*` is the current prefix. No change.


---

## Distributed Search Engine (`search-engine`)

- Widget: added a phone layout (`ctx.narrow`, redrawn on `ctx.onResize`). The phone viewBox is 360 wide, with the indexing buffer as a full-width strip above the segment row and 14–15-unit text (up to 4 ids per segment, then "+N"). Font check went from min 8.8 / p25 9.5px (0% ≥12px) to min 13.2 / p25 14.2px. Indexing, refresh, merge and the BM25 scoring (Lucene idf, k1 = 1.2, b = 0.75) are unchanged, and desktop is identical. On a phone, index → refresh → index again shows the new segment and the hidden buffer doc as expected.
- Flagged item, BM25 default: now sourced to the Elasticsearch 5.0 reference "Similarity module" page (primary, appeared in search), which lists BM25 as the default with k1 = 1.2 and b = 0.75. The Elastic "Practical BM25" blog stays as a supporting source.
- Flagged item, `index.max_result_window`: now states the default (10,000) in the scenario, the interview answer and a new "Today" timeline item. That item cites the current Elasticsearch "Paginate search results" docs (search_after + tiebreaker + point in time; scroll no longer recommended).
- Flagged item, few sources: grew from 4 to 6 sources, both new ones primary Elastic docs.
- Gaps: added the interview question "How do you keep the search index in sync with the source database?" (CDC/outbox → Kafka keyed by id, `version_type=external`, reindex + alias swap; deletes follow-up). Added the matching failure row "Index drifts from the database".
- Code: ran the Python BM25 class on 3 docs; the ranking is correct. Reviewed the Spring Data Elasticsearch snippet (`NativeQuery`, `withSearchAfter`, `@Setting`), which is valid for Spring Data ES 5.x / Boot 3. It was not compiled because there are no jars.
- Checked and left alone: Earlybird (10 s, 2B queries/day, ~50 ms) from the ICDE paper, the translog fsync-per-request default, the refresh/flush/translog explanation, the knob model (every option changes meters/verdict; illustrative and says so), and the calculator.
- **Compile check:** The Spring Data Elasticsearch 5.5 snippet compiles cleanly. The two public types were put in separate files. Running the record through `MappingBuilder` produced the expected keyword/text/english mapping and 3 shards / 1 replica / 1s refresh, and a document reads back into the record. No changes.


---

## Real-Time Stream Analytics (`stream-analytics`)

- Widget: added a phone layout (`ctx.narrow`, rebuilt and restarted on `ctx.onResize`). The phone viewBox is 360 wide with four 10 s windows (desktop keeps six), 14–17-unit text and bigger dots. Font check went from min 9.2 / p25 9.2px (0% ≥12px) to min 13.2 / p25 13.2px. The watermark logic, allowed lateness, re-fire, purge and side-output behaviour are unchanged.
- Widget bug: "Inject late event" did not repaint while paused, so the window labels and stats lagged behind the log. It now repaints after each injection.
- Correctness: the Cloudflare timeline said rollups were used "rather than storing every raw request". The 2018 post (checked in search) also has a non-aggregated requests table; long raw retention was just too expensive. Reworded, and named which engine holds what (SummingMergeTree counters, AggregatingMergeTree unique IPs).
- Consistency: the knob model used a 30 s checkpoint interval, but the scenarios and the Flink code use 60 s. The knob now uses 60 s ("≤60 s commit").
- Knobs: the fallback "Workable" verdict now states the trade-off for session windows (results wait for the gap), sliding windows (≈6× state), long watermark lag (every result waits) and the heap backend (full checkpoints, GC risk). All options change meters and/or verdict.
- Clarity: defined two-phase commit (2PC) in the exactly-once note and SST files in the checkpoint scenario.
- Gaps: added one interview question on enrichment / stream-table joins (broadcast state or temporal join from CDC, keyed state, Async I/O with cache), with a replay follow-up.
- Checked and left alone: Uber "20+ ES clusters per region, millions of logs/s, several PB" (confirmed in search), Flink 1.3 incremental checkpoints, 1.4 TwoPhaseCommitSinkFunction, the Kafka `transaction.timeout.ms` 900000 (= broker default max), the Duration-based window APIs (Flink 1.19+), ReplacingMergeTree + FINAL, and the calculator (estimates already labelled). The Java snippet needs Flink jars, so it was reviewed but not compiled. There is no Python.
- **Compile check:** The Flink snippet compiles cleanly against Flink 1.20.5 and flink-connector-kafka 3.4, with no deprecation warnings when `CheckpointingMode` is `org.apache.flink.core.execution`. I added imports, a `main` wrapper, and stub types plus `lateSink`. `TumblingEventTimeWindows.of(Duration)` and `allowedLateness(Duration)` are the current APIs. It was not run (it needs Kafka). No changes.


---

## Log Aggregation & Observability (`observability`)

- Widget: added a phone layout (`ctx.narrow`, rebuilt on `ctx.onResize`). The phone viewBox is 360 wide, axis and legend text is 14–15 units, and the legend is shorter ("timestamp" / "value"). Font check went from min 8.8 / p25 8.8px (0% ≥12px) to min 13.2 / p25 13.2px. The Gorilla encoder (delta-of-delta buckets, XOR leading/trailing window, 5-bit lead + 6-bit length) and the 48-point series are unchanged, and desktop looks the same. On a phone, "Random floats" plus a tap on a bar still shows the per-point bit breakdown.
- Sources: replaced the Loki "next" (unreleased) docs URL with the stable `https://grafana.com/docs/loki/latest/` docs, which appeared in search. Added that Loki 3.0 introduced structured metadata for high-cardinality values such as trace ids, also from the official docs in search.
- Code: Spring Boot YAML now notes that its OTLP keys are Boot 3.4/3.5. Boot 4 renamed `management.otlp.tracing.*` to `management.opentelemetry.tracing.export.otlp.*`, confirmed in the Boot 4.0 configuration changelog and the OpenRewrite recipe. Kept `management.metrics.tags`: its 3.2 deprecation was reverted (spring-boot issue #38583).
- Knobs: the fallback verdict "Workable, check the meters" now names the trade-off for each case: head 10% (90% of error traces lost), full-text (index ≈ data size), all-hot (hot-disk price for cold data), and label cardinality 10^4 (a new ⚠ with series count and memory). Every option was checked and changes the meters and/or the verdict.
- Consistency: the cardinality scenario said "14 buckets/sum/count". It now says "14 series (12 buckets + sum + count)", matching the widget and the 700M figure.
- Clarity: defined exemplar (trace scenario), head block (calculator note) and OTLP (API row) on first use.
- Gaps: added the interview question "How does a Prometheus-style TSDB lay data out on disk?" (WAL, head, 2 h blocks, compaction, with a long-retention follow-up). Added the failure "out-of-order / late samples" with Prometheus 2.39's `out_of_order_time_window` (experimental, off by default; verified in search).
- Checked and left alone: Gorilla 1.37 B/point and the dod/XOR bit layout, Dapper 1/1024, M3 6.6B series, Monarch "TB/s", the OTel tail-sampling and memory_limiter config keys, the calculator formulas (estimates are already labelled), and the knob cost model (illustrative, labelled as estimates).
- **Compile check:** Both YAML items parse. Every Boot key in item 0 exists in the Boot 3.5.16 configuration metadata and none is deprecated: `management.tracing.sampling.probability`, `management.otlp.tracing.endpoint`, `management.otlp.metrics.export.url/step`, `management.metrics.distribution.percentiles-histogram.*`, `management.metrics.tags.*` and `logging.structured.format.console` (3.4+). The Boot 4 rename to `management.opentelemetry.tracing.export.otlp.*` matches the Boot 4.0 tracing docs. Item 1 is a valid Collector config: every pipeline component is defined, none is unused, memory_limiter comes first and batch last, and the tail_sampling policy fields are correct. No changes.


---

## Ad Click Aggregation (`ad-click-aggregation`)

- Widget: it already used a 360-wide viewBox and passed. The only sub-12px text was the 12-unit "event t →" axis label; it is now "event t" at 13 units. Font check went from min 11.3 / p25 13.2px to min 12.3 / p25 13.2px. On a phone, pause + dedup off + 4 duplicates + a late click shows orange double-counts, a red side-output ring and the naive vs stream vs truth rows clearly. The logic is unchanged.
- Sources: the Photon IdRegistry timeline item cited a personal reading-notes blog. It now cites the Photon paper itself (primary), and the secondary source was removed (6 → 5 sources, all primary or first-party).
- Correctness: confirmed the Uber 2021 post in search: 2-minute checkpoints with two-phase commit, 2 regions, a record UUID for idempotency, and Uber-contributed Pinot upsert. Left as is.
- Consistency: the requirement said "click → visible in ~1–2 min", but the knob model gives window + 30 s watermark + 60 s commit ≈ 2.5 min. The requirement and the dashboard scenario step now say ~2–3 min and name the three parts.
- Knobs: the fallback verdict "Correct counts" now states the trade-off for Lambda (two codebases), at-least-once + dedup (every sink must upsert), 5-min windows (pacing reacts in ~6½ min) and 10 s windows (6× rows). Every option changes the meters.
- Gaps: added the failure "Kafka unreachable from the click tracker" (local bounded spool, safe replay thanks to the upstream click_id) and the matching interview question with a follow-up.
- Code: ran the DuckDB reconciliation script (DuckDB 2.0, in a temp venv) against local Parquet and an in-memory stand-in for the Postgres table. Dedup, fraud filter, missing-row detection and the drift alert all behave correctly. Ran the Postgres upsert DDL/DML on a temp PG 16: re-fires overwrite, and `WHERE source = 'stream'` protects reconciled rows. The Flink Java needs Flink jars, so it was reviewed only (`open(OpenContext)`, `StateTtlConfig.newBuilder(Duration)`, keyed filter state are valid for 1.19+).
- Left alone: Photon (<10 s, millions of events/min), Kafka 0.11 EOS, the calculator (estimates labelled) and the knob numbers (illustrative, labelled).
- **Compile check (Flink 1.20.5, flink-connector-kafka 3.4.0-1.20, JDK 21):** the Java snippet compiled clean with `-Xlint:deprecation,removal`; only stub types were added (`Click`, `ClickSchema`, `CountClicks`, `ToAdMinute`). Ran it on a local MiniCluster, swapping the Kafka source for a bounded one. A repeated `click_id` was dropped, a late click within 5 min re-fired its window with the new count, and a later click went to the `too-late` side output. No change.


---

## LLM Inference Engine (`llm-inference`)

- Widget: the phone layout uses the same 60-block KV pool, drawn 6 × 10 in a 360-wide viewBox with 15-unit block labels, instead of 10 × 6 at 500 wide. It is rebuilt on resize. The allocator, scheduler and preemption logic are unchanged. Phone fonts went from min 9.5 / p25 9.5 px (0% ≥ 12px) to min 13.2 / p25 13.2 px. Drove it on a phone: contiguous mode for 14 steps, then tapped a block; the hatching and the block-table log read clearly.
- Model names removed as required. Generic descriptions replaced "Llama-3-70B-class" (tldr, calculator note, interview, code comment), "GPT-3 175B", "Vicuna" and "T5-XXL". The FastAPI snippet now reads the model name from `$MODEL` instead of hard-coding a model id.
- Knob verdict bug: the ✅ "what vLLM / TensorRT-LLM / SGLang do by default" verdict also fired for disaggregated prefill/decode, which is not a default. Speculative decoding and disaggregation now each get their own verdict stating the trade-off (small gain at large batch; ~1.5× GPUs plus KV transfer).
- Code: the FastAPI proxy now closes the upstream stream in `finally`. That aborts the vLLM request and frees KV even when the server cancels the generator on disconnect. Ran it end to end against a fake OpenAI-compatible SSE server with uvicorn; the deltas, the usage chunk and `[DONE]` all stream correctly. Ran the KV-sizing and BlockManager snippet, including block growth and release.
- Interview: added multi-LoRA serving (shared base weights, mixed-adapter batches, adapter id in the prefix-cache key, when to merge instead). The requirements mentioned LoRA, but the page never explained it.
- Sources: the vLLM prefix-caching doc URL is updated to the current `/design/prefix_caching/` path. The cross-tenant failure fix now names vLLM's `cache_salt`, which the vLLM docs confirm.
- Checked and left alone: the KV formula and numbers (327,680 B per token, 2.5 GiB per 8K sequence, ~470 MiB per 1.5K-token prompt). Also unchanged: Orca 36.9×, vLLM 14–24× / 2.2–2.5× / −50% GPUs, PagedAttention 2–4×, Splitwise 1.4× / 2.35× and DistServe 7.4× / 12.6×. All are consistent across the tldr, calculator, knobs and interview.


---

## Distributed Vector Database (`vector-db`)

- Widget, checked on a phone as asked even though it has no SVG text: dots, rings and edges were tiny at 500 × 320 scaled to ~340 px, and there was no legend. Phones now get a squarer 360 × 360 canvas, with dots, rings, query cross and walk lines scaled 1.35×, rebuilt via `ctx.onResize`. Added an HTML legend (layer colours, or k-means list and centroid in IVF mode; true top-5, found, query) that stays readable at any width. HNSW insert and search, k-means IVF and brute-force recall are unchanged; desktop geometry and data spread are identical. The font check passes (no SVG text). Drove both modes on a phone (ef 2 plus a random query; IVF with nprobe 2).
- Pinecone serverless restored as a sourced timeline item (Jan 2024): storage moved to object storage, stateless compute pages index portions in on demand, usage billing. Source: the AWS Partner Network blog, which appeared in search. Skipped the vendor "up to 98% cheaper" figure as marketing.
- Faiss paper now cited (Johnson, Douze, Jégou, arXiv 1702.08734), with a timeline item: GPU brute-force, IVF and PQ, and a 1B-vector k-NN graph in under 12 h on 4 GPUs. The recall snippet uses Faiss, so it ties in.
- pgvector now has a source (AWS Database blog on 0.8.0), plus a timeline item for iterative index scans (off by default; strict or relaxed order; `hnsw.max_scan_tuples` default 20,000). The SQL note explains why they matter: with default `ef_search` 40, a 10%-selective filter leaves about 4 rows. The Python note says that on pgvector < 0.8 the setting is rejected; verified this on a real pgvector 0.6.
- Code: the Faiss recall snippet used pure Gaussian random vectors, which gave recall@10 of only 0.06–0.52 even at ef 256 (I ran it). That would mislead a learner about HNSW. It now samples clustered vectors and gives a realistic curve (0.86 → 0.98 → 0.995 at ef 16 / 64 / 128 on the full 200K set, ~45 s on CPU), and the note reports the run. Ran the pgvector SQL and the psycopg ingest/retrieve snippet against Postgres 16 + pgvector 0.6, with a stub embedder in place of sentence-transformers. The tenant filter, cosine score and SET LOCAL inside the transaction all work.
- Interview: added "The index no longer fits in RAM: options, cheapest first" (fp16 / int8, dimension truncation, binary or PQ codes plus rescoring, DiskANN, sharding). It is a common follow-up to the sizing question.
- Checked and left alone: the sizing numbers (307 GB raw, ~128 B of links per vector at M = 16, 96-byte PQ = 32×), DiskANN (1B points / 64 GB RAM, >5,000 QPS, <3 ms) and PQ validated on 2B vectors. Also unchanged: the knob sweep (all 9 options change the outcome) and the post- vs pre-filter maths (40 × 0.5% = 0.2).


---

## RAG & AI Agent Platform (`rag-agent-platform`)

- Widget: added a phone layout (`ctx.narrow` / `ctx.onResize`). It uses a 360-wide viewBox with 13–15-unit text, stacks the BM25 and Dense columns, and shows 4 rows per retriever column on phones (5 on desktop). BM25, the toy vectors, RRF and the rerank maths are unchanged. Phone fonts went from min 9.3 / p25 9.3 px (0% ≥ 12px) to min 12.3 / p25 12.3 px. The desktop geometry is identical to before.
- RAG paper: verified it is NeurIPS 2020 (papers.nips.cc proceedings entry). The source now points to the proceedings abstract page, and the arXiv id is kept in `pub`.
- MCP: added the official spec page (Tools, 2025-03-26 revision) as a source. The timeline, the interview answer and the tool-failure scenario now give the real field name and semantics. A failed tool returns a result with `isError: true`, while an unknown tool or bad arguments raise JSON-RPC errors. Previously the page said `is_error`, which is the provider-API name.
- Calculator: replaced the "+50% graph overhead" index size, which was far too high for 1024-dim vectors, with float32 + about 200 B of HNSW links per vector, labelled as an estimate. Also noted that pgvector stores a second copy of each vector in the heap.
- Knobs: the chunk size is now 512 tokens, the same as the calculator and the "fixed 512-token windows" label (it was 400). Swept every option; each one changes the meters or the verdict. The context-stuffing note now mentions "lost in the middle".
- Interview: added a durable-execution question (crash mid-run: a step log, resuming from the last step, and idempotency keys from `(run_id, step)`). This is a practical gap for anyone building Python agents.
- Code: ran the hybrid-search snippet against a real Postgres 16 + pgvector 0.6 in /tmp. The SQL, the ACL filter and RRF all work. The iterative_scan line needs 0.8+, which the note already says. Documented the `embed` parameter. Ran the agent loop with fake models. Unknown tools now give a clear "unknown tool" error instead of a bare KeyError. The budget-exhausted message no longer promises "what I found so far", which the code never returned.
- Left alone: the Anthropic contextual-retrieval figures (5.7 → 3.7 → 2.9 → 1.9%), RRF k = 60 (pilot-fixed, Cormack 2009), RAGAS, and "Building effective agents". All are consistent with their sources and with the knob table.


---

## LLM Gateway (`llm-gateway`)

- Widget: added a phone layout (`ctx.narrow` / `ctx.onResize`). It uses a 360-wide viewBox, 15-unit lane labels and 14-unit column labels, and moves the app and gateway columns closer together. The token buckets, cosine semantic cache and routing logic are unchanged, and the desktop geometry is identical. Phone fonts went from min 10 / p25 10 px (0% ≥ 12px) to min 13.2 / p25 13.2 px. Drove it on a phone (tokens/s limits, threshold 0.84): the wrong-hit counter and log readout are legible.
- LiteLLM YAML: verified the key names against the LiteLLM reliability and semantic-cache docs via search. Confirmed: `model_list` / `litellm_params`, `router_settings` with `num_retries`, `timeout`, `allowed_fails`, `cooldown_time` and `fallbacks`, and `litellm_settings.cache_params` with `type: redis-semantic`, `similarity_threshold` and `redis_semantic_cache_embedding_model`. Fixed a real gap: that embedding setting must name a `model_name` in `model_list`, so the config now defines an `embed` model and points to it. The YAML parses cleanly. The note now says some doc examples put retries and fallbacks under `litellm_settings` instead.
- Semantic cache and agents: LiteLLM's docs warn that semantic caching suits single-shot prompts and replays stale answers on multi-turn or agentic traffic. Added this as a sourced timeline item (new source: the LiteLLM semantic-caching doc), as a bullet in the "risks of a semantic cache" answer, and in the code note.
- Interview: added "Your agents make 20–50 calls per task: what changes at the gateway?" It covers per-run budgets, fallbacks that preserve tool calling, no retries after side effects or mid-stream, and keeping prefixes byte-identical for provider prompt caching.
- Knobs: swept every option. The similarity slider changes the outcome only when the semantic cache is on, which is inherent, so its label now says "(semantic cache only)". All other options change the meters or the verdict.
- Code: ran the Lua token bucket in a real redis-server (four 3000-token takes against a 10K burst grant three and refuse one; the TTL is set; the HINCRBYFLOAT refund works). Did not compile the WebFlux class, which needs Spring; reviewed its reactive API usage, and the signatures are right.
- Checked and left alone: the Anthropic rate-limit dimensions (RPM, ITPM, OTPM) and 429 + retry-after, re-confirmed via the support article. Also unchanged: FrugalGPT "up to 98%" and the calculator's Little's-law concurrency. No model versions are named anywhere; the YAML uses placeholders.
- **Compile check (Spring WebFlux + reactive Redis, Boot 3.5.16):** the SSE proxy compiled clean. Ran it with the page's Lua script on a local Redis and a fake SSE provider. A request was granted, streamed 5 events and refunded the unused tokens with `HINCRBYFLOAT`. A request larger than the burst got 429. **LiteLLM YAML:** loaded with `litellm` 1.106.6 `ProxyConfig.load_config`; it built 4 deployments, the fallbacks and the retry/cooldown settings, and a `RedisSemanticCache` (threshold 0.95, embedding model `embed`). **Fixed** the cache comment: the semantic cache also needs `REDIS_PASSWORD` (or a redis_url), and startup fails without it.


---

## Recommendation System (`recommendation`)

- Widget: added a phone layout (`ctx.narrow` / `ctx.onResize`). It uses a 360-wide viewBox, 15-unit funnel labels and 13–14-unit chips and legends, rebuilt on resize. The catalog, embeddings, top-K retrieval, ranking and MMR code are untouched, and the desktop geometry is identical. Phone fonts went from min 9.3 / p25 9.3 px (0% ≥ 12px) to min 12.3 / p25 12.3 px. Drove it on a phone: watched 3 cooking videos and set diversity to 60%; the readout stays legible.
- Knobs: swept every option against the default. All 3 source options, all 3 freshness options and both ends of every range change the meters or the verdict. The checker's "4/6" comes from clicking each control's already-selected first option, which is not a dead option. Extra candidate sources now also add retrieval cost, so the cost meter responds to them too.
- Netflix ~80%: the source now points to the canonical DOI (10.1145/2843948, ACM TMIS 6(4), Dec 2015) instead of a gwern PDF copy.
- YouTube 2016 ranker: verified with search against the paper and summaries. It uses weighted logistic regression: clicked impressions are weighted by watch time and unclicked ones by 1, and serving uses e^x so the odds approximate expected watch time. The interview answer now explains this mechanism instead of a bare claim, and the timeline item mentions it.
- Interview: added "How do you avoid showing already-seen items?" (per-user seen set or Bloom filter, filtering before ranking, what counts as "seen"). This is a common follow-up the page lacked.
- Code: ran the PyTorch two-tower + logQ snippet for 50 steps on synthetic skewed data in a temp venv. Ran the pgvector SQL on Postgres 16 + pgvector 0.6; the watched filter, region filter and inner-product order all work, and the `iterative_scan` line is already marked 0.8+. Compiled and ran the Spring controller with JDK stubs; the 80 ms `orTimeout` falls back to the popular feed as described.
- Left alone: the PinSage figures (3B nodes, 18B edges, 7.5B examples), Monolith, the sampling-bias correction and the calculator formulas. All match their sources or are labelled estimates. The widget's 150 ms model-stage budget and the page's ~200 ms feed budget differ on purpose, and both are labelled illustrative.
- **Compile check:** The feed controller compiles cleanly with only imports and stub interfaces added. A small main confirmed it: a slow ranker (500 ms) and a failed ranker both return the popular fallback within ~80 ms via `CompletionException`, and a fast ranker returns the ranked page. No changes.


---

## Distributed Key-Value Store (`kv-store`)

- Widget: it already used a 360-wide viewBox. I raised the replica-version, rank (#1–#3) and "hint" labels from 12–13 to 14 units and made the viewBox 6 units taller so the bottom "hint" label is not clipped. Font check went from min 12.3 / p25 12.3px to min 13.2 / p25 13.2px. On a phone, sloppy quorum on + write + kill A and B + write + read shows the hint holder, the dashed read ring and the "fresh" log line clearly. Ring and quorum logic are unchanged.
- Flagged item, knobs "3 of 5 options change the outcome": every option does change the result (evaluated each option in turn). The checker clicks buttons in order, so already-selected buttons (strict, size-tiered) register as "no change". The generic fallback verdict "Quorums overlap, check the meters" now states the actual price: which fastest replica each operation waits for (ms) and how many replicas can be down for writes and for reads.
- Flagged item, Cassandra hint window: the official Cassandra "Hints" docs (added as a source) confirm `max_hint_window` defaults to 3 h. Fixed the semantics: it bounds how long new hints are stored for a down node; it is not a retention time for existing hints. The data model note and the hinted-handoff scenario step were reworded.
- Flagged item, gc_grace_seconds = 864000 (10 days): confirmed by The Last Pickle's hinted-handoff/GC-grace article in search. Left as is.
- Flagged item, Dynamo (3,2,2): the exact paper sentence did not surface in search, but a 2016 arXiv consistency survey citing the Dynamo paper, plus several university lecture notes, give ⟨3,2,2⟩ as the typical Dynamo configuration. Left as is.
- Gaps: added the failure "Queue-like table drowns in tombstones" (time-bucketed partitions, TTL + time-window compaction).
- Code: ran the Python vector-clock snippet; it prints `['a', 'book', 'pen'] {'Sx': 3, 'Sy': 1, 'Sz': 1}` as commented. Ran the Postgres half of the CQL/Postgres snippet on a temp PG 16. The Spring Data Cassandra Java (`@Consistency`, `InsertOptions`, `CqlOperations.execute(Statement)` → applied) was reviewed but not compiled, since there are no jars.
- Left alone: DynamoDB 89.2M req/s (Prime Day 2021, ATC 2022), the Cassandra 5.0 UCS recommendation, the R + W > N explanations and caveats, and the calculator (estimates labelled).
- **Compile check (Spring Data Cassandra 4.5 / DataStax driver 4.x):** compiled clean, split into one file per public type. `@Consistency`, `InsertOptions.consistencyLevel/ttl(Duration)` and `CqlOperations.execute(Statement)` (returns `wasApplied`) all exist. `spring.cassandra.request.consistency` exists in the Boot metadata. Not run (needs Cassandra). No change.


---

## Object Storage (`object-storage`)

- Widget: it already used a 360-wide viewBox. The fragment preview text went from 13 to 14 units, and data previews now show 8 characters instead of 9 so the larger text still fits its 103-unit box. Font check went from min 12.3 / p25 12.3px to min 13.2 / p25 13.2px. On a phone, AZ-a outage + one random disk failure + Read correctly shows "5 of 9 fragments left, need 6" with the lost boxes in red. The GF(2⁸) Reed-Solomon code and the durability model are unchanged.
- Flagged item, S3 multipart limits: verified against the S3 user guide "multipart upload limits" page (added as a source): 5 MiB–5 GiB per part (the last part may be smaller) and 10,000 parts. The API row and the interview answer now state both limits.
- New fact from that check: since Dec 2025 the S3 maximum object size is 50 TB, up from 5 TB (AWS What's New, added as a source). Added a timeline item. The practical cap stays 10,000 × 5 GiB ≈ 48.8 TiB.
- Code bug: the presigned multipart Java used a fixed 64 MiB part size, which breaks the 10,000-part limit for objects over 640 GiB. It now grows the part size to `max(64 MiB, ceil(size / 10,000))` and returns `partSize` to the client.
- Gaps: added the failure "Orphaned fragments" (data written but metadata commit failed → mark-and-sweep GC with a grace period), the natural counterpart of "metadata commit is the visibility point".
- Code runs: the Python durability model prints the commented 9.4 / 11.0 / 13.4 nines, and ~12.2 with a 1 h repair, as the comment claims. The Postgres versioned-metadata DDL plus PUT commit plus LIST-by-prefix ran on a temp PG 16, and a second PUT correctly leaves one latest version. The AWS SDK v2 Java was reviewed only (`presignUploadPart`, `completeMultipartUpload`), since there are no jars.
- Checked and left alone: 11 nines (AWS 2010 RRS post), the Dec 2020 strong-consistency announcement, f4 3.6× → 2.1× (2.8× without XOR), HDFS RS-6-3-1024k default, GFS 64 MB / 3 replicas, LIST 1,000 keys per page, and the calculator and knobs (every option changes the meters; estimates are labelled).
- **Compile check:** The AWS SDK v2 (2.57) presigned multipart snippet compiles cleanly with javac 21 (`--release 21 -Xlint:deprecation,removal`) with only imports added. The MinIO comment's `forcePathStyle` exists on the S3 client builder. No changes.


---

## Distributed SQL (`distributed-sql`)

- Widget: on phones the SVG uses a 360-wide viewBox instead of 440, so the same 13–16-unit text renders about 22% larger. The TrueTime axis, the Raft ring centre and the intro text adapt; the intro wraps to 4 lines and the Raft caption drops "slow motion", which moves into the HTML label. Rebuilt via `ctx.onResize`. The TrueTime interval and commit-wait maths and the Raft election logic are unchanged. Phone fonts went from min 11.6 / p25 11.6 px (0% ≥ 12px) to min 14.2 / p25 14.2 px. Drove both modes on a phone (commit wait off with worst-case skew shows "violated"; killing the leader elects N2 in term 2).
- CockroachDB range size: the third-party claim was replaced with primary sources. The 512/128 MiB default (up from 64/16 MiB) comes from GitHub PR #45209, and the v20.1+ docs list 512 MiB. The calculator note now states it plainly, and a timeline item was added.
- CockroachDB max clock offset: verified the 500 ms `--max-offset` default via the `cockroach start` docs, plus Cockroach Labs' note that 250 ms is generally safe with its clock guidance. Added a sourced timeline item and the default to the failure row. The HLC snippet's 500 ms default already matched.
- Code bug found by running it: ran the Java retry helper against a real Postgres 16 at SERIALIZABLE with 40 concurrent opposite-direction transfers. 10 of 40 failed with 40P01 (deadlock), which the loop did not retry. It now retries {40001, 40P01}: 0 failures, and the balance sum is preserved. Insufficient funds (P0001) still propagates. On CockroachDB, deadlocks already surface as 40001.
- Interview: added the ambiguous-commit question (SQLSTATE 40003 vs 40001, and idempotency via a client request id with a unique constraint). It is a classic follow-up to the retry-loop answer and is directly useful for agent tool calls that write to a database. The Java note now mentions 40003.
- Ran the HLC snippet: causality across a 300 ns-skewed peer, logical-counter bumps and max-offset refusal all behave as documented.
- Checked and left alone: the knob sweep (every option changes the meters) and Spanner ε ≈ 1–7 ms with a typical 4 ms. Also unchanged: the commit wait max(0, 2ε − consensus), the 3-replica default, 40001 semantics, READ COMMITTED 23.2 preview / 24.1 GA, and the multi-region SQL syntax. There is no CockroachDB binary here, so the SQL was reviewed rather than executed.
- **Compile check (JDK 21):** `CrdbTx` compiled clean. With a fake DataSource, three 40001 commits retried and then succeeded, a constant 40001 gave up after 6 attempts, and 23505 was not retried. On Postgres 16, "insufficient funds" (P0001) was not retried, and concurrent opposite transfers hit real 40P01 deadlocks that the loop retried with balances conserved. Under an 8-thread hammer on two rows, a few transfers used up all 6 attempts, which is the intended give-up. No change.
