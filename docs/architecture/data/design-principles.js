SD.register({
  slug: 'design-principles',
  domain: 1,
  title: 'Design Principles',
  examples: 'SOLID, Demeter, Gall',
  tagline: 'SOLID, DRY, KISS, YAGNI, Demeter, information hiding, coupling and cohesion. They all serve one goal: <b>a change in one place should not force changes everywhere else</b>. Know where each came from, what it really says, and how to measure it.',
  tldr: {
    problem: 'Code that is hard to change is expensive forever. Every feature ripples through modules, tests are slow because nothing can be isolated, and new people need months to know what is safe to touch.',
    idea: 'Hide each <b>design decision likely to change</b> behind a narrow interface (Parnas, 1972). Keep things that change together in one module (<b>high cohesion</b>) and make modules depend on each other as little as possible (<b>low coupling</b>). Point dependencies <b>towards stable, abstract</b> things and never in a cycle.',
    insight: 'The principles are heuristics about <b>change</b>, not laws of style. Applied blindly they contradict each other: DRY pulls code together, SRP and coupling pull it apart, YAGNI says do not abstract yet. Martin\'s package metrics (I, A, D) turn the argument into numbers you can check in CI.',
    numbers: [
      { v: 'D = |A + I − 1|', l: 'distance from the main sequence (Martin, 1994); 0 is ideal' },
      { v: '1972', l: 'Parnas publishes information hiding in CACM' },
      { v: '0 cycles', l: 'Acyclic Dependencies Principle target between packages (rule)' }
    ]
  },

  intro: {
    what: '<b>Design principles</b> are rules of thumb for splitting code into parts so that it stays cheap to change. They tell you what to put together, what to keep apart, and which way the arrows between parts should point. They apply to classes, packages, modules and whole services.',
    analogy: {
      icon: '🔌',
      title: 'Wall sockets instead of wiring appliances into the house',
      text: 'Your kettle plugs into a <b>standard socket</b>. You can replace the kettle without calling an electrician, and the power company can change the grid without visiting your kitchen. That socket is an <b>interface</b>: both sides depend on it, neither depends on the other\'s insides. Hard-wiring the kettle into the wall is <b>tight coupling</b>. The analogy breaks in one place: real sockets are standardised by a committee once, while software interfaces are designed by you, and a bad one is as painful as no socket at all.'
    },
    problem: 'A team changes how tax is calculated. The change breaks the order screen, two reports and the invoice email, because each of them reached into the tax code directly. Fixing those breaks needs a change in billing, which imports orders, which imports billing. <b>How do we split code so that a change stays local, and how do we know when the split is wrong?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Call whatever you need',
        text: 'Each class calls the concrete classes it needs. Orders calls Billing directly to charge a customer. It is quick to write and easy to follow when the app is small.',
        scene: {
          nodes: [
            { id: 'web', label: 'Web', sub: 'controllers', kind: 'client', at: [210, 0] },
            { id: 'ord', label: 'Orders', sub: 'OrderService', kind: 'service', at: [70, 110] },
            { id: 'bill', label: 'Billing', sub: 'BillingService', kind: 'service', at: [350, 110] },
            { id: 'db', label: 'Database', sub: 'all tables', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'web', to: 'ord' }, { from: 'ord', to: 'bill' }, { from: 'ord', to: 'db' }, { from: 'bill', to: 'db' }],
          flow: ['web>ord', 'ord>bill', 'bill>db']
        }
      },
      {
        stage: 'breaks',
        title: 'A cycle forms, and everything moves together',
        text: 'Billing now needs order details, so it imports Orders. The two modules form a <b>cycle</b>: neither can be built, tested or released alone. A change to tax rules recompiles and retests half the system.',
        scene: {
          nodes: [
            { id: 'web', label: 'Web', sub: 'breaks too', kind: 'client', at: [210, 0] },
            { id: 'ord', label: 'Orders', sub: 'imports Billing', kind: 'service', at: [70, 110] },
            { id: 'bill', label: 'Billing', sub: 'imports Orders', kind: 'service', at: [350, 110] },
            { id: 'db', label: 'Database', sub: 'shared tables', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'web', to: 'ord' }, { from: 'ord', to: 'bill', bend: 0.2 }, { from: 'bill', to: 'ord', bend: 0.2 }, { from: 'ord', to: 'db' }, { from: 'bill', to: 'db' }],
          flow: ['ord>bill', 'bill>ord', 'web>ord'],
          err: ['ord', 'bill'], warn: ['web'],
          badges: { bill: ['cycle', 'err'], web: ['retest all', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Depend on a socket, not on the appliance',
        text: 'Orders defines a small <b>BillingPort</b> interface that says what it needs. Billing implements it. Now both depend on the interface, the arrow from Orders to Billing is gone, and so is the cycle. This is <b>dependency inversion</b>.',
        scene: {
          nodes: [
            { id: 'web', label: 'Web', sub: 'controllers', kind: 'client', at: [210, 0] },
            { id: 'ord', label: 'Orders', sub: 'owns BillingPort', kind: 'service', at: [70, 110] },
            { id: 'port', label: 'BillingPort', sub: 'interface', kind: 'edge', at: [210, 110] },
            { id: 'bill', label: 'Billing', sub: 'implements port', kind: 'service', at: [350, 110] },
            { id: 'db', label: 'Database', sub: 'schema per module', kind: 'store', at: [210, 220] }
          ],
          edges: [{ from: 'web', to: 'ord' }, { from: 'ord', to: 'port' }, { from: 'bill', to: 'port', dashed: true }, { from: 'ord', to: 'db' }, { from: 'bill', to: 'db' }],
          flow: ['web>ord', 'ord>port', 'bill>port'],
          ok: ['ord', 'bill'],
          badges: { port: ['0 cycles', 'ok'] }
        }
      }
    ],
    usedBy: ['Spring Framework (dependency injection)', 'ArchUnit and Spring Modulith users', 'Java and .NET standard libraries', 'The IETF (robustness principle debate)', 'Extreme Programming teams (YAGNI)', 'Shopify (Packwerk boundaries)'],
    whenToUse: [
      'Code will live for years and be changed by people who did not write it: invest in <b>information hiding</b> and clear module boundaries',
      'Two parts change for <b>different reasons</b> or at different speeds (tax rules vs order flow): separate them behind an interface',
      'You need fast, isolated tests or plan to swap a technology (payment provider, database): <b>invert the dependency</b> at that boundary'
    ],
    whenNot: [
      'Do not add an interface for every class "in case". One implementation and no test need is YAGNI territory',
      'Do not merge code just because it looks alike. If the two copies change for different reasons, the shared function becomes the wrong abstraction',
      'Do not treat the principles as a substitute for a domain model. Boundaries come from the business (see <a href="ddd.html">Domain-Driven Design</a>)'
    ],
    glossary: [
      { term: 'Coupling', def: 'How much one module depends on another. Low coupling means a change in one rarely forces a change in the other.' },
      { term: 'Cohesion', def: 'How closely the parts inside one module belong together. High cohesion means they change for the same reason.' },
      { term: 'Information hiding', def: 'Parnas\'s rule: each module hides one design decision that is likely to change behind an interface.' },
      { term: 'Afferent coupling (Ca)', def: 'Number of classes outside a package that depend on classes inside it: its incoming responsibility.' },
      { term: 'Efferent coupling (Ce)', def: 'Number of classes inside a package that depend on classes outside it: its outgoing dependence.' },
      { term: 'Instability (I)', def: 'Ce / (Ca + Ce). 0 means nothing it depends on can force it to change; 1 means nothing depends on it.' },
      { term: 'Abstractness (A)', def: 'Abstract classes and interfaces divided by all classes in the package.' },
      { term: 'Dependency inversion', def: 'High-level policy and low-level detail both depend on an abstraction, usually owned by the high-level side.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Information hiding</b> (Parnas, 1972): decompose by the design decisions likely to change, and hide each behind an interface',
      '<b>High cohesion, low coupling</b> (Stevens, Myers & Constantine, 1974): gather what changes together; make modules talk through narrow contracts',
      '<b>SOLID</b> for classes: one reason to change, open for extension, substitutable subtypes, small client-specific interfaces, depend on abstractions',
      '<b>Acyclic</b> and <b>stable</b> dependencies: no cycles between packages; depend in the direction of stability',
      '<b>Simplest thing that works</b> (KISS, YAGNI, Gall): build what is needed now and keep it easy to change',
      '<b>Talk to friends only</b> (Law of Demeter) and <b>least astonishment</b>: callers should not navigate internals or be surprised by behaviour'
    ],
    nonFunctional: [
      '<b>Change locality</b>: most changes touch one module (track files and modules per commit; target the large majority, rule of thumb)',
      '<b>Testability</b>: core logic unit-tested without a database or network; suite runs in minutes',
      '<b>Zero package cycles</b>, enforced by an ArchUnit or Spring Modulith test in CI',
      '<b>Distance from main sequence</b> D ≤ 0.3 for most packages (common rule of thumb, not a standard)',
      '<b>Onboarding</b>: a new engineer can ship a change in one module in their first week',
      '<b>Duplication of knowledge</b>: each business rule (tax, discount, status) has one authoritative home'
    ],
    outOfScope: [
      '<b>Cyclic dependencies</b> between packages or services',
      '<b>Speculative generality</b>: interfaces, plug-ins and config for futures nobody asked for',
      '<b>God class / util dumping ground</b>: one class or "common" module everybody depends on and everybody edits',
      '<b>Train wrecks</b>: <code>a.getB().getC().getD()</code> chains through other objects\' internals',
      '<b>Inheritance for code reuse</b>: subclassing to borrow methods, breaking substitutability'
    ]
  },

  calculator: {
    inputs: [
      { id: 'ca', label: 'Afferent coupling Ca (outside classes that use this package)', min: 0, max: 60, value: 12 },
      { id: 'ce', label: 'Efferent coupling Ce (classes here that use other packages)', min: 0, max: 60, value: 3 },
      { id: 'na', label: 'Abstract classes + interfaces in the package', min: 0, max: 60, value: 1 },
      { id: 'nc', label: 'Total classes in the package', min: 1, max: 60, value: 20 }
    ],
    outputs: [
      { label: 'Instability I = Ce / (Ca + Ce)', f: (v) => (v.ca + v.ce === 0 ? 'undefined (no deps)' : (v.ce / (v.ca + v.ce)).toFixed(2)) },
      { label: 'Abstractness A = Na / Nc', f: (v) => (Math.min(v.na, v.nc) / v.nc).toFixed(2) },
      { label: 'Distance D = |A + I − 1|', f: (v) => { const I = v.ca + v.ce ? v.ce / (v.ca + v.ce) : 0; return Math.abs(Math.min(v.na, v.nc) / v.nc + I - 1).toFixed(2); } },
      { label: 'Zone', f: (v) => { const I = v.ca + v.ce ? v.ce / (v.ca + v.ce) : 0, A = Math.min(v.na, v.nc) / v.nc, D = Math.abs(A + I - 1); if (D <= 0.3) return 'near the main sequence ✓'; return A + I < 1 ? 'zone of pain (stable + concrete)' : 'zone of uselessness (abstract + unused)'; } },
      { label: 'Abstract types needed to sit on the line (A = 1 − I)', f: (v) => { const I = v.ca + v.ce ? v.ce / (v.ca + v.ce) : 0; return Math.round((1 - I) * v.nc) + ' of ' + v.nc; } },
      { label: 'Classes that may break if this package changes (≈ Ca)', f: (v) => v.ca }
    ],
    note: 'Formulas from Robert C. Martin\'s 1994 paper <i>OO Design Quality Metrics</i>. Some tools normalise D by √2; here D is the normalised 0–1 form. A package with I = 0 and A = 0 (many users, all concrete) is in the <b>zone of pain</b>: hard to change and impossible to extend. That is fine for things that never change (<code>String</code>, a currency library), and painful for your domain code. The 0.3 threshold is a <em>rule of thumb</em>.'
  },

  api: [
    { m: 'ADR', p: 'ADR-012: Billing depends on Orders through BillingPort', d: 'Context (cycle between orders and billing found by CI), options (merge modules, event, interface owned by orders), decision, consequences (one more type, orders tests use a fake billing), and how to revert.' },
    { m: 'POLICY', p: 'Dependency rules (ArchUnit)', d: 'A <code>beFreeOfCycles()</code> rule over module slices, layer rules, and "domain must not import Spring/JPA". Runs on every build; the rule file is the executable architecture.' },
    { m: 'DOC', p: 'Module README: public API and owner', d: 'What the module hides (the design decision), its published interfaces, what it may depend on, and its owner. The Parnas "secret" written down in one sentence.' },
    { m: 'YAML', p: 'Metrics gate (CI)', d: 'Per-package Ca, Ce, I, A, D from a tool such as JDepend or NDepend; fail or warn when D > 0.3 for a domain package, or when a stable package (I &lt; 0.2) gains a new concrete class.' },
    { m: 'HTTP', p: 'Tolerant-reader contract', d: 'For APIs and events: producers send exactly the documented schema; consumers ignore unknown fields but <b>reject</b> malformed required ones. RFC 9413 style: be strict, version on purpose.' },
    { m: 'RFC', p: 'Design review checklist', d: 'Does each module hide one decision? Any new cycle? Does the dependency point towards stability? Is the new abstraction used by two real clients today? Any surprise for callers?' }
  ],

  dataModel: [
    { name: 'package_metrics', store: 'Postgres (from CI scan)', fields: [['package', 'text', 'pk'], ['build_id', 'bigint', 'pk'], ['ca', 'int'], ['ce', 'int'], ['abstract_types', 'int'], ['total_types', 'int'], ['instability', 'numeric(3,2)'], ['distance', 'numeric(3,2)', 'idx']], note: 'One row per package per build. Plot D over time: a package drifting into the zone of pain is an early warning of tech debt.' },
    { name: 'dependency_edge', store: 'Postgres (from bytecode scan)', fields: [['from_class', 'text', 'pk'], ['to_class', 'text', 'pk'], ['from_pkg', 'text', 'idx'], ['to_pkg', 'text', 'idx'], ['kind', 'enum (call|extends|implements|field)'], ['in_cycle', 'bool', 'idx']], note: 'Class-level edges roll up into package Ca/Ce. <code>in_cycle</code> comes from a strongly connected components pass.' },
    { name: 'arch_rule', store: 'repo (ArchUnit tests)', fields: [['rule_id', 'text', 'pk'], ['description', 'text'], ['severity', 'enum (fail|warn)'], ['frozen_violations', 'int'], ['owner', 'text']], note: 'ArchUnit can "freeze" existing violations so only new ones fail the build: the way to adopt rules on a legacy codebase.' }
  ],

  architecture: {
    title: 'Orders, Billing and the arrows between them',
    nodes: [
      { id: 'dev', label: 'Developer', sub: 'changes tax rules', kind: 'person', wide: [100, 80], tall: [70, 0], tip: 'The person whose change should stay local.' },
      { id: 'web', label: 'Web module', sub: 'controllers', kind: 'client', wide: [320, 80], tall: [210, 0], tip: 'Unstable by design (I near 1): depends on others, nothing depends on it.' },
      { id: 'ci', label: 'ArchUnit in CI', sub: 'cycles · layers', kind: 'policy', wide: [880, 80], tall: [350, 0], tip: 'Fitness functions that fail the build on cycles or forbidden imports.' },
      { id: 'ord', label: 'Orders core', sub: 'domain + use cases', kind: 'service', wide: [320, 210], tall: [70, 110], tip: 'High-level policy. Should depend only on abstractions it owns.' },
      { id: 'port', label: 'BillingPort', sub: 'interface (orders)', kind: 'edge', wide: [600, 210], tall: [210, 110], tip: 'The abstraction. Owned by the client (orders), implemented by billing. Abstract and stable: A = 1, I near 0.' },
      { id: 'bill', label: 'Billing core', sub: 'implements port', kind: 'service', wide: [880, 210], tall: [350, 110], tip: 'Low-level detail from the orders point of view. Depends on the port, not the other way round.' },
      { id: 'adp', label: 'JPA adapter', sub: 'OrderRepository impl', kind: 'compute', wide: [320, 340], tall: [70, 220], tip: 'Another inverted dependency: orders defines OrderRepository, the adapter implements it.' },
      { id: 'lib', label: 'shared-lib', sub: 'common utils + DTOs', kind: 'external', wide: [600, 340], tall: [210, 220], tip: 'High Ca, all concrete: the classic zone of pain. Every change ripples to every user.' },
      { id: 'bus', label: 'Event bus', sub: 'OrderPlaced', kind: 'queue', wide: [880, 340], tall: [350, 220], tip: 'The loosest coupling: billing reacts to an event and orders does not know it exists.' },
      { id: 'db', label: 'Database', sub: 'schema per module?', kind: 'store', wide: [600, 460], tall: [210, 330], tip: 'Sharing tables between modules is hidden coupling that no import graph shows.' }
    ],
    edges: [
      { from: 'dev', to: 'web' },
      { from: 'web', to: 'ord' },
      { from: 'ord', to: 'port' },
      { from: 'bill', to: 'port', dashed: true, label: 'implements' },
      { from: 'adp', to: 'ord', dashed: true },
      { from: 'adp', to: 'db' },
      { from: 'ord', to: 'lib' },
      { from: 'bill', to: 'lib' },
      { from: 'ord', to: 'bus', bend: -0.25 },
      { from: 'bus', to: 'bill' },
      { from: 'bill', to: 'db', dashed: true, bend: 0.2 },
      { from: 'ci', to: 'bill', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'dip', title: 'Dependency inversion: orders owns the socket', tone: 'ok',
      steps: [
        { text: 'A checkout request reaches the <b>web module</b>, which calls the orders use case. Web is <b>unstable</b> by design: it depends on others and nothing depends on it.', flow: ['dev>web', 'web>ord'], badges: { web: 'I = 1' } },
        { text: 'Orders needs to charge the customer. It calls <code>BillingPort.charge()</code>, an interface <b>declared in the orders package</b>. Orders does not import any billing class.', flow: ['ord>port'], ok: ['ord'], badges: { port: ['A = 1', 'ok'] } },
        { text: 'Billing <b>implements</b> the port. Spring injects the implementation at startup. The source-code arrow now points from billing to orders, against the flow of control.', flow: ['bill>port'], ok: ['bill'], badges: { bill: 'implements' } },
        { text: 'Same trick for persistence: orders defines <code>OrderRepository</code>; the JPA adapter implements it. Orders unit tests use in-memory fakes and run in milliseconds.', flow: ['adp>ord', 'adp>db'], ok: ['ord', 'adp'], badges: { ord: ['no DB in tests', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'cycle', title: 'A sneaky cycle fails the build', tone: 'err',
      steps: [
        { text: 'A developer needs the order total in an invoice and imports <code>com.shop.orders.Order</code> into billing. Orders already reaches billing through the port, so this looks harmless.', flow: ['dev>web', 'bill>port'], nodes: ['bill', 'ord'], warn: ['bill'], labels: { bill: { label: 'Billing core', sub: 'imports Order' } } },
        { text: 'If orders also has any direct import of billing (a leftover helper), the two packages now form a <b>cycle</b>. Neither can be released, tested or understood alone.', nodes: ['ord', 'bill'], err: ['ord', 'bill'], badges: { ord: ['cycle', 'err'], bill: ['cycle', 'err'] }, tone: 'err' },
        { text: 'The ArchUnit rule <code>slices().matching("com.shop.(*)..").should().beFreeOfCycles()</code> fails the pull request and prints the edge that closes the loop.', flow: ['ci>bill'], err: ['ci'], badges: { ci: ['build red', 'err'] }, tone: 'err' },
        { text: 'Fix options: pass the total through the port method, publish <b>OrderPlaced</b> on the event bus, or move the shared type to a stable, abstract package both may use.', flow: ['ord>bus', 'bus>bill'], ok: ['ord', 'bill', 'ci'], badges: { ci: ['green', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'pain', title: 'shared-lib drifts into the zone of pain', tone: 'warn',
      steps: [
        { text: 'Forty modules use <code>shared-lib</code>: date helpers, DTOs, a <code>MoneyUtils</code> class. Ca = 40, Ce = 0, so <b>I = 0</b>. It has no interfaces, so <b>A = 0</b>.', flow: [['ord>lib', 'bill>lib']], warn: ['lib'], badges: { lib: ['Ca 40 · I 0 · A 0', 'warn'] }, tone: 'warn' },
        { text: '<b>D = |0 + 0 − 1| = 1</b>: as far from the main sequence as possible. It is stable (everyone depends on it) and concrete (nobody can extend it without editing it).', nodes: ['lib'], err: ['lib'], badges: { lib: ['D = 1.0', 'err'] } },
        { text: 'A rounding fix in <code>MoneyUtils</code> changes invoice totals in billing and refund maths in orders. Every module must be retested and released. DRY applied to <b>unrelated knowledge</b> created hidden coupling.', flow: [['ord>lib', 'bill>lib']], err: ['ord', 'bill'], tone: 'err' },
        { text: 'Fix: split by reason to change. Money becomes a tiny, stable value-type library. DTOs move to the module that owns them. Helpers used once go back inline. D drops for each piece.', nodes: ['lib'], ok: ['lib'], labels: { lib: { label: 'money-lib', sub: 'small · stable · final' } }, badges: { lib: ['D 0.2', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'db', title: 'Hidden coupling through a shared table', tone: 'err',
      steps: [
        { text: 'The import graph is clean: no cycles, all arrows point the right way. Yet billing reads the <code>orders</code> table directly for a report.', flow: ['bill>db'], warn: ['db'], badges: { db: ['shared table', 'warn'] } },
        { text: 'Orders renames <code>status</code> to <code>state</code>. All its tests pass. Billing breaks in production: the coupling was real but <b>invisible to the compiler</b> (Parnas: the table layout was the secret that leaked).', flow: ['adp>db', 'bill>db'], err: ['bill', 'db'], tone: 'err' },
        { text: 'Fix: billing gets the data through a published interface or an event. Each module owns its schema; database grants enforce it.', flow: ['ord>bus', 'bus>bill'], ok: ['bill', 'db'], labels: { db: { label: 'Database', sub: 'schema per module' } }, tone: 'ok' }
      ]
    },
    {
      id: 'postel', title: 'Postel\'s Law at a boundary', tone: 'info',
      steps: [
        { text: 'Orders publishes <code>OrderPlaced v1</code>. Billing is a <b>tolerant reader</b>: it reads only the fields it needs and ignores unknown ones, so orders can add fields freely.', flow: ['ord>bus', 'bus>bill'], ok: ['bill'] },
        { text: 'A producer bug sends <code>total</code> as a string. A too-liberal consumer quietly parses it, and soon another producer relies on that. The bug has become <b>part of the contract</b>.', flow: ['ord>bus', 'bus>bill'], warn: ['bill'], badges: { bill: ['accepts junk', 'warn'] }, tone: 'warn' },
        { text: 'RFC 9413 (2023) advice: tolerate <b>unknown extensions</b>, but reject <b>malformed</b> data loudly and fix the producer. Be conservative in what you send, precise in what you accept.', flow: ['ord>bus'], ok: ['bill'], badges: { bus: ['schema check', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose how two modules are coupled, how much you abstract, and how finely you cut modules. Numbers are <em>illustrative</em>; the direction of each change is the point.',
    controls: [
      { id: 'cpl', label: 'Coupling style between modules', type: 'seg', value: 'iface', options: [
        { v: 'db', l: 'Shared DB tables' }, { v: 'lib', l: 'Shared library' }, { v: 'direct', l: 'Direct class calls' }, { v: 'events', l: 'Events' }, { v: 'iface', l: 'Interfaces (DIP)' }] },
      { id: 'abs', label: 'Abstraction level', type: 'seg', value: 'ports', options: [
        { v: 'none', l: 'Concrete everywhere' }, { v: 'ports', l: 'Ports at boundaries' }, { v: 'all', l: 'Interface for every class' }] },
      { id: 'gran', label: 'Module granularity', type: 'seg', value: 'cap', options: [
        { v: 'one', l: 'One big module' }, { v: 'cap', l: 'By business capability' }, { v: 'tiny', l: 'Many tiny modules' }] }
    ],
    evaluate(s) {
      const c = (x) => Math.max(0.05, Math.min(1, x));
      const base = { db: [0.2, 0.3, 0.45, 0.9, 0.5], lib: [0.4, 0.5, 0.6, 0.85, 0.25], direct: [0.45, 0.4, 0.75, 0.95, 0.6], events: [0.85, 0.75, 0.45, 0.6, 0.55], iface: [0.8, 0.9, 0.7, 0.9, 0.7] }[s.cpl];
      let [change, test, onboard, perf, dup] = base;
      if (s.abs === 'none') { change -= 0.15; test -= 0.25; onboard += 0.1; }
      if (s.abs === 'all') { change -= 0.05; test += 0.05; onboard -= 0.3; perf -= 0.03; }
      if (s.gran === 'one') { change -= 0.25; onboard -= 0.15; dup += 0.15; }
      if (s.gran === 'tiny') { change -= 0.1; onboard -= 0.2; dup -= 0.2; perf -= s.cpl === 'events' ? 0.15 : 0.05; }
      if (s.gran === 'cap') { change += 0.05; }
      const cyc = s.cpl === 'direct' && s.gran !== 'tiny' ? 'likely' : s.cpl === 'db' ? 'hidden' : 'none';
      const metrics = [
        { k: 'Change cost', v: change > 0.7 ? 'local, one module' : change > 0.45 ? 'a few modules' : 'ripples widely', s: c(change) },
        { k: 'Testability', v: test > 0.7 ? 'fakes at ports, fast' : test > 0.45 ? 'needs some wiring' : 'needs real DB / everything', s: c(test) },
        { k: 'Onboarding', v: onboard > 0.65 ? 'easy to follow' : onboard > 0.4 ? 'some indirection' : 'maze of indirection', s: c(onboard) },
        { k: 'Runtime performance', v: s.cpl === 'events' ? 'async lag, broker hop' : 'in-process calls', s: c(perf) },
        { k: 'Duplication risk', v: dup > 0.6 ? 'knowledge has one home' : dup > 0.4 ? 'some copies drift' : 'rules copied or over-shared', s: c(dup) },
        { k: 'Cycle risk', v: cyc, s: cyc === 'none' ? 0.9 : cyc === 'hidden' ? 0.2 : 0.35 }
      ];
      const notes = [];
      if (s.cpl === 'db') notes.push('Shared tables are coupling the compiler cannot see. ArchUnit stays green while a column rename breaks another module.');
      if (s.cpl === 'lib') notes.push('A shared library with many users and no abstractions sits in the <b>zone of pain</b> (I ≈ 0, A ≈ 0). Keep shared libs small, stable and about one kind of knowledge.');
      if (s.cpl === 'direct') notes.push('Direct calls are the simplest thing and fine inside a module. Across modules, they make cycles easy; add a cycle check in CI.');
      if (s.cpl === 'events') notes.push('Events remove the compile-time dependency but add eventual consistency and make the flow harder to follow. Keep an event catalogue.');
      if (s.cpl === 'iface') notes.push('The client owns the interface (DIP). The arrow points from detail to policy, so the high-level module stays stable and testable.');
      if (s.abs === 'all') notes.push('An interface per class with one implementation is <b>speculative generality</b>. Every jump to definition lands on an interface. YAGNI.');
      if (s.abs === 'none' && s.cpl !== 'events') notes.push('No abstractions: easy to read today, but tests need the real collaborators and every package lands near A = 0.');
      if (s.gran === 'tiny') notes.push('Very fine modules lower cohesion: one feature spans many modules and the dependency graph grows faster than the code.');
      if (s.gran === 'one') notes.push('One big module has no boundaries to enforce, so coupling grows freely and DRY has nowhere to put shared knowledge except "util".');
      let verdict;
      if (s.cpl === 'db') verdict = '❌ <b>Hidden coupling.</b> Give each module its own schema and talk through an API or events.';
      else if (s.gran === 'one') verdict = '⚠ <b>No real boundaries.</b> Cut modules by business capability first; coupling style matters less until then.';
      else if (s.abs === 'all') verdict = '⚠ <b>Over-abstracted.</b> Keep interfaces at module boundaries and for things you really swap or fake.';
      else if (s.cpl === 'lib') verdict = '⚠ <b>Shared library as glue.</b> Fine for stable value types; risky for business rules that change.';
      else if (s.cpl === 'iface' && s.abs === 'ports' && s.gran === 'cap') verdict = '✅ <b>The sensible default:</b> capability modules, ports at the boundaries, dependencies pointing at stable abstractions.';
      else if (s.cpl === 'events') verdict = '👍 <b>Loosest coupling</b>, paid for with eventual consistency and harder tracing. Use where the caller does not need an answer.';
      else if (s.cpl === 'direct') verdict = '👍 <b>Simple and fast</b>, fine for a small codebase. Add a cycle check before it grows.';
      else verdict = '👍 <b>Reasonable.</b> Watch the metrics as it grows.';
      const portLbl = { iface: { label: 'BillingPort', sub: 'interface (orders)' }, direct: { label: 'BillingService', sub: 'concrete class' }, lib: { label: 'shared DTOs', sub: 'in shared-lib' }, events: { label: 'OrderPlaced', sub: 'event contract' }, db: { label: 'orders table', sub: 'read by billing' } }[s.cpl];
      const flow = s.cpl === 'events' ? ['web>ord', 'ord>bus', 'bus>bill'] : s.cpl === 'db' ? ['web>ord', 'adp>db', 'bill>db'] : s.cpl === 'lib' ? ['web>ord', ['ord>lib', 'bill>lib']] : ['web>ord', 'ord>port', 'bill>port'];
      return {
        metrics, verdict, notes, flow,
        labels: { port: portLbl },
        hide: s.cpl === 'events' ? [] : ['bus'],
        err: s.cpl === 'db' ? ['db'] : [],
        warn: s.cpl === 'lib' ? ['lib'] : s.cpl === 'direct' ? ['port'] : [],
        ok: s.cpl === 'iface' ? ['port'] : [],
        badges: { ci: [cyc === 'none' ? '0 cycles' : cyc === 'hidden' ? 'blind spot' : 'watch cycles', cyc === 'none' ? 'ok' : 'warn'] }
      };
    }
  },

  widget: {
    title: 'Move classes, invert a dependency, watch the metrics',
    caption: 'Eight classes in three modules. Tap a class, then <b>Move to</b> a module. Pick a cross-module dependency and press <b>Invert via interface</b>: an interface is created in the caller\'s module and the arrow flips. Ca, Ce, I, A and D are recomputed from the class graph, module <b>cycles</b> are found with a strongly-connected-components pass, and each module is plotted on the <b>A–I main-sequence chart</b>.'
  },

  realWorld: {
    intro: 'Most of these principles come from a handful of papers and books between 1972 and 2000. Knowing the original wording is the fastest way to avoid the common misreadings.',
    timeline: [
      { when: '1972', who: 'David Parnas', title: 'Information hiding', text: '<i>On the Criteria To Be Used in Decomposing Systems into Modules</i> (CACM, Dec 1972) compares a flowchart-style split with one where <b>each module hides a design decision</b> likely to change. The second is easier to change, even though both work. This is the root of encapsulation and of good module boundaries.', src: 0 },
      { when: '1974', who: 'Stevens, Myers & Constantine', title: 'Coupling and cohesion', text: '<i>Structured Design</i> in the IBM Systems Journal (1974) popularised <b>coupling</b> and <b>cohesion</b> (Myers called it "strength"). Constantine had been developing the ideas since the late 1960s.', src: 1 },
      { when: '1974', who: 'Edsger Dijkstra', title: 'Separation of concerns', text: 'In EWD447, <i>On the role of scientific thought</i>, Dijkstra names "the separation of concerns" as the only available technique for ordering one\'s thoughts, studying one aspect (say, correctness) while setting another aside. It is a <b>way of thinking</b> before it is a code layout.', src: 2 },
      { when: '1975', who: 'John Gall', title: 'Gall\'s Law', text: 'In <i>General Systemantics</i> (later <i>Systemantics</i>): "A complex system that works is invariably found to have evolved from a simple system that worked." Gall did not call it a law; others named it later.', src: 3 },
      { when: '1980–89', who: 'Jon Postel / IETF', title: 'Robustness principle', text: 'RFC 760 (1980) says an implementation should be conservative in its sending behaviour and liberal in its receiving behaviour; RFC 761 phrases it as "be conservative in what you do, be liberal in what you accept from others", and RFC 1122 (1989) restates it for hosts.', src: 4 },
      { when: '1987', who: 'Barbara Liskov', title: 'Data Abstraction and Hierarchy', text: 'Her OOPSLA \'87 keynote argues that subtypes must be usable wherever the supertype is expected. Liskov and Wing formalised this <b>behavioural subtyping</b> later (1994). Martin turned it into the L in SOLID.', src: 5 },
      { when: '1987', who: 'Holland & Lieberherr, Northeastern', title: 'Law of Demeter', text: 'Proposed by Ian Holland in late 1987 on the Demeter project; published by Lieberherr and Holland in IEEE Software (1989). A method should call only methods of itself, its parameters, objects it creates and its direct components: "only talk to your immediate friends".', src: 6 },
      { when: '1994', who: 'Robert C. Martin', title: 'Package metrics', text: '<i>OO Design Quality Metrics</i> defines Ca, Ce, <b>I = Ce/(Ca+Ce)</b>, <b>A</b> and the <b>main sequence</b> A + I = 1, plus the Stable Dependencies and Stable Abstractions principles. Tools such as JDepend, NDepend and PHP_Depend implement them.', src: 7 },
      { when: '1999', who: 'Andy Hunt & Dave Thomas', title: 'DRY', text: '<i>The Pragmatic Programmer</i>: "Every piece of knowledge must have a single, unambiguous, authoritative representation within a system." Thomas later stressed that DRY is about <b>knowledge</b>, not about code that looks alike.', src: 8 },
      { when: '2000', who: 'Robert C. Martin', title: 'Design Principles and Design Patterns', text: 'Collects OCP, LSP, DIP, ISP and the package principles (including the Acyclic Dependencies Principle). Michael Feathers later arranged five of them into the acronym <b>SOLID</b> (around 2004).', src: 9 },
      { when: '2014', who: 'Robert C. Martin', title: 'SRP clarified', text: 'Martin clarifies that a "reason to change" means a <b>person or group</b> asking for change: "Gather together the things that change for the same reasons. Separate those things that change for different reasons." SRP is not "do one thing".', src: 10 },
      { when: '2016', who: 'Sandi Metz', title: 'The Wrong Abstraction', text: '"Duplication is far cheaper than the wrong abstraction." When a shared function grows flags for each caller, inline it back and let the right abstraction emerge. The root of the WET and AHA (avoid hasty abstractions) reactions to over-DRY code.', src: 11 },
      { when: '2023', who: 'IAB (Thomson & Schinazi)', title: 'RFC 9413: Maintaining Robust Protocols', text: 'Argues that liberal acceptance of the unexpected lets bugs become de facto standards. Recommends <b>active protocol maintenance</b> instead: tolerate defects and attacks, but do not rely on accepting malformed input.', src: 12 }
    ],
    lessons: [
      'Every principle is about <b>change</b>: what is likely to change, and how far a change spreads.',
      'Read the originals. SRP is about <b>who asks for change</b>, DRY is about <b>knowledge</b>, Postel is now <b>contested</b>.',
      'Make the rules executable: cycle and layer checks in CI catch what reviews miss.',
      'Principles conflict. Decide with the change history of your code, not with the acronym.'
    ],
    sources: [
      { title: 'On the Criteria To Be Used in Decomposing Systems into Modules', url: 'https://www.cse.sc.edu/~mgv/csce590f20/ParnasCriteria.pdf', pub: 'D. L. Parnas, CACM 15(12), 1972' },
      { title: 'Larry L. Constantine (Computer Pioneers)', url: 'https://history.computer.org/pioneers/constantine.html', pub: 'IEEE Computer Society' },
      { title: 'EWD447: On the role of scientific thought', url: 'https://www.cs.utexas.edu/~EWD/transcriptions/EWD04xx/EWD447.html', pub: 'E. W. Dijkstra, 1974' },
      { title: 'Systemantics', url: 'https://en.wikipedia.org/wiki/Systemantics', pub: 'Wikipedia (John Gall, 1975)' },
      { title: 'Robustness principle (Postel\'s law)', url: 'https://devopedia.org/postel-s-law', pub: 'Devopedia' },
      { title: 'Keynote address: Data abstraction and hierarchy', url: 'https://researchr.org/publication/Liskov87', pub: 'B. Liskov, OOPSLA \'87 Addendum' },
      { title: 'Law of Demeter', url: 'https://en.wikipedia.org/wiki/Law_of_Demeter', pub: 'Wikipedia (Lieberherr & Holland, IEEE Software 1989)' },
      { title: 'Abstraction Instability Chart', url: 'https://pdepend.org/documentation/handbook/reports/abstraction-instability-chart.html', pub: 'PHP_Depend docs (Martin, 1994 metrics)' },
      { title: 'Orthogonality and the DRY Principle', url: 'https://www.artima.com/intv/dry.html', pub: 'Artima interview with Hunt & Thomas, 2003' },
      { title: 'Design Principles and Design Patterns', url: 'https://eli.sdsu.edu/courses/fall19/cs635/Principles_and_Patterns.pdf', pub: 'R. C. Martin, 2000' },
      { title: 'The Single Responsibility Principle', url: 'https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html', pub: 'R. C. Martin, Clean Coder Blog, 2014' },
      { title: 'The Wrong Abstraction', url: 'https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction', pub: 'Sandi Metz, 2016' },
      { title: 'RFC 9413: Maintaining Robust Protocols', url: 'https://www.rfc-editor.org/rfc/rfc9413.html', pub: 'IAB, June 2023' },
      { title: 'Yagni', url: 'https://www.martinfowler.com/bliki/Yagni.html', pub: 'Martin Fowler, bliki' },
      { title: 'ArchUnit User Guide', url: 'https://archunit.org/userguide/html/000_Index.html', pub: 'ArchUnit' }
    ]
  },

  tradeoffs: {
    headers: ['Principle', 'Buys you', 'Misreading / cost', 'Use when…'],
    rows: [
      ['<b>SRP / cohesion</b>', 'Changes for one stakeholder stay in one place', '"A class must do one thing" leads to hundreds of one-method classes', 'Two groups of people ask for changes to the same code'],
      ['<b>DRY</b>', 'One home per business rule; no drifting copies', 'Merging code that only <i>looks</i> alike: the wrong abstraction, shared-lib zone of pain', 'The same <b>knowledge</b> appears twice (rule, schema, constant)'],
      ['<b>DIP / interfaces</b>', 'Stable policy, fast tests, swappable details', 'An interface for every class; indirection without a second implementation or a test need', 'At module boundaries, external systems, and things you fake in tests'],
      ['<b>YAGNI / KISS / Gall</b>', 'Less code, faster feedback, systems that evolve from working ones', 'Excuse for no design or no refactoring; Fowler: YAGNI needs code that is easy to change', 'Features for presumed futures; plug-in frameworks with one plug-in'],
      ['<b>Law of Demeter</b>', 'Callers do not depend on internal structure', 'Wrapper methods everywhere; it does not apply to fluent APIs or plain data', 'Navigating object graphs of other modules'],
      ['<b>Postel / tolerant reader</b>', 'Interoperability across versions', 'Accepting malformed input turns bugs into de facto contracts (RFC 9413)', 'Ignore unknown fields; reject invalid ones']
    ]
  },

  failures: [
    { f: '<b>Package cycle</b>: two modules import each other', detect: 'ArchUnit <code>beFreeOfCycles()</code>, Spring Modulith <code>verify()</code>, JDepend cycle report', fix: 'Invert one edge via an interface owned by the caller, publish an event, or merge the modules if they really are one concept' },
    { f: '<b>Zone of pain</b>: a stable, concrete "common" module', detect: 'I &lt; 0.2 and A &lt; 0.2 with high Ca; every release touches it', fix: 'Split by reason to change; move DTOs to their owners; leave only stable value types' },
    { f: '<b>Zone of uselessness</b>: interfaces nobody uses', detect: 'A near 1, Ca near 0; interfaces with one implementation and no test fakes', fix: 'Delete the abstraction (YAGNI); reintroduce it when a second client appears' },
    { f: '<b>Wrong abstraction</b>: a shared function full of flags', detect: 'Boolean parameters per caller; every change needs "if caller == X"', fix: 'Inline it back into the callers, then extract what is really common (Metz)' },
    { f: '<b>LSP violation</b>: subclass that throws or weakens behaviour', detect: '<code>UnsupportedOperationException</code> in overrides; <code>instanceof</code> checks in clients', fix: 'Composition over inheritance; split the interface (ISP) so the subtype only promises what it can do' },
    { f: '<b>Hidden coupling</b> through a shared DB, file or config', detect: 'Import graph is clean but changes still break other modules; DB access logs show cross-schema reads', fix: 'Schema per module with grants; publish data through an API or events' }
  ],

  interview: [
    { q: 'State the SOLID principles precisely and say where each came from.', a: '<ul><li><b>SRP</b>: a module should have one reason to change, meaning one group of people asking for change (Martin, clarified 2014).</li><li><b>OCP</b>: open for extension, closed for modification (Bertrand Meyer, 1988; Martin\'s version uses abstractions and polymorphism).</li><li><b>LSP</b>: subtypes must be substitutable for their base types without breaking correctness (Liskov, 1987 keynote; Liskov & Wing, 1994).</li><li><b>ISP</b>: clients should not depend on methods they do not use.</li><li><b>DIP</b>: high-level modules should not depend on low-level modules; both depend on abstractions.</li></ul><p>Martin collected them around 2000; Michael Feathers coined the acronym around 2004.</p>', fu: 'Which one do people misread most?', lvl: 'core' },
    { q: 'What is the difference between dependency inversion and dependency injection?', a: '<p><b>Inversion</b> is a design rule about the direction of <b>source-code dependencies</b>: the high-level module owns an interface, and the low-level module implements it, so the arrow points from detail to policy.</p><p><b>Injection</b> is a technique for supplying the implementation at runtime (constructor injection, Spring). You can inject a concrete class and still violate DIP, and you can follow DIP with a hand-written factory and no container.</p><p>The key detail: <b>who owns the interface</b>. If the interface lives in the billing package, orders still depends on billing.</p>', lvl: 'core' },
    { q: 'Define coupling and cohesion. How would you measure them in a real codebase?', a: '<p><b>Coupling</b>: how much one module depends on others (Stevens, Myers & Constantine, 1974). <b>Cohesion</b>: how strongly the parts of a module belong together.</p><ul><li>Static: Martin\'s <b>Ca/Ce</b>, instability, cycles; LCOM for class cohesion.</li><li>Change-based: <b>co-change</b> from git history. Files that always change together but live in different modules show low cohesion and hidden coupling.</li><li>Hidden: shared tables, shared config, shared caches. These need DB logs, not import graphs.</li></ul>', lvl: 'core' },
    { q: 'Walk me through I, A and D. What is the main sequence and the two zones?', a: '<p><b>I = Ce / (Ca + Ce)</b>: 0 is maximally stable (many depend on it, it depends on nothing), 1 is maximally unstable. <b>A</b> = abstract types / all types. The <b>main sequence</b> is the line A + I = 1; <b>D = |A + I − 1|</b> is the distance from it.</p><ul><li><b>Zone of pain</b> (0,0): stable and concrete. Hard to change, cannot be extended. OK for things that never change, like <code>String</code>.</li><li><b>Zone of uselessness</b> (1,1): abstract and nobody uses it.</li></ul><p>The idea (Stable Abstractions Principle): a package should be as abstract as it is stable.</p>', fu: 'Where should the domain core sit?', lvl: 'deep' },
    { q: 'Explain the Stable Dependencies and Acyclic Dependencies principles. How do you break a cycle?', a: '<p><b>ADP</b>: the dependency graph between packages must have no cycles. A cycle makes all packages in it one unit for build, test and release.</p><p><b>SDP</b>: depend in the direction of stability; a package\'s I should be greater than the I of the packages it depends on.</p><p>Break a cycle by: (1) <b>DIP</b>: introduce an interface in the module that should be stable, implemented by the other; (2) move the shared type into a new, stable package both depend on; (3) replace the call with an <b>event</b>; (4) merge the modules if they are really one concept. Then add an ArchUnit cycle rule so it stays fixed.</p>', lvl: 'core' },
    { q: 'DRY vs WET vs AHA. When is duplication the right choice?', a: '<p>Hunt and Thomas (1999) define DRY as one authoritative representation of each piece of <b>knowledge</b>, not "no similar-looking code".</p><p>Two blocks that look the same but encode <b>different rules</b> (say, invoice rounding vs refund rounding) should stay separate: they will change for different reasons. Merging them creates the <b>wrong abstraction</b> (Metz, 2016). AHA, "avoid hasty abstractions", says wait until you understand the variation; a common rule of thumb is the rule of three.</p><p>Across services, duplicating small code is often better than a shared library that couples release cycles.</p>', lvl: 'core' },
    { q: 'What does the Law of Demeter actually say, and when would you break it?', a: '<p>Holland and Lieberherr (Northeastern, 1987): a method <code>m</code> of object <code>O</code> should call only methods of <code>O</code>, its parameters, objects it creates, and its direct fields. In short: <b>talk only to your immediate friends</b>.</p><p><code>order.getCustomer().getAddress().getCountry()</code> couples the caller to three internal structures. Better: <code>order.shippingCountry()</code> (tell, don\'t ask).</p><p>It does not apply to <b>fluent builders and streams</b> (each call returns the same kind of object) or to plain data structures and DTOs. It is not "count the dots".</p>', lvl: 'core' },
    { q: 'Postel\'s Law: do you agree with it today?', a: '<p>Postel (RFC 760/761, 1980; RFC 1122, 1989): be conservative in what you send, liberal in what you accept. It helped early Internet interoperability.</p><p>The critique, written up in <b>RFC 9413</b> (IAB, 2023): accepting malformed input lets producer bugs spread and become de facto standards that every new implementation must copy, and it widens the attack surface. The recommendation is active maintenance of protocols.</p><p>My practice: <b>tolerant reader</b> for unknown, additive fields; <b>strict validation</b> for malformed or missing required fields; versioned contracts; contract tests.</p>', lvl: 'deep' },
    { q: 'Composition over inheritance: why, and give an LSP example.', a: '<p>Inheritance couples a subclass to the <b>implementation</b> of its parent (the fragile base class problem) and promises substitutability. Composition couples only to an interface and can be changed at runtime.</p><p>Classic LSP break: <code>Square extends Rectangle</code>. A client that sets width 5 and height 4 expects area 20; the square gives 16. Or a <code>ReadOnlyList</code> that throws on <code>add</code>. Fix by modelling capabilities as separate interfaces and composing behaviour (strategy, decorator).</p>', lvl: 'core' },
    { q: 'YAGNI, KISS and Gall\'s Law versus designing for extensibility. How do you decide?', a: '<p>YAGNI (XP, Beck): do not build a capability for a presumed future need. Fowler adds that YAGNI only works if the code is <b>easy to change</b>, so it never excuses skipping refactoring or tests. Gall (1975): complex working systems evolve from simple working ones.</p><p>I decide by the <b>cost of change later</b>: cheap to add later (an interface inside one module) → wait. Expensive or irreversible later (public API shape, data model, a contract other teams will use) → design for it now. One-way vs two-way doors.</p>', lvl: 'core' },
    { q: 'You inherit a codebase with a 400-class "common" module everyone depends on. What do you do?', a: '<ol><li><b>Measure</b>: Ca, Ce, I, A, D per package, cycles, and git co-change. Expect I ≈ 0, A ≈ 0: zone of pain.</li><li><b>Freeze</b>: ArchUnit rule that nothing new goes into common, with existing violations frozen.</li><li><b>Split by reason to change</b>: value types (money, ids) into a tiny stable lib; DTOs back to their owning modules; one-caller helpers inlined.</li><li>Where common holds business rules, give each rule <b>one owner module</b> and expose it through an interface.</li><li>Track D and the number of modules touched per change as the success measure.</li></ol>', lvl: 'deep' },
    { q: 'Tell me about a time you convinced a team to adopt an architectural rule they resisted.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><p><b>Situation:</b> a 25-engineer team with a modular monolith; builds took 30 minutes and small changes kept breaking unrelated modules.</p><p><b>Task:</b> reduce cross-module breakage without a rewrite.</p><p><b>Action:</b> I ran a dependency scan and showed one six-module cycle and a shared-utils package with D ≈ 1. I proposed one ArchUnit cycle rule with existing violations <b>frozen</b>, so nobody had to fix old code first. We broke the two worst edges with interfaces owned by the caller and an event.</p><p><b>Result:</b> after a quarter the cycle was gone, the orders module tested without a database, and changes touching three or more modules dropped noticeably. The rule stayed because it never blocked existing work.</p>', lvl: 'deep' }
  ],

  code: [
    {
      title: 'Dependency inversion in Spring Boot 3 (before → after)', lang: 'java',
      code: `// BEFORE: orders imports billing's concrete class -> orders depends on billing
package com.shop.orders;
import com.shop.billing.StripeBillingService;           // detail leaks into policy
@Service class CheckoutServiceOld {
  private final StripeBillingService billing = new StripeBillingService(); // untestable
  Receipt checkout(Order o) { return billing.chargeCard(o.customerId(), o.total()); }
}

// AFTER: orders OWNS the abstraction it needs
package com.shop.orders;
public interface BillingPort {                          // A = 1, stable
  Receipt charge(CustomerId customer, Money amount);
}
@Service
class CheckoutService {
  private final BillingPort billing;
  private final OrderRepository orders;                 // also a port owned by orders
  CheckoutService(BillingPort billing, OrderRepository orders) { // constructor injection
    this.billing = billing; this.orders = orders;
  }
  @Transactional
  Receipt checkout(Order o) {
    orders.save(o.markPlaced());
    return billing.charge(o.customerId(), o.total());
  }
}

// billing depends on orders' interface: the arrow is inverted
package com.shop.billing;
import com.shop.orders.BillingPort;
@Component
class StripeBilling implements BillingPort {
  private final StripeClient stripe;
  StripeBilling(StripeClient stripe) { this.stripe = stripe; }
  @Override public Receipt charge(CustomerId c, Money m) { return stripe.charge(c.value(), m.cents()); }
}`,
      note: 'The test for <code>CheckoutService</code> passes a lambda or fake <code>BillingPort</code>; no Stripe, no Spring context. If the interface lived in <code>com.shop.billing</code>, orders would still depend on billing and nothing would be inverted.'
    },
    {
      title: 'ArchUnit: no cycles, layers, framework-free domain', lang: 'java',
      code: `// testImplementation 'com.tngtech.archunit:archunit-junit5:1.3.0'
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.*;
import com.tngtech.archunit.lang.ArchRule;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(packages = "com.shop", importOptions = ImportOption.DoNotIncludeTests.class)
class DesignRulesTest {

  @ArchTest  // Acyclic Dependencies Principle: one slice per top-level module
  static final ArchRule noModuleCycles =
      slices().matching("com.shop.(*)..").should().beFreeOfCycles();

  @ArchTest
  static final ArchRule layers = layeredArchitecture().consideringOnlyDependenciesInLayers()
      .layer("Web").definedBy("..web..")
      .layer("Domain").definedBy("..domain..")
      .layer("Adapters").definedBy("..adapter..")
      .whereLayer("Web").mayNotBeAccessedByAnyLayer()
      .whereLayer("Adapters").mayNotBeAccessedByAnyLayer()   // only wired by Spring
      .whereLayer("Domain").mayOnlyBeAccessedByLayers("Web", "Adapters");

  @ArchTest  // DIP: policy must not depend on frameworks
  static final ArchRule domainIsPure = noClasses().that().resideInAPackage("..domain..")
      .should().dependOnClassesThat()
      .resideInAnyPackage("org.springframework..", "jakarta.persistence..");
}`,
      note: 'To adopt on legacy code, wrap a rule in <code>FreezingArchRule.freeze(...)</code>: existing violations are recorded and only new ones fail the build.'
    },
    {
      title: 'Python 3.11: dependency inversion with typing.Protocol', lang: 'python',
      code: `# orders/ports.py  -- owned by the high-level module
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

@dataclass(frozen=True)
class Receipt:
    charge_id: str
    amount: Decimal

class BillingPort(Protocol):          # structural: no import of billing needed
    def charge(self, customer_id: str, amount: Decimal) -> Receipt: ...

# orders/checkout.py
class Checkout:
    def __init__(self, billing: BillingPort) -> None:
        self._billing = billing

    def place(self, customer_id: str, total: Decimal) -> Receipt:
        if total <= 0:
            raise ValueError("total must be positive")
        return self._billing.charge(customer_id, total)

# billing/stripe_billing.py  -- satisfies the Protocol without inheriting it
class StripeBilling:
    def charge(self, customer_id: str, amount: Decimal) -> Receipt:
        return Receipt(charge_id=f"ch_{customer_id}", amount=amount)

# tests/test_checkout.py
class FakeBilling:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Decimal]] = []
    def charge(self, customer_id: str, amount: Decimal) -> Receipt:
        self.calls.append((customer_id, amount))
        return Receipt("fake", amount)

def test_place_charges_once() -> None:
    fake = FakeBilling()
    Checkout(fake).place("c1", Decimal("9.99"))
    assert fake.calls == [("c1", Decimal("9.99"))]`,
      note: '<code>Protocol</code> gives structural typing: mypy or pyright checks that <code>StripeBilling</code> matches <code>BillingPort</code>, yet billing never imports orders and orders never imports billing. Wiring happens in a composition root (<code>main.py</code>).'
    }
  ],

  related: ['architectural-styles', 'ddd', 'quality-attributes', 'tech-debt', 'architecture-governance', 'sd:api-gateway']
});
