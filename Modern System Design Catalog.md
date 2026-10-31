# Modern System Design Catalog & Reference Guide

This document presents a comprehensive list of high-scale distributed system design problems, categorized by domain, along with their core architectural patterns and primary technical challenges.

---

## 1. Core Infrastructure Systems

### Distributed Rate Limiter
* **Purpose:** Controls incoming network traffic, prevents Denial-of-Service (DoS) attacks, manages API tier quotas, and protects backend microservices.
* **Key Challenges:** Enforcing limits across hundreds of edge instances with sub-millisecond latency and high consistency without becoming a bottleneck.
* **Core Patterns & Tech:** Token Bucket, Sliding Window Log, Redis in-memory datastore, Atomic Lua scripts / Redlock.

### Distributed Message Queue (e.g., Kafka, Pulsar)
* **Purpose:** Provides decoupled, high-throughput, fault-tolerant event streaming and pub/sub capabilities across services.
* **Key Challenges:** Ensuring message ordering per partition, zero-data-loss guarantees, high write throughput, and dynamic consumer rebalancing.
* **Core Patterns & Tech:** Append-only commit logs, distributed partitions, page cache utilization, zero-copy reads (`sendfile`).

### Distributed Cache (e.g., Redis, Memcached)
* **Purpose:** Accelerates read operations by storing hot data in memory, reducing load on underlying databases.
* **Key Challenges:** Managing cache invalidation, cache stampede (thundering herd), hotkeys, and data replication.
* **Core Patterns & Tech:** Consistent hashing with virtual nodes, eviction policies (LRU, LFU, ARC), master-replica replication, sentinel/cluster consensus.

### Distributed Lock Manager (e.g., ZooKeeper, Redlock, etcd)
* **Purpose:** Coordinates mutually exclusive access to shared resources across independent nodes in a cluster.
* **Key Challenges:** Dealing with clock drift, process pauses (GC), split-brain scenarios, and node failovers.
* **Core Patterns & Tech:** Consensus algorithms (Raft, Zab, Paxos), lease timers, fencing tokens.

---

## 2. Real-Time & Geospatial Systems

### Ride-Sharing Location & Dispatch System (e.g., Uber, Lyft)
* **Purpose:** Tracks moving drivers in real time and matches riders with the nearest available drivers within milliseconds.
* **Key Challenges:** Handling massive write-heavy location updates (hundreds of thousands/sec) and low-latency geospatial matching.
* **Core Patterns & Tech:** Spatial indexing (Google S2, Uber H3, Geohash), WebSockets, Kafka ingestion, in-memory location state buffers.

### Proximity Service (e.g., Yelp, Tinder, Google Maps Local)
* **Purpose:** Allows users to query nearby places, points of interest, or other users based on current GPS location.
* **Key Challenges:** Indexing static vs. dynamic location data and efficiently running range/radius queries over millions of entities.
* **Core Patterns & Tech:** Quadtrees, Spatial R-Trees, Geohash indexing, read-heavy Caching layer.

### Real-Time Chat & Instant Messaging (e.g., WhatsApp, Discord, Slack)
* **Purpose:** Delivers instantaneous 1-on-1 and group messages, tracking online/offline status and message delivery receipts.
* **Key Challenges:** Maintaining millions of concurrent open socket connections, guaranteed message delivery order, and massive message storage history.
* **Core Patterns & Tech:** Persistent WebSockets, TCP connection managers, Cassandra/DynamoDB for heavy writes, distributed heartbeats for presence tracking.

### Live Leaderboard Engine (e.g., Gaming, Fitness Apps like Peloton)
* **Purpose:** Tracks real-time scores across millions of concurrent users and computes global ranks instantly.
* **Key Challenges:** High write throughput with dynamic rank calculations and maintaining real-time updates for millions of active clients.
* **Core Patterns & Tech:** Redis Sorted Sets (Skip lists), write-behind batching, periodic rank snapshots.

---

## 3. High-Concurrency & Financial Systems

### Ticket Booking & Flash Sales (e.g., Ticketmaster, BookMyShow)
* **Purpose:** Sells limited inventory (concert seats, flash-sale products) under extreme concurrent request spikes.
* **Key Challenges:** Preventing double-booking, race conditions, dynamic seat hold timers, and system crashes under 100x traffic spikes.
* **Core Patterns & Tech:** Virtual waiting rooms/queues, pessimistic database locking, distributed transactions (Saga pattern), Redis inventory counters.

### Payment Gateway & Digital Wallet (e.g., Stripe, PayPal)
* **Purpose:** Processes credit card transactions and manages user balances with strict financial accuracy.
* **Key Challenges:** Ensuring zero double-charging, strict ACID compliance, idempotency on network timeouts, and fault tolerant auditing.
* **Core Patterns & Tech:** Idempotency keys, Immutable ledger databases, Double-entry bookkeeping, Event Sourcing.

---

## 4. Heavy Data & Media Streaming

### Video Streaming & Encoding Platform (e.g., Netflix, YouTube)
* **Purpose:** Ingests raw video files, encodes them into multiple resolutions/codecs, and streams them globally with adaptive bitrates.
* **Key Challenges:** Processing petabytes of video data, dynamic network bandwidth adaptation, and minimizing streaming buffer times globally.
* **Core Patterns & Tech:** Distributed DAG encoding pipelines, Chunked video storage (HLS/DASH), Multi-tier Content Delivery Networks (CDNs).

### Top-K / Heavy Hitters Analytics (e.g., Twitter Trending, Hot Topics)
* **Purpose:** Identifies the top $K$ most frequent items (e.g., hashtags, search terms) from a high-velocity stream in real time.
* **Key Challenges:** Computing exact counts at massive scale requires too much memory; requires memory-bounded approximation.
* **Core Patterns & Tech:** Count-Min Sketch, Heavykeeper, Space-Saving algorithm, sliding time windows in streaming engines (Apache Flink).

### Cloud Storage & File Sync (e.g., Google Drive, Dropbox)
* **Purpose:** Enables users to upload, store, synchronize, and share large files across multiple devices smoothly.
* **Key Challenges:** Bandwidth consumption, resolving sync conflicts across devices, and storing petabytes of block data efficiently.
* **Core Patterns & Tech:** Block-level file chunking, content-addressable storage (SHA-256 hashes), rolling hash algorithms (Rsync), metadata database separation.

---

## 5. Social, Content & Communication Systems

### Newsfeed & Social Timeline (e.g., X/Twitter, Instagram)
* **Purpose:** Generates personalized feeds of posts, media, and activities from followed accounts.
* **Key Challenges:** Solving the "Celebrity Problem" (accounts with millions of followers creating high fan-out pressure).
* **Core Patterns & Tech:** Hybrid Fan-Out model (*Fan-out on Write* for normal users, *Fan-out on Read* for high-follower accounts), timeline caching.

### Notification & Messaging Gateway (e.g., APNs, Firebase FCM)
* **Purpose:** Sends millions of real-time push notifications, SMS messages, and emails triggered by system events.
* **Key Challenges:** Handling rate limits from 3rd-party providers, prioritization (transactional vs. promotional), and user opt-out preferences.
* **Core Patterns & Tech:** Decoupled priority queues, user preference caches, worker pools, retries with exponential backoff.

### Autocomplete & Typeahead Search (e.g., Google Search, Amazon)
* **Purpose:** Suggests real-time, relevant query completions within milliseconds as the user types each character.
* **Key Challenges:** Ultra-low response latency ($<50\text{ ms}$), prefix matching over billions of historical search terms, and ranking queries by popularity.
* **Core Patterns & Tech:** Distributed Prefix Tries, Trie node caching, offline frequency aggregation workers, fuzzy string matching.

---

## 6. Distributed Systems & Web Infrastructure

### Distributed URL Shortener (e.g., TinyURL, Bitly)
* **Purpose:** Converts long URLs into short 6-8 character strings and redirects users instantly upon click.
* **Key Challenges:** Generating short, non-colliding unique keys at scale and serving billions of read requests with sub-10ms latency.
* **Core Patterns & Tech:** Base62 encoding, unique ID pre-generation, high cache-hit ratio ($90\%+$), 301 vs. 302 HTTP redirect strategies.

### Distributed Unique ID Generator (e.g., Twitter Snowflake)
* **Purpose:** Generates 64-bit monotonically increasing, globally unique IDs across distributed database shards without centralized locks.
* **Key Challenges:** High throughput requirement, preventing clock drift synchronization issues across nodes.
* **Core Patterns & Tech:** Snowflake ID structure: `[1 bit sign] + [41 bits timestamp] + [10 bits machine ID] + [12 bits sequence number]`.

### Distributed Job Queue / Task Scheduler (e.g., Celery, Airflow)
* **Purpose:** Orchestrates, schedules, and executes millions of background asynchronous jobs and workflows across worker nodes.
* **Key Challenges:** Task dependency management, preventing duplicate execution (at-least-once vs exactly-once execution), and node failover recovery.
* **Core Patterns & Tech:** Directed Acyclic Graphs (DAGs), heartbeat protocols, message broker queueing, lease renewals.

### Distributed Web Crawler (e.g., Googlebot)
* **Purpose:** Automatically visits and indexes web pages at massive web scale.
* **Key Challenges:** Respecting website politeness policies, managing duplicate page contents, and handling continuous link loops.
* **Core Patterns & Tech:** URL Frontier queue, Bloom filters for URL deduplication, DNS local cache, robot.txt parser.

---

## 7. Search, Analytics & Observability

### Distributed Search Engine (e.g., Elasticsearch, Lucene)
* **Purpose:** Enables fast full-text searching, ranking, and filtering over billions of semi-structured text documents.
* **Key Challenges:** Fast indexing vs fast retrieval tradeoffs, distributed shard allocation, and TF-IDF / BM25 score calculation across shards.
* **Core Patterns & Tech:** Inverted Index, Document Sharding, Primary-Replica replication, Segment merging.

### Real-Time Stream Analytics (e.g., Apache Flink, ClickHouse)
* **Purpose:** Processes incoming event streams in real time to calculate dashboard metrics, aggregate statistics, and trigger alerts.
* **Key Challenges:** Processing late-arriving or out-of-order data, stateful stream recovery, and exact-once processing guarantees.
* **Core Patterns & Tech:** Tumbling / Sliding / Session Windows, Columnar storage, LSM trees, Distributed Checkpointing.

### Log Aggregation & Observability (e.g., Datadog, ELK Stack)
* **Purpose:** Collects, parses, indexes, and visualizes logs, traces, and metrics across thousands of microservice instances.
* **Key Challenges:** Ingesting high-cardinality dynamic data without crushing backend storage or causing memory pressure on app hosts.
* **Core Patterns & Tech:** Log agents (Fluentd/Logstash), Columnar time-series databases, dynamic sampling algorithms, retention lifecycle policies.

---

## 8. AI & Machine Learning Infrastructure

### High-Throughput LLM Inference Engine (e.g., vLLM, TensorRT-LLM)
* **Purpose:** Serves large language models at low latency and high concurrency for generation tasks.
* **Key Challenges:** GPU memory constraints from Key-Value (KV) caching and slow token generation times.
* **Core Patterns & Tech:** PagedAttention (virtual memory management for KV cache), Continuous / Dynamic Batching, Tensor Parallelism.

### Distributed Vector Database (e.g., Milvus, Qdrant, Pinecone)
* **Purpose:** Indexes and retrieves high-dimensional vector embeddings for semantic search, recommendation systems, and RAG architectures.
* **Key Challenges:** Fast Approximate Nearest Neighbor (ANN) search across hundreds of millions of high-dimensional vectors.
* **Core Patterns & Tech:** Hierarchical Navigable Small World (HNSW) graphs, Inverted File Index with Vector Quantization (IVF-PQ), Cosine / Euclidean distance metrics.
---

## 9. Additional Systems (added to the Atlas)

These 16 systems extend the catalog above. Each has an animated page in the [System Design Atlas](https://chandanbharadwaj.github.io/cb-sys-design/).

### Live Event Streaming at Massive Scale (e.g., Hotstar, JioCinema, YouTube Live)
* **Purpose:** Streams a live event (cricket finals, concerts) to tens of millions of concurrent viewers with a few seconds of delay.
* **Key Challenges:** Traffic jumps by millions within minutes, autoscaling is too slow for such spikes, origin overload, and multi-CDN steering.
* **Core Patterns & Tech:** RTMP/SRT ingest, live ABR transcoding, HLS/LL-HLS segments, origin shield, pre-warmed ladder scaling, graceful degradation ("panic mode").

### Collaborative Editing (e.g., Google Docs, Figma, Notion)
* **Purpose:** Lets many users edit the same document at once and see each other's cursors live.
* **Key Challenges:** Converging concurrent edits, offline edits, and undo.
* **Core Patterns & Tech:** Operational Transformation (OT), CRDTs, one session server per document, op log + snapshots.

### Multiplayer Game Backend (e.g., Valorant, Fortnite, Agones)
* **Purpose:** Matches players and runs authoritative real-time game sessions.
* **Key Challenges:** Latency fairness, cheating, tick rate vs bandwidth, and scaling servers per match.
* **Core Patterns & Tech:** Matchmaking queues (Elo/TrueSkill), authoritative servers over UDP, client prediction, lag compensation, fleet allocation.

### E-commerce Orders & Inventory (e.g., Amazon, Flipkart, Shopify)
* **Purpose:** Handles cart, checkout and order lifecycle with accurate inventory.
* **Key Challenges:** Overselling during sale spikes, partial failures across services, and order state consistency.
* **Core Patterns & Tech:** Inventory reservations with TTL, Saga (orchestration), outbox → Kafka, order state machine.

### Food Delivery Platform (e.g., Swiggy, Zomato, DoorDash)
* **Purpose:** A three-sided marketplace connecting customers, restaurants and delivery riders.
* **Key Challenges:** Assigning riders so they arrive when the food is ready, accurate ETAs, batching several orders on one trip, and live tracking.
* **Core Patterns & Tech:** Batched assignment optimization, ML ETA models, geo-indexing, WebSocket tracking.

### Stock Exchange Matching Engine (e.g., NASDAQ, LMAX)
* **Purpose:** Matches buy and sell orders fairly at microsecond latency.
* **Key Challenges:** Deterministic ordering, fault tolerance without nondeterminism, and market-data fan-out.
* **Core Patterns & Tech:** Sequencer, single-threaded in-memory order book (price-time priority), event-sourced journal, LMAX Disruptor ring buffer.

### UPI-Style Real-Time Payments (e.g., NPCI UPI, PhonePe, Google Pay)
* **Purpose:** Instant bank-to-bank payments addressed by a virtual payment address (VPA).
* **Key Challenges:** Multi-party failures and timeouts, pending ("deemed") transactions, reconciliation, and festival peaks.
* **Core Patterns & Tech:** Central switch, idempotent transaction IDs, status-check + auto-reversal, per-bank circuit breakers.

### Content Delivery Network (e.g., Akamai, Cloudflare)
* **Purpose:** Serves content from edge servers close to users.
* **Key Challenges:** Hit ratio, global purge, origin protection, and DDoS absorption.
* **Core Patterns & Tech:** Anycast / DNS routing, tiered caching with origin shield, request coalescing, cache-key design.

### API Gateway (e.g., Netflix Zuul, Envoy, Kong)
* **Purpose:** Single entry point for authentication, routing, throttling and observability.
* **Key Challenges:** Avoiding a bottleneck or single point of failure, latency added by filters, and config rollout.
* **Core Patterns & Tech:** Non-blocking filter chains, JWT validation, rate limiting, circuit breakers, BFF pattern.

### Ad Click Aggregation (e.g., Google Photon, Uber Ads)
* **Purpose:** Counts ad clicks and impressions in near real time for billing and reporting.
* **Key Challenges:** Exactly-once counting (it is money), dedup, late events, and hot ads.
* **Core Patterns & Tech:** Kafka + Flink windows, idempotent sinks, Lambda/Kappa reconciliation, OLAP stores.

### RAG & AI Agent Platform (e.g., enterprise copilots, MCP tool ecosystems)
* **Purpose:** Answers questions and takes actions grounded in private data and tools.
* **Key Challenges:** Retrieval quality, hallucination, permissions, latency/cost budgets, and evaluation.
* **Core Patterns & Tech:** Chunking + embeddings, hybrid BM25 + vector search, reranking, tool-calling agent loop, guardrails, tracing and evals.

### LLM Gateway (e.g., LiteLLM, Portkey, Cloudflare AI Gateway)
* **Purpose:** One front door to many model providers.
* **Key Challenges:** Token-based rate limits and budgets, provider outages, streaming, and cost attribution.
* **Core Patterns & Tech:** Model routing and fallbacks, exact + semantic caching, token buckets, PII redaction, usage metering.

### Recommendation System (e.g., YouTube, Netflix, TikTok)
* **Purpose:** Ranks a personalized set of items from a catalog of millions within tens of milliseconds.
* **Key Challenges:** Multi-stage latency budgets, cold start, freshness, and training/serving skew.
* **Core Patterns & Tech:** Candidate generation (two-tower + ANN), ranking models, re-ranking for diversity, feature store, online training.

### Distributed Key-Value Store (e.g., Amazon Dynamo, Cassandra)
* **Purpose:** Always-available, horizontally scalable key-value storage.
* **Key Challenges:** Tunable consistency, node failures, and conflict resolution.
* **Core Patterns & Tech:** Consistent hashing with virtual nodes, quorum N/R/W, vector clocks / LWW, hinted handoff, Merkle-tree anti-entropy, LSM trees.

### Object Storage (e.g., Amazon S3, GFS, HDFS)
* **Purpose:** Stores trillions of objects durably and cheaply.
* **Key Challenges:** Eleven-nines durability, metadata scale, the small-files problem, and repair traffic.
* **Core Patterns & Tech:** Separate metadata and data planes, erasure coding (Reed-Solomon), multipart upload, scrubbing, lifecycle tiers.

### Distributed SQL (e.g., Google Spanner, CockroachDB)
* **Purpose:** Horizontally scalable SQL with serializable transactions across regions.
* **Key Challenges:** Global ordering of transactions, cross-shard commits, and multi-region latency.
* **Core Patterns & Tech:** Range sharding with a Raft group per range, 2PC over Raft, MVCC, TrueTime / hybrid logical clocks.

### Live Train Tracking, Offline (e.g., Where Is My Train by Google)
* **Purpose:** Shows a train's live position and expected arrival even on board with no mobile data or GPS fix.
* **Key Challenges:** Locating a moving train without GPS or internet, building a map of cell towers along tracks with no official data, predicting delays, and battery/data budgets on low-end phones.
* **Core Patterns & Tech:** Offline-first app with on-device timetables, cell-tower ID → track-segment fingerprints (crowdsourced from GPS traces), dead reckoning on the timetable, and background sync when online.

### Railway Ticketing at Tatkal Scale (e.g., IRCTC on CRIS PRS)
* **Purpose:** Books train berths for millions of passengers, including the 10 AM / 11 AM Tatkal rush.
* **Key Challenges:** One berth can be sold for several non-overlapping journey segments; quotas; waitlist → RAC → confirmed; charting; bots; payment timeouts.
* **Core Patterns & Tech:** Segment bitmask inventory per berth, quota pools, ordered waitlist promotion, idempotent booking with payment reconciliation, Aadhaar-OTP gating, anti-bot edge and CDN.

### Temple Darshan Booking Queue (e.g., TTD Tirumala)
* **Purpose:** Releases a fixed monthly quota of darshan and seva slots to millions of devotees who arrive in the same minute.
* **Key Challenges:** Demand many times the quota, fairness, bots and agents, payment failures holding slots, and not crashing at T0.
* **Core Patterns & Tech:** Virtual waiting room with paced admission, date × time-slot inventory with TTL holds, per-identity limits, electronic lucky dip for sevas, CDN and pre-scaling.
