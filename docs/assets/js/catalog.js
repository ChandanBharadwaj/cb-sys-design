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

    { slug: 'ride-sharing', domain: 2, title: 'Ride-Sharing Location & Dispatch', one: 'Finds the right nearby driver for a rider in about a second, while millions of drivers keep moving.', examples: 'Uber, Lyft', tags: ['H3', 'S2', 'matching'] },
    { slug: 'proximity-service', domain: 2, title: 'Proximity Service', examples: 'Yelp, Tinder, Google Maps', tags: ['geohash', 'quadtree'] },
    { slug: 'chat', domain: 2, title: 'Real-Time Chat & Messaging', examples: 'WhatsApp, Discord, Slack', tags: ['websocket', 'scylla'] },
    { slug: 'leaderboard', domain: 2, title: 'Live Leaderboard', examples: 'Gaming, Peloton', tags: ['sorted set', 'skip list'] },
    { slug: 'collab-editing', domain: 2, title: 'Collaborative Editing', examples: 'Google Docs, Figma', tags: ['OT', 'CRDT'], added: true },
    { slug: 'multiplayer-game', domain: 2, title: 'Multiplayer Game Backend', one: 'Lets players in different places share one fair, cheat-proof game world that feels instant despite lag.', examples: 'Valorant, Agones', tags: ['tick rate', 'netcode'], added: true },

    { slug: 'ticket-booking', domain: 3, title: 'Ticket Booking & Flash Sales', one: 'Sells seats to a huge rush of fans so every seat goes to exactly one buyer and the site stays up.', examples: 'Ticketmaster, BookMyShow', tags: ['waiting room', 'locks'] },
    { slug: 'payment-gateway', domain: 3, title: 'Payment Gateway & Wallet', one: 'Charges a customer exactly once even when connections drop, and keeps a record of where every rupee went.', examples: 'Stripe, Airbnb, PayPal', tags: ['idempotency', 'ledger'] },
    { slug: 'ecommerce-orders', domain: 3, title: 'E-commerce Orders & Inventory', one: 'Takes online orders so stock, payment and shipping always agree, and the last item is never sold twice.', examples: 'Amazon, Flipkart, Shopify', tags: ['saga', 'reservation'], added: true },
    { slug: 'food-delivery', domain: 3, title: 'Food Delivery Platform', one: 'Decides which rider collects each order, and when, so food is picked up hot and delivered on time.', examples: 'Swiggy, Zomato, DoorDash', tags: ['dispatch', 'ETA'], added: true },
    { slug: 'stock-exchange', domain: 3, title: 'Stock Exchange Matching Engine', one: 'Matches buyers and sellers of shares fairly, in the exact order they arrived, without losing any order.', examples: 'LMAX, NASDAQ', tags: ['order book', 'sequencer'], added: true },
    { slug: 'upi-payments', domain: 3, title: 'UPI Real-Time Payments', one: 'Sends money instantly between any two Indian bank accounts, safely, even if a bank stops answering midway.', examples: 'NPCI UPI, PhonePe, GPay', tags: ['switch', 'reconciliation'], added: true },

    { slug: 'video-streaming', domain: 4, title: 'Video Streaming & Encoding', one: 'Plays videos smoothly for millions of viewers on any connection, without freezing or overloading servers.', examples: 'Netflix, YouTube', tags: ['ABR', 'CDN', 'DAG'] },
    { slug: 'top-k', domain: 4, title: 'Top-K / Heavy Hitters', examples: 'Twitter Trends', tags: ['count-min', 'sketch'] },
    { slug: 'file-sync', domain: 4, title: 'Cloud Storage & File Sync', examples: 'Dropbox, Google Drive', tags: ['chunking', 'dedup'] },
    { slug: 'live-streaming', domain: 4, title: 'Live Event Streaming', examples: 'Hotstar, JioCinema, YouTube Live', tags: ['LL-HLS', 'pre-scaling'], added: true },

    { slug: 'newsfeed', domain: 5, title: 'Newsfeed & Timeline', examples: 'X/Twitter, Instagram', tags: ['fan-out', 'celebrity'] },
    { slug: 'notifications', domain: 5, title: 'Notification Gateway', examples: 'APNs, FCM, Uber RAMEN', tags: ['priority', 'retry'] },
    { slug: 'typeahead', domain: 5, title: 'Autocomplete / Typeahead', examples: 'Google, LinkedIn, Amazon', tags: ['trie', 'top-k'] },

    { slug: 'url-shortener', domain: 6, title: 'URL Shortener', examples: 'TinyURL, Bitly', tags: ['base62', 'cache'] },
    { slug: 'unique-id', domain: 6, title: 'Unique ID Generator', examples: 'Twitter Snowflake, Instagram', tags: ['64-bit', 'clock'] },
    { slug: 'job-scheduler', domain: 6, title: 'Job Queue & Task Scheduler', one: 'Runs background and scheduled work reliably, retrying it when a machine dies halfway through.', examples: 'Airflow, Temporal, Celery', tags: ['DAG', 'lease'] },
    { slug: 'web-crawler', domain: 6, title: 'Distributed Web Crawler', one: 'Downloads billions of web pages quickly without overloading any one site or fetching the same page twice.', examples: 'Googlebot, Common Crawl', tags: ['frontier', 'bloom'] },
    { slug: 'cdn', domain: 6, title: 'Content Delivery Network', one: 'Delivers images, video and files fast to users worldwide without overloading your own servers.', examples: 'Akamai, Cloudflare', tags: ['anycast', 'tiered cache'], added: true },
    { slug: 'api-gateway', domain: 6, title: 'API Gateway', one: 'Gives many backend services one safe front door that checks every caller and sends requests to the right place.', examples: 'Netflix Zuul, Envoy, Kong', tags: ['filters', 'BFF'], added: true },

    { slug: 'search-engine', domain: 7, title: 'Distributed Search Engine', one: 'Finds the most relevant matches for typed words among billions of documents in milliseconds.', examples: 'Elasticsearch, Lucene', tags: ['inverted index', 'BM25'] },
    { slug: 'stream-analytics', domain: 7, title: 'Real-Time Stream Analytics', one: 'Turns an endless stream of late, out-of-order events into correct live numbers within seconds.', examples: 'Flink, ClickHouse', tags: ['watermarks', 'checkpoints'] },
    { slug: 'observability', domain: 7, title: 'Log Aggregation & Observability', one: 'Collects logs, metrics and traces from thousands of machines so engineers can find what broke, fast.', examples: 'Datadog, ELK, Dapper', tags: ['cardinality', 'sampling'] },
    { slug: 'ad-click-aggregation', domain: 7, title: 'Ad Click Aggregation', one: 'Counts billions of ad clicks within minutes, with every click counted exactly once for billing.', examples: 'Google Photon, Uber Ads', tags: ['exactly-once', 'dedup'], added: true },

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
