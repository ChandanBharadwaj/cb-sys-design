(function () {
  // Plan time model (estimate): fixed start-up + one refresh API call per resource, run with -parallelism=10, ~0.5 s per call.
  const planSecs = (res) => 8 + res * 0.5 / 10;
  const fmtS = (s) => (s < 90 ? Math.round(s) + ' s' : (s / 60).toFixed(1) + ' min');

  SD.register({
    slug: 'infrastructure-as-code',
    domain: 6,
    title: 'Infrastructure as Code & Drift',
    examples: 'Terraform, Pulumi, OPA',
    tagline: 'Describe every network, database and bucket <b>in reviewed code</b>, let a tool work out the diff with the real cloud, and treat any change made outside that code (<b>drift</b>) as a bug to revert or codify.',
    tldr: {
      problem: 'Environments built by hand in a console become <b>snowflakes</b>: nobody can rebuild them, staging quietly differs from prod, and an emergency click at 2 a.m. is never written down. Audits ask "who opened port 22?" and nobody knows.',
      idea: 'Write the <b>desired state</b> in code (Terraform, OpenTofu, Pulumi, CDK, Crossplane). A tool compares it with the real cloud, shows a <b>plan</b> (+ create, ~ update, - destroy), and applies it after review. A <b>state file</b> maps code to real resource IDs; a <b>lock</b> stops two applies at once.',
      insight: 'IaC is only as good as its <b>loop</b>: if people still click in the console, code and reality diverge. Close the loop with <b>scheduled drift detection</b> (or continuous reconciliation), <b>policy as code</b> in the pipeline, and <b>small state files</b> so one bad apply cannot take everything down.',
      numbers: [
        { v: 'exit 2', l: '<code>terraform plan -detailed-exitcode</code>: 0 = no diff, 1 = error, 2 = changes (drift)' },
        { v: 'Aug 2023', l: 'HashiCorp moves Terraform from MPL 2.0 to the BSL; OpenTofu fork follows (Linux Foundation, Sept 2023)' },
        { v: '1.11', l: 'Terraform version where S3 native locking (<code>use_lockfile</code>) went GA; DynamoDB locking deprecated' }
      ]
    },

    intro: {
      what: '<b>Infrastructure as Code</b> (IaC) means you describe servers, networks, databases and permissions in text files kept in Git, and a tool creates or changes the real cloud resources to match. <b>Drift</b> is any difference between what the code says and what really exists, usually caused by someone changing things by hand.',
      analogy: {
        icon: '🏗️',
        title: 'An architect\'s blueprint and a building inspector',
        text: 'The blueprint (code) says where every wall and pipe goes. The builder (the IaC tool) builds exactly that, and the building register (the state file) records which real wall matches which line of the drawing. If a tenant knocks down a wall without asking, the inspector (drift detection) compares the building with the blueprint and flags it. You then either rebuild the wall or update the blueprint. Unlike a building, cloud resources can be torn down and rebuilt in minutes, which is why "replace instead of repair" works so well.'
      },
      problem: 'A team runs three environments that were built by hand. Prod has a security group rule someone added during an incident, staging has a bigger database, and the person who set up the VPC left last year. A region outage means rebuilding prod elsewhere, and nobody can. The question this page answers is <b>how do you make infrastructure reproducible, reviewable and still correct a month after the last deploy?</b>',
      story: [
        {
          stage: 'naive',
          title: 'Click it together in the console',
          text: 'An engineer creates the VPC, database and buckets in the cloud console, then adds a firewall rule while debugging. It is fast, it works, and there is nothing to learn.',
          scene: {
            nodes: [
              { id: 'eng', label: 'Engineer', sub: 'console clicks', kind: 'person', at: [70, 0] },
              { id: 'cloud', label: 'Prod account', sub: 'VPC · DB · S3', kind: 'external', at: [210, 110] },
              { id: 'stg', label: 'Staging', sub: 'built by hand too', kind: 'external', at: [350, 220] }
            ],
            edges: [{ from: 'eng', to: 'cloud' }, { from: 'eng', to: 'stg', dashed: true }],
            flow: ['eng>cloud', 'eng>stg'],
            badges: { cloud: ['works today', 'info'] }
          }
        },
        {
          stage: 'breaks',
          title: 'Snowflakes nobody can rebuild',
          text: 'Months later prod and staging differ in dozens of settings. A bucket is <b>public</b> because of a debugging click. A region fails and there is no record of how prod was built, so recovery takes days of guessing.',
          scene: {
            nodes: [
              { id: 'eng', label: 'Engineer', sub: 'left the company', kind: 'person', at: [70, 0] },
              { id: 'cloud', label: 'Prod account', sub: 'unknown config', kind: 'external', at: [210, 110] },
              { id: 'stg', label: 'Staging', sub: '≠ prod', kind: 'external', at: [350, 220] }
            ],
            edges: [{ from: 'eng', to: 'cloud', dashed: true }, { from: 'cloud', to: 'stg', dashed: true }],
            flow: ['cloud>stg'],
            err: ['cloud'], warn: ['stg'],
            badges: { cloud: ['public bucket 💥', 'err'], stg: ['drifted', 'warn'] }
          }
        },
        {
          stage: 'fix',
          title: 'Code, plan, review, apply, check',
          text: 'The infrastructure lives in <b>Git</b>. A pipeline runs <b>plan</b>, checks it against policy and applies after review. A scheduled plan flags anything changed by hand, and the team <b>reverts or codifies</b> it.',
          scene: {
            nodes: [
              { id: 'eng', label: 'Engineer', sub: 'pull request', kind: 'person', at: [70, 0] },
              { id: 'git', label: 'Git + CI', sub: 'plan · policy', kind: 'service', at: [210, 0] },
              { id: 'cloud', label: 'Prod account', sub: 'matches code', kind: 'external', at: [210, 110] },
              { id: 'stg', label: 'Staging', sub: 'same modules', kind: 'external', at: [350, 220] },
              { id: 'drift', label: 'Drift check', sub: 'nightly plan', kind: 'compute', at: [70, 220] }
            ],
            edges: [{ from: 'eng', to: 'git' }, { from: 'git', to: 'cloud' }, { from: 'git', to: 'stg' }, { from: 'drift', to: 'cloud' }],
            flow: ['eng>git', ['git>cloud', 'git>stg'], 'drift>cloud'],
            ok: ['cloud', 'stg'],
            badges: { drift: ['exit 0: no drift', 'ok'] }
          }
        }
      ],
      usedBy: ['Terraform / OpenTofu', 'Pulumi', 'AWS CloudFormation and CDK', 'Crossplane (CNCF)', 'Azure Bicep', 'Google Cloud Infrastructure Manager'],
      whenToUse: [
        'More than one environment must look <b>the same</b> (dev, staging, prod, DR region)',
        'You need <b>review and audit</b> of infrastructure changes (who, what, why, when)',
        'You want to rebuild an environment from scratch, quickly, after a disaster'
      ],
      whenNot: [
        'A throwaway experiment you will delete today (still script it if you might repeat it)',
        'Things that change many times per minute at runtime (autoscaled instance counts, pod replicas): let the controller own them and <code>ignore_changes</code> them in IaC',
        'Application deployment and rollout: hand that to <a href="gitops.html">GitOps</a> or a deploy pipeline rather than a Terraform apply per release'
      ],
      glossary: [
        { term: 'Declarative', def: 'You describe the end state ("3 subnets exist"); the tool works out the steps to get there.' },
        { term: 'State file', def: 'Terraform\'s record mapping each resource in code to the real cloud ID and its last known attributes.' },
        { term: 'Plan / apply', def: 'Plan computes and shows the diff between code and reality; apply executes exactly that diff.' },
        { term: 'State lock', def: 'A lock taken on the state before a write, so two applies cannot run against the same state at once.' },
        { term: 'Drift', def: 'Any difference between the code (desired state) and the real infrastructure, usually from manual changes.' },
        { term: 'Immutable infrastructure', def: 'Never patch a running server; build a new one from an image and replace the old one.' },
        { term: 'Policy as code', def: 'Rules such as "no public buckets", written as code and checked automatically against every plan.' },
        { term: 'Blast radius', def: 'How much infrastructure one mistaken apply can damage; mostly set by how big each state file is.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Declarative desired state</b> in version control is the single source of truth',
        '<b>Every change goes through a plan</b> that a human (or policy) reviews before apply',
        '<b>Idempotent</b>: applying the same code twice changes nothing the second time',
        '<b>Immutable where possible</b>: replace servers and images rather than patch them in place',
        '<b>Same modules, different inputs</b> per environment; promote the same version dev → staging → prod',
        '<b>Close the loop</b>: detect drift continuously and either revert it or codify it'
      ],
      nonFunctional: [
        'Rebuild a full environment from code in hours, not days (measured by a regular DR rebuild)',
        'Zero untracked production changes older than one detection interval (e.g. 24 h)',
        '100% of applies come from CI with a stored plan and an approver',
        'Plan time per state file under ~2 minutes (<em>rule of thumb</em>: split state when it grows past this)',
        'No secrets in plain text in code or state; state encrypted at rest with restricted access',
        'Policy violations (public buckets, open SSH, untagged resources) blocked before apply, not found after'
      ],
      outOfScope: [
        '<b>Click-ops in prod</b>: "just this once" console fixes that never reach the code',
        '<b>One giant state file</b> for every environment and component: slow plans, huge blast radius',
        '<b>Apply from laptops</b> with personal admin credentials and no lock',
        '<b>Copy-paste environments</b>: three diverging folders instead of one module with inputs',
        '<b>Ignoring drift</b> until the next apply silently reverts someone\'s hotfix'
      ]
    },

    calculator: {
      inputs: [
        { id: 'res', label: 'Managed resources per environment', min: 50, max: 10000, value: 1500, log: true },
        { id: 'envs', label: 'Environments', min: 1, max: 12, value: 3 },
        { id: 'comps', label: 'Components if split (network, data, app…)', min: 2, max: 40, value: 8 },
        { id: 'manual', label: 'Manual (out-of-band) changes per week', min: 0, max: 100, value: 10 },
        { id: 'interval', label: 'Drift detection interval', min: 1, max: 720, value: 24, unit: 'h', log: true },
        { id: 'fix', label: 'Time to triage and fix after detection', min: 1, max: 168, value: 8, unit: 'h', log: true }
      ],
      outputs: [
        { label: 'Mean time a drift persists (interval ÷ 2 + fix)', fmt: 'raw', f: (v) => { const h = v.interval / 2 + v.fix; return h < 48 ? h.toFixed(1) + ' h' : (h / 24).toFixed(1) + ' days'; } },
        { label: 'Drift items open at any moment (Little\'s law)', fmt: 'raw', f: (v) => (v.manual / 168 * (v.interval / 2 + v.fix)).toFixed(1) },
        { label: 'State files: monolith · per env · per env × component', fmt: 'raw', f: (v) => '1 · ' + v.envs + ' · ' + v.envs * v.comps },
        { label: 'Plan time: monolith · per env · per component', fmt: 'raw', f: (v) => [v.res * v.envs, v.res, v.res / v.comps].map((r) => fmtS(planSecs(r))).join(' · ') },
        { label: 'Blast radius of one apply (resources in that state)', fmt: 'raw', f: (v) => ctxNum(v.res * v.envs) + ' · ' + ctxNum(v.res) + ' · ' + ctxNum(Math.ceil(v.res / v.comps)) },
        { label: 'Scheduled plans per day (per-component layout)', fmt: 'raw', f: (v) => Math.round(v.envs * v.comps * 24 / v.interval * 10) / 10 + '' }
      ],
      note: 'Drift is a queue: manual changes arrive at λ per hour and each one lives on average <b>half a detection interval</b> plus your fix time, so open drift ≈ λ × that time (Little\'s law). Halving the interval or the fix time halves the open drift; only removing console write access cuts λ. Plan time assumes one refresh API call per resource at ~0.5 s with Terraform\'s default <code>-parallelism=10</code> plus ~8 s start-up: an <em>estimate</em>; provider rate limits often make large states slower. Blast radius is the count of resources one apply can touch.'
    },

    api: [
      { m: 'HCL', p: 'modules/network, modules/db…', d: 'Versioned, reusable <b>modules</b> with typed inputs, validation and outputs. Environments are thin root modules that call them with different inputs.' },
      { m: 'YAML', p: 'backend + state layout', d: 'One remote backend per root module (S3 + <code>use_lockfile</code>, GCS, azurerm, HCP Terraform). Key naming such as <code>prod/network/terraform.tfstate</code> encodes the state split.' },
      { m: 'POLICY', p: 'policy/*.rego (OPA / Conftest)', d: 'Deny public buckets, 0.0.0.0/0 on SSH, unencrypted volumes, missing <code>owner</code> tags. Evaluated against <code>terraform show -json</code> of every plan. Sentinel and Checkov fill the same slot.' },
      { m: 'YAML', p: '.github/workflows/terraform.yml', d: 'PR: fmt, validate, test, plan, policy, post plan as a comment. Merge: apply the <b>saved plan</b>. Cron: <code>plan -detailed-exitcode</code> per state for drift.' },
      { m: 'ADR', p: 'ADR-012: Drift handling policy', d: 'Which resources may be changed by hand (none, break-glass only), the detection interval, who triages, and the rule: <b>revert</b> unless the change is wanted, then <b>codify within N days</b>.' },
      { m: 'DOC', p: 'Break-glass runbook', d: 'How to make an emergency console change: who can, how it is logged (CloudTrail), and the ticket that forces it back into code.' }
    ],
    dataModel: [
      { name: 'terraform.tfstate (JSON)', store: 'S3 / GCS / HCP Terraform', fields: [['version', 'int (format, 4)'], ['terraform_version', 'text'], ['serial', 'int', 'idx'], ['lineage', 'uuid', 'pk'], ['resources[].type/name', 'text', 'sk'], ['resources[].instances[].attributes', 'json'], ['outputs', 'json']], note: '<b>serial</b> increases on every write and <b>lineage</b> identifies the state\'s history, so Terraform refuses to overwrite a newer or unrelated state. Attributes can hold secrets (DB passwords): encrypt it and restrict reads.' },
      { name: 'lock (terraform.tfstate.tflock)', store: 'S3 object beside the state', fields: [['ID', 'uuid', 'pk'], ['Operation', 'OperationTypeApply|Plan'], ['Who', 'user@host'], ['Version', 'text'], ['Created', 'timestamp'], ['Path', 'text']], note: 'Created with an S3 conditional write; a second writer gets "Error acquiring the state lock" with this info. <code>terraform force-unlock ID</code> removes a stale lock after a crash.' },
      { name: 'drift_finding', store: 'Postgres / ticket system', fields: [['id', 'bigint', 'pk'], ['state_key', 'text', 'idx'], ['address', 'text'], ['action', 'update|delete|create'], ['detected_at', 'timestamptz', 'idx'], ['resolution', 'revert|codify|accepted'], ['resolved_at', 'timestamptz']], note: 'One row per drifted resource from the scheduled plan. Mean of resolved_at − detected_at is your drift persistence metric.' }
    ],

    architecture: {
      title: 'IaC pipeline with drift detection',
      nodes: [
        { id: 'dev', label: 'Engineer', sub: 'edits HCL / Pulumi', kind: 'person', wide: [90, 60], tall: [70, 0], tip: 'Changes infrastructure only by editing code and opening a pull request.' },
        { id: 'git', label: 'Git repo', sub: 'PR · review · history', kind: 'service', wide: [290, 60], tall: [210, 0], tip: 'The single source of truth for desired state. History doubles as the audit log.' },
        { id: 'ci', label: 'CI runner', sub: 'plan → policy → apply', kind: 'compute', wide: [500, 60], tall: [210, 105], tip: 'Runs terraform init/plan on PRs, posts the plan, and applies the saved plan after merge. Uses short-lived OIDC credentials, not stored keys.' },
        { id: 'opa', label: 'Policy as code', sub: 'OPA · Sentinel · Checkov', kind: 'policy', wide: [710, 60], tall: [350, 0], tip: 'Evaluates the plan JSON against rules (no public buckets, no open SSH, tags present). A deny blocks the apply.' },
        { id: 'mods', label: 'Module registry', sub: 'versioned modules', kind: 'store', wide: [900, 200], tall: [70, 105], tip: 'Reusable, versioned modules (network, database, service). Environments pin versions and promote them.' },
        { id: 'vault', label: 'Secrets manager', sub: 'Vault · AWS SM', kind: 'store', wide: [90, 200], tall: [350, 105], tip: 'Secrets are generated or read at runtime by the app, not passed through Terraform variables, so they never land in state.' },
        { id: 'state', label: 'State backend', sub: 'S3 + lockfile', kind: 'store', wide: [500, 200], tall: [70, 210], tip: 'Remote, versioned, encrypted state per root module, with a lock (S3 use_lockfile, GCS, or HCP Terraform).' },
        { id: 'cloud', label: 'Cloud APIs', sub: 'AWS · GCP · Azure', kind: 'external', wide: [710, 200], tall: [210, 210], tip: 'Providers call these APIs to refresh (read) and to create, update or delete resources.' },
        { id: 'res', label: 'Real resources', sub: 'VPC · RDS · S3', kind: 'service', wide: [710, 340], tall: [210, 315], tip: 'What actually exists. Anything here that the code does not describe is drift or unmanaged.' },
        { id: 'console', label: 'Console user', sub: 'click-ops · hotfix', kind: 'client', wide: [900, 340], tall: [70, 315], tip: 'The main source of drift: an emergency or convenience change made outside the pipeline.' },
        { id: 'drift', label: 'Drift check', sub: 'scheduled plan', kind: 'compute', wide: [500, 340], tall: [350, 210], tip: 'A cron job running plan -detailed-exitcode (or -refresh-only) per state; exit code 2 opens an issue.' }
      ],
      edges: [
        { from: 'dev', to: 'git' },
        { from: 'git', to: 'ci' },
        { from: 'opa', to: 'ci', dashed: true },
        { from: 'mods', to: 'ci', dashed: true },
        { from: 'vault', to: 'ci', dashed: true },
        { from: 'ci', to: 'state', bidi: true },
        { from: 'ci', to: 'cloud' },
        { from: 'cloud', to: 'res' },
        { from: 'console', to: 'res' },
        { from: 'drift', to: 'cloud' },
        { from: 'drift', to: 'state', bend: 0.3 },
        { from: 'drift', to: 'git', dashed: true }
      ]
    },

    scenarios: [
      {
        id: 'change', title: 'A normal change: PR → plan → apply', tone: 'info',
        steps: [
          { text: 'An engineer bumps the database module from <code>v1.4</code> to <code>v1.5</code> (adds a read replica) and opens a <b>pull request</b>.', flow: ['dev>git'], badges: { git: 'PR #418' } },
          { text: 'CI checks out the code, pulls the pinned module version and reads the <b>state</b> for <code>prod/data</code>.', flow: ['git>ci', 'mods>ci', 'state>ci'], badges: { mods: 'db v1.5' } },
          { text: '<b>Plan</b> refreshes real resources through the cloud APIs and shows the diff: <code>+ aws_db_instance.replica</code>, <code>~ parameter_group</code>. Nothing is changed yet.', flow: ['ci>cloud', 'cloud>res'], badges: { ci: '+1 ~1 -0' } },
          { text: '<b>Policy as code</b> evaluates the plan JSON: encryption on, tags present, not public. Pass. A reviewer approves the plan posted on the PR.', flow: ['opa>ci'], ok: ['opa'], badges: { opa: ['0 violations', 'ok'] } },
          { text: 'After merge CI takes the <b>lock</b>, applies exactly the saved plan, writes state serial 42 → 43 and releases the lock.', flow: ['ci>state', 'ci>cloud', 'cloud>res', 'ci>state'], ok: ['res'], badges: { state: ['serial 43', 'ok'] }, tone: 'ok' }
        ]
      },
      {
        id: 'drift', title: 'Console hotfix → drift → revert or codify', tone: 'warn',
        steps: [
          { text: 'During an incident someone opens <b>port 22 to 0.0.0.0/0</b> on a security group in the console to debug. The incident ends; the rule stays.', flow: ['console>res'], warn: ['res'], badges: { res: ['sg: 0.0.0.0/0 :22', 'warn'] }, tone: 'warn' },
          { text: 'The nightly <b>drift check</b> runs <code>terraform plan -detailed-exitcode</code>. Refresh sees the real rule; the code does not have it. Exit code <b>2</b>.', flow: ['drift>state', 'drift>cloud', 'cloud>res'], badges: { drift: ['exit 2', 'warn'] } },
          { text: 'The job opens an issue with the diff: <code>~ aws_security_group.web: ingress - 0.0.0.0/0</code>. Detection took at most one interval.', flow: ['drift>git'], badges: { git: 'issue: drift in prod/app' } },
          { text: 'Decide: is the change wanted? Here no, so <b>revert</b>: run apply from CI and the rule is removed. If it were wanted (a real new port), you would <b>codify</b> it in a PR so the next plan is clean.', flow: ['git>ci', 'ci>cloud', 'cloud>res'], ok: ['res'], badges: { res: ['matches code', 'ok'] }, tone: 'ok' },
          { text: 'Root cause, not just symptom: move console write access behind <b>break-glass</b> roles so the next hotfix is logged and ticketed.', nodes: ['console'], badges: { console: ['read-only + break-glass', 'info'] } }
        ]
      },
      {
        id: 'lock', title: 'Two applies at once: the state lock', tone: 'err',
        steps: [
          { text: 'Alice and Bob both run <code>terraform apply</code> on <code>prod/network</code> within seconds. Both read state <b>serial 17</b>.', flow: [['dev>ci', 'console>res']], nodes: ['state'], badges: { state: 'serial 17' } },
          { text: 'With a backend <b>lock</b>, Alice\'s run creates <code>terraform.tfstate.tflock</code> first. Bob gets <code>Error acquiring the state lock</code> with Alice\'s lock ID and waits.', flow: ['ci>state'], ok: ['state'], badges: { state: ['locked: alice', 'ok'] } },
          { text: 'Without a lock (local state, a backend with locking off) both apply. Bob writes serial 18 last and <b>overwrites</b> Alice\'s state: the subnet she created is now in the cloud but in no state.', nodes: ['state', 'res'], err: ['state'], warn: ['res'], badges: { state: ['lost update', 'err'], res: ['orphaned subnet', 'warn'] }, tone: 'err' },
          { text: 'Orphans cost money and are invisible to plan. Recover with an <code>import</code> block, then make the <b>lock mandatory</b> and run applies only from CI, one per state.', flow: ['git>ci', 'ci>state'], ok: ['state'], badges: { ci: 'import {}' }, tone: 'ok' }
        ]
      },
      {
        id: 'scale', title: 'At scale: the monolith state', tone: 'warn',
        steps: [
          { text: 'Three years in, one root module holds <b>6,000 resources</b> for every environment. A plan takes many minutes and hits API rate limits.', nodes: ['state', 'ci'], hot: ['ci'], badges: { ci: ['plan ~6 min', 'warn'] }, tone: 'warn' },
          { text: 'Everyone queues on <b>one lock</b>. A typo in a DNS change could, in the same apply, touch the production database: the <b>blast radius</b> is everything.', nodes: ['state', 'res'], err: ['res'], badges: { state: ['1 lock, 30 teams', 'err'] }, tone: 'err' },
          { text: 'Split state by <b>environment and component</b> (network, data, app) along change frequency and ownership. Pass values between them with outputs or data sources, never by sharing state writes.', nodes: ['state'], badges: { state: ['24 states', 'ok'] } },
          { text: 'Move resources without destroying them using <code>moved</code> blocks (same state) or <code>removed</code> + <code>import</code> (across states). Plans drop to seconds; locks stop colliding.', flow: ['git>ci', 'ci>state'], ok: ['state', 'ci'], tone: 'ok' }
        ]
      },
      {
        id: 'immutable', title: 'Immutable rollout instead of patching', tone: 'ok',
        steps: [
          { text: 'A new OS patch is due. The mutable way is SSH or a config tool patching each server in place; each one ends up a little different (a <b>snowflake</b>).', nodes: ['res'], warn: ['res'], badges: { res: ['patched in place', 'warn'] } },
          { text: 'Immutable way: CI builds a new <b>image</b> (Packer) and changes one variable, the AMI ID. The plan shows <code>-/+ replace</code>, not <code>~ update</code>.', flow: ['dev>git', 'git>ci'], badges: { ci: '-/+ launch template' } },
          { text: '<code>create_before_destroy</code> (or an autoscaling group instance refresh) brings new instances up, waits for health checks, then destroys the old ones.', flow: ['ci>cloud', 'cloud>res'], ok: ['res'], badges: { res: ['new image, healthy', 'ok'] } },
          { text: 'Rollback is the same move with the previous image ID. Servers are <b>cattle</b>: none of them carries hand-made state worth keeping.', nodes: ['res'], ok: ['res'], tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Each control is a real platform decision. Meter values are <em>illustrative</em> for a mid-size estate (a few thousand resources, 3 environments, several teams).',
      diagram: null,
      controls: [
        { id: 'tool', label: 'How infrastructure is changed', type: 'seg', value: 'iac', options: [
          { v: 'click', l: 'Click-ops (console)' }, { v: 'script', l: 'Imperative scripts (CLI/SDK)' }, { v: 'iac', l: 'Declarative IaC (plan/apply)' }, { v: 'gitops', l: 'IaC + continuous reconcile' }] },
        { id: 'layout', label: 'State layout', type: 'seg', value: 'env', options: [
          { v: 'mono', l: 'One monolith state' }, { v: 'env', l: 'Per environment' }, { v: 'comp', l: 'Per env × component' }] },
        { id: 'drift', label: 'Drift handling', type: 'seg', value: 'detect', options: [
          { v: 'ignore', l: 'Ignore (find at next apply)' }, { v: 'detect', l: 'Detect + alert (scheduled plan)' }, { v: 'auto', l: 'Auto-revert' }] },
        { id: 'policy', label: 'Policy as code in the pipeline', type: 'seg', value: 'on', options: [
          { v: 'off', l: 'Off (review only)' }, { v: 'on', l: 'On (OPA / Sentinel / Checkov)' }] }
      ],
      evaluate(s) {
        const c = (x) => Math.max(0.03, Math.min(0.97, x));
        const T = s.tool, L = s.layout, D = s.drift, P = s.policy === 'on';
        const code = T === 'iac' || T === 'gitops';
        const effD = T === 'gitops' ? 'auto' : D;
        const repro = { click: 0.08, script: 0.4, iac: 0.85, gitops: 0.92 }[T] - (code && effD === 'ignore' ? 0.15 : 0);
        const blast = code ? { mono: 0.15, env: 0.55, comp: 0.88 }[L] : { click: 0.5, script: 0.3 }[T];
        let speed = { click: 0.7, script: 0.6, iac: 0.6, gitops: 0.62 }[T];
        if (code) speed += { mono: -0.3, env: 0, comp: 0.15 }[L] + (P ? -0.03 : 0);
        let driftR = code ? { ignore: 0.3, detect: 0.7, auto: 0.88 }[effD] : (T === 'click' ? 0.05 : 0.15);
        const comp = (code ? 0.55 : T === 'script' ? 0.25 : 0.05) + (P ? 0.35 : 0) + (code && effD !== 'ignore' ? 0.05 : 0);
        const plan = code ? { mono: ['many minutes, one lock queue', 0.2], env: ['1–3 min', 0.6], comp: ['seconds per state', 0.9] }[L] : ['no plan: changes are blind', 0.1];
        const metrics = [
          { k: 'Reproducibility', v: repro > 0.8 ? 'rebuild from code' : repro > 0.5 ? 'mostly, with surprises' : repro > 0.3 ? 'scripts rot, partial' : 'tribal memory', s: c(repro) },
          { k: 'Blast radius', v: code ? { mono: 'one apply touches everything', env: 'one environment', comp: 'one component' }[L] : T === 'click' ? 'one click, but unreviewed' : 'whatever the script hits', s: c(blast) },
          { k: 'Change speed', v: speed > 0.65 ? 'fast' : speed > 0.45 ? 'steady, reviewed' : 'slow: big plans, lock queue', s: c(speed) },
          { k: 'Drift risk', v: !code ? 'drift is the norm' : { ignore: 'found at next apply (surprise revert)', detect: 'found within an interval', auto: 'reverted within minutes' }[effD], s: c(driftR) },
          { k: 'Compliance', v: comp > 0.8 ? 'blocked before apply + audit trail' : comp > 0.5 ? 'audit trail, human review' : 'after-the-fact audits', s: c(comp) },
          { k: 'Plan time', v: plan[0], s: plan[1] }
        ];
        const notes = [];
        if (T === 'click') notes.push('Console changes are fast for one person once. Nothing records <b>why</b>, staging and prod diverge, and a rebuild after a region loss means guessing.');
        if (T === 'script') notes.push('Imperative scripts say <b>how</b> ("create subnet"), not <b>what</b>. Run twice they fail or duplicate; they cannot compute a diff against reality.');
        if (code && L === 'mono') notes.push('One state file means one lock, slow plans and an apply that can touch the database while you change DNS. Split by environment and component.');
        if (code && L === 'comp') notes.push('Per-component states need explicit wiring (outputs, data sources, or Terragrunt / Stacks). Keep the dependency graph shallow.');
        if (T === 'iac' && D === 'ignore') notes.push('Ignored drift is found at the next apply, which <b>silently reverts</b> someone\'s hotfix, often in the middle of a different change.');
        if (T === 'iac' && D === 'auto') notes.push('Auto-revert with plain Terraform means unattended applies; restrict it to safe attributes or run it as a reviewed PR, or a break-glass fix may be undone mid-incident.');
        if (T === 'gitops') notes.push('A reconciler (Crossplane, a Kubernetes operator, or an automated apply loop) corrects drift continuously. Give it a pause switch for incidents.');
        if (!P) notes.push('Without policy as code, a public bucket or open SSH rule relies on a reviewer spotting one line in a 300-line plan.');
        let verdict;
        if (T === 'click') verdict = '❌ <b>Click-ops:</b> not reproducible, not reviewable, drift by design. Fine for a sandbox, not for production.';
        else if (T === 'script') verdict = '⚠ <b>Scripts beat clicks</b>, but without state and a plan you cannot see drift or the effect of a change before it happens.';
        else if (L === 'mono') verdict = '⚠ <b>Right tool, wrong layout:</b> a monolith state gives every apply the whole estate as blast radius. Split it.';
        else if (effD === 'ignore') verdict = '⚠ <b>Open loop:</b> code describes the past, not reality. Add a scheduled <code>plan -detailed-exitcode</code>.';
        else if (P && L === 'comp' && effD !== 'ignore') verdict = '✅ <b>Mature IaC:</b> small states, plans checked by policy, drift found or reverted quickly. Say this in the interview.';
        else if (!P) verdict = '👍 <b>Solid IaC</b>, but compliance depends on reviewers reading plans. Add OPA/Conftest or Sentinel.';
        else verdict = '👍 <b>Good setup.</b> Per-component state would shrink blast radius and plan time further.';
        const hide = [];
        if (!code) hide.push('state', 'mods', 'drift');
        if (!P) hide.push('opa');
        if (code && effD === 'ignore') hide.push('drift');
        const labels = {
          ci: { click: { label: 'Nothing', sub: 'no pipeline' }, script: { label: 'Script runner', sub: 'bash · SDK' }, iac: { label: 'CI runner', sub: 'plan → policy → apply' }, gitops: { label: 'Reconciler', sub: 'continuous apply' } }[T],
          state: { label: 'State backend', sub: { mono: '1 state', env: '1 per env', comp: 'per env × comp' }[L] },
          drift: { label: effD === 'auto' ? 'Auto-revert' : 'Drift check', sub: effD === 'auto' ? 'reconcile loop' : 'scheduled plan' }
        };
        const flow = T === 'click' ? ['console>res'] : ['dev>git', 'git>ci'];
        if (code) flow.push('ci>state', P ? 'opa>ci' : 'mods>ci', 'ci>cloud', 'cloud>res');
        else if (T === 'script') flow.push('ci>cloud', 'cloud>res');
        if (code && effD !== 'ignore') flow.push('drift>cloud', effD === 'auto' ? 'drift>state' : 'drift>git');
        const badges = {};
        if (code) badges.state = [{ mono: '1 lock, 6k res', env: '3 states', comp: '24 states' }[L], L === 'mono' ? 'err' : 'ok'];
        if (P) badges.opa = ['deny public', 'ok'];
        if (!code) badges.res = ['snowflake', 'err'];
        return {
          metrics, verdict, notes: notes.slice(0, 4), labels, hide, flow, badges,
          err: T === 'click' ? ['res'] : [], warn: code && L === 'mono' ? ['state'] : [],
          hot: code && L === 'mono' ? ['ci'] : [], ok: code && P && L !== 'mono' ? ['res'] : []
        };
      }
    },

    widget: {
      title: 'Plan / apply simulator: drift, locks and replacements',
      caption: 'Three columns: what the <b>code</b> says, what the <b>state</b> file remembers, and what really exists in the <b>cloud</b>. Make a console click, run <b>plan</b> to see the diff (+ / ~ / -), then <b>revert</b> or <b>codify</b>. Try two engineers applying at once with the lock on and off, and compare an in-place update with an immutable replacement.'
    },

    realWorld: {
      intro: 'The ideas are older than the tools: Fowler\'s 2012 bliki entries named the problem, and the tools since have mostly changed where state lives and how drift is found.',
      timeline: [
        { when: '2012–13', who: 'Martin Fowler / Kief Morris', title: 'Snowflake, Phoenix and Immutable servers', text: 'A <b>snowflake server</b> is hand-tuned until nobody can reproduce it. A <b>phoenix server</b> is burned down and rebuilt regularly to fight <b>configuration drift</b>, "ad-hoc changes to a systems configuration that go unrecorded". The <b>immutable server</b> (2013) is the logical end: never modify a deployed server, only replace it.', src: 0 },
        { when: '2016', who: 'Randy Bias', title: 'The history of pets vs cattle', text: 'Bias credits the analogy to Microsoft\'s Bill Baker and clarifies the point is <b>disposability</b>: pets are unique and nursed back to health, cattle are interchangeable and replaced. Common misreading: it is not "stateless vs stateful".', src: 3 },
        { when: 'Nov 2018', who: 'AWS', title: 'CloudFormation drift detection', text: 'CloudFormation added detection of configuration changes made to stack resources <b>outside CloudFormation</b> (console, CLI, SDKs), reporting each resource as in sync or modified, plus an AWS Config rule to check stacks for drift.', src: 4 },
        { when: '2021–23', who: 'HashiCorp', title: 'moved, import and test as first-class language', text: '<code>moved</code> blocks (Terraform 1.1) let you refactor addresses without destroy/create. Terraform 1.5 added config-driven <code>import</code> blocks with <code>-generate-config-out</code>, and 1.6 shipped the <code>terraform test</code> framework for HCL unit and integration tests.', src: 6 },
        { when: 'Aug 2023', who: 'HashiCorp', title: 'Terraform moves to the Business Source License', text: 'On 10 August 2023 HashiCorp announced future releases of Terraform and its other products would use <b>BSL 1.1</b> instead of MPL 2.0. The BSL is source-available, not an OSI open-source licence; it restricts offering competing products.', src: 8 },
        { when: 'Sept 2023 → Jan 2024', who: 'Linux Foundation', title: 'OpenTofu fork, then GA', text: 'After the OpenTF manifesto, the Linux Foundation launched <b>OpenTofu</b> as an open-source Terraform alternative (20 Sept 2023). OpenTofu 1.6 went GA on 10 January 2024 as a drop-in replacement for Terraform 1.6; later releases added features such as client-side state encryption.', src: 9 },
        { when: '2024–25', who: 'HashiCorp', title: 'S3 native state locking', text: 'S3 backend locking via <code>use_lockfile = true</code> arrived as experimental in Terraform 1.10 and GA in 1.11, writing a lock file next to the state. The DynamoDB-based lock arguments are <b>deprecated</b>; both can be set during migration.', src: 10 },
        { when: 'ongoing', who: 'HashiCorp', title: 'HCP Terraform health assessments', text: 'HCP Terraform runs periodic <b>drift detection</b> and continuous validation per workspace. It only covers resources and attributes Terraform manages: a hand-made resource nobody imported is invisible to it.', src: 11 },
        { when: 'Oct–Nov 2025', who: 'CNCF', title: 'Crossplane graduates', text: 'Crossplane, a Kubernetes-based control plane that <b>continuously reconciles</b> cloud resources (no plan/apply step), moved to CNCF Graduated status. Pulumi takes another route: general-purpose languages (TypeScript, Python, Go, .NET, Java) with an on-demand preview/refresh.', src: 12 },
        { when: '2016 → 2025', who: 'Kief Morris (Thoughtworks)', title: 'Infrastructure as Code, 3rd edition', text: 'The standard book on the practice; the 3rd edition (O\'Reilly, 2025) widens from tools to how infrastructure design supports an organisation\'s goals: foundations, design and delivery.', src: 2 }
      ],
      lessons: [
        'Make the <b>pipeline the only writer</b>; humans get read-only plus logged break-glass.',
        'Run <b>plan on a schedule</b>; drift found in hours is a ticket, drift found at the next apply is an incident.',
        'Split <b>state by environment and component</b>; it bounds blast radius, plan time and lock contention.',
        'Prefer <b>replace over patch</b> for compute; keep data stores mutable but protected (<code>prevent_destroy</code>, backups).',
        'Licences are architecture: the 2023 BSL change made <b>tool choice</b> a build-vs-buy decision.'
      ],
      sources: [
        { title: 'Phoenix Server', url: 'https://www.martinfowler.com/bliki/PhoenixServer.html', pub: 'Martin Fowler, bliki (2012)' },
        { title: 'Immutable Server', url: 'https://martinfowler.com/bliki/ImmutableServer.html', pub: 'Kief Morris on martinfowler.com bliki (2013)' },
        { title: 'Infrastructure as Code, 3rd edition', url: 'https://www.thoughtworks.com/insights/books/infrastructure-as-code-3rd-ed', pub: 'Kief Morris, O\'Reilly / Thoughtworks (2025)' },
        { title: 'The History of Pets vs Cattle and How to Use the Analogy Properly', url: 'https://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/', pub: 'Randy Bias, Cloudscaling (2016)' },
        { title: 'AWS CloudFormation Now Supports Drift Detection', url: 'https://aws.amazon.com/about-aws/whats-new/2018/11/aws-cloudformation-now-supports-drift-detection', pub: 'AWS What\'s New (Nov 2018)' },
        { title: 'Snowflake Server', url: 'https://martinfowler.com/bliki/SnowflakeServer.html', pub: 'Martin Fowler, bliki (2012)' },
        { title: 'Terraform 1.5 brings config-driven import and checks', url: 'https://hashicorp.com/ar/blog/terraform-1-5-brings-config-driven-import-and-checks', pub: 'HashiCorp blog (2023)' },
        { title: 'Terraform 1.6 adds a test framework for enhanced code validation', url: 'https://www.hashicorp.com/blog/terraform-1-6-adds-a-test-framework-for-enhanced-code-validation', pub: 'HashiCorp blog (2023)' },
        { title: 'The HashiCorp BSL move (coverage)', url: 'https://lwn.net/Articles/942346', pub: 'LWN.net (Aug 2023)' },
        { title: 'Linux Foundation Launches OpenTofu', url: 'https://www.linuxfoundation.org/press/announcing-opentofu', pub: 'Linux Foundation press release (Sept 2023)' },
        { title: 'Backend type: s3', url: 'https://developer.hashicorp.com/terraform/language/backend/s3', pub: 'HashiCorp Terraform docs' },
        { title: 'Health assessments (drift detection)', url: 'https://developer.hashicorp.com/terraform/enterprise/workspaces/health', pub: 'HashiCorp docs' },
        { title: 'CNCF announces graduation of Crossplane', url: 'https://www.cncf.io/announcements/2025/11/06/cloud-native-computing-foundation-announces-graduation-of-crossplane/', pub: 'CNCF (Nov 2025)' }
      ]
    },

    tradeoffs: {
      headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
      rows: [
        ['Style', '<b>Declarative</b> (Terraform, CloudFormation): desired end state, tool computes the diff', '<b>Imperative</b> (CLI scripts, SDK calls): explicit steps', 'Declarative for long-lived infrastructure; imperative only for one-off operations or glue the tool cannot express'],
        ['Language', '<b>DSL</b> (HCL, YAML): constrained, easy to review and lint', '<b>General-purpose</b> (Pulumi, CDK): loops, types, unit tests, IDEs', 'DSL when many teams must read each other\'s code; GPL when a platform team builds rich abstractions and already tests software well'],
        ['Server lifecycle', '<b>Mutable</b>: patch in place (config management)', '<b>Immutable</b>: bake an image, replace instances', 'Immutable for stateless compute; mutable-but-codified for data stores you cannot cheaply replace'],
        ['State layout', '<b>Few large states</b>: simple wiring', '<b>Many small states</b> per env × component', 'Split along ownership and change rate once plans pass ~2 minutes or teams queue on the lock (<em>rule of thumb</em>)'],
        ['Drift response', '<b>Revert</b>: code wins, re-apply', '<b>Codify</b>: change was right, update code', 'Revert by default (especially security changes); codify when the change was a deliberate, approved fix'],
        ['Engine', '<b>Run-on-demand</b> (Terraform / OpenTofu / Pulumi)', '<b>Continuous reconcile</b> (Crossplane, operators)', 'Reconcile when you already run Kubernetes as a control plane and want drift corrected automatically; on-demand when you want an explicit reviewed plan']
      ]
    },
    failures: [
      { f: 'Silent drift from console hotfixes', detect: 'Scheduled <code>plan -detailed-exitcode</code> returns 2; CloudTrail shows writes not made by the CI role', fix: 'Revert or codify within an SLA; restrict console write access to break-glass roles with alerts.' },
      { f: 'Concurrent applies corrupt state', detect: 'Resources exist that no state knows (orphans); state serial jumped or lineage mismatch errors', fix: 'Remote backend with mandatory locking; applies only from CI with one job per state; recover orphans with <code>import</code> blocks.' },
      { f: 'Secrets leaked through state', detect: 'Secret scanning of state buckets; DB passwords visible in <code>terraform show</code>', fix: 'Encrypt state, restrict read access, let the database manage its own password (e.g. a managed master password) or use ephemeral values, so secrets never pass through Terraform.' },
      { f: 'Accidental destroy of a data store', detect: 'Plan shows <code>-/+</code> or <code>-</code> on a database or bucket; policy flags deletes', fix: '<code>prevent_destroy</code>, deletion protection on the resource, a policy that requires a second approver for any delete, backups tested by restore.' },
      { f: 'Monolith state: slow plans and huge blast radius', detect: 'Plan duration trending up, API throttling, lock wait time in CI', fix: 'Split by environment and component with <code>removed</code> + <code>import</code> or state moves; wire with outputs.' },
      { f: 'Environment divergence (copy-paste folders)', detect: 'Diffing dev/staging/prod roots shows more than input differences', fix: 'One versioned module per component, thin per-environment roots, promote the same module version through environments.' },
    ],

    interview: [
      { q: 'Declarative vs imperative infrastructure: what is the difference and why does it matter?', a: '<p><b>Declarative</b> code states the end result ("this bucket exists, versioned, private"). The tool reads reality, computes a diff and applies only what is missing. Running it twice changes nothing: it is <b>idempotent</b>.</p><p><b>Imperative</b> code lists steps ("create bucket, enable versioning"). It has no memory of what exists, so reruns fail or duplicate, and it cannot show what a change will do.</p><p>Common misreading: Pulumi and CDK are imperative languages but a <b>declarative engine</b>: the program builds a desired-state graph that the engine diffs.</p>', lvl: 'core' },
      { q: 'What is the Terraform state file for, and how do you store it in a team?', a: '<p>State maps each resource address in code to a <b>real ID</b> and its last known attributes. Terraform needs it to know what it owns, to compute diffs, and to order deletes.</p><p>In a team: a <b>remote backend</b> (S3, GCS, azurerm, HCP Terraform) with <b>versioning</b>, <b>encryption</b>, restricted access and a <b>lock</b>. On S3 since Terraform 1.10/1.11 that is <code>use_lockfile = true</code>; the DynamoDB table is deprecated. One state per root module; applies from CI only.</p>', fu: 'What do serial and lineage protect against?', lvl: 'core' },
      { q: 'What is configuration drift, and how do you detect it?', a: '<p>Drift is any difference between desired state (code) and real infrastructure. Fowler\'s 2012 Phoenix Server entry calls it "ad-hoc changes to a systems configuration that go unrecorded". Causes: console clicks, emergency hotfixes, other tools or autoscalers touching the same attributes, provider defaults changing.</p><p>Detect: run <code>terraform plan -detailed-exitcode</code> (or <code>-refresh-only</code>) on a schedule per state; exit 0 = clean, 2 = diff, 1 = error. Or use HCP Terraform health assessments, CloudFormation drift detection, or a continuous reconciler. Pair it with CloudTrail to find <b>who</b>.</p>', fu: 'What can plan not see?', lvl: 'core' },
      { q: 'You found drift. Do you revert it or codify it?', a: '<p><b>Default is revert</b>: the code was reviewed, the click was not. Security-relevant drift (open ports, public access, IAM) is always reverted first and discussed after.</p><p><b>Codify</b> when the change was a correct, deliberate fix, e.g. a capacity bump during an incident. Open a PR that matches reality so the next plan is clean.</p><p>Either way, fix the cause: who could click, and why was the pipeline too slow for the hotfix?</p>', lvl: 'core' },
      { q: 'Mutable vs immutable infrastructure: explain phoenix servers and "cattle not pets".', a: '<p><b>Mutable</b>: servers are patched in place; over time each becomes a unique <b>snowflake</b>. <b>Phoenix server</b> (Fowler, 2012): burn servers down and rebuild them from code regularly so drift cannot accumulate. <b>Immutable server</b> (2013): never modify a deployed server, only replace it from a new image.</p><p>"Pets vs cattle" (Randy Bias, crediting Bill Baker): pets are unique and nursed back to health, cattle are identical and replaced. The point is <b>disposability</b>, not statelessness: databases still need care, so keep data stores mutable but codified and protected.</p>', lvl: 'core' },
      { q: 'How do you lay out state for 3 environments and 10 teams?', a: '<ul><li>One <b>module</b> per component (network, data, service), versioned in a registry.</li><li>One <b>root module and state per environment × component</b>, e.g. <code>prod/network</code>, <code>prod/data</code>, owned by one team each.</li><li>Wire with outputs / data sources, not shared writes. Keep the dependency graph shallow (network → data → app).</li><li>Promote the same module version dev → staging → prod.</li></ul><p>Workspaces (CLI) are fine for identical short-lived copies, but separate roots and backends per environment give stronger isolation (different credentials, different approvers).</p>', fu: 'When are CLI workspaces the right choice?', lvl: 'deep' },
      { q: 'How do you refactor or adopt existing resources without destroying them?', a: '<p><b>Rename or move into a module</b>: a <code>moved</code> block (Terraform 1.1+) tells plan the address changed, so it updates state instead of destroy/create.</p><p><b>Adopt click-ops resources</b>: an <code>import</code> block (1.5+) plus <code>terraform plan -generate-config-out=gen.tf</code> drafts the config; review until the plan shows no changes.</p><p><b>Move across states</b>: <code>removed { lifecycle { destroy = false } }</code> in the old root and <code>import</code> in the new one.</p>', lvl: 'deep' },
      { q: 'How do you keep secrets out of Terraform state?', a: '<p>State stores every attribute in plain JSON, including a DB password you passed in. So: <b>do not pass secrets through Terraform</b>. Let the service generate and keep them (e.g. RDS managed master password in Secrets Manager), or have the app read them from Vault at runtime.</p><p>Where unavoidable: encrypt the state, restrict who can read it, mark values <code>sensitive</code> (hides output only, not state), and use ephemeral values where your version supports them. OpenTofu adds client-side state encryption.</p>', lvl: 'deep' },
      { q: 'Where does policy as code fit, and which tools would you use?', a: '<p>Between plan and apply. Convert the plan to JSON (<code>terraform show -json</code>) and evaluate rules: no public buckets, no 0.0.0.0/0 on admin ports, encryption on, tags present, instance types allowed.</p><p>Tools: <b>OPA / Conftest</b> (Rego, tool-agnostic), <b>Sentinel</b> (HCP Terraform / Enterprise), <b>Checkov</b> or similar static scanners on the code. Use advisory mode first, then hard-fail. Add cloud-side guardrails too (SCPs, S3 Block Public Access) because IaC is not the only writer.</p>', lvl: 'core' },
      { q: 'Terraform, OpenTofu, Pulumi, CDK or Crossplane: how do you choose?', a: '<ul><li><b>Terraform</b>: biggest provider ecosystem; BSL licence since Aug 2023 matters if you build a competing product.</li><li><b>OpenTofu</b>: MPL fork under the Linux Foundation, drop-in at the 1.6 fork point, open governance.</li><li><b>Pulumi / AWS CDK</b>: general-purpose languages and unit tests; CDK synthesises CloudFormation and is AWS-only.</li><li><b>CloudFormation</b>: AWS-managed state and rollbacks, no state file to run.</li><li><b>Crossplane</b>: Kubernetes control plane with continuous reconciliation; worth it if you already run a platform on Kubernetes.</li></ul><p>Decide on team skills, clouds, governance and licence, as a <a href="build-vs-buy.html">build vs buy</a> decision; switching later is a migration.</p>', lvl: 'core' },
      { q: 'How would you test infrastructure code?', a: '<ul><li><b>Static</b>: <code>fmt</code>, <code>validate</code>, tflint, Checkov/Conftest on every PR.</li><li><b>Unit-ish</b>: <code>terraform test</code> (1.6+) with <code>command = plan</code> and mocked providers to assert module logic cheaply.</li><li><b>Integration</b>: <code>terraform test</code> with apply in a sandbox account, or <b>Terratest</b> (Go) to deploy, probe (HTTP, SSH) and destroy.</li><li><b>Production</b>: the drift check is a continuous test that reality still matches code.</li></ul>', lvl: 'deep' },
      { q: 'Tell me about a time you moved a team off click-ops onto IaC.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: ~400 hand-made AWS resources, staging differed from prod, an open security group found by an audit. <b>Task</b>: get to reviewed, reproducible infrastructure without a freeze. <b>Action</b>: imported prod component by component with <code>import</code> blocks until plans were clean, split state per environment and component, made CI the only writer with OIDC, added a nightly drift check and Conftest rules, and kept a logged break-glass role. <b>Result</b>: a full staging rebuild from code in about two hours, drift tickets down from several a week to one or two a month, and the next audit traced every change to a PR.</p>', lvl: 'core' }
    ],

    code: [
      {
        title: 'Terraform: root module with S3 native locking + versioned module', lang: 'bash',
        code: `# envs/prod/data/main.tf  (Terraform >= 1.11; OpenTofu also supports use_lockfile)
terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket       = "acme-tfstate-prod"          # versioned, encrypted, private bucket
    key          = "prod/data/terraform.tfstate" # one state per env x component
    region       = "eu-west-1"
    encrypt      = true
    use_lockfile = true   # writes prod/data/terraform.tfstate.tflock (S3 conditional write)
    # dynamodb_table = "tf-locks"  # deprecated; set both only while migrating
  }
}

provider "aws" {
  region = "eu-west-1"
  default_tags { tags = { env = "prod", owner = "team-data", managed_by = "terraform" } }
}

module "orders_db" {
  source  = "app.terraform.io/acme/postgres/aws"   # private registry, pinned
  version = "1.5.2"
  name             = "orders"
  instance_class   = "db.r6g.large"
  multi_az         = true
  manage_password  = true    # RDS keeps it in Secrets Manager: never in state
  network          = data.terraform_remote_state.network.outputs.private_subnets
}

moved {                       # refactor without destroy/create
  from = aws_db_instance.orders
  to   = module.orders_db.aws_db_instance.this
}`,
        note: '<code>use_lockfile</code> was experimental in 1.10 and GA in 1.11. Inside the module, put <code>lifecycle { prevent_destroy = true }</code> and <code>deletion_protection = true</code> on the database. Reading another state via <code>terraform_remote_state</code> needs read access to that bucket; an SSM parameter or data source lookup keeps teams more decoupled.'
      },
      {
        title: 'GitHub Actions: nightly drift check with -detailed-exitcode', lang: 'yaml',
        code: `name: drift-check
on:
  schedule: [{ cron: "17 3 * * *" }]   # nightly, off the hour
  workflow_dispatch:
permissions: { id-token: write, contents: read, issues: write }
jobs:
  plan:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: { stack: [prod/network, prod/data, prod/app] }
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: "arn:aws:iam::123456789012:role/tf-readonly", aws-region: eu-west-1 }
      - uses: hashicorp/setup-terraform@v3
        with: { terraform_wrapper: false }   # wrapper would hide exit code 2
      - name: plan
        working-directory: envs/\${{ matrix.stack }}
        run: |
          terraform init -input=false
          set +e
          terraform plan -input=false -lock=false -detailed-exitcode -no-color > plan.txt
          code=$?
          set -e
          echo "exit=$code"
          if [ "$code" -eq 1 ]; then exit 1; fi           # real error
          if [ "$code" -eq 2 ]; then
            gh issue create --title "Drift in \${{ matrix.stack }}" \\
              --label drift --body "$(tail -c 60000 plan.txt)"
          fi
        env: { GH_TOKEN: "\${{ github.token }}" }`,
        note: 'Exit 0 = no changes, 1 = error, 2 = changes present. Exit 2 also fires for <b>unapplied merged code</b>, not only drift; <code>plan -refresh-only -detailed-exitcode</code> isolates changes made outside Terraform. <code>-lock=false</code> is safe here because a read-only plan writes no state.'
      },
      {
        title: 'OPA / Conftest (Rego v1): deny public S3 buckets in the plan', lang: 'js',
        code: `# policy/s3_public.rego
# terraform show -json tfplan > plan.json && conftest test plan.json
package main

import rego.v1

changes contains rc if {
  some rc in input.resource_changes
  some a in rc.change.actions
  a in {"create", "update"}
}

deny contains msg if {
  some rc in changes
  rc.type == "aws_s3_bucket_acl"
  rc.change.after.acl in {"public-read", "public-read-write"}
  msg := sprintf("%s: public ACL '%s' is not allowed", [rc.address, rc.change.after.acl])
}

deny contains msg if {
  some rc in changes
  rc.type == "aws_s3_bucket_public_access_block"
  some flag in ["block_public_acls", "block_public_policy",
                "ignore_public_acls", "restrict_public_buckets"]
  rc.change.after[flag] == false
  msg := sprintf("%s: %s must be true", [rc.address, flag])
}

warn contains msg if {
  some rc in changes
  rc.type == "aws_s3_bucket"
  not rc.change.after.tags.owner
  msg := sprintf("%s: missing 'owner' tag", [rc.address])
}`,
        note: 'Uses OPA 1.0 syntax (<code>contains</code> / <code>if</code>); older examples write <code>deny[msg] { … }</code>. A bucket with <b>no</b> public access block resource at all is not caught here: pair the rule with account-level S3 Block Public Access, which also stops console clicks.'
      }
    ],

    related: ['gitops', 'twelve-factor', 'platform-engineering', 'secrets-kms', 'build-vs-buy', 'devsecops']
  });

  function ctxNum(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n)); }

  const a = SD.data.architecture;
  SD.data.knobs.diagram = { title: a.title, nodes: a.nodes, edges: a.edges };
})();
