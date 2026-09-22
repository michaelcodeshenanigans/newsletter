import { createHash } from 'node:crypto';

const SITE_URL = 'https://michaelcodeshenanigans.github.io/newsletter';
const STATUS_VALUES = new Set(['ga', 'preview', 'limited', 'open_source', 'announced_dated', 'announced_undated', 'unconfirmed']);
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
const EFFORT_VALUES = new Set(['low', 'medium', 'high']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function assertString(value, field, min = 1) {
  assert(typeof value === 'string' && value.trim().length >= min, `${field} must be a string of at least ${min} characters`);
}

function assertCitationIds(ids, declared, field) {
  assert(Array.isArray(ids) && ids.length > 0, `${field} must contain citation IDs`);
  for (const id of ids) {
    assert(declared.has(id), `${field} references undeclared citation ${id}`);
  }
}

export function validateIssue(issue) {
  assert(issue && typeof issue === 'object' && !Array.isArray(issue), 'issue must be an object');
  assert(issue.schema_version === 'newsletter.v1', 'schema_version must be newsletter.v1');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(issue.issue_id || ''), 'issue_id must use YYYY-MM-DD');
  assert(Number.isInteger(issue.revision) && issue.revision >= 1, 'revision must be a positive integer');
  assert(!Number.isNaN(Date.parse(issue.generated_at)), 'generated_at must be an ISO date-time');
  assert(issue.timezone === 'Asia/Jerusalem', 'timezone must be Asia/Jerusalem');
  assert(issue.coverage && isDate(issue.coverage.start) && isDate(issue.coverage.end), 'coverage must contain valid start and end dates');
  assert(issue.coverage.start <= issue.coverage.end, 'coverage start must not be after coverage end');
  assert(issue.issue_id === issue.coverage.end, 'issue_id must equal coverage end');
  assertString(issue.title, 'title', 10);
  assertString(issue.summary, 'summary', 40);
  assertString(issue.telegram_text, 'telegram_text', 200);

  assert(Array.isArray(issue.citations) && issue.citations.length >= 3, 'citations must contain at least 3 entries');
  const declared = new Set();
  for (const [index, citation] of issue.citations.entries()) {
    const field = `citations[${index}]`;
    assert(/^src-\d{2,3}$/.test(citation.id || ''), `${field}.id is invalid`);
    assert(!declared.has(citation.id), `${field}.id is duplicated`);
    declared.add(citation.id);
    assertString(citation.title, `${field}.title`, 3);
    assertString(citation.publisher, `${field}.publisher`, 2);
    assert(isHttpsUrl(citation.url), `${field}.url must be HTTPS`);
    assert(citation.published_at === null || isDate(citation.published_at), `${field}.published_at must be a date or null`);
  }

  assert(Array.isArray(issue.developments) && issue.developments.length >= 3 && issue.developments.length <= 6, 'developments must contain 3 to 6 entries');
  for (const [index, item] of issue.developments.entries()) {
    const field = `developments[${index}]`;
    assertString(item.id, `${field}.id`);
    assertString(item.title, `${field}.title`, 8);
    assert(STATUS_VALUES.has(item.status), `${field}.status is invalid`);
    assert(isDate(item.event_date), `${field}.event_date must be a date`);
    assert(item.event_date >= issue.coverage.start && item.event_date <= issue.coverage.end, `${field}.event_date is outside coverage`);
    for (const key of ['what_changed', 'why_it_matters', 'platform_impact', 'recommended_action', 'watchouts']) {
      assertString(item[key], `${field}.${key}`, key === 'watchouts' ? 5 : 10);
    }
    assert(CONFIDENCE_VALUES.has(item.confidence), `${field}.confidence is invalid`);
    assert(Number.isInteger(item.score) && item.score >= 0 && item.score <= 21, `${field}.score must be 0 to 21`);
    assertCitationIds(item.citation_ids, declared, `${field}.citation_ids`);
  }

  assert(Array.isArray(issue.devops_impacts) && issue.devops_impacts.length >= 2, 'devops_impacts must contain at least 2 entries');
  for (const [index, item] of issue.devops_impacts.entries()) {
    assertString(item.area, `devops_impacts[${index}].area`);
    assertString(item.text, `devops_impacts[${index}].text`, 20);
    assertCitationIds(item.citation_ids, declared, `devops_impacts[${index}].citation_ids`);
  }

  assert(Array.isArray(issue.bring_to_work) && issue.bring_to_work.length >= 2, 'bring_to_work must contain at least 2 entries');
  for (const [index, item] of issue.bring_to_work.entries()) {
    for (const key of ['title', 'what', 'fit', 'next_step']) assertString(item[key], `bring_to_work[${index}].${key}`, key === 'title' ? 4 : 10);
    assert(EFFORT_VALUES.has(item.effort), `bring_to_work[${index}].effort is invalid`);
    assertCitationIds(item.citation_ids, declared, `bring_to_work[${index}].citation_ids`);
  }

  assert(Array.isArray(issue.watchouts) && issue.watchouts.length >= 1, 'watchouts must contain at least 1 entry');
  for (const [index, item] of issue.watchouts.entries()) {
    assertString(item.text, `watchouts[${index}].text`, 10);
    assertCitationIds(item.citation_ids, declared, `watchouts[${index}].citation_ids`);
  }

  return issue;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function citationLinks(ids, citations) {
  const byId = new Map(citations.map((source) => [source.id, source]));
  return ids.map((id) => `[${id}](${byId.get(id).url})`).join(' ');
}

function renderMarkdown(issue) {
  const lines = [
    '---',
    `title: "${issue.title.replaceAll('"', '\\"')}"`,
    `date: ${issue.generated_at}`,
    `issue_id: ${issue.issue_id}`,
    `revision: ${issue.revision}`,
    '---',
    '',
    `# ${issue.title}`,
    '',
    `_${issue.coverage.start} through ${issue.coverage.end} · Revision ${issue.revision}_`,
    '',
    issue.summary,
    '',
    '## What changed',
    '',
  ];
  for (const item of issue.developments) {
    lines.push(`### ${item.title}`);
    lines.push('');
    lines.push(`**Status:** ${item.status.replaceAll('_', ' ')} · **Event date:** ${item.event_date} · **Confidence:** ${item.confidence} · **Score:** ${item.score}/21`);
    lines.push('');
    lines.push(`**What changed:** ${item.what_changed}`);
    lines.push('');
    lines.push(`**Why it matters:** ${item.why_it_matters}`);
    lines.push('');
    lines.push(`**Platform impact:** ${item.platform_impact}`);
    lines.push('');
    lines.push(`**Recommended action:** ${item.recommended_action}`);
    lines.push('');
    lines.push(`**Watchouts:** ${item.watchouts}`);
    lines.push('');
    lines.push(`Sources: ${citationLinks(item.citation_ids, issue.citations)}`);
    lines.push('');
  }
  lines.push('## DevOps / platform impact', '');
  for (const item of issue.devops_impacts) lines.push(`- **${item.area}:** ${item.text} ${citationLinks(item.citation_ids, issue.citations)}`);
  lines.push('', '## Bring to work', '');
  for (const item of issue.bring_to_work) {
    lines.push(`### ${item.title}`);
    lines.push('');
    lines.push(`${item.what}`);
    lines.push('');
    lines.push(`- **Fit:** ${item.fit}`);
    lines.push(`- **Effort:** ${item.effort}`);
    lines.push(`- **Next step:** ${item.next_step}`);
    lines.push(`- **Sources:** ${citationLinks(item.citation_ids, issue.citations)}`);
    lines.push('');
  }
  lines.push('## Watchouts', '');
  for (const item of issue.watchouts) lines.push(`- ${item.text} ${citationLinks(item.citation_ids, issue.citations)}`);
  lines.push('', '## Sources', '');
  for (const source of issue.citations) {
    const date = source.published_at ? ` — ${source.published_at}` : '';
    lines.push(`- **${source.id}:** [${source.title}](${source.url}), ${source.publisher}${date} (${source.source_type})`);
  }
  lines.push('');
  return lines.join('\n');
}

function issueUrl(issueId) {
  return `${SITE_URL}/issues/${issueId}.html`;
}

function renderIndex(manifest) {
  const items = manifest.issues.map((issue) => `
      <article>
        <h2><a href="${escapeHtml(issueUrl(issue.issue_id))}">${escapeHtml(issue.title)}</a></h2>
        <p>${escapeHtml(issue.coverage.start)} through ${escapeHtml(issue.coverage.end)} · Revision ${issue.revision}</p>
      </article>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Weekly AI &amp; Agentic Systems Newsletter</title>
  <link rel="alternate" type="application/rss+xml" title="Newsletter RSS" href="${SITE_URL}/feed.xml">
  <style>body{max-width:52rem;margin:3rem auto;padding:0 1rem;font:18px/1.6 system-ui,sans-serif;color:#18202a}a{color:#0757a6}article{border-top:1px solid #d8dee8;padding:1rem 0}small{color:#566}</style>
</head>
<body>
  <header><h1>Weekly AI &amp; Agentic Systems Newsletter</h1><p>Source-grounded changes, operational implications, and practical evaluation candidates.</p></header>
  <main>${items || '<p>No issues have been published yet.</p>'}</main>
  <footer><small><a href="feed.xml">RSS feed</a> · <a href="https://github.com/michaelcodeshenanigans/newsletter">Source repository</a></small></footer>
</body>
</html>
`;
}

function renderRss(manifest) {
  const items = manifest.issues.slice(0, 20).map((issue) => `    <item>
      <title>${escapeHtml(issue.title)}</title>
      <link>${issueUrl(issue.issue_id)}</link>
      <guid isPermaLink="true">${issueUrl(issue.issue_id)}</guid>
      <pubDate>${new Date(issue.published_at).toUTCString()}</pubDate>
      <description>${escapeHtml(`Coverage ${issue.coverage.start} through ${issue.coverage.end}.`)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Weekly AI &amp; Agentic Systems Newsletter</title>
    <link>${SITE_URL}/</link>
    <description>Source-grounded AI and agentic systems intelligence.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function issueContentHash(issue) {
  return createHash('sha256').update(stableStringify(issue)).digest('hex');
}

export function buildPublicationFiles(issue, { existingManifest = { version: 1, issues: [] } } = {}) {
  validateIssue(issue);
  const manifest = existingManifest && Array.isArray(existingManifest.issues)
    ? structuredClone(existingManifest)
    : { version: 1, issues: [] };
  manifest.version = 1;
  const entry = {
    issue_id: issue.issue_id,
    revision: issue.revision,
    title: issue.title,
    coverage: issue.coverage,
    published_at: issue.generated_at,
    path: `issues/${issue.issue_id}.md`,
    content_hash: issueContentHash(issue),
  };
  manifest.issues = manifest.issues.filter((item) => item.issue_id !== issue.issue_id);
  manifest.issues.push(entry);
  manifest.issues.sort((a, b) => b.issue_id.localeCompare(a.issue_id));

  return [
    { path: entry.path, content: renderMarkdown(issue) },
    { path: `artifacts/${issue.issue_id}.v${issue.revision}.json`, content: `${JSON.stringify(issue, null, 2)}\n` },
    { path: 'issues/manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: 'index.html', content: renderIndex(manifest) },
    { path: 'feed.xml', content: renderRss(manifest) },
  ];
}
