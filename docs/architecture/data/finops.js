(function () {
  /* Shared monthly bill model for the calculator. All prices are ILLUSTRATIVE (roughly AWS-like, not a quote):
     commitment (RI / Savings Plan) ≈ 40% off on-demand, spot ≈ 70% off, internet egress ≈ $0.09/GB, 730 hours/month. */
  const H = 730, RI_OFF = 0.40, SPOT_OFF = 0.70, EGRESS = 0.09;
  function bill(v) {
    const ri = v.ri / 100, spot = Math.min(v.spot / 100, 1 - ri), od = Math.max(0, 1 - ri - spot);
    const odAll = v.count * v.price * H;
    const compute = odAll * (od + ri * (1 - RI_OFF) + spot * (1 - SPOT_OFF));
    const egress = v.egress * EGRESS;
    const total = compute + egress;
    return { ri, spot, od, odAll, compute, egress, total, onDemandTotal: odAll + egress, idle: compute * (1 - v.util / 100) };
  }
  const $ = (n) => '$' + (n >= 100 ? SD.fmt.num(Math.round(n)) : n.toFixed(2));

  SD.register({
    slug: 'finops',
    domain: 3,
    title: 'FinOps & Cloud Economics',
    examples: 'FinOps Foundation, AWS CUR',
    tagline: 'Know what every feature, tenant and request <b>costs to run</b>, give engineers that number, and design so the bill grows <b>slower than the business</b>.',
    tldr: {
      problem: 'Cloud turns infrastructure into a variable cost that any engineer can increase with one deploy. Without allocation, nobody knows which team, tenant or feature drives the bill, so cost surprises arrive a month late as an invoice.',
      idea: 'Run the FinOps loop: <b>Inform</b> (tag, allocate, show unit cost), <b>Optimize</b> (rightsize, autoscale, commit, use spot, tier storage) and <b>Operate</b> (budgets, anomaly alerts, policies, cost as a design requirement). Measure <b>unit cost</b> (per 1M requests, per tenant), not just the total.',
      insight: 'A growing bill is not a problem; a growing <b>unit cost</b> is. The biggest savings come from <b>architecture</b> (idle capacity, chatty cross-zone traffic, the wrong compute model), not from haggling over discounts.',
      numbers: [
        { v: '3 phases', l: 'FinOps Foundation: Inform → Optimize → Operate, run as a loop' },
        { v: 'up to 72%', l: 'max Savings Plan discount vs on-demand (AWS, 2019); typical is lower' },
        { v: 'up to 90%', l: 'max Spot discount, with a 2-minute interruption notice (AWS docs)' }
      ]
    },

    intro: {
      what: '<b>FinOps</b> (cloud financial operations) is the practice of making cloud spending visible and owned by the engineers who cause it, so the business can make <b>trade-offs between speed, cost and quality</b> on purpose. <b>Cloud economics</b> is the maths behind it: how pricing models, utilisation and architecture turn traffic into a bill.',
      analogy: {
        icon: '🏨',
        title: 'Running a hotel instead of buying one',
        text: 'Renting rooms by the night (<b>on-demand</b>) is flexible but expensive. Booking a block for a year (<b>reserved / committed</b>) is cheaper but you pay even if rooms stay empty. Standby rooms (<b>spot</b>) are very cheap but you can be asked to leave at short notice. A good manager knows the cost <b>per guest night</b>, not just the monthly total. The analogy breaks in one place: in the cloud, any employee can book a room with one click.'
      },
      problem: 'A startup moves to the cloud. Every team launches what it needs. A year later the bill has tripled while revenue doubled. Finance asks "who spent this?" and nobody can answer: half the resources have no owner tag, test clusters run all weekend, and a chatty service sends terabytes across zones. The question this page answers is <b>"what does each feature, tenant and request cost, and how do we design so that number goes down as we grow?"</b>',
      story: [
        {
          stage: 'naive',
          title: 'Provision for peak, pay the invoice',
          text: 'Each team sizes servers for the busiest hour of the year and leaves them on. Finance pays one consolidated invoice at the end of the month. It feels safe: <b>nothing ever runs out of capacity</b>.',
          scene: {
            nodes: [
              { id: 'team', label: 'Teams', sub: 'launch freely', kind: 'team', at: [70, 0] },
              { id: 'vm', label: 'Servers', sub: 'sized for peak', kind: 'compute', at: [210, 0] },
              { id: 'bill', label: 'Invoice', sub: 'one total', kind: 'store', at: [350, 0] },
              { id: 'fin', label: 'Finance', sub: 'pays it', kind: 'person', at: [350, 110] }
            ],
            edges: [{ from: 'team', to: 'vm' }, { from: 'vm', to: 'bill' }, { from: 'bill', to: 'fin' }],
            flow: ['team>vm', 'vm>bill', 'bill>fin']
          }
        },
        {
          stage: 'breaks',
          title: 'Idle capacity and nobody owns it',
          text: 'Average utilisation is around a quarter of what is paid for. Weekend test clusters, forgotten disks and cross-zone traffic pile up. The invoice is <b>a month late and has no owners</b>, so nobody can act on it.',
          scene: {
            nodes: [
              { id: 'team', label: 'Teams', sub: '"not my cost"', kind: 'team', at: [70, 0] },
              { id: 'vm', label: 'Servers', sub: '~25% busy', kind: 'compute', at: [210, 0] },
              { id: 'bill', label: 'Invoice', sub: '+40% · no tags', kind: 'store', at: [350, 0] },
              { id: 'fin', label: 'Finance', sub: 'who spent this?', kind: 'person', at: [350, 110] },
              { id: 'xaz', label: 'Cross-zone', sub: 'TB of chatter', kind: 'external', at: [210, 110] }
            ],
            edges: [{ from: 'team', to: 'vm' }, { from: 'vm', to: 'bill' }, { from: 'bill', to: 'fin' }, { from: 'vm', to: 'xaz' }, { from: 'xaz', to: 'bill' }],
            flow: [['vm>bill', 'vm>xaz'], 'xaz>bill', 'bill>fin'],
            err: ['bill', 'vm'], warn: ['xaz', 'fin'],
            badges: { vm: ['75% idle', 'err'], fin: ['no owner', 'warn'] }
          }
        },
        {
          stage: 'fix',
          title: 'Tag, show, optimise, repeat',
          text: 'Every resource carries an owner tag. A daily cost feed is <b>allocated to teams and tenants</b> and shown next to their own metrics as <b>cost per 1M requests</b>. Teams autoscale, buy commitments for the steady base and get an alert when spend jumps.',
          scene: {
            nodes: [
              { id: 'team', label: 'Teams', sub: 'own their cost', kind: 'team', at: [70, 0] },
              { id: 'vm', label: 'Autoscaled', sub: 'base = committed', kind: 'compute', at: [210, 0] },
              { id: 'bill', label: 'Daily cost', sub: 'tagged · FOCUS', kind: 'store', at: [350, 0] },
              { id: 'show', label: 'Showback', sub: '$ / 1M requests', kind: 'service', at: [350, 110] },
              { id: 'alert', label: 'Anomaly alert', sub: 'same day', kind: 'policy', at: [210, 110] }
            ],
            edges: [{ from: 'team', to: 'vm' }, { from: 'vm', to: 'bill' }, { from: 'bill', to: 'show' }, { from: 'bill', to: 'alert' }, { from: 'show', to: 'team' }, { from: 'alert', to: 'team' }],
            flow: ['vm>bill', ['bill>show', 'bill>alert'], ['show>team', 'alert>team'], 'team>vm'],
            ok: ['vm', 'show', 'team'],
            badges: { show: ['unit cost ↓', 'ok'] }
          }
        }
      ],
      usedBy: ['FinOps Foundation (Linux Foundation project, framework and FOCUS spec)', 'AWS (Cost and Usage Report, Savings Plans, Cost Anomaly Detection)', 'Google Cloud (committed use discounts, billing export)', 'Microsoft Azure (FinOps toolkit, reservations)', 'Airbnb (cloud efficiency programme on AWS)', 'Amazon Prime Video (re-architected a monitoring service for cost)'],
      whenToUse: [
        'Cloud spend is material (a noticeable share of revenue or of the engineering budget) and growing',
        'Several teams or tenants share accounts or clusters, and nobody can say who causes which cost',
        'You are choosing an architecture (serverless vs containers, managed vs self-hosted) and cost is a requirement'
      ],
      whenNot: [
        'Spend is tiny compared with salaries: one budget alert and a tagging rule are enough; do not build a FinOps team',
        'The real decision is whether to own the capability at all: see <a href="build-vs-buy.html">Build vs Buy vs Rent</a>',
        'You are trying to cut cost by slowing delivery: if a saving costs more engineer time than it saves, skip it'
      ],
      glossary: [
        { term: 'Unit cost', def: 'Cloud cost divided by a business driver: per 1M requests, per tenant, per active user, per order.' },
        { term: 'Showback / chargeback', def: 'Showback reports each team\'s cost to it; chargeback actually moves that cost into the team\'s budget.' },
        { term: 'Commitment discount', def: 'A cheaper rate in exchange for committing to usage for 1 or 3 years: Reserved Instances, Savings Plans, committed use discounts.' },
        { term: 'Spot / preemptible', def: 'Spare provider capacity sold at a deep discount that can be reclaimed at short notice.' },
        { term: 'Rightsizing', def: 'Changing an instance, container request or database to the smallest size that still meets its target.' },
        { term: 'FOCUS', def: 'FinOps Open Cost and Usage Specification: one column format for billing data from any cloud or SaaS.' },
        { term: 'Egress', def: 'Data leaving a cloud, region or zone. It is usually billed per GB, while data coming in is often free.' },
        { term: 'Coverage vs utilisation', def: 'Coverage: share of usage billed at a committed rate. Utilisation: share of the commitment you actually used.' }
      ]
    },

    requirements: {
      functional: [
        '<b>Everyone takes ownership</b> of their cloud usage: cost is an engineering metric, like latency',
        '<b>Allocate every dollar</b>: tags or accounts map spend to a team, product, environment and tenant; shared costs get a written split rule',
        '<b>Measure unit cost</b>, not totals: cost per 1M requests, per tenant, per order, trended over time',
        '<b>Make data timely</b>: daily cost feeds and same-day anomaly alerts, not a monthly invoice',
        '<b>Buy rates centrally, optimise usage locally</b>: a central team manages commitments; product teams rightsize and autoscale',
        '<b>Design for cost</b>: treat it as a non-functional requirement with a target and a fitness function in CI'
      ],
      nonFunctional: [
        '≥ 95% of spend allocated to an owner (common maturity target, rule of thumb)',
        'Cost anomaly detected and routed to the owning team in ≤ 24 h',
        'Commitment utilisation ≥ 95%, coverage of the steady baseline 70–90% (rule of thumb)',
        'Average CPU utilisation of always-on fleets ≥ 40–60% (rule of thumb, depends on headroom needs)',
        'Unit cost (e.g. $ per 1M requests) flat or falling quarter on quarter as volume grows',
        'Non-production environments scheduled off outside working hours (≈ 65% fewer hours)'
      ],
      outOfScope: [
        '<b>The month-end surprise</b>: looking at cost only when the invoice arrives',
        '<b>Tag later</b>: launching resources without owner tags and hoping to clean up',
        '<b>Commit everything</b>: buying 3-year commitments for workloads that will shrink or move',
        '<b>Penny-wise engineering</b>: a week of senior time to save $50 a month',
        '<b>Cost cop</b>: a central team that blocks deploys instead of giving teams data and ownership'
      ]
    },

    calculator: {
      inputs: [
        { id: 'price', label: 'On-demand price per instance-hour ($)', min: 0.01, max: 5, step: 0.01, value: 0.40, unit: '$' },
        { id: 'count', label: 'Instances running (average)', min: 1, max: 1000, value: 40, log: true },
        { id: 'util', label: 'Average utilisation of those instances', min: 5, max: 100, value: 30, unit: '%' },
        { id: 'ri', label: 'Share on Reserved / Savings Plan (≈40% off)', min: 0, max: 100, step: 5, value: 50, unit: '%' },
        { id: 'spot', label: 'Share on spot (≈70% off)', min: 0, max: 100, step: 5, value: 10, unit: '%' },
        { id: 'egress', label: 'Internet egress per month (GB)', min: 10, max: 500000, value: 20000, log: true, fmt: 'num' },
        { id: 'req', label: 'Requests served per month (millions)', min: 1, max: 100000, value: 2000, log: true, fmt: 'num' }
      ],
      outputs: [
        { label: 'Monthly bill (compute + egress)', f: (v) => $(bill(v).total) },
        { label: 'Same usage at on-demand prices', f: (v) => $(bill(v).onDemandTotal) },
        { label: 'Savings vs on-demand', f: (v) => { const b = bill(v); return $(b.onDemandTotal - b.total) + ' (' + ((1 - b.total / b.onDemandTotal) * 100).toFixed(0) + '%)'; } },
        { label: 'Unit cost per 1M requests', f: (v) => '$' + (bill(v).total / v.req).toFixed(3) },
        { label: 'Paid for idle capacity', f: (v) => { const b = bill(v); return $(b.idle) + ' / month'; } },
        { label: 'Effective cost per <i>used</i> instance-hour', f: (v) => { const b = bill(v); return '$' + (b.compute / (v.count * H * v.util / 100)).toFixed(3) + ' (list $' + v.price.toFixed(2) + ')'; } }
      ],
      note: '<em>Illustrative prices</em>, not a quote: commitment ≈ 40% off, spot ≈ 70% off, egress ≈ $0.09/GB, 730 hours a month. If RI + spot exceed 100%, spot is capped. Notice which lever moves the bill most: raising <b>utilisation</b> from 30% to 60% (autoscaling, rightsizing) halves the cost per used hour, which is more than any discount. Discounts lower the <b>price</b>; architecture lowers the <b>quantity</b>.'
    },

    api: [
      { m: 'POLICY', p: 'Tagging policy', d: 'Required keys (<code>owner</code>, <code>cost-center</code>, <code>env</code>, <code>service</code>, <code>tenant</code> where dedicated), allowed values, who fixes untagged resources, and enforcement: IaC lint + an org tag policy + a weekly untagged-spend report.' },
      { m: 'DOC', p: 'Cost allocation model', d: 'How every dollar reaches an owner: account/project per team, tag mapping, and <b>split rules for shared costs</b> (Kubernetes cluster by requested CPU/memory, shared database by query time, support plan by % of spend). Showback or chargeback, and from when.' },
      { m: 'SLO', p: 'Unit cost targets', d: 'Per product: unit (per 1M requests, per active tenant, per GB stored), current value, target and trend. Reviewed with latency and availability SLOs, so trade-offs are explicit.' },
      { m: 'POLICY', p: 'Budgets & anomaly alerts', d: 'Monthly budget per team with forecast alerts at 80% and 100%, an anomaly monitor per service or cost category, a $ threshold for paging vs ticketing, and the owner who must explain an anomaly within a day.' },
      { m: 'DOC', p: 'Commitment strategy', d: 'Target coverage of the steady baseline, term (1 vs 3 years), type (Compute SP vs instance RI vs CUD), purchase cadence (small monthly tranches, not one big bet), and who approves.' },
      { m: 'ADR', p: 'ADR: cost of this architecture', d: 'The cost section of every design: expected unit cost, scaling curve, egress and cross-zone traffic, managed vs self-hosted TCO, and the <b>cost fitness function</b> that will fail CI if it drifts.' }
    ],

    dataModel: [
      { name: 'focus_cost_row', store: 'Warehouse (FOCUS-style billing export)', fields: [['ChargePeriodStart', 'timestamp', 'idx'], ['ServiceName', 'text', 'idx'], ['ResourceId', 'text'], ['ChargeCategory', 'Usage|Purchase|Tax|Credit|Adjustment'], ['PricingCategory', 'Standard|Committed|Dynamic'], ['ListCost', 'numeric'], ['EffectiveCost', 'numeric'], ['Tags', 'json']], note: '<code>EffectiveCost</code> amortises upfront commitment fees and applies discounts; use it, not <code>BilledCost</code>, for showback.' },
      { name: 'allocation_rule', store: 'Postgres / Git (YAML)', fields: [['rule_id', 'text', 'pk'], ['match', 'tag / account / service filter'], ['target', 'team | tenant | product', 'idx'], ['split_basis', 'fixed % | cpu-requests | requests | storage-GB'], ['valid_from', 'date']], note: 'Versioned rules, so last quarter\'s numbers can be reproduced after the rules change.' },
      { name: 'unit_metric_daily', store: 'Warehouse', fields: [['day', 'date', 'pk'], ['service', 'text', 'pk'], ['tenant_id', 'text', 'pk'], ['requests', 'bigint'], ['allocated_cost', 'numeric'], ['cost_per_1m_req', 'numeric']], note: 'Joins the allocated cost with usage counters from the app (Micrometer tags) to get cost per tenant and per request.' },
      { name: 'commitment', store: 'Postgres', fields: [['commitment_id', 'text', 'pk'], ['type', 'RI | SP | CUD'], ['hourly_commit_usd', 'numeric'], ['term_end', 'date', 'idx'], ['utilisation_pct_30d', 'numeric'], ['coverage_pct_30d', 'numeric']] }
    ],

    architecture: {
      title: 'The FinOps loop: from billing data to engineering decisions',
      nodes: [
        { id: 'tags', label: 'Tag policy', sub: 'owner · env · tenant', kind: 'policy', wide: [280, 55], tall: [70, 0], tip: 'Required tags enforced in IaC and by an org policy. Untagged spend is reported weekly to the account owner.' },
        { id: 'app', label: 'Workloads', sub: 'compute · storage · net', kind: 'service', wide: [90, 165], tall: [210, 0], tip: 'Everything that generates usage: instances, pods, functions, buckets, databases, data transfer.' },
        { id: 'unit', label: 'Usage metrics', sub: 'requests by tenant', kind: 'compute', wide: [660, 55], tall: [350, 0], tip: 'Business drivers from the app (Micrometer counters tagged with tenant and endpoint) used as the denominator of unit cost.' },
        { id: 'cur', label: 'Billing export', sub: 'CUR 2.0 / FOCUS', kind: 'store', wide: [280, 165], tall: [70, 105], tip: 'Hourly or daily line items from the provider, ideally in the FOCUS format so several clouds and SaaS bills share one schema.' },
        { id: 'alloc', label: 'Allocation', sub: 'tags + shared splits', kind: 'compute', wide: [470, 165], tall: [210, 105], tip: 'Maps each line to an owner; splits shared costs (clusters, support, networking) by a documented rule; amortises commitments.' },
        { id: 'dw', label: 'Cost warehouse', sub: 'daily, amortised', kind: 'store', wide: [660, 165], tall: [210, 210], tip: 'Allocated cost joined with usage metrics: cost per team, service, tenant and per 1M requests.' },
        { id: 'dash', label: 'Showback', sub: 'unit cost per team', kind: 'service', wide: [850, 165], tall: [350, 210], tip: 'Dashboards next to each team\'s latency and error dashboards. Chargeback later, once the numbers are trusted.' },
        { id: 'commit', label: 'Commitments', sub: 'RI · SP · CUD', kind: 'external', wide: [280, 385], tall: [70, 210], tip: 'Rate optimisation: bought centrally for the steady baseline, in small tranches, tracked for utilisation and coverage.' },
        { id: 'anom', label: 'Budgets + anomaly', sub: 'forecast & ML alerts', kind: 'policy', wide: [660, 275], tall: [70, 315], tip: 'Forecast-based budget alerts and anomaly detection, routed to the owning team the same day.' },
        { id: 'eng', label: 'Engineering', sub: 'rightsize · scale', kind: 'team', wide: [470, 275], tall: [210, 315], tip: 'Usage optimisation: rightsizing, autoscaling, scheduling non-prod, storage lifecycle, fewer cross-zone hops, caching.' },
        { id: 'fin', label: 'Finance', sub: 'forecast · budget', kind: 'person', wide: [850, 275], tall: [350, 315], tip: 'Uses allocated cost and unit cost to forecast, budget and decide chargeback.' },
        { id: 'prac', label: 'FinOps team', sub: 'enable, not police', kind: 'team', wide: [470, 385], tall: [210, 420], tip: 'A small central practice: owns tooling, allocation rules, commitment purchases and the cadence of reviews.' }
      ],
      edges: [
        { from: 'tags', to: 'app' },
        { from: 'tags', to: 'alloc' },
        { from: 'app', to: 'cur' },
        { from: 'app', to: 'unit', dashed: true, bend: -0.22 },
        { from: 'cur', to: 'alloc' },
        { from: 'alloc', to: 'dw' },
        { from: 'unit', to: 'dw' },
        { from: 'dw', to: 'dash' },
        { from: 'dw', to: 'anom' },
        { from: 'dash', to: 'eng' },
        { from: 'dash', to: 'fin' },
        { from: 'anom', to: 'eng' },
        { from: 'fin', to: 'prac' },
        { from: 'prac', to: 'eng' },
        { from: 'prac', to: 'commit' },
        { from: 'commit', to: 'cur', label: 'discounts' },
        { from: 'eng', to: 'app', bend: -0.2 }
      ]
    },

    scenarios: [
      {
        id: 'inform', title: 'Inform: who spent this?', tone: 'info',
        steps: [
          { text: 'The bill grew 40% in a quarter. The billing export lists 2 million line items, and <b>35% of spend has no owner tag</b>.', flow: ['app>cur'], warn: ['cur'], badges: { cur: ['35% untagged', 'warn'] } },
          { text: 'The <b>tag policy</b> becomes mandatory: IaC modules add <code>owner</code>, <code>env</code>, <code>service</code>; an org policy rejects untagged resources in new accounts.', flow: ['tags>app', 'tags>alloc'], ok: ['tags'] },
          { text: 'Allocation maps tagged lines and splits the <b>shared Kubernetes cluster</b> by each namespace\'s requested CPU and memory, a written, versioned rule.', flow: ['cur>alloc', 'alloc>dw'], badges: { alloc: '97% allocated' } },
          { text: 'Showback puts each team\'s cost next to its own dashboards. The surprise: a <b>staging environment</b> running 24/7 is the third-largest cost.', flow: ['dw>dash', 'dash>eng'], warn: ['eng'], badges: { eng: ['staging 24/7', 'warn'] } },
          { text: 'The team schedules non-prod off nights and weekends. Nobody was told to; they just <b>saw the number</b>.', flow: ['eng>app'], ok: ['app', 'eng'], tone: 'ok' }
        ]
      },
      {
        id: 'anomaly', title: 'Failure: the runaway NAT and cross-AZ bill', tone: 'err',
        steps: [
          { text: 'A new service calls a database replica in another zone and pulls images through a NAT gateway. Nobody looks at network cost; it is not on any dashboard.', nodes: ['app'], warn: ['app'], badges: { app: 'chatty' } },
          { text: 'Cross-zone traffic is billed in <b>both directions</b> and NAT gateways charge per GB processed. Daily network cost jumps <b>5×</b> overnight.', flow: ['app>cur', 'cur>alloc', 'alloc>dw'], err: ['cur'], badges: { cur: ['network ×5', 'err'] }, tone: 'err' },
          { text: 'Without anomaly detection, this would be found on the invoice four weeks later. With it, an alert reaches the owning team <b>the same day</b> with the top cost driver.', flow: ['dw>anom', 'anom>eng'], warn: ['anom'], badges: { anom: ['anomaly $', 'warn'] } },
          { text: 'Fix: read from a same-zone replica, add a VPC endpoint for the image registry and object storage, cache hot reads. Network cost drops back.', flow: ['eng>app'], ok: ['app', 'eng'], tone: 'ok' },
          { text: 'Follow-up: network cost per request becomes a <b>fitness function</b> in the design review checklist, so the next chatty design is caught on paper.', nodes: ['prac'], ok: ['prac'], badges: { prac: 'checklist +1' } }
        ]
      },
      {
        id: 'commit', title: 'Scale: buying commitments for the baseline', tone: 'warn',
        steps: [
          { text: 'Spend is now large and steady. 30 days of hourly usage show a <b>floor</b> that never drops below 60% of the peak.', flow: ['cur>alloc', 'alloc>dw'], badges: { dw: 'floor = 60%' } },
          { text: 'The FinOps team covers <b>about 80% of the floor</b> with a flexible compute commitment, bought in monthly tranches, not one 3-year bet.', flow: ['prac>commit', 'commit>cur'], ok: ['commit'], badges: { commit: ['80% of floor', 'ok'] } },
          { text: 'Engineering then cuts the fleet by 30% through rightsizing. Commitment <b>utilisation</b> falls: the company now pays for committed hours it does not use.', flow: ['eng>app'], warn: ['commit'], badges: { commit: ['util 78%', 'warn'] }, tone: 'warn' },
          { text: 'Lesson: <b>optimise usage before rate</b>. Rightsize first, then commit to what remains; keep commitments flexible (compute-wide, shorter term) when architecture is changing.', nodes: ['prac', 'eng'], ok: ['prac'] }
        ]
      },
      {
        id: 'tenant', title: 'Unit economics: cost per tenant', tone: 'ok',
        steps: [
          { text: 'A multi-tenant SaaS charges a flat price per seat. Sales asks whether the largest customer is profitable.', nodes: ['fin'], badges: { fin: 'margin?' } },
          { text: 'The app emits request counters and CPU time <b>tagged by tenant</b>; the warehouse joins them with allocated shared cost.', flow: ['app>unit', 'unit>dw', 'alloc>dw'], badges: { unit: 'tenant=…' } },
          { text: 'Result: one tenant drives 22% of cost on 6% of revenue because of a nightly bulk export. <b>Cost per tenant</b> makes the problem a product decision.', flow: ['dw>dash', 'dash>fin'], warn: ['dash'], badges: { dash: ['tenant A 22%', 'warn'] } },
          { text: 'Options: usage-based pricing tier, an async batched export at off-peak, or a rate limit. Engineering ships the batch job; unit cost per tenant falls.', flow: ['fin>prac', 'prac>eng', 'eng>app'], ok: ['eng', 'app'], tone: 'ok' }
        ]
      },
      {
        id: 'peak', title: 'Pressure: peak sale on spot capacity', tone: 'warn',
        steps: [
          { text: 'A sales event needs 4× capacity for a day. The base is committed; the burst is planned as <b>on-demand + spot</b> behind an autoscaler.', nodes: ['app', 'commit'], badges: { app: '4× burst' } },
          { text: 'Spot capacity in one instance type is reclaimed with a <b>two-minute notice</b>. Pods drain, the autoscaler requests other types and zones.', nodes: ['app'], warn: ['app'], badges: { app: ['spot reclaimed', 'warn'] }, tone: 'warn' },
          { text: 'Because stateless web pods used <b>many instance types</b> and kept a protected on-demand floor, the checkout path never lost capacity.', nodes: ['app'], ok: ['app'], badges: { app: ['diversified', 'ok'] } },
          { text: 'Next day the anomaly monitor is quiet: the spike was expected and the budget forecast was raised in advance. Unit cost per order <b>fell</b> during the peak.', flow: ['app>cur', 'cur>alloc', 'alloc>dw', 'dw>anom'], ok: ['anom'], tone: 'ok' }
        ]
      }
    ],

    knobs: {
      intro: 'Pick the cost levers for one service with a daily traffic peak about 3× its trough. The meters show the result relative to the naive design (always-on VMs, on-demand, hot storage, no allocation). <em>Illustrative model</em>, not a pricing quote.',
      controls: [
        { id: 'arch', label: 'Compute architecture', type: 'seg', value: 'k8s', options: [
          { v: 'vm', l: 'Always-on VMs', hint: 'sized for peak' }, { v: 'k8s', l: 'Containers + HPA', hint: 'bin-packed' }, { v: 'fn', l: 'Serverless', hint: 'pay per request' }] },
        { id: 'scale', label: 'Autoscaling policy', type: 'seg', value: 'target', options: [
          { v: 'none', l: 'None (fixed)' }, { v: 'sched', l: 'Scheduled' }, { v: 'target', l: 'Target tracking' }] },
        { id: 'buy', label: 'Purchasing mix', type: 'seg', value: 'mix', options: [
          { v: 'od', l: 'All on-demand' }, { v: 'mix', l: 'Commit baseline' }, { v: 'spot', l: 'Commit + spot burst' }, { v: 'all', l: 'Commit 100%' }] },
        { id: 'store', label: 'Storage tier', type: 'seg', value: 'life', options: [
          { v: 'hot', l: 'All hot' }, { v: 'life', l: 'Lifecycle to cold' }] },
        { id: 'alloc', label: 'Cost allocation', type: 'seg', value: 'show', options: [
          { v: 'none', l: 'One bill' }, { v: 'show', l: 'Showback' }, { v: 'charge', l: 'Chargeback' }] }
      ],
      evaluate(s) {
        const clamp = (x) => Math.max(0.03, Math.min(1, x));
        // utilisation of paid capacity
        let util = { none: 0.33, sched: 0.5, target: 0.65 }[s.scale];
        if (s.arch === 'fn') util = 1;                         // billed per invocation
        if (s.arch === 'vm' && s.scale !== 'none') util -= 0.07; // coarse VM granularity, slow boot
        const listCompute = 100 / util * 0.36;                   // naive: 100 units of compute at 33% util
        const archK = { vm: 1, k8s: 0.92, fn: 1.9 }[s.arch];     // serverless premium per used unit (estimate)
        let rate = 1, interrupt = 0.05, commitRisk = 0.05;
        if (s.arch !== 'fn') {
          rate = { od: 1, mix: 0.75, spot: 0.62, all: 0.6 }[s.buy];
          commitRisk = { od: 0, mix: 0.25, spot: 0.25, all: s.scale === 'none' ? 0.35 : 0.9 }[s.buy];
          if (s.buy === 'all' && s.scale !== 'none') rate = 0.6 / Math.max(util, 0.5) * 0.7; // paying for unused commitment
          interrupt = s.buy === 'spot' ? (s.arch === 'k8s' ? 0.45 : 0.6) : 0.05;
        }
        const compute = listCompute * archK * rate;
        const storage = s.store === 'hot' ? 30 : 14;
        const network = 10, alloc = s.alloc === 'none' ? 0 : 1.5;
        const awareness = { none: 1, show: 0.93, charge: 0.88 }[s.alloc]; // teams act on what they see (rule of thumb)
        const total = (compute + storage + network) * awareness + alloc;
        const naive = 100 / 0.33 * 0.36 + 30 + 10;
        const rel = total / naive;
        const ops = { vm: 0.45, k8s: 0.3, fn: 0.8 }[s.arch] + (s.buy === 'spot' ? -0.12 : 0) + (s.scale === 'target' ? -0.05 : 0) + (s.alloc === 'charge' ? -0.08 : 0);
        const vis = { none: 0.12, show: 0.75, charge: 0.92 }[s.alloc];
        const metrics = [
          { k: 'Monthly cost (naive = 100)', v: Math.round(rel * 100) + '', s: clamp(1.25 - rel), hint: 'illustrative' },
          { k: 'Unit cost per 1M requests', v: '$' + (rel * 4).toFixed(2), s: clamp(1.25 - rel), hint: 'naive ≈ $4.00' },
          { k: 'Paid capacity actually used', v: Math.round(util * 100) + '%', s: clamp(util) },
          { k: 'Interruption risk', v: interrupt > 0.4 ? 'medium (spot reclaims)' : 'low', s: clamp(1 - interrupt) },
          { k: 'Commitment risk', v: commitRisk > 0.6 ? 'high (pay for unused)' : commitRisk > 0.15 ? 'moderate' : 'none', s: clamp(1 - commitRisk) },
          { k: 'Ops effort', v: ops > 0.65 ? 'low' : ops > 0.35 ? 'medium' : 'high', s: clamp(ops) },
          { k: 'Cost visibility', v: { none: 'one total', show: 'per team / tenant', charge: 'in team budgets' }[s.alloc], s: vis }
        ];
        const notes = [];
        if (s.arch === 'fn') notes.push('Serverless bills per request and duration, so idle costs nothing, but the price per used unit is higher. At steady high load, containers usually win; at spiky or low load, serverless does.');
        if (s.arch !== 'fn' && s.scale === 'none') notes.push('Fixed capacity sized for peak means you pay for the trough at peak prices. Most of the bill here is <b>idle</b>.');
        if (s.buy === 'all' && s.scale !== 'none' && s.arch !== 'fn') notes.push('Committing 100% of <b>peak</b> while autoscaling down at night means paying for committed hours nobody uses. Commit to the <b>floor</b>, not the peak.');
        if (s.buy === 'spot' && s.arch !== 'fn') notes.push('Spot is for interruptible, stateless work: diversify instance types and zones, handle the 2-minute notice, and keep an on-demand floor for critical paths.');
        if (s.arch === 'fn' && s.buy !== 'od') notes.push('Commitments and spot mostly apply to instances; for functions the purchasing mix barely matters here (AWS Compute Savings Plans do cover Lambda and Fargate).');
        if (s.alloc === 'none') notes.push('With one bill, nobody owns any line. Teams cannot act on cost they cannot see.');
        if (s.alloc === 'charge') notes.push('Chargeback changes behaviour most but needs trusted allocation and agreed shared-cost rules first, or it becomes a fight about the numbers.');
        if (s.store === 'hot') notes.push('Logs and old objects in hot storage: a lifecycle rule to infrequent-access and archive tiers is usually a one-line change.');
        let verdict;
        if (s.buy === 'all' && s.scale !== 'none' && s.arch !== 'fn') verdict = '❌ <b>Over-committed.</b> Autoscaling and a 100% commitment fight each other: you pay for capacity you scaled away.';
        else if (rel < 0.5 && s.alloc !== 'none') verdict = '✅ <b>Efficient and visible.</b> About ' + Math.round((1 - rel) * 100) + '% below the naive design, and teams can see their own unit cost.';
        else if (rel < 0.65) verdict = '👍 <b>Good savings</b> (' + Math.round((1 - rel) * 100) + '% lower). ' + (s.alloc === 'none' ? 'Add showback so it stays that way.' : 'Check the remaining idle capacity.');
        else if (rel < 0.85) verdict = '⚠ <b>Some savings</b>, but most of the bill is still idle or premium capacity.';
        else verdict = '❌ <b>Paying for peak, all the time.</b> Fix utilisation before negotiating discounts.';
        return {
          metrics, verdict, notes,
          labels: {
            app: { label: { vm: 'VM fleet', k8s: 'K8s + HPA', fn: 'Functions' }[s.arch], sub: { none: 'fixed size', sched: 'scheduled scale', target: 'target tracking' }[s.arch === 'fn' ? 'target' : s.scale] },
            commit: { label: 'Commitments', sub: s.arch === 'fn' ? 'mostly n/a' : { od: 'none · on-demand', mix: 'baseline covered', spot: 'baseline + spot', all: '100% committed' }[s.buy] },
            dash: { label: { none: 'One invoice', show: 'Showback', charge: 'Chargeback' }[s.alloc], sub: s.alloc === 'none' ? 'no owners' : 'unit cost per team' }
          },
          hide: s.alloc === 'none' ? ['unit'] : [],
          hot: ['app'],
          ok: rel < 0.6 ? ['app'] : [], warn: s.buy === 'spot' && s.arch !== 'fn' ? ['commit'] : [], err: s.alloc === 'none' ? ['dash'] : [],
          badges: { app: [Math.round(util * 100) + '% used', util > 0.6 ? 'ok' : util > 0.45 ? 'warn' : 'err'], dw: ['cost ' + Math.round(rel * 100), 'info'] },
          flow: ['app>cur', 'cur>alloc', 'alloc>dw', 'dw>dash', 'dash>eng', 'eng>app']
        };
      }
    },

    widget: {
      title: 'Provisioned vs used: a workload cost model over a day or a week',
      caption: 'The blue area is <b>paid capacity</b>; the solid line is <b>demand</b>. The shaded gap is <b>waste</b>. Toggle autoscaling, caching, commitment coverage and spot, and watch the bill bars: commitments lower the <b>price</b> of capacity, autoscaling and caching lower the <b>quantity</b>. Prices are illustrative.'
    },

    realWorld: {
      intro: 'Pricing models came from the providers; the practice and the standard came from the FinOps Foundation. The engineering stories show that the largest savings were architectural.',
      timeline: [
        { when: 'Mar 2009', who: 'AWS', title: 'Reserved Instances', text: 'AWS adds <b>Reserved Instances</b>: a one-time payment for a 1- or 3-year term in exchange for a much lower hourly rate. The first commitment discount, and the start of rate optimisation as a discipline.', src: 0 },
        { when: 'Mar 2017', who: 'Google Cloud', title: 'Committed use discounts', text: 'Google launches <b>committed use discounts</b>: commit to vCPU and memory for 1 or 3 years for up to <b>57%</b> off on-demand, without tying the commitment to a machine type.', src: 1 },
        { when: 'Nov 2019', who: 'AWS', title: 'Savings Plans', text: 'AWS introduces <b>Savings Plans</b>: commit to a $/hour spend for 1 or 3 years. Compute Savings Plans apply across instance families, regions, Fargate and (later) Lambda; EC2 Instance Savings Plans give up to <b>72%</b> off for one family in one region.', src: 2 },
        { when: 'Dec 2020', who: 'AWS', title: 'Cost Anomaly Detection GA', text: 'AWS makes <b>Cost Anomaly Detection</b> generally available: an ML model learns historic spend patterns, flags spikes and sustained increases, and shows likely root causes, without hand-set thresholds.', src: 3 },
        { when: 'Apr 2021', who: 'Airbnb', title: 'Our journey towards cloud efficiency', text: 'Airbnb describes building cost visibility on top of the AWS Cost and Usage Report and its data warehouse, and why, in a "you build it, you run it" culture, it gave engineers data instead of adding friction.', src: 4 },
        { when: 'Mar 2023', who: 'Amazon Prime Video', title: 'Monitoring service: −90% infra cost', text: 'The Prime Video team moves one audio/video quality-monitoring service from a distributed serverless workflow to a single process, reporting that this <b>reduced infrastructure cost by over 90%</b>. It was one service, not all of Prime Video: an argument for matching the compute model to the workload.', src: 5 },
        { when: 'Nov 2023', who: 'Werner Vogels', title: 'The Frugal Architect', text: 'At re:Invent 2023 Amazon\'s CTO publishes seven laws for cost-aware architecture. Law 1: <b>"Make cost a non-functional requirement."</b> Others: align cost with the business, and cost optimisation is incremental.', src: 6 },
        { when: 'Jun 2024', who: 'FinOps Foundation', title: 'FOCUS 1.0 GA', text: 'The <b>FinOps Open Cost and Usage Specification</b> reaches 1.0 (preview Nov 2023), with support announced by AWS, Google Cloud, Microsoft and Oracle: one column schema (e.g. <code>BilledCost</code>, <code>EffectiveCost</code>, <code>ChargeCategory</code>) for every billing source.', src: 7 },
        { when: '2024–26', who: 'FinOps Foundation', title: 'Framework revisions', text: 'The Framework keeps the three phases <b>Inform, Optimize, Operate</b>, splits personas into core (practitioner, engineering, finance, leadership, product, procurement) and allied, and adds <b>Scopes</b> (2025) for SaaS, AI and data centre spend alongside public cloud.', src: 8 }
      ],
      lessons: [
        'Rates are the easy lever and the providers keep adding them; <b>usage</b> (idle capacity, architecture) is where the large savings are.',
        'Visibility changes behaviour: engineers who see their own unit cost fix waste without being told.',
        'Use a standard billing schema (FOCUS) and amortised <b>effective cost</b>, or every team argues about whose numbers are right.',
        'Match the compute model to the traffic shape: serverless and distributed workflows are not automatically cheaper.'
      ],
      sources: [
        { title: 'Amazon EC2 Introduces Reserved Instances', url: 'https://aws.amazon.com/about-aws/whats-new/2009/03/12/amazon-ec2-introduces-reserved-instances', pub: 'AWS, Mar 2009' },
        { title: 'Google launches committed-use discounts for its Cloud Platform', url: 'https://techcrunch.com/2017/03/09/google-launches-committed-use-discounts-for-its-cloud-platform', pub: 'TechCrunch, Mar 2017' },
        { title: 'Introducing Savings Plans', url: 'https://aws.amazon.com/about-aws/whats-new/2019/11/introducing-savings-plans', pub: 'AWS, Nov 2019' },
        { title: 'AWS Cost Anomaly Detection is now generally available', url: 'https://aws.amazon.com/about-aws/whats-new/2020/12/aws-cost-anomaly-detection-now-generally-available', pub: 'AWS, Dec 2020' },
        { title: 'Our Journey Towards Cloud Efficiency', url: 'https://medium.com/airbnb-engineering/our-journey-towards-cloud-efficiency-9c02ba04ade8', pub: 'Airbnb Engineering, 2021' },
        { title: 'Return of the Monolith: Amazon Dumps Microservices for Video Monitoring', url: 'https://thenewstack.io/return-of-the-monolith-amazon-dumps-microservices-for-video-monitoring/', pub: 'The New Stack, 2023' },
        { title: 'The Frugal Architect (Werner Vogels)', url: 'https://www.infoq.com/news/2023/12/frugal-architect-werner-vogels/', pub: 'InfoQ, Dec 2023' },
        { title: 'FOCUS 1.0 is generally available', url: 'https://prnewswire.com/news-releases/finops-open-cost-and-usage-specification-focus-1-0-is-generally-available-leading-clouds-launch-native-support-302176745.html', pub: 'FinOps Foundation, Jun 2024' },
        { title: 'FinOps Phases', url: 'https://www.finops.org/framework/phases/', pub: 'FinOps Foundation' },
        { title: 'FinOps Framework 2025: Scopes', url: 'https://www.finops.org/insights/2025-finops-framework/', pub: 'FinOps Foundation, 2025' },
        { title: 'FOCUS Specification v1.0', url: 'https://focus.finops.org/docs/specification/v1-0/', pub: 'FinOps Foundation' },
        { title: 'Overview of Amazon EC2 Spot Instances', url: 'https://docs.aws.amazon.com/aws-technical-content/latest/cost-optimization-leveraging-ec2-spot-instances/introduction.html', pub: 'AWS docs' },
        { title: 'AWS cross-AZ data transfer costs more than AWS says', url: 'https://www.lastweekinaws.com/blog/aws-cross-az-data-transfer-costs-more-than-aws-says', pub: 'Last Week in AWS' }
      ]
    },

    tradeoffs: {
      headers: ['Lever', 'Saves', 'Costs you', 'Use when…'],
      rows: [
        ['<b>Commitments</b> (RI, Savings Plans, CUD)', 'Price per hour, often 30–60% in practice (up to 72% max)', 'Lock-in for 1–3 years; you pay even if usage falls or moves', 'There is a steady baseline you are confident will exist for the term'],
        ['<b>Spot / preemptible</b>', 'Price, up to 90% off', 'Interruptions at short notice; needs stateless, diversified, restartable work', 'Batch, CI, stateless web tiers above an on-demand floor, ML training with checkpoints'],
        ['<b>Rightsizing + autoscaling</b>', 'Quantity: removes idle capacity', 'Engineering time, load tests, scaling lag and cold starts', 'Utilisation is low or traffic has a daily or weekly shape (almost always)'],
        ['<b>Storage tiering & lifecycle</b>', 'Price per GB-month for cold data', 'Retrieval fees and latency; minimum storage durations', 'Data is rarely read after days or weeks (logs, backups, media originals)'],
        ['<b>Serverless</b> vs <b>containers</b>', 'No idle cost (serverless) / lowest price per unit at steady load (containers)', 'Higher unit price (serverless) / you pay for idle and run the cluster (containers)', 'Spiky or low traffic → serverless; steady, high traffic → containers or VMs'],
        ['<b>Showback → chargeback</b>', 'Behaviour: teams fix what they can see and pay for', 'Allocation work, shared-cost disputes, overhead', 'Showback always; chargeback once allocation is ≥ 90–95% and trusted']
      ]
    },
    failures: [
      { f: 'Untagged and unowned spend', detect: 'Share of cost without an <code>owner</code> tag; weekly untagged report trending up', fix: 'Tags in IaC modules, org tag policy, deny-on-create in new accounts, account per team for clean boundaries.' },
      { f: 'Commitment waste', detect: 'Commitment utilisation < 95%; commitments expiring unnoticed; coverage near 100% of peak', fix: 'Rightsize first, commit to the floor, buy in small monthly tranches, prefer flexible types while architecture changes.' },
      { f: 'Data transfer surprise (egress, cross-AZ, NAT)', detect: 'Network share of the bill rising; anomaly on DataTransfer or NatGateway usage types', fix: 'Zone-aware routing and replicas, VPC endpoints, CDN for public egress, compress and batch, keep chatty services in one zone where availability allows.' },
      { f: 'Idle non-production', detect: 'Dev/staging cost flat across nights and weekends', fix: 'Schedules, ephemeral preview environments with TTLs, scale-to-zero.' },
      { f: 'Unbounded log and storage growth', detect: 'Storage GB growing faster than users; old objects never read', fix: 'Retention and lifecycle rules, sampling of debug logs, cold tiers, delete orphaned volumes and snapshots.' },
      { f: 'Spot without interruption handling', detect: 'Errors or lost jobs correlated with spot reclaim events', fix: 'Handle the 2-minute notice, checkpoint, diversify instance types and zones, PodDisruptionBudgets, on-demand floor.' },
      { f: 'Cost cop culture', detect: 'Engineers route around the FinOps team; tickets to approve every instance', fix: 'Give teams data, budgets and alerts; central team owns rates and tooling, teams own usage.' }
    ],

    interview: [
      { q: 'What is FinOps, and what are its phases?', a: '<p>The FinOps Foundation defines FinOps as an operational framework and cultural practice that maximises the business value of cloud through <b>timely, data-driven decisions</b> and shared financial accountability between engineering, finance and business teams.</p><p>Its lifecycle has three phases run as a loop: <b>Inform</b> (visibility, allocation, unit metrics, forecasts), <b>Optimize</b> (rates: commitments, spot; usage: rightsizing, scheduling, architecture) and <b>Operate</b> (policies, budgets, anomaly response, cadence). Common misreading: FinOps is not "cutting cost"; spending more is fine if unit cost and value are right.</p>', lvl: 'core' },
      { q: 'Showback vs chargeback: which would you start with?', a: '<p><b>Showback</b> reports each team\'s allocated cost; <b>chargeback</b> moves it into their budget. Start with showback: allocation needs to be accurate and shared-cost rules agreed before money moves, or every meeting becomes a dispute about the numbers.</p><p>Move to chargeback once ≥ 90–95% of spend is allocated and trusted, and when teams have the authority to change what they are charged for.</p>', lvl: 'core' },
      { q: 'How do you allocate the cost of a shared Kubernetes cluster to teams?', a: '<ul><li>Namespace per team/service with labels matching your tag keys.</li><li>Split node cost by <b>max(requests, usage)</b> of CPU and memory per pod; requests are what blocks capacity.</li><li>Idle cluster capacity: either spread proportionally or show it as a separate "platform overhead" line owned by the platform team (better: it creates pressure to bin-pack).</li><li>Shared add-ons (ingress, monitoring) by a documented % rule. Version the rules.</li></ul>', fu: 'What about a shared database? (Split by query time or connection share from its own metrics, or give tenants separate schemas/instances if large.)', lvl: 'deep' },
      { q: 'Explain RIs, Savings Plans and committed use discounts. How much would you commit?', a: '<p>All trade a 1- or 3-year commitment for a lower rate. <b>Reserved Instances</b> (AWS, 2009) commit to an instance configuration; <b>Savings Plans</b> (2019) commit to $/hour of compute, Compute SPs flexible across families, regions, Fargate and Lambda; GCP <b>CUDs</b> commit to resources or spend.</p><p>Commit to the <b>floor</b> of 30–90 days of usage after rightsizing, typically 70–90% of that floor (rule of thumb), in staggered tranches. Track <b>utilisation</b> (are we using what we bought?) and <b>coverage</b> (how much usage is discounted?).</p>', lvl: 'core' },
      { q: 'When is serverless cheaper than containers?', a: '<p>Serverless bills per request and duration, so cost is proportional to traffic and <b>idle costs nothing</b>. Containers or VMs bill per provisioned hour, so you pay for idle, but the price per unit of work at high utilisation is lower.</p><p>Break-even: serverless cost = requests × (duration × memory × price + per-request fee); container cost = instances × hourly price ÷ utilisation. Spiky, low or unpredictable traffic favours serverless; steady high load favours containers. Include people cost: serverless removes cluster operations. Prime Video\'s monitoring case (2023) shows a high-volume workload moving off a serverless workflow for cost.</p>', fu: 'How would you model it? (Requests per month, average duration and memory, vs instance count at target utilisation.)', lvl: 'deep' },
      { q: 'What are the common data transfer traps?', a: '<ul><li><b>Internet egress</b> is billed per GB; ingress usually is not. Use a CDN and compression.</li><li><b>Cross-AZ</b> traffic inside a region is charged on AWS in each direction, so chatty services across zones add up. Use zone-aware routing where availability allows.</li><li><b>NAT gateways</b> charge per GB processed: use VPC endpoints for object storage and registries.</li><li><b>Cross-region</b> replication and multi-cloud designs pay egress on every copy.</li></ul><p>Model data transfer in the design review, not after the bill.</p>', lvl: 'core' },
      { q: 'How do you compare managed vs self-hosted (e.g. managed Postgres vs Postgres on VMs)?', a: '<p>TCO, not list price: self-hosted saves the managed premium but adds <b>people cost</b> (on-call, patching, backups, failover testing, upgrades) and risk. A managed service that costs more in infrastructure is often cheaper once 0.5–1 FTE of operations is counted. Self-host when scale makes the premium larger than the team, or when you need control the service does not give. See <a href="build-vs-buy.html">Build vs Buy</a>.</p>', lvl: 'core' },
      { q: 'What does "cost as an architecture fitness function" mean in practice?', a: '<p>A fitness function is an automated check that a quality attribute stays within target. For cost: a CI step estimates the cost delta of an infrastructure change (e.g. from Terraform plans), and a scheduled job checks <b>unit cost per 1M requests</b> against a budget; a breach fails the build or opens a ticket for the owner. Vogels\' first Frugal Architect law, "make cost a non-functional requirement", is the same idea.</p>', lvl: 'deep' },
      { q: 'Design for cost: name five patterns that reduce cost without hurting users.', a: '<ul><li><b>Caching</b> (CDN, read-through cache) removes repeated compute and egress.</li><li><b>Batching and async</b>: queue work and process in bulk at off-peak, on spot.</li><li><b>Autoscaling</b> with a committed floor and on-demand/spot burst.</li><li><b>Storage lifecycle</b>: hot → infrequent → archive; retention on logs.</li><li><b>Locality</b>: keep chatty services and their data in the same zone; compress payloads.</li><li><b>Graceful degradation</b>: lower-fidelity results under load instead of buying peak capacity.</li></ul>', lvl: 'core' },
      { q: 'The bill jumped 30% this month. Walk me through your response.', a: '<ol><li>Check whether it is <b>expected</b>: traffic growth, a launch? Compare unit cost, not total.</li><li>Break down by service, usage type, account, tag: anomaly detection usually names the driver.</li><li>Find the owner via allocation; ask what changed (deploy history).</li><li>Fix the root cause (a missing lifecycle rule, a debug log level, cross-AZ traffic), then add an alert or fitness function so it cannot recur silently.</li><li>Write it up: what it cost, how long it went unseen, and the detection improvement.</li></ol>', lvl: 'core' },
      { q: 'Tell me about a time you reduced cloud cost significantly.', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Our platform\'s AWS bill grew 45% in two quarters while traffic grew 15%; finance asked for a 20% cut. <b>T:</b> As the lead architect I had to cut cost without slowing the roadmap. <b>A:</b> I first built showback by team with cost per 1M requests, which showed three drivers: staging running 24/7, a search cluster sized for peak, and cross-AZ traffic between two services. Teams scheduled non-prod, the search team added autoscaling and rightsized, and we made the chatty pair zone-aware. Only after that did we buy a Compute Savings Plan for the new floor. <b>R:</b> The monthly bill fell 31% in three months, unit cost fell 38%, and it stayed down because unit cost became a reviewed metric.', lvl: 'deep' },
      { q: 'How would you convince engineering teams to care about cost?', a: '<em>Sample story with illustrative numbers. Swap in your own experience.</em><br><b>S:</b> Engineers saw cost reviews as finance policing. <b>T:</b> Make cost an engineering metric without adding approval gates. <b>A:</b> Put each team\'s unit cost on the same dashboard as latency; ran a monthly 30-minute review where teams presented one saving they chose; celebrated savings in engineering all-hands; gave anomaly alerts to teams directly. <b>R:</b> Within two quarters, 9 of 12 teams had shipped at least one cost change on their own initiative, and allocated spend reached 96%.', lvl: 'deep' }
    ],

    code: [
      {
        title: 'Terraform: team budget with forecast alert + cost anomaly monitor (AWS)', lang: 'bash',
        code: `# Terraform (AWS provider 5.x). One budget per team via the cost-allocation tag "team".
resource "aws_budgets_budget" "checkout" {
  name         = "team-checkout-monthly"
  budget_type  = "COST"
  limit_amount = "45000"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:team\$checkout"]          # tag must be activated for cost allocation
  }

  notification {                              # alert on the FORECAST, before it happens
    comparison_operator        = "GREATER_THAN"
    threshold                  = 90
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = ["checkout-oncall@example.com"]
  }
}

resource "aws_ce_anomaly_monitor" "by_service" {
  name              = "per-service-anomalies"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_subscription" "daily" {
  name             = "finops-daily"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.by_service.arn]

  subscriber {
    type    = "EMAIL"
    address = "finops@example.com"
  }

  threshold_expression {                      # only anomalies with >= $200 impact
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = ["200"]
    }
  }
}`,
        note: 'Forecast-based alerts give a warning in the middle of the month, not after it. Route anomaly alerts to the owning team (SNS → chat) once allocation is good; email to a central inbox is the starting point.'
      },
      {
        title: 'Python: cost per tenant and per 1M requests from a FOCUS-style export', lang: 'python',
        code: `# Python 3.11+, pandas 2.x. focus.csv: FOCUS columns; usage.csv: day, tenant_id, requests
import json
import pandas as pd

cost = pd.read_csv("focus.csv", parse_dates=["ChargePeriodStart"])
cost = cost[cost["ChargeCategory"] == "Usage"]          # skip purchases/tax: use amortised EffectiveCost
cost["day"] = cost["ChargePeriodStart"].dt.date
tags = pd.json_normalize(cost["Tags"].map(json.loads)).add_prefix("tag_")
cost = pd.concat([cost.reset_index(drop=True), tags], axis=1)

usage = pd.read_csv("usage.csv", parse_dates=["day"])
usage["day"] = usage["day"].dt.date

# 1) Direct cost: resources dedicated to one tenant carry a tenant tag
direct = (cost.dropna(subset=["tag_tenant"])
              .groupby(["day", "tag_tenant"])["EffectiveCost"].sum()
              .rename("direct").reset_index().rename(columns={"tag_tenant": "tenant_id"}))

# 2) Shared cost (tag_tenant missing): split by each tenant's share of requests that day
shared = cost[cost["tag_tenant"].isna()].groupby("day")["EffectiveCost"].sum().rename("shared_pool")
usage["share"] = usage["requests"] / usage.groupby("day")["requests"].transform("sum")
alloc = usage.join(shared, on="day")
alloc["shared"] = alloc["share"] * alloc["shared_pool"]

out = alloc.merge(direct, on=["day", "tenant_id"], how="left").fillna({"direct": 0.0})
out["cost"] = out["direct"] + out["shared"]
monthly = out.groupby("tenant_id").agg(cost=("cost", "sum"), requests=("requests", "sum"))
monthly["usd_per_1m_req"] = monthly["cost"] / monthly["requests"] * 1_000_000
print(monthly.sort_values("cost", ascending=False).head(10).round(2))`,
        note: 'The split basis for shared cost is a policy choice (requests, CPU-seconds, storage GB); store it as a versioned rule. Check that direct + shared equals the total so no cost silently disappears.'
      },
      {
        title: 'Java 21 / Spring Boot 3: tag requests by tenant for unit cost', lang: 'java',
        code: `// Adds a low-cardinality "tenant_tier" and a bounded "tenant" tag to the standard
// http.server.requests metric, plus a CPU-time counter used as a cost split basis.
@Configuration
class TenantMetricsConfig {

  @Bean
  ServerRequestObservationConvention tenantConvention(TenantRegistry tenants) {
    return new DefaultServerRequestObservationConvention() {
      @Override
      public KeyValues getLowCardinalityKeyValues(ServerRequestObservationContext ctx) {
        String id = ctx.getCarrier().getHeader("X-Tenant-Id");
        // Only top tenants get their own tag; the long tail is grouped to bound cardinality.
        String tag = tenants.isTracked(id) ? id : "other";
        return super.getLowCardinalityKeyValues(ctx)
            .and("tenant", tag)
            .and("tenant_tier", tenants.tierOf(id));
      }
    };
  }
}

@Component
class CpuCostFilter extends OncePerRequestFilter {
  private final MeterRegistry registry;
  private final ThreadMXBean mx = ManagementFactory.getThreadMXBean();
  CpuCostFilter(MeterRegistry registry) { this.registry = registry; }

  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    long start = mx.getCurrentThreadCpuTime();
    try { chain.doFilter(req, res); }
    finally {
      long cpuNanos = mx.getCurrentThreadCpuTime() - start;
      String tenant = Objects.requireNonNullElse(req.getHeader("X-Tenant-Id"), "unknown");
      registry.counter("app.cpu.seconds", "tenant", TenantRegistry.bucket(tenant))
              .increment(cpuNanos / 1e9);
    }
  }
}`,
        note: 'Never put an unbounded tenant ID on metrics: the time-series cost of high cardinality can exceed the savings. Track top tenants individually and bucket the rest; export per-tenant detail through logs or the warehouse instead. Thread CPU time misses async work, so treat it as an approximation.'
      }
    ],

    related: ['build-vs-buy', 'okrs-to-nfrs', 'scalability-laws', 'multi-tenancy', 'sd:cdn', 'sd:llm-gateway', 'sd:object-storage']
  });
})();
