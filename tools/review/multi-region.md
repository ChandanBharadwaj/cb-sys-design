# multi-region review

- New page: Multi-Region Active-Active. It answers "Design a multi-region active-active architecture" and covers:
  - active-passive vs active-active vs active-active with a home region;
  - global steering (GeoDNS vs anycast / global LB) and the DNS TTL tail;
  - data strategies by class: async multi-master with LWW / CRDT / app merge, single-home writes with async replicas, and synchronous cross-region consensus;
  - RPO / RTO per strategy, (N−1)/N headroom (and why the largest region sets the limit), and pre-scaling vs autoscaling lag;
  - evacuation drills, split-brain with leases, epochs and fencing, idempotency keys and region-aware IDs;
  - replication-lag heartbeats, which state stays regional (sessions, caches, queues), data residency and egress cost.
  
  It links to `distributed-sql` (consensus internals), `kv-store` (quorums, vector clocks), `distributed-cache` (cross-region invalidation), `cdn` (anycast vs DNS), `unique-id` and `message-queue` instead of repeating them.
- **Our design vs documented fact:** these are our design, not any one company's:
  - the 3-region topology with a consensus store for homes and epochs plus home-region writes;
  - the lease + epoch fencing protocol;
  - the heartbeat-row lag measurement;
  - the 307 home-routing filter;
  - the 85 % ceiling, the 30 % warm-standby size, and the knob RTO minutes. The RTO minutes are labelled estimates.
  
  The traffic shares in the widget (45/35/20 %) and the RTTs (75/120/190 ms) are labelled illustrative.

## Facts used (sources in `realWorld.sources`)
- **Netflix 2013 (TechBlog):**
  - two-region active-active for the Americas;
  - no cross-region calls on the user's call path;
  - async Cassandra multi-DC replication;
  - EVCache remote invalidation;
  - Route 53 layered over UltraDNS, with latency-based routing avoided because traffic moved unpredictably;
  - split-brain exercises run many times.
- **Netflix 2016 (TechBlog, "Global Cloud — Active-Active and Beyond"):** three regions, steering one region's traffic to both remaining regions, and personalisation recompute events delivered to all three regions.
- **Netflix Project Nimble (opensource.com 2018, by the Netflix speaker):** about 45 min failover before, and a breakdown of detect 2 + scale 4 + shift 3 ≈ 7 min after pre-scaling.
- **Shopify (InfoQ 2017):** each pod is active in one region and replicated to a second; Sorting Hat routing; the failover steps; the pauser.
- **Uber (Engineering blog, Dec 2020):** regional Kafka clusters plus aggregate clusters via uReplicator; active/active consumers (surge pricing) vs active/passive with offset mapping.
- **Slack (2023 blog + InfoQ Jan 2024):** cells after a 2021-06-30 AZ network disruption; InfoQ reports draining an AZ within about 5 minutes.
- **DynamoDB global tables (AWS docs and community.aws tutorial):**
  - LWW for concurrent writes in the default MREC mode;
  - the consistency mode is fixed at creation;
  - typical lag of 0.5–2.5 s between Regions in one geography (community.aws tutorial, which quotes the AWS guidance).
- **DynamoDB MRSC (AWS What's New):** GA on **30 June 2025**, with RPO 0.
- **Spanner (Google Cloud blog + replication docs):** read-write regions with a default leader, read-only replicas and a witness region; writes need a majority of voters; leader-aware routing.
- **AWS (Well-Architected REL13-BP02, DR whitepaper, Architecture Blog Part IV):** the DR strategies, and backups still needed with active-active.
- **Aurora Global Database (AWS docs):** listed as a source for the "async failover RPO is non-zero seconds; switchover RPO 0" framing used in interview answers.
- **CRDTs:** Shapiro et al., SSS 2011.

## Hedged or not used
- **MRSC preview date:** "previewed Dec 2024" comes from the task brief and an aws-news.com sidebar. The AWS GA post is the primary source used for the GA date.
- **MRSC expansion:** an aws-news.com item (Sep 2026) says MRSC expanded to cross-continent configurations. It is not verified against AWS, so it was not used.
- **MRSC region-set limits:** not stated on the page.
- **Chaos Kong:** the original Netflix "Chaos Engineering Upgraded" post did not appear in search results, so Chaos Kong is mentioned only by name as Netflix's region-evacuation exercise. The bram.us and IEEE pieces were not cited.
- **Netflix region count today:** not stated (secondary sources disagree, three vs four).
- **Global Accelerator:** "sub-second failover" claims came only from training notes and were not used. The page says "within seconds".
- **Inter-region price:** about $0.02/GB between big US regions comes only from third-party summaries of AWS pricing. It is labelled an estimate in the calculator, with "other pairs cost more".
- **Slack "weekly drains":** comes from a QCon abstract and was dropped.
- **Search budget:** the shared web-search budget ran out before I could look for an official AWS pricing-page URL or the Netflix EVCache cross-region AWS blog.

## Knobs
- Checker result: 9 buttons, 8 changes. The first click is the already-selected default.
- Every option changes the meters:
  - **Model** changes latency, RPO, conflicts, RTO, the hidden nodes and the verdict.
  - **N** changes survivor load (u·N/(N−1)), copies per write and consensus latency. For active-passive it changes fleet cost, because there are N−1 warm standbys.
  - **Utilisation** changes survivor load and fleet cost.
  - **Steering** changes the RTO and a note.
- **Special cases:**
  - Consensus with N = 2 gives the ❌ verdict (no majority after a loss).
  - Survivor load above 100 % gives ⚠ plus a shed percentage.

## Widget
- **The simulator:** a real 3-region replication simulator on one counter.
  - Each write produces per-link messages delivered after the lag slider value (with ±20 % jitter).
  - Partitioning US↔EU holds those messages in place, shown as red dots.
- **LWW:** applies when `(ts, origin)` is newer. "US + EU at once" converges to N+1 instead of N+2, and the log names the overwritten write.
- **CRDT:** a per-region slot vector with element-wise max merge. It always reaches the full count.
- **Home mode:**
  - It forwards non-home writes to us-east with the RTT shown (animation 8× slower).
  - It refuses writes when the home is unreachable (partition or down).
  - When the home fails, it re-homes to eu-west after a 1.2 s simulated detection, bumps the epoch, and the replica apply path rejects stale-epoch messages.
- **Fail / heal (tap a region or press Fail US):**
  - It drops the failed region's in-flight messages.
  - It counts acked writes that no live region has seen as RPO losses.
  - A healed region re-syncs from the survivors.
- **Utilisation:** spreads the failed share over survivors in proportion to capacity, so util = u / (1 − share_failed). With the default 60 % and US = 45 %, survivors reach 109 % and shed 8 %. The stats show "safe utilisation 55 %".
- **Tested in Playwright:**
  - LWW: 3 acked → 2.
  - CRDT: 3 → 3.
  - Home: 3 → 3, with forwarded latency ≈ 80 ms.
  - A partitioned EU write was refused.
  - Failing US right after 2 writes gave RPO 2, a re-home to EU at epoch 2, and survivors at 109 % (shed 8 %).
  - CRDT under partition converged after healing.
  - No page errors.
- **Layouts:**
  - Phone: viewBox 360×470, regions stacked, links curve on the right, text 14–24 units.
  - Desktop: viewBox 600×250, regions side by side with a US–AP arc.
  - Phone fonts: min 13.2 / p25 13.2 px.

## Code
- **SQL:**
  - Ran on Postgres 16 on port 5448. initdb refuses to run as root and the scratchpad socket path exceeds 107 bytes, so the server ran as the `postgres` user with its data and socket under `/tmp/pgs5448`. It was stopped afterwards.
  - Fenced apply: epoch 4 v7 → epoch 5 v1 wins. The zombie (epoch 4 v9) and the replay both return `INSERT 0 0`, and epoch 5 v2 wins.
  - PN-counter: the stale replicated row (4 < 6) keeps 6, a replay keeps 6, and the totals were 7 and then 8 as expected.
- **Java:**
  - `javac --release 21 -Xlint:all` against real Spring Boot 3.5.6 jars fetched with Maven (spring-web 6.2.11). It compiled cleanly.
  - It also ran inside a tiny Boot app on port 18448 with `app.region=us-east` and the SpEL map, tested with curl:
    - user homed in EU → 307 with `Location: https://eu.api/orders?x=1`;
    - lease not held → 503;
    - home user → 200 with the epoch attribute;
    - GET → served locally.
- **Python:** ran on 3.13 (3.11+ syntax only). The note quotes its exact output: losing us-east puts eu-west at 108 % and ap-south at 110 % with 21,800 rps over the ceiling; losing eu-west gives 92 % / 92 % with 7,350 rps over; losing ap-south gives 75 % / 75 %.

## Diagram
- One edge (ap-south → consensus store) crossed the Global steering box on desktop, so it was removed. The consensus-store tooltip says every region uses it.

## Checker
- `node tools/check.js --require-intro --fonts multi-region` reports ALL OK on phone and desk: 5 scenarios, 12 interview questions, 17 sources.
