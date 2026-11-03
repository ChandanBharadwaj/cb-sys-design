SD.register({
  slug: 'catalog-cart',
  domain: 3,
  title: 'Product Catalog & Cart',
  examples: 'Amazon, Flipkart, Shopify',
  tagline: 'Serve millions of product pages from cache while <b>price and stock stay live</b>, take messy seller data without breaking search, and keep a cart that follows the shopper across devices and <b>never refuses "Add to cart"</b>.',
  tldr: {
    problem: 'The catalog is huge, read-heavy and irregular: a TV and a T-shirt have nothing in common, and sellers send millions of edits a day. One product page mixes text that changes monthly with price and stock that change by the minute. The cart must accept writes during failures and survive a switch from phone to laptop.',
    idea: 'Split by <b>rate of change</b>. Product content (product → variants/SKUs, category attributes in <b>JSONB validated by a per-category schema</b>) lives in the catalog DB and flows to search and caches through an <b>outbox + CDC</b>. The product page shell is cached at the edge; <b>price and availability are fetched live</b> and composed in. Carts live in a <b>highly available KV store</b>, keyed by cookie or user, and merge on sign-in.',
    insight: 'A cart is a <b>wish list, not a reservation</b>. Never trust the price or stock it remembers: re-price and re-check on every view and again at checkout. Only checkout holds stock, which is the job of the <a href="ecommerce-orders.html">Orders &amp; Inventory</a> page.',
    numbers: [
      { v: '284M/min', l: 'Shopify edge requests per minute at peak, BFCM 2024' },
      { v: '2,048', l: 'max variants per Shopify product (up from 100; 2025)' },
      { v: '≈ 70%', l: 'average documented cart abandonment (Baymard, 2025)' }
    ]
  },

  intro: {
    what: 'A <b>product catalog</b> is the shop\'s database of everything it sells: names, photos, sizes, specs and which seller offers them. The <b>cart</b> is the shopper\'s list of things they plan to buy. Together they power browsing, search, the product page and the "Add to cart" button, right up to the moment the shopper presses <b>Checkout</b>.',
    analogy: {
      icon: '🏬',
      title: 'A printed catalogue, shelf price stickers and a shopping basket',
      text: 'A department store prints its catalogue (photos, descriptions) rarely and hands out thousands of copies: that is the cache. Prices are on stickers the staff change on the shelf, not in the catalogue, because they change often. Your basket is yours, and nobody takes it away when the tills are busy. But a basket does not hold the item: at the till the cashier checks today\'s price and whether it is still in stock. The analogy breaks in one place: online, two copies of your basket can exist at once (phone and laptop), and they must be merged.'
    },
    problem: 'A seller drops a phone\'s price at 9:00 while a million people are looking at its page. Should every page view hit the database, or can the page be cached and still show the new price? Meanwhile a shopper adds a case on their phone, removes a charger on their laptop, and one datacenter is unreachable. The system answers <b>"how do we serve product pages fast from cache, keep price and stock correct, and keep a cart that never refuses a write?"</b>',
    story: [
      {
        stage: 'naive',
        title: 'One database renders every page and holds every cart',
        text: 'Each product page runs queries for the product, its price and its stock, then renders HTML. The cart is a few rows in the same database. Simple, consistent, and fine for a small shop.',
        scene: {
          nodes: [
            { id: 'u', label: 'Shoppers', sub: 'page views', kind: 'client', at: [70, 0] },
            { id: 's', label: 'Seller', sub: 'edits products', kind: 'client', at: [350, 0] },
            { id: 'app', label: 'Shop app', sub: 'render + cart', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'One database', sub: 'products · cart', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'u', to: 'app' }, { from: 's', to: 'app' }, { from: 'app', to: 'db' }],
          flow: [['u>app', 's>app'], 'app>db']
        }
      },
      {
        stage: 'breaks',
        title: 'A viral product melts the database and carts fail',
        text: 'A sale sends 50,000 views a second to <b>one product</b>, and every view repeats the same queries. Caching the whole page helps, until the price inside it goes <b>stale</b>. When the database fails over, "Add to cart" returns errors for half a minute, and those shoppers leave.',
        scene: {
          nodes: [
            { id: 'u', label: 'Shoppers ×50K/s', sub: 'one product', kind: 'client', at: [70, 0] },
            { id: 's', label: 'Seller', sub: 'price −20%', kind: 'client', at: [350, 0] },
            { id: 'app', label: 'Shop app', sub: 'page cached?', kind: 'service', at: [210, 110] },
            { id: 'db', label: 'One database', sub: 'failing over', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'u', to: 'app' }, { from: 's', to: 'app' }, { from: 'app', to: 'db' }],
          flow: [['u>app', 'u>app'], 'app>db'],
          err: ['db'],
          warn: ['app'],
          badges: { db: ['overloaded', 'err'], app: ['old price shown', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Cache the slow parts, fetch the fast parts, never refuse a cart write',
        text: 'The page <b>shell</b> (photos, text, variants) is cached at the edge. <b>Price</b> and <b>stock</b> come from small, fast services on every view. The cart lives in a <b>replicated key-value store</b> that accepts writes even when a replica is down, and merges copies later.',
        scene: {
          nodes: [
            { id: 'u', label: 'Shoppers', sub: 'page + cart', kind: 'client', at: [210, 0] },
            { id: 'edge', label: 'Edge cache', sub: 'page shell', kind: 'edge', at: [70, 110] },
            { id: 'cart', label: 'Cart store', sub: 'always writeable', kind: 'store', at: [350, 110] },
            { id: 'price', label: 'Price svc', sub: 'live', kind: 'service', at: [70, 220] },
            { id: 'stock', label: 'Stock badge', sub: 'live', kind: 'cache', at: [210, 220] }
          ],
          edges: [{ from: 'u', to: 'edge' }, { from: 'u', to: 'cart' }, { from: 'edge', to: 'price' }, { from: 'edge', to: 'stock' }],
          flow: [['u>edge', 'u>cart'], ['edge>price', 'edge>stock']],
          ok: ['edge', 'cart'],
          badges: { edge: ['cache hit', 'ok'], cart: ['add ✓', 'ok'] }
        }
      }
    ],
    usedBy: ['Amazon', 'Flipkart', 'Shopify', 'Walmart', 'eBay', 'Instacart'],
    whenToUse: [
      'You sell many products whose attributes differ by category, often from many sellers',
      'Product pages get far more reads than writes, but price and stock change often',
      'Shoppers browse as guests and switch devices before they buy'
    ],
    whenNot: [
      'You need to hold stock, charge cards and ship: that starts at checkout (see <a href="ecommerce-orders.html">E-commerce Orders &amp; Inventory</a>)',
      'You need relevance ranking and typo-tolerant product search (see <a href="search-engine.html">Search Engine</a>)',
      'A shop with a few hundred products: one Postgres table and a cookie cart are plenty'
    ],
    glossary: [
      { term: 'Product vs variant (SKU)', def: 'A product is "Classic T-shirt"; a variant or SKU (stock keeping unit) is one buyable version, such as "blue, size M".' },
      { term: 'Category schema', def: 'The list of attributes a category requires (screen size for TVs, fabric for shirts), used to validate seller data.' },
      { term: 'EAV', def: 'Entity-attribute-value: one table row per attribute of a product, which is flexible but slow to query.' },
      { term: 'JSONB', def: 'A Postgres column type that stores JSON in a binary form that can be indexed and queried.' },
      { term: 'Change data capture (CDC)', def: 'Reading the database\'s change log and turning each committed change into an event for other systems.' },
      { term: 'Surrogate key', def: 'A tag attached to cached pages (such as the product id) so one purge call removes every page that shows that product.' },
      { term: 'Guest cart', def: 'A cart for a shopper who has not signed in, keyed by a random id stored in a cookie on their device.' },
      { term: 'OR-Set', def: 'Observed-remove set: a mergeable set where a remove only deletes the adds it has seen, so replicas can be merged without losing adds or reviving removes.' }
    ]
  },

  requirements: {
    functional: [
      'Sellers create and update products and variants by API or bulk feed, validated per category',
      'Browse and filter the catalog by category and attributes; results come from a search index',
      'Product page: content, variant picker, current price and offers, availability',
      'Add, change and remove cart items as a guest or signed in, on any device',
      'Merge the guest cart into the user cart on sign-in',
      'Re-price and re-check stock in the cart, then hand off to checkout'
    ],
    nonFunctional: [
      'Product page p99 ≲ 200–300 ms, even for a viral product',
      'Add to cart always succeeds (availability over consistency)',
      'The price charged at checkout is the price shown at checkout',
      'Catalog edits reach search and caches within seconds to minutes',
      'Catalog reads outnumber writes 100:1 or more (estimate)',
      'Survive a zone or region failure without losing carts'
    ],
    outOfScope: ['Checkout, stock holds and payment (see E-commerce Orders & Inventory)', 'Search ranking and relevance (see Search Engine)', 'Recommendations', 'Seller payouts and accounting']
  },

  calculator: {
    inputs: [
      { id: 'skus', label: 'SKUs in the catalog', min: 1e5, max: 5e8, value: 5e7, log: true },
      { id: 'views', label: 'Product page views per day', min: 1e6, max: 5e9, value: 5e8, log: true },
      { id: 'peak', label: 'Sale-hour peak vs daily average', min: 1, max: 30, value: 8, unit: '×' },
      { id: 'hit', label: 'Edge hit ratio for the page shell', min: 50, max: 99.5, step: 0.5, value: 95, unit: '%' },
      { id: 'edits', label: 'Seller edits per day (content + price)', min: 1e5, max: 1e9, value: 5e7, log: true },
      { id: 'doc', label: 'Bytes per SKU (text + attributes, no images)', min: 1000, max: 50000, value: 6000, fmt: 'bytes', log: true }
    ],
    outputs: [
      { label: 'Peak product page requests/s at the edge', f: (v) => v.views / 86400 * v.peak },
      { label: 'Origin renders/s (edge misses)', f: (v) => v.views / 86400 * v.peak * (1 - v.hit / 100) },
      { label: 'Live price + availability lookups/s (2 per view)', f: (v) => v.views / 86400 * v.peak * 2 },
      { label: 'Peak cart writes/s (assume 5% of views add to cart)', f: (v) => v.views / 86400 * v.peak * 0.05 },
      { label: 'Change events/s to search and caches (average)', f: (v) => v.edits / 86400 },
      { label: 'Catalog storage with 3 replicas', fmt: 'bytes', f: (v) => v.skus * v.doc * 3 }
    ],
    note: 'All inputs are <em>estimates</em>. Notice the asymmetry: the page shell is served from the edge, so only the misses reach origin, but <b>price and availability are looked up on every view</b>. Those two services must be the fastest and most cached (per SKU, for a second or two) in the whole system. Catalog storage is small; images live in object storage behind a CDN.'
  },

  api: [
    { m: 'GET', p: '/v1/products/{productId}', d: 'Static content and the variant matrix. <code>Cache-Control: public, s-maxage=3600, stale-while-revalidate</code> and <code>Surrogate-Key: p123 brand9</code>, so one purge clears every page that shows it.' },
    { m: 'GET', p: '/v1/offers?skus=…&currency=INR', d: 'Price per SKU: list price, sale price, active promotion, <code>price_version</code>. Never cached in the page shell; micro-cached for about 1 s.' },
    { m: 'GET', p: '/v1/availability?skus=…&pin=560001', d: '"In stock / only a few left / out of stock" for a delivery area. Approximate on purpose; checkout makes the real check.' },
    { m: 'PUT', p: '/v1/carts/{cartId}/items/{sku}', d: '<code>{qty, op_id}</code>. Setting a quantity is idempotent. Returns the cart with every line <b>re-priced</b> and flagged if the price or stock changed.' },
    { m: 'POST', p: '/v1/carts/merge', d: 'Called once after sign-in with <code>{guest_cart_id}</code>. Merges into the user cart and deletes the guest cart; safe to retry.' },
    { m: 'POST', p: '/v1/seller/feeds', d: 'Bulk upload. Returns <code>202 {feed_id}</code>; rows are validated against the category schema and a per-row error report is produced.' }
  ],
  dataModel: [
    { name: 'products', store: 'Postgres (sharded by product_id)', fields: [['product_id', 'bigint', 'pk'], ['category_id', 'int', 'idx'], ['title, brand', 'text'], ['attrs', 'jsonb (GIN)', 'idx'], ['status', 'DRAFT|LIVE|BLOCKED'], ['version', 'int']], note: 'Common fields are real columns; category-specific ones go in <code>attrs</code>, validated against the category schema.' },
    { name: 'skus', store: 'Postgres', fields: [['sku', 'text', 'pk'], ['product_id', 'bigint', 'fk'], ['options', 'jsonb {color, size}'], ['gtin', 'text unique', 'idx'], ['seller_id, seller_sku', 'unique', 'idx']], note: 'The cart and the price service work at SKU level. GTIN (barcode) matching stops two sellers creating duplicate products.' },
    { name: 'category_schema', store: 'Postgres', fields: [['category_id', 'int', 'pk'], ['version', 'int', 'pk'], ['json_schema', 'jsonb'], ['variation_theme', 'text[] (color, size)']], note: 'Versioned. Ingestion validates every seller row against it before anything is written.' },
    { name: 'carts', store: 'Replicated KV (Dynamo-style)', fields: [['cart_id', 'guest:uuid | user:id', 'pk'], ['lines', 'map sku → {qty, add_tags}'], ['removed_tags', 'set'], ['context', 'vector clock'], ['ttl', '30–90 days']], note: 'One item per cart, so a cart write touches one key. Prices are <b>not</b> stored as truth, only the price seen when added, to show "price changed".' }
  ],

  architecture: {
    title: 'Catalog, product page and cart architecture',
    nodes: [
      { id: 'ingest', label: 'Seller ingestion', sub: 'feeds · API · validate', kind: 'compute', wide: [90, 0], tall: [210, 420], tip: 'Accepts bulk feeds and API edits. Validates each row against the category JSON schema, matches GTINs to existing products, and writes accepted rows. Rejected rows go to a per-seller error report.' },
      { id: 'cat', label: 'Catalog service', sub: 'product → variants', kind: 'service', wide: [290, 0], tall: [70, 420], tip: 'Owns products, variants (SKUs) and category schemas. Every write also inserts an outbox row in the same transaction.' },
      { id: 'catdb', label: 'Catalog DB', sub: 'Postgres · JSONB attrs', kind: 'store', wide: [490, 0], tall: [70, 525], tip: 'Common fields as columns, category-specific attributes in a JSONB column with a GIN index. Sharded by product_id at large scale.' },
      { id: 'kfk', label: 'Change stream', sub: 'outbox → CDC → Kafka', kind: 'queue', wide: [690, 0], tall: [210, 525], tip: 'Debezium (or a relay) reads committed outbox rows and publishes ProductChanged events keyed by product_id, so one product\'s events stay in order.' },
      { id: 'search', label: 'Search index', sub: 'OpenSearch / ES', kind: 'cache', wide: [890, 0], tall: [350, 525], tip: 'A denormalised copy for browse, filters and facets. Upserts are versioned, so an old event never overwrites a newer document.' },
      { id: 'cdn', label: 'CDN / edge', sub: 'shell · surrogate keys', kind: 'edge', wide: [290, 110], tall: [70, 105], tip: 'Caches the static part of the product page (and images) for minutes to hours. Purged by surrogate key when the product changes. Collapses concurrent misses into one origin request.' },
      { id: 'bff', label: 'Page composer', sub: 'PDP BFF · fan-out', kind: 'service', wide: [490, 110], tall: [70, 210], tip: 'Backend-for-frontend. On a miss it renders the shell from the catalog; on every view it fetches price and availability in parallel, with short timeouts and fallbacks.' },
      { id: 'price', label: 'Price service', sub: 'list · offers · currency', kind: 'service', wide: [690, 110], tall: [210, 315], tip: 'Resolves the price a shopper sees: list price, active promotions, seller offer, currency. Returns a price_version so cart and checkout can detect changes.' },
      { id: 'avail', label: 'Availability', sub: 'stock badge · cached', kind: 'cache', wide: [690, 220], tall: [210, 210], tip: 'A read model of stock per SKU and region, updated from inventory events. Shows buckets ("only 3 left") rather than exact counts. Not a reservation.' },
      { id: 'shopper', label: 'Shopper app', sub: 'web · mobile', kind: 'client', wide: [90, 220], tall: [210, 0], tip: 'Browses product pages (mostly from the edge) and edits the cart. A guest gets a random cart id in a cookie.' },
      { id: 'cart', label: 'Cart service', sub: 'guest + user · merge', kind: 'service', wide: [290, 330], tall: [350, 105], tip: 'Stateless. Reads and writes the cart item, merges conflicting versions, merges the guest cart on sign-in, and re-prices every line on read.' },
      { id: 'cartkv', label: 'Cart KV store', sub: 'replicated · AP', kind: 'store', wide: [290, 440], tall: [210, 105], tip: 'Dynamo-style: one item per cart, sloppy quorum and hinted handoff, so a write succeeds while a replica is down. Divergent copies are merged on read.' },
      { id: 'ord', label: 'Checkout → Orders', sub: 'reserve · pay →', kind: 'external', wide: [890, 330], tall: [350, 210], tip: 'Checkout re-prices, reserves stock and takes payment. That is covered on the E-commerce Orders & Inventory page.' }
    ],
    edges: [
      { from: 'shopper', to: 'cdn' },
      { from: 'cdn', to: 'bff' },
      { from: 'bff', to: 'cat' },
      { from: 'bff', to: 'price' },
      { from: 'bff', to: 'avail' },
      { from: 'ingest', to: 'cat' },
      { from: 'cat', to: 'catdb' },
      { from: 'catdb', to: 'kfk' },
      { from: 'kfk', to: 'search' },
      { from: 'shopper', to: 'cart' },
      { from: 'cart', to: 'cartkv' },
      { from: 'cart', to: 'price' },
      { from: 'cart', to: 'avail' },
      { from: 'cart', to: 'ord' },
      { from: 'ord', to: 'avail', dashed: true, label: 'stock events' }
    ]
  },

  scenarios: [
    {
      id: 'pdp', title: 'Product page read path', tone: 'ok',
      steps: [
        { text: 'The shopper opens a product page. The edge already holds the <b>page shell</b> (title, photos, specs, variant matrix) for this product, so HTML starts streaming in a few ms.', flow: ['shopper>cdn'], badges: { cdn: ['shell HIT', 'ok'] } },
        { text: 'On a miss, the composer renders the shell from the catalog. The response carries <code>Surrogate-Key: p123</code> and a long <code>s-maxage</code>, because product text rarely changes.', flow: ['cdn>bff', 'bff>cat', 'cat>catdb'], badges: { cdn: 'cached 1 h' } },
        { text: 'For <b>every</b> view, price and availability are fetched separately and <b>in parallel</b>, either by the composer or by the page itself. Each call has a ~50 ms timeout.', flow: ['cdn>bff', ['bff>price', 'bff>avail']], badges: { price: '₹ 1,299', avail: 'in stock' } },
        { text: 'If the price service is slow, the page still renders, but <b>"Add to cart" waits for a price</b>: never show a guessed price. If availability is slow, show "check at checkout".', nodes: ['bff', 'price', 'avail'], warn: ['avail'], badges: { avail: ['timeout → hide badge', 'warn'] }, tone: 'warn' },
        { text: 'Result: the heavy, rarely changing part is cached for hours, and the part that changes by the minute is always fresh. The two never share a cache entry.', nodes: ['cdn', 'price', 'avail'], ok: ['cdn', 'price', 'avail'], tone: 'ok' }
      ]
    },
    {
      id: 'ingest', title: 'Seller edit → search and caches', tone: 'info',
      steps: [
        { text: 'A seller uploads a feed of 20,000 rows. Ingestion validates each row against the <b>category schema</b> (TVs need <code>screen_size_in</code>, shirts need <code>size</code>). Bad rows go to an error report; good rows continue.', nodes: ['ingest'], badges: { ingest: '19,640 ok · 360 rejected' } },
        { text: 'Rows are matched by <b>GTIN</b> to existing products, so a second seller becomes an <b>offer</b> on the same product, not a duplicate page. Then one transaction updates the product <b>and</b> inserts an outbox row.', flow: ['ingest>cat', 'cat>catdb'], badges: { catdb: 'row + outbox' } },
        { text: 'CDC reads the committed outbox row and publishes <code>ProductChanged{id, version}</code> keyed by product id. The search indexer upserts only if <code>version</code> is newer.', flow: ['catdb>kfk', 'kfk>search'], badges: { search: 'v42 indexed' }, tone: 'ok' },
        { text: 'A cache purger consumes the same event and purges surrogate key <code>p123</code> at the edge. The next view re-renders the shell.', flow: ['kfk>cdn'], badges: { cdn: ['purge p123', 'info'] } },
        { text: 'A <b>price</b> change skips all of this: it goes straight to the price service, so a price edit never purges a page or reindexes a document.', flow: ['ingest>price'], badges: { price: ['new price live', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'merge', title: 'Guest cart → sign in → checkout', tone: 'ok',
      steps: [
        { text: 'A guest adds a phone case. The server issues a random <code>cart_id = guest:7f3a…</code> in a cookie and writes the cart item to the KV store.', flow: ['shopper>cart', 'cart>cartkv'], badges: { cartkv: 'guest: 1 line' } },
        { text: 'The shopper signs in. Their user cart (from last week, on a laptop) already has a charger. <code>POST /carts/merge</code> merges guest into user: union of lines, and for the same SKU the <b>larger quantity</b>.', flow: ['shopper>cart', 'cart>cartkv'], badges: { cartkv: ['user: 2 lines', 'ok'] } },
        { text: 'The merge is <b>idempotent</b>: it records the guest cart id as merged, then deletes the guest cart. A retry after a timeout does not double quantities.', nodes: ['cart', 'cartkv'], ok: ['cart'] },
        { text: 'Viewing the cart re-checks every line. The charger is now ₹ 100 cheaper and the case is <b>out of stock</b>. The cart shows both changes; it never silently keeps the old price.', flow: [['cart>price', 'cart>avail']], warn: ['avail'], badges: { price: 'charger −₹100', avail: ['case: out', 'warn'] } },
        { text: '<b>Checkout</b> hands the cart lines to the order system, which re-prices one last time, reserves stock and takes payment. → continue on <a href="ecommerce-orders.html">E-commerce Orders &amp; Inventory</a>.', flow: ['cart>ord'], ok: ['ord'], badges: { ord: ['handoff', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'partition', title: 'Cart split-brain: the deleted item comes back', tone: 'err',
      steps: [
        { text: 'One cart replica is cut off. The shopper on a phone adds a cable. A <b>sloppy quorum</b> lets another node accept the write: "Add to cart" never fails.', flow: ['shopper>cart', 'cart>cartkv'], warn: ['cartkv'], badges: { cartkv: ['replica down · write ok', 'warn'] } },
        { text: 'At the same time, on a laptop that reaches the other side, the shopper <b>removes the charger</b>. There are now two versions whose vector clocks do not order each other.', flow: ['shopper>cart', 'cart>cartkv'], warn: ['cartkv'], badges: { cartkv: ['v1 ∥ v2', 'warn'] } },
        { text: 'The partition heals. Merging by <b>union of items</b> (the Dynamo paper\'s cart) keeps the cable, but the union cannot tell "removed on the laptop" from "never removed", so <b>the charger comes back</b>.', nodes: ['cart', 'cartkv'], err: ['cartkv'], badges: { cartkv: ['charger is back', 'err'] }, tone: 'err' },
        { text: 'Fix: give every add a unique <b>tag</b>, and make a remove delete only the tags it has <b>seen</b> (an OR-Set). After the merge the cable\'s new tag survives and the charger\'s tags stay deleted.', nodes: ['cart', 'cartkv'], ok: ['cartkv'], labels: { cartkv: { label: 'Cart KV store', sub: 'OR-Set lines · tags' } }, badges: { cartkv: ['cable ✓ · charger ✗', 'ok'] }, tone: 'ok' },
        { text: 'Try it in the widget below: it runs last-writer-wins, union and OR-Set on the same partitioned edits.', nodes: ['cart'] }
      ]
    },
    {
      id: 'viral', title: 'Hot product: flash-sale page traffic', tone: 'warn',
      steps: [
        { text: 'A phone launch sends <b>200×</b> normal traffic to one product page. Nearly all of it is the <b>same shell</b>, which the edge serves without touching origin.', flow: [['shopper>cdn', 'shopper>cdn']], badges: { cdn: ['99.9% hit', 'ok'] }, tone: 'warn' },
        { text: 'The shell expires or is purged. Thousands of misses arrive in the same second. <b>Request collapsing</b> sends one request per POP to origin and queues the rest; stale-while-revalidate serves the old shell meanwhile.', flow: ['cdn>bff', 'bff>cat'], badges: { bff: '1 fetch, not 5,000' } },
        { text: 'The live calls are the real hot spot: <b>one SKU key</b> in price and availability gets every view. Micro-cache that key for 1–2 s in the composer and replicate it, so 50K views/s become a few hundred lookups.', flow: [['bff>price', 'bff>avail']], warn: ['price', 'avail'], badges: { price: ['hot key', 'warn'], avail: ['hot key', 'warn'] } },
        { text: 'Availability shows <b>buckets</b> ("only a few left") updated from stock events, not an exact count read from the inventory row: the badge is allowed to lag by seconds.', flow: ['ord>avail'], ok: ['avail'], badges: { avail: ['few left', 'ok'] } },
        { text: 'Carts keep accepting the phone even when stock hits zero; the line is flagged on the next view. Who actually gets the units is decided at checkout by a conditional reserve and a queue (see <a href="ecommerce-orders.html">Orders</a>).', flow: ['shopper>cart', 'cart>ord'], badges: { ord: 'queue + reserve' }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Pick how attributes are stored, how the product page is cached, how search stays in sync and how carts merge. Every choice moves a different meter.',
    diagram: null,
    controls: [
      { id: 'attrs', label: 'Category attributes', type: 'seg', value: 'jsonb', options: [
        { v: 'wide', l: 'Column per attribute' }, { v: 'eav', l: 'EAV rows' }, { v: 'jsonb', l: 'JSONB + schema' }, { v: 'doc', l: 'Document store' }] },
      { id: 'pdp', label: 'Product page caching', type: 'seg', value: 'split', options: [
        { v: 'none', l: 'Render every view' }, { v: 'full', l: 'Whole page incl. price' }, { v: 'split', l: 'Shell cached + live price/stock' }] },
      { id: 'sync', label: 'Catalog → search', type: 'seg', value: 'cdc', options: [
        { v: 'dual', l: 'App writes DB, then index' }, { v: 'cdc', l: 'Outbox + CDC' }, { v: 'batch', l: 'Nightly reindex' }] },
      { id: 'cart', label: 'Cart store & merge', type: 'seg', value: 'orset', options: [
        { v: 'sql', l: 'SQL primary (CP)' }, { v: 'lww', l: 'KV · last writer wins' }, { v: 'union', l: 'KV · union (Dynamo)' }, { v: 'orset', l: 'KV · OR-Set tags' }] },
      { id: 'ttl', label: 'Edge TTL of the cached page', type: 'range', min: 10, max: 3600, step: 10, value: 600, unit: 's' }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      // Illustrative hit ratio: grows with log(TTL); a page that embeds the price is purged on every price change.
      const base = 0.55 + 0.42 * Math.log10(s.ttl / 10) / Math.log10(360);
      const hit = s.pdp === 'none' ? 0 : s.pdp === 'full' ? Math.min(base, 0.8) : base;
      const peak = 50000;                                   // views/s on a hot day (illustrative)
      const origin = peak * (1 - hit);
      const p95 = s.pdp === 'none' ? 320 : s.pdp === 'full' ? Math.round(30 + (1 - hit) * 280) : Math.round(70 + (1 - hit) * 200);
      const stale = s.pdp === 'full' ? s.ttl : 0;
      const attr = {
        wide: { v: 'rigid: ALTER TABLE per new category', s: 0.3 },
        eav: { v: 'flexible, N self-joins per filter, weak types', s: 0.35 },
        jsonb: { v: 'flexible, GIN-indexed, schema-checked', s: 0.85 },
        doc: { v: 'flexible, natural docs; joins live elsewhere', s: 0.7 }
      }[s.attrs];
      const sync = {
        dual: { v: 'seconds, but drifts on partial failure', s: 0.35 },
        cdc: { v: 'seconds, never misses a commit', s: 0.9 },
        batch: { v: 'up to 24 h behind', s: 0.2 }
      }[s.sync];
      const cart = {
        sql: { a: 'errors during failover', as: 0.35, m: 'none: one copy', ms: 0.95 },
        lww: { a: 'always accepts', as: 0.95, m: 'concurrent adds lost', ms: 0.15 },
        union: { a: 'always accepts', as: 0.95, m: 'deleted items reappear', ms: 0.5 },
        orset: { a: 'always accepts', as: 0.95, m: 'removes kept; add wins a tie', ms: 0.88 }
      }[s.cart];
      const metrics = [
        { k: 'Product page p95', v: '≈ ' + p95 + ' ms', s: clamp(1 - (p95 - 40) / 300), hint: 'illustrative' },
        { k: 'Origin renders/s (50K views/s)', v: SD.fmt.num(Math.round(origin)) + '/s', s: clamp(1 - origin / peak * 1.6), hint: 'hit ≈ ' + Math.round(hit * 100) + '%' },
        { k: 'Price shown may be stale by', v: stale ? 'up to ' + (stale >= 120 ? Math.round(stale / 60) + ' min' : stale + ' s') : '0 (fetched live)', s: stale ? clamp(0.6 - Math.log10(stale) / 6) : 0.95 },
        { k: 'Search freshness', v: sync.v, s: sync.s },
        { k: 'Attribute model', v: attr.v, s: attr.s },
        { k: 'Add-to-cart availability', v: cart.a, s: cart.as },
        { k: 'Cart merge anomaly', v: cart.m, s: cart.ms }
      ];
      const notes = [];
      if (s.pdp === 'full') notes.push('The price is baked into the cached HTML. Either it is stale for up to the TTL, or every price change purges the page, which on a busy catalog means a <b>purge storm</b> and a low hit ratio. Checkout must re-price anyway.');
      if (s.pdp === 'none') notes.push('Every view runs catalog, price and stock queries. Fine at hundreds of views per second; at sale peaks the catalog DB becomes the bottleneck.');
      if (s.pdp === 'split') notes.push('The shell can live for ' + (s.ttl >= 120 ? Math.round(s.ttl / 60) + ' min' : s.ttl + ' s') + ' because nothing in it changes by the minute. Surrogate-key purges handle real content edits.');
      if (s.attrs === 'eav') notes.push('EAV filter "TV, 55 inch, OLED, 120 Hz" is one self-join per attribute, and every value is text unless you add typed value columns.');
      if (s.attrs === 'wide') notes.push('One column per attribute gives thousands of mostly-NULL columns, and every new category needs a migration.');
      if (s.attrs === 'doc') notes.push('A document store fits product data well; keep price, stock and orders in their own services so you do not need joins or multi-document transactions.');
      if (s.sync === 'dual') notes.push('"Write DB, then call the index" loses updates when the second call fails or two writers interleave. The index slowly drifts from the truth.');
      if (s.sync === 'batch') notes.push('A nightly rebuild is still useful as a <b>repair</b> job (build a new index, swap an alias), but not as the only sync path.');
      if (s.cart === 'lww') notes.push('Whole-cart last-writer-wins silently drops the items added on the other device. That is a lost sale.');
      if (s.cart === 'union') notes.push('This is the trade-off the Dynamo paper accepted: an add is never lost, but a removed item can resurface after a merge.');
      if (s.cart === 'sql') notes.push('A single primary is simple and consistent, but "Add to cart" fails while it fails over or when the shopper\'s region is cut off.');
      let verdict;
      if (s.pdp === 'full' && s.ttl > 120) verdict = '❌ <b>Shoppers will see old prices.</b> Take price and stock out of the cached page and fetch them live.';
      else if (s.cart === 'lww') verdict = '❌ <b>Carts lose items.</b> Whole-cart last-writer-wins drops concurrent adds; merge per line instead.';
      else if (s.pdp === 'none') verdict = '⚠ <b>Correct but expensive:</b> every view hits origin. Cache the static shell at the edge.';
      else if (s.sync !== 'cdc') verdict = '⚠ <b>Search will drift from the catalog.</b> Publish changes through an outbox and CDC, and keep the batch rebuild as a repair tool.';
      else if (s.cart === 'sql') verdict = '⚠ <b>Consistent carts that sometimes refuse writes.</b> Fine for a small shop; at scale, an always-writeable store pays for itself.';
      else if (s.pdp === 'full') verdict = '⚠ <b>Short TTL hides staleness but kills the hit ratio.</b> Split the page instead.';
      else if (s.attrs === 'wide' || s.attrs === 'eav') verdict = '👍 <b>Works, but the catalog model will fight you.</b> JSONB with a per-category schema (or a document store) is the usual answer.';
      else if (s.cart === 'union') verdict = '👍 <b>Amazon-2007 design:</b> never loses an add, occasionally revives a removed item. Per-line OR-Set tags fix that.';
      else verdict = '✅ <b>Solid default:</b> flexible schema-checked attributes, cached shell with live price and stock, CDC to search, and an always-writeable cart that respects removes.';
      const labels = {
        catdb: { label: s.attrs === 'doc' ? 'Catalog docs' : 'Catalog DB', sub: { wide: 'Postgres · wide table', eav: 'Postgres · EAV rows', jsonb: 'Postgres · JSONB attrs', doc: 'document store' }[s.attrs] },
        cdn: { label: 'CDN / edge', sub: s.pdp === 'none' ? 'pass-through' : s.pdp === 'full' ? 'whole page · TTL ' + s.ttl + ' s' : 'shell · TTL ' + s.ttl + ' s' },
        kfk: { label: s.sync === 'batch' ? 'Nightly reindex' : s.sync === 'dual' ? 'App calls index' : 'Change stream', sub: s.sync === 'cdc' ? 'outbox → CDC → Kafka' : s.sync === 'dual' ? 'second write, may fail' : 'full rebuild job' },
        cartkv: { label: s.cart === 'sql' ? 'Cart DB' : 'Cart KV store', sub: { sql: 'SQL primary + replica', lww: 'KV · LWW whole cart', union: 'KV · union merge', orset: 'KV · OR-Set lines' }[s.cart] }
      };
      const flow = ['shopper>cdn'].concat(s.pdp === 'split' ? [['bff>price', 'bff>avail']] : s.pdp === 'none' ? ['cdn>bff', 'bff>cat', 'cat>catdb', ['bff>price', 'bff>avail']] : ['cdn>bff', 'bff>cat']).concat(['shopper>cart', 'cart>cartkv']);
      return {
        metrics, verdict, notes, labels, flow,
        hot: s.pdp === 'none' ? ['catdb'] : [],
        warn: (s.pdp === 'full' ? ['cdn'] : []).concat(s.sync !== 'cdc' ? ['search'] : []).concat(s.cart === 'union' ? ['cartkv'] : []),
        err: s.cart === 'lww' ? ['cartkv'] : [],
        ok: s.pdp === 'split' ? ['cdn'] : [],
        badges: { cdn: [Math.round(hit * 100) + '% hit', hit > 0.85 ? 'ok' : hit > 0.5 ? 'warn' : 'err'], cartkv: [{ sql: 'no merge', lww: 'adds lost', union: 'removes revived', orset: 'removes kept' }[s.cart], cart.ms > 0.8 ? 'ok' : cart.ms > 0.4 ? 'warn' : 'err'] }
      };
    }
  },

  widget: {
    title: 'Cart merge after a partition: LWW vs union vs OR-Set',
    caption: 'Two copies of one cart: the shopper\'s <b>phone</b> and <b>laptop</b>. While connected, every edit syncs. Press <b>Partition</b>, edit both sides, and watch the three merge policies preview the result: <b>last-writer-wins</b> loses adds, <b>union</b> (Dynamo\'s cart) revives removed items, and an <b>OR-Set</b> with add tags keeps both intents. <b>Heal</b> applies the selected policy. Try <b>▶ Demo</b> first.'
  },

  realWorld: {
    intro: 'Cart merging was worked out in research papers. Catalog and storefront lessons come from marketplaces and platforms that published how they ingest seller data and serve pages at peak.',
    timeline: [
      { when: '2007', who: 'Amazon', title: 'Dynamo: the cart that never refuses a write', text: 'The SOSP paper\'s motivating example is the <b>shopping cart</b>: customers must be able to view and add items even when disks fail, network routes flap or datacenters are destroyed. Dynamo keeps divergent versions with <b>vector clocks</b> and the cart <b>merges them</b>. An "add to cart" is never lost, but a <b>deleted item can resurface</b>.', src: 0 },
      { when: '2011', who: 'INRIA (Shapiro et al.)', title: 'CRDTs and the observed-remove set', text: 'The CRDT report formalises replicated data types that merge without coordination, including the <b>OR-Set</b>: every add carries a unique tag, and a remove deletes only the tags it has observed. That is exactly the fix for the resurfacing cart item.', src: 1 },
      { when: '2010s', who: 'Basho Riak', title: 'Sets and maps as built-in data types', text: 'Riak 2.x shipped CRDT sets and maps with <b>add-wins</b> (observed-remove) semantics. A map can hold sets, counters, flags and registers, and the documented rule is that you <b>cannot remove what you have not seen</b>: the client sends back the context it read.', src: 2 },
      { when: '2018', who: 'eBay', title: 'Product-based shopping: group listings by catalog product', text: 'eBay asked sellers to <b>adopt</b> catalog products (by ePID, UPC, EAN, ISBN or brand + MPN) so listings could be grouped and compared per product. In enabled categories every variation of a multi-variation listing needed its own ePID.', src: 3 },
      { when: 'c. 2019', who: 'Instacart', title: 'One catalog from many messy sources', text: 'Instacart described building its catalog from retailer, third-party, manufacturer and shopper-collected data. In 2018 alone it onboarded <b>more than 100 retailer partners</b>, each with its own product attributes, and it updates more catalog data points every night than the world tweets in a day.', src: 4 },
      { when: '2020', who: 'Walmart', title: 'Item setup as a pipeline: parse, ingest, orchestrate', text: 'Walmart\'s item-setup system ("Hyperloop") has a Spec Parser, a Feed Ingestor and an Item Setup Orchestrator connected by REST APIs and Kafka. After 40% item and sales growth in a year, tuning (including a faster JSON serializer) let it handle <b>over 300 million transactions a day</b> over the holidays.', src: 5 },
      { when: '2020', who: 'Amazon', title: 'Category schemas as JSON Schema', text: 'The Selling Partner API\'s Product Type Definitions return a <b>JSON Schema per product type</b> with every attribute and conditional requirement. Amazon recommends validating listing data against it before submitting.', src: 8 },
      { when: '2020', who: 'Shopify', title: 'Storefront Renderer rewrite', text: 'Shopify rebuilt storefront rendering as a separate, read-only service that reads from replicas, verifying it against the old code on live traffic. It reported responses under about <b>45 ms for 75%</b> of requests, 230 ms at p90 and 900 ms at p99, and an average nearly <b>5× faster</b>.', src: 6 },
      { when: '2020s', who: 'Shopify', title: 'Layered caches in the renderer', text: 'Shopify describes several cache layers in the renderer, including <b>full-page caching</b> to reuse computed output, and warns that caching should not be the first step towards performance.', src: 7 },
      { when: '2024', who: 'Shopify', title: 'Black Friday–Cyber Monday at the edge', text: 'Over BFCM 2024 Shopify reported a peak of <b>284 million requests per minute at the edge</b> and more than 80 million on app servers. Most storefront traffic never reaches application code.', src: 9 },
      { when: '2025', who: 'Shopify', title: 'Variant limit raised from 100 to 2,048', text: 'Shopify raised the per-product variant cap from <b>100 to 2,048</b> for all merchants, with new GraphQL product APIs. Apps still on the old REST product APIs may break on large products: the product/variant model is a real contract.', src: 10 }
    ],
    lessons: [
      'Store data by <b>rate of change</b>: content in the catalog, price in a price service, stock in an availability read model.',
      'Validate seller data against a <b>versioned per-category schema</b> before it touches the catalog.',
      'Feed search and caches from <b>committed changes</b> (outbox + CDC), never from a second write in application code.',
      'Make the cart <b>always writeable</b>, merge per line with add tags, and re-price it every time it is shown.'
    ],
    sources: [
      { title: 'Dynamo: Amazon\'s Highly Available Key-value Store (SOSP 2007)', url: 'https://www.cs.princeton.edu/courses/archive/fall15/cos518/papers/dynamo.pdf', pub: 'DeCandia et al., SOSP 2007' },
      { title: 'A comprehensive study of convergent and commutative replicated data types', url: 'https://webarchive.di.uminho.pt/haslab.uminho.pt/cbm/publications/comprehensive-study-convergent-and-commutative-replicated-data-types.html', pub: 'Shapiro, Preguiça, Baquero, Zawirski, INRIA RR-7506, 2011' },
      { title: 'Riak Python client: Data Types', url: 'https://riak-python-client.readthedocs.io/en/2.1.0/datatypes.html', pub: 'Basho, Riak 2.x docs' },
      { title: 'How Developers Power eBay\'s Product-Based Shopping Experience', url: 'https://innovation.ebayinc.com/stories/powering-ebays-product-based-shopping-experience/', pub: 'eBay Inc., 2018' },
      { title: 'The story behind an Instacart order, Part 1: building a digital catalog', url: 'https://tech.instacart.com/the-story-behind-an-instacart-order-part-1-building-a-digital-catalog-46df5a8ff705', pub: 'Instacart Tech' },
      { title: 'Performance Enhancements for the Item Setup Orchestrator', url: 'https://medium.com/walmartglobaltech/performance-enhancements-to-the-item-setup-orchestrator-6a733b99591d', pub: 'Walmart Global Tech, 2020' },
      { title: 'How Shopify Reduced Storefront Response Times with a Rewrite', url: 'https://shopify.engineering/how-shopify-reduced-storefront-response-times-rewrite', pub: 'Shopify Engineering, 2020' },
      { title: 'Simplify, Batch, and Cache: How We Optimized Server-side Storefront Rendering', url: 'https://shopify.engineering/simplify-batch-cache-optimized-server-side-storefront-rendering', pub: 'Shopify Engineering' },
      { title: 'Product Type Definitions API v2020-09-01 Reference', url: 'https://developer-docs.amazon.com/sp-api/docs/product-type-definitions-api-v2020-09-01-reference', pub: 'Amazon Selling Partner API docs' },
      { title: 'Shopify BFCM 2024 data', url: 'https://www.shopify.com/news/bfcm-data-2024', pub: 'Shopify, Dec 2024' },
      { title: 'The product variant limit is now 2048 for all merchants', url: 'https://shopify.dev/changelog/the-product-variant-limit-is-now-2048-for-all-merchants', pub: 'Shopify developer changelog, 2025' },
      { title: 'Purging with surrogate keys', url: 'https://www.fastly.com/documentation/guides/full-site-delivery/purging/purging-with-surrogate-keys/', pub: 'Fastly docs' },
      { title: 'Request collapsing', url: 'https://www.fastly.com/documentation/guides/concepts/edge-state/cache/request-collapsing/', pub: 'Fastly docs' },
      { title: 'Outbox Event Router', url: 'https://debezium.io/documentation/reference/transformations/outbox-event-router', pub: 'Debezium docs' },
      { title: 'Cart abandonment rate statistics', url: 'https://baymard.com/lists/cart-abandonment-rate', pub: 'Baymard Institute, updated Sep 2025' },
      { title: 'How long does a cart session live? (staff answer: about 10 days)', url: 'https://community.shopify.com/t/how-long-does-a-cart-session-live/262223', pub: 'Shopify Community' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Category attributes', '<b>EAV rows</b>: any attribute, no migrations; slow multi-attribute filters, weak types', '<b>JSONB / document</b> + per-category JSON Schema: flexible, indexable, validated', 'JSONB (or a document store) by default; real columns for fields every product has (title, brand, category)'],
      ['Product page caching', '<b>Whole page with TTL</b>: one cache entry, simplest', '<b>Cached shell + live price/stock</b>: two kinds of request, always-fresh price', 'Split as soon as prices or stock change more often than your TTL'],
      ['Catalog → search', '<b>Dual write</b> from the app: no extra infrastructure', '<b>Outbox + CDC</b>: every commit is delivered, in order per product', 'CDC whenever search results drive revenue; keep a full reindex (alias swap) for repairs'],
      ['Cart store', '<b>SQL row</b> (CP): consistent, familiar', '<b>Replicated KV</b> (AP): always writeable, needs a merge rule', 'KV once carts are a revenue path at scale; SQL is fine for a single-region shop'],
      ['Cart merge rule', '<b>Union, max qty</b> (Dynamo): never loses adds, revives removes', '<b>OR-Set tags</b> per line: keeps removes, add wins a true conflict', 'OR-Set (or Riak/Redis CRDT types) if you build it; union if you must keep it trivial'],
      ['Guest cart', '<b>Browser only</b> (localStorage): zero server cost', '<b>Server-side</b>, keyed by a cookie id: survives app reinstall, can merge on sign-in', 'Server-side once you want cart merge, abandoned-cart emails or cross-device carts']
    ]
  },
  failures: [
    { f: 'Old price on the product page', detect: 'Rate of "price changed" flags at cart and checkout; price-version mismatch alerts', fix: 'Keep price out of the cached shell; fetch it live with a price_version. Checkout always re-prices.' },
    { f: 'Search shows deleted or wrong products', detect: 'Reconciliation job sampling DB vs index by version; CDC consumer lag', fix: 'Outbox + CDC with versioned upserts; periodic full rebuild into a new index and swap the alias.' },
    { f: 'Removed cart item reappears', detect: 'Support tickets; count of merges that revive a removed SKU', fix: 'Per-line OR-Set tags (or removal timestamps per line) instead of a plain union.' },
    { f: 'Bad seller feed (wrong units, junk images)', detect: 'Spike in validation rejects or in attribute outliers per seller', fix: 'Schema validation, quarantine of the whole feed above an error threshold, staged publish, per-seller rate limits.' },
    { f: 'Cache stampede on a viral product', detect: 'Origin RPS for one URL jumps right after a purge or expiry', fix: 'Request collapsing, stale-while-revalidate, soft purge, and pre-warming before a launch.' },
    { f: 'Purge storm', detect: 'Purge API rate and hit ratio falling together', fix: 'Do not embed fast-changing data in cached HTML; purge by surrogate key only on content edits.' },
    { f: 'Giant or bot carts', detect: 'Cart item size or write rate per cart id far above normal', fix: 'Cap lines and quantity per cart, rate-limit writes per cart and per device, expire guest carts.' }
  ],

  interview: [
    { q: 'How do you model products whose attributes differ by category, like a TV and a T-shirt?', a: '<p>Put fields every product has (id, title, brand, category, status) in real columns. Put category-specific attributes in a <b>JSONB column</b> (or a document store), with a GIN index for containment filters.</p><p>Validate them against a <b>versioned JSON Schema per category</b>, the way Amazon publishes product type definitions. EAV also works, but every extra filter is another self-join and every value is text. One column per attribute needs a migration for every new category.</p>', fu: 'How do you add a new required attribute to a live category? (New schema version; old products stay valid under their version until backfilled.)', lvl: 'core' },
    { q: 'What is the difference between a product, a variant, a SKU and an offer?', a: '<ul><li><b>Product</b>: "iPhone case model X", the page shoppers see.</li><li><b>Variant / SKU</b>: one buyable combination of options (black, size M), defined by a variation theme.</li><li><b>Offer</b>: a seller\'s price and stock for a SKU. Marketplaces can have many offers per SKU.</li></ul><p>The cart line is <b>(SKU, seller offer)</b>. Price and stock attach to offers, not to products.</p>', lvl: 'core' },
    { q: 'How do you ingest millions of seller updates a day without breaking the catalog?', a: '<p>Make ingestion <b>asynchronous</b>: accept the feed, return a feed id, then parse and validate each row against the category schema. Upsert by <code>(seller_id, seller_sku)</code> so re-sending a feed is idempotent.</p><p>Match rows to existing products by GTIN so a second seller becomes an offer, not a duplicate page. Quarantine a feed whose error rate is abnormal, and report errors per row back to the seller.</p>', lvl: 'core' },
    { q: 'How do you keep the search index in sync with the catalog database?', a: '<p>Do not write to the DB and then call the index from the same code: if the second call fails, they drift forever. Instead write an <b>outbox row in the same transaction</b> and let CDC (e.g. Debezium) publish it to Kafka, keyed by product id.</p><p>The indexer upserts with an <b>external version</b>, so an old event never overwrites a newer document. For big schema changes, rebuild a new index in the background and swap an alias.</p>', lvl: 'core' },
    { q: 'How do you cache a product page whose price changes every few minutes?', a: '<p>Split the page by rate of change. The <b>shell</b> (text, images, variants) is cached at the CDN for minutes to hours, tagged with <b>surrogate keys</b> such as the product id, and purged when the product changes.</p><p><b>Price and availability</b> are fetched separately on every view (edge-side include, a composer, or a client call) and micro-cached per SKU for a second or two. Caching the whole page forces you to choose between stale prices and a purge storm.</p>', lvl: 'core' },
    { q: 'Where does price live, and how do you make sure the shopper is charged what they saw?', a: '<p>A <b>price service</b> owns list price, promotions, seller offers and currency. Every response has a <code>price_version</code>.</p><p>The cart stores the price seen when the item was added only to <b>show changes</b>. Checkout re-prices every line; if anything changed, it shows the new total and asks the shopper to confirm before charging. Store money as integer minor units with an ISO currency code.</p>', lvl: 'core' },
    { q: 'Why would you put carts in an AP key-value store, and what goes wrong?', a: '<p>A failed "add to cart" is a lost sale, so the Dynamo paper chose availability: a sloppy quorum accepts writes when replicas are down, and divergent versions are kept with vector clocks and merged on read.</p><p>Merging by <b>union</b> never loses an add, but it cannot tell "removed on one side" from "never removed", so a <b>deleted item can come back</b>. Fix it with per-line add tags (an OR-Set): a remove deletes only the tags it saw.</p>', fu: 'What happens when one device removes a line while the other bumps its quantity? (With add-wins, the line stays with the bumped quantity.)', lvl: 'deep' },
    { q: 'How do you merge a guest cart into the user\'s cart on sign-in?', a: '<p>The guest cart is server-side, keyed by a random id in a cookie. After sign-in, call merge once: union of lines, and for the same SKU take the <b>larger quantity</b> (summing double-counts the common case where both carts hold the same item).</p><p>Make it idempotent: record "guest cart X merged into user Y", then delete the guest cart. Re-validate price and stock of the merged lines before showing them.</p>', lvl: 'core' },
    { q: 'Does adding to the cart reserve stock?', a: '<p>No. The cart is a <b>wish list</b>. Most carts are abandoned (Baymard\'s documented average is about 70%), so holding stock there would hide real units from buyers.</p><p>Re-check stock and price whenever the cart is shown, and let checkout do the real <b>conditional reserve</b>. That handoff is covered in E-commerce Orders &amp; Inventory.</p>', lvl: 'core' },
    { q: 'How long do carts live, and how do you clean them up?', a: '<p>Give guest carts a TTL (days to weeks) and refresh it on every write; signed-in carts can live much longer. Use the KV store\'s native TTL so expiry costs nothing.</p><p>Emit <code>CartUpdated</code> events so an abandoned-cart flow can email signed-in users after a few hours, and so analytics can measure abandonment.</p>', lvl: 'core' },
    { q: 'A product goes viral. What breaks first, and how do you protect it?', a: '<ul><li><b>Edge</b>: serves the shell; use request collapsing and stale-while-revalidate so a purge does not send thousands of misses to origin.</li><li><b>Price and availability</b>: one hot key gets every view. Micro-cache it for 1–2 s and replicate it.</li><li><b>Availability</b>: show buckets from stock events, not a live count from the inventory row.</li><li><b>Checkout</b>: the real contention, handled with a queue and a conditional reserve.</li></ul>', lvl: 'deep' },
    { q: 'How do you show prices in many currencies?', a: '<p>Either keep <b>price lists per currency</b> (merchant-set, stable, round numbers) or <b>convert at display</b> with a daily FX rate and rounding rules. Many platforms do both: explicit prices for main markets, conversion elsewhere.</p><p>Whatever is shown must be what is charged: lock the FX rate into the price version used at checkout, and store amounts as integer minor units.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Postgres: products with JSONB attributes, schema check and outbox', lang: 'sql',
      code: `CREATE TABLE products (
  product_id  bigint PRIMARY KEY,
  category    text   NOT NULL,
  title       text   NOT NULL,
  brand       text   NOT NULL,
  attrs       jsonb  NOT NULL DEFAULT '{}',
  version     int    NOT NULL DEFAULT 1,
  -- cheap guard in the DB; the full JSON Schema check runs in ingestion
  CONSTRAINT tv_attrs CHECK (category <> 'tv'
    OR (attrs ? 'screen_in' AND jsonb_typeof(attrs->'screen_in') = 'number'))
);
CREATE INDEX products_attrs ON products USING gin (attrs jsonb_path_ops);
CREATE TABLE outbox (
  id bigserial PRIMARY KEY, aggregate_id bigint NOT NULL,
  type text NOT NULL, payload jsonb NOT NULL, created_at timestamptz DEFAULT now()
);

-- seller edit: product row and its event commit together (CDC publishes the outbox)
BEGIN;
INSERT INTO products (product_id, category, title, brand, attrs)
VALUES (123, 'tv', 'OLED 55', 'Acme', '{"screen_in": 55, "panel": "OLED", "hz": 120}')
ON CONFLICT (product_id) DO UPDATE
  SET attrs = EXCLUDED.attrs, title = EXCLUDED.title, version = products.version + 1;
INSERT INTO outbox (aggregate_id, type, payload)
SELECT product_id, 'ProductChanged', jsonb_build_object('id', product_id, 'version', version)
  FROM products WHERE product_id = 123;
COMMIT;

-- facet filter: containment uses the GIN index
SELECT product_id, title FROM products
 WHERE category = 'tv' AND attrs @> '{"panel": "OLED", "hz": 120}';`,
      note: '<code>jsonb_path_ops</code> makes a smaller, faster GIN index than the default <code>jsonb_ops</code>; it supports <code>@&gt;</code> and the jsonpath operators but not key-exists (<code>?</code>). A row missing <code>screen_in</code> for a TV fails the CHECK. The outbox payload carries <code>version</code> so the search indexer can ignore older events.'
    },
    {
      title: 'Python: OR-Set cart merge vs plain union', lang: 'python',
      code: `import uuid
from dataclasses import dataclass, field

@dataclass
class Cart:                                   # one replica of one cart
    adds: dict = field(default_factory=dict)  # tag -> (sku, qty, ts)
    removed: set = field(default_factory=set) # tags this replica saw removed

    def put(self, sku, qty, ts):              # add or change quantity
        self.adds[uuid.uuid4().hex] = (sku, qty, ts)

    def remove(self, sku):                    # delete only the tags we have seen
        self.removed |= {t for t, (s, _, _) in self.adds.items() if s == sku}

    def view(self):                           # live tags; newest qty per sku wins
        best = {}
        for t, (sku, qty, ts) in self.adds.items():
            if t not in self.removed and (sku not in best or ts > best[sku][1]):
                best[sku] = (qty, ts)
        return {sku: q for sku, (q, _) in sorted(best.items())}

def merge(a, b):                              # OR-Set: union of adds and of removes
    return Cart({**a.adds, **b.adds}, a.removed | b.removed)

def union_merge(a, b):                        # Dynamo-style: union of items, max qty
    va, vb = a.view(), b.view()
    return {s: max(va.get(s, 0), vb.get(s, 0)) for s in sorted(va.keys() | vb.keys())}

phone = Cart(); phone.put("charger", 1, ts=1); phone.put("case", 1, ts=2)
laptop = Cart(dict(phone.adds), set(phone.removed))   # in sync before the split
phone.put("cable", 1, ts=3)                           # partition: phone adds
laptop.remove("charger")                              # partition: laptop removes
print("union :", union_merge(phone, laptop))  # {'cable': 1, 'case': 1, 'charger': 1}
print("orset :", merge(phone, laptop).view()) # {'cable': 1, 'case': 1}`,
      note: 'Each add or quantity change gets a fresh tag, so a concurrent "bump quantity" survives a "remove" from the other device (add wins). Tags removed long ago can be garbage-collected once every replica has seen them; Riak\'s ORSWOT avoids tombstones with version vectors instead.'
    },
    {
      title: 'Spring Boot: compose the product page with live price and stock', lang: 'java',
      code: `@Service
public class ProductPageService {
  record Price(String sku, long minor, String currency, int version) {}
  record Stock(String sku, String badge) {}
  record Page(String shell, Price price, Stock stock, boolean canAddToCart) {}

  private final RestClient catalog, pricing, availability;
  private final Cache shells;                 // static part: cached here and at the CDN
  private final Executor io = Executors.newVirtualThreadPerTaskExecutor();

  public ProductPageService(RestClient.Builder b, CacheManager caches) {
    this.catalog = b.clone().baseUrl("http://catalog").build();
    this.pricing = b.clone().baseUrl("http://price").build();
    this.availability = b.clone().baseUrl("http://availability").build();
    this.shells = caches.getCache("pdp-shell");
  }

  public Page page(long productId, String sku, String currency) {
    var price = CompletableFuture.supplyAsync(() -> pricing.get()
        .uri("/offers?sku={s}&currency={c}", sku, currency).retrieve().body(Price.class), io)
        .completeOnTimeout(null, 80, TimeUnit.MILLISECONDS)
        .exceptionally(e -> null);            // no price => no "Add to cart"
    var stock = CompletableFuture.supplyAsync(() -> availability.get()
        .uri("/availability?sku={s}", sku).retrieve().body(Stock.class), io)
        .completeOnTimeout(new Stock(sku, "UNKNOWN"), 80, TimeUnit.MILLISECONDS)
        .exceptionally(e -> new Stock(sku, "UNKNOWN"));
    String shell = shells.get(productId, () -> catalog.get()
        .uri("/products/{id}", productId).retrieve().body(String.class));
    Price p = price.join();
    return new Page(shell, p, stock.join(), p != null);
  }
}`,
      note: 'Price and stock are fetched in parallel while the shell comes from the cache. A missing price disables "Add to cart"; a missing stock badge does not, because checkout checks stock anyway. Needs Spring Boot 3.2+ for <code>RestClient</code>, Java 21 for virtual threads, and a configured <code>CacheManager</code> (e.g. Caffeine with a short TTL; the CDN holds the shell longer).'
    }
  ],

  related: ['ecommerce-orders', 'search-engine', 'kv-store', 'cdn', 'distributed-cache', 'collab-editing']
});
