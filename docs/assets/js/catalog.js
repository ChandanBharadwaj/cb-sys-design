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
    { slug: 'rate-limiter', domain: 1, title: 'Distributed Rate Limiter', one: 'Stops one caller from flooding your servers by capping how many requests each one can make.', examples: 'Stripe, Cloudflare, Envoy', tags: ['token bucket', 'redis', 'lua'] },
    { slug: 'message-queue', domain: 1, title: 'Distributed Message Queue', one: 'Passes events between services reliably, so a slow or crashed service never loses or blocks them.', examples: 'Kafka, Pulsar', tags: ['log', 'partitions', 'ISR'] },
    { slug: 'distributed-cache', domain: 1, title: 'Distributed Cache', one: 'Serves popular data from fast memory so the database is not asked the same thing over and over.', examples: 'Memcache @ Facebook, Redis', tags: ['consistent hashing', 'leases'] },
    { slug: 'lock-manager', domain: 1, title: 'Distributed Lock Manager', one: 'Makes sure only one machine does a job at a time, even when machines crash or freeze.', examples: 'Chubby, ZooKeeper, etcd', tags: ['raft', 'fencing', 'lease'] },

    { slug: 'ride-sharing', domain: 2, title: 'Ride-Sharing Location & Dispatch', one: 'Finds the right nearby driver for a rider in about a second, while millions of drivers keep moving.', examples: 'Uber, Lyft', tags: ['H3', 'S2', 'matching'] },
    { slug: 'proximity-service', domain: 2, title: 'Proximity Service', one: 'Finds the shops, restaurants or places nearest to you out of millions, in a split second.', examples: 'Yelp, Tinder, Google Maps', tags: ['geohash', 'quadtree'] },
    { slug: 'chat', domain: 2, title: 'Real-Time Chat & Messaging', one: 'Delivers messages instantly and in order to every device, and catches you up after you were offline.', examples: 'WhatsApp, Discord, Slack', tags: ['websocket', 'scylla'] },
    { slug: 'leaderboard', domain: 2, title: 'Live Leaderboard', one: 'Ranks millions of players by score and tells anyone their exact position the moment scores change.', examples: 'Gaming, Peloton', tags: ['sorted set', 'skip list'] },
    { slug: 'collab-editing', domain: 2, title: 'Collaborative Editing', one: 'Lets many people edit the same document at once and always end up with the same text.', examples: 'Google Docs, Figma', tags: ['OT', 'CRDT'], added: true },
    { slug: 'multiplayer-game', domain: 2, title: 'Multiplayer Game Backend', one: 'Lets players in different places share one fair, cheat-proof game world that feels instant despite lag.', examples: 'Valorant, Agones', tags: ['tick rate', 'netcode'], added: true },
    { slug: 'train-tracking', domain: 2, title: 'Live Train Tracking (Offline)', one: 'Shows where your train is and when it will arrive, even with no internet or GPS on board.', examples: 'Where Is My Train (Google)', tags: ['cell towers', 'offline-first'], added: true },

    { slug: 'ticket-booking', domain: 3, title: 'Ticket Booking & Flash Sales', one: 'Sells seats to a huge rush of fans so every seat goes to exactly one buyer and the site stays up.', examples: 'Ticketmaster, BookMyShow', tags: ['waiting room', 'locks'] },
    { slug: 'payment-gateway', domain: 3, title: 'Payment Gateway & Wallet', one: 'Charges a customer exactly once even when connections drop, and keeps a record of where every rupee went.', examples: 'Stripe, Airbnb, PayPal', tags: ['idempotency', 'ledger'] },
    { slug: 'ecommerce-orders', domain: 3, title: 'E-commerce Orders & Inventory', one: 'Takes online orders so stock, payment and shipping always agree, and the last item is never sold twice.', examples: 'Amazon, Flipkart, Shopify', tags: ['saga', 'reservation'], added: true },
    { slug: 'food-delivery', domain: 3, title: 'Food Delivery Platform', one: 'Decides which rider collects each order, and when, so food is picked up hot and delivered on time.', examples: 'Swiggy, Zomato, DoorDash', tags: ['dispatch', 'ETA'], added: true },
    { slug: 'stock-exchange', domain: 3, title: 'Stock Exchange Matching Engine', one: 'Matches buyers and sellers of shares fairly, in the exact order they arrived, without losing any order.', examples: 'LMAX, NASDAQ', tags: ['order book', 'sequencer'], added: true },
    { slug: 'upi-payments', domain: 3, title: 'UPI Real-Time Payments', one: 'Sends money instantly between any two Indian bank accounts, safely, even if a bank stops answering midway.', examples: 'NPCI UPI, PhonePe, GPay', tags: ['switch', 'reconciliation'], added: true },
    { slug: 'irctc-booking', domain: 3, title: 'Railway Ticketing (IRCTC)', one: 'Sells the same berth for different parts of a journey, fairly, when lakhs of people hit Tatkal at 10 AM.', examples: 'IRCTC, CRIS PRS', tags: ['segments', 'waitlist/RAC'], added: true },
    { slug: 'ttd-darshan-booking', domain: 3, title: 'Temple Darshan Booking Queue', one: 'Gives a few lakh darshan slots to millions of devotees who all log in the same minute, without crashing or cheating.', examples: 'TTD Tirumala (Tirupati)', tags: ['virtual queue', 'quota release'], added: true },

    { slug: 'video-streaming', domain: 4, title: 'Video Streaming & Encoding', one: 'Plays videos smoothly for millions of viewers on any connection, without freezing or overloading servers.', examples: 'Netflix, YouTube', tags: ['ABR', 'CDN', 'DAG'] },
    { slug: 'top-k', domain: 4, title: 'Top-K / Heavy Hitters', one: 'Finds the most popular or fastest-rising things, like trending hashtags, in a never-ending flood of events.', examples: 'Twitter Trends', tags: ['count-min', 'sketch'] },
    { slug: 'file-sync', domain: 4, title: 'Cloud Storage & File Sync', one: 'Keeps your files the same on all your devices, sending only the changed parts and never losing an edit.', examples: 'Dropbox, Google Drive', tags: ['chunking', 'dedup'] },
    { slug: 'live-streaming', domain: 4, title: 'Live Event Streaming', one: 'Streams one live event to millions of people at once, without crashing when everyone tunes in together.', examples: 'Hotstar, JioCinema, YouTube Live', tags: ['LL-HLS', 'pre-scaling'], added: true },

    { slug: 'newsfeed', domain: 5, title: 'Newsfeed & Timeline', one: 'Shows each person a fresh feed of posts from everyone they follow, in a blink, even when a star posts.', examples: 'X/Twitter, Instagram', tags: ['fan-out', 'celebrity'] },
    { slug: 'notifications', domain: 5, title: 'Notification Gateway', one: 'Delivers alerts by push, SMS and email so urgent codes arrive in seconds, even during a huge promo blast.', examples: 'APNs, FCM, Uber RAMEN', tags: ['priority', 'retry'] },
    { slug: 'typeahead', domain: 5, title: 'Autocomplete / Typeahead', one: 'Suggests the best ways to finish what you are typing, updated instantly on every keystroke.', examples: 'Google, LinkedIn, Amazon', tags: ['trie', 'top-k'] },

    { slug: 'url-shortener', domain: 6, title: 'URL Shortener', one: 'Turns long web links into short ones that never clash and open instantly, even when they go viral.', examples: 'TinyURL, Bitly', tags: ['base62', 'cache'] },
    { slug: 'unique-id', domain: 6, title: 'Unique ID Generator', one: 'Lets many machines create IDs at once that never repeat and sort roughly by time, without asking each other.', examples: 'Twitter Snowflake, Instagram', tags: ['64-bit', 'clock'] },
    { slug: 'job-scheduler', domain: 6, title: 'Job Queue & Task Scheduler', one: 'Runs background and scheduled work reliably, retrying it when a machine dies halfway through.', examples: 'Airflow, Temporal, Celery', tags: ['DAG', 'lease'] },
    { slug: 'web-crawler', domain: 6, title: 'Distributed Web Crawler', one: 'Downloads billions of web pages quickly without overloading any one site or fetching the same page twice.', examples: 'Googlebot, Common Crawl', tags: ['frontier', 'bloom'] },
    { slug: 'cdn', domain: 6, title: 'Content Delivery Network', one: 'Delivers images, video and files fast to users worldwide without overloading your own servers.', examples: 'Akamai, Cloudflare', tags: ['anycast', 'tiered cache'], added: true },
    { slug: 'api-gateway', domain: 6, title: 'API Gateway', one: 'Gives many backend services one safe front door that checks every caller and sends requests to the right place.', examples: 'Netflix Zuul, Envoy, Kong', tags: ['filters', 'BFF'], added: true },

    { slug: 'search-engine', domain: 7, title: 'Distributed Search Engine', one: 'Finds the most relevant matches for typed words among billions of documents in milliseconds.', examples: 'Elasticsearch, Lucene', tags: ['inverted index', 'BM25'] },
    { slug: 'stream-analytics', domain: 7, title: 'Real-Time Stream Analytics', one: 'Turns an endless stream of late, out-of-order events into correct live numbers within seconds.', examples: 'Flink, ClickHouse', tags: ['watermarks', 'checkpoints'] },
    { slug: 'observability', domain: 7, title: 'Log Aggregation & Observability', one: 'Collects logs, metrics and traces from thousands of machines so engineers can find what broke, fast.', examples: 'Datadog, ELK, Dapper', tags: ['cardinality', 'sampling'] },
    { slug: 'ad-click-aggregation', domain: 7, title: 'Ad Click Aggregation', one: 'Counts billions of ad clicks within minutes, with every click counted exactly once for billing.', examples: 'Google Photon, Uber Ads', tags: ['exactly-once', 'dedup'], added: true },

    { slug: 'llm-inference', domain: 8, title: 'LLM Inference Engine', one: 'Runs an AI language model for thousands of people at once, keeping costly GPUs busy and replies fast.', examples: 'vLLM, TensorRT-LLM', tags: ['PagedAttention', 'batching'] },
    { slug: 'vector-db', domain: 8, title: 'Distributed Vector Database', one: 'Finds the stored items closest in meaning to a question, out of millions, in a few milliseconds.', examples: 'Milvus, Qdrant, Pinecone', tags: ['HNSW', 'IVF-PQ'] },
    { slug: 'rag-agent-platform', domain: 8, title: 'RAG & AI Agent Platform', one: 'Lets an AI assistant answer from your own documents, with sources, and use tools without leaking private data.', examples: 'Enterprise copilots, MCP', tags: ['hybrid search', 'agents'], added: true },
    { slug: 'llm-gateway', domain: 8, title: 'LLM Gateway', one: 'One front door for all AI model calls: fair budgets per team, cost tracking, and backup providers.', examples: 'LiteLLM, Portkey, Cloudflare AI GW', tags: ['routing', 'semantic cache'], added: true },
    { slug: 'recommendation', domain: 8, title: 'Recommendation System', one: 'Picks the few videos or products each person will like most, out of millions, in a split second.', examples: 'YouTube, Netflix, TikTok', tags: ['two-tower', 'ranking'], added: true },

    { slug: 'kv-store', domain: 9, title: 'Distributed Key-Value Store', one: 'Stores huge numbers of small records across many machines, and keeps working when some of them fail.', examples: 'Dynamo, Cassandra', tags: ['quorum', 'LSM'], added: true },
    { slug: 'object-storage', domain: 9, title: 'Object Storage', one: 'Stores billions of files cheaply so that none are ever lost, even as disks fail every day.', examples: 'Amazon S3, GFS, HDFS', tags: ['erasure coding'], added: true },
    { slug: 'distributed-sql', domain: 9, title: 'Distributed SQL', one: 'Keeps normal SQL and safe all-or-nothing transactions while the data spreads across many machines and regions.', examples: 'Spanner, CockroachDB', tags: ['TrueTime', 'raft ranges'], added: true }
  ]
};
