export function validIssue(overrides = {}) {
  return {
    schema_version: 'newsletter.v1',
    issue_id: '2026-09-22',
    revision: 1,
    generated_at: '2026-09-22T18:00:00+03:00',
    timezone: 'Asia/Jerusalem',
    coverage: { start: '2026-09-16', end: '2026-09-22' },
    title: 'Weekly AI & Agentic Systems Digest — September 16–22, 2026',
    summary: 'A source-grounded dry-run issue covering material changes in agentic systems and their operational implications.',
    developments: [1, 2, 3].map((n) => ({
      id: `development-${n}`,
      title: `Material development number ${n}`,
      status: 'ga',
      event_date: '2026-09-20',
      availability: 'Generally available.',
      what_changed: 'A material capability changed and was documented by the primary publisher.',
      why_it_matters: 'The change affects how engineering teams design and operate agentic systems.',
      platform_impact: 'Teams should evaluate deployment, observability, security, and cost implications.',
      recommended_action: 'Run a bounded technical evaluation before adoption.',
      watchouts: 'Validate regional availability and production limits.',
      confidence: 'high',
      score: 17,
      citation_ids: [`src-0${n}`],
    })),
    devops_impacts: [
      { area: 'observability', text: 'Add explicit traces and evaluation gates before enabling the capability in production.', citation_ids: ['src-01'] },
      { area: 'security', text: 'Review permissions and data boundaries before agents receive additional tool access.', citation_ids: ['src-02'] },
    ],
    bring_to_work: [
      { title: 'Bounded evaluation', what: 'Evaluate the capability with representative workloads.', fit: 'Use it beside an AWS Bedrock agent workflow.', effort: 'medium', next_step: 'Create a non-production proof of concept with explicit success criteria.', citation_ids: ['src-01'] },
      { title: 'Operational review', what: 'Review runtime and observability changes.', fit: 'Map the change to current Bedrock deployment controls.', effort: 'low', next_step: 'Document required alerts, permissions, and rollback controls.', citation_ids: ['src-02'] },
    ],
    watchouts: [
      { text: 'Confirm availability, pricing, limits, and data handling before production use.', citation_ids: ['src-03'] },
    ],
    citations: [1, 2, 3].map((n) => ({
      id: `src-0${n}`,
      title: `Primary source ${n}`,
      publisher: 'Example Publisher',
      url: `https://example.com/source-${n}`,
      published_at: '2026-09-20',
      source_type: 'primary',
    })),
    telegram_text: 'Weekly AI & Agentic Systems Digest\n\nA sufficiently detailed Telegram edition with source links and practical implications. '.repeat(3),
    ...overrides,
  };
}
