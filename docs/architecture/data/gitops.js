(function () {
  const hrs = (h) => (h < 1 ? Math.round(h * 60) + ' min' : h < 48 ? h.toFixed(1) + ' h' : (h / 24).toFixed(1) + ' days');

  SD.register({
    slug: 'gitops',
    domain: 6,
    title: 'GitOps',
    examples: 'Argo CD, Flux',
    tagline: 'Git holds the <b>desired state</b> of every environment. An agent inside the cluster <b>pulls</b> it and keeps <b>reconciling</b> live state to match, so a deploy is a merged pull request, a rollback is a <code>git revert</code>, and a manual <code>kubectl edit</code> is undone on the next sync.',
    tldr: {
      problem: 'CI pipelines that run <code>kubectl apply</code> or <code>helm upgrade</code> need <b>admin credentials for every cluster</b>, leave no clear record of what is running, and cannot see when someone changes the cluster by hand. Over months, prod drifts away from anything written down.',
      idea: 'Store the full desired state (manifests, Kustomize overlays, Helm values) in Git. Run a <b>controller in each cluster</b> (Argo CD or Flux) that pulls that state, diffs it against the live objects and applies the difference, <b>continuously</b>. Every change, including promotion between environments, is a pull request.',
      insight: 'GitOps is a <b>control loop</b>, not a pipeline. The interesting design questions are what the loop is allowed to fix (self-heal, prune), how fast it runs, how secrets avoid Git, and how environments are laid out so promotion is a small, reviewable diff.',
      numbers: [
        { v: '2017', l: 'Weaveworks names "GitOps": operations by pull request' },
        { v: '4', l: 'OpenGitOps v1.0.0 principles (CNCF App Delivery TAG, 2021)' },
        { v: '3 min', l: 'Argo CD default reconciliation timeout (timeout.reconciliation, argocd-cm)' }
      ]
    },

    intro: {
      what: '<b>GitOps</b> is a way to run software where a Git repository describes exactly what should be running, and a program inside the cluster keeps making reality match it. You never log in to change production. You change a file, open a pull request, and once it is merged an <b>agent</b> notices and applies it. If anyone changes the cluster by hand, the agent notices that too.',
      analogy: {
        icon: '🌡️',
        title: 'A thermostat that reads its setting from a shared notebook',
        text: 'You do not heat the room yourself; you write "21 °C" in a notebook everyone can see, and the thermostat keeps checking the room and the notebook. Open a window (a manual change) and it heats back to 21. Want 23? Write it in the notebook, with your name and a reason, and the thermostat follows. The analogy breaks in one place: a thermostat only nudges one number, while a GitOps agent replaces whole objects, so a bad line in the notebook is applied just as faithfully as a good one.'
      },
      problem: 'A team deploys with a CI job that holds a cluster-admin token. During an incident an engineer runs <code>kubectl scale</code> and <code>kubectl set env</code> on prod and forgets to tell anyone. Next month staging and prod behave differently, nobody knows why, and the CI token leaks in a compromised build plugin. The question this page answers: <b>how do you make what runs in every cluster equal to something reviewed, versioned and auditable, and keep it that way?</b>',
      story: [
        {
          stage: 'naive',
          title: 'CI pushes to the cluster',
          text: 'The build pipeline ends with <code>kubectl apply</code>. It is simple and fast: merge, build, deploy. To do that, <b>CI holds credentials for every cluster</b>, and the deploy happens once, at the end of the pipeline.',
          scene: {
            nodes: [
              { id: 'git', label: 'App repo', sub: 'code + YAML', kind: 'store', at: [70, 0] },
              { id: 'ci', label: 'CI pipeline', sub: 'cluster-admin key', kind: 'compute', at: [210, 110] },
              { id: 'k8s', label: 'Prod cluster', sub: 'live state', kind: 'service', at: [350, 220] }
            ],
            edges: [{ from: 'git', to: 'ci' }, { from: 'ci', to: 'k8s', label: 'kubectl apply' }],
            flow: ['git>ci', 'ci>k8s'],
            badges: { ci: ['push', 'info'] }
          }
        },
        {
          stage: 'breaks',
          title: 'Hand edits drift, keys leak',
          text: 'An on-call fix with <code>kubectl edit</code> is never written back. Nobody re-runs the pipeline, so the cluster <b>silently differs from Git</b>. And the CI system, with dozens of plugins, now holds the keys to production.',
          scene: {
            nodes: [
              { id: 'git', label: 'App repo', sub: 'replicas: 3', kind: 'store', at: [70, 0] },
              { id: 'ci', label: 'CI pipeline', sub: 'key leaked?', kind: 'compute', at: [210, 110] },
              { id: 'ops', label: 'On-call', sub: 'kubectl edit', kind: 'person', at: [70, 220] },
              { id: 'k8s', label: 'Prod cluster', sub: 'replicas: 8', kind: 'service', at: [350, 220] }
            ],
            edges: [{ from: 'git', to: 'ci' }, { from: 'ci', to: 'k8s' }, { from: 'ops', to: 'k8s' }],
            flow: ['ops>k8s'],
            err: ['ci'], warn: ['k8s'],
            badges: { k8s: ['drift', 'warn'], ci: ['creds in CI', 'err'] }
          }
        },
        {
          stage: 'fix',
          title: 'An agent pulls and reconciles',
          text: 'A controller <b>inside</b> the cluster pulls the config repo and compares it with live objects every few minutes. Merges are applied; hand edits are <b>reverted</b> (self-heal). CI only builds images and opens pull requests; it never touches the cluster.',
          scene: {
            nodes: [
              { id: 'git', label: 'Config repo', sub: 'desired state', kind: 'store', at: [70, 0] },
              { id: 'ci', label: 'CI pipeline', sub: 'build + PR only', kind: 'compute', at: [350, 0] },
              { id: 'agent', label: 'Argo CD / Flux', sub: 'in-cluster agent', kind: 'service', at: [210, 110] },
              { id: 'k8s', label: 'Prod cluster', sub: 'replicas: 3', kind: 'service', at: [210, 220] }
            ],
            edges: [{ from: 'ci', to: 'git', label: 'PR' }, { from: 'agent', to: 'git', label: 'pull' }, { from: 'agent', to: 'k8s' }],
            flow: ['ci>git', 'agent>git', 'agent>k8s'],
            ok: ['agent', 'k8s'],
            badges: { k8s: ['in sync', 'ok'] }
          }
        }
      ],
      usedBy: ['Intuit (created Argo CD)', 'Weaveworks (created Flux)', 'Red Hat OpenShift GitOps (Argo CD)', 'Microsoft Azure Arc / AKS GitOps (Flux)', 'AWS EKS blueprints (Argo CD, Flux)', 'GitLab agent for Kubernetes (Flux)'],
      whenToUse: [
        'You run <b>Kubernetes</b> (or another API with a declarative, diffable state) across several environments or clusters',
        'You need an <b>audit trail</b> and four-eyes review of every production change (finance, health, regulated SaaS)',
        'You want CI to stop holding <b>cluster credentials</b>, and drift from hand edits to be found and fixed automatically'
      ],
      whenNot: [
        'A single VM or PaaS app where <code>git push</code> already deploys: a reconciler adds little',
        'Cloud infrastructure with no in-cluster agent: use <a href="infrastructure-as-code.html">Infrastructure as Code</a> with plan/apply (GitOps-style workflow, push model)',
        'You need fine-grained progressive delivery by itself: GitOps decides <i>what</i>; <a href="deployment-strategies.html">deployment strategies</a> decide <i>how fast</i>'
      ],
      glossary: [
        { term: 'Desired state', def: 'The full, declarative description of what should run, stored as files in Git.' },
        { term: 'Live state', def: 'What the cluster API actually holds right now.' },
        { term: 'Reconciliation loop', def: 'An agent that repeatedly compares desired with live state and applies the difference.' },
        { term: 'Drift', def: 'Any difference between live and desired state, usually from a manual change.' },
        { term: 'Self-heal', def: 'Automatically reverting drift, not only applying new commits.' },
        { term: 'Prune', def: 'Deleting live objects whose manifests were removed from Git.' },
        { term: 'Overlay', def: 'A Kustomize layer that patches a shared base for one environment (replicas, image tag, limits).' },
        { term: 'Promotion', def: 'Moving a tested version to the next environment by a pull request that changes its overlay.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Declarative</b>: the desired state is expressed as data (manifests), not a script of steps',
        '<b>Versioned and immutable</b>: stored so history is kept and every version can be retrieved (Git, OCI artefacts)',
        '<b>Pulled automatically</b>: agents fetch the desired state; nobody pushes into the cluster',
        '<b>Continuously reconciled</b>: agents observe live state and correct differences, not just at deploy time',
        '<b>Every change is a PR</b>: review, CI checks and policy gates on config, including promotion',
        '<b>Secrets never in plaintext</b>: encrypted in Git or referenced from a secrets manager'
      ],
      nonFunctional: [
        'Drift lifetime ≤ one sync interval (minutes) with self-heal on',
        'Rollback = <code>git revert</code> merged and applied in &lt; 10 min (<em>target</em>)',
        'Zero long-lived cluster credentials in CI',
        '100% of prod changes traceable to a commit, author and approver',
        'Reconciler handles hundreds of apps per cluster without API throttling (sharding, caching)',
        'Promotion dev → prod in hours, gated by checks, not tickets'
      ],
      outOfScope: [
        '<b>Branch per environment</b> (dev, staging, prod branches) that drift apart through cherry-picks',
        '<b>"Just this once" kubectl edits</b> in prod with self-heal off, never written back',
        '<b>One giant YAML monorepo</b> with no CODEOWNERS: every team can change every cluster',
        '<b>Plaintext or base64 Secrets</b> committed "temporarily"',
        '<b>Floating tags</b> (<code>:latest</code>) in Git: the commit no longer pins what runs'
      ]
    },

    calculator: {
      inputs: [
        { id: 'clusters', label: 'Clusters', min: 1, max: 200, value: 6, log: true },
        { id: 'apps', label: 'Apps per cluster', min: 1, max: 500, value: 40, log: true },
        { id: 'iv', label: 'Sync / reconcile interval', min: 1, max: 30, value: 3, unit: 'min' },
        { id: 'edits', label: 'Manual kubectl edits per week (all clusters)', min: 0, max: 200, value: 10 },
        { id: 'deploys', label: 'Deploys per app per week', min: 0.2, max: 20, value: 2, step: 0.2 },
        { id: 'review', label: 'PR review + checks per promotion', min: 0.25, max: 48, value: 4, unit: 'h', log: true }
      ],
      outputs: [
        { label: 'Mean drift lifetime with self-heal (interval-based)', fmt: 'raw', f: (v) => '≈ ' + hrs(v.iv / 2 / 60) + ' (Argo CD watch-based: seconds)' },
        { label: 'Mean drift lifetime without self-heal', fmt: 'raw', f: (v) => '≈ ' + hrs(7 * 24 / v.deploys) + ' (until the next sync of that app)' },
        { label: 'Drifted objects at any moment (with · without self-heal)', fmt: 'raw', f: (v) => { const r = v.edits / (7 * 24 * 60); return (r * v.iv / 2).toFixed(2) + ' · ' + Math.round(r * 7 * 24 * 60 / v.deploys); } },
        { label: 'Reconciles per minute (apps × clusters ÷ interval)', fmt: 'raw', f: (v) => Math.round(v.clusters * v.apps / v.iv).toLocaleString() },
        { label: 'API calls per minute, estimate (×10 per reconcile)', fmt: 'raw', f: (v) => Math.round(v.clusters * v.apps / v.iv * 10).toLocaleString() },
        { label: 'Promotion lead time per env · dev → prod (3 envs)', fmt: 'raw', f: (v) => { const one = v.review + v.iv / 2 / 60 + 0.25; return hrs(one) + ' · ' + hrs(3 * one); } }
      ],
      note: 'Drifted objects use <b>Little\'s law</b>: count = arrival rate × lifetime. Without self-heal a hand edit survives until the next sync of that app, modelled as the mean gap between deploys (and only if the sync touches that field). "×10 API calls" assumes a server-side dry-run apply over ~10 objects per app: an <em>estimate</em>; Argo CD caches live state with watches, so its read load is far lower, while Git polling is per repo, not per app. Promotion adds a 15-minute rollout and bake: an <em>estimate</em>. Notice that review time, not the reconcile interval, dominates lead time.'
    },

    api: [
      { m: 'YAML', p: 'Application / Kustomization (Argo CD / Flux)', d: 'Source repo, revision and path; destination cluster and namespace; <code>syncPolicy.automated</code> with <code>selfHeal</code> and <code>prune</code>; sync options and retry.' },
      { m: 'YAML', p: 'overlays/&lt;env&gt;/kustomization.yaml', d: 'Per-environment patch of a shared base: image tag (by digest in prod), replicas, resources, config. <b>Promotion edits this file.</b>' },
      { m: 'YAML', p: 'ApplicationSet (multi-cluster)', d: 'A template plus generators (cluster, Git directory, list, matrix) that stamp out one Application per cluster or per directory.' },
      { m: 'POLICY', p: 'CODEOWNERS + branch protection', d: 'Who may approve which path (<code>apps/payments/overlays/prod</code> → payments leads + SRE); required checks: schema validation, Kyverno/OPA policy, diff preview.' },
      { m: 'YAML', p: 'ExternalSecret / SealedSecret', d: 'A reference to a secret in a manager (ESO) or an encrypted blob only the cluster can decrypt (Sealed Secrets, SOPS). Never the plaintext value.' },
      { m: 'ADR', p: 'ADR: repo layout and promotion model', d: 'App vs config repo, directories + overlays instead of env branches, who merges to prod, image updater on or off per env, break-glass procedure.' }
    ],
    dataModel: [
      { name: 'git_commit (config repo)', store: 'Git', fields: [['sha', 'text', 'pk'], ['author', 'text'], ['approved_by', 'text[]'], ['paths_changed', 'text[]', 'idx'], ['message', 'text']], note: 'The audit log is the repo itself. Signed commits plus branch protection make it tamper-evident.' },
      { name: 'application_status', store: 'Kubernetes CRD status', fields: [['app', 'text', 'pk'], ['cluster', 'text', 'pk'], ['sync', 'Synced|OutOfSync'], ['health', 'Healthy|Progressing|Degraded|Missing'], ['revision', 'sha'], ['reconciled_at', 'timestamp']], note: 'Argo CD and Flux expose this on the Application / Kustomization object; alert on OutOfSync or Degraded lasting longer than N minutes.' },
      { name: 'drift_event', store: 'Metrics / event log', fields: [['id', 'uuid', 'pk'], ['app', 'text', 'idx'], ['resource', 'text'], ['field', 'text'], ['detected_at', 'timestamp'], ['healed_at', 'timestamp?']], note: 'Count and age of drift per team: a fitness metric for how often people bypass Git.' }
    ],

    architecture: {
      title: 'GitOps: pull-based delivery with reconciliation',
      nodes: [
        { id: 'dev', label: 'Developer', sub: 'commit + PR', kind: 'person', wide: [90, 0], tall: [70, 0], tip: 'Changes code in the app repo and config in the config repo, always through pull requests.' },
        { id: 'app', label: 'App repo', sub: 'source code', kind: 'store', wide: [290, 0], tall: [210, 0], tip: 'Application source. Its CI builds and tests images; it does not hold environment config.' },
        { id: 'ci', label: 'CI pipeline', sub: 'build · test · sign', kind: 'compute', wide: [490, 0], tall: [350, 0], tip: 'Builds, scans and signs the image, pushes it to the registry. It has no cluster credentials.' },
        { id: 'reg', label: 'Image registry', sub: 'immutable tags', kind: 'store', wide: [690, 0], tall: [350, 105], tip: 'Holds versioned, ideally signed images. Prod references images by digest.' },
        { id: 'cfg', label: 'Config repo', sub: 'base + overlays', kind: 'store', wide: [290, 110], tall: [70, 105], tip: 'Desired state for every environment: Kustomize base plus overlays per env (or Helm values per env). Protected by CODEOWNERS.' },
        { id: 'upd', label: 'Image updater', sub: 'tag → commit', kind: 'compute', wide: [690, 110], tall: [210, 105], tip: 'Flux image automation or Argo CD Image Updater: watches the registry and commits the new tag to Git (it does not deploy directly).' },
        { id: 'argo', label: 'Argo CD / Flux', sub: 'reconcile loop', kind: 'service', wide: [490, 220], tall: [210, 210], tip: 'The GitOps controller. Pulls Git, renders manifests, diffs with live objects, applies, reports Synced/OutOfSync and health.' },
        { id: 'ops', label: 'On-call', sub: 'kubectl edit', kind: 'person', wide: [90, 220], tall: [70, 210], tip: 'A human with cluster access. Any hand edit becomes drift that the controller detects (and with self-heal, reverts).' },
        { id: 'sm', label: 'Secrets manager', sub: 'Vault · AWS SM', kind: 'external', wide: [890, 220], tall: [350, 210], tip: 'The real secret values live here, never in Git.' },
        { id: 'cdev', label: 'Dev cluster', sub: 'auto-sync', kind: 'service', wide: [90, 330], tall: [70, 315], tip: 'Lower environment: new tags land automatically.' },
        { id: 'cprod', label: 'Prod cluster', sub: 'live state', kind: 'service', wide: [690, 330], tall: [210, 315], tip: 'Production. Changes only through merged PRs to its overlay.' },
        { id: 'eso', label: 'External Secrets', sub: 'operator', kind: 'service', wide: [890, 330], tall: [350, 315], tip: 'External Secrets Operator reads an ExternalSecret from Git and creates a Kubernetes Secret from the manager\'s value.' }
      ],
      edges: [
        { from: 'dev', to: 'app' },
        { from: 'app', to: 'ci' },
        { from: 'ci', to: 'reg' },
        { from: 'reg', to: 'upd', dashed: true },
        { from: 'upd', to: 'cfg', label: 'commit' },
        { from: 'dev', to: 'cfg', label: 'PR' },
        { from: 'argo', to: 'cfg', label: 'pull', dashed: true },
        { from: 'argo', to: 'cdev' },
        { from: 'argo', to: 'cprod' },
        { from: 'ops', to: 'cprod', dashed: true },
        { from: 'sm', to: 'eso' },
        { from: 'eso', to: 'cprod' }
      ]
    },

    scenarios: [
      {
        id: 'deploy', title: 'A change reaches dev', tone: 'info',
        steps: [
          { text: 'A developer merges a fix to the <b>app repo</b>. CI builds, tests, scans and signs image <code>api:1.8.0</code>, and pushes it to the registry. CI stops there.', flow: ['dev>app', 'app>ci', 'ci>reg'], badges: { reg: 'api:1.8.0' } },
          { text: 'The <b>image updater</b> sees a new tag matching the dev policy (semver <code>1.x</code>) and <b>commits</b> it to <code>overlays/dev</code>. Git is still the only input to the cluster.', flow: ['reg>upd', 'upd>cfg'], badges: { cfg: 'dev: 1.8.0' } },
          { text: 'Within one interval the controller pulls the repo, renders Kustomize, and diffs: the Deployment image differs. Status: <b>OutOfSync</b>.', flow: ['argo>cfg'], warn: ['cdev'], badges: { argo: ['OutOfSync', 'warn'] } },
          { text: 'Auto-sync applies it. The rollout completes and health checks pass: <b>Synced · Healthy</b>, with the commit SHA recorded on the Application.', flow: ['argo>cdev'], ok: ['cdev'], badges: { cdev: ['Synced', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'promote', title: 'Promote to prod by PR', tone: 'ok',
        steps: [
          { text: 'Dev and staging have soaked. A PR changes one line in <code>overlays/prod/kustomization.yaml</code>: <code>newTag: 1.8.0</code> (or the digest). The diff <b>is</b> the change request.', flow: ['dev>cfg'], badges: { cfg: 'PR #412' } },
          { text: 'Checks run on the PR: schema validation, policy (no <code>:latest</code>, limits set), and a rendered diff preview. CODEOWNERS requires payments lead + SRE approval.', nodes: ['cfg'], badges: { cfg: ['2 approvals ✓', 'ok'] } },
          { text: 'Merged. The prod controller pulls, sees the new tag and syncs. Sync waves apply the DB migration Job (wave -1, PreSync hook) before the Deployment (wave 0).', flow: ['argo>cfg', 'argo>cprod'], badges: { argo: 'wave -1 → 0' } },
          { text: 'Done. Audit question "who changed prod on Tuesday and why?" is answered by <code>git log overlays/prod</code>: author, approvers, linked ticket.', nodes: ['cprod'], ok: ['cprod'], badges: { cprod: ['1.8.0 · Synced', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'drift', title: 'Hand edit → self-heal', tone: 'err',
        steps: [
          { text: 'During an incident, on-call runs <code>kubectl scale deploy/api --replicas=8</code> and <code>kubectl set env LOG_LEVEL=debug</code> on prod.', flow: ['ops>cprod'], err: ['cprod'], badges: { cprod: ['drift', 'err'] }, tone: 'err' },
          { text: 'The controller\'s next comparison finds live ≠ desired: <b>OutOfSync</b> on two fields. An alert names the resource, field and time.', flow: ['argo>cprod'], warn: ['argo'], badges: { argo: ['OutOfSync', 'warn'] }, tone: 'warn' },
          { text: 'With <b>selfHeal: true</b> it re-applies Git within seconds: replicas back to 3, debug logging gone. The incident fix just vanished, which is correct but surprising.', flow: ['argo>cprod'], ok: ['cprod'], badges: { cprod: ['healed', 'ok'] } },
          { text: 'The right move: <b>commit the fix</b> (or pause auto-sync for that app with a documented break-glass step). Note: an HPA owning replicas should be excluded with <code>ignoreDifferences</code>, or self-heal fights the autoscaler.', flow: ['dev>cfg', 'argo>cprod'], ok: ['cfg'], tone: 'ok' }
        ]
      },
      {
        id: 'rollback', title: 'Bad release → git revert', tone: 'warn',
        steps: [
          { text: 'Prod is on <code>1.8.0</code> and error rate climbs to 3%. The release must go.', nodes: ['cprod'], err: ['cprod'], badges: { cprod: ['5xx 3%', 'err'] }, tone: 'err' },
          { text: '<code>git revert</code> of the promotion commit, fast-tracked through the PR. Git now says <code>1.7.4</code>, and the history shows both the bad change and the undo.', flow: ['dev>cfg'], badges: { cfg: 'revert a1f3' } },
          { text: 'The controller pulls and syncs the old tag. No CI run, no rebuild: the image is still in the registry.', flow: ['argo>cfg', 'argo>cprod'], ok: ['cprod'], badges: { cprod: ['1.7.4', 'ok'] }, tone: 'ok' },
          { text: 'Caveat: rolling back code does not roll back <b>data</b>. A schema migration applied in wave -1 must be backwards compatible (expand/contract), or the revert breaks too.', nodes: ['cprod'], badges: { cprod: ['schema?', 'warn'] }, tone: 'warn' }
        ]
      },
      {
        id: 'fleet', title: 'At scale: 60 clusters', tone: 'warn',
        steps: [
          { text: 'The platform team runs 60 clusters. An <b>ApplicationSet</b> with a cluster generator stamps out one Application per cluster labelled <code>env=prod</code>; adding a cluster is adding a label.', flow: ['argo>cdev', 'argo>cprod'], badges: { argo: '60 × 40 apps' } },
          { text: '2,400 Applications reconciling every 3 minutes: the controller and repo server get hot, and Git hosting starts rate-limiting polls.', nodes: ['argo', 'cfg'], warn: ['argo', 'cfg'], badges: { argo: ['CPU · queue', 'warn'] }, tone: 'warn' },
          { text: 'Fixes: shard the application controller, use Git <b>webhooks</b> instead of tight polling, cache rendered manifests, and split the monorepo so one commit does not invalidate everything.', nodes: ['argo'], ok: ['argo'], badges: { argo: ['sharded', 'ok'] } },
          { text: 'Roll fleet-wide changes in waves (canary clusters first) with progressive sync or one PR per ring. A bad base change merged once otherwise hits all 60 clusters within one interval.', flow: ['argo>cdev'], badges: { cdev: 'ring 0' }, tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Each control is a real choice teams make when adopting GitOps. Numbers are <em>illustrative</em> for ~10 teams, 3 environments and a few clusters.',
      controls: [
        { id: 'model', label: 'Deploy model', type: 'seg', value: 'heal', options: [
          { v: 'push', l: 'CI push (kubectl/helm)' }, { v: 'manual', l: 'GitOps pull, manual sync' }, { v: 'heal', l: 'GitOps auto-sync + self-heal' }] },
        { id: 'layout', label: 'Repo layout', type: 'seg', value: 'dirs', options: [
          { v: 'branches', l: 'Branch per env' }, { v: 'dirs', l: 'Dirs + Kustomize overlays' }, { v: 'helm', l: 'Helm chart + values per env' }, { v: 'mono', l: 'One YAML monorepo, no owners' }] },
        { id: 'secrets', label: 'Secrets', type: 'seg', value: 'eso', options: [
          { v: 'plain', l: 'Base64 Secret in Git' }, { v: 'sealed', l: 'Sealed Secrets' }, { v: 'sops', l: 'SOPS (KMS / age)' }, { v: 'eso', l: 'External Secrets Operator' }] },
        { id: 'promo', label: 'Promotion', type: 'seg', value: 'pr', options: [
          { v: 'pr', l: 'Manual PR per env' }, { v: 'auto', l: 'Image updater (dev) + PR (prod)' }, { v: 'autoall', l: 'Image updater everywhere' }] }
      ],
      evaluate(s) {
        const c = (x) => Math.max(0.03, Math.min(0.97, x));
        const M = s.model, L = s.layout, S = s.secrets, P = s.promo;
        const push = M === 'push';
        let audit = { push: 0.45, manual: 0.75, heal: 0.9 }[M] + { branches: -0.1, dirs: 0.05, helm: 0.03, mono: -0.2 }[L] + (P === 'autoall' ? -0.1 : 0);
        let sec = { push: 0.3, manual: 0.75, heal: 0.8 }[M] + { plain: -0.55, sealed: 0.05, sops: 0.05, eso: 0.12 }[S] + (L === 'mono' ? -0.15 : 0);
        let speed = { push: 0.8, manual: 0.45, heal: 0.75 }[M] + { pr: -0.1, auto: 0.1, autoall: 0.2 }[P] + (L === 'branches' ? -0.1 : 0);
        let drift = { push: 0.15, manual: 0.45, heal: 0.92 }[M] + (L === 'branches' ? -0.25 : 0);
        let cx = { push: 0.75, manual: 0.6, heal: 0.55 }[M] + { branches: 0.05, dirs: 0, helm: -0.08, mono: -0.15 }[L] + { plain: 0.05, sealed: -0.05, sops: -0.08, eso: -0.12 }[S] + (P === 'pr' ? 0 : -0.06);
        const lead = { push: '≈ 1 h', manual: '≈ 1–2 days (waits for a human sync)', heal: '≈ hours (review-bound)' }[M];
        const metrics = [
          { k: 'Auditability', v: audit >= 0.8 ? 'every change = reviewed commit' : audit >= 0.55 ? 'commit trail, gaps' : 'pipeline logs only', s: c(audit) },
          { k: 'Security', v: push ? 'cluster creds live in CI' : S === 'plain' ? 'secrets readable in Git' : 'no creds in CI, no secrets in Git', s: c(sec) },
          { k: 'Speed to prod', v: lead, s: c(speed) },
          { k: 'Drift exposure', v: M === 'heal' ? (L === 'branches' ? 'clusters fixed, branches drift' : 'healed in one interval') : M === 'manual' ? 'detected, not fixed' : 'invisible until next deploy', s: c(drift) },
          { k: 'Complexity', v: cx >= 0.6 ? 'low' : cx >= 0.4 ? 'moderate: controllers + CRDs' : 'high: many moving parts', s: c(cx) }
        ];
        const notes = [];
        if (push) notes.push('Push deploys need <b>cluster credentials in CI</b>, and nothing watches the cluster between deploys. A compromised build plugin can change prod.');
        if (M === 'manual') notes.push('Pull with manual sync keeps creds out of CI and shows drift as <b>OutOfSync</b>, but someone must click Sync. Common for prod at first; it tends to make prod lag.');
        if (M === 'heal') notes.push('<b>selfHeal</b> reverts hand edits; <b>prune</b> deletes objects removed from Git. Exclude controller-owned fields (HPA replicas) with <code>ignoreDifferences</code>.');
        if (L === 'branches') notes.push('Env branches drift through cherry-picks and merge conflicts; promotion becomes a merge nobody can read. Prefer <b>directories + overlays on one branch</b>.');
        if (L === 'mono') notes.push('Without CODEOWNERS any team can change any cluster, and one commit re-renders everything. Split by team or add path ownership.');
        if (L === 'helm') notes.push('Helm values per env work well for third-party charts; review the <b>rendered</b> diff in CI, since a values change can alter many objects.');
        if (S === 'plain') notes.push('Base64 is encoding, not encryption. Anyone with repo read access (and its full history) has the secret. Rotate it now.');
        if (S === 'sealed') notes.push('Sealed Secrets: encrypted with the cluster\'s public key; only that controller can decrypt. Back up the sealing key, or a cluster rebuild loses every secret.');
        if (S === 'sops') notes.push('SOPS encrypts values with KMS/age; Flux decrypts natively, Argo CD needs a plugin. Rotation means re-encrypting files.');
        if (S === 'eso') notes.push('ESO keeps only a <b>reference</b> in Git; values and rotation stay in the secrets manager. Adds a dependency on that manager being reachable.');
        if (P === 'autoall') notes.push('Auto-updating prod removes the human review that makes GitOps auditable, unless prod is gated by a policy (signed images, passing staging analysis).');
        let verdict;
        if (S === 'plain') verdict = '❌ <b>Secrets in Git in plaintext.</b> Everything else is moot; fix this first.';
        else if (push && P !== 'pr') verdict = '⚠ <b>Fast, but not GitOps:</b> CI holds the keys and nothing detects drift. Move the deploy into an in-cluster agent.';
        else if (push) verdict = '⚠ <b>CI-push with PR review</b> is auditable at deploy time only; hand edits and leaked CI creds stay invisible.';
        else if (L === 'branches' || L === 'mono') verdict = '👍 <b>Right model, risky layout.</b> Move to directories + overlays with path ownership.';
        else if (M === 'heal' && P === 'auto') verdict = '✅ <b>The common target:</b> pull, self-heal and prune, overlays on one branch, secrets by reference, auto to dev and PR to prod. Say this in the interview.';
        else if (M === 'manual') verdict = '👍 <b>Safe start.</b> Turn on auto-sync + self-heal for lower envs first, then prod once alerts and break-glass exist.';
        else verdict = '👍 <b>Solid GitOps.</b> Check the weakest meter.';
        const flow = push ? ['dev>app', 'app>ci', 'ci>reg', 'ci>cprod'] : ['dev>app', 'app>ci', 'ci>reg'].concat(P === 'pr' ? ['dev>cfg'] : ['reg>upd', 'upd>cfg']).concat(['argo>cfg', 'argo>cdev', 'argo>cprod']);
        if (S === 'eso') flow.push('sm>eso', 'eso>cprod');
        const hide = [];
        if (P === 'pr' || push) hide.push('upd');
        if (S !== 'eso') hide.push('eso', 'sm');
        if (push) hide.push('argo');
        const badges = {};
        badges.ci = push ? ['holds kubeconfig', 'err'] : ['no cluster creds', 'ok'];
        badges.cprod = M === 'heal' ? ['self-heal', 'ok'] : ['drift persists', 'warn'];
        if (S === 'plain') badges.cfg = ['secret in Git', 'err'];
        else badges.cfg = [{ branches: 'dev/stg/prod branches', dirs: 'overlays/env', helm: 'values-env.yaml', mono: 'no owners' }[L], L === 'branches' || L === 'mono' ? 'warn' : 'info'];
        return {
          metrics, verdict, notes: notes.slice(0, 4), flow, hide, badges,
          labels: { ci: push ? { label: 'CI pipeline', sub: 'build + kubectl apply' } : { label: 'CI pipeline', sub: 'build · test · sign' }, argo: { label: 'Argo CD / Flux', sub: M === 'manual' ? 'manual sync' : 'auto-sync · selfHeal' } },
          err: S === 'plain' ? ['cfg'] : push ? ['ci'] : [],
          warn: M !== 'heal' ? ['cprod'] : [],
          ok: M === 'heal' && S !== 'plain' ? ['argo'] : []
        };
      }
    },

    widget: {
      title: 'Reconciler loop: drift, self-heal, promote, revert',
      caption: 'Three environments, five tracked fields each. <b>Git</b> is the desired state, <b>Live</b> is the cluster. Make a hand edit with <b>kubectl edit</b> and watch the next sync find it (≠) and, with self-heal on, put it back. <b>Commit</b> a new image to dev, <b>promote</b> it by PR to staging and prod, and <b>git revert</b> a bad promotion. Turn self-heal off to see drift persist.'
    },

    realWorld: {
      intro: 'GitOps went from a vendor blog post to a CNCF standard and two graduated projects in five years. Its originating company did not survive; the idea and the tools did.',
      timeline: [
        { when: '2017', who: 'Weaveworks', title: '"Operations by pull request"', text: 'Weaveworks CEO <b>Alexis Richardson</b> coined "GitOps" and, with Ilya Dmitrichenko, wrote a series of posts: Git as the source of truth for desired state, every production change via pull request, and alerts on divergence. RedMonk\'s James Governor wrote it up in 2017.', src: 0 },
        { when: '2018', who: 'Intuit', title: 'Argo CD is born', text: 'After acquiring Applatix (the Argo Workflows team) in early 2018, Intuit built and open-sourced <b>Argo CD</b>, motivated by the lack of an open tool to manage many clusters from one control plane.', src: 2 },
        { when: '2019–2020', who: 'CNCF', title: 'Flux and Argo enter the CNCF incubator', text: 'Flux entered the CNCF incubator in 2019 and Argo in 2020 (Intuit donated it); both built large communities on the way to graduation.', src: 4 },
        { when: 'Oct 2021', who: 'OpenGitOps (CNCF App Delivery TAG)', title: 'Principles v1.0.0', text: 'The GitOps Working Group published four principles: desired state is <b>declarative</b>, <b>versioned and immutable</b>, <b>pulled automatically</b>, and <b>continuously reconciled</b>. Note what is <i>not</i> required: Git itself or Kubernetes.', src: 1 },
        { when: 'Nov 30, 2022', who: 'CNCF', title: 'Flux graduates', text: 'CNCF announced Flux\'s graduation, describing it as a pioneering GitOps project.', src: 3 },
        { when: 'Dec 6, 2022', who: 'CNCF', title: 'Argo graduates', text: 'A week later Argo graduated, covering Argo CD, Workflows, Rollouts and Events. Two GitOps engines reached the CNCF\'s top maturity level in the same month.', src: 4 },
        { when: 'Argo CD docs', who: 'Argo project', title: 'Automated sync, self-heal, prune', text: 'Automated sync applies new commits; it does <b>not</b> delete resources unless <code>prune</code> is set, and only reverts manual cluster changes when <code>selfHeal</code> is set. Hooks and sync waves order resources within a sync.', src: 5 },
        { when: 'Feb 5, 2024', who: 'Weaveworks', title: 'Weaveworks shuts down', text: 'Richardson announced on LinkedIn that Weaveworks was closing after a promising M&A process "fell through at the 11th hour". Flux, as a CNCF project, continued with other maintainers and vendors.', src: 7 }
      ],
      lessons: [
        'GitOps is a <b>control loop</b>: decide explicitly what the loop may fix (self-heal) and delete (prune).',
        'Pull beats push for <b>security</b>: the cluster reaches out; CI holds no keys.',
        'Use <b>directories and overlays</b>, not branches, for environments; promotion is a small diff.',
        'Keep <b>secrets out of Git</b> by reference (ESO) or strong encryption (SOPS, Sealed Secrets).',
        'Standards outlive vendors: OpenGitOps and CNCF governance kept Flux alive after Weaveworks.'
      ],
      sources: [
        { title: 'Oh hai GitOps: what is GitOps?', url: 'https://redmonk.com/jgovernor/oh-hai-gitops-what-is-gitops/', pub: 'James Governor, RedMonk, 2017' },
        { title: 'OpenGitOps', url: 'https://opengitops.dev/', pub: 'CNCF GitOps Working Group (principles v1.0.0)' },
        { title: 'Why We Created the Argo Project', url: 'https://akuity.io/blog/why-we-created-the-argo-project', pub: 'Akuity (Argo co-creators)' },
        { title: 'Flux graduates from CNCF incubator', url: 'https://www.cncf.io/announcements/2022/11/30/flux-graduates-from-cncf-incubator/', pub: 'CNCF, Nov 30 2022' },
        { title: 'Argo and Flux: grown-up GitOps for the cloud native generation', url: 'https://www.cncf.io/blog/2022/12/27/argo-and-flux-grown-up-gitops-for-cloud-native-generation/', pub: 'CNCF blog, Dec 2022' },
        { title: 'Automated Sync Policy', url: 'https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/', pub: 'Argo CD documentation' },
        { title: 'Resource Hooks', url: 'https://argo-cd.readthedocs.io/en/stable/user-guide/resource_hooks/', pub: 'Argo CD documentation' },
        { title: 'End of an era: Weaveworks closes shop', url: 'https://thenewstack.io/end-of-an-era-weaveworks-closes-shop-amid-cloud-native-turbulence/', pub: 'The New Stack, Feb 2024' },
        { title: 'Weaveworks shuts its doors', url: 'https://techcrunch.com/2024/02/05/cloud-native-container-management-platform-weaveworks-shuts-its-doors', pub: 'TechCrunch, Feb 5 2024' },
        { title: 'Intuit case study', url: 'https://www.cncf.io/case-studies/intuit/', pub: 'CNCF' },
        { title: 'Argo graduates from CNCF incubator', url: 'https://www.cncf.io/news/2022/12/06/itops-times-argo-graduates-from-cncf-incubator-following-massive-community-growth/', pub: 'CNCF news (ITOps Times), Dec 6 2022' }
      ]
    },

    tradeoffs: {
      headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
      rows: [
        ['Deploy model', '<b>CI push</b>: simple, one pipeline', '<b>GitOps pull</b>: no creds in CI, drift detection', 'Push for a single small cluster or non-Kubernetes targets; pull once you have several clusters or audit needs'],
        ['Tool', '<b>Argo CD</b>: UI, ApplicationSets, RBAC, multi-cluster from one hub', '<b>Flux</b>: toolkit of controllers, per-cluster, native SOPS, image automation', 'Argo CD for a central platform team with a UI; Flux for lightweight per-cluster agents and Git-first ops'],
        ['Repo split', '<b>Config in app repo</b>: one PR for code + config', '<b>Separate config repo</b>: clean audit, no CI loop on config commits', 'Separate repo once several teams or clusters share it, or when image bumps would retrigger app CI'],
        ['Environments', '<b>Branch per env</b>', '<b>Directory per env + overlays</b> on main', 'Almost always directories; branches only for short-lived experiments'],
        ['Self-heal', '<b>On</b>: hand edits reverted', '<b>Off</b>: drift reported only', 'On by default with a documented break-glass (pause auto-sync); off only during a migration'],
        ['Secrets', '<b>Encrypted in Git</b> (SOPS, Sealed Secrets)', '<b>Reference in Git</b> (External Secrets Operator)', 'Encrypt when there is no secrets manager; reference when there is one and rotation matters']
      ]
    },
    failures: [
      { f: 'Branch-per-environment drift', detect: '<code>git diff prod..staging</code> shows unrelated differences; promotions need cherry-picks', fix: 'One branch, one directory per env with overlays; promotion PR changes only the tag or values.' },
      { f: 'Manual kubectl edits with self-heal off', detect: 'Apps OutOfSync for days; drift_event age grows', fix: 'Turn on selfHeal; alert on OutOfSync > 15 min; break-glass = pause, fix, commit, resume.' },
      { f: 'Self-heal fights another controller', detect: 'Replicas flap; sync every few seconds; HPA events', fix: '<code>ignoreDifferences</code> for fields owned by HPA, operators or mutating webhooks; omit replicas from Git when an HPA owns them.' },
      { f: 'Giant YAML monorepo without ownership', detect: 'Commits by many teams to the same paths; slow reconcile; one bad base change breaks every cluster', fix: 'CODEOWNERS per path, split repos per team or domain, rings for fleet-wide changes.' },
      { f: 'Secrets leaked into Git history', detect: 'Secret scanning on push; base64 Secret manifests in repo', fix: 'Rotate immediately, purge history, enforce ESO/SOPS by policy (reject kind: Secret in PRs).' },
      { f: 'Prune deletes something important', detect: 'Resource missing after a refactor moved or renamed files', fix: 'Review rendered diffs in PRs; <code>Prune=false</code> annotation on stateful resources (PVCs, namespaces); deletion protection.' },
      { f: 'Floating tags break reproducibility', detect: '<code>:latest</code> or mutable tags in overlays; same commit, different image', fix: 'Immutable semver tags or digests; policy check in CI rejects floating tags.' }
    ],

    interview: [
      { q: 'What is GitOps, precisely?', a: '<p>The term came from Weaveworks (Alexis Richardson, 2017): "operations by pull request". The vendor-neutral definition is <b>OpenGitOps v1.0.0</b> (CNCF, 2021): desired state is <b>declarative</b>, <b>versioned and immutable</b>, <b>pulled automatically</b> by agents, and <b>continuously reconciled</b>.</p><p>Common misreading: "storing YAML in Git and running kubectl from CI" is <b>not</b> GitOps. It misses pull and continuous reconciliation, so drift goes unnoticed.</p>', fu: 'Does GitOps require Git or Kubernetes?', lvl: 'core' },
      { q: 'Push vs pull deployment: what changes for security?', a: '<p><b>Push</b>: CI has credentials for every cluster, and its attack surface (plugins, runners, secrets) becomes the attack surface of prod. <b>Pull</b>: an agent in the cluster fetches from Git and the registry with read-only credentials; CI only needs to push images and open PRs.</p><p>The cluster API need not be reachable from CI at all; the agent makes outbound connections. Attackers must get a change merged, past review and branch protection.</p>', lvl: 'core' },
      { q: 'Explain the reconciliation loop. What do self-heal and prune do?', a: '<p>Each interval (Argo CD defaults to about 3 minutes, plus Git webhooks) the controller renders the manifests for a revision, diffs them against live objects and applies the difference if automated sync is on.</p><ul><li><b>selfHeal</b>: also re-apply when <i>live</i> changed (hand edit), not only when Git changed.</li><li><b>prune</b>: delete live objects whose manifests were removed. Off by default in Argo CD, as a safety measure.</li></ul>', fu: 'Why might self-heal fight an HPA?', lvl: 'core' },
      { q: 'How would you lay out repos for 20 teams and 3 environments?', a: '<p>App repos hold code; a <b>config repo</b> (or one per domain) holds deployable state. Inside: <code>apps/&lt;app&gt;/base</code> plus <code>overlays/dev|staging|prod</code> with Kustomize (or a chart plus <code>values-&lt;env&gt;.yaml</code>). One branch, <b>CODEOWNERS per path</b>, and an ApplicationSet that generates Applications from the directory structure.</p><p>Avoid branch per environment: branches diverge through cherry-picks and promotion stops being a readable diff.</p>', lvl: 'core' },
      { q: 'How does promotion from dev to prod work in GitOps?', a: '<p>Promotion is a <b>pull request</b> that changes one overlay: the image tag or digest (and maybe config) in <code>overlays/prod</code>. CI on the PR validates schema and policy and shows the rendered diff; required approvers merge; the prod agent syncs.</p><p>Lower envs often use an <b>image updater</b> (Flux image automation or Argo CD Image Updater) that commits new tags automatically; prod keeps a human or a policy gate.</p>', lvl: 'core' },
      { q: 'How do you handle secrets if everything is in Git?', a: '<ul><li><b>Sealed Secrets</b>: encrypt with the cluster controller\'s public key; only that cluster can decrypt. Back up the key.</li><li><b>SOPS</b>: encrypt values with KMS, PGP or age; Flux decrypts natively.</li><li><b>External Secrets Operator</b>: Git holds only an <code>ExternalSecret</code> reference; the operator fetches from Vault, AWS Secrets Manager, etc. Best for rotation.</li></ul><p>Never commit base64 Secrets: base64 is encoding, not encryption.</p>', lvl: 'core' },
      { q: 'How do you roll back?', a: '<p><code>git revert</code> the promotion commit and merge it; the agent syncs the previous state. It is audited like any other change. Argo CD also offers a UI rollback to a previous sync, but with auto-sync on it would be overwritten by Git, so revert in Git.</p><p>Data does not roll back: migrations must be backwards compatible (expand/contract) for this to be safe.</p>', lvl: 'core' },
      { q: 'Argo CD vs Flux: how would you choose?', a: '<p>Both are CNCF graduated (Flux Nov 2022, Argo Dec 2022) and implement the same principles.</p><p><b>Argo CD</b>: a rich UI, SSO/RBAC, a hub that manages many clusters, ApplicationSets, sync waves and hooks. <b>Flux</b>: a set of small controllers (source, kustomize, helm, notification, image automation) usually run in each cluster, native SOPS. Choose on operating model (central hub vs per-cluster agent) and the team\'s UI needs.</p>', lvl: 'deep' },
      { q: 'How do you manage 50+ clusters?', a: '<p>An <b>ApplicationSet</b> with a cluster generator (by label) or Git directory generator stamps out Applications per cluster. Group clusters into <b>rings</b> (canary, early, broad) and promote fleet-wide changes ring by ring.</p><p>Scale the control plane: controller sharding, webhooks instead of short polling, and repo splits so one commit does not re-render everything. Or run Flux per cluster to avoid a single hub.</p>', lvl: 'deep' },
      { q: 'What are sync waves and hooks for?', a: '<p><b>Sync waves</b> (annotation <code>argocd.argoproj.io/sync-wave</code>) order resources inside one sync: lower waves apply and become healthy first, e.g. CRDs and namespaces before workloads. <b>Hooks</b> (PreSync, Sync, PostSync, SyncFail) run Jobs at phases: a DB migration before, a smoke test after.</p><p>Keep them few: heavy ordering logic is a sign the system is not declarative enough.</p>', lvl: 'deep' },
      { q: 'An engineer says self-heal reverted their incident fix. How do you respond?', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: during an outage, on-call scaled a deployment by hand; self-heal reverted it within 5 seconds and the outage lasted 20 minutes longer. <b>Task</b>: keep the guarantees without slowing incidents. <b>Action</b>: wrote a break-glass runbook (pause auto-sync per app with one command, logged), a one-click "commit this fix" PR template, and an alert when auto-sync stays paused over 2 hours. Excluded HPA-owned replicas with ignoreDifferences. <b>Result</b>: no incident lost to self-heal in the next two quarters, and drift events fell from ~15 to ~2 a month.</p>', lvl: 'core' },
      { q: 'What would you say about Weaveworks shutting down?', a: '<p>Weaveworks, which coined GitOps and created Flux, closed in February 2024 after an acquisition fell through. Flux continued as a <b>CNCF graduated project</b> with other maintainers and vendors.</p><p>The lesson for architects: pick tools by <b>governance and community</b>, not only by vendor; foundation-hosted projects with an open standard behind them (OpenGitOps) survive their originating company.</p>', lvl: 'deep' }
    ],

    code: [
      {
        title: 'Argo CD Application: automated sync, selfHeal, prune', lang: 'yaml',
        code: `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: payments-api-prod
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io   # delete app = delete its resources
spec:
  project: payments
  source:
    repoURL: https://github.com/acme/platform-config.git
    targetRevision: main
    path: apps/payments-api/overlays/prod      # Kustomize overlay
  destination:
    server: https://kubernetes.default.svc
    namespace: payments
  syncPolicy:
    automated:
      prune: true        # remove objects deleted from Git
      selfHeal: true     # revert manual changes in the cluster
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
    retry:
      limit: 5
      backoff: { duration: 10s, factor: 2, maxDuration: 3m }
  ignoreDifferences:     # HPA owns replicas; do not fight it
    - group: apps
      kind: Deployment
      jsonPointers: [/spec/replicas]`,
        note: 'Promotion PRs change only the overlay this Application points at. Pair with an AppProject that restricts source repos and destination namespaces.'
      },
      {
        title: 'Kustomize overlay for prod (overlays/prod/kustomization.yaml)', lang: 'yaml',
        code: `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: payments
resources:
  - ../../base                 # Deployment, Service, HPA, ConfigMap
  - external-secret.yaml
labels:
  - pairs: { env: prod }
    includeSelectors: false
images:
  - name: ghcr.io/acme/payments-api
    newTag: "1.8.0"            # promotion PR edits this line
    # or pin by digest: digest: sha256:4f1c...
patches:
  - target: { kind: HorizontalPodAutoscaler, name: payments-api }
    patch: |-
      - op: replace
        path: /spec/minReplicas
        value: 3
      - op: replace
        path: /spec/maxReplicas
        value: 30
configMapGenerator:
  - name: payments-api-config
    behavior: merge
    literals:
      - LOG_LEVEL=info
      - FEATURE_NEW_LEDGER=false`,
        note: 'Dev and staging overlays differ only in tag, limits and config. <code>git diff overlays/staging overlays/prod</code> shows exactly what promotion will change.'
      },
      {
        title: 'ExternalSecret: pull a DB password from AWS Secrets Manager', lang: 'yaml',
        code: `apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: payments-db
  namespace: payments
spec:
  refreshInterval: 1h            # pick up rotations
  secretStoreRef:
    kind: ClusterSecretStore
    name: aws-secrets-manager    # IRSA / workload identity, no static keys
  target:
    name: payments-db            # Kubernetes Secret created by ESO
    creationPolicy: Owner
  data:
    - secretKey: DB_PASSWORD
      remoteRef:
        key: prod/payments/db
        property: password
    - secretKey: DB_USER
      remoteRef:
        key: prod/payments/db
        property: username`,
        note: 'Only this reference lives in Git. ESO v0.16+ serves <code>external-secrets.io/v1</code>; older installs use <code>v1beta1</code> with the same fields.'
      }
    ],

    related: ['infrastructure-as-code', 'deployment-strategies', 'platform-engineering', 'secrets-kms', 'twelve-factor', 'devsecops']
  });
})();
