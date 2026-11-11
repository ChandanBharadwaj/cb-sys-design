SD.register({
  slug: 'documenting-architecture',
  domain: 2,
  title: 'Documenting Architecture',
  examples: 'C4, arc42, Structurizr',
  tagline: 'Write down only what each <b>audience</b> needs, at <b>one level of detail per diagram</b>, and keep it next to the code so it stays <b>true</b>.',
  tldr: {
    problem: 'Architecture lives in people\'s heads and in a wiki diagram drawn two years ago. Boxes have no types, arrows have no labels, one picture mixes the business view with class names, and new joiners learn the system by asking the one person who remembers.',
    idea: 'Use a small, shared vocabulary (<b>C4</b>: context, containers, components, code), a predictable structure for the prose (<b>arc42</b>, or views chosen per stakeholder as in <b>ISO/IEC/IEEE 42010</b>), record decisions as <b>ADRs</b>, and keep diagrams as <b>code</b> in the repository, reviewed in pull requests and partly <b>generated</b> from the code.',
    insight: 'A diagram is a model of the system <i>for a reader</i>. Pick the reader first, then the level of zoom. Documentation that is not reviewed with the code goes stale; documentation that is generated from the code cannot.',
    numbers: [
      { v: '4', l: 'C4 core diagram levels: context, container, component, code (Simon Brown, c4model.com)' },
      { v: '12', l: 'sections in the arc42 template (Starke & Hruschka, first published 2005)' },
      { v: '4+1', l: 'views in Kruchten\'s model: logical, process, development, physical + scenarios (IEEE Software, 1995)' }
    ]
  },

  intro: {
    what: 'Documenting architecture means writing down <b>how a system is structured and why</b>, so that people who were not in the room can understand it, change it safely and argue with it. In practice that is a few <b>diagrams at different levels of zoom</b>, a short text that follows a known template, and a log of the important decisions.',
    analogy: {
      icon: '🗺️',
      title: 'Maps at different zoom levels',
      text: 'A road atlas has a country map, a city map and a street map. Each one shows a single scale, has a <b>legend</b>, and you zoom in only where you need detail. Nobody draws motorways and house numbers on the same page. Architecture diagrams work the same way: the context diagram is the country map, the container diagram the city map, the component diagram the street map. Unlike a road map, software changes every week, so the map has to be redrawn from the territory (the code) often.'
    },
    problem: 'A new engineer joins a team that runs twelve services. The only diagram is a whiteboard photo in the wiki: unlabelled arrows, a box called "Backend", and two services that no longer exist. She spends two weeks asking people what talks to what. <b>How do we describe a system so the right reader finds the right level of detail, and so the description stays correct as the code changes?</b>',
    story: [
      {
        stage: 'naive',
        title: 'One big diagram in the wiki',
        text: 'The architect draws everything on one canvas in a drawing tool and pastes a PNG into the wiki. It is impressive in the kickoff meeting.',
        scene: {
          nodes: [
            { id: 'ar', label: 'Architect', sub: 'draws once', kind: 'person', at: [70, 0] },
            { id: 'wk', label: 'Wiki diagram', sub: 'one big PNG', kind: 'external', at: [210, 110] },
            { id: 'rd', label: 'Readers', sub: 'exec · dev · ops', kind: 'person', at: [350, 0] }
          ],
          edges: [{ from: 'ar', to: 'wk' }, { from: 'wk', to: 'rd' }],
          flow: ['ar>wk', 'wk>rd']
        }
      },
      {
        stage: 'breaks',
        title: 'The code moves, the picture does not',
        text: 'Developers change the code every day; nobody updates the PNG because it is not in the repo and nobody reviews it. After a few months it is <b>wrong</b>, and it was never right for any one reader: too technical for executives, too vague for engineers.',
        scene: {
          nodes: [
            { id: 'ar', label: 'Architect', sub: 'moved on', kind: 'person', at: [70, 0] },
            { id: 'cd', label: 'Code', sub: '300 commits later', kind: 'service', at: [70, 110] },
            { id: 'wk', label: 'Wiki diagram', sub: 'stale', kind: 'external', at: [210, 110] },
            { id: 'rd', label: 'New joiner', sub: 'misled', kind: 'person', at: [350, 110] }
          ],
          edges: [{ from: 'ar', to: 'wk' }, { from: 'wk', to: 'rd' }, { from: 'cd', to: 'wk', dashed: true }],
          flow: ['cd>wk', 'wk>rd'],
          err: ['wk'], warn: ['rd'],
          badges: { wk: ['stale', 'err'], rd: ['asks around', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'A model in the repo, views per reader',
        text: 'The structure lives in a <b>model as code</b> next to the source. CI renders several small views (context for executives, containers for developers, deployment for ops) and fails the build if code and model disagree. Changes to the picture are <b>reviewed</b> like code.',
        scene: {
          nodes: [
            { id: 'cd', label: 'Code + model', sub: 'same repo, same PR', kind: 'service', at: [70, 110] },
            { id: 'ci', label: 'CI', sub: 'render + check', kind: 'compute', at: [210, 110] },
            { id: 'v1', label: 'Context view', sub: 'for execs', kind: 'client', at: [350, 0] },
            { id: 'v2', label: 'Container view', sub: 'for devs', kind: 'client', at: [350, 110] },
            { id: 'v3', label: 'Deploy view', sub: 'for ops', kind: 'client', at: [350, 220] }
          ],
          edges: [{ from: 'cd', to: 'ci' }, { from: 'ci', to: 'v1' }, { from: 'ci', to: 'v2' }, { from: 'ci', to: 'v3' }],
          flow: ['cd>ci', ['ci>v1', 'ci>v2', 'ci>v3']],
          ok: ['ci', 'v2'],
          badges: { ci: ['in sync', 'ok'] }
        }
      }
    ],
    usedBy: ['C4 model (c4model.com)', 'arc42 template', 'Structurizr', 'Mermaid and PlantUML in GitHub / GitLab Markdown', 'Spring Modulith Documenter', 'UK Government Digital Service (docs as code)'],
    whenToUse: [
      'More than one team, or people outside the team, need to understand or change the system',
      'You are onboarding engineers often, or handing a system over to another team or to operations',
      'Decisions are being re-argued because nobody remembers <b>why</b> they were made (pair with <a href="rfcs-adrs.html">RFCs &amp; ADRs</a>)'
    ],
    whenNot: [
      'A throwaway prototype or spike: a whiteboard photo is enough, and that is fine',
      'Writing a 100-page document up front that nobody will maintain: write the few views people actually ask for',
      'Replacing conversation: docs support <a href="stakeholder-communication.html">stakeholder communication</a>, they do not replace it'
    ],
    glossary: [
      { term: 'C4 model', def: 'Simon Brown\'s set of hierarchical diagrams: system context, containers, components and code.' },
      { term: 'Container (C4)', def: 'A separately runnable or deployable thing that executes code or stores data, such as a web app, an API, a database or a queue; not a Docker container as such.' },
      { term: 'View / viewpoint', def: 'In ISO/IEC/IEEE 42010 a view describes the system from one set of concerns; the viewpoint is the recipe for building that kind of view.' },
      { term: 'arc42', def: 'An open, 12-section template for architecture documentation by Gernot Starke and Peter Hruschka.' },
      { term: 'Diagrams as code', def: 'Describing diagrams in a text language (Structurizr DSL, Mermaid, PlantUML) kept in version control and rendered by tools.' },
      { term: 'Docs as code', def: 'Writing documentation with the same tools as code: plain text, Git, pull-request review, CI builds.' },
      { term: 'ADR', def: 'Architecture Decision Record: a short note of one significant decision, its context and its consequences.' },
      { term: 'Living documentation', def: 'Documentation generated from, or verified against, the running code so that it cannot silently drift.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Audience first</b>: decide who reads it (executive, new joiner, operator, auditor) and what question they bring',
      '<b>One level of abstraction per diagram</b>: zoom in with a new diagram, never by cramming detail into an old one',
      '<b>Every diagram is self-describing</b>: a title with type and scope, a legend, typed elements, labelled arrows',
      '<b>One model, many views</b>: define each element once and render views from it, so renames happen in one place',
      '<b>Docs live with the code</b>: same repo, same pull request, same review',
      '<b>Record the why</b>: decisions go into ADRs that the docs link to; diagrams show the what'
    ],
    nonFunctional: [
      '<b>Accuracy</b>: structural views regenerated or checked in CI on every merge; no view older than one release (target)',
      '<b>Onboarding</b>: a new engineer can draw the container diagram from memory after week one (team goal)',
      '<b>Findability</b>: one entry point per system (README or docs site) reachable in two clicks',
      '<b>Review-ability</b>: diagram changes show up as a readable text diff in the pull request',
      '<b>Effort</b>: keeping docs current costs minutes per change, not a documentation sprint per quarter',
      '<b>Fitness for audience</b>: executives read one page; engineers find protocol and technology on every inter-container arrow'
    ],
    outOfScope: [
      '<b>The boxes-and-lines wiki picture</b>: no legend, no types, unlabelled arrows, meaning only in the author\'s head',
      '<b>Mixed abstraction levels</b>: a class name next to "Payment provider" on the same diagram',
      '<b>Big design document up front</b>: hundreds of pages written once and never read again',
      '<b>Hand-drawn Level 4 (code) diagrams</b>: they are out of date before the review ends; let the IDE generate them',
      '<b>Documentation as a separate project</b> owned by someone who does not change the code'
    ]
  },

  calculator: {
    inputs: [
      { id: 'sys', label: 'Software systems you own', min: 1, max: 40, value: 6 },
      { id: 'cont', label: 'Containers per system (apps, DBs, queues)', min: 2, max: 30, value: 8 },
      { id: 'pct', label: 'Containers complex enough for a component view', min: 0, max: 100, value: 25, unit: '%' },
      { id: 'extra', label: 'Dynamic + deployment views per system', min: 0, max: 10, value: 3 },
      { id: 'chg', label: 'Structural changes per month (new service, new dependency…)', min: 1, max: 100, value: 12 },
      { id: 'upd', label: 'Chance a hand-maintained diagram gets updated on a change', min: 0, max: 100, value: 40, unit: '%' }
    ],
    outputs: [
      { label: 'C4 core diagrams (context + container + selected component)', f: (v) => Math.round(v.sys * (2 + v.cont * v.pct / 100)) },
      { label: 'Total views incl. dynamic and deployment', f: (v) => Math.round(v.sys * (2 + v.cont * v.pct / 100 + v.extra)) },
      { label: 'Hand-drawn: edits per month (each change shows up on ~2.5 views)', f: (v) => Math.round(v.chg * 2.5) },
      { label: 'Model-as-code: edits per month (element defined once)', f: (v) => v.chg },
      { label: 'Hand-drawn views stale after 6 months', fmt: 'pct', f: (v) => { const D = v.sys * (2 + v.cont * v.pct / 100 + v.extra); const hits = v.chg * 6 * 2.5 / D; return 1 - Math.exp(-hits * (1 - v.upd / 100)); } },
      { label: 'Generated structural views stale after 6 months', fmt: 'pct', f: () => 0 }
    ],
    note: 'Diagram counts follow C4 practice: one context and one container view per system, component views only for complex containers, plus a few dynamic and deployment views. The ~2.5 views touched per change and the update probability are <em>estimates</em>; measure your own. Staleness assumes changes land on views at random (<em>Poisson</em>), so a view escapes being stale only if every change that hits it was also applied to it: stale = 1 − e<sup>−hits × (1 − p)</sup>. Generated views are only "0% stale" for what the generator can see (module structure); context, intent and decisions still need humans.'
  },

  api: [
    { m: 'DOC', p: 'docs/architecture/README (arc42 lite)', d: 'Goals and quality goals, constraints, context and scope, solution strategy, building blocks, runtime, deployment, crosscutting concepts, decisions, quality requirements, risks, glossary: the <b>12 arc42 sections</b>, each allowed to be one paragraph or "n/a".' },
    { m: 'YAML', p: 'workspace.dsl (Structurizr)', d: 'The single <b>model</b>: people, software systems, containers, components and relationships with technology. <code>views</code> select what to show for each audience; styles give every diagram the same legend.' },
    { m: 'DOC', p: 'Diagram set per system', d: 'L1 context (everyone), L2 containers (engineers, ops), L3 components for complex containers only, plus <b>dynamic</b> views for 2–3 key flows and a <b>deployment</b> view per environment. No hand-drawn L4.' },
    { m: 'ADR', p: 'docs/adr/NNNN-title.md', d: 'One decision per file: status, context, decision, consequences (Nygard, 2011). The architecture docs link to ADRs instead of repeating the rationale. See <a href="rfcs-adrs.html">RFCs &amp; ADRs</a>.' },
    { m: 'POLICY', p: 'Diagram review checklist', d: 'Title with type and scope, key/legend, every element named and typed, technology on containers, every arrow labelled with intent and protocol, one abstraction level. Used in PR review.' },
    { m: 'YAML', p: 'CI docs job', d: 'Renders the DSL and Mermaid to SVG, runs the generator tests (e.g. Spring Modulith <code>verify()</code> + <code>Documenter</code>), checks links, publishes the docs site on merge.' }
  ],
  dataModel: [
    { name: 'element', store: 'Architecture model (workspace.dsl)', fields: [['id', 'identifier', 'pk'], ['kind', 'person | softwareSystem | container | component'], ['name', 'text'], ['technology', 'text'], ['parent_id', 'identifier', 'fk'], ['owner_team', 'text', 'idx']], note: 'Defined once. Views refer to elements; they never copy them.' },
    { name: 'relationship', store: 'Architecture model', fields: [['source_id', 'identifier', 'pk'], ['destination_id', 'identifier', 'pk'], ['description', 'text'], ['technology', 'text']], note: 'Description = intent ("Publishes OrderPlaced"), technology = protocol ("AMQP"). Both are mandatory in review.' },
    { name: 'view', store: 'Architecture model', fields: [['key', 'text', 'pk'], ['type', 'context | container | component | dynamic | deployment'], ['scope_id', 'identifier', 'fk'], ['audience', 'exec | dev | ops'], ['last_rendered', 'timestamp', 'idx']], note: 'Pick the audience before the layout. A view with no audience is a candidate for deletion.' },
    { name: 'adr', store: 'docs/adr/*.md', fields: [['number', 'int', 'pk'], ['title', 'text'], ['status', 'proposed | accepted | superseded'], ['superseded_by', 'int', 'fk'], ['date', 'date', 'idx']], note: 'Immutable once accepted; you supersede, you do not edit.' }
  ],

  architecture: {
    title: 'Architecture docs as a pipeline',
    nodes: [
      { id: 'arch', label: 'Architect', sub: 'owns the model', kind: 'person', wide: [100, 40], tall: [70, 0], tip: 'Curates the model, the context view and the arc42 text. Does not draw every diagram by hand.' },
      { id: 'wiki', label: 'Wiki picture', sub: 'boxes and lines', kind: 'external', wide: [290, 40], tall: [70, 220], tip: 'The anti-pattern: drawn once, outside version control, nobody reviews it.' },
      { id: 'dev', label: 'Developers', sub: 'change code daily', kind: 'team', wide: [480, 40], tall: [350, 0], tip: 'The people who know when the structure changes. Docs must be on their path, in their PRs.' },
      { id: 'model', label: 'workspace.dsl', sub: 'model as code', kind: 'store', wide: [100, 150], tall: [70, 110], tip: 'Structurizr DSL: elements and relationships defined once; views for each audience.' },
      { id: 'adr', label: 'ADRs', sub: 'docs/adr/*.md', kind: 'store', wide: [290, 150], tall: [210, 110], tip: 'Why the structure is what it is. Linked from the docs, never duplicated.' },
      { id: 'code', label: 'Application code', sub: 'modules + tests', kind: 'service', wide: [480, 150], tall: [350, 110], tip: 'The territory. Generators read it; verification tests compare it with the intended structure.' },
      { id: 'ci', label: 'CI docs job', sub: 'render · verify · lint', kind: 'compute', wide: [480, 260], tall: [210, 330], tip: 'Renders DSL / Mermaid / PlantUML to SVG, runs generator tests, fails on broken rules.' },
      { id: 'gen', label: 'Generator', sub: 'Modulith Documenter', kind: 'compute', wide: [670, 260], tall: [350, 220], tip: 'Generates component diagrams and module canvases from the code itself: living documentation.' },
      { id: 'site', label: 'Docs site', sub: 'one entry point', kind: 'client', wide: [480, 370], tall: [210, 440], tip: 'Published on merge. One URL per system.' },
      { id: 'exec', label: 'Executive', sub: 'reads L1 context', kind: 'person', wide: [290, 370], tall: [70, 550], tip: 'Wants scope, users, external dependencies, risks. One page.' },
      { id: 'nj', label: 'New joiner', sub: 'reads L2 + ADRs', kind: 'person', wide: [670, 370], tall: [210, 550], tip: 'Wants containers, technologies, protocols, and the reasons behind them.' },
      { id: 'ops', label: 'Operator / SRE', sub: 'reads deployment', kind: 'person', wide: [870, 260], tall: [350, 550], tip: 'Wants deployment nodes, environments, dependencies and failure paths.' }
    ],
    edges: [
      { from: 'arch', to: 'model' },
      { from: 'arch', to: 'wiki', dashed: true, bend: 0.3 },
      { from: 'dev', to: 'code' },
      { from: 'dev', to: 'adr' },
      { from: 'model', to: 'ci' },
      { from: 'adr', to: 'ci' },
      { from: 'code', to: 'gen' },
      { from: 'gen', to: 'ci' },
      { from: 'ci', to: 'site', label: 'publish' },
      { from: 'site', to: 'exec' },
      { from: 'site', to: 'nj' },
      { from: 'site', to: 'ops' },
      { from: 'wiki', to: 'exec', dashed: true, bend: 0.35 }
    ]
  },

  scenarios: [
    {
      id: 'zoom', title: 'Audience-driven views from one model', tone: 'info',
      steps: [
        { text: 'The architect defines each person, system and container <b>once</b> in <code>workspace.dsl</code>, with technology on every relationship.', flow: ['arch>model'], badges: { model: '1 model' } },
        { text: 'CI renders <b>several views</b> from that one model: a context view, a container view, a deployment view per environment.', flow: ['model>ci', 'ci>site'], ok: ['ci'] },
        { text: 'The <b>executive</b> gets Level 1: the system as one box, its users and external systems. No technology, no internals.', flow: ['site>exec'], badges: { exec: 'L1' } },
        { text: 'The <b>new joiner</b> gets Level 2 plus the ADRs: containers, protocols, and why Postgres not Mongo. The <b>operator</b> gets the deployment view.', flow: [['site>nj', 'site>ops']], badges: { nj: 'L2 + ADR', ops: 'deploy' }, tone: 'ok' }
      ]
    },
    {
      id: 'pr', title: 'A structural change goes through review', tone: 'ok',
      steps: [
        { text: 'A developer adds a <b>recommendations service</b>. In the same pull request she adds two lines to the DSL and an ADR explaining the choice.', flow: [['dev>code', 'dev>adr']], badges: { dev: 'one PR' } },
        { text: 'Reviewers see the diagram change as a <b>text diff</b>: <code>web -> recs "Gets suggestions" "HTTPS"</code>. It is reviewed like code.', nodes: ['model', 'adr'], ok: ['model'] },
        { text: 'CI renders the new views, runs the module <b>verification test</b> and the docs linter (every arrow labelled, every container has technology).', flow: ['model>ci', 'code>gen', 'gen>ci'], ok: ['ci', 'gen'] },
        { text: 'On merge the docs site updates. The diagram is <b>never older than main</b>.', flow: ['ci>site'], ok: ['site'], badges: { site: ['in sync', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'rot', title: 'Documentation rot: the wiki picture', tone: 'err',
      steps: [
        { text: 'Two years ago the architect drew the system in a drawing tool and pasted a PNG into the wiki. It is <b>not in the repo</b> and not part of any review.', flow: ['arch>wiki'], warn: ['wiki'] },
        { text: 'Developers have since split one service, retired another and moved from REST to events. The <b>code changed 300 times</b>; the picture never did.', flow: ['dev>code'], err: ['wiki'], badges: { wiki: ['stale', 'err'] } },
        { text: 'A new joiner and an executive both read the PNG. One builds on a service that no longer exists; the other presents the wrong dependency to the board.', flow: ['wiki>exec'], nodes: ['nj'], err: ['exec'], warn: ['nj'], badges: { exec: ['wrong slide', 'err'] }, tone: 'err' },
        { text: 'Fix: move the structure into a <b>model in the repo</b>, generate what can be generated, and delete the wiki picture (or stamp it "historical").', flow: ['arch>model', 'model>ci'], ok: ['model'], hidden: [] }
      ]
    },
    {
      id: 'gen', title: 'Living documentation catches drift', tone: 'warn',
      steps: [
        { text: 'The intended structure says <b>orders</b> may use <b>inventory</b> through its public API only. That rule lives in the code as module boundaries.', nodes: ['code'], badges: { code: 'modules' } },
        { text: 'A rushed change makes orders call an <b>internal</b> inventory class. The code compiles. A hand-drawn diagram would not notice.', flow: ['dev>code'], warn: ['code'], badges: { code: ['boundary broken', 'warn'] } },
        { text: 'The Spring Modulith test runs <code>verify()</code> before generating docs: the build <b>fails</b> with the illegal dependency named.', flow: ['code>gen', 'gen>ci'], err: ['ci'], badges: { ci: ['fails', 'err'] }, tone: 'err' },
        { text: 'The developer fixes the dependency; the generated component diagram and module canvas are regenerated and published. Docs and code agree <b>by construction</b>.', flow: ['gen>ci', 'ci>site'], ok: ['ci', 'site', 'gen'], tone: 'ok' }
      ]
    },
    {
      id: 'scale', title: 'At scale: 40 systems, 300 views', tone: 'warn',
      steps: [
        { text: 'The company grows to 40 systems. Each team has its own diagrams in its own style; the same payment system appears in <b>11 different shapes and names</b>.', nodes: ['model', 'wiki'], warn: ['model', 'wiki'], badges: { model: ['300 views', 'warn'] }, tone: 'warn' },
        { text: 'Fix part 1: each team owns a <b>workspace</b> for its systems; a <b>system landscape</b> view is assembled from all of them, so names and ownership come from one place.', flow: ['arch>model', 'dev>code'], ok: ['model'] },
        { text: 'Fix part 2: a <b>shared style and checklist</b> (same legend, same element types) enforced by the CI linter, not by a review board.', flow: ['model>ci'], ok: ['ci'], badges: { ci: 'lint' } },
        { text: 'Readers now navigate landscape → context → container across teams with <b>one notation</b>. Governance is a pipeline, not a meeting (see <i>architecture governance</i>).', flow: ['ci>site', ['site>exec', 'site>nj']], ok: ['site'], tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'Choose how a 6-system, 8-team product group documents its architecture and who the main reader is. Meters show accuracy after the chosen number of months, authoring effort, onboarding speed and how easy changes are to review. Numbers are <em>illustrative</em>, derived from the staleness model in <b>Model it</b>.',
    diagram: {
      title: 'From source of truth to reader',
      nodes: [
        { id: 'au', label: 'Author', sub: 'architect / dev', kind: 'person', wide: [100, 90], tall: [70, 0], tip: 'Who writes or changes the docs.' },
        { id: 'wiki', label: 'Wiki page', sub: 'drawing tool PNG', kind: 'external', wide: [300, 40], tall: [210, 110], tip: 'Boxes and lines, outside the repo.' },
        { id: 'dsl', label: 'Model as code', sub: 'Structurizr DSL', kind: 'store', wide: [300, 150], tall: [70, 110], tip: 'C4 model in the repo.' },
        { id: 'tpl', label: 'arc42 document', sub: '12 sections', kind: 'store', wide: [300, 260], tall: [350, 110], tip: 'Full arc42 text with embedded views.' },
        { id: 'code', label: 'Code', sub: 'modules', kind: 'service', wide: [100, 260], tall: [350, 330], tip: 'The territory.' },
        { id: 'gen', label: 'Generator', sub: 'from code', kind: 'compute', wide: [500, 260], tall: [350, 220], tip: 'Generates structure views from the code.' },
        { id: 'ci', label: 'CI + review', sub: 'render · lint', kind: 'compute', wide: [500, 150], tall: [210, 220], tip: 'Review in PRs, render on merge.' },
        { id: 'site', label: 'Docs site', sub: 'published views', kind: 'client', wide: [700, 150], tall: [210, 330], tip: 'One entry point per system.' },
        { id: 'rd', label: 'Reader', sub: 'audience', kind: 'person', wide: [890, 150], tall: [210, 440], tip: 'The chosen audience.' }
      ],
      edges: [
        { from: 'au', to: 'wiki' }, { from: 'au', to: 'dsl' }, { from: 'au', to: 'tpl' }, { from: 'code', to: 'gen' },
        { from: 'dsl', to: 'ci' }, { from: 'tpl', to: 'ci' }, { from: 'gen', to: 'ci' }, { from: 'ci', to: 'site' }, { from: 'site', to: 'rd' },
        { from: 'wiki', to: 'rd', dashed: true, bend: -0.25 }
      ]
    },
    controls: [
      { id: 'ap', label: 'Approach', type: 'seg', value: 'c4', options: [
        { v: 'wiki', l: 'Wiki boxes-and-lines' }, { v: 'c4', l: 'C4 + diagrams as code' }, { v: 'gen', l: 'Generated from code' }, { v: 'arc42', l: 'arc42 full' }] },
      { id: 'aud', label: 'Main audience', type: 'seg', value: 'nj', options: [
        { v: 'exec', l: 'Executive' }, { v: 'nj', l: 'New joiner' }, { v: 'ops', l: 'Operations' }] },
      { id: 'pr', label: 'Docs reviewed in pull requests?', type: 'seg', value: 'yes', options: [
        { v: 'yes', l: 'Yes, same PR' }, { v: 'no', l: 'No, separate' }] },
      { id: 'mon', label: 'Months since written', type: 'range', min: 0, max: 24, step: 1, value: 6, unit: 'months' }
    ],
    evaluate(s) {
      const clamp = (x) => Math.max(0, Math.min(1, x));
      // update probability per change (estimates) → staleness via Poisson: hits/month on a given view ≈ 0.5
      let p = { wiki: 0.25, c4: 0.7, gen: 0.97, arc42: 0.45 }[s.ap];
      if (s.pr === 'yes' && s.ap !== 'gen') p = Math.min(0.95, p + 0.2);
      if (s.pr === 'no' && s.ap === 'c4') p -= 0.25;
      const hits = 0.5 * s.mon;
      const accuracy = Math.exp(-hits * (1 - p));
      const effort = { wiki: 0.35, c4: 0.45, gen: 0.3, arc42: 0.85 }[s.ap] + (s.pr === 'yes' ? 0.05 : 0);          // 1 = heavy
      // fit: how well the approach serves the chosen audience
      const fit = {
        wiki: { exec: 0.55, nj: 0.35, ops: 0.3 },
        c4: { exec: 0.85, nj: 0.85, ops: 0.65 },
        gen: { exec: 0.2, nj: 0.6, ops: 0.35 },
        arc42: { exec: 0.6, nj: 0.8, ops: 0.85 }
      }[s.ap][s.aud];
      const onboarding = clamp(fit * (0.4 + 0.6 * accuracy));
      const review = { wiki: 0.1, c4: 0.85, gen: 0.7, arc42: 0.5 }[s.ap] * (s.pr === 'yes' ? 1 : 0.5);
      const views = { wiki: 1, c4: 6 * 3 + 6 * 3, gen: 6 * 4, arc42: 6 * 6 }[s.ap];
      const lvl = (x) => (x >= 0.7 ? 'high' : x >= 0.45 ? 'medium' : 'low');
      const metrics = [
        { k: 'Accuracy after ' + 'N months', v: Math.round(accuracy * 100) + '% of views true', s: accuracy, hint: s.mon + ' months, estimate' },
        { k: 'Authoring + upkeep effort', v: lvl(effort), s: clamp(1 - effort) },
        { k: 'Fit for main audience', v: lvl(fit), s: fit },
        { k: 'Onboarding speed', v: lvl(onboarding), s: onboarding, hint: 'fit × accuracy' },
        { k: 'Review-ability of changes', v: lvl(review), s: clamp(review), hint: s.ap === 'wiki' ? 'binary PNG' : 'text diff' },
        { k: 'Views to maintain (6 systems)', v: '≈ ' + views, s: views > 30 ? 0.4 : 0.75, hint: s.ap === 'gen' ? 'generated' : 'by hand or DSL' }
      ];
      const notes = [];
      if (s.ap === 'wiki') notes.push('A single picture with no legend means each reader guesses the notation. After ' + s.mon + ' months, about <b>' + Math.round((1 - accuracy) * 100) + '%</b> chance it is wrong (model estimate).');
      if (s.ap === 'c4') notes.push('C4 levels give each reader one zoom level; the DSL defines each element once, so a rename is one line.');
      if (s.ap === 'gen') notes.push('Generated views are always true to the code, but only show what the code knows: <b>no users, no external context, no "why"</b>. Pair them with a hand-written context view and ADRs.');
      if (s.ap === 'arc42') notes.push('arc42 has a slot for everything (quality goals, risks, glossary), which auditors and operators love. Keep sections short or they rot like any long document.');
      if (s.aud === 'exec') notes.push('Executives need <b>Level 1</b>: scope, users, external dependencies, top risks. One page, no technology names.');
      if (s.aud === 'ops') notes.push('Operators need <b>deployment</b> and <b>dynamic</b> views: nodes, environments, failure paths. C4 core views alone are not enough.');
      if (s.pr === 'no') notes.push('Docs outside the PR are reviewed by nobody, so they drift at the speed of the code.');
      let verdict;
      if (s.ap === 'wiki' && s.mon >= 6) verdict = '❌ <b>Likely stale and ambiguous.</b> Move the structure into a model in the repo and add a legend.';
      else if (s.ap === 'wiki') verdict = '⚠ <b>Fine for a spike</b>, but it will rot as soon as the code moves.';
      else if (s.ap === 'gen' && s.aud === 'exec') verdict = '⚠ <b>Accurate but unreadable for executives.</b> Generated module graphs answer "what calls what", not "what does this system do for whom".';
      else if (s.ap === 'arc42' && s.aud === 'exec') verdict = '⚠ <b>Too much for this reader.</b> Give executives sections 1 and 3 (goals, context) and stop.';
      else if (s.pr === 'no') verdict = '⚠ <b>Good format, wrong process.</b> Review docs in the same pull request as the code.';
      else if (s.ap === 'c4' && s.aud !== 'ops') verdict = '✅ <b>Strong default.</b> C4 views from one model, reviewed with the code, cover executives and engineers.';
      else if (s.ap === 'arc42' && s.aud === 'ops') verdict = '✅ <b>Good fit.</b> arc42 deployment view, crosscutting concepts and risks are exactly what operators ask for.';
      else verdict = '👍 <b>Workable.</b> Add the views this audience is missing (deployment and dynamic for ops, context for executives).';
      const hide = { wiki: ['dsl', 'tpl', 'gen', 'ci', 'site'], c4: ['wiki', 'tpl', 'gen'], gen: ['wiki', 'dsl', 'tpl'], arc42: ['wiki', 'gen'] }[s.ap];
      const flow = { wiki: ['au>wiki', 'wiki>rd'], c4: ['au>dsl', 'dsl>ci', 'ci>site', 'site>rd'], gen: ['code>gen', 'gen>ci', 'ci>site', 'site>rd'], arc42: ['au>tpl', 'tpl>ci', 'ci>site', 'site>rd'] }[s.ap];
      const audL = { exec: { label: 'Executive', sub: 'wants L1 context' }, nj: { label: 'New joiner', sub: 'wants L2 + ADRs' }, ops: { label: 'Operations', sub: 'wants deployment' } }[s.aud];
      return {
        metrics, verdict, notes, hide, flow,
        labels: { rd: audL, ci: { label: s.pr === 'yes' ? 'CI + PR review' : 'CI only', sub: s.pr === 'yes' ? 'render · lint · review' : 'nobody reviews' } },
        err: s.ap === 'wiki' && s.mon >= 6 ? ['wiki'] : [],
        warn: (s.pr === 'no' ? ['ci'] : []).concat(fit < 0.45 ? ['rd'] : []),
        ok: accuracy > 0.8 ? ['site'] : [],
        badges: { rd: [Math.round(accuracy * 100) + '% true', accuracy > 0.8 ? 'ok' : accuracy > 0.5 ? 'warn' : 'err'] }
      };
    }
  },

  widget: {
    title: 'Zoom through C4 levels, then lint a bad diagram',
    caption: 'An online bookstore at <b>Level 1</b> (context), <b>Level 2</b> (containers) and <b>Level 3</b> (components inside the API). Tap a box marked <b>⊕</b> to zoom in. Then press <b>Bad diagram + lint</b>: the same view drawn the whiteboard way, checked by a linter that runs the C4 review rules (title, legend, types, technology, labelled arrows, protocols, one abstraction level).'
  },

  realWorld: {
    intro: 'From a 1995 IEEE paper to diagrams generated by a Spring test. Every item links to its source.',
    timeline: [
      { when: '1995', who: 'Philippe Kruchten', title: '"Architectural Blueprints: The 4+1 View Model of Software Architecture"', text: 'In <i>IEEE Software</i> 12(6), Kruchten described architecture with several <b>concurrent views</b>: logical, process, development and physical, tied together by a fifth set of <b>scenarios</b> (the "+1"). Each view serves different stakeholders, and the model is notation-agnostic.', src: 0 },
      { when: '2005', who: 'Gernot Starke, Peter Hruschka', title: 'arc42 template published', text: 'An open-source template with <b>12 sections</b>, from introduction and goals through context, building blocks, runtime and deployment views, crosscutting concepts and decisions, to quality requirements, risks and a glossary. Each kind of information gets a fixed place.', src: 1 },
      { when: '2011', who: 'Michael Nygard', title: '"Documenting Architecture Decisions"', text: 'Proposed short <b>Architecture Decision Records</b> kept in the repository: title, status, context, decision, consequences, and only for architecturally significant decisions. Fowler credits the post with coining the term.', src: 2 },
      { when: '2011 / 2022', who: 'ISO/IEC/IEEE 42010', title: 'Views, viewpoints and stakeholders, standardised', text: 'The standard separates the <b>architecture</b> of a system from its <b>architecture description</b>, and describes how stakeholders\' concerns are framed by viewpoints and addressed by views. The 2022 edition replaced the 2011 one and also covers architecture frameworks and description languages.', src: 3 },
      { when: '2018', who: 'Simon Brown', title: 'The C4 model, explained on InfoQ', text: 'Brown described <b>context, containers, components and code</b> as a hierarchy of maps, plus supplementary landscape, dynamic and deployment diagrams. The model is <b>notation independent</b> and tooling independent: what matters is a shared set of abstractions.', src: 4 },
      { when: 'Ongoing', who: 'c4model.com', title: 'Notation guidance and a review checklist', text: 'Every diagram should have a <b>key/legend</b>; every line should be labelled consistently with its direction and intent, ideally avoiding single words like "Uses"; relationships between containers should name the technology or protocol. The checklist asks for a title, a diagram type and scope, and a name for every element.', src: 5 },
      { when: '2020s', who: 'Thoughtworks Technology Radar', title: 'Diagrams as code', text: 'The Radar describes the growing set of tools for writing architecture diagrams <b>as code</b>, so that they live in version control, can be diffed and reviewed, and stay close to the system they describe.', src: 6 },
      { when: '2022 →', who: 'Spring Modulith', title: 'Documentation generated from the code', text: 'The <code>Documenter</code> takes an <code>ApplicationModules</code> model of the code and writes <b>C4 or UML component diagrams</b> (PlantUML) and an <b>Application Module Canvas</b> per module. Typically run in a test, so the diagrams are regenerated on every build.', src: 7 },
      { when: 'Current', who: 'Mermaid', title: 'C4 diagrams in Markdown, marked experimental', text: 'Mermaid supports C4 context, container, component, dynamic and deployment diagrams with a PlantUML-compatible syntax, but its docs say the C4 diagram is <b>experimental</b> and the syntax may change. Structurizr DSL remains the reference model-based tool.', src: 8 }
    ],
    lessons: [
      'The idea that one architecture needs <b>several views for several stakeholders</b> is 30 years old (4+1, then 42010). C4 and arc42 are practical, lightweight ways to apply it.',
      'Notation matters less than <b>consistency</b>: a legend, typed elements and labelled arrows fix most diagram confusion.',
      'Keep the <b>why</b> (ADRs) separate from the <b>what</b> (views), and link them.',
      'Docs that are reviewed in pull requests, or generated from code, are the only kind that stay true without heroics.'
    ],
    sources: [
      { title: 'Architectural Blueprints: The "4+1" View Model of Software Architecture (Kruchten, IEEE Software 12(6), 1995)', url: 'https://www.ics.uci.edu/~michele/Teaching/INF117-S08/Krutchten 4+1View SWArch.pdf', pub: 'IEEE Software, 1995 (course copy)' },
      { title: 'arc42 documentation: why it exists, how it is structured', url: 'https://arc42.org/documentation/', pub: 'arc42.org (Starke & Hruschka)' },
      { title: 'In 2011 Michael Nygard proposed to document important architecture decisions…', url: 'https://faq.arc42.org/questions/C-9-3/', pub: 'arc42 FAQ' },
      { title: 'ISO/IEC/IEEE 42010:2022 Software, systems and enterprise: Architecture description', url: 'https://committee.iso.org/standard/74393.html', pub: 'ISO, 2022' },
      { title: 'The C4 Model for Software Architecture', url: 'https://www.infoq.com/articles/C4-architecture-model/', pub: 'Simon Brown, InfoQ, 2018' },
      { title: 'C4 model: notation', url: 'https://c4model.com/diagrams/notation', pub: 'c4model.com (Simon Brown)' },
      { title: 'Diagrams as code', url: 'https://thoughtworks.com/en-au/radar/techniques/diagrams-as-code', pub: 'Thoughtworks Technology Radar' },
      { title: 'Spring Modulith: Documenting Application Modules', url: 'https://docs.spring.io/spring-modulith/reference/2.0/documentation.html', pub: 'Spring Modulith reference' },
      { title: 'C4 Diagrams (experimental)', url: 'https://mermaid.js.org/syntax/c4.html', pub: 'Mermaid docs' },
      { title: 'Architecture Decision Record', url: 'https://www.martinfowler.com/bliki/ArchitectureDecisionRecord.html', pub: 'Martin Fowler, bliki' },
      { title: 'Software architecture diagram review checklist', url: 'https://c4model.com/diagrams/checklist', pub: 'c4model.com' },
      { title: 'Docs as Code', url: 'https://www.writethedocs.org/guide/docs-as-code/', pub: 'Write the Docs' },
      { title: 'Structurizr DSL language reference', url: 'https://docs.structurizr.com/dsl/language', pub: 'Structurizr docs' }
    ]
  },

  tradeoffs: {
    headers: ['Approach', 'Strengths', 'Weaknesses', 'Pick when…'],
    rows: [
      ['<b>Wiki boxes-and-lines</b>', 'Zero setup, anyone can draw, good for a workshop', 'No shared notation, binary files, no review, rots fast', 'Spikes and whiteboard sessions; then throw it away or move it into a model'],
      ['<b>C4 + diagrams as code</b> (Structurizr, Mermaid, PlantUML)', 'One model, many views; text diffs; consistent legend; reviewed in PRs', 'Learning curve; auto-layout is sometimes ugly; still needs discipline to update', 'The default for most product teams and multi-team systems'],
      ['<b>Generated from code</b> (Spring Modulith, ArchUnit, IDE)', 'Always accurate for structure; enforces boundaries in CI', 'Only shows what the code knows: no users, no context, no rationale; can be noisy', 'Component and code level in a modular monolith or well-structured service'],
      ['<b>arc42 full</b>', 'A place for everything: quality goals, risks, deployment, glossary; good for audits and handovers', 'Heavy if filled in completely; long prose goes stale', 'Regulated domains, long-lived systems, handover to another organisation; keep each section lean'],
      ['<b>4+1 / 42010 viewpoints</b>', 'Rigorous stakeholder-to-view mapping; standard vocabulary', 'Abstract; teams need concrete notations and templates to apply it', 'Large programmes and enterprise architecture frameworks; use it to choose which views to produce']
    ]
  },
  failures: [
    { f: '<b>No legend</b>: colours and shapes mean something only to the author', detect: 'Ask two readers what a dashed line means; they disagree', fix: 'A key on every diagram; a shared style (Structurizr theme) so the key is the same everywhere' },
    { f: '<b>Mixed abstraction levels</b>: a class next to an external system', detect: 'Elements of different C4 levels on one view; the linter flags them', fix: 'One level per diagram; zoom in with a new view' },
    { f: '<b>Unlabelled or vague arrows</b> ("uses", double-headed arrows)', detect: 'Arrows with no text, or the same word on every arrow', fix: 'Label with intent and, between containers, protocol: "Publishes OrderPlaced [AMQP]"' },
    { f: '<b>Documentation rot</b>: picture and code diverge', detect: 'Diagram file not touched in months while the code changed a lot; people say "ignore the wiki"', fix: 'Docs in the repo, changed in the same PR; generate structural views; delete what nobody owns' },
    { f: '<b>Write-only documents</b>: 100 pages nobody reads', detect: 'Page view analytics; nobody can name the sections', fix: 'Start from the reader\'s questions; keep arc42 sections short; prefer diagrams plus ADR links' },
    { f: '<b>One diagram for every audience</b>', detect: 'Executives ask what "JDBC" means; engineers ask where the queue is', fix: 'Separate views per audience from one model: context for executives, containers for engineers, deployment for ops' },
    { f: '<b>Rationale lost</b>: what is documented but not why', detect: 'Same decision re-argued every quarter', fix: 'ADRs linked from the docs; supersede, do not edit' }
  ],

  interview: [
    { q: 'What is the C4 model, and what does each level show?', a: 'Simon Brown\'s hierarchy of diagrams, like maps at different zoom levels. <b>Level 1 System context</b>: the system as one box, its users and the external systems it depends on. <b>Level 2 Container</b>: the separately runnable or deployable parts (web app, API, database, queue) with technologies and protocols. <b>Level 3 Component</b>: the major building blocks inside one container. <b>Level 4 Code</b>: classes, rarely drawn by hand. Supplementary views: system landscape, dynamic (runtime flows) and deployment. C4 is a set of abstractions, <b>not a notation</b>: you still need a legend.', lvl: 'core', fu: 'Is a C4 "container" the same as a Docker container?' },
    { q: 'What does "container" mean in C4, and what is a common misreading?', a: 'A container is anything that <b>runs code or stores data</b> and needs to be running for the system to work: a SPA, a mobile app, a Spring Boot service, a database schema, a bucket, a queue. It is <b>not</b> the same as a Docker container: several C4 containers can run in one Docker container, or one C4 container can be deployed as many replicas. Deployment details belong in the <b>deployment view</b>.', lvl: 'core' },
    { q: 'You inherit a system with a single wiki diagram. What do you produce first, and for whom?', a: 'Ask who needs what. Usually: a <b>system context</b> diagram (one page, for everyone, including executives) and a <b>container</b> diagram (for engineers and ops), both from one Structurizr or Mermaid model in the repo. Then 2–3 <b>dynamic</b> views of the critical flows, a <b>deployment</b> view, and ADRs for the decisions people keep asking about. Component views only for the one or two complex containers, ideally generated. I would not start with a 12-section document.', lvl: 'core' },
    { q: 'Compare C4, arc42 and 4+1. Are they competitors?', a: 'Not really. <b>4+1</b> (Kruchten, 1995) and <b>ISO/IEC/IEEE 42010</b> are about the principle: several views for several stakeholders\' concerns. <b>arc42</b> (Starke and Hruschka) is a <b>document structure</b>: 12 sections telling you where each kind of information goes. <b>C4</b> is a <b>diagramming approach</b> for the structural views. A common combination is arc42 as the skeleton, C4 diagrams in sections 3 (context), 5 (building blocks) and 7 (deployment), and ADRs in section 9 (decisions).', lvl: 'deep' },
    { q: 'What are ISO/IEC/IEEE 42010 views and viewpoints?', a: 'The standard separates the <b>architecture</b> (the fundamental concepts of a system) from the <b>architecture description</b> (the work product). Stakeholders have <b>concerns</b>; a <b>viewpoint</b> is the convention for addressing some concerns (which models, notations, methods); a <b>view</b> applies a viewpoint to a specific system. So "deployment view of the bookstore" is a view; the rules for drawing any deployment view form the viewpoint. The current edition is <b>2022</b>, replacing 2011.', lvl: 'deep' },
    { q: 'What makes an architecture diagram bad? Give the review checklist you use.', a: '<ul><li><b>Title</b> with diagram type and scope</li><li><b>Key / legend</b> for shapes, colours, line styles</li><li>Every element <b>named and typed</b>, with technology for containers and components</li><li>Every arrow <b>labelled with intent</b> (not just "uses"), direction meaningful, protocol on inter-container arrows</li><li><b>One level of abstraction</b>: no classes next to external systems</li><li>Readable without the author present</li></ul>These are essentially c4model.com\'s notation guidance and review checklist.', lvl: 'core' },
    { q: 'What is diagrams as code, and what are its trade-offs?', a: 'Describing diagrams in text (Structurizr DSL, Mermaid, PlantUML) kept in Git and rendered by tools. Wins: <b>text diffs and PR review</b>, versioned with the code, consistent styling, and with Structurizr a single <b>model</b> rendered into many views, so a rename is one line. Costs: a learning curve, auto-layout that sometimes needs hints, and it still only stays current if changes go in the same PR. Note that Mermaid\'s C4 support is still marked <b>experimental</b>; Mermaid sequence and flowchart diagrams are the stable workhorses.', lvl: 'core' },
    { q: 'How do you keep architecture documentation from going stale?', a: 'Four levers. <b>Put it on the developer\'s path</b>: in the repo, changed in the same PR, reviewed with the code (a PR template checkbox helps). <b>Generate what can be generated</b>: module and component views from code (Spring Modulith Documenter, IDE), verified in CI. <b>Write less</b>: only views with a named audience; delete the rest. <b>Separate fast- from slow-changing content</b>: context and decisions change rarely and are written by hand; component structure changes often and is generated.', lvl: 'core', fu: 'What can a generator never produce?' },
    { q: 'What is living documentation? Give a concrete example in a Spring Boot codebase.', a: 'Documentation produced from, or checked against, the code on every build. Example: Spring Modulith builds an <code>ApplicationModules</code> model from the package structure; a test calls <code>verify()</code> (fails on illegal dependencies between modules or cycles) and then <code>new Documenter(modules)</code> writes <b>C4 component diagrams</b> as PlantUML and a <b>module canvas</b> per module. Published by CI, the diagrams are true by construction. Limits: they only show what the code knows, not users, external context or intent.', lvl: 'deep' },
    { q: 'How would you document architecture differently for an executive, a new joiner and an on-call engineer?', a: '<b>Executive</b>: one page, Level 1 context, quality goals and top risks in business words, no technology names. <b>New joiner</b>: container view, key dynamic views of the 2–3 main flows, glossary, ADR index, and how to run it locally. <b>On-call</b>: deployment view per environment, dependencies with timeouts and fallbacks, runbooks, dashboards and SLOs. Same model, different views: that is the point of 42010 viewpoints and C4 levels.', lvl: 'core' },
    { q: 'Tell me about a time you improved how a team documented its architecture.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: a payments group of 4 teams had a single wiki diagram from two years earlier; new joiners took about 6 weeks to make a non-trivial change, and two incidents traced back to an undocumented dependency. <b>Task</b>: make the architecture understandable and keep it current without a documentation project. <b>Action</b>: ran a 2-hour session per team to draw L1 and L2 in Structurizr DSL in the repo; added a PR template checkbox "structure changed? update workspace.dsl"; added a CI job that renders views and lints for labelled arrows; wrote 8 ADRs for the decisions people kept asking about; deleted the wiki picture. <b>Result</b>: new joiners shipped their first meaningful change in about 3 weeks, the next quarter\'s incident review found the dependency on the diagram, and the docs were updated in roughly a third of structural PRs without anyone being chased.', lvl: 'deep' },
    { q: 'An engineering director says "we are agile, we do not write documentation". How do you respond?', a: 'Agree with the intent: the Agile Manifesto values working software <b>over</b> comprehensive documentation, not instead of it. Propose the smallest set that pays for itself: a context and container diagram in the repo, ADRs for significant decisions, generated component views. Measure it by onboarding time and by how often people ask "what calls what?". Frame it as reducing <b>bus factor</b> and incident risk, not as process.', lvl: 'core', fu: 'Which single document would you keep if you could keep only one?' }
  ],

  code: [
    {
      title: 'Structurizr DSL: one model, three views (bookstore)',
      lang: 'js',
      code: `workspace "Bookstore" "C4 model for the online bookstore" {
  model {
    customer = person "Customer" "Browses and buys books."
    payments = softwareSystem "Payment provider" "Card payments." "External"

    bookstore = softwareSystem "Bookstore" {
      web = container "Web app" "Single-page app." "React"
      api = container "API application" "Catalogue, cart, checkout." "Spring Boot" {
        orders = component "Order controller" "REST endpoints for orders." "Spring MVC"
        checkout = component "Checkout service" "Validates, charges, saves." "Spring bean"
      }
      db = container "Orders DB" "Orders and stock." "PostgreSQL" "Database"
      bus = container "Event bus" "Domain events." "RabbitMQ"
    }

    customer -> web "Browses and buys books" "HTTPS"
    web -> orders "Places orders" "JSON/HTTPS"
    orders -> checkout "Places order"
    checkout -> db "Reads and writes" "JDBC"
    checkout -> bus "Publishes OrderPlaced" "AMQP"
    checkout -> payments "Charges card" "HTTPS"
  }

  views {
    systemContext bookstore "Context" { include * autolayout lr }
    container bookstore "Containers" { include * autolayout lr }
    component api "ApiComponents" { include * autolayout lr }

    styles {
      element "Person" { shape person }
      element "Database" { shape cylinder }
      element "External" { background #999999 }
    }
    theme default
  }
}`,
      note: 'Each element is defined once; the three views select from it. Relationships between components imply relationships between their containers and systems, so the container view shows <code>web → api</code> without repeating it. Render with Structurizr Lite or the CLI in CI.'
    },
    {
      title: 'Mermaid: dynamic view of checkout as a sequence diagram',
      lang: 'js',
      code: `sequenceDiagram
    title Dynamic view: place an order (Bookstore)
    actor C as Customer
    participant W as Web app [React]
    participant A as API application [Spring Boot]
    participant P as Payment provider [External]
    participant D as Orders DB [PostgreSQL]
    participant B as Event bus [RabbitMQ]

    C->>W: Clicks "Place order"
    W->>A: POST /orders [JSON/HTTPS]
    A->>P: Authorise card [HTTPS]
    P-->>A: Authorised
    A->>D: INSERT order + outbox row [JDBC, one tx]
    A-->>W: 201 Created (orderId)
    A--)B: Publish OrderPlaced [AMQP, from outbox]
    W-->>C: Shows confirmation`,
      note: 'Sequence diagrams are stable in Mermaid and render natively in GitHub and GitLab Markdown, which makes them a cheap way to add C4 <b>dynamic</b> views. Mermaid also has a <code>C4Context</code> / <code>C4Container</code> syntax, but its docs mark it <b>experimental</b>.'
    },
    {
      title: 'Spring Modulith: verify module boundaries, then generate the docs',
      lang: 'java',
      code: `package com.example.bookstore;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

class DocumentationTests {

  // Modules = direct sub-packages of com.example.bookstore (orders, inventory, payments...)
  ApplicationModules modules = ApplicationModules.of(BookstoreApplication.class);

  @Test
  void verifiesModularStructure() {
    // Fails on cycles between modules or access to another module's internal types.
    modules.verify();
  }

  @Test
  void writesDocumentationSnippets() {
    new Documenter(modules)
        .writeModulesAsPlantUml()            // overview component diagram (C4 style by default)
        .writeIndividualModulesAsPlantUml()  // one diagram per module with its neighbours
        .writeModuleCanvases();              // per-module table: beans, events, aggregates
    // Output goes to target/spring-modulith-docs (Maven); publish it from CI.
  }
}`,
      note: 'Needs the <code>spring-modulith-starter-test</code> and <code>spring-modulith-docs</code> dependencies (Spring Boot 3). The Documenter API has changed across versions (newer releases add <code>writeDocumentation()</code> and an <code>Options</code> constructor), so check the reference for the version you use.'
    }
  ],

  related: ['rfcs-adrs', 'quality-attributes', 'architectural-styles', 'stakeholder-communication', 'architecture-governance', 'conways-law']
});
