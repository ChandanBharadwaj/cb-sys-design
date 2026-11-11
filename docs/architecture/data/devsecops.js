(function () {
/* triage workload model for the calculator */
function calc(v) {
  const alerts = v.deps / 1000 * v.rate;                 // new findings per month
  const manual = alerts * (1 - v.af / 100);              // not closed by an auto-merged update
  const triageH = manual * v.tri / 60;
  const real = manual * (1 - v.fp / 100);                // true positives that need a code change
  const FIX_H = 3;                                       // estimate: hours per manual fix
  const load = triageH + real * FIX_H;
  const rho = load / v.cap;
  const perItem = manual > 0 ? load / manual : 1;
  return { alerts, manual, triageH, real, load, rho, backlog: Math.max(0, (load - v.cap) / perItem) };
}

SD.register({
  slug: 'devsecops',
  domain: 7,
  title: 'DevSecOps & Supply Chain Security',
  examples: 'SLSA, Sigstore, CycloneDX',
  tagline: 'Your code is a few percent of what you ship. <b>Scan</b> what you write, <b>inventory</b> what you import (SBOM), <b>sign and attest</b> what you build, and <b>verify</b> it all before it runs.',
  tldr: {
    problem: 'Modern services are mostly third-party code, pulled from public registries and built by CI systems that hold production secrets. Attackers stopped breaking in through the front door and started poisoning the <b>supply chain</b>: a dependency, a build server, an uploader script.',
    idea: 'Put <b>automated gates</b> at each stage (secrets and SAST at commit, SCA on dependencies, image scanning, IaC scanning, DAST in staging), keep an <b>SBOM</b> per artefact, produce <b>signed provenance</b> (SLSA, in-toto, Sigstore) in CI, and let the cluster <b>admit only signed images</b> built by your pipeline.',
    insight: 'Scanners find <i>known bad</i> code; they do nothing against a trusted maintainer who ships a backdoor (xz) or a hacked build server (SolarWinds). Defence needs both <b>detection</b> (scan, SBOM) and <b>integrity</b> (pinning, private proxy, provenance, signature verification), and it fails if developers drown in false positives.',
    numbers: [
      { v: '35+', l: 'organisations Alex Birsan reached with dependency confusion in 2021 (his write-up)' },
      { v: 'CVSS 10.0', l: 'xz-utils backdoor CVE-2024-3094, in releases 5.6.0 and 5.6.1 (2024)' },
      { v: 'L1–L3', l: 'SLSA v1.0 Build track levels (OpenSSF, April 2023)' }
    ]
  },

  intro: {
    what: '<b>DevSecOps</b> means building security checks into the same automated pipeline that builds and deploys software, instead of a security review at the end. <b>Supply chain security</b> is the part that protects everything your software is made from: open-source libraries, base images, build tools and the build system itself. Together they answer: <b>is what we are about to run exactly what we meant to build, from parts we trust?</b>',
    analogy: {
      icon: '🥫',
      title: 'A food factory with labels and seals',
      text: 'A food factory checks every delivery of ingredients (<b>dependency scanning</b>), keeps an ingredient list on every package (<b>SBOM</b>), records which line and batch made it (<b>provenance</b>), and puts a tamper-evident seal on the lid (<b>signature</b>). The shop refuses any jar with a broken seal (<b>admission control</b>). Where it breaks down: a seal proves who packed the jar, not that the recipe was safe. A signed build of a backdoored library is still backdoored.'
    },
    problem: 'Your team installs <code>acme-auth</code>, an internal package from your company registry. An attacker publishes <code>acme-auth</code> version 99.0.0 on the public npm registry. Your build tool looks in both places, sees a higher version in public, and installs the attacker\'s code on a CI runner that holds your cloud credentials. No scanner flags it, because it has no known CVE. The question this topic answers is: <b>how do you trust code you did not write, built on machines you do not watch?</b>',
    story: [
      {
        stage: 'naive',
        title: 'Install from the internet, build, ship',
        text: 'The obvious pipeline: <code>npm install</code> or <code>mvn package</code> straight from public registries, build the image on a long-lived CI server, push it, deploy it. A security team runs a scan before each quarterly release.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Developer', sub: 'git push', kind: 'client', at: [70, 0] },
            { id: 'ci', label: 'CI server', sub: 'long-lived', kind: 'compute', at: [210, 0] },
            { id: 'pub', label: 'Public registry', sub: 'npm · Maven', kind: 'external', at: [350, 0] },
            { id: 'img', label: 'Image', sub: 'unsigned', kind: 'store', at: [210, 110] },
            { id: 'k8s', label: 'Production', sub: 'runs anything', kind: 'service', at: [210, 220] }
          ],
          edges: [{ from: 'dev', to: 'ci' }, { from: 'ci', to: 'pub' }, { from: 'ci', to: 'img' }, { from: 'img', to: 'k8s' }],
          flow: ['dev>ci', 'ci>pub', 'ci>img', 'img>k8s']
        }
      },
      {
        stage: 'breaks',
        title: 'Poisoned parts, no way to tell',
        text: 'A look-alike package and an internal name on the public registry both get installed. The CI server leaks its tokens. Months later a critical CVE lands in a logging library and nobody can say <b>which services contain it</b>, because there is no inventory.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Developer', sub: 'git push', kind: 'client', at: [70, 0] },
            { id: 'ci', label: 'CI server', sub: 'tokens stolen', kind: 'compute', at: [210, 0] },
            { id: 'pub', label: 'Public registry', sub: 'acme-auth 99.0', kind: 'external', at: [350, 0] },
            { id: 'img', label: 'Image', sub: 'contents unknown', kind: 'store', at: [210, 110] },
            { id: 'k8s', label: 'Production', sub: 'runs malware', kind: 'service', at: [210, 220] }
          ],
          edges: [{ from: 'dev', to: 'ci' }, { from: 'ci', to: 'pub', bidi: true }, { from: 'ci', to: 'img' }, { from: 'img', to: 'k8s' }],
          flow: ['ci>pub', 'pub>ci', 'ci>img', 'img>k8s'],
          err: ['pub', 'ci', 'k8s'],
          warn: ['img'],
          badges: { pub: ['malicious', 'err'], k8s: ['compromised', 'err'], img: ['no SBOM', 'warn'] }
        }
      },
      {
        stage: 'fix',
        title: 'Gate, inventory, sign, verify',
        text: 'Dependencies come only through a <b>private proxy</b> that owns internal names. Each build runs on a <b>fresh runner</b>, scans code and dependencies, writes an <b>SBOM</b>, and signs the image with a <b>provenance record</b>. The cluster runs only images whose signature it can verify.',
        scene: {
          nodes: [
            { id: 'dev', label: 'Developer', sub: 'git push', kind: 'client', at: [70, 0] },
            { id: 'ci', label: 'CI runner', sub: 'ephemeral · scans', kind: 'compute', at: [210, 0] },
            { id: 'pub', label: 'Private proxy', sub: 'scoped names', kind: 'store', at: [350, 0] },
            { id: 'img', label: 'Image', sub: 'SBOM · signed', kind: 'store', at: [210, 110] },
            { id: 'adm', label: 'Admission', sub: 'verify signature', kind: 'policy', at: [350, 110] },
            { id: 'k8s', label: 'Production', sub: 'signed only', kind: 'service', at: [210, 220] }
          ],
          edges: [{ from: 'dev', to: 'ci' }, { from: 'ci', to: 'pub' }, { from: 'ci', to: 'img' }, { from: 'img', to: 'adm' }, { from: 'adm', to: 'k8s' }],
          flow: ['dev>ci', 'ci>pub', 'ci>img', 'img>adm', 'adm>k8s'],
          ok: ['pub', 'img', 'adm', 'k8s'],
          badges: { adm: ['verified', 'ok'], img: ['provenance', 'ok'] }
        }
      }
    ],
    usedBy: ['Google (SLSA, Binary Authorization)', 'Kubernetes (signed releases, SBOMs)', 'npm and PyPI (Sigstore-based provenance)', 'GitHub (Dependabot, artifact attestations)', 'US federal software suppliers (EO 14028)', 'Linux distributions (reproducible builds)'],
    whenToUse: [
      'Any team that ships software built from <b>open-source dependencies</b>, which is nearly every team',
      'You sell to <b>regulated or government customers</b> who ask for SBOMs, attestations or SLSA levels',
      'Your CI system holds <b>production credentials</b>, so a compromised build is a compromised company'
    ],
    whenNot: [
      'Do not start with signing everything if you cannot yet say <b>what is deployed</b>: inventory (SBOM) and patching come first',
      'Do not use gates as a substitute for design review: logic flaws and missing authorisation are found by <a href="threat-modeling.html">Threat Modeling</a>, not scanners',
      'Do not block every build on every "high" finding on day one: a gate that fails all the time gets switched off; start with warn, then ratchet'
    ],
    glossary: [
      { term: 'SAST / DAST / IAST', def: 'Static analysis of source code; dynamic testing of a running app from outside; instrumented testing from inside the running app.' },
      { term: 'SCA', def: 'Software composition analysis: matching your dependency tree against vulnerability and malware databases.' },
      { term: 'SBOM', def: 'Software bill of materials: a machine-readable list of every component in an artefact, in SPDX or CycloneDX format.' },
      { term: 'VEX', def: 'Vulnerability Exploitability eXchange: a statement that a product is or is not affected by a given CVE, and why.' },
      { term: 'Provenance', def: 'A signed record of how an artefact was built: source commit, builder, inputs and output digest.' },
      { term: 'SLSA', def: 'Supply-chain Levels for Software Artifacts: an OpenSSF framework of levels for build integrity.' },
      { term: 'Keyless signing', def: 'Sigstore signing with a short-lived certificate tied to an OIDC identity (e.g. a CI workflow), logged in a public transparency log.' },
      { term: 'Dependency confusion', def: 'Tricking a build into installing a public package that has the same name as a private, internal one.' }
    ]
  },

  requirements: {
    functional: [
      '<b>Shift left and shift everywhere</b>: fast checks in the IDE and on every PR, deeper checks in CI, and continuous monitoring in production',
      'Every artefact has an <b>SBOM</b> stored next to it, and you can answer "where is library X version Y running?" in minutes',
      'Dependencies come from <b>one controlled path</b> (private proxy, scoped internal names, lockfiles with hashes)',
      'Builds run on <b>ephemeral, isolated runners</b> with <b>least-privilege, short-lived</b> tokens (OIDC, not stored secrets)',
      'Every image is <b>signed</b> and carries <b>provenance</b>; the cluster <b>verifies</b> both before admitting it',
      'Findings are <b>triaged once</b>: deduplicated, ranked by exploitability (KEV, EPSS, reachability), and suppressed with a VEX statement and an expiry'
    ],
    nonFunctional: [
      'Security gates add ≤ <b>5 minutes</b> to a PR build (<em>rule of thumb</em>); deep scans run in parallel or nightly',
      'False-positive rate developers see ≤ <b>20%</b>, or they stop reading alerts (<em>rule of thumb</em>)',
      'Mean time to remediate: critical, internet-facing ≤ <b>7 days</b>; high ≤ 30 days (typical policy, set your own)',
      'SBOM query "which services ship log4j-core &lt; 2.17.1?" answered in ≤ <b>1 hour</b>',
      '100% of production images signed and admitted by policy; exceptions are time-boxed and logged',
      'Build level: <b>SLSA Build L2</b> as a baseline, L3 for externally shipped artefacts'
    ],
    outOfScope: [
      '<b>Scan-and-dump</b>: a 4,000-row PDF of findings thrown over the wall to developers',
      '<b>Gate everything to block</b> on day one, so the gate is bypassed or disabled within a month',
      '<b>Signing without verifying</b>: signatures nobody checks at deploy time prove nothing',
      '<b>Floating versions</b> (<code>^1.2</code>, <code>latest</code>) resolved fresh from public registries on every build',
      'A <b>long-lived CI server</b> with admin cloud keys in environment variables'
    ]
  },

  calculator: {
    inputs: [
      { id: 'deps', label: 'Dependencies across services (direct + transitive)', min: 100, max: 20000, value: 3000, step: 100, log: true, fmt: 'num' },
      { id: 'rate', label: 'New scanner findings per 1,000 deps per month', min: 1, max: 60, value: 12 },
      { id: 'tri', label: 'Triage time per finding', min: 5, max: 120, value: 25, unit: 'min' },
      { id: 'af', label: 'Closed by auto-merged update (Renovate / Dependabot)', min: 0, max: 90, value: 30, unit: '%' },
      { id: 'fp', label: 'False positives / not affected', min: 0, max: 95, value: 60, unit: '%' },
      { id: 'cap', label: 'Engineer-hours per month for security fixes', min: 10, max: 600, value: 80, unit: 'h' }
    ],
    outputs: [
      { label: 'New findings per month', f: (v) => Math.round(calc(v).alerts) },
      { label: 'Need a human (not auto-fixed)', f: (v) => Math.round(calc(v).manual) },
      { label: 'Engineer-hours per month on triage alone', f: (v) => Math.round(calc(v).triageH) + ' h' },
      { label: 'Total hours: triage + real fixes (3 h each, estimate)', f: (v) => Math.round(calc(v).load) + ' h (' + Math.round(calc(v).rho * 100) + '% of capacity)' },
      { label: 'Mean time to remediate (queueing estimate)', f: (v) => { const r = calc(v).rho; return r >= 1 ? 'unbounded: backlog grows' : '≈ ' + Math.round(3 / (1 - r)) + ' days'; } },
      { label: 'Backlog growth per month', f: (v) => { const b = calc(v).backlog; return b > 0 ? '+' + Math.round(b) + ' findings' : 'stable (0)'; } }
    ],
    note: 'Model: findings = deps/1000 × rate; auto-merged updates close a share before anyone looks; every remaining finding costs triage time; the true positives also cost a fix (3 h, <em>estimate</em>). MTTR uses a simple queueing approximation, 3 days × 1/(1 − utilisation): at 80% utilisation it is 15 days, at 95% it is 60. The levers that actually move it: <b>auto-fix %</b> (good update automation) and <b>false-positive %</b> (reachability analysis, VEX, de-duplication). The finding rate is an <em>illustrative input</em>; measure your own from the scanner.'
  },

  api: [
    { m: 'YAML', p: '.github/workflows/release.yml', d: 'The pipeline as code: scan jobs, SBOM generation, <code>id-token: write</code> for keyless signing, and minimal <code>permissions</code> for every other job.' },
    { m: 'DOC', p: 'bom.cdx.json / *.spdx.json', d: 'The <b>SBOM</b> for one artefact: components with name, version, supplier, PURL and hashes, plus the dependency graph, author and timestamp (the NTIA minimum elements).' },
    { m: 'DOC', p: 'VEX statement (OpenVEX / CycloneDX)', d: 'Per CVE and product: <code>not_affected</code> + justification (e.g. vulnerable code not reachable), <code>affected</code> + action, <code>fixed</code>, or <code>under_investigation</code>.' },
    { m: 'EVENT', p: 'in-toto attestation (SLSA provenance)', d: 'Subject = image digest; predicate = builder id, source repo and commit, build parameters, resolved dependencies. Signed and stored next to the image in the OCI registry.' },
    { m: 'POLICY', p: 'Kyverno ClusterPolicy verifyImages', d: 'Which image references must be signed, by which <b>identity</b> (workflow URL) and <b>issuer</b> (OIDC provider), and which attestations must be present.' },
    { m: 'POLICY', p: 'Vulnerability SLA & exception policy', d: 'Severity × exposure → fix deadline; who may accept a risk, for how long, recorded where. Gate thresholds per stage (warn vs block).' }
  ],
  dataModel: [
    { name: 'sbom_component', store: 'Postgres / Dependency-Track', fields: [['artifact_digest', 'text', 'pk'], ['purl', 'text', 'pk'], ['name', 'text', 'idx'], ['version', 'text'], ['supplier', 'text'], ['sha256', 'text'], ['direct', 'bool'], ['service', 'text', 'idx']], note: 'One row per component per artefact. The Log4Shell question is <code>WHERE name = \'log4j-core\' AND version &lt; \'2.17.1\'</code> joined to what is deployed.' },
    { name: 'finding', store: 'Postgres', fields: [['id', 'uuid', 'pk'], ['artifact_digest', 'text', 'fk'], ['cve', 'text', 'idx'], ['severity', 'enum'], ['in_kev', 'bool'], ['epss', 'numeric'], ['reachable', 'bool'], ['status', 'enum'], ['vex_justification', 'text'], ['due_at', 'timestamptz', 'idx']], note: 'De-duplicated across scanners. Status: open, fixed, not_affected (with VEX), risk_accepted (with owner and expiry).' },
    { name: 'attestation', store: 'OCI registry + Rekor', fields: [['subject_digest', 'text', 'pk'], ['predicate_type', 'text', 'pk'], ['builder_id', 'text'], ['source_uri', 'text'], ['source_commit', 'text'], ['cert_identity', 'text'], ['rekor_log_index', 'bigint']], note: 'Provenance, SBOM and scan results attached as attestations to the same image digest.' }
  ],

  architecture: {
    title: 'A software supply chain with gates at every stage',
    nodes: [
      { id: 'dev', label: 'Developer', sub: 'IDE · pre-commit', kind: 'client', wide: [90, 50], tall: [70, 0], tip: 'Fast feedback: secrets scanning in a pre-commit hook, SAST and SCA hints in the IDE.' },
      { id: 'repo', label: 'Git repo / PR', sub: 'review · branch rules', kind: 'service', wide: [280, 50], tall: [210, 0], tip: 'Protected branches, required reviews, signed commits optional. PR checks run SAST, secrets and SCA on the diff.' },
      { id: 'ci', label: 'CI runner', sub: 'ephemeral · OIDC', kind: 'compute', wide: [480, 50], tall: [350, 105], tip: 'A fresh VM or container per job, destroyed after. Gets short-lived cloud credentials through OIDC instead of stored secrets.' },
      { id: 'scan', label: 'Scanners', sub: 'SAST · SCA · image', kind: 'policy', wide: [680, 50], tall: [350, 210], tip: 'Semgrep/CodeQL (SAST), Trivy/Grype (SCA and image), Checkov/tfsec (IaC), gitleaks (secrets). Gate policy: warn or block by severity.' },
      { id: 'sbom', label: 'SBOM + VEX store', sub: 'Dependency-Track', kind: 'store', wide: [880, 50], tall: [350, 315], tip: 'CycloneDX or SPDX per artefact, continuously re-matched against new CVEs. VEX records which CVEs do not apply.' },
      { id: 'pub', label: 'Public registries', sub: 'npm · Maven Central', kind: 'external', wide: [90, 170], tall: [70, 105], tip: 'Where typosquats, protestware and dependency-confusion packages live.' },
      { id: 'reg', label: 'Private proxy', sub: 'scoped internal names', kind: 'store', wide: [280, 170], tall: [210, 105], tip: 'Artifactory/Nexus/CodeArtifact. Internal names resolve only internally; public packages are cached, scanned and can be quarantined.' },
      { id: 'sign', label: 'Sigstore', sub: 'Fulcio · Rekor', kind: 'external', wide: [680, 170], tall: [210, 210], tip: 'Fulcio issues a short-lived certificate for the CI workflow identity; Rekor records the signature in a transparency log.' },
      { id: 'dast', label: 'Staging + DAST', sub: 'ZAP · IAST agent', kind: 'service', wide: [880, 170], tall: [210, 315], tip: 'Dynamic scanning against a running build: finds misconfigurations and injection that static tools miss.' },
      { id: 'oci', label: 'OCI registry', sub: 'image + attestations', kind: 'store', wide: [480, 290], tall: [70, 210], tip: 'Stores the image by digest, plus its signature, SBOM attestation and SLSA provenance.' },
      { id: 'adm', label: 'Admission control', sub: 'Kyverno verifyImages', kind: 'policy', wide: [680, 290], tall: [70, 315], tip: 'A Kubernetes admission webhook that checks the signature, signer identity and attestations before a pod is created.' },
      { id: 'k8s', label: 'Production', sub: 'Kubernetes', kind: 'service', wide: [880, 290], tall: [70, 420], tip: 'Only verified images run. Runtime monitoring and continuous SBOM matching catch what slipped through.' }
    ],
    edges: [
      { from: 'dev', to: 'repo' },
      { from: 'repo', to: 'ci' },
      { from: 'ci', to: 'reg' },
      { from: 'reg', to: 'pub', label: 'cache' },
      { from: 'ci', to: 'scan' },
      { from: 'scan', to: 'sbom' },
      { from: 'ci', to: 'sign' },
      { from: 'ci', to: 'oci' },
      { from: 'oci', to: 'adm' },
      { from: 'adm', to: 'sign', dashed: true, label: 'verify' },
      { from: 'adm', to: 'k8s' },
      { from: 'k8s', to: 'dast', dashed: true }
    ]
  },

  scenarios: [
    {
      id: 'happy', title: 'A clean, signed release', tone: 'info',
      steps: [
        { text: 'A developer pushes. The <b>pre-commit hook</b> finds no secrets; the PR runs SAST and SCA on the diff in about two minutes.', flow: ['dev>repo', 'repo>ci', 'ci>scan'], badges: { scan: ['0 new high', 'ok'] } },
        { text: 'The fresh runner resolves dependencies <b>only through the private proxy</b>, using the lockfile and its hashes.', flow: ['ci>reg'], ok: ['reg'], badges: { reg: 'hashes match' } },
        { text: 'The build writes a <b>CycloneDX SBOM</b>, scans the image with Trivy, and stores the SBOM for continuous matching.', flow: ['ci>scan', 'scan>sbom'], badges: { sbom: '412 components' } },
        { text: 'cosign signs the image <b>keyless</b>: Fulcio issues a certificate for the workflow identity, Rekor logs it. SBOM and provenance are attached as attestations.', flow: ['ci>sign', 'ci>oci'], ok: ['sign', 'oci'], badges: { oci: 'sig + 2 attestations' } },
        { text: 'On deploy, <b>Kyverno</b> checks the signature, the signer identity and the provenance before admitting the pod.', flow: ['oci>adm', 'adm>sign', 'adm>k8s'], ok: ['adm', 'k8s'], badges: { adm: ['verified', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'confusion', title: 'Dependency confusion attack', tone: 'err',
      steps: [
        { text: 'An attacker sees <code>acme-auth</code> in a leaked <code>package.json</code> and publishes <code>acme-auth@99.0.0</code> on public npm, with an install script that phones home.', nodes: ['pub'], err: ['pub'], badges: { pub: ['acme-auth 99.0', 'err'] } },
        { text: 'A legacy job resolves from <b>both</b> the internal and public registries. The resolver picks the <b>highest version</b>: the attacker\'s.', flow: ['ci>pub'], err: ['ci'], badges: { ci: ['postinstall runs', 'err'] }, labels: { reg: { label: 'Bypassed', sub: 'job uses both' } } },
        { text: 'The install script runs on the runner with its environment. SCA sees nothing: the package has <b>no CVE</b>, it is simply not ours.', nodes: ['scan'], warn: ['scan'], badges: { scan: ['no CVE → pass', 'warn'] }, tone: 'err' },
        { text: 'The fix: internal names live in a <b>scope</b> (<code>@acme/*</code>) that <code>.npmrc</code> maps to the private registry only, and the proxy refuses to fetch that scope from upstream.', flow: ['ci>reg'], ok: ['reg'], badges: { reg: ['@acme → internal only', 'ok'] } },
        { text: 'Defence in depth: ephemeral runner (nothing persists), OIDC tokens scoped to one job, and egress allow-lists so a postinstall script cannot reach the internet.', nodes: ['ci'], ok: ['ci'], badges: { ci: ['ephemeral · no egress', 'ok'] }, tone: 'ok' }
      ]
    },
    {
      id: 'log4shell', title: 'Log4Shell day: find it everywhere', tone: 'warn',
      steps: [
        { text: 'December 2021: CVE-2021-44228 in log4j-core 2.0-beta9 to 2.14.1. The first question from leadership: <b>which of our 600 services are affected?</b>', nodes: ['sbom'], warn: ['sbom'], badges: { sbom: ['CVE published', 'warn'] } },
        { text: 'With SBOMs stored per artefact, it is one query: components named <code>log4j-core</code> below the fixed version, joined to what is deployed. Answer in minutes, including <b>transitive</b> copies.', nodes: ['sbom', 'k8s'], ok: ['sbom'], badges: { sbom: ['38 artefacts', 'ok'] } },
        { text: 'Renovate opens upgrade PRs across repos; each one rebuilds, rescans and re-signs. Teams publish <b>VEX</b> "not_affected" for services that ship the jar but never log user input through it.', flow: ['repo>ci', 'ci>scan', 'ci>sign', 'ci>oci'], badges: { repo: '38 PRs' } },
        { text: 'An admission policy can temporarily <b>deny images whose SBOM attestation lists the vulnerable version</b>, so nobody redeploys an old build by accident.', flow: ['oci>adm', 'adm>k8s'], warn: ['adm'], badges: { adm: ['deny log4j < 2.17.1', 'warn'] }, tone: 'ok' }
      ]
    },
    {
      id: 'tamper', title: 'Tampered artefact and a backdoored upstream', tone: 'err',
      steps: [
        { text: 'An attacker with registry write access replaces <code>api:1.4</code> with a modified image. The tag now points to a new digest.', nodes: ['oci'], err: ['oci'], badges: { oci: ['tag swapped', 'err'] } },
        { text: 'Admission control looks for a signature on that digest from <b>our release workflow identity</b>. There is none, so the pod is <b>rejected</b>.', flow: ['oci>adm', 'adm>sign'], ok: ['adm'], err: ['oci'], badges: { adm: ['no valid signature', 'ok'] } },
        { text: 'Now the harder case, like <b>xz-utils 2024</b>: a trusted maintainer ships a backdoor in a signed, properly built upstream release. Our provenance is valid, our SBOM lists it, and scanners have no CVE yet.', nodes: ['pub', 'reg', 'sbom'], err: ['pub'], warn: ['reg', 'sbom'], badges: { pub: ['backdoored release', 'err'] }, tone: 'err' },
        { text: 'What still helps: <b>pinning</b> plus a cool-down before adopting new versions, a proxy that can <b>quarantine</b> a release, and an SBOM that lets you find and roll back every copy within hours once it is disclosed.', nodes: ['reg', 'sbom'], ok: ['reg', 'sbom'], badges: { reg: ['quarantine', 'ok'], sbom: ['find all copies', 'ok'] }, tone: 'warn' }
      ]
    },
    {
      id: 'scale', title: 'Alert fatigue at 400 repos', tone: 'warn',
      steps: [
        { text: 'Scanners are turned on everywhere in block-high mode. Week one: <b>thousands of findings</b>, most in test or unreachable code, many duplicates across SAST and SCA tools.', flow: ['repo>ci', 'ci>scan'], err: ['scan'], badges: { scan: ['builds red', 'err'] } },
        { text: 'Teams add <code>--skip</code> flags and mark everything "won\'t fix". Real issues hide in the noise; the gate has become theatre.', nodes: ['repo'], err: ['repo'], badges: { repo: ['gate bypassed', 'err'] } },
        { text: 'Reset: block only on <b>new</b> findings in the diff, on critical + known-exploited (CISA KEV), and on secrets. Everything else is a ticket with an SLA.', nodes: ['scan'], ok: ['scan'], badges: { scan: ['block: new crit / KEV', 'ok'] } },
        { text: 'Grouped, auto-merged patch updates and reachability analysis cut the human queue; VEX statements stop the same false positive reappearing. Ratchet thresholds up each quarter.', flow: ['scan>sbom'], ok: ['sbom', 'repo'], badges: { sbom: ['VEX suppressions', 'ok'] }, tone: 'ok' }
      ]
    }
  ],

  knobs: {
    intro: 'A mid-size org: 150 services, about 3,000 dependencies, 40 deploys a day. Meters are an <em>illustrative model</em> of the six threats in the widget below (CVE, leaked secret, typosquat, dependency confusion, unsigned image, tampered artefact).',
    controls: [
      { id: 'gates', label: 'Pipeline gates', type: 'seg', value: 'sca', options: [
        { v: 'none', l: 'None' }, { v: 'sca', l: 'SCA only' }, { v: 'full', l: 'SAST + SCA + secrets + image' }, { v: 'signed', l: '+ signing & provenance' }] },
      { id: 'policy', label: 'Gate policy', type: 'seg', value: 'warn', options: [
        { v: 'warn', l: 'Warn only' }, { v: 'crit', l: 'Block critical' }, { v: 'high', l: 'Block high+' }] },
      { id: 'reg', label: 'Registry setup', type: 'seg', value: 'public', options: [
        { v: 'public', l: 'Public, direct' }, { v: 'proxy', l: 'Private proxy, scoped names' }] },
      { id: 'upd', label: 'Update automation', type: 'seg', value: 'none', options: [
        { v: 'none', l: 'Manual' }, { v: 'bot', l: 'Dependabot PRs' }, { v: 'grouped', l: 'Renovate: grouped, auto-merge patches' }] }
    ],
    evaluate(s) {
      const G = { none: 0, sca: 1, full: 2, signed: 3 }[s.gates];
      const blockSev = { warn: 99, crit: 4, high: 3 }[s.policy];
      // threats: [name, severity (4 crit / 3 high), which control finds it]
      const T = [
        ['CVE in library', 3, G >= 1 ? 'scan' : null],
        ['Leaked secret', 3, G >= 2 ? 'scan' : null],
        ['Typosquat', 4, s.reg === 'proxy' ? 'proxy' : G >= 1 ? 'scan' : null],
        ['Dependency confusion', 4, s.reg === 'proxy' ? 'proxy' : null],
        ['Unsigned image', 3, G >= 3 ? 'adm' : null],
        ['Tampered artefact', 4, G >= 3 ? 'adm' : null]
      ];
      let blocked = 0, warned = 0;
      const missed = [];
      T.forEach(([n, sev, by]) => {
        if (!by) { missed.push(n); return; }
        if (by !== 'scan' || sev >= blockSev) blocked++; else warned++;
      });
      const caught = blocked + 0.4 * warned;
      const buildMin = [0, 1.5, 5, 6][G] + (s.reg === 'proxy' ? -0.5 : 0);
      let friction = (s.policy === 'high' ? 0.35 : s.policy === 'crit' ? 0.18 : 0.05) * (G === 0 ? 0 : G >= 2 ? 1.4 : 1);
      if (s.upd === 'bot') friction += 0.15; if (s.upd === 'grouped') friction += 0.05;
      friction = Math.min(1, friction);
      const mttr = s.upd === 'grouped' ? 6 : s.upd === 'bot' ? 18 : 60;
      const mttrV = G === 0 ? 'unknown (no scanning)' : '≈ ' + mttr + ' days';
      const comp = (G >= 1 ? 1 : 0) + (G >= 3 ? 2 : 0) + (s.policy !== 'warn' ? 1 : 0) + (s.reg === 'proxy' ? 1 : 0);
      const compV = G >= 3 && s.reg === 'proxy' ? 'SBOM + SLSA L2–3 evidence' : G >= 3 ? 'SBOM + provenance' : G >= 1 ? 'SBOM possible, no provenance' : 'nothing to show an auditor';
      const metrics = [
        { k: 'Threats stopped (of 6)', v: blocked + ' blocked · ' + warned + ' warned', s: caught / 6, hint: missed.length ? 'missed: ' + missed.join(', ') : 'all covered' },
        { k: 'Build time added', v: '+' + Math.max(0, buildMin).toFixed(1) + ' min', s: 1 - Math.max(0, buildMin) / 8 },
        { k: 'Developer friction', v: friction < 0.2 ? 'low' : friction < 0.45 ? 'moderate' : 'high: bypass risk', s: 1 - friction },
        { k: 'Mean time to remediate', v: mttrV, s: G === 0 ? 0.05 : mttr <= 7 ? 0.9 : mttr <= 20 ? 0.6 : 0.2 },
        { k: 'Compliance evidence', v: compV, s: comp / 5 },
        { k: 'Dependency-confusion exposure', v: s.reg === 'proxy' ? 'closed' : 'open', s: s.reg === 'proxy' ? 0.95 : 0.1 }
      ];
      const notes = [];
      if (s.policy === 'warn' && G > 0) notes.push('Warn-only gates <b>detect</b> but ship anyway. Fine for the first month while you tune noise; not as an end state.');
      if (s.policy === 'high' && s.upd === 'none') notes.push('Blocking on high with manual updates: every new CVE in an old dependency turns <b>unrelated</b> PRs red. Teams will look for the skip flag. Block on <b>new</b> findings, or automate updates.');
      if (s.reg === 'public') notes.push('No scanner catches dependency confusion: the package has no CVE. Only <b>resolution rules</b> (scopes, a proxy that owns internal names) close it.');
      if (G < 3) notes.push('Without signing and admission checks, anyone who can push to the image registry can change what runs in production.');
      if (s.upd === 'grouped') notes.push('Grouped patch updates with auto-merge (after tests pass) keep you near latest, so a CVE fix is usually a one-line bump instead of a major upgrade.');
      if (G >= 3 && s.reg === 'proxy' && s.policy !== 'warn') notes.push('Remaining gap: a <b>trusted</b> maintainer shipping a backdoor (xz-utils). Add release cool-downs and quarantine in the proxy.');
      let verdict;
      if (G === 0) verdict = '❌ <b>No gates.</b> You learn about compromises from the news, and cannot say what you run.';
      else if (G >= 3 && s.reg === 'proxy' && s.policy !== 'warn' && s.upd !== 'none') verdict = '✅ <b>Defence in depth:</b> scanning, controlled resolution, signed provenance verified at deploy, and automation that keeps the backlog small.';
      else if (friction >= 0.45) verdict = '⚠ <b>Strong on paper, fragile in practice:</b> high friction means gates get bypassed. Add update automation or block only on new findings.';
      else if (s.reg === 'public' || G < 3) verdict = '⚠ <b>Detection without integrity:</b> known CVEs are found, but malicious or tampered code walks past.';
      else verdict = '👍 <b>Good coverage.</b> Tighten the gate policy and automate updates to bring MTTR down.';
      const flow = ['dev>repo', 'repo>ci', s.reg === 'proxy' ? 'ci>reg' : 'ci>pub'].concat(G >= 1 ? ['ci>scan'] : []).concat(G >= 3 ? ['ci>sign', 'ci>oci', 'oci>adm', 'adm>k8s'] : ['ci>oci', 'oci>adm', 'adm>k8s']);
      return {
        metrics, verdict, notes, flow,
        hide: (s.reg === 'proxy' ? [] : ['reg']).concat(G >= 3 ? [] : ['sign']).concat(G >= 1 ? [] : ['sbom']),
        labels: {
          scan: { label: 'Scanners', sub: ['none', 'SCA', 'SAST·SCA·secrets·img', 'all + provenance'][G] + ' · ' + s.policy },
          adm: G >= 3 ? { label: 'Admission control', sub: 'verify sig + SLSA' } : { label: 'Admission', sub: 'no image checks' }
        },
        err: (s.reg === 'public' ? ['pub'] : []).concat(G < 3 ? ['adm'] : []),
        warn: s.policy === 'warn' && G > 0 ? ['scan'] : [],
        ok: (s.reg === 'proxy' ? ['reg'] : []).concat(G >= 3 ? ['adm', 'sign'] : []),
        badges: { k8s: [blocked + '/6 blocked', blocked >= 5 ? 'ok' : blocked >= 3 ? 'warn' : 'err'] }
      };
    }
  },

  widget: {
    title: 'Inject a threat into the pipeline',
    caption: 'Pick the gates, the policy and the registry, then <b>inject threats</b>. Each one travels commit → resolve → build → scan → sign → admit and stops at the first gate that really catches it. The checks are real: <b>Damerau-Levenshtein</b> distance for typosquats, <b>highest-version-wins</b> resolution for dependency confusion, and a <b>digest comparison</b> against the provenance subject for tampering.'
  },

  realWorld: {
    intro: 'Each incident below changed how the industry builds software, and each standard is a direct response. Every card links to its source.',
    timeline: [
      { when: 'Nov 2018', who: 'npm · event-stream', title: 'A maintainer hand-off goes wrong', text: 'The original maintainer gave publish rights to a volunteer, who added a dependency, <code>flatmap-stream</code>, with encrypted code that targeted the <b>Copay bitcoin wallet</b>. It was found by a user on 20 November 2018; the fix was to go back to event-stream 3.3.4.', src: 0 },
      { when: 'Dec 2020', who: 'SolarWinds · CISA', title: 'A build system is compromised', text: 'CISA\'s alert AA20-352A describes a supply chain compromise of a <b>DLL in SolarWinds Orion</b> products, signed and shipped through normal updates, as one initial access vector into government and private networks. The lesson: protect the <b>build</b>, not only the source.', src: 1 },
      { when: 'Feb 2021', who: 'Alex Birsan', title: 'Dependency confusion', text: 'Birsan published packages on public npm, PyPI and RubyGems with names of companies\' <b>internal</b> packages. Build tools preferred the public, higher-version copy. He reported reaching <b>more than 35 organisations</b>, including Apple, Microsoft and PayPal, all through bug bounty programmes.', src: 2 },
      { when: 'Apr 2021', who: 'Codecov', title: 'A CI uploader script is modified', text: 'Codecov disclosed that its <b>Bash Uploader</b> had been altered from 31 January 2021 to export CI environment variables (tokens, keys). It was noticed by a customer who checked the script\'s <b>SHA sum</b> against the published one: hash verification works.', src: 3 },
      { when: 'May–Jul 2021', who: 'US EO 14028 · NTIA', title: 'SBOMs become policy', text: 'Executive Order 14028 (12 May 2021), section 4, directed guidance on software supply chain security, including giving purchasers an SBOM. NTIA published <b>The Minimum Elements for an SBOM</b> on 12 July 2021: data fields, automation support, and practices and processes.', src: 4 },
      { when: 'Dec 2021', who: 'Apache Log4j · CISA', title: 'Log4Shell', text: 'CVE-2021-44228 in log4j-core <b>2.0-beta9 to 2.14.1</b> allowed remote code execution through JNDI lookups in logged strings. CISA issued Emergency Directive 22-02 on 17 December 2021. Organisations without inventories spent weeks finding transitive copies.', src: 5 },
      { when: 'Apr 2023', who: 'OpenSSF', title: 'SLSA v1.0 and CISA VEX', text: 'SLSA v1.0 reduced the framework to one <b>Build track with levels 1–3</b> (provenance exists; hosted build with signed provenance; hardened, isolated builder). The same month CISA published the <b>Minimum Requirements for VEX</b>.', src: 6 },
      { when: 'Mar 2024', who: 'xz-utils · Andres Freund', title: 'A multi-year maintainer takeover', text: 'A co-maintainer known as "Jia Tan" planted a backdoor in xz-utils <b>5.6.0 and 5.6.1</b>, hidden in release tarballs rather than the git repo, targeting sshd through liblzma. Freund noticed slow SSH logins and reported it on 29 March 2024; it got <b>CVSS 10.0</b> (CVE-2024-3094).', src: 8 },
      { when: '2024', who: 'Ecma · ISO', title: 'Both SBOM formats are standards', text: '<b>SPDX</b> is ISO/IEC 5962:2021; <b>CycloneDX</b> became ECMA-424 in June 2024. Both are accepted for EO 14028 purposes; most tools emit either.', src: 9 }
    ],
    lessons: [
      'Scanners find <b>known</b> vulnerabilities. Malicious and tampered code needs <b>integrity</b> controls: scoped resolution, pinning, hashes, signatures.',
      'Protect the <b>build system</b> like production: ephemeral runners, short-lived OIDC tokens, minimal permissions.',
      'An SBOM is worth most on the day a Log4Shell lands: keep one per artefact and make it queryable.',
      'A signature only matters if something <b>verifies</b> it, with a pinned identity, at deploy time.'
    ],
    sources: [
      { title: 'A post-mortem of the malicious event-stream backdoor', url: 'https://snyk.io/blog/a-post-mortem-of-the-malicious-event-stream-backdoor', pub: 'Snyk, 2018' },
      { title: 'AA20-352A: Advanced Persistent Threat Compromise of Government Agencies, Critical Infrastructure, and Private Sector Organizations', url: 'https://www.cisa.gov/uscert/ncas/alerts/aa20-352a', pub: 'CISA, Dec 2020 (archived)' },
      { title: 'Dependency Confusion: How I Hacked Into Apple, Microsoft and Dozens of Other Companies', url: 'https://medium.com/@alex.birsan/dependency-confusion-4a5d60fec610', pub: 'Alex Birsan, Feb 2021' },
      { title: 'Bash Uploader Security Update', url: 'https://about.codecov.io/security-update/', pub: 'Codecov, 15 Apr 2021' },
      { title: 'The Minimum Elements For a Software Bill of Materials (SBOM)', url: 'https://www.ntia.gov/report/2021/minimum-elements-software-bill-materials-sbom', pub: 'NTIA, 12 Jul 2021' },
      { title: 'Apache Log4j Vulnerability Guidance', url: 'https://cisa.gov/uscert/apache-log4j-vulnerability-guidance', pub: 'CISA, Dec 2021' },
      { title: 'SLSA v1.0: Security levels', url: 'https://slsa.dev/spec/v1.0/levels', pub: 'OpenSSF SLSA, Apr 2023' },
      { title: 'Minimum Requirements for Vulnerability Exploitability eXchange (VEX)', url: 'https://cisa.gov/sites/default/files/2023-04/minimum-requirements-for-vex-508c.pdf', pub: 'CISA, Apr 2023' },
      { title: 'The xz backdoor (CVE-2024-3094)', url: 'https://snyk.io/blog/the-xz-backdoor-cve-2024-3094/', pub: 'Snyk, Mar 2024' },
      { title: 'ECMA-424: CycloneDX Bill of Materials Specification', url: 'https://ecma-international.org/publications-and-standards/standards/ecma-424/', pub: 'Ecma International, 2024' },
      { title: 'Sigstore: Cosign signing overview', url: 'https://docs.sigstore.dev/cosign/signing/overview/', pub: 'Sigstore docs' },
      { title: 'Kyverno: Verify Images with Sigstore', url: 'https://kyverno.io/docs/writing-policies/verify-images/sigstore', pub: 'Kyverno docs' },
      { title: 'OpenSSF Scorecard', url: 'https://securityscorecards.dev', pub: 'OpenSSF' },
      { title: 'Software Supply Chain Security Guidance (EO 14028 4c/4d)', url: 'https://www.nist.gov/itl/executive-order-14028-improving-nations-cybersecurity/software-security-supply-chains', pub: 'NIST' }
    ]
  },

  tradeoffs: {
    headers: ['Decision', 'Option A', 'Option B', 'Pick when…'],
    rows: [
      ['Where to scan', '<b>Shift left</b>: IDE, pre-commit, PR diff; cheap fixes', '<b>Shift everywhere</b>: also registry, admission, runtime, continuous SBOM re-match', 'Both. New CVEs appear after you ship, so a pass at build time expires; re-match SBOMs daily.'],
      ['Gate policy', '<b>Warn</b>: no friction, easy to ignore', '<b>Block</b> on severity: real control, real friction', 'Block on <b>new</b> criticals, KEV entries and secrets; warn on the rest with an SLA. Ratchet up.'],
      ['Testing style', '<b>SAST</b>: whole codebase, early, noisy', '<b>DAST / IAST</b>: running app, fewer false positives, later and slower', 'SAST on every PR (diff only); DAST nightly on staging; IAST where you already run integration tests.'],
      ['Dependency source', '<b>Public registries direct</b>: zero setup', '<b>Private proxy</b> with scoped internal names and quarantine', 'Proxy as soon as you have any internal packages, or more than a handful of teams.'],
      ['Signing keys', '<b>Long-lived key</b> in KMS: works offline / air-gapped', '<b>Keyless</b> (Fulcio + Rekor): no key to leak, identity = workflow', 'Keyless for CI on public infrastructure; KMS keys or a private Sigstore for air-gapped or sensitive identities.'],
      ['Updating', '<b>Pin and update rarely</b>: stable, but big jumps later', '<b>Pin + bots</b>: frequent small bumps, needs good tests', 'Pin always; let Renovate/Dependabot bump with grouped, tested, auto-merged patches and a short cool-down.']
    ]
  },
  failures: [
    { f: 'Alert fatigue: gates bypassed', detect: 'Rising use of skip flags, findings older than SLA, "won\'t fix" without justification', fix: 'Block only on new and exploitable findings, de-duplicate across tools, VEX for not-affected, auto-fix where possible.' },
    { f: 'Dependency confusion / typosquat installed', detect: 'Packages resolved from public for internal names; unexpected install scripts; new egress from runners', fix: 'Scoped internal names, proxy that owns them, lockfiles with integrity hashes, disable install scripts where possible.' },
    { f: 'Leaked CI credential', detect: 'Secrets scanner hits, cloud API calls from unusual places, token use outside the job window', fix: 'OIDC short-lived tokens, minimal <code>permissions:</code>, ephemeral runners, rotate on any suspicion.' },
    { f: 'Signatures not verified', detect: 'Unsigned or foreign-signed images running; admission in audit mode only', fix: 'Enforce verifyImages with a pinned identity and issuer; deploy by digest, not tag.' },
    { f: 'SBOM drift: inventory does not match what runs', detect: 'SBOM generated from source, not the built image; missing for older releases', fix: 'Generate at build from the final artefact, attach as an attestation, re-scan deployed digests.' },
    { f: 'Compromised trusted upstream (xz-style)', detect: 'Unusual release artefacts (tarball ≠ tag), new maintainer, binary test fixtures, performance anomalies', fix: 'Cool-down before adopting new releases, prefer builds from source tags, OpenSSF Scorecard on critical deps, fast rollback by SBOM.' }
  ],

  interview: [
    { q: 'What do shift-left and shift-everywhere mean, and why is shift-left alone not enough?', a: '<p><b>Shift left</b> moves checks earlier (IDE, pre-commit, PR), where fixes are cheapest. <b>Shift everywhere</b> adds controls at every stage: registry, build, admission and runtime.</p><p>Left alone is not enough because <b>new CVEs are published after you ship</b> (Log4Shell hit code that passed every scan), and because some attacks happen <i>after</i> code review: in the build system (SolarWinds, Codecov) or the registry (tag swap). So you keep SBOMs and re-match them continuously, and verify signatures at deploy.</p>', lvl: 'core' },
    { q: 'Compare SAST, DAST, IAST and SCA.', a: '<ul><li><b>SAST</b>: analyses source or bytecode without running it. Early and broad, but noisy, and blind to configuration.</li><li><b>DAST</b>: attacks the running app over HTTP. Finds real, exploitable issues and misconfigurations, but late and with limited coverage.</li><li><b>IAST</b>: an agent inside the running app watches data flow during tests. Fewer false positives, needs a supported runtime.</li><li><b>SCA</b>: matches your dependencies against vulnerability (and malware) databases. Most of your code is dependencies, so this usually finds the most.</li></ul><p>Add <b>secrets</b>, <b>IaC</b> and <b>container image</b> scanning; each covers a different artefact.</p>', lvl: 'core' },
    { q: 'What is an SBOM, which formats exist, and what are the NTIA minimum elements?', a: '<p>A machine-readable inventory of an artefact\'s components and their relationships. Two main formats: <b>SPDX</b> (Linux Foundation, ISO/IEC 5962:2021, licence-compliance roots) and <b>CycloneDX</b> (OWASP, ECMA-424 since 2024, security roots, also carries VEX).</p><p>NTIA\'s July 2021 report, written under EO 14028, defines minimum elements in three areas: <b>data fields</b> (supplier, component name, version, other unique identifiers, dependency relationship, SBOM author, timestamp), <b>automation support</b> (machine-readable formats), and <b>practices and processes</b> (when and how SBOMs are made and shared).</p><p>Common misreading: an SBOM is not a security control. It is an inventory that makes response fast.</p>', lvl: 'core' },
    { q: 'What is VEX and why do you need it alongside an SBOM?', a: '<p>An SBOM tells a customer "this product contains library X 1.2". Their scanner then shows every CVE in X 1.2, most of which may not apply. <b>VEX</b> is the supplier\'s machine-readable statement per CVE: <code>not_affected</code> (with a justification such as "vulnerable code not in execute path"), <code>affected</code> (with action), <code>fixed</code> or <code>under_investigation</code>. CISA published minimum requirements for VEX in April 2023.</p><p>Internally it is how you suppress a false positive <b>once, with a reason and an owner</b>, instead of re-triaging it on every build.</p>', lvl: 'deep' },
    { q: 'Explain the SLSA v1.0 Build track levels.', a: '<ul><li><b>Build L1</b>: provenance exists, showing how the package was built. It may be unsigned; it prevents mistakes, not attacks.</li><li><b>Build L2</b>: builds run on a <b>hosted</b> build platform that generates and <b>signs</b> the provenance. Tampering after the build is detectable.</li><li><b>Build L3</b>: a <b>hardened</b> platform: builds are isolated from each other and the signing material is not reachable by user-defined build steps, so even a malicious build script cannot forge provenance.</li></ul><p>Misreading to avoid: SLSA v1.0 is about <b>build integrity</b>. It does not say your source or dependencies are safe; a backdoored dependency built at L3 is still backdoored.</p>', lvl: 'deep' },
    { q: 'How does Sigstore keyless signing work, and what must the verifier check?', a: '<p>In CI, cosign gets an <b>OIDC token</b> for the workflow, sends it with an ephemeral public key to <b>Fulcio</b>, which returns a short-lived certificate binding the key to that identity. cosign signs the image digest and records the signature in <b>Rekor</b>, a public transparency log, then throws the private key away.</p><p>The verifier must check: the signature, the certificate chain to Fulcio\'s root, the Rekor inclusion, and, crucially, the <b>identity and issuer</b>: e.g. "signed by <code>github.com/acme/api/.github/workflows/release.yml@refs/heads/main</code> via <code>token.actions.githubusercontent.com</code>". Checking only "is it signed" accepts anything anyone signed.</p>', lvl: 'deep' },
    { q: 'What is dependency confusion and how do you prevent it in npm and Maven?', a: '<p>Birsan (2021): if a build can resolve a package name from both a private and a public registry, an attacker publishes the internal name publicly with a higher version, and the resolver picks it.</p><ul><li><b>npm</b>: put internal packages in a <b>scope</b> (<code>@acme/</code>) and map that scope to the private registry in <code>.npmrc</code>; reserve the scope on public npm too.</li><li><b>Maven</b>: a single <b>mirror</b> (<code>mirrorOf *</code>) to a repository manager that serves internal group ids only from the internal repo and never proxies them upstream.</li><li>Everywhere: lockfiles with integrity hashes, and runners without general internet egress.</li></ul>', lvl: 'core' },
    { q: 'Scanners would not have caught xz-utils or SolarWinds. What would have helped?', a: '<p>Both were <b>trusted channels delivering malicious code</b>: no CVE existed. Detection by signature fails; integrity and response matter.</p><ul><li>SolarWinds: the <b>build</b> was compromised. SLSA L3-style isolated, ephemeral builders, and <b>reproducible builds</b> compared across two builders, would make an injected change visible.</li><li>xz: the backdoor was in <b>release tarballs</b> that differed from the git tag. Building from source tags, verifying tarball = tag, and treating a new maintainer on a critical dependency as a risk signal (Scorecard, review) help.</li><li>Both: an SBOM per artefact to <b>find and roll back</b> every copy within hours once disclosed.</li></ul>', lvl: 'deep' },
    { q: 'Your developers say security gates slow them down and are mostly false positives. What do you change?', a: '<p>Measure first: build-time added per gate, finding volume, and what fraction of findings were fixed vs dismissed. Then:</p><ul><li>Block only on <b>new</b> findings in the diff, on critical + KEV, and on secrets; everything else becomes a ticket with an SLA.</li><li>De-duplicate across tools; use reachability and EPSS to rank; record VEX for not-affected so it never returns.</li><li>Auto-fix: grouped Renovate/Dependabot updates with auto-merge for patches.</li><li>Run slow scans (full SAST, DAST) in parallel or nightly, not on the PR critical path.</li></ul><p>The goal is a gate that fails rarely and is <b>right when it fails</b>.</p>', lvl: 'core' },
    { q: 'How do you secure the CI system itself?', a: '<ul><li><b>Ephemeral runners</b>: a fresh VM per job, so nothing persists between builds.</li><li><b>OIDC federation</b> to the cloud instead of stored keys; scope trust to repo, branch and environment.</li><li>Least-privilege <code>permissions:</code> per job (read-only by default; <code>id-token: write</code> only for the signing job).</li><li>Pin third-party actions to a <b>commit SHA</b>, not a tag.</li><li>Do not run untrusted PR code with secrets; separate build from release.</li><li>Egress allow-lists, and OpenSSF Scorecard on your own repos for branch protection and token checks.</li></ul>', lvl: 'core' },
    { q: 'Design: a regulated customer asks for SBOMs and SLSA Level 3 for everything you ship. How do you get there?', a: '<p>Phase it, and show evidence at each step:</p><ol><li><b>Inventory</b>: generate CycloneDX SBOMs at build time from the final artefact, store them in Dependency-Track, publish VEX for known non-issues.</li><li><b>Control inputs</b>: private proxy with scoped names, lockfiles, Renovate.</li><li><b>Build L2</b>: move all release builds to hosted CI; generate and sign provenance (in-toto/SLSA predicate) with cosign keyless.</li><li><b>Build L3</b>: use an isolated builder where signing happens outside user steps (e.g. the SLSA GitHub generator or GitHub artifact attestations on hosted runners), then <b>enforce</b> at deploy with Kyverno.</li></ol><p>I would agree on scope with the customer: L3 for shipped artefacts first, internal tools later.</p>', lvl: 'deep' },
    { q: 'Tell me about a time you introduced a security gate that teams resisted.', a: '<p><em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>Situation</b>: after a near-miss with a leaked cloud key, leadership wanted every build to block on any high-severity finding across 120 repos. <b>Task</b>: get real protection without a revolt.</p><p><b>Action</b>: I ran the scanners in warn mode for four weeks and published the data: about 70% of findings were in test code or unreachable paths. We agreed a policy: block on secrets and on <b>new</b> critical or KEV findings only, with VEX for false positives and a 30-day SLA for the rest. We turned on grouped Renovate updates first, so most fixes arrived as green PRs.</p><p><b>Result</b>: median gate time stayed under three minutes, blocked builds fell to a few a week, and the open high-severity backlog roughly halved in a quarter. No team asked for an exemption.</p>', lvl: 'core' }
  ],

  code: [
    {
      title: 'GitHub Actions: SBOM, scan, keyless sign and attest', lang: 'yaml',
      code: `name: release
on: { push: { branches: [main] } }
permissions: { contents: read }               # default for every job
jobs:
  build:
    runs-on: ubuntu-latest                     # ephemeral hosted runner
    permissions: { contents: read, packages: write, id-token: write }
    env: { IMAGE: ghcr.io/acme/api }
    steps:
      - uses: actions/checkout@<full-commit-sha>        # pin actions by SHA
      - uses: actions/setup-java@<full-commit-sha>
        with: { distribution: temurin, java-version: '21', cache: maven }
      - run: mvn -B -s .mvn/settings.xml verify org.cyclonedx:cyclonedx-maven-plugin:makeAggregateBom
      - name: Build and push
        id: push
        run: |
          docker build -t $IMAGE:\${{ github.sha }} .
          docker push $IMAGE:\${{ github.sha }}
          echo "digest=$(docker inspect --format='{{index .RepoDigests 0}}' $IMAGE:\${{ github.sha }} | cut -d@ -f2)" >> "$GITHUB_OUTPUT"
      - name: Scan image (fail on critical)
        uses: aquasecurity/trivy-action@<full-commit-sha>
        with: { image-ref: '\${{ env.IMAGE }}@\${{ steps.push.outputs.digest }}', severity: CRITICAL, exit-code: '1', ignore-unfixed: true }
      - uses: sigstore/cosign-installer@<full-commit-sha>
      - name: Sign and attest (keyless, OIDC)
        env: { REF: '\${{ env.IMAGE }}@\${{ steps.push.outputs.digest }}' }
        run: |
          cosign sign --yes "$REF"
          cosign attest --yes --type cyclonedx --predicate target/bom.json "$REF"`,
      note: 'Sign the <b>digest</b>, never a tag. <code>id-token: write</code> lets cosign get a Fulcio certificate for this workflow\'s identity; no keys are stored. Swap Trivy for <code>anchore/scan-action</code> (Grype) if you prefer. For SLSA provenance add <code>actions/attest-build-provenance</code> or the SLSA generator. Replace <code>&lt;full-commit-sha&gt;</code> with real pinned SHAs.'
    },
    {
      title: 'Dependency-confusion defence: Maven mirror and npm scope', lang: 'yaml',
      code: `# .mvn/settings.xml  (Maven: ONE mirror for everything)
<settings>
  <mirrors>
    <mirror>
      <id>acme-proxy</id>
      <mirrorOf>*</mirrorOf>              <!-- no build ever talks to Central directly -->
      <url>https://repo.acme.internal/maven-all/</url>
    </mirror>
  </mirrors>
</settings>
# On the repository manager: group "maven-all" = [maven-internal, central-proxy],
# with a routing rule so com.acme.* is served ONLY from maven-internal
# (never fetched from Central, even if someone publishes it there).

# .npmrc  (npm: internal packages live in a scope)
@acme:registry=https://repo.acme.internal/npm-internal/
registry=https://repo.acme.internal/npm-proxy/
always-auth=true
//repo.acme.internal/:_authToken=\${NPM_TOKEN}
ignore-scripts=true                  # no postinstall code on CI by default

# CI: install exactly the lockfile, verifying integrity hashes
#   npm ci            (fails if package-lock.json and package.json disagree)
#   mvn -B -s .mvn/settings.xml verify`,
      note: 'Also register the <code>@acme</code> scope on public npm so nobody else can. <code>ignore-scripts</code> may break packages with native builds; allow those explicitly. The routing rule name differs per product (Nexus "routing rules", Artifactory "exclude patterns", CodeArtifact upstream settings).'
    },
    {
      title: 'Kyverno: admit only images signed by our release workflow', lang: 'yaml',
      code: `apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-acme-images
spec:
  validationFailureAction: Enforce
  webhookTimeoutSeconds: 30
  rules:
    - name: signed-by-release-workflow
      match:
        any:
          - resources: { kinds: [Pod] }
      verifyImages:
        - imageReferences: ["ghcr.io/acme/*"]
          mutateDigest: true          # rewrite tag -> verified digest
          verifyDigest: true
          required: true
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/acme/api/.github/workflows/release.yml@refs/heads/main"
                    issuer: "https://token.actions.githubusercontent.com"
                    rekor: { url: https://rekor.sigstore.dev }
          attestations:
            - type: https://cyclonedx.org/bom
              attestors:
                - entries:
                    - keyless:
                        subject: "https://github.com/acme/api/.github/workflows/release.yml@refs/heads/main"
                        issuer: "https://token.actions.githubusercontent.com"`,
      note: 'Pin <b>subject and issuer</b>: "any valid Sigstore signature" would accept images signed by anyone. Start in <code>Audit</code> mode to find unsigned workloads, then switch to <code>Enforce</code>. Newer Kyverno releases also offer an <code>ImageValidatingPolicy</code> type; check your version\'s docs. Sigstore\'s own policy-controller is an alternative.'
    }
  ],

  related: ['threat-modeling', 'secrets-kms', 'zero-trust', 'risk-management', 'gitops', 'infrastructure-as-code']
});
})();
