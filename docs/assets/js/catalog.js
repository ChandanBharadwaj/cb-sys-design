/* Master list of domains and systems. Used by the index page and for cross-links. */
window.SD_CATALOG = {
  domains: [
    { id: 1, name: 'Core Infrastructure', icon: '⚙', blurb: 'The building blocks every large system leans on.' },
    { id: 2, name: 'Real-Time & Geospatial', icon: '◎', blurb: 'Moving things, live connections, millisecond decisions.' },
    { id: 3, name: 'Commerce & Financial', icon: '₹', blurb: 'Contention, money and correctness under spikes.' },
    { id: 4, name: 'Media & Heavy Data', icon: '▶', blurb: 'Petabytes of video, files and event streams.' },
    { id: 5, name: 'Social & Communication', icon: '✉', blurb: 'Feeds, notifications and search-as-you-type.' },
    { id: 6, name: 'Web Infrastructure', icon: '⌁', blurb: 'IDs, URLs, jobs, crawlers, edges and gateways.' },
    { id: 7, name: 'Search, Analytics & Observability', icon: '⌕', blurb: 'Indexing, streaming aggregation and telemetry.' },
    { id: 8, name: 'AI & ML Infrastructure', icon: '✦', blurb: 'Serving models, retrieval, agents and recommendations.' },
    { id: 9, name: 'Storage & Data Foundations', icon: '▦', blurb: 'The databases and stores underneath it all.' }
  ],
  systems: [
    { slug: 'rate-limiter', domain: 1, title: 'Distributed Rate Limiter', examples: 'Stripe, Cloudflare, Envoy', tags: ['token bucket', 'redis', 'lua'] },
    { slug: 'message-queue', domain: 1, title: 'Distributed Message Queue', examples: 'Kafka, Pulsar', tags: ['log', 'partitions', 'ISR'] },
    { slug: 'distributed-cache', domain: 1, title: 'Distributed Cache', examples: 'Memcache @ Facebook, Redis', tags: ['consistent hashing', 'leases'] },
    { slug: 'lock-manager', domain: 1, title: 'Distributed Lock Manager', examples: 'Chubby, ZooKeeper, etcd', tags: ['raft', 'fencing', 'lease'] },

    { slug: 'ride-sharing', domain: 2, title: 'Ride-Sharing Location & Dispatch', examples: 'Uber, Lyft', tags: ['H3', 'S2', 'matching'] },
    { slug: 'proximity-service', domain: 2, title: 'Proximity Service', examples: 'Yelp, Tinder, Google Maps', tags: ['geohash', 'quadtree'] },
    { slug: 'chat', domain: 2, title: 'Real-Time Chat & Messaging', examples: 'WhatsApp, Discord, Slack', tags: ['websocket', 'scylla'] },
    { slug: 'leaderboard', domain: 2, title: 'Live Leaderboard', examples: 'Gaming, Peloton', tags: ['sorted set', 'skip list'] },
    { slug: 'collab-editing', domain: 2, title: 'Collaborative Editing', examples: 'Google Docs, Figma', tags: ['OT', 'CRDT'], added: true },
    { slug: 'multiplayer-game', domain: 2, title: 'Multiplayer Game Backend', examples: 'Valorant, Agones', tags: ['tick rate', 'netcode'], added: true },

    { slug: 'ticket-booking', domain: 3, title: 'Ticket Booking & Flash Sales', examples: 'Ticketmaster, BookMyShow', tags: ['waiting room', 'locks'] },
    { slug: 'payment-gateway', domain: 3, title: 'Payment Gateway & Wallet', examples: 'Stripe, Airbnb, PayPal', tags: ['idempotency', 'ledger'] },
    { slug: 'ecommerce-orders', domain: 3, title: 'E-commerce Orders & Inventory', examples: 'Amazon, Flipkart, Shopify', tags: ['saga', 'reservation'], added: true },
    { slug: 'food-delivery', domain: 3, title: 'Food Delivery Platform', examples: 'Swiggy, Zomato, DoorDash', tags: ['dispatch', 'ETA'], added: true },
    { slug: 'stock-exchange', domain: 3, title: 'Stock Exchange Matching Engine', examples: 'LMAX, NASDAQ', tags: ['order book', 'sequencer'], added: true },
    { slug: 'upi-payments', domain: 3, title: 'UPI Real-Time Payments', examples: 'NPCI UPI, PhonePe, GPay', tags: ['switch', 'reconciliation'], added: true },

    { slug: 'video-streaming', domain: 4, title: 'Video Streaming & Encoding', examples: 'Netflix, YouTube', tags: ['ABR', 'CDN', 'DAG'] },
    { slug: 'top-k', domain: 4, title: 'Top-K / Heavy Hitters', examples: 'Twitter Trends', tags: ['count-min', 'sketch'] },
    { slug: 'file-sync', domain: 4, title: 'Cloud Storage & File Sync', examples: 'Dropbox, Google Drive', tags: ['chunking', 'dedup'] },
    { slug: 'live-streaming', domain: 4, title: 'Live Event Streaming', examples: 'Hotstar, JioCinema, YouTube Live', tags: ['LL-HLS', 'pre-scaling'], added: true },

    { slug: 'newsfeed', domain: 5, title: 'Newsfeed & Timeline', examples: 'X/Twitter, Instagram', tags: ['fan-out', 'celebrity'] },
    { slug: 'notifications', domain: 5, title: 'Notification Gateway', examples: 'APNs, FCM, Uber RAMEN', tags: ['priority', 'retry'] },
    { slug: 'typeahead', domain: 5, title: 'Autocomplete / Typeahead', examples: 'Google, LinkedIn, Amazon', tags: ['trie', 'top-k'] },

    { slug: 'url-shortener', domain: 6, title: 'URL Shortener', examples: 'TinyURL, Bitly', tags: ['base62', 'cache'] },
    { slug: 'unique-id', domain: 6, title: 'Unique ID Generator', examples: 'Twitter Snowflake, Instagram', tags: ['64-bit', 'clock'] },
    { slug: 'job-scheduler', domain: 6, title: 'Job Queue & Task Scheduler', examples: 'Airflow, Temporal, Celery', tags: ['DAG', 'lease'] },
    { slug: 'web-crawler', domain: 6, title: 'Distributed Web Crawler', examples: 'Googlebot, Common Crawl', tags: ['frontier', 'bloom'] },
    { slug: 'cdn', domain: 6, title: 'Content Delivery Network', examples: 'Akamai, Cloudflare', tags: ['anycast', 'tiered cache'], added: true },
    { slug: 'api-gateway', domain: 6, title: 'API Gateway', examples: 'Netflix Zuul, Envoy, Kong', tags: ['filters', 'BFF'], added: true },

    { slug: 'search-engine', domain: 7, title: 'Distributed Search Engine', examples: 'Elasticsearch, Lucene', tags: ['inverted index', 'BM25'] },
    { slug: 'stream-analytics', domain: 7, title: 'Real-Time Stream Analytics', examples: 'Flink, ClickHouse', tags: ['watermarks', 'checkpoints'] },
    { slug: 'observability', domain: 7, title: 'Log Aggregation & Observability', examples: 'Datadog, ELK, Dapper', tags: ['cardinality', 'sampling'] },
    { slug: 'ad-click-aggregation', domain: 7, title: 'Ad Click Aggregation', examples: 'Google Photon, Uber Ads', tags: ['exactly-once', 'dedup'], added: true },

    { slug: 'llm-inference', domain: 8, title: 'LLM Inference Engine', examples: 'vLLM, TensorRT-LLM', tags: ['PagedAttention', 'batching'] },
    { slug: 'vector-db', domain: 8, title: 'Distributed Vector Database', examples: 'Milvus, Qdrant, Pinecone', tags: ['HNSW', 'IVF-PQ'] },
    { slug: 'rag-agent-platform', domain: 8, title: 'RAG & AI Agent Platform', examples: 'Enterprise copilots, MCP', tags: ['hybrid search', 'agents'], added: true },
    { slug: 'llm-gateway', domain: 8, title: 'LLM Gateway', examples: 'LiteLLM, Portkey, Cloudflare AI GW', tags: ['routing', 'semantic cache'], added: true },
    { slug: 'recommendation', domain: 8, title: 'Recommendation System', examples: 'YouTube, Netflix, TikTok', tags: ['two-tower', 'ranking'], added: true },

    { slug: 'kv-store', domain: 9, title: 'Distributed Key-Value Store', examples: 'Dynamo, Cassandra', tags: ['quorum', 'LSM'], added: true },
    { slug: 'object-storage', domain: 9, title: 'Object Storage', examples: 'Amazon S3, GFS, HDFS', tags: ['erasure coding'], added: true },
    { slug: 'distributed-sql', domain: 9, title: 'Distributed SQL', examples: 'Spanner, CockroachDB', tags: ['TrueTime', 'raft ranges'], added: true }
  ]
};
